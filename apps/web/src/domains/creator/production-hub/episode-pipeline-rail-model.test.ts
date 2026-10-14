import { describe, expect, it } from "vitest";

import {
  buildEpisodePipelineRail,
  episodePipelineTargetHref,
} from "./episode-pipeline-rail-model";
import type { EpisodeStageState, EpisodeStageStatus } from "./production-episode-stage";
import {
  EPISODE_STAGES,
  type EpisodeStageId,
} from "./production-project-surfaces";

const ORDER: readonly EpisodeStageId[] = [
  "plan", "storyboard", "art", "lettering", "review", "publish", "operate",
];

/** 순서대로 상태 7개를 받아 정본 라벨을 붙인 EpisodeStageState[]를 만든다. */
function states(...statuses: readonly EpisodeStageStatus[]): readonly EpisodeStageState[] {
  return EPISODE_STAGES.map((stage, index) => ({
    id: stage.id,
    label: stage.label,
    status: statuses[index] ?? "unknown",
  }));
}

const ALL_UNKNOWN = states("unknown", "unknown", "unknown", "unknown", "unknown", "unknown", "unknown");

describe("episode pipeline rail model", () => {
  it("sorts segments into EPISODE_STAGES order and always returns seven", () => {
    const shuffled = [...states("done", "current", "todo", "todo", "todo", "todo", "todo")].reverse();
    const rail = buildEpisodePipelineRail(shuffled);
    expect(rail.segments.map((segment) => segment.id)).toEqual([...ORDER]);
    expect(rail.segments).toHaveLength(7);
    expect(rail.segments.map((segment) => segment.status)).toEqual([
      "done", "current", "todo", "todo", "todo", "todo", "todo",
    ]);
    // 입력에 없는 단계는 지어내지 않고 unknown으로만 채운다.
    const partial = buildEpisodePipelineRail(states("current").slice(0, 1));
    expect(partial.segments).toHaveLength(7);
    expect(partial.segments[1]?.status).toBe("unknown");
  });

  it("shows the start note when planning is the current stage", () => {
    const rail = buildEpisodePipelineRail(states("current", "todo", "todo", "todo", "todo", "todo", "todo"));
    expect(rail.current?.stageId).toBe("plan");
    expect(rail.transitionNote?.fromStageId).toBeNull();
    expect(rail.transitionNote?.toStageId).toBe("plan");
    expect(rail.transitionNote?.text.ko).toBe("기획부터 시작해 보세요");
  });

  it.each([
    [
      states("done", "current", "todo", "todo", "todo", "todo", "todo"),
      "plan", "storyboard", "기획을 마쳤어요. 이제 콘티를 시작해 보세요",
    ],
    [
      states("done", "done", "done", "current", "todo", "todo", "todo"),
      "art", "lettering", "작화를 마쳤어요. 이제 식자·연출을 시작해 보세요",
    ],
    [
      states("done", "done", "done", "done", "current", "todo", "todo"),
      "lettering", "review", "식자·연출을 마쳤어요. 이제 검수를 시작해 보세요",
    ],
    [
      states("done", "done", "done", "done", "done", "done", "current"),
      "publish", "operate", "게시했어요. 이제 독자 반응을 확인해 보세요",
    ],
  ] as const)("picks the boundary note %s -> %s", (input, from, to, ko) => {
    const rail = buildEpisodePipelineRail(input);
    expect(rail.transitionNote?.fromStageId).toBe(from);
    expect(rail.transitionNote?.toStageId).toBe(to);
    expect(rail.transitionNote?.text.ko).toBe(ko);
    expect(rail.transitionNote?.text.en.length).toBeGreaterThan(0);
  });

  it("has no transition note when the previous stage is not done", () => {
    // 콘티가 지금 단계인데 기획이 끝나지 않았으면 경계 문구를 만들지 않는다.
    const rail = buildEpisodePipelineRail(states("todo", "current", "todo", "todo", "todo", "todo", "todo"));
    expect(rail.current?.stageId).toBe("storyboard");
    expect(rail.transitionNote).toBeNull();
    // 지금 단계 자체가 없으면(전부 끝났지만 운영이 todo) 전환 문구도 없다.
    const noCurrent = buildEpisodePipelineRail(states("done", "done", "done", "done", "done", "done", "todo"));
    expect(noCurrent.current).toBeNull();
    expect(noCurrent.transitionNote).toBeNull();
  });

  it("uses the current stage's primary action as the next action", () => {
    const rail = buildEpisodePipelineRail(states("done", "current", "todo", "todo", "todo", "todo", "todo"));
    expect(rail.nextAction?.label.ko).toBe("공정 보드 열기");
    expect(rail.nextAction?.target).toEqual({ kind: "surface", surface: "production" });
    const publishRail = buildEpisodePipelineRail(states("done", "done", "done", "done", "done", "current", "todo"));
    expect(publishRail.nextAction?.label.ko).toBe("게시 명령 센터 열기");
    expect(publishRail.nextAction?.target).toEqual({ kind: "path", path: "/studio/publish" });
  });

  it("falls back to the operate action when publishing is done and nothing is current", () => {
    const rail = buildEpisodePipelineRail(states("done", "done", "done", "done", "done", "done", "todo"));
    expect(rail.current).toBeNull();
    expect(rail.nextAction?.label.ko).toBe("회차 운영 보기");
    expect(rail.nextAction?.target).toEqual({ kind: "surface", surface: "episodes" });
  });

  it("invents nothing when every stage is unknown", () => {
    const rail = buildEpisodePipelineRail(ALL_UNKNOWN);
    expect(rail.current).toBeNull();
    expect(rail.nextAction).toBeNull();
    expect(rail.transitionNote).toBeNull();
    expect(rail.segments.every((segment) => segment.status === "unknown")).toBe(true);
  });

  it("passes progressDetail through only when provided", () => {
    const withDetail = buildEpisodePipelineRail(
      states("done", "done", "current", "todo", "todo", "todo", "todo"),
      { progressDetail: "컷 32/45" },
    );
    expect(withDetail.progressDetail).toBe("컷 32/45");
    const without = buildEpisodePipelineRail(states("done", "done", "current", "todo", "todo", "todo", "todo"));
    expect(without.progressDetail).toBeNull();
  });
});

describe("episodePipelineTargetHref (nav rules)", () => {
  it("resolves surface, path and episode-room targets like ProductionProjectNav", () => {
    expect(episodePipelineTargetHref({ kind: "surface", surface: "review" }, { projectId: "p 1" }))
      .toBe("/production/projects/p%201/review");
    expect(episodePipelineTargetHref({ kind: "surface", surface: "manuscripts", query: "manuscriptView=delivery" }, { projectId: "p1" }))
      .toBe("/production/projects/p1/manuscripts?manuscriptView=delivery");
    expect(episodePipelineTargetHref({ kind: "path", path: "/studio/publish" }, { projectId: "p1" }))
      .toBe("/studio/publish");
    // 회차 id를 알면 회차 룸 경로, 모르면 내비 폴백(회차 표면)과 같다.
    expect(episodePipelineTargetHref({ kind: "episode-room" }, { projectId: "p1", episodeId: "ep 1" }))
      .toBe("/production/projects/p1/episodes/ep%201");
    expect(episodePipelineTargetHref({ kind: "episode-room" }, { projectId: "p1" }))
      .toBe("/production/projects/p1/episodes");
  });
});
