import type { CreditDetail, CreditSummary, LoginResult, UnivibeUser } from "./types.ts";

export const WEB_BASE_URL = "https://www.univibe.cc";
export const OPENAI_BASE_URL = "https://api.univibe.cc/openai/v1";
export const ANTHROPIC_BASE_URL = "https://api.univibe.cc/anthropic/v1";
export const GOOGLE_BASE_URL = "https://api.univibe.cc/gemini/v1beta";

const CONTROL_TIMEOUT_MS = 15_000;
const RESET_TIMEOUT_MS = 20_000;

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class UnivibeHttpError extends Error {
  readonly status: number;
  readonly unauthorized: boolean;

  constructor(message: string, status: number) {
    super(message);
    this.name = "UnivibeHttpError";
    this.status = status;
    this.unauthorized = status === 401 || status === 403;
  }
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordAt(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function stringAt(value: unknown, key: string): string | undefined {
  const candidate = recordAt(value, key);
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
}

function unwrapData<T>(body: unknown): T {
  if (isRecord(body) && "data" in body && body.data !== undefined) {
    return body.data as T;
  }
  return body as T;
}

function errorMessage(body: unknown, status: number): string {
  if (typeof body === "string" && body.trim()) return body.trim().slice(0, 500);
  if (!isRecord(body)) return `Univibe 返回 HTTP ${status}`;

  for (const key of ["message", "msg", "error", "detail"]) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 500);
    if (isRecord(value)) {
      const nested = stringAt(value, "message") ?? stringAt(value, "detail");
      if (nested) return nested.slice(0, 500);
    }
  }

  const errors = body.errors;
  if (Array.isArray(errors)) {
    const first = errors.find((item) => typeof item === "string");
    if (typeof first === "string" && first.trim()) return first.trim().slice(0, 500);
  }
  return `Univibe 返回 HTTP ${status}`;
}

async function responseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function controlRequest<T>(
  path: string,
  init: RequestInit,
  fetchImpl: FetchLike,
  timeoutMs = CONTROL_TIMEOUT_MS,
): Promise<T> {
  const response = await fetchImpl(`${WEB_BASE_URL}${path}`, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await responseBody(response);
  if (!response.ok) {
    throw new UnivibeHttpError(errorMessage(body, response.status), response.status);
  }
  return unwrapData<T>(body);
}

function bearer(token: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${token}`,
  };
}

export async function loginWebsite(
  phone: string,
  password: string,
  fetchImpl: FetchLike = fetch,
): Promise<LoginResult> {
  const body = await controlRequest<unknown>(
    "/api/auth/login",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ phone, password }),
    },
    fetchImpl,
  );

  const token =
    stringAt(body, "token") ??
    stringAt(body, "access_token") ??
    stringAt(recordAt(body, "data"), "token") ??
    stringAt(recordAt(body, "data"), "access_token");
  if (!token) throw new UnivibeHttpError("Univibe 登录成功，但响应中没有登录令牌", 502);

  const rawUser = recordAt(body, "user") ?? recordAt(recordAt(body, "data"), "user");
  const user: UnivibeUser | undefined = isRecord(rawUser)
    ? {
        id:
          typeof rawUser.id === "string" || typeof rawUser.id === "number" ? rawUser.id : undefined,
        name: typeof rawUser.name === "string" ? rawUser.name : null,
        nickname: typeof rawUser.nickname === "string" ? rawUser.nickname : null,
        phone: typeof rawUser.phone === "string" ? rawUser.phone : null,
        email: typeof rawUser.email === "string" ? rawUser.email : null,
      }
    : undefined;

  return { token: token.replace(/^Bearer\s+/i, ""), user };
}

export async function fetchCredits(
  token: string,
  fetchImpl: FetchLike = fetch,
): Promise<CreditSummary> {
  return controlRequest<CreditSummary>(
    "/api/credits",
    {
      headers: bearer(token),
    },
    fetchImpl,
  );
}

export async function fetchCreditDetail(
  token: string,
  fetchImpl: FetchLike = fetch,
): Promise<CreditDetail> {
  return controlRequest<CreditDetail>(
    "/api/credits/detail",
    {
      headers: bearer(token),
    },
    fetchImpl,
  );
}

export async function resetCredits(token: string, fetchImpl: FetchLike = fetch): Promise<unknown> {
  return controlRequest<unknown>(
    "/api/credits/reset",
    {
      method: "POST",
      headers: {
        ...bearer(token),
        "content-length": "0",
      },
    },
    fetchImpl,
    RESET_TIMEOUT_MS,
  );
}

export interface RemoteModel {
  id: string;
  created?: number;
}

export async function fetchModels(
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<RemoteModel[]> {
  const response = await fetchImpl(`${OPENAI_BASE_URL}/models`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
  });
  const body = await responseBody(response);
  if (!response.ok) {
    const error = new UnivibeHttpError(errorMessage(body, response.status), response.status);
    if (error.unauthorized) {
      Object.assign(error, { signIn: "expired" });
    }
    throw error;
  }

  const data = isRecord(body) && Array.isArray(body.data) ? body.data : [];
  return data.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id.trim()) return [];
    return [
      {
        id: item.id.trim(),
        created: typeof item.created === "number" ? item.created : undefined,
      },
    ];
  });
}
