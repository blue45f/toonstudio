import { describe, expect, it } from "vitest";

import type {
  ReviewDecision,
  ReviewPolicy,
  ScopeRef,
} from "@toonstudio/core/production";

import {
  buildReviewSlot,
  reviewSlotRemainingLabel,
  sortReviewSlotsByUrgency,
  summarizeReviewSlots,
} from "./review-slot-operations-model";

const EPISODE_SCOPE: ScopeRef = {
  kind: "episode",
  id: "ep-1",
  ancestors: [{ kind: "project", id: "proj-1" }],
};

const REQUESTED_AT = "2026-10-14T09:00:00.000Z";
const HOUR = 3_600_000;
const at = (iso: string, plusHours: number) => Date.parse(iso) + plusHours * HOUR;

function policy(partial: Partial<ReviewPolicy> = {}): ReviewPolicy {
  return {
    id: "policy-1",
    projectId: "proj-1",
    scope: EPISODE_SCOPE,
    responseDueHours: 48,
    expiredReviewAction: "escalate",
    lanes: [
      {
        lane: "narrative",
        eligibleAssignmentIds: ["pd-1", "pd-2"],
        requiredAssignmentIds: ["pd-1"],
        quorum: 1,
        vetoAssignmentIds: ["pd-1"],
        blocksPublication: true,
      },
      {
        lane: "visual-direction",
        eligibleAssignmentIds: ["pd-3"],
        requiredAssignmentIds: ["pd-3"],
        quorum: 1,
        vetoAssignmentIds: [],
        blocksPublication: false,
      },
    ],
    ...partial,
  };
}

function decision(partial: Partial<ReviewDecision> & Pick<ReviewDecision, "assignmentId" | "value">): ReviewDecision {
  return {
    id: `dec-${partial.assignmentId}-${partial.value}`,
    reviewRoundId: "round-1",
    lane: "narrative",
    reasonCode: null,
    evidenceScopeRefs: [EPISODE_SCOPE],
    conditions: [],
    createdAt: "2026-10-14T12:00:00.000Z",
    ...partial,
  };
}

const REVIEWERS = [
  { assignmentId: "pd-1", displayName: "PD 일" },
  { assignmentId: "pd-2", displayName: "PD 이" },
  { assignmentId: "pd-3", displayName: "PD 삼" },
];

function slot(partial: Partial<Parameters<typeof buildReviewSlot>[0]> = {}) {
  return buildReviewSlot({
    policy: policy(),
    episodeId: "ep-1",
    requestedAt: REQUESTED_AT,
    decisions: [],
    reviewers: REVIEWERS,
    now: at(REQUESTED_AT, 10),
    ...partial,
  });
}

describe("review slot operations", () => {
  it("has no slot and no deadline without a policy", () => {
    const result = slot({ policy: null });
    expect(result.phase).toBe("no-policy");
    expect(result.dueAt).toBeNull();
    expect(result.escalation).toBeNull();
  });

  it("does not invent a deadline before a review request exists", () => {
    const result = slot({ requestedAt: null });
    expect(result.phase).toBe("not-started");
    expect(result.responseDueHours).toBe(48);
    expect(result.dueAt).toBeNull();
    expect(reviewSlotRemainingLabel(result)).toBeNull();
  });

  it("derives the deadline from requestedAt + policy responseDueHours", () => {
    const result = slot();
    expect(result.phase).toBe("open");
    expect(result.dueAt).toBe("2026-10-16T09:00:00.000Z");
    expect(result.remainingHours).toBe(38);
    expect(result.dueLabel?.ko).toContain("까지");
    expect(reviewSlotRemainingLabel(result)?.ko).toBe("38시간 남았어요");
    expect(result.escalation).toBeNull();
  });

  it("turns due-soon inside the last quarter of the window", () => {
    const result = slot({ now: at(REQUESTED_AT, 43) });
    expect(result.phase).toBe("due-soon");
    expect(result.rows.find((row) => row.assignmentId === "pd-1")?.state).toBe("due-soon");
  });

  it("escalates with the policy action copy once the deadline passes with required reviewers pending", () => {
    const result = slot({ now: at(REQUESTED_AT, 50) });
    expect(result.phase).toBe("overdue");
    expect(result.overdueHours).toBe(2);
    expect(reviewSlotRemainingLabel(result)?.ko).toBe("2시간 지났어요");
    expect(result.escalation).toMatchObject({
      action: "escalate",
      pendingRequiredNames: ["PD 일", "PD 삼"],
    });
    expect(result.escalation?.headline.ko).toContain("리드에게 올려야 해요");
    expect(result.escalation?.cta.ko).toBe("리드에게 알리기");
  });

  it("connects replace-reviewer and reschedule policies to their own escalation copy", () => {
    const replaced = slot({ policy: policy({ expiredReviewAction: "replace-reviewer" }), now: at(REQUESTED_AT, 49) });
    expect(replaced.escalation?.action).toBe("replace-reviewer");
    expect(replaced.escalation?.cta.ko).toBe("대체 검수자 지정");
    const rescheduled = slot({ policy: policy({ expiredReviewAction: "reschedule" }), now: at(REQUESTED_AT, 49) });
    expect(rescheduled.escalation?.action).toBe("reschedule");
    expect(rescheduled.escalation?.cta.ko).toBe("일정 다시 잡기");
    expect(rescheduled.escalation?.headline.ko).not.toBe(replaced.escalation?.headline.ko);
  });

  it("is secured once every required reviewer answered, even past the deadline", () => {
    const result = slot({
      now: at(REQUESTED_AT, 60),
      decisions: [
        decision({ assignmentId: "pd-1", value: "approve" }),
        decision({ assignmentId: "pd-3", value: "approve", lane: "visual-direction" }),
      ],
    });
    expect(result.phase).toBe("secured");
    expect(result.escalation).toBeNull();
    // 자문 검수자(pd-2)가 답하지 않아도 슬롯은 확보된 것으로 본다.
    expect(result.rows.find((row) => row.assignmentId === "pd-2")?.state).toBe("overdue");
  });

  it("flags answers that arrived after the deadline as late", () => {
    const result = slot({
      now: at(REQUESTED_AT, 60),
      decisions: [
        decision({ assignmentId: "pd-1", value: "approve", createdAt: "2026-10-16T12:00:00.000Z" }),
        decision({ assignmentId: "pd-3", value: "approve", lane: "visual-direction", createdAt: "2026-10-15T09:00:00.000Z" }),
      ],
    });
    expect(result.phase).toBe("secured");
    expect(result.lateResponseCount).toBe(1);
    expect(result.rows.find((row) => row.assignmentId === "pd-1")?.respondedLate).toBe(true);
    expect(reviewSlotRemainingLabel(result)?.ko).toContain("기한을 넘겨 답한");
  });

  it("ignores decisions scoped to other episodes when judging the slot", () => {
    const otherScope = { ...EPISODE_SCOPE, id: "ep-99" } as ScopeRef;
    const result = slot({
      now: at(REQUESTED_AT, 50),
      decisions: [
        decision({ assignmentId: "pd-1", value: "approve", evidenceScopeRefs: [otherScope] }),
        decision({ assignmentId: "pd-3", value: "approve", lane: "visual-direction", evidenceScopeRefs: [otherScope] }),
      ],
    });
    expect(result.phase).toBe("overdue");
    expect(result.rows.every((row) => row.decidedAt === null)).toBe(true);
  });

  it("orders the operations board by urgency and summarizes counts", () => {
    const overdue = slot({ episodeId: "ep-1", now: at(REQUESTED_AT, 55) });
    const dueSoon = slot({ episodeId: "ep-2", now: at(REQUESTED_AT, 44) });
    const open = slot({ episodeId: "ep-3", now: at(REQUESTED_AT, 5) });
    const ep4Scope: ScopeRef = { kind: "episode", id: "ep-4", ancestors: [{ kind: "project", id: "proj-1" }] };
    const secured = slot({
      episodeId: "ep-4",
      now: at(REQUESTED_AT, 5),
      decisions: [
        decision({ assignmentId: "pd-1", value: "approve", evidenceScopeRefs: [ep4Scope] }),
        decision({ assignmentId: "pd-3", value: "approve", lane: "visual-direction", evidenceScopeRefs: [ep4Scope] }),
      ],
    });
    const board = sortReviewSlotsByUrgency([secured, open, dueSoon, overdue]);
    expect(board.map((entry) => entry.episodeId)).toEqual(["ep-1", "ep-2", "ep-3", "ep-4"]);
    const summary = summarizeReviewSlots(board);
    expect(summary).toMatchObject({ total: 4, overdue: 1, dueSoon: 1, open: 1, secured: 1 });
    expect(summary.nextDueAt).toBe("2026-10-16T09:00:00.000Z");
  });
});
