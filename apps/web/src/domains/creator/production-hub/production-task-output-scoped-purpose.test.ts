import { describe, expect, it } from "vitest";
import type { SubmitProductionTaskOutputCommand } from "@toonstudio/core/production";
import { createStudioScopedWriteFixture } from "../studio-collab/studio-scoped-write.test-fixture";
import { productionReviewFlowFixture } from "./production-review-flow.test-fixture";
import { scopedTaskOutputPurposes, validateScopedTaskOutputSelection } from "./production-task-output-scoped-purpose";

function fixture() {
  const f = productionReviewFlowFixture(), original = createStudioScopedWriteFixture().policy, actorId = "review-flow-artist", at = Date.parse("2026-10-29T01:00:00.000Z");
  const policy = { ...original, workId: f.aggregate.workId,
    targets: original.targets.map((target) => ({ ...target, definition: { ...target.definition, productionProjectId: f.aggregate.projectId,
      source: { ...target.definition.source, workId: f.aggregate.workId } } })),
    grants: original.grants.map((grant) => ({ ...grant, actorUserId: actorId, assignmentId: f.artist.id, productionProjectId: f.aggregate.projectId, taskId: f.task.id })) };
  const command: SubmitProductionTaskOutputCommand = { type: "submit-task-output", taskId: f.task.id, submissionId: "scoped-output-submission", submittedByAssignmentId: f.artist.id,
    documentRole: "lineart", source: { subject: policy.targets[0]!.definition.source }, selection: { mode: "pages", pages: [{ pageId: "page-1", ordinal: 0 }] },
    inputs: { mode: "current" }, target: { kind: "existing", deliverableId: f.deliverable.id } };
  return { ...f, policy, actorId, at, command };
}

describe("현재 담당 공정의 원고 제출 목적", () => {
  it("등록 당시 target task 대신 현재 grant.taskId와 자기 실제 역할을 사용한다", () => {
    const f = fixture(), choices = scopedTaskOutputPurposes(f.policy, f.aggregate, f.task, f.actorId, f.at);
    expect(f.policy.targets[0]?.definition.taskId).toBe("initial-task"); expect(choices).toHaveLength(2);
    expect(choices[0]).toMatchObject({ taskId: f.task.id, assignmentId: f.artist.id, targetId: "target-1", context: { creations: [], restorations: [] } });
    expect(scopedTaskOutputPurposes(f.policy, f.aggregate, f.task, "review-flow-editor", f.at)).toEqual([]);
    expect(scopedTaskOutputPurposes({ ...f.policy, grants: f.policy.grants.map((grant) => ({ ...grant, taskId: "old-task" })) }, f.aggregate, f.task, f.actorId, f.at)).toEqual([]);
  });
  it("계정 연결·역할 기간·grant 기간이 끝난 제출 목적은 표시하지 않는다", () => {
    const f = fixture(), unlinked = { ...f.aggregate, parties: f.aggregate.parties.map((party) => party.accountUserId === f.actorId ? { ...party, accountUserId: "different-account" } : party) };
    expect(scopedTaskOutputPurposes(f.policy, unlinked, f.task, f.actorId, f.at)).toEqual([]);
    expect(scopedTaskOutputPurposes(f.policy, { ...f.aggregate, assignments: f.aggregate.assignments.map((assignment) => ({ ...assignment, endsAt: "2026-10-29T01:00:00.000Z" })) }, f.task, f.actorId, f.at)).toEqual([]);
    expect(scopedTaskOutputPurposes(f.policy, f.aggregate, f.task, f.actorId, Date.parse("2026-10-29T02:00:00.001Z"))).toEqual([]);
  });
  it("실제 담당 페이지·컷·제출 역할을 벗어난 선택은 전송 전에 거절한다", () => {
    const f = fixture(), purpose = scopedTaskOutputPurposes(f.policy, f.aggregate, f.task, f.actorId, f.at)[0];
    if (!purpose) throw new Error("현재 실제 담당 제출 목적이 없습니다.");
    expect(() => validateScopedTaskOutputSelection(purpose, f.command)).not.toThrow();
    expect(() => validateScopedTaskOutputSelection(purpose, { ...f.command, selection: { mode: "document" } })).toThrow();
    expect(() => validateScopedTaskOutputSelection(purpose, { ...f.command, submittedByAssignmentId: f.editor.id })).toThrow();
    expect(() => validateScopedTaskOutputSelection(purpose, { ...f.command, selection: { mode: "pages", pages: [{ pageId: "page-2", ordinal: 1 }] } })).toThrow();
    const cut = { ...purpose, frameId: "actual-frame" };
    expect(() => validateScopedTaskOutputSelection(cut, f.command)).toThrow();
    expect(() => validateScopedTaskOutputSelection(cut, { ...f.command, selection: { mode: "frames", pages: [{ pageId: "page-1", ordinal: 0, frameIds: ["actual-frame"] }] } })).not.toThrow();
  });
});
