/**
 * 다항식 기저 표와 생성된 모델 상수의 성질 시험. 생성 파일이 최신인지는 scripts/ 쪽 시험이 `--check`로 증명하므로
 * 여기서는 앱이 읽는 상수가 구조적으로 올바르고 순수 안료 꼭짓점을 재현하는지만 본다.
 */
import { describe, expect, it } from "vitest";

import {
  LATENT_PIGMENT_BASIS_ID,
  LATENT_PIGMENT_CHANNEL_COUNT,
  LATENT_PIGMENT_COUNT,
  LATENT_PIGMENT_TERMS,
  LATENT_PIGMENT_TERM_COUNT,
  evaluateLatentPigmentTerms,
} from "./latent-pigment-basis";
import {
  LATENT_PIGMENT_COEFFICIENTS,
  LATENT_PIGMENT_FIT_ERROR,
  LATENT_PIGMENT_MODEL_BASIS_ID,
  LATENT_PIGMENT_MODEL_PIGMENT_IDS,
  LATENT_PIGMENT_REFERENCE_VERTEX_EIGHT_BIT,
} from "./latent-pigment-model.generated";

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** 중복 순열 수: (a,a,a)=1, (a,a,b)=3, (a,b,c)=6. */
function multiplicity(term: readonly [number, number, number]): number {
  const distinct = new Set(term).size;
  return distinct === 1 ? 1 : distinct === 2 ? 3 : 6;
}

function polynomialAt(channel: number, concentrations: readonly number[]): number {
  const terms = new Float64Array(LATENT_PIGMENT_TERM_COUNT);
  evaluateLatentPigmentTerms(concentrations, terms);
  return LATENT_PIGMENT_COEFFICIENTS[channel].reduce((sum, coefficient, index) => sum + coefficient * terms[index], 0);
}

describe("다항식 기저 표", () => {
  it("네 변수 3차 동차 단항식 20개를 중복 없이 사전순으로 담는다", () => {
    expect(LATENT_PIGMENT_COUNT).toBe(4);
    expect(LATENT_PIGMENT_CHANNEL_COUNT).toBe(3);
    expect(LATENT_PIGMENT_TERMS).toHaveLength(LATENT_PIGMENT_TERM_COUNT);
    expect(LATENT_PIGMENT_TERM_COUNT).toBe(20);
    const keys = LATENT_PIGMENT_TERMS.map((term) => term.join(""));
    expect(new Set(keys).size).toBe(20);
    expect([...keys].sort()).toEqual(keys);
    for (const [first, second, third] of LATENT_PIGMENT_TERMS) {
      expect(first <= second && second <= third).toBe(true);
      expect(first >= 0 && third < LATENT_PIGMENT_COUNT).toBe(true);
    }
  });

  it("세제곱 4개, 제곱×1차 12개, 서로 다른 셋의 곱 4개로 이루어진다", () => {
    const sizes = LATENT_PIGMENT_TERMS.map((term) => new Set(term).size);
    expect(sizes.filter((size) => size === 1)).toHaveLength(4);
    expect(sizes.filter((size) => size === 2)).toHaveLength(12);
    expect(sizes.filter((size) => size === 3)).toHaveLength(4);
  });

  it("다중도를 곱해 모두 더하면 (농도 합)^3 이다(기저 표 항등식)", () => {
    const points: readonly (readonly number[])[] = [
      [1, 0, 0, 0], [0.25, 0.25, 0.25, 0.25], [0.1, 0.2, 0.3, 0.4], [0.7, 0, 0.3, 0], [0.05, 0.9, 0.03, 0.02],
    ];
    const terms = new Float64Array(LATENT_PIGMENT_TERM_COUNT);
    for (const point of points) {
      evaluateLatentPigmentTerms(point, terms);
      const total = LATENT_PIGMENT_TERMS.reduce((sum, term, index) => sum + multiplicity(term) * terms[index], 0);
      expect(total).toBeCloseTo(1, 12);
    }
    evaluateLatentPigmentTerms([2, 0, 0, 1], terms);
    const scaled = LATENT_PIGMENT_TERMS.reduce((sum, term, index) => sum + multiplicity(term) * terms[index], 0);
    expect(scaled).toBeCloseTo(27, 10);
  });
});

describe("생성된 모델 상수", () => {
  it("기저 식별자와 계수 모양이 기저 표와 맞고 모든 값이 유한하다", () => {
    expect(LATENT_PIGMENT_MODEL_BASIS_ID).toBe(LATENT_PIGMENT_BASIS_ID);
    expect(LATENT_PIGMENT_COEFFICIENTS).toHaveLength(LATENT_PIGMENT_CHANNEL_COUNT);
    for (const channel of LATENT_PIGMENT_COEFFICIENTS) {
      expect(channel).toHaveLength(LATENT_PIGMENT_TERM_COUNT);
      expect(channel.every(Number.isFinite)).toBe(true);
    }
    expect(LATENT_PIGMENT_MODEL_PIGMENT_IDS).toEqual(["white", "yellow", "blue", "magenta"]);
  });

  it("상수는 수십 개 규모다(계수 60개와 꼭짓점 12개, 오차 통계 몇 개)", () => {
    const count = LATENT_PIGMENT_COEFFICIENTS.flat().length
      + LATENT_PIGMENT_REFERENCE_VERTEX_EIGHT_BIT.flat().length
      + Object.values(LATENT_PIGMENT_FIT_ERROR.training).length
      + Object.values(LATENT_PIGMENT_FIT_ERROR.validation).length;
    expect(count).toBeLessThan(100);
  });

  it("농도가 순수 안료 하나일 때 다항식이 기록된 꼭짓점 색을 재현한다(앵커 가중)", () => {
    LATENT_PIGMENT_REFERENCE_VERTEX_EIGHT_BIT.forEach((vertex, pigment) => {
      const point = [0, 0, 0, 0].map((_, index) => (index === pigment ? 1 : 0));
      for (let channel = 0; channel < 3; channel += 1) {
        // 3차 항 하나만 남으므로 꼭짓점 값은 해당 안료의 세제곱 항 계수와 같다.
        const termIndex = LATENT_PIGMENT_TERMS.findIndex((term) => term.every((slot) => slot === pigment));
        expect(polynomialAt(channel, point)).toBeCloseTo(LATENT_PIGMENT_COEFFICIENTS[channel][termIndex], 12);
        expect(Math.abs(clamp01(polynomialAt(channel, point)) * 255 - vertex[channel])).toBeLessThan(3);
      }
    });
  });

  it("꼭짓점 색이 안료 이름과 맞는다(흰색 밝음, 노랑 R·G 높음, 파랑 B 우세, 자홍 G 최소)", () => {
    const [white, yellow, blue, magenta] = LATENT_PIGMENT_REFERENCE_VERTEX_EIGHT_BIT;
    expect(Math.min(...white)).toBeGreaterThan(235);
    expect(yellow[0]).toBeGreaterThan(200);
    expect(yellow[1]).toBeGreaterThan(180);
    expect(yellow[2]).toBeLessThan(60);
    expect(blue[2]).toBeGreaterThan(blue[0]);
    expect(blue[2]).toBeGreaterThan(blue[1]);
    expect(magenta[1]).toBeLessThan(magenta[0]);
    expect(magenta[1]).toBeLessThan(magenta[2]);
  });

  it("다항식 상(像)이 흰색에서 어두운 쪽까지 이어지고 중립에 가까운 회색 축을 가진다", () => {
    // 흰색 꼭짓점에서 노랑·파랑·자홍을 같은 비율로 늘려 가면 밝기가 줄고 색 치우침은 작다.
    let previousLuma = Infinity;
    for (const colorant of [0, 0.05, 0.1, 0.15, 0.2, 0.25, 1 / 3]) {
      const point = [1 - 3 * colorant, colorant, colorant, colorant];
      const channels = [0, 1, 2].map((channel) => clamp01(polynomialAt(channel, point)));
      const luma = (channels[0] + channels[1] + channels[2]) / 3;
      expect(luma).toBeLessThan(previousLuma);
      previousLuma = luma;
      expect(Math.max(...channels) - Math.min(...channels)).toBeLessThan(14 / 255);
    }
    expect(previousLuma).toBeLessThan(0.35);
  });
});
