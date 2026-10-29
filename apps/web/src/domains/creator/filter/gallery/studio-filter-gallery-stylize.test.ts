import { describe, expect, it } from "vitest";

import { luma } from "./studio-filter-gallery-kernel-utils";
import { STUDIO_FILTER_GALLERY_STYLIZE_EFFECTS } from "./studio-filter-gallery-stylize";
import { isStudioFilterGalleryEffectId } from "./studio-filter-gallery-types";

import type {
  StudioFilterGalleryEffectDef,
  StudioFilterGalleryImage,
  StudioFilterGalleryParamValue,
} from "./studio-filter-gallery-types";

type Params = Record<string, StudioFilterGalleryParamValue>;

const EFFECTS = STUDIO_FILTER_GALLERY_STYLIZE_EFFECTS;
const CONTEXT = { seed: 20261029, scale: 1 };

/** 큰 원형 형태·줄무늬·잔결에 0~255 의 다양한 알파(완전 투명 열 포함)를 섞은 시험 이미지. */
function fixture(width = 32, height = 24): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const inside = Math.hypot(x - width * 0.45, y - height * 0.5) < Math.min(width, height) * 0.32;
      data[offset] = inside ? 30 + ((x * 7) % 50) : 230 - ((x * 13 + y * 5) % 120);
      data[offset + 1] = (x * 11 + y * 17 + ((x * y) % 7) * 9) % 256;
      data[offset + 2] = inside ? 60 + ((y * 9) % 40) : (x * 3 + y * 29) % 256;
      data[offset + 3] = x < 2 ? 0 : 40 + ((x * 19 + y * 11) % 216);
    }
  }
  return { width, height, data };
}

/** (x, y) → RGBA 함수로 이미지를 만든다. */
function paint(width: number, height: number, pixel: (x: number, y: number) => readonly number[]): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) data.set(pixel(x, y), (y * width + x) * 4);
  return { width, height, data };
}

/** 시험 이미지에 투명 구멍을 뚫고 투명 픽셀의 RGB 를 주어진 쓰레기 색으로 채운다. */
function withTransparentGarbage(image: StudioFilterGalleryImage, garbage: readonly [number, number, number]): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(image.data);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (x >= 12 && x < 18 && y >= 8 && y < 14) data[offset + 3] = 0;
      if (data[offset + 3] === 0) data.set(garbage, offset);
    }
  }
  return { width: image.width, height: image.height, data };
}

function byId(id: string): StudioFilterGalleryEffectDef {
  const effect = EFFECTS.find((candidate) => candidate.id === id);
  if (!effect) throw new Error(`효과 없음: ${id}`);
  return effect;
}

function defaults(effect: StudioFilterGalleryEffectDef): Params {
  return Object.fromEntries(effect.params.map((spec) => [spec.key, spec.default]));
}

/** 슬라이더는 min/max(또는 그 바깥 값), 선택은 첫·끝 선택지, 토글은 false/true, 색은 검정/흰색. */
function extremes(effect: StudioFilterGalleryEffectDef, side: "min" | "max", overshoot = 0): Params {
  return Object.fromEntries(effect.params.map((spec): [string, StudioFilterGalleryParamValue] => {
    switch (spec.control) {
      case "slider":
        return [spec.key, side === "min" ? spec.min - overshoot : spec.max + overshoot];
      case "select":
        return [spec.key, (side === "min" ? spec.options[0] : spec.options[spec.options.length - 1]).value];
      case "toggle":
        return [spec.key, side === "max"];
      default:
        return [spec.key, side === "min" ? "#000000" : "#ffffff"];
    }
  }));
}

function run(effect: StudioFilterGalleryEffectDef, image: StudioFilterGalleryImage, params = defaults(effect), seed = CONTEXT.seed) {
  const out = { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
  effect.apply(out, params, { ...CONTEXT, seed });
  return out;
}

function meanAbsRgbDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let sum = 0;
  for (let offset = 0; offset < a.length; offset += 4) {
    for (let channel = 0; channel < 3; channel += 1) sum += Math.abs(a[offset + channel] - b[offset + channel]);
  }
  return sum / ((a.length / 4) * 3);
}

function alphaBytes(data: Uint8ClampedArray): number[] {
  return Array.from(data.filter((_, index) => index % 4 === 3));
}

/** 설명에 문서화한 알파 변경: 돌출(그린 면의 칸 평균 알파), 타일의 투명 채우기. */
const changesAlpha = (effect: StudioFilterGalleryEffectDef, params: Params): boolean =>
  effect.id === "stylize.extrude" || (effect.id === "stylize.tiles" && params.fill === "transparent");

describe("필터 갤러리 스타일화 커널 명세", () => {
  it("6종의 id 가 고유하고 분류 접두어와 일치한다", () => {
    const ids = EFFECTS.map((effect) => effect.id);
    expect(ids).toEqual([
      "stylize.diffuse", "stylize.extrude", "stylize.tiles", "stylize.trace-contour", "stylize.wind", "stylize.engrave",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const effect of EFFECTS) {
      expect(isStudioFilterGalleryEffectId(effect.id)).toBe(true);
      expect(effect.id.split(".")[0]).toBe(effect.category);
      expect(effect.category).toBe("stylize");
      expect(effect.label.trim().length).toBeGreaterThan(0);
      expect(effect.description.trim().length).toBeGreaterThan(0);
      expect(effect.references.length).toBeGreaterThan(0);
      expect(effect.cost).toBeGreaterThan(0);
    }
  });

  it("매개변수 기본값이 범위·선택지 안에 있고 키가 고유하다", () => {
    for (const effect of EFFECTS) {
      const keys = effect.params.map((spec) => spec.key);
      expect(new Set(keys).size, effect.id).toBe(keys.length);
      for (const spec of effect.params) {
        expect(spec.key, effect.id).toMatch(/^[a-z][a-zA-Z0-9]*$/u);
        expect(spec.label.trim().length).toBeGreaterThan(0);
        if (spec.control === "slider") {
          expect(spec.min, `${effect.id}.${spec.key}`).toBeLessThan(spec.max);
          expect(spec.default).toBeGreaterThanOrEqual(spec.min);
          expect(spec.default).toBeLessThanOrEqual(spec.max);
          expect(spec.step).toBeGreaterThan(0);
        } else if (spec.control === "select") {
          const values = spec.options.map((option) => option.value);
          expect(new Set(values).size).toBe(values.length);
          expect(values, `${effect.id}.${spec.key}`).toContain(spec.default);
        } else if (spec.control === "color") {
          expect(spec.default).toMatch(/^#[0-9a-f]{6}$/u);
        } else {
          expect(typeof spec.default).toBe("boolean");
        }
      }
    }
  });

  it("알파를 바꾸는 효과는 설명에 그 사실을 적는다", () => {
    expect(byId("stylize.extrude").description).toContain("알파");
    expect(byId("stylize.tiles").description).toContain("알파");
  });
});

describe.each(EFFECTS.map((effect) => [effect.id, effect] as const))("%s", (_id, effect) => {
  it("같은 입력·매개변수·시드면 같은 바이트를 낸다", () => {
    const image = fixture();
    expect(Array.from(run(effect, image).data)).toEqual(Array.from(run(effect, image).data));
  });

  it("기본값이 질감 있는 32×24 이미지를 눈에 띄게 바꾼다", () => {
    const image = fixture();
    expect(meanAbsRgbDiff(run(effect, image).data, image.data)).toBeGreaterThan(1);
  });

  it("문서화한 경우가 아니면 알파를 바꾸지 않는다", () => {
    const image = fixture();
    for (const params of [defaults(effect), extremes(effect, "min"), extremes(effect, "max")]) {
      if (changesAlpha(effect, params)) continue;
      expect(alphaBytes(run(effect, image, params).data)).toEqual(alphaBytes(image.data));
    }
  });

  it("완전 투명 픽셀의 RGB 는 보이는 결과에 섞이지 않는다", () => {
    const first = run(effect, withTransparentGarbage(fixture(), [255, 0, 255])).data;
    const second = run(effect, withTransparentGarbage(fixture(), [0, 255, 0])).data;
    for (let offset = 0; offset < first.length; offset += 4) {
      expect(second[offset + 3]).toBe(first[offset + 3]);
      if (first[offset + 3] === 0) continue;
      expect([second[offset], second[offset + 1], second[offset + 2]]).toEqual([first[offset], first[offset + 1], first[offset + 2]]);
    }
  });

  it("1×1·3×2·2×3 이미지와 매개변수 최솟값·최댓값에서 예외 없이 끝난다", () => {
    for (const [width, height] of [[1, 1], [3, 2], [2, 3], [32, 24]] as const) {
      for (const params of [defaults(effect), extremes(effect, "min"), extremes(effect, "max")]) {
        const out = run(effect, fixture(width, height), params);
        expect(out.data.length).toBe(width * height * 4);
      }
    }
  });

  it("모든 선택지 값에서 예외 없이 끝난다", () => {
    for (const spec of effect.params) {
      if (spec.control !== "select") continue;
      for (const option of spec.options) {
        expect(() => run(effect, fixture(), { ...defaults(effect), [spec.key]: option.value })).not.toThrow();
      }
    }
  });

  it("범위 밖 값은 명세의 min/max 로, 잘못된 형식은 기본값으로 읽는다", () => {
    const image = fixture(12, 10);
    expect(Array.from(run(effect, image, extremes(effect, "max", 1e6)).data)).toEqual(Array.from(run(effect, image, extremes(effect, "max")).data));
    expect(Array.from(run(effect, image, extremes(effect, "min", 1e6)).data)).toEqual(Array.from(run(effect, image, extremes(effect, "min")).data));
    const garbage: Params = Object.fromEntries(effect.params.map((spec) => [spec.key, spec.control === "slider" ? Number.NaN : 7]));
    expect(Array.from(run(effect, image, garbage).data)).toEqual(Array.from(run(effect, image).data));
  });
});

describe("스타일화 커널 의미 검사", () => {
  const lumaAt = (data: Uint8ClampedArray, offset: number) => luma(data[offset], data[offset + 1], data[offset + 2]);

  it("확산(보통)은 원본에 있던 색만 옮기고, 어둡게만·밝게만은 밝기를 한쪽으로만 바꾼다", () => {
    const effect = byId("stylize.diffuse");
    const image = fixture();
    const palette = new Set<string>();
    for (let offset = 0; offset < image.data.length; offset += 4) {
      palette.add(`${image.data[offset]},${image.data[offset + 1]},${image.data[offset + 2]}`);
    }
    const normal = run(effect, image).data;
    for (let offset = 0; offset < normal.length; offset += 4) {
      expect(palette.has(`${normal[offset]},${normal[offset + 1]},${normal[offset + 2]}`)).toBe(true);
    }
    const darker = run(effect, image, { mode: "darken-only", amount: 4 }).data;
    const lighter = run(effect, image, { mode: "lighten-only", amount: 4 }).data;
    let darkened = 0, lightened = 0;
    for (let offset = 0; offset < image.data.length; offset += 4) {
      const before = lumaAt(image.data, offset);
      expect(lumaAt(darker, offset)).toBeLessThanOrEqual(before + 1e-9);
      expect(lumaAt(lighter, offset)).toBeGreaterThanOrEqual(before - 1e-9);
      if (lumaAt(darker, offset) < before) darkened += 1;
      if (lumaAt(lighter, offset) > before) lightened += 1;
    }
    expect(darkened).toBeGreaterThan(0);
    expect(lightened).toBeGreaterThan(0);
  });

  it("이방성 확산은 색 변화가 적은 등휘도선 방향으로만 섞어 가로 띠를 거의 그대로 둔다", () => {
    const effect = byId("stylize.diffuse");
    const bands = paint(32, 32, (_x, y) => (Math.floor(y / 4) % 2 === 0 ? [30, 40, 50, 255] : [220, 210, 200, 255]));
    const isotropic = meanAbsRgbDiff(run(effect, bands, { mode: "normal", amount: 3 }).data, bands.data);
    const anisotropic = meanAbsRgbDiff(run(effect, bands, { mode: "anisotropic", amount: 3 }).data, bands.data);
    expect(anisotropic).toBeLessThan(isotropic / 3);
  });

  it("돌출은 불투명 이미지를 불투명하게 두고, 완전 투명 이미지는 건드리지 않는다", () => {
    const effect = byId("stylize.extrude");
    const opaque = paint(40, 30, (x, y) => [x * 6, y * 8, 128, 255]);
    for (const type of ["blocks", "pyramids"]) {
      const out = run(effect, opaque, { ...defaults(effect), type, size: 8, depth: 40 }).data;
      expect(alphaBytes(out).every((alpha) => alpha === 255), type).toBe(true);
      expect(meanAbsRgbDiff(out, opaque.data)).toBeGreaterThan(1);
    }
    const empty = paint(16, 12, () => [255, 0, 255, 0]);
    expect(Array.from(run(effect, empty).data)).toEqual(Array.from(empty.data));
  });

  it("돌출 단색 전면은 칸 평균색과 평균 알파로 칠한다", () => {
    const effect = byId("stylize.extrude");
    // 한 칸(8×8) 안이 반은 불투명 빨강, 반은 투명 → 칸 평균 알파는 128 근처, 색은 빨강(투명 픽셀 색은 섞이지 않는다).
    const image = paint(8, 8, (x) => (x < 4 ? [255, 0, 0, 255] : [0, 255, 0, 0]));
    const out = run(effect, image, { ...defaults(effect), size: 8, depth: 1, solidFront: true }).data;
    for (let offset = 0; offset < out.length; offset += 4) {
      expect(out[offset + 1]).toBe(0);
      expect(Math.abs(out[offset + 3] - 128)).toBeLessThanOrEqual(1);
    }
  });

  it("타일 투명 채우기는 불투명 이미지에 알파 0 틈을 만들고, 배경색 채우기는 알파를 지킨 채 틈을 그 색으로 칠한다", () => {
    const effect = byId("stylize.tiles");
    const opaque = paint(48, 40, (x, y) => [x * 5, y * 6, 90, 255]);
    const transparent = run(effect, opaque, { ...defaults(effect), fill: "transparent", maxOffset: 40 }).data;
    const alphas = alphaBytes(transparent);
    expect(alphas.filter((alpha) => alpha === 0).length).toBeGreaterThan(0);
    expect(alphas.every((alpha) => alpha === 0 || alpha === 255)).toBe(true);
    const background = run(effect, opaque, { ...defaults(effect), fill: "background", fillColor: "#ff00ff", maxOffset: 40 }).data;
    expect(alphaBytes(background)).toEqual(alphaBytes(opaque.data));
    let magenta = 0;
    for (let offset = 0; offset < background.length; offset += 4) {
      if (background[offset] === 255 && background[offset + 1] === 0 && background[offset + 2] === 255) magenta += 1;
    }
    expect(magenta).toBeGreaterThan(0);
  });

  it("윤곽선 추적은 매끈한 그라데이션에서 대부분 흰 바탕에 가는 선만 남기고, 아래·위 가장자리는 레벨 반대편에 선을 긋는다", () => {
    const effect = byId("stylize.trace-contour");
    const ramp = paint(64, 16, (x) => [x * 4, x * 4, x * 4, 255]);
    for (const edge of ["lower", "upper"]) {
      const out = run(effect, ramp, { level: 128, edge }).data;
      let white = 0;
      for (let offset = 0; offset < out.length; offset += 4) {
        if (out[offset] === 255 && out[offset + 1] === 255 && out[offset + 2] === 255) {
          white += 1;
          continue;
        }
        const value = ramp.data[offset];
        expect(edge === "lower" ? value < 128 : value >= 128).toBe(true);
      }
      expect(white / (out.length / 4)).toBeGreaterThan(0.9);
      expect(white).toBeLessThan(out.length / 4);
    }
  });

  it("바람은 밝은 가장자리에서 바람이 부는 쪽으로만 줄을 끈다", () => {
    const effect = byId("stylize.wind");
    const bar = paint(60, 20, (x) => (x >= 28 && x < 32 ? [250, 250, 250, 255] : [20, 20, 20, 255]));
    const brightness = (data: Uint8ClampedArray, from: number, to: number) => {
      let sum = 0;
      for (let y = 0; y < 20; y += 1) for (let x = from; x < to; x += 1) sum += data[(y * 60 + x) * 4];
      return sum / (20 * (to - from));
    };
    const fromRight = run(effect, bar, { ...defaults(effect), direction: "from-right" }).data;
    expect(brightness(fromRight, 10, 28)).toBeGreaterThan(25);
    expect(brightness(fromRight, 32, 60)).toBe(20);
    const fromLeft = run(effect, bar, { ...defaults(effect), direction: "from-left" }).data;
    expect(brightness(fromLeft, 32, 50)).toBeGreaterThan(25);
    expect(brightness(fromLeft, 0, 28)).toBe(20);
  });

  it("판화는 검정·흰색만 쓰고, 어두울수록 선이 굵으며, 굵기 제한을 켜면 띠마다 흰 틈을 남긴다", () => {
    const effect = byId("stylize.engrave");
    const countBlack = (data: Uint8ClampedArray) => {
      let black = 0;
      for (let offset = 0; offset < data.length; offset += 4) {
        expect([0, 255]).toContain(data[offset]);
        expect(data[offset + 1]).toBe(data[offset]);
        expect(data[offset + 2]).toBe(data[offset]);
        if (data[offset] === 0) black += 1;
      }
      return black;
    };
    const dark = countBlack(run(effect, paint(20, 20, () => [60, 60, 60, 255])).data);
    const light = countBlack(run(effect, paint(20, 20, () => [200, 200, 200, 255])).data);
    expect(dark).toBeGreaterThan(light);
    const black = paint(20, 20, () => [0, 0, 0, 255]);
    expect(countBlack(run(effect, black, { height: 5, limitLineWidth: false }).data)).toBe(400);
    expect(countBlack(run(effect, black, { height: 5, limitLineWidth: true }).data)).toBe(400 - 4 * 20);
  });
});
