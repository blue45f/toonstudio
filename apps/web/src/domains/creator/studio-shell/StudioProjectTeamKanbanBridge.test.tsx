// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { StudioProjectTeamKanbanBridge } from "./StudioProjectTeamKanbanBridge";

afterEach(cleanup);

describe("StudioProjectTeamKanbanBridge", () => {
  it("renders the 5-stage production Kanban cards with project-scoped canonical links and 44px touch targets", () => {
    render(
      <MemoryRouter>
        <StudioProjectTeamKanbanBridge projectId="proj-alpha" />
      </MemoryRouter>,
    );

    const section = screen.getByTestId("studio-project-team-kanban-bridge");
    expect(within(section).getByText("1. 콘티")).toBeTruthy();
    expect(within(section).getByText("2. 3D 배경")).toBeTruthy();
    expect(within(section).getByText("3. 선화")).toBeTruthy();
    expect(within(section).getByText("4. 채색")).toBeTruthy();
    expect(within(section).getByText("5. 글자·최종 확인")).toBeTruthy();

    const storyboardCard = within(section).getByTestId("studio-kanban-stage-card-storyboard");
    expect(within(storyboardCard).getByRole("link").className).toContain("min-h-11");
    expect(within(storyboardCard).getByRole("link").getAttribute("href")).toBe("/studio/p/proj-alpha/story");

    const bg3dCard = within(section).getByTestId("studio-kanban-stage-card-bg3d");
    expect(within(bg3dCard).getByRole("link").getAttribute("href")).toBe("/studio/bg3d?project=proj-alpha");

    const exportCard = within(section).getByTestId("studio-kanban-stage-card-lettering");
    expect(within(exportCard).getByRole("link").getAttribute("href")).toBe("/studio/p/proj-alpha/export");

    expect(within(section).getByRole("link", { name: /회차 진행 보기/u }).getAttribute("href"))
      .toBe("/production/projects/proj-alpha/production");
    expect(within(section).getByRole("link", { name: /작업 전달 기록/u }).getAttribute("href"))
      .toBe("/production/projects/proj-alpha/handoff");
    expect(within(section).getByRole("link", { name: /소재 이용 조건/u }).getAttribute("href"))
      .toBe("/production/projects/proj-alpha/rights");
  });
});
