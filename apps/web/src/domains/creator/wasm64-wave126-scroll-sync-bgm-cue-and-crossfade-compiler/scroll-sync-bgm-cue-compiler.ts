/**
 * Wave 126 — 웹툰 세로 스크롤 동기화 BGM 정전력(Equal-Power) 크로스페이드 컴파일러,
 * 극적 무음 컷 완전 격리(<= 0.001 / -60dB, >= 40ms 안티클릭 페이드) 및 큐시트 입력 검증기.
 */

import {
  CAMELOT_MUSICAL_KEY_LABELS,
  DEFAULT_DRAMATIC_SILENCE_FLOOR_LINEAR,
  DEFAULT_MIN_ANTICLICK_FADE_MS,
  DEFAULT_REFERENCE_SCROLL_VELOCITY_PX_PER_SEC,
  SILENCE_FLOOR_DB,
  type ActiveTrackGainEntry,
  type BgmCueValidationIssue,
  type BgmTrackCueSpec,
  type CamelotKey,
  type CamelotMode,
  type CamelotNumber,
  type EqualPowerCrossfadePairInfo,
  type EvaluateScrollBgmMixOptions,
  type ParsedCamelotKey,
  type ScrollBgmMixSnapshot,
  type TrackEnvelopePhase,
} from "./scroll-sync-bgm-types";

const HALF_PI = Math.PI / 2;
const SILENCE_RAMP_MAX_SPAN_RATIO = 0.35;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function round6(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function linearGainToDb(linear: number): number {
  if (!Number.isFinite(linear) || linear <= 0.000016) return SILENCE_FLOOR_DB;
  const db = 20 * Math.log10(linear);
  return Math.max(SILENCE_FLOOR_DB, Math.round(db * 100) / 100);
}

/** 문자열이 유효한 카멜롯 휠 키("1A".."12A", "1B".."12B")인지 판정한다. */
export function isValidCamelotKey(raw: string): raw is CamelotKey {
  return Object.prototype.hasOwnProperty.call(CAMELOT_MUSICAL_KEY_LABELS, raw);
}

/** 카멜롯 키 문자열을 시간(1~12), 모드(A/B), 음악적 조 이름으로 분해한다. */
export function parseCamelotKey(raw: string): ParsedCamelotKey | null {
  if (typeof raw !== "string" || !isValidCamelotKey(raw)) return null;
  const mode = raw.charAt(raw.length - 1) as CamelotMode;
  const hour = Number(raw.slice(0, raw.length - 1)) as CamelotNumber;
  return {
    raw,
    hour,
    mode,
    musicalKeyName: CAMELOT_MUSICAL_KEY_LABELS[raw],
  };
}

/** 큐시트 입력의 범위·페이드·BPM·카멜롯 키·LUFS 유효성을 fail-closed 방식으로 검증한다. */
export function validateBgmCueSheet(
  cues: readonly BgmTrackCueSpec[],
): readonly BgmCueValidationIssue[] {
  const issues: BgmCueValidationIssue[] = [];
  if (!Array.isArray(cues) || cues.length === 0) {
    issues.push({
      code: "empty-cue-sheet",
      messageKo: "BGM 큐시트가 비어 있습니다. 최소 1개 이상의 유효한 큐가 필요합니다.",
    });
    return issues;
  }

  const seenIds: Record<string, boolean> = {};
  for (let i = 0; i < cues.length; i += 1) {
    const cue = cues[i];
    const idLabel = typeof cue.cueId === "string" ? cue.cueId.trim() : "";
    if (idLabel.length === 0) {
      issues.push({
        code: "invalid-cue-id",
        messageKo: `${i + 1}번째 큐의 cueId가 비어 있습니다.`,
      });
    } else if (seenIds[idLabel]) {
      issues.push({
        code: "duplicate-cue-id",
        cueId: idLabel,
        messageKo: `큐 ID "${idLabel}"이(가) 중복 선언되었습니다.`,
      });
    } else {
      seenIds[idLabel] = true;
    }

    if (
      !Number.isFinite(cue.startYPx) ||
      !Number.isFinite(cue.endYPx) ||
      cue.startYPx < 0 ||
      cue.endYPx <= cue.startYPx
    ) {
      issues.push({
        code: "invalid-cue-range",
        cueId: idLabel || undefined,
        messageKo: `큐 "${idLabel || `#${i + 1}`}"의 스크롤 구간(${String(cue.startYPx)}~${String(cue.endYPx)}px)이 역전되었거나 유효하지 않습니다.`,
      });
    }

    if (
      !Number.isFinite(cue.fadeInPx) ||
      !Number.isFinite(cue.fadeOutPx) ||
      cue.fadeInPx < 0 ||
      cue.fadeOutPx < 0
    ) {
      issues.push({
        code: "invalid-fade-px",
        cueId: idLabel || undefined,
        messageKo: `큐 "${idLabel || `#${i + 1}`}"의 페이드 길이(fadeInPx/fadeOutPx)는 0 이상 유한수여야 합니다.`,
      });
    }

    const isSilence = Boolean(cue.isDramaticSilenceCut);
    if (!Number.isFinite(cue.bpm) || (isSilence ? cue.bpm < 0 : cue.bpm <= 0)) {
      issues.push({
        code: "invalid-bpm",
        cueId: idLabel || undefined,
        messageKo: `큐 "${idLabel || `#${i + 1}`}"의 BPM(${String(cue.bpm)})이 유효하지 않습니다.`,
      });
    }

    if (!isValidCamelotKey(cue.musicalKeyCamelot)) {
      issues.push({
        code: "invalid-camelot-key",
        cueId: idLabel || undefined,
        messageKo: `큐 "${idLabel || `#${i + 1}`}"의 카멜롯 키("${String(cue.musicalKeyCamelot)}")가 1A~12B 범위를 벗어났습니다.`,
      });
    }

    if (
      !Number.isFinite(cue.targetLufs) ||
      cue.targetLufs > 0 ||
      (!isSilence && cue.targetLufs < -70)
    ) {
      issues.push({
        code: "invalid-lufs",
        cueId: idLabel || undefined,
        messageKo: `큐 "${idLabel || `#${i + 1}`}"의 목표 라우드니스(${String(cue.targetLufs)} LUFS)가 허용 범위를 벗어났습니다.`,
      });
    }

    if (
      cue.duckingForDialogueDb !== undefined &&
      (!Number.isFinite(cue.duckingForDialogueDb) || Math.abs(cue.duckingForDialogueDb) > 48)
    ) {
      issues.push({
        code: "invalid-ducking-db",
        cueId: idLabel || undefined,
        messageKo: `큐 "${idLabel || `#${i + 1}`}"의 대사 덕킹 감쇠량(${String(cue.duckingForDialogueDb)} dB)이 유효하지 않습니다.`,
      });
    }
  }
  return issues;
}

/** 큐 목록을 시작 위치·종료 위치·ID 순으로 비파괴 정렬한다. */
export function sortBgmCuesDeterministically(
  cues: readonly BgmTrackCueSpec[],
): readonly BgmTrackCueSpec[] {
  return cues.slice().sort((a, b) => {
    if (a.startYPx !== b.startYPx) return a.startYPx - b.startYPx;
    if (a.endYPx !== b.endYPx) return a.endYPx - b.endYPx;
    return a.cueId < b.cueId ? -1 : a.cueId > b.cueId ? 1 : 0;
  });
}

function computeSilenceCutBounds(cue: BgmTrackCueSpec): {
  readonly entryRampPx: number;
  readonly exitRampPx: number;
  readonly coreStartYPx: number;
  readonly coreEndYPx: number;
} {
  const span = Math.max(0, cue.endYPx - cue.startYPx);
  const maxRamp = span * SILENCE_RAMP_MAX_SPAN_RATIO;
  const entryRampPx = Math.min(Math.max(0, cue.fadeInPx), maxRamp);
  const exitRampPx = Math.min(Math.max(0, cue.fadeOutPx), maxRamp);
  return {
    entryRampPx,
    exitRampPx,
    coreStartYPx: cue.startYPx + entryRampPx,
    coreEndYPx: cue.endYPx - exitRampPx,
  };
}

interface SilenceEvaluation {
  readonly multiplier: number;
  readonly inCore: boolean;
  readonly activeSilenceCutId: string | null;
  readonly effectiveAntiClickFadeMs: number;
}

function evaluateDramaticSilenceAtY(
  silenceCues: readonly BgmTrackCueSpec[],
  yPx: number,
  velocityPxPerSec: number,
  minAntiClickFadeMs: number,
): SilenceEvaluation {
  const safeVelocity = Math.max(1, Math.abs(velocityPxPerSec));
  let multiplier = 1;
  let inCore = false;
  let activeSilenceCutId: string | null = null;
  let effectiveAntiClickFadeMs = minAntiClickFadeMs;

  for (let i = 0; i < silenceCues.length; i += 1) {
    const sc = silenceCues[i];
    if (yPx < sc.startYPx || yPx > sc.endYPx) continue;

    const bounds = computeSilenceCutBounds(sc);
    const entryMs = (bounds.entryRampPx / safeVelocity) * 1000;
    const exitMs = (bounds.exitRampPx / safeVelocity) * 1000;
    const minSpatialMs = Math.min(
      entryMs > 0 ? entryMs : minAntiClickFadeMs,
      exitMs > 0 ? exitMs : minAntiClickFadeMs,
    );
    effectiveAntiClickFadeMs = Math.max(
      effectiveAntiClickFadeMs,
      minAntiClickFadeMs,
      Math.round(minSpatialMs * 100) / 100,
    );

    let localMult = 1;
    if (yPx >= bounds.coreStartYPx && yPx <= bounds.coreEndYPx) {
      localMult = 0;
      inCore = true;
      activeSilenceCutId = sc.cueId;
    } else if (yPx < bounds.coreStartYPx && bounds.entryRampPx > 0) {
      const u = clamp((yPx - sc.startYPx) / bounds.entryRampPx, 0, 1);
      localMult = Math.cos(u * HALF_PI);
      if (localMult < 1e-12) localMult = 0;
      activeSilenceCutId = sc.cueId;
    } else if (yPx > bounds.coreEndYPx && bounds.exitRampPx > 0) {
      const u = clamp((yPx - bounds.coreEndYPx) / bounds.exitRampPx, 0, 1);
      localMult = Math.sin(u * HALF_PI);
      if (localMult < 1e-12) localMult = 0;
      activeSilenceCutId = sc.cueId;
    }

    if (localMult < multiplier) multiplier = localMult;
  }

  return {
    multiplier: clamp(multiplier, 0, 1),
    inCore,
    activeSilenceCutId,
    effectiveAntiClickFadeMs: Math.max(minAntiClickFadeMs, effectiveAntiClickFadeMs),
  };
}

function evaluateSoloEnvelope(
  cue: BgmTrackCueSpec,
  yPx: number,
): { readonly gain: number; readonly phase: TrackEnvelopePhase } {
  const span = cue.endYPx - cue.startYPx;
  const effFadeIn = Math.min(Math.max(0, cue.fadeInPx), span / 2);
  const effFadeOut = Math.min(Math.max(0, cue.fadeOutPx), span / 2);

  if (effFadeIn > 0 && yPx < cue.startYPx + effFadeIn) {
    const u = clamp((yPx - cue.startYPx) / effFadeIn, 0, 1);
    const gain = Math.sin(u * HALF_PI);
    return { gain: gain < 1e-12 ? 0 : gain, phase: "fade-in" };
  }
  if (effFadeOut > 0 && yPx > cue.endYPx - effFadeOut) {
    const u = clamp((cue.endYPx - yPx) / effFadeOut, 0, 1);
    const gain = Math.sin(u * HALF_PI);
    return { gain: gain < 1e-12 ? 0 : gain, phase: "fade-out" };
  }
  return { gain: 1, phase: "sustain" };
}

function computeDuckingMultiplier(cue: BgmTrackCueSpec, dialogueActive: boolean): {
  readonly multiplier: number;
  readonly appliedDb: number;
} {
  if (!dialogueActive || cue.duckingForDialogueDb === undefined || cue.duckingForDialogueDb === 0) {
    return { multiplier: 1, appliedDb: 0 };
  }
  const appliedDb = -Math.abs(cue.duckingForDialogueDb);
  return { multiplier: Math.pow(10, appliedDb / 20), appliedDb };
}

/**
 * 특정 세로 스크롤 좌표(`yPx`)에서 활성 BGM 트랙들의 정전력(Equal-Power) 이득과
 * 극적 무음 컷 격리 상태를 계산한다.
 *
 * - 인접 2트랙 겹침 구간: `gainA = cos(t * PI / 2)`, `gainB = sin(t * PI / 2)`
 *   (`gainA^2 + gainB^2 === 1.0 ± 1e-6`, 볼륨 dip 0건).
 * - 극적 무음 컷 코어 구간: 모든 배경 BGM 선형 이득 `<= 0.001` (`-60 dB` 이하).
 */
export function evaluateScrollBgmMixAtPosition(
  cues: readonly BgmTrackCueSpec[],
  yPx: number,
  options: EvaluateScrollBgmMixOptions = {},
): ScrollBgmMixSnapshot {
  const minAntiClickFadeMs = Math.max(
    DEFAULT_MIN_ANTICLICK_FADE_MS,
    Number.isFinite(options.minAntiClickFadeMs ?? NaN)
      ? (options.minAntiClickFadeMs as number)
      : DEFAULT_MIN_ANTICLICK_FADE_MS,
  );
  const safeY = Number.isFinite(yPx) ? Math.max(0, yPx) : 0;
  const validationIssues = validateBgmCueSheet(cues);

  if (validationIssues.length > 0) {
    return {
      ok: false,
      yPx: safeY,
      activeTracks: [],
      isCrossfadeZone: false,
      crossfadePair: null,
      totalPowerSum: 0,
      isDramaticSilenceCore: false,
      activeSilenceCutId: null,
      effectiveAntiClickFadeMs: minAntiClickFadeMs,
      maxActiveGainLinear: 0,
      validationIssues,
    };
  }

  const sorted = sortBgmCuesDeterministically(cues);
  const normalCues: BgmTrackCueSpec[] = [];
  const silenceCues: BgmTrackCueSpec[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i].isDramaticSilenceCut) silenceCues.push(sorted[i]);
    else normalCues.push(sorted[i]);
  }

  const velocity = Number.isFinite(options.scrollVelocityPxPerSec ?? NaN)
    ? Math.max(1, Math.abs(options.scrollVelocityPxPerSec as number))
    : DEFAULT_REFERENCE_SCROLL_VELOCITY_PX_PER_SEC;
  const dialogueActive = Boolean(options.dialogueActive);
  const silenceFloor =
    Number.isFinite(options.dramaticSilenceFloorLinear ?? NaN) &&
    (options.dramaticSilenceFloorLinear as number) > 0
      ? Math.min(DEFAULT_DRAMATIC_SILENCE_FLOOR_LINEAR, options.dramaticSilenceFloorLinear as number)
      : DEFAULT_DRAMATIC_SILENCE_FLOOR_LINEAR;

  const covering: BgmTrackCueSpec[] = [];
  for (let i = 0; i < normalCues.length; i += 1) {
    const cue = normalCues[i];
    if (safeY >= cue.startYPx && safeY < cue.endYPx) covering.push(cue);
  }
  if (covering.length < 2) {
    for (let i = 0; i < normalCues.length; i += 1) {
      const cue = normalCues[i];
      if (safeY === cue.endYPx) {
        const isLastCue = i === normalCues.length - 1;
        const isCrossfadeEnd =
          covering.length === 1 &&
          covering[0].cueId !== cue.cueId &&
          covering[0].startYPx < cue.endYPx;
        if (isLastCue || isCrossfadeEnd) covering.push(cue);
      }
    }
    if (covering.length > 1) {
      covering.sort((a, b) =>
        a.startYPx !== b.startYPx ? a.startYPx - b.startYPx : a.endYPx - b.endYPx,
      );
    }
  }

  const silence = evaluateDramaticSilenceAtY(silenceCues, safeY, velocity, minAntiClickFadeMs);
  let crossfadePair: EqualPowerCrossfadePairInfo | null = null;
  const baseGains: {
    readonly cue: BgmTrackCueSpec;
    readonly gain: number;
    readonly phase: TrackEnvelopePhase;
  }[] = [];

  if (covering.length === 1) {
    const solo = evaluateSoloEnvelope(covering[0], safeY);
    baseGains.push({ cue: covering[0], gain: solo.gain, phase: solo.phase });
  } else if (covering.length === 2) {
    const outgoing = covering[0];
    const incoming = covering[1];
    const overlapStart = Math.max(outgoing.startYPx, incoming.startYPx);
    const overlapEnd = Math.min(outgoing.endYPx, incoming.endYPx);
    const overlapSpan = overlapEnd - overlapStart;
    const t = overlapSpan > 0 ? clamp((safeY - overlapStart) / overlapSpan, 0, 1) : 1;
    const rawOut = Math.cos(t * HALF_PI);
    const rawIn = Math.sin(t * HALF_PI);
    const outgoingGain = rawOut < 1e-12 ? 0 : rawOut;
    const incomingGain = rawIn < 1e-12 ? 0 : rawIn;
    const powerSum = outgoingGain * outgoingGain + incomingGain * incomingGain;

    crossfadePair = {
      outgoingCueId: outgoing.cueId,
      incomingCueId: incoming.cueId,
      overlapStartYPx: overlapStart,
      overlapEndYPx: overlapEnd,
      progress: round6(t),
      outgoingGain,
      incomingGain,
      powerSum,
    };
    baseGains.push({ cue: outgoing, gain: outgoingGain, phase: "crossfade-out" });
    baseGains.push({ cue: incoming, gain: incomingGain, phase: "crossfade-in" });
  } else if (covering.length >= 3) {
    let sumSq = 0;
    const prelim: number[] = [];
    for (let i = 0; i < covering.length; i += 1) {
      const env = evaluateSoloEnvelope(covering[i], safeY);
      prelim.push(env.gain);
      sumSq += env.gain * env.gain;
    }
    const norm = sumSq > 1 ? 1 / Math.sqrt(sumSq) : 1;
    for (let i = 0; i < covering.length; i += 1) {
      baseGains.push({ cue: covering[i], gain: prelim[i] * norm, phase: "multi-overlap" });
    }
  }

  const activeTracks: ActiveTrackGainEntry[] = [];
  let totalPowerSum = 0;
  let maxActiveGainLinear = 0;

  for (let i = 0; i < baseGains.length; i += 1) {
    const item = baseGains[i];
    const duck = computeDuckingMultiplier(item.cue, dialogueActive);
    let finalGain = item.gain * duck.multiplier * silence.multiplier;
    if (silence.inCore && finalGain > silenceFloor) finalGain = 0;
    if (finalGain < 1e-12) finalGain = 0;

    const phase: TrackEnvelopePhase = silence.inCore ? "silence-isolated" : item.phase;
    totalPowerSum += finalGain * finalGain;
    if (finalGain > maxActiveGainLinear) maxActiveGainLinear = finalGain;

    activeTracks.push({
      cueId: item.cue.cueId,
      trackId: item.cue.trackId,
      titleKo: item.cue.titleKo,
      baseLinearGain: item.gain,
      linearGain: finalGain,
      gainDb: linearGainToDb(finalGain),
      phase,
      duckingAppliedDb: duck.appliedDb,
    });
  }

  return {
    ok: true,
    yPx: safeY,
    activeTracks,
    isCrossfadeZone: crossfadePair !== null && !silence.inCore,
    crossfadePair,
    totalPowerSum,
    isDramaticSilenceCore: silence.inCore,
    activeSilenceCutId: silence.activeSilenceCutId,
    effectiveAntiClickFadeMs: silence.effectiveAntiClickFadeMs,
    maxActiveGainLinear,
    validationIssues: [],
  };
}
