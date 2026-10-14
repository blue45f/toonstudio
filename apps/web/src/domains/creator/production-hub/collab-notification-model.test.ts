import { describe, expect, it } from "vitest";

import {
  collabEventsFromCommentThreads,
  collabInboxReadIds,
  filterCollabInbox,
  markAllCollabInboxRead,
  markCollabInboxRead,
  projectCollabInbox,
  summarizeCollabInbox,
  type CollabNotificationEvent,
} from "./collab-notification-model";

const TARGET = { surface: "review" as const, href: "/sample/production/review" };

function event(partial: Partial<CollabNotificationEvent> & { id: string; kind: CollabNotificationEvent["kind"] }): CollabNotificationEvent {
  return {
    actorName: "민지",
    title: partial.id,
    createdAt: "2026-10-14T01:00:00+09:00",
    target: TARGET,
    ...partial,
  };
}

describe("collab-notification-model", () => {
  it("이벤트 종류를 카테고리로 투영하고 결정적 id를 붙인다", () => {
    const items = projectCollabInbox([
      event({ id: "e1", kind: "comment-mention", title: "멘션" }),
      event({ id: "e2", kind: "review-requested", title: "검수 요청", flowKey: "gate-1" }),
      event({ id: "e3", kind: "handover-ready", title: "인계 준비 완료" }),
    ]);
    expect(items.map((i) => [i.id, i.category])).toEqual([
      ["collab-notif:e1", "mention"],
      ["collab-notif:e2", "review-request"],
      ["collab-notif:e3", "handover"],
    ]);
  });

  it("같은 이벤트 id는 한 번만 투영된다", () => {
    const items = projectCollabInbox([
      event({ id: "e1", kind: "comment-mention" }),
      event({ id: "e1", kind: "comment-mention", title: "중복" }),
    ]);
    expect(items).toHaveLength(1);
  });

  it("승인이 오면 같은 흐름의 검수 요청이 닫히고 승인 결과는 별도 항목이 된다", () => {
    const items = projectCollabInbox([
      event({ id: "req", kind: "review-requested", flowKey: "gate-9", createdAt: "2026-10-14T01:00:00+09:00" }),
      event({ id: "apv", kind: "review-approved", flowKey: "gate-9", createdAt: "2026-10-14T02:00:00+09:00" }),
    ]);
    const request = items.find((i) => i.id === "collab-notif:req");
    const approval = items.find((i) => i.id === "collab-notif:apv");
    expect(request?.closed).toBe(true);
    expect(request?.closedByKind).toBe("review-approved");
    expect(approval?.category).toBe("approval");
    expect(approval?.closed).toBe(false);
  });

  it("핀 해결 신호는 새 항목을 만들지 않고 열린 멘션을 닫는다", () => {
    const items = projectCollabInbox([
      event({ id: "m1", kind: "comment-mention", flowKey: "thread-1", createdAt: "2026-10-14T01:00:00+09:00" }),
      event({ id: "r1", kind: "pin-resolved", flowKey: "thread-1", createdAt: "2026-10-14T03:00:00+09:00" }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.closed).toBe(true);
    expect(items[0]?.closedByKind).toBe("pin-resolved");
  });

  it("정렬은 미읽음 → 열림 → 긴급 → 최신 순이다", () => {
    const items = projectCollabInbox(
      [
        event({ id: "old-unread", kind: "comment-mention", createdAt: "2026-10-13T01:00:00+09:00" }),
        event({ id: "urgent", kind: "review-requested", urgent: true, createdAt: "2026-10-12T01:00:00+09:00" }),
        event({ id: "read-one", kind: "handover-ready", createdAt: "2026-10-14T05:00:00+09:00" }),
      ],
      new Set(["collab-notif:read-one"]),
    );
    expect(items.map((i) => i.id)).toEqual([
      "collab-notif:urgent",
      "collab-notif:old-unread",
      "collab-notif:read-one",
    ]);
  });

  it("요약과 탭 필터가 카테고리·읽음을 집계한다", () => {
    const items = projectCollabInbox([
      event({ id: "m", kind: "comment-mention", urgent: true }),
      event({ id: "r", kind: "review-requested" }),
    ]);
    const summary = summarizeCollabInbox(items);
    expect(summary.total).toBe(2);
    expect(summary.unread).toBe(2);
    expect(summary.urgentUnread).toBe(1);
    expect(summary.byCategory.mention.unread).toBe(1);
    expect(filterCollabInbox(items, "mention")).toHaveLength(1);
    const read = markCollabInboxRead(items, "collab-notif:m");
    expect(filterCollabInbox(read, "unread")).toHaveLength(1);
    expect(collabInboxReadIds(markAllCollabInboxRead(items)).size).toBe(2);
  });

  it("댓글 스레드 어댑터는 남이 나를 언급한 스레드만 이벤트로 바꾼다", () => {
    const events = collabEventsFromCommentThreads(
      [
        { threadId: "t1", authorName: "민지", body: "여기 확인 부탁해요\n두 번째 줄", createdAt: "2026-10-14T01:00:00+09:00", resolved: false, mentionsCurrentUser: true, href: "/r?t=t1" },
        { threadId: "t2", authorName: "나", body: "내 글", createdAt: "2026-10-14T01:00:00+09:00", resolved: false, mentionsCurrentUser: true, href: "/r?t=t2" },
        { threadId: "t3", authorName: "민지", body: "남 얘기", createdAt: "2026-10-14T01:00:00+09:00", resolved: false, mentionsCurrentUser: false, href: "/r?t=t3" },
        { threadId: "t4", authorName: "준호", body: "고쳤어요", createdAt: "2026-10-14T01:00:00+09:00", resolved: true, resolvedAt: "2026-10-14T04:00:00+09:00", mentionsCurrentUser: true, href: "/r?t=t4" },
      ],
      "나",
    );
    expect(events.map((e) => e.id)).toEqual(["mention:t1", "mention:t4", "resolved:t4"]);
    expect(events[0]?.detail).toBe("여기 확인 부탁해요");
    const projected = projectCollabInbox(events);
    const t4 = projected.find((i) => i.id === "collab-notif:mention:t4");
    expect(t4?.closed).toBe(true);
  });
});
