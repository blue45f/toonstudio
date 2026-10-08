import { describe, expect, it } from "vitest";

import { createSpeedPressureSimulator, DEFAULT_SPEED_PRESSURE, speedToPressure } from "./pressure-sim";

import type { RawSample } from "../engine/core/types";

function sample(over: Partial<RawSample> & Pick<RawSample, "x" | "y" | "tMs" | "phase">): RawSample {
  return {
    pressure: 0.5,
    tiltXDeg: 0,
    tiltYDeg: 0,
    twistDeg: 0,
    pointerType: "mouse",
    source: "raw",
    ...over,
  };
}

/** 일정 속도(px/ms)로 가로로 긋는 마우스 획: down + move n개 + up. */
function stroke(speedPxPerMs: number, moves = 24, dt = 8): RawSample[] {
  const out: RawSample[] = [sample({ x: 0, y: 0, tMs: 0, phase: "down" })];
  for (let i = 1; i <= moves; i += 1) {
    out.push(sample({ x: i * speedPxPerMs * dt, y: 0, tMs: i * dt, phase: "move" }));
  }
  out.push(sample({ x: (moves + 1) * speedPxPerMs * dt, y: 0, tMs: (moves + 1) * dt, phase: "up" }));
  return out;
}

describe("speedToPressure", () => {
  it("느릴수록 압력이 높고 빠를수록 낮으며 양 끝에서 포화한다", () => {
    const o = DEFAULT_SPEED_PRESSURE;
    expect(speedToPressure(0)).toBe(o.maxPressure);
    expect(speedToPressure(o.slowSpeed)).toBe(o.maxPressure);
    expect(speedToPressure(o.fastSpeed)).toBeCloseTo(o.minPressure, 12);
    expect(speedToPressure(100)).toBeCloseTo(o.minPressure, 12);
    const a = speedToPressure(0.5);
    const b = speedToPressure(1.0);
    const c = speedToPressure(2.0);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });
});

describe("createSpeedPressureSimulator", () => {
  it("천천히 그은 획은 빨리 그은 획보다 압력이 높다(정상 상태)", () => {
    const slow = createSpeedPressureSimulator().apply(stroke(0.05));
    const fast = createSpeedPressureSimulator().apply(stroke(3));
    const slowMid = slow[slow.length - 3]?.pressure ?? 0;
    const fastMid = fast[fast.length - 3]?.pressure ?? 1;
    expect(slowMid).toBeGreaterThan(0.8);
    expect(fastMid).toBeLessThan(0.2);
    expect(slowMid).toBeGreaterThan(fastMid);
  });

  it("down은 중간 압력에서 시작하고 up은 마지막 시뮬레이션 압력을 쓴다", () => {
    const out = createSpeedPressureSimulator().apply(stroke(0.05));
    expect(out[0]?.phase).toBe("down");
    expect(out[0]?.pressure).toBeCloseTo(0.55, 12);
    const last = out[out.length - 1];
    const prev = out[out.length - 2];
    expect(last?.phase).toBe("up");
    expect(last?.pressure).toBe(prev?.pressure);
  });

  it("펜·터치·예측 표본은 그대로 통과하고 입력 배열과 표본을 바꾸지 않는다", () => {
    const sim = createSpeedPressureSimulator();
    const pen = sample({ x: 1, y: 1, tMs: 1, phase: "move", pointerType: "pen", pressure: 0.77 });
    const touch = sample({ x: 2, y: 2, tMs: 2, phase: "move", pointerType: "touch", pressure: 0.33 });
    const predicted = sample({ x: 3, y: 3, tMs: 3, phase: "move", source: "predicted", pressure: 0.5 });
    const input = [pen, touch, predicted];
    const out = sim.apply(input);
    expect(out[0]).toBe(pen);
    expect(out[1]).toBe(touch);
    expect(out[2]).toBe(predicted);
    const mouse = sample({ x: 0, y: 0, tMs: 0, phase: "down" });
    const mouseOut = sim.apply([mouse]);
    expect(mouseOut[0]).not.toBe(mouse);
    expect(mouse.pressure).toBe(0.5);
  });

  it("같은 입력은 같은 출력을 내고(결정성) 새 획의 down이 상태를 초기화한다", () => {
    const a = createSpeedPressureSimulator().apply(stroke(1));
    const b = createSpeedPressureSimulator().apply(stroke(1));
    expect(a.map((s) => s.pressure)).toEqual(b.map((s) => s.pressure));
    const sim = createSpeedPressureSimulator();
    const first = sim.apply(stroke(3));
    const second = sim.apply(stroke(3));
    expect(second.map((s) => s.pressure)).toEqual(first.map((s) => s.pressure));
  });

  it("압력은 항상 [최소, 최대] 범위 안이다", () => {
    const out = createSpeedPressureSimulator().apply([...stroke(0.01), ...stroke(50)]);
    for (const s of out) {
      expect(s.pressure).toBeGreaterThanOrEqual(0.12 - 1e-9);
      expect(s.pressure).toBeLessThanOrEqual(0.9 + 1e-9);
    }
  });
});
