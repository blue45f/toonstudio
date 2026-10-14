import { Image, decode, encode, encodePng } from "image-js";
import { describe, expect, it } from "vitest";

import { transcodeCoverToWidth } from "./cover-transcode";

// 그라데이션을 가진 실물형 이미지를 만든다(단색이면 JPEG가 비현실적으로 작아진다).
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

describe("transcodeCoverToWidth", () => {
  it("shrinks an oversized JPEG to the target width and keeps it JPEG", () => {
    const original = Buffer.from(encode(makeImage(800, 1200, 255), { format: "jpeg" }));
    const result = transcodeCoverToWidth(original, "image/jpeg", 320);
    expect(result).not.toBeNull();
    expect(result?.contentType).toBe("image/jpeg");
    expect(result?.width).toBe(320);
    expect(result?.height).toBe(480);
    expect(result!.body.length).toBeLessThan(original.length);
    const decoded = decode(result!.body);
    expect(decoded.width).toBe(320);
    expect(decoded.height).toBe(480);
  });

  it("converts an opaque PNG to a resized JPEG", () => {
    const original = Buffer.from(encodePng(makeImage(640, 960, 255)));
    const result = transcodeCoverToWidth(original, "image/png", 160);
    expect(result?.contentType).toBe("image/jpeg");
    expect(result?.width).toBe(160);
    expect(result?.height).toBe(240);
  });

  it("keeps a transparent PNG as PNG so the alpha survives the resize", () => {
    const original = Buffer.from(encodePng(makeImage(200, 300, 128)));
    const result = transcodeCoverToWidth(original, "image/png", 100);
    expect(result?.contentType).toBe("image/png");
    expect(result?.width).toBe(100);
    const decoded = decode(result!.body);
    expect(decoded.alpha).toBe(true);
    expect(decoded.data[3]).toBe(128);
  });

  it("returns null when the original is already at or below the target width", () => {
    const original = Buffer.from(encode(makeImage(320, 480, 255), { format: "jpeg" }));
    expect(transcodeCoverToWidth(original, "image/jpeg", 320)).toBeNull();
    expect(transcodeCoverToWidth(original, "image/jpeg", 640)).toBeNull();
  });

  it("returns null for formats image-js cannot decode (webp/avif/gif)", () => {
    const bytes = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(transcodeCoverToWidth(bytes, "image/webp", 320)).toBeNull();
    expect(transcodeCoverToWidth(bytes, "image/avif", 320)).toBeNull();
    expect(transcodeCoverToWidth(bytes, "image/gif", 320)).toBeNull();
  });

  it("returns null instead of throwing on corrupt image bytes", () => {
    const corrupt = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(transcodeCoverToWidth(corrupt, "image/jpeg", 320)).toBeNull();
  });
});
