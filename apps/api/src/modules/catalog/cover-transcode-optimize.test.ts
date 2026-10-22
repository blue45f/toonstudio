import { Image, decode, encode, encodeJpeg, encodePng } from "image-js";
import { describe, expect, it } from "vitest";

import { optimizeCoverBytes } from "./cover-transcode";

// 그라데이션을 가진 실물형 이미지를 만든다(cover-transcode.test.ts와 같은 방식 —
// 단색이면 JPEG가 비현실적으로 작아져 축소 판정이 왜곡된다).
function makeImage(width: number, height: number, alpha: number): Image {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = (x * 255) / width;
      data[i + 1] = (y * 255) / height;
      data[i + 2] = ((x + y) * 255) / (width + height);
      data[i + 3] = alpha;
    }
  }
  return new Image(width, height, { data, colorModel: "RGBA" });
}

describe("optimizeCoverBytes", () => {
  it("converts an opaque PNG to JPEG at the same size when no width is requested", () => {
    const original = Buffer.from(encodePng(makeImage(320, 480, 255)));
    const result = optimizeCoverBytes(original, "image/png");
    expect(result).not.toBeNull();
    expect(result?.contentType).toBe("image/jpeg");
    // 크기 축소가 아니라 바이트 축소가 목적이라 치수는 원본 그대로다.
    expect(result?.width).toBe(320);
    expect(result?.height).toBe(480);
    expect(result!.body.length).toBeLessThan(original.length);
    const decoded = decode(result!.body);
    expect(decoded.width).toBe(320);
    expect(decoded.height).toBe(480);
  });

  it("recompresses an oversized-quality JPEG at the same size", () => {
    const image = makeImage(320, 480, 255);
    const original = Buffer.from(encodeJpeg(image, { quality: 100 }));
    const result = optimizeCoverBytes(original, "image/jpeg");
    expect(result?.contentType).toBe("image/jpeg");
    expect(result?.width).toBe(320);
    expect(result?.height).toBe(480);
    expect(result!.body.length).toBeLessThan(original.length);
  });

  it("also resizes when a target width is given and the original is wider", () => {
    const original = Buffer.from(encodePng(makeImage(800, 1200, 255)));
    const result = optimizeCoverBytes(original, "image/png", 320);
    expect(result?.contentType).toBe("image/jpeg");
    expect(result?.width).toBe(320);
    expect(result?.height).toBe(480);
    expect(result!.body.length).toBeLessThan(original.length);
  });

  it("never upscales: a target width above the original keeps the original size", () => {
    const original = Buffer.from(encodePng(makeImage(320, 480, 255)));
    const result = optimizeCoverBytes(original, "image/png", 960);
    expect(result?.width).toBe(320);
    expect(result?.height).toBe(480);
    expect(result!.body.length).toBeLessThan(original.length);
  });

  it("keeps a transparent PNG as PNG when resizing so the alpha survives", () => {
    const original = Buffer.from(encodePng(makeImage(200, 300, 128)));
    const result = optimizeCoverBytes(original, "image/png", 100);
    expect(result?.contentType).toBe("image/png");
    expect(result?.width).toBe(100);
    expect(result!.body.length).toBeLessThan(original.length);
    const decoded = decode(result!.body);
    expect(decoded.alpha).toBe(true);
    expect(decoded.data[3]).toBe(128);
  });

  it("never serves a re-encode that is not smaller than the original", () => {
    // 이미 q82로 인코딩된 JPEG는 같은 품질로 다시 인코딩해도 줄 이유가 없다.
    // 결과가 원본 이상이면 채택하지 않는 것이 이 경로의 안전장치다 —
    // null이면 호출부는 원본을 그대로 중계한다.
    const original = Buffer.from(encodeJpeg(makeImage(160, 240, 255), { quality: 82 }));
    const result = optimizeCoverBytes(original, "image/jpeg");
    if (result !== null) {
      expect(result.body.length).toBeLessThan(original.length);
    }
    // 작은 단색 계열 JPEG처럼 원본이 이미 최소 수준이면 null이어야 한다.
    const tiny = Buffer.from(encode(makeImage(8, 8, 255), { format: "jpeg" }));
    const tinyResult = optimizeCoverBytes(tiny, "image/jpeg");
    if (tinyResult !== null) {
      expect(tinyResult.body.length).toBeLessThan(tiny.length);
    }
  });

  it("only ever returns bodies strictly smaller than the input", () => {
    const cases: Array<[Buffer, string, number?]> = [
      [Buffer.from(encodePng(makeImage(480, 720, 255))), "image/png"],
      [Buffer.from(encodePng(makeImage(480, 720, 200))), "image/png", 160],
      [Buffer.from(encodeJpeg(makeImage(480, 720, 255), { quality: 95 })), "image/jpeg"],
      [Buffer.from(encodeJpeg(makeImage(480, 720, 255), { quality: 60 })), "image/jpeg", 320],
      [Buffer.from(encodePng(makeImage(64, 96, 255))), "image/png", 320],
    ];
    for (const [body, type, width] of cases) {
      const result = optimizeCoverBytes(body, type, width);
      if (result !== null) expect(result.body.length).toBeLessThan(body.length);
    }
  });

  it("returns null for formats image-js cannot decode (webp/avif/gif)", () => {
    const bytes = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(optimizeCoverBytes(bytes, "image/webp")).toBeNull();
    expect(optimizeCoverBytes(bytes, "image/avif")).toBeNull();
    expect(optimizeCoverBytes(bytes, "image/gif")).toBeNull();
  });

  it("returns null instead of throwing on corrupt image bytes", () => {
    const corrupt = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(optimizeCoverBytes(corrupt, "image/jpeg")).toBeNull();
    expect(optimizeCoverBytes(corrupt, "image/jpeg", 160)).toBeNull();
  });

  it("ignores a non-positive or non-integer target width instead of failing", () => {
    const original = Buffer.from(encodePng(makeImage(320, 480, 255)));
    for (const width of [0, -160, 320.5, Number.NaN]) {
      const result = optimizeCoverBytes(original, "image/png", width);
      // 폭으로 취급하지 않고 같은 크기 재인코딩으로만 동작한다.
      expect(result?.width).toBe(320);
    }
  });
});
