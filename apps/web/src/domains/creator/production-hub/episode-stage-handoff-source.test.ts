import { describe, expect, it } from "vitest";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import { episodeStageHandoffSource } from "./episode-stage-handoff-source";

function plan(episodeId: string, revision: number, logline: string) {
  return { episodeId, revision, logline } as never;
}

function scene(
  episodeId: string,
  sceneId: string,
  revision: number,
  order: number,
  status: string,
  purpose: string,
) {
  return { episodeId, sceneId, revision, order, status, purpose, emotionalBeat: "" } as never;
}

const AGGREGATE = {
  projectId: "project-1",
  episodePlans: [
    plan("episode-1", 1, "옛 기획"),
    plan("episode-1", 3, "최신 기획"),
    plan("episode-2", 9, "다른 회차 기획"),
  ],
  scenePlans: [
    scene("episode-1", "scene-b", 1, 2, "draft", "두 번째 장면(옛 리비전)"),
    scene("episode-1", "scene-b", 2, 2, "draft", "두 번째 장면"),
    scene("episode-1", "scene-a", 1, 1, "approved", "첫 번째 장면"),
    scene("episode-1", "scene-c", 1, 3, "archived", "보관된 장면"),
    scene("episode-1", "scene-d", 1, 4, "superseded", "대체된 장면"),
    scene("episode-2", "scene-a", 1, 1, "draft", "다른 회차 장면"),
  ],
} as unknown as ProductionProjectAggregate;

describe("episodeStageHandoffSource", () => {
  it("picks the latest-revision plan for the episode only", () => {
    const source = episodeStageHandoffSource(AGGREGATE, "episode-1");
    expect(source.plan?.logline).toBe("최신 기획");
    expect(episodeStageHandoffSource(AGGREGATE, "episode-9").plan).toBeNull();
  });

  it("keeps the latest revision per scene, ordered, excluding archived/superseded and other episodes", () => {
    const source = episodeStageHandoffSource(AGGREGATE, "episode-1");
    expect(source.scenePlans.map((entry) => entry.purpose)).toEqual(["첫 번째 장면", "두 번째 장면"]);
    expect(source.scenePlans.map((entry) => entry.order)).toEqual([1, 2]);
  });

  it("returns empty scene plans for an episode without any", () => {
    expect(episodeStageHandoffSource(AGGREGATE, "episode-9").scenePlans).toEqual([]);
  });
});
