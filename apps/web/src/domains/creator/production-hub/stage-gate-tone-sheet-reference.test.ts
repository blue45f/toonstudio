import { describe, expect, it } from "vitest";

import {
  buildPlanningGateToneReference,
  buildStageGateView,
  stageGateId,
  summarizeStageGates,
  type StageConsensusGate,
} from "./stage-consensus-gate-model";
import {
  appendToneDecision,
  createWorkToneSheet,
  type WorkToneSheet,
} from "./work-tone-sheet-model";

const AT = "2026-10-14T00:00:00.000Z";

function decidedSheet(): WorkToneSheet {
  const result = appendToneDecision(createWorkToneSheet("project-1"), {
    decidedById: "lead-1",
    decidedByName: "리드",
    decidedAt: AT,
    summary: "무게감은 묵직하게, 전개는 빠르게 간다.",
    weight: "heavy",
    pacing: "fast",
    statement: "밝게 시작해 결말로 갈수록 묵직해진다.",
    forbiddenExpressions: ["개그성 말장난"],
  });
  if (!result.ok) throw new Error("setup failed");
  return result.sheet;
}

function gate(stageId: "plan" | "storyboard" | "art"): StageConsensusGate {
  return {
    id: stageGateId("ep-1", stageId),
    episodeId: "ep-1",
    stageId,
    leadReviewerId: "lead-1",
    leadReviewerName: "리드",
    rounds: [],
  };
}

describe("planning gate tone sheet reference", () => {
  it("attaches the current tone sheet snapshot to the planning gate only", () => {
    const sheet = decidedSheet();
    const plan = buildPlanningGateToneReference("plan", sheet);
    expect(plan.state).toBe("attached");
    expect(plan.sheetId).toBe("tone-sheet:project-1");
    expect(plan.revision).toBe(1);
    expect(plan.attachment?.weightLabel?.ko).toBe("묵직하고 진지함");
    expect(plan.attachment?.pacingLabel?.ko).toBe("빠른 전개");
    expect(plan.attachment?.lines).toContain("금지 표현: 개그성 말장난");
    for (const stageId of ["storyboard", "art"] as const) {
      const other = buildPlanningGateToneReference(stageId, sheet);
      expect(other.state).toBe("not-applicable");
      expect(other.attachment).toBeNull();
    }
  });

  it("reports missing instead of inventing tone when there is no usable sheet", () => {
    expect(buildPlanningGateToneReference("plan", null).state).toBe("missing");
    expect(buildPlanningGateToneReference("plan", undefined).state).toBe("missing");
    const empty = buildPlanningGateToneReference("plan", createWorkToneSheet("project-1"));
    expect(empty.state).toBe("missing");
    expect(empty.attachment).toBeNull();
    expect(empty.sheetId).toBe("tone-sheet:project-1");
    expect(empty.revision).toBe(0);
  });

  it("exposes the attachment on the planning gate view and leaves other gates untouched", () => {
    const sheet = decidedSheet();
    const planView = buildStageGateView(gate("plan"), sheet);
    expect(planView.toneReference.state).toBe("attached");
    expect(planView.toneAttachment).toBe(planView.toneReference.attachment);
    expect(planView.toneAttachment?.revision).toBe(1);
    const storyboardView = buildStageGateView(gate("storyboard"), sheet);
    expect(storyboardView.toneReference.state).toBe("not-applicable");
    expect(storyboardView.toneAttachment).toBeNull();
  });

  it("does not change gate verdicts — tone reference never blocks publish by itself", () => {
    const approved = buildStageGateView(
      {
        ...gate("plan"),
        rounds: [{
          round: 1,
          submittedById: "artist-1",
          submittedByName: "작가",
          revisionRef: "rev-1",
          submittedAt: AT,
          decisions: [{
            reviewerId: "lead-1",
            reviewerName: "리드",
            role: "lead",
            value: "approve",
            reason: "",
            conditions: [],
            pinThreadIds: [],
            decidedAt: AT,
          }],
        }],
      },
      null,
    );
    expect(approved.status).toBe("approved");
    expect(approved.allowsCompletion).toBe(true);
    expect(approved.blocksPublish).toBe(false);
    expect(approved.toneReference.state).toBe("missing");
  });

  it("threads the sheet through summarizeStageGates and keeps the summary-level reference even without a plan gate", () => {
    const sheet = decidedSheet();
    const withPlan = summarizeStageGates([gate("plan")], sheet);
    expect(withPlan.planningToneReference.state).toBe("attached");
    expect(withPlan.views[0]?.toneAttachment?.revision).toBe(1);
    const withoutPlan = summarizeStageGates([gate("art")], sheet);
    expect(withoutPlan.planningToneReference.state).toBe("attached");
    expect(withoutPlan.views[0]?.toneAttachment).toBeNull();
    const noSheet = summarizeStageGates([gate("plan")]);
    expect(noSheet.planningToneReference.state).toBe("missing");
    expect(noSheet.views[0]?.toneReference.state).toBe("missing");
  });

  it("tracks the current revision — a newer decision replaces the attached snapshot", () => {
    const sheet = decidedSheet();
    const bumped = appendToneDecision(sheet, {
      decidedById: "lead-1",
      decidedByName: "리드",
      decidedAt: AT,
      summary: "전개를 더 빠르게",
      pacing: "relentless",
    });
    if (!bumped.ok) throw new Error("setup failed");
    const reference = buildPlanningGateToneReference("plan", bumped.sheet);
    expect(reference.revision).toBe(2);
    expect(reference.attachment?.pacingLabel?.ko).toBe("쉼 없이 몰아침");
    expect(reference.attachment?.latestDecision?.summary).toBe("전개를 더 빠르게");
  });
});
