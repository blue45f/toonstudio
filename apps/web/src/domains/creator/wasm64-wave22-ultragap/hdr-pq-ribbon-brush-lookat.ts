/**
 * Wasm64 Wave 22 Ultragap — 선택적 발광 HDR(SMPTE ST.2084 PQ / HLG) & ISO-21496-1 게인맵 톤매퍼,
 * 가우스-르장드르 호길이 곡률 안전(`r·κ < 1`) 리본·체인·레이스 브러시 변형기,
 * 생체역학 안구-두부-상체(Oculo-Cephalic) 시선 협응 솔버.
 *
 * - 종이 바탕과 캐릭터 피부 확산 반사는 ITU-R BT.2408 기준 백색(`203 nits`)에 단단히 고정하고,
 *   검기·마법진·역광 발광 마스크만 최대 `1,000 nits`까지 끌어올리며 ISO-21496-1 호환 `log2` 게인맵을 함께 생성한다.
 * - 리본·체인·레이스·지퍼 장식 브러시 변형기(`ribbon-spline-motif-deformer`)를 통합 재노출한다.
 * - 3D 응시 대상을 안구(`<= ±28°`, 약 35%)·머리/목(약 45%)·상체(약 20%) 회전과
 *   단속성 안구운동(Saccade) 선행 후 두부 추종·전정안반사(VOR) 위상 지연으로 분해한다.
 */

export {
  buildGaussLegendreArcLengthTable,
  createOrnamentalMotifTemplate,
  deformRibbonMotifAlongSpline,
  sampleSplineAtArcLength,
  type ArcLengthSampleEntry,
  type CubicRibbonSplineSegment,
  type DeformedRibbonVertex,
  type GaussLegendreArcLengthTable,
  type Point2D,
  type RibbonBrushDeformInput,
  type RibbonBrushDeformResult,
  type RibbonMotifKind,
  type RibbonMotifTemplate,
  type RibbonMotifVertex,
  type SplineDifferentialFrame2D,
} from "./ribbon-spline-motif-deformer";

export const HDR_DIFFUSE_WHITE_NITS = 203;
export const DEFAULT_HDR_PEAK_EMISSIVE_NITS = 1000;
export const ST2084_MAX_LUMINANCE_NITS = 10000;
export const ISO21496_DEFAULT_OFFSET = 1 / 64;
export const MAX_PHYSIOLOGICAL_EYE_DEG = 28;

export const DEFAULT_OCULO_CEPHALIC_WEIGHTS = {
  eye: 0.35,
  headNeck: 0.45,
  upperTorso: 0.2,
} as const;

// SMPTE ST.2084 (PQ) 상수 정의
const PQ_M1 = 2610 / 16384;
const PQ_M2 = (2523 / 4096) * 128;
const PQ_C1 = 3424 / 4096;
const PQ_C2 = (2413 / 4096) * 32;
const PQ_C3 = (2392 / 4096) * 32;

// ITU-R BT.2100 HLG (ARIB STD-B67) 상수 정의
const HLG_A = 0.17883277;
const HLG_B = 1 - 4 * HLG_A;
const HLG_C = 0.5 - HLG_A * Math.log(4 * HLG_A);

const RAD_TO_DEG = 180 / Math.PI;

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function smoothstep01(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

// ============================================================================
// 1. SMPTE ST.2084 (PQ) / HLG 선택적 발광 HDR 및 ISO-21496-1 SDR 게인맵 톤매퍼
// ============================================================================

export type HdrTransferFunction = "pq" | "hlg";

export interface Iso21496GainMapMetadata {
  readonly minLog2Gain: number;
  readonly maxLog2Gain: number;
  readonly gamma: 1;
  readonly offsetSdr: number;
  readonly offsetHdr: number;
  readonly baseHdrHeadroomLog2: number;
  readonly diffuseWhiteNits: number;
  readonly peakEmissiveNits: number;
}

export interface SelectiveEmissiveHdrInput {
  readonly width: number;
  readonly height: number;
  /** 선형 색공간 RGBA 버퍼 (`1.0` = 종이 기준 확산 백색, 길이 `width * height * 4`). */
  readonly linearRgba: Float32Array;
  /** 마법·검기·역광 발광 마스크 (`[0, 1]`, 길이 `width * height`). */
  readonly emissiveMask: Float32Array;
  /** 종이 여백·캐릭터 피부 확산 반사 보호 마스크 (`[0, 1]`, 선택). */
  readonly paperSkinProtectMask?: Float32Array;
  readonly transferFunction?: HdrTransferFunction;
  readonly diffuseWhiteNits?: number;
  readonly peakEmissiveNits?: number;
  readonly emissiveExponent?: number;
  readonly sdrKneeStart?: number;
  readonly gainMapOffset?: number;
}

export interface SelectiveEmissiveHdrResult {
  readonly width: number;
  readonly height: number;
  readonly transferFunction: HdrTransferFunction;
  readonly hdrNitsRgba: Float32Array;
  readonly hdrEncodedRgba: Float32Array;
  readonly sdrLinearRgba: Float32Array;
  readonly sdrSrgb8Rgba: Uint8Array;
  readonly gainMapQuantized8: Uint8Array;
  readonly gainMapMetadata: Iso21496GainMapMetadata;
  readonly maxDiffuseProtectedNits: number;
  readonly maxEmissiveOutputNits: number;
  readonly clippedSdrEmissiveChannelCount: number;
  readonly serverCostKrw: 0;
}

/** 절대 휘도(`0 ~ 10,000 nits`)를 SMPTE ST.2084 PQ 비선형 코드값(`[0, 1]`)으로 변환한다. */
export function encodePqSt2084(nits: number): number {
  const normalized = clamp(nits / ST2084_MAX_LUMINANCE_NITS, 0, 1);
  if (normalized === 0) return 0;
  const ym = Math.pow(normalized, PQ_M1);
  return clamp(Math.pow((PQ_C1 + PQ_C2 * ym) / (1 + PQ_C3 * ym), PQ_M2), 0, 1);
}

/** SMPTE ST.2084 PQ 비선형 코드값(`[0, 1]`)을 절대 휘도(`nits`)로 복호한다. */
export function decodePqSt2084(pqSignal: number): number {
  const signal = clamp(pqSignal, 0, 1);
  if (signal === 0) return 0;
  const ep = Math.pow(signal, 1 / PQ_M2);
  const numerator = Math.max(0, ep - PQ_C1);
  const denominator = Math.max(1e-12, PQ_C2 - PQ_C3 * ep);
  return ST2084_MAX_LUMINANCE_NITS * Math.pow(numerator / denominator, 1 / PQ_M1);
}

/** 정규화 상대 선형 광량(`[0, 1]`)에 ITU-R BT.2100 HLG OETF를 적용한다. */
export function encodeHlgOetf(normalizedLinear: number): number {
  const e = clamp(normalizedLinear, 0, 1);
  if (e <= 1 / 12) return Math.sqrt(3 * e);
  return clamp(HLG_A * Math.log(12 * e - HLG_B) + HLG_C, 0, 1);
}

/** ITU-R BT.2100 HLG 비선형 신호(`[0, 1]`)를 정규화 상대 선형 광량(`[0, 1]`)으로 역변환한다. */
export function decodeHlgOetf(hlgSignal: number): number {
  const ep = clamp(hlgSignal, 0, 1);
  if (ep <= 0.5) return (ep * ep) / 3;
  return clamp((Math.exp((ep - HLG_C) / HLG_A) + HLG_B) / 12, 0, 1);
}

function computeBt2100HlgSystemGamma(nominalPeakNits: number): number {
  return 1.2 + 0.42 * Math.log10(Math.max(100, nominalPeakNits) / 1000);
}

/** 디스플레이 목표 피크 휘도 기준 절대 `nits`를 BT.2100 HLG 신호로 변환한다 (`203 nits` -> 약 `0.75`). */
export function nitsToHlgSignal(nits: number, nominalPeakNits = DEFAULT_HDR_PEAK_EMISSIVE_NITS): number {
  const safePeak = Math.max(100, nominalPeakNits);
  const gamma = computeBt2100HlgSystemGamma(safePeak);
  return encodeHlgOetf(Math.pow(clamp(nits / safePeak, 0, 1), 1 / gamma));
}

/** BT.2100 HLG 신호를 디스플레이 목표 피크 휘도 기준 절대 `nits`로 역변환한다. */
export function hlgSignalToNits(hlgSignal: number, nominalPeakNits = DEFAULT_HDR_PEAK_EMISSIVE_NITS): number {
  const safePeak = Math.max(100, nominalPeakNits);
  const gamma = computeBt2100HlgSystemGamma(safePeak);
  return safePeak * Math.pow(decodeHlgOetf(hlgSignal), gamma);
}

/** IEC 61966-2-1 선형 채널 값을 sRGB 비선형 값(`[0, 1]`)으로 인코딩한다. */
export function linearToSrgbChannel(linear: number): number {
  const x = clamp(linear, 0, 1);
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

/** `C^1` 연속 무클리핑 유리 함수 하이라이트 롤오프 (`x > knee` 구간에서 항상 `< 1`). */
function compressSdrHighlightKnee(x: number, kneeStart: number): number {
  const safeX = Math.max(0, x);
  const k0 = clamp(kneeStart, 0.25, 0.95);
  if (safeX <= k0) return safeX;
  const headroom = 1 - k0;
  const delta = safeX - k0;
  return k0 + (headroom * delta) / (headroom + delta);
}

function rec709Luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * 종이·피부 확산 반사를 `203 nits`에 고정하면서 발광 이펙트만 최대 `1,000 nits` PQ/HLG로 승격하고,
 * SDR 디스플레이용 무클리핑 폴백 및 ISO-21496-1 `log2` 게인맵을 동시에 생성한다.
 */
export function mapSelectiveEmissiveHdrAndGainMap(input: SelectiveEmissiveHdrInput): SelectiveEmissiveHdrResult {
  const width = Math.max(1, Math.trunc(input.width));
  const height = Math.max(1, Math.trunc(input.height));
  const pixelCount = width * height;
  if (input.linearRgba.length < pixelCount * 4) {
    throw new Error(`linearRgba 버퍼 길이(${input.linearRgba.length})가 픽셀 수(${pixelCount * 4})보다 작습니다.`);
  }
  if (input.emissiveMask.length < pixelCount) {
    throw new Error(`emissiveMask 길이(${input.emissiveMask.length})가 픽셀 수(${pixelCount})보다 작습니다.`);
  }

  const transferFunction: HdrTransferFunction = input.transferFunction ?? "pq";
  const diffuseWhiteNits = Math.max(80, input.diffuseWhiteNits ?? HDR_DIFFUSE_WHITE_NITS);
  const peakEmissiveNits = Math.max(diffuseWhiteNits, input.peakEmissiveNits ?? DEFAULT_HDR_PEAK_EMISSIVE_NITS);
  const emissiveExponent = clamp(input.emissiveExponent ?? 1.25, 0.4, 3.0);
  const sdrKneeStart = clamp(input.sdrKneeStart ?? 0.78, 0.35, 0.92);
  const offset = clamp(input.gainMapOffset ?? ISO21496_DEFAULT_OFFSET, 1 / 4096, 0.25);

  const hdrNitsRgba = new Float32Array(pixelCount * 4);
  const hdrEncodedRgba = new Float32Array(pixelCount * 4);
  const sdrLinearRgba = new Float32Array(pixelCount * 4);
  const sdrSrgb8Rgba = new Uint8Array(pixelCount * 4);
  const rawLog2Gains = new Float32Array(pixelCount);

  let minLog2Gain = Number.POSITIVE_INFINITY;
  let maxLog2Gain = Number.NEGATIVE_INFINITY;
  let maxDiffuseProtectedNits = 0;
  let maxEmissiveOutputNits = 0;
  let clippedSdrEmissiveChannelCount = 0;
  const extraSpanNits = peakEmissiveNits - diffuseWhiteNits;

  for (let i = 0; i < pixelCount; i += 1) {
    const base = i * 4;
    const rawR = Math.max(0, input.linearRgba[base] ?? 0);
    const rawG = Math.max(0, input.linearRgba[base + 1] ?? 0);
    const rawB = Math.max(0, input.linearRgba[base + 2] ?? 0);
    const alpha = clamp(input.linearRgba[base + 3] ?? 1, 0, 1);

    const diffR = clamp(rawR, 0, 1);
    const diffG = clamp(rawG, 0, 1);
    const diffB = clamp(rawB, 0, 1);

    const rawEmissive = clamp(input.emissiveMask[i] ?? 0, 0, 1);
    const protectWeight = smoothstep01(input.paperSkinProtectMask?.[i] ?? 0);
    const effectiveEmissive = rawEmissive * (1 - protectWeight);
    const shapedEmissive = effectiveEmissive > 0 ? Math.pow(effectiveEmissive, emissiveExponent) : 0;

    const maxRawChannel = Math.max(rawR, rawG, rawB, 1e-6);
    const emitChromaR = rawR > 1 ? rawR / maxRawChannel : diffR;
    const emitChromaG = rawG > 1 ? rawG / maxRawChannel : diffG;
    const emitChromaB = rawB > 1 ? rawB / maxRawChannel : diffB;

    const sceneOverrangeBoost = rawR > 1 || rawG > 1 || rawB > 1
      ? clamp((maxRawChannel - 1) / 3, 0, 1) * (1 - protectWeight)
      : 0;
    const combinedLift = clamp(shapedEmissive + sceneOverrangeBoost * (1 - shapedEmissive), 0, 1);

    const hdrR = clamp(diffuseWhiteNits * diffR + extraSpanNits * combinedLift * emitChromaR, 0, peakEmissiveNits);
    const hdrG = clamp(diffuseWhiteNits * diffG + extraSpanNits * combinedLift * emitChromaG, 0, peakEmissiveNits);
    const hdrB = clamp(diffuseWhiteNits * diffB + extraSpanNits * combinedLift * emitChromaB, 0, peakEmissiveNits);

    hdrNitsRgba[base] = hdrR;
    hdrNitsRgba[base + 1] = hdrG;
    hdrNitsRgba[base + 2] = hdrB;
    hdrNitsRgba[base + 3] = alpha;

    const peakPixelNits = Math.max(hdrR, hdrG, hdrB);
    if ((rawEmissive === 0 || protectWeight >= 0.999) && peakPixelNits > maxDiffuseProtectedNits) {
      maxDiffuseProtectedNits = peakPixelNits;
    }
    if (peakPixelNits > maxEmissiveOutputNits) maxEmissiveOutputNits = peakPixelNits;

    if (transferFunction === "pq") {
      hdrEncodedRgba[base] = encodePqSt2084(hdrR);
      hdrEncodedRgba[base + 1] = encodePqSt2084(hdrG);
      hdrEncodedRgba[base + 2] = encodePqSt2084(hdrB);
    } else {
      hdrEncodedRgba[base] = nitsToHlgSignal(hdrR, peakEmissiveNits);
      hdrEncodedRgba[base + 1] = nitsToHlgSignal(hdrG, peakEmissiveNits);
      hdrEncodedRgba[base + 2] = nitsToHlgSignal(hdrB, peakEmissiveNits);
    }
    hdrEncodedRgba[base + 3] = alpha;

    const relR = hdrR / diffuseWhiteNits;
    const relG = hdrG / diffuseWhiteNits;
    const relB = hdrB / diffuseWhiteNits;

    const kneeBlend = smoothstep01(combinedLift * 4);
    const sdrR = diffR * (1 - kneeBlend) + compressSdrHighlightKnee(relR, sdrKneeStart) * kneeBlend;
    const sdrG = diffG * (1 - kneeBlend) + compressSdrHighlightKnee(relG, sdrKneeStart) * kneeBlend;
    const sdrB = diffB * (1 - kneeBlend) + compressSdrHighlightKnee(relB, sdrKneeStart) * kneeBlend;

    if (combinedLift > 0) {
      if (sdrR >= 1) clippedSdrEmissiveChannelCount += 1;
      if (sdrG >= 1) clippedSdrEmissiveChannelCount += 1;
      if (sdrB >= 1) clippedSdrEmissiveChannelCount += 1;
    }

    sdrLinearRgba[base] = sdrR;
    sdrLinearRgba[base + 1] = sdrG;
    sdrLinearRgba[base + 2] = sdrB;
    sdrLinearRgba[base + 3] = alpha;

    sdrSrgb8Rgba[base] = Math.round(linearToSrgbChannel(sdrR) * 255);
    sdrSrgb8Rgba[base + 1] = Math.round(linearToSrgbChannel(sdrG) * 255);
    sdrSrgb8Rgba[base + 2] = Math.round(linearToSrgbChannel(sdrB) * 255);
    sdrSrgb8Rgba[base + 3] = Math.round(alpha * 255);

    const hdrRelLum = Math.max(rec709Luminance(relR, relG, relB), Math.max(relR, relG, relB));
    const sdrRelLum = Math.max(rec709Luminance(sdrR, sdrG, sdrB), Math.max(sdrR, sdrG, sdrB));
    const log2Gain = Math.log2((hdrRelLum + offset) / (sdrRelLum + offset));
    rawLog2Gains[i] = log2Gain;
    if (log2Gain < minLog2Gain) minLog2Gain = log2Gain;
    if (log2Gain > maxLog2Gain) maxLog2Gain = log2Gain;
  }

  const safeMinGain = Number.isFinite(minLog2Gain) ? minLog2Gain : 0;
  const safeMaxGain = Number.isFinite(maxLog2Gain) && maxLog2Gain > safeMinGain + 1e-6
    ? maxLog2Gain
    : safeMinGain + 1e-6;
  const span = safeMaxGain - safeMinGain;

  const gainMapQuantized8 = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    gainMapQuantized8[i] = Math.round(clamp(((rawLog2Gains[i] ?? safeMinGain) - safeMinGain) / span, 0, 1) * 255);
  }

  return {
    width,
    height,
    transferFunction,
    hdrNitsRgba,
    hdrEncodedRgba,
    sdrLinearRgba,
    sdrSrgb8Rgba,
    gainMapQuantized8,
    gainMapMetadata: {
      minLog2Gain: safeMinGain,
      maxLog2Gain: safeMaxGain,
      gamma: 1,
      offsetSdr: offset,
      offsetHdr: offset,
      baseHdrHeadroomLog2: Math.log2(peakEmissiveNits / diffuseWhiteNits),
      diffuseWhiteNits,
      peakEmissiveNits,
    },
    maxDiffuseProtectedNits,
    maxEmissiveOutputNits,
    clippedSdrEmissiveChannelCount,
    serverCostKrw: 0,
  };
}

/** ISO-21496-1 8비트 양자화 게인맵과 선형 SDR 버퍼로부터 목표 디스플레이 헤드룸에 맞춰 HDR `nits`를 복원한다. */
export function reconstructHdrNitsFromGainMap(
  sdrLinearRgba: Float32Array,
  gainMapQuantized8: Uint8Array,
  metadata: Iso21496GainMapMetadata,
  hdrDisplayWeight = 1,
): Float32Array {
  const pixelCount = gainMapQuantized8.length;
  const outHdrNits = new Float32Array(pixelCount * 4);
  const weight = clamp(hdrDisplayWeight, 0, 1);
  const span = metadata.maxLog2Gain - metadata.minLog2Gain;

  for (let i = 0; i < pixelCount; i += 1) {
    const q = (gainMapQuantized8[i] ?? 0) / 255;
    const scale = Math.pow(2, (metadata.minLog2Gain + q * span) * weight);
    const base = i * 4;
    for (let c = 0; c < 3; c += 1) {
      const sdrCh = sdrLinearRgba[base + c] ?? 0;
      outHdrNits[base + c] = clamp(
        metadata.diffuseWhiteNits * ((sdrCh + metadata.offsetSdr) * scale - metadata.offsetHdr),
        0,
        metadata.peakEmissiveNits,
      );
    }
    outHdrNits[base + 3] = sdrLinearRgba[base + 3] ?? 1;
  }
  return outHdrNits;
}

// ============================================================================
// 2. 생체역학 안구-두부-상체(Oculo-Cephalic) 시선 협응 솔버
// ============================================================================

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface JointEulerAnglesDeg {
  readonly yawDeg: number;
  readonly pitchDeg: number;
  readonly rollDeg: number;
}

export interface OculoCephalicConfig {
  readonly eyeWeight?: number;
  readonly headNeckWeight?: number;
  readonly upperTorsoWeight?: number;
  readonly maxEyeEccentricityDeg?: number;
  readonly maxHeadNeckYawDeg?: number;
  readonly maxHeadNeckPitchDeg?: number;
  readonly maxUpperTorsoYawDeg?: number;
  readonly maxUpperTorsoPitchDeg?: number;
  readonly interpupillaryDistanceM?: number;
  readonly naturalHeadRollCoupling?: number;
}

export interface OculoCephalicLookAtInput {
  readonly eyePivotWorld: Vec3;
  readonly targetWorld: Vec3;
  readonly neutralForwardYawDeg?: number;
  readonly config?: OculoCephalicConfig;
}

export interface OculoCephalicSolution {
  readonly targetYawDeg: number;
  readonly targetPitchDeg: number;
  readonly targetDistanceM: number;
  readonly upperTorso: JointEulerAnglesDeg;
  readonly headNeck: JointEulerAnglesDeg;
  readonly cyclopeanEye: JointEulerAnglesDeg;
  readonly leftEye: JointEulerAnglesDeg;
  readonly rightEye: JointEulerAnglesDeg;
  readonly eyeEccentricityDeg: number;
  readonly combinedGazeYawDeg: number;
  readonly combinedGazePitchDeg: number;
  readonly residualErrorDeg: number;
  readonly extremeScleraPrevented: boolean;
}

export interface OculoCephalicTrajectoryInput extends OculoCephalicLookAtInput {
  readonly durationMs: number;
  readonly stepMs?: number;
  readonly saccadeTauMs?: number;
  readonly headOnsetDelayMs?: number;
  readonly headTauMs?: number;
  readonly torsoOnsetDelayMs?: number;
  readonly torsoTauMs?: number;
}

export interface OculoCephalicTrajectoryFrame {
  readonly timeMs: number;
  readonly upperTorso: JointEulerAnglesDeg;
  readonly headNeck: JointEulerAnglesDeg;
  readonly cyclopeanEye: JointEulerAnglesDeg;
  readonly eyeEccentricityDeg: number;
  readonly combinedGazeYawDeg: number;
  readonly combinedGazePitchDeg: number;
  readonly eyeOverHeadPhaseLeadDeg: number;
}

function normalizeSignedDeg(angleDeg: number): number {
  let a = ((angleDeg + 180) % 360 + 360) % 360 - 180;
  if (a === -180 && angleDeg > 0) a = 180;
  return a;
}

function clampEyeRadialDeg(
  yawDeg: number,
  pitchDeg: number,
  maxDeg: number,
): { yawDeg: number; pitchDeg: number; clamped: boolean } {
  const safeMax = clamp(maxDeg, 5, MAX_PHYSIOLOGICAL_EYE_DEG);
  const mag = Math.hypot(yawDeg, pitchDeg);
  if (mag <= safeMax) return { yawDeg, pitchDeg, clamped: false };
  const scale = safeMax / mag;
  return { yawDeg: yawDeg * scale, pitchDeg: pitchDeg * scale, clamped: true };
}

function redistributeOverflowAxis(
  targetDeg: number,
  clampedEyeDeg: number,
  initialHeadDeg: number,
  initialTorsoDeg: number,
  headShare: number,
  torsoShare: number,
  maxHeadDeg: number,
  maxTorsoDeg: number,
): { headDeg: number; torsoDeg: number } {
  const overflow = targetDeg - initialTorsoDeg - initialHeadDeg - clampedEyeDeg;
  let headDeg = clamp(initialHeadDeg + overflow * headShare, -maxHeadDeg, maxHeadDeg);
  let torsoDeg = clamp(initialTorsoDeg + overflow * torsoShare, -maxTorsoDeg, maxTorsoDeg);
  headDeg = clamp(headDeg + (targetDeg - torsoDeg - headDeg - clampedEyeDeg), -maxHeadDeg, maxHeadDeg);
  torsoDeg = clamp(torsoDeg + (targetDeg - torsoDeg - headDeg - clampedEyeDeg), -maxTorsoDeg, maxTorsoDeg);
  return { headDeg, torsoDeg };
}

/**
 * 3D 응시 벡터를 생리학적 가중치(안구 ~35% `<= ±28°`, 머리/목 ~45%, 상체 ~20%)로 분해하고,
 * 큰 회전각에서 안구 상한 초과분을 머리·상체 여분 가동 범위로 재분배해 기괴한 흰자위 노출을 차단한다.
 */
export function solveOculoCephalicLookAt(input: OculoCephalicLookAtInput): OculoCephalicSolution {
  const dx = input.targetWorld.x - input.eyePivotWorld.x;
  const dy = input.targetWorld.y - input.eyePivotWorld.y;
  const dz = input.targetWorld.z - input.eyePivotWorld.z;
  const horizontalDist = Math.hypot(dx, dz);
  const distanceM = Math.max(1e-4, Math.hypot(dx, dy, dz));

  const worldYawDeg = Math.atan2(dx, dz) * RAD_TO_DEG;
  const targetYawDeg = normalizeSignedDeg(worldYawDeg - (input.neutralForwardYawDeg ?? 0));
  const targetPitchDeg = clamp(Math.atan2(dy, Math.max(1e-6, horizontalDist)) * RAD_TO_DEG, -89, 89);

  const cfg = input.config;
  const rawEyeW = Math.max(0.01, cfg?.eyeWeight ?? DEFAULT_OCULO_CEPHALIC_WEIGHTS.eye);
  const rawHeadW = Math.max(0.01, cfg?.headNeckWeight ?? DEFAULT_OCULO_CEPHALIC_WEIGHTS.headNeck);
  const rawTorsoW = Math.max(0, cfg?.upperTorsoWeight ?? DEFAULT_OCULO_CEPHALIC_WEIGHTS.upperTorso);
  const weightSum = rawEyeW + rawHeadW + rawTorsoW;
  const wHead = rawHeadW / weightSum;
  const wTorso = rawTorsoW / weightSum;

  const maxEyeDeg = clamp(cfg?.maxEyeEccentricityDeg ?? MAX_PHYSIOLOGICAL_EYE_DEG, 5, MAX_PHYSIOLOGICAL_EYE_DEG);
  const maxHeadYaw = Math.max(5, cfg?.maxHeadNeckYawDeg ?? 55);
  const maxHeadPitch = Math.max(5, cfg?.maxHeadNeckPitchDeg ?? 40);
  const maxTorsoYaw = Math.max(0, cfg?.maxUpperTorsoYawDeg ?? 35);
  const maxTorsoPitch = Math.max(0, cfg?.maxUpperTorsoPitchDeg ?? 22);
  const rollCoupling = clamp(cfg?.naturalHeadRollCoupling ?? 0.08, 0, 0.25);

  const initTorsoYaw = clamp(targetYawDeg * wTorso, -maxTorsoYaw, maxTorsoYaw);
  const initTorsoPitch = clamp(targetPitchDeg * wTorso, -maxTorsoPitch, maxTorsoPitch);
  const initHeadYaw = clamp(targetYawDeg * wHead, -maxHeadYaw, maxHeadYaw);
  const initHeadPitch = clamp(targetPitchDeg * wHead, -maxHeadPitch, maxHeadPitch);

  const initialEye = clampEyeRadialDeg(
    targetYawDeg - initTorsoYaw - initHeadYaw,
    targetPitchDeg - initTorsoPitch - initHeadPitch,
    maxEyeDeg,
  );

  const bodySum = Math.max(1e-6, wHead + wTorso);
  const yawAlloc = redistributeOverflowAxis(
    targetYawDeg,
    initialEye.yawDeg,
    initHeadYaw,
    initTorsoYaw,
    wHead / bodySum,
    wTorso / bodySum,
    maxHeadYaw,
    maxTorsoYaw,
  );
  const pitchAlloc = redistributeOverflowAxis(
    targetPitchDeg,
    initialEye.pitchDeg,
    initHeadPitch,
    initTorsoPitch,
    wHead / bodySum,
    wTorso / bodySum,
    maxHeadPitch,
    maxTorsoPitch,
  );

  const finalEye = clampEyeRadialDeg(
    targetYawDeg - yawAlloc.torsoDeg - yawAlloc.headDeg,
    targetPitchDeg - pitchAlloc.torsoDeg - pitchAlloc.headDeg,
    maxEyeDeg,
  );

  const ipd = clamp(cfg?.interpupillaryDistanceM ?? 0.062, 0.04, 0.08);
  const halfVergenceDeg = Math.atan2(ipd * 0.5, Math.max(0.18, distanceM)) * RAD_TO_DEG;
  const leftClamped = clampEyeRadialDeg(finalEye.yawDeg + halfVergenceDeg, finalEye.pitchDeg, maxEyeDeg);
  const rightClamped = clampEyeRadialDeg(finalEye.yawDeg - halfVergenceDeg, finalEye.pitchDeg, maxEyeDeg);

  const combinedGazeYawDeg = yawAlloc.torsoDeg + yawAlloc.headDeg + finalEye.yawDeg;
  const combinedGazePitchDeg = pitchAlloc.torsoDeg + pitchAlloc.headDeg + finalEye.pitchDeg;
  const headRollDeg = clamp(-yawAlloc.headDeg * rollCoupling * (targetPitchDeg >= 0 ? 1 : 0.6), -8, 8);

  return {
    targetYawDeg,
    targetPitchDeg,
    targetDistanceM: distanceM,
    upperTorso: { yawDeg: yawAlloc.torsoDeg, pitchDeg: pitchAlloc.torsoDeg, rollDeg: yawAlloc.torsoDeg * 0.03 },
    headNeck: { yawDeg: yawAlloc.headDeg, pitchDeg: pitchAlloc.headDeg, rollDeg: headRollDeg },
    cyclopeanEye: { yawDeg: finalEye.yawDeg, pitchDeg: finalEye.pitchDeg, rollDeg: 0 },
    leftEye: { yawDeg: leftClamped.yawDeg, pitchDeg: leftClamped.pitchDeg, rollDeg: 0 },
    rightEye: { yawDeg: rightClamped.yawDeg, pitchDeg: rightClamped.pitchDeg, rollDeg: 0 },
    eyeEccentricityDeg: Math.hypot(finalEye.yawDeg, finalEye.pitchDeg),
    combinedGazeYawDeg,
    combinedGazePitchDeg,
    residualErrorDeg: Math.hypot(targetYawDeg - combinedGazeYawDeg, targetPitchDeg - combinedGazePitchDeg),
    extremeScleraPrevented: Math.hypot(targetYawDeg, targetPitchDeg) > maxEyeDeg || initialEye.clamped,
  };
}

function criticallyDampedResponse(elapsedMs: number, delayMs: number, tauMs: number): number {
  const activeMs = elapsedMs - delayMs;
  if (activeMs <= 0) return 0;
  const u = (2 * activeMs) / Math.max(5, tauMs);
  return clamp(1 - (1 + u) * Math.exp(-u), 0, 1);
}

/**
 * 단속성 안구운동(Saccade) 선행 -> 두부/경추 추종 + 전정안반사(VOR) 역보상 -> 상체 추종으로 이어지는
 * 시간축 위상 지연 시선 전환 궤적을 시뮬레이션한다 (전 구간 안구 편심각 `<= 28°` 보장).
 */
export function simulateOculoCephalicGazeTrajectory(
  input: OculoCephalicTrajectoryInput,
): readonly OculoCephalicTrajectoryFrame[] {
  const steady = solveOculoCephalicLookAt(input);
  const durationMs = Math.max(16, input.durationMs);
  const stepMs = Math.max(4, input.stepMs ?? 16);
  const saccadeTauMs = Math.max(8, input.saccadeTauMs ?? 28);
  const headOnsetDelayMs = Math.max(0, input.headOnsetDelayMs ?? 50);
  const headTauMs = Math.max(20, input.headTauMs ?? 120);
  const torsoOnsetDelayMs = Math.max(headOnsetDelayMs, input.torsoOnsetDelayMs ?? 95);
  const torsoTauMs = Math.max(30, input.torsoTauMs ?? 210);
  const maxEyeDeg = clamp(
    input.config?.maxEyeEccentricityDeg ?? MAX_PHYSIOLOGICAL_EYE_DEG,
    5,
    MAX_PHYSIOLOGICAL_EYE_DEG,
  );

  const frames: OculoCephalicTrajectoryFrame[] = [];
  const stepCount = Math.ceil(durationMs / stepMs);

  for (let i = 0; i <= stepCount; i += 1) {
    const timeMs = Math.min(durationMs, i * stepMs);
    const saccadeGain = clamp(1 - Math.exp(-timeMs / saccadeTauMs), 0, 1);
    const headGain = criticallyDampedResponse(timeMs, headOnsetDelayMs, headTauMs);
    const torsoGain = criticallyDampedResponse(timeMs, torsoOnsetDelayMs, torsoTauMs);

    const torsoYaw = steady.upperTorso.yawDeg * torsoGain;
    const torsoPitch = steady.upperTorso.pitchDeg * torsoGain;
    const headYaw = steady.headNeck.yawDeg * headGain;
    const headPitch = steady.headNeck.pitchDeg * headGain;

    const eyeClamped = clampEyeRadialDeg(
      (steady.combinedGazeYawDeg - torsoYaw - headYaw) * saccadeGain,
      (steady.combinedGazePitchDeg - torsoPitch - headPitch) * saccadeGain,
      maxEyeDeg,
    );

    const eyeMag = Math.hypot(eyeClamped.yawDeg, eyeClamped.pitchDeg);
    const headMag = Math.hypot(headYaw, headPitch);

    frames.push({
      timeMs,
      upperTorso: { yawDeg: torsoYaw, pitchDeg: torsoPitch, rollDeg: steady.upperTorso.rollDeg * torsoGain },
      headNeck: { yawDeg: headYaw, pitchDeg: headPitch, rollDeg: steady.headNeck.rollDeg * headGain },
      cyclopeanEye: { yawDeg: eyeClamped.yawDeg, pitchDeg: eyeClamped.pitchDeg, rollDeg: 0 },
      eyeEccentricityDeg: eyeMag,
      combinedGazeYawDeg: torsoYaw + headYaw + eyeClamped.yawDeg,
      combinedGazePitchDeg: torsoPitch + headPitch + eyeClamped.pitchDeg,
      eyeOverHeadPhaseLeadDeg: eyeMag - headMag,
    });
  }

  return frames;
}
