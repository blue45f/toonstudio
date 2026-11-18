const DAY = 86_400_000;
const EMPTY_VALUES = /^(?:미확인|확인\s*필요|미등록|미입력|없음|tbd|n\/?a|null|undefined|[-—–]+)$/i;
const KST_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
});

export const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
export const substantive = (value: unknown): boolean => Boolean(text(value)) && !EMPTY_VALUES.test(text(value));
export const plain = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === "object" && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
);

/** 외부 링크를 열기 위한 검사다. 원문 내용이나 접속 권한을 검증하지 않는다. */
export function safeUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 4096) return "";
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return "";
  }
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) return "";
    return url.href;
  } catch {
    return "";
  }
}

export function todayKst(now: Date = new Date()): string {
  if (!Number.isFinite(now.getTime())) return "";
  const parts = KST_FORMAT.formatToParts(now);
  const part = (name: string): string => parts.find((item) => item.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function dayNumber(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  const value = new Date(0);
  value.setUTCFullYear(year, month - 1, date);
  value.setUTCHours(0, 0, 0, 0);
  return value.getTime() / DAY;
}

export interface ParsedBusinessPlanDate {
  day: string;
  dayCount: number;
  ms: number;
  exact: boolean;
}

export function parseDate(value: unknown): ParsedBusinessPlanDate | null {
  if (typeof value !== "string" || !value || value.length > 40) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const timestamp = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!dateOnly && !timestamp) return null;
  const rawDay = value.slice(0, 10);
  const count = dayNumber(rawDay);
  if (!Number.isFinite(count) || new Date(count * DAY).toISOString().slice(0, 10) !== rawDay) return null;
  if (dateOnly) return { day: rawDay, dayCount: count, ms: count * DAY, exact: false };
  if (!timestamp || Number(timestamp[2]) > 23 || Number(timestamp[3]) > 59 || Number(timestamp[4] ?? 0) > 59) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  const day = todayKst(new Date(ms));
  return { day, dayCount: dayNumber(day), ms, exact: true };
}

export function isFuture(parsed: ParsedBusinessPlanDate, now: Date): boolean {
  return parsed.exact ? parsed.ms > now.getTime() : parsed.day > todayKst(now);
}

export function isLater(left: ParsedBusinessPlanDate, right: ParsedBusinessPlanDate): boolean {
  return left.dayCount > right.dayCount || (left.exact && right.exact && left.ms > right.ms);
}

/** 같은 문서의 추적 매개변수·부분 링크는 교차 출처 하나로 센다. 독립성은 별도 사람이 검토한다. */
export function sourceIdentity(value: unknown): string {
  const safe = safeUrl(value);
  if (!safe) return "";
  const url = new URL(safe);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$|msclkid$)/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.href;
}
