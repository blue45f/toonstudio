import { describe, expect, it } from "vitest";

import { Pcg32 } from "../core/rng";
import { presetById } from "../presets/catalog";
import { renderStroke } from "../raster/reference-renderer";
import { lineStroke, zigzagStroke } from "../testing/synthetic-strokes";

import { DEFAULT_INPUT_CONFIG, InputPipeline } from "./input-pipeline";
import { applyStrokeStream } from "./stages/chain";
import { createCornerGateStage } from "./stages/corner-gate";
import { createLazyBrushStageFromPct } from "./stages/lazy-brush";
import { createPenSpringStageFromPct } from "./stages/pen-spring";

import type { ModeledSample, RawSample } from "../core/types";

/**
 * 입력 보정의 견고성 회귀(리뷰 R-A-1·R-A-2): 잡음·양자화·중복 타임스탬프 입력에서도
 * (1) 모서리 오탐이 없고, (2) 정점 재방출이 시간을 거스르거나 속도를 튀기지 않으며 잉크를 지우지 않는다.
 */

function gauss(rng: Pcg32): number {
  return Math.sqrt(-2 * Math.log(1 - rng.nextF32())) * Math.cos(2 * Math.PI * rng.nextF32());
}

function mk(x: number, y: number, tMs: number, phase: RawSample["phase"]): RawSample {
  return { x, y, tMs, pressure: 0.5, tiltXDeg: 0, tiltYDeg: 0, twistDeg: 0, pointerType: "pen", phase, source: "raw" };
}

/** 직선+완만한 곡선을 천천히(50 px/s) 긋는 가우시안 위치 잡음 입력. */
function noisyStroke(hz: number, lenPx: number, durMs: number, sigma: number, seed: number): RawSample[] {
  const rng = new Pcg32(seed, 7);
  const n = Math.round((durMs * hz) / 1000) + 1;
  const dt = 1000 / hz;
  const out: RawSample[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    out.push(mk(20 + lenPx * t + sigma * gauss(rng), 50 + 10 * Math.sin(t * 3) + sigma * gauss(rng), i * dt, i === 0 ? "down" : i === n - 1 ? "up" : "move"));
  }
  return out;
}

/** 정수 격자(1 px 해상도) 마우스. 기울어진 직선을 폴링 간격마다 반올림해 계단 걸음을 만든다. */
function latticeStroke(pollMs: number, speedPxPerSec: number, angleDeg: number, durMs: number): RawSample[] {
  const n = Math.floor(durMs / pollMs) + 1;
  const ux = Math.cos((angleDeg * Math.PI) / 180);
  const uy = Math.sin((angleDeg * Math.PI) / 180);
  const out: RawSample[] = [];
  for (let i = 0; i < n; i += 1) {
    const d = (speedPxPerSec * i * pollMs) / 1000;
    out.push(mk(Math.round(20 + ux * d), Math.round(50 + uy * d), i * pollMs, i === 0 ? "down" : i === n - 1 ? "up" : "move"));
  }
  return out;
}

/** 지그재그(5 px 걸음) 입력. quantize > 0이면 타임스탬프를 그 간격으로 내림한다(타이머 클램프 모사). */
function zigzag(dtMs: number, step: number, quantize: number, legs = 6): RawSample[] {
  const pts: { x: number; y: number }[] = [];
  let x = 20;
  let y = 20;
  pts.push({ x, y });
  for (let l = 0; l < legs; l += 1) {
    const dirY = l % 2 === 0 ? 1 : -1;
    for (let i = 0; i < 20; i += 1) {
      x += step * 0.5;
      y += step * dirY * 0.866;
      pts.push({ x, y });
    }
  }
  return pts.map((p, i) => {
    const t = i * dtMs;
    return mk(p.x, p.y, quantize > 0 ? Math.floor(t / quantize) * quantize : t, i === 0 ? "down" : i === pts.length - 1 ? "up" : "move");
  });
}

/** 16.67 ms 프레임 단위로 파이프라인에 밀어 넣고 finish까지 받은 정본 열. */
function runPipeline(samples: readonly RawSample[]): ModeledSample[] {
  const pipeline = new InputPipeline(DEFAULT_INPUT_CONFIG);
  const out: ModeledSample[] = [];
  const frames = new Map<number, RawSample[]>();
  for (const s of samples) {
    const k = Math.floor(s.tMs / 16.67);
    const bucket = frames.get(k) ?? [];
    bucket.push(s);
    frames.set(k, bucket);
  }
  for (const key of Array.from(frames.keys()).sort((a, b) => a - b)) out.push(...pipeline.push(frames.get(key) ?? []).committed);
  out.push(...pipeline.finish());
  return out;
}

function maxStep(out: readonly RawSample[], skipTail: number): number {
  let m = 0;
  for (let i = 1; i < out.length - skipTail; i += 1) {
    const a = out[i - 1];
    const b = out[i];
    if (a && b) m = Math.max(m, Math.hypot(b.x - a.x, b.y - a.y));
  }
  return m;
}

describe("R-A-1 모서리 오탐 방어(창 속도 + 변 길이)", () => {
  const seeds = Array.from({ length: 40 }, (_, i) => i + 1);

  for (const hz of [240, 500]) {
    for (const [name, make] of [
      ["끈 당김 100", () => createLazyBrushStageFromPct(100)],
      ["물리 펜 100", () => createPenSpringStageFromPct(100)],
    ] as const) {
      it(`가우시안 잡음 σ 0.25 px, ${hz} Hz, 50 px/s, ${name}: 코너 게이트 오탐 0이고 붓이 튀지 않는다(40획)`, () => {
        let corners = 0;
        let worst = 0;
        for (const seed of seeds) {
          const raw = noisyStroke(hz, 300, 6000, 0.25, seed);
          const gate = createCornerGateStage(make());
          const out = applyStrokeStream(gate, raw);
          corners += gate.corners;
          const plain = applyStrokeStream(make(), raw);
          worst = Math.max(worst, maxStep(out, 80) - maxStep(plain, 80));
        }
        expect(corners).toBe(0);
        expect(worst).toBeLessThan(0.5);
      });
    }

    it(`가우시안 잡음 σ 0.25 px, ${hz} Hz: 입력 파이프라인도 정점을 재방출하지 않는다(표본 수 = 입력 − up + tail)`, () => {
      for (const seed of seeds) {
        const raw = noisyStroke(hz, 300, 6000, 0.25, seed);
        expect(runPipeline(raw).length, `seed ${seed}`).toBe(raw.length - 1 + DEFAULT_INPUT_CONFIG.endpointTailSamples);
      }
    });
  }

  it("정수 격자 1 kHz 마우스 계단 걸음(150·300·600 px/s, 기울기 8°·20°·37°): 게이트 오탐 0", () => {
    for (const speed of [150, 300, 600]) {
      for (const angle of [8, 20, 37]) {
        const gate = createCornerGateStage(createLazyBrushStageFromPct(100));
        applyStrokeStream(gate, latticeStroke(1, speed, angle, 1500).slice(0, -1));
        expect(gate.corners, `${speed}px/s ${angle}°`).toBe(0);
      }
    }
  });

  // 입력 파이프라인(엔진 1€)은 창 속도 가드만 쓴다(변 길이·잡음 가드는 코너 게이트 전용): 저속(< 200 px/s)에서는 계단·잡음이 모서리가 되지 않는다.
  // 더 빠르고 잡음이 큰 획의 오탐은 남지만 재방출 정점이 1€ 지연된 출력보다 raw에 가까워 경로 RMS를 오히려 줄인다(실측 240 Hz 300 px/s σ 0.25:
  // 0.6413 → 0.6395 px). 그래서 그 영역은 단언하지 않고 README에 한계로 적었다.
  it("정수 격자 1 kHz 마우스 150 px/s 계단 걸음: 입력 파이프라인도 정점을 재방출하지 않는다", () => {
    for (const angle of [8, 20, 37]) {
      const raw = latticeStroke(1, 150, angle, 1500);
      expect(runPipeline(raw).length, `${angle}°`).toBe(raw.length - 1 + DEFAULT_INPUT_CONFIG.endpointTailSamples);
    }
  });

  it("σ 0.25~0.4 px 잡음이 더 빠른 획(120 Hz~1 kHz, 150~600 px/s)에서도 게이트 오탐 0이다(파이프라인은 150 px/s까지)", () => {
    for (const hz of [120, 240, 500, 1000]) {
      for (const speed of [150, 300, 600]) {
        for (const sigma of [0.25, 0.4]) {
          let corners = 0;
          let extra = 0;
          for (let seed = 1; seed <= 6; seed += 1) {
            const dt = 1000 / hz;
            const n = Math.round(2000 / dt) + 1;
            const rng = new Pcg32(seed, 11);
            const raw: RawSample[] = [];
            for (let i = 0; i < n; i += 1) {
              const d = (speed * i * dt) / 1000;
              raw.push(mk(20 + d * 0.95 + sigma * gauss(rng), 50 + d * 0.3 + sigma * gauss(rng), i * dt, i === 0 ? "down" : i === n - 1 ? "up" : "move"));
            }
            const gate = createCornerGateStage(createLazyBrushStageFromPct(100));
            applyStrokeStream(gate, raw.slice(0, -1));
            corners += gate.corners;
            if (speed < 200) extra += runPipeline(raw).length - (raw.length - 1 + DEFAULT_INPUT_CONFIG.endpointTailSamples);
          }
          expect(corners, `게이트 ${hz}Hz ${speed}px/s σ${sigma}`).toBe(0);
          expect(extra, `파이프라인 ${hz}Hz ${speed}px/s σ${sigma}`).toBe(0);
        }
      }
    }
  });

  it("진짜 모서리는 표본율에 관계없이 잡는다: 지그재그 꼭짓점 3개를 120 Hz~1 kHz, 300~2000 px/s에서 모두 센다", () => {
    for (const hz of [120, 240, 500, 1000]) {
      for (const speed of [300, 600, 2000]) {
        const dt = 1000 / hz;
        const step = (speed * dt) / 1000;
        const raw: RawSample[] = [mk(20, 20, 0, "down")];
        let x = 20;
        let y = 20;
        let t = 0;
        for (const dirY of [0.866, -0.866, 0.866, -0.866]) {
          const n = Math.max(2, Math.round(120 / step));
          for (let i = 0; i < n; i += 1) {
            x += 0.5 * step;
            y += dirY * step;
            t += dt;
            raw.push(mk(x, y, t, "move"));
          }
        }
        const gate = createCornerGateStage(createLazyBrushStageFromPct(40));
        gate.apply(raw);
        expect(gate.corners, `${hz}Hz ${speed}px/s`).toBe(3);
      }
    }
  });

  it("다리가 짧은 빠른 지그재그(다리 30 px = 25 ms, 20 px = 17 ms)도 직전 모서리가 이력을 오염시켜 놓치지 않는다", () => {
    for (const [speed, leg, minCorners] of [[1.2, 30, 7], [1.2, 20, 6]] as const) {
      const step = speed * (1000 / 240);
      const raw: RawSample[] = [mk(20, 20, 0, "down")];
      let x = 20;
      let y = 20;
      let t = 0;
      for (let l = 0; l < 8; l += 1) {
        const uy = l % 2 === 0 ? 0.866 : -0.866;
        const n = Math.max(2, Math.round(leg / step));
        for (let i = 0; i < n; i += 1) {
          x += 0.5 * step;
          y += uy * step;
          t += 1000 / 240;
          raw.push(mk(x, y, t, "move"));
        }
      }
      const gate = createCornerGateStage(createLazyBrushStageFromPct(40));
      gate.apply(raw);
      expect(gate.corners, `다리 ${leg}px`).toBeGreaterThanOrEqual(minCorners);
    }
  });

  it("진짜 모서리는 그대로 잡는다: 지그재그 5걸음 240 Hz와 한 프레임(40 ms)이 멈춘 입력에서도 꼭짓점 3개", () => {
    const clean = zigzag(1000 / 240, 5, 0, 4);
    const g1 = createCornerGateStage(createLazyBrushStageFromPct(40));
    applyStrokeStream(g1, clean.slice(0, -1));
    expect(g1.corners).toBe(3);
    // 꼭짓점 직후 표본이 40 ms 늦게 온 입력: 한 걸음 순간 속도(5 px / 40 ms = 0.125 px/ms)는 가드 미만이지만 창 속도는 충분하다.
    const stalled = clean.map((s) => ({ ...s }));
    const lateFrom = 21; // 첫 꼭짓점 직후 표본부터 40 ms 밀린다.
    for (let i = lateFrom; i < stalled.length; i += 1) {
      const s = stalled[i];
      if (s) s.tMs += 40;
    }
    const g2 = createCornerGateStage(createLazyBrushStageFromPct(40));
    applyStrokeStream(g2, stalled.slice(0, -1));
    expect(g2.corners).toBe(3);
  });
});

describe("R-A-2 정점 재방출 시각·속도·잉크 보존", () => {
  it("타임스탬프를 8 ms로 양자화(인접 표본 시각 동일)해도 출력 시각이 비감소이고 속도가 raw의 몇 배 안이다", () => {
    for (const q of [1, 8, 100]) {
      const out = runPipeline(zigzag(4.17, 5, q));
      let maxV = 0;
      for (let i = 0; i < out.length; i += 1) {
        const o = out[i] as ModeledSample;
        maxV = Math.max(maxV, o.velocity);
        if (i > 0) expect(o.tMs, `q=${q} i=${i}`).toBeGreaterThanOrEqual((out[i - 1] as ModeledSample).tMs);
      }
      // raw 속도는 1.2 px/ms. 변경 전(재방출 없음) 최대 1.95, 결함 시 10000.
      expect(maxV, `q=${q}`).toBeLessThan(10);
    }
  });

  it("모든 표본 쌍이 같은 시각(일괄 타임스탬프)이어도 속도가 튀지 않고 시각이 비감소다", () => {
    const base = zigzag(4.17, 5, 0);
    const dup = base.map((s, i) => ({ ...s, tMs: Math.floor(i / 2) * 8.34 }));
    const out = runPipeline(dup);
    for (let i = 1; i < out.length; i += 1) expect((out[i] as ModeledSample).tMs).toBeGreaterThanOrEqual((out[i - 1] as ModeledSample).tMs);
    expect(Math.max(...out.map((o) => o.velocity))).toBeLessThan(10);
  });

  it("재방출 정점의 시각은 (직전 출력, 모서리 표본) 안에 엄격히 있다", () => {
    const raw = zigzag(4.17, 5, 0);
    const out = runPipeline(raw);
    // 정점은 sourceIndex가 같은 연속 두 표본(정점, 모서리 직후 표본) 중 앞의 것이다.
    let seen = 0;
    for (let i = 1; i + 1 < out.length; i += 1) {
      const a = out[i] as ModeledSample;
      const b = out[i + 1] as ModeledSample;
      const before = out[i - 1] as ModeledSample;
      if (a.sourceIndex === b.sourceIndex && a.phase === "move" && b.phase === "move" && a.curvature === 0) {
        seen += 1;
        expect(a.tMs).toBeGreaterThan(before.tMs);
        expect(a.tMs).toBeLessThan(b.tMs);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  // 변경 전(HEAD, 정점 재방출 없음)의 기준선: q=8 양자화 지그재그의 CPU 참조 렌더 알파 합(256², seed 1). 결함 시 이 값의 57~60 %로 줄었다.
  const HEAD_ALPHA_Q8: Record<string, number> = { "ink-g-pen": 430135, "pencil-hb": 111224, "marker-alcohol": 697864 };
  for (const [presetId, headAlpha] of Object.entries(HEAD_ALPHA_Q8)) {
    it(`${presetId}: 양자화(8 ms) 지그재그의 알파 합이 변경 전(HEAD)보다 줄지 않는다`, () => {
      const res = renderStroke(presetById(presetId), zigzag(4.17, 4, 8), { width: 256, height: 256, seed: 1 });
      let total = 0;
      for (let i = 3; i < res.image.data.length; i += 4) total += res.image.data[i] ?? 0;
      expect(total).toBeGreaterThanOrEqual(headAlpha * 0.995);
    });
  }
});

/**
 * 엔진 경계(`boundary.test.ts`: `engine/**`는 `platform/**`를 import하지 않음)를 지키면서
 * `SpeedPressureSimulator` 규약을 동일하게 검증하는 테스트 전용 순수 시뮬레이터.
 */
interface TestSpeedPressureSimulator {
  apply(samples: readonly RawSample[]): RawSample[];
  reset(): void;
}

function createTestSpeedPressureSimulator(): TestSpeedPressureSimulator {
  const slowSpeed = 0.15;
  const fastSpeed = 2.5;
  const maxPressure = 0.9;
  const minPressure = 0.12;
  const speedSmoothing = 0.35;
  const pressureSmoothing = 0.4;
  const fadeInSamples = 4;
  const startPressure = 0.55;

  let prev: { x: number; y: number; tMs: number } | null = null;
  let speed = 0;
  let pressure = startPressure;
  let count = 0;

  const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
  const speedToP = (v: number): number => {
    const t = clamp01((v - slowSpeed) / (fastSpeed - slowSpeed));
    const smooth = t * t * (3 - 2 * t);
    return maxPressure + (minPressure - maxPressure) * smooth;
  };

  const reset = (): void => {
    prev = null;
    speed = 0;
    pressure = startPressure;
    count = 0;
  };

  const apply = (samples: readonly RawSample[]): RawSample[] => {
    const out: RawSample[] = [];
    for (const s of samples) {
      if (s.pointerType !== "mouse" || s.source === "predicted") {
        out.push(s);
        continue;
      }
      if (s.phase === "down") reset();
      if (s.phase === "up") {
        out.push({ ...s, pressure });
        reset();
        continue;
      }
      if (prev) {
        const dt = s.tMs - prev.tMs;
        if (dt <= 0) {
          out.push({ ...s, pressure });
          continue;
        }
        const inst = Math.hypot(s.x - prev.x, s.y - prev.y) / dt;
        speed = count <= 1 ? inst : speed + (inst - speed) * speedSmoothing;
      }
      prev = { x: s.x, y: s.y, tMs: s.tMs };
      count += 1;
      const target = s.phase === "down" ? startPressure : speedToP(speed);
      const blend = clamp01(count / fadeInSamples);
      const goal = startPressure + (target - startPressure) * blend;
      pressure = s.phase === "down" ? startPressure : pressure + (goal - pressure) * pressureSmoothing;
      out.push({ ...s, pressure });
    }
    return out;
  };

  return { apply, reset };
}

/**
 * 시드로부터 동일 시각(`dt = 0`), 역행 시각(`dt < 0`), coalesced 버스트, 예측 표본 혼입을 포함한
 * 적대적 획 표본열을 결정적으로 생성한다(합성 포인터 이벤트 스트림 리플레이 — 실기기 펜 하드웨어 검증 아님).
 */
function generateSeededAdversarialStroke(
  seed: number,
  opts: { canceled?: boolean; pointerType?: RawSample["pointerType"] } = {},
): RawSample[] {
  const rng = new Pcg32(seed, 0x91e);
  const pointerType = opts.pointerType ?? (seed % 2 === 0 ? "mouse" : "pen");
  const steps = 14 + (rng.nextU32() % 18);
  let x = 20 + (rng.nextU32() % 80);
  let y = 20 + (rng.nextU32() % 80);
  let tMs = 100 + (rng.nextU32() % 500);

  const out: RawSample[] = [
    {
      x,
      y,
      tMs,
      pressure: 0.45,
      tiltXDeg: 4,
      tiltYDeg: -3,
      twistDeg: 0,
      pointerType,
      phase: "down",
      source: "raw",
    },
  ];

  for (let i = 1; i <= steps; i += 1) {
    const mode = rng.nextF32();
    let sampleTMs: number;
    if (mode < 0.22) {
      // 동일 타임스탬프 (dt = 0)
      sampleTMs = tMs;
    } else if (mode < 0.42) {
      // 역행 타임스탬프 (dt < 0)
      sampleTMs = Math.max(1, tMs - (1 + (rng.nextU32() % 35)));
    } else {
      tMs += 2 + (rng.nextU32() % 12);
      sampleTMs = tMs;
    }

    // 모서리와 직선 이동을 모두 포함하도록 걸음을 갱신한다
    const angle = i % 5 === 0 ? ((rng.nextF32() - 0.5) * Math.PI * 1.4) : (rng.nextF32() - 0.3) * 0.4;
    const dist = 2 + rng.nextF32() * 14;
    x = Math.max(5, Math.min(240, x + Math.cos(angle) * dist));
    y = Math.max(5, Math.min(240, y + Math.sin(angle) * dist));
    const pressure = 0.15 + rng.nextF32() * 0.75;

    // coalesced 버스트 모사
    if (rng.nextF32() < 0.35) {
      out.push({
        x: x - 1.5,
        y: y - 1.5,
        tMs: sampleTMs,
        pressure,
        tiltXDeg: 2,
        tiltYDeg: -1,
        twistDeg: 0,
        pointerType,
        phase: "move",
        source: "coalesced",
      });
    }

    out.push({
      x,
      y,
      tMs: sampleTMs,
      pressure,
      tiltXDeg: 3,
      tiltYDeg: -2,
      twistDeg: 0,
      pointerType,
      phase: "move",
      source: "raw",
    });

    // 표시 전용 predicted 표본 혼입(정본 상태를 오염시키면 안 됨)
    if (rng.nextF32() < 0.25) {
      out.push({
        x: x + 12,
        y: y - 12,
        tMs: sampleTMs + 4,
        pressure,
        tiltXDeg: 3,
        tiltYDeg: -2,
        twistDeg: 0,
        pointerType,
        phase: "move",
        source: "predicted",
      });
    }
  }

  if (!opts.canceled) {
    const endMode = rng.nextF32();
    const upTMs = endMode < 0.25 ? tMs : endMode < 0.45 ? Math.max(1, tMs - 15) : tMs + 6;
    out.push({
      x: x + 2,
      y: y + 2,
      tMs: upTMs,
      pressure: 0.3,
      tiltXDeg: 0,
      tiltYDeg: 0,
      twistDeg: 0,
      pointerType,
      phase: "up",
      source: "raw",
    });
  }

  return out;
}

describe("합성 포인터 이벤트 스트림 리플레이 — 실기기 펜 하드웨어 검증 아님: dt=0·dt<0·취소 재시작·정본 보존", () => {
  it("시드 1..64 적대적 스트림(dt=0, dt<0, coalesced 버스트): 모든 단계·파이프라인 출력이 유한하고 시각이 단조 비감소다", () => {
    for (let seed = 1; seed <= 64; seed += 1) {
      const raw = generateSeededAdversarialStroke(seed, { canceled: false });
      const speedSim = createTestSpeedPressureSimulator();
      const pressured = speedSim.apply(raw);

      const lazy = createLazyBrushStageFromPct(70);
      const pen = createPenSpringStageFromPct(70);
      const lazyGate = createCornerGateStage(createLazyBrushStageFromPct(70));
      const penGate = createCornerGateStage(createPenSpringStageFromPct(70));

      const outLazy = applyStrokeStream(lazy, pressured).filter((s) => s.source !== "predicted");
      const outPen = applyStrokeStream(pen, pressured).filter((s) => s.source !== "predicted");
      const outLazyGate = applyStrokeStream(lazyGate, pressured).filter((s) => s.source !== "predicted");
      const outPenGate = applyStrokeStream(penGate, pressured).filter((s) => s.source !== "predicted");
      const pipeline = new InputPipeline(DEFAULT_INPUT_CONFIG);
      const outPipeline: ModeledSample[] = [];
      for (let i = 0; i < pressured.length; i += 4) {
        outPipeline.push(...pipeline.push(pressured.slice(i, i + 4)).committed);
      }
      outPipeline.push(...pipeline.finish());

      for (const [label, seq] of [
        ["lazy", outLazy],
        ["pen", outPen],
        ["lazyGate", outLazyGate],
        ["penGate", outPenGate],
      ] as const) {
        expect(seq.length, `seed=${seed} ${label}`).toBeGreaterThanOrEqual(2);
        expect(seq[0]?.phase, `seed=${seed} ${label} start`).toBe("down");
        expect(seq[seq.length - 1]?.phase, `seed=${seed} ${label} end`).toBe("up");
        expect(seq.filter((s) => s.phase === "up").length, `seed=${seed} ${label} single up`).toBe(1);
        for (let i = 0; i < seq.length; i += 1) {
          const s = seq[i];
          expect(Number.isFinite(s?.x), `seed=${seed} ${label} x`).toBe(true);
          expect(Number.isFinite(s?.y), `seed=${seed} ${label} y`).toBe(true);
          expect(Number.isFinite(s?.tMs), `seed=${seed} ${label} tMs`).toBe(true);
          expect(Number.isFinite(s?.pressure), `seed=${seed} ${label} pressure`).toBe(true);
          if (i > 0) {
            expect(s?.tMs, `seed=${seed} ${label} monotonic i=${i}`).toBeGreaterThanOrEqual(seq[i - 1]?.tMs ?? 0);
          }
        }
      }

      expect(outPipeline.length, `seed=${seed} pipeline`).toBeGreaterThanOrEqual(2);
      expect(outPipeline[0]?.phase).toBe("down");
      expect(outPipeline[outPipeline.length - 1]?.phase).toBe("up");
      for (let i = 0; i < outPipeline.length; i += 1) {
        const m = outPipeline[i];
        expect(Number.isFinite(m?.x), `seed=${seed} pipeline x`).toBe(true);
        expect(Number.isFinite(m?.y), `seed=${seed} pipeline y`).toBe(true);
        expect(Number.isFinite(m?.tMs), `seed=${seed} pipeline tMs`).toBe(true);
        expect(Number.isFinite(m?.pressure), `seed=${seed} pipeline pressure`).toBe(true);
        expect(Number.isFinite(m?.velocity), `seed=${seed} pipeline velocity`).toBe(true);
        expect(Number.isFinite(m?.curvature), `seed=${seed} pipeline curvature`).toBe(true);
        if (i > 0) {
          expect(m?.tMs, `seed=${seed} pipeline monotonic i=${i}`).toBeGreaterThanOrEqual(outPipeline[i - 1]?.tMs ?? 0);
        }
      }
    }
  });

  it("획 도중 취소(reset) 후 즉시 새 획 시작 시 이전 취소 획의 잔여 표본·상태 누수가 0이다(새 인스턴스와 비트 동일)", () => {
    for (let seed = 1; seed <= 32; seed += 1) {
      const canceledStroke = generateSeededAdversarialStroke(seed, { canceled: true, pointerType: "mouse" });
      const nextStroke = generateSeededAdversarialStroke(seed + 1000, { canceled: false, pointerType: "mouse" });

      // 1. SpeedPressureSimulator: 중도 취소 후 reset() + 다음 획 vs 깨끗한 인스턴스
      const dirtySpeed = createTestSpeedPressureSimulator();
      dirtySpeed.apply(canceledStroke);
      dirtySpeed.reset();
      const afterCancelSpeed = dirtySpeed.apply(nextStroke);
      const cleanSpeed = createTestSpeedPressureSimulator().apply(nextStroke);
      expect(afterCancelSpeed, `seed=${seed} speedSim`).toEqual(cleanSpeed);

      // 2. LazyBrushStage / PenSpringStage / CornerGateStage: 중도 취소 후 reset() + flush()는 빈 배열이고 다음 획은 새 인스턴스와 비트 동일
      const dirtyLazy = createLazyBrushStageFromPct(80);
      const dirtyPen = createPenSpringStageFromPct(80);
      const dirtyLazyGate = createCornerGateStage(createLazyBrushStageFromPct(80));
      const dirtyPenGate = createCornerGateStage(createPenSpringStageFromPct(80));

      dirtyLazy.apply(canceledStroke);
      dirtyLazy.reset();
      expect(dirtyLazy.flush()).toEqual([]);

      dirtyPen.apply(canceledStroke);
      dirtyPen.reset();
      expect(dirtyPen.flush()).toEqual([]);

      dirtyLazyGate.apply(canceledStroke);
      dirtyLazyGate.reset();
      expect(dirtyLazyGate.flush()).toEqual([]);
      expect(dirtyLazyGate.corners).toBe(0);

      dirtyPenGate.apply(canceledStroke);
      dirtyPenGate.reset();
      expect(dirtyPenGate.flush()).toEqual([]);
      expect(dirtyPenGate.corners).toBe(0);

      expect(applyStrokeStream(dirtyLazy, nextStroke), `seed=${seed} lazy`).toEqual(
        applyStrokeStream(createLazyBrushStageFromPct(80), nextStroke),
      );
      expect(applyStrokeStream(dirtyPen, nextStroke), `seed=${seed} pen`).toEqual(
        applyStrokeStream(createPenSpringStageFromPct(80), nextStroke),
      );
      expect(applyStrokeStream(dirtyLazyGate, nextStroke), `seed=${seed} lazyGate`).toEqual(
        applyStrokeStream(createCornerGateStage(createLazyBrushStageFromPct(80)), nextStroke),
      );
      expect(applyStrokeStream(dirtyPenGate, nextStroke), `seed=${seed} penGate`).toEqual(
        applyStrokeStream(createCornerGateStage(createPenSpringStageFromPct(80)), nextStroke),
      );

      // 3. InputPipeline: 중도 취소 후 reset() -> finish()는 빈 배열이고 다음 획 출력은 새 파이프라인과 비트 동일
      const dirtyPipeline = new InputPipeline(DEFAULT_INPUT_CONFIG);
      dirtyPipeline.push(canceledStroke);
      dirtyPipeline.reset();
      expect(dirtyPipeline.finish()).toEqual([]);
      expect(dirtyPipeline.latency()).toEqual([]);

      const cleanPipeline = new InputPipeline(DEFAULT_INPUT_CONFIG);
      const dirtyOut = [...dirtyPipeline.push(nextStroke).committed, ...dirtyPipeline.finish()];
      const cleanOut = [...cleanPipeline.push(nextStroke).committed, ...cleanPipeline.finish()];
      expect(dirtyOut, `seed=${seed} pipeline`).toEqual(cleanOut);
    }
  });

  it("정본 fixture(lineStroke, zigzagStroke)의 파이프라인 및 단계 출력이 100% 보존된다", () => {
    const canonicalLine = lineStroke(16, 24, 220, 180, 0.65, { durationMs: 500, sampleRateHz: 240 });
    const canonicalZigzag = zigzagStroke(256, { durationMs: 600, sampleRateHz: 240 });

    for (const [name, fixture] of [
      ["lineStroke", canonicalLine],
      ["zigzagStroke", canonicalZigzag],
    ] as const) {
      // 새 인스턴스 기준선
      const basePipeline = runPipeline(fixture);
      const baseLazy = applyStrokeStream(createCornerGateStage(createLazyBrushStageFromPct(50)), fixture);
      const basePen = applyStrokeStream(createCornerGateStage(createPenSpringStageFromPct(50)), fixture);

      // 직전에 적대적 취소 획을 거친 인스턴스에서도 기준선과 비트 단위로 100% 동일해야 한다
      const reusedPipeline = new InputPipeline(DEFAULT_INPUT_CONFIG);
      reusedPipeline.push(generateSeededAdversarialStroke(77, { canceled: true }));
      reusedPipeline.reset();
      const frames = new Map<number, RawSample[]>();
      for (const s of fixture) {
        const k = Math.floor(s.tMs / 16.67);
        const bucket = frames.get(k) ?? [];
        bucket.push(s);
        frames.set(k, bucket);
      }
      const reusedPipelineOut: ModeledSample[] = [];
      for (const key of Array.from(frames.keys()).sort((a, b) => a - b)) {
        reusedPipelineOut.push(...reusedPipeline.push(frames.get(key) ?? []).committed);
      }
      reusedPipelineOut.push(...reusedPipeline.finish());

      const reusedLazyStage = createCornerGateStage(createLazyBrushStageFromPct(50));
      reusedLazyStage.apply(generateSeededAdversarialStroke(77, { canceled: true }));
      reusedLazyStage.reset();

      const reusedPenStage = createCornerGateStage(createPenSpringStageFromPct(50));
      reusedPenStage.apply(generateSeededAdversarialStroke(77, { canceled: true }));
      reusedPenStage.reset();

      expect(reusedPipelineOut, `${name} pipeline`).toEqual(basePipeline);
      expect(applyStrokeStream(reusedLazyStage, fixture), `${name} lazyGate`).toEqual(baseLazy);
      expect(applyStrokeStream(reusedPenStage, fixture), `${name} penGate`).toEqual(basePen);
      expect(basePipeline[0]?.x).toBeCloseTo(fixture[0]?.x ?? 0, 6);
      expect(basePipeline[0]?.y).toBeCloseTo(fixture[0]?.y ?? 0, 6);
      expect(basePipeline[basePipeline.length - 1]?.x).toBeCloseTo(fixture[fixture.length - 1]?.x ?? 0, 6);
      expect(basePipeline[basePipeline.length - 1]?.y).toBeCloseTo(fixture[fixture.length - 1]?.y ?? 0, 6);
    }
  });
});

