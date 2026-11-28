/**
 * Wave 99 — OKLCH 고대비 지연 엔벨로프 SVG 차트 렌더러 및 스튜디오 한국어 감사 요약기.
 *
 * - 원시 hex/rgb 색상을 일절 쓰지 않고 OKLCH 색공간 토큰만 사용
 * - 모든 수치에 유한성 검증을 적용해 NaN/Infinity 출력 0건 보장
 * - 모든 문자열 메타데이터에 엄격한 XML 이스케이프 적용
 */

import type {
  PredictiveInkBenchmarkReport,
  PredictiveScenarioBenchmarkResult,
} from "./reversible-speculative-ink-buffer";

export interface PredictiveInkSvgOptions {
  readonly titleKo?: string;
  readonly width?: number;
}

export interface PredictiveInkLatencySvgResult {
  readonly width: number;
  readonly height: number;
  readonly scenarioPanelCount: number;
  readonly cornerBrakeMarkerCount: number;
  readonly containsNaN: boolean;
  readonly usesOklchOnly: boolean;
  readonly svg: string;
}

export type PredictiveInkReadinessGrade =
  | "출고 적합"
  | "코너 감쇠 점검 권장"
  | "예측 비활성 패스스루";

export interface PredictiveInkSessionSummaryKo {
  readonly refreshTarget: PredictiveInkBenchmarkReport["refreshTarget"];
  readonly readinessGrade: PredictiveInkReadinessGrade;
  readonly headlineKo: string;
  readonly bulletPointsKo: readonly string[];
  readonly markdownKo: string;
}

const SVG_PALETTE = {
  canvasBg: "oklch(0.98 0.008 92)",
  panelBg: "oklch(1 0 0)",
  stripBg: "oklch(0.955 0.01 92)",
  border: "oklch(0.84 0.016 95)",
  gridLine: "oklch(0.91 0.01 94)",
  inkPrimary: "oklch(0.24 0.03 162)",
  inkMuted: "oklch(0.46 0.02 162)",
  groundTruthStroke: "oklch(0.48 0.025 250 / 0.82)",
  delayedRawStroke: "oklch(0.60 0.17 34 / 0.78)",
  committedStroke: "oklch(0.32 0.075 162)",
  speculativeBaseL: 0.54,
  speculativeBaseC: 0.15,
  speculativeBaseH: 215,
  cornerBrakeFill: "oklch(0.56 0.21 26)",
  cornerBrakeStroke: "oklch(0.98 0.008 92)",
  goodBadgeBg: "oklch(0.93 0.04 158)",
  goodBadgeText: "oklch(0.30 0.08 160)",
  warnBadgeBg: "oklch(0.94 0.06 72)",
  warnBadgeText: "oklch(0.42 0.12 45)",
} as const;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safeNum(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function fmt(value: number, digits = 2): string {
  return safeNum(value, 0).toFixed(digits);
}

function speculativeOklch(confidence: number): string {
  const alpha = Math.min(0.96, Math.max(0.18, safeNum(confidence, 0) * 0.92));
  return `oklch(${SVG_PALETTE.speculativeBaseL} ${SVG_PALETTE.speculativeBaseC} ${SVG_PALETTE.speculativeBaseH} / ${fmt(alpha, 2)})`;
}

interface ScenarioBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

function computeScenarioBounds(scenario: PredictiveScenarioBenchmarkResult): ScenarioBounds {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const include = (x: number, y: number): void => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  for (const s of scenario.samples) {
    include(s.groundTruthX, s.groundTruthY);
    include(s.delayedRawX, s.delayedRawY);
    include(s.committedX, s.committedY);
    include(s.predictedTipX, s.predictedTipY);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    return { minX: 0, maxX: 100, minY: 0, maxY: 100 };
  }

  const spanX = Math.max(10, maxX - minX);
  const spanY = Math.max(10, maxY - minY);
  const padX = spanX * 0.1;
  const padY = spanY * 0.14;
  return {
    minX: minX - padX,
    maxX: maxX + padX,
    minY: minY - padY,
    maxY: maxY + padY,
  };
}

function buildPolylinePoints(
  points: readonly { readonly x: number; readonly y: number }[],
): string {
  return points.map((p) => `${fmt(p.x, 1)},${fmt(p.y, 1)}`).join(" ");
}

export function renderPredictiveInkLatencySvg(
  report: PredictiveInkBenchmarkReport,
  options: PredictiveInkSvgOptions = {},
): PredictiveInkLatencySvgResult {
  const width = Math.round(Math.min(1440, Math.max(680, safeNum(options.width ?? 960, 960))));
  const pad = 24;
  const headerHeight = 96;
  const cols = report.scenarios.length <= 1 ? 1 : 2;
  const rows = Math.max(1, Math.ceil(report.scenarios.length / cols));
  const panelGap = 16;
  const panelW = (width - pad * 2 - panelGap * (cols - 1)) / cols;
  const panelH = 228;
  const barStripH = 120;
  const height = Math.round(headerHeight + rows * panelH + (rows - 1) * panelGap + 20 + barStripH + pad);

  const titleText = escapeXml(
    options.titleKo ?? `Wave 99 서브프레임 예측 잉크 지연 엔벨로프 (${report.refreshTarget.toUpperCase()})`,
  );

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${titleText}">`,
  );
  lines.push(
    `  <rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="${SVG_PALETTE.canvasBg}" stroke="${SVG_PALETTE.border}" stroke-width="1"/>`,
  );

  // 상단 헤더 및 핵심 지표 배지
  lines.push(
    `  <text x="${pad}" y="36" fill="${SVG_PALETTE.inkPrimary}" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="700">${titleText}</text>`,
  );
  const subtitle = escapeXml(
    `프레임 예산 ${fmt(report.frameBudgetMs, 2)}ms · 체감 지연 단축 ${fmt(report.lagReductionPercent, 1)}% · 평균 예측 오차 ${fmt(report.meanPredictionErrorPx, 2)}px · 코너 최대 오버슈트 ${fmt(report.maxCornerOvershootPx, 2)}px`,
  );
  lines.push(
    `  <text x="${pad}" y="58" fill="${SVG_PALETTE.inkMuted}" font-family="system-ui, -apple-system, sans-serif" font-size="12">${subtitle}</text>`,
  );

  // 범례 스트립
  const legendY = 78;
  lines.push(
    `  <line x1="${pad}" y1="${legendY}" x2="${pad + 18}" y2="${legendY}" stroke="${SVG_PALETTE.groundTruthStroke}" stroke-width="2" stroke-dasharray="4 3"/>`,
  );
  lines.push(
    `  <text x="${pad + 24}" y="${legendY + 4}" fill="${SVG_PALETTE.inkMuted}" font-family="system-ui, sans-serif" font-size="11">실제 펜 궤적</text>`,
  );
  lines.push(
    `  <line x1="${pad + 114}" y1="${legendY}" x2="${pad + 132}" y2="${legendY}" stroke="${SVG_PALETTE.delayedRawStroke}" stroke-width="2"/>`,
  );
  lines.push(
    `  <text x="${pad + 138}" y="${legendY + 4}" fill="${SVG_PALETTE.inkMuted}" font-family="system-ui, sans-serif" font-size="11">지연 원시 궤적</text>`,
  );
  lines.push(
    `  <line x1="${pad + 236}" y1="${legendY}" x2="${pad + 254}" y2="${legendY}" stroke="${SVG_PALETTE.committedStroke}" stroke-width="2.4"/>`,
  );
  lines.push(
    `  <text x="${pad + 260}" y="${legendY + 4}" fill="${SVG_PALETTE.inkMuted}" font-family="system-ui, sans-serif" font-size="11">확정 커브</text>`,
  );
  lines.push(
    `  <line x1="${pad + 332}" y1="${legendY}" x2="${pad + 350}" y2="${legendY}" stroke="${speculativeOklch(0.9)}" stroke-width="2.4"/>`,
  );
  lines.push(
    `  <text x="${pad + 356}" y="${legendY + 4}" fill="${SVG_PALETTE.inkMuted}" font-family="system-ui, sans-serif" font-size="11">신뢰도 감쇠 예측 꼬리</text>`,
  );
  lines.push(
    `  <circle cx="${pad + 486}" cy="${legendY}" r="4.5" fill="${SVG_PALETTE.cornerBrakeFill}" stroke="${SVG_PALETTE.cornerBrakeStroke}" stroke-width="1"/>`,
  );
  lines.push(
    `  <text x="${pad + 496}" y="${legendY + 4}" fill="${SVG_PALETTE.inkMuted}" font-family="system-ui, sans-serif" font-size="11">코너 브레이크 감쇠</text>`,
  );

  // 시나리오별 궤적 비교 패널
  let cornerBrakeMarkerCount = 0;

  for (let idx = 0; idx < report.scenarios.length; idx += 1) {
    const scenario = report.scenarios[idx];
    if (!scenario) continue;
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const px = pad + col * (panelW + panelGap);
    const py = headerHeight + row * (panelH + panelGap);

    lines.push(
      `  <rect x="${fmt(px, 1)}" y="${fmt(py, 1)}" width="${fmt(panelW, 1)}" height="${panelH}" rx="12" fill="${SVG_PALETTE.panelBg}" stroke="${SVG_PALETTE.border}" stroke-width="1"/>`,
    );

    const panelTitle = escapeXml(scenario.labelKo);
    const panelStats = escapeXml(
      `지연 ${fmt(scenario.rawLatencyLagPx, 2)}→${fmt(scenario.perceivedPredictiveLagPx, 2)}px (${fmt(scenario.lagReductionPercent, 1)}%)`,
    );
    lines.push(
      `  <text x="${fmt(px + 14, 1)}" y="${fmt(py + 22, 1)}" fill="${SVG_PALETTE.inkPrimary}" font-family="system-ui, sans-serif" font-size="13" font-weight="600">${panelTitle}</text>`,
    );
    lines.push(
      `  <text x="${fmt(px + panelW - 14, 1)}" y="${fmt(py + 22, 1)}" text-anchor="end" fill="${SVG_PALETTE.inkMuted}" font-family="system-ui, sans-serif" font-size="11">${panelStats}</text>`,
    );

    const plotX = px + 14;
    const plotY = py + 34;
    const plotW = panelW - 28;
    const plotH = panelH - 54;

    lines.push(
      `  <rect x="${fmt(plotX, 1)}" y="${fmt(plotY, 1)}" width="${fmt(plotW, 1)}" height="${fmt(plotH, 1)}" rx="6" fill="${SVG_PALETTE.stripBg}" stroke="${SVG_PALETTE.gridLine}" stroke-width="1"/>`,
    );

    const bounds = computeScenarioBounds(scenario);
    const spanX = Math.max(1e-3, bounds.maxX - bounds.minX);
    const spanY = Math.max(1e-3, bounds.maxY - bounds.minY);
    const scale = Math.min(plotW / spanX, plotH / spanY);
    const offsetX = plotX + (plotW - spanX * scale) * 0.5;
    const offsetY = plotY + (plotH - spanY * scale) * 0.5;

    const mapPt = (x: number, y: number): { readonly x: number; readonly y: number } => ({
      x: offsetX + (safeNum(x, bounds.minX) - bounds.minX) * scale,
      y: offsetY + (safeNum(y, bounds.minY) - bounds.minY) * scale,
    });

    const gtPts = scenario.samples.map((s) => mapPt(s.groundTruthX, s.groundTruthY));
    const rawPts = scenario.samples.map((s) => mapPt(s.delayedRawX, s.delayedRawY));
    const committedPts = scenario.samples.map((s) => mapPt(s.committedX, s.committedY));

    if (rawPts.length >= 2) {
      lines.push(
        `  <polyline fill="none" stroke="${SVG_PALETTE.delayedRawStroke}" stroke-width="1.6" points="${buildPolylinePoints(rawPts)}"/>`,
      );
    }
    if (gtPts.length >= 2) {
      lines.push(
        `  <polyline fill="none" stroke="${SVG_PALETTE.groundTruthStroke}" stroke-width="1.8" stroke-dasharray="4 3" points="${buildPolylinePoints(gtPts)}"/>`,
      );
    }
    if (committedPts.length >= 2) {
      lines.push(
        `  <polyline fill="none" stroke="${SVG_PALETTE.committedStroke}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" points="${buildPolylinePoints(committedPts)}"/>`,
      );
    }

    // 신뢰도 비례 투기 꼬리 벡터 및 코너 브레이크 표시기
    for (let k = 0; k < scenario.samples.length; k += 1) {
      const s = scenario.samples[k];
      if (!s) continue;
      const head = mapPt(s.committedX, s.committedY);
      const tip = mapPt(s.predictedTipX, s.predictedTipY);
      const tailLen = Math.hypot(tip.x - head.x, tip.y - head.y);
      if (tailLen > 0.6 && k % 2 === 0) {
        lines.push(
          `  <line x1="${fmt(head.x, 1)}" y1="${fmt(head.y, 1)}" x2="${fmt(tip.x, 1)}" y2="${fmt(tip.y, 1)}" stroke="${speculativeOklch(s.confidence)}" stroke-width="2" stroke-linecap="round"/>`,
        );
      }
      if (s.isCornerBrakeActive) {
        cornerBrakeMarkerCount += 1;
        lines.push(
          `  <circle cx="${fmt(head.x, 1)}" cy="${fmt(head.y, 1)}" r="4.2" fill="${SVG_PALETTE.cornerBrakeFill}" stroke="${SVG_PALETTE.cornerBrakeStroke}" stroke-width="1.2"/>`,
        );
      }
    }

    const cleanTag = scenario.zeroSpeculativeLeakageOnCommit ? "커밋 오염 0건" : "커밋 점검 필요";
    const footerLine = escapeXml(
      `오버슈트 ${fmt(scenario.maxCornerOvershootPx, 2)}px · 롤백 ${scenario.totalRollbackCount}회 · ${cleanTag}`,
    );
    lines.push(
      `  <text x="${fmt(px + 14, 1)}" y="${fmt(py + panelH - 6, 1)}" fill="${SVG_PALETTE.inkMuted}" font-family="system-ui, sans-serif" font-size="10.5">${footerLine}</text>`,
    );
  }

  // 하단 시나리오별 지연 비교 바 차트
  const stripY = headerHeight + rows * panelH + (rows - 1) * panelGap + 16;
  const stripW = width - pad * 2;
  lines.push(
    `  <rect x="${pad}" y="${fmt(stripY, 1)}" width="${fmt(stripW, 1)}" height="${barStripH}" rx="12" fill="${SVG_PALETTE.panelBg}" stroke="${SVG_PALETTE.border}" stroke-width="1"/>`,
  );
  lines.push(
    `  <text x="${pad + 14}" y="${fmt(stripY + 22, 1)}" fill="${SVG_PALETTE.inkPrimary}" font-family="system-ui, sans-serif" font-size="12.5" font-weight="600">시나리오별 원시 지연 대 예측 체감 지연 (px)</text>`,
  );

  const maxLag = Math.max(
    1,
    ...report.scenarios.map((s) => Math.max(safeNum(s.rawLatencyLagPx), safeNum(s.perceivedPredictiveLagPx))),
  );
  const barAreaX = pad + 168;
  const barAreaW = Math.max(120, stripW - 260);
  const rowStep = Math.min(22, (barStripH - 36) / Math.max(1, report.scenarios.length));

  for (let i = 0; i < report.scenarios.length; i += 1) {
    const s = report.scenarios[i];
    if (!s) continue;
    const ry = stripY + 34 + i * rowStep;
    const rawW = (safeNum(s.rawLatencyLagPx) / maxLag) * barAreaW;
    const predW = (safeNum(s.perceivedPredictiveLagPx) / maxLag) * barAreaW;

    lines.push(
      `  <text x="${pad + 14}" y="${fmt(ry + 11, 1)}" fill="${SVG_PALETTE.inkMuted}" font-family="system-ui, sans-serif" font-size="11">${escapeXml(s.labelKo)}</text>`,
    );
    lines.push(
      `  <rect x="${fmt(barAreaX, 1)}" y="${fmt(ry + 1, 1)}" width="${fmt(Math.max(2, rawW), 1)}" height="6" rx="3" fill="${SVG_PALETTE.delayedRawStroke}"/>`,
    );
    lines.push(
      `  <rect x="${fmt(barAreaX, 1)}" y="${fmt(ry + 9, 1)}" width="${fmt(Math.max(2, predW), 1)}" height="6" rx="3" fill="${SVG_PALETTE.committedStroke}"/>`,
    );
    lines.push(
      `  <text x="${fmt(barAreaX + barAreaW + 10, 1)}" y="${fmt(ry + 12, 1)}" fill="${SVG_PALETTE.inkPrimary}" font-family="system-ui, sans-serif" font-size="10.5">${fmt(s.rawLatencyLagPx, 2)}→${fmt(s.perceivedPredictiveLagPx, 2)}px</text>`,
    );
  }

  lines.push("</svg>");
  const svg = lines.join("\n");
  const containsNaN = /\b(?:NaN|Infinity)\b/.test(svg);
  const hasRawHexOrRgb = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(/i.test(svg);

  return {
    width,
    height,
    scenarioPanelCount: report.scenarios.length,
    cornerBrakeMarkerCount,
    containsNaN,
    usesOklchOnly: !hasRawHexOrRgb,
    svg,
  };
}

export function summarizePredictiveInkSessionKo(
  report: PredictiveInkBenchmarkReport,
): PredictiveInkSessionSummaryKo {
  let readinessGrade: PredictiveInkReadinessGrade = "출고 적합";
  if (report.passthroughActive) {
    readinessGrade = "예측 비활성 패스스루";
  } else if (!report.zeroSpeculativeLeakageOnCommit || report.maxCornerOvershootPx > 4.0) {
    readinessGrade = "코너 감쇠 점검 권장";
  }

  const refreshLabel = `${report.refreshTarget.toUpperCase()} (${fmt(report.frameBudgetMs, 2)}ms 프레임 예산)`;
  const headlineKo = report.passthroughActive
    ? `${refreshLabel} 기준 예측 비활성 패스스루 모드로 동작하며 투기 잉크 없이 확정 스트로크만 기록했습니다.`
    : `${refreshLabel} 기준 펜 끝 체감 지연을 평균 ${fmt(report.lagReductionPercent, 1)}% 줄였고, 코너 오버슈트를 ${fmt(report.maxCornerOvershootPx, 2)}px 이하로 억제했습니다.`;

  const bulletPointsKo: string[] = [
    `주사율 예산: ${refreshLabel}, 원시 지연 ${fmt(report.rawLatencyLagPx, 2)}px → 예측 체감 지연 ${fmt(report.perceivedPredictiveLagPx, 2)}px (평균 예측 오차 ${fmt(report.meanPredictionErrorPx, 2)}px)`,
    `코너 브레이크 억제: 최대 코너 오버슈트 ${fmt(report.maxCornerOvershootPx, 2)}px (비감쇠 선형 외삽 ${fmt(report.unclampedCornerOvershootPx, 2)}px 대비 초과 돌출 차단)`,
    `확정 스트로크 무결성: ${report.zeroSpeculativeLeakageOnCommit ? "종료 시 투기 꼬리 0건, 확정 히스토리 오염 0건 확인" : "확정 히스토리 오염 여부 재점검 필요"}`,
  ];

  for (const s of report.scenarios) {
    bulletPointsKo.push(
      `시나리오 [${s.labelKo}]: 지연 단축 ${fmt(s.lagReductionPercent, 1)}%, 예측 오차 ${fmt(s.meanPredictionErrorPx, 2)}px, 롤백 ${s.totalRollbackCount}회`,
    );
  }

  const markdownKo = [
    `### Wave 99 서브프레임 예측 잉크 진단 (${readinessGrade})`,
    "",
    headlineKo,
    "",
    ...bulletPointsKo.map((line) => `- ${line}`),
  ].join("\n");

  return {
    refreshTarget: report.refreshTarget,
    readinessGrade,
    headlineKo,
    bulletPointsKo,
    markdownKo,
  };
}
