// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  overlayDustSelectionMaskRgba,
  runStudioRasterDataUrlProcessor,
  runStudioRgbaProcessor,
} from "./studio-raster-dataurl-runner";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("studio-raster-dataurl-runner", () => {
  it("순수 RGBA 프로세서 러너가 원본 버퍼를 변형하지 않고 변환 결과를 반환한다", () => {
    const src = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 128]),
    };
    const snapshot = src.data.slice();

    const out = runStudioRgbaProcessor(src, (rgba, width, height) => {
      for (let i = 0; i < rgba.length; i += 4) {
        rgba[i] = 255 - rgba[i]!;
      }
      return { width, height, data: rgba };
    });

    expect([...src.data]).toEqual([...snapshot]);
    expect(out.data[0]).toBe(245);
    expect(out.data[4]).toBe(215);
    expect(out.data[7]).toBe(128);
  });

  it("먼지 마스크 오버레이가 검출 픽셀만 마젠타 강조 색으로 표시한다", () => {
    const src = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([255, 255, 255, 255, 12, 12, 12, 255]),
    };
    const out = overlayDustSelectionMaskRgba(src, new Uint8Array([0, 255]));
    expect([...out.data.slice(0, 4)]).toEqual([255, 255, 255, 255]);
    expect([...out.data.slice(4, 8)]).toEqual([236, 72, 153, 255]);
  });

  it("HTMLImageElement와 오프스크린 캔버스를 거쳐 PNG Data-URL을 생성한다", async () => {
    const OriginalImage = globalThis.Image;
    class MockImage {
      naturalWidth = 2;
      naturalHeight = 1;
      width = 2;
      height = 1;
      crossOrigin = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", MockImage);

    const putSpy = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      (() =>
        ({
          drawImage: vi.fn(),
          getImageData: () => ({
            width: 2,
            height: 1,
            data: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]),
          }),
          createImageData: (w: number, h: number) => ({
            width: w,
            height: h,
            data: new Uint8ClampedArray(w * h * 4),
          }),
          putImageData: putSpy,
        }) as unknown as CanvasRenderingContext2D) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,PROCESSED_PNG",
    );

    try {
      const nextUrl = await runStudioRasterDataUrlProcessor(
        "data:image/png;base64,SRC",
        (rgba, w, h) => {
          rgba[0] = 99;
          return { width: w, height: h, data: rgba };
        },
      );
      expect(nextUrl).toBe("data:image/png;base64,PROCESSED_PNG");
      expect(putSpy).toHaveBeenCalledTimes(1);
      expect(putSpy.mock.calls[0]?.[0].data[0]).toBe(99);
    } finally {
      vi.stubGlobal("Image", OriginalImage);
    }
  });
});
