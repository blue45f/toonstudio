// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  it("searches the canonical catalog and keeps one clear start action", () => {
    render(
      <MemoryRouter>
        <StudioTemplatesPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /무엇을 만들지만 고르세요|Choose what you want to make/u })).toBeTruthy();
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
});
