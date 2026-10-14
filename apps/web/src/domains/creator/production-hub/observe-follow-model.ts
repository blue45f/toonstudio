import type { LiveViewState } from "./live-view-sync-model";

/**
 * 관찰(팔로우) 모드 순수 모델 — Figma Observe를 검수·코칭 표면에 맞게 옮긴 것.
 * (tool-strengths 초안 drafts/observe-follow-model.ts를 실제 호스트 타입에 맞춰 승격)
 *
 * 초안과의 차이 (호스트 실측 반영):
 * - 뷰포트 좌표를 초안의 중심점(centerX/centerY) 대신 실제 회차 룸·라이브 뷰가 쓰는
 *   스크롤 원점(scrollX/scrollY, 0..1 정규화) + zoom으로 맞췄다. 룸 패널은 스크롤
 *   컨테이너라 중심점으로는 적용 지점이 없고, LiveViewState와 필드가 1:1로 통해야
 *   프레즌스/서버 전송 스냅샷을 변환 없이 팔로우 입력으로 쓸 수 있기 때문이다.
 *   상태 기계·권한·보간 규칙은 초안과 동일하다.
 *
 * 규칙:
 * - 팔로우는 관찰자만 시작/해제할 수 있고, 대상은 언제든 "따라오기 차단"을 켤 수 있다.
 *   차단이 켜지는 순간 진행 중이던 팔로우는 즉시 blocked로 해제된다(대기·유예 없음).
 * - 관찰자가 스스로 팬/줌/스크롤하면 자동 일시정지(paused-manual)한다. 팔로우가
 *   완전히 빠져나가는(해제되는) 것이 아니라, 내 화면을 빼앗기지 않으면서
 *   "다시 따라가기" 한 번으로 복귀할 수 있는 상태로 남는다.
 * - 대상이 페이지를 바꾸면 관찰자 뷰포트도 그 페이지로 즉시 이동한다(보간 없음).
 *   페이지가 같으면 스크롤·줌을 t만큼 보간해 부드럽게 따라붙는다.
 * - 관찰 가능 여부는 이 모델의 deriveObserveEligibility가 단일 판정 지점이다:
 *   프레즌스에 대상이 있고, 검수 세션 안에서 위치 신호가 열려 있고(집중 모드 아님),
 *   대상이 차단하지 않았을 때만 팔로우를 시작할 수 있다.
 */

export interface FollowViewport {
  readonly pageId: string;
  /** 보고 있는 영역의 스크롤 위치 (스크롤 가능 범위 기준 0..1). LiveViewState와 같은 규약. */
  readonly scrollX: number;
  readonly scrollY: number;
  /** 배율. 1 = 맞춤. */
  readonly zoom: number;
}

export type FollowState = "off" | "following" | "paused-manual" | "blocked";

export interface FollowSession {
  readonly observerId: string;
  readonly targetUserId: string;
  readonly state: FollowState;
  readonly lastTargetViewport: FollowViewport | null;
}

/**
 * 팔로우 적용 시 보간 계수. 회차 룸은 대상 하트비트(라이브 뷰 틱)마다 현재 위치에서
 * 대상 위치로 이만큼씩 다가간다 — 1이면 즉시 일치, 작을수록 느리게 따라붙는다.
 * 룸은 패널 스크롤을 매 틱 다시 계산하므로 1(즉시 일치)이 기존 라이브 팔로우의
 * 동작과 같고, 보간 함수 자체는 더 부드러운 적용을 원하는 표면이 t를 낮춰 쓴다.
 */
export const OBSERVE_FOLLOW_SYNC_STEP = 1;

export function createFollowSession(observerId: string, targetUserId: string): FollowSession {
  return { observerId, targetUserId, state: "off", lastTargetViewport: null };
}

export function startFollow(
  session: FollowSession,
  options: { targetAllowsObserve: boolean },
): FollowSession {
  if (!options.targetAllowsObserve) return { ...session, state: "blocked" };
  return { ...session, state: "following" };
}

export function stopFollow(session: FollowSession): FollowSession {
  return { ...session, state: "off" };
}

/** 대상이 관찰을 차단하면 즉시 해제 상태로. following·paused-manual 어디서든 전이한다. */
export function targetBlockedObserve(session: FollowSession): FollowSession {
  if (session.state === "off") return session;
  return { ...session, state: "blocked" };
}

/** 대상 뷰포트 수신. following일 때만 관찰자 뷰포트 후보로 쓴다(적용 판정은 호출측·sync가 한다). */
export function receiveTargetViewport(
  session: FollowSession,
  viewport: FollowViewport,
): FollowSession {
  if (session.lastTargetViewport
    && session.lastTargetViewport.pageId === viewport.pageId
    && session.lastTargetViewport.scrollX === viewport.scrollX
    && session.lastTargetViewport.scrollY === viewport.scrollY
    && session.lastTargetViewport.zoom === viewport.zoom) {
    return session;
  }
  return { ...session, lastTargetViewport: viewport };
}

/** 관찰자가 직접 조작하면 paused-manual — 팔로우에서 빠져나가지 않고 일시정지로 남는다. */
export function observerInteracted(session: FollowSession): FollowSession {
  if (session.state !== "following") return session;
  return { ...session, state: "paused-manual" };
}

export function resumeFollow(session: FollowSession): FollowSession {
  if (session.state !== "paused-manual") return session;
  return { ...session, state: "following" };
}

/**
 * 관찰자 뷰포트를 대상 뷰포트로 부드럽게 맞춘다.
 * 페이지가 다르면 즉시 이동(보간 없음), 같으면 스크롤·줌을 t만큼 보간한다.
 */
export function syncObserverViewport(
  observer: FollowViewport,
  target: FollowViewport,
  t: number,
): FollowViewport {
  if (observer.pageId !== target.pageId) return target;
  const k = Math.max(0, Math.min(1, t));
  return {
    pageId: target.pageId,
    scrollX: observer.scrollX + (target.scrollX - observer.scrollX) * k,
    scrollY: observer.scrollY + (target.scrollY - observer.scrollY) * k,
    zoom: observer.zoom + (target.zoom - observer.zoom) * k,
  };
}

/* ------------------------------ 호스트 어댑터 ------------------------------ */

/** 라이브 뷰(프레즌스·서버 전송이 나르는 상대의 현재 보기 상태)를 팔로우 뷰포트로 바꾼다. */
export function followViewportFromLiveView(view: LiveViewState): FollowViewport {
  return { pageId: view.pageId, scrollX: view.scrollX, scrollY: view.scrollY, zoom: view.zoom };
}

export type ObserveBlockReason =
  | "ok"
  | "target-missing"
  | "session-hidden"
  | "target-focus"
  | "target-blocked";

export interface ObserveEligibility {
  readonly allowed: boolean;
  readonly reason: ObserveBlockReason;
}

/**
 * 이 대상을 지금 따라갈 수 있는가 — 팔로우 시작 게이트의 단일 판정.
 * 우선순위는 차단 > 세션 비공개 > 집중(위치 신호 숨김) > 부재 순이다.
 * 차단이 가장 강한 신호라, 대상이 명시적으로 막았으면 다른 사유보다 먼저 말한다.
 */
export function deriveObserveEligibility(input: {
  /** 프레즌스·라이브 뷰에 대상이 살아 있는가. */
  readonly targetPresent: boolean;
  /** 검수 세션 안에서 프레즌스 신호가 열려 있는가 (deriveSessionPresence.visible). */
  readonly sessionVisible: boolean;
  /** 대상의 위치 신호가 열려 있는가 (세션 참여자 cursorsVisible — 집중 모드면 false). */
  readonly targetCursorsVisible: boolean;
  /** 대상이 "따라오기 차단"을 켰는가. */
  readonly targetBlocked: boolean;
}): ObserveEligibility {
  if (input.targetBlocked) return { allowed: false, reason: "target-blocked" };
  if (!input.sessionVisible) return { allowed: false, reason: "session-hidden" };
  if (!input.targetCursorsVisible) return { allowed: false, reason: "target-focus" };
  if (!input.targetPresent) return { allowed: false, reason: "target-missing" };
  return { allowed: true, reason: "ok" };
}
