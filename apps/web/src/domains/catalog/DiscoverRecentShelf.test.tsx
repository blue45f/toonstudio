// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Title } from "@/shared/lib/types";

import { DiscoverRecentShelf, DISCOVER_RECENT_LIMIT } from "./DiscoverRecentShelf";

const mocks = vi.hoisted(() => ({ recentlyViewed: [] as string[], hydrated: true, read: vi.fn(), reload: vi.fn() }));
vi.mock("@/shared/lib/store", () => ({
  useApp: (selector: (state: { recentlyViewed: string[] }) => unknown) => selector({ recentlyViewed: mocks.recentlyViewed }),
  useHydrated: () => mocks.hydrated,
}));
vi.mock("@/platform/use-api-resource", () => ({ useApiResource: mocks.read }));
// 로컬 대체 데이터 계약은 전용 테스트에서 다루며 여기서는 표시 상태와 방문 순서를 검증한다.
vi.mock("./local-catalog-fallback", () => ({ useLocalCatalogFallback: (_url: string | null, resource: unknown) => resource }));

function title(id: string): Title {
  return { id, slug: id, title: `작품-${id}` } as Title;
}
function state(overrides: { data?: { items: Title[] } | null; loading?: boolean; error?: string | null } = {}) {
  mocks.read.mockReturnValue({ data: null, loading: false, error: null, reload: mocks.reload, ...overrides });
}
function renderShelf() { return render(<MemoryRouter><DiscoverRecentShelf /></MemoryRouter>); }
beforeEach(() => { mocks.read.mockReset(); mocks.reload.mockReset(); mocks.recentlyViewed = []; mocks.hydrated = true; state(); });
afterEach(cleanup);

describe("DiscoverRecentShelf", () => {
  it("기기에 방문 기록이 없거나 아직 복원 전이면 요청하지 않고 숨긴다", () => {
    const view = renderShelf();
    expect(mocks.read).toHaveBeenCalledWith(null, expect.any(String));
    expect(view.container.textContent).toBe("");
    mocks.hydrated = false;
    mocks.recentlyViewed = ["private"];
    view.rerender(<MemoryRouter><DiscoverRecentShelf /></MemoryRouter>);
    expect(mocks.read).toHaveBeenLastCalledWith(null, expect.any(String));
    expect(view.container.textContent).toBe("");
  });

  it("원래 방문 순서와 작품 ID를 유지하고 읽기 진도로 꾸미지 않는다", () => {
    mocks.recentlyViewed = ["b", "a"];
    state({ data: { items: [title("a"), title("b")] } });
    renderShelf();
    expect(mocks.read).toHaveBeenCalledWith(`/api/titles?ids=${encodeURIComponent("b,a")}`, expect.any(String));
    const list = screen.getByRole("list", { name: "최근 본 작품" });
    const links = within(list).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/title/b", "/title/a"]);
    expect(links.map((a) => a.querySelector("strong")?.textContent)).toEqual(["작품-b", "작품-a"]);
    expect(screen.getByRole("link", { name: /내 서재/ }).getAttribute("href")).toBe("/library");
    expect(screen.queryByText(/이어서 읽기|% 읽음|저장됨/u)).toBeNull();
    expect(document.querySelector('a[href*="/read/"]')).toBeNull();
  });

  it("불러오기 실패는 빈 기록으로 숨기지 않고 동일 요청을 재시도한다", () => {
    mocks.recentlyViewed = ["a"];
    state({ error: "실패" });
    const view = renderShelf();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("불러오지 못했어요");
    fireEvent.click(within(alert).getByRole("button", { name: "다시 시도" }));
    expect(mocks.reload).toHaveBeenCalledTimes(1);
    expect(mocks.recentlyViewed).toEqual(["a"]);
    state({ data: { items: [title("a")] } });
    view.rerender(<MemoryRouter><DiscoverRecentShelf /></MemoryRouter>);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("link", { name: /작품-a.*작품으로 돌아가기/u }).getAttribute("href")).toBe("/title/a");
  });

  it("로딩과 응답에 작품이 없는 상태를 구분하며 서재 출구는 유지한다", () => {
    mocks.recentlyViewed = ["a"];
    state({ loading: true });
    const view = renderShelf();
    expect(screen.getByRole("status", { name: "최근 본 작품을 불러오는 중" }).getAttribute("aria-busy")).toBe("true");
    state({ data: { items: [] } });
    view.rerender(<MemoryRouter><DiscoverRecentShelf /></MemoryRouter>);
    expect(screen.queryByRole("status", { name: "최근 본 작품을 불러오는 중" })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("이전에 본 작품 정보를 찾을 수 없어요");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("link", { name: /내 서재/ }).getAttribute("href")).toBe("/library");
  });

  it("기존 최근 방문 10개 한도를 유지하고 받은 항목만 표시한다", () => {
    mocks.recentlyViewed = Array.from({ length: DISCOVER_RECENT_LIMIT + 2 }, (_, i) => `work-${i}`);
    state({ data: { items: mocks.recentlyViewed.map(title) } });
    renderShelf();
    expect(mocks.read).toHaveBeenCalledWith(`/api/titles?ids=${encodeURIComponent(mocks.recentlyViewed.slice(0, 10).join(","))}`, expect.any(String));
    expect(within(screen.getByRole("list", { name: "최근 본 작품" })).getAllByRole("link")).toHaveLength(10);
  });
  it("갱신 오류가 나도 이미 받은 최근 작품은 지우지 않는다", () => {
    mocks.recentlyViewed = ["a"];
    state({ data: { items: [title("a")] }, error: "갱신 실패" });
    renderShelf();
    expect(screen.getByRole("alert").textContent).toContain("불러오지 못했어요");
    expect(screen.getByRole("link", { name: /작품-a.*작품으로 돌아가기/u }).getAttribute("href")).toBe("/title/a");
    expect(screen.queryByRole("status")).toBeNull();
  });

});
