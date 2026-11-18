import { describe, expect, it } from "vitest";

import {
  STUDIO_EFFECT_LINE_V2_PRESETS,
  buildTaperedTrajectoryPolygon,
  effectLinePresetToElementPatch,
  planEffectLinesFromPreset,
  planFocusLinesV2,
  planSpeedLinesV2,
} from "./studio-effect-line-planner-v2";

import type { StudioEffectLinePresetId } from "./studio-effect-line-planner-v2";

describe("studio-effect-line-planner-v2", () => {
  it("동일 시드에서 집중선·속도선 테이퍼 다각형이 바이트 단위로 결정적이다", () => {
    const first = planFocusLinesV2({
      seed: "scene-cut-04",
      width: 800,
      height: 1200,
      lineCount: 72,
      groupSize: 3,
      groupGap: 0.4,
      curveAmount: 0.25,
    });
    const second = planFocusLinesV2({
      seed: "scene-cut-04",
      width: 800,
      height: 1200,
      lineCount: 72,
      groupSize: 3,
      groupGap: 0.4,
      curveAmount: 0.25,
    });
    const different = planFocusLinesV2({
      seed: "scene-cut-05",
      width: 800,
      height: 1200,
      lineCount: 72,
      groupSize: 3,
      groupGap: 0.4,
      curveAmount: 0.25,
    });

    expect(first).toEqual(second);
    expect(first.seedHash).not.toBe(different.seedHash);
    expect(first.polygons[0]?.points).not.toEqual(different.polygons[0]?.points);
  });

  it("직선 단방향 테이퍼는 정확히 4정점 사각형을 만들고 taperIn/taperOut 폭을 반영한다", () => {
    const singleTaper = buildTaperedTrajectoryPolygon({
      index: 0,
      bundleIndex: 0,
      start: { x: 100, y: 200 },
      end: { x: 300, y: 200 },
      baseWidthPx: 10,
      taperIn: 0,
      taperOut: 0.8,
      curveAmount: 0,
      curveSteps: 10,
    });
    expect(singleTaper.vertices).toHaveLength(4);
    expect(singleTaper.startWidthPx).toBeCloseTo(10, 5);
    expect(singleTaper.endWidthPx).toBeCloseTo(2, 5);
    expect(singleTaper.pathData.startsWith("M ")).toBe(true);
    expect(singleTaper.pathData.endsWith(" Z")).toBe(true);

    const dualTaper = buildTaperedTrajectoryPolygon({
      index: 1,
      bundleIndex: 0,
      start: { x: 100, y: 200 },
      end: { x: 300, y: 200 },
      baseWidthPx: 12,
      taperIn: 0.75,
      taperOut: 1,
      curveAmount: 0,
      curveSteps: 10,
    });
    expect(dualTaper.startWidthPx).toBeCloseTo(3, 5);
    expect(dualTaper.endWidthPx).toBeCloseTo(0, 5);
    expect(dualTaper.vertices).toHaveLength(6);
  });

  it("2차 베지어 곡률(curveAmount)이 양수·음수로 궤적 중앙을 반대 방향으로 휜다", () => {
    const straight = buildTaperedTrajectoryPolygon({
      index: 0,
      bundleIndex: 0,
      start: { x: 0, y: 100 },
      end: { x: 200, y: 100 },
      baseWidthPx: 6,
      taperIn: 0,
      taperOut: 1,
      curveAmount: 0,
      curveSteps: 8,
    });
    const curvedPos = buildTaperedTrajectoryPolygon({
      index: 0,
      bundleIndex: 0,
      start: { x: 0, y: 100 },
      end: { x: 200, y: 100 },
      baseWidthPx: 6,
      taperIn: 0,
      taperOut: 1,
      curveAmount: 0.6,
      curveSteps: 8,
    });
    const curvedNeg = buildTaperedTrajectoryPolygon({
      index: 0,
      bundleIndex: 0,
      start: { x: 0, y: 100 },
      end: { x: 200, y: 100 },
      baseWidthPx: 6,
      taperIn: 0,
      taperOut: 1,
      curveAmount: -0.6,
      curveSteps: 8,
    });

    const midPos = curvedPos.centerline[Math.floor(curvedPos.centerline.length / 2)]!;
    const midNeg = curvedNeg.centerline[Math.floor(curvedNeg.centerline.length / 2)]!;
    expect(straight.centerline[0]!.y).toBe(100);
    expect(midPos.y).toBeGreaterThan(115);
    expect(midNeg.y).toBeLessThan(85);
    expect(midPos.y - 100).toBeCloseTo(100 - midNeg.y, 4);
  });

  it("다발 묶음(groupSize, groupGap)과 타원·곡선 방출기 및 내부 채움을 생성한다", () => {
    const ellipseFocus = planFocusLinesV2({
      seed: 42,
      width: 900,
      height: 700,
      lineCount: 24,
      groupSize: 4,
      groupGap: 1.2,
      groupDisturb: 0,
      innerRadiusX: 160,
      innerRadiusY: 90,
      ellipseRotationDeg: 20,
      innerFillEnabled: true,
      innerFillColor: "#ffffff",
      innerFillOpacity: 0.85,
    });

    expect(ellipseFocus.polygons).toHaveLength(24);
    expect(new Set(ellipseFocus.polygons.map((p) => p.bundleIndex)).size).toBe(6);
    expect(ellipseFocus.innerFill).not.toBeNull();
    expect(ellipseFocus.innerFill?.fillOpacity).toBeCloseTo(0.85, 5);
    expect(ellipseFocus.innerFill?.vertices.length).toBeGreaterThanOrEqual(24);

    const curveFocus = planFocusLinesV2({
      seed: 99,
      width: 600,
      height: 600,
      lineCount: 16,
      emitterKind: "curve",
      referenceCurve: [
        { x: 220, y: 220 },
        { x: 380, y: 220 },
        { x: 380, y: 380 },
        { x: 220, y: 380 },
      ],
      innerFillEnabled: true,
    });
    expect(curveFocus.polygons).toHaveLength(16);
    expect(curveFocus.innerFill?.vertices).toHaveLength(4);
  });

  it("속도선 타원·곡선 기준선과 8종 CSP 표준 프리셋 전체가 유효한 좌표를 생성한다", () => {
    const presetIds: readonly StudioEffectLinePresetId[] = [
      "scattered-focus",
      "dense-focus",
      "dark-curved-focus",
      "burst",
      "scattered-speed",
      "dark-speed",
      "gloom",
      "rain",
    ];

    for (const id of presetIds) {
      expect(STUDIO_EFFECT_LINE_V2_PRESETS[id]).toBeDefined();
      const plan = planEffectLinesFromPreset(id, { width: 720, height: 1080 }, `seed-${id}`);
      expect(plan.presetId).toBe(id);
      expect(plan.polygons.length).toBeGreaterThan(20);
      for (const poly of plan.polygons) {
        expect(poly.points.every((n) => Number.isFinite(n))).toBe(true);
      }
      const patch = effectLinePresetToElementPatch(id);
      expect(patch.lineCount).toBeGreaterThan(0);
    }

    const curvedSpeed = planSpeedLinesV2({
      seed: "wind-curve",
      width: 640,
      height: 480,
      lineCount: 20,
      emitterKind: "curve",
      referenceCurve: [
        { x: 60, y: 80 },
        { x: 80, y: 240 },
        { x: 60, y: 400 },
      ],
      curveAmount: 0.3,
    });
    expect(curvedSpeed.polygons).toHaveLength(20);
  });
});
