// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useLayoutEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { serializeStudioCommandJournal } from "../studio-command-journal";
import { hashStudioEditableMesh, serializeStudioEditableMesh } from "../studio-editable-half-edge-mesh";

import { StudioHybridDccSculptTools } from "./StudioHybridDccSculptTools";
import { commitStudioHybridDccSculptStroke } from "./studio-hybrid-dcc-sculpt-stroke-workspace";
import { createStudioHybridDccWorkspace, workspaceAddUnitCube, workspaceUndo, type StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";
import { useStudioHybridDccSculptStroke, type StudioHybridDccSculptStrokeModel } from "./useStudioHybridDccSculptStroke";

import type { StudioSculptGestureToken } from "./studio-hybrid-dcc-sculpt-gesture";

const auth = vi.hoisted(() => ({ actor: "sculpt-tools-owner", revision: 0, listeners: new Set<() => void>() }));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({
  getAuthUserId: () => auth.actor, getAuthSessionRevision: () => auth.revision, listeners: auth.listeners,
}));

beforeEach(() => {
  auth.actor = "sculpt-tools-owner"; auth.revision = 0; auth.listeners.clear();
});

afterEach(cleanup);

function setup(overrides: Partial<StudioHybridDccSculptStrokeModel> = {}, busy = false) {
  const model: StudioHybridDccSculptStrokeModel = {
    kind: "inflate", setKind: vi.fn<StudioHybridDccSculptStrokeModel["setKind"]>(),
    carve: false, setCarve: vi.fn<StudioHybridDccSculptStrokeModel["setCarve"]>(),
    radius: 0.45, radiusText: "0.45", radiusError: "",
    setRadiusText: vi.fn<StudioHybridDccSculptStrokeModel["setRadiusText"]>(),
    phase: "idle", preview: null, notice: "", error: "", engaged: false, cancel: vi.fn(),
    controller: {
      begin: vi.fn(() => null), isCurrent: vi.fn(() => false),
      sample: vi.fn(), end: vi.fn(), cancel: vi.fn(),
    },
    ...overrides,
  };
  const view = render(<StudioHybridDccSculptTools model={model} busy={busy} />);
  return { model, view };
}

function radiusField(): HTMLInputElement {
  const input = screen.getByRole("textbox", { name: "드래그 브러시 크기" });
  if (!(input instanceof HTMLInputElement)) throw new Error("반경 입력 요소가 없습니다.");
  return input;
}

describe("드래그 브러시 반경 설정 UI", () => {
  it("반경의 적용 범위·모델 단위를 안내하고 정밀·큰 수 입력을 임의로 자르지 않는다", () => {
    const { model, view } = setup();
    const input = radiusField();
    expect(input.value).toBe("0.45");
    expect(input.getAttribute("inputmode")).toBe("decimal");
    const helpId = input.getAttribute("aria-describedby");
    if (!helpId) throw new Error("반경 도움말 연결이 없습니다.");
    expect(document.getElementById(helpId)?.textContent).toMatch(/드래그.*반경.*모델 단위/u);
    fireEvent.change(input, { target: { value: "1e-8" } });
    expect(model.setRadiusText).toHaveBeenCalledWith("1e-8");
    view.rerender(<StudioHybridDccSculptTools model={{ ...model, radius: 1e-8, radiusText: "1e-8" }} busy={false} />);
    expect(radiusField().value).toBe("1e-8");
    fireEvent.change(radiusField(), { target: { value: "1e30" } });
    expect(model.setRadiusText).toHaveBeenCalledWith("1e30");
  });

  it("무효 초안과 연결된 오류를 보존하고 사용자가 고친 값을 다시 전달한다", () => {
    const message = "반경은 0보다 큰 유한한 숫자로 입력하세요.";
    const { model, view } = setup({ radius: 1, radiusText: "", radiusError: message });
    const input = radiusField();
    expect(input.value).toBe("");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(message);
    expect(input.getAttribute("aria-describedby")?.split(" ")).toContain(alert.id);
    fireEvent.change(input, { target: { value: "2.5" } });
    expect(model.setRadiusText).toHaveBeenCalledWith("2.5");
    view.rerender(<StudioHybridDccSculptTools model={{ ...model, radius: 2.5, radiusText: "2.5", radiusError: "" }} busy={false} />);
    expect(radiusField().getAttribute("aria-invalid")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each(["drawing", "committing"] as const)("%s 중 설정을 잠그되 명시 취소는 사용할 수 있다", (phase) => {
    const { model } = setup({ phase, engaged: true }, true);
    expect(radiusField().disabled).toBe(true);
    fireEvent.change(radiusField(), { target: { value: "2" } });
    expect(model.setRadiusText).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "조형 취소" }));
    expect(model.cancel).toHaveBeenCalledOnce();
  });
});

interface WorkspaceToolsSnapshot {
  readonly workspace: StudioHybridDccWorkspace;
  readonly model: StudioHybridDccSculptStrokeModel;
}

/** 입력 UI부터 실제 조형·명령까지 연결한다. 캔버스 hit 대신 controller에 로컬 점을 전달한다. */
function WorkspaceSculptTools({ initialWorkspace, onSnapshot }: {
  readonly initialWorkspace: StudioHybridDccWorkspace;
  readonly onSnapshot: (snapshot: WorkspaceToolsSnapshot) => void;
}) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const model = useStudioHybridDccSculptStroke({
    workspace, workspaceDocumentId: "sculpt-tools-radius-dom", enabled: true, externalBusy: false,
    commit: (receipt, isCurrent, onPublished) => {
      if (!isCurrent()) return Promise.resolve(false);
      const next = commitStudioHybridDccSculptStroke(workspace, receipt);
      if (!isCurrent()) return Promise.resolve(false);
      onPublished();
      setWorkspace(next);
      return Promise.resolve(true);
    },
  });
  useLayoutEffect(() => { onSnapshot({ workspace, model }); }, [model, onSnapshot, workspace]);
  return <StudioHybridDccSculptTools model={model} busy={model.engaged} />;
}

function mountWorkspaceTools() {
  const source = workspaceAddUnitCube(createStudioHybridDccWorkspace("sculpt-tools-radius-dom"), "cube");
  const snapshots: WorkspaceToolsSnapshot[] = [];
  render(<WorkspaceSculptTools initialWorkspace={source} onSnapshot={(snapshot) => { snapshots.push(snapshot); }} />);
  return {
    source,
    current() {
      const snapshot = snapshots.at(-1);
      if (!snapshot) throw new Error("실제 조형 도구의 작업대 상태를 받지 못했습니다.");
      return snapshot;
    },
  };
}

function workspaceMesh(workspace: StudioHybridDccWorkspace) {
  const assetId = workspace.activeAssetId;
  if (!assetId) throw new Error("실제 조형 도구에 선택된 오브젝트가 없습니다.");
  const record = workspace.session.state.geometry.records[assetId];
  if (!record) throw new Error("실제 조형 도구의 원본 메시가 없습니다.");
  return record.mesh;
}

function workspaceEvidence(workspace: StudioHybridDccWorkspace) {
  const mesh = workspaceMesh(workspace);
  return {
    mesh: serializeStudioEditableMesh(mesh), hash: hashStudioEditableMesh(mesh),
    state: workspace.session.state.stateHash, commandCount: workspace.session.state.commandCount,
    undo: JSON.stringify(workspace.session.undoStack), redo: JSON.stringify(workspace.session.redoStack),
    journal: serializeStudioCommandJournal(workspace.session.journal),
  };
}

describe("반경 입력과 실제 조형 작업대의 DOM 통합", () => {
  it("반경 1을 입력한 gesture는 위쪽 네 정점만 한 명령으로 바꾸고 undo로 원본을 복원한다", async () => {
    const tools = mountWorkspaceTools(), before = workspaceEvidence(tools.source);
    expect(radiusField().value).toBe("0.45");
    fireEvent.change(radiusField(), { target: { value: "1" } });
    expect(radiusField().value).toBe("1");
    expect(tools.current().model.radius).toBe(1);
    const controller = tools.current().model.controller, issued: StudioSculptGestureToken[] = [];
    act(() => {
      const token = controller.begin({ assetId: "cube", pointerId: 7, localPoint: { x: 0, y: 0.5, z: 0 } });
      if (token) issued.push(token);
    });
    const token = issued[0];
    if (!token) throw new Error("입력한 반경으로 실제 조형 gesture를 시작하지 못했습니다.");
    expect(radiusField().disabled).toBe(true);
    expect(tools.current().workspace).toBe(tools.source);
    expect(workspaceEvidence(tools.source)).toEqual(before);
    await act(async () => { controller.end(token); controller.end(token); await Promise.resolve(); });

    const result = tools.current().workspace;
    const changedById = new Map(workspaceMesh(result).vertices.map((vertex) => [vertex.id, vertex]));
    let affected = 0;
    for (const vertex of workspaceMesh(tools.source).vertices) {
      const changed = changedById.get(vertex.id);
      if (!changed) throw new Error("반경 적용 후 원본 정점의 대응이 없습니다.");
      if (vertex.position.y === 0.5) {
        expect(changed.position.y).toBeGreaterThan(vertex.position.y);
        expect((changed.position.x - vertex.position.x) * vertex.position.x).toBeGreaterThan(0);
        expect((changed.position.z - vertex.position.z) * vertex.position.z).toBeGreaterThan(0);
        affected += 1;
      } else expect(changed.position).toEqual(vertex.position);
    }
    expect(affected).toBe(4);
    expect(result.session.state.commandCount).toBe(tools.source.session.state.commandCount + 1);
    expect(result.session.undoStack).toHaveLength(tools.source.session.undoStack.length + 1);
    expect(workspaceEvidence(tools.source)).toEqual(before);
    const restored = workspaceMesh(workspaceUndo(result));
    expect(serializeStudioEditableMesh(restored)).toEqual(before.mesh);
    expect(hashStudioEditableMesh(restored)).toBe(before.hash);
    expect(radiusField().disabled).toBe(false);
    expect(screen.getByRole("status").textContent).toMatch(/조형을 적용했습니다/u);
  });

  it("유효 반경 뒤 무효 문자열을 입력하면 이전 수치로 시작하지 않고 원본·편집 이력을 유지한다", async () => {
    const tools = mountWorkspaceTools(), before = workspaceEvidence(tools.source);
    fireEvent.change(radiusField(), { target: { value: "1" } });
    fireEvent.change(radiusField(), { target: { value: "숫자 아님" } });
    expect(radiusField().value).toBe("숫자 아님");
    expect(radiusField().getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toMatch(/0보다 큰 유한한 숫자/u);
    const issued: Array<StudioSculptGestureToken | null> = [];
    await act(async () => {
      const controller = tools.current().model.controller;
      const token = controller.begin({ assetId: "cube", pointerId: 7, localPoint: { x: 0, y: 0.5, z: 0 } });
      issued.push(token);
      if (token) controller.end(token);
      await Promise.resolve();
    });
    expect(issued).toEqual([null]);
    expect(tools.current().model.phase).toBe("idle");
    expect(tools.current().model.preview).toBeNull();
    expect(tools.current().workspace).toBe(tools.source);
    expect(workspaceEvidence(tools.current().workspace)).toEqual(before);
    expect(radiusField().disabled).toBe(false);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
