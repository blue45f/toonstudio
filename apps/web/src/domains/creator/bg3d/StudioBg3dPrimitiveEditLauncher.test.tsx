// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dPrimitiveEditLauncher } from "./StudioBg3dPrimitiveEditLauncher";
import { captureStudioBg3dPrimitiveEditSource } from "./studio-bg3d-primitive-edit-source";
import { createStudioBg3dPrimitiveEditWorkspace, exportStudioBg3dPrimitiveEditWorkspace } from "./studio-bg3d-primitive-edit-workspace";
import { createDefaultStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";

import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { StudioHybridDccViewportProps } from "../hybrid-dcc/StudioHybridDccViewportCore";
import type { StudioBg3dPrimitiveEditBeginResult, StudioBg3dPrimitiveEditPorts } from "./studio-bg3d-primitive-edit-ports";

// lazy 편집기·도구·커널은 실제 구현이고 WebGL 클릭 표면만 대체한다.
vi.mock("../hybrid-dcc/StudioHybridDccViewportCore", () => ({
  StudioHybridDccViewport: (props: StudioHybridDccViewportProps) => {
    const assetId = props.workspace.activeAssetId;
    const record = assetId ? props.workspace.session.state.geometry.records[assetId] : undefined;
    return <div>
      <button type="button" disabled={props.editingDisabled} onClick={() => {
        if (assetId) props.onSelectComponent?.(assetId, "face", 2, "replace");
      }}>실제 원본 면 2 선택</button>
      <output data-testid="launcher-source-id">{assetId}</output>
      <output data-testid="launcher-mesh-hash">{record?.meshHash}</output>
    </div>;
  },
}));

type LauncherProps = StudioBg3dPrimitiveEditPorts & { readonly disabled?: boolean };

function fixture(id = "source-box") {
  const primitive: BgPrimitive = { id, kind: "box", name: `원본 ${id}`, color: "#c9a876",
    position: [2.25, 0.75, -3.5], rotation: [0.31, -0.63, 0.24], scale: [1.8, 0.6, 2.2] };
  const captured = captureStudioBg3dPrimitiveEditSource({ open: true, selectedIdsRef: { current: new Set([id]) },
    modalAssetSessionRef: { current: {} }, attachmentByStorageModelIdRef: { current: new Map() },
    isPrimitiveEditInteractionLocked: () => false,
    physicsRuntimeSourceRef: { current: { primitives: [primitive], customModels: [], document: createDefaultStudioBg3dSceneDocument() } } });
  if (!captured.ok) throw new Error(captured.messageKo);
  const prepared = createStudioBg3dPrimitiveEditWorkspace(captured.snapshot);
  if (!prepared.ok) throw new Error(prepared.messageKo);
  const context = prepared.value;
  const begin = vi.fn<NonNullable<StudioBg3dPrimitiveEditPorts["onBeginPrimitiveEdit"]>>().mockResolvedValue({ ok: true, context });
  const apply = vi.fn<NonNullable<StudioBg3dPrimitiveEditPorts["onApplyPrimitiveEdit"]>>().mockResolvedValue({ ok: true });
  const props: LauncherProps = { primitiveEditSelection: { nodeId: id, name: primitive.name ?? "", blockedReason: null },
    onBeginPrimitiveEdit: begin, onApplyPrimitiveEdit: apply };
  return { primitive, context, begin, apply, props };
}

function deferred<T>() {
  let complete: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => { complete = resolve; });
  return { promise, finish(value: T) { if (!complete) throw new Error("대기 요청이 필요합니다."); complete(value); } };
}

function beginButton(): HTMLButtonElement { return screen.getByRole("button", { name: "선택한 상자 면 편집" }); }

beforeEach(() => {
  const rectangle = new DOMRect(0, 0, 120, 30);
  const rectangles: DOMRectList = { 0: rectangle, length: 1, item: (index) => index === 0 ? rectangle : null,
    [Symbol.iterator]: () => [rectangle][Symbol.iterator]() };
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue(rectangles);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("원본 도형 면 편집 launcher의 lazy 진입", () => {
  it.each([
    ["상위 잠금", { disabled: true }],
    ["선택 없음", { primitiveEditSelection: { nodeId: null, name: "", blockedReason: null } }],
    ["지원 불가 원본", { primitiveEditSelection: { nodeId: "source-box", name: "상자", blockedReason: "잠긴 도형입니다." } }],
    ["begin 포트 없음", { onBeginPrimitiveEdit: undefined }],
    ["apply 포트 없음", { onApplyPrimitiveEdit: undefined }],
  ] satisfies readonly (readonly [string, Partial<LauncherProps>])[])("%s이면 편집기를 열거나 begin을 호출하지 않는다", (_label, patch) => {
    const f = fixture(); render(<StudioBg3dPrimitiveEditLauncher {...f.props} {...patch} />);
    expect(beginButton().disabled).toBe(true); fireEvent.click(beginButton());
    expect(f.begin).not.toHaveBeenCalled(); expect(f.apply).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("한 번의 begin만 대기하고 실제 context를 lazy 편집기로 넘겨 편집한 workspace를 반영한다", async () => {
    const f = fixture(), pending = deferred<StudioBg3dPrimitiveEditBeginResult>();
    f.begin.mockReturnValueOnce(pending.promise);
    render(<StudioBg3dPrimitiveEditLauncher {...f.props} />);
    expect(screen.queryByRole("dialog")).toBeNull(); expect(f.begin).not.toHaveBeenCalled();
    const button = beginButton();
    act(() => { fireEvent.click(button); fireEvent.click(button); fireEvent.click(button); });
    expect(f.begin).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "원본 면 편집 준비 중" })).toHaveProperty("disabled", true);
    expect(f.apply).not.toHaveBeenCalled();
    await act(async () => { pending.finish({ ok: true, context: f.context }); await pending.promise; });
    const dialog = await screen.findByRole("dialog", { name: "선택한 상자 면 편집" });
    expect(screen.getByTestId("launcher-source-id").textContent).toBe(f.primitive.id);
    expect(screen.getByTestId("launcher-mesh-hash").textContent).toBe(f.context.initialMeshHash);
    expect(within(dialog).getByText(`원본 ${f.primitive.id}`)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "실제 원본 면 2 선택" }));
    fireEvent.click(screen.getByRole("button", { name: /^면 모델링 · 밀기\/당기기/u }));
    fireEvent.change(screen.getByRole("textbox", { name: "거리 (m)" }), { target: { value: "0.25" } });
    expect(f.apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    const apply: HTMLButtonElement = screen.getByRole("button", { name: "배경 원본에 반영" });
    await waitFor(() => expect(apply.disabled).toBe(false));
    fireEvent.click(apply);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(f.apply).toHaveBeenCalledOnce();
    const [context, workspace, signal] = f.apply.mock.calls[0];
    expect(context).toBe(f.context); expect(signal).toBeInstanceOf(AbortSignal);
    expect(workspace.session.state.geometry.records[context.assetId].meshHash).not.toBe(context.initialMeshHash);
    expect(exportStudioBg3dPrimitiveEditWorkspace(context, workspace).ok).toBe(true);
    expect(context.workspace.session.state.geometry.records[context.assetId].meshHash).toBe(context.initialMeshHash);
    expect(beginButton().disabled).toBe(false);
  });

  it.each(["false", "throw"])("begin %s 오류를 알리고 다음 클릭으로 실제 원본을 다시 준비한다", async (failure) => {
    const f = fixture();
    if (failure === "false") f.begin.mockResolvedValueOnce({ ok: false, messageKo: "원본을 다시 선택하세요." });
    else f.begin.mockRejectedValueOnce(new Error("begin failed"));
    render(<StudioBg3dPrimitiveEditLauncher {...f.props} />);
    fireEvent.click(beginButton());
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(failure === "false" ? "원본을 다시 선택" : "면 편집을 준비하지 못했습니다"));
    expect(screen.queryByRole("dialog")).toBeNull(); expect(beginButton().disabled).toBe(false);
    fireEvent.click(beginButton());
    await screen.findByRole("dialog", { name: "선택한 상자 면 편집" });
    expect(f.begin).toHaveBeenCalledTimes(2); expect(f.apply).not.toHaveBeenCalled();
  });

  it("실제 면 편집 반영이 성공하면 dialog를 닫고 callback의 목록 갱신 안내를 유지한다", async () => {
    const f = fixture(), messageKo = "원본은 반영했지만 모델 목록을 갱신하지 못했습니다. 보관함을 다시 열어 확인하세요.";
    f.apply.mockResolvedValueOnce({ ok: true, messageKo });
    const view = render(<StudioBg3dPrimitiveEditLauncher {...f.props} />); fireEvent.click(beginButton());
    await screen.findByRole("dialog", { name: "선택한 상자 면 편집" });
    fireEvent.click(screen.getByRole("button", { name: "실제 원본 면 2 선택" }));
    fireEvent.click(screen.getByRole("button", { name: /^면 모델링 · 밀기\/당기기/u }));
    fireEvent.change(screen.getByRole("textbox", { name: "거리 (m)" }), { target: { value: "0.25" } });
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    const apply: HTMLButtonElement = screen.getByRole("button", { name: "배경 원본에 반영" });
    await waitFor(() => expect(apply.disabled).toBe(false)); fireEvent.click(apply);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(f.apply).toHaveBeenCalledOnce();
    const [context, workspace] = f.apply.mock.calls[0];
    expect(context).toBe(f.context);
    expect(exportStudioBg3dPrimitiveEditWorkspace(context, workspace).ok).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe(messageKo);
    view.rerender(<StudioBg3dPrimitiveEditLauncher {...f.props}
      primitiveEditSelection={{ nodeId: null, name: "", blockedReason: "선택한 원본은 편집 모델로 변경되었습니다." }} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe(messageKo);
    expect(beginButton().disabled).toBe(true);
  });

  it.each([
    ["선택 B", { primitiveEditSelection: { nodeId: "box-b", name: "다른 상자", blockedReason: null } }],
    ["선택 해제", { primitiveEditSelection: { nodeId: null, name: "", blockedReason: null } }],
    ["선택 잠금", { primitiveEditSelection: { nodeId: "source-box", name: "상자", blockedReason: "잠금 상태" } }],
    ["상위 disabled", { disabled: true }],
  ] satisfies readonly (readonly [string, Partial<LauncherProps>])[])("A begin 대기 중 %s 변경 뒤 늦은 A로 편집기를 열지 않는다", async (_label, patch) => {
    const f = fixture(), pending = deferred<StudioBg3dPrimitiveEditBeginResult>();
    f.begin.mockReturnValueOnce(pending.promise);
    const view = render(<StudioBg3dPrimitiveEditLauncher {...f.props} />);
    fireEvent.click(beginButton());
    view.rerender(<StudioBg3dPrimitiveEditLauncher {...f.props} {...patch} />);
    await act(async () => { pending.finish({ ok: true, context: f.context }); await pending.promise; });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("선택 또는 편집 가능 상태가 바뀌었습니다");
    expect(f.apply).not.toHaveBeenCalled();
    view.rerender(<StudioBg3dPrimitiveEditLauncher {...f.props} />);
    fireEvent.click(beginButton());
    await screen.findByRole("dialog", { name: "선택한 상자 면 편집" });
    expect(f.begin).toHaveBeenCalledTimes(2);
  });

  it("같은 선택으로 요청했어도 결과 context의 source ID가 다르면 열지 않는다", async () => {
    const f = fixture(), wrong = fixture("unexpected-box");
    f.begin.mockResolvedValueOnce({ ok: true, context: wrong.context });
    render(<StudioBg3dPrimitiveEditLauncher {...f.props} />); fireEvent.click(beginButton());
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("선택 또는 편집 가능 상태가 바뀌었습니다"));
    expect(screen.queryByRole("dialog")).toBeNull(); expect(f.apply).not.toHaveBeenCalled();
  });

  it("begin 대기 중 unmount한 뒤 늦은 성공은 편집기를 만들거나 반영하지 않는다", async () => {
    const f = fixture(), pending = deferred<StudioBg3dPrimitiveEditBeginResult>();
    f.begin.mockReturnValueOnce(pending.promise);
    const view = render(<StudioBg3dPrimitiveEditLauncher {...f.props} />); fireEvent.click(beginButton());
    view.unmount();
    await act(async () => { pending.finish({ ok: true, context: f.context }); await pending.promise; });
    expect(screen.queryByRole("dialog")).toBeNull(); expect(f.begin).toHaveBeenCalledOnce(); expect(f.apply).not.toHaveBeenCalled();
  });

  it("다음 렌더에서 교체한 begin과 apply 포트를 사용한다", async () => {
    const first = fixture(), latest = fixture();
    const view = render(<StudioBg3dPrimitiveEditLauncher {...first.props} />);
    view.rerender(<StudioBg3dPrimitiveEditLauncher {...latest.props} />); fireEvent.click(beginButton());
    await screen.findByRole("dialog", { name: "선택한 상자 면 편집" });
    expect(latest.begin).toHaveBeenCalledOnce(); expect(first.begin).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "실제 원본 면 2 선택" }));
    fireEvent.click(screen.getByRole("button", { name: /^면 모델링 · 밀기\/당기기/u }));
    fireEvent.change(screen.getByRole("textbox", { name: "거리 (m)" }), { target: { value: "0.1" } });
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    const apply: HTMLButtonElement = screen.getByRole("button", { name: "배경 원본에 반영" });
    await waitFor(() => expect(apply.disabled).toBe(false)); fireEvent.click(apply);
    await waitFor(() => expect(latest.apply).toHaveBeenCalledOnce());
    expect(latest.apply.mock.calls[0][0]).toBe(latest.context); expect(first.apply).not.toHaveBeenCalled();
  });
});
