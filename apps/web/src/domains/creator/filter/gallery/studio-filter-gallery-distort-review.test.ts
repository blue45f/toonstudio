/**
 * 필터 갤러리 · 왜곡 계열 적대적 리뷰 결함 회귀 시험.
 *   - 빗방울: 물방울 테두리 픽셀을 직선(비프리멀티플라이드) RGB·알파로 섞어, 투명한 원본 픽셀이나 투명한 굴절 표본의 숨은
 *     RGB 가 보이는 테두리로 번졌다(숨은 초록이 비치거나, 캔버스 관례대로 투명 = RGB 0 이면 테두리가 어두워졌다). 불투명·균일
 *     알파 그림은 두 알파가 같아 고치기 전과 바이트까지 같아야 한다(지문은 고치기 전 커널로 잰 값).
 *   - 유리: 그림 크기 높이맵을 가장자리 복제로 흐려 테두리에 경사가 생겼고, 매끄러움이 커서 안쪽 질감이 거의 지워지면 RMS
 *     정규화가 그 경사만 키워 가장자리 띠만 통째로 밀렸다(유리 질감 대신 번진 액자). 높이맵을 흐림이 닿는 거리만큼 그림 밖까지
 *     실제 질감으로 넓혀 흐리고, 넓힌 만큼 늘어난 작업량은 질감별 costFor 로 낸다.
 */
import { describe, expect, it } from "vitest";

import { STUDIO_FILTER_GALLERY_DISTORT_EFFECTS } from "./studio-filter-gallery-distort";

import type { StudioFilterGalleryEffectDef, StudioFilterGalleryImage, StudioFilterGalleryParams } from "./studio-filter-gallery-types";

function find(id: string): StudioFilterGalleryEffectDef {
  const effect = STUDIO_FILTER_GALLERY_DISTORT_EFFECTS.find((candidate) => candidate.id === id);
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

function run(effect: StudioFilterGalleryEffectDef, source: StudioFilterGalleryImage, params: StudioFilterGalleryParams, seed: number): StudioFilterGalleryImage {
  const out = { width: source.width, height: source.height, data: source.data.slice() };
  effect.apply(out, params, { seed, scale: 1 });
  return out;
}

/** FNV-1a 32비트 바이트 지문. */
function fingerprint(data: Uint8ClampedArray): string {
  let hash = 0x811c9dc5;
  for (const byte of data) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const raindrops = find("distort.raindrops");
const glass = find("distort.glass");

describe("필터 갤러리 · 왜곡 리뷰 결함 회귀 — 빗방울 테두리 알파", () => {
  /** 왼쪽 절반은 숨은 색을 가진 완전 투명, 오른쪽 절반은 불투명 빨강인 64×64 그림(물방울 테두리가 경계를 많이 지나게 크게). */
  const halfSprite = (hidden: readonly [number, number, number]): StudioFilterGalleryImage =>
    image(64, 64, (x) => (x >= 32 ? [255, 0, 0, 255] : [...hidden, 0]));
  const params = { dropSize: 30, number: 200, fishEye: 100 };

  it("완전 투명 픽셀의 숨은 RGB 는 보이는 픽셀을 바꾸지 않고 숨은 초록이 테두리로 비치지 않는다", () => {
    const leaks: string[] = [];
    let visible = 0, overTransparent = 0;
    for (const seed of [1, 7, 99, 12345]) {
      const green = run(raindrops, halfSprite([0, 255, 0]), params, seed);
      const black = run(raindrops, halfSprite([0, 0, 0]), params, seed);
      const white = run(raindrops, halfSprite([255, 255, 255]), params, seed);
      for (let offset = 0; offset < green.data.length; offset += 4) {
        const alphas = [green.data[offset + 3], black.data[offset + 3], white.data[offset + 3]];
        if (alphas.every((alpha) => alpha === 0)) continue;
        visible += 1;
        const x = (offset / 4) % 64;
        if (x < 32) overTransparent += 1;
        const [gg, gb, gw] = [green, black, white].map((target) => Array.from(target.data.subarray(offset, offset + 4)).join());
        // 렌즈 하이라이트는 RGB 에 같은 양을 더하므로 빨강 그림에서 초록이 파랑보다 크면 숨은 초록이 샌 것이다.
        const greenExcess = green.data[offset + 1] - green.data[offset + 2];
        if (gg !== gb || gb !== gw || greenExcess > 0) leaks.push(`seed ${seed} (${x}, ${Math.floor(offset / 256)}): ${gg} | ${gb} | ${gw}`);
      }
    }
    // 물방울이 투명 쪽(왼쪽 절반)까지 덮어 그쪽에도 보이는 픽셀이 생긴 상황에서 검사했는지 확인한다(고친 뒤 8161개 중 155개).
    expect(visible).toBeGreaterThan(1000);
    expect(overTransparent).toBeGreaterThan(50);
    expect(leaks).toEqual([]);
  });

  it("불투명·균일 알파 그림은 알파 가중 혼합 전과 바이트까지 같다", () => {
    const patterned = (alpha: number): StudioFilterGalleryImage => image(72, 54, (x, y) => [
      (x * 37 + y * 11 + ((x * y) % 7) * 19) % 256, (x * 7 + y * 29) % 256, (x * 19 + y * 5 + ((x ^ y) % 9) * 23) % 256, alpha,
    ]);
    const cases: readonly (readonly [number, StudioFilterGalleryParams, number, string])[] = [
      [255, {}, 7, "ee8a3170"],
      [255, { dropSize: 30, number: 200, fishEye: 100 }, 7, "e0b0202f"],
      [255, { dropSize: 3, number: 200, fishEye: 0 }, 99, "f4fc9297"],
      [128, { dropSize: 24, number: 80, fishEye: 60 }, 12345, "1eceaa84"],
    ];
    for (const [alpha, caseParams, seed, expected] of cases) {
      const source = patterned(alpha);
      const output = run(raindrops, source, caseParams, seed);
      expect(fingerprint(output.data)).not.toBe(fingerprint(source.data));
      expect(fingerprint(output.data), JSON.stringify({ alpha, caseParams, seed })).toBe(expected);
    }
  });
});

describe("필터 갤러리 · 왜곡 리뷰 결함 회귀 — 유리 테두리 띠", () => {
  const WIDTH = 160, HEIGHT = 120, BAND = 12;

  /** R = x, G = y 좌표 그림에 유리를 적용해, 테두리 띠(BAND px)와 안쪽의 평균 변위 크기(px)를 잰다. */
  function displacement(params: StudioFilterGalleryParams): { border: number; inner: number } {
    const output = run(glass, image(WIDTH, HEIGHT, (x, y) => [x, y, 0, 255]), params, 7);
    let border = 0, borderCount = 0, inner = 0, innerCount = 0;
    for (let y = 0; y < HEIGHT; y += 1) {
      for (let x = 0; x < WIDTH; x += 1) {
        const offset = (y * WIDTH + x) * 4;
        const shift = Math.hypot(output.data[offset] - x, output.data[offset + 1] - y);
        if (x < BAND || y < BAND || x >= WIDTH - BAND || y >= HEIGHT - BAND) {
          border += shift;
          borderCount += 1;
        } else {
          inner += shift;
          innerCount += 1;
        }
      }
    }
    return { border: border / borderCount, inner: inner / innerCount };
  }

  it("매끄러움이 커도 테두리 띠만 통째로 밀리지 않고 안쪽도 같은 세기로 굴절한다", () => {
    for (const params of [
      { texture: "tiny-lens", smoothness: 15, scaling: 50, distortion: 10 },
      { texture: "tiny-lens", smoothness: 15, scaling: 100, distortion: 10 },
      { texture: "canvas", smoothness: 15, scaling: 100, distortion: 10 },
      { texture: "canvas", smoothness: 8, scaling: 50, distortion: 10 },
    ]) {
      const { border, inner } = displacement(params);
      const label = JSON.stringify(params);
      // 고치기 전에는 테두리 띠 평균이 안쪽의 2~4배였고(안쪽은 왜곡의 16~26% 뿐), 고친 뒤에는 둘이 비슷하다.
      expect(border / inner, label).toBeLessThan(1.3);
      expect(inner / params.distortion, label).toBeGreaterThan(0.35);
    }
  });

  it("질감·여백이 늘린 작업량을 질감별 costFor 로 낸다(기본값은 cost 이상, 캔버스가 가장 무겁다)", () => {
    expect(glass.costFor).toBeTypeOf("function");
    const costFor = (params: StudioFilterGalleryParams): number => glass.costFor?.(params) ?? 0;
    expect(costFor({})).toBeGreaterThanOrEqual(glass.cost);
    for (const texture of ["frosted", "blocks", "tiny-lens"]) expect(costFor({ texture: "canvas" }), texture).toBeGreaterThan(costFor({ texture }));
    // 목록 밖 값은 기본 질감(서리)으로 읽는다.
    expect(costFor({ texture: "목록에 없는 값" })).toBe(costFor({ texture: "frosted" }));
  });
});
