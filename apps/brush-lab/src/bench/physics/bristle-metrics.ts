import { BristleBrush2D, fermatLayout, resolveBristleBrushConfig } from "../../engine/physics/world2d/bristle-brush";
import { PbdWorld2D } from "../../engine/physics/world2d/pbd-world";
import { createRapierWorld } from "../../lanes/physics/rapier-world";
import { buildFixture } from "../fixtures/stroke-fixtures";

import { buildSlotBundleInput, restRadius, runSlotBundle, SPIKE_BUNDLE, TICK_MS, uniformDts } from "./slot-bundle-scenario";

import type { PathPoint, SlotBundleInput, SlotBundleParams, SlotBundleRun } from "./slot-bundle-scenario";
import type { Clock, RawSample } from "../../engine/core/types";
import type { BristleTickSink } from "../../engine/physics/world2d/bristle-brush";
import type { PbdWorldOptions } from "../../engine/physics/world2d/pbd-world";
import type { PhysicsWorld2D } from "../../engine/physics/world2d/types";
import type { RapierModule } from "../../lanes/physics/rapier-loader";

/**
 * 물리 붓털 월드 비교 지표(자체 PBD vs Rapier 2D): 틱 비용, 퍼짐 일관성(반경비 표준편차), dt 스파이크 내성, 같은 머신 결정성.
 * 규약은 SP-A와 같다(`slot-bundle-scenario.ts`). 시계는 주입한다. 모든 시간은 Node 22 단일 스레드 값이며 브라우저에서는 측정하지 않았다.
 */

/** 월드 구현 하나를 가리키는 백엔드 설명. */
export interface WorldBackend {
  id: string;
  labelKo: string;
  create(): PhysicsWorld2D;
}

/** 자체 PBD 백엔드. */
export function pbdBackend(options: PbdWorldOptions = {}, id = "pbd", labelKo = "자체 PBD"): WorldBackend {
  return { id, labelKo, create: () => new PbdWorld2D(options) };
}

/** Rapier 2D 백엔드(이미 `loadRapier()`로 초기화한 모듈을 받는다). */
export function rapierBackend(module: RapierModule, id = "rapier", labelKo = "Rapier 2D"): WorldBackend {
  return { id, labelKo, create: () => createRapierWorld(module) };
}

/** 몇 바이트열(f32 비트)의 FNV-1a 32비트 해시(16진). 결정성 비교용이며 암호 해시가 아니다. */
export function hashFloats(values: Float32Array): string {
  const u32 = new Uint32Array(values.buffer, values.byteOffset, values.length);
  let h = 2166136261;
  for (let i = 0; i < u32.length; i += 1) h = Math.imul(h ^ (u32[i] ?? 0), 16777619) >>> 0;
  return h.toString(16).padStart(8, "0");
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 === 1 ? (s[(n - 1) / 2] ?? Number.NaN) : ((s[n / 2 - 1] ?? 0) + (s[n / 2] ?? 0)) / 2;
}

/** 지그재그 fixture(SP-A와 같은 512² 기본 캔버스)의 경로. */
export function zigzagPath(): PathPoint[] {
  return buildFixture("zigzag").samples.map((s: RawSample) => ({ x: s.x, y: s.y, tMs: s.tMs, pressure: s.pressure }));
}

function runOn(backend: WorldBackend, input: SlotBundleInput, n: number, params: SlotBundleParams, capture: boolean, clock?: Clock): SlotBundleRun {
  const world = backend.create();
  try {
    return runSlotBundle(world, input, n, params, clock ? { capture, clock } : { capture });
  } finally {
    world.dispose();
  }
}

/* ------------------------------------------------------------------ */
/* 퍼짐 일관성                                                           */
/* ------------------------------------------------------------------ */

export interface SpreadMetrics {
  n: number;
  pressure: number;
  /** 털 중심 거리 / 슬롯 반경(슬롯 반경 > 0.3R인 털만). */
  meanRadiusRatio: number;
  stdRadiusRatio: number;
  /** 마지막 100 ms 틱 간 이동 RMS(px). */
  tickJitterRmsPx: number;
  overlapPairs: number;
  meanOverlapFrac: number;
  maxOverlapFrac: number;
}

/** 정지 압력 p를 유지한 털 다발의 퍼짐(SP-A `holdMetrics`와 같은 정의). */
export function measureSpread(backend: WorldBackend, n: number, pressure: number, params: SlotBundleParams = SPIKE_BUNDLE): SpreadMetrics {
  const path: PathPoint[] = [
    { x: 256, y: 256, tMs: 0, pressure: 0 },
    { x: 256, y: 256, tMs: 100, pressure },
    { x: 256, y: 256, tMs: 800, pressure },
  ];
  const input = buildSlotBundleInput(path, new Array<number>(Math.round(800 / TICK_MS)).fill(TICK_MS));
  const run = runOn(backend, input, n, params, true);
  const { ux, uy } = fermatLayout(n);
  const j1 = run.ticks;
  const j0 = run.ticks - Math.round(100 / TICK_MS);
  const R = restRadius(pressure, params);
  const cx = input.hx[j1] ?? 0;
  const cy = input.hy[j1] ?? 0;
  const ratios: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const o = (j1 * n + i) * 2;
    const rho = Math.hypot((run.pos[o] ?? 0) - cx, (run.pos[o + 1] ?? 0) - cy);
    const rest = Math.hypot((ux[i] ?? 0) * R, (uy[i] ?? 0) * R);
    if (rest > 0.3 * R) ratios.push(rho / rest);
  }
  const mean = ratios.reduce((a, b) => a + b, 0) / Math.max(1, ratios.length);
  const std = Math.sqrt(ratios.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, ratios.length));
  let ss = 0;
  let cnt = 0;
  for (let j = j0 + 1; j <= j1; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const a = (j * n + i) * 2;
      const b = ((j - 1) * n + i) * 2;
      ss += ((run.pos[a] ?? 0) - (run.pos[b] ?? 0)) ** 2 + ((run.pos[a + 1] ?? 0) - (run.pos[b + 1] ?? 0)) ** 2;
      cnt += 1;
    }
  }
  const r = run.bristleRadius;
  let overlapPairs = 0;
  let sumOverlap = 0;
  let maxOverlap = 0;
  for (let i = 0; i < n; i += 1) {
    for (let k = i + 1; k < n; k += 1) {
      const a = (j1 * n + i) * 2;
      const b = (j1 * n + k) * 2;
      const d = Math.hypot((run.pos[a] ?? 0) - (run.pos[b] ?? 0), (run.pos[a + 1] ?? 0) - (run.pos[b + 1] ?? 0));
      const ov = (2 * r - d) / (2 * r);
      if (ov > 0) {
        overlapPairs += 1;
        sumOverlap += ov;
        if (ov > maxOverlap) maxOverlap = ov;
      }
    }
  }
  return {
    n,
    pressure,
    meanRadiusRatio: mean,
    stdRadiusRatio: std,
    tickJitterRmsPx: Math.sqrt(ss / Math.max(1, cnt)),
    overlapPairs,
    meanOverlapFrac: overlapPairs > 0 ? sumOverlap / overlapPairs : 0,
    maxOverlapFrac: maxOverlap,
  };
}

/* ------------------------------------------------------------------ */
/* 틱 비용                                                              */
/* ------------------------------------------------------------------ */

export interface TickCostOptions {
  clock: Clock;
  /** 측정 반복 수(중앙값을 쓴다). */
  repeats: number;
  /** 버리는 워밍업 반복 수. */
  warmup: number;
  /** 경로 끝 뒤 정지 시간(ms). */
  holdMs?: number;
}

export interface TickCost {
  n: number;
  ticks: number;
  /** 월드 틱(kinematic 목표 설정 + step + 상태 읽기)당 중앙값(µs). */
  worldUsPerTick: number;
  /** 붓털 틱 전체(손잡이 펜·방향·슬롯·월드·적재량, dab 합성 제외)당 중앙값(µs). */
  brushUsPerTick: number;
  /** 240 Hz 틱 4개(= 60 fps 프레임 한 개)가 16.67 ms 예산에서 차지하는 비율(월드 틱 기준). */
  frameBudgetFraction: number;
}

const NULL_SINK: BristleTickSink = { onTick: () => undefined };

/** 지그재그 경로로 월드 틱 비용과 붓털 틱 전체 비용을 잰다. */
export function measureTickCost(backend: WorldBackend, n: number, opts: TickCostOptions): TickCost {
  const path = zigzagPath();
  const dts = uniformDts(path, opts.holdMs ?? 200);
  const input = buildSlotBundleInput(path, dts);
  const worldCosts: number[] = [];
  const brushCosts: number[] = [];
  for (let rep = 0; rep < opts.warmup + opts.repeats; rep += 1) {
    const world = runOn(backend, input, n, SPIKE_BUNDLE, false, opts.clock);
    // 붓털 틱 전체: 같은 경로를 표본 시각으로 구동한다.
    const brush = new BristleBrush2D(backend.create(), resolveBristleBrushConfig({ count: n, radiusPx: 10 }), 1);
    const first = path[0];
    if (!first) throw new Error("zigzag 경로가 비어 있다");
    brush.begin(first.x, first.y, first.tMs, first.pressure);
    const t0 = opts.clock.now();
    for (const p of path) brush.advance(p.x, p.y, p.tMs, p.pressure, NULL_SINK);
    brush.settle(NULL_SINK, opts.holdMs ?? 200);
    const elapsed = opts.clock.now() - t0;
    const ticks = Math.max(1, brush.diagnostics.ticks);
    brush.dispose();
    if (rep >= opts.warmup) {
      worldCosts.push(world.usPerTick);
      brushCosts.push((elapsed * 1000) / ticks);
    }
  }
  const worldUs = median(worldCosts);
  return {
    n,
    ticks: input.dts.length,
    worldUsPerTick: worldUs,
    brushUsPerTick: median(brushCosts),
    frameBudgetFraction: (4 * worldUs) / 16_667,
  };
}

/* ------------------------------------------------------------------ */
/* dt 스파이크 내성                                                     */
/* ------------------------------------------------------------------ */

export interface SpikeTolerance {
  n: number;
  spikeMs: number;
  finite: boolean;
  /** 털이 슬롯에서 벗어난 최대 거리 / 그때의 슬롯 반경. 작을수록 안정. */
  maxStretchOverR: number;
}

/** 지그재그 중 100번째 틱 하나의 dt를 spikeMs로 바꿔 한 번의 step에 넣는다(SP-A 규약). */
export function measureSpikeTolerance(backend: WorldBackend, n: number, spikeMs: number): SpikeTolerance {
  const path = zigzagPath();
  const dts = uniformDts(path, 400).map((d, i) => (i === 100 ? spikeMs : d));
  const input = buildSlotBundleInput(path, dts);
  try {
    const run = runOn(backend, input, n, SPIKE_BUNDLE, true);
    let maxStretch = 0;
    for (let j = 1; j <= run.ticks; j += 1) {
      const R = restRadius(input.pr[j] ?? 0, SPIKE_BUNDLE);
      for (let i = 0; i < n; i += 1) {
        const o = (j * n + i) * 2;
        const s = Math.hypot((run.pos[o] ?? 0) - (run.slot[o] ?? 0), (run.pos[o + 1] ?? 0) - (run.slot[o + 1] ?? 0)) / R;
        if (Number.isFinite(s) && s > maxStretch) maxStretch = s;
      }
    }
    return { n, spikeMs, finite: run.finite, maxStretchOverR: maxStretch };
  } catch {
    // 월드가 던지면 폭주로 센다(조용히 무시하지 않고 finite=false로 드러낸다).
    return { n, spikeMs, finite: false, maxStretchOverR: Number.POSITIVE_INFINITY };
  }
}

/* ------------------------------------------------------------------ */
/* 같은 머신 결정성                                                     */
/* ------------------------------------------------------------------ */

export interface DeterminismResult {
  n: number;
  runs: number;
  hashes: string[];
  allEqual: boolean;
}

/** 새 월드에서 같은 입력을 `runs`번 돌려 위치 시계열 해시가 모두 같은지 본다. */
export function measureDeterminism(backend: WorldBackend, n: number, runs: number): DeterminismResult {
  const path = zigzagPath();
  const input = buildSlotBundleInput(path, uniformDts(path, 200));
  const hashes: string[] = [];
  for (let i = 0; i < runs; i += 1) hashes.push(hashFloats(runOn(backend, input, n, SPIKE_BUNDLE, true).pos));
  return { n, runs, hashes, allEqual: hashes.every((h) => h === hashes[0]) };
}
