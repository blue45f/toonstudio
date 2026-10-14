import {
  STUDIO_REFERENCE_BOARD_MAX_ZOOM,
  STUDIO_REFERENCE_BOARD_MIN_ZOOM,
  type StudioReferenceBoardDocument,
  type StudioReferenceBoardItem,
} from "./studio-reference-board";
import { studioReferenceItemFramePercent } from "./studio-reference-color-sampler";

/**
 * Criteria-based arrange for the reference board (PureRef-style Normalize + sort + pack).
 *
 * The legacy `arrangeStudioReferenceCanvas` lays every item on one uniform grid at one
 * shared zoom, in the current z-order, with no way to choose *why* items sit where they do.
 * This module is the selectable-criteria successor used by StudioReferencePanel's 자동 정돈
 * and shared with the episode team board (비교 검수 4단계): pick a sort criterion and every
 * image is (1) sorted by it, (2) height-normalized — PureRef Normalize: all displayed
 * heights become equal while each aspect is preserved — and (3) packed into uniform rows
 * inside the same board area the legacy layout used.
 *
 * Geometry mirrors the panel exactly: an item's displayed size is
 * `studioReferenceItemFramePercent(width, height) * view.zoom` (percent of the board), so
 * a normalized displayed height `H` means `zoom = H / frameHeight` per item. Zoom keeps the
 * legacy arrange cap of 1 (the longest side never exceeds the base frame), which bounds H
 * by the smallest frame height in the set.
 */

export type StudioReferenceBoardArrangeSort = "keep" | "name" | "hue" | "size";

export interface StudioReferenceBoardArrangeSortOption {
  readonly sort: StudioReferenceBoardArrangeSort;
  readonly label: string;
  readonly description: string;
}

/** Menu metadata for the panel's arrange-criteria picker (single source for UI + tests). */
export const STUDIO_REFERENCE_BOARD_ARRANGE_OPTIONS: readonly StudioReferenceBoardArrangeSortOption[] = [
  {
    sort: "keep",
    label: "현재 순서",
    description: "순서는 그대로 두고 높이만 맞춰 행으로 가지런히 팩킹합니다.",
  },
  {
    sort: "name",
    label: "이름순",
    description: "파일 이름 가나다순으로 정렬하고 높이를 맞춥니다.",
  },
  {
    sort: "hue",
    label: "대표 색상순",
    description: "대표 색상의 색상환 순서(빨강→주황→…→보라)로 정렬합니다. 색을 구하지 못한 이미지는 뒤로 갑니다.",
  },
  {
    sort: "size",
    label: "크기순",
    description: "원본 면적이 큰 이미지부터 정렬하고 높이를 맞춥니다.",
  },
];

export interface StudioReferenceBoardArrangeOptions {
  /** Sort criterion applied before packing. Defaults to "keep" (order untouched). */
  sort?: StudioReferenceBoardArrangeSort;
  /**
   * Dominant hue per item id, 0..360. Only consulted for the "hue" criterion; items
   * without an entry (undecodable or near-gray images) sort last, keeping their
   * relative order. The panel derives hues from each asset's dominant palette color
   * via `referenceHueFromHex`.
   */
  dominantHues?: ReadonlyMap<string, number>;
  /**
   * Intrinsic pixel dimensions per item id for items whose document descriptor omits
   * them (the panel falls back to the resolved library asset). Missing dimensions are
   * treated as square for normalization and as unknown (last) for the "size" criterion.
   */
  dimensions?: ReadonlyMap<string, { width: number; height: number }>;
  /** Gap between packed items, as a board fraction. Defaults to 0.02. */
  gap?: number;
}

const BOARD_LEFT = 0.12;
const BOARD_TOP = 0.13;
const BOARD_WIDTH = 0.76;
const BOARD_HEIGHT = 0.72;
const DEFAULT_GAP = 0.02;
/** Displayed-height floor/ceiling come from the board zoom clamps, like the legacy layout. */
const MAX_ARRANGE_ZOOM = Math.min(1, STUDIO_REFERENCE_BOARD_MAX_ZOOM);

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function itemDimensions(
  item: StudioReferenceBoardItem,
  dimensions: StudioReferenceBoardArrangeOptions["dimensions"],
): { width: number; height: number } | null {
  if (
    typeof item.asset.width === "number"
    && typeof item.asset.height === "number"
    && item.asset.width > 0
    && item.asset.height > 0
  ) {
    return { width: item.asset.width, height: item.asset.height };
  }
  const fallback = dimensions?.get(item.id);
  if (fallback && fallback.width > 0 && fallback.height > 0) return fallback;
  return null;
}

function itemName(item: StudioReferenceBoardItem): string {
  return item.asset.name?.trim() ? item.asset.name : item.id;
}

/**
 * Converts a `#rrggbb` hex color to its hue (0..360). Near-gray colors have no meaningful
 * hue and return null, as do malformed values — both sort last under the "hue" criterion.
 */
export function referenceHueFromHex(hex: string): number | null {
  const match = /^#?([0-9a-f]{6})$/iu.exec(hex.trim());
  if (!match?.[1]) return null;
  const value = Number.parseInt(match[1], 16);
  const red = ((value >> 16) & 0xff) / 255;
  const green = ((value >> 8) & 0xff) / 255;
  const blue = (value & 0xff) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  if (delta < 8 / 255) return null;
  let hue: number;
  if (maximum === red) hue = ((green - blue) / delta) % 6;
  else if (maximum === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
}

/** Pure sort step, exported so the team board and tests share the exact ordering rules. */
export function sortStudioReferenceBoardItems(
  items: readonly StudioReferenceBoardItem[],
  sort: StudioReferenceBoardArrangeSort,
  options: Pick<StudioReferenceBoardArrangeOptions, "dominantHues" | "dimensions"> = {},
): readonly StudioReferenceBoardItem[] {
  if (sort === "keep") return items;
  const copy = [...items];
  const byNameThenId = (a: StudioReferenceBoardItem, b: StudioReferenceBoardItem): number =>
    itemName(a).localeCompare(itemName(b), "ko") || a.id.localeCompare(b.id);
  switch (sort) {
    case "name":
      return copy.sort(byNameThenId);
    case "hue":
      return copy.sort((a, b) => {
        const hueA = options.dominantHues?.get(a.id);
        const hueB = options.dominantHues?.get(b.id);
        if (hueA === undefined && hueB === undefined) return 0;
        if (hueA === undefined) return 1;
        if (hueB === undefined) return -1;
        return hueA - hueB || byNameThenId(a, b);
      });
    case "size":
      return copy.sort((a, b) => {
        const dimsA = itemDimensions(a, options.dimensions);
        const dimsB = itemDimensions(b, options.dimensions);
        const areaA = dimsA ? dimsA.width * dimsA.height : -1;
        const areaB = dimsB ? dimsB.width * dimsB.height : -1;
        return areaB - areaA || byNameThenId(a, b);
      });
  }
}

interface PackCandidate {
  item: StudioReferenceBoardItem;
  /** Displayed frame size as board fractions at zoom 1. */
  frameWidth: number;
  frameHeight: number;
}

/** Greedy uniform-row packing at one normalized displayed height. Returns rows of indices. */
function packRows(
  candidates: readonly PackCandidate[],
  targetHeight: number,
  gap: number,
): { rows: number[][]; totalHeight: number } | null {
  const rows: number[][] = [];
  let row: number[] = [];
  let rowWidth = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (!candidate) return null;
    const width = targetHeight * (candidate.frameWidth / candidate.frameHeight);
    if (width > BOARD_WIDTH) return null;
    if (row.length > 0 && rowWidth + gap + width > BOARD_WIDTH) {
      rows.push(row);
      row = [];
      rowWidth = 0;
    }
    rowWidth += (row.length > 0 ? gap : 0) + width;
    row.push(index);
  }
  if (row.length > 0) rows.push(row);
  const totalHeight = rows.length === 0
    ? 0
    : rows.length * targetHeight + (rows.length - 1) * gap;
  return totalHeight <= BOARD_HEIGHT ? { rows, totalHeight } : null;
}

/**
 * Sorts (per criterion), height-normalizes and row-packs the whole board.
 * Returns the input document unchanged (same reference) when nothing would move, so
 * callers can skip the commit — the same contract as the legacy arrange.
 */
export function arrangeStudioReferenceBoardByCriteria(
  document: StudioReferenceBoardDocument,
  options: StudioReferenceBoardArrangeOptions = {},
): StudioReferenceBoardDocument {
  const count = document.items.length;
  if (count === 0) return document;
  const gap = typeof options.gap === "number" && Number.isFinite(options.gap) && options.gap >= 0
    ? options.gap
    : DEFAULT_GAP;
  const sorted = sortStudioReferenceBoardItems(document.items, options.sort ?? "keep", options);

  const candidates: PackCandidate[] = sorted.map((item) => {
    const dims = itemDimensions(item, options.dimensions) ?? { width: 1, height: 1 };
    const frame = studioReferenceItemFramePercent(dims.width, dims.height);
    return { item, frameWidth: frame.width / 100, frameHeight: frame.height / 100 };
  });

  // Zoom clamps bound the shared displayed height: every item needs
  // MIN_ZOOM <= targetHeight / frameHeight <= MAX_ARRANGE_ZOOM.
  const low = Math.max(...candidates.map((c) => c.frameHeight)) * STUDIO_REFERENCE_BOARD_MIN_ZOOM;
  const high = Math.min(...candidates.map((c) => c.frameHeight)) * MAX_ARRANGE_ZOOM;

  let targetHeight = high;
  let packed = packRows(candidates, targetHeight, gap);
  if (!packed && high > low) {
    // Largest feasible height via binary search (feasibility is monotonic in height:
    // taller items are wider, so rows only grow and total height only increases).
    let feasible = low;
    let infeasible = high;
    for (let iteration = 0; iteration < 48; iteration += 1) {
      const middle = (feasible + infeasible) / 2;
      if (packRows(candidates, middle, gap)) feasible = middle;
      else infeasible = middle;
    }
    targetHeight = feasible;
    packed = packRows(candidates, targetHeight, gap);
  }
  if (!packed) {
    // Degenerate fallback (extreme aspect/count): one item per row at the zoom floor.
    // Items stay sorted and as normalized as the zoom clamps allow.
    targetHeight = low;
    packed = packRows(candidates, targetHeight, gap) ?? {
      rows: candidates.map((_, index) => [index]),
      totalHeight: count * targetHeight + (count - 1) * gap,
    };
  }

  const startY = BOARD_TOP + Math.max(0, (BOARD_HEIGHT - packed.totalHeight) / 2);
  const arrangedById = new Map<string, StudioReferenceBoardItem>();
  packed.rows.forEach((row, rowIndex) => {
    const widths = row.map((index) => {
      const candidate = candidates[index];
      return candidate ? targetHeight * (candidate.frameWidth / candidate.frameHeight) : 0;
    });
    const rowWidth = widths.reduce((sum, width) => sum + width, 0) + gap * (row.length - 1);
    let cursorX = BOARD_LEFT + (BOARD_WIDTH - rowWidth) / 2;
    const centerY = startY + targetHeight / 2 + rowIndex * (targetHeight + gap);
    row.forEach((candidateIndex, position) => {
      const candidate = candidates[candidateIndex];
      const width = widths[position];
      if (!candidate || width === undefined) return;
      const zoom = clamp(
        targetHeight / candidate.frameHeight,
        STUDIO_REFERENCE_BOARD_MIN_ZOOM,
        MAX_ARRANGE_ZOOM,
      );
      arrangedById.set(candidate.item.id, {
        ...candidate.item,
        view: {
          ...candidate.item.view,
          centerX: clamp(cursorX + width / 2, 0, 1),
          centerY: clamp(centerY, 0, 1),
          zoom,
          rotationDeg: 0,
        },
      });
      cursorX += width + gap;
    });
  });

  const items = sorted.map((item) => arrangedById.get(item.id) ?? item);
  const changed = items.some((item, index) => {
    const original = document.items[index];
    return !original
      || original.id !== item.id
      || original.view.centerX !== item.view.centerX
      || original.view.centerY !== item.view.centerY
      || original.view.zoom !== item.view.zoom
      || original.view.rotationDeg !== item.view.rotationDeg;
  });
  return changed ? { ...document, items } : document;
}
