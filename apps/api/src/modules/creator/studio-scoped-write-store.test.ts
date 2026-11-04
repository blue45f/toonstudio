import { describe, expect, it, vi } from "vitest";
import { ConflictException, ServiceUnavailableException } from "@nestjs/common";
import { PgDialect } from "drizzle-orm/pg-core";
import { STUDIO_ROLE_PIPELINE_STAGE_IDS, type StudioRolePipelineState } from "@toonstudio/contracts/studio-role-pipeline";
import type { StudioScopedSql } from "./studio-scoped-write-store";
import { authorizeStudioScopedWrite, loadStudioScopedReceipt, studioScopedGrantIsCurrent, studioScopedPolicyForActor } from "./studio-scoped-write-store";
import { SCOPED_AT, scopedFixture } from "./studio-scoped-write.test-fixture";

describe("현재 계정·제작 배정에 묶은 명시 편집 정책", () => {
  it("현재 실제 계정과 역할·작업·기간이 모두 일치할 때만 grant를 활성화한다", () => {
    const { grant, target, aggregate } = scopedFixture();
    expect(studioScopedGrantIsCurrent(grant, [target], aggregate, "actor", SCOPED_AT)).toBe(true);
    expect(studioScopedGrantIsCurrent(grant, [target], aggregate, "other", SCOPED_AT)).toBe(false);
    expect(studioScopedGrantIsCurrent(grant, [target], aggregate, "actor", grant.endsAt ?? "")).toBe(false);
    expect(studioScopedGrantIsCurrent({ ...grant, revokedAt: SCOPED_AT }, [target], aggregate, "actor", SCOPED_AT)).toBe(false);
    expect(studioScopedGrantIsCurrent(grant, [{ ...target, revokedAt: SCOPED_AT }], aggregate, "actor", SCOPED_AT)).toBe(false);
  });

  it("계정 없는 party·다른 계정으로 바뀐 party·중복 역할·종료 작업을 허가로 대여하지 않는다", () => {
    const { grant, target, aggregate } = scopedFixture();
    for (const accountUserId of [null, "different-account"]) {
      expect(studioScopedGrantIsCurrent(grant, [target], { ...aggregate, parties: aggregate.parties.map((party) => party.id === "actor-party"
        ? { ...party, accountUserId } : party) }, "actor", SCOPED_AT)).toBe(false);
    }
    const role = aggregate.assignments.find((assignment) => assignment.id === "role");
    if (!role) throw new Error("역할이 없습니다.");
    expect(studioScopedGrantIsCurrent(grant, [target], { ...aggregate, assignments: [...aggregate.assignments, role] }, "actor", SCOPED_AT)).toBe(false);
    expect(studioScopedGrantIsCurrent(grant, [target], { ...aggregate, tasks: aggregate.tasks.map((task) => ({ ...task, status: "done" as const })) }, "actor", SCOPED_AT)).toBe(false);
  });

  it("정책보다 Production 행을 먼저 잠그고 DTO의 sourceEvidence로 edit를 승격하지 않는다", async () => {
    const { authorization, aggregate, context } = scopedFixture(), query = { query: vi.fn()
      .mockResolvedValueOnce([authorization.policy])
      .mockResolvedValueOnce([{ id: aggregate.projectId, workId: aggregate.workId, revision: aggregate.revision, aggregate }])
      .mockResolvedValueOnce([authorization.policy]).mockResolvedValueOnce([{ now: SCOPED_AT }]) } satisfies StudioScopedSql;
    const result = await authorizeStudioScopedWrite(query, authorization.work, context);
    expect(result.work.access.edit).toBe(false);
    expect(result.targets.map((target) => target.definition.id)).toEqual(["target"]);
    const dialect = new PgDialect(), statements = query.query.mock.calls.map(([statement]) => dialect.sqlToQuery(statement).sql);
    expect(statements[0]).toContain("creator_work_scoped_write_policy");
    expect(statements[1]).toContain("FOR SHARE");
    expect(statements[2]).toContain("FOR UPDATE");
  });

  it("새 정책 version·회수된 역할·grant 없는 viewer를 최신 transaction에서 거절한다", async () => {
    const { authorization, context, aggregate } = scopedFixture();
    const mismatch = { query: vi.fn().mockResolvedValueOnce([authorization.policy])
      .mockResolvedValueOnce([{ id: aggregate.projectId, workId: aggregate.workId, revision: aggregate.revision, aggregate }])
      .mockResolvedValueOnce([{ ...authorization.policy, policyVersion: 2 }]) } satisfies StudioScopedSql;
    await expect(authorizeStudioScopedWrite(mismatch, authorization.work, context)).rejects.toBeInstanceOf(ConflictException);
    await expect(authorizeStudioScopedWrite({ query: vi.fn() }, authorization.work, undefined)).rejects.toMatchObject({ code: "context" });
  });

  it("기존 owner/admin/editor의 전체 edit 계약과 무문맥 입력은 유지한다", async () => {
    const { authorization } = scopedFixture(), query = { query: vi.fn().mockResolvedValue([{ available: false }]) } satisfies StudioScopedSql;
    const full = await authorizeStudioScopedWrite(query, { ...authorization.work, access: { ...authorization.work.access, edit: true } }, undefined);
    expect(full.context).toBeNull();
    expect(query.query).toHaveBeenCalledTimes(1);
  });

  it("선행 공정이 끝난 뒤에도 stable raw 귀속은 유지하고 다음 task에 새 grant를 만들 수 있다", () => {
    const { grant, target, aggregate } = scopedFixture(), task = aggregate.tasks[0];
    if (!task) throw new Error("공정 작업이 없습니다.");
    const next = { ...aggregate, tasks: [{ ...task, status: "done" as const }, { ...task, id: "color-task", title: "밑색" }] };
    expect(studioScopedGrantIsCurrent(grant, [target], next, "actor", SCOPED_AT)).toBe(false);
    expect(studioScopedGrantIsCurrent({ ...grant, id: "next-grant", taskId: "color-task" }, [target], next, "actor", SCOPED_AT)).toBe(true);
    expect(target.definition.taskId).toBe("task");
  });

  it("알려진 mutation UUID라도 actor나 본문 hash가 다르면 영수증을 노출하지 않는다", async () => {
    const { authorization } = scopedFixture(), hash = "a".repeat(64), row = { actorUserId: "actor", requestHash: hash,
      policyVersion: 1, targetIds: ["target"], response: { revision: 4 } };
    for (const changed of [{ ...row, actorUserId: "other" }, { ...row, requestHash: "b".repeat(64) }]) {
      await expect(loadStudioScopedReceipt({ query: vi.fn().mockResolvedValue([changed]) }, authorization.work,
        "rest", "known-uuid", hash)).rejects.toBeInstanceOf(ConflictException);
    }
    expect(await loadStudioScopedReceipt({ query: vi.fn().mockResolvedValue([row]) }, authorization.work, "rest", "known-uuid", hash)).toMatchObject({ policyVersion: 1 });
  });

  it.each(["revoked", "expired"])("full 승격 뒤에도 현재 actor의 %s grant 이력은 저장 복구 필요로 투영한다", async (state) => {
    const { authorization, aggregate, grant } = scopedFixture();
    const historical = state === "revoked" ? { ...grant, revokedAt: SCOPED_AT } : { ...grant, endsAt: SCOPED_AT };
    const query = { query: vi.fn().mockResolvedValueOnce([{ available: true }])
      .mockResolvedValueOnce([{ ...authorization.policy, grants: [historical] }])
      .mockResolvedValue([{ id: aggregate.projectId, workId: aggregate.workId, revision: aggregate.revision, aggregate }]) } satisfies StudioScopedSql;
    const result = await studioScopedPolicyForActor(query, { ...authorization.work, access: { ...authorization.work.access, edit: true } });
    expect(result).toMatchObject({ fullEdit: true, scopedWrite: false, scopedWriteReady: true,
      requiresScopedSaveReconciliation: true, grants: [], targets: [], ownedEntities: [] });
  });

  it("다른 actor의 과거 grant나 정책 없는 full 사용자에게 저장 복구 이력을 대여하지 않는다", async () => {
    const { authorization, grant } = scopedFixture();
    for (const rows of [[{ ...authorization.policy, grants: [{ ...grant, actorUserId: "different-actor", revokedAt: SCOPED_AT }] }], []]) {
      const query = { query: vi.fn().mockResolvedValueOnce([{ available: true }]).mockResolvedValueOnce(rows) } satisfies StudioScopedSql;
      const result = await studioScopedPolicyForActor(query, { ...authorization.work, access: { ...authorization.work.access, edit: true } });
      expect(result).toMatchObject({ scopedWriteReady: true, requiresScopedSaveReconciliation: false, grants: [], targets: [], ownedEntities: [] });
      expect(query.query).toHaveBeenCalledTimes(2);
    }
  });

  it("정책 관계의 실제 부재만 full GET에서 준비 전·과거 이력 없음으로 표시한다", async () => {
    const { authorization } = scopedFixture(), query = { query: vi.fn().mockResolvedValue([{ available: false }]) } satisfies StudioScopedSql;
    const result = await studioScopedPolicyForActor(query, { ...authorization.work, access: { ...authorization.work.access, edit: true } });
    expect(result).toEqual({ version: 1, workId: "work", policyVersion: 0, canManage: false, fullEdit: true,
      scopedWrite: false, scopedWriteReady: false, requiresScopedSaveReconciliation: false, targets: [], grants: [], ownedEntities: [] });
    expect(query.query).toHaveBeenCalledTimes(1);
    expect(new PgDialect().sqlToQuery(query.query.mock.calls[0]?.[0] ?? (() => { throw new Error("준비 상태 SQL이 없습니다."); })()).sql).toContain("to_regclass");
    const unavailable = { query: vi.fn().mockRejectedValue({ code: "42P01" }) } satisfies StudioScopedSql;
    await expect(studioScopedPolicyForActor(unavailable, authorization.work)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("정책 준비 상태의 unknown·다른 DB 실패·손상 이력을 이력 없음으로 바꾸지 않는다", async () => {
    const { authorization } = scopedFixture(), work = { ...authorization.work, access: { ...authorization.work.access, edit: true } };
    await expect(studioScopedPolicyForActor({ query: vi.fn().mockResolvedValue([{ available: null }]) }, work)).rejects.toThrow("준비 상태");
    for (const failure of [{ code: "08006" }, { code: "42501" }]) {
      await expect(studioScopedPolicyForActor({ query: vi.fn().mockRejectedValue(failure) }, work)).rejects.toBe(failure);
      const query = { query: vi.fn().mockResolvedValueOnce([{ available: true }]).mockRejectedValue(failure) } satisfies StudioScopedSql;
      await expect(studioScopedPolicyForActor(query, work)).rejects.toBe(failure);
    }
    const damaged = { query: vi.fn().mockResolvedValueOnce([{ available: true }]).mockResolvedValueOnce([{ policyVersion: 1, grants: [] }]) } satisfies StudioScopedSql;
    await expect(studioScopedPolicyForActor(damaged, work)).rejects.toBeDefined();
  });

  it("승인으로 편집 grant가 끝난 현재 담당자도 실제 배정·기간에 맞으면 인계 가능 여부를 받는다", async () => {
    const f = scopedFixture(), aggregate = { ...f.aggregate, tasks: f.aggregate.tasks.map((task) => ({ ...task, status: "approved" as const })) };
    const pipeline: StudioRolePipelineState = { version: 1, enabled: true, productionProjectId: aggregate.projectId,
      roleBindings: [{ roleId: "story", assignmentId: "role" }], groupMappings: [{ groupId: "story-notes", targetIds: ["target"] }],
      stageTasks: STUDIO_ROLE_PIPELINE_STAGE_IDS.map((stageId, index) => ({ stageId, taskId: index === 0 ? "task" : `task-${index}` })),
      activeStageId: "story-script", frozenStageIds: [], approvedAt: null, history: [] };
    const project = async (current = aggregate, state = pipeline, work = f.authorization.work) => {
      const query = { query: vi.fn() } satisfies StudioScopedSql;
      if (work.access.edit) query.query.mockResolvedValueOnce([{ available: true }]);
      query.query.mockResolvedValueOnce([{ ...f.authorization.policy, rolePipeline: state }])
        .mockResolvedValue([{ id: current.projectId, workId: current.workId, revision: current.revision, aggregate: current }]);
      return studioScopedPolicyForActor(query, work);
    };
    expect(await project()).toMatchObject({ scopedWrite: false,
      rolePipelineAccess: { editableTargetIds: [], frozenTargetIds: ["target"], canHandoff: true } });
    const variants = [
      { ...aggregate, tasks: aggregate.tasks.map((task) => ({ ...task, assignmentIds: [] })) },
      { ...aggregate, assignments: aggregate.assignments.map((role) => role.id === "role" ? { ...role, status: "paused" as const } : role) },
      { ...aggregate, assignments: aggregate.assignments.map((role) => role.id === "role" ? { ...role, endsAt: SCOPED_AT } : role) },
      { ...aggregate, parties: aggregate.parties.map((party) => party.id === "actor-party" ? { ...party, accountUserId: "another-account" } : party) },
    ];
    for (const current of variants) expect((await project(current)).rolePipelineAccess?.canHandoff).toBe(false);
    expect((await project(aggregate, { ...pipeline, roleBindings: [{ roleId: "story", assignmentId: "other-role" }] })).rolePipelineAccess?.canHandoff).toBe(false);
    const manager = { ...f.authorization.work, access: { ...f.authorization.work.access, edit: true, manageMembers: true } };
    expect((await project(variants[0], pipeline, manager)).rolePipelineAccess?.canHandoff).toBe(true);
    expect((await project(aggregate, { ...pipeline, approvedAt: SCOPED_AT }, manager)).rolePipelineAccess?.canHandoff).toBe(false);
  });
});
