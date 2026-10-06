// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { RECIPES } from "./recipes";
import { RecipesPage } from "./RecipesPage";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function renderRecipes(path = "/learn/recipes") {
  return render(<MemoryRouter initialEntries={[path]}><RecipesPage /></MemoryRouter>);
}

describe("웹툰 제작 레시피", () => {
  it("첫 화면에서 목적과 실습 여섯 종을 펼쳐 보인다", () => {
    renderRecipes();
    expect(screen.getByRole("heading", { level: 1, name: "웹툰 제작 레시피" })).toBeTruthy();
    expect(screen.getByText(/값을 바꾸어 차이를 확인하세요/)).toBeTruthy();
    const index = screen.getByRole("region", { name: "실습 고르기" });
    const cards = within(index).getAllByRole("button");
    expect(cards).toHaveLength(RECIPES.length);
    for (const recipe of RECIPES) {
      expect(within(index).getByRole("button", { name: new RegExp(recipe.title, "u") })).toBeTruthy();
    }
    // 기본 실습(첫 번째)이 선택 상태로 표시되고 본문에도 열린다.
    expect(cards[0].getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { level: 2, name: RECIPES[0].title })).toBeTruthy();
  });

  it("리서치 셸(데스크 키커·리서치 메뉴)을 입지 않는다", () => {
    renderRecipes();
    expect(screen.queryByRole("navigation", { name: "창작 리서치 메뉴" })).toBeNull();
    expect(screen.queryByText(/TOONSTUDIO \/ 리서치 데스크/u)).toBeNull();
  });

  it("목차 카드로 실습을 바꾸면 본문과 선택 상태가 함께 바뀐다", () => {
    renderRecipes();
    const index = screen.getByRole("region", { name: "실습 고르기" });
    const camera = RECIPES.find((recipe) => recipe.id === "camera") ?? RECIPES[2];
    fireEvent.click(within(index).getByRole("button", { name: new RegExp(camera.title, "u") }));
    expect(screen.getByRole("heading", { level: 2, name: camera.title })).toBeTruthy();
    expect(within(index).getByRole("button", { name: new RegExp(camera.title, "u") }).getAttribute("aria-pressed")).toBe("true");
    // 슬라이더 라벨도 고른 실습의 것으로 바뀐다.
    expect(screen.getByLabelText(new RegExp(camera.control, "u"))).toBeTruthy();
  });

  it("딥링크(?lesson=)로 들어오면 그 실습이 열린 채로 시작한다", () => {
    const beats = RECIPES.find((recipe) => recipe.id === "beats") ?? RECIPES[5];
    renderRecipes(`/learn/recipes?lesson=${beats.id}`);
    expect(screen.getByRole("heading", { level: 2, name: beats.title })).toBeTruthy();
    const index = screen.getByRole("region", { name: "실습 고르기" });
    expect(within(index).getByRole("button", { name: new RegExp(beats.title, "u") }).getAttribute("aria-pressed")).toBe("true");
  });
});
