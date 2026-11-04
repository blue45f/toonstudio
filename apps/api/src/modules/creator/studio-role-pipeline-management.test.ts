import { randomUUID } from "node:crypto";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import type { Deliverable, ProductionProjectAggregate, ProductionTask, RevisionRef, Submission } from "@toonstudio/core/production";
import { STUDIO_ROLE_PIPELINE_STAGES, StudioRolePipelineStateSchema, type StudioRolePipelineConfiguration,
  type StudioRolePipelineManagement, type StudioRolePipelineState } from "@toonstudio/contracts/studio-role-pipeline";
import type { StudioScopedWriteManagementCommand } from "@toonstudio/contracts/studio-scoped-write";
import { applyStudioRolePipelineManagement, assertStudioRolePipelineProductionMutation, isStudioRolePipelineManagement,
  studioRolePipelineProjectId } from "./studio-role-pipeline-management";
import type { StudioScopedSql, StudioScopedStoredPolicy, StudioScopedWork } from "./studio-scoped-write-store";
import { SCOPED_AT, scopedDocument, scopedFixture } from "./studio-scoped-write.test-fixture";

const account = [{ accountStatus: "active", memberStatus: "active", memberRole: "viewer" }];
const baseline: RevisionRef = { id: "initial", lineage: "integrated", revision: 1, digest: `sha256:${"a".repeat(64)}`, createdAt: SCOPED_AT };
const dialect = new PgDialect();
function fixture() {
  const original = scopedFixture(), originalTask = original.aggregate.tasks[0];
  if (!originalTask) throw new Error("공정 작업 fixture가 없습니다.");
  const configuration: StudioRolePipelineConfiguration = { productionProjectId: "production",
    roleBindings: [{ roleId: "creator", assignmentId: "role" }],
    stageTasks: STUDIO_ROLE_PIPELINE_STAGES.map((stage) => ({ stageId: stage.id, taskId: `task-${stage.id}` })),
    groupMappings: STUDIO_ROLE_PIPELINE_STAGES.map((stage) => {
      const groupId = stage.groupIds[0]; if (!groupId) throw new Error("공정 레이어 fixture가 없습니다.");
      return { groupId, targetIds: [`target-${stage.id}`] };
    }) };
  const tasks: ProductionTask[] = configuration.stageTasks.map((stage) => ({ ...originalTask, id: stage.taskId,
    status: "draft", inputRevisionRefs: [baseline], outputDeliverableIds: [], dependencyTaskIds: [] }));
  let aggregate: ProductionProjectAggregate = { ...original.aggregate, revision: 5, tasks };
  const work: StudioScopedWork = { ...original.authorization.work, actorUserId: "owner",
    work: { id: "work", userId: "owner", revision: 3, title: "보존할 원고", doc: scopedDocument(), cover: "보존할 표지" },
    access: { view: true, edit: true, comment: true, manageMembers: true, respondInvite: false } };
  let current: StudioScopedStoredPolicy = { policyVersion: 3, rolePipeline: null, ownership: { "stroke:own": "target-story-script" },
    grants: [original.grant], targets: configuration.stageTasks.map((entry) => ({ ...original.target, definition: {
      ...original.target.definition, id: `target-${entry.stageId}`, taskId: entry.taskId, frameId: `frame-${entry.stageId}`, layerId: `layer-${entry.stageId}`,
    } })) };
  const query = vi.fn<StudioScopedSql["query"]>().mockResolvedValue(account);
  const run = (command: StudioRolePipelineManagement, nextWork = work) => {
    const input: StudioScopedWriteManagementCommand = { mutationId: randomUUID(), expectedPolicyVersion: current.policyVersion, command };
    return applyStudioRolePipelineManagement({ query }, nextWork, current, aggregate, input, command);
  };
  const configure = async () => { current = await run({ type: "configure-role-pipeline", configuration }); return current; };
  const approve = (index: number) => {
    const task = aggregate.tasks[index]; if (!task) throw new Error("승인 공정 fixture가 없습니다.");
    const reference: RevisionRef = { ...baseline, id: `output-${task.id}`, lineage: "visual", revision: index + 2,
      productionSubmissionId: `submission-${task.id}` };
    const output: Deliverable = { id: `deliverable-${task.id}`, projectId: aggregate.projectId, scope: task.scope, type: "thumbnail",
      expectedFormat: "studio-document", completionCriteria: ["현재 승인 확인"], currentSubmissionId: `submission-${task.id}`, approvedSubmissionId: `submission-${task.id}` };
    const submission: Submission = { id: `submission-${task.id}`, projectId: aggregate.projectId, deliverableId: output.id,
      revisionRef: reference, submittedByAssignmentId: "role", submittedAt: SCOPED_AT, status: "approved", inputRevisionRefs: task.inputRevisionRefs, evidenceRefs: ["approved-review"] };
    aggregate = { ...aggregate, tasks: aggregate.tasks.map((entry) => entry.id === task.id ? { ...entry, status: "approved", outputDeliverableIds: [output.id] } : entry),
      deliverables: [...aggregate.deliverables, output], submissions: [...aggregate.submissions, submission] };
    return reference;
  };
  const pinNext = (index: number, reference: RevisionRef) => {
    const previous = aggregate.tasks[index], next = aggregate.tasks[index + 1];
    if (!previous || !next) throw new Error("후속 공정 fixture가 없습니다.");
    aggregate = { ...aggregate, tasks: aggregate.tasks.map((entry) => entry.id === next.id
      ? { ...entry, dependencyTaskIds: [previous.id], inputRevisionRefs: [reference] } : entry) };
  };
  const handoff = () => run({ type: "handoff-role-pipeline", expectedProjectRevision: aggregate.revision });
  const preparedHandoff = async () => { await configure(); const output = approve(0); pinNext(0, output); };
  const freshTasks = () => {
    const next = { ...configuration, stageTasks: configuration.stageTasks.map((entry) => ({ ...entry, taskId: `new-${entry.taskId}` })) };
    aggregate = { ...aggregate, tasks: [...aggregate.tasks, ...aggregate.tasks.slice(0, 8).map((entry) => ({ ...entry, id: `new-${entry.id}`,
      status: "draft" as const, inputRevisionRefs: [], outputDeliverableIds: [], dependencyTaskIds: [] }))] };
    return next;
  };
  const statements = () => query.mock.calls.map(([statement]) => dialect.sqlToQuery(statement));
  const writes = () => statements().filter((statement) => /^(?:UPDATE|INSERT)/u.test(statement.sql));
  return { work, configuration, query, run, configure, approve, pinNext, handoff, preparedHandoff, freshTasks, statements, writes,
    current: () => current, setCurrent: (value: StudioScopedStoredPolicy) => { current = value; },
    aggregate: () => aggregate, setAggregate: (value: ProductionProjectAggregate) => { aggregate = value; } };
}

function pipeline(policy: StudioScopedStoredPolicy): StudioRolePipelineState {
  return StudioRolePipelineStateSchema.parse(policy.rolePipeline);
}

describe("실제 계정·제작 작업을 사용하는 직군 보호 관리", () => {
  it("기본 OFF에서 관리자의 명시 설정만 첫 공정 grant를 만들고 기존 정책·배정을 보존한다", async () => {
    const f = fixture(), before = structuredClone(f.current());
    const configured = await f.run({ type: "configure-role-pipeline", configuration: f.configuration });
    expect(f.current()).toEqual(before); expect(configured.grants[0]).toEqual(before.grants[0]);
    expect(pipeline(configured)).toMatchObject({ enabled: true, activeStageId: "story-script", history: [], frozenStageIds: [], approvedAt: null });
    expect(configured.grants.slice(1)).toMatchObject([{ actorUserId: "actor", assignmentId: "role", taskId: "task-story-script", targetIds: ["target-story-script"] }]);
    expect(f.writes()).toEqual([]);
  });

  it("프로필 직군이나 잘못된 명령을 실제 프로젝트·관리 권한으로 승격하지 않는다", async () => {
    const f = fixture(), configure = { type: "configure-role-pipeline" as const, configuration: f.configuration };
    expect(isStudioRolePipelineManagement(configure)).toBe(true);
    expect(isStudioRolePipelineManagement({ type: "revoke-grant", grantId: "profile-creator" })).toBe(false);
    expect(studioRolePipelineProjectId(configure, f.current())).toBe("production");
    expect(() => studioRolePipelineProjectId({ type: "disable-role-pipeline" }, f.current())).toThrow();
    for (const command of [configure, { type: "disable-role-pipeline" } as const,
      { type: "restart-role-pipeline", configuration: f.configuration, expectedWorkRevision: 3 } as const]) {
      await expect(f.run(command, { ...f.work, actorUserId: "actor", access: { ...f.work.access, manageMembers: false } })).rejects.toMatchObject({ status: 403 });
    }
    expect(f.query).not.toHaveBeenCalled();
  });

  it.each(["다른 작품", "회수된 범위", "겹치는 실제 범위", "정지된 계정"])("%s는 설정·grant를 만들지 않는다", async (reason) => {
    const f = fixture();
    if (reason === "다른 작품") f.setAggregate({ ...f.aggregate(), workId: "foreign-work" });
    if (reason === "회수된 범위") f.setCurrent({ ...f.current(), targets: f.current().targets.map((target, index) => index === 0 ? { ...target, revokedAt: SCOPED_AT } : target) });
    if (reason === "겹치는 실제 범위") {
      const first = f.current().targets[0]; if (!first) throw new Error("보호 범위 fixture가 없습니다.");
      f.setCurrent({ ...f.current(), targets: f.current().targets.map((target, index) => index === 1 ? { ...target, definition: { ...target.definition,
        pageId: first.definition.pageId, frameId: first.definition.frameId, layerId: first.definition.layerId } } : target) });
    }
    if (reason === "정지된 계정") f.query.mockResolvedValue([{ accountStatus: "suspended", memberStatus: "active", memberRole: "viewer" }]);
    await expect(f.configure()).rejects.toMatchObject({ status: 400 }); expect(f.writes()).toEqual([]);
  });

  it("정책을 끄거나 재설정해서 인계·승인 동결을 해제할 수 없다", async () => {
    const f = fixture(); await f.preparedHandoff(); f.setCurrent(await f.handoff());
    const before = structuredClone(f.current());
    await expect(f.run({ type: "configure-role-pipeline", configuration: f.configuration })).rejects.toMatchObject({ status: 409 });
    await expect(f.run({ type: "disable-role-pipeline" })).rejects.toMatchObject({ status: 409 });
    expect(f.current()).toEqual(before); expect(f.writes()).toEqual([]);
  });

  it("동일 정책에서 제작 revision이 바뀐 인계와 타인 역할 사칭을 거절한다", async () => {
    const f = fixture(); await f.preparedHandoff();
    await expect(f.run({ type: "handoff-role-pipeline", expectedProjectRevision: f.aggregate().revision - 1 })).rejects.toMatchObject({ status: 409 });
    await expect(f.run({ type: "handoff-role-pipeline", expectedProjectRevision: f.aggregate().revision },
      { ...f.work, actorUserId: "other", access: { ...f.work.access, manageMembers: false } })).rejects.toMatchObject({ status: 403 });
    expect(f.current().rolePipeline?.history).toEqual([]); expect(f.writes()).toEqual([]);
  });

  it.each(["미승인 작업", "새 미승인 제출", "승인본 교체", "다음 의존 누락", "다음 입력이 과거본"])("%s이면 인계·이전 동결·다음 grant가 함께 거절된다", async (reason) => {
    const f = fixture(); await f.preparedHandoff(); const aggregate = f.aggregate();
    if (reason === "미승인 작업") f.setAggregate({ ...aggregate, tasks: aggregate.tasks.map((task, index) => index === 0 ? { ...task, status: "in-progress" } : task) });
    if (reason === "새 미승인 제출") f.setAggregate({ ...aggregate, submissions: aggregate.submissions.map((submission) => ({ ...submission, status: "submitted" })) });
    if (reason === "승인본 교체") f.setAggregate({ ...aggregate, deliverables: aggregate.deliverables.map((output) => ({ ...output, currentSubmissionId: "new-unapproved" })) });
    if (reason === "다음 의존 누락") f.setAggregate({ ...aggregate, tasks: aggregate.tasks.map((task, index) => index === 1 ? { ...task, dependencyTaskIds: [] } : task) });
    if (reason === "다음 입력이 과거본") f.setAggregate({ ...aggregate, tasks: aggregate.tasks.map((task, index) => index === 1 ? { ...task, inputRevisionRefs: [baseline] } : task) });
    const before = structuredClone(f.current());
    await expect(f.handoff()).rejects.toMatchObject({ status: 400 }); expect(f.current()).toEqual(before); expect(f.writes()).toEqual([]);
  });

  it("현재 공정의 선행 입력이 재제출로 낡으면 이미 승인된 출력으로 다음 공정을 열 수 없다", async () => {
    const f = fixture(); await f.preparedHandoff(); f.setCurrent(await f.handoff());
    const second = f.approve(1); f.pinNext(1, second);
    const aggregate = f.aggregate(), first = aggregate.submissions[0]; if (!first) throw new Error("선행 제출 fixture가 없습니다.");
    const replacement: Submission = { ...first, id: "new-approved-upstream", revisionRef: { ...first.revisionRef, id: "new-upstream", revision: 99,
      productionSubmissionId: "new-approved-upstream" } };
    f.setAggregate({ ...aggregate, deliverables: aggregate.deliverables.map((output, index) => index === 0
      ? { ...output, currentSubmissionId: replacement.id, approvedSubmissionId: replacement.id } : output),
      submissions: [...aggregate.submissions, replacement] });
    await expect(f.handoff()).rejects.toMatchObject({ status: 400 });
    expect(f.current().rolePipeline?.activeStageId).toBe("storyboard-conte");
  });

  it("활성 공정이 직전 공정 의존성을 삭제한 별도 입력으로 승인되어도 공정 계보를 우회하지 못한다", async () => {
    const f = fixture(); await f.preparedHandoff(); f.setCurrent(await f.handoff());
    f.setAggregate({ ...f.aggregate(), tasks: f.aggregate().tasks.map((task, index) => index === 1
      ? { ...task, dependencyTaskIds: [], inputRevisionRefs: [baseline] } : task) });
    const reference = f.approve(1); f.pinNext(1, reference);
    await expect(f.handoff()).rejects.toMatchObject({ status: 400 });
  });

  it("현재 담당자 인계가 이전 grant만 회수하고 다음 공정 grant·동결·이력을 함께 반환한다", async () => {
    const f = fixture(); await f.preparedHandoff(); const previous = f.current();
    const result = await f.run({ type: "handoff-role-pipeline", expectedProjectRevision: f.aggregate().revision },
      { ...f.work, actorUserId: "actor", access: { ...f.work.access, manageMembers: false } });
    expect(result.grants[0]).toEqual(previous.grants[0]);
    expect(result.grants.filter((grant) => grant.id.startsWith("role-pipeline:") && grant.revokedAt === null)).toMatchObject([
      { taskId: "task-storyboard-conte", targetIds: ["target-storyboard-conte"] },
    ]);
    expect(result.grants.find((grant) => grant.taskId === "task-story-script")?.revokedAt).toBe(SCOPED_AT);
    expect(pipeline(result)).toMatchObject({ activeStageId: "storyboard-conte", frozenStageIds: ["story-script"], history: [
      { kind: "handoff", actorUserId: "actor", fromStageId: "story-script", toStageId: "storyboard-conte", submissionId: "submission-task-story-script" },
    ] });
    expect(f.current()).toEqual(previous);
  });

  it("여덟 공정 모두 현재 승인을 거쳐 마지막 인계에서 최종 동결하고 새 grant를 발급하지 않는다", async () => {
    const f = fixture(); await f.configure();
    for (let index = 0; index < 8; index += 1) {
      const reference = f.approve(index); if (index < 7) f.pinNext(index, reference);
      f.setCurrent(await f.handoff());
    }
    expect(pipeline(f.current())).toMatchObject({ approvedAt: SCOPED_AT, history: expect.any(Array) });
    expect(f.current().rolePipeline?.history).toHaveLength(8); expect(f.current().rolePipeline?.frozenStageIds).toHaveLength(8);
    expect(f.current().grants.filter((grant) => grant.id.startsWith("role-pipeline:") && grant.revokedAt === null)).toEqual([]);
    await expect(f.handoff()).rejects.toMatchObject({ status: 409 });
  });

  it("다음 공정 담당 계정이 회수되면 현재 정책을 변경하지 않고 인계를 거절한다", async () => {
    const f = fixture(); await f.preparedHandoff(); const before = structuredClone(f.current());
    f.query.mockResolvedValue([{ accountStatus: "active", memberStatus: "declined", memberRole: "viewer" }]);
    await expect(f.handoff()).rejects.toMatchObject({ status: 400 }); expect(f.current()).toEqual(before);
  });

  it("재작업은 새 여덟 작업과 원고 CAS를 사용하며 승인 이력·원고 snapshot을 보존한다", async () => {
    const f = fixture(); await f.preparedHandoff(); f.setCurrent(await f.handoff()); const old = structuredClone(f.current());
    const configuration = f.freshTasks(); f.query.mockClear();
    f.query.mockResolvedValueOnce(account).mockResolvedValueOnce([{ revision: 4 }]).mockResolvedValueOnce([]).mockResolvedValueOnce(account);
    const result = await f.run({ type: "restart-role-pipeline", configuration, expectedWorkRevision: 3 });
    expect(pipeline(result)).toMatchObject({ activeStageId: "story-script", frozenStageIds: [], approvedAt: null });
    expect(result.rolePipeline?.history.slice(0, old.rolePipeline?.history.length)).toEqual(old.rolePipeline?.history);
    expect(result.rolePipeline?.history.at(-1)).toMatchObject({ kind: "restart", submissionId: "submission-task-story-script", toStageId: "story-script" });
    expect(f.writes().map((entry) => entry.sql.split(" ").slice(0, 3).join(" "))).toEqual(["UPDATE creator_work SET", "INSERT INTO creator_work_revision"]);
    const snapshot = f.writes()[1]?.params[2]; if (typeof snapshot !== "string") throw new Error("재작업 snapshot이 없습니다.");
    expect(JSON.parse(snapshot)).toMatchObject({ title: "보존할 원고", cover: "보존할 표지", doc: scopedDocument() });
    expect(f.current()).toEqual(old);
  });

  it("이전 작업 재사용·낡은 원고 revision·SQL CAS 충돌은 재작업 snapshot을 만들지 않는다", async () => {
    const f = fixture(); await f.preparedHandoff(); f.setCurrent(await f.handoff());
    await expect(f.run({ type: "restart-role-pipeline", configuration: f.configuration, expectedWorkRevision: 3 })).rejects.toMatchObject({ status: 400 });
    const configuration = f.freshTasks();
    await expect(f.run({ type: "restart-role-pipeline", configuration, expectedWorkRevision: 2 })).rejects.toMatchObject({ status: 409 });
    f.query.mockClear(); f.query.mockResolvedValueOnce(account).mockResolvedValueOnce([]);
    await expect(f.run({ type: "restart-role-pipeline", configuration, expectedWorkRevision: 3 })).rejects.toMatchObject({ status: 409 });
    expect(f.writes()).toHaveLength(1); expect(f.writes()[0]?.sql).toContain("AND revision=");
    expect(f.statements().some((entry) => entry.sql.startsWith("INSERT INTO creator_work_revision"))).toBe(false);
  });
});

describe("일반 Production 명령의 인계·승인 잠금 우회 차단", () => {
  function guardQuery(policy: StudioScopedStoredPolicy) {
    return vi.fn<StudioScopedSql["query"]>().mockResolvedValueOnce([{ available: true }]).mockResolvedValueOnce([{ ...policy }]);
  }

  it("정책 테이블이 없는 레거시와 명시 OFF는 현재 제작 기능을 바꾸지 않고 읽기만 한다", async () => {
    const f = fixture(), missing = vi.fn<StudioScopedSql["query"]>().mockResolvedValue([{ available: false }]);
    await expect(assertStudioRolePipelineProductionMutation({ query: missing }, f.aggregate(), { ...f.aggregate(), tasks: [] })).resolves.toBeUndefined();
    expect(missing).toHaveBeenCalledTimes(1);
    for (const rolePipeline of [null, { ...pipeline(await f.configure()), enabled: false }]) {
      const query = guardQuery({ ...f.current(), rolePipeline });
      await expect(assertStudioRolePipelineProductionMutation({ query }, f.aggregate(), { ...f.aggregate(), tasks: [] })).resolves.toBeUndefined();
      expect(query.mock.calls.every(([statement]) => /^SELECT/u.test(dialect.sqlToQuery(statement).sql))).toBe(true);
    }
  });

  it.each(["작업 삭제", "미승인 상태 복귀", "범위 변경", "고정 입력 교체", "출력 목록 교체", "현재 제출 교체", "승인 제출 교체"])("%s는 일반 명령으로도 동결을 해제할 수 없다", async (reason) => {
    const f = fixture(); await f.preparedHandoff(); f.setCurrent(await f.handoff()); const before = f.aggregate();
    let after = structuredClone(before);
    if (reason === "작업 삭제") after = { ...after, tasks: after.tasks.slice(1) };
    if (reason === "미승인 상태 복귀") after = { ...after, tasks: after.tasks.map((task, index) => index === 0 ? { ...task, status: "draft" } : task) };
    if (reason === "범위 변경") after = { ...after, tasks: after.tasks.map((task, index) => index === 0 ? { ...task, scope: { ...task.scope, id: "other-cut" } } : task) };
    if (reason === "고정 입력 교체") after = { ...after, tasks: after.tasks.map((task, index) => index === 0 ? { ...task, inputRevisionRefs: [] } : task) };
    if (reason === "출력 목록 교체") after = { ...after, tasks: after.tasks.map((task, index) => index === 0 ? { ...task, outputDeliverableIds: [] } : task) };
    if (reason === "현재 제출 교체") after = { ...after, deliverables: after.deliverables.map((output) => ({ ...output, currentSubmissionId: "replacement" })) };
    if (reason === "승인 제출 교체") after = { ...after, deliverables: after.deliverables.map((output) => ({ ...output, approvedSubmissionId: null })) };
    const query = guardQuery(f.current());
    await expect(assertStudioRolePipelineProductionMutation({ query }, before, after)).rejects.toMatchObject({ status: 409 });
    expect(query.mock.calls.every(([statement]) => !dialect.sqlToQuery(statement).sql.includes("pg_advisory_xact_lock"))).toBe(true);
  });

  it("제작 프로젝트가 다르거나 정책 준비 상태가 모호하면 열린 권한으로 추정하지 않는다", async () => {
    const f = fixture(); await f.configure();
    const wrong = guardQuery({ ...f.current(), rolePipeline: { ...pipeline(f.current()), productionProjectId: "other-project" } });
    await expect(assertStudioRolePipelineProductionMutation({ query: wrong }, f.aggregate(), f.aggregate())).rejects.toMatchObject({ status: 409 });
    const unknown = vi.fn<StudioScopedSql["query"]>().mockResolvedValue([]);
    await expect(assertStudioRolePipelineProductionMutation({ query: unknown }, f.aggregate(), f.aggregate())).rejects.toThrow();
  });

  it("승인에서 완료로의 전환과 새 작업 추가는 기존 고정 산출물을 보존하면 허용한다", async () => {
    const f = fixture(); await f.preparedHandoff(); f.setCurrent(await f.handoff()); f.freshTasks();
    const before = f.aggregate(), after = { ...before, tasks: before.tasks.map((task, index) => index === 0 ? { ...task, status: "done" as const } : task) };
    await expect(assertStudioRolePipelineProductionMutation({ query: guardQuery(f.current()) }, before, after)).resolves.toBeUndefined();
  });

  it("새 여덟 작업으로 재작업해도 이전 인계 이력의 승인 작업 삭제·재개는 거절한다", async () => {
    const f = fixture(); await f.preparedHandoff(); f.setCurrent(await f.handoff()); const configuration = f.freshTasks();
    f.query.mockResolvedValueOnce(account).mockResolvedValueOnce([{ revision: 4 }]).mockResolvedValueOnce([]).mockResolvedValueOnce(account);
    f.setCurrent(await f.run({ type: "restart-role-pipeline", configuration, expectedWorkRevision: 3 }));
    const before = f.aggregate();
    for (const tasks of [before.tasks.slice(1), before.tasks.map((task, index) => index === 0 ? { ...task, status: "draft" as const } : task)]) {
      await expect(assertStudioRolePipelineProductionMutation({ query: guardQuery(f.current()) }, before, { ...before, tasks })).rejects.toMatchObject({ status: 409 });
    }
  });
});
