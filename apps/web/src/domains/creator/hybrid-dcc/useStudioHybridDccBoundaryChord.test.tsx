// @vitest-environment jsdom
/** 실제 선택·투영·커널·문서 명령을 사용한다. Worker 전송은 별도 client 회귀의 책임이다. */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { Matrix4, OrthographicCamera, Vector2, Vector3 } from "three";
import { afterEach, describe, expect, it } from "vitest";

import { inspectStudioMeshSurfaceForInteractiveProjection } from "../mesh-surface/studio-mesh-surface-interactive";
import { hashStudioEditableMesh, serializeStudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { splitStudioEditableFaceBoundaryChordWithUv } from "./studio-hybrid-dcc-boundary-chord-uv";
import { createStudioHybridDccComponentSelection, mapStudioHybridDccRayFaceIndex, mutateStudioHybridDccComponentSelection } from "./studio-hybrid-dcc-component-selection";
import { readStudioMeshFaceLoops } from "./studio-hybrid-dcc-face-modeling-mesh";
import { createStudioHybridDccWorkspace, workspaceAddUnitCube, workspaceComponentSelectionSource, workspaceUndo } from "./studio-hybrid-dcc-workspace";
import { useStudioHybridDccBoundaryChord, type StudioBoundaryChordHookInput } from "./useStudioHybridDccBoundaryChord";

import type { StudioBoundaryChordWorkerInput } from "./studio-hybrid-dcc-boundary-chord-worker-protocol";
import type { StudioBoundaryChordUvResult } from "./studio-hybrid-dcc-boundary-chord-uv";
import type { StudioHybridDccWorkspaceEdit } from "./studio-hybrid-dcc-face-modeling-workspace";

function need<T>(value: T | undefined | null): T { if (value === undefined || value === null) throw new Error("실제 fixture 값이 없습니다."); return value; }
const compute: NonNullable<StudioBoundaryChordHookInput["compute"]> = async (input) => splitStudioEditableFaceBoundaryChordWithUv(
  { mesh: input.mesh, meshHash: input.meshHash, meshRevision: input.meshRevision }, input.request,
);
function fixture() {
  const workspace = workspaceAddUnitCube(createStudioHybridDccWorkspace("boundary-hook"), "cube");
  const source = need(workspaceComponentSelectionSource(workspace));
  const face = need(readStudioMeshFaceLoops(source.mesh)?.find((loop) => loop.vertexIds.every((id) => source.mesh.vertices[id]?.position.z === 0.5)));
  const selected = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), {
    mode: "face", operation: "replace", ids: [face.id], source,
  });
  if (!selected.ok) throw new Error("실제 선택을 만들지 못했습니다.");
  const surface = inspectStudioMeshSurfaceForInteractiveProjection(source.mesh);
  if (!surface.ok) throw new Error(surface.message);
  const index = surface.value.plan.triangles.findIndex((triangle) => triangle.faceId === face.id);
  const mapping = mapStudioHybridDccRayFaceIndex(source, index);
  if (!mapping.ok) throw new Error("실제 triangle mapping이 없습니다.");
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.set(0, 0, 3); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const projection = (edgeIndex: number, t: number) => {
    const edge = need(source.mesh.halfEdges[need(face.halfEdgeIds[edgeIndex])]);
    const a = need(source.mesh.vertices[need(source.mesh.halfEdges[edge.prev]).vertex]).position;
    const b = need(source.mesh.vertices[edge.vertex]).position;
    const point = new Vector3(a.x, a.y, a.z).lerp(new Vector3(b.x, b.y, b.z), t).project(camera);
    return { pointerNdc: new Vector2(point.x, point.y), camera, matrixWorld: new Matrix4(), viewportSize: { width: 600, height: 600 } };
  };
  const requests: { readonly edit: StudioHybridDccWorkspaceEdit; readonly canCommit: () => boolean }[] = [];
  const run: NonNullable<StudioBoundaryChordHookInput["run"]> = (_label, edit, canCommit) => {
    if (!canCommit) throw new Error("실제 host publication fence가 없습니다.");
    requests.push({ edit, canCommit });
  };
  const input: StudioBoundaryChordHookInput = { workspace, selection: selected.value, enabled: true, disabled: false, run, compute };
  return { input, source, projection, hit: mapping.value, requests };
}
function deferred() {
  let resolve: (value: StudioBoundaryChordUvResult) => void = () => { throw new Error("준비되지 않은 비동기 경계입니다."); };
  const promise = new Promise<StudioBoundaryChordUvResult>((done) => { resolve = done; });
  return { promise, resolve };
}
afterEach(cleanup);

describe("경계선 면 나누기 훅의 실제 source/host 경계", () => {
  it("두 실제 endpoint 뒤에만 preview를 만들고 host busy 뒤 최신 fence와 단일 명령으로 적용한다", async () => {
    const f = fixture(), before = serializeStudioEditableMesh(f.source.mesh), undoCount = f.input.workspace.session.undoStack.length;
    const view = renderHook((input: StudioBoundaryChordHookInput) => useStudioHybridDccBoundaryChord(input), { initialProps: f.input });
    act(() => { expect(view.result.current.pickEndpoint(f.hit, "edge", f.projection(0, 0.25))).toBe(true); });
    expect(view.result.current.status).toBe("first-endpoint"); expect(view.result.current.canApply).toBe(false);
    act(() => { view.result.current.pickEndpoint(f.hit, "edge", f.projection(2, 0.75)); });
    await waitFor(() => expect(view.result.current.canApply).toBe(true));
    expect(serializeStudioEditableMesh(f.source.mesh)).toEqual(before); expect(f.requests).toHaveLength(0);
    expect(view.result.current.preview?.workspace.session.undoStack.length).toBe(undoCount);
    act(() => view.result.current.apply());
    expect(f.requests).toHaveLength(1); const request = need(f.requests[0]);
    view.rerender({ ...f.input, disabled: true });
    expect(request.canCommit()).toBe(true);
    const committed = request.edit(f.input.workspace, f.input.selection);
    expect(committed.workspace.session.undoStack.length).toBe(undoCount + 1);
    expect(committed.selection?.elementIds).toHaveLength(2);
    expect(request.canCommit()).toBe(true);
    view.rerender({ ...f.input, workspace: committed.workspace, selection: need(committed.selection) });
    await waitFor(() => expect(view.result.current.notice).toContain("면을 나눴습니다"));
    expect(view.result.current.engaged).toBe(false);
    expect(hashStudioEditableMesh(need(workspaceComponentSelectionSource(workspaceUndo(committed.workspace))).mesh)).toBe(f.source.sourceHash);
  });

  it("동일 endpoint의 실제 커널 거부 뒤 원본과 이력을 유지하며 새 endpoint로 재시도한다", async () => {
    const f = fixture(), view = renderHook(() => useStudioHybridDccBoundaryChord(f.input));
    act(() => { view.result.current.pickEndpoint(f.hit, "edge", f.projection(0, 0.25)); });
    act(() => { view.result.current.pickEndpoint(f.hit, "edge", f.projection(0, 0.25)); });
    await waitFor(() => expect(view.result.current.status).toBe("failed"));
    expect(view.result.current.error.length).toBeGreaterThan(0); expect(view.result.current.canApply).toBe(false);
    expect(f.requests).toHaveLength(0); expect(workspaceComponentSelectionSource(f.input.workspace)?.sourceHash).toBe(f.source.sourceHash);
    act(() => { view.result.current.pickEndpoint(f.hit, "edge", f.projection(2, 0.75)); });
    await waitFor(() => expect(view.result.current.canApply).toBe(true));
  });

  it("이전 비동기 결과가 늦게 끝나도 취소 뒤 새 세대의 preview를 덮지 않는다", async () => {
    const f = fixture(), calls: { input: StudioBoundaryChordWorkerInput; signal: AbortSignal | undefined; output: ReturnType<typeof deferred> }[] = [];
    const delayed: NonNullable<StudioBoundaryChordHookInput["compute"]> = (input, options) => {
      const output = deferred(); calls.push({ input, signal: options.signal, output }); return output.promise;
    };
    const view = renderHook(() => useStudioHybridDccBoundaryChord({ ...f.input, compute: delayed }));
    const pick = () => {
      act(() => { view.result.current.pickEndpoint(f.hit, "edge", f.projection(0, 0.25)); });
      act(() => { view.result.current.pickEndpoint(f.hit, "edge", f.projection(2, 0.75)); });
    };
    pick(); expect(calls).toHaveLength(1); const first = need(calls[0]);
    act(() => view.result.current.cancel()); expect(first.signal?.aborted).toBe(true);
    pick(); expect(calls).toHaveLength(2); const second = need(calls[1]);
    await act(async () => { first.output.resolve(await compute(first.input, {})); });
    expect(view.result.current.status).toBe("pending"); expect(view.result.current.canApply).toBe(false);
    await act(async () => { second.output.resolve(await compute(second.input, {})); });
    expect(view.result.current.canApply).toBe(true); expect(view.result.current.plan?.generation).toBe(second.input.generation);
  });

  it("새 문서·선택은 이전 plan을 즉시 숨기며 대기 중 Worker signal도 취소한다", async () => {
    const f = fixture(), output = deferred(), signals: AbortSignal[] = [];
    const delayed: NonNullable<StudioBoundaryChordHookInput["compute"]> = (_input, options) => {
      if (options.signal) signals.push(options.signal); return output.promise;
    };
    const view = renderHook((input: StudioBoundaryChordHookInput) => useStudioHybridDccBoundaryChord(input), { initialProps: { ...f.input, compute: delayed } });
    act(() => { view.result.current.pickEndpoint(f.hit, "edge", f.projection(0, 0.25)); });
    act(() => { view.result.current.pickEndpoint(f.hit, "edge", f.projection(2, 0.75)); });
    expect(view.result.current.pending).toBe(true);
    view.rerender({ ...f.input, compute: delayed, selection: createStudioHybridDccComponentSelection() });
    expect(view.result.current.preview).toBeNull(); expect(view.result.current.canApply).toBe(false);
    expect(need(signals[0]).aborted).toBe(true); expect(f.requests).toHaveLength(0);
    view.unmount();
  });

  it("host 대기 중 취소하면 publication fence가 닫혀 실제 문서 명령을 실행할 수 없다", async () => {
    const f = fixture(), view = renderHook(() => useStudioHybridDccBoundaryChord(f.input));
    const undoCount = f.input.workspace.session.undoStack.length;
    act(() => { view.result.current.pickEndpoint(f.hit, "edge", f.projection(0, 0.25)); });
    act(() => { view.result.current.pickEndpoint(f.hit, "edge", f.projection(2, 0.75)); });
    await waitFor(() => expect(view.result.current.canApply).toBe(true));
    act(() => view.result.current.apply()); const request = need(f.requests[0]);
    act(() => view.result.current.cancel()); expect(request.canCommit()).toBe(false);
    expect(() => request.edit(f.input.workspace, f.input.selection)).toThrow();
    expect(f.input.workspace.session.undoStack.length).toBe(undoCount);
    expect(workspaceComponentSelectionSource(f.input.workspace)?.sourceHash).toBe(f.source.sourceHash);
  });

  it("unmount는 진행 중 signal을 취소하며 늦게 끝난 실제 계산으로 host를 호출하지 않는다", async () => {
    const f = fixture(), output = deferred();
    const calls: { readonly input: StudioBoundaryChordWorkerInput; readonly signal?: AbortSignal }[] = [];
    const delayed: NonNullable<StudioBoundaryChordHookInput["compute"]> = (input, options) => {
      calls.push({ input, signal: options.signal }); return output.promise;
    };
    const view = renderHook(() => useStudioHybridDccBoundaryChord({ ...f.input, compute: delayed }));
    act(() => { view.result.current.pickEndpoint(f.hit, "edge", f.projection(0, 0.25)); });
    act(() => { view.result.current.pickEndpoint(f.hit, "edge", f.projection(2, 0.75)); });
    const pending = need(calls[0]);
    view.unmount(); expect(pending.signal?.aborted).toBe(true);
    output.resolve(await compute(pending.input, {}));
    await Promise.resolve(); await Promise.resolve();
    expect(f.requests).toHaveLength(0);
    expect(workspaceComponentSelectionSource(f.input.workspace)?.sourceHash).toBe(f.source.sourceHash);
  });
});
