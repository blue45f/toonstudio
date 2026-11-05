import { describe, expect, it } from "vitest";

import { gaussianBlurRgba } from "./native-gaussian";

describe("독립 Gaussian 벤치마크 필터", () => {
  it("정규화된 커널이 경계에서도 상수 RGBA 색을 보존한다", () => {
    const input = new Uint8Array(Array.from({ length: 3 * 7 }, () => [51, 134, 216, 127]).flat());
    expect(gaussianBlurRgba(input, 3, 7, 4)).toEqual(input);
  });

  it("0 sigma는 원본을 수정하지 않는 복사본을 반환한다", () => {
    const input = new Uint8Array([15, 16, 17, 18]);
    const output = gaussianBlurRgba(input, 1, 1, 0);
    expect(output).toEqual(input);
    expect(output).not.toBe(input);
    expect(gaussianBlurRgba(input, 1, 1, Number.MIN_VALUE)).toEqual(input);
  });

  it("중앙 impulse가 두 축 대칭이며 에너지를 정수 오차 범위에서 보존한다", () => {
    const size = 17;
    const input = new Uint8Array(size * size * 4);
    for (let pixel = 0; pixel < size * size; pixel += 1) input[pixel * 4 + 3] = 255;
    input[((size * size - 1) / 2) * 4] = 255;
    const output = gaussianBlurRgba(input, size, size, 1);
    let total = 0;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const value = output[(y * size + x) * 4];
        expect(value).toBe(output[(y * size + size - x - 1) * 4]);
        expect(value).toBe(output[((size - y - 1) * size + x) * 4]);
        expect(output[(y * size + x) * 4 + 3]).toBe(255);
        total += value;
      }
    }
    expect(Math.abs(total - 255)).toBeLessThanOrEqual(8);
  });

  it("보이지 않는 청색을 인접한 반투명 적색에 섞지 않는다", () => {
    const input = new Uint8Array([255, 0, 0, 255, 0, 0, 255, 0, 0, 0, 255, 0]);
    const output = gaussianBlurRgba(input, 3, 1, 0.7);
    for (let pixel = 0; pixel < 3; pixel += 1) {
      expect(output[pixel * 4]).toBe(255);
      expect(output[pixel * 4 + 1]).toBe(0);
      expect(output[pixel * 4 + 2]).toBe(0);
    }
    expect(output[3]).toBeGreaterThan(output[7]);
    expect(output[7]).toBeGreaterThan(output[11]);
  });

  it("별도 2차원 Gaussian 합산 기준과 픽셀 오차 1 이내로 일치한다", () => {
    const width = 5;
    const height = 3;
    const input = new Uint8Array(width * height * 4);
    for (let index = 0; index < input.length; index += 1) input[index] = (index * 37 + 19) % 256;
    const sigma = 0.8;
    const radius = Math.ceil(4 * sigma);
    const output = gaussianBlurRgba(input, width, height, sigma);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const channels = [0, 0, 0, 0];
        let weights = 0;
        for (let dy = -radius; dy <= radius; dy += 1) {
          for (let dx = -radius; dx <= radius; dx += 1) {
            const weight = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
            const offset = (Math.min(height - 1, Math.max(0, y + dy)) * width
              + Math.min(width - 1, Math.max(0, x + dx))) * 4;
            const alpha = input[offset + 3];
            for (let channel = 0; channel < 3; channel += 1) channels[channel] += weight * alpha * input[offset + channel];
            channels[3] += weight * alpha;
            weights += weight;
          }
        }
        const offset = (y * width + x) * 4;
        for (let channel = 0; channel < 3; channel += 1) {
          expect(Math.abs(output[offset + channel] - Math.round(channels[channel] / channels[3]))).toBeLessThanOrEqual(1);
        }
        expect(Math.abs(output[offset + 3] - Math.round(channels[3] / weights))).toBeLessThanOrEqual(1);
      }
    }
  });

  it("잘못된 크기·버퍼·sigma를 거부한다", () => {
    expect(() => gaussianBlurRgba(new Uint8Array(4), 0, 1, 1)).toThrow(RangeError);
    expect(() => gaussianBlurRgba(new Uint8Array(4), 1.5, 1, 1)).toThrow(RangeError);
    expect(() => gaussianBlurRgba(new Uint8Array(3), 1, 1, 1)).toThrow(RangeError);
    for (const sigma of [-1, NaN, Infinity, 65]) {
      expect(() => gaussianBlurRgba(new Uint8Array(4), 1, 1, sigma)).toThrow(RangeError);
    }
  });
});
