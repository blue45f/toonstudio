/**
 * 다국어 번역 대사 적응형 말풍선 이진 탐색 리플로우 및 인물·작화 금지 영역(Keepout) 충돌 회피 솔버.
 *
 * - 원문 대비 번역 대사 길이 변화(`0.65× ~ 1.85×`)에 따라 폰트 크기·굵기·자간·행간을
 *   모바일 800px 기준 최소 가독 픽셀 높이 하한 안에서 이진 탐색으로 자동 피팅한다.
 * - 가독성 하한에서 텍스트가 넘칠 경우 작가의 원본 말풍선 좌표를 파괴하지 않고
 *   타원/사각 반지름을 비파괴 확장(`resolvedGeometry`)한다.
 * - 확장 또는 재배치된 말풍선이 캐릭터 얼굴·눈·핵심 작화 금지 영역(`keepoutRects`)과
 *   겹칠 경우 해석적 타원-AABB 교차 면적과 꼬리(tail) 거리를 동시 최적화해 자동 회피한다.
 */

import {
  MULTILINGUAL_TYPOGRAPHY_PROFILES,
  estimateLocalizedTextExpansion,
  layoutMultilingualBalloonLines,
  type BalloonContourKind,
  type LocalizedTextExpansionEstimate,
  type MultilingualBalloonLayoutResult,
  type SupportedL10nLocale,
  type TypographyWritingMode,
} from "./multilingual-typography-metrics";

export type KeepoutRegionKind =
  | "character-face" | "character-eyes" | "focal-artwork"
  | "sfx" | "cut-edge-gutter" | "other-balloon";

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface KeepoutRect {
  readonly id: string;
  readonly kind: KeepoutRegionKind;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly priority?: number;
  readonly marginPx?: number;
}

export interface CutFrameBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly safeMarginPx?: number;
}

export interface BalloonGeometrySpec {
  readonly balloonId: string;
  readonly contour: BalloonContourKind;
  readonly centerX: number;
  readonly centerY: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly paddingX?: number;
  readonly paddingY?: number;
  readonly tailTip?: Point2D;
  readonly allowNonDestructiveExpansion?: boolean;
  readonly maxRadiusExpansionRatio?: number;
}

export interface AdaptiveReflowOptions {
  readonly sourceLocale?: SupportedL10nLocale;
  readonly sourceText?: string;
  readonly targetLocale: SupportedL10nLocale;
  readonly targetText: string;
  readonly writingMode?: TypographyWritingMode;
  readonly baseFontSizePx: number;
  readonly baseFontWeight?: number;
  readonly baseLineHeightRatio?: number;
  readonly baseLetterSpacingEm?: number;
  readonly minFontSizePxOverride?: number;
  readonly maxFontSizePxOverride?: number;
  readonly mobileReferenceWidthPx?: number;
  readonly cutBounds: CutFrameBounds;
  readonly keepoutRects?: readonly KeepoutRect[];
  readonly binarySearchIterations?: number;
  readonly allowHyphenation?: boolean;
}

export type ReflowWarningCode =
  | "MOBILE_READABILITY_FLOOR_HIT"
  | "MOBILE_READABILITY_BELOW_FLOOR"
  | "TEXT_OVERFLOW_UNRESOLVED"
  | "BALLOON_EXPANDED_NON_DESTRUCTIVELY"
  | "BALLOON_REPOSITIONED_FOR_KEEPOUT"
  | "KEEPOUT_COLLISION_RESIDUAL"
  | "EXTREME_EXPANSION_RATIO"
  | "TAIL_ANCHOR_STRETCHED";

export interface ReflowDiagnosticWarning {
  readonly code: ReflowWarningCode;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
}

export interface KeepoutCollisionItem {
  readonly keepoutId: string;
  readonly kind: KeepoutRegionKind;
  readonly overlapAreaPx2: number;
  readonly weightedOverlapScore: number;
}

export interface KeepoutCollisionResolutionResult {
  readonly originalCenter: Point2D;
  readonly resolvedCenter: Point2D;
  readonly displacementPx: number;
  readonly moved: boolean;
  readonly initialOverlapAreaPx2: number;
  readonly residualOverlapAreaPx2: number;
  readonly remainingCollisions: readonly KeepoutCollisionItem[];
  readonly outOfCutBoundsAreaPx2: number;
  readonly tailDistanceDeltaPx: number;
}

export interface NonDestructiveGeometryDelta {
  readonly originalGeometry: BalloonGeometrySpec;
  readonly resolvedGeometry: BalloonGeometrySpec;
  readonly expanded: boolean;
  readonly repositioned: boolean;
  readonly radiusScaleX: number;
  readonly radiusScaleY: number;
  readonly deltaCenterX: number;
  readonly deltaCenterY: number;
}

export interface AdaptiveBalloonReflowResult {
  readonly balloonId: string;
  readonly targetLocale: SupportedL10nLocale;
  readonly writingMode: TypographyWritingMode;
  readonly expansion: LocalizedTextExpansionEstimate;
  readonly mobileMinReadableFontSizePx: number;
  readonly resolvedTypography: {
    readonly fontSizePx: number;
    readonly fontWeight: number;
    readonly lineHeightRatio: number;
    readonly letterSpacingEm: number;
  };
  readonly layout: MultilingualBalloonLayoutResult;
  readonly geometryDelta: NonDestructiveGeometryDelta;
  readonly collisionResolution: KeepoutCollisionResolutionResult;
  readonly warnings: readonly ReflowDiagnosticWarning[];
  readonly readabilityScore: number;
  readonly convergedIterations: number;
  readonly status: "fitted" | "fitted-expanded" | "overflow";
}

const DEFAULT_MOBILE_REF_WIDTH_PX = 800;
const DEFAULT_KEEPOUT_MARGIN_PX = 8;
const DEFAULT_CUT_SAFE_MARGIN_PX = 12;
const DEFAULT_MAX_EXPANSION_RATIO = 1.48;
const DEFAULT_BINARY_SEARCH_ITERATIONS = 14;
const EXPANSION_SEARCH_ITERATIONS = 10;

const KEEPOUT_PRIORITY_MAP: Readonly<Record<KeepoutRegionKind, number>> = Object.freeze({
  "character-eyes": 16,
  "character-face": 12,
  "focal-artwork": 9,
  sfx: 7,
  "other-balloon": 6,
  "cut-edge-gutter": 5,
});

function clamp(value: number, min: number, max: number): number {
  return min > max ? (min + max) / 2 : Math.max(min, Math.min(max, value));
}

function innerDimensionsOf(g: BalloonGeometrySpec): { readonly innerWidthPx: number; readonly innerHeightPx: number } {
  const padX = g.paddingX ?? Math.max(10, g.radiusX * 0.14);
  const padY = g.paddingY ?? Math.max(8, g.radiusY * 0.14);
  return { innerWidthPx: Math.max(16, g.radiusX * 2 - padX * 2), innerHeightPx: Math.max(16, g.radiusY * 2 - padY * 2) };
}

/** 타원·사각 말풍선과 팽창된 Keepout AABB 사이의 해석적 교차 면적(px^2)을 계산한다. */
export function computeBalloonRectOverlapAreaPx2(
  balloon: { readonly contour: BalloonContourKind; readonly centerX: number; readonly centerY: number; readonly radiusX: number; readonly radiusY: number },
  rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
): number {
  const ix1 = Math.max(balloon.centerX - balloon.radiusX, rect.x);
  const ix2 = Math.min(balloon.centerX + balloon.radiusX, rect.x + rect.width);
  const iy1 = Math.max(balloon.centerY - balloon.radiusY, rect.y);
  const iy2 = Math.min(balloon.centerY + balloon.radiusY, rect.y + rect.height);
  if (ix2 <= ix1 || iy2 <= iy1) return 0;

  if (balloon.contour === "rectangle" || balloon.contour === "rounded-rect") return (ix2 - ix1) * (iy2 - iy1);

  // 축정렬 타원-AABB 정확 필요충분 분리 판정
  const ndx = (clamp(balloon.centerX, rect.x, rect.x + rect.width) - balloon.centerX) / Math.max(1, balloon.radiusX);
  const ndy = (clamp(balloon.centerY, rect.y, rect.y + rect.height) - balloon.centerY) / Math.max(1, balloon.radiusY);
  if (ndx * ndx + ndy * ndy >= 1) return 0;

  const strips = 16;
  const dx = (ix2 - ix1) / strips;
  let area = 0;
  for (let i = 0; i < strips; i += 1) {
    const nx = (ix1 + (i + 0.5) * dx - balloon.centerX) / Math.max(1, balloon.radiusX);
    const halfSpanY = balloon.radiusY * Math.sqrt(Math.max(0, 1 - nx * nx));
    const overlapY = Math.max(0, Math.min(balloon.centerY + halfSpanY, rect.y + rect.height) - Math.max(balloon.centerY - halfSpanY, rect.y));
    area += overlapY * dx;
  }
  return area;
}

function evaluatePlacementScore(
  balloon: BalloonGeometrySpec,
  candidateCenterX: number,
  candidateCenterY: number,
  cutBounds: CutFrameBounds,
  keepoutRects: readonly KeepoutRect[]
) {
  const safeMargin = cutBounds.safeMarginPx ?? DEFAULT_CUT_SAFE_MARGIN_PX;
  let totalOverlapAreaPx2 = 0;
  let weightedOverlapSum = 0;
  const collisions: KeepoutCollisionItem[] = [];

  for (const k of keepoutRects) {
    const m = k.marginPx ?? DEFAULT_KEEPOUT_MARGIN_PX;
    const overlap = computeBalloonRectOverlapAreaPx2(
      { contour: balloon.contour, centerX: candidateCenterX, centerY: candidateCenterY, radiusX: balloon.radiusX, radiusY: balloon.radiusY },
      { x: k.x - m, y: k.y - m, width: k.width + m * 2, height: k.height + m * 2 }
    );
    if (overlap > 0.01) {
      const weighted = overlap * (k.priority ?? KEEPOUT_PRIORITY_MAP[k.kind]);
      totalOverlapAreaPx2 += overlap;
      weightedOverlapSum += weighted;
      collisions.push({ keepoutId: k.id, kind: k.kind, overlapAreaPx2: Number(overlap.toFixed(2)), weightedOverlapScore: Number(weighted.toFixed(2)) });
    }
  }

  const outX =
    Math.max(0, cutBounds.x + safeMargin + balloon.radiusX - candidateCenterX) +
    Math.max(0, candidateCenterX - (cutBounds.x + cutBounds.width - safeMargin - balloon.radiusX));
  const outY =
    Math.max(0, cutBounds.y + safeMargin + balloon.radiusY - candidateCenterY) +
    Math.max(0, candidateCenterY - (cutBounds.y + cutBounds.height - safeMargin - balloon.radiusY));
  const outOfCutBoundsAreaPx2 = Math.max(0, outX * balloon.radiusY * 2 + outY * balloon.radiusX * 2 - outX * outY);
  const displacementPx = Math.hypot(candidateCenterX - balloon.centerX, candidateCenterY - balloon.centerY);
  const tailDistanceDeltaPx = balloon.tailTip
    ? Math.abs(Math.hypot(balloon.tailTip.x - candidateCenterX, balloon.tailTip.y - candidateCenterY) - Math.hypot(balloon.tailTip.x - balloon.centerX, balloon.tailTip.y - balloon.centerY))
    : 0;

  return {
    score: weightedOverlapSum * 1000 + outOfCutBoundsAreaPx2 * 25_000 + displacementPx * 3.5 + tailDistanceDeltaPx * 1.4,
    totalOverlapAreaPx2, collisions, outOfCutBoundsAreaPx2, displacementPx, tailDistanceDeltaPx,
  };
}

/** 말풍선과 캐릭터 얼굴·작화 금지 영역(`keepoutRects`)의 충돌을 자동 회피·재배치한다. */
export function resolveBalloonKeepoutCollisions(params: {
  readonly balloon: BalloonGeometrySpec;
  readonly cutBounds: CutFrameBounds;
  readonly keepoutRects: readonly KeepoutRect[];
}): KeepoutCollisionResolutionResult {
  const { balloon, cutBounds, keepoutRects } = params;
  const safeMargin = cutBounds.safeMarginPx ?? DEFAULT_CUT_SAFE_MARGIN_PX;
  const minCX = cutBounds.x + safeMargin + balloon.radiusX;
  const maxCX = cutBounds.x + cutBounds.width - safeMargin - balloon.radiusX;
  const minCY = cutBounds.y + safeMargin + balloon.radiusY;
  const maxCY = cutBounds.y + cutBounds.height - safeMargin - balloon.radiusY;

  const initial = evaluatePlacementScore(balloon, balloon.centerX, balloon.centerY, cutBounds, keepoutRects);
  if (initial.totalOverlapAreaPx2 <= 0.01 && initial.outOfCutBoundsAreaPx2 <= 0.01) {
    return {
      originalCenter: { x: balloon.centerX, y: balloon.centerY },
      resolvedCenter: { x: balloon.centerX, y: balloon.centerY },
      displacementPx: 0, moved: false, initialOverlapAreaPx2: 0, residualOverlapAreaPx2: 0,
      remainingCollisions: [], outOfCutBoundsAreaPx2: 0, tailDistanceDeltaPx: 0,
    };
  }

  const candidates: Point2D[] = [];
  const pushClamped = (x: number, y: number): void => {
    candidates.push({ x: clamp(x, minCX, maxCX), y: clamp(y, minCY, maxCY) });
  };
  pushClamped(balloon.centerX, balloon.centerY);

  // 각 Keepout 영역의 8방위 접선 스냅 후보
  for (const k of keepoutRects) {
    const m = (k.marginPx ?? DEFAULT_KEEPOUT_MARGIN_PX) + 2;
    const lx = k.x - m - balloon.radiusX;
    const rx = k.x + k.width + m + balloon.radiusX;
    const ty = k.y - m - balloon.radiusY;
    const by = k.y + k.height + m + balloon.radiusY;
    pushClamped(lx, balloon.centerY); pushClamped(rx, balloon.centerY);
    pushClamped(balloon.centerX, ty); pushClamped(balloon.centerX, by);
    pushClamped(lx, ty); pushClamped(rx, ty); pushClamped(lx, by); pushClamped(rx, by);
  }

  // 16방위 동심 나선 탐색 및 4분면 코너 안전 거점
  const maxSearchRadius = Math.hypot(cutBounds.width, cutBounds.height) * 0.75;
  for (let ring = 1; ring <= 12; ring += 1) {
    const dist = (maxSearchRadius * ring) / 12;
    for (let a = 0; a < 16; a += 1) {
      const theta = (Math.PI * 2 * a) / 16;
      pushClamped(balloon.centerX + Math.cos(theta) * dist, balloon.centerY + Math.sin(theta) * dist);
    }
  }
  pushClamped(minCX, minCY); pushClamped(maxCX, minCY); pushClamped(minCX, maxCY); pushClamped(maxCX, maxCY);

  let bestPoint: Point2D = { x: balloon.centerX, y: balloon.centerY };
  let bestEval = initial;
  for (const pt of candidates) {
    const ev = evaluatePlacementScore(balloon, pt.x, pt.y, cutBounds, keepoutRects);
    if (ev.score < bestEval.score - 0.001) { bestEval = ev; bestPoint = pt; }
  }

  return {
    originalCenter: { x: Number(balloon.centerX.toFixed(2)), y: Number(balloon.centerY.toFixed(2)) },
    resolvedCenter: { x: Number(bestPoint.x.toFixed(2)), y: Number(bestPoint.y.toFixed(2)) },
    displacementPx: Number(bestEval.displacementPx.toFixed(2)),
    moved: bestEval.displacementPx > 0.5,
    initialOverlapAreaPx2: Number(initial.totalOverlapAreaPx2.toFixed(2)),
    residualOverlapAreaPx2: Number(bestEval.totalOverlapAreaPx2.toFixed(2)),
    remainingCollisions: bestEval.collisions,
    outOfCutBoundsAreaPx2: Number(bestEval.outOfCutBoundsAreaPx2.toFixed(2)),
    tailDistanceDeltaPx: Number(bestEval.tailDistanceDeltaPx.toFixed(2)),
  };
}

function deriveAdaptiveTypographyForFontSize(
  fontSizePx: number, baseFontSizePx: number, baseFontWeight: number,
  baseLineHeightRatio: number, baseLetterSpacingEm: number,
  locale: SupportedL10nLocale, expansionRatio: number
) {
  const profile = MULTILINGUAL_TYPOGRAPHY_PROFILES[locale];
  const shrinkRatio = clamp(fontSizePx / Math.max(1, baseFontSizePx), 0.5, 1.25);
  const compT = clamp((1 - shrinkRatio) / 0.35, 0, 1);
  const lineHeightRatio = expansionRatio < 0.85
    ? Math.min(profile.maxLineHeightRatio, baseLineHeightRatio + 0.05)
    : baseLineHeightRatio - (baseLineHeightRatio - profile.minLineHeightRatio) * compT * 0.72;
  const letterSpacingEm = baseLetterSpacingEm - (baseLetterSpacingEm - profile.minLetterSpacingEm) * compT * 0.75;

  let fontWeight = baseFontWeight;
  if (shrinkRatio < 0.85) {
    fontWeight = profile.scriptFamily === "cjk-han"
      ? Math.min(500, baseFontWeight)
      : Math.min(profile.fontWeightRange.max, Math.max(500, baseFontWeight));
  }
  fontWeight = Math.round(clamp(fontWeight, profile.fontWeightRange.min, profile.fontWeightRange.max) / 100) * 100;

  return {
    fontSizePx, fontWeight,
    lineHeightRatio: Number(clamp(lineHeightRatio, profile.minLineHeightRatio, profile.maxLineHeightRatio).toFixed(3)),
    letterSpacingEm: Number(clamp(letterSpacingEm, profile.minLetterSpacingEm, profile.maxLetterSpacingEm).toFixed(4)),
  };
}

/** 번역 대사를 가독성 하한 내 이진 탐색·비파괴 말풍선 확장·금지 영역 회피 순으로 자동 리플로우한다. */
export function reflowLocalizedSpeechBalloon(
  balloon: BalloonGeometrySpec,
  options: AdaptiveReflowOptions
): AdaptiveBalloonReflowResult {
  const profile = MULTILINGUAL_TYPOGRAPHY_PROFILES[options.targetLocale];
  const writingMode: TypographyWritingMode =
    options.writingMode ?? (options.targetLocale === "ja" ? "vertical-rl" : profile.defaultWritingMode);
  const widthScale = options.cutBounds.width / (options.mobileReferenceWidthPx ?? DEFAULT_MOBILE_REF_WIDTH_PX);
  const mobileMinReadableFontSizePx = Number(
    (options.minFontSizePxOverride ?? profile.minReadableFontSizePxAt800w * Math.max(0.75, widthScale)).toFixed(2)
  );

  const expansion = estimateLocalizedTextExpansion({
    sourceText: options.sourceText ?? options.targetText,
    sourceLocale: options.sourceLocale ?? "ko",
    targetLocale: options.targetLocale,
    targetText: options.targetText,
  });

  const baseWeight = options.baseFontWeight ?? profile.fontWeightRange.default;
  const baseLineHeight = options.baseLineHeightRatio ?? profile.defaultLineHeightRatio;
  const baseLetterSpacing = options.baseLetterSpacingEm ?? profile.defaultLetterSpacingEm;
  const maxFontSizePx = options.maxFontSizePxOverride ?? (expansion.expansionRatio < 0.85 ? Number((options.baseFontSizePx * 1.12).toFixed(2)) : options.baseFontSizePx);
  const minSearchFont = Math.min(mobileMinReadableFontSizePx, maxFontSizePx);
  const iterations = Math.max(6, options.binarySearchIterations ?? DEFAULT_BINARY_SEARCH_ITERATIONS);

  const evaluateCandidate = (geom: BalloonGeometrySpec, fontSizePx: number) => {
    const typography = deriveAdaptiveTypographyForFontSize(
      fontSizePx, options.baseFontSizePx, baseWeight, baseLineHeight, baseLetterSpacing,
      options.targetLocale, expansion.expansionRatio
    );
    const { innerWidthPx, innerHeightPx } = innerDimensionsOf(geom);
    const layout = layoutMultilingualBalloonLines({
      text: options.targetText, locale: options.targetLocale, writingMode, contour: geom.contour,
      innerWidthPx, innerHeightPx, fontSizePx: typography.fontSizePx, fontWeight: typography.fontWeight,
      lineHeightRatio: typography.lineHeightRatio, letterSpacingEm: typography.letterSpacingEm,
      allowHyphenation: options.allowHyphenation,
    });
    return { typography, layout };
  };

  // Phase 1: 원본 말풍선 반지름 내 이진 탐색 자동 피팅
  let low = minSearchFont;
  let high = maxFontSizePx;
  let bestFit: ReturnType<typeof evaluateCandidate> | null = null;
  const topCheck = evaluateCandidate(balloon, high);
  let convergedIterations = 1;
  if (topCheck.layout.fitsInsideBalloon) {
    bestFit = topCheck;
  } else {
    const floorCheck = evaluateCandidate(balloon, low);
    convergedIterations += 1;
    if (floorCheck.layout.fitsInsideBalloon) {
      bestFit = floorCheck;
      for (let i = 0; i < iterations; i += 1) {
        const mid = (low + high) / 2;
        const probe = evaluateCandidate(balloon, mid);
        convergedIterations += 1;
        if (probe.layout.fitsInsideBalloon) { bestFit = probe; low = mid; }
        else high = mid;
      }
    }
  }

  let resolvedGeometry: BalloonGeometrySpec = { ...balloon };
  let finalEval = bestFit ?? evaluateCandidate(balloon, minSearchFont);
  let radiusScaleX = 1;
  let radiusScaleY = 1;
  let expanded = false;

  // Phase 2: 가독성 하한 사수 + 비파괴 반지름 확장 이진 탐색
  const maxExpand = Math.max(1, balloon.maxRadiusExpansionRatio ?? DEFAULT_MAX_EXPANSION_RATIO);
  if (!finalEval.layout.fitsInsideBalloon && (balloon.allowNonDestructiveExpansion ?? true) && maxExpand > 1.001) {
    const buildExpanded = (scale: number): BalloonGeometrySpec => {
      const sx = writingMode === "vertical-rl" ? 1 + (scale - 1) * 0.92 : Math.min(maxExpand, 1 + (scale - 1) * 1.08);
      const sy = writingMode === "vertical-rl" ? Math.min(maxExpand, 1 + (scale - 1) * 1.08) : 1 + (scale - 1) * 0.96;
      return { ...balloon, radiusX: Number((balloon.radiusX * sx).toFixed(2)), radiusY: Number((balloon.radiusY * sy).toFixed(2)) };
    };
    const maxGeom = buildExpanded(maxExpand);
    const maxProbe = evaluateCandidate(maxGeom, minSearchFont);
    if (maxProbe.layout.fitsInsideBalloon) {
      let sLow = 1.0;
      let sHigh = maxExpand;
      let bestG = maxGeom;
      let bestE = maxProbe;
      for (let i = 0; i < EXPANSION_SEARCH_ITERATIONS; i += 1) {
        const sMid = (sLow + sHigh) / 2;
        const mg = buildExpanded(sMid);
        const mp = evaluateCandidate(mg, minSearchFont);
        convergedIterations += 1;
        if (mp.layout.fitsInsideBalloon) { bestG = mg; bestE = mp; sHigh = sMid; }
        else sLow = sMid;
      }
      resolvedGeometry = bestG;
      finalEval = bestE;
    } else {
      resolvedGeometry = maxGeom;
      finalEval = maxProbe;
    }
    expanded = true;
    radiusScaleX = Number((resolvedGeometry.radiusX / Math.max(1, balloon.radiusX)).toFixed(3));
    radiusScaleY = Number((resolvedGeometry.radiusY / Math.max(1, balloon.radiusY)).toFixed(3));
  }

  // Phase 3: 인물 얼굴·작화 Keepout 충돌 회피 및 안전 재배치
  const collisionResolution = resolveBalloonKeepoutCollisions({
    balloon: resolvedGeometry, cutBounds: options.cutBounds, keepoutRects: options.keepoutRects ?? [],
  });
  if (collisionResolution.moved) {
    resolvedGeometry = { ...resolvedGeometry, centerX: collisionResolution.resolvedCenter.x, centerY: collisionResolution.resolvedCenter.y };
  }

  const warnings: ReflowDiagnosticWarning[] = [];
  if (!expansion.isWithinNominalBand) {
    warnings.push({ code: "EXTREME_EXPANSION_RATIO", severity: "warning", message: `번역 대사 길이 비율(${expansion.expansionRatio}×)이 표준 리플로우 대역(0.65×~1.85×)을 벗어났습니다.` });
  }
  if (finalEval.typography.fontSizePx < mobileMinReadableFontSizePx - 0.05) {
    warnings.push({ code: "MOBILE_READABILITY_BELOW_FLOOR", severity: "error", message: `폰트 크기(${finalEval.typography.fontSizePx.toFixed(1)}px)가 모바일 800px 최소 가독 하한(${mobileMinReadableFontSizePx.toFixed(1)}px) 미만입니다.` });
  } else if (finalEval.typography.fontSizePx <= mobileMinReadableFontSizePx + 0.25) {
    warnings.push({ code: "MOBILE_READABILITY_FLOOR_HIT", severity: "warning", message: `폰트 크기가 모바일 800px 최소 가독 하한(${mobileMinReadableFontSizePx.toFixed(1)}px)에 도달했습니다.` });
  }
  if (expanded) {
    warnings.push({ code: "BALLOON_EXPANDED_NON_DESTRUCTIVELY", severity: "info", message: `가독성 유지를 위해 말풍선 반지름을 비파괴 확장했습니다(${radiusScaleX}× / ${radiusScaleY}×).` });
  }
  if (collisionResolution.moved) {
    warnings.push({ code: "BALLOON_REPOSITIONED_FOR_KEEPOUT", severity: "info", message: `인물·작화 금지 영역 회피를 위해 말풍선 중심을 ${collisionResolution.displacementPx.toFixed(1)}px 이동했습니다.` });
  }
  if (collisionResolution.residualOverlapAreaPx2 > 0.1) {
    warnings.push({ code: "KEEPOUT_COLLISION_RESIDUAL", severity: "warning", message: `컷 안전 영역 제약으로 잔여 금지 영역 겹침(${collisionResolution.residualOverlapAreaPx2.toFixed(1)}px²)이 남았습니다.` });
  }
  if (collisionResolution.tailDistanceDeltaPx > Math.max(balloon.radiusX, balloon.radiusY) * 0.9) {
    warnings.push({ code: "TAIL_ANCHOR_STRETCHED", severity: "warning", message: `말풍선 이동으로 꼬리 앵커 거리가 ${collisionResolution.tailDistanceDeltaPx.toFixed(1)}px 늘어났습니다.` });
  }
  if (!finalEval.layout.fitsInsideBalloon) {
    warnings.push({ code: "TEXT_OVERFLOW_UNRESOLVED", severity: "error", message: `최대 비파괴 확장(${maxExpand}×) 이후에도 대사가 말풍선을 넘칩니다.` });
  }

  const readabilityScore = Number(clamp(
    88 + finalEval.layout.diamondSymmetryScore * 12
      - Math.max(0, (1 - finalEval.typography.fontSizePx / Math.max(1, options.baseFontSizePx)) * 28)
      - (finalEval.layout.fitsInsideBalloon ? 0 : 42)
      - (collisionResolution.residualOverlapAreaPx2 > 0.1 ? 18 : 0)
      - (finalEval.typography.fontSizePx < mobileMinReadableFontSizePx - 0.05 ? 25 : 0),
    0, 100
  ).toFixed(1));

  return {
    balloonId: balloon.balloonId, targetLocale: options.targetLocale, writingMode, expansion, mobileMinReadableFontSizePx,
    resolvedTypography: {
      fontSizePx: Number(finalEval.typography.fontSizePx.toFixed(2)),
      fontWeight: finalEval.typography.fontWeight,
      lineHeightRatio: finalEval.typography.lineHeightRatio,
      letterSpacingEm: finalEval.typography.letterSpacingEm,
    },
    layout: finalEval.layout,
    geometryDelta: {
      originalGeometry: balloon, resolvedGeometry, expanded, repositioned: collisionResolution.moved,
      radiusScaleX, radiusScaleY,
      deltaCenterX: Number((resolvedGeometry.centerX - balloon.centerX).toFixed(2)),
      deltaCenterY: Number((resolvedGeometry.centerY - balloon.centerY).toFixed(2)),
    },
    collisionResolution, warnings, readabilityScore, convergedIterations,
    status: !finalEval.layout.fitsInsideBalloon ? "overflow" : expanded ? "fitted-expanded" : "fitted",
  };
}
