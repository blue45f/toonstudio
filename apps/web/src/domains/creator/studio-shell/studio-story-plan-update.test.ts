import { describe, expect, it } from "vitest";
import type { StudioStoryBeat } from "../studio-storyboard-planner";
import { updateStudioStoryPlan } from "./studio-story-plan-update";

const beat = (id: string, sceneId: string, order: number): StudioStoryBeat => ({
  id, sceneId, order, kind: "dialogue", summary: id, dialogue: "안녕.",
  characterIds: ["student"], locationId: "bookstore",
});

describe("대본 재분석 결과 적용", () => {
  it("추가한 장면의 식별자가 기존 계획과 충돌하지 않고 같은 장면의 묶음을 유지한다", () => {
    const original = [beat("source-1", "scene-1", 0)];
    const incoming = [beat("source-1", "scene-1", 9), beat("source-2", "scene-1", 10), beat("source-3", "scene-2", 11)];
    const originalBefore = structuredClone(original);
    const incomingBefore = structuredClone(incoming);
    const result = updateStudioStoryPlan(original, incoming, "append", "session-1");
    expect(result[0]).toEqual(original[0]);
    expect(new Set(result.map((item) => item.id)).size).toBe(4);
    expect(result[1]?.sceneId).not.toBe(original[0]?.sceneId);
    expect(result[1]?.sceneId).toBe(result[2]?.sceneId);
    expect(result[3]?.sceneId).not.toBe(result[2]?.sceneId);
    expect(result.map((item) => item.order)).toEqual([0, 1, 2, 3]);
    expect(original).toEqual(originalBefore);
    expect(incoming).toEqual(incomingBefore);
  });
  it("명시적으로 교체할 때만 이전 계획을 제거하고 새 계획의 원문을 보존한다", () => {
    const original = [beat("old", "old-scene", 0)];
    const incoming = [beat("new", "new-scene", 7)];
    const result = updateStudioStoryPlan(original, incoming, "replace", "session-2");
    expect(result).toEqual([{ ...incoming[0], order: 0 }]);
    expect(original[0]?.id).toBe("old");
    expect(incoming[0]?.order).toBe(7);
  });
});
