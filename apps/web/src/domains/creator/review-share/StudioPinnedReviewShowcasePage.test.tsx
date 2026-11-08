// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioPinnedReviewShowcasePage } from "./StudioPinnedReviewShowcasePage";
import { useI18n } from "@/shared/lib/i18n";

const mocks = vi.hoisted(() => ({ list: vi.fn(), page: vi.fn() }));
vi.mock("./studio-pinned-review-share-client", () => ({
  listPinnedReviewShowcase: mocks.list,
  loadPinnedReviewSharePage: mocks.page,
}));

const cover = {
  ordinal: 0,
  sha256: "a".repeat(64),
  byteLength: 2048,
  mediaType: "image/webp" as const,
  width: 800,
  height: 1200,
};
const first = { id: "11111111-1111-4111-8111-111111111111", title: "승인된 1화", pageCount: 2, cover, expiresAt: "2030-09-23T00:00:00.000Z" };
const second = { id: "22222222-2222-4222-8222-222222222222", title: "승인된 2화", pageCount: 1, expiresAt: "2030-09-24T00:00:00.000Z" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.page.mockRejectedValue(new Error("cover unavailable"));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); useI18n.getState().setLang("ko"); });

describe("approved immutable review showcase", () => {
  it("lists only the server-approved public snapshots and links to their public ids", async () => {
    mocks.list.mockResolvedValue({ items: [first], nextCursor: null });
    render(<MemoryRouter><StudioPinnedReviewShowcasePage /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: first.title })).toBeTruthy();
    expect(screen.getByText("고정 이미지 2페이지")).toBeTruthy();
    expect(screen.getByRole("link", { name: "승인본 보기" }).getAttribute("href")).toBe(`/showcase/reviews/${first.id}`);
    expect(mocks.list).toHaveBeenCalledWith(null);
  });

  it("카드 커버로 승인본 첫 페이지를 보여 준다", async () => {
    mocks.list.mockResolvedValue({ items: [first], nextCursor: null });
    mocks.page.mockResolvedValue(new Blob(["img"], { type: "image/webp" }));
    const createObjectURL = vi.fn(() => "blob:cover-url");
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
    const { container } = render(<MemoryRouter><StudioPinnedReviewShowcasePage /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: first.title })).toBeTruthy();
    await waitFor(() => expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:cover-url"));
    expect(mocks.page).toHaveBeenCalledWith({ publicId: first.id }, 0);
    vi.unstubAllGlobals();
  });

  it("paginates with an opaque cursor without duplicating an already listed share", async () => {
    mocks.list.mockResolvedValueOnce({ items: [first], nextCursor: first.id })
      .mockResolvedValueOnce({ items: [first, second], nextCursor: null });
    render(<MemoryRouter><StudioPinnedReviewShowcasePage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "승인본 더 보기" }));
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(first.id));
    expect(await screen.findByRole("heading", { name: second.title })).toBeTruthy();
    expect(screen.getAllByRole("heading", { name: first.title })).toHaveLength(1);
  });

  it("explains a failed load and recovers on retry instead of leaving a dead end", async () => {
    mocks.list.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ items: [first], nextCursor: null });
    render(<MemoryRouter><StudioPinnedReviewShowcasePage /></MemoryRouter>);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("공개 승인본 목록을 불러오지 못했습니다.");
    expect(screen.getByRole("link", { name: "샘플 검수 흐름 보기" }).getAttribute("href")).toBe("/production/projects/sample-project/episodes/episode-12");
    fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
    expect(await screen.findByRole("heading", { name: first.title })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps ordinary works separate when no approved showcase snapshot exists", async () => {
    mocks.list.mockResolvedValue({ items: [], nextCursor: null });
    render(<MemoryRouter><StudioPinnedReviewShowcasePage /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "현재 공개 중인 승인본이 없습니다" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "일반 작품 전시로 돌아가기" }).getAttribute("href")).toBe("/showcase");
  });

  it("toggles diffMode and watermarkPolicy in pinned-review-rea-ab-diff-bar with aria-pressed, group semantics, and 44px touch targets", async () => {
    mocks.list.mockResolvedValue({ items: [first], nextCursor: null });
    render(<MemoryRouter><StudioPinnedReviewShowcasePage /></MemoryRouter>);
    await screen.findByRole("heading", { name: first.title });

    const bar = screen.getByTestId("pinned-review-rea-ab-diff-bar");
    expect(bar.hasAttribute("data-own-control-size")).toBe(true);
    expect(bar.textContent).toContain("Frame.io · Ziflow · PageProof · Chromatic Visual Diff");
    expect(within(bar).getByRole("group", { name: "시각 비교 모드" })).toBeTruthy();
    expect(within(bar).getByRole("group", { name: "워터마크 및 무결성 정책" })).toBeTruthy();

    for (const button of Array.from(bar.querySelectorAll("button"))) {
      expect(button.className).toContain("min-h-11");
      expect(button.className).toContain("focus-visible:outline-2");
    }

    const syncBtn = screen.getByTestId("pinned-review-rea-diff-side-by-side-sync");
    const onionBtn = screen.getByTestId("pinned-review-rea-diff-onion-skin-50pct");
    const heatmapBtn = screen.getByTestId("pinned-review-rea-diff-pixel-delta-heatmap");

    expect(syncBtn.getAttribute("aria-pressed")).toBe("true");
    expect(onionBtn.getAttribute("aria-pressed")).toBe("false");
    expect(heatmapBtn.getAttribute("aria-pressed")).toBe("false");

    const c2paBtn = screen.getByTestId("pinned-review-rea-watermark-c2pa-public-verified");
    const traceBtn = screen.getByTestId("pinned-review-rea-watermark-reviewer-id-trace");
    const cleanBtn = screen.getByTestId("pinned-review-rea-watermark-clean-press-kit");

    expect(c2paBtn.getAttribute("aria-pressed")).toBe("true");
    expect(traceBtn.getAttribute("aria-pressed")).toBe("false");
    expect(cleanBtn.getAttribute("aria-pressed")).toBe("false");

    const status = screen.getByTestId("pinned-review-rea-status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toContain("좌우 동기화 비교");
    expect(status.textContent).toContain("로컬 리비전 해시·출처 배지 미리보기");

    fireEvent.click(onionBtn);
    expect(onionBtn.getAttribute("aria-pressed")).toBe("true");
    expect(syncBtn.getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toContain("어니언 스킨 50% 오버레이");

    fireEvent.click(heatmapBtn);
    expect(heatmapBtn.getAttribute("aria-pressed")).toBe("true");
    expect(onionBtn.getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toContain("픽셀 델타 히트맵");

    fireEvent.click(traceBtn);
    expect(traceBtn.getAttribute("aria-pressed")).toBe("true");
    expect(c2paBtn.getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toContain("검수자 세션 포렌식 추적");

    fireEvent.click(cleanBtn);
    expect(cleanBtn.getAttribute("aria-pressed")).toBe("true");
    expect(traceBtn.getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toContain("프레스킷 클린 뷰");
  });

  it("maintains English purity inside pinned-review-rea-ab-diff-bar when locale is en", async () => {
    useI18n.getState().setLang("en");
    mocks.list.mockResolvedValue({ items: [first], nextCursor: null });
    render(<MemoryRouter><StudioPinnedReviewShowcasePage /></MemoryRouter>);
    await screen.findByRole("heading", { name: first.title });

    const bar = screen.getByTestId("pinned-review-rea-ab-diff-bar");
    expect(bar.textContent ?? "").not.toMatch(/[가-힣]/u);

    const withinBar = within(bar);
    expect(withinBar.getByRole("group", { name: "Visual Diff Mode" })).toBeTruthy();
    expect(withinBar.getByRole("group", { name: "Watermark & Provenance Policy" })).toBeTruthy();
    fireEvent.click(withinBar.getByTestId("pinned-review-rea-diff-pixel-delta-heatmap"));
    fireEvent.click(withinBar.getByTestId("pinned-review-rea-watermark-clean-press-kit"));

    const status = withinBar.getByTestId("pinned-review-rea-status");
    expect(status.textContent).toContain("Pixel Delta Heatmap");
    expect(status.textContent).toContain("Clean Press-Kit View");
    expect(bar.textContent ?? "").not.toMatch(/[가-힣]/u);
  });
});
