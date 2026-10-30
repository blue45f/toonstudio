import { assertScopeRef, PRODUCTION_SCOPE_KINDS } from "@toonstudio/core/production/scope";
import { z } from "zod";

const identity = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u);
const productionIdentity = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u);
const timestamp = z.iso.datetime({ offset: true });
const policyVersion = z.number().int().min(0).max(2_147_483_647);
const entityKind = z.enum(["element", "stroke", "group", "surface"]);
const entity = z.object({ kind: entityKind, id: identity }).strict();
const uniqueIds = z.array(identity).max(100_000).refine((values) => new Set(values).size === values.length);

export const StudioScopedProductionScopeSchema = z.object({
  kind: z.enum(PRODUCTION_SCOPE_KINDS), id: productionIdentity,
  ancestors: z.array(z.object({ kind: z.enum(PRODUCTION_SCOPE_KINDS).exclude(["deliverable"]), id: productionIdentity }).strict()).max(8).readonly(),
}).strict().refine((value) => { try { assertScopeRef(value); return true; } catch { return false; } });

/** 검수 원고의 위치 표식이다. 이 값 자체는 편집 권한이 아니다. */
export const StudioScopedWriteSourceSchema = z.object({
  schemaVersion: z.literal(1), workId: identity, projectId: identity, artifactId: identity,
  reviewId: identity, revisionId: identity, rootGraphHash: z.string().regex(/^[a-f0-9]{64}$/u),
}).strict();

/** 기존 객체의 귀속은 관리자가 고정한다. 이름·ordinal·좌표로 소유 대상을 추정하지 않는다. */
export const StudioScopedWriteTargetDefinitionSchema = z.object({
  id: identity, productionProjectId: productionIdentity, taskId: productionIdentity,
  scope: StudioScopedProductionScopeSchema, pageId: identity,
  frameId: identity.nullable(), layerId: identity.nullable(),
  entities: z.array(entity).max(100_000).refine((values) => new Set(values.map((item) => `${item.kind}:${item.id}`)).size === values.length),
  source: StudioScopedWriteSourceSchema,
}).strict().superRefine((value, context) => {
  if (value.scope.kind === "cut" && value.frameId === null) {
    context.addIssue({ code: "custom", path: ["frameId"], message: "컷 범위에는 실제 프레임을 명시해야 합니다." });
  }
});

export const StudioScopedWriteTargetSchema = z.object({
  definition: StudioScopedWriteTargetDefinitionSchema,
  sourceServerRevision: z.number().int().positive().max(2_147_483_647),
  captureSequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  createdBy: identity, createdAt: timestamp, revokedAt: timestamp.nullable(),
}).strict();

export const StudioScopedWriteGrantSchema = z.object({
  id: identity, actorUserId: identity, assignmentId: productionIdentity, taskId: productionIdentity,
  productionProjectId: productionIdentity, targetIds: uniqueIds.min(1),
  startsAt: timestamp, endsAt: timestamp.nullable(), createdBy: identity,
  createdAt: timestamp, revokedAt: timestamp.nullable(),
}).strict();

/** 실제 새 ID와 정확히 대조한다. 기존 ID의 귀속을 옮기는 명령으로 사용할 수 없다. */
export const StudioScopedWriteContextSchema = z.object({
  version: z.literal(1), policyVersion: policyVersion.min(1), grantIds: uniqueIds.min(1),
  creations: z.array(entity.extend({ targetId: identity }).strict()).max(100_000)
    .refine((values) => new Set(values.map((item) => JSON.stringify(item.kind === "group" ? [item.kind, item.id, item.targetId] : [item.kind, item.id]))).size === values.length),
  restorations: z.array(entity.extend({ targetId: identity }).strict()).max(100_000)
    .refine((values) => new Set(values.map((item) => JSON.stringify(item.kind === "group" ? [item.kind, item.id, item.targetId] : [item.kind, item.id]))).size === values.length),
}).strict();

export const StudioScopedWritePolicySchema = z.object({
  version: z.literal(1), workId: identity, policyVersion,
  canManage: z.boolean(), fullEdit: z.boolean(), scopedWrite: z.boolean(),
  /** false는 전체 편집자가 조회한 DB에 정책 관계가 아직 없다는 확정 상태다. */
  scopedWriteReady: z.boolean().optional(),
  /** 현재 계정의 과거 grant도 포함한다. 필드가 없는 이전 응답은 이력 없음으로 추정하지 않는다. */
  requiresScopedSaveReconciliation: z.boolean().optional(),
  targets: z.array(StudioScopedWriteTargetSchema).max(100_000),
  grants: z.array(StudioScopedWriteGrantSchema).max(100_000),
  ownedEntities: z.array(entity.extend({ targetId: identity }).strict()).max(100_000),
}).strict();

export const StudioScopedWriteManagementCommandSchema = z.object({
  mutationId: z.uuid(), expectedPolicyVersion: policyVersion,
  command: z.discriminatedUnion("type", [
    z.object({ type: z.literal("register-target"), target: StudioScopedWriteTargetDefinitionSchema }).strict(),
    z.object({ type: z.literal("grant"), id: identity, productionProjectId: productionIdentity,
      assignmentId: productionIdentity, taskId: productionIdentity, targetIds: uniqueIds.min(1),
      startsAt: timestamp, endsAt: timestamp.nullable() }).strict(),
    z.object({ type: z.literal("revoke-target"), targetId: identity }).strict(),
    z.object({ type: z.literal("revoke-grant"), grantId: identity }).strict(),
  ]),
}).strict();

export type StudioScopedEntityKind = z.infer<typeof entityKind>;
export type StudioScopedEntity = z.infer<typeof entity>;
export type StudioScopedWriteContext = z.infer<typeof StudioScopedWriteContextSchema>;
export type StudioScopedWriteTargetDefinition = z.infer<typeof StudioScopedWriteTargetDefinitionSchema>;
export type StudioScopedWriteTarget = z.infer<typeof StudioScopedWriteTargetSchema>;
export type StudioScopedWriteGrant = z.infer<typeof StudioScopedWriteGrantSchema>;
export type StudioScopedWritePolicy = z.infer<typeof StudioScopedWritePolicySchema>;
export type StudioScopedWriteManagementCommand = z.infer<typeof StudioScopedWriteManagementCommandSchema>;
