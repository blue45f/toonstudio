import { Pcg32 } from "../../engine/core/rng";
import { fermatLayout } from "../../engine/physics/world2d/bristle-brush";
import { BODY_STATE_STRIDE } from "../../engine/physics/world2d/types";

import type { Clock } from "../../engine/core/types";
import type { PhysicsWorld2D } from "../../engine/physics/world2d/types";

/**
 * 슬롯 다발 시나리오(SP-A 규약의 재구현): 손잡이가 표본 경로를 그대로 따르는 kinematic 슬롯 N개에 털 N올이 영 길이 스프링으로 매달린다.
 * 손잡이 스프링 펜·방향 회전·적재량이 없는 **순수 월드 비교**용이라 자체 PBD와 Rapier를 같은 입력으로 비교할 때 월드만 다르다.
 * 파라미터와 규약은 SP-A(`bundle.ts`)와 같게 둬서 스파이크 수치와 같은 조건으로 재측정한다(f32 미러·소프트 접촉 PBD는 달라진 점).
 *
 * 시계는 주입한다(`Clock`) — 벤치는 시간을 직접 읽지 않는다.
 */

export interface SlotBundleParams {
  /** 압력 0에서 휴지 반경(px). */
  r0: number;
  /** R(p) = r0·(1 + spreadGain·p). */
  spreadGain: number;
  fnHz: number;
  relZeta: number;
  /** 평균 항력률(1/s). 털마다 0.7~1.3배(시드 고정). */
  dragMean: number;
  mass: number;
}

/** SP-A 번들 파라미터. */
export const SPIKE_BUNDLE: SlotBundleParams = { r0: 10, spreadGain: 1.4, fnHz: 14, relZeta: 0.15, dragMean: 45, mass: 1 };

export const TICK_HZ = 240;
export const TICK_MS = 1000 / TICK_HZ;
export const TICK_SEC = 1 / TICK_HZ;

/** 압력 p의 슬롯 반경. */
export function restRadius(p: number, b: SlotBundleParams): number {
  return b.r0 * (1 + b.spreadGain * p);
}

/** 털 접촉 반경: 압력 0.4에서 최근접 간격의 절반(SP-A 규약). */
export function slotBristleRadius(n: number, b: SlotBundleParams): number {
  return 0.5 * restRadius(0.4, b) * Math.sqrt(Math.PI / n) * 1.07;
}

/** 털별 항력 배율 0.7~1.3(시드 고정). */
export function dragMultipliers(n: number, seed = 0x6b72): Float32Array {
  const rng = new Pcg32(seed, 0xb15);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = 0.7 + 0.6 * rng.nextF32();
  return out;
}

export interface PathPoint {
  x: number;
  y: number;
  tMs: number;
  pressure: number;
}

/** 틱 경계별 손잡이 위치·압력과 틱 길이(초). */
export interface SlotBundleInput {
  tMs: Float64Array;
  hx: Float64Array;
  hy: Float64Array;
  pr: Float64Array;
  dts: Float64Array;
  strokeEndMs: number;
}

function lerpSeries(ts: Float64Array, vs: Float64Array, t: number): number {
  const n = ts.length;
  if (t <= (ts[0] ?? 0)) return vs[0] ?? 0;
  if (t >= (ts[n - 1] ?? 0)) return vs[n - 1] ?? 0;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((ts[mid] ?? 0) <= t) lo = mid;
    else hi = mid;
  }
  const f = (t - (ts[lo] ?? 0)) / ((ts[hi] ?? 0) - (ts[lo] ?? 0));
  return (vs[lo] ?? 0) + ((vs[hi] ?? 0) - (vs[lo] ?? 0)) * f;
}

/** 표본 경로를 틱 길이 배열(ms)로 샘플링한다. 틱 시각은 0에서 누적한다. */
export function buildSlotBundleInput(path: readonly PathPoint[], dtsMs: readonly number[]): SlotBundleInput {
  const st = Float64Array.from(path.map((p) => p.tMs));
  const sx = Float64Array.from(path.map((p) => p.x));
  const sy = Float64Array.from(path.map((p) => p.y));
  const sp = Float64Array.from(path.map((p) => p.pressure));
  const n = dtsMs.length;
  const tMs = new Float64Array(n + 1);
  const hx = new Float64Array(n + 1);
  const hy = new Float64Array(n + 1);
  const pr = new Float64Array(n + 1);
  const dts = new Float64Array(n);
  let t = 0;
  for (let j = 0; j <= n; j += 1) {
    tMs[j] = t;
    hx[j] = lerpSeries(st, sx, t);
    hy[j] = lerpSeries(st, sy, t);
    pr[j] = lerpSeries(st, sp, t);
    if (j < n) {
      dts[j] = (dtsMs[j] ?? TICK_MS) / 1000;
      t += dtsMs[j] ?? TICK_MS;
    }
  }
  return { tMs, hx, hy, pr, dts, strokeEndMs: st[st.length - 1] ?? 0 };
}

/** 240 Hz 균일 틱 + 끝에서 holdMs만큼 정지. */
export function uniformDts(path: readonly PathPoint[], holdMs: number): number[] {
  const end = path[path.length - 1]?.tMs ?? 0;
  return new Array<number>(Math.round((end + holdMs) / TICK_MS)).fill(TICK_MS);
}

export interface SlotBundleRun {
  n: number;
  ticks: number;
  /** 틱 j의 털 i: pos[(j·n + i)·2 ..], j=0이 초기 상태(ticks+1개). capture=false면 빈 배열. */
  pos: Float32Array;
  /** 슬롯 위치(같은 배치). */
  slot: Float32Array;
  /** 루프 전체의 경과(ms, 주입 시계). 시계를 주지 않으면 0. */
  elapsedMs: number;
  /** 틱당 평균 비용(µs). */
  usPerTick: number;
  finite: boolean;
  bristleRadius: number;
}

export interface RunSlotBundleOptions {
  /** 위치 시계열을 모을지(비용 측정 때는 끈다). */
  capture: boolean;
  clock?: Clock;
}

/** 월드에 슬롯·털·스프링을 만들고 입력을 구동한다. */
export function runSlotBundle(world: PhysicsWorld2D, input: SlotBundleInput, n: number, b: SlotBundleParams, opts: RunSlotBundleOptions): SlotBundleRun {
  const ticks = input.dts.length;
  const { ux, uy } = fermatLayout(n);
  const drag = dragMultipliers(n);
  const r = slotBristleRadius(n, b);
  const R0 = restRadius(input.pr[0] ?? 0, b);
  const w = 2 * Math.PI * b.fnHz;
  const k = b.mass * w * w;
  const c = 2 * b.relZeta * Math.sqrt(k * b.mass);
  const slotIds: number[] = [];
  const bristleIds: number[] = [];
  for (let i = 0; i < n; i += 1) {
    slotIds.push(world.addCircle({ x: (input.hx[0] ?? 0) + (ux[i] ?? 0) * R0, y: (input.hy[0] ?? 0) + (uy[i] ?? 0) * R0, radius: 0.5, mass: b.mass, kinematic: true }));
  }
  for (let i = 0; i < n; i += 1) {
    bristleIds.push(
      world.addCircle({
        x: (input.hx[0] ?? 0) + (ux[i] ?? 0) * R0,
        y: (input.hy[0] ?? 0) + (uy[i] ?? 0) * R0,
        radius: r,
        mass: b.mass,
        linearDamping: b.dragMean * (drag[i] ?? 1),
        collideGroup: 1,
      }),
    );
  }
  for (let i = 0; i < n; i += 1) world.addSpring(slotIds[i] ?? 0, bristleIds[i] ?? 0, { restLength: 0, stiffness: k, damping: c });
  const buf = new Float32Array(2 * n * BODY_STATE_STRIDE);
  const pos = opts.capture ? new Float32Array((ticks + 1) * n * 2) : new Float32Array(0);
  const slot = opts.capture ? new Float32Array((ticks + 1) * n * 2) : new Float32Array(0);
  let finite = true;
  const record = (j: number): void => {
    const o = j * n * 2;
    for (let i = 0; i < n; i += 1) {
      const x = buf[(n + i) * BODY_STATE_STRIDE] ?? 0;
      const y = buf[(n + i) * BODY_STATE_STRIDE + 1] ?? 0;
      pos[o + i * 2] = x;
      pos[o + i * 2 + 1] = y;
      slot[o + i * 2] = buf[i * BODY_STATE_STRIDE] ?? 0;
      slot[o + i * 2 + 1] = buf[i * BODY_STATE_STRIDE + 1] ?? 0;
      if (!Number.isFinite(x) || !Number.isFinite(y)) finite = false;
    }
  };
  if (opts.capture) {
    world.readState(buf);
    record(0);
  }
  const t0 = opts.clock ? opts.clock.now() : 0;
  for (let j = 0; j < ticks; j += 1) {
    const rr = restRadius(input.pr[j + 1] ?? 0, b);
    for (let i = 0; i < n; i += 1) {
      world.setKinematicTarget(slotIds[i] ?? 0, (input.hx[j + 1] ?? 0) + (ux[i] ?? 0) * rr, (input.hy[j + 1] ?? 0) + (uy[i] ?? 0) * rr);
    }
    world.step(input.dts[j] ?? TICK_SEC);
    world.readState(buf);
    if (opts.capture) record(j + 1);
    else if (!Number.isFinite(buf[n * BODY_STATE_STRIDE] ?? 0)) finite = false;
  }
  const elapsedMs = opts.clock ? opts.clock.now() - t0 : 0;
  return { n, ticks, pos, slot, elapsedMs, usPerTick: (elapsedMs * 1000) / Math.max(1, ticks), finite, bristleRadius: r };
}
