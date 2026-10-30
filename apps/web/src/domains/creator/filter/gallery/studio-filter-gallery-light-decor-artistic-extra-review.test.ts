/**
 * 필터 갤러리 · 장식(직소·커피 얼룩)과 예술 효과 추가분(카툰·슈퍼픽셀) 적대적 리뷰 결함 회귀 시험.
 *
 * - 직소: 한 조각에 이웃한 두 변(예: 왼쪽·위)의 꼭지가 함께 들어오면 두 머리가 그 모서리 쪽에서 겹치거나 맞닿아, 자름선이 8자로
 *   엇갈리고 조각 귀퉁이가 따로 떨어져 나갔다(기본값 곡선형은 거의 모든 시드, 사각형은 시드 몇 개). 꼭지 위치 범위가 조각 크기와
 *   상관없이 고정이면 작은 조각(짧은 변 약 88px 미만)에서 머리 사이가 자름선 잉크 폭 안으로 좁아져 같은 일이 생긴다. 자름선이
 *   조각을 정확히 나누면 선이 닿지 않은 픽셀의 4-이웃 연결 성분 수가 조각 수와 같다.
 * - 카툰: 마스크 반지름 1·1.5 는 넓은 흐림이 좁은 흐림(상자 반지름 1)과 같아 아무 픽셀도 바꾸지 않았고, 2 는 상대 어두움이 2% 문턱을
 *   거의 넘지 못해 검정 비율이 듣지 않았다.
 * - 커피 얼룩·슈퍼픽셀: 작업량이 얼룩 수 × 얼룩 넓이, 반복 횟수 × 군집 창 넓이에 비례하는데 cost 가 고정값(2·3)이라 무거운 설정이
 *   Worker 대신 메인 스레드에서 돌고 예산 검사도 통과했다. 작업량 기준은 cost 1 단위 ≈ 픽셀당 50ns 다.
 */
import { describe, expect, it } from "vitest";

import { STUDIO_FILTER_GALLERY_ARTISTIC_EXTRA_EFFECTS as ARTISTIC_EXTRA } from "./studio-filter-gallery-artistic-extra";
import { STUDIO_FILTER_GALLERY_DECOR_EFFECTS as DECOR } from "./studio-filter-gallery-light-decor";

import type {
  StudioFilterGalleryEffectDef, StudioFilterGalleryImage, StudioFilterGalleryParamValue, StudioFilterGalleryParams,
} from "./studio-filter-gallery-types";

function effectById(id: string): StudioFilterGalleryEffectDef {
  const found = [...DECOR, ...ARTISTIC_EXTRA].find((candidate) => candidate.id === id);
  if (!found) throw new Error(`효과 없음: ${id}`);
  return found;
}

/** 기본값에 overrides 를 덮은 매개변수. */
function paramsOf(effect: StudioFilterGalleryEffectDef, overrides: StudioFilterGalleryParams = {}): StudioFilterGalleryParams {
  const params: Record<string, StudioFilterGalleryParamValue> = {};
  for (const spec of effect.params) params[spec.key] = spec.default;
  return { ...params, ...overrides };
}

function run(effect: StudioFilterGalleryEffectDef, image: StudioFilterGalleryImage, params: StudioFilterGalleryParams, seed = 7): Uint8ClampedArray {
  const copy = { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
  effect.apply(copy, params, { seed, scale: 1 });
  return copy.data;
}

/** 한 값으로 칠한 불투명 바탕. */
function flat(width: number, height: number, value: number): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set([value, value, value, 255], offset);
  return { width, height, data };
}

/** 빨강 채널이 value 그대로인(자름선이 닿지 않은) 픽셀들의 4-이웃 연결 성분 수. */
function untouchedComponents(data: Uint8ClampedArray, width: number, height: number, value: number): number {
  const count = width * height, seen = new Uint8Array(count), stack: number[] = [];
  const open = (index: number): boolean => seen[index] === 0 && data[index * 4] === value;
  let components = 0;
  for (let start = 0; start < count; start += 1) {
    if (!open(start)) continue;
    components += 1;
    seen[start] = 1;
    stack.push(start);
    while (stack.length > 0) {
      const at = stack.pop() ?? 0, x = at % width;
      for (const next of [x > 0 ? at - 1 : -1, x < width - 1 ? at + 1 : -1, at - width, at + width]) {
        if (next < 0 || next >= count || !open(next)) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
  }
  return components;
}

describe("직소 · 이웃한 두 변의 꼭지", () => {
  const jigsaw = effectById("decor.jigsaw");

  it("곡선형·사각형 모두 꼭지 머리가 겹치거나 맞닿지 않아 자름선이 이미지를 조각 수만큼 정확히 나눈다", () => {
    // 600×400 에 기본 6×4 조각이면 100px 정사각형 조각이고, 5×4 는 120×100px 직사각형 조각이다.
    // 경사 폭 0 이면 자름선(거리 1px 안)만 어두워지고 나머지 픽셀은 바탕값 그대로다.
    const cases = [{ tilesX: 6, tilesY: 4, seeds: 8 }, { tilesX: 5, tilesY: 4, seeds: 4 }];
    const image = flat(600, 400, 180);
    for (const { tilesX, tilesY, seeds } of cases) {
      for (const style of ["curved", "square"]) {
        for (let seed = 1; seed <= seeds; seed += 1) {
          const out = run(jigsaw, image, paramsOf(jigsaw, { tilesX, tilesY, bevelWidth: 0, style }), seed);
          expect(untouchedComponents(out, 600, 400, 180), `${tilesX}×${tilesY} ${style} 시드 ${seed}`).toBe(tilesX * tilesY);
        }
      }
    }
  });

  it("작은 조각(짧은 변 36·50px)에서도 꼭지가 변 가운데로 모여 머리 사이가 벌어지고 자름선이 조각 수만큼 나눈다", () => {
    // 위치 범위가 0.44~0.56 고정이면 짧은 변 36px(540² · 15×15)의 곡선형은 모든 시드, 50px(500² · 10×10)은 일부 시드에서
    // 이웃한 두 머리의 잉크가 맞닿아 조각 귀퉁이가 떨어져 나갔다.
    const cases = [{ side: 540, tiles: 15 }, { side: 500, tiles: 10 }];
    for (const { side, tiles } of cases) {
      const image = flat(side, side, 180);
      for (const style of ["curved", "square"]) {
        for (let seed = 1; seed <= 6; seed += 1) {
          const out = run(jigsaw, image, paramsOf(jigsaw, { tilesX: tiles, tilesY: tiles, bevelWidth: 0, style }), seed);
          expect(untouchedComponents(out, side, side, 180), `${side}² ${tiles}×${tiles} ${style} 시드 ${seed}`).toBe(tiles * tiles);
        }
      }
    }
  });
});

describe("카툰 · 작은 마스크 반지름", () => {
  const cartoon = effectById("artistic.cartoon");
  const radius = cartoon.params.find((spec) => spec.key === "maskRadius");
  if (radius?.control !== "slider") throw new Error("maskRadius 슬라이더 없음");

  /** 밝은 결 바탕에 어두운 격자선과 어두운 원이 있는 불투명 그림. */
  function inked(width: number, height: number): StudioFilterGalleryImage {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let value = 200 + ((x * 7 + y * 3) % 23);
        if (x % 30 === 10 || y % 25 === 12) value = 40;
        if ((x - 70) ** 2 + (y - 45) ** 2 < 225) value = 60;
        data.set([value, value - 10, value - 20, 255], (y * width + x) * 4);
      }
    }
    return { width, height, data };
  }

  const changedPixels = (after: Uint8ClampedArray, before: Uint8ClampedArray): number => {
    let changed = 0;
    for (let offset = 0; offset < after.length; offset += 4) {
      if (after[offset] !== before[offset] || after[offset + 1] !== before[offset + 1] || after[offset + 2] !== before[offset + 2]) changed += 1;
    }
    return changed;
  };

  const blackPixels = (data: Uint8ClampedArray): number => {
    let black = 0;
    for (let offset = 0; offset < data.length; offset += 4) if (data[offset] === 0 && data[offset + 1] === 0 && data[offset + 2] === 0) black += 1;
    return black;
  };

  const image = inked(120, 90);

  it("마스크 반지름 최소값부터 기본값까지 모든 칸이 그림을 바꾸고, 칸마다 결과가 다르다", () => {
    let previous: Uint8ClampedArray | null = null;
    for (let value = radius.min; value <= radius.default; value += radius.step) {
      const out = run(cartoon, image, paramsOf(cartoon, { maskRadius: value }));
      expect(changedPixels(out, image.data), `반지름 ${value}`).toBeGreaterThan(0.05 * 120 * 90);
      if (previous) expect(changedPixels(out, previous), `반지름 ${value}`).toBeGreaterThan(0);
      previous = out;
    }
  });

  it("최소 반지름에서도 검정 비율이 클수록 완전히 검은 픽셀이 늘어난다", () => {
    const black = [0.05, 0.1, 0.2].map((pctBlack) => blackPixels(run(cartoon, image, paramsOf(cartoon, { maskRadius: radius.min, pctBlack }))));
    expect(black[0]).toBeGreaterThan(0);
    expect(black[1]).toBeGreaterThan(black[0]!);
    expect(black[2]).toBeGreaterThan(black[1]!);
  });

  it("범위 아래로 들어온 반지름(1·1.5)은 최소값으로 읽혀 효과가 사라지지 않는다", () => {
    const atMin = run(cartoon, image, paramsOf(cartoon, { maskRadius: radius.min }));
    for (const value of [1, 1.5]) {
      const out = run(cartoon, image, paramsOf(cartoon, { maskRadius: value }));
      expect(out, `반지름 ${value}`).toEqual(atMin);
      expect(changedPixels(out, image.data), `반지름 ${value}`).toBeGreaterThan(0.05 * 120 * 90);
    }
  });
});

describe("커피 얼룩·슈퍼픽셀 · 매개변수에 따른 작업량", () => {
  it("커피 얼룩: 기본값에서는 cost 와 같고, 얼룩 수·크기에 따라 늘어 무거운 설정의 실측 작업량을 덮는다", () => {
    const coffee = effectById("decor.coffee-stain");
    expect(coffee.costFor).toBeTypeOf("function");
    const costFor = (params: StudioFilterGalleryParams): number => coffee.costFor?.(params) ?? coffee.cost;
    expect(costFor({})).toBe(coffee.cost);
    expect(costFor(paramsOf(coffee))).toBe(coffee.cost);
    expect(costFor({ count: Number.NaN, size: "크기", darkness: true })).toBe(coffee.cost);
    // 진하기는 작업량과 무관하다.
    expect(costFor({ darkness: 100 })).toBe(coffee.cost);
    const byCount = [1, 3, 6, 10].map((count) => costFor({ count, size: 100 }));
    const bySize = [10, 35, 60, 100].map((size) => costFor({ count: 10, size }));
    for (const series of [byCount, bySize]) series.slice(1).forEach((value, index) => expect(value).toBeGreaterThan(series[index]!));
    // 256²·512² 시드 수십 개 실측 최악(ns/px, 1 단위 ≈ 50ns): 기본값 약 94, 얼룩 하나·크기 100% 약 183, 얼룩 10개·크기 60% 약 780,
    // 얼룩 10개·크기 100% 약 1210~1275.
    expect(coffee.cost * 50).toBeGreaterThanOrEqual(94);
    expect(costFor({ count: 1, size: 100 }) * 50).toBeGreaterThanOrEqual(183);
    expect(costFor({ count: 10, size: 60 }) * 50).toBeGreaterThanOrEqual(780);
    expect(costFor({ count: 10, size: 100 }) * 50).toBeGreaterThanOrEqual(1275);
  });

  it("슈퍼픽셀: 기본값에서는 cost 와 같고, 반복이 많고 덩어리가 작을수록 늘어 실측 작업량을 덮는다", () => {
    const superpixel = effectById("artistic.superpixel");
    expect(superpixel.costFor).toBeTypeOf("function");
    const costFor = (params: StudioFilterGalleryParams): number => superpixel.costFor?.(params) ?? superpixel.cost;
    expect(costFor({})).toBe(superpixel.cost);
    expect(costFor(paramsOf(superpixel))).toBe(superpixel.cost);
    expect(costFor({ clusterSize: Number.NaN, iterations: "많이", compactness: false })).toBe(superpixel.cost);
    // 조밀도는 작업량과 무관하다.
    expect(costFor({ compactness: 40 })).toBe(superpixel.cost);
    const byIterations = [1, 4, 7, 10].map((iterations) => costFor({ iterations, clusterSize: 4 }));
    const bySize = [64, 16, 8, 4].map((clusterSize) => costFor({ iterations: 10, clusterSize }));
    for (const series of [byIterations, bySize]) series.slice(1).forEach((value, index) => expect(value).toBeGreaterThan(series[index]!));
    // 256²~1024² 실측(ns/px): 기본값(반복 4·덩어리 16) 약 385~430, 반복 10·덩어리 4 약 1080~1160(부하가 있을 때 약 1250),
    // 반복 1·덩어리 4 약 210~230.
    expect(superpixel.cost * 50).toBeGreaterThanOrEqual(430);
    expect(costFor({ iterations: 10, clusterSize: 4 }) * 50).toBeGreaterThanOrEqual(1250);
    expect(costFor({ iterations: 1, clusterSize: 4 }) * 50).toBeGreaterThanOrEqual(230);
  });
});
