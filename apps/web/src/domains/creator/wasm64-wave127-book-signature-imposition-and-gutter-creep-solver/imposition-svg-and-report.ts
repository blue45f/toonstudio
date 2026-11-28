/**
 * Wave 127 — 순수 OKLCH 인쇄 대수 조판 평면도·크리프 다이어그램·양면 스프레드 책등 금지대 SVG
 * 및 자연스러운 한국어 단행본 제작 PD 출고 QA 브리프 생성기.
 *
 * - 모든 SVG 색상은 순수 `oklch(...)`만 사용하며 원시 16진수/함수형 색상을 포함하지 않는다.
 * - 모든 동적 텍스트는 XML 특수문자(`&`, `<`, `>`, `"`, `'`)를 이스케이프한다.
 * - 모든 좌표·치수 수치에 유한수 가드를 적용해 `NaN`/`Infinity` 출력을 차단한다.
 */

import {
  BOOK_BINDING_PROFILES,
  type BookAuditedBoxOverlay,
  type BookPrintSafetyAuditReport,
  type BookSignatureImpositionPlan,
} from "./book-imposition-types";

export interface BookImpositionSvgOptions {
  readonly widthPx?: number;
  readonly maxSignaturesToRender?: number;
  readonly maxSheetsPerSignature?: number;
  readonly titleOverride?: string;
}

export interface BookImpositionBriefOptions {
  readonly auditDateIso?: string;
  readonly maxFindingRows?: number;
}

const OKLCH_BG_SURFACE = "oklch(0.982 0.008 90)";
const OKLCH_BG_CARD = "oklch(1 0 0)";
const OKLCH_BG_LINEN = "oklch(0.955 0.012 90)";
const OKLCH_BG_SHEET = "oklch(0.978 0.006 90)";
const OKLCH_BG_BLANK_PAGE = "oklch(0.94 0.012 90)";
const OKLCH_BORDER_SOFT = "oklch(0.32 0.035 158 / 0.16)";
const OKLCH_BORDER_STRONG = "oklch(0.32 0.045 158 / 0.34)";
const OKLCH_INK_TITLE = "oklch(0.24 0.035 158)";
const OKLCH_INK_BODY = "oklch(0.30 0.025 158)";
const OKLCH_INK_MUTED = "oklch(0.48 0.020 158)";
const OKLCH_ACCENT_FOREST = "oklch(0.36 0.075 158)";
const OKLCH_CREEP_BAR = "oklch(0.46 0.115 245)";
const OKLCH_CREEP_BAR_BG = "oklch(0.94 0.018 245)";

const OKLCH_SAFE_FILL = "oklch(0.94 0.045 155)";
const OKLCH_SAFE_STROKE = "oklch(0.42 0.11 155)";
const OKLCH_SAFE_TEXT = "oklch(0.27 0.08 155)";

const OKLCH_WARN_FILL = "oklch(0.95 0.065 82)";
const OKLCH_WARN_STROKE = "oklch(0.55 0.14 74)";
const OKLCH_WARN_TEXT = "oklch(0.34 0.10 68)";

const OKLCH_BLOCK_FILL = "oklch(0.92 0.082 24)";
const OKLCH_BLOCK_STROKE = "oklch(0.47 0.185 25)";
const OKLCH_BLOCK_TEXT = "oklch(0.29 0.145 25)";

const OKLCH_GUTTER_BAND = "oklch(0.90 0.095 26 / 0.55)";
const OKLCH_BLEED_DASH = "oklch(0.52 0.12 245)";

/** XML 특수문자(`&`, `<`, `>`, `"`, `'`)를 안전하게 이스케이프한다. */
export function escapeImpositionSvgXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function clampFinite(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function fmtNum(value: number, decimals = 2): string {
  const safe = Number.isFinite(value) ? value : 0;
  const scale = Math.pow(10, decimals);
  const rounded = Math.round(safe * scale) / scale;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function truncateText(raw: string, maxChars: number): string {
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, Math.max(1, maxChars - 1))}…`;
}

function statusPalette(status: "safe" | "warning" | "blocker"): {
  readonly fill: string;
  readonly stroke: string;
  readonly text: string;
  readonly label: string;
} {
  if (status === "blocker") {
    return {
      fill: OKLCH_BLOCK_FILL,
      stroke: OKLCH_BLOCK_STROKE,
      text: OKLCH_BLOCK_TEXT,
      label: "출고 차단",
    };
  }
  if (status === "warning") {
    return {
      fill: OKLCH_WARN_FILL,
      stroke: OKLCH_WARN_STROKE,
      text: OKLCH_WARN_TEXT,
      label: "주의 검토",
    };
  }
  return {
    fill: OKLCH_SAFE_FILL,
    stroke: OKLCH_SAFE_STROKE,
    text: OKLCH_SAFE_TEXT,
    label: "출고 가능",
  };
}

function overlayCode(overlay: BookAuditedBoxOverlay): string {
  if (overlay.primaryIssueCode === "spine-gutter-swallow-risk") return "GUTTER";
  if (overlay.primaryIssueCode === "outer-trim-safety-violation") return "TRIM";
  if (overlay.primaryIssueCode === "insufficient-bleed") return "BLEED";
  return "SAFE";
}

/**
 * 대수별 앞/뒷면 시트 조판 평면도, 시트 중첩 크리프 보정 차트, 양면 스프레드 책등 금지대
 * 다이어그램을 순수 `oklch(...)` 인쇄 안전 SVG 문자열로 렌더링한다.
 */
export function renderBookImpositionSheetSvg(
  plan: BookSignatureImpositionPlan,
  audit: BookPrintSafetyAuditReport,
  options?: BookImpositionSvgOptions,
): string {
  const widthPx = Math.round(clampFinite(options?.widthPx ?? 980, 980, 760, 1400));
  const maxSigs = Math.round(clampFinite(options?.maxSignaturesToRender ?? 3, 3, 1, 8));
  const maxSheetsPerSig = Math.round(clampFinite(options?.maxSheetsPerSignature ?? 4, 4, 1, 8));

  const pad = 24;
  const innerW = widthPx - pad * 2;
  const headerH = 92;

  const visibleSignatures = plan.signatures.slice(0, maxSigs);
  const sigRowHeight = 76;
  const sigHeaderH = 26;
  let flatPlanContentH = 40;
  for (let s = 0; s < visibleSignatures.length; s += 1) {
    const sig = visibleSignatures[s];
    if (!sig) continue;
    const shownSheets = Math.min(sig.sheets.length, maxSheetsPerSig);
    flatPlanContentH += sigHeaderH + shownSheets * sigRowHeight + 14;
  }
  if (plan.signatures.length > visibleSignatures.length) {
    flatPlanContentH += 22;
  }

  const firstSig = plan.signatures[0];
  const creepSheets = firstSig ? firstSig.sheets.slice(0, 8) : [];
  const creepSectionH = 54 + Math.max(1, creepSheets.length) * 24 + 26;
  const spreadSectionH = 276;
  const footerH = 44;

  const yHeader = pad;
  const yFlatPlan = yHeader + headerH + 16;
  const yCreep = yFlatPlan + flatPlanContentH + 16;
  const ySpread = yCreep + creepSectionH + 16;
  const yFooter = ySpread + spreadSectionH + 14;
  const totalHeight = yFooter + footerH + pad;

  const overallStatus: "safe" | "warning" | "blocker" =
    audit.blockerCount > 0 ? "blocker" : audit.warningCount > 0 ? "warning" : "safe";
  const badge = statusPalette(overallStatus);
  const bindingLabel = BOOK_BINDING_PROFILES[plan.bindingMethod].labelKo;
  const directionLabel =
    plan.readingDirection === "ltr-korean-western" ? "좌철 (LTR · 1p 우측면)" : "우철 (RTL · 1p 좌측면)";
  const titleText = escapeImpositionSvgXml(
    truncateText(options?.titleOverride ?? `${plan.bookTitle} 인쇄 대수 조판 및 책등 안전 평면도`, 64),
  );

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmtNum(widthPx, 0)} ${fmtNum(totalHeight, 0)}" width="${fmtNum(widthPx, 0)}" height="${fmtNum(totalHeight, 0)}" role="img" aria-label="${titleText}">`,
  );
  lines.push(
    `<rect x="0" y="0" width="${fmtNum(widthPx, 0)}" height="${fmtNum(totalHeight, 0)}" fill="${OKLCH_BG_SURFACE}" />`,
  );

  // 1. 헤더 카드
  lines.push(
    `<rect x="${fmtNum(pad)}" y="${fmtNum(yHeader)}" width="${fmtNum(innerW)}" height="${fmtNum(headerH)}" rx="14" fill="${OKLCH_BG_CARD}" stroke="${OKLCH_BORDER_SOFT}" stroke-width="1.2" />`,
  );
  lines.push(
    `<text x="${fmtNum(pad + 20)}" y="${fmtNum(yHeader + 31)}" font-family="system-ui, -apple-system, sans-serif" font-size="17" font-weight="700" fill="${OKLCH_INK_TITLE}">${titleText}</text>`,
  );
  const subMeta = escapeImpositionSvgXml(
    `${bindingLabel} · ${directionLabel} · 판형 ${fmtNum(plan.trimWidthMm, 1)}×${fmtNum(plan.trimHeightMm, 1)}mm · 원고 ${String(plan.rawPageCount)}p → 조판 ${String(plan.paddedPageCount)}p (백지 ${String(plan.blankPaddingPageCount)}p)`,
  );
  lines.push(
    `<text x="${fmtNum(pad + 20)}" y="${fmtNum(yHeader + 54)}" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="${OKLCH_INK_BODY}">${subMeta}</text>`,
  );
  const specLine = escapeImpositionSvgXml(
    `대수 ${String(plan.signatureCount)}개 × ${String(plan.signatureSizePages)}p · 총 시트 ${String(plan.totalSheetCount)}장 · 책등 폭 ${fmtNum(plan.spineWidthMm, 2)}mm · 최대 크리프 보정 ${fmtNum(plan.maxCreepShiftTowardSpineMm, 2)}mm · 차단 ${String(audit.blockerCount)}건 / 경고 ${String(audit.warningCount)}건`,
  );
  lines.push(
    `<text x="${fmtNum(pad + 20)}" y="${fmtNum(yHeader + 75)}" font-family="system-ui, -apple-system, sans-serif" font-size="11.5" fill="${OKLCH_INK_MUTED}">${specLine}</text>`,
  );

  const badgeW = 114;
  const badgeX = pad + innerW - badgeW - 18;
  lines.push(
    `<rect x="${fmtNum(badgeX)}" y="${fmtNum(yHeader + 18)}" width="${fmtNum(badgeW)}" height="30" rx="8" fill="${badge.fill}" stroke="${badge.stroke}" stroke-width="1.6" />`,
  );
  lines.push(
    `<text x="${fmtNum(badgeX + badgeW / 2)}" y="${fmtNum(yHeader + 38)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="12.5" font-weight="700" fill="${badge.text}">${escapeImpositionSvgXml(badge.label)}</text>`,
  );

  // 2. 대수별 앞/뒷면 시트 조판 평면도
  lines.push(
    `<rect x="${fmtNum(pad)}" y="${fmtNum(yFlatPlan)}" width="${fmtNum(innerW)}" height="${fmtNum(flatPlanContentH)}" rx="14" fill="${OKLCH_BG_CARD}" stroke="${OKLCH_BORDER_SOFT}" stroke-width="1.2" />`,
  );
  lines.push(
    `<text x="${fmtNum(pad + 20)}" y="${fmtNum(yFlatPlan + 26)}" font-family="system-ui, -apple-system, sans-serif" font-size="13.5" font-weight="700" fill="${OKLCH_INK_TITLE}">대수별 앞면(FRONT)·뒷면(BACK) 시트 조판 평면도</text>`,
  );

  let cursorY = yFlatPlan + 40;
  const metaColW = 166;
  const sideGap = 18;
  const sideCardW = (innerW - 40 - metaColW - sideGap) / 2;

  for (let s = 0; s < visibleSignatures.length; s += 1) {
    const sig = visibleSignatures[s];
    if (!sig) continue;
    const sigHeading = escapeImpositionSvgXml(
      `대수 #${String(sig.signatureIndex + 1)} (p.${String(sig.startPage)}~p.${String(sig.endPage)} · 접지 페어 합 ${String(sig.expectedFoldPairSum)} · 시트 ${String(sig.nestedSheetCount)}장 · 최대 크리프 ${fmtNum(sig.maxCreepCompensationMm, 2)}mm)`,
    );
    lines.push(
      `<text x="${fmtNum(pad + 20)}" y="${fmtNum(cursorY + 15)}" font-family="system-ui, -apple-system, sans-serif" font-size="11.5" font-weight="700" fill="${OKLCH_ACCENT_FOREST}">${sigHeading}</text>`,
    );
    cursorY += sigHeaderH;

    const shownSheets = sig.sheets.slice(0, maxSheetsPerSig);
    for (let k = 0; k < shownSheets.length; k += 1) {
      const sh = shownSheets[k];
      if (!sh) continue;
      const rowX = pad + 20;
      const boxH = 64;

      lines.push(
        `<rect x="${fmtNum(rowX)}" y="${fmtNum(cursorY)}" width="${fmtNum(metaColW - 10)}" height="${fmtNum(boxH)}" rx="8" fill="${OKLCH_BG_LINEN}" stroke="${OKLCH_BORDER_SOFT}" stroke-width="1" />`,
      );
      lines.push(
        `<text x="${fmtNum(rowX + 10)}" y="${fmtNum(cursorY + 21)}" font-family="system-ui, -apple-system, sans-serif" font-size="11.5" font-weight="700" fill="${OKLCH_INK_TITLE}">시트 S${String(sh.sheetIndexInSignature)} (${sh.sheetNestDepth === 0 ? "최외곽" : `중첩 ${String(sh.sheetNestDepth)}`})</text>`,
      );
      lines.push(
        `<text x="${fmtNum(rowX + 10)}" y="${fmtNum(cursorY + 39)}" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" fill="${OKLCH_CREEP_BAR}">크리프 보정 → ${fmtNum(sh.creepShiftTowardSpineMm, 2)}mm ←</text>`,
      );
      lines.push(
        `<text x="${fmtNum(rowX + 10)}" y="${fmtNum(cursorY + 55)}" font-family="system-ui, -apple-system, sans-serif" font-size="10" fill="${OKLCH_INK_MUTED}">합 ${String(sh.front.foldPairSum)} · 회전 ${String(sh.headRotationDeg)}°</text>`,
      );

      const sides = [
        { label: "앞면 FRONT", pair: sh.front, x: rowX + metaColW },
        { label: "뒷면 BACK", pair: sh.back, x: rowX + metaColW + sideCardW + sideGap },
      ];

      for (let sideIdx = 0; sideIdx < sides.length; sideIdx += 1) {
        const sd = sides[sideIdx];
        if (!sd) continue;
        const halfW = sideCardW / 2;
        lines.push(
          `<rect x="${fmtNum(sd.x)}" y="${fmtNum(cursorY)}" width="${fmtNum(sideCardW)}" height="${fmtNum(boxH)}" rx="8" fill="${OKLCH_BG_SHEET}" stroke="${OKLCH_BORDER_STRONG}" stroke-width="1.1" />`,
        );
        if (sd.pair.leftIsBlankPadding) {
          lines.push(
            `<rect x="${fmtNum(sd.x + 1)}" y="${fmtNum(cursorY + 1)}" width="${fmtNum(halfW - 1)}" height="${fmtNum(boxH - 2)}" rx="7" fill="${OKLCH_BG_BLANK_PAGE}" />`,
          );
        }
        if (sd.pair.rightIsBlankPadding) {
          lines.push(
            `<rect x="${fmtNum(sd.x + halfW)}" y="${fmtNum(cursorY + 1)}" width="${fmtNum(halfW - 1)}" height="${fmtNum(boxH - 2)}" rx="7" fill="${OKLCH_BG_BLANK_PAGE}" />`,
          );
        }
        lines.push(
          `<line x1="${fmtNum(sd.x + halfW)}" y1="${fmtNum(cursorY + 4)}" x2="${fmtNum(sd.x + halfW)}" y2="${fmtNum(cursorY + boxH - 4)}" stroke="${OKLCH_ACCENT_FOREST}" stroke-width="1.2" stroke-dasharray="3 2" />`,
        );
        lines.push(
          `<text x="${fmtNum(sd.x + sideCardW / 2)}" y="${fmtNum(cursorY + 15)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="9.5" font-weight="700" fill="${OKLCH_INK_MUTED}">${sd.label}</text>`,
        );
        const leftText = sd.pair.leftIsBlankPadding
          ? `백지 p.${String(sd.pair.leftPage)}`
          : `p.${String(sd.pair.leftPage)}`;
        const rightText = sd.pair.rightIsBlankPadding
          ? `백지 p.${String(sd.pair.rightPage)}`
          : `p.${String(sd.pair.rightPage)}`;
        lines.push(
          `<text x="${fmtNum(sd.x + halfW * 0.5)}" y="${fmtNum(cursorY + 41)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="700" fill="${OKLCH_INK_TITLE}">${escapeImpositionSvgXml(leftText)}</text>`,
        );
        lines.push(
          `<text x="${fmtNum(sd.x + halfW * 1.5)}" y="${fmtNum(cursorY + 41)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="700" fill="${OKLCH_INK_TITLE}">${escapeImpositionSvgXml(rightText)}</text>`,
        );
        if (sh.creepShiftTowardSpineMm > 0) {
          lines.push(
            `<text x="${fmtNum(sd.x + halfW * 0.5)}" y="${fmtNum(cursorY + 56)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="9" fill="${OKLCH_CREEP_BAR}">+${fmtNum(sh.creepShiftTowardSpineMm, 2)}mm →</text>`,
          );
          lines.push(
            `<text x="${fmtNum(sd.x + halfW * 1.5)}" y="${fmtNum(cursorY + 56)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="9" fill="${OKLCH_CREEP_BAR}">← -${fmtNum(sh.creepShiftTowardSpineMm, 2)}mm</text>`,
          );
        }
      }

      cursorY += sigRowHeight;
    }
    cursorY += 14;
  }

  if (plan.signatures.length > visibleSignatures.length) {
    const omitted = plan.signatures.length - visibleSignatures.length;
    lines.push(
      `<text x="${fmtNum(pad + 20)}" y="${fmtNum(cursorY + 6)}" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="${OKLCH_INK_MUTED}">${escapeImpositionSvgXml(`외 ${String(omitted)}개 대수 생략 (전체 ${String(plan.signatureCount)}개 대수 · ${String(plan.paddedPageCount)}p 전수 순열 검증 완료)`)}</text>`,
    );
  }

  // 3. 시트 중첩별 크리프 보정 다이어그램
  lines.push(
    `<rect x="${fmtNum(pad)}" y="${fmtNum(yCreep)}" width="${fmtNum(innerW)}" height="${fmtNum(creepSectionH)}" rx="14" fill="${OKLCH_BG_CARD}" stroke="${OKLCH_BORDER_SOFT}" stroke-width="1.2" />`,
  );
  lines.push(
    `<text x="${fmtNum(pad + 20)}" y="${fmtNum(yCreep + 26)}" font-family="system-ui, -apple-system, sans-serif" font-size="13.5" font-weight="700" fill="${OKLCH_INK_TITLE}">시트 중첩 크리프(Creep) 보정 프로파일 및 책등 폭</text>`,
  );
  lines.push(
    `<text x="${fmtNum(pad + 20)}" y="${fmtNum(yCreep + 44)}" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="${OKLCH_INK_MUTED}">${escapeImpositionSvgXml(`용지 두께 ${fmtNum(plan.paperThicknessMm, 3)}mm · 표지/보드 ${fmtNum(plan.coverBoardThicknessMm, 2)}mm · 최종 책등 폭 ${fmtNum(plan.spineWidthMm, 2)}mm · 크리프 해소 외곽 침범 ${String(audit.outerTrimViolationsResolvedByCreepCount)}건`)}</text>`,
  );

  const maxCreepScale = Math.max(0.5, plan.maxCreepPushOutMm);
  const barTrackX = pad + 150;
  const barTrackW = innerW - 280;
  for (let i = 0; i < creepSheets.length; i += 1) {
    const sh = creepSheets[i];
    if (!sh) continue;
    const rowY = yCreep + 56 + i * 24;
    const ratio = clampFinite(sh.rawCreepPushOutMm / maxCreepScale, 0, 0, 1);
    const barW = Math.max(2, ratio * barTrackW);
    lines.push(
      `<text x="${fmtNum(pad + 20)}" y="${fmtNum(rowY + 13)}" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="${OKLCH_INK_BODY}">${escapeImpositionSvgXml(`S${String(sh.sheetIndexInSignature)} (p.${String(sh.front.leftPage)}/${String(sh.front.rightPage)})`)}</text>`,
    );
    lines.push(
      `<rect x="${fmtNum(barTrackX)}" y="${fmtNum(rowY + 2)}" width="${fmtNum(barTrackW)}" height="14" rx="4" fill="${OKLCH_CREEP_BAR_BG}" />`,
    );
    lines.push(
      `<rect x="${fmtNum(barTrackX)}" y="${fmtNum(rowY + 2)}" width="${fmtNum(barW)}" height="14" rx="4" fill="${OKLCH_CREEP_BAR}" />`,
    );
    lines.push(
      `<text x="${fmtNum(barTrackX + barTrackW + 10)}" y="${fmtNum(rowY + 13)}" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="600" fill="${OKLCH_INK_TITLE}">${fmtNum(sh.creepShiftTowardSpineMm, 3)}mm</text>`,
    );
  }

  // 4. 양면 스프레드 책등 금지대 및 재단선 다이어그램
  lines.push(
    `<rect x="${fmtNum(pad)}" y="${fmtNum(ySpread)}" width="${fmtNum(innerW)}" height="${fmtNum(spreadSectionH)}" rx="14" fill="${OKLCH_BG_CARD}" stroke="${OKLCH_BORDER_SOFT}" stroke-width="1.2" />`,
  );
  lines.push(
    `<text x="${fmtNum(pad + 20)}" y="${fmtNum(ySpread + 26)}" font-family="system-ui, -apple-system, sans-serif" font-size="13.5" font-weight="700" fill="${OKLCH_INK_TITLE}">양면 스프레드 책등 먹힘 금지대(±${fmtNum(audit.spineHiddenZoneMm, 1)}mm) · 외곽 안전 여백(${fmtNum(audit.safeMarginMm, 1)}mm) · 도련(${fmtNum(audit.minBleedMm, 1)}mm)</text>`,
  );

  const spreadMmW = Math.max(40, plan.trimWidthMm * 2);
  const spreadMmH = Math.max(20, plan.trimHeightMm);
  const availDrawW = innerW - 80;
  const availDrawH = 192;
  const scale = Math.min(availDrawW / (spreadMmW + 12), availDrawH / (spreadMmH + 12));
  const drawW = spreadMmW * scale;
  const drawH = spreadMmH * scale;
  const drawX = pad + (innerW - drawW) / 2;
  const drawY = ySpread + 48 + (availDrawH - drawH) / 2;
  const bleedPx = audit.minBleedMm * scale;
  const safePx = audit.safeMarginMm * scale;
  const gutterHalfPx = audit.spineHiddenZoneMm * scale;
  const spineCenterPx = drawX + drawW / 2;

  // 도련 외곽선
  lines.push(
    `<rect x="${fmtNum(drawX - bleedPx)}" y="${fmtNum(drawY - bleedPx)}" width="${fmtNum(drawW + bleedPx * 2)}" height="${fmtNum(drawH + bleedPx * 2)}" fill="none" stroke="${OKLCH_BLEED_DASH}" stroke-width="1.2" stroke-dasharray="4 3" />`,
  );
  // 재단선 (트림 영역)
  lines.push(
    `<rect x="${fmtNum(drawX)}" y="${fmtNum(drawY)}" width="${fmtNum(drawW)}" height="${fmtNum(drawH)}" fill="${OKLCH_BG_SHEET}" stroke="${OKLCH_INK_TITLE}" stroke-width="1.4" />`,
  );
  // 안전 여백선
  lines.push(
    `<rect x="${fmtNum(drawX + safePx)}" y="${fmtNum(drawY + safePx)}" width="${fmtNum(Math.max(4, drawW - safePx * 2))}" height="${fmtNum(Math.max(4, drawH - safePx * 2))}" fill="none" stroke="${OKLCH_SAFE_STROKE}" stroke-width="1" stroke-dasharray="5 3" />`,
  );
  // 중앙 책등 먹힘 금지대
  lines.push(
    `<rect x="${fmtNum(spineCenterPx - gutterHalfPx)}" y="${fmtNum(drawY)}" width="${fmtNum(gutterHalfPx * 2)}" height="${fmtNum(drawH)}" fill="${OKLCH_GUTTER_BAND}" stroke="${OKLCH_BLOCK_STROKE}" stroke-width="1" stroke-dasharray="2 2" />`,
  );
  // 중앙 책등 축선
  lines.push(
    `<line x1="${fmtNum(spineCenterPx)}" y1="${fmtNum(drawY - bleedPx)}" x2="${fmtNum(spineCenterPx)}" y2="${fmtNum(drawY + drawH + bleedPx)}" stroke="${OKLCH_BLOCK_STROKE}" stroke-width="1.6" />`,
  );

  const visibleOverlays = audit.boxOverlays.slice(0, 12);
  for (let i = 0; i < visibleOverlays.length; i += 1) {
    const ov = visibleOverlays[i];
    if (!ov) continue;
    const pal = statusPalette(ov.status);
    const bx = drawX + clampFinite(ov.spreadXMm, 0, -10, spreadMmW + 10) * scale;
    const by = drawY + clampFinite(ov.spreadYMm, 0, -10, spreadMmH + 10) * scale;
    const bw = Math.max(10, clampFinite(ov.widthMm, 10, 2, spreadMmW) * scale);
    const bh = Math.max(10, clampFinite(ov.heightMm, 10, 2, spreadMmH) * scale);
    const dash = ov.status === "warning" ? ' stroke-dasharray="3 2"' : "";
    lines.push(
      `<rect x="${fmtNum(bx)}" y="${fmtNum(by)}" width="${fmtNum(bw)}" height="${fmtNum(bh)}" rx="3" fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="1.6"${dash} />`,
    );
    const tag = escapeImpositionSvgXml(`${overlayCode(ov)} ${truncateText(ov.boxLabel, 10)}`);
    lines.push(
      `<text x="${fmtNum(bx + bw / 2)}" y="${fmtNum(by + bh / 2 + 3.5)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="9" font-weight="700" fill="${pal.text}">${tag}</text>`,
    );
  }

  lines.push(
    `<text x="${fmtNum(spineCenterPx)}" y="${fmtNum(ySpread + spreadSectionH - 12)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" fill="${OKLCH_INK_MUTED}">${escapeImpositionSvgXml(`중앙 책등 금지대 ±${fmtNum(audit.spineHiddenZoneMm, 1)}mm (책등 폭 ${fmtNum(plan.spineWidthMm, 2)}mm) · 감사 요소 ${String(audit.auditedBoxCount)}건 · 책등 먹힘 차단 ${String(audit.spineGutterBlockerCount)}건 · 도련 부족 차단 ${String(audit.insufficientBleedBlockerCount)}건`)}</text>`,
  );

  // 5. 푸터 (매니페스트 SHA-256 지문)
  lines.push(
    `<rect x="${fmtNum(pad)}" y="${fmtNum(yFooter)}" width="${fmtNum(innerW)}" height="${fmtNum(footerH)}" rx="10" fill="${OKLCH_BG_LINEN}" stroke="${OKLCH_BORDER_SOFT}" stroke-width="1" />`,
  );
  lines.push(
    `<text x="${fmtNum(pad + 16)}" y="${fmtNum(yFooter + 26)}" font-family="ui-monospace, SFMono-Regular, monospace" font-size="11" fill="${OKLCH_INK_BODY}">${escapeImpositionSvgXml(`출고 매니페스트 SHA-256: ${audit.impositionManifestSha256Hex.slice(0, 32)}… (조판 지문: ${plan.impositionManifestSha256Hex.slice(0, 16)}…)`)}</text>`,
  );

  lines.push("</svg>");
  return lines.join("\n");
}

/**
 * 웹툰 단행본 제작 PD와 인쇄소 오퍼레이터가 즉시 확인할 수 있는
 * 자연스러운 한국어 출고 QA 브리프를 생성한다.
 */
export function summarizeBookImpositionAuditKo(
  plan: BookSignatureImpositionPlan,
  audit: BookPrintSafetyAuditReport,
  options?: BookImpositionBriefOptions,
): string {
  const bindingLabel = BOOK_BINDING_PROFILES[plan.bindingMethod].labelKo;
  const directionLabel =
    plan.readingDirection === "ltr-korean-western"
      ? "좌철 (한국·서양 단행본, 1p=우측면)"
      : "우철 (일본 만화 방식, 1p=좌측면)";
  const verdict = audit.releaseReady
    ? audit.warningCount > 0
      ? `조건부 출고 가능 (차단 0건 · 경고 ${String(audit.warningCount)}건 확인 필요)`
      : "출고 승인 (차단 0건 · 경고 0건)"
    : `출고 보류 (차단 ${String(audit.blockerCount)}건 · 경고 ${String(audit.warningCount)}건)`;

  const maxFindingRows = Math.round(clampFinite(options?.maxFindingRows ?? 12, 12, 1, 50));
  const lines: string[] = [];

  lines.push(`# 단행본 인쇄 대수 조판 · 책등 안전 출고 브리프`);
  lines.push("");
  lines.push(`- 도서: ${plan.bookTitle} (${plan.bookId})`);
  if (options?.auditDateIso) {
    lines.push(`- 점검 일자: ${options.auditDateIso}`);
  }
  lines.push(`- 출고 판정: ${verdict}`);
  lines.push("");
  lines.push(`## 1. 제본 · 대수 조판 사양`);
  lines.push(`- 제본 방식: ${bindingLabel}`);
  lines.push(`- 읽기 방향: ${directionLabel}`);
  lines.push(
    `- 판형 및 도련: ${fmtNum(plan.trimWidthMm, 1)} × ${fmtNum(plan.trimHeightMm, 1)} mm (도련 ${fmtNum(plan.bleedMm, 1)} mm / 대지 ${fmtNum(plan.pressSheetSpreadWidthMm, 1)} × ${fmtNum(plan.pressSheetHeightMm, 1)} mm)`,
  );
  lines.push(
    `- 페이지 구성: 원고 ${String(plan.rawPageCount)}p + 자동 백지 패딩 ${String(plan.blankPaddingPageCount)}p = 총 ${String(plan.paddedPageCount)}p (${String(plan.signatureSizePages)}p 대수 기준 ${String(plan.signatureCount)}개 대수, 총 시트 ${String(plan.totalSheetCount)}장)`,
  );
  lines.push(
    `- 책등 폭 산출: 내지 ${fmtNum(plan.textBlockThicknessMm, 2)} mm (${String(plan.paddedPageCount / 2)}장 × ${fmtNum(plan.paperThicknessMm, 3)} mm) + 표지/보드 ${fmtNum(plan.coverBoardThicknessMm, 2)} mm = 총 ${fmtNum(plan.spineWidthMm, 2)} mm`,
  );
  lines.push("");
  lines.push(`## 2. 제책 크리프(Creep) 보정 결과`);
  lines.push(
    `- 보정 적용 여부: ${audit.creepCompensationApplied ? "적용 완료 (내측 시트 콘텐츠를 책등 방향으로 상쇄 이동)" : "미적용 (원본 좌표 기준 평가)"}`,
  );
  lines.push(
    `- 시트 밀림 범위: 최외곽 시트 0.00 mm → 최내측 시트 최대 ${fmtNum(plan.maxCreepPushOutMm, 3)} mm`,
  );
  lines.push(
    `- 외곽 재단 안전선(${fmtNum(audit.safeMarginMm, 1)} mm) 침범 변화: 보정 전 ${String(audit.beforeCreepOuterTrimViolationCount)}건 → 보정 후 ${String(audit.afterCreepOuterTrimViolationCount)}건 (크리프 보정으로 ${String(audit.outerTrimViolationsResolvedByCreepCount)}건 해소)`,
  );
  lines.push("");
  lines.push(`## 3. 책등 먹힘 · 재단 · 도련 감사 요약`);
  lines.push(
    `- 감사 범위: 개별 페이지 ${String(audit.auditedPageCount)}면 · 양면 스프레드 ${String(audit.auditedSpreadCount)}쌍 · 중요 요소 ${String(audit.auditedBoxCount)}개`,
  );
  lines.push(
    `- 책등 먹힘 차단(금지대 ${fmtNum(audit.spineHiddenZoneMm, 1)} mm): ${String(audit.spineGutterBlockerCount)}건`,
  );
  lines.push(
    `- 외곽/상하 재단 안전 여백 침범(안전선 ${fmtNum(audit.safeMarginMm, 1)} mm): ${String(audit.outerTrimViolationCount)}건`,
  );
  lines.push(
    `- 전면 도련 부족 차단(최소 ${fmtNum(audit.minBleedMm, 1)} mm): ${String(audit.insufficientBleedBlockerCount)}건`,
  );
  if (audit.nonFacingSpreadBlockerCount > 0) {
    lines.push(`- 비대면 스프레드 쌍 오류 차단: ${String(audit.nonFacingSpreadBlockerCount)}건`);
  }

  if (audit.findings.length === 0) {
    lines.push("");
    lines.push(`## 4. 제작 PD 조치 사항`);
    lines.push(`- 책등 먹힘, 외곽 재단 침범, 도련 부족 결함이 없습니다. 인쇄소 출고 데이터를 전달해도 안전합니다.`);
  } else {
    lines.push("");
    lines.push(`## 4. 검출 항목 및 수정 지침`);
    const shown = audit.findings.slice(0, maxFindingRows);
    for (let i = 0; i < shown.length; i += 1) {
      const f = shown[i];
      if (!f) continue;
      const sevTag = f.severity === "blocker" ? "[차단]" : "[경고]";
      lines.push(`- ${sevTag} ${f.messageKo}`);
      lines.push(`  조치: ${f.recommendationKo}`);
    }
    if (audit.findings.length > shown.length) {
      lines.push(`- 외 ${String(audit.findings.length - shown.length)}건의 추가 검출 항목이 남아 있습니다.`);
    }
  }

  lines.push("");
  lines.push(`## 5. 인쇄소 출고 매니페스트 지문`);
  lines.push(`- 조판 계획 SHA-256: ${audit.planManifestSha256Hex}`);
  lines.push(`- 최종 출고 매니페스트 SHA-256: ${audit.impositionManifestSha256Hex}`);

  return lines.join("\n");
}
