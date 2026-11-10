import { expect, test } from "vite-plus/test";
import {
  beijingDateKey,
  nextBeijingReset,
  nextCreditReset,
  parseUnivibeTime,
  resetWasToday,
} from "../src/time.ts";
import {
  dailyResetEligibility,
  exhaustionSignal,
  exhaustedResetEligibility,
} from "../src/reset.ts";
import { CREDITS } from "./fixtures.ts";

const BEFORE_DUE = Date.parse("2026-11-10T12:00:00+08:00");
const AFTER_DUE = Date.parse("2026-11-10T23:56:00+08:00");

test("Univibe microseconds and Beijing dates are parsed correctly", () => {
  const resetAt = parseUnivibeTime("2026-11-09T16:00:00.000000Z");
  expect(resetAt).toBe(Date.parse("2026-11-09T16:00:00Z"));
  expect(beijingDateKey(resetAt)).toBe("2026-11-10");
  expect(resetWasToday("2026-11-09T16:00:00.000000Z", BEFORE_DUE)).toBe(true);
});

test("daily reset waits until 23:55 Beijing time", () => {
  const snapshot = { ...CREDITS, last_reset_date: "2026-11-08T16:00:00Z" };
  const eligibility = dailyResetEligibility(snapshot, BEFORE_DUE);
  expect(eligibility).toMatchObject({
    kind: "inactive",
    until: "2026-11-10T15:55:00.000Z",
  });
  expect(dailyResetEligibility(snapshot, AFTER_DUE)).toMatchObject({ kind: "ready" });
});

test("an account already reset today is never eligible again that day", () => {
  expect(dailyResetEligibility(CREDITS, BEFORE_DUE)).toMatchObject({
    kind: "done",
    until: "2026-11-11T15:55:00.000Z",
  });
  expect(dailyResetEligibility(CREDITS, AFTER_DUE)).toMatchObject({ kind: "done" });
  expect(nextCreditReset(BEFORE_DUE, CREDITS.last_reset_date)).toBe(
    Date.parse("2026-11-11T15:55:00Z"),
  );
});

test("no reset occurs before 23:55 unless credits are exhausted", () => {
  const empty = {
    ...CREDITS,
    current_credits: "0",
    last_reset_date: "2026-11-08T16:00:00Z",
  };
  expect(dailyResetEligibility(empty, BEFORE_DUE)).toMatchObject({ kind: "inactive" });
  expect(exhaustedResetEligibility(empty, BEFORE_DUE, "message")).toMatchObject({
    kind: "ready",
  });
});

test("credit exhaustion detection excludes weekly limits and ordinary rate limits", () => {
  expect(exhaustionSignal(402, "payment required")).toBe("http402");
  expect(exhaustionSignal(429, '{"message":"insufficient credits"}')).toBe("message");
  expect(exhaustionSignal(403, "积分已耗尽")).toBe("message");
  expect(exhaustionSignal(429, "weekly limit reached")).toBeUndefined();
  expect(exhaustionSignal(429, "rate limit exceeded")).toBeUndefined();
  expect(exhaustionSignal(403, "model not allowed")).toBeUndefined();
});

test("new York midnight in UTC does not leak into the Beijing reset date", () => {
  expect(beijingDateKey(Date.parse("2026-11-10T04:00:00Z"))).toBe("2026-11-10");
  expect(nextBeijingReset(BEFORE_DUE)).toBe(Date.parse("2026-11-10T15:55:00Z"));
});
