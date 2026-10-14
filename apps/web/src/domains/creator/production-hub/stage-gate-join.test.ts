import { describe, expect, it } from "vitest";

import type { ProductionProjectAggregate, RevisionRef } from "@toonstudio/core/production";

import { createProductionDemoProject } from "./production-demo";
import { buildEpisodePipelinePlan } from "./production-episode-operations";
import { deriveEpisodeQcChecklist } from "./production-episode-qc";
import { deriveEpisodeStageStates } from "./production-episode-stage";
import {
  stageGateId,
  summarizeStageGates,
  type StageConsensusGate,
  type StageGateDecision,
} from "./stage-consensus-gate-model";

/**
 * 게이트 합류 테스트 — 요약 객체 하나가 QC 게시 판정과 단계 완료 판정을
 * 모두 움직이는지 고정한다. 호스트는 `summarizeStageGates(gates)` 결과를
 * 두 extras에 그대로 넘기기만 하면 된다(구조적 타이핑).
 */

const NOW = new Date("2026-09-17T00:00:00.000Z");

const visualRef: RevisionRef = {
  id: "visual-episode-13-final",
  lineage: "visual",
  revision: 5,
  digest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  createdAt: "2026-09-16T00:00:00.000Z",
};
const integratedRef: RevisionRef = {
  id: "integrated-episode-13-final",
  lineage: "integrated",
  revision: 2,
  digest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  createdAt: "2026-09-16T01:00:00.000Z",
};

/** QC 테스트의 readyAggregate와 같은 조립 — 나머지 QC가 전부 통과하는 13화. */
function readyAggregate(): ProductionProjectAggregate {
  const base = createProductionDemoProject();
  const episode = base.episodes.find((entry) => entry.episodeId === "episode-13");
  if (!episode) throw new Error("데모 13화가 없습니다.");
  const plan = buildEpisodePipelinePlan({
    aggregate: base,
    episode,
    releaseAt: "2026-10-02T09:00:00.000Z",
    rebaselineExisting: true,
  });
  const approvedTasks = plan.tasks.map((task) => ({ ...task, status: "approved" as const }));
  const episodes = base.episodes.map((entry) => entry.episodeId === "episode-13"
    ? {
        ...entry,
        state: "publish-ready" as const,
        storyLockApproved: true,
        thumbnailLockApproved: true,
        jointProofApproved: true,
        creditPreflightPassed: true,
        publicationPreflightPassed: true,
        openBlockerCount: 0,
        visualRevisionRef: visualRef,
        integratedRevisionRef: integratedRef,
        plannedReleaseAt: "2026-10-02T09:00:00.000Z",
      }
    : entry);
  return { ...base, episodes, tasks: [...base.tasks.filter((task) => !(task.scope.kind === "episode" && task.scope.id === "episode-13")), ...approvedTasks] };
}

function leadDecision(value: StageGateDecision["value"]): StageGateDecision {
  return {
    reviewerId: "lead-1",
    reviewerName: "리드",
    role: "lead",
    value,
    reason: value === "request-changes" ? "톤이 기획과 달라요" : "",
    conditions: value === "approve-with-conditions" ? ["다음 화부터 전개 속도 유지"] : [],
    pinThreadIds: [],
    decidedAt: "2026-10-14T09:00:00.000Z",
  };
}

function gateFor(stageId: StageConsensusGate["stageId"], decisions: readonly StageGateDecision[]): StageConsensusGate {
  return {
    id: stageGateId("episode-13", stageId),
    episodeId: "episode-13",
    stageId,
    leadReviewerId: "lead-1",
    leadReviewerName: "리드",
    rounds: [{
      round: 1,
      submittedById: "artist-1",
      submittedByName: "작가",
      revisionRef: "rev-1",
      submittedAt: "2026-10-14T08:00:00.000Z",
      decisions,
    }],
  };
}

describe("stage gate join (summary → QC + stage derivation)", () => {
  it("one summary object drives both verdicts: an unagreed plan gate blocks publish and un-completes plan", () => {
    const aggregate = readyAggregate();
    const episode = aggregate.episodes.find((entry) => entry.episodeId === "episode-13");
    if (!episode) throw new Error("데모 13화가 없습니다.");
    const summary = summarizeStageGates([
      gateFor("plan", [leadDecision("request-changes")]),
      gateFor("storyboard", [leadDecision("approve")]),
      gateFor("art", [leadDecision("approve")]),
    ]);
    expect(summary.publishBlockedBy).toEqual(["plan"]);
    expect(summary.completionByStage).toEqual({ plan: false, storyboard: true, art: true });

    // 게시 판정: 나머지 QC가 전부 통과해도 게이트 때문에 ready가 아니다.
    const checklist = deriveEpisodeQcChecklist(aggregate, "episode-13", NOW, { stageGate: summary });
    expect(checklist?.items.find((item) => item.id === "stage-consensus-gate")?.status).toBe("blocked");
    expect(checklist?.ready).toBe(false);

    // 완료 판정: publish-ready라도 기획은 done이 아니고 전선이 기획으로 돌아온다.
    const states = deriveEpisodeStageStates(episode, { stageGate: summary });
    const byId = new Map(states.map((entry) => [entry.id, entry.status] as const));
    expect(byId.get("plan")).toBe("current");
    expect(byId.get("storyboard")).toBe("done");
    expect(byId.get("art")).toBe("done");
    expect(byId.get("publish")).toBe("todo");
    expect(states.filter((entry) => entry.status === "current")).toHaveLength(1);
  });

  it("when every gate agrees, both verdicts return to their pre-join behaviour", () => {
    const aggregate = readyAggregate();
    const episode = aggregate.episodes.find((entry) => entry.episodeId === "episode-13");
    if (!episode) throw new Error("데모 13화가 없습니다.");
    const summary = summarizeStageGates([
      gateFor("plan", [leadDecision("approve")]),
      gateFor("storyboard", [leadDecision("approve")]),
      gateFor("art", [leadDecision("approve-with-conditions")]),
    ]);
    const checklist = deriveEpisodeQcChecklist(aggregate, "episode-13", NOW, { stageGate: summary });
    expect(checklist?.items.find((item) => item.id === "stage-consensus-gate")?.status).toBe("pass");
    expect(checklist?.ready).toBe(true);

    const states = deriveEpisodeStageStates(episode, { stageGate: summary });
    const byId = new Map(states.map((entry) => [entry.id, entry.status] as const));
    expect(byId.get("plan")).toBe("done");
    expect(byId.get("publish")).toBe("current");
  });

  it("an episode with no gates at all keeps the pre-join verdicts (summary is not passed)", () => {
    const aggregate = readyAggregate();
    const checklist = deriveEpisodeQcChecklist(aggregate, "episode-13", NOW);
    expect(checklist?.items.find((item) => item.id === "stage-consensus-gate")?.status).toBe("skipped");
    expect(checklist?.ready).toBe(true);
  });
});
