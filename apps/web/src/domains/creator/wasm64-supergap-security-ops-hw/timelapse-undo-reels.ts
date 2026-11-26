/**
 * #28 제로-오버헤드 XOR+RLE Undo-Log 타임랩스 릴스 생성기(buildTimelapseScheduleFromUndoLog).
 *
 * - 별도 화면 녹화·인코더 상시 가동(CPU/GPU 오버헤드 0%) 없이 기존 스튜디오 Undo/스트로크
 *   스냅샷을 XOR+RLE 무손실 델타로 압축 보관·재생한다.
 * - 누적 Undo 이벤트를 15초(900프레임) / 30초(1,800프레임) 60fps 속도 램핑 릴스/쇼츠
 *   프레임 스케줄로 자동 변환하며, 완성작 마지막 홀드 구간을 포함한다.
 */

export type TimelapseArtStage =
  | "rough"
  | "lineart"
  | "flatting"
  | "shading"
  | "effects"
  | "lettering";

export interface XorRleDeltaEncodingResult {
  readonly encodedBytes: Uint8Array;
  readonly rawByteLength: number;
  readonly compressedByteLength: number;
  readonly changedByteCount: number;
  /** 압축 후 크기 / 원본 크기 비율(낮을수록 고압축). */
  readonly compressionRatio: number;
}

export interface UndoTimelapseEvent {
  readonly eventId: string;
  readonly timestampMs: number;
  readonly stage: TimelapseArtStage;
  readonly rawFrameByteLength: number;
  readonly xorRleDeltaByteLength: number;
  /** 이전 스냅샷 대비 변화한 픽셀 비율(0~1). */
  readonly changedPixelRatio: number;
  /** 완성 컷 직전·선화 완료·명암 완성 등 강조할 마일스톤 여부. */
  readonly isMilestone?: boolean;
}

export type TimelapseSpeedCurve = "smooth-ramp" | "dramatic-finish" | "linear";

export interface BuildTimelapseScheduleInput {
  readonly workId: string;
  readonly cutId: string;
  readonly undoEvents: readonly UndoTimelapseEvent[];
  /** 목표 릴스 길이(15초 또는 30초, 기본 15초). */
  readonly targetDurationSec?: 15 | 30;
  /** 목표 프레임레이트(기본 60fps). */
  readonly fps?: 60 | 30;
  /** 완성작 정지 노출 시간(초, 미지정 시 15초->1.5s, 30초->2.5s). */
  readonly finalRevealHoldSec?: number;
  readonly speedCurve?: TimelapseSpeedCurve;
}

export interface TimelapseScheduledFrame {
  readonly frameIndex: number;
  readonly timestampSec: number;
  readonly sourceEventIndex: number;
  readonly sourceEventId: string;
  readonly stage: TimelapseArtStage;
  readonly isFinalHold: boolean;
  /** 원 작업 경과 속도 대비 현재 프레임의 상대 배속. */
  readonly speedMultiplier: number;
}

export interface TimelapseReelSchedule {
  readonly workId: string;
  readonly cutId: string;
  readonly targetDurationSec: 15 | 30;
  readonly fps: 60 | 30;
  readonly totalFrames: number;
  readonly activeFrames: number;
  readonly holdFrames: number;
  readonly speedCurve: TimelapseSpeedCurve;
  readonly screenRecordingOverheadPct: 0;
  readonly reusesExistingUndoLog: true;
  readonly sourceUndoEventCount: number;
  readonly totalRawUndoBytes: number;
  readonly totalXorRleBytes: number;
  readonly storageSavingsPct: number;
  readonly minSpeedMultiplier: number;
  readonly maxSpeedMultiplier: number;
  readonly averageSpeedMultiplier: number;
  readonly frames: readonly TimelapseScheduledFrame[];
}

const STAGE_VISUAL_INTEREST_WEIGHT: Readonly<Record<TimelapseArtStage, number>> = {
  rough: 1.25,
  lineart: 1.15,
  flatting: 0.72,
  shading: 1.4,
  effects: 1.5,
  lettering: 0.88,
};

/**
 * 이전 스냅샷과 다음 스냅샷의 바이트 XOR 차분을 PackBits 스타일 RLE로 무손실 압축.
 * - 헤더 0x80..0xFF: 동일 바이트 (header & 0x7F) + 3 회 반복 (3~130바이트)
 * - 헤더 0x00..0x7F: 비반복 리터럴 (header + 1) 바이트 (1~128바이트)
 */
export function encodeUndoXorRleDelta(
  previousFrame: Uint8Array,
  nextFrame: Uint8Array,
): XorRleDeltaEncodingResult {
  if (previousFrame.byteLength !== nextFrame.byteLength) {
    throw new Error("XOR+RLE 델타 인코딩 대상 프레임 크기가 일치하지 않습니다.");
  }
  const len = previousFrame.byteLength;
  const xorBuf = new Uint8Array(len);
  let changedByteCount = 0;

  for (let i = 0; i < len; i += 1) {
    const diff = previousFrame[i] ^ nextFrame[i];
    xorBuf[i] = diff;
    if (diff !== 0) {
      changedByteCount += 1;
    }
  }

  const out: number[] = [];
  let i = 0;
  while (i < len) {
    // 동일 바이트 연속 길이 탐색(최소 3바이트 이상일 때 반복 런 인코딩)
    let runLen = 1;
    while (i + runLen < len && runLen < 130 && xorBuf[i + runLen] === xorBuf[i]) {
      runLen += 1;
    }
    if (runLen >= 3) {
      out.push(0x80 | (runLen - 3));
      out.push(xorBuf[i]);
      i += runLen;
      continue;
    }

    // 비반복 리터럴 구간 수집(최대 128바이트, 3연속 반복 시작 전까지만)
    const litStart = i;
    let litLen = 0;
    while (i < len && litLen < 128) {
      if (
        i + 2 < len &&
        xorBuf[i] === xorBuf[i + 1] &&
        xorBuf[i] === xorBuf[i + 2]
      ) {
        break;
      }
      i += 1;
      litLen += 1;
    }
    out.push(litLen - 1);
    for (let k = 0; k < litLen; k += 1) {
      out.push(xorBuf[litStart + k]);
    }
  }

  const encodedBytes = new Uint8Array(out);
  const compressionRatio = len > 0 ? Number((encodedBytes.byteLength / len).toFixed(4)) : 1;

  return {
    encodedBytes,
    rawByteLength: len,
    compressedByteLength: encodedBytes.byteLength,
    changedByteCount,
    compressionRatio,
  };
}

/**
 * XOR+RLE 델타 스트림을 이전 스냅샷에 적용해 다음 스냅샷을 바이트 단위 무손실 복원.
 */
export function decodeUndoXorRleDelta(
  previousFrame: Uint8Array,
  encodedDelta: Uint8Array,
): Uint8Array {
  const expectedLen = previousFrame.byteLength;
  const xorBuf = new Uint8Array(expectedLen);
  let src = 0;
  let dst = 0;

  while (src < encodedDelta.byteLength) {
    const header = encodedDelta[src];
    src += 1;
    if ((header & 0x80) !== 0) {
      const count = (header & 0x7f) + 3;
      if (src >= encodedDelta.byteLength || dst + count > expectedLen) {
        throw new Error("손상된 XOR+RLE 반복 런 패킷입니다.");
      }
      const val = encodedDelta[src];
      src += 1;
      xorBuf.fill(val, dst, dst + count);
      dst += count;
    } else {
      const count = header + 1;
      if (src + count > encodedDelta.byteLength || dst + count > expectedLen) {
        throw new Error("손상된 XOR+RLE 리터럴 패킷입니다.");
      }
      xorBuf.set(encodedDelta.subarray(src, src + count), dst);
      src += count;
      dst += count;
    }
  }

  if (dst !== expectedLen) {
    throw new Error(
      `XOR+RLE 디코딩 길이 불일치: expected=${expectedLen}, decoded=${dst}`,
    );
  }

  const restored = new Uint8Array(expectedLen);
  for (let i = 0; i < expectedLen; i += 1) {
    restored[i] = previousFrame[i] ^ xorBuf[i];
  }
  return restored;
}

/** 정규화 진행률 u ∈ [0, 1]에 대한 속도 램핑 곡선 매핑(단조 비감소). */
function evaluateTemporalCurve(u: number, curve: TimelapseSpeedCurve): number {
  const clamped = Math.max(0, Math.min(1, u));
  if (curve === "linear") {
    return clamped;
  }
  if (curve === "dramatic-finish") {
    // 초반/중반을 빠르게 진행하고 후반 25% 명암·이펙트 완성 구간을 부드럽게 감속
    return Math.pow(clamped, 0.72);
  }
  // smooth-ramp: 초반 구도 공개 + 후반 마감 구간을 여유 있게 보여주고 중반 가속
  const smoothStep = clamped * clamped * (3 - 2 * clamped);
  return 0.65 * clamped + 0.35 * smoothStep;
}

/**
 * 기존 Undo-Log 스냅샷 이력을 15초/30초 60fps 속도 램핑 릴스 프레임 스케줄로 변환한다.
 * 화면 녹화 파이프라인을 전혀 사용하지 않으므로 녹화 CPU/GPU 오버헤드는 0%다.
 */
export function buildTimelapseScheduleFromUndoLog(
  input: BuildTimelapseScheduleInput,
): TimelapseReelSchedule {
  if (input.undoEvents.length === 0) {
    throw new Error("타임랩스를 생성하려면 최소 1개 이상의 Undo 스냅샷 이벤트가 필요합니다.");
  }

  const targetDurationSec: 15 | 30 = input.targetDurationSec ?? 15;
  const fps: 60 | 30 = input.fps ?? 60;
  const speedCurve: TimelapseSpeedCurve = input.speedCurve ?? "smooth-ramp";
  const defaultHoldSec = targetDurationSec === 30 ? 2.5 : 1.5;
  const holdSec = Math.max(
    0.5,
    Math.min(targetDurationSec * 0.3, input.finalRevealHoldSec ?? defaultHoldSec),
  );

  const totalFrames = targetDurationSec * fps;
  const holdFrames = Math.max(1, Math.round(holdSec * fps));
  const activeFrames = Math.max(1, totalFrames - holdFrames);
  const events = input.undoEvents;
  const eventCount = events.length;

  // 각 Undo 이벤트의 시각적 흥미·마일스톤 가중치 기반 누적 분포 구성
  const cumulative = new Float64Array(eventCount);
  let weightSum = 0;
  let totalRawUndoBytes = 0;
  let totalXorRleBytes = 0;

  for (let i = 0; i < eventCount; i += 1) {
    const ev = events[i];
    totalRawUndoBytes += Math.max(0, ev.rawFrameByteLength);
    totalXorRleBytes += Math.max(0, ev.xorRleDeltaByteLength);
    const stageWeight = STAGE_VISUAL_INTEREST_WEIGHT[ev.stage];
    const deltaWeight = 0.6 + Math.sqrt(Math.max(0.01, Math.min(1, ev.changedPixelRatio)));
    const milestoneBoost = ev.isMilestone ? 1.8 : 1.0;
    const w = speedCurve === "linear" ? 1 : stageWeight * deltaWeight * milestoneBoost;
    weightSum += w;
    cumulative[i] = weightSum;
  }

  for (let i = 0; i < eventCount; i += 1) {
    cumulative[i] /= Math.max(weightSum, 1e-9);
  }

  // 원 작업 경과 시간 기반 기준 배속 계산
  const firstTs = events[0].timestampMs;
  const lastTs = events[eventCount - 1].timestampMs;
  const originalSpanSec = Math.max(targetDurationSec, (lastTs - firstTs) / 1000);
  const basePlaybackMultiplier = originalSpanSec / Math.max(1, activeFrames / fps);

  const frames: TimelapseScheduledFrame[] = [];
  let minSpeed = Number.POSITIVE_INFINITY;
  let maxSpeed = 0;
  let speedSum = 0;
  let cursor = 0;

  for (let f = 0; f < totalFrames; f += 1) {
    const timestampSec = Number((f / fps).toFixed(4));
    if (f >= activeFrames) {
      const lastEventIdx = eventCount - 1;
      const lastEv = events[lastEventIdx];
      frames.push({
        frameIndex: f,
        timestampSec,
        sourceEventIndex: lastEventIdx,
        sourceEventId: lastEv.eventId,
        stage: lastEv.stage,
        isFinalHold: true,
        speedMultiplier: 0,
      });
      continue;
    }

    const u = activeFrames === 1 ? 1 : f / (activeFrames - 1);
    const uNext = activeFrames === 1 ? 1 : Math.min(1, (f + 1) / (activeFrames - 1));
    const targetProgress = evaluateTemporalCurve(u, speedCurve);
    const nextProgress = evaluateTemporalCurve(uNext, speedCurve);

    while (cursor < eventCount - 1 && cumulative[cursor] < targetProgress) {
      cursor += 1;
    }

    const slope = activeFrames > 1 ? Math.max(0.25, (nextProgress - targetProgress) * (activeFrames - 1)) : 1;
    const ev = events[cursor];
    const stageSpeedMod = 1 / STAGE_VISUAL_INTEREST_WEIGHT[ev.stage];
    const speedMultiplier = Number(
      Math.max(1, basePlaybackMultiplier * slope * stageSpeedMod).toFixed(2),
    );

    if (speedMultiplier < minSpeed) minSpeed = speedMultiplier;
    if (speedMultiplier > maxSpeed) maxSpeed = speedMultiplier;
    speedSum += speedMultiplier;

    frames.push({
      frameIndex: f,
      timestampSec,
      sourceEventIndex: cursor,
      sourceEventId: ev.eventId,
      stage: ev.stage,
      isFinalHold: false,
      speedMultiplier,
    });
  }

  const storageSavingsPct =
    totalRawUndoBytes > 0
      ? Number(((1 - totalXorRleBytes / totalRawUndoBytes) * 100).toFixed(2))
      : 0;

  return {
    workId: input.workId,
    cutId: input.cutId,
    targetDurationSec,
    fps,
    totalFrames,
    activeFrames,
    holdFrames,
    speedCurve,
    screenRecordingOverheadPct: 0,
    reusesExistingUndoLog: true,
    sourceUndoEventCount: eventCount,
    totalRawUndoBytes,
    totalXorRleBytes,
    storageSavingsPct,
    minSpeedMultiplier: Number.isFinite(minSpeed) ? minSpeed : 0,
    maxSpeedMultiplier: maxSpeed,
    averageSpeedMultiplier: Number((speedSum / activeFrames).toFixed(2)),
    frames,
  };
}
