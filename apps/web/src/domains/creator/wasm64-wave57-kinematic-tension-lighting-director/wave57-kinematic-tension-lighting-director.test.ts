import { describe, expect, it } from "vitest";
import {
  DEFAULT_MOOD_LUT_SIZE,
  NEUTRAL_DAYLIGHT_KELVIN,
  SCENE_LIGHTING_MOODS,
  TONE_CURVE_1D_LENGTH,
  analyzeCreativeCadenceAndMood,
  applyMoodGradingToRgba,
  buildMoodColorGradingLut,
  buildToneCurve1DTable,
  createInitialDampedLightingState,
  evaluateMoodToneCurve1D,
  kelvinToLinearRgb,
  shortestAngleDeltaDeg,
  solveDynamicCutLightingRig,
  stepDampedLightingRig,
  type CreativeStrokeTelemetrySample,
  type CutNarrativeMetadata,
  type DynamicThreePointLightingRig,
  type SceneBaseLightingConstraints,
} from "./index";

function buildCalmStrokes(): readonly CreativeStrokeTelemetrySample[] {
  return [
    { speedPxPerSec: 180, pressure: 0.42, durationMs: 420, pauseAfterMs: 1_250, curvatureJitter: 0.06 },
    { speedPxPerSec: 195, pressure: 0.44, durationMs: 400, pauseAfterMs: 1_180, curvatureJitter: 0.05 },
    { speedPxPerSec: 185, pressure: 0.43, durationMs: 410, pauseAfterMs: 1_220, curvatureJitter: 0.07 },
    { speedPxPerSec: 190, pressure: 0.41, durationMs: 430, pauseAfterMs: 1_200, curvatureJitter: 0.06 },
  ];
}

function buildIntenseActionStrokes(): readonly CreativeStrokeTelemetrySample[] {
  return [
    { speedPxPerSec: 1_650, pressure: 0.92, durationMs: 110, pauseAfterMs: 45, curvatureJitter: 0.72 },
    { speedPxPerSec: 2_100, pressure: 0.34, durationMs: 90, pauseAfterMs: 190, curvatureJitter: 0.81 },
    { speedPxPerSec: 1_420, pressure: 0.98, durationMs: 130, pauseAfterMs: 35, curvatureJitter: 0.68 },
    { speedPxPerSec: 2_350, pressure: 0.28, durationMs: 85, pauseAfterMs: 60, curvatureJitter: 0.85 },
  ];
}

function solveFixtureRig(
  strokes: readonly CreativeStrokeTelemetrySample[],
  narrative: CutNarrativeMetadata,
  constraints?: SceneBaseLightingConstraints,
): DynamicThreePointLightingRig {
  return solveDynamicCutLightingRig(analyzeCreativeCadenceAndMood({ strokes, narrative }), constraints);
}

function createSampleRgbaPatch(): Uint8ClampedArray {
  return new Uint8ClampedArray([
    230, 188, 162, 255, 128, 128, 128, 255, 24, 28, 36, 255, 244, 238, 224, 255,
    210, 64, 52, 255, 58, 134, 212, 180, 96, 180, 110, 0, 18, 18, 18, 127,
  ]);
}

function computeSrgbSaturationSpan(r: number, g: number, b: number): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

describe("Wave 57: 작화 리듬·서사 긴장도 분석기 (creative-cadence-telemetry-analyzer)", () => {
  it("차분한 펜 획과 정적 도입 컷을 calm-ambient로 분류하고 비의료 창작 계약을 명시한다", () => {
    const result = analyzeCreativeCadenceAndMood({
      strokes: buildCalmStrokes(),
      narrative: {
        cutIntent: "establishing", actionIntensity: 0.08, dialogueDensity: 0.15,
        dialogueTone: "calm", narrativeStakes: 0.1, emotionalWarmth: 0.05,
      },
    });

    expect(result.mood).toBe("calm-ambient");
    expect(result.telemetryDomain).toBe("non-medical-creative-kinematics");
    expect(result.telemetrySourceMode).toBe("hybrid");
    expect(result.tensionIndex).toBeLessThan(0.28);
    expect(result.cadenceSmoothness).toBeGreaterThan(0.8);
    expect(result.moodLabelKo.length).toBeGreaterThan(0);
  });

  it("온화한 감정선 컷과 부드러운 작화 리듬을 warm-intimate로 분류한다", () => {
    const result = analyzeCreativeCadenceAndMood({
      strokes: buildCalmStrokes(),
      narrative: {
        cutIntent: "emotional-beat", actionIntensity: 0.22, dialogueDensity: 0.4,
        dialogueTone: "warm", narrativeStakes: 0.42, emotionalWarmth: 0.85,
      },
    });

    expect(result.mood).toBe("warm-intimate");
    expect(result.warmthIndex).toBeGreaterThan(0.5);
    expect(result.cadenceSmoothness).toBeGreaterThan(0.75);
  });

  it("고속·필압 급변 작화와 격돌 대사 컷을 dramatic-duel로 분류한다", () => {
    const calm = analyzeCreativeCadenceAndMood({
      strokes: buildCalmStrokes(),
      narrative: { cutIntent: "establishing", dialogueTone: "calm" },
    });
    const duel = analyzeCreativeCadenceAndMood({
      strokes: buildIntenseActionStrokes(),
      narrative: {
        cutIntent: "confrontation", actionIntensity: 0.92, dialogueDensity: 0.78,
        dialogueTone: "shout", narrativeStakes: 0.88, emotionalWarmth: -0.15, panelClutterRatio: 0.85,
      },
    });

    expect(duel.mood).toBe("dramatic-duel");
    expect(duel.tensionIndex).toBeGreaterThan(0.75);
    expect(duel.tensionIndex).toBeGreaterThan(calm.tensionIndex + 0.5);
    expect(duel.cadenceSmoothness).toBeLessThan(calm.cadenceSmoothness);
    expect(duel.kinematic.pressureVarianceNormalized).toBeGreaterThan(0.7);
  });

  it("서늘한 정서·속삭임·미스터리 컷을 noir-suspense로 분류한다", () => {
    const result = analyzeCreativeCadenceAndMood({
      strokes: [
        { speedPxPerSec: 520, pressure: 0.62, durationMs: 280, pauseAfterMs: 420, curvatureJitter: 0.35 },
        { speedPxPerSec: 480, pressure: 0.48, durationMs: 300, pauseAfterMs: 680, curvatureJitter: 0.42 },
        { speedPxPerSec: 610, pressure: 0.74, durationMs: 240, pauseAfterMs: 290, curvatureJitter: 0.38 },
      ],
      narrative: {
        cutIntent: "mystery", actionIntensity: 0.45, dialogueDensity: 0.35,
        dialogueTone: "whisper", narrativeStakes: 0.76, emotionalWarmth: -0.82,
      },
    });

    expect(result.mood).toBe("noir-suspense");
    expect(result.warmthIndex).toBeLessThan(-0.45);
    expect(result.narrativeMetrics.suspenseFactor).toBeGreaterThan(0.7);
  });

  it("고긴장·승리감·따뜻한 절정 컷을 radiant-climax로 분류한다", () => {
    const result = analyzeCreativeCadenceAndMood({
      strokes: [
        { speedPxPerSec: 1_520, pressure: 0.86, durationMs: 140, pauseAfterMs: 90, curvatureJitter: 0.25 },
        { speedPxPerSec: 1_610, pressure: 0.82, durationMs: 135, pauseAfterMs: 85, curvatureJitter: 0.22 },
        { speedPxPerSec: 1_580, pressure: 0.88, durationMs: 145, pauseAfterMs: 95, curvatureJitter: 0.24 },
      ],
      narrative: {
        cutIntent: "climax", actionIntensity: 0.88, dialogueDensity: 0.52,
        dialogueTone: "triumphant", narrativeStakes: 0.96, emotionalWarmth: 0.8,
      },
    });

    expect(result.mood).toBe("radiant-climax");
    expect(result.tensionIndex).toBeGreaterThan(0.78);
    expect(result.narrativeMetrics.climaxFactor).toBeGreaterThan(0.8);
  });

  it("획 간 휴지 리듬이 짧고 불규칙할수록 텐션이 상승하고 cadenceSmoothness가 하락한다", () => {
    const steadyBreathing = analyzeCreativeCadenceAndMood({
      strokes: [
        { speedPxPerSec: 500, pressure: 0.55, durationMs: 250, pauseAfterMs: 1_400, curvatureJitter: 0.1 },
        { speedPxPerSec: 510, pressure: 0.56, durationMs: 250, pauseAfterMs: 1_420, curvatureJitter: 0.1 },
        { speedPxPerSec: 495, pressure: 0.54, durationMs: 250, pauseAfterMs: 1_380, curvatureJitter: 0.1 },
      ],
      narrative: { cutIntent: "dialogue", actionIntensity: 0.4, narrativeStakes: 0.4 },
    });
    const breathlessRapid = analyzeCreativeCadenceAndMood({
      strokes: [
        { speedPxPerSec: 500, pressure: 0.55, durationMs: 250, pauseAfterMs: 30, curvatureJitter: 0.1 },
        { speedPxPerSec: 510, pressure: 0.56, durationMs: 250, pauseAfterMs: 420, curvatureJitter: 0.1 },
        { speedPxPerSec: 495, pressure: 0.54, durationMs: 250, pauseAfterMs: 25, curvatureJitter: 0.1 },
      ],
      narrative: { cutIntent: "dialogue", actionIntensity: 0.4, narrativeStakes: 0.4 },
    });

    expect(breathlessRapid.kinematic.pauseTempoEnergy).toBeGreaterThan(steadyBreathing.kinematic.pauseTempoEnergy);
    expect(breathlessRapid.tensionIndex).toBeGreaterThan(steadyBreathing.tensionIndex);
    expect(breathlessRapid.cadenceSmoothness).toBeLessThan(steadyBreathing.cadenceSmoothness);
  });

  it("빈 획 배열에서는 narrative-only로 안전 폴백하고 비정상 NaN/Infinity 입력을 정화한다", () => {
    const narrativeOnly = analyzeCreativeCadenceAndMood({
      strokes: [],
      narrative: { cutIntent: "mystery", dialogueTone: "whisper", emotionalWarmth: -0.7 },
    });
    expect(narrativeOnly.telemetrySourceMode).toBe("narrative-only");
    expect(narrativeOnly.effectiveKinematicWeight).toBe(0);
    expect(narrativeOnly.mood).toBe("noir-suspense");

    const sanitized = analyzeCreativeCadenceAndMood({
      strokes: [
        { speedPxPerSec: Number.NaN, pressure: Number.POSITIVE_INFINITY, durationMs: -10, pauseAfterMs: Number.NEGATIVE_INFINITY, curvatureJitter: 99 },
        { speedPxPerSec: 400, pressure: 0.5, durationMs: 200, pauseAfterMs: 500, curvatureJitter: 0.2 },
      ],
      narrative: { actionIntensity: Number.NaN, narrativeStakes: Number.POSITIVE_INFINITY, emotionalWarmth: -999 },
    });
    expect(Number.isFinite(sanitized.tensionIndex)).toBe(true);
    expect(sanitized.tensionIndex).toBeGreaterThanOrEqual(0);
    expect(sanitized.tensionIndex).toBeLessThanOrEqual(1);
    expect(sanitized.warmthIndex).toBeGreaterThanOrEqual(-1);
    expect(sanitized.warmthIndex).toBeLessThanOrEqual(1);
  });

  it("경계 구간에서는 previousMood 히스테리시스로 불필요한 무드 깜빡임을 억제한다", () => {
    const borderlineInput = {
      strokes: buildCalmStrokes(),
      narrative: {
        cutIntent: "dialogue" as const,
        actionIntensity: 0.32,
        narrativeStakes: 0.32,
        emotionalWarmth: 0.85,
      },
    };
    const raw = analyzeCreativeCadenceAndMood(borderlineInput);
    const runnerUp = SCENE_LIGHTING_MOODS.filter((m) => m !== raw.mood).sort(
      (a, b) => raw.moodScores[b] - raw.moodScores[a],
    )[0];
    expect(runnerUp).toBeDefined();

    if (runnerUp) {
      const gap = raw.moodScores[raw.mood] - raw.moodScores[runnerUp];
      expect(gap).toBeLessThan(0.15);
      const stabilized = analyzeCreativeCadenceAndMood({
        ...borderlineInput,
        options: { previousMood: runnerUp, moodHysteresisMargin: Math.min(0.2, gap + 0.04) },
      });
      expect(stabilized.mood).toBe(runnerUp);
      expect(stabilized.hysteresisApplied).toBe(true);
    }
  });

  it("prefersReducedMotion 플래그와 5종 무드 점수의 정규화 범위를 일관되게 유지한다", () => {
    const result = analyzeCreativeCadenceAndMood({
      strokes: buildIntenseActionStrokes(),
      narrative: { cutIntent: "action", actionIntensity: 0.85, narrativeStakes: 0.8 },
      options: { prefersReducedMotion: true },
    });

    expect(result.reducedMotionHint).toBe(true);
    for (const mood of SCENE_LIGHTING_MOODS) {
      expect(result.moodScores[mood]).toBeGreaterThanOrEqual(0);
      expect(result.moodScores[mood]).toBeLessThanOrEqual(1);
    }
  });
});

describe("Wave 57: 물리 기반 3점 조명 해석기 및 임계 감쇠 보간기 (dynamic-three-point-lighting-solver)", () => {
  it("kelvinToLinearRgb는 6500K 중립 백색(1,1,1)과 온색/한색 물리 방향성을 만족한다", () => {
    const d65 = kelvinToLinearRgb(NEUTRAL_DAYLIGHT_KELVIN);
    expect(d65.r).toBeCloseTo(1, 5);
    expect(d65.g).toBeCloseTo(1, 5);
    expect(d65.b).toBeCloseTo(1, 5);

    const warmTungsten = kelvinToLinearRgb(2_400);
    expect(warmTungsten.r).toBeCloseTo(1, 5);
    expect(warmTungsten.r).toBeGreaterThan(warmTungsten.g);
    expect(warmTungsten.g).toBeGreaterThan(warmTungsten.b);

    const coolSky = kelvinToLinearRgb(14_000);
    expect(coolSky.b).toBeCloseTo(1, 5);
    expect(coolSky.b).toBeGreaterThan(coolSky.g);
    expect(coolSky.g).toBeGreaterThan(coolSky.r);
  });

  it("kelvinToLinearRgb는 색온도 상승에 따라 R/B 비율이 단조 감소하며 극단·비유한 입력을 안전 클램프한다", () => {
    const samples = [1_800, 3_000, 4_500, 6_500, 9_500, 18_000];
    const ratios = samples.map((k) => {
      const rgb = kelvinToLinearRgb(k);
      expect(rgb.r).toBeGreaterThanOrEqual(0);
      expect(rgb.r).toBeLessThanOrEqual(1);
      expect(rgb.g).toBeGreaterThanOrEqual(0);
      expect(rgb.g).toBeLessThanOrEqual(1);
      expect(rgb.b).toBeGreaterThanOrEqual(0);
      expect(rgb.b).toBeLessThanOrEqual(1);
      return rgb.r / Math.max(1e-6, rgb.b);
    });
    for (let i = 1; i < ratios.length; i += 1) {
      expect(ratios[i] ?? 0).toBeLessThan(ratios[i - 1] ?? 0);
    }
    for (const invalid of [-500, 0, Number.NaN, Number.POSITIVE_INFINITY, 1_000_000]) {
      const rgb = kelvinToLinearRgb(invalid);
      expect(Number.isFinite(rgb.r) && Number.isFinite(rgb.g) && Number.isFinite(rgb.b)).toBe(true);
      expect(rgb.r).toBeGreaterThanOrEqual(0);
      expect(rgb.r).toBeLessThanOrEqual(1);
    }
  });

  it("무드별 3점 조명 리깅이 키-필 대비비·림라이트 강도·색온도에서 물리적 차이를 형성한다", () => {
    const calmRig = solveFixtureRig(buildCalmStrokes(), { cutIntent: "establishing", dialogueTone: "calm" });
    const warmRig = solveFixtureRig(buildCalmStrokes(), { cutIntent: "emotional-beat", dialogueTone: "warm", emotionalWarmth: 0.9 });
    const duelRig = solveFixtureRig(buildIntenseActionStrokes(), { cutIntent: "confrontation", actionIntensity: 0.95, dialogueTone: "shout" });
    const noirRig = solveFixtureRig([], { cutIntent: "mystery", dialogueTone: "whisper", emotionalWarmth: -0.9 });

    expect(duelRig.keyToFillRatio).toBeGreaterThan(calmRig.keyToFillRatio * 2);
    expect(noirRig.keyToFillRatio).toBeGreaterThan(calmRig.keyToFillRatio * 2.5);
    expect(duelRig.rimIntensity).toBeGreaterThan(calmRig.rimIntensity * 2);
    expect(warmRig.key.kelvin).toBeLessThan(noirRig.key.kelvin - 1_500);
  });

  it("solveDynamicCutLightingRig는 장면 기본 광원 제약(방위각 폭·고도각·색온도·대비비·단위벡터)을 엄격히 준수한다", () => {
    const constraints = {
      baseKeyAzimuthDeg: 350, baseKeyElevationDeg: 30, baseKeyKelvin: 5_200,
      maxAzimuthSwingDeg: 18, minElevationDeg: 22, maxElevationDeg: 55,
      minKelvin: 3_500, maxKelvin: 7_200, maxKeyToFillRatio: 4.5, minFillIntensity: 0.25, maxRimIntensity: 1.1,
    };
    const rig = solveFixtureRig(
      buildIntenseActionStrokes(),
      { cutIntent: "confrontation", actionIntensity: 1, narrativeStakes: 1 },
      constraints,
    );

    expect(Math.abs(shortestAngleDeltaDeg(constraints.baseKeyAzimuthDeg, rig.key.azimuthDeg))).toBeLessThanOrEqual(
      constraints.maxAzimuthSwingDeg + 1e-6,
    );
    for (const light of [rig.key, rig.fill, rig.rim]) {
      expect(light.elevationDeg).toBeGreaterThanOrEqual(constraints.minElevationDeg - 1e-6);
      expect(light.elevationDeg).toBeLessThanOrEqual(constraints.maxElevationDeg + 1e-6);
      expect(light.kelvin).toBeGreaterThanOrEqual(constraints.minKelvin - 1e-6);
      expect(light.kelvin).toBeLessThanOrEqual(constraints.maxKelvin + 1e-6);
      expect(Math.hypot(light.directionVector3d.x, light.directionVector3d.y, light.directionVector3d.z)).toBeCloseTo(1, 6);
    }
    expect(rig.keyToFillRatio).toBeLessThanOrEqual(constraints.maxKeyToFillRatio + 1e-5);
    expect(rig.fill.intensity).toBeGreaterThanOrEqual(constraints.minFillIntensity - 1e-6);
    expect(rig.rimIntensity).toBeLessThanOrEqual(constraints.maxRimIntensity + 1e-6);
  });

  it("prefersReducedMotion 활성화 시 동적 방위각 회전과 키-필 대비비·림 강도를 저자극 범위로 완화한다", () => {
    const analysis = analyzeCreativeCadenceAndMood({
      strokes: buildIntenseActionStrokes(),
      narrative: { cutIntent: "confrontation", actionIntensity: 0.95, narrativeStakes: 0.92 },
    });
    const fullRig = solveDynamicCutLightingRig(analysis, { baseKeyAzimuthDeg: 40, prefersReducedMotion: false });
    const reducedRig = solveDynamicCutLightingRig(analysis, { baseKeyAzimuthDeg: 40, prefersReducedMotion: true });

    expect(reducedRig.reducedMotionMode).toBe(true);
    expect(reducedRig.keyToFillRatio).toBeLessThan(fullRig.keyToFillRatio);
    expect(reducedRig.rimIntensity).toBeLessThan(fullRig.rimIntensity);
    expect(Math.abs(shortestAngleDeltaDeg(40, reducedRig.key.azimuthDeg))).toBeLessThan(
      Math.abs(shortestAngleDeltaDeg(40, fullRig.key.azimuthDeg)),
    );
  });

  it("임계 감쇠 보간기는 정지 출발 전 구간에서 오버슈트 0을 보장하며 목표 리깅으로 수렴한다", () => {
    const startRig = solveFixtureRig(buildCalmStrokes(), { cutIntent: "establishing", dialogueTone: "calm" });
    const targetRig = solveFixtureRig(buildIntenseActionStrokes(), { cutIntent: "confrontation", actionIntensity: 0.95, dialogueTone: "shout" });
    let state = createInitialDampedLightingState(startRig);
    const selectors: readonly ((rig: DynamicThreePointLightingRig) => number)[] = [
      (r) => r.key.kelvin, (r) => r.key.intensity, (r) => r.key.elevationDeg,
      (r) => r.fill.intensity, (r) => r.rim.intensity, (r) => r.ambientFloorIntensity,
    ];

    for (let frame = 0; frame < 140; frame += 1) {
      const prev = state.rig;
      state = stepDampedLightingRig(state, targetRig, 1 / 30, { smoothTimeSec: 0.35 });
      for (const select of selectors) {
        const startVal = select(startRig);
        const targetVal = select(targetRig);
        const curVal = select(state.rig);
        expect(curVal).toBeGreaterThanOrEqual(Math.min(startVal, targetVal) - 1e-6);
        expect(curVal).toBeLessThanOrEqual(Math.max(startVal, targetVal) + 1e-6);
        expect(Math.abs(curVal - targetVal)).toBeLessThanOrEqual(Math.abs(select(prev) - targetVal) + 1e-6);
      }
    }
    expect(state.rig.key.kelvin).toBeCloseTo(targetRig.key.kelvin, 1);
    expect(state.rig.key.intensity).toBeCloseTo(targetRig.key.intensity, 3);
    expect(state.rig.rim.intensity).toBeCloseTo(targetRig.rim.intensity, 3);
  });

  it("이동 도중 목표 무드가 급반전되어도 임계 감쇠 보간기는 새 목표를 오버슈트하지 않는다", () => {
    const startRig = solveFixtureRig(buildCalmStrokes(), { cutIntent: "establishing", dialogueTone: "calm" });
    const climaxRig = solveFixtureRig(buildIntenseActionStrokes(), { cutIntent: "climax", dialogueTone: "triumphant", emotionalWarmth: 0.9 });
    const noirRig = solveFixtureRig([], { cutIntent: "mystery", dialogueTone: "whisper", emotionalWarmth: -0.9 });

    let state = createInitialDampedLightingState(startRig);
    for (let i = 0; i < 8; i += 1) {
      state = stepDampedLightingRig(state, climaxRig, 1 / 30, { smoothTimeSec: 0.25 });
    }
    const pivot = state.rig;
    const minK = Math.min(pivot.key.kelvin, noirRig.key.kelvin) - 1e-5;
    const maxK = Math.max(pivot.key.kelvin, noirRig.key.kelvin) + 1e-5;
    const minRim = Math.min(pivot.rim.intensity, noirRig.rim.intensity) - 1e-5;
    const maxRim = Math.max(pivot.rim.intensity, noirRig.rim.intensity) + 1e-5;

    for (let i = 0; i < 120; i += 1) {
      state = stepDampedLightingRig(state, noirRig, 1 / 30, { smoothTimeSec: 0.25 });
      expect(state.rig.key.kelvin).toBeGreaterThanOrEqual(minK);
      expect(state.rig.key.kelvin).toBeLessThanOrEqual(maxK);
      expect(state.rig.rim.intensity).toBeGreaterThanOrEqual(minRim);
      expect(state.rig.rim.intensity).toBeLessThanOrEqual(maxRim);
    }
    expect(state.rig.key.kelvin).toBeCloseTo(noirRig.key.kelvin, 1);
  });

  it("방위각 보간이 350° ↔ 10° 경계를 340° 역회전 없이 20° 최단 호로 통과한다", () => {
    const calmNarrative = { cutIntent: "establishing" as const, dialogueTone: "calm" as const };
    const rigA = solveFixtureRig(buildCalmStrokes(), calmNarrative, { baseKeyAzimuthDeg: 350, maxAzimuthSwingDeg: 0 });
    const rigB = solveFixtureRig(buildCalmStrokes(), calmNarrative, { baseKeyAzimuthDeg: 10, maxAzimuthSwingDeg: 0 });

    let state = createInitialDampedLightingState(rigA);
    let prevRemaining = Math.abs(shortestAngleDeltaDeg(state.rig.key.azimuthDeg, 10));
    for (let i = 0; i < 60; i += 1) {
      state = stepDampedLightingRig(state, rigB, 1 / 30, { smoothTimeSec: 0.3 });
      const remaining = Math.abs(shortestAngleDeltaDeg(state.rig.key.azimuthDeg, 10));
      expect(remaining).toBeLessThanOrEqual(prevRemaining + 1e-5);
      expect(state.rig.key.azimuthDeg >= 349.9 || state.rig.key.azimuthDeg <= 10.1).toBe(true);
      prevRemaining = remaining;
    }
    expect(Math.abs(shortestAngleDeltaDeg(state.rig.key.azimuthDeg, 10))).toBeLessThan(0.2);
  });

  it("초당 변화율(slew-rate) 제한이 급격한 색온도·광도 점프를 억제해 깜빡임을 방지한다", () => {
    const warmRig = solveFixtureRig(buildCalmStrokes(), { cutIntent: "emotional-beat", dialogueTone: "warm", emotionalWarmth: 0.95 });
    const coldRig = solveFixtureRig([], { cutIntent: "mystery", dialogueTone: "whisper", emotionalWarmth: -0.95 });
    const dt = 0.05;
    const state1 = stepDampedLightingRig(createInitialDampedLightingState(warmRig), coldRig, dt, {
      smoothTimeSec: 0.06,
      maxKelvinPerSec: 600,
      maxIntensityPerSec: 0.4,
    });

    expect(Math.abs(state1.rig.key.kelvin - warmRig.key.kelvin)).toBeLessThanOrEqual(600 * dt + 1e-5);
    expect(Math.abs(state1.rig.key.intensity - warmRig.key.intensity)).toBeLessThanOrEqual(0.4 * dt + 1e-5);
  });

  it("prefersReducedMotion(instant-snap) 시 즉시 목표 저자극 리깅으로 전환하고 속도를 0으로 초기화한다", () => {
    const startRig = solveFixtureRig(buildCalmStrokes(), { cutIntent: "establishing" });
    const targetRig = solveFixtureRig(
      buildIntenseActionStrokes(),
      { cutIntent: "confrontation", actionIntensity: 0.9 },
      { prefersReducedMotion: true },
    );
    const snapped = stepDampedLightingRig(createInitialDampedLightingState(startRig), targetRig, 1 / 60, {
      prefersReducedMotion: true,
      reducedMotionStrategy: "instant-snap",
    });

    expect(snapped.rig.key.kelvin).toBe(targetRig.key.kelvin);
    expect(snapped.rig.rimIntensity).toBe(targetRig.rimIntensity);
    expect(snapped.rig.reducedMotionMode).toBe(true);
    expect(snapped.keyVelocity.kelvinPerSec).toBe(0);
    expect(snapped.keyVelocity.intensityPerSec).toBe(0);
    expect(snapped.ambientFloorVelocity).toBe(0);
  });

  it("prefersReducedMotion(gentle-low-slew) 전략은 일반 모드보다 완만한 초저자극 보간을 수행한다", () => {
    const startRig = solveFixtureRig(buildCalmStrokes(), { cutIntent: "establishing" });
    const targetRig = solveFixtureRig(buildIntenseActionStrokes(), { cutIntent: "confrontation", actionIntensity: 0.9 });
    const state0 = createInitialDampedLightingState(startRig);

    const normalStep = stepDampedLightingRig(state0, targetRig, 0.1, { prefersReducedMotion: false });
    const gentleStep = stepDampedLightingRig(state0, targetRig, 0.1, {
      prefersReducedMotion: true,
      reducedMotionStrategy: "gentle-low-slew",
    });

    const normalDelta = Math.abs(normalStep.rig.rimIntensity - startRig.rimIntensity);
    const gentleDelta = Math.abs(gentleStep.rig.rimIntensity - startRig.rimIntensity);
    expect(gentleDelta).toBeGreaterThan(0);
    expect(gentleDelta).toBeLessThan(normalDelta);
    expect(gentleStep.rig.reducedMotionMode).toBe(true);
  });
});

describe("Wave 57: 무드 1D 톤 커브 및 3D OKLCH LUT 생성·RGBA 고속 적용기 (mood-grading-lut-generator)", () => {
  it("1D S-커브 톤 테이블은 모든 무드와 고대비 설정에서 엄격히 단조 증가하고 클리핑을 방지한다", () => {
    const baseAnalysis = analyzeCreativeCadenceAndMood({
      strokes: buildIntenseActionStrokes(),
      narrative: { cutIntent: "confrontation", actionIntensity: 0.9 },
    });
    for (const mood of SCENE_LIGHTING_MOODS) {
      const lut = buildMoodColorGradingLut(solveDynamicCutLightingRig({ ...baseAnalysis, mood }), { lutSize: 9 });
      expect(lut.toneCurve1D.length).toBe(TONE_CURVE_1D_LENGTH);
      for (let i = 0; i < TONE_CURVE_1D_LENGTH; i += 1) {
        const val = lut.toneCurve1D[i] ?? -1;
        expect(Number.isFinite(val) && val >= 0 && val <= 1).toBe(true);
        if (i > 0) expect(val).toBeGreaterThan(lut.toneCurve1D[i - 1] ?? 2);
      }
      expect(lut.toneCurve1D[0] ?? 0).toBeGreaterThan(0);
      expect(lut.toneCurve1D[TONE_CURVE_1D_LENGTH - 1] ?? 1).toBeLessThan(1);
    }

    const extremeCurve = buildToneCurve1DTable({ contrast: 0.85, shadowLift: 0.12, highlightRolloff: 0.3, midtoneBias: -0.15 });
    for (let i = 1; i < extremeCurve.length; i += 1) {
      expect(extremeCurve[i] ?? 0).toBeGreaterThan(extremeCurve[i - 1] ?? 0);
    }
  });

  it("1D 톤 커브는 모든 보정 파라미터가 0일 때 정확한 선형 항등 함수를 반환한다", () => {
    const identity = { contrast: 0, shadowLift: 0, highlightRolloff: 0, midtoneBias: 0 };
    for (const x of [0, 0.12, 0.25, 0.5, 0.75, 0.91, 1]) {
      expect(evaluateMoodToneCurve1D(x, identity)).toBeCloseTo(x, 6);
    }
  });

  it("3D OKLCH LUT는 색역 [0,1]을 보존하며 warm-intimate(온색), noir-suspense(저채도 한색), radiant-climax(고채도)를 구분한다", () => {
    const warmLut = buildMoodColorGradingLut(
      solveFixtureRig(buildCalmStrokes(), { cutIntent: "emotional-beat", dialogueTone: "warm", emotionalWarmth: 0.9 }),
    );
    const noirLut = buildMoodColorGradingLut(
      solveFixtureRig([], { cutIntent: "mystery", dialogueTone: "whisper", emotionalWarmth: -0.9 }),
      { lutSize: 9 },
    );
    const climaxLut = buildMoodColorGradingLut(
      solveFixtureRig(buildIntenseActionStrokes(), { cutIntent: "climax", dialogueTone: "triumphant", emotionalWarmth: 0.85 }),
      { lutSize: 9 },
    );

    expect(warmLut.lutSize).toBe(DEFAULT_MOOD_LUT_SIZE);
    expect(warmLut.table3D.length).toBe(DEFAULT_MOOD_LUT_SIZE ** 3 * 3);
    expect(noirLut.table3D.length).toBe(9 ** 3 * 3);
    for (let i = 0; i < warmLut.table3D.length; i += 1) {
      const v = warmLut.table3D[i] ?? -1;
      expect(Number.isFinite(v) && v >= 0 && v <= 1).toBe(true);
    }

    const neutralGray = new Uint8ClampedArray([128, 128, 128, 255]);
    const warmGray = applyMoodGradingToRgba(neutralGray, warmLut);
    const noirGray = applyMoodGradingToRgba(neutralGray, noirLut);
    expect((warmGray[0] ?? 0) - (warmGray[2] ?? 0)).toBeGreaterThan((noirGray[0] ?? 0) - (noirGray[2] ?? 0));

    const chromaPatch = new Uint8ClampedArray([190, 95, 78, 255]);
    const noirChroma = applyMoodGradingToRgba(chromaPatch, noirLut);
    const climaxChroma = applyMoodGradingToRgba(chromaPatch, climaxLut);
    expect(computeSrgbSaturationSpan(climaxChroma[0] ?? 0, climaxChroma[1] ?? 0, climaxChroma[2] ?? 0)).toBeGreaterThan(
      computeSrgbSaturationSpan(noirChroma[0] ?? 0, noirChroma[1] ?? 0, noirChroma[2] ?? 0),
    );
  });

  it("applyMoodGradingToRgba는 바이트 단위 결정론성·알파 보존·투명 픽셀 스킵을 보장한다", () => {
    const lut = buildMoodColorGradingLut(
      solveFixtureRig(buildIntenseActionStrokes(), { cutIntent: "confrontation", actionIntensity: 0.9 }),
    );
    const src = createSampleRgbaPatch();
    const first = applyMoodGradingToRgba(src, lut);
    const second = applyMoodGradingToRgba(src, lut);

    expect(Array.from(first)).toEqual(Array.from(second));
    for (let i = 3; i < src.length; i += 4) expect(first[i]).toBe(src[i]);
    expect(Array.from(first.slice(24, 28))).toEqual(Array.from(src.slice(24, 28)));
  });

  it("applyMoodGradingToRgba는 mix=0 항등·inPlace 옵션·잘못된 버퍼 길이 오류 처리를 준수한다", () => {
    const lut = buildMoodColorGradingLut(
      solveFixtureRig(buildCalmStrokes(), { cutIntent: "emotional-beat", dialogueTone: "warm" }),
      { lutSize: 9 },
    );
    const src = createSampleRgbaPatch();
    const snapshot = new Uint8ClampedArray(src);

    const zeroMix = applyMoodGradingToRgba(src, lut, { mix: 0 });
    expect(Array.from(zeroMix)).toEqual(Array.from(snapshot));
    expect(zeroMix).not.toBe(src);

    const immutableCopy = applyMoodGradingToRgba(src, lut, { inPlace: false });
    expect(immutableCopy).not.toBe(src);
    expect(Array.from(src)).toEqual(Array.from(snapshot));

    const mutated = applyMoodGradingToRgba(src, lut, { inPlace: true });
    expect(mutated).toBe(src);
    expect(Array.from(mutated)).toEqual(Array.from(immutableCopy));
    expect(() => applyMoodGradingToRgba(new Uint8ClampedArray(6), lut)).toThrow(RangeError);
  });

  it("전체 디렉터 파이프라인(텔레메트리→3점 조명→임계 감쇠→LUT→RGBA)이 종단 간 일관되고 저자극 모드에서 프레임 변화량을 완화한다", () => {
    const calmRig = solveFixtureRig(buildCalmStrokes(), { cutIntent: "establishing", dialogueTone: "calm" });
    const duelAnalysis = analyzeCreativeCadenceAndMood({
      strokes: buildIntenseActionStrokes(),
      narrative: { cutIntent: "confrontation", actionIntensity: 0.94, dialogueTone: "shout", narrativeStakes: 0.9 },
    });
    const duelRigFull = solveDynamicCutLightingRig(duelAnalysis);
    const duelRigReduced = solveDynamicCutLightingRig(duelAnalysis, { prefersReducedMotion: true });

    let fullState = createInitialDampedLightingState(calmRig);
    for (let i = 0; i < 45; i += 1) {
      fullState = stepDampedLightingRig(fullState, duelRigFull, 1 / 30);
    }
    const reducedState = stepDampedLightingRig(createInitialDampedLightingState(calmRig), duelRigReduced, 1 / 30, {
      prefersReducedMotion: true,
    });

    const sourcePatch = createSampleRgbaPatch();
    const calmFrame = applyMoodGradingToRgba(sourcePatch, buildMoodColorGradingLut(calmRig));
    const fullDuelFrame = applyMoodGradingToRgba(sourcePatch, buildMoodColorGradingLut(fullState.rig));
    const reducedDuelLut = buildMoodColorGradingLut(reducedState.rig, { prefersReducedMotion: true });
    const reducedDuelFrame = applyMoodGradingToRgba(sourcePatch, reducedDuelLut);

    const meanChannelDiff = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
      let sum = 0;
      let count = 0;
      for (let i = 0; i < a.length; i += 4) {
        if ((a[i + 3] ?? 0) === 0) continue;
        sum +=
          Math.abs((a[i] ?? 0) - (b[i] ?? 0)) +
          Math.abs((a[i + 1] ?? 0) - (b[i + 1] ?? 0)) +
          Math.abs((a[i + 2] ?? 0) - (b[i + 2] ?? 0));
        count += 3;
      }
      return sum / Math.max(1, count);
    };

    expect(meanChannelDiff(calmFrame, fullDuelFrame)).toBeGreaterThan(4);
    expect(reducedDuelLut.reducedMotionMode).toBe(true);
    expect(meanChannelDiff(sourcePatch, reducedDuelFrame)).toBeLessThan(
      meanChannelDiff(sourcePatch, fullDuelFrame),
    );
  });
});
