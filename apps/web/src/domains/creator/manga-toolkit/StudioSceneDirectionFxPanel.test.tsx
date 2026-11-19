// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioSceneDirectionFxPanel } from "./StudioSceneDirectionFxPanel";

afterEach(cleanup);

describe("StudioSceneDirectionFxPanel", () => {
  it("프리셋을 전환하고 컷 레이어로 적용 콜백을 호출한다", () => {
    const onApply = vi.fn();
    render(<StudioSceneDirectionFxPanel onApplyFxLayer={onApply} />);

    fireEvent.click(screen.getByRole("option", { name: "벚꽃 흩날림" }));
    fireEvent.click(screen.getByRole("button", { name: "컷 레이어로 적용" }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]?.[0]?.presetId).toBe("cherry-blossom-drift");
    expect(screen.getByRole("status").textContent).toContain("[FX] 벚꽃 흩날림");
  });
});
