import { describe, expect, it } from "vitest";

import { pixelHash } from "../../bench/metrics/render-metrics";
import { alphaSum, fakeEnv } from "../../bench/testing/synthetic-images";
import { InvalidStateError, LaneUnavailableError } from "../../engine/core/errors";
import { presetById } from "../../engine/presets/catalog";
import { splitFrames } from "../../engine/raster/reference-renderer";
import { lineStroke, parametricStroke } from "../../engine/testing/synthetic-strokes";
import { drawLine, expectStrokeColorContract } from "../testing/stroke-color-contract";

import type { BristleLaneOptions, BristleStrokeReceipt } from "./bristle-dab-synthesis";
import type { LabImage, RawSample } from "../../engine/core/types";
import type { Surface } from "../../engine/raster/reference-renderer";
import type { BrushEngineLane } from "../lane";

/**
 * 물리 붓털 레인(자체 PBD·Rapier) 공통 계약 시험. 두 레인이 같은 붓털 다발·dab 합성을 쓰므로 같은 계약을 지켜야 한다.
 * 실제 래스터 표면(`Surface`)과 실제 월드(PBD 또는 Rapier wasm)를 Node에서 돌린다.
 * 이 파일은 `lanes/physics/**`의 시험 보조이며 테스트 파일이 아니라 `*.test.ts`가 import한다.
 */

export const CONTRACT_SIZE = 128;
export const CONTRACT_INIT = { width: CONTRACT_SIZE, height: CONTRACT_SIZE, dpr: 1, tileSize: 16, seed: 1 } as const;
export const PEN = presetById("ink-g-pen");
/** 붓펜 팁을 크게 키운 시험용 프로그램(벌어짐이 잘 보이는 폭). */
export const BRUSH = (() => {
  const base = presetById("ink-brush-pen");
  return { ...base, tip: { ...base.tip, sizePx: 24 } };
})();

/** 가장자리에서 떨어진 가로 직선. */
export const STROKE_A = lineStroke(24, 40, CONTRACT_SIZE - 24, 46, 0.7, { durationMs: 300 });
export const STROKE_B = lineStroke(24, 84, CONTRACT_SIZE - 24, 78, 0.8, { durationMs: 300 });

export type LaneFactory = () => BrushEngineLane;
/** 붓털 레인 옵션(덮어쓴 붓털 설정 포함)을 받아 레인을 만드는 팩토리. 공통 계약 시험이 대조군(소진 켬/끔)을 만들 때 쓴다. */
export type LaneFactoryWith = (options: BristleLaneOptions) => BrushEngineLane;

async function ready(make: LaneFactory): Promise<BrushEngineLane> {
  const lane = make();
  await lane.init(fakeEnv(), CONTRACT_INIT);
  return lane;
}

function feedFrames(lane: BrushEngineLane, samples: readonly RawSample[], stopAfterFrames?: number): number {
  let dabs = 0;
  let frames = 0;
  for (const frame of splitFrames(samples)) {
    if (stopAfterFrames !== undefined && frames >= stopAfterFrames) break;
    dabs += lane.addSamples(frame).dabCount;
    frames += 1;
  }
  return dabs;
}

async function drawFull(lane: BrushEngineLane, samples: readonly RawSample[], seed: number, color?: readonly [number, number, number, number]): Promise<BristleStrokeReceipt> {
  if (color) lane.beginStroke(BRUSH, seed, { color });
  else lane.beginStroke(BRUSH, seed);
  feedFrames(lane, samples);
  return (await lane.endStroke()) as BristleStrokeReceipt;
}

function inkedWidthAtColumn(image: LabImage, x: number): number {
  let top = Infinity;
  let bottom = -Infinity;
  for (let y = 0; y < image.height; y += 1) {
    if ((image.data[(y * image.width + x) * 4 + 3] ?? 0) > 12) {
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  return bottom >= top ? bottom - top + 1 : 0;
}

function meanAlphaInColumns(image: LabImage, x0: number, x1: number): number {
  let sum = 0;
  let n = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const a = image.data[(y * image.width + x) * 4 + 3] ?? 0;
      if (a > 12) {
        sum += a;
        n += 1;
      }
    }
  }
  return n === 0 ? 0 : sum / n;
}

/**
 * @param name 레인 이름(describe 제목)
 * @param make 레인 팩토리
 * @param backendId 영수증 `backendId` 기대값
 * @param makeWith 옵션을 받는 레인 팩토리(적재량 소진 대조군용)
 */
export function describeBristleLaneContract(name: string, make: LaneFactory, backendId: string, makeWith: LaneFactoryWith): void {
  describe(`${name}: 렌더·영수증`, () => {
    it("한 획을 그리면 캔버스 안에 잉크가 생기고 영수증이 정직하다", async () => {
      const lane = await ready(make);
      const receipt = await drawFull(lane, STROKE_A, 1, [0.2, 0.3, 0.8, 1]);
      const image = await lane.readback();
      expect(alphaSum(image)).toBeGreaterThan(1500);
      expect(receipt.backendId).toBe(backendId);
      expect(receipt.bristleCount).toBe(32);
      expect(receipt.dabCount).toBeGreaterThan(500);
      expect(receipt.ticks).toBeGreaterThan(60);
      expect(receipt.droppedTicks).toBe(0);
      expect(receipt.overflowDabs).toBe(0);
      expect(receipt.timingSource).toBe("unavailable");
      expect(receipt.gpuTimeMs).toBeNull();
      expect(receipt.notesKo).toEqual([]);
      expect(receipt.contactRadiusPx).toBeGreaterThan(0);
      expect(receipt.mappedKo.length).toBeGreaterThan(2);
      expect(receipt.unmappedKo.some((t) => t.includes("종이 그레인"))).toBe(true);
      expect(receipt.worldDiagnostics.steps).toBeGreaterThan(60);
      expect(lane.stats()).toMatchObject({ strokes: 1, dabs: receipt.dabCount });
      expect(lane.stats().lastReceipt).toBe(receipt);
      lane.dispose();
    });

    it("처음 그리기 전의 readback은 비어 있고, 선형 버퍼도 제공한다", async () => {
      const lane = await ready(make);
      expect(alphaSum(await lane.readback())).toBe(0);
      expect(await lane.readbackLinear()).not.toBeNull();
      lane.dispose();
    });

    it("움직임이 없는 탭(down→up 같은 자리)도 점이 남는다", async () => {
      const lane = await ready(make);
      lane.beginStroke(BRUSH, 1);
      lane.addSamples(lineStroke(60, 60, 60, 60, 0.8, { durationMs: 40 }));
      await lane.endStroke();
      expect(alphaSum(await lane.readback())).toBeGreaterThan(200);
      lane.dispose();
    });

    it("표본이 하나도 없는 획도 문서를 건드리지 않고 끝난다", async () => {
      const lane = await ready(make);
      lane.beginStroke(BRUSH, 1);
      const receipt = (await lane.endStroke()) as BristleStrokeReceipt;
      expect(receipt.dabCount).toBe(0);
      expect(receipt.ticks).toBe(0);
      expect(alphaSum(await lane.readback())).toBe(0);
      lane.dispose();
    });

    it("압력이 높을수록 획이 넓다(압력 → 벌어짐)", async () => {
      const widthAt = async (pressure: number): Promise<number> => {
        const lane = await ready(make);
        lane.beginStroke(BRUSH, 1);
        feedFrames(lane, lineStroke(16, 64, CONTRACT_SIZE - 16, 64, pressure, { durationMs: 400 }));
        await lane.endStroke();
        const w = inkedWidthAtColumn(await lane.readback(), 64);
        lane.dispose();
        return w;
      };
      const low = await widthAt(0.15);
      const high = await widthAt(0.8);
      expect(low).toBeGreaterThan(3);
      expect(high).toBeGreaterThan(low + 3);
    });

    it("물감 적재량이 거리에 따라 소진된다: 소진을 켠 쪽의 뒤/앞 농도 비가 끈 쪽보다 유의하게 작다(대조군)", async () => {
      // 240 px 한 방향 직선의 앞쪽(열 24..64)과 뒤쪽(열 190..230) 평균 알파의 비. loadDecayPx는 이만큼 움직이면 적재량이 1/2이 되는 길이다.
      const tailOverHead = async (loadDecayPx: number): Promise<{ head: number; tail: number; ratio: number }> => {
        const lane = makeWith({ brush: { loadDecayPx } });
        await lane.init(fakeEnv(), { ...CONTRACT_INIT, width: 256, height: 64 });
        lane.beginStroke(BRUSH, 1);
        feedFrames(lane, lineStroke(8, 32, 248, 32, 0.8, { durationMs: 500 }));
        await lane.endStroke();
        const img = await lane.readback();
        const head = meanAlphaInColumns(img, 24, 64);
        const tail = meanAlphaInColumns(img, 190, 230);
        lane.dispose();
        return { head, tail, ratio: head > 0 ? tail / head : 0 };
      };
      const decaying = await tailOverHead(240);
      const frozen = await tailOverHead(1e12);
      expect(decaying.head).toBeGreaterThan(0);
      expect(decaying.tail).toBeGreaterThan(0);
      expect(frozen.head).toBeGreaterThan(0);
      // 소진을 끄면 앞뒤가 같고(≥ 0.99), 켜면 뒤쪽이 눈에 띄게 옅다(< 0.85). `tail <= head`만 보면 소진을 꺼도 통과한다.
      expect(frozen.ratio).toBeGreaterThanOrEqual(0.99);
      expect(decaying.ratio).toBeLessThan(0.85);
      expect(decaying.ratio).toBeLessThan(frozen.ratio - 0.12);
    });

    it("털 가닥 줄무늬가 보인다: 획 단면의 알파가 균일하지 않다", async () => {
      const lane = await ready(make);
      await drawFull(lane, lineStroke(16, 64, CONTRACT_SIZE - 16, 64, 0.8, { durationMs: 400 }), 1);
      const img = await lane.readback();
      const column: number[] = [];
      for (let y = 0; y < img.height; y += 1) column.push(img.data[(y * img.width + 64) * 4 + 3] ?? 0);
      const inked = column.filter((a) => a > 12);
      const mean = inked.reduce((s, a) => s + a, 0) / inked.length;
      const variance = inked.reduce((s, a) => s + (a - mean) ** 2, 0) / inked.length;
      expect(Math.sqrt(variance)).toBeGreaterThan(4);
      lane.dispose();
    });
  });

  describe(`${name}: 결정성·분할 불변`, () => {
    it("같은 입력을 두 번 그리면 해시·선형 버퍼가 같고 시드가 다르면 다르다", async () => {
      const run = async (seed: number): Promise<{ hash: string; linear: Float32Array | null }> => {
        const lane = await ready(make);
        await drawFull(lane, STROKE_A, seed, [0.1, 0.4, 0.2, 1]);
        const out = { hash: pixelHash(await lane.readback()), linear: await lane.readbackLinear() };
        lane.dispose();
        return out;
      };
      const a = await run(5);
      const b = await run(5);
      const c = await run(6);
      expect(a.hash).toBe(b.hash);
      expect(a.linear).toEqual(b.linear);
      expect(c.hash).not.toBe(a.hash);
    });

    it("addSamples를 프레임별·표본별·한꺼번에 넣어도 결과가 같다", async () => {
      const hashes: string[] = [];
      for (const mode of ["frames", "single", "batch"] as const) {
        const lane = await ready(make);
        lane.beginStroke(BRUSH, 2);
        if (mode === "frames") feedFrames(lane, STROKE_A);
        else if (mode === "single") for (const s of STROKE_A) lane.addSamples([s]);
        else lane.addSamples(STROKE_A);
        await lane.endStroke();
        hashes.push(pixelHash(await lane.readback()));
        lane.dispose();
      }
      expect(new Set(hashes).size).toBe(1);
    });

    it("예측 표본(표시 전용)은 정본이 아니라 무시한다", async () => {
      const plain = await ready(make);
      await drawFull(plain, STROKE_A, 3);
      const lane = await ready(make);
      lane.beginStroke(BRUSH, 3);
      expect(lane.addSamples(STROKE_A.map((s) => ({ ...s, x: s.x + 30, source: "predicted" as const }))).dabCount).toBe(0);
      feedFrames(lane, STROKE_A);
      await lane.endStroke();
      expect(pixelHash(await lane.readback())).toBe(pixelHash(await plain.readback()));
      plain.dispose();
      lane.dispose();
    });
  });

  describe(`${name}: 획 색·거부·상태 오류`, () => {
    it("획 색 계약: 색을 주면 그 색이 칠해지고 색이 없으면 검정이다", async () => {
      await expectStrokeColorContract({ make, presetId: "ink-g-pen", tolerance: 0.14 });
      await expectStrokeColorContract({ make, presetId: "marker-alcohol", color: [0.1, 0.25, 0.9, 1], tolerance: 0.14 });
      const full = await drawLine({ make, presetId: "ink-g-pen", options: { color: [0.8, 0.1, 0.1, 1] } });
      const half = await drawLine({ make, presetId: "ink-g-pen", options: { color: [0.8, 0.1, 0.1, 0.5] } });
      // 색 알파는 dab마다 겹쳐 쌓이므로(cpu-reference도 같다) 획 전체의 상한은 아니지만, 알파가 낮으면 칠해진 곳이 평균적으로 더 옅다.
      const meanAlpha = (img: LabImage): number => {
        let sum = 0;
        let n = 0;
        for (let i = 3; i < img.data.length; i += 4) {
          const a = img.data[i] ?? 0;
          if (a > 12) {
            sum += a;
            n += 1;
          }
        }
        return n === 0 ? 0 : sum / n;
      };
      expect(meanAlpha(half)).toBeLessThan(meanAlpha(full) * 0.9);
    });

    it("잘못된 색은 획을 열기 전에 거부하고 레인은 idle로 남는다", async () => {
      const lane = await ready(make);
      expect(() => lane.beginStroke(BRUSH, 1, { color: [2, 0, 0, 1] })).toThrow(InvalidStateError);
      expect(() => lane.beginStroke(BRUSH, 1, { color: [0, 0, 0, Number.NaN] })).toThrow(InvalidStateError);
      await drawFull(lane, STROKE_A, 1);
      expect(lane.stats().strokes).toBe(1);
      lane.dispose();
    });

    it.each(["watercolor-wet", "oil-impasto", "smudge-blend", "eraser-soft", "spray-splatter", "screentone-halftone", "hatch-pen", "fx-glitter", "fx-fur-grass", "fx-cloud-smoke"])("근사할 수 없는 프로그램(%s)은 LaneUnavailableError(not-implemented)로 거부하고 레인은 idle로 남는다", async (presetId) => {
      const lane = await ready(make);
      let error: unknown;
      try {
        lane.beginStroke(presetById(presetId), 1);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(LaneUnavailableError);
      expect((error as LaneUnavailableError).code).toBe("not-implemented");
      expect((error as LaneUnavailableError).details).toMatchObject({ presetId });
      await drawFull(lane, STROKE_A, 1);
      expect(alphaSum(await lane.readback())).toBeGreaterThan(500);
      lane.dispose();
    });

    it("근사로 허용하는 프로그램(airbrush)은 영수증 notesKo에 모델 이름과 함께 근사 사실을 드러낸다", async () => {
      const lane = await ready(make);
      lane.beginStroke(presetById("airbrush"), 1);
      feedFrames(lane, STROKE_A);
      const receipt = (await lane.endStroke()) as BristleStrokeReceipt;
      expect(receipt.notesKo.some((t) => t.includes("airbrush"))).toBe(true);
      expect(receipt.unmappedKo.some((t) => t.includes("airbrush"))).toBe(true);
      lane.dispose();
    });

    it("호출 순서 오류는 InvalidStateError다", async () => {
      const lane = await ready(make);
      expect(() => lane.addSamples(STROKE_A)).toThrow(InvalidStateError);
      await expect(lane.endStroke()).rejects.toBeInstanceOf(InvalidStateError);
      lane.beginStroke(BRUSH, 1);
      expect(() => lane.beginStroke(BRUSH, 2)).toThrow(/endStroke되지 않았다/);
      lane.abortStroke();
      const fresh = make();
      expect(() => fresh.beginStroke(BRUSH, 1)).toThrow(/init 전/);
      await expect(fresh.readback()).rejects.toBeInstanceOf(InvalidStateError);
      lane.dispose();
    });

    it("유한하지 않은 표본이 섞인 배치는 통째로 거부하고 아무것도 그리지 않는다", async () => {
      const lane = await ready(make);
      lane.beginStroke(BRUSH, 1);
      const bad: RawSample[] = [...STROKE_A.slice(0, 10), { ...STROKE_A[10], x: Number.NaN } as RawSample];
      expect(() => lane.addSamples(bad)).toThrow(InvalidStateError);
      expect(() => lane.addSamples([{ ...STROKE_A[0], tMs: Number.POSITIVE_INFINITY } as RawSample])).toThrow(InvalidStateError);
      feedFrames(lane, STROKE_A);
      await lane.endStroke();
      expect(alphaSum(await lane.readback())).toBeGreaterThan(500);
      lane.dispose();
    });

    it("압력이 범위를 벗어나도 0..1로 제한한다", async () => {
      const lane = await ready(make);
      lane.beginStroke(BRUSH, 1);
      feedFrames(lane, lineStroke(24, 64, 104, 64, 5, { durationMs: 250 }));
      const receipt = (await lane.endStroke()) as BristleStrokeReceipt;
      expect(receipt.notesKo).toEqual([]);
      expect(alphaSum(await lane.readback())).toBeGreaterThan(300);
      lane.dispose();
    });

    it("dispose 뒤에는 모든 호출이 InvalidStateError다", async () => {
      const lane = await ready(make);
      lane.dispose();
      await expect(lane.init(fakeEnv(), CONTRACT_INIT)).rejects.toBeInstanceOf(InvalidStateError);
      expect(() => lane.beginStroke(BRUSH, 1)).toThrow(InvalidStateError);
      expect(() => lane.abortStroke()).toThrow(InvalidStateError);
      await expect(lane.readback()).rejects.toBeInstanceOf(InvalidStateError);
    });

    it("표본 시각이 크게 건너뛰면 따라잡지 않고 넘긴 틱을 사유로 드러낸다(무음 아님)", async () => {
      const lane = await ready(make);
      lane.beginStroke(BRUSH, 1);
      const jump = parametricStroke((t) => ({ x: 24 + 80 * t, y: 64, pressure: 0.7 }), { durationMs: 20, sampleRateHz: 60 }).map((s, i) => ({ ...s, tMs: i === 0 ? 0 : 20_000 }));
      lane.addSamples(jump);
      const receipt = (await lane.endStroke()) as BristleStrokeReceipt;
      expect(receipt.droppedTicks).toBeGreaterThan(1000);
      expect(receipt.notesKo.some((n) => n.includes("건너뛰"))).toBe(true);
      lane.dispose();
    });
  });

  describe(`${name}: abortStroke 계약`, () => {
    it("[획1 → H1] [획2 시작·입력 → abort → readback == H1] [획3 == 획2 없이 획3만]", async () => {
      const lane = await ready(make);
      await drawFull(lane, STROKE_A, 1, [0.1, 0.3, 0.7, 1]);
      const h1 = pixelHash(await lane.readback());
      const linear1 = await lane.readbackLinear();

      lane.beginStroke(BRUSH, 2, { color: [0.9, 0.2, 0.1, 1] });
      const fed = feedFrames(lane, STROKE_B, 12);
      expect(fed).toBeGreaterThan(0);
      const receipt = lane.abortStroke();
      expect(receipt.documentPreserved).toBe(true);
      expect(receipt.discardedDabs).toBeGreaterThanOrEqual(fed);
      expect(pixelHash(await lane.readback())).toBe(h1);
      expect(await lane.readbackLinear()).toEqual(linear1);

      // abort 뒤 레인은 idle: 다음 획이 정상으로 그려지고, 그 결과는 획2 없이 획3만 그린 것과 같다.
      await drawFull(lane, STROKE_B, 3, [0.2, 0.6, 0.2, 1]);
      const reference = await ready(make);
      await drawFull(reference, STROKE_A, 1, [0.1, 0.3, 0.7, 1]);
      await drawFull(reference, STROKE_B, 3, [0.2, 0.6, 0.2, 1]);
      expect(pixelHash(await lane.readback())).toBe(pixelHash(await reference.readback()));
      lane.dispose();
      reference.dispose();
    });

    it("표본을 하나도 받기 전에 abort해도 문서는 그대로이고 멱등이다", async () => {
      const lane = await ready(make);
      await drawFull(lane, STROKE_A, 1);
      const h1 = pixelHash(await lane.readback());
      lane.beginStroke(BRUSH, 2);
      const receipt = lane.abortStroke();
      expect(receipt).toMatchObject({ discardedDabs: 0, documentPreserved: true });
      expect(pixelHash(await lane.readback())).toBe(h1);
      expect(lane.abortStroke()).toEqual({ discardedDabs: 0, documentPreserved: true });
      lane.dispose();
    });

    it("획 밖에서 abortStroke는 no-op이다(멱등)", async () => {
      const lane = await ready(make);
      expect(lane.abortStroke()).toEqual({ discardedDabs: 0, documentPreserved: true });
      await drawFull(lane, STROKE_A, 1);
      expect(lane.abortStroke()).toEqual({ discardedDabs: 0, documentPreserved: true });
      expect(alphaSum(await lane.readback())).toBeGreaterThan(500);
      lane.dispose();
    });

    it("endStroke가 문서 합성 도중 실패하면 이어지는 abortStroke는 documentPreserved:false와 사유를 돌려주고 레인은 idle로 남는다", async () => {
      const lane = await ready(make);
      await drawFull(lane, STROKE_A, 1, [0.1, 0.3, 0.7, 1]);
      const h1 = pixelHash(await lane.readback());

      lane.beginStroke(BRUSH, 2, { color: [0.9, 0.2, 0.1, 1] });
      feedFrames(lane, STROKE_B);
      const surface = (lane as unknown as { currentSurface(): Surface | null }).currentSurface();
      expect(surface).not.toBeNull();
      if (!surface) return;
      // 합성 도중 실패를 흉내 낸다: 첫 타일을 문서에 합성한 뒤 획 풀 순회가 던진다(cpu-reference 시험과 같은 주입).
      const original = surface.stroke.tiles.bind(surface.stroke);
      surface.stroke.tiles = function* failing(): Iterable<[number, Float32Array]> {
        for (const entry of original()) {
          yield entry;
          throw new Error("합성 실패 시뮬레이션");
        }
      };
      await expect(lane.endStroke()).rejects.toThrow("합성 실패 시뮬레이션");
      surface.stroke.tiles = original;

      // 문서는 실제로 일부 바뀌었다(readback 해시가 획 전과 다르다). 영수증은 이를 거짓 없이 알려야 한다.
      expect(pixelHash(await lane.readback())).not.toBe(h1);
      const receipt = lane.abortStroke();
      expect(receipt.documentPreserved).toBe(false);
      expect(receipt.reasonKo ?? "").toContain("문서");

      // 실패한 마감 뒤에도 레인은 다음 획을 받는다(세션이 영구히 막히지 않는다).
      await drawFull(lane, STROKE_B, 3, [0.2, 0.6, 0.2, 1]);
      expect(lane.stats().strokes).toBe(2);
      lane.dispose();
    });

    it("abort한 획은 통계에 세지 않는다", async () => {
      const lane = await ready(make);
      lane.beginStroke(BRUSH, 1);
      feedFrames(lane, STROKE_A, 5);
      lane.abortStroke();
      expect(lane.stats().strokes).toBe(0);
      await drawFull(lane, STROKE_A, 1);
      expect(lane.stats().strokes).toBe(1);
      lane.dispose();
    });
  });
}
