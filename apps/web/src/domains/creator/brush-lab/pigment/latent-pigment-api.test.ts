/** 공개 형식·왕복·대칭·알파·거부 계약을 확인한다. 외부 엔진 출력은 기대값으로 쓰지 않는다. */
import { describe, expect, it } from "vitest";

import {
  floatRgbToLatent,
  latentToFloatRgb,
  latentToLinearFloatRgb,
  latentToRgb,
  lerp,
  lerpFloat,
  lerpLinearFloat,
  linearFloatRgbToLatent,
  packLatentPigment,
  pigmentLinearToSrgb,
  pigmentSrgbToLinear,
  rgbToLatent,
  toonstudioPigment,
  unpackLatentPigment,
} from "./latent-pigment-api";

function randomGenerator(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

function expectNear(first: readonly number[], second: readonly number[], precision = 10): void {
  expect(first.length).toBe(second.length);
  first.forEach((value, index) => expect(value).toBeCloseTo(second[index], precision));
}

describe("자체 잠재 안료 공개 API의 색 형식", () => {
  it("CPU 공개 기능과 잠재 채널 수를 제공한다", () => {
    expect(toonstudioPigment.LATENT_SIZE).toBe(7);
    expect(Object.keys(toonstudioPigment)).toEqual([
      "LATENT_SIZE", "lerp", "lerpFloat", "lerpLinearFloat", "rgbToLatent", "latentToRgb",
      "floatRgbToLatent", "latentToFloatRgb", "linearFloatRgbToLatent", "latentToLinearFloatRgb",
    ]);
  });

  it.each([
    ["#f30", [255, 51, 0]],
    ["#f308", [255, 51, 0, 136]],
    ["#ff3300", [255, 51, 0]],
    ["#ff330080", [255, 51, 0, 128]],
    ["rgb(255, 51, 0)", [255, 51, 0]],
    ["rgba(255, 51, 0, .5)", [255, 51, 0, 128]],
    ["rgb(100% 20% 0%)", [255, 51, 0]],
    ["rgb(255 51 0 / 50%)", [255, 51, 0, 128]],
    [" RGB(255 51 0) ", [255, 51, 0]],
  ])("CSS %s의 RGB·알파 스케일을 해석한다", (css, expected) => {
    expect(lerp(css, css, 0)).toEqual(expected);
  });

  it("배열의 8비트 알파와 CSS의 정규화 알파를 같은 범위로 반환한다", () => {
    expect(lerp([255, 51, 0, 128], "#ff330080", 0.5)).toEqual([255, 51, 0, 128]);
    expect(lerp([255, 0, 0], [0, 0, 255, 0], 0)).toEqual([255, 0, 0, 255]);
    expect(lerp([255, 0, 0, 0], [0, 0, 255], 1)).toEqual([0, 0, 255, 255]);
  });

  it("3채널 입력은 3채널, 알파가 있는 입력은 4채널로 반환한다", () => {
    expect(lerpFloat([1, 0, 0], [0, 0, 1], 0.5)).toHaveLength(3);
    expect(lerpFloat([1, 0, 0], [0, 0, 1, 0.2], 0.5)).toHaveLength(4);
    expect(lerpLinearFloat([1, 0, 0, 0.2], [0, 0, 1], 0.5)).toHaveLength(4);
  });

  it("배열·개별 숫자·CSS 변환의 자체 잠재 표현이 같다", () => {
    expect(rgbToLatent(10, 60, 200)).toEqual(rgbToLatent([10, 60, 200]));
    expect(rgbToLatent("#0a3cc8")).toEqual(rgbToLatent([10, 60, 200]));
    expect(floatRgbToLatent(0.1, 0.4, 0.8)).toEqual(floatRgbToLatent([0.1, 0.4, 0.8]));
    expect(linearFloatRgbToLatent(0.1, 0.4, 0.8)).toEqual(linearFloatRgbToLatent([0.1, 0.4, 0.8]));
  });

  it("숫자형 배열을 복사해 읽고 같은 값을 반환한다", () => {
    const input = Float32Array.of(0.25, 0.5, 0.75);
    expect(lerpFloat(input, input, 0)).toEqual([0.25, 0.5, 0.75]);
    expectNear(latentToFloatRgb(floatRgbToLatent(input)), [0.25, 0.5, 0.75]);
  });

  it("표준 CSS 색 이름과 RGB 객체도 배열과 같은 혼색 경계를 사용한다", () => {
    expect(lerp("ReD", "BLUE", 0.5)).toEqual(lerp([255, 0, 0], [0, 0, 255], 0.5));
    expect(lerp("rebeccapurple", "#663399", 0)).toEqual([102, 51, 153]);
    expect(lerp("transparent", "red", 0)).toEqual([0, 0, 0, 0]);
    const first = Object.freeze({ r: 255, g: 0, b: 0, a: 128 });
    const second = Object.freeze({ r: 0, g: 0, b: 255, a: 0 });
    expect(lerp(first, second, 0.5)).toEqual(lerp([255, 0, 0, 128], [0, 0, 255, 0], 0.5));
    expect(rgbToLatent(first)).toEqual(rgbToLatent([255, 0, 0]));
    expect(first).toEqual({ r: 255, g: 0, b: 0, a: 128 });
  });

  it("float·linear RGB 객체의 왕복과 독립 알파를 보존한다", () => {
    const color = Object.freeze({ r: 0.25, g: 0.5, b: 0.75, a: 0.2 });
    expectNear(latentToFloatRgb(floatRgbToLatent(color)), [0.25, 0.5, 0.75]);
    expectNear(latentToLinearFloatRgb(linearFloatRgbToLatent(color)), [0.25, 0.5, 0.75]);
    expect(lerpFloat(color, { ...color, a: 0.8 }, 0.5)[3]).toBe(0.5);
    expect(lerpLinearFloat(color, { ...color, a: 0.8 }, 0.5)[3]).toBe(0.5);
    expect(() => lerpFloat({ r: Number.NaN, g: 0, b: 0 }, color, 0.5)).toThrow();
    expect(() => lerp("not-a-color", "red", 0.5)).toThrow();
  });
});

describe("자체 잠재 안료 공개 API의 왕복과 혼합 성질", () => {
  it("고정 시드 8비트 RGB와 큐브 꼭짓점을 오차 없이 왕복한다", () => {
    const random = randomGenerator(20261105);
    const colors: number[][] = [];
    for (let mask = 0; mask < 8; mask += 1) colors.push([mask & 1 ? 255 : 0, mask & 2 ? 255 : 0, mask & 4 ? 255 : 0]);
    for (let index = 0; index < 256; index += 1) colors.push([Math.floor(random() * 256), Math.floor(random() * 256), Math.floor(random() * 256)]);
    colors.forEach((color) => expect(latentToRgb(rgbToLatent(color))).toEqual(color));
  });

  it("고정 시드 부동소수 sRGB와 선형 RGB를 왕복한다", () => {
    const random = randomGenerator(3829);
    for (let index = 0; index < 128; index += 1) {
      const color = [random(), random(), random()];
      expectNear(latentToFloatRgb(floatRgbToLatent(color)), color);
      expectNear(latentToLinearFloatRgb(linearFloatRgbToLatent(color)), color);
    }
  });

  it("표준 sRGB 전달함수는 경계와 임의 색을 왕복하고 알파를 다루지 않는다", () => {
    [0, 0.0031308, 0.04045, 0.1, 0.5, 1].forEach((value) => {
      expect(pigmentSrgbToLinear(pigmentLinearToSrgb(value))).toBeCloseTo(value, 7);
      expect(pigmentLinearToSrgb(pigmentSrgbToLinear(value))).toBeCloseTo(value, 7);
    });
  });

  it("끝점·범위 밖 유한 비율은 원래 입력 채널을 정확하게 보존한다", () => {
    const a = [0.13, 0.24, 0.89, 0.1];
    const b = [0.9, 0.1, 0.33, 0.8];
    [lerpFloat, lerpLinearFloat].forEach((mix) => {
      expect(mix(a, b, -2)).toEqual(a);
      expect(mix(a, b, 0)).toEqual(a);
      expect(mix(a, b, 1)).toEqual(b);
      expect(mix(a, b, 4)).toEqual(b);
    });
  });

  it("동일 색의 혼합은 항등이며 색·알파가 유한한 범위 안에 머문다", () => {
    const random = randomGenerator(987);
    for (let index = 0; index < 96; index += 1) {
      const a = [random(), random(), random(), random()];
      const b = [random(), random(), random(), random()];
      const t = random();
      [lerpFloat, lerpLinearFloat].forEach((mix) => {
        expectNear(mix(a, a, t), a);
        mix(a, b, t).forEach((value) => {
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        });
      });
    }
  });

  it("입력 교환과 비율 반전이 같은 결과를 만든다", () => {
    const random = randomGenerator(211);
    for (let index = 0; index < 96; index += 1) {
      const a = [random(), random(), random(), random()];
      const b = [random(), random(), random(), random()];
      const t = random();
      expectNear(lerpFloat(a, b, t), lerpFloat(b, a, 1 - t));
      expectNear(lerpLinearFloat(a, b, t), lerpLinearFloat(b, a, 1 - t));
    }
  });

  it("잠재 7채널의 가중 평균을 다시 RGB로 읽으면 공개 혼합과 같다", () => {
    const a = [0.2, 0.7, 0.1];
    const b = [0.7, 0.1, 0.4];
    const first = floatRgbToLatent(a);
    const second = floatRgbToLatent(b);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const mixed = first.map((value, index) => value * (1 - t) + second[index] * t);
      expectNear(latentToFloatRgb(mixed), lerpFloat(a, b, t));
    }
    expect(packLatentPigment(unpackLatentPigment(first))).toEqual(first);
  });

  it("알파는 독립 선형이며 투명한 색도 RGB 혼색에 참여한다", () => {
    const rgb = lerpFloat([1, 0, 0], [0, 0, 1], 0.5);
    const withTransparentRed = lerpFloat([1, 0, 0, 0], [0, 0, 1, 1], 0.5);
    expectNear(withTransparentRed.slice(0, 3), rgb);
    expect(withTransparentRed[3]).toBe(0.5);
    expect(withTransparentRed.slice(0, 3)).not.toEqual([0, 0, 1]);
    expectNear(lerpFloat([1, 0, 0, 0], [0, 0, 1, 0], 0.5).slice(0, 3), rgb);
  });

  it("원본 RGB·RGBA·잠재 배열을 바꾸지 않고 결과 배열도 공유하지 않는다", () => {
    const first = Object.freeze([0.2, 0.7, 0.1, 0.2]);
    const second = Object.freeze([0.7, 0.1, 0.4, 0.8]);
    const latent = Object.freeze([...floatRgbToLatent(first)]);
    const snapshot = [...latent];
    const one = lerpFloat(first, second, 0);
    one[0] = 999;
    lerpFloat(first, second, 0.5);
    lerpLinearFloat(first, second, 0.5);
    latentToFloatRgb(latent);
    expect(first).toEqual([0.2, 0.7, 0.1, 0.2]);
    expect(second).toEqual([0.7, 0.1, 0.4, 0.8]);
    expect(latent).toEqual(snapshot);
  });
});

describe("자체 잠재 안료 공개 API의 잘못된 입력 거부", () => {
  it.each([NaN, Infinity, -Infinity])("유한하지 않은 값 %s를 모든 색·비율·잠재 경계에서 거부한다", (invalid) => {
    expect(() => lerpFloat([invalid, 0, 0], [0, 0, 1], 0.5)).toThrow();
    expect(() => lerpFloat([1, 0, 0, invalid], [0, 0, 1], 0.5)).toThrow();
    expect(() => lerpFloat([1, 0, 0], [0, 0, 1], invalid)).toThrow();
    expect(() => lerpLinearFloat([1, 0, 0], [0, 0, 1], invalid)).toThrow();
    expect(() => latentToFloatRgb([1, 0, 0, 0, invalid, 0, 0])).toThrow();
  });

  it("RGB·알파 범위, 배열 채널 수와 잘못된 잠재 농도를 거부한다", () => {
    [[1, 0], [1, 0, 0, 1, 0], [-1, 0, 0], [1.1, 0, 0], [0, 0, 0, -0.1]].forEach((input) => {
      expect(() => lerpFloat(input, [1, 1, 1], 0.5)).toThrow();
    });
    expect(() => lerp([256, 0, 0], [0, 0, 0], 0.5)).toThrow();
    expect(() => rgbToLatent(-1, 0, 0)).toThrow();
    expect(() => floatRgbToLatent(2, 0, 0)).toThrow();
    expect(() => linearFloatRgbToLatent(2, 0, 0)).toThrow();
    expect(() => latentToRgb([1, 0, 0, 0, 0, 0])).toThrow();
    expect(() => latentToRgb([0.2, 0, 0, 0, 0, 0, 0])).toThrow();
    expect(() => latentToRgb([-0.2, 1.2, 0, 0, 0, 0, 0])).toThrow();
  });

  it.each([
    "currentColor", "#12", "#12345", "#ggg", "rgb(256,0,0)", "rgb(-1,0,0)",
    "rgba(1,2,3,2)", "rgba(1,2,3)", "rgb(1,,2,3)", "rgb(1 2)",
    "rgb(1 2 3 /)", "rgb(1,2,3/.5)", "rgb(Infinity 0 0)", "rgb(1 2 3/.2/.4)",
  ])("범위 밖·미지원·손상된 CSS %s를 거부한다", (input) => {
    expect(() => lerp(input, "#000", 0.5)).toThrow();
  });
});
