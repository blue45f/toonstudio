/**
 * 필터 갤러리 공용 도우미 시험: 소수 반지름 흐림·쿠와하라(슬라이더 칸마다 결과가 바뀌어야 한다)와 덮인 휘도 평면.
 */
import { describe, expect, it } from "vitest";

import { coveredLumaPlane, gaussianPlane, lumaPlane } from "./studio-filter-gallery-kernel-utils";
import { gaussianBlur, kuwahara, kuwaharaFractional, readPaintSource } from "./studio-filter-gallery-paint-helpers";

import type { StudioFilterGalleryImage } from "./studio-filter-gallery-types";

function texturedPlane(width: number, height: number): Float32Array {
  const plane = new Float32Array(width * height);
  for (let index = 0; index < plane.length; index += 1) plane[index] = ((index * 2654435761) >>> 0) % 256;
  return plane;
}

function texturedImage(width: number, height: number): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data.set([(index * 37) % 256, (index * 91) % 256, (index * 53) % 256, 255], index * 4);
  }
  return { width, height, data };
}

const maxDifference = (left: Float32Array, right: Float32Array): number =>
  left.reduce((worst, value, index) => Math.max(worst, Math.abs(value - right[index]!)), 0);

describe("필터 갤러리 · 소수 반지름 흐림", () => {
  it("kernel-utils 와 paint-helpers 의 가우시안이 같은 반지름 규약을 따른다", () => {
    for (const radius of [0.4, 1, 1.9, 2.5, 3.464, 5.2, 9.7]) {
      const left = texturedPlane(23, 17), right = left.slice();
      gaussianPlane(left, 23, 17, radius);
      gaussianBlur(right, 23, 17, radius);
      expect(maxDifference(left, right), String(radius)).toBeLessThan(1e-3);
    }
  });

  it("반지름이 조금만 달라도 결과가 달라지고, 사이 값은 두 정수 상자 결과의 사이에 있다", () => {
    const base = texturedPlane(32, 32);
    const at = (radius: number): Float32Array => { const plane = base.slice(); gaussianPlane(plane, 32, 32, radius); return plane; };
    const lower = at(Math.sqrt(3) * 2), middle = at(Math.sqrt(3) * 2.5), upper = at(Math.sqrt(3) * 3);
    expect(maxDifference(at(1.9), at(Math.sqrt(3)))).toBeGreaterThan(0.5);
    for (let index = 0; index < middle.length; index += 1) {
      const low = Math.min(lower[index]!, upper[index]!), high = Math.max(lower[index]!, upper[index]!);
      expect(middle[index]!).toBeGreaterThanOrEqual(low - 1e-3);
      expect(middle[index]!).toBeLessThanOrEqual(high + 1e-3);
    }
  });
});

describe("필터 갤러리 · 소수 반지름 쿠와하라", () => {
  it("정수 반지름은 기존 쿠와하라와 같고, 소수 반지름은 이웃한 두 정수 결과를 소수 부분만큼 섞는다", () => {
    const image = texturedImage(20, 16), source = readPaintSource(image);
    const exact = kuwaharaFractional(source, source.weight, 20, 16, 2, 8);
    const two = kuwahara(source, source.weight, 20, 16, 2, 8), three = kuwahara(source, source.weight, 20, 16, 3, 8);
    expect(maxDifference(exact.red, two.red)).toBe(0);
    const mixed = kuwaharaFractional(source, source.weight, 20, 16, 2.25, 8);
    for (let index = 0; index < mixed.red.length; index += 1) {
      expect(mixed.green[index]!).toBeCloseTo(two.green[index]! + (three.green[index]! - two.green[index]!) * 0.25, 3);
    }
  });
});

describe("필터 갤러리 · 덮인 휘도 평면", () => {
  it("투명 픽셀은 숨은 RGB 와 관계없이 0 이고, 불투명 픽셀은 lumaPlane 과 같다", () => {
    const image = texturedImage(8, 8);
    for (let index = 0; index < 8; index += 1) image.data.set([255, 255, 255, 0], index * 4);
    const covered = coveredLumaPlane(image), plain = lumaPlane(image);
    for (let index = 0; index < 64; index += 1) expect(covered[index]!).toBeCloseTo(index < 8 ? 0 : plain[index]!, 4);
  });
});
