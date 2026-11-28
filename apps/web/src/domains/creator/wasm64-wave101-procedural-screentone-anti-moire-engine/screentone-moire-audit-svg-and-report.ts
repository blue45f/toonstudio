/**
 * Wave 101 — 인쇄 안전 고대비 OKLCH 스크린톤·나이퀴스트 모아레 감사 SVG 대시보드 및 한국어 QA 리포트.
 *
 * - 모든 색상은 순수 OKLCH 토큰만 사용한다.
 * - 뷰포트별 나이퀴스트 공간 주파수 막대(0.50 cyc/px 한계선 표기), 단순 축소 vs 안티모아레 맥놀이 분산 저감,
 *   겹침 톤 로제트 각도 컴퍼스를 단일 벡터 대시보드로 출력한다.
 * - 모든 숫자 좌표를 유한수로 보정(0 NaN/Infinity)하고 동적 문자열을 XML 이스케이프한다.
 */

import {
  BAND_LIMIT_START_CYC_PER_PX,
  NYQUIST_LIMIT_CYC_PER_PX,
  clampNumber,
  type MoireRiskLevel,
  type MultiViewportToneSafetyAudit,
  type RecommendedExportProfile,
  type ScreentonePatternKind,
} from "./nyquist-moire-frequency-analyzer";
import type { AntiMoireComparisonResult } from "./anti-moire-screentone-synthesizer-and-wgsl";

export type ScreentoneAuditSvgTheme = "light" | "dark";

export interface ScreentoneAuditSvgOptions {
  readonly title?: string;
  readonly theme?: ScreentoneAuditSvgTheme;
}

export interface ScreentoneAuditReportKo {
  readonly patternLabelKo: string;
  readonly worstRiskLabelKo: string;
  readonly headlineKo: string;
  readonly specLineKo: string;
  readonly viewportRiskSummaryKo: string;
  readonly luminanceConservationKo: string;
  readonly beatSuppressionKo: string;
  readonly stackedAngleNoteKo: string;
  readonly exportRecommendationKo: string;
  readonly bulletLinesKo: readonly string[];
  readonly fullTextKo: string;
}

interface AuditOklchPalette {
  readonly canvasBg: string;
  readonly cardBg: string;
  readonly cardStroke: string;
  readonly gridLine: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly safe: string;
  readonly safeBg: string;
  readonly caution: string;
  readonly cautionBg: string;
  readonly severe: string;
  readonly severeBg: string;
  readonly nyquistWall: string;
  readonly barTrack: string;
  readonly barNaive: string;
  readonly barAntiMoire: string;
  readonly compassRing: string;
  readonly compassDangerFill: string;
  readonly compassLayerA: string;
  readonly compassLayerB: string;
  readonly compassRecommended: string;
}

const LIGHT_OKLCH_PALETTE: AuditOklchPalette = {
  canvasBg: "oklch(0.985 0.006 90)",
  cardBg: "oklch(0.996 0.002 90)",
  cardStroke: "oklch(0.86 0.014 155)",
  gridLine: "oklch(0.91 0.008 95)",
  textPrimary: "oklch(0.22 0.022 155)",
  textSecondary: "oklch(0.45 0.018 155)",
  safe: "oklch(0.44 0.115 155)",
  safeBg: "oklch(0.95 0.024 155)",
  caution: "oklch(0.58 0.145 72)",
  cautionBg: "oklch(0.96 0.032 78)",
  severe: "oklch(0.50 0.185 25)",
  severeBg: "oklch(0.95 0.034 25)",
  nyquistWall: "oklch(0.48 0.205 24)",
  barTrack: "oklch(0.94 0.008 92)",
  barNaive: "oklch(0.56 0.175 28)",
  barAntiMoire: "oklch(0.43 0.115 158)",
  compassRing: "oklch(0.80 0.014 155)",
  compassDangerFill: "oklch(0.54 0.18 25 / 0.16)",
  compassLayerA: "oklch(0.35 0.095 158)",
  compassLayerB: "oklch(0.54 0.175 30)",
  compassRecommended: "oklch(0.48 0.135 235)",
};

const DARK_OKLCH_PALETTE: AuditOklchPalette = {
  canvasBg: "oklch(0.16 0.012 155)",
  cardBg: "oklch(0.20 0.014 155)",
  cardStroke: "oklch(0.34 0.022 155)",
  gridLine: "oklch(0.28 0.015 155)",
  textPrimary: "oklch(0.95 0.008 95)",
  textSecondary: "oklch(0.75 0.014 150)",
  safe: "oklch(0.74 0.135 155)",
  safeBg: "oklch(0.26 0.045 155)",
  caution: "oklch(0.80 0.145 78)",
  cautionBg: "oklch(0.28 0.05 74)",
  severe: "oklch(0.70 0.185 26)",
  severeBg: "oklch(0.28 0.065 25)",
  nyquistWall: "oklch(0.72 0.205 25)",
  barTrack: "oklch(0.26 0.014 155)",
  barNaive: "oklch(0.68 0.18 28)",
  barAntiMoire: "oklch(0.72 0.135 158)",
  compassRing: "oklch(0.42 0.018 155)",
  compassDangerFill: "oklch(0.68 0.18 26 / 0.22)",
  compassLayerA: "oklch(0.76 0.135 158)",
  compassLayerB: "oklch(0.72 0.185 32)",
  compassRecommended: "oklch(0.74 0.14 235)",
};

const PATTERN_LABELS_KO: Record<ScreentonePatternKind, string> = {
  "circle-dot": "원형 망점",
  "diamond-dot": "마름모 망점",
  "line-hatch": "평행 사선 해칭",
  "cross-hatch": "직교 크로스해칭",
  "blue-noise-stipple": "블루노이즈 모래톤",
  "radial-speed-tone": "방사형 집중선 톤",
};

const RISK_LABELS_KO: Record<MoireRiskLevel, string> = {
  safe: "안전",
  caution: "주의",
  "severe-moire": "심각 모아레",
};

const PROFILE_LABELS_KO: Record<RecommendedExportProfile, string> = {
  "print-1bit-halftone": "인쇄용 1비트 해석 망점 유지",
  "hybrid-band-limited-grayscale": "대역제한 혼합 그레이스케일 보정",
  "anti-moire-blue-noise-web": "웹·모바일 안티모아레 대역제한 + 블루노이즈 출력",
};

function fmt(value: number, digits = 2): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toFixed(digits);
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getRiskColor(level: MoireRiskLevel, p: AuditOklchPalette): string {
  if (level === "severe-moire") return p.severe;
  if (level === "caution") return p.caution;
  return p.safe;
}

function getRiskBg(level: MoireRiskLevel, p: AuditOklchPalette): string {
  if (level === "severe-moire") return p.severeBg;
  if (level === "caution") return p.cautionBg;
  return p.safeBg;
}

function polarPoint(cx: number, cy: number, radius: number, angleDeg: number): readonly [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [cx + Math.cos(rad) * radius, cy - Math.sin(rad) * radius];
}

function buildWedgePath(
  cx: number,
  cy: number,
  radius: number,
  startDeg: number,
  endDeg: number,
): string {
  const [x1, y1] = polarPoint(cx, cy, radius, startDeg);
  const [x2, y2] = polarPoint(cx, cy, radius, endDeg);
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${fmt(cx)} ${fmt(cy)} L ${fmt(x1)} ${fmt(y1)} A ${fmt(radius)} ${fmt(radius)} 0 ${largeArc} 0 ${fmt(x2)} ${fmt(y2)} Z`;
}

/**
 * 스크린톤 나이퀴스트 주파수, 안티모아레 맥놀이 저감, 겹침 각도 로제트 컴퍼스를 담은
 * 순수 OKLCH 인쇄 안전 SVG 대시보드를 렌더링한다.
 */
export function renderScreentoneMoireAuditSvg(
  auditReport: MultiViewportToneSafetyAudit,
  comparison: AntiMoireComparisonResult,
  options?: ScreentoneAuditSvgOptions,
): string {
  const theme: ScreentoneAuditSvgTheme = options?.theme ?? "light";
  const p = theme === "dark" ? DARK_OKLCH_PALETTE : LIGHT_OKLCH_PALETTE;
  const title = options?.title ?? "Wave 101 스크린톤 나이퀴스트 모아레 감사 리포트";
  const patternKo = PATTERN_LABELS_KO[auditReport.spec.kind];
  const worstLabelKo = RISK_LABELS_KO[auditReport.worstRiskLevel];

  const width = 920;
  const height = 560;

  // 패널 1: 뷰포트 나이퀴스트 공간 주파수 차트 (좌상단)
  const chartX = 32;
  const chartY = 96;
  const chartW = 540;
  const chartH = 228;
  const barOriginX = chartX + 166;
  const barMaxW = 300;
  const maxCycScale = Math.max(
    1.2,
    ...auditReport.viewports.map((vp) => (Number.isFinite(vp.cyclesPerPixel) ? vp.cyclesPerPixel * 1.1 : 0)),
  );
  const cycToX = (cyc: number): number =>
    barOriginX + clampNumber(cyc / maxCycScale, 0, 1) * barMaxW;
  const nyquistLineX = cycToX(NYQUIST_LIMIT_CYC_PER_PX);
  const bandStartLineX = cycToX(BAND_LIMIT_START_CYC_PER_PX);

  const viewportRowsSvg = auditReport.viewports
    .slice(0, 6)
    .map((vp, idx) => {
      const rowY = chartY + 56 + idx * 36;
      const barW = clampNumber(vp.cyclesPerPixel / maxCycScale, 0, 1) * barMaxW;
      const fill = getRiskColor(vp.riskLevel, p);
      return [
        `<text x="${fmt(chartX + 16)}" y="${fmt(rowY + 15)}" font-size="12" fill="${p.textPrimary}">${escapeXml(vp.viewportLabelKo)}</text>`,
        `<rect x="${fmt(barOriginX)}" y="${fmt(rowY + 2)}" width="${fmt(barMaxW)}" height="18" rx="4" fill="${p.barTrack}" />`,
        `<rect x="${fmt(barOriginX)}" y="${fmt(rowY + 2)}" width="${fmt(Math.max(2, barW))}" height="18" rx="4" fill="${fill}" />`,
        `<text x="${fmt(barOriginX + barMaxW + 8)}" y="${fmt(rowY + 15)}" font-size="11" font-weight="600" fill="${fill}">${fmt(vp.cyclesPerPixel, 2)} cyc/px</text>`,
      ].join("\n    ");
    })
    .join("\n    ");

  // 패널 2: 단순 축소 vs 안티모아레 맥놀이 분산 & 명도 보존 (좌하단)
  const cmpX = 32;
  const cmpY = 344;
  const cmpW = 540;
  const cmpH = 184;
  const maxBeatVar = Math.max(comparison.naiveBeatVariance, comparison.antiMoireBeatVariance, 0.001);
  const cmpBarOriginX = cmpX + 152;
  const cmpBarMaxW = 278;
  const naiveBarW = clampNumber(comparison.naiveBeatVariance / maxBeatVar, 0, 1) * cmpBarMaxW;
  const antiBarW = clampNumber(comparison.antiMoireBeatVariance / maxBeatVar, 0, 1) * cmpBarMaxW;

  // 패널 3: 겹침 각도 로제트 컴퍼스 (우측)
  const compCardX = 592;
  const compCardY = 96;
  const compCardW = 296;
  const compCardH = 432;
  const compassCx = compCardX + compCardW * 0.5;
  const compassCy = compCardY + 178;
  const compassR = 104;

  const angleA = auditReport.spec.angleDeg;
  const stacked = auditReport.stackedAngleAnalysis;
  const angleB = stacked !== null ? stacked.layerB.angleDeg : null;
  const optimalAngle =
    stacked !== null ? stacked.recommendedLayerBAngleDeg : (angleA + 30) % 180;

  const [ax1, ay1] = polarPoint(compassCx, compassCy, compassR, angleA);
  const [ax2, ay2] = polarPoint(compassCx, compassCy, compassR, angleA + 180);
  const [ox1, oy1] = polarPoint(compassCx, compassCy, compassR * 0.92, optimalAngle);
  const [ox2, oy2] = polarPoint(compassCx, compassCy, compassR * 0.92, optimalAngle + 180);

  const clashWedgePrimary = buildWedgePath(compassCx, compassCy, compassR, angleA - 15, angleA + 15);
  const clashWedgeOpposite = buildWedgePath(
    compassCx,
    compassCy,
    compassR,
    angleA + 165,
    angleA + 195,
  );

  let layerBLineSvg = "";
  if (angleB !== null) {
    const [bx1, by1] = polarPoint(compassCx, compassCy, compassR * 0.96, angleB);
    const [bx2, by2] = polarPoint(compassCx, compassCy, compassR * 0.96, angleB + 180);
    layerBLineSvg = `<line x1="${fmt(bx2)}" y1="${fmt(by2)}" x2="${fmt(bx1)}" y2="${fmt(by1)}" stroke="${p.compassLayerB}" stroke-width="2.5" />`;
  }

  const stackedStatusText =
    stacked !== null
      ? `분리각 ${fmt(stacked.effectiveAngleSeparationDeg, 1)}° · 맥놀이 주기 ${fmt(stacked.beatPeriodMm, 2)} mm (${RISK_LABELS_KO[stacked.riskLevel]})`
      : `단일 톤 기준 · 겹침 권장 각도 ${fmt(optimalAngle, 0)}° (30° 로제트)`;

  const specSubtitle = `${patternKo} · ${fmt(auditReport.spec.lpi, 0)} LPI @ ${fmt(auditReport.spec.sourceDpi, 0)} DPI · ${fmt(auditReport.spec.angleDeg, 0)}° · 농도 ${fmt(auditReport.spec.density * 100, 0)}% (도트게인 ${fmt(auditReport.spec.dotGainPercent, 1)}%)`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXml(title)}">`,
    `  <rect x="0" y="0" width="${width}" height="${height}" fill="${p.canvasBg}" />`,
    `  <rect x="20" y="18" width="${width - 40}" height="62" rx="12" fill="${p.cardBg}" stroke="${p.cardStroke}" stroke-width="1" />`,
    `  <text x="36" y="45" font-size="18" font-weight="700" fill="${p.textPrimary}">${escapeXml(title)}</text>`,
    `  <text x="36" y="66" font-size="12" fill="${p.textSecondary}">${escapeXml(specSubtitle)}</text>`,
    `  <rect x="744" y="31" width="136" height="34" rx="8" fill="${getRiskBg(auditReport.worstRiskLevel, p)}" stroke="${getRiskColor(auditReport.worstRiskLevel, p)}" stroke-width="1" />`,
    `  <text x="812" y="53" text-anchor="middle" font-size="13" font-weight="700" fill="${getRiskColor(auditReport.worstRiskLevel, p)}">최고 위험: ${escapeXml(worstLabelKo)}</text>`,
    ``,
    `  <!-- Panel 1: Viewport Nyquist Frequency Bar Chart -->`,
    `  <rect x="${chartX}" y="${chartY}" width="${chartW}" height="${chartH}" rx="12" fill="${p.cardBg}" stroke="${p.cardStroke}" stroke-width="1" />`,
    `  <text x="${chartX + 16}" y="${chartY + 26}" font-size="14" font-weight="700" fill="${p.textPrimary}">뷰포트별 나이퀴스트 공간 주파수 (cycles/px)</text>`,
    `  <text x="${chartX + 16}" y="${chartY + 44}" font-size="11" fill="${p.textSecondary}">0.25 cyc/px부터 대역제한 시작 · 0.50 cyc/px 나이퀴스트 한계선 초과 시 에일리어싱 발생</text>`,
    `  <line x1="${fmt(bandStartLineX)}" y1="${fmt(chartY + 52)}" x2="${fmt(bandStartLineX)}" y2="${fmt(chartY + chartH - 22)}" stroke="${p.caution}" stroke-width="1.25" stroke-dasharray="4 3" />`,
    `  <line x1="${fmt(nyquistLineX)}" y1="${fmt(chartY + 52)}" x2="${fmt(nyquistLineX)}" y2="${fmt(chartY + chartH - 22)}" stroke="${p.nyquistWall}" stroke-width="2" stroke-dasharray="5 3" />`,
    `  <text x="${fmt(bandStartLineX)}" y="${fmt(chartY + chartH - 8)}" text-anchor="middle" font-size="10" fill="${p.caution}">0.25 대역제한</text>`,
    `  <text x="${fmt(nyquistLineX)}" y="${fmt(chartY + chartH - 8)}" text-anchor="middle" font-size="10" font-weight="700" fill="${p.nyquistWall}">0.50 Nyquist 한계</text>`,
    `    ${viewportRowsSvg}`,
    ``,
    `  <!-- Panel 2: Beat Variance Reduction & Tone Conservation -->`,
    `  <rect x="${cmpX}" y="${cmpY}" width="${cmpW}" height="${cmpH}" rx="12" fill="${p.cardBg}" stroke="${p.cardStroke}" stroke-width="1" />`,
    `  <text x="${cmpX + 16}" y="${cmpY + 26}" font-size="14" font-weight="700" fill="${p.textPrimary}">안티모아레 맥놀이 분산 저감 &amp; 지각 명도 보존 (${fmt(comparison.cyclesPerPixel, 2)} cyc/px)</text>`,
    `  <text x="${cmpX + 16}" y="${cmpY + 62}" font-size="12" fill="${p.textPrimary}">단순 점샘플 축소</text>`,
    `  <rect x="${fmt(cmpBarOriginX)}" y="${fmt(cmpY + 49)}" width="${fmt(cmpBarMaxW)}" height="18" rx="4" fill="${p.barTrack}" />`,
    `  <rect x="${fmt(cmpBarOriginX)}" y="${fmt(cmpY + 49)}" width="${fmt(Math.max(2, naiveBarW))}" height="18" rx="4" fill="${p.barNaive}" />`,
    `  <text x="${fmt(cmpBarOriginX + cmpBarMaxW + 8)}" y="${fmt(cmpY + 62)}" font-size="11" fill="${p.barNaive}">var ${fmt(comparison.naiveBeatVariance, 5)}</text>`,
    `  <text x="${cmpX + 16}" y="${cmpY + 96}" font-size="12" fill="${p.textPrimary}">Wave 101 안티모아레</text>`,
    `  <rect x="${fmt(cmpBarOriginX)}" y="${fmt(cmpY + 83)}" width="${fmt(cmpBarMaxW)}" height="18" rx="4" fill="${p.barTrack}" />`,
    `  <rect x="${fmt(cmpBarOriginX)}" y="${fmt(cmpY + 83)}" width="${fmt(Math.max(2, antiBarW))}" height="18" rx="4" fill="${p.barAntiMoire}" />`,
    `  <text x="${fmt(cmpBarOriginX + cmpBarMaxW + 8)}" y="${fmt(cmpY + 96)}" font-size="11" font-weight="700" fill="${p.barAntiMoire}">-${fmt(comparison.beatVarianceReductionPercent, 1)}%</text>`,
    `  <line x1="${cmpX + 16}" y1="${cmpY + 118}" x2="${cmpX + cmpW - 16}" y2="${cmpY + 118}" stroke="${p.gridLine}" stroke-width="1" />`,
    `  <text x="${cmpX + 16}" y="${cmpY + 142}" font-size="12" fill="${p.textPrimary}">목표 잉크 농도: ${fmt(comparison.antiMoireTile.targetDensity * 100, 1)}% · 합성 실측: ${fmt(comparison.antiMoireTile.measuredDensity * 100, 1)}%</text>`,
    `  <text x="${cmpX + 16}" y="${cmpY + 164}" font-size="12" font-weight="600" fill="${comparison.toneConservationPassed ? p.safe : p.severe}">명도 오차(Drift): ${fmt(comparison.antiMoireLuminanceDrift * 100, 2)}% (${comparison.toneConservationPassed ? "허용 기준 2.5% 이내 통과" : "허용 기준 초과"})</text>`,
    ``,
    `  <!-- Panel 3: Stacked-Angle Rosette Compass -->`,
    `  <rect x="${compCardX}" y="${compCardY}" width="${compCardW}" height="${compCardH}" rx="12" fill="${p.cardBg}" stroke="${p.cardStroke}" stroke-width="1" />`,
    `  <text x="${compCardX + 16}" y="${compCardY + 26}" font-size="14" font-weight="700" fill="${p.textPrimary}">겹침 톤 로제트 각도 컴퍼스</text>`,
    `  <text x="${compCardX + 16}" y="${compCardY + 44}" font-size="11" fill="${p.textSecondary}">15° 미만 각도 충돌 경고 · 30° 이상 로제트 권장</text>`,
    `  <circle cx="${fmt(compassCx)}" cy="${fmt(compassCy)}" r="${fmt(compassR)}" fill="none" stroke="${p.compassRing}" stroke-width="1.5" />`,
    `  <circle cx="${fmt(compassCx)}" cy="${fmt(compassCy)}" r="${fmt(compassR * 0.55)}" fill="none" stroke="${p.gridLine}" stroke-width="1" stroke-dasharray="3 3" />`,
    `  <path d="${clashWedgePrimary}" fill="${p.compassDangerFill}" />`,
    `  <path d="${clashWedgeOpposite}" fill="${p.compassDangerFill}" />`,
    `  <line x1="${fmt(ox2)}" y1="${fmt(oy2)}" x2="${fmt(ox1)}" y2="${fmt(oy1)}" stroke="${p.compassRecommended}" stroke-width="2" stroke-dasharray="5 4" />`,
    `  <line x1="${fmt(ax2)}" y1="${fmt(ay2)}" x2="${fmt(ax1)}" y2="${fmt(ay1)}" stroke="${p.compassLayerA}" stroke-width="3" />`,
    layerBLineSvg ? `  ${layerBLineSvg}` : "",
    `  <circle cx="${fmt(compassCx)}" cy="${fmt(compassCy)}" r="4" fill="${p.textPrimary}" />`,
    `  <text x="${fmt(compassCx)}" y="${fmt(compassCy - compassR - 8)}" text-anchor="middle" font-size="10" fill="${p.textSecondary}">90°</text>`,
    `  <text x="${fmt(compassCx + compassR + 14)}" y="${fmt(compassCy + 4)}" text-anchor="middle" font-size="10" fill="${p.textSecondary}">0°</text>`,
    `  <text x="${fmt(compassCx - compassR - 16)}" y="${fmt(compassCy + 4)}" text-anchor="middle" font-size="10" fill="${p.textSecondary}">180°</text>`,
    `  <text x="${compCardX + 16}" y="${compCardY + 324}" font-size="12" font-weight="600" fill="${p.compassLayerA}">— 기준 톤 (Layer A): ${fmt(angleA, 0)}°</text>`,
    `  <text x="${compCardX + 16}" y="${compCardY + 346}" font-size="12" font-weight="600" fill="${p.compassRecommended}">-- 권장 로제트 오프셋: ${fmt(optimalAngle, 0)}°</text>`,
    angleB !== null
      ? `  <text x="${compCardX + 16}" y="${compCardY + 368}" font-size="12" font-weight="600" fill="${p.compassLayerB}">— 겹침 톤 (Layer B): ${fmt(angleB, 0)}°</text>`
      : `  <text x="${compCardX + 16}" y="${compCardY + 368}" font-size="12" fill="${p.textSecondary}">— 겹침 톤 없음 (단일 레이어)</text>`,
    `  <text x="${compCardX + 16}" y="${compCardY + 398}" font-size="11" fill="${p.textPrimary}">${escapeXml(stackedStatusText)}</text>`,
    `</svg>`,
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

/**
 * 번역투 없는 실무형 한국어 스크린톤·모아레 스튜디오 QA 리포트를 생성한다.
 */
export function summarizeScreentoneAuditKo(
  auditReport: MultiViewportToneSafetyAudit,
  comparison: AntiMoireComparisonResult,
): ScreentoneAuditReportKo {
  const spec = auditReport.spec;
  const patternLabelKo = PATTERN_LABELS_KO[spec.kind];
  const worstRiskLabelKo = RISK_LABELS_KO[auditReport.worstRiskLevel];

  const mobileVp = auditReport.viewports.find((v) => v.viewportId === "mobile-360px");
  const webtoonVp = auditReport.viewports.find((v) => v.viewportId === "webtoon-800px");
  const printVp = auditReport.viewports.find((v) => v.viewportId === "print-b5-600dpi");

  const headlineKo =
    auditReport.severeViewportCount > 0
      ? `[${patternLabelKo} ${fmt(spec.lpi, 0)} LPI] 인쇄 원고는 안전하나 모바일·웹툰 축소 시 모아레 위험(${worstRiskLabelKo}) — 안티모아레 필터 필수`
      : `[${patternLabelKo} ${fmt(spec.lpi, 0)} LPI] 전체 출력 해상도 구간에서 모아레 안전 기준 충족 (${worstRiskLabelKo})`;

  const specLineKo = `패턴 ${patternLabelKo}, ${fmt(spec.lpi, 0)} LPI / ${fmt(spec.sourceDpi, 0)} DPI, 각도 ${fmt(spec.angleDeg, 0)}°, 명목 농도 ${fmt(spec.density * 100, 1)}% (도트게인 ${fmt(spec.dotGainPercent, 1)}% 반영 실효 농도 ${fmt(spec.effectiveDensity * 100, 1)}%).`;

  const vpParts: string[] = [];
  if (printVp) {
    vpParts.push(
      `인쇄(${fmt(printVp.cyclesPerPixel, 2)} cyc/px, ${RISK_LABELS_KO[printVp.riskLevel]})`,
    );
  }
  if (webtoonVp) {
    vpParts.push(
      `800px 웹툰(${fmt(webtoonVp.cyclesPerPixel, 2)} cyc/px, ${RISK_LABELS_KO[webtoonVp.riskLevel]})`,
    );
  }
  if (mobileVp) {
    vpParts.push(
      `360px 모바일(${fmt(mobileVp.cyclesPerPixel, 2)} cyc/px, ${RISK_LABELS_KO[mobileVp.riskLevel]})`,
    );
  }
  const viewportRiskSummaryKo =
    vpParts.length > 0
      ? `뷰포트별 진단: ${vpParts.join(" / ")}.`
      : `총 ${auditReport.viewports.length}개 뷰포트 중 안전 ${auditReport.safeViewportCount}건, 주의 ${auditReport.cautionViewportCount}건, 심각 ${auditReport.severeViewportCount}건.`;

  const conservationPct = (1 - comparison.antiMoireLuminanceDrift) * 100;
  const luminanceConservationKo = `지각 명도 보존율 ${fmt(conservationPct, 2)}% (목표 잉크 농도 ${fmt(comparison.antiMoireTile.targetDensity * 100, 1)}% 대비 실측 ${fmt(comparison.antiMoireTile.measuredDensity * 100, 1)}%, 오차 ${fmt(comparison.antiMoireLuminanceDrift * 100, 2)}%).`;

  const beatSuppressionKo = `축소 주파수 ${fmt(comparison.cyclesPerPixel, 2)} cyc/px 기준 단순 점샘플 대비 저주파 맥놀이 분산 ${fmt(comparison.beatVarianceReductionPercent, 1)}% 감쇠 (${fmt(comparison.naiveBeatVariance, 5)} -> ${fmt(comparison.antiMoireBeatVariance, 5)}).`;

  const stacked = auditReport.stackedAngleAnalysis;
  let stackedAngleNoteKo: string;
  if (stacked === null) {
    const suggestedAngle = (spec.angleDeg + 30) % 180;
    stackedAngleNoteKo = `단일 톤 구성. 추후 톤을 겹칠 때는 ${fmt(suggestedAngle, 0)}°(30° 분리) 각도를 권장.`;
  } else if (stacked.riskLevel === "severe-moire") {
    stackedAngleNoteKo = `겹침 각도 충돌 경고: ${fmt(stacked.layerA.angleDeg, 0)}°와 ${fmt(stacked.layerB.angleDeg, 0)}°의 실질 분리각이 ${fmt(stacked.effectiveAngleSeparationDeg, 1)}°에 불과해 ${fmt(stacked.beatPeriodMm, 2)} mm 간격 모아레가 발생함. 두 번째 톤 각도를 ${fmt(stacked.recommendedLayerBAngleDeg, 0)}° 또는 ${fmt(stacked.alternateLayerBAngleDeg, 0)}°로 변경할 것.`;
  } else {
    stackedAngleNoteKo = `겹침 각도 통과: ${fmt(stacked.layerA.angleDeg, 0)}° + ${fmt(stacked.layerB.angleDeg, 0)}°(실질 분리각 ${fmt(stacked.effectiveAngleSeparationDeg, 1)}°) 조합은 안정적인 로제트 패턴을 유지함.`;
  }

  const exportRecommendationKo = `권장 출력 설정 — 인쇄 원고: ${PROFILE_LABELS_KO[auditReport.recommendedPrintProfile]} / 웹·모바일 연재: ${PROFILE_LABELS_KO[auditReport.recommendedWebProfile]}.`;

  const bulletLinesKo: readonly string[] = [
    specLineKo,
    viewportRiskSummaryKo,
    luminanceConservationKo,
    beatSuppressionKo,
    stackedAngleNoteKo,
    exportRecommendationKo,
  ];

  const fullTextKo = [headlineKo, ...bulletLinesKo.map((line) => `- ${line}`)].join("\n");

  return {
    patternLabelKo,
    worstRiskLabelKo,
    headlineKo,
    specLineKo,
    viewportRiskSummaryKo,
    luminanceConservationKo,
    beatSuppressionKo,
    stackedAngleNoteKo,
    exportRecommendationKo,
    bulletLinesKo,
    fullTextKo,
  };
}
