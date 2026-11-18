import { describe, expect, it } from "vitest";

import { failVisible } from "../contracts";
import { createMockEngine } from "../testing/mock-engine";

import { isWebmEbml } from "./export-session";
import {
  DEFAULT_MOTION_TEASER_FPS,
  WEBTOON_MOTION_TEASER_RESOLUTIONS,
  buildCutKineticOverlays,
  computeCutKineticMotionState,
  computeMotionTeaserCameraWindow,
  exportWebtoonMotionTeaserWebm,
  planMotionTeaserSchedule,
  renderMotionTeaserFrameRgba,
  synthesizeMotionTeaserAudioPcm,
} from "./webtoon-motion-teaser";
import { WEBTOON_VERTICAL_STRIP_CUTS, clampWebtoonStripLayout, composeWebtoonVerticalStrip } from "./webtoon-strip-composer";

const FAKE_WEBM_EBML_HEADER = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]);

describe("webtoon-motion-teaser", () => {
  it("planMotionTeaserSchedule과 computeCutKineticMotionState는 컷 체류 팝인 배율·효과음 진동·배속 프레임을 결정적으로 계산한다", () => {
    const fastLayout = clampWebtoonStripLayout(540, true, ["compact", "compact", "compact"]);
    const dramaticLayout = clampWebtoonStripLayout(540, true, ["compact", "dramatic-pause", "cliffhanger"]);

    const fastSchedule = planMotionTeaserSchedule(fastLayout, ["compact", "compact", "compact"], { fps: 24, speed: 1 });
    const dramaticSchedule = planMotionTeaserSchedule(dramaticLayout, ["compact", "dramatic-pause", "cliffhanger"], {
      fps: 24,
      speed: 1,
      sfxStamps: ["pat", "kugugung", "beonjjeok", "dugeun"],
    });
    const fast15xSchedule = planMotionTeaserSchedule(dramaticLayout, ["compact", "dramatic-pause", "cliffhanger"], { fps: 24, speed: 1.5 });

    expect(dramaticSchedule.fps).toBe(DEFAULT_MOTION_TEASER_FPS);
    expect(dramaticSchedule.outputDurationMs).toBeGreaterThan(fastSchedule.outputDurationMs);
    expect(dramaticSchedule.frameCount).toBeGreaterThan(fastSchedule.frameCount);
    expect(fast15xSchedule.frameCount).toBeLessThan(dramaticSchedule.frameCount);

    // 1컷 진입 시에는 2~4컷 말풍선 알파가 0으로 숨겨져 패닝 가독성 붕괴를 방지한다
    const earlyState = computeCutKineticMotionState(dramaticSchedule.timeline, ["pat", "kugugung", "none", "none"], 80);
    expect(earlyState.cutBubbleAlphas[0]).toBeGreaterThan(0.4);
    expect(earlyState.cutBubbleAlphas[1]).toBe(0);
    expect(earlyState.cutBubbleScales[0]).toBeGreaterThan(0.8);

    // 2컷 체류 진입 구간에서는 쿠구궁 진동 오프셋이 발생한다
    const seg2Start = dramaticSchedule.timeline.segments[1].dwellStartMs;
    const rumbleState = computeCutKineticMotionState(dramaticSchedule.timeline, ["none", "kugugung", "none", "none"], seg2Start + 80);
    expect(Math.hypot(rumbleState.shakeOffsetX, rumbleState.shakeOffsetY)).toBeGreaterThan(0.1);
  });

  it("synthesizeMotionTeaserAudioPcm은 6종 효과음 스탬프를 결정적 모노 PCM 파형으로 합성한다", () => {
    const layout = clampWebtoonStripLayout(320, true);
    const schedule = planMotionTeaserSchedule(layout, ["standard", "standard", "standard"], { fps: 24, speed: 1 });

    const silent = synthesizeMotionTeaserAudioPcm(schedule, ["none", "none", "none", "none"], 12_000);
    expect(silent.eventCount).toBe(0);
    expect(silent.samples.every((s) => s === 0)).toBe(true);

    const activeA = synthesizeMotionTeaserAudioPcm(schedule, ["dugeun", "seureung", "kugugung", "beonjjeok"], 12_000);
    const activeB = synthesizeMotionTeaserAudioPcm(schedule, ["dugeun", "seureung", "kugugung", "beonjjeok"], 12_000);
    expect(activeA.eventCount).toBe(4);
    expect(activeA.samples.some((s) => Math.abs(s) > 0.05)).toBe(true);
    expect(Array.from(activeA.samples.slice(0, 600))).toEqual(Array.from(activeB.samples.slice(0, 600)));
  });

  it("computeMotionTeaserCameraWindow, buildCutKineticOverlays 및 renderMotionTeaserFrameRgba는 9:16 규격 RGBA 프레임을 결정적으로 합성한다", () => {
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
    const overlays = buildCutKineticOverlays(layout, {
      enabled: true,
      dialogueLines: ["1컷", "2컷", "3컷", "4컷"],
      sfxStamps: ["dugeun", "none", "kugugung", "none"],
    });
    expect(overlays).toHaveLength(4);
    expect(overlays[0]?.bubbleOverlay).not.toBeNull();
    expect(overlays[0]?.sfxOverlay).not.toBeNull();

    const topWin = computeMotionTeaserCameraWindow(strip.width, strip.height, 0, 1);
    const botWin = computeMotionTeaserCameraWindow(strip.width, strip.height, 1, 1.025, 9 / 16, 2, -1);
    expect(topWin.srcY).toBe(0);
    expect(botWin.srcY).toBeGreaterThan(topWin.srcY);
    expect(botWin.srcWidth).toBeLessThan(topWin.srcWidth);

    const frameStart = renderMotionTeaserFrameRgba(
      strip,
      90,
      160,
      {
        scrollRatio01: 0,
        dwellZoom: 1,
        progress01: 0.1,
        cutBubbleAlphas: [1, 0, 0, 0],
        cutBubbleScales: [1.02, 0.78, 0.78, 0.78],
      },
      "midnight-noir",
      true,
      overlays,
    );
    expect(frameStart.width).toBe(90);
    expect(frameStart.height).toBe(160);
  });

  it("exportWebtoonMotionTeaserWebm은 키네틱 오버레이·Web Audio PCM·성능 벤치마크 영수증(receipt.motion) 및 실패 코드를 검증한다", async () => {
    const engine = createMockEngine();
    expect(isWebmEbml(FAKE_WEBM_EBML_HEADER)).toBe(true);

    let capturedAudioEvents = 0;
    let capturedOverlayCount = 0;
    let tick = 1_000;
    const okOutcome = await exportWebtoonMotionTeaserWebm(
      engine,
      {
        stripWidth: 64,
        resolutionPreset: "hd-720x1280",
        playbackSpeed: 1.5,
        screentones: ["classic-ink-45", "none", "cyan-noir-dots", "none"],
        mangaFx: {
          enabled: true,
          dialogueLines: ["시작", "반격", "각성", "결말"],
          sfxStamps: ["seureung", "none", "kugugung", "none"],
        },
      },
      async (req) => {
        capturedAudioEvents = req.audioPcm?.eventCount ?? 0;
        capturedOverlayCount = req.kineticOverlays?.length ?? 0;
        req.onFrameProgress?.(0, req.schedule.frameCount, 0);
        tick += 48;
        return FAKE_WEBM_EBML_HEADER;
      },
      { now: () => tick },
    );

    expect(okOutcome.ok).toBe(true);
    if (!okOutcome.ok) return;
    expect(capturedAudioEvents).toBe(2);
    expect(capturedOverlayCount).toBe(4);
    expect(okOutcome.receipt.width).toBe(WEBTOON_MOTION_TEASER_RESOLUTIONS["hd-720x1280"].width);
    expect(okOutcome.receipt.motion?.audioEvents).toBe(2);
    expect(okOutcome.receipt.motion?.peakRasterMb).toBeGreaterThan(0);
    expect(okOutcome.receipt.fileName).toMatch(/-720x1280-webtoon-4cut-fx-tone-sfx-1_5x-teaser\.webm$/u);

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
