// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioHybridDccComponentSelection, mutateStudioHybridDccComponentSelection, type StudioHybridDccComponentSelection } from "./studio-hybrid-dcc-component-selection";
import { StudioHybridDccFaceModelingTools } from "./StudioHybridDccFaceModelingTools";
import { createStudioHybridDccWorkspace, workspaceAddUnitCube, workspaceComponentSelectionSource, workspaceUndo, type StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";
import { useStudioHybridDccFaceModeling } from "./useStudioHybridDccFaceModeling";

afterEach(cleanup);

function initialSelection(workspace: StudioHybridDccWorkspace): StudioHybridDccComponentSelection {
  const source = workspaceComponentSelectionSource(workspace);
  if (!source) throw new Error("편집할 메시가 없음");
  const selected = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), {
    mode: "face", operation: "replace", ids: [3], activeId: 3, source,
  });
  if (!selected.ok) throw new Error("선택에 실패함");
  return selected.value;
}

function meshHash(workspace: StudioHybridDccWorkspace): string {
  const record = workspace.session.state.geometry.records.cube;
  if (!record) throw new Error("정본 메시가 없음");
  return record.meshHash;
}

function setup(readOnly = false) {
  const original = workspaceAddUnitCube(createStudioHybridDccWorkspace("follow-me-ui"), "cube");
  const observed = { workspace: original };
  const ran = vi.fn<(label: string) => void>();
  function Harness() {
    const [workspace, setWorkspace] = useState(original);
    const [selection, setSelection] = useState(() => initialSelection(original));
    const model = useStudioHybridDccFaceModeling({ workspace, componentSelection: selection, onSelectAsset: () => undefined }, readOnly ? undefined : (label, edit) => {
      const result = edit(workspace, selection);
      ran(label);
      setWorkspace(result.workspace);
      if (result.selection) setSelection(result.selection);
    });
    useEffect(() => { observed.workspace = workspace; }, [workspace]);
    return <>
      <output data-testid="preview-hash">{meshHash(model.viewportProps.workspace)}</output>
      <StudioHybridDccFaceModelingTools model={model} />
    </>;
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: /면 모델링 ·/ }));
  if (!readOnly) fireEvent.click(screen.getByRole("radio", { name: "따라 만들기" }));
  return { observed, original, ran };
}

describe("실제 선택 면의 Follow Me 화면 명령", () => {
  it("기본 경로와 꺾인 경로의 미리보기는 문서를 바꾸지 않고 확정은 Undo 하나다", () => {
    const { observed, original, ran } = setup();
    fireEvent.click(screen.getByRole("button", { name: "법선 방향 경로 만들기" }));
    expect(screen.getByLabelText("따라 만들기 경로 · X, Y, Z")).not.toHaveProperty("value", "");
    expect(screen.getByTestId("preview-hash").textContent).not.toBe(meshHash(original));
    expect(observed.workspace).toBe(original);
    fireEvent.change(screen.getByLabelText("따라 만들기 경로 · X, Y, Z"), { target: { value: "0,0.5,0\n0,2.5,0\n2,2.5,0" } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "적용", exact: true }));
    expect(ran).toHaveBeenCalledExactlyOnceWith("면 따라 만들기");
    expect(meshHash(observed.workspace)).not.toBe(meshHash(original));
    expect(observed.workspace.session.undoStack).toHaveLength(original.session.undoStack.length + 1);
    expect(meshHash(workspaceUndo(observed.workspace))).toBe(meshHash(original));
  });
  it("좌표 오류와 닫힌 경로를 거부하고 Escape는 미리보기만 취소한다", () => {
    const { observed, original, ran } = setup();
    const field = screen.getByLabelText("따라 만들기 경로 · X, Y, Z");
    fireEvent.change(field, { target: { value: "0,0.5,0\nNaN,2,0" } });
    expect(screen.getByRole("alert").textContent).toContain("경로는 2~64개 점");
    fireEvent.click(screen.getByRole("button", { name: "적용", exact: true }));
    expect(ran).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "0,0.5,0\n0,2.5,0\n0,0.5,0" } });
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.keyDown(field, { key: "Escape" });
    expect(field).toHaveProperty("value", "");
    expect(observed.workspace).toBe(original);
    expect(ran).not.toHaveBeenCalled();
  });
  it("한글 입력 조합의 Ctrl+Enter는 확정하지 않는다", () => {
    const { ran } = setup();
    fireEvent.click(screen.getByRole("button", { name: "법선 방향 경로 만들기" }));
    const field = screen.getByLabelText("따라 만들기 경로 · X, Y, Z");
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true, isComposing: true });
    expect(ran).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });
    expect(ran).toHaveBeenCalledOnce();
  });
  it("읽기 전용 화면에서는 따라 만들기 도구를 잠근다", () => {
    setup(true);
    expect(screen.getByRole("radio", { name: "따라 만들기" })).toHaveProperty("disabled", true);
    expect(screen.queryByTestId("studio-follow-me-path")).toBeNull();
  });
});
