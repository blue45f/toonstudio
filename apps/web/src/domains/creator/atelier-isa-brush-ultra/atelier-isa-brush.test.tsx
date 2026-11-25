// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import path from "node:path";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ARCHITECTURE_MODEL_KIND,
  ATELIER_INK_ULTRA_BRAND,
  ATELIER_ISA_BRUSH_SCHEMA_VERSION,
  CACHE_LINE_BYTES,
  CPU_ISA_KERNEL_MATRIX,
  CPU_ISA_PROFILES,
  DRY_MATTE_ROUGHNESS,
  F32_LANES_PER_CACHE_LINE,
  PAPER_FIBER_PROFILES,
  StudioAtelierIsaBrushUltraPanel,
  TOON_CORE_BRAND,
  TOON_SILICON_BRAND,
  WET_GLOSS_ROUGHNESS,
  alignToCacheLine64,
  alignToWebGpu256,
  buildDualTipBrushWgsl,
  compareStandardVsUltraBrush,
  computeSoaCacheLineLayout,
  evaluateUltraBrushOptics,
  exportAtelierIsaBrushJson,
  formatOklch,
  getCpuIsaProfile,
  getPaperFiberSpec,
  isVioletHueDeg,
  normalizeUltraBrushInput,
  resolveCpuIsaDispatchPlan,
  sanitizeNonVioletOklch,
  validateDualTipBrushWgsl,
  type CpuIsaProfileId,
  type DualTipBlendMode,
} from "./index";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ALL_DUAL_MODES: readonly DualTipBlendMode[] = ["multiply", "subtract", "height-clip", "color-dodge"];
const ALL_PROFILE_IDS: readonly CpuIsaProfileId[] = [
  "browser-portable-wasm-relaxed",
  "x86-intel-amx-avx512",
  "x86-amd-zen5-avx512",
  "arm64-apple-amx-sme",
  "arm64-snapdragon-sve2",
  "arm64-tensor-neon-i8mm",
];

describe("1. 브랜드 · 색상 · 입력 정규화 및 정렬 불변식", () => {
  it("ToonStudio 고유 브랜드와 architecture modelKind 상수가 정본으로 선언되어 있다", () => {
    expect(ATELIER_ISA_BRUSH_SCHEMA_VERSION).toBe("toonstudio.atelier-isa-brush-ultra.v1");
    expect(ATELIER_INK_ULTRA_BRAND).toBe("AtelierInk Ultra");
    expect(TOON_SILICON_BRAND).toBe("ToonSilicon");
    expect(TOON_CORE_BRAND).toBe("ToonCore");
    expect(ARCHITECTURE_MODEL_KIND).toBe("cpu-isa-and-brush-optics-architecture");
  });

  it("바이올렛 대역(265~325°) 경계값을 정확히 판정하고 안전 색상으로 치환한다", () => {
    expect(isVioletHueDeg(264.9)).toBe(false);
    expect(isVioletHueDeg(265)).toBe(true);
    expect(isVioletHueDeg(295)).toBe(true);
    expect(isVioletHueDeg(325)).toBe(true);
    expect(isVioletHueDeg(325.1)).toBe(false);

    const low = sanitizeNonVioletOklch({ l: 0.52, c: 0.14, h: 272 });
    const high = sanitizeNonVioletOklch({ l: 0.52, c: 0.14, h: 318 });
    expect(isVioletHueDeg(low.h)).toBe(false);
    expect(isVioletHueDeg(high.h)).toBe(false);
    expect(formatOklch(low, 0.8)).toMatch(/^oklch\(/u);
  });

  it("모든 종이 섬유 프로파일이 비바이올렛 OKLCH이며 방어적 사본을 반환한다", () => {
    expect(PAPER_FIBER_PROFILES).toHaveLength(4);
    for (const p of PAPER_FIBER_PROFILES) {
      expect(isVioletHueDeg(p.paperOklch.h)).toBe(false);
      expect(isVioletHueDeg(p.valleyOklch.h)).toBe(false);
    }
    const before = JSON.stringify(getPaperFiberSpec("hanji-mulberry"));
    const copy = getPaperFiberSpec("hanji-mulberry");
    Reflect.set(copy.paperOklch, "h", 300);
    expect(JSON.stringify(getPaperFiberSpec("hanji-mulberry"))).toBe(before);
  });

  it.each(["__proto__", "constructor", "unknown-id", ""])("미등록·프로토타입 키 %s를 RangeError로 차단한다", (bad) => {
    expect(() => Reflect.apply(getPaperFiberSpec, null, [bad])).toThrow(RangeError);
    expect(() => Reflect.apply(getCpuIsaProfile, null, [bad])).toThrow(RangeError);
  });

  it("normalizeUltraBrushInput은 NaN·무한대·초과값을 클램프하고 원본 객체를 보존한다", () => {
    const frozen = Object.freeze({
      pickupPct: 180,
      dilutionPct: -40,
      capillaryBleedPct: Number.NaN,
      strokeSpeedPxPerSec: Number.POSITIVE_INFINITY,
      tiltDeg: 140,
      dryingProgress: 3.5,
      impastoDepthMm: -2,
      bristleCount: 99,
      pressure: 0,
    });
    const norm = normalizeUltraBrushInput(frozen);
    expect(norm.clamped).toBe(true);
    expect(norm.pickupPct).toBe(100);
    expect(norm.dilutionPct).toBe(0);
    expect(norm.tiltDeg).toBe(75);
    expect(norm.dryingProgress).toBe(1);
    expect(norm.impastoDepthMm).toBe(0);
    expect(norm.bristleCount).toBe(24);
    expect(norm.pressure).toBe(0.05);
    expect(Number.isNaN(frozen.capillaryBleedPct)).toBe(true);
  });

  it("alignToCacheLine64와 alignToWebGpu256이 정확한 바이트 경계 정렬을 반환한다", () => {
    expect(alignToCacheLine64(0)).toBe(64);
    expect(alignToCacheLine64(64)).toBe(64);
    expect(alignToCacheLine64(96)).toBe(128);
    expect(alignToCacheLine64(129)).toBe(192);
    expect(alignToWebGpu256(96)).toBe(256);
    expect(alignToWebGpu256(256)).toBe(256);
    expect(alignToWebGpu256(257)).toBe(512);
  });
});

describe("2. 1단계 — 듀얼 팁 4종 광학 결합(dual-tip-modulation)", () => {
  it("4종 결합 모드(multiply·subtract·height-clip·color-dodge)가 서로 다른 변조 프로파일을 산출한다", () => {
    const signatures = ALL_DUAL_MODES.map((mode) => {
      const r = evaluateUltraBrushOptics({ dualTipMode: mode, pressure: 0.52, secondaryContrast: 0.78 });
      expect(r.dualTip.stageId).toBe("dual-tip-modulation");
      return r.dualTip.samples.map((s) => s.modulated).join(",");
    });
    expect(new Set(signatures).size).toBe(4);
  });

  it("height-clip 모드에서 필압이 낮을수록 종이 골짜기 공극이 커지고 피복률이 줄어든다", () => {
    const light = evaluateUltraBrushOptics({ dualTipMode: "height-clip", pressure: 0.2, secondaryContrast: 0.8 });
    const heavy = evaluateUltraBrushOptics({ dualTipMode: "height-clip", pressure: 0.92, secondaryContrast: 0.8 });
    expect(light.dualTip.valleyVoidRatio).toBeGreaterThan(heavy.dualTip.valleyVoidRatio);
    expect(light.dualTip.effectiveCoverage).toBeLessThan(heavy.dualTip.effectiveCoverage);
  });

  it("color-dodge 모드는 subtract 모드보다 높은 평균 피복률과 하이라이트 투과를 만든다", () => {
    const dodge = evaluateUltraBrushOptics({ dualTipMode: "color-dodge", secondaryContrast: 0.75 });
    const sub = evaluateUltraBrushOptics({ dualTipMode: "subtract", secondaryContrast: 0.75 });
    expect(dodge.dualTip.effectiveCoverage).toBeGreaterThan(sub.dualTip.effectiveCoverage);
    expect(dodge.dualTip.peakHighlightRatio).toBeGreaterThanOrEqual(sub.dualTip.peakHighlightRatio);
  });

  it("회전 지터가 충분히 적용되면 패턴 반복률이 0%로 수렴해 구형 스탬프(86%)를 압도한다", () => {
    const rotated = evaluateUltraBrushOptics({ secondaryRotationJitterDeg: 137.5 });
    const staticTip = evaluateUltraBrushOptics({ secondaryRotationJitterDeg: 0 });
    expect(rotated.dualTip.patternRepeatRate).toBe(0);
    expect(rotated.dualTip.patternRepeatRate).toBeLessThan(staticTip.dualTip.patternRepeatRate);
    expect(rotated.dualTip.legacyStampRepeatRate).toBe(0.86);
  });

  it("multiply 모드에서 보조 팁 대비 증가 시 평균 변조 폭이 커진다", () => {
    const soft = evaluateUltraBrushOptics({ dualTipMode: "multiply", secondaryContrast: 0.15 });
    const strong = evaluateUltraBrushOptics({ dualTipMode: "multiply", secondaryContrast: 0.95 });
    const spread = (arr: readonly number[]) => Math.max(...arr) - Math.min(...arr);
    expect(spread(strong.dualTip.samples.map((s) => s.modulated))).toBeGreaterThan(
      spread(soft.dualTip.samples.map((s) => s.modulated)),
    );
  });

  it("12개 듀얼 팁 샘플이 모두 [0, 1] 범위 유한수 불변식을 만족한다", () => {
    for (const mode of ALL_DUAL_MODES) {
      const r = evaluateUltraBrushOptics({ dualTipMode: mode });
      expect(r.dualTip.samples).toHaveLength(12);
      for (const s of r.dualTip.samples) {
        expect(Number.isFinite(s.modulated)).toBe(true);
        expect(s.modulated).toBeGreaterThanOrEqual(0);
        expect(s.modulated).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("3. 2단계 — 더티 브러시 캔버스 안료 픽업(dirty-brush-pickup)", () => {
  it("pickupPct = 0이면 바닥 캔버스 전이율이 0%이고 전 구간 브러시 본색을 유지한다", () => {
    const r = evaluateUltraBrushOptics({ pickupPct: 0, dilutionPct: 0 });
    expect(r.dirtyPickup.stageId).toBe("dirty-brush-pickup");
    expect(r.dirtyPickup.canvasTransferRatio).toBe(0);
    for (const step of r.dirtyPickup.trailSamples) {
      expect(step.canvasShare).toBe(0);
      expect(step.blendedOklch.h).toBe(r.dirtyPickup.brushPigmentOklch.h);
    }
  });

  it("pickupPct가 0 → 45 → 95%로 높아질수록 바닥 안료 전이율이 단조 증가한다", () => {
    const low = evaluateUltraBrushOptics({ pickupPct: 0 });
    const mid = evaluateUltraBrushOptics({ pickupPct: 45 });
    const high = evaluateUltraBrushOptics({ pickupPct: 95 });
    expect(low.dirtyPickup.canvasTransferRatio).toBeLessThan(mid.dirtyPickup.canvasTransferRatio);
    expect(mid.dirtyPickup.canvasTransferRatio).toBeLessThan(high.dirtyPickup.canvasTransferRatio);
    expect(high.dirtyPickup.finalMixedOklch.h).not.toBe(low.dirtyPickup.finalMixedOklch.h);
  });

  it("8단계 획 궤적에서 t = 0 → 1 진행 시 바닥 색 픽업 비율이 매끄럽게 증가한다", () => {
    const r = evaluateUltraBrushOptics({ pickupPct: 70 });
    expect(r.dirtyPickup.trailSamples).toHaveLength(8);
    for (let i = 1; i < r.dirtyPickup.trailSamples.length; i += 1) {
      const prev = r.dirtyPickup.trailSamples[i - 1];
      const curr = r.dirtyPickup.trailSamples[i];
      expect(curr?.canvasShare).toBeGreaterThanOrEqual(prev?.canvasShare ?? 0);
    }
  });

  it("dilutionPct가 높아질수록 불투명도는 단조 감소하고 투명 글레이징 비율이 상승한다", () => {
    const opaque = evaluateUltraBrushOptics({ dilutionPct: 0 });
    const mid = evaluateUltraBrushOptics({ dilutionPct: 45 });
    const wash = evaluateUltraBrushOptics({ dilutionPct: 90 });
    expect(opaque.dirtyPickup.effectiveOpacity).toBeGreaterThan(mid.dirtyPickup.effectiveOpacity);
    expect(mid.dirtyPickup.effectiveOpacity).toBeGreaterThan(wash.dirtyPickup.effectiveOpacity);
    expect(wash.dirtyPickup.washTransparency).toBeGreaterThan(opaque.dirtyPickup.washTransparency);
  });

  it("보색·고채도 픽업 조합에서도 바이올렛(265~325°) 침범 없이 채도를 보존한다", () => {
    const r = evaluateUltraBrushOptics({
      pickupPct: 60,
      dilutionPct: 20,
      brushPigmentOklch: { l: 0.5, c: 0.18, h: 240 },
      canvasUnderColorOklch: { l: 0.54, c: 0.18, h: 350 },
    });
    for (const s of r.dirtyPickup.trailSamples) {
      expect(isVioletHueDeg(s.blendedOklch.h)).toBe(false);
    }
    expect(r.dirtyPickup.chromaRetention).toBeGreaterThanOrEqual(0.35);
  });

  it("극단치(pickup 100%, dilution 100%)에서도 최소 불투명도 하한과 유한수를 유지한다", () => {
    const r = evaluateUltraBrushOptics({ pickupPct: 100, dilutionPct: 100 });
    expect(r.dirtyPickup.effectiveOpacity).toBeGreaterThanOrEqual(0.14);
    expect(Number.isFinite(r.dirtyPickup.gradientSmoothness)).toBe(true);
  });
});

describe("4. 3단계 — 모세관 종이 섬유 번짐 & 수채 백런 풀링(capillary-fiber-bleed)", () => {
  it("전주 한지가 코튼 수채지보다 현저히 높은 섬유 이방성 비율을 나타낸다", () => {
    const hanji = evaluateUltraBrushOptics({ paperFiberId: "hanji-mulberry", capillaryBleedPct: 70 });
    const cotton = evaluateUltraBrushOptics({ paperFiberId: "cotton-coldpress-300", capillaryBleedPct: 70 });
    expect(hanji.capillaryBleed.stageId).toBe("capillary-fiber-bleed");
    expect(hanji.capillaryBleed.anisotropyRatio).toBeGreaterThan(cotton.capillaryBleed.anisotropyRatio);
  });

  it("이방성이 클수록 섬유 평행 방향 번짐(parallel)이 수직 방향(perpendicular)을 상회한다", () => {
    const r = evaluateUltraBrushOptics({ paperFiberId: "hanji-mulberry", capillaryBleedPct: 80, fiberAnisotropy: 0.85 });
    expect(r.capillaryBleed.parallelBleedMm).toBeGreaterThan(r.capillaryBleed.perpendicularBleedMm);
  });

  it("습윤 상태와 높은 번짐 강도에서 수채 테두리 백런 안료 링과 가장자리 농축이 강화된다", () => {
    const wet = evaluateUltraBrushOptics({ paperFiberId: "cotton-coldpress-300", capillaryBleedPct: 88, dryingProgress: 0.05 });
    const dry = evaluateUltraBrushOptics({ paperFiberId: "cotton-coldpress-300", capillaryBleedPct: 20, dryingProgress: 0.92 });
    expect(wet.capillaryBleed.backrunRingWidthPx).toBeGreaterThan(dry.capillaryBleed.backrunRingWidthPx);
    expect(wet.capillaryBleed.edgePigmentConcentration).toBeGreaterThan(1.1);
  });

  it("capillaryBleedPct = 0이면 번짐과 백런 링이 0으로 정지한다", () => {
    const r = evaluateUltraBrushOptics({ capillaryBleedPct: 0 });
    expect(r.capillaryBleed.parallelBleedMm).toBe(0);
    expect(r.capillaryBleed.backrunRingWidthPx).toBe(0);
    expect(r.capillaryBleed.edgePigmentConcentration).toBe(1);
  });

  it("한지 8방향 모세관 벡터에서 섬유축(0°·180°) 도달 거리가 직교축(90°·270°)보다 길다", () => {
    const r = evaluateUltraBrushOptics({ paperFiberId: "hanji-mulberry", capillaryBleedPct: 75 });
    const v0 = r.capillaryBleed.seepageVectors.find((v) => v.angleDeg === 0);
    const v90 = r.capillaryBleed.seepageVectors.find((v) => v.angleDeg === 90);
    expect(r.capillaryBleed.seepageVectors).toHaveLength(8);
    expect(v0?.reachPx).toBeGreaterThan(v90?.reachPx ?? 0);
  });
});

describe("5. 4~5단계 — 동적 강모 갈라짐·임파스토 광택 및 5축 실물 화구 비교기", () => {
  it("저속·수직 필기에서는 임계치 미만으로 단일 통합 붓모(1갈래)를 유지한다", () => {
    const slow = evaluateUltraBrushOptics({ strokeSpeedPxPerSec: 160, tiltDeg: 5, pressure: 0.9, forkSensitivity: 0.4 });
    expect(slow.bristleForking.stageId).toBe("bristle-forking-impasto");
    expect(slow.bristleForking.forkThresholdExceeded).toBe(false);
    expect(slow.bristleForking.forkClusterCount).toBe(1);
    expect(slow.bristleForking.forkClusters).toHaveLength(1);
  });

  it("속도·기울기 임계치 초과 시 붓모가 2~4갈래 갈필로 자연 분기한다", () => {
    const medium = evaluateUltraBrushOptics({ strokeSpeedPxPerSec: 1050, tiltDeg: 35, pressure: 0.45, forkSensitivity: 0.75 });
    const extreme = evaluateUltraBrushOptics({ strokeSpeedPxPerSec: 2300, tiltDeg: 70, pressure: 0.25, forkSensitivity: 1 });
    expect(medium.bristleForking.forkThresholdExceeded).toBe(true);
    expect(medium.bristleForking.forkClusterCount).toBeGreaterThanOrEqual(2);
    expect(extreme.bristleForking.forkClusterCount).toBe(4);
    expect(extreme.bristleForking.forkClusters).toHaveLength(4);
  });

  it("건조 진행도 0 → 1 변화 시 표면 거칠기가 젖은 광택(0.14)에서 건조 매트(0.80)로 전이한다", () => {
    const wet = evaluateUltraBrushOptics({ dryingProgress: 0 });
    const mid = evaluateUltraBrushOptics({ dryingProgress: 0.5 });
    const dry = evaluateUltraBrushOptics({ dryingProgress: 1 });
    expect(wet.bristleForking.surfaceRoughness).toBe(WET_GLOSS_ROUGHNESS);
    expect(dry.bristleForking.surfaceRoughness).toBe(DRY_MATTE_ROUGHNESS);
    expect(mid.bristleForking.surfaceRoughness).toBeGreaterThan(wet.bristleForking.surfaceRoughness);
    expect(mid.bristleForking.surfaceRoughness).toBeLessThan(dry.bristleForking.surfaceRoughness);
    expect(wet.bristleForking.wetGlossIntensity).toBe(1);
    expect(dry.bristleForking.wetGlossIntensity).toBe(0);
  });

  it("임파스토 두께가 두꺼울수록 골짜기 광택과 Sobel 능선 대비가 증가한다", () => {
    const flat = evaluateUltraBrushOptics({ impastoDepthMm: 0.1, dryingProgress: 0.2 });
    const thick = evaluateUltraBrushOptics({ impastoDepthMm: 2.2, dryingProgress: 0.2 });
    expect(thick.bristleForking.ridgeSobelContrast).toBeGreaterThan(flat.bristleForking.ridgeSobelContrast);
    expect(thick.bristleForking.valleySpecularSheen).toBeGreaterThan(flat.bristleForking.valleySpecularSheen);
  });

  it("compareStandardVsUltraBrush가 5축 전 항목에서 단일 스탬프 대비 결정론적 우위를 산출한다", () => {
    const comp = compareStandardVsUltraBrush();
    expect(comp.modelKind).toBe(ARCHITECTURE_MODEL_KIND);
    expect(comp.axes).toHaveLength(5);
    expect(comp.axes.map((a) => a.id)).toEqual([
      "stroke-continuity",
      "paper-response",
      "pickup-naturalness",
      "dry-fork-detail",
      "impasto-sheen",
    ]);
    for (const axis of comp.axes) {
      expect(axis.ultraScore).toBeGreaterThan(axis.standardScore);
      expect(axis.delta).toBe(axis.ultraScore - axis.standardScore);
    }
    expect(comp.overallDelta).toBeGreaterThan(40);
  });

  it("evaluateUltraBrushOptics는 동일 입력에 대해 100% 결정론적 출력을 보장한다", () => {
    const a = evaluateUltraBrushOptics({ dualTipMode: "subtract", pickupPct: 64, strokeSpeedPxPerSec: 1500 });
    const b = evaluateUltraBrushOptics({ dualTipMode: "subtract", pickupPct: 64, strokeSpeedPxPerSec: 1500 });
    expect(a).toEqual(b);
  });
});

describe("6. ToonSilicon 최신 CPU ISA 6대 프로파일 × 브라우저/네이티브 경계 & 64B SoA 정렬", () => {
  it("6대 CPU ISA 프로파일(Intel·AMD·Apple·Snapdragon·Tensor·WASM)이 정본 등록되어 있다", () => {
    expect(CPU_ISA_PROFILES).toHaveLength(6);
    expect(CPU_ISA_PROFILES.map((p) => p.id)).toEqual(ALL_PROFILE_IDS);
  });

  it("ToonStudio 6대 핵심 커널(KM16·24모·Hi-Z·INT8 NPU·RLE-Delta·600DPI)이 매트릭스에 매핑되어 있다", () => {
    expect(CPU_ISA_KERNEL_MATRIX).toHaveLength(6);
    expect(CPU_ISA_KERNEL_MATRIX.map((k) => k.id)).toEqual([
      "km16-spectral-mix",
      "bristle-24-integrator",
      "hiz-4wide-culling",
      "int8-npu-assist-infer",
      "rle-delta-tile-compress",
      "ribbon-600dpi-raster",
    ]);
  });

  it("브라우저 웹 표준 경계에서는 6대 프로파일 모두 WASM Relaxed-SIMD(128-bit) 즉시 실행으로 디스패치된다", () => {
    for (const id of ALL_PROFILE_IDS) {
      const plan = resolveCpuIsaDispatchPlan({ profileId: id, executionBoundary: "browser-web-standard" });
      expect(plan.modelKind).toBe(ARCHITECTURE_MODEL_KIND);
      expect(plan.activeBoundary).toBe("browser-web-standard");
      expect(plan.nativeBridgeRequired).toBe(false);
      expect(plan.activeWasmStack).toContain("WASM SIMD128");
      expect(plan.activeWasmStack).toContain("WASM Relaxed-SIMD");
      expect(plan.activeWasmStack).toContain("WASM64 (Memory64)");
      expect(plan.activeWasmStack).toContain("SharedArrayBuffer + Atomics.waitAsync");
      const km16 = plan.kernelDispatches.find((k) => k.kernelId === "km16-spectral-mix");
      const npu = plan.kernelDispatches.find((k) => k.kernelId === "int8-npu-assist-infer");
      expect(km16?.activeInstructions).toContain("f32x4.relaxed_madd");
      expect(npu?.activeInstructions).toContain("i32x4.relaxed_dot_i8x16_i7x16_add_s");
      expect(km16?.vectorLaneWidthF32).toBe(4);
      expect(km16?.vectorLaneWidthI8).toBe(16);
    }
  });

  it("네이티브 FFI 브리지 경계에서 x86-64는 AVX-512/AMX/VNNI(16×f32), ARM64는 AMX/SME/SVE2/I8MM으로 분기된다", () => {
    const intel = resolveCpuIsaDispatchPlan({ profileId: "x86-intel-amx-avx512", executionBoundary: "native-ffi-bridge" });
    const zen5 = resolveCpuIsaDispatchPlan({ profileId: "x86-amd-zen5-avx512", executionBoundary: "native-ffi-bridge" });
    const apple = resolveCpuIsaDispatchPlan({ profileId: "arm64-apple-amx-sme", executionBoundary: "native-ffi-bridge" });
    const snap = resolveCpuIsaDispatchPlan({ profileId: "arm64-snapdragon-sve2", executionBoundary: "native-ffi-bridge" });

    expect(intel.nativeBridgeRequired).toBe(true);
    expect(intel.kernelDispatches.find((k) => k.kernelId === "int8-npu-assist-infer")?.activeInstructions).toContain("Intel AMX (TMUL INT8)");
    expect(intel.kernelDispatches[0]?.vectorLaneWidthF32).toBe(16);
    expect(zen5.kernelDispatches.find((k) => k.kernelId === "ribbon-600dpi-raster")?.activeInstructions).toContain("AMD Zen5 512-bit SIMD");
    expect(apple.kernelDispatches.find((k) => k.kernelId === "km16-spectral-mix")?.activeInstructions).toContain("Apple AMX / ARMv9 SME");
    expect(snap.kernelDispatches.find((k) => k.kernelId === "int8-npu-assist-infer")?.activeInstructions).toContain("ARM I8MM (SMMLA)");
    expect(snap.kernelDispatches[0]?.vectorLaneWidthF32).toBe(8);
  });

  it("browser-portable-wasm-relaxed 프로파일은 네이티브 경계 요청 시에도 browser-web-standard로 정직 고정한다", () => {
    const plan = resolveCpuIsaDispatchPlan({
      profileId: "browser-portable-wasm-relaxed",
      executionBoundary: "native-ffi-bridge",
    });
    expect(plan.activeBoundary).toBe("browser-web-standard");
    expect(plan.nativeBridgeRequired).toBe(false);
  });

  it("브라우저 Memory64·SharedArrayBuffer 미지원 시 안전한 WASM32·Transferable 폴백을 선택한다", () => {
    const plan = resolveCpuIsaDispatchPlan({
      profileId: "arm64-tensor-neon-i8mm",
      browserCapabilities: { memory64: false, sharedArrayBuffer: false, atomicsWaitAsync: false, hardwareConcurrency: 4 },
    });
    expect(plan.memoryAddressingMode).toBe("wasm32-tiled-fallback");
    expect(plan.threadSyncMode).toBe("transferable-worker-fallback");
    expect(plan.workerPoolSlots).toBe(3);
  });

  it("computeSoaCacheLineLayout이 8~24모 전 범위에서 64B 캐시라인 정렬 불변식을 만족한다", () => {
    for (const count of [8, 12, 16, 20, 24]) {
      const layout = computeSoaCacheLineLayout(count);
      expect(layout.cacheLineBytes).toBe(CACHE_LINE_BYTES);
      expect(layout.f32LanesPerCacheLine).toBe(F32_LANES_PER_CACHE_LINE);
      expect(layout.allAlignedTo64B).toBe(true);
      expect(layout.totalBytes % 64).toBe(0);
      for (const ch of layout.channels) {
        expect(ch.byteStride % 64).toBe(0);
        expect(ch.alignedTo64B).toBe(true);
      }
    }
    const b24 = computeSoaCacheLineLayout(24);
    const posX = b24.channels.find((c) => c.channelName === "bristle_pos_x_f32");
    expect(posX?.paddedElements).toBe(32);
    expect(posX?.byteStride).toBe(128);
    expect(posX?.cacheLines).toBe(2);
  });

  it("exportAtelierIsaBrushJson은 modelKind 정본을 담고 허위 배수·GFLOPS 주장이 0건이다", () => {
    const bundle = exportAtelierIsaBrushJson({ profileId: "x86-intel-amx-avx512", executionBoundary: "native-ffi-bridge" });
    const parsed = JSON.parse(bundle.json) as { modelKind: string; brands: { brush: string; silicon: string; runtime: string } };
    expect(parsed.modelKind).toBe(ARCHITECTURE_MODEL_KIND);
    expect(parsed.brands.brush).toBe(ATELIER_INK_ULTRA_BRAND);
    expect(parsed.brands.silicon).toBe(TOON_SILICON_BRAND);
    expect(parsed.brands.runtime).toBe(TOON_CORE_BRAND);
    expect(bundle.json).not.toMatch(/\b\d+(?:\.\d+)?\s*(?:GFLOPS|TFLOPS|TOPS)\b/iu);
    expect(bundle.json).not.toMatch(/\b\d+(?:\.\d+)?x\s*faster\b/iu);
  });
});

describe("7. WGSL 듀얼팁 컴퓨트 셰이더 문법 및 정적 계약 검증", () => {
  it("4종 듀얼팁 모드 각각 생성된 WGSL이 정적 계약 검증을 통과한다", () => {
    for (const mode of ALL_DUAL_MODES) {
      const wgsl = buildDualTipBrushWgsl({ dualTipMode: mode });
      const check = validateDualTipBrushWgsl(wgsl);
      expect(check.valid).toBe(true);
      expect(check.gpuCompiled).toBe(false);
      expect(check.allFourDualTipModesPresent).toBe(true);
      expect(check.reservedKeywordHits).toEqual([]);
      expect(check.errors).toEqual([]);
    }
  });

  it("WGSL 구조체가 16B 정렬(Uniform 96B · Fork 16B)과 256B 동적 스트라이드를 만족한다", () => {
    const check = validateDualTipBrushWgsl(buildDualTipBrushWgsl());
    expect(check.entryPoint).toBe("atelier_ultra_dual_tip_main");
    expect(check.workgroupSize).toEqual([16, 16, 1]);
    expect(check.uniformStructBytes).toBe(96);
    expect(check.uniformAlignedStrideBytes).toBe(256);
    expect(check.forkStructBytes).toBe(16);
    expect(check.bindingCount).toBe(6);
  });

  it("WGSL 소스가 듀얼팁·더티픽업·모세관·강모갈라짐 4대 함수와 컴퓨트 안전 샘플링을 포함한다", () => {
    const wgsl = buildDualTipBrushWgsl();
    expect(wgsl).toContain("fn dual_tip_modulate(");
    expect(wgsl).toContain("fn dirty_canvas_pickup(");
    expect(wgsl).toContain("fn capillary_fiber_bleed(");
    expect(wgsl).toContain("fn bristle_fork_and_sheen(");
    expect(wgsl).toContain("textureSampleLevel(");
    expect(wgsl).not.toMatch(/\btextureSample\s*\(/u);
    expect(wgsl).toContain("textureStore(");
  });

  it("예약어 충돌·불균형 괄호·비안전 샘플링 WGSL을 정확히 실패 판정한다", () => {
    const broken = `
      struct UltraDualTipUniforms { a: f32 };
      @compute @workgroup_size(8, 8, 1)
      fn bad_main() {
        let filter = textureSample(t, s, vec2<f32>(0.0, 0.0));
    `;
    const check = validateDualTipBrushWgsl(broken);
    expect(check.valid).toBe(false);
    expect(check.reservedKeywordHits).toContain("filter");
    expect(check.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("8. StudioAtelierIsaBrushUltraPanel UI 인터랙션 · 접근성 · 클립보드", () => {
  it("props 없이 안전 렌더링되고 초근접 비교 SVG · 64B SoA SVG · 5축 비교 · 6커널 테이블을 표시한다", () => {
    render(<StudioAtelierIsaBrushUltraPanel />);
    expect(screen.getByTestId("studio-atelier-isa-brush-ultra-panel")).toBeTruthy();
    expect(screen.getByTestId("ultra-brush-closeup-svg")).toBeTruthy();
    expect(screen.getByTestId("soa-cacheline-svg").getAttribute("data-aligned-64b")).toBe("true");
    expect(screen.getByTestId("comparison-axis-stroke-continuity")).toBeTruthy();
    expect(screen.getByTestId("comparison-axis-impasto-sheen")).toBeTruthy();
    expect(screen.getByTestId("kernel-row-km16-spectral-mix")).toBeTruthy();
    expect(screen.getByTestId("kernel-row-ribbon-600dpi-raster")).toBeTruthy();
  });

  it("듀얼팁 4종 버튼 클릭 시 aria-pressed · SVG 모드 속성이 갱신되고 onOpticsChange가 호출된다", () => {
    const onOpticsChange = vi.fn();
    render(<StudioAtelierIsaBrushUltraPanel onOpticsChange={onOpticsChange} />);

    fireEvent.click(screen.getByTestId("dual-tip-mode-color-dodge"));
    expect(screen.getByTestId("dual-tip-mode-color-dodge").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("ultra-brush-closeup-svg").getAttribute("data-dual-tip-mode")).toBe("color-dodge");
    expect(onOpticsChange).toHaveBeenCalledOnce();
  });

  it("슬라이더 조작 시 더티 픽업·강모 갈라짐 갈래 수가 실시간 반응하고 기본값 복원이 동작한다", () => {
    render(<StudioAtelierIsaBrushUltraPanel />);
    fireEvent.change(screen.getByTestId("slider-dirty-pickup"), { target: { value: "88" } });
    expect(screen.getByTestId("ultra-brush-closeup-svg").getAttribute("data-pickup-pct")).toBe("88");

    fireEvent.change(screen.getByTestId("slider-stroke-speed"), { target: { value: "2320" } });
    fireEvent.change(screen.getByTestId("slider-stylus-tilt"), { target: { value: "72" } });
    expect(Number(screen.getByTestId("ultra-brush-closeup-svg").getAttribute("data-fork-clusters"))).toBeGreaterThanOrEqual(3);

    fireEvent.click(screen.getByTestId("reset-ultra-brush-btn"));
    expect(screen.getByTestId("ultra-brush-closeup-svg").getAttribute("data-pickup-pct")).toBe("52");
  });

  it("CPU 아키텍처 스위처와 브라우저/네이티브 경계 토글이 배지·ISA 시퀀스를 즉시 전환한다", () => {
    const onProfileChange = vi.fn();
    render(<StudioAtelierIsaBrushUltraPanel onProfileChange={onProfileChange} />);

    expect(screen.getByTestId("execution-boundary-badge").textContent).toContain("브라우저 즉시 실행");
    expect(screen.getByTestId("kernel-row-km16-spectral-mix").textContent).toContain("f32x4.relaxed_madd");

    fireEvent.click(screen.getByTestId("isa-profile-arm64-apple-amx-sme"));
    fireEvent.click(screen.getByTestId("boundary-native-btn"));
    expect(screen.getByTestId("execution-boundary-badge").textContent).toContain("네이티브 FFI 브리지");
    expect(screen.getByTestId("kernel-row-km16-spectral-mix").textContent).toContain("Apple AMX / ARMv9 SME");
    expect(onProfileChange).toHaveBeenCalledTimes(2);
  });

  it("WGSL 접기(<details>)와 JSON/WGSL 복사 버튼이 클립보드 및 onExportJson을 정확히 호출한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const onExportJson = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    render(<StudioAtelierIsaBrushUltraPanel onExportJson={onExportJson} />);
    expect(screen.getByTestId("wgsl-shader-details").tagName).toBe("DETAILS");
    expect(screen.getByTestId("wgsl-static-badge").textContent).toContain("Static PASS");

    fireEvent.click(screen.getByTestId("copy-ultra-json-btn"));
    await waitFor(() => expect(screen.getByTestId("copy-ultra-json-btn").textContent).toContain("JSON 복사됨"));
    expect(onExportJson).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByTestId("copy-ultra-wgsl-btn"));
    await waitFor(() => expect(screen.getByTestId("copy-ultra-wgsl-btn").textContent).toContain("WGSL 복사됨"));
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(writeText.mock.calls[1]?.[0]).toContain("fn dual_tip_modulate(");
  });

  it("클립보드 거절 시 role=alert 오류를 표시하고 재시도 및 언마운트 가드를 준수한다", async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error("denied")).mockResolvedValueOnce(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    const { unmount } = render(<StudioAtelierIsaBrushUltraPanel />);
    fireEvent.click(screen.getByTestId("copy-ultra-json-btn"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());

    fireEvent.click(screen.getByTestId("copy-ultra-json-btn"));
    await waitFor(() => expect(screen.getByTestId("copy-ultra-json-btn").textContent).toContain("JSON 복사됨"));
    unmount();

    let resolveLate: (() => void) | undefined;
    const lateWrite = vi.fn(() => new Promise<void>((resolve) => { resolveLate = resolve; }));
    const lateCallback = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText: lateWrite } });

    const view = render(<StudioAtelierIsaBrushUltraPanel onExportJson={lateCallback} />);
    fireEvent.click(screen.getByTestId("copy-ultra-json-btn"));
    view.unmount();
    await act(async () => { resolveLate?.(); });
    expect(lateCallback).not.toHaveBeenCalled();
  });
});

describe("9. 정적 하네스 · 파일 크기 · 디자인 토큰 · 고유 브랜드 청정 계약", () => {
  const dir = path.dirname(new URL(import.meta.url).pathname);
  const engineSrc = readFileSync(path.join(dir, "atelier-isa-brush-engine.ts"), "utf8");
  const panelSrc = readFileSync(path.join(dir, "StudioAtelierIsaBrushUltraPanel.tsx"), "utf8");
  const indexSrc = readFileSync(path.join(dir, "index.ts"), "utf8");
  const testSrc = readFileSync(path.join(dir, "atelier-isa-brush.test.tsx"), "utf8");

  it("소유 파일 4개가 모두 지정 줄 수 상한을 준수한다(엔진<=740 · 패널<=680 · 배럴<=80 · 테스트<=740)", () => {
    expect(engineSrc.split("\n").length).toBeLessThanOrEqual(740);
    expect(panelSrc.split("\n").length).toBeLessThanOrEqual(680);
    expect(indexSrc.split("\n").length).toBeLessThanOrEqual(80);
    expect(testSrc.split("\n").length).toBeLessThanOrEqual(740);
  });

  it("원시 hex/rgb/hsl 0건, 바이올렛(265~325°) 0%, 금지 패턴(transition-all·Sparkles·Storage·= {}) 0건이다", () => {
    const prodSources = [engineSrc, panelSrc, indexSrc];
    for (const src of prodSources) {
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(src).not.toMatch(/\b(?:rgba?|hsla?)\s*\(/u);
      expect(src).not.toMatch(/\btransition-all\b/u);
      expect(src).not.toMatch(/Sparkles/u);
      expect(src).not.toMatch(/\b(?:localStorage|sessionStorage)\b/u);
      expect(src).not.toMatch(/\b0x[0-9a-fA-F]+n\b/u);
    }
    expect(panelSrc).not.toMatch(/function\s+StudioAtelierIsaBrushUltraPanel\s*\([^)]*=\s*\{\s*\}/u);

    const oklchMatches = [...`${engineSrc}\n${panelSrc}`.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)/gu)];
    expect(oklchMatches.length).toBeGreaterThan(0);
    for (const m of oklchMatches) {
      expect(isVioletHueDeg(Number(m[1]))).toBe(false);
    }
  });

  it("100% ToonStudio 고유 브랜드와 접근성 토큰을 사용하고 외부 경쟁 소프트웨어 브랜드명이 0건이다", () => {
    const allProd = `${engineSrc}\n${panelSrc}\n${indexSrc}`;
    expect(allProd).toContain("AtelierInk Ultra");
    expect(allProd).toContain("ToonSilicon");
    expect(allProd).toContain("ToonCore");
    expect(panelSrc).toContain("min-h-11");
    expect(panelSrc).toContain("tabular-nums");
    expect(panelSrc).toContain("[word-break:keep-all]");
    expect(panelSrc).toContain("motion-reduce:transition-none");

    // 외부 경쟁 소프트웨어 브랜드 토큰 조합 검증 (소스에 직접 리터럴 미기재)
    const bannedTokens = [
      ["pro", "create"].join(""),
      ["photo", "shop"].join(""),
      ["clip", "studio"].join(""),
      ["re", "belle"].join(""),
      ["shapr", "3d"].join(""),
      ["vel", "lo"].join(""),
      ["hoku", "sai"].join(""),
      ["sk", "ia"].join(""),
      ["thor", "vg"].join(""),
      ["blen", "der"].join(""),
      ["mag", "ma"].join(""),
    ];
    const lower = allProd.toLowerCase();
    for (const token of bannedTokens) {
      expect(lower).not.toContain(token);
    }
  });
});
