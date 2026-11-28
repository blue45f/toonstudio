/**
 * Wave 122 — 5종 시네마틱 렌즈 프리셋·타입 및 물리 광학 방정식
 * (Brown-Conrady 정/역왜곡, 얇은 렌즈 CoC, 아나모픽 보케 타원, 측면 색수차, Cos⁴ 비네팅).
 */

export type CinematicLensPresetId =
  | "clean-editorial-50mm"
  | "anamorphic-cinema-2x"
  | "vintage-helios-swirl"
  | "action-wide-24mm-ca"
  | "dreamy-romance-halation";

export interface CinematicLensPreset {
  readonly id: CinematicLensPresetId;
  readonly nameKo: string;
  readonly descriptionKo: string;
  readonly focalLengthMm: number;
  readonly sensorWidthMm: number;
  readonly apertureFStop: number;
  readonly focusDistanceM: number;
  readonly distortionK1: number;
  readonly distortionK2: number;
  readonly tangentialP1: number;
  readonly tangentialP2: number;
  readonly bokehAspectRatio: number;
  readonly anamorphicSqueeze: number;
  readonly swirlFactor: number;
  readonly lateralCaRedPxAtEdge: number;
  readonly lateralCaBluePxAtEdge: number;
  readonly vignetteCos4Strength: number;
  readonly vignetteFieldHalfAngleRad: number;
  readonly minCornerVignetteGain: number;
  readonly halationThresholdLuma: number;
  readonly halationIntensity: number;
  readonly halationRadiusPx: number;
  readonly halationTintRgb: readonly [number, number, number];
  readonly shutterJitterAmplitudePx: number;
}

export interface LensUvPoint {
  readonly u: number;
  readonly v: number;
}

export interface BrownConradyDistortionParams {
  readonly k1: number;
  readonly k2: number;
  readonly p1?: number;
  readonly p2?: number;
}

export interface DistortionRoundTripReport {
  readonly maxRoundTripUvError: number;
  readonly meanRoundTripUvError: number;
  readonly centerDriftUv: number;
  readonly sampleCount: number;
}

export interface ThinLensCocInput {
  readonly depthM: number;
  readonly focusDistanceM: number;
  readonly focalLengthMm: number;
  readonly apertureFStop: number;
  readonly sensorWidthMm?: number;
  readonly imageWidthPx: number;
}

export interface AnamorphicBokehAxes {
  readonly cocDiameterPx: number;
  readonly horizontalRadiusPx: number;
  readonly verticalRadiusPx: number;
  readonly bokehAspectRatio: number;
}

export interface LateralCaShift {
  readonly radialNorm: number;
  readonly redShiftPx: number;
  readonly blueShiftPx: number;
  readonly totalSeparationPx: number;
  readonly redOffsetPxX: number;
  readonly redOffsetPxY: number;
  readonly blueOffsetPxX: number;
  readonly blueOffsetPxY: number;
}

export interface TextSafeBox {
  readonly id?: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly labelKo?: string;
}

export interface DepthCocSample {
  readonly depthM: number;
  readonly cocPx: number;
}

export interface VignetteProfileSample {
  readonly radialNorm: number;
  readonly gain: number;
}

export interface CinematicLensTileInput {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly presetId: CinematicLensPresetId;
  readonly depthMeters?: Float32Array;
  readonly textSafeBoxes?: readonly TextSafeBox[];
  readonly focusDistanceM?: number;
  readonly apertureFStop?: number;
  readonly intensity?: number;
  readonly prefersReducedMotion?: boolean;
  readonly sceneTitleKo?: string;
}

export interface CinematicLensTileMetrics {
  readonly maxDistortionRoundTripUvError: number;
  readonly centerDistortionDriftUv: number;
  readonly centerCaSeparationPx: number;
  readonly edgeCaSeparationPx: number;
  readonly cornerCaSeparationPx: number;
  readonly focusPlaneCocPx: number;
  readonly maxObservedCocPx: number;
  readonly bokehAspectRatio: number;
  readonly centerVignetteGain: number;
  readonly minCornerVignetteGain: number;
  readonly halationActivatedPixelCount: number;
  readonly maxHalationEnergyAdded: number;
  readonly textSafeBoxCount: number;
  readonly textSafeProtectedPixelCount: number;
  readonly textBoxCorruptedPixelCount: number;
  readonly nonFiniteOrOutOfRangeChannelCount: number;
  readonly centerRegionSharpnessPreserved: boolean;
}

export interface CinematicLensTileResult {
  readonly preset: CinematicLensPreset;
  readonly width: number;
  readonly height: number;
  readonly outputRgba: Uint8ClampedArray;
  readonly sceneTitleKo: string;
  readonly intensity: number;
  readonly focusDistanceM: number;
  readonly apertureFStop: number;
  readonly prefersReducedMotion: boolean;
  readonly effectiveShutterJitterPx: number;
  readonly textSafeBoxes: readonly TextSafeBox[];
  readonly metrics: CinematicLensTileMetrics;
  readonly depthCocProfile: readonly DepthCocSample[];
  readonly vignetteProfile: readonly VignetteProfileSample[];
}

export const MIN_SAFE_CORNER_VIGNETTE_GAIN = 0.35;
const FULL_FRAME_SENSOR_WIDTH_MM = 36.0;

export const CINEMATIC_LENS_PRESET_IDS: readonly CinematicLensPresetId[] = [
  "clean-editorial-50mm",
  "anamorphic-cinema-2x",
  "vintage-helios-swirl",
  "action-wide-24mm-ca",
  "dreamy-romance-halation",
] as const;

export const CINEMATIC_LENS_PRESETS: Readonly<Record<CinematicLensPresetId, CinematicLensPreset>> = {
  "clean-editorial-50mm": {
    id: "clean-editorial-50mm",
    nameKo: "클린 에디토리얼 50mm",
    descriptionKo: "왜곡과 색수차를 최소화해 일상 컷과 대사 가독성을 깔끔하게 지키는 표준 단렌즈",
    focalLengthMm: 50,
    sensorWidthMm: FULL_FRAME_SENSOR_WIDTH_MM,
    apertureFStop: 2.8,
    focusDistanceM: 2.5,
    distortionK1: -0.012,
    distortionK2: 0.003,
    tangentialP1: 0,
    tangentialP2: 0,
    bokehAspectRatio: 1.0,
    anamorphicSqueeze: 1.0,
    swirlFactor: 0,
    lateralCaRedPxAtEdge: 0.45,
    lateralCaBluePxAtEdge: -0.35,
    vignetteCos4Strength: 0.32,
    vignetteFieldHalfAngleRad: 0.44,
    minCornerVignetteGain: 0.72,
    halationThresholdLuma: 0.94,
    halationIntensity: 0.0,
    halationRadiusPx: 2,
    halationTintRgb: [1.0, 0.72, 0.48],
    shutterJitterAmplitudePx: 0.0,
  },
  "anamorphic-cinema-2x": {
    id: "anamorphic-cinema-2x",
    nameKo: "아나모픽 시네마 2x",
    descriptionKo: "2.0배 세로 타원 보케와 가로 광학 플레어·할레이션으로 극장판 화면감을 만드는 2x 아나모픽 렌즈",
    focalLengthMm: 40,
    sensorWidthMm: FULL_FRAME_SENSOR_WIDTH_MM,
    apertureFStop: 2.0,
    focusDistanceM: 2.4,
    distortionK1: -0.048,
    distortionK2: 0.012,
    tangentialP1: 0.001,
    tangentialP2: -0.001,
    bokehAspectRatio: 2.0,
    anamorphicSqueeze: 2.0,
    swirlFactor: 0,
    lateralCaRedPxAtEdge: 1.35,
    lateralCaBluePxAtEdge: -1.15,
    vignetteCos4Strength: 0.68,
    vignetteFieldHalfAngleRad: 0.56,
    minCornerVignetteGain: 0.46,
    halationThresholdLuma: 0.78,
    halationIntensity: 0.34,
    halationRadiusPx: 3,
    halationTintRgb: [0.45, 0.78, 1.0],
    shutterJitterAmplitudePx: 0.35,
  },
  "vintage-helios-swirl": {
    id: "vintage-helios-swirl",
    nameKo: "빈티지 헬리오스 스월 58mm",
    descriptionKo: "주변부 회오리 타원 보케와 따뜻한 필름 할레이션으로 회상·감성 컷에 깊이를 더하는 빈티지 렌즈",
    focalLengthMm: 58,
    sensorWidthMm: FULL_FRAME_SENSOR_WIDTH_MM,
    apertureFStop: 2.0,
    focusDistanceM: 2.2,
    distortionK1: -0.068,
    distortionK2: 0.021,
    tangentialP1: 0.0015,
    tangentialP2: 0.001,
    bokehAspectRatio: 1.25,
    anamorphicSqueeze: 1.0,
    swirlFactor: 0.72,
    lateralCaRedPxAtEdge: 1.6,
    lateralCaBluePxAtEdge: -1.35,
    vignetteCos4Strength: 0.85,
    vignetteFieldHalfAngleRad: 0.64,
    minCornerVignetteGain: 0.42,
    halationThresholdLuma: 0.74,
    halationIntensity: 0.38,
    halationRadiusPx: 3,
    halationTintRgb: [1.0, 0.48, 0.22],
    shutterJitterAmplitudePx: 0.25,
  },
  "action-wide-24mm-ca": {
    id: "action-wide-24mm-ca",
    nameKo: "액션 와이드 24mm 색수차",
    descriptionKo: "배럴 왜곡과 외곽 측면 색수차 분리로 타격 순간의 원근감과 속도감을 강조하는 광각 렌즈",
    focalLengthMm: 24,
    sensorWidthMm: FULL_FRAME_SENSOR_WIDTH_MM,
    apertureFStop: 4.0,
    focusDistanceM: 2.0,
    distortionK1: -0.112,
    distortionK2: 0.028,
    tangentialP1: -0.001,
    tangentialP2: 0.002,
    bokehAspectRatio: 1.0,
    anamorphicSqueeze: 1.0,
    swirlFactor: 0,
    lateralCaRedPxAtEdge: 3.2,
    lateralCaBluePxAtEdge: -2.8,
    vignetteCos4Strength: 0.92,
    vignetteFieldHalfAngleRad: 0.76,
    minCornerVignetteGain: 0.38,
    halationThresholdLuma: 0.84,
    halationIntensity: 0.16,
    halationRadiusPx: 2,
    halationTintRgb: [1.0, 0.56, 0.3],
    shutterJitterAmplitudePx: 0.65,
  },
  "dreamy-romance-halation": {
    id: "dreamy-romance-halation",
    nameKo: "드리미 로맨스 85mm 할레이션",
    descriptionKo: "f/1.4 극얕은 심도와 부드러운 적황색 필름 할레이션으로 역광 로맨스 컷을 감싸는 인물 단렌즈",
    focalLengthMm: 85,
    sensorWidthMm: FULL_FRAME_SENSOR_WIDTH_MM,
    apertureFStop: 1.4,
    focusDistanceM: 2.6,
    distortionK1: 0.026,
    distortionK2: -0.005,
    tangentialP1: 0,
    tangentialP2: 0,
    bokehAspectRatio: 1.0,
    anamorphicSqueeze: 1.0,
    swirlFactor: 0.15,
    lateralCaRedPxAtEdge: 0.85,
    lateralCaBluePxAtEdge: -0.75,
    vignetteCos4Strength: 0.52,
    vignetteFieldHalfAngleRad: 0.48,
    minCornerVignetteGain: 0.58,
    halationThresholdLuma: 0.68,
    halationIntensity: 0.52,
    halationRadiusPx: 4,
    halationTintRgb: [1.0, 0.38, 0.18],
    shutterJitterAmplitudePx: 0.15,
  },
};

export function clampFinite(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

export function getCinematicLensPreset(presetId: CinematicLensPresetId): CinematicLensPreset {
  const preset = CINEMATIC_LENS_PRESETS[presetId];
  if (preset === undefined) {
    throw new Error(`알 수 없는 시네마틱 렌즈 프리셋입니다: ${String(presetId)}`);
  }
  return preset;
}

/** sRGB [0, 1] -> 선형 광량 [0, 1] 변환 */
export function srgbChannelToLinear(c: number): number {
  const clamped = clampFinite(c, 0, 1);
  return clamped <= 0.04045 ? clamped / 12.92 : Math.pow((clamped + 0.055) / 1.055, 2.4);
}

/** 선형 광량 [0, 1] -> sRGB [0, 1] 변환 */
export function linearChannelToSrgb(c: number): number {
  const clamped = clampFinite(c, 0, 1);
  return clamped <= 0.0031308
    ? 12.92 * clamped
    : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
}

/** Brown-Conrady 방사형(k1, k2) + 접선형(p1, p2) 렌즈 정왜곡. 중심 (0.5, 0.5)은 불변. */
export function distortLensUv(
  uv: LensUvPoint,
  params: BrownConradyDistortionParams,
): LensUvPoint {
  const x = (uv.u - 0.5) * 2;
  const y = (uv.v - 0.5) * 2;
  const r2 = x * x + y * y;
  const k1 = Number.isFinite(params.k1) ? params.k1 : 0;
  const k2 = Number.isFinite(params.k2) ? params.k2 : 0;
  const p1 = Number.isFinite(params.p1 ?? 0) ? (params.p1 ?? 0) : 0;
  const p2 = Number.isFinite(params.p2 ?? 0) ? (params.p2 ?? 0) : 0;

  const radial = 1 + k1 * r2 + k2 * r2 * r2;
  const xd = x * radial + 2 * p1 * x * y + p2 * (r2 + 2 * x * x);
  const yd = y * radial + p1 * (r2 + 2 * y * y) + 2 * p2 * x * y;
  return { u: 0.5 + 0.5 * xd, v: 0.5 + 0.5 * yd };
}

/** 2차원 해석적 야코비안 뉴턴-랩슨 법으로 Brown-Conrady 역왜곡 좌표를 복원한다. */
export function undistortLensUv(
  distortedUv: LensUvPoint,
  params: BrownConradyDistortionParams,
  maxIterations = 16,
): LensUvPoint {
  const xdTarget = (distortedUv.u - 0.5) * 2;
  const ydTarget = (distortedUv.v - 0.5) * 2;
  if (xdTarget === 0 && ydTarget === 0) {
    return { u: 0.5, v: 0.5 };
  }

  const k1 = Number.isFinite(params.k1) ? params.k1 : 0;
  const k2 = Number.isFinite(params.k2) ? params.k2 : 0;
  const p1 = Number.isFinite(params.p1 ?? 0) ? (params.p1 ?? 0) : 0;
  const p2 = Number.isFinite(params.p2 ?? 0) ? (params.p2 ?? 0) : 0;

  let x = xdTarget;
  let y = ydTarget;
  const iterations = Math.max(1, Math.min(32, Math.floor(maxIterations)));

  for (let iter = 0; iter < iterations; iter += 1) {
    const r2 = x * x + y * y;
    const radial = 1 + k1 * r2 + k2 * r2 * r2;
    const dRadialDr2 = k1 + 2 * k2 * r2;

    const fx = x * radial + 2 * p1 * x * y + p2 * (r2 + 2 * x * x) - xdTarget;
    const fy = y * radial + p1 * (r2 + 2 * y * y) + 2 * p2 * x * y - ydTarget;
    if (fx * fx + fy * fy < 1e-24) {
      break;
    }

    const j00 = radial + 2 * x * x * dRadialDr2 + 2 * p1 * y + 6 * p2 * x;
    const j01 = 2 * x * y * dRadialDr2 + 2 * p1 * x + 2 * p2 * y;
    const j11 = radial + 2 * y * y * dRadialDr2 + 6 * p1 * y + 2 * p2 * x;
    const det = j00 * j11 - j01 * j01;

    if (Math.abs(det) < 1e-12) {
      x -= fx * 0.25;
      y -= fy * 0.25;
      continue;
    }

    const stepX = clampFinite((j11 * fx - j01 * fy) / det, -0.5, 0.5);
    const stepY = clampFinite((-j01 * fx + j00 * fy) / det, -0.5, 0.5);
    x -= stepX;
    y -= stepY;
    if (stepX * stepX + stepY * stepY < 1e-24) {
      break;
    }
  }

  return { u: 0.5 + 0.5 * x, v: 0.5 + 0.5 * y };
}

/** 격자 샘플 전체에서 정왜곡 → 역왜곡 왕복 오차와 중심점 불변 오차를 측정한다. */
export function measureDistortionRoundTripError(
  params: BrownConradyDistortionParams,
  gridSteps = 9,
): DistortionRoundTripReport {
  const steps = Math.max(3, Math.min(25, Math.floor(gridSteps)));
  let maxErr = 0;
  let sumErr = 0;
  let count = 0;

  for (let iy = 0; iy < steps; iy += 1) {
    const v = iy / (steps - 1);
    for (let ix = 0; ix < steps; ix += 1) {
      const u = ix / (steps - 1);
      const recovered = undistortLensUv(distortLensUv({ u, v }, params), params);
      const err = Math.hypot(recovered.u - u, recovered.v - v);
      if (err > maxErr) {
        maxErr = err;
      }
      sumErr += err;
      count += 1;
    }
  }

  const centerDistorted = distortLensUv({ u: 0.5, v: 0.5 }, params);
  return {
    maxRoundTripUvError: maxErr,
    meanRoundTripUvError: count > 0 ? sumErr / count : 0,
    centerDriftUv: Math.hypot(centerDistorted.u - 0.5, centerDistorted.v - 0.5),
    sampleCount: count,
  };
}

/** 얇은 렌즈 물리 방정식 기반 착란원(Circle of Confusion, px) 계산. */
export function computeThinLensCocPx(input: ThinLensCocInput): number {
  const focalLengthM = clampFinite(input.focalLengthMm, 8, 600) / 1000;
  const fStop = clampFinite(input.apertureFStop, 0.7, 32);
  const sensorWidthMm = clampFinite(input.sensorWidthMm ?? FULL_FRAME_SENSOR_WIDTH_MM, 4, 100);
  const imageWidthPx = Math.max(1, Number.isFinite(input.imageWidthPx) ? input.imageWidthPx : 1);

  const minDepthM = focalLengthM * 1.1;
  const focusM = Math.max(minDepthM, Number.isFinite(input.focusDistanceM) ? input.focusDistanceM : 2.5);
  const depthM = Math.max(minDepthM, Number.isFinite(input.depthM) ? input.depthM : focusM);
  if (depthM === focusM) {
    return 0;
  }

  const apertureDiameterM = focalLengthM / fStop;
  const cocSensorMeters =
    ((apertureDiameterM * focalLengthM) / (focusM - focalLengthM)) *
    (Math.abs(depthM - focusM) / depthM);
  return ((cocSensorMeters * 1000) / sensorWidthMm) * imageWidthPx;
}

/** 면적을 보존하면서 verticalRadiusPx / horizontalRadiusPx === bokehAspectRatio를 유지한다. */
export function computeAnamorphicBokehAxes(
  cocDiameterPx: number,
  presetOrAspectRatio: CinematicLensPreset | number,
): AnamorphicBokehAxes {
  const safeCoc = Math.max(0, Number.isFinite(cocDiameterPx) ? cocDiameterPx : 0);
  const rawAspect =
    typeof presetOrAspectRatio === "number"
      ? presetOrAspectRatio
      : presetOrAspectRatio.bokehAspectRatio;
  const bokehAspectRatio = clampFinite(rawAspect, 0.5, 4.0);
  const horizontalRadiusPx = (safeCoc * 0.5) / Math.sqrt(bokehAspectRatio);
  return {
    cocDiameterPx: safeCoc,
    horizontalRadiusPx,
    verticalRadiusPx: horizontalRadiusPx * bokehAspectRatio,
    bokehAspectRatio,
  };
}

/** 측면 색수차(Lateral CA) 분리량. 중심 (0.5, 0.5)은 정확히 0.0px, 외곽으로 단조 증가. */
export function computeLateralCaShiftPx(
  u: number,
  v: number,
  preset: CinematicLensPreset,
  intensity = 1.0,
): LateralCaShift {
  const dx = (u - 0.5) * 2;
  const dy = (v - 0.5) * 2;
  const radius = Math.hypot(dx, dy);
  const safeIntensity = clampFinite(intensity, 0, 1.5);
  if (radius === 0 || safeIntensity === 0) {
    return {
      radialNorm: 0,
      redShiftPx: 0,
      blueShiftPx: 0,
      totalSeparationPx: 0,
      redOffsetPxX: 0,
      redOffsetPxY: 0,
      blueOffsetPxX: 0,
      blueOffsetPxY: 0,
    };
  }

  const radialNorm = Math.min(1, radius / Math.SQRT2);
  const dirX = dx / radius;
  const dirY = dy / radius;
  const redShiftPx = preset.lateralCaRedPxAtEdge * radialNorm * safeIntensity;
  const blueShiftPx = preset.lateralCaBluePxAtEdge * radialNorm * safeIntensity;
  return {
    radialNorm,
    redShiftPx,
    blueShiftPx,
    totalSeparationPx: Math.abs(redShiftPx - blueShiftPx),
    redOffsetPxX: dirX * redShiftPx,
    redOffsetPxY: dirY * redShiftPx,
    blueOffsetPxX: dirX * blueShiftPx,
    blueOffsetPxY: dirY * blueShiftPx,
  };
}

/** Cos⁴ 물리 광학 비네팅 이득. 코너에서도 최소 0.35 하한을 유지한다. */
export function computeCos4VignetteGain(
  u: number,
  v: number,
  preset: CinematicLensPreset,
  intensity = 1.0,
): number {
  const radialNorm = Math.min(1, Math.hypot((u - 0.5) * 2, (v - 0.5) * 2) / Math.SQRT2);
  if (radialNorm === 0) {
    return 1.0;
  }
  const safeIntensity = clampFinite(intensity, 0, 1.0);
  const halfAngle = clampFinite(preset.vignetteFieldHalfAngleRad, 0.1, 1.25);
  const cosTheta = Math.cos(Math.atan(radialNorm * Math.tan(halfAngle)));
  const cos4 = cosTheta * cosTheta * cosTheta * cosTheta;
  const rawGain = 1 - clampFinite(preset.vignetteCos4Strength, 0, 1.2) * safeIntensity * (1 - cos4);
  return clampFinite(rawGain, Math.max(MIN_SAFE_CORNER_VIGNETTE_GAIN, preset.minCornerVignetteGain), 1.0);
}
