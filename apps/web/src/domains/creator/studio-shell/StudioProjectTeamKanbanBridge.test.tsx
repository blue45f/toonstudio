// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { StudioProjectTeamKanbanBridge } from "./StudioProjectTeamKanbanBridge";

afterEach(cleanup);

describe("StudioProjectTeamKanbanBridge", () => {
  it("renders the 5-stage production flow and links to Kanban, Handoff, and Rights BOM", () => {
    render(
      <MemoryRouter>
        <StudioProjectTeamKanbanBridge projectId="proj-alpha" />
      </MemoryRouter>,
    );

    const section = screen.getByTestId("studio-project-team-kanban-bridge");
    expect(within(section).getByText("1. 콘티")).toBeTruthy();
    expect(within(section).getByText("5. 식자·승인")).toBeTruthy();

    expect(within(section).getByRole("link", { name: /회차 공정 칸반 열기/u }).getAttribute("href"))
      .toBe("/production/projects/proj-alpha/production");
    expect(within(section).getByRole("link", { name: /공정 인계/u }).getAttribute("href"))
      .toBe("/production/projects/proj-alpha/handoff");
    expect(within(section).getByRole("link", { name: /권리 BOM 원장/u }).getAttribute("href"))
      .toBe("/production/projects/proj-alpha/rights");
  });
});
