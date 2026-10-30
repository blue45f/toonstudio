// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dAdvancedWorkbenchHub } from "./StudioBg3dAdvancedWorkbenchHub";
import { StudioBg3dSpatialModelerPanel } from "./StudioBg3dSpatialModelerPanel";

describe("공간 모델러 패널과 워크벤치 허브 연동", () => {
  afterEach(() => {
    cleanup();
  });
  it("공간 모델러의 복원·직접 모델링·작도·스타일·태양광/CAD가 동작한다", async () => {
    const onRestoreSkpScenes = vi.fn();
    const onExecuteArray = vi.fn();
    const onApplyStyle = vi.fn();
    const onApplyShadowSolar = vi.fn();
    const onExportCadFormat = vi.fn();

    render(
      <StudioBg3dSpatialModelerPanel
        onRestoreSkpScenes={onRestoreSkpScenes}
        onExecuteArray={onExecuteArray}
        onApplyStyle={onApplyStyle}
        onApplyShadowSolar={onApplyShadowSolar}
        onExportCadFormat={onExportCadFormat}
      />,
    );

    expect(screen.getByTestId("bg3d-spatial-modeler-panel")).toBeDefined();
    expect(screen.getByText("공간 모델러")).toBeTruthy();

    // 1. SKP 장면·태그·다이나믹 컴포넌트 복원
    fireEvent.click(screen.getByTestId("spatial-modeler-restore-scenes-btn"));
    expect(onRestoreSkpScenes).toHaveBeenCalledWith(2, 4);

    // 2. VCB 배열 입력 및 IME-safe Enter 확인
    const vcbInput = screen.getByTestId("spatial-modeler-vcb-array-input");
    fireEvent.change(vcbInput, { target: { value: "/3" } });
    // IME 조합 중(keyCode 229)일 때는 제출되지 않아야 함
    fireEvent.keyDown(vcbInput, { key: "Enter", keyCode: 229 });
    expect(onExecuteArray).not.toHaveBeenCalled();

    // 일반 Enter 또는 버튼 클릭 시 배열 실행
    fireEvent.click(screen.getByTestId("spatial-modeler-vcb-array-submit"));
    expect(onExecuteArray).toHaveBeenCalledTimes(1);
    expect(onExecuteArray.mock.calls[0]?.[0]).toBe("/3");

    // 4. 공간 모델러 스타일 적용
    fireEvent.click(screen.getByTestId("spatial-modeler-style-btn-skp-monochrome-inspect"));
    expect(onApplyStyle).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("spatial-modeler-workbench-status").textContent).toContain("공간 모델러 스타일 적용:");

    // 5. 태양광 스터디 적용 & 네이티브 .skp 내보내기
    fireEvent.click(screen.getByTestId("spatial-modeler-apply-shadow-btn"));
    expect(onApplyShadowSolar).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("spatial-modeler-export-cad-btn"));
    await waitFor(() => {
      expect(onExportCadFormat).toHaveBeenCalledWith("skp", expect.any(Number));
    });
    expect(screen.getByTestId("spatial-modeler-export-summary").textContent).toContain("toonstudio_spatial_modeler_set.skp");
  });

  it("허브의 공간 모델러 탭에서 새 제품명으로 패널을 연다", () => {
    render(<StudioBg3dAdvancedWorkbenchHub defaultTab="spatial-modeler" />);
    expect(within(screen.getByTestId("bg3d-workbench-tab-spatial-modeler")).getByText("공간 모델러", { exact: true })).toBeTruthy();
    expect(screen.getByTestId("bg3d-spatial-modeler-panel")).toBeDefined();
    expect(screen.queryByText(/SketchUp|스케치업/)).toBeNull();
  });
});
