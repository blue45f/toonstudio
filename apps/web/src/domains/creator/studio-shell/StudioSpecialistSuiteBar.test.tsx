// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { StudioSpecialistSuiteBar } from "./StudioSpecialistSuiteBar";

afterEach(cleanup);

describe("StudioSpecialistSuiteBar", () => {
  it("preserves optional project context across all 5 canonical specialist creator tools", () => {
    render(
      <MemoryRouter>
        <StudioSpecialistSuiteBar projectId="project-12" />
      </MemoryRouter>,
    );

    const nav = screen.getByTestId("studio-specialist-suite-bar");
    expect(within(nav).getByRole("link", { name: /브러시 스튜디오 V6/u }).getAttribute("href"))
      .toBe("/studio/assets/brushes/new?project=project-12");
    expect(within(nav).getByRole("link", { name: /장면 BGM · 오디오/u }).getAttribute("href"))
      .toBe("/studio/assets/audio?project=project-12");
    expect(within(nav).getByRole("link", { name: /PDF 원고 워크벤치/u }).getAttribute("href"))
      .toBe("/studio/pdf-workbench?project=project-12");
  });
});
