// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { promoClipPlaybackSource } from "./promo-clip-playback";
import { promoVideosByCategory } from "./promo-video-library";

const publicRoot = resolve(process.cwd(), "apps/web/public");
const streamSchema = z.object({
  codec_type: z.string(), codec_name: z.string(), profile: z.string().optional(),
  width: z.number().optional(), height: z.number().optional(), pix_fmt: z.string().optional(),
  level: z.number().optional(), avg_frame_rate: z.string().optional(),
  sample_rate: z.string().optional(), channels: z.number().optional(),
});
const manifestSchema = z.object({
  state: z.literal("local-generation-verified"),
  original49Sha256: z.record(z.string(), z.string()),
  items: z.array(z.object({
    sourceUrl: z.string(), sourceSha256: z.string(), playbackUrl: z.string(),
    sha256: z.string(), bytes: z.number().int().positive(),
    probe: z.object({ streams: z.array(streamSchema) }),
    fullVideoAudioDecodeExitCode: z.literal(0),
    beginMidEndDecoded: z.literal(true), moovBeforeMdat: z.literal(true),
    durationDeltaSeconds: z.number(),
  })).length(21),
});

describe("원본을 보존하는 쇼츠 호환 재생 선택", () => {
  it("완성한 실제 호환본 21개만 선택하고 다른 28개 원본 주소는 유지한다", () => {
    const manifest = manifestSchema.parse(JSON.parse(readFileSync(resolve(publicRoot, "brand/promo-shorts/compat/manifest.json"), "utf8")));
    const shorts = promoVideosByCategory("shorts");
    expect(shorts).toHaveLength(49);
    const changed = shorts.filter((clip) => promoClipPlaybackSource(clip.src) !== clip.src);
    expect(new Set(changed.map((clip) => clip.src))).toEqual(new Set(manifest.items.map((item) => item.sourceUrl)));
    expect(changed).toHaveLength(21);
    expect(shorts.filter((clip) => promoClipPlaybackSource(clip.src) === clip.src)).toHaveLength(28);
    expect(new Set(Object.keys(manifest.original49Sha256))).toEqual(new Set(shorts.map((clip) => clip.src)));
    for (const clip of shorts) {
      const original = readFileSync(resolve(publicRoot, clip.src.slice(1)));
      expect(createHash("sha256").update(original).digest("hex")).toBe(manifest.original49Sha256[clip.src]);
    }
    let totalBytes = 0;
    for (const item of manifest.items) {
      expect(promoClipPlaybackSource(item.sourceUrl)).toBe(item.playbackUrl);
      expect(item.playbackUrl).not.toBe(item.sourceUrl);
      const file = readFileSync(resolve(publicRoot, item.playbackUrl.slice(1)));
      expect(file.subarray(4, 8).toString("ascii")).toBe("ftyp");
      expect(createHash("sha256").update(file).digest("hex")).toBe(item.sha256);
      expect(file.byteLength).toBe(item.bytes);
      expect(file.byteLength).toBeLessThan(25 * 1024 * 1024);
      expect(manifest.original49Sha256[item.sourceUrl]).toBe(item.sourceSha256);
      expect(Math.abs(item.durationDeltaSeconds)).toBeLessThan(0.1);
      expect(item.probe.streams.find((stream) => stream.codec_type === "video")).toMatchObject({
        codec_name: "h264", profile: "Constrained Baseline", level: 31, width: 480, height: 840,
        pix_fmt: "yuv420p", avg_frame_rate: "24/1",
      });
      expect(item.probe.streams.find((stream) => stream.codec_type === "audio")).toMatchObject({
        codec_name: "aac", profile: "LC", sample_rate: "48000", channels: 1,
      });
      totalBytes += item.bytes;
    }
    expect(totalBytes).toBeLessThanOrEqual(60 * 1024 * 1024);
  });

  it("다른 경로·알 수 없는 쇼츠·query를 임의로 호환본에 연결하지 않는다", () => {
    for (const src of [
      "/brand/promo-shorts/shorts-3-serial-deadline.mp4",
      "/brand/promo-shorts/not-registered.mp4",
      "/brand/promo-shorts/shorts-1-drawing-autocolor.mp4?variant=original",
      "/brand/toonstudio-product-tour.mp4",
      "https://example.com/brand/promo-shorts/shorts-1-drawing-autocolor.mp4",
    ]) expect(promoClipPlaybackSource(src)).toBe(src);
  });
});
