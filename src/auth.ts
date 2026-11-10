import {
  fetchCreditDetail,
  fetchCredits,
  loginWebsite,
  UnivibeHttpError,
  type FetchLike,
} from "./univibe-api.ts";
import {
  PROVIDER_ID,
  type AuthStoreClient,
  type CreditDetail,
  type CreditSummary,
  type StoredAuth,
  type UnivibeUser,
} from "./types.ts";

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

export interface AuthDependencies {
  client: AuthStoreClient;
  fetchImpl: FetchLike;
}

export interface LoadedCredits {
  auth: StoredAuth;
  credits: CreditSummary;
  token: string;
}

export interface LoadedCreditData extends LoadedCredits {
  detail: CreditDetail;
}

export function apiKeyOf(auth: StoredAuth | undefined): string {
  return auth?.type === "api" && typeof auth.key === "string" ? auth.key.trim() : "";
}

function credentialsOf(auth: StoredAuth | undefined): {
  phone: string;
  password: string;
} {
  return {
    phone: typeof auth?.metadata?.phone === "string" ? auth.metadata.phone.trim() : "",
    password: typeof auth?.metadata?.password === "string" ? auth.metadata.password : "",
  };
}

function tokenOf(auth: StoredAuth | undefined): string {
  return typeof auth?.metadata?.token === "string" ? auth.metadata.token.trim() : "";
}

async function persistAuth(
  auth: StoredAuth,
  client: AuthStoreClient,
  token: string,
  user: UnivibeUser | undefined,
): Promise<StoredAuth> {
  const next: StoredAuth = {
    ...auth,
    metadata: {
      ...auth.metadata,
      token,
      user: user ?? auth.metadata?.user,
    },
  };
  try {
    await client.auth.set({ path: { id: PROVIDER_ID }, body: next });
  } catch {
    return next;
  }
  return next;
}

async function loginFromAuth(
  auth: StoredAuth,
  dependencies: AuthDependencies,
): Promise<StoredAuth> {
  const { phone, password } = credentialsOf(auth);
  if (!phone || !password) {
    throw new AuthConfigurationError(
      "需要 Univibe 手机号和密码才能读取积分；请在 Magpie 中重新登录 Univibe。",
    );
  }
  const result = await loginWebsite(phone, password, dependencies.fetchImpl);
  return persistAuth(auth, dependencies.client, result.token, result.user);
}

async function loadWithToken(
  auth: StoredAuth,
  token: string,
  dependencies: AuthDependencies,
): Promise<LoadedCredits> {
  if (!token) return loginAndLoad(auth, dependencies);
  try {
    return {
      auth,
      token,
      credits: await fetchCredits(token, dependencies.fetchImpl),
    };
  } catch (error) {
    if (!(error instanceof UnivibeHttpError) || !error.unauthorized) throw error;
    return loginAndLoad(auth, dependencies);
  }
}

async function loginAndLoad(
  auth: StoredAuth,
  dependencies: AuthDependencies,
): Promise<LoadedCredits> {
  const refreshed = await loginFromAuth(auth, dependencies);
  const token = tokenOf(refreshed);
  if (!token) throw new AuthConfigurationError("Univibe 登录未返回可用的网页令牌");
  return {
    auth: refreshed,
    token,
    credits: await fetchCredits(token, dependencies.fetchImpl),
  };
}

export async function loadCredits(
  auth: StoredAuth | undefined,
  dependencies: AuthDependencies,
): Promise<LoadedCredits> {
  if (!auth?.type) {
    throw new AuthConfigurationError("尚未登录 Univibe");
  }
  if (!apiKeyOf(auth)) {
    throw new AuthConfigurationError("Univibe 登录信息中没有 API Key");
  }
  return loadWithToken(auth, tokenOf(auth), dependencies);
}

export async function loadCreditData(
  auth: StoredAuth | undefined,
  dependencies: AuthDependencies,
): Promise<LoadedCreditData> {
  const loaded = await loadCredits(auth, dependencies);
  const detail = await fetchCreditDetail(loaded.token, dependencies.fetchImpl);
  return { ...loaded, detail };
}

export function accountIdentity(auth: StoredAuth | undefined): string {
  if (!auth) return "anonymous";
  const user = auth.metadata?.user;
  return String(
    user?.id ??
      auth.metadata?.phone ??
      auth.metadata?.user?.email ??
      apiKeyOf(auth).slice(-8) ??
      "unknown",
  );
}
