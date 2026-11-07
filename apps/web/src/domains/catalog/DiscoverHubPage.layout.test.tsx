// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
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
vi.mock("./DiscoverRecentShelf", () => ({ DiscoverRecentShelf: () => null }));
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
  ])("%s 상태의 대표작 칼럼과 읽기 순서를 보존한다", (_label, data, loading, error, hasSpotlight) => {
    resource.read.mockReturnValue({ data, loading, error, reload: resource.reload });
    const { container } = page();
    const hero = container.querySelector(".discover-hub-hero");
    expect(hero?.getAttribute("data-has-spotlight")).toBe(hasSpotlight);
    const search = screen.getByRole("search");
    const summary = screen.getByRole("group", { name: "공개 카탈로그 요약" });
    expect(search.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hero?.contains(search)).toBe(true);
    expect(hero?.contains(summary)).toBe(true);
    const spotlight = screen.queryByTestId("spotlight");
    if (hasSpotlight === "true") {
      expect(spotlight).toBeTruthy();
      if (spotlight) expect(summary.compareDocumentPosition(spotlight) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(spotlight?.parentElement?.className).toBe("discover-hub-spotlight");
    } else {
      expect(spotlight).toBeNull();
      expect(hero?.querySelector(".discover-hub-spotlight")).toBeNull();
    }
    expect(container.querySelector(".discover-hub-intro > header")).toBeTruthy();
    const shelves = container.querySelector(".discover-hub-shelves");
    expect(shelves).toBeTruthy();
    if (hero && shelves) expect(hero.compareDocumentPosition(shelves) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("검색과 API 실패가 연재 트랙보다 먼저 나오고 재시도를 보존한다", async () => {
    page();
    const retry = await screen.findByRole("button", { name: "추천 재시도" });
    expect(screen.getByRole("search").compareDocumentPosition(retry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    expect(screen.getByRole("link", { name: "데이터 출처" }).getAttribute("href")).toBe("/about/data");
    expect(screen.getByRole("group", { name: "공개 카탈로그 요약" }).textContent).toContain("2026");
  });
  it("모든 목적지와 빠른 조건을 보존하되 보조 도구만 접는다", () => {
    const { container } = page();
    const tools = screen.getByText("더 많은 탐색 도구").closest("details");
    expect(tools?.open).toBe(false);
    for (const route of ["/search", "/explore", "/recommend", "/ranking", "/calendar", "/random", "/compare", "/library", "/cuts", "/character-chat", "/community", "/research", "/explore?status=ongoing&sort=popular", "/explore?status=completed&sort=binge", "/explore?minRating=4.5&sort=rating"]) {
      expect(Array.from(container.querySelectorAll("a")).some((a) => a.getAttribute("href") === route)).toBe(true);
    }
    expect(screen.getByRole("link", { name: /조건으로 탐색/ }).closest("details")).toBeNull();
    expect(screen.getByTestId("guide-art").closest("details")?.open).toBe(false);
  });
  it("연재 트랙 키보드와 원본 목적지를 유지한다", () => {
    page();
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0].tabIndex).toBe(0);
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
  it("기억 찾기는 최초로 펼칠 때만 렌더한다", async () => {
    page();
    expect(resource.memory).not.toHaveBeenCalled();
    const disclosure = screen.getByText("제목이 기억나지 않으세요?").closest("details");
    expect(disclosure).toBeTruthy();
    if (disclosure) { disclosure.open = true; fireEvent(disclosure, new Event("toggle")); }
    await waitFor(() => expect(resource.memory).toHaveBeenCalled());
  });
});
