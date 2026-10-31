/**
 * 필터 갤러리 · 붓 터치 슬라이더 무효 칸 회귀 시험.
 * 반올림·공용 흐림 최소 상자 때문에 이웃한 두 슬라이더 칸이 바이트까지 같은 결과를 내던 결함을 막는다.
 *   - 가장자리 강조 매끄러움 1~4: 휘도 흐림 반지름 0.75~1.5 가 모두 공용 흐림의 최소 상자 1 로 잘렸다.
 *   - 각진 획 획 길이: Math.round(L / 4)·Math.round(L / 2) 가 4k − 1 과 4k 칸을 같은 반지름으로 묶었다.
 *   - 잉크 윤곽선 획 길이: Math.max(1, Math.round(L / 2)) 가 홀수 칸을 바로 위 짝수 칸과 같게 만들었다.
 *   - 스프레이 획 획 길이: 1.2L 의 1/4·1/2 반올림이 0·1, 3·4, 6·7, 13·14, 16·17 칸을 묶었다.
 *   - 스프레이 획 스프레이 반경: Math.round(반경 × 0.7) 이 1·2, 5·6, 8·9, 11·12 … 칸을 묶었다.
 */
import { describe, expect, it } from "vitest";

import { STUDIO_FILTER_GALLERY_BRUSH_STROKES_EFFECTS } from "./studio-filter-gallery-brush-strokes";

import type {
  StudioFilterGalleryEffectDef,
  StudioFilterGalleryImage,
  StudioFilterGalleryParams,
} from "./studio-filter-gallery-types";

const WIDTH = 64, HEIGHT = 48;

/** 고친 슬라이더와 함께 훑을 맥락(선택지). 스프레이 획은 네 방향 모두에서 본다. */
const FIXED_SLIDERS = [
  { id: "brush-strokes.accented-edges", key: "smoothness", contexts: [{}] },
  { id: "brush-strokes.angled-strokes", key: "strokeLength", contexts: [{}] },
  { id: "brush-strokes.ink-outlines", key: "strokeLength", contexts: [{}] },
  ...["strokeLength", "sprayRadius"].map((key) => ({
    id: "brush-strokes.sprayed-strokes",
    key,
    contexts: ["right-diagonal", "horizontal", "left-diagonal", "vertical"].map((direction) => ({ direction })),
  })),
] as const;

function find(id: string): StudioFilterGalleryEffectDef {
  const effect = STUDIO_FILTER_GALLERY_BRUSH_STROKES_EFFECTS.find((candidate) => candidate.id === id);
  if (!effect) throw new Error(`효과 없음: ${id}`);
  return effect;
}

function sliderRange(effect: StudioFilterGalleryEffectDef, key: string): number[] {
  const spec = effect.params.find((candidate) => candidate.key === key);
  if (spec?.control !== "slider") throw new Error(`슬라이더 없음: ${effect.id} ${key}`);
  const values: number[] = [];
  for (let value = spec.min; value <= spec.max; value += spec.step) values.push(value);
  return values;
}

/**
 * 사진 같은 질감 그림: 기울기, 픽셀 잡음, 거의 검은 원판(빗금이 생기는 어두운 면), 밝은 사각형, 날카로운 대각선 경계.
 * garbage 를 주면 왼쪽 띠·격자 점은 완전 투명(숨은 RGB 는 garbage), 아래 띠는 반투명이다.
 */
function photoFixture(garbage?: readonly number[]): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const u = x / (WIDTH - 1), v = y / (HEIGHT - 1);
      const grain = ((x * 7919 + y * 104729) % 37) - 18 + (((x * 31 + y * 17) ^ (x * y)) % 11) - 5;
      const shade = x + y > 70 ? -55 : 0;
      let rgb = [30 + 180 * u + shade, 50 + 150 * v + shade, 200 - 150 * u + shade];
      if ((x - 18) ** 2 + (y - 30) ** 2 < 100) rgb = [14, 12, 20];
      if (x >= 44 && x < 58 && y >= 6 && y < 20) rgb = [242, 236, 228];
      const offset = (y * WIDTH + x) * 4;
      data.set([rgb[0] + grain, rgb[1] + grain, rgb[2] + grain, 255], offset);
      if (!garbage) continue;
      const alpha = x < 5 || (x + 2 * y) % 13 === 0 ? 0 : y >= HEIGHT - 8 ? 128 : 255;
      data[offset + 3] = alpha;
      if (alpha === 0) data.set(garbage, offset);
    }
  }
  return { width: WIDTH, height: HEIGHT, data };
}

function run(effect: StudioFilterGalleryEffectDef, source: StudioFilterGalleryImage, params: StudioFilterGalleryParams): StudioFilterGalleryImage {
  const out = { width: source.width, height: source.height, data: source.data.slice() };
  effect.apply(out, params, { seed: 1234, scale: 1 });
  return out;
}

function rgbEqual(left: StudioFilterGalleryImage, right: StudioFilterGalleryImage): boolean {
  for (let offset = 0; offset < left.data.length; offset += 4) {
    for (let channel = 0; channel < 3; channel += 1) if (left.data[offset + channel] !== right.data[offset + channel]) return false;
  }
  return true;
}

const alphaOf = (target: StudioFilterGalleryImage): number[] => Array.from(target.data.filter((_, offset) => offset % 4 === 3));

function visibleRgb(target: StudioFilterGalleryImage): number[] {
  const values: number[] = [];
  for (let offset = 0; offset < target.data.length; offset += 4) {
    if (target.data[offset + 3] !== 0) values.push(target.data[offset], target.data[offset + 1], target.data[offset + 2]);
  }
  return values;
}

describe("필터 갤러리 · 붓 터치 슬라이더 무효 칸 회귀", () => {
  it.each(FIXED_SLIDERS)("$id $key 는 모든 이웃 칸이 서로 다른 결과를 내고, 모든 칸에서 알파·투명 계약을 지킨다", ({ id, key, contexts }) => {
    const effect = find(id);
    const opaque = photoFixture();
    // 투명 픽셀의 숨은 RGB 만 다른 두 그림: 보이는 픽셀 결과가 같아야 숨은 색이 새지 않은 것이다.
    const green = photoFixture([0, 255, 0]), magenta = photoFixture([255, 0, 255]);
    const identical: string[] = [];
    for (const context of contexts) {
      let previous: { value: number; out: StudioFilterGalleryImage } | null = null;
      for (const value of sliderRange(effect, key)) {
        const params = { ...context, [key]: value };
        const out = run(effect, opaque, params);
        if (previous && rgbEqual(previous.out, out)) identical.push(`${JSON.stringify(context)} ${previous.value}=${value}`);
        previous = { value, out };
        const left = run(effect, green, params);
        expect(alphaOf(left)).toEqual(alphaOf(green));
        expect(visibleRgb(left)).toEqual(visibleRgb(run(effect, magenta, params)));
      }
    }
    expect(identical).toEqual([]);
  });

  it("소수 슬라이더 값(저장 문서)은 반올림 없이 이웃한 두 정수 칸 사이의 결과를 낸다", () => {
    // 칸 사이 값이 양쪽 정수 칸 어느 쪽과도 같지 않아야 반올림으로 묶이지 않은 연속 매핑이다.
    const fixture = photoFixture();
    const cases = [
      ["brush-strokes.accented-edges", "smoothness", 2, 3],
      ["brush-strokes.angled-strokes", "strokeLength", 15, 16],
      ["brush-strokes.ink-outlines", "strokeLength", 4, 5],
      ["brush-strokes.sprayed-strokes", "strokeLength", 12, 13],
      ["brush-strokes.sprayed-strokes", "sprayRadius", 7, 8],
    ] as const;
    const rounded: string[] = [];
    for (const [id, key, low, high] of cases) {
      const effect = find(id);
      const middle = run(effect, fixture, { [key]: (low + high) / 2 });
      for (const end of [low, high]) if (rgbEqual(middle, run(effect, fixture, { [key]: end }))) rounded.push(`${id} ${key} ${(low + high) / 2}=${end}`);
    }
    expect(rounded).toEqual([]);
  });
});
