import { describe, expect, it } from "vitest";
import {
  DISPLAY_REFRESH_HORIZON_MS,
  ReversibleSpeculativeInkSession,
  SubframeStylusKalmanPredictor,
  buildSpeculativeInkOverlayWgsl,
  evaluatePredictiveInkLatencyBenchmark,
  predictSubframeStylusHorizon,
  renderPredictiveInkLatencySvg,
  resolveAdaptiveKalmanConfig,
  summarizePredictiveInkSessionKo,
  validateSpeculativeInkWgsl,
  type RawStylusPacket,
} from "./index";

function feedConstantVelocityLine(
  predictor: SubframeStylusKalmanPredictor,
  vx: number,
  vy: number,
  stepMs: number,
  count: number,
): { readonly lastX: number; readonly lastY: number; readonly lastT: number } {
  let lastX = 10;
  let lastY = 20;
  let lastT = 0;
  for (let i = 0; i < count; i += 1) {
    lastT = i * stepMs;
    const tSec = lastT / 1000;
    lastX = 10 + vx * tSec;
    lastY = 20 + vy * tSec;
    predictor.update({ x: lastX, y: lastY, timestampMs: lastT, pressure: 0.65 });
  }
  return { lastX, lastY, lastT };
}

describe("Wave 99 — 120Hz 서브프레임 예측 잉크 및 펜 끝 지연 제로화 엔진", () => {
  it("1. 60Hz/120Hz/240Hz 주사율별 프레임 지평선 상수를 정확히 제공한다", () => {
    expect(DISPLAY_REFRESH_HORIZON_MS["60hz"]).toBeCloseTo(16.6667, 3);
    expect(DISPLAY_REFRESH_HORIZON_MS["120hz"]).toBeCloseTo(8.3333, 3);
    expect(DISPLAY_REFRESH_HORIZON_MS["240hz"]).toBeCloseTo(4.1667, 3);

    const cfg = resolveAdaptiveKalmanConfig({ refreshTarget: "240hz", leadFrames: 1 });
    expect(cfg.defaultHorizonMs).toBeCloseTo(1000 / 240, 4);
  });

  it("2. 등속 직선 스트로크(120Hz, 8.33ms): 체감 지연을 75% 이상 단축하고 오차를 0.5px 미만으로 유지한다", () => {
    const stepMs = DISPLAY_REFRESH_HORIZON_MS["120hz"];
    const vx = 720;
    const vy = 240;
    const predictor = new SubframeStylusKalmanPredictor({ refreshTarget: "120hz" });

    let sumRawLag = 0;
    let sumPredErr = 0;
    let steadyCount = 0;

    for (let i = 0; i < 32; i += 1) {
      const tMs = i * stepMs;
      const tSec = tMs / 1000;
      const x = 15 + vx * tSec;
      const y = 30 + vy * tSec;
      const res = predictor.update({ x, y, timestampMs: tMs, pressure: 0.7 });
      expect(res.accepted).toBe(true);

      const pred = predictSubframeStylusHorizon(predictor, stepMs, 3);
      const futureSec = (tMs + stepMs) / 1000;
      const gtX = 15 + vx * futureSec;
      const gtY = 30 + vy * futureSec;

      if (i >= 3) {
        const tip = pred.points[pred.points.length - 1];
        expect(tip).toBeDefined();
        sumRawLag += Math.hypot(gtX - res.snapshot.x, gtY - res.snapshot.y);
        sumPredErr += Math.hypot(gtX - (tip?.x ?? 0), gtY - (tip?.y ?? 0));
        steadyCount += 1;
      }
    }

    const meanRawLag = sumRawLag / steadyCount;
    const meanPredErr = sumPredErr / steadyCount;
    const reductionPct = ((meanRawLag - meanPredErr) / meanRawLag) * 100;

    expect(reductionPct).toBeGreaterThanOrEqual(75);
    expect(meanPredErr).toBeLessThan(0.5);
  });

  it("3. 등속 직선 스트로크(60Hz, 16.67ms): 체감 지연을 75% 이상 단축하고 오차를 0.5px 미만으로 유지한다", () => {
    const stepMs = DISPLAY_REFRESH_HORIZON_MS["60hz"];
    const vx = 600;
    const vy = -180;
    const predictor = new SubframeStylusKalmanPredictor({ refreshTarget: "60hz" });

    let sumRawLag = 0;
    let sumPredErr = 0;
    let steadyCount = 0;

    for (let i = 0; i < 24; i += 1) {
      const tMs = i * stepMs;
      const tSec = tMs / 1000;
      const x = 40 + vx * tSec;
      const y = 200 + vy * tSec;
      const res = predictor.update({ x, y, timestampMs: tMs, pressure: 0.6 });
      const pred = predictSubframeStylusHorizon(predictor, stepMs, 4);

      const futureSec = (tMs + stepMs) / 1000;
      const gtX = 40 + vx * futureSec;
      const gtY = 200 + vy * futureSec;

      if (i >= 3) {
        const tip = pred.points[pred.points.length - 1];
        sumRawLag += Math.hypot(gtX - res.snapshot.x, gtY - res.snapshot.y);
        sumPredErr += Math.hypot(gtX - (tip?.x ?? 0), gtY - (tip?.y ?? 0));
        steadyCount += 1;
      }
    }

    const meanRawLag = sumRawLag / steadyCount;
    const meanPredErr = sumPredErr / steadyCount;
    const reductionPct = ((meanRawLag - meanPredErr) / meanRawLag) * 100;

    expect(reductionPct).toBeGreaterThanOrEqual(75);
    expect(meanPredErr).toBeLessThan(0.5);
  });

  it("4. 등속 직선 스트로크(240Hz, 4.17ms): 초저지연 프레임에서도 정확하게 수렴한다", () => {
    const stepMs = DISPLAY_REFRESH_HORIZON_MS["240hz"];
    const predictor = new SubframeStylusKalmanPredictor({ refreshTarget: "240hz" });
    const { lastT } = feedConstantVelocityLine(predictor, 840, 120, stepMs, 28);

    const pred = predictSubframeStylusHorizon(predictor, stepMs, 2);
    const tip = pred.points[pred.points.length - 1];
    expect(tip).toBeDefined();

    const futureSec = (lastT + stepMs) / 1000;
    const err = Math.hypot(10 + 840 * futureSec - (tip?.x ?? 0), 20 + 120 * futureSec - (tip?.y ?? 0));
    expect(err).toBeLessThan(0.35);
    expect(pred.refreshTarget).toBe("240hz");
  });

  it("5. 서브스텝 개수(1..4) 경계 클램프 및 단조 증가 선행 시각을 보장한다", () => {
    const predictor = new SubframeStylusKalmanPredictor({ refreshTarget: "120hz" });
    feedConstantVelocityLine(predictor, 500, 0, 8.3333, 12);

    const low = predictSubframeStylusHorizon(predictor, 8.3333, 0);
    const mid = predictSubframeStylusHorizon(predictor, 8.3333, 3);
    const high = predictSubframeStylusHorizon(predictor, 8.3333, 12);

    expect(low.points).toHaveLength(1);
    expect(mid.points).toHaveLength(3);
    expect(high.points).toHaveLength(4);

    for (let i = 1; i < high.points.length; i += 1) {
      const prev = high.points[i - 1];
      const curr = high.points[i];
      expect(curr?.leadTimeMs).toBeGreaterThan(prev?.leadTimeMs ?? 0);
      expect(curr?.timestampMs).toBeGreaterThan(prev?.timestampMs ?? 0);
    }
  });

  it("6. 고곡률 원호 추적: CTRA 회전각속도 예측이 단순 선형 접선 외삽보다 오차가 작다", () => {
    const stepMs = DISPLAY_REFRESH_HORIZON_MS["120hz"];
    const horizonMs = DISPLAY_REFRESH_HORIZON_MS["60hz"]; // 긴 곡률 지평선으로 차이 검증
    const radius = 56;
    const omega = 9.5; // rad/s (약 532 px/s)
    const predictor = new SubframeStylusKalmanPredictor({ refreshTarget: "120hz" });

    let sumCtraErr = 0;
    let sumLinearErr = 0;
    let samples = 0;
    let prevX = 0;
    let prevY = 0;

    for (let i = 0; i < 40; i += 1) {
      const tMs = i * stepMs;
      const tSec = tMs / 1000;
      const x = 100 + radius * Math.cos(omega * tSec);
      const y = 100 + radius * Math.sin(omega * tSec);
      predictor.update({ x, y, timestampMs: tMs, pressure: 0.7 });

      if (i >= 8) {
        const pred = predictSubframeStylusHorizon(predictor, horizonMs, 3);
        const tip = pred.points[pred.points.length - 1];
        const futSec = (tMs + horizonMs) / 1000;
        const gtX = 100 + radius * Math.cos(omega * futSec);
        const gtY = 100 + radius * Math.sin(omega * futSec);

        const dtSec = stepMs / 1000;
        const linX = x + ((x - prevX) / dtSec) * (horizonMs / 1000);
        const linY = y + ((y - prevY) / dtSec) * (horizonMs / 1000);

        sumCtraErr += Math.hypot(gtX - (tip?.x ?? x), gtY - (tip?.y ?? y));
        sumLinearErr += Math.hypot(gtX - linX, gtY - linY);
        samples += 1;
      }
      prevX = x;
      prevY = y;
    }

    const meanCtraErr = sumCtraErr / samples;
    const meanLinearErr = sumLinearErr / samples;
    expect(predictor.getSnapshot().omegaRadPerSec).toBeGreaterThan(6.5);
    expect(meanCtraErr).toBeLessThan(meanLinearErr * 0.55);
  });

  it("7. 시계/반시계 방향 원호 대칭성: 부호가 반대인 회전각속도 omega를 정확히 분리 추적한다", () => {
    const stepMs = 8.3333;
    const radius = 65;
    const omegaMag = 7.5;
    const ccw = new SubframeStylusKalmanPredictor({ refreshTarget: "120hz" });
    const cw = new SubframeStylusKalmanPredictor({ refreshTarget: "120hz" });

    for (let i = 0; i < 24; i += 1) {
      const tMs = i * stepMs;
      const s = tMs / 1000;
      ccw.update({ x: 100 + radius * Math.cos(omegaMag * s), y: 100 + radius * Math.sin(omegaMag * s), timestampMs: tMs });
      cw.update({ x: 100 + radius * Math.cos(-omegaMag * s), y: 100 + radius * Math.sin(-omegaMag * s), timestampMs: tMs });
    }

    expect(ccw.getSnapshot().omegaRadPerSec).toBeGreaterThan(5.5);
    expect(cw.getSnapshot().omegaRadPerSec).toBeLessThan(-5.5);
    expect(Math.abs(ccw.getSnapshot().omegaRadPerSec + cw.getSnapshot().omegaRadPerSec)).toBeLessThan(0.25);
  });

  it("8. 급각 90도 턱선 코너: 코너 브레이크 감쇠가 오버슈트를 4.0px 이하로 제한하고 비감쇠 외삽 대비 크게 줄인다", () => {
    const report = evaluatePredictiveInkLatencyBenchmark({
      refreshTarget: "120hz",
      scenarios: ["sharp-90-jawline-corner"],
    });
    const corner = report.scenarios[0];
    expect(corner).toBeDefined();
    expect(corner?.cornerBrakeActivationCount).toBeGreaterThan(0);
    expect(corner?.maxCornerOvershootPx).toBeLessThanOrEqual(4.0);
    expect(corner?.maxCornerOvershootPx).toBeLessThan(corner?.unclampedCornerOvershootPx ?? 99);
  });

  it("9. 예고 없는 갑작스러운 90도 직각 꺾임 및 135도 헤어 스파이크: 코너 진입 즉시 지평선을 0ms로 감쇠한다", () => {
    const stepMs = 8.3333;
    const speed = 420;
    const stepPx = speed * (stepMs / 1000); // 3.5px/frame
    const predictor = new SubframeStylusKalmanPredictor({ refreshTarget: "120hz" });

    let cornerX = 0;
    for (let i = 0; i <= 12; i += 1) {
      cornerX = 20 + i * stepPx;
      predictor.update({ x: cornerX, y: 50, timestampMs: i * stepMs });
    }

    // 13번째 패킷에서 갑작스럽게 90도 하강
    const turnRes = predictor.update({ x: cornerX, y: 50 + stepPx, timestampMs: 13 * stepMs });
    expect(turnRes.cornerCuspDetected).toBe(true);
    expect(turnRes.snapshot.brakeFactor).toBe(1);
    expect(turnRes.snapshot.brakeReason).toBe("sharp-corner-cusp");

    const predAtCorner = predictSubframeStylusHorizon(predictor, stepMs, 3);
    expect(predAtCorner.effectiveHorizonMs).toBe(0);
    const tipAtCorner = predAtCorner.points[predAtCorner.points.length - 1];
    const postTurnOvershootX = Math.max(0, (tipAtCorner?.x ?? cornerX) - cornerX);
    expect(postTurnOvershootX).toBeLessThanOrEqual(0.05);

    // 이어서 135도 급반전(헤어 팁)
    const hairpinRes = predictor.update({
      x: cornerX - stepPx * 0.707,
      y: 50 + stepPx - stepPx * 0.707,
      timestampMs: 14 * stepMs,
    });
    expect(hairpinRes.cornerCuspDetected).toBe(true);
    expect(predictSubframeStylusHorizon(predictor, stepMs, 3).effectiveHorizonMs).toBe(0);
  });

  it("10. 급감속 정지 접근 시 역주행(뒤로 튀는 예측 좌표)이 발생하지 않는다", () => {
    const predictor = new SubframeStylusKalmanPredictor({ refreshTarget: "120hz" });
    const xs = [0, 8, 16, 24, 30, 34, 36.2, 37.1, 37.4];
    for (let i = 0; i < xs.length; i += 1) {
      predictor.update({ x: xs[i] ?? 0, y: 100, timestampMs: i * 8.3333 });
    }
    const pred = predictSubframeStylusHorizon(predictor, 16.6667, 4);
    for (const pt of pred.points) {
      expect(pt.x).toBeGreaterThanOrEqual(pred.headX - 1e-6);
    }
  });

  it("11. 정지 펜 불변식: 속도 0 상태에서 유령 드리프트가 정확히 0px이다", () => {
    const predictor = new SubframeStylusKalmanPredictor({ refreshTarget: "120hz" });
    for (let i = 0; i < 12; i += 1) {
      predictor.update({ x: 142.5, y: 88.25, timestampMs: i * 8.3333, pressure: 0.5 });
    }
    const snap = predictor.getSnapshot();
    expect(snap.isStationary).toBe(true);
    expect(snap.speedPxPerSec).toBe(0);

    const pred = predictSubframeStylusHorizon(predictor, 16.6667, 4);
    expect(pred.maxDisplacementPx).toBe(0);
    expect(pred.effectiveHorizonMs).toBe(0);
    for (const pt of pred.points) {
      expect(pt.x).toBe(142.5);
      expect(pt.y).toBe(88.25);
      expect(pt.displacementFromHeadPx).toBe(0);
    }
  });

  it("12. 필압 및 펜촉 굵기 예측: 필압 상승 구간을 [0, 1] 범위와 양수 nibWidthPx로 예측한다", () => {
    const predictor = new SubframeStylusKalmanPredictor({
      refreshTarget: "120hz",
      baseNibWidthPx: 8,
      minNibWidthRatio: 0.25,
    });
    for (let i = 0; i < 12; i += 1) {
      predictor.update({
        x: 10 + i * 5,
        y: 20,
        timestampMs: i * 8.3333,
        pressure: Math.min(1, 0.2 + i * 0.05),
      });
    }
    const snap = predictor.getSnapshot();
    const pred = predictSubframeStylusHorizon(predictor, 8.3333, 3);
    expect(snap.pressureRate).toBeGreaterThan(0);
    for (const pt of pred.points) {
      expect(pt.pressure).toBeGreaterThanOrEqual(0);
      expect(pt.pressure).toBeLessThanOrEqual(1);
      expect(pt.nibWidthPx).toBeGreaterThanOrEqual(2);
      expect(pt.nibWidthPx).toBeLessThanOrEqual(8);
    }
  });

  it("13. 지평선 증가에 따른 신뢰도 단조 감소 불변식: confidence(4ms) >= confidence(8.33ms) >= confidence(16.67ms)", () => {
    const predictor = new SubframeStylusKalmanPredictor({ refreshTarget: "120hz" });
    feedConstantVelocityLine(predictor, 640, 120, 8.3333, 18);

    const p4 = predictSubframeStylusHorizon(predictor, 4.0, 2);
    const p8 = predictSubframeStylusHorizon(predictor, 8.3333, 2);
    const p16 = predictSubframeStylusHorizon(predictor, 16.6667, 2);

    expect(p4.terminalConfidence).toBeGreaterThan(p8.terminalConfidence);
    expect(p8.terminalConfidence).toBeGreaterThan(p16.terminalConfidence);
    expect(p4.terminalConfidence).toBeLessThanOrEqual(1);
    expect(p16.terminalConfidence).toBeGreaterThan(0);
  });

  it("14. 지평선 증가에 따른 불확실성 공분산 반경 단조 증가 불변식을 만족한다", () => {
    const predictor = new SubframeStylusKalmanPredictor({ refreshTarget: "120hz" });
    feedConstantVelocityLine(predictor, 580, 90, 8.3333, 16);

    const r4 = predictSubframeStylusHorizon(predictor, 4.0, 2).terminalUncertaintyRadiusPx;
    const r8 = predictSubframeStylusHorizon(predictor, 8.3333, 2).terminalUncertaintyRadiusPx;
    const r16 = predictSubframeStylusHorizon(predictor, 16.6667, 2).terminalUncertaintyRadiusPx;

    expect(r4).toBeGreaterThan(0);
    expect(r8).toBeGreaterThanOrEqual(r4);
    expect(r16).toBeGreaterThanOrEqual(r8);
  });

  it("15. disablePrediction 패스스루 모드: 투기 점을 0개 반환하고 유효 지평선을 0ms로 고정한다", () => {
    const predictor = new SubframeStylusKalmanPredictor({
      refreshTarget: "120hz",
      disablePrediction: true,
    });
    feedConstantVelocityLine(predictor, 700, 0, 8.3333, 12);

    const pred = predictSubframeStylusHorizon(predictor, 8.3333, 4);
    expect(pred.passthroughActive).toBe(true);
    expect(pred.points).toHaveLength(0);
    expect(pred.effectiveHorizonMs).toBe(0);
    expect(pred.brakeReason).toBe("disabled-or-reduced-motion");
  });

  it("16. prefersReducedMotion 모드: 모션 민감 사용자에게 투기 오버레이를 완전히 비활성화한다", () => {
    const predictor = new SubframeStylusKalmanPredictor({
      refreshTarget: "120hz",
      prefersReducedMotion: true,
    });
    feedConstantVelocityLine(predictor, 700, 0, 8.3333, 12);

    const pred = predictSubframeStylusHorizon(predictor, 8.3333, 3);
    expect(pred.passthroughActive).toBe(true);
    expect(pred.points).toHaveLength(0);
    expect(pred.maxDisplacementPx).toBe(0);
  });

  it("17. NaN 및 Infinity 입력 내성: 손상된 패킷을 안전하게 거절하고 필터 상태를 오염시키지 않는다", () => {
    const predictor = new SubframeStylusKalmanPredictor({ refreshTarget: "120hz" });
    feedConstantVelocityLine(predictor, 480, 0, 8.3333, 6);
    const before = predictor.getSnapshot();

    const badPackets: readonly RawStylusPacket[] = [
      { x: Number.NaN, y: 20, timestampMs: 100 },
      { x: 50, y: Number.POSITIVE_INFINITY, timestampMs: 108 },
      { x: 55, y: 20, timestampMs: Number.NaN },
      { x: 60, y: 20, timestampMs: 116, pressure: Number.NaN },
    ];

    for (const pkt of badPackets) {
      const res = predictor.update(pkt);
      expect(res.accepted).toBe(false);
      expect(res.rejectionReason).toBe("non-finite-input");
    }

    const after = predictor.getSnapshot();
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    expect(after.rejectedPacketCount).toBe(4);
    expect(Number.isFinite(predictSubframeStylusHorizon(predictor, 8.3333, 3).points[0]?.x)).toBe(true);
  });

  it("18. 역전·중복 타임스탬프 내성: 시간 역행 패킷을 거절하고 정상 패킷을 계속 추적한다", () => {
    const predictor = new SubframeStylusKalmanPredictor({ refreshTarget: "120hz" });
    predictor.update({ x: 0, y: 0, timestampMs: 10 });
    predictor.update({ x: 5, y: 0, timestampMs: 20 });

    const dup = predictor.update({ x: 7, y: 0, timestampMs: 20 });
    expect(dup.accepted).toBe(false);
    expect(dup.rejectionReason).toBe("duplicate-timestamp");

    const ooo = predictor.update({ x: 9, y: 0, timestampMs: 15 });
    expect(ooo.accepted).toBe(false);
    expect(ooo.rejectionReason).toBe("out-of-order-timestamp");

    const ok = predictor.update({ x: 10, y: 0, timestampMs: 30 });
    expect(ok.accepted).toBe(true);
    expect(ok.snapshot.sampleCount).toBe(3);
  });

  it("19. 장시간 휴지(maxGapResetMs 초과) 복귀 시 묵은 속도를 초기화해 좌표 폭주를 방지한다", () => {
    const predictor = new SubframeStylusKalmanPredictor({
      refreshTarget: "120hz",
      maxGapResetMs: 100,
    });
    feedConstantVelocityLine(predictor, 900, 0, 8.3333, 10);

    const resumed = predictor.update({ x: 300, y: 400, timestampMs: 500 });
    expect(resumed.accepted).toBe(true);
    expect(resumed.resetTriggered).toBe(true);
    expect(resumed.snapshot.speedPxPerSec).toBe(0);
    expect(resumed.snapshot.x).toBe(300);
    expect(resumed.snapshot.y).toBe(400);
  });

  it("20. 손떨림 노이즈 직선: 적응형 R 스케일이 고주파 진동을 감지해 원시 노이즈보다 궤적을 매끄럽게 만든다", () => {
    const predictor = new SubframeStylusKalmanPredictor({ refreshTarget: "120hz" });
    const stepMs = 8.3333;
    let rawJitterSum = 0;
    let filteredJitterSum = 0;
    let count = 0;

    for (let i = 0; i < 36; i += 1) {
      const tMs = i * stepMs;
      const gtX = 20 + 420 * (tMs / 1000);
      const gtY = 100;
      const noiseY = (i % 2 === 0 ? 1 : -1) * 2.1;
      const res = predictor.update({ x: gtX, y: gtY + noiseY, timestampMs: tMs });
      if (i >= 6) {
        rawJitterSum += Math.abs(noiseY);
        filteredJitterSum += Math.abs(res.snapshot.y - gtY);
        count += 1;
      }
    }

    expect(predictor.getSnapshot().adaptiveNoiseScale).toBeGreaterThan(1.2);
    expect(filteredJitterSum / count).toBeLessThan(rawJitterSum / count);
  });

  it("21. ReversibleSpeculativeInkSession: 확정 계층과 투기 계층을 엄격히 분리한다", () => {
    const session = new ReversibleSpeculativeInkSession({
      strokeId: "stroke-layer-check",
      refreshTarget: "120hz",
      substeps: 3,
    });

    for (let i = 0; i < 10; i += 1) {
      const frame = session.onPointerPacket({
        x: 10 + i * 6,
        y: 30 + i * 2,
        timestampMs: i * 8.3333,
        pressure: 0.7,
      });
      expect(frame.accepted).toBe(true);
      expect(frame.committedHead?.tier).toBe("committed");
      expect(frame.committedHead?.speculative).toBe(false);
      for (const tailPt of frame.speculativeTail) {
        expect(tailPt.tier).toBe("speculative");
        expect(tailPt.speculative).toBe(true);
        expect(tailPt.epoch).toBe(frame.epoch);
      }
    }

    const snap = session.getStateSnapshot();
    expect(snap.committedPoints).toHaveLength(10);
    expect(snap.committedSegments).toHaveLength(9);
    expect(snap.speculativeTail.length).toBeGreaterThan(0);
  });

  it("22. ReversibleSpeculativeInkSession: 새 패킷 도착 시 이전 투기 꼬리를 원자적으로 롤백한다", () => {
    const session = new ReversibleSpeculativeInkSession({ refreshTarget: "120hz" });
    session.onPointerPacket({ x: 0, y: 0, timestampMs: 0 });
    const f2 = session.onPointerPacket({ x: 6, y: 0, timestampMs: 8.3333 });
    expect(f2.speculativeTail.length).toBeGreaterThan(0);

    const f3 = session.onPointerPacket({ x: 12, y: 0, timestampMs: 16.6666 });
    expect(f3.rolledBackTailPointCount).toBe(f2.speculativeTail.length);
    expect(f3.epoch).toBe(f2.epoch + 1);
    expect(session.getStateSnapshot().totalRollbackCount).toBeGreaterThanOrEqual(1);
  });

  it("23. ReversibleSpeculativeInkSession finalizeStroke 불변식: 투기 꼬리 0건 및 확정 스트로크 오염 0건을 보장한다", () => {
    const session = new ReversibleSpeculativeInkSession({
      strokeId: "stroke-finalize-clean",
      refreshTarget: "120hz",
    });

    for (let i = 0; i < 16; i += 1) {
      session.onPointerPacket({ x: 5 + i * 7, y: 12 + i * 1.5, timestampMs: i * 8.3333 });
    }
    expect(session.getStateSnapshot().speculativeTail.length).toBeGreaterThan(0);

    const finalized = session.finalizeStroke();
    expect(finalized.isFinalized).toBe(true);
    expect(finalized.speculativeTail).toHaveLength(0);
    expect(finalized.zeroSpeculativeLeakage).toBe(true);
    expect(finalized.maxCommittedDeviationPx).toBe(0);
    expect(finalized.committedPoints).toHaveLength(16);
    expect(finalized.committedPoints.every((p) => p.tier === "committed" && !p.speculative)).toBe(true);
    expect(finalized.totalStrokeLengthPx).toBeGreaterThan(100);
  });

  it("24. finalizeStroke 이후 유입된 늦은 패킷은 확정 스트로크를 변조하지 않고 거절된다", () => {
    const session = new ReversibleSpeculativeInkSession({ refreshTarget: "120hz" });
    session.onPointerPacket({ x: 0, y: 0, timestampMs: 0 });
    session.onPointerPacket({ x: 10, y: 0, timestampMs: 8.3333 });
    const finalized = session.finalizeStroke();

    const late = session.onPointerPacket({ x: 20, y: 0, timestampMs: 16.6666 });
    expect(late.accepted).toBe(false);
    expect(late.rejectionReason).toBe("stroke-finalized");
    expect(late.speculativeTail).toHaveLength(0);
    expect(session.getStateSnapshot().committedPoints).toHaveLength(finalized.committedPoints.length);
  });

  it("25. 세션 단위 disablePrediction 패스스루: 투기 꼬리 0개 유지하면서 확정 세그먼트는 정상 누적한다", () => {
    const session = new ReversibleSpeculativeInkSession({
      refreshTarget: "120hz",
      disablePrediction: true,
    });
    for (let i = 0; i < 8; i += 1) {
      const f = session.onPointerPacket({ x: i * 8, y: 10, timestampMs: i * 8.3333 });
      expect(f.speculativeTail).toHaveLength(0);
    }
    const done = session.finalizeStroke();
    expect(done.committedPoints).toHaveLength(8);
    expect(done.totalRollbackCount).toBe(0);
    expect(done.zeroSpeculativeLeakage).toBe(true);
  });

  it("26. 전체 벤치마크(120Hz): 4종 만화 스트로크에서 지연 단축·원호 우위·코너 억제·커밋 무오염을 동시 충족한다", () => {
    const report = evaluatePredictiveInkLatencyBenchmark({ refreshTarget: "120hz" });
    expect(report.scenarioCount).toBe(4);
    expect(report.zeroSpeculativeLeakageOnCommit).toBe(true);
    expect(report.maxCornerOvershootPx).toBeLessThanOrEqual(4.0);

    const speedline = report.scenarios.find((s) => s.scenarioId === "fast-straight-speedline");
    const arc = report.scenarios.find((s) => s.scenarioId === "tight-circular-arc");
    const corner = report.scenarios.find((s) => s.scenarioId === "sharp-90-jawline-corner");

    expect(speedline?.lagReductionPercent).toBeGreaterThanOrEqual(75);
    expect(speedline?.meanPredictionErrorPx).toBeLessThan(0.5);
    expect(arc?.meanPredictionErrorPx).toBeLessThan(arc?.naiveLinearExtrapolationErrorPx ?? 99);
    expect(corner?.maxCornerOvershootPx).toBeLessThanOrEqual(4.0);
  });

  it("27. 벤치마크 주사율 적응(60Hz·240Hz): 각 프레임 예산에 맞게 지연 단축 및 무오염을 유지한다", () => {
    const r60 = evaluatePredictiveInkLatencyBenchmark({ refreshTarget: "60hz" });
    const r240 = evaluatePredictiveInkLatencyBenchmark({ refreshTarget: "240hz" });

    expect(r60.frameBudgetMs).toBeCloseTo(16.6667, 2);
    expect(r240.frameBudgetMs).toBeCloseTo(4.1667, 2);
    expect(r60.zeroSpeculativeLeakageOnCommit).toBe(true);
    expect(r240.zeroSpeculativeLeakageOnCommit).toBe(true);

    const s60 = r60.scenarios.find((s) => s.scenarioId === "fast-straight-speedline");
    const s240 = r240.scenarios.find((s) => s.scenarioId === "fast-straight-speedline");
    expect(s60?.lagReductionPercent).toBeGreaterThanOrEqual(75);
    expect(s240?.lagReductionPercent).toBeGreaterThanOrEqual(75);
  });

  it("28. 벤치마크 disablePrediction 모드: 패스스루 플래그와 지연 단축률 0%를 정직하게 보고한다", () => {
    const report = evaluatePredictiveInkLatencyBenchmark({
      refreshTarget: "120hz",
      disablePrediction: true,
    });
    expect(report.passthroughActive).toBe(true);
    expect(report.lagReductionPercent).toBeCloseTo(0, 4);
    expect(report.maxCornerOvershootPx).toBe(0);
    expect(report.zeroSpeculativeLeakageOnCommit).toBe(true);
  });

  it("29. WebGPU WGSL 투기 오버레이 셰이더 생성 및 정적 검증을 통과한다", () => {
    const wgsl = buildSpeculativeInkOverlayWgsl({ workgroupSizeX: 8, workgroupSizeY: 8 });
    const validation = validateSpeculativeInkWgsl(wgsl);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
    expect(validation.entryPoints).toContain("compositeSpeculativeInkOverlay");
    expect(validation.bindingCount).toBe(3);
    expect(validation.hasConfidenceFade).toBe(true);
    expect(validation.hasReducedMotionGuard).toBe(true);
  });

  it("30. validateSpeculativeInkWgsl은 괄호 불일치·신뢰도 페이드 누락·NaN 토큰을 검출한다", () => {
    const broken = "@compute @workgroup_size(8, 8, 1) fn broken() { let a = NaN; ";
    const result = validateSpeculativeInkWgsl(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("31. OKLCH 지연 엔벨로프 SVG: NaN 0건, 원시 hex/rgb 0건, XML 이스케이프 및 코너 마커를 보장한다", () => {
    const report = evaluatePredictiveInkLatencyBenchmark({ refreshTarget: "120hz" });
    const svgResult = renderPredictiveInkLatencySvg(report, {
      titleKo: `지연 테스트 <script>&"quote"</script>`,
    });

    expect(svgResult.containsNaN).toBe(false);
    expect(svgResult.usesOklchOnly).toBe(true);
    expect(svgResult.scenarioPanelCount).toBe(4);
    expect(svgResult.cornerBrakeMarkerCount).toBeGreaterThan(0);
    expect(svgResult.svg).toContain("oklch(");
    expect(svgResult.svg).not.toContain("<script>");
    expect(svgResult.svg).toContain("&lt;script&gt;&amp;&quot;quote&quot;&lt;/script&gt;");
    expect(/#[0-9a-fA-F]{3,8}\b/.test(svgResult.svg)).toBe(false);
    expect(/\brgba?\s*\(/i.test(svgResult.svg)).toBe(false);
  });

  it("32. 한국어 스튜디오 요약기: 자연스러운 실측 문구로 요약하며 번역투 금지 표현이 없다", () => {
    const report = evaluatePredictiveInkLatencyBenchmark({ refreshTarget: "120hz" });
    const summary = summarizePredictiveInkSessionKo(report);

    expect(summary.readinessGrade).toBe("출고 적합");
    expect(summary.headlineKo).toContain("120HZ");
    expect(summary.bulletPointsKo.length).toBeGreaterThanOrEqual(6);
    expect(summary.markdownKo).toContain("확정 스트로크 무결성");
    expect(summary.markdownKo).toContain("오염 0건");
    expect(summary.markdownKo).not.toContain("하는 것을 가능하게 합니다");
    expect(summary.markdownKo).not.toContain("직관적인 경험을 제공합니다");
    expect(summary.markdownKo).not.toContain("원활한 워크플로우를 보장합니다");

    const passthroughSummary = summarizePredictiveInkSessionKo(
      evaluatePredictiveInkLatencyBenchmark({ refreshTarget: "120hz", prefersReducedMotion: true }),
    );
    expect(passthroughSummary.readinessGrade).toBe("예측 비활성 패스스루");
  });
});
