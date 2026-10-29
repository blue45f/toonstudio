import { describe, expect, it } from "vitest";
import { studioReviewPageMappingSchema } from "@toonstudio/studio-project-model";
import { episodeScope, type ProductionTaskOutputEvidence, type Submission } from "@toonstudio/core/production";
import type { StudioReviewPreviewRead } from "../project-graph/studio-project-graph-client";
import { resolveSubmissionVisualReview } from "./production-submission-visual-review";
import { submissionCaptureVisualFixture } from "./production-submission-visual-review.test-fixture";
import { selectTaskOutputPreviewPages } from "./production-task-output-preview";
import { resolveTaskOutputVisualSource } from "./production-task-output-visual-review";
import { auditProductionStudioRevisionBindings, createStudioRevisionCandidates,
  pinProductionTaskToStudioRevision } from "./production-studio-revision-bridge";

function fixture() {
  const f = submissionCaptureVisualFixture(), revision = f.revisions["capture-artifact"][0];
  const review = f.reviews["capture-artifact"][0], deliverable = f.aggregate.deliverables[0];
  if (!revision || !review || !deliverable) throw new Error("검증할 실제 원고 fixture가 없습니다.");
  const secondHash = "d".repeat(64), scope = episodeScope(f.aggregate.projectId, "episode-12");
  const captured = { ...revision, blobRefs: [...revision.blobRefs, { role: "preview" as const, ordinal: 1, sha256: secondHash }] };
  const subject = { schemaVersion: 1 as const, projectId: f.project.id, workId: f.aggregate.workId,
    artifactId: captured.artifactId, reviewId: review.id, revisionId: captured.id, rootGraphHash: captured.rootGraphHash };
  const selectedPage = { pageId: "page-two", ordinal: 1, sha256: secondHash, frameIds: [] };
  const evidence: ProductionTaskOutputEvidence = { version: 1, kind: "studio-review-capture", taskId: "task-one", scope,
    documentRole: "thumbnail", subject, sourceServerRevision: 7, captureSequence: 13, selectionMode: "pages",
    pages: [selectedPage] };
  const submission: Submission = { ...f.submission, revisionRef: { id: captured.id, lineage: "visual", revision: 7, productionSubmissionId: f.submission.id,
    digest: `sha256:${captured.rootGraphHash}`, createdAt: captured.createdAt }, sourceEvidence: evidence };
  const aggregate = { ...f.aggregate, deliverables: [{ ...deliverable, scope }], submissions: [submission] };
  const revisions = { ...f.revisions, "capture-artifact": [captured, ...f.revisions["capture-artifact"].slice(1)] };
  const source = () => resolveTaskOutputVisualSource(aggregate, submission, f.project, revisions, f.reviews, "제출 원고");
  const page = (ordinal: number): StudioReviewPreviewRead => ({ ordinal, sha256: ordinal === 0 ? f.hash : secondHash,
    mediaType: "image/png", byteLength: 128, url: `https://example.test/page-${ordinal}.png`, expiresAt: 1000,
    mapping: { status: "mapped", version: 1, sourceServerRevision: 7, sourceContentDigest: f.hash,
      page: { id: ordinal === 0 ? "page-one" : "page-two", ordinal, width: 800, height: 1200,
        renderWidth: 800, renderHeight: 1200, frames: [{ id: "frame-two", bounds: { x: 20, y: 30, width: 200, height: 100 } }],
        elements: [{ id: "frame-two", type: "frame", origin: "page" }] } } });
  return { ...f, aggregate, submission, revisions, evidence, selectedPage, source, page };
}

describe("명시한 작업 범위와 저장된 capture의 검수 연결", () => {
  it("업무 버전의 정확한 제출 ID를 audit하고 원본 입력을 고정해도 다른 업무 버전은 보존한다", () => {
    const f = fixture(), base = f.aggregate.tasks[0];
    if (!base) throw new Error("검증할 작업 fixture가 없습니다.");
    const task = { ...base, id: "consumer", projectId: f.aggregate.projectId, inputRevisionRefs: [f.submission.revisionRef] };
    const source = { ...f.aggregate, tasks: [task] };
    const audit = auditProductionStudioRevisionBindings(source, f.project, f.revisions);
    expect(audit.submissions[0]?.status).toBe("bound");
    expect(audit.tasks[0]?.status).toBe("bound");
    const raw = createStudioRevisionCandidates(f.project, f.revisions).find((entry) => entry.revision.id === f.submission.revisionRef.id);
    if (!raw) throw new Error("같은 원본 capture가 없습니다.");
    const pinned = pinProductionTaskToStudioRevision(task, raw);
    expect(pinned.inputRevisionRefs).toHaveLength(2);
    expect(pinned.inputRevisionRefs).toContainEqual(f.submission.revisionRef);
    expect(pinned.inputRevisionRefs).toContainEqual(raw.revisionRef);
    const forged = { ...f.submission, revisionRef: { ...f.submission.revisionRef, productionSubmissionId: "other-submission" } };
    expect(auditProductionStudioRevisionBindings({ ...source, submissions: [forged] }, f.project, f.revisions).submissions[0]?.status).not.toBe("bound");
  });
  it("프로젝트 범위 원본을 바꾸지 않고 새 업무 근거의 회차·선택 페이지만 연결한다", () => {
    const f = fixture(), before = structuredClone(f.project);
    const pinned = f.source();
    expect(pinned.artifact.scope).toEqual({ projectId: f.project.id });
    expect(pinned.sourceRevisionRef).toEqual(f.submission.revisionRef);
    expect(pinned.outputEvidence).toEqual(f.evidence);
    expect(selectTaskOutputPreviewPages(pinned, [f.page(0)], false)).toEqual([]);
    expect(selectTaskOutputPreviewPages(pinned, [f.page(0), f.page(1)], true)).toEqual([f.page(1)]);
    expect(f.project).toEqual(before);
    expect(() => resolveSubmissionVisualReview(f.aggregate, f.submission, f.project, f.revisions, f.reviews)).toThrow();
  });
  it.each(["workId", "projectId", "artifactId", "reviewId", "revisionId", "rootGraphHash"] as const)("새 근거의 %s가 다른 고정본이면 거절한다", (field) => {
    const f = fixture();
    expect(() => resolveTaskOutputVisualSource(f.aggregate, { ...f.submission, sourceEvidence: {
      ...f.evidence, subject: { ...f.evidence.subject, [field]: "other" },
    } }, f.project, f.revisions, f.reviews, "원고")).toThrow();
  });
  it("업무 범위·문서 역할·번호와 이미지 manifest가 다른 새 근거를 거절한다", () => {
    const f = fixture();
    for (const sourceEvidence of [
      { ...f.evidence, scope: episodeScope(f.aggregate.projectId, "another-episode") },
      { ...f.evidence, documentRole: "lettering" as const },
      { ...f.evidence, sourceServerRevision: 8 },
      { ...f.evidence, pages: [{ ...f.selectedPage, sha256: "e".repeat(64) }] },
      { ...f.evidence, selectionMode: "document" as const },
    ]) expect(() => resolveTaskOutputVisualSource(f.aggregate, { ...f.submission, sourceEvidence },
      f.project, f.revisions, f.reviews, "원고")).toThrow();
  });
  it("프레임 선택은 같은 고정 페이지 mapping에 존재하는 프레임만 표시한다", () => {
    const f = fixture();
    const sourceEvidence: ProductionTaskOutputEvidence = { ...f.evidence, selectionMode: "frames",
      pages: [{ ...f.selectedPage, frameIds: ["frame-two"] }] };
    const pinned = resolveTaskOutputVisualSource(f.aggregate, { ...f.submission, sourceEvidence },
      f.project, f.revisions, f.reviews, "프레임 원고");
    expect(selectTaskOutputPreviewPages(pinned, [f.page(0), f.page(1)], true)).toEqual([f.page(1)]);
    expect(() => selectTaskOutputPreviewPages({ ...pinned, outputEvidence: { ...sourceEvidence,
      pages: [{ ...f.selectedPage, frameIds: ["another-frame"] }] } }, [f.page(0), f.page(1)], true)).toThrow();
    expect(() => selectTaskOutputPreviewPages(pinned, [f.page(0)], true)).toThrow();
  });
  it("선택 페이지의 서버 버전·페이지 ID·해시가 바뀐 응답을 거절한다", () => {
    const f = fixture(), pinned = f.source(), good = f.page(1);
    const mapping = studioReviewPageMappingSchema.parse(good.mapping);
    if (mapping.status !== "mapped") throw new Error("검증할 mapping이 없습니다.");
    for (const page of [
      { ...good, sha256: "e".repeat(64) },
      { ...good, mapping: { ...mapping, sourceServerRevision: 8 } },
      { ...good, mapping: { ...mapping, page: { ...mapping.page, id: "another-page" } } },
    ]) expect(() => selectTaskOutputPreviewPages(pinned, [page], true)).toThrow();
  });
  it.each([{ mapping: null }, { mapping: [] }, { mapping: {} }, { mapping: { status: "mapped" } },
    { mapping: { status: "unmapped", reason: "legacy-review" } }])(
    "검증하지 않은 mapping $mapping을 고정 원고 연결로 신뢰하지 않는다", ({ mapping }) => {
      const f = fixture(), page = { ...f.page(1), mapping };
      expect(() => selectTaskOutputPreviewPages(f.source(), [page], true))
        .toThrow("고정한 원고 사용 범위와 페이지 연결이 다릅니다.");
    },
  );
});
