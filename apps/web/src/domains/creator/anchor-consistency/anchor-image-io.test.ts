// @vitest-environment jsdom

import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";

import { sha256HexPortable } from "../studio-sha256";

import { AnchorCaptureError } from "./anchor-capture-session";
import {
  ANCHOR_DECODE_MAX_EDGE,
  anchorDecodeSize,
  decodeAnchorRasterInBrowser,
  hashAnchorBytes,
  startAnchorDownload,
} from "./anchor-image-io";
import { fakePngBytes } from "./anchor-test-kit";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const INPUT = { bytes: fakePngBytes(64, 96), mimeType: "image/png", width: 64, height: 96 } as const;

interface Harness {
  readonly drawImage: ReturnType<typeof vi.fn>;
  readonly close: ReturnType<typeof vi.fn>;
  readonly createImageBitmap: ReturnType<typeof vi.fn>;
}

/** createImageBitmap 과 OffscreenCanvas 를 가짜로 바꿔 끼운다. */
function stubBrowserImage(options: { readonly bitmapWidth?: number; readonly bitmapHeight?: number; readonly getImageData?: () => ImageData } = {}): Harness {
  const width = options.bitmapWidth ?? 64;
  const height = options.bitmapHeight ?? 96;
  const close = vi.fn();
  const drawImage = vi.fn();
  const createImageBitmap = vi.fn(async () => ({ width, height, close }));
  class FakeOffscreenCanvas {
    getContext(): { drawImage: typeof drawImage; getImageData: () => ImageData } {
      return {
        drawImage,
        getImageData: options.getImageData ?? (() => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }) as ImageData),
      };
    }
  }
  vi.stubGlobal("createImageBitmap", createImageBitmap);
  vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
  return { drawImage, close, createImageBitmap };
}

describe("anchorDecodeSize", () => {
  it("긴 변이 상한 이하면 그대로 둔다", () => {
    expect(anchorDecodeSize(768, 1024)).toEqual({ width: 768, height: 1024, resized: false });
  });

  it("상한을 넘으면 비율을 지켜 줄인다", () => {
    expect(anchorDecodeSize(4096, 2048)).toEqual({ width: ANCHOR_DECODE_MAX_EDGE, height: 512, resized: true });
    expect(anchorDecodeSize(1000, 4000)).toEqual({ width: 256, height: 1024, resized: true });
  });

  it("아주 가늘어도 한 변은 1px 이상이다", () => {
    expect(anchorDecodeSize(4096, 1)).toEqual({ width: 1024, height: 1, resized: true });
  });
});

describe("decodeAnchorRasterInBrowser", () => {
  it("이미지를 풀어 RGBA 래스터로 돌려주고 비트맵을 닫는다", async () => {
    const harness = stubBrowserImage();
    const raster = await decodeAnchorRasterInBrowser(INPUT, new AbortController().signal);
    expect(raster.width).toBe(64);
    expect(raster.height).toBe(96);
    expect(raster.data.length).toBe(64 * 96 * 4);
    expect(harness.createImageBitmap).toHaveBeenCalledTimes(1);
    expect(harness.createImageBitmap.mock.calls[0]?.[1]).toBeUndefined();
    expect(harness.drawImage).toHaveBeenCalledTimes(1);
    expect(harness.close).toHaveBeenCalledTimes(1);
  });

  it("큰 이미지는 줄여서 풀도록 요청한다", async () => {
    const harness = stubBrowserImage({ bitmapWidth: 1024, bitmapHeight: 512 });
    await decodeAnchorRasterInBrowser({ ...INPUT, width: 4096, height: 2048 }, new AbortController().signal);
    expect(harness.createImageBitmap.mock.calls[0]?.[1]).toEqual({ resizeWidth: 1024, resizeHeight: 512, resizeQuality: "high" });
  });

  it("풀기 전에 이미 취소됐으면 cancelled 로 끝난다", async () => {
    const harness = stubBrowserImage();
    const controller = new AbortController();
    controller.abort();
    await expect(decodeAnchorRasterInBrowser(INPUT, controller.signal)).rejects.toMatchObject({ code: "cancelled" });
    expect(harness.createImageBitmap).not.toHaveBeenCalled();
  });

  it("푸는 동안 취소되면 비트맵을 닫고 cancelled 로 끝난다", async () => {
    const harness = stubBrowserImage();
    const controller = new AbortController();
    harness.createImageBitmap.mockImplementationOnce(async () => {
      controller.abort();
      return { width: 64, height: 96, close: harness.close };
    });
    await expect(decodeAnchorRasterInBrowser(INPUT, controller.signal)).rejects.toMatchObject({ code: "cancelled" });
    expect(harness.close).toHaveBeenCalledTimes(1);
    expect(harness.drawImage).not.toHaveBeenCalled();
  });

  it("디코더가 거부하면 decode-failed 로 끝난다", async () => {
    const harness = stubBrowserImage();
    harness.createImageBitmap.mockRejectedValueOnce(new Error("깨진 이미지"));
    const failure = await decodeAnchorRasterInBrowser(INPUT, new AbortController().signal).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AnchorCaptureError);
    expect(failure).toMatchObject({ code: "decode-failed" });
  });

  it("디코더가 없는 환경에서는 decode-failed 로 끝난다", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    await expect(decodeAnchorRasterInBrowser(INPUT, new AbortController().signal)).rejects.toMatchObject({ code: "decode-failed" });
  });

  it("픽셀을 읽다 실패해도 비트맵을 닫고 decode-failed 로 끝난다", async () => {
    const harness = stubBrowserImage({
      getImageData: () => {
        throw new Error("캔버스 읽기 거부");
      },
    });
    await expect(decodeAnchorRasterInBrowser(INPUT, new AbortController().signal)).rejects.toMatchObject({ code: "decode-failed" });
    expect(harness.close).toHaveBeenCalledTimes(1);
  });

  it("크기가 0 인 비트맵은 받지 않는다", async () => {
    const harness = stubBrowserImage({ bitmapWidth: 0, bitmapHeight: 0 });
    await expect(decodeAnchorRasterInBrowser(INPUT, new AbortController().signal)).rejects.toMatchObject({ code: "decode-failed" });
    expect(harness.close).toHaveBeenCalledTimes(1);
  });
});

describe("hashAnchorBytes", () => {
  it("순수 구현과 같은 SHA-256 을 만든다", async () => {
    const bytes = fakePngBytes(100, 100, 3, 200);
    expect(await hashAnchorBytes(bytes)).toBe(sha256HexPortable(bytes));
  });

  it("기본 구현이 거부하면 순수 구현으로 같은 값을 만든다", async () => {
    const bytes = fakePngBytes(100, 100, 4, 120);
    vi.stubGlobal("crypto", { subtle: { digest: () => Promise.reject(new Error("막힘")) } });
    expect(await hashAnchorBytes(bytes)).toBe(sha256HexPortable(bytes));
  });

  it("기본 구현이 아예 없어도 같은 값을 만든다", async () => {
    const bytes = fakePngBytes(100, 100, 5, 90);
    vi.stubGlobal("crypto", undefined);
    expect(await hashAnchorBytes(bytes)).toBe(sha256HexPortable(bytes));
  });
});

describe("startAnchorDownload", () => {
  it("내려받기 링크를 눌러 시작하고 잠시 뒤 객체 URL 을 해제한다", () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => "blob:anchor-1");
    const revokeObjectURL = vi.fn();
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: revokeObjectURL });
    onTestFinished(() => {
      Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: original.create });
      Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: original.revoke });
    });
    const clicked: { href: string; download: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click(this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download });
    });
    startAnchorDownload(new Blob(["x"]), "hero.zip");
    expect(clicked).toEqual([{ href: "blob:anchor-1", download: "hero.zip" }]);
    expect(document.querySelector("a[download]")).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30_000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:anchor-1");
  });
});
