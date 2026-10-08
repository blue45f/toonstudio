import { describe, expect, it } from "vitest";

import { resolveBristleBrushConfig } from "../../physics/world2d/bristle-brush";
import { polylineSamples, rawSample } from "../../testing/stage-samples";

import { applyStrokeStream } from "./chain";
import {
  createPenSpringStage,
  createPenSpringStageFromPct,
  describePenSpring,
  isPenSpringStable,
  PEN_SPRING_DEFAULT_ZETA,
  PEN_SPRING_MAX_OMEGA,
  PEN_SPRING_MAX_SETTLE_MS,
  PEN_SPRING_SUBSTEP_MS,
  PEN_SPRING_SUBSTEP_SEC,
  PenSpring2D,
  PenSpringDriver,
  penSpringParams,
} from "./pen-spring";

describe("penSpringParams / describePenSpring", () => {
  it("지연·감쇠비로 만든 상수를 해석하면 같은 지연·감쇠비가 나온다", () => {
    for (const [lag, zeta] of [[15, 1], [30, 1.5], [60, 2], [20, 0.55], [8, 1]] as const) {
      const d = describePenSpring(penSpringParams(lag, zeta));
      expect(d.lagMs).toBeCloseTo(lag, 9);
      expect(d.zeta).toBeCloseTo(zeta, 9);
      expect(d.naturalHz).toBeCloseTo(d.omega / (2 * Math.PI), 12);
    }
  });

  it("너무 짧은 지연은 안정 한계(ωn)로 가두므로 실제 지연이 요청보다 길어진다", () => {
    const params = penSpringParams(1, 1);
    expect(params.omega).toBe(PEN_SPRING_MAX_OMEGA);
    expect(describePenSpring(params).lagMs).toBeGreaterThan(1);
    // 지연이 서브스텝(ζ·h) 이하여도 던지지 않고 같은 하한으로 가둔다.
    expect(penSpringParams(3, 1).omega).toBe(PEN_SPRING_MAX_OMEGA);
  });

  it("0 이하·비유한 입력은 조용히 보정하지 않고 RangeError다", () => {
    expect(() => penSpringParams(0)).toThrow(RangeError);
    expect(() => penSpringParams(-5)).toThrow(RangeError);
    expect(() => penSpringParams(Number.NaN)).toThrow(RangeError);
    expect(() => penSpringParams(15, 0)).toThrow(RangeError);
    expect(() => new PenSpring2D({ omega: 0, dragPerSec: 1 })).toThrow(RangeError);
    expect(() => new PenSpring2D({ omega: PEN_SPRING_MAX_OMEGA * 2, dragPerSec: 1 })).toThrow(RangeError);
    expect(() => new PenSpring2D({ omega: 10, dragPerSec: -1 })).toThrow(RangeError);
  });
});

describe("PenSpring2D 적분기", () => {
  it("목표가 제자리면 움직이지 않고, 목표로 수렴해 멈춘다", () => {
    const pen = new PenSpring2D(penSpringParams(15, 1), 5, 7);
    for (let i = 0; i < 100; i += 1) pen.step(PEN_SPRING_SUBSTEP_SEC, 5, 7);
    expect([pen.x, pen.y, pen.vx, pen.vy]).toEqual([5, 7, 0, 0]);
    for (let i = 0; i < 240; i += 1) pen.step(PEN_SPRING_SUBSTEP_SEC, 105, 7);
    expect(pen.isAtRest(105, 7, 0.05, 1)).toBe(true);
  });

  it("임계 감쇠(ζ=1) 계단 응답은 어떤 지연에서도 목표를 넘지 않고 단조롭게 수렴한다(이산 계의 임계 = 두 극이 겹침)", () => {
    for (const lagMs of [8, 15, 30, 60]) {
      const params = penSpringParams(lagMs, 1);
      const pen = new PenSpring2D(params, 0, 0);
      let prevX = 0;
      for (let i = 0; i < 480; i += 1) {
        pen.step(PEN_SPRING_SUBSTEP_SEC, 100, 0);
        expect(pen.x).toBeLessThanOrEqual(100 + 1e-9);
        expect(pen.x).toBeGreaterThanOrEqual(prevX - 1e-12);
        prevX = pen.x;
      }
      expect(100 - pen.x).toBeLessThan(0.05);
    }
  });

  it("과감쇠(ζ=2)는 같은 지연에서 임계(ζ=1)보다 목표에 늦게 도달한다", () => {
    const reach = (zeta: number): number => {
      const pen = new PenSpring2D(penSpringParams(30, zeta), 0, 0);
      for (let i = 1; i <= 2400; i += 1) {
        pen.step(PEN_SPRING_SUBSTEP_SEC, 100, 0);
        if (pen.x > 99) return i;
      }
      return 2400;
    };
    expect(reach(2)).toBeGreaterThan(reach(1));
  });

  it("ζ<1(저감쇠)은 같은 계단 응답에서 목표를 넘는다(ζ=0.55: 물리 펜의 SP-C 기본값)", () => {
    const pen = new PenSpring2D(penSpringParams(15, 0.55), 0, 0);
    let maxX = 0;
    for (let i = 0; i < 240; i += 1) {
      pen.step(PEN_SPRING_SUBSTEP_SEC, 100, 0);
      maxX = Math.max(maxX, pen.x);
    }
    expect(maxX).toBeGreaterThan(105);
  });

  it("등속 포인터를 따라갈 때 정상 상태 지연이 λ/k = 요청한 지연과 같다(상대 속도가 아니라 지면 항력)", () => {
    for (const lagMs of [10, 15, 30]) {
      const pen = new PenSpring2D(penSpringParams(lagMs, 1), 0, 0);
      const v = 2; // px/ms
      let t = 0;
      for (let i = 0; i < 480; i += 1) {
        t += PEN_SPRING_SUBSTEP_MS;
        pen.step(PEN_SPRING_SUBSTEP_SEC, v * t, 0);
      }
      const lagPx = v * t - pen.x;
      expect(lagPx / v).toBeCloseTo(lagMs, 0);
      expect(Math.abs(pen.vx / 1000 - v)).toBeLessThan(0.01);
    }
  });

  it("지연 하한(안정 한계) 부근에서도 발산하지 않고 유한하다", () => {
    const pen = new PenSpring2D(penSpringParams(0.1, 3), 0, 0);
    for (let i = 0; i < 2400; i += 1) pen.step(PEN_SPRING_SUBSTEP_SEC, i % 2 === 0 ? 200 : -200, 50);
    expect(Number.isFinite(pen.x) && Number.isFinite(pen.vx)).toBe(true);
    expect(Math.abs(pen.x)).toBeLessThan(1000);
  });

  it("setParams는 상태를 유지한 채 상수만 바꾼다", () => {
    const pen = new PenSpring2D(penSpringParams(15, 1), 0, 0);
    for (let i = 0; i < 10; i += 1) pen.step(PEN_SPRING_SUBSTEP_SEC, 50, 0);
    const x = pen.x;
    pen.setParams(penSpringParams(40, 1.2));
    expect(pen.x).toBe(x);
    expect(describePenSpring(pen.params).lagMs).toBeCloseTo(40, 9);
  });
});

describe("PenSpringDriver: 표본 시각으로 구동하는 고정 서브스텝", () => {
  function runLine(rateHz: number): { x: number; vx: number; sim: number } {
    const driver = new PenSpringDriver(penSpringParams(15, 1));
    driver.begin(0, 0, 0);
    const dt = 1000 / rateHz;
    for (let t = dt; t <= 500 + 1e-9; t += dt) driver.advance(0.8 * t, 0.3 * t, t);
    return { x: driver.spring.x, vx: driver.spring.vx, sim: driver.simTimeMs };
  }

  it("같은 직선 궤적이면 이벤트 율(60·120·240 Hz)과 무관하게 같은 서브스텝 상태가 된다", () => {
    const a = runLine(60);
    const b = runLine(120);
    const c = runLine(240);
    expect(a.sim).toBeCloseTo(c.sim, 6);
    expect(Math.abs(a.x - c.x)).toBeLessThan(1e-6);
    expect(Math.abs(b.x - c.x)).toBeLessThan(1e-6);
    expect(Math.abs(a.vx - c.vx)).toBeLessThan(1e-4);
  });

  it("같은 입력은 비트 단위로 같은 결과(결정성)", () => {
    expect(runLine(144)).toEqual(runLine(144));
  });

  it("시각이 같거나 거꾸로 가면 적분하지 않고, positionAt은 마지막 서브스텝에서 1차 외삽한다", () => {
    const driver = new PenSpringDriver(penSpringParams(15, 1));
    driver.begin(10, 10, 100);
    driver.advance(50, 10, 100);
    expect(driver.spring.x).toBe(10);
    driver.advance(50, 10, 90);
    expect(driver.spring.x).toBe(10);
    driver.advance(60, 10, 106); // 서브스텝 1회(4.17 ms) 적분, 외삽 구간 1.83 ms
    const sim = driver.simTimeMs;
    expect(sim).toBeCloseTo(100 + PEN_SPRING_SUBSTEP_MS, 9);
    const p = driver.positionAt(106);
    expect(p.x).toBeCloseTo(driver.spring.x + driver.spring.vx * ((106 - sim) / 1000), 12);
  });
});

describe("물리 펜 단계(PenSpringStage)", () => {
  it("down은 그 자리에서 시작하고 압력·기울기는 입력 그대로, 시각도 입력 시각이다", () => {
    const stage = createPenSpringStage({ lagMs: 15 });
    const out = stage.apply([rawSample(10, 20, 0, "down", { pressure: 0.4 }), rawSample(40, 20, 4.2, "move", { pressure: 0.8 })]);
    expect(out[0]).toMatchObject({ x: 10, y: 20, phase: "down", pressure: 0.4, tMs: 0 });
    expect(out[1]).toMatchObject({ phase: "move", pressure: 0.8, tiltXDeg: 5, tMs: 4.2 });
    expect(out[1]?.x).toBeGreaterThan(10);
    expect(out[1]?.x).toBeLessThan(40);
  });

  it("직선을 따라가는 지연이 요청한 값(15 ms)에 가깝다", () => {
    const stage = createPenSpringStage({ lagMs: 15, zeta: 1 });
    const speed = 1.5;
    const samples = polylineSamples([[0, 0], [600, 0]], speed);
    const out = stage.apply(samples.slice(0, -1));
    const mid = out[out.length >> 1];
    const raw = samples[out.length >> 1];
    expect(mid && raw).toBeTruthy();
    const lagMs = ((raw?.x ?? 0) - (mid?.x ?? 0)) / speed;
    expect(lagMs).toBeGreaterThan(13);
    expect(lagMs).toBeLessThan(17);
  });

  it("획 끝 정착: 마지막 표본은 포인터 up 위치의 up이고, 정착 중 목표를 넘지 않는다(ζ≥1)", () => {
    for (const zeta of [1, 1.5, 2]) {
      const stage = createPenSpringStage({ lagMs: 20, zeta });
      const samples = polylineSamples([[10, 10], [300, 10]], 3); // 빠른 획(3 px/ms)
      const out = applyStrokeStream(stage, samples);
      const last = out[out.length - 1];
      expect(last).toMatchObject({ x: 300, y: 10, phase: "up" });
      expect(out.filter((s) => s.phase === "up")).toHaveLength(1);
      let maxX = 0;
      for (const s of out) maxX = Math.max(maxX, s.x);
      expect(maxX).toBeLessThanOrEqual(300 + 1e-6);
      const settle = (last?.tMs ?? 0) - (samples[samples.length - 1]?.tMs ?? 0);
      expect(settle).toBeLessThanOrEqual(PEN_SPRING_MAX_SETTLE_MS + 2 * PEN_SPRING_SUBSTEP_MS);
      for (let i = 1; i < out.length; i += 1) expect(out[i]?.tMs).toBeGreaterThanOrEqual(out[i - 1]?.tMs ?? 0);
    }
  });

  it("ζ=0.55는 같은 입력에서 목표를 넘는다(대비: 기본 ζ는 넘지 않는다)", () => {
    const run = (zeta: number): number => {
      const out = applyStrokeStream(createPenSpringStage({ lagMs: 20, zeta }), polylineSamples([[10, 10], [300, 10]], 3));
      return Math.max(...out.map((s) => s.x)) - 300;
    };
    expect(run(0.55)).toBeGreaterThan(1);
    expect(run(PEN_SPRING_DEFAULT_ZETA)).toBeLessThanOrEqual(1e-6);
  });

  it("탭(down→up, 이동 없음)은 up 표본 하나만 낸다", () => {
    const out = applyStrokeStream(createPenSpringStage({ lagMs: 15 }), [rawSample(5, 5, 0, "down"), rawSample(5, 5, 8, "up")]);
    expect(out.map((s) => s.phase)).toEqual(["down", "up"]);
    expect(out[1]).toMatchObject({ x: 5, y: 5 });
  });

  it("예측 표본은 상태를 바꾸지 않고 통과한다", () => {
    const stage = createPenSpringStage({ lagMs: 15 });
    const out = stage.apply([rawSample(0, 0, 0, "down"), rawSample(999, 999, 2, "move", { source: "predicted" }), rawSample(10, 0, 4.2, "move")]);
    expect(out[1]).toMatchObject({ x: 999, source: "predicted" });
    expect(out[2]?.x).toBeLessThan(10);
  });

  it("reset은 보류한 up과 펜 상태를 버린다", () => {
    const stage = createPenSpringStage({ lagMs: 15 });
    stage.apply([rawSample(0, 0, 0, "down"), rawSample(100, 0, 20, "move"), rawSample(100, 0, 24, "up")]);
    stage.reset();
    expect(stage.flush()).toEqual([]);
    const out = stage.apply([rawSample(50, 50, 500, "down")]);
    expect(out[0]).toMatchObject({ x: 50, y: 50 });
  });

  it("같은 입력이면 비트 단위로 같고, 슬라이더 팩토리는 0 → 8 ms, 100 → 60 ms 지연이다", () => {
    const samples = polylineSamples([[10, 10], [150, 90], [290, 10]], 1.4);
    expect(applyStrokeStream(createPenSpringStage({ lagMs: 18 }), samples)).toEqual(applyStrokeStream(createPenSpringStage({ lagMs: 18 }), samples));
    const lagOf = (pct: number): number => {
      const stage = createPenSpringStageFromPct(pct);
      const speed = 1.5;
      const s = polylineSamples([[0, 0], [900, 0]], speed);
      const out = stage.apply(s.slice(0, -1));
      const i = out.length - 10;
      return ((s[i]?.x ?? 0) - (out[i]?.x ?? 0)) / speed;
    };
    expect(lagOf(0)).toBeGreaterThan(7);
    expect(lagOf(0)).toBeLessThan(9);
    expect(lagOf(100)).toBeGreaterThan(55);
    expect(lagOf(100)).toBeLessThan(65);
  });
});

describe("R-A-5 안정 영역: 불안정 (지연, 감쇠비) 조합은 RangeError다", () => {
  /** 목표를 100 px 옮겨 고정 서브스텝으로 적분한 뒤의 최종 오차(px). 발산·NaN이면 Infinity. */
  const settleError = (lagMs: number, zeta: number): number => {
    const pen = new PenSpring2D(penSpringParams(lagMs, zeta), 0, 0);
    for (let i = 0; i < 6000; i += 1) {
      pen.step(PEN_SPRING_SUBSTEP_SEC, 100, 0);
      if (!Number.isFinite(pen.x) || Math.abs(pen.x) > 1e6) return Number.POSITIVE_INFINITY;
    }
    return Math.abs(100 - pen.x);
  };

  it("리뷰 재현: 지연 0.5 ms, ζ 0.1은 NaN을 내는 대신 만드는 시점에 RangeError다", () => {
    expect(() => penSpringParams(0.5, 0.1)).toThrow(RangeError);
    expect(() => createPenSpringStage({ lagMs: 0.5, zeta: 0.1 })).toThrow(RangeError);
    expect(() => createPenSpringStage({ lagMs: 15 }).setLag(0.5, 0.1)).toThrow(RangeError);
  });

  it("ζ ≥ 0.5는 지연과 무관하게 항상 받아들여지고 수렴한다", () => {
    for (const zeta of [0.5, 0.55, 1, 3]) {
      for (const lag of [0.5, 2, 4.2, 8, 15, 60, 200]) {
        expect(isPenSpringStable(penSpringParams(lag, zeta)), `lag ${lag} ζ ${zeta}`).toBe(true);
        expect(settleError(lag, zeta), `lag ${lag} ζ ${zeta}`).toBeLessThan(0.01);
      }
    }
  });

  /** 거부된 조합이 정말 발산하는지 확인하려고, 검증 없이 같은 식(PenSpring2D.step과 동일)으로 직접 적분한다. */
  const rawDiverges = (lagMs: number, zeta: number): boolean => {
    const h = PEN_SPRING_SUBSTEP_SEC;
    const room = lagMs / 1000 - zeta * h;
    const omega = room > 0 ? Math.min((2 * zeta) / room, PEN_SPRING_MAX_OMEGA) : PEN_SPRING_MAX_OMEGA;
    const drag = zeta * (2 * omega + omega * omega * h);
    let x = 0;
    let v = 0;
    for (let i = 0; i < 6000; i += 1) {
      x += v * h;
      v = (v + omega * omega * (100 - x) * h) / (1 + drag * h);
      if (!Number.isFinite(x) || Math.abs(x) > 1e6) return true;
    }
    return false;
  };

  it("격자 탐색: 받아들인 조합은 모두 발산하지 않고, 거부한 조합은 실제로 발산한다(과잉 거부 없음)", () => {
    let rejected = 0;
    for (const zeta of [0.02, 0.05, 0.1, 0.15, 0.18, 0.2, 0.3, 0.45, 0.5]) {
      for (const lag of [0.5, 1, 2, 4, 6, 10, 30, 100]) {
        let params;
        try {
          params = penSpringParams(lag, zeta);
        } catch (e) {
          expect(e).toBeInstanceOf(RangeError);
          expect(rawDiverges(lag, zeta), `거부했지만 발산하지 않음: lag ${lag} ζ ${zeta}`).toBe(true);
          rejected += 1;
          continue;
        }
        expect(isPenSpringStable(params), `lag ${lag} ζ ${zeta}`).toBe(true);
        expect(rawDiverges(lag, zeta), `받아들였지만 발산함: lag ${lag} ζ ${zeta}`).toBe(false);
        // 100 px 계단 입력의 최대 오차는 진폭 100 px(극저감쇠 진동)을 넘지 않는다.
        expect(settleError(lag, zeta), `lag ${lag} ζ ${zeta}`).toBeLessThanOrEqual(100.5);
      }
    }
    expect(rejected).toBeGreaterThan(0);
  });

  it("isPenSpringStable은 해석 조건과 같다: ωn·h = 2/(1 − 2ζ) 경계 양쪽에서 갈린다", () => {
    const h = PEN_SPRING_SUBSTEP_SEC;
    const zeta = 0.25; // 경계 ωn·h = 4
    const make = (a: number): { omega: number; dragPerSec: number } => {
      const omega = a / h;
      return { omega, dragPerSec: zeta * (2 * omega + omega * omega * h) };
    };
    expect(isPenSpringStable(make(3.9))).toBe(true);
    expect(isPenSpringStable(make(4.1))).toBe(false);
  });

  it("붓털 레인 설정 검증도 같은 규칙을 쓴다: 손잡이 (지연, 감쇠비)가 불안정이면 RangeError, 안정이면 통과", () => {
    expect(() => resolveBristleBrushConfig({ handleLagMs: 0.5, handleZeta: 0.1 })).toThrow(RangeError);
    expect(() => resolveBristleBrushConfig({ handleLagMs: 12, handleZeta: 1 })).not.toThrow();
    expect(() => resolveBristleBrushConfig({ handleLagMs: 20, handleZeta: 0.55 })).not.toThrow();
  });
});
