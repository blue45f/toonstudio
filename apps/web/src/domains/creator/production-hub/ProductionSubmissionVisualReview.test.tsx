// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveStudioReviewPageMapping } from "@toonstudio/studio-project-model";
import { api } from "@/platform/api";
import type { StudioReviewPreviewResult } from "../project-graph/studio-project-graph-client";
import { ProductionSubmissionVisualReview } from "./ProductionSubmissionVisualReview";
import { loadPinnedSubmissionPreviews, loadSubmissionVisualReview, resolveSubmissionVisualReview, SubmissionVisualReviewCaptureRequired } from "./production-submission-visual-review";
import { submissionCaptureVisualFixture, submissionVisualFixture } from "./production-submission-visual-review.test-fixture";

vi.mock("./production-submission-visual-review", async (importOriginal) => ({
  ...await importOriginal<typeof import("./production-submission-visual-review")>(), loadSubmissionVisualReview: vi.fn(), loadPinnedSubmissionPreviews: vi.fn(),
}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => vi.resetAllMocks());
function fixture() {
  const f = submissionVisualFixture();
  const data = resolveSubmissionVisualReview(f.aggregate, f.submission, f.project, f.revisions, f.reviews);
  vi.mocked(loadSubmissionVisualReview).mockResolvedValue(data);
  const preview = (ordinal: number, label: string, sha256 = f.hash) => ({ sha256, ordinal, mediaType: "image/png" as const, byteLength: 10,
    url: `https://preview.test/${label}/${ordinal}`, expiresAt: Date.now() + 30_000, mapping: { status: "unmapped" as const, reason: "legacy-review" as const } });
  return { ...f, data, preview };
}

function deferred<T>() {
  let complete: ((value: T) => void) | undefined;
  let fail: ((cause: unknown) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => { complete = resolve; fail = reject; });
  return { promise, resolve: (value: T) => {
    if (!complete) throw new Error("대기 중인 테스트 응답이 없습니다.");
    complete(value);
  }, reject: (cause: unknown) => {
    if (!fail) throw new Error("대기 중인 테스트 응답이 없습니다.");
    fail(cause);
  } };
}

async function streamingFixture() {
  const f = fixture();
  const real = await vi.importActual<typeof import("./production-submission-visual-review")>("./production-submission-visual-review");
  vi.mocked(loadPinnedSubmissionPreviews).mockImplementation(real.loadPinnedSubmissionPreviews);
  const doc = { width: 800, pagesList: Array.from({ length: 33 }, (_, ordinal) => ({ id: `page-${ordinal}`, canvasH: 1200, elements: [] })) };
  const pages = doc.pagesList.map((_, ordinal) => {
    const mapping = deriveStudioReviewPageMapping(doc, { sourceServerRevision: 7, sourceContentDigest: f.hash, ordinal,
      renderWidth: 800, renderHeight: 1200 });
    if (mapping.status !== "mapped") throw new Error("고정 페이지 mapping fixture가 없습니다.");
    return { ...f.preview(ordinal, "submission"), sha256: (ordinal + 1).toString(16).padStart(64, "0"), mapping };
  });
  const data = { ...f.data, submission: { ...f.data.submission, revision: { ...f.data.submission.revision,
    blobRefs: pages.map(({ sha256, ordinal }) => ({ sha256, ordinal, role: "preview" as const })) } } };
  vi.mocked(loadSubmissionVisualReview).mockResolvedValue(data);
  const subject = { schemaVersion: 1, projectId: data.submission.projectId, workId: data.submission.workId,
    artifactId: data.submission.artifact.id, reviewId: data.submission.review.id,
    revisionId: data.submission.revision.id, rootGraphHash: data.submission.revision.rootGraphHash };
  const cursor = `31.${pages[31]?.sha256}`;
  const prefix = { ok: true as const, subject, previews: pages.slice(0, 32), nextCursor: cursor };
  const suffix = { ok: true as const, subject, previews: pages.slice(32), nextCursor: null };
  return { ...f, data, pages, subject, cursor, prefix, suffix };
}

describe("고정 제출 원고 이미지 패널", () => {
  it("33페이지의 후반 cursor가 지연되어도 먼저 검증한 32페이지를 표시한다", async () => {
    const f = await streamingFixture(), pending = deferred<StudioReviewPreviewResult>();
    // 실제 component → 실제 cursor loader → 실제 graph client를 사용하고 HTTP 응답만 제어한다.
    const read = vi.spyOn(api, "get").mockResolvedValueOnce(f.prefix).mockReturnValueOnce(pending.promise);
    render(<ProductionSubmissionVisualReview aggregate={f.aggregate} submission={f.submission} />);
    fireEvent.click(screen.getByRole("button", { name: "제출 원고 이미지 열기" }));
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    for (const [index, call] of read.mock.calls.entries()) {
      const path = call[0];
      if (typeof path !== "string") throw new Error("프리뷰 HTTP 경로가 없습니다.");
      const url = new URL(path, "https://unit.test");
      expect(url.pathname).toBe("/studio-project-graph/reviews/submission-review/previews");
      for (const key of ["projectId", "workId", "artifactId", "revisionId", "rootGraphHash"] as const) {
        expect(url.searchParams.get(key)).toBe(f.subject[key]);
      }
      expect(url.searchParams.get("cursor")).toBe(index === 0 ? null : f.cursor);
    }
    try {
      const first = await screen.findByRole("img");
      expect(first.getAttribute("src")).toBe(f.pages[0]?.url);
      expect(screen.getByRole("combobox", { name: "이미지 순번" }).querySelectorAll("option")).toHaveLength(32);
      expect(screen.queryByRole("link", { name: "이 고정본에 핀 의견 남기기" })).toBeNull();
    } finally {
      await act(async () => { pending.resolve(f.suffix); });
    }
    await waitFor(() => expect(screen.getByRole("combobox", { name: "이미지 순번" }).querySelectorAll("option")).toHaveLength(33));
    expect(screen.getByRole("link", { name: "이 고정본에 핀 의견 남기기" }).getAttribute("href")).toBe(f.data.submission.reviewHref);
  });

  it("후반 페이지 hash가 원본 manifest와 다르면 이미 표시한 prefix와 검수 링크를 폐기한다", async () => {
    const f = await streamingFixture(), pending = deferred<StudioReviewPreviewResult>();
    vi.spyOn(api, "get").mockResolvedValueOnce(f.prefix).mockReturnValueOnce(pending.promise);
    render(<ProductionSubmissionVisualReview aggregate={f.aggregate} submission={f.submission} />);
    fireEvent.click(screen.getByRole("button", { name: "제출 원고 이미지 열기" }));
    await screen.findByRole("img");
    await act(async () => { pending.resolve({ ...f.suffix, previews: f.suffix.previews.map((page) => ({ ...page, sha256: "f".repeat(64) })) }); });
    expect((await screen.findByRole("alert")).textContent).toContain("버전이 일치하지 않습니다");
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("link", { name: "이 고정본에 핀 의견 남기기" })).toBeNull();
  });

  it("부분 이미지 실패는 후반 정상 완료 뒤 기존 한 번의 자동 URL 갱신으로 복구한다", async () => {
    const f = await streamingFixture(), pending = deferred<StudioReviewPreviewResult>();
    const renewed = { ...f.prefix, previews: f.prefix.previews.map((page) => ({ ...page, url: `${page.url}?renewed=1` })) };
    const read = vi.spyOn(api, "get").mockResolvedValueOnce(f.prefix).mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(renewed).mockResolvedValueOnce(f.suffix);
    render(<ProductionSubmissionVisualReview aggregate={f.aggregate} submission={f.submission} />);
    fireEvent.click(screen.getByRole("button", { name: "제출 원고 이미지 열기" }));
    fireEvent.error(await screen.findByRole("img"));
    expect(read).toHaveBeenCalledTimes(2);
    await act(async () => { pending.resolve(f.suffix); });
    await waitFor(() => expect(screen.getByRole("img").getAttribute("src")).toBe(`${f.pages[0]?.url}?renewed=1`));
    expect(read).toHaveBeenCalledTimes(4);
    expect(screen.getByRole("link", { name: "이 고정본에 핀 의견 남기기" }).getAttribute("href")).toBe(f.data.submission.reviewHref);
  });

  it("후반 접근 오류는 prefix를 폐기하고 자동 재시도로 권한을 추측하지 않는다", async () => {
    const f = await streamingFixture(), pending = deferred<StudioReviewPreviewResult>();
    const read = vi.spyOn(api, "get").mockResolvedValueOnce(f.prefix).mockReturnValueOnce(pending.promise);
    render(<ProductionSubmissionVisualReview aggregate={f.aggregate} submission={f.submission} />);
    fireEvent.click(screen.getByRole("button", { name: "제출 원고 이미지 열기" }));
    fireEvent.error(await screen.findByRole("img"));
    expect(read).toHaveBeenCalledTimes(2);
    await act(async () => { pending.reject(Object.assign(new Error("검수 이미지 접근이 철회되었습니다."), { response: { status: 403 } })); });
    expect((await screen.findByRole("alert")).textContent).toContain("접근이 철회");
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("link", { name: "이 고정본에 핀 의견 남기기" })).toBeNull();
    fireEvent(window, new Event("online"));
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("후반 네트워크 오류 뒤 명시적으로 새로고침하면 같은 정본을 처음부터 다시 검증한다", async () => {
    const f = await streamingFixture(), pending = deferred<StudioReviewPreviewResult>();
    const read = vi.spyOn(api, "get").mockResolvedValueOnce(f.prefix).mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(f.prefix).mockResolvedValueOnce(f.suffix);
    render(<ProductionSubmissionVisualReview aggregate={f.aggregate} submission={f.submission} />);
    fireEvent.click(screen.getByRole("button", { name: "제출 원고 이미지 열기" }));
    await screen.findByRole("img");
    await act(async () => { pending.reject(new Error("오프라인으로 나머지 원고를 읽지 못했습니다.")); });
    await screen.findByRole("alert");
    expect(screen.queryByRole("img")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "이미지 새로고침" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "이미지 순번" }).querySelectorAll("option")).toHaveLength(33));
    expect(screen.getByRole("link", { name: "이 고정본에 핀 의견 남기기" }).getAttribute("href")).toBe(f.data.submission.reviewHref);
    expect(read).toHaveBeenCalledTimes(4);
    expect(loadSubmissionVisualReview).toHaveBeenCalledTimes(2);
  });

  it("제출 subject 변경으로 취소한 후반 응답은 새 화면에 prefix나 최종 이미지를 적용하지 않는다", async () => {
    const f = await streamingFixture(), pending = deferred<StudioReviewPreviewResult>();
    vi.spyOn(api, "get").mockResolvedValueOnce(f.prefix).mockReturnValueOnce(pending.promise);
    const view = render(<ProductionSubmissionVisualReview aggregate={f.aggregate} submission={f.submission} />);
    fireEvent.click(screen.getByRole("button", { name: "제출 원고 이미지 열기" }));
    await screen.findByRole("img");
    const signal = vi.mocked(loadPinnedSubmissionPreviews).mock.calls[0]?.[1]?.signal;
    view.rerender(<ProductionSubmissionVisualReview aggregate={f.aggregate} submission={{ ...f.submission, id: "other-submission" }} />);
    expect(signal?.aborted).toBe(true);
    expect(screen.queryByRole("img")).toBeNull();
    await act(async () => { pending.resolve(f.suffix); });
    expect(screen.getByRole("button", { name: "제출 원고 이미지 열기" })).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("link", { name: "이 고정본에 핀 의견 남기기" })).toBeNull();
  });

  it("실제 producer 이미지와 원본 제출 정본의 ID를 구별하고 원본으로 기준본을 선택한다", async () => {
    const f = submissionCaptureVisualFixture();
    vi.mocked(loadSubmissionVisualReview).mockResolvedValue(resolveSubmissionVisualReview(f.aggregate, f.submission, f.project, f.revisions, f.reviews));
    vi.mocked(loadPinnedSubmissionPreviews).mockImplementation(async (source) => [{ sha256: source.revision.rootGraphHash, ordinal: 0, mediaType: "image/png", byteLength: 10,
      url: `https://preview.test/${source.revision.id}`, expiresAt: Date.now() + 30_000, mapping: { status: "unmapped", reason: "legacy-review" } }]);
    render(<ProductionSubmissionVisualReview aggregate={f.aggregate} submission={f.submission} />);
    fireEvent.click(screen.getByRole("button", { name: "제출 원고 이미지 열기" }));
    await screen.findByRole("img");
    expect(screen.getByText(/제출 정본 submitted-revision/)).toBeTruthy();
    expect(screen.getByText(/같은 제출 정본에서 만든 검수 이미지/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "이 고정본에 핀 의견 남기기" }).getAttribute("href")).toContain("revision=capture-submitted");
    fireEvent.change(screen.getByRole("combobox", { name: "비교 기준본" }), { target: { value: "input-revision" } });
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    expect(screen.getAllByRole("img")[0]?.getAttribute("src")).toBe("https://preview.test/capture-input");
  });
  it("검수 이미지가 없으면 명시적인 정본 캡처 링크만 제공하고 자동 생성하지 않는다", async () => {
    const f = fixture();
    vi.mocked(loadSubmissionVisualReview).mockRejectedValue(new SubmissionVisualReviewCaptureRequired("/studio/work/work/canvas?captureRevision=submitted-revision"));
    render(<ProductionSubmissionVisualReview aggregate={f.aggregate} submission={f.submission} />);
    fireEvent.click(screen.getByRole("button", { name: "제출 원고 이미지 열기" }));
    const link = await screen.findByRole("link", { name: "이 제출 정본으로 검수 이미지 만들기" });
    expect(link.getAttribute("href")).toContain("captureRevision=submitted-revision");
    expect(loadPinnedSubmissionPreviews).not.toHaveBeenCalled();
  });
  it("exact 검수의 서버 프리뷰가 없을 때도 원본 캡처 복구 링크를 표시한다", async () => {
    const f = fixture();
    vi.mocked(loadPinnedSubmissionPreviews).mockRejectedValue(new SubmissionVisualReviewCaptureRequired("/studio/work/work/canvas?captureRevision=submitted-revision"));
    render(<ProductionSubmissionVisualReview aggregate={f.aggregate} submission={f.submission} />);
    fireEvent.click(screen.getByRole("button", { name: "제출 원고 이미지 열기" }));
    expect((await screen.findByRole("link", { name: "이 제출 정본으로 검수 이미지 만들기" })).getAttribute("href")).toContain("captureRevision=submitted-revision");
    expect(loadSubmissionVisualReview).toHaveBeenCalledTimes(1);
    expect(loadPinnedSubmissionPreviews).toHaveBeenCalledTimes(1);
  });
  it("사용자가 열면 선택 제출본 이미지만 가져오고 입력본을 명시적으로 비교한다", async () => {
    const f = fixture();
    vi.mocked(loadPinnedSubmissionPreviews).mockImplementation(async (source) => [f.preview(0, source.revision.id, source.revision.rootGraphHash)]);
    render(<ProductionSubmissionVisualReview aggregate={f.aggregate} submission={f.submission} />);
    expect(loadSubmissionVisualReview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "제출 원고 이미지 열기" }));
    await waitFor(() => expect(screen.getByRole("img").getAttribute("src")).toContain("submitted-revision"));
    const baseline = screen.getByRole("combobox", { name: "비교 기준본" });
    fireEvent.change(baseline, { target: { value: "input-revision" } });
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    expect(screen.getAllByRole("img").map((entry) => entry.getAttribute("src"))).toEqual([
      "https://preview.test/input-revision/0", "https://preview.test/submitted-revision/0",
    ]);
    expect(screen.getByRole("link", { name: "이 고정본에 핀 의견 남기기" }).getAttribute("href")).toContain("revision=submitted-revision");
    fireEvent.click(screen.getByRole("button", { name: "원고 겹쳐 보기" }));
    expect(screen.getByRole("slider", { name: "제출본 불투명도" })).toBeTruthy();
  });
  it("새 이미지가 추가된 순번에서 기준 이미지를 지어내지 않고 누락을 표시한다", async () => {
    const f = fixture();
    vi.mocked(loadSubmissionVisualReview).mockResolvedValue({ ...f.data, submission: { ...f.data.submission,
      revision: { ...f.data.submission.revision, blobRefs: [0, 2].map((ordinal) => ({ sha256: f.hash, ordinal, role: "preview" as const })) } } });
    vi.mocked(loadPinnedSubmissionPreviews).mockImplementation(async (source) => source.revision.id === "submitted-revision"
      ? [f.preview(0, "submission"), f.preview(2, "submission")] : [f.preview(0, "input", source.revision.rootGraphHash)]);
    render(<ProductionSubmissionVisualReview aggregate={f.aggregate} submission={f.submission} />);
    fireEvent.click(screen.getByRole("button", { name: "제출 원고 이미지 열기" }));
    await screen.findByRole("img");
    fireEvent.change(screen.getByRole("combobox", { name: "비교 기준본" }), { target: { value: "input-revision" } });
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    fireEvent.change(screen.getByRole("combobox", { name: "이미지 순번" }), { target: { value: "2" } });
    expect(screen.getByText("이 버전에는 해당 순번의 이미지가 없습니다.")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("src")).toBe("https://preview.test/submission/2");
  });
  it("이미지 오류는 같은 고정 원고를 한 번 자동 조회하고 교체 URL도 실패하면 멈춘다", async () => {
    const f = fixture();
    vi.mocked(loadPinnedSubmissionPreviews).mockResolvedValueOnce([f.preview(0, "expired")]).mockResolvedValueOnce([f.preview(0, "fresh")]);
    render(<ProductionSubmissionVisualReview aggregate={f.aggregate} submission={f.submission} />);
    fireEvent.click(screen.getByRole("button", { name: "제출 원고 이미지 열기" }));
    fireEvent.error(await screen.findByRole("img"));
    await waitFor(() => expect(screen.getByRole("img").getAttribute("src")).toBe("https://preview.test/fresh/0"));
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("alert").textContent).toContain("복구되지 않으면");
    await waitFor(() => expect(loadPinnedSubmissionPreviews).toHaveBeenCalledTimes(2));
    expect(loadSubmissionVisualReview).toHaveBeenCalledTimes(1);
  });
  it("완료된 고정본의 이미지 재조회가 접근 오류로 끝나면 이전 이미지와 링크도 폐기한다", async () => {
    const f = fixture();
    vi.mocked(loadPinnedSubmissionPreviews).mockResolvedValueOnce([f.preview(0, "current")])
      .mockRejectedValueOnce(Object.assign(new Error("검수 이미지 접근이 철회되었습니다."), { status: 403 }));
    render(<ProductionSubmissionVisualReview aggregate={f.aggregate} submission={f.submission} />);
    fireEvent.click(screen.getByRole("button", { name: "제출 원고 이미지 열기" }));
    fireEvent.error(await screen.findByRole("img"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("접근이 철회"));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("link", { name: "이 고정본에 핀 의견 남기기" })).toBeNull();
    expect(loadPinnedSubmissionPreviews).toHaveBeenCalledTimes(2);
  });
  it("제출본이 바뀌면 늦게 도착한 이전 제출본의 이미지를 표시하지 않는다", async () => {
    const f = fixture();
    let complete: ((value: typeof f.data) => void) | undefined;
    vi.mocked(loadSubmissionVisualReview).mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    const view = render(<ProductionSubmissionVisualReview aggregate={f.aggregate} submission={f.submission} />);
    fireEvent.click(screen.getByRole("button", { name: "제출 원고 이미지 열기" }));
    await waitFor(() => expect(loadSubmissionVisualReview).toHaveBeenCalledTimes(1));
    view.rerender(<ProductionSubmissionVisualReview aggregate={f.aggregate} submission={{ ...f.submission, id: "other-submission" }} />);
    complete?.(f.data);
    await waitFor(() => expect(screen.getByRole("button", { name: "제출 원고 이미지 열기" })).toBeTruthy());
    expect(loadPinnedSubmissionPreviews).not.toHaveBeenCalled();
    expect(screen.queryByRole("img")).toBeNull();
  });
  it("기준본을 바꾸는 동안 이전 기준본 이미지를 새 버전 이름으로 표시하지 않는다", async () => {
    const f = fixture();
    const first = f.data.baselines[0];
    if (!first) throw new Error("기준본 fixture가 없습니다.");
    const second = { ...first, sourceRevisionRef: { ...first.sourceRevisionRef, id: "second-input" }, revision: { ...first.revision, id: "second-input" },
      review: { ...first.review, id: "second-review", revisionId: "second-input" } };
    vi.mocked(loadSubmissionVisualReview).mockResolvedValue({ ...f.data, baselines: [first, second] });
    let complete: ((pages: Awaited<ReturnType<typeof loadPinnedSubmissionPreviews>>) => void) | undefined;
    vi.mocked(loadPinnedSubmissionPreviews).mockImplementation(async (source) => source.revision.id === "second-input"
      ? new Promise((resolve) => { complete = resolve; }) : [f.preview(0, source.revision.id, source.revision.rootGraphHash)]);
    render(<ProductionSubmissionVisualReview aggregate={f.aggregate} submission={f.submission} />);
    fireEvent.click(screen.getByRole("button", { name: "제출 원고 이미지 열기" }));
    await screen.findByRole("img");
    fireEvent.change(screen.getByRole("combobox", { name: "비교 기준본" }), { target: { value: "input-revision" } });
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    fireEvent.change(screen.getByRole("combobox", { name: "비교 기준본" }), { target: { value: "second-input" } });
    await waitFor(() => expect(loadPinnedSubmissionPreviews).toHaveBeenCalledWith(second, expect.objectContaining({ signal: expect.any(AbortSignal), onValidatedPrefix: expect.any(Function) })));
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByRole("img").getAttribute("src")).toContain("submitted-revision");
    complete?.([f.preview(0, "second-input", second.revision.rootGraphHash)]);
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    expect(screen.getAllByRole("img")[0]?.getAttribute("src")).toContain("second-input");
  });
  it("동일한 정본을 다시 받은 주기 조회는 이미지 요청·비교 선택을 재시작하지 않는다", async () => {
    const f = fixture();
    vi.mocked(loadPinnedSubmissionPreviews).mockImplementation(async (source) => [f.preview(0, source.revision.id, source.revision.rootGraphHash)]);
    const view = render(<ProductionSubmissionVisualReview aggregate={f.aggregate} submission={f.submission} />);
    fireEvent.click(screen.getByRole("button", { name: "제출 원고 이미지 열기" }));
    await screen.findByRole("img");
    fireEvent.change(screen.getByRole("combobox", { name: "비교 기준본" }), { target: { value: "input-revision" } });
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    view.rerender(<ProductionSubmissionVisualReview aggregate={structuredClone(f.aggregate)} submission={structuredClone(f.submission)} />);
    expect((screen.getByRole("combobox", { name: "비교 기준본" }) as HTMLSelectElement).value).toBe("input-revision");
    expect(screen.getAllByRole("img")).toHaveLength(2);
    expect(loadSubmissionVisualReview).toHaveBeenCalledTimes(1);
    expect(loadPinnedSubmissionPreviews).toHaveBeenCalledTimes(2);
  });
  it("만료된 다른 순번을 선택하면 원고 메타데이터 재조회 없이 주소를 갱신한다", async () => {
    const f = fixture();
    vi.mocked(loadSubmissionVisualReview).mockResolvedValue({ ...f.data, submission: { ...f.data.submission,
      revision: { ...f.data.submission.revision, blobRefs: [0, 1].map((ordinal) => ({ sha256: f.hash, ordinal, role: "preview" as const })) } } });
    const stale = { ...f.preview(1, "expired-page"), expiresAt: Date.now() - 1000 };
    vi.mocked(loadPinnedSubmissionPreviews).mockResolvedValueOnce([f.preview(0, "current"), stale])
      .mockResolvedValueOnce([f.preview(0, "renewed"), f.preview(1, "renewed")]);
    render(<ProductionSubmissionVisualReview aggregate={f.aggregate} submission={f.submission} />);
    fireEvent.click(screen.getByRole("button", { name: "제출 원고 이미지 열기" }));
    await screen.findByRole("img");
    fireEvent.change(screen.getByRole("combobox", { name: "이미지 순번" }), { target: { value: "1" } });
    await waitFor(() => expect(screen.getByRole("img").getAttribute("src")).toBe("https://preview.test/renewed/1"));
    expect(loadSubmissionVisualReview).toHaveBeenCalledTimes(1);
    expect(loadPinnedSubmissionPreviews).toHaveBeenCalledTimes(2);
  });
  it("자동 갱신이 같은 만료 URL을 반환해도 무한 재조회하지 않는다", async () => {
    const f = fixture();
    const expired = { ...f.preview(0, "expired"), expiresAt: Date.now() - 1000 };
    vi.mocked(loadPinnedSubmissionPreviews).mockResolvedValue([expired]);
    render(<ProductionSubmissionVisualReview aggregate={f.aggregate} submission={f.submission} />);
    fireEvent.click(screen.getByRole("button", { name: "제출 원고 이미지 열기" }));
    await waitFor(() => expect(loadPinnedSubmissionPreviews).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("복구되지 않으면");
    expect(loadSubmissionVisualReview).toHaveBeenCalledTimes(1);
  });
});
