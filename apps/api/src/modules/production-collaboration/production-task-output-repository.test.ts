import { createHash } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import { createProductionProjectAggregate, type ProductionProjectAggregate } from "@toonstudio/core/production";
import { canonicalJson } from "@toonstudio/studio-project-model";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { creatorWorkCollaborators, creatorWorks, productionProjects, productionProjectMutationReceipts } from "../../platform/database/schema";
import { ProductionCollaborationRepository, ProductionProjectForbiddenError, ProductionProjectMutationConflictError,
  ProductionProjectRevisionConflictError } from "./production-collaboration.repository";
import type { ScopedProductionTaskOutputCommand } from "./production-task-output-authority";

const doubles = vi.hoisted(() => ({ transaction: vi.fn(), captures: vi.fn(), lockOutput: vi.fn(),
  authorizeOutput: vi.fn(), inspectOutput: vi.fn(), recordOutput: vi.fn() }));
vi.mock("../../platform/database", async () => ({
  ...await import("../../platform/database/schema"), db: { transaction: doubles.transaction },
}));
vi.mock("./production-task-output-source", () => ({ getVerifiedProductionTaskOutputCaptures: doubles.captures }));
vi.mock("./production-task-output-authority", () => ({ lockProductionTaskOutputWork: doubles.lockOutput,
  authorizeProductionTaskOutput: doubles.authorizeOutput, inspectScopedProductionTaskOutput: doubles.inspectOutput,
  recordScopedProductionTaskOutput: doubles.recordOutput }));

const at = "2026-10-29T09:00:00.000Z";
const subject = { schemaVersion: 1 as const, projectId: "graph/project@one", workId: "work-1", artifactId: "capture-1",
  reviewId: "review-1", revisionId: "snapshot-1", rootGraphHash: "a".repeat(64) };
const sources = { output: { subject } };
const captures = { output: { subject, sourceServerRevision: 7, captureSequence: 11, createdAt: at,
  pages: [{ pageId: "page-1", ordinal: 0, sha256: "b".repeat(64), frameIds: [] }] } };

function aggregate(workId = "work-1", revision = 0): ProductionProjectAggregate {
  const base = createProductionProjectAggregate({ projectId: "project-1", workId, title: "원고 제출 저장",
    collaborationModel: "co-creator", ownerPartyId: "owner-party", ownerUserId: "owner-user", ownerDisplayName: "제작자", at });
  return { ...base, revision };
}

const projectRow = (value: ProductionProjectAggregate) => ({ id: value.projectId, workId: value.workId, revision: value.revision, aggregate: value });
type Row = Record<string, unknown>;
type Receipt = { requestDigest: string; response: { aggregate: ProductionProjectAggregate } };
interface FakeSelect {
  from(value: unknown): FakeSelect;
  leftJoin(): FakeSelect;
  where(value: SQL): FakeSelect;
  limit(): FakeSelect;
  for(value: string): FakeSelect;
  then(resolve: (value: readonly Row[]) => unknown, reject: (reason: unknown) => unknown): Promise<unknown>;
}

/** DB 연결 없이 잠금 전 힌트·잠금 후 현재 행·현재 ACL·영수증 분기를 구분한다. */
function fakeTransaction(options: {
  hint?: ProductionProjectAggregate; current?: ProductionProjectAggregate;
  access?: { ownerUserId: string; membershipRole: string | null; membershipStatus: string | null };
  receipt?: Receipt;
} = {}) {
  const events: string[] = [];
  const conditions: { table: unknown; lock: string | null; condition: SQL }[] = [];
  const inserts: { table: unknown; values: Row }[] = [];
  const hint = options.hint ?? aggregate(), current = options.current ?? aggregate();
  const transaction = {
    select: (selection: Row) => {
      let table: unknown, lock: string | null = null, condition: SQL | null = null;
      const read = async (): Promise<readonly Row[]> => {
        if (condition) conditions.push({ table, lock, condition });
        if (table === productionProjects) {
          events.push(lock ? `project:${lock}` : "project:hint");
          return [projectRow(lock ? current : hint)];
        }
        if (table === creatorWorks && "ownerUserId" in selection) {
          events.push("access:current");
          return [options.access ?? { ownerUserId: "owner-user", membershipRole: null, membershipStatus: null }];
        }
        if (table === creatorWorks) { events.push(`work:${lock}`); return [{ id: hint.workId }]; }
        if (table === creatorWorkCollaborators) { events.push(`membership:${lock}`); return []; }
        if (table === productionProjectMutationReceipts) { events.push("receipt:read"); return options.receipt ? [options.receipt] : []; }
        throw new Error("정의하지 않은 저장소 조회입니다.");
      };
      const query: FakeSelect = {
        from: (value: unknown) => { table = value; return query; },
        leftJoin: () => query, where: (value: SQL) => { condition = value; return query; }, limit: () => query,
        for: (value: string) => { lock = value; return query; },
        then: (resolve: (value: readonly Row[]) => unknown, reject: (reason: unknown) => unknown) => read().then(resolve, reject),
      };
      return query;
    },
    update: () => ({ set: (patch: Row) => ({ where: () => ({ returning: async () => {
      events.push("project:write"); return [{ revision: patch.revision }];
    } }) }) }),
    insert: (table: unknown) => ({ values: async (values: Row) => { inserts.push({ table, values }); events.push("append:write"); } }),
  };
  doubles.transaction.mockImplementation(async (callback: (value: typeof transaction) => Promise<unknown>) => callback(transaction));
  doubles.captures.mockImplementation(async () => { events.push("capture:verify"); return captures; });
  return { events, conditions, transaction, inserts };
}

function input(expectedRevision = 0) {
  return { actorUserId: "owner-user", projectId: "project-1", expectedRevision, mutationId: "mutation-1", requestDigest: "digest-1",
    taskOutputSources: sources, mutate: vi.fn((current: ProductionProjectAggregate) => {
      return { aggregate: { ...current, revision: current.revision + 1, updatedAt: at,
        auditEvents: [...current.auditEvents, { id: "event-1", projectId: current.projectId, aggregateRevision: current.revision + 1,
          actorPartyId: "owner-party", action: "submit-task-output", targetType: "submission", targetId: "submission-1",
          beforeDigest: null, afterDigest: null, reason: null, occurredAt: at }] } };
    }) };
}

beforeEach(() => { for (const mock of Object.values(doubles)) mock.mockReset(); });

function limitedInput() {
  const command = { type: "submit-task-output", taskId: "task-1", submissionId: "submission-1",
    submittedByAssignmentId: "assignment-1", documentRole: "lineart", source: sources.output,
    selection: { mode: "pages", pages: [{ pageId: "page-1", ordinal: 0 }] }, inputs: { mode: "current" },
    target: { kind: "existing", deliverableId: "deliverable-1" },
    writeContext: { version: 1, policyVersion: 1, grantIds: ["grant-1"], creations: [], restorations: [] } } satisfies ScopedProductionTaskOutputCommand;
  const request = { ...input(), taskOutputSources: { ...sources, command } };
  doubles.lockOutput.mockResolvedValue({ workId: "work-1" });
  doubles.authorizeOutput.mockResolvedValue({ context: command.writeContext });
  doubles.inspectOutput.mockResolvedValue({ targetIds: ["target-1"], receipt: null });
  return request;
}

describe("새 작업 원고 제출 저장소의 잠금·현재 권한·재전송 계약", () => {
  it("제한 작업자는 전역 edit를 얻지 않고 검증된 자기 원고만 제출한다", async () => {
    const request = limitedInput();
    const f = fakeTransaction({ access: { ownerUserId: "different-owner", membershipRole: "viewer", membershipStatus: "active" } });
    await new ProductionCollaborationRepository().mutateProject(request);
    const requestHash = createHash("sha256").update(canonicalJson({ projectId: request.projectId,
      expectedRevision: request.expectedRevision, command: request.taskOutputSources.command })).digest("hex");
    expect(requestHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(doubles.lockOutput).toHaveBeenCalledWith(f.transaction, "work-1", "owner-user");
    expect(doubles.inspectOutput).toHaveBeenCalledWith(f.transaction, expect.anything(), request.taskOutputSources.command,
      captures, "mutation-1", requestHash);
    expect(request.mutate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ view: true, edit: false }), captures);
    expect(doubles.recordOutput).toHaveBeenCalledWith(f.transaction, expect.anything(), "mutation-1", requestHash,
      ["target-1"], expect.objectContaining({ aggregate: expect.objectContaining({ revision: 1 }) }));
    expect(f.inserts.find((entry) => entry.table === productionProjectMutationReceipts)?.values.requestDigest).toBe(request.requestDigest);
  });

  it("같은 제한 제출 원문은 stale revision 재시도에도 같은 SHA-256으로 영수증을 읽고 다시 기록하지 않는다", async () => {
    const request = { ...limitedInput(), requestDigest: "fnv1a64:0123456789abcdef" };
    const access = { ownerUserId: "different-owner", membershipRole: "viewer", membershipStatus: "active" };
    const first = fakeTransaction({ access }), repository = new ProductionCollaborationRepository();
    const response = await repository.mutateProject(request);
    const requestHash: unknown = doubles.inspectOutput.mock.calls[0]?.[5];
    if (typeof requestHash !== "string") throw new Error("제한 제출의 요청 해시가 없습니다.");
    expect(requestHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(first.inserts.find((entry) => entry.table === productionProjectMutationReceipts)?.values.requestDigest).toBe(request.requestDigest);
    const retry = fakeTransaction({ access, current: aggregate("work-1", 2),
      receipt: { requestDigest: request.requestDigest, response } });
    doubles.inspectOutput.mockResolvedValueOnce({ targetIds: ["target-1"], receipt: {
      actorUserId: request.actorUserId, requestHash, policyVersion: 1, targetIds: ["target-1"], response,
    } });
    expect(await repository.mutateProject(request)).toBe(response);
    expect(doubles.inspectOutput.mock.calls[1]?.[5]).toBe(requestHash);
    expect(doubles.recordOutput).toHaveBeenCalledOnce();
    expect(request.mutate).toHaveBeenCalledOnce();
    expect(retry.events).not.toContain("project:write");
    expect(retry.inserts).toEqual([]);
  });

  it("기존 Production digest가 같아도 실제 제출 명령이 다르면 제한 영수증 해시는 달라진다", async () => {
    const request = { ...limitedInput(), requestDigest: "fnv1a64:0123456789abcdef" };
    const access = { ownerUserId: "different-owner", membershipRole: "viewer", membershipStatus: "active" };
    const repository = new ProductionCollaborationRepository();
    fakeTransaction({ access });
    await repository.mutateProject(request);
    const firstHash: unknown = doubles.inspectOutput.mock.calls[0]?.[5];
    const changed = { ...request, mutationId: "mutation-2", taskOutputSources: { ...request.taskOutputSources,
      command: { ...request.taskOutputSources.command, submissionId: "submission-2" } } };
    const second = fakeTransaction({ access });
    await repository.mutateProject(changed);
    const changedHash: unknown = doubles.inspectOutput.mock.calls[1]?.[5];
    expect(typeof firstHash).toBe("string");
    expect(typeof changedHash).toBe("string");
    expect(firstHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(changedHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(changedHash).not.toBe(firstHash);
    expect(doubles.recordOutput.mock.calls[1]?.[3]).toBe(changedHash);
    expect(second.inserts.find((entry) => entry.table === productionProjectMutationReceipts)?.values.requestDigest).toBe(request.requestDigest);
  });

  it("현재 배정 검증 실패는 이전 성공 영수증으로 우회할 수 없다", async () => {
    const request = limitedInput();
    const f = fakeTransaction({ access: { ownerUserId: "different-owner", membershipRole: "commenter", membershipStatus: "active" },
      receipt: { requestDigest: "digest-1", response: { aggregate: aggregate("work-1", 1) } } });
    const rejected = new Error("현재 원고 배정이 만료됐습니다.");
    doubles.authorizeOutput.mockRejectedValueOnce(rejected);
    await expect(new ProductionCollaborationRepository().mutateProject(request)).rejects.toBe(rejected);
    expect(f.events).not.toContain("receipt:read"); expect(request.mutate).not.toHaveBeenCalled();
    expect(doubles.recordOutput).not.toHaveBeenCalled();
  });

  it("제한 제출 영수증이 없는 일반 성공 응답을 제한 권한으로 재사용하지 않는다", async () => {
    const request = limitedInput();
    fakeTransaction({ access: { ownerUserId: "different-owner", membershipRole: "viewer", membershipStatus: "active" },
      receipt: { requestDigest: "digest-1", response: { aggregate: aggregate("work-1", 1) } } });
    await expect(new ProductionCollaborationRepository().mutateProject(request)).rejects.toBeInstanceOf(ProductionProjectMutationConflictError);
    expect(request.mutate).not.toHaveBeenCalled(); expect(doubles.recordOutput).not.toHaveBeenCalled();
  });
  it("작품과 본인 멤버십을 먼저 잠근 뒤 현재 프로젝트·ACL·CAS를 검증하고 같은 transaction의 증명을 쓴다", async () => {
    const f = fakeTransaction({ hint: aggregate("work-1", 0), current: aggregate("work-1", 2) });
    const command = input(2);
    const result = await new ProductionCollaborationRepository().mutateProject(command);
    expect(result.aggregate.revision).toBe(3);
    expect(f.events).toEqual(["project:hint", "work:share", "membership:share", "project:update", "access:current",
      "receipt:read", "capture:verify", "project:write", "append:write", "append:write"]);
    const workLock = f.conditions.find((entry) => entry.table === creatorWorks && entry.lock === "share");
    const membershipLock = f.conditions.find((entry) => entry.table === creatorWorkCollaborators && entry.lock === "share");
    if (!workLock || !membershipLock) throw new Error("작품·멤버십 잠금 조건이 없습니다.");
    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(workLock.condition).params).toEqual(["work-1"]);
    expect(dialect.sqlToQuery(membershipLock.condition).params).toEqual(["work-1", "owner-user"]);
    expect(doubles.captures).toHaveBeenCalledWith(f.transaction, expect.objectContaining({ workId: "work-1", revision: 2 }), sources);
    expect(command.mutate).toHaveBeenCalledWith(expect.objectContaining({ revision: 2 }), expect.objectContaining({ edit: true }), captures);
  });

  it("잠금 전에 읽은 작품 연결이 바뀌면 현재 ACL·원고 조회나 저장 전에 거절한다", async () => {
    const f = fakeTransaction({ current: aggregate("other-work") });
    const command = input();
    await expect(new ProductionCollaborationRepository().mutateProject(command)).rejects.toBeInstanceOf(ProductionProjectRevisionConflictError);
    expect(f.events).toEqual(["project:hint", "work:share", "membership:share", "project:update"]);
    expect(doubles.captures).not.toHaveBeenCalled(); expect(command.mutate).not.toHaveBeenCalled();
  });

  it("힌트 시점의 소유권을 신뢰하지 않고 현재 회수된 멤버십을 거절한다", async () => {
    const command = input();
    const f = fakeTransaction({ access: { ownerUserId: "different-owner", membershipRole: "editor", membershipStatus: "declined" },
      receipt: { requestDigest: command.requestDigest, response: { aggregate: aggregate() } } });
    await expect(new ProductionCollaborationRepository().mutateProject(command)).rejects.toBeInstanceOf(ProductionProjectForbiddenError);
    expect(f.events).not.toContain("receipt:read"); expect(doubles.captures).not.toHaveBeenCalled();
  });

  it("현재 revision이 다르면 새 원고 증명과 쓰기를 시작하지 않는다", async () => {
    const f = fakeTransaction({ current: aggregate("work-1", 1) });
    await expect(new ProductionCollaborationRepository().mutateProject(input())).rejects.toBeInstanceOf(ProductionProjectRevisionConflictError);
    expect(f.events).not.toContain("capture:verify"); expect(f.events).not.toContain("project:write");
  });

  it("원고 증명에 실패하면 aggregate·이벤트·영수증 쓰기를 시작하지 않는다", async () => {
    const f = fakeTransaction(), command = input();
    const unavailable = new BadRequestException("저장된 원고 근거를 확인할 수 없습니다.");
    doubles.captures.mockRejectedValueOnce(unavailable);
    await expect(new ProductionCollaborationRepository().mutateProject(command)).rejects.toBe(unavailable);
    expect(command.mutate).not.toHaveBeenCalled();
    expect(f.events).not.toContain("project:write"); expect(f.events).not.toContain("append:write");
  });

  it("동일 영수증은 stale revision이어도 현재 권한 확인 뒤 원래 응답을 반환한다", async () => {
    const response = { aggregate: aggregate("work-1", 1) };
    const f = fakeTransaction({ current: aggregate("work-1", 2), receipt: { requestDigest: "digest-1", response } });
    const command = input();
    expect(await new ProductionCollaborationRepository().mutateProject(command)).toBe(response);
    expect(f.events.at(-1)).toBe("receipt:read"); expect(doubles.captures).not.toHaveBeenCalled();
    expect(command.mutate).not.toHaveBeenCalled();
  });

  it("같은 명령 ID의 다른 본문은 원고 검증 전에 거절한다", async () => {
    fakeTransaction({ receipt: { requestDigest: "other-digest", response: { aggregate: aggregate() } } });
    await expect(new ProductionCollaborationRepository().mutateProject(input())).rejects.toBeInstanceOf(ProductionProjectMutationConflictError);
    expect(doubles.captures).not.toHaveBeenCalled();
  });

  it("기존 명령은 추가 힌트·작품 잠금 없이 기존 저장 순서를 유지한다", async () => {
    const f = fakeTransaction();
    const { taskOutputSources, ...command } = input();
    expect(taskOutputSources).toEqual(sources);
    await new ProductionCollaborationRepository().mutateProject(command);
    expect(f.events).toEqual(["project:update", "access:current", "receipt:read", "project:write", "append:write", "append:write"]);
    expect(doubles.captures).not.toHaveBeenCalled();
  });
});
