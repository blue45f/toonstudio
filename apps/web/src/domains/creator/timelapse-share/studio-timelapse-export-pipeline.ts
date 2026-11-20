/**
 * 타임랩스 통합 내보내기·압축 파이프라인.
 *
 * `drawing/studio-timelapse.ts`에 구현된 2.65× 양자화 차분(Delta) 스트로크 압축,
 * 유휴 공백(Dead-Air) 자동 제거, 실행취소(Undo) 스트로크 자동 정리, 활동 히트맵 스파크라인을
 * 메인 에디터와 `timelapse-share/` 출고 워크플로로 통합한다.
 */

import {
  compressTimelapseIdleGaps,
  computeTimelapseActivityHeatmap,
  decodeTimelapseStrokeDelta,
  encodeTimelapseStrokeDelta,
  estimateTimelapseExportSize,
  formatBytes,
  formatTimelapseTime,
  getTimelapseDurationMs,
  measureStrokeDeltaCompression,
  removeTimelapseStrokeById,
  type CompactStrokeDeltaPacket,
  type TimelapseActivityHeatmap,
  type TimelapseExportEstimate,
  type TimelapseSession,
  type TimelapseStroke,
} from "../drawing/studio-timelapse";

export type TimelapseTargetDurationPreset = 15 | 30 | 60 | "original";

export interface TimelapseExportPipelineOptions {
  /** 목표 영상 길이(초). `"original"`이면 유휴 공백 제거 후 실제 길이 유지. */
  readonly targetDurationPreset?: TimelapseTargetDurationPreset;
  /** 스트로크 사이 허용할 최대 정지 구간(ms, 기본 400). */
  readonly maxIdleGapMs?: number;
  /** 첫 스트로크 전 허용 대기(ms, 기본 150). */
  readonly maxInitialDelayMs?: number;
  /** 실행취소(Undo)되어 최종 타임랩스에서 제거할 스트로크 ID 집합. */
  readonly undoneStrokeIds?: readonly string[];
  /** 출력 프레임레이트(기본 30fps). */
  readonly fps?: number;
  readonly width?: number;
  readonly height?: number;
  /** WebM/MP4 목표 비트레이트(기본 2.5Mbps). */
  readonly bitsPerSecond?: number;
  /** 스파크라인 히트맵 구간 수(기본 24). */
  readonly heatmapBuckets?: number;
}

export interface TimelapseCompressedArchiveV1 {
  readonly version: 1;
  readonly startedAtMs: number;
  readonly maxDurationMs: number;
  readonly endedAtMs: number | null;
  readonly originalDurationMs: number;
  readonly compactedDurationMs: number;
  readonly removedIdleMs: number;
  readonly prunedUndoCount: number;
  readonly rawJsonBytes: number;
  readonly compactJsonBytes: number;
  readonly compressionRatio: number;
  readonly maxCoordinateErrorPx: number;
  readonly packets: readonly CompactStrokeDeltaPacket[];
}

export interface TimelapseReplayFrameSpec {
  readonly frameIndex: number;
  readonly outputTimeMs: number;
  readonly sourceTimeMs: number;
  readonly progress01: number;
}

export interface TimelapseExportPipelineResult {
  readonly compactedSession: TimelapseSession;
  readonly archive: TimelapseCompressedArchiveV1;
  readonly heatmap: TimelapseActivityHeatmap;
  readonly targetDurationPreset: TimelapseTargetDurationPreset;
  readonly effectivePlaybackSpeed: number;
  readonly exportDurationMs: number;
  readonly exportDurationLabel: string;
  readonly frameCount: number;
  readonly fps: number;
  readonly estimatedBytes: number;
  readonly estimatedSizeLabel: string;
  readonly rawEstimate: TimelapseExportEstimate;
  readonly idleTimeSavedRatio: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * 실행취소(Undo)된 스트로크 목록을 일괄 정리한다.
 */
export function pruneUndoneTimelapseStrokes(
  session: TimelapseSession,
  undoneStrokeIds: readonly string[],
): { readonly session: TimelapseSession; readonly prunedCount: number } {
  if (undoneStrokeIds.length === 0 || session.strokes.length === 0) {
    return { session, prunedCount: 0 };
  }
  const uniqueIds = new Set(undoneStrokeIds.filter((id) => id.trim().length > 0));
  let current = session;
  let prunedCount = 0;
  for (const id of uniqueIds) {
    const beforeLen = current.strokes.length;
    current = removeTimelapseStrokeById(current, id);
    if (current.strokes.length < beforeLen) {
      prunedCount += beforeLen - current.strokes.length;
    }
  }
  return { session: current, prunedCount };
}

/**
 * 타임랩스 세션을 Undo 정리 → 유휴 공백 압축 → 양자화 델타 아카이브 → 활동 히트맵 →
 * 15/30/60초 목표 배속 계산 순으로 일괄 처리한다.
 */
export function runTimelapseExportPipeline(
  session: TimelapseSession,
  options: TimelapseExportPipelineOptions = {},
): TimelapseExportPipelineResult {
  const originalDurationMs = getTimelapseDurationMs(session);
  const { session: cleanedSession, prunedCount } = pruneUndoneTimelapseStrokes(
    session,
    options.undoneStrokeIds ?? [],
  );

  const compactedSession = compressTimelapseIdleGaps(cleanedSession, {
    maxIdleGapMs: options.maxIdleGapMs ?? 400,
    maxInitialDelayMs: options.maxInitialDelayMs ?? 150,
  });

  const compactedDurationMs = getTimelapseDurationMs(compactedSession);
  const removedIdleMs = Math.max(0, originalDurationMs - compactedDurationMs);
  const idleTimeSavedRatio =
    originalDurationMs > 0
      ? Math.round((removedIdleMs / originalDurationMs) * 1000) / 1000
      : 0;

  const packets: CompactStrokeDeltaPacket[] = [];
  let rawJsonBytes = 0;
  let compactJsonBytes = 0;
  let maxCoordinateErrorPx = 0;

  for (const stroke of compactedSession.strokes) {
    const metrics = measureStrokeDeltaCompression(stroke);
    rawJsonBytes += metrics.rawJsonBytes;
    compactJsonBytes += metrics.compactJsonBytes;
    if (metrics.maxCoordinateErrorPx > maxCoordinateErrorPx) {
      maxCoordinateErrorPx = metrics.maxCoordinateErrorPx;
    }
    packets.push(encodeTimelapseStrokeDelta(stroke));
  }

  const compressionRatio =
    compactJsonBytes > 0 ? Math.round((rawJsonBytes / compactJsonBytes) * 100) / 100 : 1;

  const archive: TimelapseCompressedArchiveV1 = {
    version: 1,
    startedAtMs: compactedSession.startedAtMs,
    maxDurationMs: compactedSession.maxDurationMs,
    endedAtMs: compactedSession.endedAtMs,
    originalDurationMs,
    compactedDurationMs,
    removedIdleMs,
    prunedUndoCount: prunedCount,
    rawJsonBytes,
    compactJsonBytes,
    compressionRatio,
    maxCoordinateErrorPx: Math.round(maxCoordinateErrorPx * 10000) / 10000,
    packets: Object.freeze(packets),
  };

  const heatmap = computeTimelapseActivityHeatmap(
    compactedSession,
    options.heatmapBuckets ?? 24,
  );

  const fps = Math.round(clamp(options.fps ?? 30, 1, 60));
  const preset = options.targetDurationPreset ?? 30;
  let effectivePlaybackSpeed = 1;
  let exportDurationMs = compactedDurationMs;

  if (preset !== "original" && compactedDurationMs > 0) {
    const targetMs = preset * 1000;
    effectivePlaybackSpeed = Math.round(clamp(compactedDurationMs / targetMs, 0.25, 64) * 100) / 100;
    exportDurationMs = Math.round(compactedDurationMs / effectivePlaybackSpeed);
  }

  const bitsPerSecond = Math.max(250_000, options.bitsPerSecond ?? 2_500_000);
  const frameCount = exportDurationMs > 0 ? Math.max(1, Math.ceil((exportDurationMs / 1000) * fps)) : 0;
  const estimatedBytes = Math.round(((exportDurationMs / 1000) * bitsPerSecond) / 8);

  const rawEstimate = estimateTimelapseExportSize(compactedSession, {
    fps,
    width: options.width,
    height: options.height,
    bitsPerSecond,
  });

  return {
    compactedSession,
    archive,
    heatmap,
    targetDurationPreset: preset,
    effectivePlaybackSpeed,
    exportDurationMs,
    exportDurationLabel: formatTimelapseTime(exportDurationMs),
    frameCount,
    fps,
    estimatedBytes,
    estimatedSizeLabel: formatBytes(estimatedBytes),
    rawEstimate,
    idleTimeSavedRatio,
  };
}

/**
 * 양자화 델타 아카이브에서 재생 가능한 `TimelapseSession`을 무손실(오차 <= 0.01px) 복원한다.
 */
export function restoreTimelapseSessionFromArchive(
  archive: TimelapseCompressedArchiveV1,
): TimelapseSession {
  const strokes: TimelapseStroke[] = archive.packets.map((packet) =>
    decodeTimelapseStrokeDelta(packet),
  );
  return {
    strokes: Object.freeze(strokes),
    startedAtMs: archive.startedAtMs,
    maxDurationMs: archive.maxDurationMs,
    endedAtMs: archive.endedAtMs,
  };
}

/**
 * WebCodecs/MediaRecorder 인코더가 프레임 단위로 호출할 재생 타임스탬프 일정을 생성한다.
 */
export function planTimelapseReplayFrames(
  result: TimelapseExportPipelineResult,
): readonly TimelapseReplayFrameSpec[] {
  const { frameCount, fps, exportDurationMs, compactedSession } = result;
  const sourceDurationMs = getTimelapseDurationMs(compactedSession);
  if (frameCount <= 0 || sourceDurationMs <= 0) return [];

  const frameStepMs = 1000 / fps;
  const frames: TimelapseReplayFrameSpec[] = [];
  for (let i = 0; i < frameCount; i += 1) {
    const progress01 = frameCount > 1 ? i / (frameCount - 1) : 1;
    frames.push({
      frameIndex: i,
      outputTimeMs: Math.round(Math.min(exportDurationMs, i * frameStepMs)),
      sourceTimeMs: Math.round(sourceDurationMs * progress01),
      progress01: Math.round(progress01 * 10000) / 10000,
    });
  }
  return Object.freeze(frames);
}
