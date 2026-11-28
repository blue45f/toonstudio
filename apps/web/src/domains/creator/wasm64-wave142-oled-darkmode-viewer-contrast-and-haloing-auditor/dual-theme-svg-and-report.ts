/**
 * Wave 142 — 순수 OKLCH 라이트 vs OLED 다크 분할 검수 SVG 렌더러 및 한국어 출고 QA 브리프.
 *
 * - 원시 hex / rgb / hsl 색상을 배제하고 100% `oklch(...)` 팔레트만 출력
 * - 좌측 라이트 페이퍼 / 우측 OLED 트루블랙 분할 프리뷰 + 컷별 휘도 충격 곡선 + 보정 전/후 대비 배지
 * - XML/XSS 안전 이스케이프 및 NaN/Infinity 0건 보장
 * - 번역투 없는 한국어 웹툰 출고 검수 브리프 작성
 */

import type {
  AuditedEpisodeCut,
  DualThemeDefectCode,
  DualThemeRemediationResult,
  ElementAuditSummary,
} from "./dual-theme-visibility-auditor";
import { formatOklchCss, srgbToOklchCss } from "./viewer-contrast-and-apca-math";

export interface DualThemeAuditSvgOptions {
  readonly title?: string;
  readonly width?: number;
  readonly showRemediationPreview?: boolean;
}

export interface DualThemeQaReportKo {
  readonly episodeId: string;
  readonly episodeTitleKo: string;
  readonly releaseStatus: "ready-for-export" | "remediated-ready" | "action-required";
  readonly headlineKo: string;
  readonly summaryParagraphKo: string;
  readonly defectBreakdownKo: readonly string[];
  readonly themeReadinessKo: readonly string[];
  readonly appliedFixesKo: readonly string[];
  readonly checklistKo: readonly string[];
  readonly auditSha256Short: string;
}

interface DualThemeOklchPalette {
  readonly canvasBg: string;
  readonly cardBg: string;
  readonly cardBorder: string;
  readonly headerBg: string;
  readonly lightViewerBg: string;
  readonly oledViewerBg: string;
  readonly viewerBezel: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly textOnDark: string;
  readonly textMutedOnDark: string;
  readonly passBg: string;
  readonly passFg: string;
  readonly warnBg: string;
  readonly warnFg: string;
  readonly failBg: string;
  readonly failFg: string;
  readonly curveBeforeStroke: string;
  readonly curveAfterStroke: string;
  readonly shockBandFill: string;
  readonly gridLine: string;
  readonly accentSplit: string;
}

const OKLCH_PALETTE: DualThemeOklchPalette = {
  canvasBg: "oklch(0.975 0.005 90)",
  cardBg: "oklch(0.995 0.003 92)",
  cardBorder: "oklch(0.86 0.01 90)",
  headerBg: "oklch(0.24 0.032 162)",
  lightViewerBg: "oklch(0.998 0.001 95)",
  oledViewerBg: "oklch(0.02 0.002 260)",
  viewerBezel: "oklch(0.76 0.012 90)",
  textPrimary: "oklch(0.2 0.014 255)",
  textSecondary: "oklch(0.45 0.014 255)",
  textOnDark: "oklch(0.96 0.006 90)",
  textMutedOnDark: "oklch(0.76 0.012 250)",
  passBg: "oklch(0.93 0.045 155)",
  passFg: "oklch(0.32 0.09 155)",
  warnBg: "oklch(0.94 0.055 78)",
  warnFg: "oklch(0.42 0.11 65)",
  failBg: "oklch(0.93 0.05 24)",
  failFg: "oklch(0.44 0.15 24)",
  curveBeforeStroke: "oklch(0.55 0.19 25)",
  curveAfterStroke: "oklch(0.48 0.13 158)",
  shockBandFill: "oklch(0.88 0.065 26 / 0.35)",
  gridLine: "oklch(0.88 0.008 90)",
  accentSplit: "oklch(0.52 0.11 162)",
};

const DEFECT_CODE_LABELS_KO: Readonly<Record<DualThemeDefectCode, string>> = {
  "dark-mode-ink-vanish": "다크·OLED 먹선 매몰",
  "light-mode-highlight-vanish": "라이트모드 밝은 효과음 유실",
  "oled-black-crush-shadow": "OLED 암부 윤곽 뭉개짐",
  "luminance-shock-transition": "야간→순백 눈부심 충격",
  "balloon-text-contrast-fail": "말풍선 대사 대비 미달",
};

/** XML/SVG 특수문자를 이스케이프해 마크업 주입과 XSS를 차단한다. */
export function escapeDualThemeXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmtNum(value: number, digits = 2, fallback = 0): string {
  const safe = Number.isFinite(value) ? value : fallback;
  return safe.toFixed(digits);
}

function lumaToCutOklch(meanLuma: number): string {
  const safe = Number.isFinite(meanLuma) ? Math.min(1, Math.max(0, meanLuma)) : 0.5;
  const l = Math.min(0.99, Math.max(0.06, Math.cbrt(safe)));
  return formatOklchCss({ l, c: 0.012, h: 250 });
}

function renderViewerStrip(
  cuts: readonly AuditedEpisodeCut[],
  x: number,
  y: number,
  width: number,
  height: number,
  isOled: boolean,
  layerName: string,
  titleKo: string,
): string {
  const bgFill = isOled ? OKLCH_PALETTE.oledViewerBg : OKLCH_PALETTE.lightViewerBg;
  const headerFill = isOled ? OKLCH_PALETTE.textOnDark : OKLCH_PALETTE.textPrimary;
  const subFill = isOled ? OKLCH_PALETTE.textMutedOnDark : OKLCH_PALETTE.textSecondary;
  const lines: string[] = [
    `  <g data-layer="${layerName}" transform="translate(${fmtNum(x)}, ${fmtNum(y)})">`,
    `    <rect x="0" y="0" width="${fmtNum(width)}" height="${fmtNum(height)}" rx="12" fill="${bgFill}" stroke="${OKLCH_PALETTE.viewerBezel}" stroke-width="1.5" />`,
    `    <text x="14" y="24" font-size="12" font-weight="700" fill="${headerFill}">${escapeDualThemeXml(titleKo)}</text>`,
    `    <text x="14" y="40" font-size="10" fill="${subFill}">${isOled ? "야간 OLED 트루블랙 배경 기준" : "주간 라이트 페이퍼 배경 기준"}</text>`,
  ];

  const stripTop = 52;
  const innerPad = 14;
  const innerW = Math.max(80, width - innerPad * 2);
  const availH = Math.max(120, height - stripTop - 16);
  const visibleCuts = cuts.slice(0, 5);
  const cutCount = Math.max(1, visibleCuts.length);
  const gutterH = 14;
  const cutH = Math.max(36, (availH - gutterH * Math.max(0, cutCount - 1)) / cutCount);

  for (let i = 0; i < visibleCuts.length; i += 1) {
    const cut = visibleCuts[i];
    if (!cut) continue;
    const cy = stripTop + i * (cutH + gutterH);

    if (i > 0 && cut.appliedGutterRamp && cut.appliedGutterRamp.gradientStopsOklch.length >= 2) {
      const stops = cut.appliedGutterRamp.gradientStopsOklch;
      const segH = gutterH / stops.length;
      for (let s = 0; s < stops.length; s += 1) {
        const stopColor = stops[s] ?? OKLCH_PALETTE.gridLine;
        lines.push(
          `    <rect data-ramp-gutter="${escapeDualThemeXml(cut.cutId)}" x="${fmtNum(innerPad)}" y="${fmtNum(cy - gutterH + s * segH)}" width="${fmtNum(innerW)}" height="${fmtNum(segH + 0.4)}" fill="${stopColor}" />`,
        );
      }
    }

    const panelFill = cut.cutBaseColor
      ? srgbToOklchCss(cut.cutBaseColor)
      : lumaToCutOklch(cut.meanLuma);
    const borderStroke = isOled ? "oklch(0.38 0.014 250)" : "oklch(0.75 0.01 90)";
    lines.push(
      `    <rect x="${fmtNum(innerPad)}" y="${fmtNum(cy)}" width="${fmtNum(innerW)}" height="${fmtNum(cutH)}" rx="4" fill="${panelFill}" stroke="${borderStroke}" stroke-width="1" />`,
    );

    const cutLabelColor =
      cut.meanLuma < 0.35 ? OKLCH_PALETTE.textOnDark : OKLCH_PALETTE.textPrimary;
    lines.push(
      `    <text x="${fmtNum(innerPad + 8)}" y="${fmtNum(cy + 15)}" font-size="9.5" font-weight="600" fill="${cutLabelColor}">${escapeDualThemeXml(cut.labelKo)} (Y=${fmtNum(cut.meanLuma, 2)})</text>`,
    );

    const elems = cut.elements.slice(0, 3);
    for (let e = 0; e < elems.length; e += 1) {
      const el = elems[e];
      if (!el) continue;
      const pillW = Math.min(130, (innerW - 16) / Math.max(1, elems.length) - 4);
      const pillX = innerPad + 8 + e * (pillW + 4);
      const pillY = cy + Math.max(19, cutH - 22);
      const pillH = 17;

      const fgCss = srgbToOklchCss(el.foreground, el.foreground.a);
      if (el.existingPlate) {
        const plateCss =
          el.existingPlate.oklchCss ??
          srgbToOklchCss(el.existingPlate.color, el.existingPlate.color.a);
        lines.push(
          `    <rect data-remediation="plate" x="${fmtNum(pillX - 2)}" y="${fmtNum(pillY - 1)}" width="${fmtNum(pillW + 4)}" height="${fmtNum(pillH + 2)}" rx="4" fill="${plateCss}" />`,
        );
      } else if (el.existingHalo) {
        const haloCss =
          el.existingHalo.oklchCss ??
          srgbToOklchCss(el.existingHalo.color, el.existingHalo.color.a);
        lines.push(
          `    <rect data-remediation="halo" x="${fmtNum(pillX)}" y="${fmtNum(pillY)}" width="${fmtNum(pillW)}" height="${fmtNum(pillH)}" rx="4" fill="none" stroke="${haloCss}" stroke-width="${fmtNum(Math.min(3.2, el.existingHalo.widthPx))}" />`,
        );
      }

      const textFill = el.existingGlaze ? el.existingGlaze.oklchCss : fgCss;
      lines.push(
        `    <text x="${fmtNum(pillX + 5)}" y="${fmtNum(pillY + 12)}" font-size="9" font-weight="700" fill="${textFill}">${escapeDualThemeXml(el.labelKo.slice(0, 12))}</text>`,
      );
    }
  }

  lines.push("  </g>");
  return lines.join("\n");
}

function renderLuminanceShockCurve(
  result: DualThemeRemediationResult,
  x: number,
  y: number,
  width: number,
  height: number,
): string {
  const cuts = result.remediatedInput.cuts;
  const padL = 44;
  const padR = 18;
  const padT = 36;
  const padB = 26;
  const plotW = Math.max(80, width - padL - padR);
  const plotH = Math.max(60, height - padT - padB);

  const lines: string[] = [
    `  <g data-layer="luminance-shock-curve" transform="translate(${fmtNum(x)}, ${fmtNum(y)})">`,
    `    <rect x="0" y="0" width="${fmtNum(width)}" height="${fmtNum(height)}" rx="10" fill="${OKLCH_PALETTE.cardBg}" stroke="${OKLCH_PALETTE.cardBorder}" stroke-width="1.2" />`,
    `    <text x="14" y="22" font-size="12" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">컷별 휘도 변화 및 눈부심(Luminance Shock) 곡선</text>`,
  ];

  // 고휘도 충격 경계 대역(Y > 0.85) 표시
  const flashY = padT + (1 - 0.85) * plotH;
  lines.push(
    `    <rect x="${fmtNum(padL)}" y="${fmtNum(padT)}" width="${fmtNum(plotW)}" height="${fmtNum(flashY - padT)}" fill="${OKLCH_PALETTE.shockBandFill}" />`,
  );

  for (const tick of [0, 0.25, 0.5, 0.75, 1.0]) {
    const ty = padT + (1 - tick) * plotH;
    lines.push(
      `    <line x1="${fmtNum(padL)}" y1="${fmtNum(ty)}" x2="${fmtNum(padL + plotW)}" y2="${fmtNum(ty)}" stroke="${OKLCH_PALETTE.gridLine}" stroke-width="1" />`,
    );
    lines.push(
      `    <text x="${fmtNum(padL - 6)}" y="${fmtNum(ty + 3.5)}" text-anchor="end" font-size="9" fill="${OKLCH_PALETTE.textSecondary}">${fmtNum(tick, 2)}</text>`,
    );
  }

  if (cuts.length > 0) {
    const beforePts: string[] = [];
    const afterPts: string[] = [];
    const count = Math.max(1, cuts.length - 1);

    for (let i = 0; i < cuts.length; i += 1) {
      const cut = cuts[i];
      if (!cut) continue;
      const px = padL + (cuts.length === 1 ? plotW * 0.5 : (i / count) * plotW);
      const luma = Number.isFinite(cut.meanLuma) ? Math.min(1, Math.max(0, cut.meanLuma)) : 0;
      const py = padT + (1 - luma) * plotH;
      beforePts.push(`${fmtNum(px)},${fmtNum(py)}`);

      if (i > 0 && cut.appliedGutterRamp) {
        const prevCut = cuts[i - 1];
        if (prevCut) {
          const prevX = padL + ((i - 1) / count) * plotW;
          const midX = (prevX + px) * 0.5;
          const midLuma = (prevCut.meanLuma + luma) * 0.5;
          const midY = padT + (1 - midLuma) * plotH;
          afterPts.push(`${fmtNum(midX)},${fmtNum(midY)}`);
        }
      }
      afterPts.push(`${fmtNum(px)},${fmtNum(py)}`);

      lines.push(
        `    <text x="${fmtNum(px)}" y="${fmtNum(padT + plotH + 15)}" text-anchor="middle" font-size="9" fill="${OKLCH_PALETTE.textSecondary}">C${cut.cutIndex + 1}</text>`,
      );
    }

    lines.push(
      `    <polyline data-series="luminance-before" fill="none" stroke="${OKLCH_PALETTE.curveBeforeStroke}" stroke-width="2" stroke-dasharray="5 3" points="${beforePts.join(" ")}" />`,
    );
    lines.push(
      `    <polyline data-series="luminance-after" fill="none" stroke="${OKLCH_PALETTE.curveAfterStroke}" stroke-width="2.4" points="${afterPts.join(" ")}" />`,
    );
  }

  lines.push("  </g>");
  return lines.join("\n");
}

function renderContrastBadges(
  result: DualThemeRemediationResult,
  x: number,
  y: number,
  width: number,
  height: number,
): string {
  const lines: string[] = [
    `  <g data-layer="contrast-remediation-badges" transform="translate(${fmtNum(x)}, ${fmtNum(y)})">`,
    `    <rect x="0" y="0" width="${fmtNum(width)}" height="${fmtNum(height)}" rx="10" fill="${OKLCH_PALETTE.cardBg}" stroke="${OKLCH_PALETTE.cardBorder}" stroke-width="1.2" />`,
    `    <text x="14" y="22" font-size="12" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">자동 림·플레이트 보정 전/후 대비 배지 (4종 뷰어 최악 기준)</text>`,
  ];

  const beforeMap = new Map<string, ElementAuditSummary>();
  for (let i = 0; i < result.beforeAudit.elementAudits.length; i += 1) {
    const item = result.beforeAudit.elementAudits[i];
    if (item) beforeMap.set(`${item.cutId}::${item.elementId}`, item);
  }

  const rows = result.afterAudit.elementAudits.slice(0, 5);
  let cursorY = 44;
  for (let i = 0; i < rows.length; i += 1) {
    const afterItem = rows[i];
    if (!afterItem) continue;
    const beforeItem = beforeMap.get(`${afterItem.cutId}::${afterItem.elementId}`);
    const beforeWcag = beforeItem ? beforeItem.worstWcagRatio : afterItem.worstWcagRatio;
    const beforeLc = beforeItem ? beforeItem.worstApcaAbsLc : afterItem.worstApcaAbsLc;
    const beforePassed = beforeItem ? beforeItem.passedAllThemes : afterItem.passedAllThemes;

    const beforeBadgeBg = beforePassed ? OKLCH_PALETTE.passBg : OKLCH_PALETTE.failBg;
    const beforeBadgeFg = beforePassed ? OKLCH_PALETTE.passFg : OKLCH_PALETTE.failFg;
    const afterBadgeBg = afterItem.passedAllThemes ? OKLCH_PALETTE.passBg : OKLCH_PALETTE.warnBg;
    const afterBadgeFg = afterItem.passedAllThemes ? OKLCH_PALETTE.passFg : OKLCH_PALETTE.warnFg;

    lines.push(
      `    <text x="14" y="${fmtNum(cursorY + 12)}" font-size="10.5" font-weight="600" fill="${OKLCH_PALETTE.textPrimary}">${escapeDualThemeXml(afterItem.labelKo)}</text>`,
    );
    const beforeX = Math.max(180, width - 310);
    const afterX = Math.max(330, width - 155);
    lines.push(
      `    <rect x="${fmtNum(beforeX)}" y="${fmtNum(cursorY)}" width="142" height="18" rx="9" fill="${beforeBadgeBg}" />`,
    );
    lines.push(
      `    <text x="${fmtNum(beforeX + 71)}" y="${fmtNum(cursorY + 12.5)}" text-anchor="middle" font-size="9.5" font-weight="600" fill="${beforeBadgeFg}">전 ${fmtNum(beforeWcag, 1)}:1 · Lc ${fmtNum(beforeLc, 0)}</text>`,
    );
    lines.push(
      `    <rect x="${fmtNum(afterX)}" y="${fmtNum(cursorY)}" width="142" height="18" rx="9" fill="${afterBadgeBg}" />`,
    );
    lines.push(
      `    <text x="${fmtNum(afterX + 71)}" y="${fmtNum(cursorY + 12.5)}" text-anchor="middle" font-size="9.5" font-weight="700" fill="${afterBadgeFg}">후 ${fmtNum(afterItem.worstWcagRatio, 1)}:1 · Lc ${fmtNum(afterItem.worstApcaAbsLc, 0)}</text>`,
    );
    cursorY += 26;
  }

  lines.push("  </g>");
  return lines.join("\n");
}

/**
 * 좌측 라이트모드 · 우측 OLED 트루블랙 분할 프리뷰, 컷별 휘도 충격 곡선,
 * 보정 전/후 대비 배지를 순수 `oklch(...)` SVG로 렌더링한다.
 */
export function renderDualThemeAuditSvg(
  result: DualThemeRemediationResult,
  options: DualThemeAuditSvgOptions = {},
): string {
  const width = Math.max(680, Math.min(1280, Number.isFinite(options.width) ? (options.width ?? 920) : 920));
  const pad = 18;
  const headerH = 56;
  const splitH = 310;
  const curveH = 164;
  const badgeH = 184;
  const totalH = pad + headerH + 14 + splitH + 14 + curveH + 14 + badgeH + pad;

  const titleRaw =
    options.title ?? `${result.afterAudit.episodeTitleKo} · 라이트 vs OLED 다크 검수`;
  const safeTitle = escapeDualThemeXml(titleRaw);
  const digestShort = escapeDualThemeXml(
    result.verification.remediationManifestSha256Hex.slice(0, 12),
  );
  const previewCuts =
    options.showRemediationPreview === false
      ? result.originalInput.cuts
      : result.remediatedInput.cuts;

  const colGap = 16;
  const colW = (width - pad * 2 - colGap) * 0.5;
  const splitY = pad + headerH + 14;
  const curveY = splitY + splitH + 14;
  const badgeY = curveY + curveH + 14;
  const statusBg = result.verification.allFourThemesVerifiedPass
    ? OKLCH_PALETTE.passBg
    : OKLCH_PALETTE.failBg;
  const statusFg = result.verification.allFourThemesVerifiedPass
    ? OKLCH_PALETTE.passFg
    : OKLCH_PALETTE.failFg;
  const statusLabel = result.verification.allFourThemesVerifiedPass
    ? "4종 뷰어 통과"
    : `미해소 ${result.verification.afterDefectCount}건`;

  const chunks: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmtNum(width)} ${fmtNum(totalH)}" width="${fmtNum(width)}" height="${fmtNum(totalH)}" role="img" aria-label="${safeTitle}">`,
    `  <title>${safeTitle}</title>`,
    `  <rect x="0" y="0" width="${fmtNum(width)}" height="${fmtNum(totalH)}" fill="${OKLCH_PALETTE.canvasBg}" />`,
    `  <g data-layer="audit-header" transform="translate(${fmtNum(pad)}, ${fmtNum(pad)})">`,
    `    <rect x="0" y="0" width="${fmtNum(width - pad * 2)}" height="${fmtNum(headerH)}" rx="12" fill="${OKLCH_PALETTE.headerBg}" />`,
    `    <text x="16" y="25" font-size="14" font-weight="700" fill="${OKLCH_PALETTE.textOnDark}">${safeTitle}</text>`,
    `    <text x="16" y="43" font-size="10.5" fill="${OKLCH_PALETTE.textMutedOnDark}">보정 전 ${result.beforeAudit.overallReadinessScore}점 -> 보정 후 ${result.afterAudit.overallReadinessScore}점 · SHA-256 ${digestShort}</text>`,
    `    <rect x="${fmtNum(width - pad * 2 - 126)}" y="15" width="110" height="26" rx="13" fill="${statusBg}" />`,
    `    <text x="${fmtNum(width - pad * 2 - 71)}" y="31.5" text-anchor="middle" font-size="11" font-weight="700" fill="${statusFg}">${escapeDualThemeXml(statusLabel)}</text>`,
    `  </g>`,
    renderViewerStrip(
      previewCuts,
      pad,
      splitY,
      colW,
      splitH,
      false,
      "light-paper-preview",
      "좌측 · 라이트 페이퍼 뷰어",
    ),
    renderViewerStrip(
      previewCuts,
      pad + colW + colGap,
      splitY,
      colW,
      splitH,
      true,
      "oled-true-black-preview",
      "우측 · OLED 트루블랙 뷰어",
    ),
    `  <line data-layer="split-axis" x1="${fmtNum(pad + colW + colGap * 0.5)}" y1="${fmtNum(splitY)}" x2="${fmtNum(pad + colW + colGap * 0.5)}" y2="${fmtNum(splitY + splitH)}" stroke="${OKLCH_PALETTE.accentSplit}" stroke-width="1.5" stroke-dasharray="4 4" />`,
    renderLuminanceShockCurve(result, pad, curveY, width - pad * 2, curveH),
    renderContrastBadges(result, pad, badgeY, width - pad * 2, badgeH),
    "</svg>",
  ];

  return chunks.join("\n");
}

/**
 * 웹툰 출고 담당자와 작가가 즉시 판단할 수 있는 번역투 없는 한국어 QA 브리프를 생성한다.
 */
export function summarizeDualThemeAuditKo(
  result: DualThemeRemediationResult,
): DualThemeQaReportKo {
  const { beforeAudit, afterAudit, verification, elementPatches, gutterRamps } = result;
  const auditSha256Short = verification.remediationManifestSha256Hex.slice(0, 16);

  let releaseStatus: DualThemeQaReportKo["releaseStatus"];
  let headlineKo: string;
  if (verification.beforeDefectCount === 0 && verification.afterDefectCount === 0) {
    releaseStatus = "ready-for-export";
    headlineKo = `${afterAudit.episodeTitleKo} — 라이트·세피아·다크·OLED 4종 뷰어 즉시 출고 가능`;
  } else if (verification.allFourThemesVerifiedPass) {
    releaseStatus = "remediated-ready";
    headlineKo = `${afterAudit.episodeTitleKo} — 결함 ${verification.beforeDefectCount}건 비파괴 자동 보정 완료, 4종 뷰어 전수 통과`;
  } else {
    releaseStatus = "action-required";
    headlineKo = `${afterAudit.episodeTitleKo} — 미해소 시인성 결함 ${verification.afterDefectCount}건 확인 필요`;
  }

  const summaryParagraphKo =
    verification.beforeDefectCount === 0
      ? `총 ${result.remediatedInput.cuts.length}개 컷을 4종 독자 뷰어(라이트 페이퍼·세피아 페이퍼·다크 슬레이트·OLED 트루블랙)에서 검사한 결과, 투명 여백 효과음 사라짐·OLED 암부 뭉개짐·눈부심 급전환·말풍선 대비 미달이 모두 0건으로 확인됐습니다.`
      : `총 ${result.remediatedInput.cuts.length}개 컷에서 검출된 ${verification.beforeDefectCount}건의 출고 위험을 원본 픽셀 손상 없이 외곽 림·백킹 플레이트 ${elementPatches.length}건과 완충 거터 ${gutterRamps.length}건으로 교정했습니다. 보정 뒤 4종 뷰어 최저 대비는 WCAG ${verification.minWcagAcrossAllThemesAfter.toFixed(2)}:1, APCA |Lc| ${verification.minApcaAbsLcAcrossAllThemesAfter.toFixed(1)}입니다.`;

  const defectCodes: readonly DualThemeDefectCode[] = [
    "dark-mode-ink-vanish",
    "light-mode-highlight-vanish",
    "oled-black-crush-shadow",
    "luminance-shock-transition",
    "balloon-text-contrast-fail",
  ];

  const defectBreakdownKo = defectCodes.map((code) => {
    const beforeCnt = beforeAudit.countsByCode[code];
    const afterCnt = afterAudit.countsByCode[code];
    return `${DEFECT_CODE_LABELS_KO[code]}: 보정 전 ${beforeCnt}건 -> 보정 후 ${afterCnt}건`;
  });

  const themeReadinessKo = afterAudit.themeSummaries.map(
    (s) =>
      `${s.labelKo}: 준비도 ${s.readinessScore}점 (통과 요소 ${s.passedElementCount}건, 미달 ${s.failedElementCount}건, 눈부심 ${s.shockCount}건)`,
  );

  const appliedFixesKo: string[] = [];
  for (let i = 0; i < elementPatches.length; i += 1) {
    const p = elementPatches[i];
    if (p) appliedFixesKo.push(`[${p.cutId}] ${p.elementLabelKo}: ${p.rationaleKo}`);
  }
  for (let i = 0; i < gutterRamps.length; i += 1) {
    const r = gutterRamps[i];
    if (r) appliedFixesKo.push(`[${r.fromCutId}->${r.toCutId}] ${r.rationaleKo}`);
  }
  if (appliedFixesKo.length === 0) {
    appliedFixesKo.push("추가 보정 레이어 없이 원본 그대로 출고 기준을 충족합니다.");
  }

  const checklistKo: readonly string[] = [
    `투명 여백 효과음·자막 사라짐 0건 확인 (${verification.vanishCountAfter}건)`,
    `야간 컷 OLED 암부 윤곽 뭉개짐 해소 확인 (${verification.blackCrushCountAfter}건)`,
    `야간->순백 눈부심 급전환 거터 완충 확인 (${verification.luminanceShockCountAfter}건)`,
    `말풍선 대사 WCAG 4.5:1 및 APCA |Lc| 60 이상 확인 (${verification.balloonFailCountAfter}건 미달)`,
    `결정론 인증 매니페스트 SHA-256 지문 기록 (${auditSha256Short})`,
  ];

  return {
    episodeId: afterAudit.episodeId,
    episodeTitleKo: afterAudit.episodeTitleKo,
    releaseStatus,
    headlineKo,
    summaryParagraphKo,
    defectBreakdownKo,
    themeReadinessKo,
    appliedFixesKo,
    checklistKo,
    auditSha256Short,
  };
}
