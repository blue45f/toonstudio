import { describe, expect, it } from "vitest";

import golden from "../../../test-data/mixbox-golden.json" with { type: "json" };
import { SumiError } from "../core/errors";

import {
  mixboxLatentToRgb,
  mixboxLerp,
  mixboxLerpLatent,
  mixboxMultiMix,
  rgbToMixboxLatent,
  saundersonCorrect,
  saundersonInverse,
  type RGBA,
} from "./mixbox-compat";

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

  it("Saunderson 표면 반사 보정과 역변환이 왕복 일관성을 유지한다", () => {
    for (const rInt of [0.05, 0.2, 0.5, 0.85, 0.98]) {
      const measured = saundersonCorrect(rInt);
      const recovered = saundersonInverse(measured);
      expect(Math.abs(recovered - rInt)).toBeLessThan(1e-3);
    }
  });

  it("7채널 잠재 안료 분해·복원(rgbToMixboxLatent ↔ mixboxLatentToRgb)이 왕복 무손실을 보장한다", () => {
    const samples: readonly RGBA[] = [
      [0.92, 0.82, 0.12, 1],
      [0.06, 0.24, 0.78, 0.9],
      [0.75, 0.11, 0.32, 0.75],
      [0.25, 0.62, 0.38, 1],
    ];
    for (const sample of samples) {
      const latent = rgbToMixboxLatent(sample);
      const concSum = latent[0] + latent[1] + latent[2] + latent[3];
      expect(Math.abs(concSum - 1)).toBeLessThan(1e-5);
      const restored = mixboxLatentToRgb(latent, sample[3]);
      expect(Math.abs(restored[0] - sample[0])).toBeLessThan(1e-5);
      expect(Math.abs(restored[1] - sample[1])).toBeLessThan(1e-5);
      expect(Math.abs(restored[2] - sample[2])).toBeLessThan(1e-5);
      expect(restored[3]).toBe(f32(sample[3]));
    }
  });

  it("mixboxLerpLatent: 청색+황색 중간 혼합에서 녹색 채널 우세와 양끝 정확도를 보장한다", () => {
    const blue: RGBA = [0.05, 0.22, 0.86, 1];
    const yellow: RGBA = [0.95, 0.88, 0.08, 1];
    expect(mixboxLerpLatent(blue, yellow, 0)).toEqual([
      f32(blue[0]),
      f32(blue[1]),
      f32(blue[2]),
      1,
    ]);
    expect(mixboxLerpLatent(blue, yellow, 1)).toEqual([
      f32(yellow[0]),
      f32(yellow[1]),
      f32(yellow[2]),
      1,
    ]);

    const midLatent = mixboxLerpLatent(blue, yellow, 0.5, 0.5);
    const midKm = mixboxLerp(blue, yellow, 0.5);
    // 녹색 대역이 적·청 대역보다 높고 기본 KM 대비 녹색 채도가 강화된다
    expect(midLatent[1]).toBeGreaterThan(midLatent[0]);
    expect(midLatent[1]).toBeGreaterThan(midKm[1]);
  });

  it("mixboxMultiMix: 다중 안료 가중 혼합이 순서 불변성과 단일 안료 항등성을 만족한다", () => {
    const c1: RGBA = [0.1, 0.3, 0.8, 1];
    const c2: RGBA = [0.9, 0.8, 0.1, 0.6];
    const c3: RGBA = [0.8, 0.15, 0.25, 0.8];

    const single = mixboxMultiMix([{ color: c1, weight: 2.5 }]);
    expect(Math.abs(single[0] - c1[0])).toBeLessThan(1e-4);
    expect(Math.abs(single[1] - c1[1])).toBeLessThan(1e-4);
    expect(Math.abs(single[2] - c1[2])).toBeLessThan(1e-4);

    const mixA = mixboxMultiMix([
      { color: c1, weight: 0.4 },
      { color: c2, weight: 0.35 },
      { color: c3, weight: 0.25 },
    ]);
    const mixB = mixboxMultiMix([
      { color: c3, weight: 0.25 },
      { color: c1, weight: 0.4 },
      { color: c2, weight: 0.35 },
    ]);
    expect(Math.abs(mixA[0] - mixB[0])).toBeLessThan(1e-5);
    expect(Math.abs(mixA[1] - mixB[1])).toBeLessThan(1e-5);
    expect(Math.abs(mixA[2] - mixB[2])).toBeLessThan(1e-5);
    expect(Math.abs(mixA[3] - mixB[3])).toBeLessThan(1e-5);
    expect(() => mixboxMultiMix([])).toThrow(SumiError);
  });
});

