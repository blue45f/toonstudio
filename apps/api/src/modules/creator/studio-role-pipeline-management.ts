import { createHash } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { canonicalJson } from "@toonstudio/studio-project-model";
import { productionTaskHasCurrentApprovedOutputs, productionTaskHasCurrentDependencyInputs, scopeContains,
  type ProductionProjectAggregate } from "@toonstudio/core/production";
import { StudioRolePipelineManagementSchema, STUDIO_ROLE_PIPELINE_STAGE_IDS, studioRolePipelineGroupStage,
  studioRolePipelineGrantTargetIds, type StudioRolePipelineConfiguration, type StudioRolePipelineManagement,
  type StudioRolePipelineState } from "@toonstudio/contracts/studio-role-pipeline";
import type { StudioScopedWriteGrant, StudioScopedWriteManagementCommand } from "@toonstudio/contracts/studio-scoped-write";
import { CREATOR_WORK_REVISION_MAX, createCreatorWorkRevisionSnapshot } from "../../server/creator-work-revisions";
import { loadStudioScopedPolicy, studioScopedGrantIsCurrent, type StudioScopedSql, type StudioScopedStoredPolicy, type StudioScopedWork } from "./studio-scoped-write-store";

const terminal = (status: string) => ["conditionally-approved", "approved", "done", "cancelled", "out-of-scope"].includes(status);
const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 20);
const grantPrefix = (projectId: string) => `role-pipeline:${hash(projectId)}:`;
export const isStudioRolePipelineManagement = (command: StudioScopedWriteManagementCommand["command"]): command is StudioRolePipelineManagement =>
  StudioRolePipelineManagementSchema.safeParse(command).success;
export function studioRolePipelineProjectId(command: StudioRolePipelineManagement, current: StudioScopedStoredPolicy): string {
  const projectId = command.type === "configure-role-pipeline" || command.type === "restart-role-pipeline"
    ? command.configuration.productionProjectId : current.rolePipeline?.productionProjectId;
  if (!projectId) throw new BadRequestException("이 프로젝트의 직군별 원고 보호가 아직 설정되지 않았습니다.");
  return projectId;
}

/** 현재 계정·작품 멤버십을 잠근 상태에서 읽는다. 프로필 역할은 사용하지 않는다. */
async function accountIsCurrent(query: StudioScopedSql, work: StudioScopedWork, actorId: string): Promise<boolean> {
  const rows = await query.query(sql`SELECT account.status AS "accountStatus",member.status AS "memberStatus",member.role AS "memberRole"
    FROM "user" account LEFT JOIN creator_work_collaborator member ON member."workId"=${work.workId} AND member."userId"=account.id
    WHERE account.id=${actorId} FOR SHARE OF account`);
  const row = rows[0];
  if (rows.length !== 1 || row?.accountStatus !== "active") return false;
  return actorId === work.work.userId || (row.memberStatus === "active" && ["viewer", "commenter", "editor", "admin"].includes(String(row.memberRole)));
}

async function validateConfiguration(query: StudioScopedSql, work: StudioScopedWork, current: StudioScopedStoredPolicy,
  aggregate: ProductionProjectAggregate, config: StudioRolePipelineConfiguration): Promise<void> {
  if (config.productionProjectId !== aggregate.projectId || aggregate.workId !== work.workId) throw new BadRequestException("현재 작품의 제작 프로젝트를 선택하세요.");
  const taskIds = new Set(config.stageTasks.map((entry) => entry.taskId));
  for (const taskId of taskIds) {
    const task = aggregate.tasks.find((entry) => entry.id === taskId);
    if (!task || terminal(task.status)) throw new BadRequestException("각 공정에 승인 전의 서로 다른 실제 제작 작업을 연결하세요.");
  }
  for (const binding of config.roleBindings) {
    const role = aggregate.assignments.find((entry) => entry.id === binding.assignmentId);
    const party = role && aggregate.parties.find((entry) => entry.id === role.partyId);
    if (!role || role.projectId !== aggregate.projectId || role.status !== "active" || !party?.accountUserId || party.status !== "active"
      || !await accountIsCurrent(query, work, party.accountUserId)) throw new BadRequestException("현재 작품에 참여 중인 실제 계정의 활성 제작 배정을 선택하세요.");
  }
  for (const mapping of config.groupMappings) {
    const stage = studioRolePipelineGroupStage(mapping.groupId);
    const task = aggregate.tasks.find((entry) => entry.id === config.stageTasks.find((entry) => entry.stageId === stage)?.taskId);
    if (!task) throw new BadRequestException("제작 레이어 그룹의 실제 공정 작업이 없습니다.");
    for (const targetId of mapping.targetIds) {
      const target = current.targets.find((entry) => entry.definition.id === targetId);
      if (!target || target.revokedAt !== null || target.definition.productionProjectId !== aggregate.projectId
        || target.definition.source.workId !== work.workId || !scopeContains(task.scope, target.definition.scope)) {
        throw new BadRequestException("같은 작품·제작 프로젝트의 검증된 실제 원고 범위를 연결하세요.");
      }
    }
  }
  const controlled = config.groupMappings.flatMap((mapping) => mapping.targetIds.map((id) => current.targets.find((target) => target.definition.id === id)));
  for (let index = 0; index < controlled.length; index += 1) {
    const a = controlled[index]?.definition;
    if (!a) continue;
    for (const b of controlled.slice(index + 1).map((entry) => entry?.definition)) {
      if (b && a.pageId === b.pageId && (a.layerId === null || b.layerId === null || a.layerId === b.layerId)
        && (a.frameId === null || b.frameId === null || a.frameId === b.frameId)) {
        throw new BadRequestException("보호 범위가 겹칩니다. 제작 레이어 그룹마다 서로 구분되는 실제 레이어·컷을 연결하세요.");
      }
    }
  }
}

async function grantsForStage(query: StudioScopedSql, work: StudioScopedWork, current: StudioScopedStoredPolicy,
  aggregate: ProductionProjectAggregate, pipeline: StudioRolePipelineState, mutationId: string): Promise<readonly StudioScopedWriteGrant[]> {
  const taskId = pipeline.stageTasks.find((entry) => entry.stageId === pipeline.activeStageId)?.taskId;
  const task = aggregate.tasks.find((entry) => entry.id === taskId);
  if (!task || terminal(task.status)) throw new BadRequestException("다음 공정의 현재 제작 작업을 확인하세요.");
  const result: StudioScopedWriteGrant[] = [];
  for (const assignmentId of new Set(pipeline.roleBindings.map((entry) => entry.assignmentId))) {
    if (!task.assignmentIds.includes(assignmentId)) continue;
    const role = aggregate.assignments.find((entry) => entry.id === assignmentId);
    const party = role && aggregate.parties.find((entry) => entry.id === role.partyId);
    if (!role || !party?.accountUserId || !await accountIsCurrent(query, work, party.accountUserId)) continue;
    const candidate = { assignmentId, taskId: task.id, targetIds: pipeline.groupMappings.flatMap((entry) => entry.targetIds) };
    const targetIds = studioRolePipelineGrantTargetIds(pipeline, candidate).filter((id) => {
      const target = current.targets.find((entry) => entry.definition.id === id);
      return target && scopeContains(role.scope, target.definition.scope) && scopeContains(task.scope, target.definition.scope);
    });
    if (!targetIds.length) continue;
    const grant: StudioScopedWriteGrant = { id: `${grantPrefix(aggregate.projectId)}${mutationId}:${hash(assignmentId)}`,
      actorUserId: party.accountUserId, productionProjectId: aggregate.projectId, taskId: task.id, assignmentId, targetIds,
      startsAt: work.now, endsAt: role.endsAt, createdBy: work.actorUserId, createdAt: work.now, revokedAt: null };
    if (!studioScopedGrantIsCurrent(grant, current.targets, aggregate, party.accountUserId, work.now)) continue;
    result.push(grant);
  }
  const hasMappedTargets = pipeline.groupMappings.some((entry) => studioRolePipelineGroupStage(entry.groupId) === pipeline.activeStageId);
  if (hasMappedTargets && !result.length) throw new BadRequestException("이 공정의 실제 담당 배정·계정·기간과 레이어 연결을 먼저 확인하세요.");
  return result;
}

function stateCanBeReconfigured(current: StudioRolePipelineState | null | undefined, aggregate: ProductionProjectAggregate): boolean {
  return !current || (!current.history.length && !current.frozenStageIds.length && !current.approvedAt
    && current.stageTasks.every((entry) => !aggregate.tasks.some((task) => task.id === entry.taskId && ["conditionally-approved", "approved", "done"].includes(task.status))));
}
function freshState(config: StudioRolePipelineConfiguration, previous?: StudioRolePipelineState | null): StudioRolePipelineState {
  return { ...config, version: 1, enabled: true, activeStageId: "story-script", frozenStageIds: [], approvedAt: null,
    history: previous?.history ?? [] };
}

/** 호출자의 동일 work → project → policy transaction에서만 설정·인계·grant·영수증을 함께 확정한다. */
export async function applyStudioRolePipelineManagement(query: StudioScopedSql, work: StudioScopedWork,
  current: StudioScopedStoredPolicy, aggregate: ProductionProjectAggregate, input: StudioScopedWriteManagementCommand,
  command: StudioRolePipelineManagement): Promise<StudioScopedStoredPolicy> {
  const previous = current.rolePipeline;
  if (command.type !== "handoff-role-pipeline" && !work.access.manageMembers) throw new ForbiddenException("제작 관리자만 원고 보호 정책을 변경할 수 있습니다.");
  let pipeline: StudioRolePipelineState;
  if (command.type === "disable-role-pipeline") {
    if (!previous || !stateCanBeReconfigured(previous, aggregate)) throw new ConflictException("인계·승인된 원고는 보호를 끄지 않고 새 제작 작업으로 재작업하세요.");
    pipeline = { ...previous, enabled: false };
  } else if (command.type === "configure-role-pipeline" || command.type === "restart-role-pipeline") {
    if (command.type === "configure-role-pipeline" && !stateCanBeReconfigured(previous, aggregate)) {
      throw new ConflictException("인계·승인 이력을 보존하려면 새 제작 작업을 연결해 재작업을 시작하세요.");
    }
    await validateConfiguration(query, work, current, aggregate, command.configuration);
    pipeline = freshState(command.configuration, previous);
    if (command.type === "restart-role-pipeline") {
      if (!previous || stateCanBeReconfigured(previous, aggregate)) throw new BadRequestException("재작업할 인계·승인 이력이 없습니다.");
      if (previous.stageTasks.some((old) => command.configuration.stageTasks.some((next) => old.taskId === next.taskId))) {
        throw new BadRequestException("기존 승인 작업은 보존하고 여덟 공정에 새 제작 작업을 연결하세요.");
      }
      if (work.revision !== command.expectedWorkRevision || work.revision >= CREATOR_WORK_REVISION_MAX) throw new ConflictException("원고 버전이 변경됐습니다. 현재 저장본을 다시 확인하세요.");
      if (pipeline.history.length >= 1000) throw new ConflictException("제작 인계 이력 한도에 도달했습니다.");
      const oldTask = aggregate.tasks.find((entry) => entry.id === previous.stageTasks.find((entry) => entry.stageId === previous.activeStageId)?.taskId);
      const oldOutput = oldTask && aggregate.deliverables.find((entry) => oldTask.outputDeliverableIds.includes(entry.id) && entry.approvedSubmissionId);
      const priorSubmissionId = previous.history.at(-1)?.submissionId ?? oldOutput?.approvedSubmissionId;
      if (!priorSubmissionId) throw new BadRequestException("재작업의 이전 승인 근거가 없습니다.");
      pipeline = { ...pipeline, history: [...pipeline.history, { kind: "restart", mutationId: input.mutationId,
        actorUserId: work.actorUserId, fromStageId: previous.activeStageId, toStageId: "story-script",
        submissionId: priorSubmissionId, createdAt: work.now }] };
      const rows = await query.query(sql`UPDATE creator_work SET revision=revision+1,"updatedAt"=${work.now}::timestamptz
        WHERE id=${work.workId} AND revision=${work.revision} RETURNING revision`);
      if (rows.length !== 1 || rows[0]?.revision !== work.revision + 1) throw new ConflictException("재작업 원고 버전이 변경됐습니다.");
      await query.query(sql`INSERT INTO creator_work_revision ("workId",revision,snapshot,"createdAt")
        VALUES (${work.workId},${work.revision + 1},${JSON.stringify(createCreatorWorkRevisionSnapshot(work.work))}::jsonb,${work.now}::timestamptz)`);
    }
  } else {
    if (!previous?.enabled || previous.approvedAt || previous.history.length >= 1000) throw new ConflictException("현재 인계할 활성 공정이 없습니다.");
    if (aggregate.revision !== command.expectedProjectRevision) throw new ConflictException("제작 작업이 변경됐습니다. 현재 승인본을 확인하세요.");
    const taskId = previous.stageTasks.find((entry) => entry.stageId === previous.activeStageId)?.taskId;
    const task = aggregate.tasks.find((entry) => entry.id === taskId);
    const stageIndex = STUDIO_ROLE_PIPELINE_STAGE_IDS.indexOf(previous.activeStageId);
    const priorStage = STUDIO_ROLE_PIPELINE_STAGE_IDS[stageIndex - 1];
    const priorTaskId = previous.stageTasks.find((entry) => entry.stageId === priorStage)?.taskId;
    const actorAssigned = task?.assignmentIds.some((id) => previous.roleBindings.some((binding) => binding.assignmentId === id)
      && aggregate.assignments.some((role) => role.id === id && role.status === "active" && Date.parse(role.startsAt) <= Date.parse(work.now)
        && (role.endsAt === null || Date.parse(role.endsAt) > Date.parse(work.now))
        && aggregate.parties.some((party) => party.id === role.partyId && party.status === "active" && party.accountUserId === work.actorUserId)));
    if (!work.access.manageMembers && (!actorAssigned || !await accountIsCurrent(query, work, work.actorUserId))) throw new ForbiddenException("현재 공정의 실제 담당자만 인계할 수 있습니다.");
    if (!task || !["approved", "done"].includes(task.status) || !productionTaskHasCurrentApprovedOutputs(task, aggregate)
      || !productionTaskHasCurrentDependencyInputs(task, aggregate)
      || (stageIndex > 0 && (!priorTaskId || !task.dependencyTaskIds.includes(priorTaskId)))) {
      throw new BadRequestException("현재 작업의 실제 제출·필수 검수·승인을 먼저 완료하세요.");
    }
    const outputs = task.outputDeliverableIds.map((id) => aggregate.deliverables.find((entry) => entry.id === id));
    const submissions = outputs.map((output) => aggregate.submissions.find((entry) => entry.id === output?.approvedSubmissionId));
    const submission = submissions[0];
    if (!submission || submissions.some((entry) => !entry || entry.status !== "approved")) throw new BadRequestException("현재 승인 산출물의 고정 제출본이 없습니다.");
    const nextStage = STUDIO_ROLE_PIPELINE_STAGE_IDS[STUDIO_ROLE_PIPELINE_STAGE_IDS.indexOf(previous.activeStageId) + 1] ?? null;
    if (nextStage) {
      const next = aggregate.tasks.find((entry) => entry.id === previous.stageTasks.find((entry) => entry.stageId === nextStage)?.taskId);
      if (!next || terminal(next.status) || !next.dependencyTaskIds.includes(task.id)
        || !productionTaskHasCurrentDependencyInputs(next, aggregate)) throw new BadRequestException("다음 공정에 현재 승인 제출본을 입력으로 고정하세요.");
    }
    pipeline = { ...previous, activeStageId: nextStage ?? previous.activeStageId,
      frozenStageIds: [...new Set([...previous.frozenStageIds, previous.activeStageId])], approvedAt: nextStage ? null : work.now,
      history: [...previous.history, { kind: "handoff", mutationId: input.mutationId, actorUserId: work.actorUserId,
        fromStageId: previous.activeStageId, toStageId: nextStage, submissionId: submission.id, createdAt: work.now }] };
  }
  const generated = current.grants.map((grant) => grant.id.startsWith(grantPrefix(aggregate.projectId)) && grant.revokedAt === null
    ? { ...grant, revokedAt: work.now } : grant);
  const added = pipeline.enabled && !pipeline.approvedAt ? await grantsForStage(query, work, current, aggregate, pipeline, input.mutationId) : [];
  if (generated.length + added.length > 100_000) throw new ConflictException("원고 편집 배정 이력의 저장 한도에 도달했습니다. 기존 이력을 보존하고 관리자에게 확인하세요.");
  return { ...current, rolePipeline: pipeline, grants: [...generated, ...added] };
}

/** 제작 프로젝트 행 잠금 안에서 승인 작업을 과거 상태로 되돌려 원고 잠금을 푸는 우회를 막는다. */
export async function assertStudioRolePipelineProductionMutation(query: StudioScopedSql, before: ProductionProjectAggregate,
  after: ProductionProjectAggregate): Promise<void> {
  const rows = await query.query(sql`SELECT to_regclass('creator_work_scoped_write_policy') IS NOT NULL AS available`);
  if (rows.length !== 1 || typeof rows[0]?.available !== "boolean") throw new Error("직군별 원고 보호의 준비 상태를 확인하지 못했습니다.");
  if (!rows[0].available) return;
  const pipeline = (await loadStudioScopedPolicy(query, before.workId)).rolePipeline;
  if (!pipeline?.enabled) return;
  if (pipeline.productionProjectId !== before.projectId) throw new ConflictException("원고 보호와 제작 프로젝트 연결을 확인하세요.");
  const historicalSubmissions = new Set(pipeline.history.map((entry) => entry.submissionId));
  const historicalOutputs = new Set(before.submissions.filter((entry) => historicalSubmissions.has(entry.id)).map((entry) => entry.deliverableId));
  for (const task of before.tasks) {
    const stage = pipeline.stageTasks.find((entry) => entry.taskId === task.id);
    const historical = task.outputDeliverableIds.some((id) => historicalOutputs.has(id));
    if (!historical && (!stage || (!pipeline.frozenStageIds.includes(stage.stageId) && !["conditionally-approved", "approved", "done"].includes(task.status)))) continue;
    const next = after.tasks.find((entry) => entry.id === task.id);
    const allowedStates = task.status === "conditionally-approved" ? ["conditionally-approved", "approved", "done"] : ["approved", "done"];
    if (!next || !allowedStates.includes(next.status) || canonicalJson(task.scope) !== canonicalJson(next.scope)
      || canonicalJson(task.inputRevisionRefs) !== canonicalJson(next.inputRevisionRefs)
      || canonicalJson(task.outputDeliverableIds) !== canonicalJson(next.outputDeliverableIds)) {
      throw new ConflictException("인계·승인된 작업은 보존해야 합니다. 새 제작 작업과 원고 개정본으로 재작업하세요.");
    }
    for (const id of task.outputDeliverableIds) {
      const output = before.deliverables.find((entry) => entry.id === id), changed = after.deliverables.find((entry) => entry.id === id);
      if (!output || !changed || output.currentSubmissionId !== changed.currentSubmissionId || output.approvedSubmissionId !== changed.approvedSubmissionId) {
        throw new ConflictException("인계·승인된 제출본을 교체할 수 없습니다. 새 제작 작업으로 재작업하세요.");
      }
    }
  }
}
