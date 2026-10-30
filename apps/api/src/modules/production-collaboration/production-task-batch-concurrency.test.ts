import { ConflictException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProductionProjectAggregate, type ProductionProjectAggregate } from "@toonstudio/core/production";
import { ProductionCollaborationService } from "./production-collaboration.service";
import type { ProductionCollaborationRepository } from "./production-collaboration.repository";
import { matchesProductionTaskBatchPreconditions, productionTaskBatchPreconditions, type ProductionTaskBatchPreconditions } from "./production-task-batch-concurrency";

const at = "2026-10-28T09:00:00.000Z";
function task(id: string): ProductionTaskBatchPreconditions["tasks"][number] {
  return { id, projectId: "p", scope: { kind: "project", id: "p", ancestors: [] }, processKey: "story-lock", title: id, status: "draft",
    assignmentIds: [], reviewerAssignmentIds: [], inputRevisionRefs: [], outputDeliverableIds: [], dependencyTaskIds: [],
    dueAt: null, estimateHours: null, completionCriteria: [], sourceAgreementMilestoneId: null };
}
function fixture(): ProductionProjectAggregate {
  return { ...createProductionProjectAggregate({ projectId: "p", workId: "w", title: "독립 카드 협업", collaborationModel: "co-creator",
    ownerPartyId: "owner", ownerUserId: "owner-user", ownerDisplayName: "제작자", at }), tasks: [task("a"), task("b")] };
}
const repository = { mutateProject: vi.fn() };
const service = () => new ProductionCollaborationService(repository as unknown as ProductionCollaborationRepository);
function batch(overrides: Partial<ProductionTaskBatchPreconditions> = {}): ProductionTaskBatchPreconditions {
  return { type: "upsert-task-batch", tasks: [{ ...task("a"), title: "A 변경" }], expectedTasks: [task("a")], ...overrides };
}

describe("작업별 전체 CAS 전제조건", () => {
  it("기존 스냅샷과 신규 부재 조건이 모든 대상을 보호하는 배치 원문만 전달한다", () => {
    const command = batch({ tasks: [task("a"), task("c")], expectedAbsentTaskIds: ["c"] });
    expect(productionTaskBatchPreconditions(command)).toBe(command);
    expect(matchesProductionTaskBatchPreconditions(fixture(), command)).toBe(true);
    expect(productionTaskBatchPreconditions({ type: "upsert-task", task: task("a") })).toBeUndefined();
  });
  it.each([
    batch({ tasks: [task("a"), task("b")] }),
    batch({ expectedTasks: [] }),
    batch({ tasks: [task("a"), task("a")] }),
    batch({ expectedTasks: [task("a"), task("a")] }),
    batch({ expectedTasks: [], expectedAbsentTaskIds: ["a", "a"] }),
    batch({ expectedAbsentTaskIds: ["a"] }),
    batch({ expectedTasks: [task("unrelated")] }),
    batch({ expectedTasks: [], expectedAbsentTaskIds: ["unrelated"] }),
  ])("불완전·중복·교집합·무관한 전제조건을 저장소에서 다시 거절한다: %#", (command) => {
    expect(productionTaskBatchPreconditions(command)).toBeUndefined();
    expect(matchesProductionTaskBatchPreconditions(fixture(), command)).toBe(false);
  });
  it("다른 카드 변경은 보존하고 같은 카드 변경·삭제·중복 생성·다른 프로젝트는 거절한다", () => {
    const current = fixture();
    expect(matchesProductionTaskBatchPreconditions({ ...current, tasks: [task("a"), { ...task("b"), title: "다른 작업자의 저장" }] }, batch())).toBe(true);
    expect(matchesProductionTaskBatchPreconditions({ ...current, tasks: [{ ...task("a"), title: "동일 카드의 다른 저장" }, task("b")] }, batch())).toBe(false);
    expect(matchesProductionTaskBatchPreconditions({ ...current, tasks: [task("b")] }, batch())).toBe(false);
    expect(matchesProductionTaskBatchPreconditions(current, batch({ tasks: [task("a")], expectedTasks: [], expectedAbsentTaskIds: ["a"] }))).toBe(false);
    expect(matchesProductionTaskBatchPreconditions(current, batch({ tasks: [{ ...task("a"), projectId: "other" }] }))).toBe(false);
    expect(matchesProductionTaskBatchPreconditions(current, batch({ expectedTasks: [{ ...task("a"), projectId: "other" }] }))).toBe(false);
  });
});

describe("검증된 작업 묶음의 최신 aggregate 반영", () => {
  beforeEach(() => { repository.mutateProject.mockReset(); });
  it("독립 카드 때문에 낡아진 revision을 최신 aggregate에 적용하고 감사 버전을 한 번 증가한다", async () => {
    const current = { ...fixture(), revision: 8, tasks: [task("a"), { ...task("b"), title: "이미 저장한 B" }] };
    repository.mutateProject.mockImplementation(async (input) => input.mutate(current));
    const command = batch();
    const response = await service().executeCommand("owner-user", "p", { expectedRevision: 7,
      mutationId: "11111111-1111-4111-8111-111111111111", command });
    expect(repository.mutateProject).toHaveBeenLastCalledWith(expect.objectContaining({ expectedRevision: 7, taskBatchPreconditions: command }));
    expect(response.aggregate.revision).toBe(9);
    expect(response.aggregate.tasks.find((entry) => entry.id === "a")?.title).toBe("A 변경");
    expect(response.aggregate.tasks.find((entry) => entry.id === "b")?.title).toBe("이미 저장한 B");
    expect(response.aggregate.auditEvents.at(-1)?.aggregateRevision).toBe(9);
    expect(current.tasks[0]?.title).toBe("a");
  });
  it("저장소 검사 뒤에도 변경 대상의 전체 스냅샷이 달라지면 서비스가 재검증한다", async () => {
    const current = { ...fixture(), revision: 8, tasks: [{ ...task("a"), title: "먼저 저장한 A" }, task("b")] };
    repository.mutateProject.mockImplementation(async (input) => input.mutate(current));
    await expect(service().executeCommand("owner-user", "p", { expectedRevision: 7,
      mutationId: "11111111-1111-4111-8111-111111111111", command: batch() })).rejects.toBeInstanceOf(ConflictException);
    expect(current.revision).toBe(8);
  });
  it("단일 카드·일부 전제조건 묶음은 독립 카드 저장 증거를 전달하지 않는다", async () => {
    const current = fixture();
    repository.mutateProject.mockImplementation(async (input) => input.mutate(current));
    for (const command of [{ type: "upsert-task" as const, task: task("a") }, batch({ expectedTasks: [] })]) {
      await service().executeCommand("owner-user", "p", { expectedRevision: 0, mutationId: "11111111-1111-4111-8111-111111111111", command });
      expect(repository.mutateProject).toHaveBeenLastCalledWith(expect.objectContaining({ taskBatchPreconditions: undefined }));
    }
  });
});
