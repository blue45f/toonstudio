// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { Suspense } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { LearnRecipesRoute } from "./creator-resource-pages";

/** 지연 로딩 청크 변환이 병렬 테스트 부하에서 느려질 수 있어 기본 1초보다 넉넉히 기다린다. */
const LAZY_LOAD_TIMEOUT_MS = 15_000;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("제작 레시피 라우트 요소(LearnRecipesRoute)", () => {
  it("지연 로딩이 끝나면 학습 셸과 레시피 화면을 함께 그리고 현재 위치를 레시피로 표시한다", async () => {
    render(
      <MemoryRouter initialEntries={["/learn/recipes"]}>
        <Suspense fallback={<p>불러오는 중</p>}>
          <LearnRecipesRoute />
        </Suspense>
      </MemoryRouter>,
    );

    // 로딩 중에는 라우트 경계의 폴백만 보이고, 끝나면 셸과 화면이 같은 순간에 붙는다.
    expect(
      await screen.findByRole("heading", { level: 1, name: "웹툰 제작 레시피" }, { timeout: LAZY_LOAD_TIMEOUT_MS }),
    ).toBeTruthy();
    const navigation = screen.getAllByRole("navigation", { name: "배우기 영역" });
    expect(navigation).toHaveLength(1);
    const currents = within(navigation[0]).getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(currents.map((link) => link.getAttribute("href"))).toEqual(["/learn/recipes"]);
    expect(screen.queryByText("불러오는 중")).toBeNull();
  });
});
