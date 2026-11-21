// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  loadSavedMarketBeginnerGoal,
  MARKET_BEGINNER_GOAL_STORAGE_KEY,
  MARKET_BEGINNER_GOALS,
  saveMarketBeginnerGoal,
} from "../models/market-beginner-starter";

import { MarketBeginnerStarterBar } from "./MarketBeginnerStarterBar";

beforeEach(() => {
  window.localStorage.clear();
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  useI18n.setState({ lang: "ko" });
});

describe("MarketBeginnerStarterBar", () => {
  it("초보자 4개 작업 목표 중 하나를 누르면 실제 목표 콜백을 호출하고 안내·CTA를 표시한다", () => {
    const onSelectGoal = vi.fn();
    const onClearGoal = vi.fn();
    const view = render(
      <MemoryRouter>
        <MarketBeginnerStarterBar
          activeGoalId={null}
          matchedCount={12}
          onSelectGoal={onSelectGoal}
          onClearGoal={onClearGoal}
        />
      </MemoryRouter>,
    );

    const group = screen.getByRole("group", { name: "초보자 작업 목표 선택" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons).toHaveLength(4);
    expect(screen.queryByTestId("market-beginner-starter-guide")).toBeNull();

    fireEvent.click(within(group).getByRole("button", { name: "배경 3D 빨리 채우기" }));
    expect(onSelectGoal).toHaveBeenCalledWith(MARKET_BEGINNER_GOALS[0]);

    view.rerender(
      <MemoryRouter>
        <MarketBeginnerStarterBar
          activeGoalId="bg-3d"
          matchedCount={3}
          onSelectGoal={onSelectGoal}
          onClearGoal={onClearGoal}
        />
      </MemoryRouter>,
    );

    const guide = screen.getByTestId("market-beginner-starter-guide");
    expect(guide.textContent).toContain("3개 바로 확인 가능");
    expect(within(guide).getByRole("link", { name: "3D 배경 전체 보기" }).getAttribute("href")).toBe(
      "/market/browse?kind=3d-asset",
    );

    fireEvent.click(screen.getByRole("button", { name: "선택 해제" }));
    expect(onClearGoal).toHaveBeenCalledOnce();
  });

  it("로컬 저장 복원과 초기화를 안전하게 처리한다", () => {
    expect(loadSavedMarketBeginnerGoal()).toBeNull();
    saveMarketBeginnerGoal("safe-free");
    expect(window.localStorage.getItem(MARKET_BEGINNER_GOAL_STORAGE_KEY)).toBe("safe-free");
    expect(loadSavedMarketBeginnerGoal()).toBe("safe-free");
    saveMarketBeginnerGoal(null);
    expect(loadSavedMarketBeginnerGoal()).toBeNull();
  });

  it("영문 로캘에서 한글 누출 없이 렌더링하고 시맨틱 OKLCH 토큰만 사용한다", () => {
    useI18n.setState({ lang: "en" });
    render(
      <MemoryRouter>
        <MarketBeginnerStarterBar
          activeGoalId="fit-test"
          matchedCount={5}
          onSelectGoal={vi.fn()}
          onClearGoal={vi.fn()}
        />
      </MemoryRouter>,
    );

    const bar = screen.getByTestId("market-beginner-starter-bar");
    expect(bar.textContent).not.toMatch(/[가-힣]/u);
    expect(within(bar).getByRole("link", { name: "Open Fit Lab" }).getAttribute("href")).toBe(
      "/market/fit-lab",
    );

    const css = readFileSync(resolve(import.meta.dirname, "market-beginner-starter.css"), "utf8");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(css).not.toMatch(/\brgba?\s*\(/u);
    expect(css).toContain("prefers-reduced-motion: reduce");
  });
});
