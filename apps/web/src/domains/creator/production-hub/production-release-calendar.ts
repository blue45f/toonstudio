import {
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  getDaysInMonth,
  set,
  setDate,
  setDay,
  startOfMonth,
  subDays,
} from "date-fns";

/**
 * 연재 일정·게시 달력 계산의 신규 코드 진입점 (date-fns 도입, 신규 코드 한정).
 *
 * 규칙:
 * - 일정·게시 도메인의 "새" 날짜 계산은 이 모듈을 통해서만 date-fns를 쓴다.
 *   date-fns는 함수 단위 import만 허용한다(네임스페이스·기본 import 금지).
 * - 기존 코드(production-episode-operations의 DAY_MS 손계산 등)는 일괄 교체하지
 *   않는다. 이 모듈은 신규 표면·신규 계산 전용이다.
 * - 모든 계산은 "달력 날짜" 기준이다: 24시간(86_400_000ms) 단위 나눗셈이 아니라
 *   로컬 자정을 경계로 날짜를 센다. 그래서 자정 전후 1시간 차이도 날짜가
 *   바뀌면 1일로 세고, 서머타임(DST) 경계에서도 게시 시각(시:분)이 밀리지 않는다.
 * - 반환 Date는 입력의 로컬 시각(시:분:초)을 보존한다. 게시 시각 기본값 18:00은
 *   기존 suggestedReleaseAt 관례와 같지만, 이 모듈은 시각을 강제하지 않는다.
 * - 타 모델과의 경계 (2026-10-22 수렴 실측, rem-item2-calendar): 게시 패널의
 *   케이던스(studio-publish-schedule-model.computeCadenceOccurrences)는 IANA
 *   시간대·복수 요일·"기준 시각 엄격히 이후" 의미라 이 모듈의 주간 함수와
 *   결과가 갈리고, 단계별 마감 계획(production-stage-deadline-plan)의 역산은
 *   파이프라인 dueAt 정합을 위해 ms 산술을 유지한다. 셋의 일치 구간과 차이
 *   지점은 production-release-calendar-convergence.test.ts가 고정한다 —
 *   어느 한쪽을 다른 쪽으로 교체할 때는 그 테스트부터 다시 볼 것.
 */

/** 0=일요일 .. 6=토요일 (Date.getDay와 동일) */
export type ReleaseWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface WeeklyReleaseScheduleInput {
  /** 기준 시각. 이 시각이 속한 달력 날짜부터 찾는다(시각은 결과에 보존). */
  readonly anchor: Date;
  /** 연재 요일 */
  readonly weekday: ReleaseWeekday;
  /** 만들 게시일 개수. 0 이하이면 빈 배열. */
  readonly count: number;
  /** 격주 연재 등 간격(주). 기본 1, 1 미만은 1로 고정. */
  readonly intervalWeeks?: number;
}

/**
 * 연재 요일 기준 다가오는 게시일 목록.
 * anchor의 달력 날짜가 연재 요일이면 그날이 첫 게시일이다(시각 무관).
 */
export function upcomingWeeklyReleaseDates(
  input: WeeklyReleaseScheduleInput,
): readonly Date[] {
  const count = Math.floor(input.count);
  if (!Number.isFinite(count) || count <= 0) return [];
  const interval = Math.max(1, Math.floor(input.intervalWeeks ?? 1));
  let candidate = setDay(input.anchor, input.weekday, { weekStartsOn: 0 });
  if (differenceInCalendarDays(candidate, input.anchor) < 0) {
    candidate = addWeeks(candidate, interval);
  }
  const dates: Date[] = [];
  for (let index = 0; index < count; index += 1) {
    dates.push(candidate);
    candidate = addWeeks(candidate, interval);
  }
  return dates;
}

export interface MonthlyReleaseScheduleInput {
  /** 기준 시각. 이 시각이 속한 달부터 찾고, 시각은 결과에 보존된다. */
  readonly start: Date;
  /** 매월 게시일(1..31). 그 달에 없는 날짜면 월말로 당겨진다(예: 31일 → 2월 28일). */
  readonly dayOfMonth: number;
  /** 만들 게시일 개수. 0 이하이면 빈 배열. */
  readonly count: number;
}

/**
 * 월간 연재 게시일 목록. 월말 클램프가 핵심이다:
 * `new Date(2026, 1, 31)`처럼 넘치는 날짜를 만들지 않고, 없는 날짜는 그 달의
 * 마지막 날로 당긴 뒤 다음 달에서는 원래 날짜(31일)로 되돌아간다.
 */
export function upcomingMonthlyReleaseDates(
  input: MonthlyReleaseScheduleInput,
): readonly Date[] {
  const count = Math.floor(input.count);
  if (!Number.isFinite(count) || count <= 0) return [];
  const wantedDay = Math.min(31, Math.max(1, Math.floor(input.dayOfMonth)));
  const timeOfDay = {
    hours: input.start.getHours(),
    minutes: input.start.getMinutes(),
    seconds: input.start.getSeconds(),
    milliseconds: input.start.getMilliseconds(),
  };
  let month = startOfMonth(input.start);
  const dates: Date[] = [];
  while (dates.length < count) {
    const clampedDay = Math.min(wantedDay, getDaysInMonth(month));
    const candidate = set(setDate(month, clampedDay), timeOfDay);
    if (differenceInCalendarDays(candidate, input.start) >= 0) {
      dates.push(candidate);
    }
    month = addMonths(month, 1);
  }
  return dates;
}

export interface ReleaseDeadlineStep {
  readonly processKey: string;
  /** 게시일로부터 며칠 전까지가 마감인지 (0 = 게시 당일) */
  readonly daysBeforeRelease: number;
}

export interface ReleaseDeadline {
  readonly processKey: string;
  readonly dueAt: Date;
}

/**
 * 게시일에서 공정별 마감을 역산한다.
 * subDays는 달력 날짜 단위 감산이라 월말·연말·DST 경계에서도 시각이 보존된다
 * (ms 단위 감산은 DST 경계에서 1시간 밀린다).
 * 결과는 마감 오름차순, 동률이면 입력 순서를 유지한다.
 */
export function planReleaseDeadlines(
  releaseAt: Date,
  steps: readonly ReleaseDeadlineStep[],
): readonly ReleaseDeadline[] {
  return steps
    .map((step, index) => ({
      processKey: step.processKey,
      dueAt: subDays(releaseAt, step.daysBeforeRelease),
      index,
    }))
    .sort((left, right) => (left.dueAt.getTime() - right.dueAt.getTime()) || (left.index - right.index))
    .map(({ processKey, dueAt }) => ({ processKey, dueAt }));
}

/**
 * D-day를 달력 날짜로 센다. 자정을 넘으면 1시간 뒤라도 1일,
 * 자정을 한 번만 넘으면 47시간 뒤라도 1일이다.
 * (기존 Math.ceil(ms / DAY_MS) 방식은 후자를 2일로 세는 경계 버그가 있다.
 * 기존 호출부는 교체하지 않고, 신규 표면은 이 함수를 쓴다.)
 */
export function calendarDaysUntil(target: Date, now: Date = new Date()): number {
  return differenceInCalendarDays(target, now);
}
