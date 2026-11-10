import type { CreditDetail, CreditSummary } from "../src/types.ts";

export const CREDITS: CreditSummary = {
  plan_type: "AIR_ULTRA",
  current_credits: "47211.17",
  last_recovery_at: "2026-11-10T04:00:30.000000Z",
  last_reset_date: "2026-11-09T16:00:00.000000Z",
  subscription_expires_at: "2026-12-09T08:41:04.000000Z",
  plan_config: {
    supplement_limit: 54000,
    hourly_supplement: 1500,
  },
};

export const DETAIL: CreditDetail = {
  credit: CREDITS,
  weekly_limit: {
    limit: 2000,
    base_limit: 2000,
    bonus_limit: 0,
    used: 0,
    current_cycle_start: "2026-11-09 16:41:05",
    next_cycle_start: "2026-11-16 16:41:05",
    updated_at: "2026-11-10 12:02:59",
  },
  claude_route: {
    is_enabled: true,
    is_force_enabled: true,
    is_weekly_limit_reached: false,
  },
};

export const MODEL_IDS = [
  "claude-sonnet-5-5",
  "claude-sonnet-5",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-sonnet-4-5-20250929",
  "claude-opus-4-5-20251101",
  "claude-haiku-4-5-20251001",
  "codex-auto-review",
  "gpt-5.6-terra",
  "gpt-5.6-sol",
  "gpt-6-astra",
  "gpt-6-sol",
  "gpt-6.1-sol",
  "gpt-6.1-terra",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-3.1-pro-preview",
  "gemini-3-pro-preview",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
] as const;
