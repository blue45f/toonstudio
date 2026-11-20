/**
 * Procreate급 QuickMenu(T2, 6액션 방사형·그리드 런처) 및
 * QuickShape(T7, 드로잉 후 400ms 정지 홀드 시 직선·사각형·타원·삼각형 스냅 + 제어 핸들 편집) 엔진 (AC-016 / F07).
 */

export type QuickMenuActionId =
  | "undo"
  | "redo"
  | "flip-canvas-h"
  | "toggle-alpha-lock"
  | "toggle-clipping-mask"
  | "colordrop-fill"
  | "fit-canvas"
  | "eyedropper"
  | "merge-down"
  | "clear-layer";

export interface QuickMenuSlot {
  readonly index: 0 | 1 | 2 | 3 | 4 | 5;
  readonly actionId: QuickMenuActionId;
  readonly labelKo: string;
}

export const QUICK_MENU_ACTION_LABELS_KO: Readonly<Record<QuickMenuActionId, string>> = Object.freeze({
  undo: "실행 취소",
  redo: "다시 실행",
  "flip-canvas-h": "좌우 반전",
  "toggle-alpha-lock": "알파 잠금",
  "toggle-clipping-mask": "클리핑 마스크",
  "colordrop-fill": "채우기(ColorDrop)",
  "fit-canvas": "화면 맞춤",
  eyedropper: "스포이드",
  "merge-down": "아래 레이어와 병합",
  "clear-layer": "레이어 비우기",
});

export const DEFAULT_QUICK_MENU_SLOTS: readonly QuickMenuSlot[] = Object.freeze([
  { index: 0, actionId: "undo", labelKo: QUICK_MENU_ACTION_LABELS_KO.undo },
  { index: 1, actionId: "flip-canvas-h", labelKo: QUICK_MENU_ACTION_LABELS_KO["flip-canvas-h"] },
  { index: 2, actionId: "toggle-alpha-lock", labelKo: QUICK_MENU_ACTION_LABELS_KO["toggle-alpha-lock"] },
  { index: 3, actionId: "toggle-clipping-mask", labelKo: QUICK_MENU_ACTION_LABELS_KO["toggle-clipping-mask"] },
  { index: 4, actionId: "colordrop-fill", labelKo: QUICK_MENU_ACTION_LABELS_KO["colordrop-fill"] },
  { index: 5, actionId: "fit-canvas", labelKo: QUICK_MENU_ACTION_LABELS_KO["fit-canvas"] },
]);

/** 특정 슬롯(0..5)에 새 액션을 할당해 불변 슬롯 배열을 반환한다. */
export function assignQuickMenuSlot(
  slots: readonly QuickMenuSlot[],
  slotIndex: QuickMenuSlot["index"],
  actionId: QuickMenuActionId,
): readonly QuickMenuSlot[] {
  return Object.freeze(
    slots.map((slot) =>
      slot.index === slotIndex
        ? { index: slotIndex, actionId, labelKo: QUICK_MENU_ACTION_LABELS_KO[actionId] }
        : slot,
    ),
  );
}

/**
 * 앵커 중심에서 드래그 벡터(dx, dy)가 데드존(>= 24px)을 넘으면 6개 방사형 섹터(60도 간격, 12시 방향 0번 기준 시계방향) 중
 * 선택된 슬롯을 반환한다.
 */
export function resolveQuickMenuSlotFromDrag(
  slots: readonly QuickMenuSlot[],
  dx: number,
  dy: number,
  deadzonePx = 24,
): QuickMenuSlot | null {
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance < deadzonePx || slots.length < 6) {
    return null;
  }
  // 12시 방향(0, -1)을 0도로 두고 시계방향 0..360도로 정규화
  const rawDeg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  const normalizedDeg = (rawDeg + 360) % 360;
  const sector = Math.floor(((normalizedDeg + 30) % 360) / 60) as QuickMenuSlot["index"];
  return slots.find((slot) => slot.index === sector) ?? null;
}

/* ------------------------------------------------------------------ T7 QuickShape */

export interface StrokeSamplePoint {
  readonly x: number;
  readonly y: number;
}

export type QuickShapeKind = "line" | "rectangle" | "ellipse" | "triangle";

export interface QuickShapeHandle {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

export interface SnappedQuickShape {
  readonly kind: QuickShapeKind;
  readonly closed: boolean;
  readonly handles: readonly QuickShapeHandle[];
  readonly boundingBox: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  };
}

function pointToSegmentDistance(
  p: StrokeSamplePoint,
  a: StrokeSamplePoint,
  b: StrokeSamplePoint,
): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const lenSq = vx * vx + vy * vy;
  if (lenSq <= 1e-6) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / lenSq));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

/**
 * 자유 곡선 포인트 배열과 홀드 시간(`holdDurationMs >= 400`)을 분석해
 * 직선·사각형·타원·삼각형 중 가장 적합한 기하 도형과 편집 가능한 노드 핸들을 생성한다.
 */
export function snapStrokeToQuickShape(
  points: readonly StrokeSamplePoint[],
  holdDurationMs: number,
  minHoldMs = 400,
): SnappedQuickShape | null {
  if (holdDurationMs < minHoldMs || points.length < 2) {
    return null;
  }
  const first = points[0]!;
  const last = points[points.length - 1]!;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let pathLength = 0;

  for (let i = 0; i < points.length; i += 1) {
    const pt = points[i]!;
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
    if (i > 0) {
      const prev = points[i - 1]!;
      pathLength += Math.hypot(pt.x - prev.x, pt.y - prev.y);
    }
  }

  const width = Math.max(1, Number((maxX - minX).toFixed(2)));
  const height = Math.max(1, Number((maxY - minY).toFixed(2)));
  const diagonal = Math.hypot(width, height);
  if (diagonal < 8) return null;

  const endGap = Math.hypot(last.x - first.x, last.y - first.y);
  const maxLineDev = points.reduce(
    (acc, pt) => Math.max(acc, pointToSegmentDistance(pt, first, last)),
    0,
  );

  // 시작점-끝점 직선 편차가 대각선 대비 8% 이내이고 열려 있으면 직선으로 스냅
  if (endGap > diagonal * 0.35 && maxLineDev <= Math.max(6, diagonal * 0.08)) {
    return Object.freeze({
      kind: "line",
      closed: false,
      handles: Object.freeze([
        { id: "start", x: Number(first.x.toFixed(2)), y: Number(first.y.toFixed(2)) },
        { id: "end", x: Number(last.x.toFixed(2)), y: Number(last.y.toFixed(2)) },
      ]),
      boundingBox: { left: Number(minX.toFixed(2)), top: Number(minY.toFixed(2)), width, height },
    });
  }

  // 닫힌 도형 판별: 바운딩 박스 면적 대비 폴리곤 근사 면적 비율(fillRatio)로 삼각형/타원/사각형 분류
  let signedArea2 = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    signedArea2 += a.x * b.y - b.x * a.y;
  }
  const polyArea = Math.abs(signedArea2) * 0.5;
  const boxArea = width * height;
  const fillRatio = boxArea > 0 ? polyArea / boxArea : 0;
  void pathLength;

  let kind: QuickShapeKind = "ellipse";
  if (fillRatio >= 0.84) {
    kind = "rectangle";
  } else if (fillRatio <= 0.62) {
    kind = "triangle";
  }

  const cx = Number(((minX + maxX) * 0.5).toFixed(2));
  const cy = Number(((minY + maxY) * 0.5).toFixed(2));
  const handles: readonly QuickShapeHandle[] =
    kind === "triangle"
      ? [
          { id: "apex", x: cx, y: Number(minY.toFixed(2)) },
          { id: "bottom-right", x: Number(maxX.toFixed(2)), y: Number(maxY.toFixed(2)) },
          { id: "bottom-left", x: Number(minX.toFixed(2)), y: Number(maxY.toFixed(2)) },
        ]
      : kind === "rectangle"
        ? [
            { id: "top-left", x: Number(minX.toFixed(2)), y: Number(minY.toFixed(2)) },
            { id: "top-right", x: Number(maxX.toFixed(2)), y: Number(minY.toFixed(2)) },
            { id: "bottom-right", x: Number(maxX.toFixed(2)), y: Number(maxY.toFixed(2)) },
            { id: "bottom-left", x: Number(minX.toFixed(2)), y: Number(maxY.toFixed(2)) },
          ]
        : [
            { id: "north", x: cx, y: Number(minY.toFixed(2)) },
            { id: "east", x: Number(maxX.toFixed(2)), y: cy },
            { id: "south", x: cx, y: Number(maxY.toFixed(2)) },
            { id: "west", x: Number(minX.toFixed(2)), y: cy },
          ];

  return Object.freeze({
    kind,
    closed: true,
    handles: Object.freeze(handles),
    boundingBox: { left: Number(minX.toFixed(2)), top: Number(minY.toFixed(2)), width, height },
  });
}

/** 스냅된 QuickShape의 특정 노드 핸들 좌표를 이동하고 바운딩 박스를 재계산한다. */
export function moveQuickShapeHandle(
  shape: SnappedQuickShape,
  handleId: string,
  nextX: number,
  nextY: number,
): SnappedQuickShape {
  const handles = shape.handles.map((h) =>
    h.id === handleId ? { ...h, x: Number(nextX.toFixed(2)), y: Number(nextY.toFixed(2)) } : h,
  );
  const xs = handles.map((h) => h.x);
  const ys = handles.map((h) => h.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const width = Math.max(1, Number((Math.max(...xs) - left).toFixed(2)));
  const height = Math.max(1, Number((Math.max(...ys) - top).toFixed(2)));
  return Object.freeze({
    ...shape,
    handles: Object.freeze(handles),
    boundingBox: { left, top, width, height },
  });
}
