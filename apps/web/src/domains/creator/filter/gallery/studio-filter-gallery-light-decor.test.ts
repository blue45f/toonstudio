import { describe, expect, it } from "vitest";

import {
  STUDIO_FILTER_GALLERY_DECOR_EFFECTS as DECOR,
  STUDIO_FILTER_GALLERY_LIGHT_EFFECTS as LIGHT,
} from "./studio-filter-gallery-light-decor";

import type {
  StudioFilterGalleryEffectDef, StudioFilterGalleryImage, StudioFilterGalleryParamValue, StudioFilterGalleryParams,
} from "./studio-filter-gallery-types";

const EFFECTS = [...LIGHT, ...DECOR];

/** 결이 있는 RGB 와 들쭉날쭉한 알파(왼쪽 위 3×3 은 완전 투명)를 가진 시험 이미지. opaque 면 알파를 모두 255 로 둔다. */
function textured(width: number, height: number, opaque = false): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = (x * 37 + y * 11 + ((x * y) % 7) * 19) % 256;
      data[offset + 1] = (x * 13 + y * 41 + ((x + 2 * y) % 5) * 29) % 256;
      data[offset + 2] = (x * 7 + y * 23 + ((3 * x + y) % 9) * 17) % 256;
      data[offset + 3] = opaque ? 255 : x < 3 && y < 3 ? 0 : 60 + ((x * 29 + y * 17) % 196);
    }
  }
  return { width, height, data };
}

/** 투명 바탕 가운데 근처에 불투명한 정사각형 하나. */
function squareOnTransparent(size: number, from: number, to: number): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = from; y < to; y += 1) for (let x = from; x < to; x += 1) data.set([200, 120, 40, 255], (y * size + x) * 4);
  return { width: size, height: size, data };
}

function paramsOf(
  effect: StudioFilterGalleryEffectDef,
  pick: "default" | "min" | "max" = "default",
  overrides: StudioFilterGalleryParams = {},
): StudioFilterGalleryParams {
  const params: Record<string, StudioFilterGalleryParamValue> = {};
  for (const spec of effect.params) params[spec.key] = spec.control === "slider" && pick !== "default" ? spec[pick] : spec.default;
  return { ...params, ...overrides };
}

function run(effect: StudioFilterGalleryEffectDef, image: StudioFilterGalleryImage, params = paramsOf(effect), seed = 7): Uint8ClampedArray {
  const copy = { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
  effect.apply(copy, params, { seed, scale: 1 });
  return copy.data;
}

function meanAbsDiff(left: Uint8ClampedArray, right: Uint8ClampedArray): number {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) sum += Math.abs(left[index]! - right[index]!);
  return sum / left.length;
}

const alphaOf = (data: Uint8ClampedArray): number[] => Array.from(data.filter((_, index) => index % 4 === 3));
const rgbOf = (data: Uint8ClampedArray): number[] => Array.from(data.filter((_, index) => index % 4 !== 3));
const alphaAt = (image: { width: number; data: Uint8ClampedArray }, x: number, y: number): number => image.data[(y * image.width + x) * 4 + 3]!;

function effectById(id: string): StudioFilterGalleryEffectDef {
  const found = EFFECTS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`효과 없음: ${id}`);
  return found;
}

function onStepGrid(min: number, step: number, value: number): boolean {
  const decimals = Math.min(6, (String(step).split(".")[1] ?? "").length);
  return Number((min + Math.round((value - min) / step) * step).toFixed(decimals)) === value;
}

/** 문서화된 알파 규칙: 긴 그림자는 알파를 늘리기만, 둥근 모서리는 줄이기만 하고, 나머지는 그대로 둔다. */
function expectAlphaRule(id: string, before: Uint8ClampedArray, after: Uint8ClampedArray): void {
  const input = alphaOf(before), output = alphaOf(after);
  if (id === "light.long-shadow") {
    output.forEach((value, index) => expect(value).toBeGreaterThanOrEqual(input[index]!));
  } else if (id === "decor.round-corners") {
    output.forEach((value, index) => expect(value).toBeLessThanOrEqual(input[index]!));
    expect(rgbOf(after)).toEqual(rgbOf(before));
  } else {
    expect(output).toEqual(input);
  }
}

const SEEDED = ["light.supernova", "light.sparkle", "decor.coffee-stain", "decor.fog", "decor.jigsaw"];
const UNSEEDED = ["light.lighting-effects", "light.long-shadow", "decor.round-corners"];

describe("필터 갤러리 · 빛과 그림자·장식 계열 명세", () => {
  it("id 가 겹치지 않고 접두사가 분류와 같으며 매개변수 명세가 계약을 지킨다", () => {
    expect(LIGHT.map((effect) => effect.id)).toEqual(["light.lighting-effects", "light.supernova", "light.sparkle", "light.long-shadow"]);
    expect(DECOR.map((effect) => effect.id)).toEqual(["decor.round-corners", "decor.coffee-stain", "decor.fog", "decor.jigsaw"]);
    for (const effect of LIGHT) expect(effect.category).toBe("light");
    for (const effect of DECOR) expect(effect.category).toBe("decor");
    const ids = EFFECTS.map((effect) => effect.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const effect of EFFECTS) {
      expect(effect.id.split(".")[0]).toBe(effect.category);
      expect(effect.label.length).toBeGreaterThan(0);
      expect(effect.description.length).toBeGreaterThan(0);
      expect(effect.references.length).toBeGreaterThan(0);
      expect(effect.cost).toBeGreaterThan(0);
      const keys = effect.params.map((spec) => spec.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const spec of effect.params) {
        expect(spec.key).toMatch(/^[a-z][a-zA-Z0-9]*$/u);
        if (spec.control === "slider") {
          expect(spec.min).toBeLessThanOrEqual(spec.default);
          expect(spec.default).toBeLessThanOrEqual(spec.max);
          expect(spec.step).toBeGreaterThan(0);
          expect(onStepGrid(spec.min, spec.step, spec.default)).toBe(true);
        } else if (spec.control === "select") {
          expect(spec.options.map((option) => option.value)).toContain(spec.default);
        } else if (spec.control === "color") {
          expect(spec.default).toMatch(/^#[0-9a-f]{6}$/u);
        }
      }
    }
  });
});

for (const effect of EFFECTS) {
  describe(effect.id, () => {
    it("같은 입력·매개변수·시드면 같은 바이트를 낸다", () => {
      const image = textured(32, 24);
      expect(run(effect, image)).toEqual(run(effect, image));
    });

    it("기본값으로 결이 있는 이미지를 눈에 띄게 바꾸고 문서화된 알파 규칙을 지킨다", () => {
      const image = textured(32, 24);
      const out = run(effect, image);
      expect(meanAbsDiff(out, image.data)).toBeGreaterThan(1);
      expectAlphaRule(effect.id, image.data, out);
    });

    it("작은 이미지·모든 슬라이더 최소/최대·모든 선택지에서 던지지 않고 알파 규칙을 지킨다", () => {
      for (const [width, height] of [[1, 1], [3, 2], [2, 3]] as const) {
        const tiny = textured(width, height);
        for (const pick of ["default", "min", "max"] as const) expectAlphaRule(effect.id, tiny.data, run(effect, tiny, paramsOf(effect, pick)));
      }
      const image = textured(32, 24);
      for (const pick of ["min", "max"] as const) expectAlphaRule(effect.id, image.data, run(effect, image, paramsOf(effect, pick)));
      for (const spec of effect.params) {
        if (spec.control !== "select") continue;
        for (const option of spec.options) {
          for (const pick of ["default", "min", "max"] as const) {
            expectAlphaRule(effect.id, image.data, run(effect, image, paramsOf(effect, pick, { [spec.key]: option.value })));
          }
        }
      }
    });
  });
}

describe("필터 갤러리 · 빛과 그림자·장식 계열 의미", () => {
  it("시드를 쓰는 효과는 시드가 바뀌면 결과가 바뀌고, 쓰지 않는 효과는 그대로다", () => {
    const image = textured(64, 48);
    for (const id of SEEDED) {
      const effect = effectById(id);
      expect(run(effect, image, paramsOf(effect), 1), id).not.toEqual(run(effect, image, paramsOf(effect), 2));
    }
    for (const id of UNSEEDED) {
      const effect = effectById(id);
      expect(run(effect, image, paramsOf(effect), 1), id).toEqual(run(effect, image, paramsOf(effect), 2));
    }
  });

  it("긴 그림자는 투명 바탕의 불투명 사각형에서 그림자 방향으로만 새 알파를 만든다", () => {
    const image = squareOnTransparent(48, 10, 16);
    const shadow = effectById("light.long-shadow");
    for (const style of ["fading", "finite"]) {
      const out = { width: 48, data: run(shadow, image, paramsOf(shadow, "default", { style })) };
      // 기본 45°(오른쪽 아래)·길이 40px: 대각선 아래쪽에는 그림자가, 반대쪽과 옆에는 아무것도 없다.
      expect(alphaAt(out, 24, 24), style).toBeGreaterThan(0);
      expect(alphaAt(out, 30, 30), style).toBeGreaterThan(0);
      expect(alphaAt(out, 5, 5), style).toBe(0);
      expect(alphaAt(out, 40, 12), style).toBe(0);
      expect(alphaAt(out, 12, 40), style).toBe(0);
      // 불투명한 원본은 그림자 아래에 깔리므로 그대로다.
      expect(Array.from(out.data.subarray((12 * 48 + 12) * 4, (12 * 48 + 12) * 4 + 4))).toEqual([200, 120, 40, 255]);
    }
    const fading = { width: 48, data: run(shadow, image) };
    expect(alphaAt(fading, 20, 20)).toBeGreaterThan(alphaAt(fading, 36, 36));
    const up = { width: 48, data: run(shadow, squareOnTransparent(48, 30, 36), paramsOf(shadow, "default", { angle: -90, length: 20 })) };
    expect(alphaAt(up, 32, 20)).toBeGreaterThan(0);
    expect(alphaAt(up, 32, 42)).toBe(0);
    const none = run(shadow, image, paramsOf(shadow, "default", { opacity: 0 }));
    expect(none).toEqual(image.data);
  });

  it("둥근 모서리는 모서리 픽셀을 투명하게 하고 가운데는 그대로 둔다", () => {
    // 기본 반지름 24px 가 짧은 변의 절반보다 작은 크기에서 본다(더 작으면 반지름이 절반으로 줄어 변 가운데도 원호가 된다).
    const image = textured(64, 56, true);
    const out = { width: 64, data: run(effectById("decor.round-corners"), image) };
    for (const [x, y] of [[0, 0], [63, 0], [0, 55], [63, 55]] as const) expect(alphaAt(out, x, y)).toBe(0);
    expect(alphaAt(out, 32, 28)).toBe(255);
    expect(alphaAt(out, 32, 0)).toBe(255);
    expect(alphaAt(out, 0, 28)).toBe(255);
    expect(alphaAt(out, 24, 0)).toBe(255);
    // 반지름 24 의 원호는 대각선에서 약 7.03px 를 지난다: (2,2) 밖, (6,7) 경계(부분 덮임), (8,8) 안.
    expect(alphaAt(out, 2, 2)).toBe(0);
    expect(alphaAt(out, 6, 7)).toBeGreaterThan(0);
    expect(alphaAt(out, 6, 7)).toBeLessThan(255);
    expect(alphaAt(out, 8, 8)).toBe(255);
    // 네 모서리 24×24 사각형 밖 픽셀은 알파가 하나도 바뀌지 않는다.
    let changedOutside = 0;
    for (let y = 0; y < 56; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        const inCorner = (x < 24 || x >= 40) && (y < 24 || y >= 32);
        if (!inCorner && alphaAt(out, x, y) !== alphaAt(image, x, y)) changedOutside += 1;
      }
    }
    expect(changedOutside).toBe(0);
  });

  it("조명: 주변광 100%·세기 0 이면 원본 그대로이고, 스포트라이트는 광원 쪽이 반대쪽보다 밝다", () => {
    const image = textured(40, 40, true);
    const lighting = effectById("light.lighting-effects");
    expect(run(lighting, image, paramsOf(lighting, "default", { ambient: 100, intensity: 0 }))).toEqual(image.data);
    const flat = { width: 40, height: 40, data: new Uint8ClampedArray(40 * 40 * 4).fill(200) };
    const lit = run(lighting, flat, paramsOf(lighting, "default", { bumpDepth: 0 }));
    expect(lit[(14 * 40 + 14) * 4]!).toBeGreaterThan(lit[(2 * 40 + 38) * 4]!);
  });

  it("초신성·반짝임은 빛을 더하기만 하고, 커피 얼룩은 어둡게만 한다", () => {
    const image = textured(48, 40, true);
    const before = rgbOf(image.data);
    for (const id of ["light.supernova", "light.sparkle"]) {
      const after = rgbOf(run(effectById(id), image));
      after.forEach((value, index) => expect(value, id).toBeGreaterThanOrEqual(before[index]!));
    }
    const stained = rgbOf(run(effectById("decor.coffee-stain"), image));
    stained.forEach((value, index) => expect(value).toBeLessThanOrEqual(before[index]!));
    const coffee = effectById("decor.coffee-stain");
    expect(run(coffee, image, paramsOf(coffee, "default", { darkness: 0 }))).toEqual(image.data);
  });

  it("반짝임은 기준 100% 에서 가장 밝은 픽셀 하나만으로도 빛살을 그린다", () => {
    const dark = { width: 31, height: 31, data: new Uint8ClampedArray(31 * 31 * 4) };
    for (let offset = 0; offset < dark.data.length; offset += 4) dark.data.set([20, 20, 20, 255], offset);
    dark.data.set([255, 255, 255, 255], (15 * 31 + 15) * 4);
    const sparkle = effectById("light.sparkle");
    const out = run(sparkle, dark, paramsOf(sparkle, "default", { threshold: 100, spikePoints: 4, spikeAngle: 0, spikeLength: 12 }));
    // 0° 빛살이면 오른쪽·아래·왼쪽·위로 뻗는다.
    expect(out[(15 * 31 + 20) * 4]!).toBeGreaterThan(20);
    expect(out[(20 * 31 + 15) * 4]!).toBeGreaterThan(20);
    expect(out[(5 * 31 + 5) * 4]!).toBe(20);
  });

  it("안개: 불투명도 0 이면 그대로이고, 기본값은 안개 색 쪽으로 다가간다", () => {
    const image = textured(40, 30, true);
    const fog = effectById("decor.fog");
    expect(run(fog, image, paramsOf(fog, "default", { opacity: 0 }))).toEqual(image.data);
    const out = run(fog, image, paramsOf(fog, "default", { color: "#ffffff", opacity: 100 }));
    const meanOf = (data: Uint8ClampedArray): number => rgbOf(data).reduce((sum, value) => sum + value, 0);
    expect(meanOf(out)).toBeGreaterThan(meanOf(image.data));
  });

  it("직소: 1×1 조각이면 자름선이 없고, 기본값은 조각 경계 픽셀을 어둡게 한다", () => {
    const image = textured(60, 40, true);
    const jigsaw = effectById("decor.jigsaw");
    expect(run(jigsaw, image, paramsOf(jigsaw, "default", { tilesX: 1, tilesY: 1 }))).toEqual(image.data);
    const flat = { width: 60, height: 40, data: new Uint8ClampedArray(60 * 40 * 4).fill(180) };
    for (const style of ["curved", "square"]) {
      const out = run(jigsaw, flat, paramsOf(jigsaw, "default", { tilesX: 3, tilesY: 2, bevelWidth: 0, style }));
      // 세로 자름선 x = 20 은 꼭지가 없는 위·아래 끝에서 직선이다.
      expect(out[(1 * 60 + 19) * 4]!, style).toBeLessThan(180);
      expect(out[(1 * 60 + 10) * 4]!, style).toBe(180);
    }
  });
});
