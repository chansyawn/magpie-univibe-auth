import {
  accountIdentity,
  apiKeyOf,
  AuthConfigurationError,
  loadCreditData,
  loadCredits,
  type LoadedCredits,
} from "./auth.ts";
import { buildUsage } from "./credits.ts";
import { dynamicModels, fallbackConfigModels } from "./models.ts";
import {
  classifyResetFailure,
  dailyResetEligibility,
  exhaustionSignal,
  exhaustedResetEligibility,
  type ExhaustionSignal,
  type ResetEligibility,
} from "./reset.ts";
import { canReplayBody, createKeyedSingleFlight, replayHeaders } from "./session.ts";
import { nextBeijingReset, nextCreditReset } from "./time.ts";
import {
  fetchModels,
  loginWebsite,
  resetCredits,
  OPENAI_BASE_URL,
  UnivibeHttpError,
  type FetchLike,
} from "./univibe-api.ts";
import {
  PROVIDER_ID,
  type CheckinResult,
  type OpenCodeConfig,
  type PluginInput,
  type ProviderForModels,
  type StoredAuth,
  type UsageResult,
} from "./types.ts";

const PLUGIN_NAME = "Univibe";

export interface ResetDependencies {
  client: PluginInput["client"];
  fetchImpl: FetchLike;
  now: () => number;
}

function safeMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.slice(0, 500);
  return "Univibe 请求失败";
}

function untilAfterDailyReset(now: number): string {
  return new Date(nextBeijingReset(now)).toISOString();
}

function checkinFromEligibility(
  eligibility: Exclude<ResetEligibility, { kind: "ready" }>,
): CheckinResult {
  return {
    outcome: eligibility.kind,
    message: eligibility.message,
    until: eligibility.until,
  };
}

async function sendReset(
  loaded: LoadedCredits,
  eligibility: Extract<ResetEligibility, { kind: "ready" }>,
  dependencies: ResetDependencies,
): Promise<CheckinResult> {
  const now = dependencies.now();
  const until = untilAfterDailyReset(now);
  try {
    await resetCredits(loaded.token, dependencies.fetchImpl);
  } catch (error) {
    if (error instanceof UnivibeHttpError) {
      const classified = classifyResetFailure(error.message);
      return {
        outcome: classified.outcome,
        message: classified.message,
        until,
      };
    }
    throw error;
  }

  const after = await loadCredits(loaded.auth, dependencies).catch(() => undefined);
  const credit = after
    ? Math.max(0, Number(after.credits.current_credits) - eligibility.current)
    : undefined;
  return {
    outcome: "claimed",
    ...(credit !== undefined && Number.isFinite(credit) ? { credit } : {}),
    message: "Univibe 积分已补满",
    until,
  };
}

export function resetCoordinator(dependencies: ResetDependencies) {
  const operations = createKeyedSingleFlight<CheckinResult>();

  async function scheduled(auth: StoredAuth): Promise<CheckinResult> {
    return operations.run(accountIdentity(auth), async () => {
      const loaded = await loadCredits(auth, dependencies);
      const eligibility = dailyResetEligibility(loaded.credits, dependencies.now());
      if (eligibility.kind !== "ready") return checkinFromEligibility(eligibility);
      return sendReset(loaded, eligibility, dependencies);
    });
  }

  async function exhausted(
    auth: StoredAuth,
    signal: ExhaustionSignal,
  ): Promise<{ reset: boolean; result: CheckinResult }> {
    try {
      const result = await operations.run(accountIdentity(auth), async () => {
        const loaded = await loadCredits(auth, dependencies);
        const eligibility = exhaustedResetEligibility(loaded.credits, dependencies.now(), signal);
        if (eligibility.kind !== "ready") return checkinFromEligibility(eligibility);
        return sendReset(loaded, eligibility, dependencies);
      });
      return { reset: result.outcome === "claimed", result };
    } catch (error) {
      return {
        reset: false,
        result: {
          outcome: "failed",
          message: safeMessage(error),
        },
      };
    }
  }

  return { scheduled, exhausted };
}

async function responseHasExhaustionSignal(
  response: Response,
): Promise<ExhaustionSignal | undefined> {
  if (response.status !== 402 && response.status !== 403 && response.status !== 429) {
    return undefined;
  }
  const body = await response
    .clone()
    .text()
    .catch(() => "");
  return exhaustionSignal(response.status, body);
}

export function createRequestFetch(
  getAuth: () => Promise<StoredAuth | undefined>,
  dependencies: ResetDependencies,
  coordinator: ReturnType<typeof resetCoordinator>,
): FetchLike {
  return async (input, init = {}) => {
    const auth = await getAuth();
    if (!apiKeyOf(auth)) throw new Error("Univibe 尚未登录或缺少 API Key");

    const requestTemplate = input instanceof Request ? input.clone() : undefined;
    const response = await dependencies.fetchImpl(input, init);
    const signal = await responseHasExhaustionSignal(response);
    if (!signal || !canReplayBody(init.body) || !auth) return response;

    const reset = await coordinator.exhausted(auth, signal);
    if (!reset.reset) return response;

    await response.body?.cancel().catch(() => {});
    return dependencies.fetchImpl(requestTemplate ?? input, {
      ...init,
      headers: replayHeaders(init),
    });
  };
}

export async function UnivibeAuthPlugin(input: PluginInput) {
  const dependencies: ResetDependencies = {
    client: input.client,
    fetchImpl: fetch,
    now: Date.now,
  };
  const coordinator = resetCoordinator(dependencies);

  async function authMethodsAuthorize(inputs: Record<string, string> = {}): Promise<
    | {
        type: "success";
        metadata: {
          phone: string;
          password: string;
          token: string;
          user: Awaited<ReturnType<typeof loginWebsite>>["user"];
        };
      }
    | { type: "failed"; error: string }
  > {
    const phone = inputs.phone?.trim() ?? "";
    const password = inputs.password ?? "";
    if (!phone || !password) {
      return { type: "failed", error: "请输入 Univibe 手机号和密码" };
    }
    try {
      const login = await loginWebsite(phone, password, dependencies.fetchImpl);
      return {
        type: "success",
        metadata: {
          phone,
          password,
          token: login.token,
          user: login.user,
        },
      };
    } catch (error) {
      return { type: "failed", error: safeMessage(error) };
    }
  }

  return {
    config: async (config: OpenCodeConfig) => {
      config.provider ??= {};
      config.provider[PROVIDER_ID] ??= {};
      const provider = config.provider[PROVIDER_ID];
      provider.name ??= PLUGIN_NAME;
      provider.npm ??= "@ai-sdk/openai";
      provider.api ??= OPENAI_BASE_URL;
      provider.models = {
        ...fallbackConfigModels(),
        ...provider.models,
      };
    },
    provider: {
      id: PROVIDER_ID,
      async models(
        provider: ProviderForModels,
        context: { auth?: StoredAuth } = {},
      ): Promise<Record<string, unknown>> {
        const apiKey = apiKeyOf(context.auth);
        if (!apiKey) return provider.models;
        try {
          const live = await fetchModels(apiKey);
          return live.length > 0 ? dynamicModels(live, provider) : provider.models;
        } catch (error) {
          if (error instanceof UnivibeHttpError && error.unauthorized) {
            throw Object.assign(new Error("Univibe 拒绝了 API Key，请在 Magpie 中重新登录"), {
              signIn: "expired",
            });
          }
          return provider.models;
        }
      },
    },
    auth: {
      provider: PROVIDER_ID,
      methods: [
        {
          type: "api" as const,
          label: "Univibe API Key + 手机号/密码",
          placeholder: "在 Univibe 控制台 → API密钥 中创建",
          prompts: [
            {
              type: "text" as const,
              key: "phone",
              message: "Univibe 手机号",
              placeholder: "用于读取积分和自动重置",
              validate: (value: string) => (value.trim() ? undefined : "手机号不能为空"),
            },
            {
              type: "password" as const,
              key: "password",
              message: "Univibe 密码",
              validate: (value: string) => (value ? undefined : "密码不能为空"),
            },
          ],
          authorize: authMethodsAuthorize,
        },
      ],
      async loader(getAuth: () => Promise<StoredAuth | undefined>) {
        const auth = await getAuth();
        if (!apiKeyOf(auth)) return {};
        return {
          baseURL: "",
          apiKey: apiKeyOf(auth),
          fetch: createRequestFetch(getAuth, dependencies, coordinator),
        };
      },
      async usage(getAuth: () => Promise<StoredAuth | undefined>): Promise<UsageResult> {
        try {
          const auth = await getAuth();
          const loaded = await loadCreditData(auth, dependencies);
          const user = auth?.metadata?.user;
          return buildUsage(
            loaded.credits,
            loaded.detail,
            nextCreditReset(dependencies.now(), loaded.credits.last_reset_date),
            user?.nickname ?? user?.name ?? undefined,
          );
        } catch (error) {
          return {
            error: safeMessage(error),
            signIn: "kept",
          };
        }
      },
      async checkin(getAuth: () => Promise<StoredAuth | undefined>): Promise<CheckinResult> {
        const auth = await getAuth();
        if (!apiKeyOf(auth) || !auth) {
          return { outcome: "ineligible", message: "尚未登录 Univibe" };
        }
        try {
          return await coordinator.scheduled(auth);
        } catch (error) {
          if (error instanceof AuthConfigurationError || error instanceof UnivibeHttpError) {
            return { outcome: "failed", message: safeMessage(error) };
          }
          throw error;
        }
      },
      maxConcurrency: 4,
    },
  };
}
