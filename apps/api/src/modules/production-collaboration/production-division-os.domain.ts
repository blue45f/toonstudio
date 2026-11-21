import { createHash } from "node:crypto";

import type { ProductionQaRedlineStroke } from "../../platform/database/schema/production-division-os.schema";
import type {
  DivisionLayerFolder,
  DivisionLedgerStatus,
  DivisionQaVerdict,
  DivisionRoleCode,
  DivisionSettlementModel,
  DivisionSliceStatus,
  DivisionStageCode,
  DivisionTeamPreset,
  PartitionEpisodeSlicesInput,
} from "./production-division-os.dto";

export type DivisionOsActorRole = DivisionRoleCode | "viewer";

export interface DivisionOsActorAccess {
  readonly actorUserId: string;
  readonly projectId: string;
  readonly view: boolean;
  readonly edit: boolean;
  readonly isPd: boolean;
  readonly isAd: boolean;
  readonly roleCodes: readonly DivisionOsActorRole[];
}

export interface CutSliceRecord {
  readonly id: string;
  readonly projectId: string;
  readonly episodeId: string;
  readonly stageCode: DivisionStageCode;
  readonly cutStart: number;
  readonly cutEnd: number;
  readonly allowedFolders: readonly DivisionLayerFolder[];
  readonly assigneeUserId: string | null;
  readonly status: DivisionSliceStatus;
  readonly leaseExpiresAt: string | null;
  readonly latestRevHash: string | null;
  readonly dueAt: string | null;
  readonly updatedAt: string;
}

export interface CutSliceView extends CutSliceRecord {
  readonly cutCount: number;
  readonly contextCutBefore: number | null;
  readonly contextCutAfter: number | null;
}

export interface BinaryLockRecord {
  readonly assetKey: string;
  readonly projectId: string;
  readonly holderUserId: string;
  readonly lockReason: string;
  readonly lockedAt: string;
  readonly expiresAt: string;
}

export interface QaInspectionRecord {
  readonly id: string;
  readonly cutSliceId: string;
  readonly revisionHash: string;
  readonly paletteDriftMax: number;
  readonly lineWidthCv: number;
  readonly mobile375Ok: boolean;
  readonly rightsBomOk: boolean;
  readonly redlineStrokes: readonly ProductionQaRedlineStroke[];
  readonly verdict: DivisionQaVerdict;
  readonly reviewerUserId: string;
  readonly createdAt: string;
}

export interface RoyaltyLedgerRecord {
  readonly id: string;
  readonly projectId: string;
  readonly episodeId: string;
  readonly payeeUserId: string;
  readonly roleCode: DivisionRoleCode;
  readonly settlementModel: DivisionSettlementModel;
  readonly approvedCuts: number;
  readonly baseAmountKrw: number;
  readonly royaltyBps: number;
  readonly mgBalanceKrw: number;
  readonly status: DivisionLedgerStatus;
  readonly settledAt: string | null;
}

export const AD_PALETTE_DRIFT_MAX_THRESHOLD = 3.5;
export const AD_LINE_WIDTH_CV_MAX_THRESHOLD = 0.18;
export const AD_COLORSCRIPT_MOOD_DRIFT_MAX_THRESHOLD = 0.25;

export const STAGE_DEFAULT_ROLE: Readonly<Record<DivisionStageCode, DivisionRoleCode>> = Object.freeze({
  script: "writer",
  storyboard: "storyboard",
  bg3d: "bg3d",
  line: "line",
  flat: "flat",
  shade: "shade",
  fx: "finishing_lettering",
  lettering: "finishing_lettering",
  qa_final: "art_director",
});

const STUDIO_9_ROLE_FOLDERS: Readonly<Record<DivisionStageCode, readonly DivisionLayerFolder[]>> =
  Object.freeze({
    script: ["00_CONTI"],
    storyboard: ["00_CONTI"],
    bg3d: ["10_BG3D"],
    line: ["20_LINE"],
    flat: ["30_FLAT"],
    shade: ["40_SHADE"],
    fx: ["50_FX"],
    lettering: ["60_LETTERING"],
    qa_final: ["99_AD_REDLINE"],
  });

const DUO_LINE_COLOR_FOLDERS: Readonly<Record<DivisionStageCode, readonly DivisionLayerFolder[]>> =
  Object.freeze({
    script: ["00_CONTI"],
    storyboard: ["00_CONTI", "20_LINE"],
    bg3d: ["10_BG3D"],
    line: ["00_CONTI", "20_LINE", "60_LETTERING"],
    flat: ["30_FLAT", "40_SHADE", "50_FX"],
    shade: ["30_FLAT", "40_SHADE", "50_FX"],
    fx: ["50_FX", "60_LETTERING"],
    lettering: ["60_LETTERING"],
    qa_final: ["99_AD_REDLINE"],
  });

const SOLO_PLUS_BG_FOLDERS: Readonly<Record<DivisionStageCode, readonly DivisionLayerFolder[]>> =
  Object.freeze({
    script: ["00_CONTI"],
    storyboard: ["00_CONTI"],
    bg3d: ["10_BG3D"],
    line: ["00_CONTI", "20_LINE", "30_FLAT", "40_SHADE", "50_FX", "60_LETTERING"],
    flat: ["30_FLAT", "40_SHADE", "50_FX"],
    shade: ["30_FLAT", "40_SHADE", "50_FX"],
    fx: ["50_FX", "60_LETTERING"],
    lettering: ["60_LETTERING"],
    qa_final: ["99_AD_REDLINE"],
  });

export interface StudioNo9DefaultTerms {
  readonly perCutRateKrw: number;
  readonly royaltyBps: number;
}

/** Studio No.9식 기본 컷 단가 + 공정별 인세(bps) 표준 테이블. */
export const STUDIO_NO9_DEFAULT_TERMS: Readonly<Record<DivisionRoleCode, StudioNo9DefaultTerms>> =
  Object.freeze({
    pd: { perCutRateKrw: 3_000, royaltyBps: 200 },
    art_director: { perCutRateKrw: 3_500, royaltyBps: 180 },
    writer: { perCutRateKrw: 4_500, royaltyBps: 250 },
    storyboard: { perCutRateKrw: 6_000, royaltyBps: 200 },
    bg3d: { perCutRateKrw: 7_500, royaltyBps: 120 },
    line: { perCutRateKrw: 12_000, royaltyBps: 300 },
    flat: { perCutRateKrw: 4_500, royaltyBps: 80 },
    shade: { perCutRateKrw: 6_500, royaltyBps: 120 },
    finishing_lettering: { perCutRateKrw: 4_000, royaltyBps: 80 },
  });

export function defaultAllowedFoldersForStage(
  stageCode: DivisionStageCode,
  preset: DivisionTeamPreset,
): readonly DivisionLayerFolder[] {
  if (preset === "solo-plus-bg") return SOLO_PLUS_BG_FOLDERS[stageCode];
  if (preset === "duo-line-color") return DUO_LINE_COLOR_FOLDERS[stageCode];
  return STUDIO_9_ROLE_FOLDERS[stageCode];
}

export function decorateCutSlice(slice: CutSliceRecord, episodeTotalCuts: number): CutSliceView {
  return {
    ...slice,
    cutCount: slice.cutEnd - slice.cutStart + 1,
    contextCutBefore: slice.cutStart > 1 ? slice.cutStart - 1 : null,
    contextCutAfter: slice.cutEnd < episodeTotalCuts ? slice.cutEnd + 1 : null,
  };
}

export interface PlannedCutSliceDraft {
  readonly id: string;
  readonly cutStart: number;
  readonly cutEnd: number;
  readonly allowedFolders: readonly DivisionLayerFolder[];
  readonly assigneeUserId: string | null;
  readonly leaseExpiresAt: Date;
  readonly dueAt: Date | null;
}

export function buildPartitionPlans(
  episodeId: string,
  input: PartitionEpisodeSlicesInput,
  now: Date,
  createId: (index: number, cutStart: number, cutEnd: number) => string,
): { readonly totalCuts: number; readonly plans: readonly PlannedCutSliceDraft[] } {
  const defaultFolders = defaultAllowedFoldersForStage(input.stageCode, input.preset);
  const defaultDueAt = input.dueAt ? new Date(input.dueAt) : null;

  if (input.slices && input.slices.length > 0) {
    const inferredTotal = input.slices.reduce((max, item) => Math.max(max, item.cutEnd), 0);
    const totalCuts = input.totalCuts ?? inferredTotal;
    const plans = input.slices.map((item, index): PlannedCutSliceDraft => {
      const leaseMinutes = item.leaseDurationMinutes ?? input.leaseDurationMinutes;
      const leaseExpiresAt = new Date(now.getTime() + leaseMinutes * 60_000);
      const folders = item.allowedFolders
        ? [...new Set(item.allowedFolders)]
        : [...defaultFolders];
      return {
        id: item.id ?? createId(index, item.cutStart, item.cutEnd),
        cutStart: item.cutStart,
        cutEnd: item.cutEnd,
        allowedFolders: folders,
        assigneeUserId: item.assigneeUserId ?? null,
        leaseExpiresAt,
        dueAt: item.dueAt !== undefined ? (item.dueAt ? new Date(item.dueAt) : null) : defaultDueAt,
      };
    });
    return { totalCuts, plans };
  }

  const totalCuts = input.totalCuts!;
  const assignees = input.assigneeUserIds ?? [];
  const requestedCount =
    input.sliceCount ??
    (input.cutsPerSlice
      ? Math.ceil(totalCuts / input.cutsPerSlice)
      : assignees.length > 0
        ? assignees.length
        : Math.min(4, totalCuts));
  const sliceCount = Math.max(1, Math.min(requestedCount, totalCuts));
  const baseSize = Math.floor(totalCuts / sliceCount);
  const remainder = totalCuts % sliceCount;
  const leaseExpiresAt = new Date(now.getTime() + input.leaseDurationMinutes * 60_000);

  const plans: PlannedCutSliceDraft[] = [];
  let cursor = 1;
  for (let index = 0; index < sliceCount; index += 1) {
    const size = baseSize + (index < remainder ? 1 : 0);
    const cutStart = cursor;
    const cutEnd = cursor + size - 1;
    cursor = cutEnd + 1;
    plans.push({
      id: createId(index, cutStart, cutEnd),
      cutStart,
      cutEnd,
      allowedFolders: [...defaultFolders],
      assigneeUserId: assignees.length > 0 ? (assignees[index % assignees.length] ?? null) : null,
      leaseExpiresAt,
      dueAt: defaultDueAt,
    });
  }
  return { totalCuts, plans };
}

export interface CutOverlapConflict {
  readonly requestedStart: number;
  readonly requestedEnd: number;
  readonly conflictingSliceId: string;
  readonly conflictingStart: number;
  readonly conflictingEnd: number;
}

export function detectCutRangeOverlaps(
  candidates: readonly Pick<PlannedCutSliceDraft, "id" | "cutStart" | "cutEnd">[],
  existing: readonly Pick<CutSliceRecord, "id" | "cutStart" | "cutEnd">[],
): readonly CutOverlapConflict[] {
  const conflicts: CutOverlapConflict[] = [];
  const sortedCandidates = [...candidates].sort(
    (a, b) => a.cutStart - b.cutStart || a.cutEnd - b.cutEnd,
  );

  for (let i = 1; i < sortedCandidates.length; i += 1) {
    const prev = sortedCandidates[i - 1]!;
    const curr = sortedCandidates[i]!;
    if (curr.cutStart <= prev.cutEnd) {
      conflicts.push({
        requestedStart: curr.cutStart,
        requestedEnd: curr.cutEnd,
        conflictingSliceId: prev.id,
        conflictingStart: prev.cutStart,
        conflictingEnd: prev.cutEnd,
      });
    }
  }

  for (const candidate of candidates) {
    for (const current of existing) {
      if (candidate.cutStart <= current.cutEnd && current.cutStart <= candidate.cutEnd) {
        conflicts.push({
          requestedStart: candidate.cutStart,
          requestedEnd: candidate.cutEnd,
          conflictingSliceId: current.id,
          conflictingStart: current.cutStart,
          conflictingEnd: current.cutEnd,
        });
      }
    }
  }

  return conflicts;
}

export interface StitchValidationResult {
  readonly valid: boolean;
  readonly sortedSlices: readonly CutSliceRecord[];
  readonly unapprovedSliceIds: readonly string[];
  readonly missingRevisionSliceIds: readonly string[];
  readonly missingCutRanges: readonly { readonly start: number; readonly end: number }[];
  readonly overlappingSlices: readonly { readonly firstId: string; readonly secondId: string }[];
  readonly cutStart: number;
  readonly cutEnd: number;
  readonly totalCuts: number;
  readonly alreadyStitched: boolean;
}

export function validateSlicesForStitch(
  slices: readonly CutSliceRecord[],
  expectedTotalCuts?: number,
): StitchValidationResult {
  const sortedSlices = [...slices].sort((a, b) => a.cutStart - b.cutStart || a.cutEnd - b.cutEnd);
  const unapprovedSliceIds = sortedSlices
    .filter((slice) => slice.status !== "approved" && slice.status !== "stitched")
    .map((slice) => slice.id);
  const missingRevisionSliceIds = sortedSlices
    .filter((slice) => !slice.latestRevHash || slice.latestRevHash.trim().length === 0)
    .map((slice) => slice.id);

  const overlappingSlices: { readonly firstId: string; readonly secondId: string }[] = [];
  const missingCutRanges: { readonly start: number; readonly end: number }[] = [];

  if (sortedSlices.length > 0) {
    const first = sortedSlices[0]!;
    if (expectedTotalCuts !== undefined && first.cutStart > 1) {
      missingCutRanges.push({ start: 1, end: first.cutStart - 1 });
    }
    for (let i = 1; i < sortedSlices.length; i += 1) {
      const prev = sortedSlices[i - 1]!;
      const curr = sortedSlices[i]!;
      if (curr.cutStart <= prev.cutEnd) {
        overlappingSlices.push({ firstId: prev.id, secondId: curr.id });
      } else if (curr.cutStart > prev.cutEnd + 1) {
        missingCutRanges.push({ start: prev.cutEnd + 1, end: curr.cutStart - 1 });
      }
    }
    const last = sortedSlices[sortedSlices.length - 1]!;
    if (expectedTotalCuts !== undefined && last.cutEnd < expectedTotalCuts) {
      missingCutRanges.push({ start: last.cutEnd + 1, end: expectedTotalCuts });
    }
  }

  const cutStart = sortedSlices[0]?.cutStart ?? 0;
  const cutEnd = sortedSlices[sortedSlices.length - 1]?.cutEnd ?? 0;
  const totalCuts = sortedSlices.reduce((sum, slice) => sum + (slice.cutEnd - slice.cutStart + 1), 0);
  const alreadyStitched =
    sortedSlices.length > 0 && sortedSlices.every((slice) => slice.status === "stitched");

  const valid =
    sortedSlices.length > 0 &&
    unapprovedSliceIds.length === 0 &&
    missingRevisionSliceIds.length === 0 &&
    overlappingSlices.length === 0 &&
    missingCutRanges.length === 0;

  return {
    valid,
    sortedSlices,
    unapprovedSliceIds,
    missingRevisionSliceIds,
    missingCutRanges,
    overlappingSlices,
    cutStart,
    cutEnd,
    totalCuts,
    alreadyStitched,
  };
}

export function computeMasterManuscriptHash(
  projectId: string,
  episodeId: string,
  stageCode: DivisionStageCode,
  sortedSlices: readonly CutSliceRecord[],
): string {
  const payload = JSON.stringify({
    projectId,
    episodeId,
    stageCode,
    slices: sortedSlices.map((slice) => ({
      id: slice.id,
      cutStart: slice.cutStart,
      cutEnd: slice.cutEnd,
      latestRevHash: slice.latestRevHash,
      allowedFolders: [...slice.allowedFolders].sort(),
    })),
  });
  return `sha256:${createHash("sha256").update(payload).digest("hex")}`;
}

export interface AdRegulationCheckSummary {
  readonly checks: {
    readonly paletteDriftOk: boolean;
    readonly lineWidthCvOk: boolean;
    readonly colorscriptMoodOk: boolean;
    readonly mobile375Ok: boolean;
    readonly rightsBomOk: boolean;
  };
  readonly passedCount: number;
  readonly totalChecks: 5;
  readonly failedChecks: readonly string[];
  readonly recommendedVerdict: DivisionQaVerdict;
  readonly hardBlockedForApproval: boolean;
}

export function evaluateAdFiveChecks(input: {
  readonly paletteDriftMax: number;
  readonly lineWidthCv: number;
  readonly colorscriptMoodDrift: number;
  readonly mobile375Ok: boolean;
  readonly rightsBomOk: boolean;
}): AdRegulationCheckSummary {
  const paletteDriftOk = input.paletteDriftMax <= AD_PALETTE_DRIFT_MAX_THRESHOLD;
  const lineWidthCvOk = input.lineWidthCv <= AD_LINE_WIDTH_CV_MAX_THRESHOLD;
  const colorscriptMoodOk = input.colorscriptMoodDrift <= AD_COLORSCRIPT_MOOD_DRIFT_MAX_THRESHOLD;
  const mobile375Ok = input.mobile375Ok;
  const rightsBomOk = input.rightsBomOk;

  const failedChecks: string[] = [];
  if (!paletteDriftOk) failedChecks.push("palette_drift_exceeded");
  if (!lineWidthCvOk) failedChecks.push("line_width_cv_exceeded");
  if (!colorscriptMoodOk) failedChecks.push("colorscript_mood_drift_exceeded");
  if (!mobile375Ok) failedChecks.push("mobile_375_readability_failed");
  if (!rightsBomOk) failedChecks.push("rights_bom_blocked");

  const passedCount = 5 - failedChecks.length;
  let recommendedVerdict: DivisionQaVerdict = "approved";
  if (!rightsBomOk) {
    recommendedVerdict = "rejected";
  } else if (failedChecks.length >= 2 || !mobile375Ok) {
    recommendedVerdict = "retake";
  } else if (failedChecks.length === 1) {
    recommendedVerdict = "conditional";
  }

  return {
    checks: {
      paletteDriftOk,
      lineWidthCvOk,
      colorscriptMoodOk,
      mobile375Ok,
      rightsBomOk,
    },
    passedCount,
    totalChecks: 5,
    failedChecks,
    recommendedVerdict,
    hardBlockedForApproval: !rightsBomOk,
  };
}
