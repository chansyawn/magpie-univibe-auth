import {
  formatBeijingDateTime,
  nextCreditReset,
  resetWasToday,
  todayBeijingReset,
} from "./time.ts";
import type { CreditSummary } from "./types.ts";

export type ResetEligibility =
  | {
      kind: "ready";
      limit: number;
      current: number;
    }
  | {
      kind: "done" | "ineligible" | "inactive";
      message: string;
      until?: string;
    };

export type ExhaustionSignal = "http402" | "message";

function creditsOf(summary: CreditSummary): number {
  const value = Number(summary.current_credits);
  return Number.isFinite(value) ? value : 0;
}

function limitOf(summary: CreditSummary): number {
  const value = Number(summary.plan_config?.supplement_limit);
  return Number.isFinite(value) ? value : 0;
}

function dateOrUndefined(value: number): string | undefined {
  return Number.isFinite(value) ? new Date(value).toISOString() : undefined;
}

function baseEligibility(
  summary: CreditSummary,
  now: number,
  allowPositiveBalance: boolean,
): ResetEligibility {
  const planType = summary.plan_type.toUpperCase();
  const current = creditsOf(summary);
  const limit = limitOf(summary);
  const nextReset = dateOrUndefined(nextCreditReset(now, summary.last_reset_date));

  if (planType === "FREE") {
    return {
      kind: "ineligible",
      message: "Univibe 免费账号没有可自动重置的订阅积分",
      until: nextReset,
    };
  }
  if (resetWasToday(summary.last_reset_date, now)) {
    return {
      kind: "done",
      message: "Univibe 今天已经重置过积分",
      until: dateOrUndefined(nextCreditReset(now, summary.last_reset_date)),
    };
  }
  if (limit <= 0) {
    return {
      kind: "ineligible",
      message: "Univibe 没有返回可补充的积分配额",
    };
  }
  if (current >= limit) {
    return {
      kind: "done",
      message: "Univibe 积分已经达到补充上限",
      until: nextReset,
    };
  }
  if (!allowPositiveBalance && current > 0) {
    return {
      kind: "ineligible",
      message: "积分尚未耗尽，不触发即时重置",
    };
  }
  return { kind: "ready", current, limit };
}

export function dailyResetEligibility(summary: CreditSummary, now: number): ResetEligibility {
  const base = baseEligibility(summary, now, true);
  if (base.kind !== "ready") return base;

  const dueAt = todayBeijingReset(now);
  if (now < dueAt) {
    return {
      kind: "inactive",
      message: `将在北京时间 ${formatBeijingDateTime(dueAt)} 最后一次补满积分`,
      until: dateOrUndefined(dueAt),
    };
  }
  return base;
}

export function exhaustedResetEligibility(
  summary: CreditSummary,
  now: number,
  signal: ExhaustionSignal,
): ResetEligibility {
  return baseEligibility(summary, now, signal === "http402");
}

const CREDIT_EXHAUSTION_PATTERNS = [
  /insufficient[\s_-]*(?:credit|credits|quota|balance)/i,
  /(?:credit|credits|quota|balance)[\s_-]*(?:is\s+)?(?:exhausted|depleted|unavailable|used\s+up)/i,
  /(?:no|not\s+enough)[\s_-]+(?:credit|credits|quota|balance)/i,
  /余额不足/i,
  /积分(?:不足|已耗尽|已用尽|已用完)/i,
  /额度(?:不足|已耗尽|已用尽|已用完)/i,
];

const WEEKLY_LIMIT_PATTERNS = [/weekly/i, /每周/i, /周额度/i, /本周/i];

export function exhaustionSignal(status: number, body: string): ExhaustionSignal | undefined {
  const text = body.slice(0, 16_384);
  if (WEEKLY_LIMIT_PATTERNS.some((pattern) => pattern.test(text))) return undefined;
  if (status === 402) return "http402";
  if (status !== 403 && status !== 429) return undefined;
  return CREDIT_EXHAUSTION_PATTERNS.some((pattern) => pattern.test(text)) ? "message" : undefined;
}

export function classifyResetFailure(message: string): {
  outcome: "done" | "ineligible" | "captcha" | "failed";
  message: string;
} {
  if (/今日.{0,6}已(?:经)?重置|already\s+(?:been\s+)?reset/i.test(message)) {
    return { outcome: "done", message };
  }
  if (/验证码|captcha/i.test(message)) {
    return { outcome: "captcha", message };
  }
  if (/免费|无资格|不可参与|ineligible|not eligible/i.test(message)) {
    return { outcome: "ineligible", message };
  }
  return { outcome: "failed", message };
}
