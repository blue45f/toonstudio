// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioSecurityRbacPanel } from "./StudioSecurityRbacPanel";

afterEach(cleanup);

describe("StudioSecurityRbacPanel", () => {
  it("멤버의 보안 역할을 변경하고 감사 로그를 기록한다", () => {
    const onRoleChanged = vi.fn();
    render(<StudioSecurityRbacPanel onRoleChanged={onRoleChanged} />);

    fireEvent.change(screen.getByLabelText("보안 역할 선택"), {
      target: { value: "main_author" },
    });

    expect(onRoleChanged).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/role\.changed:line_assistant->main_author/u)).toBeTruthy();
  });
});
