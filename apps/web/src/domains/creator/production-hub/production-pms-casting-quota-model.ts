/**
 * 웹툰 스튜디오 PMS 블루프린트 하위 엔진:
 * - 에셋 브레이크다운·캐스팅 & 라이선스 가드 (Kitsu + Toonmate)
 * - 일일 생산량 쿼터(Quotas) & 예상 대비 실투입 공수(Bid vs Actual) 분석 (Kitsu)
 * - 노션(Notion)형 연결 데이터베이스 다중 뷰·롤업 집계 & 종속성 자동 시프트
 */

import type {
  AssistantCutTaskItem,
  WebtoonAssistantRole,
} from "./production-pms-blueprint-model";
import {
  countWorkingDaysBetween,
  formatIsoDateUtc,
  parseIsoDateUtc,
  stepWorkingDaysForward,
} from "./production-pms-blueprint-model";

// ============================================================================
// 3. Kitsu + Toonmate 에셋 브레이크다운·캐스팅 & 라이선스 가드 엔진
// ============================================================================

export type StudioAssetCategory = "character-sheet" | "background-3d" | "prop" | "brush-sfx";
export type StudioAssetLicenseTier = "pitch-50off" | "commercial-serialization" | "studio-owned";

export interface StudioProductionAsset {
  readonly id: string;
  readonly name: string;
  readonly category: StudioAssetCategory;
  readonly status: "wip" | "approved";
  readonly licenseTier: StudioAssetLicenseTier;
  readonly formats: readonly ("skp" | "cs3o" | "clip" | "png")[];
  readonly aiTrainingRestricted: boolean;
  readonly isGlobalLibraryAsset: boolean;
}

export interface CutAssetCastingEntry {
  readonly cutId: string;
  readonly assetId: string;
  readonly quantity: number;
}

export function adjustCutAssetCasting(
  castings: readonly CutAssetCastingEntry[],
  cutId: string,
  assetId: string,
  delta: 1 | 10 | -1,
): readonly CutAssetCastingEntry[] {
  const existing = castings.find((c) => c.cutId === cutId && c.assetId === assetId);
  if (!existing) {
    if (delta <= 0) return castings;
    return [...castings, { cutId, assetId, quantity: delta }];
  }
  const nextQty = existing.quantity + delta;
  if (nextQty <= 0) {
    return castings.filter((c) => !(c.cutId === cutId && c.assetId === assetId));
  }
  return castings.map((c) =>
    c.cutId === cutId && c.assetId === assetId ? { ...c, quantity: nextQty } : c,
  );
}

export function bulkCastAssetToCutRange(
  castings: readonly CutAssetCastingEntry[],
  cutIds: readonly string[],
  assetId: string,
  quantityPerCut = 1,
): readonly CutAssetCastingEntry[] {
  let next = [...castings];
  const safeQty = Math.max(1, Math.trunc(quantityPerCut));
  for (const cutId of cutIds) {
    const idx = next.findIndex((c) => c.cutId === cutId && c.assetId === assetId);
    if (idx >= 0) {
      next[idx] = { cutId, assetId, quantity: safeQty };
    } else {
      next = [...next, { cutId, assetId, quantity: safeQty }];
    }
  }
  return next;
}

export function copyCutCastingToTargets(
  castings: readonly CutAssetCastingEntry[],
  sourceCutId: string,
  targetCutIds: readonly string[],
): readonly CutAssetCastingEntry[] {
  const sourceItems = castings.filter((c) => c.cutId === sourceCutId);
  const targetSet = new Set(targetCutIds.filter((id) => id !== sourceCutId));
  const retained = castings.filter((c) => !targetSet.has(c.cutId));
  const copied: CutAssetCastingEntry[] = [];
  for (const targetCutId of targetSet) {
    for (const item of sourceItems) {
      copied.push({ cutId: targetCutId, assetId: item.assetId, quantity: item.quantity });
    }
  }
  return [...retained, ...copied];
}

export interface AssetCastingDiagnostic {
  readonly blockedCutIds: readonly string[];
  readonly licenseViolationAssetIds: readonly string[];
  readonly unapprovedAssetIds: readonly string[];
  readonly warnings: readonly string[];
}

export function evaluateEpisodeAssetReadinessAndLicense(input: {
  readonly castings: readonly CutAssetCastingEntry[];
  readonly assets: readonly StudioProductionAsset[];
  readonly episodePublicationMode: "pitch" | "commercial-serialization";
}): AssetCastingDiagnostic {
  const assetById = new Map(input.assets.map((a) => [a.id, a]));
  const blockedCuts = new Set<string>();
  const licenseViolations = new Set<string>();
  const unapprovedAssets = new Set<string>();
  const warnings: string[] = [];

  for (const entry of input.castings) {
    if (entry.quantity <= 0) continue;
    const asset = assetById.get(entry.assetId);
    if (!asset) continue;

    if (asset.status !== "approved") {
      blockedCuts.add(entry.cutId);
      unapprovedAssets.add(asset.id);
    }
    if (
      input.episodePublicationMode === "commercial-serialization" &&
      asset.licenseTier === "pitch-50off"
    ) {
      blockedCuts.add(entry.cutId);
      licenseViolations.add(asset.id);
    }
  }

  for (const id of unapprovedAssets) {
    const asset = assetById.get(id);
    if (asset) warnings.push(`미승인 에셋 '${asset.name}'(으)로 인해 캐스팅된 컷 진행이 보류됩니다.`);
  }
  for (const id of licenseViolations) {
    const asset = assetById.get(id);
    if (asset) {
      warnings.push(
        `'${asset.name}' 에셋은 현재 [투고용 50% 할인권] 상태입니다. 정식 연재 원고 발행 전 [정식 연재 추가 이용권] 전환이 필수입니다.`,
      );
    }
  }

  return {
    blockedCutIds: [...blockedCuts],
    licenseViolationAssetIds: [...licenseViolations],
    unapprovedAssetIds: [...unapprovedAssets],
    warnings,
  };
}

export function exportAssetBreakdownCsv(
  castings: readonly CutAssetCastingEntry[],
  assets: readonly StudioProductionAsset[],
): string {
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const header = "cut_id,asset_id,asset_name,category,quantity,license_tier,formats";
  const rows = castings.map((c) => {
    const asset = assetById.get(c.assetId);
    const name = (asset?.name ?? c.assetId).replace(/"/gu, '""');
    const category = asset?.category ?? "unknown";
    const license = asset?.licenseTier ?? "unknown";
    const formats = asset ? asset.formats.join("|") : "";
    return `${c.cutId},${c.assetId},"${name}",${category},${c.quantity},${license},"${formats}"`;
  });
  return [header, ...rows].join("\n");
}

// ============================================================================
// 4. Kitsu형 Quotas (Timesheet vs WIP→WFA First-Take) & Bid vs Actual 분석기
// ============================================================================

export interface AssistantQuotaTaskLog {
  readonly taskId: string;
  readonly assigneeId: string;
  readonly assigneeName: string;
  readonly role: WebtoonAssistantRole;
  readonly cutCount: number;
  readonly bidHours: number;
  readonly firstWipDateIso: string;
  readonly firstWfaDateIso: string;
  readonly timesheetHoursByDate: Readonly<Record<string, number>>;
}

export interface AssistantQuotaSummary {
  readonly assigneeId: string;
  readonly assigneeName: string;
  readonly role: WebtoonAssistantRole;
  readonly mode: "timesheet-weighted" | "status-first-take";
  readonly totalCompletedCuts: number;
  readonly activeDaysCount: number;
  readonly averageDailyCuts: number;
  readonly targetDailyCuts: number;
  readonly quotaAchievementPercent: number;
  readonly bidPersonDays: number;
  readonly actualPersonDays: number;
  readonly variancePersonDays: number;
  readonly estimationHealth: "on-track" | "overrun" | "underrun";
}

export function computeAssistantQuotasAndVariance(input: {
  readonly logs: readonly AssistantQuotaTaskLog[];
  readonly mode: "timesheet-weighted" | "status-first-take";
  readonly targetDailyCuts: number;
  readonly hoursPerPersonDay?: number;
}): readonly AssistantQuotaSummary[] {
  const hoursPerDay = Math.max(1, input.hoursPerPersonDay ?? 8);
  const byAssignee = new Map<string, AssistantQuotaTaskLog[]>();

  for (const log of input.logs) {
    const list = byAssignee.get(log.assigneeId) ?? [];
    list.push(log);
    byAssignee.set(log.assigneeId, list);
  }

  const summaries: AssistantQuotaSummary[] = [];

  for (const [assigneeId, tasks] of byAssignee.entries()) {
    const first = tasks[0]!;
    const dailyCutMap = new Map<string, number>();
    let totalBidHours = 0;
    let totalActualHours = 0;
    let totalCompletedCuts = 0;

    for (const task of tasks) {
      totalCompletedCuts += task.cutCount;
      totalBidHours += task.bidHours;
      const loggedEntries = Object.entries(task.timesheetHoursByDate).filter(([, h]) => h > 0);
      const taskActualHours = loggedEntries.reduce((sum, [, h]) => sum + h, 0);
      totalActualHours += taskActualHours;

      if (input.mode === "timesheet-weighted" && taskActualHours > 0) {
        for (const [dateIso, hours] of loggedEntries) {
          const weightedCuts = task.cutCount * (hours / taskActualHours);
          dailyCutMap.set(dateIso, (dailyCutMap.get(dateIso) ?? 0) + weightedCuts);
        }
      } else {
        const spanDays =
          Math.max(
            0,
            countWorkingDaysBetween(task.firstWipDateIso, task.firstWfaDateIso, false, new Set()),
          ) + 1;
        const perDayCuts = task.cutCount / spanDays;
        let cursor = task.firstWipDateIso;
        for (let i = 0; i < spanDays; i += 1) {
          dailyCutMap.set(cursor, (dailyCutMap.get(cursor) ?? 0) + perDayCuts);
          cursor = stepWorkingDaysForward(cursor, 1, false, new Set());
        }
      }
    }

    const activeDaysCount = Math.max(1, dailyCutMap.size);
    const averageDailyCuts = Math.round((totalCompletedCuts / activeDaysCount) * 10) / 10;
    const safeTarget = Math.max(1, input.targetDailyCuts);
    const quotaAchievementPercent = Math.round((averageDailyCuts / safeTarget) * 100);

    const bidPersonDays = Math.round((totalBidHours / hoursPerDay) * 10) / 10;
    const actualPersonDays = Math.round((totalActualHours / hoursPerDay) * 10) / 10;
    const variancePersonDays = Math.round((actualPersonDays - bidPersonDays) * 10) / 10;

    const estimationHealth: "on-track" | "overrun" | "underrun" =
      variancePersonDays > 0.5
        ? "overrun"
        : variancePersonDays < -0.5
          ? "underrun"
          : "on-track";

    summaries.push({
      assigneeId,
      assigneeName: first.assigneeName,
      role: first.role,
      mode: input.mode,
      totalCompletedCuts,
      activeDaysCount,
      averageDailyCuts,
      targetDailyCuts: safeTarget,
      quotaAchievementPercent,
      bidPersonDays,
      actualPersonDays,
      variancePersonDays,
      estimationHealth,
    });
  }

  return summaries;
}

// ============================================================================
// 5. Notion형 연결 데이터베이스 다중 뷰·롤업 집계 & 종속성 자동 시프트
// ============================================================================

export type NotionDatabaseViewKind = "table" | "kanban" | "timeline" | "assistant-matrix";

export interface NotionDatabaseProjection {
  readonly view: NotionDatabaseViewKind;
  readonly filteredTasks: readonly (AssistantCutTaskItem & { readonly canEditRow: boolean })[];
  readonly rollup: {
    readonly totalTasks: number;
    readonly totalCuts: number;
    readonly completedCuts: number;
    readonly cutCompletionPercent: number;
    readonly readyOrWipCount: number;
    readonly wfaReviewQueueCount: number;
  };
}

export function projectNotionProductionDatabase(input: {
  readonly tasks: readonly AssistantCutTaskItem[];
  readonly view: NotionDatabaseViewKind;
  readonly roleFilter: WebtoonAssistantRole | "all";
  readonly viewerId: string;
  readonly isLeadOrPd: boolean;
}): NotionDatabaseProjection {
  const filtered = input.tasks
    .filter((t) => input.roleFilter === "all" || t.role === input.roleFilter)
    .map((task) => ({
      ...task,
      canEditRow: input.isLeadOrPd || task.assigneeId === input.viewerId,
    }));

  const totalCuts = filtered.reduce((sum, t) => sum + t.cutCount, 0);
  const completedCuts = filtered
    .filter((t) => t.status === "done")
    .reduce((sum, t) => sum + t.cutCount, 0);
  const cutCompletionPercent =
    totalCuts > 0 ? Math.round((completedCuts / totalCuts) * 100) : 0;

  return {
    view: input.view,
    filteredTasks: filtered,
    rollup: {
      totalTasks: filtered.length,
      totalCuts,
      completedCuts,
      cutCompletionPercent,
      readyOrWipCount: filtered.filter((t) => t.status === "ready" || t.status === "wip").length,
      wfaReviewQueueCount: filtered.filter((t) => t.status === "wfa").length,
    },
  };
}

export function shiftDependentAssistantTasks(input: {
  readonly tasks: readonly AssistantCutTaskItem[];
  readonly anchorTaskId: string;
  readonly deltaDays: number;
}): readonly AssistantCutTaskItem[] {
  if (input.deltaDays === 0) return input.tasks;

  const affectedIds = new Set<string>([input.anchorTaskId]);
  let added = true;
  while (added) {
    added = false;
    for (const task of input.tasks) {
      if (affectedIds.has(task.id)) continue;
      if (task.dependencyTaskIds.some((depId) => affectedIds.has(depId))) {
        affectedIds.add(task.id);
        added = true;
      }
    }
  }

  return input.tasks.map((task) => {
    if (!affectedIds.has(task.id)) return task;
    const date = parseIsoDateUtc(task.dueDateIso);
    date.setUTCDate(date.getUTCDate() + input.deltaDays);
    return {
      ...task,
      dueDateIso: formatIsoDateUtc(date),
    };
  });
}
