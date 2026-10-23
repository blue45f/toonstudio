import { describe, expect, it } from "vitest";

import { SumiError } from "../core/errors";

import {
  computeNormalizedSpeed,
  defaultLibmypaintDynamicsConfig,
  defaultLibmypaintDynamicsState,
  stepLibmypaintDynamics,
  updateMyPaintSmudgeBucket,
  validateLibmypaintDynamicsConfig,
} from "./libmypaint-dynamics";

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
