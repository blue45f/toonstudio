/**
 * Wave 134 — 인쇄 안전 순수 OKLCH 5단계 간트 차트·부하 비교 SVG 렌더러 및 한국어 PD 브리프.
 *
 * - 모든 색상은 `oklch(...)`만 사용한다(원시 hex, rgb, hsl 사용 금지).
 * - 모든 텍스트에 XML 특수문자 이스케이프를 적용하고 유한 수치만 출력한다.
 * - 한국어 보고서는 번역투와 의료·진단 표현을 배제하고 모델 추정치임을 분명히 밝힌다.
 */

import {
  PRODUCTION_STAGE_LABELS_KO,
  PRODUCTION_STAGE_SHORT_KO,
  type DeadlineStatus,
  type EpisodeCpmScheduleResult,
  type EpisodeScheduleGanttSvgOptions,
  type MemberWorkloadSummary,
  type ProductionStageId,
  type ScheduledEpisodeTask,
  type WorkloadRebalanceResult,
} from "./episode-schedule-types";

const OKLCH_PALETTE = {
  paperBg: "oklch(0.985 0.006 90)",
  surfaceBg: "oklch(0.996 0.003 90)",
  headerBg: "oklch(0.952 0.012 155)",
  rowAltBg: "oklch(0.972 0.006 92)",
  borderStrong: "oklch(0.28 0.042 160)",
  borderSoft: "oklch(0.84 0.014 90)",
  gridLine: "oklch(0.89 0.01 90)",
  textPrimary: "oklch(0.21 0.028 160)",
  textMuted: "oklch(0.45 0.024 160)",
  textInverse: "oklch(0.985 0.004 90)",
  criticalStroke: "oklch(0.5 0.21 26)",
  criticalBadgeBg: "oklch(0.52 0.2 26)",
  slackFill: "oklch(0.76 0.04 220 / 0.28)",
  slackStroke: "oklch(0.54 0.08 220)",
  deadlineStroke: "oklch(0.49 0.21 25)",
  crunchWash: "oklch(0.78 0.12 72 / 0.18)",
  healthyLine: "oklch(0.42 0.12 155)",
  beforeBarFill: "oklch(0.76 0.02 95)",
  beforeBarStroke: "oklch(0.56 0.02 95)",
  afterOkFill: "oklch(0.46 0.11 155)",
  afterWarnFill: "oklch(0.58 0.14 76)",
  afterOverFill: "oklch(0.52 0.2 26)",
  statusOnTrackBg: "oklch(0.4 0.11 155)",
  statusTightBg: "oklch(0.56 0.15 74)",
  statusLateBg: "oklch(0.5 0.21 26)",
  lockBadgeBg: "oklch(0.36 0.04 255)",
  movedBadgeBg: "oklch(0.44 0.12 225)",
  errorCardBg: "oklch(0.95 0.03 26)",
} as const;

const STAGE_FILL_OKLCH: Readonly<Record<ProductionStageId, string>> = {
  "story-conti": "oklch(0.88 0.045 230)",
  "bg3d-layout": "oklch(0.88 0.05 188)",
  "lineart-ink": "oklch(0.88 0.05 152)",
  "flat-color": "oklch(0.9 0.06 96)",
  "shading-vfx": "oklch(0.89 0.068 58)",
  "lettering-final-qa": "oklch(0.89 0.048 295)",
};

const STAGE_STROKE_OKLCH: Readonly<Record<ProductionStageId, string>> = {
  "story-conti": "oklch(0.46 0.11 230)",
  "bg3d-layout": "oklch(0.44 0.1 188)",
  "lineart-ink": "oklch(0.42 0.11 152)",
  "flat-color": "oklch(0.52 0.12 92)",
  "shading-vfx": "oklch(0.52 0.14 56)",
  "lettering-final-qa": "oklch(0.46 0.11 295)",
};

const DEADLINE_STATUS_LABEL_KO: Readonly<Record<DeadlineStatus, string>> = {
  "on-track": "정상 여유",
  "tight-buffer": "마감 촉박",
  "late-risk-red": "지연 위험",
};

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function fmtHr(value: number): string {
  if (!Number.isFinite(value)) return "0.0";
  const rounded = Math.round(value * 10) / 10;
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(1);
}

function fmtPct(ratio: number): string {
  if (!Number.isFinite(ratio)) return "0.0";
  const pct = Math.round(ratio * 1000) / 10;
  return (Object.is(pct, -0) ? 0 : pct).toFixed(1);
}

/**
 * SVG 텍스트·속성에 들어가는 XML 특수문자를 안전하게 이스케이프한다.
 */
export function escapeScheduleXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncateLabel(raw: string, maxChars: number): string {
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, Math.max(1, maxChars - 1))}…`;
}

function statusBadgeColor(status: DeadlineStatus): string {
  if (status === "on-track") return OKLCH_PALETTE.statusOnTrackBg;
  if (status === "tight-buffer") return OKLCH_PALETTE.statusTightBg;
  return OKLCH_PALETTE.statusLateBg;
}

function renderFailClosedSvg(
  schedule: EpisodeCpmScheduleResult,
  widthPx: number,
  titleText: string,
): string {
  const errors = schedule.validationErrors.slice(0, 6);
  const heightPx = 180 + errors.length * 26;
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(widthPx)} ${fmt(heightPx)}" width="${fmt(widthPx)}" height="${fmt(heightPx)}" role="img" aria-label="${escapeScheduleXml(titleText)}">`,
    `  <rect x="0" y="0" width="${fmt(widthPx)}" height="${fmt(heightPx)}" fill="${OKLCH_PALETTE.paperBg}" />`,
    `  <rect x="20" y="20" width="${fmt(widthPx - 40)}" height="${fmt(heightPx - 40)}" rx="12" fill="${OKLCH_PALETTE.errorCardBg}" stroke="${OKLCH_PALETTE.criticalStroke}" stroke-width="1.5" />`,
    `  <text x="40" y="56" font-family="sans-serif" font-size="18" font-weight="700" fill="${OKLCH_PALETTE.criticalStroke}">${escapeScheduleXml(titleText)} — 검증 차단(Fail-Closed)</text>`,
    `  <text x="40" y="82" font-family="sans-serif" font-size="13" fill="${OKLCH_PALETTE.textPrimary}">${escapeScheduleXml(schedule.cycleDetected ? "순환 의존성이 감지되어 일정 산출을 중단했습니다." : "입력 공정 계약 오류로 일정 산출을 중단했습니다.")}</text>`,
  ];

  for (let i = 0; i < errors.length; i += 1) {
    const err = errors[i];
    if (!err) continue;
    const y = 114 + i * 24;
    lines.push(
      `  <text x="48" y="${fmt(y)}" font-family="sans-serif" font-size="12" fill="${OKLCH_PALETTE.textPrimary}">• [${escapeScheduleXml(err.code)}] ${escapeScheduleXml(truncateLabel(err.detailKo, 90))}</text>`,
    );
  }

  lines.push(
    `  <text x="40" y="${fmt(heightPx - 32)}" font-family="monospace" font-size="11" fill="${OKLCH_PALETTE.textMuted}">SHA-256: ${escapeScheduleXml(schedule.manifestSha256Hex.slice(0, 16))}</text>`,
    `</svg>`,
  );
  return lines.join("\n");
}

function chooseAxisStepHr(maxHours: number): number {
  if (maxHours <= 24) return 4;
  if (maxHours <= 60) return 6;
  if (maxHours <= 120) return 12;
  if (maxHours <= 240) return 24;
  return 48;
}

function renderGanttRows(params: {
  readonly tasks: readonly ScheduledEpisodeTask[];
  readonly movedTaskIds: ReadonlySet<string>;
  readonly chartX: number;
  readonly chartW: number;
  readonly startY: number;
  readonly rowH: number;
  readonly scaleMaxHr: number;
}): string[] {
  const { tasks, movedTaskIds, chartX, chartW, startY, rowH, scaleMaxHr } = params;
  const lines: string[] = [];
  const toX = (hr: number): number =>
    chartX + (scaleMaxHr > 0 ? (Math.max(0, hr) / scaleMaxHr) * chartW : 0);

  for (let i = 0; i < tasks.length; i += 1) {
    const task = tasks[i];
    if (!task) continue;
    const y = startY + i * rowH;
    if (i % 2 === 1) {
      lines.push(
        `  <rect x="24" y="${fmt(y)}" width="${fmt(chartX + chartW - 24)}" height="${fmt(rowH)}" fill="${OKLCH_PALETTE.rowAltBg}" />`,
      );
    }

    // 왼쪽 라벨 열: 공정 배지 + 컷 범위 + 담당자
    const stageShort = PRODUCTION_STAGE_SHORT_KO[task.stage];
    const stageFill = STAGE_FILL_OKLCH[task.stage];
    const stageStroke = STAGE_STROKE_OKLCH[task.stage];

    lines.push(
      `  <rect x="30" y="${fmt(y + 7)}" width="54" height="18" rx="4" fill="${stageFill}" stroke="${stageStroke}" stroke-width="1" />`,
      `  <text x="57" y="${fmt(y + 20)}" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="600" fill="${OKLCH_PALETTE.textPrimary}">${escapeScheduleXml(stageShort)}</text>`,
      `  <text x="92" y="${fmt(y + 16)}" font-family="sans-serif" font-size="11" font-weight="600" fill="${OKLCH_PALETTE.textPrimary}">${escapeScheduleXml(truncateLabel(task.cutRangeLabel, 18))}</text>`,
      `  <text x="92" y="${fmt(y + 29)}" font-family="sans-serif" font-size="10" fill="${OKLCH_PALETTE.textMuted}">${escapeScheduleXml(truncateLabel(task.assignedMemberNameKo, 10))}${task.lockedAssignment ? " · 잠금" : ""}${movedTaskIds.has(task.taskId) ? " · 재배정" : ""}</text>`,
    );

    // 슬랙(Total Float) 막대
    if (task.totalFloatHr > 0.05) {
      const slackX = toX(task.earliestFinishHr);
      const slackEndX = toX(task.latestFinishHr);
      const slackW = Math.max(2, slackEndX - slackX);
      lines.push(
        `  <rect x="${fmt(slackX)}" y="${fmt(y + 11)}" width="${fmt(slackW)}" height="12" rx="3" fill="${OKLCH_PALETTE.slackFill}" stroke="${OKLCH_PALETTE.slackStroke}" stroke-width="1" stroke-dasharray="3 2" />`,
      );
    }

    // 작업 간트 막대
    const barX = toX(task.earliestStartHr);
    const barEndX = toX(task.earliestFinishHr);
    const barW = Math.max(4, barEndX - barX);
    const barStroke = task.isCriticalPath ? OKLCH_PALETTE.criticalStroke : stageStroke;
    const barStrokeW = task.isCriticalPath ? 2.2 : 1.1;

    lines.push(
      `  <rect x="${fmt(barX)}" y="${fmt(y + 6)}" width="${fmt(barW)}" height="22" rx="4" fill="${stageFill}" stroke="${barStroke}" stroke-width="${fmt(barStrokeW)}" />`,
    );

    if (task.isCriticalPath) {
      lines.push(
        `  <rect x="${fmt(barX)}" y="${fmt(y + 6)}" width="4" height="22" rx="2" fill="${OKLCH_PALETTE.criticalBadgeBg}" />`,
      );
    }

    const barCaption = `${fmtHr(task.effectiveDurationHr)}h${task.isCriticalPath ? " 임계" : task.totalFloatHr > 0.05 ? ` (+${fmtHr(task.totalFloatHr)}h)` : ""}`;
    const captionX = barEndX + 6;
    const clampedCaptionX = Math.min(chartX + chartW - 68, captionX);
    lines.push(
      `  <text x="${fmt(clampedCaptionX)}" y="${fmt(y + 21)}" font-family="sans-serif" font-size="10" font-weight="${task.isCriticalPath ? "700" : "500"}" fill="${task.isCriticalPath ? OKLCH_PALETTE.criticalStroke : OKLCH_PALETTE.textPrimary}">${escapeScheduleXml(barCaption)}</text>`,
    );
  }

  return lines;
}

function renderMemberWorkloadPanel(params: {
  readonly beforeWorkloads: readonly MemberWorkloadSummary[];
  readonly afterWorkloads: readonly MemberWorkloadSummary[] | null;
  readonly startY: number;
  readonly chartX: number;
  readonly chartW: number;
  readonly widthPx: number;
}): { readonly lines: string[]; readonly panelHeight: number } {
  const { beforeWorkloads, afterWorkloads, startY, chartX, chartW, widthPx } = params;
  const hasComparison = afterWorkloads !== null;
  const rowH = hasComparison ? 44 : 30;
  const headerH = 34;
  const panelHeight = headerH + Math.max(1, beforeWorkloads.length) * rowH + 18;

  const afterMap = new Map<string, MemberWorkloadSummary>();
  if (afterWorkloads) {
    for (let i = 0; i < afterWorkloads.length; i += 1) {
      const m = afterWorkloads[i];
      if (m) afterMap.set(m.memberId, m);
    }
  }

  let maxHoursScale = 24;
  for (let i = 0; i < beforeWorkloads.length; i += 1) {
    const bm = beforeWorkloads[i];
    if (!bm) continue;
    const am = afterMap.get(bm.memberId);
    maxHoursScale = Math.max(
      maxHoursScale,
      bm.assignedEffectiveHours,
      bm.healthyBudgetHr,
      am ? am.assignedEffectiveHours : 0,
    );
  }
  maxHoursScale *= 1.15;

  const toW = (hr: number): number =>
    maxHoursScale > 0 ? Math.max(0, (hr / maxHoursScale) * (chartW - 110)) : 0;

  const lines: string[] = [
    `  <rect x="20" y="${fmt(startY)}" width="${fmt(widthPx - 40)}" height="${fmt(panelHeight)}" rx="10" fill="${OKLCH_PALETTE.surfaceBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
    `  <text x="34" y="${fmt(startY + 22)}" font-family="sans-serif" font-size="13" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">${escapeScheduleXml(hasComparison ? "팀원별 건강 한계 대비 작업량 평준화 (전 / 후 비교)" : "팀원별 건강 작업 한계 대비 누적 부하")}</text>`,
  ];

  if (beforeWorkloads.length === 0) {
    lines.push(
      `  <text x="34" y="${fmt(startY + 52)}" font-family="sans-serif" font-size="12" fill="${OKLCH_PALETTE.textMuted}">등록된 팀원이 없습니다.</text>`,
    );
    return { lines, panelHeight };
  }

  for (let i = 0; i < beforeWorkloads.length; i += 1) {
    const bm = beforeWorkloads[i];
    if (!bm) continue;
    const am = afterMap.get(bm.memberId) ?? bm;
    const y = startY + headerH + i * rowH;

    lines.push(
      `  <text x="34" y="${fmt(y + 16)}" font-family="sans-serif" font-size="11" font-weight="600" fill="${OKLCH_PALETTE.textPrimary}">${escapeScheduleXml(truncateLabel(bm.nameKo, 14))}</text>`,
      `  <text x="34" y="${fmt(y + 30)}" font-family="sans-serif" font-size="10" fill="${OKLCH_PALETTE.textMuted}">한계 ${fmtHr(bm.healthyBudgetHr)}h (×${fmt(bm.speedMultiplier)})</text>`,
    );

    const healthyLineX = chartX + toW(bm.healthyBudgetHr);
    if (hasComparison) {
      const beforeW = Math.max(2, toW(bm.assignedEffectiveHours));
      const afterW = Math.max(2, toW(am.assignedEffectiveHours));
      const afterColor = am.isOverloaded
        ? OKLCH_PALETTE.afterOverFill
        : am.utilizationRatio >= 0.85
          ? OKLCH_PALETTE.afterWarnFill
          : OKLCH_PALETTE.afterOkFill;

      lines.push(
        `  <rect x="${fmt(chartX)}" y="${fmt(y + 5)}" width="${fmt(beforeW)}" height="12" rx="3" fill="${OKLCH_PALETTE.beforeBarFill}" stroke="${OKLCH_PALETTE.beforeBarStroke}" stroke-width="0.8" />`,
        `  <rect x="${fmt(chartX)}" y="${fmt(y + 20)}" width="${fmt(afterW)}" height="14" rx="3" fill="${afterColor}" />`,
        `  <line x1="${fmt(healthyLineX)}" y1="${fmt(y + 2)}" x2="${fmt(healthyLineX)}" y2="${fmt(y + 38)}" stroke="${OKLCH_PALETTE.healthyLine}" stroke-width="1.6" stroke-dasharray="3 2" />`,
        `  <text x="${fmt(chartX + chartW - 102)}" y="${fmt(y + 16)}" font-family="sans-serif" font-size="10" fill="${OKLCH_PALETTE.textMuted}">전 ${fmtHr(bm.assignedEffectiveHours)}h</text>`,
        `  <text x="${fmt(chartX + chartW - 102)}" y="${fmt(y + 31)}" font-family="sans-serif" font-size="11" font-weight="700" fill="${am.isOverloaded ? OKLCH_PALETTE.afterOverFill : OKLCH_PALETTE.textPrimary}">후 ${fmtHr(am.assignedEffectiveHours)}h${am.isOverloaded ? ` (+${fmtHr(am.overloadHours)}h)` : ""}</text>`,
      );
    } else {
      const barW = Math.max(2, toW(bm.assignedEffectiveHours));
      const barColor = bm.isOverloaded
        ? OKLCH_PALETTE.afterOverFill
        : bm.utilizationRatio >= 0.85
          ? OKLCH_PALETTE.afterWarnFill
          : OKLCH_PALETTE.afterOkFill;
      lines.push(
        `  <rect x="${fmt(chartX)}" y="${fmt(y + 7)}" width="${fmt(barW)}" height="15" rx="3" fill="${barColor}" />`,
        `  <line x1="${fmt(healthyLineX)}" y1="${fmt(y + 3)}" x2="${fmt(healthyLineX)}" y2="${fmt(y + 26)}" stroke="${OKLCH_PALETTE.healthyLine}" stroke-width="1.6" stroke-dasharray="3 2" />`,
        `  <text x="${fmt(chartX + chartW - 102)}" y="${fmt(y + 19)}" font-family="sans-serif" font-size="11" font-weight="600" fill="${bm.isOverloaded ? OKLCH_PALETTE.afterOverFill : OKLCH_PALETTE.textPrimary}">${fmtHr(bm.assignedEffectiveHours)}h${bm.isOverloaded ? ` (+${fmtHr(bm.overloadHours)}h)` : ""}</text>`,
      );
    }
  }

  return { lines, panelHeight };
}

/**
 * 5단계 간트 차트(임계 경로·여유 슬랙·마감 기준선)와 팀원별 건강 한계 대비 전/후 부하 비교 SVG를 생성한다.
 */
export function renderEpisodeScheduleGanttSvg(
  beforeSchedule: EpisodeCpmScheduleResult,
  rebalanceResult?: WorkloadRebalanceResult,
  options: EpisodeScheduleGanttSvgOptions = {},
): string {
  const widthPx = Math.max(760, Math.min(1600, Math.round(options.widthPx ?? 1080)));
  const activeSchedule =
    rebalanceResult && rebalanceResult.ok ? rebalanceResult.afterSchedule : beforeSchedule;
  const titleText =
    options.titleOverrideKo?.trim() ||
    `${activeSchedule.episodeTitleKo} · 주간 연재 마감 공정표`;

  if (!beforeSchedule.ok) {
    return renderFailClosedSvg(beforeSchedule, widthPx, titleText);
  }

  const labelColW = 240;
  const chartX = 20 + labelColW;
  const chartW = widthPx - chartX - 30;
  const headerH = 88;
  const ganttHeaderH = 38;
  const rowH = 34;
  const taskRowsCount = Math.max(1, activeSchedule.scheduledTasks.length);
  const ganttPanelH = ganttHeaderH + taskRowsCount * rowH + 16;
  const ganttPanelY = headerH + 16;

  const movedTaskIds = new Set<string>(
    rebalanceResult ? rebalanceResult.reassignments.map((r) => r.taskId) : [],
  );

  const scaleMaxHr = Math.max(
    12,
    activeSchedule.deadlineBudgetHr,
    activeSchedule.projectMakespanHr,
    beforeSchedule.projectMakespanHr,
  ) * 1.12;
  const axisStepHr = chooseAxisStepHr(scaleMaxHr);
  const toX = (hr: number): number =>
    chartX + (scaleMaxHr > 0 ? (Math.max(0, hr) / scaleMaxHr) * chartW : 0);

  const memberPanelY = ganttPanelY + ganttPanelH + 16;
  const memberPanel = renderMemberWorkloadPanel({
    beforeWorkloads: beforeSchedule.memberWorkloads,
    afterWorkloads: rebalanceResult && rebalanceResult.ok ? rebalanceResult.afterSchedule.memberWorkloads : null,
    startY: memberPanelY,
    chartX,
    chartW,
    widthPx,
  });

  const footerY = memberPanelY + memberPanel.panelHeight + 16;
  const totalHeightPx = footerY + 52;

  const statusLabel = DEADLINE_STATUS_LABEL_KO[activeSchedule.deadlineStatus];
  const statusColor = statusBadgeColor(activeSchedule.deadlineStatus);
  const summaryLine = rebalanceResult
    ? `완료 시간 ${fmtHr(rebalanceResult.beforeMakespanHr)}h → ${fmtHr(rebalanceResult.afterMakespanHr)}h · 부하 편차 ${fmtHr(rebalanceResult.beforeLoadSpreadHr)}h → ${fmtHr(rebalanceResult.afterLoadSpreadHr)}h · 마감 기준 ${fmtHr(activeSchedule.deadlineBudgetHr)}h`
    : `예상 완료 ${fmtHr(activeSchedule.projectMakespanHr)}h · 마감 기준 ${fmtHr(activeSchedule.deadlineBudgetHr)}h · 팀원 편차 ${fmtHr(activeSchedule.loadSpreadHr)}h`;

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(widthPx)} ${fmt(totalHeightPx)}" width="${fmt(widthPx)}" height="${fmt(totalHeightPx)}" role="img" aria-label="${escapeScheduleXml(titleText)}">`,
    `  <rect x="0" y="0" width="${fmt(widthPx)}" height="${fmt(totalHeightPx)}" fill="${OKLCH_PALETTE.paperBg}" />`,
    // 헤더 배너
    `  <rect x="20" y="16" width="${fmt(widthPx - 40)}" height="${fmt(headerH - 12)}" rx="12" fill="${OKLCH_PALETTE.headerBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
    `  <text x="36" y="46" font-family="sans-serif" font-size="18" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">${escapeScheduleXml(truncateLabel(titleText, 54))}</text>`,
    `  <text x="36" y="70" font-family="sans-serif" font-size="12" fill="${OKLCH_PALETTE.textMuted}">${escapeScheduleXml(summaryLine)}</text>`,
    `  <rect x="${fmt(widthPx - 146)}" y="28" width="110" height="26" rx="13" fill="${statusColor}" />`,
    `  <text x="${fmt(widthPx - 91)}" y="45" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="700" fill="${OKLCH_PALETTE.textInverse}">${escapeScheduleXml(statusLabel)}</text>`,
    `  <text x="${fmt(widthPx - 36)}" y="72" text-anchor="end" font-family="monospace" font-size="10" fill="${OKLCH_PALETTE.textMuted}">지문 ${escapeScheduleXml(activeSchedule.manifestSha256Hex.slice(0, 12))}</text>`,
    // 간트 패널 컨테이너
    `  <rect x="20" y="${fmt(ganttPanelY)}" width="${fmt(widthPx - 40)}" height="${fmt(ganttPanelH)}" rx="10" fill="${OKLCH_PALETTE.surfaceBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
    `  <text x="34" y="${fmt(ganttPanelY + 23)}" font-family="sans-serif" font-size="13" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">5단계 공정 간트·임계 경로(CPM) 타임라인</text>`,
  ];

  // 최종 24시간 크런치 구간 배경 음영
  if (activeSchedule.deadlineBudgetHr > 24) {
    const crunchX1 = toX(activeSchedule.crunchWindow.windowStartHr);
    const crunchX2 = toX(activeSchedule.deadlineBudgetHr);
    if (crunchX2 > crunchX1) {
      lines.push(
        `  <rect x="${fmt(crunchX1)}" y="${fmt(ganttPanelY + ganttHeaderH)}" width="${fmt(crunchX2 - crunchX1)}" height="${fmt(taskRowsCount * rowH)}" fill="${OKLCH_PALETTE.crunchWash}" />`,
      );
    }
  }

  // 시간축 수직 격자
  for (let hr = 0; hr <= scaleMaxHr; hr += axisStepHr) {
    const gx = toX(hr);
    lines.push(
      `  <line x1="${fmt(gx)}" y1="${fmt(ganttPanelY + ganttHeaderH - 4)}" x2="${fmt(gx)}" y2="${fmt(ganttPanelY + ganttPanelH - 12)}" stroke="${OKLCH_PALETTE.gridLine}" stroke-width="1" />`,
      `  <text x="${fmt(gx)}" y="${fmt(ganttPanelY + ganttHeaderH - 10)}" text-anchor="middle" font-family="sans-serif" font-size="10" fill="${OKLCH_PALETTE.textMuted}">${fmt(hr)}h</text>`,
    );
  }

  // 간트 작업 행
  if (activeSchedule.scheduledTasks.length === 0) {
    lines.push(
      `  <text x="${fmt(chartX)}" y="${fmt(ganttPanelY + ganttHeaderH + 22)}" font-family="sans-serif" font-size="12" fill="${OKLCH_PALETTE.textMuted}">등록된 공정 작업이 없습니다.</text>`,
    );
  } else {
    lines.push(
      ...renderGanttRows({
        tasks: activeSchedule.scheduledTasks,
        movedTaskIds,
        chartX,
        chartW,
        startY: ganttPanelY + ganttHeaderH,
        rowH,
        scaleMaxHr,
      }),
    );
  }

  // 마감 기준 수직선
  const deadlineX = toX(activeSchedule.deadlineBudgetHr);
  lines.push(
    `  <line x1="${fmt(deadlineX)}" y1="${fmt(ganttPanelY + ganttHeaderH - 6)}" x2="${fmt(deadlineX)}" y2="${fmt(ganttPanelY + ganttPanelH - 8)}" stroke="${OKLCH_PALETTE.deadlineStroke}" stroke-width="2" stroke-dasharray="6 3" />`,
    `  <text x="${fmt(Math.min(widthPx - 44, Math.max(chartX + 36, deadlineX)))}" y="${fmt(ganttPanelY + 14)}" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="700" fill="${OKLCH_PALETTE.deadlineStroke}">마감 ${fmtHr(activeSchedule.deadlineBudgetHr)}h</text>`,
  );

  // 팀원 부하 비교 패널
  lines.push(...memberPanel.lines);

  // 범례 및 추정치 안내 푸터
  lines.push(
    `  <rect x="24" y="${fmt(footerY + 4)}" width="12" height="12" rx="2" fill="${STAGE_FILL_OKLCH["lineart-ink"]}" stroke="${OKLCH_PALETTE.criticalStroke}" stroke-width="2" />`,
    `  <text x="42" y="${fmt(footerY + 14)}" font-family="sans-serif" font-size="10" fill="${OKLCH_PALETTE.textPrimary}">임계 경로(여유 0h)</text>`,
    `  <rect x="160" y="${fmt(footerY + 6)}" width="16" height="8" rx="2" fill="${OKLCH_PALETTE.slackFill}" stroke="${OKLCH_PALETTE.slackStroke}" stroke-width="1" stroke-dasharray="3 2" />`,
    `  <text x="182" y="${fmt(footerY + 14)}" font-family="sans-serif" font-size="10" fill="${OKLCH_PALETTE.textPrimary}">여유 슬랙(Float)</text>`,
    `  <line x1="296" y1="${fmt(footerY + 10)}" x2="316" y2="${fmt(footerY + 10)}" stroke="${OKLCH_PALETTE.deadlineStroke}" stroke-width="2" stroke-dasharray="5 2" />`,
    `  <text x="322" y="${fmt(footerY + 14)}" font-family="sans-serif" font-size="10" fill="${OKLCH_PALETTE.textPrimary}">마감 기준선</text>`,
    `  <line x1="406" y1="${fmt(footerY + 10)}" x2="426" y2="${fmt(footerY + 10)}" stroke="${OKLCH_PALETTE.healthyLine}" stroke-width="2" stroke-dasharray="3 2" />`,
    `  <text x="432" y="${fmt(footerY + 14)}" font-family="sans-serif" font-size="10" fill="${OKLCH_PALETTE.textPrimary}">건강 운영 한계</text>`,
    `  <text x="24" y="${fmt(footerY + 34)}" font-family="sans-serif" font-size="10" fill="${OKLCH_PALETTE.textMuted}">※ 소요 시간과 마감 여유는 기준 공수·속도 계수 기반 추정치이며, 건강 한계는 비의료 공정 스케줄 운영 기준입니다.</text>`,
    `</svg>`,
  );

  return lines.join("\n");
}

/**
 * 번역투와 의료·진단 표현을 배제한 한국어 주간 연재 PD 공정 관리 브리프를 생성한다.
 */
export function summarizeEpisodeScheduleAuditKo(
  schedule: EpisodeCpmScheduleResult,
  rebalanceResult?: WorkloadRebalanceResult,
): string {
  const active = rebalanceResult && rebalanceResult.ok ? rebalanceResult.afterSchedule : schedule;
  const lines: string[] = [];

  lines.push(`[주간 연재 마감 공정 브리프] ${active.episodeTitleKo} (${active.episodeId})`);
  lines.push(
    "※ 본 수치는 입력된 기준 공수와 작업자 속도 계수로 계산한 모델 추정치입니다. 작업 한계 경보는 일정 조율용 운영 기준이며 현장 상황에 맞춰 조정하세요.",
  );

  if (!schedule.ok) {
    lines.push("");
    lines.push("■ 검증 결과: 일정 계산 중단 (Fail-Closed)");
    if (schedule.cycleDetected) {
      lines.push(`- 순환 의존성 감지: ${schedule.cycleTaskIds.join(", ")}`);
    }
    for (let i = 0; i < schedule.validationErrors.length; i += 1) {
      const err = schedule.validationErrors[i];
      if (err) lines.push(`- [${err.code}] ${err.detailKo}`);
    }
    lines.push(`- 스케줄 지문(SHA-256): ${schedule.manifestSha256Hex}`);
    return lines.join("\n");
  }

  const marginDesc =
    active.deadlineMarginHr >= 0
      ? `마감 여유 +${fmtHr(active.deadlineMarginHr)}시간`
      : `마감 초과 ${fmtHr(Math.abs(active.deadlineMarginHr))}시간`;

  lines.push("");
  lines.push(`■ 마감 판정: ${DEADLINE_STATUS_LABEL_KO[active.deadlineStatus]} (${marginDesc})`);
  lines.push(
    `- 예상 전체 완료 시간(Makespan): ${fmtHr(active.projectMakespanHr)}시간 / 마감 예산 ${fmtHr(active.deadlineBudgetHr)}시간`,
  );
  lines.push(
    `- 총 추정 투입 공수: ${fmtHr(active.totalEffectiveWorkHr)}시간 · 팀원 작업량 편차: ${fmtHr(active.loadSpreadHr)}시간`,
  );

  // 임계 경로 요약
  if (active.criticalPathTaskIds.length > 0) {
    const taskMap = new Map<string, ScheduledEpisodeTask>();
    for (let i = 0; i < active.scheduledTasks.length; i += 1) {
      const t = active.scheduledTasks[i];
      if (t) taskMap.set(t.taskId, t);
    }
    const pathText = active.criticalPathTaskIds
      .map((id) => {
        const t = taskMap.get(id);
        return t
          ? `${PRODUCTION_STAGE_LABELS_KO[t.stage]}(${t.cutRangeLabel}, ${t.assignedMemberNameKo}, ${fmtHr(t.effectiveDurationHr)}h)`
          : id;
      })
      .join(" → ");
    lines.push(`- 임계 경로(${active.criticalPathTaskIds.length}개 공정, 여유 0시간): ${pathText}`);
  } else {
    lines.push("- 등록된 공정 작업이 없어 임계 경로가 비어 있습니다.");
  }

  // 최종 24시간 크런치 점검
  lines.push("");
  lines.push(
    `■ 마감 전 최종 24시간 집중도: ${fmtPct(active.crunchWindow.final24hWorkShare)}% (${fmtHr(active.crunchWindow.workInFinal24hHr)}시간 / 전체 ${fmtHr(active.crunchWindow.totalEffectiveWorkHr)}시간)`,
  );
  if (active.crunchBottleneckDetected) {
    lines.push(
      "- [크런치 경보] 마감 전 마지막 24시간에 전체 작업의 40%를 초과하는 공정이 몰려 있습니다. 선행 공정 착수 시점을 앞당기거나 밑색·채색 구간을 분산하세요.",
    );
  } else {
    lines.push("- 마감 직전 24시간 작업 집중도가 40% 이하로 관리 범위 안쪽입니다.");
  }

  // 팀원 과부하 점검
  lines.push("");
  lines.push(`■ 팀원 공정 부하 점검 (${active.memberWorkloads.length}명)`);
  for (let i = 0; i < active.memberWorkloads.length; i += 1) {
    const m = active.memberWorkloads[i];
    if (!m) continue;
    const statusTag = m.isOverloaded ? `초과 +${fmtHr(m.overloadHours)}h` : "안정";
    lines.push(
      `- ${m.nameKo}: ${fmtHr(m.assignedEffectiveHours)}시간 / 운영 한계 ${fmtHr(m.healthyBudgetHr)}시간 (${fmtPct(m.utilizationRatio)}%, ${statusTag})`,
    );
  }
  if (active.burnoutOverloadAlerts.length > 0) {
    lines.push("- [과부하 경보] 아래 담당자의 예정 물량을 조정하세요:");
    for (let i = 0; i < active.burnoutOverloadAlerts.length; i += 1) {
      const alert = active.burnoutOverloadAlerts[i];
      if (alert) lines.push(`  · ${alert.messageKo}`);
    }
  } else {
    lines.push("- 모든 팀원의 예정 작업량이 주간 공정 건강 한계 이내입니다.");
  }

  // 부하 평준화 전/후 비교
  if (rebalanceResult) {
    lines.push("");
    lines.push("■ 어시스턴트 작업량 평준화 결과 (LPT + 완료시각 최소화)");
    lines.push(
      `- 완료 시간 변화: ${fmtHr(rebalanceResult.beforeMakespanHr)}시간 → ${fmtHr(rebalanceResult.afterMakespanHr)}시간 (${rebalanceResult.makespanSavedHr >= 0 ? `${fmtHr(rebalanceResult.makespanSavedHr)}시간 단축` : "변동 없음"})`,
    );
    lines.push(
      `- 팀원 작업량 편차 변화: ${fmtHr(rebalanceResult.beforeLoadSpreadHr)}시간 → ${fmtHr(rebalanceResult.afterLoadSpreadHr)}시간 (${fmtHr(Math.max(0, rebalanceResult.loadSpreadReducedHr))}시간 축소)`,
    );
    lines.push(
      `- 과부하 경보 인원: ${rebalanceResult.beforeOverloadCount}명 → ${rebalanceResult.afterOverloadCount}명${rebalanceResult.deadlineRecovered ? " · 지연 위험에서 기한 내 일정으로 회복됨" : ""}`,
    );
    if (rebalanceResult.reassignments.length > 0) {
      lines.push(`- 재배정 공정(${rebalanceResult.reassignments.length}건):`);
      for (let i = 0; i < rebalanceResult.reassignments.length; i += 1) {
        const move = rebalanceResult.reassignments[i];
        if (!move) continue;
        lines.push(
          `  · ${move.taskId} (${PRODUCTION_STAGE_SHORT_KO[move.stage]} · ${move.cutRangeLabel}): ${move.fromMemberNameKo} → ${move.toMemberNameKo} (${fmtHr(move.beforeDurationHr)}h → ${fmtHr(move.afterDurationHr)}h)`,
        );
      }
    } else {
      lines.push("- 현재 배정이 이미 균형 상태이거나 잠금·자격 조건으로 이동 가능한 공정이 없습니다.");
    }
  }

  lines.push("");
  lines.push(`- 스케줄 지문(SHA-256): ${active.manifestSha256Hex}`);
  return lines.join("\n");
}
