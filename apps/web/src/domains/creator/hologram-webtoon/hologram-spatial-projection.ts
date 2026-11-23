/**
 * 홀로그램 공간 웹툰(Holographic Multi-Plane WebXR) 투영 수학 엔진.
 *
 * 좌표계 규약:
 * - 화면 기준 평면(Zero-Parallax Plane): z = 0 mm
 * - +Z: 화면 앞쪽으로 돌출(이펙트 +42mm, 말풍선 +88mm)
 * - -Z: 화면 안쪽으로 후퇴(중경 -45mm, 배경 -120mm)
 * - +eyeXMm: 시점이 화면 오른쪽으로 이동 / +eyeYMm: 시점이 화면 아래쪽으로 이동
 * - eyeZMm: 뷰어와 기준 평면 사이 거리(기본 600mm)
 */

import {
  HOLOGRAM_MANIFEST_SCHEMA,
  HOLOGRAM_PLANE_ROLES,
  parseHologramManifest,
  serializeHologramManifest,
  type HologramManifestErrorCode,
  type HologramManifestLayer,
  type HologramManifestParseResult,
  type HologramPlaneRole,
  type HologramWebtoonManifest,
} from "./hologram-manifest-codec";

export {
  HOLOGRAM_MANIFEST_SCHEMA,
  HOLOGRAM_PLANE_ROLES,
  parseHologramManifest,
  serializeHologramManifest,
  type HologramManifestErrorCode,
  type HologramManifestLayer,
  type HologramManifestParseResult,
  type HologramPlaneRole,
  type HologramWebtoonManifest,
};

export type HologramViewMode = "off-axis" | "stereo-sbs" | "anaglyph" | "quilt-32";

export type HologramComfortStatus = "safe" | "caution" | "clamped";

export interface HologramLayerSpec {
  readonly id: string;
  readonly role: HologramPlaneRole;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly zMm: number;
  readonly opacity?: number;
  readonly visible?: boolean;
  readonly foilGain?: number;
}

export interface HologramViewerPose {
  readonly eyeXMm: number;
  readonly eyeYMm: number;
  readonly eyeZMm: number;
  readonly tiltXDeg?: number;
  readonly tiltYDeg?: number;
}

export interface HologramProjectionConfig {
  readonly screenWidthMm: number;
  readonly screenHeightMm: number;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly ipdMm: number;
  readonly maxComfortDisparityDeg: number;
  readonly holofoilIntensity: number;
  readonly depthOfFieldStrength: number;
  readonly nearPlaneMm: number;
  readonly farPlaneMm: number;
  readonly minEyeClearanceMm: number;
  readonly reducedMotion: boolean;
  readonly clampComfortZone: boolean;
}

export interface HologramOffAxisFrustum {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly top: number;
  readonly near: number;
  readonly far: number;
  readonly horizontalAsymmetry: number;
  readonly verticalAsymmetry: number;
}

export interface HologramLayerTransform {
  readonly layerId: string;
  readonly role: HologramPlaneRole;
  readonly zMm: number;
  readonly effectiveZMm: number;
  readonly translateX: number;
  readonly translateY: number;
  readonly scale: number;
  readonly rotateX: number;
  readonly rotateY: number;
  readonly prismaticShiftPx: number;
  readonly depthBlurPx: number;
  readonly angularDisparityDeg: number;
  readonly comfortClamped: boolean;
  readonly zIndex: number;
}

export interface HologramProjectionResult {
  readonly transforms: readonly HologramLayerTransform[];
  readonly frustum: HologramOffAxisFrustum;
  readonly rawMaxDisparityDeg: number;
  readonly effectiveMaxDisparityDeg: number;
  readonly comfortScale: number;
  readonly comfortStatus: HologramComfortStatus;
  readonly maxSafePopOutMm: number;
  readonly maxSafeRecessMm: number;
}

export interface StereoComfortEvaluation {
  readonly rawMaxDisparityDeg: number;
  readonly effectiveMaxDisparityDeg: number;
  readonly withinComfortZone: boolean;
  readonly comfortScale: number;
  readonly clamped: boolean;
}

export interface StereoEyePosesResult {
  readonly ipdMm: number;
  readonly leftEye: HologramViewerPose;
  readonly rightEye: HologramViewerPose;
  readonly screenVergenceDeg: number;
  readonly comfortLimitDeg: number;
  readonly maxSafePopOutMm: number;
  readonly maxSafeRecessMm: number;
  readonly comfortEvaluation: StereoComfortEvaluation | null;
}

export interface StereoEyePoseOptions {
  readonly maxComfortDisparityDeg?: number;
  readonly layers?: readonly HologramLayerSpec[];
}

export interface QuiltCameraVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface QuiltUvRect {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

export interface QuiltViewCamera {
  readonly viewIndex: number;
  readonly col: number;
  readonly row: number;
  readonly normalizedPosition: number;
  readonly azimuthDeg: number;
  readonly cameraPositionMm: QuiltCameraVector;
  readonly direction: QuiltCameraVector;
  readonly frustumShift: number;
  readonly uvRect: QuiltUvRect;
}

export interface QuiltCameraArrayOptions {
  readonly cameraDistanceMm?: number;
  readonly aspect?: number;
}

export interface QuiltCameraArray {
  readonly cols: number;
  readonly rows: number;
  readonly totalViews: number;
  readonly viewConeDeg: number;
  readonly cameraDistanceMm: number;
  readonly aspect: number;
  readonly views: readonly QuiltViewCamera[];
}

export const DEFAULT_HOLOGRAM_PLANE_DEPTHS_MM: Readonly<Record<HologramPlaneRole, number>> = {
  bg: -120,
  mid: -45,
  char: 0,
  fx: 42,
  balloon: 88,
};

export const DEFAULT_HOLOGRAM_VIEWER_POSE: HologramViewerPose = {
  eyeXMm: 0,
  eyeYMm: 0,
  eyeZMm: 600,
  tiltXDeg: 0,
  tiltYDeg: 0,
};

export const DEFAULT_HOLOGRAM_PROJECTION_CONFIG: HologramProjectionConfig = {
  screenWidthMm: 340,
  screenHeightMm: 220,
  viewportWidthPx: 640,
  viewportHeightPx: 420,
  ipdMm: 63,
  maxComfortDisparityDeg: 2.5,
  holofoilIntensity: 0.65,
  depthOfFieldStrength: 0.35,
  nearPlaneMm: 50,
  farPlaneMm: 2000,
  minEyeClearanceMm: 120,
  reducedMotion: false,
  clampComfortZone: true,
};

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const COMFORT_EPSILON = 1e-6;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function roundTo(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function resolveConfig(partial?: Partial<HologramProjectionConfig>): HologramProjectionConfig {
  return {
    screenWidthMm: Math.max(40, partial?.screenWidthMm ?? DEFAULT_HOLOGRAM_PROJECTION_CONFIG.screenWidthMm),
    screenHeightMm: Math.max(40, partial?.screenHeightMm ?? DEFAULT_HOLOGRAM_PROJECTION_CONFIG.screenHeightMm),
    viewportWidthPx: Math.max(80, partial?.viewportWidthPx ?? DEFAULT_HOLOGRAM_PROJECTION_CONFIG.viewportWidthPx),
    viewportHeightPx: Math.max(80, partial?.viewportHeightPx ?? DEFAULT_HOLOGRAM_PROJECTION_CONFIG.viewportHeightPx),
    ipdMm: clamp(partial?.ipdMm ?? DEFAULT_HOLOGRAM_PROJECTION_CONFIG.ipdMm, 40, 85),
    maxComfortDisparityDeg: clamp(
      partial?.maxComfortDisparityDeg ?? DEFAULT_HOLOGRAM_PROJECTION_CONFIG.maxComfortDisparityDeg,
      0.5,
      5,
    ),
    holofoilIntensity: clamp(
      partial?.holofoilIntensity ?? DEFAULT_HOLOGRAM_PROJECTION_CONFIG.holofoilIntensity,
      0,
      1,
    ),
    depthOfFieldStrength: clamp(
      partial?.depthOfFieldStrength ?? DEFAULT_HOLOGRAM_PROJECTION_CONFIG.depthOfFieldStrength,
      0,
      1,
    ),
    nearPlaneMm: Math.max(10, partial?.nearPlaneMm ?? DEFAULT_HOLOGRAM_PROJECTION_CONFIG.nearPlaneMm),
    farPlaneMm: Math.max(500, partial?.farPlaneMm ?? DEFAULT_HOLOGRAM_PROJECTION_CONFIG.farPlaneMm),
    minEyeClearanceMm: Math.max(80, partial?.minEyeClearanceMm ?? DEFAULT_HOLOGRAM_PROJECTION_CONFIG.minEyeClearanceMm),
    reducedMotion: partial?.reducedMotion ?? DEFAULT_HOLOGRAM_PROJECTION_CONFIG.reducedMotion,
    clampComfortZone: partial?.clampComfortZone ?? DEFAULT_HOLOGRAM_PROJECTION_CONFIG.clampComfortZone,
  };
}

/**
 * 기준 평면(z=0) 대비 특정 z 깊이 레이어의 부호 있는 양안 시차각(도)을 계산한다.
 */
export function computeSignedAngularDisparityDeg(
  zMm: number,
  eyeZMm: number,
  ipdMm = 63,
  minEyeClearanceMm = 120,
): number {
  const safeEyeZ = Math.max(minEyeClearanceMm, Number.isFinite(eyeZMm) ? eyeZMm : 600);
  const safeIpd = clamp(ipdMm, 40, 85);
  const halfIpd = safeIpd / 2;
  const layerDistance = Math.max(minEyeClearanceMm, safeEyeZ - (Number.isFinite(zMm) ? zMm : 0));
  const screenVergence = 2 * Math.atan2(halfIpd, safeEyeZ);
  const layerVergence = 2 * Math.atan2(halfIpd, layerDistance);
  return (layerVergence - screenVergence) * RAD_TO_DEG;
}

/**
 * 기준 평면(z=0) 대비 특정 z 깊이 레이어의 절대 양안 시차각(도)을 계산한다.
 */
export function computeLayerAngularDisparityDeg(
  zMm: number,
  eyeZMm: number,
  ipdMm = 63,
  minEyeClearanceMm = 120,
): number {
  return Math.abs(computeSignedAngularDisparityDeg(zMm, eyeZMm, ipdMm, minEyeClearanceMm));
}

/**
 * 눈피로 방지 시차 한계(기본 <= 2.5도)를 만족하는 최대 안전 돌출(+Z) 및 후퇴(-Z) 깊이를 산출한다.
 */
export function computeComfortDepthBoundsMm(
  eyeZMm: number,
  ipdMm = 63,
  maxComfortDisparityDeg = 2.5,
  minEyeClearanceMm = 120,
): { readonly maxSafePopOutMm: number; readonly maxSafeRecessMm: number } {
  const safeEyeZ = Math.max(minEyeClearanceMm, Number.isFinite(eyeZMm) ? eyeZMm : 600);
  const safeIpd = clamp(ipdMm, 40, 85);
  const halfIpd = safeIpd / 2;
  const limitRad = clamp(maxComfortDisparityDeg, 0.5, 5) * DEG_TO_RAD;
  const screenVergenceRad = 2 * Math.atan2(halfIpd, safeEyeZ);

  const maxVergenceRad = Math.min(Math.PI * 0.9, screenVergenceRad + limitRad);
  const minDistanceMm = halfIpd / Math.tan(maxVergenceRad / 2);
  const maxSafePopOutMm = Math.max(0, Math.min(safeEyeZ - minEyeClearanceMm, safeEyeZ - minDistanceMm));

  const minVergenceRad = screenVergenceRad - limitRad;
  const maxSafeRecessMm =
    minVergenceRad <= 1e-4
      ? -1000
      : -(halfIpd / Math.tan(minVergenceRad / 2) - safeEyeZ);

  return {
    maxSafePopOutMm: roundTo(maxSafePopOutMm, 3),
    maxSafeRecessMm: roundTo(maxSafeRecessMm, 3),
  };
}

/**
 * Kooima(2009) 일반화 투시 투영식에 따른 오프액시스(Off-Axis) 프러스텀 경계를 계산한다.
 */
export function computeOffAxisFrustum(
  viewerPose: HologramViewerPose,
  partialConfig?: Partial<HologramProjectionConfig>,
): HologramOffAxisFrustum {
  const config = resolveConfig(partialConfig);
  const safeEyeZ = Math.max(config.minEyeClearanceMm, Number.isFinite(viewerPose.eyeZMm) ? viewerPose.eyeZMm : 600);
  const eyeX = config.reducedMotion ? 0 : (Number.isFinite(viewerPose.eyeXMm) ? viewerPose.eyeXMm : 0);
  const eyeY = config.reducedMotion ? 0 : (Number.isFinite(viewerPose.eyeYMm) ? viewerPose.eyeYMm : 0);
  const halfW = config.screenWidthMm / 2;
  const halfH = config.screenHeightMm / 2;
  const ratio = config.nearPlaneMm / safeEyeZ;

  return {
    left: roundTo((-halfW - eyeX) * ratio, 4),
    right: roundTo((halfW - eyeX) * ratio, 4),
    bottom: roundTo((-halfH + eyeY) * ratio, 4),
    top: roundTo((halfH + eyeY) * ratio, 4),
    near: config.nearPlaneMm,
    far: config.farPlaneMm,
    horizontalAsymmetry: roundTo(-eyeX / safeEyeZ, 5),
    verticalAsymmetry: roundTo(eyeY / safeEyeZ, 5),
  };
}

function evaluateComfortScale(
  layers: readonly HologramLayerSpec[],
  eyeZMm: number,
  ipdMm: number,
  maxComfortDisparityDeg: number,
  minEyeClearanceMm: number,
): {
  readonly rawMaxDisparityDeg: number;
  readonly comfortScale: number;
  readonly maxSafePopOutMm: number;
  readonly maxSafeRecessMm: number;
} {
  const bounds = computeComfortDepthBoundsMm(eyeZMm, ipdMm, maxComfortDisparityDeg, minEyeClearanceMm);
  let rawMaxDisparityDeg = 0;
  let comfortScale = 1;

  for (const layer of layers) {
    const z = Number.isFinite(layer.zMm) ? layer.zMm : 0;
    const rawDisp = computeLayerAngularDisparityDeg(z, eyeZMm, ipdMm, minEyeClearanceMm);
    if (rawDisp > rawMaxDisparityDeg) {
      rawMaxDisparityDeg = rawDisp;
    }
    if (z > bounds.maxSafePopOutMm && z > 0) {
      const ratio = (bounds.maxSafePopOutMm * (1 - COMFORT_EPSILON)) / z;
      if (ratio < comfortScale) comfortScale = ratio;
    } else if (z < bounds.maxSafeRecessMm && z < 0) {
      const ratio = (bounds.maxSafeRecessMm * (1 - COMFORT_EPSILON)) / z;
      if (ratio < comfortScale) comfortScale = ratio;
    }
  }

  return {
    rawMaxDisparityDeg: roundTo(rawMaxDisparityDeg, 4),
    comfortScale: clamp(comfortScale, 0, 1),
    maxSafePopOutMm: bounds.maxSafePopOutMm,
    maxSafeRecessMm: bounds.maxSafeRecessMm,
  };
}

/**
 * 5-평면 홀로그램 웹툰 레이어별 오프액시스 3D 투영 변환 행렬 파라미터를 계산한다.
 */
export function computeHologramLayerTransforms(
  layers: readonly HologramLayerSpec[],
  viewerPose: HologramViewerPose,
  partialConfig?: Partial<HologramProjectionConfig>,
): HologramProjectionResult {
  const config = resolveConfig(partialConfig);
  const safeEyeZ = Math.max(config.minEyeClearanceMm, Number.isFinite(viewerPose.eyeZMm) ? viewerPose.eyeZMm : 600);
  const tiltYawOffsetMm = safeEyeZ * Math.tan(clamp(viewerPose.tiltYDeg ?? 0, -35, 35) * DEG_TO_RAD);
  const tiltPitchOffsetMm = safeEyeZ * Math.tan(clamp(viewerPose.tiltXDeg ?? 0, -35, 35) * DEG_TO_RAD);
  const effectiveEyeX = (Number.isFinite(viewerPose.eyeXMm) ? viewerPose.eyeXMm : 0) + tiltYawOffsetMm;
  const effectiveEyeY = (Number.isFinite(viewerPose.eyeYMm) ? viewerPose.eyeYMm : 0) + tiltPitchOffsetMm;

  const frustum = computeOffAxisFrustum(
    { eyeXMm: effectiveEyeX, eyeYMm: effectiveEyeY, eyeZMm: safeEyeZ },
    config,
  );

  const comfort = evaluateComfortScale(
    layers,
    safeEyeZ,
    config.ipdMm,
    config.maxComfortDisparityDeg,
    config.minEyeClearanceMm,
  );
  const appliedScale = config.clampComfortZone ? comfort.comfortScale : 1;

  const pxPerMmX = config.viewportWidthPx / config.screenWidthMm;
  const pxPerMmY = config.viewportHeightPx / config.screenHeightMm;
  const yawDeg = Math.atan2(effectiveEyeX, safeEyeZ) * RAD_TO_DEG;
  const pitchDeg = Math.atan2(effectiveEyeY, safeEyeZ) * RAD_TO_DEG;
  const incidenceRatio = Math.hypot(effectiveEyeX, effectiveEyeY) / safeEyeZ;

  const sortedIdsByDepth = [...layers]
    .sort((a, b) => a.zMm - b.zMm)
    .map((layer) => layer.id);

  let effectiveMaxDisparityDeg = 0;

  const transforms: HologramLayerTransform[] = layers.map((layer) => {
    const requestedZ = Number.isFinite(layer.zMm) ? layer.zMm : 0;
    const effectiveZ = roundTo(requestedZ * appliedScale, 3);
    const angularDisparityDeg = roundTo(
      computeLayerAngularDisparityDeg(effectiveZ, safeEyeZ, config.ipdMm, config.minEyeClearanceMm),
      4,
    );
    if (angularDisparityDeg > effectiveMaxDisparityDeg) {
      effectiveMaxDisparityDeg = angularDisparityDeg;
    }

    const comfortClamped = config.clampComfortZone && appliedScale < 1 && Math.abs(requestedZ) > 0;
    const zIndex = sortedIdsByDepth.indexOf(layer.id) + 1;

    if (config.reducedMotion) {
      return {
        layerId: layer.id,
        role: layer.role,
        zMm: requestedZ,
        effectiveZMm: effectiveZ,
        translateX: 0,
        translateY: 0,
        scale: 1,
        rotateX: 0,
        rotateY: 0,
        prismaticShiftPx: 0,
        depthBlurPx: 0,
        angularDisparityDeg,
        comfortClamped,
        zIndex,
      };
    }

    const distanceToLayer = Math.max(config.minEyeClearanceMm, safeEyeZ - effectiveZ);
    const shiftXMm = (-effectiveEyeX * effectiveZ) / distanceToLayer;
    const shiftYMm = (-effectiveEyeY * effectiveZ) / distanceToLayer;
    const translateX = roundTo(shiftXMm * pxPerMmX, 3);
    const translateY = roundTo(shiftYMm * pxPerMmY, 3);
    const scale = roundTo(safeEyeZ / distanceToLayer, 4);

    const depthMagnitude = Math.abs(effectiveZ) / safeEyeZ;
    const rotateY = roundTo(clamp(-yawDeg * (0.28 + depthMagnitude * 0.45), -14, 14), 3);
    const rotateX = roundTo(clamp(pitchDeg * (0.28 + depthMagnitude * 0.45), -12, 12), 3);

    const foilGain = clamp(layer.foilGain ?? 1, 0, 2);
    const foilDepthFactor = 0.25 + Math.abs(effectiveZ) / 140;
    const prismaticShiftPx =
      config.holofoilIntensity <= 0
        ? 0
        : roundTo(
            clamp((incidenceRatio * 9.5 + 0.65) * foilDepthFactor * config.holofoilIntensity * foilGain, 0, 14),
            3,
          );

    const roleBlurMultiplier = layer.role === "balloon" ? 0.22 : 1;
    const depthBlurPx =
      config.depthOfFieldStrength <= 0 || effectiveZ === 0
        ? 0
        : roundTo(
            clamp((Math.abs(effectiveZ) / distanceToLayer) * 14 * config.depthOfFieldStrength * roleBlurMultiplier, 0, 6),
            3,
          );

    return {
      layerId: layer.id,
      role: layer.role,
      zMm: requestedZ,
      effectiveZMm: effectiveZ,
      translateX,
      translateY,
      scale,
      rotateX,
      rotateY,
      prismaticShiftPx,
      depthBlurPx,
      angularDisparityDeg,
      comfortClamped,
      zIndex,
    };
  });

  const comfortStatus: HologramComfortStatus =
    comfort.comfortScale < 1 && config.clampComfortZone
      ? "clamped"
      : effectiveMaxDisparityDeg > config.maxComfortDisparityDeg * 0.8
        ? "caution"
        : "safe";

  return {
    transforms,
    frustum,
    rawMaxDisparityDeg: comfort.rawMaxDisparityDeg,
    effectiveMaxDisparityDeg: roundTo(effectiveMaxDisparityDeg, 4),
    comfortScale: roundTo(appliedScale, 4),
    comfortStatus,
    maxSafePopOutMm: comfort.maxSafePopOutMm,
    maxSafeRecessMm: comfort.maxSafeRecessMm,
  };
}

/**
 * WebXR 양안 스테레오(IPD 기본 63mm) 좌안·우안 뷰어 포즈와 눈피로 안전 시차(<= 2.5도) 가드를 계산한다.
 */
export function computeStereoEyePoses(
  viewerPose: HologramViewerPose,
  ipdMm = 63,
  options?: StereoEyePoseOptions,
): StereoEyePosesResult {
  const safeIpd = clamp(Number.isFinite(ipdMm) ? ipdMm : 63, 40, 85);
  const halfIpd = safeIpd / 2;
  const safeEyeZ = Math.max(120, Number.isFinite(viewerPose.eyeZMm) ? viewerPose.eyeZMm : 600);
  const comfortLimitDeg = clamp(options?.maxComfortDisparityDeg ?? 2.5, 0.5, 5);

  const leftEye: HologramViewerPose = {
    eyeXMm: roundTo(viewerPose.eyeXMm - halfIpd, 4),
    eyeYMm: viewerPose.eyeYMm,
    eyeZMm: safeEyeZ,
    tiltXDeg: viewerPose.tiltXDeg ?? 0,
    tiltYDeg: viewerPose.tiltYDeg ?? 0,
  };

  const rightEye: HologramViewerPose = {
    eyeXMm: roundTo(viewerPose.eyeXMm + halfIpd, 4),
    eyeYMm: viewerPose.eyeYMm,
    eyeZMm: safeEyeZ,
    tiltXDeg: viewerPose.tiltXDeg ?? 0,
    tiltYDeg: viewerPose.tiltYDeg ?? 0,
  };

  const screenVergenceDeg = roundTo(2 * Math.atan2(halfIpd, safeEyeZ) * RAD_TO_DEG, 4);
  const bounds = computeComfortDepthBoundsMm(safeEyeZ, safeIpd, comfortLimitDeg, 120);

  let comfortEvaluation: StereoComfortEvaluation | null = null;
  if (options?.layers) {
    const evalResult = evaluateComfortScale(options.layers, safeEyeZ, safeIpd, comfortLimitDeg, 120);
    let effectiveMax = 0;
    for (const layer of options.layers) {
      const disp = computeLayerAngularDisparityDeg(layer.zMm * evalResult.comfortScale, safeEyeZ, safeIpd, 120);
      if (disp > effectiveMax) effectiveMax = disp;
    }
    comfortEvaluation = {
      rawMaxDisparityDeg: evalResult.rawMaxDisparityDeg,
      effectiveMaxDisparityDeg: roundTo(effectiveMax, 4),
      withinComfortZone: evalResult.rawMaxDisparityDeg <= comfortLimitDeg + COMFORT_EPSILON,
      comfortScale: roundTo(evalResult.comfortScale, 4),
      clamped: evalResult.comfortScale < 1,
    };
  }

  return {
    ipdMm: safeIpd,
    leftEye,
    rightEye,
    screenVergenceDeg,
    comfortLimitDeg,
    maxSafePopOutMm: bounds.maxSafePopOutMm,
    maxSafeRecessMm: bounds.maxSafeRecessMm,
    comfortEvaluation,
  };
}

/**
 * Looking Glass 라이트필드 Quilt(기본 4×8 = 32뷰, 시야각 40도) 다중 시점 카메라 배열을 생성한다.
 */
export function generateQuiltViewCameraArray(
  cols = 4,
  rows = 8,
  viewConeDeg = 40,
  options?: QuiltCameraArrayOptions,
): QuiltCameraArray {
  const safeCols = Math.max(1, Math.min(16, Math.round(Number.isFinite(cols) ? cols : 4)));
  const safeRows = Math.max(1, Math.min(16, Math.round(Number.isFinite(rows) ? rows : 8)));
  const safeConeDeg = clamp(Number.isFinite(viewConeDeg) ? viewConeDeg : 40, 2, 120);
  const cameraDistanceMm = Math.max(200, Number.isFinite(options?.cameraDistanceMm) ? (options?.cameraDistanceMm ?? 600) : 600);
  const aspect = clamp(options?.aspect ?? 0.75, 0.25, 3);
  const totalViews = safeCols * safeRows;

  const views: QuiltViewCamera[] = [];

  for (let viewIndex = 0; viewIndex < totalViews; viewIndex += 1) {
    const normalizedPosition = totalViews === 1 ? 0.5 : viewIndex / (totalViews - 1);
    const azimuthDeg = (normalizedPosition - 0.5) * safeConeDeg;
    const azimuthRad = azimuthDeg * DEG_TO_RAD;
    const tanAzimuth = Math.tan(azimuthRad);
    const cameraXMm = cameraDistanceMm * tanAzimuth;
    const norm = Math.hypot(cameraXMm, cameraDistanceMm);

    const col = viewIndex % safeCols;
    const row = Math.floor(viewIndex / safeCols);

    views.push({
      viewIndex,
      col,
      row,
      normalizedPosition: roundTo(normalizedPosition, 5),
      azimuthDeg: roundTo(azimuthDeg, 4),
      cameraPositionMm: {
        x: roundTo(cameraXMm, 3),
        y: 0,
        z: roundTo(cameraDistanceMm, 3),
      },
      direction: {
        x: roundTo(-cameraXMm / norm, 5),
        y: 0,
        z: roundTo(-cameraDistanceMm / norm, 5),
      },
      frustumShift: roundTo(-tanAzimuth, 5),
      uvRect: {
        u0: roundTo(col / safeCols, 5),
        v0: roundTo(row / safeRows, 5),
        u1: roundTo((col + 1) / safeCols, 5),
        v1: roundTo((row + 1) / safeRows, 5),
      },
    });
  }

  return {
    cols: safeCols,
    rows: safeRows,
    totalViews,
    viewConeDeg: safeConeDeg,
    cameraDistanceMm,
    aspect,
    views,
  };
}
