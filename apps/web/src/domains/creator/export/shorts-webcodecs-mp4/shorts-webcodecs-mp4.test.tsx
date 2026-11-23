// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { DEFAULT_DEMO_CUTS_PANELS } from "../../nextgen-web-platform/webcodecs-cuts-exporter";
import type { EncodedVideoChunkLike } from "../studio-webcodecs-video-export";

import { ShortsMp4ExporterPanel } from "./ShortsMp4ExporterPanel";
import {
  assembleShortsMp4Container,
  encodeAndAssembleShortsPackage,
  inspectIsoBmffBoxes,
  inspectWavHeader,
  synthesizeShortsWavTrack,
  type ShortsMp4ExportRuntimeDeps,
} from "./shorts-mp4-audio-muxer";
import {
  DEFAULT_SHORTS_DEMO_CUTS,
  adaptLegacyCutsPanels,
  compileShortsTimeline,
  evaluateCameraEasing,
  evaluateShortsCameraPose,
  toStudioVideoTimeline,
  type ShortsWebtoonCutInput,
} from "./shorts-timeline-compiler";

const HANGUL_REGEX = /[가-힣]/u;
const INITIAL_LANG = useI18n.getState().lang;
const TEST_AVCC = new Uint8Array([
  0x01, 0x64, 0x00, 0x33, 0xff, 0xe1, 0x00, 0x06, 0x67, 0x64, 0x00, 0x33, 0xac, 0xd9, 0x01, 0x00, 0x04,
  0x68, 0xee, 0x3c, 0x80,
]);

function createFakeHardwareEncoderDeps(): {
  readonly deps: ShortsMp4ExportRuntimeDeps;
  readonly encodedFrameCount: () => number;
  readonly closedFrameCount: () => number;
} {
  let encoded = 0;
  let closed = 0;

  const deps: ShortsMp4ExportRuntimeDeps = {
    probe: {
      isConfigSupported: async (config) => ({
        supported: config.codec === "avc1.640033" && config.hardwareAcceleration === "prefer-hardware",
      }),
    },
    createEncoder: (handlers) => {
      let emittedFirst = false;
      return {
        encodeQueueSize: 0,
        configure: () => undefined,
        encode: (_frame, encodeOptions) => {
          const isKey = encodeOptions?.keyFrame === true;
          const payload = new Uint8Array([0, 0, 0, 4, isKey ? 0x65 : 0x41, 0x9a, encoded & 0xff, 0x11]);
          const timestamp = encoded * 33_333;
          encoded += 1;
          const chunk: EncodedVideoChunkLike = {
            type: isKey ? "key" : "delta",
            timestamp,
            duration: 33_333,
            byteLength: payload.byteLength,
            copyTo: (destination) => {
              if (destination instanceof Uint8Array) {
                destination.set(payload);
              } else if (ArrayBuffer.isView(destination)) {
                new Uint8Array(destination.buffer, destination.byteOffset, destination.byteLength).set(payload);
              } else {
                new Uint8Array(destination).set(payload);
              }
            },
          };
          handlers.output(
            chunk,
            !emittedFirst ? { decoderConfig: { description: TEST_AVCC } } : undefined,
          );
          emittedFirst = true;
        },
        flush: async () => undefined,
        close: () => undefined,
      };
    },
    createFrame: () => ({
      close: () => {
        closed += 1;
      },
    }),
    yieldToUi: async () => undefined,
  };

  return {
    deps,
    encodedFrameCount: () => encoded,
    closedFrameCount: () => closed,
  };
}

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useI18n.setState({ lang: INITIAL_LANG });
});

describe("숏폼 타임라인 컴파일러 (9:16 / 1:1 / 16:9 · 이징 · 크로스페이드 · WebVTT/SRT)", () => {
  const sampleCuts: readonly ShortsWebtoonCutInput[] = [
    {
      cutId: "c1",
      width: 800,
      height: 2400,
      dialogue: "첫 번째 대사",
      dialogueEn: "First line of dialogue",
      emotion: "calm",
      durationSec: 2,
    },
    {
      cutId: "c2",
      width: 800,
      height: 1800,
      dialogue: "충격적인 반전!",
      dialogueEn: "Shocking twist!",
      emotion: "impact",
      durationSec: 2,
    },
  ];

  it("9:16 / 1:1 / 16:9 해상도와 30/60fps 프레임 수·단조 증가 타임스탬프를 정확히 컴파일한다", () => {
    const vertical30 = compileShortsTimeline(sampleCuts, { aspectRatio: "9:16", fps: 30 });
    expect(vertical30.width).toBe(1080);
    expect(vertical30.height).toBe(1920);
    expect(vertical30.totalDurationSec).toBe(4);
    expect(vertical30.totalFrames).toBe(120);
    expect(vertical30.frames[0]?.keyFrame).toBe(true);

    for (let i = 1; i < vertical30.frames.length; i += 1) {
      const prev = vertical30.frames[i - 1];
      const curr = vertical30.frames[i];
      expect(curr && prev && curr.timestampUs > prev.timestampUs).toBe(true);
    }

    const square60 = compileShortsTimeline(sampleCuts, { aspectRatio: "1:1", fps: 60 });
    expect(square60.width).toBe(1080);
    expect(square60.height).toBe(1080);
    expect(square60.totalFrames).toBe(240);

    const wide30 = compileShortsTimeline(sampleCuts, { aspectRatio: "16:9", fps: 30 });
    expect(wide30.width).toBe(1920);
    expect(wide30.height).toBe(1080);

    const studioTimeline = toStudioVideoTimeline(vertical30);
    expect(studioTimeline.frames).toHaveLength(120);
    expect(studioTimeline.fps).toBe(30);
    expect(studioTimeline.durationUs).toBe(vertical30.totalDurationUs);
  });

  it("Ken Burns 카메라 이징 곡선과 컷 전환 크로스페이드 투명도를 계산한다", () => {
    expect(evaluateCameraEasing("linear", 0.5)).toBe(0.5);
    expect(evaluateCameraEasing("ease-out-cubic", 0)).toBe(0);
    expect(evaluateCameraEasing("ease-out-cubic", 1)).toBe(1);
    expect(evaluateCameraEasing("ease-out-cubic", 0.5)).toBeGreaterThan(0.5);
    expect(evaluateCameraEasing("ease-in-out-sine", 0.5)).toBeCloseTo(0.5, 5);
    expect(evaluateCameraEasing("ease-out-expo", 1)).toBe(1);

    const startPose = evaluateShortsCameraPose({
      sourceWidth: 800,
      sourceHeight: 2400,
      targetWidth: 1080,
      targetHeight: 1920,
      motion: "ken-burns-in",
      easing: "ease-out-cubic",
      progress: 0,
    });
    const endPose = evaluateShortsCameraPose({
      sourceWidth: 800,
      sourceHeight: 2400,
      targetWidth: 1080,
      targetHeight: 1920,
      motion: "ken-burns-in",
      easing: "ease-out-cubic",
      progress: 1,
    });
    expect(endPose.scale).toBeGreaterThan(startPose.scale);

    const compiled = compileShortsTimeline(sampleCuts, { fps: 30, crossfadeSec: 0.4 });
    const crossfadeFrames = compiled.frames.filter((frame) => frame.crossfadeProgress > 0);
    expect(crossfadeFrames.length).toBeGreaterThan(0);
    expect(crossfadeFrames[0]?.incomingCutId).toBe("c2");
    expect(crossfadeFrames[0]?.opacity).toBeLessThan(1);
  });

  it("WebVTT(점 구분자)와 SRT(쉼표 구분자) 자막 및 기존 CutsPanelInput 어댑터를 정확히 생성한다", () => {
    const compiled = compileShortsTimeline(sampleCuts, { fps: 30, locale: "ko" });
    expect(compiled.webVtt.startsWith("WEBVTT\n")).toBe(true);
    expect(compiled.webVtt).toContain("00:00:00.000 --> 00:00:02.000");
    expect(compiled.webVtt).toContain("첫 번째 대사");
    expect(compiled.webVtt).toContain("00:00:02.000 --> 00:00:04.000");

    expect(compiled.srt).toContain("00:00:00,000 --> 00:00:02,000");
    expect(compiled.srt).toContain("00:00:02,000 --> 00:00:04,000");
    expect(compiled.srt).toContain("충격적인 반전!");

    const adapted = adaptLegacyCutsPanels(DEFAULT_DEMO_CUTS_PANELS);
    expect(adapted).toHaveLength(DEFAULT_DEMO_CUTS_PANELS.length);
    expect(adapted[0]?.cutId).toBe("cut-1");
  });
});

describe("실제 ISO-BMFF MP4 컨테이너 조립 + 순수 PCM RIFF/WAVE 오디오 트랙", () => {
  it("assembleShortsMp4Container가 실제 ftyp/mdat/moov/avc1/avcC ISO-BMFF MP4 바이너리를 조립한다", () => {
    const chunks = [
      { data: new Uint8Array([0, 0, 0, 4, 0x65, 0x88, 0x84, 0x21]), timestampUs: 0, durationUs: 33_333, keyFrame: true },
      { data: new Uint8Array([0, 0, 0, 3, 0x41, 0x9a, 0x02]), timestampUs: 33_333, durationUs: 33_333, keyFrame: false },
      { data: new Uint8Array([0, 0, 0, 3, 0x41, 0x9b, 0x03]), timestampUs: 66_666, durationUs: 33_334, keyFrame: false },
    ];

    const mp4 = assembleShortsMp4Container(chunks, {
      width: 1080,
      height: 1920,
      fps: 30,
      codecString: "avc1.640033",
      codecPrivate: TEST_AVCC,
    });

    expect(mp4.usedEncoderAvcC).toBe(true);
    expect(mp4.sampleCount).toBe(3);
    expect(mp4.keyFrameCount).toBe(1);
    expect(mp4.mimeType).toContain("video/mp4");
    expect(mp4.inspection.isValid).toBe(true);
    expect(mp4.inspection.hasFtyp).toBe(true);
    expect(mp4.inspection.hasMdat).toBe(true);
    expect(mp4.inspection.hasMoov).toBe(true);
    expect(mp4.inspection.hasAvc1).toBe(true);
    expect(mp4.inspection.hasAvcC).toBe(true);
    expect(mp4.inspection.majorBrand).toBe("isom");

    const reinspected = inspectIsoBmffBoxes(mp4.bytes);
    expect(reinspected.topLevelBoxes.map((box) => box.type)).toEqual(["ftyp", "mdat", "moov"]);
    expect(() => assembleShortsMp4Container([], { width: 1080, height: 1920, fps: 30 })).toThrow();
  });

  it("encodeAndAssembleShortsPackage가 하드웨어 VideoEncoder 청크를 버리지 않고 MP4+WAV+자막으로 조립한다", async () => {
    const timeline = compileShortsTimeline(DEFAULT_SHORTS_DEMO_CUTS.slice(0, 2), {
      aspectRatio: "9:16",
      fps: 30,
    });
    const fake = createFakeHardwareEncoderDeps();
    const stages: string[] = [];

    const pkg = await encodeAndAssembleShortsPackage(timeline, {
      includeAudio: true,
      deps: fake.deps,
      onProgress: (progress) => stages.push(progress.stage),
    });

    expect(pkg.backend).toBe("webcodecs-hw-avc1");
    expect(fake.encodedFrameCount()).toBe(timeline.totalFrames);
    expect(fake.closedFrameCount()).toBe(timeline.totalFrames);
    expect(pkg.mp4.sampleCount).toBe(timeline.totalFrames);
    expect(pkg.mp4.usedEncoderAvcC).toBe(true);
    expect(pkg.mp4.inspection.isValid).toBe(true);
    expect(pkg.wav).not.toBeNull();
    expect(stages).toContain("completed");
  });

  it("synthesizeShortsWavTrack가 정확한 RIFF/WAVE/fmt /data 헤더와 비-무음 16-bit PCM을 생성한다", () => {
    const timeline = compileShortsTimeline(DEFAULT_SHORTS_DEMO_CUTS.slice(0, 2), {
      aspectRatio: "9:16",
      fps: 30,
      includeAudioCues: true,
    });

    const wav22k = synthesizeShortsWavTrack(timeline, { sampleRate: 22050, channels: 1 });
    const header22k = inspectWavHeader(wav22k.bytes);

    expect(header22k.isValid).toBe(true);
    expect(header22k.riffId).toBe("RIFF");
    expect(header22k.waveId).toBe("WAVE");
    expect(header22k.fmtId).toBe("fmt ");
    expect(header22k.dataId).toBe("data");
    expect(header22k.audioFormat).toBe(1);
    expect(header22k.bitsPerSample).toBe(16);
    expect(header22k.sampleRate).toBe(22050);
    expect(header22k.channels).toBe(1);
    expect(header22k.byteRate).toBe(22050 * 2);
    expect(header22k.chunkSize).toBe(36 + header22k.dataByteLength);
    expect(wav22k.bytes.byteLength).toBe(44 + header22k.dataByteLength);

    // 실제 PCM 페이로드 비-무음 검증 + 결정성 검증
    const view = new DataView(wav22k.bytes.buffer, wav22k.bytes.byteOffset, wav22k.bytes.byteLength);
    let nonZeroCount = 0;
    for (let offset = 44; offset < wav22k.bytes.byteLength; offset += 2) {
      if (view.getInt16(offset, true) !== 0) nonZeroCount += 1;
    }
    expect(nonZeroCount).toBeGreaterThan(wav22k.sampleFrames * 0.5);
    expect(wav22k.peakAmplitude).toBeGreaterThan(0.05);
    expect(wav22k.rmsAmplitude).toBeGreaterThan(0.01);

    const wavRepeat = synthesizeShortsWavTrack(timeline, { sampleRate: 22050, channels: 1 });
    expect(wavRepeat.bytes).toEqual(wav22k.bytes);

    const wav44kStereo = synthesizeShortsWavTrack(timeline, { sampleRate: 44100, channels: 2 });
    const header44k = inspectWavHeader(wav44kStereo.bytes);
    expect(header44k.isValid).toBe(true);
    expect(header44k.sampleRate).toBe(44100);
    expect(header44k.channels).toBe(2);
    expect(header44k.blockAlign).toBe(4);
    expect(header44k.byteRate).toBe(44100 * 4);
  });
});

describe("ShortsMp4ExporterPanel UI (포맷 전환 · 다운로드 · EN 모드 한글 0자 · 정적 위생)", () => {
  it("9:16 / 1:1 / 16:9 포맷 전환, 60fps 전환, BGM/자막 토글 및 실제 .mp4/.wav/.vtt 다운로드를 수행한다", async () => {
    const fake = createFakeHardwareEncoderDeps();
    const downloadedBlobs: Blob[] = [];
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockImplementation((obj) => {
      if (obj instanceof Blob) downloadedBlobs.push(obj);
      return "blob:shorts-test";
    });
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    render(
      <ShortsMp4ExporterPanel
        cuts={DEFAULT_SHORTS_DEMO_CUTS.slice(0, 2)}
        encoderDeps={fake.deps}
      />,
    );

    expect(screen.getByTestId("shorts-mp4-spec-badge").textContent).toContain("1080×1920 · 30fps");
    expect(screen.getByTestId("shorts-preview-stage").getAttribute("data-aspect")).toBe("9:16");

    fireEvent.click(screen.getByTestId("shorts-format-1:1"));
    expect(screen.getByTestId("shorts-mp4-spec-badge").textContent).toContain("1080×1080");
    expect(screen.getByTestId("shorts-preview-stage").getAttribute("data-aspect")).toBe("1:1");

    fireEvent.click(screen.getByTestId("shorts-format-16:9"));
    expect(screen.getByTestId("shorts-mp4-spec-badge").textContent).toContain("1920×1080");
    expect(screen.getByTestId("shorts-preview-stage").getAttribute("data-aspect")).toBe("16:9");

    fireEvent.click(screen.getByTestId("shorts-fps-60"));
    expect(screen.getByTestId("shorts-mp4-spec-badge").textContent).toContain("60fps");

    expect(screen.getByTestId("shorts-preview-caption")).toBeTruthy();
    fireEvent.click(screen.getByTestId("shorts-toggle-subtitles"));
    expect(screen.queryByTestId("shorts-preview-caption")).toBeNull();
    fireEvent.click(screen.getByTestId("shorts-toggle-subtitles"));

    fireEvent.click(screen.getByTestId("shorts-export-generate-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("shorts-export-receipt")).toBeTruthy();
    });

    expect(screen.getByTestId("shorts-export-receipt").textContent).toContain("ftyp · mdat · moov");

    fireEvent.click(screen.getByTestId("shorts-download-mp4-btn"));
    fireEvent.click(screen.getByTestId("shorts-download-wav-btn"));
    fireEvent.click(screen.getByTestId("shorts-download-vtt-btn"));

    expect(createObjectUrlSpy).toHaveBeenCalledTimes(3);
    expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(3);
    expect(clickSpy).toHaveBeenCalledTimes(3);
    expect(downloadedBlobs[0]?.type).toContain("video/mp4");
    expect(downloadedBlobs[1]?.type).toBe("audio/wav");
    expect(downloadedBlobs[2]?.type).toContain("text/vtt");
  });

  it("EN 모드에서는 초기 렌더와 내보내기 완료 상태 모두 한글 0자를 보장한다", async () => {
    useI18n.setState({ lang: "en" });
    const fake = createFakeHardwareEncoderDeps();

    const { container } = render(
      <ShortsMp4ExporterPanel
        cuts={DEFAULT_SHORTS_DEMO_CUTS.slice(0, 2)}
        projectTitle="한글-제목-테스트"
        encoderDeps={fake.deps}
      />,
    );

    expect(HANGUL_REGEX.test(container.textContent ?? "")).toBe(false);

    fireEvent.click(screen.getByTestId("shorts-export-generate-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("shorts-export-receipt")).toBeTruthy();
    });

    expect(HANGUL_REGEX.test(container.textContent ?? "")).toBe(false);
    const labeledNodes = container.querySelectorAll("[aria-label]");
    for (const node of labeledNodes) {
      expect(HANGUL_REGEX.test(node.getAttribute("aria-label") ?? "")).toBe(false);
    }
  });

  it("소유 모듈 전체가 800줄 이하 · 원시 hex 0건 · transition-all 0건 · any 0건을 만족한다", () => {
    const dir = resolve(process.cwd(), "apps/web/src/domains/creator/export/shorts-webcodecs-mp4");
    const files = [
      "shorts-presets-catalog.ts",
      "shorts-timeline-compiler.ts",
      "shorts-pcm-wav-synth.ts",
      "shorts-mp4-audio-muxer.ts",
      "ShortsMp4ExporterPanel.tsx",
      "shorts-mp4-exporter.css",
    ];

    for (const file of files) {
      const source = readFileSync(resolve(dir, file), "utf-8");
      const lines = source.split("\n").length;
      expect(lines).toBeLessThanOrEqual(800);
      expect(source).not.toMatch(/transition-all|transition\s*:\s*all/u);
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      if (!file.endsWith(".css")) {
        expect(source).not.toMatch(/\b(?:as|:\s*)any\b/u);
      }
    }
  });
});
