/**
 * Wave-69: 비트-동기화(Beat-Locked) 모션툰 애니매틱 타임라인 시퀀서.
 *
 * 여러 웹툰 컷의 대사(말풍선), 의성어·의태어(SFX), BGM 템포(BPM), 감정 강도를 분석해
 * 박자 그리드에 정확히 잠긴 컷 전환 타이밍, 말풍선 팝인/타자기 리빌 스케줄,
 * 2차 모션 위상(머리카락·망토·리본 흔들림 및 감쇠 카메라 쉐이크), 컷 트랜지션
 * (`cut | whip-pan | ink-wipe | flash-impact | cross-dissolve`) 및
 * `prefersReducedMotion` 저자극 대안을 결정론적으로 컴파일·샘플링한다.
 */

import type { CameraChoreographyMode } from "./parallax-25d-camera-choreographer";

/** 컷 간 트랜지션 유형. */
export type AnimaticTransitionKind = "cross-dissolve" | "cut" | "flash-impact" | "ink-wipe" | "whip-pan";

/** 컷 감정 프로파일 태그. */
export type AnimaticEmotionTag = "calm" | "climax" | "impact" | "joy" | "melancholy" | "tension";

/** 말풍선 등장 연출 스타일. */
export type BalloonRevealStyle = "pop-in" | "pop-then-type" | "typewriter";

/** 2차 모션 요소 종류. */
export type SecondaryMotionKind = "cape" | "dust" | "foliage" | "hair" | "ribbon";

export interface AnimaticDialogueCueInput {
  readonly balloonId: string;
  readonly emphasisLevel?: number;
  readonly readingSpeedCharsPerSec?: number;
  readonly revealStyle?: BalloonRevealStyle;
  readonly speakerId?: string;
  readonly text: string;
}

export interface AnimaticSfxCueInput {
  readonly impactStrength: number;
  readonly relativeBeatOffset?: number;
  readonly sfxId: string;
  readonly shakeDurationMs?: number;
  readonly text: string;
}

export interface SecondaryMotionElementInput {
  readonly amplitudePx?: number;
  readonly dampingRatio?: number;
  readonly elementId: string;
  readonly kind: SecondaryMotionKind;
  readonly stiffnessHz?: number;
}

export interface AnimaticCutScriptInput {
  readonly cutId: string;
  readonly dialogues: readonly AnimaticDialogueCueInput[];
  readonly emotionIntensity: number;
  readonly emotionTag?: AnimaticEmotionTag;
  readonly maxDurationMs?: number;
  readonly minDurationMs?: number;
  readonly preferredCameraMode?: CameraChoreographyMode;
  readonly preferredTransitionIn?: AnimaticTransitionKind;
  readonly secondaryMotionElements?: readonly SecondaryMotionElementInput[];
  readonly sfxCues?: readonly AnimaticSfxCueInput[];
  readonly title?: string;
}

export interface AnimaticSequenceCompileInput {
  readonly beatGridOffsetMs?: number;
  readonly beatsPerBar?: number;
  readonly bpm: number;
  readonly cuts: readonly AnimaticCutScriptInput[];
  readonly fps?: number;
  readonly prefersReducedMotion?: boolean;
  readonly sequenceId: string;
  readonly snapGranularityBeats?: number;
}

export interface CompiledBalloonCue {
  readonly balloonId: string;
  readonly characters: readonly string[];
  readonly emphasisLevel: number;
  readonly holdEndMs: number;
  readonly popInEndMs: number;
  readonly popInStartMs: number;
  readonly revealStyle: BalloonRevealStyle;
  readonly speakerId: string | null;
  readonly text: string;
  readonly totalChars: number;
  readonly typingEndMs: number;
  readonly typingStartMs: number;
}

export interface CompiledSfxCue {
  readonly beatIndex: number;
  readonly impactStrength: number;
  readonly sfxId: string;
  readonly shakeDecayRatePerSec: number;
  readonly shakeDurationMs: number;
  readonly shakeFrequencyHz: number;
  readonly shakePeakAmplitudePx: number;
  readonly shakeRollPeakDeg: number;
  readonly text: string;
  readonly triggerTimeMs: number;
}

export interface CompiledSecondaryMotionSpec {
  readonly amplitudePx: number;
  readonly dampingRatio: number;
  readonly elementId: string;
  readonly kind: SecondaryMotionKind;
  readonly phaseSeedRad: number;
  readonly stiffnessHz: number;
}

export interface CompiledAnimaticCut {
  readonly balloons: readonly CompiledBalloonCue[];
  readonly beatAlignmentErrorMs: number;
  readonly cameraMode: CameraChoreographyMode;
  readonly cutId: string;
  readonly cutIndex: number;
  readonly durationBeats: number;
  readonly durationMs: number;
  readonly emotionIntensity: number;
  readonly emotionTag: AnimaticEmotionTag;
  readonly endBeat: number;
  readonly endTimeMs: number;
  readonly isBeatLocked: boolean;
  readonly originalRequestedTransitionIn: AnimaticTransitionKind | null;
  readonly reducedMotionFallbackApplied: boolean;
  readonly secondaryMotions: readonly CompiledSecondaryMotionSpec[];
  readonly sfxCues: readonly CompiledSfxCue[];
  readonly startBeat: number;
  readonly startTimeMs: number;
  readonly title: string;
  readonly transitionInDurationMs: number;
  readonly transitionInKind: AnimaticTransitionKind;
}

export interface BeatGridMarker {
  readonly barIndex: number;
  readonly beatInBar: number;
  readonly beatIndex: number;
  readonly isDownbeat: boolean;
  readonly timeMs: number;
}

export interface CompiledAnimaticTimeline {
  readonly beatDurationMs: number;
  readonly beatGridOffsetMs: number;
  readonly beatMarkers: readonly BeatGridMarker[];
  readonly beatsPerBar: number;
  readonly bpm: number;
  readonly cuts: readonly CompiledAnimaticCut[];
  readonly fps: number;
  readonly prefersReducedMotion: boolean;
  readonly sequenceId: string;
  readonly snapGranularityBeats: number;
  readonly totalBeats: number;
  readonly totalDurationMs: number;
  readonly totalFrames: number;
}

export interface SampledBalloonState {
  readonly balloonId: string;
  readonly opacity: number;
  readonly scale: number;
  readonly totalChars: number;
  readonly visibility: "hidden" | "holding" | "popping-in" | "typing";
  readonly visibleCharCount: number;
  readonly visibleText: string;
}

export interface SampledSecondaryMotionState {
  readonly elementId: string;
  readonly kind: SecondaryMotionKind;
  readonly phaseRad: number;
  readonly swayAngleDeg: number;
  readonly swayOffsetPx: number;
}

export interface SampledCameraShakeState {
  readonly intensity: number;
  readonly offsetXPx: number;
  readonly offsetYPx: number;
  readonly rollDeg: number;
}

export interface SampledTransitionState {
  readonly active: boolean;
  readonly dissolveAlpha: number;
  readonly flashOpacity: number;
  readonly inkWipeProgress: number;
  readonly kind: AnimaticTransitionKind;
  readonly outgoingCutId: string | null;
  readonly progress: number;
  readonly whipPanOffsetNormalized: number;
}

export interface SampledAnimaticFrameState {
  readonly activeCutId: string;
  readonly activeCutIndex: number;
  readonly activeSfxIds: readonly string[];
  readonly balloons: readonly SampledBalloonState[];
  readonly beatIndex: number;
  readonly beatPhase: number;
  readonly beatPulseIntensity: number;
  readonly cameraMode: CameraChoreographyMode;
  readonly cameraShake: SampledCameraShakeState;
  readonly clampedTimeMs: number;
  readonly currentBeatFloat: number;
  readonly cutLocalTimeMs: number;
  readonly cutNormalizedProgress: number;
  readonly frameIndex: number;
  readonly prefersReducedMotion: boolean;
  readonly secondaryMotions: readonly SampledSecondaryMotionState[];
  readonly transition: SampledTransitionState;
}

const DEFAULT_READING_CHARS_PER_SEC = 11;
const BALLOON_POP_IN_MS = 140;
const BALLOON_GAP_MS = 160;
const MIN_CUT_BEATS = 2;

const SECONDARY_MOTION_DEFAULTS: Readonly<
  Record<SecondaryMotionKind, { readonly amplitudePx: number; readonly dampingRatio: number; readonly stiffnessHz: number }>
> = {
  cape: { amplitudePx: 14, dampingRatio: 0.24, stiffnessHz: 1.35 },
  dust: { amplitudePx: 8, dampingRatio: 0.4, stiffnessHz: 0.75 },
  foliage: { amplitudePx: 11, dampingRatio: 0.3, stiffnessHz: 1.1 },
  hair: { amplitudePx: 9, dampingRatio: 0.28, stiffnessHz: 2.2 },
  ribbon: { amplitudePx: 12, dampingRatio: 0.2, stiffnessHz: 2.8 },
};

const TRANSITION_DURATION_BY_KIND: Readonly<Record<AnimaticTransitionKind, number>> = {
  "cross-dissolve": 320,
  cut: 0,
  "flash-impact": 220,
  "ink-wipe": 280,
  "whip-pan": 240,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function hashSeedRad(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (((hash >>> 0) % 10000) / 10000) * Math.PI * 2;
}

function inferEmotionTag(intensity: number, explicit?: AnimaticEmotionTag): AnimaticEmotionTag {
  if (explicit) return explicit;
  if (intensity >= 0.85) return "climax";
  if (intensity >= 0.65) return "impact";
  if (intensity >= 0.45) return "tension";
  return "calm";
}

function selectCameraModeForCut(
  emotionTag: AnimaticEmotionTag,
  intensity: number,
  explicit?: CameraChoreographyMode,
): CameraChoreographyMode {
  if (explicit) return explicit;
  if (emotionTag === "climax") return "dolly-in";
  if (emotionTag === "impact") return "whip-reveal";
  if (emotionTag === "tension") return "dramatic-rack-focus";
  if (emotionTag === "melancholy" || intensity < 0.3) return "breath-idle";
  return "ken-burns-pan";
}

function selectTransitionInForCut(
  cutIndex: number,
  emotionTag: AnimaticEmotionTag,
  intensity: number,
  maxSfxImpact: number,
  prefersReducedMotion: boolean,
  explicit?: AnimaticTransitionKind,
): {
  readonly durationMs: number;
  readonly kind: AnimaticTransitionKind;
  readonly originalRequested: AnimaticTransitionKind | null;
  readonly reducedFallbackApplied: boolean;
} {
  if (cutIndex === 0 && !explicit) {
    return { durationMs: 0, kind: "cut", originalRequested: null, reducedFallbackApplied: false };
  }
  const requested: AnimaticTransitionKind = explicit
    ? explicit
    : emotionTag === "climax" || maxSfxImpact >= 0.85 || intensity >= 0.85
      ? "flash-impact"
      : emotionTag === "impact" || intensity >= 0.65
        ? "whip-pan"
        : emotionTag === "calm" || emotionTag === "melancholy"
          ? "cross-dissolve"
          : emotionTag === "tension"
            ? "ink-wipe"
            : "cut";

  const isHighStimulation =
    requested === "whip-pan" || requested === "flash-impact" || requested === "ink-wipe";
  if (prefersReducedMotion && isHighStimulation) {
    return { durationMs: 280, kind: "cross-dissolve", originalRequested: requested, reducedFallbackApplied: true };
  }
  return {
    durationMs: TRANSITION_DURATION_BY_KIND[requested],
    kind: requested,
    originalRequested: explicit ?? null,
    reducedFallbackApplied: false,
  };
}

function estimateRawCutDurationMs(cut: AnimaticCutScriptInput): number {
  let dialogueMs = 0;
  for (let i = 0; i < cut.dialogues.length; i += 1) {
    const cue = cut.dialogues[i];
    if (!cue) continue;
    const chars = Array.from(cue.text.trim()).length;
    const cps = clamp(cue.readingSpeedCharsPerSec ?? DEFAULT_READING_CHARS_PER_SEC, 4, 24);
    dialogueMs += BALLOON_POP_IN_MS + (chars / cps) * 1000 + BALLOON_GAP_MS;
  }
  const sfxHoldMs = (cut.sfxCues?.length ?? 0) > 0 ? 450 : 0;
  const baseVisualHoldMs = cut.dialogues.length === 0 ? 1500 : 480;
  const minMs = Math.max(400, cut.minDurationMs ?? 1000);
  const maxMs = Math.max(minMs, cut.maxDurationMs ?? 8000);
  return clamp(Math.max(1000, dialogueMs + sfxHoldMs + baseVisualHoldMs), minMs, maxMs);
}

/**
 * 여러 웹툰 컷과 대사·SFX·BGM BPM·감정 강도로부터 비트-동기화된
 * 60fps 모션툰 애니매틱 타임라인을 컴파일한다.
 */
export function compileMotionToonAnimaticTimeline(
  input: AnimaticSequenceCompileInput,
): CompiledAnimaticTimeline {
  const bpm = clamp(input.bpm, 40, 240);
  const beatDurationMs = 60000 / bpm;
  const beatsPerBar = Math.max(2, Math.min(12, Math.round(input.beatsPerBar ?? 4)));
  const beatGridOffsetMs = Math.max(0, input.beatGridOffsetMs ?? 0);
  const fps = clamp(Math.round(input.fps ?? 60), 24, 120);
  const snapGranularityBeats = clamp(input.snapGranularityBeats ?? 1, 0.25, 4);
  const prefersReducedMotion = Boolean(input.prefersReducedMotion);

  const compiledCuts: CompiledAnimaticCut[] = [];
  let cursorBeats = 0;

  for (let cutIndex = 0; cutIndex < input.cuts.length; cutIndex += 1) {
    const cut = input.cuts[cutIndex];
    if (!cut) continue;
    const emotionIntensity = clamp(cut.emotionIntensity, 0, 1);
    const emotionTag = inferEmotionTag(emotionIntensity, cut.emotionTag);
    const cameraMode = selectCameraModeForCut(emotionTag, emotionIntensity, cut.preferredCameraMode);

    let maxSfxImpact = 0;
    const rawSfx = cut.sfxCues ?? [];
    for (let s = 0; s < rawSfx.length; s += 1) {
      const cue = rawSfx[s];
      if (cue && cue.impactStrength > maxSfxImpact) maxSfxImpact = cue.impactStrength;
    }

    const rawBeats = estimateRawCutDurationMs(cut) / beatDurationMs;
    const minBeats = Math.max(
      MIN_CUT_BEATS,
      cut.minDurationMs
        ? Math.ceil(cut.minDurationMs / beatDurationMs / snapGranularityBeats) * snapGranularityBeats
        : MIN_CUT_BEATS,
    );
    const snappedBeats = Math.max(
      minBeats,
      Math.round(rawBeats / snapGranularityBeats) * snapGranularityBeats,
    );

    const startBeat = cursorBeats;
    const endBeat = cursorBeats + snappedBeats;
    const startTimeMs = beatGridOffsetMs + startBeat * beatDurationMs;
    const endTimeMs = beatGridOffsetMs + endBeat * beatDurationMs;
    const durationMs = endTimeMs - startTimeMs;
    cursorBeats = endBeat;

    const gridStepMs = beatDurationMs * snapGranularityBeats;
    const relativeStart = startTimeMs - beatGridOffsetMs;
    const beatAlignmentErrorMs = Math.abs(relativeStart - Math.round(relativeStart / gridStepMs) * gridStepMs);
    const isBeatLocked = beatAlignmentErrorMs < 1e-4;

    const transitionChoice = selectTransitionInForCut(
      cutIndex, emotionTag, emotionIntensity, maxSfxImpact, prefersReducedMotion, cut.preferredTransitionIn,
    );
    const transitionInDurationMs = Math.min(transitionChoice.durationMs, durationMs * 0.45);

    // 말풍선 팝인/타이핑 리빌 스케줄 배정.
    const balloons: CompiledBalloonCue[] = [];
    const leadInMs = Math.min(240, Math.max(transitionInDurationMs * 0.5, 80));
    const availableDialogueWindowMs = Math.max(250, durationMs - leadInMs - 140);
    let rawWindowTotal = 0;
    const rawBlocks: { readonly chars: readonly string[]; readonly cue: AnimaticDialogueCueInput; readonly popMs: number; readonly typingMs: number }[] = [];

    for (let d = 0; d < cut.dialogues.length; d += 1) {
      const cue = cut.dialogues[d];
      if (!cue) continue;
      const chars = Array.from(cue.text);
      const cps = clamp(cue.readingSpeedCharsPerSec ?? DEFAULT_READING_CHARS_PER_SEC, 4, 24);
      const popMs = cue.revealStyle === "typewriter" ? 40 : BALLOON_POP_IN_MS;
      const typingMs = cue.revealStyle === "pop-in" ? 0 : Math.max(120, (chars.length / cps) * 1000);
      rawBlocks.push({ chars, cue, popMs, typingMs });
      rawWindowTotal += popMs + typingMs + (d > 0 ? BALLOON_GAP_MS : 0);
    }

    const compression = rawWindowTotal > availableDialogueWindowMs && rawWindowTotal > 0
      ? availableDialogueWindowMs / rawWindowTotal
      : 1.0;

    let dialogueCursorMs = startTimeMs + leadInMs;
    for (let d = 0; d < rawBlocks.length; d += 1) {
      const block = rawBlocks[d];
      if (!block) continue;
      if (d > 0) dialogueCursorMs += BALLOON_GAP_MS * compression;
      const popInStartMs = dialogueCursorMs;
      const popInEndMs = popInStartMs + block.popMs * compression;
      const typingStartMs = block.cue.revealStyle === "pop-then-type" ? popInEndMs : popInStartMs;
      const typingEndMs = typingStartMs + block.typingMs * compression;
      dialogueCursorMs = Math.max(popInEndMs, typingEndMs);
      balloons.push({
        balloonId: block.cue.balloonId,
        characters: block.chars,
        emphasisLevel: clamp(block.cue.emphasisLevel ?? emotionIntensity, 0, 1),
        holdEndMs: endTimeMs,
        popInEndMs,
        popInStartMs,
        revealStyle: block.cue.revealStyle ?? "pop-then-type",
        speakerId: block.cue.speakerId ?? null,
        text: block.cue.text,
        totalChars: block.chars.length,
        typingEndMs,
        typingStartMs,
      });
    }

    // SFX 큐 비트 정렬 및 감쇠 카메라 쉐이크 파라미터 계산.
    const sfxCues: CompiledSfxCue[] = [];
    for (let s = 0; s < rawSfx.length; s += 1) {
      const sfx = rawSfx[s];
      if (!sfx) continue;
      const strength = clamp(sfx.impactStrength, 0, 1);
      const defaultOffset = Math.min(snappedBeats - snapGranularityBeats, s === 0 ? 1 : 1 + s);
      const relBeats = clamp(
        sfx.relativeBeatOffset !== undefined
          ? Math.round(sfx.relativeBeatOffset / snapGranularityBeats) * snapGranularityBeats
          : Math.max(0, defaultOffset),
        0,
        Math.max(0, snappedBeats - 0.25),
      );
      const beatIndex = startBeat + relBeats;
      sfxCues.push({
        beatIndex,
        impactStrength: strength,
        sfxId: sfx.sfxId,
        shakeDecayRatePerSec: 6.5,
        shakeDurationMs: prefersReducedMotion ? 0 : clamp(sfx.shakeDurationMs ?? (220 + strength * 320), 120, 900),
        shakeFrequencyHz: 18 + strength * 10,
        shakePeakAmplitudePx: prefersReducedMotion ? 0 : (4 + strength * 22) * (0.6 + 0.4 * emotionIntensity),
        shakeRollPeakDeg: prefersReducedMotion ? 0 : strength * 2.4,
        text: sfx.text,
        triggerTimeMs: beatGridOffsetMs + beatIndex * beatDurationMs,
      });
    }

    // 2차 모션 요소 파라미터 정규화.
    const secondaryMotions: CompiledSecondaryMotionSpec[] = [];
    const rawSecondary = cut.secondaryMotionElements ?? [];
    for (let m = 0; m < rawSecondary.length; m += 1) {
      const item = rawSecondary[m];
      if (!item) continue;
      const def = SECONDARY_MOTION_DEFAULTS[item.kind];
      secondaryMotions.push({
        amplitudePx: prefersReducedMotion ? 0 : Math.max(0, item.amplitudePx ?? def.amplitudePx) * (0.55 + 0.65 * emotionIntensity),
        dampingRatio: clamp(item.dampingRatio ?? def.dampingRatio, 0.08, 0.9),
        elementId: item.elementId,
        kind: item.kind,
        phaseSeedRad: hashSeedRad(`${cut.cutId}:${item.elementId}`),
        stiffnessHz: clamp(item.stiffnessHz ?? def.stiffnessHz, 0.3, 6.0),
      });
    }

    compiledCuts.push({
      balloons, beatAlignmentErrorMs, cameraMode, cutId: cut.cutId, cutIndex, durationBeats: snappedBeats,
      durationMs, emotionIntensity, emotionTag, endBeat, endTimeMs, isBeatLocked,
      originalRequestedTransitionIn: transitionChoice.originalRequested,
      reducedMotionFallbackApplied: transitionChoice.reducedFallbackApplied,
      secondaryMotions, sfxCues, startBeat, startTimeMs, title: cut.title ?? cut.cutId,
      transitionInDurationMs, transitionInKind: transitionChoice.kind,
    });
  }

  const totalBeats = cursorBeats;
  const totalDurationMs = compiledCuts.length > 0
    ? (compiledCuts[compiledCuts.length - 1]?.endTimeMs ?? beatGridOffsetMs)
    : beatGridOffsetMs;

  const beatMarkers: BeatGridMarker[] = [];
  for (let b = 0; b < Math.ceil(totalBeats) + 1; b += 1) {
    beatMarkers.push({
      barIndex: Math.floor(b / beatsPerBar),
      beatInBar: b % beatsPerBar,
      beatIndex: b,
      isDownbeat: b % beatsPerBar === 0,
      timeMs: beatGridOffsetMs + b * beatDurationMs,
    });
  }

  return {
    beatDurationMs, beatGridOffsetMs, beatMarkers, beatsPerBar, bpm, cuts: compiledCuts, fps,
    prefersReducedMotion, sequenceId: input.sequenceId, snapGranularityBeats, totalBeats,
    totalDurationMs, totalFrames: Math.max(1, Math.round((totalDurationMs / 1000) * fps)),
  };
}

function findActiveCutIndex(cuts: readonly CompiledAnimaticCut[], clampedTimeMs: number): number {
  if (cuts.length === 0) return -1;
  for (let i = 0; i < cuts.length; i += 1) {
    const cut = cuts[i];
    if (cut && (clampedTimeMs < cut.endTimeMs || i === cuts.length - 1)) return i;
  }
  return cuts.length - 1;
}

/**
 * 컴파일된 애니매틱 타임라인을 임의 시점 `timeMs`에서 샘플링해
 * 활성 컷, 박자 위상, 트랜지션, 말풍선 타이핑, 2차 모션 및 감쇠 카메라 쉐이크를 반환한다.
 */
export function sampleAnimaticTimelineAtTimeMs(
  timeline: CompiledAnimaticTimeline,
  timeMs: number,
): SampledAnimaticFrameState {
  const clampedTimeMs = clamp(timeMs, 0, timeline.totalDurationMs);
  const frameIndex = Math.round((clampedTimeMs / 1000) * timeline.fps);
  const currentBeatFloat = Math.max(0, (clampedTimeMs - timeline.beatGridOffsetMs) / Math.max(1, timeline.beatDurationMs));
  const beatIndex = Math.floor(currentBeatFloat);
  const beatPhase = currentBeatFloat - beatIndex;
  const beatPulseIntensity = Math.exp(-5.0 * beatPhase);

  const activeCutIndex = findActiveCutIndex(timeline.cuts, clampedTimeMs);
  const activeCut = activeCutIndex >= 0 ? timeline.cuts[activeCutIndex] : undefined;

  if (!activeCut) {
    return {
      activeCutId: "", activeCutIndex: -1, activeSfxIds: [], balloons: [], beatIndex, beatPhase,
      beatPulseIntensity, cameraMode: "breath-idle",
      cameraShake: { intensity: 0, offsetXPx: 0, offsetYPx: 0, rollDeg: 0 },
      clampedTimeMs, currentBeatFloat, cutLocalTimeMs: 0, cutNormalizedProgress: 0, frameIndex,
      prefersReducedMotion: timeline.prefersReducedMotion, secondaryMotions: [],
      transition: { active: false, dissolveAlpha: 1, flashOpacity: 0, inkWipeProgress: 1, kind: "cut", outgoingCutId: null, progress: 1, whipPanOffsetNormalized: 0 },
    };
  }

  const cutLocalTimeMs = clamp(clampedTimeMs - activeCut.startTimeMs, 0, activeCut.durationMs);
  const cutNormalizedProgress = activeCut.durationMs > 0 ? clamp(cutLocalTimeMs / activeCut.durationMs, 0, 1) : 1;

  // 트랜지션 샘플링.
  const outgoingCut = activeCutIndex > 0 ? timeline.cuts[activeCutIndex - 1] : undefined;
  const transDur = activeCut.transitionInDurationMs;
  const transitionActive = transDur > 0 && cutLocalTimeMs < transDur;
  const transProgress = transitionActive ? clamp(cutLocalTimeMs / transDur, 0, 1) : 1;

  let dissolveAlpha = 1;
  let flashOpacity = 0;
  let inkWipeProgress = 1;
  let whipPanOffsetNormalized = 0;

  if (transitionActive) {
    const smooth = transProgress * transProgress * (3 - 2 * transProgress);
    if (activeCut.transitionInKind === "cross-dissolve") dissolveAlpha = smooth;
    else if (activeCut.transitionInKind === "whip-pan") whipPanOffsetNormalized = timeline.prefersReducedMotion ? 0 : 1 - smooth;
    else if (activeCut.transitionInKind === "flash-impact") flashOpacity = timeline.prefersReducedMotion ? 0 : Math.sin(Math.PI * transProgress) * 0.92;
    else if (activeCut.transitionInKind === "ink-wipe") inkWipeProgress = smooth;
  }

  const transition: SampledTransitionState = {
    active: transitionActive, dissolveAlpha, flashOpacity, inkWipeProgress,
    kind: activeCut.transitionInKind,
    outgoingCutId: transitionActive && outgoingCut ? outgoingCut.cutId : null,
    progress: transProgress, whipPanOffsetNormalized,
  };

  // 말풍선 팝인 및 타이핑 리빌 샘플링.
  const balloons: SampledBalloonState[] = [];
  for (let i = 0; i < activeCut.balloons.length; i += 1) {
    const cue = activeCut.balloons[i];
    if (!cue) continue;
    if (clampedTimeMs < cue.popInStartMs) {
      balloons.push({
        balloonId: cue.balloonId, opacity: 0, scale: timeline.prefersReducedMotion ? 1 : 0.72,
        totalChars: cue.totalChars, visibility: "hidden", visibleCharCount: 0, visibleText: "",
      });
      continue;
    }
    const popProgress = clamp((clampedTimeMs - cue.popInStartMs) / Math.max(1, cue.popInEndMs - cue.popInStartMs), 0, 1);
    const scale = timeline.prefersReducedMotion
      ? 1.0
      : 0.72 + 0.28 * popProgress + Math.sin(Math.PI * popProgress) * 0.07 * (0.5 + 0.5 * cue.emphasisLevel);

    let visibleCharCount = cue.totalChars;
    let visibility: SampledBalloonState["visibility"] = "holding";
    if (clampedTimeMs < cue.popInEndMs && cue.revealStyle === "pop-then-type") {
      visibleCharCount = 0;
      visibility = "popping-in";
    } else if (clampedTimeMs < cue.typingEndMs && cue.typingEndMs > cue.typingStartMs) {
      const typeProgress = clamp((clampedTimeMs - cue.typingStartMs) / (cue.typingEndMs - cue.typingStartMs), 0, 1);
      visibleCharCount = Math.min(cue.totalChars, Math.max(1, Math.ceil(typeProgress * cue.totalChars)));
      visibility = "typing";
    } else if (clampedTimeMs < cue.popInEndMs) {
      visibility = "popping-in";
    }
    balloons.push({
      balloonId: cue.balloonId, opacity: popProgress, scale, totalChars: cue.totalChars,
      visibility, visibleCharCount, visibleText: cue.characters.slice(0, visibleCharCount).join(""),
    });
  }

  // SFX 감쇠 카메라 쉐이크 합산.
  const activeSfxIds: string[] = [];
  let shakeX = 0;
  let shakeY = 0;
  let shakeRoll = 0;
  let shakeEnvelopeSum = 0;

  for (let s = 0; s < activeCut.sfxCues.length; s += 1) {
    const sfx = activeCut.sfxCues[s];
    if (!sfx) continue;
    const elapsedMs = clampedTimeMs - sfx.triggerTimeMs;
    if (elapsedMs < 0) continue;
    if (elapsedMs <= Math.max(300, sfx.shakeDurationMs)) activeSfxIds.push(sfx.sfxId);
    if (timeline.prefersReducedMotion || sfx.shakeDurationMs <= 0 || elapsedMs > sfx.shakeDurationMs) continue;
    const dtSec = elapsedMs / 1000;
    const envelope = Math.exp(-sfx.shakeDecayRatePerSec * dtSec);
    const omega = 2 * Math.PI * sfx.shakeFrequencyHz;
    const amp = sfx.shakePeakAmplitudePx * envelope;
    shakeX += amp * Math.cos(omega * dtSec);
    shakeY += amp * 0.72 * Math.sin(omega * 1.17 * dtSec + 0.6);
    shakeRoll += sfx.shakeRollPeakDeg * envelope * Math.sin(omega * 0.85 * dtSec);
    shakeEnvelopeSum += sfx.impactStrength * envelope;
  }

  const cameraShake: SampledCameraShakeState = timeline.prefersReducedMotion
    ? { intensity: 0, offsetXPx: 0, offsetYPx: 0, rollDeg: 0 }
    : { intensity: clamp(shakeEnvelopeSum, 0, 1.5), offsetXPx: shakeX, offsetYPx: shakeY, rollDeg: shakeRoll };

  // 2차 모션 위상(머리카락·망토 흔들림 + SFX 충격 감쇠 연성).
  const secondaryMotions: SampledSecondaryMotionState[] = [];
  const tSec = clampedTimeMs / 1000;
  for (let m = 0; m < activeCut.secondaryMotions.length; m += 1) {
    const spec = activeCut.secondaryMotions[m];
    if (!spec) continue;
    if (timeline.prefersReducedMotion || spec.amplitudePx === 0) {
      secondaryMotions.push({ elementId: spec.elementId, kind: spec.kind, phaseRad: 0, swayAngleDeg: 0, swayOffsetPx: 0 });
      continue;
    }
    const phaseRad = 2 * Math.PI * spec.stiffnessHz * tSec + spec.phaseSeedRad;
    const swayOffsetPx =
      spec.amplitudePx *
      (1 + 0.18 * beatPulseIntensity) *
      (1 + 0.65 * cameraShake.intensity) *
      (Math.sin(phaseRad) * (1 - 0.25 * spec.dampingRatio) + 0.25 * Math.sin(2 * phaseRad + 0.5));
    secondaryMotions.push({
      elementId: spec.elementId, kind: spec.kind, phaseRad,
      swayAngleDeg: (swayOffsetPx / Math.max(1, spec.amplitudePx)) * 6.5,
      swayOffsetPx,
    });
  }

  return {
    activeCutId: activeCut.cutId, activeCutIndex, activeSfxIds, balloons, beatIndex, beatPhase,
    beatPulseIntensity, cameraMode: activeCut.cameraMode, cameraShake, clampedTimeMs, currentBeatFloat,
    cutLocalTimeMs, cutNormalizedProgress, frameIndex, prefersReducedMotion: timeline.prefersReducedMotion,
    secondaryMotions, transition,
  };
}
