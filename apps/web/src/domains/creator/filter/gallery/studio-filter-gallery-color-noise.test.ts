import { describe, expect, it } from "vitest";

import { STUDIO_FILTER_GALLERY_COLOR_EFFECTS, medianCutPalette } from "./studio-filter-gallery-color";
import { STUDIO_FILTER_GALLERY_BLUR_EFFECTS, STUDIO_FILTER_GALLERY_NOISE_EFFECTS } from "./studio-filter-gallery-noise";

import type {
  StudioFilterGalleryEffectDef,
  StudioFilterGalleryImage,
  StudioFilterGalleryParams,
} from "./studio-filter-gallery-types";

const EFFECTS = [
  ...STUDIO_FILTER_GALLERY_COLOR_EFFECTS,
  ...STUDIO_FILTER_GALLERY_NOISE_EFFECTS,
  ...STUDIO_FILTER_GALLERY_BLUR_EFFECTS,
];
const CASES = EFFECTS.map((effect) => [effect.id, effect] as const);

function fixture(width = 32, height = 24): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = (x * 37 + y * 11 + ((x * y) % 7) * 19) % 256;
      data[offset + 1] = (x * 7 + y * 29 + ((x + y) % 5) * 41) % 256;
      data[offset + 2] = (x * 19 + y * 5 + ((x ^ y) % 9) * 23) % 256;
      data[offset + 3] = x < 2 ? 0 : 128 + ((x * 13 + y * 7) % 128);
    }
  }
  return { width, height, data };
}

function solid(width: number, height: number, rgba: readonly [number, number, number, number]): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set(rgba, offset);
  return { width, height, data };
}

const clone = (image: StudioFilterGalleryImage): StudioFilterGalleryImage =>
  ({ width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) });

const defaults = (effect: StudioFilterGalleryEffectDef): StudioFilterGalleryParams =>
  Object.fromEntries(effect.params.map((spec) => [spec.key, spec.default]));

function extreme(effect: StudioFilterGalleryEffectDef, side: "min" | "max"): StudioFilterGalleryParams {
  return Object.fromEntries(effect.params.map((spec) => {
    switch (spec.control) {
      case "slider": return [spec.key, side === "min" ? spec.min : spec.max];
      case "select": return [spec.key, side === "min" ? spec.options[0]!.value : spec.options.at(-1)!.value];
      case "color": return [spec.key, side === "min" ? "#000000" : "#ffffff"];
      case "toggle": return [spec.key, side === "max"];
    }
  }));
}

function run(
  effect: StudioFilterGalleryEffectDef,
  params: StudioFilterGalleryParams = defaults(effect),
  input: StudioFilterGalleryImage = fixture(),
  seed = 7,
): StudioFilterGalleryImage {
  const image = clone(input);
  effect.apply(image, params, { seed, scale: 1 });
  return image;
}

function meanAbsDiff(left: StudioFilterGalleryImage, right: StudioFilterGalleryImage, channels = [0, 1, 2]): number {
  let total = 0, count = 0;
  for (let offset = 0; offset < left.data.length; offset += 4) {
    for (const channel of channels) { total += Math.abs(left.data[offset + channel]! - right.data[offset + channel]!); count += 1; }
  }
  return total / Math.max(1, count);
}

const byId = (id: string): StudioFilterGalleryEffectDef => {
  const effect = EFFECTS.find((candidate) => candidate.id === id);
  if (!effect) throw new Error(`missing ${id}`);
  return effect;
};

describe("필터 갤러리 · 색·노이즈·흐림 계열 계약", () => {
  it("id 가 겹치지 않고 분류와 접두가 같으며 기본값이 범위 안에 있다", () => {
    expect(new Set(EFFECTS.map((effect) => effect.id)).size).toBe(EFFECTS.length);
    for (const effect of EFFECTS) {
      expect(effect.id.split(".")[0]).toBe(effect.category);
      expect(effect.references.length).toBeGreaterThan(0);
      expect(new Set(effect.params.map((spec) => spec.key)).size).toBe(effect.params.length);
      for (const spec of effect.params) {
        if (spec.control === "slider") {
          expect(spec.default).toBeGreaterThanOrEqual(spec.min);
          expect(spec.default).toBeLessThanOrEqual(spec.max);
        }
        if (spec.control === "select") expect(spec.options.map((option) => option.value)).toContain(spec.default);
        if (spec.control === "color") expect(spec.default).toMatch(/^#[0-9a-f]{6}$/u);
      }
    }
  });

  it.each(CASES)("%s 는 같은 입력·시드에서 같은 바이트를 낸다", (_id, effect) => {
    expect(run(effect).data).toEqual(run(effect).data);
  });

  it.each(CASES)("%s 기본값은 눈에 띄게 바꾼다", (_id, effect) => {
    expect(meanAbsDiff(run(effect), fixture())).toBeGreaterThan(1);
  });

  it.each(CASES)("%s 는 1×1·3×2 이미지에서도 던지지 않는다", (_id, effect) => {
    expect(() => run(effect, defaults(effect), fixture(1, 1))).not.toThrow();
    expect(() => run(effect, defaults(effect), fixture(3, 2))).not.toThrow();
  });

  it.each(CASES)("%s 는 알파를 바꾸지 않는다", (_id, effect) => {
    const input = fixture();
    const output = run(effect, defaults(effect), input);
    for (let offset = 3; offset < input.data.length; offset += 4) expect(output.data[offset]).toBe(input.data[offset]);
  });

  it.each(CASES)("%s 는 매개변수 양 끝에서도 던지지 않는다", (_id, effect) => {
    expect(() => run(effect, extreme(effect, "min"))).not.toThrow();
    expect(() => run(effect, extreme(effect, "max"))).not.toThrow();
  });
});

describe("필터 갤러리 · 색 계열 의미", () => {
  it("흑백 디더는 보이는 픽셀을 순수 흑·백으로만 칠한다", () => {
    const output = run(byId("color.error-diffusion-dither"), { algorithm: "atkinson", palette: "black-white", levels: 4, serpentine: true });
    for (let offset = 0; offset < output.data.length; offset += 4) {
      if (output.data[offset + 3]! < 8) continue;
      expect([0, 255]).toContain(output.data[offset]);
      expect(output.data[offset + 1]).toBe(output.data[offset]);
      expect(output.data[offset + 2]).toBe(output.data[offset]);
    }
  });

  it("RGB 8색 디더는 채널마다 0 또는 255 만 남기고 평균 밝기를 대체로 보존한다", () => {
    const input = fixture(48, 48);
    const output = run(byId("color.error-diffusion-dither"), undefined, input);
    let before = 0, after = 0, count = 0;
    for (let offset = 0; offset < output.data.length; offset += 4) {
      if (output.data[offset + 3]! < 8) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        expect([0, 255]).toContain(output.data[offset + channel]);
        before += input.data[offset + channel]!; after += output.data[offset + channel]!; count += 1;
      }
    }
    expect(Math.abs(before - after) / count).toBeLessThan(12);
  });

  it("색 줄이기는 보이는 픽셀의 고유 색 수를 지정한 수 이하로 만든다", () => {
    const output = run(byId("color.quantize"), { colors: 6, dither: false }, fixture(40, 30));
    const colors = new Set<number>();
    for (let offset = 0; offset < output.data.length; offset += 4) {
      if (output.data[offset + 3]! < 8) continue;
      colors.add((output.data[offset]! << 16) | (output.data[offset + 1]! << 8) | output.data[offset + 2]!);
    }
    expect(colors.size).toBeLessThanOrEqual(6);
    expect(colors.size).toBeGreaterThan(1);
  });

  it("중앙값 자르기는 보이는 픽셀이 없으면 팔레트를 만들지 않는다", () => {
    expect(medianCutPalette(solid(4, 4, [10, 20, 30, 0]), 8)).toBeNull();
    expect(medianCutPalette(solid(4, 4, [10, 20, 30, 255]), 8)).toEqual(new Float32Array([10, 20, 30]));
  });

  it("채널 최대화는 가장 큰 채널만 남긴다", () => {
    const output = run(byId("color.channel-extreme"), { mode: "maximize" }, solid(2, 2, [200, 120, 40, 255]));
    expect([...output.data.slice(0, 4)]).toEqual([200, 0, 0, 255]);
    const minimized = run(byId("color.channel-extreme"), { mode: "minimize" }, solid(2, 2, [200, 120, 40, 255]));
    expect([...minimized.data.slice(0, 4)]).toEqual([0, 0, 40, 255]);
  });

  it("명도 반전은 흰색을 검정으로, 검정을 흰색으로 바꾸고 순색의 색상을 유지한다", () => {
    const effect = byId("color.value-invert");
    expect([...run(effect, {}, solid(1, 1, [255, 255, 255, 255])).data]).toEqual([0, 0, 0, 255]);
    expect([...run(effect, {}, solid(1, 1, [0, 0, 0, 255])).data]).toEqual([255, 255, 255, 255]);
    const red = run(effect, {}, solid(1, 1, [128, 0, 0, 255])).data;
    expect(red[0]).toBeGreaterThan(120);
    expect(red[1]).toBe(0);
    expect(red[2]).toBe(0);
  });

  it("컬러 스플래시는 고른 색상만 남기고 다른 색은 회색으로 만든다", () => {
    const effect = byId("color.color-splash");
    const red = run(effect, defaults(effect), solid(1, 1, [220, 30, 30, 255])).data;
    expect(red[0]! - red[1]!).toBeGreaterThan(150);
    const green = run(effect, defaults(effect), solid(1, 1, [30, 200, 40, 255])).data;
    expect(Math.abs(green[0]! - green[1]!)).toBeLessThanOrEqual(1);
    expect(Math.abs(green[1]! - green[2]!)).toBeLessThanOrEqual(1);
  });

  it("분할 토닝은 중간 회색의 밝기를 유지하면서 어두운 영역에 색을 입힌다", () => {
    const effect = byId("color.split-toning");
    const dark = run(effect, defaults(effect), solid(1, 1, [50, 50, 50, 255])).data;
    expect(dark[2]!).toBeGreaterThan(dark[0]!);
    const luma = 0.299 * dark[0]! + 0.587 * dark[1]! + 0.114 * dark[2]!;
    expect(Math.abs(luma - 50)).toBeLessThan(2);
  });

  it("적응형 임계값은 잉크와 종이만 남기고, 종이 투명을 켜면 종이의 알파를 0으로 만든다", () => {
    const effect = byId("color.adaptive-threshold");
    const output = run(effect, { ...defaults(effect), inkColor: "#102030", transparentPaper: true });
    let ink = 0, paper = 0;
    for (let offset = 0; offset < output.data.length; offset += 4) {
      const rgb = [output.data[offset], output.data[offset + 1], output.data[offset + 2]];
      if (rgb.join() === "16,32,48") ink += 1;
      else { expect(rgb).toEqual([255, 255, 255]); expect(output.data[offset + 3]).toBe(0); paper += 1; }
    }
    expect(ink).toBeGreaterThan(0);
    expect(paper).toBeGreaterThan(0);
  });

  it("닷지는 중간 톤을 밝게, 번은 어둡게 한다", () => {
    const effect = byId("color.dodge-burn");
    const dodged = run(effect, { mode: "dodge", range: "midtones", exposure: 60 }, solid(1, 1, [128, 128, 128, 255])).data;
    const burned = run(effect, { mode: "burn", range: "midtones", exposure: 60 }, solid(1, 1, [128, 128, 128, 255])).data;
    expect(dodged[0]!).toBeGreaterThan(150);
    expect(burned[0]!).toBeLessThan(100);
  });
});

describe("필터 갤러리 · 노이즈·흐림 계열 의미", () => {
  it("흘러내림은 첫 줄을 건드리지 않는다", () => {
    const input = fixture();
    const output = run(byId("noise.slur"), { randomization: 100, repeat: 3 }, input);
    expect(output.data.slice(0, input.width * 4)).toEqual(input.data.slice(0, input.width * 4));
  });

  it("시드가 다르면 던지기 결과가 달라진다", () => {
    const effect = byId("noise.hurl");
    expect(run(effect, defaults(effect), fixture(), 1).data).not.toEqual(run(effect, defaults(effect), fixture(), 2).data);
  });

  it("대칭 최근접 이웃과 평균 곡률 흐림은 곧은 경계를 지킨다", () => {
    const width = 16, height = 12;
    const edge: StudioFilterGalleryImage = { width, height, data: new Uint8ClampedArray(width * height * 4) };
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const value = x < 8 ? 30 : 220;
        edge.data.set([value, value, value, 255], (y * width + x) * 4);
      }
    }
    for (const id of ["blur.symmetric-nearest-neighbor", "blur.mean-curvature"]) {
      const output = run(byId(id), undefined, edge);
      expect(output.data[(6 * width + 7) * 4]!).toBeLessThan(60);
      expect(output.data[(6 * width + 8) * 4]!).toBeGreaterThan(190);
    }
  });

  it("평균 곡률 흐림은 고립된 점 잡티를 줄인다", () => {
    const image = solid(9, 9, [100, 100, 100, 255]);
    image.data.set([255, 255, 255, 255], (4 * 9 + 4) * 4);
    const output = run(byId("blur.mean-curvature"), { iterations: 10 }, image);
    expect(output.data[(4 * 9 + 4) * 4]!).toBeLessThan(200);
  });
});
