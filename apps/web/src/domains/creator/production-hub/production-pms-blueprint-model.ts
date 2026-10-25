/**
 * 웹툰 스튜디오 다중 어시스턴트 블루프린트 및 제작 관리(PMS) 클린룸 도메인 엔진
 *
 * REA 역공학 근거:
 * - Toonmate 맞춤 자동 캘린더 & 3D 에셋 라이선스 (ev_f4a6dd7ef8..., ev_438e7f105d...)
 * - CGWire Kitsu Status Automation, Breakdown Casting, Quotas, Durations vs Estimates
 *   (ev_bf59dc7215..., ev_e377fd67d9..., ev_3dc853dbf7..., ev_e3d0b3074a...)
 * - Notion Connected Projects 다중 뷰·롤업·종속성 시프트·담당자 권한 (ev_982b04625f...)
 */

export type WebtoonAssistantRole =
  | "lineart"
  | "flatting"
  | "shading"
  | "background-3d"
  | "retouch-lettering";

export type PmsTaskStatus =
  | "todo"
  | "ready"
  | "wip"
  | "wfa"
  | "retake"
  | "done";

export interface AssistantRoleMetadata {
  readonly role: WebtoonAssistantRole;
  readonly labelKo: string;
  readonly allowedExtensions: readonly string[];
  readonly requiredChecklist: readonly string[];
}

export const WEBTOON_ASSISTANT_ROLE_CATALOG: Readonly<
  Record<WebtoonAssistantRole, AssistantRoleMetadata>
> = {
  lineart: {
    role: "lineart",
    labelKo: "선화(Lineart)",
    allowedExtensions: ["clip", "psd"],
    requiredChecklist: [
      "벡터 선화 레이어 분리",
      "참조(등대) 레이어 지정 완료",
      "말풍선·콘티 러프 가이드 숨김 처리",
    ],
  },
  flatting: {
    role: "flatting",
    labelKo: "밑색(Flatting)",
    allowedExtensions: ["clip", "psd"],
    requiredChecklist: [
      "안티에일리어싱 해제(칼밑색 유지)",
      "캐릭터·의상·소품 파츠별 폴더 분리",
      "선화 레이어 원본 무결성 유지",
    ],
  },
  shading: {
    role: "shading",
    labelKo: "채색·명암(Shading)",
    allowedExtensions: ["clip", "psd"],
    requiredChecklist: [
      "밑색 상위 클리핑 마스크 구조 준수",
      "주광원·역광 레이어 블렌딩 모드(Multiply/Screen) 분리",
      "캐릭터 컬러시트 스포이드 일치 확인",
    ],
  },
  "background-3d": {
    role: "background-3d",
    labelKo: "배경·3D(Background)",
    allowedExtensions: ["clip", "psd", "skp", "cs3o"],
    requiredChecklist: [
      "3D LT 변환 외곽선·먹선 레이어 분리",
      "캐릭터 레이어 가림 마스크(전경/배경) 분리",
      "상업 연재용 라이선스 검증 완료",
    ],
  },
  "retouch-lettering": {
    role: "retouch-lettering",
    labelKo: "후보정·식자·이펙트(Retouch/FX)",
    allowedExtensions: ["clip", "psd", "png"],
    requiredChecklist: [
      "식자 텍스트 레이어 벡터 보존",
      "효과음(SFX) 및 그라데이션 맵 보정 폴더 분리",
      "연재 플랫폼 가로폭(720px/1080px) 규격 일치",
    ],
  },
};

// ============================================================================
// 1. 표준 파일 네이밍 검증기 & Kitsu형 Status Automation 엔진
// ============================================================================

export interface StudioHandoverFileSpec {
  readonly workCode: string;
  readonly episodeNumber: number;
  readonly cutStart: number;
  readonly cutEnd: number;
  readonly role: WebtoonAssistantRole;
  readonly version: number;
  readonly extension: string;
}

const HANDOVER_FILE_REGEX =
  /^([A-Z0-9]{2,12})_EP(\d{3})_CUT(\d{3})-(\d{3})_(lineart|flatting|shading|background-3d|retouch-lettering)_v(\d{2})\.([a-z0-9]+)$/u;

export function formatStudioHandoverFileName(spec: StudioHandoverFileSpec): string {
  const code = spec.workCode.trim().toUpperCase().replace(/[^A-Z0-9]/gu, "") || "WORK";
  const ep = String(Math.max(1, Math.trunc(spec.episodeNumber))).padStart(3, "0");
  const start = String(Math.max(1, Math.trunc(spec.cutStart))).padStart(3, "0");
  const end = String(Math.max(spec.cutStart, Math.trunc(spec.cutEnd))).padStart(3, "0");
  const ver = String(Math.max(1, Math.trunc(spec.version))).padStart(2, "0");
  const ext = spec.extension.trim().toLowerCase().replace(/^\./u, "");
  return `${code}_EP${ep}_CUT${start}-${end}_${spec.role}_v${ver}.${ext}`;
}

export function parseStudioHandoverFileName(fileName: string): StudioHandoverFileSpec | null {
  const match = HANDOVER_FILE_REGEX.exec(fileName.trim());
  if (!match) return null;
  const [, workCode, epStr, startStr, endStr, roleStr, verStr, ext] = match;
  if (!workCode || !epStr || !startStr || !endStr || !roleStr || !verStr || !ext) return null;
  const cutStart = Number.parseInt(startStr, 10);
  const cutEnd = Number.parseInt(endStr, 10);
  if (cutEnd < cutStart) return null;
  return {
    workCode,
    episodeNumber: Number.parseInt(epStr, 10),
    cutStart,
    cutEnd,
    role: roleStr as WebtoonAssistantRole,
    version: Number.parseInt(verStr, 10),
    extension: ext,
  };
}

export interface HandoverValidationResult {
  readonly valid: boolean;
  readonly parsed: StudioHandoverFileSpec | null;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export function validateStudioHandoverPackage(input: {
  readonly fileName: string;
  readonly expectedRole: WebtoonAssistantRole;
  readonly latestExistingVersion: number;
  readonly checkedChecklistItems: readonly string[];
}): HandoverValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = parseStudioHandoverFileName(input.fileName);
  const roleMeta = WEBTOON_ASSISTANT_ROLE_CATALOG[input.expectedRole];

  if (!parsed) {
    errors.push(
      "표준 파일명 규칙({작품코드}_EP{회차3자리}_CUT{시작3자리}-{끝3자리}_{공정}_v{버전2자리}.{확장자})에 맞지 않습니다.",
    );
  } else {
    if (parsed.role !== input.expectedRole) {
      errors.push(`파일명 공정(${parsed.role})이 현재 인계 슬롯 공정(${input.expectedRole})과 다릅니다.`);
    }
    if (!roleMeta.allowedExtensions.includes(parsed.extension)) {
      errors.push(
        `${roleMeta.labelKo} 공정은 [${roleMeta.allowedExtensions.join(", ")}] 확장자만 허용합니다 (현재: .${parsed.extension}).`,
      );
    }
    if (parsed.version <= input.latestExistingVersion) {
      warnings.push(
        `버전 역전/중복 주의: 현재 최신 버전(v${String(input.latestExistingVersion).padStart(2, "0")}) 이하인 v${String(parsed.version).padStart(2, "0")} 파일입니다.`,
      );
    }
  }

  const missingChecklist = roleMeta.requiredChecklist.filter(
    (item) => !input.checkedChecklistItems.includes(item),
  );
  if (missingChecklist.length > 0) {
    errors.push(`인계 필수 체크리스트 미완료(${missingChecklist.length}건): ${missingChecklist.join(", ")}`);
  }

  return {
    valid: errors.length === 0,
    parsed,
    errors,
    warnings,
  };
}

export interface StatusAutomationRule {
  readonly id: string;
  readonly triggerMode: "status" | "ready-for";
  readonly sourceRole: WebtoonAssistantRole;
  readonly sourceTriggerStatus: PmsTaskStatus;
  readonly targetRole: WebtoonAssistantRole;
  readonly targetAppliedStatus: PmsTaskStatus;
  readonly copyLatestPreview: boolean;
}

export interface AssistantCutTaskItem {
  readonly id: string;
  readonly episodeNumber: number;
  readonly cutRangeLabel: string;
  readonly cutCount: number;
  readonly role: WebtoonAssistantRole;
  readonly assigneeId: string;
  readonly assigneeName: string;
  readonly status: PmsTaskStatus;
  readonly dueDateIso: string;
  readonly dependencyTaskIds: readonly string[];
  readonly latestFileName: string | null;
  readonly latestPreviewUrl: string | null;
  readonly inputFileName: string | null;
  readonly inputPreviewUrl: string | null;
  readonly readyForRole: WebtoonAssistantRole | null;
}

export function detectStatusAutomationCycles(
  rules: readonly StatusAutomationRule[],
): readonly string[] {
  const adjacency = new Map<WebtoonAssistantRole, Set<WebtoonAssistantRole>>();
  for (const rule of rules) {
    const set = adjacency.get(rule.sourceRole) ?? new Set<WebtoonAssistantRole>();
    set.add(rule.targetRole);
    adjacency.set(rule.sourceRole, set);
  }

  const cycleDescriptions: string[] = [];
  for (const startRole of adjacency.keys()) {
    const visited = new Set<WebtoonAssistantRole>();
    const stack: WebtoonAssistantRole[] = [startRole];
    while (stack.length > 0) {
      const current = stack.pop()!;
      const nextRoles = adjacency.get(current);
      if (!nextRoles) continue;
      for (const next of nextRoles) {
        if (next === startRole) {
          cycleDescriptions.push(`${startRole} ↔ ${current}`);
        } else if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      }
    }
  }
  return [...new Set(cycleDescriptions)];
}

export function evaluateStatusAutomationRules(input: {
  readonly tasks: readonly AssistantCutTaskItem[];
  readonly rules: readonly StatusAutomationRule[];
  readonly changedTaskId: string;
  readonly nextStatus: PmsTaskStatus;
  readonly nextReadyForRole?: WebtoonAssistantRole | null;
}): {
  readonly updatedTasks: readonly AssistantCutTaskItem[];
  readonly triggeredRuleIds: readonly string[];
  readonly handoffSummaries: readonly string[];
} {
  const sourceTask = input.tasks.find((t) => t.id === input.changedTaskId);
  if (!sourceTask) {
    return { updatedTasks: input.tasks, triggeredRuleIds: [], handoffSummaries: [] };
  }

  const updatedSource: AssistantCutTaskItem = {
    ...sourceTask,
    status: input.nextStatus,
    readyForRole:
      input.nextReadyForRole !== undefined ? input.nextReadyForRole : sourceTask.readyForRole,
  };

  const matchedRules = input.rules.filter((rule) => {
    if (rule.sourceRole !== updatedSource.role) return false;
    if (rule.triggerMode === "status") {
      return updatedSource.status === rule.sourceTriggerStatus;
    }
    return updatedSource.readyForRole === rule.targetRole;
  });

  const triggeredRuleIds: string[] = [];
  const handoffSummaries: string[] = [];

  const updatedTasks = input.tasks.map((task) => {
    if (task.id === updatedSource.id) return updatedSource;
    if (
      task.episodeNumber !== updatedSource.episodeNumber ||
      task.cutRangeLabel !== updatedSource.cutRangeLabel
    ) {
      return task;
    }

    const rule = matchedRules.find((r) => r.targetRole === task.role);
    if (!rule) return task;

    triggeredRuleIds.push(rule.id);
    const nextInputFile = rule.copyLatestPreview
      ? updatedSource.latestFileName ?? task.inputFileName
      : task.inputFileName;
    const nextInputPreview = rule.copyLatestPreview
      ? updatedSource.latestPreviewUrl ?? task.inputPreviewUrl
      : task.inputPreviewUrl;

    handoffSummaries.push(
      `[${updatedSource.episodeNumber}화 ${updatedSource.cutRangeLabel}] ${WEBTOON_ASSISTANT_ROLE_CATALOG[updatedSource.role].labelKo}(${updatedSource.status}) → ${WEBTOON_ASSISTANT_ROLE_CATALOG[task.role].labelKo} 상태 '${rule.targetAppliedStatus}' 자동 전이${rule.copyLatestPreview && nextInputFile ? ` (인계 파일: ${nextInputFile})` : ""}`,
    );

    return {
      ...task,
      status: rule.targetAppliedStatus,
      inputFileName: nextInputFile,
      inputPreviewUrl: nextInputPreview,
    };
  });

  return { updatedTasks, triggeredRuleIds, handoffSummaries };
}

// ============================================================================
// 2. Toonmate형 맞춤 자동 역산 캘린더 & 세이브 원고 버퍼 시뮬레이터
// ============================================================================

export interface AssistantStageSpeedSpec {
  readonly role: WebtoonAssistantRole;
  readonly minutesPerCut: number;
  readonly dailyWorkHours: number;
  readonly stageOrderGroup: number;
}

export interface ReverseScheduledStageSlot {
  readonly role: WebtoonAssistantRole;
  readonly labelKo: string;
  readonly stageOrderGroup: number;
  readonly requiredHours: number;
  readonly requiredWorkDays: number;
  readonly startDateIso: string;
  readonly dueDateIso: string;
  readonly isCriticalPath: boolean;
}

export interface ReverseEpisodeScheduleResult {
  readonly releaseDateIso: string;
  readonly cutCount: number;
  readonly earliestKickoffDateIso: string;
  readonly totalWorkDaysOnCriticalPath: number;
  readonly slackWorkDaysFromToday: number;
  readonly scheduleRisk: "healthy" | "tight" | "overdue";
  readonly stageSlots: readonly ReverseScheduledStageSlot[];
}

export function parseIsoDateUtc(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map((v) => Number.parseInt(v, 10));
  return new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1));
}

export function formatIsoDateUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isWorkingDayUtc(
  date: Date,
  includeWeekends: boolean,
  holidaysSet: ReadonlySet<string>,
): boolean {
  const iso = formatIsoDateUtc(date);
  if (holidaysSet.has(iso)) return false;
  if (includeWeekends) return true;
  const day = date.getUTCDay();
  return day !== 0 && day !== 6;
}

export function stepWorkingDaysBackward(
  anchorIso: string,
  workDaysToSubtract: number,
  includeWeekends: boolean,
  holidaysSet: ReadonlySet<string>,
): string {
  const cursor = parseIsoDateUtc(anchorIso);
  while (!isWorkingDayUtc(cursor, includeWeekends, holidaysSet)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  let remaining = Math.max(0, Math.trunc(workDaysToSubtract));
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (isWorkingDayUtc(cursor, includeWeekends, holidaysSet)) {
      remaining -= 1;
    }
  }
  return formatIsoDateUtc(cursor);
}

export function stepWorkingDaysForward(
  anchorIso: string,
  workDaysToAdd: number,
  includeWeekends: boolean,
  holidaysSet: ReadonlySet<string>,
): string {
  const cursor = parseIsoDateUtc(anchorIso);
  while (!isWorkingDayUtc(cursor, includeWeekends, holidaysSet)) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  let remaining = Math.max(0, Math.trunc(workDaysToAdd));
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isWorkingDayUtc(cursor, includeWeekends, holidaysSet)) {
      remaining -= 1;
    }
  }
  return formatIsoDateUtc(cursor);
}

export function countWorkingDaysBetween(
  fromIso: string,
  toIso: string,
  includeWeekends: boolean,
  holidaysSet: ReadonlySet<string>,
): number {
  const from = parseIsoDateUtc(fromIso);
  const to = parseIsoDateUtc(toIso);
  if (to.getTime() < from.getTime()) {
    return -countWorkingDaysBetween(toIso, fromIso, includeWeekends, holidaysSet);
  }
  const cursor = new Date(from.getTime());
  let count = 0;
  while (cursor.getTime() < to.getTime()) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isWorkingDayUtc(cursor, includeWeekends, holidaysSet)) {
      count += 1;
    }
  }
  return count;
}

export function calculateReverseEpisodeSchedule(input: {
  readonly releaseDateIso: string;
  readonly todayIso: string;
  readonly cutCount: number;
  readonly includeWeekends: boolean;
  readonly holidaysIso?: readonly string[];
  readonly stageSpecs: readonly AssistantStageSpeedSpec[];
}): ReverseEpisodeScheduleResult {
  const holidaysSet = new Set(input.holidaysIso ?? []);
  const safeCutCount = Math.max(1, Math.trunc(input.cutCount));

  const groups = [...new Set(input.stageSpecs.map((s) => s.stageOrderGroup))].sort(
    (a, b) => b - a,
  );

  let currentGroupDueIso = stepWorkingDaysBackward(
    input.releaseDateIso,
    0,
    input.includeWeekends,
    holidaysSet,
  );
  const stageSlotsReversed: ReverseScheduledStageSlot[] = [];
  let totalCriticalDays = 0;

  for (const groupOrder of groups) {
    const specsInGroup = input.stageSpecs.filter((s) => s.stageOrderGroup === groupOrder);
    const computed = specsInGroup.map((spec) => {
      const requiredHours =
        Math.round(((safeCutCount * Math.max(1, spec.minutesPerCut)) / 60) * 10) / 10;
      const dailyHours = Math.max(1, spec.dailyWorkHours);
      const requiredWorkDays = Math.max(1, Math.ceil(requiredHours / dailyHours));
      return { spec, requiredHours, requiredWorkDays };
    });

    const maxGroupDays = Math.max(...computed.map((c) => c.requiredWorkDays), 1);
    totalCriticalDays += maxGroupDays;

    for (const item of computed) {
      const startDateIso = stepWorkingDaysBackward(
        currentGroupDueIso,
        item.requiredWorkDays - 1,
        input.includeWeekends,
        holidaysSet,
      );
      stageSlotsReversed.push({
        role: item.spec.role,
        labelKo: WEBTOON_ASSISTANT_ROLE_CATALOG[item.spec.role].labelKo,
        stageOrderGroup: groupOrder,
        requiredHours: item.requiredHours,
        requiredWorkDays: item.requiredWorkDays,
        startDateIso,
        dueDateIso: currentGroupDueIso,
        isCriticalPath: item.requiredWorkDays === maxGroupDays,
      });
    }

    currentGroupDueIso = stepWorkingDaysBackward(
      currentGroupDueIso,
      maxGroupDays,
      input.includeWeekends,
      holidaysSet,
    );
  }

  const stageSlots = [...stageSlotsReversed].sort(
    (a, b) => a.stageOrderGroup - b.stageOrderGroup,
  );
  const earliestKickoffDateIso =
    stageSlots.reduce<string | null>(
      (min, slot) => (min === null || slot.startDateIso < min ? slot.startDateIso : min),
      null,
    ) ?? input.releaseDateIso;

  const slackWorkDaysFromToday = countWorkingDaysBetween(
    input.todayIso,
    earliestKickoffDateIso,
    input.includeWeekends,
    holidaysSet,
  );

  const scheduleRisk: "healthy" | "tight" | "overdue" =
    slackWorkDaysFromToday < 0
      ? "overdue"
      : slackWorkDaysFromToday <= 2
        ? "tight"
        : "healthy";

  return {
    releaseDateIso: input.releaseDateIso,
    cutCount: safeCutCount,
    earliestKickoffDateIso,
    totalWorkDaysOnCriticalPath: totalCriticalDays,
    slackWorkDaysFromToday,
    scheduleRisk,
    stageSlots,
  };
}

export interface BufferSimulationPoint {
  readonly weekNumber: number;
  readonly remainingBufferEpisodes: number;
  readonly status: "safe" | "warning" | "depleted";
}

export function simulateSerializationBufferHealth(input: {
  readonly initialBufferEpisodes: number;
  readonly weeklyReleaseEpisodes: number;
  readonly weeklyTeamCapacityEpisodes: number;
  readonly safetyThresholdEpisodes: number;
  readonly weeksToSimulate: number;
}): {
  readonly points: readonly BufferSimulationPoint[];
  readonly firstWarningWeek: number | null;
  readonly firstDepletedWeek: number | null;
} {
  const points: BufferSimulationPoint[] = [];
  let current = input.initialBufferEpisodes;
  let firstWarningWeek: number | null = null;
  let firstDepletedWeek: number | null = null;

  for (let week = 1; week <= Math.max(1, input.weeksToSimulate); week += 1) {
    current =
      Math.round(
        (current + input.weeklyTeamCapacityEpisodes - input.weeklyReleaseEpisodes) * 100,
      ) / 100;
    const clamped = Math.max(0, current);
    const status: "safe" | "warning" | "depleted" =
      current <= 0
        ? "depleted"
        : current < input.safetyThresholdEpisodes
          ? "warning"
          : "safe";
    if (status === "warning" && firstWarningWeek === null) firstWarningWeek = week;
    if (status === "depleted" && firstDepletedWeek === null) {
      firstDepletedWeek = week;
      if (firstWarningWeek === null) firstWarningWeek = week;
    }
    points.push({ weekNumber: week, remainingBufferEpisodes: clamped, status });
  }

  return { points, firstWarningWeek, firstDepletedWeek };
}

export * from "./production-pms-casting-quota-model";
