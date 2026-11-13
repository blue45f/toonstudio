// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RESOURCE_MENU_GROUPS, resourceMenuGroupPages } from "./navigation";
import { ResourceSearchPage } from "./ResourceSearchPage";
import type { ResourceSearchProvider } from "./resource-search-config";
import type { CreatorResource } from "@/shared/lib/creator-resources";

const mocks = vi.hoisted(() => ({ update: vi.fn(), download: vi.fn() }));
vi.mock("./ProviderStatus", () => ({ ProviderStatus: () => <p>제공처 연결 안내</p> }));
vi.mock("./workspace", () => ({
  downloadText: mocks.download,
  useCreatorWorkspace: () => ({ workspace: { saved: [] }, update: mocks.update, error: "", ready: true, writable: true, saving: false }),
}));
const request = vi.fn<typeof fetch>();
function Probe() { const location = useLocation(); const navigate = useNavigate(); return <><output data-testid="resource-location">{JSON.stringify(location)}</output><button onClick={() => navigate(-1)}>이전 기록</button></>; }
function mount(provider: ResourceSearchProvider, url: string) {
  return render(<MemoryRouter initialEntries={[{ pathname: url.split(/[?#]/u)[0], search: url.includes("?") ? `?${url.split("?")[1].split("#")[0]}` : "", hash: url.includes("#") ? `#${url.split("#")[1]}` : "", state: { from: "current-manuscript" } }]}><Probe /><ResourceSearchPage provider={provider} /></MemoryRouter>);
}
function unavailable(input: RequestInfo | URL) {
  const provider = new URL(String(input), "http://local.test").searchParams.get("provider");
  return Promise.resolve(Response.json({ provider, page: 1, status: "not_configured", items: [], hasMore: false, message: "연결 확인이 필요합니다.", fetchedAt: "2026-11-12T00:00:00Z" }));
}
beforeEach(() => { localStorage.clear(); request.mockReset().mockImplementation(unavailable); vi.stubGlobal("fetch", request); mocks.update.mockReset(); mocks.download.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function disclosure(selector: string) {
  const element = document.querySelector<HTMLDetailsElement>(selector);
  const summary = element?.querySelector("summary");
  if (!element || !summary) throw new Error(`접이식 도구가 필요합니다: ${selector}`);
  return { element, summary };
}

describe("기관 자료 검색의 모바일 우선 동선", () => {
  it("큰 제공처 소개·전체 메뉴보다 검색과 현재 제공처를 먼저 두며 소개는 다시 열 수 있다", async () => {
    const { container } = mount("nasa", "/research/open-data/nasa");
    const input = screen.getByRole("searchbox");
    const info = disclosure("[data-resource-source-info]");
    const menu = disclosure("[data-resource-search-menu]");
    expect(input.closest("details")).toBeNull();
    expect(input.compareDocumentPosition(info.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(info.element.open).toBe(false); expect(menu.element.open).toBe(false);
    expect(screen.getByText(/현재 제공처/u).textContent).toContain("NASA");
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    fireEvent.click(info.summary);
    expect(info.element.open).toBe(true);
    expect(within(info.element).getByRole("link", { name: "공식 사이트 열기" }).getAttribute("href")).toBe("https://images.nasa.gov/");
    expect(info.element.querySelector("img")?.getAttribute("src")).toBe("/brand/research-sources-20261008/nasa.webp");
    expect(info.element.textContent).toContain("표장·인물·제3자 권리");
    await waitFor(() => expect(request).toHaveBeenCalled());
  });

  it("메뉴의 원래 목적지를 유지하며 Escape는 검색·현재 URL을 바꾸지 않고 summary로 돌아간다", () => {
    const { container } = mount("musicbrainz", "/research/music-metadata?q=Nujabes");
    const menu = disclosure("[data-resource-search-menu]");
    const before = screen.getByTestId("resource-location").textContent;
    fireEvent.click(menu.summary);
    const reached = new Set<string>();
    for (const group of RESOURCE_MENU_GROUPS) {
      fireEvent.click(within(menu.element).getByRole("button", { name: group.title[0] }));
      const hrefs = within(menu.element).getAllByRole("link").map(link => link.getAttribute("href"));
      expect(hrefs).toEqual(["/research", ...resourceMenuGroupPages(group).map(page => page.path)]);
      for (const href of hrefs) if (href) reached.add(href);
    }
    expect([...reached].sort()).toEqual(["/research", ...RESOURCE_MENU_GROUPS.flatMap(group => group.paths)].sort());
    const links = within(menu.element).getAllByRole("link");
    const last = links[links.length - 1]; if (!last) throw new Error("마지막 링크가 필요합니다.");
    last.focus(); fireEvent.keyDown(last, { key: "Escape" });
    expect(menu.element.open).toBe(false); expect(document.activeElement).toBe(menu.summary);
    expect(screen.getByTestId("resource-location").textContent).toBe(before);
    expect(container.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe("Nujabes");
  });

  it("검색어를 바꿔도 원고 복귀용 query·hash·history state를 유지한다", async () => {
    mount("musicbrainz", "/research/music-metadata?q=seed&page=2&return=studio#saved");
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "Nujabes" } });
    const form = input.closest("form"); if (!form) throw new Error("검색 폼이 필요합니다.");
    fireEvent.submit(form);
    const location = JSON.parse(screen.getByTestId("resource-location").textContent ?? "{}");
    expect(new URLSearchParams(location.search).get("q")).toBe("Nujabes");
    expect(new URLSearchParams(location.search).get("return")).toBe("studio");
    expect(location.hash).toBe("#saved"); expect(location.state).toEqual({ from: "current-manuscript" });
    await waitFor(() => expect(request).toHaveBeenCalled());
  });

  it("페이지를 옮기고 Back해도 현재 검색·복귀 문맥이 남는다", async () => {
    request.mockImplementation(async input => Response.json({ provider: "musicbrainz", page: Number(new URL(String(input), "http://local.test").searchParams.get("page")), status: "ready", items: [], hasMore: true, message: "자료 목록", fetchedAt: "2026-11-12T00:00:00Z" }));
    mount("musicbrainz", "/research/music-metadata?q=Nujabes&page=2&return=studio#saved");
    fireEvent.click(await screen.findByRole("button", { name: "다음" }));
    let location = JSON.parse(screen.getByTestId("resource-location").textContent ?? "{}");
    expect(new URLSearchParams(location.search).get("page")).toBe("3");
    expect(new URLSearchParams(location.search).get("return")).toBe("studio");
    expect(location.hash).toBe("#saved"); expect(location.state).toEqual({ from: "current-manuscript" });
    fireEvent.click(screen.getByRole("button", { name: "이전 기록" }));
    location = JSON.parse(screen.getByTestId("resource-location").textContent ?? "{}");
    expect(new URLSearchParams(location.search).get("page")).toBe("2");
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("Nujabes");
    expect(location.hash).toBe("#saved");
  });

  it("검색 실패는 빈 결과/저장 완료로 바꾸지 않으며 입력을 남겨 같은 조건으로 재시도한다", async () => {
    request.mockResolvedValue(new Response("", { status: 503 }));
    mount("musicbrainz", "/research/music-metadata?q=Nujabes");
    await screen.findByRole("alert");
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("Nujabes");
    expect(screen.queryByText("이 제공처에서 저장한 자료가 없습니다.")).toBeNull();
    const count = request.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(request.mock.calls.length).toBeGreaterThan(count));
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("Nujabes");
  });

  it("참고 전용 소장품은 권리·원문·보드 저장만 제공하고 원고 자동 적용을 만들지 않는다", async () => {
    const item: CreatorResource = { id: "vam:reference", provider: "vam", title: "의상 소장 기록", creator: "V&A", description: "복식 기록", sourceUrl: "https://collections.vam.ac.uk/item/reference", imageUrl: "", license: "reference-only", licenseUrl: "https://collections.vam.ac.uk/rights", credit: "V&A", fetchedAt: "2026-11-12T00:00:00Z" };
    request.mockImplementation(async () => Response.json({ provider: "vam", page: 1, status: "ready", items: [item], hasMore: false, message: "소장 기록", fetchedAt: item.fetchedAt }));
    mount("vam", "/research/vam?q=costume");
    const heading = await screen.findByRole("heading", { name: item.title });
    const card = heading.closest("article"); if (!card) throw new Error("자료 카드가 필요합니다.");
    expect(within(card).getByRole("link", { name: "원문 확인 ↗" }).getAttribute("href")).toBe(item.sourceUrl);
    expect(within(card).queryByRole("button", { name: /적용|가져오기/u })).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: "보드에 저장" }));
    expect(mocks.update).toHaveBeenCalledOnce();
    const saved = mocks.update.mock.lastCall?.[0]({ saved: [] });
    expect(saved.saved[0]).toMatchObject({ id: item.id, provider: "vam", sourceUrl: item.sourceUrl, license: "reference-only", credit: "V&A", provenance: { importPermission: "reference-only", sourceUrl: item.sourceUrl, attribution: "V&A" } });
    const rights = card.querySelector("details"); if (!rights) throw new Error("권리 안내가 필요합니다.");
    fireEvent.click(rights.querySelector("summary") as HTMLElement);
    expect(rights.textContent).toContain("Studio 직접 가져오기는 허용하지 않습니다");
  });
});
