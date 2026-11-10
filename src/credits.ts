import { parseBeijingLocalTime, parseUnivibeTime } from "./time.ts";
import type { CreditDetail, CreditSummary, UsageResult, UsageWindow } from "./types.ts";

function numeric(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function compact(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 2,
  }).format(value);
}

function planName(planType: string): string {
  return planType
    .split("_")
    .filter(Boolean)
    .map((part) => {
      if (/^\d+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

function dateFromEpoch(value: number): string | undefined {
  return Number.isFinite(value) ? new Date(value).toISOString() : undefined;
}

function creditWindow(credits: CreditSummary): UsageWindow | undefined {
  const current = numeric(credits.current_credits);
  const limit = numeric(credits.plan_config?.supplement_limit);
  if (limit <= 0) return undefined;
  const used = Math.max(0, limit - Math.min(current, limit));
  return {
    name: "当前积分",
    used: (used / limit) * 100,
    resetsAt: undefined,
    display: `${compact(current)} / ${compact(limit)} 可用`,
    amount: used,
    limit,
    unit: "credits",
  };
}

function hourlyWindow(credits: CreditSummary): UsageWindow | undefined {
  const hourly = numeric(credits.plan_config?.hourly_supplement);
  if (hourly <= 0) return undefined;
  const lastRecovery = parseUnivibeTime(credits.last_recovery_at);
  return {
    name: "每小时恢复",
    display: `每小时 +${compact(hourly)} 积分`,
    balance: hourly,
    unit: "credits",
    resetsAt: dateFromEpoch(lastRecovery + 60 * 60 * 1000),
    aside: true,
  };
}

function weeklyWindow(detail: CreditDetail): UsageWindow | undefined {
  const weekly = detail.weekly_limit;
  if (!weekly || numeric(weekly.limit) <= 0) return undefined;
  const limit = numeric(weekly.limit);
  const used = Math.max(0, numeric(weekly.used));
  const currentCycle = parseBeijingLocalTime(weekly.current_cycle_start);
  const nextCycle = parseBeijingLocalTime(weekly.next_cycle_start);
  return {
    name: "Claude 每周额度",
    used: (used / limit) * 100,
    resetsAt: dateFromEpoch(nextCycle),
    span:
      Number.isFinite(currentCycle) && Number.isFinite(nextCycle) && nextCycle > currentCycle
        ? Math.round((nextCycle - currentCycle) / 1000)
        : undefined,
    display: `${compact(used)} / ${compact(limit)}`,
    amount: used,
    limit,
    unit: "credits",
    model: "claude",
  };
}

export function buildUsage(
  credits: CreditSummary,
  detail: CreditDetail,
  dailyResetAt: number,
  user?: string,
): UsageResult {
  const windows = [creditWindow(credits), hourlyWindow(credits), weeklyWindow(detail)].filter(
    (window): window is UsageWindow => window !== undefined,
  );
  if (windows[0]) windows[0].resetsAt = dateFromEpoch(dailyResetAt);

  return {
    plan: `Univibe ${planName(credits.plan_type || "Unknown")}`,
    ...(user ? { user } : {}),
    until: credits.subscription_expires_at ?? undefined,
    renew: "auto",
    balance: `${compact(numeric(credits.current_credits))} credits`,
    windows,
  };
}
