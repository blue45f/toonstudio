import { describe, expect, it } from "vitest";

import { polylineSamples, rawSample } from "../../testing/stage-samples";

import { applyStrokeStream } from "./chain";
import { createLazyBrushStage, createLazyBrushStageFromPct, LAZY_CATCH_UP_MAX_STEPS } from "./lazy-brush";
import { DEFAULT_SAMPLE_INTERVAL_MS, IntervalTracker } from "./raw-stage";

describe("끈 당김 단계(LazyBrushStage)", () => {
  it("끈 길이 안의 움직임은 붓을 움직이지 않고, 끈이 팽팽해지면 붓이 끌려온다", () => {
    const stage = createLazyBrushStage({ radiusPx: 10 });
    const out = stage.apply([rawSample(0, 0, 0, "down"), rawSample(6, 0, 4, "move"), rawSample(10, 0, 8, "move"), rawSample(30, 0, 12, "move")]);
    expect(out.slice(0, 3).map((s) => s.x)).toEqual([0, 0, 0]);
    expect(out[3]?.x).toBeCloseTo(20, 12);
    expect(30 - (out[3]?.x ?? 0)).toBeCloseTo(10, 12);
  });

  it("반경 0이면 up까지 그대로 통과하고 flush는 비어 있다", () => {
    const stage = createLazyBrushStage({ radiusPx: 0 });
    const out = stage.apply([rawSample(1, 2, 0, "down"), rawSample(5, 7, 4, "move"), rawSample(9, 9, 8, "up")]);
    expect(out.map((s) => [s.x, s.y, s.phase])).toEqual([
      [1, 2, "down"],
      [5, 7, "move"],
      [9, 9, "up"],
    ]);
    expect(stage.flush()).toEqual([]);
  });

  it("압력·기울기·포인터 종류는 보존하고 x·y만 바꾸며 입력은 변경하지 않는다", () => {
    const stage = createLazyBrushStage({ radiusPx: 50 });
    const input = [rawSample(0, 0, 0, "down"), rawSample(20, 0, 16, "move", { pressure: 0.9 })];
    const out = stage.apply(input);
    expect(out[1]).toMatchObject({ pressure: 0.9, tMs: 16, tiltXDeg: 5, tiltYDeg: 6, phase: "move", pointerType: "pen" });
    expect(input[1]?.x).toBe(20);
    expect(out[1]?.x).toBe(0);
  });

  it("예측 표본은 붓 상태를 바꾸지 않고 통과한다", () => {
    const stage = createLazyBrushStage({ radiusPx: 5 });
    const out = stage.apply([rawSample(0, 0, 0, "down"), rawSample(100, 100, 2, "move", { source: "predicted" }), rawSample(2, 0, 4, "move")]);
    expect(out[1]).toMatchObject({ x: 100, y: 100, source: "predicted" });
    expect(out[2]?.x).toBe(0);
  });

  it("획 끝 따라잡기: up을 보류하고 flush가 붓을 포인터 up 위치에 정확히 내려놓는다(없으면 반경만큼 모자란다)", () => {
    const samples = polylineSamples([[10, 10], [200, 10]], 1.5);
    const withCatchUp = createLazyBrushStage({ radiusPx: 24 });
    const out = applyStrokeStream(withCatchUp, samples);
    const last = out[out.length - 1];
    expect(last).toMatchObject({ x: 200, y: 10, phase: "up" });
    expect(out.filter((s) => s.phase === "up")).toHaveLength(1);
    // 따라잡기 표본은 시각이 비감소이고, 붓은 끝점 쪽으로만 간다.
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i]?.tMs).toBeGreaterThanOrEqual(out[i - 1]?.tMs ?? 0);
      expect(out[i]?.x ?? 0).toBeGreaterThanOrEqual((out[i - 1]?.x ?? 0) - 1e-9);
    }

    const noCatchUp = createLazyBrushStage({ radiusPx: 24, catchUp: false });
    const short = applyStrokeStream(noCatchUp, samples);
    const end = short[short.length - 1];
    expect(end?.phase).toBe("up");
    expect(200 - (end?.x ?? 0)).toBeCloseTo(24, 6);
  });

  it("붓이 이미 포인터에 있으면 따라잡기 없이 up 표본 하나만 낸다", () => {
    const stage = createLazyBrushStage({ radiusPx: 10 });
    const out = applyStrokeStream(stage, [rawSample(0, 0, 0, "down"), rawSample(5, 0, 4, "move"), rawSample(5, 0, 8, "up")]);
    // 붓은 시작점(0,0)에 머물고 up은 (5,0): 5 px 따라잡기 필요 → 여러 표본, 마지막이 정확히 (5,0)
    expect(out[out.length - 1]).toMatchObject({ x: 5, y: 0, phase: "up" });
    const still = createLazyBrushStage({ radiusPx: 10 });
    const one = applyStrokeStream(still, [rawSample(3, 3, 0, "down"), rawSample(3, 3, 4, "up")]);
    expect(one).toHaveLength(2);
    expect(one[1]).toMatchObject({ x: 3, y: 3, phase: "up" });
  });

  it("up 뒤와 reset 뒤에는 새 획의 down에서 붓을 다시 놓고, 진행 중인 획을 reset하면 보류한 up도 버린다", () => {
    const stage = createLazyBrushStage({ radiusPx: 10 });
    applyStrokeStream(stage, [rawSample(0, 0, 0, "down"), rawSample(40, 0, 4, "move"), rawSample(40, 0, 8, "up")]);
    const next = stage.apply([rawSample(200, 50, 100, "down"), rawSample(203, 50, 104, "move")]);
    expect(next.map((s) => s.x)).toEqual([200, 200]);
    stage.apply([rawSample(0, 0, 200, "down"), rawSample(80, 0, 204, "move"), rawSample(80, 0, 208, "up")]);
    stage.reset();
    expect(stage.flush()).toEqual([]);
    expect(stage.apply([rawSample(7, 7, 300, "move")])[0]).toMatchObject({ x: 7, y: 7 });
  });

  it("setRadius는 진행 중인 획에도 즉시 적용되고 음수·비유한 값은 0으로 본다", () => {
    const stage = createLazyBrushStage({ radiusPx: 100 });
    stage.apply([rawSample(0, 0, 0, "down")]);
    stage.setRadius(-5);
    expect(stage.apply([rawSample(30, 0, 4, "move")])[0]?.x).toBe(30);
    stage.setRadius(Number.NaN);
    expect(stage.apply([rawSample(60, 0, 8, "move")])[0]?.x).toBe(60);
  });

  it("슬라이더 팩토리: 0은 끈 없음(raw), 100은 48 px 끈", () => {
    const off = createLazyBrushStageFromPct(0);
    expect(off.apply([rawSample(0, 0, 0, "down"), rawSample(9, 0, 4, "move")])[1]?.x).toBe(9);
    const max = createLazyBrushStageFromPct(100);
    const out = max.apply([rawSample(0, 0, 0, "down"), rawSample(100, 0, 4, "move")]);
    expect(100 - (out[1]?.x ?? 0)).toBeCloseTo(48, 9);
  });

  it("결정적이다: 같은 입력이면 비트 단위로 같은 출력", () => {
    const samples = polylineSamples([[10, 10], [100, 80], [180, 20]], 1.2);
    const a = applyStrokeStream(createLazyBrushStage({ radiusPx: 12 }), samples);
    const b = applyStrokeStream(createLazyBrushStage({ radiusPx: 12 }), samples);
    expect(a).toEqual(b);
  });

  it("R-A-3 표본 간격이 극히 짧아도 획 끝 따라잡기 표본 수에 상한이 있다(24만 표본 회귀)", () => {
    // 간격 0.00025 ms 표본만 있는 획: 상한이 없으면 round(60 / 0.00025) = 240000개를 만든다.
    const stage = createLazyBrushStage({ radiusPx: 10 });
    const samples = [rawSample(0, 0, 0, "down")];
    for (let i = 1; i <= 12; i += 1) samples.push(rawSample(i * 5, 0, i * 0.00025, "move"));
    samples.push(rawSample(60, 40, 13 * 0.00025, "up"));
    const out = applyStrokeStream(stage, samples);
    expect(out.length).toBeLessThanOrEqual(samples.length + LAZY_CATCH_UP_MAX_STEPS);
    expect(out[out.length - 1]).toMatchObject({ x: 60, y: 40, phase: "up" });
    expect(out.filter((s) => s.phase === "up")).toHaveLength(1);
    // 간격이 정상이어도 따라잡기 시간(catchUpMs)을 극단값으로 주면 상한에서 멈추고 총 길이는 그 시간을 유지한다.
    const slow = createLazyBrushStage({ radiusPx: 10, catchUpMs: 1e9 });
    const tail = applyStrokeStream(slow, [rawSample(0, 0, 0, "down"), rawSample(80, 0, 4, "move"), rawSample(80, 0, 8, "up")]);
    expect(tail.length).toBeLessThanOrEqual(2 + LAZY_CATCH_UP_MAX_STEPS);
    expect(tail[tail.length - 1]).toMatchObject({ x: 80, y: 0, phase: "up" });
    // catchUpMs가 비유한이어도 up으로 끝난다(NaN 단계 수로 up이 사라지지 않는다).
    const nan = createLazyBrushStage({ radiusPx: 10, catchUpMs: Number.NaN });
    const nanOut = applyStrokeStream(nan, [rawSample(0, 0, 0, "down"), rawSample(80, 0, 4, "move"), rawSample(80, 0, 8, "up")]);
    expect(nanOut[nanOut.length - 1]).toMatchObject({ x: 80, y: 0, phase: "up" });
  });

  it("R-A-3 간격 추적기는 0.5 ms 미만 간격을 무시한다(중앙값이 시각 잡음에 끌려가지 않는다)", () => {
    const tracker = new IntervalTracker();
    tracker.push(0);
    tracker.push(0.00025);
    tracker.push(0.4);
    expect(tracker.medianMs()).toBe(DEFAULT_SAMPLE_INTERVAL_MS);
    tracker.push(0.9);
    expect(tracker.medianMs()).toBeCloseTo(0.5, 9);
  });
});
