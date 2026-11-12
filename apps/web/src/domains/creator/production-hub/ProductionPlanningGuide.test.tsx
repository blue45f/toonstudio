// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { ProductionPlanningGuide } from "./ProductionPlanningGuide";

afterEach(cleanup);

describe("ProductionPlanningGuide", () => {
  it("실제 프로젝트 화면으로 이어지는 안내를 기본 접힘으로 제공한다", () => {
    render(<MemoryRouter><ProductionPlanningGuide projectId="team/project" /></MemoryRouter>);
    const guide = screen.getByRole("group", { name: "제작 계획·검수 안내" });
    expect(guide.tagName).toBe("DETAILS");
    expect((guide as HTMLDetailsElement).open).toBe(false);
    expect(within(guide).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/production/projects/team%2Fproject/schedule",
      "/production/projects/team%2Fproject/control",
      "/production/projects/team%2Fproject/review",
      "/studio/p/team%2Fproject/overview",
    ]);
    expect(within(guide).queryByRole("button")).toBeNull();
    expect(screen.getByTestId("production-studio-workspace-link").getAttribute("href")).toBe("/studio/p/team%2Fproject/overview");
    expect(guide.textContent).not.toMatch(/4\.5|78%|75개 언어|자동 검증|지정되었습니다/u);
  });
});
