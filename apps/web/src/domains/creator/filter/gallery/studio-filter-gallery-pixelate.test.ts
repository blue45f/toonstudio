import { describe, expect, it } from "vitest";

import { STUDIO_FILTER_GALLERY_PIXELATE_EFFECTS } from "./studio-filter-gallery-pixelate";

import { isStudioFilterGalleryEffectId } from "./studio-filter-gallery-types";

import type {
  StudioFilterGalleryEffectDef,
  StudioFilterGalleryImage,
  StudioFilterGalleryParams,
} from "./studio-filter-gallery-types";

const EFFECTS = STUDIO_FILTER_GALLERY_PIXELATE_EFFECTS;
const CASES = EFFECTS.map((effect) => [effect.id, effect] as const);
const ALPHA_KEEPING = ["pixelate.facet", "pixelate.mezzotint", "pixelate.video-degradation"] as const;

const EXPECTED_REFERENCES: Readonly<Record<string, readonly string[]>> = {
  "pixelate.facet": ["Photoshop · 단면화"],
  "pixelate.fragment": ["Photoshop · 조각", "Paint.NET · 조각"],
  "pixelate.mezzotint": ["Photoshop · 메조틴트"],
  "pixelate.video-degradation": ["GIMP · 비디오 열화"],
  "pixelate.pixel-art": ["Aseprite · 픽셀 아트 작업 흐름", "Photoshop · 모자이크+인덱스 색상"],
};

/** 무늬가 촘촘하고 알파가 0~255 로 다양한 32×24 시험 그림(opaque 면 알파 255). */
function fixture(width = 32, height = 24, opaque = false): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = (x * 31 + y * 7 + ((x + y) % 3) * 41) % 256;
      data[offset + 1] = (x * 13 + y * 29 + ((x * y) % 5) * 23) % 256;
      data[offset + 2] = (x * 5 + y * 37 + ((x + y) % 7) * 17) % 256;
      data[offset + 3] = opaque ? 255 : x < 2 ? 0 : 48 + ((x * 19 + y * 11) % 208);
    }
  }
  return { width, height, data };
}

function paint(width: number, height: number, color: (x: number, y: number) => readonly [number, number, number, number]): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) data.set(color(x, y), (y * width + x) * 4);
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
      case "select": return [spec.key, (side === "min" ? spec.options[0] : spec.options[spec.options.length - 1])?.value ?? spec.default];
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

function meanAbsDiff(left: StudioFilterGalleryImage, right: StudioFilterGalleryImage): number {
  let total = 0;
  for (let index = 0; index < left.data.length; index += 1) total += Math.abs((left.data[index] ?? 0) - (right.data[index] ?? 0));
  return total / Math.max(1, left.data.length);
}

const pixel = (image: StudioFilterGalleryImage, x: number, y: number): number[] =>
  Array.from(image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4));

const alphaOf = (image: StudioFilterGalleryImage): number[] => Array.from(image.data.filter((_value, index) => index % 4 === 3));

/** 불투명 픽셀의 서로 다른 RGB 색 집합. */
function opaqueColors(image: StudioFilterGalleryImage): Set<string> {
  const colors = new Set<string>();
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3] === 255) colors.add(`${image.data[offset]},${image.data[offset + 1]},${image.data[offset + 2]}`);
  }
  return colors;
}

const byId = (id: string): StudioFilterGalleryEffectDef => {
  const effect = EFFECTS.find((candidate) => candidate.id === id);
  if (!effect) throw new Error(`missing ${id}`);
  return effect;
};

describe("필터 갤러리 · 픽셀화 계열 계약", () => {
  it("정해진 id·분류·참조를 갖고 매개변수 명세가 올바르다", () => {
    expect(EFFECTS.map((effect) => effect.id)).toEqual(Object.keys(EXPECTED_REFERENCES));
    expect(new Set(EFFECTS.map((effect) => effect.id)).size).toBe(EFFECTS.length);
    for (const effect of EFFECTS) {
      expect(effect.id.split(".")[0]).toBe(effect.category);
      expect(isStudioFilterGalleryEffectId(effect.id)).toBe(true);
      expect(effect.references).toEqual(EXPECTED_REFERENCES[effect.id]);
      expect(effect.label).toMatch(/[가-힣]/u);
      expect(effect.description).toMatch(/[가-힣]/u);
      expect(Number.isFinite(effect.cost) && effect.cost > 0).toBe(true);
      expect(new Set(effect.params.map((spec) => spec.key)).size).toBe(effect.params.length);
      for (const spec of effect.params) {
        expect(spec.key).toMatch(/^[a-z][a-zA-Z0-9]*$/u);
        expect(spec.label).toMatch(/[가-힣]/u);
        if (spec.control === "slider") {
          expect(spec.min).toBeLessThan(spec.max);
          expect(spec.step).toBeGreaterThan(0);
          expect(spec.default).toBeGreaterThanOrEqual(spec.min);
          expect(spec.default).toBeLessThanOrEqual(spec.max);
          // 등록부가 값을 step 격자에 맞추므로 기본값도 격자 위에 있어야 저장 뒤 바뀌지 않는다.
          const steps = (spec.default - spec.min) / spec.step;
          expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9);
        }
        if (spec.control === "select") {
          const values = spec.options.map((option) => option.value);
          expect(new Set(values).size).toBe(values.length);
          expect(values).toContain(spec.default);
        }
      }
    }
  });

  it.each(CASES)("%s 는 같은 입력·시드에서 같은 바이트를 낸다", (_id, effect) => {
    expect(run(effect).data).toEqual(run(effect).data);
  });

  it.each(CASES)("%s 기본값은 눈에 띄게 바꾼다", (_id, effect) => {
    expect(meanAbsDiff(run(effect), fixture())).toBeGreaterThan(1);
  });

  it.each(CASES)("%s 는 1×1·2×3·3×2 이미지에서도 던지지 않는다", (_id, effect) => {
    expect(run(effect, defaults(effect), fixture(1, 1)).data).toHaveLength(4);
    expect(run(effect, defaults(effect), fixture(2, 3)).data).toHaveLength(24);
    expect(run(effect, defaults(effect), fixture(3, 2)).data).toHaveLength(24);
    expect(() => run(effect, extreme(effect, "max"), fixture(1, 1))).not.toThrow();
    expect(() => run(effect, extreme(effect, "min"), fixture(3, 2))).not.toThrow();
    expect(() => run(effect, extreme(effect, "max"), fixture(2, 3))).not.toThrow();
  });

  it.each(CASES)("%s 는 매개변수 양 끝과 모든 선택지에서 던지지 않는다", (_id, effect) => {
    expect(() => run(effect, extreme(effect, "min"))).not.toThrow();
    expect(() => run(effect, extreme(effect, "max"))).not.toThrow();
    for (const spec of effect.params) {
      if (spec.control !== "select") continue;
      for (const option of spec.options) {
        const first = run(effect, { [spec.key]: option.value });
        expect(run(effect, { [spec.key]: option.value }).data).toEqual(first.data);
      }
    }
  });

  it.each(CASES)("%s 는 명세와 같은 최소·최대·기본값으로 매개변수를 읽는다", (_id, effect) => {
    const baseline = run(effect, {}).data;
    expect(run(effect, defaults(effect)).data).toEqual(baseline);
    for (const spec of effect.params) {
      if (spec.control === "slider") {
        expect(run(effect, { [spec.key]: spec.max + 1000 }).data).toEqual(run(effect, { [spec.key]: spec.max }).data);
        expect(run(effect, { [spec.key]: spec.min - 1000 }).data).toEqual(run(effect, { [spec.key]: spec.min }).data);
        expect(run(effect, { [spec.key]: Number.NaN }).data).toEqual(baseline);
      } else {
        expect(run(effect, { [spec.key]: spec.control === "toggle" ? "true" : "목록에 없는 값" }).data).toEqual(baseline);
      }
    }
  });

  it.each(ALPHA_KEEPING)("%s 는 모든 선택지에서 알파를 바꾸지 않는다", (id) => {
    const effect = byId(id);
    const input = fixture();
    const variants: StudioFilterGalleryParams[] = [defaults(effect), extreme(effect, "min"), extreme(effect, "max")];
    for (const spec of effect.params) {
      if (spec.control === "select") for (const option of spec.options) variants.push({ [spec.key]: option.value });
    }
    for (const params of variants) expect(alphaOf(run(effect, params, input))).toEqual(alphaOf(input));
  });

  it("단면화는 단색을 그대로 두고 계단 경계를 흐리지 않는다", () => {
    const flat = paint(16, 12, () => [90, 140, 200, 255]);
    expect(run(byId("pixelate.facet"), { strength: 4 }, flat).data).toEqual(flat.data);
    const step = paint(20, 12, (x) => (x < 10 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    const output = run(byId("pixelate.facet"), { strength: 3 }, step);
    expect(output.data).toEqual(step.data);
    expect(meanAbsDiff(run(byId("pixelate.facet"), { strength: 8 }, fixture(32, 24, true)), fixture(32, 24, true))).toBeGreaterThan(10);
  });

  it("조각은 고른 각도로 민 사본을 평균한다", () => {
    const ramp = paint(24, 8, (x) => [x * 10, 255 - x * 10, 60, 255]);
    const output = run(byId("pixelate.fragment"), { count: 2, distance: 3, rotation: 0 }, ramp);
    for (let x = 3; x < 21; x += 1) {
      const left = pixel(ramp, x - 3, 4), right = pixel(ramp, x + 3, 4), mixed = pixel(output, x, 4);
      expect(mixed[0]).toBe(Math.round(((left[0] ?? 0) + (right[0] ?? 0)) / 2));
      expect(mixed[1]).toBe(Math.round(((left[1] ?? 0) + (right[1] ?? 0)) / 2));
    }
    const half = paint(24, 8, (x) => (x < 12 ? [200, 10, 10, 255] : [0, 0, 0, 0]));
    const spread = run(byId("pixelate.fragment"), { count: 2, distance: 4, rotation: 0 }, half);
    // 왼쪽 사본만 불투명한 경계 근처는 알파가 절반이고, 색은 투명 사본의 검정이 섞이지 않는다.
    expect(pixel(spread, 12, 3)).toEqual([200, 10, 10, 128]);
  });

  it("메조틴트는 채널을 0·255 로만 남기고 평균 밝기를 대략 지킨다", () => {
    const smooth = paint(64, 48, (x, y) => [x * 4, y * 5, 128, 255]);
    const effect = byId("pixelate.mezzotint");
    const type = effect.params[0];
    if (type?.control !== "select") throw new Error("type 선택지가 없다");
    for (const option of type.options) {
      const output = run(effect, { type: option.value }, smooth);
      const means = [0, 0, 0], expected = [0, 0, 0];
      for (let offset = 0; offset < output.data.length; offset += 4) {
        for (let channel = 0; channel < 3; channel += 1) {
          const value = output.data[offset + channel] ?? 0;
          expect(value === 0 || value === 255).toBe(true);
          means[channel] = (means[channel] ?? 0) + value;
          expected[channel] = (expected[channel] ?? 0) + (smooth.data[offset + channel] ?? 0);
        }
      }
      for (let channel = 0; channel < 3; channel += 1) {
        expect(Math.abs((means[channel] ?? 0) - (expected[channel] ?? 0)) / (64 * 48)).toBeLessThan(26);
      }
    }
  });

  it("비디오 열화 무늬는 회전하면 축이 바뀌고 더하기는 밝게 한다", () => {
    const grey = paint(12, 9, () => [120, 120, 120, 255]);
    const effect = byId("pixelate.video-degradation");
    const striped = run(effect, { pattern: "striped" }, grey);
    const rotated = run(effect, { pattern: "striped", rotated: true }, grey);
    for (let y = 0; y < 9; y += 1) {
      for (let x = 0; x < 12; x += 1) {
        expect(pixel(striped, x, y)).toEqual(pixel(striped, x % 3, 0));
        expect(pixel(rotated, x, y)).toEqual(pixel(rotated, 0, y % 3));
      }
    }
    const meanOf = (image: StudioFilterGalleryImage): number => image.data.reduce((sum, value, index) => (index % 4 === 3 ? sum : sum + value), 0);
    expect(meanOf(run(effect, { pattern: "staggered", additive: true }, grey))).toBeGreaterThan(meanOf(grey));
    expect(meanOf(run(effect, { pattern: "staggered" }, grey))).toBeLessThan(meanOf(grey));
  });

  it("픽셀 아트는 칸마다 한 색이고 팔레트 색 수를 넘지 않는다", () => {
    const opaque = fixture(32, 24, true);
    const effect = byId("pixelate.pixel-art");
    const variants: StudioFilterGalleryParams[] = [{}, { colors: 4, dithering: "floyd" }, { colors: 6, dithering: "bayer", pixelSize: 4 }, { colors: 2, outline: false }];
    for (const params of variants) {
      const size = typeof params.pixelSize === "number" ? params.pixelSize : 6;
      const colors = typeof params.colors === "number" ? params.colors : 16;
      const output = run(effect, params, opaque);
      expect(opaqueColors(output).size).toBeLessThanOrEqual(colors);
      for (let y = 0; y < output.height; y += 1) {
        for (let x = 0; x < output.width; x += 1) {
          expect(pixel(output, x, y)).toEqual(pixel(output, x - (x % size), y - (y % size)));
        }
      }
    }
    expect(alphaOf(run(effect, {}, fixture())).every((alpha) => alpha === 0 || alpha === 255)).toBe(true);
  });

  it("픽셀 아트 외곽선은 실루엣 테두리 칸을 팔레트의 가장 어두운 색으로 칠한다", () => {
    const disc = paint(36, 36, (x, y) => (Math.hypot(x - 17.5, y - 17.5) < 14 ? [40 + x * 5, 200 - y * 3, 90 + ((x * y) % 50), 255] : [255, 255, 255, 0]));
    const effect = byId("pixelate.pixel-art");
    const outlined = run(effect, { pixelSize: 4, colors: 8, outline: true }, disc);
    const plain = run(effect, { pixelSize: 4, colors: 8, outline: false }, disc);
    const luminance = (rgb: readonly number[]): number => 0.299 * (rgb[0] ?? 0) + 0.587 * (rgb[1] ?? 0) + 0.114 * (rgb[2] ?? 0);
    // 쓰인 색은 모두 팔레트 색이고 외곽선은 팔레트의 가장 어두운 색이므로, 결과에서 가장 어두운 색이 곧 외곽선 색이다.
    const darkest = [...opaqueColors(outlined)].map((key) => key.split(",").map(Number)).sort((a, b) => luminance(a) - luminance(b))[0];
    const transparentCell = (cx: number, cy: number): boolean =>
      cx >= 0 && cy >= 0 && cx < 9 && cy < 9 && pixel(outlined, cx * 4, cy * 4)[3] === 0;
    let borderCells = 0;
    for (let cy = 0; cy < 9; cy += 1) {
      for (let cx = 0; cx < 9; cx += 1) {
        const here = pixel(outlined, cx * 4, cy * 4);
        if (here[3] !== 255) continue;
        if (transparentCell(cx - 1, cy) || transparentCell(cx + 1, cy) || transparentCell(cx, cy - 1) || transparentCell(cx, cy + 1)) {
          borderCells += 1;
          expect(here.slice(0, 3)).toEqual(darkest);
        }
      }
    }
    expect(borderCells).toBeGreaterThan(8);
    expect(alphaOf(outlined)).toEqual(alphaOf(plain));
    expect(meanAbsDiff(outlined, plain)).toBeGreaterThan(1);
  });
});
