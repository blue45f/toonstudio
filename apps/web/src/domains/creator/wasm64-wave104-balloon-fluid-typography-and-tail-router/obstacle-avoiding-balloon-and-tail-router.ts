/**
 * Wave 104 — 얼굴 회피 만화 말풍선 자동 배치 및 장애물 우회 곡선 베지어 꼬리 오케스트레이터.
 *
 * - 다중 후보 격자 + 시선 흐름 단조성(한국 웹툰형 TB-LR / 출판 만화형 RTL-TB) 스코어링
 * - 얼굴 보존 영역(faceKeepOutBoxes), 선배치 말풍선, 패널 안전 여백 무충돌 배치
 * - 확정 배치 결과에 2차 베지어 곡선 꼬리 라우팅과 꼬리 상호 교차 검수를 결합
 */

import {
  clamp,
  expandRect,
  pointDistance,
  pointInRect,
  polylinesCross,
  rectCenter,
  rectContainedInBounds,
  rectIntersectionArea,
  rectsOverlap,
  round2,
  segmentIntersectsRect,
  type Point2D,
  type Rect2D,
} from "./balloon-geometry-primitives";
import {
  routeCurvedSpeechBalloonTail,
  type BalloonTailKind,
  type RoutedBalloonTail,
  type RouteTailInput,
  type TailObstacle,
  type ThoughtBubbleDot,
} from "./curved-bezier-tail-router";
import {
  solveKoreanBalloonTypography,
  type BalloonShapeKind,
  type KoreanBalloonTypographyResult,
} from "./korean-balloon-typography-solver";

export {
  rectsOverlap,
  routeCurvedSpeechBalloonTail,
  type BalloonTailKind,
  type Point2D,
  type Rect2D,
  type RoutedBalloonTail,
  type RouteTailInput,
  type TailObstacle,
  type ThoughtBubbleDot,
};

export type ReadingOrderMode = "korean-webtoon-tb-lr" | "manga-rtl-tb";

export type PreferredAnchorZone =
  | "top-left" | "top-center" | "top-right"
  | "mid-left" | "mid-right"
  | "bottom-left" | "bottom-center" | "bottom-right"
  | "auto";

export interface FaceKeepOutBox {
  readonly id: string;
  readonly characterId?: string;
  readonly label?: string;
  readonly rect: Rect2D;
  readonly paddingPx?: number;
}

export interface DialogueBalloonItemSpec {
  readonly balloonId: string;
  readonly speakerId: string;
  readonly text: string;
  readonly shape: BalloonShapeKind;
  readonly fontSizePx: number;
  readonly speakerMouthPoint?: Point2D;
  readonly preferredAnchor?: PreferredAnchorZone;
  readonly maxLineWidthPx?: number;
  readonly lineHeightRatio?: number;
  readonly mouthClearancePx?: number;
}

export interface PanelBalloonLayoutSpec {
  readonly panelId: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly safeMarginPx: number;
  readonly readingOrder: ReadingOrderMode;
  readonly faceKeepOutBoxes: readonly FaceKeepOutBox[];
  readonly items: readonly DialogueBalloonItemSpec[];
  readonly referenceCanvasWidthPx?: number;
  readonly mobileViewportWidthPx?: number;
  readonly minMobileFontPx?: number;
}

export interface PanelBalloonLayoutOptions {
  readonly balloonGapPx?: number;
  readonly facePaddingPx?: number;
  readonly defaultMouthClearancePx?: number;
  readonly gridColumns?: number;
  readonly gridRows?: number;
  readonly allowAutoWidthReflow?: boolean;
}

export interface PlacedPanelBalloon {
  readonly orderIndex: number;
  readonly balloonId: string;
  readonly speakerId: string;
  readonly shape: BalloonShapeKind;
  readonly rect: Rect2D;
  readonly center: Point2D;
  readonly typography: KoreanBalloonTypographyResult;
  readonly speakerMouthPoint: Point2D | null;
  readonly tail: RoutedBalloonTail;
  readonly containedInSafeBounds: boolean;
  readonly faceOverlapCount: number;
  readonly balloonOverlapCount: number;
  readonly tailObstacleCrossings: number;
}

export interface PanelBalloonLayoutAudit {
  readonly balloonCount: number;
  readonly faceOverlapCount: number;
  readonly balloonOverlapCount: number;
  readonly outOfSafeMarginCount: number;
  readonly orphanLineCount: number;
  readonly forcedHardBreakCount: number;
  readonly readingOrderMonotonic: boolean;
  readonly readingOrderViolations: number;
  readonly tailObstacleCrossings: number;
  readonly tailPairCrossingCount: number;
  readonly crossingTailPairs: ReadonlyArray<readonly [string, string]>;
  readonly mobileLegibleBalloonCount: number;
  readonly mobileLegibilityFailureIds: readonly string[];
  readonly allMobileLegible: boolean;
  readonly minEffectiveMobileFontPx: number;
  readonly whitespaceCoverageRatio: number;
}

export interface PanelBalloonLayoutResult {
  readonly panelId: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly safeMarginPx: number;
  readonly safeBounds: Rect2D;
  readonly readingOrder: ReadingOrderMode;
  readonly faceKeepOutBoxes: readonly FaceKeepOutBox[];
  readonly placedBalloons: readonly PlacedPanelBalloon[];
  readonly readingFlowPoints: readonly Point2D[];
  readonly audit: PanelBalloonLayoutAudit;
}

export function isReadingOrderStepMonotonic(
  prevRect: Rect2D,
  nextRect: Rect2D,
  readingOrder: ReadingOrderMode,
): boolean {
  const prevC = rectCenter(prevRect);
  const nextC = rectCenter(nextRect);
  const dy = nextC.y - prevC.y;
  const dx = nextC.x - prevC.x;
  const rowBand = Math.max(24, Math.min(prevRect.height, nextRect.height) * 0.45);
  if (readingOrder === "korean-webtoon-tb-lr") {
    return dy >= rowBand || (dy >= -rowBand * 0.35 && dx >= 4) || (dy >= 2 && dx >= -6);
  }
  return dy >= rowBand || (dy >= -rowBand * 0.35 && dx <= -4) || (dy >= 2 && dx <= 6);
}

function preferredAnchorTargetPoint(zone: PreferredAnchorZone, safeBounds: Rect2D): Point2D | null {
  if (zone === "auto") return null;
  const xMap: Readonly<Record<string, number>> = {
    left: safeBounds.x + safeBounds.width * 0.18,
    center: safeBounds.x + safeBounds.width * 0.5,
    right: safeBounds.x + safeBounds.width * 0.82,
  };
  const yMap: Readonly<Record<string, number>> = {
    top: safeBounds.y + safeBounds.height * 0.16,
    mid: safeBounds.y + safeBounds.height * 0.5,
    bottom: safeBounds.y + safeBounds.height * 0.84,
  };
  const [yKey = "top", xKey = "center"] = zone.split("-");
  return {
    x: xMap[xKey] ?? safeBounds.x + safeBounds.width * 0.5,
    y: yMap[yKey] ?? safeBounds.y + safeBounds.height * 0.5,
  };
}

function buildTypographyVariants(
  item: DialogueBalloonItemSpec,
  spec: PanelBalloonLayoutSpec,
  safeBounds: Rect2D,
  allowReflow: boolean,
): ReadonlyArray<{ readonly typography: KoreanBalloonTypographyResult; readonly variantPenalty: number }> {
  const baseMaxW =
    item.maxLineWidthPx ??
    Math.min(safeBounds.width * 0.52, Math.max(item.fontSizePx * 7.5, item.fontSizePx * 11.5));
  const factors = allowReflow
    ? [{ factor: 1.0, penalty: 0 }, { factor: 0.8, penalty: 90 }, { factor: 0.65, penalty: 180 }, { factor: 1.18, penalty: 110 }]
    : [{ factor: 1.0, penalty: 0 }];

  const variants: Array<{ readonly typography: KoreanBalloonTypographyResult; readonly variantPenalty: number }> = [];
  const seen = new Set<string>();
  for (let i = 0; i < factors.length; i += 1) {
    const maxW = clamp(baseMaxW * factors[i].factor, item.fontSizePx * 3.5, Math.max(item.fontSizePx * 4, safeBounds.width - 24));
    const typography = solveKoreanBalloonTypography({
      text: item.text,
      shape: item.shape,
      fontSizePx: item.fontSizePx,
      maxLineWidthPx: maxW,
      lineHeightRatio: item.lineHeightRatio,
      referenceCanvasWidthPx: spec.referenceCanvasWidthPx ?? spec.widthPx,
      mobileViewportWidthPx: spec.mobileViewportWidthPx,
      minMobileFontPx: spec.minMobileFontPx,
    });
    const key = `${typography.balloonWidthPx}x${typography.balloonHeightPx}`;
    if (!seen.has(key)) {
      seen.add(key);
      variants.push({ typography, variantPenalty: factors[i].penalty });
    }
  }
  return variants;
}

function generateCandidateRects(
  width: number,
  height: number,
  safeBounds: Rect2D,
  paddedFaces: readonly Rect2D[],
  placedRects: readonly Rect2D[],
  balloonGapPx: number,
  mouthPoint: Point2D | undefined,
  preferredTarget: Point2D | null,
  gridCols: number,
  gridRows: number,
): readonly Rect2D[] {
  const maxX = Math.max(safeBounds.x, safeBounds.x + safeBounds.width - width);
  const maxY = Math.max(safeBounds.y, safeBounds.y + safeBounds.height - height);
  const seen = new Set<string>();
  const results: Rect2D[] = [];

  const pushXY = (rawX: number, rawY: number): void => {
    const x = round2(clamp(rawX, safeBounds.x, maxX));
    const y = round2(clamp(rawY, safeBounds.y, maxY));
    const key = `${Math.round(x)}:${Math.round(y)}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ x, y, width: round2(width), height: round2(height) });
    }
  };

  for (let r = 0; r < gridRows; r += 1) {
    const y = safeBounds.y + (gridRows > 1 ? r / (gridRows - 1) : 0) * (maxY - safeBounds.y);
    for (let c = 0; c < gridCols; c += 1) {
      const x = safeBounds.x + (gridCols > 1 ? c / (gridCols - 1) : 0) * (maxX - safeBounds.x);
      pushXY(x, y);
    }
  }
  if (mouthPoint) {
    const offsets: ReadonlyArray<readonly [number, number]> = [
      [-width * 0.5, -height - 34], [-width * 0.5, -height - 76],
      [-width - 24, -height * 0.85], [24, -height * 0.85],
      [-width * 0.5, 28], [-width - 28, -height * 0.25], [28, -height * 0.25],
    ];
    for (let i = 0; i < offsets.length; i += 1) pushXY(mouthPoint.x + offsets[i][0], mouthPoint.y + offsets[i][1]);
  }
  if (preferredTarget) pushXY(preferredTarget.x - width * 0.5, preferredTarget.y - height * 0.5);

  for (let i = 0; i < paddedFaces.length; i += 1) {
    const f = paddedFaces[i];
    pushXY(f.x, f.y - height - 6);
    pushXY(f.x + f.width - width, f.y - height - 6);
    pushXY(f.x - width - 6, f.y);
    pushXY(f.x + f.width + 6, f.y);
    pushXY(f.x, f.y + f.height + 6);
    pushXY(f.x + f.width - width, f.y + f.height + 6);
  }
  for (let i = 0; i < placedRects.length; i += 1) {
    const p = placedRects[i];
    pushXY(p.x, p.y + p.height + balloonGapPx);
    pushXY(p.x + p.width + balloonGapPx, p.y);
    pushXY(p.x - width - balloonGapPx, p.y);
    pushXY(p.x + p.width + balloonGapPx, p.y + p.height * 0.5);
    pushXY(p.x - width - balloonGapPx, p.y + p.height * 0.5);
  }
  return results;
}

function buildTailObstacles(
  balloonId: string,
  speakerId: string,
  speakerMouthPoint: Point2D | undefined,
  placedBalloons: ReadonlyArray<{ readonly balloonId: string; readonly rect: Rect2D }>,
  faceBoxes: readonly FaceKeepOutBox[],
  defaultFacePad: number,
): readonly TailObstacle[] {
  const obstacles: TailObstacle[] = [];
  for (let i = 0; i < placedBalloons.length; i += 1) {
    if (placedBalloons[i].balloonId !== balloonId) {
      obstacles.push({ id: placedBalloons[i].balloonId, kind: "balloon", rect: expandRect(placedBalloons[i].rect, 2) });
    }
  }
  for (let i = 0; i < faceBoxes.length; i += 1) {
    const face = faceBoxes[i];
    const expanded = expandRect(face.rect, Math.min(4, face.paddingPx ?? defaultFacePad));
    const isOwnFace =
      (face.characterId !== undefined && face.characterId === speakerId) ||
      (face.characterId === undefined && speakerMouthPoint !== undefined && pointInRect(speakerMouthPoint, expanded));
    if (!isOwnFace) obstacles.push({ id: face.id, kind: "face", rect: expanded });
  }
  return obstacles;
}

/**
 * 패널 내 모든 대사 말풍선을 얼굴 회피·상호 비겹침·시선 흐름 단조성 기준으로 배치하고
 * 장애물 우회 곡선 베지어 꼬리까지 통합 산출한다.
 */
export function layoutPanelBalloonsAndRouteTails(
  spec: PanelBalloonLayoutSpec,
  options?: PanelBalloonLayoutOptions,
): PanelBalloonLayoutResult {
  const widthPx = Math.max(120, Number.isFinite(spec.widthPx) ? spec.widthPx : 800);
  const heightPx = Math.max(120, Number.isFinite(spec.heightPx) ? spec.heightPx : 600);
  const safeMarginPx = clamp(spec.safeMarginPx, 0, Math.min(widthPx, heightPx) * 0.3);
  const safeBounds: Rect2D = {
    x: round2(safeMarginPx),
    y: round2(safeMarginPx),
    width: round2(widthPx - safeMarginPx * 2),
    height: round2(heightPx - safeMarginPx * 2),
  };
  const panelBounds: Rect2D = { x: 0, y: 0, width: round2(widthPx), height: round2(heightPx) };

  const balloonGapPx = options?.balloonGapPx ?? 12;
  const defaultFacePad = options?.facePaddingPx ?? 10;
  const defaultMouthClearancePx = options?.defaultMouthClearancePx ?? 14;
  const gridCols = clamp(Math.round(options?.gridColumns ?? 13), 5, 21);
  const gridRows = clamp(Math.round(options?.gridRows ?? 13), 5, 21);
  const allowReflow = options?.allowAutoWidthReflow ?? true;

  const paddedFaces = spec.faceKeepOutBoxes.map((box) => expandRect(box.rect, box.paddingPx ?? defaultFacePad));
  const preliminary: Array<{
    readonly orderIndex: number;
    readonly item: DialogueBalloonItemSpec;
    readonly rect: Rect2D;
    readonly typography: KoreanBalloonTypographyResult;
  }> = [];

  const totalItems = spec.items.length;
  const panelDiag = Math.hypot(safeBounds.width, safeBounds.height);

  for (let idx = 0; idx < totalItems; idx += 1) {
    const item = spec.items[idx];
    const variants = buildTypographyVariants(item, spec, safeBounds, allowReflow);
    const preferredTarget = preferredAnchorTargetPoint(item.preferredAnchor ?? "auto", safeBounds);
    const placedRects = preliminary.map((p) => p.rect);
    const prevRect = idx > 0 ? preliminary[idx - 1].rect : null;

    const progress = totalItems <= 1 ? 0.25 : idx / Math.max(1, totalItems - 1);
    const targetBandY = safeBounds.y + safeBounds.height * (0.12 + progress * 0.72);
    const targetBandX =
      spec.readingOrder === "manga-rtl-tb"
        ? safeBounds.x + safeBounds.width * (0.82 - progress * 0.64)
        : safeBounds.x + safeBounds.width * (0.18 + progress * 0.64);

    let bestScore = Number.POSITIVE_INFINITY;
    let bestRect: Rect2D = {
      x: safeBounds.x,
      y: safeBounds.y,
      width: Math.min(safeBounds.width, variants[0].typography.balloonWidthPx),
      height: Math.min(safeBounds.height, variants[0].typography.balloonHeightPx),
    };
    let bestTypography = variants[0].typography;

    for (let vi = 0; vi < variants.length; vi += 1) {
      const { typography, variantPenalty } = variants[vi];
      const candidates = generateCandidateRects(
        Math.min(safeBounds.width, typography.balloonWidthPx),
        Math.min(safeBounds.height, typography.balloonHeightPx),
        safeBounds,
        paddedFaces,
        placedRects,
        balloonGapPx,
        item.speakerMouthPoint,
        preferredTarget,
        gridCols,
        gridRows,
      );

      for (let ci = 0; ci < candidates.length; ci += 1) {
        const cand = candidates[ci];
        const candCenter = rectCenter(cand);

        let faceOverlaps = 0;
        let faceOverlapArea = 0;
        let minFaceClearance = panelDiag;
        for (let fi = 0; fi < paddedFaces.length; fi += 1) {
          const f = paddedFaces[fi];
          if (rectsOverlap(cand, f)) {
            faceOverlaps += 1;
            faceOverlapArea += rectIntersectionArea(cand, f);
          } else {
            const dx = Math.max(0, f.x - (cand.x + cand.width), cand.x - (f.x + f.width));
            const dy = Math.max(0, f.y - (cand.y + cand.height), cand.y - (f.y + f.height));
            minFaceClearance = Math.min(minFaceClearance, Math.hypot(dx, dy));
          }
        }

        let balloonHardOverlaps = 0;
        let balloonGapOverlaps = 0;
        let balloonOverlapArea = 0;
        for (let pi = 0; pi < placedRects.length; pi += 1) {
          const placed = placedRects[pi];
          if (rectsOverlap(cand, placed)) {
            balloonHardOverlaps += 1;
            balloonOverlapArea += rectIntersectionArea(cand, placed);
          } else if (rectsOverlap(cand, expandRect(placed, balloonGapPx))) {
            balloonGapOverlaps += 1;
          }
        }

        const outPenalty = rectContainedInBounds(cand, safeBounds) ? 0 : 1_000_000;
        const monotonicPenalty =
          prevRect !== null && !isReadingOrderStepMonotonic(prevRect, cand, spec.readingOrder) ? 85_000 : 0;

        let headroomPenalty = 0;
        const remaining = totalItems - 1 - idx;
        if (remaining > 0) {
          const bottomSpace = safeBounds.y + safeBounds.height - (cand.y + cand.height);
          const desired = Math.min(safeBounds.height * 0.55, remaining * 72);
          if (bottomSpace < desired) headroomPenalty = ((desired - bottomSpace) / Math.max(1, safeBounds.height)) * 220;
        }

        const speakerPenalty = item.speakerMouthPoint
          ? (pointDistance(candCenter, item.speakerMouthPoint) / Math.max(1, panelDiag)) * 420 +
            (candCenter.y > item.speakerMouthPoint.y + 30 ? 45 : 0)
          : 0;
        const bandPenalty =
          (Math.abs(candCenter.y - targetBandY) / Math.max(1, safeBounds.height)) * 240 +
          (Math.abs(candCenter.x - targetBandX) / Math.max(1, safeBounds.width)) * 165;
        const preferredPenalty = preferredTarget
          ? (pointDistance(candCenter, preferredTarget) / Math.max(1, panelDiag)) * 520
          : 0;

        let lineBlockPenalty = 0;
        if (item.speakerMouthPoint && item.shape !== "rounded-narration") {
          for (let fi = 0; fi < spec.faceKeepOutBoxes.length; fi += 1) {
            const fBox = spec.faceKeepOutBoxes[fi];
            if (fBox.characterId !== item.speakerId && segmentIntersectsRect(candCenter, item.speakerMouthPoint, fBox.rect)) {
              lineBlockPenalty += 120;
            }
          }
          for (let pi = 0; pi < placedRects.length; pi += 1) {
            if (segmentIntersectsRect(candCenter, item.speakerMouthPoint, placedRects[pi])) lineBlockPenalty += 150;
          }
        }

        const score =
          faceOverlaps * 2_000_000 +
          faceOverlapArea * 800 +
          balloonHardOverlaps * 2_000_000 +
          balloonOverlapArea * 800 +
          balloonGapOverlaps * 35_000 +
          outPenalty +
          monotonicPenalty +
          speakerPenalty +
          bandPenalty +
          preferredPenalty +
          headroomPenalty +
          lineBlockPenalty +
          (minFaceClearance < 8 ? (8 - minFaceClearance) * 14 : 0) +
          variantPenalty +
          typography.orphanLineCount * 400;

        if (score < bestScore) {
          bestScore = score;
          bestRect = cand;
          bestTypography = typography;
        }
      }
    }

    preliminary.push({ orderIndex: idx, item, rect: bestRect, typography: bestTypography });
  }

  const placedRectInfos = preliminary.map((p) => ({ balloonId: p.item.balloonId, rect: p.rect }));
  const routedTailLines: Array<readonly Point2D[]> = [];
  const placedBalloons: PlacedPanelBalloon[] = [];

  for (let i = 0; i < preliminary.length; i += 1) {
    const p = preliminary[i];
    const tail = routeCurvedSpeechBalloonTail({
      balloonId: p.item.balloonId,
      balloonRect: p.rect,
      shape: p.item.shape,
      speakerId: p.item.speakerId,
      speakerMouthPoint: p.item.speakerMouthPoint,
      mouthClearancePx: p.item.mouthClearancePx ?? defaultMouthClearancePx,
      panelBounds,
      obstacles: buildTailObstacles(
        p.item.balloonId,
        p.item.speakerId,
        p.item.speakerMouthPoint,
        placedRectInfos,
        spec.faceKeepOutBoxes,
        defaultFacePad,
      ),
      existingTailCenterlines: routedTailLines,
    });
    if (tail.tailKind !== "none" && tail.centerlineSamples.length >= 2) {
      routedTailLines.push(tail.centerlineSamples);
    }

    let finalFaceOverlaps = 0;
    for (let fi = 0; fi < spec.faceKeepOutBoxes.length; fi += 1) {
      if (rectsOverlap(p.rect, spec.faceKeepOutBoxes[fi].rect)) finalFaceOverlaps += 1;
    }
    let finalBalloonOverlaps = 0;
    for (let j = 0; j < preliminary.length; j += 1) {
      if (i !== j && rectsOverlap(p.rect, preliminary[j].rect)) finalBalloonOverlaps += 1;
    }

    const center = rectCenter(p.rect);
    placedBalloons.push({
      orderIndex: p.orderIndex,
      balloonId: p.item.balloonId,
      speakerId: p.item.speakerId,
      shape: p.item.shape,
      rect: p.rect,
      center: { x: round2(center.x), y: round2(center.y) },
      typography: p.typography,
      speakerMouthPoint: p.item.speakerMouthPoint
        ? { x: round2(p.item.speakerMouthPoint.x), y: round2(p.item.speakerMouthPoint.y) }
        : null,
      tail,
      containedInSafeBounds: rectContainedInBounds(p.rect, safeBounds),
      faceOverlapCount: finalFaceOverlaps,
      balloonOverlapCount: finalBalloonOverlaps,
      tailObstacleCrossings: tail.obstacleCrossings,
    });
  }

  const crossingTailPairs: Array<readonly [string, string]> = [];
  let totalFaceOverlapCount = 0;
  let totalBalloonPairOverlapCount = 0;
  let outOfSafeMarginCount = 0;
  let totalOrphanLineCount = 0;
  let totalForcedHardBreakCount = 0;
  let totalTailObstacleCrossings = 0;
  let totalBalloonArea = 0;
  const mobileFailureIds: string[] = [];
  let minMobileFont = Number.POSITIVE_INFINITY;

  for (let i = 0; i < placedBalloons.length; i += 1) {
    const b = placedBalloons[i];
    totalFaceOverlapCount += b.faceOverlapCount;
    if (!b.containedInSafeBounds) outOfSafeMarginCount += 1;
    totalOrphanLineCount += b.typography.orphanLineCount;
    totalForcedHardBreakCount += b.typography.forcedHardBreakCount;
    totalTailObstacleCrossings += b.tailObstacleCrossings;
    totalBalloonArea += b.rect.width * b.rect.height;
    minMobileFont = Math.min(minMobileFont, b.typography.mobileLegibility.effectiveMobileFontPx);
    if (!b.typography.mobileLegibility.meetsMobileLegibility) mobileFailureIds.push(b.balloonId);

    for (let j = i + 1; j < placedBalloons.length; j += 1) {
      const other = placedBalloons[j];
      if (rectsOverlap(b.rect, other.rect)) totalBalloonPairOverlapCount += 1;
      if (
        b.tail.tailKind !== "none" &&
        other.tail.tailKind !== "none" &&
        b.tail.centerlineSamples.length >= 2 &&
        other.tail.centerlineSamples.length >= 2 &&
        polylinesCross(b.tail.centerlineSamples, other.tail.centerlineSamples)
      ) {
        crossingTailPairs.push([b.balloonId, other.balloonId]);
      }
    }
  }

  let readingOrderViolations = 0;
  for (let i = 1; i < placedBalloons.length; i += 1) {
    if (!isReadingOrderStepMonotonic(placedBalloons[i - 1].rect, placedBalloons[i].rect, spec.readingOrder)) {
      readingOrderViolations += 1;
    }
  }

  return {
    panelId: spec.panelId,
    widthPx: round2(widthPx),
    heightPx: round2(heightPx),
    safeMarginPx: round2(safeMarginPx),
    safeBounds,
    readingOrder: spec.readingOrder,
    faceKeepOutBoxes: spec.faceKeepOutBoxes,
    placedBalloons,
    readingFlowPoints: placedBalloons.map((b) => b.center),
    audit: {
      balloonCount: placedBalloons.length,
      faceOverlapCount: totalFaceOverlapCount,
      balloonOverlapCount: totalBalloonPairOverlapCount,
      outOfSafeMarginCount,
      orphanLineCount: totalOrphanLineCount,
      forcedHardBreakCount: totalForcedHardBreakCount,
      readingOrderMonotonic: readingOrderViolations === 0,
      readingOrderViolations,
      tailObstacleCrossings: totalTailObstacleCrossings,
      tailPairCrossingCount: crossingTailPairs.length,
      crossingTailPairs,
      mobileLegibleBalloonCount: placedBalloons.length - mobileFailureIds.length,
      mobileLegibilityFailureIds: mobileFailureIds,
      allMobileLegible: mobileFailureIds.length === 0,
      minEffectiveMobileFontPx: placedBalloons.length > 0 ? round2(minMobileFont) : 0,
      whitespaceCoverageRatio: round2(clamp(1 - totalBalloonArea / Math.max(1, widthPx * heightPx), 0, 1)),
    },
  };
}
