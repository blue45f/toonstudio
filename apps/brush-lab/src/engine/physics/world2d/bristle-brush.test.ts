import { describe, expect, it } from "vitest";

import { PEN_SPRING_SUBSTEP_MS } from "../../input/stages/pen-spring";

import {
  BRISTLE_DEFAULTS,
  BRISTLE_MAX_COUNT,
  BristleBrush2D,
  bristleContactRadiusPx,
  bristleSpreadRadiusPx,
  fermatLayout,
  resolveBristleBrushConfig,
} from "./bristle-brush";
import { PbdWorld2D } from "./pbd-world";
import { bucklingPressureCurve, powerPressureCurve, PressureCurveTable } from "./pressure-curve";

import type { BristleBrushConfig, BristleTick, BristleTickSink } from "./bristle-brush";
import type { PhysicsWorld2D } from "./types";

const NOOP: BristleTickSink = { onTick: () => undefined };

function counting(): { sink: BristleTickSink; ticks: BristleTick[]; count: () => number } {
  const ticks: BristleTick[] = [];
  let n = 0;
  return {
    sink: {
      onTick: (t) => {
        n += 1;
        if (ticks.length < 4) ticks.push({ ...t });
      },
    },
    ticks,
    count: () => n,
  };
}

function make(partial: Partial<BristleBrushConfig> = {}, seed = 1, world: PhysicsWorld2D = new PbdWorld2D()): BristleBrush2D {
  return new BristleBrush2D(world, resolveBristleBrushConfig({ count: 32, radiusPx: 10, ...partial }), seed);
}

/** 정지 상태로 압력 p를 유지한 뒤 털끝의 평균 중심 거리(px). */
function holdMeanRadius(p: number, partial: Partial<BristleBrushConfig> = {}): number {
  const b = make(partial);
  b.begin(100, 100, 0, 0);
  b.advance(100, 100, 100, p, NOOP);
  b.advance(100, 100, 700, p, NOOP);
  const X = b.tipX();
  const Y = b.tipY();
  let sum = 0;
  for (let i = 0; i < b.count; i += 1) sum += Math.hypot((X[i] ?? 0) - 100, (Y[i] ?? 0) - 100);
  return sum / b.count;
}

describe("붓털 설정 검증(무음 보정 없음)", () => {
  it("기본 설정은 유효하고 부분 설정이 기본값 위에 얹힌다", () => {
    const c = resolveBristleBrushConfig();
    expect(c.count).toBe(BRISTLE_DEFAULTS.count);
    expect(c.spreadCurve.isMonotonic()).toBe(true);
    expect(resolveBristleBrushConfig({ count: 8 }).count).toBe(8);
  });

  it.each([
    ["털 수 0", { count: 0 }],
    ["털 수 소수", { count: 3.5 }],
    ["털 수 상한 초과", { count: BRISTLE_MAX_COUNT + 1 }],
    ["반경 0", { radiusPx: 0 }],
    ["고유 진동수 40 Hz", { fnHz: 40 }],
    ["음수 항력", { dragPerSec: -1 }],
    ["항력 편차 1", { dragJitter: 1 }],
    ["질량 0", { mass: 0 }],
    ["적재량 편차 -0.1", { loadJitter: -0.1 }],
    ["소진 길이 0", { loadDecayPx: 0 }],
    ["강성 단계 0", { stiffnessLevels: 0 }],
    ["손잡이 지연 0", { handleLagMs: 0 }],
    ["따라잡기 상한 한 틱 미만", { maxCatchUpMs: 1 }],
    ["NaN 반경", { radiusPx: Number.NaN }],
  ] as const)("잘못된 설정은 RangeError다: %s", (_name, partial) => {
    expect(() => resolveBristleBrushConfig(partial as Partial<BristleBrushConfig>)).toThrow(RangeError);
  });
});

describe("페르마 나선 배치", () => {
  it("모든 점이 단위 원 안에 있고 개수·결정성이 맞다", () => {
    const a = fermatLayout(128);
    const b = fermatLayout(128);
    expect(a.ux.length).toBe(128);
    for (let i = 0; i < 128; i += 1) {
      expect(Math.hypot(a.ux[i] ?? 9, a.uy[i] ?? 9)).toBeLessThanOrEqual(1);
    }
    expect(Array.from(a.ux)).toEqual(Array.from(b.ux));
    expect(Array.from(a.uy)).toEqual(Array.from(b.uy));
  });

  it("점 사이 최소 간격이 0보다 크다(겹친 점 없음)", () => {
    const { ux, uy } = fermatLayout(128);
    let min = Infinity;
    for (let i = 0; i < 128; i += 1) {
      for (let j = i + 1; j < 128; j += 1) min = Math.min(min, Math.hypot((ux[i] ?? 0) - (ux[j] ?? 0), (uy[i] ?? 0) - (uy[j] ?? 0)));
    }
    expect(min).toBeGreaterThan(0.03);
  });
});

describe("BristleBrush2D: 생명주기·시계", () => {
  it("begin 전 advance·settle·snapshot은 오류이고 begin은 한 번만 부른다", () => {
    const b = make();
    expect(() => b.advance(0, 0, 10, 0.5, NOOP)).toThrow();
    expect(() => b.settle(NOOP, 100)).toThrow();
    expect(() => b.snapshot(0.5)).toThrow();
    b.begin(0, 0, 0, 0.5);
    expect(() => b.begin(0, 0, 0, 0.5)).toThrow();
  });

  it("유한하지 않은 입력은 RangeError다", () => {
    const b = make();
    expect(() => b.begin(Number.NaN, 0, 0, 0.5)).toThrow(RangeError);
    b.begin(0, 0, 0, 0.5);
    expect(() => b.advance(0, 0, Number.POSITIVE_INFINITY, 0.5, NOOP)).toThrow(RangeError);
    expect(() => b.advance(0, 0, 10, Number.NaN, NOOP)).toThrow(RangeError);
  });

  it("고정 틱 1/240 s를 표본 시각으로 구동한다: 100 ms = 24틱, 표본 율과 무관하게 같은 틱 수", () => {
    const a = make();
    a.begin(0, 0, 0, 0.5);
    const ca = counting();
    a.advance(100, 0, 100, 0.5, ca.sink);
    expect(ca.count()).toBe(24);
    const b = make();
    b.begin(0, 0, 0, 0.5);
    const cb = counting();
    for (let t = 10; t <= 100; t += 10) b.advance(t, 0, t, 0.5, cb.sink);
    expect(cb.count()).toBe(24);
    expect(a.simTimeMs).toBeCloseTo(24 * PEN_SPRING_SUBSTEP_MS, 6);
  });

  it("시각이 같거나 거꾸로 가면 적분하지 않는다", () => {
    const b = make();
    b.begin(0, 0, 50, 0.5);
    const c = counting();
    expect(b.advance(10, 0, 50, 0.5, c.sink)).toBe(0);
    expect(b.advance(10, 0, 20, 0.5, c.sink)).toBe(0);
    expect(c.count()).toBe(0);
  });

  it("표본이 길게 건너뛰면 따라잡기 상한만 적분하고 나머지는 droppedTicks로 드러낸다", () => {
    const b = make({ maxCatchUpMs: 100 });
    b.begin(0, 0, 0, 0.5);
    const c = counting();
    const ran = b.advance(500, 0, 10_000, 0.5, c.sink);
    const maxTicks = Math.floor(100 / PEN_SPRING_SUBSTEP_MS);
    expect(ran).toBeLessThanOrEqual(maxTicks + 1);
    expect(ran).toBeGreaterThan(0);
    expect(b.diagnostics.droppedTicks).toBeGreaterThan(2000);
    expect(b.diagnostics.droppedTicks + b.diagnostics.ticks).toBe(Math.floor(10_000 / PEN_SPRING_SUBSTEP_MS + 1e-9));
    // 이후에도 유한한 상태를 유지한다.
    for (const v of b.tipX()) expect(Number.isFinite(v)).toBe(true);
  });

  it("틱 정보: 이전/현재 위치·적재량·압력 보간·시각을 싱크에 준다", () => {
    const b = make();
    b.begin(0, 0, 0, 0);
    const c = counting();
    b.advance(40, 0, 40, 1, c.sink);
    const first = c.ticks[0];
    expect(first?.count).toBe(32);
    expect(first?.pressure).toBeGreaterThan(0);
    expect(first?.pressure).toBeLessThan(0.2);
    expect(first?.tMs).toBeCloseTo(PEN_SPRING_SUBSTEP_MS, 6);
    expect(first?.spreadRadiusPx).toBeGreaterThan(0);
    for (const l of first?.load ?? []) {
      expect(l).toBeGreaterThan(0);
      expect(l).toBeLessThanOrEqual(1);
    }
  });
});

describe("BristleBrush2D: 압력 → 벌어짐·강성", () => {
  it("power-fit 곡선: 압력이 오르면 벌어짐 반경이 단조 증가한다", () => {
    const r = [0.1, 0.3, 0.5, 0.8].map((p) => holdMeanRadius(p));
    for (let i = 1; i < r.length; i += 1) expect(r[i] ?? 0).toBeGreaterThan(r[i - 1] ?? 0);
  });

  it("buckling-3d 곡선: 압력 0.9의 벌어짐이 0.7보다 작다(3D 좌굴의 비단조를 흉내)", () => {
    const curve = bucklingPressureCurve();
    const r07 = holdMeanRadius(0.7, { spreadCurve: curve });
    const r09 = holdMeanRadius(0.9, { spreadCurve: curve });
    expect(r09).toBeLessThan(r07 * 0.9);
    // 같은 조건의 단조 곡선은 반대로 커진다.
    const m07 = holdMeanRadius(0.7, { spreadCurve: powerPressureCurve() });
    const m09 = holdMeanRadius(0.9, { spreadCurve: powerPressureCurve() });
    expect(m09).toBeGreaterThan(m07);
  });

  it("spreadScaleCurve(BL-4a): 없으면 기존 식과 비트 동일하고, 있으면 슬롯 반경에 압력별로 곱해진다", () => {
    const plain = resolveBristleBrushConfig({ count: 32, radiusPx: 10 });
    expect(plain.spreadScaleCurve).toBeNull();
    for (const p of [0, 0.15, 0.4, 0.5, 1]) expect(bristleSpreadRadiusPx(plain, p)).toBe(Math.fround(10 * plain.spreadCurve.eval(p)));
    const scale = PressureCurveTable.fromKnots([
      [0, 0.1],
      [1, 2],
    ]);
    const scaled = resolveBristleBrushConfig({ count: 32, radiusPx: 10, spreadScaleCurve: scale });
    for (const p of [0, 0.15, 0.5, 1]) expect(bristleSpreadRadiusPx(scaled, p)).toBeCloseTo(10 * scaled.spreadCurve.eval(p) * scale.eval(p), 4);
    // 정지 유지 평균 반경도 같은 비율로 달라진다(월드 상태에 실제로 반영된다).
    const base = holdMeanRadius(0.5);
    const wide = holdMeanRadius(0.5, { spreadScaleCurve: PressureCurveTable.fromKnots([[0, 2], [1, 2]]) });
    expect(wide / base).toBeGreaterThan(1.7);
    expect(wide / base).toBeLessThan(2.3);
  });

  it("털 접촉 반경은 털이 많을수록 작다", () => {
    const radius = (n: number): number => bristleContactRadiusPx(resolveBristleBrushConfig({ count: n, radiusPx: 10 }));
    expect(radius(8)).toBeGreaterThan(radius(32));
    expect(radius(32)).toBeGreaterThan(radius(128));
  });

  it("강성은 단계가 바뀔 때만 월드에 알린다(압력 램프에서 단계 수 − 1회 이하)", () => {
    const levels = 6;
    const b = make({ stiffnessLevels: levels });
    b.begin(100, 100, 0, 0);
    b.advance(100, 100, 1000, 1, NOOP);
    expect(b.diagnostics.stiffnessUpdates).toBeGreaterThanOrEqual(1);
    expect(b.diagnostics.stiffnessUpdates).toBeLessThanOrEqual(levels - 1);
    // 압력이 일정하면 알리지 않는다.
    const steady = make({ stiffnessLevels: levels });
    steady.begin(100, 100, 0, 0.5);
    steady.advance(100, 100, 1000, 0.5, NOOP);
    expect(steady.diagnostics.stiffnessUpdates).toBe(0);
  });
});

describe("BristleBrush2D: 방향·끌림·물감", () => {
  it("손잡이는 끌린다: 일정 속도 추종에서 털끝 무게중심이 손잡이 뒤에 있다", () => {
    const b = make();
    b.begin(0, 100, 0, 0.5);
    for (let t = 20; t <= 800; t += 20) b.advance(t * 0.5, 100, t, 0.5, NOOP); // 500 px/s
    const h = b.handlePosition();
    const X = b.tipX();
    let mx = 0;
    for (let i = 0; i < b.count; i += 1) mx += X[i] ?? 0;
    mx /= b.count;
    expect(h?.x ?? 0).toBeGreaterThan(mx);
  });

  it("진행 방향이 90° 돌면 붓의 슬롯 배치도 같은 방향으로 약 90° 돈다(첫 방향 기준 상대 회전)", () => {
    const b = make({ stiffnessLevels: 1 });
    b.begin(0, 100, 0, 0.6);
    // 오른쪽으로 달리다가(+x) 아래로(+y) 꺾는다.
    let x = 0;
    let y = 100;
    let t = 0;
    for (let i = 0; i < 60; i += 1) {
      t += 10;
      x += 6;
      b.advance(x, y, t, 0.6, NOOP);
    }
    const angleOf = (idx: number): number => {
      const h = b.handlePosition() ?? { x: 0, y: 0 };
      return Math.atan2((b.tipY()[idx] ?? 0) - h.y, (b.tipX()[idx] ?? 0) - h.x);
    };
    // 바깥쪽 털 몇 개의 각도를 기록한다.
    const outer = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => 31 - i);
    const before = outer.map(angleOf);
    for (let i = 0; i < 60; i += 1) {
      t += 10;
      y += 6;
      b.advance(x, y, t, 0.6, NOOP);
    }
    const after = outer.map(angleOf);
    let sum = 0;
    for (let i = 0; i < outer.length; i += 1) {
      let d = (after[i] ?? 0) - (before[i] ?? 0);
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      sum += d;
    }
    const mean = (sum / outer.length) * (180 / Math.PI);
    expect(mean).toBeGreaterThan(55);
    expect(mean).toBeLessThan(125);
  });

  it("방위각(방향 벡터)을 주면 속도 대신 그 방향으로 돌고, 같은 입력은 같은 결과다", () => {
    const run = (): Float32Array => {
      const b = make();
      b.begin(50, 50, 0, 0.6);
      b.advance(50, 50, 100, 0.6, NOOP, 1, 0);
      b.advance(50, 50, 400, 0.6, NOOP, 0, 1);
      return Float32Array.from(b.tipX());
    };
    expect(Array.from(run())).toEqual(Array.from(run()));
    // 방위각이 없는 같은 입력과는 달라야 한다(속도가 0이라 방향이 정해지지 않음).
    const plain = make();
    plain.begin(50, 50, 0, 0.6);
    plain.advance(50, 50, 400, 0.6, NOOP);
    expect(Array.from(plain.tipX())).not.toEqual(Array.from(run()));
  });

  it("적재량은 이동 거리에 따라 단조 소진되고 털마다 다르다", () => {
    const b = make({ loadDecayPx: 800 });
    b.begin(0, 100, 0, 0.6);
    const before = Float32Array.from(b.loads());
    let x = 0;
    let t = 0;
    const mean = (a: Float32Array): number => a.reduce((s, v) => s + v, 0) / a.length;
    const means: number[] = [mean(before)];
    for (let leg = 0; leg < 4; leg += 1) {
      for (let i = 0; i < 50; i += 1) {
        t += 10;
        x += 8; // 800 px/s
        b.advance(x, 100, t, 0.6, NOOP);
      }
      means.push(mean(b.loads()));
    }
    for (let i = 1; i < means.length; i += 1) expect(means[i] ?? 1).toBeLessThan(means[i - 1] ?? 0);
    // 1600 px 움직인 뒤(소진 길이 ≈ 2배) 평균 적재량은 절반 안팎이다.
    expect(means[4] ?? 0).toBeLessThan(0.5);
    expect(means[4] ?? 0).toBeGreaterThan(0.1);
    expect(new Set(Array.from(b.loads())).size).toBeGreaterThan(8);
    for (const l of b.loads()) expect(l).toBeGreaterThan(0);
  });

  it("settle은 포인터를 고정한 채 멈출 때까지(상한 안에서) 돌고 멈춘 뒤에는 0틱이다", () => {
    const b = make();
    b.begin(0, 100, 0, 0.6);
    for (let i = 1; i <= 30; i += 1) b.advance(i * 8, 100, i * 10, 0.6, NOOP);
    const ran = b.settle(NOOP, 600);
    expect(ran).toBeGreaterThan(0);
    expect(ran).toBeLessThanOrEqual(Math.round(600 / PEN_SPRING_SUBSTEP_MS));
    expect(b.maxTipSpeed()).toBeLessThan(1);
    expect(b.settle(NOOP, 600)).toBe(0);
    expect(b.settle(NOOP, 0)).toBe(0);
  });

  it("월드 구현을 모른다: 래핑한 월드로도 같은 결과이고, 쿨롱 마찰이 있을 때만 applyForce를 부른다", () => {
    const calls = { force: 0, setSpring: 0, steps: 0 };
    const spy = (inner: PhysicsWorld2D): PhysicsWorld2D => ({
      traits: inner.traits,
      get bodyCount() {
        return inner.bodyCount;
      },
      addCircle: (s) => inner.addCircle(s),
      setKinematicTarget: (b, x, y) => inner.setKinematicTarget(b, x, y),
      addSpring: (a, b, s) => inner.addSpring(a, b, s),
      setSpring: (sp, s) => {
        calls.setSpring += 1;
        inner.setSpring(sp, s);
      },
      applyForce: (b, fx, fy) => {
        calls.force += 1;
        inner.applyForce(b, fx, fy);
      },
      queryCircle: (x, y, r, out) => inner.queryCircle(x, y, r, out),
      step: (dt) => {
        calls.steps += 1;
        inner.step(dt);
      },
      readState: (out) => inner.readState(out),
      diagnostics: () => inner.diagnostics(),
      dispose: () => inner.dispose(),
    });
    const run = (partial: Partial<BristleBrushConfig>, wrap: boolean): Float32Array => {
      const world = wrap ? spy(new PbdWorld2D()) : new PbdWorld2D();
      const b = make(partial, 1, world);
      b.begin(0, 100, 0, 0.5);
      for (let i = 1; i <= 40; i += 1) b.advance(i * 6, 100, i * 10, 0.2 + 0.01 * i, NOOP);
      return Float32Array.from(b.tipX());
    };
    expect(Array.from(run({}, true))).toEqual(Array.from(run({}, false)));
    expect(calls.force).toBe(0);
    expect(calls.steps).toBeGreaterThan(90);
    run({ coulombPxPerSec2: 400 }, true);
    expect(calls.force).toBeGreaterThan(0);
    expect(calls.setSpring).toBeGreaterThan(0);
  });

  it("쿨롱 마찰이 있으면 같은 입력에서 털이 덜 멀리 끌린다(종이 마찰)", () => {
    const run = (coulomb: number): number => {
      const b = make({ coulombPxPerSec2: coulomb });
      b.begin(0, 100, 0, 0.5);
      b.advance(0, 100, 50, 0.5, NOOP);
      // 급가속 후 정지: 털의 관성 이동 거리를 비교한다.
      b.advance(120, 100, 100, 0.5, NOOP);
      b.advance(120, 100, 300, 0.5, NOOP);
      const X = b.tipX();
      let m = 0;
      for (let i = 0; i < b.count; i += 1) m += X[i] ?? 0;
      return m / b.count;
    };
    expect(run(0)).toBeGreaterThan(0);
    expect(run(20_000)).not.toBe(run(0));
  });

  it("같은 입력·시드는 같은 상태이고 시드가 다르면 달라진다(털별 항력·적재량 난수)", () => {
    const run = (seed: number): number[] => {
      const b = make({}, seed);
      b.begin(0, 100, 0, 0.6);
      for (let i = 1; i <= 40; i += 1) b.advance(i * 7, 100 + 20 * Math.sin(i / 5), i * 10, 0.6, NOOP);
      return [...Array.from(b.tipX()), ...Array.from(b.loads())];
    };
    expect(run(1)).toEqual(run(1));
    expect(run(1)).not.toEqual(run(2));
  });
});

describe("R-B-6 방향 갱신의 비유한 방위각 방어", () => {
  it("방위각 벡터의 제곱합이 유한하지 않으면(예: 1e200) 그 입력을 무시하고 방향이 NaN으로 굳지 않는다", () => {
    const b = make();
    b.begin(20, 100, 0, 0.6);
    // 속도 방향으로 첫 방향을 정한다.
    for (let i = 1; i <= 20; i += 1) b.advance(20 + i * 6, 100, i * 10, 0.6, NOOP);
    expect(() => b.advance(150, 100, 220, 0.6, NOOP, 1e200, 1e200)).not.toThrow();
    expect(() => b.advance(150, 100, 230, 0.6, NOOP, Number.POSITIVE_INFINITY, 0)).not.toThrow();
    // 이어지는 정상 입력도 던지지 않고 털끝이 유한하다.
    for (let i = 1; i <= 20; i += 1) b.advance(150 + i * 6, 100, 240 + i * 10, 0.6, NOOP, 0.5, 0.5);
    for (const v of b.tipX()) expect(Number.isFinite(v)).toBe(true);
    for (const v of b.tipY()) expect(Number.isFinite(v)).toBe(true);
  });
});
