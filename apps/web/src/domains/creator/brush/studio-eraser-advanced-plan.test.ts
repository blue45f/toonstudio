import { describe, expect, it } from "vitest";

import {
  eraseVectorStrokeUpToIntersection,
  evaluateEraserStampResponse,
  resolveMultiLayerEraseTargets,
  shouldSnapStrokeToRuler,
  type StudioErasableLayerCandidate,
} from "./studio-eraser-advanced-plan";

import type { DrawEl } from "../studio-element-model";

describe("studio-eraser-advanced-plan", () => {
  it("스냅 지우개 토글이 켜진 경우에만 지우개 획이 자·원근자에 스냅된다", () => {
    expect(shouldSnapStrokeToRuler("pen", { snapToRulers: false })).toBe(true);
    expect(shouldSnapStrokeToRuler("eraser", { snapToRulers: false })).toBe(false);
    expect(shouldSnapStrokeToRuler("eraser", { snapToRulers: true })).toBe(true);
  });

  it("다중 레이어 지우기 플래너가 잠금·숨김·식자·참조 레이어를 안전하게 보호한다", () => {
    const layers: StudioErasableLayerCandidate[] = [
      { id: "line-ref", kind: "vector", visible: true, locked: false, isActive: false, isSelected: true, isReference: true },
      { id: "flat-skin", kind: "raster", visible: true, locked: false, isActive: true, isSelected: true },
      { id: "shade-hair", kind: "raster", visible: true, locked: false, isActive: false, isSelected: true },
      { id: "locked-bg", kind: "raster", visible: true, locked: true, isActive: false, isSelected: true },
      { id: "hidden-fx", kind: "raster", visible: false, locked: false, isActive: false, isSelected: true },
      { id: "dialogue", kind: "text", visible: true, locked: false, isActive: false, isSelected: true },
    ];

    expect(
      resolveMultiLayerEraseTargets(layers, { multiLayerScope: "active-only" }).map((l) => l.id),
    ).toEqual(["flat-skin"]);

    expect(
      resolveMultiLayerEraseTargets(layers, {
        multiLayerScope: "all-visible-unlocked",
        protectReferenceLayers: true,
      }).map((l) => l.id),
    ).toEqual(["flat-skin", "shade-hair"]);

    expect(
      resolveMultiLayerEraseTargets(layers, {
        multiLayerScope: "all-visible-unlocked",
        protectReferenceLayers: false,
      }).map((l) => l.id),
    ).toEqual(["line-ref", "flat-skin", "shade-hair"]);
  });

  it("다이나믹 지우개는 빠른 이동 속도에서 일반 지우개보다 지우기 폭을 넓힌다", () => {
    const slow = evaluateEraserStampResponse(20, 0.8, 0.05, "dynamic");
    const fast = evaluateEraserStampResponse(20, 0.8, 0.95, "dynamic");
    expect(fast.widthPx).toBeGreaterThan(slow.widthPx * 1.8);
  });

  it("eraseVectorStrokeUpToIntersection은 두 교차선 사이의 피격 구간만 잘라내고 양 끝 꼬리를 보존한다", () => {
    const target: DrawEl = {
      id: "h-line",
      type: "draw",
      kind: "freehand",
      mode: "pen",
      brush: "gpen",
      points: [0, 50, 100, 50, 200, 50],
      pressures: [0.5, 0.6, 0.5],
      stroke: "#111111",
      strokeWidth: 3,
    };
    const crossLeft: DrawEl = {
      id: "v-left",
      type: "draw",
      kind: "freehand",
      mode: "pen",
      points: [40, 0, 40, 100],
      stroke: "#111111",
      strokeWidth: 3,
    };
    const crossRight: DrawEl = {
      id: "v-right",
      type: "draw",
      kind: "freehand",
      mode: "pen",
      points: [160, 0, 160, 100],
      stroke: "#111111",
      strokeWidth: 3,
    };

    // 중앙 (100, 50) 지우기 → [40..160] 구간만 삭제되고 [0..40], [160..200] 두 조각이 남는다.
    const midErase = eraseVectorStrokeUpToIntersection(
      target,
      [target, crossLeft, crossRight],
      { x: 100, y: 51, radius: 6 },
    );
    expect(midErase.hit).toBe(true);
    expect(midErase.intersectionCount).toBe(2);
    expect(midErase.remainingStrokes).toHaveLength(2);
    expect(midErase.remainingStrokes[0]!.points.slice(-2)).toEqual([40, 50]);
    expect(midErase.remainingStrokes[1]!.points.slice(0, 2)).toEqual([160, 50]);

    // 교차점이 없는 단독 획을 지우면 통째로 삭제된다.
    const fullErase = eraseVectorStrokeUpToIntersection(target, [target], {
      x: 100,
      y: 50,
      radius: 6,
    });
    expect(fullErase.hit).toBe(true);
    expect(fullErase.remainingStrokes).toEqual([]);
  });
});
