import { describe, expect, it } from "vitest";

import { Pcg32 } from "../../core/rng";
import { lineStroke, zigzagStroke } from "../../testing/synthetic-strokes";

import { PaintEmitter, pressureWidth } from "./emitter";
import { MPM_CFL_LIMIT, MPM_DEFAULTS, mpmCfl, mpmWaveSpeed, resolveMpmParams, substepsForCfl } from "./params";
import { Mpm2D } from "./solver";

import type { EmitterConfig } from "./emitter";
import type { MpmParams } from "./params";
import type { RawSample } from "../../core/types";

const EMIT: EmitterConfig = {
  rowSpacingPx: 1.2,
  acrossSpacingPx: 1.2,
  widthAtPressure: pressureWidth(6, 12),
  velocityGain: 0.1,
  initialJ: 0.95,
  jitter: 0.5,
  conc: 0,
};

function drawStroke(sim: Mpm2D, samples: readonly RawSample[], seed: number, cfg: EmitterConfig = EMIT): void {
  const emitter = new PaintEmitter(cfg);
  emitter.begin(seed);
  for (const s of samples) emitter.push(sim, { x: s.x, y: s.y, tMs: s.tMs, pressure: s.pressure });
  emitter.finish(sim);
}

function inDomain(sim: Mpm2D): boolean {
  const { widthPx, heightPx } = sim.params;
  for (let i = 0; i < sim.count; i += 1) {
    if (!(sim.x[i] >= 0 && sim.x[i] <= widthPx && sim.y[i] >= 0 && sim.y[i] <= heightPx)) return false;
  }
  return true;
}

const LINE = lineStroke(12, 40, 100, 52, 0.7, { durationMs: 260 });

describe("MPM 파라미터", () => {
  it("기본 설정의 CFL은 상한보다 한참 아래이고 서브스텝 수는 8이다", () => {
    const p = resolveMpmParams(128, 128);
    expect(p.cellPx).toBe(2);
    expect(mpmWaveSpeed(p)).toBeCloseTo(Math.sqrt(1e5), 6);
    expect(mpmCfl(p)).toBeLessThan(MPM_CFL_LIMIT * 0.6);
    expect(substepsForCfl(p, 1 / 60)).toBe(8);
    // 강성이 4배 커지면(음속 2배) 서브스텝도 대략 2배가 필요하다.
    expect(substepsForCfl({ ...p, bulk: p.bulk * 4, shear: p.shear * 4 }, 1 / 60)).toBe(16);
  });

  it("틀린 값은 무음 보정 없이 던진다", () => {
    expect(() => resolveMpmParams(6, 128)).toThrow(/셀 4개/);
    expect(() => resolveMpmParams(128, 128, { dtS: 0 })).toThrow(/dtS/);
    expect(() => resolveMpmParams(128, 128, { bulk: Number.NaN })).toThrow(/bulk/);
    expect(() => resolveMpmParams(128, 128, { maxParticles: 1.5 })).toThrow(/maxParticles/);
    expect(() => resolveMpmParams(128, 128, { wallFriction: 2 })).toThrow(/wallFriction/);
    expect(() => resolveMpmParams(128, 128, { dragPerS: -1 })).toThrow(/dragPerS/);
    expect(() => resolveMpmParams(100000, 100000)).toThrow(/격자 노드/);
    try {
      resolveMpmParams(128, 128, { rho: 0 });
      expect.unreachable("던져야 한다");
    } catch (error) {
      expect(error).toMatchObject({ code: "mpm-params-invalid" });
    }
  });
});

describe("MPM 결정성", () => {
  it("같은 시드·같은 입력을 두 번 돌리면 상태 해시가 같고 시드가 다르면 다르다", () => {
    const run = (seed: number): string => {
      const sim = new Mpm2D(resolveMpmParams(128, 96));
      drawStroke(sim, LINE, seed);
      sim.settle(200, 1);
      return sim.stateHash();
    };
    const a = run(7);
    const b = run(7);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(run(8)).not.toBe(a);
  });

  it("회귀 고정: 방출기 + 솔버 작은 장면의 상태 해시(IEEE 사칙·sqrt만 쓰므로 엔진이 같으면 비트 동일)", () => {
    const sim = new Mpm2D(resolveMpmParams(64, 48));
    drawStroke(sim, lineStroke(8, 24, 56, 24, 0.8, { durationMs: 120 }), 1);
    sim.settle(100, 0.5);
    // 값이 바뀌면 방출기나 솔버 수치가 바뀐 것이다: 의도한 변경인지 확인한 뒤에만 갱신한다(마개·부채꼴 추가, 벽 두 겹 경계로 두 번 갱신했다).
    expect({ count: sim.count, steps: sim.counters.steps, hash: sim.stateHash() }).toEqual({ count: 433, steps: 158, hash: "803c67408765c3b1" });
  });

  it("서브스텝 진행은 시계로 결정된다: 한 번에 가나 잘게 나눠 가나 같은 스텝 수·같은 상태", () => {
    const make = (): Mpm2D => {
      const sim = new Mpm2D(resolveMpmParams(64, 64));
      sim.startClock(100);
      for (let i = 0; i < 40; i += 1) sim.inject(20 + (i % 8) * 1.2, 30 + Math.floor(i / 8) * 1.2, 0, 0, 0, 0.9);
      return sim;
    };
    const dtMs = resolveMpmParams(64, 64).dtS * 1000;
    const whole = make();
    expect(whole.advanceTo(100 + dtMs * 50.5)).toBe(50);
    const parts = make();
    let n = 0;
    for (let k = 1; k <= 10; k += 1) n += parts.advanceTo(100 + dtMs * 5.05 * k);
    expect(n).toBe(50);
    expect(parts.stateHash()).toBe(whole.stateHash());
    // 과거 시각은 아무것도 하지 않는다.
    expect(whole.advanceTo(0)).toBe(0);
    expect(whole.counters.steps).toBe(50);
  });
});

describe("MPM 질량 보존·입자 한도", () => {
  it("주입 − 소거 = 입자 수이고 격자 질량 합이 입자 질량 합과 같다", () => {
    const sim = new Mpm2D(resolveMpmParams(128, 96));
    drawStroke(sim, LINE, 3);
    sim.advanceTo(400);
    const c = sim.counters;
    expect(c.injected - c.removed).toBe(sim.count);
    expect(sim.count).toBeGreaterThan(100);
    // 직전 서브스텝의 P2G 질량: 가중치 합이 1이라 입자 질량 합과 같다(부동소수 오차 이내).
    const particleMass = sim.count * sim.particleMass;
    expect(Math.abs(sim.totalGridMass() - particleMass) / particleMass).toBeLessThan(1e-9);
    const before = sim.count;
    sim.clear();
    expect(sim.count).toBe(0);
    expect(sim.counters.removed).toBe(before);
    expect(sim.counters.injected - sim.counters.removed).toBe(0);
    expect(sim.totalGridMass()).toBe(0);
  });

  it("입자 한도에 닿으면 주입을 멈추고 거절 수를 센다(무음 절단 없음)", () => {
    const sim = new Mpm2D(resolveMpmParams(128, 96, { maxParticles: 50 }));
    let ok = 0;
    for (let i = 0; i < 80; i += 1) if (sim.inject(30 + (i % 10) * 1.2, 30 + Math.floor(i / 10) * 1.2, 0, 0, 0) === "ok") ok += 1;
    expect(ok).toBe(50);
    expect(sim.count).toBe(50);
    expect(sim.counters.injected).toBe(50);
    expect(sim.counters.rejectedCapacity).toBe(30);
    // 한도에 닿은 뒤에도 돌아가며 질량이 유지된다.
    sim.advanceTo(50);
    expect(sim.count).toBe(50);
    expect(sim.health().nonFinite).toBe(0);
  });

  it("영역 밖·비유한 입력은 만들지 않고 이유를 돌려준다", () => {
    const sim = new Mpm2D(resolveMpmParams(64, 64));
    expect(sim.inject(-5, 10, 0, 0, 0)).toBe("outside");
    expect(sim.inject(10, 1000, 0, 0, 0)).toBe("outside");
    expect(sim.inject(Number.NaN, 10, 0, 0, 0)).toBe("invalid");
    expect(sim.inject(10, 10, Number.POSITIVE_INFINITY, 0, 0)).toBe("invalid");
    expect(sim.inject(10, 10, 0, 0, Number.NaN)).toBe("invalid");
    expect(sim.count).toBe(0);
    expect(sim.counters).toMatchObject({ rejectedOutside: 2, rejectedInvalid: 3, injected: 0 });
  });
});

describe("MPM 퍼징: 어떤 입력에서도 NaN·무한대가 없다", () => {
  it("극단적인 위치·속도·농도·체적비·시각을 섞어도 상태는 유한하고 영역 안이다", () => {
    const rng = new Pcg32(20261008, 5);
    const pick = (): number => {
      const r = rng.nextU32() % 12;
      if (r === 0) return Number.NaN;
      if (r === 1) return Number.POSITIVE_INFINITY;
      if (r === 2) return Number.NEGATIVE_INFINITY;
      if (r === 3) return (rng.nextF32() - 0.5) * 1e12;
      if (r === 4) return 0;
      return (rng.nextF32() - 0.5) * 400;
    };
    const sim = new Mpm2D(resolveMpmParams(96, 96, { maxParticles: 600 }));
    let requests = 0;
    for (let round = 0; round < 12; round += 1) {
      for (let k = 0; k < 120; k += 1) {
        requests += 1;
        // 위치는 대체로 영역 안(나머지는 거절 경로 시험), 속도·농도·체적비는 극단까지.
        const x = rng.nextU32() % 5 === 0 ? pick() : 8 + rng.nextF32() * 80;
        const y = rng.nextU32() % 5 === 0 ? pick() : 8 + rng.nextF32() * 80;
        sim.inject(x, y, pick() * 10, pick() * 10, pick(), 0.5 + (pick() % 7));
      }
      for (let s = 0; s < 40; s += 1) sim.step();
      const h = sim.health();
      expect(h.nonFinite, `라운드 ${round}`).toBe(0);
      expect(inDomain(sim), `라운드 ${round}: 영역 안`).toBe(true);
      expect(h.maxSpeed).toBeLessThanOrEqual(sim.speedLimit * (1 + 1e-9));
      for (let i = 0; i < sim.count; i += 1) {
        expect(sim.conc[i] >= 0 && sim.conc[i] <= 1).toBe(true);
      }
      if (round % 4 === 3) sim.clear();
    }
    const c = sim.counters;
    // 모든 요청은 주입되었거나 이유와 함께 거절됐다(사라진 요청이 없다).
    expect(c.injected + c.rejectedCapacity + c.rejectedOutside + c.rejectedInvalid).toBe(requests);
    expect(c.injected - c.removed).toBe(sim.count);
    expect(Number.isFinite(sim.kineticEnergy())).toBe(true);
  });

  it("시각이 비유한이면 던지고, 건너뛸 만큼 큰 점프는 상한까지만 진행하고 센다", () => {
    const sim = new Mpm2D(resolveMpmParams(64, 64, { maxStepsPerAdvance: 100 }));
    sim.startClock(0);
    sim.inject(32, 32, 0, 0, 0);
    expect(() => sim.advanceTo(Number.NaN)).toThrow(RangeError);
    expect(() => sim.startClock(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    const dtMs = sim.params.dtS * 1000;
    expect(sim.advanceTo(dtMs * 100_000)).toBe(100);
    expect(sim.counters.droppedSubsteps).toBe(100_000 - 100);
    expect(sim.counters.steps).toBe(100);
    // 시계는 건너뛴 만큼 앞으로 가 있다.
    expect(sim.clockMs).toBeCloseTo(dtMs * 100_000, 6);
  });
});

describe("MPM 작업 예산·활성 격자 (MP-2)", () => {
  it("작업 예산(입자-스텝)이 바닥나면 남은 서브스텝은 진행하지 않고 건너뛰며 시계는 앞으로 가고 센다", () => {
    const sim = new Mpm2D(resolveMpmParams(64, 64));
    sim.startClock(0);
    for (let i = 0; i < 100; i += 1) sim.inject(20 + (i % 10) * 2, 20 + Math.floor(i / 10) * 2, 0, 0, 0);
    const dtMs = sim.params.dtS * 1000;
    // 입자 100개 × 7스텝 = 700 입자-스텝이면 충분. 10스텝을 요청하면 7스텝만 진행하고 3스텝을 건너뛴다.
    sim.setWorkBudget(750);
    expect(sim.advanceTo(dtMs * 10)).toBe(7);
    expect(sim.counters.steps).toBe(7);
    expect(sim.counters.droppedSubsteps).toBe(3);
    expect(sim.counters.budgetDroppedSubsteps).toBe(3);
    expect(sim.workBudgetLeft).toBe(50);
    // 시계는 요청한 시각까지 가 있으므로 같은 시각을 다시 요청해도 더 진행하지 않는다(건너뛴 시간을 되갚지 않는다).
    expect(sim.advanceTo(dtMs * 10)).toBe(0);
    expect(sim.clockMs).toBeCloseTo(dtMs * 10, 6);
    // 예산을 다시 주면 그 시점부터 정상 진행한다.
    sim.setWorkBudget(Number.POSITIVE_INFINITY);
    expect(sim.advanceTo(dtMs * 14)).toBe(4);
    expect(sim.counters.budgetDroppedSubsteps).toBe(3);
  });

  it("예산을 정하지 않으면 무제한이고(기존 동작), 잘못된 값은 던진다", () => {
    const sim = new Mpm2D(resolveMpmParams(64, 64));
    expect(sim.workBudgetLeft).toBe(Number.POSITIVE_INFINITY);
    sim.startClock(0);
    sim.inject(32, 32, 0, 0, 0);
    expect(sim.advanceTo(sim.params.dtS * 1000 * 50.5)).toBe(50);
    expect(sim.counters.budgetDroppedSubsteps).toBe(0);
    expect(() => sim.setWorkBudget(-1)).toThrow(RangeError);
    expect(() => sim.setWorkBudget(Number.NaN)).toThrow(RangeError);
  });

  it("입자가 없으면 스텝은 예산을 쓰지 않는다", () => {
    const sim = new Mpm2D(resolveMpmParams(64, 64));
    sim.startClock(0);
    sim.setWorkBudget(0);
    expect(sim.advanceTo(sim.params.dtS * 1000 * 5)).toBe(5);
    expect(sim.counters.budgetDroppedSubsteps).toBe(0);
  });

  it("캔버스 양끝에 떨어진 두 덩어리는 사이의 빈 격자가 아니라 입자가 닿은 타일만 일한다", () => {
    const sim = new Mpm2D(resolveMpmParams(1024, 640));
    for (let k = 0; k < 20; k += 1) {
      sim.inject(20 + (k % 5) * 1.2, 20 + Math.floor(k / 5) * 1.2, 0, 0, 0, 0.95);
      sim.inject(1000 - (k % 5) * 1.2, 620 - Math.floor(k / 5) * 1.2, 0, 0, 0, 0.95);
    }
    sim.step();
    const grid = sim.activeGrid();
    // 경계 상자로 훑으면 (약 500 × 310 = 15만) 노드다. 타일 추적은 두 덩어리 근처(각 몇 타일)만 훑는다.
    expect(grid.nodes).toBeLessThan(600);
    expect(grid.tiles).toBeGreaterThanOrEqual(2);
    // 일은 줄었지만 질량은 그대로 보존된다.
    expect(sim.totalGridMass()).toBeCloseTo(sim.count * sim.particleMass, 9);
    // 빈 상태(clear)에서는 활성 타일이 없다.
    sim.clear();
    expect(sim.activeGrid()).toEqual({ tiles: 0, nodes: 0 });
  });
});

describe("MPM 안정성: CFL", () => {
  it("기본 설정은 CFL 위반이 아니고 클램프가 한 번도 발동하지 않는다", () => {
    const sim = new Mpm2D(resolveMpmParams(128, 128));
    expect(sim.cflViolation).toBe(false);
    drawStroke(sim, zigzagStroke(128, { durationMs: 500 }), 2);
    sim.settle(300, 1);
    expect(sim.clampEvents).toBe(0);
    expect(sim.counters).toMatchObject({ clampPosition: 0, clampVelocity: 0, clampDeformation: 0 });
    const h = sim.health();
    expect(h.nonFinite).toBe(0);
    expect(h.minJ).toBeGreaterThan(0.85);
    expect(h.maxJ).toBeLessThan(1.15);
  });

  it("종이 가장자리에 붙여 그려도(마개가 벽에 닿아도) 위치 클램프가 발동하지 않는다", () => {
    // 경계 노드 한 겹만 막던 시절에는 벽 바로 앞 입자가 안쪽 노드의 속도에 밀려 클램프에 닿았다(측정: 클램프 6회).
    const sim = new Mpm2D(resolveMpmParams(96, 64));
    drawStroke(sim, lineStroke(8, 30, 88, 36, 0.8, { durationMs: 250 }), 1, { ...EMIT, widthAtPressure: pressureWidth(14, 16) });
    sim.settle(300, 1);
    expect(sim.counters.rejectedOutside).toBeGreaterThan(0);
    expect(sim.counters.clampPosition).toBe(0);
    expect(sim.clampEvents).toBe(0);
  });

  it("CFL을 크게 넘기면 cflViolation이 켜지고 clampEvents가 늘지만 NaN 없이 영역 안에 머문다", () => {
    // 서브스텝을 프레임당 2개로 줄여(dt 8.3ms) CFL ≈ 1.3으로 만든다.
    const params = resolveMpmParams(128, 96, { dtS: 1 / 60 / 2 });
    expect(mpmCfl(params)).toBeGreaterThan(MPM_CFL_LIMIT * 2);
    const sim = new Mpm2D(params);
    expect(sim.cflViolation).toBe(true);
    drawStroke(sim, LINE, 1);
    sim.settle(100, 1);
    expect(sim.clampEvents).toBeGreaterThan(0);
    const h = sim.health();
    expect(h.nonFinite).toBe(0);
    expect(inDomain(sim)).toBe(true);
    expect(h.maxSpeed).toBeLessThanOrEqual(sim.speedLimit * (1 + 1e-9));
    expect(Number.isFinite(h.kineticEnergy)).toBe(true);
  });

  it("펜 속도를 그대로 입자에 주면(음속 근처) 속도 클램프가 이를 드러낸다", () => {
    const sim = new Mpm2D(resolveMpmParams(128, 96));
    // 초기 속도 1e5 px/s: 한 서브스텝에 반 셀을 훨씬 넘는다.
    expect(sim.inject(60, 48, 1e5, 0, 0)).toBe("ok");
    expect(sim.counters.clampVelocity).toBe(1);
    expect(Math.hypot(sim.vx[0], sim.vy[0])).toBeCloseTo(sim.speedLimit, 6);
  });
});

describe("MPM 점탄성·정착", () => {
  /** 정착 뒤 입자 분포의 xy 공분산 크기(전단 변형이 남았는지의 척도). */
  function sheared(params: Partial<MpmParams>): number {
    const sim = new Mpm2D(resolveMpmParams(96, 96, { dragPerS: 40, ...params }));
    // 정사각 블록에 전단 속도장(vx ∝ y)을 준다.
    for (let j = 0; j < 20; j += 1) {
      for (let i = 0; i < 20; i += 1) {
        sim.inject(38 + i * 1.2, 38 + j * 1.2, (j - 9.5) * 2.5, 0, 0, 1);
      }
    }
    sim.settle(1500, 0.05);
    let mx = 0;
    let my = 0;
    for (let i = 0; i < sim.count; i += 1) {
      mx += sim.x[i];
      my += sim.y[i];
    }
    mx /= sim.count;
    my /= sim.count;
    let cxy = 0;
    for (let i = 0; i < sim.count; i += 1) cxy += (sim.x[i] - mx) * (sim.y[i] - my);
    return Math.abs(cxy / sim.count);
  }

  it("항복·이완이 있는 물감은 전단 변형을 간직하고 순수 탄성은 되돌아간다", () => {
    const elastic = sheared({ relaxTimeS: 0, yieldStrain: 1e9 });
    const paint = sheared({ relaxTimeS: 0.02, yieldStrain: 0.05 });
    // 측정: 탄성 0.007 대비 물감 1.5(약 200배). 여유를 두고 20배를 요구한다.
    expect(paint).toBeGreaterThan(Math.max(elastic * 20, 0.3));
  });

  it("settle은 임계 이하로 가라앉으면 settled, 스텝이 모자라면 settled:false로 드러낸다", () => {
    const make = (): Mpm2D => {
      const sim = new Mpm2D(resolveMpmParams(96, 64));
      drawStroke(sim, lineStroke(10, 30, 80, 34, 0.9, { durationMs: 150 }), 4);
      return sim;
    };
    const quick = make().settle(3, 1e-9);
    expect(quick.settled).toBe(false);
    expect(quick.steps).toBe(3);
    const full = make().settle(2000, 1);
    expect(full.settled).toBe(true);
    expect(full.rmsSpeed).toBeLessThanOrEqual(1);
    // 입자가 없으면 즉시 정착이다.
    expect(new Mpm2D(resolveMpmParams(32, 32)).settle(10, 1)).toEqual({ steps: 0, settled: true, rmsSpeed: 0 });
  });

  it("종이 항력은 속도를 줄이고 벽은 입자를 가둔다", () => {
    const sim = new Mpm2D(resolveMpmParams(48, 48, { dragPerS: 0 }));
    for (let i = 0; i < 30; i += 1) sim.inject(30 + (i % 6) * 1.2, 20 + Math.floor(i / 6) * 1.2, 400, 0, 0);
    sim.advanceTo(300);
    expect(inDomain(sim)).toBe(true);
    for (let i = 0; i < sim.count; i += 1) expect(sim.x[i]).toBeLessThanOrEqual(48);
  });

  it("MPM_DEFAULTS 객체는 결정성 전제인 고정 dt를 가진다", () => {
    expect(MPM_DEFAULTS.dtS).toBeCloseTo(1 / 480, 12);
  });
});
