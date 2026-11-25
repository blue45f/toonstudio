// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CAD_INTEROP_MATRIX,
  SHAPR3D_CAD_PRESETS,
  SHAPR3D_PARITY_GAP_MATRIX,
  StudioShapr3dCadPanel,
  evaluateParametricFeatureTree,
  exportCadTechnicalDrawingSvg,
  exportShapr3dCadManifestJson,
  formatOklch,
  getShapr3dCadPreset,
  isVioletSlopHue,
  sanitizeNonVioletHue,
  solveSketchConstraints,
  type Shapr3dPresetId,
} from "./index";

afterEach(cleanup);

function assertZeroVioletAndRawColors(svgMarkup: string): void {
  expect(svgMarkup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
  expect(svgMarkup).not.toMatch(/\brgba?\s*\(/iu);
  expect(svgMarkup).not.toMatch(/\bhsla?\s*\(/iu);
  for (const match of svgMarkup.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+(\d+(?:\.\d+)?)/gu)) {
    expect(isVioletSlopHue(Number(match[1]))).toBe(false);
  }
}

describe("1. 5종 웹툰·산업 디자인 CAD 프리셋 및 탈-바이올렛 OKLCH 규율", () => {
  it("필수 5종 CAD 프리셋 ID와 메타데이터·8단계 피처 트리를 모두 포함한다", () => {
    expect(SHAPR3D_CAD_PRESETS).toHaveLength(5);
    expect(SHAPR3D_CAD_PRESETS.map((p) => p.id)).toEqual([
      "webtoon-desk-lamp-arm",
      "rofan-ornate-window-frame",
      "scifi-mecha-joint-housing",
      "cafe-espresso-machine",
      "handheld-stylus-dock",
    ]);
    for (const preset of SHAPR3D_CAD_PRESETS) {
      expect(preset.nameKo.length).toBeGreaterThan(4);
      expect(preset.nameEn.length).toBeGreaterThan(4);
      expect(preset.features).toHaveLength(8);
    }
  });

  it("getShapr3dCadPreset이 정상 조회 및 미등록 ID 안전 폴백을 제공한다", () => {
    expect(getShapr3dCadPreset("rofan-ornate-window-frame").nameKo).toContain("창틀");
    expect(getShapr3dCadPreset("scifi-mecha-joint-housing").nameEn).toContain("Mecha");
    expect(getShapr3dCadPreset("non-existent" as Shapr3dPresetId).id).toBe("webtoon-desk-lamp-arm");
  });

  it("isVioletSlopHue와 sanitizeNonVioletHue가 270~320° 바이올렛 휴를 완전 배제한다", () => {
    expect(isVioletSlopHue(270)).toBe(true);
    expect(isVioletSlopHue(295)).toBe(true);
    expect(isVioletSlopHue(320)).toBe(true);
    expect(isVioletSlopHue(240)).toBe(false);
    expect(isVioletSlopHue(345)).toBe(false);
    for (let h = 270; h <= 320; h += 5) {
      expect(isVioletSlopHue(sanitizeNonVioletHue(h))).toBe(false);
    }
  });

  it("formatOklch가 원시 색 리터럴 없이 탈-바이올렛 OKLCH 문자열을 반환한다", () => {
    expect(formatOklch({ l: 0.62, c: 0.14, h: 215 })).toBe("oklch(0.62 0.14 215)");
    const sanitized = formatOklch({ l: 0.58, c: 0.18, h: 288 }, 0.65);
    expect(sanitized).toBe("oklch(0.58 0.18 242 / 0.65)");
    expect(sanitized).not.toMatch(/#|rgb|hsl/iu);
  });

  it("5종 프리셋의 액센트 및 등각 투상 면 팔레트가 바이올렛 휴 0%다", () => {
    for (const preset of SHAPR3D_CAD_PRESETS) {
      expect(isVioletSlopHue(preset.accentOklch.h)).toBe(false);
      const res = evaluateParametricFeatureTree({ presetId: preset.id });
      for (const face of res.isoFaces) {
        assertZeroVioletAndRawColors(`${face.fillOklch} ${face.strokeOklch}`);
      }
    }
  });
});

describe("2. 2D 구속조건 스케처 수치 솔버 (8종 구속 · 잔차 < 1e-3mm · DOF)", () => {
  it("존재하지 않는 점을 가리키는 구속조건을 수렴으로 처리하지 않는다", () => {
    expect(() => solveSketchConstraints({
      points: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 10, y: 2 }],
      segments: [],
      constraints: [{ id: "c", kind: "horizontal", enabled: true, pointIds: ["a", "missing"], labelKo: "수평", labelEn: "Horizontal" }],
    })).toThrow(RangeError);
  });

  it("horizontal·vertical·distance-mm 구속이 섭동된 초기점에서 잔차 < 1e-3mm로 수렴한다", () => {
    const solved = solveSketchConstraints({
      points: [
        { id: "p0", x: 0, y: 0, fixed: true },
        { id: "p1", x: 105.4, y: 3.2 },
        { id: "p2", x: -2.7, y: 63.8 },
      ],
      segments: [
        { id: "s1", kind: "line", startPointId: "p0", endPointId: "p1" },
        { id: "s2", kind: "line", startPointId: "p0", endPointId: "p2" },
      ],
      constraints: [
        { id: "c1", kind: "horizontal", enabled: true, segmentIds: ["s1"], labelKo: "수평", labelEn: "Horiz" },
        { id: "c2", kind: "vertical", enabled: true, segmentIds: ["s2"], labelKo: "수직", labelEn: "Vert" },
        { id: "c3", kind: "distance-mm", enabled: true, segmentIds: ["s1"], targetMm: 100, labelKo: "폭", labelEn: "W" },
        { id: "c4", kind: "distance-mm", enabled: true, segmentIds: ["s2"], targetMm: 60, labelKo: "높이", labelEn: "H" },
      ],
    });
    expect(solved.converged).toBe(true);
    expect(solved.maxResidualMm).toBeLessThan(1e-3);
    expect(solved.dofStatus).toBe("fully-constrained");
    expect(solved.remainingDof).toBe(0);
    expect(solved.solvedPoints[1]).toMatchObject({ x: 100, y: 0 });
    expect(solved.solvedPoints[2]).toMatchObject({ x: 0, y: 60 });
  });

  it("parallel·perpendicular 구속이 각도 오차를 0으로 수렴시킨다", () => {
    const solved = solveSketchConstraints({
      points: [
        { id: "a", x: 0, y: 0, fixed: true },
        { id: "b", x: 50, y: 0, fixed: true },
        { id: "c", x: 0, y: 30, fixed: true },
        { id: "d", x: 48, y: 34.5 },
        { id: "e", x: 53.2, y: 29.4 },
      ],
      segments: [
        { id: "base", kind: "line", startPointId: "a", endPointId: "b" },
        { id: "top", kind: "line", startPointId: "c", endPointId: "d" },
        { id: "side", kind: "line", startPointId: "b", endPointId: "e" },
      ],
      constraints: [
        { id: "p1", kind: "parallel", enabled: true, segmentIds: ["base", "top"], labelKo: "평행", labelEn: "Parallel" },
        { id: "p2", kind: "perpendicular", enabled: true, segmentIds: ["base", "side"], labelKo: "직교", labelEn: "Perp" },
      ],
    });
    expect(solved.converged).toBe(true);
    expect(solved.maxResidualMm).toBeLessThan(1e-3);
    expect(Math.abs(solved.solvedPoints[3].y - 30)).toBeLessThan(1e-3);
    expect(Math.abs(solved.solvedPoints[4].x - 50)).toBeLessThan(1e-3);
  });

  it("equal-length 구속이 두 세그먼트 길이를 정밀 일치시킨다", () => {
    const solved = solveSketchConstraints({
      points: [
        { id: "p0", x: 0, y: 0, fixed: true },
        { id: "p1", x: 80, y: 0, fixed: true },
        { id: "p2", x: 0, y: 55 },
      ],
      segments: [
        { id: "s1", kind: "line", startPointId: "p0", endPointId: "p1" },
        { id: "s2", kind: "line", startPointId: "p0", endPointId: "p2" },
      ],
      constraints: [
        { id: "v", kind: "vertical", enabled: true, segmentIds: ["s2"], labelKo: "수직", labelEn: "Vert" },
        { id: "eq", kind: "equal-length", enabled: true, segmentIds: ["s1", "s2"], labelKo: "등길이", labelEn: "Equal" },
      ],
    });
    expect(solved.converged).toBe(true);
    expect(solved.maxResidualMm).toBeLessThan(1e-3);
    expect(solved.solvedPoints[2].y).toBeCloseTo(80, 2);
  });

  it("concentric 구속이 두 원호 중심점을 동일 좌표로 수렴시킨다", () => {
    const solved = solveSketchConstraints({
      points: [
        { id: "c0", x: 40, y: 25, fixed: true },
        { id: "c1", x: 43.8, y: 21.4 },
      ],
      segments: [
        { id: "a0", kind: "arc", startPointId: "c0", endPointId: "c0", centerPointId: "c0", radiusMm: 18 },
        { id: "a1", kind: "arc", startPointId: "c1", endPointId: "c1", centerPointId: "c1", radiusMm: 10 },
      ],
      constraints: [
        { id: "con", kind: "concentric", enabled: true, segmentIds: ["a0", "a1"], labelKo: "동심", labelEn: "Concentric" },
      ],
    });
    expect(solved.converged).toBe(true);
    expect(solved.maxResidualMm).toBeLessThan(1e-3);
    expect(solved.dofStatus).toBe("fully-constrained");
    expect(solved.solvedPoints[1]).toMatchObject({ x: 40, y: 25 });
  });

  it("symmetric 구속이 기준축 axisX에 대해 두 점을 대칭 수렴시킨다", () => {
    const solved = solveSketchConstraints({
      points: [
        { id: "mL", x: 20, y: 30, fixed: true },
        { id: "mR", x: 74.5, y: 34.2 },
      ],
      segments: [],
      constraints: [
        { id: "sym", kind: "symmetric", enabled: true, pointIds: ["mL", "mR"], axisX: 50, labelKo: "대칭", labelEn: "Sym" },
      ],
    });
    expect(solved.converged).toBe(true);
    expect(solved.maxResidualMm).toBeLessThan(1e-3);
    expect(solved.dofStatus).toBe("fully-constrained");
    expect(solved.solvedPoints[1]).toMatchObject({ x: 80, y: 30 });
  });

  it("5종 모든 프리셋의 기본 스케치가 잔차 < 1e-3mm의 완전 구속(0 DOF)으로 수렴한다", () => {
    for (const preset of SHAPR3D_CAD_PRESETS) {
      const res = evaluateParametricFeatureTree({ presetId: preset.id });
      expect(res.sketch.converged).toBe(true);
      expect(res.sketch.maxResidualMm).toBeLessThan(1e-3);
      expect(res.sketch.dofStatus).toBe("fully-constrained");
      expect(res.sketch.remainingDof).toBe(0);
    }
  });

  it("필수 구속조건을 해제하면 자유도 상태가 under-constrained로 전환된다", () => {
    const res = evaluateParametricFeatureTree({
      presetId: "webtoon-desk-lamp-arm",
      constraintEnabledOverrides: { "c-height-mm": false },
    });
    expect(res.sketch.dofStatus).toBe("under-constrained");
    expect(res.sketch.remainingDof).toBeGreaterThan(0);
  });

  it("충돌하는 과잉 구속조건을 활성화하면 dofStatus가 over-constrained로 판정된다", () => {
    const res = evaluateParametricFeatureTree({
      presetId: "webtoon-desk-lamp-arm",
      constraintEnabledOverrides: { "c-over-diag": true },
    });
    expect(res.sketch.dofStatus).toBe("over-constrained");
    expect(res.sketch.activeEquations).toBeGreaterThan(res.sketch.totalVariables);
  });
});

describe("3. 8단계 파라메트릭 피처 트리 재생성 & 자기교차 방지 Fail-Closed 가드", () => {
  it("8단계 피처 체인(Sketch2D→Extrude→Revolve→Fillet→Chamfer→Shell→Boolean→Pattern)을 순서대로 평가한다", () => {
    const res = evaluateParametricFeatureTree({ presetId: "webtoon-desk-lamp-arm" });
    expect(res.regenerationOk).toBe(true);
    expect(res.failClosedGuards).toHaveLength(0);
    expect(res.featureTree.map((f) => f.kind)).toEqual([
      "sketch-2d",
      "extrude",
      "revolve",
      "fillet",
      "chamfer",
      "shell",
      "boolean",
      "pattern",
    ]);
    for (const node of res.featureTree) {
      expect(node.status).toBe("ok");
    }
  });

  it("동일 입력에 대해 결정론적 regenerationHash를 생성하고 상위 치수 변경 시 하위 트리 전체가 재생성된다", () => {
    const a1 = evaluateParametricFeatureTree({ presetId: "rofan-ornate-window-frame" });
    const a2 = evaluateParametricFeatureTree({ presetId: "rofan-ornate-window-frame" });
    const wider = evaluateParametricFeatureTree({
      presetId: "rofan-ornate-window-frame",
      params: { profileWidthMm: 165 },
    });
    expect(a1.regenerationHash).toBe(a2.regenerationHash);
    expect(wider.regenerationHash).not.toBe(a1.regenerationHash);
    expect(wider.integrity.volumeCm3).toBeGreaterThan(a1.integrity.volumeCm3);
    expect(wider.integrity.surfaceAreaCm2).toBeGreaterThan(a1.integrity.surfaceAreaCm2);
  });

  it("직접 면 돌출(Push-Pull mm)을 늘리면 부피와 표면적이 단조 증가한다", () => {
    const shallow = evaluateParametricFeatureTree({ presetId: "cafe-espresso-machine", params: { extrudeDepthMm: 50 } });
    const deep = evaluateParametricFeatureTree({ presetId: "cafe-espresso-machine", params: { extrudeDepthMm: 130 } });
    expect(deep.integrity.volumeCm3).toBeGreaterThan(shallow.integrity.volumeCm3);
    expect(deep.integrity.surfaceAreaCm2).toBeGreaterThan(shallow.integrity.surfaceAreaCm2);
    expect(deep.integrity.dimensionsMeters.depthM).toBeGreaterThan(shallow.integrity.dimensionsMeters.depthM);
  });

  it("쉘 피처를 억제하면 중공이 사라져 부피가 증가하고, 회전 피처를 억제하면 부피가 감소한다", () => {
    const base = evaluateParametricFeatureTree({ presetId: "handheld-stylus-dock" });
    const noShell = evaluateParametricFeatureTree({
      presetId: "handheld-stylus-dock",
      featureEnabledOverrides: { "f-shell": false },
    });
    const noRevolve = evaluateParametricFeatureTree({
      presetId: "handheld-stylus-dock",
      featureEnabledOverrides: { "f-revolve": false },
    });
    expect(noShell.featureTree.find((f) => f.kind === "shell")?.status).toBe("suppressed");
    expect(noShell.integrity.volumeCm3).toBeGreaterThan(base.integrity.volumeCm3);
    expect(noRevolve.integrity.volumeCm3).toBeLessThan(base.integrity.volumeCm3);
  });

  it("Boolean 모드(union / cut / intersect)와 Pattern 개수가 하위 솔리드 부피에 정확히 반영된다", () => {
    const union = evaluateParametricFeatureTree({ presetId: "scifi-mecha-joint-housing", params: { booleanMode: "union" } });
    const cut = evaluateParametricFeatureTree({ presetId: "scifi-mecha-joint-housing", params: { booleanMode: "cut" } });
    const intersect = evaluateParametricFeatureTree({ presetId: "scifi-mecha-joint-housing", params: { booleanMode: "intersect" } });
    const morePattern = evaluateParametricFeatureTree({ presetId: "scifi-mecha-joint-housing", params: { patternCount: 10 } });
    expect(union.integrity.volumeCm3).toBeGreaterThan(cut.integrity.volumeCm3);
    expect(cut.integrity.volumeCm3).toBeGreaterThan(intersect.integrity.volumeCm3);
    expect(morePattern.integrity.faceCount).toBeGreaterThan(union.integrity.faceCount);
  });

  it("필렛 반경 >= 벽 두께 * 0.48 시 자기교차 방지 Fail-Closed 가드가 작동하고 비다양체 엣지를 0으로 유지한다", () => {
    const blocked = evaluateParametricFeatureTree({
      presetId: "webtoon-desk-lamp-arm",
      params: { wallThicknessMm: 6.0, filletRadiusMm: 3.0 }, // 3.0 >= 6.0 * 0.48 (2.88)
    });
    expect(blocked.regenerationOk).toBe(false);
    expect(blocked.failClosedGuards.some((g) => g.code === "FILLET_SELF_INTERSECTION_GUARD")).toBe(true);
    expect(blocked.featureTree.find((f) => f.kind === "fillet")?.status).toBe("failed-guard");
    expect(blocked.featureTree.find((f) => f.kind === "shell")?.status).toBe("skipped-downstream");
    expect(blocked.integrity.nonManifoldEdges).toBeNull();
    expect(blocked.effectiveParams.filletRadiusMm).toBeLessThan(blocked.params.filletRadiusMm);
  });

  it("챔퍼 크기 과다 시 CHAMFER_EDGE_COLLAPSE_GUARD가 Fail-Closed 차단한다", () => {
    const blocked = evaluateParametricFeatureTree({
      presetId: "webtoon-desk-lamp-arm",
      params: { wallThicknessMm: 5.0, filletRadiusMm: 1.0, chamferSizeMm: 3.5 },
    });
    expect(blocked.regenerationOk).toBe(false);
    expect(blocked.failClosedGuards.some((g) => g.code === "CHAMFER_EDGE_COLLAPSE_GUARD")).toBe(true);
    expect(blocked.featureTree.find((f) => f.kind === "chamfer")?.status).toBe("failed-guard");
  });

  it("쉘 벽 두께 과다 시 SHELL_WALL_COLLAPSE_GUARD가 Fail-Closed 차단한다", () => {
    const blocked = evaluateParametricFeatureTree({
      presetId: "webtoon-desk-lamp-arm",
      params: { extrudeDepthMm: 24, wallThicknessMm: 15, filletRadiusMm: 1.0, chamferSizeMm: 0.8 },
    });
    expect(blocked.regenerationOk).toBe(false);
    expect(blocked.failClosedGuards.some((g) => g.code === "SHELL_WALL_COLLAPSE_GUARD")).toBe(true);
    expect(blocked.featureTree.find((f) => f.kind === "shell")?.status).toBe("failed-guard");
  });

  it("과잉 구속 충돌(잔차 >= 0.01mm) 시 SKETCH_OVERCONSTRAINED_CONFLICT로 하위 재생성을 차단한다", () => {
    const blocked = evaluateParametricFeatureTree({
      presetId: "webtoon-desk-lamp-arm",
      constraintEnabledOverrides: { "c-over-diag": true },
    });
    expect(blocked.regenerationOk).toBe(false);
    expect(blocked.failClosedGuards.some((g) => g.code === "SKETCH_OVERCONSTRAINED_CONFLICT")).toBe(true);
    expect(blocked.featureTree.find((f) => f.kind === "sketch-2d")?.status).toBe("failed-guard");
    expect(blocked.featureTree.find((f) => f.kind === "extrude")?.status).toBe("skipped-downstream");
  });
});

describe("4. 수밀 B-Rep 무결성 · 단면 절단 · 상호운용 · 2D 도면 SVG · Shapr3D 갭 매트릭스", () => {
  it("5종 프리셋은 미터법 치수와 위상 추정값을 제공하고 메시 검증 값은 비운다", () => {
    for (const preset of SHAPR3D_CAD_PRESETS) {
      const res = evaluateParametricFeatureTree({ presetId: preset.id });
      const { integrity } = res;
      expect(integrity.watertight).toBeNull();
      expect(integrity.nonManifoldEdges).toBeNull();
      expect(integrity.looseVertices).toBeNull();
      expect(integrity.metricScale).toBe(1.0);
      expect(integrity.floorGroundedY0).toBeNull();
      expect(integrity.minYMeters).toBeNull();
      expect(integrity.volumeCm3).toBeGreaterThan(0);
      expect(integrity.surfaceAreaCm2).toBeGreaterThan(0);
      expect(integrity.vertexCount - integrity.edgeCount + integrity.faceCount).toBe(integrity.eulerCharacteristic);
    }
  });

  it("실시간 단면 절단(Section Plane)이 X/Y/Z 축과 10~90% 위치에 따라 절단 좌표와 45° 해칭선을 갱신한다", () => {
    const s20 = evaluateParametricFeatureTree({
      presetId: "cafe-espresso-machine",
      params: { sectionAxis: "Y", sectionPlanePercent: 20 },
    });
    const s80 = evaluateParametricFeatureTree({
      presetId: "cafe-espresso-machine",
      params: { sectionAxis: "Y", sectionPlanePercent: 80 },
    });
    const sX = evaluateParametricFeatureTree({
      presetId: "cafe-espresso-machine",
      params: { sectionAxis: "X", sectionPlanePercent: 50 },
    });
    expect(s80.sectionPlane.planePositionMm).toBeGreaterThan(s20.sectionPlane.planePositionMm);
    expect(s20.sectionPlane.hatchLines.length).toBeGreaterThan(4);
    expect(s20.sectionPlane.internalCavityVisible).toBe(true);
    expect(sX.sectionPlane.axis).toBe("X");
  });

  it("STEP/IGES/3MF/STL/GLB 5종 상호운용 매트릭스가 현재/향후 상태를 정직하게 구분한다", () => {
    expect(CAD_INTEROP_MATRIX.map((r) => r.format)).toEqual(["STEP", "IGES", "3MF", "STL", "GLB"]);
    expect(CAD_INTEROP_MATRIX.find((r) => r.format === "GLB")?.currentStatus).toBe("target-wasm");
    expect(CAD_INTEROP_MATRIX.find((r) => r.format === "STEP")?.currentStatus).toBe("target-wasm");
    expect(CAD_INTEROP_MATRIX.find((r) => r.format === "IGES")?.currentStatus).toBe("target-wasm");
  });

  it("Shapr3D vs ToonStudio 8대 역량 갭 비교 매트릭스가 현재 구현과 향후 목표를 정직하게 분리한다", () => {
    expect(SHAPR3D_PARITY_GAP_MATRIX).toHaveLength(8);
    expect(SHAPR3D_PARITY_GAP_MATRIX.every((r) => r.verdict === "planned-gap")).toBe(true);
    for (const row of SHAPR3D_PARITY_GAP_MATRIX) {
      expect(row.toonStudioCurrentKo).toContain("현재 구현");
      expect(row.toonStudioTargetKo).toContain("향후 목표");
    }
  });

  it("exportCadTechnicalDrawingSvg가 4면 정투상·mm 치수선·A-A 단면 해칭·표제란 SVG를 생성한다", () => {
    const model = evaluateParametricFeatureTree({ presetId: "rofan-ornate-window-frame" });
    const svgKo = exportCadTechnicalDrawingSvg(model, "ko");
    expect(svgKo).toContain('data-schema="toonstudio.shapr3d-cad-drawing-svg.v1"');
    expect(svgKo).toContain('data-view="top"');
    expect(svgKo).toContain('data-view="isometric"');
    expect(svgKo).toContain('data-view="front"');
    expect(svgKo).toContain('data-view="right-section"');
    expect(svgKo).toContain('data-layer="section-hatching"');
    expect(svgKo).toContain("A-A");
    expect(svgKo).toContain("FIT TO SHEET");
  });

  it("도면은 검증되지 않은 메쉬나 1:1 출력을 주장하지 않는다", () => {
    const result = evaluateParametricFeatureTree({ presetId: "rofan-ornate-window-frame" });
    expect(result.integrity).toMatchObject({ watertight: null, nonManifoldEdges: null, floorGroundedY0: null });
    const svg = exportCadTechnicalDrawingSvg(result, "en");
    expect(svg).toContain("FIT TO SHEET");
    expect(svg).not.toContain("NON-MANIFOLD 0");
    expect(JSON.parse(exportShapr3dCadManifestJson(result))).toMatchObject({ geometryScope: "svg-preview" });
  });

  it("SVG 내보내기는 예제 CSS 색상 범위 밖의 면을 거부한다", () => {
    const result = evaluateParametricFeatureTree({ presetId: "rofan-ornate-window-frame" });
    const isoFaces = result.isoFaces.map((face) => ({ ...face, fillOklch: "unsupported-color" }));
    expect(() => exportCadTechnicalDrawingSvg({ ...result, isoFaces })).toThrow(RangeError);
  });

  it("exportCadTechnicalDrawingSvg 결과에 원시 hex/rgb/hsl과 바이올렛 휴(270~320°)가 0건이다", () => {
    const model = evaluateParametricFeatureTree({ presetId: "scifi-mecha-joint-housing" });
    assertZeroVioletAndRawColors(exportCadTechnicalDrawingSvg(model, "ko"));
    assertZeroVioletAndRawColors(exportCadTechnicalDrawingSvg(model, "en"));
  });

  it("exportShapr3dCadManifestJson이 유효 스키마와 수밀·구속·피처 트리 계약을 직렬화한다", () => {
    const model = evaluateParametricFeatureTree({ presetId: "handheld-stylus-dock" });
    const raw = exportShapr3dCadManifestJson(model);
    const parsed = JSON.parse(raw) as {
      schema: string;
      presetId: string;
      regenerationOk: boolean;
      sketch: { dofStatus: string; maxResidualMm: number };
      watertightBrepIntegrity: { nonManifoldEdges: null; metricScale: number; floorGroundedY0: null };
      interopFormats: Array<{ format: string }>;
      parityGapSummary: Array<{ id: string }>;
    };
    expect(parsed.schema).toBe("toonstudio.shapr3d-parametric-cad.v1");
    expect(parsed.presetId).toBe("handheld-stylus-dock");
    expect(parsed.regenerationOk).toBe(true);
    expect(parsed.sketch.dofStatus).toBe("fully-constrained");
    expect(parsed.sketch.maxResidualMm).toBeLessThan(1e-3);
    expect(parsed.watertightBrepIntegrity.nonManifoldEdges).toBeNull();
    expect(parsed.watertightBrepIntegrity.metricScale).toBe(1.0);
    expect(parsed.watertightBrepIntegrity.floorGroundedY0).toBeNull();
    expect(parsed.interopFormats).toHaveLength(5);
    expect(parsed.parityGapSummary).toHaveLength(8);
  });

  it("등각 3D 프리뷰가 단면 절단 위치 변경 시 즉시 투영 폴리곤과 해칭선을 갱신한다", () => {
    const a = evaluateParametricFeatureTree({ presetId: "webtoon-desk-lamp-arm", params: { sectionPlanePercent: 30 } });
    const b = evaluateParametricFeatureTree({ presetId: "webtoon-desk-lamp-arm", params: { sectionPlanePercent: 85 } });
    expect(a.isoFaces.length).toBeGreaterThanOrEqual(4);
    expect(a.isoHatchLines.length).toBeGreaterThan(0);
    expect(a.isoFaces[0].points).not.toEqual(b.isoFaces[0].points);
  });
});

describe("5. StudioShapr3dCadPanel UI 인터랙션 및 2단 시맨틱 SVG 검증", () => {
  it("기본 렌더링 시 5종 프리셋·DOF·메시 상태·2단 SVG를 표시한다", () => {
    render(<StudioShapr3dCadPanel />);
    expect(screen.getByTestId("shapr3d-cad-panel")).toBeTruthy();
    expect(screen.getByTestId("shapr3d-dof-badge").textContent).toContain("완전 구속");
    expect(screen.getByTestId("shapr3d-manifold-badge").textContent).toContain("메시 미생성");
    expect(screen.getByTestId("shapr3d-sketch-svg").getAttribute("data-preset-id")).toBe("webtoon-desk-lamp-arm");
    expect(screen.getByTestId("shapr3d-iso-svg").getAttribute("data-non-manifold-edges")).toBeNull();
  });

  it("프리셋 전환 시 2단 SVG와 치수가 갱신되고 onCadModelChange 콜백이 호출된다", () => {
    const onChange = vi.fn();
    render(<StudioShapr3dCadPanel onCadModelChange={onChange} />);
    fireEvent.click(screen.getByTestId("shapr3d-preset-rofan-ornate-window-frame"));
    expect(screen.getByTestId("shapr3d-sketch-svg").getAttribute("data-preset-id")).toBe("rofan-ornate-window-frame");
    expect(screen.getByTestId("shapr3d-iso-svg").getAttribute("data-preset-id")).toBe("rofan-ornate-window-frame");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]?.preset.id).toBe("rofan-ornate-window-frame");
  });

  it("필렛 슬라이더를 벽 두께*0.48 이상으로 올리면 Fail-Closed 경고 배너가 표시된다", () => {
    render(<StudioShapr3dCadPanel />);
    expect(screen.queryByTestId("shapr3d-fail-closed-alert")).toBeNull();
    fireEvent.change(screen.getByTestId("shapr3d-slider-fillet"), { target: { value: "6.0" } });
    expect(screen.getByTestId("shapr3d-fail-closed-alert").textContent).toContain("Fail-Closed");
    expect(screen.getByTestId("shapr3d-iso-svg").getAttribute("data-regeneration-ok")).toBe("false");
  });

  it("돌출·단면 슬라이더와 단면 축 버튼 조작이 실시간으로 프리뷰와 지표를 갱신한다", () => {
    render(<StudioShapr3dCadPanel />);
    const beforeVol = screen.getByTestId("shapr3d-metric-volume").textContent;
    fireEvent.change(screen.getByTestId("shapr3d-slider-extrude"), { target: { value: "120" } });
    expect(screen.getByTestId("shapr3d-readout-extrude").textContent).toBe("120mm");
    expect(screen.getByTestId("shapr3d-metric-volume").textContent).not.toBe(beforeVol);
    fireEvent.change(screen.getByTestId("shapr3d-slider-section"), { target: { value: "75" } });
    expect(screen.getByTestId("shapr3d-iso-svg").getAttribute("data-section-percent")).toBe("75");
    fireEvent.click(screen.getByTestId("shapr3d-axis-Z"));
    expect(screen.getByTestId("shapr3d-axis-Z").getAttribute("aria-pressed")).toBe("true");
  });

  it("구속조건 토글로 완전 구속→부족 구속→과잉 구속 전환을 실시간 검증한다", () => {
    render(<StudioShapr3dCadPanel />);
    fireEvent.click(screen.getByTestId("shapr3d-constraint-c-height-mm"));
    expect(screen.getByTestId("shapr3d-sketch-svg").getAttribute("data-dof-status")).toBe("under-constrained");
    fireEvent.click(screen.getByTestId("shapr3d-constraint-c-height-mm"));
    expect(screen.getByTestId("shapr3d-sketch-svg").getAttribute("data-dof-status")).toBe("fully-constrained");
    fireEvent.click(screen.getByTestId("shapr3d-constraint-c-over-diag"));
    expect(screen.getByTestId("shapr3d-sketch-svg").getAttribute("data-dof-status")).toBe("over-constrained");
    expect(screen.getByTestId("shapr3d-fail-closed-alert")).toBeTruthy();
  });

  it("히스토리 피처 트리 노드 토글로 쉘 억제 및 재생성 해시 갱신이 동작한다", () => {
    render(<StudioShapr3dCadPanel />);
    const beforeHash = screen.getByTestId("shapr3d-regen-hash").textContent;
    fireEvent.click(screen.getByTestId("shapr3d-feature-shell"));
    expect(screen.getByTestId("shapr3d-feature-shell").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("shapr3d-regen-hash").textContent).not.toBe(beforeHash);
  });

  it("뷰 모드 전환(단면 절단·2D 기술 도면·Shapr3D 갭 비교)이 각 전용 뷰를 표시한다", () => {
    render(<StudioShapr3dCadPanel />);
    fireEvent.click(screen.getByTestId("shapr3d-view-section-cut"));
    expect(screen.getByTestId("shapr3d-sketch-section-line")).toBeTruthy();
    expect(screen.getByTestId("shapr3d-iso-svg").getAttribute("data-section-active")).toBe("true");

    fireEvent.click(screen.getByTestId("shapr3d-view-technical-drawing"));
    expect(screen.getByTestId("shapr3d-drawing-svg")).toBeTruthy();

    fireEvent.click(screen.getByTestId("shapr3d-view-parity-gap"));
    expect(screen.getByTestId("shapr3d-parity-gap-view")).toBeTruthy();
    expect(screen.getByTestId("shapr3d-interop-matrix").textContent).toContain("STEP");
    expect(screen.getByTestId("shapr3d-interop-matrix").textContent).toContain("GLB");
  });

  it("2D 도면 SVG·JSON 복사/미리보기·초기화 및 영문 로케일 props가 정상 동작한다", () => {
    const onExportSvg = vi.fn();
    render(<StudioShapr3dCadPanel onExportSvg={onExportSvg} />);

    fireEvent.click(screen.getByTestId("shapr3d-export-svg-btn"));
    expect(onExportSvg).toHaveBeenCalledTimes(1);
    expect(onExportSvg.mock.calls[0]?.[0]).toContain("toonstudio.shapr3d-cad-drawing-svg.v1");
    expect(screen.getByTestId("shapr3d-svg-preview").textContent).toContain("<svg");

    fireEvent.click(screen.getByTestId("shapr3d-export-json-btn"));
    expect(screen.getByTestId("shapr3d-json-preview").textContent).toContain("toonstudio.shapr3d-parametric-cad.v1");

    fireEvent.click(screen.getByTestId("shapr3d-preset-handheld-stylus-dock"));
    fireEvent.click(screen.getByTestId("shapr3d-reset-btn"));
    expect(screen.getByTestId("shapr3d-sketch-svg").getAttribute("data-preset-id")).toBe("webtoon-desk-lamp-arm");

    cleanup();
    render(
      <StudioShapr3dCadPanel
        locale="en"
        initialPresetId="cafe-espresso-machine"
        initialViewMode="technical-drawing"
      />,
    );
    expect(screen.getByTestId("shapr3d-cad-panel").getAttribute("aria-label")).toContain("Parametric Sketch and Drawing Example");
    expect(screen.getByTestId("shapr3d-drawing-svg").getAttribute("data-preset-id")).toBe("cafe-espresso-machine");
  });
});

describe("6. 엄격 품질·하네스 계약 및 Calm Atelier 자가 검증", () => {
  it("소유 파일 5종 존재, 줄 수 상한(engine<=750, panel<=680, all<=800) 및 금지 패턴 0건을 준수한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const required = [
      "shapr3d-cad-engine.ts",
      "cad-preview-input.ts",
      "StudioShapr3dCadPanel.tsx",
      "index.ts",
      "shapr3d-cad.test.tsx",
    ];
    for (const file of required) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allFiles.sort()).toEqual([...required].sort());

    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const lines = src.split(/\r?\n/).length;
      expect(lines).toBeLessThanOrEqual(800);
      if (file === "shapr3d-cad-engine.ts") expect(lines).toBeLessThanOrEqual(750);
      if (file === "StudioShapr3dCadPanel.tsx") expect(lines).toBeLessThanOrEqual(680);

      if (file !== "shapr3d-cad.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
        expect(src).not.toContain("가능하게 합니다");
        expect(src).not.toContain("직관적인 경험을 제공");
        expect(src).not.toContain("원활한 워크플로우를 보장");
      }

      if (file === "StudioShapr3dCadPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
        expect(src).toContain("motion-reduce:transition-none");
      }
    }
  });

  it("모든 버튼이 min-h-11을 유지하고 모든 뷰 모드의 SVG에 원시 색·바이올렛 휴가 0건이다", () => {
    const { container } = render(<StudioShapr3dCadPanel />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(24);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }

    for (const mode of ["isometric-3d", "section-cut", "technical-drawing"] as const) {
      fireEvent.click(screen.getByTestId(`shapr3d-view-${mode}`));
      const svgs = container.querySelectorAll("svg");
      expect(svgs.length).toBeGreaterThanOrEqual(2);
      for (const svg of svgs) {
        assertZeroVioletAndRawColors(svg.outerHTML);
      }
    }
  });
});
