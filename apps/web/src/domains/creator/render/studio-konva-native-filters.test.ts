import { Blur } from "konva/lib/filters/Blur";
import { Brighten } from "konva/lib/filters/Brighten";
import { Contrast } from "konva/lib/filters/Contrast";
import { HSL } from "konva/lib/filters/HSL";
import { Pixelate } from "konva/lib/filters/Pixelate";
import { describe, expect, it } from "vitest";

import {
  nativeBlur,
  nativeBrighten,
  nativeContrast,
  nativeHSL,
  nativePixelate,
} from "./studio-konva-native-filters";

import type { StudioImageDataLike } from "../studio-filters";

// 두 포팅이 동일 입력에서 픽셀 단위로 일치하는지 검증한다 — nativeXxx는 Worker(DOM 없음)에서도
// 도는 attrs 기반 버전, 실제 konva 함수는 Konva 노드의 getter 메서드(this.blurRadius() 등)를 읽는다.
// 이 테스트가 깨지면 Worker 경로가 메인 스레드와 다른 결과를 그리게 된다.
// Konva의 Filter 타입은 FilterFunction | string 유니언이라 .call 호출을 위해 함수 형태로 좁힌다.
type RealFilterFn = (this: unknown, imageData: unknown) => void;
// Blur·Pixelate 는 두 번째 인자로 pixelRatio 를 받는다(Konva 10.9).
type RealRatioFilterFn = (this: unknown, imageData: unknown, pixelRatio?: number) => void;
const realBlur = Blur as unknown as RealRatioFilterFn;
const realBrighten = Brighten as unknown as RealFilterFn;
const realContrast = Contrast as unknown as RealFilterFn;
const realHSL = HSL as unknown as RealFilterFn;
const realPixelate = Pixelate as unknown as RealRatioFilterFn;

function makeImageData(width: number, height: number, seed = 1): StudioImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = (i * 7 * seed) % 256;
    data[i + 1] = (i * 13 * seed) % 256;
    data[i + 2] = (i * 3 * seed) % 256;
    data[i + 3] = 200 + ((i * seed) % 56);
  }
  return { data, width, height };
}

/** 알파가 0·절반·가득인 픽셀이 섞인 입력: 프리멀티플라이 평균과 α=0 분기를 지난다. */
function makeMixedAlphaImageData(width: number, height: number, seed = 1): StudioImageDataLike {
  const image = makeImageData(width, height, seed);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    image.data[pixel * 4 + 3] = [0, 128, 255, 0, 40][pixel % 5]!;
  }
  return image;
}

function expectSame(run: (image: StudioImageDataLike) => void, runReal: (image: StudioImageDataLike) => void, make: () => StudioImageDataLike): void {
  const a = make();
  const b = make();
  run(a);
  runReal(b);
  expect(Array.from(a.data)).toEqual(Array.from(b.data));
}

describe("studio-konva-native-filters parity with real Konva filters", () => {
  it("nativeBrighten matches Konva Brighten", () => {
    const a = makeImageData(12, 9);
    const b = makeImageData(12, 9);
    nativeBrighten.call({ attrs: { brightness: 0.35 } }, a);
    realBrighten.call({ brightness: () => 0.35 }, b);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it("nativeContrast matches Konva Contrast", () => {
    const a = makeImageData(12, 9, 2);
    const b = makeImageData(12, 9, 2);
    nativeContrast.call({ attrs: { contrast: 42 } }, a);
    realContrast.call({ contrast: () => 42 }, b);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it("nativeHSL matches Konva HSL", () => {
    const a = makeImageData(14, 10, 3);
    const b = makeImageData(14, 10, 3);
    nativeHSL.call({ attrs: { hue: 120, saturation: 0.4, luminance: 0.1 } }, a);
    realHSL.call(
      { hue: () => 120, saturation: () => 0.4, luminance: () => 0.1 },
      b,
    );
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it("nativePixelate matches Konva Pixelate", () => {
    const a = makeImageData(20, 17, 4);
    const b = makeImageData(20, 17, 4);
    nativePixelate.call({ attrs: { pixelSize: 5 } }, a);
    realPixelate.call({ pixelSize: () => 5 }, b);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it("nativeBlur matches Konva Blur across several radii", () => {
    for (const radius of [1, 3, 8, 16]) {
      const a = makeImageData(24, 18, radius + 1);
      const b = makeImageData(24, 18, radius + 1);
      nativeBlur.call({ attrs: { blurRadius: radius } }, a);
      realBlur.call({ blurRadius: () => radius }, b);
      expect(Array.from(a.data)).toEqual(Array.from(b.data));
    }
  });

  it("nativeBlur is a no-op for radius 0, matching Konva", () => {
    const a = makeImageData(10, 10, 5);
    const b = makeImageData(10, 10, 5);
    nativeBlur.call({ attrs: { blurRadius: 0 } }, a);
    realBlur.call({ blurRadius: () => 0 }, b);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it("all natives fall back to Konva defaults when attrs are missing", () => {
    const a = makeImageData(8, 8, 6);
    const b = makeImageData(8, 8, 6);
    nativeBrighten.call({}, a);
    realBrighten.call({ brightness: () => 0 }, b);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it("non-finite scalar attrs fail closed and a huge blur radius stays bounded", () => {
    for (const run of [
      (img: StudioImageDataLike) => nativeBrighten.call({ attrs: { brightness: Number.NaN } }, img),
      (img: StudioImageDataLike) => nativeContrast.call({ attrs: { contrast: Number.POSITIVE_INFINITY } }, img),
      (img: StudioImageDataLike) => nativeHSL.call({ attrs: { hue: Number.NaN } }, img),
      (img: StudioImageDataLike) => nativeBlur.call({ attrs: { blurRadius: Number.POSITIVE_INFINITY } }, img),
    ]) {
      const img = makeImageData(5, 5, 7);
      const before = Array.from(img.data);
      expect(() => run(img)).not.toThrow();
      expect(Array.from(img.data)).toEqual(before);
    }

    const onePixel = makeImageData(1, 1, 8);
    expect(() => nativeBlur.call({ attrs: { blurRadius: Number.MAX_VALUE } }, onePixel)).not.toThrow();
  });
});

// 위 시험은 입력 알파가 200~255 이고 pixelRatio 를 넘기지 않아, 10.9 에서 바뀐 분기를 건드리지 못했다.
describe("studio-konva-native-filters Konva 10.9 boundary branches", () => {
  it("nativeBlur: pixelRatio 로 커널이 커져도 Konva 와 같다(곱한 반경이 360 을 넘는 경우 포함)", () => {
    for (const [radius, ratio] of [[4, 1.5], [40, 2], [90, 2], [180, 2], [180, 2.5], [180, 3]] as const) {
      expectSame(
        (image) => nativeBlur.call({ attrs: { blurRadius: radius } }, image, ratio),
        (image) => realBlur.call({ blurRadius: () => radius }, image, ratio),
        () => makeImageData(33, 21, radius + 3),
      );
    }
  });

  it("nativeBlur: 논리 반경 180 을 넘는 값은 180 으로 잘리고, 폭이나 높이가 1 인 이미지도 Konva 와 같다", () => {
    expectSame(
      (image) => nativeBlur.call({ attrs: { blurRadius: 500 } }, image),
      (image) => realBlur.call({ blurRadius: () => 500 }, image),
      () => makeImageData(30, 24, 9),
    );
    for (const [width, height] of [[1, 17], [19, 1], [1, 1]] as const) {
      expectSame(
        (image) => nativeBlur.call({ attrs: { blurRadius: 5 } }, image),
        (image) => realBlur.call({ blurRadius: () => 5 }, image),
        () => makeImageData(width, height, 4),
      );
    }
  });

  it("nativeBlur: 투명 픽셀이 섞여도 Konva 와 같다", () => {
    for (const radius of [2, 7, 25]) {
      expectSame(
        (image) => nativeBlur.call({ attrs: { blurRadius: radius } }, image),
        (image) => realBlur.call({ blurRadius: () => radius }, image),
        () => makeMixedAlphaImageData(26, 19, radius),
      );
    }
  });

  it("nativeBlur: 손상된 pixelRatio 는 1 로 보고, 거대한 값은 비율 상한에서 멈춰 커널을 폭주시키지 않는다", () => {
    for (const ratio of [Number.NaN, Number.POSITIVE_INFINITY, -2, 0]) {
      expectSame(
        (image) => nativeBlur.call({ attrs: { blurRadius: 6 } }, image, ratio),
        (image) => realBlur.call({ blurRadius: () => 6 }, image, 1),
        () => makeImageData(16, 12, 5),
      );
    }
    const started = performance.now();
    expect(() => nativeBlur.call({ attrs: { blurRadius: 180 } }, makeImageData(6, 6, 2), 1e9)).not.toThrow();
    expect(performance.now() - started, "상한이 없으면 반경 1.8e11 만큼 노드를 할당한다").toBeLessThan(2000);
  });

  it("nativePixelate: 알파로 가중한 평균·가장자리 칸·pixelRatio 가 Konva 와 같다", () => {
    for (const [size, ratio, width, height] of [[5, 1, 23, 17], [4, 2, 31, 22], [3, 1.5, 10, 9], [7, 1, 5, 5]] as const) {
      expectSame(
        (image) => nativePixelate.call({ attrs: { pixelSize: size } }, image, ratio),
        (image) => realPixelate.call({ pixelSize: () => size }, image, ratio),
        () => makeMixedAlphaImageData(width, height, size),
      );
    }
  });

  it("nativeHSL: 음수·한 바퀴를 넘는 색상과 채도·명도 극단이 Konva 와 같다", () => {
    for (const [hue, saturation, luminance] of [
      [-30, 0, 0],
      [-725.5, 0.3, 0.1],
      [390, -1, 0],
      [719.9, 1, -0.2],
      [0, 2, 0.5],
    ] as const) {
      expectSame(
        (image) => nativeHSL.call({ attrs: { hue, saturation, luminance } }, image),
        (image) => realHSL.call({ hue: () => hue, saturation: () => saturation, luminance: () => luminance }, image),
        () => makeMixedAlphaImageData(13, 11, 3),
      );
    }
  });
});
