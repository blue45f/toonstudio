/**
 * 잠재 안료 혼합기 속성 시험. 기대값은 모두 성질(왕복·항등·교환·정규화·연속·방향성·결정성·거부)에서
 * 나온다. 다른 구현의 출력값을 상수로 쓰지 않는다. 난수는 고정 시드 선형 합동 생성기만 쓴다.
 */
import { describe, expect, it, vi } from "vitest";

import { LATENT_PIGMENT_TERMS } from "./latent-pigment-basis";
import {
  clearLatentPigmentCache,
  getLatentPigmentCacheStats,
  latentPigmentToRgb,
  mixLatentPigments,
  mixRgbPigments,
  mixRgbPigmentsChromaPreserving,
  rgbToLatentPigment,
} from "./latent-pigment-mixer";
import type { LatentPigment, LatentPigmentRgb } from "./latent-pigment-mixer";
import { LATENT_PIGMENT_COEFFICIENTS } from "./latent-pigment-model.generated";

/** Park–Miller 선형 합동 생성기. 같은 시드면 같은 수열이다. */
function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

function eightBit(rgb: LatentPigmentRgb): readonly number[] {
  return rgb.map((value) => Math.round(value * 255));
}

function fromEightBit(r: number, g: number, b: number): LatentPigmentRgb {
  return [r / 255, g / 255, b / 255];
}

function maxAbsoluteDifference(a: LatentPigmentRgb, b: LatentPigmentRgb): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** 시험용 독립 구현: 농도에서 0~1로 자른 다항식 색을 계산한다(기저 표와 생성 계수만 쓴다). */
function modelColor(concentrations: readonly number[]): LatentPigmentRgb {
  const terms = LATENT_PIGMENT_TERMS.map(([a, b, c]) => concentrations[a] * concentrations[b] * concentrations[c]);
  const channel = (coefficients: readonly number[]): number => clamp01(
    coefficients.reduce((sum, coefficient, index) => sum + coefficient * terms[index], 0),
  );
  return [channel(LATENT_PIGMENT_COEFFICIENTS[0]), channel(LATENT_PIGMENT_COEFFICIENTS[1]), channel(LATENT_PIGMENT_COEFFICIENTS[2])];
}

function randomSimplexPoint(random: () => number): readonly number[] {
  const raw = [random(), random(), random(), random()];
  const total = raw.reduce((sum, value) => sum + value, 0);
  return raw.map((value) => value / total);
}

describe("잠재 색 변환의 왕복", () => {
  it("임의의 부동소수 색은 1e-9 이하의 오차로 되돌아온다", () => {
    const random = createRandom(20261015);
    let worst = 0;
    for (let index = 0; index < 3000; index += 1) {
      const rgb: LatentPigmentRgb = [random(), random(), random()];
      worst = Math.max(worst, maxAbsoluteDifference(latentPigmentToRgb(rgbToLatentPigment(rgb)), rgb));
    }
    expect(worst).toBeLessThanOrEqual(1e-9);
  });

  it("임의의 8비트 색은 오차 0으로 되돌아온다", () => {
    const random = createRandom(7);
    for (let index = 0; index < 4000; index += 1) {
      const source: readonly [number, number, number] = [Math.floor(random() * 256), Math.floor(random() * 256), Math.floor(random() * 256)];
      const back = latentPigmentToRgb(rgbToLatentPigment(fromEightBit(source[0], source[1], source[2])));
      expect(eightBit(back)).toEqual(source);
    }
  });

  it("회색 램프와 채널별 램프 전체(256단계)가 오차 0으로 되돌아온다", () => {
    for (let level = 0; level < 256; level += 1) {
      const sources: readonly (readonly [number, number, number])[] = [
        [level, level, level], [level, 0, 0], [0, level, 0], [0, 0, level], [level, 255, 0], [255 - level, level, 255],
      ];
      for (const source of sources) {
        expect(eightBit(latentPigmentToRgb(rgbToLatentPigment(fromEightBit(source[0], source[1], source[2]))))).toEqual(source);
      }
    }
  });

  it("RGB 큐브의 8개 꼭짓점과 경계값 0·1이 보존된다", () => {
    for (let mask = 0; mask < 8; mask += 1) {
      const rgb: LatentPigmentRgb = [mask & 1, (mask >> 1) & 1, (mask >> 2) & 1];
      expect(maxAbsoluteDifference(latentPigmentToRgb(rgbToLatentPigment(rgb)), rgb)).toBeLessThanOrEqual(1e-9);
    }
  });

  it("잠재 색의 농도는 0 이상이고 합이 1이며 모든 값이 유한하다", () => {
    const random = createRandom(11);
    for (let index = 0; index < 1500; index += 1) {
      const latent = rgbToLatentPigment([random(), random(), random()]);
      expect(latent.concentrations).toHaveLength(4);
      expect(latent.residual).toHaveLength(3);
      expect(latent.concentrations.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
      expect(latent.concentrations.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
      expect(latent.residual.every(Number.isFinite)).toBe(true);
    }
  });

  it("같은 색은 호출 순서와 무관하게 항상 같은 잠재 색을 낸다(결정성)", () => {
    const random = createRandom(31);
    const colors = Array.from({ length: 200 }, (): LatentPigmentRgb => [random(), random(), random()]);
    const forward = colors.map((color) => rgbToLatentPigment(color));
    const backward = [...colors].reverse().map((color) => rgbToLatentPigment(color)).reverse();
    expect(backward).toEqual(forward);
    expect(colors.map((color) => rgbToLatentPigment(color))).toEqual(forward);
  });
});

describe("역방향 풀이의 품질", () => {
  it("안료 색역 안의 색은 잔차가 사실상 0이다(해가 정확히 존재할 때 거의 항상 찾는다)", () => {
    // 실측 보장 수준: 2만 개 중 99.99% 이상이 1e-5 미만이고 최대 오차도 1e-3 미만이다. 여기서는 4000개로 확인한다.
    const random = createRandom(101);
    const count = 4000;
    let exact = 0;
    let worstResidual = 0;
    for (let index = 0; index < count; index += 1) {
      const target = modelColor(randomSimplexPoint(random));
      const residual = Math.max(...rgbToLatentPigment(target).residual.map(Math.abs));
      if (residual < 1e-5) exact += 1;
      worstResidual = Math.max(worstResidual, residual);
    }
    expect(exact / count).toBeGreaterThanOrEqual(0.999);
    expect(worstResidual).toBeLessThan(1e-3);
  });

  function faceTargets(seed: number, count: number): readonly LatentPigmentRgb[] {
    const random = createRandom(seed);
    return Array.from({ length: count }, () => {
      const point = [...randomSimplexPoint(random)];
      point[Math.floor(random() * 4)] = random() < 0.5 ? 0 : 1e-4;
      const total = point.reduce((sum, value) => sum + value, 0);
      return modelColor(point.map((value) => value / total));
    });
  }

  it("안료 하나의 농도가 0이거나 아주 작은 색(단체의 면)도 표시 범위 안쪽이면 정확히 푼다", () => {
    const inside = faceTargets(55, 4000).filter((color) => Math.min(...color) >= 0.02 && Math.max(...color) <= 0.98);
    expect(inside.length).toBeGreaterThan(2500);
    const worst = Math.max(...inside.map((color) => Math.max(...rgbToLatentPigment(color).residual.map(Math.abs))));
    expect(worst).toBeLessThan(1e-5);
  });

  it("sRGB 경계(채널이 0이거나 1)에 닿는 안료 색은 경계로 정규화되어 표시 오차 8e-3(약 2/255) 이내로 풀린다", () => {
    const onEdge = faceTargets(56, 4000).filter((color) => Math.min(...color) < 0.02 || Math.max(...color) > 0.98);
    expect(onEdge.length).toBeGreaterThan(200);
    const worst = Math.max(...onEdge.map((color) => Math.max(...rgbToLatentPigment(color).residual.map(Math.abs))));
    expect(worst).toBeLessThan(8e-3);
  });

  it("임의의 색에서 모델 색까지의 가중 거리가 격자 전수 탐색의 최솟값보다 나쁘지 않다", () => {
    // 혼합기는 명도 오차에 0.25를 곱한 색도 우선 거리를 최소화한다(latent-pigment-mixer.ts의 LUMINANCE_WEIGHT).
    const shiftFactor = Math.sqrt(0.25) - 1;
    const weightedDistance = (a: LatentPigmentRgb, b: LatentPigmentRgb): number => {
      const diff = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
      const shift = shiftFactor * ((diff[0] + diff[1] + diff[2]) / 3);
      return Math.hypot(diff[0] + shift, diff[1] + shift, diff[2] + shift);
    };
    const divisions = 30;
    const image: LatentPigmentRgb[] = [];
    for (let a = 0; a <= divisions; a += 1) {
      for (let b = 0; a + b <= divisions; b += 1) {
        for (let c = 0; a + b + c <= divisions; c += 1) {
          image.push(modelColor([a / divisions, b / divisions, c / divisions, (divisions - a - b - c) / divisions]));
        }
      }
    }
    const random = createRandom(303);
    let worstExcess = -Infinity;
    for (let index = 0; index < 250; index += 1) {
      const target: LatentPigmentRgb = [random(), random(), random()];
      const solved = weightedDistance(modelColor(rgbToLatentPigment(target).concentrations), target);
      const best = image.reduce((smallest, color) => Math.min(smallest, weightedDistance(color, target)), Infinity);
      worstExcess = Math.max(worstExcess, solved - best);
    }
    expect(worstExcess).toBeLessThan(2e-3);
  });

  it("순검정은 거의 무채색인 어두운 기저로 풀려 흰색과 섞어도 색 치우침이 작다", () => {
    const black = rgbToLatentPigment([0, 0, 0]);
    const base = modelColor(black.concentrations);
    expect(Math.max(...base) - Math.min(...base)).toBeLessThan(40 / 255);
    const gray = mixRgbPigments([{ rgb: [1, 1, 1], weight: 1 }, { rgb: [0, 0, 0], weight: 1 }]);
    expect(Math.max(...gray) - Math.min(...gray)).toBeLessThan(10 / 255);
  });
});

describe("항등과 교환·정규화", () => {
  it("색 하나에 가중치 1을 주면 같은 색이다(8비트 오차 0, 부동소수 1e-9 이하)", () => {
    const random = createRandom(5);
    for (let index = 0; index < 300; index += 1) {
      const rgb: LatentPigmentRgb = [random(), random(), random()];
      expect(maxAbsoluteDifference(mixRgbPigments([{ rgb, weight: 1 }]), rgb)).toBeLessThanOrEqual(1e-9);
      const source: readonly [number, number, number] = [Math.floor(random() * 256), Math.floor(random() * 256), Math.floor(random() * 256)];
      expect(eightBit(mixRgbPigments([{ rgb: fromEightBit(source[0], source[1], source[2]), weight: 1 }]))).toEqual(source);
    }
  });

  it("같은 색끼리 어떤 비율로 섞어도 그 색이 나온다", () => {
    const rgb: LatentPigmentRgb = [0.83, 0.21, 0.47];
    for (const weight of [0.05, 0.3, 0.5, 0.97]) {
      const mixed = mixRgbPigments([{ rgb, weight }, { rgb, weight: 1 - weight }]);
      expect(maxAbsoluteDifference(mixed, rgb)).toBeLessThanOrEqual(1e-9);
    }
  });

  it("가중치 0인 색은 결과에 영향을 주지 않는다", () => {
    const a: LatentPigmentRgb = [0.9, 0.7, 0.1];
    const b: LatentPigmentRgb = [0.1, 0.3, 0.9];
    expect(mixRgbPigments([{ rgb: a, weight: 2 }, { rgb: b, weight: 0 }])).toEqual(mixRgbPigments([{ rgb: a, weight: 1 }]));
  });

  it("두 색의 순서를 바꿔도 결과가 같다(교환)", () => {
    const random = createRandom(13);
    for (let index = 0; index < 200; index += 1) {
      const a: LatentPigmentRgb = [random(), random(), random()];
      const b: LatentPigmentRgb = [random(), random(), random()];
      const weight = random();
      expect(mixRgbPigments([{ rgb: a, weight }, { rgb: b, weight: 1 - weight }]))
        .toEqual(mixRgbPigments([{ rgb: b, weight: 1 - weight }, { rgb: a, weight }]));
    }
  });

  it("여러 색의 항목 순서를 바꿔도 결과가 같다(1e-12 이내)", () => {
    const entries = [
      { rgb: [0.9, 0.2, 0.1] as const, weight: 0.4 },
      { rgb: [0.1, 0.7, 0.3] as const, weight: 0.25 },
      { rgb: [0.2, 0.2, 0.9] as const, weight: 0.2 },
      { rgb: [0.95, 0.9, 0.3] as const, weight: 0.15 },
    ];
    const expected = mixRgbPigments(entries);
    for (const order of [[3, 2, 1, 0], [1, 3, 0, 2], [2, 0, 3, 1]]) {
      expect(maxAbsoluteDifference(mixRgbPigments(order.map((index) => entries[index])), expected)).toBeLessThanOrEqual(1e-12);
    }
  });

  it("모든 가중치에 같은 양수를 곱해도 결과가 같다(정규화)", () => {
    const a: LatentPigmentRgb = [0.8, 0.3, 0.2];
    const b: LatentPigmentRgb = [0.1, 0.6, 0.7];
    const baseline = mixRgbPigments([{ rgb: a, weight: 0.3 }, { rgb: b, weight: 0.7 }]);
    for (const scale of [1e-6, 0.01, 3, 250, 1e6]) {
      const scaled = mixRgbPigments([{ rgb: a, weight: 0.3 * scale }, { rgb: b, weight: 0.7 * scale }]);
      expect(maxAbsoluteDifference(scaled, baseline)).toBeLessThanOrEqual(1e-12);
    }
  });

  it("잠재 평균은 농도와 잔차의 가중 평균이고 농도 합이 1로 유지된다", () => {
    const a = rgbToLatentPigment([0.9, 0.2, 0.1]);
    const b = rgbToLatentPigment([0.1, 0.5, 0.8]);
    const mixed = mixLatentPigments([{ latent: a, weight: 1 }, { latent: b, weight: 3 }]);
    mixed.concentrations.forEach((value, index) => {
      expect(value).toBeCloseTo(0.25 * a.concentrations[index] + 0.75 * b.concentrations[index], 12);
    });
    mixed.residual.forEach((value, index) => {
      expect(value).toBeCloseTo(0.25 * a.residual[index] + 0.75 * b.residual[index], 12);
    });
    expect(mixed.concentrations.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
  });

  it("잠재 평균은 결합법칙을 따른다(나눠 섞어도 한 번에 섞은 것과 같다)", () => {
    const a = rgbToLatentPigment([0.9, 0.2, 0.1]);
    const b = rgbToLatentPigment([0.1, 0.5, 0.8]);
    const c = rgbToLatentPigment([0.4, 0.9, 0.3]);
    const direct = mixLatentPigments([{ latent: a, weight: 1 }, { latent: b, weight: 1 }, { latent: c, weight: 2 }]);
    const staged = mixLatentPigments([
      { latent: mixLatentPigments([{ latent: a, weight: 1 }, { latent: b, weight: 1 }]), weight: 2 },
      { latent: c, weight: 2 },
    ]);
    expect(latentPigmentToRgb(staged).map((value, index) => Math.abs(value - latentPigmentToRgb(direct)[index])).every((error) => error < 1e-12)).toBe(true);
  });
});

describe("연속성", () => {
  it("가중치를 조금씩 바꾸면 결과도 조금씩만 바뀌고 끝점에서 두 색이 정확히 나온다", () => {
    const pairs: readonly (readonly [LatentPigmentRgb, LatentPigmentRgb])[] = [
      [[1, 0.88, 0], [0, 0.31, 0.86]],
      [[1, 1, 1], [0.9, 0.1, 0.1]],
      [[0.1, 0.8, 0.3], [0.8, 0.1, 0.7]],
    ];
    for (const [a, b] of pairs) {
      const steps = 1000;
      let previous = mixRgbPigments([{ rgb: a, weight: 1 }, { rgb: b, weight: 0 }]);
      expect(eightBit(previous)).toEqual(eightBit(a));
      let largestJump = 0;
      for (let step = 1; step <= steps; step += 1) {
        const t = step / steps;
        const current = mixRgbPigments([{ rgb: a, weight: 1 - t }, { rgb: b, weight: t }]);
        largestJump = Math.max(largestJump, maxAbsoluteDifference(current, previous));
        previous = current;
      }
      expect(eightBit(previous)).toEqual(eightBit(b));
      // 0.001 간격의 한 걸음이 색 범위(1)의 2%를 넘어 튀지 않는다.
      expect(largestJump).toBeLessThan(0.02);
    }
  });
});

describe("안료다운 혼합의 방향성(값은 고정하지 않는다)", () => {
  const linearAverage = (a: LatentPigmentRgb, b: LatentPigmentRgb): LatentPigmentRgb => [
    (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2,
  ];
  const greenness = (rgb: LatentPigmentRgb): number => rgb[1] - (rgb[0] + rgb[2]) / 2;

  it("노랑과 파랑을 섞으면 초록 쪽으로 가고 선형 RGB 평균보다 더 초록이다", () => {
    const yellow: LatentPigmentRgb = [1, 0xe0 / 255, 0];
    const blue: LatentPigmentRgb = [0, 0x50 / 255, 0xdc / 255];
    const mixed = mixRgbPigments([{ rgb: yellow, weight: 1 }, { rgb: blue, weight: 1 }]);
    expect(mixed[1]).toBeGreaterThan(mixed[0]);
    expect(mixed[1]).toBeGreaterThan(mixed[2]);
    expect(greenness(mixed)).toBeGreaterThan(greenness(linearAverage(yellow, blue)));
  });

  it("순수 sRGB 노랑·파랑처럼 안료 색역 밖의 색도 선형 평균보다 초록 쪽이다", () => {
    const mixed = mixRgbPigments([{ rgb: [1, 1, 0], weight: 1 }, { rgb: [0, 0, 1], weight: 1 }]);
    expect(greenness(mixed)).toBeGreaterThan(greenness([0.5, 0.5, 0.5]));
  });

  it("노랑이 많을수록 연두에, 파랑이 많을수록 청록 쪽에 가깝다", () => {
    const yellow: LatentPigmentRgb = [1, 0xe0 / 255, 0];
    const blue: LatentPigmentRgb = [0, 0x50 / 255, 0xdc / 255];
    const yellowish = mixRgbPigments([{ rgb: yellow, weight: 3 }, { rgb: blue, weight: 1 }]);
    const bluish = mixRgbPigments([{ rgb: yellow, weight: 1 }, { rgb: blue, weight: 3 }]);
    expect(yellowish[0]).toBeGreaterThan(bluish[0]);
    expect(bluish[2]).toBeGreaterThan(yellowish[2]);
  });

  it("흰색과 빨강을 섞으면 분홍(빨강 우세, 빨강보다 밝고 흰색보다 어두움) 쪽이다", () => {
    const red: LatentPigmentRgb = [0.9, 0.1, 0.1];
    const mixed = mixRgbPigments([{ rgb: [1, 1, 1], weight: 1 }, { rgb: red, weight: 1 }]);
    expect(mixed[0]).toBeGreaterThan(mixed[1]);
    expect(mixed[0]).toBeGreaterThan(mixed[2]);
    expect(mixed[1]).toBeGreaterThan(red[1]);
    expect(mixed[2]).toBeGreaterThan(red[2]);
    expect(mixed[1]).toBeLessThan(1);
    expect(mixed[2]).toBeLessThan(1);
  });

  it("빨강과 노랑을 섞으면 주황(빨강 > 초록 > 파랑) 쪽이다", () => {
    const mixed = mixRgbPigments([{ rgb: [0.93, 0.1, 0.1], weight: 1 }, { rgb: [1, 0.88, 0.1], weight: 1 }]);
    expect(mixed[0]).toBeGreaterThan(mixed[1]);
    expect(mixed[1]).toBeGreaterThan(mixed[2]);
  });

  it("두 회색을 어떤 비율로 섞어도 거의 무채색이 유지된다", () => {
    let worstSpread = 0;
    for (const first of [0, 24, 64, 128, 192, 255]) {
      for (const second of [0, 40, 96, 160, 224, 255]) {
        for (const weight of [0.2, 0.5, 0.8]) {
          const mixed = mixRgbPigments([
            { rgb: fromEightBit(first, first, first), weight: 1 - weight },
            { rgb: fromEightBit(second, second, second), weight },
          ]);
          worstSpread = Math.max(worstSpread, Math.max(...mixed) - Math.min(...mixed));
        }
      }
    }
    expect(worstSpread).toBeLessThan(12 / 255);
  });

  it("안료 혼합은 선형 RGB 평균과 다르다(같으면 잠재 공간의 의미가 없다)", () => {
    const yellow: LatentPigmentRgb = [1, 0xe0 / 255, 0];
    const blue: LatentPigmentRgb = [0, 0x50 / 255, 0xdc / 255];
    const mixed = mixRgbPigments([{ rgb: yellow, weight: 1 }, { rgb: blue, weight: 1 }]);
    expect(maxAbsoluteDifference(mixed, linearAverage(yellow, blue))).toBeGreaterThan(0.05);
  });
});

describe("입력 검증", () => {
  it.each([
    ["NaN", [Number.NaN, 0.5, 0.5]],
    ["양의 무한대", [0.5, Number.POSITIVE_INFINITY, 0.5]],
    ["음수", [0.5, 0.5, -0.0001]],
    ["1 초과", [1.0001, 0.5, 0.5]],
  ])("rgbToLatentPigment 는 %s 를 거부한다", (_, rgb) => {
    expect(() => rgbToLatentPigment(rgb as unknown as LatentPigmentRgb)).toThrow(RangeError);
  });

  it.each([
    ["길이 2", [0.1, 0.2]],
    ["길이 4", [0.1, 0.2, 0.3, 0.4]],
    ["문자열 원소", ["0.1", 0.2, 0.3]],
    ["null", null],
  ])("rgbToLatentPigment 는 모양이 틀린 입력(%s)을 거부한다", (_, rgb) => {
    expect(() => rgbToLatentPigment(rgb as unknown as LatentPigmentRgb)).toThrow();
  });

  it("latentPigmentToRgb 는 농도 합이 1이 아니거나 음수·NaN 인 잠재 색을 거부한다", () => {
    const valid = rgbToLatentPigment([0.4, 0.5, 0.6]);
    expect(() => latentPigmentToRgb({ ...valid, concentrations: [0.5, 0.5, 0.5, 0.5] })).toThrow(RangeError);
    expect(() => latentPigmentToRgb({ ...valid, concentrations: [1.5, -0.5, 0, 0] })).toThrow(RangeError);
    expect(() => latentPigmentToRgb({ ...valid, concentrations: [Number.NaN, 0, 0, 1] })).toThrow(RangeError);
    expect(() => latentPigmentToRgb({ ...valid, residual: [0, Number.NaN, 0] })).toThrow(RangeError);
    expect(() => latentPigmentToRgb({ ...valid, residual: [0, 0, Number.POSITIVE_INFINITY] })).toThrow(RangeError);
  });

  it("혼합 함수는 빈 목록·음수·NaN·무한대 가중치와 합이 0인 가중치를 거부한다", () => {
    const a: LatentPigmentRgb = [0.2, 0.4, 0.6];
    const b: LatentPigmentRgb = [0.6, 0.4, 0.2];
    const la = rgbToLatentPigment(a);
    expect(() => mixRgbPigments([])).toThrow(RangeError);
    expect(() => mixLatentPigments([])).toThrow(RangeError);
    for (const weight of [-1, -1e-12, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => mixRgbPigments([{ rgb: a, weight }, { rgb: b, weight: 1 }])).toThrow(RangeError);
      expect(() => mixLatentPigments([{ latent: la, weight }, { latent: la, weight: 1 }])).toThrow(RangeError);
    }
    expect(() => mixRgbPigments([{ rgb: a, weight: 0 }, { rgb: b, weight: 0 }])).toThrow(RangeError);
    expect(() => mixLatentPigments([{ latent: la, weight: 0 }])).toThrow(RangeError);
  });

  it("혼합 함수는 범위 밖 색과 배열이 아닌 입력을 거부한다", () => {
    expect(() => mixRgbPigments([{ rgb: [2, 0, 0], weight: 1 }])).toThrow(RangeError);
    expect(() => mixRgbPigments([{ rgb: [0, 0, 0], weight: 1 }, { rgb: [Number.NaN, 0, 0], weight: 1 }])).toThrow(RangeError);
    expect(() => mixRgbPigments(null as unknown as readonly { rgb: LatentPigmentRgb; weight: number }[])).toThrow(TypeError);
    expect(() => mixRgbPigments([null as unknown as { rgb: LatentPigmentRgb; weight: number }])).toThrow(TypeError);
  });

  it("아주 큰 가중치도 넘치지 않고 정규화된다", () => {
    const a: LatentPigmentRgb = [0.9, 0.1, 0.1];
    const b: LatentPigmentRgb = [0.1, 0.1, 0.9];
    const huge = mixRgbPigments([{ rgb: a, weight: 1e308 }, { rgb: b, weight: 1e308 }]);
    expect(maxAbsoluteDifference(huge, mixRgbPigments([{ rgb: a, weight: 1 }, { rgb: b, weight: 1 }]))).toBeLessThanOrEqual(1e-12);
  });
});

describe("불변성과 지연 초기화", () => {
  it("결과 객체는 동결되고 입력을 바꾸지 않는다", () => {
    const rgb: LatentPigmentRgb = Object.freeze([0.3, 0.6, 0.9] as const);
    const latent = rgbToLatentPigment(rgb);
    expect(Object.isFrozen(latent)).toBe(true);
    expect(Object.isFrozen(latent.concentrations)).toBe(true);
    expect(Object.isFrozen(latent.residual)).toBe(true);
    expect(Object.isFrozen(latentPigmentToRgb(latent))).toBe(true);
    const entries = Object.freeze([Object.freeze({ rgb, weight: 1 }), Object.freeze({ rgb: [0.9, 0.6, 0.3] as const, weight: 2 })]);
    expect(Object.isFrozen(mixLatentPigments(entries.map((entry) => ({ latent: rgbToLatentPigment(entry.rgb), weight: entry.weight }))))).toBe(true);
    expect(rgb).toEqual([0.3, 0.6, 0.9]);
  });

  it("직접 만든 잠재 색도 같은 규칙으로 RGB 로 바뀐다", () => {
    const latent: LatentPigment = { concentrations: [1, 0, 0, 0], residual: [0, 0, 0] };
    const rgb = latentPigmentToRgb(latent);
    expect(rgb.every((value) => value > 0.9 && value <= 1)).toBe(true);
  });

  it("모듈을 불러오는 것만으로는 초기화하지 않고 첫 사용 때 초기화한다", async () => {
    vi.resetModules();
    const fresh = await import("./latent-pigment-mixer");
    expect(fresh.isLatentPigmentMixerInitialized()).toBe(false);
    fresh.rgbToLatentPigment([0.2, 0.4, 0.6]);
    expect(fresh.isLatentPigmentMixerInitialized()).toBe(true);
  });
});

describe("성능 스모크(느슨한 상한)", () => {
  it("첫 사용 초기화는 0.5초 안에 끝나고, 변환 3000건은 3초 안에 끝난다", async () => {
    vi.resetModules();
    const fresh = await import("./latent-pigment-mixer");
    const initStart = performance.now();
    fresh.rgbToLatentPigment([0.5, 0.5, 0.5]);
    expect(performance.now() - initStart).toBeLessThan(500);
    const random = createRandom(99);
    const start = performance.now();
    let checksum = 0;
    for (let index = 0; index < 3000; index += 1) {
      checksum += fresh.latentPigmentToRgb(fresh.rgbToLatentPigment([random(), random(), random()]))[0];
    }
    expect(performance.now() - start).toBeLessThan(3000);
    expect(Number.isFinite(checksum)).toBe(true);
  });

  it("정확 키 메모이제이션 캐시(getLatentPigmentCacheStats)와 채도 보존 혼합(mixRgbPigmentsChromaPreserving)이 결정적으로 동작한다", () => {
    clearLatentPigmentCache();
    expect(getLatentPigmentCacheStats().size).toBe(0);
    const yellow: LatentPigmentRgb = [1, 0.88, 0];
    const blue: LatentPigmentRgb = [0, 0.31, 0.86];
    const first = rgbToLatentPigment(yellow);
    const second = rgbToLatentPigment(yellow);
    expect(second).toBe(first);
    expect(getLatentPigmentCacheStats().hits).toBeGreaterThanOrEqual(1);

    // 단일 색 항등 및 동일 색 항등 보존
    expect(maxAbsoluteDifference(mixRgbPigmentsChromaPreserving([{ rgb: yellow, weight: 1 }]), yellow)).toBeLessThanOrEqual(1e-9);
    expect(
      maxAbsoluteDifference(
        mixRgbPigmentsChromaPreserving([
          { rgb: blue, weight: 0.35 },
          { rgb: blue, weight: 0.65 },
        ]),
        blue,
      ),
    ).toBeLessThanOrEqual(1e-9);

    // 노랑 + 파랑 혼합에서 초록 채널 우세 유지
    const chromaMixed = mixRgbPigmentsChromaPreserving([
      { rgb: yellow, weight: 0.5 },
      { rgb: blue, weight: 0.5 },
    ]);
    expect(chromaMixed[1]).toBeGreaterThan(chromaMixed[0]);
    expect(chromaMixed[1]).toBeGreaterThan(chromaMixed[2]);
  });
});

