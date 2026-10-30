/**
 * 필터 갤러리 · 회화(예술 효과·스케치) 슬라이더 무효 칸 회귀 시험.
 * 반올림·문턱 하한·공용 흐림 최소 상자 때문에 이웃한 두 슬라이더 칸이 바이트까지 같은 결과를 내던 결함을 막는다.
 *   - 드라이 브러시 브러시 세부: Math.round(3 + 세부 × 0.9) 가 세부 5 와 6 을 둘 다 8 단계로 묶었다.
 *   - 카툰 검정 비율: 완전한 검정 문턱이 하한 2% 에 닿는 칸(보이는 픽셀 중 주변보다 2% 넘게 어두운 몫, 512×384 사진형 약
 *     28%·선화 약 5%)부터 그 위 칸이 모두 같았다.
 *   - 찢긴 가장자리 매끄러움: 휘도 흐림 반지름 0.75~1.45(1~3 칸)가 모두 공용 흐림의 최소 상자 1 로 잘렸다.
 */
import { describe, expect, it } from "vitest";

import { STUDIO_FILTER_GALLERY_ARTISTIC_EFFECTS } from "./studio-filter-gallery-artistic";
import { STUDIO_FILTER_GALLERY_ARTISTIC_EXTRA_EFFECTS } from "./studio-filter-gallery-artistic-extra";
import { STUDIO_FILTER_GALLERY_SKETCH_EFFECTS } from "./studio-filter-gallery-sketch";

import type {
  StudioFilterGalleryEffectDef,
  StudioFilterGalleryImage,
  StudioFilterGalleryParams,
} from "./studio-filter-gallery-types";

const EFFECTS: readonly StudioFilterGalleryEffectDef[] = [
  ...STUDIO_FILTER_GALLERY_ARTISTIC_EFFECTS,
  ...STUDIO_FILTER_GALLERY_ARTISTIC_EXTRA_EFFECTS,
  ...STUDIO_FILTER_GALLERY_SKETCH_EFFECTS,
];

const PHOTO_WIDTH = 64, PHOTO_HEIGHT = 48;
const LINE_WIDTH = 96, LINE_HEIGHT = 72;

/** 0~1 정수 해시(그림의 잡음·종이 결). */
function noise(x: number, y: number, salt: number): number {
  let hash = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

/**
 * 사진 같은 그림(64×48): 하늘·땅 기울기, 픽셀 잡음과 4px 얼룩, 그림자 진 오른쪽 아래, 창이 난 짙은 건물, 짙은 원.
 * 카툰에서 주변보다 2% 넘게 어두운 몫이 기본 검정 비율(20%)보다 많은 그림이다(마스크 반지름 7 에서 약 46%).
 * garbage 를 주면 왼쪽 띠·격자 점은 완전 투명(숨은 RGB 는 garbage), 아래 띠는 반투명이다.
 */
function photo(garbage?: readonly number[]): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(PHOTO_WIDTH * PHOTO_HEIGHT * 4);
  for (let y = 0; y < PHOTO_HEIGHT; y += 1) {
    for (let x = 0; x < PHOTO_WIDTH; x += 1) {
      const u = x / (PHOTO_WIDTH - 1), v = y / (PHOTO_HEIGHT - 1);
      const grain = (noise(x, y, 1) - 0.5) * 36 + (noise(x >> 2, y >> 2, 2) - 0.5) * 30;
      let rgb = v < 0.55 ? [70 + 110 * v, 120 + 90 * v, 225 - 50 * v] : [125 - 60 * v, 105 - 40 * v, 60 - 20 * v];
      if (x + 0.6 * y > 0.9 * PHOTO_WIDTH) rgb = rgb.map((channel) => channel * 0.62);
      if (u > 0.6 && u < 0.82 && v > 0.2 && v < 0.85) rgb = (x >> 2) % 2 === 0 && (y >> 2) % 3 === 0 ? [245, 232, 170] : [58, 52, 70];
      if ((u - 0.28) ** 2 + ((v - 0.62) * 0.75) ** 2 < 0.018) rgb = [24, 20, 30];
      const offset = (y * PHOTO_WIDTH + x) * 4;
      data.set([rgb[0] + grain, rgb[1] + grain, rgb[2] + grain, 255], offset);
      if (!garbage) continue;
      const alpha = x < 4 || (x + 2 * y) % 13 === 0 ? 0 : y >= PHOTO_HEIGHT - 6 ? 128 : 255;
      data[offset + 3] = alpha;
      if (alpha === 0) data.set(garbage, offset);
    }
  }
  return { width: PHOTO_WIDTH, height: PHOTO_HEIGHT, data };
}

/**
 * 선화(96×72): 안티에일리어스 짙은 원 윤곽·대각선과 반투명 볼 채색. paper 면 결이 있는 크림색 종이 위 불투명 그림으로,
 * 카툰에서 주변보다 2% 넘게 어두운 몫이 기본 검정 비율(20%)보다 적은 그림이다(마스크 반지름 7 에서 약 16%). 아니면 투명
 * 바탕이고 완전 투명 픽셀의 숨은 RGB 는 garbage 다.
 */
function lineArt(paper: boolean, garbage: readonly number[] = [0, 0, 0]): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(LINE_WIDTH * LINE_HEIGHT * 4);
  const centerX = 0.45 * LINE_WIDTH, centerY = 0.45 * LINE_HEIGHT, radius = 0.3 * LINE_HEIGHT;
  for (let y = 0; y < LINE_HEIGHT; y += 1) {
    for (let x = 0; x < LINE_WIDTH; x += 1) {
      const px = x + 0.5, py = y + 0.5;
      const ring = Math.abs(Math.hypot(px - centerX, py - centerY) - radius);
      const slash = Math.abs((px - 0.1 * LINE_WIDTH) * 0.6 + (py - 0.9 * LINE_HEIGHT) * 0.8);
      const line = Math.max(Math.min(1, Math.max(0, 1.6 - ring)), Math.min(1, Math.max(0, 1.2 - slash)));
      const cheek = Math.max(0, 1 - Math.hypot(px - centerX - 0.3 * radius, py - centerY) / (0.35 * radius)) * 0.7;
      const offset = (y * LINE_WIDTH + x) * 4;
      if (paper) {
        const tone = 4 * (noise(x, y, 5) - 0.5);
        let red = 246 + tone, green = 240 + tone, blue = 226 + tone;
        red += (236 - red) * cheek; green += (130 - green) * cheek; blue += (140 - blue) * cheek;
        red += (28 - red) * line; green += (24 - green) * line; blue += (40 - blue) * line;
        data.set([red, green, blue, 255], offset);
        continue;
      }
      const alpha = line + cheek * (1 - line);
      if (alpha <= 0) {
        data.set([garbage[0], garbage[1], garbage[2], 0], offset);
        continue;
      }
      const ink = line / alpha;
      data.set([28 * ink + 236 * (1 - ink), 24 * ink + 130 * (1 - ink), 40 * ink + 140 * (1 - ink), Math.round(alpha * 255)], offset);
    }
  }
  return { width: LINE_WIDTH, height: LINE_HEIGHT, data };
}

/** 고친 슬라이더와 함께 훑을 맥락과, 이웃 칸이 서로 달라야 하는 불투명 그림. */
const SWEEPS = [
  { id: "artistic.dry-brush", key: "brushDetail", contexts: [{}, { brushSize: 0 }, { brushSize: 10 }], images: ["photo"] },
  { id: "artistic.cartoon", key: "pctBlack", contexts: [{}, { maskRadius: 2.5 }], images: ["photo", "linePaper"] },
  { id: "sketch.torn-edges", key: "smoothness", contexts: [{}, { contrast: 1 }], images: ["photo"] },
] as const;

const OPAQUE: Readonly<Record<(typeof SWEEPS)[number]["images"][number], StudioFilterGalleryImage>> = {
  photo: photo(),
  linePaper: lineArt(true),
};

/** 투명 픽셀의 숨은 RGB 만 다른 그림 쌍: 보이는 픽셀 결과가 같아야 숨은 색이 새지 않은 것이다. */
const HIDDEN_PAIRS: readonly (readonly [StudioFilterGalleryImage, StudioFilterGalleryImage])[] = [
  [photo([0, 255, 0]), photo([255, 0, 255])],
  [lineArt(false, [0, 255, 0]), lineArt(false, [255, 0, 255])],
];

function find(id: string): StudioFilterGalleryEffectDef {
  const effect = EFFECTS.find((candidate) => candidate.id === id);
  if (!effect) throw new Error(`효과 없음: ${id}`);
  return effect;
}

/** 슬라이더 칸 값(소수 step 은 누적 오차 없이 min + i × step 을 소수 자릿수로 반올림). */
function sliderRange(effect: StudioFilterGalleryEffectDef, key: string): number[] {
  const spec = effect.params.find((candidate) => candidate.key === key);
  if (spec?.control !== "slider") throw new Error(`슬라이더 없음: ${effect.id} ${key}`);
  const count = Math.round((spec.max - spec.min) / spec.step);
  return Array.from({ length: count + 1 }, (_, index) => Number((spec.min + index * spec.step).toFixed(6)));
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

/** 알파가 원본과 달라진 픽셀 수. */
function alphaChanges(out: StudioFilterGalleryImage, source: StudioFilterGalleryImage): number {
  let changed = 0;
  for (let offset = 3; offset < out.data.length; offset += 4) if (out.data[offset] !== source.data[offset]) changed += 1;
  return changed;
}

/** 숨은 RGB 만 다른 두 입력의 결과에서 보이는(알파 > 0) 픽셀 RGB 가 다른 픽셀 수. 0 이어야 숨은 색이 새지 않은 것이다. */
function visibleRgbDifferences(left: StudioFilterGalleryImage, right: StudioFilterGalleryImage): number {
  let differing = 0;
  for (let offset = 0; offset < left.data.length; offset += 4) {
    if (left.data[offset + 3] === 0) continue;
    if (left.data[offset] !== right.data[offset] || left.data[offset + 1] !== right.data[offset + 1] || left.data[offset + 2] !== right.data[offset + 2]) {
      differing += 1;
    }
  }
  return differing;
}

/** 보이는 픽셀 RGB 합(어두워질수록 작다). */
function visibleRgbSum(target: StudioFilterGalleryImage): number {
  let total = 0;
  for (let offset = 0; offset < target.data.length; offset += 4) {
    if (target.data[offset + 3] !== 0) total += target.data[offset] + target.data[offset + 1] + target.data[offset + 2];
  }
  return total;
}

describe("필터 갤러리 · 회화 슬라이더 무효 칸 회귀", () => {
  it.each(SWEEPS)("$id $key 는 모든 이웃 칸이 서로 다른 결과를 내고, 모든 칸에서 알파·투명 계약을 지킨다", ({ id, key, contexts, images }) => {
    const effect = find(id);
    const identical: string[] = [], broken: string[] = [];
    for (const context of contexts) {
      for (const name of images) {
        let previous: { value: number; out: StudioFilterGalleryImage } | null = null;
        for (const value of sliderRange(effect, key)) {
          const out = run(effect, OPAQUE[name], { ...context, [key]: value });
          if (previous && rgbEqual(previous.out, out)) identical.push(`${name} ${JSON.stringify(context)} ${previous.value}=${value}`);
          previous = { value, out };
        }
      }
      for (const value of sliderRange(effect, key)) {
        const params = { ...context, [key]: value };
        HIDDEN_PAIRS.forEach(([green, magenta], pair) => {
          const left = run(effect, green, params);
          const alpha = alphaChanges(left, green), leaks = visibleRgbDifferences(left, run(effect, magenta, params));
          if (alpha > 0 || leaks > 0) broken.push(`그림 ${pair} ${JSON.stringify(params)}: 알파 ${alpha} · 숨은 색 ${leaks}`);
        });
      }
    }
    expect(identical).toEqual([]);
    expect(broken).toEqual([]);
  });

  it("카툰 검정 비율은 0 부터 1 까지 칸마다 더 어두워진다(주변보다 어두운 몫이 기본값보다 많은 그림과 적은 그림 모두)", () => {
    // 예전에는 완전한 검정 문턱이 하한 2% 에 닿은 칸부터 위가 모두 같아 이 그림들에서 절반 넘는 칸이 그대로였다.
    const cartoon = find("artistic.cartoon");
    const flat: string[] = [];
    const contexts: readonly StudioFilterGalleryParams[] = [{}, { maskRadius: 2.5 }];
    for (const name of ["photo", "linePaper"] as const) {
      for (const context of contexts) {
        let previous: { value: number; total: number } | null = null;
        for (const value of sliderRange(cartoon, "pctBlack")) {
          const total = visibleRgbSum(run(cartoon, OPAQUE[name], { ...context, pctBlack: value }));
          if (previous && !(total < previous.total)) flat.push(`${name} ${JSON.stringify(context)} ${previous.value}→${value}`);
          previous = { value, total };
        }
      }
    }
    expect(flat).toEqual([]);
  });

  it("드라이 브러시 세부 5 는 세부 4(7 단계)와 6(8 단계) 결과 사이, 0·255 로 잘리지 않은 곳에서는 가운데 결과를 낸다", () => {
    // 세부 5 만 7 과 8 단계 단계화를 반씩 섞는다. 평탄화·붓결은 세부와 무관하므로 채널마다 두 결과 사이(±1 반올림)이고,
    // 세 결과가 모두 1~254 면(자르기 없음) 두 결과의 평균 ±1 이다.
    const dryBrush = find("artistic.dry-brush");
    const [four, five, six] = [4, 5, 6].map((brushDetail) => run(dryBrush, OPAQUE.photo, { brushDetail }).data);
    let outside = 0, offCenter = 0, unclamped = 0;
    for (let offset = 0; offset < five.length; offset += 4) {
      for (let channel = 0; channel < 3; channel += 1) {
        const low = four[offset + channel], high = six[offset + channel], middle = five[offset + channel];
        if (middle < Math.min(low, high) - 1 || middle > Math.max(low, high) + 1) outside += 1;
        if (Math.min(low, high, middle) < 1 || Math.max(low, high, middle) > 254) continue;
        unclamped += 1;
        if (Math.abs(middle - (low + high) / 2) > 1) offCenter += 1;
      }
    }
    expect(outside).toBe(0);
    expect(unclamped).toBeGreaterThan(0.8 * 3 * PHOTO_WIDTH * PHOTO_HEIGHT);
    expect(offCenter).toBe(0);
  });

  it("소수 슬라이더 값(저장 문서)은 반올림 없이 이웃한 두 칸 사이의 결과를 낸다", () => {
    // 칸 사이 값이 양쪽 칸 어느 쪽과도 같지 않아야 반올림·하한으로 묶이지 않은 연속 매핑이다.
    const cases = [
      ["artistic.dry-brush", "brushDetail", 4, 5, "photo"],
      ["artistic.dry-brush", "brushDetail", 5, 6, "photo"],
      ["sketch.torn-edges", "smoothness", 1, 2, "photo"],
      ["sketch.torn-edges", "smoothness", 2, 3, "photo"],
      ["artistic.cartoon", "pctBlack", 0.55, 0.56, "linePaper"],
    ] as const;
    const rounded: string[] = [];
    for (const [id, key, low, high, name] of cases) {
      const effect = find(id);
      const middle = run(effect, OPAQUE[name], { [key]: (low + high) / 2 });
      for (const end of [low, high]) if (rgbEqual(middle, run(effect, OPAQUE[name], { [key]: end }))) rounded.push(`${id} ${key} ${(low + high) / 2}=${end}`);
    }
    expect(rounded).toEqual([]);
  });
});
