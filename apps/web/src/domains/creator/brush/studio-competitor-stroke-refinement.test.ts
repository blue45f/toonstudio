import { describe, expect, it } from "vitest";

import {
  analyzeBrushStudioV6Program,
  BRUSH_STUDIO_V6_FULL_CAPABILITIES,
  createBrushStudioV6Program,
} from "../brush-lab/brush-studio-v6-engine";
import {
  brushStudioV6MaterialMarksToSvg,
  createBrushStudioV6MaterialStroke,
  isBrushStudioV6MaterialNodeImplemented,
} from "../brush-lab/brush-studio-v6-material-engine";

import { refineStudioCompetitorFreehandStroke } from "./studio-competitor-stroke-refinement";

describe("드로잉 툴 경쟁사 패리티 브러시 고도화 (V7.3 머티리얼 & 구심 곡률 정제)", () => {
  it("구심 Catmull-Rom 곡률 적응형 정제기가 급커브 꺾임 각도와 스탬프 콩알자국(scalloping)을 동시에 줄이고 칼끝 출필 테이퍼를 생성한다", () => {
    const result = refineStudioCompetitorFreehandStroke({
      points: [10, 44, 34, 8, 56, 48, 86, 12],
      pressures: [0.35, 0.78, 0.9, 0.25],
      strokeWidthPx: 14,
      baseSpacingRatio: 0.12,
      subdivisionsPerSegment: 8,
      exitTaperStrength01: 0.78,
    });

    expect(result.stamps.length).toBeGreaterThan(20);
    expect(result.refinedMaxKinkDeg).toBeLessThan(result.linearMaxKinkDeg);
    expect(result.kinkReductionRatio01).toBeGreaterThan(0.5);
    expect(result.adaptiveScallopRatio01).toBeLessThan(result.linearScallopRatio01);
    expect(result.scallopReductionGain01).toBeGreaterThan(0.02);
    expect(result.terminalTaperRadiusPx).toBeLessThan(3.0);
  });

  it("신규 V7.3 네이티브 물리·마감 노드 3종과 경쟁사 대응 플래그십 레시피 4종이 무폴백으로 유효성 검사를 통과하고 실제 마크·SVG를 방출한다", () => {
    for (const nodeId of [
      "physics-centripetal-adaptive-stamp",
      "physics-centrifugal-bristle-turn",
      "finish-subpixel-sdf-aa",
    ]) {
      expect(isBrushStudioV6MaterialNodeImplemented(nodeId)).toBe(true);
    }

    const flagshipIds = [
      "csp-real-gpen-aa",
      "procreate-6b-tilt-graphite",
      "rebelle-capillary-wash",
      "krita-impasto-fan-bristle",
    ] as const;

    const sampleTurnPath = [
      { x: 12, y: 42, pressure: 0.32, tilt: 0.45, twist: 0 },
      { x: 36, y: 12, pressure: 0.74, tilt: 0.55, twist: 15 },
      { x: 62, y: 46, pressure: 0.86, tilt: 0.65, twist: 25 },
      { x: 92, y: 18, pressure: 0.18, tilt: 0.35, twist: 10 },
    ] as const;

    for (const recipeId of flagshipIds) {
      const program = createBrushStudioV6Program(recipeId);
      expect(program.id).toBe(recipeId);

      const analysis = analyzeBrushStudioV6Program(program, BRUSH_STUDIO_V6_FULL_CAPABILITIES);
      expect(analysis.valid, `${recipeId} issues: ${JSON.stringify(analysis.issues)}`).toBe(true);

      const stroke = createBrushStudioV6MaterialStroke(program);
      for (const pt of sampleTurnPath) stroke.push(pt);
      const marks = stroke.marks();
      expect(marks.length, `${recipeId} emitted marks`).toBeGreaterThan(10);

      const svg = brushStudioV6MaterialMarksToSvg(marks, "canvas-paths");
      expect(svg.length).toBeGreaterThan(64);
    }
  });
});
