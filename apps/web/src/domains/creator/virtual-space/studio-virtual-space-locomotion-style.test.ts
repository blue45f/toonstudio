import { describe, expect, it } from "vitest";

import {
  scaleAroundOne,
  stepCrispVelocity,
  studioCadenceLimitedStride,
  studioLocomotionStyle,
} from "./studio-virtual-space-locomotion-style";

const MAX = 247;
const CRISP = studioLocomotionStyle("crisp");
const CLASSIC = studioLocomotionStyle("classic");

interface Sample { readonly t: number; readonly speed: number; readonly vx: number; readonly vy: number }

/** dt 간격으로 `seconds` 동안 속도를 갱신하며 시각별 속도와 이동 거리를 모은다. */
function simulate(
  dt: number,
  seconds: number,
  targetAt: (t: number) => { x: number; y: number },
  start = { x: 0, y: 0 },
  responsiveness = 1,
) {
  let velocity = { ...start };
  let distanceX = 0;
  const samples: Sample[] = [];
  const steps = Math.round(seconds / dt);
  for (let index = 0; index < steps; index += 1) {
    const t = index * dt;
    velocity = stepCrispVelocity(velocity, targetAt(t), dt, MAX, CRISP, responsiveness);
    distanceX += velocity.x * dt;
    samples.push({ t: t + dt, speed: Math.hypot(velocity.x, velocity.y), vx: velocity.x, vy: velocity.y });
  }
  return { samples, distanceX, velocity };
}

function firstTimeAtLeast(samples: readonly Sample[], speed: number): number | null {
  return samples.find((sample) => sample.speed >= speed)?.t ?? null;
}

describe("이동 감각 스타일", () => {
  it("기본(즉응형)은 관성 요소를 모두 끄고 관성형은 기존 값을 그대로 둔다", () => {
    expect(studioLocomotionStyle(undefined)).toBe(CRISP);
    expect(studioLocomotionStyle(null)).toBe(CRISP);
    expect(CRISP).toMatchObject({
      feel: "crisp", inertial: false, collisionBounce: false, squashScale: 0, gaitSwayScale: 0, gaitRockScale: 0, leanScale: 0,
    });
    expect(CRISP.cameraDeadzoneScale).toBeLessThan(1);
    expect(CLASSIC).toMatchObject({
      feel: "classic", inertial: true, collisionBounce: true, squashScale: 1, gaitBobScale: 1, gaitSwayScale: 1,
      gaitRockScale: 1, leanScale: 1, displayDampScale: 1, movingHoldMs: 100, cameraDeadzoneScale: 1, peerDeadzonePx: 2.5,
      maxGaitCyclesPerSecond: null,
    });
  });

  it("스타일 상수는 변경할 수 없다", () => {
    expect(Object.isFrozen(CRISP)).toBe(true);
    expect(Object.isFrozen(CLASSIC)).toBe(true);
  });
});

describe("즉응형 속도 갱신", () => {
  it("출발: 60fps 4프레임(67ms) 안에 90% 속도에 닿고 첫 프레임부터 눈에 띄게 움직인다", () => {
    const { samples } = simulate(1 / 60, 0.5, () => ({ x: MAX, y: 0 }));
    expect(samples[0]!.speed).toBeGreaterThan(MAX * 0.25);
    expect(firstTimeAtLeast(samples, MAX * 0.9)).toBeLessThanOrEqual(0.07);
    expect(samples.at(-1)!.speed).toBe(MAX);
  });

  it("정지: 키를 떼면 40ms 안에 정확히 멈추고 미끄러지는 거리는 6px 이하다", () => {
    const hold = simulate(1 / 60, 0.5, () => ({ x: MAX, y: 0 }));
    const release = simulate(1 / 60, 0.3, () => ({ x: 0, y: 0 }), hold.velocity);
    const stoppedAt = release.samples.find((sample) => sample.speed === 0)?.t;
    expect(stoppedAt).toBeLessThanOrEqual(0.04);
    expect(release.distanceX).toBeLessThanOrEqual(6);
    expect(release.samples.at(-1)!.speed).toBe(0);
  });

  it("반전: 반대 방향 키는 90ms 안에 반대 방향 최고 속도가 되고 최고 속도를 넘지 않는다", () => {
    const run = simulate(1 / 60, 0.4, () => ({ x: MAX, y: 0 }));
    const turn = simulate(1 / 60, 0.3, () => ({ x: -MAX, y: 0 }), run.velocity);
    expect(firstTimeAtLeast(turn.samples.map((sample) => ({ ...sample, speed: -sample.vx })), MAX * 0.9)).toBeLessThanOrEqual(0.12);
    for (const sample of turn.samples) expect(sample.speed).toBeLessThanOrEqual(MAX + 1e-9);
    expect(turn.samples.at(-1)!.vx).toBe(-MAX);
  });

  it("직각 방향 전환에서도 속도 크기가 최고 속도를 넘지 않고 매끄럽게 이어진다", () => {
    const { samples } = simulate(1 / 60, 0.4, (t) => (t < 0.2 ? { x: MAX, y: 0 } : { x: 0, y: MAX }));
    let previous = 0;
    for (const sample of samples) {
      expect(sample.speed).toBeLessThanOrEqual(MAX + 1e-9);
      expect(Math.abs(sample.speed - previous)).toBeLessThanOrEqual(MAX * 0.5);
      previous = sample.speed;
    }
    expect(samples.at(-1)).toMatchObject({ vx: 0, vy: MAX });
  });

  it("프레임 간격이 달라도 같은 시각에 같은 속도에 닿는다", () => {
    const times = [1 / 30, 1 / 60, 1 / 144].map((dt) =>
      firstTimeAtLeast(simulate(dt, 0.3, () => ({ x: MAX, y: 0 })).samples, MAX)!);
    for (const time of times) expect(Math.abs(time - 0.05)).toBeLessThanOrEqual(1 / 30 + 1e-9);
  });

  it("프레임 간격이 달라도 출발 직후 이동 거리가 비슷하다", () => {
    const distances = [1 / 30, 1 / 60, 1 / 144].map((dt) =>
      simulate(dt, 0.3, () => ({ x: MAX, y: 0 })).distanceX);
    const spread = Math.max(...distances) - Math.min(...distances);
    expect(spread).toBeLessThanOrEqual(3);
  });

  it("가속 배율을 올리면 더 빨리, 낮추면 더 천천히 최고 속도에 닿는다", () => {
    const quick = firstTimeAtLeast(simulate(1 / 144, 0.4, () => ({ x: MAX, y: 0 }), { x: 0, y: 0 }, 2).samples, MAX)!;
    const base = firstTimeAtLeast(simulate(1 / 144, 0.4, () => ({ x: MAX, y: 0 }), { x: 0, y: 0 }, 1).samples, MAX)!;
    const slow = firstTimeAtLeast(simulate(1 / 144, 0.4, () => ({ x: MAX, y: 0 }), { x: 0, y: 0 }, 0.5).samples, MAX)!;
    expect(quick).toBeLessThan(base);
    expect(base).toBeLessThan(slow);
  });

  it("조이스틱처럼 작은 목표 속도도 그대로 따라가며 최고 속도로 튀지 않는다", () => {
    const half = MAX * 0.4;
    const { samples } = simulate(1 / 60, 0.3, () => ({ x: half, y: 0 }));
    for (const sample of samples) expect(sample.speed).toBeLessThanOrEqual(half + 1e-9);
    expect(samples.at(-1)!.speed).toBe(half);
  });

  it("달리기에서 걷기로 줄이면 정지 시간(30ms) 기준으로 곧바로 내려온다", () => {
    const sprint = MAX * 1.35;
    const { samples } = simulate(1 / 60, 0.2, () => ({ x: MAX, y: 0 }), { x: sprint, y: 0 });
    expect(samples.at(-1)!.speed).toBe(MAX);
    expect(firstTimeAtLeast(samples.map((sample) => ({ ...sample, speed: sprint - sample.speed })), sprint - MAX)).toBeLessThanOrEqual(0.05);
  });

  it("시간이 0이거나 비정상 입력이면 현재 속도를 유지하고 NaN을 만들지 않는다", () => {
    expect(stepCrispVelocity({ x: 10, y: 5 }, { x: MAX, y: 0 }, 0, MAX, CRISP)).toEqual({ x: 10, y: 5 });
    const broken = stepCrispVelocity({ x: Number.NaN, y: Infinity }, { x: Number.NaN, y: 3 }, 1 / 60, Number.NaN, CRISP, Number.NaN);
    expect(Number.isFinite(broken.x)).toBe(true);
    expect(Number.isFinite(broken.y)).toBe(true);
  });

  it("긴 프레임 틈(탭 복귀)도 한 번에 최고 속도를 넘지 않는다", () => {
    const next = stepCrispVelocity({ x: 0, y: 0 }, { x: MAX, y: 0 }, 5, MAX, CRISP);
    expect(next.x).toBeLessThanOrEqual(MAX);
    expect(next.x).toBeGreaterThan(0);
  });
});

describe("걸음 주기 상한", () => {
  it("빠른 월드에서는 보폭을 늘려 초당 사이클이 상한을 넘지 않게 한다", () => {
    const stride = studioCadenceLimitedStride(82, 247, CRISP);
    expect(stride).toBeGreaterThan(82);
    expect(247 / stride).toBeLessThanOrEqual(CRISP.maxGaitCyclesPerSecond! + 1e-9);
  });

  it("이미 충분히 긴 보폭과 관성형은 그대로 둔다", () => {
    expect(studioCadenceLimitedStride(140, 160, CRISP)).toBe(140);
    expect(studioCadenceLimitedStride(82, 247, CLASSIC)).toBe(82);
  });

  it("비정상 값은 입력 보폭을 그대로 돌려준다", () => {
    expect(studioCadenceLimitedStride(82, Number.NaN, CRISP)).toBe(82);
    expect(studioCadenceLimitedStride(82, -5, CRISP)).toBe(82);
    expect(Number.isNaN(studioCadenceLimitedStride(Number.NaN, 247, CRISP))).toBe(true);
  });
});

describe("변형 배율", () => {
  it("1을 기준으로 변형 크기만 줄이거나 끈다", () => {
    expect(scaleAroundOne(1.1, 1)).toBe(1.1);
    expect(scaleAroundOne(1.1, 0)).toBe(1);
    expect(scaleAroundOne(0.9, 0.5)).toBeCloseTo(0.95, 10);
    expect(scaleAroundOne(Number.NaN, 0.5)).toBe(1);
    expect(scaleAroundOne(1.2, -3)).toBe(1);
  });
});
