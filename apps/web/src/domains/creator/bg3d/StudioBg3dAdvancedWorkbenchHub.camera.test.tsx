// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { StudioBg3dAdvancedWorkbenchHub } from "./StudioBg3dAdvancedWorkbenchHub";

afterEach(cleanup);
beforeEach(() => useI18n.setState({ lang: "ko" }));

describe("공간 모델러의 실제 카메라 적용 포트", () => {
  it("카메라를 적용할 포트가 없으면 새 프리셋의 적용 버튼을 비활성화한다", () => {
    render(<StudioBg3dAdvancedWorkbenchHub defaultTab="spatial-modeler" />);
    expect(screen.getByTestId("sketchup-two-point-apply-btn")).toHaveProperty("disabled", true);
  });

  it("명시적 적용 버튼으로만 선택한 렌즈 시프트를 호스트에 요청한다", () => {
    const camera = vi.fn();
    render(<StudioBg3dAdvancedWorkbenchHub defaultTab="spatial-modeler" onApplySceneCamera={camera} />);
    fireEvent.click(screen.getByTestId("sketchup-role-lens-storyboard-camera"));
    expect(camera).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("sketchup-two-point-apply-btn"));
    expect(camera).toHaveBeenCalledTimes(1);
    expect(camera).toHaveBeenCalledWith(expect.objectContaining({ lensShift: [0, 0.15] }), expect.stringContaining("적용 요청"));
  });

  it("비활성 호스트에서는 카메라 명령을 전달하지 않는다", () => {
    const camera = vi.fn();
    render(<StudioBg3dAdvancedWorkbenchHub defaultTab="spatial-modeler" disabled onApplySceneCamera={camera} />);
    fireEvent.click(screen.getByTestId("sketchup-two-point-apply-btn"));
    expect(camera).not.toHaveBeenCalled();
  });
});
