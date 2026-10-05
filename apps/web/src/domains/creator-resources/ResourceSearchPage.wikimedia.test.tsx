// @vitest-environment jsdom
/**
 * S4-09 WikimediaInterestPage 통합 테스트.
 *
 * 계약: 검색 결과에 일별 시계열(dailyViews)이 실리면 카드 그리드 대신 조회 추이
 * 대시보드가 본체가 되고, 검색 전에는 기본 주제의 실제 추이를 먼저 보여준다.
 * API가 닿지 않거나 시계열이 없으면 위장하지 않는다 — 검색 전은 정직한 빈 상태로,
 * 검색 결과는 기존 카드로 각각 폴백한다.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WikimediaInterestPage } from "./ResourceSearchPage";

const request = vi.fn<typeof fetch>();

function wikimediaItem(title: string, dailyViews?: { date: string; views: number }[]) {
  return {
    id: `wikimedia:${encodeURIComponent(title)}`,
    provider: "wikimedia",
    title: `${title} · 최근 30일 백과 조회`,
    creator: "",
    description: "집계 설명",
    sourceUrl: `https://ko.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    license: "metadata-only",
    credit: "Wikimedia Pageviews API · ko.wikipedia",
    fetchedAt: "2026-10-05T00:00:00.000Z",
    dateLabel: "2026-09-01–2026-09-04",
    ...(dailyViews ? { dailyViews } : {}),
  };
}

const SERIES = [
  { date: "2026-09-01", views: 100 },
  { date: "2026-09-02", views: 200 },
  { date: "2026-09-03", views: 150 },
  { date: "2026-09-04", views: 250 },
];

function searchResponse(title: string, dailyViews?: { date: string; views: number }[]) {
  return Response.json({
    provider: "wikimedia",
    page: 1,
    status: "ready",
    items: [wikimediaItem(title, dailyViews)],
    hasMore: false,
    message: "한국어 위키백과 문서의 최근 30일 조회 추이입니다.",
    fetchedAt: "2026-10-05T00:00:00.000Z",
    total: 1,
  });
}

let failSearch = false;
let omitSeries = false;

function routeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  if (url.includes("/api/creator-resources/providers")) return Promise.resolve(Response.json([]));
  const parsed = new URL(url, "https://local.test");
  if (parsed.pathname.endsWith("/api/creator-resources/search")) {
    if (failSearch) return Promise.resolve(new Response("upstream error", { status: 500 }));
    const q = parsed.searchParams.get("q") ?? "";
    return Promise.resolve(searchResponse(q || "경복궁", omitSeries ? undefined : SERIES));
  }
  return Promise.resolve(Response.json({}));
}

function searchCalls(): string[] {
  return request.mock.calls.map((call) => String(call[0])).filter((url) => url.includes("/api/creator-resources/search"));
}

const mount = (entry: string) =>
  render(<MemoryRouter initialEntries={[entry]}><WikimediaInterestPage /></MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
  failSearch = false;
  omitSeries = false;
  request.mockReset().mockImplementation(routeFetch);
  vi.stubGlobal("fetch", request);
  vi.stubGlobal("navigator", Object.assign(Object.create(navigator), {
    locks: { request: async (_key: string, _options: unknown, operation: () => unknown) => operation() },
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("WikimediaInterestPage 대시보드 (S4-09)", () => {
  it("검색 전에는 기본 주제의 실제 추이 대시보드를 주인공으로 보여준다", async () => {
    mount("/research/open-data/wikimedia");
    expect(await screen.findByRole("img", { name: /일별 조회수 추이/u }, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByText(/기본 주제/u)).toBeTruthy();
    expect(screen.getByText("700")).toBeTruthy();
    expect(searchCalls().some((url) => url.includes("provider=wikimedia"))).toBe(true);
  });

  it("검색하면 그 문서의 추이 대시보드가 본체가 된다", async () => {
    mount("/research/open-data/wikimedia?q=웹툰");
    expect(await screen.findByRole("img", { name: /일별 조회수 추이/u }, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /웹툰 · 최근 30일 백과 조회/u })).toBeTruthy();
    expect(screen.queryByText(/기본 주제/u)).toBeNull();
  });

  it("API가 닿지 않으면 대시보드를 위장하지 않고 정직한 빈 상태로 떨어진다", async () => {
    failSearch = true;
    mount("/research/open-data/wikimedia");
    expect(await screen.findByText(/추천 키워드로 바로 검색해 보세요/u, undefined, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByRole("img", { name: /일별 조회수 추이/u })).toBeNull();
  });

  it("시계열이 없는 응답이면 기존 카드로 폴백한다", async () => {
    omitSeries = true;
    mount("/research/open-data/wikimedia?q=웹툰");
    expect(await screen.findByRole("heading", { name: /웹툰 · 최근 30일 백과 조회/u }, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByRole("img", { name: /일별 조회수 추이/u })).toBeNull();
  });
});
