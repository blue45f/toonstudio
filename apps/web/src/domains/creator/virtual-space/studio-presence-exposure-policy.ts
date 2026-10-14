/**
 * 프레즌스 노출 정책 (Presence Exposure Policy)
 *
 * 반례에서 출발한다: Doist는 Slack을 2년 쓰고 전면 중단했다 — 프레즌스(온라인
 * 표시)가 상시 접속 압박을 만들기 때문이다 (Fast Company, "My company tried
 * Slack for two years. This is why we quit"). 대체 도구는 온라인 표시를
 * 의도적으로 제거했다. 그래서 이 정책의 기본값은 "보이지 않음"이다.
 *
 * 규칙:
 * 1. 프레즌스·동시 작업 신호(온라인 점·라이브 커서·타이핑)는 "함께 보기"
 *    검수 세션 안에서, 세션 참여자 사이에서만 흐른다. 세션이 없거나 내가
 *    참여하지 않았으면 상대의 신호는 물론 참여자 명단 자체도 보이지 않는다.
 * 2. 집중 중(focusing)·자리 비움(away)·휴식 중(break)인 참여자는 명단에만
 *    이름과 상태 문구로 남고, 온라인 점·라이브 커서·타이핑은 전부 숨긴다.
 *    "즉시 답장" 기대가 생기지 않게 문구로 못 박고, 재촉(nudge)도 막는다.
 * 3. 내 신호 발행도 같은 정책을 따른다. 세션 밖에서는 아무것도 발행하지
 *    않고, 집중 중이면 커서·타이핑을 발행하지 않는다 — 보이는 쪽만 바꾸는
 *    가짜 집중 모드를 만들지 않는다.
 *
 * 페이지 잠금(page-edit-lock-model)과의 역할 분리: 잠금은 "점유"를,
 * 이 정책은 "노출"을 다룬다. 잠금 표시는 이 정책을 통과한 참여자에게만
 * 붙는다 (HOST_INSERTION_SPEC.md 참조).
 *
 * 순수 로직 모듈. studio-virtual-space-user-status.ts의 상태 어휘를 그대로
 * 쓰고, 새 상태를 만들지 않는다.
 */

import type { StudioUserStatus } from "./studio-virtual-space-user-status";

/**
 * 함께 보기(검수) 세션의 범위 스냅샷. 프레즌스가 흐를 수 있는 유일한 맥락.
 * 세션이 없으면 null을 넘긴다 — 그러면 어떤 신호도 보이지 않는다.
 */
export interface StudioPresenceSessionScope {
  readonly sessionId: string;
  /** 세션 참여자 sessionId 목록. 이 목록 밖의 사람은 명단에도 없다. */
  readonly participantSessionIds: readonly string[];
}

/** 답장 기대 수준. UI는 이 값으로 재촉성 affordance를 켜고 끈다. */
export type StudioPresenceReplyExpectation =
  | "live" // 세션 안에서 실시간으로 주고받는 중
  | "async" // 지금은 집중 중 — 세션 뒤에 확인한다
  | "none"; // 자리 비움·휴식 — 답을 기대하지 않는다

/** 정책 입력이 되는 최소 프레즌스 항목 (presence 스냅샷의 peer). */
export interface StudioPresencePeerInput {
  readonly sessionId: string;
  readonly userStatus?: StudioUserStatus | null | undefined;
}

/** 한 사람에 대한 노출 판정. UI는 이 판정만 소비한다. */
export interface StudioPresenceExposure {
  readonly sessionId: string;
  /** 명단에 이름이 오르는가. false면 존재 자체를 알 수 없다. */
  readonly visible: boolean;
  /** 명단에만 있고 실시간 신호는 없는 상태인가 (집중·자리 비움·휴식). */
  readonly rosterOnly: boolean;
  readonly showLiveCursor: boolean;
  readonly showTyping: boolean;
  /** 초록 점 같은 "지금 접속 중" 표시를 붙여도 되는가. */
  readonly showOnlineDot: boolean;
  readonly replyExpectation: StudioPresenceReplyExpectation;
  /** 멘션 재촉·리마인드 같은 즉시 응답 유도 장치를 막아야 하는가. */
  readonly suppressNudge: boolean;
  /** 판정에 쓰인 상태. 없으면 null (세션 참여 기본값으로 취급). */
  readonly status: StudioUserStatus | null;
  /** 즉시 응답 기대를 없애는 안내 문구. 실시간 상태면 null. */
  readonly note: { readonly ko: string; readonly en: string } | null;
}

/** 내 신호 발행 정책. 수신 표시만 바꾸는 가짜 집중 모드를 막는다. */
export interface StudioPresenceBroadcast {
  /** 프레즌스 패킷 자체를 발행하는가 (세션 밖이면 false). */
  readonly publishPresence: boolean;
  readonly publishCursor: boolean;
  readonly publishTyping: boolean;
  /** 상태(userStatus)를 패킷에 실어 보내는가. */
  readonly publishStatus: boolean;
}

const HIDDEN_EXPOSURE = {
  visible: false,
  rosterOnly: false,
  showLiveCursor: false,
  showTyping: false,
  showOnlineDot: false,
  replyExpectation: "none",
  suppressNudge: true,
  note: null,
} as const;

const FOCUS_NOTE = {
  ko: "집중 중 — 지금 답을 기대하지 마세요. 세션이 끝나면 확인해요.",
  en: "Focusing — please don't expect a reply now. They'll check after the session.",
} as const;

const AWAY_NOTE = {
  ko: "자리 비움 — 돌아오면 확인해요.",
  en: "Away — they'll check when they're back.",
} as const;

const BREAK_NOTE = {
  ko: "휴식 중 — 돌아오면 확인해요.",
  en: "On a break — they'll check when they're back.",
} as const;

/** 실시간 신호를 전부 여는 상태인가. 상태 미지정(참여 기본값)도 포함한다. */
function isLiveStatus(status: StudioUserStatus | null): boolean {
  return status === null || status === "available" || status === "in-meeting" || status === "presenting";
}

/**
 * 한 사람의 노출을 판정한다.
 *
 * @param peer 판정 대상 (presence 스냅샷의 peer)
 * @param scope 함께 보기 세션 범위. null이면 무조건 숨긴다.
 * @param selfSessionId 판정을 받는 본인의 sessionId. 본인이 세션에
 *   참여하지 않았으면 참여자 명단 자체가 보이지 않으므로 전부 숨긴다.
 */
export function deriveStudioPresenceExposure(
  peer: StudioPresencePeerInput,
  scope: StudioPresenceSessionScope | null,
  selfSessionId: string,
): StudioPresenceExposure {
  const status = peer.userStatus ?? null;
  if (!scope || !scope.participantSessionIds.includes(selfSessionId)) {
    return Object.freeze({ sessionId: peer.sessionId, status, ...HIDDEN_EXPOSURE });
  }
  if (!scope.participantSessionIds.includes(peer.sessionId)) {
    return Object.freeze({ sessionId: peer.sessionId, status, ...HIDDEN_EXPOSURE });
  }
  if (isLiveStatus(status)) {
    return Object.freeze({
      sessionId: peer.sessionId,
      status,
      visible: true,
      rosterOnly: false,
      showLiveCursor: true,
      showTyping: true,
      showOnlineDot: true,
      replyExpectation: "live" as const,
      suppressNudge: false,
      note: null,
    });
  }
  // 여기부터는 집중 존중 구간: 명단에는 남되 실시간 신호는 전부 끈다.
  const note = status === "focusing" ? FOCUS_NOTE : status === "away" ? AWAY_NOTE : BREAK_NOTE;
  return Object.freeze({
    sessionId: peer.sessionId,
    status,
    visible: true,
    rosterOnly: true,
    showLiveCursor: false,
    showTyping: false,
    showOnlineDot: false,
    replyExpectation: status === "focusing" ? ("async" as const) : ("none" as const),
    suppressNudge: true,
    note,
  });
}

/**
 * presence 스냅샷 전체에 정책을 적용한다. 순서는 입력을 따르고,
 * 숨김 판정도 배열에 남긴다 — 소비 측이 "왜 안 보이는지"를 판정값으로
 * 설명할 수 있게 하기 위해서다. 화면에는 visible인 항목만 올린다.
 */
export function deriveStudioPresenceExposures(
  peers: readonly StudioPresencePeerInput[],
  scope: StudioPresenceSessionScope | null,
  selfSessionId: string,
): readonly StudioPresenceExposure[] {
  return Object.freeze(
    peers.map((peer) => deriveStudioPresenceExposure(peer, scope, selfSessionId)),
  );
}

/** 지금 화면에 올려도 되는 노출만 추린다. */
export function visibleStudioPresenceExposures(
  exposures: readonly StudioPresenceExposure[],
): readonly StudioPresenceExposure[] {
  return Object.freeze(exposures.filter((exposure) => exposure.visible));
}

/**
 * 내 프레즌스 발행 정책을 판정한다.
 * 세션 밖에서는 어떤 신호도 나가지 않고, 집중 중이면 명단용 상태만 나가고
 * 커서·타이핑은 나가지 않는다. 자리 비움·휴식도 커서·타이핑은 나가지 않는다.
 */
export function deriveStudioPresenceBroadcast(
  selfStatus: StudioUserStatus | null,
  scope: StudioPresenceSessionScope | null,
  selfSessionId: string,
): StudioPresenceBroadcast {
  if (!scope || !scope.participantSessionIds.includes(selfSessionId)) {
    return Object.freeze({
      publishPresence: false,
      publishCursor: false,
      publishTyping: false,
      publishStatus: false,
    });
  }
  if (isLiveStatus(selfStatus)) {
    return Object.freeze({
      publishPresence: true,
      publishCursor: true,
      publishTyping: true,
      publishStatus: true,
    });
  }
  return Object.freeze({
    publishPresence: true,
    publishCursor: false,
    publishTyping: false,
    publishStatus: true,
  });
}
