import { describe, expect, it } from "vitest";

import { SumiError } from "../engine/core/errors";

import { MixboxLane, MIXBOX_LANE_ID } from "./mixbox-lane";

import type { LaneEnvironment, LaneInit } from "./lane";
import type { RawSample } from "../engine/core/types";
import type { BrushProgram } from "../engine/presets/program-schema";

const env: LaneEnvironment = { clock: { now: () => 0 } };
const init: LaneInit = { width: 64, height: 64, dpr: 1, tileSize: 16, seed: 7 };

const rawSample = (overrides: Partial<RawSample> = {}): RawSample =>
  ({
    x: 10,
    y: 10,
    tMs: 0,
    pressure: 1,
    tiltXDeg: 0,
    tiltYDeg: 0,
    twistDeg: 0,
    phase: "down",
    source: "raw",
    ...overrides,
  } as RawSample);

describe("Mixbox math-only(수식만) 레인", () => {
  it("probe는 절대 throw하지 않고 supported + 빈 이유를 돌려준다", async () => {
    const lane = new MixboxLane();
    const report = await lane.probe(env);
    expect(report.status).toBe("supported");
    expect(report.reasons).toEqual([]);
    expect(report.laneId).toBe(MIXBOX_LANE_ID);
    lane.dispose();
  });

  it("계약 순서 probe → init → beginStroke → addSamples → endStroke → readback → dispose", async () => {
    const lane = new MixboxLane();
    expect((await lane.probe(env)).status).toBe("supported");
    await lane.init(env, init);
    lane.beginStroke({} as BrushProgram, 1, { color: [1, 0.5, 0.25, 1] as const });
    const receipt = lane.addSamples([
      rawSample({ x: 10, y: 10, tMs: 0, pressure: 1 }),
      rawSample({ x: 12, y: 10, tMs: 16, pressure: 0.5 }),
    ]);
    expect(receipt.dabCount).toBe(2);
    expect(receipt.submitCount).toBe(1);
    const end = await lane.endStroke();
    expect(end.dabCount).toBe(2);
    expect(end.submitCount).toBe(1);
    expect(end.gpuTimeMs).toBeNull();
    const image = await lane.readback();
    expect(image.width).toBe(64);
    expect(image.height).toBe(64);
    expect(image.data.length).toBe(64 * 64 * 4);
    // (10, 10) 픽셀에 mixboxLerp 색이 혼합됨
    const base = (10 * 64 + 10) * 4;
    expect(image.data[base] + image.data[base + 1] + image.data[base + 2]).toBeGreaterThan(0);
    lane.dispose();
  });

  it("abortStroke: 진행 중인 획만 버리고 문서는 보존한다(documentPreserved: true)", async () => {
    const lane = new MixboxLane();
    await lane.init(env, init);
    const pristine = await lane.readback();
    lane.beginStroke({} as BrushProgram, 1);
    lane.addSamples([rawSample({ x: 20, y: 20, tMs: 0, pressure: 1 })]);
    const receipt = lane.abortStroke();
    expect(receipt.documentPreserved).toBe(true);
    expect(receipt.discardedDabs).toBe(1);
    const after = await lane.readback();
    expect(after.data).toEqual(pristine.data);
    lane.beginStroke({} as BrushProgram, 2);
    lane.dispose();
  });

  it("dispose 후 시작된 획은 버려지고 문서는 합성되지 않는다", async () => {
    const lane = new MixboxLane();
    await lane.init(env, init);
    lane.beginStroke({} as BrushProgram, 1);
    lane.addSamples([rawSample({ x: 30, y: 30, tMs: 0, pressure: 0.5 })]);
    const receipt = lane.abortStroke();
    expect(receipt.documentPreserved).toBe(true);
    lane.dispose();
    await expect(lane.readback()).rejects.toThrow(SumiError);
  });

  it("beginStroke 없이 addSamples/endStroke는 거부한다", async () => {
    const lane = new MixboxLane();
    await lane.init(env, init);
    expect(() => lane.addSamples([rawSample()])).toThrow(SumiError);
    await expect(lane.endStroke()).rejects.toThrow(SumiError);
    lane.dispose();
  });
});
