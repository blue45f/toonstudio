/**
 * Wave 119 — 인쇄 안전 순수 OKLCH 비교 검수 SVG 렌더러 및 한국어 채색 QA 브리프 생성기.
 *
 * - `renderGapClosingFlatFillAuditSvg`: 일반 채색(Naive) 누출 · 틈새 밀봉 채색(Gap-Closed) ·
 *   다중 구역 보로노이 언더블리드(Anti-Halo 0px) 3패널 비교 시트를 순수 `oklch(...)` 색공간과
 *   XML 이스케이프, 유한 좌표 보증 하에 생성한다.
 * - `summarizeGapClosingFlatFillKo`: 웹툰 채색 어시스턴트와 선화 검수자가 바로 읽을 수 있는
 *   번역투 없는 자연스러운 한국어 QA 리포트를 생성한다.
 */

import type { NaiveVsGapClosedComparison } from "./gap-closing-flood-fill-solver";
import type { AntiHaloUnderbleedReport, OklchColor } from "./underbleed-trapping-and-wgsl";

export interface GapClosingAuditSvgOptions {
  readonly title?: string;
  readonly subtitle?: string;
  readonly canvasWidthPx?: number;
  readonly canvasHeightPx?: number;
}

export interface GapClosingAuditSvgResult {
  readonly svg: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly panelCount: 3;
  readonly renderedRunRectCount: number;
  readonly usesPureOklchOnly: boolean;
  readonly hasFiniteCoordinatesOnly: boolean;
}

export interface FlatFillQaCheckItem {
  readonly id: string;
  readonly labelKo: string;
  readonly passed: boolean;
  readonly detailKo: string;
}

export interface GapClosingFlatFillKoReport {
  readonly verdict: "pass" | "attention" | "blocked";
  readonly verdictLabelKo: string;
  readonly headlineKo: string;
  readonly summaryLinesKo: readonly string[];
  readonly checklistKo: readonly FlatFillQaCheckItem[];
  readonly fullReportKo: string;
}

// 인쇄 안전 순수 OKLCH 팔레트 토큰(원시 hex/rgb/hsl 절대 미사용)
const OKLCH_PAPER_BG = "oklch(0.985 0.006 92)";
const OKLCH_PANEL_BG = "oklch(0.996 0.002 92)";
const OKLCH_PANEL_BORDER = "oklch(0.84 0.014 85)";
const OKLCH_TITLE_INK = "oklch(0.22 0.02 250)";
const OKLCH_SUBTITLE_INK = "oklch(0.44 0.018 250)";
const OKLCH_GRID_FRAME = "oklch(0.76 0.015 90)";
const OKLCH_NAIVE_FILL = "oklch(0.76 0.14 32 / 0.72)";
const OKLCH_GAP_CLOSED_FILL = "oklch(0.76 0.12 225 / 0.78)";
const OKLCH_BRIDGE_ACCENT = "oklch(0.56 0.17 156)";
const OKLCH_UNDERBLEED_RING = "oklch(0.64 0.18 145 / 0.42)";
const OKLCH_SEED_MARKER = "oklch(0.52 0.22 25)";
const OKLCH_BADGE_PASS_BG = "oklch(0.93 0.05 152)";
const OKLCH_BADGE_PASS_FG = "oklch(0.32 0.11 152)";
const OKLCH_BADGE_WARN_BG = "oklch(0.93 0.06 28)";
const OKLCH_BADGE_WARN_FG = "oklch(0.42 0.16 26)";
const OKLCH_FOOTER_BG = "oklch(0.955 0.009 92)";

const RAW_HEX_PATTERN = /#[0-9a-f]{3,8}\b/i;
const RAW_FUNC_COLOR_PATTERN = /\b(?:rgba?|hsla?)\s*\(/i;

function fmt(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return (Math.round(safe * 100) / 100).toFixed(2);
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatOklch(color: OklchColor, alpha?: number): string {
  const l = Number.isFinite(color.l) ? Math.max(0, Math.min(1, color.l)) : 0.75;
  const c = Number.isFinite(color.c) ? Math.max(0, Math.min(0.4, color.c)) : 0.1;
  const rawH = Number.isFinite(color.h) ? color.h % 360 : 0;
  const h = rawH < 0 ? rawH + 360 : rawH;
  if (alpha !== undefined) {
    const a = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
    return `oklch(${fmt(l)} ${fmt(c)} ${fmt(h)} / ${fmt(a)})`;
  }
  return `oklch(${fmt(l)} ${fmt(c)} ${fmt(h)})`;
}

function formatInkOklch(alpha: number): string {
  const clamped = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 0;
  return `oklch(0.18 0.01 250 / ${fmt(clamped)})`;
}

interface RunRectAppendResult {
  readonly markup: string;
  readonly rectCount: number;
}

/** 2차원 이진 마스크를 행 단위 Run-Length `<rect>`로 압축해 SVG 크기를 절감한다. */
function renderBinaryMaskRuns(
  mask: Uint8Array,
  gridW: number,
  gridH: number,
  originX: number,
  originY: number,
  cellW: number,
  cellH: number,
  fillOklch: string,
): RunRectAppendResult {
  if (gridW <= 0 || gridH <= 0 || mask.length !== gridW * gridH) {
    return { markup: "", rectCount: 0 };
  }
  const parts: string[] = [];
  let rectCount = 0;
  for (let y = 0; y < gridH; y += 1) {
    const rowOff = y * gridW;
    let x = 0;
    while (x < gridW) {
      if (mask[rowOff + x] === 0) {
        x += 1;
        continue;
      }
      const startX = x;
      while (x < gridW && mask[rowOff + x] !== 0) {
        x += 1;
      }
      const runLen = x - startX;
      parts.push(
        `<rect x="${fmt(originX + startX * cellW)}" y="${fmt(originY + y * cellH)}" width="${fmt(runLen * cellW)}" height="${fmt(cellH)}" fill="${fillOklch}" />`,
      );
      rectCount += 1;
    }
  }
  return { markup: parts.join(""), rectCount };
}

/** 다중 구역 소유자 맵을 구역별 OKLCH 색상 Run-Length `<rect>`로 렌더링한다. */
function renderOwnerMapRuns(
  ownerMap: Int32Array,
  gridW: number,
  gridH: number,
  originX: number,
  originY: number,
  cellW: number,
  cellH: number,
  regionColors: readonly string[],
): RunRectAppendResult {
  if (gridW <= 0 || gridH <= 0 || ownerMap.length !== gridW * gridH) {
    return { markup: "", rectCount: 0 };
  }
  const parts: string[] = [];
  let rectCount = 0;
  for (let y = 0; y < gridH; y += 1) {
    const rowOff = y * gridW;
    let x = 0;
    while (x < gridW) {
      const owner = ownerMap[rowOff + x];
      if (owner <= 0) {
        x += 1;
        continue;
      }
      const startX = x;
      while (x < gridW && ownerMap[rowOff + x] === owner) {
        x += 1;
      }
      const color = regionColors[owner - 1] ?? OKLCH_GAP_CLOSED_FILL;
      const runLen = x - startX;
      parts.push(
        `<rect x="${fmt(originX + startX * cellW)}" y="${fmt(originY + y * cellH)}" width="${fmt(runLen * cellW)}" height="${fmt(cellH)}" fill="${color}" />`,
      );
      rectCount += 1;
    }
  }
  return { markup: parts.join(""), rectCount };
}

/** 반투명 안티앨리어싱 선화를 4단계 알파 버킷으로 양자화해 Run-Length 렌더링한다. */
function renderQuantizedInkRuns(
  inkAlpha: Float32Array,
  gridW: number,
  gridH: number,
  originX: number,
  originY: number,
  cellW: number,
  cellH: number,
): RunRectAppendResult {
  if (gridW <= 0 || gridH <= 0 || inkAlpha.length !== gridW * gridH) {
    return { markup: "", rectCount: 0 };
  }
  const bucketAlpha = [0, 0.25, 0.55, 0.82, 1.0] as const;
  const parts: string[] = [];
  let rectCount = 0;

  const toBucket = (a: number): number => {
    if (!Number.isFinite(a) || a <= 0.04) return 0;
    if (a < 0.4) return 1;
    if (a < 0.7) return 2;
    if (a < 0.94) return 3;
    return 4;
  };

  for (let y = 0; y < gridH; y += 1) {
    const rowOff = y * gridW;
    let x = 0;
    while (x < gridW) {
      const b = toBucket(inkAlpha[rowOff + x]);
      if (b === 0) {
        x += 1;
        continue;
      }
      const startX = x;
      while (x < gridW && toBucket(inkAlpha[rowOff + x]) === b) {
        x += 1;
      }
      const runLen = x - startX;
      parts.push(
        `<rect x="${fmt(originX + startX * cellW)}" y="${fmt(originY + y * cellH)}" width="${fmt(runLen * cellW)}" height="${fmt(cellH)}" fill="${formatInkOklch(bucketAlpha[b])}" />`,
      );
      rectCount += 1;
    }
  }
  return { markup: parts.join(""), rectCount };
}

function renderPanelShell(
  panelId: string,
  x: number,
  y: number,
  w: number,
  h: number,
  headingKo: string,
  badgeKo: string,
  badgePass: boolean,
  bodyMarkup: string,
  captionKo: string,
): string {
  const badgeBg = badgePass ? OKLCH_BADGE_PASS_BG : OKLCH_BADGE_WARN_BG;
  const badgeFg = badgePass ? OKLCH_BADGE_PASS_FG : OKLCH_BADGE_WARN_FG;
  return [
    `<g id="${escapeXml(panelId)}">`,
    `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" rx="12" fill="${OKLCH_PANEL_BG}" stroke="${OKLCH_PANEL_BORDER}" stroke-width="1.2" />`,
    `<text x="${fmt(x + 14)}" y="${fmt(y + 26)}" font-size="13" font-weight="700" fill="${OKLCH_TITLE_INK}">${escapeXml(headingKo)}</text>`,
    `<rect x="${fmt(x + w - 122)}" y="${fmt(y + 10)}" width="108" height="22" rx="11" fill="${badgeBg}" />`,
    `<text x="${fmt(x + w - 68)}" y="${fmt(y + 25)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${badgeFg}">${escapeXml(badgeKo)}</text>`,
    bodyMarkup,
    `<text x="${fmt(x + 14)}" y="${fmt(y + h - 14)}" font-size="11" fill="${OKLCH_SUBTITLE_INK}">${escapeXml(captionKo)}</text>`,
    `</g>`,
  ].join("");
}

/**
 * Naive 누출 vs 갭 밀봉 채색 + 보로노이 안티-할로 언더블리드 3패널 비교 검수 SVG를 생성한다.
 * 모든 색상은 `oklch(...)`만 사용하며 XML 특수문자를 이스케이프한다.
 */
export function renderGapClosingFlatFillAuditSvg(
  comparison: NaiveVsGapClosedComparison,
  trappingReport: AntiHaloUnderbleedReport,
  options: GapClosingAuditSvgOptions = {},
): GapClosingAuditSvgResult {
  const widthPx =
    Number.isFinite(options.canvasWidthPx) && (options.canvasWidthPx ?? 0) >= 600
      ? Math.round(options.canvasWidthPx ?? 960)
      : 960;
  const heightPx =
    Number.isFinite(options.canvasHeightPx) && (options.canvasHeightPx ?? 0) >= 320
      ? Math.round(options.canvasHeightPx ?? 420)
      : 420;

  const title = (options.title ?? "Wave 119 틈새 밀봉 플랫 채색 & 안티-할로 검수 시트").trim();
  const subtitle = (
    options.subtitle ??
    `밀봉 한계 ${String(comparison.maxGapWidthPx)}px · 잉크 기준 ${fmt(comparison.inkThreshold)} · 언더블리드 반경 ${String(trappingReport.maxUnderbleedRadiusPx)}px`
  ).trim();

  const outerPad = 20;
  const panelGap = 16;
  const panelTop = 72;
  const footerHeight = 46;
  const panelH = heightPx - panelTop - footerHeight - 16;
  const panelW = (widthPx - outerPad * 2 - panelGap * 2) / 3;

  const plotPadX = 14;
  const plotTopOffset = 42;
  const plotBottomOffset = 34;
  const plotW = panelW - plotPadX * 2;
  const plotH = panelH - plotTopOffset - plotBottomOffset;

  let totalRuns = 0;

  // Panel 1: Naive Flood Fill
  const p1X = outerPad;
  const cmpW = Math.max(1, comparison.width);
  const cmpH = Math.max(1, comparison.height);
  const cmpScale = Math.min(plotW / cmpW, plotH / cmpH);
  const cmpDrawW = cmpW * cmpScale;
  const cmpDrawH = cmpH * cmpScale;
  const cmpOffX = plotPadX + (plotW - cmpDrawW) / 2;
  const cmpOffY = plotTopOffset + (plotH - cmpDrawH) / 2;

  const naiveFillRuns = renderBinaryMaskRuns(
    comparison.naive.filledMask,
    comparison.width,
    comparison.height,
    p1X + cmpOffX,
    panelTop + cmpOffY,
    cmpScale,
    cmpScale,
    OKLCH_NAIVE_FILL,
  );
  const cmpInkRunsP1 = renderQuantizedInkRuns(
    comparison.naive.barrier.sanitizedInkAlpha,
    comparison.width,
    comparison.height,
    p1X + cmpOffX,
    panelTop + cmpOffY,
    cmpScale,
    cmpScale,
  );
  totalRuns += naiveFillRuns.rectCount + cmpInkRunsP1.rectCount;

  const seedMarkerP1 =
    comparison.naive.ok
      ? `<circle cx="${fmt(p1X + cmpOffX + (comparison.seedX + 0.5) * cmpScale)}" cy="${fmt(panelTop + cmpOffY + (comparison.seedY + 0.5) * cmpScale)}" r="4" fill="none" stroke="${OKLCH_SEED_MARKER}" stroke-width="1.6" />`
      : "";

  const p1Body = [
    `<rect x="${fmt(p1X + cmpOffX)}" y="${fmt(panelTop + cmpOffY)}" width="${fmt(cmpDrawW)}" height="${fmt(cmpDrawH)}" fill="${OKLCH_PAPER_BG}" stroke="${OKLCH_GRID_FRAME}" stroke-width="1" />`,
    naiveFillRuns.markup,
    cmpInkRunsP1.markup,
    seedMarkerP1,
  ].join("");

  const p1Markup = renderPanelShell(
    "panel-naive-flood-fill",
    p1X,
    panelTop,
    panelW,
    panelH,
    "1. 일반 버킷 채색 (Naive)",
    comparison.naiveLeakedToBorder ? "경계 누출 발생" : "누출 없음",
    !comparison.naiveLeakedToBorder,
    p1Body,
    `채색 ${String(comparison.naiveFilledPixelCount)}px · 외곽 접촉 ${String(comparison.naive.borderContactPixelCount)}px`,
  );

  // Panel 2: Gap-Closed Flood Fill
  const p2X = outerPad + panelW + panelGap;
  const closedFillRuns = renderBinaryMaskRuns(
    comparison.gapClosed.filledMask,
    comparison.width,
    comparison.height,
    p2X + cmpOffX,
    panelTop + cmpOffY,
    cmpScale,
    cmpScale,
    OKLCH_GAP_CLOSED_FILL,
  );
  const bridgeRuns = renderBinaryMaskRuns(
    comparison.gapClosed.barrier.bridgeMask,
    comparison.width,
    comparison.height,
    p2X + cmpOffX,
    panelTop + cmpOffY,
    cmpScale,
    cmpScale,
    OKLCH_BRIDGE_ACCENT,
  );
  const cmpInkRunsP2 = renderQuantizedInkRuns(
    comparison.gapClosed.barrier.sanitizedInkAlpha,
    comparison.width,
    comparison.height,
    p2X + cmpOffX,
    panelTop + cmpOffY,
    cmpScale,
    cmpScale,
  );
  totalRuns += closedFillRuns.rectCount + bridgeRuns.rectCount + cmpInkRunsP2.rectCount;

  const p2Body = [
    `<rect x="${fmt(p2X + cmpOffX)}" y="${fmt(panelTop + cmpOffY)}" width="${fmt(cmpDrawW)}" height="${fmt(cmpDrawH)}" fill="${OKLCH_PAPER_BG}" stroke="${OKLCH_GRID_FRAME}" stroke-width="1" />`,
    closedFillRuns.markup,
    cmpInkRunsP2.markup,
    bridgeRuns.markup,
  ].join("");

  const p2Markup = renderPanelShell(
    "panel-gap-closed-flood-fill",
    p2X,
    panelTop,
    panelW,
    panelH,
    "2. 틈새 밀봉 채색 (Gap-Closed)",
    comparison.leakedPixels === 0 && !comparison.gapClosedLeakedToBorder ? "누출 0px 밀봉" : "누출 주의",
    comparison.leakedPixels === 0 && !comparison.gapClosedLeakedToBorder,
    p2Body,
    `채색 ${String(comparison.gapClosedFilledPixelCount)}px · 브리지 ${String(comparison.bridgePixelCount)}px · 차단 ${String(comparison.preventedLeakPixelCount)}px`,
  );

  // Panel 3: Multi-Region Voronoi Anti-Halo Underbleed
  const p3X = outerPad + (panelW + panelGap) * 2;
  const trapW = Math.max(1, trappingReport.width);
  const trapH = Math.max(1, trappingReport.height);
  const trapScale = Math.min(plotW / trapW, plotH / trapH);
  const trapDrawW = trapW * trapScale;
  const trapDrawH = trapH * trapScale;
  const trapOffX = plotPadX + (plotW - trapDrawW) / 2;
  const trapOffY = plotTopOffset + (plotH - trapDrawH) / 2;

  const regionPaletteOklch = trappingReport.regions.map((r) => formatOklch(r.oklch, 0.88));
  const trappedRuns = renderOwnerMapRuns(
    trappingReport.trappedOwnerMap,
    trappingReport.width,
    trappingReport.height,
    p3X + trapOffX,
    panelTop + trapOffY,
    trapScale,
    trapScale,
    regionPaletteOklch,
  );
  const underbleedRuns = renderBinaryMaskRuns(
    trappingReport.underbleedAddedMask,
    trappingReport.width,
    trappingReport.height,
    p3X + trapOffX,
    panelTop + trapOffY,
    trapScale,
    trapScale,
    OKLCH_UNDERBLEED_RING,
  );
  const trapInkRuns = renderQuantizedInkRuns(
    trappingReport.sanitizedInkAlpha,
    trappingReport.width,
    trappingReport.height,
    p3X + trapOffX,
    panelTop + trapOffY,
    trapScale,
    trapScale,
  );
  totalRuns += trappedRuns.rectCount + underbleedRuns.rectCount + trapInkRuns.rectCount;

  const regionNamesPreview = trappingReport.regions
    .filter((r) => r.ok)
    .map((r) => r.labelKo)
    .slice(0, 4)
    .join("·");

  const p3Body = [
    `<rect x="${fmt(p3X + trapOffX)}" y="${fmt(panelTop + trapOffY)}" width="${fmt(trapDrawW)}" height="${fmt(trapDrawH)}" fill="${OKLCH_PAPER_BG}" stroke="${OKLCH_GRID_FRAME}" stroke-width="1" />`,
    trappedRuns.markup,
    underbleedRuns.markup,
    trapInkRuns.markup,
  ].join("");

  const haloRemovedPct = fmt(trappingReport.haloRemovalRate * 100);
  const p3Pass =
    trappingReport.remainingWhiteHaloPixelCount === 0 &&
    trappingReport.neighborCrossBleedPixelCount === 0;

  const p3Markup = renderPanelShell(
    "panel-anti-halo-underbleed",
    p3X,
    panelTop,
    panelW,
    panelH,
    "3. 보로노이 언더블리드 (Anti-Halo)",
    p3Pass ? "할로 0px · 번짐 0px" : "트래핑 점검",
    p3Pass,
    p3Body,
    `잔여 할로 ${String(trappingReport.remainingWhiteHaloPixelCount)}px(${haloRemovedPct}% 제거) · 교차 침범 ${String(trappingReport.neighborCrossBleedPixelCount)}px${regionNamesPreview.length > 0 ? ` · ${regionNamesPreview}` : ""}`,
  );

  // Footer Telemetry Strip
  const footerY = heightPx - footerHeight - 8;
  const footerText = [
    `누출 차단 ${String(comparison.preventedLeakPixelCount)}px`,
    `밀봉 틈새 ${String(comparison.detectedGapCount)}곳`,
    `초기 흰 할로 ${String(trappingReport.naiveWhiteHaloPixelCount)}px → 잔여 ${String(trappingReport.remainingWhiteHaloPixelCount)}px`,
    `언더블리드 확장 ${String(trappingReport.totalUnderbleedAddedPixels)}px`,
    `이웃 교차 침범 ${String(trappingReport.neighborCrossBleedPixelCount)}px`,
  ].join("  |  ");

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(widthPx)}" height="${String(heightPx)}" viewBox="0 0 ${String(widthPx)} ${String(heightPx)}" role="img" aria-label="${escapeXml(title)}">`,
    `<title>${escapeXml(title)}</title>`,
    `<desc>${escapeXml(subtitle)}</desc>`,
    `<rect x="0" y="0" width="${String(widthPx)}" height="${String(heightPx)}" fill="${OKLCH_PAPER_BG}" />`,
    `<text x="${fmt(outerPad)}" y="34" font-size="18" font-weight="700" fill="${OKLCH_TITLE_INK}">${escapeXml(title)}</text>`,
    `<text x="${fmt(outerPad)}" y="55" font-size="12" fill="${OKLCH_SUBTITLE_INK}">${escapeXml(subtitle)}</text>`,
    p1Markup,
    p2Markup,
    p3Markup,
    `<g id="audit-footer-summary">`,
    `<rect x="${fmt(outerPad)}" y="${fmt(footerY)}" width="${fmt(widthPx - outerPad * 2)}" height="${fmt(footerHeight - 8)}" rx="8" fill="${OKLCH_FOOTER_BG}" stroke="${OKLCH_PANEL_BORDER}" stroke-width="1" />`,
    `<text x="${fmt(outerPad + 14)}" y="${fmt(footerY + 23)}" font-size="11.5" font-weight="600" fill="${OKLCH_TITLE_INK}">${escapeXml(footerText)}</text>`,
    `</g>`,
    `</svg>`,
  ].join("");

  const usesPureOklchOnly = !RAW_HEX_PATTERN.test(svg) && !RAW_FUNC_COLOR_PATTERN.test(svg);
  const hasFiniteCoordinatesOnly = !/(?:NaN|Infinity|undefined)/.test(svg);

  return {
    svg,
    widthPx,
    heightPx,
    panelCount: 3,
    renderedRunRectCount: totalRuns,
    usesPureOklchOnly,
    hasFiniteCoordinatesOnly,
  };
}

/**
 * 틈새 밀봉 비교 결과와 보로노이 언더블리드 결과를 바탕으로
 * 번역투 없는 자연스러운 한국어 웹툰 채색 검수 리포트를 작성한다.
 */
export function summarizeGapClosingFlatFillKo(
  comparison: NaiveVsGapClosedComparison,
  trappingReport: AntiHaloUnderbleedReport,
): GapClosingFlatFillKoReport {
  const gapClosedOk =
    comparison.ok && !comparison.gapClosedLeakedToBorder && comparison.leakedPixels === 0;
  const haloZeroOk =
    trappingReport.ok && trappingReport.remainingWhiteHaloPixelCount === 0;
  const crossBleedZeroOk =
    trappingReport.ok &&
    trappingReport.neighborCrossBleedPixelCount === 0 &&
    trappingReport.voronoiHalfPlaneViolationCount === 0;

  const haloPctText = (trappingReport.haloRemovalRate * 100).toFixed(1);
  const activeRegionLabels = trappingReport.regions
    .filter((r) => r.ok)
    .map((r) => r.labelKo);
  const regionSummaryLabel =
    activeRegionLabels.length > 0 ? activeRegionLabels.join("·") : "채색 구역 없음";

  const checklistKo: FlatFillQaCheckItem[] = [
    {
      id: "gap-leak-zero",
      labelKo: "열린 선화 틈새 누출 차단",
      passed: gapClosedOk,
      detailKo: gapClosedOk
        ? comparison.naiveLeakedToBorder
          ? `일반 채색에서 외곽까지 새어 나간 ${String(comparison.preventedLeakPixelCount)}px를 브리지 ${String(comparison.bridgePixelCount)}px로 막아 누출을 0px로 줄였습니다.`
          : `선화 내부 ${String(comparison.gapClosedFilledPixelCount)}px를 경계 누출 없이 채웠습니다.`
        : `틈새 밀봉 채색이 완료되지 않았거나 외곽 누출 ${String(comparison.leakedPixels)}px가 남아 있습니다.`,
    },
    {
      id: "anti-halo-zero",
      labelKo: "안티앨리어싱 흰 테두리(할로) 제거",
      passed: haloZeroOk,
      detailKo: haloZeroOk
        ? `반투명 먹선 경계의 흰 테두리 ${String(trappingReport.naiveWhiteHaloPixelCount)}px를 모두 메워 잔여 할로 0px(제거율 ${haloPctText}%)를 확인했습니다.`
        : `반투명 먹선 경계에 잔여 흰 할로 ${String(trappingReport.remainingWhiteHaloPixelCount)}px가 남아 있습니다.`,
    },
    {
      id: "neighbor-cross-bleed-zero",
      labelKo: "이웃 색상 구역 교차 침범 방지",
      passed: crossBleedZeroOk,
      detailKo: crossBleedZeroOk
        ? `${regionSummaryLabel} 구역이 맞닿은 먹선 ${String(trappingReport.sharedBorderPixelCount)}px 구간에서 이웃 안쪽 침범 0px를 유지했습니다.`
        : `이웃 구역 침범 ${String(trappingReport.neighborCrossBleedPixelCount)}px 또는 보로노이 경계 위반 ${String(trappingReport.voronoiHalfPlaneViolationCount)}px가 감지되었습니다.`,
    },
  ];

  const allPassed = checklistKo.every((c) => c.passed);
  const blocked = !comparison.ok || !trappingReport.ok;
  const verdict: "pass" | "attention" | "blocked" = allPassed
    ? "pass"
    : blocked
      ? "blocked"
      : "attention";

  const verdictLabelKo =
    verdict === "pass"
      ? "채색 검수 통과"
      : verdict === "attention"
        ? "선화·경계 보완 필요"
        : "입력 오류로 채색 중단";

  const headlineKo =
    verdict === "pass"
      ? `선화 틈새 밀봉과 안티-할로 언더블리드 검수를 모두 통과했습니다(누출 0px · 잔여 할로 0px · 교차 침범 0px).`
      : verdict === "attention"
        ? `일부 경계 누출 또는 흰 테두리가 남아 있어 밀봉 폭(${String(comparison.maxGapWidthPx)}px)이나 언더블리드 반경(${String(trappingReport.maxUnderbleedRadiusPx)}px) 조정이 필요합니다.`
        : `시드 좌표 또는 선화 버퍼 검증에 실패해 안전하게 채색을 중단했습니다.`;

  const summaryLinesKo: string[] = [
    `[틈새 밀봉 비교] 일반 채색 ${String(comparison.naiveFilledPixelCount)}px(${comparison.naiveLeakedToBorder ? "경계 누출" : "내부 한정"}) 대비 틈새 밀봉 채색 ${String(comparison.gapClosedFilledPixelCount)}px(누출 ${String(comparison.leakedPixels)}px, 밀봉 브리지 ${String(comparison.bridgePixelCount)}px).`,
    `[안티-할로 언더블리드] 대상 구역(${regionSummaryLabel})에서 초기 흰 할로 ${String(trappingReport.naiveWhiteHaloPixelCount)}px 중 ${String(trappingReport.naiveWhiteHaloPixelCount - trappingReport.remainingWhiteHaloPixelCount)}px를 제거해 잔여 할로 ${String(trappingReport.remainingWhiteHaloPixelCount)}px(제거율 ${haloPctText}%)를 기록했습니다.`,
    `[구역 분리 안전성] 언더블리드 확장 ${String(trappingReport.totalUnderbleedAddedPixels)}px가 모두 각 구역의 최단 보로노이 반평면 안에 머물러 이웃 구역 교차 침범은 ${String(trappingReport.neighborCrossBleedPixelCount)}px입니다.`,
  ];

  if (trappingReport.rejectedRegionIds.length > 0) {
    summaryLinesKo.push(
      `[제외된 시드] 유효하지 않거나 중복된 시드 ${String(trappingReport.rejectedRegionIds.length)}건(${trappingReport.rejectedRegionIds.join(", ")})은 안전하게 건너뛰었습니다.`,
    );
  }

  const fullReportKo = [
    `[${verdictLabelKo}] ${headlineKo}`,
    ...summaryLinesKo,
    ...checklistKo.map(
      (item) => `- ${item.passed ? "통과" : "실패"} · ${item.labelKo}: ${item.detailKo}`,
    ),
  ].join("\n");

  return {
    verdict,
    verdictLabelKo,
    headlineKo,
    summaryLinesKo,
    checklistKo,
    fullReportKo,
  };
}
