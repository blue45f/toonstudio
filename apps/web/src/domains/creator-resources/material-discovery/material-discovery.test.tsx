// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import catalogData from "../material-atlas/catalog.json";
import type { MaterialAsset } from "../material-atlas/model";
import { parseMaterialCatalog } from "../material-atlas/model";
import { MaterialAdvantageBanner } from "./MaterialAdvantageBanner";
import { MaterialFilterChips } from "./MaterialFilterChips";
import { MaterialFirstVisitGuide } from "./MaterialFirstVisitGuide";
import { MaterialHomeSpotlight } from "./MaterialHomeSpotlight";
import { MaterialSearchAutocomplete } from "./MaterialSearchAutocomplete";
import { MaterialTrendingCarousel } from "./MaterialTrendingCarousel";
import { buildTrendingMaterials } from "./material-search-ux";

const catalog = parseMaterialCatalog(catalogData);
const assets = catalog ? catalog.assets : [];
const sample: MaterialAsset = assets[0] ?? {
  id: "ambientcg:x",
  provider: "ambientcg",
  sourceId: "x",
  title: "X",
  kind: "texture",
  tags: [],
  authors: [],
  sourceUrl: "https://ambientcg.com/a/x",
  thumbnailUrl: "",
  license: "CC0-1.0",
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("material discovery components", () => {
  it("어드밴티지 배너가 핵심 수치·장점·상업 라이선스 자동 검증·빠른 유형 점프 칩을 보여준다", () => {
    render(<MaterialAdvantageBanner assetCount={141} providerCount={2} />);
    expect(screen.getByRole("heading", { name: /배경·소품 고민은 여기서 끝내세요/ })).toBeTruthy();
    expect(screen.getByRole("list", { name: /핵심 수치/ })).toBeTruthy();
    expect(screen.getByText(/유료 생성 API 없이 바로 쓰는/)).toBeTruthy();
    expect(screen.getByText(/한글 검색 지원/)).toBeTruthy();
    expect(screen.getByText(/클릭 한 번으로 장면 보드에/)).toBeTruthy();
    expect(screen.getByText(/상업 라이선스 자동 검증 · CC0/)).toBeTruthy();

    const jumpGroup = screen.getByRole("group", { name: "빠른 소재 유형 점프" });
    expect(within(jumpGroup).getByRole("link", { name: /3D 배경·소품/ }).getAttribute("href")).toBe(
      "/research/materials?kind=model#material-search",
    );
    expect(within(jumpGroup).getByRole("link", { name: /재질·텍스처/ }).getAttribute("href")).toBe(
      "/research/materials?kind=texture#material-search",
    );
    expect(within(jumpGroup).getByRole("link", { name: /브러시/ }).getAttribute("href")).toBe(
      "/studio/assets/brushes",
    );
    expect(within(jumpGroup).getByRole("link", { name: /포즈/ }).getAttribute("href")).toBe("/studio/poser");
    expect(within(jumpGroup).getByRole("link", { name: /효과음·오디오/ }).getAttribute("href")).toBe(
      "/studio/assets/audio",
    );
  });

  it("어드밴티지 배너에서 인기 키워드·캔버스 적용 가이드 스포트라이트를 토글할 수 있다", () => {
    render(
      <MemoryRouter>
        <MaterialAdvantageBanner assetCount={141} providerCount={2} />
      </MemoryRouter>,
    );
    const toggle = screen.getByRole("button", { name: /인기 키워드 · 캔버스 적용 가이드/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("material-home-spotlight")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("material-home-spotlight")).toBeTruthy();
  });

  it("홈 스포트라이트가 인기 키워드 바로가기·라이선스 안전 배지·캔버스 3단계 안내를 제공한다", () => {
    render(
      <MemoryRouter>
        <MaterialHomeSpotlight locale="ko" />
      </MemoryRouter>,
    );
    const spotlight = screen.getByTestId("material-home-spotlight");
    expect(within(spotlight).getByText("CC0 상업 라이선스 자동 검증")).toBeTruthy();
    expect(within(spotlight).getByText("출처 명세서 원클릭 내보내기")).toBeTruthy();
    expect(within(spotlight).getByText("캔버스 1클릭 즉시 적용")).toBeTruthy();
    expect(within(spotlight).getByText("캔버스 즉시 적용 3단계")).toBeTruthy();

    const woodShortcut = within(spotlight).getByRole("link", { name: "#나무" });
    expect(woodShortcut.getAttribute("href")).toBe(
      `/research/materials?q=${encodeURIComponent("나무")}#material-search`,
    );
    expect(within(spotlight).getByRole("link", { name: /소재 도감 열어보기/ }).getAttribute("href")).toBe(
      "/research/materials",
    );
    expect(within(spotlight).getByRole("link", { name: /스튜디오 캔버스 바로 열기/ }).getAttribute("href")).toBe(
      "/studio/new",
    );
  });

  it("홈 스포트라이트 영문 로케일에서는 한글 누출 없이 순수 영문으로 렌더링한다", () => {
    render(
      <MemoryRouter>
        <MaterialHomeSpotlight locale="en" />
      </MemoryRouter>,
    );
    const spotlight = screen.getByTestId("material-home-spotlight");
    expect(spotlight.textContent).not.toMatch(/[가-힣]/u);
    expect(within(spotlight).getByRole("link", { name: "#wood" }).getAttribute("href")).toBe(
      "/research/materials?q=wood#material-search",
    );
  });

  it("트렌딩 캐러셀이 순위를 매겨 보여주고 선택·가로 스크롤 휠·드래그 방지를 지원한다", () => {
    const onSelect = vi.fn();
    const trending = buildTrendingMaterials(assets, 4);
    render(<MaterialTrendingCarousel assets={trending} onSelect={onSelect} />);
    expect(screen.getByRole("heading", { name: /지금 뜨는 소재/ })).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(trending.length);
    fireEvent.click(within(screen.getAllByRole("listitem")[0]).getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith(trending[0]);
    fireEvent.click(screen.getByRole("button", { name: "다음 트렌딩 소재" }));

    const track = screen.getByRole("list", { name: "트렌딩 소재 목록" });
    expect(track.dataset.hscrollErgonomics).toBe("true");
    const firstImg = track.querySelector("img");
    if (firstImg) {
      expect(firstImg.getAttribute("draggable")).toBe("false");
    }
  });

  it("필터 칩이 HorizontalScrollRail 위에서 제공처·종류를 원클릭으로 바꾼다", () => {
    const onProvider = vi.fn();
    const onKind = vi.fn();
    render(
      <MaterialFilterChips
        provider="all"
        kind="all"
        counts={{ provider: { polyhaven: 10 }, kind: { texture: 20 } }}
        onProvider={onProvider}
        onKind={onKind}
      />,
    );
    const providerGroup = screen.getByRole("group", { name: "제공처" });
    const kindGroup = screen.getByRole("group", { name: "소재 종류" });
    expect(providerGroup.dataset.hscrollErgonomics).toBe("true");
    expect(kindGroup.dataset.hscrollErgonomics).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: /Poly Haven/ }));
    expect(onProvider).toHaveBeenCalledWith("polyhaven");
    fireEvent.click(screen.getByRole("button", { name: /3D 소품/ }));
    expect(onKind).toHaveBeenCalledWith("model");
    expect(screen.getByRole("button", { name: /모든 제공처/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("검색창이 자동완성과 인기·최근 검색어를 제안한다", () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    render(<MaterialSearchAutocomplete value="" assets={assets} onChange={onChange} onSubmitSearch={onSubmit} />);
    const input = screen.getByLabelText("검색어") as HTMLInputElement;
    expect(input.placeholder).toContain("벚꽃 배경");
    fireEvent.focus(input);
    expect(screen.getByRole("listbox", { name: /검색어 제안/ })).toBeTruthy();
    expect(screen.getByText("인기 검색어")).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: /나무/ }));
    expect(onSubmit).toHaveBeenCalledWith("나무");
  });

  it("검색어 입력 시 태그 자동완성을 보여준다", () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    render(<MaterialSearchAutocomplete value="wo" assets={assets} onChange={onChange} onSubmitSearch={onSubmit} />);
    fireEvent.focus(screen.getByLabelText("검색어"));
    expect(screen.getByRole("listbox", { name: /검색어 제안/ })).toBeTruthy();
    expect(screen.getByText("추천 검색어")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("첫 방문 가이드가 한 번만 표시되고 닫힌다", () => {
    vi.useFakeTimers();
    const { rerender } = render(<MaterialFirstVisitGuide />);
    expect(screen.getByRole("note", { name: /첫 방문 안내/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "안내 닫기" }));
    expect(screen.queryByRole("note")).toBeNull();
    rerender(<MaterialFirstVisitGuide />);
    expect(screen.queryByRole("note")).toBeNull();
    vi.useRealTimers();
  });

  it("material-discovery.css가 원시 HEX·transition-all 없이 OKLCH 토큰을 사용한다", () => {
    const css = readFileSync(
      resolve(process.cwd(), "apps/web/src/domains/creator-resources/material-discovery/material-discovery.css"),
      "utf8",
    );
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/gu)).toBeNull();
    expect(css).not.toContain("transition-all");
    expect(css).toContain("oklch(");
  });

  it("샘플 에셋이 유효하다", () => {
    expect(sample.id).toBeTruthy();
  });
});
