/**
 * Wave 107 — 다국어 폰트 서브셋·일본어 세로쓰기(Tategaki) 고대비 OKLCH SVG 시트 및 한국어 QA 요약.
 *
 * - 모든 색상은 인쇄 대응 고대비 `oklch(...)` 토큰만 사용한다(raw hex / rgb 문자열 0건).
 * - 모든 수치 좌표에 유한수 가드를 적용해 `NaN`/`Infinity` 출력을 원천 차단하고,
 *   모든 텍스트를 XML 이스케이프한다.
 * - 번역투 없는 자연스러운 한국어 현지화 QA 감사 보고서를 생성한다.
 */

import type { TategakiTypesetLayout } from "./japanese-tategaki-vertical-typesetter";
import type { EpisodeFontSubsetAuditResult } from "./multilingual-font-subset-and-tofu-auditor";

export interface MultilingualTypographySvgOptions {
  readonly titleOverride?: string;
  readonly showColumnGuides?: boolean;
}

const OKLCH_PALETTE = {
  canvas: "oklch(0.985 0.008 92)",
  card: "oklch(0.996 0.003 92)",
  panel: "oklch(0.955 0.012 92)",
  border: "oklch(0.32 0.035 155 / 0.22)",
  guide: "oklch(0.45 0.03 155 / 0.24)",
  inkPrimary: "oklch(0.2 0.025 155)",
  inkSecondary: "oklch(0.42 0.025 155)",
  forestFill: "oklch(0.94 0.028 158)",
  forestStroke: "oklch(0.36 0.08 158)",
  forestInk: "oklch(0.25 0.065 158)",
  indigoFill: "oklch(0.94 0.032 255)",
  indigoStroke: "oklch(0.46 0.125 255)",
  indigoInk: "oklch(0.32 0.1 255)",
  amberFill: "oklch(0.96 0.035 75)",
  amberStroke: "oklch(0.56 0.13 65)",
  amberInk: "oklch(0.38 0.095 62)",
  crimsonFill: "oklch(0.95 0.036 25)",
  crimsonStroke: "oklch(0.49 0.175 25)",
  crimsonInk: "oklch(0.34 0.13 25)",
  barTrack: "oklch(0.9 0.015 92)",
} as const;

/** XML 특수문자(`&`, `<`, `>`, `"`, `'`)를 안전하게 이스케이프한다. */
export function escapeTypographySvgXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmtSvgNum(value: number, fallback = 0): string {
  const safe = Number.isFinite(value) ? Math.round(value * 100) / 100 : fallback;
  return String(safe);
}

function clampFiniteSvg(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function formatByteSizeHuman(bytes: number): string {
  const safe = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  if (safe >= 1_000_000) {
    return `${(safe / 1_000_000).toFixed(2)} MB`;
  }
  if (safe >= 1_000) {
    return `${(safe / 1_000).toFixed(1)} KB`;
  }
  return `${Math.round(safe)} B`;
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

/**
 * 일본어 세로쓰기(Tategaki) 열·루비·종중횡 미리보기와 다국어 폰트 서브셋
 * 용량 절감 바를 고대비 OKLCH 인쇄 대응 SVG 시트로 렌더링한다.
 */
export function renderMultilingualTypographySheetSvg(
  tategakiLayout: TategakiTypesetLayout,
  subsetAudit: EpisodeFontSubsetAuditResult,
  options?: MultilingualTypographySvgOptions,
): string {
  const showColumnGuides = options?.showColumnGuides !== false;
  const pad = 20;
  const headerH = 68;
  const previewW = clampFiniteSvg(tategakiLayout.totalWidthPx, 280, 1200, 360);
  const previewH = clampFiniteSvg(tategakiLayout.totalHeightPx, 240, 1200, 320);
  const panelGap = 20;
  const auditPanelW = 360;
  const fontRowCount = Math.max(1, subsetAudit.fontPlans.length);
  const auditMinH = 224 + fontRowCount * 34;
  const bodyH = Math.max(previewH + 40, auditMinH);
  const totalW = pad * 2 + previewW + panelGap + auditPanelW;
  const totalH = pad * 2 + headerH + bodyH;

  const titleText =
    options?.titleOverride ??
    `${subsetAudit.episodeTitle} · ${subsetAudit.locale} (${subsetAudit.writingDirection})`;
  const gateFill = subsetAudit.releaseReady ? OKLCH_PALETTE.forestFill : OKLCH_PALETTE.crimsonFill;
  const gateStroke = subsetAudit.releaseReady
    ? OKLCH_PALETTE.forestStroke
    : OKLCH_PALETTE.crimsonStroke;
  const gateInk = subsetAudit.releaseReady ? OKLCH_PALETTE.forestInk : OKLCH_PALETTE.crimsonInk;
  const gateLabel = subsetAudit.releaseReady ? "출고 가능" : "출고 차단";

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmtSvgNum(totalW)}" height="${fmtSvgNum(totalH)}" viewBox="0 0 ${fmtSvgNum(totalW)} ${fmtSvgNum(totalH)}" role="img" aria-label="${escapeTypographySvgXml(`다국어 폰트 서브셋 및 일본어 세로쓰기 검수 시트: ${titleText}`)}">`,
  );
  lines.push(`  <title>${escapeTypographySvgXml(titleText)}</title>`);
  lines.push(
    `  <rect x="0" y="0" width="${fmtSvgNum(totalW)}" height="${fmtSvgNum(totalH)}" fill="${OKLCH_PALETTE.canvas}" />`,
  );

  // 상단 헤더 카드
  lines.push(
    `  <rect x="${fmtSvgNum(pad)}" y="${fmtSvgNum(pad)}" width="${fmtSvgNum(totalW - pad * 2)}" height="${fmtSvgNum(headerH - 10)}" rx="10" fill="${OKLCH_PALETTE.card}" stroke="${OKLCH_PALETTE.border}" stroke-width="1" />`,
  );
  lines.push(
    `  <text x="${fmtSvgNum(pad + 16)}" y="${fmtSvgNum(pad + 25)}" font-family="Pretendard, Noto Sans JP, sans-serif" font-size="15" font-weight="700" fill="${OKLCH_PALETTE.inkPrimary}">${escapeTypographySvgXml(truncateText(titleText, 64))}</text>`,
  );
  lines.push(
    `  <text x="${fmtSvgNum(pad + 16)}" y="${fmtSvgNum(pad + 45)}" font-family="ui-monospace, SFMono-Regular, monospace" font-size="11" fill="${OKLCH_PALETTE.inkSecondary}">${escapeTypographySvgXml(`SHA-256 ${subsetAudit.subsetManifestSha256.slice(0, 16)} · 두부 ${subsetAudit.tofuCount}건 · 금칙 위반 ${tategakiLayout.kinsokuViolationCount}건 · 루비 겹침 ${tategakiLayout.rubyColumnOverlapCount}건`)}</text>`,
  );
  lines.push(
    `  <rect x="${fmtSvgNum(totalW - pad - 106)}" y="${fmtSvgNum(pad + 15)}" width="90" height="28" rx="6" fill="${gateFill}" stroke="${gateStroke}" stroke-width="1.2" />`,
  );
  lines.push(
    `  <text x="${fmtSvgNum(totalW - pad - 61)}" y="${fmtSvgNum(pad + 33)}" text-anchor="middle" font-family="Pretendard, sans-serif" font-size="12" font-weight="700" fill="${gateInk}">${gateLabel}</text>`,
  );

  // 좌측: 일본어 세로쓰기(Tategaki) 미리보기 카드
  const previewX = pad;
  const previewY = pad + headerH;
  lines.push(
    `  <rect x="${fmtSvgNum(previewX)}" y="${fmtSvgNum(previewY)}" width="${fmtSvgNum(previewW)}" height="${fmtSvgNum(bodyH)}" rx="10" fill="${OKLCH_PALETTE.card}" stroke="${OKLCH_PALETTE.border}" stroke-width="1" />`,
  );
  lines.push(
    `  <rect x="${fmtSvgNum(previewX)}" y="${fmtSvgNum(previewY)}" width="${fmtSvgNum(previewW)}" height="32" rx="10" fill="${OKLCH_PALETTE.panel}" />`,
  );
  lines.push(
    `  <text x="${fmtSvgNum(previewX + 14)}" y="${fmtSvgNum(previewY + 21)}" font-family="Pretendard, Noto Sans JP, sans-serif" font-size="12" font-weight="700" fill="${OKLCH_PALETTE.inkPrimary}">일본어 세로쓰기 (縦書き · 우→좌 열 진행)</text>`,
  );

  const stageOffsetX = previewX;
  const stageOffsetY = previewY + 34;

  // 열 가이드 및 열 번호
  if (showColumnGuides) {
    for (let c = 0; c < tategakiLayout.columns.length; c += 1) {
      const col = tategakiLayout.columns[c];
      const gx = stageOffsetX + col.x;
      lines.push(
        `  <line x1="${fmtSvgNum(gx)}" y1="${fmtSvgNum(stageOffsetY + 12)}" x2="${fmtSvgNum(gx)}" y2="${fmtSvgNum(stageOffsetY + previewH - 12)}" stroke="${OKLCH_PALETTE.guide}" stroke-width="1" stroke-dasharray="3 3" />`,
      );
      lines.push(
        `  <text x="${fmtSvgNum(gx)}" y="${fmtSvgNum(stageOffsetY + 11)}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="9" fill="${OKLCH_PALETTE.inkSecondary}">${escapeTypographySvgXml(`C${c + 1}`)}</text>`,
      );
    }
  }

  // 글리프 렌더링 (종중횡 하이라이트 박스 + 세로 회전 + 광학 오프셋)
  for (let c = 0; c < tategakiLayout.columns.length; c += 1) {
    const col = tategakiLayout.columns[c];
    for (let g = 0; g < col.glyphs.length; g += 1) {
      const glyph = col.glyphs[g];
      const cx = stageOffsetX + glyph.x + glyph.opticalOffsetX;
      const cy = stageOffsetY + glyph.y + glyph.opticalOffsetY;

      if (glyph.isTateChuYoko) {
        const boxW = glyph.fontSizePx * 0.96;
        const boxH = glyph.fontSizePx * 0.92;
        lines.push(
          `  <rect data-tate-chu-yoko="true" x="${fmtSvgNum(cx - boxW / 2)}" y="${fmtSvgNum(cy - boxH / 2)}" width="${fmtSvgNum(boxW)}" height="${fmtSvgNum(boxH)}" rx="4" fill="${OKLCH_PALETTE.indigoFill}" stroke="${OKLCH_PALETTE.indigoStroke}" stroke-width="1" />`,
        );
      } else if (glyph.verticalRotated) {
        const boxSize = glyph.fontSizePx * 0.88;
        lines.push(
          `  <rect data-vertical-rotated="true" x="${fmtSvgNum(stageOffsetX + glyph.x - boxSize / 2)}" y="${fmtSvgNum(stageOffsetY + glyph.y - boxSize / 2)}" width="${fmtSvgNum(boxSize)}" height="${fmtSvgNum(boxSize)}" rx="3" fill="${OKLCH_PALETTE.amberFill}" stroke="${OKLCH_PALETTE.amberStroke}" stroke-opacity="0.45" stroke-width="0.8" />`,
        );
      }

      const transformAttr = glyph.verticalRotated
        ? ` transform="rotate(${fmtSvgNum(glyph.rotationDeg)}, ${fmtSvgNum(cx)}, ${fmtSvgNum(cy)})"`
        : "";
      const fillInk = glyph.isTateChuYoko ? OKLCH_PALETTE.indigoInk : OKLCH_PALETTE.inkPrimary;
      const drawFontSize = glyph.isTateChuYoko ? glyph.fontSizePx * 0.72 : glyph.fontSizePx;

      lines.push(
        `  <text data-glyph-id="${escapeTypographySvgXml(glyph.glyphId)}" x="${fmtSvgNum(cx)}" y="${fmtSvgNum(cy)}" text-anchor="middle" dominant-baseline="central" font-family="Noto Sans JP, Hiragino Kaku Gothic ProN, sans-serif" font-size="${fmtSvgNum(drawFontSize)}" font-weight="${glyph.isTateChuYoko ? "700" : "500"}" fill="${fillInk}"${transformAttr}>${escapeTypographySvgXml(glyph.text)}</text>`,
      );
    }
  }

  // 루비 후리가나 렌더링 (부모 한자 런 우측)
  for (let r = 0; r < tategakiLayout.rubyAnnotations.length; r += 1) {
    const ruby = tategakiLayout.rubyAnnotations[r];
    lines.push(
      `  <g data-ruby-id="${escapeTypographySvgXml(ruby.rubyId)}" data-ruby-reading="${escapeTypographySvgXml(ruby.reading)}">`,
    );
    for (let k = 0; k < ruby.characters.length; k += 1) {
      const ch = ruby.characters[k];
      lines.push(
        `    <text x="${fmtSvgNum(stageOffsetX + ch.x)}" y="${fmtSvgNum(stageOffsetY + ch.y)}" text-anchor="middle" dominant-baseline="central" font-family="Noto Sans JP, Hiragino Kaku Gothic ProN, sans-serif" font-size="${fmtSvgNum(ruby.fontSizePx)}" fill="${OKLCH_PALETTE.amberInk}">${escapeTypographySvgXml(ch.char)}</text>`,
      );
    }
    lines.push("  </g>");
  }

  // 우측: 다국어 폰트 서브셋 용량 절감 및 무두부 감사 패널
  const auditX = previewX + previewW + panelGap;
  const auditY = previewY;
  lines.push(
    `  <rect x="${fmtSvgNum(auditX)}" y="${fmtSvgNum(auditY)}" width="${fmtSvgNum(auditPanelW)}" height="${fmtSvgNum(bodyH)}" rx="10" fill="${OKLCH_PALETTE.card}" stroke="${OKLCH_PALETTE.border}" stroke-width="1" />`,
  );
  lines.push(
    `  <rect x="${fmtSvgNum(auditX)}" y="${fmtSvgNum(auditY)}" width="${fmtSvgNum(auditPanelW)}" height="32" rx="10" fill="${OKLCH_PALETTE.panel}" />`,
  );
  lines.push(
    `  <text x="${fmtSvgNum(auditX + 14)}" y="${fmtSvgNum(auditY + 21)}" font-family="Pretendard, sans-serif" font-size="12" font-weight="700" fill="${OKLCH_PALETTE.inkPrimary}">서브셋 용량 절감 및 무두부(Zero-Tofu) 감사</text>`,
  );

  // 용량 절감 바
  const barX = auditX + 16;
  const barY = auditY + 56;
  const barW = auditPanelW - 32;
  const savingsRatio = clampFiniteSvg(subsetAudit.subsetSavingsPercent / 100, 0, 1, 0);
  const subsetBarW = Math.max(4, Math.round(barW * (1 - savingsRatio)));

  lines.push(
    `  <text x="${fmtSvgNum(barX)}" y="${fmtSvgNum(barY - 6)}" font-family="Pretendard, sans-serif" font-size="11" font-weight="600" fill="${OKLCH_PALETTE.inkPrimary}">${escapeTypographySvgXml(`WOFF2 서브셋 용량 절감률: ${fmtSvgNum(subsetAudit.subsetSavingsPercent)}%`)}</text>`,
  );
  lines.push(
    `  <rect x="${fmtSvgNum(barX)}" y="${fmtSvgNum(barY)}" width="${fmtSvgNum(barW)}" height="16" rx="5" fill="${OKLCH_PALETTE.barTrack}" stroke="${OKLCH_PALETTE.border}" stroke-width="1" />`,
  );
  lines.push(
    `  <rect data-subset-savings-bar="true" x="${fmtSvgNum(barX)}" y="${fmtSvgNum(barY)}" width="${fmtSvgNum(barW * savingsRatio)}" height="16" rx="5" fill="${OKLCH_PALETTE.forestStroke}" />`,
  );
  lines.push(
    `  <rect x="${fmtSvgNum(barX + barW - subsetBarW)}" y="${fmtSvgNum(barY)}" width="${fmtSvgNum(subsetBarW)}" height="16" rx="3" fill="${OKLCH_PALETTE.indigoStroke}" />`,
  );
  lines.push(
    `  <text x="${fmtSvgNum(barX)}" y="${fmtSvgNum(barY + 32)}" font-family="ui-monospace, monospace" font-size="10" fill="${OKLCH_PALETTE.inkSecondary}">${escapeTypographySvgXml(`원본 ${formatByteSizeHuman(subsetAudit.totalFullFontBytes)} -> 서브셋 ${formatByteSizeHuman(subsetAudit.totalSubsetWoff2Bytes)} (고유 글리프 ${subsetAudit.uniqueCodePointCount}자)`)}</text>`,
  );

  // 세로쓰기 요약 배지 행
  const badgeY = barY + 46;
  const tategakiSummaryLine = `열 ${tategakiLayout.columns.length}개 · 회전 ${tategakiLayout.verticalRotatedCount} · 종중횡 ${tategakiLayout.tateChuYokoCount} · 루비 ${tategakiLayout.rubyAnnotationCount}`;
  lines.push(
    `  <rect x="${fmtSvgNum(barX)}" y="${fmtSvgNum(badgeY)}" width="${fmtSvgNum(barW)}" height="26" rx="6" fill="${OKLCH_PALETTE.indigoFill}" stroke="${OKLCH_PALETTE.indigoStroke}" stroke-opacity="0.4" stroke-width="1" />`,
  );
  lines.push(
    `  <text x="${fmtSvgNum(barX + 10)}" y="${fmtSvgNum(badgeY + 17)}" font-family="Pretendard, sans-serif" font-size="11" font-weight="600" fill="${OKLCH_PALETTE.indigoInk}">${escapeTypographySvgXml(tategakiSummaryLine)}</text>`,
  );

  // 폰트별 서브셋 테이블
  let rowY = badgeY + 42;
  for (let i = 0; i < subsetAudit.fontPlans.length; i += 1) {
    const plan = subsetAudit.fontPlans[i];
    const rowFill = !plan.isUsed
      ? OKLCH_PALETTE.panel
      : plan.licenseCompliant
        ? OKLCH_PALETTE.forestFill
        : OKLCH_PALETTE.crimsonFill;
    const rowInk = !plan.isUsed
      ? OKLCH_PALETTE.inkSecondary
      : plan.licenseCompliant
        ? OKLCH_PALETTE.forestInk
        : OKLCH_PALETTE.crimsonInk;
    const statusLabel = !plan.isUsed ? "미사용" : plan.licenseCompliant ? "허용" : "권한차단";

    lines.push(
      `  <rect x="${fmtSvgNum(barX)}" y="${fmtSvgNum(rowY)}" width="${fmtSvgNum(barW)}" height="28" rx="5" fill="${rowFill}" stroke="${OKLCH_PALETTE.border}" stroke-width="0.8" />`,
    );
    lines.push(
      `  <text x="${fmtSvgNum(barX + 10)}" y="${fmtSvgNum(rowY + 18)}" font-family="Pretendard, sans-serif" font-size="11" font-weight="600" fill="${rowInk}">${escapeTypographySvgXml(truncateText(plan.familyName, 24))}</text>`,
    );
    lines.push(
      `  <text x="${fmtSvgNum(barX + barW - 10)}" y="${fmtSvgNum(rowY + 18)}" text-anchor="end" font-family="ui-monospace, monospace" font-size="10" fill="${rowInk}">${escapeTypographySvgXml(`${plan.usedGlyphCount}자 · ${formatByteSizeHuman(plan.estimatedSubsetWoff2Bytes)} · ${statusLabel}`)}</text>`,
    );
    rowY += 34;
  }

  // 두부 결손 상태 박스
  const tofuBoxY = rowY + 6;
  const hasTofu = subsetAudit.tofuCount > 0;
  const tofuFill = hasTofu ? OKLCH_PALETTE.crimsonFill : OKLCH_PALETTE.forestFill;
  const tofuStroke = hasTofu ? OKLCH_PALETTE.crimsonStroke : OKLCH_PALETTE.forestStroke;
  const tofuInk = hasTofu ? OKLCH_PALETTE.crimsonInk : OKLCH_PALETTE.forestInk;
  const tofuText = hasTofu
    ? `두부 결손 ${subsetAudit.tofuCount}종: ${subsetAudit.missingTofuChars
        .slice(0, 4)
        .map((m) => m.hexCode)
        .join(", ")}`
    : "무두부(Zero-Tofu) 검증 통과 · 미지원 문자 0건";

  lines.push(
    `  <rect x="${fmtSvgNum(barX)}" y="${fmtSvgNum(tofuBoxY)}" width="${fmtSvgNum(barW)}" height="28" rx="6" fill="${tofuFill}" stroke="${tofuStroke}" stroke-width="1" />`,
  );
  lines.push(
    `  <text x="${fmtSvgNum(barX + 10)}" y="${fmtSvgNum(tofuBoxY + 18)}" font-family="Pretendard, sans-serif" font-size="11" font-weight="700" fill="${tofuInk}">${escapeTypographySvgXml(truncateText(tofuText, 48))}</text>`,
  );

  lines.push("</svg>");
  return lines.join("\n");
}

/**
 * 번역투 없는 자연스러운 한국어로 다국어 폰트 서브셋 감사 및
 * 일본어 세로쓰기(Tategaki) 조판 QA 보고서를 작성한다.
 */
export function summarizeMultilingualFontAuditKo(
  subsetAudit: EpisodeFontSubsetAuditResult,
  tategakiLayout?: TategakiTypesetLayout,
): string {
  const lines: string[] = [];
  const verdict = subsetAudit.releaseReady ? "출고 가능" : "출고 차단 (보정 필요)";
  const directionLabel =
    subsetAudit.writingDirection === "vertical-rl"
      ? "세로쓰기 우→좌(vertical-rl)"
      : subsetAudit.writingDirection === "horizontal-rtl"
        ? "가로쓰기 우→좌(horizontal-rtl)"
        : "가로쓰기 좌→우(horizontal-ltr)";

  lines.push(`[다국어 웹툰 폰트·조판 QA 보고서] ${subsetAudit.episodeTitle} (${subsetAudit.episodeId})`);
  lines.push(
    `- 로캘·쓰기 방향: ${subsetAudit.localeProfile.labelKo} [${subsetAudit.locale}] / ${directionLabel}`,
  );
  lines.push(`- 최종 판정: ${verdict}`);
  lines.push(
    `- 무두부(Zero-Tofu) 검사: 고유 문자 ${subsetAudit.uniqueCodePointCount}자 중 ${subsetAudit.coveredUniqueCodePointCount}자 매칭, 두부 결손 ${subsetAudit.tofuCount}건`,
  );
  lines.push(
    `- 서브셋 용량 절감: 원본 ${formatByteSizeHuman(subsetAudit.totalFullFontBytes)} → WOFF2 서브셋 ${formatByteSizeHuman(subsetAudit.totalSubsetWoff2Bytes)} (${subsetAudit.subsetSavingsPercent}% 절감, 사용 폰트 ${subsetAudit.usedFontCount}종)`,
  );
  lines.push(
    `- 라이선스 점검: ${
      subsetAudit.licenseViolations.length === 0
        ? "사용 폰트 전체 임베딩·상업 연재 권한 확인 완료"
        : `권한 미충족 ${subsetAudit.licenseViolations.length}건으로 출고 차단`
    }`,
  );
  lines.push(`- 서브셋 매니페스트 SHA-256: ${subsetAudit.subsetManifestSha256}`);

  if (subsetAudit.missingTofuChars.length > 0) {
    const sample = subsetAudit.missingTofuChars
      .slice(0, 6)
      .map((entry) => `${entry.character}(${entry.hexCode}, ${entry.occurrenceCount}회)`)
      .join(", ");
    lines.push(`- 결손 문자 상세: ${sample}`);
  }

  if (subsetAudit.blockingReasons.length > 0) {
    lines.push("- 출고 차단 사유:");
    for (let i = 0; i < subsetAudit.blockingReasons.length; i += 1) {
      lines.push(`  · ${subsetAudit.blockingReasons[i].messageKo}`);
    }
  }

  if (tategakiLayout !== undefined) {
    lines.push(
      `- 일본어 세로쓰기(Tategaki) 조판: 총 ${tategakiLayout.columns.length}열(글리프 셀 ${tategakiLayout.totalGlyphCells}개), 우→좌 열 단조성 ${tategakiLayout.isRightToLeftMonotonic ? "정상" : "이상"}, 위→아래 글리프 단조성 ${tategakiLayout.isTopToBottomMonotonic ? "정상" : "이상"}`,
    );
    lines.push(
      `- 세로 조판 세부 규칙: 세로 회전 문장부호 ${tategakiLayout.verticalRotatedCount}건, 종중횡(縦中横) ${tategakiLayout.tateChuYokoCount}건, 루비 후리가나 ${tategakiLayout.rubyAnnotationCount}건(인접 열 겹침 ${tategakiLayout.rubyColumnOverlapCount}건)`,
    );
    lines.push(
      `- 금칙 처리(禁則処理): 행두 금칙 위반 ${tategakiLayout.kinsokuViolationCount}건 (자동 보정 ${tategakiLayout.kinsokuAdjustments.length}건 적용)`,
    );
  }

  return lines.join("\n");
}
