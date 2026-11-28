/**
 * Wave 117 — 인쇄 안전 순수 OKLCH 레이어 다이어트 다이어그램 SVG 및 한국어 스튜디오 인계 QA 리포트.
 *
 * - 원시 16진수/전통 색상 표기 없이 순수 OKLCH 색상 토큰만 사용
 * - 최적화 전/후 VRAM 및 OPFS 비교 막대, 안전 장벽 보호 vs 안전 병합·정리 트리 맵 렌더링
 * - 모든 숫자 좌표를 유한수로 보정(NaN/Infinity 0건)하고 동적 문자열을 XML 이스케이프
 * - 번역투 없는 자연스러운 한국어 웹툰 스튜디오 인계 리포트 생성
 */

import {
  STUDIO_ROLE_SPECS,
  type LayerDietActionKind,
  type LayerTreeHygieneAuditResult,
  type LayerVramDietPlanResult,
  type StudioLayerRole,
} from "./layer-tree-hygiene-types";

export type LayerHygieneSvgTheme = "light" | "dark";

export interface LayerHygieneSvgOptions {
  readonly theme?: LayerHygieneSvgTheme;
  readonly title?: string;
  readonly maxVisibleRows?: number;
}

export type LayerHandoverVerdict = "ready" | "needs-attention" | "blocked";

export interface LayerTreeHygieneReportKo {
  readonly documentId: string;
  readonly verdict: LayerHandoverVerdict;
  readonly verdictLabelKo: string;
  readonly headlineKo: string;
  readonly namingSummaryKo: string;
  readonly vramSummaryKo: string;
  readonly barrierSummaryKo: string;
  readonly actionChecklistKo: readonly string[];
  readonly fullTextKo: string;
}

interface OklchHygienePalette {
  readonly canvasBg: string;
  readonly cardBg: string;
  readonly cardStroke: string;
  readonly rowDivider: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly barTrack: string;
  readonly barDense: string;
  readonly barSparse: string;
  readonly barOptimized: string;
  readonly barOpfs: string;
  readonly safeFill: string;
  readonly safeInk: string;
  readonly barrierFill: string;
  readonly barrierInk: string;
  readonly mergeFill: string;
  readonly mergeInk: string;
  readonly pruneFill: string;
  readonly pruneInk: string;
  readonly blockedFill: string;
  readonly blockedInk: string;
  readonly keepFill: string;
  readonly keepInk: string;
  readonly roleBadgeBg: string;
  readonly roleBadgeInk: string;
}

const LIGHT_OKLCH_PALETTE: OklchHygienePalette = {
  canvasBg: "oklch(0.982 0.006 90)",
  cardBg: "oklch(0.996 0.002 90)",
  cardStroke: "oklch(0.865 0.012 155)",
  rowDivider: "oklch(0.92 0.008 92)",
  textPrimary: "oklch(0.22 0.022 155)",
  textSecondary: "oklch(0.46 0.018 155)",
  barTrack: "oklch(0.94 0.008 92)",
  barDense: "oklch(0.54 0.175 26)",
  barSparse: "oklch(0.58 0.145 75)",
  barOptimized: "oklch(0.42 0.115 158)",
  barOpfs: "oklch(0.48 0.125 235)",
  safeFill: "oklch(0.94 0.028 158)",
  safeInk: "oklch(0.32 0.095 158)",
  barrierFill: "oklch(0.95 0.032 76)",
  barrierInk: "oklch(0.40 0.115 68)",
  mergeFill: "oklch(0.93 0.036 165)",
  mergeInk: "oklch(0.30 0.095 162)",
  pruneFill: "oklch(0.94 0.034 240)",
  pruneInk: "oklch(0.35 0.105 240)",
  blockedFill: "oklch(0.94 0.042 25)",
  blockedInk: "oklch(0.42 0.165 25)",
  keepFill: "oklch(0.95 0.008 95)",
  keepInk: "oklch(0.38 0.018 155)",
  roleBadgeBg: "oklch(0.935 0.016 155)",
  roleBadgeInk: "oklch(0.28 0.055 155)",
};

const DARK_OKLCH_PALETTE: OklchHygienePalette = {
  canvasBg: "oklch(0.16 0.012 158)",
  cardBg: "oklch(0.205 0.014 158)",
  cardStroke: "oklch(0.34 0.02 158)",
  rowDivider: "oklch(0.27 0.015 158)",
  textPrimary: "oklch(0.95 0.008 95)",
  textSecondary: "oklch(0.75 0.014 155)",
  barTrack: "oklch(0.26 0.014 158)",
  barDense: "oklch(0.68 0.18 26)",
  barSparse: "oklch(0.78 0.145 78)",
  barOptimized: "oklch(0.72 0.135 158)",
  barOpfs: "oklch(0.73 0.13 235)",
  safeFill: "oklch(0.27 0.05 158)",
  safeInk: "oklch(0.84 0.11 158)",
  barrierFill: "oklch(0.29 0.055 74)",
  barrierInk: "oklch(0.86 0.12 78)",
  mergeFill: "oklch(0.27 0.058 165)",
  mergeInk: "oklch(0.84 0.12 165)",
  pruneFill: "oklch(0.27 0.055 240)",
  pruneInk: "oklch(0.83 0.11 238)",
  blockedFill: "oklch(0.29 0.075 25)",
  blockedInk: "oklch(0.84 0.145 25)",
  keepFill: "oklch(0.26 0.014 158)",
  keepInk: "oklch(0.82 0.014 155)",
  roleBadgeBg: "oklch(0.28 0.032 158)",
  roleBadgeInk: "oklch(0.88 0.055 158)",
};

function fmt(value: number, digits = 2): string {
  const safe = Number.isFinite(value) ? value : 0;
  const rounded = Number(safe.toFixed(digits));
  return Object.is(rounded, -0) ? "0" : rounded.toFixed(digits);
}

function fmtCoord(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const rounded = Math.round(safe * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/**
 * SVG/XML 동적 텍스트 및 속성 안전 이스케이프 유틸리티.
 */
export function escapeXmlText(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncateLabel(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

function getActionBadge(
  action: LayerDietActionKind,
  mergeGroupId: string | null,
  palette: OklchHygienePalette,
): { readonly label: string; readonly fill: string; readonly ink: string } {
  if (action === "safe-lossless-merge") {
    return {
      label: mergeGroupId ? `안전 병합 (${mergeGroupId})` : "안전 병합",
      fill: palette.mergeFill,
      ink: palette.mergeInk,
    };
  }
  if (action === "prune-empty-layer") {
    return {
      label: "빈 레이어 정리",
      fill: palette.pruneFill,
      ink: palette.pruneInk,
    };
  }
  if (action === "keep-protected-barrier") {
    return {
      label: "안전 장벽 보호",
      fill: palette.barrierFill,
      ink: palette.barrierInk,
    };
  }
  if (action === "blocked-integrity-failure") {
    return {
      label: "무결성 차단",
      fill: palette.blockedFill,
      ink: palette.blockedInk,
    };
  }
  return {
    label: "원본 유지",
    fill: palette.keepFill,
    ink: palette.keepInk,
  };
}

function getRoleShortCode(role: StudioLayerRole): string {
  return STUDIO_ROLE_SPECS[role].prefix;
}

/**
 * 최적화 전/후 VRAM·OPFS 비교 막대와 안전 장벽 vs 병합/정리 레이어 트리 맵을
 * 인쇄 안전 순수 OKLCH SVG 문자열로 렌더링한다.
 */
export function renderLayerTreeHygieneSvg(
  audit: LayerTreeHygieneAuditResult,
  plan: LayerVramDietPlanResult,
  options: LayerHygieneSvgOptions = {},
): string {
  const palette = options.theme === "dark" ? DARK_OKLCH_PALETTE : LIGHT_OKLCH_PALETTE;
  const maxVisibleRows =
    options.maxVisibleRows !== undefined &&
    Number.isFinite(options.maxVisibleRows) &&
    options.maxVisibleRows >= 1
      ? Math.floor(options.maxVisibleRows)
      : 16;

  const title = options.title?.trim() || "웹툰 원고 레이어 트리 정규화 · 타일-희소 VRAM 다이어트 리포트";
  const visibleNodes = audit.nodes.slice(0, maxVisibleRows);
  const hiddenRowCount = Math.max(0, audit.nodes.length - visibleNodes.length);

  const width = 960;
  const headerHeight = 84;
  const vramPanelHeight = 166;
  const rowHeight = 32;
  const treeHeaderHeight = 46;
  const overflowNoteHeight = hiddenRowCount > 0 ? 28 : 0;
  const treePanelHeight =
    treeHeaderHeight + Math.max(1, visibleNodes.length) * rowHeight + overflowNoteHeight + 16;
  const footerHeight = 56;
  const totalHeight = headerHeight + vramPanelHeight + treePanelHeight + footerHeight + 36;

  const decisionMap = new Map(plan.decisions.map((d) => [d.layerId, d]));
  const m = plan.metrics;
  const maxBarBaseline = Math.max(1, m.denseVramBytes, m.sparseVramBytes, m.optimizedVramBytes);
  const maxOpfsBaseline = Math.max(1, m.opfsBeforeBytes, m.opfsAfterBytes);
  const barTrackWidth = 420;

  const isBlocked = plan.status === "blocked-integrity-failure";
  const statusPillFill = isBlocked ? palette.blockedFill : palette.safeFill;
  const statusPillInk = isBlocked ? palette.blockedInk : palette.safeInk;
  const statusPillText = isBlocked
    ? "무결성 차단 (Fail-Closed)"
    : plan.status === "optimized"
      ? "안전 다이어트 완료"
      : "이미 최적 상태";

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmtCoord(width)} ${fmtCoord(totalHeight)}" width="${fmtCoord(width)}" height="${fmtCoord(totalHeight)}" role="img" aria-label="${escapeXmlText(title)}">`,
  );
  parts.push(`<title>${escapeXmlText(title)}</title>`);
  parts.push(
    `<rect x="0" y="0" width="${fmtCoord(width)}" height="${fmtCoord(totalHeight)}" fill="${palette.canvasBg}" />`,
  );

  // 상단 헤더 카드
  parts.push(
    `<rect x="20" y="16" width="${fmtCoord(width - 40)}" height="${fmtCoord(headerHeight - 12)}" rx="12" fill="${palette.cardBg}" stroke="${palette.cardStroke}" stroke-width="1" />`,
  );
  parts.push(
    `<text x="38" y="44" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="700" fill="${palette.textPrimary}">${escapeXmlText(truncateLabel(title, 62))}</text>`,
  );
  parts.push(
    `<text x="38" y="67" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="${palette.textSecondary}">문서: ${escapeXmlText(audit.documentId)} · 레이어 ${plan.layerCountBefore}개 → ${plan.layerCountAfter}개 · 안전 병합 ${plan.mergedGroupCount}묶음 · 빈 레이어 정리 ${plan.prunedEmptyLayerCount}개 · 장벽 보호 ${plan.protectedBarrierLayerCount}개</text>`,
  );
  parts.push(
    `<rect x="${fmtCoord(width - 216)}" y="32" width="178" height="30" rx="15" fill="${statusPillFill}" />`,
  );
  parts.push(
    `<text x="${fmtCoord(width - 127)}" y="51" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="700" fill="${statusPillInk}">${escapeXmlText(statusPillText)}</text>`,
  );

  // VRAM 및 OPFS 다이어트 비교 패널
  const vramY = headerHeight + 14;
  parts.push(
    `<rect x="20" y="${fmtCoord(vramY)}" width="${fmtCoord(width - 40)}" height="${fmtCoord(vramPanelHeight - 10)}" rx="12" fill="${palette.cardBg}" stroke="${palette.cardStroke}" stroke-width="1" />`,
  );
  parts.push(
    `<text x="38" y="${fmtCoord(vramY + 26)}" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="700" fill="${palette.textPrimary}">타일-희소 VRAM · OPFS 디스크 다이어트 비교</text>`,
  );

  const barRows: readonly {
    readonly label: string;
    readonly fill: string;
    readonly ratio: number;
    readonly metricText: string;
  }[] = [
    {
      label: "밀집 캔버스 VRAM",
      fill: palette.barDense,
      ratio: m.denseVramBytes / maxBarBaseline,
      metricText: `${fmt(m.denseVramMiB)} MiB (기준 100.00%)`,
    },
    {
      label: "희소 활성 타일 VRAM",
      fill: palette.barSparse,
      ratio: m.sparseVramBytes / maxBarBaseline,
      metricText: `${fmt(m.sparseVramMiB)} MiB (밀집 대비 -${fmt(m.denseToSparseSavingsPercent)}%)`,
    },
    {
      label: "다이어트 후 VRAM",
      fill: palette.barOptimized,
      ratio: m.optimizedVramBytes / maxBarBaseline,
      metricText: `${fmt(m.optimizedVramMiB)} MiB (총 -${fmt(m.totalSavingsFromDensePercent)}% · 병합 -${fmt(m.dietMergeSavingsPercent)}%)`,
    },
    {
      label: "OPFS 저장 디스크",
      fill: palette.barOpfs,
      ratio: m.opfsAfterBytes / maxOpfsBaseline,
      metricText: `${fmt(m.opfsAfterBytes / (1024 * 1024))} MiB / 전 ${fmt(m.opfsBeforeBytes / (1024 * 1024))} MiB (-${fmt(m.opfsSavingsPercent)}%)`,
    },
  ];

  for (let i = 0; i < barRows.length; i += 1) {
    const row = barRows[i];
    const y = vramY + 42 + i * 28;
    const clampedRatio = Number.isFinite(row.ratio) ? Math.max(0, Math.min(1, row.ratio)) : 0;
    const fillW = Math.max(clampedRatio > 0 ? 4 : 0, clampedRatio * barTrackWidth);

    parts.push(
      `<text x="38" y="${fmtCoord(y + 13)}" font-family="system-ui, -apple-system, sans-serif" font-size="11.5" fill="${palette.textPrimary}">${escapeXmlText(row.label)}</text>`,
    );
    parts.push(
      `<rect x="190" y="${fmtCoord(y + 2)}" width="${fmtCoord(barTrackWidth)}" height="14" rx="7" fill="${palette.barTrack}" />`,
    );
    parts.push(
      `<rect x="190" y="${fmtCoord(y + 2)}" width="${fmtCoord(fillW)}" height="14" rx="7" fill="${row.fill}" />`,
    );
    parts.push(
      `<text x="624" y="${fmtCoord(y + 13)}" font-family="ui-monospace, SFMono-Regular, monospace" font-size="11" fill="${palette.textSecondary}">${escapeXmlText(row.metricText)}</text>`,
    );
  }

  // 레이어 트리 맵 패널
  const treeY = vramY + vramPanelHeight + 4;
  parts.push(
    `<rect x="20" y="${fmtCoord(treeY)}" width="${fmtCoord(width - 40)}" height="${fmtCoord(treePanelHeight)}" rx="12" fill="${palette.cardBg}" stroke="${palette.cardStroke}" stroke-width="1" />`,
  );
  parts.push(
    `<text x="38" y="${fmtCoord(treeY + 26)}" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="700" fill="${palette.textPrimary}">레이어 트리 정규화 · 안전 장벽 맵 (아래→위 합성 스택 기준)</text>`,
  );

  if (visibleNodes.length === 0) {
    parts.push(
      `<text x="38" y="${fmtCoord(treeY + 58)}" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="${palette.textSecondary}">검사할 레이어 노드가 없습니다.</text>`,
    );
  } else {
    for (let i = 0; i < visibleNodes.length; i += 1) {
      const node = visibleNodes[i];
      const decision = decisionMap.get(node.id);
      const action: LayerDietActionKind = decision?.action ?? "keep-preserved";
      const badge = getActionBadge(action, decision?.mergeGroupId ?? null, palette);
      const y = treeY + treeHeaderHeight + i * rowHeight;
      const indent = Math.min(4, Math.max(0, node.depth)) * 18;
      const nameX = 128 + indent;

      if (i > 0) {
        parts.push(
          `<line x1="36" y1="${fmtCoord(y)}" x2="${fmtCoord(width - 36)}" y2="${fmtCoord(y)}" stroke="${palette.rowDivider}" stroke-width="1" />`,
        );
      }

      // 역할 코드 배지
      parts.push(
        `<rect x="38" y="${fmtCoord(y + 6)}" width="80" height="20" rx="5" fill="${palette.roleBadgeBg}" />`,
      );
      parts.push(
        `<text x="78" y="${fmtCoord(y + 20)}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, monospace" font-size="10" font-weight="700" fill="${palette.roleBadgeInk}">${escapeXmlText(getRoleShortCode(node.inferredRole))}</text>`,
      );

      // 정규화 레이어명 + 원본 표시
      const renamedTag =
        node.rawName.trim() !== node.normalizedName
          ? `${node.normalizedName}  ← ${node.rawName}`
          : node.normalizedName;
      const treePrefix = node.depth > 0 ? "└ " : "";
      parts.push(
        `<text x="${fmtCoord(nameX)}" y="${fmtCoord(y + 20)}" font-family="system-ui, -apple-system, sans-serif" font-size="11.5" fill="${palette.textPrimary}">${escapeXmlText(truncateLabel(`${treePrefix}${renamedTag}`, 44))}</text>`,
      );

      // 타일/VRAM 수치
      const tileLabel =
        node.kind === "folder" || node.kind === "adjustment" || node.kind === "guide"
          ? `${node.kind}`
          : `${node.nonEmptyTileCount}/${node.totalTileCount}t · ${fmt(node.sparseVramBytes / (1024 * 1024))} MiB`;
      parts.push(
        `<text x="640" y="${fmtCoord(y + 20)}" text-anchor="end" font-family="ui-monospace, SFMono-Regular, monospace" font-size="10.5" fill="${palette.textSecondary}">${escapeXmlText(tileLabel)}</text>`,
      );

      // 보호/병합/정리 상태 배지
      parts.push(
        `<rect x="658" y="${fmtCoord(y + 5)}" width="150" height="22" rx="11" fill="${badge.fill}" />`,
      );
      parts.push(
        `<text x="733" y="${fmtCoord(y + 20)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" font-weight="700" fill="${badge.ink}">${escapeXmlText(truncateLabel(badge.label, 20))}</text>`,
      );

      // 블렌드·잠금·클리핑 속성 요약
      const attrTokens: string[] = [node.blendMode];
      if (node.opacity < 1) attrTokens.push(`α${fmt(node.opacity, 2)}`);
      if (node.locked) attrTokens.push("잠금");
      if (node.clippedToBelow) attrTokens.push("클립");
      if (!node.visible) attrTokens.push("숨김");
      parts.push(
        `<text x="820" y="${fmtCoord(y + 20)}" font-family="ui-monospace, SFMono-Regular, monospace" font-size="10" fill="${palette.textSecondary}">${escapeXmlText(truncateLabel(attrTokens.join("·"), 18))}</text>`,
      );
    }

    if (hiddenRowCount > 0) {
      const noteY = treeY + treeHeaderHeight + visibleNodes.length * rowHeight + 18;
      parts.push(
        `<text x="38" y="${fmtCoord(noteY)}" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="${palette.textSecondary}">… 외 ${hiddenRowCount}개 레이어 생략 (전체 ${audit.nodes.length}개 중 상위 ${visibleNodes.length}개 표시)</text>`,
      );
    }
  }

  // 하단 SHA-256 매니페스트 지문 푸터
  const footerY = treeY + treePanelHeight + 12;
  parts.push(
    `<rect x="20" y="${fmtCoord(footerY)}" width="${fmtCoord(width - 40)}" height="${fmtCoord(footerHeight - 10)}" rx="10" fill="${palette.cardBg}" stroke="${palette.cardStroke}" stroke-width="1" />`,
  );
  parts.push(
    `<text x="38" y="${fmtCoord(footerY + 20)}" font-family="ui-monospace, SFMono-Regular, monospace" font-size="10.5" fill="${palette.textSecondary}">BEFORE SHA-256: ${escapeXmlText(plan.beforeManifestSha256.slice(0, 24))}…  |  AFTER SHA-256: ${escapeXmlText(plan.afterManifestSha256.slice(0, 24))}…</text>`,
  );
  parts.push(
    `<text x="38" y="${fmtCoord(footerY + 37)}" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" fill="${palette.textSecondary}">감사 진단: 무결성 오류 ${audit.integrityErrorCount}건 · 무의미 이름 ${audit.meaninglessNameCount}건 · 고아 클리핑 ${audit.danglingClipMaskCount}건 · 숨김 대용량 ${audit.hiddenHeavyLayerCount}건</text>`,
  );

  parts.push("</svg>");
  return parts.join("\n");
}

/**
 * 번역투 없는 자연스러운 한국어 웹툰 스튜디오 어시스턴트 인계 QA 브리프를 생성한다.
 */
export function summarizeLayerTreeHygieneKo(
  audit: LayerTreeHygieneAuditResult,
  plan: LayerVramDietPlanResult,
): LayerTreeHygieneReportKo {
  const m = plan.metrics;

  if (plan.status === "blocked-integrity-failure" || !audit.safeToCompile) {
    const headlineKo = `원고 '${audit.documentId}' 레이어 트리에서 무결성 오류 ${audit.integrityErrorCount}건이 발견되어 자동 병합과 정리를 즉시 차단했습니다.`;
    const namingSummaryKo = `정규화 전 무의미 이름 ${audit.meaninglessNameCount}건이 확인되었으나 트리 구조를 먼저 고쳐야 반영할 수 있습니다.`;
    const vramSummaryKo = `현재 희소 타일 VRAM ${fmt(m.sparseVramMiB)} MiB(밀집 기준 ${fmt(m.denseVramMiB)} MiB)를 그대로 유지했으며 손실 위험이 있는 병합은 수행하지 않았습니다.`;
    const barrierSummaryKo = `순환 참조나 누락된 부모 폴더를 복구할 때까지 모든 레이어 ${audit.totalLayerCount}개를 변경 없이 보존합니다.`;

    const checklist: string[] = [];
    for (let i = 0; i < audit.issues.length; i += 1) {
      const issue = audit.issues[i];
      if (
        issue.code === "cycle" ||
        issue.code === "orphan-parent" ||
        issue.code === "non-folder-parent" ||
        issue.code === "duplicate-node-id"
      ) {
        checklist.push(`[차단 해제 필수] ${issue.messageKo}`);
      }
    }
    if (checklist.length === 0) {
      checklist.push("[차단 해제 필수] 깨진 부모-자식 연결을 복구한 뒤 다시 검사하세요.");
    }

    const fullTextKo = [
      `[인계 판정: 즉시 차단] ${headlineKo}`,
      `- 이름 정리: ${namingSummaryKo}`,
      `- VRAM 현황: ${vramSummaryKo}`,
      `- 안전 보호: ${barrierSummaryKo}`,
      ...checklist.map((line) => `  · ${line}`),
    ].join("\n");

    return {
      documentId: audit.documentId,
      verdict: "blocked",
      verdictLabelKo: "즉시 차단",
      headlineKo,
      namingSummaryKo,
      vramSummaryKo,
      barrierSummaryKo,
      actionChecklistKo: checklist,
      fullTextKo,
    };
  }

  const hasUrgentWarnings =
    audit.danglingClipMaskCount > 0 ||
    audit.hiddenHeavyLayerCount > 0 ||
    audit.meaninglessNameCount > 0 ||
    plan.mergedGroupCount > 0 ||
    plan.prunedEmptyLayerCount > 0;

  const verdict: LayerHandoverVerdict = hasUrgentWarnings ? "needs-attention" : "ready";
  const verdictLabelKo = verdict === "ready" ? "인계 가능" : "정리 권장";

  const renamedCount = audit.renameMap.filter((r) => r.reason !== "already-canonical").length;

  const headlineKo =
    verdict === "ready"
      ? `원고 '${audit.documentId}' 레이어 ${audit.totalLayerCount}개가 스튜디오 명명 규칙과 안전 장벽 기준을 모두 충족합니다.`
      : `원고 '${audit.documentId}' 레이어 ${plan.layerCountBefore}개를 ${plan.layerCountAfter}개로 정리해 VRAM을 ${fmt(m.totalSavingsFromDenseMiB)} MiB(밀집 대비 ${fmt(m.totalSavingsFromDensePercent)}%) 줄일 수 있습니다.`;

  const namingSummaryKo =
    renamedCount === 0
      ? `전체 ${audit.totalLayerCount}개 레이어가 01_GUIDE~09_SFX 표준 코드명을 이미 따르고 있습니다.`
      : `무의미 이름 ${audit.meaninglessNameCount}건을 포함해 총 ${renamedCount}개 레이어 이름을 01_GUIDE~09_SFX 표준 코드로 정리합니다.`;

  const vramSummaryKo = `밀집 할당 ${fmt(m.denseVramMiB)} MiB에서 희소 타일 ${fmt(m.sparseVramMiB)} MiB(-${fmt(m.denseToSparseSavingsPercent)}%)로 줄고, 안전 병합 ${plan.mergedGroupCount}묶음과 빈 레이어 ${plan.prunedEmptyLayerCount}개 정리로 최종 ${fmt(m.optimizedVramMiB)} MiB(병합 추가 -${fmt(m.dietMergeSavingsPercent)}%)까지 낮췄습니다. OPFS 디스크는 ${fmt(m.opfsSavingsPercent)}% 절감됩니다.`;

  const barrierSummaryKo = `잠금·비파괴 종류·클리핑 경계·이종 블렌드 모드·부분 불투명도 레이어 ${plan.protectedBarrierLayerCount}개는 안전 장벽으로 묶어 픽셀 변형 없이 원본 그대로 지켰습니다.`;

  const checklist: string[] = [];
  if (audit.danglingClipMaskCount > 0) {
    checklist.push(
      `고아 클리핑 마스크 ${audit.danglingClipMaskCount}건의 폴더 경계나 바로 아래 베이스 레이어를 확인하세요.`,
    );
  }
  if (audit.redundantClipMaskCount > 0) {
    checklist.push(
      `빈 레이어나 숨긴 베이스에 걸린 중복 클리핑 ${audit.redundantClipMaskCount}건을 해제하면 작업 실수를 줄입니다.`,
    );
  }
  if (audit.hiddenHeavyLayerCount > 0) {
    const hiddenMiB = fmt(m.hiddenNonEmptyReclaimableVramBytes / (1024 * 1024));
    checklist.push(
      `숨긴 대용량 레이어 ${audit.hiddenHeavyLayerCount}개(${hiddenMiB} MiB)는 원화 손실을 막기 위해 남겨 두었으니 불필요하면 보관 폴더로 내리세요.`,
    );
  }
  if (plan.mergedGroupCount > 0) {
    checklist.push(
      `동일 역할 일반 래스터 ${plan.mergedGroupCount}묶음은 픽셀 결과가 완전히 같은 구간만 선별해 안전 병합합니다.`,
    );
  }
  if (plan.prunedEmptyLayerCount > 0) {
    checklist.push(
      `활성 타일이 0개인 빈 래스터 ${plan.prunedEmptyLayerCount}개를 정리해 불필요한 타일 테이블을 비웁니다.`,
    );
  }
  if (checklist.length === 0) {
    checklist.push("추가 정리 항목이 없습니다. 바로 다음 공정 어시스턴트에게 인계해도 안전합니다.");
  }

  const fullTextKo = [
    `[인계 판정: ${verdictLabelKo}] ${headlineKo}`,
    `- 이름 정리: ${namingSummaryKo}`,
    `- VRAM·OPFS: ${vramSummaryKo}`,
    `- 안전 장벽: ${barrierSummaryKo}`,
    `- 후속 확인:`,
    ...checklist.map((line) => `  · ${line}`),
    `- 매니페스트 지문: 전 ${plan.beforeManifestSha256.slice(0, 16)} → 후 ${plan.afterManifestSha256.slice(0, 16)}`,
  ].join("\n");

  return {
    documentId: audit.documentId,
    verdict,
    verdictLabelKo,
    headlineKo,
    namingSummaryKo,
    vramSummaryKo,
    barrierSummaryKo,
    actionChecklistKo: checklist,
    fullTextKo,
  };
}
