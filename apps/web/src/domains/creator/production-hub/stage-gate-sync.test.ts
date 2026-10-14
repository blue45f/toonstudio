import { describe, expect, it } from "vitest";

import {
  stageGateRecordId, validateStageGateDecisionForStorage,
  type StageConsensusGateRecord, type StageGateBundle,
} from "@toonstudio/contracts/production-stage-gate";

import {
  buildStageGateView, stageGateId, summarizeStageGates, validateStageGateDecision,
  type StageConsensusGate,
} from "./stage-consensus-gate-model";
import {
  mergeStageGateBundle, mergedStageGates, stageGateRecordToClientGate,
  type StageGateLocalSnapshot,
} from "./stage-gate-sync";

const DECIDED = "2026-10-14T09:00:00.000Z";

function record(partial: Partial<StageConsensusGateRecord> = {}): StageConsensusGateRecord {
  return {
    id: stageGateRecordId("ep-1", "plan"),
    projectId: "proj-1",
    episodeId: "ep-1",
    stageId: "plan",
    leadReviewerId: "lead-1",
    leadReviewerName: "리드",
    rounds: [{
      round: 1, submittedById: "artist-1", submittedByName: "작가", revisionRef: "rev-1",
      submittedAt: "2026-10-14T08:00:00.000Z",
      decisions: [{
        reviewerId: "lead-1", reviewerName: "리드", role: "lead", value: "approve",
        reason: "", conditions: [], pinThreadIds: [], decidedAt: DECIDED,
      }],
    }],
    revision: 3,
    ...partial,
  };
}

function bundle(gates: readonly StageConsensusGateRecord[]): StageGateBundle {
  return { projectId: "proj-1", episodeId: "ep-1", gates, serverTime: "2026-10-14T10:00:00.000Z" };
}

describe("server contract ↔ client model conformance", () => {
  it("uses the same deterministic gate id on both sides", () => {
    expect(stageGateRecordId("ep-1", "plan")).toBe(stageGateId("ep-1", "plan"));
  });

  it("converts a record into exactly the client gate shape (sync metadata stripped)", () => {
    const gate = stageGateRecordToClientGate(record());
    expect(gate).toEqual({
      id: "stage-gate:ep-1:plan",
      episodeId: "ep-1",
      stageId: "plan",
      leadReviewerId: "lead-1",
      leadReviewerName: "리드",
      rounds: [{
        round: 1, submittedById: "artist-1", submittedByName: "작가", revisionRef: "rev-1",
        submittedAt: "2026-10-14T08:00:00.000Z",
        decisions: [{
          reviewerId: "lead-1", reviewerName: "리드", role: "lead", value: "approve",
          reason: "", conditions: [], pinThreadIds: [], decidedAt: DECIDED,
        }],
      }],
    } satisfies StageConsensusGate);
  });

  it("feeds the 1st-mount model unchanged: an approved server gate completes and unblocks publish", () => {
    const gate = stageGateRecordToClientGate(record());
    expect(gate).not.toBeNull();
    const view = buildStageGateView(gate!);
    expect(view.status).toBe("approved");
    expect(view.currentRound).toBe(1);
    const summary = summarizeStageGates([gate!]);
    expect(summary.publishBlockedBy).toEqual([]);
    expect(summary.completionByStage).toEqual({ plan: true });
  });

  it("keeps a lead-less gate out of the client model instead of inventing a lead", () => {
    expect(stageGateRecordToClientGate(record({ leadReviewerId: null, leadReviewerName: "" }))).toBeNull();
  });

  it("agrees with the client validator on the blocking storage rules", () => {
    const cases = [
      { value: "request-changes", reason: "", conditions: [] as string[] },
      { value: "veto", reason: "방향이 달라요", conditions: [] as string[] },
      { value: "approve-with-conditions", reason: "", conditions: [] as string[] },
      { value: "approve-with-conditions", reason: "", conditions: ["속도 조정"] },
      { value: "approve", reason: "", conditions: [] as string[] },
    ] as const;
    for (const entry of cases) {
      const serverIssues = validateStageGateDecisionForStorage(entry);
      const clientBlocking = validateStageGateDecision({
        reviewerId: "lead-1", reviewerName: "리드", role: "lead",
        value: entry.value, reason: entry.reason, conditions: entry.conditions,
        pinThreadIds: ["pin-1"], decidedAt: DECIDED,
      }).filter((issue) => issue.blocking).map((issue) => issue.code);
      expect(serverIssues).toEqual(clientBlocking);
    }
  });
});

describe("multi-device merge", () => {
  it("adopts a newer server revision over a stale local copy", () => {
    const localGate = stageGateRecordToClientGate(record({ rounds: [] }))!;
    const local: StageGateLocalSnapshot[] = [{ gate: localGate, revision: 1 }];
    const result = mergeStageGateBundle(local, bundle([record()]));
    expect(result.conflicts).toEqual([]);
    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0].revision).toBe(3);
    expect(buildStageGateView(result.snapshots[0].gate).status).toBe("approved");
  });

  it("keeps a local-only gate the server has never seen", () => {
    const localGate = stageGateRecordToClientGate(record({ rounds: [] }))!;
    const result = mergeStageGateBundle([{ gate: localGate, revision: 0 }], bundle([]));
    expect(mergedStageGates(result)).toEqual([localGate]);
  });

  it("reports a same-revision divergence as a conflict and lets the server win", () => {
    const diverged = record({ rounds: [] });
    const localGate = stageGateRecordToClientGate(diverged)!;
    const result = mergeStageGateBundle([{ gate: localGate, revision: 3 }], bundle([record()]));
    expect(result.conflicts).toEqual([{ gateId: "stage-gate:ep-1:plan", localRevision: 3, remoteRevision: 3 }]);
    expect(buildStageGateView(result.snapshots[0].gate).status).toBe("approved");
  });

  it("stays silent when both devices hold identical content at the same revision", () => {
    const gate = stageGateRecordToClientGate(record())!;
    const result = mergeStageGateBundle([{ gate, revision: 3 }], bundle([record()]));
    expect(result.conflicts).toEqual([]);
    expect(result.snapshots[0].gate).toEqual(gate);
  });

  it("separates unassigned gates instead of dropping them silently", () => {
    const result = mergeStageGateBundle([], bundle([record({ leadReviewerId: null, leadReviewerName: "" })]));
    expect(result.snapshots).toEqual([]);
    expect(result.unassignedGateIds).toEqual(["stage-gate:ep-1:plan"]);
  });
});
