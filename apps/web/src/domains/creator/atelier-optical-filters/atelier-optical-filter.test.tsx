// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ATELIER_FILTER_BRAND,
  ATELIER_FILTER_IDS,
  ATELIER_FILTER_PRESETS,
  ATELIER_FILTER_SCHEMA_VERSION,
  ATELIER_INK_PIPELINE,
  FILTER_GRID_COLS,
  FILTER_GRID_ROWS,
  PRISM_LIGHT_ENGINE,
  StudioAtelierOpticalFilterPanel,
  applyFilmicToeShoulder,
  blueNoiseHash2d,
  buildAtelierFilterWgslShader,
  computeDepthCircleOfConfusion,
  computeMoireInterferencePercent,
  computeSkinToneProtectionMask,
  computeSplitCurtainMetrics,
  createDefaultFilterStack,
  evaluateDualGaussianHalation,
  evaluateHalftoneScreentoneSample,
  evaluateOpticalFilterPipeline,
  evaluatePolygonApertureMask,
  evaluatePrismDispersionOffsets,
  evaluateSobelEdgeAcutance,
  exportAtelierFilterChainJson,
  formatNonVioletOklch,
  isVioletHueDeg,
  linearRgbToOklch,
  linearToHalf16Quantize,
  linearToSrgb,
  normalizeAtelierFilterInput,
  oklchToLinearRgb,
  sampleHanjiMicroGrain,
  samplePaperReliefHeight,
  sampleTetrahedralLut3d,
  sanitizeNonVioletHueDeg,
  srgbToLinear,
  type AtelierFilterStackItem,
} from "./index";

afterEach(cleanup);

describe("1. 프리셋 레지스트리 · 고유 브랜드 · 경계 정규화", () => {
  it("6대 프로 광학·웹툰 필터 프리셋이 요구 ID와 비중복 스테이지 비트로 등록되어 있다", () => {
    expect(ATELIER_FILTER_PRESETS).toHaveLength(6);
    expect(ATELIER_FILTER_PRESETS.map((p) => p.id)).toEqual(ATELIER_FILTER_IDS);
    const bits = new Set(ATELIER_FILTER_PRESETS.map((p) => p.stageBit));
    expect(bits.size).toBe(6);
    for (const preset of ATELIER_FILTER_PRESETS) {
      expect(preset.titleKo.length).toBeGreaterThan(4);
      expect(preset.titleEn.length).toBeGreaterThan(4);
      expect(preset.recommendedStack.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("고유 브랜드(AtelierFilter · PrismLight · AtelierInk)와 16×10 참조 격자를 일관되게 반환한다", () => {
    const res = evaluateOpticalFilterPipeline();
    expect(res.brand).toBe(ATELIER_FILTER_BRAND);
    expect(res.engineName).toBe(PRISM_LIGHT_ENGINE);
    expect(res.inkPipelineName).toBe(ATELIER_INK_PIPELINE);
    expect(res.schemaVersion).toBe(ATELIER_FILTER_SCHEMA_VERSION);
    expect(res.gridCols).toBe(FILTER_GRID_COLS);
    expect(res.gridRows).toBe(FILTER_GRID_ROWS);
    expect(res.cells).toHaveLength(FILTER_GRID_COLS * FILTER_GRID_ROWS);
  });

  it("비파괴 필터 스택 입력을 변이하지 않고 중복 ID 제거 및 누락 필터 보충을 수행한다", () => {
    const inputStack: AtelierFilterStackItem[] = [
      { id: "chromatic-prism-dispersion", enabled: true, intensity: 0.9 },
      { id: "chromatic-prism-dispersion", enabled: false, intensity: 0.1 },
    ];
    const snapshot = JSON.stringify(inputStack);
    const norm = normalizeAtelierFilterInput({ stack: inputStack });
    expect(JSON.stringify(inputStack)).toBe(snapshot);
    expect(norm.stack).toHaveLength(6);
    expect(norm.stack[0]).toEqual({ id: "chromatic-prism-dispersion", enabled: true, intensity: 0.9 });
    expect(norm.stack.filter((s) => s.enabled)).toHaveLength(1);
  });

  it("NaN·Infinity·범위 초과 입력을 안전 경계로 정규화한다", () => {
    const norm = normalizeAtelierFilterInput({
      intensity: Number.NaN,
      focusDepth: Number.POSITIVE_INFINITY,
      splitCurtainPercent: 999,
      toneAngleDeg: -120,
      blueNoiseJitter: -4,
      centerSafeRadius: 0.01,
    });
    expect(norm.intensity).toBeGreaterThanOrEqual(0);
    expect(norm.focusDepth).toBe(0);
    expect(norm.splitCurtainPercent).toBe(100);
    expect(norm.toneAngleDeg).toBe(-45);
    expect(norm.blueNoiseJitter).toBe(0);
    expect(norm.centerSafeRadius).toBe(0.2);
  });

  it("모든 평가 셀의 표시 OKLCH 색상이 원시 hex/rgb 없이 바이올렛(270~320°) 0%를 준수한다", () => {
    const res = evaluateOpticalFilterPipeline({
      presetId: "oklch-tetrahedral-lut-grade",
      toneAngleDeg: 45,
      stack: ATELIER_FILTER_IDS.map((id) => ({ id, enabled: true, intensity: 0.85 })),
    });
    const oklchRegex = /^oklch\(([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)(?:\s*\/\s*[0-9.]+)?\)$/;
    for (const cell of res.cells) {
      for (const color of [cell.legacyOklch, cell.atelierOklch]) {
        const match = oklchRegex.exec(color);
        expect(match).not.toBeNull();
        const hue = Number(match?.[3] ?? 0);
        expect(isVioletHueDeg(hue)).toBe(false);
      }
    }
  });
});

describe("2. 필터 1 — 물리 조리개 보케 렌즈 블러 (6/8/9날 · 구면수차 · 16-bit 선형광 HDR)", () => {
  it("sRGB ↔ 16-bit 선형광 왕복이 정확하고 binary16 양자화가 HDR(> 1.0) 하이라이트를 보존한다", () => {
    for (const v of [0, 0.02, 0.18, 0.5, 0.88, 1]) {
      expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 5);
    }
    expect(linearToHalf16Quantize(2.65)).toBeGreaterThan(2.6);
    expect(linearToHalf16Quantize(2.65)).toBeCloseTo(2.65, 2);
  });

  it("6·8·9날 다각형 조리개 커널이 회전 대칭성과 외곽 절단을 정확히 만족한다", () => {
    for (const blades of [6, 8, 9] as const) {
      const sector = (2 * Math.PI) / blades;
      const w0 = evaluatePolygonApertureMask(0.6, 0, blades, 0.5);
      const w1 = evaluatePolygonApertureMask(0.6 * Math.cos(sector), 0.6 * Math.sin(sector), blades, 0.5);
      expect(w0).toBeGreaterThan(0);
      expect(w1).toBeCloseTo(w0, 4);
      expect(evaluatePolygonApertureMask(1.05, 0, blades, 0.5)).toBe(0);
    }
  });

  it("구면수차가 커질수록 보케 중심 대비 외곽 하이라이트 링 에너지가 뚜렷해진다", () => {
    const centerLow = evaluatePolygonApertureMask(0.15, 0, 8, 0.1);
    const rimLow = evaluatePolygonApertureMask(0.84, 0, 8, 0.1);
    const centerHigh = evaluatePolygonApertureMask(0.15, 0, 8, 0.95);
    const rimHigh = evaluatePolygonApertureMask(0.84, 0, 8, 0.95);
    expect(rimHigh / centerHigh).toBeGreaterThan(rimLow / centerLow);
    expect(rimHigh).toBeGreaterThan(centerHigh);
  });

  it("깊이맵 포커스 플레인에서는 착란원(CoC)이 0이고 원거리 배경으로 갈수록 증가한다", () => {
    expect(computeDepthCircleOfConfusion(0.25, 0.25, 16)).toBe(0);
    expect(computeDepthCircleOfConfusion(0.28, 0.25, 16)).toBe(0);
    const midCoc = computeDepthCircleOfConfusion(0.55, 0.25, 16);
    const farCoc = computeDepthCircleOfConfusion(0.9, 0.25, 16);
    expect(midCoc).toBeGreaterThan(0);
    expect(farCoc).toBeGreaterThan(midCoc);
  });

  it("16-bit 선형광 보케가 기존 8-bit 감마 블러 대비 HDR 하이라이트 에너지를 현저히 높게 보존한다", () => {
    const res = evaluateOpticalFilterPipeline({
      presetId: "optical-aperture-bokeh",
      intensity: 0.9,
      apertureBlades: 9,
      sphericalAberration: 0.85,
      focusDepth: 0.25,
    });
    expect(res.comparison.legacyBitDepth).toBe(8);
    expect(res.comparison.atelierBitDepth).toBe(16);
    expect(res.comparison.highlightRetentionAtelierPercent).toBeGreaterThan(
      res.comparison.highlightRetentionLegacyPercent + 20,
    );
    expect(res.comparison.highlightEnergyGainPercent).toBeGreaterThan(20);
  });

  it("조리개 날 수 6→8→9 전환이 WGSL 상수 APERTURE_BLADES에 정확히 반영된다", () => {
    for (const blades of [6, 8, 9] as const) {
      const res = evaluateOpticalFilterPipeline({ apertureBlades: blades });
      expect(res.config.apertureBlades).toBe(blades);
      expect(res.wgslShader.source).toContain(`const APERTURE_BLADES: f32 = ${blades}.0;`);
    }
  });
});

describe("3. 필터 2 — 종이 요철 반응형 광채 글로우 (이중 가우시안 · 높이맵 변조)", () => {
  it("종이 높이맵이 결정론적이고 [0, 1] 범위를 유지한다", () => {
    const a = samplePaperReliefHeight(0.32, 0.64);
    const b = samplePaperReliefHeight(0.32, 0.64);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(1);
  });

  it("이중 가우시안 할레이션 커널이 거리 증가에 따라 단조 감쇠한다", () => {
    const d0 = evaluateDualGaussianHalation(0, 2, 10, 0.5, 0.5);
    const d2 = evaluateDualGaussianHalation(2, 2, 10, 0.5, 0.5);
    const d6 = evaluateDualGaussianHalation(6, 2, 10, 0.5, 0.5);
    const d14 = evaluateDualGaussianHalation(14, 2, 10, 0.5, 0.5);
    expect(d0).toBeGreaterThan(d2);
    expect(d2).toBeGreaterThan(d6);
    expect(d6).toBeGreaterThan(d14);
  });

  it("종이 능선(높은 높이맵)이 골(낮은 높이맵)보다 높은 필름 할레이션 광채를 맺는다", () => {
    const ridge = evaluateDualGaussianHalation(2.5, 2.2, 9.5, 0.88, 0.85);
    const valley = evaluateDualGaussianHalation(2.5, 2.2, 9.5, 0.14, 0.85);
    expect(ridge).toBeGreaterThan(valley * 1.4);
  });

  it("파이프라인 평가에서 종이 요철 강도 활성화 시 능선 광채 상승률이 양수로 계측된다", () => {
    const low = evaluateOpticalFilterPipeline({ presetId: "paper-aware-halation-glow", paperReliefStrength: 0 });
    const high = evaluateOpticalFilterPipeline({ presetId: "paper-aware-halation-glow", paperReliefStrength: 0.95 });
    expect(high.comparison.paperRidgeGlowLiftPercent).toBeGreaterThan(low.comparison.paperRidgeGlowLiftPercent);
    expect(high.comparison.paperRidgeGlowLiftPercent).toBeGreaterThan(15);
  });
});

describe("4. 필터 3 — 무모아레 웹툰 스크린톤 & 해칭 (15°/45°/75° · 블루노이즈 390px 0% 모아레)", () => {
  it("2D 블루노이즈 해시가 결정론적으로 [0, 1) 범위에 분포한다", () => {
    const v1 = blueNoiseHash2d(17, 29);
    const v2 = blueNoiseHash2d(17, 29);
    const v3 = blueNoiseHash2d(18, 29);
    expect(v1).toBe(v2);
    expect(v1).toBeGreaterThanOrEqual(0);
    expect(v1).toBeLessThan(1);
    expect(v1).not.toBe(v3);
  });

  it("390px 모바일 세로 축소 시 기존 무디더링은 모아레가 발생하지만 블루노이즈 적용 시 0%를 달성한다", () => {
    for (const angle of [15, 45, 75] as const) {
      const legacyMoire = computeMoireInterferencePercent(angle, 60, 0, 390);
      const atelierMoire = computeMoireInterferencePercent(angle, 60, 0.85, 390);
      expect(legacyMoire).toBeGreaterThanOrEqual(16);
      expect(atelierMoire).toBe(0);
    }
  });

  it("블루노이즈 디더링 강도를 높일수록 모아레 간섭률이 단조 감소해 0%에 도달한다", () => {
    const m0 = computeMoireInterferencePercent(45, 65, 0);
    const m25 = computeMoireInterferencePercent(45, 65, 0.25);
    const m50 = computeMoireInterferencePercent(45, 65, 0.5);
    const m70 = computeMoireInterferencePercent(45, 65, 0.7);
    expect(m0).toBeGreaterThan(m25);
    expect(m25).toBeGreaterThan(m50);
    expect(m50).toBeGreaterThan(m70);
    expect(m70).toBe(0);
  });

  it("CMYK 로제트 각도(15°/45°/75°) 변경이 WGSL SCREEN_ANGLE_RAD에 정확히 반영된다", () => {
    const s15 = evaluateOpticalFilterPipeline({ presetId: "moire-free-halftone-screentone", screenAngleDeg: 15 });
    const s75 = evaluateOpticalFilterPipeline({ presetId: "moire-free-halftone-screentone", screenAngleDeg: 75 });
    expect(s15.wgslShader.source).toContain("Screen: 15deg");
    expect(s75.wgslShader.source).toContain("Screen: 75deg");
    expect(s15.wgslShader.source).not.toBe(s75.wgslShader.source);
  });

  it("스크린톤 망점 반경이 어두운 영역에서 밝은 영역보다 크게 형성된다", () => {
    const darkDot = evaluateHalftoneScreentoneSample(0.62, 0.44, 0.85, 45, 60, 0.8);
    const lightDot = evaluateHalftoneScreentoneSample(0.62, 0.44, 0.15, 45, 60, 0.8);
    expect(darkDot).toBeGreaterThan(lightDot + 0.4);
  });
});

describe("5. 필터 4 — 색수차 & 프리즘 광학 분산 (방사형 IOR · 얼굴 중앙 엣지 마스킹)", () => {
  it("중심 안전 반경 내부(얼굴 중앙)는 RGB 분산 오프셋이 엄격히 0이다", () => {
    const center = evaluatePrismDispersionOffsets(0.5, 0.5, 0.024, 0.42, 1);
    const inner = evaluatePrismDispersionOffsets(0.58, 0.54, 0.024, 0.42, 1);
    expect(center).toEqual({ rOffsetPx: 0, gOffsetPx: 0, bOffsetPx: 0, magnitudePx: 0 });
    expect(inner.magnitudePx).toBe(0);
  });

  it("프레임 외곽에서는 R(+)·G(0)·B(-) 파장별 굴절률 오프셋이 반대 방향으로 분산된다", () => {
    const corner = evaluatePrismDispersionOffsets(0.96, 0.05, 0.025, 0.42, 0.9);
    expect(corner.rOffsetPx).toBeGreaterThan(0);
    expect(corner.gOffsetPx).toBe(0);
    expect(corner.bOffsetPx).toBeLessThan(0);
    expect(corner.magnitudePx).toBeGreaterThan(corner.rOffsetPx);
  });

  it("굴절률 분산 폭(iorSpread)과 안전 반경(centerSafeRadius) 변화가 기대대로 작용한다", () => {
    const mild = evaluatePrismDispersionOffsets(0.92, 0.12, 0.008, 0.4, 0.9);
    const strong = evaluatePrismDispersionOffsets(0.92, 0.12, 0.032, 0.4, 0.9);
    const widerSafe = evaluatePrismDispersionOffsets(0.75, 0.5, 0.025, 0.6, 0.9);
    expect(strong.magnitudePx).toBeGreaterThan(mild.magnitudePx * 3);
    expect(widerSafe.magnitudePx).toBe(0);
  });

  it("파이프라인 평가에서 인물 얼굴 중앙 선명도 100%와 외곽 분산이 동시에 증명된다", () => {
    const res = evaluateOpticalFilterPipeline({
      presetId: "chromatic-prism-dispersion",
      centerSafeRadius: 0.6,
      iorSpread: 0.025,
      intensity: 0.85,
    });
    expect(res.comparison.faceCenterSharpnessPercent).toBe(100);
    expect(res.comparison.peripheryDispersionPx).toBeGreaterThan(1);
  });
});

describe("6. 필터 5 — 3D 테트라헤드랄 LUT & OKLCH 필름 톤 그레이딩", () => {
  it("6-심플렉스 3D 테트라헤드랄 보간이 모든 6개 사면체 영역에서 항등 LUT를 오차 1e-5 이내로 복원한다", () => {
    const identity = (r: number, g: number, b: number) => ({ r, g, b });
    const samples = [
      { r: 0.83, g: 0.51, b: 0.22 }, // fx >= fy >= fz
      { r: 0.84, g: 0.19, b: 0.57 }, // fx >= fz > fy
      { r: 0.48, g: 0.14, b: 0.86 }, // fz > fx >= fy
      { r: 0.16, g: 0.49, b: 0.89 }, // fz > fy > fx
      { r: 0.12, g: 0.87, b: 0.53 }, // fy >= fz > fx
      { r: 0.52, g: 0.88, b: 0.17 }, // fy > fx >= fz
    ];
    for (const s of samples) {
      const out = sampleTetrahedralLut3d(s, 17, identity);
      expect(out.r).toBeCloseTo(s.r, 5);
      expect(out.g).toBeCloseTo(s.g, 5);
      expect(out.b).toBeCloseTo(s.b, 5);
    }
  });

  it("17³(4,913) 및 33³(35,937) 3D LUT 격자 정점 수가 정확히 계측된다", () => {
    const l17 = evaluateOpticalFilterPipeline({ presetId: "oklch-tetrahedral-lut-grade", lutSize: 17 });
    const l33 = evaluateOpticalFilterPipeline({ presetId: "oklch-tetrahedral-lut-grade", lutSize: 33 });
    expect(l17.comparison.lutVerticesCount).toBe(17 ** 3);
    expect(l33.comparison.lutVerticesCount).toBe(33 ** 3);
  });

  it("Filmic Toe/Shoulder 곡선이 HDR 하이라이트를 [0, 1] 내로 단조·부드럽게 압축한다", () => {
    const v05 = applyFilmicToeShoulder(0.5, 0.8);
    const v12 = applyFilmicToeShoulder(1.2, 0.8);
    const v30 = applyFilmicToeShoulder(3.0, 0.8);
    expect(v12).toBeGreaterThan(v05);
    expect(v30).toBeGreaterThan(v12);
    expect(v30).toBeLessThanOrEqual(1);
  });

  it("피부톤 보호 벡터스코프가 강한 톤 각도 이동에서도 얼굴 피부색 휴 이탈을 억제한다", () => {
    const skinMask = computeSkinToneProtectionMask({ l: 0.72, c: 0.09, h: 52 });
    const skyMask = computeSkinToneProtectionMask({ l: 0.55, c: 0.14, h: 220 });
    expect(skinMask).toBeGreaterThan(0.8);
    expect(skyMask).toBe(0);

    const unprotected = evaluateOpticalFilterPipeline({
      presetId: "oklch-tetrahedral-lut-grade", toneAngleDeg: 40, skinToneProtection: 0,
    });
    const protectedRes = evaluateOpticalFilterPipeline({
      presetId: "oklch-tetrahedral-lut-grade", toneAngleDeg: 40, skinToneProtection: 1,
    });
    expect(protectedRes.comparison.skinToneHueDriftDeg).toBeLessThan(unprotected.comparison.skinToneHueDriftDeg);
    expect(protectedRes.comparison.skinToneHueDriftDeg).toBeLessThan(3);
  });

  it("선형 RGB ↔ OKLCH 왕복 및 바이올렛(270~320°) 배제 가드가 정확히 동작한다", () => {
    const src = { r: 0.62, g: 0.38, b: 0.24 };
    const back = oklchToLinearRgb(linearRgbToOklch(src));
    expect(back.r).toBeCloseTo(src.r, 3);
    expect(back.g).toBeCloseTo(src.g, 3);
    expect(back.b).toBeCloseTo(src.b, 3);
    expect(isVioletHueDeg(285)).toBe(true);
    expect(isVioletHueDeg(sanitizeNonVioletHueDeg(285))).toBe(false);
    expect(formatNonVioletOklch({ l: 0.7, c: 0.14, h: 292 })).not.toMatch(/292/);
  });
});

describe("7. 필터 6 — 아날로그 원고지 잉크 블리드 & 샤픈 (Sobel 경계 · Halo 0 · 한지 그레인)", () => {
  it("평탄 영역에서는 Sobel 그래디언트가 0이고 선화 경계에서는 높은 그래디언트가 검출된다", () => {
    const flat = evaluateSobelEdgeAcutance(0.5, Array.from({ length: 9 }, () => 0.5), 1.0);
    const edge = evaluateSobelEdgeAcutance(0.8, [0.1, 0.1, 0.8, 0.1, 0.8, 0.8, 0.1, 0.8, 0.8], 1.0);
    expect(flat.sobelGradient).toBe(0);
    expect(edge.sobelGradient).toBeGreaterThan(1.5);
  });

  it("기존 언샤프는 경계 Halo 오버슈트를 유발하지만 AtelierInk는 국소 포락선 클램핑으로 Halo 0을 보장한다", () => {
    const neighbors = [0.05, 0.05, 0.05, 0.05, 0.85, 0.85, 0.05, 0.85, 0.85];
    const evalEdge = evaluateSobelEdgeAcutance(0.85, neighbors, 1.2);
    expect(evalEdge.legacyHaloOvershoot).toBeGreaterThan(0.1);
    expect(evalEdge.atelierHaloOvershoot).toBe(0);

    const pipeline = evaluateOpticalFilterPipeline({ presetId: "ink-edge-acutance-unsharp", acutanceAmount: 1.2 });
    expect(pipeline.comparison.acutanceHaloOvershootLegacy).toBeGreaterThan(0);
    expect(pipeline.comparison.acutanceHaloOvershootAtelier).toBe(0);
  });

  it("한지 미립자 그레인이 결정론적이고 amount=0이면 0을 반환한다", () => {
    expect(sampleHanjiMicroGrain(4, 7, 0)).toBe(0);
    const g1 = sampleHanjiMicroGrain(4, 7, 0.25);
    const g2 = sampleHanjiMicroGrain(4, 7, 0.25);
    expect(g1).toBe(g2);
    expect(Math.abs(g1)).toBeLessThanOrEqual(0.06);
  });

  it("모든 필터를 비활성화하면 활성 단계 0 · 비트마스크 0 · 원본 통과 WGSL을 생성한다", () => {
    const emptyStack = createDefaultFilterStack("optical-aperture-bokeh").map((s) => ({ ...s, enabled: false }));
    const res = evaluateOpticalFilterPipeline({ stack: emptyStack });
    expect(res.enabledFilterIds).toHaveLength(0);
    expect(res.wgslShader.stageBitmask).toBe(0);
    expect(res.wgslShader.activeStageCount).toBe(0);
    expect(res.wgslShader.source).toContain("활성 필터 없음");
  });
});

describe("8. WGSL 컴퓨트 셰이더 생성기 · 스플릿 커튼 · JSON 직렬화", () => {
  it("@compute @workgroup_size(8, 8, 1) 진입점과 5개 리소스 바인딩·rgba16float 출력이 정확히 생성된다", () => {
    const res = evaluateOpticalFilterPipeline({ presetId: "optical-aperture-bokeh" });
    const { wgslShader } = res;
    expect(wgslShader.entryPoint).toBe("main");
    expect(wgslShader.workgroupSize).toEqual([8, 8, 1]);
    expect(wgslShader.bindingCount).toBe(5);
    expect(wgslShader.storageFormat).toBe("rgba16float");
    expect(wgslShader.source).toContain("@compute @workgroup_size(8, 8, 1)");
    expect(wgslShader.source).toContain("fn main(@builtin(global_invocation_id) gid: vec3<u32>)");
    for (let b = 0; b < 5; b += 1) {
      expect(wgslShader.source).toContain(`@group(0) @binding(${b})`);
    }
    expect(wgslShader.source).toContain("texture_storage_2d<rgba16float, write>");
  });

  it("WGSL 중괄호·괄호 짝이 균형을 이루고 비파괴 스택 순서 변경이 실제 호출 순서에 반영된다", () => {
    const stackA = [
      { id: "chromatic-prism-dispersion" as const, enabled: true, intensity: 0.7 },
      { id: "ink-edge-acutance-unsharp" as const, enabled: true, intensity: 0.8 },
    ];
    const stackB = [...stackA].reverse();
    const wgslA = buildAtelierFilterWgslShader(normalizeAtelierFilterInput({ stack: stackA }));
    const wgslB = buildAtelierFilterWgslShader(normalizeAtelierFilterInput({ stack: stackB }));

    for (const src of [wgslA.source, wgslB.source]) {
      const openBraces = (src.match(/\{/g) ?? []).length;
      const closeBraces = (src.match(/\}/g) ?? []).length;
      expect(openBraces).toBe(closeBraces);
      expect(openBraces).toBeGreaterThanOrEqual(10);
    }
    expect(wgslA.executionOrder).toEqual(["chromatic-prism-dispersion", "ink-edge-acutance-unsharp"]);
    expect(wgslB.executionOrder).toEqual(["ink-edge-acutance-unsharp", "chromatic-prism-dispersion"]);
    const idxPrismA = wgslA.source.indexOf("lin_rgb = stage_prism_dispersion");
    const idxInkA = wgslA.source.indexOf("lin_rgb = stage_sobel_ink_acutance");
    const idxPrismB = wgslB.source.indexOf("lin_rgb = stage_prism_dispersion");
    const idxInkB = wgslB.source.indexOf("lin_rgb = stage_sobel_ink_acutance");
    expect(idxPrismA).toBeLessThan(idxInkA);
    expect(idxInkB).toBeLessThan(idxPrismB);
  });

  it("스플릿 커튼(0%/50%/100%) 메트릭이 분할 칼럼 합과 노출 면적을 일관되게 계산한다", () => {
    const base = evaluateOpticalFilterPipeline();
    const m0 = computeSplitCurtainMetrics(0, base.comparison);
    const m50 = computeSplitCurtainMetrics(50, base.comparison);
    const m100 = computeSplitCurtainMetrics(100, base.comparison);
    expect(m0.revealedAtelierAreaPercent).toBe(100);
    expect(m50.legacyColumnCount + m50.atelierColumnCount).toBe(FILTER_GRID_COLS);
    expect(m100.revealedAtelierAreaPercent).toBe(0);
    expect(m0.visibleHighlightDeltaPercent).toBeGreaterThanOrEqual(m50.visibleHighlightDeltaPercent);
    expect(m50.visibleHighlightDeltaPercent).toBeGreaterThanOrEqual(m100.visibleHighlightDeltaPercent);
  });

  it("비교 메트릭이 비파괴 복원 가능 여부와 6대 품질 지표를 모두 포함한다", () => {
    const res = evaluateOpticalFilterPipeline({
      stack: ATELIER_FILTER_IDS.map((id) => ({ id, enabled: true, intensity: 0.8 })),
    });
    expect(res.comparison.nonDestructiveRestorable).toBe(true);
    expect(res.comparison.highlightRetentionAtelierPercent).toBeGreaterThan(res.comparison.highlightRetentionLegacyPercent);
    expect(res.comparison.moireInterferenceAtelierPercent).toBe(0);
    expect(res.comparison.acutanceHaloOvershootAtelier).toBe(0);
  });

  it("exportAtelierFilterChainJson이 유효한 JSON과 WGSL·비교 계약을 직렬화한다", () => {
    const res = evaluateOpticalFilterPipeline({ presetId: "oklch-tetrahedral-lut-grade", splitCurtainPercent: 35 });
    const raw = exportAtelierFilterChainJson(res);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed.brand).toBe("AtelierFilter");
    expect(parsed.engine).toBe("PrismLight");
    expect(parsed.inkPipeline).toBe("AtelierInk");
    expect(parsed.presetId).toBe("oklch-tetrahedral-lut-grade");
    expect((parsed.splitCurtain as { percent: number }).percent).toBe(35);
    expect((parsed.wgslContract as { workgroupSize: number[] }).workgroupSize).toEqual([8, 8, 1]);
  });
});

describe("9. 스튜디오 패널 UI 인터랙션 · 접근성 · 디자인/브랜드 정적 감사", () => {
  it("props 없이 기본 한글 UI로 렌더링되고 locale='en' 영문 전환도 지원한다", () => {
    const { rerender } = render(<StudioAtelierOpticalFilterPanel />);
    expect(screen.getByTestId("studio-atelier-optical-filter-panel")).toBeTruthy();
    expect(screen.getByTestId("atelier-filter-split-svg")).toBeTruthy();
    expect(screen.getByText(/AtelierFilter · 16-bit 선형광 광학 필터/)).toBeTruthy();

    rerender(<StudioAtelierOpticalFilterPanel locale="en" />);
    expect(screen.getByText(/AtelierFilter · 16-bit Linear-Light Optical Filter/)).toBeTruthy();
  });

  it("6대 프리셋 카드를 클릭하면 활성 프리셋, SVG 속성, onPipelineChange 콜백이 갱신된다", () => {
    const onPipelineChange = vi.fn();
    render(<StudioAtelierOpticalFilterPanel onPipelineChange={onPipelineChange} />);
    const screentoneBtn = screen.getByTestId("filter-preset-moire-free-halftone-screentone");
    fireEvent.click(screentoneBtn);
    expect(screentoneBtn.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("atelier-filter-split-svg").getAttribute("data-preset")).toBe("moire-free-halftone-screentone");
    expect(screen.getByTestId("svg-blue-noise-screentone")).toBeTruthy();
    expect(onPipelineChange).toHaveBeenCalledTimes(1);
  });

  it("비파괴 필터 스택의 Switch 토글과 위/아래 순서 이동이 WGSL 코드와 활성 수에 즉시 반영된다", () => {
    render(<StudioAtelierOpticalFilterPanel />);
    const togglePrism = screen.getByTestId("stack-toggle-chromatic-prism-dispersion");
    expect(togglePrism.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(togglePrism);
    expect(togglePrism.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("active-stage-count").textContent).toContain("4/6");

    const moveDownBokeh = screen.getByTestId("stack-down-optical-aperture-bokeh");
    fireEvent.click(moveDownBokeh);
    expect(screen.getByTestId("stack-row-optical-aperture-bokeh").getAttribute("data-stack-index")).toBe("1");
    expect(screen.getByTestId("wgsl-shader-code").textContent).toContain("stage_prism_dispersion");
  });

  it("전·후 스플릿 커튼 슬라이더(0~100%)와 빠른 이동 버튼이 SVG 분할선과 읽기를 동기화한다", () => {
    render(<StudioAtelierOpticalFilterPanel />);
    const slider = screen.getByTestId("split-curtain-slider") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "25" } });
    expect(screen.getByTestId("atelier-filter-split-svg").getAttribute("data-split-percent")).toBe("25");
    expect(screen.getByTestId("split-curtain-readout").textContent).toContain("25%");
    expect(screen.getByTestId("split-curtain-readout").textContent).toContain("75%");

    fireEvent.click(screen.getByTestId("split-quick-0"));
    expect(screen.getByTestId("atelier-filter-split-svg").getAttribute("data-split-percent")).toBe("0");
    fireEvent.click(screen.getByTestId("split-quick-100"));
    expect(screen.getByTestId("atelier-filter-split-svg").getAttribute("data-split-percent")).toBe("100");
  });

  it("조리개 날 수·스크린톤 각도·LUT 격자·슬라이더 조작과 초기값 복원 버튼이 정상 동작한다", () => {
    render(<StudioAtelierOpticalFilterPanel />);
    fireEvent.click(screen.getByTestId("aperture-blades-9"));
    fireEvent.click(screen.getByTestId("screen-angle-75"));
    fireEvent.click(screen.getByTestId("lut-size-17"));
    fireEvent.change(screen.getByTestId("slider-tone-angle"), { target: { value: "-24" } });

    const svg = screen.getByTestId("atelier-filter-split-svg");
    expect(svg.getAttribute("data-aperture-blades")).toBe("9");
    expect(svg.getAttribute("data-screen-angle")).toBe("75");
    expect(svg.getAttribute("data-lut-size")).toBe("17");

    fireEvent.click(screen.getByTestId("reset-optical-filter-btn"));
    expect(svg.getAttribute("data-aperture-blades")).toBe("8");
    expect(svg.getAttribute("data-screen-angle")).toBe("45");
    expect(svg.getAttribute("data-lut-size")).toBe("33");
  });

  it("WGSL <details> 코드 확인 및 JSON 복사 버튼이 onExportJson과 라이브 상태를 갱신한다", () => {
    const onExportJson = vi.fn();
    render(<StudioAtelierOpticalFilterPanel onExportJson={onExportJson} />);
    const details = screen.getByTestId("wgsl-shader-details") as HTMLDetailsElement;
    expect(details.tagName.toLowerCase()).toBe("details");
    expect(screen.getByTestId("wgsl-shader-code").textContent).toContain("@compute @workgroup_size(8, 8, 1)");

    fireEvent.click(screen.getByTestId("copy-filter-json-btn"));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    const [jsonArg] = onExportJson.mock.calls[0] as [string];
    expect(JSON.parse(jsonArg).brand).toBe("AtelierFilter");
    expect(screen.getByTestId("atelier-filter-status").textContent).toContain("JSON");

    fireEvent.click(screen.getByTestId("copy-wgsl-btn"));
    expect(screen.getByTestId("atelier-filter-status").textContent).toContain("WGSL");
  });

  it("정적 디자인 계약(원시색·바이올렛·transition-all·Sparkles·Web Storage·= {}·외부 브랜드 0건)을 준수한다", () => {
    const dir = resolve(process.cwd(), "apps/web/src/domains/creator/atelier-optical-filters");
    const engineSrc = readFileSync(resolve(dir, "atelier-optical-filter-engine.ts"), "utf8");
    const panelSrc = readFileSync(resolve(dir, "StudioAtelierOpticalFilterPanel.tsx"), "utf8");
    const barrelSrc = readFileSync(resolve(dir, "index.ts"), "utf8");
    const combined = `${engineSrc}\n${panelSrc}\n${barrelSrc}`;

    // 원시 hex / rgb / hsl 0건
    expect(combined).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(combined).not.toMatch(/\brgba?\s*\(/i);
    expect(combined).not.toMatch(/\bhsla?\s*\(/i);

    // 바이올렛 휴(270~320°) OKLCH 리터럴 0건
    const oklchMatches = [...combined.matchAll(/oklch\(\s*[0-9.]+\s+[0-9.]+\s+([0-9.]+)/g)];
    for (const m of oklchMatches) {
      expect(isVioletHueDeg(Number(m[1]))).toBe(false);
    }

    // 금지 패턴 0건
    expect(panelSrc).not.toContain("transition-all");
    expect(panelSrc).not.toContain("Sparkles");
    expect(combined).not.toMatch(/\b(localStorage|sessionStorage|indexedDB)\b/);
    expect(panelSrc).not.toMatch(/StudioAtelierOpticalFilterPanelProps\s*=\s*\{\s*\}/);

    // 필수 Calm Atelier 접근성/타이포 계약 존재
    expect(panelSrc).toContain("min-h-11");
    expect(panelSrc).toContain("tabular-nums");
    expect(panelSrc).toContain("[word-break:keep-all]");
    expect(panelSrc).toContain("motion-reduce:transition-none");

    // 외부 라이브러리·경쟁사 브랜드 오염 0건
    const forbiddenBrands = [
      ["photo", "shop"].join(""),
      ["clip", "studio"].join(""),
      ["pro", "create"].join(""),
      ["affi", "nity"].join(""),
      ["kri", "ta"].join(""),
      ["ligh", "troom"].join(""),
      ["da", "vinci"].join(""),
      ["ski", "a"].join(""),
      ["pix", "ijs"].join(""),
      ["three", "js"].join(""),
    ];
    const lower = combined.toLowerCase();
    for (const token of forbiddenBrands) {
      expect(lower).not.toContain(token);
    }
  });
});
