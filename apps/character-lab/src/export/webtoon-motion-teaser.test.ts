import { describe, expect, it } from "vitest";

import { createDefaultRecipe, failVisible } from "../contracts";
import { createMockEngine } from "../testing/mock-engine";

import { isWebmEbml } from "./export-session";
import {
  DEFAULT_MOTION_TEASER_FPS,
  WEBTOON_MOTION_TEASER_RESOLUTIONS,
  buildCutKineticOverlays,
  buildMotionTeaserWebVtt,
  computeCutKineticMotionState,
  computeMotionTeaserCameraWindow,
  encodeMonoPcm16Wav,
  exportWebtoonMotionAudioWav,
  exportWebtoonMotionTeaserVtt,
  exportWebtoonMotionTeaserWebm,
  formatWebVttTimestamp,
  isWavRiff,
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

    const earlyState = computeCutKineticMotionState(dramaticSchedule.timeline, ["pat", "kugugung", "none", "none"], 80);
    expect(earlyState.cutBubbleAlphas[0]).toBeGreaterThan(0.4);
    expect(earlyState.cutBubbleAlphas[1]).toBe(0);
    expect(earlyState.cutBubbleScales[0]).toBeGreaterThan(0.8);

    const seg2Start = dramaticSchedule.timeline.segments[1].dwellStartMs;
    const rumbleState = computeCutKineticMotionState(dramaticSchedule.timeline, ["none", "kugugung", "none", "none"], seg2Start + 80);
    expect(Math.hypot(rumbleState.shakeOffsetX, rumbleState.shakeOffsetY)).toBeGreaterThan(0.1);
  });

  it("synthesizeMotionTeaserAudioPcm은 6종 효과음 및 무드별 앰비언트 화성 BGM 패드를 클리핑 없이 2채널 믹싱한다", () => {
    const layout = clampWebtoonStripLayout(320, true);
    const schedule = planMotionTeaserSchedule(layout, ["standard", "standard", "standard"], { fps: 24, speed: 1 });

    const silent = synthesizeMotionTeaserAudioPcm(schedule, ["none", "none", "none", "none"], 12_000);
    expect(silent.eventCount).toBe(0);
    expect(silent.ambientBgm).toBe(false);
    expect(silent.samples.every((s) => s === 0)).toBe(true);

    const bgmOnly = synthesizeMotionTeaserAudioPcm(schedule, ["none", "none", "none", "none"], 12_000, {
      includeAmbientBgm: true,
      moodId: "twilight-amber",
    });
    expect(bgmOnly.ambientBgm).toBe(true);
    expect(bgmOnly.samples.some((s) => Math.abs(s) > 0.02)).toBe(true);
    expect(bgmOnly.samples.every((s) => Math.abs(s) <= 0.95)).toBe(true);

    const mixedA = synthesizeMotionTeaserAudioPcm(schedule, ["dugeun", "seureung", "kugugung", "beonjjeok"], 12_000, {
      includeAmbientBgm: true,
      moodId: "midnight-noir",
    });
    const mixedB = synthesizeMotionTeaserAudioPcm(schedule, ["dugeun", "seureung", "kugugung", "beonjjeok"], 12_000, {
      includeAmbientBgm: true,
      moodId: "midnight-noir",
    });
    expect(mixedA.eventCount).toBe(4);
    expect(mixedA.samples.every((s) => Math.abs(s) <= 0.95)).toBe(true);
    expect(Array.from(mixedA.samples.slice(0, 600))).toEqual(Array.from(mixedB.samples.slice(0, 600)));

    const wavBytes = encodeMonoPcm16Wav(mixedA);
    expect(isWavRiff(wavBytes)).toBe(true);
    expect(wavBytes.byteLength).toBe(44 + mixedA.samples.length * 2);

    const wavOutcome = exportWebtoonMotionAudioWav(
      createDefaultRecipe(),
      {
        stripWidth: 320,
        includeAmbientBgm: true,
        mangaFx: {
          enabled: true,
          sfxStamps: ["dugeun", "none", "kugugung", "none"],
        },
      },
      { now: () => 777 },
    );
    expect(wavOutcome.ok).toBe(true);
    if (wavOutcome.ok) {
      expect(isWavRiff(wavOutcome.bytes)).toBe(true);
      expect(wavOutcome.receipt.kind).toBe("wav");
      expect(wavOutcome.receipt.fileName).toMatch(/-webtoon-4cut-sfx-bgm-audio\.wav$/u);
    }
  });

  it("buildMotionTeaserWebVtt와 exportWebtoonMotionTeaserVtt는 타임코드·다국어 보이스 태그·효과음 주석을 정확히 생성한다", () => {
    expect(formatWebVttTimestamp(65_432)).toBe("00:01:05.432");
    const layout = clampWebtoonStripLayout(320, true, ["compact", "dramatic-pause", "cliffhanger"]);
    const schedule = planMotionTeaserSchedule(layout, ["compact", "dramatic-pause", "cliffhanger"], { fps: 24, speed: 1 });

    const jaVtt = buildMotionTeaserWebVtt(schedule, {
      episodeTitleKo: "1화 신전 신탁",
      locale: "ja",
      dialogueLines: ["神託が降りる。", "まさか！", "聖杯を見よ。", "決着だ。"],
      bubbleShapes: ["monologue-box", "shout-burst", "oval", "oval"],
      speakerTargets: ["protagonist", "partner", "protagonist", "protagonist"],
      sfxStamps: ["pat", "none", "beonjjeok", "dugeun"],
    });
    expect(jaVtt.startsWith("WEBVTT\n")).toBe(true);
    expect(jaVtt).toContain("<v モノローグ>[効果音: パッ] 神託が降りる。");
    expect(jaVtt).toContain("<v 相手役>まさか！");

    const vttOutcome = exportWebtoonMotionTeaserVtt(
      createDefaultRecipe(),
      {
        stripWidth: 320,
        playbackSpeed: 1.5,
        mangaFx: {
          enabled: true,
          locale: "ko",
          dialogueLines: ["1컷 대사", "2컷 대사", "3컷 대사", "4컷 대사"],
          sfxStamps: ["dugeun", "none", "none", "none"],
        },
      },
      { now: () => 500 },
    );
    expect(vttOutcome.ok).toBe(true);
    if (!vttOutcome.ok) return;
    expect(vttOutcome.receipt.kind).toBe("vtt");
    expect(vttOutcome.receipt.fileName).toMatch(/-webtoon-4cut-ko-1_5x-teaser\.vtt$/u);
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

  it("exportWebtoonMotionTeaserWebm은 키네틱 오버레이·Web Audio PCM·앰비언트 BGM·성능 영수증(receipt.motion) 및 실패 코드를 검증한다", async () => {
    const engine = createMockEngine();
    expect(isWebmEbml(FAKE_WEBM_EBML_HEADER)).toBe(true);

    let capturedAudioEvents = 0;
    let capturedAmbientBgm = false;
    let capturedOverlayCount = 0;
    let tick = 1_000;
    const okOutcome = await exportWebtoonMotionTeaserWebm(
      engine,
      {
        stripWidth: 64,
        resolutionPreset: "hd-720x1280",
        playbackSpeed: 1.5,
        includeAmbientBgm: true,
        screentones: ["classic-ink-45", "none", "cyan-noir-dots", "none"],
        mangaFx: {
          enabled: true,
          dialogueLines: ["시작", "반격", "각성", "결말"],
          sfxStamps: ["seureung", "none", "kugugung", "none"],
        },
      },
      async (req) => {
        capturedAudioEvents = req.audioPcm?.eventCount ?? 0;
        capturedAmbientBgm = req.audioPcm?.ambientBgm ?? false;
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
    expect(capturedAmbientBgm).toBe(true);
    expect(capturedOverlayCount).toBe(4);
    expect(okOutcome.receipt.width).toBe(WEBTOON_MOTION_TEASER_RESOLUTIONS["hd-720x1280"].width);
    expect(okOutcome.receipt.motion?.audioEvents).toBe(2);
    expect(okOutcome.receipt.motion?.ambientBgm).toBe(true);
    expect(okOutcome.receipt.motion?.peakRasterMb).toBeGreaterThan(0);
    expect(okOutcome.receipt.fileName).toMatch(/-720x1280-webtoon-4cut-fx-tone-sfx-bgm-1_5x-teaser\.webm$/u);

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
