// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { ProductionFocusedAiWorkflow } from "./ProductionFocusedAiWorkflow";

afterEach(() => {
  cleanup();
});

describe("ProductionFocusedAiWorkflow", () => {
  it("접근성: 루트 data-own-control-size, 광원 방향 활성 칩 text-on-accent, 그룹 시맨틱(role=group) 및 44px(min-h-11) 계약을 유지한다", () => {
    const { container } = render(
      <MemoryRouter>
        <ProductionFocusedAiWorkflow workId="work-1" process={null} editorHref={null} />
      </MemoryRouter>,
    );

    const root = container.querySelector("[data-production-focused-ai]");
    expect(root?.hasAttribute("data-own-control-size")).toBe(true);

    expect(screen.getByRole("group", { name: "AI 보조 계획 조건" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "광원 방향" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "음영 세부 파라미터" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "음영 다운로드 옵션" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "음영 적용 영역 선택" })).toBeTruthy();

    const topLeftBtn = screen.getByTestId("shading-light-dir-top-left");
    expect(topLeftBtn.getAttribute("aria-pressed")).toBe("true");
    expect(topLeftBtn.className).toContain("text-on-accent");
    expect(topLeftBtn.className).not.toContain("text-white");
    expect(topLeftBtn.className).toContain("min-h-11");

    const backlightBtn = screen.getByTestId("shading-light-dir-backlight");
    fireEvent.click(backlightBtn);
    expect(backlightBtn.getAttribute("aria-pressed")).toBe("true");
    expect(backlightBtn.className).toContain("text-on-accent");
    expect(backlightBtn.className).not.toContain("text-white");

    expect(screen.getByTestId("shading-edge-style-select").className).toContain("min-h-11");
    expect(screen.getByTestId("shading-amount-select").className).toContain("min-h-11");
    expect(screen.getByTestId("shading-crop-width-input").className).toContain("min-h-11");
    expect(screen.getByTestId("shading-crop-height-input").className).toContain("min-h-11");
    expect(screen.getByTestId("shading-hex-input").className).toContain("min-h-11");
    expect(screen.getByTestId("shading-download-scope-select").className).toContain("min-h-11");
    expect(screen.getByTestId("shading-download-packaging-select").className).toContain("min-h-11");
    expect(screen.getByTestId("shading-region-item-reg-cut12-hero").className).toContain("min-h-11");
  });
});
