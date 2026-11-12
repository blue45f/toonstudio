// @vitest-environment jsdom
// 실제 카드가 기존 history 복귀 소유자에 연결되는지만 확인한다.
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouteScrollRestoration } from "@/app/RouteScrollRestoration";
import { TitleCard, TitleRow } from "@/shared/components/title-card";
import type { Title } from "@/shared/lib/types";

const routing = vi.hoisted(() => ({
  location: { pathname: "/search", search: "?q=달&genres=판타지", hash: "", key: "search-entry" },
  navigation: "POP",
}));
vi.mock("react-router-dom", async (original) => ({
  ...await original<typeof import("react-router-dom")>(),
  useLocation: () => routing.location,
  useNavigationType: () => routing.navigation,
}));
vi.mock("@/shared/navigation/router-link", () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode }) =>
    <a {...props} href={href} onClick={(event) => event.preventDefault()}>{children}</a>,
}));
vi.mock("@toonstudio/core/fx", () => ({ playSfx: vi.fn(), triggerParticleBurst: vi.fn() }));
vi.mock("@/shared/components/ui/card-3d", () => ({ Card3D: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/shared/components/spatial-campus/CampusObjectSource", () => ({ CampusObjectSource: () => null }));
vi.mock("@/shared/components/title-poster", () => ({ TitlePoster: () => null }));
vi.mock("@/shared/components/bookmark-button", () => ({ BookmarkButton: () => <button>북마크</button> }));
vi.mock("@/shared/components/availability", () => ({ AvailabilityDots: () => null, PlatformTags: () => null }));
vi.mock("@/shared/components/stars", () => ({ RatingInline: () => null }));
vi.mock("@/shared/components/ui/chip", () => ({ GenreChip: () => null }));
vi.mock("@/shared/components/ui/spectrum-bar", () => ({ GenreSpectrum: () => null }));
vi.mock("@/shared/lib/store", () => ({ useIsBookmarked: () => false }));

// 단위검사 전용 자료다. 제품 카탈로그나 게시 자료로 사용하지 않는다.
const title: Title = {
  id: 'work:["달"]', slug: "unit-moon", title: "단위검사 작품", type: "webtoon",
  author: "단위검사 작가", artist: "단위검사 작가", genres: ["판타지"], tags: [],
  synopsis: "회귀 검사 전용", cover: ["#333333", "#dddddd"], status: "ongoing", ageRating: "all", releaseYear: 2026,
  availability: [{ platformId: "naver-webtoon", pricing: "free" }],
  stats: { views: 1, likes: 0, bookmarks: 0, ratingAvg: 4, ratingCount: 1, ratingDist: [0, 0, 0, 1, 0], rankDelta: 0, trendingScore: 1, completionRate: 50, bingeIndex: 50 },
};
let position = 0;
const originalY = Object.getOwnPropertyDescriptor(window, "scrollY");
const originalHeight = Object.getOwnPropertyDescriptor(document.documentElement, "scrollHeight");
function content(children: ReactNode) {
  return <><RouteScrollRestoration /><main id="main-content" tabIndex={-1}>{children}</main></>;
}
beforeEach(() => {
  position = 0;
  routing.location = { pathname: "/search", search: "?q=달&genres=판타지", hash: "", key: "search-entry" };
  routing.navigation = "POP";
  vi.stubGlobal("ResizeObserver", undefined);
  Object.defineProperty(window, "scrollY", { configurable: true, get: () => position });
  Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, get: () => 12000 });
  vi.spyOn(window, "scrollTo").mockImplementation((first?: number | ScrollToOptions, second?: number) => {
    position = typeof first === "number" ? second ?? 0 : first?.top ?? 0;
  });
  // JSDOM의 상자만 모사한다. 실제 터치·가림·화면 폭 검증이 아니다.
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
    const rect = new DOMRect(0, 100, 100, 120);
    return Object.assign(this.matches("a[data-route-return-focus]") ? [rect] : [], { item: (index: number) => index === 0 ? rect : null });
  });
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (originalY) Object.defineProperty(window, "scrollY", originalY); else Reflect.deleteProperty(window, "scrollY");
  if (originalHeight) Object.defineProperty(document.documentElement, "scrollHeight", originalHeight); else Reflect.deleteProperty(document.documentElement, "scrollHeight");
});

const presentations = [
  ["grid", false, false, `catalog-title:${title.id}`],
  ["featured grid", true, false, `catalog-title:${title.id}`],
  ["row", false, true, `catalog-title-row:${title.id}`],
] as const;
function item(feature: boolean, row: boolean) { return row ? <TitleRow title={title} /> : <TitleCard title={title} feature={feature} />; }

describe("작품 카드와 기존 history 복귀 소유자 연결", () => {
  it.each(presentations)("%s는 원래 href와 title.id 기반의 안정된 키를 유지한다", (_label, feature, row, key) => {
    const view = render(content(item(feature, row)));
    const anchor = view.container.querySelector("a") as HTMLAnchorElement;
    expect(anchor.getAttribute("href")).toBe("/title/unit-moon");
    expect(anchor.dataset.routeReturnFocus).toBe(key);
  });
  it.each(presentations)("%s POP에서 같은 카드의 초점과 스크롤을 복구한다", async (_label, feature, row) => {
    const view = render(content(item(feature, row)));
    const before = view.container.querySelector("a") as HTMLAnchorElement;
    act(() => { position = 1200; fireEvent.scroll(window); });
    fireEvent.click(before, { button: 0 });
    routing.navigation = "PUSH";
    routing.location = { pathname: "/title/unit-moon", search: "", hash: "", key: "title-entry" };
    view.rerender(content(<p>작품 상세</p>));
    routing.navigation = "POP";
    routing.location = { pathname: "/search", search: "?q=달&genres=판타지", hash: "", key: "search-entry" };
    view.rerender(content(item(feature, row)));
    const after = view.container.querySelector("a") as HTMLAnchorElement;
    await waitFor(() => expect(document.activeElement).toBe(after));
    expect(position).toBe(1200);
    expect(routing.location.search).toBe("?q=달&genres=판타지");
  });
  it("같은 작품이 둘 보이면 기존의 모호한 대상 보호를 유지한다", async () => {
    const view = render(content(<TitleCard title={title} />));
    fireEvent.click(view.container.querySelector("a") as HTMLAnchorElement, { button: 0 });
    routing.navigation = "PUSH";
    routing.location = { pathname: "/title/unit-moon", search: "", hash: "", key: "title-entry" };
    view.rerender(content(<p>작품 상세</p>));
    routing.navigation = "POP";
    routing.location = { pathname: "/search", search: "?q=달&genres=판타지", hash: "", key: "search-entry" };
    view.rerender(content(<><TitleCard title={title} /><TitleCard title={title} /></>));
    await act(async () => { await Promise.resolve(); });
    const links = [...view.container.querySelectorAll("a[data-route-return-focus]")];
    expect(links).toHaveLength(2);
    expect(links).not.toContain(document.activeElement);
  });
});
