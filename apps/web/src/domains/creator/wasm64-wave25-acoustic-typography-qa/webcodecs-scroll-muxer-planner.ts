/**
 * WebCodecs 60/120fps 세로 스크롤 릴 장면 전환 GOP 및 Leaky-Bucket VBV 비트레이트 플래너.
 *
 * - 세로형 웹툰 스크롤 릴 영상 인코딩(`VideoEncoder`)을 위해 무드리프트 정수 마이크로초 타임스탬프
 *   (`timestampUs = Math.round(frameIndex * 1_000_000 / fps)`)와 단조 증가 간격(`deltaUs > 0`)을 산출한다.
 * - 광학 흐름(`opticalFlowScore`)과 휘도 급변(`luminanceJump`)을 결합해 컷 전환·임팩트 프레임을 감지하고,
 *   `minGopFrames`·`maxGopFrames` 제약을 지키면서 장면 전환 정렬 IDR 키프레임을 강제 배치한다.
 * - Leaky-Bucket VBV(`Video Buffering Verifier`) 상태 머신으로 정적인 대사 홀드 구간에서 비트를 비축해
 *   고밀도 스크린톤·집중선 고속 패닝 구간에 배분하며, 언더플로·오버플로 0건 불변식을 보장한다.
 */

export const SUPPORTED_SCROLL_REEL_FPS = Object.freeze([60, 120] as const);

export type ScrollReelFps = (typeof SUPPORTED_SCROLL_REEL_FPS)[number];

export const DEFAULT_SCROLL_REEL_FPS: ScrollReelFps = 120;

export const DEFAULT_TARGET_BITRATE_BPS = 8_000_000 as const;

export const DEFAULT_SCENE_CUT_THRESHOLD = 0.56 as const;

export const DEFAULT_INITIAL_VBV_FULLNESS_RATIO = 0.78 as const;

export type VideoFrameCodingType = "IDR" | "P";

export type ScrollVbvBitrateMode = "vbr" | "cbr";

export type KeyframeDecisionReason =
  | "stream-start"
  | "scene-cut-idr"
  | "max-gop-ceiling"
  | "suppressed-by-min-gop"
  | "inter-prediction";

export type ScrollFrameComplexityClass =
  | "calm-dialogue-hold"
  | "steady-scroll"
  | "screentone-speedline-pan"
  | "scene-cut-impact";

export interface ScrollReelFrameTelemetry {
  readonly frameIndex?: number;
  /** 세로 스크롤 속도(`px/s`). */
  readonly scrollVelocityPxPerSec: number;
  /** 화면 내 광학 흐름 복잡도(`0.0`~`1.0+`). */
  readonly opticalFlowScore: number;
  /** 인접 프레임 간 평균·피크 휘도 도약폭(`0.0`~`1.0`). */
  readonly luminanceJump: number;
  /** 모아레에 취약한 스크린톤·집중선 고주파 밀도(`0.0`~`1.0`). */
  readonly screentoneDensity: number;
  /** 대사 가독을 위한 정지·저속 홀드 비중(`0.0`~`1.0`). */
  readonly dialogueHoldWeight?: number;
  /** 편집 타임라인에서 명시한 강제 컷 경계 여부. */
  readonly explicitCutMarker?: boolean;
}

export interface WebCodecsScrollMuxPlannerOptions {
  readonly fps?: ScrollReelFps;
  readonly widthPx?: number;
  readonly heightPx?: number;
  /** 비트레이트 운용 모드(`vbr` 기본: 정적 홀드 시 패딩 없이 저비트 유지, `cbr`: 고정 유입). */
  readonly bitrateMode?: ScrollVbvBitrateMode;
  /** 목표 평균 비트레이트(`bps`, 기본 `8_000_000`). */
  readonly targetBitrateBps?: number;
  /** VBR Leaky-Bucket 채널 최대 충전 속도(`bps`, 기본 `targetBitrateBps * 1.25`). */
  readonly vbvMaxRateBps?: number;
  /** 수신기 VBV 버퍼 총 용량(`bits`, 기본 `targetBitrateBps`의 1초 분량). */
  readonly vbvBufferSizeBits?: number;
  /** 초기 VBV 버퍼 충전 비율(`0.35`~`0.9`, 기본 `0.78`). */
  readonly initialVbvFullnessRatio?: number;
  /** 연속 IDR 남발을 막는 최소 GOP 프레임 간격. */
  readonly minGopFrames?: number;
  /** 탐색성(seekability) 보장을 위한 최대 GOP 프레임 간격. */
  readonly maxGopFrames?: number;
  /** 장면 전환 판정 임계 점수(`0.2`~`1.2`, 기본 `0.56`). */
  readonly sceneCutThreshold?: number;
}

export interface PlannedWebCodecsFrame {
  readonly frameIndex: number;
  readonly timestampUs: number;
  readonly durationUs: number;
  readonly deltaUs: number;
  readonly keyFrame: boolean;
  readonly codingType: VideoFrameCodingType;
  readonly keyframeReason: KeyframeDecisionReason;
  readonly gopIndex: number;
  readonly gopFrameOffset: number;
  readonly sceneCutScore: number;
  readonly isSceneCutDetected: boolean;
  readonly complexityClass: ScrollFrameComplexityClass;
  readonly perceptualWeight: number;
  readonly allocatedBits: number;
  readonly arrivingBits: number;
  readonly vbvPreRemovalBits: number;
  readonly vbvPostRemovalBits: number;
  readonly vbvPostReplenishBits: number;
  readonly vbvFullnessRatio: number;
  readonly recommendedQuantizerQp: number;
}

export interface WebCodecsScrollMuxPlan {
  readonly fps: ScrollReelFps;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly targetBitrateBps: number;
  readonly effectiveBitrateBps: number;
  readonly vbvBufferSizeBits: number;
  readonly initialVbvBits: number;
  readonly finalVbvBits: number;
  readonly minGopFrames: number;
  readonly maxGopFrames: number;
  readonly totalDurationUs: number;
  readonly frames: readonly PlannedWebCodecsFrame[];
  readonly keyframeIndices: readonly number[];
  readonly sceneCutKeyframeIndices: readonly number[];
  readonly suppressedSceneCutIndices: readonly number[];
  readonly vbvUnderflowCount: number;
  readonly vbvOverflowCount: number;
  readonly minVbvPostRemovalBits: number;
  readonly maxVbvPostReplenishBits: number;
  readonly monotonicTimestampValid: boolean;
  readonly averageCalmHoldBits: number;
  readonly averageActionPanBits: number;
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function roundRatio(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * 누적 부동소수점 드리프트가 없는 CFR 정수 마이크로초 타임스탬프를 계산한다.
 */
export function computeCfrTimestampUs(frameIndex: number, fps: ScrollReelFps): number {
  const safeIndex = Math.max(0, Math.floor(frameIndex));
  return Math.round((safeIndex * 1_000_000) / fps);
}

/**
 * 광학 흐름과 휘도 급변량, 명시적 컷 마커를 결합해 장면 전환 충격 점수를 산출한다.
 */
export function computeSceneCutShockScore(telemetry: ScrollReelFrameTelemetry): number {
  const luma = clamp01(telemetry.luminanceJump);
  const flow = clamp(telemetry.opticalFlowScore, 0, 1.5);
  const explicitBonus = telemetry.explicitCutMarker === true ? 1.0 : 0;
  const synergyBonus = luma >= 0.42 && flow >= 0.52 ? 0.14 : 0;
  return roundRatio(luma * 0.6 + flow * 0.4 + synergyBonus + explicitBonus);
}

function classifyScrollComplexity(
  telemetry: ScrollReelFrameTelemetry,
  isSceneCutDetected: boolean,
): ScrollFrameComplexityClass {
  if (isSceneCutDetected) {
    return "scene-cut-impact";
  }
  const screentone = clamp01(telemetry.screentoneDensity);
  const flow = clamp(telemetry.opticalFlowScore, 0, 1.5);
  const speedNorm = clamp(Math.abs(telemetry.scrollVelocityPxPerSec) / 2400, 0, 1.5);
  const hold = clamp01(telemetry.dialogueHoldWeight ?? 0);

  if (screentone >= 0.48 || flow >= 0.55 || speedNorm >= 0.65) {
    return "screentone-speedline-pan";
  }
  if (hold >= 0.45 || (flow <= 0.14 && speedNorm <= 0.15 && screentone <= 0.25)) {
    return "calm-dialogue-hold";
  }
  return "steady-scroll";
}

function computePerceptualFrameWeight(
  telemetry: ScrollReelFrameTelemetry,
  keyFrame: boolean,
  keyframeReason: KeyframeDecisionReason,
  complexityClass: ScrollFrameComplexityClass,
): number {
  const screentone = clamp01(telemetry.screentoneDensity);
  const flow = clamp(telemetry.opticalFlowScore, 0, 1.5);
  const speedNorm = clamp(Math.abs(telemetry.scrollVelocityPxPerSec) / 2400, 0, 1.5);
  const hold = clamp01(telemetry.dialogueHoldWeight ?? 0);

  // 고주파 스크린톤과 빠른 스크롤 구간은 블록 아티팩트·모아레 억제를 위해 가중치를 높인다.
  const detailBoost = 1.0 + screentone * 1.35 + flow * 0.9 + speedNorm * 0.45;
  const calmDiscount =
    complexityClass === "calm-dialogue-hold"
      ? 1.0 - 0.52 * Math.max(hold, 0.65)
      : 1.0 - 0.2 * hold;

  let pictureTypeBoost = 1.0;
  if (keyFrame) {
    pictureTypeBoost = 3.15;
  } else if (keyframeReason === "suppressed-by-min-gop") {
    pictureTypeBoost = 1.65;
  }

  return Math.max(0.18, detailBoost * calmDiscount * pictureTypeBoost);
}

function estimateQuantizerQp(
  allocatedBits: number,
  avgFrameBits: number,
  keyFrame: boolean,
  screentoneDensity: number,
): number {
  const safeAvg = Math.max(1, avgFrameBits);
  const effectiveRatio = allocatedBits / (keyFrame ? safeAvg * 2.6 : safeAvg);
  const baseQp = keyFrame ? 22 : 25;
  const bitDeltaQp = -6.0 * Math.log2(clamp(effectiveRatio, 0.25, 4.0));
  const toneGuardQp = -2.0 * clamp01(screentoneDensity);
  return Math.round(clamp(baseQp + bitDeltaQp + toneGuardQp, 12, 42));
}

interface FirstPassFrameMeta {
  readonly frameIndex: number;
  readonly timestampUs: number;
  readonly durationUs: number;
  readonly deltaUs: number;
  readonly keyFrame: boolean;
  readonly codingType: VideoFrameCodingType;
  readonly keyframeReason: KeyframeDecisionReason;
  readonly gopIndex: number;
  readonly gopFrameOffset: number;
  readonly sceneCutScore: number;
  readonly isSceneCutDetected: boolean;
  readonly complexityClass: ScrollFrameComplexityClass;
  readonly rawWeight: number;
}

/**
 * 60/120fps 세로 웹툰 스크롤 릴의 키프레임 스케줄과 VBV 무결성 비트 예산을 계획한다.
 */
export function planWebCodecsScrollReelMux(
  frames: readonly ScrollReelFrameTelemetry[],
  options?: WebCodecsScrollMuxPlannerOptions,
): WebCodecsScrollMuxPlan {
  const fps: ScrollReelFps = options?.fps === 60 ? 60 : DEFAULT_SCROLL_REEL_FPS;
  const widthPx = Math.max(64, Math.round(options?.widthPx ?? 1080));
  const heightPx = Math.max(64, Math.round(options?.heightPx ?? 1920));
  const bitrateMode: ScrollVbvBitrateMode = options?.bitrateMode ?? "vbr";
  const targetBitrateBps = Math.max(250_000, Math.round(options?.targetBitrateBps ?? DEFAULT_TARGET_BITRATE_BPS));
  const vbvMaxRateBps = Math.max(
    targetBitrateBps,
    Math.round(options?.vbvMaxRateBps ?? (bitrateMode === "cbr" ? targetBitrateBps : targetBitrateBps * 1.25)),
  );
  const avgFrameBits = targetBitrateBps / fps;

  // 단일 프레임 유입량과 IDR 피크를 안전하게 수용하도록 최소 12프레임 분량 이상의 VBV 크기를 보장한다.
  const minSafeVbvBits = Math.ceil(avgFrameBits * 12);
  const vbvBufferSizeBits = Math.max(
    minSafeVbvBits,
    Math.round(options?.vbvBufferSizeBits ?? targetBitrateBps),
  );

  const initialFullnessRatio = clamp(
    options?.initialVbvFullnessRatio ?? DEFAULT_INITIAL_VBV_FULLNESS_RATIO,
    0.35,
    0.9,
  );
  const initialVbvBits = Math.round(vbvBufferSizeBits * initialFullnessRatio);

  const defaultMinGop = Math.max(4, Math.round(fps * 0.25));
  const minGopFrames = Math.max(1, Math.round(options?.minGopFrames ?? defaultMinGop));
  const maxGopFrames = Math.max(
    minGopFrames,
    Math.round(options?.maxGopFrames ?? fps * 2),
  );
  const sceneCutThreshold = clamp(
    options?.sceneCutThreshold ?? DEFAULT_SCENE_CUT_THRESHOLD,
    0.2,
    1.5,
  );

  if (frames.length === 0) {
    return {
      fps,
      widthPx,
      heightPx,
      targetBitrateBps,
      effectiveBitrateBps: 0,
      vbvBufferSizeBits,
      initialVbvBits,
      finalVbvBits: initialVbvBits,
      minGopFrames,
      maxGopFrames,
      totalDurationUs: 0,
      frames: [],
      keyframeIndices: [],
      sceneCutKeyframeIndices: [],
      suppressedSceneCutIndices: [],
      vbvUnderflowCount: 0,
      vbvOverflowCount: 0,
      minVbvPostRemovalBits: initialVbvBits,
      maxVbvPostReplenishBits: initialVbvBits,
      monotonicTimestampValid: true,
      averageCalmHoldBits: 0,
      averageActionPanBits: 0,
    };
  }

  // 1패스: CFR 마이크로초 타임스탬프, 장면 전환 감지, GOP 제약 기반 IDR 배치 및 지각 가중치 산출
  const firstPass: FirstPassFrameMeta[] = new Array<FirstPassFrameMeta>(frames.length);
  const keyframeIndices: number[] = [];
  const sceneCutKeyframeIndices: number[] = [];
  const suppressedSceneCutIndices: number[] = [];

  let gopIndex = -1;
  let framesSinceLastIdr = 0;
  let prevTimestampUs = -1;
  let monotonicTimestampValid = true;
  let totalRawWeight = 0;

  for (let i = 0; i < frames.length; i += 1) {
    const telemetry = frames[i];
    if (!telemetry) continue;

    const timestampUs = computeCfrTimestampUs(i, fps);
    const nextTimestampUs = computeCfrTimestampUs(i + 1, fps);
    const durationUs = nextTimestampUs - timestampUs;
    const deltaUs = i === 0 ? durationUs : timestampUs - prevTimestampUs;

    if (
      !Number.isInteger(timestampUs) ||
      !Number.isInteger(durationUs) ||
      durationUs <= 0 ||
      deltaUs <= 0 ||
      (i > 0 && timestampUs <= prevTimestampUs)
    ) {
      monotonicTimestampValid = false;
    }
    prevTimestampUs = timestampUs;

    const sceneCutScore = i === 0 ? 0 : computeSceneCutShockScore(telemetry);
    const isSceneCutDetected = i > 0 && sceneCutScore >= sceneCutThreshold;

    let keyFrame = false;
    let keyframeReason: KeyframeDecisionReason = "inter-prediction";

    if (i === 0) {
      keyFrame = true;
      keyframeReason = "stream-start";
    } else if (framesSinceLastIdr >= maxGopFrames) {
      keyFrame = true;
      keyframeReason = "max-gop-ceiling";
    } else if (isSceneCutDetected) {
      if (framesSinceLastIdr >= minGopFrames) {
        keyFrame = true;
        keyframeReason = "scene-cut-idr";
        sceneCutKeyframeIndices.push(i);
      } else {
        keyFrame = false;
        keyframeReason = "suppressed-by-min-gop";
        suppressedSceneCutIndices.push(i);
      }
    }

    if (keyFrame) {
      gopIndex += 1;
      framesSinceLastIdr = 0;
      keyframeIndices.push(i);
    }

    const gopFrameOffset = framesSinceLastIdr;
    framesSinceLastIdr += 1;

    const complexityClass = classifyScrollComplexity(telemetry, isSceneCutDetected);
    const rawWeight = computePerceptualFrameWeight(
      telemetry,
      keyFrame,
      keyframeReason,
      complexityClass,
    );
    totalRawWeight += rawWeight;

    firstPass[i] = {
      frameIndex: i,
      timestampUs,
      durationUs,
      deltaUs,
      keyFrame,
      codingType: keyFrame ? "IDR" : "P",
      keyframeReason,
      gopIndex,
      gopFrameOffset,
      sceneCutScore,
      isSceneCutDetected,
      complexityClass,
      rawWeight,
    };
  }

  const meanWeight = totalRawWeight / Math.max(1, frames.length);

  // 각 프레임에서 다음 IDR까지의 잔여 거리를 역방향 O(N) 스캔으로 계산해 사전 비트 비축에 활용한다.
  const distanceToNextIdr = new Int32Array(frames.length);
  let nextIdrIndex = -1;
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const meta = firstPass[i];
    if (meta?.keyFrame) {
      distanceToNextIdr[i] = 0;
      nextIdrIndex = i;
    } else {
      distanceToNextIdr[i] = nextIdrIndex === -1 ? 999_999 : nextIdrIndex - i;
    }
  }

  // 2패스: Leaky-Bucket VBV 비트 할당 및 언더플로·오버플로 0건 강제 검증
  const plannedFrames: PlannedWebCodecsFrame[] = new Array<PlannedWebCodecsFrame>(frames.length);
  const targetVbvEquilibriumBits = Math.round(vbvBufferSizeBits * 0.72);
  let vbvBits = initialVbvBits;
  let vbvUnderflowCount = 0;
  let vbvOverflowCount = 0;
  let minVbvPostRemovalBits = vbvBufferSizeBits;
  let maxVbvPostReplenishBits = 0;
  let totalAllocatedBits = 0;

  let calmBitsSum = 0;
  let calmFrameCount = 0;
  let actionBitsSum = 0;
  let actionFrameCount = 0;

  for (let i = 0; i < frames.length; i += 1) {
    const meta = firstPass[i];
    const telemetry = frames[i];
    if (!meta || !telemetry) continue;

    const maxChannelRefillBits = Math.round((vbvMaxRateBps * meta.durationUs) / 1_000_000);
    const normalizedWeight = meta.rawWeight / Math.max(1e-9, meanWeight);
    let desiredBits = normalizedWeight * avgFrameBits;

    // 곧 IDR 키프레임이 다가오는데 버퍼 여유가 낮으면 P-프레임 소비를 절제해 IDR 예산을 확보한다.
    const distIdr = distanceToNextIdr[i] ?? 999_999;
    if (!meta.keyFrame && distIdr <= 12 && vbvBits < vbvBufferSizeBits * 0.55) {
      desiredBits *= 0.78;
    }

    // 비례 되먹임(정적 대사 홀드 구간에서는 불필요한 잉여 소진을 억제해 비축분을 지킨다).
    const rawFeedback = (vbvBits - targetVbvEquilibriumBits) * 0.04;
    const bufferFeedbackBits =
      meta.complexityClass === "calm-dialogue-hold" && bitrateMode === "vbr"
        ? Math.min(0, rawFeedback)
        : rawFeedback;
    const steeredBits = Math.round(desiredBits + bufferFeedbackBits);

    // 단일 IDR이 버퍼 전체를 고갈시키지 않도록 안전 마진을 두고 하드 클램프 구간을 산출한다.
    const reserveFloorBits = meta.keyFrame
      ? Math.min(Math.round(vbvBufferSizeBits * 0.08), Math.floor(vbvBits * 0.25))
      : Math.min(Math.round(vbvBufferSizeBits * 0.14), Math.floor(vbvBits * 0.35));

    const maxSafeBitsForUnderflow = Math.max(0, vbvBits - reserveFloorBits);
    const minSafeBitsForOverflow =
      bitrateMode === "cbr"
        ? Math.max(0, vbvBits + maxChannelRefillBits - vbvBufferSizeBits)
        : 0;
    const nominalMinFrameBits = Math.min(
      maxSafeBitsForUnderflow,
      Math.max(256, Math.round(avgFrameBits * 0.14)),
    );
    const effectiveLowerBound = Math.min(
      vbvBits,
      Math.max(minSafeBitsForOverflow, nominalMinFrameBits),
    );
    const effectiveUpperBound = Math.max(effectiveLowerBound, maxSafeBitsForUnderflow);

    const allocatedBits = clamp(steeredBits, effectiveLowerBound, effectiveUpperBound);

    const vbvPreRemovalBits = vbvBits;
    const vbvPostRemovalBits = vbvPreRemovalBits - allocatedBits;
    const arrivingBits =
      bitrateMode === "cbr"
        ? maxChannelRefillBits
        : Math.max(0, Math.min(maxChannelRefillBits, vbvBufferSizeBits - vbvPostRemovalBits));
    const vbvPostReplenishBits = vbvPostRemovalBits + arrivingBits;
    vbvBits = vbvPostReplenishBits;

    if (vbvPostRemovalBits < 0) {
      vbvUnderflowCount += 1;
    }
    if (vbvPostReplenishBits > vbvBufferSizeBits) {
      vbvOverflowCount += 1;
    }

    if (vbvPostRemovalBits < minVbvPostRemovalBits) {
      minVbvPostRemovalBits = vbvPostRemovalBits;
    }
    if (vbvPostReplenishBits > maxVbvPostReplenishBits) {
      maxVbvPostReplenishBits = vbvPostReplenishBits;
    }

    totalAllocatedBits += allocatedBits;
    if (!meta.keyFrame) {
      if (meta.complexityClass === "calm-dialogue-hold") {
        calmBitsSum += allocatedBits;
        calmFrameCount += 1;
      } else if (meta.complexityClass === "screentone-speedline-pan") {
        actionBitsSum += allocatedBits;
        actionFrameCount += 1;
      }
    }

    plannedFrames[i] = {
      frameIndex: meta.frameIndex,
      timestampUs: meta.timestampUs,
      durationUs: meta.durationUs,
      deltaUs: meta.deltaUs,
      keyFrame: meta.keyFrame,
      codingType: meta.codingType,
      keyframeReason: meta.keyframeReason,
      gopIndex: meta.gopIndex,
      gopFrameOffset: meta.gopFrameOffset,
      sceneCutScore: meta.sceneCutScore,
      isSceneCutDetected: meta.isSceneCutDetected,
      complexityClass: meta.complexityClass,
      perceptualWeight: roundRatio(normalizedWeight),
      allocatedBits,
      arrivingBits,
      vbvPreRemovalBits,
      vbvPostRemovalBits,
      vbvPostReplenishBits,
      vbvFullnessRatio: roundRatio(vbvPostReplenishBits / vbvBufferSizeBits),
      recommendedQuantizerQp: estimateQuantizerQp(
        allocatedBits,
        avgFrameBits,
        meta.keyFrame,
        telemetry.screentoneDensity,
      ),
    };
  }

  const lastMeta = firstPass[firstPass.length - 1];
  const totalDurationUs = lastMeta ? lastMeta.timestampUs + lastMeta.durationUs : 0;
  const effectiveBitrateBps =
    totalDurationUs > 0 ? Math.round((totalAllocatedBits * 1_000_000) / totalDurationUs) : 0;

  return {
    fps,
    widthPx,
    heightPx,
    targetBitrateBps,
    effectiveBitrateBps,
    vbvBufferSizeBits,
    initialVbvBits,
    finalVbvBits: vbvBits,
    minGopFrames,
    maxGopFrames,
    totalDurationUs,
    frames: plannedFrames,
    keyframeIndices,
    sceneCutKeyframeIndices,
    suppressedSceneCutIndices,
    vbvUnderflowCount,
    vbvOverflowCount,
    minVbvPostRemovalBits,
    maxVbvPostReplenishBits,
    monotonicTimestampValid,
    averageCalmHoldBits: calmFrameCount > 0 ? Math.round(calmBitsSum / calmFrameCount) : 0,
    averageActionPanBits: actionFrameCount > 0 ? Math.round(actionBitsSum / actionFrameCount) : 0,
  };
}
