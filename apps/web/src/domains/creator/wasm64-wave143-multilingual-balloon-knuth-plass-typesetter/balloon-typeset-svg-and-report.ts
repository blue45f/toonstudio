/**
 * Wave 143 — 순수 OKLCH 다국어 말풍선 식자 검수 시트 SVG 렌더러 및 한국어 역식 QA 브리프.
 *
 * - 원시 색상 표현 없이 순수 `oklch(...)` 팔레트만 사용한다.
 * - 모든 텍스트 노드의 XML 특수문자(`<`, `>`, `&`, `"`, `'`)를 이스케이프하고
 *   비유한 수치(`NaN`/`Infinity`) 출력을 원천 차단한다.
 * - 타원·사각·톱니·구름 말풍선 윤곽선, 각 줄의 현 너비 안전 가이드, 좌측 탐욕적 기준 vs 우측 마름모 DP 비교,
 *   5개국어 폰트·오버플로우 배지를 한 장의 검수 시트로 렌더링한다.
 */

import {
  BALLOON_FIT_STATUS_LABELS_KO,
  BALLOON_GEOMETRY_LABELS_KO,
  LOCALE_LABELS_KO,
  LOCALE_SHORT_CODES,
  type BalloonLayoutResult,
  type BalloonTypesetAuditSvgOptions,
  type CompiledLocalizedBalloon,
  type CompiledMultilingualBalloonBatch,
  type ResolvedBalloonGeometrySpec,
  type SupportedTypesetLocale,
} from "./balloon-typeset-types";

const OKLCH_PALETTE = {
  paperBg: "oklch(0.985 0.006 90)",
  cardBg: "oklch(0.996 0.003 90)",
  headerBg: "oklch(0.955 0.012 155)",
  stripBg: "oklch(0.968 0.007 92)",
  balloonFill: "oklch(0.998 0.002 90)",
  balloonStroke: "oklch(0.26 0.032 160)",
  safeGuideStroke: "oklch(0.58 0.11 160)",
  safeGuideFill: "oklch(0.94 0.032 160)",
  overflowStroke: "oklch(0.5 0.19 28)",
  overflowFill: "oklch(0.94 0.065 28)",
  borderStrong: "oklch(0.28 0.044 160)",
  borderSoft: "oklch(0.84 0.014 90)",
  textPrimary: "oklch(0.2 0.026 160)",
  textMuted: "oklch(0.44 0.024 160)",
  textInverse: "oklch(0.985 0.004 90)",
  goodBg: "oklch(0.32 0.068 158)",
  warnBg: "oklch(0.52 0.175 30)",
  shrinkBg: "oklch(0.48 0.12 78)",
  neutralPillBg: "oklch(0.94 0.014 155)",
  greedyTagBg: "oklch(0.94 0.04 38)",
  greedyTagText: "oklch(0.4 0.12 34)",
  diamondTagBg: "oklch(0.92 0.045 158)",
  diamondTagText: "oklch(0.28 0.08 158)",
} as const;

const LOCALE_BADGE_ACCENT_OKLCH: Readonly<Record<SupportedTypesetLocale, string>> = {
  "ko-KR": "oklch(0.42 0.11 158)",
  "ja-JP": "oklch(0.45 0.12 245)",
  "en-US": "oklch(0.46 0.11 290)",
  "fr-FR": "oklch(0.48 0.13 38)",
  "es-ES": "oklch(0.48 0.12 82)",
};

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/** XML 특수문자 5종(`<`, `>`, `&`, `"`, `'`)을 안전하게 이스케이프한다. */
export function escapeTypesetXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderBalloonContourSvg(
  geom: ResolvedBalloonGeometrySpec,
  cx: number,
  cy: number,
  scale: number,
): string {
  const w = geom.widthPx * scale;
  const h = geom.heightPx * scale;
  const rx = w / 2;
  const ry = h / 2;

  if (geom.kind === "rounded-rect-narration") {
    const cr = Math.min(geom.cornerRadiusPx * scale, rx * 0.45, ry * 0.45);
    return (
      `<rect x="${fmt(cx - rx)}" y="${fmt(cy - ry)}" width="${fmt(w)}" height="${fmt(h)}" ` +
      `rx="${fmt(cr)}" ry="${fmt(cr)}" fill="${OKLCH_PALETTE.balloonFill}" ` +
      `stroke="${OKLCH_PALETTE.balloonStroke}" stroke-width="2" />`
    );
  }

  if (geom.kind === "shout-jagged-ellipse") {
    const spikes = 22;
    const pts: string[] = [];
    for (let i = 0; i < spikes * 2; i += 1) {
      const angle = (i * Math.PI) / spikes;
      const isOuter = i % 2 === 0;
      const radialFactor = isOuter ? 1.0 : 1 - geom.spikeDepthRatio;
      const px = cx + Math.cos(angle) * rx * radialFactor;
      const py = cy + Math.sin(angle) * ry * radialFactor;
      pts.push(`${fmt(px)},${fmt(py)}`);
    }
    return (
      `<polygon points="${pts.join(" ")}" fill="${OKLCH_PALETTE.balloonFill}" ` +
      `stroke="${OKLCH_PALETTE.balloonStroke}" stroke-width="2" stroke-linejoin="miter" />`
    );
  }

  if (geom.kind === "cloud-thought") {
    const lobes = 14;
    const pathParts: string[] = [];
    for (let i = 0; i < lobes; i += 1) {
      const a0 = (i * 2 * Math.PI) / lobes;
      const aMid = ((i + 0.5) * 2 * Math.PI) / lobes;
      const a1 = ((i + 1) * 2 * Math.PI) / lobes;
      const innerFactor = 1 - geom.cloudLobeDepthRatio;
      const outerFactor = 1.04;
      const x0 = cx + Math.cos(a0) * rx * innerFactor;
      const y0 = cy + Math.sin(a0) * ry * innerFactor;
      const xm = cx + Math.cos(aMid) * rx * outerFactor;
      const ym = cy + Math.sin(aMid) * ry * outerFactor;
      const x1 = cx + Math.cos(a1) * rx * innerFactor;
      const y1 = cy + Math.sin(a1) * ry * innerFactor;
      if (i === 0) pathParts.push(`M ${fmt(x0)} ${fmt(y0)}`);
      pathParts.push(`Q ${fmt(xm)} ${fmt(ym)} ${fmt(x1)} ${fmt(y1)}`);
    }
    pathParts.push("Z");
    return (
      `<path d="${pathParts.join(" ")}" fill="${OKLCH_PALETTE.balloonFill}" ` +
      `stroke="${OKLCH_PALETTE.balloonStroke}" stroke-width="2" />`
    );
  }

  return (
    `<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(rx)}" ry="${fmt(ry)}" ` +
    `fill="${OKLCH_PALETTE.balloonFill}" stroke="${OKLCH_PALETTE.balloonStroke}" stroke-width="2" />`
  );
}

function renderSingleBalloonPanelSvg(
  layout: BalloonLayoutResult,
  panelX: number,
  panelY: number,
  panelW: number,
  panelH: number,
  badgeTextKo: string,
  isDiamond: boolean,
): string {
  const geom = layout.geometry;
  const maxDrawW = panelW - 36;
  const maxDrawH = panelH - 76;
  const scale = Math.min(1.0, maxDrawW / Math.max(1, geom.widthPx), maxDrawH / Math.max(1, geom.heightPx));
  const cx = panelX + panelW / 2;
  const cy = panelY + 38 + (panelH - 76) / 2;

  const tagBg = isDiamond ? OKLCH_PALETTE.diamondTagBg : OKLCH_PALETTE.greedyTagBg;
  const tagText = isDiamond ? OKLCH_PALETTE.diamondTagText : OKLCH_PALETTE.greedyTagText;
  const statusPillBg =
    layout.audit.overflowLineCount > 0 || layout.audit.totalViolationCount > 0
      ? OKLCH_PALETTE.warnBg
      : OKLCH_PALETTE.goodBg;

  const parts: string[] = [];
  parts.push(
    `<rect x="${fmt(panelX)}" y="${fmt(panelY)}" width="${fmt(panelW)}" height="${fmt(panelH)}" ` +
      `rx="10" fill="${OKLCH_PALETTE.cardBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
  );

  // 상단 비교 라벨 및 점수 배지
  parts.push(
    `<rect x="${fmt(panelX + 12)}" y="${fmt(panelY + 10)}" width="166" height="22" rx="6" fill="${tagBg}" />`,
  );
  parts.push(
    `<text x="${fmt(panelX + 20)}" y="${fmt(panelY + 25)}" font-size="11" font-weight="700" fill="${tagText}">` +
      `${escapeTypesetXml(badgeTextKo)}</text>`,
  );
  parts.push(
    `<rect x="${fmt(panelX + panelW - 144)}" y="${fmt(panelY + 10)}" width="132" height="22" rx="6" fill="${statusPillBg}" />`,
  );
  parts.push(
    `<text x="${fmt(panelX + panelW - 78)}" y="${fmt(panelY + 25)}" font-size="10.5" font-weight="700" ` +
      `text-anchor="middle" fill="${OKLCH_PALETTE.textInverse}">` +
      `${escapeTypesetXml(`적합 ${layout.diamondFitScore} · 넘침 ${layout.audit.overflowLineCount}`)}</text>`,
  );

  // 말풍선 외곽선
  parts.push(renderBalloonContourSvg(geom, cx, cy, scale));

  // 각 줄의 안전 현 너비 가이드 + 대사 텍스트
  const fontPx = Math.max(8, layout.fontSizePx * scale);
  for (let i = 0; i < layout.lines.length; i += 1) {
    const line = layout.lines[i];
    if (!line) continue;
    const lineY = cy + line.yOffsetPx * scale;
    const chordW = line.availableChordWidthPx * scale;
    const textW = line.widthPx * scale;
    const isOverflow = line.overflowPx > 0.25;
    const guideStroke = isOverflow ? OKLCH_PALETTE.overflowStroke : OKLCH_PALETTE.safeGuideStroke;
    const guideFill = isOverflow ? OKLCH_PALETTE.overflowFill : OKLCH_PALETTE.safeGuideFill;
    const bandH = Math.max(6, fontPx * 1.05);

    if (chordW > 1) {
      parts.push(
        `<rect x="${fmt(cx - chordW / 2)}" y="${fmt(lineY - bandH / 2)}" width="${fmt(chordW)}" height="${fmt(bandH)}" ` +
          `rx="3" fill="${guideFill}" fill-opacity="0.38" stroke="${guideStroke}" stroke-width="0.9" stroke-dasharray="3 2" />`,
      );
    }
    if (isOverflow && textW > 1) {
      parts.push(
        `<line x1="${fmt(cx - textW / 2)}" y1="${fmt(lineY + bandH / 2 + 1.5)}" x2="${fmt(cx + textW / 2)}" ` +
          `y2="${fmt(lineY + bandH / 2 + 1.5)}" stroke="${OKLCH_PALETTE.overflowStroke}" stroke-width="1.8" />`,
      );
    }

    parts.push(
      `<text x="${fmt(cx)}" y="${fmt(lineY + fontPx * 0.34)}" font-size="${fmt(fontPx)}" font-weight="500" ` +
        `text-anchor="middle" fill="${isOverflow ? OKLCH_PALETTE.overflowStroke : OKLCH_PALETTE.textPrimary}">` +
        `${escapeTypesetXml(line.text)}</text>`,
    );
  }

  // 하단 요약 메트릭
  const kinsokuCount = layout.audit.lineStartKinsokuCount + layout.audit.lineEndKinsokuCount;
  const footerLine =
    `${layout.fontSizePx}px · ${layout.lines.length}줄 · 대칭 ${layout.symmetryScore}점 · 금칙 ${kinsokuCount}건 · 고아행 ${layout.audit.widowCount}건`;
  parts.push(
    `<text x="${fmt(panelX + panelW / 2)}" y="${fmt(panelY + panelH - 12)}" font-size="10.5" ` +
      `text-anchor="middle" fill="${OKLCH_PALETTE.textMuted}">${escapeTypesetXml(footerLine)}</text>`,
  );

  return parts.join("\n");
}

function selectPreviewBalloons(
  batch: CompiledMultilingualBalloonBatch,
  maxPreviewPairs: number,
  focusLocale?: SupportedTypesetLocale,
): readonly CompiledLocalizedBalloon[] {
  if (batch.balloons.length === 0) return [];
  const filtered = focusLocale
    ? batch.balloons.filter((item) => item.locale === focusLocale)
    : batch.balloons;
  const pool = filtered.length > 0 ? filtered : batch.balloons;
  return pool.slice(0, maxPreviewPairs);
}

/**
 * 5개국어 말풍선 마름모꼴 Knuth-Plass 식자 검수 시트 SVG를 순수 `oklch(...)` 팔레트로 생성한다.
 */
export function renderBalloonTypesetAuditSvg(
  batch: CompiledMultilingualBalloonBatch,
  options?: BalloonTypesetAuditSvgOptions,
): string {
  const widthPx =
    options?.widthPx !== undefined && Number.isFinite(options.widthPx) && options.widthPx >= 640
      ? Math.round(options.widthPx)
      : 980;
  const maxPreviewPairs =
    options?.maxPreviewPairs !== undefined && Number.isFinite(options.maxPreviewPairs) && options.maxPreviewPairs >= 1
      ? Math.min(6, Math.round(options.maxPreviewPairs))
      : 3;
  const titleKo = options?.titleKo?.trim() || `${batch.episodeTitleKo} — 5개국어 말풍선 마름모꼴 식자 검수 시트`;

  const previews = selectPreviewBalloons(batch, maxPreviewPairs, options?.focusLocale);
  const headerH = 74;
  const badgeStripH = 72;
  const pairRowH = 264;
  const footerH = 42;
  const padding = 20;
  const bodyH = previews.length > 0 ? previews.length * (pairRowH + 14) : 84;
  const totalHeight = headerH + badgeStripH + bodyH + footerH + padding;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(widthPx)}" height="${fmt(totalHeight)}" ` +
      `viewBox="0 0 ${fmt(widthPx)} ${fmt(totalHeight)}" role="img" aria-label="${escapeTypesetXml(titleKo)}">`,
  );
  parts.push(`<rect x="0" y="0" width="${fmt(widthPx)}" height="${fmt(totalHeight)}" fill="${OKLCH_PALETTE.paperBg}" />`);

  // 1. 헤더 영역
  parts.push(`<rect x="0" y="0" width="${fmt(widthPx)}" height="${fmt(headerH)}" fill="${OKLCH_PALETTE.headerBg}" />`);
  parts.push(
    `<line x1="0" y1="${fmt(headerH)}" x2="${fmt(widthPx)}" y2="${fmt(headerH)}" stroke="${OKLCH_PALETTE.borderStrong}" stroke-width="1.5" />`,
  );
  parts.push(
    `<text x="${fmt(padding)}" y="31" font-size="17" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">` +
      `${escapeTypesetXml(titleKo)}</text>`,
  );
  const subHeader =
    `총 ${batch.totalBalloonVariants}개 다국어 식자 · 마름모 평균 ${batch.averageDiamondFitScore}점 ` +
    `(탐욕 대비 ${batch.averageDiamondScoreGain >= 0 ? "+" : ""}${batch.averageDiamondScoreGain}점) · ` +
    `금칙 위반 ${batch.totalKinsokuViolationCount}건 · 고아행 ${batch.totalWidowCount}건`;
  parts.push(
    `<text x="${fmt(padding)}" y="54" font-size="12" fill="${OKLCH_PALETTE.textMuted}">${escapeTypesetXml(subHeader)}</text>`,
  );

  const globalStatusBg =
    batch.totalOverflowCount === 0 && batch.totalKinsokuViolationCount === 0
      ? OKLCH_PALETTE.goodBg
      : OKLCH_PALETTE.warnBg;
  const globalStatusText =
    batch.totalOverflowCount === 0
      ? "오버플로우 0건 통과"
      : `확대 필요 ${batch.expansionRequiredCount}건`;
  parts.push(
    `<rect x="${fmt(widthPx - 178)}" y="21" width="158" height="30" rx="8" fill="${globalStatusBg}" />`,
  );
  parts.push(
    `<text x="${fmt(widthPx - 99)}" y="40" font-size="12" font-weight="700" text-anchor="middle" fill="${OKLCH_PALETTE.textInverse}">` +
      `${escapeTypesetXml(globalStatusText)}</text>`,
  );

  // 2. 5개국어 폰트·오버플로우 배지 스트립
  const stripY = headerH + 10;
  const summaries = batch.localeSummaries;
  const slotCount = Math.max(1, summaries.length);
  const gap = 10;
  const badgeW = (widthPx - padding * 2 - gap * (slotCount - 1)) / slotCount;

  if (summaries.length === 0) {
    parts.push(
      `<rect x="${fmt(padding)}" y="${fmt(stripY)}" width="${fmt(widthPx - padding * 2)}" height="52" rx="8" ` +
        `fill="${OKLCH_PALETTE.stripBg}" stroke="${OKLCH_PALETTE.borderSoft}" />`,
    );
    parts.push(
      `<text x="${fmt(widthPx / 2)}" y="${fmt(stripY + 30)}" font-size="12" text-anchor="middle" fill="${OKLCH_PALETTE.textMuted}">` +
        `${escapeTypesetXml("컴파일된 다국어 말풍선 항목이 없습니다.")}</text>`,
    );
  } else {
    for (let i = 0; i < summaries.length; i += 1) {
      const summary = summaries[i];
      if (!summary) continue;
      const bx = padding + i * (badgeW + gap);
      const accent = LOCALE_BADGE_ACCENT_OKLCH[summary.locale];
      const overflowCount = summary.balloonCount - summary.zeroOverflowCount;
      const pillBg = overflowCount === 0 ? OKLCH_PALETTE.goodBg : OKLCH_PALETTE.warnBg;
      parts.push(
        `<rect x="${fmt(bx)}" y="${fmt(stripY)}" width="${fmt(badgeW)}" height="54" rx="8" ` +
          `fill="${OKLCH_PALETTE.cardBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
      );
      parts.push(`<rect x="${fmt(bx)}" y="${fmt(stripY)}" width="5" height="54" rx="2" fill="${accent}" />`);
      parts.push(
        `<text x="${fmt(bx + 14)}" y="${fmt(stripY + 21)}" font-size="12" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">` +
          `${escapeTypesetXml(`${LOCALE_SHORT_CODES[summary.locale]} · ${LOCALE_LABELS_KO[summary.locale]}`)}</text>`,
      );
      parts.push(
        `<rect x="${fmt(bx + badgeW - 68)}" y="${fmt(stripY + 8)}" width="60" height="19" rx="5" fill="${pillBg}" />`,
      );
      parts.push(
        `<text x="${fmt(bx + badgeW - 38)}" y="${fmt(stripY + 21)}" font-size="10" font-weight="700" ` +
          `text-anchor="middle" fill="${OKLCH_PALETTE.textInverse}">` +
          `${escapeTypesetXml(overflowCount === 0 ? "넘침 0" : `넘침 ${overflowCount}`)}</text>`,
      );
      const detail = `평균 ${summary.averageFontSizePx}px · 마름모 ${summary.averageDiamondFitScore}점`;
      parts.push(
        `<text x="${fmt(bx + 14)}" y="${fmt(stripY + 42)}" font-size="10.5" fill="${OKLCH_PALETTE.textMuted}">` +
          `${escapeTypesetXml(detail)}</text>`,
      );
    }
  }

  // 3. 좌측 탐욕적 식자 vs 우측 마름모 DP 식자 비교 카드
  let cursorY = stripY + badgeStripH;
  const colGap = 16;
  const colW = (widthPx - padding * 2 - colGap) / 2;

  for (let i = 0; i < previews.length; i += 1) {
    const item = previews[i];
    if (!item) continue;
    const geomLabel = BALLOON_GEOMETRY_LABELS_KO[item.fit.layout.geometry.kind];
    const statusLabel = BALLOON_FIT_STATUS_LABELS_KO[item.fit.status];
    const rowTitle =
      `[${item.panelId} · ${item.balloonId}] ${item.speakerKo} (${LOCALE_LABELS_KO[item.locale]} · ${geomLabel}) — ${statusLabel}`;

    parts.push(
      `<text x="${fmt(padding)}" y="${fmt(cursorY + 14)}" font-size="12" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">` +
        `${escapeTypesetXml(rowTitle)}</text>`,
    );

    const statusBadgeBg =
      item.fit.status === "balloon-expansion-required"
        ? OKLCH_PALETTE.warnBg
        : item.fit.status === "fitted-with-shrink"
          ? OKLCH_PALETTE.shrinkBg
          : OKLCH_PALETTE.goodBg;
    const scaleLabel =
      item.fit.status === "balloon-expansion-required"
        ? `확대 ${item.fit.recommendedBalloonScale}x 필요`
        : `점수 ${item.comparison.diamondFitScoreGain >= 0 ? "+" : ""}${item.comparison.diamondFitScoreGain}`;
    parts.push(
      `<rect x="${fmt(widthPx - padding - 118)}" y="${fmt(cursorY)}" width="118" height="20" rx="5" fill="${statusBadgeBg}" />`,
    );
    parts.push(
      `<text x="${fmt(widthPx - padding - 59)}" y="${fmt(cursorY + 14)}" font-size="10.5" font-weight="700" ` +
        `text-anchor="middle" fill="${OKLCH_PALETTE.textInverse}">${escapeTypesetXml(scaleLabel)}</text>`,
    );

    const panelTop = cursorY + 24;
    const panelH = pairRowH - 28;
    parts.push(
      renderSingleBalloonPanelSvg(
        item.comparison.greedy,
        padding,
        panelTop,
        colW,
        panelH,
        "좌측 · 탐욕적 기준 식자",
        false,
      ),
    );
    parts.push(
      renderSingleBalloonPanelSvg(
        item.comparison.diamond,
        padding + colW + colGap,
        panelTop,
        colW,
        panelH,
        "우측 · 마름모 Knuth-Plass DP",
        true,
      ),
    );
    cursorY += pairRowH + 14;
  }

  // 4. 하단 SHA-256 지문 푸터
  const footerY = totalHeight - footerH + 8;
  parts.push(
    `<line x1="${fmt(padding)}" y1="${fmt(footerY)}" x2="${fmt(widthPx - padding)}" y2="${fmt(footerY)}" ` +
      `stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
  );
  parts.push(
    `<text x="${fmt(padding)}" y="${fmt(footerY + 22)}" font-size="10.5" fill="${OKLCH_PALETTE.textMuted}">` +
      `${escapeTypesetXml(`Wave 143 결정론 식자 지문(SHA-256): ${batch.typesetManifestSha256Hex}`)}</text>`,
  );
  parts.push("</svg>");

  return parts.join("\n");
}

/**
 * 5개국어 말풍선 식자 배치 결과를 번역투 없는 실무 한국어 QA 브리프로 요약한다.
 */
export function summarizeMultilingualTypesetKo(batch: CompiledMultilingualBalloonBatch): string {
  const lines: string[] = [];
  lines.push(`[역식 말풍선 식자 검수 브리프] ${batch.episodeTitleKo}`);
  lines.push(
    `- 전체 대상: 다국어 말풍선 ${batch.totalBalloonVariants}건 ` +
      `(오버플로우 ${batch.totalOverflowCount}건, 금칙 위반 ${batch.totalKinsokuViolationCount}건, 고아 막줄 ${batch.totalWidowCount}건)`,
  );
  const gainPrefix = batch.averageDiamondScoreGain >= 0 ? "+" : "";
  lines.push(
    `- 마름모꼴 Knuth-Plass 개선: 평균 적합도 ${batch.averageGreedyDiamondFitScore}점 → ` +
      `${batch.averageDiamondFitScore}점 (${gainPrefix}${batch.averageDiamondScoreGain}점)`,
  );

  if (batch.localeSummaries.length > 0) {
    lines.push("- 언어별 식자 현황:");
    for (let i = 0; i < batch.localeSummaries.length; i += 1) {
      const summary = batch.localeSummaries[i];
      if (!summary) continue;
      const expandNote =
        summary.expansionRequiredCount > 0
          ? `, 말풍선 확대 필요 ${summary.expansionRequiredCount}건(최대 ${summary.maxRecommendedBalloonScale}배)`
          : ", 오버플로우 0건";
      lines.push(
        `  · ${LOCALE_LABELS_KO[summary.locale]}(${summary.locale}): ${summary.balloonCount}건, ` +
          `평균 ${summary.averageFontSizePx}px, 마름모 ${summary.averageDiamondFitScore}점${expandNote}`,
      );
    }
  }

  const expansionItems = batch.balloons.filter((item) => item.fit.status === "balloon-expansion-required");
  if (expansionItems.length > 0) {
    lines.push("- 말풍선 확대 조치 목록:");
    for (let i = 0; i < expansionItems.length; i += 1) {
      const item = expansionItems[i];
      if (!item) continue;
      lines.push(
        `  · [${item.panelId}/${item.balloonId}] ${LOCALE_LABELS_KO[item.locale]}: ` +
          `${item.fit.recommendedBalloonScale}배 이상 확대 권장 (${item.fit.diagnosticsKo})`,
      );
    }
  } else {
    lines.push("- 판정: 모든 언어·말풍선에서 오버플로우 0건으로 식자 출고 기준을 충족함.");
  }

  lines.push(`- 식자 매니페스트 지문(SHA-256): ${batch.typesetManifestSha256Hex}`);
  return lines.join("\n");
}
