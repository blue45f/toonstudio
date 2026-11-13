// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { LearnSectionShell } from "./LearnSectionShell";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("학습 섹션 셸", () => {
  it.each(["/learn", "/learn/resources", "/learn/trace", "/learn/process", "/learn/lessons/inking"])("%s 본문을 접지 않고 메뉴·진도만 보조 영역으로 분리한다", (route) => {
    const { container } = render(<MemoryRouter initialEntries={[route]}><LearnSectionShell><h1>학습 본문</h1></LearnSectionShell></MemoryRouter>);
    const menu = container.querySelector<HTMLDetailsElement>(".learn-section-menu");
    expect(menu?.open).toBe(false);
    expect(screen.getByRole("heading", { name: "학습 본문" }).closest("details")).toBeNull();
    const summary = screen.getByText("학습 메뉴", { selector: "summary > span" }).closest("summary");
    if (!summary) throw new Error("학습 메뉴 누락");
    fireEvent.click(summary);
    expect(menu?.open).toBe(true);
    const link = screen.getByRole("link", { name: "강좌·자료" });
    expect(link.getAttribute("href")).toBe("/learn/resources");
    link.focus();
    fireEvent.keyDown(link, { key: "Escape" });
    expect(menu?.open).toBe(false);
    expect(document.activeElement).toBe(summary);
  });

  it("LearnPage 밖 라우트(/learn/recipes)에서도 같은 내비를 쓰고 현재 위치를 레시피로 표시한다", () => {
    render(
      <MemoryRouter initialEntries={["/learn/recipes?lesson=camera"]}>
        <LearnSectionShell>
          <p>레시피 본문</p>
        </LearnSectionShell>
      </MemoryRouter>,
    );
    expect(screen.getByText("레시피 본문")).toBeTruthy();
    fireEvent.click(screen.getByText("학습 메뉴", { selector: "summary > span" }));
    const navigation = screen.getAllByRole("navigation", { name: "배우기 영역" });
    expect(navigation).toHaveLength(1);
    const currents = within(navigation[0]).getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(currents.map((link) => link.getAttribute("href"))).toEqual(["/learn/recipes"]);
    expect(currents[0].textContent).toContain("제작 레시피");
  });

  it("레시피처럼 자체 실습 진행을 표시하는 화면에는 셸 진행 스트립을 얹지 않는다", () => {
    render(
      <MemoryRouter initialEntries={["/learn/recipes"]}>
        <LearnSectionShell>
          <p>레시피 본문</p>
        </LearnSectionShell>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("region", { name: "내 학습 진행" })).toBeNull();
  });
});
