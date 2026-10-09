import { describe, expect, it } from "vitest";

import { STUDIO_SPACE_EMOTE_IDS, studioSpaceEmoteById } from "./studio-virtual-space-emote-catalog";
import { studioEmoteBurstPlan, studioEmoteBurstsDue, type StudioEmoteBurst } from "./studio-virtual-space-emote-fx";

describe("이모트 시작 연출 계획", () => {
  it("폭죽만 연출이 있고 나머지 이모트는 말풍선과 몸동작만 쓴다", () => {
    for (const id of STUDIO_SPACE_EMOTE_IDS) {
      const plan = studioEmoteBurstPlan(id);
      if (id === "fireworks") expect(plan.length, id).toBeGreaterThan(0);
      else expect(plan, id).toEqual([]);
    }
  });

  it("폭죽은 지연이 빠른 순서로 여러 발이 터지고, 모두 머리 위에서 이모트가 끝나기 전에 끝난다", () => {
    const plan = studioEmoteBurstPlan("fireworks");
    const duration = studioSpaceEmoteById("fireworks")?.durationMs ?? 0;
    expect(plan.length).toBeGreaterThanOrEqual(5);
    expect(plan[0]?.delayMs, "첫 발은 이모트가 시작되자마자 터진다").toBe(0);
    for (let index = 1; index < plan.length; index += 1) {
      expect(plan[index]?.delayMs ?? -1, `정렬 ${index}`).toBeGreaterThan(plan[index - 1]?.delayMs ?? Infinity);
    }
    const last = plan.at(-1)?.delayMs ?? Infinity;
    expect(last, "마지막 발이 이모트 재생이 끝나기 전에 터진다").toBeLessThan(duration - 1_000);
    for (const burst of plan) {
      expect(burst.dy, "머리 위(위쪽이 음수)").toBeLessThan(0);
      expect(burst.count).toBeGreaterThan(0);
      expect(burst.count).toBeLessThanOrEqual(24);
      expect(Number.isInteger(burst.color) && burst.color >= 0 && burst.color <= 0xffffff).toBe(true);
    }
    expect(new Set(plan.map((burst) => burst.color)).size, "여러 색").toBeGreaterThanOrEqual(5);
  });

  it("계획은 변경할 수 없고 같은 객체를 돌려준다", () => {
    const plan = studioEmoteBurstPlan("fireworks");
    expect(Object.isFrozen(plan)).toBe(true);
    expect(plan.every((burst) => Object.isFrozen(burst))).toBe(true);
    expect(studioEmoteBurstPlan("fireworks")).toBe(plan);
  });
});

describe("터질 때가 된 연출 개수", () => {
  const plan: readonly StudioEmoteBurst[] = [
    { delayMs: 0, dx: 0, dy: -10, count: 1, color: 1 },
    { delayMs: 250, dx: 0, dy: -10, count: 1, color: 2 },
    { delayMs: 500, dx: 0, dy: -10, count: 1, color: 3 },
  ];

  it("지연이 지난 항목만 센다", () => {
    expect(studioEmoteBurstsDue(plan, 0, 0)).toBe(1);
    expect(studioEmoteBurstsDue(plan, 0, 249)).toBe(1);
    expect(studioEmoteBurstsDue(plan, 0, 250)).toBe(2);
    expect(studioEmoteBurstsDue(plan, 0, 10_000)).toBe(3);
  });

  it("이미 처리한 개수(next) 뒤부터 센다", () => {
    expect(studioEmoteBurstsDue(plan, 1, 249)).toBe(0);
    expect(studioEmoteBurstsDue(plan, 1, 500)).toBe(2);
    expect(studioEmoteBurstsDue(plan, 3, 10_000)).toBe(0);
  });

  it("시작 전·잘못된 시간·잘못된 next는 0이다", () => {
    expect(studioEmoteBurstsDue(plan, 0, -1)).toBe(0);
    expect(studioEmoteBurstsDue(plan, 0, Number.NaN)).toBe(0);
    expect(studioEmoteBurstsDue(plan, -1, 100)).toBe(0);
    expect(studioEmoteBurstsDue(plan, 0.5, 100)).toBe(0);
    expect(studioEmoteBurstsDue([], 0, 100)).toBe(0);
  });
});
