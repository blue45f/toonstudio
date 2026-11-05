import { describe, expect, it } from "vitest";

import { STUDIO_NATIVE_RESIZE_ROW_CACHE_BYTES, resizeStudioRgbaLanczos3 } from "./studio-native-lanczos";
import createNativeResizeRuntime from "./studio-native-resize-runtime";

function raster(width: number, height: number, colour: readonly number[]): Uint8Array {
  return Uint8Array.from({ length: width * height * 4 }, (_, index) => colour[index % 4]);
}

describe("자체 Lanczos3의 색·알파·표본 계약", () => {
  it.each([[32, 32, 4, 4], [19, 7, 3, 2], [1, 128, 1, 8], [96, 1, 12, 1]])(
    "상수 RGBA와 경계 정규화를 보존한다: %ix%i → %ix%i",
    (width, height, targetWidth, targetHeight) => {
      const source = raster(width, height, [71, 129, 203, 97]);
      const output = resizeStudioRgbaLanczos3(source, width, height, targetWidth, targetHeight);
      expect(output).toEqual(raster(targetWidth, targetHeight, [71, 129, 203, 97]));
    },
  );

  it("완전 투명 표본의 숨은 RGB를 모든 불투명 출력에서 배제한다", () => {
    const source = raster(64, 32, [255, 0, 0, 255]);
    for (let y = 0; y < 32; y += 1) {
      for (let x = 32; x < 64; x += 1) source.set([0, 255, 255, 0], (y * 64 + x) * 4);
    }
    const output = resizeStudioRgbaLanczos3(source, 64, 32, 8, 4);
    for (let offset = 0; offset < output.length; offset += 4) {
      if (output[offset + 3] > 0) expect(Array.from(output.slice(offset, offset + 3))).toEqual([255, 0, 0]);
      else expect(Array.from(output.slice(offset, offset + 3))).toEqual([0, 0, 0]);
    }
  });

  it("중심 impulse의 좌우·상하 대칭을 1 LSB 이내로 보존한다", () => {
    const source = raster(33, 33, [0, 0, 0, 255]);
    source.set([255, 255, 255, 255], (16 * 33 + 16) * 4);
    const output = resizeStudioRgbaLanczos3(source, 33, 33, 9, 9);
    for (let y = 0; y < 9; y += 1) {
      for (let x = 0; x < 9; x += 1) {
        const value = output[(y * 9 + x) * 4];
        expect(Math.abs(value - output[(y * 9 + 8 - x) * 4])).toBeLessThanOrEqual(1);
        expect(Math.abs(value - output[((8 - y) * 9 + x) * 4])).toBeLessThanOrEqual(1);
      }
    }
  });

  it("입력 subarray를 변경하지 않고 독립 buffer를 반환한다", () => {
    const backing = raster(10, 8, [17, 93, 211, 255]);
    const source = backing.subarray(16, 16 + 8 * 8 * 4);
    const before = new Uint8Array(backing);
    const first = resizeStudioRgbaLanczos3(source, 8, 8, 2, 2);
    const second = resizeStudioRgbaLanczos3(source, 8, 8, 2, 2);
    expect(first).toEqual(second);
    expect(first.buffer).not.toBe(backing.buffer);
    first.fill(0);
    expect(backing).toEqual(before);
  });

  it("크기·buffer 불일치·확대를 명시적으로 거부한다", () => {
    const source = raster(2, 2, [1, 2, 3, 255]);
    for (const invalid of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => resizeStudioRgbaLanczos3(source, invalid, 2, 1, 1)).toThrow(RangeError);
      expect(() => resizeStudioRgbaLanczos3(source, 2, 2, invalid, 1)).toThrow(RangeError);
    }
    expect(() => resizeStudioRgbaLanczos3(source.subarray(1), 2, 2, 1, 1)).toThrow(RangeError);
    expect(() => resizeStudioRgbaLanczos3(source, 2, 2, 3, 1)).toThrow(RangeError);
  });

  it("소수 높이의 비등방 축소도 row cache 예산을 넘지 않고 같은 바이트를 만든다", () => {
    const width = 1021;
    const height = 4093;
    const targetWidth = 1020;
    const source = Uint8Array.from({ length: width * height * 4 }, (_, index) => index % 4 === 3 ? 255 : (index * 17) % 251);
    let peak = 0;
    const output = resizeStudioRgbaLanczos3(source, width, height, targetWidth, 1, {
      onScratchUsage: ({ cachedRowsBytes, accumulatorBytes, currentRowBytes }) => {
        peak = Math.max(peak, cachedRowsBytes);
        expect(cachedRowsBytes).toBeLessThanOrEqual(STUDIO_NATIVE_RESIZE_ROW_CACHE_BYTES);
        expect(accumulatorBytes).toBe(targetWidth * 4 * 8);
        expect(currentRowBytes).toBe(targetWidth * 4 * 4);
      },
    });
    expect(peak).toBeGreaterThan(32_000_000);
    const withoutCache = resizeStudioRgbaLanczos3(source, width, height, targetWidth, 1, { rowCacheBytes: 0 });
    expect(output).toEqual(withoutCache);
  });
});

describe("기존 내보내기 runtime 주입 계약의 자체 facade", () => {
  it("알려진 RGBA 계약과 명시적 release를 지킨다", async () => {
    const runtime = await createNativeResizeRuntime();
    runtime.concurrency(1);
    expect(() => runtime.concurrency(2)).toThrow(RangeError);
    expect(() => runtime.Image.newFromMemory(new Uint8Array(3), 1, 1, 3, "uchar")).toThrow(TypeError);
    const source = raster(4, 4, [71, 129, 203, 255]);
    const image = runtime.Image.newFromMemory(source, 4, 4, 4, "uchar");
    const resized = image.resize(0.5, { vscale: 0.25 });
    expect([resized.width, resized.height]).toEqual([2, 1]);
    expect(resized.writeToMemory()).toEqual(raster(2, 1, [71, 129, 203, 255]));
    resized.delete();
    expect(() => resized.writeToMemory()).toThrow(/released/);
    image.delete();
    expect(source).toEqual(raster(4, 4, [71, 129, 203, 255]));
  });
});
