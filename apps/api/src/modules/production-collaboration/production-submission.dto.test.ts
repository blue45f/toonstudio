import { describe, expect, it } from "vitest";

import type { ProductionTaskOutputEvidence, SubmitProductionTaskOutputCommand } from "@toonstudio/core/production";
import { ProductionCommandSchema } from "./production-collaboration.dto";
import { ProductionTaskOutputEvidenceSchema, SubmissionSchema, SubmitProductionTaskOutputCommandSchema } from "./production-submission.dto";

const at = "2026-10-29T09:00:00.000Z";
const subject = { schemaVersion: 1 as const, workId: "work-1", projectId: "graph-1", artifactId: "capture-1",
  reviewId: "review-1", revisionId: "revision-1", rootGraphHash: "a".repeat(64) };
const command: SubmitProductionTaskOutputCommand = {
  type: "submit-task-output", taskId: "task-1", submissionId: "submission-1",
  submittedByAssignmentId: "assignment-owner", documentRole: "lineart", source: { subject },
  selection: { mode: "frames", pages: [{ pageId: "page/work-1:0", ordinal: 0, frameIds: ["frame@1"] }] },
  inputs: { mode: "initial-capture", source: { subject: { ...subject, reviewId: "initial-review" } } },
  target: { kind: "create", deliverableId: "deliverable-1", type: "lineart", expectedFormat: "PNG",
    completionCriteria: ["선화 확인"] },
};
const evidence: ProductionTaskOutputEvidence = {
  version: 1, kind: "studio-review-capture", taskId: "task-1", scope: { kind: "project", id: "production-1", ancestors: [] },
  documentRole: "lineart", subject, sourceServerRevision: 7, captureSequence: 900,
  selectionMode: "frames", pages: [{ pageId: "page/work-1:0", ordinal: 0, sha256: "b".repeat(64), frameIds: ["frame@1"] }],
};

it("제한 원고 제출은 명시적인 정책·배정 컨텍스트만 선택적으로 받는다", () => {
  const writeContext = { version: 1, policyVersion: 7, grantIds: ["grant-1"], creations: [], restorations: [] };
  expect(SubmitProductionTaskOutputCommandSchema.parse({ ...command, writeContext }).writeContext).toEqual(writeContext);
  expect(SubmitProductionTaskOutputCommandSchema.safeParse({ ...command,
    writeContext: { ...writeContext, edit: true } }).success).toBe(false);
  expect(SubmitProductionTaskOutputCommandSchema.safeParse({ ...command,
    writeContext: { ...writeContext, grantIds: [] } }).success).toBe(false);
  expect(SubmitProductionTaskOutputCommandSchema.parse(command).writeContext).toBeUndefined();
});

describe("작업 산출물 제출 DTO", () => {
  it("Production ID 규칙으로 Graph 프로젝트의 유효한 식별자를 축소하지 않는다", () => {
    const input = { ...command, source: { subject: { ...subject, projectId: "graph/project@one" } } };
    expect(ProductionCommandSchema.parse(input)).toEqual(input);
  });
  it("Graph subject와 Production 작업을 분리하고 실제 page/frame 식별자를 보존한다", () => {
    const parsed: SubmitProductionTaskOutputCommand = SubmitProductionTaskOutputCommandSchema.parse(command);
    expect(parsed).toEqual(command);
    expect(ProductionCommandSchema.parse(command)).toEqual(command);
    expect(parsed.source.subject.projectId).toBe("graph-1");
  });

  it("기존 산출물과 current·approved-dependencies 입력 모드를 받는다", () => {
    for (const mode of ["current", "approved-dependencies"] as const) {
      expect(ProductionCommandSchema.parse({ ...command, selection: { mode: "document" }, inputs: { mode },
        target: { kind: "existing", deliverableId: "deliverable-1" } })).toMatchObject({ inputs: { mode } });
    }
  });

  it.each([
    { ...command, source: { subject: { ...subject, rootGraphHash: `sha256:${subject.rootGraphHash}` } } },
    { ...command, source: { subject: { ...subject, sourceServerRevision: 999 } } },
    { ...command, source: { subject, captureSequence: 999 } },
    { ...command, documentRole: "unknown" },
    { ...command, selection: { mode: "pages", pages: [] } },
    { ...command, selection: { mode: "frames", pages: [{ pageId: "page-1", ordinal: 0, frameIds: [] }] } },
    { ...command, selection: { mode: "pages", pages: [{ pageId: "page-1", ordinal: 100_000 }] } },
    { ...command, selection: { mode: "pages", pages: [{ pageId: "page-1", ordinal: -1 }] } },
    { ...command, inputs: { mode: "initial-capture" } },
    { ...command, inputs: { mode: "current", source: { subject } } },
    { ...command, target: { kind: "existing", deliverableId: "deliverable-1", scope: evidence.scope } },
    { ...command, target: { kind: "create", deliverableId: "deliverable-1", type: "lineart", expectedFormat: "PNG", completionCriteria: [] } },
    { ...command, sourceEvidence: evidence },
  ])("미검증 provenance·잘못된 선택·모드 혼합을 거절한다", (input) => {
    expect(ProductionCommandSchema.safeParse(input).success).toBe(false);
  });

  it("기존 제출 레코드와 서버 근거가 있는 레코드를 모두 읽는다", () => {
    const submission = { id: "submission-1", projectId: "production-1", deliverableId: "deliverable-1",
      revisionRef: { id: "revision-1", lineage: "visual", revision: 7, digest: `sha256:${subject.rootGraphHash}`, createdAt: at },
      submittedByAssignmentId: "assignment-owner", submittedAt: at, status: "submitted", inputRevisionRefs: [
        { id: "input-1", lineage: "integrated", revision: 2, digest: `sha256:${"c".repeat(64)}`, createdAt: at },
      ], evidenceRefs: [] };
    expect(SubmissionSchema.parse(submission)).not.toHaveProperty("sourceEvidence");
    expect(SubmissionSchema.parse({ ...submission, sourceEvidence: evidence }).sourceEvidence).toEqual(evidence);
    expect(ProductionCommandSchema.parse({ type: "upsert-submission", submission })).toMatchObject({ submission });
    const pinned = { ...submission, revisionRef: { ...submission.revisionRef, productionSubmissionId: submission.id },
      inputRevisionRefs: submission.inputRevisionRefs.map((ref) => ({ ...ref, productionSubmissionId: "input-submission" })),
      sourceEvidence: evidence };
    expect(ProductionCommandSchema.parse({ type: "upsert-submission", submission: pinned })).toMatchObject({ submission: pinned });
    for (const productionSubmissionId of [null, "", " ", "invalid id"]) {
      expect(SubmissionSchema.safeParse({ ...submission, revisionRef: { ...submission.revisionRef, productionSubmissionId } }).success).toBe(false);
    }
  });

  it.each([
    { ...evidence, sourceServerRevision: 0 },
    { ...evidence, sourceServerRevision: 2_147_483_648 },
    { ...evidence, captureSequence: Number.MAX_SAFE_INTEGER + 1 },
    { ...evidence, pages: [] },
    { ...evidence, pages: [{ ...evidence.pages[0], sha256: "wrong" }] },
    { ...evidence, subject: { ...subject, operationLast: 999 } },
  ])("저장 근거도 완전한 양의 서버 번호와 고정 페이지를 요구한다", (input) => {
    expect(ProductionTaskOutputEvidenceSchema.safeParse(input).success).toBe(false);
  });
});
