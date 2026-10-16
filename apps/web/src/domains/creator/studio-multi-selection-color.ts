import { normalizeHexColor } from "./studio-color-utils";

import type {
  BubbleEl,
  DrawEl,
  El,
  FrameEl,
  TextEl,
} from "./studio-element-model";

export type StudioStrokeColorElement = DrawEl | TextEl | BubbleEl | FrameEl;

export interface StudioMultiSelectionStrokeColorState {
  readonly targets: readonly StudioStrokeColorElement[];
  readonly value: string | null;
  readonly mixed: boolean;
  readonly includesNone: boolean;
}

export function isStudioStrokeColorElement(
  element: El,
): element is StudioStrokeColorElement {
  return (
    element.type === "draw" ||
    element.type === "text" ||
    element.type === "bubble" ||
    element.type === "frame"
  );
}

export function studioVisibleStrokeColor(
  stroke: string | undefined,
): string | null {
  const trimmed = stroke?.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === "transparent" || lower === "none") return null;
  return normalizeHexColor(trimmed) ?? lower;
}

export function resolveStudioMultiSelectionStrokeColor(
  elements: readonly El[],
  selectedIds: readonly string[],
): StudioMultiSelectionStrokeColorState {
  const selected = new Set(selectedIds);
  const targets = elements.filter(
    (element): element is StudioStrokeColorElement =>
      selected.has(element.id) && isStudioStrokeColorElement(element),
  );
  const values = targets.map((element) =>
    studioVisibleStrokeColor(element.stroke),
  );
  const unique = new Set(values.map((value) => value ?? "__none__"));
  const mixed = unique.size > 1;
  const firstVisible = values.find((value): value is string => value !== null);

  return {
    targets,
    value: mixed ? firstVisible ?? null : values[0] ?? null,
    mixed,
    includesNone: values.some((value) => value === null),
  };
}

function withStudioStrokeColor(
  element: StudioStrokeColorElement,
  color: string | null,
): StudioStrokeColorElement {
  const current = studioVisibleStrokeColor(element.stroke);
  const nextColor = color ? normalizeHexColor(color) ?? color : null;
  if (current === nextColor) return element;

  const stroke = nextColor ??
    (element.type === "draw" ? "transparent" : undefined);
  const needsDefaultWidth =
    nextColor !== null &&
    (!Number.isFinite(element.strokeWidth) || (element.strokeWidth ?? 0) <= 0);

  return {
    ...element,
    stroke,
    ...(needsDefaultWidth ? { strokeWidth: 3 } : {}),
  } as StudioStrokeColorElement;
}

export function applyStudioMultiSelectionStrokeColor(
  elements: readonly El[],
  selectedIds: readonly string[],
  color: string | null,
): El[] {
  const selected = new Set(selectedIds);
  let changed = false;
  const next = elements.map((element) => {
    if (!selected.has(element.id) || !isStudioStrokeColorElement(element)) {
      return element;
    }
    const patched = withStudioStrokeColor(element, color);
    if (patched !== element) changed = true;
    return patched;
  });

  return changed ? next : [...elements];
}

/**
 * 다중 선택 공통 선 두께.
 *
 * 컷선(프레임)·말풍선 테두리·글자 외곽선·펜 선이 같은 `strokeWidth` 를 쓰므로, 색과 같은 대상 규칙을 따르되
 * **선이 보이는 요소에만** 적용한다(선 없음인 요소의 두께를 바꿔도 화면이 달라지지 않고, 나중에 색을 고를 때의
 * 기본 두께 3px 규칙만 흐트러진다). 범위는 단일 컷선 슬라이더("테두리 두께", 0.5 단위)와 같다.
 * 이미 슬라이더 최대값보다 굵은 선이 있으면 그 굵기까지 올려, 건드린 것만으로 굵은 선이 조용히 가늘어지지 않게 한다.
 */
export const STUDIO_MULTI_SELECTION_STROKE_WIDTH_MIN = 0.5;
export const STUDIO_MULTI_SELECTION_STROKE_WIDTH_MAX = 16;
export const STUDIO_MULTI_SELECTION_STROKE_WIDTH_STEP = 0.5;
const STUDIO_DEFAULT_STROKE_WIDTH = 3;

export interface StudioMultiSelectionStrokeWidthState {
  /** 선이 보여서 두께가 화면에 닿는 요소. */
  readonly targets: readonly StudioStrokeColorElement[];
  /** 공통 두께. 섞여 있으면 첫 요소의 값을 대표로 쓴다. 대상이 없으면 null. */
  readonly value: number | null;
  readonly mixed: boolean;
  /** 슬라이더 위쪽 끝: 기본 상한과 대상 중 가장 굵은 선 가운데 큰 쪽(올림). */
  readonly max: number;
}

function effectiveStrokeWidth(element: StudioStrokeColorElement): number {
  const width = element.strokeWidth;
  return typeof width === "number" && Number.isFinite(width) && width > 0
    ? width
    : STUDIO_DEFAULT_STROKE_WIDTH;
}

function hasVisibleStroke(element: El): element is StudioStrokeColorElement {
  return isStudioStrokeColorElement(element) && studioVisibleStrokeColor(element.stroke) !== null;
}

export function resolveStudioMultiSelectionStrokeWidth(
  elements: readonly El[],
  selectedIds: readonly string[],
): StudioMultiSelectionStrokeWidthState {
  const selected = new Set(selectedIds);
  const targets = elements.filter(
    (element): element is StudioStrokeColorElement =>
      selected.has(element.id) && hasVisibleStroke(element),
  );
  if (targets.length === 0) {
    return { targets, value: null, mixed: false, max: STUDIO_MULTI_SELECTION_STROKE_WIDTH_MAX };
  }
  const widths = targets.map(effectiveStrokeWidth);
  const first = widths[0] ?? STUDIO_DEFAULT_STROKE_WIDTH;
  return {
    targets,
    value: first,
    mixed: widths.some((width) => Math.abs(width - first) > 0.005),
    max: Math.max(STUDIO_MULTI_SELECTION_STROKE_WIDTH_MAX, Math.ceil(Math.max(...widths))),
  };
}

/** 슬라이더 값을 0.5 단위로 맞추고 범위 안으로 가둔다. 숫자가 아니면 기본 두께. */
export function clampStudioMultiSelectionStrokeWidth(width: number, max: number = STUDIO_MULTI_SELECTION_STROKE_WIDTH_MAX): number {
  if (!Number.isFinite(width)) return STUDIO_DEFAULT_STROKE_WIDTH;
  const snapped =
    Math.round(width / STUDIO_MULTI_SELECTION_STROKE_WIDTH_STEP) * STUDIO_MULTI_SELECTION_STROKE_WIDTH_STEP;
  return Math.min(max, Math.max(STUDIO_MULTI_SELECTION_STROKE_WIDTH_MIN, snapped));
}

export function applyStudioMultiSelectionStrokeWidth(
  elements: readonly El[],
  selectedIds: readonly string[],
  width: number,
  max: number = STUDIO_MULTI_SELECTION_STROKE_WIDTH_MAX,
): El[] {
  const selected = new Set(selectedIds);
  const nextWidth = clampStudioMultiSelectionStrokeWidth(width, max);
  let changed = false;
  const next = elements.map((element) => {
    if (!selected.has(element.id) || !hasVisibleStroke(element)) return element;
    if (element.strokeWidth === nextWidth) return element;
    changed = true;
    return { ...element, strokeWidth: nextWidth } as StudioStrokeColorElement;
  });

  return changed ? next : [...elements];
}
