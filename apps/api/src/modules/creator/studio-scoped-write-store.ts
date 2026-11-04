import { createHash } from "node:crypto";
import { ConflictException, ForbiddenException, ServiceUnavailableException } from "@nestjs/common";
import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { PoolClient } from "pg";
import { z } from "zod";
import { canonicalJson } from "@toonstudio/studio-project-model";
import { migrateProductionProjectAggregate, projectScope, scopeContains, type ProductionProjectAggregate } from "@toonstudio/core/production";
import { StudioScopedWriteContextSchema, StudioScopedWriteGrantSchema, StudioScopedWriteTargetSchema,
  type StudioScopedEntityKind, type StudioScopedWriteContext, type StudioScopedWriteGrant,
  type StudioScopedWritePolicy, type StudioScopedWriteTarget } from "@toonstudio/contracts/studio-scoped-write";
import { StudioRolePipelineStateSchema, studioRolePipelineControlledTargetIds, studioRolePipelineFrozenTargetIds,
  studioRolePipelineGrantTargetIds, studioRolePipelineGroupStage, type StudioRolePipelineState } from "@toonstudio/contracts/studio-role-pipeline";
import { creatorDraftCollaborationRooms, creatorWorkCollaborators, creatorWorks, productionProjects, users } from "../../platform/database";
import { resolveCreatorCollaborationAccess, type CreatorCollaborationAccess } from "./creator-collaboration.policy";
import type { DrizzleStudioCrdtTransaction } from "./studio-crdt.repository";
import { scopedEntityIdentity, scopedEntityKey, scopedRecord, StudioScopedWriteDeniedError } from "./studio-scoped-write-effects";

export interface StudioScopedSql {
  query<T extends Record<string, unknown>>(statement: SQL): Promise<readonly T[]>;
}
export const studioScopedDrizzle = (transaction: DrizzleStudioCrdtTransaction): StudioScopedSql => ({
  async query<T extends Record<string, unknown>>(statement: SQL) {
    // 같은 SQL·T로 요청한 rows이며 Drizzle의 지연 조건부 타입만 이 어댑터 경계에서 연결한다.
    return (await transaction.execute<T>(statement)).rows as readonly T[];
  },
});
const dialect = new PgDialect();
export const studioScopedPg = (client: Pick<PoolClient, "query">): StudioScopedSql => ({
  async query<T extends Record<string, unknown>>(statement: SQL) {
    const compiled = dialect.sqlToQuery(statement);
    return (await client.query<T>(compiled.sql, compiled.params)).rows;
  },
});

const ownershipSchema = z.record(z.string().regex(/^(?:element|stroke|group|surface):.+$/u), z.string().min(1).max(160));
const policySchema = z.object({ policyVersion: z.number().int().positive().max(2_147_483_647),
  targets: z.array(StudioScopedWriteTargetSchema).max(100_000), grants: z.array(StudioScopedWriteGrantSchema).max(100_000),
  ownership: ownershipSchema, rolePipeline: StudioRolePipelineStateSchema.nullable().default(null) }).strict().refine((policy) => {
    const targets = new Map(policy.targets.map((target) => [target.definition.id, target]));
    return targets.size === policy.targets.length && new Set(policy.grants.map((grant) => grant.id)).size === policy.grants.length
      && Object.entries(policy.ownership).every(([key, targetId]) => {
        const identity = scopedEntityIdentity(key), target = targets.get(targetId);
        return identity !== null && target !== undefined && (identity.kind !== "group" || identity.pageId === target.definition.pageId);
      });
  }, { message: "편집 정책의 실제 대상과 귀속이 일치하지 않습니다." });
export interface StudioScopedStoredPolicy {
  readonly policyVersion: number;
  readonly targets: readonly StudioScopedWriteTarget[];
  readonly grants: readonly StudioScopedWriteGrant[];
  readonly ownership: Readonly<Record<string, string>>;
  readonly rolePipeline?: StudioRolePipelineState | null;
}
export interface StudioScopedWork {
  readonly workId: string; readonly actorUserId: string; readonly revision: number; readonly document: unknown;
  readonly work: Readonly<Record<string, unknown>>; readonly access: CreatorCollaborationAccess;
  readonly now: string;
  readonly authorizationExpiresAt?: string;
}

/** 호출자는 먼저 공통 work advisory lock을 잡는다. 실제 권한은 잠근 현재 작품·멤버십으로 계산한다. */
export async function lockStudioScopedWork(query: StudioScopedSql, workId: string, actorUserId: string, update = false): Promise<StudioScopedWork> {
  const rows = await query.query(sql`SELECT to_jsonb(work) AS work, owner.status AS "ownerStatus", clock_timestamp() AS now
    FROM ${creatorWorks} AS work JOIN ${users} AS owner ON owner.id=work."userId"
    WHERE work.id=${workId} ${update ? sql`FOR UPDATE OF work` : sql`FOR SHARE OF work`} FOR SHARE OF owner`);
  const row = rows[0], work = scopedRecord(row?.work);
  if (rows.length !== 1 || !work || work.id !== workId || typeof work.userId !== "string"
    || typeof work.revision !== "number" || !Number.isInteger(work.revision) || work.revision < 1) throw new ForbiddenException("이 원고에 접근할 수 없습니다.");
  const memberships = actorUserId === work.userId ? [] : await query.query(sql`SELECT "userId",role,status FROM ${creatorWorkCollaborators}
    WHERE "workId"=${workId} AND "userId"=${actorUserId} FOR SHARE`);
  const membership = memberships[0];
  if (memberships.length > 1) throw new ForbiddenException("이 원고에 접근할 수 없습니다.");
  const access = resolveCreatorCollaborationAccess({ actorUserId, ownerUserId: work.userId,
    membership: membership && typeof membership.userId === "string"
      ? { userId: membership.userId, role: membership.role, status: membership.status } : null });
  if (!access.view || (actorUserId !== work.userId && row.ownerStatus !== "active")) throw new ForbiddenException("이 원고에 접근할 수 없습니다.");
  const rooms = await query.query(sql`SELECT status,"ownerUserId","expiresAt" FROM ${creatorDraftCollaborationRooms}
    WHERE "workId"=${workId} FOR SHARE`);
  const room = rooms[0];
  const clock = (await query.query(sql`SELECT clock_timestamp() AS now`))[0]?.now;
  const at = clock instanceof Date ? clock.toISOString() : clock;
  if (typeof at !== "string" || !Number.isFinite(Date.parse(at))) throw new Error("원고 권한 확인 시각을 읽지 못했습니다.");
  if (rooms.length > 1 || (room && (room.ownerUserId !== work.userId || (room.status !== "promoted"
    && (room.status !== "active" || work.status !== "draft" || work.hidden !== true
      || !Number.isFinite(Date.parse(String(room.expiresAt))) || Date.parse(String(room.expiresAt)) <= Date.parse(at)))))) {
    throw new ForbiddenException("이 원고에 접근할 수 없습니다.");
  }
  if (!access.edit) {
    const actors = await query.query(sql`SELECT status FROM ${users} WHERE id=${actorUserId} FOR SHARE`);
    if (actors.length !== 1 || actors[0]?.status !== "active") throw new ForbiddenException("이 원고에 접근할 수 없습니다.");
  }
  return { workId, actorUserId, revision: work.revision, document: work.doc, work, access, now: new Date(at).toISOString(),
    ...(room?.status === "active" ? { authorizationExpiresAt: new Date(String(room.expiresAt)).toISOString() } : {}) };
}

export async function loadStudioScopedPolicy(query: StudioScopedSql, workId: string, lock = false): Promise<StudioScopedStoredPolicy> {
  let rows: readonly Record<string, unknown>[];
  try {
    rows = await query.query(sql`SELECT "policyVersion",targets,grants,ownership,to_jsonb(policy)->'rolePipeline' AS "rolePipeline" FROM creator_work_scoped_write_policy AS policy
      WHERE "workId"=${workId}${lock ? sql` FOR UPDATE` : sql``}`);
  } catch (cause) {
    if (scopedRecord(cause)?.code === "42P01") throw new ServiceUnavailableException("제한 편집 기능의 준비가 완료되지 않았습니다.");
    throw cause;
  }
  if (!rows.length) return { policyVersion: 0, targets: [], grants: [], ownership: {} };
  if (rows.length !== 1) throw new StudioScopedWriteDeniedError("policy");
  return policySchema.parse(rows[0]);
}

export async function loadStudioScopedProduction(query: StudioScopedSql, workId: string, projectId: string): Promise<ProductionProjectAggregate> {
  const rows = await query.query(sql`SELECT id,"workId",revision,aggregate FROM ${productionProjects}
    WHERE id=${projectId} AND "workId"=${workId} FOR SHARE`);
  const row = rows[0];
  if (rows.length !== 1 || !row) throw new StudioScopedWriteDeniedError("policy");
  const aggregate = migrateProductionProjectAggregate(row.aggregate);
  if (aggregate.projectId !== projectId || aggregate.workId !== workId || aggregate.revision !== row.revision || aggregate.modelVersion !== 2) {
    throw new StudioScopedWriteDeniedError("policy");
  }
  return aggregate;
}

/** 현재 party·실제 계정·역할·기간·작업 범위를 매 쓰기 transaction에서 다시 확인한다. */
export function studioScopedGrantIsCurrent(grant: StudioScopedWriteGrant, targets: readonly StudioScopedWriteTarget[],
  aggregate: ProductionProjectAggregate, actorUserId: string, at: string): boolean {
  const now = Date.parse(at), roles = aggregate.assignments.filter((assignment) => assignment.id === grant.assignmentId), role = roles[0];
  const party = role ? aggregate.parties.find((entry) => entry.id === role.partyId) : undefined;
  const tasks = aggregate.tasks.filter((entry) => entry.id === grant.taskId), task = tasks[0];
  if (grant.revokedAt !== null || grant.actorUserId !== actorUserId || grant.productionProjectId !== aggregate.projectId
    || !Number.isFinite(now) || !Number.isFinite(Date.parse(grant.startsAt)) || Date.parse(grant.startsAt) > now
    || (grant.endsAt !== null && (!Number.isFinite(Date.parse(grant.endsAt)) || Date.parse(grant.endsAt) <= now))
    || roles.length !== 1 || !role || role.projectId !== aggregate.projectId || role.status !== "active"
    || !party || party.status !== "active" || party.accountUserId !== actorUserId
    || !Number.isFinite(Date.parse(role.startsAt)) || Date.parse(role.startsAt) > now
    || (role.endsAt !== null && (!Number.isFinite(Date.parse(role.endsAt)) || Date.parse(role.endsAt) <= now))
    || tasks.length !== 1 || !task || task.projectId !== aggregate.projectId
    || ["conditionally-approved", "approved", "done", "cancelled", "out-of-scope"].includes(task.status)) return false;
  return grant.targetIds.every((id) => {
    const matches = targets.filter((entry) => entry.definition.id === id), target = matches[0];
    return matches.length === 1 && target?.revokedAt === null && target.definition.productionProjectId === aggregate.projectId
      && scopeContains(projectScope(aggregate.projectId), target.definition.scope)
      && scopeContains(task.scope, target.definition.scope) && scopeContains(role.scope, target.definition.scope);
  });
}

export interface StudioScopedAuthorization {
  readonly work: StudioScopedWork; readonly policy: StudioScopedStoredPolicy;
  readonly targets: readonly StudioScopedWriteTarget[]; readonly grants: readonly StudioScopedWriteGrant[];
  readonly context: StudioScopedWriteContext | null;
  readonly mappedFull?: { readonly controlledTargets: readonly StudioScopedWriteTarget[] };
}
export function studioScopedRequiresEffectAdmission(authorization: StudioScopedAuthorization | undefined): boolean {
  return Boolean(authorization?.context || authorization?.mappedFull);
}
export function studioScopedEffectParameters(authorization: StudioScopedAuthorization) {
  return { context: authorization.context ?? { version: 1 as const, policyVersion: authorization.policy.policyVersion,
    grantIds: [], creations: [], restorations: [] }, targets: authorization.targets,
    ownership: new Map(Object.entries(authorization.policy.ownership)),
    ...(authorization.mappedFull ? { mappedFull: authorization.mappedFull } : {}) };
}
const TERMINAL_SCOPED_TASKS = ["conditionally-approved", "approved", "done", "cancelled", "out-of-scope"];
function pipelineFrozenTargets(pipeline: StudioRolePipelineState, aggregate: ProductionProjectAggregate): Set<string> {
  const frozen = new Set(studioRolePipelineFrozenTargetIds(pipeline));
  for (const mapping of pipeline.groupMappings) {
    const stage = pipeline.stageTasks.find((entry) => entry.stageId === studioRolePipelineGroupStage(mapping.groupId));
    const task = aggregate.tasks.find((entry) => entry.id === stage?.taskId);
    if (!task || TERMINAL_SCOPED_TASKS.includes(task.status)) for (const id of mapping.targetIds) frozen.add(id);
  }
  const finalTaskId = pipeline.stageTasks.find((entry) => entry.stageId === "pd-editorial-review")?.taskId;
  if (aggregate.tasks.some((task) => task.id === finalTaskId && ["approved", "done"].includes(task.status))) {
    for (const id of studioRolePipelineControlledTargetIds(pipeline)) frozen.add(id);
  }
  return frozen;
}
function pipelineActorCanHandoff(pipeline: StudioRolePipelineState, aggregate: ProductionProjectAggregate, work: StudioScopedWork): boolean {
  if (!pipeline.enabled || pipeline.approvedAt) return false;
  if (work.access.manageMembers) return true;
  const taskId = pipeline.stageTasks.find((stage) => stage.stageId === pipeline.activeStageId)?.taskId;
  const task = aggregate.tasks.find((entry) => entry.id === taskId), now = Date.parse(work.now);
  if (!task || !Number.isFinite(now)) return false;
  const bindings = new Set(pipeline.roleBindings.map((binding) => binding.assignmentId));
  return aggregate.assignments.some((assignment) => {
    const party = aggregate.parties.find((entry) => entry.id === assignment.partyId);
    return task.assignmentIds.includes(assignment.id) && bindings.has(assignment.id)
      && assignment.projectId === aggregate.projectId && assignment.status === "active"
      && party?.status === "active" && party.accountUserId === work.actorUserId
      && Number.isFinite(Date.parse(assignment.startsAt)) && Date.parse(assignment.startsAt) <= now
      && (assignment.endsAt === null || (Number.isFinite(Date.parse(assignment.endsAt)) && Date.parse(assignment.endsAt) > now))
      && scopeContains(assignment.scope, task.scope);
  });
}
function permittedGrantTargetIds(policy: StudioScopedStoredPolicy, grant: StudioScopedWriteGrant,
  aggregate: ProductionProjectAggregate): readonly string[] {
  const pipeline = policy.rolePipeline;
  if (!pipeline?.enabled) return grant.targetIds;
  const controlled = new Set(studioRolePipelineControlledTargetIds(pipeline)), frozen = pipelineFrozenTargets(pipeline, aggregate);
  const permitted = new Set(studioRolePipelineGrantTargetIds(pipeline, grant));
  return grant.targetIds.filter((id) => !controlled.has(id) || (permitted.has(id) && !frozen.has(id)));
}
export async function authorizeStudioScopedWrite(query: StudioScopedSql, work: StudioScopedWork,
  context: StudioScopedWriteContext | undefined): Promise<StudioScopedAuthorization> {
  const parsed = StudioScopedWriteContextSchema.safeParse(context);
  if (!work.access.edit && !parsed.success) throw new StudioScopedWriteDeniedError("context");
  let fullHint: StudioScopedStoredPolicy | null = null;
  const legacyFull = (): StudioScopedAuthorization => ({ work, policy: { policyVersion: 0, targets: [], grants: [], ownership: {} }, targets: [], grants: [], context: null });
  if (work.access.edit) {
    const availability = await query.query(sql`SELECT to_regclass('creator_work_scoped_write_policy') IS NOT NULL AS available`);
    if (availability.length !== 1 || typeof availability[0]?.available !== "boolean") throw new StudioScopedWriteDeniedError("policy");
    if (!availability[0].available) return legacyFull();
    fullHint = await loadStudioScopedPolicy(query, work.workId);
    if (!fullHint.rolePipeline?.enabled) return legacyFull();
  }
  const hint = fullHint ?? await loadStudioScopedPolicy(query, work.workId);
  if (!parsed.success && (!work.access.edit || context !== undefined)) throw new StudioScopedWriteDeniedError("context");
  const hintedGrants = (parsed.success ? parsed.data.grantIds : []).flatMap((id) => hint.grants.filter((entry) => entry.id === id));
  const projects = new Map<string, ProductionProjectAggregate>();
  // Production 작업·역할을 정책 행보다 먼저 잠가 제출 경로의 work → project → policy 순서와 맞춘다.
  for (const id of [...new Set([...hintedGrants.map((grant) => grant.productionProjectId),
    ...(hint.rolePipeline?.enabled ? [hint.rolePipeline.productionProjectId] : [])])].sort()) {
    projects.set(id, await loadStudioScopedProduction(query, work.workId, id));
  }
  const policy = await loadStudioScopedPolicy(query, work.workId, true);
  const controlledIds = new Set(studioRolePipelineControlledTargetIds(policy.rolePipeline));
  const mappedFull = work.access.edit && policy.rolePipeline?.enabled
    ? { controlledTargets: policy.targets.filter((target) => controlledIds.has(target.definition.id)) } : undefined;
  if (mappedFull && (mappedFull.controlledTargets.length !== controlledIds.size || !controlledIds.size)) throw new StudioScopedWriteDeniedError("policy");
  if (!parsed.success) return { work, policy, targets: [], grants: [], context: null, ...(mappedFull ? { mappedFull } : {}) };
  if (policy.policyVersion !== parsed.data.policyVersion) throw new ConflictException({ code: "studio_scoped_policy_changed",
    message: "편집 배정이나 정책이 변경됐습니다. 초안을 보존하고 현재 권한을 다시 확인하세요.", policyVersion: policy.policyVersion });
  const selected = parsed.data.grantIds.map((id) => policy.grants.filter((entry) => entry.id === id));
  if (selected.some((matches) => matches.length !== 1)) throw new StudioScopedWriteDeniedError("policy");
  const grants = selected.flat();
  const clock = (await query.query(sql`SELECT clock_timestamp() AS now`))[0]?.now;
  const now = clock instanceof Date ? clock.toISOString() : clock;
  if (typeof now !== "string" || !Number.isFinite(Date.parse(now))
    || (work.authorizationExpiresAt && Date.parse(work.authorizationExpiresAt) <= Date.parse(now))) throw new StudioScopedWriteDeniedError("policy");
  if (grants.some((grant) => {
    const aggregate = projects.get(grant.productionProjectId);
    return !aggregate || !studioScopedGrantIsCurrent(grant, policy.targets, aggregate, work.actorUserId, now);
  })) throw new StudioScopedWriteDeniedError("policy");
  const allowed = new Set(grants.flatMap((grant) => {
    const aggregate = projects.get(grant.productionProjectId);
    return aggregate ? permittedGrantTargetIds(policy, grant, aggregate) : [];
  }));
  return { work: { ...work, now: new Date(now).toISOString() }, policy,
    targets: policy.targets.filter((target) => allowed.has(target.definition.id) && (!mappedFull || controlledIds.has(target.definition.id))),
    grants, context: parsed.data, ...(mappedFull ? { mappedFull } : {}) };
}

export function studioScopedRequestHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
export interface StudioScopedReceipt {
  readonly actorUserId: string; readonly requestHash: string; readonly policyVersion: number;
  readonly targetIds: readonly string[]; readonly response: unknown;
}
export async function loadStudioScopedReceipt(query: StudioScopedSql, work: StudioScopedWork, kind: string, mutationId: string, requestHash: string): Promise<StudioScopedReceipt | null> {
  const rows = await query.query(sql`SELECT "actorUserId","requestHash","policyVersion","targetIds",response
    FROM creator_work_scoped_write_receipt WHERE "workId"=${work.workId} AND kind=${kind} AND "mutationId"=${mutationId}`);
  const row = rows[0];
  if (!row) return null;
  if (rows.length !== 1 || row.actorUserId !== work.actorUserId || row.requestHash !== requestHash) throw new ConflictException("같은 저장 ID의 다른 변경을 적용할 수 없습니다.");
  return { actorUserId: work.actorUserId, requestHash, policyVersion: z.number().int().positive().parse(row.policyVersion),
    targetIds: z.array(z.string()).parse(row.targetIds), response: row.response };
}
export async function recordStudioScopedReceipt(query: StudioScopedSql, authorization: StudioScopedAuthorization,
  kind: string, mutationId: string, requestHash: string, targetIds: readonly string[], response: unknown = null): Promise<void> {
  if (!studioScopedRequiresEffectAdmission(authorization)) return;
  await query.query(sql`INSERT INTO creator_work_scoped_write_receipt ("workId",kind,"mutationId","actorUserId","requestHash","policyVersion","targetIds",response,"createdAt")
    VALUES (${authorization.work.workId},${kind},${mutationId},${authorization.work.actorUserId},${requestHash},${authorization.policy.policyVersion},
      ${JSON.stringify(targetIds)}::jsonb,${JSON.stringify(response)}::jsonb,${authorization.work.now}::timestamptz)`);
}
export async function persistStudioScopedCreations(query: StudioScopedSql, authorization: StudioScopedAuthorization,
  created: readonly { readonly kind: StudioScopedEntityKind; readonly id: string; readonly targetId: string }[]): Promise<void> {
  if (!created.length || !studioScopedRequiresEffectAdmission(authorization)) return;
  const ownership = { ...authorization.policy.ownership };
  for (const entry of created) {
    const target = authorization.targets.find((target) => target.definition.id === entry.targetId);
    const key = scopedEntityKey(entry.kind, entry.id, target?.definition.pageId);
    if (Object.hasOwn(ownership, key)) throw new StudioScopedWriteDeniedError("context");
    ownership[key] = entry.targetId;
  }
  await query.query(sql`UPDATE creator_work_scoped_write_policy SET ownership=${JSON.stringify(ownership)}::jsonb
    WHERE "workId"=${authorization.work.workId} AND "policyVersion"=${authorization.policy.policyVersion}`);
}

/** 현재 계정에 허용한 target과 실제 생성 귀속만 내려준다. 기존 일반 access 응답은 바꾸지 않는다. */
export async function studioScopedPolicyForActor(query: StudioScopedSql, work: StudioScopedWork): Promise<StudioScopedWritePolicy> {
  if (work.access.edit) {
    // 없는 관계를 직접 읽어 transaction을 aborted 상태로 만든 뒤 성공 응답하지 않는다.
    const availability = await query.query(sql`SELECT to_regclass('creator_work_scoped_write_policy') IS NOT NULL AS available`);
    const ready = availability[0]?.available;
    if (availability.length !== 1 || typeof ready !== "boolean") throw new Error("제한 편집 정책의 준비 상태를 확인하지 못했습니다.");
    if (!ready) return { version: 1, workId: work.workId, policyVersion: 0,
      canManage: work.access.manageMembers, fullEdit: true, scopedWrite: false, scopedWriteReady: false,
      requiresScopedSaveReconciliation: false, targets: [], grants: [], ownedEntities: [] };
  }
  const policy = await loadStudioScopedPolicy(query, work.workId), projects = new Map<string, ProductionProjectAggregate>();
  const requiresScopedSaveReconciliation = policy.grants.some((grant) => grant.actorUserId === work.actorUserId);
  const grants: StudioScopedWriteGrant[] = [];
  for (const grant of policy.grants) {
    if (grant.actorUserId !== work.actorUserId || grant.revokedAt !== null) continue;
    let aggregate = projects.get(grant.productionProjectId);
    if (!aggregate) { aggregate = await loadStudioScopedProduction(query, work.workId, grant.productionProjectId); projects.set(grant.productionProjectId, aggregate); }
    if (studioScopedGrantIsCurrent(grant, policy.targets, aggregate, work.actorUserId, work.now)) {
      const targetIds = permittedGrantTargetIds(policy, grant, aggregate);
      if (targetIds.length) grants.push({ ...grant, targetIds: [...targetIds] });
    }
  }
  const selected = new Set(grants.flatMap((grant) => grant.targetIds));
  const controlled = new Set(studioRolePipelineControlledTargetIds(policy.rolePipeline));
  const targets = work.access.manageMembers ? policy.targets : policy.targets.filter((target) => selected.has(target.definition.id)
    || (work.access.edit && controlled.has(target.definition.id)));
  const visible = new Set(targets.map((target) => target.definition.id));
  const ownedEntities = Object.entries(policy.ownership).flatMap(([key, targetId]) => {
    if (!visible.has(targetId)) return [];
    const identity = scopedEntityIdentity(key), target = targets.find((target) => target.definition.id === targetId);
    if (!identity || (identity.kind === "group" && identity.pageId !== target?.definition.pageId)) throw new StudioScopedWriteDeniedError("ambiguous");
    return [{ kind: identity.kind, id: identity.id, targetId }];
  });
  let rolePipelineAccess;
  if (policy.rolePipeline?.enabled) {
    const pipeline = policy.rolePipeline;
    let aggregate = projects.get(pipeline.productionProjectId);
    if (!aggregate) { aggregate = await loadStudioScopedProduction(query, work.workId, pipeline.productionProjectId); projects.set(pipeline.productionProjectId, aggregate); }
    rolePipelineAccess = { editableTargetIds: [...selected].filter((id) => controlled.has(id)),
      frozenTargetIds: [...pipelineFrozenTargets(pipeline, aggregate)], canHandoff: pipelineActorCanHandoff(pipeline, aggregate, work) };
  }
  return { version: 1, workId: work.workId, policyVersion: policy.policyVersion, canManage: work.access.manageMembers,
    fullEdit: work.access.edit, scopedWrite: grants.length > 0, scopedWriteReady: true, requiresScopedSaveReconciliation,
    targets: [...targets], grants: work.access.manageMembers ? [...policy.grants] : grants, ownedEntities,
    ...(policy.rolePipeline ? { rolePipeline: policy.rolePipeline } : {}), ...(rolePipelineAccess ? { rolePipelineAccess } : {}) };
}
