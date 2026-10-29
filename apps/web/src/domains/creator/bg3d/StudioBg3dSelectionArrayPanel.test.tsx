// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dSelectionArrayPanel } from "./StudioBg3dSelectionArrayPanel";
import type { StudioBg3dExecuteSelectionArray, StudioBg3dSelectionArraySummary } from "./studio-bg3d-selection-array";

const READY: StudioBg3dSelectionArraySummary = { selectedPrimitiveCount: 2, availableNodeCount: 1000, blockedReason: null };
function successfulCommand() {
  return vi.fn<StudioBg3dExecuteSelectionArray>(() => ({
    ok: true, addedNodeCount: 6, copyCount: 3, selectedNodeCount: 2, normalizedToken: "*3",
  }));
}

afterEach(cleanup);

describe("선택 도형 반복 배치 설정", () => {
  it("장면 기준 축과 음수 간격을 선형 배열 명령에 전달하고 사본 총 노드 수를 예고한다", () => {
    const execute = successfulCommand();
    render(<StudioBg3dSelectionArrayPanel selection={READY} onExecuteSelectionArray={execute} />);
    expect(screen.getByTestId("bg3d-array-node-preview").textContent).toContain("도형 총 6개");
    expect(screen.queryByTestId("bg3d-array-result")).toBeNull();
    fireEvent.change(screen.getByLabelText("복제 명령"), { target: { value: "3x" } });
    fireEvent.change(screen.getByLabelText("장면 기준 축"), { target: { value: "z" } });
    fireEvent.change(screen.getByLabelText("배치 간격 (m)"), { target: { value: "-2.5" } });
    fireEvent.click(screen.getByTestId("bg3d-array-execute"));

    expect(execute).toHaveBeenCalledExactlyOnceWith({ mode: "linear", token: "*3", delta: [0, 0, -2.5] });
    expect(screen.getByTestId("bg3d-array-result").textContent).toBe("사본 3묶음, 도형 6개를 현재 장면에 추가했습니다.");
  });

  it("등분 명령은 전체 거리와 각도 레이블을 사용하고 원형 배열의 중심·축·각도를 전달한다", () => {
    const execute = successfulCommand();
    render(<StudioBg3dSelectionArrayPanel selection={READY} onExecuteSelectionArray={execute} />);
    fireEvent.change(screen.getByLabelText("복제 명령"), { target: { value: "/4" } });
    expect(screen.getByLabelText("전체 거리 (m)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "원형 배열" }));
    expect(screen.getByLabelText("장면 기준 축")).toHaveProperty("value", "y");
    fireEvent.change(screen.getByLabelText("전체 회전 각도 (도)"), { target: { value: "180" } });
    fireEvent.change(screen.getByLabelText("회전 중심 X (m)"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("회전 중심 Y (m)"), { target: { value: "-2" } });
    fireEvent.change(screen.getByLabelText("회전 중심 Z (m)"), { target: { value: "3" } });
    expect(screen.getByTestId("bg3d-array-node-preview").textContent).toContain("도형 총 8개");
    fireEvent.click(screen.getByTestId("bg3d-array-execute"));

    expect(execute).toHaveBeenCalledExactlyOnceWith({ mode: "radial", token: "/4", axis: "y", angleDegrees: 180, pivot: [1, -2, 3] });
    fireEvent.click(screen.getByRole("button", { name: "선형 배열" }));
    expect(screen.getByLabelText("장면 기준 축")).toHaveProperty("value", "x");
  });

  it.each(["", "*0", "*201", "*1.5", "잘못된 명령"])("복제 수가 잘못된 명령 %s은 실행하지 않는다", (token) => {
    const execute = successfulCommand();
    render(<StudioBg3dSelectionArrayPanel selection={READY} onExecuteSelectionArray={execute} />);
    fireEvent.change(screen.getByLabelText("복제 명령"), { target: { value: token } });
    expect(screen.getByRole("alert").textContent).toContain("1~200");
    expect(screen.getByTestId("bg3d-array-execute")).toHaveProperty("disabled", true);
    fireEvent.submit(screen.getByRole("form", { name: "반복 배치 설정" }));
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(["", "0", "Infinity"])("비어 있거나 유한하지 않거나 0인 간격 %s은 배치하지 않는다", (value) => {
    const execute = successfulCommand();
    render(<StudioBg3dSelectionArrayPanel selection={READY} onExecuteSelectionArray={execute} />);
    fireEvent.change(screen.getByLabelText("배치 간격 (m)"), { target: { value } });
    expect(screen.getByRole("alert").textContent).toContain("0이 아닌 숫자");
    fireEvent.submit(screen.getByRole("form", { name: "반복 배치 설정" }));
    expect(execute).not.toHaveBeenCalled();
  });

  it("원형 배열은 유효하지 않은 각도와 중심을 거부하고 비활성 선형 입력은 무시한다", () => {
    const execute = successfulCommand();
    render(<StudioBg3dSelectionArrayPanel selection={READY} onExecuteSelectionArray={execute} />);
    fireEvent.change(screen.getByLabelText("배치 간격 (m)"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "원형 배열" }));
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.change(screen.getByLabelText("회전 간격 (도)"), { target: { value: "0" } });
    fireEvent.click(screen.getByTestId("bg3d-array-execute"));
    expect(execute).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("회전 간격 (도)"), { target: { value: "-45" } });
    fireEvent.change(screen.getByLabelText("회전 중심 X (m)"), { target: { value: "" } });
    expect(screen.getByRole("alert").textContent).toContain("중심 X/Y/Z");
    fireEvent.submit(screen.getByRole("form", { name: "반복 배치 설정" }));
    expect(execute).not.toHaveBeenCalled();
  });

  it("IME 조합 중 Enter와 keyCode 229 및 조합 중 submit은 무시하고 일반 Enter만 실행한다", () => {
    const execute = successfulCommand();
    render(<StudioBg3dSelectionArrayPanel selection={READY} onExecuteSelectionArray={execute} />);
    const input = screen.getByLabelText("복제 명령");
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.submit(screen.getByRole("form", { name: "반복 배치 설정" }));
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(execute).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("장면 예산을 넘는 사본 수를 예고하고 전체 명령을 막는다", () => {
    const execute = successfulCommand();
    render(<StudioBg3dSelectionArrayPanel selection={{ ...READY, availableNodeCount: 5 }} onExecuteSelectionArray={execute} />);
    expect(screen.getByRole("alert").textContent).toContain("사본 6개는 현재 추가 가능한 도형 5개를 초과");
    fireEvent.click(screen.getByTestId("bg3d-array-execute"));
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(["선택한 모델은 반복 배치할 수 없습니다.", "잠긴 도형이 선택되어 있습니다.", "숨긴 도형이 선택되어 있습니다."])("호스트의 부적합 선택 안내를 유지하고 일부 도형만 배치하지 않는다: %s", (blockedReason) => {
    const execute = successfulCommand();
    render(<StudioBg3dSelectionArrayPanel selection={{ ...READY, blockedReason }} onExecuteSelectionArray={execute} />);
    expect(screen.getByTestId("bg3d-array-selection-blocked").textContent).toBe(blockedReason);
    fireEvent.submit(screen.getByRole("form", { name: "반복 배치 설정" }));
    expect(execute).not.toHaveBeenCalled();
  });

  it("선택이 없거나 장면 연결이 없거나 편집이 잠기면 명령을 실행하지 않는다", () => {
    const execute = successfulCommand();
    const view = render(<StudioBg3dSelectionArrayPanel />);
    expect(screen.getByTestId("bg3d-array-execute")).toHaveProperty("disabled", true);
    view.rerender(<StudioBg3dSelectionArrayPanel selection={{ ...READY, selectedPrimitiveCount: 0 }} onExecuteSelectionArray={execute} />);
    expect(screen.getByTestId("bg3d-array-selection-blocked").textContent).toContain("도형을 선택");
    view.rerender(<StudioBg3dSelectionArrayPanel selection={READY} disabled onExecuteSelectionArray={execute} />);
    expect(screen.getByTestId("bg3d-array-selection-blocked").textContent).toContain("편집이 잠겨");
    fireEvent.submit(screen.getByRole("form", { name: "반복 배치 설정" }));
    expect(execute).not.toHaveBeenCalled();
  });

  it("실행 중 예외는 실패로 안내하고 완료를 표시하지 않는다", () => {
    const execute = vi.fn<StudioBg3dExecuteSelectionArray>(() => { throw new Error("편집 명령 실패"); });
    render(<StudioBg3dSelectionArrayPanel selection={READY} onExecuteSelectionArray={execute} />);
    fireEvent.click(screen.getByTestId("bg3d-array-execute"));
    expect(screen.getByTestId("bg3d-array-result").textContent).toContain("반복 배치하지 못했습니다");
    expect(screen.getByTestId("bg3d-array-result").textContent).not.toContain("추가했습니다");
  });

  it("실행 시점에 선택이 바뀌어 호스트가 거부하면 거부 이유만 표시한다", () => {
    const execute = vi.fn<StudioBg3dExecuteSelectionArray>(() => ({
      ok: false, code: "selection-unavailable", messageKo: "숨기거나 잠긴 도형은 반복 배치할 수 없습니다.",
    }));
    render(<StudioBg3dSelectionArrayPanel selection={READY} onExecuteSelectionArray={execute} />);
    fireEvent.click(screen.getByTestId("bg3d-array-execute"));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("bg3d-array-result").textContent).toBe("숨기거나 잠긴 도형은 반복 배치할 수 없습니다.");
  });
});
