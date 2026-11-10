const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAILY_RESET_HOUR = 23;
const DAILY_RESET_MINUTE = 55;

function normalizeIsoFraction(value: string): string {
  return value.replace(/(\.\d{3})\d+(?=(?:Z|[+-]\d\d:\d\d)$)/, "$1");
}

export function parseUnivibeTime(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  return Date.parse(normalizeIsoFraction(value.trim()));
}

export function parseBeijingLocalTime(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  const normalized = value.trim().replace(" ", "T");
  if (/[zZ]$|[+-]\d\d:\d\d$/.test(normalized)) {
    return parseUnivibeTime(normalized);
  }
  return parseUnivibeTime(`${normalized}+08:00`);
}

export function beijingDateKey(now: number | Date): string {
  const date = new Date(typeof now === "number" ? now : now.getTime());
  const shifted = new Date(date.getTime() + BEIJING_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayBeijingReset(now: number): number {
  const shifted = new Date(now + BEIJING_OFFSET_MS);
  const localMidnightAsUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return (
    localMidnightAsUtc +
    DAILY_RESET_HOUR * 60 * 60 * 1000 +
    DAILY_RESET_MINUTE * 60 * 1000 -
    BEIJING_OFFSET_MS
  );
}

export function nextBeijingReset(now: number): number {
  const today = todayBeijingReset(now);
  return today > now ? today : today + 24 * 60 * 60 * 1000;
}

export function resetWasToday(lastResetDate: string | null | undefined, now: number): boolean {
  const resetAt = parseUnivibeTime(lastResetDate);
  return Number.isFinite(resetAt) && beijingDateKey(resetAt) === beijingDateKey(now);
}

export function nextCreditReset(now: number, lastResetDate: string | null | undefined): number {
  const next = nextBeijingReset(now);
  if (resetWasToday(lastResetDate, now) && beijingDateKey(next) === beijingDateKey(now)) {
    return next + 24 * 60 * 60 * 1000;
  }
  return next;
}

export function isoOrUndefined(value: number): string | undefined {
  return Number.isFinite(value) ? new Date(value).toISOString() : undefined;
}

export function formatBeijingDateTime(value: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
