import { describe, expect, it } from "vitest";

import { polylineSamples, rawSample } from "../../testing/stage-samples";

import { applyStrokeStream, composeStages } from "./chain";
import { createLazyBrushStage } from "./lazy-brush";
import { createPassthroughStage } from "./passthrough";
import { createPenSpringStage } from "./pen-spring";

import type { RawStage } from "./raw-stage";
import type { RawSample } from "../../core/types";

describe("통과 단계", () => {
  it("표본을 바꾸지 않고 복사하며 flush는 비어 있다", () => {
    const stage = createPassthroughStage();
    const input = [rawSample(1, 2, 0, "down"), rawSample(3, 4, 4, "up")];
    const out = stage.apply(input);
    expect(out).toEqual(input);
    expect(out[0]).not.toBe(input[0]);
    expect(stage.flush()).toEqual([]);
  });
});

describe("단계 체인 합성", () => {
  it("단계가 0개면 통과와 같고 id·label이 합성된다", () => {
    const empty = composeStages([]);
    expect(empty.id).toBe("passthrough");
    const input = [rawSample(1, 2, 0, "down"), rawSample(3, 4, 4, "up")];
    expect(applyStrokeStream(empty, input)).toEqual(input);
    const chain = composeStages([createLazyBrushStage({ radiusPx: 5 }), createPassthroughStage()]);
    expect(chain.id).toBe("lazy-brush>passthrough");
    expect(chain.label).toContain("→");
  });

  it("앞 단계의 마무리 표본이 뒤 단계에 도착하고 전체 출력은 up 하나로 끝난다", () => {
    const samples = polylineSamples([[10, 10], [180, 10]], 1.5);
    const chain = composeStages([createLazyBrushStage({ radiusPx: 20 }), createPenSpringStage({ lagMs: 15 })]);
    const out = applyStrokeStream(chain, samples);
    expect(out[out.length - 1]).toMatchObject({ x: 180, y: 10, phase: "up" });
    expect(out.filter((s) => s.phase === "up")).toHaveLength(1);
    expect(out.filter((s) => s.phase === "down")).toHaveLength(1);
    for (let i = 1; i < out.length; i += 1) expect(out[i]?.tMs).toBeGreaterThanOrEqual(out[i - 1]?.tMs ?? 0);
  });

  it("reset은 모든 단계를 초기화한다: 보류한 up이 사라지고 다음 flush는 비어 있다", () => {
    const chain = composeStages([createLazyBrushStage({ radiusPx: 20 }), createPenSpringStage({ lagMs: 15 })]);
    chain.apply([rawSample(0, 0, 0, "down"), rawSample(100, 0, 4, "move"), rawSample(100, 0, 8, "up")]);
    chain.reset();
    expect(chain.flush()).toEqual([]);
  });

  it("한 배열 안의 두 획은 획마다 마무리된다(up 뒤 down)", () => {
    const a = polylineSamples([[0, 0], [60, 0]], 1.5);
    const b = polylineSamples([[0, 50], [60, 50]], 1.5).map((s) => ({ ...s, tMs: s.tMs + 1000 }));
    const out = applyStrokeStream(createLazyBrushStage({ radiusPx: 15 }), [...a, ...b]);
    expect(out.filter((s) => s.phase === "down")).toHaveLength(2);
    expect(out.filter((s) => s.phase === "up")).toHaveLength(2);
    const firstUp = out.findIndex((s) => s.phase === "up");
    expect(out[firstUp]).toMatchObject({ x: 60, y: 0 });
    expect(out[out.length - 1]).toMatchObject({ x: 60, y: 50, phase: "up" });
  });

  it("R-A-3 한 단계가 수십만 표본을 내도 applyStrokeStream·composeStages가 던지지 않는다(스프레드 인자 한도)", () => {
    const BIG = 500_000;
    const make = (n: number, from: RawSample): RawSample[] => Array.from({ length: n }, (_, i) => ({ ...from, tMs: from.tMs + i * 0.001 }));
    const flooder: RawStage = {
      id: "flooder",
      label: "범람",
      apply: (samples) => samples.map((s) => ({ ...s })),
      flush: () => make(BIG, rawSample(1, 1, 10, "up")),
      reset: () => undefined,
    };
    const input = [rawSample(0, 0, 0, "down"), rawSample(1, 1, 4, "up")];
    expect(() => applyStrokeStream(flooder, input)).not.toThrow();
    expect(applyStrokeStream(flooder, input)).toHaveLength(2 + BIG);
    const chain = composeStages([flooder, createPassthroughStage()]);
    expect(() => chain.flush()).not.toThrow();
    // 한 번에 큰 배열을 만드는 apply도 마찬가지다.
    const bigApply: RawStage = { ...flooder, id: "big-apply", apply: (samples) => samples.flatMap((s) => make(BIG, s)), flush: () => [] };
    expect(() => applyStrokeStream(bigApply, [rawSample(0, 0, 0, "down"), rawSample(1, 1, 4, "up")])).not.toThrow();
  });
});
