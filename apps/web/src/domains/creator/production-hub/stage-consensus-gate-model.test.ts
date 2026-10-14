import { describe, expect, it } from "vitest";

import {
  buildStageGateFollowUps,
  buildStageGateView,
  stageGateFeedbackCompleteness,
  stageGateId,
  stageGateRailBadge,
  summarizeStageGates,
  validateStageGateDecision,
  type StageConsensusGate,
  type StageGateDecision,
} from "./stage-consensus-gate-model";

function decision(partial: Partial<StageGateDecision> & Pick<StageGateDecision, "value">): StageGateDecision {
  return {
    reviewerId: "lead-1",
    reviewerName: "리드",
    role: "lead",
    reason: "",
    conditions: [],
    pinThreadIds: [],
    decidedAt: "2026-10-14T09:00:00.000Z",
    ...partial,
  };
}

function gate(partial: Partial<StageConsensusGate> = {}): StageConsensusGate {
  return {
    id: stageGateId("ep-1", "plan"),
    episodeId: "ep-1",
    stageId: "plan",
    leadReviewerId: "lead-1",
    leadReviewerName: "리드",
    rounds: [],
    ...partial,
  };
}

function round(roundNo: number, decisions: readonly StageGateDecision[]) {
  return {
    round: roundNo,
    submittedById: "artist-1",
    submittedByName: "작가",
    revisionRef: `rev-${roundNo}`,
    submittedAt: `2026-10-1${roundNo}T08:00:00.000Z`,
    decisions,
  };
}

describe("stage consensus gate view", () => {
  it("reports not-submitted when there are no rounds, and blocks publish", () => {
    const view = buildStageGateView(gate());
    expect(view.status).toBe("not-submitted");
    expect(view.currentRound).toBe(0);
    expect(view.allowsCompletion).toBe(false);
    expect(view.blocksPublish).toBe(true);
    expect(view.leadDecision).toBeNull();
  });

  it("waits for the lead while work may proceed (no completion, no publish)", () => {
    const view = buildStageGateView(gate({ rounds: [round(1, [])] }));
    expect(view.status).toBe("awaiting-lead");
    expect(view.pendingConsensus).toBe(true);
    expect(view.allowsCompletion).toBe(false);
  });

  it("approves on the lead's approve; participant objections do not change the state", () => {
    const view = buildStageGateView(gate({
      rounds: [round(1, [
        decision({ value: "request-changes", role: "participant", reviewerId: "p-1", reason: "톤이 가벼워요" }),
        decision({ value: "approve" }),
      ])],
    }));
    expect(view.status).toBe("approved");
    expect(view.allowsCompletion).toBe(true);
    expect(view.blocksPublish).toBe(false);
    expect(view.objectionCount).toBe(1);
  });

  it("treats a lead abstention as still awaiting", () => {
    const view = buildStageGateView(gate({ rounds: [round(1, [decision({ value: "abstain" })])] }));
    expect(view.status).toBe("awaiting-lead");
  });

  it("uses the latest lead decision in the round", () => {
    const view = buildStageGateView(gate({
      rounds: [round(1, [
        decision({ value: "request-changes", reason: "전개가 느려요", decidedAt: "2026-10-14T09:00:00.000Z" }),
        decision({ value: "approve", decidedAt: "2026-10-14T10:00:00.000Z" }),
      ])],
    }));
    expect(view.status).toBe("approved");
  });
});

describe("stage gate follow-ups", () => {
  it("turns a lead rejection into a rework follow-up for the submitter with pins attached", () => {
    const followUps = buildStageGateFollowUps(gate({
      rounds: [round(1, [decision({ value: "request-changes", reason: "무게감이 부족해요", pinThreadIds: ["t-1", "t-2"] })])],
    }));
    expect(followUps).toHaveLength(1);
    expect(followUps[0]?.kind).toBe("rejection-rework");
    expect(followUps[0]?.assigneeId).toBe("artist-1");
    expect(followUps[0]?.detail).toBe("무게감이 부족해요");
    expect(followUps[0]?.pinThreadIds).toEqual(["t-1", "t-2"]);
    expect(followUps[0]?.resolvedByRound).toBeNull();
    expect(followUps[0]?.id).toBe(`gate-followup:${stageGateId("ep-1", "plan")}:r1:rejection-rework`);
  });

  it("resolves rework on resubmission and opens a re-review request for the lead", () => {
    const followUps = buildStageGateFollowUps(gate({
      rounds: [
        round(1, [decision({ value: "veto", reason: "방향이 달라요" })]),
        round(2, []),
      ],
    }));
    const rework = followUps.find((entry) => entry.kind === "rejection-rework");
    const rereview = followUps.find((entry) => entry.kind === "rereview-request");
    expect(rework?.resolvedByRound).toBe(2);
    expect(rereview?.assigneeId).toBe("lead-1");
    expect(rereview?.resolvedByRound).toBeNull();
  });

  it("tracks every condition of a conditional approval as its own follow-up that never auto-resolves", () => {
    const followUps = buildStageGateFollowUps(gate({
      rounds: [
        round(1, [decision({ value: "approve-with-conditions", conditions: ["3화부터 속도 올리기", "금지 표현 교체"] })]),
        round(2, [decision({ value: "approve" })]),
      ],
    }));
    const conditions = followUps.filter((entry) => entry.kind === "condition");
    expect(conditions).toHaveLength(2);
    expect(conditions.map((entry) => entry.detail)).toEqual(["3화부터 속도 올리기", "금지 표현 교체"]);
    expect(conditions.every((entry) => entry.resolvedByRound === null)).toBe(true);
  });
});

describe("stage gate summary", () => {
  it("separates missing gates from blocking gates", () => {
    const summary = summarizeStageGates([
      gate({ rounds: [round(1, [decision({ value: "approve" })])] }),
    ]);
    expect(summary.views).toHaveLength(1);
    expect(summary.publishBlockedBy).toEqual([]);
    expect(summary.missingStageIds).toEqual(["storyboard", "art"]);
    expect(summary.completionByStage).toEqual({ plan: true });
  });

  it("lists unapproved gates as publish blockers and exposes rail badges only for gated stages", () => {
    const summary = summarizeStageGates([
      gate({ rounds: [round(1, [])] }),
      gate({
        id: stageGateId("ep-1", "art"),
        stageId: "art",
        rounds: [round(1, [decision({ value: "request-changes", reason: "표정이 어긋나요" })])],
      }),
    ]);
    expect(summary.publishBlockedBy).toEqual(["plan", "art"]);
    expect(stageGateRailBadge(summary, "plan")?.status).toBe("awaiting-lead");
    expect(stageGateRailBadge(summary, "art")?.status).toBe("changes-requested");
    expect(stageGateRailBadge(summary, "review")).toBeNull();
    expect(summary.openFollowUpCount).toBe(1);
  });
});

describe("decision validation (We-toon: vague feedback must not pass)", () => {
  it("blocks a rejection without a reason", () => {
    const issues = validateStageGateDecision(decision({ value: "request-changes", reason: "  " }));
    expect(issues.some((issue) => issue.code === "reason-required" && issue.blocking)).toBe(true);
  });

  it("blocks a conditional approval without conditions", () => {
    const issues = validateStageGateDecision(decision({ value: "approve-with-conditions", conditions: [" "] }));
    expect(issues.some((issue) => issue.code === "conditions-required" && issue.blocking)).toBe(true);
  });

  it("warns (but does not block) when a reasoned rejection has no pins", () => {
    const issues = validateStageGateDecision(decision({ value: "veto", reason: "방향이 달라요" }));
    expect(issues).toEqual([
      expect.objectContaining({ code: "reason-recommended-pins", blocking: false }),
    ]);
    const completeness = stageGateFeedbackCompleteness(decision({ value: "veto", reason: "방향이 달라요", pinThreadIds: ["t-9"] }));
    expect(completeness).toEqual({ hasReason: true, pinCount: 1, complete: true });
  });
});
