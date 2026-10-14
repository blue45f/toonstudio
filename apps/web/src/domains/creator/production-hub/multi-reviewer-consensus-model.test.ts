import { describe, expect, it } from "vitest";

import type {
  ReviewDecision,
  ReviewPolicy,
  ScopeRef,
} from "@toonstudio/core/production";
import type { StudioCommentsDocument } from "../studio-comments";

import { buildReviewerConsensus } from "./multi-reviewer-consensus-model";

const EPISODE_SCOPE: ScopeRef = {
  kind: "episode",
  id: "ep-1",
  ancestors: [{ kind: "project", id: "proj-1" }],
};

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
    createdAt: "2026-10-14T09:00:00.000Z",
    ...partial,
  };
}

const REVIEWERS = [
  { assignmentId: "pd-1", displayName: "PD 일" },
  { assignmentId: "pd-2", displayName: "PD 이" },
  { assignmentId: "pd-3", displayName: "PD 삼" },
];

function commentsWithPins(): StudioCommentsDocument {
  return {
    threads: [
      {
        id: "t-1",
        anchor: { type: "point", pageId: "page-1", x: 0.3, y: 0.4 },
        author: { id: "pd-1", displayName: "PD 일" },
        body: "[긴급] 표정이 어긋나요",
        replies: [],
        resolved: false,
        createdAt: "2026-10-14T08:00:00.000Z",
      },
      {
        id: "t-2",
        anchor: { type: "point", pageId: "page-1", x: 0.6, y: 0.2 },
        author: { id: "pd-3", displayName: "PD 삼" },
        body: "배경 톤을 낮춰 주세요",
        replies: [],
        resolved: true,
        resolvedAt: "2026-10-14T09:30:00.000Z",
        createdAt: "2026-10-14T08:30:00.000Z",
      },
    ],
  } as unknown as StudioCommentsDocument;
}

describe("multi-reviewer consensus", () => {
  it("returns no-reviewers when there is no policy", () => {
    const summary = buildReviewerConsensus({
      policy: null,
      episodeId: "ep-1",
      decisions: [],
      reviewers: REVIEWERS,
    });
    expect(summary.state).toBe("no-reviewers");
    expect(summary.rows).toEqual([]);
  });

  it("waits while a required reviewer has not decided, naming them", () => {
    const summary = buildReviewerConsensus({
      policy: policy(),
      episodeId: "ep-1",
      decisions: [decision({ assignmentId: "pd-1", value: "approve" })],
      reviewers: REVIEWERS,
    });
    expect(summary.state).toBe("awaiting");
    expect(summary.counts).toMatchObject({ approved: 1, awaiting: 2 });
    expect(summary.blockingReasons.map((reason) => reason.ko)).toContain("PD 삼 님의 판정이 아직 없어요.");
  });

  it("reaches full approval when required reviewers approve and quorum is met", () => {
    const summary = buildReviewerConsensus({
      policy: policy(),
      episodeId: "ep-1",
      decisions: [
        decision({ assignmentId: "pd-1", value: "approve" }),
        decision({ assignmentId: "pd-3", value: "approve", lane: "visual-direction" }),
      ],
      reviewers: REVIEWERS,
    });
    expect(summary.state).toBe("approved");
    expect(summary.blockingReasons).toEqual([]);
  });

  it("surfaces conditional approval as its own state with conditions on the row", () => {
    const summary = buildReviewerConsensus({
      policy: policy(),
      episodeId: "ep-1",
      decisions: [
        decision({ assignmentId: "pd-1", value: "approve-with-conditions", conditions: ["말풍선 위치 조정"] }),
        decision({ assignmentId: "pd-3", value: "approve", lane: "visual-direction" }),
      ],
      reviewers: REVIEWERS,
    });
    expect(summary.state).toBe("approved-with-conditions");
    const row = summary.rows.find((entry) => entry.assignmentId === "pd-1");
    expect(row?.conditions).toEqual(["말풍선 위치 조정"]);
  });

  it("lets a privileged veto block consensus, but an advisory veto is only an objection", () => {
    const vetoed = buildReviewerConsensus({
      policy: policy(),
      episodeId: "ep-1",
      decisions: [
        decision({ assignmentId: "pd-1", value: "veto", reasonCode: "tone-mismatch" }),
        decision({ assignmentId: "pd-3", value: "approve", lane: "visual-direction" }),
      ],
      reviewers: REVIEWERS,
    });
    expect(vetoed.state).toBe("vetoed");

    const advisory = buildReviewerConsensus({
      policy: policy(),
      episodeId: "ep-1",
      decisions: [
        decision({ assignmentId: "pd-1", value: "approve" }),
        decision({ assignmentId: "pd-2", value: "veto" }),
        decision({ assignmentId: "pd-3", value: "approve", lane: "visual-direction" }),
      ],
      reviewers: REVIEWERS,
    });
    expect(advisory.state).toBe("changes-requested");
  });

  it("uses the latest decision per reviewer and ignores decisions scoped to other episodes", () => {
    const otherScope = { ...EPISODE_SCOPE, id: "ep-99" } as ScopeRef;
    const summary = buildReviewerConsensus({
      policy: policy(),
      episodeId: "ep-1",
      decisions: [
        decision({ assignmentId: "pd-1", value: "request-changes", createdAt: "2026-10-14T08:00:00.000Z" }),
        decision({ assignmentId: "pd-1", value: "approve", createdAt: "2026-10-14T11:00:00.000Z" }),
        decision({ assignmentId: "pd-3", value: "veto", lane: "visual-direction", evidenceScopeRefs: [otherScope] }),
      ],
      reviewers: REVIEWERS,
    });
    const lead = summary.rows.find((entry) => entry.assignmentId === "pd-1");
    expect(lead?.decision).toBe("approve");
    const visual = summary.rows.find((entry) => entry.assignmentId === "pd-3");
    expect(visual?.decision).toBeNull();
    expect(summary.state).toBe("awaiting");
  });

  it("binds each reviewer's pins to their row (one body with the verdict)", () => {
    const summary = buildReviewerConsensus({
      policy: policy(),
      episodeId: "ep-1",
      decisions: [
        decision({ assignmentId: "pd-1", value: "request-changes" }),
        decision({ assignmentId: "pd-3", value: "approve", lane: "visual-direction" }),
      ],
      reviewers: REVIEWERS,
      comments: commentsWithPins(),
    });
    const lead = summary.rows.find((entry) => entry.assignmentId === "pd-1");
    expect(lead?.pins).toHaveLength(1);
    expect(lead?.pins[0]).toMatchObject({ threadId: "t-1", number: 1, status: "urgent" });
    expect(lead?.openPinCount).toBe(1);
    expect(lead?.urgentPinCount).toBe(1);
    const visual = summary.rows.find((entry) => entry.assignmentId === "pd-3");
    expect(visual?.pins[0]).toMatchObject({ threadId: "t-2", status: "resolved" });
    expect(summary.pins).toEqual({ total: 2, open: 1, urgent: 1 });
    expect(summary.state).toBe("changes-requested");
  });
});
