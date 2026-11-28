import { describe, expect, it } from "vitest";
import {
  LOCAL_ONLY_KINEMATIC_PRIVACY_CONTRACT,
  calibrateArtistKinematicTwin,
  computeInkDnaSimilarityScore,
  computeTurningAngleDeg,
  consolidateRoughSketchStrokes,
  createBuiltInArtistTwinPreset,
  evaluatePressureTransferModel,
  extractStrokeKinematics,
  renderKinematicCleanupComparisonSvg,
  summarizeKinematicCleanupKo,
  synthesizeCleanInkWithArtistTwin,
  type ArtistPenDynamicsTwinProfile,
  type StylusKinematicStroke,
  type StylusSamplePoint,
} from "./index";

function makeStraightStroke(
  id: string,
  lengthPx: number,
  sampleCount: number,
  speedPxPerSec: number,
  pressureFn: (u: number) => number,
  opts?: { readonly yOffset?: number; readonly reverse?: boolean; readonly jitterAmpPx?: number },
): StylusKinematicStroke {
  const yOffset = opts?.yOffset ?? 0;
  const jitterAmp = opts?.jitterAmpPx ?? 0;
  const pts: StylusSamplePoint[] = [];
  const totalTimeMs = (lengthPx / Math.max(speedPxPerSec, 1)) * 1000;
  for (let i = 0; i < sampleCount; i += 1) {
    const rawU = i / Math.max(1, sampleCount - 1);
    const u = opts?.reverse ? 1 - rawU : rawU;
    const x = u * lengthPx;
    const jitter = jitterAmp > 0 ? Math.sin(i * 2.35) * jitterAmp : 0;
    pts.push({
      x,
      y: yOffset + jitter,
      pressure: pressureFn(rawU),
      tiltX: 0.25,
      tiltY: 0.25,
      timestampMs: rawU * totalTimeMs,
    });
  }
  return { id, points: pts, baseWidthPx: 3.0 };
}

function makeCircularArcStroke(
  id: string,
  radiusPx: number,
  startAngleRad: number,
  sweepAngleRad: number,
  sampleCount: number,
  speedPxPerSec: number,
  pressureFn: (u: number) => number,
  opts?: {
    readonly centerX?: number;
    readonly centerY?: number;
    readonly radialOffsetPx?: number;
    readonly jitterAmpPx?: number;
    readonly jitterFreq?: number;
    readonly exitFlickMultiplier?: number;
    readonly reverse?: boolean;
  },
): StylusKinematicStroke {
  const cx = opts?.centerX ?? 160;
  const cy = opts?.centerY ?? 160;
  const rOffset = opts?.radialOffsetPx ?? 0;
  const jitterAmp = opts?.jitterAmpPx ?? 0;
  const jitterFreq = opts?.jitterFreq ?? 2.4;
  const flickMult = opts?.exitFlickMultiplier ?? 1.0;

  const pts: StylusSamplePoint[] = [];
  let tMs = 0;
  for (let i = 0; i < sampleCount; i += 1) {
    const rawU = i / Math.max(1, sampleCount - 1);
    const u = opts?.reverse ? 1 - rawU : rawU;
    const angle = startAngleRad + u * sweepAngleRad;
    const jitter =
      jitterAmp > 0 && i > 0 && i < sampleCount - 1
        ? Math.sin(i * jitterFreq) * jitterAmp
        : 0;
    const r = radiusPx + rOffset + jitter;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i > 0) {
      const prev = pts[i - 1];
      const ds = prev ? Math.hypot(x - prev.x, y - prev.y) : 1;
      const localSpeed =
        rawU > 0.78 ? speedPxPerSec * (1 + (flickMult - 1) * ((rawU - 0.78) / 0.22)) : speedPxPerSec;
      tMs += (ds / Math.max(localSpeed, 10)) * 1000;
    }
    pts.push({
      x,
      y,
      pressure: pressureFn(rawU),
      tiltX: 0.3,
      tiltY: 0.2,
      timestampMs: tMs,
    });
  }
  return { id, points: pts, baseWidthPx: 3.2 };
}

function makeSharpCornerStroke(
  id: string,
  cornerX: number,
  cornerY: number,
  legLengthPx: number,
  samplesPerLeg: number,
  jitterAmpPx = 0,
  offsetX = 0,
  offsetY = 0,
): StylusKinematicStroke {
  const pts: StylusSamplePoint[] = [];
  let tMs = 0;
  // 첫 번째 변: 수평 진입 (cornerX - legLength -> cornerX)
  for (let i = 0; i < samplesPerLeg; i += 1) {
    const u = i / Math.max(1, samplesPerLeg);
    const jitter =
      jitterAmpPx > 0 && i > 1 && i < samplesPerLeg - 1
        ? Math.sin(i * 2.6) * jitterAmpPx
        : 0;
    pts.push({
      x: cornerX - legLengthPx * (1 - u) + offsetX,
      y: cornerY + offsetY + jitter,
      pressure: 0.58,
      timestampMs: tMs,
    });
    tMs += 10;
  }
  // 정확한 90도 꼭짓점
  pts.push({
    x: cornerX + offsetX,
    y: cornerY + offsetY,
    pressure: 0.74,
    timestampMs: tMs,
  });
  tMs += 16;
  // 두 번째 변: 수직 하강 (cornerY -> cornerY + legLength)
  for (let i = 1; i <= samplesPerLeg; i += 1) {
    const u = i / Math.max(1, samplesPerLeg);
    const jitter =
      jitterAmpPx > 0 && i > 1 && i < samplesPerLeg
        ? Math.cos(i * 2.6) * jitterAmpPx
        : 0;
    pts.push({
      x: cornerX + offsetX + jitter,
      y: cornerY + legLengthPx * u + offsetY,
      pressure: 0.56,
      timestampMs: tMs,
    });
    tMs += 10;
  }
  return { id, points: pts, baseWidthPx: 2.8 };
}

function synthesizeReferenceStrokesForTwin(
  profile: ArtistPenDynamicsTwinProfile,
  prefix: string,
): StylusKinematicStroke[] {
  const geometries = [
    { radius: 95, sweep: 1.15, speed: profile.typicalMeanSpeedPxPerSec * 0.85 },
    { radius: 140, sweep: 1.0, speed: profile.typicalMeanSpeedPxPerSec },
    { radius: 70, sweep: 1.25, speed: profile.typicalMeanSpeedPxPerSec * 1.15 },
    { radius: 220, sweep: 0.75, speed: profile.typicalMeanSpeedPxPerSec * 0.92 },
  ];
  return geometries.map((g, idx) => {
    const rawRough = makeCircularArcStroke(
      `${prefix}-seed-${String(idx)}`,
      g.radius,
      -Math.PI * 0.75,
      g.sweep,
      56,
      g.speed,
      () => 0.5,
    );
    const synthesized = synthesizeCleanInkWithArtistTwin([rawRough], profile, {
      mode: "single-stroke-denoise",
    });
    const first = synthesized.inkStrokes[0];
    return first ? first.kinematicStroke : rawRough;
  });
}

describe("Wave 91: 작가 손목·필압 운동학 디지털 트윈 오프라인 펜선 클린업", () => {
  it("1. 직선 등속 획은 곡률 kappa ≈ 0, 정확한 호길이·속도, 극저 손떨림을 산출한다", () => {
    const stroke = makeStraightStroke("straight-1", 200, 41, 250, () => 0.6);
    const feat = extractStrokeKinematics(stroke);

    expect(feat.totalArcLengthPx).toBeCloseTo(200, 1);
    expect(feat.meanAbsCurvature).toBeLessThan(1e-6);
    expect(feat.maxAbsCurvature).toBeLessThan(1e-6);
    expect(feat.meanSpeedPxPerSec).toBeCloseTo(250, 0);
    expect(feat.tremorEnergyRatio).toBeLessThan(0.02);
    expect(feat.cornerCuspIndices).toHaveLength(0);
  });

  it("2. 반지름 R=80px 원호에서 부호 곡률 |kappa| ≈ 1/80 및 CCW/CW 부호 대칭을 만족한다", () => {
    const ccw = makeCircularArcStroke("arc-ccw", 80, 0, Math.PI * 0.8, 65, 220, () => 0.65);
    const cw = makeCircularArcStroke("arc-cw", 80, 0, -Math.PI * 0.8, 65, 220, () => 0.65);
    const fCcw = extractStrokeKinematics(ccw);
    const fCw = extractStrokeKinematics(cw);

    const expectedKappa = 1 / 80;
    expect(fCcw.meanAbsCurvature).toBeCloseTo(expectedKappa, 4);
    expect(fCw.meanAbsCurvature).toBeCloseTo(expectedKappa, 4);
    expect(fCcw.totalArcLengthPx).toBeCloseTo(80 * Math.PI * 0.8, 0);
    const midCcw = fCcw.samples[Math.floor(fCcw.samples.length / 2)];
    const midCw = fCw.samples[Math.floor(fCw.samples.length / 2)];
    expect(midCcw?.signedCurvature ?? 0).toBeGreaterThan(0.012);
    expect(midCw?.signedCurvature ?? 0).toBeLessThan(-0.012);
  });

  it("3. 진입 어택 램프와 진출 고속 플릭 테이퍼 지수를 정확히 검출한다", () => {
    const stroke = makeCircularArcStroke(
      "flick-1",
      150,
      -0.8,
      1.2,
      81,
      260,
      (u) => {
        if (u < 0.12) return 0.12 + (0.76 - 0.12) * (u / 0.12);
        if (u > 0.76) {
          const remain = (1 - u) / 0.24;
          return 0.04 + (0.76 - 0.04) * Math.pow(remain, 1.9);
        }
        return 0.76;
      },
      { exitFlickMultiplier: 1.75 },
    );
    const feat = extractStrokeKinematics(stroke);

    expect(feat.entryRampFraction).toBeGreaterThan(0.07);
    expect(feat.entryRampFraction).toBeLessThan(0.16);
    expect(feat.entryAttackSlope).toBeGreaterThan(3.5);
    expect(feat.exitTaperFraction).toBeGreaterThan(0.16);
    expect(feat.exitFlickVelocityRatio).toBeGreaterThan(1.3);
    expect(feat.exitTaperExponent).toBeGreaterThan(1.3);
  });

  it("4. 90도 L자 모서리는 정확한 꼭짓점을 검출하고 부드러운 원호는 오검출하지 않는다", () => {
    const cornerStroke = makeSharpCornerStroke("l-tip", 120, 80, 70, 20, 0);
    const arcStroke = makeCircularArcStroke("smooth-arc", 90, 0, Math.PI * 0.65, 50, 240, () => 0.6);
    const fCorner = extractStrokeKinematics(cornerStroke);
    const fArc = extractStrokeKinematics(arcStroke);

    expect(fCorner.cornerCuspIndices).toHaveLength(1);
    const cuspPt = fCorner.samples[fCorner.cornerCuspIndices[0] ?? -1];
    expect(cuspPt?.x).toBeCloseTo(120, 1);
    expect(cuspPt?.y).toBeCloseTo(80, 1);
    expect(fArc.cornerCuspIndices).toHaveLength(0);
  });

  it("5. ±2.5px 고주파 손떨림 획은 부드러운 기준 획 대비 tremorEnergyRatio가 현저히 높다", () => {
    const clean = makeCircularArcStroke("clean", 120, -1, 1.4, 70, 260, () => 0.6, {
      jitterAmpPx: 0,
    });
    const shaky = makeCircularArcStroke("shaky", 120, -1, 1.4, 70, 260, () => 0.6, {
      jitterAmpPx: 2.5,
      jitterFreq: 2.35,
    });
    const fClean = extractStrokeKinematics(clean);
    const fShaky = extractStrokeKinematics(shaky);

    expect(fClean.tremorEnergyRatio).toBeLessThan(0.03);
    expect(fShaky.tremorEnergyRatio).toBeGreaterThan(0.45);
    expect(fShaky.tremorRmsPx).toBeGreaterThan(1.0);
  });

  it("6. 빈 획·단일 점·중복 좌표·NaN/Infinity 입력에서도 예외나 NaN을 발생시키지 않는다", () => {
    const weird: StylusKinematicStroke = {
      id: "weird",
      points: [
        { x: Number.NaN, y: 10, pressure: 0.5, timestampMs: 0 },
        { x: 10, y: 20, pressure: Number.POSITIVE_INFINITY, timestampMs: 10 },
        { x: 10, y: 20, pressure: 0.5, timestampMs: 10 },
        { x: Number.POSITIVE_INFINITY, y: 30, pressure: -2, timestampMs: 20 },
      ],
    };
    const emptyFeat = extractStrokeKinematics({ id: "empty", points: [] });
    const weirdFeat = extractStrokeKinematics(weird);

    expect(Number.isFinite(emptyFeat.totalArcLengthPx)).toBe(true);
    expect(emptyFeat.pointCount).toBe(0);
    expect(Number.isFinite(weirdFeat.meanPressure)).toBe(true);
    expect(Number.isFinite(weirdFeat.tremorEnergyRatio)).toBe(true);
  });

  it("7. Ridge/OLS 필압 전달 회귀가 알려진 (b0, b1, b2) 파라미터를 낮은 RMSE로 복원한다", () => {
    const trueB0 = 1.05;
    const trueB1 = -0.075;
    const trueB2 = 6.5;
    const refStrokes: StylusKinematicStroke[] = [
      { r: 65, v: 180 },
      { r: 65, v: 420 },
      { r: 220, v: 180 },
      { r: 220, v: 420 },
    ].map((cfg, idx) =>
      makeCircularArcStroke(
        `truth-${String(idx)}`,
        cfg.r,
        -0.7,
        1.2,
        55,
        cfg.v,
        (u) => {
          const base = trueB0 + trueB1 * Math.log(1 + cfg.v) + trueB2 * (1 / cfg.r);
          if (u < 0.08) return 0.15 + (base - 0.15) * (u / 0.08);
          if (u > 0.85) return 0.06 + (base - 0.06) * ((1 - u) / 0.15);
          return base;
        },
      ),
    );

    const profile = calibrateArtistKinematicTwin("artist-alpha", refStrokes, {
      ridgeLambda: 0.001,
    });

    expect(profile.pressureModel.residualRmse).toBeLessThan(0.03);
    expect(profile.pressureModel.b1LogSpeed).toBeLessThan(-0.05);
    expect(profile.pressureModel.b2AbsCurvature).toBeGreaterThan(5.0);
    const predFastStraight = evaluatePressureTransferModel(profile.pressureModel, 420, 1 / 220);
    const predSlowTight = evaluatePressureTransferModel(profile.pressureModel, 180, 1 / 65);
    expect(predSlowTight).toBeGreaterThan(predFastStraight + 0.1);
  });

  it("8. 3종 내장 프리셋(G펜·마루펜·붓펜)은 선폭·속도민감도·테이퍼 특성이 뚜렷이 구분된다", () => {
    const gpen = createBuiltInArtistTwinPreset("korean-webtoon-gpen");
    const maru = createBuiltInArtistTwinPreset("seinen-marupen-crisp");
    const brush = createBuiltInArtistTwinPreset("brushpen-calligraphy");

    expect(maru.nominalWidthPx.typical).toBeLessThan(gpen.nominalWidthPx.typical);
    expect(gpen.nominalWidthPx.typical).toBeLessThan(brush.nominalWidthPx.typical);
    expect(brush.exitTaperFraction).toBeGreaterThan(gpen.exitTaperFraction);
    expect(gpen.exitTaperFraction).toBeGreaterThan(maru.exitTaperFraction);
    expect(brush.tiltWidthAnisotropy).toBeGreaterThan(gpen.tiltWidthAnisotropy);
    expect(new Set([gpen.profileFingerprintHex, maru.profileFingerprintHex, brush.profileFingerprintHex]).size).toBe(3);
  });

  it("9. 결정론적 FNV-1a 지문은 동일 입력에 불변이며 작가 ID나 동역학 변경 시 달라진다", () => {
    const g1 = createBuiltInArtistTwinPreset("korean-webtoon-gpen", "writer-kim");
    const g2 = createBuiltInArtistTwinPreset("korean-webtoon-gpen", "writer-kim");
    const g3 = createBuiltInArtistTwinPreset("korean-webtoon-gpen", "writer-lee");

    expect(g1.profileFingerprintHex).toMatch(/^[0-9a-f]{16}$/u);
    expect(g1.profileFingerprintHex).toBe(g2.profileFingerprintHex);
    expect(g1.profileFingerprintHex).not.toBe(g3.profileFingerprintHex);
  });

  it("10. 작가 판별력: G펜·마루펜·붓펜 각자의 샘플은 본인 트윈에서 타 작가 트윈보다 훨씬 높은 DNA 점수를 얻는다", () => {
    const gpen = createBuiltInArtistTwinPreset("korean-webtoon-gpen");
    const maru = createBuiltInArtistTwinPreset("seinen-marupen-crisp");
    const brush = createBuiltInArtistTwinPreset("brushpen-calligraphy");

    const gStrokes = synthesizeReferenceStrokesForTwin(gpen, "g");
    const mStrokes = synthesizeReferenceStrokesForTwin(maru, "m");
    const bStrokes = synthesizeReferenceStrokesForTwin(brush, "b");

    const gOnG = computeInkDnaSimilarityScore(gStrokes, gpen).overallScore;
    const gOnM = computeInkDnaSimilarityScore(gStrokes, maru).overallScore;
    const gOnB = computeInkDnaSimilarityScore(gStrokes, brush).overallScore;

    const mOnM = computeInkDnaSimilarityScore(mStrokes, maru).overallScore;
    const mOnB = computeInkDnaSimilarityScore(mStrokes, brush).overallScore;

    const bOnB = computeInkDnaSimilarityScore(bStrokes, brush).overallScore;
    const bOnM = computeInkDnaSimilarityScore(bStrokes, maru).overallScore;

    expect(gOnG).toBeGreaterThanOrEqual(82);
    expect(gOnG).toBeGreaterThan(gOnM + 15);
    expect(gOnG).toBeGreaterThan(gOnB + 15);
    expect(mOnM).toBeGreaterThanOrEqual(82);
    expect(mOnM).toBeGreaterThan(mOnB + 25);
    expect(bOnB).toBeGreaterThanOrEqual(82);
    expect(bOnB).toBeGreaterThan(bOnM + 25);
  });

  it("11. 100% 온디바이스 로컬 개인정보 계약(원본 미업로드 · 외부 클라우드 미사용)을 보증한다", () => {
    const preset = createBuiltInArtistTwinPreset("korean-webtoon-gpen");
    const calibrated = calibrateArtistKinematicTwin("local-only-artist", []);
    expect(preset.privacyContract).toEqual(LOCAL_ONLY_KINEMATIC_PRIVACY_CONTRACT);
    expect(calibrated.privacyContract.uploadsRawStrokes).toBe(false);
    expect(calibrated.privacyContract.runsLocallyOnly).toBe(true);
    expect(calibrated.privacyContract.usesExternalCloud).toBe(false);
  });

  it("12. 다중 덧그림(치킨스크래치) 통합: 눈썹 곡선 주변 5겹 러프 획이 1개 중심선으로 깔끔하게 통합된다", () => {
    const offsets = [-2.2, -1.1, 0.2, 1.3, 2.3];
    const roughEyebrow = offsets.map((off, idx) =>
      makeCircularArcStroke(
        `eyebrow-pass-${String(idx + 1)}`,
        130,
        -Math.PI * 0.72,
        0.95,
        45,
        240,
        () => 0.48,
        {
          radialOffsetPx: off,
          jitterAmpPx: 1.4,
          jitterFreq: 2.2 + idx * 0.3,
        },
      ),
    );

    const res = consolidateRoughSketchStrokes(roughEyebrow);
    expect(res.metrics.inputStrokeCount).toBe(5);
    expect(res.metrics.consolidatedStrokeCount).toBe(1);
    expect(res.metrics.strokeReductionRatio).toBeGreaterThanOrEqual(0.75);
    expect(res.metrics.meanHausdorffPx).toBeLessThanOrEqual(3.0);
    expect(res.spines[0]?.sourceStrokeIds).toHaveLength(5);
  });

  it("13. 정방향·역방향 왕복 덧그림 4획도 방향 정렬 후 1개 중심선으로 통합된다", () => {
    const roughPasses = [false, true, false, true].map((rev, idx) =>
      makeCircularArcStroke(
        `back-forth-${String(idx)}`,
        140,
        -Math.PI * 0.65,
        0.85,
        42,
        250,
        () => 0.5,
        { radialOffsetPx: (idx - 1.5) * 1.1, reverse: rev, jitterAmpPx: 0.9 },
      ),
    );
    const res = consolidateRoughSketchStrokes(roughPasses);
    expect(res.metrics.consolidatedStrokeCount).toBe(1);
    expect(res.metrics.strokeReductionRatio).toBeCloseTo(0.75, 2);
    expect(res.metrics.meanHausdorffPx).toBeLessThanOrEqual(3.0);
  });

  it("14. 멀리 떨어진 두 평행 획(40px 간격)은 과병합되지 않고 2획으로 유지된다", () => {
    const s1 = makeStraightStroke("p1", 180, 36, 240, () => 0.5, { yOffset: 20 });
    const s2 = makeStraightStroke("p2", 180, 36, 240, () => 0.5, { yOffset: 60 });
    const res = consolidateRoughSketchStrokes([s1, s2]);
    expect(res.metrics.consolidatedStrokeCount).toBe(2);
    expect(res.metrics.strokeReductionRatio).toBe(0);
  });

  it("15. 직교(90도) 교차 X자 두 획은 접선 일관성 검사에서 분리되어 병합되지 않는다", () => {
    const horiz = makeStraightStroke("x-h", 160, 34, 240, () => 0.5, { yOffset: 80 });
    const vertPts: StylusSamplePoint[] = [];
    for (let i = 0; i < 34; i += 1) {
      vertPts.push({
        x: 80,
        y: (i / 33) * 160,
        pressure: 0.5,
        timestampMs: i * 10,
      });
    }
    const vert: StylusKinematicStroke = { id: "x-v", points: vertPts };
    const res = consolidateRoughSketchStrokes([horiz, vert]);
    expect(res.metrics.consolidatedStrokeCount).toBe(2);
  });

  it("16. 날카로운 모서리 보존(단일 V-팁 머리카락 끝): 90도 커스프가 뭉개지지 않고 그대로 유지된다", () => {
    const hairTip = makeSharpCornerStroke("hair-tip", 140, 90, 80, 24, 1.1);
    const res = consolidateRoughSketchStrokes([hairTip]);

    expect(res.metrics.consolidatedStrokeCount).toBe(1);
    expect(res.metrics.preservedCornerCount).toBeGreaterThanOrEqual(1);
    const spine = res.spines[0];
    const cuspIdx = spine?.cornerIndices[0] ?? -1;
    expect(cuspIdx).toBeGreaterThan(2);
    const prevRef = spine?.points[Math.max(0, cuspIdx - 4)];
    const cuspPt = spine?.points[cuspIdx];
    const nextRef = spine?.points[Math.min((spine?.points.length ?? 1) - 1, cuspIdx + 4)];
    expect(prevRef && cuspPt && nextRef).toBeTruthy();
    if (prevRef && cuspPt && nextRef) {
      const preservedAngle = computeTurningAngleDeg(prevRef, cuspPt, nextRef);
      expect(Math.abs(preservedAngle - 90)).toBeLessThanOrEqual(8);
    }
  });

  it("17. 다중 덧그림 턱선 커스프: 90도 꺾임을 포함한 3겹 러프가 1개의 날카로운 턱선으로 통합된다", () => {
    const jawPasses = [-1.5, 0, 1.5].map((shift, idx) =>
      makeSharpCornerStroke(`jaw-${String(idx)}`, 150, 110, 75, 22, 0.8, shift, shift * 0.7),
    );
    const res = consolidateRoughSketchStrokes(jawPasses);

    expect(res.metrics.consolidatedStrokeCount).toBe(1);
    expect(res.metrics.strokeReductionRatio).toBeGreaterThanOrEqual(0.65);
    expect(res.metrics.preservedCornerCount).toBeGreaterThanOrEqual(1);
    expect(res.metrics.meanHausdorffPx).toBeLessThanOrEqual(3.0);
  });

  it("18. 고주파 손떨림 억제: ±2.5px 지터가 있는 곡선의 손떨림 에너지가 60% 이상 감소하면서 호 형상을 보존한다", () => {
    const jitteryArc = makeCircularArcStroke(
      "jittery-arc",
      135,
      -Math.PI * 0.68,
      1.15,
      72,
      250,
      () => 0.55,
      { jitterAmpPx: 2.5, jitterFreq: 2.35 },
    );
    const res = consolidateRoughSketchStrokes([jitteryArc], {
      preserveSingleStrokeMode: true,
      smoothingIterations: 12,
    });

    expect(res.metrics.tremorReductionRatio).toBeGreaterThanOrEqual(0.6);
    expect(res.metrics.meanHausdorffPx).toBeLessThanOrEqual(2.5);
    const spine = res.spines[0];
    expect(spine?.outputTremorRatio ?? 1).toBeLessThan((spine?.inputTremorRatio ?? 0) * 0.4);
  });

  it("19. 단일 획 노이즈 제거 모드(single-stroke-denoise)는 근접한 두 획을 합치지 않고 개별 정리한다", () => {
    const a = makeStraightStroke("single-a", 140, 32, 240, () => 0.5, {
      yOffset: 40,
      jitterAmpPx: 1.8,
    });
    const b = makeStraightStroke("single-b", 140, 32, 240, () => 0.5, {
      yOffset: 44,
      jitterAmpPx: 1.8,
    });
    const res = consolidateRoughSketchStrokes([a, b], {
      preserveSingleStrokeMode: true,
    });
    expect(res.metrics.consolidatedStrokeCount).toBe(2);
    expect(res.metrics.tremorReductionRatio).toBeGreaterThan(0.5);
  });

  it("20. 종단간 G펜 디지털 트윈 합성: 5겹 눈썹 러프가 높은 DNA 일치도(>=75)의 가변 선폭 리본으로 완성된다", () => {
    const gpen = createBuiltInArtistTwinPreset("korean-webtoon-gpen");
    const roughEyebrow = [-2.0, -1.0, 0.0, 1.0, 2.0].map((off, idx) =>
      makeCircularArcStroke(
        `brow-${String(idx)}`,
        125,
        -Math.PI * 0.72,
        1.05,
        50,
        280,
        () => 0.5,
        { radialOffsetPx: off, jitterAmpPx: 1.6, jitterFreq: 2.3 + idx * 0.25 },
      ),
    );

    const result = synthesizeCleanInkWithArtistTwin(roughEyebrow, gpen);
    expect(result.audit.hasNonFiniteValues).toBe(false);
    expect(result.inkStrokes).toHaveLength(1);
    expect(result.inkDnaSimilarity.overallScore).toBeGreaterThanOrEqual(75);
    expect(result.privacyContract.uploadsRawStrokes).toBe(false);
    expect(result.privacyContract.runsLocallyOnly).toBe(true);

    const ribbon = result.inkStrokes[0];
    expect(ribbon).toBeDefined();
    if (ribbon) {
      expect(ribbon.leftOutline.length).toBe(ribbon.centerPoints.length);
      expect(ribbon.rightOutline.length).toBe(ribbon.centerPoints.length);
      expect(ribbon.closedPolygon.length).toBe(ribbon.centerPoints.length * 2);
      const startW = ribbon.widthPx[0] ?? 99;
      const midW = ribbon.widthPx[Math.floor(ribbon.widthPx.length / 2)] ?? 0;
      const endW = ribbon.widthPx[ribbon.widthPx.length - 1] ?? 99;
      expect(midW).toBeGreaterThan(startW);
      expect(midW).toBeGreaterThan(endW);
      expect(ribbon.minWidthPx).toBeGreaterThan(0);
    }
  });

  it("21. 동일 러프에 붓펜 vs 마루펜 트윈 적용 시 선폭 다이내믹스와 DNA 소속이 명확히 분기된다", () => {
    const maru = createBuiltInArtistTwinPreset("seinen-marupen-crisp");
    const brush = createBuiltInArtistTwinPreset("brushpen-calligraphy");
    const roughCurve = makeCircularArcStroke("shared-curve", 95, -0.9, 1.35, 58, 260, () => 0.5, {
      jitterAmpPx: 1.3,
    });

    const maruOut = synthesizeCleanInkWithArtistTwin([roughCurve], maru);
    const brushOut = synthesizeCleanInkWithArtistTwin([roughCurve], brush);

    const maruRibbon = maruOut.inkStrokes[0];
    const brushRibbon = brushOut.inkStrokes[0];
    expect((brushRibbon?.maxWidthPx ?? 0) - (brushRibbon?.minWidthPx ?? 0)).toBeGreaterThan(
      ((maruRibbon?.maxWidthPx ?? 0) - (maruRibbon?.minWidthPx ?? 0)) * 2,
    );

    const brushScoredByBrush = brushOut.inkDnaSimilarity.overallScore;
    const brushScoredByMaru = computeInkDnaSimilarityScore(
      brushOut.inkStrokes.map((s) => s.kinematicStroke),
      maru,
    ).overallScore;
    expect(brushScoredByBrush).toBeGreaterThan(brushScoredByMaru + 20);
  });

  it("22. 90도 모서리 리본 합성 시 마이터 폭발 없이 유한 윤곽과 모서리 미세 체류 필압 상승이 반영된다", () => {
    const brush = createBuiltInArtistTwinPreset("brushpen-calligraphy");
    const hairTip = makeSharpCornerStroke("cusp-ink", 130, 85, 75, 22, 0.7);
    const result = synthesizeCleanInkWithArtistTwin([hairTip], brush);

    expect(result.audit.hasNonFiniteValues).toBe(false);
    const ribbon = result.inkStrokes[0];
    expect(ribbon?.cornerIndices.length).toBeGreaterThanOrEqual(1);
    const cIdx = ribbon?.cornerIndices[0] ?? -1;
    const cornerSample = ribbon?.centerPoints[cIdx];
    const awaySample = ribbon?.centerPoints[Math.max(4, cIdx - 8)];
    expect((cornerSample?.pressure ?? 0)).toBeGreaterThan((awaySample?.pressure ?? 0));

    const leftC = ribbon?.leftOutline[cIdx];
    const rightC = ribbon?.rightOutline[cIdx];
    expect(leftC && rightC && cornerSample).toBeTruthy();
    if (leftC && rightC && cornerSample) {
      const span = Math.hypot(leftC.x - rightC.x, leftC.y - rightC.y);
      expect(Number.isFinite(span)).toBe(true);
      expect(span).toBeLessThanOrEqual(cornerSample.widthPx * 2.5);
    }
  });

  it("23. 틸트 비등방성: 스트로크 방향 대비 펜 기울기 각도를 바꾸면 붓펜 리본 폭이 비례해 달라진다", () => {
    const brush = createBuiltInArtistTwinPreset("brushpen-calligraphy");
    const straight = makeStraightStroke("tilt-test", 180, 42, 280, () => 0.55);

    const alignedTilt = synthesizeCleanInkWithArtistTwin([straight], brush, {
      tiltAngleRad: 0,
    });
    const perpTilt = synthesizeCleanInkWithArtistTwin([straight], brush, {
      tiltAngleRad: Math.PI / 2,
    });

    expect(perpTilt.audit.meanInkWidthPx).toBeGreaterThan(
      alignedTilt.audit.meanInkWidthPx * 1.15,
    );
  });

  it("24. 빈 러프 입력 합성도 안전하게 0획 결과를 반환하고 NaN이 없다", () => {
    const gpen = createBuiltInArtistTwinPreset("korean-webtoon-gpen");
    const res = synthesizeCleanInkWithArtistTwin([], gpen);

    expect(res.inkStrokes).toHaveLength(0);
    expect(res.audit.hasNonFiniteValues).toBe(false);
    expect(res.consolidation.metrics.inputStrokeCount).toBe(0);
    expect(res.privacyContract.runsLocallyOnly).toBe(true);
  });

  it("25. 오버레이 비교 SVG 렌더러는 NaN/Infinity 없이 러프·펜선 레이어와 닫힌 리본 경로를 생성한다", () => {
    const gpen = createBuiltInArtistTwinPreset("korean-webtoon-gpen");
    const rough = [-1.5, 0, 1.5].map((off, idx) =>
      makeCircularArcStroke(`svg-r-${String(idx)}`, 110, -0.7, 1.0, 40, 260, () => 0.5, {
        radialOffsetPx: off,
        jitterAmpPx: 1.2,
      }),
    );
    const result = synthesizeCleanInkWithArtistTwin(rough, gpen);
    const svg = renderKinematicCleanupComparisonSvg(result, { layout: "overlay" });

    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('data-layer="rough-sketch"');
    expect(svg).toContain('data-layer="synthesized-ink"');
    expect(svg).toContain(" Z\"");
    expect(/\bNaN\b|\bInfinity\b/u.test(svg)).toBe(false);
  });

  it("26. 나란히 보기(side-by-side) SVG는 폭 확장·한국어 라벨·XML 특수문자 이스케이프를 보장한다", () => {
    const gpen = createBuiltInArtistTwinPreset("korean-webtoon-gpen");
    const hairTip = makeSharpCornerStroke("xml<id>&\"'", 120, 80, 60, 18, 0.8);
    const result = synthesizeCleanInkWithArtistTwin([hairTip], gpen);
    const overlaySvg = renderKinematicCleanupComparisonSvg(result, { layout: "overlay" });
    const sideSvg = renderKinematicCleanupComparisonSvg(result, {
      layout: "side-by-side",
      title: '작가 <테스트> & "클린업"',
    });

    expect(sideSvg).toContain("러프 스케치");
    expect(sideSvg).toContain("디지털 트윈 펜선");
    expect(sideSvg).toContain('data-layer="preserved-corners"');
    expect(sideSvg).toContain("작가 &lt;테스트&gt; &amp; &quot;클린업&quot;");
    expect(sideSvg).not.toContain("<테스트>");
    expect(/\bNaN\b|\bInfinity\b/u.test(sideSvg)).toBe(false);

    const overlayW = Number(/width="([0-9.]+)"/u.exec(overlaySvg)?.[1] ?? 0);
    const sideW = Number(/width="([0-9.]+)"/u.exec(sideSvg)?.[1] ?? 0);
    expect(sideW).toBeGreaterThan(overlayW * 1.8);
  });

  it("27. 자연스러운 한국어 요약은 절감률·DNA 점수·손떨림·모서리·로컬 전용 보안을 담고 번역투를 배제한다", () => {
    const gpen = createBuiltInArtistTwinPreset("korean-webtoon-gpen");
    const rough = [-1.4, 0, 1.4].map((shift, idx) =>
      makeSharpCornerStroke(`ko-jaw-${String(idx)}`, 140, 95, 70, 20, 1.3, shift, shift),
    );
    const result = synthesizeCleanInkWithArtistTwin(rough, gpen);
    const summary = summarizeKinematicCleanupKo(result);

    expect(summary).toContain("한국 웹툰 G펜 표준선");
    expect(summary).toContain("러프 3획을 가변 선폭 펜선 1획으로 정리했습니다");
    expect(summary).toContain("DNA 일치도");
    expect(summary).toContain("손떨림");
    expect(summary).toContain("날카로운 모서리");
    expect(summary).toContain("외부 클라우드로 전송되지 않습니다");
    // 번역투 금지 점검
    expect(summary).not.toMatch(/가능하게 합니다|직관적인 경험을 제공|원활한 워크플로우/u);
  });

  it("28. 사용자가 직접 보정한 커스텀 작가 트윈으로도 러프 클린업이 일관되게 동작한다", () => {
    const brushPreset = createBuiltInArtistTwinPreset("brushpen-calligraphy");
    const artistSamples = synthesizeReferenceStrokesForTwin(brushPreset, "custom-ink");
    const learnedTwin = calibrateArtistKinematicTwin("artist-seo", artistSamples, {
      profileName: "서작가 실전 붓펜 트윈",
      nominalBaseWidthPx: 4.5,
    });

    const roughPass = [-1.8, -0.6, 0.8, 1.8].map((off, idx) =>
      makeCircularArcStroke(`custom-rough-${String(idx)}`, 115, -0.8, 1.1, 46, 290, () => 0.45, {
        radialOffsetPx: off,
        jitterAmpPx: 1.5,
      }),
    );
    const cleaned = synthesizeCleanInkWithArtistTwin(roughPass, learnedTwin);

    expect(learnedTwin.sampleStrokeCount).toBe(4);
    expect(cleaned.consolidation.metrics.consolidatedStrokeCount).toBe(1);
    expect(cleaned.inkDnaSimilarity.overallScore).toBeGreaterThanOrEqual(75);
    expect(cleaned.audit.hasNonFiniteValues).toBe(false);
    expect(summarizeKinematicCleanupKo(cleaned)).toContain("서작가 실전 붓펜 트윈");
  });
});
