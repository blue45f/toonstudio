import { describe, expect, it } from "vitest";

import { createLazyBrush } from "./lazy-brush";

import type { RawSample } from "../engine/core/types";

function sample(x: number, y: number, phase: RawSample["phase"], over: Partial<RawSample> = {}): RawSample {
  return {
    x,
    y,
    tMs: 0,
    pressure: 0.6,
    tiltXDeg: 5,
    tiltYDeg: 6,
    twistDeg: 0,
    pointerType: "pen",
    phase,
    source: "raw",
    ...over,
  };
}

describe("createLazyBrush", () => {
  it("끈 길이 안의 움직임은 붓을 움직이지 않고, 끈이 팽팽해지면 붓이 끌려온다", () => {
    const lazy = createLazyBrush(10);
    const out = lazy.apply([sample(0, 0, "down"), sample(6, 0, "move"), sample(10, 0, "move"), sample(30, 0, "move")]);
    expect(out.slice(0, 3).map((s) => s.x)).toEqual([0, 0, 0]);
    expect(out[3]?.x).toBeCloseTo(20, 12);
    // 끈이 팽팽한 뒤 붓과 포인터의 거리는 정확히 끈 길이다.
    expect(30 - (out[3]?.x ?? 0)).toBeCloseTo(10, 12);
  });

  it("반경 0이면 포인터를 그대로 따라간다", () => {
    const lazy = createLazyBrush(0);
    const out = lazy.apply([sample(1, 2, "down"), sample(5, 7, "move"), sample(9, 9, "up")]);
    expect(out.map((s) => [s.x, s.y])).toEqual([[1, 2], [5, 7], [9, 9]]);
  });

  it("압력·기울기·시각·단계는 보존하고 x·y만 바꾸며 입력은 변경하지 않는다", () => {
    const lazy = createLazyBrush(50);
    const input = [sample(0, 0, "down"), sample(20, 0, "move", { tMs: 16, pressure: 0.9 })];
    const out = lazy.apply(input);
    expect(out[1]).toMatchObject({ pressure: 0.9, tMs: 16, tiltXDeg: 5, tiltYDeg: 6, phase: "move", pointerType: "pen" });
    expect(input[1]?.x).toBe(20);
    expect(out[1]?.x).toBe(0);
  });

  it("예측 표본은 붓 상태를 바꾸지 않고 통과한다", () => {
    const lazy = createLazyBrush(5);
    const predicted = sample(100, 100, "move", { source: "predicted" });
    const out = lazy.apply([sample(0, 0, "down"), predicted, sample(2, 0, "move")]);
    expect(out[1]).toBe(predicted);
    expect(out[2]?.x).toBe(0);
  });

  it("up 뒤와 reset 뒤에는 새 획의 down에서 붓을 다시 놓는다", () => {
    const lazy = createLazyBrush(10);
    lazy.apply([sample(0, 0, "down"), sample(40, 0, "move"), sample(40, 0, "up")]);
    const next = lazy.apply([sample(200, 50, "down"), sample(203, 50, "move")]);
    expect(next.map((s) => s.x)).toEqual([200, 200]);
    lazy.reset();
    expect(lazy.apply([sample(7, 7, "move")])[0]).toMatchObject({ x: 7, y: 7 });
  });

  it("setRadius는 진행 중인 획에도 즉시 적용되고 음수는 0으로 본다", () => {
    const lazy = createLazyBrush(100);
    lazy.apply([sample(0, 0, "down")]);
    lazy.setRadius(-5);
    expect(lazy.apply([sample(30, 0, "move")])[0]?.x).toBe(30);
  });
});
