// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { DiscoverHubPage } from "./DiscoverHubPage";
import { DISCOVER_SERIALIZATION_TRACKS } from "@/shared/navigation/webtoon-platform-router-ux-model";

const resource = vi.hoisted(() => ({ read: vi.fn(), reload: vi.fn(), memory: vi.fn() }));
vi.mock("@/platform/use-api-resource", () => ({ useApiResource: resource.read }));
vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));
vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({ useBilingual: () => (ko: string) => ko }));
vi.mock("@/shared/components/page-entrance/PageEntrance", () => ({ PageEntrance: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/shared/components/stagger-reveal", () => ({ StaggerReveal: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/shared/components/site-contextual-subnav", () => ({ SiteContextualSubNav: () => <nav aria-label="보조 탐색" /> }));
vi.mock("@/shared/components/site-experience/SiteArtSurfaceSpotlight", () => ({ SiteArtSurfaceSpotlight: () => <div data-testid="guide-art" /> }));
vi.mock("@/shared/navigation/router-link", () => ({ default: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a> }));
vi.mock("@/shared/components/section", () => ({
  Container: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  Section: ({ children, title }: { children: ReactNode; title: string }) => <section><h2>{title}</h2>{children}</section>,
}));
vi.mock("./DiscoverRecentShelf", () => ({ DiscoverRecentShelf: () => <section data-testid="recent-history" /> }));
vi.mock("./memory-finder/MemoryFinderSection", () => ({ MemoryFinderSection: () => { resource.memory(); return <p>기억 찾기 열림</p>; } }));
vi.mock("./DiscoverSpotlight", () => ({ DiscoverSpotlight: ({ loading }: { loading: boolean }) => <div data-testid="spotlight">{loading ? "대표작 로딩" : "실제 대표작"}</div> }));
vi.mock("./DiscoverShelves", () => ({
  DiscoverShelves: ({ snapshot, loading, error, onRetry }: { snapshot: object | null; loading: boolean; error: string | null; onRetry: () => void }) =>
    snapshot ? <p>실제 작품 레일</p> : error ? <button onClick={onRetry}>추천 재시도</button> : loading ? <p>작품 로딩</p> : null,
}));

const empty = { topRated: [], waitFree: [], newest: [], todayDay: "fri", todayReleases: [], genres: [], stats: { titles: 60229, platforms: 20, genres: 18 }, generatedAt: "2026-09-30T16:49:46.858Z" };
function Probe() { const location = useLocation(); return <output data-testid="location">{location.pathname + location.search}</output>; }
function page() { return render(<MemoryRouter initialEntries={["/discover"]}><DiscoverHubPage /><Probe /></MemoryRouter>); }
beforeEach(() => { vi.clearAllMocks(); resource.read.mockReturnValue({ data: null, loading: false, error: "offline", reload: resource.reload }); });
afterEach(cleanup);

describe("탐색 허브 작품 우선 배치", () => {
  it.each([
    ["loading", null, true, null, "true"],
    ["error", null, false, "offline", "false"],
    ["empty", empty, false, null, "false"],
    ["success", { ...empty, spotlight: { id: "qa-lead" } }, false, null, "true"],
  ])("%s 상태의 대표작 칼럼과 읽기 순서를 보존한다", async (_label, data, loading, error, hasSpotlight) => {
    resource.read.mockReturnValue({ data, loading, error, reload: resource.reload });
    const { container } = page();
    const hero = container.querySelector(".discover-hub-hero");
    expect(hero?.getAttribute("data-has-spotlight")).toBe(hasSpotlight);
    const search = screen.getByRole("search");
    fireEvent.click(screen.getByText("카탈로그 출처와 집계"));
    const summary = screen.getByRole("group", { name: "공개 카탈로그 요약" });
    expect(search.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hero?.contains(search)).toBe(true);
    expect(hero?.contains(summary)).toBe(false);
    const spotlight = screen.queryByTestId("spotlight");
    if (hasSpotlight === "true") {
      expect(spotlight).toBeTruthy();
      if (spotlight) expect(spotlight.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(spotlight?.parentElement?.className).toBe("discover-hub-spotlight");
    } else {
      expect(spotlight).toBeNull();
      expect(hero?.querySelector(".discover-hub-spotlight")).toBeNull();
    }
    expect(container.querySelector(".discover-hub-intro > header")).toBeTruthy();
    // 첫 모듈 로드에는 Suspense가 있으므로 fixture가 준비된 뒤 실제 DOM 순서를 확인한다.
    const recent = await screen.findByTestId("recent-history");
    expect(hero?.contains(recent)).toBe(true);
    if (spotlight) expect(spotlight.compareDocumentPosition(recent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const shelves = container.querySelector(".discover-hub-shelves");
    expect(shelves).toBeTruthy();
    if (hero && shelves) expect(hero.compareDocumentPosition(shelves) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("검색과 API 실패가 연재 트랙보다 먼저 나오고 재시도를 보존한다", async () => {
    page();
    const retry = await screen.findByRole("button", { name: "추천 재시도" });
    expect(screen.getByRole("search").compareDocumentPosition(retry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByText("연재 방식으로 찾기"));
    expect(retry.compareDocumentPosition(screen.getByRole("tablist")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(retry);
    expect(resource.reload).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("spotlight")).toBeNull();
    expect(screen.getByText("카탈로그 요약을 지금은 확인할 수 없어요.")).toBeTruthy();
    expect(screen.queryByText("60,229")).toBeNull();
  });
  it.each([["  달 & 별  ", "/search?q=" + encodeURIComponent("달 & 별")], ["   ", "/search"]])("검색값 %s 의 경로를 보존한다", (query, target) => {
    page();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: query } });
    fireEvent.submit(screen.getByRole("search"));
    expect(screen.getByTestId("location").textContent).toBe(target);
  });
  it("로딩과 빈 스냅샷을 구분하고 출처와 정확한 수치를 유지한다", async () => {
    resource.read.mockReturnValue({ data: null, loading: true, error: null, reload: resource.reload });
    const view = page();
    expect(await screen.findByText("작품 로딩")).toBeTruthy();
    expect(screen.getByTestId("spotlight")).toBeTruthy();
    resource.read.mockReturnValue({ data: empty, loading: false, error: null, reload: resource.reload });
    view.rerender(<MemoryRouter><DiscoverHubPage /></MemoryRouter>);
    expect(screen.queryByTestId("spotlight")).toBeNull();
    expect(screen.getByText("60,229")).toBeTruthy();
    fireEvent.click(screen.getByText("카탈로그 출처와 집계"));
    expect(screen.getByRole("link", { name: "데이터 출처" }).getAttribute("href")).toBe("/about/data");
    expect(screen.getByRole("group", { name: "공개 카탈로그 요약" }).textContent).toContain("2026");
  });
  it("모든 목적지와 빠른 조건을 보존하되 보조 도구만 접는다", () => {
    const { container } = page();
    const tools = screen.getByText("더 많은 탐색 도구").closest("details");
    expect(tools?.open).toBe(false);
    for (const route of ["/search", "/explore", "/recommend", "/ranking", "/calendar", "/random", "/compare", "/library", "/cuts", "/character-chat", "/community", "/research", "/create", "/explore?status=ongoing&sort=popular", "/explore?status=completed&sort=binge", "/explore?minRating=4.5&sort=rating"]) {
      expect(Array.from(container.querySelectorAll("a")).some((a) => a.getAttribute("href") === route)).toBe(true);
    }
    expect(screen.getByRole("link", { name: "장르·조건" }).closest("details")).toBeNull();
    expect(screen.getByTestId("guide-art").closest("details")?.open).toBe(false);
  });
  it("장르 바로가기와 전체 장르 출구를 같은 목록에서 보존한다", () => {
    page();
    const disclosure = screen.getByText("장르 바로 찾기").closest("details");
    const storedGenres = disclosure?.querySelector('nav[aria-label="장르로 바로 찾기"]');
    if (!disclosure || !storedGenres) throw new Error("장르 접기나 보존된 목적지가 없습니다.");
    // JSDOM의 role 조회는 native details의 시각 비노출을 재현하지 않는다.
    // DOM에 기능이 남고 summary 밖의 닫힌 영역에 속하는지와 열기·닫기를 따로 확인한다.
    expect(disclosure.open).toBe(false);
    expect(storedGenres.closest("summary")).toBeNull();
    expect(storedGenres.querySelectorAll(".discover-hub-quick-genre")).toHaveLength(7);
    fireEvent.click(screen.getByText("장르 바로 찾기"));
    expect(disclosure.open).toBe(true);
    const genres = screen.getByRole("navigation", { name: "장르로 바로 찾기" });
    expect(genres).toBe(storedGenres);
    expect(genres.querySelector("ul")?.className).toBe("discover-hub-quick-genres");
    expect(genres.querySelectorAll(".discover-hub-quick-genre")).toHaveLength(7);
    const allGenres = within(genres).getByRole("link", { name: "전체 장르" });
    expect(allGenres.getAttribute("href")).toBe("/explore");
    expect(allGenres.closest("li")?.classList.contains("discover-hub-quick-genre")).toBe(false);
    fireEvent.click(screen.getByText("장르 바로 찾기"));
    expect(disclosure.open).toBe(false);
    expect(disclosure.contains(allGenres)).toBe(true);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "달" } });
    const clear = screen.getByRole("button", { name: "검색어 지우기" });
    expect(clear.className).toContain("size-12");
    fireEvent.click(clear);
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
  });
  it("연재 트랙 키보드와 원본 목적지를 유지한다", () => {
    page();
    fireEvent.click(screen.getByText("연재 방식으로 찾기"));
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0].tabIndex).toBe(0);
    expect(screen.getByRole("tablist").className).toBe("discover-hub-track-tabs");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["전체", "정기 연재", "자유 연재", "기다리면 무료", "짧은 영상"]);
    expect(tabs.map((tab) => tab.getAttribute("aria-label"))).toEqual(DISCOVER_SERIALIZATION_TRACKS.map((track) => expect.stringContaining(track.label)));
    for (const tab of tabs) expect(tab.getAttribute("aria-label")).toContain(tab.textContent);
    fireEvent.keyDown(tabs[0], { key: "End" });
    expect(tabs[tabs.length - 1].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[tabs.length - 1]);
    for (const [index, track] of DISCOVER_SERIALIZATION_TRACKS.entries()) {
      fireEvent.click(tabs[index]);
      const panel = screen.getByRole("tabpanel");
      expect(within(panel).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual([track.primaryRoute, track.secondaryRoute]);
      expect(panel.getAttribute("aria-labelledby")).toBe(tabs[index].id);
    }
  });
  it("검색·조건은 바로 보이고 보조 정보를 펼쳐도 입력과 초점을 빼앗지 않는다", () => {
    page();
    expect(screen.queryByTestId("discover-facet-tab-strip")).toBeNull();
    const create = document.querySelector('a[href="/create"]');
    expect(create?.closest("details")?.open).toBe(false);
    const field = screen.getByRole("searchbox") as HTMLInputElement;
    expect(field.closest("details")).toBeNull();
    expect(screen.getByRole("link", { name: "장르·조건" }).closest("details")).toBeNull();
    fireEvent.change(field, { target: { value: "작성 중인 검색어" } });
    for (const label of ["카탈로그 출처와 집계", "연재 방식으로 찾기"]) {
      const summary = screen.getByText(label).closest("summary");
      const details = summary?.closest("details");
      expect(details?.open).toBe(false);
      expect(summary).not.toBeNull();
      if (!summary || !details) throw new Error("보조 정보 접기가 없습니다.");
      summary.focus();
      fireEvent.click(summary);
      expect(details.open).toBe(true);
      fireEvent.click(summary);
      expect(details.open).toBe(false);
      expect(document.activeElement).toBe(summary);
      expect(screen.getByRole("searchbox")).toBe(field);
      expect(field.value).toBe("작성 중인 검색어");
    }
  });

  it("기억 찾기는 최초로 펼칠 때만 렌더한다", async () => {
    page();
    expect(resource.memory).not.toHaveBeenCalled();
    const disclosure = screen.getByText("제목이 기억나지 않으세요?").closest("details");
    expect(disclosure).toBeTruthy();
    if (disclosure) { disclosure.open = true; fireEvent(disclosure, new Event("toggle")); }
    await waitFor(() => expect(resource.memory).toHaveBeenCalled());
  });
  it("검색과 실제 작품을 장르 목록보다 먼저 두고 네 목적지는 바로 접근할 수 있다", () => {
    const { container } = page();
    const nav = screen.getByRole("navigation", { name: "작품 탐색 목적" });
    expect(within(nav).getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["추천", "/discover"], ["인기", "/ranking"], ["요일별", "/calendar"], ["장르·조건", "/explore"],
    ]);
    expect(within(nav).getByRole("link", { name: "추천" }).getAttribute("aria-current")).toBe("page");
    expect(container.querySelector(".discover-hub-hero .discover-hub-quick-genres")).toBeNull();
    expect(container.querySelector(".discover-hub-genres")?.hasAttribute("open")).toBe(false);
    expect(screen.getByRole("button", { name: "작품 검색" }).closest("details")).toBeNull();
  });

  it("한글 조합 중 제출하지 않고 조합을 마친 검색어만 검색 페이지로 보낸다", () => {
    page();
    const input = screen.getByRole("searchbox");
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "달과 별" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(screen.getByTestId("location").textContent).toMatch(/^\/discover\?/u);
    fireEvent.compositionEnd(input, { target: { value: "달과 별" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(screen.getByTestId("location").textContent).toBe(`/search?q=${encodeURIComponent("달과 별")}`);
  });

  it("보조 영역을 열어도 반복 쿼리와 뒤로 가기 검색어를 보존한다", () => {
    function History() {
      const navigate = useNavigate();
      return <><button type="button" onClick={() => { void navigate("/discover?q=둘째&keep=one&keep=two"); }}>다음 검색어</button><button type="button" onClick={() => { void navigate(-1); }}>이전 검색어</button></>;
    }
    render(<MemoryRouter initialEntries={["/discover?q=첫째&keep=one&keep=two"]}><DiscoverHubPage /><History /><Probe /></MemoryRouter>);
    const input = screen.getByRole("searchbox") as HTMLInputElement;
    fireEvent.click(screen.getByText("장르 바로 찾기"));
    fireEvent.change(input, { target: { value: "수정한 검색어" } });
    const current = new URL(screen.getByTestId("location").textContent ?? "", "https://example.test");
    expect(current.searchParams.getAll("keep")).toEqual(["one", "two"]);
    fireEvent.click(screen.getByRole("button", { name: "다음 검색어" }));
    expect(input.value).toBe("둘째");
    fireEvent.click(screen.getByRole("button", { name: "이전 검색어" }));
    expect(input.value).toBe("수정한 검색어");
    expect(screen.getByRole("searchbox")).toBe(input);
  });

});
