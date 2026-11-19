// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
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
    const snippets = within(screen.getByRole("region", { name: "클라이언트별 설정 스니펫" }));
    expect(snippets.getByText(/claude_desktop_config\.json/u, { selector: "p" })).toBeTruthy();

    fireEvent.click(snippets.getByRole("tab", { name: "터미널 CLI" }));
    expect(snippets.getByText(/pnpm run studio:cli -- draw-demo/u, { selector: "code" })).toBeTruthy();

    const reference = within(screen.getByRole("region", { name: "제공 MCP 툴 전체 레퍼런스 (15종)" }));
    expect(reference.getByText("studio.canvas.draw_stroke")).toBeTruthy();
    expect(reference.getByText("studio.rbac.assign_role")).toBeTruthy();
  });
});
