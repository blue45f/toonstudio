/**
 * 필터 갤러리 · 렌더 계열 슬라이더 무효 칸 회귀 시험. 슬라이더를 한 칸 옮겼는데 그림이 바이트까지 같으면 사용자에게는 아무 일도 없는 칸이다.
 *   - 플라스마 난류: 거칠기 지수 1/난류 를 다시 [0.15, 3] 으로 잘라, 난류 0.1·0.2·0.3 칸(지수 3)과 6.7·6.8·6.9·7 칸(지수 0.15)이
 *     그림 크기·내용과 상관없이 같은 무늬를 냈다. 이제 지수는 1/난류 그대로([1/7, 10])라 칸마다 다르고, 난류 0.4~6.6 은 예전과 같다.
 * 아래 두 슬라이더의 무효 칸은 결함이 아니라 그림 크기·화면 내용 때문이라 고치지 않았다. 그 근거를 보호 시험으로 고정한다.
 *   - 섬유 길이: 결 반지름 2.5 × strength(px)가 그림 높이를 넘으면 높이로 잘린다(128×96 에서는 39 이상이 같은 그림). 높이가
 *     160px(= 2.5 × 최대 64) 이상이면 64칸이 모두 다르다.
 *   - 프랙털 반복 횟수: 한도를 L 에서 L + 1 로 올리면 반복 L 에서 새로 탈출하는 픽셀만 바뀐다. 그런 픽셀이 화면에 없는 칸은 같은
 *     그림이 맞다(512×384 만델브로 확대 1 에서 496칸 중 249칸, 1024×768 확대 4 에서 0칸).
 */
import { describe, expect, it } from "vitest";

import { STUDIO_FILTER_GALLERY_RENDER_EFFECTS as EFFECTS } from "./studio-filter-gallery-render";

import type {
  StudioFilterGalleryEffectDef, StudioFilterGalleryImage, StudioFilterGalleryParamSpec, StudioFilterGalleryParams,
} from "./studio-filter-gallery-types";

type SliderSpec = Extract<StudioFilterGalleryParamSpec, { control: "slider" }>;

const WIDTH = 64, HEIGHT = 48;
const BLENDS = ["replace", "multiply", "screen", "overlay", "soft-light"] as const;

function effectById(id: string): StudioFilterGalleryEffectDef {
  const found = EFFECTS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`효과 없음: ${id}`);
  return found;
}

/** 슬라이더가 고를 수 있는 모든 값(최소부터 간격마다, 저장 문서 정규화처럼 간격의 소수 자릿수로 반올림). */
function sliderValues(effect: StudioFilterGalleryEffectDef, key: string): number[] {
  const spec = effect.params.find((candidate): candidate is SliderSpec => candidate.key === key && candidate.control === "slider");
  if (!spec) throw new Error(`슬라이더 없음: ${effect.id}.${key}`);
  const decimals = Math.min(6, (String(spec.step).split(".")[1] ?? "").length);
  const values: number[] = [];
  for (let step = 0; ; step += 1) {
    const value = Number((spec.min + step * spec.step).toFixed(decimals));
    if (value > spec.max) break;
    values.push(value);
  }
  return values;
}

/**
 * 사진 같은 질감 그림: 기울기, 픽셀 잡음, 거의 검은 원판, 밝은 사각형, 날카로운 대각선 경계.
 * garbage 를 주면 왼쪽 띠·격자 점은 완전 투명(숨은 RGB 는 garbage), 아래 띠는 반투명이다.
 */
function photoFixture(width: number, height: number, garbage?: readonly number[]): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1), v = y / (height - 1);
      const grain = ((x * 7919 + y * 104729) % 37) - 18 + (((x * 31 + y * 17) ^ (x * y)) % 11) - 5;
      const shade = u + v > 1.1 ? -55 : 0;
      let rgb = [30 + 180 * u + shade, 50 + 150 * v + shade, 200 - 150 * u + shade];
      if ((u - 0.3) ** 2 + (v - 0.6) ** 2 < 0.04) rgb = [14, 12, 20];
      if (u >= 0.68 && u < 0.9 && v >= 0.12 && v < 0.42) rgb = [242, 236, 228];
      const offset = (y * width + x) * 4;
      data.set([rgb[0]! + grain, rgb[1]! + grain, rgb[2]! + grain, 255], offset);
      if (!garbage) continue;
      const alpha = u < 0.08 || (x + 2 * y) % 13 === 0 ? 0 : v > 0.83 ? 128 : 255;
      data[offset + 3] = alpha;
      if (alpha === 0) data.set(garbage, offset);
    }
  }
  return { width, height, data };
}

function render(effect: StudioFilterGalleryEffectDef, image: StudioFilterGalleryImage, params: StudioFilterGalleryParams): Uint8ClampedArray {
  const copy = { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
  effect.apply(copy, params, { seed: 1234, scale: 1 });
  return copy.data;
}

const sameBytes = (left: Uint8ClampedArray, right: Uint8ClampedArray): boolean => left.every((value, index) => value === right[index]);

/** 두 결과의 알파가 같고, 알파 > 0 인 픽셀의 RGB 도 같은지(숨은 RGB 만 다른 두 그림에 쓰면 숨은 색이 새지 않았는지 본다). */
function sameVisible(left: Uint8ClampedArray, right: Uint8ClampedArray): boolean {
  for (let offset = 0; offset < left.length; offset += 4) {
    if (left[offset + 3] !== right[offset + 3]) return false;
    if (left[offset + 3] === 0) continue;
    if (left[offset] !== right[offset] || left[offset + 1] !== right[offset + 1] || left[offset + 2] !== right[offset + 2]) return false;
  }
  return true;
}

function sameAlpha(out: Uint8ClampedArray, source: StudioFilterGalleryImage): boolean {
  for (let offset = 3; offset < out.length; offset += 4) if (out[offset] !== source.data[offset]) return false;
  return true;
}

/** 출력 바이트 전체의 FNV-1a 32비트 지문. */
function fingerprint(data: Uint8ClampedArray): number {
  let hash = 0x811c9dc5;
  for (const value of data) hash = Math.imul(hash ^ value, 0x01000193) >>> 0;
  return hash;
}

/** 슬라이더 전 칸을 훑어 바로 다음 칸과 같은 그림을 내는 칸("a=b")들을 돌려준다(빈 배열이면 무효 칸이 없다). */
function identicalNeighbours(
  effect: StudioFilterGalleryEffectDef, key: string, image: StudioFilterGalleryImage, overrides: StudioFilterGalleryParams = {},
): string[] {
  const identical: string[] = [];
  let previous: { value: number; out: Uint8ClampedArray } | null = null;
  for (const value of sliderValues(effect, key)) {
    const out = render(effect, image, { ...overrides, [key]: value });
    if (previous && sameBytes(previous.out, out)) identical.push(`${previous.value}=${value}`);
    previous = { value, out };
  }
  return identical;
}

const plasma = effectById("render.plasma");

describe("필터 갤러리 · 렌더 슬라이더 무효 칸 회귀 · 플라스마 난류", () => {
  it("다섯 합성 방식 모두에서 모든 이웃 칸이 서로 다른 결과를 내고, 모든 칸에서 알파·투명 계약을 지킨다", () => {
    const opaque = photoFixture(WIDTH, HEIGHT);
    // 투명 픽셀의 숨은 RGB 만 다른 두 그림: 보이는 픽셀 결과가 같아야 숨은 색이 새지 않은 것이다.
    const green = photoFixture(WIDTH, HEIGHT, [0, 255, 0]), magenta = photoFixture(WIDTH, HEIGHT, [255, 0, 255]);
    const identical: string[] = [], broken: string[] = [];
    for (const blend of BLENDS) {
      identical.push(...identicalNeighbours(plasma, "turbulence", opaque, { blend }).map((pair) => `${blend} ${pair}`));
      for (const turbulence of sliderValues(plasma, "turbulence")) {
        const left = render(plasma, green, { turbulence, blend });
        if (!sameAlpha(left, green) || !sameVisible(left, render(plasma, magenta, { turbulence, blend }))) broken.push(`${blend} ${turbulence}`);
      }
    }
    expect(identical).toEqual([]);
    expect(broken).toEqual([]);
  });

  it("난류가 한 칸 오를 때마다 무늬가 거칠어진다(가로 이웃 픽셀 차가 늘고, 낮은 칸일수록 매끈하다)", () => {
    // 지수를 잘랐을 때는 0.1~0.3, 6.7~7 칸의 거칠기가 같아 이 순서가 깨졌다.
    const opaque = photoFixture(WIDTH, HEIGHT);
    const variation = (out: Uint8ClampedArray): number => {
      let sum = 0;
      for (let y = 0; y < HEIGHT; y += 1) {
        for (let x = 0; x + 1 < WIDTH; x += 1) {
          const offset = (y * WIDTH + x) * 4;
          for (let channel = 0; channel < 3; channel += 1) sum += Math.abs(out[offset + channel]! - out[offset + 4 + channel]!);
        }
      }
      return sum / (HEIGHT * (WIDTH - 1) * 3);
    };
    const values = sliderValues(plasma, "turbulence");
    const roughness = values.map((turbulence) => variation(render(plasma, opaque, { turbulence, blend: "replace" })));
    const notRougher = values.slice(1).flatMap((value, index) => (roughness[index + 1]! > roughness[index]! ? [] : [`${values[index]}→${value}`]));
    expect(notRougher).toEqual([]);
  });

  it("기본값과 예전에도 다르던 칸(난류 0.4~6.6)은 고치기 전과 바이트까지 같다", () => {
    // 고치기 전 커널로 구한 지문이다. 지수를 자르던 칸(0.1~0.3, 6.7~7)만 바뀌었으므로 저장된 다른 값은 같은 무늬를 다시 낸다.
    const expected: readonly (readonly [number, string, boolean, number])[] = [
      [1, "replace", false, 0xb07a64fc], [1, "overlay", true, 0x8a9be7e6],
      [0.4, "replace", false, 0xaf537083], [0.4, "soft-light", true, 0x22624327],
      [6.6, "replace", false, 0xd978af4e], [6.6, "multiply", true, 0x4031b138],
    ];
    for (const [turbulence, blend, transparent, hash] of expected) {
      const fixture = transparent ? photoFixture(WIDTH, HEIGHT, [0, 255, 0]) : photoFixture(WIDTH, HEIGHT);
      expect(fingerprint(render(plasma, fixture, { turbulence, blend })), `${turbulence} ${blend}`).toBe(hash);
    }
  });
});

describe("필터 갤러리 · 렌더 슬라이더 무효 칸 보호 · 그림 크기·화면 내용 때문인 칸", () => {
  it("섬유 길이: 그림 높이가 160px(= 2.5 × 최대 64) 이상이면 64칸이 모두 서로 다르다", () => {
    // 더 낮은 그림에서 같은 칸은 결 반지름 2.5 × strength 가 그림 높이를 넘어 높이로 잘린 칸뿐이다(그림보다 긴 결).
    expect(identicalNeighbours(effectById("render.fibers"), "strength", photoFixture(24, 160))).toEqual([]);
  });

  it("프랙털 반복 횟수: 한도 L → L + 1 은 반복 L 에서 새로 탈출하는 픽셀이 있을 때만, 그리고 있으면 반드시 그림을 바꾼다", () => {
    const fractal = effectById("render.fractal"), opaque = photoFixture(WIDTH, HEIGHT);
    // 바다 팔레트에는 검정이 없어서 바꾸기 합성의 검은 픽셀은 한도 안에 탈출하지 못한(내부) 픽셀뿐이다.
    const insideCount = (out: Uint8ClampedArray): number => {
      let count = 0;
      for (let offset = 0; offset < out.length; offset += 4) if (out[offset] === 0 && out[offset + 1] === 0 && out[offset + 2] === 0) count += 1;
      return count;
    };
    const mismatched: string[] = [];
    for (const type of ["mandelbrot", "julia"]) {
      let previous: { value: number; out: Uint8ClampedArray; inside: number } | null = null, same = 0, changed = 0;
      for (const iterations of sliderValues(fractal, "iterations")) {
        const out = render(fractal, opaque, { type, iterations, palette: "ocean", blend: "replace" }), inside = insideCount(out);
        if (previous) {
          const identical = sameBytes(previous.out, out), escaped = previous.inside - inside;
          if (identical !== (escaped === 0)) mismatched.push(`${type} ${previous.value}→${iterations}: 같음 ${identical}, 새로 탈출 ${escaped}`);
          if (identical) same += 1;
          else changed += 1;
        }
        previous = { value: iterations, out, inside };
      }
      // 64×48 확대 1 화면에는 깊은 반복에서 탈출하는 경계 픽셀이 드물어 같은 칸과 바뀌는 칸이 모두 있다(두 경우를 다 확인한다).
      expect(same, type).toBeGreaterThan(0);
      expect(changed, type).toBeGreaterThan(0);
    }
    expect(mismatched).toEqual([]);
  });
});
