// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioEraserQuickPicker } from "../StudioEraserQuickPicker";

import { useI18n } from "@/shared/lib/i18n";

afterEach(() => { cleanup(); useI18n.setState({ lang: "ko" }); });

describe("StudioEraserQuickPicker", () => {
  it("renders accessible 44px-plus quick cards with explicit erase outcomes", () => {
    render(
      <StudioEraserQuickPicker
        selectedId="kneaded-eraser"
        onSelect={vi.fn()}
      />,
    );

    const picker = screen.getByRole("group", { name: "지우개 종류 빠른 선택" });
    expect(within(picker).getAllByRole("button")).toHaveLength(5);
    const standard = within(picker).getByRole("button", {
      name: "일반 지우개, 100% 지움. 한 번에 완전히 지워요",
    });
    const kneaded = within(picker).getByRole("button", {
      name: "떡지우개, 38% 지움. 한 번에 38%만 걷어내요",
    });

    expect(standard.getAttribute("aria-pressed")).toBe("false");
    expect(kneaded.getAttribute("aria-pressed")).toBe("true");
    expect(standard.getAttribute("data-studio-min-target-px")).toBe("44");
    expect(kneaded.getAttribute("data-studio-min-target-px")).toBe("44");
    expect(standard.className).toContain("min-h-[8.5rem]");
    expect(within(standard).getByText("100% 지움")).toBeTruthy();
    expect(within(kneaded).getByText("38% 지움")).toBeTruthy();
  });

  it("영어 사용자가 다섯 가지 팁의 전후·강도·선택 결과를 모두 읽을 수 있다", () => {
    useI18n.setState({ lang: "en" });
    const chosen = vi.fn();
    render(<StudioEraserQuickPicker selectedId="lift-eraser" onSelect={chosen} placement="mobile" />);
    const group = screen.getByRole("group", { name: "Mobile eraser presets" });
    expect(group.textContent).not.toMatch(/[가-힣]/);
    for (const option of within(group).getAllByRole("button")) {
      expect(option.getAttribute("aria-label")).toMatch(/% erase/);
      expect(within(option).getByRole("img").getAttribute("aria-label")).toMatch(/preview/);
      fireEvent.click(option);
    }
    expect(chosen.mock.calls.map(([id]) => id)).toEqual(["standard-eraser", "kneaded-eraser", "precision-eraser", "broad-eraser", "lift-eraser"]);
  });

  it("shows an empty standard result and exactly 62% retained ink for the kneaded result", () => {
    const { container } = render(
      <StudioEraserQuickPicker
        selectedId="standard-eraser"
        onSelect={vi.fn()}
      />,
    );

    const standardPreview = container.querySelector(
      '[data-studio-eraser-preview="standard-eraser"]',
    );
    const kneadedPreview = container.querySelector(
      '[data-studio-eraser-preview="kneaded-eraser"]',
    );
    const standardAfter = standardPreview?.querySelector(
      '[data-studio-eraser-after-line="standard-eraser"]',
    );
    const kneadedAfter = kneadedPreview?.querySelector(
      '[data-studio-eraser-after-line="kneaded-eraser"]',
    );

    expect(standardPreview?.querySelector("svg")?.getAttribute("aria-label"))
      .toContain("한 번 지운 뒤 빈 띠");
    expect(kneadedPreview?.querySelector("svg")?.getAttribute("aria-label"))
      .toContain("원래 농도의 62%가 남은 선");
    expect(standardAfter?.getAttribute("opacity")).toBe("0");
    expect(standardAfter?.getAttribute("data-studio-residual-opacity")).toBe("0");
    expect(kneadedAfter?.getAttribute("opacity")).toBe("0.62");
    expect(kneadedAfter?.getAttribute("data-studio-residual-opacity")).toBe("0.62");
  });

  it("keeps card titles readable in the narrow dock column", () => {
    const { container } = render(
      <StudioEraserQuickPicker
        selectedId="standard-eraser"
        onSelect={vi.fn()}
      />,
    );

    const title = container.querySelector("strong");
    const titleRow = title?.parentElement?.parentElement;
    expect(title?.textContent).toBe("일반 지우개");
    expect(titleRow?.className).toContain("flex-wrap");
    expect(title?.parentElement?.className).toContain("min-w-[5rem]");
  });

  it("reports the chosen id while leaving selected state controlled by the parent", () => {
    const onSelect = vi.fn();
    const view = render(
      <StudioEraserQuickPicker
        selectedId="kneaded-eraser"
        onSelect={onSelect}
      />,
    );
    const standard = screen.getByRole("button", { name: /^일반 지우개,/ });

    fireEvent.click(standard);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith("standard-eraser");
    expect(standard.getAttribute("aria-pressed")).toBe("false");

    view.rerender(
      <StudioEraserQuickPicker
        selectedId="standard-eraser"
        onSelect={onSelect}
      />,
    );
    expect(screen.getByRole("button", { name: /^일반 지우개,/ })
      .getAttribute("aria-pressed")).toBe("true");
  });
});
