import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import {
  IdentitySchema,
  IsoDateTimeSchema,
} from "./production-collaboration-schema-primitives";

export const DIVISION_STAGE_CODES = [
  "script",
  "storyboard",
  "bg3d",
  "line",
  "flat",
  "shade",
  "fx",
  "lettering",
  "qa_final",
] as const;

export type DivisionStageCode = (typeof DIVISION_STAGE_CODES)[number];

export const DIVISION_ROLE_CODES = [
  "pd",
  "art_director",
  "writer",
  "storyboard",
  "bg3d",
  "line",
  "flat",
  "shade",
  "finishing_lettering",
] as const;

export type DivisionRoleCode = (typeof DIVISION_ROLE_CODES)[number];

export const DIVISION_LAYER_FOLDERS = [
  "00_CONTI",
  "10_BG3D",
  "20_LINE",
  "30_FLAT",
  "40_SHADE",
  "50_FX",
  "60_LETTERING",
  "99_AD_REDLINE",
] as const;

export type DivisionLayerFolder = (typeof DIVISION_LAYER_FOLDERS)[number];

export const DIVISION_SLICE_STATUSES = [
  "assigned",
  "in_progress",
  "submitted",
  "in_qa",
  "retake",
  "approved",
  "stitched",
] as const;

export type DivisionSliceStatus = (typeof DIVISION_SLICE_STATUSES)[number];

export const DIVISION_QA_VERDICTS = [
  "approved",
  "conditional",
  "retake",
  "rejected",
] as const;

export type DivisionQaVerdict = (typeof DIVISION_QA_VERDICTS)[number];

export const DIVISION_SETTLEMENT_MODELS = [
  "hybrid-base-plus-royalty",
  "mg-recoup-rs",
  "per-cut",
  "flat",
] as const;

export type DivisionSettlementModel = (typeof DIVISION_SETTLEMENT_MODELS)[number];

export const DIVISION_LEDGER_STATUSES = [
  "accruing",
  "ready",
  "settled",
  "disputed",
  "void",
] as const;

export type DivisionLedgerStatus = (typeof DIVISION_LEDGER_STATUSES)[number];

export const DIVISION_TEAM_PRESETS = [
  "solo-plus-bg",
  "duo-line-color",
  "studio-9-role",
] as const;

export type DivisionTeamPreset = (typeof DIVISION_TEAM_PRESETS)[number];

export const DivisionStageCodeSchema = z.enum(DIVISION_STAGE_CODES);
export const DivisionRoleCodeSchema = z.enum(DIVISION_ROLE_CODES);
export const DivisionLayerFolderSchema = z.enum(DIVISION_LAYER_FOLDERS);
export const DivisionQaVerdictSchema = z.enum(DIVISION_QA_VERDICTS);
export const DivisionSettlementModelSchema = z.enum(DIVISION_SETTLEMENT_MODELS);
export const DivisionTeamPresetSchema = z.enum(DIVISION_TEAM_PRESETS);

export const DivisionAssetKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(320)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,319}$/u, "유효한 에셋 키 형식이 아닙니다.")
  .refine((value) => !value.includes("..") && !value.includes("//"), {
    message: "에셋 키에 경로 탐색 문자열을 포함할 수 없습니다.",
  });

export const DivisionRevHashSchema = z
  .string()
  .trim()
  .min(6)
  .max(160)
  .regex(/^(?:sha256:[0-9a-f]{64}|rev:[A-Za-z0-9._:-]{2,140}|[0-9a-f]{12,64})$/u, {
    message: "유효한 리비전 해시 형식이 아닙니다.",
  });

export const DivisionRedlinePointSchema = z
  .object({
    x: z.number().finite().min(0).max(100_000),
    y: z.number().finite().min(0).max(100_000),
  })
  .strict();

export const DivisionRedlineStrokeSchema = z
  .object({
    id: IdentitySchema,
    cutNumber: z.number().int().min(1).max(10_000),
    color: z.string().trim().min(1).max(64).optional(),
    width: z.number().finite().min(0.5).max(120).optional(),
    points: z.array(DivisionRedlinePointSchema).min(1).max(2_000),
    note: z.string().trim().max(1_000).optional(),
    voicePinUrl: z
      .string()
      .trim()
      .max(2_048)
      .regex(/^https:\/\//u, "음성 핀 URL은 https:// 형식이어야 합니다.")
      .optional(),
  })
  .strict();

export const ExplicitSlicePlanSchema = z
  .object({
    id: IdentitySchema.optional(),
    cutStart: z.number().int().min(1).max(10_000),
    cutEnd: z.number().int().min(1).max(10_000),
    assigneeUserId: IdentitySchema.nullable().optional(),
    roleCode: DivisionRoleCodeSchema.optional(),
    allowedFolders: z.array(DivisionLayerFolderSchema).min(1).max(8).optional(),
    dueAt: IsoDateTimeSchema.nullable().optional(),
    leaseDurationMinutes: z.number().int().min(15).max(10_080).optional(),
  })
  .strict()
  .refine((slice) => slice.cutEnd >= slice.cutStart, {
    message: "종료 컷(cutEnd)은 시작 컷(cutStart)보다 크거나 같아야 합니다.",
  });

export const EpisodePartitionParamsSchema = z
  .object({
    episodeId: IdentitySchema,
  })
  .strict();

export const PartitionEpisodeSlicesSchema = z
  .object({
    projectId: IdentitySchema,
    stageCode: DivisionStageCodeSchema,
    totalCuts: z.number().int().min(1).max(10_000).optional(),
    sliceCount: z.number().int().min(1).max(100).optional(),
    cutsPerSlice: z.number().int().min(1).max(1_000).optional(),
    assigneeUserIds: z.array(IdentitySchema).max(100).optional(),
    slices: z.array(ExplicitSlicePlanSchema).min(1).max(100).optional(),
    preset: DivisionTeamPresetSchema.default("studio-9-role"),
    leaseDurationMinutes: z.number().int().min(15).max(10_080).default(480),
    dueAt: IsoDateTimeSchema.nullable().optional(),
    replaceExisting: z.boolean().default(false),
  })
  .strict()
  .refine((body) => Boolean(body.slices && body.slices.length > 0) || typeof body.totalCuts === "number", {
    message: "직접 슬라이스 목록(slices) 또는 전체 컷 수(totalCuts) 중 하나를 지정해야 합니다.",
  });

export const SliceParamsSchema = z
  .object({
    sliceId: IdentitySchema,
  })
  .strict();

export const StitchSliceSchema = z
  .object({
    projectId: IdentitySchema.optional(),
    sliceIds: z.array(IdentitySchema).min(1).max(200).optional(),
    stitchWholeStage: z.boolean().default(true),
    expectedTotalCuts: z.number().int().min(1).max(10_000).optional(),
  })
  .strict();

export const AcquireBinaryLockSchema = z
  .object({
    projectId: IdentitySchema,
    assetKey: DivisionAssetKeySchema,
    lockReason: z.string().trim().min(1).max(500),
    ttlMinutes: z.number().int().min(5).max(1_440).default(60),
    forceTakeover: z.boolean().default(false),
  })
  .strict();

export const ReleaseBinaryLockParamsSchema = z
  .object({
    assetKey: DivisionAssetKeySchema,
  })
  .strict();

const OptionalBooleanQuerySchema = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => (typeof value === "boolean" ? value : value === "true"))
  .optional();

export const ReleaseBinaryLockQuerySchema = z
  .object({
    projectId: IdentitySchema.optional(),
    force: OptionalBooleanQuerySchema,
  })
  .strict();

export const QaInspectSliceSchema = z
  .object({
    projectId: IdentitySchema.optional(),
    revisionHash: DivisionRevHashSchema,
    paletteDriftMax: z.number().finite().min(0).max(200),
    lineWidthCv: z.number().finite().min(0).max(10),
    colorscriptMoodDrift: z.number().finite().min(0).max(10).default(0),
    mobile375Ok: z.boolean(),
    rightsBomOk: z.boolean(),
    redlineStrokes: z.array(DivisionRedlineStrokeSchema).max(500).default([]),
    verdict: DivisionQaVerdictSchema.optional(),
    payeeUserId: IdentitySchema.optional(),
    roleCode: DivisionRoleCodeSchema.optional(),
    settlementModel: DivisionSettlementModelSchema.optional(),
    perCutRateKrw: z.number().int().min(0).max(10_000_000).optional(),
    royaltyBps: z.number().int().min(0).max(10_000).optional(),
    mgAdvanceKrw: z.number().int().min(0).max(1_000_000_000_000).optional(),
    flatAmountKrw: z.number().int().min(0).max(1_000_000_000_000).optional(),
  })
  .strict();

export const ProjectDivisionParamsSchema = z
  .object({
    projectId: IdentitySchema,
  })
  .strict();

export const PipelineMatrixQuerySchema = z
  .object({
    weeks: z.coerce.number().int().min(1).max(12).default(5),
    episodeIds: z
      .string()
      .trim()
      .max(2_000)
      .optional()
      .transform((value) =>
        value
          ? value
              .split(",")
              .map((entry) => entry.trim())
              .filter(Boolean)
          : undefined,
      ),
    asOf: IsoDateTimeSchema.optional(),
  })
  .strict();

export const RoyaltyLedgerQuerySchema = z
  .object({
    episodeId: IdentitySchema.optional(),
    payeeUserId: IdentitySchema.optional(),
    settlementModel: DivisionSettlementModelSchema.optional(),
    grossRevenueKrw: z.coerce.number().int().min(0).max(10_000_000_000_000).default(0),
    platformFeeBps: z.coerce.number().int().min(0).max(9_000).default(3_000),
    withholdingTaxBps: z.coerce.number().int().min(0).max(5_000).default(330),
  })
  .strict();

export class EpisodePartitionParamsDto extends createZodDto(EpisodePartitionParamsSchema) {}
export class PartitionEpisodeSlicesDto extends createZodDto(PartitionEpisodeSlicesSchema) {}
export class SliceParamsDto extends createZodDto(SliceParamsSchema) {}
export class StitchSliceDto extends createZodDto(StitchSliceSchema) {}
export class AcquireBinaryLockDto extends createZodDto(AcquireBinaryLockSchema) {}
export class ReleaseBinaryLockParamsDto extends createZodDto(ReleaseBinaryLockParamsSchema) {}
export class ReleaseBinaryLockQueryDto extends createZodDto(ReleaseBinaryLockQuerySchema) {}
export class QaInspectSliceDto extends createZodDto(QaInspectSliceSchema) {}
export class ProjectDivisionParamsDto extends createZodDto(ProjectDivisionParamsSchema) {}
export class PipelineMatrixQueryDto extends createZodDto(PipelineMatrixQuerySchema) {}
export class RoyaltyLedgerQueryDto extends createZodDto(RoyaltyLedgerQuerySchema) {}

export type PartitionEpisodeSlicesInput = z.infer<typeof PartitionEpisodeSlicesSchema>;
export type ExplicitSlicePlanInput = z.infer<typeof ExplicitSlicePlanSchema>;
export type StitchSliceInput = z.infer<typeof StitchSliceSchema>;
export type AcquireBinaryLockInput = z.infer<typeof AcquireBinaryLockSchema>;
export type ReleaseBinaryLockQueryInput = z.infer<typeof ReleaseBinaryLockQuerySchema>;
export type QaInspectSliceInput = z.infer<typeof QaInspectSliceSchema>;
export type PipelineMatrixQueryInput = z.infer<typeof PipelineMatrixQuerySchema>;
export type RoyaltyLedgerQueryInput = z.infer<typeof RoyaltyLedgerQuerySchema>;
