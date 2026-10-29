// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProductionProjectAggregate, projectScope, type ProductionProjectAggregate, type ProductionTask, type RevisionRef, type Submission } from "@toonstudio/core/production";

import { ProductionTaskEditor } from "./ProductionTaskEditor";
import type { ProductionClientCommand } from "./production-api";

const AT = "2026-10-29T06:00:00.000Z";

function fixture(legacy = false) {
  const base = createProductionProjectAggregate({ projectId: "production", workId: "work", title: "입력 분리",
    collaborationModel: "studio-production", ownerPartyId: "owner-party", ownerUserId: "owner", ownerDisplayName: "담당자", at: AT });
  const raw: RevisionRef = { id: "saved-capture-snapshot", lineage: "visual", revision: 3,
    digest: `sha256:${"a".repeat(64)}`, createdAt: AT };
  const submissionAId = "submission-page-a", submissionBId = "submission-page-b";
  const a: RevisionRef = { ...raw, productionSubmissionId: submissionAId }, b: RevisionRef = { ...raw, productionSubmissionId: submissionBId };
  const task: ProductionTask = { id: "task", projectId: base.projectId, scope: projectScope(base.projectId), processKey: "line-art", title: "입력 선택 작업",
    status: "ready", assignmentIds: [], reviewerAssignmentIds: [], inputRevisionRefs: [legacy ? raw : a],
    outputDeliverableIds: [], dependencyTaskIds: [], dueAt: null, estimateHours: null, completionCriteria: [], sourceAgreementMilestoneId: null };
  const sourceA = { ...task, id: "source-task-a", title: "첫 장 선화" }, sourceB = { ...task, id: "source-task-b", title: "두 번째 장 선화" };
  const submission = (id: string, revisionRef: RevisionRef, taskId: string, ordinal: number): Submission => ({ id, projectId: base.projectId, deliverableId: `deliverable-${id}`,
    revisionRef, submittedByAssignmentId: "assignment:owner-party:producer", submittedAt: AT, status: "approved",
    inputRevisionRefs: [raw], evidenceRefs: ["decision"], sourceEvidence: { version: 1, kind: "studio-review-capture", taskId,
      scope: task.scope, documentRole: "lineart", subject: { schemaVersion: 1, projectId: "graph", workId: base.workId,
        artifactId: "saved-capture", reviewId: "saved-review", revisionId: raw.id, rootGraphHash: "a".repeat(64) },
      sourceServerRevision: raw.revision, captureSequence: 7, selectionMode: "pages",
      pages: [{ pageId: `page-${ordinal}`, ordinal, sha256: (ordinal === 0 ? "b" : "c").repeat(64), frameIds: [] }] } });
  const aggregate: ProductionProjectAggregate = { ...base, tasks: [task, sourceA, sourceB],
    submissions: [submission(submissionAId, a, sourceA.id, 0), submission(submissionBId, b, sourceB.id, 1)] };
  return { aggregate, task, raw, a, b };
}

function mount(legacy = false) {
  const f = fixture(legacy);
  const execute = vi.fn(async (_command: ProductionClientCommand, _message: string): Promise<void> => undefined);
  const onClose = vi.fn();
  render(<ProductionTaskEditor aggregate={f.aggregate} task={f.task} isNew={false} canEdit execute={execute} onClose={onClose} />);
  fireEvent.click(screen.getByText(/고정 입력과 선행 작업/u));
  const choices = within(screen.getByRole("group", { name: "입력 버전 선택" })).getAllByRole("checkbox");
  return { ...f, execute, onClose, choices };
}

afterEach(cleanup);

describe("실제 TaskEditor의 업무 산출물별 입력 선택", () => {
  it("같은 Graph capture의 두 실제 제출을 독립적으로 선택·해제하고 선택한 제출만 저장한다", async () => {
    const f = mount(), [a, b] = f.choices;
    if (!(a instanceof HTMLInputElement) || !(b instanceof HTMLInputElement)) throw new Error("두 실제 제출 체크박스가 필요합니다.");
    const choices = within(screen.getByRole("group", { name: "입력 버전 선택", exact: true }));
    expect(f.choices).toHaveLength(2);
    expect(choices.getByRole("checkbox", { name: "첫 장 선화 · 원고 v3 · 1페이지", exact: true })).toBe(a);
    expect(choices.getByRole("checkbox", { name: "두 번째 장 선화 · 원고 v3 · 2페이지", exact: true })).toBe(b);
    expect(screen.getByTitle(`${f.raw.id} · ${f.a.productionSubmissionId}`).textContent).toContain("첫 장 선화");
    expect(a.checked).toBe(true);
    expect(b.checked).toBe(false);
    fireEvent.click(b);
    expect(a.checked).toBe(true);
    expect(b.checked).toBe(true);
    fireEvent.click(a);
    expect(a.checked).toBe(false);
    expect(b.checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "작업 저장" }));
    await waitFor(() => expect(f.execute).toHaveBeenCalledTimes(1));
    const command = f.execute.mock.calls[0]?.[0];
    if (!command || command.type !== "upsert-task-batch") throw new Error("실제 저장 명령이 필요합니다.");
    expect(command.tasks[0]?.inputRevisionRefs).toEqual([f.b]);
    expect(command.expectedTasks).toEqual([f.task]);
    await waitFor(() => expect(f.onClose).toHaveBeenCalledTimes(1));
    expect(f.task.inputRevisionRefs).toEqual([f.a]);
  });

  it("동일한 원본의 legacy raw 핀을 별도로 보존하며 제출 귀속 ID를 소급 생성하지 않는다", async () => {
    const f = mount(true), [raw, a, b] = f.choices;
    if (!(raw instanceof HTMLInputElement) || !(a instanceof HTMLInputElement) || !(b instanceof HTMLInputElement)) throw new Error("legacy와 두 실제 제출 체크박스가 필요합니다.");
    const choices = within(screen.getByRole("group", { name: "입력 버전 선택", exact: true }));
    expect(f.choices).toHaveLength(3);
    expect(choices.getByRole("checkbox", { name: `${f.raw.id} · v3`, exact: true })).toBe(raw);
    expect(choices.getByRole("checkbox", { name: "첫 장 선화 · 원고 v3 · 1페이지", exact: true })).toBe(a);
    expect(choices.getByRole("checkbox", { name: "두 번째 장 선화 · 원고 v3 · 2페이지", exact: true })).toBe(b);
    expect(raw.checked).toBe(true);
    expect(a.checked).toBe(false);
    expect(b.checked).toBe(false);
    fireEvent.click(a);
    expect(raw.checked).toBe(true);
    expect(a.checked).toBe(true);
    expect(b.checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "작업 저장" }));
    await waitFor(() => expect(f.execute).toHaveBeenCalledTimes(1));
    const command = f.execute.mock.calls[0]?.[0];
    if (!command || command.type !== "upsert-task-batch") throw new Error("실제 저장 명령이 필요합니다.");
    expect(command.tasks[0]?.inputRevisionRefs).toEqual([f.raw, f.a]);
    expect(command.tasks[0]?.inputRevisionRefs[0]).not.toHaveProperty("productionSubmissionId");
  });
});
