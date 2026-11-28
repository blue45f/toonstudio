/**
 * Wave 110 — OKLCH 고대비 다국어 피팅·누출 매트릭스 SVG 및 한국어 디렉터 QA 보고서.
 *
 * - SVG 색상은 전부 `oklch(...)`만 사용하며 raw `#hex` / `rgb(...)` 리터럴을 포함하지 않는다.
 * - 모든 셀에 색상·테두리 패턴과 문자 코드(`FIT` / `TIGHT` / `OVER` / `LEAK` / `N/A`)를
 *   병기해 색각이상·흑백 인쇄 환경에서도 즉시 판독할 수 있다.
 * - 모든 수치 좌표에 유한수 가드를 적용해 `NaN`/`Infinity` 출력을 차단하고 모든 텍스트를 XML 이스케이프한다.
 */

import {
  LOCALIZATION_LOCALE_PROFILES,
  MATRIX_DISPLAY_LOCALE_ORDER,
  type BalloonFitAuditResult,
  type LocalizationBalloonFitReport,
  type LocalizationTargetLocale,
} from "./localization-balloon-fit-solver";
import type {
  CutLocaleAuditStatus,
  GlossaryRegisterLeakAuditReport,
} from "./glossary-register-and-leak-auditor";

export type LocalizationMatrixCellCode = "FIT" | "TIGHT" | "OVER" | "LEAK" | "N/A";

export interface LocalizationFitMatrixSvgOptions {
  readonly cellWidthPx?: number;
  readonly rowHeightPx?: number;
  readonly cutColumnWidthPx?: number;
  readonly titleOverride?: string;
  readonly targetLocales?: readonly LocalizationTargetLocale[];
}

export interface LocalizationAuditSummaryOptions {
  readonly auditDateIso?: string;
  readonly maxDetailRows?: number;
}

interface MatrixCellPalette {
  readonly fill: string;
  readonly stroke: string;
  readonly text: string;
  readonly strokeWidth: string;
  readonly strokeDasharray?: string;
}

const OKLCH_SURFACE_BG = "oklch(0.98 0.008 90)";
const OKLCH_CARD_BG = "oklch(1 0 0)";
const OKLCH_LINEN_BG = "oklch(0.955 0.012 90)";
const OKLCH_STRIPE_BG = "oklch(0.985 0.006 90)";
const OKLCH_BORDER = "oklch(0.32 0.035 158 / 0.16)";
const OKLCH_DIVIDER = "oklch(0.32 0.035 158 / 0.11)";
const OKLCH_INK_TITLE = "oklch(0.24 0.035 158)";
const OKLCH_INK_PRIMARY = "oklch(0.32 0.055 158)";
const OKLCH_INK_BODY = "oklch(0.28 0.025 158)";
const OKLCH_INK_MUTED = "oklch(0.46 0.02 158)";

const OKLCH_CELL_PALETTE: Readonly<Record<LocalizationMatrixCellCode, MatrixCellPalette>> = {
  FIT: {
    fill: "oklch(0.94 0.045 155)",
    stroke: "oklch(0.42 0.11 155)",
    text: "oklch(0.27 0.08 155)",
    strokeWidth: "1.2",
  },
  TIGHT: {
    fill: "oklch(0.95 0.06 85)",
    stroke: "oklch(0.55 0.14 75)",
    text: "oklch(0.35 0.10 70)",
    strokeWidth: "1.4",
    strokeDasharray: "4 2",
  },
  OVER: {
    fill: "oklch(0.93 0.065 40)",
    stroke: "oklch(0.52 0.17 34)",
    text: "oklch(0.33 0.13 30)",
    strokeWidth: "1.6",
    strokeDasharray: "2 2",
  },
  LEAK: {
    fill: "oklch(0.91 0.085 22)",
    stroke: "oklch(0.46 0.19 24)",
    text: "oklch(0.28 0.15 24)",
    strokeWidth: "2.2",
  },
  "N/A": {
    fill: "oklch(0.96 0.005 90)",
    stroke: "oklch(0.76 0.01 90)",
    text: "oklch(0.50 0.015 90)",
    strokeWidth: "1",
  },
};

/** XML 특수문자(`&`, `<`, `>`, `"`, `'`)를 안전하게 이스케이프한다. */
export function escapeLocalizationSvgXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safeSvgNumber(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value * 100) / 100));
}

function fmtSvgNum(value: number): string {
  const safe = Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
  return String(safe);
}

function truncateLabel(raw: string, maxChars: number): string {
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, Math.max(1, maxChars - 1))}…`;
}

function resolveMatrixCutIds(
  fitReport: LocalizationBalloonFitReport,
  glossaryReport: GlossaryRegisterLeakAuditReport,
): readonly string[] {
  const out: string[] = [];
  for (let i = 0; i < fitReport.cutIds.length; i += 1) {
    const id = fitReport.cutIds[i];
    if (out.indexOf(id) < 0) out.push(id);
  }
  for (let i = 0; i < glossaryReport.cutIds.length; i += 1) {
    const id = glossaryReport.cutIds[i];
    if (out.indexOf(id) < 0) out.push(id);
  }
  return out;
}

function classifyCutLocaleCell(
  fitEntries: readonly BalloonFitAuditResult[],
  auditStatus: CutLocaleAuditStatus | undefined,
): LocalizationMatrixCellCode {
  if (auditStatus?.hasLeakBlocker) return "LEAK";

  let hasSevereFit = false;
  let hasTightFit = false;
  for (let i = 0; i < fitEntries.length; i += 1) {
    const item = fitEntries[i];
    if (item.severeOverflow) {
      hasSevereFit = true;
    } else if (
      item.remediationTier === "micro-tighten-tracking" ||
      item.remediationTier === "expand-balloon-margin"
    ) {
      hasTightFit = true;
    }
  }

  if (hasSevereFit || auditStatus?.hasGlossaryBlocker) return "OVER";
  if (hasTightFit || auditStatus?.hasRegisterIssue) return "TIGHT";
  if (fitEntries.length > 0 || auditStatus !== undefined) return "FIT";
  return "N/A";
}

/**
 * 컷 × 7개 언어(`KO / JA / EN / FR / DE / ES / AR`) 말풍선 피팅·누출 매트릭스를
 * 인쇄 대응 고대비 OKLCH SVG로 렌더링한다.
 */
export function renderLocalizationFitMatrixSvg(
  fitReport: LocalizationBalloonFitReport,
  glossaryReport: GlossaryRegisterLeakAuditReport,
  options?: LocalizationFitMatrixSvgOptions,
): string {
  const cellW = safeSvgNumber(options?.cellWidthPx ?? 88, 88, 64, 160);
  const rowH = safeSvgNumber(options?.rowHeightPx ?? 36, 36, 28, 60);
  const cutColW = safeSvgNumber(options?.cutColumnWidthPx ?? 168, 168, 110, 280);

  const columns: readonly LocalizationTargetLocale[] =
    options?.targetLocales && options.targetLocales.length > 0
      ? options.targetLocales
      : MATRIX_DISPLAY_LOCALE_ORDER;
  const cutIds = resolveMatrixCutIds(fitReport, glossaryReport);

  const padX = 20;
  const padY = 20;
  const headerH = 74;
  const tableHeaderH = 38;
  const footerH = 48;
  const bodyRows = Math.max(1, cutIds.length);

  const gridWidth = cutColW + Math.max(1, columns.length) * cellW;
  const totalWidth = padX * 2 + gridWidth;
  const totalHeight = padY * 2 + headerH + tableHeaderH + bodyRows * rowH + footerH;

  const titleText =
    options?.titleOverride ??
    `${glossaryReport.episodeTitle} (${glossaryReport.episodeId} · Rev.${glossaryReport.masterRevision})`;

  const fitByCell = new Map<string, BalloonFitAuditResult[]>();
  for (let i = 0; i < fitReport.results.length; i += 1) {
    const r = fitReport.results[i];
    const key = `${r.cutId}::${r.locale}`;
    const list = fitByCell.get(key);
    if (list) list.push(r);
    else fitByCell.set(key, [r]);
  }

  const auditByCell = new Map<string, CutLocaleAuditStatus>();
  for (let i = 0; i < glossaryReport.cutLocaleStatuses.length; i += 1) {
    const st = glossaryReport.cutLocaleStatuses[i];
    auditByCell.set(`${st.cutId}::${st.locale}`, st);
  }

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmtSvgNum(totalWidth)}" height="${fmtSvgNum(totalHeight)}" viewBox="0 0 ${fmtSvgNum(totalWidth)} ${fmtSvgNum(totalHeight)}" role="img" aria-label="${escapeLocalizationSvgXml(`다국어 말풍선 피팅 및 누출 감사 매트릭스: ${titleText}`)}">`,
  );
  lines.push(`  <title>${escapeLocalizationSvgXml(titleText)}</title>`);
  lines.push(
    `  <rect x="0" y="0" width="${fmtSvgNum(totalWidth)}" height="${fmtSvgNum(totalHeight)}" fill="${OKLCH_SURFACE_BG}" />`,
  );
  lines.push(
    `  <rect x="${fmtSvgNum(padX)}" y="${fmtSvgNum(padY)}" width="${fmtSvgNum(gridWidth)}" height="${fmtSvgNum(totalHeight - padY * 2)}" rx="10" fill="${OKLCH_CARD_BG}" stroke="${OKLCH_BORDER}" stroke-width="1" />`,
  );

  // 상단 제목 및 출고 승인 상태 뱃지
  lines.push(
    `  <text x="${fmtSvgNum(padX + 16)}" y="${fmtSvgNum(padY + 28)}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="14.5" font-weight="700" fill="${OKLCH_INK_TITLE}">${escapeLocalizationSvgXml(titleText)}</text>`,
  );

  const badgeCode: LocalizationMatrixCellCode =
    glossaryReport.exportApproved && fitReport.severeOverflowCount === 0
      ? "FIT"
      : glossaryReport.untranslatedSourceLeakCount > 0
        ? "LEAK"
        : "OVER";
  const badgePal = OKLCH_CELL_PALETTE[badgeCode];
  const badgeLabel =
    glossaryReport.exportApproved && fitReport.severeOverflowCount === 0
      ? "출고 승인"
      : `출고 보류 (${glossaryReport.blockerCount + fitReport.severeOverflowCount}건)`;
  const badgeX = padX + gridWidth - 134;
  lines.push(
    `  <rect x="${fmtSvgNum(badgeX)}" y="${fmtSvgNum(padY + 12)}" width="118" height="22" rx="6" fill="${badgePal.fill}" stroke="${badgePal.stroke}" stroke-width="${badgePal.strokeWidth}" />`,
  );
  lines.push(
    `  <text x="${fmtSvgNum(badgeX + 59)}" y="${fmtSvgNum(padY + 27)}" text-anchor="middle" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="11" font-weight="700" fill="${badgePal.text}">${escapeLocalizationSvgXml(badgeLabel)}</text>`,
  );

  // 색각안전 4단계 범례
  const legendY = padY + 52;
  const legendItems: ReadonlyArray<{
    readonly code: LocalizationMatrixCellCode;
    readonly label: string;
    readonly xOffset: number;
  }> = [
    { code: "FIT", label: "원형 수납", xOffset: 16 },
    { code: "TIGHT", label: "자간·여백 조정", xOffset: 136 },
    { code: "OVER", label: "넘침·용어 이탈", xOffset: 282 },
    { code: "LEAK", label: "한글 원문 누출", xOffset: 432 },
  ];

  for (let i = 0; i < legendItems.length; i += 1) {
    const item = legendItems[i];
    const pal = OKLCH_CELL_PALETTE[item.code];
    const lx = padX + item.xOffset;
    const dashAttr =
      pal.strokeDasharray !== undefined ? ` stroke-dasharray="${pal.strokeDasharray}"` : "";
    lines.push(
      `  <rect x="${fmtSvgNum(lx)}" y="${fmtSvgNum(legendY - 12)}" width="42" height="18" rx="4" fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="${pal.strokeWidth}"${dashAttr} />`,
    );
    lines.push(
      `  <text x="${fmtSvgNum(lx + 21)}" y="${fmtSvgNum(legendY + 1)}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, monospace" font-size="9.5" font-weight="700" fill="${pal.text}">${item.code}</text>`,
    );
    lines.push(
      `  <text x="${fmtSvgNum(lx + 48)}" y="${fmtSvgNum(legendY + 1)}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="11" fill="${OKLCH_INK_BODY}">${escapeLocalizationSvgXml(item.label)}</text>`,
    );
  }

  // 표 헤더 (컷 / 언어 열)
  const tableTop = padY + headerH;
  lines.push(
    `  <rect x="${fmtSvgNum(padX)}" y="${fmtSvgNum(tableTop)}" width="${fmtSvgNum(gridWidth)}" height="${fmtSvgNum(tableHeaderH)}" fill="${OKLCH_LINEN_BG}" stroke="${OKLCH_BORDER}" stroke-width="1" />`,
  );
  lines.push(
    `  <text x="${fmtSvgNum(padX + 14)}" y="${fmtSvgNum(tableTop + 23)}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="12" font-weight="700" fill="${OKLCH_INK_PRIMARY}">대사 컷</text>`,
  );

  for (let ci = 0; ci < columns.length; ci += 1) {
    const loc = columns[ci];
    const prof = LOCALIZATION_LOCALE_PROFILES[loc];
    const colX = padX + cutColW + ci * cellW;
    lines.push(
      `  <line x1="${fmtSvgNum(colX)}" y1="${fmtSvgNum(tableTop)}" x2="${fmtSvgNum(colX)}" y2="${fmtSvgNum(tableTop + tableHeaderH + bodyRows * rowH + footerH)}" stroke="${OKLCH_DIVIDER}" stroke-width="1" />`,
    );
    const dirHint = prof.isRtl ? " RTL" : "";
    lines.push(
      `  <text x="${fmtSvgNum(colX + cellW * 0.5)}" y="${fmtSvgNum(tableTop + 23)}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, monospace" font-size="11.5" font-weight="700" fill="${OKLCH_INK_PRIMARY}">${escapeLocalizationSvgXml(`${prof.shortCode}${dirHint}`)}</text>`,
    );
  }

  // 본문 행 (컷별 × 언어별 셀)
  const bodyTop = tableTop + tableHeaderH;
  if (cutIds.length === 0) {
    lines.push(
      `  <text x="${fmtSvgNum(padX + 14)}" y="${fmtSvgNum(bodyTop + rowH * 0.62)}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="12" fill="${OKLCH_INK_MUTED}">감사 대상 대사 컷이 없습니다.</text>`,
    );
  } else {
    for (let ri = 0; ri < cutIds.length; ri += 1) {
      const cutId = cutIds[ri];
      const rowY = bodyTop + ri * rowH;
      const stripe = ri % 2 === 1 ? OKLCH_STRIPE_BG : OKLCH_CARD_BG;
      lines.push(
        `  <rect x="${fmtSvgNum(padX)}" y="${fmtSvgNum(rowY)}" width="${fmtSvgNum(gridWidth)}" height="${fmtSvgNum(rowH)}" fill="${stripe}" />`,
      );
      lines.push(
        `  <line x1="${fmtSvgNum(padX)}" y1="${fmtSvgNum(rowY)}" x2="${fmtSvgNum(padX + gridWidth)}" y2="${fmtSvgNum(rowY)}" stroke="${OKLCH_DIVIDER}" stroke-width="1" />`,
      );
      lines.push(
        `  <text x="${fmtSvgNum(padX + 14)}" y="${fmtSvgNum(rowY + rowH * 0.62)}" font-family="ui-monospace, SFMono-Regular, monospace" font-size="11.5" fill="${OKLCH_INK_BODY}">${escapeLocalizationSvgXml(truncateLabel(cutId, 20))}</text>`,
      );

      for (let ci = 0; ci < columns.length; ci += 1) {
        const loc = columns[ci];
        const key = `${cutId}::${loc}`;
        const code = classifyCutLocaleCell(fitByCell.get(key) ?? [], auditByCell.get(key));
        const pal = OKLCH_CELL_PALETTE[code];
        const boxX = padX + cutColW + ci * cellW + 9;
        const boxY = rowY + 6;
        const boxW = cellW - 18;
        const boxH = rowH - 12;
        const dashAttr =
          pal.strokeDasharray !== undefined ? ` stroke-dasharray="${pal.strokeDasharray}"` : "";

        lines.push(
          `  <rect x="${fmtSvgNum(boxX)}" y="${fmtSvgNum(boxY)}" width="${fmtSvgNum(boxW)}" height="${fmtSvgNum(boxH)}" rx="5" fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="${pal.strokeWidth}"${dashAttr} />`,
        );
        lines.push(
          `  <text x="${fmtSvgNum(boxX + boxW * 0.5)}" y="${fmtSvgNum(boxY + boxH * 0.69)}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, monospace" font-size="10.5" font-weight="700" fill="${pal.text}">${code}</text>`,
        );
      }
    }
  }

  // 하단 요약 및 SHA-256 릴리스 다이제스트
  const footerY = bodyTop + bodyRows * rowH;
  lines.push(
    `  <rect x="${fmtSvgNum(padX)}" y="${fmtSvgNum(footerY)}" width="${fmtSvgNum(gridWidth)}" height="${fmtSvgNum(footerH)}" fill="${OKLCH_LINEN_BG}" stroke="${OKLCH_BORDER}" stroke-width="1" />`,
  );
  const digestShort = glossaryReport.releaseManifestSha256.slice(0, 16);
  lines.push(
    `  <text x="${fmtSvgNum(padX + 14)}" y="${fmtSvgNum(footerY + 20)}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="11.5" font-weight="700" fill="${OKLCH_INK_PRIMARY}">피팅률 ${fmtSvgNum(fitReport.fitRatePercent)}% · 모바일 가독 ${fmtSvgNum(fitReport.mobileLegibilityPassRate)}%</text>`,
  );
  lines.push(
    `  <text x="${fmtSvgNum(padX + 14)}" y="${fmtSvgNum(footerY + 37)}" font-family="ui-monospace, SFMono-Regular, monospace" font-size="10" fill="${OKLCH_INK_MUTED}">SHA-256 ${escapeLocalizationSvgXml(digestShort)} · LEAK ${glossaryReport.untranslatedSourceLeakCount} · GLOSSARY ${glossaryReport.glossaryViolationCount}</text>`,
  );

  lines.push("</svg>");
  return lines.join("\n");
}

/**
 * 번역 디렉터·식자 담당자가 바로 조치할 수 있는 자연스러운 한국어 QA 감사 보고서를 생성한다.
 */
export function summarizeLocalizationBridgeAuditKo(
  fitReport: LocalizationBalloonFitReport,
  glossaryReport: GlossaryRegisterLeakAuditReport,
  options?: LocalizationAuditSummaryOptions,
): string {
  const maxDetailRows = Math.max(1, Math.floor(options?.maxDetailRows ?? 12));
  const readyForRelease = glossaryReport.exportApproved && fitReport.severeOverflowCount === 0;
  const verdictLabel = readyForRelease
    ? "출고 승인 (차단 항목 없음)"
    : `출고 보류 (원문·용어집 차단 ${glossaryReport.blockerCount}건, 심각 넘침 ${fitReport.severeOverflowCount}건)`;

  const out: string[] = [];
  out.push(
    `[다국어 로컬라이제이션 QA 요약] ${glossaryReport.episodeTitle} (${glossaryReport.episodeId} · Rev.${glossaryReport.masterRevision})`,
  );
  if (options?.auditDateIso) {
    out.push(`- 점검 일자: ${options.auditDateIso}`);
  }
  out.push(`- 최종 판정: ${verdictLabel}`);
  out.push(
    `- 전체 식자 지표: 총 ${fitReport.totalBalloons}개 말풍선 · 마스터 원형 피팅률 ${fitReport.fitRatePercent}% · 모바일 가독 통과율 ${fitReport.mobileLegibilityPassRate}% · 심각 넘침 ${fitReport.severeOverflowCount}건`,
  );
  out.push(
    `- 용어집·말투 감사: 원문 한글 누출 ${glossaryReport.untranslatedSourceLeakCount}건 · 용어집 위반 ${glossaryReport.glossaryViolationCount}건(금지 표기 ${glossaryReport.forbiddenVariantCount} / 정본 누락 ${glossaryReport.missingApprovedTermCount}) · 말투 불일치 ${glossaryReport.registerViolationCount}건`,
  );
  out.push(`- 릴리스 매니페스트 SHA-256: ${glossaryReport.releaseManifestSha256.slice(0, 16)}`);

  if (fitReport.perLocaleSummaries.length > 0) {
    out.push("");
    out.push("1. 언어별 말풍선 피팅 현황");
    for (let i = 0; i < fitReport.perLocaleSummaries.length; i += 1) {
      const s = fitReport.perLocaleSummaries[i];
      const prof = LOCALIZATION_LOCALE_PROFILES[s.locale];
      out.push(
        `- ${prof.shortCode} (${prof.labelKo}): 총 ${s.totalBalloons}개 | 원형 수납 ${s.fitsCleanlyCount} · 자간 조정 ${s.microTightenCount} · 여백 확장 ${s.expandBalloonMarginCount} · 심각 넘침 ${s.severeOverflowCount} (피팅률 ${s.fitRatePercent}%, 모바일 가독 ${s.mobileLegibilityPassRate}%)`,
      );
    }
  }

  const severeItems = fitReport.results.filter((r) => r.severeOverflow);
  if (severeItems.length > 0) {
    out.push("");
    out.push("2. 번역문 축약·분할 권고 (심각 넘침)");
    const limit = Math.min(severeItems.length, maxDetailRows);
    for (let i = 0; i < limit; i += 1) {
      const item = severeItems[i];
      const actionKo =
        item.remediationTier === "split-into-linked-sub-balloon"
          ? `보조 말풍선 ${item.recommendedSplitCount}분할 연결`
          : "번역문 축약";
      const maxCharsText =
        item.recommendedMaxChars !== null ? `${item.recommendedMaxChars}자 이하` : "재식자 필요";
      out.push(
        `- [${item.cutId} / ${item.balloonId} / ${item.locale}] 현재 ${item.actualChars}자 → 권장 ${maxCharsText} (${actionKo})`,
      );
    }
    if (severeItems.length > limit) {
      out.push(`- 외 ${severeItems.length - limit}건 추가 넘침 있음`);
    }
  }

  if (glossaryReport.findings.length > 0) {
    out.push("");
    out.push("3. 원문 누출·용어집·말투 적발 내역");
    const limit = Math.min(glossaryReport.findings.length, maxDetailRows);
    for (let i = 0; i < limit; i += 1) {
      const f = glossaryReport.findings[i];
      const sevLabel = f.severity === "blocker" ? "차단" : "주의";
      out.push(`- [${sevLabel}][${f.cutId} / ${f.locale}] ${f.messageKo}`);
    }
    if (glossaryReport.findings.length > limit) {
      out.push(`- 외 ${glossaryReport.findings.length - limit}건 추가 적발 있음`);
    }
  } else {
    out.push("");
    out.push("3. 원문 누출·용어집·말투 적발 내역");
    out.push("- 한글 원문 누출, 금지 용어 이탈, 말투 불일치 모두 0건으로 출고 기준 충족");
  }

  return out.join("\n");
}
