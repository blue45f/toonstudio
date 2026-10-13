// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createStudioProject,
  readStudioProjectLibrary,
  STUDIO_PROJECT_LIBRARY_STORAGE_KEY,
} from "./studio-project-library-store";
import { CreateStartPage } from "./CreateStartPage";

import { useI18n } from "@/shared/lib/i18n";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderStartSheet(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <CreateStartPage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

/** 두 작품을 만들고 연 시각을 고정해 최근 순서를 결정적으로 만든다. */
function seedTwoProjects() {
  createStudioProject(window.localStorage, { id: "older", title: "오래된 작품", kind: "webtoon" });
  createStudioProject(window.localStorage, { id: "newer", title: "최근 작품", kind: "webtoon" });
  const state = readStudioProjectLibrary(window.localStorage);
  const next = {
    ...state,
    projects: state.projects.map((project) => ({
      ...project,
      lastOpenedAt: project.id === "newer" ? "2026-10-05T00:00:00.000Z" : "2026-10-01T00:00:00.000Z",
    })),
  };
  window.localStorage.setItem(STUDIO_PROJECT_LIBRARY_STORAGE_KEY, JSON.stringify(next));
}

beforeEach(() => {
  window.localStorage.clear();
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
});

describe("CreateStartPage (작품 시작 시트)", () => {
  it("새 작품·템플릿·이어가기 세 가지 시작을 한 화면에서 고르게 한다", () => {
    renderStartSheet("/create");

    expect(screen.getByRole("heading", { name: "작품 시작하기" })).toBeTruthy();
    // 새 작품 링크는 시작 카드와 이어가기 빈 상태 두 곳에 있을 수 있다 — 전부 같은 정문을 가리킨다.
    const newWorkLinks = screen.getAllByRole("link", { name: /새 작품 만들기/ });
    expect(newWorkLinks.length).toBeGreaterThan(0);
    expect(newWorkLinks.every((link) => link.getAttribute("href") === "/studio/new")).toBe(true);
    expect(screen.getByRole("link", { name: /템플릿으로 시작하기/ }).getAttribute("href")).toBe("/studio/templates");
    // 콘티 시작점은 작품 생성 화면의 시작점 선택으로 이어진다.
    expect(screen.getByRole("link", { name: /콘티부터 시작하기/ }).getAttribute("href")).toBe("/studio/new?start=storyboard");
    // 이야기 시작점은 작품 생성 화면의 시작점 선택(아이디어)으로 이어지고, 생성 뒤 기획 섹션에 착지한다.
    expect(screen.getByRole("link", { name: /이야기부터 시작하기/ }).getAttribute("href")).toBe("/studio/new?start=idea");
    expect(screen.getByRole("heading", { name: "이어서 작업하기" })).toBeTruthy();
  });

  it("최근 작품이 없으면 비어 있음을 알리고 새 작품 만들기로 먼저 안내한다", () => {
    renderStartSheet("/create");

    expect(screen.getByText(/아직 작업한 작품이 없어요/)).toBeTruthy();
    // 빈 상태의 주 행동은 첫 작품 만들기다. 둘러보기는 보조로 남는다.
    const continueCard = screen.getByRole("heading", { name: "이어서 작업하기" }).closest("section");
    expect(continueCard).not.toBeNull();
    const cardLinks = within(continueCard as HTMLElement).getAllByRole("link");
    expect(cardLinks[0]?.getAttribute("href")).toBe("/studio/new");
    expect(screen.getByRole("link", { name: /작업실 둘러보기/ }).getAttribute("href")).toBe("/studio");
    expect(screen.queryByRole("link", { name: /모든 작품 보기/ })).toBeNull();
    // 게스트에게는 저장 범위를 정직하게 알린다.
    expect(screen.getByText(/지금은 이 기기에만 저장돼요/)).toBeTruthy();
  });

  it("최근 작품은 최근에 연 순서로 작품 화면 링크와 함께 보여 준다", () => {
    seedTwoProjects();
    renderStartSheet("/create");

    const newer = screen.getByRole("link", { name: /최근 작품 이어서 작업/ });
    const older = screen.getByRole("link", { name: /오래된 작품 이어서 작업/ });
    expect(newer.getAttribute("href")).toContain("/studio/p/newer");
    expect(older.getAttribute("href")).toContain("/studio/p/older");
    expect(
      newer.compareDocumentPosition(older) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /모든 작품 보기/ }).getAttribute("href")).toBe("/studio");
  });

  it("최근 작품에 기록된 썸네일이 있으면 표지로 보여 주고, 없으면 제목 첫 글자로 돌아간다", () => {
    createStudioProject(window.localStorage, { id: "with-thumb", title: "표지 있는 작품", kind: "webtoon" });
    createStudioProject(window.localStorage, { id: "no-thumb", title: "표지 없는 작품", kind: "webtoon" });
    const state = readStudioProjectLibrary(window.localStorage);
    const next = {
      ...state,
      projects: state.projects.map((project) => ({
        ...project,
        thumbnailUrl: project.id === "with-thumb" ? "https://example.test/cover.webp" : null,
        lastOpenedAt: project.id === "with-thumb" ? "2026-10-05T00:00:00.000Z" : "2026-10-01T00:00:00.000Z",
      })),
    };
    window.localStorage.setItem(STUDIO_PROJECT_LIBRARY_STORAGE_KEY, JSON.stringify(next));
    renderStartSheet("/create");

    const withThumb = screen.getByRole("link", { name: /표지 있는 작품 이어서 작업/ });
    expect(withThumb.querySelector("img")?.getAttribute("src")).toBe("https://example.test/cover.webp");
    const noThumb = screen.getByRole("link", { name: /표지 없는 작품 이어서 작업/ });
    expect(noThumb.querySelector("img")).toBeNull();
    expect(noThumb.textContent).toContain("표");
  });

  it("갤러리는 /showcase와 창작자 갤러리로 안내만 하고 본문을 중복하지 않는다", () => {
    renderStartSheet("/create");

    expect(screen.getByRole("link", { name: /창작 갤러리/ }).getAttribute("href")).toBe("/showcase");
    expect(screen.getByRole("link", { name: /창작자 커리어 갤러리/ }).getAttribute("href")).toBe("/collaborate/gallery");
  });

  it("갤러리 보기 조건을 단 옛 주소는 같은 조건으로 /showcase에 넘긴다", () => {
    renderStartSheet("/create?tab=works&sort=popular&tag=%EC%95%A1%EC%85%98");

    expect(screen.getByTestId("location").textContent).toBe(
      "/showcase?tab=works&sort=popular&tag=%EC%95%A1%EC%85%98",
    );
    expect(screen.queryByRole("heading", { name: "작품 시작하기" })).toBeNull();
  });

  it("갤러리와 무관한 조건만 있으면 시작 시트를 그대로 연다", () => {
    renderStartSheet("/create?from=home");

    expect(screen.getByTestId("location").textContent).toBe("/create?from=home");
    expect(screen.getByRole("heading", { name: "작품 시작하기" })).toBeTruthy();
  });
});
