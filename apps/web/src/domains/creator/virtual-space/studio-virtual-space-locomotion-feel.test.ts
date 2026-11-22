import { describe, expect, it } from "vitest";
import { DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG } from "./studio-virtual-space-physics";
import {
  bounceVelocity,
  collisionShake,
  createStudioFacingTurnState,
  easeInOutCubic,
  easeOutCubic,
  facingAngleFromVelocity,
  LOCOMOTION_PRECISION_SPEED,
  LOCOMOTION_SHARP_TURN_RADIANS,
  LOCOMOTION_SQUASH_SCALE_MAX,
  LOCOMOTION_SQUASH_SCALE_MIN,
  LOCOMOTION_STOP_SETTLE_DURATION_MS,
  locomotionDirectionalSquashStretch,
  locomotionSquashStretch,
  shortestAngleDelta,
  skidIntensity,
  stepFacingAngle,
  stepFeelVelocity,
  stepFeelVelocityWithSkid,
  stepTurnAngleSmooth,
  studioLocomotionStopSettle,
  turnSlowdownFactor,
} from "./studio-virtual-space-locomotion-feel";

describe("이징 커브", () => {
  it("ease-out은 초반에 빠르게 오른다", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.25)).toBeGreaterThan(0.25);
  });

  it("ease-in-out은 양 끝이 완만하다", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 10);
    expect(easeInOutCubic(0.1)).toBeLessThan(0.1);
    expect(easeInOutCubic(0.9)).toBeGreaterThan(0.9);
  });
});

describe("가속/감속 커브 스텝", () => {
  it("정지 상태에서 목표 속도를 향해 가속한다", () => {
    let velocity = { x: 0, y: 0 };
    const target = { x: 210, y: 0 };
    for (let i = 0; i < 120; i += 1) {
      velocity = stepFeelVelocity(velocity, target, 1 / 60);
    }
    expect(velocity.x).toBeCloseTo(210, 0);
  });

  it("감속은 목표 0에서 부드럽게 멈춘다", () => {
    let velocity = { x: 210, y: 0 };
    for (let i = 0; i < 120; i += 1) {
      velocity = stepFeelVelocity(velocity, { x: 0, y: 0 }, 1 / 60);
    }
    expect(Math.hypot(velocity.x, velocity.y)).toBeLessThan(0.5);
  });

  it("역방향 입력이면 감속 경로를 탄다", () => {
    const reversed = stepFeelVelocity({ x: 210, y: 0 }, { x: -210, y: 0 }, 1 / 60);
    expect(reversed.x).toBeLessThan(210);
    expect(reversed.x).toBeGreaterThan(-210);
  });

  it("저속 정밀 구간에서는 목표를 거의 즉시 따라간다", () => {
    const stepped = stepFeelVelocity(
      { x: 0, y: 0 },
      { x: LOCOMOTION_PRECISION_SPEED / 2, y: 0 },
      1 / 60,
    );
    // 1프레임에 목표의 절반 이상을 따라간다 (관성 물리보다 훨씬 빠름)
    expect(stepped.x).toBeGreaterThan(LOCOMOTION_PRECISION_SPEED / 4);
  });

  it("dt 0이면 그대로 반환한다", () => {
    const current = { x: 50, y: 30 };
    expect(stepFeelVelocity(current, { x: 210, y: 0 }, 0)).toBe(current);
  });
});

describe("각도 보간", () => {
  it("최단 호로 회전한다 (역방향은 -π 기준)", () => {
    expect(shortestAngleDelta(0, Math.PI)).toBeCloseTo(Math.PI, 10);
    expect(shortestAngleDelta(0, -Math.PI)).toBeCloseTo(Math.PI, 10);
    expect(shortestAngleDelta(Math.PI * 0.9, -Math.PI * 0.9)).toBeCloseTo(Math.PI * 0.2, 10);
  });

  it("속도 벡터에서 바라보는 각도를 구한다", () => {
    expect(facingAngleFromVelocity({ x: 100, y: 0 }, 0)).toBeCloseTo(0, 10);
    expect(facingAngleFromVelocity({ x: 0, y: 100 }, 0)).toBeCloseTo(Math.PI / 2, 10);
    expect(facingAngleFromVelocity({ x: 0, y: 0 }, 1.2)).toBe(1.2);
  });

  it("급회전은 느리게, 완만하면 빠르게 돈다", () => {
    const sharp = stepFacingAngle(0, Math.PI, 1 / 60, 210);
    const gentle = stepFacingAngle(0, 0.2, 1 / 60, 210);
    expect(sharp).toBeGreaterThan(0);
    expect(sharp).toBeLessThan(Math.PI);
    expect(gentle).toBeCloseTo(0.2, 5);
  });

  it("급회전 임계값 상수를 노출한다", () => {
    expect(LOCOMOTION_SHARP_TURN_RADIANS).toBeCloseTo(Math.PI * 0.75, 10);
  });

  it("급회전 시 감속 계수가 1보다 작다", () => {
    expect(turnSlowdownFactor(0)).toBe(1);
    expect(turnSlowdownFactor(Math.PI / 2)).toBeLessThan(1);
    expect(turnSlowdownFactor(Math.PI)).toBeCloseTo(0.45, 2);
  });
});

describe("등신 비율 고정 (Proportional Height Lock)", () => {
  it("정지·최대 속도·reduced-motion 전 구간에서 배율이 1로 고정된다", () => {
    expect(locomotionSquashStretch(0, 210, false)).toEqual({ scaleX: 1, scaleY: 1 });
    expect(locomotionSquashStretch(210, 210, false)).toEqual({ scaleX: 1, scaleY: 1 });
    expect(locomotionSquashStretch(210, 210, true)).toEqual({ scaleX: 1, scaleY: 1 });
  });
});

describe("방향성 이동 등신 비율 잠금", () => {
  const dt = 1 / 60;

  it("정지·수평·수직·대각·가감속 모든 이동 구간에서 캐릭터 키·폭이 1.0으로 고정된다", () => {
    const cases = [
      locomotionDirectionalSquashStretch({ x: 0, y: 0 }, { x: 0, y: 0 }, dt, 210, false),
      locomotionDirectionalSquashStretch({ x: 0, y: 0 }, { x: 200, y: 0 }, dt, 210, false),
      locomotionDirectionalSquashStretch({ x: 210, y: 0 }, { x: 210, y: 0 }, dt, 210, false),
      locomotionDirectionalSquashStretch({ x: 0, y: 210 }, { x: 0, y: 210 }, dt, 210, false),
      locomotionDirectionalSquashStretch({ x: 150, y: 150 }, { x: 150, y: 150 }, dt, 210, false),
      locomotionDirectionalSquashStretch({ x: 160, y: 0 }, { x: 60, y: 0 }, dt, 210, false),
      locomotionDirectionalSquashStretch({ x: 160, y: 0 }, { x: 210, y: 0 }, dt, 210, false),
      locomotionDirectionalSquashStretch({ x: 500, y: 500 }, { x: 0, y: 0 }, dt, 210, false),
      locomotionDirectionalSquashStretch({ x: 160, y: 0 }, { x: 60, y: 0 }, dt, 210, true),
    ];
    for (const result of cases) {
      expect(result).toEqual({ scaleX: 1, scaleY: 1 });
      expect(result.scaleX).toBeGreaterThanOrEqual(LOCOMOTION_SQUASH_SCALE_MIN);
      expect(result.scaleX).toBeLessThanOrEqual(LOCOMOTION_SQUASH_SCALE_MAX);
      expect(result.scaleY).toBeGreaterThanOrEqual(LOCOMOTION_SQUASH_SCALE_MIN);
      expect(result.scaleY).toBeLessThanOrEqual(LOCOMOTION_SQUASH_SCALE_MAX);
    }
  });
});

describe("충돌 반발", () => {
  it("벽 법선 기준으로 속도를 반사한다", () => {
    const bounced = bounceVelocity({ x: 100, y: 0 }, { x: -1, y: 0 }, 0.5);
    expect(bounced.x).toBeCloseTo(-50, 5);
    expect(bounced.y).toBeCloseTo(0, 5);
  });

  it("접선 성분은 마찰로 줄어든다", () => {
    const bounced = bounceVelocity({ x: 100, y: 100 }, { x: -1, y: 0 }, 0.35);
    expect(bounced.y).toBeCloseTo(85, 5);
  });

  it("이미 벽에서 멀어지는 중이면 그대로 둔다", () => {
    const velocity = { x: -50, y: 0 };
    expect(bounceVelocity(velocity, { x: -1, y: 0 })).toBe(velocity);
  });

  it("법선이 0이면 그대로 둔다", () => {
    const velocity = { x: 50, y: 0 };
    expect(bounceVelocity(velocity, { x: 0, y: 0 })).toBe(velocity);
  });
});

describe("충돌 화면 흔들림", () => {
  it("가벼운 접촉에는 흔들리지 않는다", () => {
    expect(collisionShake(30, 210, false)).toEqual({ intensity: 0, durationMs: 0 });
  });

  it("세게 부딪힐수록 흔들림이 강해진다", () => {
    const weak = collisionShake(100, 210, false);
    const strong = collisionShake(210, 210, false);
    expect(weak.intensity).toBeGreaterThan(0);
    expect(strong.intensity).toBeGreaterThan(weak.intensity);
    expect(strong.intensity).toBeLessThanOrEqual(1);
    expect(strong.durationMs).toBeGreaterThan(weak.durationMs);
  });

  it("reduced-motion에서는 흔들리지 않는다", () => {
    expect(collisionShake(210, 210, true)).toEqual({ intensity: 0, durationMs: 0 });
  });
});

describe("급정지 미끄러짐", () => {
  it("저속 정지에서는 미끄러짐이 없다", () => {
    expect(skidIntensity(40, 0, 210)).toBe(0);
  });

  it("고속 급정지에서는 미끄러짐 강도가 0보다 크다", () => {
    const intensity = skidIntensity(200, 0, 210);
    expect(intensity).toBeGreaterThan(0);
    expect(intensity).toBeLessThanOrEqual(1);
  });

  it("완만한 감속에서는 미끄러짐이 없다", () => {
    expect(skidIntensity(200, 190, 210)).toBe(0);
  });

  it("미끄러짐 스텝은 일반 스텝보다 천천히 멈춘다", () => {
    const config = DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG;
    const skidded = stepFeelVelocityWithSkid({ x: 200, y: 0 }, { x: 0, y: 0 }, 0.016, config);
    const normal = stepFeelVelocity({ x: 200, y: 0 }, { x: 0, y: 0 }, 0.016, config);
    expect(skidded.x).toBeGreaterThan(normal.x);
    expect(skidded.x).toBeLessThan(200);
  });

  it("미끄러짐이 없으면 일반 스텝과 동일하다", () => {
    const config = DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG;
    const skidded = stepFeelVelocityWithSkid({ x: 40, y: 0 }, { x: 0, y: 0 }, 0.016, config);
    const normal = stepFeelVelocity({ x: 40, y: 0 }, { x: 0, y: 0 }, 0.016, config);
    expect(skidded.x).toBeCloseTo(normal.x, 10);
  });
});

describe("각가속도 기반 회전 보간", () => {
  it("초기 각속도는 0에서 시작해 서서히 붙는다", () => {
    const first = stepTurnAngleSmooth(createStudioFacingTurnState(0), Math.PI, 0.016, 150);
    const second = stepTurnAngleSmooth(first, Math.PI, 0.016, 150);
    expect(Math.abs(first.angularVelocity)).toBeGreaterThan(0);
    expect(Math.abs(second.angularVelocity)).toBeGreaterThanOrEqual(Math.abs(first.angularVelocity));
  });

  it("목표를 지나치지 않고 수렴한다", () => {
    let state = createStudioFacingTurnState(0);
    for (let i = 0; i < 240; i += 1) {
      state = stepTurnAngleSmooth(state, Math.PI / 2, 0.016, 150);
    }
    expect(state.angle).toBeCloseTo(Math.PI / 2, 2);
  });

  it("최고 각속도를 초과하지 않는다", () => {
    let state = createStudioFacingTurnState(0);
    let maxObserved = 0;
    for (let i = 0; i < 120; i += 1) {
      state = stepTurnAngleSmooth(state, Math.PI, 0.016, 210);
      maxObserved = Math.max(maxObserved, Math.abs(state.angularVelocity));
    }
    // 급회전 구간(|delta| >= 135°)에서는 9.6 rad/s, 벗어나면 12 rad/s까지 허용
    expect(maxObserved).toBeLessThanOrEqual(12.01);
  });

  it("dt가 0이면 상태가 그대로다", () => {
    const state = createStudioFacingTurnState(1);
    expect(stepTurnAngleSmooth(state, 2, 0, 150)).toBe(state);
  });
});

describe("정지 관성 세틀 (Stop-Settle Physics)", () => {
  it("멈춘 직후 크기 변형 없이(scale 1.0) 미세 정착 오프셋만 감쇠 후 원복한다", () => {
    const fastSettle = studioLocomotionStopSettle(55, 210, 210, false);
    const slowSettle = studioLocomotionStopSettle(55, 80, 210, false);
    expect(fastSettle.offsetY).toBeGreaterThan(slowSettle.offsetY);
    expect(fastSettle.scaleX).toBe(1);
    expect(fastSettle.scaleY).toBe(1);
    expect(fastSettle.leanDeg).toBeGreaterThan(0);
    expect(fastSettle.leanDeg).toBeLessThanOrEqual(0.5);

    // 세틀 지속 시간이 지나면 완전히 중립으로 돌아온다
    expect(studioLocomotionStopSettle(LOCOMOTION_STOP_SETTLE_DURATION_MS, 210, 210, false)).toEqual({
      offsetY: 0,
      scaleX: 1,
      scaleY: 1,
      leanDeg: 0,
    });
  });

  it("아주 느린 정지나 reduced-motion에서는 세틀 변형이 없다", () => {
    expect(studioLocomotionStopSettle(55, 10, 210, false)).toEqual({
      offsetY: 0,
      scaleX: 1,
      scaleY: 1,
      leanDeg: 0,
    });
    expect(studioLocomotionStopSettle(55, 210, 210, true)).toEqual({
      offsetY: 0,
      scaleX: 1,
      scaleY: 1,
      leanDeg: 0,
    });
  });
});

