import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProductionProjectAggregate, ProductionTask } from "@toonstudio/core/production";

import { createProductionDemoProject } from "./production-demo";
import { buildDivisionHandoffQueue, divisionQueueCandidateMatches, divisionQueueMatches } from "./production-division-handoff-queue";
import * as boardMove from "./production-board-move-preview";
import { divisionQueueScaleFixture } from "./production-division-handoff-queue.test-fixture";

afterEach(() => vi.restoreAllMocks());

const AT = "2026-10-28T00:00:00.000Z";
function fixture(patch: Partial<ProductionTask> = {}): ProductionProjectAggregate {
  const project = createProductionDemoProject();
  const task = project.tasks[0];
  if (!task) throw new Error("분업 테스트 기준 작업이 없습니다.");
  return { ...project, workflowProfile: null, tasks: [{ ...task, status: "ready", dependencyTaskIds: [], ...patch }] };
}

describe("실제 프로젝트 분업 인계 작업함", () => {
  it("회차 하위 컷을 포함하고 다른 회차·프로젝트·취소 작업은 제외한다", () => {
    const project = fixture();
    const task = project.tasks[0];
    if (!task) throw new Error("기준 작업이 없습니다.");
    const aggregate = { ...project, tasks: [
      task,
      { ...task, id: "cut-task", scope: { kind: "cut" as const, id: "cut-1", ancestors: [{ kind: "episode" as const, id: "episode-12" }] } },
      { ...task, id: "other-episode", scope: { kind: "episode" as const, id: "episode-13", ancestors: [] } },
      { ...task, id: "foreign", projectId: "another-project" },
      { ...task, id: "cancelled", status: "cancelled" as const },
    ] };
    expect(buildDivisionHandoffQueue(aggregate, "episode-12", AT).map((entry) => entry.task.id).sort()).toEqual(["cut-task", task.id].sort());
  });

  it("없는 선행 작업과 미완료 선행 작업을 완료로 취급하지 않는다", () => {
    const project = fixture({ dependencyTaskIds: ["missing-task"] });
    const entry = buildDivisionHandoffQueue(project, "episode-12", AT)[0];
    expect(entry?.dependencies).toEqual([{ id: "missing-task", task: null, complete: false }]);
    expect(entry?.action?.preview.allowed).toBe(false);
    expect(entry && divisionQueueMatches(entry, "blocked")).toBe(true);
  });

  it("상태만 승인인 선행 작업은 현재 제출본의 실제 승인 없이 인계 완료로 표시하지 않는다", () => {
    const project = fixture();
    const task = project.tasks[0];
    if (!task) throw new Error("기준 작업이 없습니다.");
    const aggregate = { ...project, tasks: [
      { ...task, id: "upstream", status: "approved" as const },
      { ...task, id: "downstream", dependencyTaskIds: ["upstream"] },
    ], deliverables: project.deliverables.map((deliverable) => ({ ...deliverable, approvedSubmissionId: null })) };
    const downstream = buildDivisionHandoffQueue(aggregate, "episode-12", AT).find((entry) => entry.task.id === "downstream");
    expect(downstream?.dependencies[0]?.complete).toBe(false);
    expect(downstream?.action?.preview.allowed).toBe(false);
  });

  it("계약 기간이 끝났거나 작업 범위를 벗어난 담당자를 유효한 인계 담당자로 표시하지 않는다", () => {
    const project = fixture();
    const aggregate = { ...project, assignments: project.assignments.map((assignment) => ({ ...assignment, endsAt: "2026-10-01T00:00:00.000Z" })) };
    const entry = buildDivisionHandoffQueue(aggregate, "episode-12", AT)[0];
    expect(entry?.activeAssignmentIds).toEqual([]);
    expect(entry?.activeReviewerIds).toEqual([]);
  });

  it("다른 산출물의 제출본이나 오래된 임의 제출본으로 현재 버전을 추정하지 않는다", () => {
    const project = fixture();
    const output = project.deliverables.find((item) => item.id === project.tasks[0]?.outputDeliverableIds[0]);
    const submission = project.submissions.find((item) => item.deliverableId !== output?.id);
    if (!output || !submission) throw new Error("제출본 테스트 기준이 없습니다.");
    const aggregate = { ...project, deliverables: project.deliverables.map((item) => item.id === output.id ? { ...item, currentSubmissionId: submission.id, approvedSubmissionId: submission.id } : item) };
    const entry = buildDivisionHandoffQueue(aggregate, "episode-12", AT)[0];
    expect(entry?.outputs[0]?.current).toBeNull();
    expect(entry?.outputs[0]?.approved).toBeNull();
  });

  it("고정 입력과 담당자, 체크리스트를 실제 자료에서 읽고 같은 보드 규칙으로 시작을 검증한다", () => {
    const project = fixture({ inputRevisionRefs: [], briefBlocks: [{ id: "check", kind: "checklist", text: "PSD 확인", checked: false }] });
    const entry = buildDivisionHandoffQueue(project, "episode-12", AT)[0];
    expect(entry?.activeAssignmentIds).toEqual(project.tasks[0]?.assignmentIds);
    expect(entry?.uncheckedCount).toBe(1);
    expect(entry?.action?.target).toBe("in-progress");
    expect(entry?.action?.preview.allowed).toBe(false);
    expect(entry?.action?.preview.reason).toContain("입력 버전");
  });

  it("검수 대기에는 승인 우회 명령을 만들지 않고 준비된 작업만 실행 가능으로 분류한다", () => {
    const ready = buildDivisionHandoffQueue(fixture(), "episode-12", AT)[0];
    expect(ready?.action?.preview.transitions).toEqual([{ taskId: ready?.task.id, fromStatus: "ready", toStatus: "in-progress" }]);
    expect(ready && divisionQueueMatches(ready, "actionable")).toBe(true);
    const review = buildDivisionHandoffQueue(fixture({ status: "internal-review" }), "episode-12", AT)[0];
    expect(review?.action).toBeNull();
    expect(review && divisionQueueMatches(review, "review")).toBe(true);
  });

  it("3000개 작업의 큐·후보 집계는 전체 전환 검증을 실행하지 않고 읽은 행의 검증만 캐시한다", () => {
    const preview = vi.spyOn(boardMove, "previewProductionBoardMove");
    const entries = buildDivisionHandoffQueue(divisionQueueScaleFixture(3000), "episode-12", AT);
    expect(entries).toHaveLength(3000);
    expect(entries.filter((entry) => divisionQueueCandidateMatches(entry, "actionable"))).toHaveLength(3000);
    expect(entries.filter((entry) => divisionQueueCandidateMatches(entry, "blocked"))).toHaveLength(0);
    expect(preview).not.toHaveBeenCalled();
    const action = entries[0]?.action;
    expect(action?.preview.allowed).toBe(true);
    expect(action?.preview.transitions[0]?.fromStatus).toBe("draft");
    expect(preview).toHaveBeenCalledTimes(1);
    expect(entries[0] && divisionQueueMatches(entries[0], "actionable")).toBe(true);
    expect(preview).toHaveBeenCalledTimes(1);
  });

  it("후보 집계는 이동 허가로 쓰지 않고 실제 실패 조건은 같은 canonical 검증으로 확인한다", () => {
    const preview = vi.spyOn(boardMove, "previewProductionBoardMove");
    const entry = buildDivisionHandoffQueue(fixture({ inputRevisionRefs: [] }), "episode-12", AT)[0];
    if (!entry) throw new Error("검증할 작업이 없습니다.");
    expect(divisionQueueCandidateMatches(entry, "actionable")).toBe(true);
    expect(preview).not.toHaveBeenCalled();
    expect(divisionQueueMatches(entry, "actionable")).toBe(false);
    expect(entry.action?.preview.reason).toContain("입력 버전");
    expect(preview).toHaveBeenCalledTimes(1);
  });
});
