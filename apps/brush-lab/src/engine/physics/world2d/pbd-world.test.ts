import { describe, expect, it } from "vitest";

import { Pcg32 } from "../../core/rng";

import { createPbdWorld, PBD_DEFAULT_CONTACT_ITERATIONS, PBD_DEFAULT_CONTACT_RELAXATION, PbdWorld2D } from "./pbd-world";
import { BODY_STATE_STRIDE } from "./types";

const DT = 1 / 240;

function state(world: PbdWorld2D): Float32Array {
  const out = new Float32Array(world.bodyCount * BODY_STATE_STRIDE);
  world.readState(out);
  return out;
}

function hashState(out: Float32Array): string {
  let h = 2166136261;
  const u32 = new Uint32Array(out.buffer, out.byteOffset, out.length);
  for (const v of u32) h = Math.imul(h ^ v, 16777619) >>> 0;
  return h.toString(16);
}

/** 키네매틱 슬롯 + 동적 원 + 영 길이 스프링 한 쌍. */
function slotAndBody(world: PbdWorld2D, x: number, y: number, opts: { drag?: number; k?: number; c?: number; group?: number; radius?: number } = {}): { slot: number; body: number; spring: number } {
  const slot = world.addCircle({ x, y, radius: 0.5, mass: 1, kinematic: true });
  const body = world.addCircle({ x, y, radius: opts.radius ?? 2, mass: 1, linearDamping: opts.drag ?? 0, collideGroup: opts.group ?? 1 });
  const spring = world.addSpring(slot, body, { restLength: 0, stiffness: opts.k ?? 7000, damping: opts.c ?? 0 });
  return { slot, body, spring };
}

describe("PbdWorld2D: 설정·입력 검증(무음 보정 없음)", () => {
  it("잘못된 옵션은 RangeError다", () => {
    expect(() => new PbdWorld2D({ contactIterations: -1 })).toThrow(RangeError);
    expect(() => new PbdWorld2D({ contactIterations: 1.5 })).toThrow(RangeError);
    expect(() => new PbdWorld2D({ contactRelaxation: 0 })).toThrow(RangeError);
    expect(() => new PbdWorld2D({ contactRelaxation: 1.2 })).toThrow(RangeError);
    expect(() => new PbdWorld2D({ maxSubstepSec: 0 })).toThrow(RangeError);
    expect(() => new PbdWorld2D({ maxSubsteps: 0 })).toThrow(RangeError);
  });

  it("기본값: 반복 6회·보정 0.12이고 traits가 자체 PBD를 밝힌다", () => {
    expect(PBD_DEFAULT_CONTACT_ITERATIONS).toBe(6);
    expect(PBD_DEFAULT_CONTACT_RELAXATION).toBe(0.12);
    const w = createPbdWorld();
    expect(w.traits.backendId).toBe("pbd");
    expect(w.traits.needsDispose).toBe(false);
    expect(w.bodyCount).toBe(0);
  });

  it("몸체·스프링·dt 입력 오류를 던진다", () => {
    const w = new PbdWorld2D();
    expect(() => w.addCircle({ x: Number.NaN, y: 0, radius: 1, mass: 1 })).toThrow(RangeError);
    expect(() => w.addCircle({ x: 0, y: 0, radius: -1, mass: 1 })).toThrow(RangeError);
    expect(() => w.addCircle({ x: 0, y: 0, radius: 1, mass: 0 })).toThrow(RangeError);
    expect(() => w.addCircle({ x: 0, y: 0, radius: 1, mass: 1, linearDamping: -1 })).toThrow(RangeError);
    const { slot, body, spring } = slotAndBody(w, 0, 0);
    expect(() => w.setKinematicTarget(body, 1, 1)).toThrow(RangeError);
    expect(() => w.setKinematicTarget(slot, Number.NaN, 1)).toThrow(RangeError);
    expect(() => w.setKinematicTarget(99, 1, 1)).toThrow(RangeError);
    expect(() => w.addSpring(0, 99, { restLength: 0, stiffness: 1, damping: 0 })).toThrow(RangeError);
    expect(() => w.addSpring(slot, body, { restLength: -1, stiffness: 1, damping: 0 })).toThrow(RangeError);
    expect(() => w.setSpring(spring + 5, { restLength: 0, stiffness: 1, damping: 0 })).toThrow(RangeError);
    expect(() => w.step(0)).toThrow(RangeError);
    expect(() => w.step(Number.NaN)).toThrow(RangeError);
    expect(() => w.readState(new Float32Array(3))).toThrow(RangeError);
  });
});

describe("PbdWorld2D: 스프링·항력 동역학", () => {
  it("영 길이 스프링은 동적 원을 kinematic 목표로 끌어당겨 수렴한다", () => {
    const w = new PbdWorld2D();
    const { slot, body } = slotAndBody(w, 0, 0, { drag: 40, c: 2 * 0.5 * Math.sqrt(7000) });
    w.setKinematicTarget(slot, 30, -12);
    for (let i = 0; i < 480; i += 1) w.step(DT);
    const s = state(w);
    expect(s[body * 4]).toBeCloseTo(30, 1);
    expect(s[body * 4 + 1]).toBeCloseTo(-12, 1);
    expect(Math.hypot(s[body * 4 + 2] ?? 0, s[body * 4 + 3] ?? 0)).toBeLessThan(0.5);
  });

  it("일정 속도 추종의 끌림 오프셋이 이론 λ·v/k와 5% 이내로 맞는다(지면 항력이 끌림을 만든다)", () => {
    const k = 7000;
    const drag = 45;
    const v = 600; // px/s
    const w = new PbdWorld2D();
    const { slot, body } = slotAndBody(w, 0, 0, { drag, k, c: 0 });
    let x = 0;
    for (let i = 0; i < 480; i += 1) {
      x += v * DT;
      w.setKinematicTarget(slot, x, 0);
      w.step(DT);
    }
    const bx = state(w)[body * 4] ?? 0;
    const lag = x - bx;
    const expected = (drag * v) / k;
    expect(Math.abs(lag - expected) / expected).toBeLessThan(0.05);
  });

  it("상대 감쇠만 있으면 일정 속도 추종에서 끌림이 거의 없다(SP-A 발견)", () => {
    const w = new PbdWorld2D();
    const { slot, body } = slotAndBody(w, 0, 0, { drag: 0, k: 7000, c: 2 * 0.5 * Math.sqrt(7000) });
    let x = 0;
    for (let i = 0; i < 480; i += 1) {
      x += 600 * DT;
      w.setKinematicTarget(slot, x, 0);
      w.step(DT);
    }
    expect(Math.abs(x - (state(w)[body * 4] ?? 0))).toBeLessThan(0.7);
  });

  it("setSpring이 강성·휴지 길이를 바꾼다: 휴지 길이 10이면 목표에서 10 px 떨어져 멈춘다", () => {
    const w = new PbdWorld2D({ contactIterations: 0 });
    const { slot, body, spring } = slotAndBody(w, 0, 0, { drag: 40, k: 7000, c: 100 });
    w.setKinematicTarget(slot, 0, 0);
    w.setSpring(spring, { restLength: 10, stiffness: 7000, damping: 100 });
    // 몸체를 목표 위(거리 0)에서 시작하면 방향이 정의되지 않으므로 먼저 약간 떼어 놓는다.
    w.applyForce(body, 1, 0);
    w.step(DT);
    for (let i = 0; i < 960; i += 1) w.step(DT);
    const s = state(w);
    expect(Math.hypot(s[body * 4] ?? 0, s[body * 4 + 1] ?? 0)).toBeCloseTo(10, 1);
  });

  it("applyForce는 다음 step 한 번에만 적용되고 누적된다", () => {
    const w = new PbdWorld2D({ contactIterations: 0 });
    const b = w.addCircle({ x: 0, y: 0, radius: 1, mass: 2 });
    w.applyForce(b, 10, 0);
    w.applyForce(b, 6, 0);
    w.step(DT);
    const v1 = state(w)[b * 4 + 2] ?? 0;
    expect(v1).toBeCloseTo((16 / 2) * DT, 5);
    w.step(DT);
    const v2 = state(w)[b * 4 + 2] ?? 0;
    // 두 번째 step에는 힘이 없다 → 속도 유지.
    expect(v2).toBeCloseTo(v1, 6);
  });
});

describe("PbdWorld2D: 접촉", () => {
  it("같은 그룹의 두 원이 강하게 눌려도 보정 1·반복 8이면 반경 합에 가깝게 비침투다", () => {
    const w = new PbdWorld2D({ contactIterations: 8, contactRelaxation: 1 });
    const a = slotAndBody(w, 0, 0, { k: 12000, radius: 3, drag: 60, c: Math.sqrt(12000) });
    const b = slotAndBody(w, 10, 0, { k: 12000, radius: 3, drag: 60, c: Math.sqrt(12000) });
    w.setKinematicTarget(a.slot, 5, 0);
    w.setKinematicTarget(b.slot, 5.5, 0);
    for (let i = 0; i < 120; i += 1) w.step(DT);
    const s = state(w);
    const d = Math.hypot((s[b.body * 4] ?? 0) - (s[a.body * 4] ?? 0), (s[b.body * 4 + 1] ?? 0) - (s[a.body * 4 + 1] ?? 0));
    expect(d).toBeGreaterThan(6 * 0.97);
  });

  it("다른 충돌 그룹(또는 그룹 0)은 서로 통과한다", () => {
    const w = new PbdWorld2D({ contactIterations: 8, contactRelaxation: 1 });
    const a = slotAndBody(w, 0, 0, { k: 12000, radius: 3, group: 1, drag: 60, c: Math.sqrt(12000) });
    const b = slotAndBody(w, 10, 0, { k: 12000, radius: 3, group: 2, drag: 60, c: Math.sqrt(12000) });
    w.setKinematicTarget(a.slot, 5, 0);
    w.setKinematicTarget(b.slot, 5.2, 0);
    for (let i = 0; i < 120; i += 1) w.step(DT);
    const s = state(w);
    const d = Math.abs((s[b.body * 4] ?? 0) - (s[a.body * 4] ?? 0));
    expect(d).toBeLessThan(1);
  });

  it("x 정렬 스윕의 접촉 후보 쌍 수가 전수 검사와 같다", () => {
    const rng = new Pcg32(7, 3);
    const w = new PbdWorld2D({ contactIterations: 1 });
    const n = 60;
    const radius = 2;
    const pos: [number, number][] = [];
    for (let i = 0; i < n; i += 1) {
      const x = rng.nextF32() * 40;
      const y = rng.nextF32() * 40;
      pos.push([Math.fround(x), Math.fround(y)]);
      w.addCircle({ x, y, radius, mass: 1, collideGroup: 1 });
    }
    w.step(DT);
    const margin = 0.6 * radius;
    let brute = 0;
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const dx = (pos[j]?.[0] ?? 0) - (pos[i]?.[0] ?? 0);
        const dy = (pos[j]?.[1] ?? 0) - (pos[i]?.[1] ?? 0);
        const rr = 2 * radius + Math.fround(margin);
        if (dx * dx + dy * dy < rr * rr) brute += 1;
      }
    }
    expect(brute).toBeGreaterThan(20);
    expect(w.lastPairCount()).toBe(brute);
  });

  it("queryCircle은 겹치는 동적 몸체만 번호순으로 돌려주고 kinematic은 건너뛴다", () => {
    const w = new PbdWorld2D();
    const k = w.addCircle({ x: 0, y: 0, radius: 5, mass: 1, kinematic: true });
    const a = w.addCircle({ x: 1, y: 0, radius: 1, mass: 1 });
    const b = w.addCircle({ x: 20, y: 0, radius: 1, mass: 1 });
    const c = w.addCircle({ x: 3, y: 1, radius: 1, mass: 1 });
    const out: number[] = [99];
    const n = w.queryCircle(0, 0, 2.5, out);
    expect(n).toBe(2);
    expect(out).toEqual([a, c]);
    expect(out).not.toContain(k);
    expect(out).not.toContain(b);
  });
});

describe("PbdWorld2D: dt 분할·결정성·진단", () => {
  it("큰 dt는 서브스텝으로 균등 분할하고 kinematic 목표는 구간에 걸쳐 보간한다", () => {
    const w = new PbdWorld2D();
    const { slot } = slotAndBody(w, 0, 0, { k: 7000, c: 100 });
    w.setKinematicTarget(slot, 100, 0);
    w.step(0.1);
    expect(w.counters.substeps).toBe(Math.ceil(0.1 / (1 / 240 + 1e-6) - 1e-9));
    expect(w.counters.oversizeSteps).toBe(0);
    // kinematic은 끝 목표에 정확히 도달한다.
    expect(state(w)[slot * 4]).toBeCloseTo(100, 3);
  });

  it("분할 상한을 넘는 dt는 상한에서 멈추고 oversizeSteps로 드러낸다", () => {
    const w = new PbdWorld2D({ maxSubsteps: 4 });
    slotAndBody(w, 0, 0);
    w.step(1);
    expect(w.counters.substeps).toBe(4);
    expect(w.counters.oversizeSteps).toBe(1);
    expect(w.diagnostics()).toMatchObject({ steps: 1, substeps: 4, oversizeSteps: 1, nonFiniteResets: 0 });
  });

  it("100 ms 스파이크(분할 켬)에서도 NaN이 없고 털이 목표에서 폭주하지 않는다", () => {
    const w = new PbdWorld2D();
    const { slot, body } = slotAndBody(w, 0, 0, { drag: 45, k: 7737, c: 2 * 0.15 * Math.sqrt(7737) });
    let x = 0;
    for (let i = 0; i < 100; i += 1) {
      x += 1.5;
      w.setKinematicTarget(slot, x, 0);
      w.step(i === 50 ? 0.1 : DT);
      x += i === 50 ? 20 : 0;
    }
    const s = state(w);
    expect(Number.isFinite(s[body * 4] ?? Number.NaN)).toBe(true);
    expect(Math.abs((s[body * 4] ?? 0) - x)).toBeLessThan(60);
    expect(w.counters.nonFiniteResets).toBe(0);
  });

  it("같은 입력은 같은 상태 해시를 낸다(순서·난수 의존 없음)", () => {
    const run = (): string => {
      const w = new PbdWorld2D();
      const rng = new Pcg32(11, 5);
      const slots: number[] = [];
      for (let i = 0; i < 24; i += 1) {
        const ang = i * 0.7;
        slots.push(slotAndBody(w, 20 * Math.cos(ang), 20 * Math.sin(ang), { drag: 30 + 20 * rng.nextF32(), radius: 3 }).slot);
      }
      for (let t = 0; t < 300; t += 1) {
        for (let i = 0; i < slots.length; i += 1) {
          const ang = i * 0.7 + t * 0.01;
          w.setKinematicTarget(slots[i] ?? 0, 50 + t * 0.3 + 12 * Math.cos(ang), 12 * Math.sin(ang));
        }
        w.step(DT);
      }
      return hashState(state(w));
    };
    expect(run()).toBe(run());
  });

  it("dispose 뒤에는 몸체가 비고 step이 던지지 않는다", () => {
    const w = new PbdWorld2D();
    slotAndBody(w, 0, 0);
    w.dispose();
    expect(w.bodyCount).toBe(0);
    expect(() => w.step(DT)).not.toThrow();
  });
});
