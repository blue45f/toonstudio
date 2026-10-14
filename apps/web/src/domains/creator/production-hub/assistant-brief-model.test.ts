import { describe, expect, it } from "vitest";

import type {
  CutPlan,
  ProductionProjectAggregate,
  ProductionTask,
  SeriesMaster,
  StoryToArtHandoffPackage,
} from "@toonstudio/core/production";

import {
  attachAssistantBriefToTasks,
  buildAssistantBrief,
  buildAssistantBriefText,
  type AssistantBriefAggregate,
} from "./assistant-brief-model";

const scope = (kind: "project" | "episode" | "cut", id: string) =>
  ({ kind, id, ancestors: [] }) as const;

function cut(cutId: string, order: number): CutPlan {
  return {
    id: `plan-${cutId}`,
    projectId: "project-1",
    episodeId: "episode-1",
    sceneId: "scene-1",
    cutId,
    order,
    revision: 1,
    status: "approved",
    framing: order % 2 === 0 ? "클로즈업" : "와이드",
    camera: "고정",
    characterRefs: [],
    dialogueRefs: [],
    assetRequirementIds: [],
    layerRequirements: [],
    estimatedHours: 1,
    complexity: 3,
    approvedByAssignmentIds: [],
    createdAt: "2026-10-01T00:00:00.000Z",
  };
}

const master: SeriesMaster = {
  id: "master-1",
  projectId: "project-1",
  revision: 2,
  status: "locked",
  premise: "밤의 도시",
  genreRules: [],
  characterBibleRevisionRefs: [],
  locationBibleRevisionRefs: [],
  worldRules: [],
  terminology: {},
  styleRules: ["톤은 2종만 쓴다", "빗줄기는 왼쪽 위에서 오른쪽 아래로"],
  forbiddenElements: ["그라데이션 하늘"],
  sourceEvidenceRefs: [],
  approvedByAssignmentIds: [],
  createdAt: "2026-10-01T00:00:00.000Z",
};

const handoff: StoryToArtHandoffPackage = {
  id: "handoff-1",
  projectId: "project-1",
  episodeId: "episode-1",
  handoffRevision: 1,
  status: "ready-to-offer",
  storySnapshotRef: null,
  storyLockRef: null,
  storyBibleRevisionRef: null,
  characterBibleRevisionRefs: [],
  episodeIntentRef: null,
  beatRefs: [],
  sceneRefs: [],
  lockedDialogueRefs: [],
  continuityReferenceRefs: ["cut-2"],
  visualRequirementRefs: [],
  forbiddenInterpretationRefs: [],
  assetRequirementRefs: [],
  locationReferenceRefs: [],
  costumeReferenceRefs: [],
  instructions: [
    { id: "ins-1", scope: scope("episode", "episode-1"), priority: "MUST_PRESERVE", latitude: "exact", text: "봉투 문양은 마지막 컷 전까지 가린다", rationale: "", sourceRevisionRef: "" },
    { id: "ins-2", scope: scope("cut", "cut-9"), priority: "DO_NOT_USE", latitude: "exact", text: "선택 범위 밖 금지 지시", rationale: "", sourceRevisionRef: "" },
    { id: "ins-3", scope: scope("cut", "cut-2"), priority: "DO_NOT_USE", latitude: "exact", text: "컷 2에서 네온 간판 금지", rationale: "", sourceRevisionRef: "" },
  ],
  platformProfileRef: null,
  technicalDeliveryRuleRef: null,
  rightsAndAiPolicyRef: null,
  creditPolicyRef: null,
  expectedDeliverables: [],
  reviewPolicyRef: null,
  decisionOwnerAssignmentIds: [],
  dueAt: "2026-10-20T00:00:00.000Z",
  openRiskAcceptances: [],
  createdByAssignmentId: "assignment-story",
  acceptedByAssignmentId: null,
  acceptedAt: null,
  digest: "digest",
  createdAt: "2026-10-01T00:00:00.000Z",
};

function task(id: string, processKey: string, overrides: Partial<ProductionTask> = {}): ProductionTask {
  return {
    id,
    projectId: "project-1",
    scope: scope("episode", "episode-1"),
    processKey,
    title: `${processKey} 작업`,
    status: "ready",
    assignmentIds: ["assignment-assistant"],
    reviewerAssignmentIds: [],
    inputRevisionRefs: [],
    outputDeliverableIds: [],
    dependencyTaskIds: [],
    dueAt: null,
    estimateHours: null,
    completionCriteria: [],
    sourceAgreementMilestoneId: null,
    ...overrides,
  };
}

const aggregate: AssistantBriefAggregate = {
  projectId: "project-1",
  title: "밤의 코트",
  handoffs: [handoff],
  seriesMasters: [master],
  cutPlans: [cut("cut-1", 1), cut("cut-2", 2), cut("cut-3", 3), cut("cut-9", 9)],
  tasks: [
    task("task-color", "color", { completionCriteria: ["팔레트 외 색상 없음"] }),
    task("task-color-done", "color", { status: "done" }),
    task("task-line", "line-art"),
    task("task-other-episode", "color", { scope: scope("episode", "episode-2") }),
  ],
  workflowProfile: {
    id: "workflow-1",
    projectId: "project-1",
    name: "표준",
    scale: "team",
    revision: 1,
    steps: [
      { key: "color", name: "채색", description: "", defaultRole: "colorist", dependsOn: [], wipLimit: null, reviewRequired: true, estimateHours: 4, completionCriteria: ["톤 통일 확인"] },
    ],
    updatedAt: "2026-10-01T00:00:00.000Z",
  },
} as unknown as AssistantBriefAggregate;

const palette = { name: "밤 팔레트", swatches: [{ name: "코트 남색", hex: "#1B2A4A" }] };

describe("buildAssistantBrief", () => {
  it("컷 범위·공정을 고르면 스타일 규칙·팔레트·참조 컷이 조립되고 큐 작업에 연결된다", () => {
    const brief = buildAssistantBrief(aggregate, "handoff-1", {
      processKey: "color",
      fromOrder: 1,
      toOrder: 2,
      palette,
    });
    expect(brief).not.toBeNull();
    expect(brief!.cutIds).toEqual(["cut-1", "cut-2"]);
    expect(brief!.styleRules).toContain("톤은 2종만 쓴다");
    expect(brief!.styleRules).toContain("봉투 문양은 마지막 컷 전까지 가린다");
    expect(brief!.forbidden).toEqual(["그라데이션 하늘", "컷 2에서 네온 간판 금지"]);
    expect(brief!.palette?.swatches[0].hex).toBe("#1B2A4A");
    // 참조 컷 기본값은 인계 패키지의 continuityReferenceRefs(cut-2)에서 온다.
    expect(brief!.referenceCuts.map((entry) => entry.cutId)).toEqual(["cut-2"]);
    expect(brief!.referenceCuts[0].href).toBe("/production/projects/project-1/episodes/episode-1");
    // 완료 기준: 공정 프로필 우선 + 작업 기준 합집합.
    expect(brief!.completionCriteria).toEqual(["톤 통일 확인", "팔레트 외 색상 없음"]);
    // 큐 연결: 같은 공정·같은 회차·미완료 작업만.
    expect(brief!.queueTaskIds).toEqual(["task-color"]);
    expect(brief!.assigneeAssignmentIds).toEqual(["assignment-assistant"]);
    expect(brief!.queueHref).toBe("/production/projects/project-1/production");
    expect(brief!.missing).toEqual([]);
    expect(brief!.ready).toBe(true);
  });

  it("레거시 공정 키(thumbnail)는 canonical(storyboard)로 정규화된다", () => {
    const brief = buildAssistantBrief(aggregate, "handoff-1", { processKey: "thumbnail", palette });
    expect(brief!.processKey).toBe("storyboard");
    expect(brief!.missing).toContain("queue-task");
  });

  it("팔레트가 없으면 지어내지 않고 missing으로 드러낸다", () => {
    const brief = buildAssistantBrief(aggregate, "handoff-1", { processKey: "color" });
    expect(brief!.palette).toBeNull();
    expect(brief!.missing).toContain("palette");
    expect(brief!.ready).toBe(false);
    expect(buildAssistantBriefText(brief!)).toContain("연결된 팔레트 없음");
  });

  it("없는 참조 컷 id는 missing으로 보고하고, 없는 인계는 null이다", () => {
    const brief = buildAssistantBrief(aggregate, "handoff-1", {
      processKey: "color",
      palette,
      referenceCutIds: ["cut-404"],
    });
    expect(brief!.referenceCuts).toEqual([]);
    expect(brief!.missing).toContain("unknown-reference-cut:cut-404");
    expect(brief!.missing).toContain("reference-cuts");
    expect(buildAssistantBrief(aggregate, "handoff-404", { processKey: "color" })).toBeNull();
  });

  it("명시 컷 선택이 순서 범위보다 우선하고, 범위 밖 컷의 지시는 섞이지 않는다", () => {
    const brief = buildAssistantBrief(aggregate, "handoff-1", {
      processKey: "color",
      cutIds: ["cut-3"],
      fromOrder: 1,
      toOrder: 2,
      palette,
      referenceCutIds: ["cut-3"],
    });
    expect(brief!.cutIds).toEqual(["cut-3"]);
    expect(brief!.forbidden).toEqual(["그라데이션 하늘"]);
    expect(brief!.referenceCuts.map((entry) => entry.cutId)).toEqual(["cut-3"]);
  });
});

describe("attachAssistantBriefToTasks", () => {
  it("큐 작업에만 briefBlocks를 붙이고 멱등하다", () => {
    const brief = buildAssistantBrief(aggregate, "handoff-1", { processKey: "color", palette })!;
    const tasks = aggregate.tasks as unknown as readonly ProductionTask[];
    const once = attachAssistantBriefToTasks(tasks, brief);
    const target = once.find((entry) => entry.id === "task-color")!;
    expect(target.briefBlocks?.some((block) => block.text.includes("톤은 2종만 쓴다"))).toBe(true);
    expect(target.briefBlocks?.some((block) => block.kind === "checklist")).toBe(true);
    // 큐 밖 작업은 참조 그대로.
    expect(once.find((entry) => entry.id === "task-line")).toBe(tasks.find((entry) => entry.id === "task-line"));
    const twice = attachAssistantBriefToTasks(once, brief);
    expect(twice.find((entry) => entry.id === "task-color")!.briefBlocks).toEqual(target.briefBlocks);
  });

  it("평문 브리프에는 큐 링크와 빈 항목이 함께 적힌다", () => {
    const brief = buildAssistantBrief(aggregate, "handoff-1", { processKey: "line-art" })!;
    const text = buildAssistantBriefText(brief);
    expect(text).toContain("/production/projects/project-1/production");
    expect(text).toContain("palette");
  });
});
