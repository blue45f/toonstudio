/**
 * Wave 115 — 인쇄 안전 순수 OKLCH 스토리보드 보드·텐션 곡선 SVG 렌더러 및 한국어 PD 검수 리포트.
 *
 * - 원시 색상 포맷을 전혀 쓰지 않고 순수 `oklch(...)` 팔레트만 사용한다.
 * - 모든 텍스트 노드의 XML 특수문자(`<`, `>`, `&`, `"`, `'`)를 이스케이프하고
 *   유한 수치 보정(`NaN`/`Infinity` 0건)을 강제한다.
 */

import {
  STORYBOARD_ACT_SHORT_KO,
  type ContinuityLinkStatus,
  type ProjectedStoryboardCut,
  type StoryboardAct,
  type StoryboardFlowAuditResult,
  type StoryboardFlowBoardSvgOptions,
  type StoryboardFlowProjection,
} from "./storyboard-board-types";

const OKLCH_PALETTE = {
  paperBg: "oklch(0.985 0.006 90)",
  surfaceBg: "oklch(0.996 0.003 90)",
  headerBg: "oklch(0.952 0.012 155)",
  sceneBadgeBg: "oklch(0.28 0.052 160)",
  sceneBandBg: "oklch(0.968 0.009 92)",
  cardBg: "oklch(0.998 0.002 90)",
  borderStrong: "oklch(0.27 0.042 160)",
  borderSoft: "oklch(0.84 0.014 90)",
  gridLine: "oklch(0.89 0.01 90)",
  textPrimary: "oklch(0.21 0.028 160)",
  textMuted: "oklch(0.45 0.024 160)",
  textInverse: "oklch(0.985 0.004 90)",
  tensionTrack: "oklch(0.91 0.01 90)",
  tensionLow: "oklch(0.58 0.09 225)",
  tensionMid: "oklch(0.58 0.14 78)",
  tensionHigh: "oklch(0.54 0.19 28)",
  lockBg: "oklch(0.32 0.06 260)",
  linkNormal: "oklch(0.48 0.12 225)",
  linkViolation: "oklch(0.52 0.21 25)",
  flatlineBand: "oklch(0.74 0.12 82 / 0.22)",
  fatigueHighlight: "oklch(0.6 0.18 32 / 0.18)",
  fatigueStroke: "oklch(0.52 0.19 30)",
  chartLine: "oklch(0.36 0.12 162)",
  chartArea: "oklch(0.54 0.1 162 / 0.16)",
  peakDot: "oklch(0.52 0.21 24)",
  healthGood: "oklch(0.42 0.12 155)",
  healthWarn: "oklch(0.54 0.15 72)",
  healthBad: "oklch(0.5 0.2 26)",
} as const;

const ACT_FILL_OKLCH: Readonly<Record<StoryboardAct, string>> = {
  intro: "oklch(0.93 0.03 220)",
  development: "oklch(0.93 0.036 155)",
  twist: "oklch(0.92 0.055 75)",
  climax: "oklch(0.9 0.072 26)",
  epilogue: "oklch(0.93 0.032 285)",
};

const ACT_STROKE_OKLCH: Readonly<Record<StoryboardAct, string>> = {
  intro: "oklch(0.44 0.11 225)",
  development: "oklch(0.42 0.11 155)",
  twist: "oklch(0.5 0.14 72)",
  climax: "oklch(0.48 0.19 26)",
  epilogue: "oklch(0.45 0.11 285)",
};

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

export function escapeStoryboardXml(raw: string): string {
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

function tensionBarColor(tension: number): string {
  if (tension >= 0.72) return OKLCH_PALETTE.tensionHigh;
  if (tension >= 0.42) return OKLCH_PALETTE.tensionMid;
  return OKLCH_PALETTE.tensionLow;
}

function healthColor(score: number): string {
  if (score >= 75) return OKLCH_PALETTE.healthGood;
  if (score >= 50) return OKLCH_PALETTE.healthWarn;
  return OKLCH_PALETTE.healthBad;
}

function renderContinuityArrows(
  cuts: readonly ProjectedStoryboardCut[],
  links: readonly ContinuityLinkStatus[],
  offsetY: number,
): string[] {
  const lines: string[] = [];
  for (let i = 0; i < links.length; i += 1) {
    const link = links[i];
    if (!link) continue;
    const src = cuts[link.sourceIndex];
    const dst = cuts[link.targetIndex];
    if (!src || !dst) continue;

    const sx = src.boardCell.xPx + src.boardCell.widthPx * 0.72;
    const sy = offsetY + src.boardCell.yPx + 14;
    const dx = dst.boardCell.xPx + dst.boardCell.widthPx * 0.28;
    const dy = offsetY + dst.boardCell.yPx + 14;
    const midX = (sx + dx) / 2;
    const arcLift = link.reversed ? -34 - (i % 3) * 10 : -24 - (i % 3) * 8;
    const ctrlY = Math.min(sy, dy) + arcLift;

    const stroke = link.reversed ? OKLCH_PALETTE.linkViolation : OKLCH_PALETTE.linkNormal;
    const markerId = link.reversed ? "w115-arrow-violation" : "w115-arrow-ok";
    const dash = link.reversed ? "6 3" : "4 3";

    lines.push(
      `  <path d="M ${fmt(sx)} ${fmt(sy)} Q ${fmt(midX)} ${fmt(ctrlY)} ${fmt(dx)} ${fmt(dy)}" fill="none" stroke="${stroke}" stroke-width="${link.reversed ? "2.2" : "1.5"}" stroke-dasharray="${dash}" marker-end="url(#${markerId})" />`,
    );
    if (link.reversed) {
      lines.push(
        `  <rect x="${fmt(midX - 24)}" y="${fmt(ctrlY - 9)}" width="48" height="16" rx="8" fill="${OKLCH_PALETTE.linkViolation}" />`,
      );
      lines.push(
        `  <text x="${fmt(midX)}" y="${fmt(ctrlY + 2.5)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="9" font-weight="700" fill="${OKLCH_PALETTE.textInverse}">역전</text>`,
      );
    }
  }
  return lines;
}

/**
 * 2D 썸네일 보드 카드, 씬 배지, 복선→회수 화살표, 하단 감정 텐션 곡선을 순수 OKLCH SVG로 렌더링한다.
 */
export function renderStoryboardFlowBoardSvg(
  projection: StoryboardFlowProjection,
  audit: StoryboardFlowAuditResult,
  options?: StoryboardFlowBoardSvgOptions,
): string {
  const titleKo = options?.titleKo?.trim() || projection.episodeTitleKo;
  const showArrows = options?.showContinuityArrows !== false;
  const showReadingTime = options?.showReadingTime !== false;
  const chartHeightPx = Math.max(
    150,
    Math.min(340, Math.round(options?.chartHeightPx ?? 190)),
  );

  const headerBandH = 68;
  const widthPx = Math.max(720, projection.boardWidthPx);
  const boardOffsetY = headerBandH;
  const chartTopY = boardOffsetY + projection.boardHeightPx + 14;
  const footerH = 34;
  const totalHeightPx = chartTopY + chartHeightPx + footerH;
  const padX = projection.options.boardPaddingPx;

  const flatlineCutIds = new Set<string>();
  for (let i = 0; i < audit.flatlineSpans.length; i += 1) {
    const span = audit.flatlineSpans[i];
    if (!span) continue;
    for (let k = 0; k < span.cutIds.length; k += 1) {
      const id = span.cutIds[k];
      if (id) flatlineCutIds.add(id);
    }
  }

  const fatigueCutIds = new Set<string>();
  for (let i = 0; i < audit.dialogueFatigueSpans.length; i += 1) {
    const span = audit.dialogueFatigueSpans[i];
    if (!span) continue;
    for (let k = 0; k < span.cutIds.length; k += 1) {
      const id = span.cutIds[k];
      if (id) fatigueCutIds.add(id);
    }
  }

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(widthPx)} ${fmt(totalHeightPx)}" width="${fmt(widthPx)}" height="${fmt(totalHeightPx)}" role="img" aria-label="${escapeStoryboardXml(titleKo)}">`,
  );
  lines.push("  <defs>");
  lines.push(
    `    <marker id="w115-arrow-ok" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="${OKLCH_PALETTE.linkNormal}" /></marker>`,
  );
  lines.push(
    `    <marker id="w115-arrow-violation" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="${OKLCH_PALETTE.linkViolation}" /></marker>`,
  );
  lines.push("  </defs>");

  // 배경
  lines.push(
    `  <rect x="0" y="0" width="${fmt(widthPx)}" height="${fmt(totalHeightPx)}" fill="${OKLCH_PALETTE.paperBg}" />`,
  );

  // 상단 헤더 바
  lines.push(
    `  <rect x="${fmt(padX)}" y="12" width="${fmt(widthPx - padX * 2)}" height="48" rx="10" fill="${OKLCH_PALETTE.headerBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
  );
  lines.push(
    `  <text x="${fmt(padX + 16)}" y="34" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">${escapeStoryboardXml(titleKo)}</text>`,
  );
  const subTitle = `${projection.cuts.length}컷 · ${projection.scenes.length}씬 · ${projection.columns}열 보드 · 스트립 ${Math.round(projection.stripTotalHeightPx)}px · 추정 ${fmt(projection.totalReadingSec)}초`;
  lines.push(
    `  <text x="${fmt(padX + 16)}" y="51" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" fill="${OKLCH_PALETTE.textMuted}">${escapeStoryboardXml(subTitle)}</text>`,
  );

  // 우측 건강 점수 배지
  const badgeW = 126;
  const badgeX = widthPx - padX - badgeW - 12;
  lines.push(
    `  <rect x="${fmt(badgeX)}" y="21" width="${fmt(badgeW)}" height="30" rx="8" fill="${healthColor(audit.overallFlowHealthScore)}" />`,
  );
  lines.push(
    `  <text x="${fmt(badgeX + badgeW / 2)}" y="40" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="11.5" font-weight="700" fill="${OKLCH_PALETTE.textInverse}">페이싱 ${audit.overallFlowHealthScore}/100</text>`,
  );

  // 씬 그룹 헤더 배지
  for (let s = 0; s < projection.scenes.length; s += 1) {
    const scene = projection.scenes[s];
    if (!scene) continue;
    const hy = boardOffsetY + scene.headerYPx;
    const bandW = widthPx - padX * 2;
    lines.push(
      `  <rect x="${fmt(padX)}" y="${fmt(hy)}" width="${fmt(bandW)}" height="${fmt(scene.headerHeightPx)}" rx="8" fill="${OKLCH_PALETTE.sceneBandBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
    );
    lines.push(
      `  <rect x="${fmt(padX + 8)}" y="${fmt(hy + 6)}" width="64" height="${fmt(scene.headerHeightPx - 12)}" rx="6" fill="${OKLCH_PALETTE.sceneBadgeBg}" />`,
    );
    lines.push(
      `  <text x="${fmt(padX + 40)}" y="${fmt(hy + scene.headerHeightPx / 2 + 4)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="700" fill="${OKLCH_PALETTE.textInverse}">${escapeStoryboardXml(truncateText(scene.sceneId, 9))}</text>`,
    );
    const sceneMeta = `${scene.sceneTitleKo} · #${scene.startCutIndex + 1}~#${scene.endCutIndex + 1} (${scene.cutCount}컷 · 평균 텐션 ${fmt(scene.averageTension)})`;
    lines.push(
      `  <text x="${fmt(padX + 82)}" y="${fmt(hy + scene.headerHeightPx / 2 + 4)}" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="600" fill="${OKLCH_PALETTE.textPrimary}">${escapeStoryboardXml(sceneMeta)}</text>`,
    );
  }

  // 2D 썸네일 카드
  for (let i = 0; i < projection.cuts.length; i += 1) {
    const cut = projection.cuts[i];
    if (!cut) continue;
    const cx = cut.boardCell.xPx;
    const cy = boardOffsetY + cut.boardCell.yPx;
    const cw = cut.boardCell.widthPx;
    const ch = cut.boardCell.heightPx;
    const isFatigue = fatigueCutIds.has(cut.cutId);
    const isFlat = flatlineCutIds.has(cut.cutId);
    const cardStroke = isFatigue ? OKLCH_PALETTE.fatigueStroke : ACT_STROKE_OKLCH[cut.act];

    lines.push(
      `  <rect x="${fmt(cx)}" y="${fmt(cy)}" width="${fmt(cw)}" height="${fmt(ch)}" rx="9" fill="${OKLCH_PALETTE.cardBg}" stroke="${cardStroke}" stroke-width="${isFatigue ? "1.8" : "1.2"}" />`,
    );
    // 상단 막 배지 스트립
    lines.push(
      `  <rect x="${fmt(cx + 1)}" y="${fmt(cy + 1)}" width="${fmt(cw - 2)}" height="24" rx="8" fill="${ACT_FILL_OKLCH[cut.act]}" />`,
    );
    lines.push(
      `  <text x="${fmt(cx + 9)}" y="${fmt(cy + 16.5)}" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">#${cut.index + 1} ${escapeStoryboardXml(truncateText(cut.cutId, 11))}</text>`,
    );
    const actBadge = STORYBOARD_ACT_SHORT_KO[cut.act];
    lines.push(
      `  <text x="${fmt(cx + cw - 9)}" y="${fmt(cy + 16.5)}" text-anchor="end" font-family="system-ui, -apple-system, sans-serif" font-size="9.5" font-weight="700" fill="${ACT_STROKE_OKLCH[cut.act]}">${escapeStoryboardXml(actBadge)}</text>`,
    );

    // 컷 제목
    lines.push(
      `  <text x="${fmt(cx + 9)}" y="${fmt(cy + 44)}" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="600" fill="${OKLCH_PALETTE.textPrimary}">${escapeStoryboardXml(truncateText(cut.titleKo, 16))}</text>`,
    );

    // 대사·높이·여백 정보
    const detailLine = `대사 ${cut.dialogueCharCount}자 · ${cut.heightPx}px · 여백 ${cut.gutterBeforePx}px`;
    lines.push(
      `  <text x="${fmt(cx + 9)}" y="${fmt(cy + 62)}" font-family="system-ui, -apple-system, sans-serif" font-size="9.5" fill="${OKLCH_PALETTE.textMuted}">${escapeStoryboardXml(detailLine)}</text>`,
    );

    if (showReadingTime) {
      const timeLine = `누적 ${fmt(cut.cumulativeReadingSec)}초 (y=${Math.round(cut.yPx)}px)`;
      lines.push(
        `  <text x="${fmt(cx + 9)}" y="${fmt(cy + 78)}" font-family="system-ui, -apple-system, sans-serif" font-size="9" fill="${OKLCH_PALETTE.textMuted}">${escapeStoryboardXml(timeLine)}</text>`,
      );
    }

    // 잠금 / 정체 / 과밀 태그
    let tagX = cx + 9;
    if (cut.lockedAnchor) {
      lines.push(
        `  <rect x="${fmt(tagX)}" y="${fmt(cy + 86)}" width="34" height="15" rx="4" fill="${OKLCH_PALETTE.lockBg}" />`,
      );
      lines.push(
        `  <text x="${fmt(tagX + 17)}" y="${fmt(cy + 96.5)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="8.5" font-weight="700" fill="${OKLCH_PALETTE.textInverse}">잠금</text>`,
      );
      tagX += 38;
    }
    if (isFatigue) {
      lines.push(
        `  <rect x="${fmt(tagX)}" y="${fmt(cy + 86)}" width="44" height="15" rx="4" fill="${OKLCH_PALETTE.fatigueStroke}" />`,
      );
      lines.push(
        `  <text x="${fmt(tagX + 22)}" y="${fmt(cy + 96.5)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="8.5" font-weight="700" fill="${OKLCH_PALETTE.textInverse}">대사과밀</text>`,
      );
      tagX += 48;
    }
    if (isFlat) {
      lines.push(
        `  <rect x="${fmt(tagX)}" y="${fmt(cy + 86)}" width="34" height="15" rx="4" fill="${OKLCH_PALETTE.healthWarn}" />`,
      );
      lines.push(
        `  <text x="${fmt(tagX + 17)}" y="${fmt(cy + 96.5)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="8.5" font-weight="700" fill="${OKLCH_PALETTE.textInverse}">정체</text>`,
      );
    }

    // 하단 텐션 바
    const barW = cw - 52;
    const barY = cy + ch - 18;
    lines.push(
      `  <rect x="${fmt(cx + 9)}" y="${fmt(barY)}" width="${fmt(barW)}" height="8" rx="4" fill="${OKLCH_PALETTE.tensionTrack}" />`,
    );
    lines.push(
      `  <rect x="${fmt(cx + 9)}" y="${fmt(barY)}" width="${fmt(Math.max(2, barW * cut.tension))}" height="8" rx="4" fill="${tensionBarColor(cut.tension)}" />`,
    );
    lines.push(
      `  <text x="${fmt(cx + cw - 9)}" y="${fmt(barY + 7.5)}" text-anchor="end" font-family="system-ui, -apple-system, sans-serif" font-size="9.5" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">${fmt(cut.tension)}</text>`,
    );
  }

  // 복선→회수 연속성 화살표
  if (showArrows && projection.continuityLinks.length > 0) {
    lines.push(...renderContinuityArrows(projection.cuts, projection.continuityLinks, boardOffsetY));
  }

  // 하단 감정 텐션 곡선 차트
  const chartBoxW = widthPx - padX * 2;
  lines.push(
    `  <rect x="${fmt(padX)}" y="${fmt(chartTopY)}" width="${fmt(chartBoxW)}" height="${fmt(chartHeightPx)}" rx="10" fill="${OKLCH_PALETTE.surfaceBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
  );
  lines.push(
    `  <text x="${fmt(padX + 14)}" y="${fmt(chartTopY + 22)}" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">감정 텐션 곡선 (4막 페이싱 · 피크 ${escapeStoryboardXml(audit.peakTensionCutId ?? "없음")})</text>`,
  );

  const plotLeft = padX + 46;
  const plotRight = padX + chartBoxW - 22;
  const plotTop = chartTopY + 34;
  const plotBottom = chartTopY + chartHeightPx - 28;
  const plotW = Math.max(10, plotRight - plotLeft);
  const plotH = Math.max(10, plotBottom - plotTop);

  // 기준선 (0.25 / 0.50 / 0.75 / 1.00)
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  for (let t = 0; t < ticks.length; t += 1) {
    const tick = ticks[t] ?? 0;
    const ty = plotBottom - tick * plotH;
    lines.push(
      `  <line x1="${fmt(plotLeft)}" y1="${fmt(ty)}" x2="${fmt(plotRight)}" y2="${fmt(ty)}" stroke="${OKLCH_PALETTE.gridLine}" stroke-width="1" />`,
    );
    lines.push(
      `  <text x="${fmt(plotLeft - 8)}" y="${fmt(ty + 3.5)}" text-anchor="end" font-family="system-ui, -apple-system, sans-serif" font-size="9" fill="${OKLCH_PALETTE.textMuted}">${fmt(tick)}</text>`,
    );
  }

  const cutCount = projection.cuts.length;
  const xForIndex = (idx: number): number =>
    cutCount <= 1 ? plotLeft + plotW / 2 : plotLeft + (idx / (cutCount - 1)) * plotW;

  // 정체 구간 음영 밴드
  for (let f = 0; f < audit.flatlineSpans.length; f += 1) {
    const span = audit.flatlineSpans[f];
    if (!span) continue;
    const x1 = xForIndex(span.startCutIndex);
    const x2 = xForIndex(span.endCutIndex);
    lines.push(
      `  <rect x="${fmt(x1)}" y="${fmt(plotTop)}" width="${fmt(Math.max(8, x2 - x1))}" height="${fmt(plotH)}" fill="${OKLCH_PALETTE.flatlineBand}" />`,
    );
  }

  // 대사 과밀 음영 밴드
  for (let d = 0; d < audit.dialogueFatigueSpans.length; d += 1) {
    const span = audit.dialogueFatigueSpans[d];
    if (!span) continue;
    const x1 = xForIndex(span.startCutIndex) - 4;
    const x2 = xForIndex(span.endCutIndex) + 4;
    lines.push(
      `  <rect x="${fmt(Math.max(plotLeft, x1))}" y="${fmt(plotTop)}" width="${fmt(Math.max(8, Math.min(plotRight, x2) - Math.max(plotLeft, x1)))}" height="${fmt(plotH)}" fill="${OKLCH_PALETTE.fatigueHighlight}" />`,
    );
  }

  if (cutCount > 0) {
    const points: string[] = [];
    for (let i = 0; i < cutCount; i += 1) {
      const cut = projection.cuts[i];
      if (!cut) continue;
      const px = xForIndex(i);
      const py = plotBottom - cut.tension * plotH;
      points.push(`${fmt(px)},${fmt(py)}`);
    }
    const firstX = xForIndex(0);
    const lastX = xForIndex(cutCount - 1);
    const areaPath = `M ${fmt(firstX)} ${fmt(plotBottom)} L ${points.join(" L ")} L ${fmt(lastX)} ${fmt(plotBottom)} Z`;
    lines.push(`  <path d="${areaPath}" fill="${OKLCH_PALETTE.chartArea}" />`);
    lines.push(
      `  <polyline points="${points.join(" ")}" fill="none" stroke="${OKLCH_PALETTE.chartLine}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" />`,
    );

    // 각 컷 포인트 및 피크 강조
    const labelStep = Math.max(1, Math.ceil(cutCount / 16));
    for (let i = 0; i < cutCount; i += 1) {
      const cut = projection.cuts[i];
      if (!cut) continue;
      const px = xForIndex(i);
      const py = plotBottom - cut.tension * plotH;
      const isPeak = i === audit.peakCutIndex;
      lines.push(
        `  <circle cx="${fmt(px)}" cy="${fmt(py)}" r="${isPeak ? "5" : "2.8"}" fill="${isPeak ? OKLCH_PALETTE.peakDot : OKLCH_PALETTE.chartLine}" />`,
      );
      if (i % labelStep === 0 || i === cutCount - 1) {
        lines.push(
          `  <text x="${fmt(px)}" y="${fmt(plotBottom + 15)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="8.5" fill="${OKLCH_PALETTE.textMuted}">#${i + 1}</text>`,
        );
      }
    }
  } else {
    lines.push(
      `  <text x="${fmt(plotLeft + plotW / 2)}" y="${fmt(plotTop + plotH / 2)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="${OKLCH_PALETTE.textMuted}">등록된 컷 없음</text>`,
    );
  }

  // 하단 요약 푸터
  const footerText = `엔딩 훅 ${audit.endingHookScore}/100 · 씬 전환 리듬 ${audit.sceneTransitionRhythmScore}/100 · 정체 ${audit.flatlineSpans.length}건 · 대사 과밀 ${audit.dialogueFatigueSpans.length}건 · 복선 역전 ${audit.continuityViolations.length}건 · SHA-256 ${projection.stateSha256Hex.slice(0, 12)}`;
  lines.push(
    `  <text x="${fmt(padX)}" y="${fmt(totalHeightPx - 12)}" font-family="system-ui, -apple-system, sans-serif" font-size="10" fill="${OKLCH_PALETTE.textMuted}">${escapeStoryboardXml(footerText)}</text>`,
  );
  lines.push("</svg>");

  return lines.join("\n");
}

/**
 * 스토리보드 컷 흐름·감정 텐션 감사 결과를 자연스러운 한국어 웹툰 PD 검수 브리프로 정리한다.
 */
export function summarizeStoryboardFlowAuditKo(
  projection: StoryboardFlowProjection,
  audit: StoryboardFlowAuditResult,
): string {
  const lines: string[] = [];
  lines.push(`[스토리보드 PD 검수 브리프] ${projection.episodeTitleKo}`);
  lines.push(
    `- 회차 편성: 총 ${projection.cuts.length}컷(${projection.scenes.length}개 씬, ${projection.columns}열 보드), 세로 스크롤 총 길이 ${Math.round(projection.stripTotalHeightPx)}px, 총 대사 ${projection.totalDialogueChars}자`,
  );
  lines.push(
    `- 모델 추정 읽기 시간(실측 독자 데이터 아님): 약 ${fmt(projection.totalReadingSec)}초`,
  );
  lines.push(
    `- 종합 페이싱 점수: ${audit.overallFlowHealthScore}/100 (4막 전개 ${audit.arcProgressionScore} · 엔딩 훅 ${audit.endingHookScore} · 씬 전환 리듬 ${audit.sceneTransitionRhythmScore})`,
  );

  const actSummaryText = audit.actDistribution
    .filter((stat) => stat.cutCount > 0)
    .map((stat) => `${stat.labelKo} ${stat.cutCount}컷(평균 ${fmt(stat.averageTension)})`)
    .join(" / ");
  lines.push(
    `- 4막 텐션 흐름: ${actSummaryText || "등록된 컷 없음"} · 최고점 ${audit.peakTensionCutId ?? "없음"}(텐션 ${fmt(audit.peakTension)}, 회차 ${Math.round(audit.peakPositionRatio * 100)}% 지점)`,
  );

  if (audit.continuityViolations.length === 0) {
    lines.push(
      `- 복선·회수 연속성: 이상 없음 (추적 링크 ${projection.continuityLinks.length}건 모두 순방향 유지)`,
    );
  } else {
    lines.push(`- 복선·회수 연속성: 역전 ${audit.continuityViolations.length}건 발견`);
    for (let i = 0; i < audit.continuityViolations.length; i += 1) {
      const violation = audit.continuityViolations[i];
      if (violation) {
        lines.push(`  · ${violation.reasonKo}`);
      }
    }
  }

  if (audit.flatlineSpans.length === 0) {
    lines.push("- 텐션 정체 구간: 0건 (컷 사이 완급 변화가 살아 있음)");
  } else {
    const flatDesc = audit.flatlineSpans
      .map((span) => `${span.cutIds[0] ?? span.startCutIndex}~${span.cutIds[span.cutIds.length - 1] ?? span.endCutIndex}(${span.length}컷)`)
      .join(", ");
    lines.push(`- 텐션 정체 구간: ${audit.flatlineSpans.length}건 감지 (${flatDesc})`);
  }

  if (audit.dialogueFatigueSpans.length === 0) {
    lines.push("- 대사 과밀 구간: 0건 (컷당 말풍선 분량 적정)");
  } else {
    const fatigueDesc = audit.dialogueFatigueSpans
      .map((span) => `${span.peakCutId}(최대 ${span.peakDialogueChars}자, ${span.length}컷 구간)`)
      .join(", ");
    lines.push(`- 대사 과밀 구간: ${audit.dialogueFatigueSpans.length}건 감지 (${fatigueDesc})`);
  }

  if (audit.suggestions.length === 0) {
    lines.push("- 권장 리플로우 조치: 즉시 수정할 항목 없음. 현재 콘티 순서로 선화 단계 진입 가능.");
  } else {
    lines.push(`- 우선 권장 리플로우 조치(${audit.suggestions.length}건):`);
    for (let i = 0; i < audit.suggestions.length; i += 1) {
      const sug = audit.suggestions[i];
      if (sug) {
        lines.push(`  · [${sug.priority.toUpperCase()}] ${sug.titleKo} — ${sug.rationaleKo}`);
      }
    }
  }

  lines.push(`- 상태 지문(SHA-256): ${projection.stateSha256Hex}`);
  return lines.join("\n");
}
