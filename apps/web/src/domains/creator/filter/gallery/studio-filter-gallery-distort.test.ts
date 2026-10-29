import { describe, expect, it } from "vitest";

import { STUDIO_FILTER_GALLERY_DISTORT_EFFECTS, sampleWithEdges } from "./studio-filter-gallery-distort";

import { isStudioFilterGalleryEffectId } from "./studio-filter-gallery-types";

import type {
  StudioFilterGalleryEffectDef,
  StudioFilterGalleryImage,
  StudioFilterGalleryParams,
} from "./studio-filter-gallery-types";

const EFFECTS = STUDIO_FILTER_GALLERY_DISTORT_EFFECTS;
const CASES = EFFECTS.map((effect) => [effect.id, effect] as const);

const EXPECTED_REFERENCES: Readonly<Record<string, readonly string[]>> = {
  "distort.glass": ["Photoshop · 유리", "Paint.NET · 서리 낀 유리"],
  "distort.ocean-ripple": ["Photoshop · 바다 물결"],
  "distort.shear": ["Photoshop · 기울이기(Shear)"],
  "distort.dents": ["Paint.NET · 움푹 패임"],
  "distort.tile-reflection": ["Paint.NET · 타일 반사"],
  "distort.polar-inversion": ["Paint.NET · 극 반전"],
  "distort.raindrops": ["Krita · 빗방울"],
  "distort.kaleidoscope": ["GIMP · 만화경"],
  "distort.mirror": ["사진·그림 앱 공통 · 미러 효과"],
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

/** 부드러운 기울기 그림(불투명). */
function gradient(width = 32, height = 24): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) data.set([x * 8, y * 10, 128, 255], (y * width + x) * 4);
  }
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

const byId = (id: string): StudioFilterGalleryEffectDef => {
  const effect = EFFECTS.find((candidate) => candidate.id === id);
  if (!effect) throw new Error(`missing ${id}`);
  return effect;
};

describe("필터 갤러리 · 왜곡 계열 계약", () => {
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

  it("세기가 0 이면 그림을 그대로 둔다", () => {
    const input = fixture();
    expect(run(byId("distort.glass"), { distortion: 0 }, input).data).toEqual(input.data);
    expect(run(byId("distort.ocean-ripple"), { rippleMagnitude: 0 }, input).data).toEqual(input.data);
    expect(run(byId("distort.dents"), { refraction: 0 }, input).data).toEqual(input.data);
    expect(run(byId("distort.tile-reflection"), { curvature: 0 }, input).data).toEqual(input.data);
    expect(run(byId("distort.shear"), { amount: 0 }, input).data).toEqual(input.data);
  });

  it("미러는 고른 축으로 정확히 대칭이고 원본 절반을 그대로 둔다", () => {
    const input = fixture(31, 24);
    const horizontal = run(byId("distort.mirror"), { axis: "left-to-right" }, input);
    const quad = run(byId("distort.mirror"), { axis: "quad" }, input);
    const vertical = run(byId("distort.mirror"), { axis: "bottom-to-top" }, input);
    for (let y = 0; y < input.height; y += 1) {
      for (let x = 0; x < input.width; x += 1) {
        expect(pixel(horizontal, x, y)).toEqual(pixel(horizontal, input.width - 1 - x, y));
        expect(pixel(quad, x, y)).toEqual(pixel(quad, input.width - 1 - x, input.height - 1 - y));
        expect(pixel(vertical, x, y)).toEqual(pixel(vertical, x, input.height - 1 - y));
        if (x <= 15) expect(pixel(horizontal, x, y)).toEqual(pixel(input, x, y));
        if (y >= 12) expect(pixel(vertical, x, y)).toEqual(pixel(input, x, y));
      }
    }
  });

  it("만화경은 조각 수만큼 회전 대칭이다", () => {
    const square = fixture(32, 32);
    const four = run(byId("distort.kaleidoscope"), { segments: 4, angle: 30 }, square);
    const two = run(byId("distort.kaleidoscope"), { segments: 2 }, fixture());
    let worst = 0;
    for (let y = 0; y < 32; y += 1) {
      for (let x = 0; x < 32; x += 1) {
        const here = pixel(four, x, y), turned = pixel(four, 31 - y, x);
        for (let channel = 0; channel < 4; channel += 1) worst = Math.max(worst, Math.abs((here[channel] ?? 0) - (turned[channel] ?? 0)));
      }
    }
    for (let y = 0; y < 24; y += 1) {
      for (let x = 0; x < 32; x += 1) {
        const here = pixel(two, x, y), turned = pixel(two, 31 - x, 23 - y);
        for (let channel = 0; channel < 4; channel += 1) worst = Math.max(worst, Math.abs((here[channel] ?? 0) - (turned[channel] ?? 0)));
      }
    }
    expect(worst).toBeLessThanOrEqual(1);
    expect(meanAbsDiff(four, square)).toBeGreaterThan(5);
  });

  it("기울이기의 가장자리 방식이 감싸기·반복·투명을 지킨다", () => {
    const opaque = fixture(32, 24, true);
    const alphaOf = (image: StudioFilterGalleryImage): number[] => Array.from(image.data.filter((_value, index) => index % 4 === 3));
    for (const edge of ["wrap", "repeat-edge"]) {
      for (const axis of ["horizontal", "vertical"]) {
        expect(alphaOf(run(byId("distort.shear"), { amount: 100, edge, axis }, opaque)).every((alpha) => alpha === 255)).toBe(true);
      }
    }
    const transparent = alphaOf(run(byId("distort.shear"), { amount: 100, edge: "transparent" }, opaque));
    expect(transparent.filter((alpha) => alpha === 0).length).toBeGreaterThan(20);
  });

  it("극 반전은 내접 타원 위를 거의 제자리에 두고 안쪽은 크게 바꾼다", () => {
    const input = gradient();
    const output = run(byId("distort.polar-inversion"), { amount: 1, edge: "reflect" }, input);
    let nearSum = 0, nearCount = 0, innerSum = 0, innerCount = 0;
    for (let y = 0; y < input.height; y += 1) {
      for (let x = 0; x < input.width; x += 1) {
        const radius = Math.hypot((x + 0.5 - 16) / 16, (y + 0.5 - 12) / 12);
        const diff = Math.abs((pixel(output, x, y)[0] ?? 0) - (pixel(input, x, y)[0] ?? 0)) + Math.abs((pixel(output, x, y)[1] ?? 0) - (pixel(input, x, y)[1] ?? 0));
        if (Math.abs(radius - 1) < 0.04) { nearSum += diff; nearCount += 1; }
        if (radius > 0.35 && radius < 0.55) { innerSum += diff; innerCount += 1; }
      }
    }
    expect(nearCount).toBeGreaterThan(0);
    expect(nearSum / nearCount).toBeLessThan(16);
    expect(innerSum / innerCount).toBeGreaterThan(60);
  });

  it("빗방울 하나는 그 둘레만 바꾼다", () => {
    const input = fixture();
    const output = run(byId("distort.raindrops"), { number: 1, dropSize: 8 }, input);
    let unchanged = 0;
    for (let index = 0; index < input.width * input.height; index += 1) {
      if (pixel(output, index % input.width, Math.floor(index / input.width)).join() === pixel(input, index % input.width, Math.floor(index / input.width)).join()) unchanged += 1;
    }
    expect(unchanged).toBeGreaterThan(input.width * input.height * 0.8);
    expect(unchanged).toBeLessThan(input.width * input.height);
  });

  it("재표본기는 가장자리 방식별로 탭을 접고 투명 이웃의 색을 섞지 않는다", () => {
    const row = new Uint8ClampedArray([10, 0, 0, 255, 20, 0, 0, 255, 30, 0, 0, 255]);
    const out = new Float32Array(4);
    const read = (x: number, edge: "clamp" | "reflect" | "wrap" | "transparent"): number | null =>
      sampleWithEdges(row, 3, 1, x, 0.5, edge, edge, out) ? Math.round(out[0] ?? -1) : null;
    expect([read(-0.5, "clamp"), read(-0.5, "wrap"), read(-0.5, "reflect"), read(-0.5, "transparent")]).toEqual([10, 30, 10, null]);
    expect([read(3.5, "clamp"), read(3.5, "wrap"), read(3.5, "reflect"), read(4.5, "reflect")]).toEqual([30, 10, 30, 20]);
    expect([read(1.5, "transparent"), read(Number.POSITIVE_INFINITY, "clamp")]).toEqual([20, 30]);
    for (const edge of ["clamp", "reflect", "wrap"] as const) expect(Number.isFinite(read(Number.NaN, edge) ?? Number.NaN)).toBe(true);
    const mixed = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 0]);
    expect(sampleWithEdges(mixed, 2, 1, 1, 0.5, "clamp", "clamp", out)).toBe(true);
    expect(Array.from(out).map(Math.round)).toEqual([255, 0, 0, 128]);
  });
});
