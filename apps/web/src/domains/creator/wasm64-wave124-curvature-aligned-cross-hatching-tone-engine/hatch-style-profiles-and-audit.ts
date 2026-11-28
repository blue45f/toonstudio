/**
 * Wave 124 — 만화 해칭 스타일 프로파일, G펜 테이퍼 폭 계산 및 4대 불변식 감사기.
 */

import {
  clampFinite,
  type CurvatureDirectionArrow,
  type CustomNormalFieldInput,
  type HatchStyleId,
  type SurfaceFieldEvaluator,
  type SurfacePresetId,
  type Vec2,
  type Vec3,
} from "./surface-curvature-fields";

export type HatchLayerTier = 1 | 2 | 3;

export interface HatchLayerSpec {
  readonly tier: HatchLayerTier;
  readonly enabled: boolean;
  /** 주곡률 방향 u_1 대비 교차 각도(도) */
  readonly angleOffsetDeg: number;
  /** 이 조도 이하에서 시드가 활성화되는 상한 */
  readonly activationLuminance: number;
  /** 유선이 뻗어 나갈 수 있는 최대 조도 상한(하이라이트 백지 보호) */
  readonly stopLuminance: number;
  /** 기준 선 간격(px) */
  readonly baseSpacingPx: number;
  /** 기준 중앙 펜 굵기(px) */
  readonly baseWidthPx: number;
  /** 한쪽 방향 최대 RK2 적분 스텝 수 */
  readonly maxHalfSteps: number;
}

export interface HatchStyleProfile {
  readonly id: HatchStyleId;
  readonly labelKo: string;
  readonly stepSizePx: number;
  readonly minStrokeLengthPx: number;
  /** 양 끝단 테이퍼 최소 비율 (0 < tipRatio < 0.5) */
  readonly tipWidthRatio: number;
  /** 테이퍼 사인 곡선 지수 (높을수록 끝이 날카로움) */
  readonly taperExponent: number;
  /** 암부 깊이에 따른 굵기 가중 계수 */
  readonly shadowWeightBoost: number;
  readonly layers: readonly [HatchLayerSpec, HatchLayerSpec, HatchLayerSpec];
}

export interface CrossHatchingSpec {
  readonly surfacePreset?: SurfacePresetId;
  readonly customField?: CustomNormalFieldInput;
  readonly styleId?: HatchStyleId;
  readonly width?: number;
  readonly height?: number;
  readonly lightDirection?: Vec3;
  readonly seed?: number;
  /** 선 밀도 배율 (기본 1.0, 범위 [0.4, 2.0]) */
  readonly densityScale?: number;
  /** 펜 굵기 배율 (기본 1.0, 범위 [0.5, 2.0]) */
  readonly strokeWidthScale?: number;
}

export interface HatchStrokePoint {
  readonly x: number;
  readonly y: number;
  readonly widthPx: number;
  readonly arcT: number;
  readonly luminance: number;
}

export interface HatchStroke {
  readonly id: string;
  readonly layer: HatchLayerTier;
  readonly angleOffsetDeg: number;
  readonly points: readonly HatchStrokePoint[];
  readonly arcLengthPx: number;
  readonly startWidthPx: number;
  readonly centerWidthPx: number;
  readonly endWidthPx: number;
  readonly meanLuminance: number;
}

export interface ToneZoneDensityMetrics {
  readonly shadowAreaPx: number;
  readonly midtoneAreaPx: number;
  readonly highlightAreaPx: number;
  readonly shadowInkAreaPx: number;
  readonly midtoneInkAreaPx: number;
  readonly highlightInkAreaPx: number;
  readonly shadowDensity: number;
  readonly midtoneDensity: number;
  readonly highlightDensity: number;
  readonly monotonicToneOrderPassed: boolean;
}

export interface CrossHatchingAuditMetrics {
  readonly totalStrokeCount: number;
  readonly totalVertexCount: number;
  readonly layerStrokeCounts: { readonly 1: number; readonly 2: number; readonly 3: number };
  readonly activeLayers: readonly HatchLayerTier[];
  readonly outsideMaskPointCount: number;
  readonly nonFiniteValueCount: number;
  readonly maskAreaPx: number;
  readonly maskCentroid: Vec2;
  readonly hatchingCentroid: Vec2;
  readonly horizontalBiasNormalized: number;
  readonly leftHalfInkShare: number;
  readonly rightHalfInkShare: number;
  readonly meanTaperRatio: number;
  readonly allStrokesTaperedAtEnds: boolean;
  readonly toneZones: ToneZoneDensityMetrics;
}

export interface CurvatureCrossHatchingResult {
  readonly surfacePreset: SurfacePresetId | "custom";
  readonly styleId: HatchStyleId;
  readonly width: number;
  readonly height: number;
  readonly lightDirection: Vec3;
  readonly seed: number;
  readonly styleProfile: HatchStyleProfile;
  readonly strokes: readonly HatchStroke[];
  readonly directionArrows: readonly CurvatureDirectionArrow[];
  readonly silhouetteOutline: readonly Vec2[];
  readonly metrics: CrossHatchingAuditMetrics;
}

export const HATCH_STYLE_PROFILES: Record<HatchStyleId, HatchStyleProfile> = {
  "g-pen-classic-cross": {
    id: "g-pen-classic-cross",
    labelKo: "G펜 정통 크로스해칭",
    stepSizePx: 3.0,
    minStrokeLengthPx: 9.0,
    tipWidthRatio: 0.16,
    taperExponent: 0.78,
    shadowWeightBoost: 0.36,
    layers: [
      {
        tier: 1,
        enabled: true,
        angleOffsetDeg: 0,
        activationLuminance: 0.72,
        stopLuminance: 0.79,
        baseSpacingPx: 7.4,
        baseWidthPx: 1.42,
        maxHalfSteps: 11,
      },
      {
        tier: 2,
        enabled: true,
        angleOffsetDeg: 60,
        activationLuminance: 0.44,
        stopLuminance: 0.52,
        baseSpacingPx: 8.6,
        baseWidthPx: 1.24,
        maxHalfSteps: 9,
      },
      {
        tier: 3,
        enabled: true,
        angleOffsetDeg: -60,
        activationLuminance: 0.24,
        stopLuminance: 0.31,
        baseSpacingPx: 9.2,
        baseWidthPx: 1.12,
        maxHalfSteps: 7,
      },
    ],
  },
  "murim-brush-hatch": {
    id: "murim-brush-hatch",
    labelKo: "무협 붓터치 해칭",
    stepSizePx: 3.2,
    minStrokeLengthPx: 10.0,
    tipWidthRatio: 0.14,
    taperExponent: 0.62,
    shadowWeightBoost: 0.48,
    layers: [
      {
        tier: 1,
        enabled: true,
        angleOffsetDeg: 0,
        activationLuminance: 0.73,
        stopLuminance: 0.79,
        baseSpacingPx: 8.2,
        baseWidthPx: 2.05,
        maxHalfSteps: 12,
      },
      {
        tier: 2,
        enabled: true,
        angleOffsetDeg: 58,
        activationLuminance: 0.46,
        stopLuminance: 0.54,
        baseSpacingPx: 9.4,
        baseWidthPx: 1.72,
        maxHalfSteps: 9,
      },
      {
        tier: 3,
        enabled: true,
        angleOffsetDeg: -62,
        activationLuminance: 0.26,
        stopLuminance: 0.32,
        baseSpacingPx: 10.2,
        baseWidthPx: 1.54,
        maxHalfSteps: 7,
      },
    ],
  },
  "noir-parallel-engraving": {
    id: "noir-parallel-engraving",
    labelKo: "누아르 평행 조각선",
    stepSizePx: 3.0,
    minStrokeLengthPx: 10.0,
    tipWidthRatio: 0.2,
    taperExponent: 0.88,
    shadowWeightBoost: 0.72,
    layers: [
      {
        tier: 1,
        enabled: true,
        angleOffsetDeg: 0,
        activationLuminance: 0.72,
        stopLuminance: 0.79,
        baseSpacingPx: 6.4,
        baseWidthPx: 1.55,
        maxHalfSteps: 14,
      },
      {
        tier: 2,
        enabled: false,
        angleOffsetDeg: 60,
        activationLuminance: 0,
        stopLuminance: 0,
        baseSpacingPx: 12,
        baseWidthPx: 1.0,
        maxHalfSteps: 0,
      },
      {
        tier: 3,
        enabled: false,
        angleOffsetDeg: -60,
        activationLuminance: 0,
        stopLuminance: 0,
        baseSpacingPx: 12,
        baseWidthPx: 1.0,
        maxHalfSteps: 0,
      },
    ],
  },
  "stipple-fine-liner": {
    id: "stipple-fine-liner",
    labelKo: "세필 라이너 점묘 해칭",
    stepSizePx: 2.2,
    minStrokeLengthPx: 5.5,
    tipWidthRatio: 0.22,
    taperExponent: 0.85,
    shadowWeightBoost: 0.28,
    layers: [
      {
        tier: 1,
        enabled: true,
        angleOffsetDeg: 0,
        activationLuminance: 0.72,
        stopLuminance: 0.79,
        baseSpacingPx: 6.2,
        baseWidthPx: 0.96,
        maxHalfSteps: 5,
      },
      {
        tier: 2,
        enabled: true,
        angleOffsetDeg: 60,
        activationLuminance: 0.43,
        stopLuminance: 0.5,
        baseSpacingPx: 7.2,
        baseWidthPx: 0.86,
        maxHalfSteps: 4,
      },
      {
        tier: 3,
        enabled: true,
        angleOffsetDeg: -60,
        activationLuminance: 0.23,
        stopLuminance: 0.3,
        baseSpacingPx: 7.8,
        baseWidthPx: 0.8,
        maxHalfSteps: 3,
      },
    ],
  },
};

export function getHatchStyleProfile(styleId: HatchStyleId): HatchStyleProfile {
  return HATCH_STYLE_PROFILES[styleId];
}

/**
 * 손그림 G펜 테이퍼 폭(px)을 호길이 진행도 arcT ∈ [0, 1] 기준으로 산출한다.
 * 중앙(arcT = 0.5)에서 최대 폭을 갖고, 양 끝단(0 및 1)에서 날카롭게 가늘어진다.
 */
export function computeTaperWidthPx(
  arcT: number,
  maxWidthPx: number,
  tipWidthRatio: number,
  taperExponent: number,
): number {
  const t = clampFinite(arcT, 0, 1, 0.5);
  const safeMax = Math.max(0.25, clampFinite(maxWidthPx, 0.25, 24, 1.2));
  const safeTip = clampFinite(tipWidthRatio, 0.05, 0.48, 0.16);
  const safeExp = clampFinite(taperExponent, 0.3, 2.5, 0.8);
  const arch = Math.pow(Math.max(0, Math.sin(Math.PI * t)), safeExp);
  return safeMax * (safeTip + (1 - safeTip) * arch);
}

/**
 * 생성된 해칭 스트로크 집합에 대해 실루엣 침범·톤 단조성·계층 활성화·광원 반전 중심을 감사한다.
 */
export function auditCrossHatchingMetrics(
  evaluator: SurfaceFieldEvaluator,
  strokes: readonly HatchStroke[],
): CrossHatchingAuditMetrics {
  const sampleStep = Math.max(
    1,
    Math.min(4, Math.floor(Math.min(evaluator.width, evaluator.height) / 64) || 1),
  );
  const cellArea = sampleStep * sampleStep;

  let maskAreaPx = 0;
  let maskSumX = 0;
  let maskSumY = 0;
  let shadowAreaPx = 0;
  let midtoneAreaPx = 0;
  let highlightAreaPx = 0;

  if (evaluator.width > 0 && evaluator.height > 0) {
    for (let y = sampleStep * 0.5; y < evaluator.height; y += sampleStep) {
      for (let x = sampleStep * 0.5; x < evaluator.width; x += sampleStep) {
        const s = evaluator.sample(x, y);
        if (!s.insideMask) continue;
        maskAreaPx += cellArea;
        maskSumX += x * cellArea;
        maskSumY += y * cellArea;
        if (s.luminance < 0.35) shadowAreaPx += cellArea;
        else if (s.luminance <= 0.72) midtoneAreaPx += cellArea;
        else if (s.luminance > 0.82) highlightAreaPx += cellArea;
      }
    }
  }

  const maskCentroid: Vec2 =
    maskAreaPx > 0
      ? { x: maskSumX / maskAreaPx, y: maskSumY / maskAreaPx }
      : { x: evaluator.width * 0.5, y: evaluator.height * 0.5 };

  let totalVertexCount = 0;
  let outsideMaskPointCount = 0;
  let nonFiniteValueCount = 0;
  const layerCounts: { 1: number; 2: number; 3: number } = { 1: 0, 2: 0, 3: 0 };

  let shadowInkAreaPx = 0;
  let midtoneInkAreaPx = 0;
  let highlightInkAreaPx = 0;
  let totalInkMass = 0;
  let inkSumX = 0;
  let inkSumY = 0;
  let leftHalfInkMass = 0;
  let rightHalfInkMass = 0;
  let taperRatioSum = 0;
  let allStrokesTaperedAtEnds = true;

  for (let i = 0; i < strokes.length; i += 1) {
    const stroke = strokes[i];
    layerCounts[stroke.layer] += 1;

    const endMax = Math.max(stroke.startWidthPx, stroke.endWidthPx);
    if (!(stroke.centerWidthPx > stroke.startWidthPx && stroke.centerWidthPx > stroke.endWidthPx)) {
      allStrokesTaperedAtEnds = false;
    }
    taperRatioSum += stroke.centerWidthPx > 1e-6 ? endMax / stroke.centerWidthPx : 1;

    for (let p = 0; p < stroke.points.length; p += 1) {
      const pt = stroke.points[p];
      totalVertexCount += 1;
      if (
        !Number.isFinite(pt.x) ||
        !Number.isFinite(pt.y) ||
        !Number.isFinite(pt.widthPx) ||
        !Number.isFinite(pt.luminance)
      ) {
        nonFiniteValueCount += 1;
        continue;
      }
      if (!evaluator.isPointInsideMask(pt.x, pt.y)) {
        outsideMaskPointCount += 1;
      }

      if (p > 0) {
        const prev = stroke.points[p - 1];
        const segLen = Math.hypot(pt.x - prev.x, pt.y - prev.y);
        const segW = 0.5 * (pt.widthPx + prev.widthPx);
        const segInk = segLen * segW;
        const mx = 0.5 * (pt.x + prev.x);
        const my = 0.5 * (pt.y + prev.y);
        const midSample = evaluator.sample(mx, my);

        totalInkMass += segInk;
        inkSumX += mx * segInk;
        inkSumY += my * segInk;

        if (mx < maskCentroid.x) leftHalfInkMass += segInk;
        else rightHalfInkMass += segInk;

        if (midSample.luminance < 0.35) shadowInkAreaPx += segInk;
        else if (midSample.luminance <= 0.72) midtoneInkAreaPx += segInk;
        else if (midSample.luminance > 0.82) highlightInkAreaPx += segInk;
      }
    }
  }

  const hatchingCentroid: Vec2 =
    totalInkMass > 0
      ? { x: inkSumX / totalInkMass, y: inkSumY / totalInkMass }
      : { x: maskCentroid.x, y: maskCentroid.y };

  const halfWidth = Math.max(1, evaluator.width * 0.5);
  const horizontalBiasNormalized = (hatchingCentroid.x - maskCentroid.x) / halfWidth;
  const leftHalfInkShare = totalInkMass > 0 ? leftHalfInkMass / totalInkMass : 0;
  const rightHalfInkShare = totalInkMass > 0 ? rightHalfInkMass / totalInkMass : 0;

  const shadowDensity = shadowAreaPx > 0 ? shadowInkAreaPx / shadowAreaPx : 0;
  const midtoneDensity = midtoneAreaPx > 0 ? midtoneInkAreaPx / midtoneAreaPx : 0;
  const highlightDensity = highlightAreaPx > 0 ? highlightInkAreaPx / highlightAreaPx : 0;
  const monotonicToneOrderPassed =
    strokes.length === 0 ||
    (shadowDensity > midtoneDensity && midtoneDensity > highlightDensity);

  const activeLayers: HatchLayerTier[] = [];
  if (layerCounts[1] > 0) activeLayers.push(1);
  if (layerCounts[2] > 0) activeLayers.push(2);
  if (layerCounts[3] > 0) activeLayers.push(3);

  return {
    totalStrokeCount: strokes.length,
    totalVertexCount,
    layerStrokeCounts: layerCounts,
    activeLayers,
    outsideMaskPointCount,
    nonFiniteValueCount,
    maskAreaPx,
    maskCentroid,
    hatchingCentroid,
    horizontalBiasNormalized,
    leftHalfInkShare,
    rightHalfInkShare,
    meanTaperRatio: strokes.length > 0 ? taperRatioSum / strokes.length : 0,
    allStrokesTaperedAtEnds,
    toneZones: {
      shadowAreaPx,
      midtoneAreaPx,
      highlightAreaPx,
      shadowInkAreaPx,
      midtoneInkAreaPx,
      highlightInkAreaPx,
      shadowDensity,
      midtoneDensity,
      highlightDensity,
      monotonicToneOrderPassed,
    },
  };
}
