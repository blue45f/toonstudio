// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PinnedShareView } from "@toonstudio/studio-project-model/pinned-review-share";

import { StudioPinnedReviewSharePage } from "./StudioPinnedReviewSharePage";

const mocks = vi.hoisted(() => ({ view: vi.fn(), image: vi.fn(), feedback: vi.fn() }));
vi.mock("./studio-pinned-review-share-client", () => ({
  viewPinnedReviewShare: mocks.view,
  loadPinnedReviewSharePage: mocks.image,
  submitPinnedReviewShareFeedback: mocks.feedback,
}));

const TOKEN = "A".repeat(43);
const SHARE_ID = "11111111-1111-4111-8111-111111111111";
const pages = [
  { ordinal: 0, sha256: "a".repeat(64), byteLength: 4, mediaType: "image/png" as const, width: 800, height: 1200 },
  { ordinal: 2, sha256: "b".repeat(64), byteLength: 5, mediaType: "image/webp" as const, width: 900, height: 1300 },
];
function shareView(role: PinnedShareView["role"] = "commenter", feedback: PinnedShareView["feedback"] = []): PinnedShareView {
  return {
    id: SHARE_ID, title: "외부 콘티 검토", instructions: "두 페이지의 컷 호흡을 확인해 주세요.",
    purpose: "external-review", role, watermark: true, rightsStatement: "",
    revisionFingerprint: "c".repeat(64), expiresAt: "2030-09-23T00:00:00.000Z",
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(), pages, feedback,
  };
}
function Harness({ initial = `/production/pinned-review#token=${TOKEN}` }: { initial?: string }) {
  return <MemoryRouter initialEntries={[initial]}><Routes>
    <Route path="/production/pinned-review" element={<StudioPinnedReviewSharePage />} />
    <Route path="/showcase/reviews/:shareId" element={<StudioPinnedReviewSharePage />} />
  </Routes></MemoryRouter>;
}

function ReviewLinkNavigation({ token }: { readonly token: string }) {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(`/production/pinned-review#token=${token}`)}>검수 링크 전환</button>;
}

function deferred<T>() {
  let complete: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => { complete = resolve; });
  return { promise, resolve: (value: T) => {
    if (!complete) throw new Error("대기 중인 테스트 응답이 없습니다.");
    complete(value);
  } };
}

const originalCreate = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const originalRevoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
const createUrl = vi.fn((blob: Blob) => `blob:review-${blob.size}`);
const revokeUrl = vi.fn();
beforeAll(() => {
  Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: createUrl });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: revokeUrl });
});
afterAll(() => {
  if (originalCreate) Object.defineProperty(URL, "createObjectURL", originalCreate); else Reflect.deleteProperty(URL, "createObjectURL");
  if (originalRevoke) Object.defineProperty(URL, "revokeObjectURL", originalRevoke); else Reflect.deleteProperty(URL, "revokeObjectURL");
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.view.mockResolvedValue(shareView());
  mocks.image.mockImplementation(async (_access: unknown, ordinal: number) => new Blob([`page-${ordinal}`], { type: "image/png" }));
  mocks.feedback.mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222", pageOrdinal: 0, reviewerName: "멘토", body: "첫 컷을 조금 더 길게 보여 주세요.", createdAt: "2026-09-23T00:00:00.000Z" });
  vi.spyOn(crypto, "randomUUID").mockReturnValue("22222222-2222-4222-8222-222222222222");
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("external immutable review page", () => {
  it("화면에 머무른 채 권한을 갱신할 때 같은 PNG를 중복 다운로드하지 않는다", async () => {
    vi.useFakeTimers();
    await act(async () => { render(<Harness />); });
    const originalUrl = screen.getByRole("img", { name: "1페이지 고정 검수 이미지" }).getAttribute("src");
    await act(async () => { await vi.advanceTimersByTimeAsync(59_000); });
    expect(mocks.view).toHaveBeenCalledTimes(2);
    expect(mocks.image).toHaveBeenCalledOnce();
    expect(screen.getByRole("img").getAttribute("src")).toBe(originalUrl);
  });

  it("정상 권한 갱신은 진행 중인 같은 페이지 PNG를 무효화하지 않는다", async () => {
    vi.useFakeTimers();
    const pending = deferred<Blob>();
    mocks.image.mockImplementationOnce(() => pending.promise);
    await act(async () => { render(<Harness />); });
    await act(async () => { await vi.advanceTimersByTimeAsync(59_000); });
    expect(mocks.view).toHaveBeenCalledTimes(2);
    expect(mocks.image).toHaveBeenCalledOnce();
    await act(async () => { pending.resolve(new Blob(["verified-page"], { type: "image/png" })); });
    expect(screen.getByRole("img", { name: "1페이지 고정 검수 이미지" })).toBeTruthy();
  });

  it("같은 고정 페이지로 복귀하면 새 권한을 확인한 뒤 PNG를 다시 읽는다", async () => {
    let visibility: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    const singlePage = { ...shareView(), pages: pages.slice(0, 1) }, renewedView = deferred<PinnedShareView>();
    mocks.view.mockResolvedValueOnce(singlePage).mockImplementationOnce(() => renewedView.promise);
    render(<Harness />);
    const original = await screen.findByRole("img", { name: "1페이지 고정 검수 이미지" });
    const originalUrl = original.getAttribute("src");

    act(() => { visibility = "hidden"; document.dispatchEvent(new Event("visibilitychange")); });
    expect(screen.queryByRole("img")).toBeNull();
    expect(revokeUrl).toHaveBeenCalledWith(originalUrl);

    act(() => { visibility = "visible"; document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(mocks.view).toHaveBeenCalledTimes(2));
    expect(mocks.image).toHaveBeenCalledOnce();
    expect(screen.queryByRole("img")).toBeNull();
    await act(async () => { renewedView.resolve(singlePage); });
    await waitFor(() => expect(mocks.image).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("img", { name: "1페이지 고정 검수 이미지" })).toBeTruthy();
  });

  it("숨김 중인 PNG 요청을 취소하고 늦게 도착한 바이트를 표시하지 않는다", async () => {
    let visibility: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    const pending = deferred<Blob>();
    let imageSignal: AbortSignal | undefined;
    mocks.image.mockImplementationOnce((_access: unknown, _ordinal: number, signal: AbortSignal) => {
      imageSignal = signal;
      return pending.promise;
    });
    render(<Harness />);
    await waitFor(() => expect(mocks.image).toHaveBeenCalledOnce());
    act(() => { visibility = "hidden"; document.dispatchEvent(new Event("visibilitychange")); });
    if (!imageSignal) throw new Error("PNG 요청의 AbortSignal이 없습니다.");
    expect(imageSignal.aborted).toBe(true);
    await act(async () => { pending.resolve(new Blob(["obsolete-image"], { type: "image/png" })); });
    expect(screen.queryByRole("img")).toBeNull();
    expect(createUrl).not.toHaveBeenCalled();
  });

  it("복귀 직후 focus 검증이 겹쳐도 최신 권한 확인 후 이미지를 한 번 복구한다", async () => {
    let visibility: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    const earlier = deferred<PinnedShareView>();
    mocks.view.mockResolvedValueOnce(shareView()).mockImplementationOnce(() => earlier.promise)
      .mockResolvedValueOnce(shareView());
    render(<Harness />);
    await screen.findByRole("img", { name: "1페이지 고정 검수 이미지" });
    act(() => { visibility = "hidden"; document.dispatchEvent(new Event("visibilitychange")); });
    act(() => { visibility = "visible"; document.dispatchEvent(new Event("visibilitychange")); });
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(mocks.view).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(mocks.image).toHaveBeenCalledTimes(2));
    await act(async () => { earlier.resolve(shareView()); });
    expect(mocks.image).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("img", { name: "1페이지 고정 검수 이미지" })).toBeTruthy();
  });

  it("숨김 중 권한이 회수되면 복귀해도 이전 PNG를 되살리지 않는다", async () => {
    let visibility: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    mocks.view.mockResolvedValueOnce(shareView()).mockRejectedValueOnce(new Error("share revoked"));
    render(<Harness />);
    const original = await screen.findByRole("img", { name: "1페이지 고정 검수 이미지" });
    const originalUrl = original.getAttribute("src");
    act(() => { visibility = "hidden"; document.dispatchEvent(new Event("visibilitychange")); });
    expect(screen.queryByRole("img")).toBeNull();
    expect(revokeUrl).toHaveBeenCalledWith(originalUrl);

    act(() => { visibility = "visible"; document.dispatchEvent(new Event("visibilitychange")); });
    await screen.findByRole("heading", { name: "고정 검수본을 열 수 없습니다" });
    expect(screen.queryByRole("img")).toBeNull();
    expect(mocks.image).toHaveBeenCalledOnce();
    expect(createUrl).toHaveBeenCalledOnce();
  });

  it("숨김 중 링크가 바뀌면 새 링크 권한 확인 전까지 이전 PNG를 표시하지 않는다", async () => {
    let visibility: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    const nextToken = "B".repeat(43), nextView = deferred<PinnedShareView>();
    mocks.view.mockResolvedValueOnce(shareView()).mockImplementationOnce(() => nextView.promise);
    mocks.image.mockResolvedValueOnce(new Blob(["old"], { type: "image/png" }))
      .mockResolvedValueOnce(new Blob(["new-new"], { type: "image/png" }));
    render(<MemoryRouter initialEntries={[`/production/pinned-review#token=${TOKEN}`]}>
      <ReviewLinkNavigation token={nextToken} />
      <Routes><Route path="/production/pinned-review" element={<StudioPinnedReviewSharePage />} /></Routes>
    </MemoryRouter>);
    const original = await screen.findByRole("img", { name: "1페이지 고정 검수 이미지" });
    const originalUrl = original.getAttribute("src");
    act(() => { visibility = "hidden"; document.dispatchEvent(new Event("visibilitychange")); });
    fireEvent.click(screen.getByRole("button", { name: "검수 링크 전환" }));
    expect(screen.queryByRole("img")).toBeNull();
    expect(revokeUrl).toHaveBeenCalledWith(originalUrl);
    expect(mocks.image).toHaveBeenCalledOnce();

    act(() => { visibility = "visible"; document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(mocks.view).toHaveBeenLastCalledWith({ token: nextToken }));
    expect(screen.queryByRole("img")).toBeNull();
    await act(async () => { nextView.resolve({ ...shareView(), title: "새 고정 검수본" }); });
    expect(await screen.findByRole("img", { name: "1페이지 고정 검수 이미지" })).toBeTruthy();
    expect(mocks.image).toHaveBeenLastCalledWith({ token: nextToken }, 0, expect.any(AbortSignal));
    expect(screen.getByRole("img").getAttribute("src")).not.toBe(originalUrl);
  });

  it("이미지 로드가 실패하면 이미지 영역에 오류와 다시 불러오기 버튼을 보여주고 재시도한다", async () => {
    mocks.image
      .mockRejectedValueOnce(new Error("network down"))
      .mockImplementation(async (_access: unknown, ordinal: number) => new Blob([`page-${ordinal}`], { type: "image/png" }));
    render(<Harness />);
    await screen.findByRole("heading", { name: "외부 콘티 검토" });
    const retry = await screen.findByRole("button", { name: "이미지 다시 불러오기" });
    fireEvent.click(retry);
    expect(await screen.findByRole("img", { name: "1페이지 고정 검수 이미지" })).toBeTruthy();
    expect(mocks.image).toHaveBeenCalledTimes(2);
  });

  it("opens only the token-scoped immutable pages and changes images by exact ordinal", async () => {
    render(<Harness />);
    expect(await screen.findByRole("heading", { name: "외부 콘티 검토" })).toBeTruthy();
    await waitFor(() => expect(mocks.view).toHaveBeenCalledWith({ token: TOKEN }));
    await waitFor(() => expect(mocks.image).toHaveBeenCalledWith({ token: TOKEN }, 0, expect.any(AbortSignal)));
    expect(screen.getByRole("img", { name: "1페이지 고정 검수 이미지" }).getAttribute("src")).toBe("blob:review-6");
    fireEvent.click(screen.getByRole("button", { name: "다음 페이지" }));
    await waitFor(() => expect(mocks.image).toHaveBeenCalledWith({ token: TOKEN }, 2, expect.any(AbortSignal)));
    expect(await screen.findByRole("img", { name: "3페이지 고정 검수 이미지" })).toBeTruthy();
    expect(screen.getByText(/현재 원고가 아닌 고정 검수 이미지/)).toBeTruthy();
  });

  it("records a comment against only the selected immutable page and refreshes authority", async () => {
    const recorded = { id: "22222222-2222-4222-8222-222222222222", pageOrdinal: 0, reviewerName: "멘토", body: "첫 컷을 조금 더 길게 보여 주세요.", createdAt: "2026-09-23T00:00:00.000Z" };
    mocks.feedback.mockResolvedValue(recorded);
    mocks.view.mockResolvedValueOnce(shareView()).mockResolvedValueOnce(shareView("commenter", [recorded]));
    render(<Harness />);
    await screen.findByRole("heading", { name: "외부 콘티 검토" });
    fireEvent.change(screen.getByLabelText("검토자 이름"), { target: { value: "멘토" } });
    fireEvent.change(screen.getByLabelText("의견"), { target: { value: recorded.body } });
    fireEvent.click(screen.getByRole("button", { name: "의견 기록" }));
    await waitFor(() => expect(mocks.feedback).toHaveBeenCalledWith({ token: TOKEN }, expect.objectContaining({ pageOrdinal: 0, reviewerName: "멘토", body: recorded.body })));
    expect(await screen.findByText(recorded.body)).toBeTruthy();
    expect(mocks.view).toHaveBeenCalledTimes(2);
  });

  it("reuses the same feedback id when an uncertain response is retried", async () => {
    const recorded = { id: "22222222-2222-4222-8222-222222222222", pageOrdinal: 0, reviewerName: "멘토", body: "응답 유실 뒤에도 한 번만 남아야 합니다.", createdAt: "2026-09-23T00:00:00.000Z" };
    mocks.feedback.mockRejectedValueOnce(new Error("uncertain")).mockResolvedValueOnce(recorded);
    mocks.view.mockResolvedValueOnce(shareView()).mockResolvedValueOnce(shareView("commenter", [recorded]));
    render(<Harness />);
    await screen.findByRole("heading", { name: "외부 콘티 검토" });
    fireEvent.change(screen.getByLabelText("검토자 이름"), { target: { value: recorded.reviewerName } });
    fireEvent.change(screen.getByLabelText("의견"), { target: { value: recorded.body } });
    const submit = screen.getByRole("button", { name: "의견 기록" });
    fireEvent.click(submit);
    expect(await screen.findByText(/같은 내용으로 다시 시도하면 중복 의견을 만들지 않습니다/)).toBeTruthy();
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.feedback).toHaveBeenCalledTimes(2));
    const first = mocks.feedback.mock.calls[0]![1];
    const second = mocks.feedback.mock.calls[1]![1];
    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({ pageOrdinal: 0, reviewerName: recorded.reviewerName, body: recorded.body });
    expect(await screen.findByText(recorded.body)).toBeTruthy();
  });

  it("renders public showcase shares without a private token and keeps them read-only", async () => {
    mocks.view.mockResolvedValue({ ...shareView("viewer"), purpose: "showcase" as const, rightsStatement: "작가의 공개 동의를 확인했습니다." });
    render(<Harness initial={`/showcase/reviews/${SHARE_ID}`} />);
    expect(await screen.findByText((_, element) => element?.textContent === "ToonStudio · 공개 전시본")).toBeTruthy();
    expect(mocks.view).toHaveBeenCalledWith({ publicId: SHARE_ID });
    expect(screen.getByRole("heading", { name: "열람 전용 링크" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "의견 기록" })).toBeNull();
    expect(screen.getByText("작가의 공개 동의를 확인했습니다.")).toBeTruthy();
  });

  it("rejects an ambiguous URL that contains both a public id and private token", async () => {
    render(<Harness initial={`/showcase/reviews/${SHARE_ID}#token=${TOKEN}`} />);
    expect(await screen.findByRole("heading", { name: "고정 검수본을 열 수 없습니다" })).toBeTruthy();
    expect(screen.getByText("검토 링크가 올바르지 않습니다.")).toBeTruthy();
    expect(mocks.view).not.toHaveBeenCalled();
  });

  it("explains likely causes and offers next steps instead of a dead end", async () => {
    render(<Harness initial={`/showcase/reviews/${SHARE_ID}#token=${TOKEN}`} />);
    await screen.findByRole("heading", { name: "고정 검수본을 열 수 없습니다" });
    expect(screen.getByText(/링크 끝부분\(#token=…\)이 복사 중에 잘렸을 수 있어요/u)).toBeTruthy();
    expect(screen.getByText("링크를 보낸 분께 새 검수 링크를 요청해 주세요.")).toBeTruthy();
    // 모호한 주소는 다시 시도해도 같은 결과이므로 재시도 대신 다른 길을 연다.
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
    expect(screen.getByRole("link", { name: "공개 검수본 전시 보기" }).getAttribute("href")).toBe("/showcase/reviews");
    expect(screen.getByRole("link", { name: "샘플 검수 화면 둘러보기" }).getAttribute("href"))
      .toBe("/production/projects/sample-project/episodes/episode-12");
  });
});
