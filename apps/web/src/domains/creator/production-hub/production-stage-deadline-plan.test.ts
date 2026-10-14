import { describe, expect, it } from "vitest";

import {
  episodeScope,
  type EpisodeCollaboration,
  type EpisodeReleasePlan,
  type ProductionProjectAggregate,
  type ProductionTask,
} from "@toonstudio/core/production";

import {
  buildStageDeadlinePlan,
  resolveEpisodeRelease,
} from "./production-stage-deadline-plan";

const NOW = new Date("2026-10-14T09:00:00.000Z");
const DAY = 86_400_000;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

let seq = 0;
function task(partial: Partial<ProductionTask> & { readonly episodeId: string }): ProductionTask {
  seq += 1;
  const { episodeId, ...rest } = partial;
  return {
    id: `task-${seq}`,
    projectId: "project-1",
    scope: episodeScope("project-1", episodeId),
    processKey: "color",
    title: `작업 ${seq}`,
    status: "ready",
    assignmentIds: ["assign-1"],
    reviewerAssignmentIds: [],
    inputRevisionRefs: [],
    outputDeliverableIds: [],
    dependencyTaskIds: [],
    dueAt: null,
    estimateHours: { optimistic: 8, likely: 16, pessimistic: 24 },
    completionCriteria: [],
    sourceAgreementMilestoneId: null,
    ...rest,
  } as ProductionTask;
}

function episode(episodeId: string, partial: Partial<EpisodeCollaboration> = {}): EpisodeCollaboration {
  return {
    episodeId,
    state: "final-art-production",
    plannedReleaseAt: null,
    storyLockApproved: false,
    thumbnailLockApproved: false,
    jointProofApproved: false,
    creditPreflightPassed: false,
    publicationPreflightPassed: false,
    ...partial,
  } as EpisodeCollaboration;
}

function releasePlan(partial: Partial<EpisodeReleasePlan> & { readonly episodeId: string }): EpisodeReleasePlan {
  return {
    id: `release-plan-${partial.episodeId}`,
    projectId: "project-1",
    platformKey: "webtoon",
    locale: "ko-KR",
    timezone: "Asia/Seoul",
    scheduledAt: null,
    status: "scheduled",
    title: "게시 예약",
    description: "",
    thumbnailRevisionRef: null,
    sourceSubmissionIds: [],
    requiredCheckKeys: [],
    passedCheckKeys: [],
    blockers: [],
    warnings: [],
    externalReleaseId: null,
    externalUrl: null,
    revision: 1,
    updatedAt: iso(NOW.getTime()),
    ...partial,
  } as EpisodeReleasePlan;
}

function aggregate(partial: {
  readonly episodes: readonly EpisodeCollaboration[];
  readonly tasks?: readonly ProductionTask[];
  readonly releasePlans?: readonly EpisodeReleasePlan[];
}): ProductionProjectAggregate {
  return {
    projectId: "project-1",
    tasks: [],
    ...partial,
  } as unknown as ProductionProjectAggregate;
}

describe("연재 캘린더↔제작 진척 연동 — 게시 역산 모델", () => {
  it("게시 캘린더 예약이 회차 게시 계획보다 우선하고 출처를 드러낸다", () => {
    const calendarAt = iso(NOW.getTime() + 37 * DAY);
    const agg = aggregate({
      episodes: [episode("ep-5", { plannedReleaseAt: iso(NOW.getTime() + 60 * DAY) })],
      releasePlans: [releasePlan({ episodeId: "ep-5", scheduledAt: calendarAt })],
    });
    const resolution = resolveEpisodeRelease(agg, agg.episodes[0]!, []);
    expect(resolution.source).toBe("release-plan");
    expect(resolution.releaseAt).toBe(calendarAt);
    expect(resolution.releasePlanId).toBe("release-plan-ep-5");

    const plan = buildStageDeadlinePlan(agg, "ep-5", NOW)!;
    expect(plan.releaseSource).toBe("release-plan");
    const story = plan.stages.find((stage) => stage.processKey === "story")!;
    // 게시 37일 뒤 − 대본 선행 14일 = 23일 뒤가 권장 마감.
    expect(story.recommendedDueAt).toBe(iso(NOW.getTime() + 23 * DAY));
    expect(story.daysUntilRecommended).toBe(23);
  });

  it("레거시 공정 키(story) 작업 완료를 단계 완료로 인정하고 버퍼를 계산한다", () => {
    const releaseAt = iso(NOW.getTime() + 37 * DAY);
    const agg = aggregate({
      episodes: [episode("ep-5", { plannedReleaseAt: releaseAt })],
      tasks: [task({ episodeId: "ep-5", processKey: "story", status: "done" })],
    });
    const plan = buildStageDeadlinePlan(agg, "ep-5", NOW)!;
    const story = plan.stages.find((stage) => stage.processKey === "story")!;
    expect(story.done).toBe(true);
    expect(story.status).toBe("done");
    // 다음 미완료 단계는 콘티(선행 10일) → 버퍼 37 − 10 = 27일, safe.
    expect(plan.nextStage?.processKey).toBe("thumbnail");
    expect(plan.bufferDays).toBe(27);
    expect(plan.bufferLevel).toBe("safe");
  });

  it("가장 이른 미완료 단계의 권장 마감이 지났으면 버퍼 소진 경고를 낸다", () => {
    const releaseAt = iso(NOW.getTime() + 6 * DAY);
    const agg = aggregate({
      episodes: [episode("ep-5", { plannedReleaseAt: releaseAt })],
    });
    const plan = buildStageDeadlinePlan(agg, "ep-5", NOW)!;
    expect(plan.bufferLevel).toBe("exhausted");
    expect(plan.bufferDays).toBe(-8);
    const story = plan.stages.find((stage) => stage.processKey === "story")!;
    expect(story.status).toBe("overdue");
    expect(plan.warnings.some((warning) => warning.includes("대본·연출 확정") && warning.includes("8일 지났습니다"))).toBe(true);
  });

  it("버퍼가 2일 이하이면 임박 경고를 낸다", () => {
    const releaseAt = iso(NOW.getTime() + 6 * DAY);
    const doneKeys = ["story", "thumbnail", "line-art", "background"] as const;
    const agg = aggregate({
      episodes: [episode("ep-5", { plannedReleaseAt: releaseAt })],
      tasks: doneKeys.map((processKey) => task({ episodeId: "ep-5", processKey, status: "done" })),
    });
    const plan = buildStageDeadlinePlan(agg, "ep-5", NOW)!;
    // 미완료 중 가장 이른 단계는 채색(선행 4일) → 버퍼 6 − 4 = 2일.
    expect(plan.nextStage?.processKey).toBe("color");
    expect(plan.bufferDays).toBe(2);
    expect(plan.bufferLevel).toBe("tight");
    expect(plan.warnings.some((warning) => warning.includes("버퍼가 2일뿐입니다"))).toBe(true);
  });

  it("전 단계가 끝나면 ready로 게시 버퍼를 그대로 보여 준다", () => {
    const releaseAt = iso(NOW.getTime() + 9 * DAY);
    const allKeys = ["story", "thumbnail", "line-art", "background", "color", "lettering", "rights-preflight", "joint-proof", "publication"] as const;
    const agg = aggregate({
      episodes: [episode("ep-5", { plannedReleaseAt: releaseAt })],
      tasks: allKeys.map((processKey) => task({ episodeId: "ep-5", processKey, status: "approved" })),
    });
    const plan = buildStageDeadlinePlan(agg, "ep-5", NOW)!;
    expect(plan.bufferLevel).toBe("ready");
    expect(plan.bufferDays).toBe(9);
    expect(plan.nextStage).toBeNull();
  });

  it("게시 일정이 없으면 권장 마감을 지어내지 않고 unplanned로 알린다", () => {
    const agg = aggregate({ episodes: [episode("ep-5")] });
    const plan = buildStageDeadlinePlan(agg, "ep-5", NOW)!;
    expect(plan.releaseSource).toBe("none");
    expect(plan.bufferLevel).toBe("unplanned");
    expect(plan.bufferDays).toBeNull();
    expect(plan.stages.every((stage) => stage.status === "unplanned" && stage.recommendedDueAt === null)).toBe(true);
    expect(plan.warnings[0]).toContain("게시 캘린더");
  });

  it("계획 마감이 권장보다 늦게 잡힌 단계를 드리프트로 경고한다", () => {
    const releaseAt = iso(NOW.getTime() + 37 * DAY);
    const colorRecommended = NOW.getTime() + 33 * DAY;
    const agg = aggregate({
      episodes: [episode("ep-5", { plannedReleaseAt: releaseAt })],
      tasks: [task({ episodeId: "ep-5", processKey: "color", status: "in-progress", dueAt: iso(colorRecommended + 3 * DAY) })],
    });
    const plan = buildStageDeadlinePlan(agg, "ep-5", NOW)!;
    const color = plan.stages.find((stage) => stage.processKey === "color")!;
    expect(color.driftDays).toBe(3);
    expect(plan.warnings.some((warning) => warning.includes("밑색·명암·이펙트") && warning.includes("3일 늦게"))).toBe(true);
  });

  it("마일스톤 승인만으로 끝난 단계는 작업이 없어도 미등록 경고를 내지 않는다", () => {
    const releaseAt = iso(NOW.getTime() + 37 * DAY);
    const agg = aggregate({
      episodes: [episode("ep-5", { plannedReleaseAt: releaseAt, storyLockApproved: true })],
    });
    const plan = buildStageDeadlinePlan(agg, "ep-5", NOW)!;
    const story = plan.stages.find((stage) => stage.processKey === "story")!;
    expect(story.done).toBe(true);
    expect(story.taskExists).toBe(false);
    expect(plan.warnings.some((warning) => warning.includes("대본·연출 확정") && warning.includes("등록되지 않았습니다"))).toBe(false);
  });

  it("게시 완료 회차와 없는 회차는 계획을 만들지 않는다", () => {
    const agg = aggregate({
      episodes: [episode("ep-5", { state: "published", plannedReleaseAt: iso(NOW.getTime() + DAY) })],
    });
    expect(buildStageDeadlinePlan(agg, "ep-5", NOW)).toBeNull();
    expect(buildStageDeadlinePlan(agg, "ep-404", NOW)).toBeNull();
  });
});
