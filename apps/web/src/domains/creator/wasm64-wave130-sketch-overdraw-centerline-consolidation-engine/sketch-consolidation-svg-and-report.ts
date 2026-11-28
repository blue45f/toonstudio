/**
 * Wave 130 — 인쇄 안전 순수 OKLCH 러프→클린업 대조 SVG & 한국어 선화 QA 브리프.
 *
 * - 원시 16진수/함수형 색상을 일절 쓰지 않고 순수 oklch(...) 색상만 사용한다.
 * - 배경(연한 흑연 톤)에 다중 겹침 러프 연필선 번들을 배치하고, 전면에 통합된 단일 가변폭
 *   G펜 먹선 폴리곤과 우측 클러스터별 오차·압축률 감사 패널을 렌더링한다.
 * - 모든 텍스트에 XML 특수문자 이스케이프를 적용하고 비유한 좌표(NaN/Infinity)를 차단한다.
 * - 번역투 없는 자연스러운 한국어 선화 클린업 감독 QA 브리프를 생성한다.
 */

import { clampFinite } from "./sketch-consolidation-sha256-and-math";
import type {
  ConsolidatedInkStroke,
  ReferenceCurveAccuracyMetrics,
  SketchConsolidationResult,
  Vec2,
} from "./sketch-consolidation-types";

export type SketchConsolidationSvgTheme = "light" | "dark";

export interface SketchConsolidationSvgOptions {
  readonly title?: string;
  readonly theme?: SketchConsolidationSvgTheme;
  readonly width?: number;
  readonly height?: number;
  readonly showCenterlineGuide?: boolean;
  readonly showRoughUnderlay?: boolean;
}

export interface SketchConsolidationReportKo {
  readonly verdictKo: "통과" | "주의" | "실패";
  readonly orthogonalSafe: boolean;
  readonly headlineKo: string;
  readonly compressionLineKo: string;
  readonly orthogonalGuardLineKo: string;
  readonly robustFittingLineKo: string;
  readonly gpenWidthLineKo: string;
  readonly accuracyLineKo: string | null;
  readonly bulletLinesKo: readonly string[];
  readonly fullTextKo: string;
}

interface ConsolidationOklchPalette {
  readonly canvasBg: string;
  readonly cardBg: string;
  readonly cardBorder: string;
  readonly stageBg: string;
  readonly stageBorder: string;
  readonly panelBg: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly roughPencilStroke: string;
  readonly gpenInkFill: string;
  readonly gpenInkEdge: string;
  readonly centerlineGuide: string;
  readonly safe: string;
  readonly safeBg: string;
  readonly caution: string;
  readonly cautionBg: string;
  readonly danger: string;
  readonly dangerBg: string;
  readonly accentBarBg: string;
  readonly accentBarFill: string;
}

const LIGHT_CONSOLIDATION_PALETTE: ConsolidationOklchPalette = {
  canvasBg: "oklch(0.985 0.006 90)",
  cardBg: "oklch(0.996 0.003 90)",
  cardBorder: "oklch(0.86 0.015 155)",
  stageBg: "oklch(0.992 0.004 92)",
  stageBorder: "oklch(0.90 0.010 92)",
  panelBg: "oklch(0.968 0.008 90)",
  textPrimary: "oklch(0.20 0.020 155)",
  textSecondary: "oklch(0.45 0.016 155)",
  roughPencilStroke: "oklch(0.64 0.045 245 / 0.48)",
  gpenInkFill: "oklch(0.18 0.014 155)",
  gpenInkEdge: "oklch(0.14 0.012 155)",
  centerlineGuide: "oklch(0.56 0.145 38 / 0.72)",
  safe: "oklch(0.42 0.115 155)",
  safeBg: "oklch(0.95 0.025 155)",
  caution: "oklch(0.56 0.145 72)",
  cautionBg: "oklch(0.96 0.030 76)",
  danger: "oklch(0.48 0.180 26)",
  dangerBg: "oklch(0.95 0.034 26)",
  accentBarBg: "oklch(0.90 0.012 155)",
  accentBarFill: "oklch(0.42 0.115 155)",
};

const DARK_CONSOLIDATION_PALETTE: ConsolidationOklchPalette = {
  canvasBg: "oklch(0.16 0.012 155)",
  cardBg: "oklch(0.20 0.015 155)",
  cardBorder: "oklch(0.34 0.022 155)",
  stageBg: "oklch(0.18 0.012 155)",
  stageBorder: "oklch(0.30 0.018 155)",
  panelBg: "oklch(0.23 0.016 155)",
  textPrimary: "oklch(0.95 0.008 92)",
  textSecondary: "oklch(0.76 0.014 150)",
  roughPencilStroke: "oklch(0.70 0.060 238 / 0.42)",
  gpenInkFill: "oklch(0.95 0.008 92)",
  gpenInkEdge: "oklch(0.98 0.005 92)",
  centerlineGuide: "oklch(0.76 0.145 48 / 0.75)",
  safe: "oklch(0.74 0.130 155)",
  safeBg: "oklch(0.26 0.045 155)",
  caution: "oklch(0.80 0.140 76)",
  cautionBg: "oklch(0.28 0.050 74)",
  danger: "oklch(0.72 0.180 26)",
  dangerBg: "oklch(0.28 0.062 26)",
  accentBarBg: "oklch(0.30 0.018 155)",
  accentBarFill: "oklch(0.74 0.130 155)",
};

function fmt(value: number, digits = 2): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toFixed(digits);
}

/**
 * SVG/XML 특수문자(`<`, `>`, `&`, `"`, `'`)를 안전하게 이스케이프한다.
 */
export function escapeSvgXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function computeResultBounds(result: SketchConsolidationResult): {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const visit = (pt: Vec2): void => {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  };

  for (let i = 0; i < result.rawNormalizedStrokes.length; i += 1) {
    const stroke = result.rawNormalizedStrokes[i];
    if (!stroke) continue;
    for (let j = 0; j < stroke.samples.length; j += 1) {
      const sample = stroke.samples[j];
      if (sample) visit(sample);
    }
  }

  for (let i = 0; i < result.inkStrokes.length; i += 1) {
    const ink = result.inkStrokes[i];
    if (!ink) continue;
    for (let j = 0; j < ink.samples.length; j += 1) {
      const sample = ink.samples[j];
      if (!sample) continue;
      visit(sample);
      visit(sample.leftEdge);
      visit(sample.rightEdge);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    return { minX: 0, minY: 0, maxX: 240, maxY: 160 };
  }

  const pad = Math.max(16, result.options.clusterBandwidthPx * 1.1);
  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
  };
}

function buildPolylinePath(points: readonly Vec2[], mapPt: (pt: Vec2) => Vec2): string {
  if (points.length < 2) return "";
  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const pt = points[i];
    if (!pt) continue;
    const mapped = mapPt(pt);
    parts.push(`${i === 0 ? "M" : "L"} ${fmt(mapped.x)} ${fmt(mapped.y)}`);
  }
  return parts.join(" ");
}

function buildGpenRibbonPolygonPath(
  ink: ConsolidatedInkStroke,
  mapPt: (pt: Vec2) => Vec2,
): string {
  if (ink.samples.length < 2) return "";
  const parts: string[] = [];
  for (let i = 0; i < ink.samples.length; i += 1) {
    const s = ink.samples[i];
    if (!s) continue;
    const pt = mapPt(s.leftEdge);
    parts.push(`${i === 0 ? "M" : "L"} ${fmt(pt.x)} ${fmt(pt.y)}`);
  }
  for (let i = ink.samples.length - 1; i >= 0; i -= 1) {
    const s = ink.samples[i];
    if (!s) continue;
    const pt = mapPt(s.rightEdge);
    parts.push(`L ${fmt(pt.x)} ${fmt(pt.y)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

/**
 * 러프 연필선 번들(배경 연한 톤)과 통합 단일 가변폭 G펜 먹선(전면),
 * 클러스터별 오차·압축률 패널을 순수 OKLCH 인쇄 안전 SVG로 렌더링한다.
 */
export function renderSketchConsolidationAuditSvg(
  result: SketchConsolidationResult,
  options?: SketchConsolidationSvgOptions,
): string {
  const theme: SketchConsolidationSvgTheme = options?.theme ?? "light";
  const p = theme === "dark" ? DARK_CONSOLIDATION_PALETTE : LIGHT_CONSOLIDATION_PALETTE;
  const width = Math.round(clampFinite(options?.width ?? 980, 560, 2400, 980));
  const height = Math.round(clampFinite(options?.height ?? 560, 360, 1600, 560));
  const showCenterlineGuide = options?.showCenterlineGuide ?? true;
  const showRoughUnderlay = options?.showRoughUnderlay ?? true;

  const title =
    options?.title ?? "Wave 130 다중 러프 스케치 단일 먹선 통합 & G펜 필압 복원 대조";
  const orthogonalSafe = result.metrics.orthogonalFalseMergeCount === 0;
  const badgeBg = orthogonalSafe ? p.safeBg : p.dangerBg;
  const badgeColor = orthogonalSafe ? p.safe : p.danger;
  const badgeLabel = orthogonalSafe
    ? `직교 오병합 0건 · ${result.metrics.strokeCountBefore}→${result.metrics.strokeCountAfter}선`
    : `직교 오병합 ${result.metrics.orthogonalFalseMergeCount}건 경고`;

  const panelW = Math.min(286, Math.round(width * 0.31));
  const stageX = 28;
  const stageY = 86;
  const stageW = width - panelW - 70;
  const stageH = height - 178;
  const panelX = stageX + stageW + 14;
  const panelY = stageY;
  const panelH = stageH;

  const bounds = computeResultBounds(result);
  const spanX = Math.max(bounds.maxX - bounds.minX, 1);
  const spanY = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = Math.min((stageW - 36) / spanX, (stageH - 36) / spanY);
  const offsetX = stageX + (stageW - spanX * scale) * 0.5 - bounds.minX * scale;
  const offsetY = stageY + (stageH - spanY * scale) * 0.5 - bounds.minY * scale;

  const mapPt = (pt: Vec2): Vec2 => ({
    x: pt.x * scale + offsetX,
    y: pt.y * scale + offsetY,
  });

  const roughPathsSvg = showRoughUnderlay
    ? result.rawNormalizedStrokes
        .map((stroke) => {
          const d = buildPolylinePath(stroke.samples, mapPt);
          if (!d) return "";
          return `<path d="${d}" fill="none" stroke="${p.roughPencilStroke}" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3 2" />`;
        })
        .filter((s) => s.length > 0)
        .join("\n    ")
    : "";

  const gpenPolygonsSvg = result.inkStrokes
    .map((ink) => {
      const d = buildGpenRibbonPolygonPath(ink, mapPt);
      if (!d) return "";
      return `<path d="${d}" fill="${p.gpenInkFill}" stroke="${p.gpenInkEdge}" stroke-width="0.45" stroke-linejoin="round" />`;
    })
    .filter((s) => s.length > 0)
    .join("\n    ");

  const centerlineGuideSvg = showCenterlineGuide
    ? result.inkStrokes
        .map((ink) => {
          const d = buildPolylinePath(ink.samples, mapPt);
          if (!d) return "";
          return `<path d="${d}" fill="none" stroke="${p.centerlineGuide}" stroke-width="0.85" stroke-linecap="round" />`;
        })
        .filter((s) => s.length > 0)
        .join("\n    ")
    : "";

  const maxVisibleCards = Math.max(1, Math.min(5, Math.floor((panelH - 50) / 62)));
  const clusterCardsSvg: string[] = [];
  for (let i = 0; i < Math.min(result.inkStrokes.length, maxVisibleCards); i += 1) {
    const ink = result.inkStrokes[i];
    if (!ink) continue;
    const cardY = panelY + 42 + i * 60;
    const barW = panelW - 28;
    const fillRatio = clampFinite(1 / Math.max(1, ink.sourceStrokeCount), 0.12, 1, 1);
    const barFillW = Math.max(8, barW * (1 - fillRatio * 0.7));
    const cardTitle = `${ink.clusterId} (${ink.sourceStrokeCount}선 → 1선)`;
    const cardMeta = `잔차 ${fmt(ink.huberResidualRmsePx, 2)}px · 끝 ${fmt(ink.tipStartWidthPx, 1)}→중 ${fmt(ink.midWidthPx, 1)}px`;
    const cardTags = `역방향 ${ink.reversedSourceCount} · 삐침억제 ${ink.outlierSuppressedCount}`;
    clusterCardsSvg.push(
      `<rect x="${panelX + 10}" y="${cardY}" width="${panelW - 20}" height="52" rx="8" fill="${p.cardBg}" stroke="${p.stageBorder}" stroke-width="1" />`,
      `<text x="${panelX + 18}" y="${cardY + 17}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="11" font-weight="700" fill="${p.textPrimary}">${escapeSvgXml(cardTitle)}</text>`,
      `<text x="${panelX + 18}" y="${cardY + 32}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="10" fill="${p.textSecondary}">${escapeSvgXml(cardMeta)}</text>`,
      `<text x="${panelX + 18}" y="${cardY + 45}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="9.5" fill="${p.safe}">${escapeSvgXml(cardTags)}</text>`,
      `<rect x="${panelX + panelW - 76}" y="${cardY + 10}" width="58" height="6" rx="3" fill="${p.accentBarBg}" />`,
      `<rect x="${panelX + panelW - 76}" y="${cardY + 10}" width="${fmt(Math.min(58, (barFillW / Math.max(barW, 1)) * 58), 1)}" height="6" rx="3" fill="${p.accentBarFill}" />`,
    );
  }

  if (result.inkStrokes.length === 0) {
    clusterCardsSvg.push(
      `<text x="${panelX + 18}" y="${panelY + 62}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="11" fill="${p.textSecondary}">유효 스트로크가 없어 대기 상태입니다.</text>`,
    );
  }

  const footerY = stageY + stageH + 14;
  const subtitleText = `입력 ${result.metrics.strokeCountBefore}획 → 통합 ${result.metrics.strokeCountAfter}획 (압축 ${fmt(result.metrics.compressionRatio, 2)}배 · 감소 ${fmt(result.metrics.strokeReductionPercent, 1)}%) · 역방향 정렬 ${result.metrics.totalReversedAlignedStrokes}건 · 삐침 억제 ${result.metrics.totalOutlierSuppressedStrokes}건`;
  const footerSummary = `직교 분리 방어 ${result.metrics.orthogonalRejectedPairs}쌍 · 평균 잔차 RMSE ${fmt(result.metrics.meanClusterResidualRmsePx, 2)}px · 끝단/중앙 선폭비 ${fmt(result.metrics.meanTipToMidWidthRatio, 2)} · SHA-256 ${result.consolidatedInkSha256Hex.slice(0, 16)}`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeSvgXml(title)}">`,
    `  <title>${escapeSvgXml(title)}</title>`,
    `  <rect x="0" y="0" width="${width}" height="${height}" fill="${p.canvasBg}" />`,
    `  <rect x="16" y="16" width="${width - 32}" height="${height - 32}" rx="14" fill="${p.cardBg}" stroke="${p.cardBorder}" stroke-width="1.2" />`,
    `  <text x="32" y="45" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="17" font-weight="700" fill="${p.textPrimary}">${escapeSvgXml(title)}</text>`,
    `  <text x="32" y="67" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="11.5" fill="${p.textSecondary}">${escapeSvgXml(subtitleText)}</text>`,
    `  <rect x="${width - 224}" y="26" width="192" height="30" rx="15" fill="${badgeBg}" stroke="${badgeColor}" stroke-width="1.1" />`,
    `  <text x="${width - 128}" y="45" text-anchor="middle" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="11.5" font-weight="700" fill="${badgeColor}">${escapeSvgXml(badgeLabel)}</text>`,
    `  <rect x="${stageX}" y="${stageY}" width="${stageW}" height="${stageH}" rx="10" fill="${p.stageBg}" stroke="${p.stageBorder}" stroke-width="1" />`,
    `  <g data-layer="rough-pencil-underlay">`,
    `    ${roughPathsSvg}`,
    `  </g>`,
    `  <g data-layer="gpen-consolidated-ink">`,
    `    ${gpenPolygonsSvg}`,
    `  </g>`,
    `  <g data-layer="centerline-spine">`,
    `    ${centerlineGuideSvg}`,
    `  </g>`,
    `  <g data-layer="cluster-audit-panel">`,
    `    <rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="10" fill="${p.panelBg}" stroke="${p.stageBorder}" stroke-width="1" />`,
    `    <text x="${panelX + 14}" y="${panelY + 26}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="12" font-weight="700" fill="${p.textPrimary}">클러스터별 오차 · 압축률 (${result.inkStrokes.length}건)</text>`,
    `    ${clusterCardsSvg.join("\n    ")}`,
    `  </g>`,
    `  <rect x="${stageX}" y="${footerY}" width="${width - 56}" height="56" rx="10" fill="${p.panelBg}" stroke="${p.stageBorder}" stroke-width="1" />`,
    `  <text x="${stageX + 14}" y="${footerY + 23}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="11.5" font-weight="600" fill="${p.textPrimary}">${escapeSvgXml(footerSummary)}</text>`,
    `  <line x1="${stageX + 14}" y1="${footerY + 41}" x2="${stageX + 36}" y2="${footerY + 41}" stroke="${p.roughPencilStroke}" stroke-width="2" stroke-dasharray="3 2" />`,
    `  <text x="${stageX + 44}" y="${footerY + 45}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="10.5" fill="${p.textSecondary}">러프 연필선 번들</text>`,
    `  <line x1="${stageX + 158}" y1="${footerY + 41}" x2="${stageX + 180}" y2="${footerY + 41}" stroke="${p.gpenInkFill}" stroke-width="3.5" stroke-linecap="round" />`,
    `  <text x="${stageX + 188}" y="${footerY + 45}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="10.5" fill="${p.textSecondary}">통합 G펜 먹선</text>`,
    `  <line x1="${stageX + 286}" y1="${footerY + 41}" x2="${stageX + 308}" y2="${footerY + 41}" stroke="${p.centerlineGuide}" stroke-width="1.4" />`,
    `  <text x="${stageX + 316}" y="${footerY + 45}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="10.5" fill="${p.textSecondary}">주곡선 중앙선</text>`,
    `</svg>`,
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

/**
 * 번역투 없는 간결한 한국어 선화 클린업 감독 QA 브리프를 작성한다.
 */
export function summarizeSketchConsolidationKo(
  result: SketchConsolidationResult,
  accuracy?: ReferenceCurveAccuracyMetrics,
): SketchConsolidationReportKo {
  const m = result.metrics;
  const orthogonalSafe = m.orthogonalFalseMergeCount === 0;

  let verdictKo: "통과" | "주의" | "실패";
  if (!orthogonalSafe) {
    verdictKo = "실패";
  } else if (m.strokeCountBefore === 0 || (accuracy && !accuracy.passesAccuracyTarget)) {
    verdictKo = "주의";
  } else {
    verdictKo = "통과";
  }

  const headlineKo = `선화 중앙선 통합 QA(${verdictKo}) — 러프 ${m.strokeCountBefore}획 → 먹선 ${m.strokeCountAfter}획(압축 ${fmt(m.compressionRatio, 2)}배) · 직교 오병합 ${m.orthogonalFalseMergeCount}건`;

  const compressionLineKo =
    m.strokeCountBefore === 0
      ? "유효한 입력 스트로크가 없어 통합 대상이 비어 있습니다."
      : `겹쳐 그린 러프 ${m.strokeCountBefore}획을 단일 먹선 ${m.strokeCountAfter}획으로 정리해 획 수를 ${fmt(m.strokeReductionPercent, 1)}% 줄였고, 역방향 왕복 획 ${m.totalReversedAlignedStrokes}건을 기준 방향에 맞춰 자동 반전했습니다.`;

  const orthogonalGuardLineKo = orthogonalSafe
    ? `접선 내적 기준(${fmt(result.options.minTangentCosine, 2)})으로 교차·직교 후보 ${m.orthogonalRejectedPairs}쌍을 분리해 오병합 0건을 유지했습니다.`
    : `직교·교차선 오병합 ${m.orthogonalFalseMergeCount}건이 감지되어 대역폭(${fmt(result.options.clusterBandwidthPx, 1)}px)과 접선 임계값 재조정이 필요합니다.`;

  const robustFittingLineKo = `후버 IRLS(${result.options.irlsIterations}회, δ=${fmt(result.options.huberDeltaPx, 1)}px)로 외곽 삐침 ${m.totalOutlierSuppressedStrokes}건을 억제했고 평균 잔차 RMSE ${fmt(m.meanClusterResidualRmsePx, 2)}px(단독 무훼손 통과 ${m.singleStrokePassthroughCount}획)를 기록했습니다.`;

  const gpenWidthLineKo = `G펜 선폭(${fmt(result.options.gpenBaseWidthPx, 1)}~${fmt(result.options.gpenMaxWidthPx, 1)}px)은 양 끝단 테이퍼(끝/중앙 폭비 ${fmt(m.meanTipToMidWidthRatio, 2)})와 중첩 밀도·곡률 가중치로 복원했습니다.`;

  const accuracyLineKo = accuracy
    ? `참 곡선 기준 중앙선 RMSE ${fmt(accuracy.centerlineRmsePx, 2)}px로 개별 러프 평균 RMSE(${fmt(accuracy.meanRawStrokeRmsePx, 2)}px) 대비 오차를 ${fmt(accuracy.rmseReductionPercent, 1)}% 낮췄습니다.`
    : null;

  const bulletLinesKo: string[] = [
    `□ ${headlineKo}`,
    `  ㅇ ${compressionLineKo}`,
    `  ㅇ ${orthogonalGuardLineKo}`,
    `  ㅇ ${robustFittingLineKo}`,
    `  ㅇ ${gpenWidthLineKo}`,
  ];
  if (accuracyLineKo !== null) {
    bulletLinesKo.push(`  ㅇ ${accuracyLineKo}`);
  }

  return {
    verdictKo,
    orthogonalSafe,
    headlineKo,
    compressionLineKo,
    orthogonalGuardLineKo,
    robustFittingLineKo,
    gpenWidthLineKo,
    accuracyLineKo,
    bulletLinesKo,
    fullTextKo: bulletLinesKo.join("\n"),
  };
}
