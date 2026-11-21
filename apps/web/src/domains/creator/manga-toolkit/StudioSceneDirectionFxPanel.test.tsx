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

  it("허용목록 SVG 파서로 그라디언트·도형을 안전하게 렌더링하고 비정상 블렌드·색상 입력을 거부한다", () => {
    render(<StudioSceneDirectionFxPanel />);
    const preview = screen.getByLabelText("특수 효과 실시간 미리보기");
    expect(preview.querySelector("svg")).not.toBeNull();
    expect(preview.querySelectorAll("polygon").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("option", { name: "스릴러 심연 비네트" }));
    expect(preview.querySelector("radialGradient")).not.toBeNull();

    const blendSelect = screen.getByLabelText("블렌드 모드") as HTMLSelectElement;
    fireEvent.change(blendSelect, { target: { value: '" onload="alert(1)' } });
    expect(blendSelect.value).toBe("multiply");
    expect(preview.querySelector("script")).toBeNull();
    expect(preview.querySelector("[onload]")).toBeNull();
  });
});
