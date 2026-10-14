/**
 * 과정 리플레이 — 편집 저널(스냅샷 히스토리 + 통합 저널 메타)을 시간순으로 재생한다.
 *
 * 근거: Drawpile 의 세션 녹화·재생. 작가가 "이 컷이 어떻게 완성됐는지"를 처음부터 다시
 * 보여 주는 기능은 과정 공유·튜토리얼·협업 검수에서 반복해서 요구되지만, ToonStudio 에는
 * 히스토리 목록에서 한 시점으로 **점프**하는 것(`StudioHistoryPanel`)만 있고 **재생**은 없었다.
 *
 * 이 모듈은 재생의 순수 로직만 담당한다(상태 커밋·타이머·DOM 은 `StudioProcessReplayPanel`):
 *
 *  - 타임라인 구축: 스냅샷 배열(`pagesHistory`) + 단계 라벨 + 저널 메타(기록 시각·바뀐
 *    페이지)를 이벤트 목록으로 변환. 바뀐 페이지는 저널 메타가 있으면 그것을 우선하고,
 *    없으면 스냅샷의 구조 공유(불변 참조)를 이용한 참조 diff 로 복원한다 —
 *    `studio-history-labels.ts` 의 diff 가 이미 같은 계약(`before === page` 면 무변경) 위에 서 있다.
 *  - 페이지별 필터: 한 페이지(컷)만 골라 그 페이지의 변경 과정만 재생한다.
 *  - 재생 상태 기계: 재생/일시정지·속도(0.5/1/2/4배)·구간(seek)·구간 지정(시작~끝) 전이.
 *    실제 경과 시간(elapsedMs)을 받아 다음 이벤트까지의 간격을 소비하는 방식이라
 *    렌더 루프·테스트 모두 같은 코드를 쓴다.
 *
 * ## 재생이 실제 상태를 건드리지 않는 이유
 *
 * 재생 커서는 **보기 전용**이다. 패널은 커서가 가리키는 이벤트의 `historyIndex` 를
 * 기존 히스토리 점프 경로(`setPagesHi` 와 같은 좌표계)로 전달할 뿐, 저널·스냅샷을
 * 쓰지 않는다. 재생 중 편집이 시작되면 호스트가 재생을 닫는 것이 계약이다 —
 * 리플레이가 undo 스택을 오염시키는 실패를 원천 차단한다.
 *
 * ## 성능 상한 (명시)
 *
 *  - 이벤트 수: 최대 `PROCESS_REPLAY_MAX_EVENTS`(=512, 커맨드 저널 `maxRecords` 와 동일).
 *    넘으면 **앞(오래된 쪽)부터** 버리고 `truncatedCount` 로 알린다. 스냅샷 자체는
 *    히스토리 유지 예산이 소유하므로 여기서 복제하지 않는다(이벤트는 숫자·짧은 배열만).
 *  - 타임라인 구축 비용: O(이벤트 수 × 페이지 수) 참조 비교만. 페이지 본문 딥 diff 없음.
 *  - 틱당 전진: 최대 `PROCESS_REPLAY_MAX_EVENTS_PER_TICK` 단계. 긴 정지 후 복귀해도
 *    한 프레임에 전체를 몰아서 처리하지 않는다(남은 경과 시간은 버린다).
 *  - 이벤트 간격: 실제 기록 간격이 있어도 [`PROCESS_REPLAY_MIN_INTERVAL_MS`,
 *    `PROCESS_REPLAY_MAX_INTERVAL_MS`] 로 클램프한 뒤 속도로 나눈다. 몇 시간짜리
 *    세션도, 1ms 간격의 드래그 커밋도 재생 시간이 폭주·정지하지 않는다.
 *  - 메모리: 이벤트 1개 ≈ 숫자 4개 + 페이지 id 배열(보통 1개). 512개 상한이면 수십 KB.
 */

// ── 상한·기본값 ─────────────────────────────────────────────────────────────

/** 재생 이벤트 상한 — 커맨드 저널 maxRecords(512)와 같은 값. 넘으면 오래된 쪽부터 버린다. */
export const PROCESS_REPLAY_MAX_EVENTS = 512;
/** 기록 시각이 없을 때 이벤트 사이의 기본 간격(ms, 1배속 기준). */
export const PROCESS_REPLAY_BASE_INTERVAL_MS = 900;
/** 실제 기록 간격의 하한(ms) — 드래그 커밋처럼 촘촘한 기록이 재생을 정지시키지 않게. */
export const PROCESS_REPLAY_MIN_INTERVAL_MS = 150;
/** 실제 기록 간격의 상한(ms) — 긴 휴지 구간이 재생을 멈춘 듯 보이게 하지 않게. */
export const PROCESS_REPLAY_MAX_INTERVAL_MS = 4_000;
/** 한 번의 advance(틱)가 전진할 수 있는 최대 단계 수 — 프레임 예산 방벽. */
export const PROCESS_REPLAY_MAX_EVENTS_PER_TICK = 16;
/** 지원하는 재생 속도. 이 밖의 값은 상태 전이에서 무시한다(임의 배속으로 UI 가 깨지지 않게). */
export const PROCESS_REPLAY_SPEEDS = [0.5, 1, 2, 4] as const;
export type ProcessReplaySpeed = (typeof PROCESS_REPLAY_SPEEDS)[number];

// ── 입력 형태 (StudioPage PageState 와 구조 호환되는 최소 형태) ──────────────

export interface ProcessReplayPageLike {
  readonly id: string;
  readonly elements: readonly unknown[];
  readonly canvasH?: unknown;
}

/** 히스토리 한 칸 = 전체 페이지 배열 스냅샷(`pagesHistory` 의 원소와 같은 좌표계). */
export type ProcessReplaySnapshot = readonly ProcessReplayPageLike[];

/** 저널에서 건너오는 단계 메타 — `studio-history-journal.ts` 의 pages 항목 메타와 같은 형태. */
export interface ProcessReplayStepMeta {
  /** 기록 시각(ms). 모르면 undefined. */
  readonly at?: number;
  /** 바뀐 페이지 id. 모르면 undefined(스냅샷 참조 diff 로 복원). */
  readonly changedPageIds?: readonly string[];
}

// ── 타임라인 ────────────────────────────────────────────────────────────────

/** 재생 이벤트 한 건 — 스냅샷 인덱스(historyIndex) 하나에 대응한다. */
export interface ProcessReplayEvent {
  /** 타임라인 내 순번(0부터, 오래된 순). 잘린 뒤에도 원래 순번이 아니라 재정렬된 순번이다. */
  readonly seq: number;
  /** `pagesHistory`/`pagesHi` 좌표계의 스냅샷 인덱스 — 점프·표시의 기준값. */
  readonly historyIndex: number;
  /** 기록 시각(ms). 저널 메타가 없으면 null(표시는 "시각 미기록", 간격은 기본값 사용). */
  readonly at: number | null;
  /** 사람이 읽는 단계 라벨(호스트가 `buildHistoryTimeline` 결과로 주입, 없으면 기본 라벨). */
  readonly label: string;
  /** 이 단계에서 내용이 바뀐 페이지 id(구조 변경 제외). */
  readonly changedPageIds: readonly string[];
  /** 이 단계에서 추가된 페이지 id. */
  readonly addedPageIds: readonly string[];
  /** 이 단계에서 삭제된 페이지 id. */
  readonly removedPageIds: readonly string[];
  /** 전체 요소 수 증감(추가 +, 삭제 -). */
  readonly elementDelta: number;
}

export interface ProcessReplayTimeline {
  readonly events: readonly ProcessReplayEvent[];
  /** 상한 때문에 앞에서 버려진 이벤트 수(0이면 전체가 들어 있다). */
  readonly truncatedCount: number;
  /** 등장하는 모든 페이지 id(첫 등장 순) — 페이지 필터 선택지의 근거. */
  readonly pageIds: readonly string[];
}

function elementTotal(snapshot: ProcessReplaySnapshot): number {
  let total = 0;
  for (const page of snapshot) total += page.elements.length;
  return total;
}

function diffSnapshots(
  prev: ProcessReplaySnapshot | null,
  next: ProcessReplaySnapshot,
  meta: ProcessReplayStepMeta | undefined
): Pick<ProcessReplayEvent, "changedPageIds" | "addedPageIds" | "removedPageIds" | "elementDelta"> {
  if (!prev) {
    return {
      changedPageIds: [],
      addedPageIds: next.map((page) => page.id),
      removedPageIds: [],
      elementDelta: elementTotal(next),
    };
  }
  const prevById = new Map<string, ProcessReplayPageLike>();
  for (const page of prev) prevById.set(page.id, page);
  const nextIds = new Set(next.map((page) => page.id));
  const addedPageIds: string[] = [];
  const changedPageIds: string[] = [];
  for (const page of next) {
    const before = prevById.get(page.id);
    if (!before) {
      addedPageIds.push(page.id);
      continue;
    }
    // 구조 공유 계약: 참조가 같으면 무변경. 참조가 달라도 요소 수·캔버스 높이가 같으면
    // 순서 변경 같은 비내용 전이일 수 있어 내용 변경으로 세지 않는다.
    if (before !== page && (before.elements !== page.elements || before.canvasH !== page.canvasH)) {
      changedPageIds.push(page.id);
    }
  }
  const removedPageIds = prev.filter((page) => !nextIds.has(page.id)).map((page) => page.id);
  return {
    // 저널 메타가 명시한 바뀐 페이지가 있으면 그쪽이 진실이다(참조 diff 는 복원용 근사).
    changedPageIds: meta?.changedPageIds !== undefined ? [...meta.changedPageIds] : changedPageIds,
    addedPageIds,
    removedPageIds,
    elementDelta: elementTotal(next) - elementTotal(prev),
  };
}

/**
 * 스냅샷 히스토리를 재생 타임라인으로 변환한다.
 *
 * @param history  `pagesHistory` 전체(오래된 → 최신).
 * @param options.labels     historyIndex 와 같은 좌표의 단계 라벨(없으면 "N단계" 기본 라벨).
 * @param options.stepMeta   historyIndex 와 같은 좌표의 저널 메타. 인덱스 0(처음 상태)은 무시.
 * @param options.maxEvents  이벤트 상한(기본 `PROCESS_REPLAY_MAX_EVENTS`).
 */
export function buildProcessReplayTimeline(
  history: readonly ProcessReplaySnapshot[],
  options: {
    readonly labels?: readonly string[];
    readonly stepMeta?: readonly (ProcessReplayStepMeta | undefined)[];
    readonly maxEvents?: number;
  } = {}
): ProcessReplayTimeline {
  const requested = options.maxEvents ?? PROCESS_REPLAY_MAX_EVENTS;
  const maxEvents = Math.max(1, Math.floor(Number.isFinite(requested) ? requested : PROCESS_REPLAY_MAX_EVENTS));
  const truncatedCount = Math.max(0, history.length - maxEvents);
  const startIndex = truncatedCount;
  const events: ProcessReplayEvent[] = [];
  const pageIds: string[] = [];
  const seenPageIds = new Set<string>();
  for (let index = startIndex; index < history.length; index += 1) {
    const snapshot = history[index];
    const meta = options.stepMeta?.[index];
    const diff = diffSnapshots(index > 0 ? history[index - 1] : null, snapshot, meta);
    for (const page of snapshot) {
      if (!seenPageIds.has(page.id)) {
        seenPageIds.add(page.id);
        pageIds.push(page.id);
      }
    }
    events.push({
      seq: events.length,
      historyIndex: index,
      at: meta?.at !== undefined && Number.isFinite(meta.at) ? meta.at : null,
      label: options.labels?.[index] ?? (index === 0 ? "처음 상태" : `${index}단계`),
      ...diff,
    });
  }
  return { events, truncatedCount, pageIds };
}

/** 한 이벤트가 특정 페이지와 관련 있는지(내용 변경·추가·삭제 중 하나). */
export function processReplayEventTouchesPage(event: ProcessReplayEvent, pageId: string): boolean {
  return (
    event.changedPageIds.includes(pageId) ||
    event.addedPageIds.includes(pageId) ||
    event.removedPageIds.includes(pageId)
  );
}

/**
 * 페이지별 재생 목록 — 그 페이지를 건드린 이벤트만 추린다.
 * 처음 상태(seq 0)는 기준 화면이라 항상 포함한다(그 페이지가 없었던 시절이어도
 * "등장 전 → 등장" 흐름이 끊기지 않는다). `pageId` 가 null 이면 전체를 돌려준다.
 */
export function filterProcessReplayEvents(
  timeline: ProcessReplayTimeline,
  pageId: string | null
): readonly ProcessReplayEvent[] {
  if (pageId === null) return timeline.events;
  return timeline.events.filter(
    (event) => event.seq === 0 || processReplayEventTouchesPage(event, pageId)
  );
}

// ── 재생 상태 기계 ──────────────────────────────────────────────────────────

/** 구간 지정 — 필터된 목록 내 위치(pos) 구간 [startPos, endPos](양끝 포함). */
export interface ProcessReplaySegment {
  readonly startPos: number;
  readonly endPos: number;
}

export interface ProcessReplayState {
  /** 현재 위치 — **필터된 목록** 내 인덱스(0부터). 이벤트 자체는 `events[pos]` 로 찾는다. */
  readonly pos: number;
  readonly playing: boolean;
  readonly speed: ProcessReplaySpeed;
  readonly segment: ProcessReplaySegment | null;
  /** 다음 단계까지 남은 간격을 소비하고 남은 시간(ms) — 틱 사이의 이월분. */
  readonly carryMs: number;
  /** 끝(또는 구간 끝)에 닿아 멈춘 상태인지. */
  readonly ended: boolean;
}

function clampPos(pos: number, eventCount: number): number {
  if (eventCount <= 0) return 0;
  return Math.max(0, Math.min(eventCount - 1, Math.trunc(pos)));
}

function segmentBounds(
  state: ProcessReplayState,
  eventCount: number
): { readonly start: number; readonly end: number } {
  if (eventCount <= 0) return { start: 0, end: 0 };
  if (!state.segment) return { start: 0, end: eventCount - 1 };
  return {
    start: clampPos(state.segment.startPos, eventCount),
    end: clampPos(state.segment.endPos, eventCount),
  };
}

export function createProcessReplayState(eventCount: number): ProcessReplayState {
  return {
    pos: 0,
    playing: false,
    speed: 1,
    segment: null,
    carryMs: 0,
    ended: eventCount <= 1,
  };
}

/** 구간 이동(seek) — 구간이 지정돼 있으면 그 안으로 클램프한다. 재생 여부는 바꾸지 않는다. */
export function seekProcessReplay(
  state: ProcessReplayState,
  eventCount: number,
  pos: number
): ProcessReplayState {
  const { start, end } = segmentBounds(state, eventCount);
  const nextPos = Math.max(start, Math.min(end, clampPos(pos, eventCount)));
  // 명시적 이동은 "끝남"을 해제한다 — 끝점에 놓아도 재생을 누르면 처음부터 다시 재생된다.
  return { ...state, pos: nextPos, carryMs: 0, ended: false };
}

export function playProcessReplay(
  state: ProcessReplayState,
  eventCount: number
): ProcessReplayState {
  if (eventCount <= 1) return { ...state, playing: false, ended: true };
  const { start, end } = segmentBounds(state, eventCount);
  // 끝에서 재생을 누르면 구간 처음(또는 처음)으로 되감아 다시 재생한다.
  if (state.ended || state.pos >= end) {
    return { ...state, pos: start, playing: true, carryMs: 0, ended: false };
  }
  return { ...state, playing: true, ended: false };
}

export function pauseProcessReplay(state: ProcessReplayState): ProcessReplayState {
  return state.playing ? { ...state, playing: false } : state;
}

export function toggleProcessReplay(
  state: ProcessReplayState,
  eventCount: number
): ProcessReplayState {
  return state.playing ? pauseProcessReplay(state) : playProcessReplay(state, eventCount);
}

/** 속도 변경 — 지원 목록 밖의 값은 무시하고 같은 상태를 돌려준다. */
export function setProcessReplaySpeed(
  state: ProcessReplayState,
  speed: number
): ProcessReplayState {
  const next = PROCESS_REPLAY_SPEEDS.find((candidate) => candidate === speed);
  return next === undefined || next === state.speed ? state : { ...state, speed: next };
}

/**
 * 구간 지정 — 순서를 뒤집어 줘도 정규화한다. `segment` 가 null 이면 해제.
 * 지정 즉시 현재 위치가 구간 밖이면 구간 시작으로 이동한다.
 */
export function setProcessReplaySegment(
  state: ProcessReplayState,
  eventCount: number,
  segment: ProcessReplaySegment | null
): ProcessReplayState {
  if (segment === null) return state.segment === null ? state : { ...state, segment: null };
  const a = clampPos(segment.startPos, eventCount);
  const b = clampPos(segment.endPos, eventCount);
  const normalized: ProcessReplaySegment = {
    startPos: Math.min(a, b),
    endPos: Math.max(a, b),
  };
  const pos = state.pos < normalized.startPos || state.pos > normalized.endPos
    ? normalized.startPos
    : state.pos;
  return { ...state, segment: normalized, pos, carryMs: 0, ended: false };
}

/**
 * 이벤트 `pos` → `pos + 1` 사이의 재생 간격(ms).
 * 두 이벤트 모두 기록 시각이 있으면 실제 간격을 클램프해 속도로 나누고,
 * 하나라도 없으면 기본 간격을 속도로 나눈다.
 */
export function processReplayIntervalMs(
  events: readonly ProcessReplayEvent[],
  pos: number,
  speed: ProcessReplaySpeed
): number {
  const current = events[pos];
  const next = events[pos + 1];
  if (!current || !next) return PROCESS_REPLAY_BASE_INTERVAL_MS / speed;
  if (current.at !== null && next.at !== null && next.at > current.at) {
    const gap = Math.max(
      PROCESS_REPLAY_MIN_INTERVAL_MS,
      Math.min(PROCESS_REPLAY_MAX_INTERVAL_MS, next.at - current.at)
    );
    return gap / speed;
  }
  return PROCESS_REPLAY_BASE_INTERVAL_MS / speed;
}

/**
 * 경과 시간만큼 재생을 전진시킨다(타이머 틱 1회분).
 *
 * - 재생 중이 아니면 그대로 돌려준다.
 * - 틱당 최대 `PROCESS_REPLAY_MAX_EVENTS_PER_TICK` 단계까지만 전진하고 남은
 *   경과 시간은 버린다(프레임 예산 — 성능 상한 참조).
 * - 구간 끝·목록 끝에 닿으면 멈추고 `ended` 를 세운다.
 */
export function advanceProcessReplay(
  state: ProcessReplayState,
  events: readonly ProcessReplayEvent[],
  elapsedMs: number
): ProcessReplayState {
  if (!state.playing || events.length <= 1 || !(elapsedMs > 0)) return state;
  const { end } = segmentBounds(state, events.length);
  let pos = clampPos(state.pos, events.length);
  if (pos >= end) return { ...state, playing: false, ended: true, carryMs: 0 };
  let budget = state.carryMs + elapsedMs;
  let advanced = 0;
  while (advanced < PROCESS_REPLAY_MAX_EVENTS_PER_TICK && pos < end) {
    const interval = processReplayIntervalMs(events, pos, state.speed);
    if (budget < interval) break;
    budget -= interval;
    pos += 1;
    advanced += 1;
  }
  if (advanced === 0) return { ...state, pos, carryMs: budget };
  const reachedEnd = pos >= end;
  return {
    ...state,
    pos,
    carryMs: reachedEnd ? 0 : budget,
    playing: !reachedEnd,
    ended: reachedEnd,
  };
}

/** 진행 표시용 요약 — 현재 이벤트와 전체 대비 비율. */
export function processReplayProgress(
  state: ProcessReplayState,
  events: readonly ProcessReplayEvent[]
): {
  readonly current: ProcessReplayEvent | null;
  readonly pos: number;
  readonly total: number;
  readonly ratio: number;
} {
  const total = events.length;
  const current = total > 0 ? events[clampPos(state.pos, total)] : null;
  return {
    current,
    pos: total > 0 ? clampPos(state.pos, total) : 0,
    total,
    ratio: total <= 1 ? 1 : clampPos(state.pos, total) / (total - 1),
  };
}

/** 기록 시각을 세션 시작 기준 경과 표기(mm:ss 또는 h:mm:ss)로. null 이면 "시각 미기록". */
export function formatProcessReplayClock(at: number | null, startAt: number | null): string {
  if (at === null || startAt === null) return "시각 미기록";
  const totalSeconds = Math.max(0, Math.floor((at - startAt) / 1000));
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
