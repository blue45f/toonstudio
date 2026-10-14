/**
 * 라이브 커서·보기 동기화 순수 모델 (마그마·Figma·Excalidraw의 실시간 커서/팔로우를
 * 검수 표면에 맞게 옮긴 것).
 *
 * 핵심 규칙:
 * - 커서 좌표는 페이지 기준 정규화 좌표(0..1)다. 핀 좌표와 같은 규약이라 해상도나
 *   확대가 달라도 같은 지점을 가리킨다.
 * - 커서는 휘발성 정보다. 하트비트(updatedAt)가 TTL을 넘긴 항목은 사람이 떠난
 *   것으로 보고 버린다. 프레즌스(90초)보다 짧은 12초를 쓰는 이유다.
 * - 상호작용 시각(interactedAt)과 하트비트를 분리한다. 움직임이 없어도 하트비트는
 *   오므로 "자리에 있지만 가만히 있는 사람"을 자리 비움(idle)으로 표시할 수 있다.
 * - 팔로우는 상대 뷰포트를 그대로 따라가되, 내가 직접 스크롤·이동·확대하면 즉시
 *   해제된다(Figma 관찰 모드·Excalidraw 팔로우와 같은 규칙). 해제는 실패가 아니라
 *   정상 전이로 모델에 명시한다.
 * - 전송 방식을 모른다. 페이지 프레즌스와 같은 BroadcastChannel 패턴이 기본이고,
 *   서버 세션 전송이 붙으면 `mergeLiveViews`로 그대로 합칠 수 있다.
 */

export interface LiveCursorPoint {
  /** 페이지 왼쪽 끝 기준 0..1 */
  readonly x: number;
  /** 페이지 위쪽 끝 기준 0..1 */
  readonly y: number;
}

export interface LiveViewState {
  readonly actorId: string;
  readonly displayName: string;
  readonly pageId: string;
  /**
   * 지금 보고 있는 공정 (presence-location-model의 stageId 규약:
   * PRODUCTION_PROCESS_LABELS 키 또는 "review"). 프레즌스 칩의 위치 맥락
   * 표시용으로만 쓰며 커서·팔로우 판정에는 관여하지 않는다.
   * 예전 신호에는 없을 수 있다.
   */
  readonly stageId?: string | null;
  /** 커서가 페이지 밖에 있으면 null (패널·목록을 보고 있는 중). */
  readonly cursor: LiveCursorPoint | null;
  /** 보고 있는 영역의 스크롤 위치 (스크롤 가능 범위 기준 0..1). */
  readonly scrollX: number;
  readonly scrollY: number;
  /** 배율. 1 = 맞춤. */
  readonly zoom: number;
  /** 마지막 하트비트 시각(ISO). 생존 판정 기준. */
  readonly updatedAt: string;
  /** 마지막으로 커서·스크롤·확대를 실제로 움직인 시각(ISO). 자리 비움 판정 기준. */
  readonly interactedAt: string;
}

/** 하트비트가 이보다 오래되면 떠난 것으로 본다 (프레즌스 TTL보다 짧다 — 커서는 휘발성). */
export const LIVE_VIEW_TTL_MS = 12_000;
/** 움직임이 없어도 내 보기 상태를 알리는 하트비트 간격. TTL 안에 두 번은 닿는다. */
export const LIVE_VIEW_HEARTBEAT_MS = 5_000;
/** 마지막 상호작용 후 이 시간이 지나면 "자리 비움"으로 표시한다. */
export const LIVE_VIEW_IDLE_AFTER_MS = 45_000;
/** 커서 발행 최소 간격. 이보다 촘촘한 움직임은 합쳐서 보낸다. */
export const LIVE_CURSOR_MIN_INTERVAL_MS = 50;
/** 이 거리(정규화)보다 작게 움직인 커서는 발행하지 않는다. */
export const LIVE_CURSOR_MIN_DISTANCE = 0.0015;
/** 스크롤 발행 최소 변화량(정규화). */
export const LIVE_VIEW_MIN_SCROLL_DELTA = 0.01;
/** 커서 보간 시간 상수(ms). 클수록 느리게 따라붙는다. */
export const LIVE_CURSOR_SMOOTHING_MS = 90;
/** 같은 브라우저 다른 탭과 라이브 뷰를 주고받는 채널 (페이지 프레즌스 채널과 같은 방식). */
export const LIVE_VIEW_CHANNEL_NAME = "toonstudio-production-live-view-v1";
/** 시계 오차로 하트비트가 살짝 미래여도 인정하는 범위. */
const CLOCK_SKEW_MS = 5_000;

function timeOf(iso: string): number {
  return Date.parse(iso);
}

export function isFreshLiveView(view: LiveViewState, now: Date): boolean {
  const at = timeOf(view.updatedAt);
  if (!Number.isFinite(at)) return false;
  const age = now.getTime() - at;
  return age >= -CLOCK_SKEW_MS && age <= LIVE_VIEW_TTL_MS;
}

export type LiveViewFocus = "active" | "idle";

/** 자리 비움 판정: 하트비트는 살아 있지만 상호작용이 오래 끊긴 사람. */
export function deriveLiveViewFocus(view: LiveViewState, now: Date): LiveViewFocus {
  const at = timeOf(view.interactedAt);
  if (!Number.isFinite(at)) return "idle";
  return now.getTime() - at <= LIVE_VIEW_IDLE_AFTER_MS ? "active" : "idle";
}

/** 오래된 항목을 버리고 사람당 가장 최근 하트비트 하나만 남긴다. 순서는 actorId 기준이라 결정적이다. */
export function pruneLiveViews(
  views: readonly LiveViewState[],
  now: Date,
): readonly LiveViewState[] {
  const latest = new Map<string, LiveViewState>();
  for (const view of views) {
    if (!isFreshLiveView(view, now)) continue;
    const previous = latest.get(view.actorId);
    if (!previous || timeOf(view.updatedAt) >= timeOf(previous.updatedAt)) {
      latest.set(view.actorId, view);
    }
  }
  return [...latest.values()].sort((left, right) => left.actorId.localeCompare(right.actorId));
}

/** 두 라이브 뷰 목록을 합친다. 같은 사람은 하트비트가 최근인 쪽이 이긴다. */
export function mergeLiveViews(
  base: readonly LiveViewState[],
  incoming: readonly LiveViewState[],
  now: Date,
): readonly LiveViewState[] {
  return pruneLiveViews([...base, ...incoming], now);
}

export interface LiveCursorPublishMark {
  readonly atMs: number;
  readonly cursor: LiveCursorPoint | null;
}

/**
 * 커서를 지금 발행해도 되는가 (스로틀 판정).
 * - 마지막 발행이 없거나, 커서가 페이지에 들어오거나/나가면 즉시 발행한다.
 * - 그 외에는 최소 간격이 지났고 최소 거리 이상 움직였을 때만 발행한다.
 */
export function shouldPublishLiveCursor(
  last: LiveCursorPublishMark | null,
  next: LiveCursorPoint | null,
  nowMs: number,
): boolean {
  if (!last) return true;
  if ((last.cursor === null) !== (next === null)) return true;
  if (next === null || last.cursor === null) return false;
  if (nowMs - last.atMs < LIVE_CURSOR_MIN_INTERVAL_MS) return false;
  const dx = next.x - last.cursor.x;
  const dy = next.y - last.cursor.y;
  return dx * dx + dy * dy >= LIVE_CURSOR_MIN_DISTANCE * LIVE_CURSOR_MIN_DISTANCE;
}

/** 스크롤·확대 발행 판정: 의미 있는 변화가 있을 때만 보낸다. */
export function shouldPublishLiveView(
  last: Pick<LiveViewState, "scrollX" | "scrollY" | "zoom" | "pageId"> | null,
  next: Pick<LiveViewState, "scrollX" | "scrollY" | "zoom" | "pageId">,
): boolean {
  if (!last) return true;
  if (last.pageId !== next.pageId) return true;
  return (
    Math.abs(next.scrollX - last.scrollX) >= LIVE_VIEW_MIN_SCROLL_DELTA ||
    Math.abs(next.scrollY - last.scrollY) >= LIVE_VIEW_MIN_SCROLL_DELTA ||
    Math.abs(next.zoom - last.zoom) >= 0.01
  );
}

/**
 * 커서 보간: 받은 위치가 띄엄띄엄 와도 화면에서는 부드럽게 따라붙게 한다.
 * 지수 감쇠라 프레임 간격이 달라도 결과가 안정적이다.
 */
export function smoothLiveCursor(
  current: LiveCursorPoint,
  target: LiveCursorPoint,
  elapsedMs: number,
): LiveCursorPoint {
  if (elapsedMs <= 0) return current;
  const factor = 1 - Math.exp(-elapsedMs / LIVE_CURSOR_SMOOTHING_MS);
  return {
    x: current.x + (target.x - current.x) * factor,
    y: current.y + (target.y - current.y) * factor,
  };
}

/* ---------------------------------- 팔로우 ---------------------------------- */

export type LiveFollowState =
  | { readonly mode: "off" }
  | { readonly mode: "following"; readonly actorId: string };

export type LiveFollowEvent =
  | { readonly type: "follow"; readonly actorId: string }
  | { readonly type: "stop" }
  /** 내가 직접 스크롤·이동·확대·페이지 전환을 했다 — 팔로우 해제 사유. */
  | { readonly type: "manual-interaction" }
  /** 따라가던 사람이 떠났거나 하트비트가 끊겼다. */
  | { readonly type: "target-missing" };

export const LIVE_FOLLOW_OFF: LiveFollowState = { mode: "off" };

/** 팔로우 상태 전이. 수동 조작과 대상 소실은 팔로우를 끄는 정상 전이다. */
export function nextLiveFollowState(
  state: LiveFollowState,
  event: LiveFollowEvent,
): LiveFollowState {
  switch (event.type) {
    case "follow":
      return { mode: "following", actorId: event.actorId };
    case "stop":
    case "manual-interaction":
    case "target-missing":
      return LIVE_FOLLOW_OFF;
  }
}

export type FollowViewDerivation =
  | { readonly kind: "off" }
  | { readonly kind: "target-missing" }
  | { readonly kind: "view"; readonly view: LiveViewState };

/** 팔로우 중이면 상대의 현재 보기 상태를, 상대가 없으면 소실을 돌려준다. */
export function deriveFollowView(
  views: readonly LiveViewState[],
  state: LiveFollowState,
  now: Date,
): FollowViewDerivation {
  if (state.mode === "off") return { kind: "off" };
  const target = pruneLiveViews(views, now).find((view) => view.actorId === state.actorId);
  return target ? { kind: "view", view: target } : { kind: "target-missing" };
}

/* ---------------------------------- 표시 색상 ---------------------------------- */

const LIVE_CURSOR_PALETTE = [
  "#e05252", "#e07b39", "#d9a514", "#4da34d",
  "#3d8bfd", "#7a5af8", "#d6336c", "#0ca678",
] as const;

/** 이름 해시 색(아바타)과 같은 계열의 결정적 색상. 사람마다 커서 색이 고정된다. */
export function liveCursorColor(actorId: string): string {
  let hash = 5381;
  for (let index = 0; index < actorId.length; index += 1) {
    hash = ((hash << 5) + hash + actorId.charCodeAt(index)) | 0;
  }
  return LIVE_CURSOR_PALETTE[Math.abs(hash) % LIVE_CURSOR_PALETTE.length];
}

/** 내 보기 상태를 만든다. 움직임이 있었으면 interactedAt도 함께 갱신한다. */
export function buildLiveViewState(input: {
  readonly actorId: string;
  readonly displayName: string;
  readonly pageId: string;
  /** 공정이 바뀌었을 때만 넘긴다. 생략하면 직전 공정을 유지한다. */
  readonly stageId?: string | null;
  readonly cursor: LiveCursorPoint | null;
  readonly scrollX: number;
  readonly scrollY: number;
  readonly zoom: number;
  readonly previous: LiveViewState | null;
  readonly interacted: boolean;
  readonly now: Date;
}): LiveViewState {
  const nowIso = input.now.toISOString();
  return {
    actorId: input.actorId,
    displayName: input.displayName,
    pageId: input.pageId,
    stageId: input.stageId !== undefined ? input.stageId : (input.previous?.stageId ?? null),
    cursor: input.cursor,
    scrollX: input.scrollX,
    scrollY: input.scrollY,
    zoom: input.zoom,
    updatedAt: nowIso,
    interactedAt: input.interacted ? nowIso : (input.previous?.interactedAt ?? nowIso),
  };
}
