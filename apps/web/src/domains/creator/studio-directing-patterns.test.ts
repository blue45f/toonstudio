import { describe, expect, it } from "vitest";

import {
  DIRECTING_PATTERNS,
  buildDirectingPatternBeats,
  getDirectingPattern,
  insertDirectingPattern,
  previewDirectingPattern,
} from "./studio-directing-patterns";
import { planStudioStoryboard, type StudioStoryBeat } from "./studio-storyboard-planner";

function beat(id: string, order: number, kind: StudioStoryBeat["kind"] = "dialogue"): StudioStoryBeat {
  return {
    id,
    sceneId: "scene-1",
    order,
    kind,
    summary: `${id} 요약`,
    dialogue: "대사",
    characterIds: ["hero"],
    locationId: null,
  };
}

describe("directing pattern catalog", () => {
  it("모든 패턴은 3단계 이상이고 단계 요약이 비어 있지 않다", () => {
    expect(DIRECTING_PATTERNS.length).toBeGreaterThanOrEqual(5);
    for (const pattern of DIRECTING_PATTERNS) {
      expect(pattern.steps.length).toBeGreaterThanOrEqual(3);
      for (const entry of pattern.steps) expect(entry.summary.trim().length).toBeGreaterThan(0);
      expect(getDirectingPattern(pattern.id)).toBe(pattern);
    }
  });

  it("모르는 패턴 id는 던진다", () => {
    expect(() => getDirectingPattern("nope" as never)).toThrow(/Unknown directing pattern/);
  });
});

describe("buildDirectingPatternBeats", () => {
  it("삽입 비트가 플래너 계약을 만족하고 샷 시퀀스가 kind 순서를 따른다", () => {
    const beats = buildDirectingPatternBeats("confrontation-buildup", {
      sceneId: "scene-9",
      startOrder: 4,
      characterIds: ["hero", "rival"],
      locationId: "rooftop",
    });
    expect(beats.map((entry) => entry.order)).toEqual([4, 5, 6, 7, 8]);
    expect(beats.every((entry) => entry.sceneId === "scene-9")).toBe(true);
    expect(beats.every((entry) => entry.locationId === "rooftop")).toBe(true);
    expect(beats.every((entry) => entry.dialogue === "")).toBe(true);
    const plan = planStudioStoryboard(beats);
    expect(plan.shots.map((shot) => shot.shotSize)).toEqual([
      "wide", "medium", "close-up", "medium", "wide",
    ]);
  });

  it("캐릭터는 dialogue/reaction 단계에만 붙는다", () => {
    const beats = buildDirectingPatternBeats("twist-reveal", {
      sceneId: "s",
      startOrder: 0,
      characterIds: ["hero"],
    });
    const byKind = new Map(beats.map((entry) => [entry.kind, entry.characterIds]));
    expect(byKind.get("dialogue")).toEqual(["hero"]);
    expect(byKind.get("reaction")).toEqual(["hero"]);
    expect(byKind.get("setup")).toEqual([]);
    expect(byKind.get("reveal")).toEqual([]);
    // dialogue 비트에 캐릭터가 있어 플래너 경고가 생기지 않는다
    expect(planStudioStoryboard(beats).warnings).toEqual([]);
  });

  it("잘못된 sceneId·startOrder·idPrefix는 던진다", () => {
    expect(() => buildDirectingPatternBeats("twist-reveal", { sceneId: " ", startOrder: 0 })).toThrow();
    expect(() => buildDirectingPatternBeats("twist-reveal", { sceneId: "s", startOrder: -1 })).toThrow();
    expect(() => buildDirectingPatternBeats("twist-reveal", { sceneId: "s", startOrder: 0, idPrefix: "bad prefix!" })).toThrow();
  });
});

describe("insertDirectingPattern", () => {
  it("맨 뒤 삽입: 기존 비트 불변, order 연속, 플래너 통과", () => {
    const existing = [beat("a", 0), beat("b", 1, "action")];
    const result = insertDirectingPattern(existing, "cliffhanger-ending", {
      sceneId: "scene-1",
      startOrder: 2,
    });
    expect(existing.map((entry) => entry.order)).toEqual([0, 1]);
    expect(result.map((entry) => entry.order)).toEqual([0, 1, 2, 3, 4]);
    expect(() => planStudioStoryboard(result)).not.toThrow();
  });

  it("중간 삽입: 뒤 비트 order가 패턴 길이만큼 밀리고 상대 순서는 유지된다", () => {
    const existing = [beat("a", 0), beat("b", 1), beat("c", 2)];
    const result = insertDirectingPattern(existing, "flashback-entry", {
      sceneId: "scene-1",
      startOrder: 0,
      afterOrder: 0,
    });
    expect(result.find((entry) => entry.id === "b")?.order).toBe(5);
    expect(result.find((entry) => entry.id === "c")?.order).toBe(6);
    const orders = result.map((entry) => entry.order);
    expect(new Set(orders).size).toBe(orders.length);
    expect(() => planStudioStoryboard(result)).not.toThrow();
  });

  it("같은 패턴을 두 번 삽입해도 id가 겹치지 않는다", () => {
    const once = insertDirectingPattern([], "twist-reveal", { sceneId: "s", startOrder: 0 });
    const twice = insertDirectingPattern(once, "twist-reveal", {
      sceneId: "s",
      startOrder: once.length,
    });
    const ids = twice.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(() => planStudioStoryboard(twice)).not.toThrow();
  });

  it("없는 afterOrder는 던진다", () => {
    expect(() => insertDirectingPattern([beat("a", 0)], "twist-reveal", {
      sceneId: "s",
      startOrder: 0,
      afterOrder: 99,
    })).toThrow(/No story beat with order 99/);
  });
});

describe("previewDirectingPattern", () => {
  it("미리보기 높이는 실제 삽입 비트의 플래너 높이와 같다", () => {
    for (const pattern of DIRECTING_PATTERNS) {
      const preview = previewDirectingPattern(pattern.id);
      const beats = buildDirectingPatternBeats(pattern.id, { sceneId: "anywhere", startOrder: 0 });
      expect(preview.estimatedCanvasHeightPx).toBe(planStudioStoryboard(beats).estimatedCanvasHeightPx);
      expect(preview.shots).toHaveLength(pattern.steps.length);
    }
  });
});
