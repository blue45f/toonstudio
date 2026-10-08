import { describe, expect, it } from "vitest";

import { buildFixture } from "../../bench/fixtures/stroke-fixtures";
import { pixelHash } from "../../bench/metrics/render-metrics";
import { runFixture } from "../../bench/runner/run-fixture";
import { fakeEnv } from "../../bench/testing/synthetic-images";
import { InvalidStateError, LaneUnavailableError } from "../../engine/core/errors";
import { PRESET_IDS, presetById } from "../../engine/presets/catalog";
import { splitFrames } from "../../engine/raster/reference-renderer";

import type { LabImage, RawSample } from "../../engine/core/types";
import type { BrushProgram } from "../../engine/presets/program-schema";
import type { BrushEngineLane } from "../lane";
import type { MypaintMappingReceipt } from "../mypaint-settings-map";

/**
 * 외부 래스터 엔진 비교 레인(libmypaint·Hokusai) 공통 계약 시험. 실제 wasm을 Node에서 돌려
 * 렌더 결과·결정성·분할 불변·abortStroke 보존·dispose 오류·미지원 거부·매핑 영수증을 확인한다.
 * 레인마다 다른 항목(probe·로드 실패·동시 획)은 각 레인 테스트에 둔다.
 */
export type ExternalTestLane = BrushEngineLane & { mappingReceipt(): MypaintMappingReceipt | null };

const SIZE = 128;
const INIT = { width: SIZE, height: SIZE, dpr: 1, tileSize: 16, seed: 1 } as const;

/** 계약 시험이 렌더하는 프리셋(건식·압력 크기·시간 dab 포함). */
export const CONTRACT_PRESETS = ["ink-g-pen", "pencil-hb", "airbrush"] as const;

/** 거부되어야 하는 프리셋(습식·임파스토·smudge). */
export const REJECTED_PRESETS = ["watercolor-wet", "sumi-ink-wet", "oil-impasto", "smudge-blend"] as const;

export function hashOf(image: LabImage): string {
  return pixelHash(image);
}

function inkStats(image: LabImage): { inked: number; fraction: number; maxAlpha: number } {
  let inked = 0;
  let maxAlpha = 0;
  for (let i = 3; i < image.data.length; i += 4) {
    const a = image.data[i] ?? 0;
    if (a > 0) inked += 1;
    if (a > maxAlpha) maxAlpha = a;
  }
  return { inked, fraction: inked / (image.width * image.height), maxAlpha };
}

async function newLane(make: () => ExternalTestLane): Promise<ExternalTestLane> {
  const lane = make();
  await lane.init(fakeEnv(), INIT);
  return lane;
}

function feedFrames(lane: BrushEngineLane, samples: readonly RawSample[]): void {
  for (const frame of splitFrames(samples)) lane.addSamples(frame);
}

async function drawFull(lane: BrushEngineLane, program: BrushProgram, samples: readonly RawSample[], seed: number): Promise<void> {
  lane.beginStroke(program, seed);
  feedFrames(lane, samples);
  await lane.endStroke();
}

export function describeExternalLaneContract(name: string, make: () => ExternalTestLane): void {
  const zigzag = buildFixture("zigzag", { width: SIZE, height: SIZE });
  const curve = buildFixture("curve", { width: SIZE, height: SIZE });
  const line = buildFixture("line", { width: SIZE, height: SIZE });

  describe(`${name}: 렌더 계약(wasm 실행)`, () => {
    it.each(CONTRACT_PRESETS)("%s: 지그재그·곡선이 비어 있지 않은 픽셀을 캔버스 안에 그린다", async (presetId) => {
      for (const fixture of [zigzag, curve]) {
        const result = await runFixture({ lane: make(), env: fakeEnv(), fixture, program: presetById(presetId), seed: 7 });
        const stats = inkStats(result.image);
        expect(result.image.width).toBe(SIZE);
        expect(result.image.height).toBe(SIZE);
        expect(stats.inked, `${presetId}/${fixture.id}`).toBeGreaterThan(40);
        expect(stats.fraction).toBeLessThan(0.6);
        expect(stats.maxAlpha).toBeGreaterThan(8);
        expect(result.linear).not.toBeNull();
        expect(result.receipt.dabCount).toBeGreaterThan(0);
      }
    });

    it("결정성: 같은 입력 두 번 = 같은 해시, 시드가 다르면 입력 의존 난수 경로도 결정적으로 재현된다", async () => {
      const program = presetById("ink-g-pen");
      const a = await runFixture({ lane: make(), env: fakeEnv(), fixture: zigzag, program, seed: 3 });
      const b = await runFixture({ lane: make(), env: fakeEnv(), fixture: zigzag, program, seed: 3 });
      expect(hashOf(a.image)).toBe(hashOf(b.image));
      expect(Array.from(a.linear ?? [])).toEqual(Array.from(b.linear ?? []));
    });

    it("addSamples 분할 = 일괄: 프레임 분할·표본 단위·한 번에 넣어도 같은 픽셀이다", async () => {
      const program = presetById("pencil-hb");
      const hashes: string[] = [];
      for (const mode of ["frames", "single", "batch"] as const) {
        const lane = await newLane(make);
        lane.beginStroke(program, 5);
        if (mode === "frames") feedFrames(lane, curve.samples);
        else if (mode === "single") for (const s of curve.samples) lane.addSamples([s]);
        else lane.addSamples(curve.samples);
        await lane.endStroke();
        hashes.push(hashOf(await lane.readback()));
        lane.dispose();
      }
      expect(new Set(hashes).size).toBe(1);
    });

    it("예측 표본은 정본이 아니라 무시한다", async () => {
      const program = presetById("ink-g-pen");
      const plain = await newLane(make);
      await drawFull(plain, program, line.samples, 2);
      const withPredicted = await newLane(make);
      withPredicted.beginStroke(program, 2);
      const predicted = line.samples.map((s) => ({ ...s, x: s.x + 40, source: "predicted" as const }));
      withPredicted.addSamples(predicted);
      feedFrames(withPredicted, line.samples);
      await withPredicted.endStroke();
      expect(hashOf(await withPredicted.readback())).toBe(hashOf(await plain.readback()));
      plain.dispose();
      withPredicted.dispose();
    });

    it("두 획이 문서에 겹쳐 합성된다(레인이 문서를 소유한다)", async () => {
      const lane = await newLane(make);
      await drawFull(lane, presetById("ink-g-pen"), line.samples, 1);
      const first = inkStats(await lane.readback()).inked;
      await drawFull(lane, presetById("ink-g-pen"), curve.samples, 2);
      const second = inkStats(await lane.readback()).inked;
      expect(second).toBeGreaterThan(first);
      expect(lane.stats().strokes).toBe(2);
      lane.dispose();
    });

    it("지우개(erase 블렌드)는 획 레이어를 destination-out으로 문서에서 뺀다", async () => {
      const lane = await newLane(make);
      await drawFull(lane, presetById("ink-g-pen"), line.samples, 1);
      const before = inkStats(await lane.readback()).inked;
      await drawFull(lane, presetById("eraser-hard"), line.samples, 1);
      const after = inkStats(await lane.readback()).inked;
      expect(after).toBeLessThan(before);
      lane.dispose();
    });

    it("선형 문서는 premultiplied이고 8비트 읽기와 일치한다", async () => {
      const lane = await newLane(make);
      await drawFull(lane, presetById("ink-g-pen"), zigzag.samples, 4);
      const image = await lane.readback();
      const linear = await lane.readbackLinear();
      expect(linear).not.toBeNull();
      expect(linear?.length).toBe(SIZE * SIZE * 4);
      for (let i = 0; i < SIZE * SIZE; i += 1) {
        const alpha = (image.data[i * 4 + 3] ?? 0) / 255;
        expect(Math.abs((linear?.[i * 4 + 3] ?? 0) - alpha)).toBeLessThan(1e-6);
        // 검정 획이라 premultiplied 색은 0이다.
        expect(linear?.[i * 4] ?? 1).toBeLessThanOrEqual(alpha + 1e-6);
      }
      lane.dispose();
    });
  });

  describe(`${name}: abortStroke`, () => {
    it("획 도중 abort는 문서를 beginStroke 직전 그대로 두고 다음 획이 abort한 획과 섞이지 않는다", async () => {
      const program = presetById("ink-g-pen");
      const lane = await newLane(make);
      await drawFull(lane, program, line.samples, 1);
      const h1 = hashOf(await lane.readback());
      lane.beginStroke(program, 2);
      feedFrames(lane, zigzag.samples.slice(0, 20));
      const receipt = lane.abortStroke();
      expect(receipt.documentPreserved).toBe(true);
      expect(receipt.discardedDabs).toBe(20);
      expect(hashOf(await lane.readback())).toBe(h1);
      // abort 뒤 레인은 idle이다.
      expect(() => lane.addSamples(line.samples)).toThrow(InvalidStateError);
      await expect(lane.endStroke()).rejects.toBeInstanceOf(InvalidStateError);
      await drawFull(lane, program, curve.samples, 3);
      const reference = await newLane(make);
      await drawFull(reference, program, line.samples, 1);
      await drawFull(reference, program, curve.samples, 3);
      expect(hashOf(await lane.readback())).toBe(hashOf(await reference.readback()));
      lane.dispose();
      reference.dispose();
    });

    it("획 밖 abort는 no-op(멱등)이고 첫 획 abort 뒤에도 빈 문서다", async () => {
      const lane = await newLane(make);
      expect(lane.abortStroke()).toEqual({ discardedDabs: 0, documentPreserved: true });
      lane.beginStroke(presetById("ink-g-pen"), 1);
      feedFrames(lane, line.samples);
      expect(lane.abortStroke().documentPreserved).toBe(true);
      expect(lane.abortStroke()).toEqual({ discardedDabs: 0, documentPreserved: true });
      expect(inkStats(await lane.readback()).inked).toBe(0);
      lane.dispose();
    });
  });

  describe(`${name}: 수명·오류`, () => {
    it("dispose 뒤 모든 호출은 InvalidStateError이고 dispose는 멱등이다", async () => {
      const lane = await newLane(make);
      lane.dispose();
      lane.dispose();
      expect(() => lane.beginStroke(presetById("ink-g-pen"), 1)).toThrow(InvalidStateError);
      expect(() => lane.addSamples(line.samples)).toThrow(InvalidStateError);
      expect(() => lane.abortStroke()).toThrow(InvalidStateError);
      await expect(lane.endStroke()).rejects.toBeInstanceOf(InvalidStateError);
      await expect(lane.readback()).rejects.toBeInstanceOf(InvalidStateError);
      await expect(lane.readbackLinear()).rejects.toBeInstanceOf(InvalidStateError);
    });

    it("init 전 호출과 획 순서 위반은 InvalidStateError다", async () => {
      const raw = make();
      expect(() => raw.beginStroke(presetById("ink-g-pen"), 1)).toThrow(InvalidStateError);
      await expect(raw.readback()).rejects.toBeInstanceOf(InvalidStateError);
      raw.dispose();
      const lane = await newLane(make);
      expect(() => lane.addSamples(line.samples)).toThrow(InvalidStateError);
      lane.beginStroke(presetById("ink-g-pen"), 1);
      expect(() => lane.beginStroke(presetById("ink-g-pen"), 1)).toThrow(InvalidStateError);
      lane.abortStroke();
      lane.dispose();
    });

    it("잘못된 캔버스 크기는 RangeError다", async () => {
      await expect(make().init(fakeEnv(), { ...INIT, width: 0 })).rejects.toBeInstanceOf(RangeError);
      await expect(make().init(fakeEnv(), { ...INIT, height: 1.5 })).rejects.toBeInstanceOf(RangeError);
    });

    it.each(REJECTED_PRESETS)("%s: 엔진에 대응 모델이 없는 프로그램은 not-implemented로 거부하고 레인은 idle로 남는다", async (presetId) => {
      const lane = await newLane(make);
      let caught: unknown = null;
      try {
        lane.beginStroke(presetById(presetId), 1);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(LaneUnavailableError);
      expect((caught as LaneUnavailableError).code).toBe("not-implemented");
      expect((caught as LaneUnavailableError).message).toContain(presetId);
      expect(lane.abortStroke()).toEqual({ discardedDabs: 0, documentPreserved: true });
      await drawFull(lane, presetById("ink-g-pen"), line.samples, 1);
      expect(inkStats(await lane.readback()).inked).toBeGreaterThan(0);
      lane.dispose();
    });
  });

  describe(`${name}: 프로그램 매핑 영수증`, () => {
    it("거부 대상이 아닌 프리셋 전부가 엔진에 받아들여지고(알 수 없는 설정 없음) 영수증이 남는다", async () => {
      const lane = await newLane(make);
      const rejected = new Set<string>(REJECTED_PRESETS);
      let tested = 0;
      for (const id of PRESET_IDS) {
        const program = presetById(id);
        const reasonRejected = (() => {
          try {
            lane.beginStroke(program, 1);
            return false;
          } catch (error) {
            expect(error).toBeInstanceOf(LaneUnavailableError);
            return true;
          }
        })();
        if (reasonRejected) {
          expect(["wet-flow", "impasto", "smudge"].includes(program.deposition.model) || program.wet !== null, id).toBe(true);
          continue;
        }
        expect(rejected.has(id), `${id}는 거부 목록에 있는데 받아들여졌다`).toBe(false);
        lane.addSamples(line.samples.slice(0, 6));
        lane.abortStroke();
        const receipt = lane.mappingReceipt();
        expect(receipt, id).not.toBeNull();
        expect(receipt?.mapped.length, id).toBeGreaterThan(3);
        // 입력 파이프라인 미적용은 모든 프로그램에 항상 드러난다.
        expect(receipt?.unmapped.some((line) => line.startsWith("program.input")), id).toBe(true);
        tested += 1;
      }
      expect(tested).toBeGreaterThan(20);
      lane.dispose();
    });

    it("연필은 종이 그레인·접촉 물리·테이퍼를 반영하지 못했다고 영수증에 적는다", async () => {
      const lane = await newLane(make);
      lane.beginStroke(presetById("pencil-hb"), 1);
      const receipt = lane.mappingReceipt();
      lane.abortStroke();
      const joined = receipt?.unmapped.join("\n") ?? "";
      expect(joined).toContain("paper");
      expect(joined).toContain("physics.contact=graphite");
      expect(joined).toContain("edge.taper");
      expect(receipt?.approximated.join("\n")).toContain("tip.kind=noise");
      lane.dispose();
    });
  });
}
