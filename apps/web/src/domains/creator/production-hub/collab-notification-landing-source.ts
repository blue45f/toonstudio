/**
 * 통합 협업 알림 인박스 — ProductionLandingPage 호스트용 이벤트 소스 어댑터.
 *
 * HOST_INSERTION_SPEC.md §2의 소스별 어댑트를 랜딩에서 실제로 닿을 수 있는
 * 기존 데이터 경로로 연결한다. 새 서버 계약은 만들지 않는다.
 *
 * 소스 3종 (전부 기존 정본):
 * 1. 서버 개인 작업함(getProductionPersonalInbox)의 "review" 버킷 —
 *    검수 요청은 기존 검수 작업(status "internal-review" +
 *    reviewerAssignmentIds)으로 저장되고 서버 작업함이 그대로 잡아내므로
 *    (review-request-model.ts 머리말), 이 버킷이 곧 "나에게 온 검수 요청"이다.
 * 2. 프로젝트 aggregate(getProductionProject)의 notifications /
 *    reviewDecisions / handoffs — 프로젝트 단위 협업 신호의 저장소.
 *    notifications는 ProductionNotificationDigest가 이미 소비하는 그 계약이고,
 *    승인·반려는 reviewDecisions, 인계 준비는 handoffs 상태 전이가 원천이다.
 * 3. 팀 댓글(listStudioTeamComments, 작품 단위 서버 계약) — 멘션 판정은
 *    계정 id(userId)로 확정하고, 본문·닫힘 변환은 모델의
 *    collabEventsFromCommentThreads 계약을 그대로 탄다.
 *
 * 읽음 상태: 서버 notifications의 status "read"는 serverReadIds로 되돌리고,
 * 그 밖의 읽음은 spec §3이 허용한 로컬 저장(localStorage)에 남긴다.
 * UI 문구는 동기화를 주장하지 않는다 (패널은 저장 위치를 언급하지 않음).
 */

import {
  collabEventsFromCommentThreads,
  type CollabNotificationEvent,
} from "./collab-notification-model";

/* ------------------------------------------------------------------ */
/* 딥링크 조립 (호스트 라우터 기준 문자열)                                */
/* ------------------------------------------------------------------ */

function projectBase(projectId: string): string {
  return `/production/projects/${encodeURIComponent(projectId)}`;
}

function episodeRoomHref(projectId: string, episodeId: string): string {
  return `${projectBase(projectId)}/episodes/${encodeURIComponent(episodeId)}`;
}

function compareReviewHref(projectId: string, episodeId: string): string {
  return `${episodeRoomHref(projectId, episodeId)}?roomView=compare`;
}

function surfaceHref(projectId: string, surface: "review" | "handoff" | "episodes" | "overview"): string {
  return `${projectBase(projectId)}/${surface}`;
}

/** 받은 검수함 항목의 목적지 — review-request-model.reviewInboxItemHref와 같은 규칙. */
function personalInboxItemHref(item: CollabPersonalInboxItemInput): string {
  if (item.bucket === "review" && item.episodeId) {
    return compareReviewHref(item.projectId, item.episodeId);
  }
  return `${projectBase(item.projectId)}/production?task=${encodeURIComponent(item.taskId)}`;
}

/* ------------------------------------------------------------------ */
/* 1. 서버 개인 작업함 → 검수 요청                                       */
/* ------------------------------------------------------------------ */

/** ProductionPersonalInboxItem의 구조적 부분집합 (dashboard-api 타입과 호환). */
export interface CollabPersonalInboxItemInput {
  readonly bucket: string;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly taskId: string;
  readonly taskTitle: string;
  readonly status: string;
  readonly dueAt: string | null;
  readonly episodeId: string | null;
}

/**
 * 개인 작업함 항목 중 "review" 버킷만 검수 요청 이벤트로 바꾼다.
 * 나머지 버킷(오늘 제출·진행 중 등)은 내 과제이지 협업 신호가 아니므로 제외한다
 * (spec §4: 두 목록을 한 행으로 합치지 않는다).
 * 항목에는 생성 시각이 없어, 마감 → 프로젝트 갱신 시각 → 조회 시각 순으로 쓴다.
 */
export function collabEventsFromPersonalInboxItems(
  items: readonly CollabPersonalInboxItemInput[],
  input: {
    readonly projectUpdatedAtById: ReadonlyMap<string, string>;
    readonly now: Date;
  },
): CollabNotificationEvent[] {
  const nowIso = input.now.toISOString();
  const events: CollabNotificationEvent[] = [];
  for (const item of items) {
    if (item.bucket !== "review") continue;
    const dueMs = item.dueAt ? Date.parse(item.dueAt) : Number.NaN;
    events.push({
      id: `review-task:${item.projectId}:${item.taskId}`,
      kind: "review-requested",
      actorName: item.projectTitle,
      title: item.taskTitle,
      detail: `${item.projectTitle} · 검수 요청`,
      createdAt: item.dueAt ?? input.projectUpdatedAtById.get(item.projectId) ?? nowIso,
      urgent: Number.isFinite(dueMs) && dueMs <= input.now.getTime(),
      flowKey: item.taskId,
      target: {
        surface: "review",
        projectId: item.projectId,
        ...(item.episodeId ? { episodeId: item.episodeId } : {}),
        href: personalInboxItemHref(item),
      },
    });
  }
  return events;
}

/* ------------------------------------------------------------------ */
/* 2. 프로젝트 aggregate → 서버 알림·승인 결과·인계 준비                  */
/* ------------------------------------------------------------------ */

/** ProductionProjectAggregate의 구조적 부분집합 (core 타입과 호환). */
export interface CollabAggregateInput {
  readonly projectId: string;
  readonly title: string;
  readonly parties: readonly {
    readonly id: string;
    readonly accountUserId: string | null;
    readonly publicDisplayName: string;
  }[];
  readonly assignments: readonly {
    readonly id: string;
    readonly partyId: string;
    readonly status: string;
  }[];
  readonly notifications?: readonly {
    readonly id: string;
    readonly assignmentId: string | null;
    readonly type: string;
    readonly title: string;
    readonly body: string;
    readonly href: string;
    readonly urgency: string;
    readonly sourceType: string;
    readonly sourceId: string;
    readonly status: string;
    readonly createdAt: string;
  }[];
  readonly reviewDecisions: readonly {
    readonly id: string;
    readonly reviewRoundId: string;
    readonly assignmentId: string;
    readonly value: string;
    readonly createdAt: string;
  }[];
  readonly handoffs: readonly {
    readonly id: string;
    readonly episodeId: string;
    readonly handoffRevision: number;
    readonly status: string;
    readonly createdByAssignmentId: string;
    readonly acceptedAt: string | null;
    readonly createdAt: string;
  }[];
}

export interface CollabAggregateEvents {
  readonly events: readonly CollabNotificationEvent[];
  /** 서버에서 이미 읽음인 알림에 대응하는 인박스 아이템 id 집합. */
  readonly serverReadIds: ReadonlySet<string>;
}

const HANDOVER_READY_STATUSES: ReadonlySet<string> = new Set([
  "ready-to-offer",
  "offered-to-art",
  "accepted-by-art",
  "production-started",
]);

/**
 * 프로젝트 aggregate 한 건을 협업 이벤트로 바꾼다.
 * - notifications: mention/review 타입만 (assignment·due 계열은 개인 작업함이
 *   이미 다루고, automation은 규칙 알림이라 협업 신호로 보지 않는다).
 *   수신자가 나로 지정됐거나 전체 공지(assignmentId 없음)인 것만.
 * - reviewDecisions: 내가 내린 결정은 내 알림이 아니므로 제외한다.
 *   approve 계열 → review-approved, request-changes/veto → review-rejected.
 * - handoffs: 준비 완료 이후 상태(ready-to-offer~)만 handover-ready.
 */
export function collabEventsFromProjectAggregate(
  aggregate: CollabAggregateInput,
  currentUserId: string,
): CollabAggregateEvents {
  const events: CollabNotificationEvent[] = [];
  const serverReadIds = new Set<string>();

  const myPartyIds = new Set(
    aggregate.parties.filter((party) => party.accountUserId === currentUserId).map((party) => party.id),
  );
  const myAssignmentIds = new Set(
    aggregate.assignments
      .filter((assignment) => myPartyIds.has(assignment.partyId) && assignment.status === "active")
      .map((assignment) => assignment.id),
  );
  const nameOfAssignment = (assignmentId: string): string => {
    const assignment = aggregate.assignments.find((entry) => entry.id === assignmentId);
    const party = assignment
      ? aggregate.parties.find((entry) => entry.id === assignment.partyId)
      : undefined;
    return party?.publicDisplayName ?? "팀원";
  };

  const projectPrefix = `${projectBase(aggregate.projectId)}/`;
  for (const notification of aggregate.notifications ?? []) {
    if (notification.type !== "mention" && notification.type !== "review") continue;
    if (notification.status === "dismissed") continue;
    if (notification.assignmentId !== null && !myAssignmentIds.has(notification.assignmentId)) continue;
    const isMention = notification.type === "mention";
    const href = notification.href.startsWith(projectPrefix)
      ? notification.href
      : isMention
        ? `${surfaceHref(aggregate.projectId, "episodes")}?thread=${encodeURIComponent(notification.sourceId)}`
        : surfaceHref(aggregate.projectId, "review");
    const eventId = `notif:${notification.id}`;
    if (notification.status === "read") serverReadIds.add(`collab-notif:${eventId}`);
    events.push({
      id: eventId,
      kind: isMention ? "comment-mention" : "review-requested",
      actorName: aggregate.title,
      title: notification.title,
      detail: notification.body,
      createdAt: notification.createdAt,
      urgent: notification.urgency === "critical",
      flowKey: notification.sourceId,
      target: {
        surface: isMention ? "episode-room" : "review",
        projectId: aggregate.projectId,
        href,
      },
    });
  }

  for (const decision of aggregate.reviewDecisions) {
    if (myAssignmentIds.has(decision.assignmentId)) continue;
    const approved = decision.value === "approve" || decision.value === "approve-with-conditions";
    const rejected = decision.value === "request-changes" || decision.value === "veto";
    if (!approved && !rejected) continue;
    const actorName = nameOfAssignment(decision.assignmentId);
    const title = approved
      ? decision.value === "approve-with-conditions"
        ? `${actorName} 님이 검수를 조건부로 승인했어요`
        : `${actorName} 님이 검수를 승인했어요`
      : decision.value === "veto"
        ? `${actorName} 님이 검수를 반려했어요`
        : `${actorName} 님이 수정을 요청했어요`;
    events.push({
      id: `decision:${decision.id}`,
      kind: approved ? "review-approved" : "review-rejected",
      actorName,
      title,
      detail: aggregate.title,
      createdAt: decision.createdAt,
      flowKey: decision.reviewRoundId,
      target: {
        surface: "review",
        projectId: aggregate.projectId,
        gateId: decision.reviewRoundId,
        href: surfaceHref(aggregate.projectId, "review"),
      },
    });
  }

  for (const handoff of aggregate.handoffs) {
    if (!HANDOVER_READY_STATUSES.has(handoff.status)) continue;
    events.push({
      id: `handover:${handoff.id}:r${handoff.handoffRevision}`,
      kind: "handover-ready",
      actorName: nameOfAssignment(handoff.createdByAssignmentId),
      title: "인계 패키지가 준비됐어요",
      detail: aggregate.title,
      createdAt: handoff.acceptedAt ?? handoff.createdAt,
      flowKey: handoff.id,
      target: {
        surface: "production",
        projectId: aggregate.projectId,
        episodeId: handoff.episodeId,
        href: surfaceHref(aggregate.projectId, "handoff"),
      },
    });
  }

  return { events, serverReadIds };
}

/* ------------------------------------------------------------------ */
/* 3. 팀 댓글 → 핀 멘션                                                  */
/* ------------------------------------------------------------------ */

/** StudioTeamCommentThread의 구조적 부분집합 (team-comment-client 타입과 호환). */
export interface CollabTeamCommentThreadInput {
  readonly id: string;
  readonly status: string;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
  readonly messages: readonly {
    readonly author: { readonly userId: string | null; readonly name: string };
    readonly body: string;
    readonly createdAt: string;
    readonly mentions: readonly { readonly userId: string | null; readonly name: string }[];
  }[];
}

/**
 * 팀 댓글 스레드에서 "남이 나를 언급한 메시지"를 골라 모델의 댓글 어댑터로 넘긴다.
 * 멘션 판정은 이름이 아니라 계정 id가 기준이다 (동명이인 오탐 방지 —
 * studio-comment-inbox-filter의 mentionsActor와 같은 원칙). 그래서 모델
 * 어댑터의 이름 기반 자기-글 제외는 빈 이름으로 무력화하고, 자기 글 판정은
 * 여기서 userId로 끝낸다.
 * 딥링크는 spec §2대로 회차 목록 표면에 threadId 쿼리를 붙인다.
 */
export function collabEventsFromTeamCommentThreads(
  threads: readonly CollabTeamCommentThreadInput[],
  input: { readonly projectId: string; readonly currentUserId: string },
): CollabNotificationEvent[] {
  const signals = [];
  for (const thread of threads) {
    const mentioning = thread.messages.find(
      (message) =>
        message.author.userId !== input.currentUserId
        && message.mentions.some((mention) => mention.userId === input.currentUserId),
    );
    if (!mentioning) continue;
    signals.push({
      threadId: thread.id,
      authorName: mentioning.author.name,
      body: mentioning.body,
      createdAt: mentioning.createdAt,
      resolved: thread.status === "resolved",
      ...(thread.resolvedAt ? { resolvedAt: thread.resolvedAt } : {}),
      mentionsCurrentUser: true,
      href: `${surfaceHref(input.projectId, "episodes")}?thread=${encodeURIComponent(thread.id)}`,
      projectId: input.projectId,
    });
  }
  return collabEventsFromCommentThreads(signals, "");
}

/* ------------------------------------------------------------------ */
/* 읽음 상태 로컬 저장 (spec §3: 서버 저장 도입 전 로컬 허용)              */
/* ------------------------------------------------------------------ */

export const COLLAB_INBOX_READ_STORAGE_KEY = "toonstudio.collab-inbox.read-ids.v1";
const MAX_STORED_READ_IDS = 500;

export interface CollabReadIdStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): CollabReadIdStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadCollabInboxReadIds(
  storage: CollabReadIdStorage | null = defaultStorage(),
): Set<string> {
  if (!storage) return new Set();
  try {
    const raw = storage.getItem(COLLAB_INBOX_READ_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((entry): entry is string => typeof entry === "string"));
  } catch {
    return new Set();
  }
}

export function saveCollabInboxReadIds(
  readIds: ReadonlySet<string>,
  storage: CollabReadIdStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(
      COLLAB_INBOX_READ_STORAGE_KEY,
      JSON.stringify([...readIds].slice(-MAX_STORED_READ_IDS)),
    );
  } catch {
    // 저장 실패(용량·차단)는 읽음 표시만 이번 세션에 머무는 것으로 degrade한다.
  }
}
