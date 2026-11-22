/**
 * ₩0 로컬 숏폼 타임랩스 인코딩 용량 추정·자막(WebVTT/SRT) 직렬화·Canvas2D 프레임 합성기.
 */

import { formatBytes } from "../drawing/studio-timelapse";

import type {
  ShortformCameraIntensity,
  ShortformCodecId,
  ShortformEncodingEstimate,
  ShortformEvaluatedFrame,
  ShortformFps,
  ShortformSubtitleCue,
  ShortformTimelinePlan,
  WebtoonProcessStage,
} from "./timelapse-stage-types";

const CODEC_SPECS: Readonly<
  Record<
    ShortformCodecId,
    { readonly mimeType: string; readonly bitrateMultiplier: number; readonly renderSpeedFactor: number }
  >
> = {
  av1: { mimeType: "video/webm;codecs=av01.0.04M.08", bitrateMultiplier: 0.72, renderSpeedFactor: 1.45 },
  vp9: { mimeType: "video/webm;codecs=vp9", bitrateMultiplier: 1.0, renderSpeedFactor: 1.0 },
  h264: { mimeType: "video/mp4;codecs=avc1.640028", bitrateMultiplier: 1.28, renderSpeedFactor: 0.85 },
};

const MOTION_BITRATE_BOOST: Readonly<Record<ShortformCameraIntensity, number>> = {
  static: 0.9,
  subtle: 1.0,
  balanced: 1.12,
  cinematic: 1.24,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export interface EstimateShortformEncodingParams {
  readonly width: number;
  readonly height: number;
  readonly fps: ShortformFps;
  readonly totalDurationMs: number;
  readonly codec: ShortformCodecId;
  readonly intensity: ShortformCameraIntensity;
  readonly reducedMotion: boolean;
  readonly stageCount: number;
  readonly platformMaxDurationSec: number;
  readonly platformMaxFileSizeBytes: number;
  readonly platformLabelKo: string;
}

/**
 * 9:16(1080×1920)·1:1(1080×1080) 및 30/60fps 기준 브라우저 로컬 인코딩 용량·비트레이트·메모리를 추정한다.
 */
export function estimateShortformEncoding(
  params: EstimateShortformEncodingParams,
): ShortformEncodingEstimate {
  const {
    width,
    height,
    fps,
    totalDurationMs,
    codec,
    intensity,
    reducedMotion,
    stageCount,
    platformMaxDurationSec,
    platformMaxFileSizeBytes,
    platformLabelKo,
  } = params;

  const codecSpec = CODEC_SPECS[codec];
  const pixelScale = (width * height) / (1080 * 1920);
  const fpsScale = fps === 60 ? 1.48 : 1.0;
  const motionScale = reducedMotion ? 0.9 : MOTION_BITRATE_BOOST[intensity];
  // 1080×1920 @ 30fps VP9 기준 5.2Mbps(선화·식자 선명도 보존), 1:1 및 60fps에 비례 조정.
  const videoBitsPerSecond = Math.round(
    clamp(5_200_000 * pixelScale * fpsScale * motionScale * codecSpec.bitrateMultiplier, 1_200_000, 18_000_000),
  );
  const durationSec = Math.max(0, totalDurationMs / 1000);
  const estimatedVideoBytes = Math.round((durationSec * videoBitsPerSecond) / 8);
  const activeBuffers = Math.max(2, Math.min(stageCount, 5) + 1);
  const estimatedMemoryPeakBytes = width * height * 4 * activeBuffers;
  const estimatedLocalRenderSec = roundTo(
    Math.max(0.5, durationSec * (fps === 60 ? 0.55 : 0.32) * pixelScale * codecSpec.renderSpeedFactor),
    1,
  );

  const withinDurationLimit = durationSec <= platformMaxDurationSec + 0.05;
  const withinFileSizeLimit = estimatedVideoBytes <= platformMaxFileSizeBytes;
  const warnings: string[] = [];
  if (!withinDurationLimit) {
    warnings.push(
      `${platformLabelKo} 권장 최대 길이(${platformMaxDurationSec}초)를 초과합니다(현재 ${roundTo(durationSec, 1)}초).`,
    );
  }
  if (!withinFileSizeLimit) {
    warnings.push(
      `${platformLabelKo} 권장 업로드 용량 상한(${formatBytes(platformMaxFileSizeBytes)})을 초과할 수 있습니다.`,
    );
  }
  if (stageCount < 2) {
    warnings.push("공정 스냅샷이 1단계뿐이라 공정 디졸브 대신 단일 컷 카메라 연출로 생성됩니다.");
  }

  return Object.freeze({
    codec,
    mimeType: codecSpec.mimeType,
    videoBitsPerSecond,
    estimatedVideoBytes,
    estimatedSizeLabel: formatBytes(estimatedVideoBytes),
    estimatedMemoryPeakBytes,
    estimatedLocalRenderSec,
    localCostKrw: 0,
    withinDurationLimit,
    withinFileSizeLimit,
    warnings: Object.freeze(warnings),
  });
}

function formatVttTimestamp(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const millis = safe % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

/** 자막 큐를 표준 WebVTT 문자열로 직렬화한다. */
export function exportShortformSubtitlesWebVtt(
  cues: readonly ShortformSubtitleCue[],
): string {
  const lines = ["WEBVTT", ""];
  for (const cue of cues) {
    lines.push(String(cue.index));
    lines.push(`${formatVttTimestamp(cue.startMs)} --> ${formatVttTimestamp(cue.endMs)}`);
    lines.push(cue.text);
    lines.push("");
  }
  return lines.join("\n");
}

/** 자막 큐를 영상 편집기 호환 SRT 문자열로 직렬화한다. */
export function exportShortformSubtitlesSrt(
  cues: readonly ShortformSubtitleCue[],
): string {
  const lines: string[] = [];
  for (const cue of cues) {
    const start = formatVttTimestamp(cue.startMs).replace(".", ",");
    const end = formatVttTimestamp(cue.endMs).replace(".", ",");
    lines.push(String(cue.index), `${start} --> ${end}`, cue.text, "");
  }
  return lines.join("\n");
}

export interface ShortformCanvasStageSource {
  readonly source: CanvasImageSource;
  readonly width: number;
  readonly height: number;
}

/**
 * 로컬 Canvas2D 컨텍스트에 지정 시각의 숏폼 프레임(카메라 크롭 + 공정 크로스디졸브 + 안전 여백 자막)을 합성한다.
 */
export function renderShortformFrameWithEvaluation(
  ctx: CanvasRenderingContext2D,
  plan: ShortformTimelinePlan,
  frame: ShortformEvaluatedFrame,
  stageSources: Partial<Record<WebtoonProcessStage, ShortformCanvasStageSource>>,
  options: { readonly background?: string; readonly drawSubtitle?: boolean } = {},
): ShortformEvaluatedFrame {
  const bg = options.background ?? "#101014";
  ctx.save();
  try {
    ctx.globalAlpha = 1;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, plan.width, plan.height);

    const drawStage = (stage: WebtoonProcessStage | null, alpha: number) => {
      if (!stage || alpha <= 0) return;
      const img = stageSources[stage];
      if (!img) return;
      const sx = (frame.cropRectPx.x / plan.manuscriptWidth) * img.width;
      const sy = (frame.cropRectPx.y / plan.manuscriptHeight) * img.height;
      const sw = (frame.cropRectPx.width / plan.manuscriptWidth) * img.width;
      const sh = (frame.cropRectPx.height / plan.manuscriptHeight) * img.height;
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.drawImage(img.source, sx, sy, sw, sh, 0, 0, plan.width, plan.height);
    };

    if (frame.fromStage && frame.toStage && frame.fromStage !== frame.toStage) {
      drawStage(frame.fromStage, 1);
      drawStage(frame.toStage, frame.dissolveAlpha);
    } else {
      drawStage(frame.toStage, 1);
    }

    if (options.drawSubtitle !== false && frame.activeSubtitle) {
      ctx.globalAlpha = 0.82;
      const padX = Math.round(plan.width * 0.05);
      const boxH = Math.round(plan.height * 0.055);
      const y = Math.max(
        plan.platform.safeAreaPx.top,
        plan.height - plan.platform.safeAreaPx.bottom - boxH,
      );
      ctx.fillStyle = "rgba(12, 12, 16, 0.78)";
      ctx.fillRect(padX, y, plan.width - padX * 2, boxH);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#ffffff";
      ctx.font = `600 ${Math.max(20, Math.round(plan.width * 0.032))}px system-ui, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(frame.activeSubtitle.text, plan.width / 2, y + boxH / 2, plan.width - padX * 2.4);
    }
  } finally {
    ctx.restore();
  }
  return frame;
}
