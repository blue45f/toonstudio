/**
 * Wave 144 — 순수 OKLCH Rights BOM 권리 매트릭스 SVG 및 한국어 법무·PD 출고 클리어런스 브리프.
 *
 * - 원시 색상 표현 없이 순수 `oklch(...)` 팔레트만 사용한다.
 * - 모든 텍스트 노드에 XML 특수문자(`<`, `>`, `&`, `"`, `'`) 이스케이프와 유한 수치 보정을 강제한다.
 * - 번역투 없는 자연스러운 한국어 스튜디오 실무 문장으로 보고서를 생성한다.
 */

import {
  COMMERCIAL_DISTRIBUTION_SCOPES,
  COMMERCIAL_SCOPE_LABELS_KO,
  COMMERCIAL_SCOPE_SHORT_LABELS_KO,
  LICENSE_TIER_LABELS_KO,
  RIGHTS_BOM_CATEGORY_LABELS_KO,
  VIOLATION_CODE_LABELS_KO,
  type AppliedAssetReplacement,
  type AssetRightsAuditRecord,
  type RightsBomClearanceAuditResult,
  type RightsBomSvgRenderOptions,
  type SafeReplacementPlan,
  type ScopeMatrixCellState,
} from "./rights-bom-types";

const OKLCH_PALETTE = {
  paperBg: "oklch(0.985 0.006 90)",
  surfaceBg: "oklch(0.996 0.003 90)",
  headerBg: "oklch(0.952 0.014 155)",
  rowAltBg: "oklch(0.974 0.006 92)",
  borderStrong: "oklch(0.28 0.044 160)",
  borderSoft: "oklch(0.84 0.014 90)",
  textPrimary: "oklch(0.21 0.026 160)",
  textMuted: "oklch(0.44 0.022 160)",
  textInverse: "oklch(0.985 0.004 90)",
  clearedFill: "oklch(0.935 0.046 155)",
  clearedStroke: "oklch(0.36 0.095 155)",
  clearedStrongBg: "oklch(0.32 0.072 158)",
  warnFill: "oklch(0.945 0.068 82)",
  warnStroke: "oklch(0.48 0.135 68)",
  warnStrongBg: "oklch(0.55 0.145 72)",
  blockedFill: "oklch(0.935 0.068 25)",
  blockedStroke: "oklch(0.47 0.18 26)",
  blockedStrongBg: "oklch(0.48 0.185 26)",
  neutralCellBg: "oklch(0.955 0.005 95)",
  neutralCellText: "oklch(0.53 0.014 155)",
  coveredMutedBg: "oklch(0.952 0.018 155)",
  coveredMutedText: "oklch(0.42 0.045 155)",
  swapBg: "oklch(0.942 0.036 225)",
  swapStroke: "oklch(0.4 0.115 228)",
  stampBg: "oklch(0.962 0.016 155)",
  stampBorder: "oklch(0.32 0.072 158)",
  stampBlockedBg: "oklch(0.962 0.022 26)",
  stampBlockedBorder: "oklch(0.48 0.17 26)",
} as const;

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/** XML 특수문자 5종(`<`, `>`, `&`, `"`, `'`)을 안전하게 이스케이프한다. */
export function escapeRightsBomXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncateText(raw: string, maxChars: number): string {
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, Math.max(1, maxChars - 1))}…`;
}

function formatSimilarityPct(similarity: number): string {
  const clamped = Number.isFinite(similarity)
    ? Math.max(0, Math.min(1, similarity))
    : 0;
  return `${Math.round(clamped * 100)}%`;
}

function scopeCellStyle(state: ScopeMatrixCellState): {
  readonly fill: string;
  readonly stroke: string;
  readonly text: string;
  readonly labelKo: string;
} {
  if (state === "requested-cleared") {
    return {
      fill: OKLCH_PALETTE.clearedFill,
      stroke: OKLCH_PALETTE.clearedStroke,
      text: OKLCH_PALETTE.clearedStroke,
      labelKo: "가능",
    };
  }
  if (state === "requested-blocked") {
    return {
      fill: OKLCH_PALETTE.blockedFill,
      stroke: OKLCH_PALETTE.blockedStroke,
      text: OKLCH_PALETTE.blockedStroke,
      labelKo: "차단",
    };
  }
  if (state === "unrequested-covered") {
    return {
      fill: OKLCH_PALETTE.coveredMutedBg,
      stroke: OKLCH_PALETTE.borderSoft,
      text: OKLCH_PALETTE.coveredMutedText,
      labelKo: "보유",
    };
  }
  return {
    fill: OKLCH_PALETTE.neutralCellBg,
    stroke: OKLCH_PALETTE.borderSoft,
    text: OKLCH_PALETTE.neutralCellText,
    labelKo: "미포함",
  };
}

function assetStatusBadge(record: AssetRightsAuditRecord): {
  readonly fill: string;
  readonly text: string;
  readonly labelKo: string;
} {
  if (record.status === "blocked") {
    return {
      fill: OKLCH_PALETTE.blockedStrongBg,
      text: OKLCH_PALETTE.textInverse,
      labelKo: `차단 ${record.blockerCount}`,
    };
  }
  if (record.status === "warning") {
    return {
      fill: OKLCH_PALETTE.warnStrongBg,
      text: OKLCH_PALETTE.textInverse,
      labelKo: `경고 ${record.warningCount}`,
    };
  }
  return {
    fill: OKLCH_PALETTE.clearedStrongBg,
    text: OKLCH_PALETTE.textInverse,
    labelKo: "통과",
  };
}

interface SwapDisplayRow {
  readonly fromLabel: string;
  readonly toLabel: string;
  readonly similarityLabel: string;
  readonly matched: boolean;
}

function collectSwapDisplayRows(
  replacementPlan: SafeReplacementPlan | undefined,
  appliedSwaps: readonly AppliedAssetReplacement[] | undefined,
): readonly SwapDisplayRow[] {
  if (appliedSwaps && appliedSwaps.length > 0) {
    return appliedSwaps.map((swap) => ({
      fromLabel: `${swap.fromAssetNameKo} (${swap.fromAssetId})`,
      toLabel: `${swap.toAssetNameKo} · ${swap.toVendor}`,
      similarityLabel: `유사도 ${formatSimilarityPct(swap.jaccardSimilarity)}`,
      matched: true,
    }));
  }
  if (replacementPlan && replacementPlan.recommendations.length > 0) {
    return replacementPlan.recommendations.map((rec) => {
      if (rec.bestMatch) {
        return {
          fromLabel: `${rec.blockedAssetNameKo} (${rec.blockedAssetId})`,
          toLabel: `${rec.bestMatch.candidate.nameKo} · ${rec.bestMatch.candidate.vendor}`,
          similarityLabel: `유사도 ${formatSimilarityPct(rec.bestMatch.jaccardSimilarity)}`,
          matched: true,
        };
      }
      return {
        fromLabel: `${rec.blockedAssetNameKo} (${rec.blockedAssetId})`,
        toLabel: rec.creditOnlyFixAvailable
          ? "엔딩 크레딧 표기 추가 시 통과"
          : "카탈로그 내 적합 대체 후보 없음",
        similarityLabel: rec.creditOnlyFixAvailable ? "크레딧 보완" : "수동 검토",
        matched: false,
      };
    });
  }
  return [];
}

/**
 * 어셋 × 5대 활용 범위 매트릭스, 상태 배지, 안전 대체 매칭 화살표, SHA-256 증명서 도장을
 * 순수 `oklch(...)` 인쇄 안전 SVG로 렌더링한다.
 */
export function renderRightsBomClearanceSvg(
  audit: RightsBomClearanceAuditResult,
  options?: RightsBomSvgRenderOptions,
): string {
  const rawWidth = options?.width ?? 1160;
  const width =
    Number.isFinite(rawWidth) && rawWidth >= 920 ? Math.round(rawWidth) : 1160;
  const margin = 24;
  const contentWidth = width - margin * 2;

  const swapRows = collectSwapDisplayRows(
    options?.replacementPlan,
    options?.appliedSwaps,
  );

  const headerHeight = 96;
  const kpiHeight = 52;
  const tableHeaderHeight = 36;
  const rowHeight = 48;
  const visibleRows = Math.max(1, audit.assetAudits.length);
  const tableHeight = tableHeaderHeight + visibleRows * rowHeight;

  const swapSectionHeight =
    swapRows.length > 0 ? 44 + swapRows.length * 40 + 16 : 0;
  const stampHeight = 98;
  const totalHeight =
    margin +
    headerHeight +
    14 +
    kpiHeight +
    16 +
    tableHeight +
    (swapSectionHeight > 0 ? 18 + swapSectionHeight : 0) +
    18 +
    stampHeight +
    margin;

  const titleText =
    options?.titleKo ??
    `${audit.projectTitleKo} (${audit.episodeId}) — Rights BOM 출고 감사 매트릭스`;
  const requestedScopeLabel =
    audit.requestedScopes.length > 0
      ? audit.requestedScopes
          .map((s) => COMMERCIAL_SCOPE_LABELS_KO[s])
          .join(" · ")
      : "요청 배포 범위 미지정";

  const statusBg = audit.exportCleared
    ? OKLCH_PALETTE.clearedStrongBg
    : OKLCH_PALETTE.blockedStrongBg;
  const statusLabel = audit.exportCleared
    ? "출고 승인 · CLEARED"
    : "출고 차단 · BLOCKED";

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(width)} ${fmt(totalHeight)}" width="${fmt(width)}" height="${fmt(totalHeight)}" role="img" aria-label="${escapeRightsBomXml(titleText)}">`,
  );
  parts.push(
    `<rect x="0" y="0" width="${fmt(width)}" height="${fmt(totalHeight)}" fill="${OKLCH_PALETTE.paperBg}" />`,
  );

  // 1. 헤더 카드
  const headerY = margin;
  parts.push(
    `<rect x="${fmt(margin)}" y="${fmt(headerY)}" width="${fmt(contentWidth)}" height="${fmt(headerHeight)}" rx="12" fill="${OKLCH_PALETTE.headerBg}" stroke="${OKLCH_PALETTE.borderStrong}" stroke-width="1.5" />`,
  );
  parts.push(
    `<text x="${fmt(margin + 20)}" y="${fmt(headerY + 34)}" font-family="sans-serif" font-size="18" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">${escapeRightsBomXml(truncateText(titleText, 64))}</text>`,
  );
  parts.push(
    `<text x="${fmt(margin + 20)}" y="${fmt(headerY + 58)}" font-family="sans-serif" font-size="12" fill="${OKLCH_PALETTE.textMuted}">출고 기준일 ${escapeRightsBomXml(audit.releaseDateIso)} · 요청 범위: ${escapeRightsBomXml(truncateText(requestedScopeLabel, 72))}</text>`,
  );
  parts.push(
    `<text x="${fmt(margin + 20)}" y="${fmt(headerY + 79)}" font-family="sans-serif" font-size="11" fill="${OKLCH_PALETTE.textMuted}">증명서 번호 ${escapeRightsBomXml(audit.clearanceCertificateId)} · 만료 임박 기준 ${fmt(audit.expiringSoonWindowDays)}일</text>`,
  );

  const badgeW = 192;
  const badgeX = margin + contentWidth - badgeW - 18;
  parts.push(
    `<rect x="${fmt(badgeX)}" y="${fmt(headerY + 26)}" width="${fmt(badgeW)}" height="42" rx="8" fill="${statusBg}" />`,
  );
  parts.push(
    `<text x="${fmt(badgeX + badgeW / 2)}" y="${fmt(headerY + 52)}" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="700" fill="${OKLCH_PALETTE.textInverse}">${escapeRightsBomXml(statusLabel)}</text>`,
  );

  // 2. KPI 요약 스트립
  const kpiY = headerY + headerHeight + 14;
  const kpis: readonly { readonly label: string; readonly value: string; readonly accent: string }[] = [
    { label: "점검 어셋", value: `${audit.totalAssetCount}종`, accent: OKLCH_PALETTE.textPrimary },
    { label: "출고 통과", value: `${audit.clearedAssetCount}종`, accent: OKLCH_PALETTE.clearedStroke },
    { label: "만료 경고", value: `${audit.warningCount}건`, accent: OKLCH_PALETTE.warnStroke },
    { label: "출고 차단", value: `${audit.blockerCount}건`, accent: OKLCH_PALETTE.blockedStroke },
    {
      label: "필수 크레딧",
      value: `${audit.attributionCredits.entries.length}건`,
      accent: OKLCH_PALETTE.swapStroke,
    },
  ];
  const kpiGap = 10;
  const kpiCardW = (contentWidth - kpiGap * (kpis.length - 1)) / kpis.length;
  for (let i = 0; i < kpis.length; i += 1) {
    const item = kpis[i];
    if (!item) continue;
    const x = margin + i * (kpiCardW + kpiGap);
    parts.push(
      `<rect x="${fmt(x)}" y="${fmt(kpiY)}" width="${fmt(kpiCardW)}" height="${fmt(kpiHeight)}" rx="8" fill="${OKLCH_PALETTE.surfaceBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
    );
    parts.push(
      `<text x="${fmt(x + 14)}" y="${fmt(kpiY + 20)}" font-family="sans-serif" font-size="11" fill="${OKLCH_PALETTE.textMuted}">${escapeRightsBomXml(item.label)}</text>`,
    );
    parts.push(
      `<text x="${fmt(x + 14)}" y="${fmt(kpiY + 41)}" font-family="sans-serif" font-size="16" font-weight="700" fill="${item.accent}">${escapeRightsBomXml(item.value)}</text>`,
    );
  }

  // 3. 어셋 × 5대 배포 범위 매트릭스
  const tableY = kpiY + kpiHeight + 16;
  const assetColW = Math.round(contentWidth * 0.34);
  const metaColW = Math.round(contentWidth * 0.16);
  const statusColW = 92;
  const scopeColW =
    (contentWidth - assetColW - metaColW - statusColW) /
    COMMERCIAL_DISTRIBUTION_SCOPES.length;

  parts.push(
    `<rect x="${fmt(margin)}" y="${fmt(tableY)}" width="${fmt(contentWidth)}" height="${fmt(tableHeight)}" rx="10" fill="${OKLCH_PALETTE.surfaceBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1.2" />`,
  );
  parts.push(
    `<rect x="${fmt(margin)}" y="${fmt(tableY)}" width="${fmt(contentWidth)}" height="${fmt(tableHeaderHeight)}" rx="10" fill="${OKLCH_PALETTE.headerBg}" />`,
  );
  parts.push(
    `<text x="${fmt(margin + 14)}" y="${fmt(tableY + 22)}" font-family="sans-serif" font-size="12" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">어셋 · 벤더 · 라이선스</text>`,
  );
  parts.push(
    `<text x="${fmt(margin + assetColW + 10)}" y="${fmt(tableY + 22)}" font-family="sans-serif" font-size="12" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">좌석 · 만료일</text>`,
  );

  for (let s = 0; s < COMMERCIAL_DISTRIBUTION_SCOPES.length; s += 1) {
    const scope = COMMERCIAL_DISTRIBUTION_SCOPES[s];
    if (!scope) continue;
    const colX = margin + assetColW + metaColW + s * scopeColW;
    parts.push(
      `<text x="${fmt(colX + scopeColW / 2)}" y="${fmt(tableY + 22)}" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">${escapeRightsBomXml(COMMERCIAL_SCOPE_SHORT_LABELS_KO[scope])}</text>`,
    );
  }
  const statusColX = margin + contentWidth - statusColW;
  parts.push(
    `<text x="${fmt(statusColX + statusColW / 2)}" y="${fmt(tableY + 22)}" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">판정</text>`,
  );

  if (audit.assetAudits.length === 0) {
    parts.push(
      `<text x="${fmt(margin + contentWidth / 2)}" y="${fmt(tableY + tableHeaderHeight + 29)}" text-anchor="middle" font-family="sans-serif" font-size="12" fill="${OKLCH_PALETTE.textMuted}">등록된 외부 BOM 어셋이 없는 순수 오리지널 원고입니다.</text>`,
    );
  } else {
    for (let r = 0; r < audit.assetAudits.length; r += 1) {
      const record = audit.assetAudits[r];
      if (!record) continue;
      const rowY = tableY + tableHeaderHeight + r * rowHeight;
      if (r % 2 === 1) {
        parts.push(
          `<rect x="${fmt(margin + 1)}" y="${fmt(rowY)}" width="${fmt(contentWidth - 2)}" height="${fmt(rowHeight)}" fill="${OKLCH_PALETTE.rowAltBg}" />`,
        );
      }
      parts.push(
        `<line x1="${fmt(margin)}" y1="${fmt(rowY)}" x2="${fmt(margin + contentWidth)}" y2="${fmt(rowY)}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="0.8" />`,
      );

      const categoryLabel = RIGHTS_BOM_CATEGORY_LABELS_KO[record.category];
      const tierLabel = LICENSE_TIER_LABELS_KO[record.licenseTier];
      parts.push(
        `<text x="${fmt(margin + 14)}" y="${fmt(rowY + 20)}" font-family="sans-serif" font-size="12" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">${escapeRightsBomXml(truncateText(record.nameKo, 26))}</text>`,
      );
      parts.push(
        `<text x="${fmt(margin + 14)}" y="${fmt(rowY + 37)}" font-family="sans-serif" font-size="10.5" fill="${OKLCH_PALETTE.textMuted}">${escapeRightsBomXml(truncateText(`${categoryLabel} · ${record.vendor} · ${tierLabel}`, 38))}</text>`,
      );

      const seatLabel = `좌석 ${record.activeTeamSeatsUsed}/${record.seatLimit}`;
      const expiryLabel =
        record.expiresOnIso === null
          ? "영구 라이선스"
          : record.daysUntilExpiry !== null && record.daysUntilExpiry < 0
            ? `만료 (${record.expiresOnIso})`
            : `만료 ${record.expiresOnIso}`;
      parts.push(
        `<text x="${fmt(margin + assetColW + 10)}" y="${fmt(rowY + 20)}" font-family="sans-serif" font-size="11" fill="${OKLCH_PALETTE.textPrimary}">${escapeRightsBomXml(seatLabel)}</text>`,
      );
      parts.push(
        `<text x="${fmt(margin + assetColW + 10)}" y="${fmt(rowY + 37)}" font-family="sans-serif" font-size="10.5" fill="${OKLCH_PALETTE.textMuted}">${escapeRightsBomXml(expiryLabel)}</text>`,
      );

      for (let s = 0; s < COMMERCIAL_DISTRIBUTION_SCOPES.length; s += 1) {
        const scope = COMMERCIAL_DISTRIBUTION_SCOPES[s];
        if (!scope) continue;
        const cellState = record.scopeMatrix[scope];
        const cellStyle = scopeCellStyle(cellState);
        const colX = margin + assetColW + metaColW + s * scopeColW;
        const pillW = scopeColW - 14;
        parts.push(
          `<rect x="${fmt(colX + 7)}" y="${fmt(rowY + 11)}" width="${fmt(pillW)}" height="26" rx="6" fill="${cellStyle.fill}" stroke="${cellStyle.stroke}" stroke-width="1" />`,
        );
        parts.push(
          `<text x="${fmt(colX + scopeColW / 2)}" y="${fmt(rowY + 28)}" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="600" fill="${cellStyle.text}">${escapeRightsBomXml(cellStyle.labelKo)}</text>`,
        );
      }

      const badge = assetStatusBadge(record);
      parts.push(
        `<rect x="${fmt(statusColX + 10)}" y="${fmt(rowY + 11)}" width="${fmt(statusColW - 20)}" height="26" rx="13" fill="${badge.fill}" />`,
      );
      parts.push(
        `<text x="${fmt(statusColX + statusColW / 2)}" y="${fmt(rowY + 28)}" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="700" fill="${badge.text}">${escapeRightsBomXml(badge.labelKo)}</text>`,
      );
    }
  }

  // 4. 안전 대체 어셋 매칭 화살표 패널 (대체 제안 또는 적용 이력이 있는 경우)
  let nextY = tableY + tableHeight + 18;
  if (swapRows.length > 0) {
    parts.push(
      `<rect x="${fmt(margin)}" y="${fmt(nextY)}" width="${fmt(contentWidth)}" height="${fmt(swapSectionHeight)}" rx="10" fill="${OKLCH_PALETTE.surfaceBg}" stroke="${OKLCH_PALETTE.swapStroke}" stroke-width="1.2" />`,
    );
    parts.push(
      `<text x="${fmt(margin + 16)}" y="${fmt(nextY + 27)}" font-family="sans-serif" font-size="13" font-weight="700" fill="${OKLCH_PALETTE.swapStroke}">안전 대체 어셋 자동 매칭 (태그 자카드 유사도 기준)</text>`,
    );

    const boxW = Math.round((contentWidth - 190) / 2);
    for (let i = 0; i < swapRows.length; i += 1) {
      const swap = swapRows[i];
      if (!swap) continue;
      const y = nextY + 42 + i * 40;
      const fromX = margin + 16;
      const arrowStartX = fromX + boxW + 10;
      const arrowEndX = arrowStartX + 46;
      const toX = arrowEndX + 10;
      const simX = toX + boxW + 10;
      const simW = margin + contentWidth - 16 - simX;

      parts.push(
        `<rect x="${fmt(fromX)}" y="${fmt(y)}" width="${fmt(boxW)}" height="30" rx="6" fill="${OKLCH_PALETTE.blockedFill}" stroke="${OKLCH_PALETTE.blockedStroke}" stroke-width="1" />`,
      );
      parts.push(
        `<text x="${fmt(fromX + 10)}" y="${fmt(y + 19)}" font-family="sans-serif" font-size="11" fill="${OKLCH_PALETTE.textPrimary}">${escapeRightsBomXml(truncateText(swap.fromLabel, 38))}</text>`,
      );

      parts.push(
        `<line x1="${fmt(arrowStartX)}" y1="${fmt(y + 15)}" x2="${fmt(arrowEndX - 6)}" y2="${fmt(y + 15)}" stroke="${OKLCH_PALETTE.swapStroke}" stroke-width="2" />`,
      );
      parts.push(
        `<polygon points="${fmt(arrowEndX - 8)},${fmt(y + 10)} ${fmt(arrowEndX)},${fmt(y + 15)} ${fmt(arrowEndX - 8)},${fmt(y + 20)}" fill="${OKLCH_PALETTE.swapStroke}" />`,
      );

      const toFill = swap.matched
        ? OKLCH_PALETTE.clearedFill
        : OKLCH_PALETTE.warnFill;
      const toStroke = swap.matched
        ? OKLCH_PALETTE.clearedStroke
        : OKLCH_PALETTE.warnStroke;
      parts.push(
        `<rect x="${fmt(toX)}" y="${fmt(y)}" width="${fmt(boxW)}" height="30" rx="6" fill="${toFill}" stroke="${toStroke}" stroke-width="1" />`,
      );
      parts.push(
        `<text x="${fmt(toX + 10)}" y="${fmt(y + 19)}" font-family="sans-serif" font-size="11" fill="${OKLCH_PALETTE.textPrimary}">${escapeRightsBomXml(truncateText(swap.toLabel, 38))}</text>`,
      );

      parts.push(
        `<rect x="${fmt(simX)}" y="${fmt(y)}" width="${fmt(Math.max(76, simW))}" height="30" rx="6" fill="${OKLCH_PALETTE.swapBg}" stroke="${OKLCH_PALETTE.swapStroke}" stroke-width="1" />`,
      );
      parts.push(
        `<text x="${fmt(simX + Math.max(76, simW) / 2)}" y="${fmt(y + 19)}" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="700" fill="${OKLCH_PALETTE.swapStroke}">${escapeRightsBomXml(swap.similarityLabel)}</text>`,
      );
    }

    nextY += swapSectionHeight + 18;
  }

  // 5. SHA-256 클리어런스 증명서 도장
  const stampBg = audit.exportCleared
    ? OKLCH_PALETTE.stampBg
    : OKLCH_PALETTE.stampBlockedBg;
  const stampBorder = audit.exportCleared
    ? OKLCH_PALETTE.stampBorder
    : OKLCH_PALETTE.stampBlockedBorder;
  parts.push(
    `<rect x="${fmt(margin)}" y="${fmt(nextY)}" width="${fmt(contentWidth)}" height="${fmt(stampHeight)}" rx="12" fill="${stampBg}" stroke="${stampBorder}" stroke-width="1.6" />`,
  );
  parts.push(
    `<circle cx="${fmt(margin + 52)}" cy="${fmt(nextY + 49)}" r="31" fill="${OKLCH_PALETTE.surfaceBg}" stroke="${stampBorder}" stroke-width="2.2" />`,
  );
  parts.push(
    `<text x="${fmt(margin + 52)}" y="${fmt(nextY + 46)}" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="700" fill="${stampBorder}">${audit.exportCleared ? "CLEARED" : "HOLD"}</text>`,
  );
  parts.push(
    `<text x="${fmt(margin + 52)}" y="${fmt(nextY + 60)}" text-anchor="middle" font-family="sans-serif" font-size="9" fill="${stampBorder}">SHA-256</text>`,
  );
  parts.push(
    `<text x="${fmt(margin + 102)}" y="${fmt(nextY + 32)}" font-family="sans-serif" font-size="13" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">권리 클리어런스 증명서 · ${escapeRightsBomXml(audit.clearanceCertificateId)}</text>`,
  );
  parts.push(
    `<text x="${fmt(margin + 102)}" y="${fmt(nextY + 55)}" font-family="monospace" font-size="11" fill="${OKLCH_PALETTE.textPrimary}">SHA-256: ${escapeRightsBomXml(audit.clearanceCertificateSha256Hex)}</text>`,
  );
  parts.push(
    `<text x="${fmt(margin + 102)}" y="${fmt(nextY + 76)}" font-family="sans-serif" font-size="11" fill="${OKLCH_PALETTE.textMuted}">${
      audit.exportCleared
        ? "모든 요청 상업 범위와 좌석·만료·저작자 표기 기준을 충족해 출고 승인 지문을 발급했습니다."
        : "출고 차단 항목을 해소한 뒤 재감사해야 상업 출고 승인 증명서를 발급할 수 있습니다."
    }</text>`,
  );

  parts.push("</svg>");
  return parts.join("");
}

/**
 * 법무팀과 담당 PD가 출고 직전에 바로 확인할 수 있는 자연스러운 한국어 Rights BOM 감사 보고서를 작성한다.
 */
export function summarizeRightsBomClearanceKo(
  audit: RightsBomClearanceAuditResult,
  options?: {
    readonly replacementPlan?: SafeReplacementPlan;
    readonly appliedSwaps?: readonly AppliedAssetReplacement[];
  },
): string {
  const lines: string[] = [];
  const scopeText =
    audit.requestedScopes.length > 0
      ? audit.requestedScopes
          .map((scope) => COMMERCIAL_SCOPE_LABELS_KO[scope])
          .join(", ")
      : "미지정 (출고 보류)";

  lines.push(
    `[Rights BOM 출고 감사 보고서] ${audit.projectTitleKo} (${audit.episodeId})`,
  );
  lines.push(`- 출고 기준일: ${audit.releaseDateIso}`);
  lines.push(`- 요청 배포 범위: ${scopeText}`);
  lines.push(
    `- 최종 판정: ${audit.exportCleared ? "출고 가능 (차단 0건)" : `출고 차단 (차단 ${audit.blockerCount}건 · 경고 ${audit.warningCount}건)`}`,
  );
  lines.push(
    `- 어셋 현황: 전체 ${audit.totalAssetCount}종 (통과 ${audit.clearedAssetCount}종 · 경고 ${audit.warningAssetCount}종 · 차단 ${audit.blockedAssetCount}종)`,
  );

  const blockers = audit.violations.filter((v) => v.severity === "blocker");
  const warnings = audit.violations.filter((v) => v.severity === "warning");

  if (blockers.length > 0) {
    lines.push("");
    lines.push("1. 출고 차단 항목 (필수 조치)");
    for (let i = 0; i < blockers.length; i += 1) {
      const item = blockers[i];
      if (!item) continue;
      const cutNote =
        item.usedInCutIds.length > 0
          ? ` [사용 컷: ${item.usedInCutIds.join(", ")}]`
          : "";
      lines.push(
        `- [${VIOLATION_CODE_LABELS_KO[item.code]}] ${item.assetNameKo}${cutNote}: ${item.messageKo} → ${item.remediationHintKo}`,
      );
    }
  }

  if (warnings.length > 0) {
    lines.push("");
    lines.push("2. 만료 임박 주의 항목");
    for (let i = 0; i < warnings.length; i += 1) {
      const item = warnings[i];
      if (!item) continue;
      lines.push(`- ${item.assetNameKo}: ${item.messageKo} → ${item.remediationHintKo}`);
    }
  }

  if (options?.appliedSwaps && options.appliedSwaps.length > 0) {
    lines.push("");
    lines.push("3. 적용된 안전 대체 어셋 내역");
    for (let i = 0; i < options.appliedSwaps.length; i += 1) {
      const swap = options.appliedSwaps[i];
      if (!swap) continue;
      const sharedText =
        swap.sharedTags.length > 0
          ? `공통 태그: ${swap.sharedTags.join(", ")}`
          : "공통 태그 없음";
      lines.push(
        `- ${swap.fromAssetNameKo} → ${swap.toAssetNameKo} (${swap.toVendor}, 태그 유사도 ${formatSimilarityPct(swap.jaccardSimilarity)}, ${sharedText})`,
      );
    }
  } else if (
    options?.replacementPlan &&
    options.replacementPlan.recommendations.length > 0
  ) {
    lines.push("");
    lines.push("3. 안전 대체 어셋 추천 목록");
    for (let i = 0; i < options.replacementPlan.recommendations.length; i += 1) {
      const rec = options.replacementPlan.recommendations[i];
      if (!rec) continue;
      if (rec.bestMatch) {
        const sharedText =
          rec.bestMatch.sharedTags.length > 0
            ? `공통 태그: ${rec.bestMatch.sharedTags.join(", ")}`
            : "공통 태그 없음";
        lines.push(
          `- ${rec.blockedAssetNameKo} → ${rec.bestMatch.candidate.nameKo} (${rec.bestMatch.candidate.vendor}, 태그 유사도 ${formatSimilarityPct(rec.bestMatch.jaccardSimilarity)}, ${sharedText})`,
        );
      } else {
        lines.push(
          `- ${rec.blockedAssetNameKo}: ${rec.unmatchedReasonKo ?? "대체 후보가 없습니다."}`,
        );
      }
    }
  }

  lines.push("");
  lines.push("4. 필수 저작자 표기 크레딧");
  lines.push(audit.attributionCredits.formattedBlockKo);

  lines.push("");
  lines.push(
    `5. 권리 클리어런스 증명서: ${audit.clearanceCertificateId} (SHA-256: ${audit.clearanceCertificateSha256Hex})`,
  );

  return lines.join("\n");
}
