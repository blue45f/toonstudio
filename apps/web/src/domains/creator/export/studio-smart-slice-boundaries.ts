import type { DialogueElementLike, DialoguePageLike } from "../lettering/studio-dialogue-batch";
import { isEffectivelyHidden } from "../studio-layers";
import { STUDIO_PROMO_CUT_MIN_SIZE } from "./studio-promo-cuts";
import { MAX_CANVAS_DIM } from "./studio-export";
import { planStripSlices, type ExportPreset, type StripSlice } from "./studio-export-presets";

export type SliceInspectableElementLike = DialogueElementLike & {
  readonly fontSize?: number;
};

export type SliceInspectablePageLike = Omit<DialoguePageLike, "elements"> & {
  readonly canvasH?: number;
  readonly name?: string;
  readonly elements: readonly SliceInspectableElementLike[];
};

export type StripSliceObstacleKind = "bubble" | "cut";

export interface StripSliceObstacle {
  readonly id: string;
  readonly pageIndex: number;
  readonly kind: StripSliceObstacleKind;
  readonly label: string;
  /** 리샘플된 전체 세로 스트립 기준 상단 Y(px). */
  readonly topY: number;
  /** 리샘플된 전체 세로 스트립 기준 하단 Y(px). */
  readonly bottomY: number;
}

export interface StripBoundaryCollision {
  readonly boundaryIndex: number;
  readonly y: number;
  readonly prevSliceHeight: number;
  readonly nextSliceHeight: number;
  readonly status: "bubble-cut" | "frame-cut" | "clean";
  readonly cutBubbles: readonly StripSliceObstacle[];
  readonly cutFrames: readonly StripSliceObstacle[];
}

export interface StripSliceInspectionReport {
  readonly targetWidth: number;
  readonly totalHeight: number;
  readonly maxSliceHeight: number;
  readonly slices: readonly StripSlice[];
  readonly boundaries: readonly number[];
  readonly obstacles: readonly StripSliceObstacle[];
  readonly boundaryReports: readonly StripBoundaryCollision[];
  readonly bubbleCutCount: number;
  readonly frameCutCount: number;
  readonly oversizedSliceIndices: readonly number[];
  readonly heightSumMatches: boolean;
  readonly orderMonotonic: boolean;
}

export const MIN_ADJUSTABLE_SLICE_HEIGHT_PX = 64;
const GUTTER_CLEARANCE_PX = 8;

function finitePositive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function summarizeTextPreview(raw: string | undefined, fallback: string): string {
  const trimmed = (raw ?? "").replace(/\s+/gu, " ").trim();
  if (!trimmed) return fallback;
  return trimmed.length > 18 ? `${trimmed.slice(0, 18)}…` : trimmed;
}

/**
 * 선택된 페이지들의 실제 캡처·리샘플 후 스트립 레이아웃과 말풍선·대사·컷 프레임 수직 구간을 추출한다.
 * `planPresetSliceExport`와 동일한 반올림 규칙을 사용해 `totalHeight`가 1px 오차 없이 일치한다.
 */
export function buildInspectableStripModel(input: {
  readonly pages: readonly SliceInspectablePageLike[];
  readonly sourceCanvasWidth: number;
  readonly fallbackPageHeight: number;
  readonly exportScale: number;
  readonly preset: ExportPreset;
  readonly maxCanvasDim?: number;
}): {
  readonly targetWidth: number;
  readonly totalHeight: number;
  readonly maxSliceHeight: number;
  readonly obstacles: readonly StripSliceObstacle[];
} {
  const maxCanvasDim = input.maxCanvasDim ?? MAX_CANVAS_DIM;
  const safeSourceWidth = Math.max(1, Math.round(input.sourceCanvasWidth));
  const capturedWidth = Math.max(1, Math.round(safeSourceWidth * input.exportScale));
  const targetWidth = input.preset.width > 0 ? input.preset.width : capturedWidth;
  const maxSliceHeight = Math.min(input.preset.maxImageHeight ?? maxCanvasDim, maxCanvasDim);

  const effectivePages: readonly SliceInspectablePageLike[] =
    input.pages.length > 0
      ? input.pages
      : [{ id: "fallback-page-1", canvasH: input.fallbackPageHeight, elements: [] }];

  const obstacles: StripSliceObstacle[] = [];
  let stripOffsetY = 0;

  effectivePages.forEach((page, pageIndex) => {
    const logicalH = finitePositive(page.canvasH, input.fallbackPageHeight);
    const capturedHeight = Math.max(1, Math.round(logicalH * input.exportScale));
    const pageStripHeight = Math.max(1, Math.round((capturedHeight * targetWidth) / capturedWidth));
    const yScale = pageStripHeight / logicalH;
    const groups = page.groups ?? [];
    let cutCounter = 0;
    let bubbleCounter = 0;

    for (const el of page.elements) {
      if (isEffectivelyHidden(el, groups)) continue;
      const rawY = typeof el.y === "number" && Number.isFinite(el.y) ? el.y : null;
      if (rawY === null) continue;

      if (el.type === "bubble" || el.type === "text" || el.type === "sfx") {
        const lineCount = Math.max(1, (el.text ?? "").split("\n").length);
        const estimatedTextH = Math.max(36, Math.round((el.fontSize ?? 24) * 1.45 * lineCount));
        const rawH = finitePositive(el.height, estimatedTextH);
        const topY = Math.max(
          stripOffsetY,
          Math.min(stripOffsetY + pageStripHeight, stripOffsetY + Math.round(rawY * yScale)),
        );
        const bottomY = Math.max(
          topY,
          Math.min(
            stripOffsetY + pageStripHeight,
            stripOffsetY + Math.round((rawY + rawH) * yScale),
          ),
        );
        if (bottomY - topY >= 4) {
          bubbleCounter += 1;
          const kindPrefix = el.type === "sfx" ? "효과음" : el.type === "text" ? "대사" : "말풍선";
          obstacles.push(
            Object.freeze({
              id: el.id || `p${pageIndex + 1}-bubble-${bubbleCounter}`,
              pageIndex,
              kind: "bubble",
              label: `${pageIndex + 1}P ${kindPrefix} "${summarizeTextPreview(el.text, `#${bubbleCounter}`)}"`,
              topY,
              bottomY,
            }),
          );
        }
        continue;
      }

      if (el.type === "frame") {
        const rawW = typeof el.width === "number" && Number.isFinite(el.width) ? el.width : 0;
        const rawH = typeof el.height === "number" && Number.isFinite(el.height) ? el.height : 0;
        if (rawW < STUDIO_PROMO_CUT_MIN_SIZE || rawH < STUDIO_PROMO_CUT_MIN_SIZE) continue;
        const topY = Math.max(
          stripOffsetY,
          Math.min(stripOffsetY + pageStripHeight, stripOffsetY + Math.round(rawY * yScale)),
        );
        const bottomY = Math.max(
          topY,
          Math.min(
            stripOffsetY + pageStripHeight,
            stripOffsetY + Math.round((rawY + rawH) * yScale),
          ),
        );
        if (bottomY - topY >= 8) {
          cutCounter += 1;
          obstacles.push(
            Object.freeze({
              id: el.id || `p${pageIndex + 1}-cut-${cutCounter}`,
              pageIndex,
              kind: "cut",
              label: el.name?.trim() || `${pageIndex + 1}P 컷 #${cutCounter}`,
              topY,
              bottomY,
            }),
          );
        }
      }
    }

    stripOffsetY += pageStripHeight;
  });

  return Object.freeze({
    targetWidth,
    totalHeight: stripOffsetY,
    maxSliceHeight,
    obstacles: Object.freeze(obstacles),
  });
}

/** 슬라이스 배열에서 내부 분할 경계 Y 목록(`0 < y < totalHeight`)을 추출한다. */
export function stripSlicesToBoundaries(slices: readonly StripSlice[]): number[] {
  if (slices.length <= 1) return [];
  const boundaries: number[] = [];
  for (let index = 1; index < slices.length; index += 1) {
    boundaries.push(slices[index]!.y);
  }
  return boundaries;
}

/**
 * 내부 분할 경계 Y 목록을 정렬·중복 제거해 연속된 `StripSlice[]`로 변환한다.
 * 항상 `index = 0..N-1` 순서와 `sum(height) === totalHeight`를 보장한다.
 */
export function boundariesToStripSlices(
  totalHeight: number,
  boundaries: readonly number[],
): StripSlice[] {
  if (totalHeight <= 0) return [];
  const sortedUnique = [...new Set(boundaries.map((value) => Math.round(value)))]
    .filter((value) => value > 0 && value < totalHeight)
    .sort((a, b) => a - b);

  if (sortedUnique.length === 0) {
    return [{ index: 0, y: 0, height: totalHeight }];
  }

  const slices: StripSlice[] = [];
  let prevY = 0;
  sortedUnique.forEach((boundaryY, idx) => {
    slices.push({
      index: idx,
      y: prevY,
      height: boundaryY - prevY,
    });
    prevY = boundaryY;
  });
  slices.push({
    index: sortedUnique.length,
    y: prevY,
    height: totalHeight - prevY,
  });
  return slices;
}

/**
 * 사용자 지정 `customSlices`가 출력 전체 높이·단조 순서·무결성 계약을 만족하는지 검증한다.
 */
export function resolveValidatedStripSlices(
  totalHeight: number,
  defaultSliceHeight: number,
  customSlices?: readonly StripSlice[] | null,
): StripSlice[] {
  if (!customSlices || customSlices.length === 0) {
    return planStripSlices(totalHeight, defaultSliceHeight);
  }
  let expectedY = 0;
  for (let index = 0; index < customSlices.length; index += 1) {
    const slice = customSlices[index]!;
    if (
      !Number.isInteger(slice.y) ||
      !Number.isInteger(slice.height) ||
      slice.height < 1 ||
      slice.y !== expectedY
    ) {
      throw new Error("분할 경계 순서가 올바르지 않아 내보내기를 중단했어요.");
    }
    expectedY += slice.height;
  }
  if (expectedY !== totalHeight) {
    throw new Error(
      `분할 경계 높이 합계(${expectedY}px)가 전체 출력 높이(${totalHeight}px)와 달라 내보내기를 중단했어요.`,
    );
  }
  return customSlices.map((slice, index) => ({
    index,
    y: slice.y,
    height: slice.height,
  }));
}

/** 개별 분할선 하나를 인접 경계 안에서 안전하게 이동한다(순서·전체 높이 자동 보존). */
export function adjustSingleSliceBoundary(input: {
  readonly totalHeight: number;
  readonly boundaries: readonly number[];
  readonly boundaryIndex: number;
  readonly nextY: number;
  readonly minSliceHeight?: number;
}): number[] {
  const { totalHeight, boundaries, boundaryIndex } = input;
  if (boundaryIndex < 0 || boundaryIndex >= boundaries.length || totalHeight <= 1) {
    return [...boundaries];
  }
  const prevY = boundaryIndex === 0 ? 0 : boundaries[boundaryIndex - 1]!;
  const followingY =
    boundaryIndex === boundaries.length - 1 ? totalHeight : boundaries[boundaryIndex + 1]!;
  const span = followingY - prevY;
  const minGap = Math.max(1, Math.min(input.minSliceHeight ?? MIN_ADJUSTABLE_SLICE_HEIGHT_PX, Math.floor((span - 1) / 2)));
  const minAllowed = prevY + minGap;
  const maxAllowed = followingY - minGap;
  const clamped = Math.max(minAllowed, Math.min(maxAllowed, Math.round(input.nextY)));
  return boundaries.map((value, idx) => (idx === boundaryIndex ? clamped : value));
}

function boundaryCostAt(
  y: number,
  idealY: number,
  obstacles: readonly StripSliceObstacle[],
): number {
  let bubblePenalty = 0;
  let cutPenalty = 0;
  let nearBubblePenalty = 0;
  for (const obs of obstacles) {
    if (obs.topY < y && y < obs.bottomY) {
      if (obs.kind === "bubble") {
        bubblePenalty += 1_000_000;
      } else {
        cutPenalty += 10_000;
      }
    } else if (
      obs.kind === "bubble" &&
      obs.topY - GUTTER_CLEARANCE_PX < y &&
      y < obs.bottomY + GUTTER_CLEARANCE_PX
    ) {
      nearBubblePenalty += 500;
    }
  }
  const distanceCost = Math.abs(idealY - y);
  return bubblePenalty + cutPenalty + nearBubblePenalty + distanceCost;
}

/**
 * 플랫폼 최대 분할 높이(`maxSliceHeight`)를 넘기지 않으면서 말풍선·대사와 컷 절단을 최소화하는
 * 안전 여백(Gutter) 분할 경계를 계산한다.
 */
export function planSmartStripSliceBoundaries(input: {
  readonly totalHeight: number;
  readonly maxSliceHeight: number;
  readonly obstacles: readonly StripSliceObstacle[];
}): number[] {
  const { totalHeight, maxSliceHeight, obstacles } = input;
  if (totalHeight <= 0 || maxSliceHeight <= 0 || totalHeight <= maxSliceHeight) {
    return [];
  }

  const minStep = Math.max(
    MIN_ADJUSTABLE_SLICE_HEIGHT_PX,
    Math.min(maxSliceHeight - 1, Math.round(maxSliceHeight * 0.35)),
  );
  const boundaries: number[] = [];
  let currentY = 0;

  while (totalHeight - currentY > maxSliceHeight) {
    const idealY = currentY + maxSliceHeight;
    const minCandidateY = Math.max(currentY + 1, Math.min(idealY, currentY + minStep));

    // 후보 집합: idealY + 장애물 상·하단 여백 지점 + 16px 간격 샘플링
    const candidateSet = new Set<number>([idealY]);
    for (let sampleY = idealY; sampleY >= minCandidateY; sampleY -= 16) {
      candidateSet.add(sampleY);
    }
    for (const obs of obstacles) {
      const above = obs.topY - GUTTER_CLEARANCE_PX;
      const below = obs.bottomY + GUTTER_CLEARANCE_PX;
      const exactTop = obs.topY;
      const exactBottom = obs.bottomY;
      for (const candidate of [above, below, exactTop, exactBottom]) {
        if (candidate >= minCandidateY && candidate <= idealY) {
          candidateSet.add(Math.round(candidate));
        }
      }
    }

    let bestY = idealY;
    let bestCost = Number.POSITIVE_INFINITY;
    const sortedCandidates = [...candidateSet].sort((a, b) => b - a);
    for (const candidateY of sortedCandidates) {
      if (candidateY <= currentY || candidateY >= totalHeight) continue;
      const cost = boundaryCostAt(candidateY, idealY, obstacles);
      if (cost < bestCost) {
        bestCost = cost;
        bestY = candidateY;
      }
    }

    boundaries.push(bestY);
    currentY = bestY;
  }

  return boundaries;
}

/** 현재 분할 경계의 말풍선·컷 절단 여부 및 순서·전체 높이 불변식을 종합 진단한다. */
export function analyzeStripSlicePlan(input: {
  readonly targetWidth: number;
  readonly totalHeight: number;
  readonly maxSliceHeight: number;
  readonly boundaries: readonly number[];
  readonly obstacles: readonly StripSliceObstacle[];
}): StripSliceInspectionReport {
  const slices = boundariesToStripSlices(input.totalHeight, input.boundaries);
  const actualBoundaries = stripSlicesToBoundaries(slices);

  let bubbleCutCount = 0;
  let frameCutCount = 0;
  const boundaryReports: StripBoundaryCollision[] = actualBoundaries.map((y, boundaryIndex) => {
    const cutBubbles = input.obstacles.filter(
      (obs) => obs.kind === "bubble" && obs.topY < y && y < obs.bottomY,
    );
    const cutFrames = input.obstacles.filter(
      (obs) => obs.kind === "cut" && obs.topY < y && y < obs.bottomY,
    );
    if (cutBubbles.length > 0) bubbleCutCount += 1;
    else if (cutFrames.length > 0) frameCutCount += 1;

    const status: StripBoundaryCollision["status"] =
      cutBubbles.length > 0 ? "bubble-cut" : cutFrames.length > 0 ? "frame-cut" : "clean";

    return Object.freeze({
      boundaryIndex,
      y,
      prevSliceHeight: slices[boundaryIndex]?.height ?? 0,
      nextSliceHeight: slices[boundaryIndex + 1]?.height ?? 0,
      status,
      cutBubbles: Object.freeze(cutBubbles),
      cutFrames: Object.freeze(cutFrames),
    });
  });

  const oversizedSliceIndices = slices
    .filter((slice) => slice.height > input.maxSliceHeight)
    .map((slice) => slice.index);

  const heightSum = slices.reduce((sum, slice) => sum + slice.height, 0);
  const orderMonotonic = slices.every(
    (slice, idx) =>
      slice.index === idx &&
      slice.height >= 1 &&
      (idx === 0 ? slice.y === 0 : slice.y === slices[idx - 1]!.y + slices[idx - 1]!.height),
  );

  return Object.freeze({
    targetWidth: input.targetWidth,
    totalHeight: input.totalHeight,
    maxSliceHeight: input.maxSliceHeight,
    slices: Object.freeze(slices),
    boundaries: Object.freeze(actualBoundaries),
    obstacles: input.obstacles,
    boundaryReports: Object.freeze(boundaryReports),
    bubbleCutCount,
    frameCutCount,
    oversizedSliceIndices: Object.freeze(oversizedSliceIndices),
    heightSumMatches: heightSum === input.totalHeight,
    orderMonotonic,
  });
}
