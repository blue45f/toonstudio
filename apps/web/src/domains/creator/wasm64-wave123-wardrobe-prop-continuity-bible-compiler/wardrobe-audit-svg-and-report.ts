/**
 * Wave 123 — 인쇄 안전 순수 OKLCH 연속성 타임라인 매트릭스 SVG 렌더러 및
 * 한국어 어시스턴트 작화 연속성 QA 검수 브리프 생성기.
 *
 * - 모든 색상은 순수 `oklch(...)` 및 `none`만 사용한다(`shadcn/no-raw-colors` 0건 위반).
 * - 모든 좌표 숫자에 유한수 가드를 적용해 `NaN`/`Infinity` 출력을 원천 차단한다.
 * - 모든 외부 문자열을 XML 이스케이프해 XSS/SVG 구문 파괴를 방지한다.
 * - 번역투 없는 실무형 한국어 어시스턴트 검수 요약을 생성한다.
 */

import {
  CATEGORY_LABEL_KO,
  EVENT_LABEL_KO,
  type EpisodeWardrobeContinuityAudit,
  type TimelineBadgeText,
  type TimelineCellAudit,
  type TimelineCellStatus,
  type WardrobeHandedness,
  type WardrobeSlotCategory,
} from "./wardrobe-continuity-types";

export interface WardrobeTimelineSvgOptions {
  readonly titleOverride?: string;
  readonly showDeltaEReadout?: boolean;
}

export interface WardrobeContinuityAuditSummaryKo {
  readonly verdictLabelKo: string;
  readonly headlineKo: string;
  readonly summaryParagraphKo: string;
  readonly damageContinuityNotesKo: readonly string[];
  readonly propAndChiralityNotesKo: readonly string[];
  readonly colorDriftNotesKo: readonly string[];
  readonly recommendedFixesKo: readonly string[];
  readonly markdownReportKo: string;
}

const OKLCH_PALETTE = {
  paperBg: "oklch(0.985 0.007 95)",
  cardBg: "oklch(1 0 0)",
  headerBg: "oklch(0.28 0.055 158)",
  headerInk: "oklch(0.985 0.005 95)",
  headerSubInk: "oklch(0.86 0.025 155)",
  tableHeaderBg: "oklch(0.955 0.012 145)",
  rowAltBg: "oklch(0.98 0.006 105)",
  borderSoft: "oklch(0.86 0.014 145)",
  borderStrong: "oklch(0.74 0.02 150)",
  inkPrimary: "oklch(0.21 0.02 250)",
  inkSecondary: "oklch(0.45 0.02 250)",
  inkMuted: "oklch(0.58 0.015 250)",
  passBg: "oklch(0.92 0.055 155)",
  passInk: "oklch(0.27 0.095 155)",
  passBorder: "oklch(0.72 0.09 155)",
  dmgBg: "oklch(0.93 0.045 235)",
  dmgInk: "oklch(0.32 0.11 245)",
  dmgBorder: "oklch(0.70 0.09 240)",
  healBg: "oklch(0.90 0.095 25)",
  healInk: "oklch(0.34 0.18 25)",
  healBorder: "oklch(0.58 0.21 25)",
  missBg: "oklch(0.91 0.085 38)",
  missInk: "oklch(0.35 0.16 35)",
  missBorder: "oklch(0.62 0.18 35)",
  flipBg: "oklch(0.91 0.085 325)",
  flipInk: "oklch(0.34 0.16 325)",
  flipBorder: "oklch(0.60 0.17 325)",
  colorBg: "oklch(0.94 0.085 82)",
  colorInk: "oklch(0.36 0.13 72)",
  colorBorder: "oklch(0.68 0.15 76)",
  neutralBg: "oklch(0.94 0.008 95)",
  neutralInk: "oklch(0.44 0.015 250)",
  neutralBorder: "oklch(0.80 0.012 95)",
  eventChipBg: "oklch(0.94 0.03 195)",
  eventChipInk: "oklch(0.33 0.08 210)",
  swatchBorder: "oklch(0.32 0.015 250)",
  footerBg: "oklch(0.96 0.008 95)",
} as const;

interface BadgeVisualStyle {
  readonly bg: string;
  readonly ink: string;
  readonly border: string;
}

interface MatrixColumnSpec {
  readonly slotId: string;
  readonly labelKo: string;
  readonly category: WardrobeSlotCategory;
  readonly handedness?: WardrobeHandedness;
  readonly canonicalOklchCss: string;
}

/** XML 특수문자(`&`, `<`, `>`, `"`, `'`)를 안전하게 이스케이프한다. */
export function escapeWardrobeSvgXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function resolveBadgeStyle(status: TimelineCellStatus): BadgeVisualStyle {
  switch (status) {
    case "healed-error":
      return {
        bg: OKLCH_PALETTE.healBg,
        ink: OKLCH_PALETTE.healInk,
        border: OKLCH_PALETTE.healBorder,
      };
    case "missing-error":
      return {
        bg: OKLCH_PALETTE.missBg,
        ink: OKLCH_PALETTE.missInk,
        border: OKLCH_PALETTE.missBorder,
      };
    case "flipped-error":
      return {
        bg: OKLCH_PALETTE.flipBg,
        ink: OKLCH_PALETTE.flipInk,
        border: OKLCH_PALETTE.flipBorder,
      };
    case "color-error":
      return {
        bg: OKLCH_PALETTE.colorBg,
        ink: OKLCH_PALETTE.colorInk,
        border: OKLCH_PALETTE.colorBorder,
      };
    case "damaged":
      return {
        bg: OKLCH_PALETTE.dmgBg,
        ink: OKLCH_PALETTE.dmgInk,
        border: OKLCH_PALETTE.dmgBorder,
      };
    case "ok":
    case "reset-ok":
      return {
        bg: OKLCH_PALETTE.passBg,
        ink: OKLCH_PALETTE.passInk,
        border: OKLCH_PALETTE.passBorder,
      };
    case "dropped":
    case "occluded":
    case "unobserved":
      return {
        bg: OKLCH_PALETTE.neutralBg,
        ink: OKLCH_PALETTE.neutralInk,
        border: OKLCH_PALETTE.neutralBorder,
      };
  }
}

function collectMatrixColumns(audit: EpisodeWardrobeContinuityAudit): readonly MatrixColumnSpec[] {
  const seen = new Map<string, MatrixColumnSpec>();
  for (const row of audit.cutRows) {
    for (const cell of row.cells) {
      if (!seen.has(cell.slotId)) {
        seen.set(cell.slotId, {
          slotId: cell.slotId,
          labelKo: cell.slotLabelKo,
          category: cell.category,
          handedness: cell.expectedHandedness,
          canonicalOklchCss: cell.canonicalOklchCss,
        });
      }
    }
  }
  if (seen.size === 0) {
    for (const character of audit.compiledBible.characters) {
      for (const outfit of character.outfits) {
        for (const slot of outfit.slots) {
          if (!seen.has(slot.slotId)) {
            seen.set(slot.slotId, {
              slotId: slot.slotId,
              labelKo: slot.labelKo,
              category: slot.category,
              handedness: slot.handedness,
              canonicalOklchCss: slot.canonicalOklchCss,
            });
          }
        }
      }
    }
  }
  return Array.from(seen.values());
}

function renderMatrixCellSvg(
  cell: TimelineCellAudit | undefined,
  x: number,
  y: number,
  colW: number,
  rowH: number,
  showDeltaE: boolean,
): string {
  if (!cell) {
    return [
      `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(colW)}" height="${fmt(rowH)}" fill="none" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1"/>`,
      `<text x="${fmt(x + colW * 0.5)}" y="${fmt(y + rowH * 0.55)}" text-anchor="middle" font-size="11" fill="${OKLCH_PALETTE.inkMuted}">—</text>`,
    ].join("");
  }

  const style = resolveBadgeStyle(cell.status);
  const badgeW = Math.min(72, colW - 18);
  const badgeH = 22;
  const badgeX = x + (colW - badgeW) * 0.5;
  const badgeY = y + 9;
  const parts: string[] = [
    `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(colW)}" height="${fmt(rowH)}" fill="none" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1"/>`,
    `<rect x="${fmt(badgeX)}" y="${fmt(badgeY)}" width="${fmt(badgeW)}" height="${fmt(badgeH)}" rx="6" fill="${style.bg}" stroke="${style.border}" stroke-width="1.2"/>`,
    `<text x="${fmt(badgeX + badgeW * 0.5)}" y="${fmt(badgeY + 14.5)}" text-anchor="middle" font-size="11" font-weight="700" fill="${style.ink}">${escapeWardrobeSvgXml(cell.badgeText)}</text>`,
  ];

  // 공식 OKLCH 스와치(좌) vs 관측 OKLCH 스와치(우) 비교 바
  const swatchW = 24;
  const swatchH = 11;
  const swatchY = badgeY + badgeH + 6;
  const pairStartX = x + (colW - (swatchW * 2 + 4)) * 0.5;
  parts.push(
    `<rect x="${fmt(pairStartX)}" y="${fmt(swatchY)}" width="${fmt(swatchW)}" height="${fmt(swatchH)}" rx="2.5" fill="${escapeWardrobeSvgXml(cell.canonicalOklchCss)}" stroke="${OKLCH_PALETTE.swatchBorder}" stroke-width="0.8"/>`,
  );
  if (cell.observedOklchCss) {
    parts.push(
      `<rect x="${fmt(pairStartX + swatchW + 4)}" y="${fmt(swatchY)}" width="${fmt(swatchW)}" height="${fmt(swatchH)}" rx="2.5" fill="${escapeWardrobeSvgXml(cell.observedOklchCss)}" stroke="${OKLCH_PALETTE.swatchBorder}" stroke-width="0.8"/>`,
    );
  } else {
    parts.push(
      `<rect x="${fmt(pairStartX + swatchW + 4)}" y="${fmt(swatchY)}" width="${fmt(swatchW)}" height="${fmt(swatchH)}" rx="2.5" fill="${OKLCH_PALETTE.neutralBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="0.8" stroke-dasharray="2,2"/>`,
    );
  }

  if (showDeltaE && cell.oklabDeltaE !== undefined && Number.isFinite(cell.oklabDeltaE)) {
    const deColor = cell.violationCodes.includes("palette-color-drift")
      ? OKLCH_PALETTE.colorInk
      : OKLCH_PALETTE.inkSecondary;
    parts.push(
      `<text x="${fmt(x + colW * 0.5)}" y="${fmt(swatchY + swatchH + 12)}" text-anchor="middle" font-size="9.5" fill="${deColor}">ΔE ${fmt(cell.oklabDeltaE)}</text>`,
    );
  }

  return parts.join("");
}

/**
 * 컷 × 의상/소품 슬롯 인과 연속성 타임라인 매트릭스를 인쇄 안전 순수 OKLCH SVG로 렌더링한다.
 */
export function renderWardrobeContinuityTimelineSvg(
  audit: EpisodeWardrobeContinuityAudit,
  options?: WardrobeTimelineSvgOptions,
): string {
  const showDeltaE = options?.showDeltaEReadout ?? true;
  const columns = collectMatrixColumns(audit);
  const pad = 20;
  const headerH = 68;
  const legendH = 34;
  const colHeaderH = 62;
  const leftColW = 216;
  const slotColW = 114;
  const rowH = 66;
  const footerH = 44;

  const matrixW = leftColW + Math.max(1, columns.length) * slotColW;
  const totalW = Math.max(760, pad * 2 + matrixW);
  const bodyRowsH = audit.cutRows.length > 0 ? audit.cutRows.length * rowH : 88;
  const totalH = pad * 2 + headerH + legendH + colHeaderH + bodyRowsH + footerH + 16;

  const verdictStyle =
    audit.passStatus === "pass"
      ? { label: "원고 통과", bg: OKLCH_PALETTE.passBg, ink: OKLCH_PALETTE.passInk }
      : audit.passStatus === "warn"
        ? { label: "주의 검토", bg: OKLCH_PALETTE.colorBg, ink: OKLCH_PALETTE.colorInk }
        : { label: "출고 차단", bg: OKLCH_PALETTE.healBg, ink: OKLCH_PALETTE.healInk };

  const titleText =
    options?.titleOverride ??
    `${audit.episodeId} · ${audit.episodeTitleKo} — 의상·소품 인과 연속성 타임라인`;

  const legendItems: readonly { readonly badge: TimelineBadgeText; readonly status: TimelineCellStatus; readonly caption: string }[] = [
    { badge: "OK", status: "ok", caption: "정상" },
    { badge: "DMG", status: "damaged", caption: "손상 유지" },
    { badge: "HEAL!", status: "healed-error", caption: "미설명 복구" },
    { badge: "MISS", status: "missing-error", caption: "소품 누락" },
    { badge: "FLIP", status: "flipped-error", caption: "좌우 반전" },
    { badge: "COLOR", status: "color-error", caption: "색채 이탈" },
  ];

  const svgParts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(totalW)} ${fmt(totalH)}" width="${fmt(totalW)}" height="${fmt(totalH)}" role="img" aria-label="${escapeWardrobeSvgXml(titleText)}">`,
    `<rect x="0" y="0" width="${fmt(totalW)}" height="${fmt(totalH)}" fill="${OKLCH_PALETTE.paperBg}"/>`,
    // 헤더 배너
    `<rect x="${fmt(pad)}" y="${fmt(pad)}" width="${fmt(totalW - pad * 2)}" height="${fmt(headerH)}" rx="10" fill="${OKLCH_PALETTE.headerBg}"/>`,
    `<text x="${fmt(pad + 18)}" y="${fmt(pad + 29)}" font-size="16" font-weight="700" fill="${OKLCH_PALETTE.headerInk}">${escapeWardrobeSvgXml(titleText)}</text>`,
    `<text x="${fmt(pad + 18)}" y="${fmt(pad + 50)}" font-size="11.5" fill="${OKLCH_PALETTE.headerSubInk}">연속성 점수 ${fmt(audit.continuityScore)}점 · 검수 ${fmt(audit.totalCutsAudited)}컷 · 차단 ${fmt(audit.blockerCount)}건 · 경고 ${fmt(audit.warningCount)}건 · 바이블 SHA-256 ${escapeWardrobeSvgXml(audit.bibleSha256Hex.slice(0, 12))}</text>`,
    `<rect x="${fmt(totalW - pad - 116)}" y="${fmt(pad + 19)}" width="98" height="30" rx="8" fill="${verdictStyle.bg}"/>`,
    `<text x="${fmt(totalW - pad - 67)}" y="${fmt(pad + 38.5)}" text-anchor="middle" font-size="12.5" font-weight="700" fill="${verdictStyle.ink}">${escapeWardrobeSvgXml(verdictStyle.label)}</text>`,
  ];

  // 범례 스트립
  const legendY = pad + headerH + 8;
  svgParts.push(
    `<rect x="${fmt(pad)}" y="${fmt(legendY)}" width="${fmt(totalW - pad * 2)}" height="${fmt(legendH)}" rx="8" fill="${OKLCH_PALETTE.cardBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1"/>`,
  );
  let lx = pad + 14;
  for (const item of legendItems) {
    const st = resolveBadgeStyle(item.status);
    svgParts.push(
      `<rect x="${fmt(lx)}" y="${fmt(legendY + 7)}" width="46" height="20" rx="5" fill="${st.bg}" stroke="${st.border}" stroke-width="1"/>`,
      `<text x="${fmt(lx + 23)}" y="${fmt(legendY + 20.5)}" text-anchor="middle" font-size="9.5" font-weight="700" fill="${st.ink}">${escapeWardrobeSvgXml(item.badge)}</text>`,
      `<text x="${fmt(lx + 52)}" y="${fmt(legendY + 20.5)}" font-size="10.5" fill="${OKLCH_PALETTE.inkSecondary}">${escapeWardrobeSvgXml(item.caption)}</text>`,
    );
    lx += 116;
  }

  // 매트릭스 테이블 헤더
  const tableX = pad;
  const tableY = legendY + legendH + 8;
  const tableW = totalW - pad * 2;
  svgParts.push(
    `<rect x="${fmt(tableX)}" y="${fmt(tableY)}" width="${fmt(tableW)}" height="${fmt(colHeaderH)}" fill="${OKLCH_PALETTE.tableHeaderBg}" stroke="${OKLCH_PALETTE.borderStrong}" stroke-width="1"/>`,
    `<text x="${fmt(tableX + 14)}" y="${fmt(tableY + 26)}" font-size="12" font-weight="700" fill="${OKLCH_PALETTE.inkPrimary}">컷 / 캐릭터 / 활성 착장</text>`,
    `<text x="${fmt(tableX + 14)}" y="${fmt(tableY + 45)}" font-size="10" fill="${OKLCH_PALETTE.inkSecondary}">스와치 좌: 공식 바이블 · 우: 컷 관측</text>`,
  );

  for (let c = 0; c < columns.length; c += 1) {
    const col = columns[c];
    const cx = tableX + leftColW + c * slotColW;
    const handTag =
      col.handedness === "left" ? " [L]" : col.handedness === "right" ? " [R]" : col.handedness === "center" ? " [C]" : "";
    const shortLabel = col.labelKo.length > 10 ? `${col.labelKo.slice(0, 9)}…` : col.labelKo;
    svgParts.push(
      `<line x1="${fmt(cx)}" y1="${fmt(tableY)}" x2="${fmt(cx)}" y2="${fmt(tableY + colHeaderH)}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1"/>`,
      `<rect x="${fmt(cx + 10)}" y="${fmt(tableY + 8)}" width="${fmt(slotColW - 20)}" height="8" rx="3" fill="${escapeWardrobeSvgXml(col.canonicalOklchCss)}" stroke="${OKLCH_PALETTE.swatchBorder}" stroke-width="0.7"/>`,
      `<text x="${fmt(cx + slotColW * 0.5)}" y="${fmt(tableY + 34)}" text-anchor="middle" font-size="11" font-weight="700" fill="${OKLCH_PALETTE.inkPrimary}">${escapeWardrobeSvgXml(shortLabel)}</text>`,
      `<text x="${fmt(cx + slotColW * 0.5)}" y="${fmt(tableY + 50)}" text-anchor="middle" font-size="9.5" fill="${OKLCH_PALETTE.inkSecondary}">${escapeWardrobeSvgXml(`${CATEGORY_LABEL_KO[col.category]}${handTag}`)}</text>`,
    );
  }

  // 본문 컷 행
  const bodyY = tableY + colHeaderH;
  if (audit.cutRows.length === 0) {
    svgParts.push(
      `<rect x="${fmt(tableX)}" y="${fmt(bodyY)}" width="${fmt(tableW)}" height="${fmt(bodyRowsH)}" fill="${OKLCH_PALETTE.cardBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1"/>`,
      `<text x="${fmt(tableX + tableW * 0.5)}" y="${fmt(bodyY + 48)}" text-anchor="middle" font-size="13" fill="${OKLCH_PALETTE.inkSecondary}">검수할 컷 관측 데이터가 아직 없습니다.</text>`,
    );
  } else {
    for (let r = 0; r < audit.cutRows.length; r += 1) {
      const row = audit.cutRows[r];
      const ry = bodyY + r * rowH;
      const rowBg = r % 2 === 1 ? OKLCH_PALETTE.rowAltBg : OKLCH_PALETTE.cardBg;
      svgParts.push(
        `<rect x="${fmt(tableX)}" y="${fmt(ry)}" width="${fmt(tableW)}" height="${fmt(rowH)}" fill="${rowBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1"/>`,
        `<text x="${fmt(tableX + 12)}" y="${fmt(ry + 21)}" font-size="11.5" font-weight="700" fill="${OKLCH_PALETTE.inkPrimary}">${escapeWardrobeSvgXml(`${row.cutId} · ${row.characterNameKo}`)}</text>`,
        `<text x="${fmt(tableX + 12)}" y="${fmt(ry + 38)}" font-size="10" fill="${OKLCH_PALETTE.inkSecondary}">${escapeWardrobeSvgXml(row.activeOutfitLabelKo)}</text>`,
      );

      if (row.eventsApplied.length > 0) {
        const eventSummary = row.eventsApplied.map((e) => EVENT_LABEL_KO[e]).join(" · ");
        const clipped = eventSummary.length > 22 ? `${eventSummary.slice(0, 21)}…` : eventSummary;
        svgParts.push(
          `<rect x="${fmt(tableX + 12)}" y="${fmt(ry + 44)}" width="${fmt(leftColW - 24)}" height="16" rx="4" fill="${OKLCH_PALETTE.eventChipBg}"/>`,
          `<text x="${fmt(tableX + 18)}" y="${fmt(ry + 55.5)}" font-size="9.5" font-weight="600" fill="${OKLCH_PALETTE.eventChipInk}">${escapeWardrobeSvgXml(clipped)}</text>`,
        );
      }

      const cellBySlot = new Map<string, TimelineCellAudit>();
      for (const cell of row.cells) {
        cellBySlot.set(cell.slotId, cell);
      }
      for (let c = 0; c < columns.length; c += 1) {
        const cx = tableX + leftColW + c * slotColW;
        svgParts.push(
          renderMatrixCellSvg(cellBySlot.get(columns[c].slotId), cx, ry, slotColW, rowH, showDeltaE),
        );
      }
    }
  }

  // 푸터 요약 바
  const footerY = bodyY + bodyRowsH + 8;
  svgParts.push(
    `<rect x="${fmt(pad)}" y="${fmt(footerY)}" width="${fmt(tableW)}" height="${fmt(footerH)}" rx="8" fill="${OKLCH_PALETTE.footerBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1"/>`,
    `<text x="${fmt(pad + 14)}" y="${fmt(footerY + 18)}" font-size="10.5" fill="${OKLCH_PALETTE.inkPrimary}">미설명 복구 ${fmt(audit.countsByCode["spontaneous-damage-healing"])} · 소품 누락 ${fmt(audit.countsByCode["missing-signature-prop"])} · 좌우 반전 ${fmt(audit.countsByCode["accessory-handedness-flip"])} · 색채 이탈 ${fmt(audit.countsByCode["palette-color-drift"])}</text>`,
    `<text x="${fmt(pad + 14)}" y="${fmt(footerY + 34)}" font-size="9.5" fill="${OKLCH_PALETTE.inkMuted}">감사 지문 SHA-256: ${escapeWardrobeSvgXml(audit.auditSha256Hex)}</text>`,
    `</svg>`,
  );

  return svgParts.join("");
}

/**
 * 번역투 없는 실무형 한국어 어시스턴트 의상·소품 연속성 QA 브리프를 생성한다.
 */
export function summarizeWardrobeContinuityAuditKo(
  audit: EpisodeWardrobeContinuityAudit,
): WardrobeContinuityAuditSummaryKo {
  const verdictLabelKo =
    audit.passStatus === "pass"
      ? "원고 통과"
      : audit.passStatus === "warn"
        ? "주의 검토 필요"
        : "출고 차단";

  const headlineKo =
    audit.passStatus === "pass"
      ? `[${audit.episodeId}] ${audit.episodeTitleKo} — 의상·소품 인과 연속성 통과 (${audit.continuityScore.toFixed(1)}점)`
      : `[${audit.episodeId}] ${audit.episodeTitleKo} — ${verdictLabelKo} (차단 ${audit.blockerCount}건, 경고 ${audit.warningCount}건)`;

  const summaryParagraphKo =
    audit.totalCutsAudited === 0
      ? `${audit.episodeTitleKo}에 제출된 컷 관측 데이터가 아직 없어 기준 점수 ${audit.continuityScore.toFixed(1)}점으로 대기 상태입니다.`
      : audit.findings.length === 0
        ? `총 ${audit.totalCutsAudited}개 컷(${audit.totalSlotChecks}개 슬롯)을 검수한 결과 의상 손상 인과, 필수 소품, 착용 방향, 공식 배색이 모두 일치해 ${audit.continuityScore.toFixed(1)}점으로 원고 통과 기준을 충족했습니다.`
        : `총 ${audit.totalCutsAudited}개 컷(${audit.totalSlotChecks}개 슬롯)에서 차단 ${audit.blockerCount}건과 경고 ${audit.warningCount}건이 확인되어 연속성 점수는 ${audit.continuityScore.toFixed(1)}점입니다. 마감 전 아래 수정 항목을 먼저 반영해 주세요.`;

  const damageContinuityNotesKo = audit.findings
    .filter((f) => f.code === "spontaneous-damage-healing")
    .map((f) => `${f.cutId} (${f.slotLabelKo ?? f.slotId ?? "슬롯"}): ${f.messageKo}`);

  const propAndChiralityNotesKo = audit.findings
    .filter((f) => f.code === "missing-signature-prop" || f.code === "accessory-handedness-flip")
    .map((f) => `${f.cutId} (${f.slotLabelKo ?? f.slotId ?? "슬롯"}): ${f.messageKo}`);

  const colorDriftNotesKo = audit.findings
    .filter((f) => f.code === "palette-color-drift")
    .map((f) => `${f.cutId} (${f.slotLabelKo ?? f.slotId ?? "슬롯"}): ${f.messageKo}`);

  const recommendedFixesKo = audit.findings.map(
    (f) => `[${f.findingId} · ${f.cutId}] ${f.remediationKo}`,
  );

  const lines: string[] = [
    `## ${headlineKo}`,
    "",
    `- **판정**: ${verdictLabelKo} (${audit.continuityScore.toFixed(1)}점)`,
    `- **검수 규모**: ${audit.totalCutsAudited}컷 / ${audit.totalSlotChecks}슬롯`,
    `- **바이블 SHA-256**: \`${audit.bibleSha256Hex.slice(0, 16)}\``,
    `- **감사 지문 SHA-256**: \`${audit.auditSha256Hex.slice(0, 16)}\``,
    "",
    summaryParagraphKo,
  ];

  if (damageContinuityNotesKo.length > 0) {
    lines.push("", "### 1. 손상 인과 복구 작붕", ...damageContinuityNotesKo.map((n) => `- ${n}`));
  }
  if (propAndChiralityNotesKo.length > 0) {
    lines.push(
      "",
      "### 2. 필수 소품 누락 및 좌우 착용 반전",
      ...propAndChiralityNotesKo.map((n) => `- ${n}`),
    );
  }
  if (colorDriftNotesKo.length > 0) {
    lines.push("", "### 3. 공식 배색 OKLab ΔE 이탈", ...colorDriftNotesKo.map((n) => `- ${n}`));
  }
  if (recommendedFixesKo.length > 0) {
    lines.push("", "### 어시스턴트 수정 체크리스트", ...recommendedFixesKo.map((r) => `- ${r}`));
  } else {
    lines.push("", "### 어시스턴트 수정 체크리스트", "- 수정할 작화 연속성 오류가 없습니다.");
  }

  return {
    verdictLabelKo,
    headlineKo,
    summaryParagraphKo,
    damageContinuityNotesKo,
    propAndChiralityNotesKo,
    colorDriftNotesKo,
    recommendedFixesKo,
    markdownReportKo: lines.join("\n"),
  };
}
