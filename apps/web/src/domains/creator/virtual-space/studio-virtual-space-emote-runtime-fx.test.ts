import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { studioEmoteBurstPlan } from "./studio-virtual-space-emote-fx";
import { StudioEmoteRuntime, type StudioEmoteRuntimeOptions } from "./studio-virtual-space-emote-runtime";

/** 어떤 setXxx 호출이든 받아 자기 자신을 돌려주는 Phaser 게임 객체 대역(이 시험은 일정 계산만 본다). */
function chainable(): unknown {
  const proxy: unknown = new Proxy({}, { get: () => () => proxy });
  return proxy;
}

function fakeScene() {
  return {
    textures: { exists: () => true },
    make: {},
    add: { image: () => chainable(), container: () => chainable() },
  };
}

interface Burst { readonly x: number; readonly y: number; readonly depth: number; readonly count: number; readonly color: number }

function runtimeFor(options: Partial<StudioEmoteRuntimeOptions> = {}) {
  const bursts: Burst[] = [];
  const runtime = new StudioEmoteRuntime(fakeScene() as never, {
    nearestFilter: 0,
    colors: { paper: 0xffffff, ink: 0x000000, accent: 0x7777ff, accent2: 0x77ffff },
    burst: (x, y, depth, count, color) => { bursts.push({ x, y, depth, count, color }); },
    ...options,
  });
  return { runtime, bursts };
}

const canvas = readFileSync(new URL("./StudioVirtualSpacePhaserCanvas.tsx", import.meta.url), "utf8");
const plan = studioEmoteBurstPlan("fireworks");

describe("이모트 시작 연출(폭죽) 재생", () => {
  it("시작하자마자 첫 발이 머리 위 기준점 오프셋에서 터지고, 지연이 지날 때마다 한 발씩 한 번만 터진다", () => {
    const { runtime, bursts } = runtimeFor();
    runtime.play("self", "fireworks", 1_000);
    runtime.place("self", 100, 200, 1, 1_000, false);
    expect(bursts).toHaveLength(1);
    expect(bursts[0]).toMatchObject({ x: 100 + (plan[0]?.dx ?? 0), y: 200 + (plan[0]?.dy ?? 0), count: plan[0]?.count, color: plan[0]?.color });
    // 같은 시각을 다시 그려도 다시 터지지 않는다.
    runtime.place("self", 100, 200, 1, 1_000, false);
    runtime.place("self", 100, 200, 1, 1_100, false);
    expect(bursts).toHaveLength(1);
    runtime.place("self", 100, 200, 1, 1_000 + (plan[1]?.delayMs ?? 0) - 1, false);
    expect(bursts).toHaveLength(1);
    runtime.place("self", 100, 200, 1, 1_000 + (plan[1]?.delayMs ?? 0), false);
    expect(bursts).toHaveLength(2);
    expect(bursts[1]).toMatchObject({ count: plan[1]?.count, color: plan[1]?.color });
    for (let index = 2; index < plan.length; index += 1) runtime.place("self", 100, 200, 1, 1_000 + (plan[index]?.delayMs ?? 0), false);
    expect(bursts.map((burst) => burst.color)).toEqual(plan.map((burst) => burst.color));
    runtime.place("self", 100, 200, 1, 1_000 + 2_500, false);
    expect(bursts).toHaveLength(plan.length);
  });

  it("말풍선과 같은 오버레이 배율을 오프셋에 곱하고, 월드 위·말풍선 아래 깊이를 쓴다", () => {
    const { runtime, bursts } = runtimeFor();
    runtime.play("self", "fireworks", 0);
    runtime.place("self", 50, 80, 2, 0, false);
    expect(bursts[0]).toMatchObject({ x: 50 + (plan[0]?.dx ?? 0) * 2, y: 80 + (plan[0]?.dy ?? 0) * 2 });
    expect(bursts[0]?.depth).toBeGreaterThan(1_000);
    expect(bursts[0]?.depth).toBeLessThan(160_400);
  });

  it("프레임이 한참 늦게 와도 밀린 발이 한꺼번에 터질 뿐 빠지지 않는다", () => {
    const { runtime, bursts } = runtimeFor();
    runtime.play("self", "fireworks", 0);
    runtime.place("self", 0, 0, 1, 900, false);
    const due = plan.filter((burst) => burst.delayMs <= 900).length;
    expect(bursts).toHaveLength(due);
  });

  it("연출이 없는 이모트는 아무것도 터뜨리지 않는다", () => {
    const { runtime, bursts } = runtimeFor();
    runtime.play("self", "party", 0);
    for (let time = 0; time < 3_000; time += 100) runtime.place("self", 0, 0, 1, time, false);
    expect(bursts).toEqual([]);
  });

  it("안 보이거나 모션 줄이기면 터뜨리지 않고, 그 사이 지난 발은 다시 보여도 되살아나지 않는다", () => {
    const hidden = runtimeFor();
    hidden.runtime.play("self", "fireworks", 0);
    hidden.runtime.place("self", 0, 0, 1, 0, false, false);
    hidden.runtime.place("self", 0, 0, 1, 800, false, false);
    hidden.runtime.place("self", 0, 0, 1, 801, false, true);
    expect(hidden.bursts.length, "보이지 않던 동안 지난 발").toBe(0);
    hidden.runtime.place("self", 0, 0, 1, 1_000 + (plan.at(-1)?.delayMs ?? 0), false, true);
    expect(hidden.bursts.length, "나중 발은 보이면 터진다").toBeGreaterThan(0);
    expect(hidden.bursts.length).toBeLessThan(plan.length);

    const reduced = runtimeFor();
    reduced.runtime.play("self", "fireworks", 0);
    for (let time = 0; time <= 3_000; time += 100) reduced.runtime.place("self", 0, 0, 1, time, true);
    expect(reduced.bursts).toEqual([]);
  });

  it("같은 이모트를 다시 보내면 처음부터 다시 터진다", () => {
    const { runtime, bursts } = runtimeFor();
    runtime.play("self", "fireworks", 0);
    for (let time = 0; time <= 2_000; time += 50) runtime.place("self", 0, 0, 1, time, false);
    expect(bursts).toHaveLength(plan.length);
    runtime.play("self", "fireworks", 5_000);
    runtime.place("self", 0, 0, 1, 5_000, false);
    expect(bursts).toHaveLength(plan.length + 1);
    // 다른 이모트로 바꾸면 남은 발은 취소된다.
    runtime.play("self", "wave", 5_100);
    for (let time = 5_100; time <= 8_000; time += 100) runtime.place("self", 0, 0, 1, time, false);
    expect(bursts).toHaveLength(plan.length + 1);
  });

  it("배우마다 따로 터지고, 터뜨릴 함수가 없어도 말풍선 재생은 멈추지 않는다", () => {
    const { runtime, bursts } = runtimeFor();
    runtime.play("self", "fireworks", 0);
    runtime.play("peer:a", "fireworks", 0);
    runtime.place("self", 10, 10, 1, 0, false);
    runtime.place("peer:a", 500, 10, 1, 0, false);
    expect(bursts.map((burst) => burst.x)).toEqual([10 + (plan[0]?.dx ?? 0), 500 + (plan[0]?.dx ?? 0)]);

    const silent = runtimeFor({ burst: undefined });
    silent.runtime.play("self", "fireworks", 0);
    expect(() => { for (let time = 0; time <= 2_000; time += 100) silent.runtime.place("self", 0, 0, 1, time, false); }).not.toThrow();
    expect(silent.runtime.activeId("self", 100)).toBe("fireworks");
  });
});

describe("월드 캔버스 연결", () => {
  it("이모트 런타임의 터뜨리기는 이동 게임필의 폭죽 불꽃 이미터(spark)로 이어지고, 효과 수준이 낮은 기기에서는 건너뛴다", () => {
    expect(canvas).toContain(
      'burst: (x, y, depth, count, color) => { if (experienceRef.current.effectLevel !== "low") motionFeel?.spark(x, y, depth, count, color); } });',
    );
    expect(canvas, "먼지 이미터(burst)로 보내면 월드 아래 깊이로 되돌려져 가려진다").not.toContain("motionFeel?.burst(x, y, depth, count, color)");
  });
});
