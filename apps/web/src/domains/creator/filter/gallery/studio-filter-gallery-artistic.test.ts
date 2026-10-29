import { describe, expect, it } from "vitest";

import { STUDIO_FILTER_GALLERY_ARTISTIC_EFFECTS } from "./studio-filter-gallery-artistic";
import { luma } from "./studio-filter-gallery-kernel-utils";
import { isStudioFilterGalleryEffectId } from "./studio-filter-gallery-types";

import type {
  StudioFilterGalleryEffectDef,
  StudioFilterGalleryImage,
  StudioFilterGalleryParamValue,
  StudioFilterGalleryParams,
} from "./studio-filter-gallery-types";

const EXPECTED_REFERENCES: Readonly<Record<string, readonly string[]>> = {
  "artistic.colored-pencil": ["Photoshop · 색연필"],
  "artistic.dry-brush": ["Photoshop · 드라이 브러시"],
  "artistic.fresco": ["Photoshop · 프레스코"],
  "artistic.neon-glow": ["Photoshop · 네온 광"],
  "artistic.paint-daubs": ["Photoshop · 페인트 바르기"],
  "artistic.palette-knife": ["Photoshop · 팔레트 나이프"],
  "artistic.plastic-wrap": ["Photoshop · 비닐 랩"],
  "artistic.rough-pastels": ["Photoshop · 거친 파스텔"],
  "artistic.smudge-stick": ["Photoshop · 문지르기 막대(Smudge Stick)"],
  "artistic.sponge": ["Photoshop · 스펀지"],
  "artistic.underpainting": ["Photoshop · 언더페인팅"],
  "artistic.ink-sketch": ["Paint.NET · 잉크 스케치"],
};

const HANGUL = /[가-힣]/u;
const EFFECTS = STUDIO_FILTER_GALLERY_ARTISTIC_EFFECTS;
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

/** 불투명 버전(명도 비교 검사용). */
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
const variance = (values: readonly number[]): number => mean(values.map((value) => (value - mean(values)) ** 2));

/** 가로로 이웃한 픽셀 휘도 차의 평균(전변동). 붓 자국 평탄화가 세부를 얼마나 덜었는지 본다. */
function totalVariation(target: StudioFilterGalleryImage): number {
  const values = lumaValues(target);
  let total = 0;
  for (let y = 0; y < target.height; y += 1) {
    for (let x = 1; x < target.width; x += 1) total += Math.abs(values[y * target.width + x] - values[y * target.width + x - 1]);
  }
  return total / (target.height * (target.width - 1));
}

const alphaOf = (target: StudioFilterGalleryImage): number[] => Array.from(target.data.filter((_, offset) => offset % 4 === 3));

/** 알파가 0 보다 큰 픽셀의 RGB 만 모은다. */
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

describe("필터 갤러리 · 예술 효과 정의", () => {
  it("요청된 열두 효과를 정해진 id·분류로 내보낸다", () => {
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

describe("필터 갤러리 · 예술 효과 커널 계약", () => {
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
        const out = run(effect, tiny, params);
        expect(alphaOf(out)).toEqual(alphaOf(tiny));
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
    // 8×8 투명 블록(반지름 2 로는 못 메우는 안쪽 포함)과 흩어진 투명 픽셀에 서로 다른 쓰레기 색을 넣는다.
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

describe("필터 갤러리 · 예술 효과 의미", () => {
  const find = (id: string): StudioFilterGalleryEffectDef => {
    const effect = EFFECTS.find((candidate) => candidate.id === id);
    if (!effect) throw new Error(`효과 없음: ${id}`);
    return effect;
  };

  it("색연필은 종이 밝기가 클수록 결과가 밝다", () => {
    const pencil = find("artistic.colored-pencil");
    const fixture = opaqueFixture();
    expect(mean(lumaValues(run(pencil, fixture, { paperBrightness: 50 }))))
      .toBeGreaterThan(mean(lumaValues(run(pencil, fixture, { paperBrightness: 0 }))) + 20);
  });

  it("드라이 브러시·팔레트 나이프·페인트 바르기는 잔 세부(전변동)를 줄인다", () => {
    // 구조 없는 강한 픽셀 잡음: 경계 보존 평탄화가 지워야 할 세부만 있다.
    const fixture = image(32, 24, (x, y) => {
      const grain = ((x * 7919 + y * 104729) % 101) - 50;
      return [128 + grain, 120 + grain, 110 + grain, 255];
    });
    const before = totalVariation(fixture);
    expect(totalVariation(run(find("artistic.dry-brush"), fixture, { texture: 1 }))).toBeLessThan(before * 0.8);
    expect(totalVariation(run(find("artistic.palette-knife"), fixture))).toBeLessThan(before * 0.8);
    expect(totalVariation(run(find("artistic.paint-daubs"), fixture, { sharpness: 0 }))).toBeLessThan(before * 0.8);
  });

  it("프레스코는 그림을 어둡게 누른다", () => {
    const fixture = opaqueFixture();
    expect(mean(lumaValues(run(find("artistic.fresco"), fixture)))).toBeLessThan(mean(lumaValues(fixture)));
  });

  it("네온 광은 고른 빛 색으로 물든다", () => {
    const neon = find("artistic.neon-glow");
    const fixture = opaqueFixture();
    const warmth = (target: StudioFilterGalleryImage): number => {
      let total = 0;
      for (let offset = 0; offset < target.data.length; offset += 4) total += target.data[offset] - target.data[offset + 2];
      return total / (target.data.length / 4);
    };
    expect(warmth(run(neon, fixture, { glowColor: "#ff2000" }))).toBeGreaterThan(warmth(run(neon, fixture, { glowColor: "#0020ff" })) + 20);
    expect(meanAbsRgbDiff(run(neon, fixture, { glowSize: 12 }), run(neon, fixture, { glowSize: -12 }))).toBeGreaterThan(1);
  });

  it("비닐 랩은 광택 강도 0 이면 그대로 두고, 강하면 하얀 광택 띠를 얹는다", () => {
    const wrap = find("artistic.plastic-wrap");
    const fixture = opaqueFixture();
    expect(Array.from(run(wrap, fixture, { highlightStrength: 0 }).data)).toEqual(Array.from(fixture.data));
    const before = lumaValues(fixture), after = lumaValues(run(wrap, fixture, { highlightStrength: 20 }));
    expect(after.some((value, index) => value > before[index] + 40)).toBe(true);
  });

  it("거친 파스텔·언더페인팅은 텍스처·부조·조명 선택에 따라 결과가 달라진다", () => {
    const fixture = opaqueFixture();
    for (const id of ["artistic.rough-pastels", "artistic.underpainting"]) {
      const effect = find(id);
      expect(meanAbsRgbDiff(run(effect, fixture, { texture: "canvas" }), run(effect, fixture, { texture: "brick" }))).toBeGreaterThan(0.5);
      expect(meanAbsRgbDiff(run(effect, fixture, { relief: 0 }), run(effect, fixture, { relief: 50 }))).toBeGreaterThan(0.5);
      expect(meanAbsRgbDiff(
        run(effect, fixture, { relief: 50, lightDirection: "top" }),
        run(effect, fixture, { relief: 50, lightDirection: "bottom" }),
      )).toBeGreaterThan(0.5);
    }
  });

  it("문지르기 막대는 강도가 클수록 밝은 영역을 더 밝게 날린다", () => {
    const smudge = find("artistic.smudge-stick");
    const fixture = opaqueFixture();
    const bright = (target: StudioFilterGalleryImage): number => mean(lumaValues(target).filter((_, index) => lumaValues(fixture)[index] > 140));
    expect(bright(run(smudge, fixture, { highlightArea: 20, intensity: 10 })))
      .toBeGreaterThan(bright(run(smudge, fixture, { highlightArea: 20, intensity: 0 })) + 10);
  });

  it("스펀지는 선명도가 클수록 얼룩 대비가 커진다", () => {
    const sponge = find("artistic.sponge");
    const flat = image(32, 24, (x) => [120 + x, 110, 100, 255]);
    expect(variance(lumaValues(run(sponge, flat, { definition: 25 })))).toBeGreaterThan(variance(lumaValues(run(sponge, flat, { definition: 0 }))) * 4);
  });

  it("잉크 스케치는 채색 0 이면 거의 무채색이고, 잉크 윤곽이 클수록 어둡다", () => {
    const sketch = find("artistic.ink-sketch");
    const fixture = opaqueFixture();
    const chroma = (target: StudioFilterGalleryImage): number => {
      let total = 0;
      for (let offset = 0; offset < target.data.length; offset += 4) {
        const channels = [target.data[offset], target.data[offset + 1], target.data[offset + 2]];
        total += Math.max(...channels) - Math.min(...channels);
      }
      return total / (target.data.length / 4);
    };
    expect(chroma(run(sketch, fixture, { coloring: 0 }))).toBeLessThan(3);
    expect(chroma(run(sketch, fixture, { coloring: 100 }))).toBeGreaterThan(20);
    expect(mean(lumaValues(run(sketch, fixture, { inkOutline: 99 })))).toBeLessThan(mean(lumaValues(run(sketch, fixture, { inkOutline: 0 }))));
  });

  it("페인트 바르기 붓 유형마다 결과가 다르다", () => {
    const daubs = find("artistic.paint-daubs");
    const fixture = opaqueFixture();
    const kinds = ["simple", "light-rough", "dark-rough", "wide-sharp", "wide-blurry", "sparkle"];
    const outputs = kinds.map((brushType) => run(daubs, fixture, { brushType }));
    for (let left = 0; left < outputs.length; left += 1) {
      for (let right = left + 1; right < outputs.length; right += 1) expect(meanAbsRgbDiff(outputs[left], outputs[right])).toBeGreaterThan(0.5);
    }
    expect(mean(lumaValues(outputs[1]))).toBeGreaterThan(mean(lumaValues(outputs[2])));
  });

  it("무작위 결을 쓰는 효과는 시드가 바뀌면 무늬도 바뀐다", () => {
    const fixture = opaqueFixture();
    for (const id of ["artistic.colored-pencil", "artistic.dry-brush", "artistic.sponge", "artistic.rough-pastels"]) {
      expect(meanAbsRgbDiff(run(find(id), fixture, {}, 1), run(find(id), fixture, {}, 2))).toBeGreaterThan(0.2);
    }
  });
});
