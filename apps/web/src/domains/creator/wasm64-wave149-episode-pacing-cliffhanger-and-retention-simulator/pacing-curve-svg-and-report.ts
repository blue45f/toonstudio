/**
 * Wave 149 — 순수 OKLCH 체류·긴장·피로 파형 SVG 렌더러 및 한국어 스토리 PD 페이싱 브리프.
 *
 * - 모든 색상은 `oklch(...)`만 사용한다(원시 hex, rgb, hsl 사용 금지).
 * - 모든 텍스트·속성에 XML 특수문자 이스케이프를 적용하고 유한 수치만 출력한다.
 * - 한국어 보고서는 번역투를 배제하고 모든 체류 수치가 시뮬레이션 추정치임을 분명히 밝힌다.
 */

import {
  CLIFFHANGER_WINDOW_START,
  MID_EPISODE_WINDOW_END,
  MID_EPISODE_WINDOW_START,
  OPENING_HOOK_WINDOW_END,
  PACING_BOTTLENECK_CODES,
  PACING_BOTTLENECK_LABELS_KO,
  type EpisodeGutterOptimizationResult,
  type EpisodePacingAuditResult,
  type PacingCurveSvgOptions,
  type PacingGrade,
  type RetentionCurveSample,
} from "./episode-pacing-types";

const OKLCH_PALETTE = {
  paperBg: "oklch(0.985 0.006 90)",
  surfaceBg: "oklch(0.996 0.003 90)",
  headerBg: "oklch(0.952 0.012 155)",
  borderStrong: "oklch(0.28 0.042 160)",
  borderSoft: "oklch(0.84 0.014 90)",
  gridLine: "oklch(0.89 0.01 90)",
  textPrimary: "oklch(0.21 0.028 160)",
  textMuted: "oklch(0.45 0.024 160)",
  textInverse: "oklch(0.985 0.004 90)",
  openingZoneWash: "oklch(0.92 0.03 220 / 0.25)",
  midZoneWash: "oklch(0.93 0.035 160 / 0.24)",
  cliffZoneWash: "oklch(0.91 0.055 42 / 0.28)",
  fatigueLowWash: "oklch(0.82 0.06 85 / 0.14)",
  fatigueMidWash: "oklch(0.74 0.13 62 / 0.26)",
  fatigueHighWash: "oklch(0.62 0.19 28 / 0.34)",
  retentionBeforeStroke: "oklch(0.36 0.095 160)",
  retentionAfterStroke: "oklch(0.46 0.14 235)",
  tensionStroke: "oklch(0.55 0.19 38)",
  fatigueStroke: "oklch(0.52 0.17 18)",
  fatigueWallBadgeBg: "oklch(0.5 0.2 26)",
  cliffStrongBadgeBg: "oklch(0.42 0.12 155)",
  cliffWeakBadgeBg: "oklch(0.56 0.16 54)",
  simBadgeBg: "oklch(0.34 0.04 245)",
  gradeSBg: "oklch(0.38 0.12 155)",
  gradeABg: "oklch(0.45 0.12 178)",
  gradeBBg: "oklch(0.54 0.13 84)",
  gradeCBg: "oklch(0.56 0.15 54)",
  gradeDBg: "oklch(0.5 0.2 26)",
  emptyCardBg: "oklch(0.96 0.016 78)",
} as const;

function fmtNum(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function fmtPct(ratio: number): string {
  if (!Number.isFinite(ratio)) return "0.0%";
  const pct = Math.round(ratio * 1000) / 10;
  return `${(Object.is(pct, -0) ? 0 : pct).toFixed(1)}%`;
}

function fmtSec(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0.0초";
  const rounded = Math.round(seconds * 10) / 10;
  return `${(Object.is(rounded, -0) ? 0 : rounded).toFixed(1)}초`;
}

function fmtScore(score: number): string {
  if (!Number.isFinite(score)) return "0.0";
  const rounded = Math.round(score * 10) / 10;
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(1);
}

function truncateText(raw: string, maxChars: number): string {
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, Math.max(1, maxChars - 1))}…`;
}

function gradeBadgeColor(grade: PacingGrade): string {
  if (grade === "S") return OKLCH_PALETTE.gradeSBg;
  if (grade === "A") return OKLCH_PALETTE.gradeABg;
  if (grade === "B") return OKLCH_PALETTE.gradeBBg;
  if (grade === "C") return OKLCH_PALETTE.gradeCBg;
  return OKLCH_PALETTE.gradeDBg;
}

function fatigueBandColor(fatigue: number): string {
  if (fatigue >= 0.62) return OKLCH_PALETTE.fatigueHighWash;
  if (fatigue >= 0.38) return OKLCH_PALETTE.fatigueMidWash;
  return OKLCH_PALETTE.fatigueLowWash;
}

/**
 * SVG 텍스트·속성에 들어가는 XML 특수문자를 안전하게 이스케이프한다.
 */
export function escapePacingXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildCurvePolyline(
  samples: readonly RetentionCurveSample[],
  selector: (sample: RetentionCurveSample) => number,
  plotLeft: number,
  plotTop: number,
  plotWidth: number,
  plotHeight: number,
  prependStartValue?: number,
): string {
  const coords: string[] = [];
  if (prependStartValue !== undefined) {
    const startY = plotTop + (1 - Math.max(0, Math.min(1, prependStartValue))) * plotHeight;
    coords.push(`${fmtNum(plotLeft)},${fmtNum(startY)}`);
  }
  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i];
    if (sample === undefined) continue;
    const x = plotLeft + Math.max(0, Math.min(1, sample.scrollProgress)) * plotWidth;
    const val = Math.max(0, Math.min(1, selector(sample)));
    const y = plotTop + (1 - val) * plotHeight;
    coords.push(`${fmtNum(x)},${fmtNum(y)}`);
  }
  return coords.join(" ");
}

function renderEmptyPacingSvg(
  audit: EpisodePacingAuditResult,
  widthPx: number,
  heightPx: number,
  titleText: string,
): string {
  const safeTitle = escapePacingXml(truncateText(titleText, 64));
  const safeId = escapePacingXml(truncateText(audit.episodeId, 32));
  const safeNotice = escapePacingXml(audit.simulationNoticeKo);
  const safeSha = escapePacingXml(audit.pacingAuditSha256Hex.slice(0, 16));

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmtNum(widthPx)} ${fmtNum(heightPx)}" width="${fmtNum(widthPx)}" height="${fmtNum(heightPx)}" role="img" aria-label="${safeTitle}">`,
    `  <rect x="0" y="0" width="${fmtNum(widthPx)}" height="${fmtNum(heightPx)}" rx="14" fill="${OKLCH_PALETTE.paperBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1.5" />`,
    `  <rect x="20" y="20" width="${fmtNum(widthPx - 40)}" height="60" rx="10" fill="${OKLCH_PALETTE.headerBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
    `  <text x="36" y="47" font-family="Pretendard, sans-serif" font-size="16" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">${safeTitle}</text>`,
    `  <text x="36" y="68" font-family="Pretendard, sans-serif" font-size="11.5" fill="${OKLCH_PALETTE.textMuted}">에피소드 ${safeId} · 컷 데이터 없음</text>`,
    `  <rect x="28" y="106" width="${fmtNum(widthPx - 56)}" height="${fmtNum(Math.max(120, heightPx - 166))}" rx="10" fill="${OKLCH_PALETTE.emptyCardBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
    `  <text x="${fmtNum(widthPx / 2)}" y="${fmtNum(heightPx / 2)}" text-anchor="middle" font-family="Pretendard, sans-serif" font-size="14" font-weight="600" fill="${OKLCH_PALETTE.textPrimary}">시뮬레이션할 컷이 없어 체류·긴장 곡선을 생성하지 않았습니다.</text>`,
    `  <text x="28" y="${fmtNum(heightPx - 24)}" font-family="Pretendard, sans-serif" font-size="10.5" fill="${OKLCH_PALETTE.textMuted}">${safeNotice} · SHA-256 ${safeSha}</text>`,
    `</svg>`,
  ].join("\n");
}

/**
 * 스크롤 진행률(0~100%) 대비 추정 체류 곡선, 긴장도 곡선, 인지 피로 히트밴드,
 * 피로벽·클리프행어 배지를 순수 OKLCH SVG로 렌더링한다.
 */
export function renderEpisodePacingCurvesSvg(
  audit: EpisodePacingAuditResult,
  options?: PacingCurveSvgOptions,
): string {
  const widthPx =
    options?.widthPx !== undefined && Number.isFinite(options.widthPx)
      ? Math.max(640, Math.min(1800, Math.round(options.widthPx)))
      : 960;
  const heightPx =
    options?.heightPx !== undefined && Number.isFinite(options.heightPx)
      ? Math.max(420, Math.min(1200, Math.round(options.heightPx)))
      : 540;

  const titleText =
    options?.titleOverride && options.titleOverride.trim().length > 0
      ? options.titleOverride.trim()
      : `${audit.episodeTitle} — 모바일 스크롤 체류·긴장·피로 파형`;

  const { simulation } = audit;
  if (simulation.totalCutCount === 0) {
    return renderEmptyPacingSvg(audit, widthPx, heightPx, titleText);
  }

  const comparison = options?.optimizedComparison;
  const plotLeft = 72;
  const plotRight = widthPx - 36;
  const plotTop = 128;
  const plotBottom = heightPx - 122;
  const plotWidth = Math.max(200, plotRight - plotLeft);
  const plotHeight = Math.max(160, plotBottom - plotTop);

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmtNum(widthPx)} ${fmtNum(heightPx)}" width="${fmtNum(widthPx)}" height="${fmtNum(heightPx)}" role="img" aria-label="${escapePacingXml(truncateText(titleText, 72))}">`,
  );
  lines.push(
    `  <rect x="0" y="0" width="${fmtNum(widthPx)}" height="${fmtNum(heightPx)}" rx="14" fill="${OKLCH_PALETTE.paperBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1.5" />`,
  );

  // 헤더 배너
  lines.push(
    `  <rect x="20" y="18" width="${fmtNum(widthPx - 40)}" height="72" rx="10" fill="${OKLCH_PALETTE.headerBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
  );
  lines.push(
    `  <text x="36" y="45" font-family="Pretendard, sans-serif" font-size="16" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">${escapePacingXml(truncateText(titleText, 58))}</text>`,
  );
  const subHeader = `에피소드 ${truncateText(audit.episodeId, 24)} · ${simulation.totalCutCount}컷 · ${fmtNum(simulation.totalViewportScreens)}화면 · 예상 체류 ${fmtSec(simulation.totalEstimatedDwellSeconds)} · 추정 완독 ${fmtPct(simulation.estimatedCompletionRetention)}`;
  lines.push(
    `  <text x="36" y="68" font-family="Pretendard, sans-serif" font-size="11.5" fill="${OKLCH_PALETTE.textMuted}">${escapePacingXml(subHeader)}</text>`,
  );

  // 시뮬레이션 추정치 고지 배지 + 페이싱 등급 배지
  const gradeX = widthPx - 134;
  lines.push(
    `  <rect x="${fmtNum(gradeX)}" y="30" width="98" height="46" rx="8" fill="${gradeBadgeColor(audit.pacingGrade)}" />`,
  );
  lines.push(
    `  <text x="${fmtNum(gradeX + 49)}" y="51" text-anchor="middle" font-family="Pretendard, sans-serif" font-size="15" font-weight="700" fill="${OKLCH_PALETTE.textInverse}">등급 ${escapePacingXml(audit.pacingGrade)}</text>`,
  );
  lines.push(
    `  <text x="${fmtNum(gradeX + 49)}" y="68" text-anchor="middle" font-family="Pretendard, sans-serif" font-size="11" fill="${OKLCH_PALETTE.textInverse}">${fmtScore(audit.pacingHealthScore)} / 100</text>`,
  );

  const simPillX = gradeX - 168;
  lines.push(
    `  <rect x="${fmtNum(simPillX)}" y="34" width="156" height="24" rx="12" fill="${OKLCH_PALETTE.simBadgeBg}" />`,
  );
  lines.push(
    `  <text x="${fmtNum(simPillX + 78)}" y="50" text-anchor="middle" font-family="Pretendard, sans-serif" font-size="10.5" font-weight="600" fill="${OKLCH_PALETTE.textInverse}">시뮬레이션 추정치</text>`,
  );

  // 차트 영역 프레임
  lines.push(
    `  <rect x="${fmtNum(plotLeft)}" y="${fmtNum(plotTop)}" width="${fmtNum(plotWidth)}" height="${fmtNum(plotHeight)}" rx="8" fill="${OKLCH_PALETTE.surfaceBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1.2" />`,
  );

  // 3대 핵심 서사 구간 배경 워시(도입 0~15%, 중반 35~65%, 클리프행어 90~100%)
  const openingW = plotWidth * OPENING_HOOK_WINDOW_END;
  const midX = plotLeft + plotWidth * MID_EPISODE_WINDOW_START;
  const midW = plotWidth * (MID_EPISODE_WINDOW_END - MID_EPISODE_WINDOW_START);
  const cliffX = plotLeft + plotWidth * CLIFFHANGER_WINDOW_START;
  const cliffW = plotWidth * (1 - CLIFFHANGER_WINDOW_START);

  lines.push(
    `  <rect x="${fmtNum(plotLeft)}" y="${fmtNum(plotTop)}" width="${fmtNum(openingW)}" height="${fmtNum(plotHeight)}" fill="${OKLCH_PALETTE.openingZoneWash}" />`,
  );
  lines.push(
    `  <rect x="${fmtNum(midX)}" y="${fmtNum(plotTop)}" width="${fmtNum(midW)}" height="${fmtNum(plotHeight)}" fill="${OKLCH_PALETTE.midZoneWash}" />`,
  );
  lines.push(
    `  <rect x="${fmtNum(cliffX)}" y="${fmtNum(plotTop)}" width="${fmtNum(cliffW)}" height="${fmtNum(plotHeight)}" fill="${OKLCH_PALETTE.cliffZoneWash}" />`,
  );

  // 컷별 인지 피로 히트밴드(하단 기준 막대 워시)
  for (let i = 0; i < simulation.cutPoints.length; i += 1) {
    const cut = simulation.cutPoints[i];
    if (cut === undefined) continue;
    const x1 = plotLeft + cut.scrollProgressStart * plotWidth;
    const x2 = plotLeft + cut.scrollProgressEnd * plotWidth;
    const bandW = Math.max(1.5, x2 - x1);
    const bandH = Math.max(2, cut.cognitiveFatigue * plotHeight);
    const bandY = plotBottom - bandH;
    lines.push(
      `  <rect x="${fmtNum(x1)}" y="${fmtNum(bandY)}" width="${fmtNum(bandW)}" height="${fmtNum(bandH)}" fill="${fatigueBandColor(cut.cognitiveFatigue)}" />`,
    );
  }

  // 수평 그리드(0%, 25%, 50%, 75%, 100%)
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  for (let i = 0; i < yTicks.length; i += 1) {
    const tick = yTicks[i];
    if (tick === undefined) continue;
    const y = plotTop + (1 - tick) * plotHeight;
    lines.push(
      `  <line x1="${fmtNum(plotLeft)}" y1="${fmtNum(y)}" x2="${fmtNum(plotRight)}" y2="${fmtNum(y)}" stroke="${OKLCH_PALETTE.gridLine}" stroke-width="1" stroke-dasharray="3 4" />`,
    );
    lines.push(
      `  <text x="${fmtNum(plotLeft - 10)}" y="${fmtNum(y + 4)}" text-anchor="end" font-family="Pretendard, sans-serif" font-size="10.5" fill="${OKLCH_PALETTE.textMuted}">${Math.round(tick * 100)}%</text>`,
    );
  }

  // 수직 그리드 및 스크롤 진행률 라벨
  const xTicks = [0, 0.15, 0.35, 0.5, 0.65, 0.9, 1];
  for (let i = 0; i < xTicks.length; i += 1) {
    const tick = xTicks[i];
    if (tick === undefined) continue;
    const x = plotLeft + tick * plotWidth;
    lines.push(
      `  <line x1="${fmtNum(x)}" y1="${fmtNum(plotTop)}" x2="${fmtNum(x)}" y2="${fmtNum(plotBottom)}" stroke="${OKLCH_PALETTE.gridLine}" stroke-width="1" />`,
    );
    lines.push(
      `  <text x="${fmtNum(x)}" y="${fmtNum(plotBottom + 18)}" text-anchor="middle" font-family="Pretendard, sans-serif" font-size="10.5" fill="${OKLCH_PALETTE.textMuted}">${Math.round(tick * 100)}%</text>`,
    );
  }

  // 구간 상단 라벨
  lines.push(
    `  <text x="${fmtNum(plotLeft + openingW * 0.5)}" y="${fmtNum(plotTop - 8)}" text-anchor="middle" font-family="Pretendard, sans-serif" font-size="10.5" font-weight="600" fill="${OKLCH_PALETTE.textMuted}">도입 훅(0~15%)</text>`,
  );
  lines.push(
    `  <text x="${fmtNum(midX + midW * 0.5)}" y="${fmtNum(plotTop - 8)}" text-anchor="middle" font-family="Pretendard, sans-serif" font-size="10.5" font-weight="600" fill="${OKLCH_PALETTE.textMuted}">중반 반전 구간(35~65%)</text>`,
  );
  lines.push(
    `  <text x="${fmtNum(cliffX + cliffW * 0.5)}" y="${fmtNum(plotTop - 8)}" text-anchor="middle" font-family="Pretendard, sans-serif" font-size="10.5" font-weight="600" fill="${OKLCH_PALETTE.textMuted}">클리프행어</text>`,
  );

  // 파형 폴리라인: 1) 인지 피로, 2) 서사 긴장도, 3) 추정 체류 곡선(최적화 전), 4) 추정 체류 곡선(최적화 후)
  const fatiguePoly = buildCurvePolyline(
    simulation.estimatedRetentionCurve,
    (s) => s.cognitiveFatigue,
    plotLeft,
    plotTop,
    plotWidth,
    plotHeight,
    0.06,
  );
  const tensionPoly = buildCurvePolyline(
    simulation.estimatedRetentionCurve,
    (s) => s.tensionScore,
    plotLeft,
    plotTop,
    plotWidth,
    plotHeight,
  );
  const retentionBeforePoly = buildCurvePolyline(
    simulation.estimatedRetentionCurve,
    (s) => s.estimatedRetention,
    plotLeft,
    plotTop,
    plotWidth,
    plotHeight,
    1,
  );

  lines.push(
    `  <polyline fill="none" stroke="${OKLCH_PALETTE.fatigueStroke}" stroke-width="1.8" stroke-dasharray="4 3" points="${fatiguePoly}" />`,
  );
  lines.push(
    `  <polyline fill="none" stroke="${OKLCH_PALETTE.tensionStroke}" stroke-width="2.2" points="${tensionPoly}" />`,
  );
  lines.push(
    `  <polyline fill="none" stroke="${OKLCH_PALETTE.retentionBeforeStroke}" stroke-width="2.8" points="${retentionBeforePoly}" />`,
  );

  if (comparison !== undefined && comparison.afterAudit.simulation.estimatedRetentionCurve.length > 0) {
    const retentionAfterPoly = buildCurvePolyline(
      comparison.afterAudit.simulation.estimatedRetentionCurve,
      (s) => s.estimatedRetention,
      plotLeft,
      plotTop,
      plotWidth,
      plotHeight,
      1,
    );
    lines.push(
      `  <polyline fill="none" stroke="${OKLCH_PALETTE.retentionAfterStroke}" stroke-width="2.6" stroke-dasharray="7 4" points="${retentionAfterPoly}" />`,
    );
  }

  // 피로벽 구간 배지 및 클리프행어 상태 배지
  const fatigueWalls = audit.findings.filter((f) => f.code === "text-density-fatigue-wall");
  for (let i = 0; i < Math.min(3, fatigueWalls.length); i += 1) {
    const wall = fatigueWalls[i];
    if (wall === undefined) continue;
    const midProgress = (wall.scrollRangeStart + wall.scrollRangeEnd) * 0.5;
    const bx = Math.max(plotLeft + 48, Math.min(plotRight - 48, plotLeft + midProgress * plotWidth));
    const by = plotTop + 14 + i * 24;
    lines.push(
      `  <rect x="${fmtNum(bx - 46)}" y="${fmtNum(by)}" width="92" height="20" rx="10" fill="${OKLCH_PALETTE.fatigueWallBadgeBg}" />`,
    );
    lines.push(
      `  <text x="${fmtNum(bx)}" y="${fmtNum(by + 13.5)}" text-anchor="middle" font-family="Pretendard, sans-serif" font-size="10" font-weight="600" fill="${OKLCH_PALETTE.textInverse}">피로벽 경고</text>`,
    );
  }

  const cliffBadgeBg = audit.hasStrongCliffhanger
    ? OKLCH_PALETTE.cliffStrongBadgeBg
    : OKLCH_PALETTE.cliffWeakBadgeBg;
  const cliffBadgeLabel = audit.hasStrongCliffhanger ? "클리프행어 정상" : "클리프행어 보강";
  const cliffBadgeX = plotRight - 102;
  lines.push(
    `  <rect x="${fmtNum(cliffBadgeX)}" y="${fmtNum(plotTop + 12)}" width="94" height="22" rx="11" fill="${cliffBadgeBg}" />`,
  );
  lines.push(
    `  <text x="${fmtNum(cliffBadgeX + 47)}" y="${fmtNum(plotTop + 26.5)}" text-anchor="middle" font-family="Pretendard, sans-serif" font-size="10" font-weight="600" fill="${OKLCH_PALETTE.textInverse}">${escapePacingXml(cliffBadgeLabel)}</text>`,
  );

  // 하단 범례 및 시뮬레이션 고지 푸터
  const legendY = plotBottom + 44;
  lines.push(
    `  <line x1="72" y1="${fmtNum(legendY)}" x2="96" y2="${fmtNum(legendY)}" stroke="${OKLCH_PALETTE.retentionBeforeStroke}" stroke-width="2.8" />`,
  );
  lines.push(
    `  <text x="104" y="${fmtNum(legendY + 4)}" font-family="Pretendard, sans-serif" font-size="11" fill="${OKLCH_PALETTE.textPrimary}">추정 체류 곡선(최적화 전)</text>`,
  );

  lines.push(
    `  <line x1="258" y1="${fmtNum(legendY)}" x2="282" y2="${fmtNum(legendY)}" stroke="${OKLCH_PALETTE.tensionStroke}" stroke-width="2.2" />`,
  );
  lines.push(
    `  <text x="290" y="${fmtNum(legendY + 4)}" font-family="Pretendard, sans-serif" font-size="11" fill="${OKLCH_PALETTE.textPrimary}">서사 긴장도</text>`,
  );

  lines.push(
    `  <line x1="376" y1="${fmtNum(legendY)}" x2="400" y2="${fmtNum(legendY)}" stroke="${OKLCH_PALETTE.fatigueStroke}" stroke-width="1.8" stroke-dasharray="4 3" />`,
  );
  lines.push(
    `  <text x="408" y="${fmtNum(legendY + 4)}" font-family="Pretendard, sans-serif" font-size="11" fill="${OKLCH_PALETTE.textPrimary}">인지 피로도(히트밴드)</text>`,
  );

  if (comparison !== undefined) {
    lines.push(
      `  <line x1="544" y1="${fmtNum(legendY)}" x2="568" y2="${fmtNum(legendY)}" stroke="${OKLCH_PALETTE.retentionAfterStroke}" stroke-width="2.6" stroke-dasharray="7 4" />`,
    );
    const deltaLabel = `여백 최적화 후 체류(+${fmtPct(Math.max(0, comparison.completionRetentionDelta))})`;
    lines.push(
      `  <text x="576" y="${fmtNum(legendY + 4)}" font-family="Pretendard, sans-serif" font-size="11" font-weight="600" fill="${OKLCH_PALETTE.textPrimary}">${escapePacingXml(deltaLabel)}</text>`,
    );
  }

  const footerText = `${audit.simulationNoticeKo} · 감사 지문 ${audit.pacingAuditSha256Hex.slice(0, 16)}`;
  lines.push(
    `  <text x="24" y="${fmtNum(heightPx - 20)}" font-family="Pretendard, sans-serif" font-size="10.5" fill="${OKLCH_PALETTE.textMuted}">${escapePacingXml(truncateText(footerText, 120))}</text>`,
  );
  lines.push("</svg>");

  return lines.join("\n");
}

/**
 * 번역투 없는 한국어 스토리 PD 페이싱 감사 브리프를 생성한다.
 */
export function summarizeEpisodePacingAuditKo(
  audit: EpisodePacingAuditResult,
  optimization?: EpisodeGutterOptimizationResult,
): string {
  const { simulation } = audit;
  const lines: string[] = [];

  lines.push(`# [PD 페이싱 브리프] ${audit.episodeTitle} (${audit.episodeId})`);
  lines.push("");
  lines.push(`> 안내: ${audit.simulationNoticeKo}`);
  lines.push("");

  if (simulation.totalCutCount === 0) {
    lines.push("- 분석할 컷 데이터가 없어 체류·피로 시뮬레이션을 수행하지 못했습니다.");
    lines.push(`- 감사 무결성 지문(SHA-256): \`${audit.pacingAuditSha256Hex}\``);
    return lines.join("\n");
  }

  lines.push("## 1. 회차 체류·호흡 요약 (시뮬레이션 추정치)");
  lines.push(
    `- 구성 규모: 총 ${simulation.totalCutCount}컷 · 세로 ${simulation.totalScrollHeightPx}px (${fmtNum(simulation.totalViewportScreens)} 모바일 화면, 기준 ${simulation.viewport.viewportWidthPx}×${simulation.viewport.viewportHeightPx}px)`,
  );
  lines.push(`- 예상 독서 체류 시간: ${fmtSec(simulation.totalEstimatedDwellSeconds)}`);
  lines.push(
    `- 페이싱 건강도: ${fmtScore(audit.pacingHealthScore)}점 (등급 ${audit.pacingGrade}) · 추정 완독 잔존율 ${fmtPct(simulation.estimatedCompletionRetention)} · 다음 화 클릭 성향 추정치 ${fmtPct(simulation.estimatedNextEpisodeClickPropensity)}`,
  );
  lines.push(
    `- 대사 밀도·인지 피로: 평균 ${fmtNum(simulation.averageCharsPerViewportScreen)}자/화면 (최대 ${fmtNum(simulation.maxCharsPerViewportScreen)}자/화면) · 최대 인지 피로 ${fmtPct(simulation.peakCognitiveFatigue)}`,
  );
  lines.push(
    `- 구간별 긴장 정점: 도입(0~15%) ${fmtPct(audit.openingHookTensionPeak)} · 중반(35~65%) ${fmtPct(audit.midEpisodeTensionPeak)} · 클리프행어(90~100%) ${fmtPct(audit.cliffhangerTensionPeak)}`,
  );
  lines.push("");

  lines.push("## 2. 5대 페이싱 병목 점검 결과");
  if (audit.findings.length === 0) {
    lines.push("- 주요 페이싱 병목이 감지되지 않았습니다. 호흡 여백과 클리프행어 배치가 안정적입니다.");
  } else {
    for (let i = 0; i < PACING_BOTTLENECK_CODES.length; i += 1) {
      const code = PACING_BOTTLENECK_CODES[i];
      if (code === undefined) continue;
      const count = audit.findingCountsByCode[code];
      if (count > 0) {
        lines.push(`- ${PACING_BOTTLENECK_LABELS_KO[code]}: ${count}건`);
      }
    }
    lines.push("");
    for (let i = 0; i < audit.findings.length; i += 1) {
      const finding = audit.findings[i];
      if (finding === undefined) continue;
      const severityKo =
        finding.severity === "high" ? "높음" : finding.severity === "medium" ? "보통" : "낮음";
      lines.push(
        `  ${i + 1}. [${severityKo}] ${finding.titleKo} — ${finding.descriptionKo} 권고: ${finding.recommendationKo}`,
      );
    }
  }

  if (optimization !== undefined) {
    lines.push("");
    lines.push("## 3. 비파괴 여백·호흡 리플로우 개선 결과 (시뮬레이션 추정치)");
    lines.push(
      `- 여백 조정: ${optimization.adjustments.length}개 컷 하단 거터 확장 (총 +${optimization.totalAddedGutterPx}px, 대사·작화 순서 비파괴 유지)`,
    );
    lines.push(
      `- 최대 인지 피로 변화: ${fmtPct(optimization.beforeAudit.simulation.peakCognitiveFatigue)} → ${fmtPct(optimization.afterAudit.simulation.peakCognitiveFatigue)} (감소폭 ${fmtPct(optimization.peakFatigueReduction)})`,
    );
    lines.push(
      `- 추정 완독 잔존율 변화: ${fmtPct(optimization.beforeAudit.simulation.estimatedCompletionRetention)} → ${fmtPct(optimization.afterAudit.simulation.estimatedCompletionRetention)} (변화 ${optimization.completionRetentionDelta >= 0 ? "+" : ""}${fmtPct(optimization.completionRetentionDelta)})`,
    );
    lines.push(
      `- 좁은 거터 결함 해소: ${optimization.crampedGutterFindingsBefore}건 → ${optimization.crampedGutterFindingsAfter}건`,
    );
  }

  lines.push("");
  lines.push(`- 감사 무결성 지문(SHA-256): \`${audit.pacingAuditSha256Hex}\``);

  return lines.join("\n");
}
