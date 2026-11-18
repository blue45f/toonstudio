/**
 * CSP 웹툰 그리기 위치 이동 (`Edit > Shift drawing`: `editactionshiftdrawingasinsertion` /
 * `editactionshiftdrawingasdeletion`) 세로 스크롤 연출 여백 삽입·삭제 플래너.
 *
 * 세로 스크롤 웹툰의 대사 호흡·장면 전환 여백을 페이지 중간 기준선(`anchorY`)에서 삽입하거나
 * 삭제할 때, 위쪽 요소 보존·아래쪽 요소 일괄 평행이동·기준선 걸침(straddling) 요소 분할 명세
 * (`StraddlingElementSplitSpec`) 산출 및 무손실 역연산 왕복(inverse round-trip)을 보장한다.
 *
 * Clean-room implementation based on Ghidra/REA behavioral specification:
 * - evidence_id: ev_af42bc7907f5e98eacfcb3b02c9c7f14cbf6c06dd0234d34033ff0059556946b
 * - evidence_id: ev_0c6a677d38f821a7c782b943662be657510c27ee397e744fa128f63a1ca2d1fa
 */

export type ShiftDrawingOperation = "insertion" | "deletion";
export type StraddlingElementHandlingMode = "stretch" | "split";

export interface ShiftableDrawingElement {
  readonly id: string;
  readonly type?: string;
  readonly name?: string;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly points?: readonly number[];
  readonly locked?: boolean;
}

export interface StraddlingSliceRegion {
  readonly y: number;
  readonly height: number;
  /** 원본 요소 로컬 상단 기준 크롭 시작 Y 오프셋. */
  readonly sourceOffsetY: number;
}

export interface StraddlingElementSplitSpec {
  readonly elementId: string;
  readonly elementName?: string;
  readonly operation: ShiftDrawingOperation;
  readonly anchorY: number;
  readonly amountPx: number;
  readonly originalTopY: number;
  readonly originalBottomY: number;
  readonly fullyDeleted: boolean;
  readonly topSlice: StraddlingSliceRegion | null;
  readonly bottomSlice: StraddlingSliceRegion | null;
}

export interface ShiftDrawingPlanInput<T extends ShiftableDrawingElement = ShiftableDrawingElement> {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly anchorY: number;
  readonly amountPx: number;
  readonly elements: readonly T[];
  readonly straddlingMode?: StraddlingElementHandlingMode;
  readonly minCanvasHeight?: number;
}

export interface ShiftDrawingPlanResult<T extends ShiftableDrawingElement = ShiftableDrawingElement> {
  readonly operation: ShiftDrawingOperation;
  readonly canvasWidth: number;
  readonly previousCanvasHeight: number;
  readonly nextCanvasHeight: number;
  readonly anchorY: number;
  readonly effectiveAmountPx: number;
  readonly shiftedElementCount: number;
  readonly straddlingSplits: readonly StraddlingElementSplitSpec[];
  readonly removedElementIds: readonly string[];
  readonly elements: readonly T[];
}

export const WEBTOON_SHIFT_DRAWING_PRESETS = Object.freeze([
  { id: "beat-pause", label: "대사 호흡 +240px", operation: "insertion" as const, amountPx: 240 },
  { id: "scene-change", label: "장면 전환 +600px", operation: "insertion" as const, amountPx: 600 },
  { id: "climax-gutter", label: "클라이맥스 여백 +1200px", operation: "insertion" as const, amountPx: 1200 },
  { id: "tighten-gap", label: "과한 여백 당기기 -300px", operation: "deletion" as const, amountPx: 300 },
]);

function computeElementVerticalBounds(
  el: ShiftableDrawingElement,
): { readonly topY: number; readonly bottomY: number; readonly isPointsStroke: boolean } | null {
  if (typeof el.y === "number" && Number.isFinite(el.y)) {
    const h = typeof el.height === "number" && Number.isFinite(el.height) ? Math.max(0, el.height) : 0;
    return { topY: el.y, bottomY: el.y + h, isPointsStroke: false };
  }
  if (Array.isArray(el.points) && el.points.length >= 2) {
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let i = 1; i < el.points.length; i += 2) {
      const py = el.points[i]!;
      if (!Number.isFinite(py)) continue;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    if (Number.isFinite(minY) && Number.isFinite(maxY)) {
      return { topY: minY, bottomY: maxY, isPointsStroke: true };
    }
  }
  return null;
}

function shiftElementByDeltaY<T extends ShiftableDrawingElement>(el: T, deltaY: number): T {
  if (deltaY === 0) return el;
  if (typeof el.y === "number" && Number.isFinite(el.y)) {
    return { ...el, y: el.y + deltaY };
  }
  if (Array.isArray(el.points)) {
    const nextPoints = el.points.map((coord, idx) => (idx % 2 === 1 ? coord + deltaY : coord));
    return { ...el, points: nextPoints };
  }
  return el;
}

/**
 * 기준선 `anchorY` 아래로 `amountPx` 만큼 세로 연출 여백을 삽입하고 하위 요소를 평행이동한다 (`editactionshiftdrawingasinsertion`).
 */
export function insertVerticalDrawingSpace<
  T extends ShiftableDrawingElement = ShiftableDrawingElement,
>(input: ShiftDrawingPlanInput<T>): ShiftDrawingPlanResult<T> {
  const safeW = Math.max(1, Math.round(input.canvasWidth));
  const prevH = Math.max(1, Math.round(input.canvasHeight));
  const anchorY = Math.min(prevH, Math.max(0, Math.round(input.anchorY)));
  const amountPx = Math.max(0, Math.round(input.amountPx));
  const mode: StraddlingElementHandlingMode = input.straddlingMode ?? "stretch";

  if (amountPx === 0) {
    return {
      operation: "insertion",
      canvasWidth: safeW,
      previousCanvasHeight: prevH,
      nextCanvasHeight: prevH,
      anchorY,
      effectiveAmountPx: 0,
      shiftedElementCount: 0,
      straddlingSplits: [],
      removedElementIds: [],
      elements: [...input.elements],
    };
  }

  const nextElements: T[] = [];
  const straddlingSplits: StraddlingElementSplitSpec[] = [];
  let shiftedElementCount = 0;

  for (const el of input.elements) {
    const bounds = computeElementVerticalBounds(el);
    if (!bounds || bounds.bottomY <= anchorY) {
      nextElements.push(el);
      continue;
    }

    if (bounds.topY >= anchorY) {
      shiftedElementCount += 1;
      nextElements.push(shiftElementByDeltaY(el, amountPx));
      continue;
    }

    // topY < anchorY < bottomY: 기준선에 걸친 요소
    const topHeight = anchorY - bounds.topY;
    const bottomHeight = bounds.bottomY - anchorY;
    straddlingSplits.push({
      elementId: el.id,
      ...(el.name ? { elementName: el.name } : {}),
      operation: "insertion",
      anchorY,
      amountPx,
      originalTopY: bounds.topY,
      originalBottomY: bounds.bottomY,
      fullyDeleted: false,
      topSlice: { y: bounds.topY, height: topHeight, sourceOffsetY: 0 },
      bottomSlice: {
        y: anchorY + amountPx,
        height: bottomHeight,
        sourceOffsetY: topHeight,
      },
    });

    if (bounds.isPointsStroke && Array.isArray(el.points)) {
      const stretchedPts = el.points.map((coord, idx) =>
        idx % 2 === 1 && coord >= anchorY ? coord + amountPx : coord,
      );
      nextElements.push({ ...el, points: stretchedPts });
      continue;
    }

    if (mode === "split" && typeof el.y === "number" && typeof el.height === "number") {
      nextElements.push(
        { ...el, id: `${el.id}__top`, y: bounds.topY, height: topHeight },
        { ...el, id: `${el.id}__bottom`, y: anchorY + amountPx, height: bottomHeight },
      );
      shiftedElementCount += 1;
    } else {
      nextElements.push({
        ...el,
        height: (el.height ?? bounds.bottomY - bounds.topY) + amountPx,
      });
    }
  }

  return {
    operation: "insertion",
    canvasWidth: safeW,
    previousCanvasHeight: prevH,
    nextCanvasHeight: prevH + amountPx,
    anchorY,
    effectiveAmountPx: amountPx,
    shiftedElementCount,
    straddlingSplits,
    removedElementIds: [],
    elements: nextElements,
  };
}

/**
 * 세로 구간 `[anchorY, anchorY + amountPx)`의 여백을 삭제하고 아래 요소들을 위로 당긴다 (`editactionshiftdrawingasdeletion`).
 */
export function deleteVerticalDrawingSpace<
  T extends ShiftableDrawingElement = ShiftableDrawingElement,
>(input: ShiftDrawingPlanInput<T>): ShiftDrawingPlanResult<T> {
  const safeW = Math.max(1, Math.round(input.canvasWidth));
  const prevH = Math.max(1, Math.round(input.canvasHeight));
  const minH = Math.max(1, Math.round(input.minCanvasHeight ?? 64));
  const anchorY = Math.min(prevH, Math.max(0, Math.round(input.anchorY)));
  const maxDeletable = Math.max(0, Math.min(prevH - anchorY, prevH - minH));
  const effectiveAmountPx = Math.min(maxDeletable, Math.max(0, Math.round(input.amountPx)));
  const bandEnd = anchorY + effectiveAmountPx;
  const mode: StraddlingElementHandlingMode = input.straddlingMode ?? "stretch";

  if (effectiveAmountPx === 0) {
    return {
      operation: "deletion",
      canvasWidth: safeW,
      previousCanvasHeight: prevH,
      nextCanvasHeight: prevH,
      anchorY,
      effectiveAmountPx: 0,
      shiftedElementCount: 0,
      straddlingSplits: [],
      removedElementIds: [],
      elements: [...input.elements],
    };
  }

  const nextElements: T[] = [];
  const straddlingSplits: StraddlingElementSplitSpec[] = [];
  const removedElementIds: string[] = [];
  let shiftedElementCount = 0;

  for (const el of input.elements) {
    const bounds = computeElementVerticalBounds(el);
    if (!bounds || bounds.bottomY <= anchorY) {
      nextElements.push(el);
      continue;
    }

    if (bounds.topY >= bandEnd) {
      shiftedElementCount += 1;
      nextElements.push(shiftElementByDeltaY(el, -effectiveAmountPx));
      continue;
    }

    // [anchorY, bandEnd) 삭제 구간과 겹치는 요소 처리
    const hasTop = bounds.topY < anchorY;
    const hasBottom = bounds.bottomY > bandEnd;

    if (!hasTop && !hasBottom) {
      // 삭제 대역 안에 완전히 포함된 요소
      straddlingSplits.push({
        elementId: el.id,
        ...(el.name ? { elementName: el.name } : {}),
        operation: "deletion",
        anchorY,
        amountPx: effectiveAmountPx,
        originalTopY: bounds.topY,
        originalBottomY: bounds.bottomY,
        fullyDeleted: true,
        topSlice: null,
        bottomSlice: null,
      });
      removedElementIds.push(el.id);
      continue;
    }

    const topSlice: StraddlingSliceRegion | null = hasTop
      ? { y: bounds.topY, height: anchorY - bounds.topY, sourceOffsetY: 0 }
      : null;
    const bottomSlice: StraddlingSliceRegion | null = hasBottom
      ? {
          y: anchorY,
          height: bounds.bottomY - bandEnd,
          sourceOffsetY: bandEnd - bounds.topY,
        }
      : null;

    straddlingSplits.push({
      elementId: el.id,
      ...(el.name ? { elementName: el.name } : {}),
      operation: "deletion",
      anchorY,
      amountPx: effectiveAmountPx,
      originalTopY: bounds.topY,
      originalBottomY: bounds.bottomY,
      fullyDeleted: false,
      topSlice,
      bottomSlice,
    });

    if (bounds.isPointsStroke && Array.isArray(el.points)) {
      const contractedPts = el.points.map((coord, idx) => {
        if (idx % 2 === 0) return coord;
        if (coord <= anchorY) return coord;
        if (coord >= bandEnd) return coord - effectiveAmountPx;
        return anchorY;
      });
      nextElements.push({ ...el, points: contractedPts });
      continue;
    }

    if (hasTop && hasBottom) {
      if (mode === "split" && typeof el.y === "number" && typeof el.height === "number") {
        nextElements.push(
          { ...el, id: `${el.id}__top`, y: topSlice!.y, height: topSlice!.height },
          { ...el, id: `${el.id}__bottom`, y: bottomSlice!.y, height: bottomSlice!.height },
        );
      } else {
        nextElements.push({
          ...el,
          y: bounds.topY,
          height: (el.height ?? bounds.bottomY - bounds.topY) - effectiveAmountPx,
        });
      }
    } else if (hasTop && topSlice) {
      nextElements.push({ ...el, y: topSlice.y, height: topSlice.height });
    } else if (hasBottom && bottomSlice) {
      shiftedElementCount += 1;
      nextElements.push({ ...el, y: bottomSlice.y, height: bottomSlice.height });
    }
  }

  return {
    operation: "deletion",
    canvasWidth: safeW,
    previousCanvasHeight: prevH,
    nextCanvasHeight: prevH - effectiveAmountPx,
    anchorY,
    effectiveAmountPx,
    shiftedElementCount,
    straddlingSplits,
    removedElementIds,
    elements: nextElements,
  };
}
