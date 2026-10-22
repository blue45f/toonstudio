/**
 * Production 협업 DTO — 기획 문서 스키마(브리프·시리즈·시즌·회차·장면·컷·에셋 요구).
 *
 * `production-collaboration.dto.ts`의 기획 레코드 계약만 분리했다.
 */

import { z } from "zod";

import {
  HumanTextSchema,
  IdentitySchema,
  IsoDateTimeSchema,
  NullableIsoDateTimeSchema,
  ProductionRevisionRefSchema,
  ProductionScopeRefSchema,
} from "./production-collaboration-schema-primitives";

export const PlanningDocumentStatusSchema = z.enum(["draft", "review", "approved", "locked", "superseded", "archived"]);

export const ProjectBriefSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  revision: z.number().int().min(1).max(2_147_483_647),
  status: PlanningDocumentStatusSchema,
  title: z.string().trim().min(1).max(240),
  logline: z.string().trim().max(4_000),
  synopsis: z.string().trim().max(20_000),
  themes: z.array(HumanTextSchema).max(100),
  genreKeys: z.array(z.string().trim().min(1).max(120)).max(100),
  audience: z.array(z.string().trim().min(1).max(240)).max(100),
  platformProfileRefs: z.array(IdentitySchema).max(100),
  businessGoals: z.array(HumanTextSchema).max(100),
  constraints: z.array(HumanTextSchema).max(1_000),
  rightsBaselineRef: IdentitySchema.nullable(),
  approvedByAssignmentIds: z.array(IdentitySchema).max(100),
  createdAt: IsoDateTimeSchema,
}).strict();

export const SeriesMasterSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  revision: z.number().int().min(1).max(2_147_483_647),
  status: PlanningDocumentStatusSchema,
  premise: z.string().trim().max(20_000),
  genreRules: z.array(HumanTextSchema).max(1_000),
  characterBibleRevisionRefs: z.array(IdentitySchema).max(10_000),
  locationBibleRevisionRefs: z.array(IdentitySchema).max(10_000),
  worldRules: z.array(HumanTextSchema).max(10_000),
  terminology: z.record(z.string().trim().min(1).max(240), z.string().trim().max(4_000)),
  styleRules: z.array(HumanTextSchema).max(10_000),
  forbiddenElements: z.array(HumanTextSchema).max(10_000),
  sourceEvidenceRefs: z.array(IdentitySchema).max(10_000),
  approvedByAssignmentIds: z.array(IdentitySchema).max(100),
  createdAt: IsoDateTimeSchema,
}).strict();

export const SeasonPlanSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  seasonId: IdentitySchema,
  revision: z.number().int().min(1).max(2_147_483_647),
  status: PlanningDocumentStatusSchema,
  title: z.string().trim().min(1).max(240),
  goal: z.string().trim().max(20_000),
  plotArc: z.array(HumanTextSchema).max(10_000),
  characterArcRefs: z.array(IdentitySchema).max(10_000),
  episodeOrder: z.array(IdentitySchema).max(10_000),
  targetEpisodeCount: z.number().int().min(1).max(100_000),
  releaseStartsAt: NullableIsoDateTimeSchema,
  releaseCadenceDays: z.number().int().min(1).max(3650).nullable(),
  budgetCapMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/u).nullable(),
  approvedByAssignmentIds: z.array(IdentitySchema).max(100),
  createdAt: IsoDateTimeSchema,
}).strict();

export const EpisodePlanSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  seasonId: IdentitySchema.nullable(),
  episodeId: IdentitySchema,
  episodeNumber: z.number().int().min(0).max(1_000_000),
  revision: z.number().int().min(1).max(2_147_483_647),
  status: PlanningDocumentStatusSchema,
  title: z.string().trim().min(1).max(240),
  logline: z.string().trim().max(4_000),
  openingHook: z.string().trim().max(4_000),
  coreConflict: z.string().trim().max(4_000),
  turningPoints: z.array(HumanTextSchema).max(1_000),
  cliffhanger: z.string().trim().max(4_000),
  characterRefs: z.array(IdentitySchema).max(10_000),
  locationRefs: z.array(IdentitySchema).max(10_000),
  targetCutCount: z.number().int().min(1).max(100_000),
  targetScrollHeightPx: z.number().int().min(1).max(100_000_000),
  dialogueDensity: z.enum(["low", "medium", "high"]),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  riskIds: z.array(IdentitySchema).max(10_000),
  narrativeRevisionRef: ProductionRevisionRefSchema.nullable(),
  approvedByAssignmentIds: z.array(IdentitySchema).max(100),
  createdAt: IsoDateTimeSchema,
}).strict();

export const ScenePlanSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  episodeId: IdentitySchema,
  sceneId: IdentitySchema,
  order: z.number().int().min(0).max(1_000_000),
  revision: z.number().int().min(1).max(2_147_483_647),
  status: PlanningDocumentStatusSchema,
  purpose: HumanTextSchema,
  locationRef: IdentitySchema.nullable(),
  timeLabel: z.string().trim().max(240),
  characterRefs: z.array(IdentitySchema).max(10_000),
  emotionalBeat: z.string().trim().max(4_000),
  continuityRefs: z.array(IdentitySchema).max(10_000),
  instructionRefs: z.array(IdentitySchema).max(10_000),
  estimatedMinutes: z.number().min(0).max(1_000_000),
  approvedByAssignmentIds: z.array(IdentitySchema).max(100),
  createdAt: IsoDateTimeSchema,
}).strict();

export const CutPlanSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  episodeId: IdentitySchema,
  sceneId: IdentitySchema,
  cutId: IdentitySchema,
  order: z.number().int().min(0).max(1_000_000),
  revision: z.number().int().min(1).max(2_147_483_647),
  status: PlanningDocumentStatusSchema,
  framing: z.string().trim().max(240),
  camera: z.string().trim().max(240),
  characterRefs: z.array(IdentitySchema).max(10_000),
  dialogueRefs: z.array(IdentitySchema).max(100_000),
  assetRequirementIds: z.array(IdentitySchema).max(100_000),
  layerRequirements: z.array(HumanTextSchema).max(10_000),
  estimatedHours: z.number().min(0).max(1_000_000),
  complexity: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  approvedByAssignmentIds: z.array(IdentitySchema).max(100),
  createdAt: IsoDateTimeSchema,
}).strict();

export const PlanningSnapshotInputSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  scope: ProductionScopeRefSchema,
  type: z.enum(["brief-approval", "series-master-lock", "season-baseline", "story-lock", "thumbnail-lock", "joint-proof", "publication"]),
  sourceRevisionRefs: z.array(ProductionRevisionRefSchema).min(1).max(100_000),
  documentRefs: z.array(IdentitySchema).max(100_000),
  approvedByAssignmentIds: z.array(IdentitySchema).min(1).max(100),
  createdAt: IsoDateTimeSchema,
}).strict();

export const AssetRequirementSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  scope: ProductionScopeRefSchema,
  category: z.enum(["character", "costume", "location", "prop", "3d", "brush", "font", "audio", "reference", "other"]),
  title: z.string().trim().min(1).max(240),
  specification: z.string().trim().max(20_000),
  sourcePlanRefs: z.array(IdentitySchema).max(100_000),
  sourcing: z.enum(["internal", "external", "marketplace", "existing"]),
  rightsRequirements: z.array(HumanTextSchema).max(1_000),
  requiredByAt: NullableIsoDateTimeSchema,
  status: z.enum(["identified", "sourcing", "ready", "blocked", "cancelled"]),
}).strict();

