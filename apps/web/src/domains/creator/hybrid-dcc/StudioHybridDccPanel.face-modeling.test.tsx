// @vitest-environment jsdom

/**
 * 패널 → 뷰포트 래퍼 → 면 모델링 작업대 연결: 실제 패널의 실행 큐·되돌리기 버튼·문서 변경 알림을 쓴다.
 * WebGL 캔버스는 jsdom에서 그릴 수 없으므로 코어 뷰포트만 같은 속성(선택 콜백·작업공간·편집 잠금)을
 * 받는 가벼운 대역으로 바꾼다. 그 밖의 래퍼·도구·패널은 모두 실제 코드다.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioHybridDccPanel } from "./StudioHybridDccPanel";

import type { StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";
import type { StudioHybridDccViewportProps } from "./StudioHybridDccViewportCore";

const TOP_FACE = 3;

vi.mock("./StudioHybridDccViewportCore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./StudioHybridDccViewportCore")>();
  return {
    ...actual,
    StudioHybridDccViewport: (props: StudioHybridDccViewportProps) => {
      const assetId = props.workspace.activeAssetId;
      const record = assetId ? props.workspace.session.state.geometry.records[assetId] : undefined;
      return (
        <div
          data-testid="core-probe"
          data-mesh-hash={record?.meshHash ?? ""}
          data-faces={record?.mesh.faces.length ?? 0}
          data-editing-disabled={String(props.editingDisabled ?? false)}
          data-selection={`${props.componentSelection?.mode ?? "none"}:${props.componentSelection?.elementIds.join(",") ?? ""}`}
        >
          <button type="button" onClick={() => props.onComponentSelectionModeChange?.("face")}>모드 면</button>
          <button
            type="button"
            onClick={() => props.onSelectComponent?.(assetId ?? "", "face", TOP_FACE, "replace")}
          >
            윗면 선택
          </button>
        </div>
      );
    },
  };
});

afterEach(cleanup);

function probe(): HTMLElement {
  return screen.getByTestId("core-probe");
}

async function startWithTopFaceSelected(onWorkspaceChange = vi.fn()) {
  render(<StudioHybridDccPanel onWorkspaceChange={onWorkspaceChange} />);
  fireEvent.click(screen.getByRole("button", { name: /큐브 추가/u }));
  await waitFor(() => expect(probe().getAttribute("data-faces")).toBe("6"));
  fireEvent.click(screen.getByRole("button", { name: "모드 면" }));
  fireEvent.click(screen.getByRole("button", { name: "윗면 선택" }));
  await waitFor(() => expect(probe().getAttribute("data-selection")).toBe(`face:${TOP_FACE}`));
  return { onWorkspaceChange, originalHash: probe().getAttribute("data-mesh-hash")! };
}

function openFaceModeling() {
  fireEvent.click(screen.getByRole("button", { name: /^면 모델링 · 밀기\/당기기/u }));
  return screen.getByRole("region", { name: "면 모델링 작업대" });
}

function lastWorkspace(onWorkspaceChange: ReturnType<typeof vi.fn>): StudioHybridDccWorkspace {
  return onWorkspaceChange.mock.calls.at(-1)![0] as StudioHybridDccWorkspace;
}

describe("패널 안의 면 모델링", () => {
  it("미리보기 동안은 패널 문서가 바뀌지 않고, Enter 확정은 패널 실행 큐로 한 번 기록되며 되돌리기 한 번에 복원된다", async () => {
    const { onWorkspaceChange, originalHash } = await startWithTopFaceSelected();
    const changesBefore = onWorkspaceChange.mock.calls.length;
    const undoDepthBefore = lastWorkspace(onWorkspaceChange).session.undoStack.length;
    openFaceModeling();
    const field = screen.getByRole("textbox", { name: "거리 (m)" });

    fireEvent.change(field, { target: { value: "0.3" } });
    // 뷰포트(대역)에는 결과가 보이고 편집은 잠기며, 패널의 문서 변경 알림은 없다.
    expect(probe().getAttribute("data-mesh-hash")).not.toBe(originalHash);
    expect(probe().getAttribute("data-editing-disabled")).toBe("true");
    expect(onWorkspaceChange.mock.calls.length).toBe(changesBefore);

    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => {
      expect(lastWorkspace(onWorkspaceChange).session.undoStack).toHaveLength(undoDepthBefore + 1);
    });
    await waitFor(() => expect(probe().getAttribute("data-editing-disabled")).toBe("false"));
    const committedHash = probe().getAttribute("data-mesh-hash")!;
    expect(committedHash).not.toBe(originalHash);
    // 새 메시 기준의 면 선택이 이어진다.
    expect(probe().getAttribute("data-selection")).toMatch(/^face:\d/u);
    expect(screen.getByText(/면 밀기\/당기기 완료/u)).toBeTruthy();
    expect(document.querySelector("[data-studio-hybrid-dcc-face-modeling-state]")!.getAttribute("data-state")).toBe("idle");

    fireEvent.click(screen.getByRole("button", { name: "마지막 3D 편집 되돌리기" }));
    await waitFor(() => expect(probe().getAttribute("data-mesh-hash")).toBe(originalHash));
    fireEvent.click(screen.getByRole("button", { name: "되돌린 3D 편집 다시 실행" }));
    await waitFor(() => expect(probe().getAttribute("data-mesh-hash")).toBe(committedHash));
  });

  it("안쪽 테두리를 확정하면 면이 늘고, Esc로 취소한 미리보기는 기록을 남기지 않는다", async () => {
    const { onWorkspaceChange, originalHash } = await startWithTopFaceSelected();
    const undoDepthBefore = lastWorkspace(onWorkspaceChange).session.undoStack.length;
    openFaceModeling();
    fireEvent.click(screen.getByRole("radio", { name: "안쪽 테두리" }));
    const field = screen.getByRole("textbox", { name: "거리 (m)" });

    fireEvent.change(field, { target: { value: "0.1" } });
    expect(Number(probe().getAttribute("data-faces"))).toBeGreaterThan(6);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(probe().getAttribute("data-mesh-hash")).toBe(originalHash);
    expect(lastWorkspace(onWorkspaceChange).session.undoStack).toHaveLength(undoDepthBefore);

    fireEvent.change(field, { target: { value: "0.1" } });
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    await waitFor(() => {
      expect(lastWorkspace(onWorkspaceChange).session.undoStack).toHaveLength(undoDepthBefore + 1);
    });
    await waitFor(() => expect(Number(probe().getAttribute("data-faces"))).toBeGreaterThan(6));
    expect(screen.getByText(/면 안쪽 테두리 완료/u)).toBeTruthy();
  });

  it("범위를 벗어난 거리는 패널 문서를 건드리지 않고 이유를 보여 준다", async () => {
    const { onWorkspaceChange } = await startWithTopFaceSelected();
    const changesBefore = onWorkspaceChange.mock.calls.length;
    const section = openFaceModeling();
    fireEvent.click(screen.getByRole("radio", { name: "안쪽 테두리" }));
    const field = screen.getByRole("textbox", { name: "거리 (m)" });
    fireEvent.change(field, { target: { value: "9" } });
    expect(within(section).getByRole("alert").textContent).toMatch(/최대 [0-9.]+ m까지 입력할 수 있습니다/u);
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onWorkspaceChange.mock.calls.length).toBe(changesBefore);
  });

  it("면이 선택되지 않은 상태에서는 면 모드와 면 선택을 안내한다", async () => {
    render(<StudioHybridDccPanel />);
    fireEvent.click(screen.getByRole("button", { name: /큐브 추가/u }));
    await waitFor(() => expect(probe().getAttribute("data-faces")).toBe("6"));
    openFaceModeling();
    expect(screen.getByRole("textbox", { name: "거리 (m)" })).toHaveProperty("disabled", true);
    expect(screen.getByText(/면을 하나 이상 선택하세요/u)).toBeTruthy();
  });
});
