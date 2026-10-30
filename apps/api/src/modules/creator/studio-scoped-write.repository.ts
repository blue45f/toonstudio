import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { StudioScopedWriteManagementCommandSchema, type StudioScopedWriteGrant,
  type StudioScopedWriteManagementCommand, type StudioScopedWritePolicy,
  type StudioScopedWriteTarget } from "@toonstudio/contracts/studio-scoped-write";
import { projectScope, scopeContains } from "@toonstudio/core/production";
import { db } from "../../platform/database";
import { getVerifiedProductionTaskOutputCaptures } from "../production-collaboration/production-task-output-source";
import { studioReviewCaptureFromOperation, studioReviewResolutionCaptureQuery } from "../studio-project-graph/studio-review-capture-attestation";
import { studioCrdtWorkAdvisoryLockQuery } from "./studio-crdt.repository";
import { loadStudioScopedCrdtAuthority } from "./studio-scoped-crdt-authority";
import { projectStudioScopedAuthoringDocument, scopedEntityKey, scopedRecord, StudioScopedWriteDeniedError,
  validateStudioScopedWriteTarget } from "./studio-scoped-write-effects";
import { loadStudioScopedPolicy, loadStudioScopedProduction, loadStudioScopedReceipt, lockStudioScopedWork,
  studioScopedDrizzle, studioScopedGrantIsCurrent, studioScopedPolicyForActor, studioScopedRequestHash,
  type StudioScopedSql, type StudioScopedStoredPolicy, type StudioScopedWork } from "./studio-scoped-write-store";

/** 관리자가 실제 저장 원고와 현재 제작 배정을 검증한 뒤 독립 권한을 만든다. */
export class StudioScopedWriteRepository {
  async read(actorUserId: string, workId: string): Promise<StudioScopedWritePolicy> {
    return db.transaction(async (transaction) => {
      await transaction.execute(studioCrdtWorkAdvisoryLockQuery(workId));
      const query = studioScopedDrizzle(transaction), work = await lockStudioScopedWork(query, workId, actorUserId);
      return studioScopedPolicyForActor(query, work);
    });
  }

  async manage(actorUserId: string, workId: string, raw: StudioScopedWriteManagementCommand): Promise<StudioScopedWritePolicy> {
    const input = StudioScopedWriteManagementCommandSchema.parse(raw);
    return db.transaction(async (transaction) => {
      await transaction.execute(studioCrdtWorkAdvisoryLockQuery(workId));
      const query = studioScopedDrizzle(transaction), work = await lockStudioScopedWork(query, workId, actorUserId, true);
      if (!work.access.manageMembers) throw new ForbiddenException("제작 관리자만 편집 범위를 연결할 수 있습니다.");
      const requestHash = studioScopedRequestHash(input);
      const receipt = await loadStudioScopedReceipt(query, work, "management", input.mutationId, requestHash);
      // 과거 성공을 재실행하지 않고 현재 계정에 보이는 정책을 다시 반환한다.
      if (receipt) return studioScopedPolicyForActor(query, work);
      const hint = await loadStudioScopedPolicy(query, workId);
      const projectId = input.command.type === "register-target" ? input.command.target.productionProjectId
        : input.command.type === "grant" ? input.command.productionProjectId : undefined;
      const aggregate = projectId ? await loadStudioScopedProduction(query, workId, projectId) : null;
      const current = await loadStudioScopedPolicy(query, workId, true);
      if (input.expectedPolicyVersion !== current.policyVersion || current.policyVersion !== hint.policyVersion) {
        throw new ConflictException({ code: "studio_scoped_policy_changed", policyVersion: current.policyVersion,
          message: "편집 정책이 변경됐습니다. 현재 범위를 확인한 뒤 다시 적용하세요." });
      }
      if (current.policyVersion >= 2_147_483_647) throw new ConflictException("편집 정책 버전 한도에 도달했습니다.");
      let targets = [...current.targets], grants = [...current.grants];
      const ownership = { ...current.ownership }, command = input.command;
      if (command.type === "register-target") {
        if (!aggregate || targets.some((target) => target.definition.id === command.target.id)) throw new ConflictException("기존 범위 ID를 다시 사용할 수 없습니다.");
        const task = aggregate.tasks.find((entry) => entry.id === command.target.taskId);
        if (!task || !scopeContains(projectScope(aggregate.projectId), command.target.scope)
          || !scopeContains(task.scope, command.target.scope)
          || ["conditionally-approved", "approved", "done", "cancelled", "out-of-scope"].includes(task.status)
          || command.target.source.workId !== workId) throw new StudioScopedWriteDeniedError("policy");
        const capture = (await getVerifiedProductionTaskOutputCaptures(transaction, aggregate, { output: { subject: command.target.source } })).output;
        const page = capture.pages.find((candidate) => candidate.pageId === command.target.pageId);
        if (!page || (command.target.frameId !== null && !page.frameIds.includes(command.target.frameId))) throw new BadRequestException("검수 원고의 실제 페이지와 프레임을 선택하세요.");
        const target: StudioScopedWriteTarget = { definition: command.target, sourceServerRevision: capture.sourceServerRevision,
          captureSequence: capture.captureSequence, createdBy: actorUserId, createdAt: work.now, revokedAt: null };
        const proofRows = await transaction.execute(studioReviewResolutionCaptureQuery(command.target.source.artifactId, [command.target.source.reviewId]));
        const proofRow = scopedRecord(proofRows.rows[0]), operation = scopedRecord(proofRow?.capture)?.operation;
        const proof = proofRows.rows.length === 1 ? studioReviewCaptureFromOperation(operation, command.target.source, proofRow?.receipt) : null;
        if (!proof || target.sourceServerRevision > work.revision) throw new StudioScopedWriteDeniedError("ambiguous");
        // 캡처와 현재 저장본 양쪽에 실제 ID가 존재하고 같은 효과 범위임을 검증한다.
        validateStudioScopedWriteTarget(target, projectStudioScopedAuthoringDocument(proof.payload.sourceSnapshot), new Map());
        const authority = await loadStudioScopedCrdtAuthority(transaction, workId, work.document);
        if (command.target.entities.some((entry) => entry.kind === "surface" && !authority.state.entities.has(scopedEntityKey(entry.kind, entry.id)))) {
          throw new StudioScopedWriteDeniedError("ambiguous");
        }
        const created = validateStudioScopedWriteTarget(target, authority.state, new Map(Object.entries(ownership)));
        for (const entry of created) ownership[scopedEntityKey(entry.kind, entry.id, target.definition.pageId)] = entry.targetId;
        targets.push(target);
      } else if (command.type === "grant") {
        if (!aggregate || grants.some((grant) => grant.id === command.id)) throw new ConflictException("기존 배정 ID를 다시 사용할 수 없습니다.");
        const roles = aggregate.assignments.filter((entry) => entry.id === command.assignmentId), role = roles[0];
        const party = role && aggregate.parties.find((entry) => entry.id === role.partyId);
        if (roles.length !== 1 || !role || !party?.accountUserId || party.status !== "active") throw new StudioScopedWriteDeniedError("policy");
        const actor = await query.query(sql`SELECT member.role,member.status,account.status AS "accountStatus"
          FROM creator_work_collaborator member JOIN "user" account ON account.id=member."userId"
          WHERE member."workId"=${workId} AND member."userId"=${party.accountUserId} FOR SHARE OF member,account`);
        if (actor.length !== 1 || actor[0]?.status !== "active" || actor[0]?.accountStatus !== "active"
          || !["viewer", "commenter"].includes(String(actor[0]?.role))) throw new BadRequestException("현재 작품의 활성 열람·댓글 계정에만 제한 편집을 배정할 수 있습니다.");
        const grant: StudioScopedWriteGrant = { id: command.id, actorUserId: party.accountUserId, assignmentId: role.id,
          taskId: command.taskId, productionProjectId: aggregate.projectId, targetIds: command.targetIds, startsAt: command.startsAt, endsAt: command.endsAt,
          createdBy: actorUserId, createdAt: work.now, revokedAt: null };
        const starts = Date.parse(grant.startsAt), ends = grant.endsAt === null ? Infinity : Date.parse(grant.endsAt);
        if (starts < Date.parse(role.startsAt) || ends <= starts || (role.endsAt !== null && ends > Date.parse(role.endsAt))
          || !studioScopedGrantIsCurrent(grant, targets, aggregate, party.accountUserId, grant.startsAt)) throw new StudioScopedWriteDeniedError("policy");
        grants.push(grant);
      } else if (command.type === "revoke-target") {
        if (!targets.some((target) => target.definition.id === command.targetId && target.revokedAt === null)) throw new ConflictException("현재 활성 범위를 선택하세요.");
        targets = targets.map((target) => target.definition.id === command.targetId ? { ...target, revokedAt: work.now } : target);
      } else {
        if (!grants.some((grant) => grant.id === command.grantId && grant.revokedAt === null)) throw new ConflictException("현재 활성 배정을 선택하세요.");
        grants = grants.map((grant) => grant.id === command.grantId ? { ...grant, revokedAt: work.now } : grant);
      }
      const policy = { policyVersion: current.policyVersion + 1, targets, grants, ownership };
      await this.persist(query, work, policy, input, requestHash);
      return studioScopedPolicyForActor(query, work);
    });
  }

  private async persist(query: StudioScopedSql, work: StudioScopedWork, policy: StudioScopedStoredPolicy,
    input: StudioScopedWriteManagementCommand, requestHash: string): Promise<void> {
    await query.query(sql`INSERT INTO creator_work_scoped_write_policy ("workId","policyVersion",targets,grants,ownership,"updatedBy","updatedAt")
      VALUES (${work.workId},${policy.policyVersion},${JSON.stringify(policy.targets)}::jsonb,${JSON.stringify(policy.grants)}::jsonb,
        ${JSON.stringify(policy.ownership)}::jsonb,${work.actorUserId},${work.now}::timestamptz)
      ON CONFLICT ("workId") DO UPDATE SET "policyVersion"=excluded."policyVersion",targets=excluded.targets,
        grants=excluded.grants,ownership=excluded.ownership,"updatedBy"=excluded."updatedBy","updatedAt"=excluded."updatedAt"`);
    await query.query(sql`INSERT INTO creator_work_scoped_write_receipt ("workId",kind,"mutationId","actorUserId","requestHash","policyVersion","targetIds",response,"createdAt")
      VALUES (${work.workId},'management',${input.mutationId},${work.actorUserId},${requestHash},${policy.policyVersion},'[]'::jsonb,
        ${JSON.stringify({ version: 1, policyVersion: policy.policyVersion })}::jsonb,${work.now}::timestamptz)`);
  }
}
