import { describe, expect, it } from "vitest";
import {
  HybridCameraMotionPredictor,
  HybridRenderLatencyMonitor,
  HybridRenderTileSynchronizer,
  applyHomographyPoint2D,
  calibrateAdaptiveLeadTimeMs,
  computePercentile,
  computePixelRmse,
  computeReprojectionHomography2D,
  decomposeHomographyMetrics,
  estimatePredictionConfidence,
  invertHomography2D,
  multiplyHomography2D,
  predictViewportMotionPose,
  resolveDepthParallaxGain,
  wrapAngleDeltaRad,
  type CloudRenderTilePacket,
  type MotionKinematicsSample,
  type ViewportCameraPose2D,
} from "./index";

function mustDefined<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new Error(`예상된 값이 비어 있습니다: ${label}`);
  }
  return value;
}

function createConstantVelocitySamples(params: {
  readonly count: number;
  readonly hz: number;
  readonly startPanX: number;
  readonly startPanY: number;
  readonly vx: number;
  readonly vy: number;
  readonly startZoom?: number;
  readonly vLogZoom?: number;
  readonly startRotRad?: number;
  readonly angularVel?: number;
}): MotionKinematicsSample[] {
  const dtMs = 1000 / params.hz;
  const startZoom = params.startZoom ?? 1;
  const vLogZoom = params.vLogZoom ?? 0;
  const startRot = params.startRotRad ?? 0;
  const angularVel = params.angularVel ?? 0;
  const samples: MotionKinematicsSample[] = [];
  for (let i = 0; i < params.count; i += 1) {
    const tSec = (i * dtMs) / 1000;
    samples.push({
      samplingRateHz: params.hz,
      pose: {
        panX: params.startPanX + params.vx * tSec,
        panY: params.startPanY + params.vy * tSec,
        zoom: startZoom * Math.exp(vLogZoom * tSec),
        rotationRad: startRot + angularVel * tSec,
        timestampMs: i * dtMs,
      },
    });
  }
  return samples;
}

function worldToScreen(
  pose: ViewportCameraPose2D,
  wx: number,
  wy: number,
  pivotX: number,
  pivotY: number,
): { readonly x: number; readonly y: number } {
  const dx = wx - pose.panX;
  const dy = wy - pose.panY;
  const c = Math.cos(pose.rotationRad);
  const s = Math.sin(pose.rotationRad);
  return { x: pivotX + pose.zoom * (c * dx - s * dy), y: pivotY + pose.zoom * (s * dx + c * dy) };
}

function createCloudTile(overrides?: Partial<CloudRenderTilePacket>): CloudRenderTilePacket {
  return {
    layerId: "bg3d-main",
    tileX: 0,
    tileY: 0,
    sceneRevision: 1,
    generation: 1,
    lodLevel: 0,
    sourcePose: { panX: 100, panY: 50, zoom: 1, rotationRad: 0, timestampMs: 1000 },
    boundsPx: { x: 0, y: 0, width: 512, height: 512 },
    renderedAtMs: 1000,
    depthMeters: 2.5,
    skirtPaddingPx: 48,
    contentHash: "tile-r1-g1",
    ...overrides,
  };
}

describe("Wave 56: 온디바이스-클라우드 하이브리드 예측 투영 렌더링 동기화 엔진", () => {
  describe("1. 뷰포트·펜 운동학 이중 지수 평활 예측기", () => {
    it("120Hz 등속 팬 입력에 대해 목표 리드타임(24ms) 위치를 서브픽셀 오차 이내로 외삽한다", () => {
      const samples = createConstantVelocitySamples({
        count: 14, hz: 120, startPanX: 200, startPanY: -120, vx: 1440, vy: -720,
      });
      const result = predictViewportMotionPose(samples, { targetLeadTimeMs: 24 });
      const lastPose = mustDefined(samples[samples.length - 1], "lastSample").pose;

      expect(result.leadTimeMs).toBe(24);
      expect(Math.abs(result.predictedPose.panX - (lastPose.panX + 1440 * 0.024))).toBeLessThan(0.25);
      expect(Math.abs(result.predictedPose.panY - (lastPose.panY - 720 * 0.024))).toBeLessThan(0.25);
      expect(result.predictedPose.timestampMs).toBeCloseTo(lastPose.timestampMs + 24, 6);
    });

    it("240Hz 등가속도 팬 궤적을 2차 운동학 항까지 포함해 정확히 외삽한다", () => {
      const dtSec = 1 / 240;
      const v0 = 300;
      const accel = 4200;
      const samples: MotionKinematicsSample[] = [];
      for (let i = 0; i < 16; i += 1) {
        const t = i * dtSec;
        samples.push({
          samplingRateHz: 240,
          pose: { panX: 50 + v0 * t + 0.5 * accel * t * t, panY: 100, zoom: 1, rotationRad: 0, timestampMs: t * 1000 },
        });
      }

      const result = predictViewportMotionPose(samples, { targetLeadTimeMs: 20, accelerationDamping: 1.0 });
      const futureT = 15 * dtSec + 0.02;
      const trueFutureX = 50 + v0 * futureT + 0.5 * accel * futureT * futureT;

      expect(result.kinematics.inferredSampleRateHz).toBeCloseTo(240, 0);
      expect(result.kinematics.axPxPerSec2).toBeGreaterThan(3500);
      expect(Math.abs(result.predictedPose.panX - trueFutureX)).toBeLessThan(0.35);
    });

    it("로그 줌 공간에서 배율 변화를 외삽해 항상 양수 배율과 정확한 곱셈 비율을 유지한다", () => {
      const samples = createConstantVelocitySamples({
        count: 12, hz: 120, startPanX: 0, startPanY: 0, vx: 0, vy: 0, startZoom: 1.2, vLogZoom: 1.5,
      });
      const result = predictViewportMotionPose(samples, { targetLeadTimeMs: 30 });
      const lastZoom = mustDefined(samples[samples.length - 1], "lastSample").pose.zoom;

      expect(result.predictedPose.zoom).toBeGreaterThan(0);
      expect(result.predictedPose.zoom).toBeCloseTo(lastZoom * Math.exp(1.5 * 0.03), 4);
      expect(result.extrapolationDelta.zoomRatio).toBeCloseTo(Math.exp(1.5 * 0.03), 4);
    });

    it("±π 경계를 넘는 회전 입력에서도 2π 점프 없이 연속 각속도를 외삽한다", () => {
      const dtSec = 1 / 120;
      const omega = 2.4;
      const samples: MotionKinematicsSample[] = [];
      for (let i = 0; i < 12; i += 1) {
        samples.push({
          samplingRateHz: 120,
          pose: {
            panX: 0,
            panY: 0,
            zoom: 1,
            rotationRad: wrapAngleDeltaRad(Math.PI - 0.08 + omega * i * dtSec),
            timestampMs: i * dtSec * 1000,
          },
        });
      }

      const result = predictViewportMotionPose(samples, { targetLeadTimeMs: 25 });
      expect(result.kinematics.angularVelRadPerSec).toBeCloseTo(omega, 2);
      expect(Math.abs(result.extrapolationDelta.dRotationRad - omega * 0.025)).toBeLessThan(0.01);
    });

    it("적응형 리드타임은 모든 조건에서 [8ms, 45ms] 범위를 엄격히 지킨다", () => {
      const steady = createConstantVelocitySamples({
        count: 10, hz: 240, startPanX: 0, startPanY: 0, vx: 1600, vy: 400,
      });
      const lowLatency = predictViewportMotionPose(steady, { observedLatencyMs: 2 });
      const highLatency = predictViewportMotionPose(steady, { observedLatencyMs: 250 });

      expect(lowLatency.leadTimeMs).toBeGreaterThanOrEqual(8);
      expect(lowLatency.leadTimeMs).toBeLessThanOrEqual(45);
      expect(highLatency.leadTimeMs).toBeGreaterThanOrEqual(8);
      expect(highLatency.leadTimeMs).toBeLessThanOrEqual(45);
      expect(predictViewportMotionPose(steady, { targetLeadTimeMs: 1 }).leadTimeMs).toBe(8);
      expect(predictViewportMotionPose(steady, { targetLeadTimeMs: 120 }).leadTimeMs).toBe(45);
    });

    it("급격한 180도 방향 반전(저크 급증) 시 신뢰도를 낮추고 리드타임을 축소해 오버슈트를 억제한다", () => {
      const smooth = createConstantVelocitySamples({
        count: 10, hz: 120, startPanX: 0, startPanY: 0, vx: 1200, vy: 0,
      });
      const smoothResult = predictViewportMotionPose(smooth, { observedLatencyMs: 42 });
      const last = mustDefined(smooth[smooth.length - 1], "last").pose;

      const reversed: MotionKinematicsSample[] = [
        ...smooth,
        { samplingRateHz: 120, pose: { panX: last.panX - 18, panY: 0, zoom: 1, rotationRad: 0, timestampMs: last.timestampMs + 1000 / 120 } },
        { samplingRateHz: 120, pose: { panX: last.panX - 38, panY: 0, zoom: 1, rotationRad: 0, timestampMs: last.timestampMs + 2000 / 120 } },
      ];
      const reversedResult = predictViewportMotionPose(reversed, { observedLatencyMs: 42 });

      expect(reversedResult.confidence.motionRegime).toBe("turning-or-jerky");
      expect(reversedResult.confidence.confidence).toBeLessThan(smoothResult.confidence.confidence);
      expect(reversedResult.confidence.recommendedLeadTimeMs).toBeLessThan(smoothResult.confidence.recommendedLeadTimeMs);
    });

    it("240Hz 정밀 펜 선화 스트로크 구간을 인식해 리드타임을 보수적으로 좁히고 펜 끝 위치를 예측한다", () => {
      const dtMs = 1000 / 240;
      const samples: MotionKinematicsSample[] = [];
      for (let i = 0; i < 12; i += 1) {
        const tSec = (i * dtMs) / 1000;
        samples.push({
          samplingRateHz: 240,
          pose: { panX: 0, panY: 0, zoom: 2, rotationRad: 0, timestampMs: i * dtMs },
          pen: { x: 300 + 240 * tSec, y: 400 + 120 * tSec, pressure: 0.65, timestampMs: i * dtMs, isStrokeActive: true },
        });
      }

      const result = predictViewportMotionPose(samples, { observedLatencyMs: 30 });
      const lastPen = mustDefined(mustDefined(samples[samples.length - 1], "last").pen, "lastPen");
      const predPen = mustDefined(result.predictedPenPoint, "predictedPenPoint");

      expect(result.confidence.motionRegime).toBe("pen-precision");
      expect(result.confidence.factors.penPrecisionFactor).toBeLessThan(1);
      expect(predPen.x).toBeGreaterThan(lastPen.x);
      expect(predPen.y).toBeGreaterThan(lastPen.y);
    });

    it("빈 샘플, 단일 샘플, 동일 타임스탬프 같은 경계 입력에서도 NaN 없이 안전하게 동작한다", () => {
      const emptyRes = predictViewportMotionPose([]);
      expect(Number.isFinite(emptyRes.predictedPose.panX)).toBe(true);
      expect(emptyRes.predictedPose.zoom).toBe(1);

      const dupTsRes = predictViewportMotionPose([
        { pose: { panX: 10, panY: 20, zoom: 1.5, rotationRad: 0.2, timestampMs: 100 } },
        { pose: { panX: 15, panY: 25, zoom: 1.5, rotationRad: 0.2, timestampMs: 100 } },
      ]);
      expect(Number.isFinite(dupTsRes.predictedPose.panX)).toBe(true);
      expect(dupTsRes.leadTimeMs).toBeGreaterThanOrEqual(8);
    });

    it("상태 보존형 HybridCameraMotionPredictor가 배치 함수형 API와 완전히 동일한 결과를 낸다", () => {
      const samples = createConstantVelocitySamples({
        count: 10, hz: 120, startPanX: 40, startPanY: 80, vx: 600, vy: -300,
        startZoom: 1.25, vLogZoom: 0.4, startRotRad: 0.1, angularVel: 0.5,
      });
      const batch = predictViewportMotionPose(samples, { observedLatencyMs: 28 });
      const streaming = new HybridCameraMotionPredictor();
      for (const s of samples) streaming.pushSample(s);
      const streamed = streaming.predict({ observedLatencyMs: 28 });

      expect(streamed.predictedPose.panX).toBeCloseTo(batch.predictedPose.panX, 10);
      expect(streamed.predictedPose.panY).toBeCloseTo(batch.predictedPose.panY, 10);
      expect(streamed.predictedPose.zoom).toBeCloseTo(batch.predictedPose.zoom, 10);
      expect(streamed.predictedPose.rotationRad).toBeCloseTo(batch.predictedPose.rotationRad, 10);
      streaming.reset();
      expect(streaming.getKinematicsState().sampleCount).toBe(0);
    });

    it("샘플 드롭아웃(큰 시간 간격) 발생 시 연속성 점수와 신뢰도가 하락한다", () => {
      const steady = createConstantVelocitySamples({ count: 8, hz: 120, startPanX: 0, startPanY: 0, vx: 400, vy: 0 });
      const pSteady = new HybridCameraMotionPredictor();
      for (const s of steady) pSteady.pushSample(s);
      const confSteady = estimatePredictionConfidence(pSteady.getKinematicsState());

      const pGapped = new HybridCameraMotionPredictor();
      for (const s of steady.slice(0, 4)) pGapped.pushSample(s);
      pGapped.pushSample({ pose: { panX: 120, panY: 0, zoom: 1, rotationRad: 0, timestampMs: 210 } });
      const confGapped = estimatePredictionConfidence(pGapped.getKinematicsState());

      expect(confGapped.factors.sampleContinuity).toBeLessThan(confSteady.factors.sampleContinuity);
      expect(confGapped.confidence).toBeLessThan(confSteady.confidence);
    });
  });

  describe("2. 2D 재투영 호모그래피 및 깊이 시차(Depth-Aware Timewarp)", () => {
    it("팬·줌·회전 복합 변환 호모그래피의 정변환→역변환 왕복 오차가 1e-8px 미만이다", () => {
      const src: ViewportCameraPose2D = { panX: 320, panY: -180, zoom: 1.35, rotationRad: 0.42, timestampMs: 1000 };
      const dst: ViewportCameraPose2D = { panX: 415, panY: -95, zoom: 2.1, rotationRad: -0.68, timestampMs: 1032 };
      const reproj = computeReprojectionHomography2D(src, dst, {
        pivotX: 960, pivotY: 540, viewportWidth: 1920, viewportHeight: 1080,
      });

      for (const pt of [{ x: 0, y: 0 }, { x: 960, y: 540 }, { x: 1920, y: 1080 }, { x: 312.5, y: 845.25 }]) {
        const back = applyHomographyPoint2D(reproj.inverseMatrix, applyHomographyPoint2D(reproj.matrix, pt));
        expect(Math.hypot(back.x - pt.x, back.y - pt.y)).toBeLessThan(1e-8);
      }
      const decomposed = decomposeHomographyMetrics(reproj.matrix);
      expect(decomposed.scaleX).toBeCloseTo(dst.zoom / src.zoom, 6);
      expect(decomposed.scaleY).toBeCloseTo(dst.zoom / src.zoom, 6);
      expect(reproj.maxCornerDisplacementPx).toBeGreaterThan(0);
    });

    it("호모그래피가 임의의 월드 좌표 투영점 S_src → S_dst를 해석적 카메라 공식과 일치하게 매핑한다", () => {
      const src: ViewportCameraPose2D = { panX: 150, panY: 80, zoom: 1.2, rotationRad: 0.35, timestampMs: 0 };
      const dst: ViewportCameraPose2D = { panX: 210, panY: 45, zoom: 1.85, rotationRad: 0.9, timestampMs: 25 };
      const reproj = computeReprojectionHomography2D(src, dst, { pivotX: 640, pivotY: 360 });
      const screenSrc = worldToScreen(src, 420, -110, 640, 360);
      const expectedDst = worldToScreen(dst, 420, -110, 640, 360);
      const mappedDst = applyHomographyPoint2D(reproj.matrix, screenSrc);

      expect(Math.hypot(mappedDst.x - expectedDst.x, mappedDst.y - expectedDst.y)).toBeLessThan(1e-8);
    });

    it("깊이 시차(Depth-Aware Timewarp)가 원경·초점면·근경 순으로 물리적 이동량을 정확히 차등 보정한다", () => {
      const src: ViewportCameraPose2D = { panX: 0, panY: 0, zoom: 1, rotationRad: 0, timestampMs: 0 };
      const dst: ViewportCameraPose2D = { panX: 100, panY: 0, zoom: 1, rotationRad: 0, timestampMs: 20 };

      const farBg = computeReprojectionHomography2D(src, dst, { depthMeters: 12.5, focusDepthMeters: 2.5 });
      const focal = computeReprojectionHomography2D(src, dst, { depthMeters: 2.5, focusDepthMeters: 2.5 });
      const nearFg = computeReprojectionHomography2D(src, dst, { depthMeters: 1.25, focusDepthMeters: 2.5 });

      expect(farBg.parallaxGain).toBeCloseTo(0.2, 6);
      expect(focal.parallaxGain).toBeCloseTo(1.0, 6);
      expect(nearFg.parallaxGain).toBeCloseTo(2.0, 6);
      expect(Math.abs(farBg.translationDeltaPx.x)).toBeCloseTo(20, 6);
      expect(Math.abs(focal.translationDeltaPx.x)).toBeCloseTo(100, 6);
      expect(Math.abs(nearFg.translationDeltaPx.x)).toBeCloseTo(200, 6);
      expect(resolveDepthParallaxGain({ depthNormalized: 1 })).toBeLessThan(resolveDepthParallaxGain({ depthNormalized: 0.5 }));
      expect(resolveDepthParallaxGain({ depthNormalized: 0 })).toBeGreaterThan(resolveDepthParallaxGain({ depthNormalized: 0.5 }));
    });

    it("3D 기울기 사영 왜곡(perspectiveTilt)이 포함된 호모그래피도 정확히 가역적이다", () => {
      const src: ViewportCameraPose2D = { panX: 0, panY: 0, zoom: 1, rotationRad: 0, timestampMs: 0 };
      const dst: ViewportCameraPose2D = { panX: 45, panY: -20, zoom: 1.15, rotationRad: 0.12, timestampMs: 16 };
      const reproj = computeReprojectionHomography2D(src, dst, {
        pivotX: 500, pivotY: 400, perspectiveTiltX: 0.00018, perspectiveTiltY: -0.00012,
      });

      expect(reproj.isProjective).toBe(true);
      expect(decomposeHomographyMetrics(reproj.matrix).projectiveWarpMagnitude).toBeGreaterThan(0);
      const pt = { x: 820, y: 210 };
      const roundtrip = applyHomographyPoint2D(reproj.inverseMatrix, applyHomographyPoint2D(reproj.matrix, pt));
      expect(Math.hypot(roundtrip.x - pt.x, roundtrip.y - pt.y)).toBeLessThan(1e-8);
    });

    it("연속 두 자세 변환 호모그래피의 행렬곱이 직접 변환 호모그래피와 일치한다", () => {
      const a: ViewportCameraPose2D = { panX: 10, panY: 20, zoom: 1.0, rotationRad: 0.1, timestampMs: 0 };
      const b: ViewportCameraPose2D = { panX: 50, panY: -10, zoom: 1.4, rotationRad: 0.4, timestampMs: 10 };
      const c: ViewportCameraPose2D = { panX: -30, panY: 75, zoom: 0.85, rotationRad: -0.3, timestampMs: 20 };

      const hAB = computeReprojectionHomography2D(a, b, { pivotX: 400, pivotY: 300 }).matrix;
      const hBC = computeReprojectionHomography2D(b, c, { pivotX: 400, pivotY: 300 }).matrix;
      const hAC = computeReprojectionHomography2D(a, c, { pivotX: 400, pivotY: 300 }).matrix;
      const pt = { x: 620, y: 185 };

      const pDirect = applyHomographyPoint2D(hAC, pt);
      const pComposed = applyHomographyPoint2D(multiplyHomography2D(hBC, hAB), pt);
      expect(Math.hypot(pDirect.x - pComposed.x, pDirect.y - pComposed.y)).toBeLessThan(1e-8);

      const pId = applyHomographyPoint2D(multiplyHomography2D(hAC, invertHomography2D(hAC)), pt);
      expect(Math.hypot(pId.x - pt.x, pId.y - pt.y)).toBeLessThan(1e-8);
    });
  });

  describe("3. 클라우드 타일 재투영·델타 수렴·LOD 강등 동기화 엔진", () => {
    it("구버전 sceneRevision 및 구버전·중복 generation 클라우드 타일 역전을 원천 차단한다", () => {
      const sync = new HybridRenderTileSynchronizer();
      expect(sync.ingestCloudTile(createCloudTile({ sceneRevision: 3, generation: 5, contentHash: "r3-g5" }), 1000).status).toBe("accepted-initial");
      expect(sync.ingestCloudTile(createCloudTile({ sceneRevision: 2, generation: 99, contentHash: "r2-g99" }), 1010).status).toBe("rejected-stale-revision");
      expect(sync.ingestCloudTile(createCloudTile({ sceneRevision: 3, generation: 4, contentHash: "r3-g4" }), 1012).status).toBe("rejected-stale-generation");
      expect(sync.ingestCloudTile(createCloudTile({ sceneRevision: 3, generation: 5, contentHash: "r3-g5-dup" }), 1015).status).toBe("rejected-duplicate");

      const ledger = sync.getLedgerSnapshot();
      const entry = mustDefined(ledger[0], "ledgerEntry");
      expect(ledger).toHaveLength(1);
      expect(entry.activeContentHash).toBe("r3-g5");
      expect(entry.rejectedStaleCount).toBe(3);
    });

    it("비순차 도착 폭주 속에서도 단조 증가 최신 세대만 원장에 보존한다", () => {
      const sync = new HybridRenderTileSynchronizer();
      const order = [4, 2, 7, 5, 6, 3, 9, 8];
      for (let i = 0; i < order.length; i += 1) {
        const gen = mustDefined(order[i], "gen");
        sync.ingestCloudTile(createCloudTile({ generation: gen, renderedAtMs: 1000 + gen * 10, contentHash: `g-${gen}` }), 1100 + i * 5);
      }
      const entry = mustDefined(sync.getLedgerSnapshot()[0], "ledgerEntry");
      expect(entry.activeGeneration).toBe(9);
      expect(entry.activeContentHash).toBe("g-9");
      expect(entry.rejectedStaleCount).toBe(5);
    });

    it("최신 클라우드 타일 도착 시 Smoothstep 알파 크로스페이드로 충돌 없이 결정론적 수렴을 수행한다", () => {
      const sync = new HybridRenderTileSynchronizer({ crossFadeDurationMs: 100 });
      sync.ingestCloudTile(createCloudTile({ generation: 1, renderedAtMs: 1000, contentHash: "g1" }), 1000);
      const accept2 = sync.ingestCloudTile(
        createCloudTile({
          generation: 2,
          renderedAtMs: 1040,
          sourcePose: { panX: 120, panY: 50, zoom: 1, rotationRad: 0, timestampMs: 1040 },
          contentHash: "g2",
        }),
        1050,
      );
      expect(accept2.status).toBe("accepted-crossfade");

      const targetPose: ViewportCameraPose2D = { panX: 135, panY: 50, zoom: 1, rotationRad: 0, timestampMs: 1100 };
      const midCmd = mustDefined(sync.evaluateFrame({ targetPose, nowMs: 1100, viewportWidth: 1280, viewportHeight: 720 }).drawCommands[0], "midCmd");
      const midPrimary = mustDefined(midCmd.primaryLayer, "midPrimary");
      const midPrev = mustDefined(midCmd.previousLayer, "midPrev");

      expect(midCmd.mode).toBe("cloud-crossfade");
      expect(midCmd.convergenceProgress).toBeCloseTo(0.5, 6);
      expect(midPrimary.alpha).toBeCloseTo(0.5, 6);
      expect(midPrev.alpha).toBeCloseTo(0.5, 6);

      const endCmd = mustDefined(sync.evaluateFrame({ targetPose, nowMs: 1160, viewportWidth: 1280, viewportHeight: 720 }).drawCommands[0], "endCmd");
      expect(endCmd.mode).toBe("cloud-reprojected");
      expect(endCmd.convergenceProgress).toBe(1);
      expect(mustDefined(endCmd.primaryLayer, "endPrimary").alpha).toBe(1);
      expect(endCmd.previousLayer).toBeNull();
    });

    it("인접 타일 간 세대 또는 LOD 불일치 시 이음새 제거용 페더링 폭과 심 위험도를 자동 계산한다", () => {
      const sync = new HybridRenderTileSynchronizer({ seamFeatherMarginPx: 16 });
      sync.ingestCloudTile(createCloudTile({ tileX: 0, tileY: 0, generation: 3, lodLevel: 0, contentHash: "t00-g3" }), 1000);
      sync.ingestCloudTile(createCloudTile({ tileX: 1, tileY: 0, generation: 2, lodLevel: 1, contentHash: "t10-g2" }), 1000);

      const plan = sync.evaluateFrame({
        targetPose: { panX: 100, panY: 50, zoom: 1, rotationRad: 0, timestampMs: 1016 },
        nowMs: 1016,
        viewportWidth: 1280,
        viewportHeight: 720,
      });
      const cmd0 = mustDefined(plan.drawCommands[0], "cmd0");
      expect(plan.drawCommands).toHaveLength(2);
      expect(cmd0.seamRiskScore).toBeGreaterThanOrEqual(0.7);
      expect(cmd0.edgeBlendMarginPx).toBeGreaterThan(0);
      expect(plan.refreshRequests.some((req) => req.reason === "seam-reconcile")).toBe(true);
    });

    it("급격한 이동·줌으로 스커트 여백이 소진되면 skirtExhausted를 표시하고 최우선 재렌더 요청을 생성한다", () => {
      const sync = new HybridRenderTileSynchronizer();
      sync.ingestCloudTile(
        createCloudTile({ skirtPaddingPx: 16, depthMeters: 1.2, sourcePose: { panX: 0, panY: 0, zoom: 1, rotationRad: 0, timestampMs: 1000 } }),
        1000,
      );
      const plan = sync.evaluateFrame({
        targetPose: { panX: 280, panY: 140, zoom: 1.7, rotationRad: 0.3, timestampMs: 1040 },
        nowMs: 1040,
        viewportWidth: 1280,
        viewportHeight: 720,
      });
      expect(mustDefined(plan.drawCommands[0], "cmd").skirtExhausted).toBe(true);
      expect(plan.summary.skirtExhaustedTiles).toBe(1);
      expect(mustDefined(plan.refreshRequests[0], "refreshReq").reason).toBe("skirt-exhausted");
    });

    it("네트워크 지연 급증(>= 300ms) 또는 오프라인 전환 시 즉시 로컬 프록시 전용 모드로 강등한다", () => {
      const sync = new HybridRenderTileSynchronizer();
      const basePose: ViewportCameraPose2D = { panX: 100, panY: 50, zoom: 1, rotationRad: 0, timestampMs: 1000 };
      sync.ingestCloudTile(createCloudTile({ sourcePose: basePose }), 1000);
      sync.registerLocalProxyTile({
        layerId: "bg3d-main", tileX: 0, tileY: 0,
        boundsPx: { x: 0, y: 0, width: 512, height: 512 },
        sourcePose: basePose, depthMeters: 2.5, updatedAtMs: 1000, proxyAssetKey: "local-proxy-bg3d-0-0",
      });

      const spikeState = sync.reportNetworkAndFrameHealth({ cloudLatencyMs: 360, localFrameTimeMs: 5.5, timestampMs: 1030 });
      expect(spikeState.tier).toBe("local-proxy-only");
      expect(spikeState.targetLodLevel).toBe(3);

      const cmd = mustDefined(
        sync.evaluateFrame({ targetPose: { ...basePose, panX: 130, timestampMs: 1040 }, nowMs: 1040, viewportWidth: 1280, viewportHeight: 720 }).drawCommands[0],
        "proxyCmd",
      );
      expect(cmd.mode).toBe("local-proxy");
      expect(cmd.primaryLayer).toBeNull();
      expect(mustDefined(cmd.localProxyLayer, "localProxyLayer").proxyAssetKey).toBe("local-proxy-bg3d-0-0");
    });

    it("강등 복귀 시 히스테리시스 연속 정상 프레임을 만족할 때만 단계적으로 상위 티어로 승격한다", () => {
      const sync = new HybridRenderTileSynchronizer({ recoveryHysteresisFrames: 3 });
      sync.reportNetworkAndFrameHealth({ cloudLatencyMs: 340, localFrameTimeMs: 5.0, timestampMs: 1000 });
      expect(sync.getFallbackState().tier).toBe("local-proxy-only");

      sync.reportNetworkAndFrameHealth({ cloudLatencyMs: 35, localFrameTimeMs: 5.0, timestampMs: 1016 });
      sync.reportNetworkAndFrameHealth({ cloudLatencyMs: 35, localFrameTimeMs: 5.0, timestampMs: 1032 });
      expect(sync.getFallbackState().tier).toBe("local-proxy-only");

      sync.reportNetworkAndFrameHealth({ cloudLatencyMs: 35, localFrameTimeMs: 5.0, timestampMs: 1048 });
      expect(sync.getFallbackState().tier).toBe("hybrid-proxy-blend");

      for (let i = 0; i < 6; i += 1) {
        sync.reportNetworkAndFrameHealth({ cloudLatencyMs: 30, localFrameTimeMs: 4.8, timestampMs: 1064 + i * 16 });
      }
      expect(sync.getFallbackState().tier).toBe("cloud-hq");
    });

    it("오래된 미사용 클라우드 타일을 purgeStaleTiles로 결정론적으로 회수한다", () => {
      const sync = new HybridRenderTileSynchronizer({ maxCloudTileAgeMs: 200 });
      sync.ingestCloudTile(createCloudTile({ tileX: 0, tileY: 0, renderedAtMs: 1000 }), 1000);
      sync.ingestCloudTile(createCloudTile({ tileX: 1, tileY: 0, renderedAtMs: 2200 }), 2200);

      expect(sync.purgeStaleTiles(2500, 1000)).toBe(1);
      const remaining = sync.getLedgerSnapshot();
      expect(remaining).toHaveLength(1);
      expect(mustDefined(remaining[0], "remaining").tileX).toBe(1);
    });
  });

  describe("4. 지연 예산 텔레메트리(p50/p95/p99), 픽셀 RMSE 및 리드타임 자동 보정", () => {
    it("로컬·원격 지연의 p50/p95/p99 백분위수와 픽셀 RMSE를 정확히 산출한다", () => {
      const monitor = new HybridRenderLatencyMonitor({ windowSize: 100, targetFps: 120 });
      for (let i = 0; i < 100; i += 1) {
        monitor.recordFrame({
          timestampMs: i * 8.33,
          localFrameLatencyMs: 2.0 + i * 0.1,
          remoteTileLatencyMs: 20 + i,
          reprojectionErrorPx: i % 2 === 0 ? 1.0 : 2.0,
          appliedLeadTimeMs: 16,
          predictionConfidence: 0.9,
          fallbackTier: "cloud-hq",
        });
      }

      const snap = monitor.getSnapshot();
      expect(snap.windowSampleCount).toBe(100);
      expect(snap.localLatency.p50Ms).toBeCloseTo(computePercentile(Array.from({ length: 100 }, (_, i) => 2 + i * 0.1), 50), 5);
      expect(snap.localLatency.p95Ms).toBeCloseTo(11.405, 3);
      expect(snap.localLatency.p99Ms).toBeCloseTo(11.801, 3);
      expect(snap.remoteLatency.p50Ms).toBeCloseTo(69.5, 3);
      expect(snap.remoteLatency.p95Ms).toBeCloseTo(114.05, 3);
      expect(snap.remoteLatency.p99Ms).toBeCloseTo(118.01, 3);
      expect(snap.reprojectionAccuracy.rmsePx).toBeCloseTo(Math.sqrt(2.5), 3);
      expect(computePixelRmse([3, 4])).toBeCloseTo(Math.sqrt(12.5), 6);
    });

    it("재투영 오차(RMSE)가 목표치를 초과하면 폐루프 보정기가 리드타임을 스텝 제한 내에서 줄인다", () => {
      const damped = calibrateAdaptiveLeadTimeMs({
        currentLeadTimeMs: 32, localP95Ms: 7.5, remoteP50Ms: 60, reprojectionRmsePx: 5.5, meanConfidence: 0.9,
        config: { targetMaxRmsePx: 2.5, maxCalibrationStepMs: 3.0 },
      });
      expect(damped.reason).toBe("overshoot-damped");
      expect(damped.recommendedLeadTimeMs).toBeLessThan(32);
      expect(damped.recommendedLeadTimeMs).toBeGreaterThanOrEqual(29);

      const compensated = calibrateAdaptiveLeadTimeMs({
        currentLeadTimeMs: 12, localP95Ms: 11.5, remoteP50Ms: 80, reprojectionRmsePx: 0.8, meanConfidence: 0.95,
        config: { targetMaxRmsePx: 2.5, maxCalibrationStepMs: 3.0 },
      });
      expect(compensated.reason).toBe("latency-compensated");
      expect(compensated.recommendedLeadTimeMs).toBeGreaterThan(12);
      expect(compensated.recommendedLeadTimeMs).toBeLessThanOrEqual(15);
    });

    it("고정 크기 링 버퍼가 장시간 240Hz 입력에서도 윈도우 크기를 초과하지 않는다", () => {
      const monitor = new HybridRenderLatencyMonitor({ windowSize: 24, targetFps: 240 });
      for (let i = 0; i < 80; i += 1) {
        monitor.recordFrame({
          timestampMs: i * 4.16, localFrameLatencyMs: 3.2, remoteTileLatencyMs: 40,
          reprojectionErrorPx: 0.4, appliedLeadTimeMs: 12, predictionConfidence: 0.95, fallbackTier: "cloud-hq",
        });
      }
      const snap = monitor.getSnapshot();
      expect(snap.windowSampleCount).toBe(24);
      expect(snap.totalObservedFrames).toBe(80);
      expect(snap.localBudgetComplianceRatio).toBe(1);
    });

    it("창작자 친화적 한국어 상태 요약이 4단계 등급을 자연스럽게 표현하고 기술 약어를 노출하지 않는다", () => {
      const forbiddenJargon = /(RMSE|Homography|LOD|p95|Timewarp|Fallback)/i;
      const cases: readonly {
        readonly tier: "cloud-hq" | "cloud-balanced" | "local-proxy-only";
        readonly rmse: number;
        readonly expectedLevel: "optimal" | "adaptive" | "degraded" | "local-fallback";
      }[] = [
        { tier: "cloud-hq", rmse: 0.5, expectedLevel: "optimal" },
        { tier: "cloud-hq", rmse: 2.4, expectedLevel: "adaptive" },
        { tier: "cloud-balanced", rmse: 0.8, expectedLevel: "degraded" },
        { tier: "local-proxy-only", rmse: 0.4, expectedLevel: "local-fallback" },
      ];

      for (const item of cases) {
        const monitor = new HybridRenderLatencyMonitor({ targetMaxRmsePx: 2.5 });
        monitor.recordFrame({
          timestampMs: 100, localFrameLatencyMs: 5.5,
          remoteTileLatencyMs: item.tier === "local-proxy-only" ? null : 55,
          reprojectionErrorPx: item.rmse, appliedLeadTimeMs: 15, predictionConfidence: 0.9, fallbackTier: item.tier,
        });
        const summary = monitor.getSnapshot().koreanSummary;
        expect(summary.level).toBe(item.expectedLevel);
        expect(forbiddenJargon.test(summary.badgeLabel)).toBe(false);
        expect(forbiddenJargon.test(summary.headline)).toBe(false);
        if (summary.actionHint !== null) expect(forbiddenJargon.test(summary.actionHint)).toBe(false);
      }
    });
  });

  describe("5. 종단간(End-to-End) 하이브리드 예측-동기화-텔레메트리 통합 루프", () => {
    it("120Hz 팬·줌 세션 중 클라우드 지연 급증과 회복 전 구간에서 무중단 로컬 동기화를 유지한다", () => {
      const predictor = new HybridCameraMotionPredictor();
      const synchronizer = new HybridRenderTileSynchronizer({ crossFadeDurationMs: 80, recoveryHysteresisFrames: 3 });
      const monitor = new HybridRenderLatencyMonitor({ windowSize: 60, targetFps: 120, initialLeadTimeMs: 16 });
      const initialPose: ViewportCameraPose2D = { panX: 0, panY: 0, zoom: 1, rotationRad: 0, timestampMs: 0 };

      synchronizer.ingestCloudTile(createCloudTile({ generation: 1, sourcePose: initialPose, renderedAtMs: 0, skirtPaddingPx: 96 }), 0);
      synchronizer.registerLocalProxyTile({
        layerId: "bg3d-main", tileX: 0, tileY: 0, boundsPx: { x: 0, y: 0, width: 512, height: 512 },
        sourcePose: initialPose, depthMeters: 2.5, updatedAtMs: 0, proxyAssetKey: "proxy-bg3d-0-0",
      });

      const dtMs = 1000 / 120;
      let sawFallback = false;
      let cloudGeneration = 1;

      for (let frame = 1; frame <= 36; frame += 1) {
        const nowMs = frame * dtMs;
        const pose: ViewportCameraPose2D = {
          panX: frame * 4.5, panY: frame * 1.5, zoom: 1 + frame * 0.004, rotationRad: frame * 0.005, timestampMs: nowMs,
        };
        predictor.pushSample({ pose, samplingRateHz: 120 });

        const isSpike = frame >= 12 && frame <= 18;
        const cloudLatencyMs = isSpike ? 350 : 42;
        const health = synchronizer.reportNetworkAndFrameHealth({ cloudLatencyMs, localFrameTimeMs: 5.4, timestampMs: nowMs });

        if (!isSpike && frame % 6 === 0) {
          cloudGeneration += 1;
          synchronizer.ingestCloudTile(
            createCloudTile({ generation: cloudGeneration, sourcePose: pose, renderedAtMs: nowMs, skirtPaddingPx: 96, contentHash: `bg-g${cloudGeneration}` }),
            nowMs,
          );
        }

        const predicted = predictor.predict({ targetLeadTimeMs: monitor.getRecommendedLeadTimeMs() });
        const plan = synchronizer.evaluateFrame({ targetPose: predicted.predictedPose, nowMs, viewportWidth: 1280, viewportHeight: 720 });
        if (mustDefined(plan.drawCommands[0], "frameCmd").mode === "local-proxy") sawFallback = true;

        monitor.recordFrame({
          timestampMs: nowMs,
          localFrameLatencyMs: 5.4,
          remoteTileLatencyMs: isSpike ? null : cloudLatencyMs,
          reprojectionErrorPx: plan.summary.meanEstimatedErrorPx,
          appliedLeadTimeMs: predicted.leadTimeMs,
          predictionConfidence: predicted.confidence.confidence,
          fallbackTier: health.tier,
          reprojectedTileCount: plan.summary.totalTiles,
        });
      }

      const finalSnap = monitor.getSnapshot();
      expect(sawFallback).toBe(true);
      expect(synchronizer.getFallbackState().tier).toBe("cloud-hq");
      expect(finalSnap.totalObservedFrames).toBe(36);
      expect(finalSnap.localBudgetComplianceRatio).toBe(1);
      expect(finalSnap.leadTimeCalibration.recommendedLeadTimeMs).toBeGreaterThanOrEqual(8);
      expect(finalSnap.leadTimeCalibration.recommendedLeadTimeMs).toBeLessThanOrEqual(45);
      expect(finalSnap.koreanSummary.level).toBe("optimal");
    });
  });
});
