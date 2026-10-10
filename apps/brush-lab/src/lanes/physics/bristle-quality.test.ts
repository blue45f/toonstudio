import { writeFileSync } from "node:fs";

import { beforeAll, describe, expect, it } from "vitest";

import { drawOnLane, measureQualityRow, presetZigzag } from "../../bench/physics/bristle-quality-metrics";
import { alphaSum, fakeEnv } from "../../bench/testing/synthetic-images";
import { BristleBrush2D, bristleSpreadRadiusPx } from "../../engine/physics/world2d/bristle-brush";
import { PbdWorld2D } from "../../engine/physics/world2d/pbd-world";
import { presetById } from "../../engine/presets/catalog";
import { lineStroke, parametricStroke } from "../../engine/testing/synthetic-strokes";
import { createCpuReferenceLane } from "../cpu-reference-lane";

import { mapProgramToBristle } from "./bristle-dab-synthesis";
import { createBristlePbdLane } from "./bristle-pbd-lane";
import { createRapierBristleLane } from "./rapier-bristle-lane";

import type { BristleStrokeReceipt } from "./bristle-dab-synthesis";
import type { QualityRow } from "../../bench/physics/bristle-quality-metrics";
import type { RawSample } from "../../engine/core/types";
import type { BristleTick } from "../../engine/physics/world2d/bristle-brush";
import type { BrushEngineLane } from "../lane";

/**
 * 붓털 물리 레인 품질 시험(BL-4a): 필압 → 폭 동적 범위, 프리셋 차이, 결정성, 압력 극단·빠른 획·긴 획의 안정성.
 * 기준을 완화해 통과시키지 않는다 — 임계는 수용 기준 그대로(폭비 2.5, 잉크 픽셀 편차 25 %)다.
 * 환경변수 `BRUSH_LAB_BRISTLE_QUALITY_OUT=<json 경로>`를 주면 parity 표(cpu-reference 포함)를 JSON으로 저장한다.
 */

interface LaneEntry {
  id: string;
  make: () => BrushEngineLane;
}

const BRISTLE_LANES: LaneEntry[] = [
  { id: "bristle-pbd", make: () => createBristlePbdLane() },
  { id: "bristle-rapier", make: () => createRapierBristleLane() },
];
const REFERENCE_LANE: LaneEntry = { id: "cpu-reference", make: () => createCpuReferenceLane() };

/** 필압 폭비 기준 프리셋(수용 기준 a). */
const RANGE_PRESETS = ["ink-brush-pen", "charcoal", "ink-g-pen"] as const;
/** 프리셋 차이 기준 프리셋(수용 기준 b). */
const DIFF_PRESETS = ["ink-brush-pen", "charcoal", "pencil-hb", "ink-g-pen"] as const;
const SHAPES = ["zigzag", "curve", "spiral"] as const;

/** 수용 기준: 필압 1.0 폭 / 필압 0.15 폭. */
const MIN_WIDTH_RATIO = 2.5;
/** 수용 기준: (최대 − 최소) / 최소 잉크 픽셀 수. */
const MIN_INK_SPREAD = 0.25;

const table = new Map<string, QualityRow>();
const key = (laneId: string, presetId: string): string => `${laneId}/${presetId}`;
function row(laneId: string, presetId: string): QualityRow {
  const r = table.get(key(laneId, presetId));
  if (!r) throw new Error(`측정 행이 없다: ${key(laneId, presetId)}`);
  return r;
}

beforeAll(async () => {
  for (const lane of [REFERENCE_LANE, ...BRISTLE_LANES]) {
    for (const presetId of DIFF_PRESETS) {
      table.set(key(lane.id, presetId), await measureQualityRow(lane.id, lane.make, presetById(presetId)));
    }
  }
  const out = process.env.BRUSH_LAB_BRISTLE_QUALITY_OUT;
  if (out) writeFileSync(out, JSON.stringify([...table.values()], null, 1));
}, 600_000);

describe("수용 a) 필압 동적 범위: p=1.0 폭 / p=0.15 폭 ≥ 2.5", () => {
  for (const lane of BRISTLE_LANES) {
    for (const presetId of RANGE_PRESETS) {
      it(`${lane.id} · ${presetId}: 잉크 픽셀 수 폭비와 커버리지 폭비가 모두 ${MIN_WIDTH_RATIO} 이상이고 압력에 따라 단조 증가한다`, () => {
        const r = row(lane.id, presetId);
        expect(r.ratioCount).toBeGreaterThanOrEqual(MIN_WIDTH_RATIO);
        expect(r.ratioCoverage).toBeGreaterThanOrEqual(MIN_WIDTH_RATIO);
        expect(r.widthCoverage["0.15"] ?? 0).toBeLessThan(r.widthCoverage["0.5"] ?? 0);
        expect(r.widthCoverage["0.5"] ?? 0).toBeLessThan(r.widthCoverage["1"] ?? 0);
        expect(r.widthCount["0.15"] ?? 0).toBeLessThanOrEqual(r.widthCount["0.5"] ?? 0);
        expect(r.widthCount["0.5"] ?? 0).toBeLessThan(r.widthCount["1"] ?? 0);
      });
    }
  }

  it("기준선: cpu-reference는 같은 입력에서 세 프리셋 모두 폭비 2.5 이상이다(붓털 레인이 따라갈 목표)", () => {
    for (const presetId of RANGE_PRESETS) expect(row(REFERENCE_LANE.id, presetId).ratioCount).toBeGreaterThanOrEqual(MIN_WIDTH_RATIO);
  });

  it("붓털 레인의 압력 1.0 폭은 cpu-reference의 0.5~1.5배다(접촉 모델을 같은 표에서 얻어 폭 규모가 맞는다)", () => {
    for (const lane of BRISTLE_LANES) {
      for (const presetId of RANGE_PRESETS) {
        const mine = row(lane.id, presetId).widthCoverage["1"] ?? 0;
        const ref = row(REFERENCE_LANE.id, presetId).widthCoverage["1"] ?? 0;
        expect(mine / ref).toBeGreaterThan(0.5);
        expect(mine / ref).toBeLessThan(1.5);
      }
    }
  });
});

describe("수용 b) 프리셋 차이: 붓펜·목탄·연필 HB·G펜", () => {
  for (const lane of BRISTLE_LANES) {
    for (const shape of SHAPES) {
      it(`${lane.id} · ${shape}: 잉크 픽셀 수 (최대 − 최소) / 최소 ≥ ${MIN_INK_SPREAD}, 픽셀 해시는 프리셋마다 다르다`, () => {
        const inks = DIFF_PRESETS.map((p) => row(lane.id, p)[shape].ink);
        const spread = (Math.max(...inks) - Math.min(...inks)) / Math.min(...inks);
        expect(spread).toBeGreaterThanOrEqual(MIN_INK_SPREAD);
        const hashes = new Set(DIFF_PRESETS.map((p) => row(lane.id, p)[shape].hash));
        expect(hashes.size).toBe(DIFF_PRESETS.length);
      });

      it(`${lane.id} · ${shape}: 팁 지름이 같은 붓펜과 목탄도 잉크 픽셀 수가 ${MIN_INK_SPREAD * 100} % 이상 다르다(수정 전에는 0.1 % 차이였다)`, () => {
        const brush = row(lane.id, "ink-brush-pen")[shape].ink;
        const charcoal = row(lane.id, "charcoal")[shape].ink;
        expect(Math.abs(brush - charcoal) / Math.min(brush, charcoal)).toBeGreaterThanOrEqual(MIN_INK_SPREAD);
      });
    }

    it(`${lane.id}: 목탄은 붓펜보다 그레인(알파 분산)이 뚜렷하다 — 지그재그 전체 알파 분산과 압력 0.2 직선의 안쪽 알파 분산`, () => {
      const charcoal = row(lane.id, "charcoal");
      const brush = row(lane.id, "ink-brush-pen");
      // 지그재그 전체의 알파 분산은 가장자리 안티앨리어싱이 크게 섞여 차이가 작다(약 1.1~1.2배). 알갱이만 잰 안쪽 분산이 결정적 증거다.
      expect(charcoal.zigzag.alphaVariance).toBeGreaterThan(brush.zigzag.alphaVariance * 1.05);
      expect(charcoal.grainLineVariance).toBeGreaterThan(brush.grainLineVariance * 3);
    });
  }
});

describe("수용 c) 결정성: 같은 입력 3회 실행의 해시가 같다", () => {
  for (const lane of BRISTLE_LANES) {
    it(`${lane.id}: 붓펜·목탄 지그재그를 3번씩 그려도 해시가 같다`, async () => {
      for (const presetId of ["ink-brush-pen", "charcoal"] as const) {
        const hashes = new Set<string>();
        for (let i = 0; i < 3; i += 1) {
          const r = await measureQualityRow(lane.id, lane.make, presetById(presetId));
          hashes.add(`${r.zigzag.hash}|${r.curve.hash}|${r.spiral.hash}|${r.widthCount["0.15"]}|${r.widthCount["1"]}`);
        }
        expect(hashes.size).toBe(1);
        // 표의 첫 측정과도 같다(같은 프로세스 안 재실행).
        const first = row(lane.id, presetId);
        expect([...hashes][0]).toContain(first.zigzag.hash);
      }
    }, 120_000);
  }
});

/** 압력이 표본마다 0.05 ↔ 1.0으로 뒤집히는 직선. */
function alternatingPressure(): RawSample[] {
  return lineStroke(40, 128, 216, 128, 1, { durationMs: 600 }).map((s, i) => ({ ...s, pressure: i % 2 === 0 ? 0.05 : 1 }));
}

/** 20 ms에 236 px(약 11,800 px/s)를 지나는 빠른 획. */
function fastStroke(pressure: number): RawSample[] {
  return lineStroke(10, 128, 246, 128, pressure, { durationMs: 20 });
}

/** 20초 동안 압력이 천천히 흔들리는 나선(고정 틱 약 4,800개). */
function longStroke(): RawSample[] {
  return parametricStroke(
    (t) => ({ x: 128 + 100 * Math.cos(60 * t), y: 128 + 100 * Math.sin(60 * t), pressure: 0.05 + 0.95 * (0.5 + 0.5 * Math.sin(40 * t)) }),
    { durationMs: 20_000 },
  );
}

const STABILITY_CASES: { name: string; samples: () => RawSample[] }[] = [
  { name: "압력 0.05 ↔ 1.0 표본마다 뒤집기", samples: alternatingPressure },
  { name: "빠른 획(압력 1.0)", samples: () => fastStroke(1) },
  { name: "빠른 획(압력 0.05)", samples: () => fastStroke(0.05) },
  { name: "긴 획(20초)", samples: longStroke },
];

describe("물리 안정성: 압력 극단·빠른 획·긴 획에서 폭주가 없다", () => {
  for (const lane of BRISTLE_LANES) {
    for (const presetId of ["ink-brush-pen", "ink-g-pen"] as const) {
      it(`${lane.id} · ${presetId}: 월드 진단 카운터가 0이고 건강하지 않다는 사유가 영수증에 없다`, async () => {
        for (const c of STABILITY_CASES) {
          const instance = lane.make();
          await instance.init(fakeEnv(), { width: 256, height: 256, dpr: 1, tileSize: 16, seed: 3 });
          instance.beginStroke(presetById(presetId), 3, { color: [0, 0, 0, 1] });
          for (const s of c.samples()) instance.addSamples([s]);
          const receipt = (await instance.endStroke()) as BristleStrokeReceipt;
          const image = await instance.readback();
          instance.dispose();
          expect(receipt.worldDiagnostics.nonFiniteResets ?? 0, c.name).toBe(0);
          expect(receipt.worldDiagnostics.nonFiniteStates ?? 0, c.name).toBe(0);
          expect(receipt.worldDiagnostics.oversizeSteps ?? 0, c.name).toBe(0);
          expect(receipt.notesKo.filter((n) => n.includes("건강하지 않다") || n.includes("안정성이 보장되지 않는다")), c.name).toEqual([]);
          expect(Number.isFinite(alphaSum(image)), c.name).toBe(true);
          expect(alphaSum(image), c.name).toBeGreaterThan(0);
        }
      }, 120_000);
    }
  }

  /**
   * 털끝이 손잡이에서 멀어지는 거리의 상한: 다발 반경(압력 1) 안쪽에서의 흔들림 + 손잡이 지연이 만드는 끌림(속도 × 시정수)이다.
   * 시정수 상한 12 ms는 고유 진동수 14 Hz 스프링과 손잡이 지연 12 ms에서 나온 값이고 3 px은 털 몸체·지터 여유다.
   */
  it.each(["ink-brush-pen", "charcoal", "ink-g-pen", "pencil-hb"])("%s: 털끝이 NaN이 되지 않고 손잡이에서 멀어지는 거리가 상한을 넘지 않는다(자체 PBD 월드)", (presetId) => {
    const mapping = mapProgramToBristle(presetById(presetId));
    const rMax = bristleSpreadRadiusPx(mapping.config, 1);
    for (const c of STABILITY_CASES) {
      const samples = c.samples();
      const brush = new BristleBrush2D(new PbdWorld2D(), mapping.config, 3);
      let maxDist = 0;
      let finite = true;
      const sink = {
        onTick(t: BristleTick): void {
          for (let i = 0; i < t.count; i += 1) {
            const x = t.curX[i] ?? Number.NaN;
            const y = t.curY[i] ?? Number.NaN;
            if (!Number.isFinite(x) || !Number.isFinite(y)) finite = false;
            maxDist = Math.max(maxDist, Math.hypot(x - t.handleX, y - t.handleY));
          }
        },
      };
      const first = samples[0];
      if (!first) throw new Error("표본이 없다");
      let maxSpeed = 0;
      brush.begin(first.x, first.y, first.tMs, first.pressure);
      let prev = first;
      for (const s of samples) {
        brush.advance(s.x, s.y, s.tMs, s.pressure, sink);
        if (s.tMs > prev.tMs) maxSpeed = Math.max(maxSpeed, (Math.hypot(s.x - prev.x, s.y - prev.y) / (s.tMs - prev.tMs)) * 1000);
        prev = s;
      }
      brush.settle(sink, 300);
      const diag = brush.worldDiagnostics();
      brush.dispose();
      expect(finite, c.name).toBe(true);
      expect(diag.nonFiniteResets ?? 0, c.name).toBe(0);
      expect(diag.oversizeSteps ?? 0, c.name).toBe(0);
      expect(maxDist, c.name).toBeLessThanOrEqual(2.5 * rMax + 3 + 0.012 * maxSpeed);
    }
  }, 120_000);
});

describe("성능 회귀 가드(조건 기록용 스모크)", () => {
  it("256² 지그재그 addSamples는 프레임당 수 ms 이내다(상대 1.5배 측정은 문서의 재측정으로 하고 여기서는 느려짐 폭주만 막는다)", async () => {
    const times: number[] = [];
    await drawOnLane(createBristlePbdLane(), presetById("ink-brush-pen"), presetZigzag(), 7, () => performance.now()).then((d) => times.push(...d.addSamplesMs));
    times.sort((a, b) => a - b);
    const p50 = times[Math.floor(times.length / 2)] ?? 0;
    // 부하가 큰 공유 머신에서도 넘지 않을 넉넉한 상한(수정 전 p50은 2~3 ms 수준). 임계가 아니라 폭주 감시다.
    expect(p50).toBeLessThan(50);
  }, 60_000);
});
