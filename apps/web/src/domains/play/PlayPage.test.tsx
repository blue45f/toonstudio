// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PlayPage } from "./PlayPage";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("PlayPage (GAP-R4-05 Round 5 filter chip touch target & group role accessibility)", () => {
  it("콘텐츠 분류 필터 바(.play-filter-tabs)에 role='group', aria-label='콘텐츠 분류', 8px 간격, 44px 터치 타깃 및 긴 한국어 줄바꿈 보호를 적용한다", () => {
    render(
      <MemoryRouter initialEntries={["/play"]}>
        <PlayPage />
      </MemoryRouter>,
    );

    const filterGroup = screen.getByRole("group", { name: "콘텐츠 분류" });
    expect(filterGroup).toBeTruthy();
    expect(filterGroup.getAttribute("data-testid")).toBe("play-filter-tabs");
    expect(filterGroup.style.gap).toBe("8px");

    const chips = within(filterGroup).getAllByRole("button");
    expect(chips).toHaveLength(6);

    for (const chip of chips) {
      expect(chip.className).toContain("min-h-11");
      expect(chip.className).toContain("min-w-11");
      expect(chip.className).toContain("focus-visible:outline");
      expect(chip.className).toContain("[overflow-wrap:anywhere]");
      expect(chip.style.minHeight).toBe("44px");
      expect(chip.style.minWidth).toBe("44px");
    }

    const searchBox = screen.getByRole("searchbox");
    expect(searchBox.style.minHeight).toBe("44px");
  });

  it("분류 필터 칩 클릭 시 aria-pressed·data-state 선택 상태와 필터링 결과가 즉시 반영된다", () => {
    render(
      <MemoryRouter initialEntries={["/play"]}>
        <PlayPage />
      </MemoryRouter>,
    );

    const allChip = screen.getByTestId("play-filter-chip-all");
    const drawChip = screen.getByTestId("play-filter-chip-draw");
    const favoritesChip = screen.getByTestId("play-filter-chip-favorites");

    expect(allChip.getAttribute("aria-pressed")).toBe("true");
    expect(allChip.getAttribute("data-state")).toBe("active");
    expect(drawChip.getAttribute("aria-pressed")).toBe("false");
    expect(drawChip.getAttribute("data-state")).toBe("inactive");

    fireEvent.click(drawChip);
    expect(drawChip.getAttribute("aria-pressed")).toBe("true");
    expect(drawChip.getAttribute("data-state")).toBe("active");
    expect(allChip.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(favoritesChip);
    expect(favoritesChip.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/좋아하는 콘텐츠를 모아 보세요|No favorite items yet/i)).toBeTruthy();
  });

  it("콘텐츠 분류 필터 그룹 내에서 키보드 화살표(ArrowRight/ArrowLeft/Home/End)로 칩 포커스가 순환 이동한다", () => {
    render(
      <MemoryRouter initialEntries={["/play"]}>
        <PlayPage />
      </MemoryRouter>,
    );

    const allChip = screen.getByTestId("play-filter-chip-all");
    const drawChip = screen.getByTestId("play-filter-chip-draw");
    const favoritesChip = screen.getByTestId("play-filter-chip-favorites");

    allChip.focus();
    expect(document.activeElement).toBe(allChip);

    fireEvent.keyDown(allChip, { key: "ArrowRight" });
    expect(document.activeElement).toBe(drawChip);

    fireEvent.keyDown(drawChip, { key: "End" });
    expect(document.activeElement).toBe(favoritesChip);

    fireEvent.keyDown(favoritesChip, { key: "ArrowRight" });
    expect(document.activeElement).toBe(allChip);

    fireEvent.keyDown(allChip, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(favoritesChip);

    fireEvent.keyDown(favoritesChip, { key: "Home" });
    expect(document.activeElement).toBe(allChip);
  });

  it("긴 한국어 검색어 입력 시 레이아웃 오류 없이 빈 상태 및 전체 복구 동선이 동작한다", () => {
    render(
      <MemoryRouter initialEntries={["/play"]}>
        <PlayPage />
      </MemoryRouter>,
    );

    const searchBox = screen.getByRole("searchbox");
    fireEvent.change(searchBox, {
      target: { value: "초장문한국어검색어_존재하지않는창작놀이터미니게임카테고리테스트" },
    });

    const resetBtn = screen.getByRole("button", { name: "전체 콘텐츠 보기" });
    expect(resetBtn).toBeTruthy();
    fireEvent.click(resetBtn);
    expect(screen.getByTestId("play-filter-chip-all").getAttribute("aria-pressed")).toBe("true");
  });
});
