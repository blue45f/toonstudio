import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStudioProjectByWork, getStudioReviewPreviews, listStudioArtifactRevisions, listStudioReviews } from "../project-graph/studio-project-graph-client";
import { loadPinnedSubmissionPreviews, loadSubmissionVisualReview, resolveSubmissionVisualReview } from "./production-submission-visual-review";
import { submissionVisualFixture } from "./production-submission-visual-review.test-fixture";

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
      { artifact: f.reviews.artifact.filter((entry) => entry.revisionId !== f.submission.revisionRef.id) })).toThrow("Studio 검수");
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
});
