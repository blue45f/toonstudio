// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { LearningResourcesPage } from "./LearningResourcesPage";

afterEach(() => {
  cleanup();
});

describe("강좌·자료 라이브러리 접근성 및 스킬트리 토글", () => {
  it("스킬트리 그룹 시맨틱(role=group), aria-pressed, min-h-11/data-own-control-size, 포커스 링 및 대비 클래스를 검증한다", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/learn/resources"]}>
        <LearningResourcesPage />
      </MemoryRouter>,
    );

    const root = container.querySelector(".academy-resources-page");
    expect(root?.hasAttribute("data-own-control-size")).toBe(true);

    const skilltreeBar = screen.getByTestId("learn-resources-rea-skilltree-bar");
    expect(skilltreeBar.getAttribute("role")).toBe("group");
    expect(skilltreeBar.hasAttribute("data-own-control-size")).toBe(true);

    // role 없는 div에 aria-label만 부여된 요소가 없어야 한다 (aria-prohibited-attr 방지)
    const labeledDivsWithoutRole = container.querySelectorAll("div[aria-label]:not([role])");
    expect(labeledDivsWithoutRole).toHaveLength(0);

    const trackGroup = within(skilltreeBar).getByRole("group", { name: "직무별 커리큘럼 스킬트리" });
    const trackButtons = within(trackGroup).getAllByRole("button");
    expect(trackButtons).toHaveLength(4);
    for (const btn of trackButtons) {
      expect(btn.className).toContain("min-h-11");
      expect(btn.className).toContain("focus-visible:outline-2");
      expect(btn.className).not.toContain("text-white");
    }
    expect(trackButtons[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(trackButtons[0]?.className).toContain("text-on-accent");

    fireEvent.click(screen.getByTestId("learn-resources-rea-track-anatomy-croquis"));
    expect(screen.getByTestId("learn-resources-rea-track-anatomy-croquis").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("learn-resources-rea-track-storyboard-pacing").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("learn-resources-rea-skilltree-status").textContent).toContain("30초 포스(Force) 크로키");

    fireEvent.click(screen.getByTestId("learn-resources-rea-track-storyboard-pacing"));
    expect((screen.getByLabelText("직군") as HTMLSelectElement).value).toBe("story");
    expect((screen.getByLabelText("제작 단계") as HTMLSelectElement).value).toBe("storyboard");

    const resetButton = screen.getByRole("button", { name: "필터 초기화" });
    expect(resetButton.className).toContain("min-h-11");
    expect(resetButton.className).toContain("focus-visible:outline-2");

    const classroomLink = screen.getByRole("link", { name: /Classroom 열기/u });
    expect(classroomLink.className).toContain("min-h-11");
    expect(classroomLink.className).toContain("focus-visible:outline-2");
  });
});
