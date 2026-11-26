import { describe, expect, it } from "vitest";
import {
  applyCalibratedStrokeFilter,
  ARKIT_52_BLENDSHAPE_NAMES,
  calibrateArtistTremorFilter,
  closeLineArtGapsAndAutoFlat,
  composeSandwichPreviewRgba,
  createNeutralWebcamFaceLandmarks,
  createWetPaperLbmState,
  depositWetPigmentBrush,
  GBUFFER_DEPTH_LAYER_ORDER,
  generatePaperFiberHeightmap,
  layoutCurvedVariableSfx,
  OneEuroKalmanStrokeFilter,
  relight3dgsSceneSh,
  SH_C0,
  solveCameraFromVanishingGuides,
  split3dGbufferIntoDepthLayers,
  stepWetPaperLbmCpu,
  synthesizeMotionSmearAndSpeedlines,
  validate3dgsRelightWgslSource,
  validateWetPaperLbmWgslSource,
  WebcamVrmExpressionPoseSolver,
  WGSL_3DGS_SH_RELIGHT_WEATHER,
  WGSL_WET_PAPER_LBM_V2,
  type GaussianSplatSceneInput,
  type PerspectiveGuideLine,
  type RawStrokeSample,
  type SkeletonBoneSample,
  type VectorLineStroke,
  type WebcamFaceLandmarks,
} from "./index";

describe("Super-Gap Pillar A: Drawing, Wet Paper LBM, Curved MSDF SFX, Auto-Flat & Tremor FFT (#1~#4)", () => {
  it("#1 WebGPU Wet Paper LBM v2: WGSL validation, 3 paper presets, capillary diffusion, granulation & drying timer", () => {
    const wgsl = validateWetPaperLbmWgslSource(WGSL_WET_PAPER_LBM_V2);
    expect(wgsl.valid).toBe(true);
    expect(wgsl.hasComputeEntry).toBe(true);
    expect(wgsl.hasD2q9Weights).toBe(true);
    expect(wgsl.hasGranulationPass).toBe(true);
    expect(wgsl.hasEvaporationTimer).toBe(true);

    const cold = generatePaperFiberHeightmap(32, 32, "cold-press", 42);
    const hot = generatePaperFiberHeightmap(32, 32, "hot-press", 42);
    const hanji = generatePaperFiberHeightmap(32, 32, "hanji", 42);

    expect(cold.roughnessStdDev).toBeGreaterThan(hot.roughnessStdDev * 2.0);
    expect(hanji.meanAnisotropy).toBeGreaterThan(cold.meanAnisotropy * 3.0);
    expect(hanji.meanAnisotropy).toBeGreaterThan(hot.meanAnisotropy * 6.0);

    // Cold-press 습식 붓질 -> 모세관 확산 + 골짜기 과립 침강 + 질량 보존 + 증발 건조
    const state = createWetPaperLbmState(24, 24, "cold-press", 77);
    const affected = depositWetPigmentBrush(state, {
      centerX: 12,
      centerY: 12,
      radiusPx: 4,
      waterAmount: 0.65,
      pigmentRgba: [0.15, 0.32, 0.78, 1.0],
      pigmentLoad: 0.9,
      velocityX: 0.08,
      velocityY: 0.02,
    });
    expect(affected).toBeGreaterThan(30);

    let initialMass = 0;
    for (let i = 0; i < state.width * state.height; i += 1) {
      initialMass += state.pigmentMobile[i * 4 + 3];
    }
    expect(initialMass).toBeGreaterThan(10);

    const step1 = stepWetPaperLbmCpu(state, { dtSec: 0.25 });
    expect(step1.wetCellCount).toBeGreaterThan(0);
    expect(step1.maxDryingTimerSec).toBeGreaterThan(0);
    expect(step1.totalPigmentMass).toBeCloseTo(initialMass, 2);

    let midMetrics = step1;
    for (let s = 0; s < 14; s += 1) {
      midMetrics = stepWetPaperLbmCpu(state, { dtSec: 0.35 });
    }
    // 브러시 반경 바깥(17,12)으로도 모세관 확산 + 안료 질량 보존 + 증발 감소
    const outerIdx = 12 * state.width + 17;
    const outerPigment =
      state.pigmentMobile[outerIdx * 4 + 3] + state.pigmentSettled[outerIdx * 4 + 3];
    expect(outerPigment).toBeGreaterThan(1e-4);
    expect(midMetrics.totalPigmentMass).toBeCloseTo(initialMass, 2);
    expect(midMetrics.totalWater).toBeLessThan(step1.totalWater);

    // 완전 건조까지 증발 진행 -> 이동 안료 0, 전체 고착 및 건조 타이머 0
    let dryMetrics = midMetrics;
    for (let s = 0; s < 80 && !dryMetrics.isFullyDry; s += 1) {
      dryMetrics = stepWetPaperLbmCpu(state, { dtSec: 0.5, evaporationMultiplier: 1.5 });
    }
    expect(dryMetrics.isFullyDry).toBe(true);
    expect(dryMetrics.maxDryingTimerSec).toBe(0);
    expect(dryMetrics.totalMobilePigment).toBeCloseTo(0, 5);
    expect(dryMetrics.totalSettledPigment).toBeCloseTo(initialMass, 2);

    // 균일 수채 워시에서 골짜기(valley) 과립 침강이 봉우리(peak)보다 현저히 높음을 검증
    const wash = createWetPaperLbmState(24, 24, "cold-press", 101);
    depositWetPigmentBrush(wash, {
      centerX: 12,
      centerY: 12,
      radiusPx: 18,
      waterAmount: 0.85,
      pigmentRgba: [0.1, 0.25, 0.72, 1.0],
      pigmentLoad: 0.8,
    });
    let washMetrics = stepWetPaperLbmCpu(wash, { dtSec: 0.2 });
    for (let s = 0; s < 6; s += 1) {
      washMetrics = stepWetPaperLbmCpu(wash, { dtSec: 0.2 });
    }
    expect(washMetrics.valleyToPeakGranulationRatio).toBeGreaterThan(1.35);
  });

  it("#2 Variable-Font Curved-Path Triple-Outline MSDF SFX: Hangul cubic Bezier & EN radial explosion", () => {
    const hangulLayout = layoutCurvedVariableSfx({
      text: "콰과광!",
      curve: {
        kind: "cubic-bezier",
        p0: { x: 40, y: 220 },
        p1: { x: 140, y: 60 },
        p2: { x: 300, y: 60 },
        p3: { x: 420, y: 200 },
      },
      baseFontSizePx: 54,
      axes: {
        weightStart: 350,
        weightEnd: 900,
        slantStartDeg: -12,
        slantEndDeg: 14,
        scaleStart: 0.85,
        scaleEnd: 1.45,
        easing: "ease-out",
      },
      msdfPxRange: 10,
    });

    expect(hangulLayout.glyphs).toHaveLength(4);
    expect(hangulLayout.totalArcLengthPx).toBeGreaterThan(360);
    expect(hangulLayout.glyphs[0].isHangul).toBe(true);
    expect(hangulLayout.glyphs[3].isPunctuation).toBe(true);
    expect(hangulLayout.glyphs[3].fontWeight).toBeGreaterThan(hangulLayout.glyphs[0].fontWeight);
    expect(hangulLayout.glyphs[3].fontSlantDeg).toBeGreaterThan(hangulLayout.glyphs[0].fontSlantDeg);
    expect(hangulLayout.glyphs[3].arcLengthPx).toBeGreaterThan(hangulLayout.glyphs[0].arcLengthPx);

    // 3겹 잉크 외곽선 디스크립터(inner-core -> mid-knockout -> outer-impact) 검증
    for (let i = 0; i < hangulLayout.glyphs.length; i += 1) {
      const outlines = hangulLayout.glyphs[i].outlines;
      expect(outlines).toHaveLength(3);
      expect(outlines[0].role).toBe("inner-core");
      expect(outlines[1].role).toBe("mid-knockout");
      expect(outlines[2].role).toBe("outer-impact");
      expect(outlines[0].cumulativeExpandPx).toBeLessThan(outlines[1].cumulativeExpandPx);
      expect(outlines[1].cumulativeExpandPx).toBeLessThan(outlines[2].cumulativeExpandPx);
      expect(outlines[0].msdfDistanceThreshold).toBeGreaterThan(outlines[1].msdfDistanceThreshold);
      expect(outlines[1].msdfDistanceThreshold).toBeGreaterThan(outlines[2].msdfDistanceThreshold);
    }

    const radialLayout = layoutCurvedVariableSfx({
      text: "BOOM!",
      curve: {
        kind: "radial-explosion",
        center: { x: 250, y: 250 },
        startRadiusPx: 90,
        endRadiusPx: 165,
        startAngleRad: -Math.PI * 0.75,
        sweepAngleRad: Math.PI * 0.9,
        burstWaveAmpPx: 8,
        burstWaveFreq: 5,
      },
      baseFontSizePx: 48,
      axes: {
        weightStart: 400,
        weightEnd: 900,
        slantStartDeg: -8,
        slantEndDeg: 8,
        scaleStart: 0.9,
        scaleEnd: 1.5,
        easing: "impact-peak",
      },
      impactJitterPx: 4,
    });

    expect(radialLayout.curveKind).toBe("radial-explosion");
    expect(radialLayout.glyphs).toHaveLength(5);
    // impact-peak 이징으로 중앙 글리프('O')가 가장 두껍고 크다.
    expect(radialLayout.glyphs[2].fontWeight).toBeGreaterThan(radialLayout.glyphs[0].fontWeight);
    expect(radialLayout.glyphs[2].scale).toBeGreaterThan(radialLayout.glyphs[4].scale);
    expect(radialLayout.bounds.width).toBeGreaterThan(100);
  });

  it("#3 Vector Gap-Closing & Zero-Token Auto-Flatting: bridges endpoint & T-junction gaps into distinct flatting IDs (0 AI tokens)", () => {
    // 외곽 사각형(우하단 6px 끝점↔끝점 틈새 존재) + 중앙 수직 분할선(하단 5px T-접합 틈새 존재)
    const strokes: VectorLineStroke[] = [
      {
        id: "outer-top-left",
        points: [
          { x: 16, y: 16 },
          { x: 112, y: 16 },
          { x: 112, y: 106 }, // (112,112)까지 6px 틈새
        ],
        widthPx: 2,
      },
      {
        id: "outer-bottom-left",
        points: [
          { x: 112, y: 112 },
          { x: 16, y: 112 },
          { x: 16, y: 16 },
        ],
        widthPx: 2,
      },
      {
        id: "center-divider",
        points: [
          { x: 64, y: 16 },
          { x: 64, y: 107 }, // 하단 변(y=112)까지 5px T-접합 틈새
        ],
        widthPx: 2,
      },
    ];

    const result = closeLineArtGapsAndAutoFlat({
      strokes,
      canvasWidth: 128,
      canvasHeight: 128,
      maxGapPx: 10,
      lineRasterWidthPx: 2,
      minRegionAreaPx: 20,
    });

    expect(result.aiTokensUsed).toBe(0);
    // 틈새 폐합 전에는 외곽으로 누수되어 폐영역이 0개
    expect(result.enclosedRegionCountBeforeGapClose).toBe(0);
    // 끝점↔끝점 및 T-접합 브릿지 모두 생성되어 정확히 2개의 독립 밑색 영역으로 분할
    expect(result.bridges.some((b) => b.kind === "endpoint-to-endpoint")).toBe(true);
    expect(result.bridges.some((b) => b.kind === "endpoint-to-segment")).toBe(true);
    expect(result.enclosedRegionCount).toBe(2);
    expect(result.regions).toHaveLength(2);

    const leftSampleId = result.labelMap[64 * 128 + 38];
    const rightSampleId = result.labelMap[64 * 128 + 90];
    const exteriorId = result.labelMap[4 * 128 + 4];
    expect(exteriorId).toBe(0);
    expect(leftSampleId).toBeGreaterThan(0);
    expect(rightSampleId).toBeGreaterThan(0);
    expect(leftSampleId).not.toBe(rightSampleId);

    // 인접 두 영역이 서로 다른 밑색 팔레트 색상을 부여받음
    const r0 = result.regions[0].flatColorRgba;
    const r1 = result.regions[1].flatColorRgba;
    const colorDiff =
      Math.abs(r0[0] - r1[0]) + Math.abs(r0[1] - r1[1]) + Math.abs(r0[2] - r1[2]);
    expect(colorDiff).toBeGreaterThan(0.05);
  });

  it("#4 Personalized Hand-Tremor FFT Kalman / One-Euro Auto-Calibrator: detects 8Hz tremor, attenuates jitter & preserves 90° corners", () => {
    const buildStrokes = (tremorAmpPx: number, tremorHz: number): RawStrokeSample[][] => {
      const strokes: RawStrokeSample[][] = [];
      for (let s = 0; s < 20; s += 1) {
        const samples: RawStrokeSample[] = [];
        const dtMs = 1000 / 120; // 120Hz
        for (let i = 0; i < 128; i += 1) {
          const tSec = (i * dtMs) / 1000;
          // 앞 절반은 수평, 뒤 절반은 90도 꺾어 수직 이동(의도적 코너 포함)
          const baseX = i <= 64 ? 40 + i * 2.2 : 40 + 64 * 2.2;
          const baseY = i <= 64 ? 100 : 100 + (i - 64) * 2.2;
          const phase = 2 * Math.PI * tremorHz * tSec + s * 0.4;
          const jitterX = Math.cos(phase) * tremorAmpPx * 0.45;
          const jitterY = Math.sin(phase) * tremorAmpPx;
          samples.push({
            x: baseX + jitterX,
            y: baseY + jitterY,
            timestampMs: i * dtMs,
            pressure: 0.75,
          });
        }
        strokes.push(samples);
      }
      return strokes;
    };

    const shakyProfile = calibrateArtistTremorFilter(buildStrokes(2.6, 8.0));
    const steadyProfile = calibrateArtistTremorFilter(buildStrokes(0.12, 8.0));

    expect(shakyProfile.isFullCalibration).toBe(true);
    expect(shakyProfile.analyzedStrokeCount).toBe(20);
    expect(shakyProfile.detectedCornerCount).toBeGreaterThanOrEqual(15);
    expect(shakyProfile.spectrum.dominantTremorHz).toBeGreaterThan(6.5);
    expect(shakyProfile.spectrum.dominantTremorHz).toBeLessThan(9.5);
    expect(shakyProfile.spectrum.tremorRmsPx).toBeGreaterThan(steadyProfile.spectrum.tremorRmsPx * 4);
    expect(shakyProfile.oneEuro.minCutoffHz).toBeLessThan(steadyProfile.oneEuro.minCutoffHz);
    expect(shakyProfile.tremorSeverity === "moderate" || shakyProfile.tremorSeverity === "strong").toBe(true);
    expect(steadyProfile.tremorSeverity).toBe("steady");

    // 1) 8Hz 떨림 직선에서 측면 RMS 오차가 크게 감소해야 함
    const shakyLine: RawStrokeSample[] = [];
    for (let i = 0; i < 120; i += 1) {
      const tSec = i / 120;
      shakyLine.push({
        x: 20 + i * 1.5,
        y: 120 + Math.sin(2 * Math.PI * 8 * tSec) * 3.0,
        timestampMs: tSec * 1000,
      });
    }
    const filteredLine = applyCalibratedStrokeFilter(shakyLine, shakyProfile);
    let rawSq = 0;
    let filtSq = 0;
    for (let i = 20; i < shakyLine.length; i += 1) {
      rawSq += (shakyLine[i].y - 120) * (shakyLine[i].y - 120);
      filtSq += (filteredLine[i].y - 120) * (filteredLine[i].y - 120);
    }
    const rawRms = Math.sqrt(rawSq / (shakyLine.length - 20));
    const filtRms = Math.sqrt(filtSq / (shakyLine.length - 20));
    expect(filtRms).toBeLessThan(rawRms * 0.55);

    // 2) 의도적 90도 코너 보존 검증
    const cornerStroke: RawStrokeSample[] = [];
    for (let i = 0; i <= 40; i += 1) {
      const x = i <= 20 ? 50 + i * 6 : 170;
      const y = i <= 20 ? 50 : 50 + (i - 20) * 6;
      cornerStroke.push({ x, y, timestampMs: i * (1000 / 60) });
    }
    const filter = new OneEuroKalmanStrokeFilter(shakyProfile);
    const outCorner = cornerStroke.map((pt) => filter.push(pt));
    expect(outCorner.some((s) => s.cornerPreserved)).toBe(true);
    // 코너 정점(170, 50) 최근접 오차가 작아야 함
    let minCornerDist = Number.POSITIVE_INFINITY;
    for (let i = 15; i <= 26; i += 1) {
      const d = Math.hypot(outCorner[i].x - 170, outCorner[i].y - 50);
      if (d < minCornerDist) minCornerDist = d;
    }
    expect(minCornerDist).toBeLessThan(4.0);
  });
});

describe("Super-Gap Pillar B: Webcam VRM, 3DGS SH Relight, PnP Camera, Motion Smear & G-Buffer Split (#5~#9)", () => {
  it("#5 Webcam-to-VRM 52 ARKit Blendshapes & Upper-Body Pose Mirroring + 60fps smoothing + instant cut-freeze", () => {
    expect(ARKIT_52_BLENDSHAPE_NAMES).toHaveLength(52);

    const solver = new WebcamVrmExpressionPoseSolver({
      mirrorHorizontal: true,
      targetFps: 60,
      expressionTauSec: 0.03,
      poseTauSec: 0.05,
    });

    const neutral = createNeutralWebcamFaceLandmarks();
    const initOut = solver.update({ timestampMs: 0, face: neutral });
    expect(Object.keys(initOut.blendshapes)).toHaveLength(52);
    expect(initOut.blendshapes.eyeBlinkLeft).toBeLessThan(0.1);
    expect(initOut.blendshapes.jawOpen).toBeLessThan(0.1);

    // 표정 연출: 우안 윙크(거울 모드 -> 좌안 eyeBlinkLeft 상승) + 큰 미소 + 입 벌림 + 우측 주시 + 어깨 기울임
    const expressiveFace: WebcamFaceLandmarks = {
      ...neutral,
      rightEye: {
        ...neutral.rightEye,
        top: { x: 0.61, y: 0.419 },
        bottom: { x: 0.61, y: 0.422 },
        iris: { x: 0.638, y: 0.42 },
      },
      leftEye: {
        ...neutral.leftEye,
        iris: { x: 0.422, y: 0.42 },
      },
      mouth: {
        ...neutral.mouth,
        leftCorner: { x: 0.39, y: 0.605 },
        rightCorner: { x: 0.61, y: 0.605 },
        upperLipBottom: { x: 0.5, y: 0.625 },
        lowerLipTop: { x: 0.5, y: 0.715 },
        lowerLipBottom: { x: 0.5, y: 0.735 },
      },
    };

    const upperBody = {
      neck: { x: 0.51, y: 0.84 },
      chest: { x: 0.5, y: 0.96 },
      leftShoulder: { x: 0.34, y: 0.85 },
      rightShoulder: { x: 0.66, y: 0.91 },
      leftElbow: { x: 0.28, y: 0.72 },
      leftWrist: { x: 0.36, y: 0.62 },
    };

    // 1프레임(16.67ms) 지수 평활화 -> 점프 없이 부드럽게 이동
    const firstStep = solver.update({ timestampMs: 16.67, face: expressiveFace, upperBody });
    expect(firstStep.smoothingAlphaExpr).toBeGreaterThan(0.2);
    expect(firstStep.smoothingAlphaExpr).toBeLessThan(0.7);
    expect(firstStep.blendshapes.eyeBlinkLeft).toBeGreaterThan(0.2);
    expect(firstStep.blendshapes.eyeBlinkLeft).toBeLessThan(0.95);

    // 15프레임(250ms) 수렴
    let converged = firstStep;
    for (let f = 2; f <= 16; f += 1) {
      converged = solver.update({ timestampMs: f * 16.67, face: expressiveFace, upperBody });
    }
    expect(converged.blendshapes.eyeBlinkLeft).toBeGreaterThan(0.85);
    expect(converged.blendshapes.eyeBlinkRight).toBeLessThan(0.15);
    expect(converged.blendshapes.jawOpen).toBeGreaterThan(0.75);
    expect(converged.blendshapes.mouthSmileLeft).toBeGreaterThan(0.55);
    expect(converged.vrmPresets.happy).toBeGreaterThan(0.5);
    expect(Math.abs(converged.gaze.yawRad)).toBeGreaterThan(0.12);
    expect(Math.abs(converged.pose.shoulderTiltRad)).toBeGreaterThan(0.1);
    expect(converged.pose.rightUpperArmElevationRad).toBeGreaterThan(1.2); // 거울 반전

    // 즉시 컷 동결(cut-freeze snapshot) 후 중립 입력이 들어와도 값 불변 검증
    const snap = solver.freezeCutSnapshot("ep01-cut09");
    expect(solver.isFrozen()).toBe(true);
    expect(snap.cutId).toBe("ep01-cut09");
    const whileFrozen = solver.update({ timestampMs: 400, face: neutral });
    expect(whileFrozen.isFrozen).toBe(true);
    expect(whileFrozen.frozenCutId).toBe("ep01-cut09");
    expect(whileFrozen.blendshapes.eyeBlinkLeft).toBeCloseTo(snap.blendshapes.eyeBlinkLeft, 6);
    expect(whileFrozen.blendshapes.jawOpen).toBeCloseTo(snap.blendshapes.jawOpen, 6);

    solver.unfreeze();
    expect(solver.isFrozen()).toBe(false);
    const afterUnfreeze = solver.update({ timestampMs: 450, face: neutral });
    expect(afterUnfreeze.blendshapes.jawOpen).toBeLessThan(snap.blendshapes.jawOpen);
  });

  it("#6 3DGS SH Time-of-Day Relighting & Depth-Aware Weather Pass (dawn/noon/sunset/night + fog/rain/snow)", () => {
    const wgslCheck = validate3dgsRelightWgslSource(WGSL_3DGS_SH_RELIGHT_WEATHER);
    expect(wgslCheck.valid).toBe(true);

    // 100개 가우시안 스플랫(깊이 3m ~ 38m 분산)
    const count = 100;
    const positions = new Float32Array(count * 3);
    const shL0 = new Float32Array(count * 3);
    const shL1 = new Float32Array(count * 9);
    const opacities = new Float32Array(count).fill(0.95);
    const neutralDc = (0.65 - 0.5) / SH_C0;

    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = ((i % 10) - 4.5) * 1.2;
      positions[i * 3 + 1] = 1.2;
      positions[i * 3 + 2] = 5 - (3 + (i / (count - 1)) * 35); // 카메라 z=5, forward=-z -> depth 3..38m
      shL0[i * 3] = neutralDc;
      shL0[i * 3 + 1] = neutralDc;
      shL0[i * 3 + 2] = neutralDc;
    }

    const scene: GaussianSplatSceneInput = { count, positions, shL0, shL1, opacities };
    const noon = relight3dgsSceneSh(scene, { timeOfDay: "noon", weather: "clear" });
    const dawn = relight3dgsSceneSh(scene, { timeOfDay: "dawn", weather: "fog", particleCount: 40 });
    const sunset = relight3dgsSceneSh(scene, { timeOfDay: "sunset", weather: "rain", particleCount: 120 });
    const night = relight3dgsSceneSh(scene, { timeOfDay: "night", weather: "snow", particleCount: 120 });

    // 시간대 휘도 및 색온도(따뜻함 R/B) 물리 질서 검증
    expect(noon.meanLuminanceAfter).toBeGreaterThan(sunset.meanLuminanceAfter);
    expect(sunset.meanLuminanceAfter).toBeGreaterThan(night.meanLuminanceAfter);
    expect(sunset.meanWarmthRatioAfter).toBeGreaterThan(noon.meanWarmthRatioAfter);
    expect(noon.meanWarmthRatioAfter).toBeGreaterThan(night.meanWarmthRatioAfter);

    // Dawn(+X) vs Sunset(-X) SH L1 X성분 부호 반전 검증
    expect(dawn.shL1Relit[6]).toBeGreaterThan(0);
    expect(sunset.shL1Relit[6]).toBeLessThan(0);

    // 깊이 인식 안개: 원거리 스플랫(마지막)이 근거리 스플랫(첫번째)보다 fogFactor가 훨씬 높음
    expect(dawn.splatFogFactors[count - 1]).toBeGreaterThan(dawn.splatFogFactors[0] + 0.35);

    // 날씨 파티클 물리 특성 & 백-투-프론트 정렬 검증
    expect(noon.particles).toHaveLength(0);
    expect(sunset.particles).toHaveLength(120);
    expect(sunset.particles[0].kind).toBe("rain");
    expect(sunset.particles[0].streakLengthPx).toBeGreaterThan(4);
    expect(sunset.particles[0].velocity[1]).toBeLessThan(-8);
    expect(sunset.particles[0].cameraDepthM).toBeGreaterThanOrEqual(
      sunset.particles[sunset.particles.length - 1].cameraDepthM,
    );

    expect(night.particles).toHaveLength(120);
    expect(night.particles[0].kind).toBe("snow");
    expect(night.particles[0].streakLengthPx).toBe(0);
    expect(night.particles.some((p) => p.occludedByScene)).toBe(true);
  });

  it("#7 2D Rough Vanishing Guides -> 3D Camera PnP Solver: recovers 2-pt & 3-pt focal length (24-135mm), yaw/pitch/roll & horizon in <1ms", () => {
    // 합성 핀홀 카메라로 정확한 소실점과 러프 가이드 선 생성
    const imgW = 1200;
    const imgH = 800;
    const cx = 600;
    const cy = 400;
    const trueFocalMm = 50;
    const trueFocalPx = (trueFocalMm / 36) * imgW;

    const projectAxisVp = (
      yawDeg: number,
      pitchDeg: number,
      rollDeg: number,
      axis: readonly [number, number, number],
    ): { x: number; y: number } => {
      const y = (yawDeg * Math.PI) / 180;
      const p = (pitchDeg * Math.PI) / 180;
      const r = (rollDeg * Math.PI) / 180;
      // R_wc = R_z(-r) * R_x(-p) * R_y(-y)
      const x1 = Math.cos(y) * axis[0] - Math.sin(y) * axis[2];
      const y1 = axis[1];
      const z1 = Math.sin(y) * axis[0] + Math.cos(y) * axis[2];

      const x2 = x1;
      const y2 = Math.cos(p) * y1 + Math.sin(p) * z1;
      const z2 = -Math.sin(p) * y1 + Math.cos(p) * z1;

      const xc = Math.cos(r) * x2 + Math.sin(r) * y2;
      const yc = -Math.sin(r) * x2 + Math.cos(r) * y2;
      const zc = z2;

      const sign = zc < 0 ? 1 : -1;
      const depth = -zc * sign;
      return {
        x: cx + trueFocalPx * ((xc * sign) / depth),
        y: cy - trueFocalPx * ((yc * sign) / depth),
      };
    };

    const makeGuidesToward = (
      vp: { x: number; y: number },
      anchors: readonly { x: number; y: number }[],
    ): PerspectiveGuideLine[] =>
      anchors.map((a, idx) => ({
        id: `g-${idx}`,
        start: a,
        end: {
          x: a.x + (vp.x - a.x) * 0.35 + (idx === 0 ? 0.5 : -0.4),
          y: a.y + (vp.y - a.y) * 0.35,
        },
      }));

    // 3점 투시 (yaw=28°, pitch=-14°, roll=6°, 50mm)
    const vpX = projectAxisVp(28, -14, 6, [1, 0, 0]);
    const vpZ = projectAxisVp(28, -14, 6, [0, 0, 1]);
    const vpY = projectAxisVp(28, -14, 6, [0, 1, 0]);

    const solved3pt = solveCameraFromVanishingGuides({
      imageWidth: imgW,
      imageHeight: imgH,
      xAxisGuides: makeGuidesToward(vpX, [
        { x: 450, y: 550 },
        { x: 520, y: 260 },
        { x: 640, y: 620 },
      ]),
      zAxisGuides: makeGuidesToward(vpZ, [
        { x: 750, y: 560 },
        { x: 680, y: 240 },
        { x: 540, y: 630 },
      ]),
      yAxisGuides: makeGuidesToward(vpY, [
        { x: 350, y: 250 },
        { x: 850, y: 250 },
      ]),
    });

    expect(solved3pt.perspectiveMode).toBe("3-point");
    expect(solved3pt.focalLength35mm).toBeGreaterThanOrEqual(24);
    expect(solved3pt.focalLength35mm).toBeLessThanOrEqual(135);
    expect(Math.abs(solved3pt.focalLength35mm - trueFocalMm)).toBeLessThan(2.5);
    expect(Math.abs(solved3pt.pitchDeg - -14)).toBeLessThan(2.5);
    expect(Math.abs(solved3pt.rollDeg - 6)).toBeLessThan(2.5);
    expect(solved3pt.solveTimeMs).toBeLessThan(process.env.CI ? 50 : 5);

    // 수평선 방정식이 두 수평 소실점(vpX, vpZ)과 정합함 검증
    const horizDistX = Math.abs(
      solved3pt.horizon.a * vpX.x + solved3pt.horizon.b * vpX.y + solved3pt.horizon.c,
    );
    const horizDistZ = Math.abs(
      solved3pt.horizon.a * vpZ.x + solved3pt.horizon.b * vpZ.y + solved3pt.horizon.c,
    );
    expect(horizDistX).toBeLessThan(12);
    expect(horizDistZ).toBeLessThan(12);

    // 2점 투시 (pitch=0°, roll=0°, yaw=35°, 35mm 광각)
    const vpX2 = projectAxisVp(35, 0, 0, [1, 0, 0]);
    const vpZ2 = projectAxisVp(35, 0, 0, [0, 0, 1]);
    const solved2pt = solveCameraFromVanishingGuides({
      imageWidth: imgW,
      imageHeight: imgH,
      xAxisGuides: makeGuidesToward(vpX2, [
        { x: 400, y: 600 },
        { x: 400, y: 200 },
      ]),
      zAxisGuides: makeGuidesToward(vpZ2, [
        { x: 800, y: 600 },
        { x: 800, y: 200 },
      ]),
    });
    expect(solved2pt.perspectiveMode).toBe("2-point");
    expect(Math.abs(solved2pt.pitchDeg)).toBeLessThan(2);
    expect(Math.abs(solved2pt.horizon.yAtCenter - cy)).toBeLessThan(10);
  });

  it("#8 3D Bone Motion-Vector Smear Frame & Radial Speedline Synthesizer", () => {
    const prevPose: SkeletonBoneSample[] = [
      { boneId: "torso", worldPos: [0, 1.0, 0], screenPos: { x: 400, y: 360 }, radiusPx: 28 },
      {
        boneId: "shoulder_r",
        parentId: "torso",
        worldPos: [0.25, 1.35, 0],
        screenPos: { x: 445, y: 290 },
        radiusPx: 14,
      },
      {
        boneId: "hand_r",
        parentId: "shoulder_r",
        worldPos: [0.35, 1.6, 0.1],
        screenPos: { x: 470, y: 210 },
        radiusPx: 10,
        importance: 1.5,
      },
      {
        boneId: "sword_tip",
        parentId: "hand_r",
        worldPos: [0.45, 2.2, 0.2],
        screenPos: { x: 495, y: 120 },
        radiusPx: 7,
        importance: 2.5,
      },
    ];
    const currPose: SkeletonBoneSample[] = [
      { boneId: "torso", worldPos: [0.01, 1.0, 0], screenPos: { x: 402, y: 360 }, radiusPx: 28 },
      {
        boneId: "shoulder_r",
        parentId: "torso",
        worldPos: [0.28, 1.34, 0.04],
        screenPos: { x: 452, y: 292 },
        radiusPx: 14,
      },
      {
        boneId: "hand_r",
        parentId: "shoulder_r",
        worldPos: [0.75, 1.15, 0.35],
        screenPos: { x: 565, y: 315 },
        radiusPx: 10,
        importance: 1.5,
      },
      {
        boneId: "sword_tip",
        parentId: "hand_r",
        worldPos: [1.35, 0.8, 0.55],
        screenPos: { x: 710, y: 390 },
        radiusPx: 7,
        importance: 2.5,
      },
    ];

    const res = synthesizeMotionSmearAndSpeedlines({
      previousPose: prevPose,
      currentPose: currPose,
      deltaTimeSec: 1 / 60,
      canvasWidth: 960,
      canvasHeight: 640,
      smearSpeedThresholdPxPerSec: 450,
      smearArcSubdivisions: 4,
      speedlineCount: 60,
    });

    expect(res.peakBoneId).toBe("sword_tip");
    expect(res.peakSpeedPxPerSec).toBeGreaterThan(10000);
    expect(res.actionIntensity01).toBeGreaterThan(0.9);
    // 고속 회전 본(hand_r, sword_tip)만 스미어 쿼드 생성 (각 4세그먼트 = 8개), torso는 미생성
    expect(res.smearQuads.some((q) => q.boneId === "sword_tip")).toBe(true);
    expect(res.smearQuads.some((q) => q.boneId === "hand_r")).toBe(true);
    expect(res.smearQuads.some((q) => q.boneId === "torso")).toBe(false);
    expect(res.smearQuads[0].vertices).toHaveLength(4);
    expect(res.smearQuads[0].leadingOpacity).toBeGreaterThan(res.smearQuads[0].trailingOpacity);

    // 방사 집중선(speedlines)이 타격 중심 쪽으로 수렴하며 외곽이 더 두꺼움
    expect(res.speedlines.length).toBeGreaterThanOrEqual(45);
    expect(res.impactCenter.x).toBeGreaterThan(580);
    expect(res.speedlines[0].outerWidthPx).toBeGreaterThan(res.speedlines[0].innerWidthPx);

    // 정지 포즈 -> 스미어 0, 집중선 0
    const staticRes = synthesizeMotionSmearAndSpeedlines({
      previousPose: prevPose,
      currentPose: prevPose,
      deltaTimeSec: 1 / 60,
      canvasWidth: 960,
      canvasHeight: 640,
    });
    expect(staticRes.smearQuads).toHaveLength(0);
    expect(staticRes.speedlines).toHaveLength(0);
  });

  it("#9 3D G-Buffer Object-ID Multi-Layer Split Exporter: 6 RGBA depth layers & 2D balloon sandwich compositing", () => {
    const w = 32;
    const h = 32;
    const total = w * h;
    const colorRgba = new Uint8ClampedArray(total * 4);
    const depth = new Float32Array(total);
    const objectIds = new Uint32Array(total);
    const shadowMask = new Float32Array(total);
    const normals = new Float32Array(total * 3);

    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const idx = y * w + x;
        const off = idx * 4;
        const nOff = idx * 3;
        // 기본: 원경 하늘 (objId=0, depth=40m, 파랑)
        objectIds[idx] = 0;
        depth[idx] = 40.0;
        colorRgba[off] = 110;
        colorRgba[off + 1] = 170;
        colorRgba[off + 2] = 235;
        colorRgba[off + 3] = 255;
        normals[nOff] = 0;
        normals[nOff + 1] = 0;
        normals[nOff + 2] = 1;

        // 중경 가구 (objId=20, depth=10m, 하단 영역)
        if (y >= 18) {
          objectIds[idx] = 20;
          depth[idx] = 10.0;
          colorRgba[off] = 140;
          colorRgba[off + 1] = 105;
          colorRgba[off + 2] = 75;
          if (x >= 10 && x <= 22 && y >= 22 && y <= 26) {
            shadowMask[idx] = 0.8;
          }
        }
        // 캐릭터 (objId=10, depth=5m, 중앙 x=8..20, y=6..24)
        if (x >= 8 && x <= 20 && y >= 6 && y <= 24) {
          objectIds[idx] = 10;
          depth[idx] = 5.0;
          colorRgba[off] = 230;
          colorRgba[off + 1] = 80;
          colorRgba[off + 2] = 90;
          normals[nOff] = x < 14 ? -0.45 : 0.45;
          normals[nOff + 1] = 0;
          normals[nOff + 2] = 0.89;
        }
        // 전경 기둥 소품 (objId=30, depth=1.5m, 우측 x=18..28, y=4..28)
        if (x >= 18 && x <= 28 && y >= 4 && y <= 28) {
          objectIds[idx] = 30;
          depth[idx] = 1.5;
          colorRgba[off] = 40;
          colorRgba[off + 1] = 185;
          colorRgba[off + 2] = 115;
        }
      }
    }

    const split = split3dGbufferIntoDepthLayers({
      width: w,
      height: h,
      colorRgba,
      depth,
      objectIds,
      normals,
      shadowMask,
      objectRegistry: {
        0: "distant-backdrop",
        10: "character",
        20: "mid-furniture",
        30: "foreground-prop",
      },
    });

    expect(split.orderedLayers.map((l) => l.id)).toEqual([...GBUFFER_DEPTH_LAYER_ORDER]);
    for (let i = 0; i < GBUFFER_DEPTH_LAYER_ORDER.length; i += 1) {
      const id = GBUFFER_DEPTH_LAYER_ORDER[i];
      expect(split.layers[id].nonTransparentPixels).toBeGreaterThan(0);
    }
    expect(split.totalLineArtPixels).toBeGreaterThan(40);
    expect(split.totalShadowPixels).toBeGreaterThan(15);

    // 2D 노란 말풍선을 character 뒤가 아닌 "character" 직후(전경 소품 뒤!)에 샌드위치 삽입
    const balloonRgba = new Uint8ClampedArray(total * 4);
    for (let y = 10; y <= 16; y += 1) {
      for (let x = 12; x <= 24; x += 1) {
        const off = (y * w + x) * 4;
        balloonRgba[off] = 250;
        balloonRgba[off + 1] = 235;
        balloonRgba[off + 2] = 60;
        balloonRgba[off + 3] = 255;
      }
    }

    const composed = composeSandwichPreviewRgba(split, [
      { id: "balloon-1", insertAfterLayer: "character", rgba: balloonRgba },
    ]);

    // (14, 13): 캐릭터 영역 + 말풍선 영역(전경 없음, 선화 경계 아님) -> 노란 말풍선이 캐릭터 위에 표시됨
    const onCharOff = (13 * w + 15) * 4;
    expect(composed[onCharOff]).toBeGreaterThan(220);
    expect(composed[onCharOff + 1]).toBeGreaterThan(200);
    expect(composed[onCharOff + 2]).toBeLessThan(90);

    // (22, 13): 전경 소품 영역 + 말풍선 영역 -> 전경 소품(녹색 40,185,115)이 말풍선을 앞쪽에서 가림!
    const behindPropOff = (13 * w + 22) * 4;
    expect(composed[behindPropOff]).toBeLessThan(70);
    expect(composed[behindPropOff + 1]).toBeGreaterThan(160);
    expect(composed[behindPropOff + 2]).toBeGreaterThan(95);
  });
});
