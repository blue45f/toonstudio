/**
 * PMS 작업일·UTC 날짜 계산 유틸리티 — production-pms-blueprint-model.ts와
 * production-pms-casting-quota-model.ts 간 순환 의존성 제거용 리프 모듈.
 */

export function parseIsoDateUtc(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map((v) => Number.parseInt(v, 10));
  return new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1));
}

export function formatIsoDateUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isWorkingDayUtc(
  date: Date,
  includeWeekends: boolean,
  holidaysSet: ReadonlySet<string>,
): boolean {
  const iso = formatIsoDateUtc(date);
  if (holidaysSet.has(iso)) return false;
  if (includeWeekends) return true;
  const day = date.getUTCDay();
  return day !== 0 && day !== 6;
}

export function stepWorkingDaysBackward(
  anchorIso: string,
  workDaysToSubtract: number,
  includeWeekends: boolean,
  holidaysSet: ReadonlySet<string>,
): string {
  const cursor = parseIsoDateUtc(anchorIso);
  while (!isWorkingDayUtc(cursor, includeWeekends, holidaysSet)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  let remaining = Math.max(0, Math.trunc(workDaysToSubtract));
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (isWorkingDayUtc(cursor, includeWeekends, holidaysSet)) {
      remaining -= 1;
    }
  }
  return formatIsoDateUtc(cursor);
}

export function stepWorkingDaysForward(
  anchorIso: string,
  workDaysToAdd: number,
  includeWeekends: boolean,
  holidaysSet: ReadonlySet<string>,
): string {
  const cursor = parseIsoDateUtc(anchorIso);
  while (!isWorkingDayUtc(cursor, includeWeekends, holidaysSet)) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  let remaining = Math.max(0, Math.trunc(workDaysToAdd));
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isWorkingDayUtc(cursor, includeWeekends, holidaysSet)) {
      remaining -= 1;
    }
  }
  return formatIsoDateUtc(cursor);
}

export function countWorkingDaysBetween(
  fromIso: string,
  toIso: string,
  includeWeekends: boolean,
  holidaysSet: ReadonlySet<string>,
): number {
  const from = parseIsoDateUtc(fromIso);
  const to = parseIsoDateUtc(toIso);
  if (to.getTime() < from.getTime()) {
    return -countWorkingDaysBetween(toIso, fromIso, includeWeekends, holidaysSet);
  }
  const cursor = new Date(from.getTime());
  let count = 0;
  while (cursor.getTime() < to.getTime()) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isWorkingDayUtc(cursor, includeWeekends, holidaysSet)) {
      count += 1;
    }
  }
  return count;
}
