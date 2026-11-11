// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { BrowserRouter, MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EngineeringAtlasPage } from "./EngineeringAtlasPage";

vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));
vi.mock("./engineering-atlas-content", async () => {
  const { FIXTURE_ATLAS_OPFS: base, FIXTURE_ATLAS_BUDGET: last } = await import("./engineering-atlas.fixtures");
  return { ENGINEERING_ATLAS_ENTRIES: [base, ...Array.from({ length: 23 }, (_, index) => ({
    ...base, id: `fixture-sample-${index + 2}`, name: `Example ${index + 2}`,
  })), last], findAtlasEntry: () => undefined, atlasEntriesForCategory: () => [], atlasEntriesForChapter: () => [] };
});
vi.mock("./engineering-map-content", async () => {
  const { FIXTURE_MAP_FREE_TIER: map } = await import("./engineering-map.fixtures");
  return { ENGINEERING_MAPS: [{ ...map, rows: map.rows.map((row, index) => index === 0 ? { ...row, atlasIds: ["fixture-sample-14"] } : row) }], findEngineeringMap: () => undefined };
});

const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
afterEach(() => {
  cleanup();
  if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollDescriptor);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  window.history.replaceState(null, "", "/");
});

function HistoryControls() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output data-testid="atlas-url">{JSON.stringify(location)}</output>
    <button onClick={() => navigate(-1)}>이전 기록</button><button onClick={() => navigate(1)}>다음 기록</button>
    <button onClick={() => navigate({ pathname: location.pathname, search: location.search, hash: "#fixture-sample-14-samples" })}>다른 카드 앵커</button>
  </>;
}
function renderPage(url = "/about/technology/atlas") {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  return render(<MemoryRouter initialEntries={[{ pathname: "/about/technology/atlas", search: url.split("?")[1]?.split("#")[0] ? `?${url.split("?")[1].split("#")[0]}` : "", hash: url.includes("#") ? `#${url.split("#")[1]}` : "", state: { keep: "caller-context" } }]}>
    <HistoryControls /><EngineeringAtlasPage />
  </MemoryRouter>);
}
const count = (container: HTMLElement) => container.querySelector("[data-atlas-result-count]")?.textContent ?? "";
const search = () => screen.getByRole<HTMLInputElement>("searchbox");
const next = () => screen.getByRole<HTMLButtonElement>("button", { name: /다음 12개|Next 12/u });
const maps = () => screen.getByRole("button", { name: /^(기술 비교 지도|Technology maps)$/u });
const mapChoice = () => screen.getByRole("button", { name: /무료로 세운 서비스.*지도 열기|Services built on free tiers.*Open map/u });
const currentUrl = () => JSON.parse(screen.getByTestId("atlas-url").textContent ?? "{}");

describe("기술 도감의 목적 분리와 결과 페이지", () => {
  it("첫 12개와 현재 범위를 알리고 마지막 1개까지 이동하며 결과 제목으로 초점을 옮긴다", () => {
    const { container } = renderPage();
    expect(container.querySelectorAll("[data-atlas-card]")).toHaveLength(12);
    expect(container.querySelectorAll("figure.eng-dia, [data-map-table], [data-map-cards]")).toHaveLength(0);
    expect(count(container)).toContain("1–12");
    expect(count(container)).toContain("25");
    fireEvent.click(next());
    expect(count(container)).toContain("13–24");
    expect(document.activeElement?.id).toBe("atlas-cards-title");
    fireEvent.click(next());
    expect(count(container)).toContain("25–25");
    expect(container.querySelectorAll("[data-atlas-card]")).toHaveLength(1);
    expect(next().disabled).toBe(true);
    expect(container.querySelector("#fixture-free-budget")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /이전 12개|Previous 12/u }));
    expect(count(container)).toContain("13–24");
  });

  it("현재 페이지 밖의 영어 사용 기능도 검색하고 좁힌 조건과 빈 결과는 첫 페이지로 돌아간다", () => {
    const { container } = renderPage("/about/technology/atlas?atlas-page=3");
    fireEvent.change(search(), { target: { value: "AI assistance" } });
    expect(container.querySelector("#fixture-free-budget")).toBeTruthy();
    expect(count(container)).toContain("1–1");
    expect(new URLSearchParams(currentUrl().search).get("atlas-page")).toBeNull();
    fireEvent.change(search(), { target: { value: "일치하지않는검색" } });
    expect(count(container)).toContain("0–0");
    expect(screen.getByText(/조건에 맞는 카드가 없습니다|No cards match/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /검색 조건 초기화|Reset filters/u }));
    expect(count(container)).toContain("1–12");
    expect(search().value).toBe("");
  });

  it("지도는 별도 목적에서 선택한 한 장만 구성하고 목록 복귀 시 열기 버튼으로 초점을 돌린다", () => {
    const { container } = renderPage();
    expect(container.querySelector("#map-free-tier")).toBeNull();
    fireEvent.click(maps());
    expect(maps().getAttribute("aria-current")).toBe("page");
    expect(container.querySelector("#map-free-tier")).toBeNull();
    vi.mocked(HTMLElement.prototype.scrollIntoView).mockClear();
    fireEvent.click(mapChoice());
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenLastCalledWith({ block: "start", behavior: "instant" });
    expect(container.querySelector("#map-free-tier table tbody tr")).toBeTruthy();
    expect(document.activeElement?.id).toBe("map-free-tier-title");
    expect(container.querySelector('a[href="#fixture-sample-14"]')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /지도 목록으로|Back to maps/u }));
    expect(container.querySelector("#map-free-tier")).toBeNull();
    expect(document.activeElement).toBe(mapChoice());
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest", behavior: "instant" });
  });

  it.each(["#fixture-sample-14", "#fixture-sample-14-samples", "#category-ai"])("%s 직접 진입은 첫 커밋부터 해당 결과·본문을 구성한다", (hash) => {
    const { container } = renderPage(`/about/technology/atlas?unrelated=keep${hash}`);
    const id = hash === "#category-ai" ? "fixture-free-budget" : "fixture-sample-14";
    expect(container.querySelector(`#${id}`)).toBeTruthy();
    if (hash !== "#category-ai") {
      expect(container.querySelector(`#${id}-samples`)).toBeTruthy();
      expect(container.querySelector<HTMLDetailsElement>(`#${id} details`)?.open).toBe(true);
    } else expect(container.querySelector("#category-ai")).toBeTruthy();
    expect(new URLSearchParams(currentUrl().search).get("unrelated")).toBe("keep");
    expect(currentUrl().hash).toBe(hash);
  });

  it("지도 행 해시는 해당 목적과 지도 본문을 구성하며 카드 앵커 이동은 페이지 밖 카드로 연결된다", () => {
    const { container } = renderPage("/about/technology/atlas#map-free-tier-cloudflare-workers");
    expect(container.querySelector("#map-free-tier-cloudflare-workers")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다른 카드 앵커" }));
    expect(container.querySelector("#fixture-sample-14-samples")).toBeTruthy();
    expect(container.querySelector("#atlas-card-results")?.hasAttribute("hidden")).toBe(false);
  });

  it("동일 해시의 검색 변경은 입력 초점·스크롤을 건드리지 않고 무관한 query와 state를 보존한다", () => {
    renderPage("/about/technology/atlas?unrelated=keep#fixture-opfs");
    search().focus();
    const scroll = HTMLElement.prototype.scrollIntoView;
    vi.mocked(scroll).mockClear();
    fireEvent.change(search(), { target: { value: "OPFS" } });
    expect(document.activeElement).toBe(search());
    expect(scroll).not.toHaveBeenCalled();
    expect(currentUrl().hash).toBe("#fixture-opfs");
    expect(new URLSearchParams(currentUrl().search).get("unrelated")).toBe("keep");
    expect(currentUrl().state).toEqual({ keep: "caller-context" });
  });

  it("Back과 forward는 검색·분야·상태·페이지·목적을 URL에서 복원한다", () => {
    const { container } = renderPage("/about/technology/atlas?unrelated=keep&q=OPFS&category=local-first&status=live");
    fireEvent.click(next());
    fireEvent.click(maps());
    fireEvent.click(screen.getByRole("button", { name: "이전 기록" }));
    expect(container.querySelector("#atlas-card-results")?.hasAttribute("hidden")).toBe(false);
    expect(count(container)).toContain("13–24");
    expect(search().value).toBe("OPFS");
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: /^(분야|Category)$/u }).value).toBe("local-first");
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: /현재 상태|Current status/u }).value).toBe("live");
    fireEvent.click(screen.getByRole("button", { name: "이전 기록" }));
    expect(count(container)).toContain("1–12");
    fireEvent.click(screen.getByRole("button", { name: "다음 기록" }));
    expect(count(container)).toContain("13–24");
  });

  it("첫 카드 해시에서 페이지2·3을 거쳐 Back하면 page2를 덮지 않고, 사라진 자체 해시만 정리한다", () => {
    const { container } = renderPage("/about/technology/atlas?unrelated=keep#fixture-opfs");
    fireEvent.click(next());
    expect(currentUrl().hash).toBe("");
    fireEvent.click(next());
    expect(count(container)).toContain("25–25");
    fireEvent.click(screen.getByRole("button", { name: "이전 기록" }));
    expect(count(container)).toContain("13–24");
    expect(new URLSearchParams(currentUrl().search).get("atlas-page")).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: "이전 기록" }));
    expect(count(container)).toContain("1–12");
    expect(currentUrl().hash).toBe("#fixture-opfs");
    fireEvent.click(screen.getByRole("button", { name: "다음 기록" }));
    expect(count(container)).toContain("13–24");
    expect(currentUrl().hash).toBe("");
    expect(new URLSearchParams(currentUrl().search).get("unrelated")).toBe("keep");
    expect(currentUrl().state).toEqual({ keep: "caller-context" });
  });

  it("필터된 지도 행에서 다른 카드 해시로 이동한 뒤 Back하면 지도 검색·상태를 보존한다", () => {
    const { container } = renderPage("/about/technology/atlas?q=cloudflare&status=live&unrelated=keep#map-free-tier-cloudflare-workers");
    expect(search().value).toBe("cloudflare");
    expect(container.querySelectorAll("#map-free-tier table tbody tr")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "다른 카드 앵커" }));
    expect(container.querySelector("#fixture-sample-14-samples")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "이전 기록" }));
    expect(search().value).toBe("cloudflare");
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: /현재 상태|Current status/u }).value).toBe("live");
    expect(currentUrl().hash).toBe("#map-free-tier-cloudflare-workers");
    expect(container.querySelectorAll("#map-free-tier table tbody tr")).toHaveLength(1);
    expect(new URLSearchParams(currentUrl().search).get("unrelated")).toBe("keep");
  });

  it("지도에 다른 행이 남아도 해시가 가리킨 행이 제외됐으면 조건을 복구해 그 행을 제공한다", () => {
    const { container } = renderPage("/about/technology/atlas?status=configured#map-free-tier-cloudflare-workers");
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: /현재 상태|Current status/u }).value).toBe("all");
    expect(container.querySelector("#map-free-tier-cloudflare-workers")).toBeTruthy();
    expect(container.querySelectorAll("#map-free-tier table tbody tr")).toHaveLength(2);
    expect(currentUrl().hash).toBe("#map-free-tier-cloudflare-workers");
  });

  it("입력으로 대상이 사라질 때 자체 해시만 정리하고 초점과 무관한 해시는 보존한다", () => {
    const first = renderPage("/about/technology/atlas#fixture-opfs");
    search().focus();
    fireEvent.change(search(), { target: { value: "일치없음" } });
    expect(currentUrl().hash).toBe("");
    expect(document.activeElement).toBe(search());
    first.unmount();
    renderPage("/about/technology/atlas#outside-section");
    fireEvent.click(next()); fireEvent.click(next());
    fireEvent.click(screen.getByRole("button", { name: "이전 기록" }));
    expect(currentUrl().hash).toBe("#outside-section");
    expect(new URLSearchParams(currentUrl().search).get("atlas-page")).toBe("2");
  });

  it.each([true, false])("네이티브 POP과 hashchange는 caller state와 새 query를 보존한다(query 변경=%s)", (queryChanges) => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    window.history.replaceState({ usr: { caller: "before" }, key: "before", idx: 0 }, "", "/about/technology/atlas?q=OPFS#fixture-opfs");
    render(<BrowserRouter><HistoryControls /><EngineeringAtlasPage /></BrowserRouter>);
    act(() => {
      window.history.pushState({ usr: { caller: "after" }, key: "after", idx: 1 }, "", `/about/technology/atlas?q=OPFS${queryChanges ? "&status=live&category=local-first&unrelated=keep" : ""}#fixture-sample-2`);
      window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    const params = new URLSearchParams(currentUrl().search);
    expect(params.get("status")).toBe(queryChanges ? "live" : null);
    expect(params.get("category")).toBe(queryChanges ? "local-first" : null);
    expect(params.get("unrelated")).toBe(queryChanges ? "keep" : null);
    expect(currentUrl().hash).toBe("#fixture-sample-2");
    expect(currentUrl().state).toEqual({ caller: "after" });
  });

  it("전체 인쇄는 검색 밖 카드와 모든 지도 원문을 구성하고 URL·조건·페이지·접힘 상태를 복구한다", () => {
    const { container } = renderPage("/about/technology/atlas?q=OPFS&atlas-page=2&unrelated=keep");
    const first = container.querySelector<HTMLDetailsElement>("[data-atlas-card] details");
    if (!first) throw new Error("첫 카드 접기 요소가 필요합니다.");
    act(() => { first.open = true; fireEvent(first, new Event("toggle")); });
    const before = screen.getByTestId("atlas-url").textContent;
    act(() => window.dispatchEvent(new Event("beforeprint")));
    expect(container.querySelectorAll("[data-atlas-card]")).toHaveLength(25);
    expect(container.querySelectorAll("[data-atlas-card] h4")).toHaveLength(125);
    expect(container.querySelectorAll("#map-free-tier table tbody tr")).toHaveLength(2);
    expect(container.querySelector("#fixture-free-budget-samples")).toBeTruthy();
    act(() => window.dispatchEvent(new Event("afterprint")));
    expect(container.querySelectorAll("[data-atlas-card]")).toHaveLength(12);
    expect(container.querySelector("#map-free-tier")).toBeNull();
    expect(count(container)).toContain("13–24");
    expect(search().value).toBe("OPFS");
    expect(screen.getByTestId("atlas-url").textContent).toBe(before);
    expect(container.querySelector<HTMLDetailsElement>("[data-atlas-card] details")?.open).toBe(true);
    expect(container.querySelectorAll<HTMLDetailsElement>("[data-atlas-card] details")[1]?.open).toBe(false);
  });

  it.each(["?atlas-page=-4", "?atlas-page=999999", "?atlas-page=NaN", "#%E0", "#unknown-card"])("잘못된 경계 %s에서도 유효한 범위로 읽고 예외를 던지지 않는다", (suffix) => {
    const { container } = renderPage(`/about/technology/atlas${suffix}`);
    expect(container.querySelectorAll("[data-atlas-card]").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("[data-atlas-card]").length).toBeLessThanOrEqual(12);
    expect(within(container).getByRole("heading", { level: 1 }).textContent).toMatch(/기술 도감|Technology atlas/u);
  });
});
