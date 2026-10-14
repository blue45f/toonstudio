import { describe, expect, it } from "vitest";

import type { EpisodeCollaboration, EpisodePlan, RevisionRef } from "@toonstudio/core/production";

import type { EpisodeQcItem } from "./production-episode-qc";
import {
  currentEpisodeStage,
  deriveEpisodeStageStates,
  selectStepperEpisode,
  type EpisodeStageEvidence,
  type EpisodeStageExtras,
  type EpisodeStageStatus,
} from "./production-episode-stage";
import type { EpisodeStageId } from "./production-project-surfaces";

type State = EpisodeCollaboration["state"];

const ORDER: readonly EpisodeStageId[] = [
  "plan", "storyboard", "art", "lettering", "review", "publish", "operate",
];

const INTEGRATED_REF: RevisionRef = {
  id: "rev-integrated-1",
  lineage: "integrated",
  revision: 1,
  digest: "digest-1",
  createdAt: "2026-10-13T00:00:00.000Z",
};

function evidence(
  state: State,
  locks: { story?: boolean; thumb?: boolean; jointProof?: boolean; integrated?: boolean } = {},
): EpisodeStageEvidence {
  return {
    state,
    storyLockApproved: locks.story ?? false,
    thumbnailLockApproved: locks.thumb ?? false,
    jointProofApproved: locks.jointProof ?? false,
    integratedRevisionRef: locks.integrated ? INTEGRATED_REF : null,
    visualRevisionRef: null,
  };
}

function statuses(state: State, locks?: Parameters<typeof evidence>[1], extras?: EpisodeStageExtras) {
  const states = deriveEpisodeStageStates(evidence(state, locks), extras);
  const byId = new Map<EpisodeStageId, EpisodeStageStatus>(
    states.map((entry) => [entry.id, entry.status] as const),
  );
  return { ordered: ORDER.map((id) => byId.get(id)), byId, all: states };
}

function qcItem(id: EpisodeQcItem["id"], status: EpisodeQcItem["status"]): EpisodeQcItem {
  return {
    id,
    label: { ko: id, en: id },
    status,
    detail: { ko: id, en: id },
    target: null,
  };
}

describe("episode stage derivation (S2-3 complete)", () => {
  it("never invents a status: no episode means every stage is explicitly unknown", () => {
    const states = deriveEpisodeStageStates(undefined);
    expect(states.map((state) => state.id)).toEqual([...ORDER]);
    expect(states.every((state) => state.status === "unknown")).toBe(true);
    expect(currentEpisodeStage(states)).toBeNull();
  });

  // 실제 협업 상태 기계 전수(19개 중 진척을 말할 수 있는 13개)와의 대조 표.
  // 7단계 전부(plan/storyboard/art/lettering/review/publish/operate 순)가 판정된다.
  it.each([
    ["episode-planning", ["current", "todo", "todo", "todo", "todo", "todo", "todo"]],
    ["story-drafting", ["current", "todo", "todo", "todo", "todo", "todo", "todo"]],
    ["story-review", ["current", "todo", "todo", "todo", "todo", "todo", "todo"]],
    ["story-ready-for-art", ["done", "current", "todo", "todo", "todo", "todo", "todo"]],
    ["art-clarification", ["done", "current", "todo", "todo", "todo", "todo", "todo"]],
    ["thumbnailing", ["done", "current", "todo", "todo", "todo", "todo", "todo"]],
    ["thumbnail-joint-review", ["done", "current", "todo", "todo", "todo", "todo", "todo"]],
    ["thumbnail-locked", ["done", "done", "current", "todo", "todo", "todo", "todo"]],
    ["final-art-production", ["done", "done", "current", "todo", "todo", "todo", "todo"]],
    ["lettering-and-integration", ["done", "done", "done", "current", "todo", "todo", "todo"]],
    ["joint-proof", ["done", "done", "done", "done", "current", "todo", "todo"]],
    ["publish-ready", ["done", "done", "done", "done", "done", "current", "todo"]],
    ["published", ["done", "done", "done", "done", "done", "done", "current"]],
    ["cancelled", ["unknown", "unknown", "unknown", "unknown", "unknown", "unknown", "unknown"]],
  ] as ReadonlyArray<readonly [State, readonly EpisodeStageStatus[]]>)(
    "maps collaboration state %s to all seven stages",
    (state, expected) => {
      expect(statuses(state).ordered).toEqual(expected);
    },
  );

  it.each(["blocked", "paused-health", "paused-contract", "change-request-open", "creator-replacement"] as readonly State[])(
    "paused state %s only trusts approvals and pinned revisions",
    (state) => {
      expect(statuses(state).ordered).toEqual([
        "unknown", "unknown", "unknown", "unknown", "unknown", "unknown", "unknown",
      ]);
      expect(statuses(state, { story: true }).byId.get("plan")).toBe("done");
      expect(statuses(state, { story: true, thumb: true }).byId.get("storyboard")).toBe("done");
      expect(statuses(state, { integrated: true }).byId.get("lettering")).toBe("done");
      expect(statuses(state, { jointProof: true }).byId.get("review")).toBe("done");
      // 멈춘 회차에는 current가 없다.
      expect(currentEpisodeStage(statuses(state, { story: true, thumb: true, jointProof: true }).all)).toBeNull();
    },
  );

  it("exposes exactly one current stage while an episode is in flight", () => {
    for (const state of ["thumbnailing", "lettering-and-integration", "joint-proof", "published"] as readonly State[]) {
      const states = deriveEpisodeStageStates(evidence(state));
      expect(states.filter((entry) => entry.status === "current")).toHaveLength(1);
    }
    expect(currentEpisodeStage(deriveEpisodeStageStates(evidence("lettering-and-integration")))?.id).toBe("lettering");
    expect(currentEpisodeStage(deriveEpisodeStageStates(evidence("joint-proof")))?.id).toBe("review");
    expect(currentEpisodeStage(deriveEpisodeStageStates(evidence("published")))?.id).toBe("operate");
  });

  it("marks lettering done early only when the lettered master is pinned and spellcheck is clean", () => {
    // 작화 중이라도 식자 통합본이 고정돼 있으면 식자는 끝난 것으로 말한다(QC integrated-art와 같은 근거).
    expect(statuses("final-art-production", { integrated: true }).byId.get("lettering")).toBe("done");
    // 맞춤법 오류 의심이 남아 있으면 통합본 고정만으로 done 승격하지 않는다.
    expect(
      statuses("final-art-production", { integrated: true }, { dialogueSpellcheckErrorCount: 2 }).byId.get("lettering"),
    ).toBe("todo");
    // QC 항목이 있으면 extras 숫자보다 QC 판정이 우선한다.
    expect(
      statuses("final-art-production", { integrated: true }, {
        dialogueSpellcheckErrorCount: 0,
        qc: { items: [qcItem("dialogue-spellcheck", "blocked")] },
      }).byId.get("lettering"),
    ).toBe("todo");
    // 식자 상태에서는 통합본이 있어도 current가 우선한다.
    expect(statuses("lettering-and-integration", { integrated: true }).byId.get("lettering")).toBe("current");
  });

  it("completes review early when joint proof, gate and pins all clear", () => {
    const done = statuses("joint-proof", { jointProof: true }, {
      openUrgentPins: 0,
      qc: { items: [qcItem("joint-proof", "pass"), qcItem("review-gate", "pass")] },
    });
    expect(done.byId.get("review")).toBe("done");
    // 검수 정책이 없어 skipped인 게이트는 통합 교정 승인이 대신하므로 완료를 막지 않는다.
    expect(
      statuses("joint-proof", { jointProof: true }, {
        qc: { items: [qcItem("joint-proof", "pass"), qcItem("review-gate", "skipped")] },
      }).byId.get("review"),
    ).toBe("done");
    // 게이트가 막혀 있거나 필수 핀이 남아 있으면 합동 교정 중(current)에 머문다.
    expect(
      statuses("joint-proof", { jointProof: true }, {
        qc: { items: [qcItem("joint-proof", "pass"), qcItem("review-gate", "blocked")] },
      }).byId.get("review"),
    ).toBe("current");
    expect(
      statuses("joint-proof", { jointProof: true }, { openUrgentPins: 1 }).byId.get("review"),
    ).toBe("current");
  });

  it("sends a publish-ready episode back to review while urgent pins remain", () => {
    const blocked = statuses("publish-ready", {}, { openUrgentPins: 2 });
    expect(blocked.byId.get("review")).toBe("current");
    expect(blocked.byId.get("publish")).toBe("todo");
    expect(blocked.all.filter((entry) => entry.status === "current")).toHaveLength(1);
    // 핀을 읽지 못한 표면(undefined)은 파일럿 판정을 그대로 유지한다.
    const noPinData = statuses("publish-ready");
    expect(noPinData.byId.get("review")).toBe("done");
    expect(noPinData.byId.get("publish")).toBe("current");
    // 핀이 0개면 게시 current를 유지한다.
    const clear = statuses("publish-ready", {}, { openUrgentPins: 0 });
    expect(clear.byId.get("publish")).toBe("current");
  });

  it("caps a stage at not-done while its consensus gate has not agreed", () => {
    // 콘티 잠금까지 끝났어도(thumbnail-locked) 기획 합의가 안 끝났으면 기획은 done이 아니다.
    // 전선은 막힌 가장 이른 단계로 돌아오고, 작화 current는 todo로 내린다.
    const blocked = statuses("thumbnail-locked", {}, {
      stageGate: { completionByStage: { plan: false } },
    });
    expect(blocked.byId.get("plan")).toBe("current");
    expect(blocked.byId.get("storyboard")).toBe("done");
    expect(blocked.byId.get("art")).toBe("todo");
    expect(blocked.all.filter((entry) => entry.status === "current")).toHaveLength(1);
    expect(currentEpisodeStage(blocked.all)?.id).toBe("plan");
  });

  it("returns the frontier to the earliest blocked gate when several gates block", () => {
    const blocked = statuses("thumbnail-locked", {}, {
      stageGate: { completionByStage: { plan: false, storyboard: false } },
    });
    expect(blocked.byId.get("plan")).toBe("current");
    expect(blocked.byId.get("storyboard")).toBe("todo");
    expect(blocked.byId.get("art")).toBe("todo");
    expect(blocked.all.filter((entry) => entry.status === "current")).toHaveLength(1);
  });

  it("holds publish back from publish-ready while the sketch gate blocks, like urgent pins do", () => {
    const blocked = statuses("publish-ready", {}, {
      stageGate: { completionByStage: { plan: true, storyboard: true, art: false } },
    });
    expect(blocked.byId.get("art")).toBe("current");
    expect(blocked.byId.get("publish")).toBe("todo");
    // 게이트가 말하지 않는 단계(검수·식자)는 기존 판정을 유지한다.
    expect(blocked.byId.get("review")).toBe("done");
    expect(blocked.byId.get("lettering")).toBe("done");
    expect(blocked.all.filter((entry) => entry.status === "current")).toHaveLength(1);
  });

  it("never promotes on gate agreement alone and ignores missing or null summaries", () => {
    // 합의가 끝나도 상태 기계가 지나지 않은 단계를 done이라 말하지 않는다.
    const agreed = statuses("episode-planning", {}, {
      stageGate: { completionByStage: { plan: true } },
    });
    expect(agreed.byId.get("plan")).toBe("current");
    // 키가 없는 단계는 게이트가 아무 말도 하지 않는다.
    const partial = statuses("thumbnail-locked", {}, {
      stageGate: { completionByStage: { storyboard: true } },
    });
    expect(partial.ordered).toEqual(["done", "done", "current", "todo", "todo", "todo", "todo"]);
    // 요약이 없거나 null이면 파일럿 판정 그대로다.
    expect(statuses("thumbnail-locked", {}, { stageGate: null }).ordered)
      .toEqual(["done", "done", "current", "todo", "todo", "todo", "todo"]);
    expect(statuses("thumbnail-locked").ordered)
      .toEqual(["done", "done", "current", "todo", "todo", "todo", "todo"]);
  });

  it("does not rewrite published or paused episodes from gate data", () => {
    // 이미 게시된 회차의 진척은 사실이라 게이트로 되돌리지 않는다.
    const published = statuses("published", {}, {
      stageGate: { completionByStage: { plan: false } },
    });
    expect(published.ordered).toEqual(["done", "done", "done", "done", "done", "done", "current"]);
    // 멈춘 회차에서는 기존 규칙(승인·고정만 근거)이 우선하고 current를 만들지 않는다.
    const paused = statuses("blocked", { story: true }, {
      stageGate: { completionByStage: { plan: false } },
    });
    expect(paused.byId.get("plan")).toBe("done");
    expect(currentEpisodeStage(paused.all)).toBeNull();
  });
});

function episode(episodeId: string, state: State): EpisodeCollaboration {
  return {
    id: `collab:${episodeId}`,
    projectId: "project-1",
    episodeId,
    revision: 1,
    state,
    narrativeRevisionRef: null,
    visualRevisionRef: null,
    integratedRevisionRef: null,
    activeHandoffId: null,
    openBlockerCount: 0,
    storyLockApproved: false,
    thumbnailLockApproved: false,
    jointProofApproved: false,
    creditPreflightPassed: false,
    publicationPreflightPassed: false,
    plannedReleaseAt: null,
    updatedAt: "2026-10-13T00:00:00.000Z",
  };
}

function plan(episodeId: string, episodeNumber: number): EpisodePlan {
  return {
    id: `plan:${episodeId}`,
    projectId: "project-1",
    seasonId: null,
    episodeId,
    episodeNumber,
    revision: 1,
    status: "draft",
    title: `${episodeNumber}화`,
    logline: "",
    openingHook: "",
    coreConflict: "",
    turningPoints: [],
    cliffhanger: "",
    characterRefs: [],
    locationRefs: [],
    targetCutCount: 0,
    targetScrollHeightPx: 0,
    dialogueDensity: "medium",
    difficulty: 1,
    riskIds: [],
    narrativeRevisionRef: null,
    approvedByAssignmentIds: [],
    createdAt: "2026-10-13T00:00:00.000Z",
  };
}

describe("stepper episode selection (unchanged from S2-1)", () => {
  it("returns null when there is no usable episode", () => {
    expect(selectStepperEpisode([], [])).toBeNull();
    expect(selectStepperEpisode([episode("ep-1", "cancelled")], [])).toBeNull();
  });

  it("picks the earliest in-flight episode by episode number", () => {
    const selection = selectStepperEpisode(
      [episode("ep-2", "thumbnailing"), episode("ep-1", "published"), episode("ep-3", "episode-planning")],
      [plan("ep-1", 1), plan("ep-2", 2), plan("ep-3", 3)],
    );
    expect(selection?.episode.episodeId).toBe("ep-2");
    expect(selection?.episodeNumber).toBe(2);
  });

  it("falls back to the latest episode when everything is published", () => {
    const selection = selectStepperEpisode(
      [episode("ep-1", "published"), episode("ep-2", "published")],
      [plan("ep-1", 1), plan("ep-2", 2)],
    );
    expect(selection?.episode.episodeId).toBe("ep-2");
  });
});
