import { describe, expect, it } from "vitest";

import { lineStroke, parametricStroke, polylineStroke } from "../../testing/synthetic-strokes";

import { PaintEmitter, pressureWidth } from "./emitter";
import { resolveMpmParams } from "./params";
import { Mpm2D } from "./solver";

import type { EmitterConfig } from "./emitter";

const CFG: EmitterConfig = {
  rowSpacingPx: 1.2,
  acrossSpacingPx: 1.2,
  widthAtPressure: pressureWidth(4, 16),
  velocityGain: 0.5,
  initialJ: 1,
  jitter: 0.5,
  conc: 0.25,
};

function emit(samples: ReturnType<typeof lineStroke>, seed: number, cfg: EmitterConfig = CFG, w = 160, h = 96) {
  const sim = new Mpm2D(resolveMpmParams(w, h));
  const emitter = new PaintEmitter(cfg);
  emitter.begin(seed);
  for (const s of samples) emitter.push(sim, { x: s.x, y: s.y, tMs: s.tMs, pressure: s.pressure });
  emitter.finish(sim);
  return { sim, emitter };
}

describe("PaintEmitter", () => {
  it("같은 시드는 같은 입자를 같은 순서로 주입하고 시드가 다르면 지터가 다르다", () => {
    const line = lineStroke(10, 40, 140, 40, 0.6, { durationMs: 200 });
    const a = emit(line, 5).sim;
    const b = emit(line, 5).sim;
    const c = emit(line, 6).sim;
    expect(a.count).toBe(b.count);
    expect(a.stateHash()).toBe(b.stateHash());
    expect(c.count).toBe(a.count);
    expect(c.stateHash()).not.toBe(a.stateHash());
  });

  it("압력이 셀수록 한 행의 입자 수(폭)가 늘어난다", () => {
    const soft = emit(lineStroke(10, 40, 140, 40, 0.1, { durationMs: 200 }), 1).sim;
    const hard = emit(lineStroke(10, 40, 140, 40, 1, { durationMs: 200 }), 1).sim;
    expect(hard.count).toBeGreaterThan(soft.count * 1.8);
    // 폭: 입자 y 분포의 범위가 설정 폭(4px / 16px)에 가깝다.
    const span = (sim: Mpm2D): number => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < sim.count; i += 1) {
        lo = Math.min(lo, sim.y[i]);
        hi = Math.max(hi, sim.y[i]);
      }
      return hi - lo;
    };
    expect(span(hard)).toBeGreaterThan(14);
    expect(span(hard)).toBeLessThan(18);
    expect(span(soft)).toBeLessThan(span(hard) * 0.6);
  });

  it("펜 속도의 velocityGain배가 진행 방향 초기 속도가 된다", () => {
    // 30px을 100ms에 → 300 px/s, 게인 0.5 → 150 px/s(속도 상한 480 px/s 아래).
    const sim = new Mpm2D(resolveMpmParams(160, 96, { dragPerS: 0 }));
    const emitter = new PaintEmitter({ ...CFG, velocityGain: 0.5 });
    emitter.begin(1);
    const samples = lineStroke(10, 40, 40, 40, 0.5, { durationMs: 100, sampleRateHz: 240 });
    for (const s of samples) emitter.push(sim, { x: s.x, y: s.y, tMs: s.tMs, pressure: 0.5 });
    expect(sim.count).toBeGreaterThan(0);
    expect(sim.speedLimit).toBeGreaterThan(150);
    expect(sim.counters.clampVelocity).toBe(0);
    let mean = 0;
    let off = 0;
    for (let i = 0; i < sim.count; i += 1) {
      mean += sim.vx[i];
      off = Math.max(off, Math.abs(sim.vy[i]));
    }
    mean /= sim.count;
    expect(mean).toBeGreaterThan(100);
    expect(mean).toBeLessThan(200);
    // 진행 방향(+x)에 수직인 속도는 압력 불균일로 생기는 작은 값뿐이다.
    expect(off).toBeLessThan(60);
  });

  it("표본 시각에 맞춰 시뮬레이션이 진행된다(펜을 멈춰도 시간이 흐르면 입자가 움직인다)", () => {
    const sim = new Mpm2D(resolveMpmParams(160, 96));
    const emitter = new PaintEmitter(CFG);
    emitter.begin(1);
    emitter.push(sim, { x: 20, y: 40, tMs: 0, pressure: 0.8 });
    emitter.push(sim, { x: 60, y: 40, tMs: 40, pressure: 0.8 });
    const stepsAfterMove = sim.counters.steps;
    expect(stepsAfterMove).toBeGreaterThan(0);
    // 같은 자리에서 시간만 흐른다.
    emitter.push(sim, { x: 60, y: 40, tMs: 140, pressure: 0.8 });
    expect(sim.counters.steps).toBeGreaterThan(stepsAfterMove + 30);
    expect(sim.clockMs).toBeGreaterThan(130);
  });

  it("표본이 하나뿐인 획(탭)은 원판을 만든다", () => {
    const { sim, emitter } = emit(lineStroke(80, 48, 80, 48, 1, { durationMs: 0 }).slice(0, 1), 3);
    expect(sim.count).toBeGreaterThan(30);
    expect(emitter.stats().rows).toBe(1);
    // 압력 1 → 반경 8px 안쪽
    for (let i = 0; i < sim.count; i += 1) expect(Math.hypot(sim.x[i] - 80, sim.y[i] - 48)).toBeLessThanOrEqual(8.5);
  });

  it("캔버스 밖으로 나가는 입자는 거절 카운터에 남고 요청 수 = 주입 + 거절이다", () => {
    const { sim, emitter } = emit(lineStroke(-30, 40, 60, 40, 0.8, { durationMs: 150 }), 2);
    const c = sim.counters;
    expect(c.rejectedOutside).toBeGreaterThan(0);
    expect(c.injected + c.rejectedOutside + c.rejectedCapacity + c.rejectedInvalid).toBe(emitter.stats().requested);
  });

  it("시각이 거의 같은 표본 쌍은 입자에 순간이동 속도를 주지 않는다", () => {
    const sim = new Mpm2D(resolveMpmParams(160, 96));
    const emitter = new PaintEmitter({ ...CFG, jitter: 0 });
    emitter.begin(1);
    emitter.push(sim, { x: 20, y: 40, tMs: 5, pressure: 0.5 });
    emitter.push(sim, { x: 50, y: 40, tMs: 5, pressure: 0.5 });
    expect(sim.count).toBeGreaterThan(10);
    for (let i = 0; i < sim.count; i += 1) {
      expect(sim.vx[i]).toBe(0);
      expect(sim.vy[i]).toBe(0);
    }
  });

  it("곡선 경로에서도 행 간격이 일정하다(코너를 지나도 끊기지 않는다)", () => {
    const arc = parametricStroke((t) => ({ x: 20 + 100 * t, y: 48 + 30 * Math.sin(Math.PI * t * 2), pressure: 0.5 }), { durationMs: 300 });
    const { emitter } = emit(arc, 1);
    let length = 0;
    for (let i = 1; i < arc.length; i += 1) length += Math.hypot(arc[i].x - arc[i - 1].x, arc[i].y - arc[i - 1].y);
    expect(emitter.stats().rows).toBeGreaterThan(length / CFG.rowSpacingPx - 3);
    expect(emitter.stats().rows).toBeLessThan(length / CFG.rowSpacingPx + 3);
  });

  it("획의 시작과 끝은 반원 마개로 둥글다(수직 행만 놓으면 평평하다)", () => {
    // 압력 1(폭 16): 마개가 시작점 뒤·끝점 앞으로 반경 8px까지 입자를 낸다.
    // 속도 전달을 끄고(velocityGain 0) 방출 기하만 본다.
    const { sim } = emit(lineStroke(40, 48, 120, 48, 1, { durationMs: 200 }), 1, { ...CFG, jitter: 0, velocityGain: 0 });
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < sim.count; i += 1) {
      minX = Math.min(minX, sim.x[i]);
      maxX = Math.max(maxX, sim.x[i]);
    }
    expect(minX).toBeLessThan(40 - 6);
    expect(maxX).toBeGreaterThan(120 + 6);
    // 마개 끝은 중심선에서 ±폭/2 안이고, 모서리(±8px, 시작점 −8px)는 비어 있다(원이지 사각형이 아니다).
    let corner = 0;
    for (let i = 0; i < sim.count; i += 1) {
      if (sim.x[i] < 40 - 6.5 && Math.abs(sim.y[i] - 48) > 6.5) corner += 1;
    }
    expect(corner).toBe(0);
  });

  it("직각 코너의 바깥쪽 모서리는 부채꼴로 채워진다(홈이 생기지 않는다)", () => {
    // (30,70) → (90,70) → (90,20): 좌회전. 바깥은 오른쪽 아래가 아니라 위·오른쪽 모서리(90+, 70+)다.
    const corner = polylineStroke(
      [
        [30, 70],
        [90, 70],
        [90, 20],
      ],
      () => 1,
      { durationMs: 400 },
    );
    const withFan = emit(corner, 1, { ...CFG, jitter: 0, velocityGain: 0 }, 160, 96).sim;
    // 바깥 모서리 영역: x ∈ [92, 96], y ∈ [70.5, 77] (코너 점 오른쪽 아래, 폭 16 = 반폭 8).
    let filled = 0;
    for (let i = 0; i < withFan.count; i += 1) {
      if (withFan.x[i] > 90.5 && withFan.x[i] < 98 && withFan.y[i] > 70.5 && withFan.y[i] < 78) filled += 1;
    }
    expect(filled).toBeGreaterThan(8);
  });

  it("잘못된 설정은 던진다", () => {
    expect(() => new PaintEmitter({ ...CFG, rowSpacingPx: 0 })).toThrow(RangeError);
    expect(() => new PaintEmitter({ ...CFG, widthAtPressure: () => 0 })).toThrow(RangeError);
    expect(() => new PaintEmitter({ ...CFG, widthAtPressure: (p) => (p > 0.5 ? Number.NaN : 3) })).toThrow(RangeError);
    expect(() => pressureWidth(5, 2)).toThrow(RangeError);
    expect(() => new PaintEmitter({ ...CFG, jitter: Number.NaN })).toThrow(RangeError);
  });
});

describe("PaintEmitter: 영역 밖 행 컬링 (MP-2)", () => {
  it("캔버스에서 아주 멀리 벗어나는 선분은 행 수만큼 일하지 않고 센다 — 안쪽 구간은 그대로 그린다", () => {
    const sim = new Mpm2D(resolveMpmParams(160, 96));
    const emitter = new PaintEmitter(CFG);
    emitter.begin(1);
    emitter.push(sim, { x: 10, y: 40, tMs: 0, pressure: 0.6 });
    // 한 선분이 1천만 px — 행마다 입자를 요청했다면 800만 행이다.
    emitter.push(sim, { x: 1e7, y: 40, tMs: 8, pressure: 0.6 });
    const stats = emitter.stats();
    expect(stats.rowsCulled).toBeGreaterThan(8_000_000);
    expect(stats.requested).toBeLessThan(5000);
    // 캔버스 안(10..150px)의 행은 그려졌다.
    expect(sim.count).toBeGreaterThan(100);
    expect(sim.counters.rejectedOutside).toBeLessThan(500);
  });

  it("캔버스 안에서 끝나는 선분은 컬링하지 않는다", () => {
    const { emitter } = emit(lineStroke(10, 40, 140, 40, 0.6, { durationMs: 200 }), 3);
    expect(emitter.stats().rowsCulled).toBe(0);
  });

  it("캔버스 밖으로 나갔다 돌아오는 획은 먼 구간을 컬링하고 결과는 결정적이다(같은 입력 두 번 = 같은 해시)", () => {
    const run = (): string => {
      const sim = new Mpm2D(resolveMpmParams(160, 96));
      const emitter = new PaintEmitter(CFG);
      emitter.begin(9);
      const pts: [number, number, number][] = [[20, 40, 0], [400, 40, 8], [400, 60, 16], [30, 60, 24], [30, 20, 32]];
      for (const [x, y, t] of pts) emitter.push(sim, { x, y, tMs: t, pressure: 0.5 });
      emitter.finish(sim);
      return `${sim.count}:${sim.stateHash()}:${emitter.stats().rowsCulled}`;
    };
    const a = run();
    expect(run()).toBe(a);
    expect(Number(a.split(":")[2])).toBeGreaterThan(100);
  });
});
