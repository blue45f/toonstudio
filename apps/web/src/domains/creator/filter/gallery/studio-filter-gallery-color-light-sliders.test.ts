import { describe, expect, it } from "vitest";

import { STUDIO_FILTER_GALLERY_COLOR_EFFECTS } from "./studio-filter-gallery-color";
import { STUDIO_FILTER_GALLERY_LIGHT_EFFECTS } from "./studio-filter-gallery-light-decor";
import { normalizeStudioFilterGalleryParams } from "./studio-filter-gallery-registry";

import type {
  StudioFilterGalleryEffectDef, StudioFilterGalleryImage, StudioFilterGalleryParamSpec, StudioFilterGalleryParams,
} from "./studio-filter-gallery-types";

/**
 * 색·빛 그룹 슬라이더 무효 칸 회귀 시험. 슬라이더를 한 칸 옮겼는데 그림이 바이트까지 같으면 사용자에게는 아무 일도 없는 칸이다.
 *   - 분할 토닝 균형: 예전 ±100 범위는 기준 밝기(pivot)를 0.05~0.95 에 붙여 ±90~±100 의 20칸이 같은 그림이었다.
 *   - 반짝임 밝기 기준: 정수 휘도 단계로만 자른 분위수(한 단계에 픽셀이 몰리면 여러 칸이 같은 단계)와, 남는 칸이 광원 상한보다
 *     많을 때 가장 밝은 칸만 남기던 선택(기준을 내려도 같은 광원) 때문에 기준 0.5% 칸 대부분이 같은 그림이었다.
 *   - 긴 그림자 길이(끝 처리 "유한"): 주축 걸음 수를 반올림해 대각선에서 길이 칸 셋 중 하나가 같은 그림이었다.
 */

type SliderSpec = Extract<StudioFilterGalleryParamSpec, { control: "slider" }>;

const EFFECTS = [...STUDIO_FILTER_GALLERY_COLOR_EFFECTS, ...STUDIO_FILTER_GALLERY_LIGHT_EFFECTS];

function effectById(id: string): StudioFilterGalleryEffectDef {
  const found = EFFECTS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`효과 없음: ${id}`);
  return found;
}

function sliderOf(effect: StudioFilterGalleryEffectDef, key: string): SliderSpec {
  const spec = effect.params.find((candidate) => candidate.key === key);
  if (!spec || spec.control !== "slider") throw new Error(`슬라이더 없음: ${effect.id}.${key}`);
  return spec;
}

/** 슬라이더가 고를 수 있는 모든 값(최소부터 간격마다, 간격의 소수 자릿수로 반올림). */
function sliderValues(spec: SliderSpec): number[] {
  const decimals = Math.min(6, (String(spec.step).split(".")[1] ?? "").length);
  const values: number[] = [];
  for (let step = 0; ; step += 1) {
    const value = Number((spec.min + step * spec.step).toFixed(decimals));
    if (value > spec.max) break;
    values.push(value);
  }
  return values;
}

function defaultsOf(effect: StudioFilterGalleryEffectDef): StudioFilterGalleryParams {
  return Object.fromEntries(effect.params.map((spec) => [spec.key, spec.default]));
}

function render(effect: StudioFilterGalleryEffectDef, image: StudioFilterGalleryImage, params: StudioFilterGalleryParams): Uint8ClampedArray {
  const copy = { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
  effect.apply(copy, params, { seed: 7, scale: 1 });
  return copy.data;
}

const sameBytes = (left: Uint8ClampedArray, right: Uint8ClampedArray): boolean => left.every((value, index) => value === right[index]);

/** 슬라이더 전 칸을 훑어 바로 다음 칸과 같은 그림을 내는 값들을 돌려준다(빈 배열이면 무효 칸이 없다). */
function identicalNeighbours(effect: StudioFilterGalleryEffectDef, key: string, image: StudioFilterGalleryImage, overrides: StudioFilterGalleryParams = {}): number[] {
  const values = sliderValues(sliderOf(effect, key));
  const base = { ...defaultsOf(effect), ...overrides };
  const outputs = values.map((value) => render(effect, image, { ...base, [key]: value }));
  return values.slice(0, -1).filter((_, index) => sameBytes(outputs[index]!, outputs[index + 1]!));
}

/** 휘도 0~255 를 한 픽셀씩 지나는 띠 세 줄(회색, 붉은 기, 푸른 기). */
function lumaRamp(): StudioFilterGalleryImage {
  const width = 256, height = 3, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tint = (y - 1) * 12;
      data.set([x + tint, x, x - tint, 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

/** 셀 채색 그림: 납작한 하늘·얼굴(밝은 면과 그림자 면)·머리카락·옷(두 톤)과 1px 남짓한 외곽선, 머리카락의 흰 하이라이트. */
function celShaded(width: number, height: number): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = x / width, v = y / height;
      const face = (u - 0.5) ** 2 / 0.09 + (v - 0.45) ** 2 / 0.12, hair = (u - 0.5) ** 2 / 0.12 + (v - 0.2) ** 2 / 0.04;
      let rgb = [150, 200, 235];
      if (v > 0.75) rgb = u + v > 1.35 ? [40, 95, 170] : [60, 130, 210];
      if (face < 1) rgb = u > 0.55 ? [228, 190, 170] : [252, 224, 204];
      if (hair < 1) rgb = (u - 0.42) ** 2 + (v - 0.15) ** 2 < 0.002 ? [255, 255, 255] : [92, 62, 140];
      if (Math.abs(face - 1) < 0.06 || Math.abs(hair - 1) < 0.08) rgb = [25, 20, 30];
      data.set([rgb[0]!, rgb[1]!, rgb[2]!, 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

/** 결정적 잡음(±20)이 섞인 대각 그라데이션(사진형). */
function noisyGradient(width: number, height: number): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let h = (x * 374761393 + y * 668265263 + 3 * 2147483647) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      const noise = (((h ^ (h >>> 16)) >>> 0) / 4294967296 - 0.5) * 40, t = (x / width + y / height) / 2;
      data.set([30 + 210 * t + noise, 40 + 190 * t + noise, 60 + 150 * t + noise, 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

describe("분할 토닝 · 균형 슬라이더", () => {
  const splitToning = effectById("color.split-toning");

  it("범위 안 모든 이웃 칸이 서로 다른 그림을 낸다(기준 밝기 끝에 붙어 같은 그림이 되는 칸이 없다)", () => {
    expect(identicalNeighbours(splitToning, "balance", lumaRamp())).toEqual([]);
    expect(identicalNeighbours(splitToning, "balance", lumaRamp(), { highlightSaturation: 10, shadowSaturation: 10 })).toEqual([]);
  });

  it("예전 범위 끝(±91~±100)으로 저장된 값은 ±90 으로 정규화되고 예전과 같은 그림이 된다", () => {
    expect(normalizeStudioFilterGalleryParams(splitToning, { balance: 100 }).balance).toBe(90);
    expect(normalizeStudioFilterGalleryParams(splitToning, { balance: -97 }).balance).toBe(-90);
    const ramp = lumaRamp(), base = defaultsOf(splitToning);
    expect(render(splitToning, ramp, { ...base, balance: 100 })).toEqual(render(splitToning, ramp, { ...base, balance: 90 }));
    expect(render(splitToning, ramp, { ...base, balance: -100 })).toEqual(render(splitToning, ramp, { ...base, balance: -90 }));
  });
});

describe("반짝임 · 밝기 기준 슬라이더", () => {
  const sparkle = effectById("light.sparkle");

  it("셀 채색처럼 한 밝기 단계에 픽셀이 몰린 그림에서도 기준 0.5% 마다 결과가 바뀐다", () => {
    expect(identicalNeighbours(sparkle, "threshold", celShaded(160, 120), { spikeLength: 8 })).toEqual([]);
  });

  it("남는 칸이 광원 상한보다 많아도(빛살 4px → 2px 칸 3072개) 기준을 내리면 결과가 바뀐다", () => {
    expect(identicalNeighbours(sparkle, "threshold", noisyGradient(128, 96), { spikeLength: 4 })).toEqual([]);
  });

  it("기본 매개변수(빛살 20px)로 셀 채색 그림을 훑어도 같은 그림을 내는 이웃 칸이 없다", () => {
    expect(identicalNeighbours(sparkle, "threshold", celShaded(320, 240))).toEqual([]);
  });
});

describe("긴 그림자 · 길이 슬라이더", () => {
  const longShadow = effectById("light.long-shadow");

  /** 투명 바탕 왼쪽 위의 불투명 원. 길이 200 의 그림자도 45°·30° 모두 그림 안에서 끝난다. */
  function discOnTransparent(): StudioFilterGalleryImage {
    const width = 240, height = 200, data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) if ((x + 0.5 - 30) ** 2 + (y + 0.5 - 30) ** 2 < 10 ** 2) data.set([200, 120, 40, 255], (y * width + x) * 4);
    }
    return { width, height, data };
  }

  it("끝 처리 \"유한\"은 대각선 방향에서도 길이 1px 마다 그림자 끝이 바뀐다", () => {
    for (const angle of [45, 30]) {
      expect(identicalNeighbours(longShadow, "length", discOnTransparent(), { style: "finite", angle }), `${angle}°`).toEqual([]);
    }
  });
});
