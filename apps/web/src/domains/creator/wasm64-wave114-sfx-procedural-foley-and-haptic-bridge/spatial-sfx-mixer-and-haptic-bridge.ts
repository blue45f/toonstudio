/**
 * Wave 114: 정전력(Constant-Power) 공간 스테레오 SFX 믹서 & 무음 독자 자막·햅틱 접근성 브리지.
 *
 * - 컷 수평 좌표(`panelXNorm: 0..1`)를 `leftGain = cos(theta)`, `rightGain = sin(theta)`
 *   정전력 법칙(`leftGain^2 + rightGain^2 === 1`)으로 스테레오 마스터에 합성한다.
 * - 다중 큐 중첩 시 스테레오 링크 소프트니 트루피크 리미터로 `-1.0 dBFS` 상한과 클리핑 0건을 유지한다.
 * - 모든 큐에 한국어 무음 독자 자막을 부착하고, 동작 줄이기·햅틱 비활성 시 진동과 흔들림을 0으로 차단한다.
 */

import {
  PEAK_SAFETY_CEILING_DBFS,
  PEAK_SAFETY_CEILING_LINEAR,
  getArchetypeCaptionCategoryKo,
  linearToDbfs,
  synthesizeKoreanSfxFoleyPcm,
  type SfxAcousticDescriptors,
  type SfxFoleyArchetype,
  type SfxSampleRateHz,
} from "./korean-sfx-procedural-foley-dsp";
import { clamp } from "./foley-dsp-math";

/** 햅틱 단일 진동 버스트 최대 허용 시간(ms). */
export const MAX_HAPTIC_BURST_MS = 120;

export type StereoPanZone = "L" | "C" | "R";
export type SfxIntensityTierKo = "약함" | "중간" | "강함";

export interface EpisodeSfxCueInput {
  readonly cueId: string;
  readonly panelId: string;
  readonly sfxTextKo: string;
  readonly startTimeMs: number;
  readonly durationMs: number;
  readonly panelXNorm: number;
  readonly intensity: number;
  readonly archetypeOverride?: SfxFoleyArchetype;
  readonly seedOverride?: number | string;
  readonly baseFreqHzOverride?: number;
}

export interface EpisodeSfxMixOptions {
  readonly episodeId?: string;
  readonly sampleRateHz?: SfxSampleRateHz;
  readonly tailPaddingMs?: number;
  readonly prefersReducedMotion?: boolean;
  readonly hapticsEnabled?: boolean;
  readonly maxHapticBurstMs?: number;
  readonly masterGain?: number;
  readonly wavComparisonBitDepth?: 16 | 24;
}

export interface ConstantPowerStereoPan {
  readonly panelXNorm: number;
  readonly panAngleRad: number;
  readonly leftGain: number;
  readonly rightGain: number;
  readonly powerSum: number;
  readonly stereoZone: StereoPanZone;
  readonly stereoZoneKo: "좌측" | "중앙" | "우측";
}

export interface HapticPulseEvent {
  readonly cueId: string;
  readonly panelId: string;
  readonly archetype: SfxFoleyArchetype;
  readonly startTimeMs: number;
  readonly durationMs: number;
  readonly intensity: number;
}

export interface CompiledEpisodeSfxCue {
  readonly cueId: string;
  readonly panelId: string;
  readonly sfxTextKo: string;
  readonly archetype: SfxFoleyArchetype;
  readonly startTimeMs: number;
  readonly durationMs: number;
  readonly endTimeMs: number;
  readonly intensity: number;
  readonly intensityTierKo: SfxIntensityTierKo;
  readonly seedNumber: number;
  readonly pan: ConstantPowerStereoPan;
  readonly monoDescriptors: SfxAcousticDescriptors;
  readonly accessibleCaptionKo: string;
  readonly spatialAccessibleCaptionKo: string;
  readonly hapticPatternMs: readonly number[];
  readonly visualShakePx: number;
  readonly hapticPulseEvents: readonly HapticPulseEvent[];
}

export interface SilentReaderCaptionEvent {
  readonly cueId: string;
  readonly panelId: string;
  readonly startTimeMs: number;
  readonly endTimeMs: number;
  readonly sfxTextKo: string;
  readonly accessibleCaptionKo: string;
  readonly spatialAccessibleCaptionKo: string;
  readonly stereoZone: StereoPanZone;
  readonly hapticPatternMs: readonly number[];
  readonly visualShakePx: number;
}

export interface SilentReaderAccessibilityBridge {
  readonly prefersReducedMotion: boolean;
  readonly hapticsEnabled: boolean;
  readonly hapticAndShakeSuppressed: boolean;
  readonly maxHapticBurstLimitMs: number;
  readonly maxObservedHapticBurstMs: number;
  readonly maxObservedVisualShakePx: number;
  readonly captionedCueCount: number;
  readonly totalCueCount: number;
  readonly captionCoverageRatio: number;
  readonly allCuesCaptioned: boolean;
  readonly reducedMotionCompliant: boolean;
  readonly captionEvents: readonly SilentReaderCaptionEvent[];
  readonly hapticEvents: readonly HapticPulseEvent[];
}

export interface StereoMasterMetrics {
  readonly sampleCount: number;
  readonly sampleRateHz: SfxSampleRateHz;
  readonly totalDurationMs: number;
  readonly maxAbsLeft: number;
  readonly maxAbsRight: number;
  readonly maxAbsMaster: number;
  readonly peakDbfsLeft: number;
  readonly peakDbfsRight: number;
  readonly masterPeakDbfs: number;
  readonly leftRmsLinear: number;
  readonly rightRmsLinear: number;
  readonly leftRmsDbfs: number;
  readonly rightRmsDbfs: number;
  readonly clippedSampleCount: number;
  readonly nonFiniteSampleCount: number;
  readonly peakCeilingDbfs: number;
  readonly withinBroadcastCeiling: boolean;
  readonly maxSimultaneousCues: number;
  readonly limiterActiveSampleCount: number;
}

export interface ProceduralByteBudgetComparison {
  readonly proceduralSeedPayloadJson: string;
  readonly proceduralSeedPayloadBytes: number;
  readonly equivalentWavBytes: number;
  readonly savedBytes: number;
  readonly byteSavingsPercent: number;
  readonly compressionRatio: number;
  readonly wavBitDepth: 16 | 24;
  readonly zeroAudioAssetDownloadRequired: true;
}

export interface EpisodeSfxMixReport {
  readonly episodeId: string;
  readonly sampleRateHz: SfxSampleRateHz;
  readonly totalDurationMs: number;
  readonly leftChannel: Float32Array;
  readonly rightChannel: Float32Array;
  readonly compiledCues: readonly CompiledEpisodeSfxCue[];
  readonly masterMetrics: StereoMasterMetrics;
  readonly accessibilityBridge: SilentReaderAccessibilityBridge;
  readonly byteBudget: ProceduralByteBudgetComparison;
}

function roundTo(value: number, digits: number): number {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function computeUtf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

/** 컷 내 정규화 수평 좌표(`0..1`)로 정전력 스테레오 패닝 이득(`cos`/`sin`)을 계산한다. */
export function computeConstantPowerStereoPan(panelXNorm: number): ConstantPowerStereoPan {
  const safeX = clamp(panelXNorm, 0, 1);
  const panAngleRad = safeX * (Math.PI * 0.5);
  const leftGain = Math.cos(panAngleRad);
  const rightGain = Math.sin(panAngleRad);
  const stereoZone: StereoPanZone = safeX < 0.36 ? "L" : safeX > 0.64 ? "R" : "C";
  const stereoZoneKo = stereoZone === "L" ? "좌측" : stereoZone === "R" ? "우측" : "중앙";
  return {
    panelXNorm: safeX,
    panAngleRad,
    leftGain,
    rightGain,
    powerSum: leftGain * leftGain + rightGain * rightGain,
    stereoZone,
    stereoZoneKo,
  };
}

function resolveIntensityTierKo(intensity: number): SfxIntensityTierKo {
  return intensity < 0.38 ? "약함" : intensity < 0.72 ? "중간" : "강함";
}

function buildCueHapticsAndShake(
  cueId: string,
  panelId: string,
  archetype: SfxFoleyArchetype,
  startTimeMs: number,
  intensity: number,
  transientTimesMs: readonly number[],
  maxBurstMs: number,
  suppressed: boolean,
): {
  readonly hapticPatternMs: readonly number[];
  readonly visualShakePx: number;
  readonly hapticPulseEvents: readonly HapticPulseEvent[];
} {
  if (suppressed) return { hapticPatternMs: [], visualShakePx: 0, hapticPulseEvents: [] };

  const clampedIntensity = clamp(intensity, 0.05, 1.0);
  const cap = clamp(Math.round(maxBurstMs), 16, MAX_HAPTIC_BURST_MS);
  const bound = (rawMs: number): number => Math.round(clamp(rawMs, 14, cap));

  let pattern: number[];
  let visualShakePx: number;
  switch (archetype) {
    case "impact-boom":
      pattern = clampedIntensity >= 0.75 ? [bound(58 + clampedIntensity * 62), 42, bound(24 + clampedIntensity * 30)] : [bound(58 + clampedIntensity * 62)];
      visualShakePx = roundTo(2.0 + clampedIntensity * 6.0, 1);
      break;
    case "blade-clash":
      pattern = [bound(24 + clampedIntensity * 38), 32, bound(18 + clampedIntensity * 28)];
      visualShakePx = roundTo(1.2 + clampedIntensity * 3.8, 1);
      break;
    case "heartbeat-thump":
      pattern = [bound(34 + clampedIntensity * 44), 135, bound(24 + clampedIntensity * 32)];
      visualShakePx = roundTo(0.4 + clampedIntensity * 1.6, 1);
      break;
    case "whoosh-dash":
      pattern = [bound(20 + clampedIntensity * 28), 36, bound(26 + clampedIntensity * 36)];
      visualShakePx = roundTo(0.8 + clampedIntensity * 2.2, 1);
      break;
    case "rain-ambience": {
      const p = bound(14 + clampedIntensity * 16);
      pattern = [p, 95, p, 110, p];
      visualShakePx = 0;
      break;
    }
    case "glass-shatter":
      pattern = [bound(28 + clampedIntensity * 40), 24, bound(18 + clampedIntensity * 24), 28, bound(16 + clampedIntensity * 18)];
      visualShakePx = roundTo(1.5 + clampedIntensity * 4.5, 1);
      break;
  }

  const events: HapticPulseEvent[] = [];
  let cursorMs = startTimeMs + Math.max(0, Math.min(transientTimesMs[0] ?? 0, 120));
  for (let idx = 0; idx < pattern.length; idx += 1) {
    const segMs = pattern[idx] ?? 0;
    if (idx % 2 === 0 && segMs > 0) {
      events.push({ cueId, panelId, archetype, startTimeMs: Math.round(cursorMs), durationMs: segMs, intensity: clampedIntensity });
    }
    cursorMs += segMs;
  }
  return { hapticPatternMs: pattern, visualShakePx, hapticPulseEvents: events };
}

/** 스테레오 링크 소프트니 트루피크 리미터(좌·우 동일 감쇠로 패닝 밸런스 보존). */
function applyStereoLinkedTruePeakLimiter(
  leftAccum: Float64Array,
  rightAccum: Float64Array,
  sampleRateHz: number,
): { readonly leftChannel: Float32Array; readonly rightChannel: Float32Array; readonly limiterActiveSampleCount: number } {
  const n = leftAccum.length;
  const leftChannel = new Float32Array(n);
  const rightChannel = new Float32Array(n);
  const knee = 0.7;
  const ceiling = PEAK_SAFETY_CEILING_LINEAR;
  const headroom = ceiling - knee;
  const releaseCoeff = 1 - Math.exp(-1 / (sampleRateHz * 0.032));
  let envGain = 1.0;
  let limiterActiveSampleCount = 0;

  for (let i = 0; i < n; i += 1) {
    const rawL = Number.isFinite(leftAccum[i]) ? (leftAccum[i] ?? 0) : 0;
    const rawR = Number.isFinite(rightAccum[i]) ? (rightAccum[i] ?? 0) : 0;
    const stereoPeak = Math.max(Math.abs(rawL), Math.abs(rawR));
    const targetGain =
      stereoPeak > knee
        ? (knee + headroom * Math.tanh((stereoPeak - knee) / headroom)) / stereoPeak
        : 1.0;
    envGain = targetGain < envGain ? targetGain : envGain + (targetGain - envGain) * releaseCoeff;
    if (envGain < 0.999) limiterActiveSampleCount += 1;
    leftChannel[i] = clamp(rawL * envGain, -ceiling, ceiling);
    rightChannel[i] = clamp(rawR * envGain, -ceiling, ceiling);
  }
  return { leftChannel, rightChannel, limiterActiveSampleCount };
}

function computeMaxSimultaneousCues(cues: readonly CompiledEpisodeSfxCue[]): number {
  if (cues.length === 0) return 0;
  const edges: { readonly timeMs: number; readonly delta: number }[] = [];
  for (let i = 0; i < cues.length; i += 1) {
    const cue = cues[i];
    if (cue === undefined) continue;
    edges.push({ timeMs: cue.startTimeMs, delta: 1 }, { timeMs: cue.endTimeMs, delta: -1 });
  }
  edges.sort((a, b) => (a.timeMs !== b.timeMs ? a.timeMs - b.timeMs : a.delta - b.delta));
  let active = 0;
  let maxActive = 0;
  for (let i = 0; i < edges.length; i += 1) {
    active += edges[i]?.delta ?? 0;
    if (active > maxActive) maxActive = active;
  }
  return maxActive;
}

/** 에피소드 효과음 큐 목록을 공간 스테레오 마스터 버퍼와 접근성 브리지·용량 절감 리포트로 컴파일한다. */
export function compileEpisodeSfxMixAndAccessibilityBridge(
  episodeCues: readonly EpisodeSfxCueInput[],
  options: EpisodeSfxMixOptions = {},
): EpisodeSfxMixReport {
  const episodeId = options.episodeId?.trim() || "episode-sfx-mix";
  const sampleRateHz: SfxSampleRateHz = options.sampleRateHz ?? 24000;
  const tailPaddingMs = Math.round(clamp(options.tailPaddingMs ?? 120, 40, 1500));
  const prefersReducedMotion = options.prefersReducedMotion === true;
  const hapticsEnabled = options.hapticsEnabled !== false;
  const hapticAndShakeSuppressed = prefersReducedMotion || !hapticsEnabled;
  const maxHapticBurstLimitMs = Math.round(clamp(options.maxHapticBurstMs ?? MAX_HAPTIC_BURST_MS, 16, MAX_HAPTIC_BURST_MS));
  const masterGain = clamp(options.masterGain ?? 1.0, 0.1, 2.0);
  const wavBitDepth: 16 | 24 = options.wavComparisonBitDepth ?? 16;

  const sortedInputs = [...episodeCues].sort((a, b) =>
    a.startTimeMs !== b.startTimeMs ? a.startTimeMs - b.startTimeMs : a.cueId.localeCompare(b.cueId),
  );

  const prepared: { readonly compiled: CompiledEpisodeSfxCue; readonly pcm: Float32Array }[] = [];
  let maxEndMs = 0;

  for (let i = 0; i < sortedInputs.length; i += 1) {
    const input = sortedInputs[i];
    if (input === undefined) continue;
    const startTimeMs = Math.max(0, Math.round(Number.isFinite(input.startTimeMs) ? input.startTimeMs : 0));
    const durationMs = Math.round(clamp(input.durationMs, 80, 6000));
    const intensity = clamp(input.intensity, 0.05, 1.5);
    const pan = computeConstantPowerStereoPan(input.panelXNorm);
    const synth = synthesizeKoreanSfxFoleyPcm({
      sfxTextKo: input.sfxTextKo,
      archetype: input.archetypeOverride,
      sampleRateHz,
      durationMs,
      intensity,
      baseFreqHz: input.baseFreqHzOverride,
      seed: input.seedOverride ?? `${episodeId}:${input.cueId}:${input.panelId}:${input.sfxTextKo}`,
    });

    const endTimeMs = startTimeMs + synth.durationMs;
    if (endTimeMs > maxEndMs) maxEndMs = endTimeMs;
    const intensityTierKo = resolveIntensityTierKo(Math.min(1, intensity));
    const categoryKo = getArchetypeCaptionCategoryKo(synth.archetype);
    const accessibleCaptionKo = `[${categoryKo} · ${intensityTierKo}]`;
    const trimmedSfx = input.sfxTextKo.trim();
    const spatialAccessibleCaptionKo =
      trimmedSfx.length > 0
        ? `[${categoryKo} · ${intensityTierKo} · ${pan.stereoZoneKo}] ${trimmedSfx}`
        : `[${categoryKo} · ${intensityTierKo} · ${pan.stereoZoneKo}]`;

    const haptic = buildCueHapticsAndShake(
      input.cueId,
      input.panelId,
      synth.archetype,
      startTimeMs,
      Math.min(1, intensity),
      synth.descriptors.transientTimesMs,
      maxHapticBurstLimitMs,
      hapticAndShakeSuppressed,
    );

    prepared.push({
      pcm: synth.pcm,
      compiled: {
        cueId: input.cueId,
        panelId: input.panelId,
        sfxTextKo: input.sfxTextKo,
        archetype: synth.archetype,
        startTimeMs,
        durationMs: synth.durationMs,
        endTimeMs,
        intensity,
        intensityTierKo,
        seedNumber: synth.seedNumber,
        pan,
        monoDescriptors: synth.descriptors,
        accessibleCaptionKo,
        spatialAccessibleCaptionKo,
        hapticPatternMs: haptic.hapticPatternMs,
        visualShakePx: haptic.visualShakePx,
        hapticPulseEvents: haptic.hapticPulseEvents,
      },
    });
  }

  const totalDurationMs = maxEndMs > 0 ? maxEndMs + tailPaddingMs : Math.max(250, tailPaddingMs);
  const totalSamples = Math.max(64, Math.round((totalDurationMs / 1000) * sampleRateHz));
  const leftAccum = new Float64Array(totalSamples);
  const rightAccum = new Float64Array(totalSamples);

  for (let c = 0; c < prepared.length; c += 1) {
    const entry = prepared[c];
    if (entry === undefined) continue;
    const startSample = Math.round((entry.compiled.startTimeMs / 1000) * sampleRateHz);
    const { leftGain, rightGain } = entry.compiled.pan;
    for (let k = 0; k < entry.pcm.length; k += 1) {
      const dst = startSample + k;
      if (dst >= totalSamples) break;
      const sample = (entry.pcm[k] ?? 0) * masterGain;
      leftAccum[dst] = (leftAccum[dst] ?? 0) + sample * leftGain;
      rightAccum[dst] = (rightAccum[dst] ?? 0) + sample * rightGain;
    }
  }

  const { leftChannel, rightChannel, limiterActiveSampleCount } = applyStereoLinkedTruePeakLimiter(
    leftAccum,
    rightAccum,
    sampleRateHz,
  );

  let maxAbsLeft = 0;
  let maxAbsRight = 0;
  let sumSqLeft = 0;
  let sumSqRight = 0;
  let clippedSampleCount = 0;
  let nonFiniteSampleCount = 0;

  for (let i = 0; i < totalSamples; i += 1) {
    const l = leftChannel[i] ?? 0;
    const r = rightChannel[i] ?? 0;
    if (!Number.isFinite(l)) nonFiniteSampleCount += 1;
    else {
      const aL = Math.abs(l);
      if (aL > maxAbsLeft) maxAbsLeft = aL;
      sumSqLeft += l * l;
      if (aL > 0.8913) clippedSampleCount += 1;
    }
    if (!Number.isFinite(r)) nonFiniteSampleCount += 1;
    else {
      const aR = Math.abs(r);
      if (aR > maxAbsRight) maxAbsRight = aR;
      sumSqRight += r * r;
      if (aR > 0.8913) clippedSampleCount += 1;
    }
  }

  const maxAbsMaster = Math.max(maxAbsLeft, maxAbsRight);
  const masterPeakDbfs = linearToDbfs(maxAbsMaster);
  const leftRmsLinear = Math.sqrt(sumSqLeft / totalSamples);
  const rightRmsLinear = Math.sqrt(sumSqRight / totalSamples);

  const compiledCues = prepared.map((item) => item.compiled);
  const captionEvents: SilentReaderCaptionEvent[] = [];
  const hapticEvents: HapticPulseEvent[] = [];
  let captionedCueCount = 0;
  let maxObservedHapticBurstMs = 0;
  let maxObservedVisualShakePx = 0;

  for (let i = 0; i < compiledCues.length; i += 1) {
    const cue = compiledCues[i];
    if (cue === undefined) continue;
    if (cue.accessibleCaptionKo.trim().length > 0) captionedCueCount += 1;
    if (cue.visualShakePx > maxObservedVisualShakePx) maxObservedVisualShakePx = cue.visualShakePx;
    for (let h = 0; h < cue.hapticPatternMs.length; h += 2) {
      const pulse = cue.hapticPatternMs[h] ?? 0;
      if (pulse > maxObservedHapticBurstMs) maxObservedHapticBurstMs = pulse;
    }
    for (let e = 0; e < cue.hapticPulseEvents.length; e += 1) {
      const ev = cue.hapticPulseEvents[e];
      if (ev !== undefined) hapticEvents.push(ev);
    }
    captionEvents.push({
      cueId: cue.cueId,
      panelId: cue.panelId,
      startTimeMs: cue.startTimeMs,
      endTimeMs: cue.endTimeMs,
      sfxTextKo: cue.sfxTextKo,
      accessibleCaptionKo: cue.accessibleCaptionKo,
      spatialAccessibleCaptionKo: cue.spatialAccessibleCaptionKo,
      stereoZone: cue.pan.stereoZone,
      hapticPatternMs: cue.hapticPatternMs,
      visualShakePx: cue.visualShakePx,
    });
  }
  hapticEvents.sort((a, b) => a.startTimeMs - b.startTimeMs);

  const totalCueCount = compiledCues.length;
  const proceduralSeedPayloadJson = JSON.stringify({
    v: 1,
    ep: episodeId,
    sr: sampleRateHz,
    c: compiledCues.map((c) => [c.cueId, c.archetype, c.startTimeMs, c.durationMs, roundTo(c.pan.panelXNorm, 3), roundTo(c.intensity, 3), c.seedNumber]),
  });
  const proceduralSeedPayloadBytes = computeUtf8ByteLength(proceduralSeedPayloadJson);
  const equivalentWavBytes = 44 + totalSamples * 2 * (wavBitDepth / 8);
  const savedBytes = Math.max(0, equivalentWavBytes - proceduralSeedPayloadBytes);

  return {
    episodeId,
    sampleRateHz,
    totalDurationMs,
    leftChannel,
    rightChannel,
    compiledCues,
    masterMetrics: {
      sampleCount: totalSamples,
      sampleRateHz,
      totalDurationMs,
      maxAbsLeft,
      maxAbsRight,
      maxAbsMaster,
      peakDbfsLeft: linearToDbfs(maxAbsLeft),
      peakDbfsRight: linearToDbfs(maxAbsRight),
      masterPeakDbfs,
      leftRmsLinear,
      rightRmsLinear,
      leftRmsDbfs: linearToDbfs(leftRmsLinear),
      rightRmsDbfs: linearToDbfs(rightRmsLinear),
      clippedSampleCount,
      nonFiniteSampleCount,
      peakCeilingDbfs: PEAK_SAFETY_CEILING_DBFS,
      withinBroadcastCeiling:
        masterPeakDbfs <= PEAK_SAFETY_CEILING_DBFS + 1e-4 && clippedSampleCount === 0 && nonFiniteSampleCount === 0,
      maxSimultaneousCues: computeMaxSimultaneousCues(compiledCues),
      limiterActiveSampleCount,
    },
    accessibilityBridge: {
      prefersReducedMotion,
      hapticsEnabled,
      hapticAndShakeSuppressed,
      maxHapticBurstLimitMs,
      maxObservedHapticBurstMs,
      maxObservedVisualShakePx,
      captionedCueCount,
      totalCueCount,
      captionCoverageRatio: totalCueCount === 0 ? 1 : captionedCueCount / totalCueCount,
      allCuesCaptioned: captionedCueCount === totalCueCount,
      reducedMotionCompliant: hapticAndShakeSuppressed
        ? maxObservedHapticBurstMs === 0 && maxObservedVisualShakePx === 0 && hapticEvents.length === 0
        : maxObservedHapticBurstMs <= maxHapticBurstLimitMs,
      captionEvents,
      hapticEvents,
    },
    byteBudget: {
      proceduralSeedPayloadJson,
      proceduralSeedPayloadBytes,
      equivalentWavBytes,
      savedBytes,
      byteSavingsPercent: equivalentWavBytes > 0 ? roundTo((savedBytes / equivalentWavBytes) * 100, 3) : 0,
      compressionRatio: proceduralSeedPayloadBytes > 0 ? roundTo(equivalentWavBytes / proceduralSeedPayloadBytes, 2) : 0,
      wavBitDepth,
      zeroAudioAssetDownloadRequired: true,
    },
  };
}
