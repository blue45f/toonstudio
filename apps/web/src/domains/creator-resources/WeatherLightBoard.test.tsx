// @vitest-environment jsdom
/**
 * S4-05 날씨·빛 참고판 회귀 테스트.
 *
 * 계약: /research/weather-light(metweather)에서는 검색 상단에 같은 거리 4분할
 * 빛 비교 보드(맑음·흐림·비·노을)가 본체로 놓이고, 보드는 창작 참고용 일러스트임을
 * 명시한다(실시간 날씨·예보로 위장하지 않는다). 보드는 정적이라 검색 전 어떤
 * 검색 요청도 보내지 않으며, 아래 예보 검색의 기존 구성(추천 키워드 빈 상태)은
 * 그대로 유지된다. 다른 제공처에는 보드가 나타나지 않는다.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResourceSearchPage } from "./ResourceSearchPage";

import type { ResourceSearchProvider } from "./resource-search-config";

const request = vi.fn<typeof fetch>();

function routeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  if (url.includes("/api/creator-resources/providers")) return Promise.resolve(Response.json([]));
  const parsed = new URL(url, "https://local.test");
  const provider = parsed.searchParams.get("provider") ?? "";
  return Promise.resolve(Response.json({ provider, page: 1, status: "ready", items: [], hasMore: false, message: "공식 제공처 응답", fetchedAt: "2026-10-06T00:00:00.000Z" }));
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

describe("날씨·빛 참고판 (S4-05)", () => {
  it("같은 거리 4분할(맑음·흐림·비·노을) 아트와 빛 메모를 본체로 보여준다", () => {
    mount("metweather");
    expect(screen.getByRole("heading", { name: "같은 거리, 네 가지 빛" })).toBeTruthy();
    const expected: ReadonlyArray<{ label: string; art: string; note: RegExp }> = [
      { label: "맑음", art: "/assets/studio/backgrounds/webtoon_street_clear.webp", note: /직사광/u },
      { label: "흐림", art: "/assets/studio/backgrounds/webtoon_street_overcast.webp", note: /그림자가 거의 사라집니다/u },
      { label: "비", art: "/assets/studio/backgrounds/webtoon_street_rain.webp", note: /젖은 노면이/u },
      { label: "노을", art: "/assets/studio/backgrounds/webtoon_street.jpg", note: /색온도가 가장 따뜻합니다/u },
    ];
    for (const { label, art, note } of expected) {
      expect(screen.getByText(label, { exact: true })).toBeTruthy();
      const image = document.querySelector(`img[src="${art}"]`);
      expect(image, `${label} 아트`).toBeTruthy();
      expect(image?.getAttribute("alt")).toContain("같은 거리 풍경");
      expect(screen.getByText(note)).toBeTruthy();
    }
  });

  it("실시간 날씨·예보가 아닌 창작 참고용 보드임을 명시한다", () => {
    mount("metweather");
    expect(screen.getByText(/창작 참고용 일러스트 보드입니다/u)).toBeTruthy();
    expect(screen.getByText(/실시간 날씨나 예보 자료가 아니며/u)).toBeTruthy();
  });

  it("보드는 정적이고, 아래 예보 검색의 기존 빈 상태 구성을 그대로 유지한다", async () => {
    mount("metweather");
    expect(await screen.findByText(/추천 키워드로 바로 검색해 보세요/u, undefined, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByText(/외부 API는 검색할 때만 호출합니다/u)).toBeTruthy();
    expect(searchCalls()).toHaveLength(0);
  });

  it("다른 제공처에는 참고판을 만들지 않는다", async () => {
    mount("musicbrainz");
    expect(await screen.findByText(/추천 키워드로 바로 검색해 보세요/u, undefined, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "같은 거리, 네 가지 빛" })).toBeNull();
    expect(document.querySelector('img[src^="/assets/studio/backgrounds/webtoon_street"]')).toBeNull();
  });
});
