/**
 * Studio Auto Layout & 2D CSS Grid Engine + Smart Selection —
 * Figma/Penpot 1D Flex · 2D CSS Grid 레이아웃 솔버 & 온캔버스 정돈/간격 드래그/슬롯 스왑 엔진.
 *
 * DOM 의존 0의 순수 결정론적 제약 솔버:
 *   1) 1D Flex Auto Layout: `direction`, `wrap`, `padding`, `gap`, `alignItems`, `justifyContent`, `hug/fill/fixed` + `min/max`.
 *   2) 2D CSS Grid Auto Layout: `fr | px | auto` 트랙, `colSpan`/`rowSpan`, 명시 배치 및 `row/column/dense` 자동 흐름.
 *   3) Figma Smart Selection: 행·열·격자 패턴 자동 감지, 원클릭 균등 정렬(`Tidy`), 간격 드래그(`Scrub`), 슬롯 스왑(`Swap`).
 *   4) 캔버스 요소 좌표 투영 & 표준 CSS Flexbox/Grid Inspect 코드 출력.
 */

import type { El } from "../studio-element-model";

export type AutoLayoutSizingMode = "hug" | "fill" | "fixed";
export type FlexDirection = "row" | "column";
export type FlexWrapMode = "nowrap" | "wrap";
export type FlexAlignItems = "start" | "center" | "end" | "stretch";
export type FlexJustifyContent = "start" | "center" | "end" | "space-between" | "space-around" | "space-evenly";
export interface AutoLayoutPadding { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number; }

export interface AutoLayoutChildSpec {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly widthMode?: AutoLayoutSizingMode;
  readonly heightMode?: AutoLayoutSizingMode;
  readonly minWidth?: number;
  readonly maxWidth?: number;
  readonly minHeight?: number;
  readonly maxHeight?: number;
  readonly flexGrow?: number;
  readonly alignSelf?: "auto" | FlexAlignItems;
  readonly colSpan?: number;
  readonly rowSpan?: number;
  readonly colStart?: number;
  readonly rowStart?: number;
  readonly hidden?: boolean;
  readonly absolutePosition?: { readonly x: number; readonly y: number };
}

export interface FlexAutoLayoutContainer {
  readonly mode: "flex";
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly widthMode: AutoLayoutSizingMode;
  readonly heightMode: AutoLayoutSizingMode;
  readonly direction: FlexDirection;
  readonly wrap?: FlexWrapMode;
  readonly gap: number;
  readonly crossGap?: number;
  readonly padding: AutoLayoutPadding;
  readonly alignItems?: FlexAlignItems;
  readonly justifyContent?: FlexJustifyContent;
  readonly children: readonly AutoLayoutChildSpec[];
}

export type GridTrackSpec =
  | { readonly unit: "fr"; readonly value: number }
  | { readonly unit: "px"; readonly value: number }
  | { readonly unit: "auto"; readonly minPx?: number; readonly maxPx?: number };

export interface GridAutoLayoutContainer {
  readonly mode: "grid";
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly widthMode: AutoLayoutSizingMode;
  readonly heightMode: AutoLayoutSizingMode;
  readonly columns: readonly GridTrackSpec[];
  readonly rows: readonly GridTrackSpec[];
  readonly columnGap: number;
  readonly rowGap: number;
  readonly padding: AutoLayoutPadding;
  readonly autoFlow?: "row" | "column" | "dense";
  readonly alignItems?: FlexAlignItems;
  readonly justifyItems?: FlexAlignItems;
  readonly children: readonly AutoLayoutChildSpec[];
}

export type AutoLayoutContainerSpec = FlexAutoLayoutContainer | GridAutoLayoutContainer;

export interface AutoLayoutSolvedRect {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly column?: number;
  readonly row?: number;
  readonly colSpan?: number;
  readonly rowSpan?: number;
}

export interface AutoLayoutSolveResult {
  readonly containerRect: AutoLayoutSolvedRect;
  readonly children: readonly AutoLayoutSolvedRect[];
  readonly lineCount: number;
  readonly columnWidths?: readonly number[];
  readonly rowHeights?: readonly number[];
}

export interface SmartSelectionItem { readonly id: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number; }
export type SmartSelectionPattern = "row" | "column" | "grid" | "scattered";
export interface SmartSelectionGapHandle { readonly axis: "x" | "y"; readonly beforeId: string; readonly afterId: string; readonly centerX: number; readonly centerY: number; readonly gapPx: number; }
export interface SmartSelectionSwapHandle { readonly itemId: string; readonly centerX: number; readonly centerY: number; readonly slotIndex: number; }

export interface SmartSelectionAnalysis {
  readonly pattern: SmartSelectionPattern;
  readonly uniformGapX: number | null;
  readonly uniformGapY: number | null;
  readonly columnCount: number;
  readonly rowCount: number;
  readonly gapHandles: readonly SmartSelectionGapHandle[];
  readonly swapHandles: readonly SmartSelectionSwapHandle[];
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

function clampDim(value: number, min?: number, max?: number): number {
  let out = Math.max(0, Number.isFinite(value) ? value : 0);
  if (typeof min === "number" && Number.isFinite(min)) out = Math.max(min, out);
  if (typeof max === "number" && Number.isFinite(max)) out = Math.min(max, out);
  return out;
}

function distributeFillMainSizes(
  items: readonly { readonly baseSize: number; readonly isFill: boolean; readonly weight: number; readonly min: number; readonly max: number }[],
  availableMain: number,
  gap: number,
): number[] {
  const sizes = items.map((it) => clampDim(it.baseSize, it.min, it.max));
  const fixedUsed = items.reduce((acc, it, idx) => (it.isFill ? acc : acc + sizes[idx]!), 0);
  let remaining = Math.max(0, availableMain - Math.max(0, items.length - 1) * gap - fixedUsed);
  const unlocked = new Set<number>(items.flatMap((it, idx) => (it.isFill ? [idx] : [])));

  while (unlocked.size > 0) {
    const totalWeight = [...unlocked].reduce((acc, idx) => acc + Math.max(0.01, items[idx]!.weight), 0);
    let clampedAny = false;
    for (const idx of [...unlocked]) {
      const it = items[idx]!, share = remaining * (Math.max(0.01, it.weight) / totalWeight), clamped = clampDim(share, it.min, it.max);
      if (Math.abs(clamped - share) > 1e-4) {
        sizes[idx] = clamped; remaining = Math.max(0, remaining - clamped); unlocked.delete(idx); clampedAny = true;
      } else {
        sizes[idx] = share;
      }
    }
    if (!clampedAny) break;
  }
  return sizes;
}

export function solveFlexAutoLayout(container: FlexAutoLayoutContainer): AutoLayoutSolveResult {
  const isRow = container.direction === "row", wrap = container.wrap ?? "nowrap";
  const alignItems = container.alignItems ?? "start", justifyContent = container.justifyContent ?? "start";
  const mainGap = Math.max(0, container.gap), crossGap = Math.max(0, container.crossGap ?? container.gap), pad = container.padding;
  const padMainStart = isRow ? pad.left : pad.top, padMainEnd = isRow ? pad.right : pad.bottom;
  const padCrossStart = isRow ? pad.top : pad.left, padCrossEnd = isRow ? pad.bottom : pad.right;

  const flowChildren = container.children.filter((c) => !c.hidden && !c.absolutePosition);
  const absChildren = container.children.filter((c) => !c.hidden && Boolean(c.absolutePosition));
  const mainMode = isRow ? container.widthMode : container.heightMode;
  const crossMode = isRow ? container.heightMode : container.widthMode;
  const innerMainBudget = Math.max(0, (isRow ? container.width : container.height) - padMainStart - padMainEnd);

  const prepared = flowChildren.map((spec) => {
    const minMain = isRow ? (spec.minWidth ?? 0) : (spec.minHeight ?? 0);
    const maxMain = isRow ? (spec.maxWidth ?? Infinity) : (spec.maxHeight ?? Infinity);
    const minCross = isRow ? (spec.minHeight ?? 0) : (spec.minWidth ?? 0);
    const maxCross = isRow ? (spec.maxHeight ?? Infinity) : (spec.maxWidth ?? Infinity);
    return {
      spec,
      baseMain: clampDim(isRow ? spec.width : spec.height, minMain, maxMain),
      baseCross: clampDim(isRow ? spec.height : spec.width, minCross, maxCross),
      mainFill: (isRow ? spec.widthMode : spec.heightMode) === "fill",
      crossFill: (isRow ? spec.heightMode : spec.widthMode) === "fill",
      minMain, maxMain, minCross, maxCross, weight: spec.flexGrow ?? 1,
    };
  });

  const lines: (typeof prepared)[] = [];
  if (wrap === "wrap" && mainMode !== "hug" && prepared.length > 0) {
    let cur: typeof prepared = [], used = 0;
    for (const item of prepared) {
      const need = cur.length === 0 ? item.baseMain : mainGap + item.baseMain;
      if (cur.length > 0 && used + need > innerMainBudget + 0.01) { lines.push(cur); cur = [item]; used = item.baseMain; }
      else { cur.push(item); used += need; }
    }
    if (cur.length > 0) lines.push(cur);
  } else if (prepared.length > 0) {
    lines.push(prepared);
  }

  const intrinsicMain = lines.reduce((m, line) => Math.max(m, line.reduce((s, it) => s + it.baseMain, 0) + Math.max(0, line.length - 1) * mainGap), 0);
  const lineCrossHeights = lines.map((line) => line.reduce((m, it) => Math.max(m, it.baseCross), 0));
  const intrinsicCross = lineCrossHeights.reduce((s, h) => s + h, 0) + Math.max(0, lines.length - 1) * crossGap;
  const finalInnerMain = mainMode === "hug" ? intrinsicMain : innerMainBudget;
  const finalInnerCross = crossMode === "hug" ? intrinsicCross : Math.max(0, (isRow ? container.height : container.width) - padCrossStart - padCrossEnd);

  const solvedMainSize = finalInnerMain + padMainStart + padMainEnd;
  const solvedCrossSize = finalInnerCross + padCrossStart + padCrossEnd;
  const solvedChildren: AutoLayoutSolvedRect[] = [];
  let crossCursor = padCrossStart;

  for (let lIdx = 0; lIdx < lines.length; lIdx += 1) {
    const line = lines[lIdx]!;
    const lineCross = lines.length === 1 && crossMode !== "hug" ? finalInnerCross : lineCrossHeights[lIdx]!;
    const mainSizes = mainMode === "hug"
      ? line.map((it) => it.baseMain)
      : distributeFillMainSizes(line.map((it) => ({ baseSize: it.baseMain, isFill: it.mainFill, weight: it.weight, min: it.minMain, max: it.maxMain })), finalInnerMain, mainGap);

    const usedMain = mainSizes.reduce((a, b) => a + b, 0);
    const freeSpace = Math.max(0, finalInnerMain - usedMain - Math.max(0, line.length - 1) * mainGap);
    let mainCursor = padMainStart, effectiveGap = mainGap;
    if (justifyContent === "center") mainCursor += freeSpace / 2;
    else if (justifyContent === "end") mainCursor += freeSpace;
    else if (justifyContent === "space-between" && line.length > 1) effectiveGap = mainGap + freeSpace / (line.length - 1);
    else if (justifyContent === "space-around" && line.length > 0) { const slotPad = (finalInnerMain - usedMain) / line.length; mainCursor = padMainStart + slotPad / 2; effectiveGap = slotPad; }
    else if (justifyContent === "space-evenly" && line.length > 0) { const evenGap = (finalInnerMain - usedMain) / (line.length + 1); mainCursor = padMainStart + evenGap; effectiveGap = evenGap; }

    for (let i = 0; i < line.length; i += 1) {
      const it = line[i]!, itemMain = mainSizes[i]!;
      const selfAlign = it.spec.alignSelf && it.spec.alignSelf !== "auto" ? it.spec.alignSelf : alignItems;
      const itemCross = it.crossFill || selfAlign === "stretch" ? clampDim(lineCross, it.minCross, it.maxCross) : it.baseCross;
      const crossOffset = crossCursor + (selfAlign === "center" ? (lineCross - itemCross) / 2 : selfAlign === "end" ? lineCross - itemCross : 0);
      solvedChildren.push({
        id: it.spec.id,
        x: round2(container.x + (isRow ? mainCursor : crossOffset)),
        y: round2(container.y + (isRow ? crossOffset : mainCursor)),
        width: round2(isRow ? itemMain : itemCross),
        height: round2(isRow ? itemCross : itemMain),
      });
      mainCursor += itemMain + effectiveGap;
    }
    crossCursor += lineCross + crossGap;
  }

  for (const abs of absChildren) {
    solvedChildren.push({ id: abs.id, x: round2(container.x + abs.absolutePosition!.x), y: round2(container.y + abs.absolutePosition!.y), width: round2(clampDim(abs.width, abs.minWidth, abs.maxWidth)), height: round2(clampDim(abs.height, abs.minHeight, abs.maxHeight)) });
  }
  return {
    containerRect: { id: container.id, x: round2(container.x), y: round2(container.y), width: round2(isRow ? solvedMainSize : solvedCrossSize), height: round2(isRow ? solvedCrossSize : solvedMainSize) },
    children: solvedChildren,
    lineCount: lines.length,
  };
}

function solveGridTracks(
  specs: readonly GridTrackSpec[],
  reqs: readonly { readonly start: number; readonly span: number; readonly size: number }[],
  availableInner: number,
  gap: number,
  isHug: boolean,
): number[] {
  const count = specs.length;
  if (count === 0) return [];
  const sizes = specs.map((tr) => (tr.unit === "px" ? Math.max(0, tr.value) : tr.unit === "auto" ? Math.max(0, tr.minPx ?? 0) : 0));

  for (const req of reqs) {
    const end = Math.min(count, req.start + req.span);
    if (req.span === 1) {
      const tr = specs[req.start];
      if (tr?.unit === "auto") sizes[req.start] = clampDim(Math.max(sizes[req.start]!, req.size), tr.minPx, tr.maxPx);
    } else {
      const autoIdx: number[] = [];
      let covered = Math.max(0, end - req.start - 1) * gap;
      for (let i = req.start; i < end; i += 1) { covered += sizes[i]!; if (specs[i]?.unit === "auto") autoIdx.push(i); }
      if (autoIdx.length > 0 && req.size > covered) {
        const extra = (req.size - covered) / autoIdx.length;
        for (const idx of autoIdx) { const tr = specs[idx]!; if (tr.unit === "auto") sizes[idx] = clampDim(sizes[idx]! + extra, tr.minPx, tr.maxPx); }
      }
    }
  }

  const totalFr = specs.reduce((acc, t) => (t.unit === "fr" ? acc + Math.max(0.01, t.value) : acc), 0);
  if (totalFr > 0) {
    let frUnit = 0;
    if (isHug) {
      for (const req of reqs) {
        const end = Math.min(count, req.start + req.span);
        let nonFr = Math.max(0, end - req.start - 1) * gap, spanFr = 0;
        for (let i = req.start; i < end; i += 1) {
          const tr = specs[i]!;
          if (tr.unit === "fr") spanFr += Math.max(0.01, tr.value); else nonFr += sizes[i]!;
        }
        if (spanFr > 0) frUnit = Math.max(frUnit, Math.max(0, req.size - nonFr) / spanFr);
      }
    } else {
      const nonFrSum = sizes.reduce((acc, s, idx) => (specs[idx]?.unit === "fr" ? acc : acc + s), 0);
      frUnit = Math.max(0, availableInner - Math.max(0, count - 1) * gap - nonFrSum) / totalFr;
    }
    for (let i = 0; i < count; i += 1) if (specs[i]!.unit === "fr") sizes[i] = Math.max(0.01, (specs[i] as { value: number }).value) * frUnit;
  }
  return sizes.map(round2);
}

export function solveGridAutoLayout(container: GridAutoLayoutContainer): AutoLayoutSolveResult {
  const colSpecs: GridTrackSpec[] = container.columns.length > 0 ? [...container.columns] : [{ unit: "fr", value: 1 }];
  const colCount = colSpecs.length, rowSpecs: GridTrackSpec[] = [...container.rows];
  const colGap = Math.max(0, container.columnGap), rowGap = Math.max(0, container.rowGap), pad = container.padding;
  const autoFlow = container.autoFlow ?? "row", alignItems = container.alignItems ?? "stretch", justifyItems = container.justifyItems ?? "stretch";
  const flowChildren = container.children.filter((c) => !c.hidden && !c.absolutePosition);
  const absChildren = container.children.filter((c) => !c.hidden && Boolean(c.absolutePosition));

  const occupied = new Set<string>();
  const fits = (r: number, c: number, rs: number, cs: number): boolean => {
    if (c < 0 || c + cs > colCount) return false;
    for (let rr = r; rr < r + rs; rr += 1) for (let cc = c; cc < c + cs; cc += 1) if (occupied.has(`${rr}:${cc}`)) return false;
    return true;
  };
  const mark = (r: number, c: number, rs: number, cs: number): void => {
    for (let rr = r; rr < r + rs; rr += 1) for (let cc = c; cc < c + cs; cc += 1) occupied.add(`${rr}:${cc}`);
  };

  const placements: { readonly spec: AutoLayoutChildSpec; readonly col: number; readonly row: number; readonly colSpan: number; readonly rowSpan: number }[] = [];
  let cursorRow = 0, cursorCol = 0, maxRowUsed = rowSpecs.length;

  for (const spec of flowChildren) {
    const colSpan = Math.max(1, Math.min(colCount, Math.floor(spec.colSpan ?? 1)));
    const rowSpan = Math.max(1, Math.floor(spec.rowSpan ?? 1));
    let placedRow = 0, placedCol = 0;

    if (spec.colStart !== undefined && spec.rowStart !== undefined) {
      placedCol = Math.max(0, Math.min(colCount - colSpan, Math.floor(spec.colStart) - 1));
      placedRow = Math.max(0, Math.floor(spec.rowStart) - 1);
    } else if (autoFlow === "column" && rowSpecs.length > 0) {
      let found = false;
      for (let c = 0; c < colCount && !found; c += 1) {
        for (let r = 0; r <= Math.max(rowSpecs.length, 64) && !found; r += 1) {
          if (r + rowSpan <= Math.max(rowSpecs.length, rowSpan) && fits(r, c, rowSpan, colSpan)) { placedRow = r; placedCol = c; found = true; }
        }
      }
    } else {
      let r = autoFlow === "dense" ? 0 : cursorRow, c = autoFlow === "dense" ? 0 : cursorCol;
      while (!fits(r, c, rowSpan, colSpan)) { c += 1; if (c + colSpan > colCount) { c = 0; r += 1; } }
      placedRow = r; placedCol = c;
      if (autoFlow !== "dense") { cursorRow = r; cursorCol = c + colSpan; if (cursorCol >= colCount) { cursorCol = 0; cursorRow += 1; } }
    }
    mark(placedRow, placedCol, rowSpan, colSpan);
    maxRowUsed = Math.max(maxRowUsed, placedRow + rowSpan);
    placements.push({ spec, col: placedCol, row: placedRow, colSpan, rowSpan });
  }
  while (rowSpecs.length < Math.max(1, maxRowUsed)) rowSpecs.push({ unit: "auto" });

  const colWidths = solveGridTracks(colSpecs, placements.map((p) => ({ start: p.col, span: p.colSpan, size: clampDim(p.spec.width, p.spec.minWidth, p.spec.maxWidth) })), Math.max(0, container.width - pad.left - pad.right), colGap, container.widthMode === "hug");
  const rowHeights = solveGridTracks(rowSpecs, placements.map((p) => ({ start: p.row, span: p.rowSpan, size: clampDim(p.spec.height, p.spec.minHeight, p.spec.maxHeight) })), Math.max(0, container.height - pad.top - pad.bottom), rowGap, container.heightMode === "hug");

  const colOffsets: number[] = [], rowOffsets: number[] = [];
  let cx = pad.left, ry = pad.top;
  for (const w of colWidths) { colOffsets.push(cx); cx += w + colGap; }
  for (const h of rowHeights) { rowOffsets.push(ry); ry += h + rowGap; }

  const solvedChildren: AutoLayoutSolvedRect[] = placements.map((p) => {
    let areaW = Math.max(0, p.colSpan - 1) * colGap, areaH = Math.max(0, p.rowSpan - 1) * rowGap;
    for (let c = p.col; c < p.col + p.colSpan; c += 1) areaW += colWidths[c] ?? 0;
    for (let r = p.row; r < p.row + p.rowSpan; r += 1) areaH += rowHeights[r] ?? 0;
    const itemW = (p.spec.widthMode ?? (justifyItems === "stretch" ? "fill" : "fixed")) === "fill" ? clampDim(areaW, p.spec.minWidth, p.spec.maxWidth) : clampDim(p.spec.width, p.spec.minWidth, p.spec.maxWidth);
    const itemH = (p.spec.heightMode ?? (alignItems === "stretch" ? "fill" : "fixed")) === "fill" ? clampDim(areaH, p.spec.minHeight, p.spec.maxHeight) : clampDim(p.spec.height, p.spec.minHeight, p.spec.maxHeight);
    const dx = justifyItems === "center" ? (areaW - itemW) / 2 : justifyItems === "end" ? areaW - itemW : 0;
    const dy = alignItems === "center" ? (areaH - itemH) / 2 : alignItems === "end" ? areaH - itemH : 0;
    return { id: p.spec.id, x: round2(container.x + colOffsets[p.col]! + dx), y: round2(container.y + rowOffsets[p.row]! + dy), width: round2(itemW), height: round2(itemH), column: p.col + 1, row: p.row + 1, colSpan: p.colSpan, rowSpan: p.rowSpan };
  });

  for (const abs of absChildren) {
    solvedChildren.push({ id: abs.id, x: round2(container.x + abs.absolutePosition!.x), y: round2(container.y + abs.absolutePosition!.y), width: round2(clampDim(abs.width, abs.minWidth, abs.maxWidth)), height: round2(clampDim(abs.height, abs.minHeight, abs.maxHeight)) });
  }
  const totalColW = colWidths.reduce((a, b) => a + b, 0) + Math.max(0, colWidths.length - 1) * colGap;
  const totalRowH = rowHeights.reduce((a, b) => a + b, 0) + Math.max(0, rowHeights.length - 1) * rowGap;
  return {
    containerRect: { id: container.id, x: round2(container.x), y: round2(container.y), width: round2(container.widthMode === "hug" ? totalColW + pad.left + pad.right : container.width), height: round2(container.heightMode === "hug" ? totalRowH + pad.top + pad.bottom : container.height) },
    children: solvedChildren, lineCount: rowHeights.length, columnWidths: colWidths, rowHeights,
  };
}

export function solveAutoLayoutContainer(container: AutoLayoutContainerSpec): AutoLayoutSolveResult {
  return container.mode === "grid" ? solveGridAutoLayout(container) : solveFlexAutoLayout(container);
}

export function applyAutoLayoutToCanvasElements(result: AutoLayoutSolveResult, elements: readonly El[]): readonly El[] {
  const rectById = new Map<string, AutoLayoutSolvedRect>([[result.containerRect.id, result.containerRect], ...result.children.map((c) => [c.id, c] as const)]);
  return elements.map((el) => {
    const r = rectById.get(el.id);
    if (!r) return el;
    if (el.type === "frame" || el.type === "bubble" || el.type === "image") return { ...el, x: r.x, y: r.y, width: r.width, height: r.height };
    if (el.type === "text") return { ...el, x: r.x, y: r.y, width: r.width };
    return el;
  });
}

function clusterItemsIntoRows(items: readonly SmartSelectionItem[]): SmartSelectionItem[][] {
  const rows: SmartSelectionItem[][] = [];
  for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const midY = item.y + item.height / 2;
    const match = rows.find((row) => midY >= Math.min(...row.map((r) => r.y)) && midY <= Math.max(...row.map((r) => r.y + r.height)));
    if (match) match.push(item); else rows.push([item]);
  }
  for (const row of rows) row.sort((a, b) => a.x - b.x);
  return rows;
}

function layoutOrderedGrid(ordered: readonly SmartSelectionItem[], originX: number, originY: number, cols: number, gapX: number, gapY: number): SmartSelectionItem[] {
  const out: SmartSelectionItem[] = [];
  let cursorY = originY;
  for (let start = 0; start < ordered.length; start += cols) {
    const slice = ordered.slice(start, start + cols);
    let cursorX = originX, maxH = 0;
    for (const item of slice) {
      out.push({ ...item, x: round2(cursorX), y: round2(cursorY) });
      cursorX += item.width + gapX;
      if (item.height > maxH) maxH = item.height;
    }
    cursorY += maxH + gapY;
  }
  return out;
}

export function analyzeSmartSelection(items: readonly SmartSelectionItem[]): SmartSelectionAnalysis {
  if (items.length < 2) {
    return {
      pattern: "scattered", uniformGapX: null, uniformGapY: null, columnCount: items.length, rowCount: items.length > 0 ? 1 : 0, gapHandles: [],
      swapHandles: items.map((it, idx) => ({ itemId: it.id, centerX: round2(it.x + it.width / 2), centerY: round2(it.y + it.height / 2), slotIndex: idx })),
    };
  }
  const rows = clusterItemsIntoRows(items), rowCount = rows.length, maxCols = Math.max(...rows.map((r) => r.length));
  const pattern: SmartSelectionPattern = rowCount === 1 ? "row" : rows.every((r) => r.length === 1) ? "column" : rows.every((r) => r.length === maxCols) || (rowCount >= 2 && maxCols >= 2 && items.length >= 3) ? "grid" : "scattered";
  const gapHandles: SmartSelectionGapHandle[] = [], xGaps: number[] = [], yGaps: number[] = [];

  for (const row of rows) {
    for (let i = 0; i + 1 < row.length; i += 1) {
      const a = row[i]!, b = row[i + 1]!, gapPx = round2(b.x - (a.x + a.width));
      xGaps.push(gapPx);
      gapHandles.push({ axis: "x", beforeId: a.id, afterId: b.id, centerX: round2(a.x + a.width + gapPx / 2), centerY: round2((a.y + a.height / 2 + b.y + b.height / 2) / 2), gapPx });
    }
  }
  for (let r = 0; r + 1 < rows.length; r += 1) {
    const topB = Math.max(...rows[r]!.map((it) => it.y + it.height)), botT = Math.min(...rows[r + 1]!.map((it) => it.y)), gapPx = round2(botT - topB);
    yGaps.push(gapPx);
    const a = rows[r]![0]!, b = rows[r + 1]![0]!;
    gapHandles.push({ axis: "y", beforeId: a.id, afterId: b.id, centerX: round2((a.x + a.width / 2 + b.x + b.width / 2) / 2), centerY: round2(topB + gapPx / 2), gapPx });
  }
  const uniform = (arr: readonly number[]): number | null => (arr.length > 0 && Math.max(...arr) - Math.min(...arr) <= 1.5 ? round2(arr.reduce((s, v) => s + v, 0) / arr.length) : null);
  return {
    pattern, uniformGapX: uniform(xGaps), uniformGapY: uniform(yGaps), columnCount: maxCols, rowCount, gapHandles,
    swapHandles: rows.flat().map((it, idx) => ({ itemId: it.id, centerX: round2(it.x + it.width / 2), centerY: round2(it.y + it.height / 2), slotIndex: idx })),
  };
}

export function tidySmartSelection(items: readonly SmartSelectionItem[], options?: { readonly gapX?: number; readonly gapY?: number; readonly columns?: number }): readonly SmartSelectionItem[] {
  if (items.length <= 1) return [...items];
  const analysis = analyzeSmartSelection(items), ordered = clusterItemsIntoRows(items).flat();
  const xGaps = analysis.gapHandles.filter((h) => h.axis === "x").map((h) => h.gapPx);
  const yGaps = analysis.gapHandles.filter((h) => h.axis === "y").map((h) => h.gapPx);
  const gapX = round2(Math.max(0, options?.gapX ?? (xGaps.length > 0 ? xGaps.reduce((a, b) => a + b, 0) / xGaps.length : 16)));
  const gapY = round2(Math.max(0, options?.gapY ?? (yGaps.length > 0 ? yGaps.reduce((a, b) => a + b, 0) / yGaps.length : 16)));
  const cols = options?.columns !== undefined ? Math.max(1, Math.floor(options.columns)) : analysis.pattern === "row" ? ordered.length : analysis.pattern === "column" ? 1 : Math.max(1, analysis.columnCount);
  return layoutOrderedGrid(ordered, Math.min(...items.map((i) => i.x)), Math.min(...items.map((i) => i.y)), cols, gapX, gapY);
}

export function scrubSmartSelectionGap(items: readonly SmartSelectionItem[], axis: "x" | "y", nextGapPx: number): readonly SmartSelectionItem[] {
  if (items.length <= 1) return [...items];
  const safeGap = round2(Math.max(0, nextGapPx)), rows = clusterItemsIntoRows(items), updated = new Map<string, SmartSelectionItem>();
  if (axis === "x") {
    for (const row of rows) {
      let cx = row[0]!.x;
      for (const it of row) { updated.set(it.id, { ...it, x: round2(cx) }); cx += it.width + safeGap; }
    }
  } else {
    let cy = Math.min(...rows[0]!.map((it) => it.y));
    for (const row of rows) {
      let maxH = 0;
      for (const it of row) { updated.set(it.id, { ...it, y: round2(cy) }); if (it.height > maxH) maxH = it.height; }
      cy += maxH + safeGap;
    }
  }
  return items.map((it) => updated.get(it.id) ?? it);
}

export function swapSmartSelectionSlots(items: readonly SmartSelectionItem[], sourceId: string, targetId: string): readonly SmartSelectionItem[] {
  if (sourceId === targetId || items.length < 2) return [...items];
  const analysis = analyzeSmartSelection(items), ordered = clusterItemsIntoRows(items).flat();
  const idxA = ordered.findIndex((it) => it.id === sourceId), idxB = ordered.findIndex((it) => it.id === targetId);
  if (idxA < 0 || idxB < 0) return [...items];
  const swapped = [...ordered];
  [swapped[idxA], swapped[idxB]] = [ordered[idxB]!, ordered[idxA]!];
  const cols = analysis.pattern === "row" ? swapped.length : analysis.pattern === "column" ? 1 : Math.max(1, analysis.columnCount);
  return layoutOrderedGrid(swapped, Math.min(...items.map((i) => i.x)), Math.min(...items.map((i) => i.y)), cols, analysis.uniformGapX ?? 16, analysis.uniformGapY ?? 16);
}

function formatGridTrackCss(track: GridTrackSpec): string {
  if (track.unit === "fr") return `${track.value}fr`;
  if (track.unit === "px") return `${track.value}px`;
  if (track.minPx !== undefined && track.maxPx !== undefined) return `minmax(${track.minPx}px, ${track.maxPx}px)`;
  return track.minPx !== undefined ? `minmax(${track.minPx}px, auto)` : "auto";
}

export function exportAutoLayoutToCss(container: AutoLayoutContainerSpec): string {
  const { padding: p } = container;
  const padLine = `padding: ${p.top}px ${p.right}px ${p.bottom}px ${p.left}px;`;
  if (container.mode === "grid") {
    return [
      "display: grid;",
      `grid-template-columns: ${container.columns.map(formatGridTrackCss).join(" ")};`,
      ...(container.rows.length > 0 ? [`grid-template-rows: ${container.rows.map(formatGridTrackCss).join(" ")};`] : []),
      `column-gap: ${container.columnGap}px;`,
      `row-gap: ${container.rowGap}px;`,
      padLine,
      ...(container.autoFlow ? [`grid-auto-flow: ${container.autoFlow};`] : []),
      ...(container.alignItems ? [`align-items: ${container.alignItems};`] : []),
      ...(container.justifyItems ? [`justify-items: ${container.justifyItems};`] : []),
    ].join("\n");
  }
  return [
    "display: flex;",
    `flex-direction: ${container.direction};`,
    ...(container.wrap === "wrap" ? ["flex-wrap: wrap;"] : []),
    `gap: ${container.gap}px${container.crossGap !== undefined && container.crossGap !== container.gap ? ` ${container.crossGap}px` : ""};`,
    padLine,
    ...(container.alignItems ? [`align-items: ${container.alignItems};`] : []),
    ...(container.justifyContent ? [`justify-content: ${container.justifyContent};`] : []),
  ].join("\n");
}
