import { describe, expect, it } from "vitest";

import {
  buildReviewDecisionLog,
  countOpenReviewThreads,
  groupReviewThreadsBySubject,
  reviewThreadDecision,
  reviewThreadSubject,
} from "./studio-review-thread-decision";
import type { StudioTeamCommentThread } from "./studio-team-comment-client";

function thread(overrides: Partial<StudioTeamCommentThread>): StudioTeamCommentThread {
  return {
    id: "t1",
    workId: "w1",
    anchor: { type: "frame", pageId: "p1", frameId: "f1" },
    status: "open",
    createdBy: { userId: "u1", name: "작가" },
    resolvedBy: null,
    resolvedAt: null,
    createdAt: "2026-10-14T00:00:00+09:00",
    updatedAt: "2026-10-14T00:00:00+09:00",
    latestActivitySequence: "1",
    unread: false,
    messageCount: 1,
    messages: [
      {
        id: "m1",
        author: { userId: "u1", name: "작가" },
        body: "이 컷 표정이 어색해요",
        mentions: [],
        createdAt: "2026-10-14T00:00:00+09:00",
      },
    ],
    messagesTruncated: false,
    ...overrides,
  } as StudioTeamCommentThread;
}

const RESOLVED = {
  status: "resolved",
  resolvedBy: { userId: "u2", name: "편집자" },
  resolvedAt: "2026-10-14T01:00:00+09:00",
  messages: [
    {
      id: "m1",
      author: { userId: "u1", name: "작가" },
      body: "이 컷 표정이 어색해요",
      mentions: [],
      createdAt: "2026-10-14T00:00:00+09:00",
    },
    {
      id: "m2",
      author: { userId: "u2", name: "편집자" },
      body: "입꼬리만 올리는 걸로 확정",
      mentions: [],
      createdAt: "2026-10-14T01:00:00+09:00",
    },
  ],
  messageCount: 2,
} as Partial<StudioTeamCommentThread>;

describe("reviewThreadSubject", () => {
  it("frame 앵커는 컷 주제로 도출한다", () => {
    const subject = reviewThreadSubject(thread({}));
    expect(subject.kind).toBe("cut");
    expect(subject.pageId).toBe("p1");
    expect(subject.frameId).toBe("f1");
  });

  it("같은 컷의 스레드는 같은 주제 키를 갖는다", () => {
    const a = reviewThreadSubject(thread({ id: "t1" }));
    const b = reviewThreadSubject(thread({ id: "t2" }));
    expect(a.key).toBe(b.key);
  });

  it("다른 페이지의 같은 frameId는 다른 주제다", () => {
    const a = reviewThreadSubject(thread({}));
    const b = reviewThreadSubject(
      thread({ anchor: { type: "frame", pageId: "p2", frameId: "f1" } }),
    );
    expect(a.key).not.toBe(b.key);
  });
});

describe("reviewThreadDecision", () => {
  it("열린 스레드는 아직 결정이 아니다", () => {
    expect(reviewThreadDecision(thread({}))).toEqual({
      threadId: "t1",
      outcome: "open",
      decidedByName: null,
      decidedAt: null,
      closingNote: null,
    });
  });

  it("해결된 스레드는 해결자·시각·마지막 메시지를 결정으로 고정한다", () => {
    const decision = reviewThreadDecision(thread(RESOLVED));
    expect(decision.outcome).toBe("resolved");
    expect(decision.decidedByName).toBe("편집자");
    expect(decision.decidedAt).toBe("2026-10-14T01:00:00+09:00");
    expect(decision.closingNote).toBe("입꼬리만 올리는 걸로 확정");
  });
});

describe("groupReviewThreadsBySubject", () => {
  it("채팅 피드처럼 섞지 않고 컷 단위로 묶는다", () => {
    const groups = groupReviewThreadsBySubject([
      thread({ id: "t1" }),
      thread({ id: "t2", anchor: { type: "page", pageId: "p1" } }),
      thread({ id: "t3" }),
    ]);
    expect(groups).toHaveLength(2);
    const cutGroup = groups.find((g) => g.subject.kind === "cut");
    expect(cutGroup?.threads.map((t) => t.id)).toEqual(["t1", "t3"]);
  });

  it("미해결이 있는 그룹이 먼저 온다", () => {
    const groups = groupReviewThreadsBySubject([
      thread({ id: "done", anchor: { type: "page", pageId: "p9" }, ...RESOLVED }),
      thread({ id: "open", anchor: { type: "page", pageId: "p1" } }),
    ]);
    expect(groups[0]?.threads[0]?.id).toBe("open");
    expect(groups[0]?.openCount).toBe(1);
  });
});

describe("buildReviewDecisionLog / countOpenReviewThreads", () => {
  it("결정 이력은 해결된 스레드만, 해결 시각 내림차순", () => {
    const log = buildReviewDecisionLog([
      thread({ id: "old", ...RESOLVED, resolvedAt: "2026-10-14T01:00:00+09:00" }),
      thread({
        id: "new",
        anchor: { type: "page", pageId: "p2" },
        ...RESOLVED,
        resolvedAt: "2026-10-14T03:00:00+09:00",
      }),
      thread({ id: "open" }),
    ]);
    expect(log.map((e) => e.threadId)).toEqual(["new", "old"]);
    expect(log[0]?.subject.kind).toBe("page");
  });

  it("열린 스레드 수를 센다", () => {
    expect(countOpenReviewThreads([thread({}), thread(RESOLVED)])).toBe(1);
  });
});
