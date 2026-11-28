/**
 * Wave 124 — 인쇄 안전 순수 OKLCH 크로스해칭 검수 SVG 렌더러 및 한국어 펜선 디렉터 QA 브리프.
 *
 * - 원시 hex/rgb/hsl 표기를 배제하고 100% `oklch(...)` 팔레트만 사용
 * - 1/2/3층 테이퍼 해칭 펜선 리본, 주곡률 방향장 미니 화살표,
 *   암부/중간톤/하이라이트 밀도 바 차트를 XML 안전 이스케이프 및 NaN/Infinity 0건으로 출력
 * - 번역투 없는 실무 한국어 흑백/느와르 펜선 검수 브리프 생성
 */

import type {
  CurvatureCrossHatchingResult,
  HatchStroke,
  HatchStyleId,
  SurfacePresetId,
  Vec2,
} from "./curvature-cross-hatching-solver";

export type CrossHatchSvgTheme = "print-monochrome" | "studio-dark";

export interface CrossHatchAuditSvgOptions {
  readonly title?: string;
  readonly theme?: CrossHatchSvgTheme;
  readonly showCurvatureArrows?: boolean;
  readonly showToneChart?: boolean;
}

export interface CrossHatchingAuditReportKo {
  readonly surfacePreset: SurfacePresetId | "custom";
  readonly surfaceLabelKo: string;
  readonly styleId: HatchStyleId;
  readonly styleLabelKo: string;
  readonly totalStrokeCount: number;
  readonly outsideMaskPointCount: number;
  readonly toneMonotonicPassed: boolean;
  readonly headlineKo: string;
  readonly summaryParagraphKo: string;
  readonly toneVerdictKo: string;
  readonly silhouetteVerdictKo: string;
  readonly layerBreakdownKo: string;
  readonly checklistKo: readonly string[];
}

interface CrossHatchOklchPalette {
  readonly pageBg: string;
  readonly panelBg: string;
  readonly panelBorder: string;
  readonly silhouetteStroke: string;
  readonly silhouetteFill: string;
  readonly tier1Ink: string;
  readonly tier2Ink: string;
  readonly tier3Ink: string;
  readonly arrowStroke: string;
  readonly chartPanelBg: string;
  readonly chartTrackBg: string;
  readonly shadowBarFill: string;
  readonly midtoneBarFill: string;
  readonly highlightBarFill: string;
  readonly textPrimary: string;
  readonly textMuted: string;
  readonly dividerStroke: string;
}

const PRINT_MONOCHROME_PALETTE: CrossHatchOklchPalette = {
  pageBg: "oklch(0.975 0.005 88)",
  panelBg: "oklch(0.992 0.003 90)",
  panelBorder: "oklch(0.2 0.01 260)",
  silhouetteStroke: "oklch(0.32 0.012 260)",
  silhouetteFill: "oklch(0.965 0.006 88)",
  tier1Ink: "oklch(0.16 0.008 260)",
  tier2Ink: "oklch(0.22 0.01 255)",
  tier3Ink: "oklch(0.11 0.006 260)",
  arrowStroke: "oklch(0.45 0.11 165)",
  chartPanelBg: "oklch(0.965 0.006 88)",
  chartTrackBg: "oklch(0.89 0.008 88)",
  shadowBarFill: "oklch(0.22 0.014 260)",
  midtoneBarFill: "oklch(0.48 0.018 255)",
  highlightBarFill: "oklch(0.76 0.014 90)",
  textPrimary: "oklch(0.18 0.012 260)",
  textMuted: "oklch(0.42 0.014 255)",
  dividerStroke: "oklch(0.82 0.01 88)",
};

const STUDIO_DARK_PALETTE: CrossHatchOklchPalette = {
  pageBg: "oklch(0.16 0.01 255)",
  panelBg: "oklch(0.21 0.012 255)",
  panelBorder: "oklch(0.84 0.012 90)",
  silhouetteStroke: "oklch(0.74 0.015 245)",
  silhouetteFill: "oklch(0.24 0.012 255)",
  tier1Ink: "oklch(0.92 0.008 90)",
  tier2Ink: "oklch(0.82 0.012 240)",
  tier3Ink: "oklch(0.97 0.006 90)",
  arrowStroke: "oklch(0.76 0.12 165)",
  chartPanelBg: "oklch(0.19 0.012 255)",
  chartTrackBg: "oklch(0.3 0.014 255)",
  shadowBarFill: "oklch(0.92 0.01 90)",
  midtoneBarFill: "oklch(0.72 0.02 245)",
  highlightBarFill: "oklch(0.45 0.015 255)",
  textPrimary: "oklch(0.94 0.008 90)",
  textMuted: "oklch(0.74 0.014 245)",
  dividerStroke: "oklch(0.34 0.015 255)",
};

const SURFACE_LABELS_KO: Record<SurfacePresetId | "custom", string> = {
  "cylinder-limb": "원기둥 팔다리 곡면",
  "sphere-head": "구형 두상 곡면",
  "folded-drapery": "천 주름 곡면",
  "planar-wall": "건축 평면 벽체",
  custom: "커스텀 마스크 곡면",
};

const STYLE_LABELS_KO: Record<HatchStyleId, string> = {
  "g-pen-classic-cross": "G펜 정통 크로스해칭",
  "murim-brush-hatch": "무협 붓터치 해칭",
  "noir-parallel-engraving": "누아르 평행 조각선",
  "stipple-fine-liner": "세필 라이너 점묘 해칭",
};

export function escapeCrossHatchXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmt(value: number, fallback = 0): string {
  const safe = Number.isFinite(value) ? value : fallback;
  return safe.toFixed(2);
}

function formatPercent(ratio: number): string {
  const safe = Number.isFinite(ratio) ? Math.max(0, ratio * 100) : 0;
  return `${safe.toFixed(1)}%`;
}

/**
 * 테이퍼 폭이 반영된 단일 해칭 스트로크의 닫힌 리본 폴리곤 정점을 계산한다.
 */
export function buildTaperedStrokeRibbonPolygon(stroke: HatchStroke): readonly Vec2[] {
  const pts = stroke.points;
  if (pts.length < 2) return [];
  const leftSide: Vec2[] = [];
  const rightSide: Vec2[] = [];

  for (let i = 0; i < pts.length; i += 1) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const len = Math.hypot(tx, ty);
    if (len < 1e-6) {
      tx = 1;
      ty = 0;
    } else {
      tx /= len;
      ty /= len;
    }
    const nx = -ty;
    const ny = tx;
    const halfW = Math.max(0.15, (Number.isFinite(pts[i].widthPx) ? pts[i].widthPx : 1) * 0.5);
    leftSide.push({ x: pts[i].x + nx * halfW, y: pts[i].y + ny * halfW });
    rightSide.push({ x: pts[i].x - nx * halfW, y: pts[i].y - ny * halfW });
  }

  const polygon: Vec2[] = [];
  for (let i = 0; i < leftSide.length; i += 1) polygon.push(leftSide[i]);
  for (let i = rightSide.length - 1; i >= 0; i -= 1) polygon.push(rightSide[i]);
  return polygon;
}

function pointsToSvgList(points: readonly Vec2[]): string {
  const tokens: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const pt = points[i];
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
    tokens.push(`${fmt(pt.x)},${fmt(pt.y)}`);
  }
  return tokens.join(" ");
}

/**
 * 1/2/3층 테이퍼 해칭 펜선, 주곡률 방향장 미니 화살표, 암부/중간톤/하이라이트 밀도 바 차트를
 * 인쇄 안전 순수 OKLCH SVG로 렌더링한다.
 */
export function renderCrossHatchingAuditSvg(
  result: CurvatureCrossHatchingResult,
  options: CrossHatchAuditSvgOptions = {},
): string {
  const palette =
    options.theme === "studio-dark" ? STUDIO_DARK_PALETTE : PRINT_MONOCHROME_PALETTE;
  const showArrows = options.showCurvatureArrows ?? true;
  const showToneChart = options.showToneChart ?? true;

  const artW = Math.max(64, Number.isFinite(result.width) ? result.width : 320);
  const artH = Math.max(64, Number.isFinite(result.height) ? result.height : 320);
  const pad = 16;
  const chartW = showToneChart ? 236 : 0;
  const totalW = pad * 2 + artW + (showToneChart ? pad + chartW : 0);
  const totalH = Math.max(240, pad * 2 + artH);

  const surfaceLabel = SURFACE_LABELS_KO[result.surfacePreset];
  const styleLabel = STYLE_LABELS_KO[result.styleId];
  const rawTitle = options.title ?? `${surfaceLabel} · ${styleLabel} 해칭 검수`;
  const safeTitle = escapeCrossHatchXml(rawTitle);

  const chunks: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(totalW)} ${fmt(totalH)}" width="${fmt(totalW)}" height="${fmt(totalH)}" role="img" aria-label="${safeTitle}">`,
    `  <title>${safeTitle}</title>`,
    `  <rect x="0" y="0" width="${fmt(totalW)}" height="${fmt(totalH)}" fill="${palette.pageBg}" />`,
    `  <g data-layer="artboard-frame" transform="translate(${fmt(pad)}, ${fmt(pad)})">`,
    `    <rect x="0" y="0" width="${fmt(artW)}" height="${fmt(artH)}" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="2" />`,
  ];

  if (result.silhouetteOutline.length >= 3) {
    const outlinePts = pointsToSvgList(result.silhouetteOutline);
    chunks.push(
      `    <polygon data-layer="silhouette-mask" points="${outlinePts}" fill="${palette.silhouetteFill}" stroke="${palette.silhouetteStroke}" stroke-width="1.25" />`,
    );
  }

  const tierInks: Record<1 | 2 | 3, string> = {
    1: palette.tier1Ink,
    2: palette.tier2Ink,
    3: palette.tier3Ink,
  };

  for (const tier of [1, 2, 3] as const) {
    chunks.push(`    <g data-layer="hatch-tier-${tier}">`);
    for (let i = 0; i < result.strokes.length; i += 1) {
      const stroke = result.strokes[i];
      if (stroke.layer !== tier) continue;
      const ribbon = buildTaperedStrokeRibbonPolygon(stroke);
      const ptsStr = pointsToSvgList(ribbon);
      if (ptsStr.length === 0) continue;
      chunks.push(
        `      <polygon data-stroke-id="${escapeCrossHatchXml(stroke.id)}" points="${ptsStr}" fill="${tierInks[tier]}" />`,
      );
    }
    chunks.push(`    </g>`);
  }

  if (showArrows && result.directionArrows.length > 0) {
    const arrowHalfLen = Math.max(4.5, Math.min(9.5, Math.min(artW, artH) * 0.025));
    chunks.push(`    <g data-layer="curvature-direction-arrows">`);
    for (let i = 0; i < result.directionArrows.length; i += 1) {
      const arrow = result.directionArrows[i];
      const x1 = arrow.x - arrow.dx * arrowHalfLen;
      const y1 = arrow.y - arrow.dy * arrowHalfLen;
      const x2 = arrow.x + arrow.dx * arrowHalfLen;
      const y2 = arrow.y + arrow.dy * arrowHalfLen;
      const perpX = -arrow.dy;
      const perpY = arrow.dx;
      const headBack = arrowHalfLen * 0.48;
      const headSide = arrowHalfLen * 0.36;
      const hx1 = x2 - arrow.dx * headBack + perpX * headSide;
      const hy1 = y2 - arrow.dy * headBack + perpY * headSide;
      const hx2 = x2 - arrow.dx * headBack - perpX * headSide;
      const hy2 = y2 - arrow.dy * headBack - perpY * headSide;
      chunks.push(
        `      <path d="M ${fmt(x1)} ${fmt(y1)} L ${fmt(x2)} ${fmt(y2)} M ${fmt(hx1)} ${fmt(hy1)} L ${fmt(x2)} ${fmt(y2)} L ${fmt(hx2)} ${fmt(hy2)}" fill="none" stroke="${palette.arrowStroke}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" />`,
      );
    }
    chunks.push(`    </g>`);
  }

  chunks.push(`  </g>`);

  if (showToneChart) {
    const panelX = pad * 2 + artW;
    const panelY = pad;
    const panelH = totalH - pad * 2;
    const tz = result.metrics.toneZones;
    const maxDensity = Math.max(0.05, tz.shadowDensity, tz.midtoneDensity, tz.highlightDensity);
    const barMaxW = chartW - 32;

    const bars: readonly { readonly id: string; readonly label: string; readonly value: number; readonly fill: string }[] = [
      { id: "shadow", label: "암부 (L &lt; 0.35)", value: tz.shadowDensity, fill: palette.shadowBarFill },
      { id: "midtone", label: "중간톤 (0.35–0.72)", value: tz.midtoneDensity, fill: palette.midtoneBarFill },
      { id: "highlight", label: "하이라이트 (L &gt; 0.82)", value: tz.highlightDensity, fill: palette.highlightBarFill },
    ];

    chunks.push(`  <g data-layer="tone-density-chart" transform="translate(${fmt(panelX)}, ${fmt(panelY)})">`);
    chunks.push(
      `    <rect x="0" y="0" width="${fmt(chartW)}" height="${fmt(panelH)}" rx="10" fill="${palette.chartPanelBg}" stroke="${palette.dividerStroke}" stroke-width="1.2" />`,
    );
    chunks.push(
      `    <text x="16" y="26" font-size="13" font-weight="700" fill="${palette.textPrimary}">${safeTitle}</text>`,
    );
    chunks.push(
      `    <text x="16" y="45" font-size="11" fill="${palette.textMuted}">명암 톤별 잉크 밀도 비교</text>`,
    );

    let cursorY = 66;
    for (let i = 0; i < bars.length; i += 1) {
      const bar = bars[i];
      const barW = Math.max(0, Math.min(barMaxW, (bar.value / maxDensity) * barMaxW));
      chunks.push(
        `    <text x="16" y="${fmt(cursorY)}" font-size="11" fill="${palette.textPrimary}">${bar.label}</text>`,
      );
      chunks.push(
        `    <text x="${fmt(chartW - 16)}" y="${fmt(cursorY)}" font-size="11" text-anchor="end" fill="${palette.textMuted}">${escapeCrossHatchXml(formatPercent(bar.value))}</text>`,
      );
      chunks.push(
        `    <rect x="16" y="${fmt(cursorY + 6)}" width="${fmt(barMaxW)}" height="12" rx="4" fill="${palette.chartTrackBg}" />`,
      );
      chunks.push(
        `    <rect data-tone-bar="${bar.id}" x="16" y="${fmt(cursorY + 6)}" width="${fmt(barW)}" height="12" rx="4" fill="${bar.fill}" />`,
      );
      cursorY += 38;
    }

    const lc = result.metrics.layerStrokeCounts;
    const metaY = cursorY + 8;
    chunks.push(
      `    <line x1="16" y1="${fmt(metaY - 12)}" x2="${fmt(chartW - 16)}" y2="${fmt(metaY - 12)}" stroke="${palette.dividerStroke}" stroke-width="1" />`,
    );
    chunks.push(
      `    <text x="16" y="${fmt(metaY + 6)}" font-size="11" fill="${palette.textPrimary}">계층 스트로크: 1층 ${lc[1]} · 2층 ${lc[2]} · 3층 ${lc[3]}</text>`,
    );
    chunks.push(
      `    <text x="16" y="${fmt(metaY + 24)}" font-size="11" fill="${palette.textMuted}">실루엣 외곽 침범: ${result.metrics.outsideMaskPointCount}건</text>`,
    );
    chunks.push(
      `    <text x="16" y="${fmt(metaY + 42)}" font-size="11" fill="${palette.textMuted}">해칭 무게중심 X편향: ${fmt(result.metrics.horizontalBiasNormalized)}</text>`,
    );
    chunks.push(`  </g>`);
  }

  chunks.push(`</svg>`);
  return chunks.join("\n");
}

/**
 * 번역투 없는 자연스러운 한국어 흑백/느와르 펜선 디렉터 QA 브리프를 생성한다.
 */
export function summarizeCrossHatchingAuditKo(
  result: CurvatureCrossHatchingResult,
): CrossHatchingAuditReportKo {
  const surfaceLabelKo = SURFACE_LABELS_KO[result.surfacePreset];
  const styleLabelKo = STYLE_LABELS_KO[result.styleId];
  const { metrics } = result;
  const tz = metrics.toneZones;
  const lc = metrics.layerStrokeCounts;

  const silhouetteVerdictKo =
    metrics.outsideMaskPointCount === 0
      ? "실루엣 바깥으로 삐져나온 펜선이 한 점도 없어 외곽선이 깔끔합니다."
      : `실루엣 바깥 침범 정점이 ${metrics.outsideMaskPointCount}건 남아 있어 외곽 클리핑 재검토가 필요합니다.`;

  let toneVerdictKo: string;
  if (metrics.totalStrokeCount === 0) {
    toneVerdictKo = "유효 마스크 영역이 비어 있거나 너무 작아 해칭 스트로크를 배치하지 않았습니다.";
  } else if (tz.monotonicToneOrderPassed) {
    toneVerdictKo = `암부 밀도(${formatPercent(tz.shadowDensity)})가 중간톤(${formatPercent(tz.midtoneDensity)})보다 높고 하이라이트(${formatPercent(tz.highlightDensity)})는 백지로 비워 흑백 양감이 또렷합니다.`;
  } else {
    toneVerdictKo = `암부(${formatPercent(tz.shadowDensity)})·중간톤(${formatPercent(tz.midtoneDensity)})·하이라이트(${formatPercent(tz.highlightDensity)}) 간 밀도 계조가 역전되어 조도 임계치 조정이 필요합니다.`;
  }

  const layerBreakdownKo =
    result.styleId === "noir-parallel-engraving"
      ? `누아르 판화 기준에 맞춰 1층 평행 조각선 ${lc[1]}가닥만 배치했고 교차 계층(2·3층)은 비활성화했습니다.`
      : `1층 기본 빗금 ${lc[1]}가닥, 2층 교차 해칭 ${lc[2]}가닥, 3층 코어 섀도우 ${lc[3]}가닥이 암부 깊이에 따라 차례로 쌓였습니다.`;

  const shadowSideKo =
    metrics.horizontalBiasNormalized > 0.04
      ? "우측 암부"
      : metrics.horizontalBiasNormalized < -0.04
        ? "좌측 암부"
        : "중앙 대칭 구도";

  const headlineKo = `${surfaceLabelKo} · ${styleLabelKo} 펜선 검수 요약 (총 ${metrics.totalStrokeCount}가닥)`;
  const summaryParagraphKo = [
    `${surfaceLabelKo} 위에 ${styleLabelKo} 스타일로 총 ${metrics.totalStrokeCount}가닥의 곡률 추종 펜선을 올렸습니다.`,
    toneVerdictKo,
    `${layerBreakdownKo} 현재 펜선 밀집 중심은 ${shadowSideKo}에 놓여 있으며 ${silhouetteVerdictKo}`,
  ].join(" ");

  const checklistKo: string[] = [
    `실루엣 경계 보존: 외곽 침범 ${metrics.outsideMaskPointCount}건, 비정상 수치 ${metrics.nonFiniteValueCount}건`,
    `톤 계조 단조성: 암부 ${formatPercent(tz.shadowDensity)} > 중간톤 ${formatPercent(tz.midtoneDensity)} > 하이라이트 ${formatPercent(tz.highlightDensity)} (${tz.monotonicToneOrderPassed ? "통과" : "보완 필요"})`,
    `계층 구성: 1층 ${lc[1]} / 2층 ${lc[2]} / 3층 ${lc[3]} (활성 계층 ${metrics.activeLayers.length}단계)`,
    `G펜 양끝 테이퍼: ${metrics.allStrokesTaperedAtEnds ? "모든 스트로크 중앙이 양끝단보다 두꺼움" : "일부 스트로크 테이퍼 확인 필요"}`,
  ];

  return {
    surfacePreset: result.surfacePreset,
    surfaceLabelKo,
    styleId: result.styleId,
    styleLabelKo,
    totalStrokeCount: metrics.totalStrokeCount,
    outsideMaskPointCount: metrics.outsideMaskPointCount,
    toneMonotonicPassed: tz.monotonicToneOrderPassed,
    headlineKo,
    summaryParagraphKo,
    toneVerdictKo,
    silhouetteVerdictKo,
    layerBreakdownKo,
    checklistKo,
  };
}
