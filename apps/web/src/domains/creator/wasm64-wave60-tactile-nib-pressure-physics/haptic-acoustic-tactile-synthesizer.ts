/**
 * Wave 60: 촉각 진동(Web Haptics)·프로시저럴 사각사각 필기음 공명 합성기 및 개인 손힘 S-커브 캘리브레이터.
 *
 * - `synthesizeTactileStrokeFeedback`: 펜촉 마찰 소비 전력(`frictionPowerMw`), 스틱-슬립 진동,
 *   종이 섬유 충돌 주파수(`dominantFiberImpactHz`), 건필 튐 비율을 실시간 Web Haptics 진동 펄스 패턴과
 *   프로시저럴 필기음(Bandpass Micro-Friction Noise + Nib Resonance + Paper Grain Transient) 파라미터로 변환한다.
 * - `calibratePersonalPressureCurve`: 작가의 실제 손힘 표본으로부터 개인 맞춤형 S-커브 필압 매핑 프로파일과
 *   O(1) 룩업 테이블(`lut`)을 생성하며, 비정상·역전 표본에서도 전역 단조 증가성(`f(x1) <= f(x2)`)을 보장한다.
 */

import { getNibMechanicalSpec, type NibPresetId } from "./nib-wear-and-split-physics";
import { getPaperSubstrateSpec, type PaperMicroContactResult } from "./paper-fiber-friction-capillary-kernel";

export const MAX_TACTILE_AUDIO_GAIN_LINEAR = 0.36 as const;
export const MIN_HAPTIC_CARRIER_HZ = 38 as const;
export const MAX_HAPTIC_CARRIER_HZ = 255 as const;
export const MIN_FRICTION_BANDPASS_HZ = 420 as const;
export const MAX_FRICTION_BANDPASS_HZ = 6_400 as const;
export const DEFAULT_PRESSURE_LUT_SIZE = 65 as const;

export type TactileTextureEnvelope =
  | "silent"
  | "silky-glide"
  | "fine-scratch"
  | "fibrous-tooth"
  | "heavy-grit";

export type HandStrengthClass = "feather-touch" | "balanced" | "heavy-handed";

export interface TactileStrokeSynthesisInput {
  readonly nibId: NibPresetId;
  readonly contact: PaperMicroContactResult;
  readonly pressure: number;
  readonly scratchSnagFactor?: number;
  readonly tineSplitMm?: number;
  readonly normalizedCanvasX?: number;
  readonly hapticsEnabled?: boolean;
  readonly audioEnabled?: boolean;
  readonly hapticsGainScale?: number;
  readonly audioGainScale?: number;
  readonly prefersReducedMotion?: boolean;
}

export interface HapticPulsePattern {
  readonly enabled: boolean;
  readonly amplitude: number;
  readonly carrierFrequencyHz: number;
  readonly dutyCycle: number;
  readonly pulseIntervalMs: number;
  readonly webVibratePatternMs: readonly number[];
  readonly transientImpulseStrength: number;
  readonly textureEnvelope: TactileTextureEnvelope;
}

export interface AcousticStrokeFeedbackParams {
  readonly muted: boolean;
  readonly bandpassCenterHz: number;
  readonly bandpassQ: number;
  readonly frictionNoiseGain: number;
  readonly nibResonanceHz: number;
  readonly nibResonanceGain: number;
  readonly nibResonanceQ: number;
  readonly grainTransientRateHz: number;
  readonly grainTransientGain: number;
  readonly grainTransientDecayMs: number;
  readonly stereoPan: number;
  readonly smoothingTimeConstantSec: number;
  readonly spectralCentroidHz: number;
}

export interface TactileStrokeFeedbackResult {
  readonly haptics: HapticPulsePattern;
  readonly acoustic: AcousticStrokeFeedbackParams;
  readonly normalizedFrictionEnergy: number;
}

export interface PressureCalibrationSample {
  readonly rawPressure: number;
  readonly intendedIntensity: number;
  readonly strokeKind?: "feather" | "normal" | "bold" | "accent";
}

export interface PersonalPressureCalibrationInput {
  readonly profileId?: string;
  readonly samples: readonly PressureCalibrationSample[];
  readonly deadzoneMin?: number;
  readonly sCurveContrast?: number;
  readonly lutSize?: number;
}

export interface PersonalPressureCalibrationProfile {
  readonly profileId: string;
  readonly handStrengthClass: HandStrengthClass;
  readonly inputMinThreshold: number;
  readonly inputMaxCeiling: number;
  readonly gammaExponent: number;
  readonly sCurveContrast: number;
  readonly lut: readonly number[];
  readonly isMonotonic: boolean;
  readonly residualRmsError: number;
  readonly evaluate: (rawPressure: number) => number;
}

interface NibAcousticProfile {
  readonly brightnessOffsetHz: number;
  readonly baseQ: number;
  readonly resonanceHz: number;
  readonly resonanceQ: number;
  readonly resonanceMix: number;
  readonly hapticSharpness: number;
}

const NIB_ACOUSTIC_PROFILES: Readonly<Record<NibPresetId, NibAcousticProfile>> = {
  "g-pen": {
    brightnessOffsetHz: 780,
    baseQ: 3.4,
    resonanceHz: 4_350,
    resonanceQ: 6.2,
    resonanceMix: 0.56,
    hapticSharpness: 0.88,
  },
  "maru-pen": {
    brightnessOffsetHz: 1_050,
    baseQ: 4.1,
    resonanceHz: 5_400,
    resonanceQ: 7.4,
    resonanceMix: 0.62,
    hapticSharpness: 0.94,
  },
  "pencil-2b": {
    brightnessOffsetHz: 120,
    baseQ: 1.75,
    resonanceHz: 1_950,
    resonanceQ: 2.6,
    resonanceMix: 0.34,
    hapticSharpness: 0.62,
  },
  "pencil-hb": {
    brightnessOffsetHz: 420,
    baseQ: 2.4,
    resonanceHz: 2_850,
    resonanceQ: 3.8,
    resonanceMix: 0.44,
    hapticSharpness: 0.76,
  },
  "brush-pen": {
    brightnessOffsetHz: -160,
    baseQ: 1.35,
    resonanceHz: 1_450,
    resonanceQ: 1.9,
    resonanceMix: 0.22,
    hapticSharpness: 0.36,
  },
  marker: {
    brightnessOffsetHz: -240,
    baseQ: 1.15,
    resonanceHz: 1_280,
    resonanceQ: 1.6,
    resonanceMix: 0.18,
    hapticSharpness: 0.28,
  },
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

/** 엄밀히 단조 증가하는 S-커브 (`S(0)=0`, `S(0.5)=0.5`, `S(1)=1`, 전 구간 `S'(u) > 0`). */
function monotonicSCurve(u: number, contrast: number): number {
  const x = clamp(u, 0, 1);
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const k = 1 + clamp(contrast, 0, 1) * 1.65;
  const xPow = Math.pow(x, k);
  const invPow = Math.pow(1 - x, k);
  return 0.12 * x + 0.88 * (xPow / (xPow + invPow));
}

function evaluateCurveParams(
  rawPressure: number,
  inputMinThreshold: number,
  inputMaxCeiling: number,
  gammaExponent: number,
  sCurveContrast: number,
): number {
  const p = clamp(rawPressure, 0, 1);
  if (p <= inputMinThreshold) return 0;
  if (p >= inputMaxCeiling) return 1;
  const normalized = clamp((p - inputMinThreshold) / Math.max(inputMaxCeiling - inputMinThreshold, 0.05), 0, 1);
  return clamp(monotonicSCurve(Math.pow(normalized, gammaExponent), sCurveContrast), 0, 1);
}

/** 직렬화된 개인 필압 프로파일 파라미터로 원시 필압을 즉시 변환한다. */
export function evaluateCalibratedPressure(
  profile: Pick<
    PersonalPressureCalibrationProfile,
    "inputMinThreshold" | "inputMaxCeiling" | "gammaExponent" | "sCurveContrast"
  >,
  rawPressure: number,
): number {
  return normalizeZero(
    evaluateCurveParams(
      rawPressure,
      profile.inputMinThreshold,
      profile.inputMaxCeiling,
      profile.gammaExponent,
      profile.sCurveContrast,
    ),
  );
}

/** 펜촉 마찰 에너지·종이 섬유 요철 주파수를 실시간 Web Haptics 펄스 및 사각사각 필기음으로 합성한다. */
export function synthesizeTactileStrokeFeedback(
  input: TactileStrokeSynthesisInput,
): TactileStrokeFeedbackResult {
  const nibSpec = getNibMechanicalSpec(input.nibId);
  const nibAcoustic = NIB_ACOUSTIC_PROFILES[input.nibId];
  const paperSpec = getPaperSubstrateSpec(input.contact.paperId);

  const pressure = clamp(input.pressure, 0, 1);
  const scratchSnagFactor = clamp(input.scratchSnagFactor ?? 0, 0, 1);
  const tineSplitMm = Math.max(0, Number.isFinite(input.tineSplitMm) ? input.tineSplitMm ?? 0 : 0);
  const stereoPan = clamp(input.normalizedCanvasX ?? 0, -1, 1);
  const hapticsEnabled = (input.hapticsEnabled ?? true) && !(input.prefersReducedMotion ?? false);
  const audioEnabled = input.audioEnabled ?? true;
  const hapticsGainScale = clamp(input.hapticsGainScale ?? 1, 0, 1.5);
  const audioGainScale = clamp(input.audioGainScale ?? 1, 0, 1.5);

  const speed = Math.max(0, input.contact.speedMmPerSec);
  const frictionPowerMw = Math.max(0, input.contact.frictionPowerMw);
  const isSilentStroke = pressure <= 0 || input.contact.frictionRegime === "hover-no-contact" || speed < 0.2;

  const normalizedFrictionEnergy = isSilentStroke
    ? 0
    : clamp(Math.log1p(frictionPowerMw / 18) / Math.log1p(55), 0, 1);
  const speedRatio = clamp(Math.log1p(speed / 28) / Math.log1p(22), 0, 1);
  const reliefRoughness = clamp(paperSpec.reliefAmplitudeUm / 80, 0.08, 1);

  // 1. Web Haptics 진동 펄스 합성
  let haptics: HapticPulsePattern;
  if (!hapticsEnabled || isSilentStroke || hapticsGainScale <= 0) {
    haptics = {
      enabled: false,
      amplitude: 0,
      carrierFrequencyHz: 0,
      dutyCycle: 0,
      pulseIntervalMs: 0,
      webVibratePatternMs: [],
      transientImpulseStrength: 0,
      textureEnvelope: "silent",
    };
  } else {
    const fiberDrive = clamp(Math.log1p(input.contact.dominantFiberImpactHz / 35) / Math.log1p(45), 0, 1);
    const carrierFrequencyHz = clamp(
      MIN_HAPTIC_CARRIER_HZ +
        (MAX_HAPTIC_CARRIER_HZ - MIN_HAPTIC_CARRIER_HZ) *
          (0.62 * speedRatio + 0.28 * fiberDrive + 0.1 * nibAcoustic.hapticSharpness),
      MIN_HAPTIC_CARRIER_HZ,
      MAX_HAPTIC_CARRIER_HZ,
    );
    const amplitude = clamp(
      (0.16 + 0.52 * normalizedFrictionEnergy + 0.2 * input.contact.stickSlipIntensity + 0.16 * scratchSnagFactor) *
        (0.55 + 0.45 * reliefRoughness) *
        hapticsGainScale,
      0.04,
      1,
    );
    const dutyCycle = clamp(
      0.74 - input.contact.toothSkipRatio * 0.38 - input.contact.stickSlipIntensity * 0.14 + pressure * 0.12,
      0.12,
      0.85,
    );
    const pulseIntervalMs = clamp(1_000 / carrierFrequencyHz, 4, 30);
    const transientImpulseStrength = clamp(
      input.contact.stickSlipIntensity * 0.55 +
        scratchSnagFactor * 0.45 +
        input.contact.toothSkipRatio * reliefRoughness * 0.35,
      0,
      1,
    );

    const onMs = Math.max(2, Math.round(pulseIntervalMs * dutyCycle * (0.6 + 0.4 * amplitude)));
    const offMs = Math.max(2, Math.round(pulseIntervalMs * (1 - dutyCycle) * 1.4));
    const webVibratePatternMs: readonly number[] = [
      onMs,
      offMs,
      onMs,
      offMs,
      Math.max(2, Math.round(onMs * (0.85 + 0.3 * transientImpulseStrength))),
    ];

    const textureEnvelope: TactileTextureEnvelope =
      reliefRoughness >= 0.72 && input.contact.toothSkipRatio >= 0.28
        ? "heavy-grit"
        : nibSpec.hasSplitTines && scratchSnagFactor >= 0.22
          ? "fine-scratch"
          : reliefRoughness >= 0.38
            ? "fibrous-tooth"
            : "silky-glide";

    haptics = {
      enabled: true,
      amplitude: normalizeZero(amplitude),
      carrierFrequencyHz: normalizeZero(carrierFrequencyHz),
      dutyCycle: normalizeZero(dutyCycle),
      pulseIntervalMs: normalizeZero(pulseIntervalMs),
      webVibratePatternMs,
      transientImpulseStrength: normalizeZero(transientImpulseStrength),
      textureEnvelope,
    };
  }

  // 2. 프로시저럴 사각사각 필기음 합성 (Bandpass Friction Noise + Nib Resonance + Grain Transient)
  let acoustic: AcousticStrokeFeedbackParams;
  if (!audioEnabled || isSilentStroke || audioGainScale <= 0) {
    acoustic = {
      muted: true,
      bandpassCenterHz: MIN_FRICTION_BANDPASS_HZ,
      bandpassQ: nibAcoustic.baseQ,
      frictionNoiseGain: 0,
      nibResonanceHz: nibAcoustic.resonanceHz,
      nibResonanceGain: 0,
      nibResonanceQ: nibAcoustic.resonanceQ,
      grainTransientRateHz: 0,
      grainTransientGain: 0,
      grainTransientDecayMs: 3,
      stereoPan: normalizeZero(stereoPan),
      smoothingTimeConstantSec: 0,
      spectralCentroidHz: 0,
    };
  } else {
    const spatialBrightnessHz = clamp(paperSpec.dominantSpatialFreqPerMm * 145, 180, 950);
    const speedShiftHz = speedRatio * 3_150 + Math.min(input.contact.dominantFiberImpactHz * 0.45, 950);
    const bandpassCenterHz = clamp(
      MIN_FRICTION_BANDPASS_HZ +
        spatialBrightnessHz +
        nibAcoustic.brightnessOffsetHz +
        speedShiftHz -
        pressure * 220,
      MIN_FRICTION_BANDPASS_HZ,
      MAX_FRICTION_BANDPASS_HZ,
    );
    const bandpassQ = clamp(nibAcoustic.baseQ * (1.15 - 0.52 * reliefRoughness), 0.7, 6.5);
    const frictionNoiseGain = clamp(
      MAX_TACTILE_AUDIO_GAIN_LINEAR *
        (0.18 + 0.62 * normalizedFrictionEnergy + 0.2 * speedRatio) *
        (0.7 + 0.3 * reliefRoughness) *
        audioGainScale,
      0,
      MAX_TACTILE_AUDIO_GAIN_LINEAR,
    );
    const nibResonanceHz = clamp(
      nibAcoustic.resonanceHz * (1 - Math.min(tineSplitMm, 1.4) * 0.11) + speedRatio * 480,
      900,
      7_800,
    );
    const nibResonanceGain = clamp(
      frictionNoiseGain *
        nibAcoustic.resonanceMix *
        (0.5 + 0.5 * scratchSnagFactor + 0.25 * input.contact.stickSlipIntensity),
      0,
      0.22,
    );
    const grainTransientRateHz = clamp(
      input.contact.dominantFiberImpactHz * (0.85 + 0.35 * reliefRoughness),
      1,
      2_400,
    );
    const grainTransientGain = clamp(
      0.24 *
        (0.25 * reliefRoughness + 0.45 * input.contact.stickSlipIntensity + 0.3 * input.contact.toothSkipRatio) *
        (0.35 + 0.65 * normalizedFrictionEnergy) *
        audioGainScale,
      0,
      0.24,
    );
    const grainTransientDecayMs = clamp(
      1.1 + reliefRoughness * 4.2 + (1 - nibAcoustic.hapticSharpness) * 1.8,
      0.8,
      8.0,
    );

    const transientEffectiveHz = clamp(bandpassCenterHz * 1.28 + grainTransientRateHz * 0.35, 600, 7_600);
    const totalGain = frictionNoiseGain + nibResonanceGain + grainTransientGain;
    const spectralCentroidHz =
      totalGain > 1e-6
        ? (bandpassCenterHz * frictionNoiseGain +
            nibResonanceHz * nibResonanceGain +
            transientEffectiveHz * grainTransientGain) /
          totalGain
        : bandpassCenterHz;

    acoustic = {
      muted: false,
      bandpassCenterHz: normalizeZero(bandpassCenterHz),
      bandpassQ: normalizeZero(bandpassQ),
      frictionNoiseGain: normalizeZero(frictionNoiseGain),
      nibResonanceHz: normalizeZero(nibResonanceHz),
      nibResonanceGain: normalizeZero(nibResonanceGain),
      nibResonanceQ: nibAcoustic.resonanceQ,
      grainTransientRateHz: normalizeZero(grainTransientRateHz),
      grainTransientGain: normalizeZero(grainTransientGain),
      grainTransientDecayMs: normalizeZero(grainTransientDecayMs),
      stereoPan: normalizeZero(stereoPan),
      smoothingTimeConstantSec: 0.012,
      spectralCentroidHz: normalizeZero(spectralCentroidHz),
    };
  }

  return { haptics, acoustic, normalizedFrictionEnergy: normalizeZero(normalizedFrictionEnergy) };
}

/**
 * 작가의 실제 손힘 표본으로부터 개인 맞춤형 S-커브 필압 프로파일을 생성한다.
 * 표본에 노이즈나 순서 역전이 있어도 전역 단조 증가성(`f(x1) <= f(x2)`)을 항상 보장한다.
 */
export function calibratePersonalPressureCurve(
  input: PersonalPressureCalibrationInput,
): PersonalPressureCalibrationProfile {
  const profileId = input.profileId?.trim() || "personal-pressure-curve";
  const deadzoneMin = clamp(input.deadzoneMin ?? 0.02, 0, 0.15);
  const sCurveContrast = clamp(input.sCurveContrast ?? 0.38, 0, 1);
  const lutSize = Math.round(clamp(input.lutSize ?? DEFAULT_PRESSURE_LUT_SIZE, 17, 257));

  const cleaned = input.samples
    .filter((s) => Number.isFinite(s.rawPressure) && Number.isFinite(s.intendedIntensity))
    .map((s) => ({ raw: clamp(s.rawPressure, 0, 1), target: clamp(s.intendedIntensity, 0, 1) }));

  let inputMinThreshold = deadzoneMin;
  let inputMaxCeiling = 0.96;
  let gammaExponent = 1.0;

  if (cleaned.length > 0) {
    const lightSamples = cleaned.filter((s) => s.target <= 0.25);
    const heavySamples = cleaned.filter((s) => s.target >= 0.78);
    const midSamples = cleaned.filter((s) => s.target > 0.2 && s.target < 0.85);

    if (lightSamples.length > 0) {
      const avgRaw = lightSamples.reduce((acc, s) => acc + s.raw, 0) / lightSamples.length;
      const avgTarget = lightSamples.reduce((acc, s) => acc + s.target, 0) / lightSamples.length;
      inputMinThreshold = clamp(avgRaw - avgTarget * 0.22, deadzoneMin * 0.5, 0.22);
    }

    if (heavySamples.length > 0) {
      const avgRaw = heavySamples.reduce((acc, s) => acc + s.raw, 0) / heavySamples.length;
      const avgTarget = heavySamples.reduce((acc, s) => acc + s.target, 0) / heavySamples.length;
      inputMaxCeiling = clamp(avgRaw / Math.max(avgTarget, 0.75), 0.52, 1.0);
    } else {
      const maxRaw = Math.max(...cleaned.map((s) => s.raw));
      if (maxRaw > inputMinThreshold + 0.25) inputMaxCeiling = clamp(maxRaw * 1.05, 0.58, 1.0);
    }

    if (inputMaxCeiling - inputMinThreshold < 0.28) {
      inputMaxCeiling = clamp(inputMinThreshold + 0.35, 0.5, 1.0);
      inputMinThreshold = clamp(inputMaxCeiling - 0.35, 0, 0.22);
    }

    const fitTargets = midSamples.length > 0 ? midSamples : cleaned;
    let bestGamma = 1.0;
    let bestError = Number.POSITIVE_INFINITY;
    for (let step = 0; step <= 86; step += 1) {
      const candidate = 0.45 + step * 0.025;
      let sumSq = 0;
      for (const sample of fitTargets) {
        const diff =
          evaluateCurveParams(sample.raw, inputMinThreshold, inputMaxCeiling, candidate, sCurveContrast) -
          sample.target;
        sumSq += diff * diff;
      }
      if (sumSq < bestError) {
        bestError = sumSq;
        bestGamma = candidate;
      }
    }
    gammaExponent = clamp(bestGamma, 0.45, 2.6);
  }

  const lut: number[] = [];
  for (let idx = 0; idx < lutSize; idx += 1) {
    const raw = idx / (lutSize - 1);
    const mapped =
      idx === 0
        ? 0
        : idx === lutSize - 1
          ? 1
          : evaluateCurveParams(raw, inputMinThreshold, inputMaxCeiling, gammaExponent, sCurveContrast);
    lut.push(normalizeZero(Math.max(idx > 0 ? lut[idx - 1] : 0, mapped)));
  }

  let isMonotonic = true;
  for (let idx = 1; idx < lut.length; idx += 1) {
    if (lut[idx] < lut[idx - 1]) {
      isMonotonic = false;
      break;
    }
  }

  const residualRmsError =
    cleaned.length > 0
      ? Math.sqrt(
          cleaned.reduce((acc, s) => {
            const diff =
              evaluateCurveParams(s.raw, inputMinThreshold, inputMaxCeiling, gammaExponent, sCurveContrast) - s.target;
            return acc + diff * diff;
          }, 0) / cleaned.length,
        )
      : 0;

  const midOutput = evaluateCurveParams(0.5, inputMinThreshold, inputMaxCeiling, gammaExponent, sCurveContrast);
  const handStrengthClass: HandStrengthClass =
    midOutput >= 0.6 ? "feather-touch" : midOutput <= 0.4 ? "heavy-handed" : "balanced";

  const evaluate = (rawPressure: number): number =>
    normalizeZero(evaluateCurveParams(rawPressure, inputMinThreshold, inputMaxCeiling, gammaExponent, sCurveContrast));

  return {
    profileId,
    handStrengthClass,
    inputMinThreshold: normalizeZero(inputMinThreshold),
    inputMaxCeiling: normalizeZero(inputMaxCeiling),
    gammaExponent: normalizeZero(gammaExponent),
    sCurveContrast: normalizeZero(sCurveContrast),
    lut,
    isMonotonic,
    residualRmsError: normalizeZero(residualRmsError),
    evaluate,
  };
}
