/**
 * 무에셋 절차적 스타일러스 지면 마찰 음향(`48kHz` `Float32Array` PCM) 및 미세 햅틱 엔벨로프 합성기.
 *
 * - 원고 용지 4종(`kent-250g`, `cold-press-300g`, `dakjongi-hanji`, `cel-film`)과
 *   펜촉·브러시 4종(`g-pen-steel`, `maru-nib`, `pencil-4b`, `sumi-bristle`)의 마찰 물성을 조합한다.
 * - 결정론적 시드 `xorshift32` 의사난수 + 이중 쌍차(biquad) 대역통과 공진기 + 스틱-슬립(stick-slip)
 *   미세 충격파 생성기를 결합해 `speedPxPerSec`, `pressure(0..1)`, `tiltDeg(0..90)`에 반응하는 파형을 만든다.
 * - 정지 상태(`speedPxPerSec <= 0` 또는 `pressure <= 0`)에서는 완전 무음(`RMS === 0`)을 보장하고,
 *   활성 스트로크에서도 직류 편향 제거(`|mean| < 0.005`)와 소프트 클리핑 상한(`peak <= 0.707`, `-3 dBFS`)을 지킨다.
 * - 스틱-슬립 순간에 동기화된 미세 햅틱 펄스(`durationMs <= 12`)를 함께 산출하며,
 *   `prefersReducedMotion` 설정이 켜져 있으면 모든 햅틱 출력을 즉시 억제한다.
 */

export const STUDIO_PAPER_SUBSTRATES = Object.freeze([
  "kent-250g",
  "cold-press-300g",
  "dakjongi-hanji",
  "cel-film",
] as const);

export type StudioPaperSubstrate = (typeof STUDIO_PAPER_SUBSTRATES)[number];

export const STUDIO_STYLUS_NIBS = Object.freeze([
  "g-pen-steel",
  "maru-nib",
  "pencil-4b",
  "sumi-bristle",
] as const);

export type StudioStylusNib = (typeof STUDIO_STYLUS_NIBS)[number];

/** 스튜디오 마찰 음향 기본 샘플링 주파수(`48,000 Hz`). */
export const DEFAULT_SYNTH_SAMPLE_RATE_HZ = 48_000 as const;

/** 소프트 클리핑 선형 피크 상한(`-3 dBFS` ≈ `0.707`). */
export const MAX_PEAK_LINEAR_MINUS_3DBFS = 0.707 as const;

/** 허용 최대 직류(DC) 평균 편차 절댓값. */
export const MAX_ABS_DC_OFFSET = 0.005 as const;

/** 단일 미세 햅틱 펄스 최대 지속 시간(`ms`). */
export const MAX_HAPTIC_PULSE_DURATION_MS = 12 as const;

export interface PaperSubstrateAcousticProfile {
  readonly id: StudioPaperSubstrate;
  readonly labelKo: string;
  /** 표면 미세 요철의 평균 공간 파장(`px`). */
  readonly grainPitchPx: number;
  /** 표면 거칠기 계수(`0..1`). 높을수록 마찰 진폭과 섬유 충격 밀도가 커진다. */
  readonly microRoughness: number;
  /** 지면 고유 공진 중심 주파수(`Hz`). */
  readonly bodyFormantHz: number;
  /** 지면 공진기 대역 예리도(`Q`). */
  readonly bodyFormantQ: number;
  /** 펜촉이 섬유 요철에 걸렸다 풀리는 스틱-슬립 결합 강도(`0..1`). */
  readonly stickSlipCoupling: number;
}

export interface StylusNibAcousticProfile {
  readonly id: StudioStylusNib;
  readonly labelKo: string;
  /** 펜촉·심재 고유 공진 주파수(`Hz`). */
  readonly nibFormantHz: number;
  /** 펜촉 공진 예리도(`Q`). */
  readonly nibFormantQ: number;
  /** 촉 탄성 강성(`0..1`). 강철 펜촉은 높고 먹 붓모는 낮다. */
  readonly stiffness: number;
  /** 기본 음향 출력 배율(`0..1`). */
  readonly gainScale: number;
  /** 미세 햅틱 기본 예리도(`0..1`). */
  readonly hapticSharpnessBase: number;
}

export const PAPER_SUBSTRATE_PROFILES: Readonly<
  Record<StudioPaperSubstrate, PaperSubstrateAcousticProfile>
> = Object.freeze({
  "kent-250g": {
    id: "kent-250g",
    labelKo: "켄트지 250g",
    grainPitchPx: 5.6,
    microRoughness: 0.42,
    bodyFormantHz: 1_850,
    bodyFormantQ: 2.1,
    stickSlipCoupling: 0.44,
  },
  "cold-press-300g": {
    id: "cold-press-300g",
    labelKo: "황목 수채화지 300g",
    grainPitchPx: 13.5,
    microRoughness: 0.92,
    bodyFormantHz: 890,
    bodyFormantQ: 1.65,
    stickSlipCoupling: 0.88,
  },
  "dakjongi-hanji": {
    id: "dakjongi-hanji",
    labelKo: "전통 닥종이 한지",
    grainPitchPx: 7.4,
    microRoughness: 0.8,
    bodyFormantHz: 1_320,
    bodyFormantQ: 1.35,
    stickSlipCoupling: 0.84,
  },
  "cel-film": {
    id: "cel-film",
    labelKo: "애니메이션 셀 필름",
    grainPitchPx: 44.0,
    microRoughness: 0.08,
    bodyFormantHz: 3_400,
    bodyFormantQ: 3.6,
    stickSlipCoupling: 0.05,
  },
});

export const STYLUS_NIB_PROFILES: Readonly<
  Record<StudioStylusNib, StylusNibAcousticProfile>
> = Object.freeze({
  "g-pen-steel": {
    id: "g-pen-steel",
    labelKo: "G펜 강철 닙",
    nibFormantHz: 3_250,
    nibFormantQ: 3.3,
    stiffness: 0.86,
    gainScale: 0.92,
    hapticSharpnessBase: 0.84,
  },
  "maru-nib": {
    id: "maru-nib",
    labelKo: "환펜 세필 닙",
    nibFormantHz: 4_450,
    nibFormantQ: 4.1,
    stiffness: 0.95,
    gainScale: 0.85,
    hapticSharpnessBase: 0.93,
  },
  "pencil-4b": {
    id: "pencil-4b",
    labelKo: "4B 흑연 연필",
    nibFormantHz: 1_680,
    nibFormantQ: 1.55,
    stiffness: 0.56,
    gainScale: 0.88,
    hapticSharpnessBase: 0.48,
  },
  "sumi-bristle": {
    id: "sumi-bristle",
    labelKo: "먹 붓모",
    nibFormantHz: 920,
    nibFormantQ: 1.1,
    stiffness: 0.18,
    gainScale: 0.58,
    hapticSharpnessBase: 0.16,
  },
});

export interface StylusStrokeSynthInput {
  readonly substrate: StudioPaperSubstrate;
  readonly nib: StudioStylusNib;
  /** 캔버스 상의 펜 이동 속도(`px/s`). `0` 이하이면 완전 무음을 출력한다. */
  readonly speedPxPerSec: number;
  /** 필압(`0..1`). `0` 이하이면 지면 비접촉으로 간주해 완전 무음을 출력한다. */
  readonly pressure: number;
  /** 펜 기울기 각도(`0..90`도, `0`도는 수직 세움, `90`도는 눕혀 칠하기). */
  readonly tiltDeg: number;
  /** 합성 프레임 길이(`ms`, 기본 `50`, 범위 `5..500`). */
  readonly durationMs?: number;
  /** 오디오 샘플링 레이트(`Hz`, 기본 `48000`). */
  readonly sampleRateHz?: number;
  /** 재현 가능한 마찰 입자 시퀀스를 위한 32비트 정수 시드(기본 `0x51a7_2701`). */
  readonly seed?: number;
  /** 사용자 동작 줄이기 선호 여부. `true`이면 미세 햅틱 펄스를 생성하지 않는다. */
  readonly prefersReducedMotion?: boolean;
}

export interface MicroHapticPulseDescriptor {
  /** 버퍼 시작 시점 기준 펄스 발생 시각(`ms`). */
  readonly onsetMs: number;
  /** 펄스 지속 시간(`ms`, `1..12` 이하 엄수). */
  readonly durationMs: number;
  /** 진동 세기(`0..1`). */
  readonly intensity: number;
  /** 촉각 날카로움(`0..1`, 강철 펜촉일수록 높고 붓모일수록 낮음). */
  readonly sharpness: number;
  /** 상승 엔벨로프 구간(`ms`). */
  readonly attackMs: number;
  /** 감쇠 엔벨로프 구간(`ms`). */
  readonly releaseMs: number;
}

export interface StylusAcousticTelemetry {
  readonly sampleRateHz: number;
  readonly sampleCount: number;
  readonly durationMs: number;
  readonly rmsLinear: number;
  readonly peakLinear: number;
  readonly peakDbfs: number;
  readonly meanDcOffset: number;
  readonly zeroCrossingRate: number;
  readonly spectralCentroidHz: number;
  readonly stickSlipImpulseCount: number;
  readonly hapticSuppressedByReducedMotion: boolean;
}

export interface StylusAcousticHapticFrame {
  readonly substrate: StudioPaperSubstrate;
  readonly nib: StudioStylusNib;
  readonly substrateLabelKo: string;
  readonly nibLabelKo: string;
  readonly pcm48k: Float32Array;
  readonly hapticPulses: readonly MicroHapticPulseDescriptor[];
  readonly telemetry: StylusAcousticTelemetry;
}

interface BiquadBandpassCoeffs {
  readonly b0: number;
  readonly b1: number;
  readonly b2: number;
  readonly a1: number;
  readonly a2: number;
}

interface BiquadState {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * 32비트 부호 없는 정수 시드로 동작하는 결정론적 `xorshift32` 의사난수 생성기.
 * 호출마다 `[-1, 1]` 구간의 균일 분포 부동소수점 샘플을 반환한다.
 */
export function createDeterministicXorshift32(seed: number): () => number {
  let state = seed | 0;
  if (state === 0) {
    state = 0x6d2b79f5;
  }
  return (): number => {
    let x = state | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    state = x;
    return (x >>> 0) / 2_147_483_648 - 1;
  };
}

/**
 * 상수 0dB 피크 이득 쌍차(biquad) 대역통과 공진기 계수를 계산한다.
 */
function computeBandpassBiquadCoeffs(
  sampleRateHz: number,
  centerFreqHz: number,
  qualityQ: number,
): BiquadBandpassCoeffs {
  const nyquistSafeMax = sampleRateHz * 0.45;
  const freq = clamp(centerFreqHz, 80, nyquistSafeMax);
  const q = clamp(qualityQ, 0.4, 12);
  const omega = (2 * Math.PI * freq) / sampleRateHz;
  const sinW = Math.sin(omega);
  const cosW = Math.cos(omega);
  const alpha = sinW / (2 * q);
  const a0 = 1 + alpha;

  return {
    b0: alpha / a0,
    b1: 0,
    b2: -alpha / a0,
    a1: (-2 * cosW) / a0,
    a2: (1 - alpha) / a0,
  };
}

function stepBiquad(
  sample: number,
  coeffs: BiquadBandpassCoeffs,
  state: BiquadState,
): number {
  const y =
    coeffs.b0 * sample +
    coeffs.b1 * state.x1 +
    coeffs.b2 * state.x2 -
    coeffs.a1 * state.y1 -
    coeffs.a2 * state.y2;
  state.x2 = state.x1;
  state.x1 = sample;
  state.y2 = state.y1;
  state.y1 = y;
  return y;
}

/**
 * 1차 차분 Parseval 등가 추정기로 연속 마찰 신호의 실효 스펙트럼 중심 주파수(`Hz`)를 계산한다.
 */
function estimateSpectralCentroidHz(
  pcm: Float32Array,
  sampleRateHz: number,
): number {
  if (pcm.length < 2) {
    return 0;
  }
  let powerSum = 0;
  let diffPowerSum = 0;
  let prev = pcm[0] ?? 0;
  powerSum += prev * prev;

  for (let i = 1; i < pcm.length; i += 1) {
    const cur = pcm[i] ?? 0;
    const diff = cur - prev;
    powerSum += cur * cur;
    diffPowerSum += diff * diff;
    prev = cur;
  }

  if (powerSum <= 1e-15) {
    return 0;
  }
  const normalizedOmega = Math.sqrt(diffPowerSum / powerSum);
  const estimatedHz = (sampleRateHz / (2 * Math.PI)) * normalizedOmega;
  return roundTo(clamp(estimatedHz, 0, sampleRateHz * 0.5), 2);
}

/**
 * 용지·펜촉 물성과 실시간 스트로크 입력(`speedPxPerSec`, `pressure`, `tiltDeg`)으로
 * 무에셋 `48kHz` 마찰음 PCM 버퍼와 동기화된 미세 햅틱 펄스 시퀀스를 합성한다.
 */
export function synthesizeStylusPaperFrame(
  input: StylusStrokeSynthInput,
): StylusAcousticHapticFrame {
  const substrateProfile = PAPER_SUBSTRATE_PROFILES[input.substrate];
  const nibProfile = STYLUS_NIB_PROFILES[input.nib];
  const sampleRateHz = Math.round(
    clamp(input.sampleRateHz ?? DEFAULT_SYNTH_SAMPLE_RATE_HZ, 8_000, 96_000),
  );
  const durationMs = clamp(input.durationMs ?? 50, 5, 500);
  const sampleCount = Math.max(16, Math.round((sampleRateHz * durationMs) / 1_000));

  const speedPxPerSec = Number.isFinite(input.speedPxPerSec)
    ? Math.max(0, input.speedPxPerSec)
    : 0;
  const pressure = clamp(input.pressure, 0, 1);
  const tiltDeg = clamp(input.tiltDeg, 0, 90);
  const prefersReducedMotion = Boolean(input.prefersReducedMotion);

  const pcm48k = new Float32Array(sampleCount);

  if (speedPxPerSec <= 0 || pressure <= 0) {
    return {
      substrate: input.substrate,
      nib: input.nib,
      substrateLabelKo: substrateProfile.labelKo,
      nibLabelKo: nibProfile.labelKo,
      pcm48k,
      hapticPulses: [],
      telemetry: {
        sampleRateHz,
        sampleCount,
        durationMs,
        rmsLinear: 0,
        peakLinear: 0,
        peakDbfs: Number.NEGATIVE_INFINITY,
        meanDcOffset: 0,
        zeroCrossingRate: 0,
        spectralCentroidHz: 0,
        stickSlipImpulseCount: 0,
        hapticSuppressedByReducedMotion: prefersReducedMotion,
      },
    };
  }

  const speedNorm = clamp(Math.log1p(speedPxPerSec / 110) / Math.log1p(24), 0.03, 1);
  const tiltNorm = tiltDeg / 90;
  const pressureCurve = 0.25 + 0.75 * Math.pow(pressure, 0.85);

  const bodyFreqHz =
    substrateProfile.bodyFormantHz *
    (0.76 + 0.52 * speedNorm) *
    (1 - 0.18 * tiltNorm);
  const nibFreqHz =
    nibProfile.nibFormantHz *
    (0.84 + 0.3 * pressure) *
    (1 - 0.28 * tiltNorm);

  const bodyCoeffs = computeBandpassBiquadCoeffs(
    sampleRateHz,
    bodyFreqHz,
    substrateProfile.bodyFormantQ * (1 - 0.15 * tiltNorm),
  );
  const nibCoeffs = computeBandpassBiquadCoeffs(
    sampleRateHz,
    nibFreqHz,
    nibProfile.nibFormantQ * (1 - 0.25 * tiltNorm),
  );

  const bodyState: BiquadState = { x1: 0, x2: 0, y1: 0, y2: 0 };
  const nibState: BiquadState = { x1: 0, x2: 0, y1: 0, y2: 0 };

  const substrateHash =
    (STUDIO_PAPER_SUBSTRATES.indexOf(input.substrate) + 1) * 0x1f123bb5;
  const nibHash = (STUDIO_STYLUS_NIBS.indexOf(input.nib) + 1) * 0x059c3b2d;
  const combinedSeed =
    ((input.seed ?? 0x51a72701) ^ substrateHash ^ nibHash) | 0;
  const nextBipolarNoise = createDeterministicXorshift32(combinedSeed);

  const distancePerSamplePx = speedPxPerSec / sampleRateHz;
  const basePitchPx = substrateProfile.grainPitchPx * (1 + 0.35 * tiltNorm);
  let nextGrainDistancePx = basePitchPx * (0.75 + 0.25 * (nextBipolarNoise() + 1) * 0.5);
  let traversedGrainPx = 0;

  let slipEnvelope = 0;
  let slipPolarity = 1;
  const slipDecay = Math.exp(-1 / (sampleRateHz * (0.00055 + 0.0009 * (1 - nibProfile.stiffness))));

  let stickSlipImpulseCount = 0;
  const hapticPulses: MicroHapticPulseDescriptor[] = [];
  let lastHapticOnsetMs = -100;
  const minHapticSpacingMs = 9.5;

  const continuousNoiseGain =
    (0.08 + 0.62 * substrateProfile.microRoughness) *
    nibProfile.gainScale *
    pressureCurve *
    speedNorm *
    (1 + 0.18 * tiltNorm);

  const impulseCouplingGain =
    substrateProfile.stickSlipCoupling *
    (0.28 + 0.72 * nibProfile.stiffness) *
    nibProfile.gainScale *
    pressureCurve *
    speedNorm;

  let dcPrevX = 0;
  let dcPrevY = 0;
  const dcPole = 0.994;
  let rawSum = 0;

  for (let i = 0; i < sampleCount; i += 1) {
    traversedGrainPx += distancePerSamplePx;
    if (traversedGrainPx >= nextGrainDistancePx) {
      traversedGrainPx -= nextGrainDistancePx;
      const jitter = 0.65 + 0.7 * ((nextBipolarNoise() + 1) * 0.5);
      nextGrainDistancePx = Math.max(0.8, basePitchPx * jitter);
      slipPolarity = -slipPolarity;
      const microStrength = 0.65 + 0.35 * ((nextBipolarNoise() + 1) * 0.5);
      slipEnvelope = Math.min(1.4, slipEnvelope + microStrength);
      stickSlipImpulseCount += 1;

      const onsetMs = (i * 1_000) / sampleRateHz;
      if (!prefersReducedMotion && onsetMs - lastHapticOnsetMs >= minHapticSpacingMs) {
        const pulseIntensity = clamp(
          (0.16 + 0.84 * substrateProfile.microRoughness) *
            (0.3 + 0.7 * pressure) *
            speedNorm *
            (0.45 + 0.55 * nibProfile.stiffness),
          0.04,
          1,
        );
        const pulseSharpness = clamp(
          nibProfile.hapticSharpnessBase * (1 - 0.32 * tiltNorm) *
            (0.75 + 0.25 * substrateProfile.stickSlipCoupling),
          0.05,
          1,
        );
        const pulseDurationMs = roundTo(
          clamp(
            3.5 +
              7.5 * (1 - nibProfile.stiffness * 0.55) * (0.55 + 0.45 * substrateProfile.microRoughness),
            2,
            MAX_HAPTIC_PULSE_DURATION_MS,
          ),
          2,
        );
        const attackMs = roundTo(pulseDurationMs * 0.28, 2);
        const releaseMs = roundTo(pulseDurationMs - attackMs, 2);

        hapticPulses.push({
          onsetMs: roundTo(onsetMs, 2),
          durationMs: pulseDurationMs,
          intensity: roundTo(pulseIntensity, 4),
          sharpness: roundTo(pulseSharpness, 4),
          attackMs,
          releaseMs,
        });
        lastHapticOnsetMs = onsetMs;
      }
    }

    const white = nextBipolarNoise();
    const slipTransient = slipEnvelope * slipPolarity * impulseCouplingGain;
    slipEnvelope *= slipDecay;

    const excitation = white * continuousNoiseGain + slipTransient * 0.95;
    const bodyResonated = stepBiquad(excitation, bodyCoeffs, bodyState);
    const nibResonated = stepBiquad(excitation, nibCoeffs, nibState);

    const mixed =
      bodyResonated * (0.52 + 0.28 * substrateProfile.microRoughness) +
      nibResonated * (0.48 + 0.24 * nibProfile.stiffness) +
      slipTransient * 0.28;

    const dcBlocked = mixed - dcPrevX + dcPole * dcPrevY;
    dcPrevX = mixed;
    dcPrevY = dcBlocked;

    pcm48k[i] = dcBlocked;
    rawSum += dcBlocked;
  }

  // 1차 평균 차감 → 홀함수 tanh 소프트 클리핑 → 잔류 평균 재차감 및 피크 상한 보정
  const rawMean = rawSum / sampleCount;
  const softCeiling = 0.704;
  let postClipSum = 0;

  for (let i = 0; i < sampleCount; i += 1) {
    const centered = (pcm48k[i] ?? 0) - rawMean;
    const clipped = softCeiling * Math.tanh(centered / softCeiling);
    pcm48k[i] = clipped;
    postClipSum += clipped;
  }

  const postClipMean = postClipSum / sampleCount;
  let maxAbsAfterZeroMean = 0;
  for (let i = 0; i < sampleCount; i += 1) {
    const zeroMeanSample = (pcm48k[i] ?? 0) - postClipMean;
    pcm48k[i] = zeroMeanSample;
    const absVal = Math.abs(zeroMeanSample);
    if (absVal > maxAbsAfterZeroMean) {
      maxAbsAfterZeroMean = absVal;
    }
  }

  const headroomScale =
    maxAbsAfterZeroMean > MAX_PEAK_LINEAR_MINUS_3DBFS
      ? 0.706 / maxAbsAfterZeroMean
      : 1;

  let sumSq = 0;
  let finalSum = 0;
  let peakLinear = 0;
  let zeroCrossings = 0;

  for (let i = 0; i < sampleCount; i += 1) {
    const scaled = (pcm48k[i] ?? 0) * headroomScale;
    pcm48k[i] = scaled;
    const actual = pcm48k[i] ?? 0;
    sumSq += actual * actual;
    finalSum += actual;
    const absActual = Math.abs(actual);
    if (absActual > peakLinear) {
      peakLinear = absActual;
    }
    if (i > 0) {
      const prev = pcm48k[i - 1] ?? 0;
      if ((prev < 0 && actual >= 0) || (prev >= 0 && actual < 0)) {
        zeroCrossings += 1;
      }
    }
  }

  const rmsLinear = Math.sqrt(sumSq / sampleCount);
  const meanDcOffset = finalSum / sampleCount;
  const peakDbfs =
    peakLinear > 0 ? roundTo(20 * Math.log10(peakLinear), 3) : Number.NEGATIVE_INFINITY;
  const zeroCrossingRate =
    sampleCount > 1 ? roundTo(zeroCrossings / (sampleCount - 1), 5) : 0;
  const spectralCentroidHz = estimateSpectralCentroidHz(pcm48k, sampleRateHz);

  return {
    substrate: input.substrate,
    nib: input.nib,
    substrateLabelKo: substrateProfile.labelKo,
    nibLabelKo: nibProfile.labelKo,
    pcm48k,
    hapticPulses,
    telemetry: {
      sampleRateHz,
      sampleCount,
      durationMs,
      rmsLinear: roundTo(rmsLinear, 6),
      peakLinear: roundTo(peakLinear, 6),
      peakDbfs,
      meanDcOffset: roundTo(meanDcOffset, 7),
      zeroCrossingRate,
      spectralCentroidHz,
      stickSlipImpulseCount,
      hapticSuppressedByReducedMotion: prefersReducedMotion,
    },
  };
}
