/**
 * Wave 161 — 웹툰 세로 스크롤 컷 높이 자동 리플로우 & 거터 재조정 솔버.
 *
 * - 캐릭터 얼굴·눈 보호 영역 가림 면적 0px²(`faceOcclusionAreaPx === 0`) 우선 보장
 * - 말풍선 간 충돌 면적 0px²(`balloonOverlapAreaPx === 0`) 보장
 * - `maxPanelHeightScale` 상한 내에서 컷 높이 확장 및 `minGutterPx` 이상 거터 재분배
 * - 한계 초과 극단 확장 시 조용히 자르거나 얼굴을 가리지 않고 명시적 경고(`overflowUnresolvedCount > 0`) 출력
 */

import {
  SUPPORTED_LOCALIZATION_LOCALES,
  resolveReflowConstraints,
  type BalloonPlacementStrategy,
  type EpisodeMultilingualMatrixAudit,
  type LocaleMatrixEntry,
  type LocalizedBalloonEstimate,
  type MultilingualEpisodeReflowResult,
  type ProtectedFocalZone,
  type Rect2D,
  type ReflowAuditVerdict,
  type ReflowSolverConstraints,
  type ReflowedPanelResult,
  type ReflowedTextBlock,
  type TextBlockSpec,
  type WebtoonLocalizationLocale,
  type WebtoonPanelSpec,
} from "./multilingual-reflow-types";
import { LOCALE_TYPOGRAPHY_PROFILES, estimateLocalizedBalloonBox } from "./script-expansion-estimator";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 두 사각형의 겹침 면적(px²)을 계산한다. */
export function computeRectIntersectionAreaPx(a: Rect2D, b: Rect2D): number {
  const xOverlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  if (xOverlap <= 0) return 0;
  const yOverlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (yOverlap <= 0) return 0;
  return round2(xOverlap * yOverlap);
}

function expandRect(rect: Rect2D, pad: number): Rect2D {
  if (pad <= 0) return rect;
  return { x: rect.x - pad, y: rect.y - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 };
}

function totalFaceOverlap(rect: Rect2D, zones: readonly ProtectedFocalZone[], pad: number): number {
  let sum = 0;
  for (const zone of zones) {
    const effectivePad = pad > 0 ? Math.max(pad, zone.clearanceMarginPx ?? 0) : 0;
    sum += computeRectIntersectionAreaPx(rect, expandRect(zone.rect, effectivePad));
  }
  return round2(sum);
}

function totalBalloonOverlap(rect: Rect2D, others: readonly Rect2D[], gap: number): number {
  let sum = 0;
  for (const other of others) {
    sum += computeRectIntersectionAreaPx(rect, expandRect(other, gap));
  }
  return round2(sum);
}

function computeOutOfBoundsArea(rect: Rect2D, panelWidth: number, panelHeight: number): number {
  const x1 = clamp(rect.x, 0, panelWidth);
  const y1 = clamp(rect.y, 0, panelHeight);
  const x2 = clamp(rect.x + rect.width, 0, panelWidth);
  const y2 = clamp(rect.y + rect.height, 0, panelHeight);
  const inside = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return round2(Math.max(0, rect.width * rect.height - inside));
}

function dedupeSortedIntegers(values: readonly number[], minVal: number, maxVal: number): number[] {
  const clamped = values
    .map((v) => Math.round(clamp(v, minVal, maxVal)))
    .filter((v) => Number.isFinite(v));
  clamped.sort((a, b) => a - b);
  const unique: number[] = [];
  for (const v of clamped) {
    if (unique.length === 0 || unique[unique.length - 1] !== v) unique.push(v);
  }
  return unique;
}

interface PlacementSearchContext {
  readonly panelWidth: number;
  readonly workingPanelHeight: number;
  readonly maxPanelHeight: number;
  readonly zones: readonly ProtectedFocalZone[];
  readonly placedRects: readonly Rect2D[];
  readonly minReadingY: number;
  readonly constraints: ReflowSolverConstraints;
}

interface CandidatePlacement {
  readonly rect: Rect2D;
  readonly score: number;
}

function buildCandidateCoordinates(
  block: TextBlockSpec,
  targetWidth: number,
  targetHeight: number,
  ctx: PlacementSearchContext,
): { readonly xs: number[]; readonly ys: number[] } {
  const margin = ctx.constraints.panelSafeMarginPx;
  const maxX = Math.max(margin, ctx.panelWidth - margin - targetWidth);
  const maxY = Math.max(margin, ctx.maxPanelHeight - margin - targetHeight);
  const pad = ctx.constraints.faceSafetyPaddingPx;
  const gap = ctx.constraints.minBalloonGapPx;

  const rawXs: number[] = [
    block.baselineRect.x,
    block.baselineRect.x + (block.baselineRect.width - targetWidth) / 2,
    margin,
    maxX,
    margin + (maxX - margin) * 0.25,
    margin + (maxX - margin) * 0.5,
    margin + (maxX - margin) * 0.75,
  ];
  const rawYs: number[] = [block.baselineRect.y, margin, maxY];

  for (const zone of ctx.zones) {
    const zPad = Math.max(pad, zone.clearanceMarginPx ?? 0);
    rawXs.push(zone.rect.x - zPad - targetWidth, zone.rect.x - 1 - targetWidth);
    rawXs.push(zone.rect.x + zone.rect.width + zPad, zone.rect.x + zone.rect.width + 1);
    rawYs.push(zone.rect.y - zPad - targetHeight, zone.rect.y - 1 - targetHeight);
    rawYs.push(zone.rect.y + zone.rect.height + zPad, zone.rect.y + zone.rect.height + 1);
  }
  for (const placed of ctx.placedRects) {
    rawXs.push(placed.x - gap - targetWidth, placed.x + placed.width + gap);
    rawYs.push(placed.y - gap - targetHeight, placed.y + placed.height + gap, placed.y + placed.height + 2);
  }
  const stepY = Math.max(18, Math.round((maxY - margin) / 28));
  for (let y = margin; y <= maxY; y += stepY) rawYs.push(y);

  return {
    xs: dedupeSortedIntegers(rawXs, margin, maxX),
    ys: dedupeSortedIntegers(rawYs, margin, maxY),
  };
}

function searchNonOverlappingCandidate(
  block: TextBlockSpec,
  targetWidth: number,
  targetHeight: number,
  ctx: PlacementSearchContext,
): CandidatePlacement | null {
  const margin = ctx.constraints.panelSafeMarginPx;
  if (targetWidth > ctx.panelWidth - margin * 2 + 1 || targetHeight > ctx.maxPanelHeight - margin * 2 + 1) {
    return null;
  }

  const { xs, ys } = buildCandidateCoordinates(block, targetWidth, targetHeight, ctx);
  let best: CandidatePlacement | null = null;
  const baseX = block.baselineRect.x;
  const baseY = block.baselineRect.y;

  for (const y of ys) {
    for (const x of xs) {
      const candidate: Rect2D = { x, y, width: targetWidth, height: targetHeight };
      if (totalFaceOverlap(candidate, ctx.zones, 0) > 0) continue;
      if (totalBalloonOverlap(candidate, ctx.placedRects, 0) > 0) continue;

      const softFacePenalty =
        totalFaceOverlap(candidate, ctx.zones, ctx.constraints.faceSafetyPaddingPx) > 0 ? 180 : 0;
      const softGapPenalty =
        totalBalloonOverlap(candidate, ctx.placedRects, ctx.constraints.minBalloonGapPx) > 0 ? 120 : 0;
      const growthNeededPx = Math.max(0, y + targetHeight + margin - ctx.workingPanelHeight);
      const readingOrderPenalty = y + 24 < ctx.minReadingY ? (ctx.minReadingY - y) * 1.4 : 0;
      const score =
        growthNeededPx * 3.2 +
        softFacePenalty +
        softGapPenalty +
        readingOrderPenalty +
        Math.hypot(x - baseX, y - baseY);

      if (best === null || score < best.score) {
        best = { rect: candidate, score };
      }
    }
  }
  return best;
}

/**
 * 극단 오버플로우로 `maxPanelHeightScale` 상한에 도달했을 때,
 * 얼굴을 절대 가리지 않고 기존 말풍선과도 겹치지 않는 최대 안전 슬롯을 찾아 반환한다.
 */
function findLargestSafeCappedSlot(
  block: TextBlockSpec,
  desiredWidth: number,
  desiredHeight: number,
  ctx: PlacementSearchContext,
): Rect2D {
  const margin = ctx.constraints.panelSafeMarginPx;
  const usableWidth = Math.max(36, ctx.panelWidth - margin * 2);
  const usableHeight = Math.max(28, ctx.maxPanelHeight - margin * 2);
  const cappedMaxWidth = Math.min(usableWidth, Math.round(desiredWidth * 1.25));
  const widthCandidates = dedupeSortedIntegers(
    [cappedMaxWidth, desiredWidth, block.baselineRect.width, Math.round(usableWidth * 0.5)],
    Math.min(36, usableWidth),
    usableWidth,
  ).reverse();

  const cappedCtx: PlacementSearchContext = {
    ...ctx,
    workingPanelHeight: ctx.maxPanelHeight,
    minReadingY: 0,
  };

  let bestRect: Rect2D | null = null;
  let bestScore = -Infinity;

  for (const w of widthCandidates) {
    const minH = Math.min(28, usableHeight);
    const maxH = Math.min(desiredHeight, usableHeight);
    const step = Math.max(12, Math.round((maxH - minH) / 14));
    for (let h = maxH; h >= minH; h -= step) {
      const candidate = searchNonOverlappingCandidate(block, w, h, cappedCtx);
      if (candidate !== null) {
        const score = candidate.rect.height * 1000 + candidate.rect.width * candidate.rect.height - candidate.score * 0.1;
        if (score > bestScore) {
          bestScore = score;
          bestRect = candidate.rect;
        }
        break;
      }
    }
  }

  if (bestRect !== null) return bestRect;
  const fallbackW = Math.min(desiredWidth, usableWidth);
  const fallbackH = Math.min(desiredHeight, usableHeight);
  return { x: margin, y: Math.max(margin, ctx.maxPanelHeight - margin - fallbackH), width: fallbackW, height: fallbackH };
}

type SolvedPanelCore = Omit<
  ReflowedPanelResult,
  "baselineYStartPx" | "baselineYEndPx" | "yStartPx" | "yEndPx" | "gutterAfterPx" | "gutterDeltaPx"
>;

function solveSinglePanelReflow(
  panel: WebtoonPanelSpec,
  locale: WebtoonLocalizationLocale,
  constraints: ReflowSolverConstraints,
): SolvedPanelCore {
  const margin = constraints.panelSafeMarginPx;
  const usableWidth = Math.max(60, panel.widthPx - margin * 2);
  const maxPanelHeightPx = Math.max(
    panel.baselineHeightPx,
    Math.round(panel.baselineHeightPx * constraints.maxPanelHeightScale),
  );
  const minPanelHeightPx = Math.max(
    panel.minHeightPx ?? 120,
    Math.round(panel.baselineHeightPx * constraints.minPanelHeightScale),
  );

  let workingPanelHeightPx = panel.baselineHeightPx;
  let heightCapReached = false;
  const warnings: string[] = [];

  const indexedBlocks = panel.textBlocks.map((block, originalIndex) => ({ block, originalIndex }));
  indexedBlocks.sort((a, b) => {
    const pDiff = (a.block.priority ?? a.originalIndex) - (b.block.priority ?? b.originalIndex);
    if (pDiff !== 0) return pDiff;
    if (a.block.baselineRect.y !== b.block.baselineRect.y) return a.block.baselineRect.y - b.block.baselineRect.y;
    return a.block.baselineRect.x - b.block.baselineRect.x;
  });

  const placedRects: Rect2D[] = [];
  const solvedByOriginalIndex: Array<ReflowedTextBlock | undefined> = new Array(panel.textBlocks.length);
  const canContract = Boolean(panel.allowVerticalContraction || constraints.allowPanelContraction);
  let lastReadingY = margin;

  for (const { block, originalIndex } of indexedBlocks) {
    const estimate: LocalizedBalloonEstimate = estimateLocalizedBalloonBox(block, locale, {
      panelWidthPx: panel.widthPx,
      panelBaselineHeightPx: panel.baselineHeightPx,
      constraints,
    });

    const isFit = estimate.overflowStatus === "fits" || estimate.overflowStatus === "font-adjusted";
    let desiredWidth = isFit
      ? block.baselineRect.width
      : clamp(Math.max(block.baselineRect.width, estimate.requiredOuterWidthPx), block.baselineRect.width, usableWidth);
    let desiredHeight = isFit
      ? canContract
        ? Math.max(estimate.requiredOuterHeightPx, Math.round(block.baselineRect.height * 0.85))
        : block.baselineRect.height
      : Math.max(block.baselineRect.height, estimate.requiredOuterHeightPx);

    const clampedBaselineX = Math.round(
      clamp(block.baselineRect.x, margin, Math.max(margin, panel.widthPx - margin - desiredWidth)),
    );
    const inPlaceCandidate: Rect2D = {
      x: clampedBaselineX,
      y: Math.round(block.baselineRect.y),
      width: Math.round(desiredWidth),
      height: Math.round(desiredHeight),
    };
    const inPlaceClear =
      inPlaceCandidate.y >= margin &&
      inPlaceCandidate.y + inPlaceCandidate.height <= workingPanelHeightPx - margin &&
      totalFaceOverlap(inPlaceCandidate, panel.protectedZones, 0) === 0 &&
      totalBalloonOverlap(inPlaceCandidate, placedRects, 0) === 0;

    let resolvedRect: Rect2D;
    let placementStrategy: BalloonPlacementStrategy;
    let overflowUnresolved = false;

    if (inPlaceClear) {
      resolvedRect = inPlaceCandidate;
      placementStrategy = isFit ? "in-place" : "expanded-in-place";
    } else {
      const searchCtx: PlacementSearchContext = {
        panelWidth: panel.widthPx,
        workingPanelHeight: workingPanelHeightPx,
        maxPanelHeight: maxPanelHeightPx,
        zones: panel.protectedZones,
        placedRects,
        minReadingY: lastReadingY,
        constraints,
      };
      let best = searchNonOverlappingCandidate(block, Math.round(desiredWidth), Math.round(desiredHeight), searchCtx);

      // 말풍선 비율을 무너뜨리지 않는 범위(최대 기준 폭의 1.52배) 내에서만 2차 폭 보정 허용
      const fallbackMaxRatio = Math.min(1.52, (block.maxWidthExpansionRatio ?? 1.36) * 1.12);
      const fallbackMaxWidth = Math.min(usableWidth, Math.round(block.baselineRect.width * fallbackMaxRatio));
      if (best === null && desiredWidth < fallbackMaxWidth) {
        const widerEstimate = estimateLocalizedBalloonBox(
          { ...block, maxWidthExpansionRatio: fallbackMaxWidth / Math.max(1, block.baselineRect.width) },
          locale,
          { panelWidthPx: panel.widthPx, panelBaselineHeightPx: maxPanelHeightPx, constraints },
        );
        const widerW = Math.min(fallbackMaxWidth, Math.max(desiredWidth, widerEstimate.requiredOuterWidthPx));
        const widerH = Math.max(28, widerEstimate.requiredOuterHeightPx);
        best = searchNonOverlappingCandidate(block, Math.round(widerW), Math.round(widerH), searchCtx);
        if (best !== null) {
          desiredWidth = widerW;
          desiredHeight = widerH;
        }
      }

      if (best !== null) {
        resolvedRect = best.rect;
        const neededPanelH = Math.ceil(resolvedRect.y + resolvedRect.height + margin);
        if (neededPanelH > workingPanelHeightPx) {
          workingPanelHeightPx = Math.min(maxPanelHeightPx, neededPanelH);
        }
        const shiftX = resolvedRect.x - block.baselineRect.x;
        const shiftY = resolvedRect.y - block.baselineRect.y;
        if (workingPanelHeightPx > panel.baselineHeightPx && resolvedRect.y + resolvedRect.height > panel.baselineHeightPx - margin) {
          placementStrategy = "panel-extended-below";
        } else if (Math.abs(shiftY) >= Math.abs(shiftX)) {
          placementStrategy = "repositioned-vertical";
        } else {
          placementStrategy = "repositioned-horizontal";
        }
      } else {
        workingPanelHeightPx = maxPanelHeightPx;
        heightCapReached = true;
        overflowUnresolved = true;
        placementStrategy = "capped-overflow";
        resolvedRect = findLargestSafeCappedSlot(block, Math.round(desiredWidth), Math.round(desiredHeight), searchCtx);
        const shortagePx = Math.max(1, Math.round(desiredHeight - resolvedRect.height));
        warnings.push(
          `[${panel.panelId}/${block.blockId}] ${LOCALE_TYPOGRAPHY_PROFILES[locale].displayNameKo} 번역 텍스트가 최대 컷 확장 상한(${Math.round(constraints.maxPanelHeightScale * 100)}%)을 초과해 높이 ${shortagePx}px가 미해소 상태입니다. 대사 축약 또는 컷 분할이 필요합니다.`,
        );
      }
    }

    const faceOcclusionAreaPx = totalFaceOverlap(resolvedRect, panel.protectedZones, 0);
    const balloonOverlapAreaPx = totalBalloonOverlap(resolvedRect, placedRects, 0);
    const outOfPanelBoundsPx = computeOutOfBoundsArea(resolvedRect, panel.widthPx, workingPanelHeightPx);
    if (outOfPanelBoundsPx > 0) {
      overflowUnresolved = true;
      warnings.push(`[${panel.panelId}/${block.blockId}] 배치 영역이 컷 경계를 ${outOfPanelBoundsPx}px² 벗어났습니다.`);
    }

    placedRects.push(resolvedRect);
    lastReadingY = Math.max(lastReadingY, resolvedRect.y);
    solvedByOriginalIndex[originalIndex] = {
      blockId: block.blockId,
      kind: block.kind,
      baselineRect: block.baselineRect,
      resolvedRect,
      estimate,
      shiftXPx: round2(resolvedRect.x - block.baselineRect.x),
      shiftYPx: round2(resolvedRect.y - block.baselineRect.y),
      faceOcclusionAreaPx,
      balloonOverlapAreaPx,
      outOfPanelBoundsPx,
      overflowUnresolved,
      placementStrategy,
    };
  }

  if (canContract && workingPanelHeightPx === panel.baselineHeightPx) {
    let contentBottom = minPanelHeightPx;
    for (const zone of panel.protectedZones) {
      contentBottom = Math.max(contentBottom, zone.rect.y + zone.rect.height + margin + (zone.clearanceMarginPx ?? 0));
    }
    for (const rect of placedRects) {
      contentBottom = Math.max(contentBottom, rect.y + rect.height + margin);
    }
    if (contentBottom < panel.baselineHeightPx) {
      workingPanelHeightPx = Math.max(minPanelHeightPx, Math.ceil(contentBottom));
    }
  }

  const resolvedBlocks = solvedByOriginalIndex.filter((item): item is ReflowedTextBlock => item !== undefined);
  const heightDeltaPx = workingPanelHeightPx - panel.baselineHeightPx;
  const heightScaleRatio = round4(workingPanelHeightPx / Math.max(1, panel.baselineHeightPx));
  if (heightScaleRatio >= constraints.maxPanelHeightScale - 1e-4 && heightDeltaPx > 0) {
    heightCapReached = true;
  }

  return {
    panelId: panel.panelId,
    panelIndex: panel.panelIndex,
    widthPx: panel.widthPx,
    baselineHeightPx: panel.baselineHeightPx,
    resolvedHeightPx: workingPanelHeightPx,
    heightDeltaPx,
    heightScaleRatio,
    heightCapReached,
    baselineGutterAfterPx: panel.baselineGutterAfterPx,
    protectedZones: panel.protectedZones,
    blocks: resolvedBlocks,
    totalFaceOcclusionAreaPx: round2(resolvedBlocks.reduce((acc, b) => acc + b.faceOcclusionAreaPx, 0)),
    totalBalloonOverlapAreaPx: round2(resolvedBlocks.reduce((acc, b) => acc + b.balloonOverlapAreaPx, 0)),
    overflowUnresolvedCount: resolvedBlocks.filter((b) => b.overflowUnresolved).length,
    warnings,
  };
}

/** 단일 로케일에 대해 회차 전체 컷 높이와 거터를 결정론적으로 리플로우한다. */
export function solveMultilingualPanelReflow(
  episodeId: string,
  panels: readonly WebtoonPanelSpec[],
  targetLocale: WebtoonLocalizationLocale,
  partialConstraints?: Partial<ReflowSolverConstraints>,
): MultilingualEpisodeReflowResult {
  const constraints = resolveReflowConstraints(partialConstraints);
  const solvedPanels: ReflowedPanelResult[] = [];
  const allWarnings: string[] = [];

  let baselineCursorY = 0;
  let resolvedCursorY = 0;
  let baselinePanelHeightSum = 0;
  let resolvedPanelHeightSum = 0;
  let baselineGutterSum = 0;
  let resolvedGutterSum = 0;
  let interPanelGutterCount = 0;
  let minResolvedGutterPx = Number.POSITIVE_INFINITY;
  let sumPanelHeightDeltasPx = 0;
  let sumGutterDeltasPx = 0;

  for (let i = 0; i < panels.length; i += 1) {
    const panel = panels[i];
    if (!panel) continue;

    const core = solveSinglePanelReflow(panel, targetLocale, constraints);
    const isLastPanel = i === panels.length - 1;
    let gutterAfterPx = 0;

    if (panel.baselineGutterAfterPx > 0 || !isLastPanel) {
      const baseGutter = panel.baselineGutterAfterPx > 0 ? panel.baselineGutterAfterPx : constraints.minGutterPx;
      const proportional = baseGutter * (1 + (core.heightScaleRatio - 1) * constraints.targetPacingWeight);
      gutterAfterPx = Math.round(clamp(proportional, constraints.minGutterPx, constraints.maxGutterPx));
      interPanelGutterCount += 1;
      if (gutterAfterPx < minResolvedGutterPx) minResolvedGutterPx = gutterAfterPx;
    }

    const gutterDeltaPx = gutterAfterPx - panel.baselineGutterAfterPx;
    const baselineYStartPx = baselineCursorY;
    const baselineYEndPx = baselineYStartPx + panel.baselineHeightPx;
    const yStartPx = resolvedCursorY;
    const yEndPx = yStartPx + core.resolvedHeightPx;

    baselineCursorY = baselineYEndPx + panel.baselineGutterAfterPx;
    resolvedCursorY = yEndPx + gutterAfterPx;
    baselinePanelHeightSum += panel.baselineHeightPx;
    resolvedPanelHeightSum += core.resolvedHeightPx;
    baselineGutterSum += panel.baselineGutterAfterPx;
    resolvedGutterSum += gutterAfterPx;
    sumPanelHeightDeltasPx += core.heightDeltaPx;
    sumGutterDeltasPx += gutterDeltaPx;
    allWarnings.push(...core.warnings);

    solvedPanels.push({
      ...core,
      baselineYStartPx,
      baselineYEndPx,
      yStartPx,
      yEndPx,
      gutterAfterPx,
      gutterDeltaPx,
    });
  }

  let monotonicCoordinatesValid = true;
  for (let i = 0; i < solvedPanels.length; i += 1) {
    const cur = solvedPanels[i];
    if (!cur || cur.yEndPx <= cur.yStartPx || cur.gutterAfterPx < 0) {
      monotonicCoordinatesValid = false;
      break;
    }
    if (i > 0) {
      const prev = solvedPanels[i - 1];
      if (!prev || cur.yStartPx !== prev.yEndPx + prev.gutterAfterPx || cur.yStartPx < prev.yEndPx) {
        monotonicCoordinatesValid = false;
        break;
      }
    }
  }

  const totalHeightDeltaPx = resolvedCursorY - baselineCursorY;
  const heightGrowthPercent = baselineCursorY > 0 ? round2((totalHeightDeltaPx / baselineCursorY) * 100) : 0;
  const baselineRhythm = baselinePanelHeightSum > 0 ? baselineGutterSum / baselinePanelHeightSum : 0;
  const resolvedRhythm = resolvedPanelHeightSum > 0 ? resolvedGutterSum / resolvedPanelHeightSum : 0;
  const pacingDriftRatio = baselineRhythm > 0 ? round4(Math.abs(resolvedRhythm - baselineRhythm) / baselineRhythm) : 0;

  const totalFaceOcclusionAreaPx = round2(solvedPanels.reduce((acc, p) => acc + p.totalFaceOcclusionAreaPx, 0));
  const totalBalloonOverlapAreaPx = round2(solvedPanels.reduce((acc, p) => acc + p.totalBalloonOverlapAreaPx, 0));
  const overflowUnresolvedCount = solvedPanels.reduce((acc, p) => acc + p.overflowUnresolvedCount, 0);
  const heightCappedPanelCount = solvedPanels.filter((p) => p.heightCapReached).length;

  let verdict: ReflowAuditVerdict = "PASS";
  if (totalFaceOcclusionAreaPx > 0 || totalBalloonOverlapAreaPx > 0 || !monotonicCoordinatesValid) {
    verdict = "FAIL";
  } else if (overflowUnresolvedCount > 0 || pacingDriftRatio > 0.28) {
    verdict = "WARN";
  }

  return {
    episodeId,
    targetLocale,
    baselineLocale: "ko",
    constraints,
    panels: solvedPanels,
    baselineTotalScrollHeightPx: baselineCursorY,
    resolvedTotalScrollHeightPx: resolvedCursorY,
    totalHeightDeltaPx,
    sumPanelHeightDeltasPx,
    sumGutterDeltasPx,
    heightGrowthPercent,
    baselineAverageGutterPx: interPanelGutterCount > 0 ? round2(baselineGutterSum / interPanelGutterCount) : 0,
    resolvedAverageGutterPx: interPanelGutterCount > 0 ? round2(resolvedGutterSum / interPanelGutterCount) : 0,
    minResolvedGutterPx: Number.isFinite(minResolvedGutterPx) ? minResolvedGutterPx : 0,
    pacingDriftRatio,
    totalFaceOcclusionAreaPx,
    totalBalloonOverlapAreaPx,
    overflowUnresolvedCount,
    heightCappedPanelCount,
    monotonicCoordinatesValid,
    exportReady:
      verdict === "PASS" &&
      overflowUnresolvedCount === 0 &&
      totalFaceOcclusionAreaPx === 0 &&
      totalBalloonOverlapAreaPx === 0 &&
      monotonicCoordinatesValid,
    verdict,
    warnings: allWarnings,
  };
}

/** 6개국어(또는 지정 로케일 목록) 전체를 동시 리플로우·감사해 확장 스트레스 순위 매트릭스를 생성한다. */
export function auditEpisodeMultilingualReflowMatrix(
  episodeId: string,
  panels: readonly WebtoonPanelSpec[],
  options?: {
    readonly targetLocales?: readonly WebtoonLocalizationLocale[];
    readonly constraints?: Partial<ReflowSolverConstraints>;
  },
): EpisodeMultilingualMatrixAudit {
  const localesAudited: readonly WebtoonLocalizationLocale[] =
    options?.targetLocales && options.targetLocales.length > 0
      ? options.targetLocales
      : SUPPORTED_LOCALIZATION_LOCALES;

  const resultsByLocale: Partial<Record<WebtoonLocalizationLocale, MultilingualEpisodeReflowResult>> = {};
  for (const locale of localesAudited) {
    resultsByLocale[locale] = solveMultilingualPanelReflow(episodeId, panels, locale, options?.constraints);
  }

  const unsortedEntries = localesAudited.map((locale) => {
    const res = resultsByLocale[locale];
    if (!res) throw new Error(`Missing reflow result for locale ${locale}`);
    return {
      locale,
      displayNameKo: LOCALE_TYPOGRAPHY_PROFILES[locale].displayNameKo,
      heightGrowthPercent: res.heightGrowthPercent,
      totalHeightDeltaPx: res.totalHeightDeltaPx,
      pacingDriftRatio: res.pacingDriftRatio,
      totalFaceOcclusionAreaPx: res.totalFaceOcclusionAreaPx,
      totalBalloonOverlapAreaPx: res.totalBalloonOverlapAreaPx,
      overflowUnresolvedCount: res.overflowUnresolvedCount,
      exportReady: res.exportReady,
      verdict: res.verdict,
    };
  });

  const sortedForStress = [...unsortedEntries].sort((a, b) => {
    if (b.overflowUnresolvedCount !== a.overflowUnresolvedCount) {
      return b.overflowUnresolvedCount - a.overflowUnresolvedCount;
    }
    if (b.heightGrowthPercent !== a.heightGrowthPercent) return b.heightGrowthPercent - a.heightGrowthPercent;
    if (b.totalHeightDeltaPx !== a.totalHeightDeltaPx) return b.totalHeightDeltaPx - a.totalHeightDeltaPx;
    const expDiff =
      LOCALE_TYPOGRAPHY_PROFILES[b.locale].charExpansionFactor -
      LOCALE_TYPOGRAPHY_PROFILES[a.locale].charExpansionFactor;
    return expDiff !== 0 ? expDiff : a.locale.localeCompare(b.locale);
  });

  const rankedEntries: LocaleMatrixEntry[] = sortedForStress.map((entry, idx) => ({
    ...entry,
    stressRank: idx + 1,
  }));

  const compactSorted = [...unsortedEntries].sort((a, b) => {
    if (a.heightGrowthPercent !== b.heightGrowthPercent) return a.heightGrowthPercent - b.heightGrowthPercent;
    if (a.totalHeightDeltaPx !== b.totalHeightDeltaPx) return a.totalHeightDeltaPx - b.totalHeightDeltaPx;
    const expDiff =
      LOCALE_TYPOGRAPHY_PROFILES[a.locale].charExpansionFactor -
      LOCALE_TYPOGRAPHY_PROFILES[b.locale].charExpansionFactor;
    return expDiff !== 0 ? expDiff : a.locale.localeCompare(b.locale);
  });

  const worstEntry = rankedEntries[0];
  const compactEntry = compactSorted[0];
  let overallVerdict: ReflowAuditVerdict = "PASS";
  if (rankedEntries.some((e) => e.verdict === "FAIL")) overallVerdict = "FAIL";
  else if (rankedEntries.some((e) => e.verdict === "WARN")) overallVerdict = "WARN";

  return {
    episodeId,
    localesAudited,
    resultsByLocale,
    rankedEntries,
    worstCaseLocale: worstEntry ? worstEntry.locale : "ko",
    mostCompactLocale: compactEntry ? compactEntry.locale : "ko",
    maxHeightGrowthPercent: worstEntry ? worstEntry.heightGrowthPercent : 0,
    minHeightGrowthPercent: compactEntry ? compactEntry.heightGrowthPercent : 0,
    zeroOcclusionAllLocales: rankedEntries.every((e) => e.totalFaceOcclusionAreaPx === 0),
    zeroOverlapAllLocales: rankedEntries.every((e) => e.totalBalloonOverlapAreaPx === 0),
    allLocalesExportReady: rankedEntries.every((e) => e.exportReady),
    overallVerdict,
  };
}
