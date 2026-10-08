import { describe, expect, it } from "vitest";

import { StrokeBudgetExceededError } from "../core/errors";
import { presetById } from "../presets/catalog";

import { MAX_FRAME_DAB_CAPACITY, StrokePipeline } from "./stroke-pipeline";

import type { RawSample } from "../core/types";

/** 프레임마다 표본 1개를 stepPx씩 옮기는 빠른 획(BL-1이 Node에서 재현한 조건). */
function fastStroke(frames: number, stepPx: number, stepMs: number): RawSample[][] {
  const out: RawSample[][] = [];
  for (let i = 0; i < frames; i += 1) {
    out.push([
      {
        x: 40 + i * stepPx,
        y: 100,
        tMs: i * stepMs,
        pressure: 0.6,
        tiltXDeg: 0,
        tiltYDeg: 0,
        twistDeg: 0,
        pointerType: "pen",
        phase: i === 0 ? "down" : i === frames - 1 ? "up" : "move",
        source: "raw",
      },
    ]);
  }
  return out;
}

function run(presetId: string, frames: RawSample[][]): number {
  const pipeline = new StrokePipeline(presetById(presetId), 1);
  let dabs = 0;
  for (const frame of frames) dabs += pipeline.push(frame).count;
  dabs += pipeline.finish().count;
  return dabs;
}

describe("StrokePipeline 배치 용량 추정", () => {
  // BL-1 재현 표: 프레임당 표본 1개씩 건너뛰는 빠른 획이 stroke-budget-exceeded로 버려졌다.
  const CASES: ReadonlyArray<readonly [string, number, number]> = [
    ["pencil-hb", 16, 8],
    ["ink-g-pen", 16, 16],
    ["charcoal", 30, 16],
    ["airbrush", 60, 16],
  ];

  it.each(CASES)("%s: 프레임 간 %i px 도약(%i ms)도 stroke-budget-exceeded 없이 끝난다", (presetId, stepPx, stepMs) => {
    const dabs = run(presetId, fastStroke(24, stepPx, stepMs));
    expect(dabs).toBeGreaterThan(0);
  });

  it("프레임 경계 구간이 경로 길이에 잡혀 dab가 용량에 갇히지 않는다(느린 획과 같은 선이면 dab 수가 같다)", () => {
    const fast = run("pencil-hb", fastStroke(8, 16, 8));
    // 같은 궤적을 한 번에 넣어도(배치 경계만 다르다) 방출되는 dab 총수는 같아야 한다.
    const pipeline = new StrokePipeline(presetById("pencil-hb"), 1);
    const whole = fastStroke(8, 16, 8).flat();
    const bulk = pipeline.push(whole).count + pipeline.finish().count;
    expect(fast).toBe(bulk);
  });

  it("터무니없는 도약은 dab를 만들기 전에 한글 사유와 함께 stroke-budget-exceeded로 거부한다", () => {
    const frames = fastStroke(3, 5_000_000, 16);
    let caught: unknown = null;
    try {
      run("airbrush", frames);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(StrokeBudgetExceededError);
    const err = caught as StrokeBudgetExceededError;
    expect(err.code).toBe("stroke-budget-exceeded");
    expect(err.capacity).toBe(MAX_FRAME_DAB_CAPACITY);
    expect(String(err.details?.reasonKo)).toMatch(/비정상 입력/);
  });
});
