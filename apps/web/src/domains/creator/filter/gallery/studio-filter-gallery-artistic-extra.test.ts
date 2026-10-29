import { describe, expect, it } from "vitest";

import { STUDIO_FILTER_GALLERY_ARTISTIC_EXTRA_EFFECTS as EFFECTS } from "./studio-filter-gallery-artistic-extra";

import type {
  StudioFilterGalleryEffectDef, StudioFilterGalleryImage, StudioFilterGalleryParamValue, StudioFilterGalleryParams,
} from "./studio-filter-gallery-types";

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

/** 보이는(알파 > 0) 픽셀의 서로 다른 RGB 개수. */
function distinctVisibleColors(data: Uint8ClampedArray): number {
  const colors = new Set<number>();
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] !== 0) colors.add((data[offset]! << 16) | (data[offset + 1]! << 8) | data[offset + 2]!);
  }
  return colors.size;
}

function effectById(id: string): StudioFilterGalleryEffectDef {
  const found = EFFECTS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`효과 없음: ${id}`);
  return found;
}

function onStepGrid(min: number, step: number, value: number): boolean {
  const decimals = Math.min(6, (String(step).split(".")[1] ?? "").length);
  return Number((min + Math.round((value - min) / step) * step).toFixed(decimals)) === value;
}

describe("필터 갤러리 · 예술 효과 추가분 명세", () => {
  it("id 가 겹치지 않고 접두사가 분류와 같으며 매개변수 명세가 계약을 지킨다", () => {
    const ids = EFFECTS.map((effect) => effect.id);
    expect(ids).toEqual(["artistic.cartoon", "artistic.cubism", "artistic.superpixel"]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const effect of EFFECTS) {
      expect(effect.category).toBe("artistic");
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

    it("기본값으로 결이 있는 이미지를 눈에 띄게 바꾸고 알파는 그대로 둔다", () => {
      const image = textured(32, 24);
      const out = run(effect, image);
      expect(meanAbsDiff(out, image.data)).toBeGreaterThan(1);
      expect(alphaOf(out)).toEqual(alphaOf(image.data));
    });

    it("작은 이미지·모든 슬라이더 최소/최대에서 던지지 않고 알파를 지킨다", () => {
      for (const [width, height] of [[1, 1], [3, 2], [2, 3]] as const) {
        const tiny = textured(width, height);
        for (const pick of ["default", "min", "max"] as const) {
          expect(alphaOf(run(effect, tiny, paramsOf(effect, pick)))).toEqual(alphaOf(tiny.data));
        }
      }
      const image = textured(32, 24);
      for (const pick of ["min", "max"] as const) expect(alphaOf(run(effect, image, paramsOf(effect, pick)))).toEqual(alphaOf(image.data));
    });
  });
}

describe("필터 갤러리 · 예술 효과 추가분 의미", () => {
  it("큐비즘만 시드를 쓰고, 카툰·슈퍼픽셀은 시드와 무관하다", () => {
    const image = textured(48, 40);
    const cubism = effectById("artistic.cubism");
    expect(run(cubism, image, paramsOf(cubism), 1)).not.toEqual(run(cubism, image, paramsOf(cubism), 2));
    for (const id of ["artistic.cartoon", "artistic.superpixel"]) {
      const effect = effectById(id);
      expect(run(effect, image, paramsOf(effect), 1), id).toEqual(run(effect, image, paramsOf(effect), 2));
    }
  });

  it("슈퍼픽셀은 덩어리 수만큼의 색만 남겨 입력보다 훨씬 적은 색을 쓴다", () => {
    const superpixel = effectById("artistic.superpixel");
    for (const opaque of [true, false]) {
      const image = textured(48, 32, opaque);
      const before = distinctVisibleColors(image.data);
      const after = distinctVisibleColors(run(superpixel, image, paramsOf(superpixel, "default", { clusterSize: 8 })));
      expect(before).toBeGreaterThan(500);
      // 간격 8 격자는 6 × 4 = 24 덩어리다.
      expect(after).toBeLessThanOrEqual(24);
      expect(after).toBeGreaterThan(1);
    }
  });

  it("카툰은 어둡게만 하고, 검정 비율이 클수록 더 어둡고, 0 이면 그대로다", () => {
    const image = textured(40, 32, true);
    const cartoon = effectById("artistic.cartoon");
    const before = rgbOf(image.data);
    const light = rgbOf(run(cartoon, image, paramsOf(cartoon, "default", { pctBlack: 0.1 })));
    const heavy = rgbOf(run(cartoon, image, paramsOf(cartoon, "default", { pctBlack: 0.5 })));
    light.forEach((value, index) => expect(value).toBeLessThanOrEqual(before[index]!));
    const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);
    expect(sum(heavy)).toBeLessThan(sum(light));
    expect(run(cartoon, image, paramsOf(cartoon, "default", { pctBlack: 0 }))).toEqual(image.data);
  });

  it("큐비즘: 채도 0 이면 바탕색만 남고, 단색 그림은 바탕색과 그 색 사이 색만 나온다", () => {
    const cubism = effectById("artistic.cubism");
    const image = textured(32, 24);
    const blank = run(cubism, image, paramsOf(cubism, "default", { tileSaturation: 0, backgroundColor: "#102030" }));
    for (let offset = 0; offset < blank.length; offset += 4) {
      if (image.data[offset + 3] === 0) continue;
      expect(Array.from(blank.subarray(offset, offset + 3))).toEqual([0x10, 0x20, 0x30]);
    }
    const flat = { width: 32, height: 24, data: new Uint8ClampedArray(32 * 24 * 4) };
    for (let offset = 0; offset < flat.data.length; offset += 4) flat.data.set([240, 120, 0, 255], offset);
    const out = run(cubism, flat, paramsOf(cubism, "default", { backgroundColor: "#000000" }));
    let painted = 0;
    for (let offset = 0; offset < out.length; offset += 4) {
      // 검정(0,0,0)과 (240,120,0) 을 잇는 선분 위: 초록은 빨강의 절반, 파랑은 0.
      expect(Math.abs(out[offset + 1]! - out[offset]! / 2)).toBeLessThanOrEqual(1);
      expect(out[offset + 2]).toBe(0);
      if (out[offset]! > 200) painted += 1;
    }
    expect(painted).toBeGreaterThan(100);
  });
});
