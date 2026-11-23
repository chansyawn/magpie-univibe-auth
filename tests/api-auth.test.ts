import { expect, test, vi } from "vite-plus/test";
import { loadCredits } from "../src/auth.ts";
import { UnivibeAuthPlugin } from "../src/plugin.ts";
import type { FetchLike } from "../src/univibe-api.ts";
import { loginWebsite } from "../src/univibe-api.ts";
import type { StoredAuth } from "../src/types.ts";
import { CREDITS } from "./fixtures.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function urlOf(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : String(input);
}

test("website login parses a successful login envelope", async () => {
  const fetchImpl: FetchLike = async (input) => {
    expect(urlOf(input)).toBe("https://www.univibe.cc/api/auth/login");
    return json({
      message: "登录成功",
      user: {
        id: 42,
        name: "User_42",
        nickname: "****0042",
        phone: "13800000000",
        email: null,
      },
      token: "Bearer test-token",
    });
  };
  const result = await loginWebsite("13800000000", "password", fetchImpl);
  expect(result).toEqual({
    token: "test-token",
    user: {
      id: 42,
      name: "User_42",
      nickname: "****0042",
      phone: "13800000000",
      email: null,
    },
  });
});

test("Magpie can sign in with only the plugin's form answers", async () => {
  const mockFetch = vi.fn<FetchLike>().mockResolvedValue(json({ token: "web-token" }));
  vi.stubGlobal("fetch", mockFetch);
  try {
    const input = { client: { auth: { set: vi.fn() } }, magpie: {} };
    const { auth } = await UnivibeAuthPlugin(input);
    const [method] = auth.methods;
    expect(method?.prompts).toContainEqual(
      expect.objectContaining({ type: "password", key: "apiKey" }),
    );
    const credentials = { phone: "13800000000", password: "password" };
    expect(await method?.authorize(credentials)).toEqual({
      type: "failed",
      error: "请输入 Univibe API Key",
    });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(await method?.authorize({ ...credentials, apiKey: " sk-test " })).toEqual({
      type: "success",
      key: "sk-test",
      metadata: { ...credentials, token: "web-token" },
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://www.univibe.cc/api/auth/login",
      expect.objectContaining({ body: JSON.stringify(credentials) }),
    );
    const openCode = await UnivibeAuthPlugin({ client: input.client });
    expect(openCode.auth.methods[0]?.prompts.map(({ key }) => key)).toEqual(["phone", "password"]);
  } finally {
    vi.unstubAllGlobals();
  }
});

test("an expired website token logs in once and persists the replacement", async () => {
  const requests: string[] = [];
  const stored: StoredAuth[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    const url = urlOf(input);
    requests.push(url);
    if (url.endsWith("/api/auth/login")) {
      return json({ token: "new-token", user: { id: 42, nickname: "****0042" } });
    }
    if (url.endsWith("/api/credits")) {
      const authorization = new Headers(init?.headers).get("authorization");
      return authorization === "Bearer old" ? json({ message: "登录已失效" }, 401) : json(CREDITS);
    }
    return json({ message: "unexpected request" }, 500);
  };
  const auth: StoredAuth = {
    type: "api",
    key: "sk-test",
    metadata: {
      phone: "13800000000",
      password: "password",
      token: "old",
    },
  };
  const loaded = await loadCredits(auth, {
    fetchImpl,
    client: {
      auth: {
        async set({ body }) {
          stored.push(body as StoredAuth);
        },
      },
    },
  });
  expect(loaded.credits.current_credits).toBe(CREDITS.current_credits);
  expect(loaded.token).toBe("new-token");
  expect(stored).toHaveLength(1);
  expect(stored[0]?.metadata?.token).toBe("new-token");
  expect(requests.filter((url) => url.endsWith("/api/auth/login"))).toHaveLength(1);
});
