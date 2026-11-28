/**
 * Wave 154 — 순수 OKLCH 접근성 커버리지·읽기 순서 흐름 SVG 렌더러 및 한국어 접근성 QA 브리프.
 *
 * - 모든 SVG 색상은 CSS Color 4 `oklch(...)` 토큰만 사용한다 (원시 16진수·RGB·HSL 표기 금지).
 * - 컷별 Alt-Text 길이 게이지(220자 목표 / 260자 상한), 대사·효과음 전사 커버리지(%),
 *   ARIA 읽기 흐름 타임라인, KWCAG/WCAG/EAA 적합 배지를 단일 SVG로 출력한다.
 * - 모든 동적 텍스트에 XML/XSS 이스케이프를 적용하고 수치에는 유한수 가드를 적용한다.
 */

import { clampFinite } from "./accessible-alt-sha256";
import type {
  AccessibilityDefectCode,
  EpisodeAccessibilityAuditReport,
  PanelAccessibilityAuditRow,
} from "./accessible-alt-types";

export interface AccessibilityComplianceSvgOptions {
  readonly titleOverrideKo?: string;
  readonly widthPx?: number;
  readonly heightPx?: number;
}

export interface AccessibilitySummaryKoOptions {
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
  warnFill: "oklch(0.952 0.055 78)",
  warnStroke: "oklch(0.620 0.145 72)",
  warnText: "oklch(0.340 0.100 65)",
  failFill: "oklch(0.938 0.056 30)",
  failStroke: "oklch(0.545 0.175 28)",
  failText: "oklch(0.320 0.125 28)",
  barGood: "oklch(0.440 0.118 154)",
  barWarn: "oklch(0.665 0.148 75)",
  barFail: "oklch(0.555 0.180 28)",
  barAccent: "oklch(0.515 0.112 222)",
  deltaBadgeFill: "oklch(0.932 0.034 220)",
  deltaBadgeText: "oklch(0.300 0.080 220)",
  guideTarget: "oklch(0.435 0.122 154)",
  guideBloat: "oklch(0.550 0.178 28)",
  timelineLine: "oklch(0.440 0.080 158 / 0.45)",
} as const;

const DEFECT_LABEL_KO: Readonly<Record<AccessibilityDefectCode, string>> = {
  "missing-panel-alt": "컷 Alt-Text 누락",
  "untranscribed-dialogue": "대사 전사 누락",
  "unexplained-visual-sfx": "효과음 의미 누락",
  "redundant-alt-prefix": "중복 접두사",
  "alt-length-bloat": "Alt 길이 초과",
  "reading-order-gap-or-duplicate": "읽기 순서 오류",
};

const DEFECT_ORDER: readonly AccessibilityDefectCode[] = [
  "missing-panel-alt",
  "untranscribed-dialogue",
  "reading-order-gap-or-duplicate",
  "unexplained-visual-sfx",
  "redundant-alt-prefix",
  "alt-length-bloat",
];

/** XML/SVG 특수문자(`&`, `<`, `>`, `"`, `'`)를 안전하게 이스케이프한다. */
export function escapeAccessibilityXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmtNum(value: number, decimals = 1, fallback = 0): string {
  const safe = Number.isFinite(value) ? value : fallback;
  const factor = Math.pow(10, decimals);
  const rounded = Math.round(safe * factor) / factor;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function fmtPct(value: number): string {
  return `${fmtNum(clampFinite(value, 0, 100, 0), 1)}%`;
}

function verdictStyle(verdict: EpisodeAccessibilityAuditReport["verdict"]): {
  readonly fill: string;
  readonly stroke: string;
  readonly text: string;
  readonly labelKo: string;
} {
  if (verdict === "pass") {
    return {
      fill: OKLCH_PALETTE.passFill,
      stroke: OKLCH_PALETTE.passStroke,
      text: OKLCH_PALETTE.passText,
      labelKo: "KWCAG 2.2 · WCAG 2.2 AA · EAA 적합",
    };
  }
  if (verdict === "pass-with-warnings") {
    return {
      fill: OKLCH_PALETTE.warnFill,
      stroke: OKLCH_PALETTE.warnStroke,
      text: OKLCH_PALETTE.warnText,
      labelKo: "주의 항목 확인 후 출고 가능",
    };
  }
  return {
    fill: OKLCH_PALETTE.failFill,
    stroke: OKLCH_PALETTE.failStroke,
    text: OKLCH_PALETTE.failText,
    labelKo: "출고 차단 (Fail-Closed)",
  };
}

function renderAltGaugePanel(
  report: EpisodeAccessibilityAuditReport,
  panelX: number,
  panelY: number,
  panelW: number,
  panelH: number,
): readonly string[] {
  const out: string[] = [
    `  <g id="panel-alt-length-gauge">`,
    `    <rect x="${fmtNum(panelX)}" y="${fmtNum(panelY)}" width="${fmtNum(panelW)}" height="${fmtNum(panelH)}" rx="12" fill="${OKLCH_PALETTE.cardBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1.2" />`,
    `    <text x="${fmtNum(panelX + 18)}" y="${fmtNum(panelY + 28)}" fill="${OKLCH_PALETTE.inkPrimary}" font-size="14" font-weight="700">1. 컷별 Alt-Text 길이 게이지 (목표 ${String(report.conciseAltTargetChars)}자 / 상한 ${String(report.conciseAltBloatLimitChars)}자)</text>`,
  ];

  const rows = report.panelMetrics.slice(0, 8);
  if (rows.length === 0) {
    out.push(
      `    <text x="${fmtNum(panelX + 18)}" y="${fmtNum(panelY + 72)}" fill="${OKLCH_PALETTE.inkSecondary}" font-size="12">표시할 컷 데이터가 없습니다.</text>`,
      `  </g>`,
    );
    return out;
  }

  const labelW = 68;
  const countW = 78;
  const barX = panelX + 18 + labelW;
  const barW = Math.max(120, panelW - 36 - labelW - countW);
  const scaleMax = Math.max(report.conciseAltBloatLimitChars + 40, report.maxConciseAltChars + 20, 300);

  const chartTop = panelY + 48;
  const rowGap = 6;
  const rowH = Math.min(24, Math.max(14, (panelH - 86 - rowGap * (rows.length - 1)) / rows.length));
  const chartBottom = chartTop + rows.length * rowH + Math.max(0, rows.length - 1) * rowGap;

  const targetX = barX + clampFinite(report.conciseAltTargetChars / scaleMax, 0, 1, 0) * barW;
  const bloatX = barX + clampFinite(report.conciseAltBloatLimitChars / scaleMax, 0, 1, 0) * barW;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const y = chartTop + i * (rowH + rowGap);
    const ratio = clampFinite(row.conciseAltCharCount / scaleMax, 0, 1, 0);
    const fillW = Math.max(row.conciseAltCharCount > 0 ? 4 : 0, ratio * barW);
    const barFill =
      row.conciseAltCharCount === 0 || row.blockerCount > 0
        ? OKLCH_PALETTE.barFail
        : row.conciseAltCharCount > report.conciseAltBloatLimitChars
          ? OKLCH_PALETTE.barFail
          : row.conciseAltCharCount > report.conciseAltTargetChars
            ? OKLCH_PALETTE.barWarn
            : OKLCH_PALETTE.barGood;

    out.push(
      `    <text x="${fmtNum(panelX + 18)}" y="${fmtNum(y + rowH * 0.72)}" fill="${OKLCH_PALETTE.inkPrimary}" font-size="11" font-weight="600">컷 ${escapeAccessibilityXml(String(row.panelIndex))}${row.reusedPreviousSetting ? " Δ" : ""}</text>`,
      `    <rect x="${fmtNum(barX)}" y="${fmtNum(y)}" width="${fmtNum(barW)}" height="${fmtNum(rowH)}" rx="4" fill="${OKLCH_PALETTE.trackBg}" />`,
      `    <rect x="${fmtNum(barX)}" y="${fmtNum(y)}" width="${fmtNum(fillW)}" height="${fmtNum(rowH)}" rx="4" fill="${barFill}" />`,
      `    <text x="${fmtNum(barX + barW + 8)}" y="${fmtNum(y + rowH * 0.72)}" fill="${OKLCH_PALETTE.inkSecondary}" font-size="11">${escapeAccessibilityXml(String(row.conciseAltCharCount))}자</text>`,
    );
  }

  out.push(
    `    <line x1="${fmtNum(targetX)}" y1="${fmtNum(chartTop - 6)}" x2="${fmtNum(targetX)}" y2="${fmtNum(chartBottom + 6)}" stroke="${OKLCH_PALETTE.guideTarget}" stroke-width="1.5" stroke-dasharray="4 3" />`,
    `    <line x1="${fmtNum(bloatX)}" y1="${fmtNum(chartTop - 6)}" x2="${fmtNum(bloatX)}" y2="${fmtNum(chartBottom + 6)}" stroke="${OKLCH_PALETTE.guideBloat}" stroke-width="1.5" stroke-dasharray="4 3" />`,
    `    <text x="${fmtNum(panelX + 18)}" y="${fmtNum(panelY + panelH - 12)}" fill="${OKLCH_PALETTE.inkSecondary}" font-size="10">Δ 연속 컷 중복 배경 생략 적용 · 평균 ${fmtNum(report.averageConciseAltChars, 1)}자 · 최대 ${String(report.maxConciseAltChars)}자</text>`,
    `  </g>`,
  );

  return out;
}

function renderCoveragePanel(
  report: EpisodeAccessibilityAuditReport,
  panelX: number,
  panelY: number,
  panelW: number,
  panelH: number,
): readonly string[] {
  const out: string[] = [
    `  <g id="panel-coverage-metrics">`,
    `    <rect x="${fmtNum(panelX)}" y="${fmtNum(panelY)}" width="${fmtNum(panelW)}" height="${fmtNum(panelH)}" rx="12" fill="${OKLCH_PALETTE.cardBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1.2" />`,
    `    <text x="${fmtNum(panelX + 18)}" y="${fmtNum(panelY + 28)}" fill="${OKLCH_PALETTE.inkPrimary}" font-size="14" font-weight="700">2. 대사·효과음 전사 커버리지 및 6대 결함 현황</text>`,
  ];

  const meters: ReadonlyArray<{ readonly label: string; readonly pct: number; readonly fill: string }> = [
    {
      label: "컷 Alt-Text 커버리지",
      pct: report.altCoveragePercent,
      fill: report.altCoveragePercent >= 100 ? OKLCH_PALETTE.barGood : OKLCH_PALETTE.barFail,
    },
    {
      label: "말풍선 대사 전사율",
      pct: report.dialogueTranscriptionCoveragePercent,
      fill: report.dialogueTranscriptionCoveragePercent >= 100 ? OKLCH_PALETTE.barAccent : OKLCH_PALETTE.barFail,
    },
    {
      label: "시각 효과음 의미 해설률",
      pct: report.sfxSemanticCoveragePercent,
      fill: report.sfxSemanticCoveragePercent >= 100 ? OKLCH_PALETTE.barGood : OKLCH_PALETTE.barWarn,
    },
  ];

  const trackX = panelX + 18;
  const trackW = panelW - 36;
  for (let i = 0; i < meters.length; i += 1) {
    const meter = meters[i];
    const y = panelY + 54 + i * 44;
    const fillW = clampFinite(meter.pct / 100, 0, 1, 0) * trackW;
    out.push(
      `    <text x="${fmtNum(trackX)}" y="${fmtNum(y)}" fill="${OKLCH_PALETTE.inkPrimary}" font-size="11.5" font-weight="600">${escapeAccessibilityXml(meter.label)}</text>`,
      `    <text x="${fmtNum(trackX + trackW)}" y="${fmtNum(y)}" text-anchor="end" fill="${OKLCH_PALETTE.inkPrimary}" font-size="11.5" font-weight="700">${escapeAccessibilityXml(fmtPct(meter.pct))}</text>`,
      `    <rect x="${fmtNum(trackX)}" y="${fmtNum(y + 8)}" width="${fmtNum(trackW)}" height="12" rx="6" fill="${OKLCH_PALETTE.trackBg}" />`,
      `    <rect x="${fmtNum(trackX)}" y="${fmtNum(y + 8)}" width="${fmtNum(fillW)}" height="12" rx="6" fill="${meter.fill}" />`,
    );
  }

  const chipTop = panelY + 194;
  const chipCols = 2;
  const chipGap = 8;
  const chipW = (panelW - 36 - chipGap) / chipCols;
  const chipH = 26;
  for (let idx = 0; idx < DEFECT_ORDER.length; idx += 1) {
    const code = DEFECT_ORDER[idx];
    const count = report.defectCountsByCode[code];
    const col = idx % chipCols;
    const row = Math.floor(idx / chipCols);
    const cx = panelX + 18 + col * (chipW + chipGap);
    const cy = chipTop + row * (chipH + 6);
    const isBlocker =
      code === "missing-panel-alt" ||
      code === "untranscribed-dialogue" ||
      code === "reading-order-gap-or-duplicate";
    const fill =
      count === 0
        ? OKLCH_PALETTE.trackBg
        : isBlocker
          ? OKLCH_PALETTE.failFill
          : OKLCH_PALETTE.warnFill;
    const textFill =
      count === 0
        ? OKLCH_PALETTE.inkSecondary
        : isBlocker
          ? OKLCH_PALETTE.failText
          : OKLCH_PALETTE.warnText;
    out.push(
      `    <rect x="${fmtNum(cx)}" y="${fmtNum(cy)}" width="${fmtNum(chipW)}" height="${fmtNum(chipH)}" rx="6" fill="${fill}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="0.8" />`,
      `    <text x="${fmtNum(cx + 10)}" y="${fmtNum(cy + 17)}" fill="${textFill}" font-size="10.5" font-weight="600">${escapeAccessibilityXml(DEFECT_LABEL_KO[code])}: ${String(count)}건</text>`,
    );
  }

  out.push(`  </g>`);
  return out;
}

function renderAriaTimelinePanel(
  report: EpisodeAccessibilityAuditReport,
  panelX: number,
  panelY: number,
  panelW: number,
  panelH: number,
): readonly string[] {
  const out: string[] = [
    `  <g id="panel-aria-reading-timeline">`,
    `    <rect x="${fmtNum(panelX)}" y="${fmtNum(panelY)}" width="${fmtNum(panelW)}" height="${fmtNum(panelH)}" rx="12" fill="${OKLCH_PALETTE.cardBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1.2" />`,
    `    <text x="${fmtNum(panelX + 18)}" y="${fmtNum(panelY + 28)}" fill="${OKLCH_PALETTE.inkPrimary}" font-size="14" font-weight="700">3. ARIA 읽기 순서 흐름 타임라인 (${escapeAccessibilityXml(report.primaryLocale)})</text>`,
  ];

  const rows: readonly PanelAccessibilityAuditRow[] = report.panelMetrics.slice(0, 10);
  if (rows.length === 0) {
    out.push(
      `    <text x="${fmtNum(panelX + 18)}" y="${fmtNum(panelY + 76)}" fill="${OKLCH_PALETTE.inkSecondary}" font-size="12">ARIA 읽기 노드가 없습니다.</text>`,
      `  </g>`,
    );
    return out;
  }

  const innerX = panelX + 24;
  const innerW = panelW - 48;
  const gap = 12;
  const cardW = Math.min(132, Math.max(76, (innerW - gap * Math.max(0, rows.length - 1)) / rows.length));
  const cardH = 84;
  const cardY = panelY + 52;
  const midY = cardY + cardH * 0.5;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const x = innerX + i * (cardW + gap);
    const fill = row.hasReadingOrderDefect
      ? OKLCH_PALETTE.failFill
      : row.blockerCount > 0
        ? OKLCH_PALETTE.failFill
        : row.warningCount > 0
          ? OKLCH_PALETTE.warnFill
          : OKLCH_PALETTE.passFill;
    const stroke = row.hasReadingOrderDefect || row.blockerCount > 0
      ? OKLCH_PALETTE.failStroke
      : row.warningCount > 0
        ? OKLCH_PALETTE.warnStroke
        : OKLCH_PALETTE.passStroke;

    if (i > 0) {
      const prevEndX = innerX + (i - 1) * (cardW + gap) + cardW;
      out.push(
        `    <line x1="${fmtNum(prevEndX)}" y1="${fmtNum(midY)}" x2="${fmtNum(x)}" y2="${fmtNum(midY)}" stroke="${OKLCH_PALETTE.timelineLine}" stroke-width="2" />`,
      );
    }

    const firstOrd = row.readingOrders.length > 0 ? row.readingOrders[0] : 0;
    const lastOrd = row.readingOrders.length > 0 ? row.readingOrders[row.readingOrders.length - 1] : 0;
    const rangeText = row.readingOrders.length > 0 ? `#${String(firstOrd)}~#${String(lastOrd)}` : "없음";

    out.push(
      `    <rect x="${fmtNum(x)}" y="${fmtNum(cardY)}" width="${fmtNum(cardW)}" height="${fmtNum(cardH)}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="1.2" />`,
      `    <text x="${fmtNum(x + 10)}" y="${fmtNum(cardY + 20)}" fill="${OKLCH_PALETTE.inkPrimary}" font-size="11.5" font-weight="700">컷 ${escapeAccessibilityXml(String(row.panelIndex))}</text>`,
      `    <text x="${fmtNum(x + 10)}" y="${fmtNum(cardY + 38)}" fill="${OKLCH_PALETTE.inkSecondary}" font-size="10">ARIA ${escapeAccessibilityXml(rangeText)}</text>`,
      `    <text x="${fmtNum(x + 10)}" y="${fmtNum(cardY + 55)}" fill="${OKLCH_PALETTE.inkSecondary}" font-size="10">대사 ${String(row.transcribedDialogueCount)}/${String(row.dialogueCount)} · 효과 ${String(row.explainedSfxCount)}/${String(row.sfxCount)}</text>`,
      `    <text x="${fmtNum(x + 10)}" y="${fmtNum(cardY + 72)}" fill="${OKLCH_PALETTE.inkSecondary}" font-size="9.5">노드 ${String(row.ariaNodeCount)}개${row.reusedPreviousSetting ? " · Δ" : ""}</text>`,
    );
  }

  out.push(
    `    <text x="${fmtNum(panelX + 18)}" y="${fmtNum(panelY + panelH - 14)}" fill="${OKLCH_PALETTE.inkSecondary}" font-size="10.5">매니페스트 SHA-256: ${escapeAccessibilityXml(report.accessibilityManifestSha256Hex.slice(0, 16))}… · 검사 로케일: ${escapeAccessibilityXml(report.checkedLocales.join(", "))}</text>`,
    `  </g>`,
  );
  return out;
}

/** 접근성 커버리지·Alt 길이 게이지·ARIA 읽기 순서 흐름을 순수 OKLCH SVG로 렌더링한다. */
export function renderAccessibilityComplianceSvg(
  report: EpisodeAccessibilityAuditReport,
  options?: AccessibilityComplianceSvgOptions,
): string {
  const width = Math.round(clampFinite(options?.widthPx ?? 1160, 760, 1920, 1160));
  const height = Math.round(clampFinite(options?.heightPx ?? 640, 540, 1200, 640));
  const titleText =
    options?.titleOverrideKo && options.titleOverrideKo.trim().length > 0
      ? options.titleOverrideKo.trim()
      : `${report.episodeTitleKo || report.episodeId} — 웹툰 접근성 감사 리포트`;
  const vStyle = verdictStyle(report.verdict);

  const badgeText = `${vStyle.labelKo} (차단 ${String(report.blockerCount)} · 주의 ${String(report.warningCount)})`;
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(width)} ${String(height)}" width="${String(width)}" height="${String(height)}" role="img" aria-label="${escapeAccessibilityXml(titleText)}">`,
    `  <title>${escapeAccessibilityXml(titleText)}</title>`,
    `  <rect x="0" y="0" width="${String(width)}" height="${String(height)}" fill="${OKLCH_PALETTE.canvasBg}" />`,
    `  <rect x="20" y="18" width="${String(width - 40)}" height="80" rx="14" fill="${OKLCH_PALETTE.headerBg}" stroke="${OKLCH_PALETTE.borderStrong}" stroke-width="1.2" />`,
    `  <text x="38" y="48" fill="${OKLCH_PALETTE.inkPrimary}" font-size="18" font-weight="700">${escapeAccessibilityXml(titleText)}</text>`,
    `  <text x="38" y="72" fill="${OKLCH_PALETTE.inkSecondary}" font-size="12">총 ${String(report.totalPanelCount)}컷 · 대사 ${String(report.totalDialogueCount)}건 · 효과음 ${String(report.totalSfxCount)}건 · 연속 배경 생략 ${String(report.antiRedundancySkippedSettingsCount)}회</text>`,
    `  <rect x="${fmtNum(width - 378)}" y="34" width="340" height="44" rx="10" fill="${vStyle.fill}" stroke="${vStyle.stroke}" stroke-width="1.4" />`,
    `  <text x="${fmtNum(width - 208)}" y="61" text-anchor="middle" fill="${vStyle.text}" font-size="12.5" font-weight="700">${escapeAccessibilityXml(badgeText)}</text>`,
  ];

  const halfW = Math.floor((width - 56) / 2);
  lines.push(...renderAltGaugePanel(report, 20, 114, halfW, 316));
  lines.push(...renderCoveragePanel(report, 36 + halfW, 114, width - 56 - halfW, 316));
  lines.push(...renderAriaTimelinePanel(report, 20, 446, width - 40, height - 466));
  lines.push(`</svg>`);

  return lines.join("\n");
}

/** 번역투 없는 실무용 한국어 웹툰 접근성 QA 브리프를 생성한다. */
export function summarizeAccessibilityAuditKo(
  report: EpisodeAccessibilityAuditReport,
  options?: AccessibilitySummaryKoOptions,
): string {
  const verdictHeadline =
    report.verdict === "pass"
      ? "출고 가능 (KWCAG 2.2 · WCAG 2.2 AA · EAA 충족)"
      : report.verdict === "pass-with-warnings"
        ? "주의 항목 확인 후 출고 가능 (차단 결함 없음)"
        : "출고 차단 (Fail-Closed: 차단 결함 해소 필요)";

  const lines: string[] = [
    `# 웹툰 접근성 QA 브리프 — ${report.episodeTitleKo || report.episodeId}`,
    ...(options?.inspectedDateIso ? [`- 점검 일시: ${options.inspectedDateIso}`] : []),
    `- 최종 판정: ${verdictHeadline}`,
    `- 표준 적합 여부: KWCAG 2.2(${report.kwcag22Compliant ? "충족" : "미충족"}) · WCAG 2.2 AA(${report.wcag22AaCompliant ? "충족" : "미충족"}) · EAA(${report.eaaCompliant ? "충족" : "미충족"})`,
    `- 검사 로케일: ${report.checkedLocales.join(", ")} (대표 로케일: ${report.primaryLocale})`,
    `- 핵심 커버리지: 컷 Alt-Text ${fmtPct(report.altCoveragePercent)}, 말풍선 대사 전사 ${fmtPct(report.dialogueTranscriptionCoveragePercent)}, 효과음 의미 해설 ${fmtPct(report.sfxSemanticCoveragePercent)}`,
    `- Alt-Text 길이 요약: 평균 ${fmtNum(report.averageConciseAltChars, 1)}자, 최대 ${String(report.maxConciseAltChars)}자 (권장 ${String(report.conciseAltTargetChars)}자 이하 / 경고 상한 ${String(report.conciseAltBloatLimitChars)}자)`,
    `- 스크린리더 피로 저감: 연속 컷 중복 배경 생략 ${String(report.antiRedundancySkippedSettingsCount)}회 적용`,
    `- 결함 집계: 차단(Blocker) ${String(report.blockerCount)}건, 주의(Warning) ${String(report.warningCount)}건`,
    `- 접근성 매니페스트 SHA-256: ${report.accessibilityManifestSha256Hex}`,
  ];

  if (report.defects.length === 0) {
    lines.push("- 조치 사항: 출고 차단 및 주의 결함 없음. 바로 배포해도 됩니다.");
  } else {
    lines.push("", "## 검출 결함 목록");
    for (let i = 0; i < report.defects.length; i += 1) {
      const defect = report.defects[i];
      const tag = defect.severity === "blocker" ? "[차단]" : "[주의]";
      lines.push(
        `- ${tag} (${defect.code}) 컷 ${String(defect.panelIndex)} / ${defect.locale}: ${defect.messageKo} [${defect.standardRef}]`,
      );
    }
  }

  return lines.join("\n");
}
