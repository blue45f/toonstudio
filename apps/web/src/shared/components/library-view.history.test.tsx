// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RouteScrollRestoration } from "@/app/RouteScrollRestoration";
import { LibraryView } from "./library-view";
import type { Tab } from "./library-view-constants";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  store: {
    reads: {}, ratings: {}, subscriptions: {}, collections: [], recentlyViewed: [],
    createCollection: vi.fn(), renameCollection: vi.fn(), deleteCollection: vi.fn(),
    adultVerified: false, setAdultVerified: vi.fn(), resetAll: vi.fn(),
  },
}));
vi.mock("@/platform/api", () => ({ apiFetch: mocks.apiFetch }));
vi.mock("@/shared/lib/store", () => ({
  useApp: (selector: (state: typeof mocks.store) => unknown) => selector(mocks.store),
  useHydrated: () => true,
}));
vi.mock("@/shared/rest-status-i18n", () => ({ restStatusText: (_key: string, fallback: string) => fallback }));
vi.mock("./library-view-collections", () => ({ CollectionsTab: () => <p>컬렉션 내용</p> }));
vi.mock("./rank-row", () => ({ MiniPoster: () => null }));
vi.mock("./title-card", () => ({ TitleCard: () => null }));

let position = 0;
const originalY = Object.getOwnPropertyDescriptor(window, "scrollY");
const originalHeight = Object.getOwnPropertyDescriptor(document.documentElement, "scrollHeight");
const originalIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.apiFetch.mockImplementation(async () => new Response(JSON.stringify({ profile: {
    affinityType: "balanced", ratedCount: 0, avgRating: 0, topGenres: [], topTags: [],
  }, tasteRecs: [], items: [] }), { status: 200, headers: { "content-type": "application/json" } }));
  position = 0;
  Object.defineProperty(window, "scrollY", { configurable: true, get: () => position });
  Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, get: () => 12000 });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.spyOn(window, "scrollTo").mockImplementation((first?: number | ScrollToOptions, second?: number) => {
    position = typeof first === "number" ? second ?? 0 : first?.top ?? 0;
  });
  vi.stubGlobal("ResizeObserver", undefined);
  // JSDOM의 레이아웃 부재를 보완하는 존재 상자이며 실제 크기·모바일 가림 검증은 아니다.
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
    const rect = new DOMRect(0, 100, 110, 44);
    return Object.assign(this.matches("a[data-route-return-focus]") ? [rect] : [], { item: () => rect });
  });
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (originalY) Object.defineProperty(window, "scrollY", originalY); else Reflect.deleteProperty(window, "scrollY");
  if (originalHeight) Object.defineProperty(document.documentElement, "scrollHeight", originalHeight); else Reflect.deleteProperty(document.documentElement, "scrollHeight");
  if (originalIntoView) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalIntoView); else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

function NavigationTools() {
  const location = useLocation(), navigate = useNavigate();
  return <>
    <output data-testid="current-url">{location.pathname}{location.search}{location.hash}</output>
    <output data-testid="current-key">{location.key}</output>
    <output data-testid="current-state">{JSON.stringify(location.state)}</output>
    <button type="button" onClick={() => void navigate(-1)}>이전 화면</button>
    <button type="button" onClick={() => void navigate(-2)}>두 기록 이전</button>
  </>;
}
function TestApp({ initialTab = "shelf", hideLibrary = false }: { initialTab?: Tab; hideLibrary?: boolean }) {
  return <>
    <RouteScrollRestoration />
    <NavigationTools />
    <Routes>
      <Route path="/library" element={<main id="main-content" tabIndex={-1}>
        <input aria-label="다른 입력" />
        {hideLibrary ? <p>서재 불러오는 중</p> : <LibraryView initialTab={initialTab} />}
      </main>} />
      <Route path="/explore" element={<main id="main-content" tabIndex={-1}><h1>작품 탐색 화면</h1></main>} />
      <Route path="/ranking" element={<main id="main-content" tabIndex={-1}><h1>랭킹 화면</h1></main>} />
    </Routes>
  </>;
}
function renderLibrary(url = "/library?tab=shelf", options: { initialTab?: Tab; entries?: string[] } = {}) {
  const entries = options.entries ?? [url];
  return render(<MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}><TestApp initialTab={options.initialTab} /></MemoryRouter>);
}
const currentUrl = () => new URL(screen.getByTestId("current-url").textContent ?? "", "http://localhost");
const selected = (name: string) => expect(screen.getByRole("tab", { name, exact: true }).getAttribute("aria-selected")).toBe("true");

describe("서재 읽기 상태와 기존 history 복귀", () => {
  it("실제 다른 경로에 도착한 뒤 POP하면 읽기 상태·원래 CTA 초점·스크롤을 복원한다", async () => {
    renderLibrary("/library?tab=shelf&project=work%2Fone&tag=a&tag=b");
    fireEvent.click(screen.getByRole("tab", { name: "보류", exact: true }));
    selected("보류");
    act(() => { position = 620; fireEvent.scroll(window); });
    fireEvent.click(screen.getByRole("link", { name: "작품 탐색하기", exact: true }));
    expect(await screen.findByRole("heading", { name: "작품 탐색 화면" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "보류", exact: true })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "이전 화면", exact: true }));
    await waitFor(() => selected("보류"));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("link", { name: "작품 탐색하기", exact: true })));
    expect(position).toBe(620);
    expect(currentUrl().searchParams.get("project")).toBe("work/one");
    expect(currentUrl().searchParams.getAll("tag")).toEqual(["a", "b"]);
    expect(mocks.store.resetAll).not.toHaveBeenCalled();
    expect(mocks.store.setAdultVerified).not.toHaveBeenCalled();
  });

  it("주 탭도 다른 화면에서 돌아오면 사용자가 고른 평가 탭을 유지한다", async () => {
    renderLibrary();
    fireEvent.click(screen.getByRole("tab", { name: "평가", exact: true }));
    fireEvent.click(screen.getByRole("link", { name: "평가하러 가기", exact: true }));
    expect(await screen.findByRole("heading", { name: "랭킹 화면" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "이전 화면", exact: true }));
    await waitFor(() => selected("평가"));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("link", { name: "평가하러 가기", exact: true })));
  });

  it.each([
    ["want", "관심"], ["reading", "보는 중"], ["paused", "보류"], ["done", "완독"], ["dropped", "하차"],
  ])("직접 진입의 엄격한 libraryRead=%s를 %s로 표시하되 초점을 빼앗지 않는다", (value, name) => {
    renderLibrary(`/library?tab=shelf&libraryRead=${value}`);
    selected(name);
    expect(document.activeElement).not.toBe(screen.getByRole("link", { name: "작품 탐색하기", exact: true }));
  });

  it.each(["invalid", "PAUSED", "paused%20", "paused&libraryRead=done", ""]) (
    "알 수 없거나 중복인 libraryRead=%s는 쓰기 없이 기본 관심으로 표시한다", (value) => {
      const original = `/library?tab=shelf&libraryRead=${value}&project=keep#memo`;
      renderLibrary(original);
      selected("관심");
      expect(screen.getByTestId("current-url").textContent).toBe(original);
    },
  );

  it("선택 시 다른 query·중복 값·hash·경로를 유지하고 브라우저 뒤로 기록을 늘리지 않는다", () => {
    renderLibrary("/library?tab=shelf&project=work%2Fone&tag=a&tag=b#memo", { entries: ["/explore", "/library?tab=shelf&project=work%2Fone&tag=a&tag=b#memo"] });
    fireEvent.click(screen.getByRole("tab", { name: "보류", exact: true }));
    const url = currentUrl();
    expect(url.pathname).toBe("/library"); expect(url.hash).toBe("#memo");
    expect(url.searchParams.get("libraryRead")).toBe("paused");
    expect(url.searchParams.get("project")).toBe("work/one"); expect(url.searchParams.getAll("tag")).toEqual(["a", "b"]);
    fireEvent.click(screen.getByRole("button", { name: "이전 화면", exact: true }));
    expect(screen.getByRole("heading", { name: "작품 탐색 화면" })).toBeTruthy();
  });

  it("기존 initialTab 호출 계약을 쿼리가 없는 진입에서 유지한다", () => {
    renderLibrary("/library", { initialTab: "rated" }); selected("평가");
  });

  it("화면 선택은 기존 history state와 작품 데이터를 바꾸지 않는다", () => {
    const state = { currentProject: { id: "work-one" }, returnTo: "/home" };
    const originalReads = { ...mocks.store.reads };
    render(<MemoryRouter initialEntries={[{ pathname: "/library", search: "?tab=shelf&project=work-one", state }]}><TestApp /></MemoryRouter>);
    fireEvent.click(screen.getByRole("tab", { name: "보류", exact: true }));
    expect(JSON.parse(screen.getByTestId("current-state").textContent ?? "null")).toEqual(state);
    expect(mocks.store.reads).toEqual(originalReads);
    expect(mocks.store.createCollection).not.toHaveBeenCalled();
    expect(mocks.store.renameCollection).not.toHaveBeenCalled();
    expect(mocks.store.deleteCollection).not.toHaveBeenCalled();
    expect(mocks.store.resetAll).not.toHaveBeenCalled();
  });

  it("다른 history key로 POP하면 이전 CTA의 초점을 가져오지 않는다", async () => {
    const url = "/library?tab=shelf&libraryRead=paused";
    renderLibrary(url, { entries: [url, url] });
    const originalKey = screen.getByTestId("current-key").textContent;
    fireEvent.click(screen.getByRole("link", { name: "작품 탐색하기", exact: true }));
    expect(await screen.findByRole("heading", { name: "작품 탐색 화면" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "두 기록 이전", exact: true }));
    await waitFor(() => selected("보류"));
    expect(screen.getByTestId("current-key").textContent).not.toBe(originalKey);
    expect(document.activeElement).not.toBe(screen.getByRole("link", { name: "작품 탐색하기", exact: true }));
  });

  it("늦게 돌아온 서재가 이미 선택한 외부 입력의 초점을 빼앗지 않는다", async () => {
    const initialEntries = ["/library?tab=shelf&libraryRead=paused"];
    const view = render(<MemoryRouter initialEntries={initialEntries}><TestApp /></MemoryRouter>);
    fireEvent.click(screen.getByRole("link", { name: "작품 탐색하기", exact: true }));
    expect(await screen.findByRole("heading", { name: "작품 탐색 화면" })).toBeTruthy();
    view.rerender(<MemoryRouter initialEntries={initialEntries}><TestApp hideLibrary /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "이전 화면", exact: true }));
    expect(await screen.findByText("서재 불러오는 중")).toBeTruthy();
    const input = screen.getByRole("textbox", { name: "다른 입력" }); input.focus();
    view.rerender(<MemoryRouter initialEntries={initialEntries}><TestApp /></MemoryRouter>);
    await waitFor(() => selected("보류"));
    await act(async () => { await Promise.resolve(); });
    expect(document.activeElement).toBe(input);
  });
});
