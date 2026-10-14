/**
 * 연속 기록 회복 장치 — 순수 도메인 모델.
 *
 * 근거: Duolingo 스트릭 분석 (real-world-cases REPORT 5-5 / 패턴 4).
 * 스트릭은 상실 자체가 이탈 사유가 되므로, 회복 장치 없는 연속 기록은
 * 만들지 않는다. 이 모듈의 불변식:
 *
 *  1. 하루 끊김은 절대 리셋 사유가 아니다. 하루 빈 날은 프리즈가 있으면
 *     프리즈로 덮이고, 없어도 "오늘 하면 이어지는" 회복 가능 상태로만
 *     표시된다. 리셋(현재 기록 0)은 빈 날이 이틀 이상 이어지고 프리즈도
 *     휴재도 없을 때만 일어난다.
 *  2. 휴재 선언 기간은 기록을 끊지 않는다. 날짜를 건너뛰어 세며
 *     (개수에는 넣지 않고 연속성만 유지), 선언은 작가/학습자가 직접 한다.
 *  3. 학습 연속 기록과 연재 기록은 완전히 분리된 지표다. 서로의 활동이
 *     서로의 기록을 메우지 않고, 학습 뷰에는 마감·압박 문구를 싣지 않는다.
 *  4. 현재 기록이 0이 돼도 최장 기록·누적 활동일·첫/마지막 활동일은
 *     포트폴리오 스냅샷으로 그대로 남는다. 중단·휴재가 성과를 지우지 않는다.
 *  5. 가입은 첫 성공 뒤다. 계정이 없어도 첫 레슨/첫 컷을 시작할 수 있고,
 *     가입 제안은 첫 성공이 기록된 뒤에만 뜬다 (evaluateSignupGate).
 *
 * 날짜는 전부 로컬 날짜 키 "YYYY-MM-DD" 문자열이며, 모든 함수는
 * today를 인자로 받아 테스트에서 결정적으로 검증할 수 있다.
 * 렌더링·저장소에 의존하지 않는 순수 함수만 둔다.
 */

export type StreakTrack = "learning" | "serialization";

export const STREAK_TRACKS: readonly StreakTrack[] = ["learning", "serialization"];

/** 트랙별 표시 정본. 학습에는 마감 압박 문구를 두지 않는다 (분리 원칙). */
export const STREAK_TRACK_META: Readonly<Record<StreakTrack, {
  label: string;
  activityLabel: string;
  gentleNote: string;
}>> = {
  learning: {
    label: "학습 연속 기록",
    activityLabel: "오늘 학습 기록하기",
    gentleNote: "하루 쉬어도 괜찮아요. 프리즈와 휴재 선언이 기록을 지켜줍니다.",
  },
  serialization: {
    label: "연재 기록",
    activityLabel: "오늘 연재 작업 기록하기",
    gentleNote: "휴재를 선언하면 그 기간은 기록이 끊기지 않아요.",
  },
};

/** 새 기록이 기본으로 받는 프리즈 수. */
export const DEFAULT_FREEZE_BALANCE = 2;
/** 프리즈 보유 상한. */
export const MAX_FREEZE_BALANCE = 3;
/** 현재 기록이 이 일수 배수에 닿을 때마다 프리즈 1개 지급 (상한까지). */
export const FREEZE_MILESTONE_DAYS = 7;
/** 휴재 선언 1건의 최대 길이(일). */
export const MAX_HIATUS_DAYS = 90;

export const STREAK_STORAGE_KEY = "toonstudio:streak-recovery:v1";

export interface HiatusPeriod {
  id: string;
  startsOn: string;
  endsOn: string;
  reason: string;
}

export interface StreakTrackState {
  /** 활동한 날짜 키들 (정렬·중복 없음). */
  activityDates: string[];
  /** 프리즈로 덮인 빈 날짜 키들. */
  freezeCoveredDates: string[];
  /** 남은 프리즈 수 (0..MAX_FREEZE_BALANCE). */
  freezeBalance: number;
  /** 지급된 프리즈 이정표(현재 기록 일수) — 중복 지급 방지. */
  freezeMilestonesAwarded: number[];
  hiatuses: HiatusPeriod[];
}

export interface StreakState {
  version: 1;
  tracks: Record<StreakTrack, StreakTrackState>;
}

export type StreakStatus =
  /** 오늘 활동했거나 휴재 중이 아니면서 어제까지 연속. */
  | "active"
  /** 오늘이 휴재 기간 안 — 기록 보존 중. */
  | "on-hiatus"
  /** 하루 빈 날이 프리즈로 덮였다 — 기록 유지. */
  | "protected-by-freeze"
  /** 하루 비었지만 오늘 활동하면 그대로 이어진다 — 리셋 아님. */
  | "recoverable-today"
  /** 이틀 이상 비고 보호 장치도 없어 현재 기록이 0 — 성과는 보존됨. */
  | "reset-preserved"
  /** 아직 활동 기록이 없다. */
  | "not-started";

export interface StreakTrackView {
  track: StreakTrack;
  label: string;
  status: StreakStatus;
  /** 상태 안내 한 줄. 학습 트랙에는 마감·압박 표현을 넣지 않는다. */
  statusLine: string;
  currentStreak: number;
  longestStreak: number;
  totalActiveDays: number;
  freezeBalance: number;
  /** 오늘 기준 진행 중인 휴재. 없으면 null. */
  activeHiatus: HiatusPeriod | null;
  /** 프리즈로 덮인 가장 최근 빈 날짜. 없으면 null. */
  lastFreezeCoveredDate: string | null;
}

export interface StreakBoard {
  /** 두 지표가 분리 표시됨을 구조로 고정한다. */
  separated: true;
  learning: StreakTrackView;
  serialization: StreakTrackView;
}

/** 중단·휴재·리셋과 무관하게 남는 성과 스냅샷. */
export interface PortfolioSnapshot {
  track: StreakTrack;
  preserved: true;
  totalActiveDays: number;
  longestStreak: number;
  freezeUsedCount: number;
  hiatusCount: number;
  firstActivityDate: string | null;
  lastActivityDate: string | null;
}

// ── 날짜 유틸 ─────────────────────────────────────────────────────────

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/u;

/** "YYYY-MM-DD"가 실제로 존재하는 날짜인지 롤오버 역검증으로 확인한다. */
export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DATE_KEY_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function toUtcMs(dateKey: string): number {
  const match = DATE_KEY_RE.exec(dateKey)!;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function fromUtcMs(ms: number): string {
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const DAY_MS = 86_400_000;

export function addDays(dateKey: string, days: number): string {
  return fromUtcMs(toUtcMs(dateKey) + days * DAY_MS);
}

/** b - a (일). a가 이르면 양수. */
export function diffDays(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / DAY_MS);
}

/** Date → 로컬 날짜 키. */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ── 상태 생성·검증 ────────────────────────────────────────────────────

function emptyTrackState(): StreakTrackState {
  return {
    activityDates: [],
    freezeCoveredDates: [],
    freezeBalance: DEFAULT_FREEZE_BALANCE,
    freezeMilestonesAwarded: [],
    hiatuses: [],
  };
}

export function emptyStreakState(): StreakState {
  return {
    version: 1,
    tracks: { learning: emptyTrackState(), serialization: emptyTrackState() },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDateKeyList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const valid = value.filter(isValidDateKey);
  return [...new Set(valid)].sort();
}

function parseHiatuses(value: unknown): HiatusPeriod[] {
  if (!Array.isArray(value)) return [];
  const result: HiatusPeriod[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    if (typeof item.id !== "string" || !item.id) continue;
    if (!isValidDateKey(item.startsOn) || !isValidDateKey(item.endsOn)) continue;
    if (diffDays(item.startsOn, item.endsOn) < 0) continue;
    if (diffDays(item.startsOn, item.endsOn) + 1 > MAX_HIATUS_DAYS) continue;
    result.push({
      id: item.id.slice(0, 64),
      startsOn: item.startsOn,
      endsOn: item.endsOn,
      reason: typeof item.reason === "string" ? item.reason.slice(0, 200) : "",
    });
  }
  return result;
}

function parseTrackState(value: unknown): StreakTrackState {
  if (!isRecord(value)) return emptyTrackState();
  const balance = typeof value.freezeBalance === "number" && Number.isInteger(value.freezeBalance)
    ? Math.min(MAX_FREEZE_BALANCE, Math.max(0, value.freezeBalance))
    : DEFAULT_FREEZE_BALANCE;
  const milestones = Array.isArray(value.freezeMilestonesAwarded)
    ? [...new Set(value.freezeMilestonesAwarded.filter(
      (day): day is number => typeof day === "number" && Number.isInteger(day) && day > 0,
    ))].sort((a, b) => a - b)
    : [];
  return {
    activityDates: parseDateKeyList(value.activityDates),
    freezeCoveredDates: parseDateKeyList(value.freezeCoveredDates),
    freezeBalance: balance,
    freezeMilestonesAwarded: milestones,
    hiatuses: parseHiatuses(value.hiatuses),
  };
}

/** 저장소는 신뢰하지 않는다 — 깨진 값은 빈 상태로, 멀쩡한 필드만 살린다. */
export function parseStreakState(raw: string | null): StreakState {
  if (!raw || raw.length > 200_000) return emptyStreakState();
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return emptyStreakState(); }
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.tracks)) return emptyStreakState();
  return {
    version: 1,
    tracks: {
      learning: parseTrackState(value.tracks.learning),
      serialization: parseTrackState(value.tracks.serialization),
    },
  };
}

export function serializeStreakState(state: StreakState): string {
  return JSON.stringify(state);
}

// ── 내부 계산 ─────────────────────────────────────────────────────────

function hiatusDateSet(track: StreakTrackState): Set<string> {
  const set = new Set<string>();
  for (const hiatus of track.hiatuses) {
    const length = diffDays(hiatus.startsOn, hiatus.endsOn) + 1;
    for (let i = 0; i < length; i += 1) set.add(addDays(hiatus.startsOn, i));
  }
  return set;
}

function activeHiatusOn(track: StreakTrackState, dateKey: string): HiatusPeriod | null {
  return track.hiatuses.find(
    (hiatus) => diffDays(hiatus.startsOn, dateKey) >= 0 && diffDays(dateKey, hiatus.endsOn) >= 0,
  ) ?? null;
}

/**
 * 앞으로 걸으며 최장 기록을 센다. 활동일 +1, 프리즈로 덮인 날은
 * 연속만 유지(개수 제외), 휴재일은 건너뜀(개수 제외·연속 유지),
 * 그 밖의 빈 날은 구간을 끊는다.
 */
function computeLongestStreak(track: StreakTrackState): number {
  const active = new Set(track.activityDates);
  const covered = new Set(track.freezeCoveredDates);
  const hiatus = hiatusDateSet(track);
  const anchors = [...active, ...covered].sort();
  if (!anchors.length) return 0;
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  let longest = 0;
  let run = 0;
  let cursor = first;
  while (diffDays(cursor, last) >= 0) {
    if (active.has(cursor)) {
      run += 1;
      longest = Math.max(longest, run);
    } else if (covered.has(cursor) || hiatus.has(cursor)) {
      // 연속 유지, 개수에는 넣지 않는다.
    } else {
      run = 0;
    }
    cursor = addDays(cursor, 1);
  }
  return longest;
}

/**
 * 오늘에서 뒤로 걸어 현재 기록을 센다.
 * - 오늘 활동 전이면 오늘은 아직 끝나지 않았으므로 어제부터 센다.
 * - 프리즈로 덮인 날·휴재일은 건너뛰되 연속을 끊지 않는다.
 * - 빈 날 하나에서 멈춘다 — 그 날이 어제면 "오늘 하면 이어짐"이다.
 */
function walkCurrentStreak(
  track: StreakTrackState,
  today: string,
): { streak: number; stoppedAtMissedDate: string | null } {
  const active = new Set(track.activityDates);
  const covered = new Set(track.freezeCoveredDates);
  const hiatus = hiatusDateSet(track);
  const yesterday = addDays(today, -1);
  let cursor = active.has(today) || hiatus.has(today) || covered.has(today) ? today : yesterday;
  const anchor = cursor;
  let streak = 0;
  let peekedMissedDate: string | null = null;
  // 무한 루프 방지: 최대 10년치만 거슬러 간다.
  for (let guard = 0; guard < 3660; guard += 1) {
    if (active.has(cursor)) {
      streak += 1;
      cursor = addDays(cursor, -1);
      continue;
    }
    if (covered.has(cursor) || hiatus.has(cursor)) {
      cursor = addDays(cursor, -1);
      continue;
    }
    // 빈 날에 닿았다. 그 빈 날이 기준일(오늘 또는 어제) 바로 전날이면
    // 하루만 더 거슬러 본다 — 하루 끊김은 그 뒤의 기록과 이어지며,
    // 빈 날 자체는 개수에 넣지 않는다 (하루 끊김 = 리셋 아님).
    if (peekedMissedDate === null && diffDays(cursor, anchor) <= 1) {
      peekedMissedDate = cursor;
      cursor = addDays(cursor, -1);
      continue;
    }
    return { streak, stoppedAtMissedDate: peekedMissedDate ?? cursor };
  }
  return { streak, stoppedAtMissedDate: null };
}

// ── 평가 ──────────────────────────────────────────────────────────────

export function evaluateTrack(state: StreakState, track: StreakTrack, today: string): StreakTrackView {
  const trackState = state.tracks[track];
  const meta = STREAK_TRACK_META[track];
  const longestStreak = computeLongestStreak(trackState);
  const totalActiveDays = trackState.activityDates.length;
  const hiatusToday = isValidDateKey(today) ? activeHiatusOn(trackState, today) : null;
  const lastCovered = trackState.freezeCoveredDates.length
    ? trackState.freezeCoveredDates[trackState.freezeCoveredDates.length - 1]
    : null;

  if (!trackState.activityDates.length) {
    return {
      track, label: meta.label, status: "not-started",
      statusLine: "아직 기록이 없어요. 오늘 한 번이 첫 기록이 됩니다.",
      currentStreak: 0, longestStreak: 0, totalActiveDays: 0,
      freezeBalance: trackState.freezeBalance, activeHiatus: hiatusToday,
      lastFreezeCoveredDate: lastCovered,
    };
  }

  const { streak, stoppedAtMissedDate } = walkCurrentStreak(trackState, today);
  const lastActivity = trackState.activityDates[trackState.activityDates.length - 1];
  const gapDays = diffDays(lastActivity, today);

  const coveredYesterday = trackState.freezeCoveredDates.includes(addDays(today, -1));
  let status: StreakStatus;
  let statusLine: string;
  if (hiatusToday) {
    status = "on-hiatus";
    statusLine = `휴재 중이에요. ${hiatusToday.endsOn}까지 기록이 그대로 보존됩니다.`;
  } else if (streak > 0 && coveredYesterday) {
    status = "protected-by-freeze";
    statusLine = "하루 빈 날은 프리즈가 지켜줬어요. 기록은 그대로 이어집니다.";
  } else if (streak > 0 && gapDays <= 1) {
    status = "active";
    statusLine = gapDays === 0 ? "오늘도 이어가고 있어요." : "어제까지의 기록이 이어지고 있어요. 오늘도 한 번 더!";
  } else if (streak > 0 && stoppedAtMissedDate === addDays(today, -1)) {
    // 어제 하루만 비었다 — 프리즈가 없었어도 오늘 하면 리셋 없이 이어진다.
    status = "recoverable-today";
    statusLine = "어제 하루 비었지만 괜찮아요. 오늘 기록하면 끊기지 않고 이어집니다.";
  } else if (streak > 0) {
    // 휴재일을 건너뛰어 이어진 기록 — 끊기지 않았다.
    status = "recoverable-today";
    statusLine = "휴재 기간은 기록을 끊지 않아요. 오늘 기록하면 그대로 이어집니다.";
  } else {
    status = "reset-preserved";
    statusLine = "현재 기록은 여기서 멈췄지만, 쌓아온 성과는 포트폴리오에 그대로 남아 있어요.";
  }

  // streak가 0인데 마지막 활동이 어제/오늘인 경우는 있을 수 없다(walk 보장).
  // reset 상태에서는 현재 기록을 0으로 고정한다.
  const currentStreak = status === "reset-preserved" ? 0 : streak;
  return {
    track, label: meta.label, status,
    statusLine,
    currentStreak,
    longestStreak,
    totalActiveDays,
    freezeBalance: trackState.freezeBalance,
    activeHiatus: hiatusToday,
    lastFreezeCoveredDate: lastCovered,
  };
}

/** 두 지표를 분리한 보드. 한 트랙의 활동이 다른 트랙을 메우지 않는다. */
export function buildStreakBoard(state: StreakState, today: string): StreakBoard {
  return {
    separated: true,
    learning: evaluateTrack(state, "learning", today),
    serialization: evaluateTrack(state, "serialization", today),
  };
}

export function buildPortfolioSnapshot(state: StreakState, track: StreakTrack): PortfolioSnapshot {
  const trackState = state.tracks[track];
  return {
    track,
    preserved: true,
    totalActiveDays: trackState.activityDates.length,
    longestStreak: computeLongestStreak(trackState),
    freezeUsedCount: trackState.freezeCoveredDates.length,
    hiatusCount: trackState.hiatuses.length,
    firstActivityDate: trackState.activityDates[0] ?? null,
    lastActivityDate: trackState.activityDates[trackState.activityDates.length - 1] ?? null,
  };
}

// ── 상태 전이 ─────────────────────────────────────────────────────────

function cloneTrack(track: StreakTrackState): StreakTrackState {
  return {
    activityDates: [...track.activityDates],
    freezeCoveredDates: [...track.freezeCoveredDates],
    freezeBalance: track.freezeBalance,
    freezeMilestonesAwarded: [...track.freezeMilestonesAwarded],
    hiatuses: track.hiatuses.map((hiatus) => ({ ...hiatus })),
  };
}

function replaceTrack(state: StreakState, track: StreakTrack, next: StreakTrackState): StreakState {
  return {
    version: 1,
    tracks: {
      learning: track === "learning" ? next : cloneTrack(state.tracks.learning),
      serialization: track === "serialization" ? next : cloneTrack(state.tracks.serialization),
    },
  };
}

/**
 * 오늘(또는 지정일) 활동을 기록한다. 중복 날짜는 그대로 둔다.
 * 기록 후 현재 연속 일수가 새 이정표(7·14·21…)에 닿으면 프리즈를
 * 1개 지급한다(상한 도달 시 지급 보류가 아니라 이정표만 소진하지 않는다).
 */
export function recordActivity(state: StreakState, track: StreakTrack, dateKey: string): StreakState {
  if (!isValidDateKey(dateKey)) return state;
  const current = state.tracks[track];
  if (current.activityDates.includes(dateKey)) return state;
  const next = cloneTrack(current);
  next.activityDates = [...next.activityDates, dateKey].sort();
  const withActivity = replaceTrack(state, track, next);
  const streakNow = walkCurrentStreak(next, dateKey).streak;
  const milestone = Math.floor(streakNow / FREEZE_MILESTONE_DAYS) * FREEZE_MILESTONE_DAYS;
  if (milestone > 0 && !next.freezeMilestonesAwarded.includes(milestone)
    && next.freezeBalance < MAX_FREEZE_BALANCE) {
    next.freezeBalance += 1;
    next.freezeMilestonesAwarded = [...next.freezeMilestonesAwarded, milestone].sort((a, b) => a - b);
    return replaceTrack(state, track, next);
  }
  return withActivity;
}

/**
 * 하루 빈 날을 프리즈로 덮는 일일 점검. 화면 진입 시 today로 1회 호출한다.
 * - 마지막 활동 다음 날부터 어제까지의 빈 날이 "정확히 하루"이고
 *   그날이 휴재도 아니고 이미 덮인 날도 아니며 프리즈가 남아 있으면 덮는다.
 * - 이틀 이상 빈 경우에는 프리즈를 소모하지 않는다(과거를 소급해
 *   지우지 않고, 현재 기록 판정은 evaluateTrack이 정직하게 한다).
 */
export function applyDailyCheck(state: StreakState, today: string): StreakState {
  if (!isValidDateKey(today)) return state;
  let result = state;
  for (const track of STREAK_TRACKS) {
    const trackState = result.tracks[track];
    if (!trackState.activityDates.length || trackState.freezeBalance <= 0) continue;
    const lastActivity = trackState.activityDates[trackState.activityDates.length - 1];
    // 마지막 활동이 그제이고 어제가 빈 날인 경우만 하루 빈 날이다.
    if (diffDays(lastActivity, today) !== 2) continue;
    const missed = addDays(today, -1);
    if (trackState.freezeCoveredDates.includes(missed)) continue;
    if (activeHiatusOn(trackState, missed)) continue;
    const next = cloneTrack(trackState);
    next.freezeCoveredDates = [...next.freezeCoveredDates, missed].sort();
    next.freezeBalance -= 1;
    result = replaceTrack(result, track, next);
  }
  return result;
}

export interface DeclareHiatusInput {
  id: string;
  startsOn: string;
  endsOn: string;
  reason?: string;
}

/** 휴재를 선언한다. 잘못된 기간·과거 기간·중복 ID면 null (기존 상태 유지). */
export function declareHiatus(
  state: StreakState,
  track: StreakTrack,
  input: DeclareHiatusInput,
  today: string,
): StreakState | null {
  if (!input.id || state.tracks[track].hiatuses.some((hiatus) => hiatus.id === input.id)) return null;
  if (!isValidDateKey(input.startsOn) || !isValidDateKey(input.endsOn) || !isValidDateKey(today)) return null;
  const length = diffDays(input.startsOn, input.endsOn) + 1;
  if (length < 1 || length > MAX_HIATUS_DAYS) return null;
  // 이미 끝난 기간은 선언할 수 없다. 오늘을 포함하거나 미래여야 한다.
  if (diffDays(input.endsOn, today) > 0) return null;
  const next = cloneTrack(state.tracks[track]);
  next.hiatuses = [...next.hiatuses, {
    id: input.id.slice(0, 64),
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    reason: (input.reason ?? "").slice(0, 200),
  }].sort((a, b) => (a.startsOn < b.startsOn ? -1 : 1));
  return replaceTrack(state, track, next);
}

/** 휴재를 오늘까지로 조기 종료한다. 없는 ID면 null. */
export function endHiatusEarly(
  state: StreakState,
  track: StreakTrack,
  hiatusId: string,
  today: string,
): StreakState | null {
  const trackState = state.tracks[track];
  const target = trackState.hiatuses.find((hiatus) => hiatus.id === hiatusId);
  if (!target || !isValidDateKey(today)) return null;
  if (diffDays(target.endsOn, today) >= 0) return null; // 이미 끝났다.
  const next = cloneTrack(trackState);
  if (diffDays(target.startsOn, today) < 0) {
    // 오늘(today)이 시작일보다 앞이다 — 아직 시작 전이면 선언 자체를 취소한다.
    next.hiatuses = next.hiatuses.filter((hiatus) => hiatus.id !== hiatusId);
  } else {
    next.hiatuses = next.hiatuses.map((hiatus) => (
      hiatus.id === hiatusId ? { ...hiatus, endsOn: today } : hiatus
    ));
  }
  return replaceTrack(state, track, next);
}

// ── 가입 후순위 · 첫 성공 동선 ────────────────────────────────────────

/**
 * 첫 성공 동선의 정본 순서. 가입 폼은 첫 성공 뒤에만 온다.
 * (Duolingo: 가입 프롬프트를 첫 레슨 완료 뒤로 이동 → 다음날 리텐션 상승 전언,
 *  Canva: 템플릿 선로드로 첫 완성본을 먼저 만드는 동선과 같은 방향.)
 */
export const FIRST_SUCCESS_FLOW = [
  "start-without-account",
  "first-success",
  "signup-prompt",
  "continue",
] as const;

export type FirstSuccessFlowStep = (typeof FIRST_SUCCESS_FLOW)[number];

export interface SignupGateInput {
  /** 첫 성공(레슨 완료·첫 컷 완성 등)이 기록된 날짜 키. 없으면 null. */
  firstSuccessDate: string | null;
  hasAccount: boolean;
}

export interface SignupGate {
  /** 계정 없이 첫 활동을 시작할 수 있는가 — 항상 true가 정본이다. */
  canStartWithoutAccount: true;
  /** 지금 가입 제안을 띄워도 되는가 — 첫 성공 이후 + 미가입일 때만 true. */
  showSignupPrompt: boolean;
  /** 가입 제안에 붙일 이유 문구. 제안하지 않을 때는 null. */
  promptReason: string | null;
  /** 동선에서 현재 위치. */
  step: FirstSuccessFlowStep;
}

export function evaluateSignupGate(input: SignupGateInput): SignupGate {
  if (input.hasAccount) {
    return {
      canStartWithoutAccount: true,
      showSignupPrompt: false,
      promptReason: null,
      step: "continue",
    };
  }
  if (!input.firstSuccessDate || !isValidDateKey(input.firstSuccessDate)) {
    return {
      canStartWithoutAccount: true,
      showSignupPrompt: false,
      promptReason: null,
      step: "start-without-account",
    };
  }
  return {
    canStartWithoutAccount: true,
    showSignupPrompt: true,
    promptReason: "첫 기록을 만들었어요. 가입하면 이 기록이 계정에 안전하게 이어집니다.",
    step: "signup-prompt",
  };
}
