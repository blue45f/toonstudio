import { describe, expect, it } from "vitest";

import {
  applyCinemaHalationBloomGrain,
  buildPreIntegratedSkinSssLut,
  computeEdgeTangentFlowField,
  computeHybridBandWeights,
  DEFAULT_MOBILE_DPI,
  DEFAULT_PRINT_DPI,
  estimateBlockSubpixelMotionField,
  evaluateInterleavedGradientNoise,
  measurePeriodicMoireBeatingIndex,
  samplePreIntegratedSkinLut,
  SCREENTONE_PRESET_PROFILES,
  shadeSkinSubsurfaceBuffer,
  SKIN_SSS_PROFILES,
  SpatiotemporalMotionToonUpscaler,
  SplitBristleInkPoolingSimulator,
  synthesizeRosetteFreeScreentone,
  synthesizeVoidAndClusterBlueNoiseTile,
  WASM64_WAVE14_RENDER_ALIGNMENT_BYTES,
  WASM64_WAVE14_SLAB_ALIGNMENT_BYTES,
  WGSL_BLUENOISE_HYBRID_SCREENTONE_KERNEL,
  WGSL_CINEMA_HALATION_GRAIN_SHADER,
  WGSL_ETF_TEMPORAL_UPSCALER_KERNEL,
  WGSL_PREINTEGRATED_SKIN_SSS_SHADER,
  type BristleStrokeSample,
  type ScreentonePresetKind,
} from "./index";

/** 서브픽셀 이동된 부드러운 반실사/웹툰 선화 프레임을 생성한다 (0 = 먹선, 1 = 종이 배경). */
function createSubpixelLineFrame(
  width: number,
  height: number,
  shiftX: number,
  shiftY: number,
): Float32Array {
  const frame = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = x - shiftX;
      const py = y - shiftY;
      // 대각 먹선 + 원형 눈동자 윤곽선 결합
      const diagDist = Math.abs(px * 0.62 - py * 0.78 + 4.0);
      const ringDist = Math.abs(Math.hypot(px - width * 0.52, py - height * 0.48) - 6.2);
      const nearestLine = Math.min(diagDist, ringDist);
      const lineInk = Math.exp(-(nearestLine * nearestLine) / (2 * 0.72 * 0.72));
      frame[y * width + x] = 1 - 0.88 * lineInk;
    }
  }
  return frame;
}

describe("wasm64-wave14-masterpiece: 다중 대역 블루노이즈 & 무로제트 스크린톤 합성기", () => {
  it("Void-and-Cluster 타일이 전단사 순위 균일도와 고주파 우세 블루노이즈 스펙트럼을 만족한다", () => {
    const tile = synthesizeVoidAndClusterBlueNoiseTile({
      tileSize: 16,
      filterSigma: 1.5,
      seed: 14,
      maxSwapIterations: 96,
    });

    expect(tile.tileSize).toBe(16);
    expect(tile.values.length).toBe(256);
    expect(tile.meanValue).toBeCloseTo(0.5, 4);
    // 백색 잡음(≈ 1~2) 대비 저주파 에너지가 강하게 억제되어 고주파 대 저주파 비율이 높다.
    expect(tile.highToLowFrequencyEnergyRatio).toBeGreaterThan(3.0);
    expect(tile.swapIterationsExecuted).toBeGreaterThanOrEqual(1);
    expect(tile.slabByteFootprint % WASM64_WAVE14_SLAB_ALIGNMENT_BYTES).toBe(BigInt(0));

    // 모든 256개 순위가 중복 없이 [0, 1) 구간을 균등 분할하는지 확인한다.
    const sorted = Float32Array.from(tile.values).sort();
    for (let i = 0; i < sorted.length; i += 1) {
      expect(sorted[i]).toBeCloseTo((i + 0.5) / 256, 5);
    }

    const ignSample = evaluateInterleavedGradientNoise(13, 29, 2);
    expect(ignSample).toBeGreaterThanOrEqual(0);
    expect(ignSample).toBeLessThan(1);
  });

  it("모바일 축소 뷰와 600DPI 인쇄 뷰 모두에서 주기적 모아레 맥놀이를 억제하고 계조 단차를 유지한다", () => {
    const width = 96;
    const height = 96;
    const toneDensity = new Float32Array(width * height);
    const lineMask = new Float32Array(width * height);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        // 4단 계조 밴드 테스트 원고
        const band = Math.floor((x / width) * 4) + 1;
        toneDensity[idx] = band * 0.18;
        if (y === 48) {
          lineMask[idx] = 1.0;
        }
      }
    }

    // 비교군: 안티모아레 감쇠 없이 비정수 주기(1.08px)로 직접 이진화한 나이브 규칙 AM 망점의 모아레 맥놀이 측정
    const naiveAliased = new Float32Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const spot =
          0.5 - 0.25 * (Math.cos((2 * Math.PI * x) / 1.08) + Math.cos((2 * Math.PI * y) / 1.08));
        naiveAliased[y * width + x] = spot < 0.35 ? 1 : 0;
      }
    }
    const naiveMoire = measurePeriodicMoireBeatingIndex(naiveAliased, width, height, 1.08);
    expect(naiveMoire).toBeGreaterThan(0.35);

    // 1) 모바일 축소 뷰포트 (zoomScale = 0.22, 160 DPI -> 망점 간격 < 1px 나이퀴스트 이하 영역)
    const mobileResult = synthesizeRosetteFreeScreentone({
      width,
      height,
      toneDensity,
      preset: "classic-60lpi",
      zoomScale: 0.22,
      targetDpi: DEFAULT_MOBILE_DPI,
      quantizationSteps: 10,
      lineArtPreserveMask: lineMask,
    });

    expect(mobileResult.bandWeights.amCarrierWeight).toBe(0);
    expect(mobileResult.moireBeatingIndex).toBeLessThan(0.02);
    expect(mobileResult.tonalStepRmsError).toBeLessThan(0.06);
    expect(mobileResult.serverCostKrw).toBe(0);
    // 중앙 가로 먹선 마스크가 훼손 없이 1.0 농도를 유지해야 한다.
    expect(mobileResult.inkCoverage[48 * width + 24]).toBeCloseTo(1.0, 5);

    // 2) 600 DPI 출판 인쇄 뷰 (zoomScale = 1.0, 600 DPI -> 10px 망점 주기)
    const printUniformTone = new Float32Array(width * height).fill(0.42);
    const printResult = synthesizeRosetteFreeScreentone({
      width,
      height,
      toneDensity: printUniformTone,
      preset: "classic-60lpi",
      zoomScale: 1.0,
      targetDpi: DEFAULT_PRINT_DPI,
      quantizationSteps: 12,
    });

    expect(printResult.bandWeights.amCarrierWeight).toBeGreaterThan(0.5);
    expect(printResult.moireBeatingIndex).toBeLessThan(0.05);
    expect(printResult.meanCoverageError).toBeLessThan(0.08);

    // 모든 프리셋 프로파일 및 WGSL 커널 유효성 확인
    const presetKeys: readonly ScreentonePresetKind[] = [
      "classic-60lpi",
      "fine-85lpi",
      "stochastic-sand",
      "dramatic-cross",
    ];
    for (const key of presetKeys) {
      const weights = computeHybridBandWeights(SCREENTONE_PRESET_PROFILES[key], 0.8, 300);
      expect(weights.dotPitchPx).toBeGreaterThan(0);
      expect(weights.amCarrierWeight + weights.fmBlueNoiseWeight).toBeCloseTo(1.0, 5);
    }
    expect(WGSL_BLUENOISE_HYBRID_SCREENTONE_KERNEL).toContain("synthesize_rosette_free_screentone");
  });
});

describe("wasm64-wave14-masterpiece: 시공간 위상 일관성 선화 & 모션툰 2× 업스케일러", () => {
  it("블록 SAD + Lucas-Kanade 광학 흐름과 구조 텐서 ETF 접선/법선 직교성을 정확히 계산한다", () => {
    const width = 32;
    const height = 32;
    const f0 = createSubpixelLineFrame(width, height, 0, 0);
    const f1 = createSubpixelLineFrame(width, height, 1.35, -0.65);

    const motion = estimateBlockSubpixelMotionField(f0, f1, width, height, {
      blockSize: 8,
      searchRadiusPx: 4,
    });
    const centerIdx = 16 * width + 16;
    expect(motion.flowX[centerIdx] ?? 0).toBeGreaterThan(0.8);
    expect(motion.flowX[centerIdx] ?? 0).toBeLessThan(2.0);
    expect(motion.flowY[centerIdx] ?? 0).toBeLessThan(-0.2);
    expect(motion.meanConfidence).toBeGreaterThan(0.6);

    const etf = computeEdgeTangentFlowField(f0, width, height, 2);
    for (let i = 0; i < width * height; i += 1) {
      const tx = etf.tangentX[i] ?? 0;
      const ty = etf.tangentY[i] ?? 0;
      const nx = etf.normalX[i] ?? 0;
      const ny = etf.normalY[i] ?? 0;
      // 접선과 법선은 항상 직교해야 한다.
      expect(Math.abs(tx * nx + ty * ny)).toBeLessThan(1e-5);
      expect(Math.hypot(tx, ty)).toBeCloseTo(1.0, 4);
    }
    expect(WGSL_ETF_TEMPORAL_UPSCALER_KERNEL).toContain("accumulate_phase_coherent_toon");
  });

  it("다중 프레임 서브픽셀 패닝 시퀀스를 2× 확대할 때 선명도를 높이면서 인터프레임 쉬머를 억제한다", () => {
    const lowW = 28;
    const lowH = 28;
    const frames: Float32Array[] = [];
    for (let t = 0; t < 5; t += 1) {
      frames.push(createSubpixelLineFrame(lowW, lowH, t * 0.55, t * -0.35));
    }

    const upscaler = new SpatiotemporalMotionToonUpscaler({
      shockStrength: 0.45,
      anisotropicTangentBlend: 0.38,
      baseTemporalBlend: 0.72,
      neighborhoodClampGamma: 1.1,
    });

    const report = upscaler.upscaleSequence(frames, lowW, lowH);
    expect(report.frames.length).toBe(5);
    expect(report.upscaledWidth).toBe(lowW * 2);
    expect(report.upscaledHeight).toBe(lowH * 2);
    expect(report.serverCostKrw).toBe(0);

    const secondFrame = report.frames[1]!;
    expect(secondFrame.edgeSharpnessGain).toBeGreaterThan(1.03);
    expect(secondFrame.temporalAcceptRatio).toBeGreaterThan(0.5);
    expect(secondFrame.slabByteFootprint % WASM64_WAVE14_SLAB_ALIGNMENT_BYTES).toBe(BigInt(0));

    // 모든 출력 휘도가 오버슈트·언더슈트 없이 [0, 1] 안에 머물러야 한다.
    for (const frame of report.frames) {
      for (let i = 0; i < frame.luminance2x.length; i += 1) {
        const v = frame.luminance2x[i] ?? -1;
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }

    // 시간 누적 업스케일이 독립 프레임 충격 샤프닝 대비 모션 정렬 쉬머 잔차를 줄여야 한다.
    expect(report.temporalShimmerIndex).toBeLessThan(report.independentBaselineShimmerIndex);
    expect(report.shimmerReductionRatio).toBeGreaterThan(0.12);
  });
});

describe("wasm64-wave14-masterpiece: 사전 적분 피부 SSS · 갈필/먹물 고임 · 시네마 할레이션", () => {
  it("그림자 터미네이터에 따뜻한 적색 산란광을 형성하고 얇은 귀·손끝 실루엣에 역광을 투과시킨다", () => {
    const lut = buildPreIntegratedSkinSssLut("sunlit-amber", 32);
    expect(lut.size).toBe(32);
    expect(lut.slabByteFootprint % WASM64_WAVE14_RENDER_ALIGNMENT_BYTES).toBe(BigInt(0));

    // 그림자 경계(ndotl = 0)에서 적색 확산 조도가 녹색·청색보다 뚜렷하게 높아야 한다.
    const [termR, termG, termB] = samplePreIntegratedSkinLut(lut, 0.0, 0.75);
    expect(termR).toBeGreaterThan(termG);
    expect(termG).toBeGreaterThan(termB);

    const width = 24;
    const height = 16;
    const count = width * height;
    const albedoSrgb = new Float32Array(count * 3);
    const ndotlField = new Float32Array(count);
    const thicknessMmField = new Float32Array(count);
    const backLightField = new Float32Array(count);
    const skinMaskField = new Float32Array(count);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        albedoSrgb[idx * 3] = 0.92;
        albedoSrgb[idx * 3 + 1] = 0.78;
        albedoSrgb[idx * 3 + 2] = 0.71;
        // 좌측(-0.8, 역광 그늘)에서 우측(+0.8, 순광)으로 이어지는 구면 조명
        ndotlField[idx] = (x / (width - 1)) * 1.6 - 0.8;
        // 상단 절반은 얇은 귀·손끝(1.6mm), 하단 절반은 두꺼운 볼·몸통(18mm)
        thicknessMmField[idx] = y < height / 2 ? 1.6 : 18.0;
        backLightField[idx] = x < 8 ? 0.92 : 0.1;
        skinMaskField[idx] = y === height - 1 ? 0.0 : 1.0;
      }
    }

    const result = shadeSkinSubsurfaceBuffer({
      width,
      height,
      albedoSrgb,
      ndotlField,
      thicknessMmField,
      backLightField,
      skinMaskField,
      preset: "sunlit-amber",
      precomputedLut: lut,
    });

    expect(result.terminatorWarmthGain).toBeGreaterThan(0.03);
    expect(result.thinBacklightPeakRedLinear).toBeGreaterThan(0.25);
    expect(result.serverCostKrw).toBe(0);

    // 동일 역광(x = 2) 조건에서 얇은 귀(y = 3)가 두꺼운 몸통(y = 11)보다 적색 채널이 훨씬 밝아야 한다.
    const thinEarRed = result.shadedSrgb[(3 * width + 2) * 3] ?? 0;
    const thickTorsoRed = result.shadedSrgb[(11 * width + 2) * 3] ?? 0;
    expect(thinEarRed).toBeGreaterThan(thickTorsoRed + 0.12);
    expect(SKIN_SSS_PROFILES["warm-peach-toon"].diffusionSigmaRgb[0]).toBeGreaterThan(
      SKIN_SSS_PROFILES["warm-peach-toon"].diffusionSigmaRgb[2],
    );
    expect(WGSL_PREINTEGRATED_SKIN_SSS_SHADER).toContain("eval_backlight_translucency");
  });

  it("고속·저잉크 구간에서 강모 갈필(`갈필`) 결을 만들고 정지 지점에 먹물 고임(`먹물 고임`) 테두리를 형성한다", () => {
    // 1) 고속 저잉크 갈필 스트로크 시뮬레이션
    const dryBrushSim = new SplitBristleInkPoolingSimulator({
      preset: "coarse-sumi-hake",
      bristleCount: 28,
      baseRadiusPx: 9.0,
      initialInkLoad01: 0.34,
      inkDepletionPerPx: 0.0045,
      criticalSplitSpeedPxPerSec: 320,
      paperRoughness01: 0.62,
      poolingStrength: 0,
      seed: 7,
    });

    const fastSamples: BristleStrokeSample[] = [];
    for (let i = 0; i <= 8; i += 1) {
      fastSamples.push({
        x: 10 + i * 12,
        y: 32,
        pressure01: 0.65,
        timestampMs: i * 8, // 1500 px/s 고속 스윕
      });
    }
    const dryReport = dryBrushSim.simulateStroke(fastSamples, 128, 64);
    expect(dryReport.peakSplitClusterCount).toBeGreaterThanOrEqual(2);
    expect(dryReport.dryBrushStreakVoidRatio).toBeGreaterThan(0.15);
    expect(dryReport.dryBrushStreakVoidRatio).toBeLessThan(0.95);
    expect(dryReport.remainingMeanInk01).toBeLessThan(0.34);
    expect(dryReport.serverCostKrw).toBe(0);

    // 2) 획 끝 정지 체류 시 모세관 먹물 고임(테두리 고리 농도 > 중심 농도) 시뮬레이션
    const poolingSim = new SplitBristleInkPoolingSimulator({
      preset: "split-g-pen",
      bristleCount: 18,
      baseRadiusPx: 8.5,
      initialInkLoad01: 0.92,
      poolingStrength: 0.85,
      seed: 11,
    });
    const stopSamples: BristleStrokeSample[] = [
      { x: 20, y: 32, pressure01: 0.55, timestampMs: 0 },
      { x: 42, y: 32, pressure01: 0.65, timestampMs: 45 },
      { x: 43, y: 32, pressure01: 0.72, timestampMs: 135 }, // 획 끝 정지 체류
    ];
    const poolReport = poolingSim.simulateStroke(stopSamples, 96, 64);
    expect(poolReport.poolingRingToCenterRatio).toBeGreaterThan(1.06);
    expect(poolReport.slabByteFootprint % WASM64_WAVE14_RENDER_ALIGNMENT_BYTES).toBe(BigInt(0));

    // 빈 입력 스트로크도 예외 없이 안전하게 처리해야 한다.
    const emptyReport = poolingSim.simulateStroke([], 32, 32);
    expect(emptyReport.dryBrushStreakVoidRatio).toBe(0);
  });

  it("고휘도 광원 주변 적색 유제층 할레이션과 중저휘도 밴딩 억제 유기 입자를 동시에 달성한다", () => {
    const width = 48;
    const height = 36;
    const imageSrgb = new Float32Array(width * height * 3);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = (y * width + x) * 3;
        // 배경은 8비트 밴딩이 잘 드러나는 완만한 중저휘도 그라데이션으로 구성
        const grad = 0.16 + (x / (width - 1)) * 0.12;
        imageSrgb[idx] = grad;
        imageSrgb[idx + 1] = grad;
        imageSrgb[idx + 2] = grad;

        // 좌측 상단 모서리(순흑 먹)와 우측 하단 모서리(순백 여백) 보존 영역 배치
        if (x < 3 && y < 3) {
          imageSrgb[idx] = 0;
          imageSrgb[idx + 1] = 0;
          imageSrgb[idx + 2] = 0;
        } else if (x >= width - 3 && y >= height - 3) {
          imageSrgb[idx] = 1;
          imageSrgb[idx + 1] = 1;
          imageSrgb[idx + 2] = 1;
        }

        // 중앙에 고휘도 백색 역광 하이라이트 광원 배치
        if (Math.hypot(x - 24, y - 18) <= 2.6) {
          imageSrgb[idx] = 0.99;
          imageSrgb[idx + 1] = 0.99;
          imageSrgb[idx + 2] = 0.99;
        }
      }
    }

    const finished = applyCinemaHalationBloomGrain({
      width,
      height,
      imageSrgb,
      halationThreshold: 0.65,
      halationStrength: 0.72,
      halationRadiusPx: 4.5,
      bloomStrength: 0.18,
      grainStrength: 0.032,
      frameSeed: 21,
    });

    // 광원 바깥 프린지에서 적색 유제층 산란이 청색보다 압도적으로 우세해야 한다.
    expect(finished.redHalationDominanceRatio).toBeGreaterThan(2.2);
    // 완만한 그라데이션 구간의 8비트 양자화 평탄 계단(banding)이 크게 줄어들어야 한다.
    expect(finished.bandingStepReductionRatio).toBeGreaterThan(0.35);
    expect(finished.highlightRollOffPeak).toBeLessThanOrEqual(1.0);
    expect(finished.serverCostKrw).toBe(0);

    // 순흑 먹 코너(0, 0)는 할레이션 반경 밖이며 휘도 벨 마스크가 0이므로 깊은 흑색을 유지해야 한다.
    expect(finished.finishedSrgb[0] ?? 1).toBeLessThan(0.01);
    // 순백 여백 코너(width - 1, height - 1)도 입자 오염 없이 높은 순백 휘도를 유지해야 한다.
    const brOffset = ((height - 1) * width + (width - 1)) * 3;
    expect(finished.finishedSrgb[brOffset] ?? 0).toBeGreaterThan(0.95);
    expect(WGSL_CINEMA_HALATION_GRAIN_SHADER).toContain("luminance_bell_mask");
  });

  it("stochastic-sand 및 dramatic-cross 스크린톤 프리셋이 순백·순흑 경계와 교차 해칭을 정확히 처리한다", () => {
    const w = 48;
    const h = 48;
    const tones = new Float32Array(w * h);
    for (let i = 0; i < tones.length; i += 1) {
      tones[i] = i < w * 6 ? 0 : i >= w * (h - 6) ? 1 : 0.55;
    }

    const sand = synthesizeRosetteFreeScreentone({
      width: w,
      height: h,
      toneDensity: tones,
      preset: "stochastic-sand",
      zoomScale: 1.2,
      targetDpi: 300,
    });
    expect(sand.bandWeights.amCarrierWeight).toBe(0);
    expect(sand.bandWeights.fmBlueNoiseWeight).toBe(1);
    expect(sand.inkCoverage[0]).toBe(0);
    expect(sand.inkCoverage[w * h - 1]).toBe(1);
    expect(sand.moireBeatingIndex).toBeLessThan(0.04);

    const cross = synthesizeRosetteFreeScreentone({
      width: w,
      height: h,
      toneDensity: tones,
      preset: "dramatic-cross",
      zoomScale: 1.0,
      targetDpi: DEFAULT_PRINT_DPI,
    });
    expect(cross.bandWeights.amCarrierWeight).toBeGreaterThan(0.5);
    expect(cross.moireBeatingIndex).toBeLessThan(0.08);
  });

  it("업스케일러 resetHistory 호출 시 이전 프레임 잔상 없이 결정론적 단일 프레임 복원으로 초기화된다", () => {
    const lowW = 16;
    const lowH = 16;
    const fA = createSubpixelLineFrame(lowW, lowH, 0.2, 0.3);
    const fB = createSubpixelLineFrame(lowW, lowH, -1.2, 0.9);

    const upscaler = new SpatiotemporalMotionToonUpscaler({ baseTemporalBlend: 0.7 });
    const freshA = upscaler.upscaleFrame(fA, lowW, lowH);
    expect(freshA.temporalAcceptRatio).toBe(0);

    const afterHistoryB = upscaler.upscaleFrame(fB, lowW, lowH);
    expect(afterHistoryB.temporalAcceptRatio).toBeGreaterThan(0.5);

    upscaler.resetHistory();
    const resetA = upscaler.upscaleFrame(fA, lowW, lowH);
    expect(resetA.temporalAcceptRatio).toBe(0);
    expect(Array.from(resetA.luminance2x)).toEqual(Array.from(freshA.luminance2x));
  });

  it("비피부 영역(skinMask = 0)은 적색 산란 번짐 없이 차가운 램버트 조명을 유지하고 동양 붓펜 프리셋이 동작한다", () => {
    const width = 8;
    const height = 8;
    const count = width * height;
    const albedoSrgb = new Float32Array(count * 3).fill(0.75);
    const ndotlField = new Float32Array(count).fill(-0.15);
    const thicknessMmField = new Float32Array(count).fill(2.0);
    const backLightField = new Float32Array(count).fill(0.95);
    const skinMaskOff = new Float32Array(count).fill(0);
    const skinMaskOn = new Float32Array(count).fill(1);

    const clothOut = shadeSkinSubsurfaceBuffer({
      width,
      height,
      albedoSrgb,
      ndotlField,
      thicknessMmField,
      backLightField,
      skinMaskField: skinMaskOff,
      preset: "porcelain-cool-light",
    });
    const skinOut = shadeSkinSubsurfaceBuffer({
      width,
      height,
      albedoSrgb,
      ndotlField,
      thicknessMmField,
      backLightField,
      skinMaskField: skinMaskOn,
      preset: "porcelain-cool-light",
    });

    // 의상/금속 등 skinMask=0 픽셀은 역광 피부 투과가 적용된 피부 픽셀보다 적색 휘도가 낮아야 한다.
    expect(skinOut.shadedSrgb[0] ?? 0).toBeGreaterThan((clothOut.shadedSrgb[0] ?? 0) + 0.1);

    const fudeSim = new SplitBristleInkPoolingSimulator({ preset: "oriental-fude-pen", seed: 3 });
    const stroke = fudeSim.simulateStroke(
      [
        { x: 10, y: 16, pressure01: 0.35, timestampMs: 0 },
        { x: 26, y: 18, pressure01: 0.85, timestampMs: 25 },
        { x: 27, y: 18, pressure01: 0.8, timestampMs: 90 },
      ],
      48,
      36,
    );
    let maxDensity = 0;
    for (let i = 0; i < stroke.inkDensityGrid.length; i += 1) {
      if ((stroke.inkDensityGrid[i] ?? 0) > maxDensity) {
        maxDensity = stroke.inkDensityGrid[i] ?? 0;
      }
    }
    expect(maxDensity).toBeGreaterThan(0.5);
    expect(stroke.poolingRingToCenterRatio).toBeGreaterThan(1.02);
  });
});
