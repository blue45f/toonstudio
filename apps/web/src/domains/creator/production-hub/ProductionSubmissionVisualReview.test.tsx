// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductionSubmissionVisualReview } from "./ProductionSubmissionVisualReview";
import { loadPinnedSubmissionPreviews, loadSubmissionVisualReview, resolveSubmissionVisualReview } from "./production-submission-visual-review";
import { submissionVisualFixture } from "./production-submission-visual-review.test-fixture";

vi.mock("./production-submission-visual-review", async (importOriginal) => ({
  ...await importOriginal<typeof import("./production-submission-visual-review")>(), loadSubmissionVisualReview: vi.fn(), loadPinnedSubmissionPreviews: vi.fn(),
}));
afterEach(cleanup);
beforeEach(() => vi.resetAllMocks());
function fixture() {
  const f = submissionVisualFixture();
  const data = resolveSubmissionVisualReview(f.aggregate, f.submission, f.project, f.revisions, f.reviews);
  vi.mocked(loadSubmissionVisualReview).mockResolvedValue(data);
  const preview = (ordinal: number, label: string) => ({ sha256: f.hash, ordinal, mediaType: "image/png" as const, byteLength: 10,
    url: `https://preview.test/${label}/${ordinal}`, expiresAt: Date.now() + 30_000, mapping: null });
  return { ...f, data, preview };
}

describe("고정 제출 원고 이미지 패널", () => {
  it("사용자가 열면 선택 제출본 이미지만 가져오고 입력본을 명시적으로 비교한다", async () => {
    const f = fixture();
    vi.mocked(loadPinnedSubmissionPreviews).mockImplementation(async (source) => [f.preview(0, source.revision.id)]);
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
    vi.mocked(loadPinnedSubmissionPreviews).mockImplementation(async (source) => source.revision.id === "submitted-revision"
      ? [f.preview(0, "submission"), f.preview(2, "submission")] : [f.preview(0, "input")]);
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
    const second = { ...first, revision: { ...first.revision, id: "second-input" } };
    vi.mocked(loadSubmissionVisualReview).mockResolvedValue({ ...f.data, baselines: [first, second] });
    let complete: ((pages: Awaited<ReturnType<typeof loadPinnedSubmissionPreviews>>) => void) | undefined;
    vi.mocked(loadPinnedSubmissionPreviews).mockImplementation(async (source) => source.revision.id === "second-input"
      ? new Promise((resolve) => { complete = resolve; }) : [f.preview(0, source.revision.id)]);
    render(<ProductionSubmissionVisualReview aggregate={f.aggregate} submission={f.submission} />);
    fireEvent.click(screen.getByRole("button", { name: "제출 원고 이미지 열기" }));
    await screen.findByRole("img");
    fireEvent.change(screen.getByRole("combobox", { name: "비교 기준본" }), { target: { value: "input-revision" } });
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    fireEvent.change(screen.getByRole("combobox", { name: "비교 기준본" }), { target: { value: "second-input" } });
    await waitFor(() => expect(loadPinnedSubmissionPreviews).toHaveBeenCalledWith(second));
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByRole("img").getAttribute("src")).toContain("submitted-revision");
    complete?.([f.preview(0, "second-input")]);
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    expect(screen.getAllByRole("img")[0]?.getAttribute("src")).toContain("second-input");
  });
  it("동일한 정본을 다시 받은 주기 조회는 이미지 요청·비교 선택을 재시작하지 않는다", async () => {
    const f = fixture();
    vi.mocked(loadPinnedSubmissionPreviews).mockImplementation(async (source) => [f.preview(0, source.revision.id)]);
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
