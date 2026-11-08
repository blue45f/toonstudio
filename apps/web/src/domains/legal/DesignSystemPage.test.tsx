// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DesignSystemPage } from "./DesignSystemPage";

afterEach(() => {
  cleanup();
});

describe("DesignSystemPage accessibility (GAP-R6-05)", () => {
  it("라이브 펄스 배지에 motion-reduce:animate-none을 부여하고 44px(min-h-11) 컨트롤 높이를 보장한다", () => {
    const { container } = render(<DesignSystemPage />);

    const pulseDot = container.querySelector(".animate-pulse-soft");
    expect(pulseDot).toBeTruthy();
    expect(pulseDot?.className).toContain("motion-reduce:animate-none");

    const selectTrigger = screen.getByRole("combobox", { name: "플랫폼" });
    expect(selectTrigger.className).toContain("min-h-11");

    const componentsSection = container.querySelector("#components");
    expect(componentsSection?.hasAttribute("data-own-control-size")).toBe(true);
    expect(componentsSection?.className).toContain("[&_button]:min-h-11");

    const header = container.querySelector("header");
    expect(header?.hasAttribute("data-own-control-size")).toBe(true);

    const nav = screen.getByRole("navigation", { name: "디자인 시스템 섹션" });
    expect(nav.hasAttribute("data-own-control-size")).toBe(true);
    for (const link of Array.from(nav.querySelectorAll("a"))) {
      expect(link.className).toContain("min-h-11");
    }
  });
});
