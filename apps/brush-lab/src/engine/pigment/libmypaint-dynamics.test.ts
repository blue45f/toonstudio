import { describe, expect, it } from "vitest";

import { SumiError } from "../core/errors";

import {
  computeNormalizedSpeed,
  defaultLibMypaintDynamicsConfig,
  defaultLibMypaintDynamicsState,
  defaultLibmypaintDynamicsConfig,
  defaultLibmypaintDynamicsState,
  stepLibMypaintDynamics,
  stepLibmypaintDynamics,
  updateMyPaintSmudgeBucket,
  validateLibMypaintDynamicsConfig,
  validateLibmypaintDynamicsConfig,
} from "./libmypaint-dynamics";

describe("Libmypaint 다이내믹 및 K/S 스머지 내재화 수식", () => {
  it("첫 표본에서 최소 1개 다브를 방출하고 압력이 높을수록 유효 반경·불투명도가 커진다", () => {
    const config = defaultLibMypaintDynamicsConfig();
    const state = defaultLibMypaintDynamicsState([0.1, 0.2, 0.8, 1]);

    const light = stepLibMypaintDynamics(
      state,
      { x: 10, y: 20, pressure: 0.2, tiltX: 0, tiltY: 0 },
      16,
      [0.1, 0.2, 0.8, 1],
      config,
    );
    const heavy = stepLibMypaintDynamics(
      state,
      { x: 10, y: 20, pressure: 0.95, tiltX: 0, tiltY: 0 },
      16,
      [0.1, 0.2, 0.8, 1],
      config,
    );

    expect(light.dabsToEmit).toBeGreaterThanOrEqual(1);
    expect(heavy.effectiveRadiusPx).toBeGreaterThan(light.effectiveRadiusPx);
    expect(heavy.effectiveOpacity).toBeGreaterThan(light.effectiveOpacity);
  });

  it("빠른 이동 시 fineSpeed가 증가하고 속도 감쇠에 의해 유효 반경이 줄어든다", () => {
    const config = { ...defaultLibMypaintDynamicsConfig(), slowTracking: 0, speedRadiusGamma: 0.6 };
    const s0 = defaultLibMypaintDynamicsState();
    const step1 = stepLibMypaintDynamics(
      s0,
      { x: 0, y: 0, pressure: 0.8, tiltX: 0, tiltY: 0 },
      16,
      [0, 0, 0, 1],
      config,
    );
    const slowStep = stepLibMypaintDynamics(
      step1.state,
      { x: 1, y: 0, pressure: 0.8, tiltX: 0, tiltY: 0 },
      16,
      [0, 0, 0, 1],
      config,
    );
    const fastStep = stepLibMypaintDynamics(
      step1.state,
      { x: 80, y: 0, pressure: 0.8, tiltX: 0, tiltY: 0 },
      16,
      [0, 0, 0, 1],
      config,
    );

    expect(fastStep.state.fineSpeed).toBeGreaterThan(slowStep.state.fineSpeed);
    expect(fastStep.effectiveRadiusPx).toBeLessThan(slowStep.effectiveRadiusPx);
    expect(fastStep.dabsToEmit).toBeGreaterThan(slowStep.dabsToEmit);
  });

  it("캔버스 하부 색이 주어지면 Kubelka-Munk(K/S) 공간에서 스머지 혼색을 수행한다", () => {
    const config = { ...defaultLibMypaintDynamicsConfig(), smudgeRate: 0.5, pressurePigmentGain: 0 };
    const s0 = defaultLibMypaintDynamicsState([0, 0.2, 0.9, 1]);
    // 파랑 브러시 + 노랑 캔버스 → K/S 감산 혼색으로 녹색 성분(G)이 유지됨
    const res = stepLibMypaintDynamics(
      s0,
      {
        x: 15,
        y: 15,
        pressure: 0.8,
        tiltX: 30,
        tiltY: 15,
        canvasColor: [0.95, 0.9, 0.05, 1],
      },
      16,
      [0.05, 0.2, 0.9, 1],
      config,
    );

    expect(res.emittedColor[1]).toBeGreaterThan(0.2);
    expect(res.aspectRatio).toBeLessThan(1);
  });

  it("잘못된 설정이나 표본 입력은 SumiError로 거부한다", () => {
    expect(() =>
      validateLibMypaintDynamicsConfig({
        ...defaultLibMypaintDynamicsConfig(),
        opaque: 1.5,
      }),
    ).toThrow(SumiError);

    expect(() =>
      stepLibMypaintDynamics(
        defaultLibMypaintDynamicsState(),
        { x: 0, y: 0, pressure: -0.2, tiltX: 0, tiltY: 0 },
        16,
        [0, 0, 0, 1],
      ),
    ).toThrow(SumiError);
  });
});

describe("Libmypaint 동역학 수식 내재화(libmypaint-dynamics)", () => {
  it("설정 검증: 잘못된 radiusLog/opaque/speedSlowness는 SumiError를 던진다", () => {
    const base = defaultLibmypaintDynamicsConfig();
    expect(() => validateLibmypaintDynamicsConfig({ ...base, radiusLog: 12 })).toThrow(SumiError);
    expect(() => validateLibmypaintDynamicsConfig({ ...base, opaque: 1.5 })).toThrow(SumiError);
    expect(() => validateLibmypaintDynamicsConfig({ ...base, speed1Slowness: 0 })).toThrow(
      SumiError,
    );
    expect(() => validateLibmypaintDynamicsConfig({ ...base, ellipticalDabRatio: 0.5 })).toThrow(
      SumiError,
    );
  });

  it("이중 속도 필터(speed1 빠른 응답 > speed2 느린 응답) 및 속도 감속 반경 모듈레이션", () => {
    const config = defaultLibmypaintDynamicsConfig();
    let state = defaultLibmypaintDynamicsState();
    state = stepLibmypaintDynamics(
      state,
      { dx: 24, dy: 0, pressure: 0.7, dtSec: 0.016 },
      config,
    );
    expect(state.speed1).toBeGreaterThan(state.speed2);
    expect(state.speed2).toBeGreaterThan(0);

    // 정지 상태 대비 고속 이동 시 음수 radiusBySpeed1로 인해 유효 반경이 줄어든다
    const slowState = stepLibmypaintDynamics(
      defaultLibmypaintDynamicsState(),
      { dx: 0.1, dy: 0, pressure: 0.7, dtSec: 0.016 },
      config,
    );
    expect(state.effectiveRadiusPx).toBeLessThan(slowState.effectiveRadiusPx);
  });

  it("방향 필터(dirX, dirY, directionRad)가 이동 궤적 각도로 부드럽게 회전한다", () => {
    const config = defaultLibmypaintDynamicsConfig();
    let state = defaultLibmypaintDynamicsState();
    for (let i = 0; i < 6; i += 1) {
      state = stepLibmypaintDynamics(
        state,
        { dx: 0, dy: 12, pressure: 0.8, dtSec: 0.016 },
        config,
      );
    }
    expect(state.dirY).toBeGreaterThan(0.7);
    expect(state.directionRad).toBeGreaterThan(0.8);
  });

  it("압력 0이면 opaque_multiply 게이트에 의해 유효 불투명도가 0이 된다", () => {
    const state = stepLibmypaintDynamics(defaultLibmypaintDynamicsState(), {
      dx: 4,
      dy: 4,
      pressure: 0,
      dtSec: 0.016,
    });
    expect(state.effectiveOpacity).toBe(0);
  });

  it("KM 기반 스머지 버킷(updateMyPaintSmudgeBucket)이 캔버스 색상을 점진 흡수한다", () => {
    const bucket: readonly [number, number, number, number] = [0.05, 0.2, 0.85, 1];
    const canvasYellow: readonly [number, number, number, number] = [0.95, 0.88, 0.1, 1];
    const next = updateMyPaintSmudgeBucket(bucket, canvasYellow, 0.5, 0.032);
    expect(next[1]).toBeGreaterThan(bucket[1]);
    expect(next[2]).toBeLessThan(bucket[2]);
    expect(computeNormalizedSpeed(0)).toBe(0);
  });
});
