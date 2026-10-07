/**
 * Studio WebCodecs — H.264/MP4 내보내기 오케스트레이터.
 *
 * studio-webcodecs-video-export(WebM)의 짝이다. 인코더 루프(백프레셔·키프레임
 * 지정·취소·청크 수집)는 같은 규약을 따르고, 컨테이너 조립만 순수 muxer
 * (studio-webcodecs-mp4)가 맡는다. 브라우저 접촉은 WebCodecsVideoExportDeps
 * 주입 심으로 격리돼 있어 가짜 인코더로 전 흐름을 검증할 수 있다.
 *
 * MP4 전제: 인코더 설정에 avc.format="avc"를 넣어 청크가 AVCC 포맷으로 나오고,
 * output 메타데이터의 decoderConfig.description으로 avcC를 받아야 한다.
 * avcC가 끝내 오지 않으면 MP4를 만들 수 없어 오류로 끝낸다(폴백은 호출부의 몫).
 */

import { mp4MimeType, muxMp4 } from "../studio-webcodecs-mp4";
import type { StudioVideoEncoderProbe } from "../studio-webcodecs-capability";
import type { StudioVideoTimeline } from "../studio-webcodecs-timeline";

import {
  WebCodecsExportCancelledError,
  type WebCodecsVideoExportDeps,
  type WebCodecsVideoExportProgress,
} from "./studio-webcodecs-video-export";

// ── AVC 인코더 설정 ───────────────────────────────────────────────────

/** VideoEncoderConfig의 avc 확장 — TS 표준 타입에 없어 좁게 선언한다. */
export interface Avc1VideoEncoderConfig extends VideoEncoderConfig {
  avc: { format: "avc" | "annexb" };
}

/** 탐지 순서 — 높은 프로파일/레벨부터. 문자열: profile_idc·제약 플래그·level_idc. */
export const AVC1_CODEC_CANDIDATES: readonly string[] = [
  "avc1.640033", // High @ 5.1
  "avc1.640028", // High @ 4.0
  "avc1.4d0028", // Main @ 4.0
  "avc1.42001f", // Baseline @ 3.1
];

// 기존 WebM 경로와 같은 0.12bpp 기준선. H.264는 최신 코덱보다 효율이 낮아 1.25배.
const AVC_BITS_PER_PIXEL = 0.12 * 1.25;
const MIN_BITRATE = 2_500_000;
const MAX_BITRATE = 16_000_000;

/** 해상도·fps 기준 H.264 권장 비트레이트(bps). 순수. */
export function recommendAvc1Bitrate(width: number, height: number, fps: number): number {
  const raw = width * height * fps * AVC_BITS_PER_PIXEL;
  return Math.round(Math.min(MAX_BITRATE, Math.max(MIN_BITRATE, raw)));
}

/** H.264 4:2:0은 짝수 크기를 요구한다 — 내림으로 맞춘다(최소 2). */
export function evenDimension(value: number): number {
  const floored = Math.floor(value);
  return Math.max(2, floored - (floored % 2));
}

export interface Avc1EncoderConfigRequest {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly bitrate?: number;
  readonly codecString: string;
  readonly hardwareAcceleration?: HardwareAcceleration;
}

/** avc.format="avc"(AVCC 청크 + avcC 설명)를 단 VideoEncoderConfig. 순수. */
export function buildAvc1VideoEncoderConfig(request: Avc1EncoderConfigRequest): Avc1VideoEncoderConfig {
  const width = evenDimension(request.width);
  const height = evenDimension(request.height);
  const fps = Math.max(1, Math.round(request.fps));
  return {
    codec: request.codecString,
    width,
    height,
    framerate: fps,
    bitrate: request.bitrate ?? recommendAvc1Bitrate(width, height, fps),
    bitrateMode: "variable",
    hardwareAcceleration: request.hardwareAcceleration ?? "no-preference",
    latencyMode: "quality",
    contentHint: "detail",
    avc: { format: "avc" },
  };
}

export interface Avc1ProbeResult {
  readonly config: Avc1VideoEncoderConfig;
  readonly codecString: string;
  readonly hardwarePreferenceAccepted: boolean;
}

/**
 * 후보 코덱 문자열 × (prefer-hardware → no-preference) 순으로 탐지해
 * 처음 지원되는 설정을 돌려준다. 전부 미지원이면 null.
 */
export async function probeAvc1EncoderConfig(
  request: Omit<Avc1EncoderConfigRequest, "codecString" | "hardwareAcceleration">,
  probe: StudioVideoEncoderProbe,
): Promise<Avc1ProbeResult | null> {
  for (const hardwareAcceleration of ["prefer-hardware", "no-preference"] as const) {
    for (const codecString of AVC1_CODEC_CANDIDATES) {
      const config = buildAvc1VideoEncoderConfig({ ...request, codecString, hardwareAcceleration });
      try {
        const support = await probe.isConfigSupported(config);
        if (support?.supported === true) {
          return { config, codecString, hardwarePreferenceAccepted: hardwareAcceleration === "prefer-hardware" };
        }
      } catch {
        // 미지원 코덱 문자열에 throw하는 구현이 있어 예외도 "미지원"으로 취급한다.
      }
    }
  }
  return null;
}

// ── 내보내기 실행 ─────────────────────────────────────────────────────

export interface WebCodecsMp4ExportRequest {
  readonly timeline: StudioVideoTimeline;
  readonly config: Avc1VideoEncoderConfig;
  readonly codecString?: string;
  readonly maxQueueSize?: number;
  readonly onProgress?: (progress: WebCodecsVideoExportProgress) => void;
  readonly deps: WebCodecsVideoExportDeps;
}

export interface WebCodecsMp4ExportResult {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly durationSec: number;
  readonly frameCount: number;
  readonly keyFrameCount: number;
  readonly codecString: string;
}

export interface WebCodecsMp4ExportHandle {
  readonly done: Promise<WebCodecsMp4ExportResult>;
  cancel(): void;
}

const DEFAULT_MAX_QUEUE_SIZE = 8;

/** MP4 내보내기를 시작한다. 취소 규약은 WebM 경로와 같다(WebCodecsExportCancelledError). */
export function startWebCodecsMp4Export(request: WebCodecsMp4ExportRequest): WebCodecsMp4ExportHandle {
  const state = { cancelled: false };
  return {
    done: runWebCodecsMp4Export(request, state),
    cancel() {
      state.cancelled = true;
    },
  };
}

async function runWebCodecsMp4Export(
  request: WebCodecsMp4ExportRequest,
  state: { cancelled: boolean },
): Promise<WebCodecsMp4ExportResult> {
  const { timeline, deps } = request;
  const total = timeline.frames.length;
  if (total === 0) throw new Error("내보낼 프레임이 없어요.");
  if (!timeline.frames[0]!.keyFrame) throw new Error("타임라인 첫 프레임이 키프레임이 아니에요.");

  const maxQueueSize = Math.max(1, Math.round(request.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE));
  const chunks: { data: Uint8Array; timestampUs: number; durationUs: number; keyFrame: boolean }[] = [];
  let codecPrivate: Uint8Array | null = null;
  let encoderError: unknown = null;

  const encoder = deps.createEncoder({
    output(chunk, metadata) {
      const description = metadata?.decoderConfig?.description;
      if (description && !codecPrivate) codecPrivate = toBytes(description);
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      chunks.push({
        data,
        timestampUs: chunk.timestamp,
        durationUs: chunk.duration ?? 0,
        keyFrame: chunk.type === "key",
      });
    },
    error(error) {
      encoderError = error;
    },
  });

  const throwIfBroken = (): void => {
    if (state.cancelled) throw new WebCodecsExportCancelledError();
    if (encoderError) throw new Error("영상 인코딩 중 오류가 발생했어요. 다시 시도해주세요.");
  };

  try {
    encoder.configure(request.config);
    for (let index = 0; index < total; index += 1) {
      throwIfBroken();
      let guard = 0;
      while (encoder.encodeQueueSize >= maxQueueSize && !state.cancelled && !encoderError) {
        await deps.yieldToUi();
        guard += 1;
        if (guard > 100_000) throw new Error("인코더 큐가 소진되지 않아요. 다시 시도해주세요.");
      }
      throwIfBroken();

      const spec = timeline.frames[index]!;
      const frame = await deps.createFrame(spec);
      try {
        encoder.encode(frame, { keyFrame: spec.keyFrame });
      } finally {
        frame.close();
      }
      request.onProgress?.({
        phase: "encode",
        encodedFrames: index + 1,
        totalFrames: total,
        ratio: (index + 1) / (total + 1),
      });
    }

    throwIfBroken();
    request.onProgress?.({ phase: "flush", encodedFrames: total, totalFrames: total, ratio: 1 });
    await encoder.flush();
    throwIfBroken();
    if (chunks.length === 0) throw new Error("인코딩된 영상 데이터가 없어요. 다시 시도해주세요.");
    if (!codecPrivate) throw new Error("인코더가 avcC 코덱 정보를 주지 않아 MP4를 만들 수 없어요.");

    request.onProgress?.({ phase: "finalize", encodedFrames: total, totalFrames: total, ratio: 1 });
    const muxed = muxMp4({
      width: request.config.width,
      height: request.config.height,
      codecPrivate,
      samples: chunks,
    });
    const codecString = request.codecString ?? request.config.codec;
    return {
      bytes: muxed.bytes,
      mimeType: mp4MimeType(codecString),
      durationSec: timeline.durationUs / 1_000_000,
      frameCount: chunks.length,
      keyFrameCount: chunks.filter((chunk) => chunk.keyFrame).length,
      codecString,
    };
  } finally {
    try {
      encoder.close();
    } catch {
      // 이미 닫힌 인코더 — 무시
    }
  }
}

function toBytes(source: AllowSharedBufferSource): Uint8Array {
  if (source instanceof Uint8Array) return new Uint8Array(source);
  if (ArrayBuffer.isView(source)) {
    return new Uint8Array(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength));
  }
  return new Uint8Array(source.slice(0));
}

/** 결과 바이트를 다운로드 가능한 Blob으로 — 브라우저 통합 지점에서만 쓴다. */
export function createWebCodecsMp4Blob(result: WebCodecsMp4ExportResult): Blob {
  return new Blob([result.bytes as unknown as BlobPart], { type: result.mimeType });
}

/** 파일명 규칙 — WebM 경로(`<제목>-motion.webm`)와 나란하게 유지한다. */
export function webCodecsMp4FileName(title: string): string {
  return `${title.trim() || "toonstudio"}-motion.mp4`;
}
