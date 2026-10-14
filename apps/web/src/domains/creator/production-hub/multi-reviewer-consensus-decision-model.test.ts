import { describe, expect, it } from "vitest";

import type {
  ReviewDecision,
  ReviewPolicy,
  ScopeRef,
} from "@toonstudio/core/production";

import { buildReviewerConsensus } from "./multi-reviewer-consensus-model";
import {
  buildConsensusDecisionSubmission,
  consensusSubmissionToReviewDecision,
  parseConsensusConditions,
  validateConsensusDecision,
  type ConsensusDecisionDraft,
} from "./multi-reviewer-consensus-decision-model";
import {
  validateStageGateDecision,
  type StageGateDecision,
} from "./stage-consensus-gate-model";

const EPISODE_SCOPE: ScopeRef = {
  kind: "episode",
  id: "ep-1",
  ancestors: [{ kind: "project", id: "proj-1" }],
};

function policy(): ReviewPolicy {
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
  };
}

const REVIEWERS = [
  { assignmentId: "pd-1", displayName: "PD 일" },
  { assignmentId: "pd-2", displayName: "PD 이" },
  { assignmentId: "pd-3", displayName: "PD 삼" },
];

function draft(partial: Partial<ConsensusDecisionDraft> = {}): ConsensusDecisionDraft {
  return {
    assignmentId: "pd-1",
    lane: "narrative",
    value: "approve",
    reason: "",
    conditions: [],
    pinThreadIds: [],
    ...partial,
  };
}

function gateEquivalent(d: ConsensusDecisionDraft): StageGateDecision {
  return {
    reviewerId: d.assignmentId,
    reviewerName: d.assignmentId,
    role: "participant",
    value: d.value,
    reason: d.reason,
    conditions: d.conditions.map((c) => c.trim()).filter((c) => c.length > 0),
    pinThreadIds: d.pinThreadIds,
    decidedAt: "",
  };
}

/** 호스트 등록을 흉내 낸다: 제출 → 코어 판정 → decisions에 append. */
function register(
  decisions: ReviewDecision[],
  d: ConsensusDecisionDraft,
  createdAt: string,
): ReviewDecision[] {
  const result = buildConsensusDecisionSubmission(d);
  if (!result.ok) throw new Error(`registration blocked: ${result.issues.map((i) => i.code).join(",")}`);
  const decision = consensusSubmissionToReviewDecision(result.submission, {
    policy: policy(),
    reviewRoundId: "round-1",
    decisionId: `dec-${d.assignmentId}-${createdAt}`,
    createdAt,
  });
  return [...decisions, decision];
}

describe("consensus decision validation — same rules as validateStageGateDecision", () => {
  const scenarios: readonly (readonly [string, ConsensusDecisionDraft])[] = [
    ["plain approval needs nothing", draft()],
    ["changes without a reason", draft({ value: "request-changes" })],
    ["veto with a blank reason", draft({ value: "veto", reason: "   " })],
    ["conditional without conditions", draft({ value: "approve-with-conditions", conditions: ["", "  "] })],
    ["conditional with a condition", draft({ value: "approve-with-conditions", conditions: [" 말풍선 위치 조정 "] })],
    ["changes with a reason but no pins", draft({ value: "request-changes", reason: "표정이 어긋나요" })],
    ["changes with a reason and pins", draft({ value: "request-changes", reason: "표정이 어긋나요", pinThreadIds: ["t-1"] })],
    ["veto with a reason and pins", draft({ value: "veto", reason: "톤이 작품과 달라요", pinThreadIds: ["t-1"] })],
  ];

  it.each(scenarios)("matches the stage-gate validator: %s", (_name, d) => {
    expect(validateConsensusDecision(d)).toEqual(validateStageGateDecision(gateEquivalent(d)));
  });

  it("blocks a reasonless change request and a conditionless conditional approval", () => {
    const changes = buildConsensusDecisionSubmission(draft({ value: "request-changes" }));
    expect(changes.ok).toBe(false);
    if (!changes.ok) {
      expect(changes.issues).toContainEqual(expect.objectContaining({ code: "reason-required", blocking: true }));
    }
    const conditional = buildConsensusDecisionSubmission(draft({ value: "approve-with-conditions" }));
    expect(conditional.ok).toBe(false);
    if (!conditional.ok) {
      expect(conditional.issues).toContainEqual(
        expect.objectContaining({ code: "conditions-required", blocking: true }),
      );
    }
  });

  it("allows a pinned-less rejection but keeps the pin recommendation as a warning", () => {
    const result = buildConsensusDecisionSubmission(
      draft({ value: "request-changes", reason: "표정이 어긋나요" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.submission.warnings).toEqual([
        expect.objectContaining({ code: "reason-recommended-pins", blocking: false }),
      ]);
    }
  });
});

describe("consensus decision submission", () => {
  it("normalizes conditions, trims the reason, and dedupes pins", () => {
    const result = buildConsensusDecisionSubmission(
      draft({
        value: "approve-with-conditions",
        reason: "  방향은 좋아요  ",
        conditions: [" 말풍선 위치 조정 ", "", "배경 톤 유지"],
        pinThreadIds: ["t-1", "t-1", "t-2"],
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.submission.reason).toBe("방향은 좋아요");
      expect(result.submission.conditions).toEqual(["말풍선 위치 조정", "배경 톤 유지"]);
      expect(result.submission.pinThreadIds).toEqual(["t-1", "t-2"]);
    }
  });

  it("drops conditions on non-conditional verdicts", () => {
    const result = buildConsensusDecisionSubmission(draft({ conditions: ["남으면 안 되는 조건"] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.submission.conditions).toEqual([]);
  });

  it("parses one-condition-per-line input", () => {
    expect(parseConsensusConditions(" 첫째 \n\n둘째\n  ")).toEqual(["첫째", "둘째"]);
    expect(parseConsensusConditions("")).toEqual([]);
  });

  it("builds a core ReviewDecision in the episode room's approveLane shape", () => {
    const result = buildConsensusDecisionSubmission(
      draft({
        assignmentId: "pd-3",
        lane: "visual-direction",
        value: "approve-with-conditions",
        conditions: ["배경 톤 유지"],
        pinThreadIds: ["t-2"],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const decision = consensusSubmissionToReviewDecision(result.submission, {
      policy: policy(),
      reviewRoundId: "round-1",
      decisionId: "dec-x",
      createdAt: "2026-10-14T10:00:00.000Z",
    });
    expect(decision).toEqual({
      id: "dec-x",
      reviewRoundId: "round-1",
      lane: "visual-direction",
      assignmentId: "pd-3",
      value: "approve-with-conditions",
      reasonCode: null,
      evidenceScopeRefs: [EPISODE_SCOPE],
      conditions: ["배경 톤 유지"],
      createdAt: "2026-10-14T10:00:00.000Z",
    });
  });
});

describe("registration refreshes the consensus summary", () => {
  it("walks awaiting → still awaiting → changes-requested → approved as verdicts land", () => {
    let decisions: ReviewDecision[] = [];
    const summarize = () =>
      buildReviewerConsensus({ policy: policy(), episodeId: "ep-1", decisions, reviewers: REVIEWERS });

    expect(summarize().state).toBe("awaiting");
    expect(summarize().counts.awaiting).toBe(3);

    decisions = register(decisions, draft({ value: "approve" }), "2026-10-14T09:00:00.000Z");
    let summary = summarize();
    expect(summary.state).toBe("awaiting"); // 필수 검수자 PD 삼이 아직 없다
    expect(summary.counts).toMatchObject({ approved: 1, awaiting: 2 });
    expect(summary.rows.find((row) => row.assignmentId === "pd-1")?.decision).toBe("approve");

    decisions = register(
      decisions,
      draft({
        assignmentId: "pd-3",
        lane: "visual-direction",
        value: "request-changes",
        reason: "배경 톤을 낮춰 주세요",
        pinThreadIds: ["t-2"],
      }),
      "2026-10-14T10:00:00.000Z",
    );
    summary = summarize();
    expect(summary.state).toBe("changes-requested");
    expect(summary.counts).toMatchObject({ changesRequested: 1 });
    expect(summary.blockingReasons.map((reason) => reason.ko)).toContain(
      "PD 삼 님이 수정을 요청했어요. 핀 0개가 아직 열려 있어요.",
    );

    // 재등록하면 최신 판정으로 갱신된다 (모델의 검수자별 최신 판정 규칙).
    decisions = register(
      decisions,
      draft({ assignmentId: "pd-3", lane: "visual-direction", value: "approve" }),
      "2026-10-14T11:00:00.000Z",
    );
    summary = summarize();
    expect(summary.state).toBe("approved");
    expect(summary.counts).toMatchObject({ approved: 2, changesRequested: 0, awaiting: 1 });
    expect(summary.blockingReasons).toEqual([]);
  });

  it("flips the summary to vetoed when the privileged reviewer vetoes from the panel", () => {
    const decisions = register(
      [],
      draft({ value: "veto", reason: "톤이 작품 방향과 달라요", pinThreadIds: ["t-1"] }),
      "2026-10-14T09:00:00.000Z",
    );
    const summary = buildReviewerConsensus({
      policy: policy(),
      episodeId: "ep-1",
      decisions,
      reviewers: REVIEWERS,
    });
    expect(summary.state).toBe("vetoed");
    expect(summary.counts.vetoed).toBe(1);
  });

  it("surfaces panel-registered conditions on the reviewer's row", () => {
    let decisions = register(
      [],
      draft({ value: "approve-with-conditions", conditions: ["말풍선 위치 조정"] }),
      "2026-10-14T09:00:00.000Z",
    );
    decisions = register(
      decisions,
      draft({ assignmentId: "pd-3", lane: "visual-direction", value: "approve" }),
      "2026-10-14T09:30:00.000Z",
    );
    const summary = buildReviewerConsensus({
      policy: policy(),
      episodeId: "ep-1",
      decisions,
      reviewers: REVIEWERS,
    });
    expect(summary.state).toBe("approved-with-conditions");
    expect(summary.rows.find((row) => row.assignmentId === "pd-1")?.conditions).toEqual(["말풍선 위치 조정"]);
  });
});
