/**
 * 필터 갤러리 · 스케치 적대적 리뷰 결함 회귀 시험.
 *   - 알파 가중 휘도: 흐림 창(반지름 0.8 이면 3px) 밖 완전 투명 영역을 0(검정)으로 두었다. 그보다 멀리 닿는 뒤 단계가
 *     보이지 않는 검은 영역을 형태로 읽었다 — 석고는 덩어리 음영, 목탄은 번짐·윤곽 잉크, 찢긴 가장자리는 표본 이동으로 잉크
 *     뒤집힘, 메모지는 구멍 요철을 보이는 픽셀에 남겼다.
 *   - 물 종이: 표본 수가 짝수면 가운데 픽셀을 읽지 않아, 표본이 모두 투명 픽셀에 떨어진 가는 선의 보이는 픽셀을 건너뛰었다.
 *     표본이 알파 1 짜리 희미한 가장자리에만 닿으면 거의 불투명한 선이 그 가장자리의 양자화된 색으로 통째로 바뀌었다.
 *   - 2차 리뷰: 당기기·밀기 피라미드 채움은 국소적이지 않아, 톤이 여러 개인 투명 레이어에서 먼 검은 선이 밝은 선 옆
 *     빈칸으로 내려와 목탄·석고가 밝은 획을 어둡게 칠했고, 1px 평행 이동에 따라 석고 결과가 출렁였다.
 * 효과 시험(석고·목탄·찢긴 가장자리·메모지)의 기준은 "같은 모양을 불투명 흰 바탕에 그린 그림"이다. 흰 모양의 바깥이
 * 투명이든 흰색이든 보이는 픽셀은 같아야 한다.
 */
import { describe, expect, it } from "vitest";

import { gaussianPlane, luma } from "./studio-filter-gallery-kernel-utils";
import { STUDIO_FILTER_GALLERY_SKETCH_EFFECTS, alphaWeightedLuma } from "./studio-filter-gallery-sketch";

import type {
  StudioFilterGalleryEffectDef,
  StudioFilterGalleryImage,
  StudioFilterGalleryParamValue,
  StudioFilterGalleryParams,
} from "./studio-filter-gallery-types";

const BLACK_ON_WHITE = { inkColor: "#000000", paperColor: "#ffffff" } as const;

function find(id: string): StudioFilterGalleryEffectDef {
  const effect = STUDIO_FILTER_GALLERY_SKETCH_EFFECTS.find((candidate) => candidate.id === id);
  if (!effect) throw new Error(`효과 없음: ${id}`);
  return effect;
}

function defaults(effect: StudioFilterGalleryEffectDef): Record<string, StudioFilterGalleryParamValue> {
  return Object.fromEntries(effect.params.map((spec) => [spec.key, spec.default]));
}

function image(width: number, height: number, pixel: (x: number, y: number) => readonly number[]): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) data.set(pixel(x, y), (y * width + x) * 4);
  }
  return { width, height, data };
}

function run(effect: StudioFilterGalleryEffectDef, source: StudioFilterGalleryImage, params: StudioFilterGalleryParams): StudioFilterGalleryImage {
  const out = { width: source.width, height: source.height, data: source.data.slice() };
  effect.apply(out, params, { seed: 20261029, scale: 1 });
  return out;
}

/** 흰 모양(inside)을 그린 64×64 그림. 바깥은 투명(RGB 는 쓰레기 값)이거나 불투명 흰색이다. */
function whiteShape(inside: (x: number, y: number) => boolean, outside: "transparent" | "white"): StudioFilterGalleryImage {
  return image(64, 64, (x, y) => (inside(x, y) || outside === "white" ? [255, 255, 255, 255] : [17, 200, 99, 0]));
}

const SHAPES: readonly (readonly [string, (x: number, y: number) => boolean])[] = [
  ["반지름 22 원판", (x, y) => Math.hypot(x - 31.5, y - 31.5) < 22],
  ["1px 세로 획", (x) => x === 30],
  ["3px 세로 획", (x) => x >= 30 && x < 33],
  ["3px 가로 획", (_x, y) => y >= 30 && y < 33],
];

/** 투명 바탕 위 흰 모양과 불투명 흰 바탕 위 같은 모양의 결과에서, 모양 픽셀(보이는 픽셀) RGB 차이의 최댓값. */
function maxVisibleDiffAgainstOpaque(effect: StudioFilterGalleryEffectDef, params: StudioFilterGalleryParams, inside: (x: number, y: number) => boolean): number {
  const layered = run(effect, whiteShape(inside, "transparent"), params);
  const opaque = run(effect, whiteShape(inside, "white"), params);
  let max = 0;
  for (let offset = 0; offset < layered.data.length; offset += 4) {
    if (layered.data[offset + 3] === 0) continue;
    for (let channel = 0; channel < 3; channel += 1) max = Math.max(max, Math.abs(layered.data[offset + channel] - opaque.data[offset + channel]));
  }
  return max;
}

describe("필터 갤러리 · 스케치 리뷰 결함 회귀", () => {
  it("알파 가중 휘도는 흐림 창 밖 투명 영역을 실루엣 바로 바깥 값의 연장으로 채우고 덮인 픽셀 값은 바꾸지 않는다", () => {
    // 구석의 명암 덩어리(휘도 약 60~200), 밝은 속(230)을 어두운 윤곽(30)이 두른 원판, 불투명 그림. 투명 픽셀엔 쓰레기 RGB.
    const blob = image(48, 40, (x, y) => (x < 14 && y < 12 ? [60 + x * 10, 70 + y * 9, 80, 255] : [255, 0, 255, 0]));
    const outlined = image(48, 48, (x, y) => {
      const distance = Math.hypot(x - 23.5, y - 23.5);
      return distance < 12 ? [230, 230, 230, 255] : distance < 14 ? [30, 30, 30, 255] : [255, 255, 255, 0];
    });
    const opaque = image(31, 17, (x, y) => [(x * 37 + y * 11) % 256, (x * x + y * 7) % 256, (x * y) % 256, 255]);
    for (const [source, radius] of [[blob, 0.8], [blob, 2.5], [outlined, 0.8], [opaque, 0.8], [opaque, 4]] as const) {
      const { width, height, data } = source;
      const plane = alphaWeightedLuma(source, radius);
      // 기준: 휘도×알파와 알파를 따로 흐려 나눈 값. 흐림 창 안(weight > 1e-4)은 이 값과 정확히 같아야 한다 —
      // 불투명 그림은 모든 픽셀이 여기에 들어가므로 결과가 채움 도입 전과 바이트까지 같다.
      const premultiplied = new Float32Array(width * height), weight = new Float32Array(width * height);
      for (let index = 0; index < weight.length; index += 1) {
        weight[index] = data[index * 4 + 3] / 255;
        premultiplied[index] = luma(data[index * 4], data[index * 4 + 1], data[index * 4 + 2]) * weight[index];
      }
      gaussianPlane(weight, width, height, radius);
      gaussianPlane(premultiplied, width, height, radius);
      let ringLow = Number.POSITIVE_INFINITY, ringHigh = Number.NEGATIVE_INFINITY, uncovered = 0;
      for (let index = 0; index < plane.length; index += 1) {
        if (weight[index] <= 1e-4) {
          uncovered += 1;
          continue;
        }
        expect(plane[index]).toBe(Math.fround(premultiplied[index] / weight[index]));
        if (data[index * 4 + 3] > 0) continue;
        ringLow = Math.min(ringLow, plane[index]);
        ringHigh = Math.max(ringHigh, plane[index]);
      }
      expect(uncovered > 0).toBe(source !== opaque);
      // 흐림 창 밖 빈칸은 0(검정)도, 그림 속 색의 평균(어두운 윤곽 바깥이 밝아지는 후광)도 아니라 흐림 창 안 투명
      // 테두리 값(실루엣 바로 바깥으로 연장된 값)의 범위 안에 있다.
      for (let index = 0; index < plane.length; index += 1) {
        if (weight[index] > 1e-4) continue;
        expect(plane[index]).toBeGreaterThanOrEqual(ringLow - 0.5);
        expect(plane[index]).toBeLessThanOrEqual(ringHigh + 0.5);
      }
    }
    // 덮인 픽셀이 하나도 없으면 채울 값이 없으므로 0 이다.
    expect(Array.from(alphaWeightedLuma(image(9, 7, () => [200, 200, 200, 0]), 1.5))).toEqual(new Array(63).fill(0));
  });

  it("석고는 투명 바탕 위 흰 모양에 보이지 않는 영역의 덩어리 음영을 드리우지 않는다", () => {
    const plaster = find("sketch.plaster");
    for (const smoothness of [2, 8, 15]) {
      for (const [label, inside] of SHAPES) {
        const diff = maxVisibleDiffAgainstOpaque(plaster, { ...defaults(plaster), ...BLACK_ON_WHITE, smoothness }, inside);
        expect(diff, `매끄러움 ${smoothness} · ${label}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it("목탄은 투명 바탕 위 흰 모양 가장자리를 번짐·윤곽 잉크로 어둡게 칠하지 않는다", () => {
    const charcoal = find("sketch.charcoal");
    for (const charcoalThickness of [3, 7]) {
      for (const detail of [2, 5]) {
        for (const [label, inside] of SHAPES) {
          const diff = maxVisibleDiffAgainstOpaque(charcoal, { ...defaults(charcoal), ...BLACK_ON_WHITE, charcoalThickness, detail }, inside);
          expect(diff, `굵기 ${charcoalThickness} · 세부 ${detail} · ${label}`).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it("찢긴 가장자리는 투명 바탕 위 흰 모양의 보이는 픽셀을 잉크로 뒤집지 않는다", () => {
    const torn = find("sketch.torn-edges");
    for (const smoothness of [1, 6]) {
      for (const [label, inside] of SHAPES) {
        const diff = maxVisibleDiffAgainstOpaque(torn, { ...defaults(torn), ...BLACK_ON_WHITE, smoothness, contrast: 1 }, inside);
        expect(diff, `매끄러움 ${smoothness} · ${label}`).toBe(0);
      }
    }
  });

  it("메모지는 투명 바탕 위 흰 모양 둘레에 보이지 않는 구멍의 요철을 새기지 않는다", () => {
    const notePaper = find("sketch.note-paper");
    for (const relief of [11, 25]) {
      for (const [label, inside] of SHAPES) {
        const diff = maxVisibleDiffAgainstOpaque(notePaper, { ...defaults(notePaper), ...BLACK_ON_WHITE, relief }, inside);
        expect(diff, `부조 ${relief} · ${label}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it("물 종이는 표본이 모두 투명 픽셀에 떨어진 1px 선화의 보이는 픽셀도 건너뛰지 않고 변환한다", () => {
    const water = find("sketch.water-paper");
    // 섬유 길이 15(기본, 표본 4개)·22(표본 6개)는 짝수 표본이라 가운데 픽셀을 읽지 않는다. 바탕은 캔버스 관례대로 RGB 0 투명.
    const grid = (rgb: readonly number[]) => image(64, 64, (x, y) => (x % 8 === 3 || y % 8 === 5 ? [...rgb, 255] : [0, 0, 0, 0]));
    for (const fiberLength of [15, 22]) {
      // 밝기 100·대비 0 이면 검은 선의 모든 보이는 픽셀은 (0 − 128)·0.4 + 128 + 80 = 156.8 에 섬유 결(0.82~1.18)을 곱한 값이다.
      const lifted = run(water, grid([0, 0, 0]), { ...defaults(water), fiberLength, brightness: 100, contrast: 0 });
      // 기본 밝기·대비에서도 원래 색(60, 120, 200)이 그대로 남은 보이는 픽셀이 없어야 한다.
      const tinted = run(water, grid([60, 120, 200]), { ...defaults(water), fiberLength });
      let visible = 0, outOfRange = 0, untouched = 0;
      for (let offset = 0; offset < lifted.data.length; offset += 4) {
        if (lifted.data[offset + 3] === 0) continue;
        visible += 1;
        if (lifted.data[offset] < 120 || lifted.data[offset] > 195) outOfRange += 1;
        if (tinted.data[offset] === 60 && tinted.data[offset + 1] === 120 && tinted.data[offset + 2] === 200) untouched += 1;
      }
      expect(visible).toBe(960);
      expect(outOfRange, `섬유 길이 ${fiberLength}`).toBe(0);
      expect(untouched, `섬유 길이 ${fiberLength}`).toBe(0);
    }
  });

  /** 투명 바탕에 흰 1px 세로선(x=20, y 10~49)과 검은 1px 가로선(y=30, x 5~44)이 (ox, oy) 만큼 옮겨져 교차하는 선화. */
  function crossingLines(ox: number, oy: number, size = 64): StudioFilterGalleryImage {
    return image(size, size, (x, y) => {
      const u = x - ox, v = y - oy;
      if (u === 20 && v >= 10 && v < 50) return [255, 255, 255, 255];
      if (v === 30 && u >= 5 && u < 45) return [0, 0, 0, 255];
      return [0, 0, 0, 0];
    });
  }

  it("톤이 여러 개인 투명 레이어에서 먼 검은 선이 밝은 선을 어둡게 하지 않는다(목탄·석고)", () => {
    const whiteAlone = image(64, 64, (x, y) => (x === 20 && y >= 10 && y < 50 ? [255, 255, 255, 255] : [0, 0, 0, 0]));
    const cases: readonly (readonly [string, StudioFilterGalleryParams])[] = [
      ["sketch.charcoal", { ...defaults(find("sketch.charcoal")), ...BLACK_ON_WHITE, charcoalThickness: 3 }],
      ["sketch.charcoal", { ...defaults(find("sketch.charcoal")), ...BLACK_ON_WHITE, charcoalThickness: 7 }],
      ["sketch.plaster", { ...defaults(find("sketch.plaster")), ...BLACK_ON_WHITE, imageBalance: 45, smoothness: 8 }],
    ];
    for (const [id, params] of cases) {
      const crossing = run(find(id), crossingLines(0, 0), params);
      const alone = run(find(id), whiteAlone, params);
      // 교차점(20, 30)에서 15~20px 떨어진 흰 선 픽셀은 흰 선만 있는 그림과 같아야 한다(예전 목탄 굵기 7 은 120 단계쯤 어두웠다).
      for (let y = 10; y < 16; y += 1) {
        const offset = (y * 64 + 20) * 4;
        expect([...crossing.data.subarray(offset, offset + 3)], `${id} ${JSON.stringify(params)} y=${y}`)
          .toEqual([...alone.data.subarray(offset, offset + 3)]);
      }
    }
  });

  it("투명 영역 채움은 그림을 옮기거나 투명 여백을 늘려도 보이는 결과를 바꾸지 않는다(석고)", () => {
    const plaster = find("sketch.plaster");
    for (const smoothness of [2, 8, 15]) {
      const params = { ...defaults(plaster), ...BLACK_ON_WHITE, smoothness };
      const base = run(plaster, crossingLines(0, 0), params);
      const shifted = run(plaster, crossingLines(1, 1), params);
      const padded = run(plaster, crossingLines(0, 0, 97), params);
      for (let y = 0; y < 63; y += 1) {
        for (let x = 0; x < 63; x += 1) {
          const offset = (y * 64 + x) * 4;
          if (base.data[offset + 3] === 0) continue;
          const moved = ((y + 1) * 64 + x + 1) * 4;
          expect(shifted.data[moved], `매끄러움 ${smoothness} 이동 (${x}, ${y})`).toBe(base.data[offset]);
          expect(padded.data[(y * 97 + x) * 4], `매끄러움 ${smoothness} 여백 (${x}, ${y})`).toBe(base.data[offset]);
        }
      }
    }
  });

  it("물 종이는 표본이 희미한 가장자리에만 닿아도 거의 불투명한 선을 그 가장자리 색으로 바꾸지 않는다", () => {
    const water = find("sketch.water-paper");
    // 불투명 1px 선 (60,120,200) 양옆에 캔버스가 미리 곱한 8비트로 저장했다 되돌린 알파 1 픽셀((0,0,255))이 있다.
    const fringed = image(64, 64, (x) => (x === 30 ? [60, 120, 200, 255] : x === 29 || x === 31 ? [0, 0, 255, 1] : [0, 0, 0, 0]));
    const clean = image(64, 64, (x) => (x === 30 ? [60, 120, 200, 255] : [0, 0, 0, 0]));
    for (const fiberLength of [15, 22, 30, 40]) {
      const params = { ...defaults(water), fiberLength };
      const withFringe = run(water, fringed, params);
      const without = run(water, clean, params);
      for (let y = 0; y < 64; y += 1) {
        const offset = (y * 64 + 30) * 4;
        for (let channel = 0; channel < 3; channel += 1) {
          // 알파 1 가장자리는 선 색을 1/255 남짓만 흔들 수 있다(예전에는 선 픽셀 절반이 (0,0,255)로 칠해져 150 단계 달랐다).
          expect(Math.abs(withFringe.data[offset + channel] - without.data[offset + channel]), `섬유 ${fiberLength} y=${y}`)
            .toBeLessThanOrEqual(3);
        }
      }
    }
  });
});
