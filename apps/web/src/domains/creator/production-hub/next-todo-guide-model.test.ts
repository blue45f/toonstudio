import { describe, expect, it } from "vitest";

import {
  buildHomeNextTodos,
  buildProjectNextTodos,
  nextTodoTargetHref,
  type NextTodoEpisodeInput,
} from "./next-todo-guide-model";
import type { EpisodeStageState, EpisodeStageStatus } from "./production-episode-stage";
import { EPISODE_STAGES, type EpisodeStageId } from "./production-project-surfaces";

const NOW = new Date("2026-10-14T03:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();

function states(...statuses: readonly EpisodeStageStatus[]): readonly EpisodeStageState[] {
  return EPISODE_STAGES.map((stage, index) => ({
    id: stage.id,
    label: stage.label,
    status: statuses[index] ?? "unknown",
  }));
}

const ALL_UNKNOWN = states("unknown", "unknown", "unknown", "unknown", "unknown", "unknown", "unknown");

function episode(
  partial: Partial<NextTodoEpisodeInput["episode"]> & { episodeId: string },
  stageStates: readonly EpisodeStageState[],
  plan?: NextTodoEpisodeInput["plan"],
): NextTodoEpisodeInput {
  return {
    episode: { state: "episode-planning", openBlockerCount: 0, plannedReleaseAt: null, ...partial },
    plan: plan ?? null,
    stageStates,
  };
}

describe("buildProjectNextTodos", () => {
  it("puts blockers first, then changes-requested and overdue tasks, then stage actions", () => {
    const guide = buildProjectNextTodos(
      {
        projectId: "p1",
        episodes: [
          episode(
            { episodeId: "ep-2", state: "final-art-production", openBlockerCount: 2 },
            states("done", "done", "current", "todo", "todo", "todo", "todo"),
            { episodeNumber: 2, title: "두 번째" },
          ),
          episode(
            { episodeId: "ep-1", state: "thumbnailing" },
            states("done", "current", "todo", "todo", "todo", "todo", "todo"),
            { episodeNumber: 1, title: "첫 번째" },
          ),
        ],
        tasks: [
          { id: "t-over", title: "지난 마감 작업", status: "in-progress", dueAt: iso(-1 * DAY), priority: "normal", scope: { kind: "episode", id: "ep-1", ancestors: [] } },
          { id: "t-change", title: "수정 요청 작업", status: "changes-requested", dueAt: null, priority: "normal", scope: { kind: "episode", id: "ep-2", ancestors: [] } },
          { id: "t-plain", title: "근거 없는 일상 작업", status: "in-progress", dueAt: null, priority: "normal", scope: { kind: "project", id: "p1", ancestors: [] } },
          { id: "t-done", title: "끝난 작업", status: "done", dueAt: iso(-5 * DAY), priority: "normal", scope: { kind: "project", id: "p1", ancestors: [] } },
        ],
      },
      { now: NOW },
    );
    expect(guide.items.map((item) => item.kind)).toEqual([
      "blocker",
      "changes-requested",
      "overdue-task",
      "episode-stage",
      "episode-stage",
    ]);
    // 근거 없는 일상 작업과 끝난 작업은 들어가지 않는다.
    expect(guide.items.some((item) => item.title === "근거 없는 일상 작업")).toBe(false);
    expect(guide.items.some((item) => item.title === "끝난 작업")).toBe(false);
    const blocker = guide.items[0];
    expect(blocker?.title).toBe("2화 · 두 번째");
    expect(blocker?.reason.ko).toContain("2건");
    expect(blocker?.href).toBe("/production/projects/p1/episodes/ep-2");
    const overdue = guide.items[2];
    expect(overdue?.reason.ko).toContain("1일");
    expect(overdue?.episodeId).toBe("ep-1");
    // 단계 행동은 단계 정의의 primaryAction을 그대로 쓴다. 동점에서는
    // id 순(ep-1 콘티 → ep-2 작화)으로 deterministic하게 정렬된다.
    const stageItems = guide.items.filter((item) => item.kind === "episode-stage");
    expect(stageItems.map((item) => item.actionLabel.ko)).toEqual(["공정 보드 열기", "원고 보기"]);
  });

  it("flags an unpublished episode whose planned release is within 3 days", () => {
    const guide = buildProjectNextTodos(
      {
        projectId: "p1",
        episodes: [
          episode(
            { episodeId: "ep-9", state: "publish-ready", plannedReleaseAt: iso(DAY) },
            states("done", "done", "done", "done", "done", "current", "todo"),
            { episodeNumber: 9, title: "게시 직전" },
          ),
        ],
        tasks: [],
      },
      { now: NOW },
    );
    const release = guide.items.find((item) => item.kind === "release-soon");
    expect(release?.stageId).toBe("publish");
    expect(release?.href).toBe("/studio/publish");
    // 게시 임박이 현재 단계(게시) 행동보다 먼저 온다.
    expect(guide.items[0]?.kind).toBe("release-soon");
  });

  it("suggests the operate action once after publishing is done, and nothing when all unknown", () => {
    const done = buildProjectNextTodos(
      {
        projectId: "p1",
        episodes: [
          episode(
            { episodeId: "ep-1", state: "published" },
            states("done", "done", "done", "done", "done", "done", "current"),
            { episodeNumber: 1, title: "끝난 회차" },
          ),
        ],
        tasks: [],
      },
      { now: NOW },
    );
    // operate가 current이므로 단계 행동은 운영 하나뿐이다.
    expect(done.items).toHaveLength(1);
    expect(done.items[0]?.stageId).toBe("operate");

    const unknown = buildProjectNextTodos(
      { projectId: "p1", episodes: [episode({ episodeId: "ep-x" }, ALL_UNKNOWN)], tasks: [] },
      { now: NOW },
    );
    expect(unknown.isEmpty).toBe(true);
    expect(unknown.items).toHaveLength(0);
  });

  it("caps the list at the limit but keeps the full count", () => {
    const episodes = Array.from({ length: 9 }, (_, index) =>
      episode(
        { episodeId: `ep-${index + 1}`, state: "thumbnailing" },
        states("done", "current", "todo", "todo", "todo", "todo", "todo"),
        { episodeNumber: index + 1, title: `회차 ${index + 1}` },
      ),
    );
    const guide = buildProjectNextTodos({ projectId: "p1", episodes, tasks: [] }, { now: NOW });
    expect(guide.items).toHaveLength(7);
    expect(guide.totalCount).toBe(9);
  });
});

describe("buildHomeNextTodos", () => {
  const project = {
    projectId: "p1",
    workId: "w1",
    title: "작품 하나",
    coverImageUrl: null,
    collaborationModel: "solo" as const,
    revision: 1,
    updatedAt: iso(0),
    access: { view: true, comment: true, edit: true, manage: true, owner: true, role: "owner" as const },
    healthScore: 90,
    activeEpisodeCount: 2,
    readyBufferCount: 1,
    criticalRiskCount: 0,
    overdueTaskCount: 0,
    blockedTaskCount: 0,
    unassignedTaskCount: 0,
    reviewTaskCount: 0,
    nextReleaseAt: null,
    forecastFinishAt: null,
    scheduleConfidencePercent: null,
  };

  it("ranks inbox buckets and skips summary risks for projects already in the inbox", () => {
    const guide = buildHomeNextTodos(
      {
        projects: [
          { ...project, overdueTaskCount: 3 },
          { ...project, projectId: "p2", title: "작품 둘", overdueTaskCount: 2 },
        ],
        inboxItems: [
          {
            bucket: "ready",
            projectId: "p1",
            projectTitle: "작품 하나",
            taskId: "t1",
            taskTitle: "시작 가능한 작업",
            processKey: "art",
            status: "ready",
            dueAt: null,
            estimateHours: 1,
            episodeId: null,
          },
          {
            bucket: "blockingOthers",
            projectId: "p1",
            projectTitle: "작품 하나",
            taskId: "t2",
            taskTitle: "남을 막는 작업",
            processKey: "art",
            status: "in-progress",
            dueAt: null,
            estimateHours: 2,
            episodeId: "ep-1",
          },
        ],
      },
      { now: NOW },
    );
    expect(guide.items[0]?.title).toBe("남을 막는 작업");
    expect(guide.items[0]?.href).toBe("/production/projects/p1/production?task=t2");
    // p1은 인박스로 이미 구체 행동이 보이므로 요약 위험을 겹치지 않고, p2만 남는다.
    const risks = guide.items.filter((item) => item.kind === "project-risk");
    expect(risks).toHaveLength(1);
    expect(risks[0]?.title).toBe("작품 둘");
    expect(risks[0]?.reason.ko).toContain("2건");
  });

  it("is empty when there are no projects and no inbox items", () => {
    const guide = buildHomeNextTodos({ projects: [], inboxItems: [] }, { now: NOW });
    expect(guide.isEmpty).toBe(true);
    const quiet = buildHomeNextTodos({ projects: [project], inboxItems: [] }, { now: NOW });
    expect(quiet.isEmpty).toBe(true);
  });
});

describe("nextTodoTargetHref (nav rules)", () => {
  it("resolves surface, path and episode-room targets like ProductionProjectNav", () => {
    expect(nextTodoTargetHref({ kind: "surface", surface: "review" }, { projectId: "p 1" })).toBe(
      "/production/projects/p%201/review",
    );
    expect(nextTodoTargetHref({ kind: "path", path: "/studio/publish" }, { projectId: "p1" })).toBe("/studio/publish");
    expect(nextTodoTargetHref({ kind: "episode-room" }, { projectId: "p1", episodeId: "ep 1" })).toBe(
      "/production/projects/p1/episodes/ep%201",
    );
    expect(nextTodoTargetHref({ kind: "episode-room" }, { projectId: "p1" })).toBe("/production/projects/p1/episodes");
  });

  it("keeps stage order aligned with EPISODE_STAGES", () => {
    const ids: readonly EpisodeStageId[] = EPISODE_STAGES.map((stage) => stage.id);
    expect(ids).toEqual(["plan", "storyboard", "art", "lettering", "review", "publish", "operate"]);
  });
});
