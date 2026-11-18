import { describe, expect, it } from "vitest";

import { failVisible } from "../contracts";
import { createMockEngine } from "../testing/mock-engine";

import { isWebmEbml } from "./export-session";
import {
  DEFAULT_MOTION_TEASER_FPS,
  WEBTOON_MOTION_TEASER_RESOLUTIONS,
  computeMotionTeaserCameraWindow,
  exportWebtoonMotionTeaserWebm,
  planMotionTeaserSchedule,
  renderMotionTeaserFrameRgba,
} from "./webtoon-motion-teaser";
import { WEBTOON_VERTICAL_STRIP_CUTS, clampWebtoonStripLayout, composeWebtoonVerticalStrip } from "./webtoon-strip-composer";

const FAKE_WEBM_EBML_HEADER = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]);

describe("webtoon-motion-teaser", () => {
  it("planMotionTeaserSchedule은 스크롤 여백 호흡(cliffhanger vs compact)과 재생 배속(0.75×..1.5×)에 비례해 결정적 9:16 프레임을 생성한다", () => {
    const fastLayout = clampWebtoonStripLayout(540, true, ["compact", "compact", "compact"]);
    const dramaticLayout = clampWebtoonStripLayout(540, true, ["compact", "dramatic-pause", "cliffhanger"]);

    const fastSchedule = planMotionTeaserSchedule(fastLayout, ["compact", "compact", "compact"], { fps: 24, speed: 1 });
    const dramaticSchedule = planMotionTeaserSchedule(dramaticLayout, ["compact", "dramatic-pause", "cliffhanger"], { fps: 24, speed: 1 });
    const fast15xSchedule = planMotionTeaserSchedule(dramaticLayout, ["compact", "dramatic-pause", "cliffhanger"], { fps: 24, speed: 1.5 });

    expect(dramaticSchedule.fps).toBe(DEFAULT_MOTION_TEASER_FPS);
    expect(dramaticSchedule.outputDurationMs).toBeGreaterThan(fastSchedule.outputDurationMs);
    expect(dramaticSchedule.frameCount).toBeGreaterThan(fastSchedule.frameCount);
    expect(fast15xSchedule.frameCount).toBeLessThan(dramaticSchedule.frameCount);

    const first = dramaticSchedule.frames[0]!;
    const last = dramaticSchedule.frames.at(-1)!;
    expect(first.activeCutIndex).toBe(0);
    expect(first.scrollRatio01).toBe(0);
    expect(last.activeCutIndex).toBe(3);
    expect(last.scrollRatio01).toBe(1);
    expect(dramaticSchedule.frames.some((f) => f.dwellZoom > 1.01)).toBe(true);
  });

  it("computeMotionTeaserCameraWindow와 renderMotionTeaserFrameRgba는 9:16 규격 RGBA 프레임과 하단 진행 게이지를 결정적으로 합성한다", () => {
    const layout = clampWebtoonStripLayout(96, true);
    const panels = WEBTOON_VERTICAL_STRIP_CUTS.map((_, idx) => {
      const rgba = new Uint8ClampedArray(layout.cutWidth * layout.cutHeight * 4);
      for (let i = 0; i < rgba.length; i += 4) {
        rgba[i] = 40 + idx * 50;
        rgba[i + 1] = 80;
        rgba[i + 2] = 160;
        rgba[i + 3] = 255;
      }
      return { width: layout.cutWidth, height: layout.cutHeight, rgba };
    });
    const strip = composeWebtoonVerticalStrip(panels, layout, undefined, "midnight-noir");

    const topWin = computeMotionTeaserCameraWindow(strip.width, strip.height, 0, 1);
    const botWin = computeMotionTeaserCameraWindow(strip.width, strip.height, 1, 1.025);
    expect(topWin.srcY).toBe(0);
    expect(botWin.srcY).toBeGreaterThan(topWin.srcY);
    expect(botWin.srcWidth).toBeLessThan(topWin.srcWidth);

    const frameStart = renderMotionTeaserFrameRgba(
      strip,
      90,
      160,
      { scrollRatio01: 0, dwellZoom: 1, progress01: 0.1 },
      "midnight-noir",
    );
    const frameEnd = renderMotionTeaserFrameRgba(
      strip,
      90,
      160,
      { scrollRatio01: 1, dwellZoom: 1.02, progress01: 0.95 },
      "midnight-noir",
    );
    expect(frameStart.width).toBe(90);
    expect(frameStart.height).toBe(160);
    expect(Array.from(frameStart.rgba)).not.toEqual(Array.from(frameEnd.rgba));

    // 하단 진행 바 좌측은 앰버 하이라이트(228, 179, 99)로 채워진다
    const barRow = 159;
    const barPixelIdx = (barRow * 90 + 2) * 4;
    expect(Array.from(frameEnd.rgba.slice(barPixelIdx, barPixelIdx + 4))).toEqual([228, 179, 99, 255]);
  });

  it("exportWebtoonMotionTeaserWebm은 EBML 매직(0x1A45DFA3)·배속/스크린톤 파일 접미사를 검증하고 코덱 미지원 실패를 가시화한다", async () => {
    const engine = createMockEngine();
    expect(isWebmEbml(FAKE_WEBM_EBML_HEADER)).toBe(true);
    expect(isWebmEbml(new Uint8Array([0, 1, 2, 3]))).toBe(false);

    let capturedOutSize = "";
    const okOutcome = await exportWebtoonMotionTeaserWebm(
      engine,
      {
        stripWidth: 64,
        resolutionPreset: "hd-720x1280",
        playbackSpeed: 1.5,
        screentones: ["classic-ink-45", "none", "cyan-noir-dots", "none"],
      },
      async (req) => {
        capturedOutSize = `${req.outWidth}x${req.outHeight}`;
        req.onFrameProgress?.(0, req.schedule.frameCount, 0);
        return FAKE_WEBM_EBML_HEADER;
      },
      { now: () => 1_000 },
    );

    expect(okOutcome.ok).toBe(true);
    if (!okOutcome.ok) return;
    expect(capturedOutSize).toBe(`${WEBTOON_MOTION_TEASER_RESOLUTIONS["hd-720x1280"].width}x${WEBTOON_MOTION_TEASER_RESOLUTIONS["hd-720x1280"].height}`);
    expect(okOutcome.receipt.kind).toBe("webm");
    expect(okOutcome.receipt.mime).toBe("video/webm");
    expect(okOutcome.receipt.fileName).toMatch(/-720x1280-webtoon-4cut-tone-1_5x-teaser\.webm$/u);

    const invalidOutcome = await exportWebtoonMotionTeaserWebm(
      engine,
      { stripWidth: 64 },
      async () => new Uint8Array([1, 2, 3, 4]),
      { now: () => 2_000 },
    );
    expect(!invalidOutcome.ok && invalidOutcome.failure.code).toBe("export-webm-invalid");

    const unsupportedOutcome = await exportWebtoonMotionTeaserWebm(
      engine,
      { stripWidth: 64 },
      async () => {
        throw failVisible("motion-webm-unsupported", "WebM 미지원");
      },
      { now: () => 3_000 },
    );
    expect(!unsupportedOutcome.ok && unsupportedOutcome.failure.code).toBe("motion-webm-unsupported");
  });
});
