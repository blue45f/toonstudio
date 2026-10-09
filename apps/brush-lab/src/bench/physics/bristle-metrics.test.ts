import { writeFileSync } from "node:fs";

import { beforeAll, describe, expect, it } from "vitest";

import { loadRapier } from "../../lanes/physics/rapier-loader";

import {
  hashFloats,
  measureDeterminism,
  measureSpikeTolerance,
  measureSpread,
  measureTickCost,
  median,
  pbdBackend,
  rapierBackend,
  zigzagPath,
} from "./bristle-metrics";
import { buildSlotBundleInput, dragMultipliers, restRadius, runSlotBundle, slotBristleRadius, SPIKE_BUNDLE, TICK_MS, uniformDts } from "./slot-bundle-scenario";

import type { WorldBackend } from "./bristle-metrics";

/**
 * 월드 비교 지표 시험. 기본 실행은 N = 8·32의 축소판이고 값이 아니라 **불변식**(유한·결정적·소프트 접촉이 하드 접촉보다 균일 등)만 확인한다.
 * 전체 측정(N = 8·32·128, 반복 7회)은 환경변수 `BRUSH_LAB_PHYSICS_BENCH_OUT=<json 경로>`를 주면 같은 하네스로 돌아 JSON으로 저장된다
 * (시간 값은 기계·부하에 따라 흔들리므로 임계로 검증하지 않는다 — 저장소 안에서 재측정한 값을 보고에 쓴다).
 */

const NOW = (): number => performance.now();
let rapier: WorldBackend;
const PBD = pbdBackend();
const PBD_HARD = pbdBackend({ contactRelaxation: 1, contactIterations: 3 }, "pbd-spike", "PBD 스파이크식");
const PBD_NOSPLIT = pbdBackend({ maxSubstepSec: 1e6 }, "pbd-nosplit", "PBD 분할 끔");

beforeAll(async () => {
  rapier = rapierBackend(await loadRapier());
});

describe("슬롯 다발 시나리오(SP-A 규약)", () => {
  it("압력별 슬롯 반경·털 접촉 반경·털별 항력 배율이 규약과 같다", () => {
    expect(restRadius(0, SPIKE_BUNDLE)).toBe(10);
    expect(restRadius(1, SPIKE_BUNDLE)).toBeCloseTo(24, 6);
    expect(slotBristleRadius(32, SPIKE_BUNDLE)).toBeCloseTo(0.5 * 15.6 * Math.sqrt(Math.PI / 32) * 1.07, 6);
    const m = dragMultipliers(64);
    expect(Math.min(...m)).toBeGreaterThanOrEqual(0.7);
    expect(Math.max(...m)).toBeLessThanOrEqual(1.3);
    expect(Array.from(dragMultipliers(64))).toEqual(Array.from(m));
  });

  it("입력은 틱 경계마다 경로를 보간하고 균일 틱은 240 Hz다", () => {
    const path = zigzagPath();
    const dts = uniformDts(path, 200);
    const input = buildSlotBundleInput(path, dts);
    expect(input.dts.length).toBe(dts.length);
    expect(input.tMs[1]).toBeCloseTo(TICK_MS, 6);
    expect(input.dts[0]).toBeCloseTo(1 / 240, 9);
    expect(input.strokeEndMs).toBe(path[path.length - 1]?.tMs);
  });

  it("월드를 구동하면 위치 시계열이 유한하고 비용 측정 모드는 시계열을 모으지 않는다", () => {
    const path = zigzagPath();
    const input = buildSlotBundleInput(path, uniformDts(path, 100));
    const world = PBD.create();
    const run = runSlotBundle(world, input, 8, SPIKE_BUNDLE, { capture: true, clock: { now: NOW } });
    world.dispose();
    expect(run.finite).toBe(true);
    expect(run.pos.length).toBe((input.dts.length + 1) * 8 * 2);
    expect(run.usPerTick).toBeGreaterThan(0);
    const world2 = PBD.create();
    const cheap = runSlotBundle(world2, input, 8, SPIKE_BUNDLE, { capture: false });
    world2.dispose();
    expect(cheap.pos.length).toBe(0);
    expect(cheap.finite).toBe(true);
  });
});

describe("지표 하네스(축소판)", () => {
  it("median·hashFloats 도우미", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(Number.isNaN(median([]))).toBe(true);
    expect(hashFloats(Float32Array.from([1, 2, 3]))).toBe(hashFloats(Float32Array.from([1, 2, 3])));
    expect(hashFloats(Float32Array.from([1, 2, 3]))).not.toBe(hashFloats(Float32Array.from([1, 2, 4])));
  });

  it.each([8, 32])("퍼짐 일관성(N=%i): 지표가 유한하고 압력이 높을수록 겹침이 줄며 평균 반경비는 1 이상이다", (n) => {
    for (const backend of [PBD, rapier]) {
      const m = [0.2, 0.5, 0.9].map((p) => measureSpread(backend, n, p));
      for (const x of m) {
        expect(Number.isFinite(x.stdRadiusRatio)).toBe(true);
        expect(x.meanRadiusRatio).toBeGreaterThan(0.95);
      }
      expect(m[0]?.overlapPairs ?? 0).toBeGreaterThanOrEqual(m[2]?.overlapPairs ?? 0);
      expect(m[2]?.stdRadiusRatio ?? 1).toBeLessThan(0.05);
    }
  });

  it("소프트 접촉 PBD(기본)는 스파이크식 하드 접촉(보정 1·반복 3)보다 N=128 퍼짐이 균일하다(SP-A의 0.263 문제를 푼 근거)", () => {
    const soft = measureSpread(PBD, 128, 0.2);
    const hard = measureSpread(PBD_HARD, 128, 0.2);
    expect(soft.stdRadiusRatio).toBeLessThan(hard.stdRadiusRatio * 0.5);
    expect(soft.stdRadiusRatio).toBeLessThan(0.06);
  });

  it("dt 스파이크: 서브스텝 분할을 켠 PBD는 100 ms에서도 슬롯 반경의 2배 안이고, 분할을 끄면 3배를 넘는다(분할이 내성의 원인)", () => {
    const split = measureSpikeTolerance(PBD, 32, 100);
    const none = measureSpikeTolerance(PBD_NOSPLIT, 32, 100);
    const ref = measureSpikeTolerance(rapier, 32, 100);
    for (const s of [split, none, ref]) expect(s.finite).toBe(true);
    expect(split.maxStretchOverR).toBeLessThan(2);
    expect(none.maxStretchOverR).toBeGreaterThan(3);
    expect(ref.maxStretchOverR).toBeLessThan(2);
  });

  it.each([8, 32])("같은 머신 결정성(N=%i): 새 월드 3회가 모두 같은 위치 해시다(PBD·Rapier)", (n) => {
    for (const backend of [PBD, rapier]) {
      const d = measureDeterminism(backend, n, 3);
      expect(d.allEqual, `${backend.id} N=${n} ${d.hashes.join(",")}`).toBe(true);
      expect(d.hashes).toHaveLength(3);
    }
    // 다른 월드는 다른 해시를 낸다(해시가 입력을 실제로 반영한다).
    expect(measureDeterminism(PBD, n, 1).hashes[0]).not.toBe(measureDeterminism(rapier, n, 1).hashes[0]);
  });

  it("틱 비용: 양수·유한이고 프레임 예산 비율이 월드 틱 4개 기준이다(값 자체는 기계 의존이라 임계 없음)", () => {
    const cost = measureTickCost(PBD, 8, { clock: { now: NOW }, repeats: 2, warmup: 1, holdMs: 50 });
    expect(cost.worldUsPerTick).toBeGreaterThan(0);
    expect(cost.brushUsPerTick).toBeGreaterThan(0);
    expect(cost.frameBudgetFraction).toBeCloseTo((4 * cost.worldUsPerTick) / 16_667, 9);
    expect(cost.ticks).toBeGreaterThan(150);
  });
});

describe("전체 측정(환경변수로 켠다)", () => {
  it("BRUSH_LAB_PHYSICS_BENCH_OUT이 있으면 N=8·32·128 전체를 측정해 JSON으로 쓴다", () => {
    const out = process.env.BRUSH_LAB_PHYSICS_BENCH_OUT;
    const backends = [PBD, PBD_HARD, PBD_NOSPLIT, rapier];
    const ns = out ? [8, 32, 128] : [8];
    const rows: Record<string, unknown>[] = [];
    for (const n of ns) {
      for (const backend of backends) {
        rows.push({
          backend: backend.id,
          label: backend.labelKo,
          n,
          spread: [0.2, 0.5, 0.9].map((p) => measureSpread(backend, n, p)),
          cost: measureTickCost(backend, n, { clock: { now: NOW }, repeats: out ? 7 : 1, warmup: out ? 2 : 0, holdMs: out ? 200 : 50 }),
          spike33: measureSpikeTolerance(backend, n, 33.3),
          spike100: measureSpikeTolerance(backend, n, 100),
          determinism: measureDeterminism(backend, n, out ? 5 : 2),
        });
      }
    }
    expect(rows.length).toBe(ns.length * backends.length);
    for (const row of rows) expect((row.determinism as { allEqual: boolean }).allEqual).toBe(true);
    if (out) {
      writeFileSync(out, JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch, rows }, null, 1));
    }
  });
});
