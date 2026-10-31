// @vitest-environment jsdom
/** 실제 커널·workspace·문서·저장을 사용한다. async compute는 테스트 포트이며 실제 Worker/UI 증거가 아니다. */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { decodeStudioMeshUvLayer, hashStudioMeshUvTopology } from "../mesh-uv/studio-mesh-uv-authority";
import { serializeStudioCommandJournal } from "../studio-command-journal";
import {
  createStudioEditableMeshFromPolygons, hashStudioEditableMesh, serializeStudioEditableMesh,
  type StudioEditableMesh,
} from "../studio-editable-half-edge-mesh";
import {
  createStudioHybridDccComponentSelection, mutateStudioHybridDccComponentSelection,
} from "./studio-hybrid-dcc-component-selection";
import { dissolveStudioHybridDccCoplanarEdges } from "./studio-hybrid-dcc-coplanar-edge-dissolve";
import { studioCoplanarEdgeDissolveNotice } from "./studio-hybrid-dcc-coplanar-edge-dissolve-messages";
import * as documentAuthority from "./studio-hybrid-dcc-document";
import { readStudioMeshFaceLoops } from "./studio-hybrid-dcc-face-modeling-mesh";
import { workspaceRefreshModifierPreviews } from "./studio-hybrid-dcc-modifier-workspace";
import {
  createStudioHybridDccWorkspace, synchronizeWorkspaceGeometryAuthority, workspaceAddUnitCube,
  workspaceComponentSelectionSource, workspaceRedo, workspaceSetAssetVisibility, workspaceUndo,
  type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";
import {
  decodeStudioHybridDccWorkspacePersistenceEnvelope, encodeStudioHybridDccWorkspacePersistenceEnvelope,
} from "./studio-hybrid-dcc-workspace-persistence";
import {
  useStudioHybridDccCoplanarEdgeDissolve, type StudioCoplanarEdgeDissolveHookInput as Input,
} from "./useStudioHybridDccCoplanarEdgeDissolve";

import type { StudioHybridDccWorkspaceEdit } from "./studio-hybrid-dcc-face-modeling-workspace";

type Compute = NonNullable<Input["compute"]>;
type Computed = Awaited<ReturnType<Compute>>;
type Model = ReturnType<typeof useStudioHybridDccCoplanarEdgeDissolve>;
interface HostRequest { readonly edit: StudioHybridDccWorkspaceEdit; readonly canCommit: () => boolean }
const SCOPE = { userId: "coplanar-hook", workId: "edge-heal" };
function need<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw new Error("실제 치유 hook fixture 값이 없습니다.");
  return value;
}
function source(workspace: StudioHybridDccWorkspace) { return need(workspaceComponentSelectionSource(workspace)); }
function deferred<T>() {
  let done: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => { done = resolve; });
  return { promise, resolve(value: T) { need(done)(value); } };
}
const compute: Compute = async (original, request) => dissolveStudioHybridDccCoplanarEdges(original, request);

/** 원본 factory의 +Z 면만 실제 loop로 찾아 분할하며, 정본 명령으로 권위 mesh를 등록한다. */
function fixture(producer: Compute = compute) {
  const cube = workspaceAddUnitCube(createStudioHybridDccWorkspace("coplanar-hook"), "cube");
  const original = source(cube).mesh, loops = need(readStudioMeshFaceLoops(original));
  const top = need(loops.find((face) => face.vertexIds.every((id) => original.vertices[id]?.position.z === 0.5)));
  if (top.vertexIds.length !== 4) throw new Error("실제 사각 cube 면이 필요합니다.");
  const a = need(top.vertexIds[0]), b = need(top.vertexIds[1]), c = need(top.vertexIds[2]), d = need(top.vertexIds[3]);
  const mesh = createStudioEditableMeshFromPolygons(
    original.vertices.map(({ position }) => ({ ...position, x: position.x + 2 ** -40 })),
    [...loops.map((face) => face.id === top.id ? [a, b, c] : face.vertexIds), [a, c, d]],
  );
  const seam = need(mesh.halfEdges.find((edge) => mesh.halfEdges[edge.prev]?.vertex === a && edge.vertex === c));
  const outer = need(mesh.halfEdges.find((edge) => mesh.halfEdges[edge.prev]?.vertex === a && edge.vertex === b));
  const attributed: StudioEditableMesh = { ...mesh,
    vertices: mesh.vertices.map((vertex) => ({ ...vertex, crease: vertex.id === a ? 0.375 : 0 })),
    halfEdges: mesh.halfEdges.map((edge) => ({ ...edge, crease: edge.id === outer.id ? 0.25 : edge.id === outer.twin ? 0.5 : 0 })),
    faces: mesh.faces.map((face) => ({ ...face, smooth: false,
      materialSlot: face.id === top.id || face.id === loops.length ? 7 : face.id + 10 })),
  };
  const withUv: StudioEditableMesh = { ...attributed, uvLayer: decodeStudioMeshUvLayer({
    revision: 1, topologyHash: hashStudioMeshUvTopology(attributed),
    corners: attributed.halfEdges.map((edge) => {
      const position = need(attributed.vertices[need(attributed.halfEdges[edge.prev]).vertex]).position;
      return { halfEdgeId: edge.id, u: Math.fround(position.x + 0.5), v: Math.fround(position.y + 0.5) };
    }),
  }, attributed) };
  const workspace = synchronizeWorkspaceGeometryAuthority(cube,
    documentAuthority.hybridDccCommitGeometry(cube.session, "cube", withUv));
  const currentSource = source(workspace);
  const selected = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), {
    mode: "edge", operation: "replace", ids: [Math.min(seam.id, seam.twin)], source: currentSource,
  });
  if (!selected.ok) throw new Error("실제 공유 모서리 선택이 없습니다.");
  const requests: HostRequest[] = [];
  const run = vi.fn<NonNullable<Input["run"]>>((_label, edit, canCommit) => { requests.push({ edit, canCommit: need(canCommit) }); });
  const input: Input = { workspace, selection: selected.value, enabled: true, disabled: false, run, compute: producer };
  return { input, source: currentSource, requests, run };
}
function snapshot(workspace: StudioHybridDccWorkspace) {
  return { mesh: serializeStudioEditableMesh(source(workspace).mesh), hash: source(workspace).sourceHash,
    state: JSON.stringify(workspace.session.state), journal: serializeStudioCommandJournal(workspace.session.journal),
    undo: workspace.session.undoStack, redo: workspace.session.redoStack,
    saved: encodeStudioHybridDccWorkspacePersistenceEnvelope({ workspace, scope: SCOPE, savedAt: 1 }).bytes };
}
function unchanged(workspace: StudioHybridDccWorkspace, before: ReturnType<typeof snapshot>) {
  expect(snapshot(workspace)).toEqual(before);
  expect(workspace.session.undoStack).toBe(before.undo); expect(workspace.session.redoStack).toBe(before.redo);
}
async function ready(result: { readonly current: Model }) {
  act(() => result.current.prepare());
  await waitFor(() => expect(result.current.canApply).toBe(true));
  return need(result.current.preview);
}
function pendingCompute() {
  const calls: { readonly original: Parameters<Compute>[0]; readonly request: Parameters<Compute>[1];
    readonly options: Parameters<Compute>[2]; readonly completion: ReturnType<typeof deferred<Computed>> }[] = [];
  const delayed: Compute = (original, request, options) => {
    const completion = deferred<Computed>(); calls.push({ original, request, options, completion }); return completion.promise;
  };
  return { calls, delayed };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("실제 공유 모서리 치유 hook의 문서·선택·발행 수명", () => {
  it("원본을 보존한 preview 뒤 own host busy와 실제 modifier await를 거쳐 단일 확정·UndoRedo·저장을 보존한다", async () => {
    const f = fixture(), before = snapshot(f.input.workspace);
    const view = renderHook((input: Input) => useStudioHybridDccCoplanarEdgeDissolve(input), { initialProps: f.input });
    expect(view.result.current.canPrepare).toBe(true); expect(view.result.current.engaged).toBe(false);
    const preview = await ready(view.result), expected = serializeStudioEditableMesh(source(preview.workspace).mesh);
    expect(preview.workspace.session.state.commandCount).toBe(f.input.workspace.session.state.commandCount);
    expect(preview.workspace.session.journal).toBe(f.input.workspace.session.journal);
    expect(source(preview.workspace).mesh.faces).toHaveLength(6); unchanged(f.input.workspace, before);
    act(() => { view.result.current.apply(); view.result.current.apply(); });
    view.rerender({ ...f.input, disabled: true });
    expect(f.requests).toHaveLength(1); const request = need(f.requests[0]);
    expect(request.canCommit()).toBe(true); expect(view.result.current.applying).toBe(true);
    const candidate = request.edit(f.input.workspace, f.input.selection);
    const settled = await workspaceRefreshModifierPreviews(candidate.workspace);
    expect(request.canCommit()).toBe(true);
    expect(settled.session.state.commandCount).toBe(f.input.workspace.session.state.commandCount + 1);
    expect(settled.session.undoStack).toHaveLength(before.undo.length + 1);
    expect(serializeStudioEditableMesh(source(settled).mesh)).toEqual(expected);
    expect(hashStudioEditableMesh(source(settled).mesh)).toBe(source(settled).sourceHash);
    expect(source(settled).mesh.vertices.map(({ position, crease }) => ({ position, crease })))
      .toEqual(f.source.mesh.vertices.map(({ position, crease }) => ({ position, crease })));
    expect(source(settled).mesh.vertices.some(({ position }) => Math.fround(position.x) !== position.x)).toBe(true);
    expect(source(settled).mesh.uvLayer?.topologyHash).toBe(hashStudioMeshUvTopology(source(settled).mesh));
    view.rerender({ ...f.input, workspace: settled, selection: need(candidate.selection) });
    await waitFor(() => expect(view.result.current.notice).toBe(studioCoplanarEdgeDissolveNotice("applied")));
    expect(view.result.current.applying).toBe(false); expect(view.result.current.preview).toBeNull(); expect(request.canCommit()).toBe(false);
    const undone = workspaceUndo(settled), redone = workspaceRedo(undone);
    expect(serializeStudioEditableMesh(source(undone).mesh)).toEqual(before.mesh);
    expect(serializeStudioEditableMesh(source(redone).mesh)).toEqual(expected);
    const encoded = encodeStudioHybridDccWorkspacePersistenceEnvelope({ workspace: settled, scope: SCOPE, savedAt: 2 });
    const restored = decodeStudioHybridDccWorkspacePersistenceEnvelope({ bytes: encoded.bytes, scope: SCOPE });
    expect(restored.kind).toBe("workspace"); const reopened = need(restored.workspace);
    expect(serializeStudioEditableMesh(source(reopened).mesh)).toEqual(expected);
    expect(serializeStudioCommandJournal(reopened.session.journal)).toBe(serializeStudioCommandJournal(settled.session.journal));
    expect(serializeStudioEditableMesh(source(workspaceUndo(reopened)).mesh)).toEqual(before.mesh);
    expect(source(workspaceRedo(workspaceUndo(reopened))).sourceHash).toBe(source(settled).sourceHash);
    unchanged(f.input.workspace, before);
  });

  it("빈 선택·읽기 전용·비활성 상태에서는 producer와 host를 호출하지 않는다", () => {
    const producer = vi.fn(compute), f = fixture(producer);
    const view = renderHook((input: Input) => useStudioHybridDccCoplanarEdgeDissolve(input), { initialProps: f.input });
    for (const input of [{ ...f.input, selection: createStudioHybridDccComponentSelection() },
      { ...f.input, enabled: false }, { ...f.input, disabled: true }, { ...f.input, run: undefined }]) {
      view.rerender(input); expect(view.result.current.canPrepare).toBe(false);
      act(() => view.result.current.prepare());
      expect(view.result.current.preview).toBeNull(); expect(view.result.current.canApply).toBe(false);
    }
    expect(producer).not.toHaveBeenCalled(); expect(f.run).not.toHaveBeenCalled();
  });

  it("pending 취소 뒤 새 요청이 준비되어도 늦은 이전 계산은 새 preview를 덮지 못한다", async () => {
    const pending = pendingCompute(), f = fixture(pending.delayed), before = snapshot(f.input.workspace);
    const view = renderHook(() => useStudioHybridDccCoplanarEdgeDissolve(f.input));
    act(() => { view.result.current.prepare(); view.result.current.prepare(); }); const first = need(pending.calls[0]);
    expect(pending.calls).toHaveLength(1);
    expect(view.result.current.pending).toBe(true); expect(first.original.mesh).not.toBe(f.source.mesh);
    act(() => view.result.current.cancel()); expect(first.options.signal?.aborted).toBe(true);
    act(() => view.result.current.prepare()); const second = need(pending.calls[1]);
    expect(second.options.generation).toBeGreaterThan(first.options.generation);
    await act(async () => { first.completion.resolve(await compute(first.original, first.request, first.options)); });
    expect(view.result.current.pending).toBe(true); expect(view.result.current.preview).toBeNull();
    await act(async () => { second.completion.resolve(await compute(second.original, second.request, second.options)); });
    await waitFor(() => expect(view.result.current.canApply).toBe(true));
    expect(need(view.result.current.preview).plan.generation).toBe(second.options.generation);
    expect(f.requests).toHaveLength(0); unchanged(f.input.workspace, before);
  });

  it("ready 취소는 preview·적용 권한을 지우고 새 준비 전까지 문서 명령을 만들지 않는다", async () => {
    const f = fixture(), before = snapshot(f.input.workspace);
    const view = renderHook(() => useStudioHybridDccCoplanarEdgeDissolve(f.input));
    await ready(view.result);
    act(() => view.result.current.cancel()); act(() => view.result.current.apply());
    expect(view.result.current.preview).toBeNull(); expect(view.result.current.canApply).toBe(false);
    expect(view.result.current.engaged).toBe(false); expect(view.result.current.canPrepare).toBe(true);
    expect(view.result.current.notice).toBe(studioCoplanarEdgeDissolveNotice("cancelled"));
    expect(f.requests).toHaveLength(0); await ready(view.result); unchanged(f.input.workspace, before);
  });

  const identities: readonly ("session" | "selection" | "bridge")[] = ["session", "selection", "bridge"];
  it.each(identities)("같은 hash라도 새 %s identity는 preview를 숨기며 원래 값으로 돌아와도 plan을 되살리지 않는다", async (kind) => {
    const observed: AbortSignal[] = [], producer: Compute = async (original, request, options) => {
      if (options.signal) observed.push(options.signal); return compute(original, request, options);
    };
    const f = fixture(producer), before = snapshot(f.input.workspace);
    const view = renderHook((input: Input) => useStudioHybridDccCoplanarEdgeDissolve(input), { initialProps: f.input });
    await ready(view.result);
    const changed: Input = kind === "session"
      ? { ...f.input, workspace: { ...f.input.workspace, session: { ...f.input.workspace.session } } }
      : kind === "selection" ? { ...f.input, selection: { ...f.input.selection } }
        : { ...f.input, workspace: workspaceSetAssetVisibility(f.input.workspace, "cube", false) };
    expect(changed.workspace.session.state.stateHash).toBe(f.input.workspace.session.state.stateHash);
    if (kind === "bridge") expect(changed.workspace.session).toBe(f.input.workspace.session);
    view.rerender(changed);
    expect(view.result.current.preview).toBeNull(); expect(view.result.current.canApply).toBe(false);
    expect(need(observed[0]).aborted).toBe(true);
    view.rerender(f.input);
    expect(view.result.current.preview).toBeNull(); expect(view.result.current.status).toBe("empty");
    act(() => view.result.current.apply()); expect(f.requests).toHaveLength(0); unchanged(f.input.workspace, before);
  });

  it("계산 대기 중 선택 A→B→A와 UndoRedo 세션 ABA는 이전 세대를 무효화한다", async () => {
    const pending = pendingCompute(), f = fixture(pending.delayed), before = snapshot(f.input.workspace);
    const view = renderHook((input: Input) => useStudioHybridDccCoplanarEdgeDissolve(input), { initialProps: f.input });
    act(() => view.result.current.prepare()); const first = need(pending.calls[0]);
    view.rerender({ ...f.input, selection: createStudioHybridDccComponentSelection() }); view.rerender(f.input);
    await act(async () => { first.completion.resolve(await compute(first.original, first.request, first.options)); });
    expect(first.options.signal?.aborted).toBe(true); expect(view.result.current.preview).toBeNull();
    act(() => view.result.current.prepare()); const second = need(pending.calls[1]);
    const roundTrip = workspaceRedo(workspaceUndo(f.input.workspace));
    expect(source(roundTrip).sourceHash).toBe(f.source.sourceHash);
    view.rerender({ ...f.input, workspace: roundTrip }); view.rerender(f.input);
    await act(async () => { second.completion.resolve(await compute(second.original, second.request, second.options)); });
    expect(second.options.signal?.aborted).toBe(true); expect(view.result.current.preview).toBeNull();
    expect(f.requests).toHaveLength(0); unchanged(f.input.workspace, before);
  });

  const phases: readonly ("pending" | "ready")[] = ["pending", "ready"];
  it.each(phases)("외부 busy는 %s 요청을 취소하고 다시 활성화돼도 이전 결과를 게시하지 않는다", async (phase) => {
    const pending = pendingCompute(), f = fixture(pending.delayed), before = snapshot(f.input.workspace);
    const view = renderHook((input: Input) => useStudioHybridDccCoplanarEdgeDissolve(input), { initialProps: f.input });
    act(() => view.result.current.prepare()); const call = need(pending.calls[0]);
    if (phase === "ready") {
      await act(async () => { call.completion.resolve(await compute(call.original, call.request, call.options)); });
      await waitFor(() => expect(view.result.current.canApply).toBe(true));
    }
    view.rerender({ ...f.input, disabled: true });
    expect(call.options.signal?.aborted).toBe(true); expect(view.result.current.canPrepare).toBe(false);
    expect(view.result.current.preview).toBeNull(); expect(view.result.current.notice).toBe(studioCoplanarEdgeDissolveNotice("otherEdit"));
    if (phase === "pending") await act(async () => { call.completion.resolve(await compute(call.original, call.request, call.options)); });
    view.rerender(f.input); expect(view.result.current.canPrepare).toBe(true); expect(view.result.current.canApply).toBe(false);
    expect(f.requests).toHaveLength(0); unchanged(f.input.workspace, before);
  });

  it("후보를 만든 뒤 실제 modifier 대기 중 취소하면 최종 guard가 발행을 막는다", async () => {
    const f = fixture(), before = snapshot(f.input.workspace), completion = deferred<StudioHybridDccWorkspace>(), published = vi.fn();
    const view = renderHook((input: Input) => useStudioHybridDccCoplanarEdgeDissolve(input), { initialProps: f.input });
    await ready(view.result);
    act(() => view.result.current.apply()); view.rerender({ ...f.input, disabled: true });
    const request = need(f.requests[0]), candidate = request.edit(f.input.workspace, f.input.selection);
    // Panel의 modifier 완료 뒤 guard만 재현한다. 실제 Panel/브라우저 발행 검증과 구분한다.
    const publication = (async () => {
      const settled = await workspaceRefreshModifierPreviews(await completion.promise);
      if (request.canCommit()) published(settled);
    })();
    act(() => view.result.current.cancel()); expect(request.canCommit()).toBe(false);
    await act(async () => { completion.resolve(candidate.workspace); await publication; });
    expect(published).not.toHaveBeenCalled(); expect(view.result.current.notice).toBe(studioCoplanarEdgeDissolveNotice("cancelled"));
    expect(view.result.current.preview).toBeNull(); unchanged(f.input.workspace, before);
  });

  const hostModes: readonly ("noop" | "candidate-only")[] = ["noop", "candidate-only"];
  it.each(hostModes)("%s host는 완료로 표시하지 않고 이전 plan·지연 callback을 재사용하지 못한다", async (mode) => {
    const f = fixture(), before = snapshot(f.input.workspace);
    const view = renderHook((input: Input) => useStudioHybridDccCoplanarEdgeDissolve(input), { initialProps: f.input });
    await ready(view.result); act(() => view.result.current.apply()); const request = need(f.requests[0]);
    if (mode === "candidate-only") act(() => { request.edit(f.input.workspace, f.input.selection); });
    await waitFor(() => expect(view.result.current.notice).toBe(studioCoplanarEdgeDissolveNotice("applyUnconfirmed")));
    expect(view.result.current.applying).toBe(false); expect(view.result.current.canApply).toBe(false);
    expect(view.result.current.status).toBe("failed"); expect(request.canCommit()).toBe(false);
    act(() => view.result.current.apply()); expect(f.requests).toHaveLength(1);
    expect(() => request.edit(f.input.workspace, f.input.selection)).toThrow();
    await ready(view.result); expect(f.requests).toHaveLength(1); unchanged(f.input.workspace, before);
  });

  it("실제 geometry.commit 실패는 catch 안내 guard를 유지하되 적용 plan을 소모하고 원본은 보존한다", async () => {
    const f = fixture(), before = snapshot(f.input.workspace);
    const view = renderHook((input: Input) => useStudioHybridDccCoplanarEdgeDissolve(input), { initialProps: f.input });
    await ready(view.result);
    const spy = vi.spyOn(documentAuthority, "hybridDccCommitGeometry").mockImplementationOnce(() => { throw new Error("통제된 문서 명령 실패"); });
    try {
      act(() => view.result.current.apply()); view.rerender({ ...f.input, disabled: true });
      const request = need(f.requests[0]);
      act(() => { expect(() => request.edit(f.input.workspace, f.input.selection)).toThrow(); });
      expect(spy).toHaveBeenCalledTimes(1); expect(request.canCommit()).toBe(true);
      expect(view.result.current.error.length).toBeGreaterThan(0); expect(view.result.current.applying).toBe(false);
      expect(view.result.current.canApply).toBe(false); act(() => view.result.current.apply()); expect(f.requests).toHaveLength(1);
      unchanged(f.input.workspace, before);
    } finally { spy.mockRestore(); }
    view.rerender(f.input); await ready(view.result); unchanged(f.input.workspace, before);
  });

  it("실제 계산 포트의 실패는 원본을 유지하며 새 준비 요청으로만 재시도한다", async () => {
    let attempts = 0;
    const producer: Compute = async (original, request, options) => {
      attempts += 1; if (attempts === 1) throw new Error("통제된 계산 실패"); return compute(original, request, options);
    };
    const f = fixture(producer), before = snapshot(f.input.workspace);
    const view = renderHook(() => useStudioHybridDccCoplanarEdgeDissolve(f.input));
    act(() => view.result.current.prepare()); await waitFor(() => expect(view.result.current.status).toBe("failed"));
    expect(view.result.current.error.length).toBeGreaterThan(0); expect(view.result.current.canPrepare).toBe(true);
    expect(view.result.current.canApply).toBe(false); expect(f.requests).toHaveLength(0);
    await ready(view.result); expect(attempts).toBe(2); unchanged(f.input.workspace, before);
  });

  it("unmount는 대기 중 signal을 취소하고 늦은 결과로 host를 호출하지 않는다", async () => {
    const pending = pendingCompute(), f = fixture(pending.delayed), before = snapshot(f.input.workspace);
    const view = renderHook(() => useStudioHybridDccCoplanarEdgeDissolve(f.input));
    act(() => view.result.current.prepare()); const call = need(pending.calls[0]);
    view.unmount(); expect(call.options.signal?.aborted).toBe(true);
    await act(async () => { call.completion.resolve(await compute(call.original, call.request, call.options)); });
    expect(f.requests).toHaveLength(0); unchanged(f.input.workspace, before);
  });
});
