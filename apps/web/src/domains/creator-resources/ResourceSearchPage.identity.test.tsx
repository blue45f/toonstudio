// @vitest-environment jsdom
/**
 * 리서치 소스 정체성 키트 렌더 계약 (디자인 웨이브 3 · R5).
 *
 * 계약: 같은 템플릿(ResourceSearchPage)이라도 첫 화면에서 소스가 읽힌다 —
 * 소스 칩·한 줄 정체성·대표 비주얼(아트 또는 타이포그래픽 표지)이 마스트헤드에
 * 붙고, 같은 제공처는 어느 경로(/research/* · /research/open-data/*)에
 * 실려도 같은 얼굴을 한다. 검색 폼·추천 키워드 같은 기존 기능은 그대로다.
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
  // 큐레이션·검색 모두 미설정으로 떨어뜨려 마스트헤드만으로 판정한다.
  return Promise.resolve(Response.json({
    provider, page: 1, status: "not_configured", items: [], hasMore: false,
    message: "API 연결 대기", fetchedAt: "2026-10-07T00:00:00.000Z",
  }));
}

const mount = (provider: ResourceSearchProvider, path: string) =>
  render(<MemoryRouter initialEntries={[path]}><ResourceSearchPage provider={provider} /></MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
  request.mockReset().mockImplementation(routeFetch);
  vi.stubGlobal("fetch", request);
  vi.stubGlobal("navigator", Object.assign(Object.create(navigator), {
    locks: { request: async (_key: string, _options: unknown, operation: () => unknown) => operation() },
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("소스 정체성 마스트헤드", () => {
  it("NASA는 우주 장면 표지·칩·한 줄 정체성을 단다", () => {
    const { container } = mount("nasa", "/research/space-assets");
    const section = container.querySelector(".research-source--nasa");
    expect(section).toBeTruthy();
    // 칩·태그라인: 소스 이름과 한 줄 정체성이 제목 아래에 읽힌다.
    expect(screen.getByText(/NASA가 공개한 행성·성운·우주선 이미지 자료실입니다/u)).toBeTruthy();
    // 장면 표지 — 소스 성격(행성·성운·우주선)이 읽히는 실물 아트가 마스트헤드에 실린다.
    const art = container.querySelector<HTMLImageElement>(".resource-masthead img");
    expect(art?.getAttribute("src")).toBe("/brand/research-sources-20261008/nasa.webp");
    expect(art?.getAttribute("alt")).toBe("");
    expect(container.querySelector(".resource-source-cover")).toBeNull();
    // 기존 기능: 페이지 제목과 검색 폼·추천 키워드는 그대로다.
    expect(screen.getByRole("heading", { name: "NASA 우주·과학 레퍼런스" })).toBeTruthy();
    expect(screen.getByText("NASA Images · 우주·과학 이미지 검색")).toBeTruthy();
    expect(screen.getByRole("button", { name: "nebula" })).toBeTruthy();
  });

  it("같은 제공처는 오픈데이터 경로에 실려도 같은 얼굴이다", () => {
    const { container } = mount("nasa", "/research/open-data/nasa");
    expect(container.querySelector(".research-source--nasa")).toBeTruthy();
    expect(container.querySelector<HTMLImageElement>(".resource-masthead img")?.getAttribute("src")).toBe("/brand/research-sources-20261008/nasa.webp");
    expect(screen.getByText(/NASA가 공개한 행성·성운·우주선 이미지 자료실입니다/u)).toBeTruthy();
  });

  it("ambientCG는 맞는 기존 일러스트(소재 정물)를 대표 비주얼로 쓴다", () => {
    const { container } = mount("ambientcg", "/research/material-assets");
    expect(container.querySelector(".research-source--ambientcg")).toBeTruthy();
    const art = container.querySelector<HTMLImageElement>(".resource-masthead img");
    expect(art?.getAttribute("src")).toBe("/brand/illustrated-20260928/materials.webp");
    expect(art?.getAttribute("alt")).toBe("");
    expect(container.querySelector(".resource-source-cover")).toBeNull();
    expect(screen.getByText(/CC0 PBR 재질과 3D 소재를 공개하는 라이브러리입니다/u)).toBeTruthy();
  });

  it("GBIF는 생물 표본 장면 표지를 대표 비주얼로 쓴다", () => {
    const { container } = mount("gbif", "/research/creatures");
    expect(container.querySelector(".research-source--gbif")).toBeTruthy();
    const art = container.querySelector<HTMLImageElement>(".resource-masthead img");
    expect(art?.getAttribute("src")).toBe("/brand/research-sources-20261008/gbif.webp");
    expect(container.querySelector(".resource-source-cover")).toBeNull();
    expect(screen.getByText(/전 세계 생물종 관찰 기록과 사진으로 크리처의 근거를 찾습니다/u)).toBeTruthy();
  });
});
