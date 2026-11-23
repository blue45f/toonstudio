/**
 * 세로 스크롤 ↔ 단행본 페이지 양방향 자동 리플로우 &
 * 2D 투시선 2쌍 → 3D 카메라(소실점·지평선·FOV·Pitch/Yaw/Roll) 자동 역산 엔진.
 * 순수 TypeScript 계산 모듈 · 시맨틱 색상 원칙 · 순수 메모리 연산 · 외부 런타임 의존성 0건.
 */

export type PrintBookFormatId = "b5" | "shinkook" | "jp-shinsho";
export type ReadingDirection = "ltr" | "rtl";
export type CutImportance = "establishing" | "dialogue" | "action" | "splash";

export interface PrintBookFormatSpec {
  readonly id: PrintBookFormatId; readonly labelKo: string; readonly labelEn: string;
  readonly trimWidthMm: number; readonly trimHeightMm: number;
  readonly defaultDpi: number; readonly defaultBleedMm: number; readonly defaultDirection: ReadingDirection;
  readonly marginTopMm: number; readonly marginBottomMm: number;
  readonly marginOuterMm: number; readonly marginInnerMm: number;
  readonly minReadableWidthMm: number; readonly defaultGutterGapMm: number;
}

export const MM_PER_INCH = 25.4;
export const DEFAULT_PRINT_DPI = 300;
export const DEFAULT_BLEED_MM = 3;
export const DEFAULT_SCROLL_WIDTH_PX = 800;

export const PRINT_BOOK_PRESETS: Readonly<Record<PrintBookFormatId, PrintBookFormatSpec>> = {
  b5: {
    id: "b5", labelKo: "B5 단행본 (182×257mm)", labelEn: "B5 Print (182×257mm)",
    trimWidthMm: 182, trimHeightMm: 257, defaultDpi: DEFAULT_PRINT_DPI, defaultBleedMm: DEFAULT_BLEED_MM,
    defaultDirection: "ltr", marginTopMm: 13, marginBottomMm: 14, marginOuterMm: 11, marginInnerMm: 15,
    minReadableWidthMm: 42, defaultGutterGapMm: 4.5,
  },
  shinkook: {
    id: "shinkook", labelKo: "신국판 (152×225mm)", labelEn: "Shinkook KR (152×225mm)",
    trimWidthMm: 152, trimHeightMm: 225, defaultDpi: DEFAULT_PRINT_DPI, defaultBleedMm: DEFAULT_BLEED_MM,
    defaultDirection: "ltr", marginTopMm: 12, marginBottomMm: 13, marginOuterMm: 10, marginInnerMm: 14,
    minReadableWidthMm: 36, defaultGutterGapMm: 4,
  },
  "jp-shinsho": {
    id: "jp-shinsho", labelKo: "일본 신서판 (112×174mm)", labelEn: "JP Shinsho (112×174mm)",
    trimWidthMm: 112, trimHeightMm: 174, defaultDpi: DEFAULT_PRINT_DPI, defaultBleedMm: DEFAULT_BLEED_MM,
    defaultDirection: "rtl", marginTopMm: 9, marginBottomMm: 10, marginOuterMm: 8, marginInnerMm: 11,
    minReadableWidthMm: 30, defaultGutterGapMm: 3.2,
  },
};

export const PRINT_BOOK_FORMAT_LIST: readonly PrintBookFormatSpec[] = [
  PRINT_BOOK_PRESETS.b5, PRINT_BOOK_PRESETS.shinkook, PRINT_BOOK_PRESETS["jp-shinsho"],
];

export interface ScrollBalloonRect {
  readonly id: string; readonly text: string;
  readonly xNorm: number; readonly yNorm: number; readonly widthNorm: number; readonly heightNorm: number;
  readonly fontSizePt?: number;
}
export interface ScrollCutInput {
  readonly id: string; readonly order: number; readonly widthPx: number; readonly heightPx: number;
  readonly importance?: CutImportance; readonly breathingGapAfterPx?: number;
  readonly balloons: readonly ScrollBalloonRect[];
}
export interface ReflowScrollToPrintOptions {
  readonly format: PrintBookFormatId; readonly dpi?: number; readonly bleedMm?: number;
  readonly readingDirection?: ReadingDirection; readonly minCutsPerPage?: number; readonly maxCutsPerPage?: number;
  readonly minReadableWidthMm?: number; readonly gutterGapMm?: number; readonly balloonSafeInsetMm?: number;
}
export interface PlacedPrintBalloon {
  readonly id: string; readonly text: string;
  readonly xMm: number; readonly yMm: number; readonly widthMm: number; readonly heightMm: number;
  readonly xPx: number; readonly yPx: number; readonly widthPx: number; readonly heightPx: number;
  readonly fontSizePt: number; readonly clampedToSafeZone: boolean; readonly clipped: boolean;
}
export interface PrintPlacedPanel {
  readonly id: string; readonly sourceCutId: string; readonly readingOrder: number;
  readonly rowIndex: number; readonly colIndex: number; readonly importance: CutImportance;
  readonly xMm: number; readonly yMm: number; readonly widthMm: number; readonly heightMm: number;
  readonly xPx: number; readonly yPx: number; readonly widthPx: number; readonly heightPx: number;
  readonly readableWidthOk: boolean; readonly balloons: readonly PlacedPrintBalloon[];
}
export interface PrintPageLayout {
  readonly pageNumber: number; readonly side: "recto" | "verso"; readonly readingDirection: ReadingDirection;
  readonly trimWidthMm: number; readonly trimHeightMm: number; readonly bleedMm: number;
  readonly panels: readonly PrintPlacedPanel[]; readonly cutCount: number; readonly fillRatio: number;
  readonly minPanelWidthMm: number; readonly clippedBalloonCount: number;
}
export interface ResolvedPrintDimensions {
  readonly dpi: number; readonly bleedMm: number; readonly bleedPx: number;
  readonly trimWidthMm: number; readonly trimHeightMm: number; readonly trimWidthPx: number; readonly trimHeightPx: number;
  readonly fullWidthMm: number; readonly fullHeightMm: number; readonly fullWidthPx: number; readonly fullHeightPx: number;
  readonly safeWidthMm: number; readonly safeHeightMm: number;
}
export interface ScrollToPrintReflowResult {
  readonly format: PrintBookFormatId; readonly spec: PrintBookFormatSpec;
  readonly dimensions: ResolvedPrintDimensions; readonly readingDirection: ReadingDirection;
  readonly pages: readonly PrintPageLayout[]; readonly totalCuts: number; readonly totalPages: number;
  readonly clippedBalloonCount: number; readonly minPanelWidthMm: number; readonly minReadableWidthMm: number;
  readonly readableWidthViolations: number; readonly allPagesInTargetRange: boolean; readonly warnings: readonly string[];
}
export interface PrintPanelInput {
  readonly id: string; readonly sourceCutId?: string; readonly importance?: CutImportance;
  readonly xMm: number; readonly yMm: number; readonly widthMm: number; readonly heightMm: number;
  readonly balloons: readonly {
    readonly id: string; readonly text: string;
    readonly xMm: number; readonly yMm: number; readonly widthMm: number; readonly heightMm: number;
    readonly fontSizePt?: number;
  }[];
}
export interface PrintPageInput {
  readonly pageNumber: number; readonly readingDirection: ReadingDirection;
  readonly trimWidthMm: number; readonly trimHeightMm: number; readonly panels: readonly PrintPanelInput[];
}
export interface ReflowPrintToScrollOptions {
  readonly targetWidthPx?: number; readonly sideMarginPx?: number;
  readonly minCutHeightPx?: number; readonly maxCutHeightPx?: number; readonly balloonSafeInsetPx?: number;
}
export interface ScrollExpandedBalloon {
  readonly id: string; readonly text: string;
  readonly xPx: number; readonly yPx: number; readonly widthPx: number; readonly heightPx: number;
  readonly xNorm: number; readonly yNorm: number; readonly widthNorm: number; readonly heightNorm: number;
  readonly clipped: boolean;
}
export interface ScrollExpandedCut {
  readonly scrollOrder: number; readonly sourcePageNumber: number; readonly sourcePanelId: string;
  readonly importance: CutImportance;
  readonly xPx: number; readonly yPx: number; readonly widthPx: number; readonly heightPx: number;
  readonly breathingGapAfterPx: number;
  readonly pacingReason: "page-turn" | "action-beat" | "dialogue-flow" | "standard-beat";
  readonly balloons: readonly ScrollExpandedBalloon[];
}
export interface PrintToScrollReflowResult {
  readonly canvasWidthPx: number; readonly totalHeightPx: number; readonly totalCuts: number;
  readonly sourcePageCount: number; readonly readingDirection: ReadingDirection;
  readonly cuts: readonly ScrollExpandedCut[]; readonly averageBreathingGapPx: number; readonly clippedBalloonCount: number;
}

export function mmToPx(mm: number, dpi: number = DEFAULT_PRINT_DPI): number {
  return Math.round((mm / MM_PER_INCH) * dpi);
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const roundTo = (value: number, digits = 3): number => Math.round(value * 10 ** digits) / 10 ** digits;

/** 총 컷 수를 페이지당 [minPerPage..maxPerPage] 범위(기본 4~6컷)로 균형 분할한다. */
function partitionCutCounts(totalCuts: number, minPerPage: number, maxPerPage: number): readonly number[] {
  if (totalCuts <= 0) return [];
  if (totalCuts <= maxPerPage) return [totalCuts];
  const minPages = Math.ceil(totalCuts / maxPerPage);
  const maxPages = Math.max(minPages, Math.floor(totalCuts / minPerPage));
  let chosenPages = minPages;
  for (let pages = minPages; pages <= maxPages; pages += 1) {
    if (pages * minPerPage <= totalCuts && totalCuts <= pages * maxPerPage) { chosenPages = pages; break; }
  }
  const base = Math.floor(totalCuts / chosenPages);
  const remainder = totalCuts % chosenPages;
  return Array.from({ length: chosenPages }, (_, i) => base + (i < remainder ? 1 : 0));
}

/** 페이지 내 컷 수와 중요도에 따라 1~2열 행(Row) 구성을 결정한다. */
function planRowCounts(pageCuts: readonly ScrollCutInput[]): readonly number[] {
  const n = pageCuts.length;
  if (n <= 1) return [n];
  if (n === 2) return [1, 1];
  if (n === 3) return [1, 2];
  if (n === 4) {
    const heroFirst = pageCuts[0]?.importance === "establishing" || pageCuts[0]?.importance === "splash";
    return heroFirst ? [1, 2, 1] : [2, 2];
  }
  if (n === 5) {
    if (pageCuts[0]?.importance === "establishing" || pageCuts[0]?.importance === "splash") return [1, 2, 2];
    if (pageCuts[4]?.importance === "splash" || pageCuts[4]?.importance === "action") return [2, 2, 1];
    return [2, 1, 2];
  }
  const rows: number[] = [];
  let rem = n;
  while (rem > 0) {
    if (rem === 3) { rows.push(1, 2); rem = 0; }
    else if (rem >= 2) { rows.push(2); rem -= 2; }
    else { rows.push(1); rem -= 1; }
  }
  return rows;
}

function placeBalloonsSafelyInPanel(
  balloons: readonly ScrollBalloonRect[],
  px: number, py: number, pw: number, ph: number,
  bleedMm: number, dpi: number, safeInsetMm: number,
): readonly PlacedPrintBalloon[] {
  const insetX = Math.min(safeInsetMm, pw * 0.12);
  const insetY = Math.min(safeInsetMm, ph * 0.12);
  const minX = px + insetX; const maxX = px + pw - insetX;
  const minY = py + insetY; const maxY = py + ph - insetY;
  const availW = Math.max(4, maxX - minX);
  const availH = Math.max(4, maxY - minY);

  return balloons.map((b) => {
    const rawW = Math.max(0.08, b.widthNorm) * pw;
    const rawH = Math.max(0.06, b.heightNorm) * ph;
    const rawX = px + b.xNorm * pw;
    const rawY = py + b.yNorm * ph;
    const widthMm = Math.min(rawW, availW);
    const heightMm = Math.min(rawH, availH);
    const xMm = clamp(rawX, minX, Math.max(minX, maxX - widthMm));
    const yMm = clamp(rawY, minY, Math.max(minY, maxY - heightMm));
    const clampedToSafeZone =
      Math.abs(xMm - rawX) > 1e-4 || Math.abs(yMm - rawY) > 1e-4 ||
      Math.abs(widthMm - rawW) > 1e-4 || Math.abs(heightMm - rawH) > 1e-4;
    const shrink = Math.min(1, widthMm / Math.max(1e-4, rawW), heightMm / Math.max(1e-4, rawH));
    const fontSizePt = roundTo(Math.max(6.5, (b.fontSizePt ?? 9.5) * Math.sqrt(shrink)), 2);
    const clipped = xMm < px - 1e-6 || yMm < py - 1e-6 || xMm + widthMm > px + pw + 1e-6 || yMm + heightMm > py + ph + 1e-6;
    return {
      id: b.id, text: b.text,
      xMm: roundTo(xMm, 2), yMm: roundTo(yMm, 2), widthMm: roundTo(widthMm, 2), heightMm: roundTo(heightMm, 2),
      xPx: mmToPx(xMm + bleedMm, dpi), yPx: mmToPx(yMm + bleedMm, dpi),
      widthPx: mmToPx(widthMm, dpi), heightPx: mmToPx(heightMm, dpi),
      fontSizePt, clampedToSafeZone, clipped,
    };
  });
}

/** 세로 스크롤 웹툰 컷 목록을 출판 단행본(B5·신국판·일본 신서판, 300DPI, 3mm 도련) 페이지로 자동 리플로우한다. */
export function reflowScrollToPrintPages(
  cuts: readonly ScrollCutInput[],
  options: ReflowScrollToPrintOptions,
): ScrollToPrintReflowResult {
  const spec = PRINT_BOOK_PRESETS[options.format];
  const dpi = Math.max(150, options.dpi ?? spec.defaultDpi);
  const bleedMm = Math.max(0, options.bleedMm ?? spec.defaultBleedMm);
  const readingDirection = options.readingDirection ?? spec.defaultDirection;
  const minCutsPerPage = Math.max(1, options.minCutsPerPage ?? 4);
  const maxCutsPerPage = Math.max(minCutsPerPage, options.maxCutsPerPage ?? 6);
  const minReadableWidthMm = options.minReadableWidthMm ?? spec.minReadableWidthMm;
  const gutterGapMm = Math.max(1.5, options.gutterGapMm ?? spec.defaultGutterGapMm);
  const balloonSafeInsetMm = Math.max(1, options.balloonSafeInsetMm ?? 2.2);

  const safeWidthMm = spec.trimWidthMm - spec.marginInnerMm - spec.marginOuterMm;
  const safeHeightMm = spec.trimHeightMm - spec.marginTopMm - spec.marginBottomMm;
  const dimensions: ResolvedPrintDimensions = {
    dpi, bleedMm, bleedPx: mmToPx(bleedMm, dpi),
    trimWidthMm: spec.trimWidthMm, trimHeightMm: spec.trimHeightMm,
    trimWidthPx: mmToPx(spec.trimWidthMm, dpi), trimHeightPx: mmToPx(spec.trimHeightMm, dpi),
    fullWidthMm: spec.trimWidthMm + bleedMm * 2, fullHeightMm: spec.trimHeightMm + bleedMm * 2,
    fullWidthPx: mmToPx(spec.trimWidthMm + bleedMm * 2, dpi), fullHeightPx: mmToPx(spec.trimHeightMm + bleedMm * 2, dpi),
    safeWidthMm: roundTo(safeWidthMm, 2), safeHeightMm: roundTo(safeHeightMm, 2),
  };

  const sortedCuts = [...cuts].sort((a, b) => a.order - b.order);
  const pageSizes = partitionCutCounts(sortedCuts.length, minCutsPerPage, maxCutsPerPage);
  const warnings: string[] = bleedMm < DEFAULT_BLEED_MM ? [`도련(${bleedMm}mm)이 표준 3mm 미만입니다.`] : [];

  const pages: PrintPageLayout[] = [];
  let cursor = 0;
  let globalMinPanelWidthMm = Number.POSITIVE_INFINITY;
  let totalClippedBalloons = 0;
  let readableWidthViolations = 0;
  let allPagesInTargetRange = pageSizes.length > 0;

  for (let p = 0; p < pageSizes.length; p += 1) {
    const count = pageSizes[p] ?? 0;
    const slice = sortedCuts.slice(cursor, cursor + count);
    cursor += count;

    const pageNumber = p + 1;
    const side: "recto" | "verso" = pageNumber % 2 === 1 ? "recto" : "verso";
    const leftMarginMm =
      readingDirection === "ltr"
        ? (side === "recto" ? spec.marginInnerMm : spec.marginOuterMm)
        : (side === "recto" ? spec.marginOuterMm : spec.marginInnerMm);

    const rowCounts = planRowCounts(slice);
    const usableHeightMm = safeHeightMm - gutterGapMm * Math.max(0, rowCounts.length - 1);
    const rowWeights: number[] = [];
    let rowCursor = 0;
    for (const cols of rowCounts) {
      const rowSlice = slice.slice(rowCursor, rowCursor + cols);
      rowCursor += cols;
      const hasSplash = rowSlice.some((c) => c.importance === "splash" || c.importance === "establishing");
      const avgAspect =
        rowSlice.reduce((acc, c) => acc + clamp(c.heightPx / Math.max(1, c.widthPx), 0.55, 1.85), 0) / Math.max(1, rowSlice.length);
      rowWeights.push((cols === 1 ? 1.18 : 1) * (hasSplash ? 1.15 : 1) * (0.7 + avgAspect * 0.3));
    }
    const totalWeight = rowWeights.reduce((a, b) => a + b, 0) || 1;

    const panels: PrintPlacedPanel[] = [];
    let currentY = spec.marginTopMm;
    let sliceIdx = 0;
    let pageMinWidthMm = Number.POSITIVE_INFINITY;
    let pageClippedBalloons = 0;
    let totalPanelAreaMm2 = 0;

    for (let r = 0; r < rowCounts.length; r += 1) {
      const cols = rowCounts[r] ?? 1;
      const rowHeightMm = (usableHeightMm * (rowWeights[r] ?? 1)) / totalWeight;
      const rowCuts = slice.slice(sliceIdx, sliceIdx + cols);
      sliceIdx += cols;
      const usableRowWidthMm = safeWidthMm - gutterGapMm * Math.max(0, cols - 1);
      const colWeights = rowCuts.map((c) =>
        clamp(c.widthPx / Math.max(1, c.heightPx), 0.65, 1.45) * (c.importance === "action" || c.importance === "splash" ? 1.12 : 1),
      );
      const weightSum = colWeights.reduce((a, b) => a + b, 0) || 1;
      const rawWidths = colWeights.map((w) => (usableRowWidthMm * w) / weightSum);
      const colWidths =
        cols === 2 && usableRowWidthMm >= minReadableWidthMm * 2
          ? (() => {
              const first = clamp(rawWidths[0] ?? usableRowWidthMm / 2, minReadableWidthMm, usableRowWidthMm - minReadableWidthMm);
              return [first, usableRowWidthMm - first];
            })()
          : rawWidths;

      let ltrCursorX = leftMarginMm;
      let rtlCursorRightX = leftMarginMm + safeWidthMm;
      for (let c = 0; c < cols; c += 1) {
        const cut = rowCuts[c];
        if (!cut) continue;
        const widthMm = colWidths[c] ?? usableRowWidthMm / cols;
        const xMm = readingDirection === "ltr" ? ltrCursorX : rtlCursorRightX - widthMm;
        if (readingDirection === "ltr") ltrCursorX += widthMm + gutterGapMm;
        else rtlCursorRightX -= widthMm + gutterGapMm;

        const placedBalloons = placeBalloonsSafelyInPanel(
          cut.balloons, xMm, currentY, widthMm, rowHeightMm, bleedMm, dpi, balloonSafeInsetMm,
        );
        const panelClipped = placedBalloons.filter((b) => b.clipped).length;
        pageClippedBalloons += panelClipped;
        totalClippedBalloons += panelClipped;

        const readableWidthOk = widthMm + 1e-4 >= minReadableWidthMm;
        if (!readableWidthOk) readableWidthViolations += 1;
        pageMinWidthMm = Math.min(pageMinWidthMm, widthMm);
        globalMinPanelWidthMm = Math.min(globalMinPanelWidthMm, widthMm);
        totalPanelAreaMm2 += widthMm * rowHeightMm;

        panels.push({
          id: `p${pageNumber}-c${panels.length + 1}`, sourceCutId: cut.id, readingOrder: panels.length + 1,
          rowIndex: r, colIndex: c, importance: cut.importance ?? "dialogue",
          xMm: roundTo(xMm, 2), yMm: roundTo(currentY, 2), widthMm: roundTo(widthMm, 2), heightMm: roundTo(rowHeightMm, 2),
          xPx: mmToPx(xMm + bleedMm, dpi), yPx: mmToPx(currentY + bleedMm, dpi),
          widthPx: mmToPx(widthMm, dpi), heightPx: mmToPx(rowHeightMm, dpi),
          readableWidthOk, balloons: placedBalloons,
        });
      }
      currentY += rowHeightMm + gutterGapMm;
    }

    if (panels.length < minCutsPerPage || panels.length > maxCutsPerPage) allPagesInTargetRange = false;
    pages.push({
      pageNumber, side, readingDirection, trimWidthMm: spec.trimWidthMm, trimHeightMm: spec.trimHeightMm, bleedMm,
      panels, cutCount: panels.length,
      fillRatio: roundTo(totalPanelAreaMm2 / Math.max(1, safeWidthMm * safeHeightMm), 3),
      minPanelWidthMm: roundTo(Number.isFinite(pageMinWidthMm) ? pageMinWidthMm : 0, 2),
      clippedBalloonCount: pageClippedBalloons,
    });
  }

  return {
    format: options.format, spec, dimensions, readingDirection, pages,
    totalCuts: sortedCuts.length, totalPages: pages.length,
    clippedBalloonCount: totalClippedBalloons,
    minPanelWidthMm: roundTo(Number.isFinite(globalMinPanelWidthMm) ? globalMinPanelWidthMm : 0, 2),
    minReadableWidthMm, readableWidthViolations, allPagesInTargetRange, warnings,
  };
}

/** 출판 페이지(RTL 일본 / LTR 한국) 내 컷 좌표를 읽기 순서대로 추출한다. */
function orderPrintPanelsForReading(panels: readonly PrintPanelInput[], direction: ReadingDirection): readonly PrintPanelInput[] {
  const byTop = [...panels].sort((a, b) => a.yMm - b.yMm || a.xMm - b.xMm);
  const tiers: { topMm: number; bottomMm: number; items: PrintPanelInput[] }[] = [];
  for (const panel of byTop) {
    const pTop = panel.yMm; const pBottom = panel.yMm + panel.heightMm;
    const matched = tiers.find((tier) => {
      const overlap = Math.min(tier.bottomMm, pBottom) - Math.max(tier.topMm, pTop);
      return overlap >= Math.max(1, Math.min(tier.bottomMm - tier.topMm, panel.heightMm) * 0.35);
    });
    if (matched) {
      matched.items.push(panel);
      matched.topMm = Math.min(matched.topMm, pTop);
      matched.bottomMm = Math.max(matched.bottomMm, pBottom);
    } else {
      tiers.push({ topMm: pTop, bottomMm: pBottom, items: [panel] });
    }
  }
  tiers.sort((a, b) => a.topMm - b.topMm);
  const ordered: PrintPanelInput[] = [];
  for (const tier of tiers) {
    const sorted = [...tier.items].sort((a, b) => {
      const diff = direction === "rtl" ? b.xMm + b.widthMm - (a.xMm + a.widthMm) : a.xMm - b.xMm;
      return Math.abs(diff) > 1 ? diff : a.yMm - b.yMm;
    });
    ordered.push(...sorted);
  }
  return ordered;
}

/** 일본(RTL)·한국(LTR) 단행본 출판 페이지를 800px 세로 스크롤 웹툰 컷과 호흡 여백으로 자동 역변환한다. */
export function reflowPrintPagesToScroll(
  pages: readonly PrintPageInput[],
  options: ReflowPrintToScrollOptions = {},
): PrintToScrollReflowResult {
  const canvasWidthPx = Math.max(320, options.targetWidthPx ?? DEFAULT_SCROLL_WIDTH_PX);
  const sideMarginPx = Math.max(0, options.sideMarginPx ?? 0);
  const cutWidthPx = Math.max(240, canvasWidthPx - sideMarginPx * 2);
  const minCutHeightPx = Math.max(220, options.minCutHeightPx ?? 420);
  const maxCutHeightPx = Math.max(minCutHeightPx, options.maxCutHeightPx ?? 1380);
  const safeInsetPx = Math.max(4, options.balloonSafeInsetPx ?? 14);

  const sortedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const primaryDirection: ReadingDirection = sortedPages[0]?.readingDirection ?? "rtl";
  const expandedCuts: ScrollExpandedCut[] = [];
  let cursorYPx = 48;
  let clippedBalloonCount = 0;

  for (let pIdx = 0; pIdx < sortedPages.length; pIdx += 1) {
    const page = sortedPages[pIdx];
    if (!page) continue;
    const orderedPanels = orderPrintPanelsForReading(page.panels, page.readingDirection);
    for (let i = 0; i < orderedPanels.length; i += 1) {
      const panel = orderedPanels[i];
      if (!panel) continue;
      const importance: CutImportance = panel.importance ?? "dialogue";
      const heightPx = Math.round(clamp(cutWidthPx * (panel.heightMm / Math.max(1, panel.widthMm)), minCutHeightPx, maxCutHeightPx));
      const isLastOnPage = i === orderedPanels.length - 1;
      const isLastOverall = pIdx === sortedPages.length - 1 && isLastOnPage;

      let pacingReason: ScrollExpandedCut["pacingReason"] = "standard-beat";
      let breathingGapAfterPx = 120;
      if (isLastOverall) { breathingGapAfterPx = 160; pacingReason = "page-turn"; }
      else if (isLastOnPage) { breathingGapAfterPx = 220; pacingReason = "page-turn"; }
      else if (importance === "splash" || importance === "action") { breathingGapAfterPx = 180; pacingReason = "action-beat"; }
      else if (panel.balloons.length >= 2) { breathingGapAfterPx = 84; pacingReason = "dialogue-flow"; }

      const balloons: ScrollExpandedBalloon[] = panel.balloons.map((b) => {
        const relX = (b.xMm - panel.xMm) / Math.max(1, panel.widthMm);
        const relY = (b.yMm - panel.yMm) / Math.max(1, panel.heightMm);
        const widthPx = Math.round(clamp((b.widthMm / Math.max(1, panel.widthMm)) * cutWidthPx, 48, Math.max(40, cutWidthPx - safeInsetPx * 2)));
        const heightBPx = Math.round(clamp((b.heightMm / Math.max(1, panel.heightMm)) * heightPx, 36, Math.max(32, heightPx - safeInsetPx * 2)));
        const xPx = Math.round(clamp(sideMarginPx + relX * cutWidthPx, sideMarginPx + safeInsetPx, sideMarginPx + cutWidthPx - safeInsetPx - widthPx));
        const yPx = Math.round(clamp(cursorYPx + relY * heightPx, cursorYPx + safeInsetPx, cursorYPx + heightPx - safeInsetPx - heightBPx));
        const clipped = xPx < sideMarginPx || yPx < cursorYPx || xPx + widthPx > sideMarginPx + cutWidthPx || yPx + heightBPx > cursorYPx + heightPx;
        if (clipped) clippedBalloonCount += 1;
        return {
          id: b.id, text: b.text, xPx, yPx, widthPx, heightPx: heightBPx,
          xNorm: roundTo((xPx - sideMarginPx) / cutWidthPx, 4), yNorm: roundTo((yPx - cursorYPx) / heightPx, 4),
          widthNorm: roundTo(widthPx / cutWidthPx, 4), heightNorm: roundTo(heightBPx / heightPx, 4), clipped,
        };
      });

      expandedCuts.push({
        scrollOrder: expandedCuts.length + 1, sourcePageNumber: page.pageNumber, sourcePanelId: panel.id,
        importance, xPx: sideMarginPx, yPx: cursorYPx, widthPx: cutWidthPx, heightPx,
        breathingGapAfterPx, pacingReason, balloons,
      });
      cursorYPx += heightPx + breathingGapAfterPx;
    }
  }

  const averageBreathingGapPx = expandedCuts.length > 0
    ? roundTo(expandedCuts.reduce((sum, c) => sum + c.breathingGapAfterPx, 0) / expandedCuts.length, 1)
    : 0;
  return {
    canvasWidthPx, totalHeightPx: cursorYPx, totalCuts: expandedCuts.length,
    sourcePageCount: sortedPages.length, readingDirection: primaryDirection,
    cuts: expandedCuts, averageBreathingGapPx, clippedBalloonCount,
  };
}

// === 2D 투시선 2쌍 → 3D 카메라 소실점·FOV·지평선·Pitch/Yaw/Roll 수학적 자동 역산 ===

export interface Point2D { readonly x: number; readonly y: number; }
export interface LineSegment2D { readonly start: Point2D; readonly end: Point2D; }
export interface TwoPairPerspectiveInput {
  readonly imageWidthPx: number; readonly imageHeightPx: number; readonly principalPoint?: Point2D;
  readonly pairA: readonly [LineSegment2D, LineSegment2D];
  readonly pairB: readonly [LineSegment2D, LineSegment2D];
}
export interface SolvedPerspectiveCamera {
  readonly status: "solved" | "fallback-one-point" | "fallback-non-orthogonal" | "invalid";
  readonly vp1: Point2D | null; readonly vp2: Point2D | null; readonly principalPoint: Point2D;
  readonly horizonYAtCenterPx: number; readonly horizonSlope: number;
  readonly focalLengthPx: number; readonly focalLength35mm: number;
  readonly fovDeg: number; readonly horizontalFovDeg: number;
  readonly pitchDeg: number; readonly yawDeg: number; readonly rollDeg: number;
  readonly orthogonalityResidual: number; readonly worldUpInCamera: readonly [number, number, number];
  readonly warnings: readonly string[];
}
export interface SyntheticPerspectiveCameraSpec {
  readonly imageWidthPx: number; readonly imageHeightPx: number;
  readonly fovDeg: number; readonly pitchDeg: number; readonly yawDeg: number; readonly rollDeg: number;
}

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

function intersectLines(a: LineSegment2D, b: LineSegment2D): Point2D | null {
  const { x: x1, y: y1 } = a.start; const { x: x2, y: y2 } = a.end;
  const { x: x3, y: y3 } = b.start; const { x: x4, y: y4 } = b.end;
  const lenA = Math.hypot(x2 - x1, y2 - y1);
  const lenB = Math.hypot(x4 - x3, y4 - y3);
  if (lenA < 1e-4 || lenB < 1e-4) return null;
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-6 * lenA * lenB) return null;
  const det1 = x1 * y2 - y1 * x2;
  const det2 = x3 * y4 - y3 * x4;
  return { x: (det1 * (x3 - x4) - (x1 - x2) * det2) / denom, y: (det1 * (y3 - y4) - (y1 - y2) * det2) / denom };
}

function normalizeVec3(x: number, y: number, z: number): readonly [number, number, number] {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

function crossVec3(a: readonly [number, number, number], b: readonly [number, number, number]): readonly [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** 2D 스케치 위 직교 수평 투시선 2쌍에서 VP1/VP2, 지평선 Y, 초점거리, FOV, Pitch/Yaw/Roll(deg)을 역산한다. */
export function solvePerspectiveCameraFromTwoPairs(input: TwoPairPerspectiveInput): SolvedPerspectiveCamera {
  const width = Math.max(64, input.imageWidthPx);
  const height = Math.max(64, input.imageHeightPx);
  const cx = input.principalPoint?.x ?? width / 2;
  const cy = input.principalPoint?.y ?? height / 2;
  const principalPoint: Point2D = { x: roundTo(cx, 3), y: roundTo(cy, 3) };
  const defaultFocalPx = (height / 2) / Math.tan((45 * DEG_TO_RAD) / 2);

  const vp1 = intersectLines(input.pairA[0], input.pairA[1]);
  const vp2 = intersectLines(input.pairB[0], input.pairB[1]);

  if (!vp1 && !vp2) {
    return {
      status: "invalid", vp1: null, vp2: null, principalPoint,
      horizonYAtCenterPx: roundTo(cy, 3), horizonSlope: 0,
      focalLengthPx: roundTo(defaultFocalPx, 3), focalLength35mm: roundTo(defaultFocalPx * (36 / width), 2),
      fovDeg: 45, horizontalFovDeg: roundTo(2 * Math.atan((width / 2) / defaultFocalPx) * RAD_TO_DEG, 3),
      pitchDeg: 0, yawDeg: 0, rollDeg: 0, orthogonalityResidual: 1, worldUpInCamera: [0, 1, 0],
      warnings: ["두 투시선 쌍 모두 유효한 소실점을 형성하지 못했습니다."],
    };
  }
  if (!vp1 || !vp2) {
    const validVp = vp1 ?? vp2;
    const horizonY = validVp ? validVp.y : cy;
    const pitchRad = Math.atan2(horizonY - cy, defaultFocalPx);
    const yawRad = validVp ? Math.atan2(-(validVp.x - cx), defaultFocalPx) : 0;
    return {
      status: "fallback-one-point",
      vp1: vp1 ? { x: roundTo(vp1.x, 3), y: roundTo(vp1.y, 3) } : null,
      vp2: vp2 ? { x: roundTo(vp2.x, 3), y: roundTo(vp2.y, 3) } : null,
      principalPoint, horizonYAtCenterPx: roundTo(horizonY, 3), horizonSlope: 0,
      focalLengthPx: roundTo(defaultFocalPx, 3), focalLength35mm: roundTo(defaultFocalPx * (36 / width), 2),
      fovDeg: 45, horizontalFovDeg: roundTo(2 * Math.atan((width / 2) / defaultFocalPx) * RAD_TO_DEG, 3),
      pitchDeg: roundTo(pitchRad * RAD_TO_DEG, 3), yawDeg: roundTo(yawRad * RAD_TO_DEG, 3), rollDeg: 0,
      orthogonalityResidual: 0, worldUpInCamera: [0, roundTo(Math.cos(pitchRad), 5), roundTo(Math.sin(pitchRad), 5)],
      warnings: ["한 쌍의 투시선이 평행하여 1점 투시 폴백(45° FOV)으로 역산했습니다."],
    };
  }

  const u1 = vp1.x - cx; const v1 = -(vp1.y - cy);
  const u2 = vp2.x - cx; const v2 = -(vp2.y - cy);
  const fSquared = -(u1 * u2 + v1 * v2);
  const warnings: string[] = [];
  let status: SolvedPerspectiveCamera["status"] = "solved";
  let focalLengthPx: number;
  if (fSquared > 1e-2) {
    focalLengthPx = Math.sqrt(fSquared);
  } else {
    status = "fallback-non-orthogonal";
    focalLengthPx = Math.max(defaultFocalPx, Math.hypot(vp2.x - vp1.x, vp2.y - vp1.y) * 0.45);
    warnings.push("두 소실점이 주점 같은 쪽에 있어 직교 조건 폴백 초점거리를 적용했습니다.");
  }

  const d1 = normalizeVec3(u1, v1, focalLengthPx);
  const d2 = normalizeVec3(u2, v2, focalLengthPx);
  const orthogonalityResidual = Math.abs(d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2]);
  const rawUp = crossVec3(d1, d2);
  const rawUpNorm = normalizeVec3(rawUp[0], rawUp[1], rawUp[2]);
  const upCam: readonly [number, number, number] =
    rawUpNorm[1] >= 0 ? rawUpNorm : [-rawUpNorm[0], -rawUpNorm[1], -rawUpNorm[2]];

  const pitchRad = Math.asin(clamp(upCam[2], -1, 1));
  const rollRad = Math.atan2(-upCam[0], upCam[1]);
  const cosR = Math.cos(rollRad); const sinR = Math.sin(rollRad);
  const xUnrolled = d1[0] * cosR + d1[1] * sinR;
  const yUnrolled = -d1[0] * sinR + d1[1] * cosR;
  const zLevel = -yUnrolled * Math.sin(pitchRad) + d1[2] * Math.cos(pitchRad);
  const yawRad = Math.atan2(-xUnrolled, zLevel);

  const dxVp = vp2.x - vp1.x;
  const horizonSlope = Math.abs(dxVp) > 1e-6 ? (vp2.y - vp1.y) / dxVp : 0;
  const horizonYAtCenterPx =
    Math.abs(upCam[1]) > 1e-6 ? cy + focalLengthPx * (upCam[2] / upCam[1]) : vp1.y + horizonSlope * (cx - vp1.x);

  return {
    status,
    vp1: { x: roundTo(vp1.x, 3), y: roundTo(vp1.y, 3) },
    vp2: { x: roundTo(vp2.x, 3), y: roundTo(vp2.y, 3) },
    principalPoint,
    horizonYAtCenterPx: roundTo(horizonYAtCenterPx, 3),
    horizonSlope: roundTo(horizonSlope, 5),
    focalLengthPx: roundTo(focalLengthPx, 3),
    focalLength35mm: roundTo(focalLengthPx * (36 / width), 2),
    fovDeg: roundTo(2 * Math.atan((height / 2) / focalLengthPx) * RAD_TO_DEG, 3),
    horizontalFovDeg: roundTo(2 * Math.atan((width / 2) / focalLengthPx) * RAD_TO_DEG, 3),
    pitchDeg: roundTo(pitchRad * RAD_TO_DEG, 3),
    yawDeg: roundTo(yawRad * RAD_TO_DEG, 3),
    rollDeg: roundTo(rollRad * RAD_TO_DEG, 3),
    orthogonalityResidual: roundTo(orthogonalityResidual, 6),
    worldUpInCamera: [roundTo(upCam[0], 5), roundTo(upCam[1], 5), roundTo(upCam[2], 5)],
    warnings,
  };
}

/** 알려진 3D 카메라 파라미터로부터 정확한 2D 직교 투시선 2쌍을 투영 생성한다. */
export function buildSyntheticPerspectivePairs(spec: SyntheticPerspectiveCameraSpec): TwoPairPerspectiveInput {
  const cx = spec.imageWidthPx / 2; const cy = spec.imageHeightPx / 2;
  const f = (spec.imageHeightPx / 2) / Math.tan((spec.fovDeg * DEG_TO_RAD) / 2);
  const yaw = spec.yawDeg * DEG_TO_RAD; const pitch = spec.pitchDeg * DEG_TO_RAD; const roll = spec.rollDeg * DEG_TO_RAD;

  const projectDir = (wx: number, wy: number, wz: number): Point2D => {
    const x1 = wx * Math.cos(yaw) - wz * Math.sin(yaw);
    const z1 = wx * Math.sin(yaw) + wz * Math.cos(yaw);
    const y2 = wy * Math.cos(pitch) - z1 * Math.sin(pitch);
    const z2 = wy * Math.sin(pitch) + z1 * Math.cos(pitch);
    const xc = x1 * Math.cos(roll) - y2 * Math.sin(roll);
    const yc = x1 * Math.sin(roll) + y2 * Math.cos(roll);
    const sign = z2 < 0 ? -1 : 1;
    return { x: cx + f * ((xc * sign) / (z2 * sign)), y: cy - f * ((yc * sign) / (z2 * sign)) };
  };

  const vp1 = projectDir(0, 0, 1);
  const vp2 = projectDir(1, 0, 0);
  const ray = (anchor: Point2D, vp: Point2D): LineSegment2D => ({
    start: anchor,
    end: { x: roundTo(anchor.x + (vp.x - anchor.x) * 0.42, 3), y: roundTo(anchor.y + (vp.y - anchor.y) * 0.42, 3) },
  });

  return {
    imageWidthPx: spec.imageWidthPx, imageHeightPx: spec.imageHeightPx,
    pairA: [ray({ x: cx - 180, y: cy + 210 }, vp1), ray({ x: cx - 160, y: cy - 190 }, vp1)],
    pairB: [ray({ x: cx + 190, y: cy + 200 }, vp2), ray({ x: cx + 170, y: cy - 180 }, vp2)],
  };
}

/** UI·테스트 공용 데모 세로 스크롤 웹툰 10컷 픽스처를 생성한다. */
export function createDemoScrollCuts(): readonly ScrollCutInput[] {
  const templates: readonly { readonly importance: CutImportance; readonly heightPx: number; readonly dialogue: string }[] = [
    { importance: "establishing", heightPx: 980, dialogue: "비 내리는 종로 옥상, 자정 종소리가 울렸다." },
    { importance: "dialogue", heightPx: 720, dialogue: "여기서 물러서면 기록은 영영 사라져." },
    { importance: "dialogue", heightPx: 680, dialogue: "알아. 그래도 끝까지 지켜야 해." },
    { importance: "action", heightPx: 880, dialogue: "피해! 지붕 너머로 그림자가 움직인다!" },
    { importance: "dialogue", heightPx: 640, dialogue: "잠깐, 저 문양은 3년 전 그 시계탑..." },
    { importance: "splash", heightPx: 1060, dialogue: "열렸다—시간의 틈새가 눈앞에 갈라진다!" },
    { importance: "dialogue", heightPx: 700, dialogue: "호흡을 맞춰. 셋 세면 동시에 뛰어든다." },
    { importance: "action", heightPx: 860, dialogue: "하나, 둘—지금이야!" },
    { importance: "dialogue", heightPx: 660, dialogue: "손 놓지 마, 여긴 중력 방향이 달라!" },
    { importance: "establishing", heightPx: 920, dialogue: "구름 아래 뒤집힌 서울이 한눈에 펼쳐졌다." },
  ];
  return templates.map((item, idx) => ({
    id: `scroll-cut-${String(idx + 1).padStart(2, "0")}`,
    order: idx + 1, widthPx: DEFAULT_SCROLL_WIDTH_PX, heightPx: item.heightPx,
    importance: item.importance, breathingGapAfterPx: item.importance === "splash" ? 180 : 110,
    balloons: [
      { id: `bln-${idx + 1}-a`, text: item.dialogue, xNorm: idx % 2 === 0 ? 0.08 : 0.42, yNorm: 0.08, widthNorm: 0.48, heightNorm: 0.22, fontSizePt: 9.5 },
      ...(item.importance === "dialogue" ? [{ id: `bln-${idx + 1}-b`, text: "응답 확인 완료.", xNorm: 0.56, yNorm: 0.68, widthNorm: 0.36, heightNorm: 0.18, fontSizePt: 9 }] : []),
    ],
  }));
}
