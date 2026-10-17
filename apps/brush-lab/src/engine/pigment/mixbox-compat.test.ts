import { describe, expect, it } from "vitest";

import golden from "../../../test-data/mixbox-golden.json" with { type: "json" };
import { SumiError } from "../core/errors";

import { mixboxLerp, type RGBA } from "./mixbox-compat";

interface GoldenCombo {
  readonly colorA: RGBA;
  readonly colorB: RGBA;
  readonly t: number;
  readonly expected: RGBA;
}

interface GoldenFixture {
  readonly source: string;
  readonly combos: readonly GoldenCombo[];
}

const f32 = Math.fround;

describe("Mixbox 호환 lerp(KM mixer 기반)", () => {
  it("t는 [0, 1]로 클램프된다(t < 0 → 0, t > 1 → 1)", () => {
    const a: RGBA = [0, 0, 0, 1];
    const b: RGBA = [1, 1, 1, 1];
    expect(mixboxLerp(a, b, -0.5)).toEqual(mixboxLerp(a, b, 0));
    expect(mixboxLerp(a, b, 2)).toEqual(mixboxLerp(a, b, 1));
  });

  it("알파가 [0, 1]을 벗어나면 SumiError('md-invalid-alpha')를 던진다", () => {
    const a: RGBA = [0.5, 0.5, 0.5, 1];
    const b: RGBA = [1, 1, 1, 1];
    expect(() => mixboxLerp([0.5, 0.5, 0.5, -0.1] as RGBA, b, 0.5)).toThrow(SumiError);
    expect(() => mixboxLerp(a, [1, 1, 1, 1.2] as RGBA, 0.5)).toThrow(SumiError);
    expect(() => mixboxLerp([0.5, 0.5, 0.5, NaN as unknown as number] as RGBA, b, 0.5)).toThrow(
      SumiError,
    );
  });

  it("비금속 색상 보간: 같은 색이면 그 색이 나온다", () => {
    const c: RGBA = [0.2, 0.3, 0.4, 1];
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expect(mixboxLerp(c, c, t)).toEqual([f32(0.2), f32(0.3), f32(0.4), 1]);
    }
  });

  it("골든 피치(mixbox-golden.json): concept 기대 출력과 비트 동일", () => {
    const fixture: GoldenFixture = golden as unknown as GoldenFixture;
    expect(fixture.source).toBe("concept-verification");
    for (const combo of fixture.combos) {
      expect(mixboxLerp(combo.colorA, combo.colorB, combo.t)).toEqual([
        f32(combo.expected[0]),
        f32(combo.expected[1]),
        f32(combo.expected[2]),
        f32(combo.expected[3]),
      ]);
    }
  });
});
