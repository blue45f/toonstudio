// @vitest-environment jsdom
/**
 * 공개 데이터 상세 무대 전파 계약 (디자인 웨이브 15 파일럿 → 웨이브 16 전파 → 웨이브 17 완결).
 *
 * 계약: 장면(scene) 아트를 보유한 제공처는 /research/open-data/* 상세 래퍼
 * (OpenData<Provider>Page)로 실려 마스트헤드 대신 제공처 장면 무대를 첫 화면으로
 * 쓴다 — 제목·정체성·소개·접근 방식이 무대 안에 종속된다. 웨이브 17에서 마지막
 * 2곳(ambientcg·neis)의 전용 장면이 제작·배정돼 이 계약은 상세 14곳 전부로
 * 닫혔다. 같은 제공처의 별칭 경로는 기본 래퍼를 써서 무변경이다(정체성 키트
 * 테스트가 기본 얼굴을 고정한다). 검색 폼 같은 본문 기능은 무대 아래에서
 * 그대로 동작한다.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AmbientCgPage,
  OpenDataAmbientCgPage,
  OpenDataDplaPage,
  OpenDataEuropeanaPage,
  OpenDataGbifPage,
  OpenDataInternetArchivePage,
  OpenDataKheritagePage,
  OpenDataKoreanPage,
  OpenDataMusicBrainzPage,
  OpenDataNasaPage,
  OpenDataNeisPage,
  OpenDataSmithsonianPage,
  OpenDataTourApiPage,
  OpenDataVamPage,
  OpenDataWikimediaPage,
  ResourceSearchPage,
} from "./ResourceSearchPage";

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

describe("공개 데이터 상세 무대 파일럿 (웨이브 15 — 전파 후에도 유지)", () => {
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

describe("공개 데이터 상세 무대 전파 (웨이브 16)", () => {
  // 장면 보유 제공처 10곳 — 상세 래퍼가 파일럿과 같은 문법으로 무대를 쓴다.
  const rolloutCases = [
    { provider: "vam", page: <OpenDataVamPage />, path: "/research/open-data/vam", title: "V&A 패션·디자인 자료실", scene: "vam", keyless: true },
    { provider: "musicbrainz", page: <OpenDataMusicBrainzPage />, path: "/research/open-data/musicbrainz", title: "음악가·BGM 메타데이터", scene: "musicbrainz", keyless: true },
    { provider: "internetarchive", page: <OpenDataInternetArchivePage />, path: "/research/open-data/internetarchive", title: "역사 자료 아카이브", scene: "internetarchive", keyless: true },
    { provider: "smithsonian", page: <OpenDataSmithsonianPage />, path: "/research/open-data/smithsonian", title: "Smithsonian 문화유산 검색", scene: "smithsonian", keyless: false },
    { provider: "europeana", page: <OpenDataEuropeanaPage />, path: "/research/open-data/europeana", title: "Europeana 문화유산 통합검색", scene: "europeana", keyless: false },
    { provider: "dpla", page: <OpenDataDplaPage />, path: "/research/open-data/dpla", title: "DPLA 역사 자료 통합검색", scene: "dpla", keyless: false },
    { provider: "kheritage", page: <OpenDataKheritagePage />, path: "/research/open-data/kheritage", title: "국가유산 고증 검색", scene: "kheritage", keyless: true },
    { provider: "tourapi", page: <OpenDataTourApiPage />, path: "/research/open-data/tourapi", title: "한국 장소 장면 설계", scene: "tourapi", keyless: false },
    { provider: "korean", page: <OpenDataKoreanPage />, path: "/research/open-data/korean", title: "한국어 대사·말투 연구", scene: "korean", keyless: false },
    { provider: "wikimedia", page: <OpenDataWikimediaPage />, path: "/research/open-data/wikimedia", title: "백과 조회 관심 신호", scene: "wikimedia", keyless: true },
  ] as const;

  it.each(rolloutCases)("$provider 상세는 장면 무대가 마스트헤드를 대신하고 제목이 무대에 종속된다", ({ page, path, title, scene, keyless }) => {
    const { container } = render(<MemoryRouter initialEntries={[path]}>{page}</MemoryRouter>);
    expect(container.querySelector(".resource-masthead")).toBeNull();
    const stage = screen.getByRole("region", { name: "공개 데이터 제공처 소개" });
    expect(stage.querySelector<HTMLImageElement>("img")?.getAttribute("src")).toBe(`/brand/research-sources-20261008/${scene}.webp`);
    expect(stage.contains(screen.getByRole("heading", { name: title }))).toBe(true);
    expect(stage.textContent).toContain(keyless ? "가입·키 없이 즉시 검색" : "무료 서버 키 연결형");
    expect(stage.querySelector('a[href="/research/open-data"]')).toBeTruthy();
  });

});

describe("공개 데이터 상세 무대 완결 (웨이브 17 — 전용 장면 제작으로 마지막 2곳 합류)", () => {
  it("ambientCG 상세는 전용 장면 무대가 마스트헤드를 대신하고 제목이 무대에 종속된다", () => {
    const { container } = render(<MemoryRouter initialEntries={["/research/open-data/ambientcg"]}><OpenDataAmbientCgPage /></MemoryRouter>);
    expect(container.querySelector(".resource-masthead")).toBeNull();
    const stage = screen.getByRole("region", { name: "공개 데이터 제공처 소개" });
    expect(stage.querySelector<HTMLImageElement>("img")?.getAttribute("src")).toBe("/brand/research-sources-20261008/ambientcg.webp");
    expect(stage.contains(screen.getByRole("heading", { name: "CC0 PBR·3D 소재 검색" }))).toBe(true);
    expect(stage.textContent).toContain("CC0 PBR 재질과 3D 소재를 공개하는 라이브러리입니다");
    expect(stage.textContent).toContain("가입·키 없이 즉시 검색");
    expect(stage.querySelector('a[href="/research/open-data"]')).toBeTruthy();
  });

  it("NEIS 상세는 전용 장면 무대가 마스트헤드를 대신하고 제목이 무대에 종속된다", () => {
    const { container } = render(<MemoryRouter initialEntries={["/research/open-data/neis"]}><OpenDataNeisPage /></MemoryRouter>);
    expect(container.querySelector(".resource-masthead")).toBeNull();
    const stage = screen.getByRole("region", { name: "공개 데이터 제공처 소개" });
    expect(stage.querySelector<HTMLImageElement>("img")?.getAttribute("src")).toBe("/brand/research-sources-20261008/neis.webp");
    expect(stage.contains(screen.getByRole("heading", { name: "학교물 배경 설정" }))).toBe(true);
    expect(stage.textContent).toContain("전국 학교의 기본정보를 모은 교육 행정 데이터입니다");
    expect(stage.textContent).toContain("무료 서버 키 연결형");
    expect(stage.querySelector('a[href="/research/open-data"]')).toBeTruthy();
  });

  it("같은 제공처의 별칭 경로는 무대 없이 기존 마스트헤드를 유지한다", () => {
    const { container } = render(<MemoryRouter initialEntries={["/research/material-assets"]}><AmbientCgPage /></MemoryRouter>);
    expect(container.querySelector(".resource-masthead")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "공개 데이터 제공처 소개" })).toBeNull();
  });
});
