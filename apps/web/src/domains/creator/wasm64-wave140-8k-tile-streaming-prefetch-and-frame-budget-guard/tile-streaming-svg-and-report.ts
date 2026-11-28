/**
 * Wave 140 — 순수 OKLCH 타일 히트맵·프레임 타임라인 SVG 렌더러 및 한국어 성능 엔지니어 QA 브리프.
 *
 * - 모든 SVG 색상은 CSS Color 4 `oklch(...)` 토큰만 사용하며 원시 16진수/RGB/HSL 표기를 철저히 배제한다.
 * - 타일 캐시 상태 히트맵(가시 히트/프리페치/폴백/편집 핀/축출/블랭크), 프레임 타임 바 차트(16.67ms·8.33ms 버짓 선),
 *   VRAM 점유율 곡선 및 하드 캡 상한선, Naive vs Predictive 정량 비교 패널을 단일 시트로 출력한다.
 * - 모든 텍스트 입력에 XML/XSS 이스케이프를 적용하고 모든 수치에 유한수 가드(`0` NaN/Infinity)를 적용한다.
 */

import { clampFinite } from "./tile-streaming-sha256";
import {
  FRAME_BUDGET_120FPS_MS,
  FRAME_BUDGET_60FPS_MS,
  type NaiveVsPredictiveComparisonResult,
  type PanZoomSessionResult,
  type TileVisualSnapshotCell,
  type TileVisualState,
} from "./vram-tile-cache-and-budget-guard";

export interface TileStreamingTelemetrySvgOptions {
  readonly titleOverrideKo?: string;
  readonly comparison?: NaiveVsPredictiveComparisonResult;
  readonly widthPx?: number;
  readonly heightPx?: number;
}

export interface TileStreamingSummaryKoOptions {
  readonly comparison?: NaiveVsPredictiveComparisonResult;
  readonly inspectedDateIso?: string;
}

const OKLCH_PALETTE = {
  canvasBg: "oklch(0.980 0.006 90)",
  cardBg: "oklch(1.000 0.000 0)",
  headerBg: "oklch(0.952 0.010 88)",
  trackBg: "oklch(0.942 0.008 90)",
  borderSoft: "oklch(0.320 0.038 158 / 0.22)",
  borderStrong: "oklch(0.280 0.050 158 / 0.45)",
  gridLine: "oklch(0.380 0.020 160 / 0.16)",
  inkPrimary: "oklch(0.205 0.030 160)",
  inkSecondary: "oklch(0.415 0.024 160)",
  passFill: "oklch(0.935 0.048 152)",
  passStroke: "oklch(0.425 0.120 152)",
  passText: "oklch(0.245 0.082 152)",
  warnFill: "oklch(0.938 0.056 30)",
  warnStroke: "oklch(0.545 0.175 28)",
  warnText: "oklch(0.320 0.125 28)",
  tileVisibleHit: "oklch(0.460 0.122 152)",
  tilePrefetch: "oklch(0.560 0.108 214)",
  tileFallback: "oklch(0.715 0.128 78)",
  tileDirtyPin: "oklch(0.495 0.132 284)",
  tileEvicted: "oklch(0.845 0.012 90)",
  tileBlankMiss: "oklch(0.565 0.185 26)",
  frameBaseBar: "oklch(0.720 0.042 210)",
  frameUploadBar: "oklch(0.440 0.118 154)",
  frameOverBudget: "oklch(0.565 0.185 26)",
  budgetLine60: "oklch(0.520 0.155 48)",
  budgetLine120: "oklch(0.480 0.145 265)",
  vramCurveStroke: "oklch(0.410 0.120 156)",
  vramCurveFill: "oklch(0.480 0.105 156 / 0.16)",
  vramCapLine: "oklch(0.545 0.175 28)",
  lodMarker: "oklch(0.620 0.155 62)",
  comparePredictive: "oklch(0.430 0.120 154)",
  compareNaive: "oklch(0.665 0.040 250)",
} as const;

const TILE_STATE_COLOR: Readonly<Record<TileVisualState, string>> = {
  "visible-hit": OKLCH_PALETTE.tileVisibleHit,
  "predictive-prefetch": OKLCH_PALETTE.tilePrefetch,
  "coarse-fallback": OKLCH_PALETTE.tileFallback,
  "pinned-dirty": OKLCH_PALETTE.tileDirtyPin,
  evicted: OKLCH_PALETTE.tileEvicted,
  "blank-miss": OKLCH_PALETTE.tileBlankMiss,
};

const TILE_STATE_LABEL_KO: Readonly<Record<TileVisualState, string>> = {
  "visible-hit": "가시 히트",
  "predictive-prefetch": "선행 프리페치",
  "coarse-fallback": "저해상 폴백",
  "pinned-dirty": "편집 핀 보호",
  evicted: "축출됨",
  "blank-miss": "블랭크 미스",
};

/** XML/SVG 특수문자(`&`, `<`, `>`, `"`, `'`)를 안전하게 이스케이프한다. */
export function escapeTileStreamingXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmtNum(value: number, decimals = 2, fallback = 0): string {
  const safe = Number.isFinite(value) ? value : fallback;
  const factor = Math.pow(10, decimals);
  const rounded = Math.round(safe * factor) / factor;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function fmtMiB(bytes: number): string {
  const safe = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
  return `${fmtNum(safe / (1024 * 1024), 1)} MiB`;
}

function fmtPct(ratio: number): string {
  return `${fmtNum(clampFinite(ratio * 100, 0, 100, 0), 1)}%`;
}

function renderHeatmapPanel(
  cells: readonly TileVisualSnapshotCell[],
  panelX: number,
  panelY: number,
  panelW: number,
  panelH: number,
): readonly string[] {
  const out: string[] = [
    `  <g id="panel-tile-heatmap">`,
    `    <rect x="${fmtNum(panelX)}" y="${fmtNum(panelY)}" width="${fmtNum(panelW)}" height="${fmtNum(panelH)}" rx="12" fill="${OKLCH_PALETTE.cardBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1.2" />`,
    `    <text x="${fmtNum(panelX + 18)}" y="${fmtNum(panelY + 28)}" fill="${OKLCH_PALETTE.inkPrimary}" font-size="14" font-weight="700">1. 타일 캐시 상태 히트맵 (가시·프리페치·폴백·편집 핀·축출)</text>`,
  ];

  const counts: Record<TileVisualState, number> = {
    "visible-hit": 0,
    "predictive-prefetch": 0,
    "coarse-fallback": 0,
    "pinned-dirty": 0,
    evicted: 0,
    "blank-miss": 0,
  };
  for (let i = 0; i < cells.length; i += 1) {
    counts[cells[i].state] += 1;
  }

  const gridCols = 16;
  const gridRows = 4;
  const gridX = panelX + 18;
  const gridY = panelY + 46;
  const gridW = panelW - 36;
  const cellGap = 4;
  const cellW = Math.max(10, (gridW - cellGap * (gridCols - 1)) / gridCols);
  const cellH = 38;

  const totalSlots = gridCols * gridRows;
  for (let idx = 0; idx < totalSlots; idx += 1) {
    const col = idx % gridCols;
    const row = Math.floor(idx / gridCols);
    const x = gridX + col * (cellW + cellGap);
    const y = gridY + row * (cellH + cellGap);
    const cell = cells[idx];
    const fill = cell ? TILE_STATE_COLOR[cell.state] : OKLCH_PALETTE.trackBg;
    const label = cell ? `M${String(cell.mipLevel)}` : "";
    out.push(
      `    <rect x="${fmtNum(x)}" y="${fmtNum(y)}" width="${fmtNum(cellW)}" height="${fmtNum(cellH)}" rx="4" fill="${fill}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="0.6" />`,
    );
    if (label.length > 0) {
      out.push(
        `    <text x="${fmtNum(x + cellW * 0.5)}" y="${fmtNum(y + cellH * 0.58)}" text-anchor="middle" fill="${OKLCH_PALETTE.cardBg}" font-size="9" font-weight="600">${label}</text>`,
      );
    }
  }

  const states: readonly TileVisualState[] = [
    "visible-hit",
    "predictive-prefetch",
    "coarse-fallback",
    "pinned-dirty",
    "evicted",
    "blank-miss",
  ];
  const legendY = gridY + gridRows * (cellH + cellGap) + 18;
  for (let i = 0; i < states.length; i += 1) {
    const st = states[i];
    const col = i % 3;
    const row = Math.floor(i / 3);
    const lx = panelX + 18 + col * 192;
    const ly = legendY + row * 24;
    out.push(
      `    <rect x="${fmtNum(lx)}" y="${fmtNum(ly - 10)}" width="12" height="12" rx="3" fill="${TILE_STATE_COLOR[st]}" />`,
      `    <text x="${fmtNum(lx + 18)}" y="${fmtNum(ly)}" fill="${OKLCH_PALETTE.inkSecondary}" font-size="11.5">${escapeTileStreamingXml(TILE_STATE_LABEL_KO[st])}: ${String(counts[st])}개</text>`,
    );
  }

  out.push(`  </g>`);
  return out;
}

function renderFrameTimelinePanel(
  session: PanZoomSessionResult,
  panelX: number,
  panelY: number,
  panelW: number,
  panelH: number,
): readonly string[] {
  const out: string[] = [
    `  <g id="panel-frame-timeline">`,
    `    <rect x="${fmtNum(panelX)}" y="${fmtNum(panelY)}" width="${fmtNum(panelW)}" height="${fmtNum(panelH)}" rx="12" fill="${OKLCH_PALETTE.cardBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1.2" />`,
    `    <text x="${fmtNum(panelX + 18)}" y="${fmtNum(panelY + 28)}" fill="${OKLCH_PALETTE.inkPrimary}" font-size="14" font-weight="700">2. 프레임 타임 타임라인 (60fps 16.67ms · 120fps 8.33ms 버짓 선)</text>`,
  ];

  const chartX = panelX + 46;
  const chartY = panelY + 48;
  const chartW = panelW - 68;
  const chartH = panelH - 104;
  const maxMs = Math.max(20, Math.ceil(session.metrics.maxFrameTimeMs * 1.15));

  // 기준 그리드 및 축
  out.push(
    `    <rect x="${fmtNum(chartX)}" y="${fmtNum(chartY)}" width="${fmtNum(chartW)}" height="${fmtNum(chartH)}" rx="4" fill="${OKLCH_PALETTE.canvasBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="0.8" />`,
  );

  const frames = session.frames;
  if (frames.length > 0) {
    const stepW = chartW / frames.length;
    const barW = Math.max(2, stepW * 0.72);
    for (let i = 0; i < frames.length; i += 1) {
      const f = frames[i];
      const totalH = clampFinite((f.totalFrameTimeMs / maxMs) * chartH, 0, chartH, 0);
      const uploadH = clampFinite((f.uploadTimeMs / maxMs) * chartH, 0, totalH, 0);
      const baseH = Math.max(0, totalH - uploadH);
      const bx = chartX + i * stepW + (stepW - barW) * 0.5;
      const baseY = chartY + chartH - baseH;
      const uploadY = baseY - uploadH;
      const uploadColor = f.withinFrameBudget
        ? OKLCH_PALETTE.frameUploadBar
        : OKLCH_PALETTE.frameOverBudget;

      out.push(
        `    <rect x="${fmtNum(bx)}" y="${fmtNum(baseY)}" width="${fmtNum(barW)}" height="${fmtNum(baseH)}" fill="${OKLCH_PALETTE.frameBaseBar}" />`,
        `    <rect x="${fmtNum(bx)}" y="${fmtNum(uploadY)}" width="${fmtNum(barW)}" height="${fmtNum(uploadH)}" fill="${uploadColor}" />`,
      );
    }
  }

  // 16.67ms(60fps) 및 8.33ms(120fps) 수평 버짓 선
  const y60 = chartY + chartH - clampFinite((FRAME_BUDGET_60FPS_MS / maxMs) * chartH, 0, chartH, 0);
  const y120 = chartY + chartH - clampFinite((FRAME_BUDGET_120FPS_MS / maxMs) * chartH, 0, chartH, 0);
  out.push(
    `    <line x1="${fmtNum(chartX)}" y1="${fmtNum(y60)}" x2="${fmtNum(chartX + chartW)}" y2="${fmtNum(y60)}" stroke="${OKLCH_PALETTE.budgetLine60}" stroke-width="1.5" stroke-dasharray="6 4" />`,
    `    <text x="${fmtNum(chartX + chartW - 4)}" y="${fmtNum(y60 - 5)}" text-anchor="end" fill="${OKLCH_PALETTE.budgetLine60}" font-size="10.5" font-weight="700">60fps 상한 16.67ms</text>`,
    `    <line x1="${fmtNum(chartX)}" y1="${fmtNum(y120)}" x2="${fmtNum(chartX + chartW)}" y2="${fmtNum(y120)}" stroke="${OKLCH_PALETTE.budgetLine120}" stroke-width="1.5" stroke-dasharray="4 3" />`,
    `    <text x="${fmtNum(chartX + chartW - 4)}" y="${fmtNum(y120 - 5)}" text-anchor="end" fill="${OKLCH_PALETTE.budgetLine120}" font-size="10.5" font-weight="700">120fps 상한 8.33ms</text>`,
    `    <text x="${fmtNum(chartX - 6)}" y="${fmtNum(chartY + 10)}" text-anchor="end" fill="${OKLCH_PALETTE.inkSecondary}" font-size="10">${fmtNum(maxMs, 0)}ms</text>`,
    `    <text x="${fmtNum(chartX - 6)}" y="${fmtNum(chartY + chartH)}" text-anchor="end" fill="${OKLCH_PALETTE.inkSecondary}" font-size="10">0ms</text>`,
    `    <text x="${fmtNum(panelX + 18)}" y="${fmtNum(panelY + panelH - 18)}" fill="${OKLCH_PALETTE.inkSecondary}" font-size="11.5">평균 ${fmtNum(session.metrics.averageFrameTimeMs, 2)}ms · P95 ${fmtNum(session.metrics.p95FrameTimeMs, 2)}ms · P99 ${fmtNum(session.metrics.p99FrameTimeMs, 2)}ms · 최대 업로드 ${fmtNum(session.metrics.maxUploadTimeMs, 2)}ms (상한 ${fmtNum(session.uploadBudgetMs, 1)}ms)</text>`,
    `  </g>`,
  );
  return out;
}

function renderVramCurvePanel(
  session: PanZoomSessionResult,
  panelX: number,
  panelY: number,
  panelW: number,
  panelH: number,
): readonly string[] {
  const out: string[] = [
    `  <g id="panel-vram-curve">`,
    `    <rect x="${fmtNum(panelX)}" y="${fmtNum(panelY)}" width="${fmtNum(panelW)}" height="${fmtNum(panelH)}" rx="12" fill="${OKLCH_PALETTE.cardBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1.2" />`,
    `    <text x="${fmtNum(panelX + 18)}" y="${fmtNum(panelY + 28)}" fill="${OKLCH_PALETTE.inkPrimary}" font-size="14" font-weight="700">3. VRAM 점유율 곡선 및 하드 캡 상한 (${escapeTileStreamingXml(fmtMiB(session.vramBudgetBytes))})</text>`,
  ];

  const chartX = panelX + 46;
  const chartY = panelY + 52;
  const chartW = panelW - 68;
  const chartH = panelH - 108;

  out.push(
    `    <rect x="${fmtNum(chartX)}" y="${fmtNum(chartY)}" width="${fmtNum(chartW)}" height="${fmtNum(chartH)}" rx="4" fill="${OKLCH_PALETTE.canvasBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="0.8" />`,
    `    <line x1="${fmtNum(chartX)}" y1="${fmtNum(chartY + 8)}" x2="${fmtNum(chartX + chartW)}" y2="${fmtNum(chartY + 8)}" stroke="${OKLCH_PALETTE.vramCapLine}" stroke-width="1.6" stroke-dasharray="6 4" />`,
    `    <text x="${fmtNum(chartX + chartW - 4)}" y="${fmtNum(chartY + 22)}" text-anchor="end" fill="${OKLCH_PALETTE.vramCapLine}" font-size="10.5" font-weight="700">VRAM 하드 캡 100% (초과 0B)</text>`,
  );

  const usableH = chartH - 12;
  const frames = session.frames;
  if (frames.length > 0) {
    const points: string[] = [];
    const areaPoints: string[] = [`${fmtNum(chartX)},${fmtNum(chartY + chartH)}`];
    for (let i = 0; i < frames.length; i += 1) {
      const f = frames[i];
      const rx = frames.length > 1 ? i / (frames.length - 1) : 0;
      const px = chartX + rx * chartW;
      const ratio = clampFinite(f.vramUtilizationRatio, 0, 1, 0);
      const py = chartY + chartH - ratio * usableH;
      points.push(`${fmtNum(px)},${fmtNum(py)}`);
      areaPoints.push(`${fmtNum(px)},${fmtNum(py)}`);
    }
    areaPoints.push(`${fmtNum(chartX + chartW)},${fmtNum(chartY + chartH)}`);

    out.push(
      `    <polygon points="${areaPoints.join(" ")}" fill="${OKLCH_PALETTE.vramCurveFill}" />`,
      `    <polyline points="${points.join(" ")}" fill="none" stroke="${OKLCH_PALETTE.vramCurveStroke}" stroke-width="2.2" stroke-linejoin="round" />`,
    );

    for (let i = 0; i < frames.length; i += 1) {
      if (!frames[i].gracefulLodDegradationTriggered) continue;
      const rx = frames.length > 1 ? i / (frames.length - 1) : 0;
      const px = chartX + rx * chartW;
      const py = chartY + chartH - clampFinite(frames[i].vramUtilizationRatio, 0, 1, 0) * usableH;
      out.push(
        `    <circle cx="${fmtNum(px)}" cy="${fmtNum(py)}" r="4.5" fill="${OKLCH_PALETTE.lodMarker}" stroke="${OKLCH_PALETTE.cardBg}" stroke-width="1.2" />`,
      );
    }
  }

  out.push(
    `    <text x="${fmtNum(chartX - 6)}" y="${fmtNum(chartY + 12)}" text-anchor="end" fill="${OKLCH_PALETTE.inkSecondary}" font-size="10">100%</text>`,
    `    <text x="${fmtNum(chartX - 6)}" y="${fmtNum(chartY + chartH)}" text-anchor="end" fill="${OKLCH_PALETTE.inkSecondary}" font-size="10">0%</text>`,
    `    <text x="${fmtNum(panelX + 18)}" y="${fmtNum(panelY + panelH - 18)}" fill="${OKLCH_PALETTE.inkSecondary}" font-size="11.5">최대 점유 ${escapeTileStreamingXml(fmtMiB(session.metrics.peakVramBytes))} (${fmtPct(session.metrics.peakVramUtilizationRatio)}) · OOM ${String(session.metrics.totalOomEvents)}건 · 축출 ${String(session.metrics.totalEvictedTiles)}장 · LOD 완화 ${String(session.metrics.totalLodDegradationEvents)}회</text>`,
    `  </g>`,
  );
  return out;
}

function renderComparisonPanel(
  session: PanZoomSessionResult,
  comparison: NaiveVsPredictiveComparisonResult | undefined,
  panelX: number,
  panelY: number,
  panelW: number,
  panelH: number,
): readonly string[] {
  const out: string[] = [
    `  <g id="panel-naive-vs-predictive">`,
    `    <rect x="${fmtNum(panelX)}" y="${fmtNum(panelY)}" width="${fmtNum(panelW)}" height="${fmtNum(panelH)}" rx="12" fill="${OKLCH_PALETTE.cardBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1.2" />`,
    `    <text x="${fmtNum(panelX + 18)}" y="${fmtNum(panelY + 28)}" fill="${OKLCH_PALETTE.inkPrimary}" font-size="14" font-weight="700">4. Naive 반응형 vs Wave 140 선행 프리페치 대조</text>`,
  ];

  const predictive = comparison ? comparison.predictive : session;
  const naive = comparison ? comparison.naive : undefined;
  const barX = panelX + 18;
  const barMaxW = panelW - 180;

  interface MetricBarRow {
    readonly label: string;
    readonly predNorm: number;
    readonly naiveNorm: number;
    readonly predValueText: string;
    readonly naiveValueText: string;
  }

  const maxBlank = Math.max(
    1,
    predictive.metrics.totalBlankTiles,
    naive ? naive.metrics.totalBlankTiles : 1,
  );
  const maxP99 = Math.max(
    session.frameBudgetMs,
    predictive.metrics.p99FrameTimeMs,
    naive ? naive.metrics.p99FrameTimeMs : session.frameBudgetMs,
  );

  const rows: readonly MetricBarRow[] = [
    {
      label: "캐시 히트율 (높을수록 우수)",
      predNorm: clampFinite(predictive.metrics.averageCacheHitRatio, 0, 1, 0),
      naiveNorm: naive ? clampFinite(naive.metrics.averageCacheHitRatio, 0, 1, 0) : 0,
      predValueText: fmtPct(predictive.metrics.averageCacheHitRatio),
      naiveValueText: naive ? fmtPct(naive.metrics.averageCacheHitRatio) : "비교 없음",
    },
    {
      label: "블랭크 체커보드 타일 수 (낮을수록 우수)",
      predNorm: clampFinite(predictive.metrics.totalBlankTiles / maxBlank, 0, 1, 0),
      naiveNorm: naive ? clampFinite(naive.metrics.totalBlankTiles / maxBlank, 0, 1, 0) : 0,
      predValueText: `${String(predictive.metrics.totalBlankTiles)}장`,
      naiveValueText: naive ? `${String(naive.metrics.totalBlankTiles)}장` : "비교 없음",
    },
    {
      label: "P99 프레임 타임 (낮을수록 우수)",
      predNorm: clampFinite(predictive.metrics.p99FrameTimeMs / maxP99, 0, 1, 0),
      naiveNorm: naive ? clampFinite(naive.metrics.p99FrameTimeMs / maxP99, 0, 1, 0) : 0,
      predValueText: `${fmtNum(predictive.metrics.p99FrameTimeMs, 2)}ms`,
      naiveValueText: naive ? `${fmtNum(naive.metrics.p99FrameTimeMs, 2)}ms` : "비교 없음",
    },
    {
      label: "프레임 버짓 준수율 (높을수록 우수)",
      predNorm: clampFinite(predictive.metrics.frameBudgetComplianceRatio, 0, 1, 0),
      naiveNorm: naive ? clampFinite(naive.metrics.frameBudgetComplianceRatio, 0, 1, 0) : 0,
      predValueText: fmtPct(predictive.metrics.frameBudgetComplianceRatio),
      naiveValueText: naive ? fmtPct(naive.metrics.frameBudgetComplianceRatio) : "비교 없음",
    },
  ];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const ry = panelY + 56 + i * 64;
    const predW = Math.max(3, row.predNorm * barMaxW);
    const naiveW = naive ? Math.max(3, row.naiveNorm * barMaxW) : 0;

    out.push(
      `    <text x="${fmtNum(barX)}" y="${fmtNum(ry)}" fill="${OKLCH_PALETTE.inkPrimary}" font-size="11.5" font-weight="600">${escapeTileStreamingXml(row.label)}</text>`,
      `    <rect x="${fmtNum(barX)}" y="${fmtNum(ry + 8)}" width="${fmtNum(barMaxW)}" height="12" rx="4" fill="${OKLCH_PALETTE.trackBg}" />`,
      `    <rect x="${fmtNum(barX)}" y="${fmtNum(ry + 8)}" width="${fmtNum(predW)}" height="12" rx="4" fill="${OKLCH_PALETTE.comparePredictive}" />`,
      `    <text x="${fmtNum(barX + barMaxW + 10)}" y="${fmtNum(ry + 18)}" fill="${OKLCH_PALETTE.inkPrimary}" font-size="11" font-weight="700">Wave 140: ${escapeTileStreamingXml(row.predValueText)}</text>`,
    );

    if (naive) {
      out.push(
        `    <rect x="${fmtNum(barX)}" y="${fmtNum(ry + 24)}" width="${fmtNum(barMaxW)}" height="12" rx="4" fill="${OKLCH_PALETTE.trackBg}" />`,
        `    <rect x="${fmtNum(barX)}" y="${fmtNum(ry + 24)}" width="${fmtNum(naiveW)}" height="12" rx="4" fill="${OKLCH_PALETTE.compareNaive}" />`,
        `    <text x="${fmtNum(barX + barMaxW + 10)}" y="${fmtNum(ry + 34)}" fill="${OKLCH_PALETTE.inkSecondary}" font-size="11">Naive: ${escapeTileStreamingXml(row.naiveValueText)}</text>`,
      );
    }
  }

  const footerNote = comparison
    ? `히트율 +${fmtNum(comparison.cacheHitRatioGain * 100, 1)}%p · 블랭크 -${String(comparison.blankTileReductionCount)}장 · P99 ${fmtNum(comparison.p99FrameTimeImprovementMs, 2)}ms 단축`
    : `단독 세션 분석 · 전체 가시 타일 ${String(session.metrics.totalVisibleTilesRequested)}장 중 폴백 ${String(session.metrics.totalRenderedFallbackTiles)}장 대체`;

  out.push(
    `    <text x="${fmtNum(panelX + 18)}" y="${fmtNum(panelY + panelH - 18)}" fill="${OKLCH_PALETTE.inkSecondary}" font-size="11.5">${escapeTileStreamingXml(footerNote)}</text>`,
    `  </g>`,
  );
  return out;
}

/**
 * 타일 히트맵, 프레임 타임라인(16.67ms/8.33ms 선), VRAM 곡선, Naive vs Predictive 비교를
 * 순수 `oklch(...)` SVG 대시보드로 렌더링한다.
 */
export function renderTileStreamingTelemetrySvg(
  session: PanZoomSessionResult,
  options?: TileStreamingTelemetrySvgOptions,
): string {
  const width = Math.max(960, Math.min(2048, Math.floor(options?.widthPx ?? 1280)));
  const height = Math.max(720, Math.min(1440, Math.floor(options?.heightPx ?? 840)));
  const title =
    options?.titleOverrideKo ??
    `Wave 140 8K 타일 스트리밍 프리페치 & ${String(session.targetFps)}fps 프레임 버짓 가드`;
  const subtitle = `${session.scenarioLabel} · ${session.spec.label} · SHA-256 ${session.sessionSha256Hex.slice(0, 12)}`;

  const allPass =
    session.invariants.vramHardCapRespected &&
    session.invariants.zeroVisibleEvictions &&
    session.invariants.zeroDirtyEvictions &&
    session.invariants.zeroOomEvents &&
    session.metrics.frameBudgetComplianceRatio >= 0.99;

  const badgeFill = allPass ? OKLCH_PALETTE.passFill : OKLCH_PALETTE.warnFill;
  const badgeStroke = allPass ? OKLCH_PALETTE.passStroke : OKLCH_PALETTE.warnStroke;
  const badgeText = allPass ? OKLCH_PALETTE.passText : OKLCH_PALETTE.warnText;
  const badgeLabel = allPass
    ? `PASS · OOM 0건 · ${fmtPct(session.metrics.frameBudgetComplianceRatio)} 준수`
    : `CHECK · 준수율 ${fmtPct(session.metrics.frameBudgetComplianceRatio)}`;

  const pad = 24;
  const headerH = 74;
  const colGap = 18;
  const rowGap = 18;
  const panelW = (width - pad * 2 - colGap) * 0.5;
  const topPanelH = 310;
  const bottomPanelH = height - pad * 2 - headerH - topPanelH - rowGap * 2;
  const topY = pad + headerH + rowGap;
  const bottomY = topY + topPanelH + rowGap;
  const rightX = pad + panelW + colGap;

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(width)} ${String(height)}" width="${String(width)}" height="${String(height)}" role="img" aria-label="${escapeTileStreamingXml(title)}">`,
    `  <title>${escapeTileStreamingXml(title)}</title>`,
    `  <rect x="0" y="0" width="${String(width)}" height="${String(height)}" fill="${OKLCH_PALETTE.canvasBg}" />`,
    `  <g id="header-bar">`,
    `    <rect x="${String(pad)}" y="${String(pad)}" width="${String(width - pad * 2)}" height="${String(headerH)}" rx="14" fill="${OKLCH_PALETTE.headerBg}" stroke="${OKLCH_PALETTE.borderStrong}" stroke-width="1.2" />`,
    `    <text x="${String(pad + 20)}" y="${String(pad + 30)}" fill="${OKLCH_PALETTE.inkPrimary}" font-size="18" font-weight="800">${escapeTileStreamingXml(title)}</text>`,
    `    <text x="${String(pad + 20)}" y="${String(pad + 54)}" fill="${OKLCH_PALETTE.inkSecondary}" font-size="12">${escapeTileStreamingXml(subtitle)}</text>`,
    `    <rect x="${fmtNum(width - pad - 252)}" y="${String(pad + 18)}" width="234" height="36" rx="18" fill="${badgeFill}" stroke="${badgeStroke}" stroke-width="1.2" />`,
    `    <text x="${fmtNum(width - pad - 135)}" y="${String(pad + 41)}" text-anchor="middle" fill="${badgeText}" font-size="12.5" font-weight="700">${escapeTileStreamingXml(badgeLabel)}</text>`,
    `  </g>`,
    ...renderHeatmapPanel(session.finalTileVisualSnapshot, pad, topY, panelW, topPanelH),
    ...renderFrameTimelinePanel(session, rightX, topY, panelW, topPanelH),
    ...renderVramCurvePanel(session, pad, bottomY, panelW, bottomPanelH),
    ...renderComparisonPanel(session, options?.comparison, rightX, bottomY, panelW, bottomPanelH),
    `</svg>`,
  ];

  return lines.join("\n");
}

/**
 * 8K 타일 스트리밍 세션 결과를 스튜디오 성능 엔지니어 관점의 자연스러운 한국어 QA 브리프로 요약한다.
 */
export function summarizeTileStreamingSessionKo(
  session: PanZoomSessionResult,
  options?: TileStreamingSummaryKoOptions,
): string {
  const m = session.metrics;
  const inv = session.invariants;
  const allInvariantsOk =
    inv.vramHardCapRespected &&
    inv.zeroVisibleEvictions &&
    inv.zeroDirtyEvictions &&
    inv.zeroOomEvents &&
    inv.uploadBudgetRespected;

  const verdictKo =
    allInvariantsOk && m.frameBudgetComplianceRatio >= 0.99
      ? "합격 (8K 스트리밍 3대 불변량·프레임 버짓 충족)"
      : "점검 필요 (VRAM 또는 프레임 버짓 경고 발생)";

  const dateLine = options?.inspectedDateIso
    ? `점검 일자: ${options.inspectedDateIso}`
    : "점검 기준: 결정론적 시뮬레이션 스냅샷";

  const lines: string[] = [
    `# Wave 140 8K 타일 스트리밍 성능 QA 브리프`,
    `- 판정: ${verdictKo}`,
    `- ${dateLine}`,
    `- 대상 원고: ${session.spec.label} / 시나리오: ${session.scenarioLabel} (${String(m.totalFrames)}프레임, 목표 ${String(session.targetFps)}fps / ${fmtNum(session.frameBudgetMs, 2)}ms)`,
    ``,
    `## 1. 3대 절대 불변량 검증`,
    `- VRAM 하드 캡: 최대 ${fmtMiB(m.peakVramBytes)} / 예산 ${fmtMiB(session.vramBudgetBytes)} (${fmtPct(m.peakVramUtilizationRatio)}) — 초과 0B, OOM ${String(m.totalOomEvents)}건 [${inv.vramHardCapRespected && inv.zeroOomEvents ? "통과" : "실패"}]`,
    `- 가시·편집 핀 보호: 가시 타일 축출 ${inv.zeroVisibleEvictions ? "0건" : "발생"}, 미저장 Dirty 편집 타일 축출 ${inv.zeroDirtyEvictions ? "0건" : "발생"}, Graceful LOD 완화 ${String(m.totalLodDegradationEvents)}회 [${inv.zeroVisibleEvictions && inv.zeroDirtyEvictions ? "통과" : "실패"}]`,
    `- 프레임당 업로드 버짓: 최대 업로드 ${fmtNum(m.maxUploadTimeMs, 2)}ms (상한 ${fmtNum(session.uploadBudgetMs, 2)}ms), 전체 버짓 준수율 ${fmtPct(m.frameBudgetComplianceRatio)} (${String(m.framesWithinBudget)}/${String(m.totalFrames)}프레임) [${inv.uploadBudgetRespected ? "통과" : "초과"}]`,
    ``,
    `## 2. 패닝·줌 응답성과 화면 완성도`,
    `- 프레임 지연: 평균 ${fmtNum(m.averageFrameTimeMs, 2)}ms · P50 ${fmtNum(m.p50FrameTimeMs, 2)}ms · P95 ${fmtNum(m.p95FrameTimeMs, 2)}ms · P99 ${fmtNum(m.p99FrameTimeMs, 2)}ms`,
    `- 타일 캐시 적중: 평균 히트율 ${fmtPct(m.averageCacheHitRatio)} (정상 주행 구간 ${fmtPct(m.steadyStateCacheHitRatio)}), 저해상 MIP 폴백 대체 ${String(m.totalRenderedFallbackTiles)}장, 블랭크 체커보드 ${String(m.totalBlankTiles)}장 (${String(m.framesWithBlankTiles)}프레임)`,
  ];

  if (options?.comparison) {
    const cmp = options.comparison;
    lines.push(
      ``,
      `## 3. Naive 반응형 로더 대비 Wave 140 개선 수치`,
      `- 캐시 히트율: Naive ${fmtPct(cmp.naive.metrics.averageCacheHitRatio)} -> Wave 140 ${fmtPct(cmp.predictive.metrics.averageCacheHitRatio)} (${cmp.cacheHitRatioGain >= 0 ? "+" : ""}${fmtNum(cmp.cacheHitRatioGain * 100, 1)}%p)`,
      `- 블랭크 체커보드: Naive ${String(cmp.naive.metrics.totalBlankTiles)}장 (${String(cmp.naive.metrics.framesWithBlankTiles)}프레임) -> Wave 140 ${String(cmp.predictive.metrics.totalBlankTiles)}장 (${String(cmp.predictive.metrics.framesWithBlankTiles)}프레임, ${fmtPct(cmp.blankTileReductionRatio)} 감축)`,
      `- 지연 및 버짓 준수: P95 ${fmtNum(cmp.naive.metrics.p95FrameTimeMs, 2)}ms -> ${fmtNum(cmp.predictive.metrics.p95FrameTimeMs, 2)}ms, P99 ${fmtNum(cmp.naive.metrics.p99FrameTimeMs, 2)}ms -> ${fmtNum(cmp.predictive.metrics.p99FrameTimeMs, 2)}ms, 버짓 준수율 ${fmtPct(cmp.naive.metrics.frameBudgetComplianceRatio)} -> ${fmtPct(cmp.predictive.metrics.frameBudgetComplianceRatio)}`,
    );
  }

  lines.push(
    ``,
    `## 결정론 지문`,
    `- 세션 SHA-256: ${session.sessionSha256Hex}`,
    `- 캐시 상태 SHA-256: ${inv.stateSha256Hex}`,
  );

  return lines.join("\n");
}
