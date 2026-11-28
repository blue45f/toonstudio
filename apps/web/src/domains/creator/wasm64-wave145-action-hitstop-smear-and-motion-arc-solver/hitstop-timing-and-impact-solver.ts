/**
 * Wave 145 — 액션 컷 타격 임팩트 프레임(Hit-Stop), 감쇠 카메라 셰이크,
 * WCAG 2.3.1 광과민(<= 3Hz) & 저모션(prefers-reduced-motion) 안전 가드 및
 * 60fps 타임라인 결정론 컴파일러.
 */

import { computeActionManifestSha256Hex } from "./action-impact-sha256";
import {
  buildActionMotionArc,
  computeVolumePreservingSquashStretch,
  generateAfterimageGhosts,
  generateSmearFanPolygon,
  sampleActionMotionArcAt,
  type ActionMotionArcInput,
  type ActionMotionArcResult,
  type ActionPoint2D,
  type AfterimageGhostSetResult,
  type SmearFanOptions,
  type SmearFanPolygonResult,
  type SquashStretchResult,
} from "./motion-arc-and-smear-geometry";

export type ActionImpactTier =
  | "light-jab"
  | "heavy-slash"
  | "finisher-critical"
  | "parry-clang";

export type ImpactFramePhase =
  | "anticipation"
  | "strike"
  | "hitstop-freeze"
  | "impact-flash"
  | "follow-through";

export type ImpactFrameFlashMode =
  | "none"
  | "mono-invert"
  | "ink-silhouette"
  | "static-focus-still";

export interface ImpactCameraShakeInput {
  readonly impactDirection: ActionPoint2D;
  readonly initialAmplitudePx: number;
  readonly dampingRate?: number;
  readonly frequencyHz?: number;
  readonly durationSec?: number;
  readonly fps?: number;
  readonly startFrameIndex?: number;
  readonly prefersReducedMotion?: boolean;
}

export interface CameraShakeSample {
  readonly frameIndex: number;
  readonly globalFrameIndex: number;
  readonly timeSec: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly magnitudePx: number;
  readonly directionalProjectionPx: number;
}

export interface ImpactCameraShakeResult {
  readonly impulseDirection: ActionPoint2D;
  readonly initialAmplitudePx: number;
  readonly dampingRate: number;
  readonly angularFrequencyRadPerSec: number;
  readonly durationSec: number;
  readonly fps: number;
  readonly samples: readonly CameraShakeSample[];
  readonly peakMagnitudePx: number;
  readonly peakFrameIndex: number;
  readonly initialAlignmentCosine: number;
  readonly terminalResidualPx: number;
  readonly convergedWithinThreshold: boolean;
}

export interface ActionImpactSequenceInput {
  readonly cutId: string;
  readonly titleKo?: string;
  readonly tier: ActionImpactTier;
  readonly arcInput: ActionMotionArcInput;
  readonly fps?: number;
  readonly prefersReducedMotion?: boolean;
  readonly requestedFlashCount?: number;
  readonly requestedFlashRateHz?: number;
  readonly shakeDirectionOverride?: ActionPoint2D;
  readonly ghostCount?: number;
  readonly smearOptions?: SmearFanOptions;
}

export interface ActionPhaseFrameCounts {
  readonly anticipationFrames: number;
  readonly strikeFrames: number;
  readonly hitStopFreezeFrames: number;
  readonly impactFlashFrames: number;
  readonly followThroughFrames: number;
  readonly totalFrames: number;
  readonly totalDurationMs: number;
}

export interface ActionSafetyGuardReport {
  readonly prefersReducedMotion: boolean;
  readonly wcagMaxFlashRateHz: 3;
  readonly requestedFlashCount: number;
  readonly appliedFlashCount: number;
  readonly requestedFlashRateHz: number;
  readonly appliedFlashRateHz: number;
  readonly maxFlashesInOneSecondWindow: number;
  readonly wcagFlashClamped: boolean;
  readonly wcagCompliant: boolean;
  readonly reducedMotionFallbackMode: "none" | "static-focus-and-afterimage-still";
  readonly warningsKo: readonly string[];
}

export interface ActionTimelineFrame {
  readonly frameIndex: number;
  readonly timeMs: number;
  readonly phase: ImpactFramePhase;
  readonly arcU: number;
  readonly flashMode: ImpactFrameFlashMode;
  readonly smearOpacity: number;
  readonly ghostVisibilityCount: number;
  readonly cameraOffsetX: number;
  readonly cameraOffsetY: number;
  readonly squashStretch: SquashStretchResult;
}

export interface ActionImpactSequenceResult {
  readonly cutId: string;
  readonly titleKo: string;
  readonly tier: ActionImpactTier;
  readonly fps: number;
  readonly arc: ActionMotionArcResult;
  readonly smearFan: SmearFanPolygonResult;
  readonly afterimages: AfterimageGhostSetResult;
  readonly phaseCounts: ActionPhaseFrameCounts;
  readonly cameraShake: ImpactCameraShakeResult;
  readonly safetyGuard: ActionSafetyGuardReport;
  readonly frames: readonly ActionTimelineFrame[];
  readonly actionSequenceSha256Hex: string;
}

interface TierTimingProfile {
  readonly labelKo: string;
  readonly anticipationFrames60: number;
  readonly strikeFrames60: number;
  readonly hitStopFreezeFrames60: number;
  readonly impactFlashFrames60: number;
  readonly followThroughFrames60: number;
  readonly shakeAmplitudePx: number;
  readonly shakeDurationSec: number;
  readonly shakeFrequencyHz: number;
  readonly shakeDampingRate: number;
  readonly defaultGhostCount: number;
  readonly defaultSmearGain: number;
}

export const WCAG_MAX_IMPACT_FLASH_RATE_HZ = 3 as const;
export const CAMERA_SHAKE_CONVERGENCE_THRESHOLD_PX = 0.05;

const TIER_PROFILES: Record<ActionImpactTier, TierTimingProfile> = {
  "light-jab": {
    labelKo: "경타 잽",
    anticipationFrames60: 4,
    strikeFrames60: 4,
    hitStopFreezeFrames60: 3,
    impactFlashFrames60: 1,
    followThroughFrames60: 6,
    shakeAmplitudePx: 4.5,
    shakeDurationSec: 0.2,
    shakeFrequencyHz: 22,
    shakeDampingRate: 28,
    defaultGhostCount: 3,
    defaultSmearGain: 0.42,
  },
  "parry-clang": {
    labelKo: "칼날 패링 격돌",
    anticipationFrames60: 5,
    strikeFrames60: 5,
    hitStopFreezeFrames60: 5,
    impactFlashFrames60: 2,
    followThroughFrames60: 8,
    shakeAmplitudePx: 8.5,
    shakeDurationSec: 0.25,
    shakeFrequencyHz: 26,
    shakeDampingRate: 25,
    defaultGhostCount: 4,
    defaultSmearGain: 0.55,
  },
  "heavy-slash": {
    labelKo: "강타 대검 베기",
    anticipationFrames60: 8,
    strikeFrames60: 6,
    hitStopFreezeFrames60: 7,
    impactFlashFrames60: 2,
    followThroughFrames60: 10,
    shakeAmplitudePx: 14,
    shakeDurationSec: 0.32,
    shakeFrequencyHz: 18,
    shakeDampingRate: 22,
    defaultGhostCount: 6,
    defaultSmearGain: 0.72,
  },
  "finisher-critical": {
    labelKo: "필살기 치명타 일섬",
    anticipationFrames60: 12,
    strikeFrames60: 7,
    hitStopFreezeFrames60: 12,
    impactFlashFrames60: 3,
    followThroughFrames60: 14,
    shakeAmplitudePx: 22,
    shakeDurationSec: 0.42,
    shakeFrequencyHz: 15,
    shakeDampingRate: 18,
    defaultGhostCount: 8,
    defaultSmearGain: 0.92,
  },
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function normalizeDirection(vec: ActionPoint2D): ActionPoint2D {
  const x = Number.isFinite(vec.x) ? vec.x : 1;
  const y = Number.isFinite(vec.y) ? vec.y : 0;
  const len = Math.hypot(x, y);
  if (len < 1e-6) {
    return { x: 1, y: 0 };
  }
  return { x: x / len, y: y / len };
}

/**
 * 충격 법선 방향으로 초기 변위가 최대가 되고 지수 감쇠 진동(`exp(-damping * t) * cos(omega * t)`)으로
 * 종료 시 잔류 오프셋 `< 0.05px`에 수렴하는 카메라 셰이크 곡선을 합성한다.
 */
export function synthesizeImpactCameraShake(
  input: ImpactCameraShakeInput,
): ImpactCameraShakeResult {
  const impulseDirection = normalizeDirection(input.impactDirection);
  const perpAxis: ActionPoint2D = { x: -impulseDirection.y, y: impulseDirection.x };
  const fps = Math.round(clamp(input.fps ?? 60, 24, 120));
  const durationSec = clamp(input.durationSec ?? 0.3, 0.08, 1.5);
  const startFrameIndex = Math.max(0, Math.round(input.startFrameIndex ?? 0));
  const sampleCount = Math.max(4, Math.round(durationSec * fps) + 1);
  const frequencyHz = clamp(input.frequencyHz ?? 18, 4, 40);
  const angularFrequencyRadPerSec = 2 * Math.PI * frequencyHz;

  if (input.prefersReducedMotion === true) {
    const zeroSamples: CameraShakeSample[] = [];
    for (let i = 0; i < sampleCount; i += 1) {
      const timeSec = i / fps;
      zeroSamples.push({
        frameIndex: i,
        globalFrameIndex: startFrameIndex + i,
        timeSec,
        offsetX: 0,
        offsetY: 0,
        magnitudePx: 0,
        directionalProjectionPx: 0,
      });
    }
    return {
      impulseDirection,
      initialAmplitudePx: 0,
      dampingRate: 0,
      angularFrequencyRadPerSec,
      durationSec: (sampleCount - 1) / fps,
      fps,
      samples: zeroSamples,
      peakMagnitudePx: 0,
      peakFrameIndex: 0,
      initialAlignmentCosine: 1,
      terminalResidualPx: 0,
      convergedWithinThreshold: true,
    };
  }

  const initialAmplitudePx = clamp(input.initialAmplitudePx, 0, 64);
  const actualDurationSec = (sampleCount - 1) / fps;
  const targetTerminalPx = 0.015;
  const minRequiredDamping =
    initialAmplitudePx > targetTerminalPx
      ? Math.log(initialAmplitudePx / targetTerminalPx) / Math.max(actualDurationSec, 0.05)
      : 10;
  const requestedDamping = clamp(input.dampingRate ?? 18, 2, 120);
  const dampingRate = Math.max(requestedDamping, minRequiredDamping);

  const samples: CameraShakeSample[] = [];
  let peakMagnitudePx = 0;
  let peakFrameIndex = 0;

  for (let i = 0; i < sampleCount; i += 1) {
    const timeSec = i / fps;
    const envelope = initialAmplitudePx * Math.exp(-dampingRate * timeSec);
    const primary = envelope * Math.cos(angularFrequencyRadPerSec * timeSec);
    const secondary = envelope * 0.14 * Math.sin(angularFrequencyRadPerSec * 1.35 * timeSec);

    const offsetX = impulseDirection.x * primary + perpAxis.x * secondary;
    const offsetY = impulseDirection.y * primary + perpAxis.y * secondary;
    const magnitudePx = Math.hypot(offsetX, offsetY);
    const directionalProjectionPx =
      offsetX * impulseDirection.x + offsetY * impulseDirection.y;

    if (magnitudePx > peakMagnitudePx) {
      peakMagnitudePx = magnitudePx;
      peakFrameIndex = i;
    }

    samples.push({
      frameIndex: i,
      globalFrameIndex: startFrameIndex + i,
      timeSec,
      offsetX,
      offsetY,
      magnitudePx,
      directionalProjectionPx,
    });
  }

  const first = samples[0];
  const last = samples[samples.length - 1];
  const initialAlignmentCosine =
    first && first.magnitudePx > 1e-6
      ? clamp(first.directionalProjectionPx / first.magnitudePx, -1, 1)
      : 1;
  const terminalResidualPx = last?.magnitudePx ?? 0;

  return {
    impulseDirection,
    initialAmplitudePx,
    dampingRate,
    angularFrequencyRadPerSec,
    durationSec: actualDurationSec,
    fps,
    samples,
    peakMagnitudePx,
    peakFrameIndex,
    initialAlignmentCosine,
    terminalResidualPx,
    convergedWithinThreshold: terminalResidualPx < CAMERA_SHAKE_CONVERGENCE_THRESHOLD_PX,
  };
}

function scaleFramesForFps(framesAt60: number, fps: number, minFrames: number): number {
  return Math.max(minFrames, Math.round((framesAt60 * fps) / 60));
}

function countMaxFlashesInOneSecondWindow(
  frames: readonly ActionTimelineFrame[],
  fps: number,
): number {
  let maxInWindow = 0;
  const windowFrames = Math.max(1, fps);
  for (let start = 0; start < frames.length; start += 1) {
    const end = Math.min(frames.length, start + windowFrames);
    let count = 0;
    for (let i = start; i < end; i += 1) {
      const mode = frames[i]?.flashMode;
      if (mode === "mono-invert" || mode === "ink-silhouette") {
        count += 1;
      }
    }
    if (count > maxInWindow) {
      maxInWindow = count;
    }
  }
  return maxInWindow;
}

/**
 * 타격 강도(`light-jab`, `heavy-slash`, `finisher-critical`, `parry-clang`)별
 * 60fps 액션 임팩트 타임라인, 스미어 팬, 잔상, 감쇠 카메라 셰이크 및
 * WCAG 2.3.1·저모션 안전 가드를 컴파일한다.
 */
export function compileActionImpactSequence(
  input: ActionImpactSequenceInput,
): ActionImpactSequenceResult {
  const profile = TIER_PROFILES[input.tier];
  const fps = Math.round(clamp(input.fps ?? 60, 24, 120));
  const prefersReducedMotion = input.prefersReducedMotion === true;
  const cutId = input.cutId.trim().length > 0 ? input.cutId.trim() : "cut-action-01";
  const titleKo =
    input.titleKo && input.titleKo.trim().length > 0
      ? input.titleKo.trim()
      : `${profile.labelKo} 임팩트 컷`;

  const arc = buildActionMotionArc(input.arcInput);
  const smearFan = generateSmearFanPolygon(arc, {
    speedBoostGain: profile.defaultSmearGain,
    ...input.smearOptions,
  });
  const afterimages = generateAfterimageGhosts(arc, {
    ghostCount: input.ghostCount ?? profile.defaultGhostCount,
  });

  const anticipationFrames = scaleFramesForFps(profile.anticipationFrames60, fps, 2);
  const strikeFrames = scaleFramesForFps(profile.strikeFrames60, fps, 2);
  const baseHitStopFreezeFrames = scaleFramesForFps(profile.hitStopFreezeFrames60, fps, 2);
  const baseImpactFlashFrames = scaleFramesForFps(profile.impactFlashFrames60, fps, 1);
  const followThroughFrames = scaleFramesForFps(profile.followThroughFrames60, fps, 3);

  const requestedFlashCount = Math.max(
    0,
    Math.round(
      input.requestedFlashCount !== undefined && Number.isFinite(input.requestedFlashCount)
        ? input.requestedFlashCount
        : baseImpactFlashFrames,
    ),
  );

  const baselineTotalFrames =
    anticipationFrames +
    strikeFrames +
    baseHitStopFreezeFrames +
    requestedFlashCount +
    followThroughFrames;
  const baselineDurationSec = Math.max(1 / fps, baselineTotalFrames / fps);
  const oneSecondBudgetUnits = Math.max(1, baselineDurationSec);
  const maxSafeFlashes = Math.floor(WCAG_MAX_IMPACT_FLASH_RATE_HZ * oneSecondBudgetUnits);

  const derivedRequestedRateHz = requestedFlashCount / oneSecondBudgetUnits;
  const requestedFlashRateHz =
    input.requestedFlashRateHz !== undefined && Number.isFinite(input.requestedFlashRateHz)
      ? Math.max(0, input.requestedFlashRateHz)
      : derivedRequestedRateHz;

  const warningsKo: string[] = [];
  let wcagFlashClamped = false;
  let appliedFlashCount = requestedFlashCount;
  let hitStopFreezeFrames = baseHitStopFreezeFrames;

  if (prefersReducedMotion) {
    appliedFlashCount = 0;
    hitStopFreezeFrames = baseHitStopFreezeFrames + Math.min(2, baseImpactFlashFrames);
    warningsKo.push(
      "저모션 설정(prefers-reduced-motion)에 따라 카메라 셰이크를 0px로 끄고 고대비 스트로브 플래시 대신 정적 집중선·잔상 스틸 프레임으로 무손실 전환했습니다.",
    );
  } else {
    const rateExceeded = requestedFlashRateHz > WCAG_MAX_IMPACT_FLASH_RATE_HZ + 1e-6;
    const countExceeded = requestedFlashCount > maxSafeFlashes;
    if (rateExceeded || countExceeded) {
      wcagFlashClamped = true;
      const rateBoundedCount = Math.floor(WCAG_MAX_IMPACT_FLASH_RATE_HZ * oneSecondBudgetUnits);
      appliedFlashCount = Math.max(0, Math.min(requestedFlashCount, maxSafeFlashes, rateBoundedCount));
      if (requestedFlashCount === 0 && rateExceeded) {
        appliedFlashCount = 0;
      } else if (appliedFlashCount === 0 && requestedFlashCount > 0) {
        appliedFlashCount = Math.min(WCAG_MAX_IMPACT_FLASH_RATE_HZ, maxSafeFlashes);
      }
      warningsKo.push(
        `요청한 임팩트 플래시 빈도(${requestedFlashRateHz.toFixed(1)}Hz, ${requestedFlashCount}회)가 WCAG 2.3.1 광과민 안전 상한(3.0Hz)을 넘어 1초 구간 ${appliedFlashCount}회(3.0Hz 이하)로 자동 제한했습니다.`,
      );
    }
  }

  const impactFlashFrames = appliedFlashCount;
  const totalFrames =
    anticipationFrames +
    strikeFrames +
    hitStopFreezeFrames +
    impactFlashFrames +
    followThroughFrames;
  const totalDurationMs = (totalFrames / fps) * 1000;
  const actualWindowUnits = Math.max(1, totalFrames / fps);
  const appliedFlashRateHz = prefersReducedMotion
    ? 0
    : Math.min(WCAG_MAX_IMPACT_FLASH_RATE_HZ, appliedFlashCount / actualWindowUnits);

  const shakeStartFrame = anticipationFrames + strikeFrames;
  const shakeDirection = input.shakeDirectionOverride ?? arc.impactNormal;
  const cameraShake = synthesizeImpactCameraShake({
    impactDirection: shakeDirection,
    initialAmplitudePx: profile.shakeAmplitudePx,
    dampingRate: profile.shakeDampingRate,
    frequencyHz: profile.shakeFrequencyHz,
    durationSec: profile.shakeDurationSec,
    fps,
    startFrameIndex: shakeStartFrame,
    prefersReducedMotion,
  });

  const shakeByGlobalFrame = new Map<number, CameraShakeSample>();
  for (let i = 0; i < cameraShake.samples.length; i += 1) {
    const sample = cameraShake.samples[i];
    if (sample) {
      shakeByGlobalFrame.set(sample.globalFrameIndex, sample);
    }
  }

  const frames: ActionTimelineFrame[] = [];
  const strikeEnd = anticipationFrames + strikeFrames;
  const flashEnd = strikeEnd + impactFlashFrames;
  const freezeEnd = flashEnd + hitStopFreezeFrames;

  const impactSquash = computeVolumePreservingSquashStretch({
    speedPxPerSec: arc.peakSpeedPxPerSec,
    referenceSpeedPxPerSec: Math.max(1, arc.peakSpeedPxPerSec),
    phaseMode: "impact-squash",
    impactCompression: input.tier === "finisher-critical" ? 0.42 : 0.3,
  });

  for (let f = 0; f < totalFrames; f += 1) {
    const timeMs = (f / fps) * 1000;
    const shakeSample = shakeByGlobalFrame.get(f);
    const cameraOffsetX = shakeSample?.offsetX ?? 0;
    const cameraOffsetY = shakeSample?.offsetY ?? 0;

    let phase: ImpactFramePhase;
    let arcU: number;
    let flashMode: ImpactFrameFlashMode = "none";
    let smearOpacity = 0;
    let ghostVisibilityCount = 0;
    let squashStretch: SquashStretchResult;

    if (f < anticipationFrames) {
      phase = "anticipation";
      const progress = anticipationFrames > 1 ? f / (anticipationFrames - 1) : 1;
      arcU = 0;
      squashStretch = computeVolumePreservingSquashStretch({
        speedPxPerSec: 0,
        referenceSpeedPxPerSec: Math.max(1, arc.peakSpeedPxPerSec),
        phaseMode: "anticipation-squash",
        impactCompression: 0.14 + 0.16 * progress,
      });
    } else if (f < strikeEnd) {
      phase = "strike";
      const localIdx = f - anticipationFrames;
      arcU = strikeFrames > 1 ? (localIdx + 1) / strikeFrames : 1;
      const sample = sampleActionMotionArcAt(arc, arcU);
      smearOpacity = clamp(0.35 + 0.65 * sample.normalizedSpeed, 0.25, 1);
      ghostVisibilityCount = Math.min(
        afterimages.ghosts.length,
        Math.max(1, Math.ceil(afterimages.ghosts.length * arcU)),
      );
      squashStretch = sample.squashStretch;
    } else if (f < flashEnd) {
      phase = "impact-flash";
      arcU = 1;
      const flashIdx = f - strikeEnd;
      flashMode = flashIdx % 2 === 0 ? "mono-invert" : "ink-silhouette";
      smearOpacity = 0.92;
      ghostVisibilityCount = afterimages.ghosts.length;
      squashStretch = impactSquash;
    } else if (f < freezeEnd) {
      phase = "hitstop-freeze";
      arcU = 1;
      flashMode = prefersReducedMotion ? "static-focus-still" : "none";
      smearOpacity = prefersReducedMotion ? 0.65 : 0.78;
      ghostVisibilityCount = afterimages.ghosts.length;
      squashStretch = impactSquash;
    } else {
      phase = "follow-through";
      const localIdx = f - freezeEnd;
      const settleFrac =
        followThroughFrames > 1 ? (localIdx + 1) / followThroughFrames : 1;
      arcU = 1;
      smearOpacity = clamp(0.55 * (1 - settleFrac), 0, 0.55);
      ghostVisibilityCount = Math.max(
        0,
        Math.round(afterimages.ghosts.length * (1 - settleFrac)),
      );
      squashStretch = computeVolumePreservingSquashStretch({
        speedPxPerSec: arc.peakSpeedPxPerSec * (1 - settleFrac) * 0.25,
        referenceSpeedPxPerSec: Math.max(1, arc.peakSpeedPxPerSec),
        phaseMode: settleFrac > 0.8 ? "neutral" : "snap-stretch",
      });
    }

    frames.push({
      frameIndex: f,
      timeMs,
      phase,
      arcU,
      flashMode,
      smearOpacity,
      ghostVisibilityCount,
      cameraOffsetX,
      cameraOffsetY,
      squashStretch,
    });
  }

  const maxFlashesInOneSecondWindow = countMaxFlashesInOneSecondWindow(frames, fps);
  const wcagCompliant =
    appliedFlashRateHz <= WCAG_MAX_IMPACT_FLASH_RATE_HZ + 1e-9 &&
    maxFlashesInOneSecondWindow <= WCAG_MAX_IMPACT_FLASH_RATE_HZ;

  const safetyGuard: ActionSafetyGuardReport = {
    prefersReducedMotion,
    wcagMaxFlashRateHz: WCAG_MAX_IMPACT_FLASH_RATE_HZ,
    requestedFlashCount,
    appliedFlashCount,
    requestedFlashRateHz,
    appliedFlashRateHz,
    maxFlashesInOneSecondWindow,
    wcagFlashClamped,
    wcagCompliant,
    reducedMotionFallbackMode: prefersReducedMotion
      ? "static-focus-and-afterimage-still"
      : "none",
    warningsKo,
  };

  const phaseCounts: ActionPhaseFrameCounts = {
    anticipationFrames,
    strikeFrames,
    hitStopFreezeFrames,
    impactFlashFrames,
    followThroughFrames,
    totalFrames,
    totalDurationMs,
  };

  const actionSequenceSha256Hex = computeActionManifestSha256Hex({
    schema: "toonstudio.wave145.action-impact-sequence.v1",
    cutId,
    titleKo,
    tier: input.tier,
    fps,
    phaseCounts,
    arc: {
      curveKind: arc.resolvedCurveKind,
      weaponProfile: arc.weaponProfile,
      totalArcLengthPx: arc.totalArcLengthPx,
      peakSpeedPxPerSec: arc.peakSpeedPxPerSec,
      impactPoint: arc.impactPoint,
      impactDirection: arc.impactDirection,
      impactNormal: arc.impactNormal,
    },
    smearFan: {
      uStart: smearFan.uStart,
      uEnd: smearFan.uEnd,
      areaPx2: smearFan.areaPx2,
      peakWidthPx: smearFan.peakWidthPx,
    },
    afterimages: afterimages.ghosts.map((g) => ({
      ghostIndex: g.ghostIndex,
      u: g.u,
      alpha: g.alpha,
      timeOffsetMs: g.timeOffsetMs,
    })),
    cameraShake: {
      impulseDirection: cameraShake.impulseDirection,
      initialAmplitudePx: cameraShake.initialAmplitudePx,
      dampingRate: cameraShake.dampingRate,
      terminalResidualPx: cameraShake.terminalResidualPx,
    },
    safetyGuard: {
      prefersReducedMotion: safetyGuard.prefersReducedMotion,
      appliedFlashCount: safetyGuard.appliedFlashCount,
      appliedFlashRateHz: safetyGuard.appliedFlashRateHz,
      wcagFlashClamped: safetyGuard.wcagFlashClamped,
    },
    frameSummary: frames.map((frame) => ({
      f: frame.frameIndex,
      p: frame.phase,
      u: frame.arcU,
      fm: frame.flashMode,
      ox: frame.cameraOffsetX,
      oy: frame.cameraOffsetY,
    })),
  });

  return {
    cutId,
    titleKo,
    tier: input.tier,
    fps,
    arc,
    smearFan,
    afterimages,
    phaseCounts,
    cameraShake,
    safetyGuard,
    frames,
    actionSequenceSha256Hex,
  };
}
