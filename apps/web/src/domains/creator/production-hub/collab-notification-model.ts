/**
 * 통합 협업 알림 인박스 투영 모델.
 *
 * 근거: competitor-benchmark-expansion REPORT G8 — Figma는 멘션·답글·해결 알림이
 * 하나의 스트림으로 모이고 알림에서 해당 위치로 바로 이동한다. 우리는 신호 표면이
 * 댓글 인박스·워크스페이스 인박스·역할 알림 센터·알림 다이제스트·알림 센터로
 * 흩어져 있어, 멘션·검수 요청·승인 결과·인계 신호를 한곳에서 놓치지 않고 보는
 * 투영 계층이 없었다 (기존 체크리스트 '협업 알림 통합' 항목과 같은 격차).
 *
 * 이 모델은 기존 표면들을 대체하지 않는다. 협업 이벤트를 정규화해 우선순위·
 * 읽음·딥링크 타깃·"결과가 나와 닫힌 요청"을 가진 인박스 아이템으로 투영하는
 * 순수 계층이다. 이벤트 소스 어댑터와 호스트 삽입 지점은 HOST_INSERTION_SPEC.md.
 */

export type CollabNotificationCategory =
  | "mention"
  | "review-request"
  | "approval"
  | "handover";

export type CollabNotificationEventKind =
  | "comment-mention"
  | "review-requested"
  | "review-approved"
  | "review-rejected"
  | "pin-resolved"
  | "handover-ready";

export interface CollabNotificationTarget {
  readonly surface: "episode-room" | "review" | "production" | "landing";
  readonly projectId?: string;
  readonly episodeId?: string;
  readonly threadId?: string;
  readonly gateId?: string;
  /** 호스트 라우터가 여는 딥링크. 알림 클릭 한 번에 그 자리로 닿는 것이 계약이다. */
  readonly href: string;
}

export interface CollabNotificationEvent {
  readonly id: string;
  readonly kind: CollabNotificationEventKind;
  readonly actorName: string;
  /** 사용자에게 보일 제목. 문구 조립은 어댑터 책임 (예: "민지 님이 검수를 요청했어요"). */
  readonly title: string;
  readonly detail?: string;
  readonly createdAt: string;
  readonly urgent?: boolean;
  /** 요청과 그 결과·해결이 공유하는 흐름 키 (예: threadId, gateId). */
  readonly flowKey?: string;
  readonly target: CollabNotificationTarget;
}

export interface CollabInboxItem {
  readonly id: string;
  readonly category: CollabNotificationCategory;
  readonly kind: CollabNotificationEventKind;
  readonly title: string;
  readonly detail: string | null;
  readonly actorName: string;
  readonly createdAt: string;
  readonly urgent: boolean;
  readonly read: boolean;
  /** 결과가 나와 더 조치할 필요가 없는 요청. */
  readonly closed: boolean;
  readonly closedByKind: CollabNotificationEventKind | null;
  readonly flowKey: string | null;
  readonly target: CollabNotificationTarget;
}

export type CollabInboxTab = "all" | "unread" | CollabNotificationCategory;

const CATEGORY_BY_KIND: Readonly<Record<CollabNotificationEventKind, CollabNotificationCategory | null>> = {
  "comment-mention": "mention",
  "review-requested": "review-request",
  "review-approved": "approval",
  "review-rejected": "approval",
  "pin-resolved": null, // 새 아이템을 만들지 않고 열린 요청을 닫는 신호로만 쓴다
  "handover-ready": "handover",
};

const CLOSING_KINDS: ReadonlySet<CollabNotificationEventKind> = new Set([
  "review-approved",
  "review-rejected",
  "pin-resolved",
]);

/**
 * 이벤트 목록을 인박스 아이템으로 투영한다.
 * - 같은 이벤트 id는 한 번만 (첫 항목 우선).
 * - 승인·반려·핀 해결 이벤트는 같은 flowKey의 열린 검수 요청/멘션 아이템을 닫는다.
 * - 정렬은 결정적: 미읽음 → 열림 → 긴급 → 최신 → id.
 */
export function projectCollabInbox(
  events: readonly CollabNotificationEvent[],
  readIds: ReadonlySet<string> = new Set(),
): CollabInboxItem[] {
  const seen = new Set<string>();
  const unique: CollabNotificationEvent[] = [];
  for (const event of events) {
    if (!event.id || seen.has(event.id)) continue;
    seen.add(event.id);
    unique.push(event);
  }
  const chronological = [...unique].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );

  const items: CollabInboxItem[] = [];
  const openByFlowKey = new Map<string, CollabInboxItem[]>();
  const closeOpenItems = (flowKey: string | undefined, kind: CollabNotificationEventKind) => {
    if (!flowKey) return;
    const open = openByFlowKey.get(flowKey) ?? [];
    for (let i = 0; i < open.length; i += 1) {
      const item = open[i]!;
      if (item.closed) continue;
      const closedItem: CollabInboxItem = { ...item, closed: true, closedByKind: kind };
      open[i] = closedItem;
      const position = items.indexOf(item);
      if (position >= 0) items[position] = closedItem;
    }
  };

  for (const event of chronological) {
    if (CLOSING_KINDS.has(event.kind)) {
      closeOpenItems(event.flowKey, event.kind);
    }
    const category = CATEGORY_BY_KIND[event.kind];
    if (!category) continue;
    const item: CollabInboxItem = {
      id: `collab-notif:${event.id}`,
      category,
      kind: event.kind,
      title: event.title,
      detail: event.detail?.trim() ? event.detail : null,
      actorName: event.actorName,
      createdAt: event.createdAt,
      urgent: event.urgent === true,
      read: readIds.has(`collab-notif:${event.id}`),
      closed: false,
      closedByKind: null,
      flowKey: event.flowKey ?? null,
      target: event.target,
    };
    items.push(item);
    if (event.flowKey && (category === "review-request" || category === "mention")) {
      const list = openByFlowKey.get(event.flowKey) ?? [];
      list.push(item);
      openByFlowKey.set(event.flowKey, list);
    }
  }

  return items.sort(
    (a, b) =>
      Number(a.read) - Number(b.read)
      || Number(a.closed) - Number(b.closed)
      || Number(b.urgent) - Number(a.urgent)
      || b.createdAt.localeCompare(a.createdAt)
      || a.id.localeCompare(b.id),
  );
}

export function filterCollabInbox(
  items: readonly CollabInboxItem[],
  tab: CollabInboxTab,
): CollabInboxItem[] {
  if (tab === "all") return [...items];
  if (tab === "unread") return items.filter((item) => !item.read);
  return items.filter((item) => item.category === tab);
}

export interface CollabInboxSummary {
  readonly total: number;
  readonly unread: number;
  readonly urgentUnread: number;
  readonly byCategory: Readonly<Record<CollabNotificationCategory, { readonly total: number; readonly unread: number }>>;
}

export function summarizeCollabInbox(items: readonly CollabInboxItem[]): CollabInboxSummary {
  const byCategory: Record<CollabNotificationCategory, { total: number; unread: number }> = {
    mention: { total: 0, unread: 0 },
    "review-request": { total: 0, unread: 0 },
    approval: { total: 0, unread: 0 },
    handover: { total: 0, unread: 0 },
  };
  let unread = 0;
  let urgentUnread = 0;
  for (const item of items) {
    byCategory[item.category].total += 1;
    if (!item.read) {
      unread += 1;
      byCategory[item.category].unread += 1;
      if (item.urgent && !item.closed) urgentUnread += 1;
    }
  }
  return { total: items.length, unread, urgentUnread, byCategory };
}

export function markCollabInboxRead(
  items: readonly CollabInboxItem[],
  itemId: string,
): CollabInboxItem[] {
  return items.map((item) => (item.id === itemId ? { ...item, read: true } : item));
}

export function markAllCollabInboxRead(
  items: readonly CollabInboxItem[],
): CollabInboxItem[] {
  return items.map((item) => (item.read ? item : { ...item, read: true }));
}

/** 읽음 상태를 저장소에 남길 때 쓰는 id 집합 (투영 입력으로 되돌린다). */
export function collabInboxReadIds(items: readonly CollabInboxItem[]): Set<string> {
  return new Set(items.filter((item) => item.read).map((item) => item.id));
}

/* ------------------------------------------------------------------ */
/* 댓글 스레드 신호 어댑터                                              */
/* ------------------------------------------------------------------ */

/**
 * 댓글 문서에서 어댑터가 뽑아 주는 최소 신호. 멘션 판정 자체는 기존
 * studio-comment-inbox-filter(mentionsActor)가 담당하고, 여기서는 그 결과를
 * 협업 이벤트로 바꾸는 계약만 정의한다.
 */
export interface CollabCommentThreadSignal {
  readonly threadId: string;
  readonly authorName: string;
  readonly body: string;
  readonly createdAt: string;
  readonly resolved: boolean;
  /** 해결 시각이 따로 있으면 닫힘 신호의 시각으로 쓴다 (없으면 생성 시각). */
  readonly resolvedAt?: string;
  readonly mentionsCurrentUser: boolean;
  readonly urgent?: boolean;
  readonly href: string;
  readonly projectId?: string;
  readonly episodeId?: string;
}

function firstLine(body: string): string {
  const line = body.split("\n").map((part) => part.trim()).find(Boolean) ?? "";
  return line.length > 80 ? `${line.slice(0, 80)}…` : line;
}

/**
 * 내가 언급된 스레드 → 멘션 이벤트, 그 스레드가 해결되면 → 닫힘 신호.
 * 내가 쓴 스레드는 제외한다. flowKey는 threadId로 통일해 투영에서 닫힌다.
 */
export function collabEventsFromCommentThreads(
  signals: readonly CollabCommentThreadSignal[],
  currentUserName: string,
): CollabNotificationEvent[] {
  const events: CollabNotificationEvent[] = [];
  for (const signal of signals) {
    if (!signal.mentionsCurrentUser) continue;
    if (signal.authorName === currentUserName) continue;
    const target: CollabNotificationTarget = {
      surface: "episode-room",
      ...(signal.projectId ? { projectId: signal.projectId } : {}),
      ...(signal.episodeId ? { episodeId: signal.episodeId } : {}),
      threadId: signal.threadId,
      href: signal.href,
    };
    events.push({
      id: `mention:${signal.threadId}`,
      kind: "comment-mention",
      actorName: signal.authorName,
      title: `${signal.authorName} 님이 나를 언급했어요`,
      detail: firstLine(signal.body),
      createdAt: signal.createdAt,
      urgent: signal.urgent === true,
      flowKey: signal.threadId,
      target,
    });
    if (signal.resolved) {
      events.push({
        id: `resolved:${signal.threadId}`,
        kind: "pin-resolved",
        actorName: signal.authorName,
        title: "핀이 해결됐어요",
        createdAt: signal.resolvedAt ?? signal.createdAt,
        flowKey: signal.threadId,
        target,
      });
    }
  }
  return events;
}
