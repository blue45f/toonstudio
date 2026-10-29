import { describe, expect, it } from "vitest";

import { STUDIO_FILTER_GALLERY_BRUSH_STROKES_EFFECTS } from "./studio-filter-gallery-brush-strokes";
import { boxBlurPlane, gaussianPlane, luma, sobel } from "./studio-filter-gallery-kernel-utils";
import {
  boxAlongLines,
  boxBlur,
  gaussianBlur,
  gradientMagnitude,
  kuwahara,
  readPaintSource,
  streakNoise,
} from "./studio-filter-gallery-paint-helpers";
import { isStudioFilterGalleryEffectId } from "./studio-filter-gallery-types";

import type { StrokeDirection } from "./studio-filter-gallery-paint-helpers";
import type {
  StudioFilterGalleryEffectDef,
  StudioFilterGalleryImage,
  StudioFilterGalleryParamValue,
  StudioFilterGalleryParams,
} from "./studio-filter-gallery-types";

const EXPECTED_REFERENCES: Readonly<Record<string, readonly string[]>> = {
  "brush-strokes.accented-edges": ["Photoshop · 가장자리 강조"],
  "brush-strokes.angled-strokes": ["Photoshop · 각진 획"],
  "brush-strokes.dark-strokes": ["Photoshop · 어두운 획"],
  "brush-strokes.ink-outlines": ["Photoshop · 잉크 윤곽선"],
  "brush-strokes.spatter": ["Photoshop · 뿌리기"],
  "brush-strokes.sprayed-strokes": ["Photoshop · 스프레이 획"],
  "brush-strokes.sumi-e": ["Photoshop · 수묵화(Sumi-e)"],
};

const HANGUL = /[가-힣]/u;
const EFFECTS = STUDIO_FILTER_GALLERY_BRUSH_STROKES_EFFECTS;
const CASES = EFFECTS.map((effect) => [effect.id, effect] as const);

function image(width: number, height: number, pixel: (x: number, y: number) => readonly number[]): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) data.set(pixel(x, y), (y * width + x) * 4);
  }
  return { width, height, data };
}

/** 기울기·체크 무늬·밝은 원판·픽셀 잡음과 여러 단계 알파(완전 투명 포함)를 담은 질감 그림. */
function texturedFixture(width = 32, height = 24): StudioFilterGalleryImage {
  return image(width, height, (x, y) => {
    const checker = ((x >> 2) + (y >> 2)) % 2 === 0 ? 45 : -45;
    const disc = (x - 16) ** 2 + (y - 12) ** 2 < 36 ? 110 : 0;
    const grain = ((x * 7919 + y * 104729) % 37) - 18;
    const alpha = x === 0 || (x + y) % 11 === 0 ? 0 : 255 - ((x * 13 + y * 29) % 5) * 40;
    return [20 + x * 6 + checker + disc + grain, 30 + y * 8 - checker + disc + grain, 200 - x * 4 - y * 3 + checker + grain, alpha];
  });
}

function opaqueFixture(): StudioFilterGalleryImage {
  const fixture = texturedFixture();
  for (let offset = 3; offset < fixture.data.length; offset += 4) fixture.data[offset] = 255;
  return fixture;
}

function run(
  effect: StudioFilterGalleryEffectDef,
  source: StudioFilterGalleryImage,
  params: StudioFilterGalleryParams = {},
  seed = 1234,
): StudioFilterGalleryImage {
  const out = { width: source.width, height: source.height, data: source.data.slice() };
  effect.apply(out, params, { seed, scale: 1 });
  return out;
}

function meanAbsRgbDiff(left: StudioFilterGalleryImage, right: StudioFilterGalleryImage): number {
  let total = 0;
  for (let offset = 0; offset < left.data.length; offset += 4) {
    for (let channel = 0; channel < 3; channel += 1) total += Math.abs(left.data[offset + channel] - right.data[offset + channel]);
  }
  return total / ((left.data.length / 4) * 3);
}

function lumaValues(target: StudioFilterGalleryImage): number[] {
  const values: number[] = [];
  for (let offset = 0; offset < target.data.length; offset += 4) {
    values.push(luma(target.data[offset], target.data[offset + 1], target.data[offset + 2]));
  }
  return values;
}

const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
const alphaOf = (target: StudioFilterGalleryImage): number[] => Array.from(target.data.filter((_, offset) => offset % 4 === 3));

function visibleRgb(target: StudioFilterGalleryImage): number[] {
  const values: number[] = [];
  for (let offset = 0; offset < target.data.length; offset += 4) {
    if (target.data[offset + 3] === 0) continue;
    values.push(target.data[offset], target.data[offset + 1], target.data[offset + 2]);
  }
  return values;
}

function extremeParams(effect: StudioFilterGalleryEffectDef, end: "min" | "max"): StudioFilterGalleryParams {
  const params: Record<string, StudioFilterGalleryParamValue> = {};
  for (const spec of effect.params) {
    if (spec.control === "slider") params[spec.key] = end === "min" ? spec.min : spec.max;
    else if (spec.control === "select") params[spec.key] = (end === "min" ? spec.options[0] : spec.options.at(-1))?.value ?? spec.default;
    else if (spec.control === "color") params[spec.key] = end === "min" ? "#000000" : "#ffffff";
    else params[spec.key] = end === "max";
  }
  return params;
}

function find(id: string): StudioFilterGalleryEffectDef {
  const effect = EFFECTS.find((candidate) => candidate.id === id);
  if (!effect) throw new Error(`효과 없음: ${id}`);
  return effect;
}

describe("필터 갤러리 · 붓 터치 정의", () => {
  it("요청된 일곱 효과를 정해진 id·분류로 내보낸다", () => {
    expect(EFFECTS.map((effect) => effect.id)).toEqual(Object.keys(EXPECTED_REFERENCES));
    expect(new Set(EFFECTS.map((effect) => effect.id)).size).toBe(EFFECTS.length);
    for (const effect of EFFECTS) {
      expect(isStudioFilterGalleryEffectId(effect.id)).toBe(true);
      expect(effect.id.split(".")[0]).toBe(effect.category);
      expect(effect.references).toEqual(EXPECTED_REFERENCES[effect.id]);
      expect(effect.label).toMatch(HANGUL);
      expect(effect.description).toMatch(HANGUL);
      expect(effect.description.endsWith("니다.")).toBe(true);
      expect(Number.isFinite(effect.cost) && effect.cost > 0).toBe(true);
    }
  });

  it.each(CASES)("%s 매개변수 스펙은 키가 겹치지 않고 기본값이 범위·선택지 안에 있다", (_id, effect) => {
    expect(new Set(effect.params.map((spec) => spec.key)).size).toBe(effect.params.length);
    for (const spec of effect.params) {
      expect(spec.key).toMatch(/^[a-z][a-zA-Z0-9]*$/u);
      expect(spec.label).toMatch(HANGUL);
      if (spec.control === "slider") {
        expect(spec.min).toBeLessThan(spec.max);
        expect(spec.step).toBeGreaterThan(0);
        expect(spec.default).toBeGreaterThanOrEqual(spec.min);
        expect(spec.default).toBeLessThanOrEqual(spec.max);
        expect(Number.isInteger((spec.default - spec.min) / spec.step)).toBe(true);
      } else if (spec.control === "select") {
        const values = spec.options.map((option) => option.value);
        expect(new Set(values).size).toBe(values.length);
        expect(values).toContain(spec.default);
        for (const option of spec.options) expect(option.label).toMatch(HANGUL);
      } else if (spec.control === "color") {
        expect(spec.default).toMatch(/^#[0-9a-f]{6}$/u);
      }
    }
  });
});

describe("필터 갤러리 · 붓 터치 커널 계약", () => {
  it.each(CASES)("%s 는 같은 입력·매개변수·시드에서 같은 바이트를 낸다", (_id, effect) => {
    const fixture = texturedFixture();
    expect(Array.from(run(effect, fixture).data)).toEqual(Array.from(run(effect, fixture).data));
  });

  it.each(CASES)("%s 기본값은 질감 그림을 눈에 띄게 바꾸고 알파는 그대로 둔다", (_id, effect) => {
    const fixture = texturedFixture();
    const out = run(effect, fixture);
    expect(meanAbsRgbDiff(out, fixture)).toBeGreaterThan(1);
    expect(alphaOf(out)).toEqual(alphaOf(fixture));
  });

  it.each(CASES)("%s 는 1×1·3×2·2×3 그림에서 기본·최소·최대값 모두 예외 없이 알파를 지킨다", (_id, effect) => {
    for (const [width, height] of [[1, 1], [3, 2], [2, 3]] as const) {
      const tiny = image(width, height, (x, y) => [40 + x * 90, 200 - y * 70, 120, x === 1 && y === 0 ? 0 : 255 - x * 60]);
      for (const params of [{}, extremeParams(effect, "min"), extremeParams(effect, "max")]) {
        expect(alphaOf(run(effect, tiny, params))).toEqual(alphaOf(tiny));
      }
    }
  });

  it.each(CASES)("%s 는 모든 매개변수 최소·최대값과 모든 선택지에서 예외 없이 알파를 지킨다", (_id, effect) => {
    const fixture = texturedFixture();
    const variants: StudioFilterGalleryParams[] = [extremeParams(effect, "min"), extremeParams(effect, "max")];
    for (const spec of effect.params) {
      if (spec.control === "select") for (const option of spec.options) variants.push({ [spec.key]: option.value });
    }
    for (const params of variants) expect(alphaOf(run(effect, fixture, params))).toEqual(alphaOf(fixture));
  });

  it.each(CASES)("%s 슬라이더는 스펙과 같은 기본값·경계로 읽힌다", (_id, effect) => {
    const fixture = texturedFixture(12, 10);
    const base = Array.from(run(effect, fixture).data);
    for (const spec of effect.params) {
      if (spec.control !== "slider") continue;
      expect(Array.from(run(effect, fixture, { [spec.key]: Number.NaN }).data)).toEqual(base);
      expect(Array.from(run(effect, fixture, { [spec.key]: "크게" }).data)).toEqual(base);
      expect(Array.from(run(effect, fixture, { [spec.key]: spec.max + 999 }).data))
        .toEqual(Array.from(run(effect, fixture, { [spec.key]: spec.max }).data));
      expect(Array.from(run(effect, fixture, { [spec.key]: spec.min - 999 }).data))
        .toEqual(Array.from(run(effect, fixture, { [spec.key]: spec.min }).data));
    }
  });

  it.each(CASES)("%s 는 완전 투명 픽셀의 RGB 를 보이는 픽셀로 번지게 하지 않는다", (_id, effect) => {
    const paint = (garbage: readonly number[]): StudioFilterGalleryImage => {
      const fixture = texturedFixture();
      for (let y = 0; y < 8; y += 1) for (let x = 24; x < 32; x += 1) fixture.data[(y * 32 + x) * 4 + 3] = 0;
      for (let offset = 0; offset < fixture.data.length; offset += 4) {
        if (fixture.data[offset + 3] === 0) fixture.data.set(garbage, offset);
      }
      return fixture;
    };
    for (const params of [{}, extremeParams(effect, "max")]) {
      expect(visibleRgb(run(effect, paint([0, 255, 0]), params))).toEqual(visibleRgb(run(effect, paint([255, 0, 255]), params)));
    }
  });
});

describe("필터 갤러리 · 붓 터치 의미", () => {
  it("가장자리 강조는 밝기 25 초과면 가장자리를 밝히고, 낮으면 어둡게 칠한다", () => {
    const accented = find("brush-strokes.accented-edges");
    const step = image(32, 24, (x) => (x < 16 ? [40, 40, 40, 255] : [210, 210, 210, 255]));
    const band = (target: StudioFilterGalleryImage): number => mean(lumaValues(target).filter((_, index) => Math.abs((index % 32) - 15.5) < 2));
    const flat = (target: StudioFilterGalleryImage): number => mean(lumaValues(target).filter((_, index) => index % 32 < 8));
    expect(band(run(accented, step, { edgeBrightness: 50 }))).toBeGreaterThan(band(step) + 20);
    expect(band(run(accented, step, { edgeBrightness: 0 }))).toBeLessThan(band(step) - 20);
    // 가장자리에서 먼 평평한 면은 거의 그대로다.
    expect(Math.abs(flat(run(accented, step, { edgeBrightness: 50 })) - flat(step))).toBeLessThan(2);
  });

  it("각진 획은 방향 균형에 따라 획 방향이 바뀐다", () => {
    const angled = find("brush-strokes.angled-strokes");
    const fixture = opaqueFixture();
    expect(meanAbsRgbDiff(run(angled, fixture, { directionBalance: 0 }), run(angled, fixture, { directionBalance: 100 }))).toBeGreaterThan(1);
  });

  it("어두운 획·잉크 윤곽선은 어두운 강도가 클수록 어둡다", () => {
    const fixture = opaqueFixture();
    const dark = find("brush-strokes.dark-strokes"), ink = find("brush-strokes.ink-outlines");
    expect(mean(lumaValues(run(dark, fixture, { blackIntensity: 10 })))).toBeLessThan(mean(lumaValues(run(dark, fixture, { blackIntensity: 0 }))) - 5);
    expect(mean(lumaValues(run(ink, fixture, { darkIntensity: 50 })))).toBeLessThan(mean(lumaValues(run(ink, fixture, { darkIntensity: 0 }))) - 2);
    expect(mean(lumaValues(run(ink, fixture, { lightIntensity: 50 })))).toBeGreaterThan(mean(lumaValues(run(ink, fixture, { lightIntensity: 0 }))));
  });

  it("뿌리기 결과의 모든 픽셀 색은 반경 안 원본 픽셀의 색이다", () => {
    const spatter = find("brush-strokes.spatter");
    const fixture = opaqueFixture();
    const radius = 3;
    const out = run(spatter, fixture, { sprayRadius: radius, smoothness: 1 });
    let moved = 0;
    for (let y = 0; y < 24; y += 1) {
      for (let x = 0; x < 32; x += 1) {
        const at = (y * 32 + x) * 4;
        let found = false;
        for (let sy = Math.max(0, y - radius); sy <= Math.min(23, y + radius) && !found; sy += 1) {
          for (let sx = Math.max(0, x - radius); sx <= Math.min(31, x + radius) && !found; sx += 1) {
            const from = (sy * 32 + sx) * 4;
            found = [0, 1, 2].every((channel) => fixture.data[from + channel] === out.data[at + channel]);
          }
        }
        expect(found).toBe(true);
        if ([0, 1, 2].some((channel) => fixture.data[at + channel] !== out.data[at + channel])) moved += 1;
      }
    }
    expect(moved).toBeGreaterThan(32 * 24 * 0.3);
  });

  it("뿌리기는 반경 0 이면 그대로 두고, 시드가 바뀌면 무늬가 바뀐다", () => {
    const spatter = find("brush-strokes.spatter");
    const fixture = texturedFixture();
    expect(Array.from(run(spatter, fixture, { sprayRadius: 0 }).data)).toEqual(Array.from(fixture.data));
    expect(meanAbsRgbDiff(run(spatter, fixture, {}, 1), run(spatter, fixture, {}, 2))).toBeGreaterThan(1);
  });

  it("스프레이 획은 방향마다 결과가 다르다", () => {
    const sprayed = find("brush-strokes.sprayed-strokes");
    const fixture = opaqueFixture();
    const outputs = ["right-diagonal", "horizontal", "left-diagonal", "vertical"].map((direction) => run(sprayed, fixture, { direction }));
    for (let left = 0; left < outputs.length; left += 1) {
      for (let right = left + 1; right < outputs.length; right += 1) expect(meanAbsRgbDiff(outputs[left], outputs[right])).toBeGreaterThan(1);
    }
  });

  it("수묵화는 평균 명도를 낮추고 획 압력이 클수록 더 어둡다", () => {
    const sumi = find("brush-strokes.sumi-e");
    const fixture = opaqueFixture();
    const before = mean(lumaValues(fixture));
    expect(mean(lumaValues(run(sumi, fixture)))).toBeLessThan(before - 10);
    expect(mean(lumaValues(run(sumi, fixture, { strokePressure: 15 })))).toBeLessThan(mean(lumaValues(run(sumi, fixture, { strokePressure: 0 }))));
  });
});

describe("필터 갤러리 · 회화 공용 도구", () => {
  const SIZES = [[1, 1], [3, 2], [2, 3], [7, 1], [1, 7], [17, 5], [5, 17]] as const;
  const STEPS: Readonly<Record<StrokeDirection, readonly [number, number]>> = {
    horizontal: [1, 0], vertical: [0, 1], "diagonal-down": [1, 1], "diagonal-up": [1, -1],
  };
  const plane = (width: number, height: number): Float32Array =>
    Float32Array.from({ length: width * height }, (_, index) => (index * 2654435761) % 251);

  /** 줄을 모아 창을 직접 더하는 느린 기준 구현(줄 끝 복제). */
  function referenceLineBox(source: Float32Array, width: number, height: number, direction: StrokeDirection, radius: number): Float32Array {
    const out = source.slice();
    const [dx, dy] = STEPS[direction];
    const visit = (startX: number, startY: number): void => {
      const line: number[] = [];
      for (let x = startX, y = startY; x >= 0 && x < width && y >= 0 && y < height; x += dx, y += dy) line.push(y * width + x);
      line.forEach((at, k) => {
        let sum = 0;
        for (let j = k - radius; j <= k + radius; j += 1) sum += source[line[Math.min(line.length - 1, Math.max(0, j))]];
        out[at] = sum / (2 * radius + 1);
      });
    };
    if (dx === 0) for (let x = 0; x < width; x += 1) visit(x, 0);
    else {
      for (let y = 0; y < height; y += 1) visit(0, y);
      for (let x = 1; x < width; x += 1) if (dy !== 0) visit(x, dy > 0 ? 0 : height - 1);
    }
    return out;
  }

  it("방향 상자 창은 네 방향·여러 크기·큰 반지름에서 느린 기준 구현과 같다", () => {
    for (const [width, height] of SIZES) {
      for (const radius of [1, 2, 9, 40]) {
        for (const direction of Object.keys(STEPS) as StrokeDirection[]) {
          const fast = plane(width, height);
          boxAlongLines([fast], width, height, direction, radius);
          const slow = referenceLineBox(plane(width, height), width, height, direction, radius);
          fast.forEach((value, index) => expect(value).toBeCloseTo(slow[index], 3));
        }
      }
    }
  });

  it("행 순서 상자·가우시안·소벨은 kernel-utils 와 같은 값을 낸다", () => {
    for (const [width, height] of [...SIZES, [24, 16]] as const) {
      for (const radius of [1, 2, 3, 7, 30]) {
        const box = plane(width, height), boxReference = plane(width, height);
        boxBlur(box, width, height, radius);
        boxBlurPlane(boxReference, width, height, radius);
        box.forEach((value, index) => expect(value).toBeCloseTo(boxReference[index], 3));
        const gauss = plane(width, height), gaussReference = plane(width, height);
        gaussianBlur(gauss, width, height, radius);
        gaussianPlane(gaussReference, width, height, radius);
        gauss.forEach((value, index) => expect(value).toBeCloseTo(gaussReference[index], 3));
      }
      const magnitude = gradientMagnitude(plane(width, height), width, height);
      const reference = sobel(plane(width, height), width, height).magnitude;
      magnitude.forEach((value, index) => expect(value).toBeCloseTo(reference[index], 2));
    }
  });

  it("쿠와하라는 평평한 면을 그대로 두고 가파른 경계를 흐리지 않는다", () => {
    const flat = readPaintSource(image(9, 7, () => [90, 140, 200, 255]));
    const flatOut = kuwahara(flat, flat.weight, 9, 7, 3, 6);
    flatOut.red.forEach((value) => expect(value).toBeCloseTo(90, 3));
    const step = readPaintSource(image(20, 6, (x) => (x < 10 ? [30, 30, 30, 255] : [220, 220, 220, 255])));
    const stepOut = kuwahara(step, step.weight, 20, 6, 3, 8);
    for (let y = 0; y < 6; y += 1) {
      for (let x = 0; x < 20; x += 1) expect(Math.abs(stepOut.red[y * 20 + x] - (x < 10 ? 30 : 220))).toBeLessThan(1);
    }
  });

  it("결 노이즈는 결정적이고 평균 0·표준편차 1 이며 시드마다 다르다", () => {
    const first = streakNoise(40, 30, 7, "diagonal-up", 6, 1);
    expect(Array.from(streakNoise(40, 30, 7, "diagonal-up", 6, 1))).toEqual(Array.from(first));
    const average = first.reduce((sum, value) => sum + value, 0) / first.length;
    const spread = Math.sqrt(first.reduce((sum, value) => sum + (value - average) ** 2, 0) / first.length);
    expect(Math.abs(average)).toBeLessThan(1e-4);
    expect(spread).toBeCloseTo(1, 3);
    expect(Array.from(streakNoise(40, 30, 8, "diagonal-up", 6, 1))).not.toEqual(Array.from(first));
  });
});
