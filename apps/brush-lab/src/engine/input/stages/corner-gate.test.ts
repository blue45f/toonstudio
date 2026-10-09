import { describe, expect, it } from "vitest";

import { polylineSamples, rawSample } from "../../testing/stage-samples";

import { applyStrokeStream } from "./chain";
import { createCornerGateStage } from "./corner-gate";
import { createLazyBrushStage, createLazyBrushStageFromPct } from "./lazy-brush";
import { createPassthroughStage } from "./passthrough";
import { createPenSpringStage } from "./pen-spring";

import type { RawSample } from "../../core/types";

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2)) : 0;
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

/** 출력 폴리라인에서 점 (vx, vy)까지의 최소 거리. */
function distToPolyline(out: readonly RawSample[], vx: number, vy: number): number {
  let d = Number.POSITIVE_INFINITY;
  for (let i = 1; i < out.length; i += 1) {
    const a = out[i - 1];
    const b = out[i];
    if (a && b) d = Math.min(d, distToSegment(vx, vy, a.x, a.y, b.x, b.y));
  }
  return d;
}

const ZIGZAG: [number, number][] = [
  [20, 100],
  [60, 20],
  [100, 100],
  [140, 20],
  [180, 100],
];

describe("코너 게이트(메타 단계)", () => {
  it("끈 당김만 쓰면 모서리를 깎고, 게이트로 감싸면 모든 꼭짓점을 지난다", () => {
    const samples = polylineSamples(ZIGZAG, 1.2);
    const plain = applyStrokeStream(createLazyBrushStage({ radiusPx: 14 }), samples);
    const gated = applyStrokeStream(createCornerGateStage(createLazyBrushStage({ radiusPx: 14 })), samples);
    for (const [vx, vy] of ZIGZAG.slice(1, -1)) {
      expect(distToPolyline(plain, vx, vy)).toBeGreaterThan(3);
      expect(distToPolyline(gated, vx, vy)).toBeLessThanOrEqual(0.05);
    }
  });

  it("물리 펜(ζ=1)도 게이트로 꼭짓점을 지나고 목표 끝점에 정확히 닿는다", () => {
    const samples = polylineSamples(ZIGZAG, 1.2);
    const plain = applyStrokeStream(createPenSpringStage({ lagMs: 20 }), samples);
    const gated = applyStrokeStream(createCornerGateStage(createPenSpringStage({ lagMs: 20 })), samples);
    for (const [vx, vy] of ZIGZAG.slice(1, -1)) {
      expect(distToPolyline(plain, vx, vy)).toBeGreaterThan(3);
      expect(distToPolyline(gated, vx, vy)).toBeLessThanOrEqual(0.05);
    }
    expect(gated[gated.length - 1]).toMatchObject({ x: 180, y: 100, phase: "up" });
  });

  it("출력은 down으로 시작해 up 하나로 끝나고 시각이 비감소이며 phase 중간은 move다", () => {
    const gate = createCornerGateStage(createLazyBrushStage({ radiusPx: 14 }));
    const out = applyStrokeStream(gate, polylineSamples(ZIGZAG, 1.2));
    expect(out[0]?.phase).toBe("down");
    expect(out[out.length - 1]?.phase).toBe("up");
    expect(out.slice(1, -1).every((s) => s.phase === "move")).toBe(true);
    for (let i = 1; i < out.length; i += 1) expect(out[i]?.tMs).toBeGreaterThanOrEqual(out[i - 1]?.tMs ?? 0);
    expect(gate.corners).toBe(3); // 다음 down에서 초기화되기 전까지 남아 있다
  });

  it("모서리 판정 횟수는 지그재그 꼭짓점 수와 같다(획 도중 읽을 때)", () => {
    const gate = createCornerGateStage(createLazyBrushStage({ radiusPx: 14 }));
    gate.apply(polylineSamples(ZIGZAG, 1.2).slice(0, -1));
    expect(gate.corners).toBe(3);
  });

  it("속도 가드: 저속 손떨림(0.1 px/ms)은 모서리로 오탐하지 않고 통과 단계의 출력과 같다", () => {
    // 0.1 px/ms 로 가는 폴리라인(직각 꺾임 포함)은 속도 가드 미만이라 재시작이 일어나지 않는다.
    const slow = polylineSamples([[10, 10], [40, 10], [40, 40], [10, 40]], 0.1);
    const gate = createCornerGateStage(createPassthroughStage());
    gate.apply(slow.slice(0, -1));
    expect(gate.corners).toBe(0);
    const fast = createCornerGateStage(createPassthroughStage());
    fast.apply(polylineSamples([[10, 10], [40, 10], [40, 40], [10, 40]], 1).slice(0, -1));
    expect(fast.corners).toBe(2);
  });

  it("직선 위의 지터(잡음)에는 반응하지 않는다", () => {
    const gate = createCornerGateStage(createLazyBrushStage({ radiusPx: 6 }));
    const noisy: RawSample[] = [rawSample(0, 0, 0, "down")];
    for (let i = 1; i < 200; i += 1) noisy.push(rawSample(i * 1.2, (i % 2 === 0 ? 0.25 : -0.25), i * 4.17, "move"));
    gate.apply(noisy);
    expect(gate.corners).toBe(0);
  });

  it("reset은 내부 단계까지 초기화하고 결정적이다", () => {
    const run = (): RawSample[] => applyStrokeStream(createCornerGateStage(createPenSpringStage({ lagMs: 15 })), polylineSamples(ZIGZAG, 1.5));
    expect(run()).toEqual(run());
    const gate = createCornerGateStage(createLazyBrushStage({ radiusPx: 20 }));
    gate.apply([rawSample(0, 0, 0, "down"), rawSample(100, 0, 20, "move"), rawSample(100, 0, 24, "up")]);
    gate.reset();
    expect(gate.flush()).toEqual([]);
  });

  it("R-A-3 모서리 표본과 up이 직전 표본과 같은 tMs여도 마무리가 폭주하지 않고 던지지 않는다(끈 당김+게이트)", () => {
    const samples: RawSample[] = [rawSample(0, 0, 0, "down")];
    let t = 0;
    let x = 0;
    for (let i = 0; i < 10; i += 1) {
      t += 4.17;
      x += 5;
      samples.push(rawSample(x, 0, t, "move"));
    }
    samples.push(rawSample(x, 5, t, "move")); // 모서리 표본: 직전과 같은 tMs
    samples.push(rawSample(x, 10, t, "up")); // up도 같은 tMs
    const gate = createCornerGateStage(createLazyBrushStageFromPct(40));
    let produced = 0;
    expect(() => {
      for (const s of samples) produced += applyStrokeStream(gate, [s]).length;
    }).not.toThrow();
    expect(produced).toBeLessThan(samples.length + 200);
    // 한 번에 흘려도 같다.
    const out = applyStrokeStream(createCornerGateStage(createLazyBrushStageFromPct(40)), samples);
    expect(out[out.length - 1]).toMatchObject({ x, y: 10, phase: "up" });
    expect(out.filter((s) => s.phase === "up")).toHaveLength(1);
    for (let i = 1; i < out.length; i += 1) expect(out[i]?.tMs).toBeGreaterThanOrEqual(out[i - 1]?.tMs ?? 0);
  });

  it("R-A-3 정점을 끼울 시각 구간이 없으면(같은 tMs) 게이트는 재시작하지 않고 모서리로 세지 않는다", () => {
    const gate = createCornerGateStage(createPassthroughStage());
    const samples: RawSample[] = [rawSample(0, 0, 0, "down")];
    for (let i = 1; i <= 12; i += 1) samples.push(rawSample(i * 5, 0, i * 4.17, "move"));
    samples.push(rawSample(60, 8, 12 * 4.17, "move")); // 꺾임 표본이 직전과 같은 tMs
    gate.apply(samples);
    expect(gate.corners).toBe(0);
  });
});
