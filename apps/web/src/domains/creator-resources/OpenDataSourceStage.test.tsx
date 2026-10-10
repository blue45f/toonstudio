// @vitest-environment jsdom
/**
 * 공개 데이터 상세 무대 파일럿 계약 (디자인 웨이브 15).
 *
 * 계약: 파일럿 래퍼(OpenDataNasaPage·OpenDataGbifPage)로 실린 상세만 마스트헤드
 * 대신 제공처 장면 무대를 첫 화면으로 쓴다 — 제목·정체성·소개·접근 방식이
 * 무대 안에 종속되고, 같은 제공처의 기본 래퍼는 기존 마스트헤드 그대로다
 * (정체성 키트 테스트가 기본 얼굴을 고정한다). 검색 폼 같은 본문 기능은 무대
 * 아래에서 그대로 동작한다.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OpenDataGbifPage, OpenDataNasaPage, ResourceSearchPage } from "./ResourceSearchPage";

const request = vi.fn<typeof fetch>();

function routeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  if (url.includes("/api/creator-resources/providers")) return Promise.resolve(Response.json([]));
  const parsed = new URL(url, "https://local.test");
  const provider = parsed.searchParams.get("provider") ?? "";
  return Promise.resolve(Response.json({
    provider, page: 1, status: "not_configured", items: [], hasMore: false,
    message: "API 연결 대기", fetchedAt: "2026-10-10T00:00:00.000Z",
  }));
}

beforeEach(() => {
  localStorage.clear();
  request.mockReset().mockImplementation(routeFetch);
  vi.stubGlobal("fetch", request);
  vi.stubGlobal("navigator", Object.assign(Object.create(navigator), {
    locks: { request: async (_key: string, _options: unknown, operation: () => unknown) => operation() },
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("공개 데이터 상세 무대 파일럿", () => {
  it("NASA 파일럿 상세는 장면 무대가 마스트헤드를 대신하고 카피가 무대에 종속된다", () => {
    const { container } = render(<MemoryRouter initialEntries={["/research/open-data/nasa"]}><OpenDataNasaPage /></MemoryRouter>);
    // 기존 마스트헤드는 그려지지 않고, 무대 섹션이 첫 화면을 이룬다.
    expect(container.querySelector(".resource-masthead")).toBeNull();
    const stage = screen.getByRole("region", { name: "공개 데이터 제공처 소개" });
    // 제공처 실물 장면이 무대 전폭 배경이다.
    const art = stage.querySelector<HTMLImageElement>("img");
    expect(art?.getAttribute("src")).toBe("/brand/research-sources-20261008/nasa.webp");
    // 제목·한 줄 정체성·소개가 무대 안에 있다.
    expect(stage.contains(screen.getByRole("heading", { name: "NASA 우주·과학 레퍼런스" }))).toBe(true);
    expect(stage.textContent).toContain("NASA가 공개한 행성·성운·우주선 이미지 자료실입니다");
    expect(stage.textContent).toContain("가입·키 없이 즉시 검색");
    // 허브로 돌아가는 동선과 공식 사이트 행동이 무대 안에 있다.
    expect(stage.querySelector('a[href="/research/open-data"]')).toBeTruthy();
    expect(screen.getByRole("link", { name: "공식 사이트 열기" }).getAttribute("href")).toBe("https://images.nasa.gov/");
    // 본문 기능(검색 폼·추천 키워드)은 무대 아래 그대로다.
    expect(screen.getByRole("button", { name: "nebula" })).toBeTruthy();
  });

  it("GBIF 파일럿 상세도 같은 문법으로 생물 장면 무대를 쓴다", () => {
    const { container } = render(<MemoryRouter initialEntries={["/research/open-data/gbif"]}><OpenDataGbifPage /></MemoryRouter>);
    expect(container.querySelector(".resource-masthead")).toBeNull();
    const stage = screen.getByRole("region", { name: "공개 데이터 제공처 소개" });
    expect(stage.querySelector<HTMLImageElement>("img")?.getAttribute("src")).toBe("/brand/research-sources-20261008/gbif.webp");
    expect(stage.contains(screen.getByRole("heading", { name: "생물·크리처 디자인 도감" }))).toBe(true);
    expect(stage.textContent).toContain("전 세계 생물종 관찰 기록과 사진으로 크리처의 근거를 찾습니다");
  });

  it("파일럿이 아닌 기본 래퍼는 기존 마스트헤드를 유지한다", () => {
    const { container } = render(<MemoryRouter initialEntries={["/research/open-data/kheritage"]}><ResourceSearchPage provider="kheritage" /></MemoryRouter>);
    expect(container.querySelector(".resource-masthead")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "공개 데이터 제공처 소개" })).toBeNull();
  });
});
