// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps, PropsWithChildren } from "react";
import { Link as RouterLink, MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Title } from "@/shared/lib/types";
import type { TitleFilterState } from "@/shared/lib/title-filters";
import type { SortKey } from "@/shared/lib/search";
import { ExplorePage } from "./ExplorePage";

const boundary = vi.hoisted(() => ({
  data: null as unknown,
  loading: false,
  error: null as string | null,
  reload: vi.fn(),
  urls: vi.fn(),
  saved: new Set<string>(),
}));
vi.mock("@/platform/use-api-resource", () => ({
  useApiResource: (url: string) => {
    boundary.urls(url);
    return { data: boundary.data, loading: boundary.loading, error: boundary.error, reload: boundary.reload };
  },
}));
vi.mock("@/shared/lib/store", () => ({ useSavedTitleIds: () => boundary.saved }));

vi.mock("@toonstudio/core/fx", () => ({ useFx: () => ({ sfx: vi.fn(), burstAt: vi.fn() }) }));
vi.mock("@/shared/components/page-entrance/PageEntrance", () => ({ PageEntrance: ({ children }: PropsWithChildren) => <div>{children}</div> }));
vi.mock("@/shared/components/section", () => ({ Container: ({ children, className }: PropsWithChildren<{ className?: string }>) => <div className={className}>{children}</div> }));
vi.mock("@/shared/components/site-contextual-subnav", () => ({ SiteContextualSubNav: () => <nav aria-label="문맥 안내" /> }));
vi.mock("@/shared/navigation/router-link", () => ({ default: ({ href, ...props }: Omit<ComponentProps<typeof RouterLink>, "to"> & { href: string }) => <RouterLink to={href} {...props} /> }));
vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  useBilingual: () => (ko: string) => ko,
  useBilingualI18nRevision: () => undefined,
  translateBilingualValueForActiveLocale: (_namespace: string, ko: unknown) => ko,
  formatI18nTemplate: (template: string, vars: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_match, key: string) => String(vars[key] ?? "")),
}));
vi.mock("@/shared/components/ad-slot", () => ({ AdSlot: () => null }));
vi.mock("@/shared/components/count-up", () => ({ CountUp: ({ value }: { value: number }) => <span>{value}</span> }));
vi.mock("@/shared/components/site-experience/SiteArtSurfaceSpotlight", () => ({ SiteArtSurfaceSpotlight: ({ cardId }: { cardId: string }) => <div data-testid="existing-prism-art" data-card-id={cardId} /> }));
vi.mock("@/shared/components/title-card", () => ({ TitleCard: ({ title: item }: { title: Title }) => <article data-testid="title-card" data-title-id={item.id}>{item.title}</article> }));
vi.mock("@/shared/components/feedback/error-state", () => ({ ErrorState: ({ title: heading, message, onRetry }: { title: string; message: string; onRetry: () => void }) => <div role="alert"><p>{heading}</p><p>{message}</p><button type="button" onClick={onRetry}>다시 시도</button></div> }));
vi.mock("@/shared/components/title-filter-panel", () => ({
  TitleFilterPanel: ({ value, onChange, facets, platformOptions, savedCount }: {
    value: TitleFilterState; onChange: (next: TitleFilterState) => void;
    facets: string[]; platformOptions?: string[]; savedCount: number;
  }) => <div data-testid="filter-panel" data-facets={facets.join(",")} data-platforms={platformOptions?.join(",")} data-saved-count={savedCount}>
    <button type="button" onClick={() => onChange({ ...value, savedOnly: !value.savedOnly })}>찜만 전환</button><output>{JSON.stringify(value)}</output>
  </div>,
}));
vi.mock("./ExploreReaDirectoryBar", () => ({
  ExploreReaDirectoryBar: ({ filters, sort, onApplyFilters, onChangeSort }: {
    filters: TitleFilterState; sort: SortKey; onApplyFilters: (next: TitleFilterState) => void; onChangeSort: (next: SortKey) => void;
  }) => <div data-testid="explore-rea-directory-bar" data-sort={sort}>
    <button type="button" onClick={() => onApplyFilters({ ...filters, status: ["completed"] })}>완결 조건</button>
    <button type="button" onClick={() => onChangeSort("newest")}>최근 조건</button>
  </div>,
}));

// API 성공 상태를 위한 합성 테스트 fixture. 제품 seed나 시안 작품을 쓰지 않는다.
function title(id: string, pricing: "free" | "paid" = "free"): Title {
  return {
    id, slug: id, title: `테스트 ${id}`, author: "테스트", type: "webtoon",
    genres: ["판타지"], tags: ["태그0"], synopsis: "테스트 전용",
    cover: ["#000000", "#ffffff"], status: "ongoing", ageRating: "all", releaseYear: 2026,
    availability: [{ platformId: "naver-webtoon", pricing }],
    stats: { views: 0, likes: 0, bookmarks: 0, ratingAvg: 0, ratingCount: 0, ratingDist: [0, 0, 0, 0, 0], rankDelta: 0, trendingScore: 0, completionRate: 0, bingeIndex: 0 },
  };
}
function response(results = [title("one"), title("two")], showCount = 40) {
  return { results, shown: results, showCount, pageSize: 2, hasMore: results.length > showCount,
    tags: Array.from({ length: 14 }, (_, index) => ({ tag: `태그${index}`, count: index + 1 })),
    catalog: { platformCoverage: [{ id: "naver-webtoon", label: "네이버", color: "", count: 1, share: 1 }] },
  };
}
function Controls() {
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <output aria-label="현재 주소">{location.pathname}{location.search}</output>
    <button type="button" onClick={() => navigate("/explore?genres=액션&sort=newest")}>다른 탐색</button>
    <button type="button" onClick={() => navigate(-1)}>뒤로</button>
    <button type="button" onClick={() => navigate(1)}>앞으로</button>
  </>;
}
function tree(url: string) { return <MemoryRouter initialEntries={[url]}><ExplorePage /><Controls /></MemoryRouter>; }
function page(url = "/explore") { return render(tree(url)); }
function params() { return new URL(screen.getByLabelText("현재 주소").textContent ?? "", "https://example.test").searchParams; }
function detail(testId: string): HTMLDetailsElement {
  const element = screen.getByTestId(testId);
  if (!(element instanceof HTMLDetailsElement)) throw new Error("details required");
  return element;
}
function toggle(element: HTMLDetailsElement) {
  const summary = element.querySelector("summary");
  if (!summary) throw new Error("summary required");
  fireEvent.click(summary);
}
beforeEach(() => {
  vi.clearAllMocks();
  boundary.data = response(); boundary.loading = false; boundary.error = null; boundary.saved = new Set();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("/explore 결과 우선 레이아웃", () => {
  it("제목과 장르·결과를 접힌 안내보다 앞에 두고 전역 직계 header 규칙을 피한다", () => {
    page();
    const heading = screen.getByRole("heading", { level: 1 });
    const genres = screen.getByRole("region", { name: "장르 선택" });
    const results = screen.getByRole("region", { name: "탐색 결과" });
    const guide = detail("explore-page-guide");
    expect(heading.textContent).toBe("조건으로 작품 찾기");
    expect(heading.closest("header")?.parentElement?.className).toBe("explore-page-heading-wrap");
    expect(genres.closest("details")).toBeNull();
    expect(results.closest("details")).toBeNull();
    expect(genres.compareDocumentPosition(results) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(results.compareDocumentPosition(guide) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(guide.open).toBe(false);
    expect(screen.getAllByTestId("title-card")).toHaveLength(2);
  });

  it("보조 검색·밀도는 1차 조건줄이 아닌 결과의 접힌 도구 안에 둔다", () => {
    page();
    const results = screen.getByRole("region", { name: "탐색 결과" });
    const controls = results.querySelector("details.explore-results-controls");
    expect(controls).toBeInstanceOf(HTMLDetailsElement);
    expect(controls?.hasAttribute("open")).toBe(false);
    expect(results.querySelector('input[type="search"]')).not.toBeNull();
    expect(document.querySelector('.explore-page-toolbar input[type="search"]')).toBeNull();
    expect(screen.getByRole("button", { name: "평점순" }).closest("details")).toBeNull();
  });

  it("검색 URL은 도구를 열고 로컬 결과만 거르며 지워도 기존 조건을 보존한다", () => {
    page("/explore?q=one&genres=판타지&sort=rating&show=80&utm_source=reference");
    const input = screen.getByRole("searchbox", { name: "결과 내 제목·작가·태그 필터" });
    expect(input.closest("details")?.open).toBe(true);
    expect(screen.getAllByTestId("title-card")).toHaveLength(1);
    const request = boundary.urls.mock.lastCall?.[0];
    expect(request).not.toContain("q=");
    fireEvent.change(input, { target: { value: "two" } });
    expect(params().get("q")).toBe("two");
    expect(screen.getAllByTestId("title-card")[0]?.textContent).toBe("테스트 two");
    expect(boundary.urls.mock.lastCall?.[0]).toBe(request);
    fireEvent.click(screen.getByRole("button", { name: "검색어 지우기" }));
    expect(params().has("q")).toBe(false);
    expect(params().get("genres")).toBe("판타지");
    expect(params().get("sort")).toBe("rating");
    expect(params().get("show")).toBe("80");
    expect(params().get("utm_source")).toBe("reference");
    expect(document.activeElement).toBe(input);
    expect(screen.getAllByTestId("title-card")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "조밀" }));
    expect(document.querySelector('[data-density="compact"]')).not.toBeNull();
  });

  it("모드 링크가 공유 URL 변환과 선택 상태를 유지한다", () => {
    page("/explore?genres=판타지&status=completed&pricing=free&sort=rating&savedOnly=true&view=list");
    const nav = screen.getByRole("navigation", { name: "탐색 방식" });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links[1]?.getAttribute("aria-current")).toBe("page");
    const urls = links.map((link) => new URL(link.getAttribute("href") ?? "", "https://example.test"));
    expect(urls.map((url) => url.pathname)).toEqual(["/search", "/explore", "/recommend"]);
    for (const url of urls) {
      expect(url.searchParams.get("genres")).toBe("판타지");
      expect(url.searchParams.get("pricing")).toBe("free");
      expect(url.searchParams.get("savedOnly")).toBe("true");
    }
    expect(urls[1]?.searchParams.has("view")).toBe(false);
    expect(urls[2]?.searchParams.has("sort")).toBe(false);
  });

  it("장르 선택은 기존 조건과 추적 인자를 보존하고 show만 초기화한다", () => {
    page("/explore?genres=판타지&pricing=free&sort=rating&show=80&utm_source=test");
    const genres = screen.getByRole("region", { name: "장르 선택" });
    fireEvent.click(within(genres).getByRole("button", { name: "액션" }));
    expect(params().get("genres")).toBe("판타지,액션");
    expect(params().get("pricing")).toBe("free");
    expect(params().get("sort")).toBe("rating");
    expect(params().get("utm_source")).toBe("test");
    expect(params().has("show")).toBe(false);
    expect(boundary.urls).toHaveBeenLastCalledWith(`/api/explore?${params().toString()}`);
  });

  it("첫 8개 밖에서 선택한 장르를 유지하고 모든 장르를 접었다 펼친다", () => {
    page("/explore?genres=SF");
    const genres = screen.getByRole("region", { name: "장르 선택" });
    expect(within(genres).getByRole("button", { name: "SF" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(genres).getByRole("button", { name: /모든 장르 보기/ }));
    expect(within(genres).getByRole("button", { name: "일상" })).toBeTruthy();
    fireEvent.click(within(genres).getByRole("button", { name: "자주 쓰는 장르만 보기" }));
    expect(within(genres).queryByRole("button", { name: "일상" })).toBeNull();
    expect(within(genres).getByRole("button", { name: "SF" })).toBeTruthy();
  });

  it("선택 태그는 접힌 요약에 표시하고 보이지 않는 선택 태그도 유지한다", () => {
    page("/explore?tags=외부태그");
    const tags = detail("explore-page-tags");
    expect(tags.open).toBe(false);
    expect(tags.querySelector("summary")?.textContent).toContain("1개 선택");
    toggle(tags);
    const active = within(tags).getByRole("button", { name: /외부태그/ });
    expect(active.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(tags).getByRole("button", { name: /태그 더 보기/ }));
    expect(within(tags).getByRole("button", { name: /태그13/ })).toBeTruthy();
    fireEvent.click(within(tags).getByRole("button", { name: "주요 태그만 보기" }));
    fireEvent.click(within(tags).getByRole("button", { name: /외부태그/ }));
    expect(params().has("tags")).toBe(false);
  });

  it("유형과 정렬의 URL 갱신 차이를 유지한다", () => {
    page("/explore?show=80&genres=판타지");
    fireEvent.click(screen.getByRole("button", { name: "평점순" }));
    expect(params().get("sort")).toBe("rating");
    expect(params().get("show")).toBe("80");
    fireEvent.click(screen.getByRole("button", { name: "웹소설" }));
    expect(params().get("types")).toBe("webnovel");
    expect(params().has("show")).toBe(false);
  });

  it("상세 패널은 기존 facet·플랫폼·찜 개수를 받으며 여닫아도 조건을 잃지 않는다", () => {
    boundary.saved = new Set(["one"]);
    page("/explore?genres=판타지");
    const button = screen.getByRole("button", { name: /상세 필터/ });
    expect(button.getAttribute("aria-controls")).toBe("explore-page-filter-panel");
    fireEvent.click(button);
    const panel = screen.getByTestId("filter-panel");
    expect(panel.getAttribute("data-facets")).toBe("saved,type,genre,status,platform,age,pricing,minRating,year,tag,adapted");
    expect(panel.getAttribute("data-platforms")).toBe("naver-webtoon");
    expect(panel.getAttribute("data-saved-count")).toBe("1");
    fireEvent.click(within(panel).getByRole("button", { name: "찜만 전환" }));
    expect(params().get("savedOnly")).toBe("true");
    expect(screen.getAllByTestId("title-card")).toHaveLength(1);
    fireEvent.click(button); fireEvent.click(button);
    expect(screen.getByTestId("filter-panel").textContent).toContain('"savedOnly":true');
  });

  it("찜·가격 클라이언트 필터는 실제 코어 함수를 계속 사용한다", () => {
    boundary.data = response([title("one"), title("two", "paid"), title("three")]);
    boundary.saved = new Set(["one", "two"]);
    page("/explore?savedOnly=true&pricing=free");
    const cards = screen.getAllByTestId("title-card");
    expect(cards.map((card) => card.getAttribute("data-title-id"))).toEqual(["one"]);
  });

  it("안내 반복 토글은 결과 DOM과 URL을 유지하며 기존 아트·내비·프리셋을 남긴다", () => {
    page("/explore?genres=판타지&sort=rating");
    const guide = detail("explore-page-guide");
    const first = screen.getAllByTestId("title-card")[0];
    const original = params().toString();
    for (let index = 0; index < 3; index += 1) { toggle(guide); expect(guide.open).toBe(true); toggle(guide); expect(guide.open).toBe(false); }
    expect(screen.getAllByTestId("title-card")[0]).toBe(first);
    expect(params().toString()).toBe(original);
    toggle(guide);
    expect(within(guide).getByTestId("existing-prism-art").getAttribute("data-card-id")).toBe("nb-explore-spectrum");
    expect(within(guide).getByRole("navigation", { name: "작품 발견 방식" })).toBeTruthy();
    expect(within(guide).getByTestId("explore-rea-directory-bar")).toBeTruthy();
    expect(guide.querySelector('a[href="/random?genre=%ED%8C%90%ED%83%80%EC%A7%80"]')).not.toBeNull();
  });

  it("로딩은 결과 그리드와 숫자를 정상 결과로 가장하지 않는다", () => {
    boundary.loading = true; boundary.data = null;
    page();
    expect(screen.getByRole("region", { name: "탐색 결과" }).getAttribute("aria-busy")).toBe("true");
    expect(screen.getByLabelText("작품을 불러오는 중").children).toHaveLength(10);
    expect(screen.getByRole("status", { name: "탐색 결과 상태" }).textContent).toBe("불러오는 중…");
    expect(screen.queryByTestId("title-card")).toBeNull();
  });

  it("오류·재시도를 보존하고 오류를 0편으로 표시하지 않는다", () => {
    boundary.error = "테스트 오류"; boundary.data = null;
    page();
    expect(screen.getByRole("alert").textContent).toContain("테스트 오류");
    expect(screen.getByRole("status", { name: "탐색 결과 상태" }).textContent).toBe("작품 수 확인 불가");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(boundary.reload).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("조건에 맞는 작품이 없어요.")).toBeNull();
  });

  it("정상 빈 결과는 조건 초기화 링크와 기존 빈 상태 이미지를 유지한다", () => {
    boundary.data = response([]);
    page("/explore?genres=판타지");
    const results = screen.getByRole("region", { name: "탐색 결과" });
    expect(within(results).getByText("조건에 맞는 작품이 없어요.")).toBeTruthy();
    expect(within(results).getByRole("link", { name: "필터 초기화" }).getAttribute("href")).toBe("/explore");
    expect(results.querySelector("img")?.getAttribute("src")).toBe("/images/empty-generic.webp");
  });

  it("수동 더 보기는 기존 pageSize와 정렬을 보존한다", () => {
    boundary.data = response([title("one"), title("two"), title("three")], 1);
    page("/explore?genres=판타지&sort=rating");
    expect(screen.getAllByTestId("title-card")).toHaveLength(1);
    fireEvent.click(within(screen.getByRole("region", { name: "탐색 결과" })).getByRole("button", { name: /더 보기/ }));
    expect(params().get("show")).toBe("3");
    expect(params().get("sort")).toBe("rating");
  });

  it("IntersectionObserver와 로딩 중 중복 호출 방지를 유지한다", () => {
    const observed: { callback?: IntersectionObserverCallback } = {};
    const disconnect = vi.fn();
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { observed.callback = callback; }
      observe = vi.fn(); disconnect = disconnect;
    });
    boundary.data = response([title("one"), title("two")], 1);
    const view = page();
    const trigger = () => {
      const callback = observed.callback;
      if (!callback) throw new Error("observer callback missing");
      callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    };
    act(trigger);
    expect(params().get("show")).toBe("3");
    boundary.loading = true;
    view.rerender(tree("/explore"));
    const previous = params().toString();
    act(trigger);
    expect(params().toString()).toBe(previous);
    view.unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it("외부 탐색 후 Back/Forward가 현재 조건·정렬을 복원한다", () => {
    page("/explore?genres=판타지&sort=rating");
    fireEvent.click(screen.getByRole("button", { name: "다른 탐색" }));
    expect(params().get("genres")).toBe("액션");
    fireEvent.click(screen.getByRole("button", { name: "뒤로" }));
    expect(params().get("genres")).toBe("판타지");
    expect(screen.getByRole("button", { name: "평점순" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "앞으로" }));
    expect(params().get("sort")).toBe("newest");
  });

  it("44px·focus·최소 폭·reduced motion 계약을 전용 CSS 안에 둔다", () => {
    const css = readFileSync(resolve(import.meta.dirname, "explore-page-layout.css"), "utf8");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("#main-content .explore-page-layout :is(button, summary)");
    expect(css).toContain("min-block-size: 44px");
    expect(css).toContain("min-inline-size: 44px");
    expect(css).toContain("repeat(3, minmax(0, 1fr))");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("var(--color-on-accent)");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
    expect(css).not.toContain(".container > header");
  });
});
