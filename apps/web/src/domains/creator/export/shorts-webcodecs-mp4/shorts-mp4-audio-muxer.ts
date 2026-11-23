/**
 * 숏폼 WebCodecs H.264(avc1) MP4 컨테이너 조립기 및 오디오·자막 통합 익스포터.
 *
 * 기존 `webcodecs-cuts-exporter.ts`가 VideoEncoder 출력 청크 바이트를 버리던 단절을 해소한다:
 *  1) `VideoEncoder`(`avc1` 하드웨어 우선, `avc.format="avc"`) 출력 청크와 `avcC`를 실제로 수집한다.
 *  2) 기존 `studio-webcodecs-mp4`의 `muxMp4`로 ISO-BMFF(`ftyp`/`mdat`/`moov`) MP4 바이너리를 조립하고
 *     박스 구조 무결성을 검증한다.
 *  3) 순수 16-bit PCM 합성기(`synthesizeShortsWavTrack`)로 RIFF/WAVE `.wav` 오디오 트랙을 함께 생성한다.
 */

import type { StudioVideoEncoderProbe } from "../../studio-webcodecs-capability";
import { mp4MimeType, muxMp4, type Mp4SampleInput } from "../../studio-webcodecs-mp4";
import {
  AVC1_CODEC_CANDIDATES,
  buildAvc1VideoEncoderConfig,
  evenDimension,
  probeAvc1EncoderConfig,
  recommendAvc1Bitrate,
  type Avc1VideoEncoderConfig,
} from "../studio-webcodecs-mp4-export";
import {
  createDefaultWebCodecsYield,
  type EncodedVideoChunkLike,
  type EncodedVideoChunkMetadataLike,
  type VideoEncoderLike,
  type VideoFrameLike,
} from "../studio-webcodecs-video-export";

import {
  inspectWavHeader,
  synthesizeShortsWavTrack,
  type ShortsWavSynthOptions,
  type ShortsWavTrackResult,
  type WavHeaderInspectionResult,
} from "./shorts-pcm-wav-synth";
import type {
  CompiledShortsTimeline,
  ShortsAspectRatio,
  ShortsFps,
  ShortsTimelineFrame,
} from "./shorts-timeline-compiler";

export {
  inspectWavHeader,
  synthesizeShortsWavTrack,
  type ShortsWavSynthOptions,
  type ShortsWavTrackResult,
  type WavHeaderInspectionResult,
};

// ── ISO-BMFF 박스 파서·검증기 ────────────────────────────────────────────

export interface IsoBmffBoxSummary {
  readonly type: string;
  readonly offset: number;
  readonly size: number;
}

export interface IsoBmffInspectionResult {
  readonly isValid: boolean;
  readonly totalBytes: number;
  readonly topLevelBoxes: readonly IsoBmffBoxSummary[];
  readonly hasFtyp: boolean;
  readonly hasMdat: boolean;
  readonly hasMoov: boolean;
  readonly hasAvc1: boolean;
  readonly hasAvcC: boolean;
  readonly majorBrand: string | null;
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += String.fromCharCode(bytes[offset + i] ?? 0);
  }
  return out;
}

function scanNestedBoxes(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  found: Set<string>,
): void {
  let offset = start;
  while (offset + 8 <= end) {
    const size = view.getUint32(offset, false);
    if (size < 8 || offset + size > end) break;
    const type = readAscii(bytes, offset + 4, 4);
    found.add(type);
    const bodyStart = offset + 8;
    const boxEnd = offset + size;

    if (type === "moov" || type === "trak" || type === "mdia" || type === "minf" || type === "stbl") {
      scanNestedBoxes(bytes, view, bodyStart, boxEnd, found);
    } else if (type === "stsd" && bodyStart + 8 <= boxEnd) {
      scanNestedBoxes(bytes, view, bodyStart + 8, boxEnd, found);
    } else if (type === "avc1" && bodyStart + 78 <= boxEnd) {
      scanNestedBoxes(bytes, view, bodyStart + 78, boxEnd, found);
    }
    offset = boxEnd;
  }
}

export function inspectIsoBmffBoxes(bytes: Uint8Array): IsoBmffInspectionResult {
  if (bytes.byteLength < 8) {
    return {
      isValid: false,
      totalBytes: bytes.byteLength,
      topLevelBoxes: [],
      hasFtyp: false,
      hasMdat: false,
      hasMoov: false,
      hasAvc1: false,
      hasAvcC: false,
      majorBrand: null,
    };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const topLevelBoxes: IsoBmffBoxSummary[] = [];
  const nestedTypes = new Set<string>();
  let offset = 0;
  let majorBrand: string | null = null;
  let structuralError = false;

  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) {
      structuralError = true;
      break;
    }
    const size = view.getUint32(offset, false);
    if (size < 8 || offset + size > bytes.byteLength) {
      structuralError = true;
      break;
    }
    const type = readAscii(bytes, offset + 4, 4);
    topLevelBoxes.push({ type, offset, size });
    if (type === "ftyp" && size >= 12) {
      majorBrand = readAscii(bytes, offset + 8, 4);
    }
    if (type === "moov") {
      scanNestedBoxes(bytes, view, offset + 8, offset + size, nestedTypes);
    }
    offset += size;
  }

  const hasFtyp = topLevelBoxes.some((box) => box.type === "ftyp");
  const hasMdat = topLevelBoxes.some((box) => box.type === "mdat");
  const hasMoov = topLevelBoxes.some((box) => box.type === "moov");
  const hasAvc1 = nestedTypes.has("avc1");
  const hasAvcC = nestedTypes.has("avcC");

  return {
    isValid: !structuralError && offset === bytes.byteLength && hasFtyp && hasMdat && hasMoov && hasAvc1 && hasAvcC,
    totalBytes: bytes.byteLength,
    topLevelBoxes,
    hasFtyp,
    hasMdat,
    hasMoov,
    hasAvc1,
    hasAvcC,
    majorBrand,
  };
}

// ── MP4 컨테이너 조립기 ──────────────────────────────────────────────────

/**
 * 최소 규격 AVCDecoderConfigurationRecord(High Profile 4.0, 4바이트 NAL 길이 접두).
 * 실제 VideoEncoder가 `decoderConfig.description`을 주면 그 원본을 우선 사용하고,
 * 인코더 메타데이터가 생략된 합성·프리뷰 경로에서만 폴백으로 사용한다.
 */
export const FALLBACK_AVCC_DESCRIPTION = new Uint8Array([
  0x01, 0x64, 0x00, 0x28, 0xff, 0xe1, 0x00, 0x09, 0x67, 0x64, 0x00, 0x28, 0xac, 0xd9, 0x40, 0x44, 0x05,
  0x01, 0x00, 0x04, 0x68, 0xee, 0x3c, 0x80,
]);

export interface ShortsEncodedChunkRecord {
  readonly data: Uint8Array;
  readonly timestampUs: number;
  readonly durationUs: number;
  readonly keyFrame: boolean;
}

export type ShortsMuxChunkInput = ShortsEncodedChunkRecord | EncodedVideoChunkLike;

export interface ShortsMp4AssembleConfig {
  readonly width: number;
  readonly height: number;
  readonly fps: ShortsFps;
  readonly codecString?: string;
  readonly codecPrivate?: Uint8Array | null;
  readonly timescale?: number;
}

export interface ShortsMp4ContainerResult {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly codecString: string;
  readonly width: number;
  readonly height: number;
  readonly sampleCount: number;
  readonly keyFrameCount: number;
  readonly durationUs: number;
  readonly inspection: IsoBmffInspectionResult;
  readonly usedEncoderAvcC: boolean;
}

function bufferSourceToUint8Array(source: AllowSharedBufferSource): Uint8Array {
  if (source instanceof Uint8Array) return new Uint8Array(source);
  if (ArrayBuffer.isView(source)) {
    return new Uint8Array(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength));
  }
  return new Uint8Array(source.slice(0));
}

function isEncodedVideoChunkLike(chunk: ShortsMuxChunkInput): chunk is EncodedVideoChunkLike {
  return "copyTo" in chunk && typeof chunk.copyTo === "function";
}

export function captureEncodedVideoChunk(
  chunk: EncodedVideoChunkLike,
  metadata?: EncodedVideoChunkMetadataLike,
): {
  readonly record: ShortsEncodedChunkRecord;
  readonly codecPrivate: Uint8Array | null;
} {
  const data = new Uint8Array(chunk.byteLength);
  chunk.copyTo(data);
  const rawDescription = metadata?.decoderConfig?.description;
  const codecPrivate = rawDescription ? bufferSourceToUint8Array(rawDescription) : null;
  return {
    record: {
      data,
      timestampUs: chunk.timestamp,
      durationUs: chunk.duration ?? 0,
      keyFrame: chunk.type === "key",
    },
    codecPrivate,
  };
}

/**
 * 수집된 VideoEncoder 청크 배열을 기존 `studio-webcodecs-mp4`의 `muxMp4`로 조립해
 * ISO-BMFF(`ftyp`·`mdat`·`moov`) 검증을 통과한 실제 `.mp4` `Uint8Array`를 돌려준다.
 */
export function assembleShortsMp4Container(
  encodedChunks: readonly ShortsMuxChunkInput[],
  config: ShortsMp4AssembleConfig,
): ShortsMp4ContainerResult {
  if (encodedChunks.length === 0) {
    throw new Error("MP4 컨테이너를 조립할 인코딩 청크가 비어 있어요.");
  }

  const width = evenDimension(config.width);
  const height = evenDimension(config.height);
  const defaultFrameDurationUs = Math.max(1, Math.round(1_000_000 / config.fps));
  const codecString = config.codecString?.trim() || AVC1_CODEC_CANDIDATES[1] || "avc1.640028";
  const usedEncoderAvcC = Boolean(config.codecPrivate && config.codecPrivate.byteLength > 0);
  const codecPrivate =
    usedEncoderAvcC && config.codecPrivate ? new Uint8Array(config.codecPrivate) : FALLBACK_AVCC_DESCRIPTION;

  const samples: Mp4SampleInput[] = encodedChunks.map((item, index) => {
    if (isEncodedVideoChunkLike(item)) {
      const captured = captureEncodedVideoChunk(item).record;
      return {
        data: captured.data,
        timestampUs: Math.max(0, captured.timestampUs),
        durationUs: captured.durationUs > 0 ? captured.durationUs : defaultFrameDurationUs,
        keyFrame: index === 0 ? true : captured.keyFrame,
      };
    }
    return {
      data: item.data,
      timestampUs: Math.max(0, item.timestampUs),
      durationUs: item.durationUs > 0 ? item.durationUs : defaultFrameDurationUs,
      keyFrame: index === 0 ? true : item.keyFrame,
    };
  });

  const muxed = muxMp4({
    width,
    height,
    codecPrivate,
    samples,
    timescale: config.timescale,
  });

  const inspection = inspectIsoBmffBoxes(muxed.bytes);
  if (!inspection.isValid) {
    throw new Error("조립된 MP4 ISO-BMFF 박스 무결성 검증에 실패했어요.");
  }

  return {
    bytes: muxed.bytes,
    mimeType: mp4MimeType(codecString),
    codecString,
    width,
    height,
    sampleCount: muxed.sampleCount,
    keyFrameCount: samples.filter((sample) => sample.keyFrame).length,
    durationUs: muxed.durationUs,
    inspection,
    usedEncoderAvcC,
  };
}

// ── End-to-End 숏폼 MP4 + WAV + 자막 익스포트 오케스트레이터 ─────────────

export interface ShortsMp4ExportRuntimeDeps {
  readonly probe?: StudioVideoEncoderProbe;
  readonly createEncoder?: (handlers: {
    output(chunk: EncodedVideoChunkLike, metadata?: EncodedVideoChunkMetadataLike): void;
    error(error: unknown): void;
  }) => VideoEncoderLike;
  readonly createFrame?: (
    frame: ShortsTimelineFrame,
    timeline: CompiledShortsTimeline,
  ) => Promise<VideoFrameLike> | VideoFrameLike;
  readonly yieldToUi?: () => Promise<void>;
}

export interface ShortsMp4ExportProgress {
  readonly stage: "probing" | "encoding" | "muxing" | "synthesizing-audio" | "completed";
  readonly processedFrames: number;
  readonly totalFrames: number;
  readonly percent: number;
}

export type ShortsEncodingBackend = "webcodecs-hw-avc1" | "webcodecs-sw-avc1" | "synthetic-preview-mp4";

export interface ShortsMp4ExportOptions {
  readonly includeAudio?: boolean;
  readonly wavOptions?: ShortsWavSynthOptions;
  readonly allowSyntheticFallback?: boolean;
  readonly maxQueueSize?: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ShortsMp4ExportProgress) => void;
  readonly deps?: ShortsMp4ExportRuntimeDeps;
}

export interface ShortsMp4ExportPackageResult {
  readonly backend: ShortsEncodingBackend;
  readonly mp4: ShortsMp4ContainerResult;
  readonly wav: ShortsWavTrackResult | null;
  readonly webVtt: string;
  readonly srt: string;
  readonly timeline: CompiledShortsTimeline;
}

interface BrowserVideoEncoderConstructor {
  new (init: {
    output(chunk: EncodedVideoChunkLike, metadata?: EncodedVideoChunkMetadataLike): void;
    error(error: unknown): void;
  }): VideoEncoderLike;
  isConfigSupported(config: VideoEncoderConfig): Promise<{ supported?: boolean }>;
}

interface BrowserVideoFrameConstructor {
  new (
    source: CanvasImageSource,
    init: { timestamp: number; duration?: number },
  ): VideoFrameLike;
}

function resolveBrowserWebCodecs(): {
  readonly VideoEncoderCtor?: BrowserVideoEncoderConstructor;
  readonly VideoFrameCtor?: BrowserVideoFrameConstructor;
} {
  const g = globalThis as {
    readonly VideoEncoder?: BrowserVideoEncoderConstructor;
    readonly VideoFrame?: BrowserVideoFrameConstructor;
  };
  return {
    VideoEncoderCtor: typeof g.VideoEncoder === "function" ? g.VideoEncoder : undefined,
    VideoFrameCtor: typeof g.VideoFrame === "function" ? g.VideoFrame : undefined,
  };
}

function createCanvasFrameForShorts(
  frame: ShortsTimelineFrame,
  timeline: CompiledShortsTimeline,
  VideoFrameCtor: BrowserVideoFrameConstructor,
): VideoFrameLike {
  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(timeline.width, timeline.height)
      : document.createElement("canvas");
  if ("width" in canvas) {
    canvas.width = timeline.width;
    canvas.height = timeline.height;
  }
  const ctx = canvas.getContext("2d");
  if (ctx && "fillRect" in ctx) {
    ctx.fillStyle = "rgb(20, 22, 28)";
    ctx.fillRect(0, 0, timeline.width, timeline.height);
    ctx.save();
    ctx.globalAlpha = frame.opacity;
    ctx.translate(
      timeline.width / 2 + frame.pose.translateXPx * 0.25,
      timeline.height / 2 + frame.pose.translateYPx * 0.25,
    );
    ctx.scale(frame.pose.scale, frame.pose.scale);
    ctx.fillStyle = "rgb(42, 48, 62)";
    ctx.fillRect(-timeline.width * 0.36, -timeline.height * 0.36, timeline.width * 0.72, timeline.height * 0.72);
    ctx.restore();
    if (frame.activeDialogue) {
      ctx.fillStyle = "rgb(248, 250, 252)";
      ctx.font = `600 ${Math.round(timeline.width * 0.04)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(frame.activeDialogue, timeline.width / 2, timeline.height * 0.84, timeline.width * 0.84);
    }
  }
  return new VideoFrameCtor(canvas, { timestamp: frame.timestampUs, duration: frame.durationUs });
}

function buildSyntheticAvccSample(frame: ShortsTimelineFrame): ShortsEncodedChunkRecord {
  const payloadLength = frame.keyFrame ? 16 : 8;
  const data = new Uint8Array(4 + payloadLength);
  const view = new DataView(data.buffer);
  view.setUint32(0, payloadLength, false);
  data[4] = frame.keyFrame ? 0x65 : 0x41;
  data[5] = frame.cutIndex & 0xff;
  data[6] = frame.frameIndex & 0xff;
  data[7] = (frame.frameIndex >>> 8) & 0xff;
  for (let i = 8; i < data.byteLength; i += 1) {
    data[i] = ((frame.frameIndex + i * 17) ^ 0x5a) & 0xff;
  }
  return {
    data,
    timestampUs: frame.timestampUs,
    durationUs: frame.durationUs,
    keyFrame: frame.keyFrame,
  };
}

/**
 * 컴파일된 숏폼 타임라인으로부터 실제 MP4 바이너리 + RIFF/WAVE 오디오 + WebVTT/SRT 패키지를 생성한다.
 */
export async function encodeAndAssembleShortsPackage(
  timeline: CompiledShortsTimeline,
  options?: ShortsMp4ExportOptions,
): Promise<ShortsMp4ExportPackageResult> {
  const totalFrames = timeline.frames.length;
  if (totalFrames === 0) {
    throw new Error("내보낼 타임라인 프레임이 없어요.");
  }

  const yieldToUi = options?.deps?.yieldToUi ?? createDefaultWebCodecsYield();
  const maxQueueSize = Math.max(1, Math.round(options?.maxQueueSize ?? 8));
  const includeAudio = options?.includeAudio ?? true;
  const allowSyntheticFallback = options?.allowSyntheticFallback ?? true;

  options?.onProgress?.({ stage: "probing", processedFrames: 0, totalFrames, percent: 2 });

  const browser = resolveBrowserWebCodecs();
  const browserEncoderCtor = browser.VideoEncoderCtor;
  const probe: StudioVideoEncoderProbe | null =
    options?.deps?.probe ??
    (browserEncoderCtor
      ? { isConfigSupported: (config) => browserEncoderCtor.isConfigSupported(config) }
      : null);

  const probed = probe
    ? await probeAvc1EncoderConfig({ width: timeline.width, height: timeline.height, fps: timeline.fps }, probe)
    : null;

  const canRunWebCodecs = Boolean(
    probed &&
      (options?.deps?.createEncoder || (browserEncoderCtor && browser.VideoFrameCtor)),
  );

  let backend: ShortsEncodingBackend = "synthetic-preview-mp4";
  const collectedChunks: ShortsEncodedChunkRecord[] = [];
  let capturedAvcC: Uint8Array | null = null;
  let selectedCodecString = probed?.codecString ?? AVC1_CODEC_CANDIDATES[1] ?? "avc1.640028";

  if (canRunWebCodecs && probed) {
    backend = probed.hardwarePreferenceAccepted ? "webcodecs-hw-avc1" : "webcodecs-sw-avc1";
    selectedCodecString = probed.codecString;
    let encoderError: unknown = null;

    const createEncoderFn =
      options?.deps?.createEncoder ??
      ((handlers) => {
        if (!browserEncoderCtor) {
          throw new Error("VideoEncoder 생성자를 찾을 수 없어요.");
        }
        return new browserEncoderCtor(handlers);
      });

    const encoder = createEncoderFn({
      output(chunk, metadata) {
        const captured = captureEncodedVideoChunk(chunk, metadata);
        if (captured.codecPrivate && !capturedAvcC) {
          capturedAvcC = captured.codecPrivate;
        }
        collectedChunks.push(captured.record);
      },
      error(error) {
        encoderError = error;
      },
    });

    const encoderConfig: Avc1VideoEncoderConfig = buildAvc1VideoEncoderConfig({
      width: timeline.width,
      height: timeline.height,
      fps: timeline.fps,
      codecString: probed.codecString,
      bitrate: recommendAvc1Bitrate(timeline.width, timeline.height, timeline.fps),
      hardwareAcceleration: probed.hardwarePreferenceAccepted ? "prefer-hardware" : "no-preference",
    });

    try {
      encoder.configure(encoderConfig);
      for (let i = 0; i < totalFrames; i += 1) {
        if (options?.signal?.aborted) {
          throw new DOMException("숏폼 MP4 내보내기가 취소되었습니다.", "AbortError");
        }
        if (encoderError) {
          throw new Error("WebCodecs VideoEncoder 인코딩 중 오류가 발생했어요.");
        }
        let guard = 0;
        while (encoder.encodeQueueSize >= maxQueueSize && !options?.signal?.aborted && !encoderError) {
          await yieldToUi();
          guard += 1;
          if (guard > 50_000) throw new Error("인코더 큐가 응답하지 않아 중단했어요.");
        }
        const frameSpec = timeline.frames[i];
        if (!frameSpec) continue;

        const videoFrame = options?.deps?.createFrame
          ? await options.deps.createFrame(frameSpec, timeline)
          : browser.VideoFrameCtor
            ? createCanvasFrameForShorts(frameSpec, timeline, browser.VideoFrameCtor)
            : { close: () => undefined };
        try {
          encoder.encode(videoFrame, { keyFrame: frameSpec.keyFrame });
        } finally {
          videoFrame.close();
        }

        if ((i + 1) % 15 === 0 || i === totalFrames - 1) {
          options?.onProgress?.({
            stage: "encoding",
            processedFrames: i + 1,
            totalFrames,
            percent: Math.round(((i + 1) / totalFrames) * 75),
          });
        }
      }

      await encoder.flush();
      if (encoderError) {
        throw new Error("WebCodecs VideoEncoder 플러시 중 오류가 발생했어요.");
      }
    } finally {
      try {
        encoder.close();
      } catch {
        // 이미 닫힌 인코더는 무시한다.
      }
    }
  } else if (allowSyntheticFallback) {
    for (let i = 0; i < totalFrames; i += 1) {
      if (options?.signal?.aborted) {
        throw new DOMException("숏폼 MP4 내보내기가 취소되었습니다.", "AbortError");
      }
      const frameSpec = timeline.frames[i];
      if (!frameSpec) continue;
      collectedChunks.push(buildSyntheticAvccSample(frameSpec));
    }
    options?.onProgress?.({ stage: "encoding", processedFrames: totalFrames, totalFrames, percent: 75 });
  } else {
    throw new Error("이 브라우저에서는 WebCodecs avc1 하드웨어 인코딩을 지원하지 않아요.");
  }

  options?.onProgress?.({ stage: "muxing", processedFrames: totalFrames, totalFrames, percent: 84 });

  const mp4 = assembleShortsMp4Container(collectedChunks, {
    width: timeline.width,
    height: timeline.height,
    fps: timeline.fps,
    codecString: selectedCodecString,
    codecPrivate: capturedAvcC,
  });

  options?.onProgress?.({ stage: "synthesizing-audio", processedFrames: totalFrames, totalFrames, percent: 92 });

  const wav = includeAudio ? synthesizeShortsWavTrack(timeline, options?.wavOptions) : null;

  options?.onProgress?.({ stage: "completed", processedFrames: totalFrames, totalFrames, percent: 100 });

  return {
    backend,
    mp4,
    wav,
    webVtt: timeline.webVtt,
    srt: timeline.srt,
    timeline,
  };
}

// ── 다운로드 Blob / 파일명 유틸 ──────────────────────────────────────────

function toArrayBufferCopy(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

export function createShortsBinaryBlob(bytes: Uint8Array, mimeType: string): Blob {
  return new Blob([toArrayBufferCopy(bytes)], { type: mimeType });
}

export function createShortsTextBlob(text: string, mimeType: string): Blob {
  return new Blob([text], { type: mimeType });
}

export function buildShortsExportFileName(
  projectTitle: string,
  aspectRatio: ShortsAspectRatio,
  extension: "mp4" | "wav" | "vtt" | "srt",
): string {
  const slug = projectTitle
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  const safeBase = slug || "toonstudio-shorts";
  const ratioSlug = aspectRatio.replace(":", "x");
  return `${safeBase}-${ratioSlug}.${extension}`;
}
