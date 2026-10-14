/**
 * 검수 세션 프레즌스 순수 모델 — "함께 보기" 세션 안에서만 서로가 보인다.
 *
 * 설계 원칙 (실제 사례 반례 반영):
 * - 프레즌스는 상시 노출이 아니다. 세션이 열리고 내가 참여한 동안에만 동료의
 *   위치(페이지·커서)가 보인다. 세션 밖에서는 누가 온라인인지조차 표시하지
 *   않아, 상시 접속 압박이 생기지 않는다.
 * - "집중 중"인 참여자는 이름만 보인다. 커서·보고 있는 위치·자리 비움 같은
 *   신호를 전부 숨겨서, 즉시 응답하라는 기대가 생기지 않는다.
 * - 세션에서 오간 판정은 채팅처럼 흘려보내지 않고 결정 이력으로 남긴다.
 *   세션이 끝나면 요약(누가·무엇을·어떻게 판정했나)이 검수 기록의 재료가 된다.
 * - 세션은 호스트가 끝내거나 전원이 나가면 끝난다. 방치된 세션은 최대
 *   지속 시간을 넘기면 자동으로 끝난 것으로 본다.
 */

export type ReviewSessionState = "live" | "ended";

/** 참여자의 주의 상태. focus인 동안은 위치 신호가 전부 숨겨진다. */
export type SessionAttention = "participating" | "focus";

export interface ReviewSessionParticipant {
  readonly actorId: string;
  readonly displayName: string;
  readonly joinedAt: string;
  readonly leftAt: string | null;
  readonly attention: SessionAttention;
}

export type SessionDecisionKind = "approve" | "request-changes" | "note";

export interface ReviewSessionDecision {
  readonly id: string;
  readonly actorId: string;
  readonly displayName: string;
  readonly kind: SessionDecisionKind;
  /** 판정 한 줄 요약. 핀·승인 게이트와 연결되는 문장이다. */
  readonly summary: string;
  readonly at: string;
}

export interface ReviewSession {
  readonly id: string;
  /** 세션이 열린 범위 (회차 ID). */
  readonly scopeId: string;
  readonly hostActorId: string;
  readonly state: ReviewSessionState;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly participants: readonly ReviewSessionParticipant[];
  readonly decisions: readonly ReviewSessionDecision[];
}

/** 방치된 세션의 최대 지속 시간. 넘기면 끝난 것으로 본다. */
export const REVIEW_SESSION_MAX_MS = 4 * 60 * 60 * 1000;
/** 같은 브라우저 다른 탭과 세션을 주고받는 채널 (프레즌스 채널과 같은 방식). */
export const REVIEW_SESSION_CHANNEL_NAME = "toonstudio-production-review-session-v1";

export function startReviewSession(input: {
  readonly id: string;
  readonly scopeId: string;
  readonly host: { readonly actorId: string; readonly displayName: string };
  readonly now: Date;
}): ReviewSession {
  const nowIso = input.now.toISOString();
  return {
    id: input.id,
    scopeId: input.scopeId,
    hostActorId: input.host.actorId,
    state: "live",
    startedAt: nowIso,
    endedAt: null,
    participants: [{
      actorId: input.host.actorId,
      displayName: input.host.displayName,
      joinedAt: nowIso,
      leftAt: null,
      attention: "participating",
    }],
    decisions: [],
  };
}

/** 참여: 이미 있으면 재참여로 보고 나간 시각을 지운다. 끝난 세션에는 참여할 수 없다. */
export function joinReviewSession(
  session: ReviewSession,
  actor: { readonly actorId: string; readonly displayName: string },
  now: Date,
): ReviewSession {
  if (session.state !== "live") return session;
  const nowIso = now.toISOString();
  const existing = session.participants.find((p) => p.actorId === actor.actorId);
  const participants = existing
    ? session.participants.map((p) => p.actorId === actor.actorId
      ? { ...p, displayName: actor.displayName, leftAt: null }
      : p)
    : [...session.participants, {
      actorId: actor.actorId,
      displayName: actor.displayName,
      joinedAt: nowIso,
      leftAt: null,
      attention: "participating" as const,
    }];
  return { ...session, participants };
}

/** 나가기: 전원이 나가면 세션은 자동으로 끝난다. */
export function leaveReviewSession(
  session: ReviewSession,
  actorId: string,
  now: Date,
): ReviewSession {
  if (session.state !== "live") return session;
  const nowIso = now.toISOString();
  const participants = session.participants.map((p) => p.actorId === actorId
    ? { ...p, leftAt: nowIso }
    : p);
  const anyoneLeft = participants.some((p) => p.leftAt === null);
  return {
    ...session,
    participants,
    state: anyoneLeft ? "live" : "ended",
    endedAt: anyoneLeft ? session.endedAt : nowIso,
  };
}

/** 집중 모드 전환: 참여 중일 때만 바꿀 수 있다. */
export function setSessionAttention(
  session: ReviewSession,
  actorId: string,
  attention: SessionAttention,
): ReviewSession {
  if (session.state !== "live") return session;
  return {
    ...session,
    participants: session.participants.map((p) => p.actorId === actorId && p.leftAt === null
      ? { ...p, attention }
      : p),
  };
}

/** 결정 기록: 세션 중 판정은 이력으로 쌓인다. 끝난 세션에는 쌓지 않는다. */
export function recordSessionDecision(
  session: ReviewSession,
  decision: Omit<ReviewSessionDecision, "id"> & { readonly id?: string },
): ReviewSession {
  if (session.state !== "live") return session;
  const entry: ReviewSessionDecision = {
    ...decision,
    id: decision.id ?? `decision:${session.id}:${session.decisions.length + 1}`,
  };
  return { ...session, decisions: [...session.decisions, entry] };
}

/** 세션 종료: 호스트만 끝낼 수 있다. 이미 끝난 세션은 그대로 둔다. */
export function endReviewSession(
  session: ReviewSession,
  actorId: string,
  now: Date,
): ReviewSession {
  if (session.state !== "live" || session.hostActorId !== actorId) return session;
  return { ...session, state: "ended", endedAt: now.toISOString() };
}

/**
 * 실효 상태: 선언상 live여도 전원이 나갔거나 최대 시간을 넘겼으면 ended로 본다.
 * 전원이 나간 경우 endedAt은 마지막으로 나간 시각이다.
 */
export function deriveEffectiveSession(session: ReviewSession, now: Date): ReviewSession {
  if (session.state !== "live") return session;
  const present = session.participants.filter((p) => p.leftAt === null);
  if (present.length === 0) {
    const lastLeftAt = session.participants
      .map((p) => p.leftAt)
      .filter((value): value is string => value !== null)
      .sort()
      .at(-1) ?? session.startedAt;
    return { ...session, state: "ended", endedAt: lastLeftAt };
  }
  if (now.getTime() - Date.parse(session.startedAt) > REVIEW_SESSION_MAX_MS) {
    return {
      ...session,
      state: "ended",
      endedAt: new Date(Date.parse(session.startedAt) + REVIEW_SESSION_MAX_MS).toISOString(),
    };
  }
  return session;
}

/* --------------------------------- 표시 도출 --------------------------------- */

export interface SessionParticipantDisplay {
  readonly actorId: string;
  readonly displayName: string;
  readonly isHost: boolean;
  readonly isSelf: boolean;
  /** focus면 "집중 중" — 위치 신호를 붙이지 않는 상태. */
  readonly attention: SessionAttention;
  /** 이 사람의 라이브 커서를 보여도 되는가 (세션 live + 참여 중 + focus 아님). */
  readonly cursorsVisible: boolean;
}

export interface SessionPresenceDisplay {
  /** 프레즌스 신호를 노출해도 되는가. 세션 밖·미참여·종료 시에는 전부 false. */
  readonly visible: boolean;
  readonly reason: "no-session" | "not-joined" | "ended" | "live";
  readonly participants: readonly SessionParticipantDisplay[];
  /** 내 커서를 발행해도 되는가 (참여 중 + focus 아님). */
  readonly selfCursorAllowed: boolean;
}

/**
 * 프레즌스 노출 정책의 단일 도출 지점.
 * - 세션이 없거나 끝났으면 아무것도 보이지 않는다.
 * - 세션이 열려 있어도 참여하지 않은 사람에게는 참여자 명단조차 보이지 않는다.
 *   (누가 모여 있는지 아는 것 자체가 압박이 될 수 있어서다.)
 * - 참여한 동안에만 명단과 커서가 열리고, focus 참여자는 이름만 남는다.
 */
export function deriveSessionPresence(
  session: ReviewSession | null,
  selfActorId: string | null,
  now: Date,
): SessionPresenceDisplay {
  if (!session) return { visible: false, reason: "no-session", participants: [], selfCursorAllowed: false };
  const effective = deriveEffectiveSession(session, now);
  if (effective.state !== "live") {
    return { visible: false, reason: "ended", participants: [], selfCursorAllowed: false };
  }
  const self = effective.participants.find((p) => p.actorId === selfActorId && p.leftAt === null);
  if (!selfActorId || !self) {
    return { visible: false, reason: "not-joined", participants: [], selfCursorAllowed: false };
  }
  const participants = effective.participants
    .filter((p) => p.leftAt === null)
    .map((p) => ({
      actorId: p.actorId,
      displayName: p.displayName,
      isHost: p.actorId === effective.hostActorId,
      isSelf: p.actorId === selfActorId,
      attention: p.attention,
      cursorsVisible: p.attention === "participating",
    }));
  return {
    visible: true,
    reason: "live",
    participants,
    selfCursorAllowed: self.attention === "participating",
  };
}

/* --------------------------------- 세션 요약 --------------------------------- */

export interface ReviewSessionSummary {
  readonly durationMs: number;
  readonly participantCount: number;
  readonly decisions: readonly ReviewSessionDecision[];
  /** 종류별 판정 수. note는 판정이 아니라 기록이라 제외한다. */
  readonly approvals: number;
  readonly changeRequests: number;
}

/** 끝난 세션의 요약: 검수 기록·인계 패키지에 붙일 재료. */
export function summarizeReviewSession(session: ReviewSession, now: Date): ReviewSessionSummary {
  const effective = deriveEffectiveSession(session, now);
  const endMs = effective.endedAt ? Date.parse(effective.endedAt) : now.getTime();
  return {
    durationMs: Math.max(0, endMs - Date.parse(effective.startedAt)),
    participantCount: effective.participants.length,
    decisions: effective.decisions,
    approvals: effective.decisions.filter((d) => d.kind === "approve").length,
    changeRequests: effective.decisions.filter((d) => d.kind === "request-changes").length,
  };
}
