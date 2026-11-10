import { expect, test } from "vite-plus/test";
import { createRequestFetch, resetCoordinator } from "../src/plugin.ts";
import type { FetchLike } from "../src/univibe-api.ts";
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

function auth(): StoredAuth {
  return {
    type: "api",
    key: "sk-test",
    metadata: {
      phone: "13800000000",
      password: "password",
      token: "fixture",
      user: { id: 42, nickname: "****0042" },
    },
  };
}

const CLIENT = {
  auth: {
    async set() {
      return undefined;
    },
  },
};

test("a credit-exhausted model response resets once and replays the request", async () => {
  let modelCalls = 0;
  let resetCalls = 0;
  let resetDone = false;
  const fetchImpl: FetchLike = async (input, init) => {
    const url = urlOf(input);
    if (url === "https://api.univibe.cc/openai/v1/responses") {
      modelCalls += 1;
      if (modelCalls === 1) {
        return json({ error: { message: "insufficient credits" } }, 429);
      }
      expect(init?.body).toBe('{"model":"gpt-6.1-sol"}');
      return json({ ok: true });
    }
    if (url.endsWith("/api/credits")) {
      return json({
        ...CREDITS,
        current_credits: resetDone ? "54000" : "0",
        last_reset_date: resetDone ? "2026-11-10T04:00:00Z" : "2026-11-08T16:00:00Z",
      });
    }
    if (url.endsWith("/api/credits/reset")) {
      resetCalls += 1;
      resetDone = true;
      return json({ message: "重置成功" });
    }
    return json({ message: "unexpected request" }, 500);
  };
  const dependencies = {
    client: CLIENT,
    fetchImpl,
    now: () => Date.parse("2026-11-10T12:00:00+08:00"),
  };
  const requestFetch = createRequestFetch(
    async () => auth(),
    dependencies,
    resetCoordinator(dependencies),
  );

  const response = await requestFetch("https://api.univibe.cc/openai/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"model":"gpt-6.1-sol"}',
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(modelCalls).toBe(2);
  expect(resetCalls).toBe(1);
});

test("an account already reset today keeps the original upstream error", async () => {
  let resetCalls = 0;
  let modelCalls = 0;
  const fetchImpl: FetchLike = async (input) => {
    const url = urlOf(input);
    if (url === "https://api.univibe.cc/openai/v1/responses") {
      modelCalls += 1;
      return json({ error: { message: "积分已耗尽" } }, 429);
    }
    if (url.endsWith("/api/credits")) {
      return json({ ...CREDITS, current_credits: "0" });
    }
    if (url.endsWith("/api/credits/reset")) {
      resetCalls += 1;
      return json({ message: "unexpected reset" });
    }
    return json({ message: "unexpected request" }, 500);
  };
  const dependencies = {
    client: CLIENT,
    fetchImpl,
    now: () => Date.parse("2026-11-10T12:00:00+08:00"),
  };
  const requestFetch = createRequestFetch(
    async () => auth(),
    dependencies,
    resetCoordinator(dependencies),
  );

  const response = await requestFetch("https://api.univibe.cc/openai/v1/responses", {
    method: "POST",
    body: "{}",
  });

  expect(response.status).toBe(429);
  expect(await response.json()).toEqual({ error: { message: "积分已耗尽" } });
  expect(modelCalls).toBe(1);
  expect(resetCalls).toBe(0);
});
