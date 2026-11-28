/**
 * Wave 95 — 2D 웹툰 → WebXR·공간 디스플레이 입체 컷 극장:
 * 양안 폭주(Vergence) 광학, Percival/Sheard VAC 시각 피로 방지 압축기,
 * 말풍선·자막 복시(Diplopia) 고정 및 비대칭 오프액시스(Off-Axis) 스테레오 절두체 행렬 엔진.
 *
 * 광학 규약:
 * - 깊이(`depthMeters`)는 관찰자 눈 평면(`z = 0`)에서 전방으로의 양(+)의 거리(m)다.
 * - 양안 각시차(`disparityArcmin`)는 수렴 스크린(`convergenceDepthMeters`)에서 정확히 `0`,
 *   스크린 뒤(비교차 시차 / uncrossed)는 양(`+`), 스크린 앞(교차 돌출 시차 / crossed)은 음(`-`)이다.
 * - 오프액시스 절두체는 수평 이동만으로 양안 시점을 보정해 수직 키스톤 왜곡을 `0°`로 유지한다.
 */

export type SpatialViewerPresetId =
  | "vision-spatial-window"
  | "webxr-curved-theater"
  | "mobile-parallax-window"
  | "desktop-stereo-preview";

/** 시각 피로(VAC) 허용 등급 (`calm-strict`: ±30', `standard-theater`: ±60'). */
export type StereoComfortTier = "calm-strict" | "standard-theater";

export type SpatialLayerRole =
  | "sky-backdrop"
  | "far-background"
  | "midground"
  | "character"
  | "foreground-prop"
  | "fx-popout"
  | "speech-balloon"
  | "caption";

export type StereoClipDepthRange = "neg-one-to-one" | "zero-to-one";

export const DEFAULT_IPD_METERS = 0.063;
export const MIN_IPD_METERS = 0.052;
export const MAX_IPD_METERS = 0.075;
export const MIN_CONVERGENCE_DEPTH_METERS = 1.5;
export const MAX_CONVERGENCE_DEPTH_METERS = 4.0;
export const DEFAULT_DIALOGUE_MAX_ARCMIN = 15;

export const COMFORT_TIER_LIMITS_ARCMIN: Readonly<
  Record<StereoComfortTier, { readonly maxPopOutArcmin: number; readonly maxDepthArcmin: number }>
> = {
  "calm-strict": { maxPopOutArcmin: 30, maxDepthArcmin: 30 },
  "standard-theater": { maxPopOutArcmin: 60, maxDepthArcmin: 60 },
};

const RAD_TO_ARCMIN = (180 * 60) / Math.PI;
const ARCMIN_TO_RAD = Math.PI / (180 * 60);
const RAD_TO_DEG = 180 / Math.PI;
const MIN_POSITIVE_DEPTH_METERS = 0.05;
const PRACTICAL_FAR_DEPTH_MULTIPLIER = 16;
const MAX_PRACTICAL_FAR_DEPTH_METERS = 60;
const COMFORT_BOUND_EPSILON_ARCMIN = 1e-4;

export interface SpatialOpticsConfig {
  readonly presetId: SpatialViewerPresetId;
  readonly labelKo: string;
  readonly ipdMeters: number;
  readonly convergenceDepthMeters: number;
  readonly viewportWidthMeters: number;
  readonly viewportHeightMeters: number;
  readonly viewportPixelWidth: number;
  readonly viewportPixelHeight: number;
  readonly comfortTier: StereoComfortTier;
  readonly maxPopOutArcmin: number;
  readonly maxDepthArcmin: number;
  readonly dialogueMaxArcmin: number;
  readonly maxHeadOffsetMeters: number;
  readonly theaterCurvatureRadiusMeters: number | null;
}

export type SpatialOpticsOverrides = Partial<Omit<SpatialOpticsConfig, "presetId" | "labelKo">>;

export interface SpatialDepthLayerInput {
  readonly layerId: string;
  readonly labelKo?: string;
  readonly role: SpatialLayerRole;
  readonly rawDepthMeters: number;
  readonly zOrder?: number;
  readonly overscanMarginPx?: number;
  readonly opacity?: number;
}

export interface CompressedSpatialDepthLayer {
  readonly layerId: string;
  readonly labelKo: string;
  readonly role: SpatialLayerRole;
  readonly depthRankBackToFront: number;
  readonly rawDepthMeters: number;
  readonly rawDisparityArcmin: number;
  readonly compressedDepthMeters: number;
  readonly compressedDisparityArcmin: number;
  /** 원근 각크기 보존 배율 (`compressedDepthMeters / convergenceDepthMeters`). */
  readonly sizeScale: number;
  /** 초점-폭주 충돌량(디옵터, `|1/z - 1/z_c|`). */
  readonly vacConflictDiopters: number;
  readonly wasVacClamped: boolean;
  readonly dialogueDiplopiaGuarded: boolean;
  readonly overscanMarginPx: number;
  readonly opacity: number;
}

export interface ComfortZoneCompressionResult {
  readonly presetId: SpatialViewerPresetId;
  readonly comfortTier: StereoComfortTier;
  readonly effectiveIpdMeters: number;
  readonly convergenceDepthMeters: number;
  readonly appliedMaxPopOutArcmin: number;
  readonly appliedMaxDepthArcmin: number;
  readonly appliedDialogueMaxArcmin: number;
  readonly layers: readonly CompressedSpatialDepthLayer[];
  readonly maxCrossedDisparityArcmin: number;
  readonly maxUncrossedDisparityArcmin: number;
  readonly maxDialogueAbsDisparityArcmin: number;
  readonly maxVacConflictDiopters: number;
  readonly strictDepthMonotonic: boolean;
  readonly allWithinVacComfortBounds: boolean;
  readonly dialogueDiplopiaSafe: boolean;
}

export interface OffAxisFrustumBounds {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly top: number;
  readonly near: number;
  readonly far: number;
}

export interface OffAxisStereoProjectionPair {
  readonly depthRange: StereoClipDepthRange;
  readonly ipdMeters: number;
  readonly convergenceDepthMeters: number;
  readonly nearMeters: number;
  readonly farMeters: number;
  readonly leftEyeOffsetMeters: number;
  readonly rightEyeOffsetMeters: number;
  readonly leftFrustum: OffAxisFrustumBounds;
  readonly rightFrustum: OffAxisFrustumBounds;
  readonly leftMatrix: readonly number[];
  readonly rightMatrix: readonly number[];
  readonly horizontalFovDeg: number;
  readonly verticalFovDeg: number;
  readonly asymmetricShearAbs: number;
  readonly verticalKeystoneDistortionDeg: 0;
}

/** 4종 공간·입체 시청 프리셋 표준 카탈로그. */
export const SPATIAL_VIEWER_PRESETS: Readonly<Record<SpatialViewerPresetId, SpatialOpticsConfig>> = {
  "vision-spatial-window": {
    presetId: "vision-spatial-window",
    labelKo: "공간 윈도우 (Vision 디스플레이)",
    ipdMeters: DEFAULT_IPD_METERS,
    convergenceDepthMeters: 2.2,
    viewportWidthMeters: 1.44,
    viewportHeightMeters: 1.08,
    viewportPixelWidth: 2048,
    viewportPixelHeight: 1536,
    comfortTier: "calm-strict",
    maxPopOutArcmin: 30,
    maxDepthArcmin: 30,
    dialogueMaxArcmin: DEFAULT_DIALOGUE_MAX_ARCMIN,
    maxHeadOffsetMeters: 0.18,
    theaterCurvatureRadiusMeters: null,
  },
  "webxr-curved-theater": {
    presetId: "webxr-curved-theater",
    labelKo: "WebXR 커브드 입체 극장",
    ipdMeters: DEFAULT_IPD_METERS,
    convergenceDepthMeters: 3.0,
    viewportWidthMeters: 3.2,
    viewportHeightMeters: 1.8,
    viewportPixelWidth: 2048,
    viewportPixelHeight: 1152,
    comfortTier: "standard-theater",
    maxPopOutArcmin: 60,
    maxDepthArcmin: 60,
    dialogueMaxArcmin: DEFAULT_DIALOGUE_MAX_ARCMIN,
    maxHeadOffsetMeters: 0.25,
    theaterCurvatureRadiusMeters: 3.0,
  },
  "mobile-parallax-window": {
    presetId: "mobile-parallax-window",
    labelKo: "모바일 시차 윈도우",
    ipdMeters: DEFAULT_IPD_METERS,
    convergenceDepthMeters: 1.5,
    viewportWidthMeters: 0.62,
    viewportHeightMeters: 1.1,
    viewportPixelWidth: 1080,
    viewportPixelHeight: 1920,
    comfortTier: "calm-strict",
    maxPopOutArcmin: 30,
    maxDepthArcmin: 30,
    dialogueMaxArcmin: DEFAULT_DIALOGUE_MAX_ARCMIN,
    maxHeadOffsetMeters: 0.08,
    theaterCurvatureRadiusMeters: null,
  },
  "desktop-stereo-preview": {
    presetId: "desktop-stereo-preview",
    labelKo: "데스크톱 입체 미리보기",
    ipdMeters: DEFAULT_IPD_METERS,
    convergenceDepthMeters: 2.0,
    viewportWidthMeters: 1.28,
    viewportHeightMeters: 0.72,
    viewportPixelWidth: 1920,
    viewportPixelHeight: 1080,
    comfortTier: "standard-theater",
    maxPopOutArcmin: 60,
    maxDepthArcmin: 60,
    dialogueMaxArcmin: DEFAULT_DIALOGUE_MAX_ARCMIN,
    maxHeadOffsetMeters: 0.1,
    theaterCurvatureRadiusMeters: null,
  },
};

function clampFinite(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value === 0 ? 0 : value;
}

function normalizeZero(value: number): number {
  return Object.is(value, -0) || value === 0 ? 0 : value;
}

function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite positive number (got ${String(value)})`);
  }
}

/** 말풍선·자막처럼 복시 방지 고정이 필수인 대사 레이어인지 판정한다. */
export function isDialogueSpatialRole(role: SpatialLayerRole): boolean {
  return role === "speech-balloon" || role === "caption";
}

/** 프리셋 기반 광학 구성을 생성하고 IPD(`0.052..0.075m`)와 수렴 거리(`1.5..4.0m`)를 안전 보정한다. */
export function createSpatialOpticsConfig(
  presetId: SpatialViewerPresetId,
  overrides?: SpatialOpticsOverrides,
): SpatialOpticsConfig {
  const base = SPATIAL_VIEWER_PRESETS[presetId];
  const comfortTier = overrides?.comfortTier ?? base.comfortTier;
  const tierLimits = COMFORT_TIER_LIMITS_ARCMIN[comfortTier];
  const rawIpd = overrides?.ipdMeters ?? base.ipdMeters;
  const ipdMeters =
    rawIpd === 0 ? 0 : clampFinite(rawIpd, MIN_IPD_METERS, MAX_IPD_METERS, base.ipdMeters);
  const convergenceDepthMeters = clampFinite(
    overrides?.convergenceDepthMeters ?? base.convergenceDepthMeters,
    MIN_CONVERGENCE_DEPTH_METERS,
    MAX_CONVERGENCE_DEPTH_METERS,
    base.convergenceDepthMeters,
  );
  const stdMax = COMFORT_TIER_LIMITS_ARCMIN["standard-theater"];
  const maxPopOutArcmin = clampFinite(
    overrides?.maxPopOutArcmin ?? tierLimits.maxPopOutArcmin,
    1,
    stdMax.maxPopOutArcmin,
    tierLimits.maxPopOutArcmin,
  );
  const maxDepthArcmin = clampFinite(
    overrides?.maxDepthArcmin ?? tierLimits.maxDepthArcmin,
    1,
    stdMax.maxDepthArcmin,
    tierLimits.maxDepthArcmin,
  );
  const dlgCap = Math.min(DEFAULT_DIALOGUE_MAX_ARCMIN, maxPopOutArcmin, maxDepthArcmin);
  const curvature =
    overrides?.theaterCurvatureRadiusMeters !== undefined
      ? overrides.theaterCurvatureRadiusMeters === null
        ? null
        : clampFinite(overrides.theaterCurvatureRadiusMeters, 1.2, 10.0, convergenceDepthMeters)
      : base.theaterCurvatureRadiusMeters;

  return {
    presetId,
    labelKo: base.labelKo,
    ipdMeters,
    convergenceDepthMeters,
    viewportWidthMeters: clampFinite(overrides?.viewportWidthMeters ?? base.viewportWidthMeters, 0.15, 12.0, base.viewportWidthMeters),
    viewportHeightMeters: clampFinite(overrides?.viewportHeightMeters ?? base.viewportHeightMeters, 0.15, 8.0, base.viewportHeightMeters),
    viewportPixelWidth: Math.round(clampFinite(overrides?.viewportPixelWidth ?? base.viewportPixelWidth, 320, 8192, base.viewportPixelWidth)),
    viewportPixelHeight: Math.round(clampFinite(overrides?.viewportPixelHeight ?? base.viewportPixelHeight, 320, 8192, base.viewportPixelHeight)),
    comfortTier,
    maxPopOutArcmin,
    maxDepthArcmin,
    dialogueMaxArcmin: clampFinite(overrides?.dialogueMaxArcmin ?? DEFAULT_DIALOGUE_MAX_ARCMIN, 1, dlgCap, dlgCap),
    maxHeadOffsetMeters: clampFinite(overrides?.maxHeadOffsetMeters ?? base.maxHeadOffsetMeters, 0, 1.0, base.maxHeadOffsetMeters),
    theaterCurvatureRadiusMeters: curvature,
  };
}

/**
 * 양안 폭주 각시차(arcmin)를 정확한 삼각 광학식으로 계산한다.
 * 수렴 스크린(`layerDepthMeters === convergenceDepthMeters`)은 `0`, 뒤(원경)는 `+`, 앞(돌출)은 `-`다.
 */
export function computeBinocularDisparityArcmin(
  layerDepthMeters: number,
  convergenceDepthMeters: number,
  ipdMeters: number = DEFAULT_IPD_METERS,
): number {
  assertPositiveFinite("layerDepthMeters", layerDepthMeters);
  assertPositiveFinite("convergenceDepthMeters", convergenceDepthMeters);
  if (!Number.isFinite(ipdMeters) || ipdMeters < 0) {
    throw new RangeError(`ipdMeters must be a finite non-negative number (got ${String(ipdMeters)})`);
  }
  if (ipdMeters === 0 || layerDepthMeters === convergenceDepthMeters) return 0;
  const halfIpd = ipdMeters * 0.5;
  const vergenceConv = 2 * Math.atan(halfIpd / convergenceDepthMeters);
  const vergenceLayer = 2 * Math.atan(halfIpd / layerDepthMeters);
  return normalizeZero((vergenceConv - vergenceLayer) * RAD_TO_ARCMIN);
}

/** 목표 양안 각시차(arcmin)에 대응하는 물리적 깊이(m)를 역산한다. */
export function depthMetersFromDisparityArcmin(
  disparityArcmin: number,
  convergenceDepthMeters: number,
  ipdMeters: number = DEFAULT_IPD_METERS,
): number {
  if (!Number.isFinite(disparityArcmin)) {
    throw new RangeError(`disparityArcmin must be finite (got ${String(disparityArcmin)})`);
  }
  assertPositiveFinite("convergenceDepthMeters", convergenceDepthMeters);
  if (!Number.isFinite(ipdMeters) || ipdMeters < 0) {
    throw new RangeError(`ipdMeters must be a finite non-negative number (got ${String(ipdMeters)})`);
  }
  if (ipdMeters === 0 || disparityArcmin === 0) return convergenceDepthMeters;

  const halfIpd = ipdMeters * 0.5;
  const convRad = 2 * Math.atan(halfIpd / convergenceDepthMeters);
  const practicalFar = Math.min(MAX_PRACTICAL_FAR_DEPTH_METERS, convergenceDepthMeters * PRACTICAL_FAR_DEPTH_MULTIPLIER);
  const minRad = 2 * Math.atan(halfIpd / practicalFar);
  const maxRad = 2 * Math.atan(halfIpd / MIN_POSITIVE_DEPTH_METERS);
  const clampedRad = clampFinite(convRad - disparityArcmin * ARCMIN_TO_RAD, minRad, maxRad, convRad);
  const halfTan = Math.tan(clampedRad * 0.5);
  return halfTan <= 0 ? practicalFar : halfIpd / halfTan;
}

function softCompressDisparity(rawDisparityArcmin: number, limitArcmin: number): number {
  if (rawDisparityArcmin === 0 || limitArcmin <= 0) return 0;
  const absRaw = Math.abs(rawDisparityArcmin);
  const mag = (limitArcmin * absRaw) / (limitArcmin + absRaw);
  return normalizeZero(rawDisparityArcmin > 0 ? mag : -mag);
}

interface BoundedPavBlock {
  start: number;
  end: number;
  sumInit: number;
  minLower: number;
  maxUpper: number;
  value: number;
}

/** 경계 제약과 엄격한 내림차순(`d[i] - d[i+1] >= sep`)을 동시 충족하는 O(n) Bounded PAV 투영. */
function projectBoundedStrictlyDecreasing(
  targets: readonly number[],
  lowers: readonly number[],
  uppers: readonly number[],
  sep: number,
): number[] {
  const n = targets.length;
  if (n === 0) return [];
  const stack: BoundedPavBlock[] = [];

  for (let i = 0; i < n; i += 1) {
    const shift = i * sep;
    const initY = (targets[i] ?? 0) + shift;
    const loY = (lowers[i] ?? 0) + shift;
    const hiY = (uppers[i] ?? 0) + shift;
    stack.push({ start: i, end: i, sumInit: initY, minLower: loY, maxUpper: hiY, value: clampFinite(initY, loY, hiY, loY) });

    while (stack.length >= 2) {
      const curr = stack[stack.length - 1];
      const prev = stack[stack.length - 2];
      if (!curr || !prev || prev.value >= curr.value) break;
      stack.pop();
      prev.end = curr.end;
      prev.sumInit += curr.sumInit;
      prev.minLower = Math.max(prev.minLower, curr.minLower);
      prev.maxUpper = Math.min(prev.maxUpper, curr.maxUpper);
      const mean = prev.sumInit / (prev.end - prev.start + 1);
      prev.value = clampFinite(mean, prev.minLower, Math.max(prev.minLower, prev.maxUpper), prev.minLower);
    }
  }

  const out = new Array<number>(n).fill(0);
  for (let b = 0; b < stack.length; b += 1) {
    const blk = stack[b];
    if (!blk) continue;
    for (let i = blk.start; i <= blk.end; i += 1) out[i] = normalizeZero(blk.value - i * sep);
  }
  return out;
}

/**
 * 모든 컷 레이어를 Percival/Sheard VAC 편안함 구간 안으로 압축하고,
 * 엄격한 배경→전경 깊이 단조성, 2D 각크기 보존(`sizeScale = depth / convergenceDepth`),
 * 말풍선·자막 `±15'` 복시 방지 고정을 동시에 보장한다.
 */
export function compressLayersIntoComfortZone(
  layers: readonly SpatialDepthLayerInput[],
  opticsConfig: SpatialOpticsConfig,
): ComfortZoneCompressionResult {
  const zc = opticsConfig.convergenceDepthMeters;
  const ipd = opticsConfig.ipdMeters;

  const indexed = layers
    .map((layer, originalIndex) => ({
      layer,
      originalIndex,
      safeRawDepth: clampFinite(layer.rawDepthMeters, MIN_POSITIVE_DEPTH_METERS, 500, zc),
    }))
    .sort((a, b) => {
      if (b.safeRawDepth !== a.safeRawDepth) return b.safeRawDepth - a.safeRawDepth;
      const zDiff = (a.layer.zOrder ?? 0) - (b.layer.zOrder ?? 0);
      return zDiff !== 0 ? zDiff : a.originalIndex - b.originalIndex;
    });

  if (ipd === 0) {
    const flatLayers: CompressedSpatialDepthLayer[] = indexed.map((entry, rank) => ({
      layerId: entry.layer.layerId,
      labelKo: entry.layer.labelKo ?? entry.layer.layerId,
      role: entry.layer.role,
      depthRankBackToFront: rank,
      rawDepthMeters: entry.safeRawDepth,
      rawDisparityArcmin: 0,
      compressedDepthMeters: zc,
      compressedDisparityArcmin: 0,
      sizeScale: 1,
      vacConflictDiopters: 0,
      wasVacClamped: entry.safeRawDepth !== zc,
      dialogueDiplopiaGuarded: isDialogueSpatialRole(entry.layer.role),
      overscanMarginPx: Math.max(0, entry.layer.overscanMarginPx ?? 0),
      opacity: clampFinite(entry.layer.opacity ?? 1, 0, 1, 1),
    }));
    return {
      presetId: opticsConfig.presetId,
      comfortTier: opticsConfig.comfortTier,
      effectiveIpdMeters: 0,
      convergenceDepthMeters: zc,
      appliedMaxPopOutArcmin: opticsConfig.maxPopOutArcmin,
      appliedMaxDepthArcmin: opticsConfig.maxDepthArcmin,
      appliedDialogueMaxArcmin: opticsConfig.dialogueMaxArcmin,
      layers: flatLayers,
      maxCrossedDisparityArcmin: 0,
      maxUncrossedDisparityArcmin: 0,
      maxDialogueAbsDisparityArcmin: 0,
      maxVacConflictDiopters: 0,
      strictDepthMonotonic: true,
      allWithinVacComfortBounds: true,
      dialogueDiplopiaSafe: true,
    };
  }

  const practicalFar = Math.min(MAX_PRACTICAL_FAR_DEPTH_METERS, zc * PRACTICAL_FAR_DEPTH_MULTIPLIER);
  const farCap = computeBinocularDisparityArcmin(practicalFar, zc, ipd);
  const effMaxDepth = Math.max(1, Math.min(opticsConfig.maxDepthArcmin, farCap) - COMFORT_BOUND_EPSILON_ARCMIN);
  const effMaxPopOut = Math.max(1, opticsConfig.maxPopOutArcmin - COMFORT_BOUND_EPSILON_ARCMIN);
  const effDialogue = Math.max(
    0.5,
    Math.min(opticsConfig.dialogueMaxArcmin, effMaxDepth, effMaxPopOut) - COMFORT_BOUND_EPSILON_ARCMIN,
  );

  const rawDisps: number[] = [];
  const targets: number[] = [];
  const lowers: number[] = [];
  const uppers: number[] = [];

  for (let i = 0; i < indexed.length; i += 1) {
    const item = indexed[i];
    if (!item) continue;
    const rawDisp = computeBinocularDisparityArcmin(item.safeRawDepth, zc, ipd);
    rawDisps.push(rawDisp);
    if (isDialogueSpatialRole(item.layer.role)) {
      targets.push(softCompressDisparity(rawDisp, effDialogue));
      lowers.push(-effDialogue);
      uppers.push(effDialogue);
    } else {
      targets.push(softCompressDisparity(rawDisp, rawDisp >= 0 ? effMaxDepth : effMaxPopOut));
      lowers.push(-effMaxPopOut);
      uppers.push(effMaxDepth);
    }
  }

  const sep = indexed.length <= 1 ? 0 : Math.min(0.4, effDialogue / Math.max(2, indexed.length));
  const projected = projectBoundedStrictlyDecreasing(targets, lowers, uppers, sep);

  let maxCrossed = 0;
  let maxUncrossed = 0;
  let maxDialogueAbs = 0;
  let maxVacDiopters = 0;
  let strictDepthMonotonic = true;
  let allWithinBounds = true;
  let dialogueDiplopiaSafe = true;
  const compressedLayers: CompressedSpatialDepthLayer[] = [];

  for (let i = 0; i < indexed.length; i += 1) {
    const item = indexed[i];
    if (!item) continue;
    const rawDisp = rawDisps[i] ?? 0;
    const compressedDepth = depthMetersFromDisparityArcmin(projected[i] ?? 0, zc, ipd);
    const actualDisp = computeBinocularDisparityArcmin(compressedDepth, zc, ipd);
    const isDialogue = isDialogueSpatialRole(item.layer.role);
    const vacDiopters = Math.abs(1 / compressedDepth - 1 / zc);

    if (actualDisp < 0) maxCrossed = Math.max(maxCrossed, Math.abs(actualDisp));
    if (actualDisp > 0) maxUncrossed = Math.max(maxUncrossed, actualDisp);
    if (isDialogue) {
      maxDialogueAbs = Math.max(maxDialogueAbs, Math.abs(actualDisp));
      if (Math.abs(actualDisp) > opticsConfig.dialogueMaxArcmin + 1e-6) dialogueDiplopiaSafe = false;
    }
    if (actualDisp < -opticsConfig.maxPopOutArcmin - 1e-6 || actualDisp > opticsConfig.maxDepthArcmin + 1e-6) {
      allWithinBounds = false;
    }
    maxVacDiopters = Math.max(maxVacDiopters, vacDiopters);
    const prev = i > 0 ? compressedLayers[i - 1] : undefined;
    if (prev && !(prev.compressedDepthMeters > compressedDepth)) strictDepthMonotonic = false;

    const wasVacClamped =
      Math.abs(actualDisp - rawDisp) > 0.05 ||
      rawDisp > opticsConfig.maxDepthArcmin ||
      rawDisp < -opticsConfig.maxPopOutArcmin ||
      (isDialogue && Math.abs(rawDisp) > opticsConfig.dialogueMaxArcmin);

    compressedLayers.push({
      layerId: item.layer.layerId,
      labelKo: item.layer.labelKo ?? item.layer.layerId,
      role: item.layer.role,
      depthRankBackToFront: i,
      rawDepthMeters: item.safeRawDepth,
      rawDisparityArcmin: rawDisp,
      compressedDepthMeters: compressedDepth,
      compressedDisparityArcmin: actualDisp,
      sizeScale: compressedDepth / zc,
      vacConflictDiopters: vacDiopters,
      wasVacClamped,
      dialogueDiplopiaGuarded: isDialogue,
      overscanMarginPx: Math.max(0, item.layer.overscanMarginPx ?? 0),
      opacity: clampFinite(item.layer.opacity ?? 1, 0, 1, 1),
    });
  }

  return {
    presetId: opticsConfig.presetId,
    comfortTier: opticsConfig.comfortTier,
    effectiveIpdMeters: ipd,
    convergenceDepthMeters: zc,
    appliedMaxPopOutArcmin: opticsConfig.maxPopOutArcmin,
    appliedMaxDepthArcmin: opticsConfig.maxDepthArcmin,
    appliedDialogueMaxArcmin: opticsConfig.dialogueMaxArcmin,
    layers: compressedLayers,
    maxCrossedDisparityArcmin: maxCrossed,
    maxUncrossedDisparityArcmin: maxUncrossed,
    maxDialogueAbsDisparityArcmin: maxDialogueAbs,
    maxVacConflictDiopters: maxVacDiopters,
    strictDepthMonotonic,
    allWithinVacComfortBounds: allWithinBounds,
    dialogueDiplopiaSafe,
  };
}

function buildFrustumColumnMajorMatrix(
  frustum: OffAxisFrustumBounds,
  depthRange: StereoClipDepthRange,
): readonly number[] {
  const { left, right, bottom, top, near, far } = frustum;
  const invW = 1 / (right - left);
  const invH = 1 / (top - bottom);
  const invD = 1 / (far - near);
  const m10 = depthRange === "zero-to-one" ? -far * invD : -(far + near) * invD;
  const m14 = depthRange === "zero-to-one" ? -(far * near) * invD : -(2 * far * near) * invD;
  return [
    2 * near * invW, 0, 0, 0,
    0, 2 * near * invH, 0, 0,
    normalizeZero((right + left) * invW), normalizeZero((top + bottom) * invH), m10, -1,
    0, 0, m14, 0,
  ];
}

/**
 * 좌·우안 비대칭 오프액시스(Off-Axis) 4×4 열 우선 투영 행렬 쌍을 계산한다.
 * 수직 키스톤 왜곡 `0°`(`m[9] === 0`), 동일 수직 스케일(`m[5]`), 대칭 수평 전단(`mLeft[8] === -mRight[8]`).
 */
export function computeOffAxisStereoProjectionPair(
  opticsConfig: SpatialOpticsConfig,
  nearMeters: number = 0.15,
  farMeters: number = 50.0,
  depthRange: StereoClipDepthRange = "neg-one-to-one",
): OffAxisStereoProjectionPair {
  assertPositiveFinite("nearMeters", nearMeters);
  if (!Number.isFinite(farMeters) || farMeters <= nearMeters) {
    throw new RangeError(`farMeters (${String(farMeters)}) must be finite and greater than nearMeters (${String(nearMeters)})`);
  }
  const zc = opticsConfig.convergenceDepthMeters;
  const halfW = opticsConfig.viewportWidthMeters * 0.5;
  const halfH = opticsConfig.viewportHeightMeters * 0.5;
  const halfIpd = opticsConfig.ipdMeters * 0.5;
  const nearScale = nearMeters / zc;
  const leftEyeOffsetMeters = normalizeZero(-halfIpd);
  const rightEyeOffsetMeters = normalizeZero(halfIpd);

  const leftFrustum: OffAxisFrustumBounds = {
    left: (-halfW - leftEyeOffsetMeters) * nearScale,
    right: (halfW - leftEyeOffsetMeters) * nearScale,
    bottom: -halfH * nearScale,
    top: halfH * nearScale,
    near: nearMeters,
    far: farMeters,
  };
  const rightFrustum: OffAxisFrustumBounds = {
    left: (-halfW - rightEyeOffsetMeters) * nearScale,
    right: (halfW - rightEyeOffsetMeters) * nearScale,
    bottom: -halfH * nearScale,
    top: halfH * nearScale,
    near: nearMeters,
    far: farMeters,
  };
  const leftMatrix = buildFrustumColumnMajorMatrix(leftFrustum, depthRange);
  const rightMatrix = buildFrustumColumnMajorMatrix(rightFrustum, depthRange);

  return {
    depthRange,
    ipdMeters: opticsConfig.ipdMeters,
    convergenceDepthMeters: zc,
    nearMeters,
    farMeters,
    leftEyeOffsetMeters,
    rightEyeOffsetMeters,
    leftFrustum,
    rightFrustum,
    leftMatrix,
    rightMatrix,
    horizontalFovDeg: 2 * Math.atan(halfW / zc) * RAD_TO_DEG,
    verticalFovDeg: 2 * Math.atan(halfH / zc) * RAD_TO_DEG,
    asymmetricShearAbs: Math.abs(leftMatrix[8] ?? 0),
    verticalKeystoneDistortionDeg: 0,
  };
}
