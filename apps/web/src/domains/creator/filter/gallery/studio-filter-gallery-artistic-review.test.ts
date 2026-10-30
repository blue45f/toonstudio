/**
 * 필터 갤러리 · 예술 효과 적대적 리뷰 결함 회귀 시험. 모두 "슬라이더를 한 칸 옮겨도 결과가 그대로" 인 결함이다.
 *   - 팔레트 나이프 부드러움: 흐림 반지름 0.35 는 흐림 문턱(0.5) 아래이고 0.7~1.4 는 최소 상자 흐림(반지름 √3)과
 *     같아 0=1, 2=3=4 였다.
 *   - 팔레트 나이프 획 크기·획 세부: 쿠와하라 반지름을 정수로 반올림해 획 크기 50칸이 7가지, 세부 3칸이 2가지였다.
 *   - 비닐 랩 매끄러움·네온 광 크기는 공용 도우미의 소수 반지름 흐림으로 풀렸고, 같은 원인으로 남은 언더페인팅
 *     브러시 크기 1=2(두 반지름이 모두 최소 상자 흐림)를 고쳤다.
 *   - 스펀지 매끄러움: 구멍 상자 평균 반지름을 반올림해 15칸이 6가지였다.
 *   - 페인트 바르기 브러시 크기: 쿠와하라 반지름 반올림(최소 1)으로 작은 크기 여러 칸이 같았다(단순 1~4, 5~8 등).
 */
import { describe, expect, it } from "vitest";

import { STUDIO_FILTER_GALLERY_ARTISTIC_EFFECTS } from "./studio-filter-gallery-artistic";
import { luma } from "./studio-filter-gallery-kernel-utils";

import type { StudioFilterGalleryEffectDef, StudioFilterGalleryImage, StudioFilterGalleryParams } from "./studio-filter-gallery-types";

const DAUB_KINDS = ["simple", "light-rough", "dark-rough", "wide-sharp", "wide-blurry", "sparkle"] as const;
/** 이웃한 두 칸의 평균 RGB 차이 하한(0~255). 고치기 전에는 같은 묶음 안 칸들의 차이가 정확히 0 이었다. */
const MIN_STEP = 0.1;

function find(id: string): StudioFilterGalleryEffectDef {
  const effect = STUDIO_FILTER_GALLERY_ARTISTIC_EFFECTS.find((candidate) => candidate.id === id);
  if (!effect) throw new Error(`효과 없음: ${id}`);
  return effect;
}

function image(width: number, height: number, pixel: (x: number, y: number) => readonly number[]): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) data.set(pixel(x, y), (y * width + x) * 4);
  }
  return { width, height, data };
}

/** 기울기·체크 무늬·밝은 원판·픽셀 잡음과 여러 단계 알파(완전 투명 포함)를 담은 48×36 질감 그림. */
function texturedFixture(): StudioFilterGalleryImage {
  return image(48, 36, (x, y) => {
    const checker = ((x >> 2) + (y >> 2)) % 2 === 0 ? 45 : -45;
    const disc = (x - 24) ** 2 + (y - 18) ** 2 < 100 ? 110 : 0;
    const grain = ((x * 7919 + y * 104729) % 37) - 18;
    const alpha = x === 0 || (x + y) % 11 === 0 ? 0 : 255 - ((x * 13 + y * 29) % 5) * 40;
    return [20 + x * 4 + checker + disc + grain, 30 + y * 5 - checker + disc + grain, 200 - x * 3 - y * 2 + checker + grain, alpha];
  });
}

function opaqueFixture(): StudioFilterGalleryImage {
  const fixture = texturedFixture();
  for (let offset = 3; offset < fixture.data.length; offset += 4) fixture.data[offset] = 255;
  return fixture;
}

function run(effect: StudioFilterGalleryEffectDef, source: StudioFilterGalleryImage, params: StudioFilterGalleryParams = {}): StudioFilterGalleryImage {
  const out = { width: source.width, height: source.height, data: source.data.slice() };
  effect.apply(out, params, { seed: 1234, scale: 1 });
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

/** 가로로 이웃한 픽셀 휘도 차의 평균(전변동). 작을수록 매끈하다. */
function totalVariation(target: StudioFilterGalleryImage): number {
  const values = lumaValues(target);
  let total = 0;
  for (let y = 0; y < target.height; y += 1) {
    for (let x = 1; x < target.width; x += 1) total += Math.abs(values[y * target.width + x] - values[y * target.width + x - 1]);
  }
  return total / (target.height * (target.width - 1));
}

function lumaVariance(target: StudioFilterGalleryImage): number {
  const values = lumaValues(target);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}

const range = (low: number, high: number): number[] => Array.from({ length: high - low + 1 }, (_, index) => low + index);

/** 슬라이더 key 를 values 로 차례로 옮긴 결과들. */
function sweep(
  effect: StudioFilterGalleryEffectDef,
  source: StudioFilterGalleryImage,
  key: string,
  values: readonly number[],
  base: StudioFilterGalleryParams = {},
): StudioFilterGalleryImage[] {
  return values.map((value) => run(effect, source, { ...base, [key]: value }));
}

/** 모든 칸의 결과가 서로 다르고(바이트 비교), 이웃한 칸끼리도 눈에 띄게(평균 MIN_STEP 이상) 다르다. */
function expectEveryStepChanges(
  effect: StudioFilterGalleryEffectDef,
  source: StudioFilterGalleryImage,
  key: string,
  values: readonly number[],
  base: StudioFilterGalleryParams = {},
): void {
  const outputs = sweep(effect, source, key, values, base);
  const label = `${effect.id} ${key} ${JSON.stringify(base)}`;
  expect(new Set(outputs.map((out) => out.data.join(","))).size, label).toBe(values.length);
  for (let index = 1; index < outputs.length; index += 1) {
    expect(meanAbsRgbDiff(outputs[index], outputs[index - 1]), `${label}: ${values[index - 1]} → ${values[index]}`).toBeGreaterThan(MIN_STEP);
  }
}

function expectStrictlyDecreasing(values: readonly number[], label: string): void {
  for (let index = 1; index < values.length; index += 1) expect(values[index], `${label} [${index}]`).toBeLessThan(values[index - 1]);
}

describe("필터 갤러리 · 예술 효과 리뷰 결함 회귀 — 팔레트 나이프", () => {
  const knife = find("artistic.palette-knife");

  it("부드러움 0~10 은 칸마다 결과가 바뀌고 칸마다 더 매끈해진다(전엔 0=1, 2=3=4)", () => {
    const fixture = texturedFixture();
    expectEveryStepChanges(knife, fixture, "softness", range(0, 10));
    expectStrictlyDecreasing(sweep(knife, fixture, "softness", range(0, 10)).map(totalVariation), "부드러움별 전변동");
  });

  it("획 크기 1~50 과 여러 획 크기에서의 획 세부 1~3 은 모든 칸이 서로 다르다(전엔 50칸이 7가지)", () => {
    const fixture = texturedFixture();
    expectEveryStepChanges(knife, fixture, "strokeSize", range(1, 50));
    for (const strokeSize of [1, 10, 25, 50]) expectEveryStepChanges(knife, fixture, "strokeDetail", [1, 2, 3], { strokeSize });
  });

  it("소수 반지름 두 패스의 작업량을 기본값 cost 와 부드러움에 따른 costFor 로 낸다", () => {
    expect(knife.costFor).toBeTypeOf("function");
    const costFor = knife.costFor ?? (() => 0);
    expect(costFor({})).toBeGreaterThanOrEqual(knife.cost);
    expect(costFor({ softness: 5 })).toBeGreaterThan(costFor({ softness: 0 }));
  });
});

describe("필터 갤러리 · 예술 효과 리뷰 결함 회귀 — 흐림 반지름 슬라이더", () => {
  it("비닐 랩 매끄러움·네온 광 크기는 모든 칸이 서로 다르다(공용 소수 흐림으로 풀린 결함의 회귀 방지)", () => {
    const fixture = texturedFixture();
    expectEveryStepChanges(find("artistic.plastic-wrap"), fixture, "smoothness", range(1, 15));
    expectEveryStepChanges(find("artistic.neon-glow"), fixture, "glowSize", range(-24, 24));
  });

  it("언더페인팅 브러시 크기 0~40 은 모든 칸이 서로 다르고 0~3 은 칸마다 더 매끈해진다(전엔 1=2)", () => {
    const under = find("artistic.underpainting");
    const fixture = texturedFixture();
    expectEveryStepChanges(under, fixture, "brushSize", range(0, 40));
    expectStrictlyDecreasing(sweep(under, fixture, "brushSize", range(0, 3)).map(totalVariation), "브러시 크기별 전변동");
  });

  it("스펀지 매끄러움 1~15 는 모든 칸이 서로 다르고 칸마다 구멍 대비가 줄어든다(전엔 15칸이 6가지)", () => {
    const sponge = find("artistic.sponge");
    expectEveryStepChanges(sponge, texturedFixture(), "smoothness", range(1, 15));
    const flat = image(48, 36, (x) => [120 + x, 110, 100, 255]);
    expectStrictlyDecreasing(sweep(sponge, flat, "smoothness", range(1, 15)).map(lumaVariance), "매끄러움별 구멍 대비");
  });
});

describe("필터 갤러리 · 예술 효과 리뷰 결함 회귀 — 페인트 바르기", () => {
  const daubs = find("artistic.paint-daubs");

  it("브러시 크기 1~50 은 모든 붓 유형과 선명도 0 에서 모든 칸이 서로 다르다(전엔 단순 1~4, 5~8 이 같았다)", () => {
    const fixture = texturedFixture();
    for (const brushType of DAUB_KINDS) expectEveryStepChanges(daubs, fixture, "brushSize", range(1, 50), { brushType });
    expectEveryStepChanges(daubs, fixture, "brushSize", range(1, 50), { sharpness: 0 });
  });

  it("반지름 1 아래의 작은 붓은 크기가 작을수록 원본에 가깝다(반지름 0 쿠와하라 = 원본)", () => {
    const fixture = opaqueFixture();
    const distances = sweep(daubs, fixture, "brushSize", range(1, 6), { sharpness: 0 }).map((out) => meanAbsRgbDiff(out, fixture));
    for (let index = 1; index < distances.length; index += 1) expect(distances[index], `크기 ${index + 1}`).toBeGreaterThan(distances[index - 1]);
    expect(distances[0]).toBeLessThan(distances[2] / 2);
  });

  it("붓 유형별 작업량을 costFor 로 낸다(무거운 유형일수록 크고, 모두 기본값 cost 이상)", () => {
    expect(daubs.costFor).toBeTypeOf("function");
    const costFor = (brushType: string): number => daubs.costFor?.({ brushType }) ?? 0;
    for (const brushType of DAUB_KINDS) expect(costFor(brushType), brushType).toBeGreaterThanOrEqual(daubs.cost);
    for (const heavy of ["light-rough", "dark-rough", "sparkle"]) expect(costFor(heavy), heavy).toBeGreaterThan(costFor("wide-blurry"));
    expect(costFor("wide-blurry")).toBeGreaterThan(costFor("simple"));
  });
});

describe("필터 갤러리 · 예술 효과 리뷰 — 작은 반지름 혼합 경로의 투명 처리", () => {
  it("작은 반지름 혼합 경로도 완전 투명 픽셀의 RGB 를 보이는 픽셀로 번지게 하지 않고 알파를 지킨다", () => {
    const paint = (garbage: readonly number[]): StudioFilterGalleryImage => {
      const fixture = texturedFixture();
      for (let y = 0; y < 10; y += 1) for (let x = 36; x < 48; x += 1) fixture.data[(y * 48 + x) * 4 + 3] = 0;
      for (let offset = 0; offset < fixture.data.length; offset += 4) if (fixture.data[offset + 3] === 0) fixture.data.set(garbage, offset);
      return fixture;
    };
    const visible = (target: StudioFilterGalleryImage): number[] =>
      Array.from(target.data).filter((_, offset) => target.data[offset - (offset % 4) + 3] > 0 && offset % 4 !== 3);
    const cases: [string, StudioFilterGalleryParams][] = [
      ["artistic.paint-daubs", { brushSize: 1 }],
      ["artistic.paint-daubs", { brushSize: 1, brushType: "wide-blurry" }],
      ["artistic.palette-knife", { softness: 2 }],
      ["artistic.underpainting", { brushSize: 1 }],
      ["artistic.sponge", { smoothness: 2 }],
    ];
    for (const [id, params] of cases) {
      const green = run(find(id), paint([0, 255, 0]), params), magenta = run(find(id), paint([255, 0, 255]), params);
      expect(visible(green), `${id} ${JSON.stringify(params)}`).toEqual(visible(magenta));
      expect(green.data.filter((_, offset) => offset % 4 === 3)).toEqual(paint([0, 255, 0]).data.filter((_, offset) => offset % 4 === 3));
    }
  });
});
