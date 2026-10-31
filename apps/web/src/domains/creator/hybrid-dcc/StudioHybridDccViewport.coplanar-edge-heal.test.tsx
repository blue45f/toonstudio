// @vitest-environment jsdom
/** 실제 wrapper·hook·B/C 커널·문서 권위를 연결한다. Core의 Canvas 대체는 GPU/Worker 실행 증거가 아니다. */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { decodeStudioMeshUvLayer, hashStudioMeshUvTopology } from "../mesh-uv/studio-mesh-uv-authority";
import { serializeStudioCommandJournal } from "../studio-command-journal";
import { hashStudioEditableMesh, serializeStudioEditableMesh } from "../studio-editable-half-edge-mesh";

import { splitStudioEditableFaceBoundaryChordWithUv } from "./studio-hybrid-dcc-boundary-chord-uv";
import {
  createStudioHybridDccComponentSelection, mutateStudioHybridDccComponentSelection,
  type StudioHybridDccComponentSelection,
} from "./studio-hybrid-dcc-component-selection";
import { dissolveStudioHybridDccCoplanarEdges } from "./studio-hybrid-dcc-coplanar-edge-dissolve";
import { hybridDccCommitGeometry } from "./studio-hybrid-dcc-document";
import { readStudioMeshFaceLoops } from "./studio-hybrid-dcc-face-modeling-mesh";
import { workspaceRefreshModifierPreviews } from "./studio-hybrid-dcc-modifier-workspace";
import {
  createStudioHybridDccWorkspace, synchronizeWorkspaceGeometryAuthority, workspaceAddUnitCube,
  workspaceCommitObjectTransform, workspaceComponentSelectionSource, workspaceReconcileSelectionAfterHistory,
  workspaceRedo, workspaceSetAssetVisibility, workspaceUndo, type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";
import {
  decodeStudioHybridDccWorkspacePersistenceEnvelope, encodeStudioHybridDccWorkspacePersistenceEnvelope,
} from "./studio-hybrid-dcc-workspace-persistence";
import { StudioHybridDccViewport } from "./StudioHybridDccViewport";

import type { computeStudioHybridDccCoplanarEdgeDissolveInWorker } from "./studio-hybrid-dcc-coplanar-edge-dissolve-worker-client";
import type { StudioHybridDccCoplanarEdgeDissolveCurrent as Current } from "./studio-hybrid-dcc-coplanar-edge-dissolve-workspace";
import type { StudioHybridDccUvEditorHost } from "./useStudioHybridDccUvEditor";
import type { StudioHybridDccViewportProps } from "./StudioHybridDccViewportCore";

type Run = NonNullable<StudioHybridDccUvEditorHost["onRunWorkspaceEdit"]>;
const { compute } = vi.hoisted(() => ({ compute: vi.fn<typeof computeStudioHybridDccCoplanarEdgeDissolveInWorker>() }));
const surfaces: StudioHybridDccViewportProps[] = [];

// 오류 클래스도 messages가 실제 instanceof로 소비하므로 계산 함수 외의 export는 보존한다.
vi.mock("./studio-hybrid-dcc-coplanar-edge-dissolve-worker-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./studio-hybrid-dcc-coplanar-edge-dissolve-worker-client")>();
  return { ...actual, computeStudioHybridDccCoplanarEdgeDissolveInWorker: compute };
});
vi.mock("./StudioHybridDccViewportCore", () => ({
  StudioHybridDccViewport: (props: StudioHybridDccViewportProps) => {
    surfaces.push(props);
    return <canvas tabIndex={0} aria-label="치유 회귀 3D 표면" />;
  },
}));

function need<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw new Error("실제 B/C 연결 회귀 입력이 없습니다.");
  return value;
}
function surface(): StudioHybridDccViewportProps { return need(surfaces.at(-1)); }
function record(workspace: StudioHybridDccWorkspace) {
  return need(workspace.session.state.geometry.records[need(workspace.activeAssetId)]);
}
function selection(workspace: StudioHybridDccWorkspace, mode: "face" | "edge", id: number): StudioHybridDccComponentSelection {
  const selected = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), {
    mode, operation: "replace", ids: [id], activeId: id, source: need(workspaceComponentSelectionSource(workspace)),
  });
  if (!selected.ok) throw new Error("실제 canonical 요소 선택을 만들지 못했습니다.");
  return selected.value;
}
function deferred<T>() {
  let settle: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => { settle = resolve; });
  return { promise, resolve(value: T) { need(settle)(value); } };
}
function controls(workspace: StudioHybridDccWorkspace) {
  return { state: JSON.stringify(workspace.session.state), journal: serializeStudioCommandJournal(workspace.session.journal),
    undo: workspace.session.undoStack, redo: workspace.session.redoStack };
}

function fixture() {
  const seeded = workspaceAddUnitCube(createStudioHybridDccWorkspace("coplanar-viewport"), "cube");
  const initial = need(workspaceComponentSelectionSource(seeded)), loops = need(readStudioMeshFaceLoops(initial.mesh));
  const target = need(loops.find((face) => face.vertexIds.every((id) => initial.mesh.vertices[id]?.position.z === 0.5)));
  const attributed = { ...initial.mesh, faces: initial.mesh.faces.map((face) => ({ ...face, materialSlot: face.id % 3 })),
    uvLayer: decodeStudioMeshUvLayer({ revision: 1, topologyHash: hashStudioMeshUvTopology(initial.mesh),
      corners: loops.flatMap((face) => {
        const axes = (["x", "y", "z"] as const).filter((axis) => new Set(face.vertexIds.map((id) => initial.mesh.vertices[id]?.position[axis])).size > 1);
        const u = need(axes[0]), v = need(axes[1]);
        if (axes.length !== 2) throw new Error("fixture의 원본 면은 두 축 평면이어야 합니다.");
        return face.vertexIds.map((id, index) => {
          const position = need(initial.mesh.vertices[id]).position;
          return { halfEdgeId: need(face.halfEdgeIds[index]), u: position[u] + 0.5, v: position[v] + 0.5 };
        });
      }).sort((left, right) => left.halfEdgeId - right.halfEdgeId),
    }, initial.mesh),
  };
  const prepared = synchronizeWorkspaceGeometryAuthority(seeded, hybridDccCommitGeometry(seeded.session, "cube", attributed));
  const source = need(workspaceComponentSelectionSource(prepared));
  // 원본 cube를 다른 생성기로 대체하지 않고 실제 B의 UV 보존 vertex↔vertex 분할을 확정한다.
  const divided = splitStudioEditableFaceBoundaryChordWithUv({ mesh: source.mesh, meshHash: source.sourceHash, meshRevision: source.meshRevision }, {
    sourceMeshHash: source.sourceHash, sourceMeshRevision: source.meshRevision, faceId: target.id,
    start: { kind: "vertex", vertexId: need(target.vertexIds[0]) },
    end: { kind: "vertex", vertexId: need(target.vertexIds[2]) },
  });
  if (!divided.ok) throw new Error(divided.messageKo);
  const split = synchronizeWorkspaceGeometryAuthority(prepared, hybridDccCommitGeometry(prepared.session, "cube", divided.mesh));
  const workspace = workspaceCommitObjectTransform(split, "cube", {
    revision: 1, position: [1.25, -0.125, 0.375], rotationEulerRad: [0.25, -0.5, 0.125], scale: [1.5, 0.75, 1.25],
  });
  const mesh = record(workspace).mesh;
  const seam = need(mesh.halfEdges.find((edge) => edge.twin >= 0 && edge.id < edge.twin
    && divided.selectionFaceIds.includes(edge.face) && divided.selectionFaceIds.includes(need(mesh.halfEdges[edge.twin]).face)
    && edge.face !== mesh.halfEdges[edge.twin]?.face));
  const current: Current = { workspace, selection: selection(workspace, "edge", seam.id) };
  const run = vi.fn<Run>();
  return { current, originalHash: hashStudioEditableMesh(attributed), faceId: target.id,
    props: { workspace, componentSelection: current.selection, onSelectAsset: vi.fn(), onRunWorkspaceEdit: run }, run };
}

interface Host {
  readonly initial: Current;
  current: Current;
  readonly barrier: ReturnType<typeof deferred<void>>;
  readonly candidates: StudioHybridDccWorkspace[];
  readonly published: StudioHybridDccWorkspace[];
  readonly guards: boolean[];
  readonly failures: unknown[];
  calls: number;
  completed: number;
}
function hostFor(current: Current): Host {
  return { initial: current, current, barrier: deferred<void>(), candidates: [], published: [], guards: [], failures: [], calls: 0, completed: 0 };
}

/** Panel.run의 실제 modifier→최종 guard→발행 순서만 소유한다. 화면의 편집 로직은 실제 wrapper와 hook이다. */
function CanonicalHost({ host }: { readonly host: Host }) {
  const [current, setCurrent] = useState(host.initial), [busy, setBusy] = useState(false);
  const latest = useRef(current); latest.current = current; host.current = current;
  const run: Run = (_label, edit, canCommit) => {
    host.calls += 1; setBusy(true);
    void (async () => {
      try {
        const result = edit(latest.current.workspace, latest.current.selection);
        host.candidates.push(result.workspace);
        const candidate = await workspaceRefreshModifierPreviews(result.workspace);
        await host.barrier.promise;
        const permitted = canCommit?.() ?? true;
        host.guards.push(permitted);
        if (permitted) {
          host.published.push(candidate);
          setCurrent({ workspace: candidate, selection: result.selection ?? latest.current.selection });
        }
      } catch (error) { host.failures.push(error); }
      finally { host.completed += 1; setBusy(false); }
    })();
  };
  const history = (direction: "undo" | "redo") => {
    const workspace = direction === "undo" ? workspaceUndo(current.workspace) : workspaceRedo(current.workspace);
    setCurrent({ workspace, selection: workspaceReconcileSelectionAfterHistory(workspace, current.selection) });
  };
  return <>
    <StudioHybridDccViewport workspace={current.workspace} componentSelection={current.selection} onSelectAsset={() => undefined}
      onRunWorkspaceEdit={run} editingDisabled={busy} />
    <button type="button" disabled={busy} onClick={() => history("undo")}>호스트 Undo</button>
    <button type="button" disabled={busy} onClick={() => history("redo")}>호스트 Redo</button>
  </>;
}

function previewButton() { return screen.getByRole("button", { name: "선택 모서리 미리보기" }); }
function applyButton() { return screen.getByRole("button", { name: "치유 적용" }); }
function cancelButton() { return screen.getByRole("button", { name: "치유 취소" }); }
async function ready() { await waitFor(() => expect(applyButton().hasAttribute("disabled")).toBe(false)); }

beforeEach(() => {
  surfaces.length = 0;
  compute.mockReset();
  compute.mockImplementation(async (source, request) => dissolveStudioHybridDccCoplanarEdges(source, request));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("실제 Viewport의 B 분할→C 공유 모서리 치유 연결", () => {
  it("canonical edge에서 preview만 표시하고 최종 host guard 뒤 단일 확정·UndoRedo·저장 codec 재열기를 보존한다", async () => {
    const f = fixture(), host = hostFor(f.current), before = controls(f.current.workspace), original = record(f.current.workspace);
    const view = render(<CanonicalHost host={host} />);
    expect(original.mesh.faces).toHaveLength(7);
    expect(original.mesh.uvLayer?.corners).toHaveLength(26);
    expect(surface().workspace).toBe(f.current.workspace);
    fireEvent.click(previewButton()); await ready();
    expect(compute).toHaveBeenCalledTimes(1);
    expect(need(compute.mock.calls[0])[1].halfEdgeIds).toEqual(f.current.selection.elementIds);
    expect(host.calls).toBe(0); expect(host.current.workspace).toBe(f.current.workspace);
    expect(controls(f.current.workspace)).toEqual(before);
    const shown = record(surface().workspace);
    expect(shown.mesh.faces).toHaveLength(6); expect(shown.meshHash).toBe(f.originalHash);
    expect(shown.revision).toBe(original.revision); expect(shown.renderCache).toBeNull();
    expect(hashStudioEditableMesh(shown.modifierStack.source)).toBe(shown.meshHash);
    expect(surface().workspace.session.journal).toBe(f.current.workspace.session.journal);
    expect(surface().workspace.session.undoStack).toBe(f.current.workspace.session.undoStack);
    expect(surface().componentSelection?.mode).toBe("face"); expect(surface().editingDisabled).toBe(true);
    expect(screen.getByRole("button", { name: "모서리에서 선택" }).hasAttribute("disabled")).toBe(true);
    expect(view.container.querySelector("[data-studio-hybrid-dcc-component-transform]")).toBeNull();

    fireEvent.click(applyButton());
    await waitFor(() => expect(host.candidates).toHaveLength(1));
    expect(host.calls).toBe(1); expect(host.published).toHaveLength(0);
    expect(host.current.workspace).toBe(f.current.workspace); expect(controls(f.current.workspace)).toEqual(before);
    expect(applyButton().hasAttribute("disabled")).toBe(true);
    await act(async () => { host.barrier.resolve(undefined); await host.barrier.promise; });
    await waitFor(() => {
      expect(host.completed).toBe(1);
      expect(host.current.workspace).not.toBe(f.current.workspace);
      expect(screen.getByRole("button", { name: "호스트 Undo" }).hasAttribute("disabled")).toBe(false);
    });
    expect(host.guards).toEqual([true]); expect(host.failures).toEqual([]);
    expect(host.published).toHaveLength(1);
    const committed = host.current.workspace, after = record(committed);
    expect(after.meshHash).toBe(f.originalHash); expect(after.revision).toBe(original.revision + 1);
    expect(committed.session.state.commandCount).toBe(f.current.workspace.session.state.commandCount + 1);
    expect(committed.session.undoStack).toHaveLength(before.undo.length + 1);
    expect(committed.session.state.objectTransforms).toEqual(f.current.workspace.session.state.objectTransforms);
    expect(after.mesh.uvLayer?.corners).toHaveLength(24);
    expect(host.current.selection.mode).toBe("face"); expect(surface().workspace).toBe(committed);
    expect(controls(f.current.workspace)).toEqual(before);

    fireEvent.click(screen.getByRole("button", { name: "호스트 Undo" }));
    expect(serializeStudioEditableMesh(record(host.current.workspace).mesh)).toEqual(serializeStudioEditableMesh(original.mesh));
    fireEvent.click(screen.getByRole("button", { name: "호스트 Redo" }));
    expect(record(host.current.workspace).meshHash).toBe(after.meshHash);
    const scope = { userId: "viewport-heal-test", workId: "b-c-document" };
    const encoded = encodeStudioHybridDccWorkspacePersistenceEnvelope({ workspace: host.current.workspace, scope, savedAt: 17 });
    const decoded = decodeStudioHybridDccWorkspacePersistenceEnvelope({ bytes: encoded.bytes, scope });
    expect(decoded.kind).toBe("workspace");
    const reopened = need(decoded.workspace);
    expect(serializeStudioEditableMesh(record(reopened).mesh)).toEqual(serializeStudioEditableMesh(after.mesh));
    expect(serializeStudioCommandJournal(reopened.session.journal)).toBe(serializeStudioCommandJournal(host.current.workspace.session.journal));
    expect(reopened.session.state.objectTransforms).toEqual(committed.session.state.objectTransforms);
    expect(record(workspaceUndo(reopened)).meshHash).toBe(original.meshHash);
    expect(record(workspaceRedo(workspaceUndo(reopened))).meshHash).toBe(after.meshHash);
    view.unmount();
    render(<StudioHybridDccViewport workspace={reopened} componentSelection={workspaceReconcileSelectionAfterHistory(reopened, host.current.selection)}
      onSelectAsset={() => undefined} onRunWorkspaceEdit={f.run} />);
    expect(record(surface().workspace).meshHash).toBe(after.meshHash);
    expect(record(surface().workspace).mesh.uvLayer?.topologyHash).toBe(after.mesh.uvLayer?.topologyHash);
  });

  it("계산 대기 Escape는 취소·focus 복귀하고 늦은 실제 커널 결과가 새 preview나 원본을 덮지 못한다", async () => {
    const f = fixture(), before = controls(f.current.workspace), late = deferred<Awaited<ReturnType<typeof computeStudioHybridDccCoplanarEdgeDissolveInWorker>>>();
    compute.mockImplementationOnce(() => late.promise);
    render(<StudioHybridDccViewport {...f.props} />);
    fireEvent.click(previewButton());
    await waitFor(() => expect(compute).toHaveBeenCalledTimes(1));
    const [source, request, options] = need(compute.mock.calls[0]);
    expect(options.signal?.aborted).toBe(false); expect(surface().workspace).toBe(f.current.workspace);
    expect(surface().editingDisabled).toBe(true); expect(applyButton().hasAttribute("disabled")).toBe(true);
    cancelButton().focus(); expect(document.activeElement).toBe(cancelButton());
    fireEvent.keyDown(cancelButton(), { key: "Escape", isComposing: true });
    expect(options.signal?.aborted).toBe(false);
    fireEvent.keyDown(cancelButton(), { key: "Escape" });
    expect(options.signal?.aborted).toBe(true);
    const canvas = screen.getByLabelText("치유 회귀 3D 표면");
    expect([previewButton(), canvas]).toContain(document.activeElement);
    expect(cancelButton().hasAttribute("disabled")).toBe(true);
    expect(previewButton().hasAttribute("disabled")).toBe(false);
    fireEvent.click(previewButton()); await ready();
    expect(compute).toHaveBeenCalledTimes(2);
    const currentPreview = record(surface().workspace).meshHash;
    // 취소를 무시하고 물리적으로 늦게 돌아온 producer도 hook의 세대 검사를 통과해서는 안 된다.
    await act(async () => { late.resolve(dissolveStudioHybridDccCoplanarEdges(source, request)); await late.promise; });
    await ready();
    expect(record(surface().workspace).meshHash).toBe(currentPreview);
    expect(f.run).not.toHaveBeenCalled(); expect(controls(f.current.workspace)).toEqual(before);
    cancelButton().focus(); fireEvent.click(cancelButton());
    expect(document.activeElement).toBe(previewButton());
    expect(surface().workspace).toBe(f.current.workspace);
    expect(surface().componentSelection).toBe(f.current.selection);
  });

  it("재질·조형·읽기 전용·host busy와 실제 요소변형·B picking이 치유와 서로 잠긴다", () => {
    const f = fixture(), view = render(<StudioHybridDccViewport {...f.props} materialMode />);
    expect(screen.queryByRole("button", { name: "선택 모서리 미리보기" })).toBeNull();
    view.rerender(<StudioHybridDccViewport {...f.props} onSculptStroke={() => undefined} />);
    expect(previewButton().hasAttribute("disabled")).toBe(true);
    view.rerender(<StudioHybridDccViewport {...f.props} onRunWorkspaceEdit={undefined} />);
    expect(previewButton().hasAttribute("disabled")).toBe(true);
    view.rerender(<StudioHybridDccViewport {...f.props} editingDisabled />);
    expect(previewButton().hasAttribute("disabled")).toBe(true);
    view.rerender(<StudioHybridDccViewport {...f.props} />);
    expect(previewButton().hasAttribute("disabled")).toBe(false);
    const transform = within(need(view.container.querySelector<HTMLElement>("[data-studio-hybrid-dcc-component-transform]")));
    fireEvent.change(transform.getByLabelText("X (m)"), { target: { value: "0.125" } });
    expect(transform.getByRole("button", { name: "변형 취소" }).hasAttribute("disabled")).toBe(false);
    expect(previewButton().hasAttribute("disabled")).toBe(true);
    fireEvent.click(transform.getByRole("button", { name: "변형 취소" }));
    expect(previewButton().hasAttribute("disabled")).toBe(false);
    view.rerender(<StudioHybridDccViewport {...f.props} componentSelection={selection(f.current.workspace, "face", f.faceId)} />);
    fireEvent.click(screen.getByRole("button", { name: "모서리에서 선택" }));
    expect(surface().onBoundaryEndpointPick).toBeDefined();
    expect(previewButton().hasAttribute("disabled")).toBe(true);
    expect(view.container.querySelector("[data-studio-hybrid-dcc-component-transform]")).toBeNull();
    expect(compute).not.toHaveBeenCalled(); expect(f.run).not.toHaveBeenCalled();
  });

  it("후보 확정 뒤 modifier 발행 대기 중 취소해도 단일 후보만 만들고 canonical 이력은 발행하지 않는다", async () => {
    const f = fixture(), host = hostFor(f.current), before = controls(f.current.workspace);
    render(<CanonicalHost host={host} />);
    fireEvent.click(previewButton()); await ready(); fireEvent.click(applyButton());
    await waitFor(() => expect(host.candidates).toHaveLength(1));
    expect(record(need(host.candidates[0])).mesh.faces).toHaveLength(6);
    expect(host.current.workspace).toBe(f.current.workspace);
    fireEvent.click(applyButton()); expect(host.calls).toBe(1);
    cancelButton().focus(); fireEvent.keyDown(cancelButton(), { key: "Escape" });
    expect(need(compute.mock.calls[0])[2].signal?.aborted).toBe(true);
    expect(screen.getByLabelText("치유 회귀 3D 표면")).toBe(document.activeElement);
    await act(async () => { host.barrier.resolve(undefined); await host.barrier.promise; });
    await waitFor(() => {
      expect(host.completed).toBe(1);
      expect(previewButton().hasAttribute("disabled")).toBe(false);
    });
    expect(host.guards).toEqual([false]); expect(host.published).toEqual([]); expect(host.failures).toEqual([]);
    expect(host.current.workspace).toBe(f.current.workspace); expect(controls(f.current.workspace)).toEqual(before);
    expect(surface().workspace).toBe(f.current.workspace); expect(previewButton().hasAttribute("disabled")).toBe(false);
  });

  it("현재 edge 선택이 남아 있어도 숨겨진 원본에는 계산을 시작하지 않는다", () => {
    const f = fixture(), hidden = workspaceSetAssetVisibility(f.current.workspace, "cube", false), before = controls(hidden);
    const view = render(<StudioHybridDccViewport {...f.props} workspace={hidden} />);
    expect(previewButton().hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("숨겨졌거나 표시할 수 없는 오브젝트에는 치유를 적용하지 않습니다.")).toBeTruthy();
    fireEvent.click(previewButton());
    expect(compute).not.toHaveBeenCalled(); expect(f.run).not.toHaveBeenCalled(); expect(controls(hidden)).toEqual(before);
    view.rerender(<StudioHybridDccViewport {...f.props} />);
    expect(previewButton().hasAttribute("disabled")).toBe(false);
    expect(surface().workspace).toBe(f.current.workspace); expect(compute).not.toHaveBeenCalled();
  });
});
