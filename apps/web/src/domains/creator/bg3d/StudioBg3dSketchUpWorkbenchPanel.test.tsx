// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dAdvancedWorkbenchHub } from "./StudioBg3dAdvancedWorkbenchHub";
import { StudioBg3dSketchUpWorkbenchPanel } from "./StudioBg3dSketchUpWorkbenchPanel";

describe("StudioBg3dSketchUpWorkbenchPanel & WorkbenchHub integration", () => {
  afterEach(() => {
    cleanup();
  });
  it("SketchUp 마스터 스튜디오 패널의 5대 섹션(복원·직접모델링·작도·스타일·태양광/CAD)이 정상 동작한다", async () => {
    const onRestoreSkpScenes = vi.fn();
    const onExecuteArray = vi.fn();
    const onApplyStyle = vi.fn();
    const onApplyShadowSolar = vi.fn();
    const onExportCadFormat = vi.fn();

    render(
      <StudioBg3dSketchUpWorkbenchPanel
        onRestoreSkpScenes={onRestoreSkpScenes}
        onExecuteArray={onExecuteArray}
        onApplyStyle={onApplyStyle}
        onApplyShadowSolar={onApplyShadowSolar}
        onExportCadFormat={onExportCadFormat}
      />,
    );

    expect(screen.getByTestId("bg3d-sketchup-workbench-panel")).toBeDefined();

    // 1. SKP 장면·태그·다이나믹 컴포넌트 복원
    fireEvent.click(screen.getByTestId("sketchup-restore-scenes-btn"));
    expect(onRestoreSkpScenes).toHaveBeenCalledWith(2, 4);

    // 2. VCB 배열 입력 및 IME-safe Enter 확인
    const vcbInput = screen.getByTestId("sketchup-vcb-array-input");
    fireEvent.change(vcbInput, { target: { value: "/3" } });
    // IME 조합 중(keyCode 229)일 때는 제출되지 않아야 함
    fireEvent.keyDown(vcbInput, { key: "Enter", keyCode: 229 });
    expect(onExecuteArray).not.toHaveBeenCalled();

    // 일반 Enter 또는 버튼 클릭 시 배열 실행
    fireEvent.click(screen.getByTestId("sketchup-vcb-array-submit"));
    expect(onExecuteArray).toHaveBeenCalledTimes(1);
    expect(onExecuteArray.mock.calls[0]?.[0]).toBe("/3");

    // 4. SketchUp 스타일 적용
    fireEvent.click(screen.getByTestId("sketchup-style-btn-skp-monochrome-inspect"));
    expect(onApplyStyle).toHaveBeenCalledTimes(1);

    // 5. 태양광 스터디 적용 & 네이티브 .skp 내보내기
    fireEvent.click(screen.getByTestId("sketchup-apply-shadow-btn"));
    expect(onApplyShadowSolar).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("sketchup-export-cad-btn"));
    await waitFor(() => {
      expect(onExportCadFormat).toHaveBeenCalledWith("skp", expect.any(Number));
    });
  });

  it("StudioBg3dAdvancedWorkbenchHub에서 sketchup-studio 탭으로 전환해 패널을 렌더링한다", () => {
    render(<StudioBg3dAdvancedWorkbenchHub defaultTab="sketchup-studio" />);
    expect(screen.getByTestId("bg3d-workbench-tab-sketchup-studio")).toBeDefined();
    expect(screen.getByTestId("bg3d-sketchup-workbench-panel")).toBeDefined();
  });
});
