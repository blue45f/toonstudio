// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ATELIER_SOLID_PRESETS,
  SOLID_FEATURE_META,
  SOLID_FEATURE_ORDER,
  StepAp214ExportUnavailableError,
  StudioAtelierSolidCadProPanel,
  buildWatertightSolidMesh,
  createDefaultAtelierSolidParams,
  evaluateAtelierSolidModel,
  exportBinaryStlBuffer,
  exportEngineeringDrawingSvgSpec,
  exportStepAp214Ascii,
  exportWebtoonLtLineartPayload,
  formatOklch,
  getAtelierSolidPreset,
  isVioletSlopHue,
  sanitizeNonVioletHue,
  verifyManifoldHalfEdgeTopology,
  type AtelierSolidPresetId,
  type WatertightSolidMesh,
} from "./index";

afterEach(cleanup);

function assertCleanOklchNoViolet(markup: string): void {
  expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
  expect(markup).not.toMatch(/\brgba?\s*\(/iu);
  expect(markup).not.toMatch(/\bhsla?\s*\(/iu);
  for (const m of markup.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+(\d+(?:\.\d+)?)/gu)) {
    expect(isVioletSlopHue(Number(m[1]))).toBe(false);
  }
}

describe("1. 5종 실전 웹툰·제품 CAD 프리셋, 10종 피처 및 탈-바이올렛 OKLCH 규율", () => {
  it("필수 5종 AtelierSolid 프리셋 ID와 한/영 메타데이터를 모두 제공한다", () => {
    expect(ATELIER_SOLID_PRESETS).toHaveLength(5);
    expect(ATELIER_SOLID_PRESETS.map((p) => p.id)).toEqual([
      "rofan-arch-balcony",
      "scifi-mech-actuator",
      "cafe-glass-showcase",
      "precision-stylus-stand",
      "handcrafted-tea-vessel",
    ]);
    for (const p of ATELIER_SOLID_PRESETS) {
      expect(p.nameKo.length).toBeGreaterThan(4);
      expect(p.nameEn.length).toBeGreaterThan(4);
      expect(p.baseWidthMm).toBeGreaterThan(0);
      expect(p.baseHeightMm).toBeGreaterThan(0);
    }
  });

  it("getAtelierSolidPreset과 createDefaultAtelierSolidParams가 미등록 ID에도 안전 폴백한다", () => {
    expect(getAtelierSolidPreset("scifi-mech-actuator").nameKo).toContain("액추에이터");
    expect(getAtelierSolidPreset("handcrafted-tea-vessel").nameEn).toContain("Tea Vessel");
    expect(getAtelierSolidPreset("unknown-id" as AtelierSolidPresetId).id).toBe("rofan-arch-balcony");
    const def = createDefaultAtelierSolidParams("cafe-glass-showcase");
    expect(def.presetId).toBe("cafe-glass-showcase");
    expect(def.wallThicknessMm).toBeGreaterThan(0);
  });

  it("10종 필수 B-Rep 피처 연산 메타데이터와 순서가 정확히 등록돼 있다", () => {
    expect(SOLID_FEATURE_ORDER).toEqual([
      "direct-push-pull", "revolve", "loft", "sweep", "shell",
      "fillet", "chamfer", "draft-angle", "linear-circular-pattern", "assembly-mate",
    ]);
    for (const k of SOLID_FEATURE_ORDER) {
      expect(SOLID_FEATURE_META[k].ko.length).toBeGreaterThan(1);
      expect(SOLID_FEATURE_META[k].en.length).toBeGreaterThan(1);
    }
  });

  it("isVioletSlopHue와 sanitizeNonVioletHue가 270~320° 바이올렛 휴를 완전 배제한다", () => {
    expect(isVioletSlopHue(270)).toBe(true);
    expect(isVioletSlopHue(295)).toBe(true);
    expect(isVioletSlopHue(320)).toBe(true);
    expect(isVioletSlopHue(230)).toBe(false);
    expect(isVioletSlopHue(45)).toBe(false);
    for (let h = 270; h <= 320; h += 5) expect(isVioletSlopHue(sanitizeNonVioletHue(h))).toBe(false);
  });

  it("formatOklch가 원시 색 리터럴 없이 탈-바이올렛 OKLCH 문자열을 반환한다", () => {
    expect(formatOklch({ l: 0.56, c: 0.13, h: 48 })).toBe("oklch(0.56 0.13 48)");
    const clean = formatOklch({ l: 0.52, c: 0.14, h: 292 }, 0.72);
    expect(clean).toBe("oklch(0.52 0.14 228 / 0.72)");
    assertCleanOklchNoViolet(clean);
  });

  it("5종 프리셋 accentOklch와 투영 면 색상 전원이 바이올렛 휴 0%·원시 색 0건이다", () => {
    for (const p of ATELIER_SOLID_PRESETS) {
      expect(isVioletSlopHue(p.accentOklch.h)).toBe(false);
      const lt = exportWebtoonLtLineartPayload(evaluateAtelierSolidModel({ presetId: p.id }));
      for (const f of lt.shadedFaces) assertCleanOklchNoViolet(f.fillOklch);
    }
  });
});

describe("2. 실측 Half-Edge 매니폴드 수밀성 증명 (5종 프리셋 전원 + 결함 메쉬 탐지)", () => {
  it("rofan-arch-balcony가 Half-Edge 수밀·비매니폴드 0·바닥 접지 Y=0을 실측 증명한다", () => {
    const ev = evaluateAtelierSolidModel({ presetId: "rofan-arch-balcony" });
    expect(ev.topology.watertight).toBe(true);
    expect(ev.topology.nonManifoldEdges).toBe(0);
    expect(ev.topology.boundaryEdges).toBe(0);
    expect(ev.topology.looseVertices).toBe(0);
    expect(ev.topology.degenerateFaces).toBe(0);
    expect(ev.topology.floorGroundedY0).toBe(true);
    expect(ev.topology.minYMeters).toBe(0);
    expect(ev.topology.signedVolumeCm3).toBeGreaterThan(500);
    expect(ev.topology.eulerCharacteristic).toBe(2 * (ev.topology.componentCount - ev.topology.genus));
  });

  it("scifi-mech-actuator 관통 보어가 Genus-1 실측 오일러 지표와 수밀성을 증명한다", () => {
    const ev = evaluateAtelierSolidModel({ presetId: "scifi-mech-actuator" });
    expect(ev.topology.watertight).toBe(true);
    expect(ev.topology.nonManifoldEdges).toBe(0);
    expect(ev.topology.boundaryEdges).toBe(0);
    expect(ev.topology.looseVertices).toBe(0);
    expect(ev.topology.degenerateFaces).toBe(0);
    expect(ev.topology.floorGroundedY0).toBe(true);
    expect(ev.topology.genus).toBe(1);
    expect(ev.topology.eulerCharacteristic).toBe(2 * (ev.topology.componentCount - 1));
  });

  it("cafe-glass-showcase 중공 진열 쉘이 수밀·비매니폴드 0·바닥 접지 Y=0을 증명한다", () => {
    const ev = evaluateAtelierSolidModel({ presetId: "cafe-glass-showcase" });
    expect(ev.topology.watertight).toBe(true);
    expect(ev.topology.nonManifoldEdges).toBe(0);
    expect(ev.topology.boundaryEdges).toBe(0);
    expect(ev.topology.looseVertices).toBe(0);
    expect(ev.topology.degenerateFaces).toBe(0);
    expect(ev.topology.floorGroundedY0).toBe(true);
    expect(ev.topology.signedVolumeCm3).toBeGreaterThan(1000);
  });

  it("precision-stylus-stand 로프트가 수밀·비매니폴드 0·오일러 지표 정확성을 증명한다", () => {
    const ev = evaluateAtelierSolidModel({ presetId: "precision-stylus-stand" });
    expect(ev.topology.watertight).toBe(true);
    expect(ev.topology.nonManifoldEdges).toBe(0);
    expect(ev.topology.looseVertices).toBe(0);
    expect(ev.topology.degenerateFaces).toBe(0);
    expect(ev.topology.floorGroundedY0).toBe(true);
    expect(ev.topology.eulerCharacteristic).toBe(2 * ev.topology.componentCount);
  });

  it("handcrafted-tea-vessel 360° 도자기 회전체가 수밀·비매니폴드 0·바닥 접지 Y=0을 증명한다", () => {
    const ev = evaluateAtelierSolidModel({ presetId: "handcrafted-tea-vessel" });
    expect(ev.topology.watertight).toBe(true);
    expect(ev.topology.nonManifoldEdges).toBe(0);
    expect(ev.topology.boundaryEdges).toBe(0);
    expect(ev.topology.looseVertices).toBe(0);
    expect(ev.topology.degenerateFaces).toBe(0);
    expect(ev.topology.floorGroundedY0).toBe(true);
    expect(ev.topology.signedVolumeCm3).toBeGreaterThan(100);
  });

  it("buildWatertightSolidMesh가 실제 Float32Array/Uint32Array/단위법선/UV와 non-null 지표를 생성한다", () => {
    const mesh = buildWatertightSolidMesh({ presetId: "precision-stylus-stand" });
    expect(mesh.positions).toBeInstanceOf(Float32Array);
    expect(mesh.indices).toBeInstanceOf(Uint32Array);
    expect(mesh.faceNormals).toBeInstanceOf(Float32Array);
    expect(mesh.uvs).toBeInstanceOf(Float32Array);
    expect(mesh.positions.length).toBe(mesh.vertexCount * 3);
    expect(mesh.indices.length).toBe(mesh.triangleCount * 3);
    expect(mesh.uvs.length).toBe(mesh.vertexCount * 2);
    for (let t = 0; t < Math.min(20, mesh.triangleCount); t += 1) {
      const len = Math.hypot(mesh.faceNormals[t * 3], mesh.faceNormals[t * 3 + 1], mesh.faceNormals[t * 3 + 2]);
      expect(len).toBeCloseTo(1, 3);
    }
    const report = verifyManifoldHalfEdgeTopology(mesh);
    expect(Object.values(report).every((v) => v !== null && v !== undefined)).toBe(true);
  });

  it("결함 탐지: 삼각형 1개 제거(열린 구멍) 시 boundaryEdges=3 및 watertight=false를 실측 포착한다", () => {
    const base = buildWatertightSolidMesh({ presetId: "precision-stylus-stand" });
    const broken: WatertightSolidMesh = {
      ...base,
      indices: base.indices.slice(0, base.indices.length - 3),
      triangleCount: base.triangleCount - 1,
    };
    const rep = verifyManifoldHalfEdgeTopology(broken);
    expect(rep.watertight).toBe(false);
    expect(rep.boundaryEdges).toBe(3);
  });

  it("결함 탐지: 고립 정점(loose vertex) 추가 시 looseVertices=1 및 watertight=false를 실측 포착한다", () => {
    const base = buildWatertightSolidMesh({ presetId: "precision-stylus-stand" });
    const extPos = new Float32Array(base.positions.length + 3);
    extPos.set(base.positions);
    extPos[base.positions.length] = 0.5;
    extPos[base.positions.length + 1] = 0.5;
    extPos[base.positions.length + 2] = 0.5;
    const rep = verifyManifoldHalfEdgeTopology({ ...base, positions: extPos, vertexCount: base.vertexCount + 1 });
    expect(rep.watertight).toBe(false);
    expect(rep.looseVertices).toBe(1);
  });

  it("결함 탐지: 삼각형 와인딩 반전 시 nonManifoldEdges>=3 및 watertight=false를 실측 포착한다", () => {
    const base = buildWatertightSolidMesh({ presetId: "precision-stylus-stand" });
    const flipped = new Uint32Array(base.indices);
    const tmp = flipped[1];
    flipped[1] = flipped[2];
    flipped[2] = tmp;
    const rep = verifyManifoldHalfEdgeTopology({ ...base, indices: flipped });
    expect(rep.watertight).toBe(false);
    expect(rep.nonManifoldEdges).toBeGreaterThanOrEqual(3);
  });

  it("결함 탐지: 영면적 퇴화 삼각형 추가 시 degenerateFaces>=1 및 watertight=false를 실측 포착한다", () => {
    const base = buildWatertightSolidMesh({ presetId: "precision-stylus-stand" });
    const extIdx = new Uint32Array(base.indices.length + 3);
    extIdx.set(base.indices);
    extIdx[base.indices.length] = 0;
    extIdx[base.indices.length + 1] = 0;
    extIdx[base.indices.length + 2] = 1;
    const rep = verifyManifoldHalfEdgeTopology({ ...base, indices: extIdx, triangleCount: base.triangleCount + 1 });
    expect(rep.watertight).toBe(false);
    expect(rep.degenerateFaces).toBeGreaterThanOrEqual(1);
  });
});

describe("3. 10종 B-Rep 피처 연산, Fail-Closed 자기교차 가드 및 어셈블리 간섭 검사", () => {
  it("direct-push-pull 밀기/당기기가 높이와 실측 체적을 단조 증가시키며 수밀성을 유지한다", () => {
    const low = evaluateAtelierSolidModel({ presetId: "precision-stylus-stand", pushPullMm: -20 });
    const high = evaluateAtelierSolidModel({ presetId: "precision-stylus-stand", pushPullMm: 80 });
    expect(high.dimensionsMm.height).toBeGreaterThan(low.dimensionsMm.height + 80);
    expect(high.topology.signedVolumeCm3).toBeGreaterThan(low.topology.signedVolumeCm3 * 1.4);
    expect(low.topology.watertight).toBe(true);
    expect(high.topology.watertight).toBe(true);
  });

  it("revolve 부분 회전(180°·270°)도 100% 수밀 매니폴드와 바닥 접지를 유지한다", () => {
    const half = evaluateAtelierSolidModel({ presetId: "handcrafted-tea-vessel", revolveAngleDeg: 180 });
    const threeQuarter = evaluateAtelierSolidModel({ presetId: "handcrafted-tea-vessel", revolveAngleDeg: 270 });
    expect(half.topology.watertight).toBe(true);
    expect(half.topology.nonManifoldEdges).toBe(0);
    expect(half.topology.floorGroundedY0).toBe(true);
    expect(threeQuarter.topology.watertight).toBe(true);
    expect(threeQuarter.topology.signedVolumeCm3).toBeGreaterThan(half.topology.signedVolumeCm3);
  });

  it("loft 상단 배율 변경이 체적과 표면적을 갱신하며 수밀성을 유지한다", () => {
    const narrow = evaluateAtelierSolidModel({ presetId: "precision-stylus-stand", loftScaleRatio: 0.6 });
    const wide = evaluateAtelierSolidModel({ presetId: "precision-stylus-stand", loftScaleRatio: 1.2 });
    expect(wide.topology.signedVolumeCm3).toBeGreaterThan(narrow.topology.signedVolumeCm3);
    expect(narrow.topology.watertight).toBe(true);
    expect(wide.topology.watertight).toBe(true);
  });

  it("sweep 아치 스팬 변경이 폭을 확장하고 수밀성을 유지한다", () => {
    const compact = evaluateAtelierSolidModel({ presetId: "rofan-arch-balcony", sweepSpanMm: 300, patternMode: "none", patternCount: 1 });
    const grand = evaluateAtelierSolidModel({ presetId: "rofan-arch-balcony", sweepSpanMm: 560, patternMode: "none", patternCount: 1 });
    expect(grand.dimensionsMm.width).toBeGreaterThan(compact.dimensionsMm.width + 150);
    expect(compact.topology.watertight).toBe(true);
    expect(grand.topology.watertight).toBe(true);
  });

  it("shell 중공 쉘 활성 시 충실 솔리드 대비 체적이 감소하고 수밀성을 유지한다", () => {
    const hollow = evaluateAtelierSolidModel({ presetId: "cafe-glass-showcase", suppressedFeatures: ["revolve", "sweep"] });
    const solid = evaluateAtelierSolidModel({ presetId: "cafe-glass-showcase", suppressedFeatures: ["revolve", "sweep", "shell"] });
    expect(hollow.topology.signedVolumeCm3).toBeLessThan(solid.topology.signedVolumeCm3);
    expect(hollow.topology.watertight).toBe(true);
    expect(solid.topology.watertight).toBe(true);
  });

  it("fillet 과대 반경(R25mm) 투입 시 Fail-Closed 가드가 자기교차를 차단하고 수밀성을 보존한다", () => {
    const ev = evaluateAtelierSolidModel({ presetId: "handcrafted-tea-vessel", filletRadiusMm: 25 });
    const filletEntry = ev.features.find((f) => f.kind === "fillet");
    expect(filletEntry?.status).toBe("failed-guard");
    expect(filletEntry?.guardReasonKo).toContain("Fail-Closed");
    expect(ev.guardViolations.length).toBeGreaterThanOrEqual(1);
    expect(ev.topology.watertight).toBe(true);
    expect(ev.topology.nonManifoldEdges).toBe(0);
  });

  it("chamfer 과대 모따기(C26mm)와 draft-angle 과대 구배(18°)에서 Fail-Closed 가드가 작동한다", () => {
    const ev = evaluateAtelierSolidModel({ presetId: "precision-stylus-stand", chamferSizeMm: 26, draftAngleDeg: 18 });
    expect(ev.features.find((f) => f.kind === "chamfer")?.status).toBe("failed-guard");
    expect(ev.features.find((f) => f.kind === "draft-angle")?.status).toBe("failed-guard");
    expect(ev.guardViolations.length).toBeGreaterThanOrEqual(2);
    expect(ev.topology.watertight).toBe(true);
  });

  it("shell 과대 벽두께 투입 시 Fail-Closed 쉘 가드가 발동하고 수밀성을 보존한다", () => {
    const ev = evaluateAtelierSolidModel({ presetId: "handcrafted-tea-vessel", wallThicknessMm: 44 });
    expect(ev.features.find((f) => f.kind === "shell")?.status).toBe("failed-guard");
    expect(ev.topology.watertight).toBe(true);
    expect(ev.topology.nonManifoldEdges).toBe(0);
  });

  it("linear-circular-pattern 선형(×3) 및 원형(×3) 배열이 컴포넌트·체적을 확장하며 전수 수밀이다", () => {
    const single = evaluateAtelierSolidModel({ presetId: "precision-stylus-stand", patternMode: "none", patternCount: 1 });
    const linear = evaluateAtelierSolidModel({ presetId: "precision-stylus-stand", patternMode: "linear", patternCount: 3 });
    const circular = evaluateAtelierSolidModel({ presetId: "precision-stylus-stand", patternMode: "circular", patternCount: 3 });
    expect(linear.topology.componentCount).toBe(single.topology.componentCount + 2);
    expect(circular.topology.componentCount).toBe(single.topology.componentCount + 2);
    expect(linear.topology.watertight).toBe(true);
    expect(circular.topology.watertight).toBe(true);
    expect(circular.topology.nonManifoldEdges).toBe(0);
  });

  it("assembly-mate 3종(concentric·coincident·distance) 양수 오프셋이 간섭 없음·여유 mm를 보고한다", () => {
    for (const mode of ["concentric", "coincident", "distance"] as const) {
      const ev = evaluateAtelierSolidModel({ presetId: "scifi-mech-actuator", mateMode: mode, mateOffsetMm: 4.5 });
      expect(ev.assembly.mateMode).toBe(mode);
      expect(ev.assembly.hasInterference).toBe(false);
      expect(ev.assembly.interferenceMm).toBe(0);
      expect(ev.assembly.clearanceMm).toBe(4.5);
      expect(ev.topology.watertight).toBe(true);
    }
  });

  it("assembly-mate 음수 오프셋(-5.5mm) 투입 시 간섭 충돌 깊이(5.5mm)를 정확히 감지한다", () => {
    const clash = evaluateAtelierSolidModel({ presetId: "scifi-mech-actuator", mateMode: "concentric", mateOffsetMm: -5.5 });
    expect(clash.assembly.hasInterference).toBe(true);
    expect(clash.assembly.interferenceMm).toBe(5.5);
    expect(clash.assembly.clearanceMm).toBe(0);
    expect(clash.topology.watertight).toBe(true);
  });
});

describe("4. KilnExport 표준 익스포터 (Binary STL · STEP AP214 · GD&T 3면도)", () => {
  it("exportBinaryStlBuffer가 5종 프리셋 전원 정확한 바이트 길이(84 + 50 × triCount)를 생성한다", () => {
    for (const p of ATELIER_SOLID_PRESETS) {
      const ev = evaluateAtelierSolidModel({ presetId: p.id });
      const stl = exportBinaryStlBuffer(ev.mesh, p.id);
      expect(stl).toBeInstanceOf(Uint8Array);
      expect(stl.byteLength).toBe(84 + 50 * ev.mesh.triangleCount);
    }
  });

  it("Binary STL 헤더·uint32 삼각형 수·float32 mm 레코드가 스펙과 정확히 일치한다", () => {
    const ev = evaluateAtelierSolidModel({ presetId: "precision-stylus-stand" });
    const stl = exportBinaryStlBuffer(ev.mesh, "stylus-check");
    const hdr = new TextDecoder("utf-8").decode(stl.subarray(0, 80));
    expect(hdr.startsWith("solid ")).toBe(false);
    expect(hdr).toContain("AtelierSolid KilnExport Binary STL");
    const view = new DataView(stl.buffer, stl.byteOffset, stl.byteLength);
    expect(view.getUint32(80, true)).toBe(ev.mesh.triangleCount);
    const nx = view.getFloat32(84, true);
    const ny = view.getFloat32(88, true);
    const nz = view.getFloat32(92, true);
    expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 3);
    expect(view.getUint16(84 + 48, true)).toBe(0);
  });

  it("exportStepAp214Ascii는 AP214 재가져오기 검증 전 식별 가능한 미지원 오류로 차단한다", () => {
    const evaluation = evaluateAtelierSolidModel({ presetId: "scifi-mech-actuator" });
    expect(() => exportStepAp214Ascii(evaluation)).toThrow(StepAp214ExportUnavailableError);
    expect(() => exportStepAp214Ascii(evaluation)).toThrow("STEP_AP214_UNVERIFIED");
  });

  it("STEP 미지원 오류는 생성하지 않은 파일과 프리셋 식별자를 구분한다", () => {
    const error = new StepAp214ExportUnavailableError("cafe-glass-showcase");
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ code: "STEP_AP214_UNVERIFIED", exportPerformed: false, presetId: "cafe-glass-showcase" });
  });

  it("exportEngineeringDrawingSvgSpec가 정투상 3면도+등각투영 4뷰와 GD&T ±0.05mm 콜아웃을 계산한다", () => {
    const drw = exportEngineeringDrawingSvgSpec(evaluateAtelierSolidModel({ presetId: "rofan-arch-balcony" }));
    expect(drw.schema).toBe("toonstudio.atelier-solid-drawing.v1");
    expect(drw.views.map((v) => v.id)).toEqual(["front", "top", "right", "isometric"]);
    for (const v of drw.views) expect(v.lines.length).toBeGreaterThan(8);
    expect(drw.gdtCallouts.some((c) => c.toleranceMm === 0.05 && c.datum === "A")).toBe(true);
    expect(drw.gdtCallouts.some((c) => c.id === "gdt-flat" && c.toleranceMm === 0.03)).toBe(true);
  });

  it("GD&T 도면 SVG 마크업이 유효한 SVG이며 원시 색·바이올렛 휴 0건이다", () => {
    const drw = exportEngineeringDrawingSvgSpec(evaluateAtelierSolidModel({ presetId: "handcrafted-tea-vessel" }));
    expect(drw.svgMarkup.startsWith("<svg")).toBe(true);
    expect(drw.svgMarkup.endsWith("</svg>")).toBe(true);
    assertCleanOklchNoViolet(drw.svgMarkup);
  });

  it("regenHash가 동일 입력에 결정적이며 파라미터 변경 시 즉시 갱신된다", () => {
    const a1 = evaluateAtelierSolidModel({ presetId: "precision-stylus-stand", pushPullMm: 10 });
    const a2 = evaluateAtelierSolidModel({ presetId: "precision-stylus-stand", pushPullMm: 10 });
    const b = evaluateAtelierSolidModel({ presetId: "precision-stylus-stand", pushPullMm: 36 });
    expect(a1.regenHash).toBe(a2.regenHash);
    expect(a1.regenHash).not.toBe(b.regenHash);
  });
});

describe("5. AtelierStage 독점 1-클릭 웹툰 3D→2D LT 선화·원근선 브리지", () => {
  it("5종 프리셋 전원 실루엣·주름각 선화·톤 폴리곤을 추출하고 수밀 확인 플래그를 기록한다", () => {
    for (const p of ATELIER_SOLID_PRESETS) {
      const lt = exportWebtoonLtLineartPayload(evaluateAtelierSolidModel({ presetId: p.id }));
      expect(lt.schema).toBe("toonstudio.atelier-solid-lt-lineart.v1");
      expect(lt.bridgeTarget).toBe("AtelierStage-2D-LT");
      expect(lt.summary.silhouetteCount).toBeGreaterThan(10);
      expect(lt.summary.creaseCount).toBeGreaterThan(5);
      expect(lt.summary.tonePolygonCount).toBeGreaterThan(20);
      expect(lt.summary.watertightVerified).toBe(true);
    }
  });

  it("주름각 임계(15° vs 60°) 상승 시 주름 선이 단조 감소하며 모든 선이 임계각 이상이다", () => {
    const ev = evaluateAtelierSolidModel({ presetId: "cafe-glass-showcase" });
    const loose = exportWebtoonLtLineartPayload(ev, { creaseAngleDeg: 15 });
    const strict = exportWebtoonLtLineartPayload(ev, { creaseAngleDeg: 60 });
    expect(loose.summary.creaseCount).toBeGreaterThanOrEqual(strict.summary.creaseCount);
    for (const e of strict.creaseEdges) expect(e.dihedralDeg ?? 0).toBeGreaterThanOrEqual(59.9);
  });

  it("2점 투시(X, Z 소실점 2개) vs 3점 투시(X, Z, Y 소실점 3개)와 가이드 선분을 생성한다", () => {
    const ev = evaluateAtelierSolidModel({ presetId: "rofan-arch-balcony" });
    const p2 = exportWebtoonLtLineartPayload(ev, { perspectiveMode: "2-point" });
    const p3 = exportWebtoonLtLineartPayload(ev, { perspectiveMode: "3-point" });
    expect(p2.vanishingPoints.map((v) => v.axis)).toEqual(["X", "Z"]);
    expect(p3.vanishingPoints.map((v) => v.axis)).toEqual(["X", "Z", "Y"]);
    expect(p3.perspectiveGuides.length).toBeGreaterThan(p2.perspectiveGuides.length);
  });

  it("단면 절단(sectionCutActive=true) 시 절단면 너머 톤 폴리곤이 실제 클리핑된다", () => {
    const ev = evaluateAtelierSolidModel({ presetId: "cafe-glass-showcase" });
    const full = exportWebtoonLtLineartPayload(ev, { sectionCutActive: false });
    const cut = exportWebtoonLtLineartPayload(ev, { sectionCutActive: true, sectionCutPercent: 45 });
    expect(cut.summary.tonePolygonCount).toBeLessThan(full.summary.tonePolygonCount);
    expect(cut.summary.tonePolygonCount).toBeGreaterThan(0);
  });

  it("웹툰 LT 선화 페이로드의 모든 톤 폴리곤이 OKLCH 탈-바이올렛을 준수한다", () => {
    const lt = exportWebtoonLtLineartPayload(evaluateAtelierSolidModel({ presetId: "scifi-mech-actuator" }));
    for (const face of lt.shadedFaces) assertCleanOklchNoViolet(face.fillOklch);
  });
});

describe("6. StudioAtelierSolidCadProPanel UI 인터랙션 및 접근성 검증", () => {
  it("무인자 단독 렌더링 시 실측 수밀 배지·바닥 접지·오일러 지표·3D 뷰포트를 표시한다", () => {
    render(<StudioAtelierSolidCadProPanel />);
    expect(screen.getByTestId("atelier-solid-cad-pro-panel")).toBeTruthy();
    expect(screen.getByTestId("atelier-solid-watertight-badge").textContent).toContain("nonManifold=0");
    expect(screen.getByTestId("atelier-solid-floor-badge").textContent).toContain("Y0=true");
    expect(screen.getByTestId("atelier-solid-euler-readout").textContent).toContain("cm³");
    expect(screen.getByTestId("atelier-solid-viewport-svg").getAttribute("data-watertight")).toBe("true");
  });

  it("5종 프리셋 전환과 영문 로케일·초기 도면 뷰 props가 정확히 동작한다", () => {
    render(<StudioAtelierSolidCadProPanel />);
    for (const p of ATELIER_SOLID_PRESETS) {
      fireEvent.click(screen.getByTestId(`atelier-solid-preset-${p.id}`));
      expect(screen.getByTestId("atelier-solid-viewport-svg").getAttribute("data-preset-id")).toBe(p.id);
    }
    cleanup();
    render(<StudioAtelierSolidCadProPanel locale="en" initialPresetId="handcrafted-tea-vessel" initialViewMode="drawing" />);
    expect(screen.getByTestId("atelier-solid-cad-pro-panel").getAttribute("aria-label")).toContain("AtelierSolid Pro");
    expect(screen.getByTestId("atelier-solid-drawing-svg").getAttribute("data-preset-id")).toBe("handcrafted-tea-vessel");
  });

  it("슬라이더 조작으로 Fail-Closed 필렛 가드 경고와 어셈블리 간섭 충돌 경고를 실시간 표시한다", () => {
    const onSolidChange = vi.fn();
    render(<StudioAtelierSolidCadProPanel initialPresetId="handcrafted-tea-vessel" onSolidChange={onSolidChange} />);
    fireEvent.change(screen.getByTestId("atelier-solid-slider-filletRadiusMm"), { target: { value: "26" } });
    expect(screen.getByTestId("atelier-solid-guard-banner").textContent).toContain("Fail-Closed");
    expect(screen.getByTestId("atelier-solid-watertight-badge").textContent).toContain("nonManifold=0");

    fireEvent.change(screen.getByTestId("atelier-solid-slider-mateOffsetMm"), { target: { value: "-6" } });
    expect(screen.getByTestId("atelier-solid-assembly-badge").textContent).toContain("간섭 충돌 6mm");
    expect(onSolidChange).toHaveBeenCalled();
  });

  it("뷰 모드 전환(정면·측면·평면·웹툰 LT·GD&T 3면도), 오비트 회전, 단면 절단 및 3점 투시가 동작한다", () => {
    render(<StudioAtelierSolidCadProPanel />);
    fireEvent.click(screen.getByTestId("atelier-solid-section-toggle"));
    expect(screen.getByTestId("atelier-solid-section-plane")).toBeTruthy();
    expect(screen.getByTestId("atelier-solid-section-slider")).toBeTruthy();
    fireEvent.change(screen.getByTestId("atelier-solid-yaw-slider"), { target: { value: "62" } });
    fireEvent.change(screen.getByTestId("atelier-solid-pitch-slider"), { target: { value: "36" } });
    fireEvent.click(screen.getByTestId("atelier-solid-perspective-toggle"));
    expect(screen.getByTestId("atelier-solid-perspective-toggle").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByTestId("atelier-solid-view-lt-lineart"));
    expect(screen.getByTestId("atelier-solid-viewport-svg").getAttribute("data-view-mode")).toBe("lt-lineart");
    fireEvent.click(screen.getByTestId("atelier-solid-view-drawing"));
    expect(screen.getByTestId("atelier-solid-drawing-svg")).toBeTruthy();
  });

  it("10종 피처 토글, 패턴/메이트 전환 및 초기화 버튼이 regenHash와 상태를 갱신·복구한다", () => {
    render(<StudioAtelierSolidCadProPanel initialPresetId="cafe-glass-showcase" />);
    const before = screen.getByTestId("atelier-solid-regen-hash").textContent;
    fireEvent.click(screen.getByTestId("atelier-solid-feature-shell"));
    expect(screen.getByTestId("atelier-solid-feature-shell").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("atelier-solid-regen-hash").textContent).not.toBe(before);

    fireEvent.click(screen.getByTestId("atelier-solid-pattern-circular"));
    fireEvent.click(screen.getByTestId("atelier-solid-mate-concentric"));
    fireEvent.click(screen.getByTestId("atelier-solid-reset-btn"));
    expect(screen.getByTestId("atelier-solid-feature-shell").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("atelier-solid-regen-hash").textContent).toBe(before);
  });

  it("Binary STL·LT 콜백 전달을 유지하고 미지원 STEP은 상태 표시만 한다", async () => {
    const onExportStl = vi.fn();
    const onExportStep = vi.fn();
    const onSendToWebtoonLt = vi.fn();
    render(
      <StudioAtelierSolidCadProPanel
        onExportStl={onExportStl}
        onExportStep={onExportStep}
        onSendToWebtoonLt={onSendToWebtoonLt}
      />,
    );
    fireEvent.click(screen.getByTestId("atelier-solid-export-stl-btn"));
    await waitFor(() => expect(onExportStl).toHaveBeenCalledTimes(1));
    expect(onExportStl.mock.calls[0]?.[0]).toBeInstanceOf(Uint8Array);
    expect(screen.getByTestId("atelier-solid-export-preview").getAttribute("data-export-kind")).toBe("STL");

    fireEvent.click(screen.getByTestId("atelier-solid-export-step-btn"));
    expect(onExportStep).not.toHaveBeenCalled();
    expect(screen.getByTestId("atelier-solid-export-preview").getAttribute("data-export-kind")).toBe("STEP_UNAVAILABLE");

    fireEvent.click(screen.getByTestId("atelier-solid-export-lt-btn"));
    await waitFor(() => expect(onSendToWebtoonLt).toHaveBeenCalledTimes(1));
    expect(onSendToWebtoonLt.mock.calls[0]?.[0]?.bridgeTarget).toBe("AtelierStage-2D-LT");
    expect(screen.getByTestId("atelier-solid-export-preview").getAttribute("data-export-kind")).toBe("LT");
  });
});

describe("7. 엄격 품질·하네스·디자인 계약 및 고유 브랜드 청정 자가 검증", () => {
  it("소유 파일 4종 존재, 줄 수 상한(kernel<=740, panel<=680, index<=80, test<=750) 및 금지 패턴 0건을 준수한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const required = [
      "atelier-solid-kernel.ts",
      "StudioAtelierSolidCadProPanel.tsx",
      "index.ts",
      "atelier-solid-cad-pro.test.tsx",
    ];
    for (const f of required) expect(existsSync(path.join(dir, f))).toBe(true);
    const allTs = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allTs.sort()).toEqual([...required].sort());

    const limits: Record<string, number> = {
      "atelier-solid-kernel.ts": 740,
      "StudioAtelierSolidCadProPanel.tsx": 680,
      "index.ts": 80,
      "atelier-solid-cad-pro.test.tsx": 750,
    };
    for (const f of allTs) {
      const src = readFileSync(path.join(dir, f), "utf8");
      expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(limits[f]);
      if (f !== "atelier-solid-cad-pro.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
        expect(src).not.toContain("가능하게 합니다");
        expect(src).not.toContain("직관적인 경험을 제공");
        expect(src).not.toContain("원활한 워크플로우를 보장");
      }
      if (f === "StudioAtelierSolidCadProPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("min-h-11");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("motion-reduce:transition-none");
      }
    }
  });

  it("모든 버튼이 min-h-11을 유지하고 모든 뷰 모드의 렌더링 SVG에 원시 색·바이올렛 휴가 0건이다", () => {
    const { container } = render(<StudioAtelierSolidCadProPanel />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(30);
    for (const btn of buttons) expect(btn.className).toContain("min-h-11");
    for (const mode of ["isometric", "front", "side", "top", "lt-lineart", "drawing"] as const) {
      fireEvent.click(screen.getByTestId(`atelier-solid-view-${mode}`));
      for (const svg of container.querySelectorAll("svg")) assertCleanOklchNoViolet(svg.outerHTML);
    }
  });

  it("4개 소유 파일 전수 검사에서 외부 CAD/3D 경쟁사 브랜드명이 0건이다 (100% ToonStudio 고유 브랜드)", () => {
    const dir = path.resolve(import.meta.dirname);
    const forbidden = [
      ["shapr", "3d"], ["solid", "works"], ["auto", "cad"], ["fusion", "360"],
      ["on", "shape"], ["sketch", "up"], ["rhino", "3d"], ["free", "cad"],
      ["z", "brush"], ["blen", "der"], ["clip", "studio"], ["pro", "create"],
    ].map((parts) => new RegExp(parts.join(""), "iu"));
    for (const f of readdirSync(dir).filter((name) => /\.(?:ts|tsx)$/u.test(name))) {
      const src = readFileSync(path.join(dir, f), "utf8");
      for (const rx of forbidden) expect(src).not.toMatch(rx);
    }
  });
});
