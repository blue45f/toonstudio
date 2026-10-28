// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { StudioBg3dInsertScenePrimitives } from "./studio-bg3d-workbench-insertion";
import type { StudioBg3dExecuteSelectionArray, StudioBg3dSelectionArraySummary } from "./studio-bg3d-selection-array";
import { StudioBg3dSpatialStoryboardLauncher } from "./StudioBg3dSpatialStoryboardLauncher";

const BOX: BgPrimitive = {
  id: "generated-step", kind: "box", position: [0, 0, 0],
  rotation: [0, 0, 0], scale: [1, 1, 1], color: "#ffffff",
};

vi.mock("./StudioBg3dAdvancedWorkbenchHub", () => ({
  default: ({ disabled, onInsertScenePrimitives, arraySelection, onExecuteSelectionArray }: {
    readonly disabled?: boolean;
    readonly onInsertScenePrimitives?: StudioBg3dInsertScenePrimitives;
    readonly arraySelection?: StudioBg3dSelectionArraySummary;
    readonly onExecuteSelectionArray?: StudioBg3dExecuteSelectionArray;
  }) => <>
    <button type="button" disabled={disabled} onClick={() => onInsertScenePrimitives?.([BOX], "계단 추가")}>생성한 계단 배치</button>
    <p>배열 선택 도형 {arraySelection?.selectedPrimitiveCount ?? 0}개</p>
    <button type="button" disabled={disabled} onClick={() => onExecuteSelectionArray?.({ mode: "linear", token: "*2", delta: [1, 0, 0] })}>
      선택 도형을 반복 배치
    </button>
  </>,
}));

afterEach(cleanup);

describe("전문 작업대 지연 진입의 장면 삽입 연결", () => {
  it("작업대를 열기 전에는 도구가 없고 연 뒤 실제 삽입 명령을 전달한다", async () => {
    const insert = vi.fn<StudioBg3dInsertScenePrimitives>(() => true);
    const view = render(<StudioBg3dSpatialStoryboardLauncher onInsertScenePrimitives={insert} />);
    expect(screen.queryByRole("button", { name: "생성한 계단 배치" })).toBeNull();
    fireEvent.click(screen.getByTestId("bg3d-advanced-workbench-launcher-toggle"));
    const insertButton = await screen.findByRole("button", { name: "생성한 계단 배치" });
    fireEvent.click(insertButton);
    expect(insert).toHaveBeenCalledExactlyOnceWith([BOX], "계단 추가");

    view.rerender(<StudioBg3dSpatialStoryboardLauncher disabled onInsertScenePrimitives={insert} />);
    expect(insertButton.hasAttribute("disabled")).toBe(true);
    fireEvent.click(insertButton);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("지연 로드한 Hub에 현재 선택 요약과 배열 명령을 전달하고 이후 선택·잠금 변경도 반영한다", async () => {
    const execute = vi.fn<StudioBg3dExecuteSelectionArray>(() => ({
      ok: true, addedNodeCount: 6, copyCount: 2, selectedNodeCount: 3, normalizedToken: "*2",
    }));
    const selection: StudioBg3dSelectionArraySummary = { selectedPrimitiveCount: 3, availableNodeCount: 50, blockedReason: null };
    const view = render(<StudioBg3dSpatialStoryboardLauncher arraySelection={selection} onExecuteSelectionArray={execute} />);
    expect(screen.queryByRole("button", { name: "선택 도형을 반복 배치" })).toBeNull();
    fireEvent.click(screen.getByTestId("bg3d-advanced-workbench-launcher-toggle"));
    const arrayButton = await screen.findByRole("button", { name: "선택 도형을 반복 배치" });
    expect(screen.getByText("배열 선택 도형 3개")).toBeTruthy();
    fireEvent.click(arrayButton);
    expect(execute).toHaveBeenCalledExactlyOnceWith({ mode: "linear", token: "*2", delta: [1, 0, 0] });

    view.rerender(<StudioBg3dSpatialStoryboardLauncher disabled arraySelection={{ ...selection, selectedPrimitiveCount: 1 }} onExecuteSelectionArray={execute} />);
    expect(screen.getByText("배열 선택 도형 1개")).toBeTruthy();
    expect(arrayButton).toHaveProperty("disabled", true);
    fireEvent.click(arrayButton);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
