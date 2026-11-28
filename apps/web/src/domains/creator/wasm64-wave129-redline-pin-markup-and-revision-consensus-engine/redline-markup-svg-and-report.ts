/**
 * Wave 129 — 인쇄 안전 순수 OKLCH 레드라인 핀 보드 SVG 렌더러 및 한국어 PD 마감 검수 브리프 생성기.
 *
 * - 원시 색상 표기 대신 순수 `oklch(...)` 팔레트만 사용한다.
 * - XML 특수문자(`<`, `>`, `&`, `"`, `'`)를 전부 이스케이프하고 모든 좌표·수치를 유한 값으로 보정한다.
 * - 한국어 검수 브리프는 웹툰 담당 PD 관점의 간결한 문장으로 작성한다.
 */

import {
  REDLINE_CATEGORY_LABELS_KO,
  REDLINE_SEVERITY_BADGE_LABELS,
  REDLINE_SEVERITY_LABELS_KO,
  REDLINE_STATUS_LABELS_KO,
  STUDIO_COLLABORATOR_ROLES,
  STUDIO_ROLE_LABELS_KO,
  type EpisodeRevisionSignOffResult,
  type EpisodeSignOffDecision,
  type RedlinePinItem,
  type RedlinePinSeverity,
  type RedlineRevisionBoardSvgOptions,
  type RevisionRoundDiffResult,
  type StudioCollaboratorRole,
} from "./redline-markup-types";
import { normalizeRedlinePins } from "./redline-pin-revision-engine";

const OKLCH_PALETTE = {
  paperBg: "oklch(0.985 0.006 90)",
  surfaceBg: "oklch(0.997 0.002 90)",
  headerBg: "oklch(0.955 0.012 155)",
  cutBackdrop: "oklch(0.968 0.008 92)",
  cutSafeGuide: "oklch(0.84 0.015 92)",
  borderStrong: "oklch(0.28 0.044 160)",
  borderSoft: "oklch(0.85 0.013 92)",
  textPrimary: "oklch(0.21 0.026 160)",
  textMuted: "oklch(0.46 0.022 160)",
  textInverse: "oklch(0.988 0.004 90)",
  trackBg: "oklch(0.92 0.01 92)",
  approvedFill: "oklch(0.36 0.098 158)",
  approvedSoft: "oklch(0.93 0.032 158)",
  conditionalFill: "oklch(0.55 0.145 76)",
  conditionalSoft: "oklch(0.94 0.045 80)",
  blockedFill: "oklch(0.49 0.195 26)",
  blockedSoft: "oklch(0.93 0.048 26)",
  clusterFill: "oklch(0.68 0.115 76 / 0.18)",
  clusterStroke: "oklch(0.54 0.135 72)",
  conflictFill: "oklch(0.56 0.195 26 / 0.19)",
  conflictStroke: "oklch(0.48 0.21 25)",
  closedPinFill: "oklch(0.46 0.105 158)",
  closedPinRing: "oklch(0.95 0.02 158)",
  pinRingLight: "oklch(0.99 0.003 90)",
} as const;

const SEVERITY_FILL_OKLCH: Readonly<Record<RedlinePinSeverity, string>> = {
  blocker: "oklch(0.51 0.205 26)",
  major: "oklch(0.57 0.155 68)",
  polish: "oklch(0.50 0.115 232)",
};

const SEVERITY_SOFT_BG_OKLCH: Readonly<Record<RedlinePinSeverity, string>> = {
  blocker: "oklch(0.94 0.042 26)",
  major: "oklch(0.95 0.044 74)",
  polish: "oklch(0.94 0.028 232)",
};

const ROLE_BAR_OKLCH: Readonly<Record<StudioCollaboratorRole, string>> = {
  "pd-editor": "oklch(0.36 0.088 158)",
  "art-director": "oklch(0.42 0.102 195)",
  "lead-artist": "oklch(0.48 0.145 38)",
  inker: "oklch(0.38 0.045 255)",
  colorist: "oklch(0.56 0.158 65)",
  typesetter: "oklch(0.49 0.112 292)",
  "bg3d-artist": "oklch(0.47 0.108 228)",
};

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/**
 * XML/SVG 텍스트 노드의 특수문자(`<`, `>`, `&`, `"`, `'`)를 안전하게 이스케이프한다.
 */
export function escapeRedlineXml(raw: string): string {
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

function decisionLabelKo(decision: EpisodeSignOffDecision): string {
  if (decision === "approved") return "출고 승인";
  if (decision === "conditional-pass-with-polish") return "조건부 출고";
  return "출고 차단";
}

function decisionFillOklch(decision: EpisodeSignOffDecision): string {
  if (decision === "approved") return OKLCH_PALETTE.approvedFill;
  if (decision === "conditional-pass-with-polish") return OKLCH_PALETTE.conditionalFill;
  return OKLCH_PALETTE.blockedFill;
}

function pickFeaturedCutId(
  pins: readonly RedlinePinItem[],
  explicitCutId: string | undefined,
): string | undefined {
  const trimmed = explicitCutId?.trim();
  if (trimmed && trimmed.length > 0) return trimmed;
  if (pins.length === 0) return undefined;

  const scores = new Map<string, number>();
  for (let i = 0; i < pins.length; i += 1) {
    const pin = pins[i];
    if (!pin) continue;
    let weight = 1;
    if (pin.status !== "verified-closed") {
      if (pin.severity === "blocker") weight = 20;
      else if (pin.severity === "major") weight = 8;
      else weight = 3;
    }
    scores.set(pin.cutId, (scores.get(pin.cutId) ?? 0) + weight);
  }

  let bestCutId: string | undefined;
  let bestScore = -1;
  const sortedCuts = [...scores.keys()].sort();
  for (let i = 0; i < sortedCuts.length; i += 1) {
    const cid = sortedCuts[i];
    if (cid === undefined) continue;
    const score = scores.get(cid) ?? 0;
    if (score > bestScore) {
      bestScore = score;
      bestCutId = cid;
    }
  }
  return bestCutId;
}

/**
 * 대표 컷 레드라인 핀·군집 오버레이, 심각도별 배지(`BLOCKER`/`MAJOR`/`POLISH`),
 * 역할별 잔여 작업량 막대 및 출고 승인 배지를 순수 OKLCH SVG로 렌더링한다.
 */
export function renderRedlineRevisionBoardSvg(
  pins: readonly RedlinePinItem[],
  signOff: EpisodeRevisionSignOffResult,
  options?: RedlineRevisionBoardSvgOptions,
): string {
  const normalized = normalizeRedlinePins(pins);
  const widthPx = 960;
  const heightPx = 620;
  const titleKo = options?.titleKo?.trim() || `${signOff.episodeTitleKo} (${signOff.episodeId})`;
  const maxLegendRows = Math.max(2, Math.min(6, Math.floor(options?.maxLegendRows ?? 4)));

  const featuredCutId = pickFeaturedCutId(normalized, options?.featuredCutId);
  const featuredPins = featuredCutId
    ? normalized
        .filter((pin) => pin.cutId === featuredCutId)
        .sort((a, b) => a.pinId.localeCompare(b.pinId))
    : [];
  const featuredClusters = featuredCutId
    ? signOff.overlapReport.clusters.filter((cluster) => cluster.cutId === featuredCutId)
    : [];

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthPx} ${heightPx}" width="${widthPx}" height="${heightPx}" role="img" aria-label="${escapeRedlineXml(`레드라인 검수 보드 — ${titleKo}`)}">`,
  );
  lines.push(
    `  <rect x="0" y="0" width="${widthPx}" height="${heightPx}" rx="14" fill="${OKLCH_PALETTE.paperBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1.5" />`,
  );

  // 상단 헤더 밴드
  lines.push(
    `  <rect x="0" y="0" width="${widthPx}" height="74" rx="14" fill="${OKLCH_PALETTE.headerBg}" />`,
  );
  lines.push(
    `  <line x1="0" y1="74" x2="${widthPx}" y2="74" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
  );
  lines.push(
    `  <text x="24" y="32" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">${escapeRedlineXml(truncateText(titleKo, 42))}</text>`,
  );
  lines.push(
    `  <text x="24" y="54" font-family="system-ui, -apple-system, sans-serif" font-size="11.5" fill="${OKLCH_PALETTE.textMuted}">${escapeRedlineXml(`수정 라운드 R${signOff.roundNumber} · 전체 ${signOff.totalPinCount}건 · 완료 ${signOff.closedPinCount}건 · 잔여 ${signOff.remainingPinCount}건 · 군집 ${signOff.overlapReport.clusters.length}건(상충 ${signOff.activeConflictClusterCount}건)`)}</text>`,
  );

  // 우측 상단 출고 승인 배지
  const badgeColor = decisionFillOklch(signOff.signOffDecision);
  const badgeLabel = decisionLabelKo(signOff.signOffDecision);
  lines.push(
    `  <rect x="786" y="18" width="150" height="38" rx="19" fill="${badgeColor}" />`,
  );
  lines.push(
    `  <text x="861" y="42" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="700" fill="${OKLCH_PALETTE.textInverse}">${escapeRedlineXml(badgeLabel)}</text>`,
  );

  // 좌측 패널: 대표 컷 썸네일 + 핀/군집 오버레이
  const leftX = 24;
  const leftY = 92;
  const leftW = 516;
  const leftH = 472;
  lines.push(
    `  <rect x="${leftX}" y="${leftY}" width="${leftW}" height="${leftH}" rx="12" fill="${OKLCH_PALETTE.surfaceBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
  );

  const cutHeaderText = featuredCutId
    ? `대표 컷 레드라인 오버레이: ${featuredCutId} (표시 핀 ${featuredPins.length}건 · 군집 ${featuredClusters.length}건)`
    : "대표 컷 레드라인 오버레이: 등록된 핀 없음";
  lines.push(
    `  <text x="${leftX + 16}" y="${leftY + 26}" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">${escapeRedlineXml(truncateText(cutHeaderText, 56))}</text>`,
  );

  const frameX = leftX + 16;
  const frameY = leftY + 40;
  const frameW = leftW - 32;
  const frameH = 286;
  lines.push(
    `  <rect x="${frameX}" y="${frameY}" width="${frameW}" height="${frameH}" rx="8" fill="${OKLCH_PALETTE.cutBackdrop}" stroke="${OKLCH_PALETTE.borderStrong}" stroke-width="1.4" />`,
  );
  // 컷 내부 3분할 안전 가이드
  lines.push(
    `  <line x1="${fmt(frameX + frameW / 3)}" y1="${frameY}" x2="${fmt(frameX + frameW / 3)}" y2="${frameY + frameH}" stroke="${OKLCH_PALETTE.cutSafeGuide}" stroke-width="0.9" stroke-dasharray="4 4" />`,
  );
  lines.push(
    `  <line x1="${fmt(frameX + (frameW * 2) / 3)}" y1="${frameY}" x2="${fmt(frameX + (frameW * 2) / 3)}" y2="${frameY + frameH}" stroke="${OKLCH_PALETTE.cutSafeGuide}" stroke-width="0.9" stroke-dasharray="4 4" />`,
  );
  lines.push(
    `  <line x1="${frameX}" y1="${fmt(frameY + frameH / 2)}" x2="${frameX + frameW}" y2="${fmt(frameY + frameH / 2)}" stroke="${OKLCH_PALETTE.cutSafeGuide}" stroke-width="0.9" stroke-dasharray="4 4" />`,
  );

  if (featuredPins.length === 0) {
    lines.push(
      `  <text x="${fmt(frameX + frameW / 2)}" y="${fmt(frameY + frameH / 2 + 4)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="12.5" fill="${OKLCH_PALETTE.textMuted}">등록된 레드라인 핀 없음</text>`,
    );
  } else {
    // 군집 원형 영역 먼저 렌더링
    const scaleRef = Math.min(frameW, frameH);
    for (let i = 0; i < featuredClusters.length; i += 1) {
      const cluster = featuredClusters[i];
      if (!cluster) continue;
      const cx = frameX + cluster.centroidNormX * frameW;
      const cy = frameY + cluster.centroidNormY * frameH;
      const rNorm = Math.max(
        signOff.overlapReport.clusterRadiusNorm * 0.85,
        cluster.boundingRadiusNorm + 0.035,
      );
      const radiusPx = Math.max(22, Math.min(96, rNorm * scaleRef));
      const fill = cluster.potentialConflict
        ? OKLCH_PALETTE.conflictFill
        : OKLCH_PALETTE.clusterFill;
      const stroke = cluster.potentialConflict
        ? OKLCH_PALETTE.conflictStroke
        : OKLCH_PALETTE.clusterStroke;
      const dash = cluster.potentialConflict ? "5 3" : "3 3";

      lines.push(
        `  <circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(radiusPx)}" fill="${fill}" stroke="${stroke}" stroke-width="1.8" stroke-dasharray="${dash}" />`,
      );
      if (cluster.potentialConflict) {
        const tagY = Math.max(frameY + 14, cy - radiusPx - 6);
        lines.push(
          `  <rect x="${fmt(cx - 22)}" y="${fmt(tagY - 11)}" width="44" height="16" rx="8" fill="${OKLCH_PALETTE.conflictStroke}" />`,
        );
        lines.push(
          `  <text x="${fmt(cx)}" y="${fmt(tagY)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="9" font-weight="700" fill="${OKLCH_PALETTE.textInverse}">상충</text>`,
        );
      }
    }

    // 번호가 매겨진 레드라인 핀 렌더링
    for (let i = 0; i < featuredPins.length; i += 1) {
      const pin = featuredPins[i];
      if (!pin) continue;
      const px = frameX + pin.normX * frameW;
      const py = frameY + pin.normY * frameH;
      const isClosed = pin.status === "verified-closed";
      const fill = isClosed ? OKLCH_PALETTE.closedPinFill : SEVERITY_FILL_OKLCH[pin.severity];
      const ring = isClosed ? OKLCH_PALETTE.closedPinRing : OKLCH_PALETTE.pinRingLight;

      lines.push(
        `  <circle cx="${fmt(px)}" cy="${fmt(py)}" r="12" fill="${fill}" stroke="${ring}" stroke-width="2.2" />`,
      );
      lines.push(
        `  <text x="${fmt(px)}" y="${fmt(py + 4)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" font-weight="700" fill="${OKLCH_PALETTE.textInverse}">${i + 1}</text>`,
      );
    }
  }

  // 좌측 하단: 대표 컷 핀 목록 범례
  const legendTopY = frameY + frameH + 22;
  lines.push(
    `  <text x="${frameX}" y="${legendTopY}" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" font-weight="700" fill="${OKLCH_PALETTE.textMuted}">대표 컷 핀 요약</text>`,
  );
  const visibleLegend = featuredPins.slice(0, maxLegendRows);
  for (let i = 0; i < visibleLegend.length; i += 1) {
    const pin = visibleLegend[i];
    if (!pin) continue;
    const rowY = legendTopY + 20 + i * 24;
    const pillColor =
      pin.status === "verified-closed"
        ? OKLCH_PALETTE.closedPinFill
        : SEVERITY_FILL_OKLCH[pin.severity];
    const badgeText = REDLINE_SEVERITY_BADGE_LABELS[pin.severity];
    const summaryText = `#${i + 1} [${pin.pinId}] ${STUDIO_ROLE_LABELS_KO[pin.assigneeRole]} · ${REDLINE_STATUS_LABELS_KO[pin.status]} — ${truncateText(pin.noteKo, 30)}`;
    lines.push(
      `  <rect x="${frameX}" y="${fmt(rowY - 11)}" width="54" height="16" rx="8" fill="${pillColor}" />`,
    );
    lines.push(
      `  <text x="${fmt(frameX + 27)}" y="${fmt(rowY + 0.5)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="8.5" font-weight="700" fill="${OKLCH_PALETTE.textInverse}">${escapeRedlineXml(badgeText)}</text>`,
    );
    lines.push(
      `  <text x="${fmt(frameX + 62)}" y="${fmt(rowY + 1)}" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" fill="${OKLCH_PALETTE.textPrimary}">${escapeRedlineXml(summaryText)}</text>`,
    );
  }
  if (featuredPins.length > maxLegendRows) {
    const extraCount = featuredPins.length - maxLegendRows;
    lines.push(
      `  <text x="${frameX}" y="${fmt(leftY + leftH - 12)}" font-family="system-ui, -apple-system, sans-serif" font-size="9.5" fill="${OKLCH_PALETTE.textMuted}">${escapeRedlineXml(`외 ${extraCount}건 추가 핀 포함`)}</text>`,
    );
  }

  // 우측 패널: 심각도별 배지 + 역할별 잔여 막대 + 승인 게이트 체크
  const rightX = 556;
  const rightY = 92;
  const rightW = 380;
  const rightH = 472;
  lines.push(
    `  <rect x="${rightX}" y="${rightY}" width="${rightW}" height="${rightH}" rx="12" fill="${OKLCH_PALETTE.surfaceBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
  );

  // 심각도별 배지 3종
  lines.push(
    `  <text x="${rightX + 16}" y="${rightY + 26}" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">심각도별 잔여 / 전체</text>`,
  );
  const sevOrder: readonly RedlinePinSeverity[] = ["blocker", "major", "polish"];
  const sevCardW = 110;
  for (let i = 0; i < sevOrder.length; i += 1) {
    const sev = sevOrder[i];
    if (!sev) continue;
    const cardX = rightX + 16 + i * (sevCardW + 9);
    const cardY = rightY + 38;
    const unresolved = signOff.unresolvedBySeverity[sev];
    const total = signOff.totalBySeverity[sev];
    lines.push(
      `  <rect x="${cardX}" y="${cardY}" width="${sevCardW}" height="62" rx="10" fill="${SEVERITY_SOFT_BG_OKLCH[sev]}" stroke="${SEVERITY_FILL_OKLCH[sev]}" stroke-width="1.2" />`,
    );
    lines.push(
      `  <rect x="${cardX + 10}" y="${cardY + 9}" width="60" height="16" rx="8" fill="${SEVERITY_FILL_OKLCH[sev]}" />`,
    );
    lines.push(
      `  <text x="${cardX + 40}" y="${cardY + 20}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="8.5" font-weight="700" fill="${OKLCH_PALETTE.textInverse}">${escapeRedlineXml(REDLINE_SEVERITY_BADGE_LABELS[sev])}</text>`,
    );
    lines.push(
      `  <text x="${cardX + 10}" y="${cardY + 46}" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">${escapeRedlineXml(`${unresolved} / ${total}`)}</text>`,
    );
    lines.push(
      `  <text x="${cardX + 100}" y="${cardY + 45}" text-anchor="end" font-family="system-ui, -apple-system, sans-serif" font-size="9" fill="${OKLCH_PALETTE.textMuted}">${escapeRedlineXml(REDLINE_SEVERITY_LABELS_KO[sev])}</text>`,
    );
  }

  // 역할별 잔여 작업량 막대
  const roleTopY = rightY + 124;
  lines.push(
    `  <text x="${rightX + 16}" y="${roleTopY}" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">역할별 잔여 작업량</text>`,
  );

  let maxRoleRemaining = 1;
  for (let i = 0; i < STUDIO_COLLABORATOR_ROLES.length; i += 1) {
    const role = STUDIO_COLLABORATOR_ROLES[i];
    if (!role) continue;
    const count = signOff.remainingByRole[role];
    if (count > maxRoleRemaining) maxRoleRemaining = count;
  }

  const barStartX = rightX + 104;
  const barMaxW = 216;
  for (let i = 0; i < STUDIO_COLLABORATOR_ROLES.length; i += 1) {
    const role = STUDIO_COLLABORATOR_ROLES[i];
    if (!role) continue;
    const rowY = roleTopY + 18 + i * 26;
    const count = signOff.remainingByRole[role];
    const barW = count > 0 ? Math.max(8, (count / maxRoleRemaining) * barMaxW) : 0;

    lines.push(
      `  <text x="${rightX + 16}" y="${fmt(rowY + 11)}" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" fill="${OKLCH_PALETTE.textPrimary}">${escapeRedlineXml(STUDIO_ROLE_LABELS_KO[role])}</text>`,
    );
    lines.push(
      `  <rect x="${barStartX}" y="${fmt(rowY)}" width="${barMaxW}" height="14" rx="7" fill="${OKLCH_PALETTE.trackBg}" />`,
    );
    if (barW > 0) {
      lines.push(
        `  <rect x="${barStartX}" y="${fmt(rowY)}" width="${fmt(barW)}" height="14" rx="7" fill="${ROLE_BAR_OKLCH[role]}" />`,
      );
    }
    lines.push(
      `  <text x="${rightX + rightW - 16}" y="${fmt(rowY + 11)}" text-anchor="end" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">${count}건</text>`,
    );
  }

  // 하단 우측: 완료율 게이지 및 출고 게이트 판정 요약
  const gateTopY = roleTopY + 216;
  const completionPct = Math.round(signOff.completionRatio * 100);
  const progressBarW = Math.max(0, Math.min(rightW - 32, (rightW - 32) * signOff.completionRatio));

  lines.push(
    `  <line x1="${rightX + 16}" y1="${gateTopY - 12}" x2="${rightX + rightW - 16}" y2="${gateTopY - 12}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
  );
  lines.push(
    `  <text x="${rightX + 16}" y="${gateTopY + 4}" font-family="system-ui, -apple-system, sans-serif" font-size="11.5" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">${escapeRedlineXml(`교차 검수 완료율 ${completionPct}% (${signOff.closedPinCount}/${signOff.totalPinCount})`)}</text>`,
  );
  lines.push(
    `  <rect x="${rightX + 16}" y="${gateTopY + 14}" width="${rightW - 32}" height="12" rx="6" fill="${OKLCH_PALETTE.trackBg}" />`,
  );
  if (progressBarW > 0) {
    lines.push(
      `  <rect x="${rightX + 16}" y="${gateTopY + 14}" width="${fmt(progressBarW)}" height="12" rx="6" fill="${badgeColor}" />`,
    );
  }

  const gateNotes =
    signOff.blockingReasonsKo.length > 0
      ? signOff.blockingReasonsKo
      : signOff.advisoryNotesKo.length > 0
        ? signOff.advisoryNotesKo
        : ["모든 레드라인 핀이 교차 검수를 마쳤습니다. 즉시 출고할 수 있습니다."];

  const visibleNotes = gateNotes.slice(0, 3);
  for (let i = 0; i < visibleNotes.length; i += 1) {
    const note = visibleNotes[i];
    if (!note) continue;
    lines.push(
      `  <text x="${rightX + 16}" y="${fmt(gateTopY + 46 + i * 20)}" font-family="system-ui, -apple-system, sans-serif" font-size="10" fill="${OKLCH_PALETTE.textMuted}">${escapeRedlineXml(`· ${truncateText(note, 48)}`)}</text>`,
    );
  }

  // 하단 푸터 (원장 SHA-256 지문)
  const footerText = `PD 출고 판정: ${badgeLabel} · 활성 상충 군집 ${signOff.activeConflictClusterCount}건 · 검수 원장 SHA-256 ${signOff.ledgerSha256Hex.slice(0, 16)}`;
  lines.push(
    `  <text x="24" y="${heightPx - 20}" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" fill="${OKLCH_PALETTE.textMuted}">${escapeRedlineXml(footerText)}</text>`,
  );
  lines.push("</svg>");

  return lines.join("\n");
}

/**
 * 레드라인 핀 현황, 출고 승인 판정 및 선택적 라운드 차분을 웹툰 담당 PD 마감 검수 브리프로 정리한다.
 */
export function summarizeRedlineRevisionAuditKo(
  pins: readonly RedlinePinItem[],
  signOff: EpisodeRevisionSignOffResult,
  roundDiff?: RevisionRoundDiffResult,
): string {
  const normalized = normalizeRedlinePins(pins);
  const lines: string[] = [];

  lines.push(
    `[웹툰 마감 검수 브리프] ${signOff.episodeTitleKo} (${signOff.episodeId} · 라운드 R${signOff.roundNumber})`,
  );

  const verdictText =
    signOff.signOffDecision === "approved"
      ? "출고 승인 가능 (전수 교차 검수 완료)"
      : signOff.signOffDecision === "conditional-pass-with-polish"
        ? `조건부 출고 가능 (마감 보완 ${signOff.deferredPolishPinIds.length}건 이월 기록)`
        : "출고 보류 (차단 항목 해소 필요)";

  lines.push(
    `- 출고 게이트 판정: ${verdictText} · 완료 ${signOff.closedPinCount}/${signOff.totalPinCount}건(${Math.round(signOff.completionRatio * 100)}%)`,
  );
  lines.push(
    `- 심각도별 미완료: 출고 차단(BLOCKER) ${signOff.unresolvedBySeverity.blocker}건 · 주요 수정(MAJOR) ${signOff.unresolvedBySeverity.major}건 · 마감 보완(POLISH) ${signOff.unresolvedBySeverity.polish}건`,
  );

  const roleEntries: string[] = [];
  for (let i = 0; i < STUDIO_COLLABORATOR_ROLES.length; i += 1) {
    const role = STUDIO_COLLABORATOR_ROLES[i];
    if (!role) continue;
    const remain = signOff.remainingByRole[role];
    if (remain > 0) {
      roleEntries.push(`${STUDIO_ROLE_LABELS_KO[role]} ${remain}건`);
    }
  }
  lines.push(
    `- 역할별 잔여 작업: ${roleEntries.length > 0 ? roleEntries.join(", ") : "전 역할 잔여 작업 없음"}`,
  );

  if (signOff.overlapReport.clusters.length === 0) {
    lines.push("- 컷 좌표 중복·상충: 0건 (중복 마크업 없음)");
  } else {
    lines.push(
      `- 컷 좌표 중복·상충: 총 ${signOff.overlapReport.clusters.length}개 군집 (활성 상충 ${signOff.activeConflictClusterCount}건)`,
    );
    for (let i = 0; i < signOff.overlapReport.clusters.length; i += 1) {
      const cluster = signOff.overlapReport.clusters[i];
      if (!cluster || !cluster.potentialConflict) continue;
      const cats = cluster.distinctCategories.map((c) => REDLINE_CATEGORY_LABELS_KO[c]).join("·");
      const roles = cluster.distinctAssigneeRoles.map((r) => STUDIO_ROLE_LABELS_KO[r]).join("·");
      lines.push(
        `  · [${cluster.cutId}] ${cluster.pinIds.join(", ")} — ${cats} (${roles}) 지시 충돌 확인 필요`,
      );
    }
  }

  if (roundDiff) {
    const deltaPrefix = roundDiff.netRemainingDelta > 0 ? "+" : "";
    lines.push(
      `- 라운드 변화(R${roundDiff.fromRoundNumber} → R${roundDiff.toRoundNumber}): 신규 ${roundDiff.addedPinIds.length}건 · 검수 완료 ${roundDiff.closedPinIds.length}건 · 회귀 재수정 ${roundDiff.reopenedPinIds.length}건 · 순잔여 ${deltaPrefix}${roundDiff.netRemainingDelta}건`,
    );
  }

  if (signOff.blockingReasonsKo.length > 0) {
    lines.push("- 출고 차단 사유:");
    for (let i = 0; i < signOff.blockingReasonsKo.length; i += 1) {
      const reason = signOff.blockingReasonsKo[i];
      if (reason) lines.push(`  · ${reason}`);
    }
  }

  if (signOff.advisoryNotesKo.length > 0) {
    lines.push("- PD 참고 메모:");
    for (let i = 0; i < signOff.advisoryNotesKo.length; i += 1) {
      const note = signOff.advisoryNotesKo[i];
      if (note) lines.push(`  · ${note}`);
    }
  }

  const pendingVerifyCount = normalized.filter(
    (pin) => pin.status === "resolved-pending-verify",
  ).length;
  if (pendingVerifyCount > 0) {
    lines.push(
      `- 다음 조치: 검수 대기 ${pendingVerifyCount}건에 대해 수정자 본인이 아닌 담당 PD 또는 아트 디렉터의 교차 확인 후 승인 처리하세요.`,
    );
  } else if (signOff.episodeSignOffReady) {
    lines.push("- 다음 조치: 최종 원고 패키징 및 플랫폼 업로드 단계로 넘어가세요.");
  } else {
    lines.push("- 다음 조치: 담당 역할별 잔여 핀을 수정 완료 처리한 뒤 교차 검수를 요청하세요.");
  }

  lines.push(`- 검수 원장 지문(SHA-256): ${signOff.ledgerSha256Hex}`);
  return lines.join("\n");
}
