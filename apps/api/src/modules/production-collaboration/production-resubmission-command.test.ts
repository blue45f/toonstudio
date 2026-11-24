import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  createProductionProjectAggregate, episodeScope, type ProductionProjectAggregate,
} from "@toonstudio/core/production";

import { ProductionCommandSchema, type ProductionCommand } from "./production-collaboration.dto";
import type { ProductionCollaborationRepository, ProductionProjectAccess } from "./production-collaboration.repository";
import { ProductionCollaborationService } from "./production-collaboration.service";

const at = "2026-09-15T12:00:00.000Z";
const projectId = "project", owner = "owner", assignmentId = "assignment:party:producer";
const access: ProductionProjectAccess = { view: true, edit: true, manage: true, comment: true, owner: true, role: "owner" };
const resubmit = { type: "resubmit-for-review", previousSubmissionId: "sub-r1", changedCutIds: ["cut-2"],
  resolveClarificationIds: [], resolutionNote: "2컷 동작 수정", submittedByAssignmentId: assignmentId } satisfies ProductionCommand;

function fixture(reviewerAssignmentIds: string[] = [assignmentId], capabilities = access) {
  const base = createProductionProjectAggregate({ projectId, workId: "work", title: "합성 검수",
    collaborationModel: "solo", ownerPartyId: "party", ownerUserId: owner, ownerDisplayName: "작가", at });
  const scope = episodeScope(projectId, "episode");
  const input = { id: "input", revision: 1, createdAt: at, digest: `sha256:${"a".repeat(64)}`, lineage: "visual" as const };
  let stored: ProductionProjectAggregate = {
    ...base,
    deliverables: [{ id: "out", projectId, scope, type: "line-art", expectedFormat: "PNG",
      completionCriteria: ["세 컷 확인"], currentSubmissionId: "sub-r1", approvedSubmissionId: null }],
    submissions: [{ id: "sub-r1", projectId, deliverableId: "out", submittedAt: at,
      submittedByAssignmentId: assignmentId, revisionRef: { ...input, id: "art-r1" },
      status: "changes-requested", inputRevisionRefs: [input], evidenceRefs: [] }],
    cutPlans: [1, 2, 3].map((order) => ({
      id: `plan-${order}`, projectId, episodeId: "episode", sceneId: "scene", cutId: `cut-${order}`, order,
      revision: order === 2 ? 2 : 1, status: order === 2 ? "draft" : "approved", framing: "전신", camera: "고정", characterRefs: [],
      dialogueRefs: [], assetRequirementIds: [], layerRequirements: [], estimatedHours: 1, complexity: 1,
      approvedByAssignmentIds: order === 2 ? [] : [assignmentId], createdAt: at,
    })),
    tasks: [{ id: "task", projectId, scope, processKey: "line-art", title: "세 컷 검수", status: "changes-requested",
      assignmentIds: [assignmentId], reviewerAssignmentIds, inputRevisionRefs: [input], outputDeliverableIds: ["out"],
      dependencyTaskIds: [], dueAt: null, estimateHours: null, completionCriteria: [], sourceAgreementMilestoneId: null }],
  };
  const mutateProject: ProductionCollaborationRepository["mutateProject"] = vi.fn(async (request) => {
    const result = request.mutate(stored, capabilities);
    stored = result.aggregate;
    return result;
  });
  const service = new ProductionCollaborationService({ mutateProject } as ProductionCollaborationRepository);
  const run = (command: ProductionCommand, userId = owner) => service.executeCommand(userId, projectId, {
    command, expectedRevision: stored.revision, mutationId: randomUUID(),
  });
  return { run, stored: () => stored, mutateProject };
}

it("현재 제출자의 수정본을 한 번만 저장하고 한국어 근거와 검수 작업을 복원한다", async () => {
  const f = fixture(), before = f.stored();
  const result = await f.run(resubmit);
  expect(f.mutateProject).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ requiredCapability: "edit" }));
  expect(result.aggregate.revision).toBe(before.revision + 1);
  expect(result.aggregate.auditEvents.at(-1)?.action).toBe("resubmit-for-review");
  expect(result.aggregate.deliverables[0]?.currentSubmissionId).toBe("sub-r2");
  expect(result.aggregate.submissions.map((entry) => [entry.id, entry.status])).toEqual([["sub-r1", "superseded"], ["sub-r2", "in-review"]]);
  expect(result.aggregate.tasks[0]?.status).toBe("internal-review");
  const next = result.aggregate.submissions.at(-1);
  expect(next?.evidenceRefs).toContain(`resubmit-note:${encodeURIComponent(resubmit.resolutionNote)}`);
  expect(next?.evidenceRefs).toContain("resubmit-changed-cuts:cut-2");
  const otherApprovedCuts = before.cutPlans.filter((cut) => cut.status === "approved");
  expect(otherApprovedCuts.map((cut) => cut.cutId)).toEqual(["cut-1", "cut-3"]);
  expect(result.aggregate.cutPlans.filter((cut) => cut.status === "approved")).toEqual(otherApprovedCuts);
  await expect(f.run(resubmit)).rejects.toBeInstanceOf(BadRequestException);
  if (!next) throw new Error("재제출 원고 없음");
  const original = ProductionCommandSchema.parse({ type: "upsert-submission", submission: next });
  await expect(f.run(original)).resolves.toBeDefined();
  const forged = ProductionCommandSchema.parse({ type: "upsert-submission",
    submission: { ...next, evidenceRefs: next.evidenceRefs.filter((ref) => !ref.startsWith("resubmit-note:")) } });
  await expect(f.run(forged)).rejects.toBeInstanceOf(BadRequestException);
});

it("마지막 작업 검증 실패 시 이전 제출 포인터와 수정 요청 작업을 보존한다", async () => {
  const f = fixture([]), before = structuredClone(f.stored());
  await expect(f.run(resubmit)).rejects.toMatchObject({ response: { issues: [
    expect.stringContaining("활성 검수자"),
  ] } });
  expect(f.stored()).toEqual(before);
});

it("필수 교정지가 미제출이면 1차 원고를 보존하고, 교정지를 제출하면 2차 검수를 연다", async () => {
  const f = fixture();
  const { deliverables: [original], tasks: [task], submissions: [previous] } = f.stored();
  const proofSheet = { ...original, id: "proof-sheet", type: "proof-sheet", currentSubmissionId: null };
  await f.run(ProductionCommandSchema.parse({ type: "upsert-deliverable", deliverable: proofSheet }));
  await f.run(ProductionCommandSchema.parse({
    type: "upsert-task", task: { ...task, outputDeliverableIds: [original.id, proofSheet.id] },
  }));
  const missing = structuredClone(f.stored());
  await expect(f.run(resubmit)).rejects.toMatchObject({ response: { issues: [
    expect.stringContaining("현재 제출본"),
  ] } });
  expect(f.stored()).toEqual(missing);

  await f.run(ProductionCommandSchema.parse({ type: "upsert-submission", submission: {
    ...previous, id: "proof-r1", deliverableId: proofSheet.id, status: "submitted",
    revisionRef: { ...previous.revisionRef, id: "proof-revision-r1" },
  } }));
  await f.run(resubmit);
  expect(f.stored().tasks[0]?.status).toBe("internal-review");
  expect(f.stored().deliverables.map((entry) => [entry.id, entry.currentSubmissionId]))
    .toEqual([[original.id, "sub-r2"], [proofSheet.id, "proof-r1"]]);
});

it("메모를 생략해도 상태 저장 시 제출 당시의 변경 컷을 유지한다", async () => {
  const f = fixture();
  const { aggregate } = await f.run({ ...resubmit, resolutionNote: "" });
  const submitted = aggregate.submissions.find((entry) => entry.id === "sub-r2");
  if (!submitted) throw new Error("재제출 원고 없음");
  const evidenceRefs = submitted.evidenceRefs.map((ref) =>
    ref === "resubmit-changed-cuts:cut-2" ? "resubmit-changed-cuts:cut-1" : ref);
  const update = ProductionCommandSchema.parse({ type: "upsert-submission", submission: { ...submitted, evidenceRefs } });
  await expect(f.run(update)).rejects.toBeInstanceOf(BadRequestException);
  expect(f.stored()).toEqual(aggregate);
});

it("다른 계정의 원고 및 등록되지 않은 컷은 이전 제출을 교체할 수 없다", async () => {
  const f = fixture(), before = structuredClone(f.stored());
  await expect(f.run(resubmit, "other-user")).rejects.toBeInstanceOf(ForbiddenException);
  await expect(f.run({ ...resubmit, changedCutIds: ["outside"] })).rejects.toBeInstanceOf(BadRequestException);
  expect(f.stored()).toEqual(before);
  expect(ProductionCommandSchema.safeParse({ ...resubmit, commands: [] }).success).toBe(false);
});

it("댓글 권한만 있는 계정은 자신의 제출본도 재제출할 수 없다", async () => {
  const f = fixture([assignmentId], { ...access, edit: false, manage: false, owner: false, role: "commenter" });
  const before = structuredClone(f.stored());
  await expect(f.run(resubmit)).rejects.toBeInstanceOf(ForbiddenException);
  expect(f.stored()).toEqual(before);
});
