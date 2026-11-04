import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { StudioScopedWriteManagementCommand } from "@toonstudio/contracts/studio-scoped-write";
import { projectStudioScopedAuthoringDocument } from "./studio-scoped-write-effects";
import { scopedCaptureFixture } from "./studio-scoped-write-capture.test-fixture";
import { scopedDocument, scopedFixture, SCOPED_AT } from "./studio-scoped-write.test-fixture";
import { StudioScopedWriteRepository } from "./studio-scoped-write.repository";
import type { StudioScopedStoredPolicy } from "./studio-scoped-write-store";
import { STUDIO_ROLE_PIPELINE_STAGE_IDS, type StudioRolePipelineState } from "@toonstudio/contracts/studio-role-pipeline";

const doubles = vi.hoisted(() => ({ transaction: vi.fn(), capture: vi.fn(), authority: vi.fn() }));
vi.mock("../../platform/database", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../platform/database")>(), db: { transaction: doubles.transaction },
}));
vi.mock("../production-collaboration/production-task-output-source", () => ({ getVerifiedProductionTaskOutputCaptures: doubles.capture }));
vi.mock("./studio-scoped-crdt-authority", () => ({ loadStudioScopedCrdtAuthority: doubles.authority }));

beforeEach(() => vi.clearAllMocks());
function fixture(actor = "owner") {
  const f = scopedFixture(), capture = scopedCaptureFixture(), repository = new StudioScopedWriteRepository();
  let policy: StudioScopedStoredPolicy = { policyVersion: 0, targets: [], grants: [], ownership: {} };
  let managerRole = "admin", recipientRole: string | null = "viewer", aggregate = f.aggregate;
  const receipts = new Map<string, Record<string, unknown>>(), writes: string[] = [], dialect = new PgDialect();
  const execute = vi.fn(async (statement: SQL) => {
    const compiled = dialect.sqlToQuery(statement), text = compiled.sql, params = compiled.params;
    if (text.includes("pg_advisory_xact_lock")) return { rows: [] };
    if (text.includes("to_jsonb(work) AS work")) return { rows: [{ work: { id: "work", userId: "owner", revision: 3, doc: scopedDocument(), status: "draft", hidden: false }, ownerStatus: "active" }] };
    if (text.includes('SELECT "userId",role,status')) return { rows: [{ userId: actor, role: managerRole, status: "active" }] };
    if (text.includes("accountStatus")) return { rows: [{ role: recipientRole, status: "active", accountStatus: "active" }] };
    if (text.includes("creator_draft_collaboration_room")) return { rows: [] };
    if (text.includes("SELECT clock_timestamp()")) return { rows: [{ now: SCOPED_AT }] };
    if (text.includes('SELECT status FROM "user"')) return { rows: [{ status: "active" }] };
    if (text.includes('SELECT "actorUserId","requestHash"')) return { rows: receipts.has(String(params[2])) ? [receipts.get(String(params[2]))] : [] };
    if (text.includes("to_regclass('creator_work_scoped_write_policy')")) return { rows: [{ available: true }] };
    if (text.includes('SELECT "policyVersion",targets,grants,ownership')) return { rows: policy.policyVersion ? [policy] : [] };
    if (text.includes('FROM "production_project"')) return { rows: [{ id: aggregate.projectId, workId: aggregate.workId, revision: aggregate.revision, aggregate }] };
    if (text.includes("jsonb_build_object('schemaVersion',1")) return { rows: [capture.row] };
    if (text.includes("INSERT INTO creator_work_scoped_write_policy")) {
      writes.push("policy"); policy = { policyVersion: Number(params[1]), targets: JSON.parse(String(params[2])), grants: JSON.parse(String(params[3])), ownership: JSON.parse(String(params[4])),
        rolePipeline: params[7] === null ? null : JSON.parse(String(params[7])) };
      return { rows: [] };
    }
    if (text.includes("INSERT INTO creator_work_scoped_write_receipt")) {
      writes.push("receipt"); receipts.set(String(params[1]), { actorUserId: params[2], requestHash: params[3], policyVersion: params[4], targetIds: [], response: JSON.parse(String(params[5])) });
      return { rows: [] };
    }
    throw new Error(`예상하지 않은 관리 SQL: ${text}`);
  });
  doubles.transaction.mockImplementation(async (action: (transaction: { execute: typeof execute }) => unknown) => action({ execute }));
  doubles.capture.mockResolvedValue({ output: capture.capture });
  doubles.authority.mockResolvedValue({ state: projectStudioScopedAuthoringDocument(scopedDocument()), authoringDocument: scopedDocument(), serverSequence: 0n });
  const register: StudioScopedWriteManagementCommand = { mutationId: "10d86a7b-b1cc-48ea-943f-4c799a0c5af2", expectedPolicyVersion: 0,
    command: { type: "register-target", target: { ...f.target.definition, source: capture.capture.subject } } };
  return { ...f, repository, register, writes, execute, receipts, policy: () => policy,
    setPolicy: (value: StudioScopedStoredPolicy) => { policy = value; },
    setAggregate: (value: typeof aggregate) => { aggregate = value; },
    setManagerRole: (role: string) => { managerRole = role; }, setRecipientRole: (role: string | null) => { recipientRole = role; } };
}

function pipeline(): StudioRolePipelineState {
  return { version: 1, enabled: true, productionProjectId: "production", activeStageId: "story-script",
    roleBindings: [{ roleId: "story", assignmentId: "role" }], groupMappings: [{ groupId: "story-notes", targetIds: ["target"] }],
    stageTasks: STUDIO_ROLE_PIPELINE_STAGE_IDS.map((stageId, index) => ({ stageId, taskId: index === 0 ? "task" : `task-${index}` })),
    frozenStageIds: [], approvedAt: null, history: [] };
}

describe("관리자의 독립 원고 범위·공정 grant 명령", () => {
  it("실제 불변 캡처와 현재 실제 ID를 대조한 뒤 policy·귀속·receipt를 함께 만든다", async () => {
    const f = fixture(), response = await f.repository.manage("owner", "work", f.register);
    expect(response).toMatchObject({ policyVersion: 1, canManage: true, fullEdit: true, scopedWrite: false });
    expect(f.policy().ownership).toEqual({ "stroke:own": "target" });
    expect(f.writes).toEqual(["policy", "receipt"]);
    const first = new PgDialect().sqlToQuery(f.execute.mock.calls[0]?.[0] ?? (() => { throw new Error("첫 SQL이 없습니다."); })()).sql;
    expect(first).toContain("pg_advisory_xact_lock");
  });

  it("viewer/commenter/editor는 현재 manage 권한 없이 registry를 생성할 수 없다", async () => {
    for (const role of ["viewer", "commenter", "editor"]) {
      const f = fixture("manager"); f.setManagerRole(role);
      await expect(f.repository.manage("manager", "work", f.register)).rejects.toMatchObject({ status: 403 });
      expect(f.writes).toEqual([]);
    }
  });

  it("동일 manager·mutation·본문은 반복 적용하지 않고 현재 정책만 반환한다", async () => {
    const f = fixture();
    await f.repository.manage("owner", "work", f.register);
    expect((await f.repository.manage("owner", "work", f.register)).policyVersion).toBe(1);
    expect(f.writes).toEqual(["policy", "receipt"]);
    await expect(f.repository.manage("owner", "work", { ...f.register, expectedPolicyVersion: 99 })).rejects.toMatchObject({ status: 409 });
  });

  it("위조 actual frame·없는 현재 layer·stale 정책은 생성 권위로 승격하지 않는다", async () => {
    for (const change of [{ frameId: "production-cut" }, { layerId: "not-saved-layer" }]) {
      const f = fixture();
      if (f.register.command.type !== "register-target") throw new Error("등록 명령이 없습니다.");
      await expect(f.repository.manage("owner", "work", { ...f.register, command: { ...f.register.command,
        target: { ...f.register.command.target, ...change } } })).rejects.toBeDefined();
      expect(f.writes).toEqual([]);
    }
    const f = fixture();
    await expect(f.repository.manage("owner", "work", { ...f.register, expectedPolicyVersion: 1 })).rejects.toMatchObject({ status: 409 });
    expect(f.writes).toEqual([]);
  });

  it("현재 viewer 계정·task·role·기간을 검증한 grant만 만들고 editor 대여는 거절한다", async () => {
    const f = fixture(); await f.repository.manage("owner", "work", f.register);
    const request: StudioScopedWriteManagementCommand = { mutationId: "352342e0-9e6a-4bbd-a13d-d4912690f617", expectedPolicyVersion: 1,
      command: { type: "grant", id: "grant", productionProjectId: "production", taskId: "task", assignmentId: "role", targetIds: ["target"], startsAt: f.grant.startsAt, endsAt: f.grant.endsAt } };
    const response = await f.repository.manage("owner", "work", request);
    expect(response.grants[0]).toMatchObject({ actorUserId: "actor", taskId: "task", assignmentId: "role" });
    f.setRecipientRole("editor");
    await expect(f.repository.manage("owner", "work", { ...request, expectedPolicyVersion: 2, mutationId: "dca64b07-06e4-4f4d-9445-bca96ebace00",
      command: { ...request.command, id: "another-grant" } })).rejects.toMatchObject({ status: 400 });
    expect(f.policy().grants).toHaveLength(1);
  });

  it.each(["editor", "admin", "owner"])("켜진 분업의 현재 실제 %s 담당자에게만 명시 grant를 추가한다", async (recipient) => {
    const f = fixture(); await f.repository.manage("owner", "work", f.register);
    f.setPolicy({ ...f.policy(), rolePipeline: pipeline() }); f.setRecipientRole(recipient === "owner" ? null : recipient);
    if (recipient === "owner") f.setAggregate({ ...f.aggregate,
      parties: f.aggregate.parties.map((party) => party.id === "actor-party" ? { ...party, accountUserId: "owner" } : party) });
    const result = await f.repository.manage("owner", "work", { mutationId: "352342e0-9e6a-4bbd-a13d-d4912690f617", expectedPolicyVersion: 1,
      command: { type: "grant", id: "full-grant", productionProjectId: "production", assignmentId: "role", taskId: "task",
        targetIds: ["target"], startsAt: f.grant.startsAt, endsAt: f.grant.endsAt } });
    expect(result.grants[0]).toMatchObject({ id: "full-grant", actorUserId: recipient === "owner" ? "owner" : "actor" });
    expect(f.policy().rolePipeline).toEqual(pipeline());
    expect(f.execute.mock.calls.map(([statement]) => new PgDialect().sqlToQuery(statement).sql)
      .some((statement) => statement.includes('FROM "user" account LEFT JOIN creator_work_collaborator member') && statement.includes("FOR SHARE OF account"))).toBe(true);
  });

  it("전체 편집자 grant는 현재 canonical 역할·단계 task·실제 task 배정·모든 target이 맞아야 한다", async () => {
    for (const reason of ["role", "task", "assignment", "target"]) {
      const f = fixture(); await f.repository.manage("owner", "work", f.register); f.setRecipientRole("editor");
      const state = pipeline();
      if (reason === "role") state.roleBindings = [{ roleId: "line-art", assignmentId: "role" }];
      if (reason === "task") state.stageTasks[0] = { stageId: "story-script", taskId: "different-task" };
      if (reason === "assignment") f.setAggregate({ ...f.aggregate, tasks: f.aggregate.tasks.map((task) => ({ ...task, assignmentIds: [] })) });
      f.setPolicy({ ...f.policy(), rolePipeline: state }); const before = [...f.writes];
      await expect(f.repository.manage("owner", "work", { mutationId: "352342e0-9e6a-4bbd-a13d-d4912690f617", expectedPolicyVersion: 1,
        command: { type: "grant", id: "full-grant", productionProjectId: "production", assignmentId: "role", taskId: "task",
          targetIds: reason === "target" ? ["target", "unmapped"] : ["target"], startsAt: f.grant.startsAt, endsAt: f.grant.endsAt } })).rejects.toMatchObject({ status: 400 });
      expect(f.writes).toEqual(before);
    }
  });

  it("활성 분업이 참조하는 target 해제는 막고 미매핑 target의 기존 해제는 유지한다", async () => {
    const f = fixture(); await f.repository.manage("owner", "work", f.register);
    const outside = { ...f.target, definition: { ...f.target.definition, id: "unmapped", entities: [] } };
    f.setPolicy({ ...f.policy(), targets: [...f.policy().targets, outside], rolePipeline: pipeline() });
    const before = [...f.writes];
    await expect(f.repository.manage("owner", "work", { mutationId: "352342e0-9e6a-4bbd-a13d-d4912690f617", expectedPolicyVersion: 1,
      command: { type: "revoke-target", targetId: "target" } })).rejects.toMatchObject({ status: 409 });
    expect(f.writes).toEqual(before);
    await f.repository.manage("owner", "work", { mutationId: "352342e0-9e6a-4bbd-a13d-d4912690f617", expectedPolicyVersion: 1,
      command: { type: "revoke-target", targetId: "unmapped" } });
    expect(f.policy().targets.find((target) => target.definition.id === "target")?.revokedAt).toBeNull();
    expect(f.policy().targets.find((target) => target.definition.id === "unmapped")?.revokedAt).toBe(SCOPED_AT);
  });
});
