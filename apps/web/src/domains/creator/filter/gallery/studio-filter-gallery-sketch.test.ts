import { describe, expect, it } from "vitest";

import { STUDIO_FILTER_GALLERY_SKETCH_EFFECTS } from "./studio-filter-gallery-sketch";
import { isStudioFilterGalleryEffectId } from "./studio-filter-gallery-types";

import type {
  StudioFilterGalleryEffectDef,
  StudioFilterGalleryImage,
  StudioFilterGalleryParamValue,
} from "./studio-filter-gallery-types";

type Params = Record<string, StudioFilterGalleryParamValue>;

const EFFECTS = STUDIO_FILTER_GALLERY_SKETCH_EFFECTS;
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

describe("필터 갤러리 스케치 커널 명세", () => {
  it("12종의 id 가 고유하고 분류 접두어와 일치한다", () => {
    const ids = EFFECTS.map((effect) => effect.id);
    expect(ids).toEqual([
      "sketch.bas-relief", "sketch.chalk-charcoal", "sketch.charcoal", "sketch.chrome", "sketch.conte-crayon",
      "sketch.graphic-pen", "sketch.halftone-pattern", "sketch.note-paper", "sketch.plaster", "sketch.reticulation",
      "sketch.torn-edges", "sketch.water-paper",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const effect of EFFECTS) {
      expect(isStudioFilterGalleryEffectId(effect.id)).toBe(true);
      expect(effect.id.split(".")[0]).toBe(effect.category);
      expect(effect.category).toBe("sketch");
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

  it("스케치 효과는 물 종이·크롬을 빼고 잉크색·종이색 매개변수를 가진다", () => {
    for (const effect of EFFECTS) {
      const keys = effect.params.map((spec) => spec.key);
      const twoTone = !["sketch.water-paper", "sketch.chrome"].includes(effect.id);
      expect(keys.includes("inkColor") && keys.includes("paperColor"), effect.id).toBe(twoTone);
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

describe("스케치 커널 의미 검사", () => {
  /** 불투명 픽셀이 정확히 두 색 중 하나인지 센다. */
  function countOffPalette(data: Uint8ClampedArray, palette: readonly (readonly number[])[]): number {
    let off = 0;
    for (let offset = 0; offset < data.length; offset += 4) {
      if (data[offset + 3] === 0) continue;
      const rgb = [data[offset], data[offset + 1], data[offset + 2]];
      if (!palette.some((color) => color.every((value, channel) => value === rgb[channel]))) off += 1;
    }
    return off;
  }

  it.each(["sketch.graphic-pen", "sketch.torn-edges"])("%s 는 불투명 픽셀을 잉크색·종이색 두 색으로만 칠한다", (id) => {
    const effect = byId(id);
    const out = run(effect, fixture(), { ...defaults(effect), inkColor: "#123456", paperColor: "#fedcba" });
    expect(countOffPalette(out.data, [[0x12, 0x34, 0x56], [0xfe, 0xdc, 0xba]])).toBe(0);
    const both = new Set<number>();
    for (let offset = 0; offset < out.data.length; offset += 4) both.add(out.data[offset]);
    expect(both.size).toBe(2);
  });

  it.each([
    "sketch.bas-relief", "sketch.chalk-charcoal", "sketch.charcoal", "sketch.conte-crayon", "sketch.halftone-pattern",
    "sketch.note-paper", "sketch.plaster", "sketch.reticulation",
  ])("%s 는 결과를 잉크색과 종이색 사이 선분에 사상한다", (id) => {
    const effect = byId(id);
    // 빨강(잉크)~파랑(종이): 초록은 0, 빨강+파랑은 255 근처여야 한다. 요철 조명이 있는 효과는 부조를 끈다.
    const params: Params = { ...defaults(effect), inkColor: "#ff0000", paperColor: "#0000ff" };
    if (effect.params.some((spec) => spec.key === "relief")) params.relief = 0;
    const out = run(effect, fixture(), params);
    for (let offset = 0; offset < out.data.length; offset += 4) {
      expect(out.data[offset + 1]).toBe(0);
      expect(Math.abs(out.data[offset] + out.data[offset + 2] - 255)).toBeLessThanOrEqual(1);
    }
  });

  it("크롬은 무채색 금속 표면을 만든다", () => {
    const out = run(byId("sketch.chrome"), fixture());
    for (let offset = 0; offset < out.data.length; offset += 4) {
      expect(out.data[offset]).toBe(out.data[offset + 1]);
      expect(out.data[offset + 1]).toBe(out.data[offset + 2]);
    }
  });

  it("물 종이는 색을 유지한 채 번지게 한다", () => {
    const image = fixture();
    const out = run(byId("sketch.water-paper"), image);
    let chromatic = 0;
    for (let offset = 0; offset < out.data.length; offset += 4) {
      if (out.data[offset + 3] > 0 && Math.abs(out.data[offset] - out.data[offset + 2]) > 40) chromatic += 1;
    }
    expect(chromatic).toBeGreaterThan(out.data.length / 4 / 4);
  });

  it("물 종이는 투명 픽셀의 RGB 를 이웃에 섞지 않는다", () => {
    // 왼쪽 절반은 투명한 자홍색 쓰레기 값, 오른쪽 절반은 불투명 회색.
    const width = 24, height = 16;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < width * height; index += 1) {
      const opaque = index % width >= width / 2;
      data.set(opaque ? [120, 120, 120, 255] : [255, 0, 255, 0], index * 4);
    }
    const out = run(byId("sketch.water-paper"), { width, height, data });
    for (let index = 0; index < width * height; index += 1) {
      if (out.data[index * 4 + 3] === 0) continue;
      expect(Math.abs(out.data[index * 4] - out.data[index * 4 + 1])).toBeLessThanOrEqual(1);
    }
  });

  it("그래픽 펜은 명암 균형을 올릴수록 잉크가 늘어난다", () => {
    const effect = byId("sketch.graphic-pen");
    const inkCount = (balance: number) => {
      const out = run(effect, fixture(), { ...defaults(effect), lightDarkBalance: balance, inkColor: "#000000", paperColor: "#ffffff" });
      return out.data.filter((value, index) => index % 4 === 0 && value === 0).length;
    };
    expect(inkCount(80)).toBeGreaterThan(inkCount(50));
    expect(inkCount(50)).toBeGreaterThan(inkCount(20));
  });

  it("하프톤 대비를 최대로 올리면 거의 두 색만 남는다", () => {
    const effect = byId("sketch.halftone-pattern");
    const out = run(effect, fixture(), { ...defaults(effect), contrast: 50, inkColor: "#000000", paperColor: "#ffffff" });
    const extremesCount = out.data.filter((value, index) => index % 4 === 0 && (value < 16 || value > 239)).length;
    expect(extremesCount / (out.data.length / 4)).toBeGreaterThan(0.85);
  });

  it("무작위 획·입자 효과는 시드가 바뀌면 결과도 바뀐다", () => {
    for (const id of ["sketch.chalk-charcoal", "sketch.charcoal", "sketch.graphic-pen", "sketch.reticulation", "sketch.water-paper"]) {
      const effect = byId(id);
      expect(meanAbsRgbDiff(run(effect, fixture(), defaults(effect), 1).data, run(effect, fixture(), defaults(effect), 2).data), id).toBeGreaterThan(0);
    }
  });
});
