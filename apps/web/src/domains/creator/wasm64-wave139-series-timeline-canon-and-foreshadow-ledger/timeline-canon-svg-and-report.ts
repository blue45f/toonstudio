/**
 * Wave 139 — 순수 OKLCH 연표·복선 스윔레인 SVG 렌더러 및 한국어 스토리 PD 검수 보고서.
 *
 * - 원시 16진수·전통 색상 함수 없이 순수 `oklch(...)` 토큰만 사용한다.
 * - 시간축 가로 스윔레인(캐릭터 생애선 + 회상 점선 + 사망/부활 표식 + 복선 설치→회수 아크 + 설정 붕괴 경고 핀)을 렌더링한다.
 * - 모든 동적 텍스트를 XML 이스케이프해 XSS를 차단하고, 모든 좌표를 유한수로 보정한다.
 * - 번역투 없는 자연스러운 한국어 스토리 PD 검수 브리프를 생성한다.
 */

import {
  CANON_ISSUE_CODE_LABEL_KO,
  FORESHADOW_IMPORTANCE_LABEL_KO,
  type ForeshadowThreadAuditEntry,
  type SeriesTimelineCanonAuditResult,
  type TimelineCanonIssue,
  type TimelineCanonVerdict,
} from "./timeline-canon-types";

export type TimelineCanonSvgTheme = "light" | "dark";

export interface TimelineCanonSvgOptions {
  readonly theme?: TimelineCanonSvgTheme;
  readonly title?: string;
  readonly maxVisibleCharacters?: number;
  readonly maxVisibleThreads?: number;
}

export interface SeriesTimelineCanonReportKo {
  readonly seriesId: string;
  readonly verdict: TimelineCanonVerdict;
  readonly verdictLabelKo: string;
  readonly headlineKo: string;
  readonly canonHealthSummaryKo: string;
  readonly foreshadowSummaryKo: string;
  readonly characterHighlightsKo: readonly string[];
  readonly actionChecklistKo: readonly string[];
  readonly ledgerFingerprintKo: string;
  readonly fullTextKo: string;
}

interface OklchTimelinePalette {
  readonly canvasBg: string;
  readonly panelBg: string;
  readonly laneAltBg: string;
  readonly border: string;
  readonly axisLine: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly aliveLine: string;
  readonly aliveFill: string;
  readonly deceasedLine: string;
  readonly revivalHalo: string;
  readonly flashbackStroke: string;
  readonly flashbackFill: string;
  readonly blockerFill: string;
  readonly blockerInk: string;
  readonly warningFill: string;
  readonly warningInk: string;
  readonly cleanFill: string;
  readonly cleanInk: string;
  readonly arcPaid: string;
  readonly arcOpen: string;
  readonly arcOverdue: string;
  readonly arcSequel: string;
  readonly arcInvalid: string;
  readonly badgeBg: string;
}

const LIGHT_PALETTE: OklchTimelinePalette = {
  canvasBg: "oklch(0.982 0.006 90)",
  panelBg: "oklch(0.996 0.003 90)",
  laneAltBg: "oklch(0.962 0.008 92)",
  border: "oklch(0.868 0.014 155)",
  axisLine: "oklch(0.76 0.018 155)",
  textPrimary: "oklch(0.22 0.022 155)",
  textSecondary: "oklch(0.46 0.018 155)",
  aliveLine: "oklch(0.39 0.095 158)",
  aliveFill: "oklch(0.93 0.032 158)",
  deceasedLine: "oklch(0.62 0.02 25)",
  revivalHalo: "oklch(0.56 0.145 148)",
  flashbackStroke: "oklch(0.48 0.135 255)",
  flashbackFill: "oklch(0.94 0.028 255)",
  blockerFill: "oklch(0.54 0.185 26)",
  blockerInk: "oklch(0.99 0.004 90)",
  warningFill: "oklch(0.66 0.155 72)",
  warningInk: "oklch(0.20 0.02 72)",
  cleanFill: "oklch(0.93 0.036 158)",
  cleanInk: "oklch(0.29 0.088 158)",
  arcPaid: "oklch(0.44 0.118 162)",
  arcOpen: "oklch(0.52 0.115 235)",
  arcOverdue: "oklch(0.55 0.185 26)",
  arcSequel: "oklch(0.50 0.105 288)",
  arcInvalid: "oklch(0.48 0.205 18)",
  badgeBg: "oklch(0.938 0.015 155)",
};

const DARK_PALETTE: OklchTimelinePalette = {
  canvasBg: "oklch(0.162 0.012 158)",
  panelBg: "oklch(0.205 0.014 158)",
  laneAltBg: "oklch(0.232 0.016 158)",
  border: "oklch(0.345 0.02 158)",
  axisLine: "oklch(0.46 0.022 158)",
  textPrimary: "oklch(0.95 0.008 95)",
  textSecondary: "oklch(0.76 0.016 155)",
  aliveLine: "oklch(0.73 0.125 158)",
  aliveFill: "oklch(0.28 0.052 158)",
  deceasedLine: "oklch(0.56 0.03 25)",
  revivalHalo: "oklch(0.78 0.155 150)",
  flashbackStroke: "oklch(0.74 0.135 252)",
  flashbackFill: "oklch(0.27 0.045 252)",
  blockerFill: "oklch(0.67 0.185 26)",
  blockerInk: "oklch(0.15 0.014 26)",
  warningFill: "oklch(0.78 0.148 76)",
  warningInk: "oklch(0.18 0.018 76)",
  cleanFill: "oklch(0.28 0.058 158)",
  cleanInk: "oklch(0.86 0.115 158)",
  arcPaid: "oklch(0.74 0.132 162)",
  arcOpen: "oklch(0.74 0.122 235)",
  arcOverdue: "oklch(0.70 0.185 26)",
  arcSequel: "oklch(0.74 0.118 288)",
  arcInvalid: "oklch(0.68 0.205 18)",
  badgeBg: "oklch(0.28 0.025 158)",
};

function fmtCoord(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const rounded = Math.round(safe * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function fmtPercent(ratio: number): string {
  const clamped = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
  return `${(clamped * 100).toFixed(1)}%`;
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

/**
 * SVG/XML 동적 텍스트 및 속성 안전 이스케이프 유틸리티(XSS 차단).
 */
export function escapeTimelineXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getVerdictBadgeKo(verdict: TimelineCanonVerdict): string {
  if (verdict === "blocked") return "연재 차단";
  if (verdict === "needs-review") return "확인 필요";
  return "검수 통과";
}

function getVerdictStyle(
  verdict: TimelineCanonVerdict,
  palette: OklchTimelinePalette,
): { readonly fill: string; readonly ink: string } {
  if (verdict === "blocked") {
    return { fill: palette.blockerFill, ink: palette.blockerInk };
  }
  if (verdict === "needs-review") {
    return { fill: palette.warningFill, ink: palette.warningInk };
  }
  return { fill: palette.cleanFill, ink: palette.cleanInk };
}

function getThreadArcColor(
  thread: ForeshadowThreadAuditEntry,
  palette: OklchTimelinePalette,
): string {
  if (thread.status === "paid-off") return palette.arcPaid;
  if (thread.status === "overdue-unpaid") return palette.arcOverdue;
  if (thread.status === "invalid-chronology") return palette.arcInvalid;
  if (thread.status === "intentionally-open-sequel") return palette.arcSequel;
  return palette.arcOpen;
}

function getThreadStatusKo(thread: ForeshadowThreadAuditEntry): string {
  if (thread.status === "paid-off") return "회수 완료";
  if (thread.status === "overdue-unpaid") return "미회수 기한 초과";
  if (thread.status === "invalid-chronology") return "선행 회수 모순";
  if (thread.status === "intentionally-open-sequel") return "속편 보류";
  return "회수 대기";
}

function pickSevereIssueForNode(
  issues: readonly TimelineCanonIssue[],
  eventId: string,
  characterId?: string,
): TimelineCanonIssue | null {
  let picked: TimelineCanonIssue | null = null;
  for (let i = 0; i < issues.length; i += 1) {
    const issue = issues[i];
    const matchesEvent =
      issue.eventId === eventId || issue.relatedEventIds.indexOf(eventId) >= 0;
    if (!matchesEvent) continue;
    const matchesChar =
      characterId === undefined ||
      issue.characterIds.length === 0 ||
      issue.characterIds.indexOf(characterId) >= 0;
    if (!matchesChar) continue;
    if (!picked || (picked.severity !== "blocker" && issue.severity === "blocker")) {
      picked = issue;
    }
  }
  return picked;
}

/**
 * 장편 웹툰 세계관 연표·생애선·회상 점선·복선 아크·설정 붕괴 경고 핀을 순수 OKLCH SVG로 렌더링한다.
 */
export function renderSeriesTimelineCanonSvg(
  audit: SeriesTimelineCanonAuditResult,
  options: TimelineCanonSvgOptions = {},
): string {
  const palette = options.theme === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
  const maxVisibleCharacters = Math.max(1, Math.floor(options.maxVisibleCharacters ?? 10));
  const maxVisibleThreads = Math.max(1, Math.floor(options.maxVisibleThreads ?? 8));

  const visibleTraces = audit.characterTraces.slice(0, maxVisibleCharacters);
  const visibleThreads = audit.foreshadowSummary.entries.slice(0, maxVisibleThreads);

  const width = 1080;
  const leftGutter = 192;
  const rightMargin = 48;
  const plotStartX = leftGutter + 16;
  const plotEndX = width - rightMargin;
  const plotWidth = Math.max(120, plotEndX - plotStartX);

  const headerHeight = 84;
  const axisHeight = 52;
  const laneHeight = 54;
  const laneSectionHeight = Math.max(1, visibleTraces.length) * laneHeight;
  const arcHeaderHeight = 30;
  const arcRowHeight = 36;
  const arcSectionHeight =
    arcHeaderHeight + Math.max(1, visibleThreads.length) * arcRowHeight + 22;
  const footerHeight = 44;
  const totalHeight =
    headerHeight + axisHeight + laneSectionHeight + arcSectionHeight + footerHeight + 24;

  const eventXById = new Map<string, number>();
  const eventCount = audit.chronologicalEvents.length;
  for (let i = 0; i < eventCount; i += 1) {
    const ev = audit.chronologicalEvents[i];
    const ratio = eventCount <= 1 ? 0.5 : i / (eventCount - 1);
    eventXById.set(ev.eventId, plotStartX + ratio * plotWidth);
  }

  const parts: string[] = [];
  const titleText = escapeTimelineXml(
    options.title ?? `${audit.seriesTitleKo} — 세계관 연표·복선 무결성 스윔레인`,
  );
  const verdictLabel = getVerdictBadgeKo(audit.verdict);
  const verdictStyle = getVerdictStyle(audit.verdict, palette);

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmtCoord(width)} ${fmtCoord(totalHeight)}" width="${fmtCoord(width)}" height="${fmtCoord(totalHeight)}" role="img" aria-label="${titleText}">`,
  );
  parts.push(`<title>${titleText}</title>`);
  parts.push(
    `<desc>${escapeTimelineXml(`현재 ${audit.currentEpisodeNumber}화 기준 캐릭터 ${audit.totalCharacters}명, 이벤트 ${audit.totalEvents}건, 복선 ${audit.totalForeshadowThreads}건, 차단 ${audit.blockerCount}건, 주의 ${audit.warningCount}건`)}</desc>`,
  );

  // 배경 카드
  parts.push(
    `<rect x="0" y="0" width="${fmtCoord(width)}" height="${fmtCoord(totalHeight)}" rx="16" fill="${palette.canvasBg}"/>`,
  );
  parts.push(
    `<rect x="14" y="14" width="${fmtCoord(width - 28)}" height="${fmtCoord(totalHeight - 28)}" rx="12" fill="${palette.panelBg}" stroke="${palette.border}" stroke-width="1"/>`,
  );

  // 헤더
  parts.push(
    `<text x="32" y="44" fill="${palette.textPrimary}" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="700">${titleText}</text>`,
  );
  const metaLine = `${audit.currentEpisodeNumber}화 기준 · 캐릭터 ${audit.totalCharacters}명 · 이벤트 ${audit.totalEvents}건 · 복선 회수율 ${fmtPercent(audit.foreshadowSummary.payoffRateRatio)} · 원장 ${audit.canonLedgerSha256Hex.slice(0, 12)}`;
  parts.push(
    `<text x="32" y="66" fill="${palette.textSecondary}" font-family="system-ui, -apple-system, sans-serif" font-size="11.5">${escapeTimelineXml(metaLine)}</text>`,
  );

  // 판정 배지
  parts.push(
    `<rect x="${fmtCoord(width - 178)}" y="28" width="144" height="32" rx="16" fill="${verdictStyle.fill}"/>`,
  );
  parts.push(
    `<text x="${fmtCoord(width - 106)}" y="48" text-anchor="middle" fill="${verdictStyle.ink}" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="700">${escapeTimelineXml(`${verdictLabel} (${audit.blockerCount}/${audit.warningCount})`)}</text>`,
  );

  // 시간축 밴드
  const axisY = headerHeight + 28;
  parts.push(
    `<line x1="${fmtCoord(plotStartX)}" y1="${fmtCoord(axisY)}" x2="${fmtCoord(plotEndX)}" y2="${fmtCoord(axisY)}" stroke="${palette.axisLine}" stroke-width="1.5"/>`,
  );
  parts.push(
    `<text x="32" y="${fmtCoord(axisY + 4)}" fill="${palette.textSecondary}" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="600">세계관 시간축</text>`,
  );

  const tickStride = Math.max(1, Math.ceil(eventCount / 8));
  for (let i = 0; i < eventCount; i += 1) {
    const ev = audit.chronologicalEvents[i];
    const x = eventXById.get(ev.eventId) ?? plotStartX;
    const isMajorTick = i === 0 || i === eventCount - 1 || i % tickStride === 0;
    if (isMajorTick) {
      parts.push(
        `<line x1="${fmtCoord(x)}" y1="${fmtCoord(axisY - 6)}" x2="${fmtCoord(x)}" y2="${fmtCoord(axisY + 6)}" stroke="${palette.axisLine}" stroke-width="1.2"/>`,
      );
      parts.push(
        `<text x="${fmtCoord(x)}" y="${fmtCoord(axisY - 10)}" text-anchor="middle" fill="${palette.textSecondary}" font-family="system-ui, -apple-system, sans-serif" font-size="9.5">${escapeTimelineXml(ev.worldDateIso)}</text>`,
      );
      parts.push(
        `<text x="${fmtCoord(x)}" y="${fmtCoord(axisY + 18)}" text-anchor="middle" fill="${palette.textSecondary}" font-family="system-ui, -apple-system, sans-serif" font-size="9.5">${escapeTimelineXml(`${ev.episodeNumber}화`)}</text>`,
      );
    }

    // 축 상단 전역 이벤트 경고 핀(계절·인과 모순 등 캐릭터 미지정 이슈)
    const eventIssue = pickSevereIssueForNode(audit.issues, ev.eventId);
    if (eventIssue && eventIssue.characterIds.length === 0) {
      const pinFill =
        eventIssue.severity === "blocker" ? palette.blockerFill : palette.warningFill;
      const pinInk =
        eventIssue.severity === "blocker" ? palette.blockerInk : palette.warningInk;
      parts.push(
        `<g data-warning-pin="${escapeTimelineXml(eventIssue.code)}"><circle cx="${fmtCoord(x)}" cy="${fmtCoord(axisY)}" r="7" fill="${pinFill}"/><text x="${fmtCoord(x)}" y="${fmtCoord(axisY + 3.5)}" text-anchor="middle" fill="${pinInk}" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="700">!</text></g>`,
      );
    }
  }

  // 캐릭터별 가로 스윔레인
  const lanesTopY = headerHeight + axisHeight;
  if (visibleTraces.length === 0) {
    parts.push(
      `<text x="32" y="${fmtCoord(lanesTopY + 30)}" fill="${palette.textSecondary}" font-family="system-ui, -apple-system, sans-serif" font-size="12">등록된 캐릭터 연표가 없습니다.</text>`,
    );
  }
  for (let row = 0; row < visibleTraces.length; row += 1) {
    const trace = visibleTraces[row];
    const laneY = lanesTopY + row * laneHeight;
    const midY = laneY + laneHeight * 0.54;
    if (row % 2 === 1) {
      parts.push(
        `<rect x="20" y="${fmtCoord(laneY)}" width="${fmtCoord(width - 40)}" height="${fmtCoord(laneHeight)}" rx="6" fill="${palette.laneAltBg}"/>`,
      );
    }
    parts.push(
      `<line x1="20" y1="${fmtCoord(laneY + laneHeight)}" x2="${fmtCoord(width - 20)}" y2="${fmtCoord(laneY + laneHeight)}" stroke="${palette.border}" stroke-width="0.6"/>`,
    );

    const statusBadge = trace.finalLifeStatus === "deceased" ? "사망" : "생존";
    parts.push(
      `<text x="32" y="${fmtCoord(laneY + 23)}" fill="${palette.textPrimary}" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="700">${escapeTimelineXml(truncateText(trace.nameKo, 14))}</text>`,
    );
    parts.push(
      `<text x="32" y="${fmtCoord(laneY + 39)}" fill="${palette.textSecondary}" font-family="system-ui, -apple-system, sans-serif" font-size="10">${escapeTimelineXml(`${trace.birthDateIso.slice(0, 4)}년생 · ${statusBadge} · ${trace.totalAppearances}회`)}</text>`,
    );

    // 생애선 및 회상 점선 연결(과거 회상 시 본편 최근 앵커와 점선 아크 연결)
    const normalAnchorXs: number[] = [];
    for (let p = 0; p < trace.points.length; p += 1) {
      const pt = trace.points[p];
      if (!pt.isFlashback) {
        const nx = eventXById.get(pt.eventId);
        if (nx !== undefined) normalAnchorXs.push(nx);
      }
    }

    let prevNormalX: number | null = null;
    let prevWasDeceased = false;
    for (let p = 0; p < trace.points.length; p += 1) {
      const pt = trace.points[p];
      const x = eventXById.get(pt.eventId);
      if (x === undefined) continue;
      if (pt.isFlashback) {
        let anchorX: number | null = null;
        for (let k = 0; k < normalAnchorXs.length; k += 1) {
          if (normalAnchorXs[k] >= x) {
            anchorX = normalAnchorXs[k];
            break;
          }
        }
        if (anchorX === null && normalAnchorXs.length > 0) {
          anchorX = normalAnchorXs[normalAnchorXs.length - 1];
        }
        if (anchorX !== null && Math.abs(anchorX - x) > 0.5) {
          parts.push(
            `<path d="M ${fmtCoord(x)} ${fmtCoord(midY)} Q ${fmtCoord((anchorX + x) * 0.5)} ${fmtCoord(midY - 14)} ${fmtCoord(anchorX)} ${fmtCoord(midY)}" fill="none" stroke="${palette.flashbackStroke}" stroke-width="1.4" stroke-dasharray="4 3"/>`,
          );
        }
      } else {
        if (prevNormalX !== null) {
          const stroke = prevWasDeceased ? palette.deceasedLine : palette.aliveLine;
          const dash = prevWasDeceased ? ` stroke-dasharray="3 3"` : "";
          parts.push(
            `<line x1="${fmtCoord(prevNormalX)}" y1="${fmtCoord(midY)}" x2="${fmtCoord(x)}" y2="${fmtCoord(midY)}" stroke="${stroke}" stroke-width="2.4"${dash}/>`,
          );
        }
        prevNormalX = x;
        prevWasDeceased = pt.lifeStatusAfter === "deceased";
      }
    }

    // 개별 이벤트 노드 & 경고 핀
    for (let p = 0; p < trace.points.length; p += 1) {
      const pt = trace.points[p];
      const x = eventXById.get(pt.eventId);
      if (x === undefined) continue;
      const hasDeath = pt.appliedTransitions.indexOf("death") >= 0;
      const hasRevival = pt.appliedTransitions.indexOf("revival-canonical") >= 0;

      if (hasRevival) {
        parts.push(
          `<circle cx="${fmtCoord(x)}" cy="${fmtCoord(midY)}" r="8.5" fill="none" stroke="${palette.revivalHalo}" stroke-width="1.8"/>`,
        );
      }
      if (pt.isFlashback) {
        parts.push(
          `<polygon points="${fmtCoord(x)},${fmtCoord(midY - 6)} ${fmtCoord(x + 6)},${fmtCoord(midY)} ${fmtCoord(x)},${fmtCoord(midY + 6)} ${fmtCoord(x - 6)},${fmtCoord(midY)}" fill="${palette.flashbackFill}" stroke="${palette.flashbackStroke}" stroke-width="1.6"/>`,
        );
      } else if (hasDeath) {
        parts.push(
          `<circle cx="${fmtCoord(x)}" cy="${fmtCoord(midY)}" r="6" fill="${palette.blockerFill}"/>`,
        );
        parts.push(
          `<path d="M ${fmtCoord(x - 3)} ${fmtCoord(midY - 3)} L ${fmtCoord(x + 3)} ${fmtCoord(midY + 3)} M ${fmtCoord(x + 3)} ${fmtCoord(midY - 3)} L ${fmtCoord(x - 3)} ${fmtCoord(midY + 3)}" stroke="${palette.blockerInk}" stroke-width="1.5"/>`,
        );
      } else {
        parts.push(
          `<circle cx="${fmtCoord(x)}" cy="${fmtCoord(midY)}" r="5" fill="${palette.aliveFill}" stroke="${palette.aliveLine}" stroke-width="1.8"/>`,
        );
      }

      if (pt.exactAgeYears !== null) {
        parts.push(
          `<text x="${fmtCoord(x)}" y="${fmtCoord(midY + 17)}" text-anchor="middle" fill="${palette.textSecondary}" font-family="system-ui, -apple-system, sans-serif" font-size="9">${escapeTimelineXml(`${pt.exactAgeYears}세`)}</text>`,
        );
      }

      const nodeIssue = pickSevereIssueForNode(audit.issues, pt.eventId, trace.characterId);
      if (nodeIssue) {
        const pinFill =
          nodeIssue.severity === "blocker" ? palette.blockerFill : palette.warningFill;
        const pinInk =
          nodeIssue.severity === "blocker" ? palette.blockerInk : palette.warningInk;
        parts.push(
          `<g data-warning-pin="${escapeTimelineXml(nodeIssue.code)}"><circle cx="${fmtCoord(x)}" cy="${fmtCoord(midY - 14)}" r="6.5" fill="${pinFill}"/><text x="${fmtCoord(x)}" y="${fmtCoord(midY - 10.5)}" text-anchor="middle" fill="${pinInk}" font-family="system-ui, -apple-system, sans-serif" font-size="9.5" font-weight="700">!</text></g>`,
        );
      }
    }
  }

  // 복선 설치 → 회수 아크 트랙
  const arcBandTopY = lanesTopY + laneSectionHeight + 12;
  parts.push(
    `<text x="32" y="${fmtCoord(arcBandTopY + 18)}" fill="${palette.textPrimary}" font-family="system-ui, -apple-system, sans-serif" font-size="12.5" font-weight="700">복선 설치 → 회수 아크 원장 (${audit.foreshadowSummary.paidOffCount}/${audit.foreshadowSummary.totalThreads}건)</text>`,
  );

  if (visibleThreads.length === 0) {
    parts.push(
      `<text x="32" y="${fmtCoord(arcBandTopY + 46)}" fill="${palette.textSecondary}" font-family="system-ui, -apple-system, sans-serif" font-size="11.5">등록된 복선 항목이 없습니다.</text>`,
    );
  }
  for (let i = 0; i < visibleThreads.length; i += 1) {
    const thread = visibleThreads[i];
    const rowY = arcBandTopY + arcHeaderHeight + i * arcRowHeight + 22;
    const stroke = getThreadArcColor(thread, palette);
    const setupX = eventXById.get(thread.setupEventId) ?? plotStartX;
    const firstPayoffId = thread.payoffEventIds[0];
    const payoffX =
      firstPayoffId !== undefined && eventXById.has(firstPayoffId)
        ? (eventXById.get(firstPayoffId) as number)
        : plotEndX - 18;

    parts.push(
      `<text x="32" y="${fmtCoord(rowY + 3)}" fill="${palette.textPrimary}" font-family="system-ui, -apple-system, sans-serif" font-size="11">${escapeTimelineXml(truncateText(thread.titleKo, 16))}</text>`,
    );
    parts.push(
      `<text x="32" y="${fmtCoord(rowY + 15)}" fill="${palette.textSecondary}" font-family="system-ui, -apple-system, sans-serif" font-size="9.5">${escapeTimelineXml(`${FORESHADOW_IMPORTANCE_LABEL_KO[thread.importance]} · ${getThreadStatusKo(thread)}`)}</text>`,
    );

    const midX = (setupX + payoffX) * 0.5;
    const arcLift = Math.min(22, Math.max(10, Math.abs(payoffX - setupX) * 0.08));
    const dashAttr =
      thread.status === "paid-off"
        ? ""
        : thread.status === "intentionally-open-sequel"
          ? ` stroke-dasharray="2 3"`
          : ` stroke-dasharray="5 3"`;
    parts.push(
      `<path data-foreshadow-arc="${escapeTimelineXml(thread.threadId)}" d="M ${fmtCoord(setupX)} ${fmtCoord(rowY)} Q ${fmtCoord(midX)} ${fmtCoord(rowY - arcLift)} ${fmtCoord(payoffX)} ${fmtCoord(rowY)}" fill="none" stroke="${stroke}" stroke-width="2"${dashAttr}/>`,
    );
    parts.push(
      `<circle cx="${fmtCoord(setupX)}" cy="${fmtCoord(rowY)}" r="4" fill="${stroke}"/>`,
    );
    if (thread.status === "paid-off") {
      parts.push(
        `<circle cx="${fmtCoord(payoffX)}" cy="${fmtCoord(rowY)}" r="4.5" fill="${palette.panelBg}" stroke="${stroke}" stroke-width="2"/>`,
      );
    } else if (thread.status === "overdue-unpaid" || thread.status === "invalid-chronology") {
      parts.push(
        `<circle cx="${fmtCoord(payoffX)}" cy="${fmtCoord(rowY)}" r="6" fill="${stroke}"/><text x="${fmtCoord(payoffX)}" y="${fmtCoord(rowY + 3.5)}" text-anchor="middle" fill="${palette.blockerInk}" font-family="system-ui, -apple-system, sans-serif" font-size="9.5" font-weight="700">!</text>`,
      );
    }
  }

  // 하단 범례
  const footerY = totalHeight - 28;
  parts.push(
    `<rect x="24" y="${fmtCoord(footerY - 14)}" width="${fmtCoord(width - 48)}" height="24" rx="8" fill="${palette.badgeBg}"/>`,
  );
  const legendText =
    "범례: 실선=정사 생애선 · 점선 마름모=회상 씬 · X 원=사망 · 이중 원=정식 부활 · 실선 아크=회수 복선 · ! 핀=설정 붕괴 경고";
  parts.push(
    `<text x="36" y="${fmtCoord(footerY + 2)}" fill="${palette.textSecondary}" font-family="system-ui, -apple-system, sans-serif" font-size="10.5">${escapeTimelineXml(legendText)}</text>`,
  );

  parts.push("</svg>");
  return parts.join("");
}

/**
 * 번역투 없는 자연스러운 한국어 스토리 PD 세계관 검수 보고서를 생성한다.
 */
export function summarizeSeriesTimelineCanonKo(
  audit: SeriesTimelineCanonAuditResult,
): SeriesTimelineCanonReportKo {
  const verdictLabelKo = getVerdictBadgeKo(audit.verdict);
  const payoffPct = fmtPercent(audit.foreshadowSummary.payoffRateRatio);

  let headlineKo: string;
  if (audit.verdict === "blocked") {
    headlineKo = `『${audit.seriesTitleKo}』 ${audit.currentEpisodeNumber}화 연표에서 치명 설정 모순 ${audit.blockerCount}건이 확인돼 콘티 확정을 보류합니다.`;
  } else if (audit.verdict === "needs-review") {
    headlineKo = `『${audit.seriesTitleKo}』 ${audit.currentEpisodeNumber}화 연표에 치명 모순은 없으나 주의 항목 ${audit.warningCount}건의 확인이 필요합니다.`;
  } else {
    headlineKo = `『${audit.seriesTitleKo}』 ${audit.currentEpisodeNumber}화 세계관 연표와 복선 원장이 설정 충돌 없이 통과했습니다.`;
  }

  const activeIssueKinds: string[] = [];
  const codeKeys = Object.keys(audit.issueCountsByCode) as Array<keyof typeof audit.issueCountsByCode>;
  for (let i = 0; i < codeKeys.length; i += 1) {
    const code = codeKeys[i];
    const count = audit.issueCountsByCode[code];
    if (count > 0) {
      activeIssueKinds.push(`${CANON_ISSUE_CODE_LABEL_KO[code]} ${count}건`);
    }
  }

  const canonHealthSummaryKo =
    activeIssueKinds.length === 0
      ? `캐릭터 ${audit.totalCharacters}명, 씬 이벤트 ${audit.totalEvents}건 기준 나이·생사·계절·인과·이동 정합성이 모두 일치합니다.`
      : `탐지 내역(차단 ${audit.blockerCount} · 주의 ${audit.warningCount} · 참고 ${audit.infoCount}): ${activeIssueKinds.join(", ")}.`;

  const fs = audit.foreshadowSummary;
  const foreshadowSummaryKo =
    fs.totalThreads === 0
      ? "등록된 복선 항목이 없습니다."
      : `복선 회수율 ${payoffPct}(총 ${fs.totalThreads}건 중 회수 완료 ${fs.paidOffCount}건, 기한 초과 미회수 ${fs.overdueUnpaidCount}건, 선행 회수 모순 ${fs.invalidChronologyCount}건, 속편 보류 ${fs.intentionallyOpenSequelCount}건).`;

  const characterHighlightsKo: string[] = audit.characterTraces.map((trace) => {
    const lifeText = trace.finalLifeStatus === "deceased" ? "사망 종료" : "생존";
    const extras: string[] = [];
    if (trace.revivalEventIds.length > 0) {
      extras.push(`정식 부활 ${trace.revivalEventIds.length}회`);
    }
    if (trace.permanentInjuryNotesKo.length > 0) {
      extras.push(`영구 부상 ${trace.permanentInjuryNotesKo.length}건`);
    }
    if (trace.memoryLossEventIds.length > 0) {
      extras.push(`기억 상실 ${trace.memoryLossEventIds.length}건`);
    }
    const extraSuffix = extras.length > 0 ? ` (${extras.join(", ")})` : "";
    return `${trace.nameKo}: ${trace.birthDateIso} 출생, ${trace.totalAppearances}회 등장(회상 ${trace.flashbackAppearances}회), 현재 ${lifeText}${extraSuffix}.`;
  });

  const actionChecklistKo: string[] =
    audit.issues.length === 0
      ? ["현재 연표 그대로 작화·식자 공정에 인계해도 됩니다."]
      : audit.issues.map((issue) => {
          const sevTag =
            issue.severity === "blocker" ? "차단" : issue.severity === "warning" ? "주의" : "참고";
          return `[${sevTag}] ${issue.messageKo} → ${issue.fixHintKo}`;
        });

  const ledgerFingerprintKo = `정본 원장 SHA-256: ${audit.canonLedgerSha256Hex}`;

  const fullTextLines: string[] = [
    `[${verdictLabelKo}] ${headlineKo}`,
    `- 연표 진단: ${canonHealthSummaryKo}`,
    `- 복선 원장: ${foreshadowSummaryKo}`,
  ];
  if (characterHighlightsKo.length > 0) {
    fullTextLines.push("- 캐릭터 생애 요약:");
    for (let i = 0; i < characterHighlightsKo.length; i += 1) {
      fullTextLines.push(`  · ${characterHighlightsKo[i]}`);
    }
  }
  fullTextLines.push("- 스토리 PD 조치 목록:");
  for (let i = 0; i < actionChecklistKo.length; i += 1) {
    fullTextLines.push(`  · ${actionChecklistKo[i]}`);
  }
  fullTextLines.push(`- ${ledgerFingerprintKo}`);

  return {
    seriesId: audit.seriesId,
    verdict: audit.verdict,
    verdictLabelKo,
    headlineKo,
    canonHealthSummaryKo,
    foreshadowSummaryKo,
    characterHighlightsKo,
    actionChecklistKo,
    ledgerFingerprintKo,
    fullTextKo: fullTextLines.join("\n"),
  };
}
