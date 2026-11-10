import { expect, test } from "vite-plus/test";
import { buildUsage } from "../src/credits.ts";
import {
  dynamicModels,
  fallbackConfigModels,
  protocolForModel,
  providerModel,
} from "../src/models.ts";
import { CREDITS, DETAIL, MODEL_IDS } from "./fixtures.ts";

test("usage exposes current credits, hourly recovery, and Claude weekly use", () => {
  const usage = buildUsage(CREDITS, DETAIL, Date.parse("2026-11-11T15:55:00Z"), "****8682");
  expect(usage.plan).toBe("Univibe Air Ultra");
  expect(usage.user).toBe("****8682");
  expect(usage.windows?.map((window) => window.name)).toEqual([
    "当前积分",
    "每小时恢复",
    "Claude 每周额度",
  ]);
  expect(usage.windows?.[0]).toMatchObject({
    display: "47,211.17 / 54,000 可用",
    limit: 54_000,
    resetsAt: "2026-11-11T15:55:00.000Z",
  });
  expect(usage.windows?.[1]).toMatchObject({
    balance: 1_500,
    aside: true,
    resetsAt: "2026-11-10T05:00:30.000Z",
  });
  expect(usage.windows?.[2]).toMatchObject({
    model: "claude",
    resetsAt: "2026-11-16T08:41:05.000Z",
  });
});

test("models route to the native Anthropic, Responses, and Gemini protocols", () => {
  expect(protocolForModel("claude-sonnet-5-5")).toBe("anthropic");
  expect(protocolForModel("gpt-6.1-sol")).toBe("openai");
  expect(protocolForModel("codex-auto-review")).toBe("openai");
  expect(protocolForModel("gemini-3.1-pro-preview")).toBe("google");
  expect(providerModel("claude-opus-5", "univibe").api).toEqual({
    id: "claude-opus-5",
    npm: "@ai-sdk/anthropic",
    url: "https://api.univibe.cc/anthropic/v1",
  });
  expect(providerModel("gemini-3-pro-preview", "univibe").api).toEqual({
    id: "gemini-3-pro-preview",
    npm: "@ai-sdk/google",
    url: "https://api.univibe.cc/gemini/v1beta",
  });
});

test("dynamic discovery includes every advertised model", () => {
  const models = dynamicModels(
    MODEL_IDS.map((id) => ({ id, created: 1_794_283_379 })),
    { id: "univibe", models: fallbackConfigModels() },
  );
  expect(Object.keys(models)).toEqual([...MODEL_IDS]);
  expect(models["gpt-6.1-sol"]?.api.npm).toBe("@ai-sdk/openai");
  expect(models["gpt-6.1-sol"]?.api.url).toBe("https://api.univibe.cc/openai/v1");
});
