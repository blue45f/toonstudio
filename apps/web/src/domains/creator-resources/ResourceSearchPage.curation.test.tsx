// @vitest-environment jsdom
/**
 * S4-02 검색 전 큐레이션 타일 회귀 테스트.
 *
 * 계약: featured가 있는 제공처는 대표 검색어의 실제 검색 결과로만 타일을 만들고,
 * 타일 클릭은 같은 검색을 실행한다. API 미설정·실패면 타일을 위장하지 않고
 * 정직한 빈 상태(일러스트+추천 키워드)로 떨어진다. featured가 없는 제공처
 * (음악 메타데이터 등)는 검색 전 어떤 검색 요청도 보내지 않는다.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResourceSearchPage } from "./ResourceSearchPage";

import type { ResourceSearchProvider } from "./resource-search-config";
import type { CreatorResource } from "@/shared/lib/creator-resources";

const request = vi.fn<typeof fetch>();

/* parseResource가 제공처별 허용 호스트(SOURCE_HOSTS·PUBLIC_IMAGE_HOSTS)로 검증하므로
   픽스처도 실제 제공처 호스트를 써야 응답이 파싱된다. */
const FIXTURE_HOSTS: Record<string, { source: string; image: string }> = {
  met: { source: "https://www.metmuseum.org/art/collection/search/", image: "https://images.metmuseum.org/CRDImages/" },
  vam: { source: "https://collections.vam.ac.uk/item/", image: "https://framemark.vam.ac.uk/collections/" },
  googlefonts: { source: "https://fonts.google.com/specimen/", image: "" },
  nasa: { source: "https://images.nasa.gov/details/", image: "https://images-assets.nasa.gov/image/" },
};

function item(provider: string, n: number, extra: Partial<CreatorResource> = {}): CreatorResource {
  const hosts = FIXTURE_HOSTS[provider] ?? { source: "https://example.org/", image: "" };
  return {
    id: `${provider}:item-${n}`,
    provider: provider as CreatorResource["provider"],
    title: `${provider} 대표 자료 ${n}`,
    creator: "제공 기관",
    description: "큐레이션 테스트용 실제 응답 항목",
    sourceUrl: `${hosts.source}${n}`,
    license: "CC0",
    licenseUrl: "",
    credit: "Provider",
    fetchedAt: "2026-10-05T00:00:00.000Z",
    ...(hosts.image ? { imageUrl: `${hosts.image}${n}.jpg` } : {}),
    ...extra,
  };
}

function searchResponse(provider: string, status: string, items: CreatorResource[]) {
  return Response.json({ provider, page: 1, status, items, hasMore: false, message: "공식 제공처 응답", fetchedAt: "2026-10-05T00:00:00.000Z" });
}

function routeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  if (url.includes("/api/creator-resources/providers")) return Promise.resolve(Response.json([]));
  const parsed = new URL(url, "https://local.test");
  const provider = parsed.searchParams.get("provider") ?? "";
  const q = parsed.searchParams.get("q") ?? "";
  if (provider === "met") return Promise.resolve(searchResponse("met", "ready", [1, 2, 3, 4].map((n) => item("met", n))));
  if (provider === "vam") return Promise.resolve(searchResponse("vam", "ready", [1, 2, 3].map((n) => item("vam", n, { license: "reference-only" }))));
  if (provider === "googlefonts") return Promise.resolve(searchResponse("googlefonts", "ready", [1, 2, 3].map((n) => item("googlefonts", n, { title: `예시 글꼴 ${n}`, imageUrl: undefined }))));
  if (provider === "nasa") return Promise.resolve(searchResponse("nasa", q === "nebula" ? "not_configured" : "ready", q === "nebula" ? [] : [item("nasa", 1)]));
  return Promise.resolve(searchResponse(provider, "ready", [item(provider, 1)]));
}

function searchCalls(): string[] {
  return request.mock.calls.map((call) => String(call[0])).filter((url) => url.includes("/api/creator-resources/search"));
}

const mount = (provider: ResourceSearchProvider) =>
  render(<MemoryRouter initialEntries={["/research/test"]}><ResourceSearchPage provider={provider} /></MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
  request.mockReset().mockImplementation(routeFetch);
  vi.stubGlobal("fetch", request);
  vi.stubGlobal("navigator", Object.assign(Object.create(navigator), {
    locks: { request: async (_key: string, _options: unknown, operation: () => unknown) => operation() },
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("검색 전 큐레이션 타일 (S4-02)", () => {
  it("대표 검색의 실제 결과로 타일을 만들고, 클릭하면 같은 검색을 실행한다", async () => {
    mount("met");
    expect(await screen.findByRole("heading", { name: "검색 전에 둘러보기" }, { timeout: 10000 })).toBeTruthy();
    const tile = await screen.findByRole("button", { name: /met 대표 자료 1/u }, { timeout: 10000 });
    expect(searchCalls().filter((url) => url.includes("provider=met")).length).toBe(1);
    fireEvent.click(tile);
    await waitFor(() => expect(searchCalls().filter((url) => url.includes("provider=met") && url.includes("q=armor")).length).toBe(2), { timeout: 10000 });
    expect(await screen.findByRole("heading", { name: "met 대표 자료 2" }, { timeout: 10000 })).toBeTruthy();
  });

  it("V&A 큐레이션 타일에도 레퍼런스 전용 배지를 고정한다", async () => {
    mount("vam");
    const tile = await screen.findByRole("button", { name: /vam 대표 자료 1/u }, { timeout: 10000 });
    expect(tile.textContent).toContain("레퍼런스 전용");
  });

  it("Google Fonts는 이미지가 없어도 글꼴 미리보기 타일로 만든다", async () => {
    mount("googlefonts");
    expect(await screen.findByRole("button", { name: /예시 글꼴 1/u }, { timeout: 10000 })).toBeTruthy();
  });

  it("API 미설정이면 타일을 위장하지 않고 추천 키워드 빈 상태로 떨어진다", async () => {
    mount("nasa");
    expect(await screen.findByText(/추천 키워드로 바로 검색해 보세요/u, undefined, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "검색 전에 둘러보기" })).toBeNull();
    expect(screen.queryByText(/외부 API는 검색할 때만 호출합니다/u)).toBeNull();
    // 폼의 예시 칩과 빈 상태 칩이 같은 이름이라, 빈 상태 쪽(뒤쪽) 칩을 누른다
    const moonChips = screen.getAllByRole("button", { name: "moon" });
    fireEvent.click(moonChips[moonChips.length - 1]);
    await waitFor(() => expect(searchCalls().some((url) => url.includes("provider=nasa") && url.includes("q=moon"))).toBe(true), { timeout: 10000 });
  });

  it("featured가 없는 제공처는 검색 전에 검색 요청을 보내지 않고 기존 안내를 유지한다", async () => {
    mount("musicbrainz");
    expect(await screen.findByText(/추천 키워드로 바로 검색해 보세요/u, undefined, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByText(/외부 API는 검색할 때만 호출합니다/u)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "검색 전에 둘러보기" })).toBeNull();
    expect(searchCalls()).toHaveLength(0);
  });
});
