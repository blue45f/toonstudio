import { describe, expect, it } from "vitest";

import { pixelHash } from "../../bench/metrics/render-metrics";
import { alphaSum, fakeEnv } from "../../bench/testing/synthetic-images";
import { InvalidStateError, LaneUnavailableError } from "../../engine/core/errors";
import { presetById } from "../../engine/presets/catalog";
import { splitFrames } from "../../engine/raster/reference-renderer";
import { lineStroke, polylineStroke } from "../../engine/testing/synthetic-strokes";
import { laneById } from "../registry";
import { drawLine, expectStrokeColorContract, meanInkColor } from "../testing/stroke-color-contract";

import {
  createMpmPaintLane,
  mapProgramToMpm,
  MPM_LANE_SETTLE_MAX_STEPS,
  MPM_LANE_SETTLE_WORK_BUDGET,
  MPM_LANE_WORK_BUDGET_PER_CALL,
  MPM_PAINT_LANE_ID,
  MpmPaintLane,
  unsupportedMpmReason,
} from "./mpm-paint-lane";

import type { MpmPaintLaneOptions, MpmStrokeReceipt } from "./mpm-paint-lane";
import type { LabImage, RawSample } from "../../engine/core/types";
import type { BrushEngineLane } from "../lane";

const SIZE = 96;
const INIT = { width: SIZE, height: SIZE, dpr: 1, tileSize: 16, seed: 1 } as const;
const GOUACHE = presetById("gouache");
const PEN = presetById("ink-g-pen");

// 가장자리에서 15px 이상 떨어뜨려(폭 ≤ 16px의 반원 마개가 캔버스 밖으로 나가지 않게) 사유가 없는 깨끗한 획을 만든다.
const STROKE_A = lineStroke(16, 30, SIZE - 16, 36, 0.8, { durationMs: 250 });
const STROKE_B = lineStroke(16, 62, SIZE - 16, 52, 0.9, { durationMs: 250 });

async function makeLane(options?: MpmPaintLaneOptions): Promise<MpmPaintLane> {
  const lane = new MpmPaintLane(options);
  await lane.init(fakeEnv(), INIT);
  return lane;
}

function feed(lane: BrushEngineLane, samples: readonly RawSample[], stopAfterFrames?: number): number {
  let injected = 0;
  let frames = 0;
  for (const frame of splitFrames(samples)) {
    if (stopAfterFrames !== undefined && frames >= stopAfterFrames) break;
    injected += lane.addSamples(frame).dabCount;
    frames += 1;
  }
  return injected;
}

async function draw(lane: BrushEngineLane, samples: readonly RawSample[], seed: number, color?: readonly [number, number, number, number], preset = GOUACHE): Promise<MpmStrokeReceipt> {
  if (color) lane.beginStroke(preset, seed, { color });
  else lane.beginStroke(preset, seed);
  feed(lane, samples);
  return (await lane.endStroke()) as MpmStrokeReceipt;
}

describe("mpm-paint 레인: 메타·등록", () => {
  it("probe는 항상 supported이고 실험(experimental) 후보 레인으로 등록돼 있다", async () => {
    const lane = createMpmPaintLane();
    expect(await lane.probe({ clock: { now: () => 0 } })).toMatchObject({ laneId: "mpm-paint", status: "supported", reasons: [] });
    expect(lane.id).toBe(MPM_PAINT_LANE_ID);
    expect(lane.kind).toBe("candidate");
    expect(lane.status).toBe("implemented");
    const desc = laneById("mpm-paint");
    expect(desc.maturity).toBe("experimental");
    expect(desc.create().id).toBe("mpm-paint");
  });

  it("너무 작은 캔버스는 LaneUnavailableError(limit-exceeded)로 드러낸다", async () => {
    const lane = new MpmPaintLane();
    await expect(lane.init(fakeEnv(), { ...INIT, width: 6, height: 6 })).rejects.toMatchObject({ code: "limit-exceeded" });
    await expect(lane.init(fakeEnv(), { ...INIT, width: 6, height: 6 })).rejects.toBeInstanceOf(LaneUnavailableError);
  });
});

describe("mpm-paint 레인: 획 흐름", () => {
  it("한 획을 그리면 잉크가 생기고 입자는 비워지며 영수증이 정직하다", async () => {
    const lane = await makeLane();
    const receipt = await draw(lane, STROKE_A, 1, [0.2, 0.3, 0.8, 1]);
    const image = await lane.readback();
    expect(alphaSum(image)).toBeGreaterThan(200);
    expect(lane.wetParticleCount()).toBe(0);
    expect(receipt.particlesInjected).toBeGreaterThan(100);
    expect(receipt.dabCount).toBe(receipt.particlesInjected);
    expect(receipt.particlesPeak).toBeGreaterThanOrEqual(receipt.particlesInjected - 1);
    expect(receipt.overflowDabs).toBe(0);
    expect(receipt.clampEvents).toBe(0);
    expect(receipt.settled).toBe(true);
    // 작은 획은 예산·컬링에 걸리지 않는다(영수증 필드는 0이고 기본 예산이 그대로 실린다).
    expect(receipt).toMatchObject({ budgetDroppedSubsteps: 0, budgetLimitedCalls: 0, rowsCulled: 0, workBudgetPerCall: MPM_LANE_WORK_BUDGET_PER_CALL });
    expect(receipt.settleStepCap).toBeLessThanOrEqual(MPM_LANE_SETTLE_MAX_STEPS);
    expect(receipt.poolTilesUsed).toBeGreaterThan(0);
    expect(receipt.timingSource).toBe("unavailable");
    expect(receipt.gpuTimeMs).toBeNull();
    expect(receipt.notesKo).toEqual([]);
    expect(receipt.mappedKo.length).toBeGreaterThan(0);
    expect(receipt.unmappedKo.some((t) => t.includes("종이 그레인"))).toBe(true);
    expect(lane.stats()).toMatchObject({ strokes: 1, dabs: receipt.particlesInjected });
    expect(lane.stats().lastReceipt).toBe(receipt);
  });

  it("같은 입력을 두 번 그리면 픽셀·선형 버퍼가 같고 시드가 다르면 다르다", async () => {
    const run = async (seed: number): Promise<{ image: LabImage; linear: Float32Array | null }> => {
      const lane = await makeLane();
      await draw(lane, STROKE_A, seed, [0.1, 0.4, 0.2, 1]);
      return { image: await lane.readback(), linear: await lane.readbackLinear() };
    };
    const a = await run(5);
    const b = await run(5);
    const c = await run(6);
    expect(pixelHash(a.image)).toBe(pixelHash(b.image));
    expect(a.linear).toEqual(b.linear);
    expect(pixelHash(c.image)).not.toBe(pixelHash(a.image));
  });

  it("addSamples를 프레임별로 나눠도 한꺼번에 넣어도 결과가 같다(호출당 작업 예산이 걸리지 않는 한)", async () => {
    // 호출당 작업 예산은 호출 단위라, 예산이 걸리면 호출을 어떻게 나누느냐가 결과에 들어간다(걸린 사실은 영수증에 드러난다 — 아래 'MP-2' 절).
    // 이 계약은 예산이 걸리지 않는 조건에서의 동치이므로 일괄 호출(예산 초과)은 무제한 예산으로 비교한다.
    const framed = await makeLane({ workBudgetPerCall: Number.POSITIVE_INFINITY });
    const framedReceipt = await draw(framed, STROKE_A, 2);
    const whole = await makeLane({ workBudgetPerCall: Number.POSITIVE_INFINITY });
    whole.beginStroke(GOUACHE, 2);
    whole.addSamples(STROKE_A);
    await whole.endStroke();
    expect(pixelHash(await whole.readback())).toBe(pixelHash(await framed.readback()));
    // 기본 예산에서도 프레임 단위 호출은 예산에 걸리지 않으므로 무제한과 같은 결과다(이 크기의 획은 입자-스텝이 예산보다 훨씬 작다).
    const defaults = await makeLane();
    const defaultsReceipt = await draw(defaults, STROKE_A, 2);
    expect(defaultsReceipt.budgetDroppedSubsteps).toBe(0);
    expect(framedReceipt.budgetDroppedSubsteps).toBe(0);
    expect(pixelHash(await defaults.readback())).toBe(pixelHash(await framed.readback()));
  });

  it("두 획이 겹치면 겹친 곳은 KM 혼색(노랑 + 파랑 = 초록)이고 겹치지 않은 곳은 제 색이다", async () => {
    const lane = await makeLane();
    const yellow = [0.95, 0.85, 0.08, 1] as const;
    // 파랑은 반투명(알파 0.6)이라 굽는 순간 노랑과 섞인다(불투명이면 덮어 버린다).
    const blue = [0.08, 0.2, 0.85, 0.6] as const;
    await draw(lane, lineStroke(10, 48, 86, 48, 0.9, { durationMs: 250 }), 1, yellow);
    // 같은 자리에서 시작해 중간에서 위로 갈라지는 파랑 획이 노랑 위를 가로지른다.
    await draw(lane, polylineStroke([[48, 14], [48, 82]], () => 0.9, { durationMs: 250 }), 2, blue);
    const img = await lane.readback();
    const at = (x: number, y: number): [number, number, number, number] => {
      const o = (y * SIZE + x) * 4;
      return [img.data[o], img.data[o + 1], img.data[o + 2], img.data[o + 3]];
    };
    const overlap = at(48, 48);
    const onlyYellow = at(20, 48);
    const onlyBlue = at(48, 20);
    expect(overlap[3]).toBeGreaterThanOrEqual(250);
    // 겹침: 초록 우세(채널 순서 R<G, B<G).
    expect(overlap[1]).toBeGreaterThan(overlap[0] + 8);
    expect(overlap[1]).toBeGreaterThan(overlap[2] + 8);
    // 홀로 칠한 곳은 제 색 쪽이다.
    expect(onlyYellow[0]).toBeGreaterThan(onlyYellow[2] + 60);
    expect(onlyBlue[2]).toBeGreaterThan(onlyBlue[0] + 60);
  });

  it("획 색 계약: 색을 주면 그 색이 칠해지고 색이 없으면 검정이다", async () => {
    const make = (): BrushEngineLane => new MpmPaintLane();
    await expectStrokeColorContract({ make, presetId: "gouache" });
    await expectStrokeColorContract({ make, presetId: "ink-g-pen", color: [0.1, 0.25, 0.9, 1] });
    // 알파: 색 알파가 낮으면 칠해진 곳의 알파도 낮다.
    const full = await drawLine({ make, presetId: "gouache", options: { color: [0.8, 0.1, 0.1, 1] } });
    const half = await drawLine({ make, presetId: "gouache", options: { color: [0.8, 0.1, 0.1, 0.5] } });
    const maxAlpha = (img: LabImage): number => Math.max(...Array.from({ length: img.width * img.height }, (_, i) => img.data[i * 4 + 3]));
    expect(maxAlpha(half)).toBeLessThan(maxAlpha(full) * 0.7);
    expect(meanInkColor(half)?.r ?? 0).toBeGreaterThan(0.6);
  });

  it("잘못된 색은 획을 열기 전에 거부하고 레인은 idle로 남는다", async () => {
    const lane = await makeLane();
    expect(() => lane.beginStroke(GOUACHE, 1, { color: [2, 0, 0, 1] })).toThrow(InvalidStateError);
    expect(() => lane.beginStroke(GOUACHE, 1, { color: [0, 0, 0, Number.NaN] })).toThrow(InvalidStateError);
    await draw(lane, STROKE_A, 1);
    expect(lane.stats().strokes).toBe(1);
  });

  it("호출 순서 오류는 InvalidStateError다", async () => {
    const lane = await makeLane();
    expect(() => lane.addSamples(STROKE_A)).toThrow(InvalidStateError);
    await expect(lane.endStroke()).rejects.toBeInstanceOf(InvalidStateError);
    lane.beginStroke(GOUACHE, 1);
    expect(() => lane.beginStroke(GOUACHE, 2)).toThrow(/endStroke되지 않았다/);
    lane.abortStroke();
    const fresh = new MpmPaintLane();
    expect(() => fresh.beginStroke(GOUACHE, 1)).toThrow(/init 전/);
    await expect(fresh.readback()).rejects.toBeInstanceOf(InvalidStateError);
  });

  it("유한하지 않은 표본이 섞인 배치는 통째로 거부하고 아무 입자도 만들지 않는다", async () => {
    const lane = await makeLane();
    lane.beginStroke(GOUACHE, 1);
    const bad: RawSample[] = [...STROKE_A.slice(0, 10), { ...STROKE_A[10], x: Number.NaN }];
    expect(() => lane.addSamples(bad)).toThrow(InvalidStateError);
    expect(lane.wetParticleCount()).toBe(0);
    expect(() => lane.addSamples([{ ...STROKE_A[0], tMs: Number.POSITIVE_INFINITY }])).toThrow(InvalidStateError);
    // 거부 뒤에도 같은 획을 이어 갈 수 있다.
    feed(lane, STROKE_A);
    await lane.endStroke();
    expect(alphaSum(await lane.readback())).toBeGreaterThan(100);
  });

  it("예측 표본(표시 전용)은 물리에 넣지 않는다", async () => {
    const lane = await makeLane();
    lane.beginStroke(GOUACHE, 1);
    const predicted = STROKE_A.map((s) => ({ ...s, source: "predicted" as const }));
    expect(lane.addSamples(predicted).dabCount).toBe(0);
    expect(lane.wetParticleCount()).toBe(0);
    lane.abortStroke();
  });

  it("압력이 범위를 벗어나도 0..1로 제한하고 캔버스 밖 입자는 만들지 않고 알린다", async () => {
    const lane = await makeLane();
    lane.beginStroke(GOUACHE, 1);
    const out = lineStroke(-30, 40, 40, 40, 5, { durationMs: 150 });
    feed(lane, out);
    const receipt = (await lane.endStroke()) as MpmStrokeReceipt;
    expect(receipt.culledOutside).toBeGreaterThan(0);
    expect(receipt.notesKo.some((n) => n.includes("캔버스 밖"))).toBe(true);
    expect(receipt.clampEvents).toBe(0);
    expect(alphaSum(await lane.readback())).toBeGreaterThan(50);
  });
});

describe("mpm-paint 레인: 젖은 입자가 화면에 보인다(readback = 표면 + 스플랫)", () => {
  it("획 도중 readback에 젖은 물감이 보이고 endStroke 뒤에도 비슷한 모양이 남는다", async () => {
    const lane = await makeLane();
    lane.beginStroke(GOUACHE, 3, { color: [0.7, 0.1, 0.1, 1] });
    const empty = alphaSum(await lane.readback());
    expect(empty).toBe(0);
    feed(lane, STROKE_A, 40);
    expect(lane.wetParticleCount()).toBeGreaterThan(50);
    const wet = await lane.readback();
    const wetAlpha = alphaSum(wet);
    expect(wetAlpha).toBeGreaterThan(50);
    // 읽기는 상태를 바꾸지 않는다: 연달아 읽으면 같다.
    expect(pixelHash(await lane.readback())).toBe(pixelHash(wet));
    feed(lane, STROKE_A.slice(Math.floor(STROKE_A.length * 0.3)));
    await lane.endStroke();
    const baked = await lane.readback();
    expect(alphaSum(baked)).toBeGreaterThan(wetAlpha);
    expect(lane.wetParticleCount()).toBe(0);
  });

  it("획 도중 readbackLinear도 젖은 입자를 합성한다", async () => {
    const lane = await makeLane();
    lane.beginStroke(GOUACHE, 3, { color: [0.7, 0.1, 0.1, 1] });
    feed(lane, STROKE_A, 40);
    const linear = await lane.readbackLinear();
    expect(linear).not.toBeNull();
    let sum = 0;
    for (let i = 3; i < (linear?.length ?? 0); i += 4) sum += linear?.[i] ?? 0;
    expect(sum).toBeGreaterThan(50);
    lane.abortStroke();
  });
});

describe("mpm-paint 레인: abortStroke 계약", () => {
  it("[획1 → H1] [획2 시작·입력 → abort → readback == H1] [획3 == 획2 없이 획3만]", async () => {
    const lane = await makeLane();
    await draw(lane, STROKE_A, 1, [0.1, 0.3, 0.7, 1]);
    const h1 = pixelHash(await lane.readback());
    const linear1 = await lane.readbackLinear();

    lane.beginStroke(GOUACHE, 2, { color: [0.9, 0.2, 0.1, 1] });
    const fed = feed(lane, STROKE_B, 25);
    expect(fed).toBeGreaterThan(0);
    expect(lane.wetParticleCount()).toBeGreaterThan(0);
    const receipt = lane.abortStroke();
    expect(receipt.documentPreserved).toBe(true);
    expect(receipt.discardedDabs).toBe(fed);
    expect(receipt.reasonKo).toContain("버렸다");
    expect(lane.wetParticleCount()).toBe(0);
    expect(pixelHash(await lane.readback())).toBe(h1);
    expect(await lane.readbackLinear()).toEqual(linear1);

    await draw(lane, STROKE_B, 3, [0.9, 0.2, 0.1, 1]);
    const withAbort = pixelHash(await lane.readback());
    const clean = await makeLane();
    await draw(clean, STROKE_A, 1, [0.1, 0.3, 0.7, 1]);
    await draw(clean, STROKE_B, 3, [0.9, 0.2, 0.1, 1]);
    expect(withAbort).toBe(pixelHash(await clean.readback()));
    // 획 통계는 완료한 획만 센다.
    expect(lane.stats().strokes).toBe(2);
  });

  it("획 밖에서는 no-op이고 여러 번 불러도 같다(멱등)", async () => {
    const lane = await makeLane();
    expect(lane.abortStroke()).toEqual({ discardedDabs: 0, documentPreserved: true });
    await draw(lane, STROKE_A, 1);
    const h = pixelHash(await lane.readback());
    expect(lane.abortStroke()).toEqual({ discardedDabs: 0, documentPreserved: true });
    expect(pixelHash(await lane.readback())).toBe(h);
    lane.beginStroke(GOUACHE, 1);
    lane.abortStroke();
    expect(lane.abortStroke()).toEqual({ discardedDabs: 0, documentPreserved: true });
  });

  it("abort 뒤 레인은 idle이라 addSamples·endStroke는 거부하고 다음 획은 받는다", async () => {
    const lane = await makeLane();
    lane.beginStroke(GOUACHE, 1);
    feed(lane, STROKE_A, 10);
    lane.abortStroke();
    expect(() => lane.addSamples(STROKE_A)).toThrow(InvalidStateError);
    await expect(lane.endStroke()).rejects.toBeInstanceOf(InvalidStateError);
    await draw(lane, STROKE_A, 1);
    expect(alphaSum(await lane.readback())).toBeGreaterThan(100);
  });

  it("dispose된 레인의 abortStroke는 InvalidStateError다", async () => {
    const lane = await makeLane();
    lane.dispose();
    expect(() => lane.abortStroke()).toThrow(InvalidStateError);
    expect(() => lane.beginStroke(GOUACHE, 1)).toThrow(InvalidStateError);
  });
});

describe("mpm-paint 레인: 입자 한도·fail-visible", () => {
  it("한도에 닿으면 주입을 멈추고 overflowDabs와 한글 사유를 영수증에 남긴다", async () => {
    const lane = await makeLane({ maxParticles: 300 });
    lane.beginStroke(GOUACHE, 1);
    const fed = feed(lane, STROKE_A);
    expect(fed).toBe(300);
    expect(lane.wetParticleCount()).toBe(300);
    const receipt = (await lane.endStroke()) as MpmStrokeReceipt;
    expect(receipt.particlesPeak).toBe(300);
    expect(receipt.particlesInjected).toBe(300);
    expect(receipt.overflowDabs).toBeGreaterThan(0);
    expect(receipt.notesKo.join(" ")).toMatch(/입자 한도\(300개\).*건너뛰었다/);
    // 문서에는 한도까지 만든 물감이 굽혀 있다(조용히 비우지 않는다).
    expect(alphaSum(await lane.readback())).toBeGreaterThan(50);
  });

  it("한도 초과 획을 abort하면 사유에 한도 초과 건수가 남는다", async () => {
    const lane = await makeLane({ maxParticles: 120 });
    lane.beginStroke(GOUACHE, 1);
    feed(lane, STROKE_A);
    const abort = lane.abortStroke();
    expect(abort.discardedDabs).toBe(120);
    expect(abort.reasonKo).toMatch(/입자 한도/);
    expect(abort.documentPreserved).toBe(true);
  });

  it("스플랫 타일 풀이 모자라면 그린 입자 수를 줄이고 사유로 드러낸다", async () => {
    const lane = new MpmPaintLane();
    await lane.init(fakeEnv(), { ...INIT, strokeCapacityTiles: 3 });
    const receipt = await draw(lane, STROKE_A, 1);
    expect(receipt.splatSkipped).toBeGreaterThan(0);
    expect(receipt.overflowDabs).toBeGreaterThanOrEqual(receipt.splatSkipped);
    expect(receipt.notesKo.some((n) => n.includes("스플랫 타일 풀"))).toBe(true);
  });

  it("표본 시각이 크게 건너뛰면 서브스텝을 넘기고 그 사실을 알린다", async () => {
    const lane = await makeLane({ solver: { maxStepsPerAdvance: 50 } });
    lane.beginStroke(GOUACHE, 1);
    const jumpy = STROKE_A.map((s, i) => ({ ...s, tMs: s.tMs + (i > 20 ? 60_000 : 0) }));
    feed(lane, jumpy);
    const receipt = (await lane.endStroke()) as MpmStrokeReceipt;
    expect(receipt.droppedSubsteps).toBeGreaterThan(0);
    expect(receipt.notesKo.some((n) => n.includes("서브스텝"))).toBe(true);
  });

  it("CFL을 위반하는 설정은 클램프 발동과 함께 사유로 드러난다", async () => {
    const lane = await makeLane({ solver: { dtS: 1 / 60 / 2 } });
    const receipt = await draw(lane, STROKE_A, 1);
    expect(receipt.clampEvents).toBeGreaterThan(0);
    expect(receipt.notesKo.some((n) => n.includes("CFL"))).toBe(true);
    expect(receipt.notesKo.some((n) => n.includes("클램프"))).toBe(true);
  });

  it("정착 최대 스텝에 닿으면 그 사실을 알린다", async () => {
    const lane = await makeLane({ settleMaxSteps: 2, settleRmsSpeedPxS: 1e-9 });
    const receipt = await draw(lane, STROKE_A, 1);
    expect(receipt.settled).toBe(false);
    expect(receipt.settleSteps).toBe(2);
    expect(receipt.notesKo.some((n) => n.includes("정착 최대 스텝"))).toBe(true);
  });
});

describe("mpm-paint 레인: 프로그램 매핑·거부", () => {
  it("임파스토·smudge·지우개는 근사하지 않고 LaneUnavailableError(not-implemented)로 거부하며 레인은 idle로 남는다", async () => {
    const lane = await makeLane();
    for (const id of ["oil-impasto", "smudge-blend", "eraser-soft", "eraser-hard"]) {
      const program = presetById(id);
      expect(unsupportedMpmReason(program), id).not.toBeNull();
      expect(() => lane.beginStroke(program, 1), id).toThrow(LaneUnavailableError);
      try {
        lane.beginStroke(program, 1);
      } catch (error) {
        expect(error).toMatchObject({ code: "not-implemented", details: { laneId: "mpm-paint", presetId: id } });
      }
    }
    await draw(lane, STROKE_A, 1);
    expect(alphaSum(await lane.readback())).toBeGreaterThan(100);
  });

  it("그 밖의 건식·습식 프리셋은 받아서 팁 지름과 불투명도만 옮긴다", () => {
    for (const id of ["ink-g-pen", "gouache", "watercolor-wet", "acrylic", "airbrush", "pencil-hb"]) {
      expect(unsupportedMpmReason(presetById(id)), id).toBeNull();
    }
    const m = mapProgramToMpm(GOUACHE, 0.5);
    // gouache는 압력 크기 매핑이 없다 → 기본 √압력 곡선: 압력 1에서 팁 지름, 압력 0에서 45%.
    expect(m.emitter.widthAtPressure(1)).toBeCloseTo(GOUACHE.tip.sizePx, 9);
    expect(m.emitter.widthAtPressure(0)).toBeCloseTo(GOUACHE.tip.sizePx * 0.45, 9);
    expect(m.emitter.widthAtPressure(0.25)).toBeGreaterThan(m.emitter.widthAtPressure(0));
    expect(m.mappedKo[0]).toContain("기본 √압력 곡선");
    expect(m.opacity).toBeCloseTo(GOUACHE.deposition.opacity * 0.5, 9);
    // 압력 크기 매핑이 있는 프로그램은 그 곡선을 따른다(watercolor-wet: 지름 20px × [0.5 .. 1]).
    const wc = presetById("watercolor-wet");
    const wm = mapProgramToMpm(wc, 1);
    expect(wm.emitter.widthAtPressure(0)).toBeCloseTo(wc.tip.sizePx * 0.5, 6);
    expect(wm.emitter.widthAtPressure(1)).toBeCloseTo(wc.tip.sizePx, 6);
    expect(wm.mappedKo[0]).toContain("압력 크기 매핑");
    const tiny = mapProgramToMpm(presetById("pencil-mechanical"), 1);
    expect(tiny.emitter.widthAtPressure(0)).toBeGreaterThanOrEqual(1.2);
    expect(tiny.emitter.widthAtPressure(1)).toBeGreaterThanOrEqual(1.2);
    expect(m.unmappedKo.length).toBeGreaterThanOrEqual(5);
  });

  it("브러시 지름이 클수록 획이 두껍다", async () => {
    const thin = await makeLane();
    await draw(thin, STROKE_A, 1, undefined, PEN);
    const thick = await makeLane();
    await draw(thick, STROKE_A, 1, undefined, presetById("airbrush"));
    expect(alphaSum(await thick.readback())).toBeGreaterThan(alphaSum(await thin.readback()) * 1.5);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// MP-2: 기본 캔버스(1024×640)에서 브라우저가 20분 넘게 멈춘 결함의 회귀 시험.
// 원인: 시뮬레이션 시계가 표본 시각(실시간)에 묶여 있어 입자가 늘어 한 스텝이 dt보다 오래 걸리면 "늦을수록 따라잡을 스텝이 늘어 더 늦어지는" 되먹임이 생긴다.
// 아래 시험은 벽시계를 쓰지 않는다: 호출이 걸린 시간은 '입자-스텝 × 상수' 비용 모델(개수)로 가정하고, 단언은 모두 개수(스텝·입자-스텝·영수증 필드)다.
// ---------------------------------------------------------------------------------------------------------------------
describe("mpm-paint 레인: 작업 예산 가드(MP-2, 되먹임 정지 회귀)", () => {
  /** 브라우저가 느리다고 가정한 비용(ms/입자-스텝). Node 22 실측은 약 0.00037이고 브라우저(SwiftShader 부하)는 4배 안팎이다. */
  const MS_PER_PARTICLE_STEP = 0.0015;
  const WIDE = { width: 1024, height: 640, dpr: 1, tileSize: 16, seed: 1 } as const;

  function curve(w: number, h: number, count: number, tMs: (i: number) => number, pressure = 0.5): RawSample[] {
    const out: RawSample[] = [];
    for (let i = 0; i <= count; i += 1) {
      const t = i / count;
      out.push({
        x: w * 0.08 + w * 0.84 * t,
        y: h * 0.5 + Math.sin(t * Math.PI * 2) * h * 0.08,
        pressure,
        tiltXDeg: 0,
        tiltYDeg: 0,
        twistDeg: 0,
        tMs: tMs(i),
        pointerType: "mouse",
        phase: i === 0 ? "down" : i === count ? "up" : "move",
        source: "raw",
      });
    }
    return out;
  }

  interface CallRecord {
    steps: number;
    /** 이 호출이 쓴 작업(입자-스텝) = 설정한 예산 − 남은 예산. 예산이 무제한이면 steps × 호출 뒤 입자 수로 근사한다. */
    work: number;
    particles: number;
  }

  /** 그리기 화면과 같은 호출 패턴: 프레임(표본 2개)마다 addSamples 1회. 프로브는 메인 스레드가 막힌 시간만큼 다음 이벤트를 늦게 보낸다(비용 모델). */
  function drawLive(
    lane: MpmPaintLane,
    w: number,
    h: number,
    count: number,
    budget: number,
    frames = Number.POSITIVE_INFINITY,
    msPerParticleStep = MS_PER_PARTICLE_STEP,
  ): CallRecord[] {
    const sim = lane.currentSolver();
    if (!sim) throw new Error("솔버가 없다");
    lane.beginStroke(GOUACHE, 1);
    const records: CallRecord[] = [];
    let eventClock = 1000;
    const samples: RawSample[] = [];
    const raw = curve(w, h, count, () => 0);
    for (let i = 0; i < raw.length && records.length < frames; i += 2) {
      const batch = raw.slice(i, i + 2).map((s) => {
        const stamped = { ...s, tMs: eventClock };
        eventClock += 8;
        return stamped;
      });
      samples.push(...batch);
      const before = sim.counters.steps;
      const receipt = lane.addSamples(batch);
      const steps = sim.counters.steps - before;
      expect(receipt.dispatchCount).toBe(steps);
      const work = Number.isFinite(budget) ? budget - sim.workBudgetLeft : steps * sim.count;
      records.push({ steps, work, particles: sim.count });
      eventClock += work * msPerParticleStep;
    }
    return records;
  }

  it("원인 고정: 예산이 없으면(무제한) 비용 모델에서 호출당 서브스텝이 되먹임으로 기하급수 증가한다", async () => {
    // 작은 캔버스·적은 호출만으로 되먹임을 보인다(실제 계산은 입자 수백 개라 가볍다).
    const lane = new MpmPaintLane({ workBudgetPerCall: Number.POSITIVE_INFINITY });
    await lane.init(fakeEnv(), { ...INIT, width: 160, height: 96 });
    // 아주 느린 기계(0.01 ms/입자-스텝)를 가정해 입자 수백 개에서 되먹임이 시작되게 한다(실제 계산은 가볍다).
    const records = drawLive(lane, 160, 96, 60, Number.POSITIVE_INFINITY, 7, 0.01);
    expect(records.length).toBe(7);
    // 입자가 쌓여 한 스텝의 비용이 dt를 넘는 순간부터 다음 호출의 스텝이 직전보다 계속 늘어난다(이 증가가 20분 정지의 되먹임이다).
    const steps = records.map((r) => r.steps);
    expect(steps[6]).toBeGreaterThan(steps[4]);
    expect(steps[4]).toBeGreaterThan(steps[2]);
    expect(steps[6]).toBeGreaterThan(steps[1] * 4);
    lane.abortStroke();
  });

  it("호출당 작업 예산이 있으면 같은 입력에서도 모든 호출이 예산 이하이고 서브스텝이 발산하지 않는다", async () => {
    const budget = 6000;
    const lane = new MpmPaintLane({ workBudgetPerCall: budget });
    await lane.init(fakeEnv(), { ...INIT, width: 160, height: 96 });
    const records = drawLive(lane, 160, 96, 60, budget);
    for (const r of records) expect(r.work).toBeLessThanOrEqual(budget);
    // 서브스텝도 한정된다: 입자 수가 늘수록 호출당 스텝이 줄어든다(입자-스텝 예산).
    const late = records.slice(-5);
    for (const r of late) expect(r.steps).toBeLessThanOrEqual(Math.ceil(budget / Math.max(1, r.particles)) + 1);
    const receipt = (await lane.endStroke()) as MpmStrokeReceipt;
    // 호출 수 × 예산이 총 작업의 상한이다(전체가 유한하다).
    expect(records.reduce((acc, r) => acc + r.work, 0)).toBeLessThanOrEqual(records.length * budget);
    expect(receipt.budgetDroppedSubsteps).toBeGreaterThan(0);
    expect(receipt.droppedSubsteps).toBeGreaterThanOrEqual(receipt.budgetDroppedSubsteps);
    expect(receipt.budgetLimitedCalls).toBeGreaterThan(0);
    expect(receipt.workBudgetPerCall).toBe(budget);
    expect(receipt.notesKo.some((n) => n.includes("작업 예산") && n.includes("서브스텝"))).toBe(true);
    // 가드가 걸려도 획은 그려진다.
    expect(alphaSum(await lane.readback())).toBeGreaterThan(300);
  });

  it("기본 캔버스 1024×640 구아슈 마우스 곡선: 기본 예산에서 모든 호출이 예산 이하이고 정착까지 끝난다", async () => {
    const lane = new MpmPaintLane();
    await lane.init(fakeEnv(), WIDE);
    // 이벤트 간격 12 px(프로브의 6 px보다 성기다)로 시험 시간을 줄인다. 입자가 6000개를 넘는 구간이 있어 예산이 걸린다.
    const records = drawLive(lane, 1024, 640, 72, MPM_LANE_WORK_BUDGET_PER_CALL);
    for (const r of records) expect(r.work).toBeLessThanOrEqual(MPM_LANE_WORK_BUDGET_PER_CALL);
    expect(Math.max(...records.map((r) => r.particles))).toBeGreaterThan(5000);
    const receipt = (await lane.endStroke()) as MpmStrokeReceipt;
    expect(receipt.settleSteps).toBeLessThanOrEqual(receipt.settleStepCap);
    expect(receipt.settleStepCap).toBeLessThanOrEqual(MPM_LANE_SETTLE_MAX_STEPS);
    expect(receipt.clampEvents).toBe(0);
    expect(alphaSum(await lane.readback())).toBeGreaterThan(3000);
  });

  it("결정성: 같은 입력·같은 호출 패턴이면 예산이 걸려도 같은 해시다(시계를 읽지 않는다)", async () => {
    const run = async (): Promise<{ hash: string; dropped: number }> => {
      const lane = new MpmPaintLane({ workBudgetPerCall: 5000 });
      await lane.init(fakeEnv(), { ...INIT, width: 160, height: 96 });
      drawLive(lane, 160, 96, 60, 5000);
      const receipt = (await lane.endStroke()) as MpmStrokeReceipt;
      return { hash: pixelHash(await lane.readback()), dropped: receipt.budgetDroppedSubsteps };
    };
    const a = await run();
    expect(a.dropped).toBeGreaterThan(0);
    expect(await run()).toEqual(a);
  });

  it("병적 패턴 1: 표본 시각이 수 분 건너뛰어도(+60초) 그 호출의 작업은 예산 이하이고 건너뛴 스텝이 드러난다", async () => {
    const budget = 8000;
    const lane = new MpmPaintLane({ workBudgetPerCall: budget });
    await lane.init(fakeEnv(), { ...INIT, width: 160, height: 96 });
    lane.beginStroke(GOUACHE, 1);
    const sim = lane.currentSolver()!;
    const raw = curve(160, 96, 40, (i) => 1000 + i * 8 + (i >= 20 ? 60_000 : 0));
    let jumpWork = 0;
    for (let i = 0; i < raw.length; i += 2) {
      lane.addSamples(raw.slice(i, i + 2));
      const work = budget - sim.workBudgetLeft;
      expect(work).toBeLessThanOrEqual(budget);
      if (i === 20) jumpWork = work;
    }
    // 점프가 들어온 호출은 예산을 거의 다 쓰고 나머지를 건너뛴다(60초 = 28,800 스텝을 돌리지 않았다).
    expect(jumpWork).toBeGreaterThan(budget * 0.5);
    expect(sim.counters.steps).toBeLessThan(2000);
    const receipt = (await lane.endStroke()) as MpmStrokeReceipt;
    // 건너뛴 시간은 두 갈래로 센다: 행마다 한 번에 따라잡는 상한(maxStepsPerAdvance)을 넘은 몫과 작업 예산이 바닥난 몫. 합이 droppedSubsteps다.
    expect(receipt.droppedSubsteps).toBeGreaterThan(20_000);
    expect(receipt.budgetDroppedSubsteps).toBeGreaterThan(0);
    expect(receipt.notesKo.some((n) => n.includes("표본 시각이 크게 건너뛰어"))).toBe(true);
    expect(receipt.notesKo.some((n) => n.includes("작업 예산"))).toBe(true);
  });

  it("병적 패턴 2: 한 호출에 6초치 표본(750개)을 넣어도 그 호출의 작업은 예산 이하다", async () => {
    const budget = 10_000;
    const lane = new MpmPaintLane({ workBudgetPerCall: budget });
    await lane.init(fakeEnv(), WIDE);
    lane.beginStroke(GOUACHE, 1);
    const sim = lane.currentSolver()!;
    const receipt0 = lane.addSamples(curve(1024, 640, 750, (i) => 1000 + i * 8));
    expect(budget - sim.workBudgetLeft).toBeLessThanOrEqual(budget);
    // 예산이 없다면 2,880 서브스텝(6초 ÷ dt)이다.
    expect(receipt0.dispatchCount).toBeLessThan(2880 / 4);
    expect(sim.counters.budgetDroppedSubsteps).toBeGreaterThan(1500);
    const receipt = (await lane.endStroke()) as MpmStrokeReceipt;
    expect(receipt.budgetLimitedCalls).toBeGreaterThanOrEqual(1);
  });

  it("병적 패턴 3: 고밀도 이벤트 폭주(4000표본, 1ms 간격, 한 호출)는 입자 한도·예산 안에서 끝나고 한도 초과는 영수증에 센다", async () => {
    const budget = 10_000;
    const lane = new MpmPaintLane({ workBudgetPerCall: budget, maxParticles: 6000 });
    await lane.init(fakeEnv(), WIDE);
    lane.beginStroke(GOUACHE, 1);
    const sim = lane.currentSolver()!;
    const dense: RawSample[] = [];
    for (let i = 0; i <= 4000; i += 1) {
      dense.push({
        x: 20 + (i % 900),
        y: 60 + Math.floor(i / 900) * 40,
        pressure: 0.6,
        tiltXDeg: 0,
        tiltYDeg: 0,
        twistDeg: 0,
        tMs: 1000 + i,
        pointerType: "mouse",
        phase: i === 0 ? "down" : "move",
        source: "raw",
      });
    }
    lane.addSamples(dense);
    expect(budget - sim.workBudgetLeft).toBeLessThanOrEqual(budget);
    expect(sim.count).toBeLessThanOrEqual(6000);
    const receipt = (await lane.endStroke()) as MpmStrokeReceipt;
    expect(receipt.overflowDabs).toBeGreaterThan(0);
    expect(receipt.notesKo.some((n) => n.includes("입자 한도"))).toBe(true);
    // 정착도 예산 안이다: 입자 6000개 → 정착 예산 ÷ 6000 스텝 이하.
    expect(receipt.settleSteps).toBeLessThanOrEqual(Math.floor(MPM_LANE_SETTLE_WORK_BUDGET / 6000));
  });

  it("병적 패턴 4: 캔버스에서 아주 멀리 벗어난 점은 행 수만큼 일하지 않고 센다", async () => {
    const lane = await makeLane();
    lane.beginStroke(GOUACHE, 1);
    const far = lineStroke(16, 40, 1e7, 40, 0.6, { durationMs: 250 });
    feed(lane, far);
    const receipt = (await lane.endStroke()) as MpmStrokeReceipt;
    expect(receipt.rowsCulled).toBeGreaterThan(1_000_000);
    expect(receipt.notesKo.some((n) => n.includes("방출 행"))).toBe(true);
    expect(alphaSum(await lane.readback())).toBeGreaterThan(100);
  });

  it("정착 작업 예산: 입자가 많으면 정착 스텝 상한이 줄고, 상한에 닿으면 settled=false와 예산 사유를 남긴다", async () => {
    const lane = await makeLane({ settleWorkBudget: 20_000, settleRmsSpeedPxS: 1e-9 });
    const receipt = await draw(lane, STROKE_A, 1);
    const expectedCap = Math.floor(20_000 / receipt.particlesPeak);
    expect(expectedCap).toBeLessThan(MPM_LANE_SETTLE_MAX_STEPS);
    expect(receipt.settleStepCap).toBe(expectedCap);
    expect(receipt.settleSteps).toBe(expectedCap);
    expect(receipt.settled).toBe(false);
    expect(receipt.notesKo.some((n) => n.includes("정착이 작업 예산"))).toBe(true);
  });

  it("잘못된 예산(음수·NaN)은 솔버가 던진다 — 무음 보정 없음", async () => {
    const lane = await makeLane({ workBudgetPerCall: -1 });
    lane.beginStroke(GOUACHE, 1);
    expect(() => lane.addSamples(STROKE_A.slice(0, 2))).toThrow(RangeError);
    lane.abortStroke();
  });
});
