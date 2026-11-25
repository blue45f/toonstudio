// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import path from "node:path";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ATELIER_INK_ENGINE_BRAND,
  ATELIER_INK_OPTICAL_WGSL,
  ATELIER_INK_SCHEMA_VERSION,
  ATELIER_INK_SIGNATURE_PRESETS,
  DRY_SURFACE_ROUGHNESS,
  IMPASTO_SOBEL_LIGHT_ANGLE_DEG,
  LEGACY_CIRCULAR_STAMP_BEADING_INDEX,
  MAX_ATELIER_INK_BEADING_INDEX,
  MAX_BRISTLE_COUNT,
  MIN_BRISTLE_COUNT,
  SPECTRUM_COMPUTE_BRAND,
  StudioAtelierInkOpticalPanel,
  TOONCORE_RUNTIME_BRAND,
  WET_SURFACE_ROUGHNESS,
  alignToWebGpu256,
  computeBristleDepletion,
  evaluateBrushVisualRealism,
  evaluateWetDryOpticalSurface,
  exportAtelierInkSpecJson,
  formatOklch,
  getAtelierInkPreset,
  isVioletHueDeg,
  mixOpticalSpectralPigments,
  normalizeAtelierInkControls,
  sampleDualFrequencyPaperHeight,
  sanitizeNonVioletOklch,
  validateAtelierInkWgsl,
  type AtelierInkPresetId,
} from "./index";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ALL_PRESET_IDS: readonly AtelierInkPresetId[] = [
  "hanji-sumi-bristle",
  "cotton-watercolor-bloom",
  "impasto-oil-knife",
  "wax-crayon-grain",
  "graphite-4b-tilt",
  "steel-gpen-taper",
];

describe("1. 6종 AtelierInk 시그니처 프리셋 및 입력 계약", () => {
  it("6종 시그니처 화구 프리셋이 정본 ID 순서대로 등록되어 있다", () => {
    expect(ATELIER_INK_SIGNATURE_PRESETS).toHaveLength(6);
    expect(ATELIER_INK_SIGNATURE_PRESETS.map((preset) => preset.id)).toEqual(ALL_PRESET_IDS);
  });

  it("모든 프리셋의 OKLCH 안료·보조색·종이 색상이 바이올렛 대역(270~320°)을 0% 배제한다", () => {
    for (const preset of ATELIER_INK_SIGNATURE_PRESETS) {
      expect(isVioletHueDeg(preset.pigmentOklch.h)).toBe(false);
      expect(isVioletHueDeg(preset.partnerPigmentOklch.h)).toBe(false);
      expect(isVioletHueDeg(preset.paperProfile.paperOklch.h)).toBe(false);
      expect(isVioletHueDeg(preset.paperProfile.valleyOklch.h)).toBe(false);
      expect(formatOklch(preset.pigmentOklch)).toMatch(/^oklch\(/u);
    }
    const safeLow = sanitizeNonVioletOklch({ l: 0.5, c: 0.14, h: 285 });
    const safeHigh = sanitizeNonVioletOklch({ l: 0.5, c: 0.14, h: 310 });
    expect(isVioletHueDeg(safeLow.h)).toBe(false);
    expect(isVioletHueDeg(safeHigh.h)).toBe(false);
    expect(safeLow.h).toBe(236);
    expect(safeHigh.h).toBe(342);
  });

  it("getAtelierInkPreset은 방어적 사본을 반환해 외부 수정으로부터 정본을 보호한다", () => {
    const before = JSON.stringify(getAtelierInkPreset("hanji-sumi-bristle"));
    const copy = getAtelierInkPreset("hanji-sumi-bristle");
    Reflect.set(copy.paperProfile, "nameKo", "변조된 종이");
    Reflect.set(copy.defaults, "bristleCount", 99);
    expect(JSON.stringify(getAtelierInkPreset("hanji-sumi-bristle"))).toBe(before);
  });

  it.each(["__proto__", "constructor", "unknown-brush", ""])("미등록 또는 프로토타입 키 %s를 RangeError로 차단한다", (badId) => {
    expect(() => Reflect.apply(getAtelierInkPreset, null, [badId])).toThrow(RangeError);
    expect(() => Reflect.apply(evaluateBrushVisualRealism, null, [badId])).toThrow(RangeError);
  });

  it("normalizeAtelierInkControls는 NaN·무한대·범위 초과 입력을 안전하게 클램프하고 원본 객체를 보존한다", () => {
    const frozen = Object.freeze({
      pressure: Number.NaN,
      tiltDeg: 180,
      dryingProgress: -2,
      paperRoughness: Number.POSITIVE_INFINITY,
      bristleCount: 40,
      impastoThicknessMm: 9.5,
      strokeSpeedPxPerSec: 99999,
    });
    const norm = normalizeAtelierInkControls("wax-crayon-grain", frozen);
    expect(norm.clamped).toBe(true);
    expect(norm.tiltDeg).toBe(75);
    expect(norm.dryingProgress).toBe(0);
    expect(norm.bristleCount).toBe(MAX_BRISTLE_COUNT);
    expect(norm.impastoThicknessMm).toBe(2.4);
    expect(norm.strokeSpeedPxPerSec).toBe(2400);
    expect(Number.isNaN(frozen.pressure)).toBe(true);
  });

  it("alignToWebGpu256은 WebGPU 동적 유니폼 오프셋 256B 정렬을 정확히 계산한다", () => {
    expect(alignToWebGpu256(0)).toBe(0);
    expect(alignToWebGpu256(96)).toBe(256);
    expect(alignToWebGpu256(256)).toBe(256);
    expect(alignToWebGpu256(257)).toBe(512);
  });
});

describe("2. 원인 1 해결 — 연속 리본 SDF 보간기(원형 도장 끊김 0.82 → <0.04)", () => {
  it("6종 프리셋 모두 구형 0.82 대비 Beading 지표를 0.04 미만으로 낮춘다", () => {
    for (const id of ALL_PRESET_IDS) {
      const report = evaluateBrushVisualRealism(id);
      expect(report.ribbon.legacyBeadingIndex).toBe(LEGACY_CIRCULAR_STAMP_BEADING_INDEX);
      expect(report.ribbon.beadingIndex).toBeLessThan(MAX_ATELIER_INK_BEADING_INDEX);
      expect(report.ribbon.beadingReductionPct).toBeGreaterThan(95);
      expect(report.ribbon.ribbonContinuityRatio).toBeGreaterThan(0.96);
    }
  });

  it("스틸 닙 600DPI 프리셋이 가장 낮은 Beading 지표와 600DPI 서브픽셀 AA를 유지한다", () => {
    const gpen = evaluateBrushVisualRealism("steel-gpen-taper");
    expect(gpen.ribbon.nibSharpnessDpi).toBe(600);
    expect(gpen.ribbon.beadingIndex).toBeLessThan(0.025);
    expect(gpen.ribbon.sdfAntiAliasPx).toBeLessThanOrEqual(0.6);
  });

  it("고속 필기 시 적응형 분할 밀도를 높여 Beading을 0.04 미만으로 방어한다", () => {
    const slow = evaluateBrushVisualRealism("hanji-sumi-bristle", { strokeSpeedPxPerSec: 150 });
    const fast = evaluateBrushVisualRealism("hanji-sumi-bristle", { strokeSpeedPxPerSec: 2300 });
    expect(fast.ribbon.adaptiveSegmentsPerMm).toBeGreaterThan(slow.ribbon.adaptiveSegmentsPerMm);
    expect(fast.ribbon.beadingIndex).toBeLessThan(MAX_ATELIER_INK_BEADING_INDEX);
  });
});

describe("3. 원인 2 해결 — 이중 주파수(거시 섬유 + 미세 요철) 종이 높이장 임계 클리핑", () => {
  it("sampleDualFrequencyPaperHeight는 결정론적이며 비정상 좌표에서도 [0, 1] 범위를 지킨다", () => {
    const preset = getAtelierInkPreset("hanji-sumi-bristle");
    const a = sampleDualFrequencyPaperHeight(preset.paperProfile, 0.35, 0.42);
    const b = sampleDualFrequencyPaperHeight(preset.paperProfile, 0.35, 0.42);
    const nanSample = sampleDualFrequencyPaperHeight(preset.paperProfile, Number.NaN, Number.POSITIVE_INFINITY);
    expect(a).toEqual(b);
    for (const s of [a, nanSample]) {
      expect(s.macroHeight).toBeGreaterThanOrEqual(0);
      expect(s.macroHeight).toBeLessThanOrEqual(1);
      expect(s.microHeight).toBeGreaterThanOrEqual(0);
      expect(s.microHeight).toBeLessThanOrEqual(1);
      expect(s.combinedHeight).toBeGreaterThanOrEqual(0);
      expect(s.combinedHeight).toBeLessThanOrEqual(1);
    }
  });

  it("필압이 낮을수록 임계값이 상승해 종이 골짜기 백색 공극이 자연스럽게 드러난다", () => {
    const lightPress = evaluateBrushVisualRealism("wax-crayon-grain", { pressure: 0.15, tiltDeg: 45, paperRoughness: 0.9 });
    const heavyPress = evaluateBrushVisualRealism("wax-crayon-grain", { pressure: 0.95, tiltDeg: 45, paperRoughness: 0.9 });
    expect(lightPress.paperGrain.clipThreshold).toBeGreaterThan(heavyPress.paperGrain.clipThreshold);
    expect(lightPress.paperGrain.valleyVoidRatio).toBeGreaterThan(heavyPress.paperGrain.valleyVoidRatio);
  });

  it("펜 기울기가 클수록 산봉우리 접촉 위주로 클리핑되어 눕혀 칠하기 질감이 살아난다", () => {
    const upright = evaluateBrushVisualRealism("graphite-4b-tilt", { pressure: 0.5, tiltDeg: 5 });
    const tilted = evaluateBrushVisualRealism("graphite-4b-tilt", { pressure: 0.5, tiltDeg: 72 });
    expect(tilted.paperGrain.clipThreshold).toBeGreaterThan(upright.paperGrain.clipThreshold);
    expect(tilted.paperGrain.valleyVoidRatio).toBeGreaterThanOrEqual(upright.paperGrain.valleyVoidRatio);
  });

  it("이중 주파수 종이결 대비가 기존 평면 오버레이(0.16)보다 크게 높고 단면 28샘플이 임계와 일치한다", () => {
    const report = evaluateBrushVisualRealism("wax-crayon-grain");
    expect(report.paperGrain.dualGrainMicroContrast).toBeGreaterThan(report.paperGrain.legacyFlatOverlayContrast * 3);
    expect(report.paperGrain.crossSectionSamples).toHaveLength(28);
    for (const sample of report.paperGrain.crossSectionSamples) {
      expect(sample.pigmentHit).toBe(sample.combinedHeight >= report.paperGrain.clipThreshold);
    }
  });
});

describe("4. 원인 3 해결 — 분광 광학 K/S 혼색 및 8~24모 개별 붓털 안료 고갈 곡선", () => {
  it("6종 프리셋 모두 분광 K/S 혼색이 구형 sRGB 선형 혼색보다 높은 채도를 보존한다", () => {
    for (const id of ALL_PRESET_IDS) {
      const report = evaluateBrushVisualRealism(id);
      expect(report.spectralMix.opticalChromaRetention).toBeGreaterThan(report.spectralMix.legacySrgbChromaRetention);
      expect(report.spectralMix.chromaPreservationGainPct).toBeGreaterThan(25);
      expect(isVioletHueDeg(report.spectralMix.mixedOklch.h)).toBe(false);
    }
  });

  it("세룰리안 청록과 카드뮴 레몬의 K/S 혼색이 530nm 녹색 반사 피크를 유지한다", () => {
    const wc = getAtelierInkPreset("cotton-watercolor-bloom");
    const mix = mixOpticalSpectralPigments(wc.pigmentOklch, wc.spectralReflectance, wc.partnerPigmentOklch, wc.partnerReflectance, 0.5);
    expect(mix.mixedReflectance).toHaveLength(6);
    expect(mix.mixedReflectance[2]).toBeGreaterThan(mix.mixedReflectance[0]);
    expect(mix.mixedReflectance[2]).toBeGreaterThan(mix.mixedReflectance[5]);
    expect(mix.mixedOklch.h).toBeGreaterThan(130);
    expect(mix.mixedOklch.h).toBeLessThan(185);
  });

  it("붓털 수는 8~24모 범위에서 정확히 생성되며 범위 외 값은 [8, 24]로 클램프된다", () => {
    const preset = getAtelierInkPreset("hanji-sumi-bristle");
    const low = computeBristleDepletion(preset, normalizeAtelierInkControls("hanji-sumi-bristle", { bristleCount: 3 }));
    const mid = computeBristleDepletion(preset, normalizeAtelierInkControls("hanji-sumi-bristle", { bristleCount: 16 }));
    const high = computeBristleDepletion(preset, normalizeAtelierInkControls("hanji-sumi-bristle", { bristleCount: 40 }));
    expect(low.bristleCount).toBe(MIN_BRISTLE_COUNT);
    expect(low.filaments).toHaveLength(MIN_BRISTLE_COUNT);
    expect(mid.filaments).toHaveLength(16);
    expect(high.bristleCount).toBe(MAX_BRISTLE_COUNT);
    expect(high.filaments).toHaveLength(MAX_BRISTLE_COUNT);
  });

  it("각 붓털의 안료 잔량은 획 시작(t=0)에서 끝단(t=1)까지 단조 감소하고 고속 건조에서 갈필이 커진다", () => {
    const preset = getAtelierInkPreset("hanji-sumi-bristle");
    const wetSlow = computeBristleDepletion(preset, normalizeAtelierInkControls("hanji-sumi-bristle", { dryingProgress: 0.1, strokeSpeedPxPerSec: 200, pressure: 0.9 }));
    const dryFast = computeBristleDepletion(preset, normalizeAtelierInkControls("hanji-sumi-bristle", { dryingProgress: 0.85, strokeSpeedPxPerSec: 2100, pressure: 0.25 }));
    for (const fil of dryFast.filaments) {
      expect(fil.samples[0]).toBeGreaterThanOrEqual(fil.samples[1]);
      expect(fil.samples[1]).toBeGreaterThanOrEqual(fil.samples[2]);
      expect(fil.samples[2]).toBeGreaterThanOrEqual(fil.samples[3]);
      expect(fil.samples[3]).toBeGreaterThanOrEqual(fil.samples[4]);
    }
    expect(dryFast.dryBrushSplitRatio).toBeGreaterThan(wetSlow.dryBrushSplitRatio);
    expect(dryFast.meanTailLoad).toBeLessThan(wetSlow.meanTailLoad);
  });
});

describe("5. 원인 4 해결 — 습윤→건조 거칠기(0.14→0.78) · 45° Sobel 임파스토 · 모세관 백런", () => {
  it("건조 진행도 0→1에 따라 표면 거칠기가 정확히 0.14에서 0.78로 단조 증가한다", () => {
    const preset = getAtelierInkPreset("cotton-watercolor-bloom");
    const steps = [0, 0.25, 0.5, 0.75, 1] as const;
    const results = steps.map((d) => evaluateWetDryOpticalSurface(preset, normalizeAtelierInkControls("cotton-watercolor-bloom", { dryingProgress: d })));
    expect(results[0]?.surfaceRoughness).toBe(WET_SURFACE_ROUGHNESS);
    expect(results[4]?.surfaceRoughness).toBe(DRY_SURFACE_ROUGHNESS);
    expect(results[0]?.wetGlossIntensity).toBe(1);
    for (let i = 1; i < results.length; i += 1) {
      expect(results[i]!.surfaceRoughness).toBeGreaterThan(results[i - 1]!.surfaceRoughness);
      expect(results[i]!.wetGlossIntensity).toBeLessThan(results[i - 1]!.wetGlossIntensity);
    }
  });

  it("유화 나이프 프리셋에서 임파스토 두께 증가 시 45° Sobel 법선·하이라이트·그림자가 함께 상승한다", () => {
    const flat = evaluateBrushVisualRealism("impasto-oil-knife", { impastoThicknessMm: 0 });
    const thick = evaluateBrushVisualRealism("impasto-oil-knife", { impastoThicknessMm: 2.3, dryingProgress: 0.15 });
    expect(thick.wetDryOptical.sobelLightAngleDeg).toBe(IMPASTO_SOBEL_LIGHT_ANGLE_DEG);
    expect(flat.wetDryOptical.sobelNormalStrength).toBe(0);
    expect(thick.wetDryOptical.sobelNormalStrength).toBeGreaterThan(0.7);
    expect(thick.wetDryOptical.impastoHighlightGain).toBeGreaterThan(0.6);
    expect(thick.wetDryOptical.impastoShadowDepth).toBeGreaterThan(0.5);
  });

  it("면지 수채 프리셋은 습윤 상태에서 강한 모세관 백런 림을 만들고 완전 건조 시 0으로 수렴한다", () => {
    const wet = evaluateBrushVisualRealism("cotton-watercolor-bloom", { dryingProgress: 0.05 });
    const dry = evaluateBrushVisualRealism("cotton-watercolor-bloom", { dryingProgress: 1 });
    expect(wet.wetDryOptical.capillaryBackrunRimWidthPx).toBeGreaterThan(4);
    expect(wet.wetDryOptical.capillaryEdgeDarkening).toBeGreaterThan(1.7);
    expect(dry.wetDryOptical.capillaryBackrunRimWidthPx).toBe(0);
    expect(dry.wetDryOptical.capillaryEdgeDarkening).toBe(1);
  });
});

describe("6. 5축 사실성 비교 · SpectrumCompute WGSL 정적 계약 검증 · JSON/WGSL 내보내기", () => {
  it("모든 프리셋에서 4대 결함이 해결되고 5축 사실성 점수가 구형 원형 스탬프를 압도한다", () => {
    for (const id of ALL_PRESET_IDS) {
      const report = evaluateBrushVisualRealism(id);
      expect(report.engineBrand).toBe(ATELIER_INK_ENGINE_BRAND);
      expect(report.runtimeCore).toBe(TOONCORE_RUNTIME_BRAND);
      expect(report.computeBackend).toBe(SPECTRUM_COMPUTE_BRAND);
      expect(report.fourRootCauses).toHaveLength(4);
      expect(report.fourRootCauses.every((item) => item.resolved)).toBe(true);
      expect(report.axes).toHaveLength(5);
      for (const axis of report.axes) {
        expect(axis.atelierInkScore).toBeGreaterThan(axis.legacyScore + 50);
      }
      expect(report.realismGainPoints).toBeGreaterThan(60);
    }
  });

  it("정본 ATELIER_INK_OPTICAL_WGSL이 16B 정렬·예약어 0건·컴퓨트 안전 샘플링 계약을 모두 통과한다", () => {
    const result = validateAtelierInkWgsl(ATELIER_INK_OPTICAL_WGSL);
    expect(result.valid).toBe(true);
    expect(result.validationKind).toBe("static-source-contract");
    expect(result.gpuCompiled).toBe(false);
    expect(result.entryPoint).toBe("atelier_ink_optical_main");
    expect(result.workgroupSize).toEqual([16, 16, 1]);
    expect(result.uniformStructBytes).toBe(96);
    expect(result.uniformAlignedStrideBytes).toBe(256);
    expect(result.bristleStructBytes).toBe(32);
    expect(result.bindingCount).toBe(6);
    expect(result.reservedKeywordHits).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("WGSL 검증기가 예약어 충돌(filter·smooth)을 정확히 검출한다", () => {
    const broken = ATELIER_INK_OPTICAL_WGSL.replace("let ribbon_cov =", "let filter =").replace("let grain_cov =", "let smooth =");
    const result = validateAtelierInkWgsl(broken);
    expect(result.valid).toBe(false);
    expect(result.reservedKeywordHits).toEqual(["filter", "smooth"]);
  });

  it("WGSL 검증기가 16B 미정렬 구조체를 실패로 판정한다", () => {
    const misaligned = ATELIER_INK_OPTICAL_WGSL.replace("taper_flags    : vec4<f32>,", "taper_flags    : f32,");
    const result = validateAtelierInkWgsl(misaligned);
    expect(result.valid).toBe(false);
    expect(result.bristleStructBytes).toBe(20);
    expect(result.errors.some((err) => err.startsWith("struct-16b-alignment"))).toBe(true);
  });

  it("WGSL 검증기가 괄호 불균형과 컴퓨트 셰이더 내 textureSample 호출을 차단한다", () => {
    const badSampling = `${ATELIER_INK_OPTICAL_WGSL.replace("textureSampleLevel(", "textureSample(")}{`;
    const result = validateAtelierInkWgsl(badSampling);
    expect(result.valid).toBe(false);
    expect(result.errors.some((err) => err.startsWith("delimiters-balanced"))).toBe(true);
    expect(result.errors.some((err) => err.startsWith("compute-safe-sampling"))).toBe(true);
  });

  it("WGSL 검증기가 65,536자 초과 문자열을 RangeError로 거부한다", () => {
    expect(() => validateAtelierInkWgsl("a".repeat(65_537))).toThrow(RangeError);
  });

  it("exportAtelierInkSpecJson이 스키마·브랜드·정직한 runtimeState·방어적 사본을 반환한다", () => {
    const { json, wgsl, spec } = exportAtelierInkSpecJson({
      presetId: "impasto-oil-knife",
      controls: { pressure: 2.5, bristleCount: 22 },
    });
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(spec.schemaVersion).toBe(ATELIER_INK_SCHEMA_VERSION);
    expect(spec.engine).toBe("AtelierInk");
    expect(spec.runtimeCore).toBe("ToonCore");
    expect(spec.computeBackend).toBe("SpectrumCompute");
    expect(spec.report.input.clamped).toBe(true);
    expect(spec.runtimeState).toEqual({
      model: "deterministic-analytical-cpu",
      gpuExecuted: false,
      canvasApplied: false,
      persisted: false,
    });
    expect(wgsl).toBe(ATELIER_INK_OPTICAL_WGSL);
    expect(parsed.schemaVersion).toBe(ATELIER_INK_SCHEMA_VERSION);
    Reflect.set(spec.activePreset, "nameKo", "외부 변조");
    expect(getAtelierInkPreset("impasto-oil-knife").nameKo).toBe("유화 나이프 두꺼운 질감");
  });
});

describe("7. StudioAtelierInkOpticalPanel UI 인터랙션 및 접근성", () => {
  it("props 없이 기본 한국어로 렌더링되며 6종 프리셋 카드와 좌우 SVG 비교 캔버스를 표시한다", () => {
    render(<StudioAtelierInkOpticalPanel />);
    expect(screen.getByTestId("studio-atelier-ink-optical-panel")).toBeTruthy();
    for (const id of ALL_PRESET_IDS) {
      expect(screen.getByTestId(`preset-card-${id}`)).toBeTruthy();
    }
    expect(screen.getByTestId("preset-card-hanji-sumi-bristle").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("svg-legacy-column")).toBeTruthy();
    expect(screen.getByTestId("svg-atelier-ink-column")).toBeTruthy();
  });

  it("locale='en', initialPresetId, className 선택적 props를 정확히 반영한다", () => {
    render(<StudioAtelierInkOpticalPanel initialPresetId="steel-gpen-taper" locale="en" className="custom-atelier-host" />);
    const root = screen.getByTestId("studio-atelier-ink-optical-panel");
    expect(root.className).toContain("custom-atelier-host");
    expect(root.textContent).toContain("AtelierInk Optical Brush Texture Studio");
    expect(screen.getByTestId("preset-card-steel-gpen-taper").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("atelier-ink-comparison-svg").getAttribute("data-preset-id")).toBe("steel-gpen-taper");
  });

  it("프리셋 카드를 클릭하면 활성 상태·SVG·슬라이더가 갱신되고 onPresetChange 콜백이 호출된다", () => {
    const onPresetChange = vi.fn();
    render(<StudioAtelierInkOpticalPanel onPresetChange={onPresetChange} />);
    fireEvent.click(screen.getByTestId("preset-card-cotton-watercolor-bloom"));
    expect(screen.getByTestId("preset-card-cotton-watercolor-bloom").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("atelier-ink-comparison-svg").getAttribute("data-preset-id")).toBe("cotton-watercolor-bloom");
    expect(screen.getByTestId("svg-capillary-backrun")).toBeTruthy();
    expect(onPresetChange).toHaveBeenCalledOnce();
    expect(onPresetChange.mock.calls[0]?.[0]?.id).toBe("cotton-watercolor-bloom");
  });

  it("6개 슬라이더 조작 시 수치 readout과 SVG 붓털·거칠기(0.14→0.78)가 실시간 갱신된다", () => {
    render(<StudioAtelierInkOpticalPanel initialPresetId="impasto-oil-knife" />);
    fireEvent.change(screen.getByTestId("slider-pressure"), { target: { value: "0.25" } });
    fireEvent.change(screen.getByTestId("slider-tilt"), { target: { value: "68" } });
    fireEvent.change(screen.getByTestId("slider-drying"), { target: { value: "0" } });
    expect(screen.getByTestId("atelier-ink-comparison-svg").getAttribute("data-roughness")).toBe("0.14");
    fireEvent.change(screen.getByTestId("slider-drying"), { target: { value: "1" } });
    expect(screen.getByTestId("atelier-ink-comparison-svg").getAttribute("data-roughness")).toBe("0.78");
    fireEvent.change(screen.getByTestId("slider-paper-roughness"), { target: { value: "0.95" } });
    fireEvent.change(screen.getByTestId("slider-bristle-count"), { target: { value: "24" } });
    fireEvent.change(screen.getByTestId("slider-impasto-thickness"), { target: { value: "2.4" } });

    expect(screen.getByTestId("slider-pressure-readout").textContent).toBe("25%");
    expect(screen.getByTestId("slider-tilt-readout").textContent).toBe("68°");
    expect(screen.getByTestId("slider-paper-roughness-readout").textContent).toBe("95%");
    expect(screen.getByTestId("slider-bristle-count-readout").textContent).toBe("24모");
    expect(screen.getByTestId("slider-impasto-thickness-readout").textContent).toBe("2.4 mm");
    expect(screen.getByTestId("svg-bristle-filaments").querySelectorAll("path")).toHaveLength(24);
  });

  it("프리셋 기본값 복원 버튼이 수정된 슬라이더를 원래 프리셋 기본값으로 되돌린다", () => {
    render(<StudioAtelierInkOpticalPanel initialPresetId="wax-crayon-grain" />);
    fireEvent.change(screen.getByTestId("slider-bristle-count"), { target: { value: "24" } });
    expect(screen.getByTestId("slider-bristle-count-readout").textContent).toBe("24모");
    fireEvent.click(screen.getByTestId("reset-atelier-ink-btn"));
    expect(screen.getByTestId("slider-bristle-count-readout").textContent).toBe("14모");
  });

  it("JSON 보기·WGSL 보기 토글 버튼으로 코드 미리보기를 전환하고 닫을 수 있다", () => {
    render(<StudioAtelierInkOpticalPanel />);
    expect(screen.queryByTestId("atelier-ink-code-preview")).toBeNull();
    fireEvent.click(screen.getByTestId("toggle-json-preview-btn"));
    expect(screen.getByTestId("atelier-ink-code-preview").getAttribute("data-preview-mode")).toBe("json");
    expect(screen.getByTestId("atelier-ink-code-preview").textContent).toContain("atelier-ink-optical/1.0");
    fireEvent.click(screen.getByTestId("toggle-wgsl-preview-btn"));
    expect(screen.getByTestId("atelier-ink-code-preview").getAttribute("data-preview-mode")).toBe("wgsl");
    expect(screen.getByTestId("atelier-ink-code-preview").textContent).toContain("atelier_ink_optical_main");
    fireEvent.click(screen.getByTestId("toggle-wgsl-preview-btn"));
    expect(screen.queryByTestId("atelier-ink-code-preview")).toBeNull();
  });

  it("JSON 내보내기·WGSL 복사 버튼이 클립보드와 onExportJson 콜백을 정확히 호출한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const onExportJson = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    render(<StudioAtelierInkOpticalPanel onExportJson={onExportJson} />);
    fireEvent.click(screen.getByTestId("export-atelier-ink-json-btn"));
    await waitFor(() => expect(screen.getByTestId("export-atelier-ink-json-btn").textContent).toContain("JSON 복사됨"));
    expect(onExportJson).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByTestId("copy-atelier-ink-wgsl-btn"));
    await waitFor(() => expect(screen.getByTestId("copy-atelier-ink-wgsl-btn").textContent).toContain("WGSL 복사됨"));
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(writeText.mock.calls[1]?.[0]).toContain("fn capsule_ribbon_sdf(");
    expect(onExportJson).toHaveBeenCalledOnce();
  });

  it("클립보드 거절·부재 시 role=alert 오류를 표시하고 성공을 가장하지 않으며 재시도를 허용한다", async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error("denied")).mockResolvedValueOnce(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<StudioAtelierInkOpticalPanel />);

    fireEvent.click(screen.getByTestId("export-atelier-ink-json-btn"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByTestId("export-atelier-ink-json-btn").textContent).not.toContain("JSON 복사됨");

    fireEvent.click(screen.getByTestId("export-atelier-ink-json-btn"));
    await waitFor(() => expect(screen.getByTestId("export-atelier-ink-json-btn").textContent).toContain("JSON 복사됨"));
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it("클립보드 대기 중 언마운트되면 onExportJson 콜백을 호출하지 않는다", async () => {
    let resolveCopy: (() => void) | undefined;
    const writeText = vi.fn(() => new Promise<void>((resolve) => { resolveCopy = resolve; }));
    const onExportJson = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    const view = render(<StudioAtelierInkOpticalPanel onExportJson={onExportJson} />);
    fireEvent.click(screen.getByTestId("export-atelier-ink-json-btn"));
    view.unmount();
    await act(async () => { resolveCopy?.(); });
    expect(onExportJson).not.toHaveBeenCalled();
  });

  it("4대 결함 진단 카드 4개와 5축 사실성 항목 5개, WGSL 정적 계약 요약을 모두 표시한다", () => {
    render(<StudioAtelierInkOpticalPanel />);
    for (const id of [1, 2, 3, 4]) {
      expect(screen.getByTestId(`root-cause-${id}`)).toBeTruthy();
    }
    for (const axis of ["ribbon-continuity", "dual-paper-grain", "optical-pigment-bristle", "wet-dry-roughness", "impasto-normal-relief"]) {
      expect(screen.getByTestId(`realism-axis-${axis}`)).toBeTruthy();
    }
    expect(screen.getByTestId("wgsl-contract-summary").textContent).toContain("96B");
    expect(screen.getByTestId("wgsl-contract-summary").textContent).toContain("32B");
  });
});

describe("8. 정적 하네스 · 파일 크기 · 색상 · 브랜드 순결성 계약", () => {
  const dir = path.dirname(new URL(import.meta.url).pathname);
  const engineSrc = readFileSync(path.join(dir, "atelier-ink-optical-engine.ts"), "utf8");
  const panelSrc = readFileSync(path.join(dir, "StudioAtelierInkOpticalPanel.tsx"), "utf8");
  const indexSrc = readFileSync(path.join(dir, "index.ts"), "utf8");
  const testSrc = readFileSync(path.join(dir, "atelier-ink-optical.test.tsx"), "utf8");

  it("4개 소유 파일이 모두 줄 수 상한을 준수한다(엔진<=740, 패널<=680, 전체<=800)", () => {
    expect(engineSrc.split("\n").length).toBeLessThanOrEqual(740);
    expect(panelSrc.split("\n").length).toBeLessThanOrEqual(680);
    expect(indexSrc.split("\n").length).toBeLessThanOrEqual(800);
    expect(testSrc.split("\n").length).toBeLessThanOrEqual(800);
  });

  it("엔진과 패널 소스에 원시 hex/rgb/hsl 색상이 0건이고 바이올렛 휴가 없다", () => {
    const prodSources = [engineSrc, panelSrc, indexSrc];
    for (const src of prodSources) {
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(src).not.toMatch(/\b(?:rgba?|hsla?)\s*\(/u);
    }
    const oklchMatches = [...`${engineSrc}\n${panelSrc}`.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)/gu)];
    for (const match of oklchMatches) {
      const hue = Number(match[1]);
      expect(isVioletHueDeg(hue)).toBe(false);
    }
  });

  it("금지 패턴(transition-all·스토리지·private Map store·BigInt·Sparkles·기본 빈 객체 props)이 0건이다", () => {
    for (const src of [engineSrc, panelSrc, indexSrc]) {
      expect(src).not.toMatch(/\btransition-all\b/u);
      expect(src).not.toMatch(/\b(?:localStorage|sessionStorage)\b/u);
      expect(src).not.toMatch(/\bprivate\s+\w*store\w*\s*[:=]\s*new\s+Map\b/iu);
      expect(src).not.toMatch(/\b0x[0-9a-fA-F]+n\b/u);
      expect(src).not.toMatch(/Sparkles/u);
    }
    expect(panelSrc).not.toMatch(/function\s+StudioAtelierInkOpticalPanel\s*\([^)]*=\s*\{\s*\}/u);
  });

  it("패널이 접근성·타이포 토큰(min-h-11, tabular-nums, word-break:keep-all)과 ToonStudio 고유 브랜드를 사용한다", () => {
    expect(panelSrc).toContain("min-h-11");
    expect(panelSrc).toContain("tabular-nums");
    expect(panelSrc).toContain("[word-break:keep-all]");
    expect(engineSrc).toContain("AtelierInk");
    expect(engineSrc).toContain("ToonCore");
    expect(engineSrc).toContain("SpectrumCompute");
  });
});
