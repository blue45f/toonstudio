// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { LearnSectionShell } from "./LearnSectionShell";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("학습 섹션 셸", () => {
  it("LearnPage 밖 라우트(/learn/recipes)에서도 같은 내비를 쓰고 현재 위치를 레시피로 표시한다", () => {
    render(
      <MemoryRouter initialEntries={["/learn/recipes?lesson=camera"]}>
        <LearnSectionShell>
          <p>레시피 본문</p>
        </LearnSectionShell>
      </MemoryRouter>,
    );
    expect(screen.getByText("레시피 본문")).toBeTruthy();
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
