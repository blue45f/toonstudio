import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { StudioMcpCliGuidePage } from "./StudioMcpCliGuidePage";

describe("StudioMcpCliGuidePage", () => {
  it("MCP·CLI 연동 안내 페이지와 클라이언트 스니펫 탭·전체 15종 레퍼런스를 렌더링한다", () => {
    render(
      <MemoryRouter initialEntries={["/studio/mcp"]}>
        <StudioMcpCliGuidePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /MCP · CLI 연동 안내/u })).toBeTruthy();
    expect(screen.getByText(/claude_desktop_config\.json/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "터미널 CLI" }));
    expect(screen.getByText(/pnpm run studio:cli -- draw-demo/u)).toBeTruthy();

    expect(screen.getByText("studio.canvas.draw_stroke")).toBeTruthy();
    expect(screen.getByText("studio.rbac.assign_role")).toBeTruthy();
  });
});
