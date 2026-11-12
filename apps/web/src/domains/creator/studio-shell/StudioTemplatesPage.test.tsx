// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { StudioTemplatesPage } from "./StudioTemplatesPage";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("StudioTemplatesPage", () => {
  it("검색 결과가 없으면 이전 선택의 시작 행동을 숨기고 초기화로 복구한다", () => {
    render(<MemoryRouter><StudioTemplatesPage /></MemoryRouter>);
    const search = screen.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "일치하지않는템플릿검색어" } });

    expect(screen.getByRole("heading", { name: /조건에 맞는 템플릿이 없어요|No matching templates/u })).toBeTruthy();
    expect(screen.queryByRole("complementary", { name: /선택한 템플릿 구성|Selected template structure/u })).toBeNull();
    expect(screen.queryByRole("link", { name: /이 템플릿으로 시작|Start with this template/u })).toBeNull();
    expect(search).toHaveProperty("value", "일치하지않는템플릿검색어");

    fireEvent.click(screen.getByRole("button", { name: /전체 템플릿 보기|Show all templates/u }));
    expect(search).toHaveProperty("value", "");
    const preview = screen.getByRole("complementary", { name: /선택한 템플릿 구성|Selected template structure/u });
    expect(within(preview).getByRole("link", { name: /이 템플릿으로 시작|Start with this template/u }).getAttribute("href"))
      .toContain("template=webtoon-vertical-episode");
  });

  it("빈 즐겨찾기에는 시작 행동이 없고 검색 결과를 바꾸면 일치하는 구성만 표시한다", () => {
    render(<MemoryRouter><StudioTemplatesPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /^즐겨찾기$|^Favorites$/u }));
    expect(screen.queryByRole("complementary", { name: /선택한 템플릿 구성|Selected template structure/u })).toBeNull();
    expect(screen.queryByRole("link", { name: /이 템플릿으로 시작|Start with this template/u })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /전체 템플릿 보기|Show all templates/u }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "피칭" } });
    const preview = screen.getByRole("complementary", { name: /선택한 템플릿 구성|Selected template structure/u });
    expect(within(preview).getByRole("heading", { name: /웹툰 피칭 자료|Webtoon pitch deck/u })).toBeTruthy();
    expect(within(preview).getByRole("link", { name: /이 템플릿으로 시작|Start with this template/u }).getAttribute("href"))
      .toContain("template=presentation-webtoon-pitch");
  });

  it("searches the canonical catalog and keeps one clear start action", () => {
    render(
      <MemoryRouter>
        <StudioTemplatesPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /무엇을 만들지 고르세요|Choose what you want to make/u })).toBeTruthy();
    const search = screen.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "피칭" } });

    expect(screen.getAllByText(/웹툰 피칭 자료|Webtoon pitch deck/u).length).toBeGreaterThan(0);
    expect(screen.queryByText(/4컷·컷툰/u)).toBeNull();
    // 카드 주 행동과 상세 패널 모두 "이 템플릿으로 시작"이다 — 시작 링크가 여럿이어도 전부 같은 핸드오프로 간다.
    const startLinks = screen.getAllByRole("link", { name: /이 템플릿으로 시작|Start with this template/u });
    expect(startLinks.length).toBeGreaterThan(0);
    expect(startLinks.some((link) => (link.getAttribute("href") ?? "").includes("template=presentation-webtoon-pitch"))).toBe(true);
  });

  it("is a lane of the /create gateway: back link, blank-canvas first card, per-card start action", () => {
    render(
      <MemoryRouter>
        <StudioTemplatesPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /작품 시작하기로 돌아가기|Back to start a work/u }).getAttribute("href")).toBe("/create");
    expect(screen.getByRole("link", { name: /빈 캔버스로 시작|Start blank/u }).getAttribute("href")).toBe("/studio/new");
    // 필터가 없을 때 카드마다 시작 링크가 있고, href가 그 카드의 템플릿을 가리킨다.
    const cardStartLinks = screen.getAllByRole("link", { name: /이 템플릿으로 시작|Start with this template/u });
    expect(cardStartLinks.length).toBeGreaterThan(1);
    expect(cardStartLinks.some((link) => (link.getAttribute("href") ?? "").includes("template=webtoon-vertical-episode"))).toBe(true);
  });

  it("persists favorites without creating another template library", () => {
    render(
      <MemoryRouter>
        <StudioTemplatesPage />
      </MemoryRouter>,
    );

    const favoriteButtons = screen.getAllByRole("button", { name: /즐겨찾기 전환|Toggle favorite/u });
    fireEvent.click(favoriteButtons[0]!);
    expect(window.localStorage.getItem("toonspectrum:studio-template-favorites:v1"))
      .toContain("webtoon-vertical-episode");

    fireEvent.click(screen.getByRole("button", { name: /^즐겨찾기$|^Favorites$/u }));
    expect(screen.getAllByText(/세로 웹툰 기본 원고|Vertical webtoon episode/u).length).toBeGreaterThan(0);
  });

  it("filters by spec/purpose presets and displays pre-configured layer stack summary badges", () => {
    render(
      <MemoryRouter>
        <StudioTemplatesPage />
      </MemoryRouter>,
    );

    expect(
      screen.getAllByText(/콘티 \+ 선화 \+ 밑색 \+ 말풍선 레이어 기본 포함|Includes storyboard \+ line \+ flat color \+ balloon layers/u).length,
    ).toBeGreaterThan(0);

    const scrollBtn = screen.getByRole("button", { name: /세로 스크롤 웹툰 \(800px\)|Vertical webtoon \(800px\)/u });
    fireEvent.click(scrollBtn);
    expect(scrollBtn.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByText(/세로 웹툰 기본 원고|Vertical webtoon episode/u).length).toBeGreaterThan(0);

    const shortformBtn = screen.getByRole("button", { name: /인스타툰·숏폼 \(1:1\)|Instatoon & short-form \(1:1\)/u });
    fireEvent.click(shortformBtn);
    expect(shortformBtn.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByText(/4컷·컷툰|Four-panel comic/u).length).toBeGreaterThan(0);
  });

  it("exposes role=group with aria-label, 44px touch targets (min-h-11), and focus-visible rings on template category filters and spec presets (GAP-R6-03)", () => {
    render(
      <MemoryRouter>
        <StudioTemplatesPage />
      </MemoryRouter>,
    );

    const categoryGroup = screen.getByRole("group", {
      name: /템플릿 카테고리 필터|Template category filter/u,
    });
    expect(categoryGroup).toBeTruthy();

    const categoryButtons = Array.from(categoryGroup.querySelectorAll("button"));
    expect(categoryButtons.length).toBeGreaterThanOrEqual(7);
    for (const btn of categoryButtons) {
      expect(btn.className).toContain("min-h-11");
      expect(btn.style.minHeight).toBe("44px");
      expect(btn.className).toContain("focus-visible:outline");
      expect(["true", "false"]).toContain(btn.getAttribute("aria-pressed"));
    }

    const webtoonCatBtn = screen.getByRole("button", { name: /^웹툰$|^Webtoon$/u });
    fireEvent.click(webtoonCatBtn);
    expect(webtoonCatBtn.getAttribute("aria-pressed")).toBe("true");

    const specGroup = screen.getByRole("group", {
      name: /규격·목적별 빠른 필터|Quick filters by spec and purpose/u,
    });
    expect(specGroup).toBeTruthy();

    const specButtons = Array.from(
      specGroup.querySelectorAll<HTMLButtonElement>("button[data-template-spec-preset]"),
    );
    expect(specButtons.length).toBe(5);
    for (const btn of specButtons) {
      expect(btn.className).toContain("min-h-11");
      expect(btn.style.minHeight).toBe("44px");
      expect(btn.className).toContain("focus-visible:outline");
      expect(["true", "false"]).toContain(btn.getAttribute("aria-pressed"));
    }
  });
});

