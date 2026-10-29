import { describe, expect, it } from "vitest";

import { STUDIO_FILTER_GALLERY_TEXTURE_EFFECTS } from "./studio-filter-gallery-texture-stylize";
import { isStudioFilterGalleryEffectId } from "./studio-filter-gallery-types";

import type {
  StudioFilterGalleryEffectDef,
  StudioFilterGalleryImage,
  StudioFilterGalleryParamValue,
} from "./studio-filter-gallery-types";

type Params = Record<string, StudioFilterGalleryParamValue>;

const EFFECTS = STUDIO_FILTER_GALLERY_TEXTURE_EFFECTS;
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

function solid(width: number, height: number, rgba: readonly [number, number, number, number]): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set(rgba, offset);
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

describe("필터 갤러리 텍스처 커널 명세", () => {
  it("5종의 id 가 고유하고 분류 접두어와 일치한다", () => {
    const ids = EFFECTS.map((effect) => effect.id);
    expect(ids).toEqual(["texture.craquelure", "texture.grain", "texture.mosaic-tiles", "texture.patchwork", "texture.texturizer"]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const effect of EFFECTS) {
      expect(isStudioFilterGalleryEffectId(effect.id)).toBe(true);
      expect(effect.id.split(".")[0]).toBe(effect.category);
      expect(effect.category).toBe("texture");
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

  it("알파를 바꾸지 않는다", () => {
    const image = fixture();
    expect(alphaBytes(run(effect, image).data)).toEqual(alphaBytes(image.data));
    expect(alphaBytes(run(effect, image, extremes(effect, "max")).data)).toEqual(alphaBytes(image.data));
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

describe("텍스처 커널 의미 검사", () => {
  it("텍스처화는 부조 0 이면 그대로이고, 반전하면 요철 음영이 뒤집힌다", () => {
    const effect = byId("texture.texturizer");
    const image = fixture();
    expect(Array.from(run(effect, image, { ...defaults(effect), relief: 0 }).data)).toEqual(Array.from(image.data));
    const lit = run(effect, solid(32, 24, [128, 128, 128, 255]), { ...defaults(effect), relief: 30 }).data;
    const inverted = run(effect, solid(32, 24, [128, 128, 128, 255]), { ...defaults(effect), relief: 30, invert: true }).data;
    // 회색 바탕에서 밝아진 픽셀은 반전하면 어두워진다.
    let flipped = 0, lifted = 0;
    for (let offset = 0; offset < lit.length; offset += 4) {
      if (lit[offset] > 140) {
        lifted += 1;
        if (inverted[offset] < 128) flipped += 1;
      }
    }
    expect(lifted).toBeGreaterThan(0);
    expect(flipped / lifted).toBeGreaterThan(0.9);
  });

  it("균열은 깊이 0 이면 그대로이고, 기본값에서는 일부 픽셀만 어두운 균열선이 된다", () => {
    const effect = byId("texture.craquelure");
    const image = fixture();
    expect(Array.from(run(effect, image, { ...defaults(effect), crackDepth: 0 }).data)).toEqual(Array.from(image.data));
    const gray = solid(64, 64, [180, 180, 180, 255]);
    const out = run(effect, gray, { ...defaults(effect), crackBrightness: 0 }).data;
    const dark = out.filter((value, index) => index % 4 === 0 && value < 120).length;
    expect(dark).toBeGreaterThan(0);
    expect(dark).toBeLessThan((64 * 64) / 2);
  });

  it("그레인은 강도 0·대비 50 이면 그대로이고, 강도에 따라 입자가 세진다", () => {
    const effect = byId("texture.grain");
    const image = fixture();
    expect(Array.from(run(effect, image, { ...defaults(effect), intensity: 0, contrast: 50 }).data)).toEqual(Array.from(image.data));
    const gray = solid(32, 24, [128, 128, 128, 255]);
    const weak = meanAbsRgbDiff(run(effect, gray, { ...defaults(effect), intensity: 20 }).data, gray.data);
    const strong = meanAbsRgbDiff(run(effect, gray, { ...defaults(effect), intensity: 80 }).data, gray.data);
    expect(strong).toBeGreaterThan(weak * 2);
  });

  it("가로·세로 그레인은 해당 방향으로 이웃끼리 더 비슷하다", () => {
    const effect = byId("texture.grain");
    const gray = solid(48, 48, [128, 128, 128, 255]);
    const neighbourDiff = (type: string, dx: number, dy: number) => {
      const out = run(effect, gray, { ...defaults(effect), grainType: type, intensity: 100 }).data;
      let sum = 0;
      for (let y = 0; y < 47; y += 1) for (let x = 0; x < 47; x += 1) sum += Math.abs(out[(y * 48 + x) * 4] - out[((y + dy) * 48 + x + dx) * 4]);
      return sum;
    };
    expect(neighbourDiff("horizontal", 1, 0)).toBeLessThan(neighbourDiff("horizontal", 0, 1) / 2);
    expect(neighbourDiff("vertical", 0, 1)).toBeLessThan(neighbourDiff("vertical", 1, 0) / 2);
  });

  it("모자이크 타일은 밝은 줄눈과 원래 밝기의 타일 면을 함께 만든다", () => {
    const effect = byId("texture.mosaic-tiles");
    const gray = solid(64, 64, [100, 100, 100, 255]);
    const out = run(effect, gray, { ...defaults(effect), tileSize: 16, groutWidth: 2, lightenGrout: 10 }).data;
    const red = out.filter((_, index) => index % 4 === 0);
    expect(red.filter((value) => value >= 180).length).toBeGreaterThan(64);
    expect(red.filter((value) => Math.abs(value - 100) <= 8).length).toBeGreaterThan(64 * 64 * 0.2);
  });

  it("패치워크는 부조 0 이면 사각형마다 한 가지 실제 픽셀 색으로 채운다", () => {
    const effect = byId("texture.patchwork");
    const image = fixture();
    const out = run(effect, image, { ...defaults(effect), relief: 0, squareSize: 4 }).data;
    const cell = 6;
    const sourceColors = new Set<string>();
    for (let offset = 0; offset < image.data.length; offset += 4) {
      if (image.data[offset + 3] > 0) sourceColors.add(`${image.data[offset]},${image.data[offset + 1]},${image.data[offset + 2]}`);
    }
    for (let top = 0; top < 24; top += cell) {
      for (let left = 0; left < 32; left += cell) {
        const colors = new Set<string>();
        for (let y = top; y < Math.min(24, top + cell); y += 1) {
          for (let x = left; x < Math.min(32, left + cell); x += 1) {
            const offset = (y * 32 + x) * 4;
            colors.add(`${out[offset]},${out[offset + 1]},${out[offset + 2]}`);
          }
        }
        expect(colors.size).toBe(1);
        expect(sourceColors.has([...colors][0])).toBe(true);
      }
    }
  });
});
