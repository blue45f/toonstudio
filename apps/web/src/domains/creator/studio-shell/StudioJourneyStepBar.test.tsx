// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { StudioJourneyStepBar } from "./StudioJourneyStepBar";

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
});

describe("StudioJourneyStepBar", () => {
  it("현재 단계에 aria-current=step을 표시하고 다른 단계로 이동 링크를 제공한다", () => {
    render(
      <MemoryRouter>
        <StudioJourneyStepBar
          currentStep="edit"
          startHref="/studio/p/proj-1/story"
          editHref="/studio/work/proj-1/canvas"
          exportHref="/studio/p/proj-1/export"
        />
      </MemoryRouter>,
    );

    const nav = screen.getByRole("navigation", { name: "창작 3단계 진행 흐름" });
    expect(nav.getAttribute("data-current-step")).toBe("edit");

    const startLink = within(nav).getByRole("link", { name: /1\. 시작·기획/u });
    expect(startLink.getAttribute("href")).toBe("/studio/p/proj-1/story");
    expect(startLink.className).toContain("min-h-11");

    const exportLink = within(nav).getByRole("link", { name: /3\. 저장·내보내기/u });
    expect(exportLink.getAttribute("href")).toBe("/studio/p/proj-1/export");

    const currentItem = nav.querySelector('[data-journey-step="edit"]');
    expect(currentItem?.getAttribute("aria-current")).toBe("step");
    expect(currentItem?.textContent).toContain("현재 단계");
  });

  it("영어 로케일에서도 3단계 안내 문구를 자연스럽게 표시한다", () => {
    useI18n.setState({ lang: "en" });
    render(
      <MemoryRouter>
        <StudioJourneyStepBar currentStep="start" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("navigation", { name: "3-step creation flow" })).toBeTruthy();
    expect(screen.getByText(/1\. Start & Plan/u)).toBeTruthy();
    expect(screen.getByText(/2\. Edit Manuscript/u)).toBeTruthy();
    expect(screen.getByText(/3\. Save & Export/u)).toBeTruthy();
  });
});
