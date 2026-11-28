/**
 * Wave 150 마일스톤 — 순수 OKLCH 9-게이트 DAG 상태 보드 SVG 렌더러 및 한국어 총괄 PD 출고 여권 브리프.
 *
 * - 모든 색상은 순수 `oklch(...)`만 사용한다(원시 hex, rgb, hsl 절대 금지).
 * - 모든 SVG 텍스트·속성에 XML/XSS 이스케이프를 적용하고 유한 숫자만 출력한다.
 * - 한국어 총괄 PD 브리프는 번역투 없이 스튜디오 출고 실무 언어로 판정·캐시 절감·근본 차단 순위를 요약한다.
 */

import type {
  EpisodePreflightDagResult,
  PreflightDagSvgOptions,
  PreflightGateExecutionRecord,
  PreflightGateStatus,
  PreflightReleaseDecision,
} from "./preflight-dag-types";

const OKLCH_BOARD_PALETTE = {
  paperBg: "oklch(0.985 0.006 90)",
  surfaceBg: "oklch(0.996 0.003 90)",
  headerBg: "oklch(0.955 0.012 155)",
  sealStripBg: "oklch(0.962 0.01 160)",
  triageStripBg: "oklch(0.958 0.024 28)",
  borderSoft: "oklch(0.84 0.014 90)",
  borderStrong: "oklch(0.3 0.045 160)",
  textPrimary: "oklch(0.21 0.028 160)",
  textMuted: "oklch(0.45 0.024 160)",
  textInverse: "oklch(0.985 0.004 90)",
  passFill: "oklch(0.952 0.026 155)",
  passStroke: "oklch(0.42 0.115 155)",
  passBadgeBg: "oklch(0.39 0.11 155)",
  warnFill: "oklch(0.962 0.036 82)",
  warnStroke: "oklch(0.56 0.145 76)",
  warnBadgeBg: "oklch(0.54 0.145 74)",
  blockFill: "oklch(0.955 0.032 26)",
  blockStroke: "oklch(0.5 0.2 26)",
  blockBadgeBg: "oklch(0.49 0.2 26)",
  skipFill: "oklch(0.942 0.008 245)",
  skipStroke: "oklch(0.56 0.028 245)",
  skipBadgeBg: "oklch(0.48 0.028 245)",
  cacheHitBadgeBg: "oklch(0.43 0.11 210)",
  cacheMissBadgeBg: "oklch(0.42 0.055 255)",
  cacheEfficiencyPillBg: "oklch(0.92 0.032 210)",
  cacheEfficiencyStroke: "oklch(0.45 0.1 210)",
  edgeNormalStroke: "oklch(0.58 0.032 160)",
  edgeCacheHitStroke: "oklch(0.48 0.11 210)",
  edgeBlockedStroke: "oklch(0.52 0.195 26)",
  sealStampBg: "oklch(0.28 0.065 160)",
  sealStampWarnBg: "oklch(0.52 0.14 74)",
  sealStampBlockBg: "oklch(0.48 0.195 26)",
} as const;

const GATE_STATUS_LABEL_KO: Readonly<Record<PreflightGateStatus, string>> = {
  passed: "통과",
  warning: "경고",
  blocked: "차단",
  "skipped-upstream-blocked": "상류 차단",
};

const RELEASE_DECISION_LABEL_KO: Readonly<Record<PreflightReleaseDecision, string>> = {
  approved: "출고 승인",
  "conditional-pass": "조건부 통과",
  blocked: "출고 차단",
};

function fmtNum(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function fmtPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return "0.0";
  const pct = Math.round(ratio * 1000) / 10;
  return (Object.is(pct, -0) ? 0 : pct).toFixed(1);
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

/**
 * SVG 텍스트 및 속성 문자열의 XML/XSS 특수문자를 안전하게 이스케이프한다.
 */
export function escapePreflightXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function nodeColorsForStatus(status: PreflightGateStatus): {
  readonly fill: string;
  readonly stroke: string;
  readonly badgeBg: string;
  readonly dashed: boolean;
} {
  if (status === "passed") {
    return {
      fill: OKLCH_BOARD_PALETTE.passFill,
      stroke: OKLCH_BOARD_PALETTE.passStroke,
      badgeBg: OKLCH_BOARD_PALETTE.passBadgeBg,
      dashed: false,
    };
  }
  if (status === "warning") {
    return {
      fill: OKLCH_BOARD_PALETTE.warnFill,
      stroke: OKLCH_BOARD_PALETTE.warnStroke,
      badgeBg: OKLCH_BOARD_PALETTE.warnBadgeBg,
      dashed: false,
    };
  }
  if (status === "blocked") {
    return {
      fill: OKLCH_BOARD_PALETTE.blockFill,
      stroke: OKLCH_BOARD_PALETTE.blockStroke,
      badgeBg: OKLCH_BOARD_PALETTE.blockBadgeBg,
      dashed: false,
    };
  }
  return {
    fill: OKLCH_BOARD_PALETTE.skipFill,
    stroke: OKLCH_BOARD_PALETTE.skipStroke,
    badgeBg: OKLCH_BOARD_PALETTE.skipBadgeBg,
    dashed: true,
  };
}

function decisionStampBg(decision: PreflightReleaseDecision): string {
  if (decision === "approved") return OKLCH_BOARD_PALETTE.sealStampBg;
  if (decision === "conditional-pass") return OKLCH_BOARD_PALETTE.sealStampWarnBg;
  return OKLCH_BOARD_PALETTE.sealStampBlockBg;
}

function renderFailClosedDagBoardSvg(
  result: EpisodePreflightDagResult,
  widthPx: number,
  titleKo: string,
): string {
  const errors = result.validationErrors.slice(0, 6);
  const heightPx = 228 + errors.length * 24;
  const cycleInfo =
    result.cycleDetected && result.cyclePathGateIds.length > 0
      ? `순환 경로: ${result.cyclePathGateIds.join(" -> ")}`
      : "입력 계약 또는 의존성 오류로 파이프라인 실행을 중단했습니다.";

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmtNum(widthPx)} ${fmtNum(heightPx)}" width="${fmtNum(widthPx)}" height="${fmtNum(heightPx)}" role="img" aria-label="${escapePreflightXml(titleKo)}" data-release-decision="blocked" data-passport-sha256="${escapePreflightXml(result.passport.passportSha256Hex)}">`,
    `  <rect x="0" y="0" width="${fmtNum(widthPx)}" height="${fmtNum(heightPx)}" fill="${OKLCH_BOARD_PALETTE.paperBg}" />`,
    `  <rect x="20" y="20" width="${fmtNum(widthPx - 40)}" height="${fmtNum(heightPx - 40)}" rx="14" fill="${OKLCH_BOARD_PALETTE.blockFill}" stroke="${OKLCH_BOARD_PALETTE.blockStroke}" stroke-width="2" />`,
    `  <text x="42" y="58" font-family="sans-serif" font-size="18" font-weight="700" fill="${OKLCH_BOARD_PALETTE.blockStroke}">${escapePreflightXml(titleKo)} — 검증 차단(Fail-Closed)</text>`,
    `  <text x="42" y="84" font-family="sans-serif" font-size="13" fill="${OKLCH_BOARD_PALETTE.textPrimary}">${escapePreflightXml(truncateText(cycleInfo, 96))}</text>`,
  ];

  for (let i = 0; i < errors.length; i += 1) {
    const err = errors[i];
    if (!err) continue;
    const y = 116 + i * 24;
    lines.push(
      `  <text x="48" y="${fmtNum(y)}" font-family="sans-serif" font-size="12" fill="${OKLCH_BOARD_PALETTE.textPrimary}">• [${escapePreflightXml(err.code)}] ${escapePreflightXml(truncateText(err.detailKo, 96))}</text>`,
    );
  }

  lines.push(
    `  <rect x="40" y="${fmtNum(heightPx - 68)}" width="${fmtNum(widthPx - 80)}" height="36" rx="8" fill="${OKLCH_BOARD_PALETTE.surfaceBg}" stroke="${OKLCH_BOARD_PALETTE.blockStroke}" stroke-width="1" />`,
    `  <text x="54" y="${fmtNum(heightPx - 45)}" font-family="monospace" font-size="11" fill="${OKLCH_BOARD_PALETTE.textMuted}">여권 ${escapePreflightXml(result.passport.passportId)} · 출고 차단 · SHA-256 ${escapePreflightXml(result.passport.passportSha256Hex.slice(0, 24))}…</text>`,
    `</svg>`,
  );

  return lines.join("\n");
}

interface PositionedNode {
  readonly record: PreflightGateExecutionRecord;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * 계층형 9-게이트 DAG 상태 보드, 캐시 절감률 배지, 출고 여권 SHA-256 봉인 도장을
 * 순수 `oklch(...)` SVG 문자열로 렌더링한다.
 */
export function renderPreflightDagBoardSvg(
  result: EpisodePreflightDagResult,
  options?: PreflightDagSvgOptions,
): string {
  const widthPx = Math.max(960, Math.round(options?.widthPx ?? 1380));
  const titleKo =
    options?.titleKo?.trim() || `${result.episodeTitleKo} (${result.revisionTag}) 출고 DAG 보드`;
  const showDigestPrefix = options?.showDigestPrefix !== false;

  if (!result.ok || result.gateResults.length === 0) {
    return renderFailClosedDagBoardSvg(result, widthPx, titleKo);
  }

  const columnsMap = new Map<number, PreflightGateExecutionRecord[]>();
  let maxDepth = 0;
  for (let i = 0; i < result.gateResults.length; i += 1) {
    const rec = result.gateResults[i];
    if (!rec) continue;
    if (rec.layerDepth > maxDepth) maxDepth = rec.layerDepth;
    const bucket = columnsMap.get(rec.layerDepth);
    if (bucket) bucket.push(rec);
    else columnsMap.set(rec.layerDepth, [rec]);
  }

  let maxRowsInColumn = 1;
  columnsMap.forEach((rows) => {
    if (rows.length > maxRowsInColumn) maxRowsInColumn = rows.length;
  });

  const colCount = maxDepth + 1;
  const padX = 28;
  const headerH = 84;
  const nodeH = 92;
  const rowGapY = 26;
  const colGapX = 26;
  const availableW = widthPx - padX * 2;
  const nodeW = Math.max(128, Math.floor((availableW - colGapX * (colCount - 1)) / colCount));
  const usedGraphW = nodeW * colCount + colGapX * (colCount - 1);
  const graphOriginX = padX + Math.floor((availableW - usedGraphW) / 2);

  const graphAreaH = maxRowsInColumn * nodeH + Math.max(0, maxRowsInColumn - 1) * rowGapY + 48;
  const graphOriginY = headerH + 22;

  const topBlockers = result.criticalBlockers.slice(0, 3);
  const triageStripH = topBlockers.length > 0 ? 44 + topBlockers.length * 22 : 0;
  const triageOriginY = graphOriginY + graphAreaH + 8;
  const sealStripH = 74;
  const sealOriginY = triageOriginY + triageStripH + (triageStripH > 0 ? 12 : 4);
  const heightPx = sealOriginY + sealStripH + 22;

  const positionedById = new Map<string, PositionedNode>();
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const rows = columnsMap.get(depth) ?? [];
    const columnHeight = rows.length * nodeH + Math.max(0, rows.length - 1) * rowGapY;
    const startY = graphOriginY + Math.floor((graphAreaH - columnHeight) / 2);
    const x = graphOriginX + depth * (nodeW + colGapX);
    for (let r = 0; r < rows.length; r += 1) {
      const rec = rows[r];
      if (!rec) continue;
      positionedById.set(rec.gateId, {
        record: rec,
        x,
        y: startY + r * (nodeH + rowGapY),
        width: nodeW,
        height: nodeH,
      });
    }
  }

  const decisionLabel = RELEASE_DECISION_LABEL_KO[result.releaseDecision];
  const decisionBg = decisionStampBg(result.releaseDecision);
  const cacheHitRateText = fmtPercent(result.cacheMetrics.hitRateRatio);
  const timeSavedPctText = fmtPercent(result.cacheMetrics.timeSavedRatio);
  const cacheBadgeText = `캐시 히트 ${result.cacheMetrics.cacheHitCount}/${result.cacheMetrics.totalGateCount} (${cacheHitRateText}%) · 시간 절감 ${result.cacheMetrics.savedDurationMs}ms (${timeSavedPctText}%)`;

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmtNum(widthPx)} ${fmtNum(heightPx)}" width="${fmtNum(widthPx)}" height="${fmtNum(heightPx)}" role="img" aria-label="${escapePreflightXml(titleKo)}" data-release-decision="${escapePreflightXml(result.releaseDecision)}" data-passport-sha256="${escapePreflightXml(result.passport.passportSha256Hex)}">`,
    `  <defs>`,
    `    <marker id="wf150-arrow-normal" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">`,
    `      <path d="M 0 1 L 10 5 L 0 9 z" fill="${OKLCH_BOARD_PALETTE.edgeNormalStroke}" />`,
    `    </marker>`,
    `    <marker id="wf150-arrow-hit" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">`,
    `      <path d="M 0 1 L 10 5 L 0 9 z" fill="${OKLCH_BOARD_PALETTE.edgeCacheHitStroke}" />`,
    `    </marker>`,
    `    <marker id="wf150-arrow-blocked" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">`,
    `      <path d="M 0 1 L 10 5 L 0 9 z" fill="${OKLCH_BOARD_PALETTE.edgeBlockedStroke}" />`,
    `    </marker>`,
    `  </defs>`,
    `  <rect x="0" y="0" width="${fmtNum(widthPx)}" height="${fmtNum(heightPx)}" fill="${OKLCH_BOARD_PALETTE.paperBg}" />`,
    `  <rect x="16" y="14" width="${fmtNum(widthPx - 32)}" height="${fmtNum(headerH)}" rx="14" fill="${OKLCH_BOARD_PALETTE.headerBg}" stroke="${OKLCH_BOARD_PALETTE.borderSoft}" stroke-width="1.2" />`,
    `  <text x="34" y="44" font-family="sans-serif" font-size="18" font-weight="700" fill="${OKLCH_BOARD_PALETTE.textPrimary}">${escapePreflightXml(truncateText(titleKo, 56))}</text>`,
    `  <text x="34" y="68" font-family="sans-serif" font-size="12" fill="${OKLCH_BOARD_PALETTE.textMuted}">에피소드 ${escapePreflightXml(result.episodeId)} · 정책 ${escapePreflightXml(result.strictZeroWarnings ? "엄격 무경고" : "표준(경고 조건부 허용)")} · 게이트 ${result.gateResults.length}종</text>`,
    `  <rect x="${fmtNum(widthPx - 512)}" y="28" width="356" height="32" rx="10" fill="${OKLCH_BOARD_PALETTE.cacheEfficiencyPillBg}" stroke="${OKLCH_BOARD_PALETTE.cacheEfficiencyStroke}" stroke-width="1" />`,
    `  <text x="${fmtNum(widthPx - 334)}" y="48" text-anchor="middle" font-family="sans-serif" font-size="11.5" font-weight="600" fill="${OKLCH_BOARD_PALETTE.textPrimary}">${escapePreflightXml(cacheBadgeText)}</text>`,
    `  <rect x="${fmtNum(widthPx - 144)}" y="28" width="112" height="32" rx="10" fill="${decisionBg}" />`,
    `  <text x="${fmtNum(widthPx - 88)}" y="48" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="700" fill="${OKLCH_BOARD_PALETTE.textInverse}">${escapePreflightXml(decisionLabel)}</text>`,
    `  <g id="wf150-dag-edges">`,
  ];

  for (let i = 0; i < result.gateResults.length; i += 1) {
    const child = result.gateResults[i];
    if (!child) continue;
    const childPos = positionedById.get(child.gateId);
    if (!childPos) continue;
    for (let p = 0; p < child.dependsOn.length; p += 1) {
      const parentId = child.dependsOn[p];
      if (parentId === undefined) continue;
      const parentPos = positionedById.get(parentId);
      if (!parentPos) continue;

      const x1 = parentPos.x + parentPos.width;
      const y1 = parentPos.y + parentPos.height / 2;
      const x2 = childPos.x - 2;
      const y2 = childPos.y + childPos.height / 2;
      const dx = Math.max(24, (x2 - x1) * 0.45);
      const isBlockedEdge =
        parentPos.record.status === "blocked" ||
        parentPos.record.status === "skipped-upstream-blocked";
      const isCacheEdge = !isBlockedEdge && child.cacheDisposition === "cache-hit";

      const stroke = isBlockedEdge
        ? OKLCH_BOARD_PALETTE.edgeBlockedStroke
        : isCacheEdge
          ? OKLCH_BOARD_PALETTE.edgeCacheHitStroke
          : OKLCH_BOARD_PALETTE.edgeNormalStroke;
      const markerRef = isBlockedEdge
        ? "url(#wf150-arrow-blocked)"
        : isCacheEdge
          ? "url(#wf150-arrow-hit)"
          : "url(#wf150-arrow-normal)";
      const dashAttr = isBlockedEdge ? ` stroke-dasharray="5 4"` : "";

      lines.push(
        `    <path d="M ${fmtNum(x1)} ${fmtNum(y1)} C ${fmtNum(x1 + dx)} ${fmtNum(y1)}, ${fmtNum(x2 - dx)} ${fmtNum(y2)}, ${fmtNum(x2)} ${fmtNum(y2)}" fill="none" stroke="${stroke}" stroke-width="${isBlockedEdge ? "2" : "1.6"}"${dashAttr} marker-end="${markerRef}" />`,
      );
    }
  }

  lines.push(`  </g>`, `  <g id="wf150-dag-nodes">`);

  for (let i = 0; i < result.gateResults.length; i += 1) {
    const rec = result.gateResults[i];
    if (!rec) continue;
    const pos = positionedById.get(rec.gateId);
    if (!pos) continue;
    const colors = nodeColorsForStatus(rec.status);
    const dashAttr = colors.dashed ? ` stroke-dasharray="6 4"` : "";
    const statusText = GATE_STATUS_LABEL_KO[rec.status];
    const cacheLabel =
      rec.cacheDisposition === "cache-hit"
        ? "캐시 히트"
        : rec.cacheDisposition === "skipped-upstream-blocked"
          ? "생략"
          : "재실행";
    const cachePillBg =
      rec.cacheDisposition === "cache-hit"
        ? OKLCH_BOARD_PALETTE.cacheHitBadgeBg
        : rec.cacheDisposition === "skipped-upstream-blocked"
          ? OKLCH_BOARD_PALETTE.skipBadgeBg
          : OKLCH_BOARD_PALETTE.cacheMissBadgeBg;

    const pillW = Math.min(62, Math.floor((pos.width - 22) / 2));
    const rightPillX = pos.x + pos.width - pillW - 8;

    lines.push(
      `    <g data-gate-id="${escapePreflightXml(rec.gateId)}" data-status="${escapePreflightXml(rec.status)}" data-cache="${escapePreflightXml(rec.cacheDisposition)}">`,
      `      <rect x="${fmtNum(pos.x)}" y="${fmtNum(pos.y)}" width="${fmtNum(pos.width)}" height="${fmtNum(pos.height)}" rx="12" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="1.6"${dashAttr} />`,
      `      <text x="${fmtNum(pos.x + 10)}" y="${fmtNum(pos.y + 22)}" font-family="sans-serif" font-size="12" font-weight="700" fill="${OKLCH_BOARD_PALETTE.textPrimary}">${escapePreflightXml(truncateText(rec.shortLabelKo, 14))}</text>`,
      `      <text x="${fmtNum(pos.x + 10)}" y="${fmtNum(pos.y + 38)}" font-family="monospace" font-size="9.5" fill="${OKLCH_BOARD_PALETTE.textMuted}">${escapePreflightXml(truncateText(rec.gateId, 20))}</text>`,
      `      <rect x="${fmtNum(pos.x + 8)}" y="${fmtNum(pos.y + 48)}" width="${fmtNum(pillW)}" height="19" rx="6" fill="${colors.badgeBg}" />`,
      `      <text x="${fmtNum(pos.x + 8 + pillW / 2)}" y="${fmtNum(pos.y + 61)}" text-anchor="middle" font-family="sans-serif" font-size="9.5" font-weight="700" fill="${OKLCH_BOARD_PALETTE.textInverse}">${escapePreflightXml(statusText)}</text>`,
      `      <rect x="${fmtNum(rightPillX)}" y="${fmtNum(pos.y + 48)}" width="${fmtNum(pillW)}" height="19" rx="6" fill="${cachePillBg}" />`,
      `      <text x="${fmtNum(rightPillX + pillW / 2)}" y="${fmtNum(pos.y + 61)}" text-anchor="middle" font-family="sans-serif" font-size="9.5" font-weight="600" fill="${OKLCH_BOARD_PALETTE.textInverse}">${escapePreflightXml(cacheLabel)}</text>`,
    );

    if (showDigestPrefix) {
      const digestCaption = `sha:${rec.effectiveInputDigest.slice(0, 8)} · ${rec.computedDurationMs}ms`;
      lines.push(
        `      <text x="${fmtNum(pos.x + 10)}" y="${fmtNum(pos.y + 82)}" font-family="monospace" font-size="9" fill="${OKLCH_BOARD_PALETTE.textMuted}">${escapePreflightXml(digestCaption)}</text>`,
      );
    }

    lines.push(`    </g>`);
  }

  lines.push(`  </g>`);

  if (topBlockers.length > 0) {
    lines.push(
      `  <rect x="16" y="${fmtNum(triageOriginY)}" width="${fmtNum(widthPx - 32)}" height="${fmtNum(triageStripH)}" rx="12" fill="${OKLCH_BOARD_PALETTE.triageStripBg}" stroke="${OKLCH_BOARD_PALETTE.blockStroke}" stroke-width="1.2" />`,
      `  <text x="34" y="${fmtNum(triageOriginY + 24)}" font-family="sans-serif" font-size="12.5" font-weight="700" fill="${OKLCH_BOARD_PALETTE.blockStroke}">최우선 수정 트리아지 (하류 파급 반경 × 심각도 순)</text>`,
    );
    for (let i = 0; i < topBlockers.length; i += 1) {
      const item = topBlockers[i];
      if (!item) continue;
      const rowY = triageOriginY + 46 + i * 22;
      const lineText = `${item.rank}순위 [${item.gateLabelKo} · 하류 파급 ${item.transitiveBlastRadius}개] ${item.titleKo} (${item.code})`;
      lines.push(
        `  <text x="42" y="${fmtNum(rowY)}" font-family="sans-serif" font-size="11.5" fill="${OKLCH_BOARD_PALETTE.textPrimary}">${escapePreflightXml(truncateText(lineText, 112))}</text>`,
      );
    }
  }

  const stampX = widthPx - 284;
  lines.push(
    `  <rect x="16" y="${fmtNum(sealOriginY)}" width="${fmtNum(widthPx - 32)}" height="${fmtNum(sealStripH)}" rx="14" fill="${OKLCH_BOARD_PALETTE.sealStripBg}" stroke="${OKLCH_BOARD_PALETTE.borderStrong}" stroke-width="1.4" />`,
    `  <text x="34" y="${fmtNum(sealOriginY + 26)}" font-family="sans-serif" font-size="13.5" font-weight="700" fill="${OKLCH_BOARD_PALETTE.textPrimary}">에피소드 출고 여권 봉인 (FIPS 180-4 SHA-256)</text>`,
    `  <text x="34" y="${fmtNum(sealOriginY + 46)}" font-family="monospace" font-size="11" fill="${OKLCH_BOARD_PALETTE.textMuted}">여권 ID: ${escapePreflightXml(result.passport.passportId)} · 발급: ${escapePreflightXml(result.passport.issuedAtIso)} · 대상: ${escapePreflightXml(result.passport.releaseScope.platforms.join(", "))}</text>`,
    `  <text x="34" y="${fmtNum(sealOriginY + 63)}" font-family="monospace" font-size="10.5" fill="${OKLCH_BOARD_PALETTE.textPrimary}">SHA-256: ${escapePreflightXml(result.passport.passportSha256Hex)}</text>`,
    `  <rect x="${fmtNum(stampX)}" y="${fmtNum(sealOriginY + 14)}" width="250" height="46" rx="10" fill="${decisionBg}" />`,
    `  <text x="${fmtNum(stampX + 125)}" y="${fmtNum(sealOriginY + 34)}" text-anchor="middle" font-family="sans-serif" font-size="12.5" font-weight="700" fill="${OKLCH_BOARD_PALETTE.textInverse}">여권 봉인 · ${escapePreflightXml(decisionLabel)}</text>`,
    `  <text x="${fmtNum(stampX + 125)}" y="${fmtNum(sealOriginY + 51)}" text-anchor="middle" font-family="monospace" font-size="10" fill="${OKLCH_BOARD_PALETTE.textInverse}">통과 ${result.passport.passedGateCount} · 경고 ${result.passport.warningGateCount} · 차단 ${result.passport.blockedGateCount} · 생략 ${result.passport.skippedGateCount}</text>`,
    `</svg>`,
  );

  return lines.join("\n");
}

/**
 * 총괄 PD가 출고 승인·반려 여부를 즉시 판단할 수 있는 한국어 출고 여권 브리프를 생성한다.
 */
export function summarizePreflightDagReportKo(result: EpisodePreflightDagResult): string {
  const decisionLabel = RELEASE_DECISION_LABEL_KO[result.releaseDecision];
  const lines: string[] = [
    `[ToonStudio 에피소드 출고 여권 브리프]`,
    `□ 대상 원고: ${result.episodeTitleKo} (${result.episodeId} · ${result.revisionTag})`,
    `  ㅇ 최종 출고 판정: ${decisionLabel} (${result.releaseApproved ? "즉시 멀티 플랫폼 배포 가능" : "보완 조치 후 재검증 필요"})`,
    `  ㅇ 검수 정책: ${result.strictZeroWarnings ? "엄격 무경고 모드(경고 1건 이상 시 자동 차단)" : "표준 출고 모드(치명 차단 0건 기준, 경고는 조건부 통과)"}`,
    `  ㅇ 검수 시각: ${result.evaluatedAtIso}`,
  ];

  if (!result.ok) {
    lines.push(
      `□ DAG 구성 검증 실패 (Fail-Closed 차단)`,
      result.cycleDetected
        ? `  ㅇ 순환 의존성 감지: ${result.cyclePathGateIds.join(" -> ")}`
        : `  ㅇ 입력 계약 오류 ${result.validationErrors.length}건으로 실행을 중단했습니다.`,
    );
    for (let i = 0; i < result.validationErrors.length; i += 1) {
      const err = result.validationErrors[i];
      if (!err) continue;
      lines.push(`    - [${err.code}] ${err.detailKo}`);
    }
    lines.push(
      `□ 차단 여권 봉인`,
      `  ㅇ 여권 번호: ${result.passport.passportId}`,
      `  ㅇ SHA-256 봉인 해시: ${result.passport.passportSha256Hex}`,
    );
    return lines.join("\n");
  }

  lines.push(
    `□ 증분 캐시 실행 효율`,
    `  ㅇ 게이트 처리: 전체 ${result.cacheMetrics.totalGateCount}개 중 캐시 히트 ${result.cacheMetrics.cacheHitCount}개 (${fmtPercent(result.cacheMetrics.hitRateRatio)}%) · 재실행 ${result.cacheMetrics.cacheMissCount}개 · 상류 차단 생략 ${result.cacheMetrics.skippedCount}개`,
    `  ㅇ 연산 시간: 전체 기준 ${result.cacheMetrics.estimatedFullDurationMs}ms 대비 실실행 ${result.cacheMetrics.actualExecutedDurationMs}ms (절감 ${result.cacheMetrics.savedDurationMs}ms · ${fmtPercent(result.cacheMetrics.timeSavedRatio)}%)`,
    `□ 품질 게이트 위상 실행 내역`,
  );

  for (let i = 0; i < result.gateResults.length; i += 1) {
    const rec = result.gateResults[i];
    if (!rec) continue;
    const statusLabel = GATE_STATUS_LABEL_KO[rec.status];
    const cacheTag =
      rec.cacheDisposition === "cache-hit"
        ? "캐시 히트"
        : rec.cacheDisposition === "skipped-upstream-blocked"
          ? "상류 차단 생략"
          : `재실행 ${rec.computedDurationMs}ms`;
    lines.push(
      `  ${i + 1}. ${rec.labelKo} (${rec.gateId}) — [${statusLabel} / ${cacheTag}] ${rec.summaryKo}`,
    );
  }

  if (result.criticalBlockers.length > 0) {
    lines.push(`□ 최우선 수정 트리아지 (하류 파급 반경 × 심각도 순)`);
    for (let i = 0; i < result.criticalBlockers.length; i += 1) {
      const item = result.criticalBlockers[i];
      if (!item) continue;
      const promoNote = item.promotedByStrictPolicy ? " · 엄격 무경고 승격" : "";
      const cutNote = item.cutIndex !== undefined ? ` · ${item.cutIndex}컷` : "";
      const impactText =
        item.impactedGateIds.length > 0 ? item.impactedGateIds.join(", ") : "직접 하류 없음";
      lines.push(
        `  ㅇ ${item.rank}순위 [${item.gateLabelKo}${cutNote}${promoNote}] ${item.titleKo} (${item.code})`,
        `    - 사유: ${item.detailKo}`,
        `    - 하류 파급: ${item.transitiveBlastRadius}개 게이트 (${impactText}) · 우선 점수 ${item.priorityScore}`,
      );
      if (item.fixHintKo) {
        lines.push(`    - 권장 조치: ${item.fixHintKo}`);
      }
    }
  } else {
    lines.push(`□ 최우선 수정 트리아지`, `  ㅇ 치명 차단 항목이 없습니다.`);
  }

  lines.push(
    `□ 출고 여권 암호화 봉인`,
    `  ㅇ 여권 번호: ${result.passport.passportId}`,
    `  ㅇ 배포 범위: 플랫폼 [${result.passport.releaseScope.platforms.join(", ")}] · 언어 [${result.passport.releaseScope.locales.join(", ")}]`,
    `  ㅇ 입력 지문(SHA-256): ${result.passport.snapshotInputDigest}`,
    `  ㅇ 여권 봉인(SHA-256): ${result.passport.passportSha256Hex}`,
  );

  return lines.join("\n");
}
