import { describe, expect, it } from "vitest";

import {
  ANATOMICAL_JOINT_LIMITS,
  archiveManuscriptLayers,
  autoColorizeHarmonicBvh,
  classifyManuscriptLayer,
  computeCanonicalManifestSha256Hex,
  decomposeSwingTwist,
  estimatePerspectiveVanishingPointsRansac,
  generateStudioCosignerKeyPair,
  guardJointPoseQuaternion,
  guardSkeletonPoseBatch,
  KalmanHermiteStylusPredictor,
  multiplyQuaternions,
  PredictiveAutoLodAssetCache,
  restoreManuscriptArchive,
  rotateVec3ByQuaternion,
  signManuscriptReleaseManifest,
  SpatialOccluderBvh,
  verifyThresholdManuscriptRelease,
  type BiomechJointId,
  type ManuscriptReleaseManifest,
  type QuatTuple,
  type SketchLineSegment,
  type Vec3Tuple,
} from "./index";

function quatFromAxisAngle(axis: Vec3Tuple, angleRad: number): QuatTuple {
  const len = Math.hypot(axis[0], axis[1], axis[2]);
  const half = angleRad * 0.5;
  const s = len > 1e-9 ? Math.sin(half) / len : 0;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
}

function makeRaySegment(
  vpX: number, vpY: number, anchorX: number, anchorY: number, lengthPx: number, jitterDeg: number,
): SketchLineSegment {
  const baseAngle = Math.atan2(anchorY - vpY, anchorX - vpX) + (jitterDeg * Math.PI) / 180;
  const dx = Math.cos(baseAngle) * (lengthPx * 0.5);
  const dy = Math.sin(baseAngle) * (lengthPx * 0.5);
  return { x1: anchorX - dx, y1: anchorY - dy, x2: anchorX + dx, y2: anchorY + dy };
}

describe("wasm64-wave7-sovereign: 해부학 스윙-트위스트 관절 한계 가드", () => {
  it("임의 3D 쿼터니언을 직교 스윙과 뼈 축 트위스트로 정확히 분해·재결합한다", () => {
    const q = multiplyQuaternions(
      quatFromAxisAngle([1, 0, 0.4], 0.72),
      quatFromAxisAngle([0, 1, 0], -0.55),
    );
    const dec = decomposeSwingTwist(q, [0, 1, 0], [1, 0, 0]);
    const recomposed = multiplyQuaternions(dec.swingQuat, dec.twistQuat);

    for (let i = 0; i < 4; i += 1) {
      expect(recomposed[i]).toBeCloseTo(q[i]!, 6);
    }
    // 스윙 회전축은 트위스트 축([0, 1, 0])과 직교해야 한다
    expect(Math.abs(dec.swingQuat[1])).toBeLessThan(1e-7);
    expect(dec.twistAngleRad).toBeCloseTo(-0.55, 5);

    // 180도 순수 스윙 특이점에서도 NaN 없이 안정 동작
    const pure180 = decomposeSwingTwist([1, 0, 0, 0], [0, 1, 0], [1, 0, 0]);
    expect(Number.isFinite(pure180.swingMagnitudeRad)).toBe(true);
    expect(pure180.twistAngleRad).toBe(0);
  });

  it("이중 피복(qw < 0) 부호 반전을 정규화하고 6종 관절의 과신전·캔디래퍼 비틀림을 차단한다", () => {
    // 1. 무릎 역방향 과신전(-50도) 차단 검증
    const hyperExtendedKnee = quatFromAxisAngle([1, 0, 0], (-50 * Math.PI) / 180);
    const kneeGuard = guardJointPoseQuaternion("knee", hyperExtendedKnee);
    expect(kneeGuard.swingClamped).toBe(true);
    expect(kneeGuard.clampedSwingAngleXRad).toBeGreaterThanOrEqual(-0.025);

    // 2. 팔꿈치 역방향 과신전(-40도) 차단 검증
    const hyperExtendedElbow = quatFromAxisAngle([1, 0, 0], (-40 * Math.PI) / 180);
    const elbowGuard = guardJointPoseQuaternion("elbow", hyperExtendedElbow);
    expect(elbowGuard.swingClamped).toBe(true);
    expect(elbowGuard.clampedSwingAngleXRad).toBeGreaterThanOrEqual(-0.025);

    // 3. 손목 극단적 비틀림(+155도) + 음수 스칼라부(캔디래퍼 유발) 동시 교정
    const rawCandyWrist = quatFromAxisAngle([0, 1, 0], (155 * Math.PI) / 180);
    const invertedWrist: QuatTuple = [
      -rawCandyWrist[0], -rawCandyWrist[1], -rawCandyWrist[2], -rawCandyWrist[3],
    ];
    const wristGuard = guardJointPoseQuaternion("wrist", invertedWrist);
    expect(wristGuard.antipodalCanonicalized).toBe(true);
    expect(wristGuard.twistClamped).toBe(true);
    expect(wristGuard.clampedTwistAngleRad).toBeCloseTo(ANATOMICAL_JOINT_LIMITS.wrist.maxTwistRad, 5);
    expect(
      rotateVec3ByQuaternion([1, 2, 3], invertedWrist)[0],
    ).toBeCloseTo(rotateVec3ByQuaternion([1, 2, 3], rawCandyWrist)[0], 5);

    // 이미 클램프된 결과를 재투입하면 멱등성(idempotence) 보장
    const secondPass = guardJointPoseQuaternion("wrist", wristGuard.guardedQuat);
    expect(secondPass.swingClamped).toBe(false);
    expect(secondPass.twistClamped).toBe(false);
  });

  it("어깨·팔꿈치·손목·목·고관절·무릎 전체 배치 가드를 0.1ms 미만 중앙값으로 처리한다", () => {
    const allJoints: readonly BiomechJointId[] = ["shoulder", "elbow", "wrist", "neck", "hip", "knee"];
    const batchInputs = allJoints.map((jointId, idx) => ({
      boneName: `bone_${jointId}`,
      jointId,
      localQuat: multiplyQuaternions(
        quatFromAxisAngle([1, 0, 0.5], idx % 2 === 0 ? 2.4 : -0.9),
        quatFromAxisAngle([0, 1, 0], idx % 2 === 0 ? 2.1 : -1.8),
      ),
    }));

    // JIT 워밍업 후 다회 중앙값 측정
    for (let w = 0; w < 20; w += 1) guardSkeletonPoseBatch(batchInputs);
    const timings: number[] = [];
    let lastReport = guardSkeletonPoseBatch(batchInputs);
    for (let run = 0; run < 25; run += 1) {
      const t0 = performance.now();
      lastReport = guardSkeletonPoseBatch(batchInputs);
      timings.push(performance.now() - t0);
    }
    timings.sort((a, b) => a - b);
    const medianMs = timings[Math.floor(timings.length / 2)]!;

    expect(lastReport.results).toHaveLength(6);
    expect(lastReport.clampedBoneCount).toBe(6);
    expect(lastReport.serverCostKrw).toBe(0);
    expect(medianMs).toBeLessThan(0.1);
  });
});

describe("wasm64-wave7-sovereign: 결정론적 RANSAC 1·2·3점 투시 추정기", () => {
  it("노이즈와 외란 선분이 섞인 1점 투시 복도 스케치에서 소실점·지평선·스냅 가이드를 복원한다", () => {
    const vp = { x: 500, y: 360 };
    const anchors: readonly [number, number, number][] = [
      [140, 120, 0.8], [860, 130, -0.9], [130, 620, -0.6],
      [880, 610, 0.7], [240, 260, -0.5], [760, 500, 0.4],
    ];
    const segments: SketchLineSegment[] = anchors.map(([ax, ay, jit], i) => ({
      id: `corridor_${i}`,
      ...makeRaySegment(vp.x, vp.y, ax, ay, 140, jit),
    }));
    // 무관한 노이즈 낙서 선분 2개 추가
    segments.push({ id: "outlier_1", x1: 50, y1: 40, x2: 110, y2: 175 });
    segments.push({ id: "outlier_2", x1: 720, y1: 60, x2: 770, y2: 190 });

    const report = estimatePerspectiveVanishingPointsRansac(segments, {
      canvasWidth: 1000, canvasHeight: 720, maxVanishingPoints: 1, inlierAngleDeg: 3.5,
    });

    expect(report.mode).toBe("1-point");
    expect(report.aiTokensUsed).toBe(0);
    expect(report.vanishingPoints).toHaveLength(1);
    const primaryVp = report.vanishingPoints[0]!;
    expect(primaryVp.isFinite).toBe(true);
    expect(Math.hypot(primaryVp.positionPx![0] - vp.x, primaryVp.positionPx![1] - vp.y)).toBeLessThan(6);
    expect(report.horizonLine).not.toBeNull();
    expect(Math.abs(report.horizonLine!.yAtCanvasCenterPx - vp.y)).toBeLessThan(6);

    const snappedInliers = report.snappedRulers.filter((r) => r.snapped);
    expect(snappedInliers.length).toBeGreaterThanOrEqual(6);
    for (const s of snappedInliers) {
      expect(s.residualAfterDeg).toBeLessThan(1e-4);
    }
  });

  it("2점 투시 거리 풍경과 3점 투시 마천루 구도를 각각 정확히 판별하고 지평선을 계산한다", () => {
    const leftVp = { x: -180, y: 400 };
    const rightVp = { x: 1180, y: 400 };
    const twoPointSegs: SketchLineSegment[] = [
      makeRaySegment(leftVp.x, leftVp.y, 260, 220, 130, 0.5),
      makeRaySegment(leftVp.x, leftVp.y, 300, 560, 140, -0.6),
      makeRaySegment(leftVp.x, leftVp.y, 450, 310, 120, 0.3),
      makeRaySegment(leftVp.x, leftVp.y, 480, 510, 125, -0.4),
      makeRaySegment(rightVp.x, rightVp.y, 740, 230, 135, -0.5),
      makeRaySegment(rightVp.x, rightVp.y, 700, 550, 140, 0.6),
      makeRaySegment(rightVp.x, rightVp.y, 560, 300, 120, -0.3),
      makeRaySegment(rightVp.x, rightVp.y, 540, 520, 125, 0.4),
    ];

    const report2P = estimatePerspectiveVanishingPointsRansac(twoPointSegs, {
      canvasWidth: 1000, canvasHeight: 800, maxVanishingPoints: 2,
    });
    expect(report2P.mode).toBe("2-point");
    expect(report2P.finiteVanishingPointCount).toBe(2);
    expect(report2P.horizonLine).not.toBeNull();
    expect(Math.abs(report2P.horizonLine!.yAtCanvasCenterPx - 400)).toBeLessThan(8);
    expect(Math.abs(report2P.horizonLine!.tiltAngleDeg)).toBeLessThan(1.5);

    // 3점 투시: 천저(nadir) 수직 소실점 추가
    const nadirVp = { x: 500, y: 1850 };
    const threePointSegs: SketchLineSegment[] = [
      ...twoPointSegs,
      makeRaySegment(nadirVp.x, nadirVp.y, 280, 260, 150, 0.4),
      makeRaySegment(nadirVp.x, nadirVp.y, 420, 280, 150, -0.4),
      makeRaySegment(nadirVp.x, nadirVp.y, 620, 270, 150, 0.3),
      makeRaySegment(nadirVp.x, nadirVp.y, 760, 250, 150, -0.5),
    ];

    const report3P = estimatePerspectiveVanishingPointsRansac(threePointSegs, {
      canvasWidth: 1000, canvasHeight: 800, maxVanishingPoints: 3, randomSeed: 777,
    });
    const report3PRepeat = estimatePerspectiveVanishingPointsRansac(threePointSegs, {
      canvasWidth: 1000, canvasHeight: 800, maxVanishingPoints: 3, randomSeed: 777,
    });
    expect(report3P.mode).toBe("3-point");
    expect(report3P.vanishingPoints.some((v) => v.role === "vertical")).toBe(true);
    expect(report3P.vanishingPoints.map((v) => v.positionPx)).toEqual(
      report3PRepeat.vanishingPoints.map((v) => v.positionPx),
    );
  });
});

describe("wasm64-wave7-sovereign: 칼만-에르미트 스타일러스 예측기 & 시맨틱 무손실 아카이버", () => {
  it("4..8ms 스캔아웃 에르미트 선행 예측으로 지연을 줄이고 스트로크 종료 시 영구 드리프트 0을 보장한다", () => {
    const clampedLow = new KalmanHermiteStylusPredictor({ scanoutLeadMs: 1 });
    expect(clampedLow.pushSample({ x: 0, y: 0, pressure: 0.5, timestampMs: 0 }).appliedLeadMs).toBe(4);
    const clampedHigh = new KalmanHermiteStylusPredictor({ scanoutLeadMs: 15 });
    expect(clampedHigh.pushSample({ x: 0, y: 0, pressure: 0.5, timestampMs: 0 }).appliedLeadMs).toBe(8);

    const predictor = new KalmanHermiteStylusPredictor({ scanoutLeadMs: 6, lookaheadSubSteps: 4 });
    let lastFrame = predictor.pushSample({ x: 20, y: 30, pressure: 0.4, timestampMs: 0 });

    for (let i = 1; i <= 50; i += 1) {
      const tMs = i * 4.166;
      const tSec = tMs / 1000;
      const x = 20 + 280 * tSec + 90 * tSec * tSec;
      const y = 30 + 180 * tSec + 40 * Math.sin(tSec * 8);
      lastFrame = predictor.pushSample({ x, y, pressure: 0.65, timestampMs: tMs });
    }

    expect(lastFrame.stateVector).toHaveLength(6);
    expect(lastFrame.stateVector[2]).toBeGreaterThan(200);
    expect(lastFrame.covarianceDiagonal.every((v) => v > 0 && Number.isFinite(v))).toBe(true);
    expect(lastFrame.ephemeralLookaheadSpline).toHaveLength(4);
    expect(lastFrame.ephemeralLookaheadSpline.every((p) => p.isEphemeralLookahead)).toBe(true);
    expect(lastFrame.maxPermanentDriftPx).toBe(0);

    const summary = predictor.finishStroke();
    expect(summary.ephemeralLookaheadSpline).toHaveLength(0);
    expect(summary.totalSamples).toBe(51);
    expect(summary.maxPermanentDriftPx).toBe(0);
    expect(summary.meanPredictionErrorPx).toBeLessThan(summary.meanZeroPredictorLagPx);
  });

  it("선화·밑색·그라데이션 3종 웹툰 레이어를 자동 분류해 70% 이상 압축하고 100% 비트 일치 복원한다", () => {
    const width = 160;
    const height = 160;
    const pixelCount = width * height;

    // 1. 선화 레이어 (투명 배경 + 흑색 잉크 선 + 소수 안티에일리어싱 경계 픽셀)
    const lineArt = new Uint8Array(pixelCount * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const off = (y * width + x) * 4;
        const onBorder = x === 20 || x === 140 || y === 20 || y === 140 || x === y;
        if (onBorder) {
          lineArt[off] = 15; lineArt[off + 1] = 15; lineArt[off + 2] = 18; lineArt[off + 3] = 255;
        } else if (x === 21 && y > 20 && y < 60) {
          // 안티에일리어싱 반투명 회색 픽셀
          lineArt[off] = 40; lineArt[off + 1] = 40; lineArt[off + 2] = 45; lineArt[off + 3] = 128;
        }
      }
    }

    // 2. 밑색 레이어 (6색 셀 채색 블록 -> 4비트 팔레트 + RLE)
    const flatColor = new Uint8Array(pixelCount * 4);
    const palette: readonly (readonly [number, number, number, number])[] = [
      [250, 246, 240, 255], [242, 206, 186, 255], [48, 62, 92, 255],
      [196, 74, 82, 255], [86, 132, 110, 255], [228, 198, 112, 255],
    ];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const band = ((Math.floor(y / 32) * 2 + Math.floor(x / 80)) % palette.length);
        const c = palette[band]!;
        const off = (y * width + x) * 4;
        flatColor[off] = c[0]; flatColor[off + 1] = c[1]; flatColor[off + 2] = c[2]; flatColor[off + 3] = c[3];
      }
    }

    // 3. 명암·그라데이션 레이어 (> 1,000 고유 색상 부드러운 2D 하늘·조명 그라데이션)
    const gradientShading = new Uint8Array(pixelCount * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const off = (y * width + x) * 4;
        gradientShading[off] = Math.min(255, Math.floor((x * 255) / width));
        gradientShading[off + 1] = Math.min(255, Math.floor((y * 255) / height));
        gradientShading[off + 2] = Math.min(255, Math.floor(((x + y) * 127) / width));
        gradientShading[off + 3] = 255;
      }
    }

    expect(classifyManuscriptLayer(lineArt, width, height)).toBe("line-art");
    expect(classifyManuscriptLayer(flatColor, width, height)).toBe("flat-color");
    expect(classifyManuscriptLayer(gradientShading, width, height)).toBe("gradient-shading");

    const archive = archiveManuscriptLayers([
      { layerId: "l_ink", name: "선화", width, height, rgba: lineArt, opacity: 1, visible: true },
      { layerId: "l_flat", name: "밑색", width, height, rgba: flatColor, opacity: 0.95, visible: true },
      { layerId: "l_grad", name: "배경명암", width, height, rgba: gradientShading, opacity: 0.85, visible: false },
    ]);

    expect(archive.overallSavingsRatio).toBeGreaterThan(0.7);
    expect(archive.layerSummaries.map((s) => s.semanticKind)).toEqual([
      "line-art", "flat-color", "gradient-shading",
    ]);

    const restored = restoreManuscriptArchive(archive.archiveBytes);
    expect(restored).toHaveLength(3);
    expect(restored[0]!.rgba).toEqual(lineArt);
    expect(restored[1]!.rgba).toEqual(flatColor);
    expect(restored[2]!.rgba).toEqual(gradientShading);
    expect(restored[1]!.opacity).toBeCloseTo(0.95, 3);
    expect(restored[2]!.visible).toBe(false);

    // 압축 바이트 변조 시 FNV-1a 무결성 예외 발생 검증
    const tampered = archive.archiveBytes.slice();
    tampered[tampered.length - 3] ^= 0xff;
    expect(() => restoreManuscriptArchive(tampered)).toThrow();
  });
});

describe("wasm64-wave7-sovereign: 예측 Auto-LOD · BVH 조화 채색기 · M-of-N 공동 서명 게이트", () => {
  it("카메라 이동 궤적과 SSE 기반으로 점진 LOD 승격과 엄격한 메모리 상한 축출을 수행한다", () => {
    const cache = new PredictiveAutoLodAssetCache(600_000);
    cache.registerAsset({
      assetId: "hero_statue",
      center: [0, 0, -10],
      boundingRadius: 1.2,
      geometricErrorByLod: [0.0005, 0.015, 0.06, 0.25],
      byteSizeByLod: [360_000, 180_000, 80_000, 32_000],
    });
    cache.registerAsset({
      assetId: "distant_tower",
      center: [40, 0, -80],
      boundingRadius: 3.0,
      geometricErrorByLod: [0.001, 0.02, 0.08, 0.3],
      byteSizeByLod: [400_000, 220_000, 110_000, 48_000],
    });

    const approachingView = {
      cameraPosition: [0, 0, 0] as const,
      cameraVelocity: [0, 0, -14] as const,
      viewportWidthPx: 1920,
      viewportHeightPx: 1080,
      verticalFovDeg: 60,
      predictionHorizonSec: 0.6,
      maxAllowedSsePx: 1.5,
    };

    // 4차례 연속 프레임 스케줄링으로 LOD3 -> LOD2 -> LOD1 -> LOD0 점진 승격 확인
    const progression: number[] = [];
    for (let frame = 0; frame < 4; frame += 1) {
      const plan = cache.planAndAdmitPrefetch(approachingView, 4);
      expect(plan.residentBytesAfterPlan).toBeLessThanOrEqual(cache.getMemoryCapBytes());
      const heroLod = cache.getBestResidentLod("hero_statue");
      if (heroLod !== null) progression.push(heroLod);
    }
    expect(progression[0]).toBe(3);
    expect(progression[progression.length - 1]).toBe(0);
    expect(cache.getResidentBytes()).toBeLessThanOrEqual(600_000);
  });

  it("공간 BVH 차폐 그림자와 엣지-스토핑 조화 확산으로 2px 끊긴 선화 틈새 번짐 없이 채색한다", () => {
    const bvh = new SpatialOccluderBvh([
      { kind: "aabb", id: "roof_box", min: [0.55, 0.1, 0.2], max: [0.95, 0.9, 0.6] },
      { kind: "triangle", id: "canopy_tri", v0: [0.5, 0.1, 0.3], v1: [0.95, 0.1, 0.3], v2: [0.75, 0.9, 0.3] },
    ]);
    const litHint = bvh.evaluateShadingHint([0.15, 0.5, 0.01], [0, 0, 1], 6, 1.2);
    const shadowedHint = bvh.evaluateShadingHint([0.75, 0.5, 0.01], [0, 0, 1], 6, 1.2);
    expect(litHint.directLit).toBe(1);
    expect(shadowedHint.directLit).toBe(0);
    expect(shadowedHint.shadeFactor).toBeLessThan(litHint.shadeFactor);

    // 48×32 캔버스 중앙(x=24)에 세로 먹선 경계를 긋되, y=15..16 (2px) 틈새를 의도적으로 비워 둔다
    const width = 48;
    const height = 32;
    const lineArtRgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const off = (y * width + x) * 4;
        const isInk = x === 24 && y !== 15 && y !== 16;
        if (isInk) {
          lineArtRgba[off] = 10; lineArtRgba[off + 1] = 10; lineArtRgba[off + 2] = 12; lineArtRgba[off + 3] = 255;
        } else {
          lineArtRgba[off] = 255; lineArtRgba[off + 1] = 255; lineArtRgba[off + 2] = 255; lineArtRgba[off + 3] = 0;
        }
      }
    }

    const result = autoColorizeHarmonicBvh({
      width,
      height,
      lineArtRgba,
      scribbles: [
        { x: 8, y: 16, rgb: [240, 90, 70], radiusPx: 1 },
        { x: 40, y: 16, rgb: [70, 150, 240], radiusPx: 1 },
      ],
      occluders: [{ kind: "aabb", id: "right_shade", min: [0.6, 0.0, 0.15], max: [1.0, 1.0, 0.5] }],
      keyLightDirection: [0, 0, 1],
      gapCloseRadiusPx: 1,
      diffusionIterations: 48,
    });

    // 좌측 영역(x=16, y=16)은 붉은 산호색 우세, 우측 영역(x=32, y=16)은 푸른 하늘색 우세(틈새 번짐 없음)
    const leftOff = (16 * width + 16) * 4;
    const rightOff = (16 * width + 32) * 4;
    expect(result.colorizedRgba[leftOff]!).toBeGreaterThan(210);
    expect(result.colorizedRgba[leftOff + 2]!).toBeLessThan(100);
    expect(result.colorizedRgba[rightOff + 2]!).toBeGreaterThan(170);
    expect(result.colorizedRgba[rightOff]!).toBeLessThan(100);

    // 우측 차폐 영역 그림자 계수가 좌측 비차폐 영역보다 낮아야 함
    expect(result.shadowFactorMap[16 * width + 36]!).toBeLessThan(result.shadowFactorMap[16 * width + 10]!);
    expect(result.aiTokensUsed).toBe(0);
    expect(result.serverCostKrw).toBe(0);
  });

  it("M-of-N 오프라인 WebCrypto 공동 서명 게이트가 정족수·중복 재전송·역할 중복·위변조를 검증한다", async () => {
    const writer = await generateStudioCosignerKeyPair("key_writer_1", "writer", "스토리 작가");
    const artistA = await generateStudioCosignerKeyPair("key_artist_1", "artist", "메인 작화가");
    const artistB = await generateStudioCosignerKeyPair("key_artist_2", "artist", "보조 작화가");
    const colorist = await generateStudioCosignerKeyPair("key_color_1", "colorist", "채색 담당");
    const editor = await generateStudioCosignerKeyPair("key_editor_1", "editor", "담당 편집자");
    const outsider = await generateStudioCosignerKeyPair("key_outsider", "editor", "외부 미등록 키");

    const roster = [writer, artistA, artistB, colorist, editor];
    const manifest: ManuscriptReleaseManifest = {
      projectId: "proj_sovereign_ep12",
      episodeNumber: 12,
      manuscriptRevision: 7,
      archiveSha256Hex: "a3f5c8e90123456789abcdef0123456789abcdef0123456789abcdef01234567",
      layerCount: 18,
      canvasWidth: 1600,
      canvasHeight: 12800,
      createdAtIso: "2026-11-26T09:00:00.000Z",
    };

    const sigWriter = await signManuscriptReleaseManifest(manifest, writer);
    const sigArtistA = await signManuscriptReleaseManifest(manifest, artistA);
    const sigArtistB = await signManuscriptReleaseManifest(manifest, artistB);
    const sigColorist = await signManuscriptReleaseManifest(manifest, colorist);
    const sigOutsider = await signManuscriptReleaseManifest(manifest, outsider);

    // 1. 고유 역할 3인(writer + artist + colorist) 서명 -> 3-of-5 통과
    const approvedGate = await verifyThresholdManuscriptRelease(
      manifest, roster, [sigWriter, sigArtistA, sigColorist], 3,
    );
    expect(approvedGate.approved).toBe(true);
    expect(approvedGate.distinctVerifiedRoles).toEqual(["writer", "artist", "colorist"]);
    expect(approvedGate.rejectedReceipts).toHaveLength(0);

    // 2. 중복 키 재전송 + 동일 역할(artist 2명) + 미등록 외부인 키 -> 고유 역할 2개뿐이므로 3-of-5 거절
    const replayAndRoleDupGate = await verifyThresholdManuscriptRelease(
      manifest,
      roster,
      [sigWriter, sigWriter, sigArtistA, sigArtistB, sigOutsider],
      3,
    );
    expect(replayAndRoleDupGate.approved).toBe(false);
    expect(replayAndRoleDupGate.distinctVerifiedRoles).toEqual(["writer", "artist"]);
    expect(replayAndRoleDupGate.rejectedReceipts.map((r) => r.reason)).toEqual([
      "duplicate-key-replay",
      "duplicate-role-quorum",
      "unknown-key",
    ]);

    // 3. 매니페스트 위변조(리비전 변경) 또는 서명 바이트 훼손 시 거절
    const tamperedManifest: ManuscriptReleaseManifest = { ...manifest, manuscriptRevision: 8 };
    const tamperedGate = await verifyThresholdManuscriptRelease(
      tamperedManifest, roster, [sigWriter, sigArtistA, sigColorist], 3,
    );
    expect(tamperedGate.approved).toBe(false);
    expect(tamperedGate.rejectedReceipts.every((r) => r.reason === "digest-mismatch")).toBe(true);

    const exactDigest = await computeCanonicalManifestSha256Hex(manifest);
    const forgedSigBytes = sigColorist.signatureBytes.slice();
    forgedSigBytes[0] ^= 0xff;
    const forgedReceipt = { ...sigColorist, manifestDigestHex: exactDigest, signatureBytes: forgedSigBytes };
    const badSigGate = await verifyThresholdManuscriptRelease(
      manifest, roster, [sigWriter, sigArtistA, forgedReceipt], 3,
    );
    expect(badSigGate.approved).toBe(false);
    expect(badSigGate.rejectedReceipts[0]?.reason).toBe("invalid-signature");

    // 4. 역할 위조(role-mismatch) 및 정족수 미달(2-of-5 < M=3) 거절 검증
    const spoofedRoleReceipt = { ...sigColorist, role: "editor" as const };
    const underQuorumGate = await verifyThresholdManuscriptRelease(
      manifest, roster, [sigWriter, sigArtistA, spoofedRoleReceipt], 3,
    );
    expect(underQuorumGate.approved).toBe(false);
    expect(underQuorumGate.verifiedKeyIds).toHaveLength(2);
    expect(underQuorumGate.rejectedReceipts[0]?.reason).toBe("role-mismatch");
  });

  it("17..256색 다중 팔레트 밑색 레이어도 8비트 인덱스 + RLE로 비트 손실 없이 왕복 복원한다", () => {
    const width = 96, height = 64, pixelCount = width * height;
    const flat32 = new Uint8Array(pixelCount * 4);
    for (let i = 0; i < pixelCount; i += 1) {
      const idx = Math.floor(i / 192) % 32;
      const off = i * 4;
      flat32[off] = (idx * 7 + 20) & 0xff;
      flat32[off + 1] = (idx * 13 + 60) & 0xff;
      flat32[off + 2] = (idx * 23 + 110) & 0xff;
      flat32[off + 3] = 255;
    }
    const archived = archiveManuscriptLayers([
      { layerId: "l_flat32", name: "32색소품밑색", width, height, rgba: flat32 },
    ]);
    expect(archived.layerSummaries[0]?.semanticKind).toBe("flat-color");
    expect(archived.overallSavingsRatio).toBeGreaterThan(0.8);
    const [restored] = restoreManuscriptArchive(archived.archiveBytes);
    expect(restored?.rgba).toEqual(flat32);
  });
});
