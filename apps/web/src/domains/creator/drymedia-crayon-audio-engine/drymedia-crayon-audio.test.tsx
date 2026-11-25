// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DRYMEDIA_BRUSH_PRESETS,
  DRYMEDIA_PAPER_SUBSTRATES,
  DUAL_SCALE_GRAIN_TILE_SIZE,
  EXTRA_GPU_BUDGET_MS,
  FOLEY_LIMITER_CEILING_LUFS,
  FRAME_BUDGET_120HZ_MS,
  MAX_SUMI_BRISTLE_STRANDS,
  MAX_TILT_WIDTH_MULTIPLIER,
  MIN_SUMI_BRISTLE_STRANDS,
  SHADER_THRESHOLD_INSTRUCTIONS,
  StudioDryMediaCrayonAudioPanel,
  TILT_BROADSIDE_THRESHOLD_DEG,
  applyDryMediaLabPreview,
  bakeDualScalePaperGrainLut,
  createDryMediaLabSession,
  exportDryMediaRecipeJson,
  formatOklch,
  getActiveDryMediaConfig,
  getDryMediaBrushPreset,
  getDryMediaPaperSubstrate,
  isVioletSlopHue,
  playDryMediaFoleyPreview,
  previewDryMediaConfigPatch,
  revertDryMediaLabSession,
  sampleDualScalePaperGrain,
  sanitizeNonVioletHue,
  selectDryMediaBrushPreset,
  simulateDryMediaStrokeMicrostructure,
  synthesizeDryMediaFoleyFrame,
  type DryMediaBrushId,
  type DryMediaPaperId,
} from "./index";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("1. 6종 건식·갈필 매체 프리셋 & 4종 256×256 이중 스케일 종이 LUT", () => {
  it("6종 극한 건식·갈필 프리셋 ID가 계약과 정확히 일치하고 바이올렛 휴가 0건이다", () => {
    const ids: readonly DryMediaBrushId[] = [
      "wax-crayon", "oil-pastel", "graphite-4b",
      "charcoal-stick", "dry-sumi-bristle", "colored-pencil-prism",
    ];
    expect(DRYMEDIA_BRUSH_PRESETS.map((p) => p.id)).toEqual(ids);
    for (const preset of DRYMEDIA_BRUSH_PRESETS) {
      expect(preset.nameKo.length).toBeGreaterThan(2);
      expect(preset.nameEn.length).toBeGreaterThan(2);
      expect(isVioletSlopHue(preset.pigmentOklch.h)).toBe(false);
    }
  });

  it("4종 종이 결(황목·켄트지·한지·크로키북)이 고유한 피치와 비-바이올렛 OKLCH 색상을 가진다", () => {
    const paperIds: readonly DryMediaPaperId[] = [
      "rough-cold-press", "kent-smooth", "hanji-mulberry", "croquis-tooth",
    ];
    expect(DRYMEDIA_PAPER_SUBSTRATES.map((p) => p.id)).toEqual(paperIds);
    const rough = getDryMediaPaperSubstrate("rough-cold-press");
    const kent = getDryMediaPaperSubstrate("kent-smooth");
    expect(rough.paperToothPitchPx).toBeGreaterThan(kent.paperToothPitchPx * 2);
    for (const paper of DRYMEDIA_PAPER_SUBSTRATES) {
      expect(paper.macroFiberWeight + paper.microToothWeight).toBeCloseTo(1, 5);
      expect(isVioletSlopHue(paper.surfaceOklch.h)).toBe(false);
      expect(isVioletSlopHue(paper.valleyOklch.h)).toBe(false);
    }
  });

  it("256×256 이중 스케일 종이 LUT가 Float32Array(65536)·정규화 범위·RG8 128KiB를 충족한다", () => {
    for (const paper of DRYMEDIA_PAPER_SUBSTRATES) {
      const lut = bakeDualScalePaperGrainLut(paper.id);
      expect(lut.size).toBe(DUAL_SCALE_GRAIN_TILE_SIZE);
      expect(lut.macroFiber).toBeInstanceOf(Float32Array);
      expect(lut.macroFiber).toHaveLength(65536);
      expect(lut.microTooth).toHaveLength(65536);
      expect(lut.combinedHeight).toHaveLength(65536);
      expect(lut.gpuTileRg8Bytes).toBe(256 * 256 * 2);
      for (let i = 0; i < 65536; i += 257) {
        expect(lut.macroFiber[i]).toBeGreaterThanOrEqual(0);
        expect(lut.macroFiber[i]).toBeLessThanOrEqual(1);
        expect(lut.combinedHeight[i]).toBeGreaterThanOrEqual(0);
        expect(lut.combinedHeight[i]).toBeLessThanOrEqual(1);
      }
    }
  });

  it("동일 종이 ID 반복 베이크가 결정론적이고 음수/래핑 좌표 조회가 O(1) 일치한다", () => {
    const a = bakeDualScalePaperGrainLut("rough-cold-press");
    const b = bakeDualScalePaperGrainLut("rough-cold-press");
    expect(a.peakMean).toBe(b.peakMean);
    expect(a.peakStdDev).toBe(b.peakStdDev);
    const s0 = sampleDualScalePaperGrain(a, 37, 91);
    const sWrapPos = sampleDualScalePaperGrain(a, 37 + 256 * 3, 91 + 256 * 2);
    const sWrapNeg = sampleDualScalePaperGrain(a, 37 - 256, 91 - 256 * 4);
    expect(sWrapPos).toEqual(s0);
    expect(sWrapNeg).toEqual(s0);
  });

  it("거친 황목 LUT는 켄트지보다 요철 편차와 깊은 골짜기 비율이 크다", () => {
    const rough = bakeDualScalePaperGrainLut("rough-cold-press");
    const kent = bakeDualScalePaperGrainLut("kent-smooth");
    expect(rough.peakStdDev).toBeGreaterThan(kent.peakStdDev);
    expect(rough.valleyDepthRatio).toBeGreaterThan(kent.valleyDepthRatio);
  });

  it("색상 가드가 270~320° 바이올렛 휴를 안전 안료 휴로 자동 치환하고 원시 색을 차단한다", () => {
    expect(isVioletSlopHue(285)).toBe(true);
    expect(isVioletSlopHue(315)).toBe(true);
    expect(isVioletSlopHue(28)).toBe(false);
    expect(isVioletSlopHue(sanitizeNonVioletHue(288))).toBe(false);
    expect(isVioletSlopHue(sanitizeNonVioletHue(312))).toBe(false);
    const css = formatOklch({ l: 0.52, c: 0.16, h: 292 }, 0.85);
    expect(css).toMatch(/^oklch\(/u);
    expect(css).not.toMatch(/#|rgb|hsl/iu);
  });
});

describe("2. 4대 건식 매체 시각 리얼리즘 수학 모델 (simulateDryMediaStrokeMicrostructure)", () => {
  it("저필압·저기울기(< 35°)에서는 종이 봉우리만 찍히고 골짜기 백색 노출(sparkleValleyExposure)이 크게 증가한다", () => {
    const lut = bakeDualScalePaperGrainLut("rough-cold-press");
    const lightTilted = simulateDryMediaStrokeMicrostructure({
      brushId: "wax-crayon", paperId: "rough-cold-press",
      pressure: 0.2, tiltDeg: 22, speedPxPerSec: 480, overlapPasses: 1, lut,
    });
    const heavyUpright = simulateDryMediaStrokeMicrostructure({
      brushId: "wax-crayon", paperId: "rough-cold-press",
      pressure: 0.92, tiltDeg: 80, speedPxPerSec: 480, overlapPasses: 3, lut,
    });
    expect(lightTilted.tiltShading.isBroadSideActive).toBe(true);
    expect(heavyUpright.tiltShading.isBroadSideActive).toBe(false);
    expect(lightTilted.dualScaleTooth.toothThreshold).toBeGreaterThan(heavyUpright.dualScaleTooth.toothThreshold);
    expect(lightTilted.dualScaleTooth.sparkleValleyExposure).toBeGreaterThan(heavyUpright.dualScaleTooth.sparkleValleyExposure + 0.3);
    expect(lightTilted.dualScaleTooth.sparkleValleyExposure).toBeGreaterThan(0.45);
  });

  it("기울기를 90°에서 15°로 낮추면 4B 연필 접촉 폭이 최대 2.8배 확장되고 입자 거칠기(granulationContrast)가 상승한다", () => {
    const lut = bakeDualScalePaperGrainLut("croquis-tooth");
    const upright = simulateDryMediaStrokeMicrostructure({
      brushId: "graphite-4b", paperId: "croquis-tooth",
      pressure: 0.4, tiltDeg: 90, speedPxPerSec: 640, overlapPasses: 1, lut,
    });
    const mid = simulateDryMediaStrokeMicrostructure({
      brushId: "graphite-4b", paperId: "croquis-tooth",
      pressure: 0.4, tiltDeg: 45, speedPxPerSec: 640, overlapPasses: 1, lut,
    });
    const flat = simulateDryMediaStrokeMicrostructure({
      brushId: "graphite-4b", paperId: "croquis-tooth",
      pressure: 0.4, tiltDeg: 15, speedPxPerSec: 640, overlapPasses: 1, lut,
    });
    expect(upright.tiltShading.contactWidthMultiplier).toBe(1);
    expect(mid.tiltShading.contactWidthMultiplier).toBeGreaterThan(upright.tiltShading.contactWidthMultiplier);
    expect(flat.tiltShading.contactWidthMultiplier).toBe(MAX_TILT_WIDTH_MULTIPLIER);
    expect(flat.tiltShading.granulationContrast).toBeGreaterThan(upright.tiltShading.granulationContrast);
  });

  it("기울기 35° 경계에서 광폭 셰이딩 활성 플래그(isBroadSideActive)가 정확히 전환된다", () => {
    const lut = bakeDualScalePaperGrainLut("croquis-tooth");
    const below = simulateDryMediaStrokeMicrostructure({
      brushId: "graphite-4b", paperId: "croquis-tooth",
      pressure: 0.45, tiltDeg: TILT_BROADSIDE_THRESHOLD_DEG - 1, speedPxPerSec: 500, overlapPasses: 1, lut,
    });
    const atThreshold = simulateDryMediaStrokeMicrostructure({
      brushId: "graphite-4b", paperId: "croquis-tooth",
      pressure: 0.45, tiltDeg: TILT_BROADSIDE_THRESHOLD_DEG, speedPxPerSec: 500, overlapPasses: 1, lut,
    });
    expect(below.tiltShading.isBroadSideActive).toBe(true);
    expect(atThreshold.tiltShading.isBroadSideActive).toBe(false);
  });

  it("겹칠 횟수를 1→2→3→4패스로 높이면 왁스 버니싱(valleyFillRatio)이 단조 증가하고 골 노출이 감소한다", () => {
    const lut = bakeDualScalePaperGrainLut("rough-cold-press");
    const results = [1, 2, 3, 4].map((overlapPasses) =>
      simulateDryMediaStrokeMicrostructure({
        brushId: "wax-crayon", paperId: "rough-cold-press",
        pressure: 0.48, tiltDeg: 34, speedPxPerSec: 420, overlapPasses, lut,
      }),
    );
    const [p1, p2, p3, p4] = results;
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
    expect(p3).toBeDefined();
    expect(p4).toBeDefined();
    if (p1 && p2 && p3 && p4) {
      expect(p2.burnishAndCrumb.valleyFillRatio).toBeGreaterThan(p1.burnishAndCrumb.valleyFillRatio);
      expect(p3.burnishAndCrumb.valleyFillRatio).toBeGreaterThan(p2.burnishAndCrumb.valleyFillRatio);
      expect(p4.burnishAndCrumb.valleyFillRatio).toBeGreaterThan(p3.burnishAndCrumb.valleyFillRatio);
      expect(p4.dualScaleTooth.sparkleValleyExposure).toBeLessThan(p1.dualScaleTooth.sparkleValleyExposure);
    }
  });

  it("오일 파스텔은 높은 겹칠 스머지·불투명도를 보이고, 유성 색연필은 3~4패스에서 왁스 블룸이 강하게 올라온다", () => {
    const oil = simulateDryMediaStrokeMicrostructure({
      brushId: "oil-pastel", paperId: "rough-cold-press",
      pressure: 0.72, tiltDeg: 38, speedPxPerSec: 320, overlapPasses: 3,
    });
    const prismPass1 = simulateDryMediaStrokeMicrostructure({
      brushId: "colored-pencil-prism", paperId: "kent-smooth",
      pressure: 0.6, tiltDeg: 45, speedPxPerSec: 500, overlapPasses: 1,
    });
    const prismPass4 = simulateDryMediaStrokeMicrostructure({
      brushId: "colored-pencil-prism", paperId: "kent-smooth",
      pressure: 0.6, tiltDeg: 45, speedPxPerSec: 500, overlapPasses: 4,
    });
    expect(oil.burnishAndCrumb.smudgeBlendRatio).toBeGreaterThan(0.55);
    expect(oil.burnishAndCrumb.glazeOpacity).toBeGreaterThan(0.88);
    expect(prismPass4.burnishAndCrumb.waxBloomRatio).toBeGreaterThan(prismPass1.burnishAndCrumb.waxBloomRatio + 0.5);
    expect(prismPass4.burnishAndCrumb.glazeOpacity).toBeGreaterThan(prismPass1.burnishAndCrumb.glazeOpacity);
  });

  it("크럼블 입자(crumbParticles)는 동일 입력에서 결정론적으로 일치하고 목탄·크레용이 4B 연필보다 더 많이 비산한다", () => {
    const lut = bakeDualScalePaperGrainLut("rough-cold-press");
    const c1 = simulateDryMediaStrokeMicrostructure({
      brushId: "charcoal-stick", paperId: "rough-cold-press",
      pressure: 0.55, tiltDeg: 30, speedPxPerSec: 650, overlapPasses: 1, lut,
    });
    const c2 = simulateDryMediaStrokeMicrostructure({
      brushId: "charcoal-stick", paperId: "rough-cold-press",
      pressure: 0.55, tiltDeg: 30, speedPxPerSec: 650, overlapPasses: 1, lut,
    });
    const graphite = simulateDryMediaStrokeMicrostructure({
      brushId: "graphite-4b", paperId: "rough-cold-press",
      pressure: 0.55, tiltDeg: 30, speedPxPerSec: 650, overlapPasses: 1, lut,
    });
    expect(c1.burnishAndCrumb.crumbParticles).toEqual(c2.burnishAndCrumb.crumbParticles);
    expect(c1.burnishAndCrumb.crumbCount).toBeGreaterThan(graphite.burnishAndCrumb.crumbCount);
    expect(c1.burnishAndCrumb.crumbParticles[0]?.kind).toBe("charcoal-dust");
  });

  it("갈필 먹붓(dry-sumi-bristle)은 3~18가닥 모발 분기와 고속 주행 시 종이 결 끊김을 모델링한다", () => {
    const lut = bakeDualScalePaperGrainLut("hanji-mulberry");
    const slowHeavy = simulateDryMediaStrokeMicrostructure({
      brushId: "dry-sumi-bristle", paperId: "hanji-mulberry",
      pressure: 0.9, tiltDeg: 82, speedPxPerSec: 120, overlapPasses: 1, lut,
    });
    const fastTilted = simulateDryMediaStrokeMicrostructure({
      brushId: "dry-sumi-bristle", paperId: "hanji-mulberry",
      pressure: 0.2, tiltDeg: 20, speedPxPerSec: 2800, overlapPasses: 1, lut,
    });
    expect(slowHeavy.tiltShading.sumiBristle.active).toBe(true);
    expect(slowHeavy.tiltShading.sumiBristle.strandCount).toBeGreaterThanOrEqual(MIN_SUMI_BRISTLE_STRANDS);
    expect(fastTilted.tiltShading.sumiBristle.strandCount).toBeLessThanOrEqual(MAX_SUMI_BRISTLE_STRANDS);
    expect(fastTilted.tiltShading.sumiBristle.strandCount).toBeGreaterThan(slowHeavy.tiltShading.sumiBristle.strandCount);
    expect(fastTilted.tiltShading.sumiBristle.highSpeedSkipRatio).toBeGreaterThan(slowHeavy.tiltShading.sumiBristle.highSpeedSkipRatio);
    expect(fastTilted.tiltShading.sumiBristle.strands).toHaveLength(fastTilted.tiltShading.sumiBristle.strandCount);
  });

  it("120Hz GPU 비용 모델은 6종 매체×극한 입력 모두에서 256×256 1샘플·smoothstep 3명령·추가 비용 < 0.35ms를 지킨다", () => {
    for (const preset of DRYMEDIA_BRUSH_PRESETS) {
      const res = simulateDryMediaStrokeMicrostructure({
        brushId: preset.id, paperId: preset.recommendedPaperId,
        pressure: 1, tiltDeg: 15, speedPxPerSec: 3200, overlapPasses: 4, crumbIntensity: 1,
      });
      expect(res.gpuBudget120Hz.tileResolutionPx).toBe(256);
      expect(res.gpuBudget120Hz.textureSamplesPerFragment).toBe(1);
      expect(res.gpuBudget120Hz.shaderThresholdInstructionCount).toBe(SHADER_THRESHOLD_INSTRUCTIONS);
      expect(res.gpuBudget120Hz.additionalGpuCostMs).toBeLessThan(EXTRA_GPU_BUDGET_MS);
      expect(res.gpuBudget120Hz.withinExtraGpuBudget).toBe(true);
      expect(res.gpuBudget120Hz.totalEstimatedFrameMs).toBeLessThanOrEqual(FRAME_BUDGET_120HZ_MS);
      expect(res.gpuBudget120Hz.within120HzBudget).toBe(true);
      expect(res.gpuBudget120Hz.costModelSource).toBe("deterministic-analytical-model");
      expect(res.gpuBudget120Hz.wgslSnippet).toContain("smoothstep");
    }
  });

  it("단면 프로파일 24포인트와 평면 알파 대비 질감 향상 점수가 모든 프리셋에서 유효하다", () => {
    for (const preset of DRYMEDIA_BRUSH_PRESETS) {
      const res = simulateDryMediaStrokeMicrostructure({
        brushId: preset.id, paperId: preset.recommendedPaperId,
        pressure: preset.defaultPressure, tiltDeg: preset.defaultTiltDeg,
        speedPxPerSec: preset.defaultSpeedPxPerSec, overlapPasses: preset.defaultOverlapPasses,
      });
      expect(res.dualScaleTooth.crossSection).toHaveLength(24);
      expect(res.dryMediaRealismScore).toBeGreaterThan(res.flatAlphaBaselineScore + 35);
    }
  });

  it("NaN·음수·극단 초과 입력을 안전하게 클램프해 유한 수치만 반환한다", () => {
    const res = simulateDryMediaStrokeMicrostructure({
      brushId: "wax-crayon", paperId: "rough-cold-press",
      pressure: Number.NaN, tiltDeg: -40, speedPxPerSec: 999999, overlapPasses: 99,
      grainIntensity: 5, crumbIntensity: -3,
    });
    expect(Number.isFinite(res.dualScaleTooth.toothThreshold)).toBe(true);
    expect(res.tiltDeg).toBe(15);
    expect(res.overlapPasses).toBe(4);
    expect(res.burnishAndCrumb.crumbCount).toBe(0);
  });
});

describe("3. 매체별 청각 질감(Web Audio Procedural Foley) 합성 모델", () => {
  it("종이 봉우리 통과 주파수(toothCrossingHz = speedPxPerSec / paperToothPitchPx)를 정확히 산출한다", () => {
    const rough = getDryMediaPaperSubstrate("rough-cold-press");
    const kent = getDryMediaPaperSubstrate("kent-smooth");
    const fRough = synthesizeDryMediaFoleyFrame({
      brushId: "wax-crayon", paperId: "rough-cold-press",
      pressure: 0.5, tiltDeg: 35, speedPxPerSec: 740, overlapPasses: 1, volume: 0.8, muted: false,
    });
    const fKent = synthesizeDryMediaFoleyFrame({
      brushId: "graphite-4b", paperId: "kent-smooth",
      pressure: 0.5, tiltDeg: 35, speedPxPerSec: 780, overlapPasses: 1, volume: 0.8, muted: false,
    });
    expect(fRough.toothCrossingHz).toBeCloseTo(740 / rough.paperToothPitchPx, 1);
    expect(fKent.toothCrossingHz).toBeCloseTo(780 / kent.paperToothPitchPx, 1);
  });

  it("크레용·오일 파스텔은 180~520Hz 높은 Q 왁스 드래그 공진과 저음 마찰음을 생성한다", () => {
    for (const brushId of ["wax-crayon", "oil-pastel"] as const) {
      const foley = synthesizeDryMediaFoleyFrame({
        brushId, paperId: "rough-cold-press",
        pressure: 0.65, tiltDeg: 32, speedPxPerSec: 460, overlapPasses: 1, volume: 0.8, muted: false,
      });
      expect(foley.acousticFamily).toBe("wax-drag");
      expect(foley.primaryResonanceHz).toBeGreaterThanOrEqual(180);
      expect(foley.primaryResonanceHz).toBeLessThanOrEqual(520);
      expect(foley.primaryQ).toBeGreaterThanOrEqual(4.2);
      expect(foley.lowFrictionRumbleGain).toBeGreaterThan(0.5);
      expect(foley.audioGraph.secondaryFilterType).toBe("lowshelf");
    }
  });

  it("4B 연필·유성 색연필은 2,200~6,800Hz 고역 종이 결 긁힘 버스트와 빠른 과도 어택을 생성한다", () => {
    for (const brushId of ["graphite-4b", "colored-pencil-prism"] as const) {
      const foley = synthesizeDryMediaFoleyFrame({
        brushId, paperId: "kent-smooth",
        pressure: 0.45, tiltDeg: 30, speedPxPerSec: 900, overlapPasses: 1, volume: 0.8, muted: false,
      });
      expect(foley.acousticFamily).toBe("graphite-scratch");
      expect(foley.primaryResonanceHz).toBeGreaterThanOrEqual(2200);
      expect(foley.primaryResonanceHz).toBeLessThanOrEqual(6800);
      expect(foley.transientAttackMs).toBeLessThan(4.5);
      expect(foley.highScratchBurstRateHz).toBeGreaterThan(200);
    }
  });

  it("갈필 먹붓은 900~3,200Hz 대역통과와 속도에 비례해 상승하는 노이즈 게인을 생성한다", () => {
    const slow = synthesizeDryMediaFoleyFrame({
      brushId: "dry-sumi-bristle", paperId: "hanji-mulberry",
      pressure: 0.4, tiltDeg: 35, speedPxPerSec: 200, overlapPasses: 1, volume: 0.75, muted: false,
    });
    const fast = synthesizeDryMediaFoleyFrame({
      brushId: "dry-sumi-bristle", paperId: "hanji-mulberry",
      pressure: 0.4, tiltDeg: 35, speedPxPerSec: 2400, overlapPasses: 1, volume: 0.75, muted: false,
    });
    expect(slow.primaryResonanceHz).toBeGreaterThanOrEqual(900);
    expect(fast.primaryResonanceHz).toBeLessThanOrEqual(3200);
    expect(fast.primaryResonanceHz).toBeGreaterThan(slow.primaryResonanceHz);
    expect(fast.velocityNoiseGain).toBeGreaterThan(slow.velocityNoiseGain + 0.4);
  });

  it("목탄 스틱은 760~2,200Hz 중저역 긁힘 + 3.1kHz 가루 크래클 이중 대역 파라미터를 생성한다", () => {
    const foley = synthesizeDryMediaFoleyFrame({
      brushId: "charcoal-stick", paperId: "rough-cold-press",
      pressure: 0.5, tiltDeg: 28, speedPxPerSec: 640, overlapPasses: 1, volume: 0.8, muted: false,
    });
    expect(foley.acousticFamily).toBe("charcoal-grit");
    expect(foley.primaryResonanceHz).toBeGreaterThanOrEqual(760);
    expect(foley.primaryResonanceHz).toBeLessThanOrEqual(2200);
    expect(foley.audioGraph.secondaryFrequencyHz).toBe(3100);
  });

  it("-24 LUFS 청각 피로 방지 리미터가 최대 필압·최대 속도·최대 음량에서도 출력 상한을 강제한다", () => {
    for (const preset of DRYMEDIA_BRUSH_PRESETS) {
      const foley = synthesizeDryMediaFoleyFrame({
        brushId: preset.id, paperId: preset.recommendedPaperId,
        pressure: 1, tiltDeg: 15, speedPxPerSec: 3200, overlapPasses: 1, volume: 1, muted: false,
      });
      expect(foley.safetyLimiter.ceilingLufs).toBe(FOLEY_LIMITER_CEILING_LUFS);
      expect(foley.safetyLimiter.estimatedOutputLufs).toBeLessThanOrEqual(FOLEY_LIMITER_CEILING_LUFS);
      expect(foley.safetyLimiter.fatigueGuardActive).toBe(true);
      expect(foley.audioGraph.compressorThresholdDb).toBe(FOLEY_LIMITER_CEILING_LUFS);
      expect(foley.audioGraph.compressorRatio).toBeGreaterThanOrEqual(10);
    }
  });

  it("음소거 또는 음량 0이면 유효 게인·파형·스펙트럼이 0이 되고 playDryMediaFoleyPreview가 안전하게 중지된다", async () => {
    const muted = synthesizeDryMediaFoleyFrame({
      brushId: "wax-crayon", paperId: "rough-cold-press",
      pressure: 0.7, tiltDeg: 35, speedPxPerSec: 600, overlapPasses: 1, volume: 0.8, muted: true,
    });
    expect(muted.effectiveGain).toBe(0);
    expect(muted.waveformSamples.every((v) => v === 0)).toBe(true);
    expect(muted.spectrumBands.every((b) => b.magnitude === 0)).toBe(true);
    expect(await playDryMediaFoleyPreview(muted)).toEqual({ played: false, reason: "muted", durationMs: 0 });
  });

  it("jsdom/SSR처럼 AudioContext가 없는 환경에서도 playDryMediaFoleyPreview가 예외 없이 폴백한다", async () => {
    const active = synthesizeDryMediaFoleyFrame({
      brushId: "graphite-4b", paperId: "croquis-tooth",
      pressure: 0.5, tiltDeg: 30, speedPxPerSec: 700, overlapPasses: 1, volume: 0.7, muted: false,
    });
    const res = await playDryMediaFoleyPreview(active);
    expect(res.played).toBe(false);
    expect(res.reason).toBe("unsupported-audio-context");
  });

  it("16밴드 주파수 스펙트럼 피크가 크레용 < 갈필 먹붓 < 4B 연필 순으로 물리 주파수 대역을 반영한다", () => {
    const peakHz = (brushId: DryMediaBrushId, paperId: DryMediaPaperId): number => {
      const f = synthesizeDryMediaFoleyFrame({
        brushId, paperId, pressure: 0.5, tiltDeg: 32, speedPxPerSec: 720, overlapPasses: 1, volume: 0.8, muted: false,
      });
      const firstBand = f.spectrumBands[0];
      if (!firstBand) return 0;
      const best = f.spectrumBands.reduce((acc, item) => (item.magnitude > acc.magnitude ? item : acc), firstBand);
      return best.hz;
    };
    const waxPeak = peakHz("wax-crayon", "rough-cold-press");
    const sumiPeak = peakHz("dry-sumi-bristle", "hanji-mulberry");
    const pencilPeak = peakHz("graphite-4b", "kent-smooth");
    expect(waxPeak).toBeLessThan(sumiPeak);
    expect(sumiPeak).toBeLessThan(pencilPeak);
  });

  it("Web Audio 노드 그래프 사양이 7단계 체인과 유한 AudioParam 값을 포함한다", () => {
    const foley = synthesizeDryMediaFoleyFrame({
      brushId: "wax-crayon", paperId: "rough-cold-press",
      pressure: 0.6, tiltDeg: 32, speedPxPerSec: 500, overlapPasses: 1, volume: 0.75, muted: false,
    });
    expect(foley.audioGraph.nodeChain).toHaveLength(7);
    expect(foley.audioGraph.nodeChain).toContain("lufs-24-dynamics-compressor");
    expect(Number.isFinite(foley.audioGraph.toothLfoHz)).toBe(true);
    expect(foley.waveformSamples).toHaveLength(32);
  });
});

describe("4. 비파괴 세션 상태 머신 & WGSL/Foley JSON 레시피 내보내기", () => {
  it("초기 세션은 clean 상태이며 적용·원복 버튼이 비활성이다", () => {
    const s = createDryMediaLabSession();
    expect(s.status).toBe("clean");
    expect(s.canApply).toBe(false);
    expect(s.canRevert).toBe(false);
    expect(getActiveDryMediaConfig(s).brushId).toBe("wax-crayon");
  });

  it("매체 프리셋 전환은 추천 종이로 미리보기를 열되 사용자 음소거·음량 설정을 보존한다", () => {
    const muted = previewDryMediaConfigPatch(createDryMediaLabSession(), { foleyMuted: true, foleyVolume: 0.4 });
    const switched = selectDryMediaBrushPreset(muted, "dry-sumi-bristle");
    const active = getActiveDryMediaConfig(switched);
    expect(switched.status).toBe("previewing");
    expect(active.brushId).toBe("dry-sumi-bristle");
    expect(active.paperId).toBe("hanji-mulberry");
    expect(active.foleyMuted).toBe(true);
    expect(active.foleyVolume).toBe(0.4);
  });

  it("적용(apply)은 committed를 갱신하고 이력을 쌓으며, 원복(revert)은 미리보기 취소 후 직전 확정으로 복귀한다", () => {
    const s0 = createDryMediaLabSession({ brushId: "wax-crayon" });
    const s1 = selectDryMediaBrushPreset(s0, "graphite-4b");
    const s2 = applyDryMediaLabPreview(s1);
    expect(s2.status).toBe("applied");
    expect(s2.appliedCount).toBe(1);
    expect(s2.committed.brushId).toBe("graphite-4b");

    const s3 = previewDryMediaConfigPatch(s2, { overlapPasses: 4 });
    expect(s3.canApply).toBe(true);
    const s4 = revertDryMediaLabSession(s3);
    expect(s4.preview).toBeNull();
    expect(s4.committed.brushId).toBe("graphite-4b");

    const s5 = revertDryMediaLabSession(s4);
    expect(s5.committed.brushId).toBe("wax-crayon");
    expect(s5.canRevert).toBe(false);
  });

  it("미리보기 변경을 원래 확정값으로 되돌리면 preview가 자동 해제된다", () => {
    const s0 = createDryMediaLabSession({ brushId: "wax-crayon" });
    const basePressure = s0.committed.pressure;
    const s1 = previewDryMediaConfigPatch(s0, { pressure: 0.9 });
    expect(s1.preview).not.toBeNull();
    const s2 = previewDryMediaConfigPatch(s1, { pressure: basePressure });
    expect(s2.preview).toBeNull();
    expect(s2.canApply).toBe(false);
  });

  it("exportDryMediaRecipeJson이 스키마·WGSL 3명령 스니펫·-24 LUFS 오디오 그래프를 직렬화한다", () => {
    const s = selectDryMediaBrushPreset(createDryMediaLabSession(), "oil-pastel");
    const cfg = getActiveDryMediaConfig(s);
    const micro = simulateDryMediaStrokeMicrostructure(cfg);
    const foley = synthesizeDryMediaFoleyFrame({ ...cfg, volume: cfg.foleyVolume, muted: cfg.foleyMuted });
    const parsed = JSON.parse(exportDryMediaRecipeJson(s, micro, foley)) as Record<string, unknown>;
    expect(parsed.schema).toBe("toonstudio.drymedia-crayon-audio-recipe.v1");
    expect((parsed.gpuShaderBudget120Hz as { readonly additionalGpuCostMs: number }).additionalGpuCostMs).toBeLessThan(EXTRA_GPU_BUDGET_MS);
    expect((parsed.acousticFoley as { readonly safetyLimiterCeilingLufs: number }).safetyLimiterCeilingLufs).toBe(FOLEY_LIMITER_CEILING_LUFS);
  });
});

describe("5. StudioDryMediaCrayonAudioPanel UI·접근성·정적 하네스 계약", () => {
  it("props 없이 기본 렌더 시 6종 매체·4종 종이·3단 SVG·GPU 비용 모델 고지를 표시한다", () => {
    render(<StudioDryMediaCrayonAudioPanel />);
    expect(screen.getByTestId("drymedia-crayon-audio-panel")).toBeTruthy();
    for (const preset of DRYMEDIA_BRUSH_PRESETS) {
      expect(screen.getByTestId(`drymedia-brush-preset-${preset.id}`)).toBeTruthy();
    }
    for (const paper of DRYMEDIA_PAPER_SUBSTRATES) {
      expect(screen.getByTestId(`drymedia-paper-preset-${paper.id}`)).toBeTruthy();
    }
    const svg = screen.getByTestId("drymedia-three-stage-svg");
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("data-brush-id")).toBe("wax-crayon");
    expect(screen.getByTestId("drymedia-cost-model-note").textContent).toContain("결정론적 분석 비용 모델");
  });

  it("6종 프리셋·4종 종이 전환이 3단 SVG 속성·갈필 가닥수·주파수를 실시간 갱신한다", () => {
    render(<StudioDryMediaCrayonAudioPanel />);
    fireEvent.click(screen.getByTestId("drymedia-brush-preset-dry-sumi-bristle"));
    const svg = screen.getByTestId("drymedia-three-stage-svg");
    expect(svg.getAttribute("data-brush-id")).toBe("dry-sumi-bristle");
    expect(svg.getAttribute("data-paper-id")).toBe("hanji-mulberry");
    expect(Number(svg.getAttribute("data-sumi-strands"))).toBeGreaterThanOrEqual(MIN_SUMI_BRISTLE_STRANDS);

    fireEvent.click(screen.getByTestId("drymedia-paper-preset-kent-smooth"));
    expect(svg.getAttribute("data-paper-id")).toBe("kent-smooth");
  });

  it("필압·기울기(15°)·속도·겹칠(4패스) 슬라이더 조작이 접촉 폭 ×2.8 및 골 메움을 즉시 반영한다", () => {
    render(<StudioDryMediaCrayonAudioPanel initialBrushId="graphite-4b" />);
    fireEvent.change(screen.getByTestId("drymedia-slider-tilt"), { target: { value: "15" } });
    expect(screen.getByTestId("drymedia-slider-tilt-readout").textContent).toBe("15°");
    expect(screen.getByTestId("drymedia-three-stage-svg").getAttribute("data-width-mult")).toBe("2.80");

    const beforeFill = Number(screen.getByTestId("drymedia-three-stage-svg").getAttribute("data-valley-fill"));
    fireEvent.change(screen.getByTestId("drymedia-slider-passes"), { target: { value: "4" } });
    expect(screen.getByTestId("drymedia-slider-passes-readout").textContent).toBe("4패스");
    const afterFill = Number(screen.getByTestId("drymedia-three-stage-svg").getAttribute("data-valley-fill"));
    expect(afterFill).toBeGreaterThan(beforeFill);

    fireEvent.change(screen.getByTestId("drymedia-slider-pressure"), { target: { value: "0.2" } });
    expect(screen.getByTestId("drymedia-slider-pressure-readout").textContent).toBe("20%");

    fireEvent.change(screen.getByTestId("drymedia-slider-speed"), { target: { value: "1800" } });
    expect(screen.getByTestId("drymedia-slider-speed-readout").textContent).toBe("1800 px/s");
  });

  it("청각 Foley 음소거·음량 슬라이더·질감음 시연 버튼이 상태 배너와 SVG를 안전하게 갱신한다", () => {
    render(<StudioDryMediaCrayonAudioPanel />);
    const muteBtn = screen.getByTestId("drymedia-foley-mute-btn");
    expect(muteBtn.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByTestId("drymedia-foley-play-btn"));
    expect(screen.getByTestId("drymedia-status-banner").textContent).toContain("LUFS");

    fireEvent.click(muteBtn);
    expect(muteBtn.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("drymedia-three-stage-svg").getAttribute("data-foley-muted")).toBe("true");
    expect((screen.getByTestId("drymedia-slider-foley-volume") as HTMLInputElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId("drymedia-foley-play-btn"));
    expect(screen.getByTestId("drymedia-status-banner").textContent).toContain("음소거");
  });

  it("비파괴 적용·원복·JSON 복사·토글 및 영문 로케일(en) 콜백이 정상 동작한다", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const onApply = vi.fn();
    const onExportJson = vi.fn();
    render(
      <StudioDryMediaCrayonAudioPanel
        locale="en"
        initialBrushId="wax-crayon"
        onApply={onApply}
        onExportJson={onExportJson}
      />,
    );
    expect((screen.getByTestId("drymedia-apply-btn") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId("drymedia-json-preview")).toBeNull();

    fireEvent.click(screen.getByTestId("drymedia-brush-preset-charcoal-stick"));
    expect((screen.getByTestId("drymedia-apply-btn") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId("drymedia-apply-btn"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("drymedia-session-status-badge").textContent).toContain("Applied");

    fireEvent.click(screen.getByTestId("drymedia-revert-btn"));
    expect(screen.getByTestId("drymedia-three-stage-svg").getAttribute("data-brush-id")).toBe("wax-crayon");

    fireEvent.click(screen.getByTestId("drymedia-copy-json-btn"));
    await waitFor(() => expect(onExportJson).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("drymedia-json-preview").textContent).toContain("toonstudio.drymedia-crayon-audio-recipe.v1");

    fireEvent.click(screen.getByTestId("drymedia-toggle-json-btn"));
    expect(screen.queryByTestId("drymedia-json-preview")).toBeNull();
  });

  it("접근성 랜드마크(role=status, role=meter, aria-pressed)와 모든 버튼 min-h-11을 충족한다", () => {
    const { container } = render(<StudioDryMediaCrayonAudioPanel />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(16);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }
    expect(container.querySelectorAll('[role="meter"]').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("6종 매체 전환 시 3단 SVG DOM에 원시 색(#hex/rgb/hsl) 및 바이올렛 휴(270~320°)가 0건이다", () => {
    render(<StudioDryMediaCrayonAudioPanel />);
    for (const preset of DRYMEDIA_BRUSH_PRESETS) {
      fireEvent.click(screen.getByTestId(`drymedia-brush-preset-${preset.id}`));
      const html = screen.getByTestId("drymedia-three-stage-svg").outerHTML;
      expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(html).not.toMatch(/\brgba?\s*\(/iu);
      expect(html).not.toMatch(/\bhsla?\s*\(/iu);
      for (const match of html.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+(\d+(?:\.\d+)?)/gu)) {
        expect(isVioletSlopHue(Number(match[1]))).toBe(false);
      }
    }
  });

  it("소유 파일 존재, 줄수 한도(엔진<=750·패널<=700·전체<=800) 및 금지 패턴 0건을 보장한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const expected = [
      "drymedia-crayon-audio-engine.ts",
      "StudioDryMediaCrayonAudioPanel.tsx",
      "index.ts",
      "drymedia-crayon-audio.test.tsx", "drymedia-boundaries.test.tsx", "drymedia-audio-preview.ts",
      "drymedia-input-contract.ts", "drymedia-recipe-export.ts", "use-drymedia-copy.ts",
      "use-drymedia-notification.ts", "use-drymedia-preview.ts",
    ];
    for (const file of expected) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }
    const files = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(files.sort()).toEqual(expected.sort());

    for (const file of files) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const lineCount = src.split(/\r?\n/).length;
      expect(lineCount).toBeLessThanOrEqual(800);
      if (file === "drymedia-crayon-audio-engine.ts") expect(lineCount).toBeLessThanOrEqual(750);
      if (file === "StudioDryMediaCrayonAudioPanel.tsx") expect(lineCount).toBeLessThanOrEqual(700);

      if (file !== "drymedia-crayon-audio.test.tsx") {
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

      if (file === "StudioDryMediaCrayonAudioPanel.tsx") {
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
});

describe("6. 헬퍼 폴백 & 경계 조회 안전성", () => {
  it("getDryMediaBrushPreset과 getDryMediaPaperSubstrate가 등록된 프리셋 메타를 정확히 반환한다", () => {
    expect(getDryMediaBrushPreset("colored-pencil-prism").recommendedPaperId).toBe("kent-smooth");
    expect(getDryMediaPaperSubstrate("hanji-mulberry").fiberAnisotropy).toBeGreaterThan(2);
  });
});
