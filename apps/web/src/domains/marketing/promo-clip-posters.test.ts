// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { promoClipPoster } from "./promo-clip-posters";
import { promoVideosByCategory } from "./promo-video-library";

const publicRoot = resolve(process.cwd(), "apps/web/public");
const manifestSchema = z.object({
  sourceCount: z.literal(49),
  posterCount: z.literal(49),
  totalBytes: z.number().int().positive(),
  items: z.array(z.object({
    source: z.string(),
    sourceSha256: z.string(),
    poster: z.string(),
    posterSha256: z.string(),
    bytes: z.number().int().positive(),
    width: z.literal(320),
    height: z.literal(560),
    requestedTimestampSeconds: z.literal(0.75),
  })).length(49),
});

describe("쇼츠 실제 프레임 파생 poster", () => {
  it("49개 등록 원본과 파생 이미지를 누락 없이 연결하고 양쪽 바이트의 출처를 검증한다", () => {
    const manifest = manifestSchema.parse(JSON.parse(readFileSync(resolve(publicRoot, "brand/promo-shorts/posters/manifest.json"), "utf8")));
    const shorts = promoVideosByCategory("shorts");
    expect(shorts).toHaveLength(49);
    expect(new Set(manifest.items.map((item) => item.source))).toEqual(new Set(shorts.map((short) => short.src)));
    let totalBytes = 0;
    for (const entry of manifest.items) {
      expect(promoClipPoster(entry.source)).toBe(entry.poster);
      const original = readFileSync(resolve(publicRoot, entry.source.slice(1)));
      expect(createHash("sha256").update(original).digest("hex")).toBe(entry.sourceSha256);
      const poster = readFileSync(resolve(publicRoot, entry.poster.slice(1)));
      expect(poster.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(poster.subarray(8, 12).toString("ascii")).toBe("WEBP");
      expect(createHash("sha256").update(poster).digest("hex")).toBe(entry.posterSha256);
      expect(poster.byteLength).toBe(entry.bytes);
      totalBytes += poster.byteLength;
    }
    expect(totalBytes).toBe(manifest.totalBytes);
  });

  it("파생 이미지가 없는 영상에 존재하지 않는 poster URL을 만들지 않는다", () => {
    expect(promoClipPoster("/brand/promo-shorts/not-registered.mp4")).toBeUndefined();
    expect(promoClipPoster("/brand/toonstudio-product-tour.mp4")).toBeUndefined();
  });
});
