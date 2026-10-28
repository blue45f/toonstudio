// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { StudioBg3dInsertScenePrimitives } from "./studio-bg3d-workbench-insertion";
import { StudioBg3dSpatialStoryboardLauncher } from "./StudioBg3dSpatialStoryboardLauncher";

const BOX: BgPrimitive = {
  id: "generated-step", kind: "box", position: [0, 0, 0],
  rotation: [0, 0, 0], scale: [1, 1, 1], color: "#ffffff",
};

vi.mock("./StudioBg3dAdvancedWorkbenchHub", () => ({
  default: ({ disabled, onInsertScenePrimitives }: {
    readonly disabled?: boolean;
    readonly onInsertScenePrimitives?: StudioBg3dInsertScenePrimitives;
  }) => <button type="button" disabled={disabled} onClick={() => onInsertScenePrimitives?.([BOX], "계단 추가")}>
    생성한 계단 배치
  </button>,
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
});
