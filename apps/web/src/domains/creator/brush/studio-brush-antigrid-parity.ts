/**
 * 브러시 라이브↔커밋 패리티 및 안티그리드(R2 블루노이즈) 공유 순수 보조 모듈.
 *
 * - 결정론적 R2 황금비(플라스틱 상수) 2D 서브픽셀 지터: 정방 격자(`arc`+`fill`) 폴백과
 *   대브 간 위상 고정을 깨서 체커보드·레일 격자감을 억제하면서도 라이브/커밋/SVG/접미사 재생이
 *   비트 단위로 일치하게 유지한다.
 * - 풀해상도 텍스처 스탬프 우선 판정 & 단일 콜 래스터 마크 예산 패리티: `drawImage` 1콜=1마크
 *   브러시가 `activeDraft=true`에서 4,096으로 억울하게 잘려 펜을 뗄 때 튀는 현상을 막는다.
 * - 리테인드 미디어(연필·캘리그라피·형광펜·지우개) 라이브↔커밋 입력 정규화: `StudioDrawNode`와
 *   폭(`aliasStrokeWidth`), 리샘플링 포인트, 텐션, 탭 필압·불투명도를 단일 규칙으로 맞춘다.
 */

import {
  resolveStudioFreehandRenderPath,
  strokeRenderDistance,
} from "../studio-brush";
import {
  isStudioBrushEraserAliasId,
  mapStudioBrushAliasPressure,
  studioBrushAliasEffectiveDiameter,
} from "./studio-brush-alias-profile";
import {
  isStudioDynamicBrushCausalDepositPipeline,
  studioDynamicBrushDepositPipelineUsesContinuation,
  type NormalizedStudioBrushDynamicsSettings,
} from "./studio-brush-dynamics";
import { studioBrushDualBrushIsActive } from "./studio-brush-tip-composition";
import {
  isStudioFxPressureBrushId,
  resolveStudioFxBrushTapPressureResponse,
} from "./studio-fx-brush-pressure-path";
import { STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1 } from "../studio-material-pressure-model";

import type { DrawEl } from "../studio-element-model";
import type { NormalizedStudioBrushTipSettings } from "./studio-brush-tip-stamp";

/** R2 2D 저불일치(블루노이즈 유사) 수열의 플라스틱 상수 g (g^3 = g + 1). */
export const STUDIO_BRUSH_R2_PLASTIC_CONSTANT = 1.324_717_957_244_746;
export const STUDIO_BRUSH_R2_ALPHA_X = 1 / STUDIO_BRUSH_R2_PLASTIC_CONSTANT;
export const STUDIO_BRUSH_R2_ALPHA_Y =
  1 / (STUDIO_BRUSH_R2_PLASTIC_CONSTANT * STUDIO_BRUSH_R2_PLASTIC_CONSTANT);
export const STUDIO_BRUSH_GOLDEN_RATIO_RECIPROCAL = 0.618_033_988_749_894_9;

/**
 * 이 해상도 이상의 사용자 알파맵(ABR/Procreate/가져오기 팁 등)은 레거시 8×8 테스트 비트맵과
 * 달리 풀해상도 `alpha-map` `drawImage` 스탬프 경로를 우선 사용해 정방 원격자 붕괴를 막는다.
 */
export const STUDIO_BRUSH_HIGH_RES_FULL_TEXTURE_MIN_SIZE = 32;

/** 대브당 최대 7×7=49 샘플보다 큰 소수 보폭으로 대브 간 R2 인덱스가 겹치지 않게 분리한다. */
const R2_DAB_STRIDE = 67;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function fract(value: number): number {
  return value - Math.floor(value);
}

/** 32비트 정수 아발란치 해시 — 동일 시드·팁에 대해 항상 같은 초기 R2 토러스 위상을 만든다. */
function hashSeedUint32(a: number, b: number, salt: number): number {
  let state = (Math.trunc(a) ^ 0x9e37_79b9) >>> 0;
  state = Math.imul(state ^ (Math.trunc(b) + salt), 0x85eb_ca6b) >>> 0;
  state = Math.imul(state ^ (state >>> 13), 0xc2b2_ae35) >>> 0;
  return (state ^ (state >>> 16)) >>> 0;
}

export interface StudioBrushR2BlueNoiseSample {
  readonly u: number;
  readonly v: number;
  readonly w: number;
}

/**
 * 결정론적 R2 황금비 2D 저불일치 수열 + 반지름 미세 변조 채널 `w`를 반환한다.
 * 오직 `(seed, dabOrdinal, tipIndex, sampleOrdinal)`에만 의존해 라이브 접미사와 전체 재생이 일치한다.
 */
export function sampleStudioBrushR2BlueNoiseUnit2d(
  seed: number,
  dabOrdinal: number,
  tipIndex: number,
  sampleOrdinal: number,
): StudioBrushR2BlueNoiseSample {
  const safeSeed = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  const safeDab = Number.isFinite(dabOrdinal) ? Math.max(0, Math.trunc(dabOrdinal)) : 0;
  const safeTip = Number.isFinite(tipIndex) ? Math.max(0, Math.trunc(tipIndex)) : 0;
  const safeSample = Number.isFinite(sampleOrdinal) ? Math.max(0, Math.trunc(sampleOrdinal)) : 0;
  const step = safeDab * R2_DAB_STRIDE + safeSample + 1;
  const u0 = hashSeedUint32(safeSeed, safeTip, 0x243f_6a88) / 0x1_0000_0000;
  const v0 = hashSeedUint32(safeSeed, safeTip, 0x85a3_08d3) / 0x1_0000_0000;
  const w0 = hashSeedUint32(safeSeed, safeTip, 0x1319_8a2e) / 0x1_0000_0000;
  return {
    u: fract(u0 + STUDIO_BRUSH_R2_ALPHA_X * step),
    v: fract(v0 + STUDIO_BRUSH_R2_ALPHA_Y * step),
    w: fract(w0 + STUDIO_BRUSH_GOLDEN_RATIO_RECIPROCAL * step),
  };
}

export interface StudioBrushAntiGridSampleJitterInput {
  readonly seed: number;
  readonly dabOrdinal: number;
  readonly tipIndex: number;
  readonly sampleOrdinal: number;
  readonly stampGrid: number;
  readonly sampleRadius: number;
  readonly dabSize: number;
  readonly dabRoundness: number;
}

export interface StudioBrushAntiGridSampleJitter {
  readonly jitterX: number;
  readonly jitterY: number;
  readonly radius: number;
}

/**
 * 샘플드 팁 폴백(`arc`+`fill`)의 각 서브 대브에 원판 등방 R2 서브픽셀 지터와 미세 반지름 변조를 적용한다.
 * 정방 격자 행/열 정렬과 대브 간 반복 줄무늬를 제거하면서 대브 외곽 범위를 넘지 않도록 제한한다.
 */
export function computeStudioBrushAntiGridSampleJitter(
  input: StudioBrushAntiGridSampleJitterInput,
): StudioBrushAntiGridSampleJitter {
  const { u, v, w } = sampleStudioBrushR2BlueNoiseUnit2d(
    input.seed,
    input.dabOrdinal,
    input.tipIndex,
    input.sampleOrdinal,
  );
  const dabHalfRadius = Math.max(0.25, input.dabSize * 0.5);
  const dabMinorHalf = dabHalfRadius * clamp(input.dabRoundness, 0.08, 1);
  const halfGrid = Math.max(1, (Math.max(3, input.stampGrid) - 1) * 0.5);
  const gridCell = dabHalfRadius / halfGrid;
  const maxJitter = Math.min(
    input.sampleRadius * 0.42,
    gridCell * 0.38,
    Math.max(0.35, dabMinorHalf * 0.36),
  );
  // 면적 균일 원판 사상으로 축 정렬 사각 분포(체커보드 편향)를 없앤다.
  const radial = Math.sqrt(u) * maxJitter;
  const theta = v * Math.PI * 2;
  const radiusScale = 0.94 + w * 0.12;
  return {
    jitterX: Math.cos(theta) * radial,
    jitterY: Math.sin(theta) * radial,
    radius: Math.max(0.2, input.sampleRadius * radiusScale),
  };
}

export interface StudioBrushSubPixelGridDispersion {
  readonly sampleCount: number;
  readonly uniqueSubPixelBuckets: number;
  readonly bucketCoverageRatio: number;
  readonly axisAlignmentScore: number;
}

/**
 * 서브픽셀 토러스(8×8 버킷) 분산과 축 정렬 집중도를 계산해 격자 주기성 억제를 정량 검증한다.
 */
export function measureStudioBrushSubPixelGridDispersion(
  positions: readonly Readonly<{ readonly x: number; readonly y: number }>[],
  bucketsPerAxis = 8,
): StudioBrushSubPixelGridDispersion {
  const sampleCount = positions.length;
  if (sampleCount === 0) {
    return {
      sampleCount: 0,
      uniqueSubPixelBuckets: 0,
      bucketCoverageRatio: 0,
      axisAlignmentScore: 1,
    };
  }
  const bins = Math.max(2, Math.trunc(bucketsPerAxis));
  const seen = new Set<number>();
  const xHist = new Uint32Array(bins);
  const yHist = new Uint32Array(bins);
  for (const point of positions) {
    const bx = Math.min(bins - 1, Math.floor(fract(point.x) * bins));
    const by = Math.min(bins - 1, Math.floor(fract(point.y) * bins));
    seen.add(by * bins + bx);
    xHist[bx] = (xHist[bx] ?? 0) + 1;
    yHist[by] = (yHist[by] ?? 0) + 1;
  }
  let maxAxisCount = 0;
  for (let index = 0; index < bins; index += 1) {
    maxAxisCount = Math.max(maxAxisCount, xHist[index] ?? 0, yHist[index] ?? 0);
  }
  return {
    sampleCount,
    uniqueSubPixelBuckets: seen.size,
    bucketCoverageRatio: seen.size / (bins * bins),
    // 완벽한 균일 분포는 1/bins(0.125), 단일 격자선 정렬은 1.0에 수렴한다.
    axisAlignmentScore: maxAxisCount / sampleCount,
  };
}

/** 고해상도 사용자 알파맵(>=32px) 또는 파라미터 절차적 팁은 풀해상도 텍스처 스탬프를 우선한다. */
export function studioBrushTipRequestsFullTextureAuthority(
  tip: NormalizedStudioBrushTipSettings,
): boolean {
  return (
    (tip.alphaMapBase64 !== null
      && tip.alphaMapSize >= STUDIO_BRUSH_HIGH_RES_FULL_TEXTURE_MIN_SIZE)
    || tip.parametric !== undefined
  );
}

/**
 * 동적 브러시가 대브당 단일 `drawImage` 풀해상도 텍스처 스탬프 권한을 쓰는지 판정한다.
 * 인과 파이프라인(causal-v2/v3) 외에 고해상도 커스텀 알파맵(>=32px)과 파라미터 팁도 포함하며,
 * 레거시 8×8 샘플드 격자 호환 계약은 그대로 보존한다.
 */
export function studioDynamicBrushUsesFullTextureAuthority(
  settings: NormalizedStudioBrushDynamicsSettings,
): boolean {
  if (isStudioDynamicBrushCausalDepositPipeline(settings.depositPipeline)) {
    return true;
  }
  if (studioBrushTipRequestsFullTextureAuthority(settings.tip)) {
    return true;
  }
  return settings.tipLayers.some(
    (layer) => layer.opacity > 0 && studioBrushTipRequestsFullTextureAuthority(layer.tip),
  );
}

/** 활성 R8 페이퍼 그레인 에셋이 설정된 경우 대브당 1 `drawImage` 텍스처 명령으로 내려간다. */
export function studioDynamicBrushHasActiveR8Grain(
  settings: NormalizedStudioBrushDynamicsSettings,
): boolean {
  return settings.grain.amount > 0 && settings.grain.source !== undefined;
}

/**
 * 절차적 소프트 팁이 해석적 방사형 감쇠(`drawImage` 1콜)를 쓰는지 판정한다.
 * `studio-brush-render-budget`과 `studio-dynamic-brush-coverage-renderer`가 동일 규칙을 공유한다.
 */
export function studioBrushTipUsesAnalyticSoftFalloff(
  tip: NormalizedStudioBrushTipSettings,
  primary: boolean,
  dualBrush: NormalizedStudioBrushDynamicsSettings["dualBrush"],
  fullTextureAuthority: boolean,
): boolean {
  const activeDual = primary && studioBrushDualBrushIsActive(dualBrush);
  return tip.shape === "soft"
    && tip.alphaMapBase64 === null
    && (
      !activeDual
      || (!fullTextureAuthority && dualBrush?.blendMode === "screen")
    );
}

export interface StudioDynamicBrushMarkBudgetDecisionInput {
  readonly dynamics: NormalizedStudioBrushDynamicsSettings;
  readonly usesCausalDepositPlan: boolean;
  readonly activeDraft: boolean;
  /** 활성 팁 레이어당 정확히 1마크 이하로 내려가는 단일 콜 래스터/타원/해석 소프트 경로 여부. */
  readonly singleCallRasterParity: boolean;
  readonly budgets: Readonly<{
    readonly live: number;
    readonly committed: number;
    readonly causal: number;
    readonly causalContinuation: number;
  }>;
}

/**
 * 동적 브러시 렌더 플랜의 마크 예산을 결정한다.
 *
 * - 인과 파이프라인(웹 키트 소유 브러시 포함): 라이브·커밋 공통 인과 천장을 유지한다.
 * - 단일 콜 래스터/해석 소프트/솔리드 타원 브러시: `drawImage` 1콜=1마크이므로 `activeDraft=true`에서
 *   4,096으로 억울하게 축소하지 않고 커밋 천장(`65,536`)을 그대로 적용해 라이브↔커밋 튐을 없앤다.
 * - 레거시 다중 원격자(`arc`+`fill`) 폴백: 기존 4,096 라이브 상한 계약을 유지한다.
 */
export function resolveStudioDynamicBrushRenderPlanMarkBudget(
  input: StudioDynamicBrushMarkBudgetDecisionInput,
): number {
  if (
    input.usesCausalDepositPlan
    || isStudioDynamicBrushCausalDepositPipeline(input.dynamics.depositPipeline)
  ) {
    return studioDynamicBrushDepositPipelineUsesContinuation(
      input.dynamics.depositPipeline,
    )
      ? input.budgets.causalContinuation
      : input.budgets.causal;
  }
  if (input.singleCallRasterParity) {
    return input.budgets.committed;
  }
  return input.activeDraft ? input.budgets.live : input.budgets.committed;
}

/** 유한한 좌표 쌍만 보존해 리테인드 미디어 라이브/커밋 입력 정규화에 공통 사용한다. */
export function collectStudioRetainedFinitePoints(points: readonly number[]): number[] {
  const finite: number[] = [];
  for (let index = 0; index + 1 < points.length; index += 2) {
    const x = points[index];
    const y = points[index + 1];
    if (
      typeof x === "number"
      && Number.isFinite(x)
      && typeof y === "number"
      && Number.isFinite(y)
    ) {
      finite.push(x, y);
    }
  }
  return finite;
}

export interface StudioRetainedPencilRenderInput {
  readonly brush: string;
  readonly width: number;
  readonly points: number[];
  readonly tension: number;
  readonly canonicalPressures: readonly number[] | undefined;
}

/** `StudioDrawNode` 연필 분기와 동일한 폭·리샘플링 경로·텐션·정규 필압 입력을 계산한다. */
export function resolveStudioRetainedPencilRenderInput(
  element: DrawEl,
): StudioRetainedPencilRenderInput {
  const brush = element.brush ?? "pencil";
  const width = studioBrushAliasEffectiveDiameter(brush, Math.max(1, element.strokeWidth));
  const finitePoints = collectStudioRetainedFinitePoints(element.points);
  const renderPath = resolveStudioFreehandRenderPath(finitePoints, {
    sampleSpacing: element.sampleSpacing,
    acceptedTension: 0.18,
    legacyMinDistance: strokeRenderDistance(element.sampleSpacing),
    legacyTension: 0.2,
  });
  const canonicalPressures =
    element.materialPressureModel === STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1
      ? element.pressures
      : undefined;
  return {
    brush,
    width,
    points: renderPath.points,
    tension: renderPath.tension,
    canonicalPressures,
  };
}

export interface StudioRetainedCalligraphyTapEllipse {
  readonly radiusX: number;
  readonly radiusY: number;
  readonly angleRadians: number;
}

export interface StudioRetainedCalligraphyRenderInput {
  readonly brush: string;
  readonly width: number;
  readonly points: number[];
  readonly tapEllipse: StudioRetainedCalligraphyTapEllipse;
}

/** `StudioDrawNode` 캘리그라피 분기와 동일한 폭·리샘플링 경로·단일 탭 각도 타원을 계산한다. */
export function resolveStudioRetainedCalligraphyRenderInput(
  element: DrawEl,
): StudioRetainedCalligraphyRenderInput {
  const brush = element.brush ?? "calligraphy";
  const width = studioBrushAliasEffectiveDiameter(brush, Math.max(1, element.strokeWidth));
  const finitePoints = collectStudioRetainedFinitePoints(element.points);
  const renderPath = resolveStudioFreehandRenderPath(finitePoints, {
    sampleSpacing: element.sampleSpacing,
    legacyMinDistance: strokeRenderDistance(element.sampleSpacing),
    legacyTension: 0,
  });
  const sourcePressure = clamp(element.pressures?.[0] ?? 0.5, 0, 1);
  const mappedPressure = mapStudioBrushAliasPressure(brush, sourcePressure, 0.5);
  const tapWidth = width * (0.3 + mappedPressure * 1.4);
  const roundness = clamp(element.brushTip?.roundness ?? 0.35, 0.08, 1);
  const angleDeg = element.brushTip?.angleDeg ?? -30;
  return {
    brush,
    width,
    points: renderPath.points,
    tapEllipse: {
      radiusX: Math.max(0.35, tapWidth / 2),
      radiusY: Math.max(0.35, (tapWidth * roundness) / 2),
      angleRadians: (angleDeg * Math.PI) / 180,
    },
  };
}

export interface StudioRetainedHighlighterTapInput {
  readonly tapWidth: number;
  readonly opacityScale: number;
  readonly elementOpacity: number;
}

/** `StudioDrawNode` 형광펜 단일 탭과 동일한 필압 응답과 단일 불투명도 적용을 보장한다. */
export function resolveStudioRetainedHighlighterTapInput(
  element: DrawEl,
  aliasStrokeWidth: number,
): StudioRetainedHighlighterTapInput {
  const brush = element.brush ?? "highlighter";
  const pressureBrush = isStudioFxPressureBrushId(brush) ? brush : "highlighter";
  const response = resolveStudioFxBrushTapPressureResponse(
    pressureBrush,
    element.pressures?.[0],
    element.materialPressureModel,
    element.materialMinimumDiameterRatio,
  );
  return {
    tapWidth: aliasStrokeWidth * response.widthScale,
    opacityScale: response.opacityScale,
    elementOpacity: clamp(element.opacity ?? 1, 0, 1),
  };
}

export interface StudioRetainedEraserRenderInput {
  readonly width: number;
  readonly opacity: number;
  readonly pairs: Array<{ readonly x: number; readonly y: number }>;
}

/** `StudioDrawNode` 지우개 분기와 동일한 별칭 유효 지름·불투명도·리샘플링 점열을 계산한다. */
export function resolveStudioRetainedEraserRenderInput(
  element: DrawEl,
): StudioRetainedEraserRenderInput {
  const brush = element.brush ?? "eraser";
  const baseWidth = Math.max(1, element.strokeWidth);
  const width = isStudioBrushEraserAliasId(brush)
    ? studioBrushAliasEffectiveDiameter(brush, baseWidth)
    : baseWidth;
  const finitePoints = collectStudioRetainedFinitePoints(element.points);
  const renderPath = resolveStudioFreehandRenderPath(finitePoints, {
    sampleSpacing: element.sampleSpacing,
    legacyMinDistance: strokeRenderDistance(element.sampleSpacing),
    legacyTension: 0.4,
  });
  const pairs: Array<{ readonly x: number; readonly y: number }> = [];
  for (let index = 0; index + 1 < renderPath.points.length; index += 2) {
    pairs.push({ x: renderPath.points[index]!, y: renderPath.points[index + 1]! });
  }
  return {
    width,
    opacity: clamp(element.opacity ?? 1, 0, 1),
    pairs,
  };
}
