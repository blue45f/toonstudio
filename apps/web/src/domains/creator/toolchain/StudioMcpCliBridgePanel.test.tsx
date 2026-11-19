// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StudioMcpCliBridgePanel } from "./StudioMcpCliBridgePanel";

afterEach(cleanup);

describe("StudioMcpCliBridgePanel", () => {
  it("툴을 선택하면 해당 CLI 실행 명령과 MCP 설정을 갱신한다", () => {
    render(<StudioMcpCliBridgePanel />);

    fireEvent.click(screen.getByRole("option", { name: /studio\.canvas\.apply_scene_fx/u }));

    expect(screen.getByText(/pnpm run studio:cli -- call studio\.canvas\.apply_scene_fx/u)).toBeTruthy();
    expect(screen.getByText(/"toonstudio"/u)).toBeTruthy();
  });
});
