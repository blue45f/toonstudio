import { describe, expect, it } from "vitest";

import { pixelHash } from "../../bench/metrics/render-metrics";
import { alphaSum, fakeEnv } from "../../bench/testing/synthetic-images";
import { LaneUnavailableError } from "../../engine/core/errors";
import { lineStroke } from "../../engine/testing/synthetic-strokes";
import { laneById } from "../registry";

import { BRUSH, CONTRACT_INIT, describeBristleLaneContract, STROKE_A } from "./bristle-lane-contract";
import { BRISTLE_PBD_LANE_ID, BristlePbdLane, createBristlePbdLane } from "./bristle-pbd-lane";

import type { BristleStrokeReceipt } from "./bristle-dab-synthesis";
import type { BrushEngineLane } from "../lane";

/** 다발이 모여 털끼리 접촉하는 낮은 필압 획(압력 0.3). */
const LOW_PRESSURE_STROKE = lineStroke(24, 64, 104, 70, 0.3, { durationMs: 300 });

describe("bristle-pbd 레인: 메타·등록", () => {
  it("probe는 항상 supported이고 실험(experimental) 후보 레인으로 등록돼 있다", async () => {
    const lane = createBristlePbdLane();
    expect(await lane.probe({ clock: { now: () => 0 } })).toMatchObject({ laneId: "bristle-pbd", status: "supported", reasons: [] });
    expect(lane.id).toBe(BRISTLE_PBD_LANE_ID);
    expect(lane.kind).toBe("candidate");
    expect(lane.status).toBe("implemented");
    const desc = laneById("bristle-pbd");
    expect(desc.maturity).toBe("experimental");
    expect(desc.create().id).toBe("bristle-pbd");
    expect(new BristlePbdLane().maturity).toBe("experimental");
  });

  it("털 수가 범위를 벗어나면 LaneUnavailableError(limit-exceeded)로 드러낸다", async () => {
    for (const bristles of [0, 300, 2.5]) {
      const lane = createBristlePbdLane({ bristles });
      await expect(lane.init(fakeEnv(), CONTRACT_INIT)).rejects.toBeInstanceOf(LaneUnavailableError);
      await expect(createBristlePbdLane({ bristles }).init(fakeEnv(), CONTRACT_INIT)).rejects.toMatchObject({ code: "limit-exceeded" });
    }
  });
});

describeBristleLaneContract("bristle-pbd", () => createBristlePbdLane(), "pbd", (options) => createBristlePbdLane(options));

describe("bristle-pbd 레인: 털 수·곡선·결정성(교차 프로세스 기준 해시)", () => {
  async function drawWith(options: Parameters<typeof createBristlePbdLane>[0]): Promise<{ lane: BrushEngineLane; receipt: BristleStrokeReceipt }> {
    const lane = createBristlePbdLane(options);
    await lane.init(fakeEnv(), CONTRACT_INIT);
    lane.beginStroke(BRUSH, 4, { color: [0.1, 0.1, 0.4, 1] });
    for (const s of STROKE_A) lane.addSamples([s]);
    return { lane, receipt: (await lane.endStroke()) as BristleStrokeReceipt };
  }

  it.each([8, 32, 128])("털 %i올: 그려지고 털 수가 영수증에 정직하게 남는다", async (bristles) => {
    const { lane, receipt } = await drawWith({ bristles });
    expect(receipt.bristleCount).toBe(bristles);
    expect(alphaSum(await lane.readback())).toBeGreaterThan(1000);
    lane.dispose();
  });

  it("털 수가 달라도 잉크 농도(평균 알파)는 크게 달라지지 않는다(dab 흐름이 √N으로 정규화)", async () => {
    const mean = async (bristles: number): Promise<number> => {
      const { lane } = await drawWith({ bristles });
      const img = await lane.readback();
      let sum = 0;
      let n = 0;
      for (let i = 3; i < img.data.length; i += 4) {
        const a = img.data[i] ?? 0;
        if (a > 12) {
          sum += a;
          n += 1;
        }
      }
      lane.dispose();
      return sum / n;
    };
    const m8 = await mean(8);
    const m128 = await mean(128);
    expect(Math.abs(m8 - m128) / Math.max(m8, m128)).toBeLessThan(0.3);
  });

  it("압력 곡선을 buckling-3d로 바꾸면 같은 입력에서 다른 그림이 나온다(곡선 선택이 실제로 적용된다)", async () => {
    const a = await drawWith({ bristles: 16 });
    const b = await drawWith({ bristles: 16, spreadCurve: "buckling-3d" });
    expect(pixelHash(await a.lane.readback())).not.toBe(pixelHash(await b.lane.readback()));
    a.lane.dispose();
    b.lane.dispose();
  });

  it("압력 곡선을 linear로 바꾸면 기본(power-fit)과 다른 그림이 나온다(옵션이 조용히 무시되지 않는다)", async () => {
    const a = await drawWith({ bristles: 16 });
    const b = await drawWith({ bristles: 16, spreadCurve: "linear" });
    expect(pixelHash(await a.lane.readback())).not.toBe(pixelHash(await b.lane.readback()));
    expect((b.receipt as BristleStrokeReceipt).mappedKo.some((t) => t.includes("linear"))).toBe(true);
    a.lane.dispose();
    b.lane.dispose();
  });

  it("방향 출처를 tilt로 바꾸면(기울기가 있는 표본) 다른 그림이 나온다", async () => {
    const run = async (headingSource: "velocity" | "tilt"): Promise<string> => {
      const lane = createBristlePbdLane({ bristles: 16, headingSource });
      await lane.init(fakeEnv(), CONTRACT_INIT);
      lane.beginStroke(BRUSH, 4);
      lane.addSamples(STROKE_A.map((s) => ({ ...s, tiltXDeg: 0, tiltYDeg: 40 })));
      await lane.endStroke();
      const hash = pixelHash(await lane.readback());
      lane.dispose();
      return hash;
    };
    expect(await run("velocity")).not.toBe(await run("tilt"));
  });

  it("별 인스턴스 두 개가 같은 해시를 낸다(전역 상태 없음)", async () => {
    const a = await drawWith({ bristles: 32 });
    const b = await drawWith({ bristles: 32 });
    expect(pixelHash(await a.lane.readback())).toBe(pixelHash(await b.lane.readback()));
    a.lane.dispose();
    b.lane.dispose();
  });

  it("PBD 월드 옵션(접촉 보정 비율)이 레인에 전달된다: 보정 1은 기본(0.12)과 다른 그림", async () => {
    // 털 몸체 반경은 낮은 필압(0.15)의 다발에 겹치지 않고 들어가는 크기라(BL-4a), 털끼리 접촉하는 것은 다발이 모이는 낮은 필압 구간이다.
    // 압력 0.7처럼 다발이 넓게 벌어진 획에서는 접촉이 일어나지 않아 보정 비율이 그림을 바꾸지 않는다.
    const draw = async (options: Parameters<typeof createBristlePbdLane>[0]): Promise<string> => {
      const lane = createBristlePbdLane(options);
      await lane.init(fakeEnv(), CONTRACT_INIT);
      lane.beginStroke(BRUSH, 4, { color: [0.1, 0.1, 0.4, 1] });
      for (const s of LOW_PRESSURE_STROKE) lane.addSamples([s]);
      await lane.endStroke();
      const hash = pixelHash(await lane.readback());
      lane.dispose();
      return hash;
    };
    expect(await draw({ bristles: 32 })).not.toBe(await draw({ bristles: 32, world: { contactRelaxation: 1 } }));
  });
});
