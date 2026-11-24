/**
 * Wave 38F — 얼굴 전용 Face Shadow SDF 셰이더 평가기 + OKLCH 난색/보색 컬러 섀도우 틴트
 * 및 2D G펜급 가변 두께 NPR 외곽선(Tapered Contour) 계산기.
 */

import { clamp3d, type OklchColor } from "./perfect-3d-contact-ik";

export type FaceShadowTintMode = "warm-subsurface" | "complementary-cool";

export interface FaceShadowSdfInput {
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly shadowSoftness?: number;
  readonly tintMode?: FaceShadowTintMode;
  readonly skinBaseOklch?: OklchColor;
  readonly keyLightHueDeg?: number;
  readonly gridSize?: number;
}

export interface FaceShadowTintPalette {
  readonly mode: FaceShadowTintMode;
  readonly litSkinOklch: OklchColor;
  readonly shadowTintOklch: OklchColor;
  readonly sssTerminatorOklch: OklchColor;
  readonly rimHighlightOklch: OklchColor;
}

export interface FaceShadowSdfResult {
  readonly gridSize: number;
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly litMask: Float32Array;
  readonly faceAlpha: Float32Array;
  readonly sssTerminatorMask: Float32Array;
  readonly litRatio: number;
  readonly leftLitRatio: number;
  readonly rightLitRatio: number;
  readonly noseCheekArtifactScore: number;
  readonly palette: FaceShadowTintPalette;
}

export type ContourEdgeCategory =
  | "silhouette"
  | "depth-break"
  | "material-boundary"
  | "normal-crease"
  | "inner-detail";

export interface TaperedContourSampleInput {
  readonly t: number;
  readonly x: number;
  readonly y: number;
  readonly category: ContourEdgeCategory;
  readonly normalDiscontinuity: number;
  readonly depthDelta: number;
  readonly materialBreak: boolean;
  readonly lightFacing: number;
  readonly distanceFromCameraM: number;
}

export interface TaperedContourConfig {
  readonly baseWidthPx: number;
  readonly taperPower: number;
  readonly shadowThickening: number;
  readonly jitterAmplitudePx: number;
  readonly jitterFrequency: number;
  readonly referenceDistanceM: number;
}

export interface TaperedContourEvaluatedPoint {
  readonly t: number;
  readonly x: number;
  readonly y: number;
  readonly jitteredX: number;
  readonly jitteredY: number;
  readonly widthPx: number;
  readonly opacity: number;
  readonly category: ContourEdgeCategory;
  readonly jitterOffsetPx: number;
}

export interface TaperedContourResult {
  readonly points: readonly TaperedContourEvaluatedPoint[];
  readonly minWidthPx: number;
  readonly maxWidthPx: number;
  readonly taperRatio: number;
  readonly meanJitterPx: number;
  readonly categoryMeanWidths: Readonly<Record<ContourEdgeCategory, number>>;
}

export const DEFAULT_SKIN_BASE_OKLCH: OklchColor = {
  l: 0.87,
  c: 0.058,
  h: 54,
};

export const DEFAULT_TAPERED_CONTOUR_CONFIG: TaperedContourConfig = {
  baseWidthPx: 2.2,
  taperPower: 0.65,
  shadowThickening: 0.55,
  jitterAmplitudePx: 0.42,
  jitterFrequency: 11.5,
  referenceDistanceM: 2.4,
};

const DEG_TO_RAD = Math.PI / 180;

const CONTOUR_CATEGORY_WEIGHT: Readonly<Record<ContourEdgeCategory, number>> = {
  silhouette: 1.45,
  "depth-break": 1.22,
  "material-boundary": 1.0,
  "normal-crease": 0.78,
  "inner-detail": 0.52,
};

export function smoothstep3d(edge0: number, edge1: number, x: number): number {
  if (Math.abs(edge1 - edge0) < 1e-6) return x >= edge1 ? 1 : 0;
  const t = clamp3d((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function normalizeHueDeg(hue: number): number {
  if (!Number.isFinite(hue)) return 0;
  return ((hue % 360) + 360) % 360;
}

/**
 * 웹툰 캐릭터 피부용 OKLCH 난색(SSS 혈색) 또는 보색 컬러 섀도우 틴트를 산출한다.
 */
export function computeOklchFaceShadowTint(
  skinBaseOklch: OklchColor = DEFAULT_SKIN_BASE_OKLCH,
  tintMode: FaceShadowTintMode = "warm-subsurface",
  keyLightHueDeg = 68,
): FaceShadowTintPalette {
  const baseL = clamp3d(skinBaseOklch.l, 0.45, 0.96);
  const baseC = clamp3d(skinBaseOklch.c, 0.02, 0.18);
  const baseH = normalizeHueDeg(skinBaseOklch.h);

  const litSkinOklch: OklchColor = {
    l: clamp3d(baseL + 0.03, 0.5, 0.97),
    c: baseC,
    h: baseH,
  };

  if (tintMode === "complementary-cool") {
    const compHue = normalizeHueDeg(keyLightHueDeg + 180);
    return {
      mode: tintMode,
      litSkinOklch,
      shadowTintOklch: {
        l: clamp3d(baseL - 0.19, 0.34, 0.8),
        c: clamp3d(baseC + 0.032, 0.05, 0.22),
        h: compHue,
      },
      sssTerminatorOklch: {
        l: clamp3d(baseL - 0.11, 0.42, 0.85),
        c: clamp3d(baseC + 0.045, 0.06, 0.24),
        h: normalizeHueDeg(baseH - 18),
      },
      rimHighlightOklch: {
        l: 0.96,
        c: 0.045,
        h: normalizeHueDeg(keyLightHueDeg - 8),
      },
    };
  }

  return {
    mode: tintMode,
    litSkinOklch,
    shadowTintOklch: {
      l: clamp3d(baseL - 0.16, 0.38, 0.82),
      c: clamp3d(baseC + 0.042, 0.06, 0.22),
      h: normalizeHueDeg(baseH - 22),
    },
    sssTerminatorOklch: {
      l: clamp3d(baseL - 0.08, 0.48, 0.88),
      c: clamp3d(baseC + 0.065, 0.08, 0.26),
      h: normalizeHueDeg(baseH - 28),
    },
    rimHighlightOklch: {
      l: 0.97,
      c: 0.052,
      h: normalizeHueDeg(keyLightHueDeg),
    },
  };
}

/**
 * 얼굴 전용 Face Shadow SDF 셰이더 평가기.
 * 코/광대 지저분한 기하 음영을 제거하고 방위각 +θ/-θ 좌우 거울 대칭을 정확히 보존한다.
 */
export function evaluateFaceShadowSdf(input: FaceShadowSdfInput): FaceShadowSdfResult {
  const gridSize = Math.round(clamp3d(input.gridSize ?? 32, 16, 96));
  const azRad = input.azimuthDeg * DEG_TO_RAD;
  const elRad = clamp3d(input.elevationDeg, -60, 84) * DEG_TO_RAD;
  const softness = clamp3d(input.shadowSoftness ?? 0.045, 0.008, 0.22);
  const tintMode: FaceShadowTintMode = input.tintMode ?? "warm-subsurface";
  const palette = computeOklchFaceShadowTint(
    input.skinBaseOklch ?? DEFAULT_SKIN_BASE_OKLCH,
    tintMode,
    input.keyLightHueDeg ?? 68,
  );

  const total = gridSize * gridSize;
  const litMask = new Float32Array(total);
  const faceAlpha = new Float32Array(total);
  const sssTerminatorMask = new Float32Array(total);

  const sinAz = Math.sin(azRad);
  const cosAz = Math.cos(azRad);
  const cosEl = Math.cos(elRad);
  const sinEl = Math.sin(elRad);

  const frontDot = cosAz * cosEl;
  const threshold = clamp3d(0.5 - 0.48 * frontDot + Math.max(0, sinEl) * 0.12, 0.03, 0.97);

  let faceCount = 0;
  let litSum = 0;
  let leftFaceCount = 0;
  let leftLitSum = 0;
  let rightFaceCount = 0;
  let rightLitSum = 0;

  for (let y = 0; y < gridSize; y += 1) {
    const v = 1 - ((y + 0.5) / gridSize) * 2;
    for (let x = 0; x < gridSize; x += 1) {
      const u = ((x + 0.5) / gridSize) * 2 - 1;
      const idx = y * gridSize + x;

      const jawTaper = v < 0 ? 1 + v * 0.26 : 1;
      const ovalR = Math.hypot(u / (0.68 * jawTaper), (v - 0.03) / 0.84);
      const alpha = 1 - smoothstep3d(0.95, 1.03, ovalR);
      faceAlpha[idx] = alpha;
      if (alpha < 0.02) continue;

      const sideProjection = u * sinAz;
      const cheekContourCurve = 0.06 * (1 - u * u) * (0.25 + 0.75 * Math.max(0, v + 0.4));
      const overheadDrop = 0.15 * Math.max(0, sinEl) * (0.28 - v);
      const underLightLift = 0.12 * Math.max(0, -sinEl) * (v + 0.2);

      const sdfField =
        0.5 +
        0.56 * sideProjection +
        cheekContourCurve * cosAz * cosEl -
        overheadDrop +
        underLightLift;

      const lit = smoothstep3d(threshold - softness, threshold + softness, sdfField);
      litMask[idx] = lit;
      sssTerminatorMask[idx] = Math.exp(-Math.pow((lit - 0.5) / 0.22, 2)) * alpha;

      faceCount += alpha;
      litSum += lit * alpha;
      if (u < 0) {
        leftFaceCount += alpha;
        leftLitSum += lit * alpha;
      } else if (u > 0) {
        rightFaceCount += alpha;
        rightLitSum += lit * alpha;
      }
    }
  }

  let artifactCount = 0;
  for (let y = 2; y < gridSize - 2; y += 1) {
    const v = 1 - ((y + 0.5) / gridSize) * 2;
    if (Math.abs(v) > 0.24) continue;
    for (let x = 2; x < gridSize - 2; x += 1) {
      const u = ((x + 0.5) / gridSize) * 2 - 1;
      if (Math.abs(u) > 0.28) continue;
      const idx = y * gridSize + x;
      const center = litMask[idx] ?? 0;
      const left = litMask[idx - 1] ?? center;
      const right = litMask[idx + 1] ?? center;
      const up = litMask[idx - gridSize] ?? center;
      const down = litMask[idx + gridSize] ?? center;
      const isIsolatedDarkBlob =
        center < 0.25 && left > 0.75 && right > 0.75 && up > 0.75 && down > 0.75;
      if (isIsolatedDarkBlob) artifactCount += 1;
    }
  }

  return {
    gridSize,
    azimuthDeg: input.azimuthDeg,
    elevationDeg: clamp3d(input.elevationDeg, -60, 84),
    litMask,
    faceAlpha,
    sssTerminatorMask,
    litRatio: faceCount > 0 ? litSum / faceCount : 0,
    leftLitRatio: leftFaceCount > 0 ? leftLitSum / leftFaceCount : 0,
    rightLitRatio: rightFaceCount > 0 ? rightLitSum / rightFaceCount : 0,
    noseCheekArtifactScore: artifactCount,
    palette,
  };
}

/**
 * 데모 얼굴 윤곽 + 내측 주름/재질 경계 샘플 세트를 생성한다.
 */
export function createDemoFaceContourSamples(
  count = 24,
  lightAzimuthDeg = 42,
): readonly TaperedContourSampleInput[] {
  const safeCount = Math.max(8, Math.floor(count));
  const lx = Math.sin(lightAzimuthDeg * DEG_TO_RAD);
  const samples: TaperedContourSampleInput[] = [];

  for (let i = 0; i < safeCount; i += 1) {
    const t = i / (safeCount - 1);
    const theta = Math.PI * (0.15 + 1.7 * t);
    const x = Math.cos(theta) * 0.68;
    const y = Math.sin(theta) * 0.82;
    const lightFacing = clamp3d(Math.cos(theta) * lx, -1, 1);

    let category: ContourEdgeCategory = "silhouette";
    if (i % 5 === 1) category = "depth-break";
    else if (i % 5 === 2) category = "material-boundary";
    else if (i % 5 === 3) category = "normal-crease";
    else if (i % 5 === 4) category = "inner-detail";

    samples.push({
      t,
      x,
      y,
      category,
      normalDiscontinuity: category === "normal-crease" ? 0.82 : 0.45,
      depthDelta: category === "depth-break" ? 0.65 : 0.15,
      materialBreak: category === "material-boundary",
      lightFacing,
      distanceFromCameraM: 2.2 + 0.35 * Math.sin(theta),
    });
  }
  return samples;
}

/**
 * 2D G펜급 가변 두께 NPR 외곽선(Tapered Contour) 계산기.
 */
export function evaluateTaperedContour(
  samples: readonly TaperedContourSampleInput[],
  config: TaperedContourConfig = DEFAULT_TAPERED_CONTOUR_CONFIG,
): TaperedContourResult {
  const points: TaperedContourEvaluatedPoint[] = [];
  const sums: Record<ContourEdgeCategory, number> = {
    silhouette: 0,
    "depth-break": 0,
    "material-boundary": 0,
    "normal-crease": 0,
    "inner-detail": 0,
  };
  const counts: Record<ContourEdgeCategory, number> = {
    silhouette: 0,
    "depth-break": 0,
    "material-boundary": 0,
    "normal-crease": 0,
    "inner-detail": 0,
  };

  let minWidthPx = Number.POSITIVE_INFINITY;
  let maxWidthPx = 0;
  let jitterSum = 0;

  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    if (!s) continue;
    const t = clamp3d(s.t, 0, 1);
    const catWeight = CONTOUR_CATEGORY_WEIGHT[s.category];

    const taperEnvelope = Math.max(
      0.16,
      Math.pow(Math.sin(t * Math.PI), clamp3d(config.taperPower, 0.2, 2.2)),
    );
    const shadowBoost = 1 + clamp3d(config.shadowThickening, 0, 1.2) * Math.max(0, -s.lightFacing);
    const featureBoost =
      1 +
      clamp3d(s.normalDiscontinuity, 0, 1) * 0.24 +
      clamp3d(s.depthDelta, 0, 2) * 0.18 +
      (s.materialBreak ? 0.16 : 0);
    const distScale = clamp3d(
      config.referenceDistanceM / Math.max(0.6, s.distanceFromCameraM),
      0.55,
      1.35,
    );

    const widthPx = clamp3d(
      config.baseWidthPx * catWeight * taperEnvelope * shadowBoost * featureBoost * distScale,
      0.25,
      14,
    );

    const phase = t * config.jitterFrequency * Math.PI * 2;
    const jitterX =
      config.jitterAmplitudePx * (0.65 * Math.sin(phase + 0.7) + 0.35 * Math.cos(phase * 2.13));
    const jitterY =
      config.jitterAmplitudePx * (0.65 * Math.cos(phase * 1.17) + 0.35 * Math.sin(phase * 2.41));
    const jitterOffsetPx = Math.hypot(jitterX, jitterY);
    const opacity = clamp3d(0.62 + 0.38 * taperEnvelope, 0.4, 1);

    if (widthPx < minWidthPx) minWidthPx = widthPx;
    if (widthPx > maxWidthPx) maxWidthPx = widthPx;
    jitterSum += jitterOffsetPx;
    sums[s.category] += widthPx;
    counts[s.category] += 1;

    points.push({
      t,
      x: s.x,
      y: s.y,
      jitteredX: s.x + jitterX,
      jitteredY: s.y + jitterY,
      widthPx: Number(widthPx.toFixed(3)),
      opacity: Number(opacity.toFixed(3)),
      category: s.category,
      jitterOffsetPx: Number(jitterOffsetPx.toFixed(4)),
    });
  }

  const safeMin = Number.isFinite(minWidthPx) ? minWidthPx : 0;
  const categoryMeanWidths: Record<ContourEdgeCategory, number> = {
    silhouette: counts.silhouette > 0 ? Number((sums.silhouette / counts.silhouette).toFixed(3)) : 0,
    "depth-break":
      counts["depth-break"] > 0
        ? Number((sums["depth-break"] / counts["depth-break"]).toFixed(3))
        : 0,
    "material-boundary":
      counts["material-boundary"] > 0
        ? Number((sums["material-boundary"] / counts["material-boundary"]).toFixed(3))
        : 0,
    "normal-crease":
      counts["normal-crease"] > 0
        ? Number((sums["normal-crease"] / counts["normal-crease"]).toFixed(3))
        : 0,
    "inner-detail":
      counts["inner-detail"] > 0
        ? Number((sums["inner-detail"] / counts["inner-detail"]).toFixed(3))
        : 0,
  };

  return {
    points,
    minWidthPx: Number(safeMin.toFixed(3)),
    maxWidthPx: Number(maxWidthPx.toFixed(3)),
    taperRatio: safeMin > 0 ? Number((maxWidthPx / safeMin).toFixed(2)) : 1,
    meanJitterPx: points.length > 0 ? Number((jitterSum / points.length).toFixed(4)) : 0,
    categoryMeanWidths,
  };
}
