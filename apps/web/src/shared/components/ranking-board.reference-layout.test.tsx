// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RankedTitle } from "@/shared/lib/ranking";
import type { TitleFilterState } from "@/shared/lib/title-filters";
import { RankingBoard } from "./ranking-board";

const boundary = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/platform/api", () => ({ apiFetch: boundary.fetch }));
vi.mock("@/shared/seo/use-document-title", () => ({ useJsonLd: vi.fn() }));
vi.mock("@/shared/lib/store", () => ({ useSavedTitleIds: () => new Set(["one"]) }));
vi.mock("./ranking-board-signal", () => ({ SignalWorkbench: () => <div>검증용 근거</div> }));
vi.mock("./stagger-reveal", () => ({ StaggerReveal: ({ children }: PropsWithChildren) => <div data-testid="rank-list">{children}</div> }));
vi.mock("./rank-row", () => ({ RankRow: ({ ranked }: { ranked: RankedTitle }) => <article data-testid="rank-row">{ranked.rank} {ranked.title.title}</article>, MiniPoster: () => null, RANK_ENTRY_STAGGER_CAP: 12, RANK_ENTRY_STAGGER_STEP_MS: 10 }));
vi.mock("./title-card", () => ({ TitleCard: () => <article data-testid="poster-card" /> }));
vi.mock("./title-filter-panel", () => ({ TitleFilterPanel: ({ value, onChange }: { value: TitleFilterState; onChange: (value: TitleFilterState) => void }) => <button type="button" onClick={() => onChange({ ...value, savedOnly: !value.savedOnly })} aria-pressed={value.savedOnly}>찜만 보기</button> }));
vi.mock("./ui/select", () => ({ Select: ({ value, onValueChange, ariaLabel, options }: { value: string; onValueChange: (value: string) => void; ariaLabel: string; options: { value: string; label: string }[] }) => <select value={value} onChange={(event) => onValueChange(event.target.value)} aria-label={ariaLabel}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> }));

function item(id: string, rank: number): RankedTitle {
  return { rank, score: 42, delta: 0, title: {
    id, slug: id, title: `검증 작품 ${id}`, author: "테스트", type: "webtoon", genres: ["판타지"], tags: [], synopsis: "합성 검증 데이터",
    cover: ["#000000", "#ffffff"], status: "ongoing", ageRating: "all", releaseYear: 2026, availability: [],
    stats: { views: 1, likes: 1, bookmarks: 1, ratingAvg: 4, ratingCount: 1, ratingDist: [0, 0, 0, 1, 0], rankDelta: 0, trendingScore: 0, completionRate: 0, bingeIndex: 0 },
  } };
}
// UI 경계에서 소비하는 필드만 제공한다. 서버 계약이나 운영 데이터의 대용이 아니다.
function payload(items = [item("one", 1), item("two", 2)]) {
  return { items, meta: { refreshSeconds: 300, availablePlatforms: ["naver-webtoon"], generatedAt: "2026-11-08T00:00:00Z", reliability: { confidence: 80 } }, insights: null };
}
function lastQuery() { return new URL(boundary.fetch.mock.lastCall?.[0] ?? "/", "https://example.test").searchParams; }
function page(axis: "popular" | "rating" = "popular", platform: "all" | "naver-webtoon" = "all") {
  return <MemoryRouter><RankingBoard initialAxis={axis} initialPlatform={platform} /></MemoryRouter>;
}
beforeEach(() => {
  boundary.fetch.mockReset();
  boundary.fetch.mockImplementation(async () => new Response(JSON.stringify(payload()), { status: 200 }));
  localStorage.clear();
});
afterEach(cleanup);

describe("시안 기반 랭킹 목록 우선 구조", () => {
  it("초기에는 목록 앞의 1차 조건만 보이고 추가 조건과 근거는 접힌다", async () => {
    render(page());
    await screen.findAllByTestId("rank-row");
    expect(screen.queryByRole("region", { name: "추가 랭킹 조건과 보기" })).toBeNull();
    expect(screen.getByRole("button", { name: "필터" }).getAttribute("aria-expanded")).toBe("false");
    const controls = screen.getByRole("region", { name: "랭킹 조건" });
    const list = screen.getByTestId("rank-list");
    expect(controls.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const support = screen.getByTestId("ranking-supporting-details");
    expect(support.hasAttribute("open")).toBe(false);
    expect(list.compareDocumentPosition(support) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("주요·추가 기준, 기간과 플랫폼이 기존 API 계약으로 전달된다", async () => {
    render(page()); await screen.findAllByTestId("rank-row");
    fireEvent.click(within(screen.getByRole("group", { name: "주요 랭킹 기준" })).getByRole("button", { name: "평점 명작" }));
    await waitFor(() => expect(lastQuery().get("axis")).toBe("rating"));
    fireEvent.change(screen.getByRole("combobox", { name: "더 많은 랭킹 기준" }), { target: { value: "completed" } });
    await waitFor(() => expect(lastQuery().get("axis")).toBe("completed"));
    fireEvent.change(screen.getByRole("combobox", { name: "랭킹 기간" }), { target: { value: "monthly" } });
    fireEvent.change(screen.getByRole("combobox", { name: "랭킹 플랫폼" }), { target: { value: "naver-webtoon" } });
    await waitFor(() => expect(lastQuery().get("platform")).toBe("naver-webtoon"));
    expect(lastQuery().get("period")).toBe("monthly");
    expect(lastQuery().get("limit")).toBe("200");
  });

  it("보조 조건과 보기 변경은 반복해서 닫고 열어도 유지된다", async () => {
    render(page()); await screen.findAllByTestId("rank-row");
    const toggle = screen.getByRole("button", { name: "필터" });
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("tab", { name: "웹소설" }));
    fireEvent.change(screen.getByRole("combobox", { name: "장르 필터" }), { target: { value: "판타지" } });
    fireEvent.click(screen.getByText("상태·가격·평점·상승 조건"));
    fireEvent.click(screen.getByRole("tab", { name: "완결" }));
    fireEvent.click(screen.getByRole("tab", { name: "무료" }));
    fireEvent.change(screen.getByRole("slider", { name: "최소 평점" }), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "상승작" }));
    fireEvent.click(screen.getByRole("tab", { name: "포스터 보기" }));
    await waitFor(() => expect(lastQuery().get("rising")).toBe("true"));
    for (let index = 0; index < 3; index += 1) { fireEvent.click(toggle); expect(toggle.getAttribute("aria-expanded")).toBe("false"); fireEvent.click(toggle); }
    expect(screen.getByRole("tab", { name: "웹소설" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "포스터 보기" }).getAttribute("aria-selected")).toBe("true");
    expect(lastQuery().get("genre")).toBe("판타지");
    expect(lastQuery().get("status")).toBe("completed");
    expect(lastQuery().get("pricing")).toBe("free");
    expect(lastQuery().get("minRating")).toBe("4");
    expect(toggle.textContent).toContain("6");
  });

  it("URL에서 바뀐 진입 기준은 반영하면서 기간·로컬 조건은 보존한다", async () => {
    const view = render(page()); await screen.findAllByTestId("rank-row");
    fireEvent.change(screen.getByRole("combobox", { name: "랭킹 기간" }), { target: { value: "monthly" } });
    view.rerender(page("rating", "naver-webtoon"));
    await waitFor(() => expect(lastQuery().get("axis")).toBe("rating"));
    expect(lastQuery().get("platform")).toBe("naver-webtoon");
    expect(lastQuery().get("period")).toBe("monthly");
    view.rerender(page());
    await waitFor(() => expect(lastQuery().get("axis")).toBe("popular"));
    expect(lastQuery().get("platform")).toBe("all");
  });

  it("실패·재시도와 정상 빈 결과를 구분하며 오류를 순위 데이터로 표시하지 않는다", async () => {
    boundary.fetch.mockResolvedValueOnce(new Response("error", { status: 502 }));
    render(page());
    expect(await screen.findByText("랭킹을 불러오지 못했습니다.")).toBeTruthy();
    expect(screen.queryByTestId("rank-row")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /다시 시도|재시도/ }));
    await screen.findAllByTestId("rank-row");
    expect(boundary.fetch.mock.calls.some(([url]) => new URL(url, "https://example.test").searchParams.get("refresh") === "true")).toBe(true);
    boundary.fetch.mockImplementation(async () => new Response(JSON.stringify(payload([])), { status: 200 }));
    fireEvent.change(screen.getByRole("combobox", { name: "랭킹 기간" }), { target: { value: "daily" } });
    expect(await screen.findByText("해당 조건의 작품이 없습니다.")).toBeTruthy();
    expect(screen.queryByText("랭킹을 불러오지 못했습니다.")).toBeNull();
  });
});
