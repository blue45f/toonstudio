import { describe, expect, it } from "vitest";

import {
  collabEventsFromPersonalInboxItems,
  collabEventsFromProjectAggregate,
  collabEventsFromTeamCommentThreads,
  loadCollabInboxReadIds,
  saveCollabInboxReadIds,
  COLLAB_INBOX_READ_STORAGE_KEY,
  type CollabAggregateInput,
  type CollabReadIdStorage,
} from "./collab-notification-landing-source";
import { projectCollabInbox } from "./collab-notification-model";

const NOW = new Date("2026-10-14T03:00:00.000Z");

describe("collab-notification-landing-source", () => {
  it("개인 작업함에서는 review 버킷만 검수 요청으로 바꾸고 비교 검수로 딥링크한다", () => {
    const events = collabEventsFromPersonalInboxItems(
      [
        {
          bucket: "review",
          projectId: "p1",
          projectTitle: "작품1",
          taskId: "task-1",
          taskTitle: "검수 요청 · 3화",
          status: "internal-review",
          dueAt: "2026-10-14T01:00:00.000Z",
          episodeId: "ep-3",
        },
        {
          bucket: "inProgress",
          projectId: "p1",
          projectTitle: "작품1",
          taskId: "task-2",
          taskTitle: "내 선화 작업",
          status: "in-progress",
          dueAt: null,
          episodeId: null,
        },
      ],
      { projectUpdatedAtById: new Map([["p1", "2026-10-13T00:00:00.000Z"]]), now: NOW },
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("review-requested");
    expect(events[0]?.urgent).toBe(true);
    expect(events[0]?.target.href).toBe("/production/projects/p1/episodes/ep-3?roomView=compare");
    expect(events[0]?.flowKey).toBe("task-1");
  });

  it("aggregate의 멘션 알림·남의 승인·준비된 인계를 투영하고 서버 읽음을 되돌린다", () => {
    const aggregate: CollabAggregateInput = {
      projectId: "p1",
      title: "작품1",
      parties: [
        { id: "party-me", accountUserId: "user-me", publicDisplayName: "나" },
        { id: "party-reviewer", accountUserId: "user-rev", publicDisplayName: "민지" },
      ],
      assignments: [
        { id: "as-me", partyId: "party-me", status: "active" },
        { id: "as-rev", partyId: "party-reviewer", status: "active" },
      ],
      notifications: [
        {
          id: "n1",
          assignmentId: "as-me",
          type: "mention",
          title: "멘션 알림",
          body: "확인 부탁해요",
          href: "/production/projects/p1/episodes/ep-1?thread=t1",
          urgency: "warning",
          sourceType: "thread",
          sourceId: "t1",
          status: "read",
          createdAt: "2026-10-14T01:00:00.000Z",
        },
        {
          id: "n2",
          assignmentId: "as-rev",
          type: "mention",
          title: "남의 멘션",
          body: "다른 사람 몫",
          href: "/production/projects/p1/episodes/ep-1",
          urgency: "info",
          sourceType: "thread",
          sourceId: "t2",
          status: "unread",
          createdAt: "2026-10-14T01:00:00.000Z",
        },
        {
          id: "n3",
          assignmentId: null,
          type: "automation",
          title: "자동화 알림",
          body: "규칙 알림은 제외",
          href: "/production/projects/p1/overview",
          urgency: "info",
          sourceType: "rule",
          sourceId: "r1",
          status: "unread",
          createdAt: "2026-10-14T01:00:00.000Z",
        },
      ],
      reviewDecisions: [
        { id: "d1", reviewRoundId: "round-1", assignmentId: "as-rev", value: "approve", createdAt: "2026-10-14T02:00:00.000Z" },
        { id: "d2", reviewRoundId: "round-2", assignmentId: "as-me", value: "request-changes", createdAt: "2026-10-14T02:30:00.000Z" },
      ],
      handoffs: [
        { id: "h1", episodeId: "ep-1", handoffRevision: 2, status: "ready-to-offer", createdByAssignmentId: "as-rev", acceptedAt: null, createdAt: "2026-10-13T09:00:00.000Z" },
        { id: "h2", episodeId: "ep-2", handoffRevision: 1, status: "draft", createdByAssignmentId: "as-rev", acceptedAt: null, createdAt: "2026-10-13T09:00:00.000Z" },
      ],
    };
    const { events, serverReadIds } = collabEventsFromProjectAggregate(aggregate, "user-me");
    expect(events.map((event) => event.kind)).toEqual(["comment-mention", "review-approved", "handover-ready"]);
    expect(serverReadIds.has("collab-notif:notif:n1")).toBe(true);
    const approval = events.find((event) => event.kind === "review-approved");
    expect(approval?.actorName).toBe("민지");
    expect(approval?.target.href).toBe("/production/projects/p1/review");
    const items = projectCollabInbox(events, serverReadIds);
    expect(items.find((item) => item.id === "collab-notif:notif:n1")?.read).toBe(true);
  });

  it("팀 댓글은 userId로 나를 언급한 남의 메시지만 멘션으로 바꾸고 해결 시 닫는다", () => {
    const events = collabEventsFromTeamCommentThreads(
      [
        {
          id: "t1",
          status: "resolved",
          createdAt: "2026-10-14T01:00:00.000Z",
          resolvedAt: "2026-10-14T04:00:00.000Z",
          messages: [
            { author: { userId: "user-rev", name: "민지" }, body: "@나 확인 부탁해요", createdAt: "2026-10-14T01:00:00.000Z", mentions: [{ userId: "user-me", name: "나" }] },
          ],
        },
        {
          id: "t2",
          status: "open",
          createdAt: "2026-10-14T01:00:00.000Z",
          resolvedAt: null,
          messages: [
            { author: { userId: "user-me", name: "나" }, body: "내가 쓴 글", createdAt: "2026-10-14T01:00:00.000Z", mentions: [{ userId: "user-me", name: "나" }] },
          ],
        },
        {
          id: "t3",
          status: "open",
          createdAt: "2026-10-14T01:00:00.000Z",
          resolvedAt: null,
          messages: [
            { author: { userId: "user-rev", name: "민지" }, body: "남 얘기", createdAt: "2026-10-14T01:00:00.000Z", mentions: [{ userId: "user-other", name: "준호" }] },
          ],
        },
      ],
      { projectId: "p1", currentUserId: "user-me" },
    );
    expect(events.map((event) => event.id)).toEqual(["mention:t1", "resolved:t1"]);
    expect(events[0]?.target.href).toBe("/production/projects/p1/episodes?thread=t1");
    const items = projectCollabInbox(events);
    expect(items).toHaveLength(1);
    expect(items[0]?.closed).toBe(true);
  });

  it("읽음 id 로컬 저장이 왕복하고 깨진 값은 빈 집합으로 degrade한다", () => {
    let stored: string | null = null;
    const storage: CollabReadIdStorage = {
      getItem: (key) => (key === COLLAB_INBOX_READ_STORAGE_KEY ? stored : null),
      setItem: (_key, value) => {
        stored = value;
      },
    };
    saveCollabInboxReadIds(new Set(["collab-notif:a", "collab-notif:b"]), storage);
    expect([...loadCollabInboxReadIds(storage)].sort()).toEqual(["collab-notif:a", "collab-notif:b"]);
    stored = "{broken";
    expect(loadCollabInboxReadIds(storage).size).toBe(0);
    expect(loadCollabInboxReadIds(null).size).toBe(0);
  });
});
