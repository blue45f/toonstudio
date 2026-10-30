/**
 * 필터 갤러리 · 기하(왜곡·픽셀화·매핑·가장자리) 슬라이더 무효 칸 회귀 시험.
 * 슬라이더를 한 칸 옮겼는데 그림이 바이트까지 같으면 사용자에게는 아무 일도 없는 칸이다.
 *   - 유리 매끄러움: 높이맵 흐림 반지름 0.6(2)·1.2(3)이 공용 흐림의 최소 상자 1 로 묶여 2 와 3 이 같았다.
 *   - 조각 거리·회전: 사본 이동을 정수 픽셀로 반올림해 기본값(사본 4, 거리 4)에서 회전 360칸 중 328칸, 거리 99칸 중 29칸이
 *     바로 다음 칸과 같았다. 소수 이동은 쌍선형으로 읽는다(정수 이동은 예전과 같은 바이트).
 *   - 종이 타일 이동률: 최대 이동(타일 × 이동률)을 정수로 반올림해 타일 40px 에서 이동률 89칸 중 53칸이 같았다.
 * 고치지 않은 값(유리 매끄러움 1·3 이상, 종이 타일 기본값, 조각 정수 이동)은 고치기 전 커널로 잰 지문과 바이트까지 같아야 한다.
 * 거리 맵 문턱값의 무효 칸은 그림에 그 문턱값 사이의 알파·밝기가 없을 때만 생기는 예상된 결과라(불투명 그림의 알파 기준 등)
 * 알파가 0~255 를 모두 지나는 그림에서 칸마다 결과가 달라지는지만 확인한다.
 */
import { describe, expect, it } from "vitest";

import { STUDIO_FILTER_GALLERY_DISTORT_EFFECTS } from "./studio-filter-gallery-distort";
import { STUDIO_FILTER_GALLERY_EDGE_EFFECTS, STUDIO_FILTER_GALLERY_MAP_EFFECTS } from "./studio-filter-gallery-map-edge";
import { STUDIO_FILTER_GALLERY_PIXELATE_EFFECTS } from "./studio-filter-gallery-pixelate";

import type {
  StudioFilterGalleryEffectDef, StudioFilterGalleryImage, StudioFilterGalleryParamSpec, StudioFilterGalleryParams,
} from "./studio-filter-gallery-types";

type SliderSpec = Extract<StudioFilterGalleryParamSpec, { control: "slider" }>;

const EFFECTS = [
  ...STUDIO_FILTER_GALLERY_DISTORT_EFFECTS, ...STUDIO_FILTER_GALLERY_PIXELATE_EFFECTS,
  ...STUDIO_FILTER_GALLERY_MAP_EFFECTS, ...STUDIO_FILTER_GALLERY_EDGE_EFFECTS,
];

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

/** 슬라이더가 고를 수 있는 모든 값(최소부터 간격마다). 이 그룹의 슬라이더는 모두 정수 간격이다. */
function sliderValues(spec: SliderSpec): number[] {
  const values: number[] = [];
  for (let value = spec.min; value <= spec.max; value += spec.step) values.push(value);
  return values;
}

function defaultsOf(effect: StudioFilterGalleryEffectDef): StudioFilterGalleryParams {
  return Object.fromEntries(effect.params.map((spec) => [spec.key, spec.default]));
}

function render(effect: StudioFilterGalleryEffectDef, image: StudioFilterGalleryImage, params: StudioFilterGalleryParams): Uint8ClampedArray {
  const copy = { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
  effect.apply(copy, params, { seed: 11, scale: 1 });
  return copy.data;
}

const sameBytes = (left: Uint8ClampedArray, right: Uint8ClampedArray): boolean => left.every((value, index) => value === right[index]);

/** 슬라이더 전 칸을 훑어 바로 다음 칸과 같은 그림을 내는 값들을 돌려준다(빈 배열이면 무효 칸이 없다). */
function identicalNeighbours(effect: StudioFilterGalleryEffectDef, key: string, image: StudioFilterGalleryImage, overrides: StudioFilterGalleryParams = {}): number[] {
  const values = sliderValues(sliderOf(effect, key));
  const base = { ...defaultsOf(effect), ...overrides };
  const dead: number[] = [];
  let previous = render(effect, image, { ...base, [key]: values[0] ?? 0 });
  for (let index = 1; index < values.length; index += 1) {
    const current = render(effect, image, { ...base, [key]: values[index] ?? 0 });
    if (sameBytes(previous, current)) dead.push(values[index - 1] ?? 0);
    previous = current;
  }
  return dead;
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

/** 사진형 그림: 대각 그라데이션, 결정적 잡음(±20), 또렷한 노란 원판과 어두운 사선(가장자리). 불투명이다. */
function scene(width: number, height: number): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const h = Math.imul((x * 374761393 + y * 668265263) | 0, 1274126177);
      const noise = (((h ^ (h >>> 16)) >>> 0) / 4294967296 - 0.5) * 40, t = (x / width + y / height) / 2;
      let rgb = [30 + 200 * t + noise, 60 + 150 * (1 - t) + noise, 90 + 120 * t - noise];
      if ((x - width * 0.35) ** 2 + (y - height * 0.5) ** 2 < (height * 0.25) ** 2) rgb = [235, 220, 90];
      if (Math.abs(x - y * 1.3 - width * 0.2) < 2) rgb = [20, 18, 30];
      data.set([rgb[0] ?? 0, rgb[1] ?? 0, rgb[2] ?? 0, 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

/** 투명 바탕 위 안티에일리어스 원판(테두리 알파가 0~255 를 지난다). 완전 투명 픽셀의 숨은 RGB 는 hidden 이다. */
function sprite(width: number, height: number, hidden: readonly [number, number, number]): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const coverage = Math.max(0, Math.min(1, height * 0.3 - Math.hypot(x + 0.5 - width / 2, y + 0.5 - height / 2)));
      const offset = (y * width + x) * 4;
      if (coverage <= 0) data.set([hidden[0], hidden[1], hidden[2], 0], offset);
      else data.set([200 - x, 60 + y, 120, Math.round(coverage * 255)], offset);
    }
  }
  return { width, height, data };
}

/** 숨은 RGB 만 다른 두 결과에서 알파나 보이는 픽셀의 RGB 가 다른 픽셀 수. */
function hiddenRgbLeaks(black: Uint8ClampedArray, green: Uint8ClampedArray): number {
  let leaks = 0;
  for (let offset = 0; offset < black.length; offset += 4) {
    if (black[offset + 3] !== green[offset + 3]) leaks += 1;
    else if ((black[offset + 3] ?? 0) > 0 && [0, 1, 2].some((channel) => black[offset + channel] !== green[offset + channel])) leaks += 1;
  }
  return leaks;
}

describe("유리 · 매끄러움 슬라이더", () => {
  const glass = effectById("distort.glass");
  const image = scene(96, 72);

  it("질감마다 매끄러움 1~15 의 이웃 칸이 모두 다른 그림을 낸다(공용 흐림 최소 상자에 묶인 2 = 3 칸이 없다)", () => {
    for (const texture of ["frosted", "blocks", "canvas"]) {
      expect(identicalNeighbours(glass, "smoothness", image, { texture }), texture).toEqual([]);
    }
    // 작은 렌즈는 7px 주기 격자라 비율 100% 에서 흐림이 한 주기를 넘으면(매끄러움 7 이상) 3회 7탭 상자가 격자를 통째로 지워 기본
    // 주파수만 남고, RMS 정규화가 세기를 되돌려 7~9·10~12 칸은 부동소수 잡음만큼만 다르다. 반올림 결함이 아니라 주기 질감을 주기보다
    // 넓게 흐린 결과라, 주기가 상자 폭과 맞지 않는 비율 150% 에서는 전 범위를, 100% 에서는 주기 안쪽(1~7)을 본다.
    expect(identicalNeighbours(glass, "smoothness", image, { texture: "tiny-lens", scaling: 150 })).toEqual([]);
    expect(identicalNeighbours(glass, "smoothness", image, { texture: "tiny-lens" }).filter((value) => value < 7)).toEqual([]);
  });

  it("매끄러움 1·3(기본값)·15 는 고치기 전과 바이트까지 같다", () => {
    const cases: readonly (readonly [StudioFilterGalleryParams, string])[] = [
      [{ smoothness: 1 }, "2bc05b7d"],
      [{}, "d67a79a2"],
      [{ smoothness: 15, texture: "tiny-lens" }, "f385aae6"],
    ];
    for (const [params, expected] of cases) expect(fingerprint(render(glass, image, { ...defaultsOf(glass), ...params })), JSON.stringify(params)).toBe(expected);
  });
});

describe("조각 · 거리·회전 슬라이더", () => {
  const fragment = effectById("pixelate.fragment");
  const image = scene(96, 72);

  it("거리 1~100 의 이웃 칸이 모두 다른 그림을 낸다(사본 이동을 정수로 반올림하지 않는다)", () => {
    expect(identicalNeighbours(fragment, "distance", image)).toEqual([]);
    expect(identicalNeighbours(fragment, "distance", image, { count: 2, rotation: 30 })).toEqual([]);
  });

  it("회전 0~360° 의 이웃 칸이 모두 다른 그림을 낸다(거리 4·1 에서도)", () => {
    expect(identicalNeighbours(fragment, "rotation", image)).toEqual([]);
    expect(identicalNeighbours(fragment, "rotation", image, { distance: 1 })).toEqual([]);
  });

  it("정수 이동(회전 0°)은 고치기 전과 바이트까지 같고, 소수 이동도 투명 픽셀의 숨은 RGB 를 보이는 픽셀로 옮기지 않는다", () => {
    expect(fingerprint(render(fragment, image, { count: 4, distance: 4, rotation: 0 }))).toBe("b0552a98");
    for (const params of [defaultsOf(fragment), { count: 16, distance: 9, rotation: 7 }]) {
      const black = render(fragment, sprite(64, 48, [0, 0, 0]), params), green = render(fragment, sprite(64, 48, [0, 255, 0]), params);
      expect(hiddenRgbLeaks(black, green), JSON.stringify(params)).toBe(0);
    }
  });
});

describe("종이 타일 · 이동률 슬라이더", () => {
  const paperTile = effectById("map.paper-tile");
  const image = scene(256, 192);

  it("타일 40(기본값)·20·5px 에서 이동률 1~90% 의 이웃 칸이 모두 다른 그림을 낸다(최대 이동을 정수로 반올림하지 않는다)", () => {
    for (const tileSize of [40, 20, 5]) expect(identicalNeighbours(paperTile, "moveRate", image, { tileSize }), `타일 ${tileSize}`).toEqual([]);
  });

  it("기본값(최대 이동이 정수 10px)은 배경마다 고치기 전과 바이트까지 같다", () => {
    const expected = { inverted: "a18ae7f3", transparent: "99b0237a", color: "30add446" };
    for (const [background, print] of Object.entries(expected)) {
      expect(fingerprint(render(paperTile, image, { ...defaultsOf(paperTile), background })), background).toBe(print);
    }
  });
});

describe("거리 맵 · 문턱값 슬라이더(예상된 무효 칸)", () => {
  const distanceMap = effectById("edge.distance-map");

  it("알파·밝기가 0~255 를 모두 지나는 그림에서는 문턱값 0~255 의 이웃 칸이 모두 다른 그림을 낸다", () => {
    // 위아래 줄은 휘도가 x + 0.114(파랑만 1 높다)인 불투명 띠, 가운데 줄은 알파가 x 인 띠다. 문턱값 t 와 t + 1 사이에 늘 값이 있다.
    const width = 256, height = 6, data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) data.set(y === 0 || y === height - 1 ? [x, x, x + 1, 255] : [x, x, x, x], (y * width + x) * 4);
    }
    const ramp = { width, height, data };
    expect(identicalNeighbours(distanceMap, "threshold", ramp)).toEqual([]);
    expect(identicalNeighbours(distanceMap, "threshold", ramp, { source: "luma", metric: "chebyshev" })).toEqual([]);
  });
});
