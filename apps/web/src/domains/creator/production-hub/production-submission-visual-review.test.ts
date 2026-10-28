import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStudioProjectByWork, getStudioReviewPreviews, listStudioArtifactRevisions, listStudioReviews } from "../project-graph/studio-project-graph-client";
import { loadPinnedSubmissionPreviews, loadSubmissionVisualReview, resolveSubmissionVisualReview } from "./production-submission-visual-review";
import { submissionCaptureVisualFixture, submissionVisualFixture } from "./production-submission-visual-review.test-fixture";

vi.mock("../project-graph/studio-project-graph-client", () => ({
  getStudioReviewPreviews: vi.fn(), getStudioProject: vi.fn(), getStudioReview: vi.fn(), getStudioProjectByWork: vi.fn(), listStudioArtifactRevisions: vi.fn(), listStudioReviews: vi.fn(),
}));
beforeEach(() => vi.resetAllMocks());

describe("제출 원고 시각 검수 정본", () => {
  it("새 head가 있어도 제출 ID·digest와 저장된 입력본만 선택한다", () => {
    const f = submissionVisualFixture();
    const result = resolveSubmissionVisualReview(f.aggregate, f.submission, f.project, f.revisions, f.reviews);
    expect(result.submission.revision.id).toBe("submitted-revision");
    expect(result.submission.review.id).toBe("submission-review");
    expect(result.baselines.map((entry) => entry.revision.id)).toEqual(["input-revision"]);
    const link = new URL(result.submission.reviewHref ?? "", "https://toon.test");
    expect(link.searchParams.get("revision")).toBe("submitted-revision");
    expect(link.searchParams.get("digest")).toBe(f.hash);
    expect(link.searchParams.get("graphProject")).toBe("graph-project");
    expect(link.searchParams.get("sharedReview")).toBe("submission-review");
  });
  it("digest·회차·작품·원고 소속 불일치를 head로 대체하지 않는다", () => {
    const f = submissionVisualFixture();
    expect(() => resolveSubmissionVisualReview(f.aggregate, { ...f.submission, revisionRef: { ...f.submission.revisionRef, digest: "sha256:wrong" } }, f.project, f.revisions, f.reviews)).toThrow("고정 원고");
    expect(() => resolveSubmissionVisualReview(f.aggregate, f.submission, { ...f.project, workId: "other-work" }, f.revisions, f.reviews)).toThrow("작품");
    expect(() => resolveSubmissionVisualReview(f.aggregate, f.submission, { ...f.project, artifacts: f.project.artifacts.map((entry) => ({ ...entry, scope: { ...entry.scope, episodeId: "other-episode" } })) }, f.revisions, f.reviews)).toThrow("고정 원고");
    expect(() => resolveSubmissionVisualReview(f.aggregate, f.submission, f.project, { artifact: f.revisions.artifact.map((entry) => ({ ...entry, artifactId: "foreign-artifact" })) }, f.reviews)).toThrow("고정 원고");
  });
  it("다른 버전의 검수를 프리뷰 권한으로 재사용하지 않는다", () => {
    const f = submissionVisualFixture();
    expect(() => resolveSubmissionVisualReview(f.aggregate, f.submission, f.project, f.revisions,
      { artifact: f.reviews.artifact.filter((entry) => entry.revisionId !== f.submission.revisionRef.id) })).toThrow("검수 이미지");
  });
  it.each(["approved", "rejected", "cancelled"] as const)("%s 검수도 현재 작품 ACL 아래 같은 고정 원고로 비교한다", async (status) => {
    const f = submissionVisualFixture();
    const result = resolveSubmissionVisualReview(f.aggregate, f.submission, f.project, f.revisions,
      { artifact: f.reviews.artifact.map((entry) => ({ ...entry, status })) });
    expect(result.submission.review.status).toBe(status);
    const baseline = result.baselines[0];
    if (!baseline) throw new Error("고정 기준본이 없습니다.");
    vi.mocked(getStudioReviewPreviews).mockResolvedValue({ ok: true, previews: [{ sha256: f.hash, ordinal: 0,
      mediaType: "image/png", byteLength: 100, url: "https://preview.test/approved", expiresAt: Date.now() + 30_000, mapping: null }], nextCursor: null });
    expect((await loadPinnedSubmissionPreviews(baseline))[0]?.url).toContain("approved");
    expect(getStudioReviewPreviews).toHaveBeenCalledWith("input-review", expect.objectContaining({ revisionId: "input-revision" }), null);
  });
  it("필요한 정본을 찾으면 남은 산출물 조회를 멈추고 무관한 검수는 읽지 않는다", async () => {
    const f = submissionVisualFixture();
    const artifact = f.project.artifacts[0];
    if (!artifact) throw new Error("원고 fixture가 없습니다.");
    const irrelevant = Array.from({ length: 12 }, (_, index) => ({ ...artifact, id: `unrelated-${index}`, headRevisionId: `other-${index}` }));
    vi.mocked(getStudioProjectByWork).mockResolvedValue({ ...f.project, artifacts: [...irrelevant, { ...artifact, approvedRevisionId: "input-revision" }] });
    vi.mocked(listStudioArtifactRevisions).mockImplementation(async (id) => {
      if (id === "artifact") return f.revisions.artifact;
      if (id === "unrelated-0") throw new Error("무관한 원고 장애");
      return [];
    });
    vi.mocked(listStudioReviews).mockResolvedValue(f.reviews.artifact);
    const result = await loadSubmissionVisualReview(f.aggregate, f.submission);
    expect(result.submission.revision.id).toBe("submitted-revision");
    expect(result.baselines[0]?.revision.id).toBe("input-revision");
    expect(listStudioArtifactRevisions).toHaveBeenCalledTimes(4);
    expect(listStudioReviews).toHaveBeenCalledTimes(1);
    expect(listStudioReviews).toHaveBeenCalledWith("artifact");
  });
  it("기준본 조회 장애가 있어도 선택 제출본은 유지한다", async () => {
    const f = submissionVisualFixture();
    const artifact = f.project.artifacts[0];
    if (!artifact) throw new Error("원고 fixture가 없습니다.");
    const inputArtifact = { ...artifact, id: "input-artifact", headRevisionId: "input-revision", scope: { ...artifact.scope, episodeId: "previous-episode" } };
    vi.mocked(getStudioProjectByWork).mockResolvedValue({ ...f.project, artifacts: [artifact, inputArtifact] });
    vi.mocked(listStudioArtifactRevisions).mockImplementation(async (id) => id === "artifact"
      ? f.revisions.artifact.filter((entry) => entry.id !== "input-revision")
      : f.revisions.artifact.filter((entry) => entry.id === "input-revision").map((entry) => ({ ...entry, artifactId: "input-artifact" })));
    vi.mocked(listStudioReviews).mockImplementation(async (id) => {
      if (id === "input-artifact") throw new Error("기준본 검수 조회 실패");
      return f.reviews.artifact;
    });
    const result = await loadSubmissionVisualReview(f.aggregate, f.submission);
    expect(result.submission.revision.id).toBe("submitted-revision");
    expect(result.baselines).toEqual([]);
  });
  it("일치하지 않는 Studio 제출 연결이 남아 있으면 검수를 열지 않는다", () => {
    const f = submissionVisualFixture();
    const link = { id: "stale-link", projectId: f.aggregate.projectId, workId: f.aggregate.workId, episodeId: "episode-12",
      studioDocumentRef: "artifact", documentRole: "lineart" as const, studioRevisionRef: { ...f.submission.revisionRef, id: "newer-head" },
      deliverableId: f.submission.deliverableId, submissionId: f.submission.id, linkedByAssignmentId: "assignment-art", status: "submitted" as const,
      linkedAt: f.submission.submittedAt, approvedAt: null };
    expect(() => resolveSubmissionVisualReview({ ...f.aggregate, studioRevisionLinks: [link] }, f.submission, f.project, f.revisions, f.reviews)).toThrow("Studio 연결");
  });
  it("전체 커서를 읽고 실제 이미지 순번을 정렬한다", async () => {
    const f = submissionVisualFixture();
    const source = resolveSubmissionVisualReview(f.aggregate, f.submission, f.project, f.revisions, f.reviews).submission;
    const preview = (ordinal: number) => ({ sha256: f.hash, ordinal, mediaType: "image/png" as const, byteLength: 100,
      url: `https://preview.test/${ordinal}`, expiresAt: Date.now() + 30_000, mapping: null });
    vi.mocked(getStudioReviewPreviews).mockResolvedValueOnce({ ok: true, previews: [preview(2)], nextCursor: "next" })
      .mockResolvedValueOnce({ ok: true, previews: [preview(0)], nextCursor: null });
    expect((await loadPinnedSubmissionPreviews(source)).map((page) => page.ordinal)).toEqual([0, 2]);
    expect(getStudioReviewPreviews).toHaveBeenNthCalledWith(2, "submission-review", {
      projectId: "graph-project", workId: f.aggregate.workId, artifactId: "artifact", revisionId: "submitted-revision", rootGraphHash: f.hash,
    }, "next");
  });
  it("뒷 페이지 버전 불일치와 순환 커서를 부분 성공으로 숨기지 않는다", async () => {
    const f = submissionVisualFixture();
    const source = resolveSubmissionVisualReview(f.aggregate, f.submission, f.project, f.revisions, f.reviews).submission;
    vi.mocked(getStudioReviewPreviews).mockResolvedValueOnce({ ok: true, previews: [], nextCursor: "next" })
      .mockResolvedValueOnce({ ok: false, reason: "version-mismatch" });
    await expect(loadPinnedSubmissionPreviews(source)).rejects.toThrow("버전이 일치하지 않습니다");
    vi.mocked(getStudioReviewPreviews).mockResolvedValue({ ok: true, previews: [], nextCursor: "repeat" });
    await expect(loadPinnedSubmissionPreviews(source)).rejects.toThrow("끝까지 확인하지 못했습니다");
    expect(getStudioReviewPreviews).toHaveBeenCalledTimes(4);
  });
  it("서버가 closed를 반환하면 역사 버전을 다른 이미지로 대체하지 않는다", async () => {
    const f = submissionVisualFixture();
    const source = resolveSubmissionVisualReview(f.aggregate, f.submission, f.project, f.revisions, f.reviews).submission;
    vi.mocked(getStudioReviewPreviews).mockResolvedValue({ ok: false, reason: "closed" });
    await expect(loadPinnedSubmissionPreviews(source)).rejects.toThrow("검수가 닫혔습니다");
    expect(getStudioReviewPreviews).toHaveBeenCalledTimes(1);
  });
  it("실제 producer의 별도 project 범위 snapshot을 서버 증명된 episode 원본에 명시 연결한다", async () => {
    const f = submissionCaptureVisualFixture();
    const result = resolveSubmissionVisualReview(f.aggregate, f.submission, f.project, f.revisions, f.reviews);
    expect(result.submission).toMatchObject({ sourceRevisionRef: f.submission.revisionRef, mapping: "captured-source",
      artifact: { id: "capture-artifact", kind: "review-snapshot", scope: { projectId: f.project.id } }, revision: { id: "capture-submitted" } });
    expect(result.baselines[0]).toMatchObject({ sourceRevisionRef: { id: "input-revision" }, revision: { id: "capture-input" } });
    expect(result.submission.reviewHref).toContain("revision=capture-submitted");
    expect(f.submission.revisionRef.id).toBe("submitted-revision");
    vi.mocked(getStudioReviewPreviews).mockResolvedValue({ ok: true, previews: [{ sha256: f.hash, ordinal: 0,
      mediaType: "image/png", byteLength: 100, url: "https://preview.test/captured", expiresAt: Date.now() + 30_000, mapping: null }], nextCursor: null });
    await loadPinnedSubmissionPreviews(result.submission);
    expect(getStudioReviewPreviews).toHaveBeenCalledWith("submission-review", expect.objectContaining({ artifactId: "capture-artifact", revisionId: "capture-submitted", rootGraphHash: f.hash }), null);
  });
  it("같은 hash만 있는 snapshot과 다른 episode 원본 증명은 대체하지 않는다", () => {
    const f = submissionCaptureVisualFixture();
    const unproven = f.reviews["capture-artifact"].map(({ sourceRevision: _sourceRevision, ...review }) => review);
    expect(() => resolveSubmissionVisualReview(f.aggregate, f.submission, f.project, f.revisions, { artifact: [], "capture-artifact": unproven })).toThrow("검수 이미지");
    const wrongScope = f.reviews["capture-artifact"].map((entry) => ({ ...entry, sourceRevision: { ...entry.sourceRevision,
      scope: { ...entry.sourceRevision.scope, episodeId: "other-episode" } } }));
    expect(() => resolveSubmissionVisualReview(f.aggregate, f.submission, f.project, f.revisions, { artifact: [], "capture-artifact": wrongScope })).toThrow("검수 이미지");
  });
  it("로더가 원본 이외의 producer artifact에서 검증된 source 매핑을 찾는다", async () => {
    const f = submissionCaptureVisualFixture();
    vi.mocked(getStudioProjectByWork).mockResolvedValue(f.project);
    vi.mocked(listStudioArtifactRevisions).mockImplementation(async (id) => id === "artifact" ? f.revisions.artifact : f.revisions["capture-artifact"]);
    vi.mocked(listStudioReviews).mockImplementation(async (id) => id === "artifact" ? [] : f.reviews["capture-artifact"]);
    const result = await loadSubmissionVisualReview(f.aggregate, f.submission);
    expect(result.submission.revision.id).toBe("capture-submitted");
    expect(listStudioReviews).toHaveBeenCalledWith("capture-artifact");
  });
  it("편집 담당자에게만 원본 tuple을 고정한 캡처 진입을 제공한다", () => {
    const f = submissionCaptureVisualFixture();
    try {
      resolveSubmissionVisualReview(f.aggregate, f.submission, { ...f.project, access: { ...f.project.access, edit: true } }, f.revisions, {});
      throw new Error("캡처가 필요한 원고가 잘못 승인되었습니다.");
    } catch (cause) {
      expect(cause).toMatchObject({ captureHref: expect.stringContaining("captureRevision=submitted-revision") });
    }
    try { resolveSubmissionVisualReview(f.aggregate, f.submission, f.project, f.revisions, {}); }
    catch (cause) { expect(cause).toMatchObject({ captureHref: null }); }
  });
  it("generic exact 검수에 preview ref가 없으면 같은 원본의 검증된 capture를 선택한다", () => {
    const f = submissionCaptureVisualFixture(), base = submissionVisualFixture();
    const revisions = { ...f.revisions, artifact: f.revisions.artifact.map((entry) => entry.id === "submitted-revision"
      ? { ...entry, kind: "review-snapshot" as const } : entry) };
    const result = resolveSubmissionVisualReview(f.aggregate, f.submission, f.project, revisions, {
      ...f.reviews, artifact: base.reviews.artifact.filter((review) => review.revisionId === "submitted-revision"),
    });
    expect(result.submission).toMatchObject({ mapping: "captured-source", sourceRevisionRef: { id: "submitted-revision" }, revision: { id: "capture-submitted" } });
  });
  it("preview가 없는 generic exact 검수만 있으면 편집 권한에 맞는 원본 캡처 진입으로 복구한다", () => {
    const f = submissionVisualFixture();
    const revisions = { artifact: f.revisions.artifact.map((entry) => ({ ...entry, blobRefs: [] })) };
    for (const edit of [true, false]) {
      try {
        resolveSubmissionVisualReview(f.aggregate, f.submission, { ...f.project, access: { ...f.project.access, edit } }, revisions, f.reviews);
        throw new Error("이미지 없는 generic 검수가 선택됐습니다.");
      } catch (cause) {
        expect(cause).toMatchObject({ captureHref: edit ? expect.stringContaining("captureRevision=submitted-revision") : null });
      }
    }
  });
  it("서버 preview-unavailable에만 원본 캡처 복구를 제공하고 버전·권한 오류는 유지한다", async () => {
    const f = submissionVisualFixture();
    const source = resolveSubmissionVisualReview(f.aggregate, f.submission, { ...f.project, access: { ...f.project.access, edit: true } }, f.revisions, f.reviews).submission;
    vi.mocked(getStudioReviewPreviews).mockResolvedValueOnce({ ok: false, reason: "preview-unavailable" });
    await expect(loadPinnedSubmissionPreviews(source)).rejects.toMatchObject({ captureHref: expect.stringContaining("captureRevision=submitted-revision") });
    for (const reason of ["version-mismatch", "closed"] as const) {
      vi.mocked(getStudioReviewPreviews).mockResolvedValueOnce({ ok: false, reason });
      const result: unknown = await loadPinnedSubmissionPreviews(source).catch((cause: unknown) => cause);
      expect(result).toBeInstanceOf(Error);
      expect(result).not.toHaveProperty("captureHref");
    }
    const denied = Object.assign(new Error("권한 회수"), { status: 403 });
    vi.mocked(getStudioReviewPreviews).mockRejectedValueOnce(denied);
    await expect(loadPinnedSubmissionPreviews(source)).rejects.toBe(denied);
    expect(source.sourceRevisionRef).toEqual(f.submission.revisionRef);
    const readonlySource = { ...source, captureHref: null };
    vi.mocked(getStudioReviewPreviews).mockResolvedValueOnce({ ok: false, reason: "preview-unavailable" });
    await expect(loadPinnedSubmissionPreviews(readonlySource)).rejects.toMatchObject({ captureHref: null });
  });
});
