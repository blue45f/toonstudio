// @vitest-environment jsdom
/** WebGL 클릭 표면만 대체하고 실제 source·workspace·면 선택·도구·커널을 연결한다. */
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { analyzeStudioEditableMeshIntegrity } from "../hybrid-dcc/studio-hybrid-dcc-face-modeling-mesh";
import { mutateStudioHybridDccComponentSelection } from "../hybrid-dcc/studio-hybrid-dcc-component-selection";
import { commitStudioHybridDccFaceModeling } from "../hybrid-dcc/studio-hybrid-dcc-face-modeling-workspace";
import { workspaceComponentSelectionSource } from "../hybrid-dcc/studio-hybrid-dcc-workspace";
import { createDefaultStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import { captureStudioBg3dPrimitiveEditSource } from "./studio-bg3d-primitive-edit-source";
import { createStudioBg3dPrimitiveEditWorkspace, exportStudioBg3dPrimitiveEditWorkspace } from "./studio-bg3d-primitive-edit-workspace";
import { StudioBg3dPrimitiveFaceEditor } from "./StudioBg3dPrimitiveFaceEditor";

import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { StudioHybridDccViewportProps } from "../hybrid-dcc/StudioHybridDccViewportCore";
import type { StudioBg3dPrimitiveEditWorkspace } from "./studio-bg3d-primitive-edit-workspace";
import type { StudioBg3dPrimitiveFaceApplyResult, StudioBg3dPrimitiveFaceEditorProps } from "./StudioBg3dPrimitiveFaceEditor";

vi.mock("../hybrid-dcc/StudioHybridDccViewportCore", () => ({
  StudioHybridDccViewport: (props: StudioHybridDccViewportProps) => {
    const assetId = props.workspace.activeAssetId;
    const record = assetId ? props.workspace.session.state.geometry.records[assetId] : undefined;
    return <div aria-label="단위 시험용 면 클릭 표면">
      <button type="button" disabled={props.editingDisabled} onClick={() => {
        if (assetId) props.onSelectComponent?.(assetId, "face", 2, "replace");
      }}>실제 면 2 선택</button>
      <output data-testid="viewport-selection">{props.componentSelection?.elementIds.join(",")}</output>
      <output data-testid="viewport-hash">{record?.meshHash}</output>
      <output data-testid="viewport-top">{record ? Math.max(...record.mesh.vertices.map((vertex) => vertex.position.y)) : "missing"}</output>
      <output data-testid="viewport-command-count">{props.workspace.session.state.commandCount}</output>
      <output data-testid="viewport-asset-count">{Object.keys(props.workspace.session.state.geometry.records).length}</output>
    </div>;
  },
}));

function context(): StudioBg3dPrimitiveEditWorkspace {
  const primitive: BgPrimitive = { id: "original-box", kind: "box", name: "실제 원본 상자", color: "#c9a876",
    position: [2.25, 0.75, -3.5], rotation: [0.31, -0.63, 0.24], scale: [1.8, 0.6, 2.2] };
  const captured = captureStudioBg3dPrimitiveEditSource({ open: true,
    selectedIdsRef: { current: new Set([primitive.id]) }, modalAssetSessionRef: { current: {} },
    isPrimitiveEditInteractionLocked: () => false,
    attachmentByStorageModelIdRef: { current: new Map() },
    physicsRuntimeSourceRef: { current: { primitives: [primitive], customModels: [], document: createDefaultStudioBg3dSceneDocument() } } });
  if (!captured.ok) throw new Error(captured.messageKo);
  const prepared = createStudioBg3dPrimitiveEditWorkspace(captured.snapshot);
  if (!prepared.ok) throw new Error(prepared.messageKo);
  return prepared.value;
}

function deferred() {
  let resolve: ((result: StudioBg3dPrimitiveFaceApplyResult) => void) | undefined;
  const promise = new Promise<StudioBg3dPrimitiveFaceApplyResult>((complete) => { resolve = complete; });
  return { promise, finish: (result: StudioBg3dPrimitiveFaceApplyResult) => {
    if (!resolve) throw new Error("대기 요청이 필요합니다.");
    resolve(result);
  } };
}

function renderEditor(prepared = context(), onApply: StudioBg3dPrimitiveFaceEditorProps["onApply"] = async () => ({ ok: true })) {
  const applied = vi.fn<StudioBg3dPrimitiveFaceEditorProps["onApply"]>(onApply);
  const closed = vi.fn();
  function Host() {
    const [open, setOpen] = useState(false);
    return <div>
      <button type="button" onClick={() => setOpen(true)}>원본 면 편집 열기</button>
      {open ? <StudioBg3dPrimitiveFaceEditor context={prepared} onApply={applied} onClose={() => { closed(); setOpen(false); }} /> : null}
    </div>;
  }
  const view = render(<Host />);
  const opener = screen.getByRole("button", { name: "원본 면 편집 열기" });
  opener.focus(); fireEvent.click(opener);
  return { prepared, applied, closed, opener, view };
}

function originalApply(): HTMLButtonElement { return screen.getByRole("button", { name: "배경 원본에 반영" }); }
function beginPreview(distance = "0.25") {
  fireEvent.click(screen.getByRole("button", { name: "실제 면 2 선택" }));
  expect(screen.getByTestId("viewport-selection").textContent).toBe("2");
  fireEvent.click(screen.getByRole("button", { name: /^면 모델링 · 밀기\/당기기/u }));
  const field = screen.getByRole("textbox", { name: "거리 (m)" });
  fireEvent.change(field, { target: { value: distance } });
  return field;
}
async function commitTool() {
  fireEvent.click(screen.getByRole("button", { name: "적용" }));
  await waitFor(() => expect(originalApply().disabled).toBe(false));
}

beforeEach(() => {
  // jsdom에는 레이아웃이 없으므로 실제 모달 focus 계약에 필요한 가시성 크기만 제공한다.
  const rectangle = new DOMRect(0, 0, 120, 30);
  const rectangles: DOMRectList = { 0: rectangle, length: 1, item: (index) => index === 0 ? rectangle : null,
    [Symbol.iterator]: () => [rectangle][Symbol.iterator]() };
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue(rectangles);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("실제 원본 상자의 정밀 면 편집 dialog", () => {
  it("최초 자산 등록은 Undo하지 못하며 의미 있는 dialog·focus·Tab·닫기 복귀를 제공한다", () => {
    const previousOverflow = document.body.style.overflow;
    const host = renderEditor();
    const dialog = screen.getByRole("dialog", { name: "선택한 상자 면 편집" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.body.style.overflow).toBe("hidden");
    expect(within(dialog).getByText("실제 원본 상자")).toBeTruthy();
    const close = screen.getByRole("button", { name: "면 편집 닫기" });
    expect(document.activeElement).toBe(close);
    const undo: HTMLButtonElement = screen.getByRole("button", { name: "면 편집 실행 취소" });
    expect(undo.disabled).toBe(true);
    expect(originalApply().disabled).toBe(true);
    fireEvent.click(undo);
    expect(screen.getByTestId("viewport-asset-count").textContent).toBe("1");
    expect(screen.getByTestId("viewport-hash").textContent).toBe(host.prepared.initialMeshHash);
    const enabled = dialog.querySelectorAll<HTMLButtonElement>("button:not([disabled])");
    const last = enabled.item(enabled.length - 1);
    last.focus(); fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.click(close);
    expect(host.closed).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(host.opener);
    expect(document.body.style.overflow).toBe(previousOverflow);
    expect(host.applied).not.toHaveBeenCalled();
  });

  it("실제 면2 preview→도구확정 뒤에만 편집된 workspace를 원본 callback에 전달한다", async () => {
    const host = renderEditor();
    const initialHash = host.prepared.initialMeshHash;
    expect(host.prepared.geometry.faceSources[2]?.sourceTriangleIds).toEqual([4, 5]);
    beginPreview();
    expect(screen.getByTestId("viewport-hash").textContent).not.toBe(initialHash);
    expect(screen.getByTestId("viewport-top").textContent).toBe("0.75");
    expect(screen.getByTestId("viewport-command-count").textContent).toBe("1");
    expect(host.prepared.workspace.session.state.geometry.records[host.prepared.assetId]?.meshHash).toBe(initialHash);
    expect(originalApply().disabled).toBe(true);
    fireEvent.click(originalApply());
    expect(host.applied).not.toHaveBeenCalled();
    const applyWhilePreviewing = originalApply();
    act(() => { fireEvent.click(screen.getByRole("button", { name: "적용" })); fireEvent.click(applyWhilePreviewing); });
    expect(host.applied).not.toHaveBeenCalled();
    await waitFor(() => expect(originalApply().disabled).toBe(false));
    expect(screen.getByTestId("viewport-command-count").textContent).toBe("2");
    fireEvent.click(originalApply());
    await waitFor(() => expect(host.closed).toHaveBeenCalledOnce());
    expect(host.applied).toHaveBeenCalledOnce();
    const [receivedContext, workspace, signal] = host.applied.mock.calls[0];
    expect(receivedContext).toBe(host.prepared);
    expect(signal).toBeInstanceOf(AbortSignal);
    const record = workspace.session.state.geometry.records[host.prepared.assetId];
    expect(record.meshHash).not.toBe(initialHash);
    expect(record.mesh.faces).toHaveLength(6);
    expect(analyzeStudioEditableMeshIntegrity(record.mesh).signedVolume).toBeCloseTo(1.25);
    expect(workspace.session.undoStack).toHaveLength(host.prepared.initialUndoDepth + 1);
    expect(workspace.session.state.objectTransforms[host.prepared.assetId]).toEqual(host.prepared.initialTransform);
    expect(exportStudioBg3dPrimitiveEditWorkspace(host.prepared, workspace).ok).toBe(true);
    expect(host.prepared.workspace.session.state.geometry.records[host.prepared.assetId]?.meshHash).toBe(initialHash);
  });

  it("로컬 Undo/Redo는 원본 반영 없이 원래 메시와 확정 메시 사이를 이동한다", async () => {
    const host = renderEditor(); beginPreview(); await commitTool();
    const editedHash = screen.getByTestId("viewport-hash").textContent;
    fireEvent.click(screen.getByRole("button", { name: "면 편집 실행 취소" }));
    expect(screen.getByTestId("viewport-hash").textContent).toBe(host.prepared.initialMeshHash);
    expect(originalApply().disabled).toBe(true);
    expect(screen.getByRole("button", { name: "면 편집 실행 취소" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "면 편집 다시 실행" }));
    expect(screen.getByTestId("viewport-hash").textContent).toBe(editedHash);
    expect(originalApply().disabled).toBe(false);
    expect(host.applied).not.toHaveBeenCalled();
    expect(host.closed).not.toHaveBeenCalled();
  });

  it("미리보기에서 Escape는 도구만 취소하고 다음 Escape로 dialog를 닫는다", () => {
    const host = renderEditor();
    const field = beginPreview();
    fireEvent.keyDown(field, { key: "Escape" });
    expect(host.closed).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "선택한 상자 면 편집" })).toBeTruthy();
    expect(screen.getByTestId("viewport-hash").textContent).toBe(host.prepared.initialMeshHash);
    expect(screen.getByTestId("viewport-command-count").textContent).toBe("1");
    expect(originalApply().disabled).toBe(true);
    expect(host.applied).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("button", { name: "면 편집 닫기" }), { key: "Escape" });
    expect(host.closed).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(host.opener);
  });

  it.each(["Ctrl", "Cmd"])("%s+Z·Shift+Z·Y는 초기 등록을 보존하며 로컬 Undo/Redo만 실행하고 전파하지 않는다", async (modifier) => {
    const host = renderEditor(), background = vi.fn();
    const target = screen.getByRole("button", { name: "면 편집 닫기" });
    const press = (key: string, shiftKey = false) => {
      const event = createEvent.keyDown(target, { key, shiftKey, ctrlKey: modifier === "Ctrl", metaKey: modifier === "Cmd" });
      fireEvent(target, event); expect(event.defaultPrevented).toBe(true);
    };
    window.addEventListener("keydown", background);
    try {
      press("z"); press("z"); press("z", true); press("y");
      expect(screen.getByTestId("viewport-hash").textContent).toBe(host.prepared.initialMeshHash);
      expect(screen.getByTestId("viewport-asset-count").textContent).toBe("1");
      expect(screen.getByTestId("viewport-command-count").textContent).toBe("1");
      beginPreview(); await commitTool();
      const editedHash = screen.getByTestId("viewport-hash").textContent;
      press("z"); press("z");
      expect(screen.getByTestId("viewport-hash").textContent).toBe(host.prepared.initialMeshHash);
      expect(screen.getByTestId("viewport-asset-count").textContent).toBe("1");
      press("z", true); expect(screen.getByTestId("viewport-hash").textContent).toBe(editedHash);
      press("z"); press("y"); press("y");
      expect(screen.getByTestId("viewport-hash").textContent).toBe(editedHash);
      expect(background).not.toHaveBeenCalled(); expect(host.applied).not.toHaveBeenCalled();
    } finally { window.removeEventListener("keydown", background); }
  });

  it("preview와 반영 대기 중 keyboard history를 막고 입력 필드의 native Undo는 가로채지 않는다", async () => {
    const pending = deferred(), host = renderEditor(context(), () => pending.promise);
    const field = beginPreview(), previewHash = screen.getByTestId("viewport-hash").textContent;
    const target = screen.getByRole("button", { name: "면 편집 닫기" });
    const nativeUndo = createEvent.keyDown(field, { key: "z", ctrlKey: true });
    fireEvent(field, nativeUndo); expect(nativeUndo.defaultPrevented).toBe(false);
    const composing = createEvent.keyDown(target, { key: "z", ctrlKey: true, isComposing: true });
    fireEvent(target, composing); expect(composing.defaultPrevented).toBe(false);
    fireEvent.keyDown(target, { key: "z", ctrlKey: true });
    fireEvent.keyDown(target, { key: "y", metaKey: true });
    expect(screen.getByTestId("viewport-hash").textContent).toBe(previewHash);
    expect(screen.getByTestId("viewport-command-count").textContent).toBe("1");
    await commitTool();
    const editedHash = screen.getByTestId("viewport-hash").textContent;
    fireEvent.click(originalApply());
    fireEvent.keyDown(target, { key: "z", ctrlKey: true });
    fireEvent.keyDown(target, { key: "z", shiftKey: true, metaKey: true });
    expect(screen.getByTestId("viewport-hash").textContent).toBe(editedHash);
    expect(screen.getByTestId("viewport-command-count").textContent).toBe("2");
    expect(host.applied).toHaveBeenCalledOnce();
    await act(async () => { pending.finish({ ok: false, messageKo: "다시 확인하세요." }); await pending.promise; });
    expect(host.closed).not.toHaveBeenCalled();
    expect(screen.getByTestId("viewport-hash").textContent).toBe(editedHash);
  });

  it.each(["false", "throw"])("원본 callback %s 뒤 편집을 보존하고 같은 결과를 재시도한다", async (failure) => {
    let attempts = 0;
    const host = renderEditor(context(), async () => {
      attempts += 1;
      if (attempts === 1) {
        if (failure === "throw") throw new Error("persistence failed");
        return { ok: false, messageKo: "원본 반영을 거부했습니다. 다시 시도하세요." };
      }
      return { ok: true };
    });
    beginPreview(); await commitTool();
    const editedHash = screen.getByTestId("viewport-hash").textContent;
    fireEvent.click(originalApply());
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(failure === "false" ? "원본 반영을 거부" : "편집 결과를 원본에 반영하지 못했습니다"));
    expect(host.closed).not.toHaveBeenCalled();
    expect(screen.getByTestId("viewport-hash").textContent).toBe(editedHash);
    expect(originalApply().disabled).toBe(false);
    fireEvent.click(originalApply());
    await waitFor(() => expect(host.closed).toHaveBeenCalledOnce());
    expect(host.applied).toHaveBeenCalledTimes(2);
    expect(host.applied.mock.calls[0][1]).toBe(host.applied.mock.calls[1][1]);
  });

  it("원본 반영 중 중복 반영·닫기·Escape·면 편집을 막고 완료 후 닫는다", async () => {
    const pending = deferred(), host = renderEditor(context(), () => pending.promise);
    beginPreview(); await commitTool();
    const apply = originalApply();
    fireEvent.click(apply); fireEvent.click(apply); fireEvent.click(apply);
    expect(host.applied).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "배경 원본에 반영 중" })).toHaveProperty("disabled", true);
    const close = screen.getByRole("button", { name: "면 편집 닫기" });
    expect(close).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "실제 면 2 선택" })).toHaveProperty("disabled", true);
    fireEvent.click(close); fireEvent.keyDown(close, { key: "Escape" });
    expect(host.closed).not.toHaveBeenCalled();
    await act(async () => { pending.finish({ ok: true }); await pending.promise; });
    expect(host.closed).toHaveBeenCalledOnce();
  });

  it("반영 중 unmount는 실제 AbortSignal을 중단하고 늦은 성공을 무시한다", async () => {
    const pending = deferred(), host = renderEditor(context(), () => pending.promise);
    beginPreview(); await commitTool(); fireEvent.click(originalApply());
    const signal = host.applied.mock.calls[0][2];
    expect(signal.aborted).toBe(false);
    host.view.unmount();
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe("primitive-editor-closed");
    await act(async () => { pending.finish({ ok: true }); await pending.promise; });
    expect(host.closed).not.toHaveBeenCalled();
  });

  it("실제 다면 편집 결과의 debounce 대기 중에도 외부 반영을 막는다", () => {
    const base = context(), source = workspaceComponentSelectionSource(base.workspace);
    if (!source) throw new Error("실제 면 원본이 필요합니다.");
    const selected = mutateStudioHybridDccComponentSelection(base.selection, { mode: "face", operation: "replace", ids: [2], activeId: 2, source });
    if (!selected.ok) throw new Error("면 선택이 필요합니다.");
    const edited = commitStudioHybridDccFaceModeling(base.workspace, selected.value, {
      tool: "follow-me", path: Array.from({ length: 52 }, (_, index) => ({ x: 0, y: 0.5 + index * 0.05, z: 0 })),
    });
    const large = { ...base, workspace: edited.workspace, selection: edited.selection ?? selected.value };
    expect(large.workspace.session.state.geometry.records[base.assetId].mesh.faces.length).toBeGreaterThan(400);
    vi.useFakeTimers();
    const host = renderEditor(large);
    expect(originalApply().disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /^면 모델링 · 밀기\/당기기/u }));
    fireEvent.change(screen.getByRole("textbox", { name: "거리 (m)" }), { target: { value: "0.1" } });
    expect(screen.getByText(/입력을 멈추면 미리보기를 계산/u)).toBeTruthy();
    expect(originalApply().disabled).toBe(true);
    fireEvent.click(originalApply());
    expect(host.applied).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(originalApply().disabled).toBe(false);
    expect(host.applied).not.toHaveBeenCalled();
  });
});
