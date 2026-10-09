import { describe, expect, it } from "vitest";

import { Pcg32 } from "../core/rng";
import { presetById } from "../presets/catalog";
import { renderStroke } from "../raster/reference-renderer";

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
