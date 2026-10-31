/** 실제 endpoint·커널·문서 권위의 연결 회귀 초안이다. QA 사본이며 아직 실행하지 않았다. */
import { Matrix4, OrthographicCamera, Vector2, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { serializeStudioCommandJournal } from "../studio-command-journal";
import { hashStudioEditableMesh, serializeStudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { inspectStudioMeshSurfaceForInteractiveProjection } from "../mesh-surface/studio-mesh-surface-interactive";
import { decodeStudioMeshUvLayer, hashStudioMeshUvTopology } from "../mesh-uv/studio-mesh-uv-authority";
import {
  collectStudioHybridDccBoundaryEndpoint,
  type StudioBoundaryEndpointLease,
} from "./studio-hybrid-dcc-boundary-endpoint";
import {
  createStudioHybridDccComponentSelection, mapStudioHybridDccRayFaceIndex, mutateStudioHybridDccComponentSelection,
  type StudioHybridDccComponentSelection,
} from "./studio-hybrid-dcc-component-selection";
import { hybridDccCommitGeometry } from "./studio-hybrid-dcc-document";
import { readStudioMeshFaceLoops } from "./studio-hybrid-dcc-face-modeling-mesh";
import { splitStudioEditableFaceBoundaryChordWithUv } from "./studio-hybrid-dcc-boundary-chord-uv";
import {
  commitStudioHybridDccBoundaryChord, prepareStudioHybridDccBoundaryChord, previewStudioHybridDccBoundaryChord,
  type StudioBoundaryChordCurrent, type StudioBoundaryChordPlan, type StudioBoundaryChordPreparation,
  type StudioBoundaryChordWorkspaceRequest,
} from "./studio-hybrid-dcc-boundary-chord-workspace";
import type { StudioBoundaryChordWorkerInput } from "./studio-hybrid-dcc-boundary-chord-worker-protocol";
import {
  createStudioHybridDccWorkspace, synchronizeWorkspaceGeometryAuthority, workspaceAddUnitCube,
  workspaceComponentSelectionSource, workspaceLoopCutActive, workspaceRedo, workspaceUndo, type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";
import {
  decodeStudioHybridDccWorkspacePersistenceEnvelope, encodeStudioHybridDccWorkspacePersistenceEnvelope,
} from "./studio-hybrid-dcc-workspace-persistence";

function need<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("실제 회귀 입력의 권위 값이 없습니다.");
  return value;
}
function value<T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false }): T {
  if (!result.ok) throw new Error("실제 endpoint·선택 fixture가 거부되었습니다.");
  return result.value;
}
function record(workspace: StudioHybridDccWorkspace) {
  return need(workspace.session.state.geometry.records[need(workspace.activeAssetId)]);
}
function selected(workspace: StudioHybridDccWorkspace, faceId: number): StudioHybridDccComponentSelection {
  return value(mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), {
    mode: "face", operation: "replace", ids: [faceId], activeId: faceId,
    source: need(workspaceComponentSelectionSource(workspace)),
  }));
}
function fixture(workspace = workspaceAddUnitCube(createStudioHybridDccWorkspace("boundary-chord-workspace"), "cube")) {
  const source = need(workspaceComponentSelectionSource(workspace)), loops = need(readStudioMeshFaceLoops(source.mesh));
  const face = need(loops.find((loop) => loop.vertexIds.every((id) => need(source.mesh.vertices[id]).position.y === 0.5)));
  const selection = selected(workspace, face.id), inspected = inspectStudioMeshSurfaceForInteractiveProjection(source.mesh);
  if (!inspected.ok) throw new Error(inspected.message);
  const faceIndex = inspected.value.plan.triangles.findIndex((triangle) => triangle.faceId === face.id);
  if (faceIndex < 0) throw new Error("선택면의 실제 surface triangle이 없습니다.");
  const hit = value(mapStudioHybridDccRayFaceIndex(source, faceIndex));
  const camera = new OrthographicCamera(-2, 2, 2, -2, 0.1, 10), matrixWorld = new Matrix4();
  camera.position.set(0, 3, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  const collect = (halfEdgeId: number, t: number): StudioBoundaryEndpointLease => {
    const edge = need(source.mesh.halfEdges[halfEdgeId]);
    const a = need(source.mesh.vertices[need(source.mesh.halfEdges[edge.prev]).vertex]).position;
    const b = need(source.mesh.vertices[edge.vertex]).position;
    const point = new Vector3(a.x, a.y, a.z).lerp(new Vector3(b.x, b.y, b.z), t).project(camera);
    const lease = value(collectStudioHybridDccBoundaryEndpoint(source, selection, hit, "edge", {
      camera, matrixWorld, pointerNdc: new Vector2(point.x, point.y), viewportSize: { width: 512, height: 512 }, thresholdPx: 4,
    }));
    if (lease.anchor.kind !== "edge") throw new Error("실제 edge 내부의 endpoint를 수집하지 못했습니다.");
    expect(lease.anchor.halfEdgeId).toBe(halfEdgeId); expect(lease.anchor.t).toBeCloseTo(t, 14);
    return lease;
  };
  const first = need(face.halfEdgeIds[0]), opposite = need(face.halfEdgeIds[2]);
  const request: StudioBoundaryChordWorkspaceRequest = { tool: "boundary-chord", endpoints: [collect(first, 0.25), collect(opposite, 0.75)] };
  return { current: { workspace, selection }, source, face, loops, request };
}
function actualCompute(input: StudioBoundaryChordWorkerInput) {
  return splitStudioEditableFaceBoundaryChordWithUv({ mesh: input.mesh, meshHash: input.meshHash, meshRevision: input.meshRevision }, input.request);
}
function context() {
  const base = fixture(), controller = new AbortController(); let live: StudioBoundaryChordCurrent = base.current, generation = 4;
  const compute = vi.fn(async (input: StudioBoundaryChordWorkerInput) => actualCompute(input));
  const preparation: StudioBoundaryChordPreparation = {
    generation: 4, signal: controller.signal, compute, readCurrent: () => live, isCurrent: () => generation === 4,
  };
  return { ...base, preparation, compute, controller, readCurrent: () => live,
    setCurrent(next: StudioBoundaryChordCurrent) { live = next; }, advanceGeneration() { generation++; } };
}
type Context = ReturnType<typeof context>;
function before(workspace: StudioHybridDccWorkspace) {
  const geometry = record(workspace);
  return { session: workspace.session, state: workspace.session.state, geometry, mesh: geometry.mesh,
    serialized: serializeStudioEditableMesh(geometry.mesh), hash: hashStudioEditableMesh(geometry.mesh),
    commandCount: workspace.session.state.commandCount, undo: workspace.session.undoStack, redo: workspace.session.redoStack,
    history: JSON.stringify([workspace.session.undoStack, workspace.session.redoStack]), journal: serializeStudioCommandJournal(workspace.session.journal) };
}
function unchanged(workspace: StudioHybridDccWorkspace, snapshot: ReturnType<typeof before>) {
  expect(workspace.session).toBe(snapshot.session); expect(workspace.session.state).toBe(snapshot.state);
  expect(record(workspace)).toBe(snapshot.geometry); expect(record(workspace).mesh).toBe(snapshot.mesh);
  expect(serializeStudioEditableMesh(record(workspace).mesh)).toEqual(snapshot.serialized);
  expect(hashStudioEditableMesh(record(workspace).mesh)).toBe(snapshot.hash);
  expect(workspace.session.state.commandCount).toBe(snapshot.commandCount);
  expect(workspace.session.undoStack).toBe(snapshot.undo); expect(workspace.session.redoStack).toBe(snapshot.redo);
  expect(JSON.stringify([workspace.session.undoStack, workspace.session.redoStack])).toBe(snapshot.history);
  expect(serializeStudioCommandJournal(workspace.session.journal)).toBe(snapshot.journal);
}
function deferred<T>() {
  let complete: ((result: T) => void) | null = null;
  const promise = new Promise<T>((resolve) => { complete = resolve; });
  return { promise, resolve(result: T) { if (complete === null) throw new Error("대기 Promise가 준비되지 않았습니다."); complete(result); } };
}
interface InvalidCase { readonly name: string; readonly code: string; readonly change: (input: Context) => void; }
const invalidCases: readonly InvalidCase[] = [
  { name: "session", code: "stale-preview", change(input) {
    input.setCurrent({ ...input.current, workspace: { ...input.current.workspace, session: { ...input.current.workspace.session } } });
  } },
  { name: "revision", code: "stale-preview", change(input) {
    const workspace = synchronizeWorkspaceGeometryAuthority(input.current.workspace,
      hybridDccCommitGeometry(input.current.workspace.session, input.source.assetId, input.source.mesh));
    expect(record(workspace).meshHash).toBe(input.source.sourceHash);
    expect(record(workspace).revision).toBeGreaterThan(input.source.meshRevision);
    input.setCurrent({ workspace, selection: selected(workspace, input.face.id) });
  } },
  { name: "selection", code: "stale-endpoint", change(input) {
    input.setCurrent({ ...input.current, selection: selected(input.current.workspace, need(input.loops.find(({ id }) => id !== input.face.id)).id) });
  } },
  { name: "generation", code: "stale-preview", change(input) { input.advanceGeneration(); } },
  { name: "abort", code: "aborted", change(input) { input.controller.abort(); } },
];

describe("경계 chord workspace 제품 연결 회귀 초안", () => {
  it("실제 루프 절단 뒤 이전 endpoint와 발급 계획을 거부하고 새 편집 이력을 보존한다", async () => {
    const input = context(), original = before(input.current.workspace);
    const plan = await prepareStudioHybridDccBoundaryChord(input.current, input.request, input.preparation);
    const cut = workspaceLoopCutActive(input.current.workspace, 0.5), cutBefore = before(cut);
    expect(record(cut).meshHash).not.toBe(input.source.sourceHash);
    expect(record(cut).mesh.halfEdges.length).toBeGreaterThan(input.source.mesh.halfEdges.length);
    const current = { workspace: cut, selection: selected(cut, input.face.id) };
    input.setCurrent(current); input.compute.mockClear();
    await expect(prepareStudioHybridDccBoundaryChord(current, input.request, input.preparation))
      .rejects.toMatchObject({ code: "stale-endpoint" });
    expect(input.compute).not.toHaveBeenCalled();
    expect(() => previewStudioHybridDccBoundaryChord(current, plan)).toThrow(expect.objectContaining({ code: "stale-preview" }));
    expect(() => commitStudioHybridDccBoundaryChord(current, plan)).toThrow(expect.objectContaining({ code: "stale-preview" }));
    unchanged(input.current.workspace, original); unchanged(cut, cutBefore);
  });

  it("UV·crease가 있는 실제 루프 절단 뒤 새 경계를 한 번 확정하고 Undo/Redo·저장으로 복원한다", async () => {
    const cube = fixture().current.workspace, base = record(cube).mesh;
    const attributed = { ...base,
      vertices: base.vertices.map((vertex) => ({ ...vertex, crease: (vertex.id + 1) / 16 })),
      halfEdges: base.halfEdges.map((edge) => ({ ...edge, crease: 0.375 })),
      faces: base.faces.map((face) => ({ ...face, materialSlot: face.id, smooth: false })),
    };
    const corners = attributed.halfEdges.map((edge) => {
      const point = need(attributed.vertices[need(attributed.halfEdges[edge.prev]).vertex]).position;
      return { halfEdgeId: edge.id, u: 2 * (point.x + 0.5) + edge.face * 4, v: 2 * (point.z + 0.5) - edge.face * 4 };
    });
    const mesh = { ...attributed, uvLayer: decodeStudioMeshUvLayer({ revision: 1,
      topologyHash: hashStudioMeshUvTopology(attributed), corners }, attributed) };
    const source = synchronizeWorkspaceGeometryAuthority(cube, hybridDccCommitGeometry(cube.session, "cube", mesh));
    const cut = workspaceLoopCutActive(source, 0.5), cutMesh = record(cut).mesh, cutBefore = before(cut);
    expect(cutMesh.uvLayer?.corners).toHaveLength(cutMesh.halfEdges.length);
    expect(new Set(need(cutMesh.uvLayer).corners.map(({ u, v }) => `${u},${v}`)).size).toBeGreaterThan(4);
    expect(cutMesh.halfEdges.some(({ crease }) => crease > 0)).toBe(true);
    const input = fixture(cut), preparation: StudioBoundaryChordPreparation = {
      generation: 1, compute: async (workerInput) => actualCompute(workerInput),
      readCurrent: () => input.current, isCurrent: () => true,
    };
    const plan = await prepareStudioHybridDccBoundaryChord(input.current, input.request, preparation);
    const committed = commitStudioHybridDccBoundaryChord(input.current, plan).workspace;
    const result = record(committed).mesh, resultSnapshot = serializeStudioEditableMesh(result);
    expect(record(committed).meshHash).toBe(plan.resultMeshHash);
    expect(committed.session.state.commandCount).toBe(cutBefore.commandCount + 1);
    expect(committed.session.undoStack).toHaveLength(cutBefore.undo.length + 1);
    expect(result.uvLayer?.topologyHash).toBe(hashStudioMeshUvTopology(result));
    expect(result.uvLayer?.corners).toHaveLength(result.halfEdges.length);
    for (const mapping of plan.halfEdgeRemap) {
      const old = need(need(cutMesh.uvLayer).corners[mapping.sourceHalfEdgeId]);
      const first = need(need(result.uvLayer).corners[need(mapping.resultHalfEdgeIds[0])]);
      expect([first.u, first.v]).toEqual([old.u, old.v]);
      for (const id of mapping.resultHalfEdgeIds) expect(need(result.halfEdges[id]).crease)
        .toBe(need(cutMesh.halfEdges[mapping.sourceHalfEdgeId]).crease);
    }
    for (const mapping of plan.faceRemap) for (const id of mapping.resultFaceIds) {
      expect([need(result.faces[id]).materialSlot, need(result.faces[id]).smooth])
        .toEqual([need(cutMesh.faces[mapping.sourceFaceId]).materialSlot, need(cutMesh.faces[mapping.sourceFaceId]).smooth]);
    }
    expect(serializeStudioEditableMesh(record(workspaceUndo(committed)).mesh)).toEqual(cutBefore.serialized);
    expect(serializeStudioEditableMesh(record(workspaceRedo(workspaceUndo(committed))).mesh)).toEqual(resultSnapshot);
    const scope = { userId: "boundary-chord-tester", workId: "boundary-chord-workspace" };
    const encoded = encodeStudioHybridDccWorkspacePersistenceEnvelope({ workspace: committed, scope, savedAt: 2 });
    const decoded = decodeStudioHybridDccWorkspacePersistenceEnvelope({ bytes: encoded.bytes, scope });
    expect(decoded.kind).toBe("workspace"); const reopened = need(decoded.workspace);
    expect(serializeStudioEditableMesh(record(reopened).mesh)).toEqual(resultSnapshot);
    expect(serializeStudioCommandJournal(reopened.session.journal)).toBe(serializeStudioCommandJournal(committed.session.journal));
    expect(serializeStudioEditableMesh(record(workspaceUndo(reopened)).mesh)).toEqual(cutBefore.serialized);
    expect(serializeStudioEditableMesh(record(workspaceRedo(workspaceUndo(reopened))).mesh)).toEqual(resultSnapshot);
    unchanged(cut, cutBefore);
  });

  it("실제 투영 endpoint→async 커널→preview→한 번의 canonical geometry commit에 전체 대응을 보존한다", async () => {
    const input = context(), original = before(input.current.workspace);
    const plan = await prepareStudioHybridDccBoundaryChord(input.current, input.request, input.preparation);
    expect(input.compute).toHaveBeenCalledTimes(1);
    expect(input.compute).toHaveBeenCalledWith(expect.objectContaining({ assetId: input.source.assetId, mesh: input.source.mesh,
      meshHash: input.source.sourceHash, meshRevision: input.source.meshRevision, generation: 4 }), { signal: input.controller.signal });
    const preview = previewStudioHybridDccBoundaryChord(input.current, plan), nextMesh = record(preview.workspace).mesh;
    unchanged(input.current.workspace, original);
    expect(preview.workspace.session.undoStack).toBe(original.undo); expect(preview.workspace.session.journal).toBe(original.session.journal);
    expect(plan.sourceMeshHash).toBe(input.source.sourceHash); expect(plan.sourceMeshRevision).toBe(input.source.meshRevision);
    expect(plan.faceRemap.map(({ sourceFaceId }) => sourceFaceId)).toEqual(input.source.mesh.faces.map(({ id }) => id));
    for (const entry of plan.faceRemap) expect(entry.resultFaceIds).toEqual(entry.sourceFaceId === input.face.id
      ? [input.face.id, input.source.mesh.faces.length] : [entry.sourceFaceId]);
    expect(plan.halfEdgeRemap.map(({ sourceHalfEdgeId }) => sourceHalfEdgeId)).toEqual(input.source.mesh.halfEdges.map(({ id }) => id));
    for (const entry of plan.halfEdgeRemap) {
      const old = need(input.source.mesh.halfEdges[entry.sourceHalfEdgeId]);
      const chain = entry.resultHalfEdgeIds.map((id) => need(nextMesh.halfEdges[id]));
      expect(chain.length).toBeGreaterThanOrEqual(1); expect(chain.length).toBeLessThanOrEqual(2);
      expect(need(nextMesh.halfEdges[need(chain[0]).prev]).vertex).toBe(need(input.source.mesh.halfEdges[old.prev]).vertex);
      expect(need(chain.at(-1)).vertex).toBe(old.vertex);
      for (const edge of chain) expect(edge.crease).toBe(old.crease);
      if (old.twin >= 0) expect(chain.map(({ twin }) => twin)).toEqual([...need(plan.halfEdgeRemap[old.twin]).resultHalfEdgeIds].reverse());
    }
    expect(plan.selectionFaceIds).toEqual([input.face.id, input.source.mesh.faces.length]);
    expect(preview.selection.elementIds).toEqual(plan.selectionFaceIds);
    const committed = commitStudioHybridDccBoundaryChord(input.current, plan), committedRecord = record(committed.workspace);
    expect(committedRecord.meshHash).toBe(plan.resultMeshHash); expect(committedRecord.revision).toBe(input.source.meshRevision + 1);
    expect(serializeStudioEditableMesh(committedRecord.mesh)).toEqual(serializeStudioEditableMesh(nextMesh));
    expect(committed.workspace.session.state.commandCount).toBe(original.commandCount + 1);
    expect(committed.workspace.session.undoStack).toHaveLength(original.undo.length + 1);
    expect(committed.workspace.session.redoStack).toHaveLength(0);
    expect(committed.selection.provenance).toEqual({ assetId: input.source.assetId, meshRevision: committedRecord.revision, sourceHash: plan.resultMeshHash });
    expect(committed.selection.elementIds).toEqual(plan.selectionFaceIds); unchanged(input.current.workspace, original);
  });

  it("실제 Undo/Redo와 persistence encode/decode 뒤 같은 f64 메시·journal·두 history 상태를 복원한다", async () => {
    const input = context(), original = serializeStudioEditableMesh(input.source.mesh);
    const plan = await prepareStudioHybridDccBoundaryChord(input.current, input.request, input.preparation);
    const committed = commitStudioHybridDccBoundaryChord(input.current, plan).workspace, result = serializeStudioEditableMesh(record(committed).mesh);
    const undone = workspaceUndo(committed), redone = workspaceRedo(undone);
    expect(serializeStudioEditableMesh(record(undone).mesh)).toEqual(original);
    expect(serializeStudioEditableMesh(record(redone).mesh)).toEqual(result);
    expect(redone.session.state.stateHash).toBe(committed.session.state.stateHash);
    const scope = { userId: "boundary-chord-tester", workId: "boundary-chord-workspace" };
    const encoded = encodeStudioHybridDccWorkspacePersistenceEnvelope({ workspace: committed, scope, savedAt: 1 });
    const bytes = encoded.bytes.slice(), decoded = decodeStudioHybridDccWorkspacePersistenceEnvelope({ bytes: encoded.bytes, scope });
    expect(decoded.kind).toBe("workspace"); const reopened = need(decoded.workspace);
    expect(encoded.bytes).toEqual(bytes); expect(record(reopened).meshHash).toBe(plan.resultMeshHash);
    expect(serializeStudioEditableMesh(record(reopened).mesh)).toEqual(result);
    expect(serializeStudioCommandJournal(reopened.session.journal)).toBe(serializeStudioCommandJournal(committed.session.journal));
    const reopenedUndo = workspaceUndo(reopened), reopenedRedo = workspaceRedo(reopenedUndo);
    expect(serializeStudioEditableMesh(record(reopenedUndo).mesh)).toEqual(original);
    expect(serializeStudioEditableMesh(record(reopenedRedo).mesh)).toEqual(result);
    expect(reopenedRedo.session.state.stateHash).toBe(committed.session.state.stateHash);
  });

  it("표시 사본의 위치를 실제 변조해도 다음 preview와 commit은 보관한 개인 snapshot을 사용한다", async () => {
    const input = context(), sourceBefore = before(input.current.workspace);
    const plan = await prepareStudioHybridDccBoundaryChord(input.current, input.request, input.preparation);
    const preview = previewStudioHybridDccBoundaryChord(input.current, plan), mesh = record(preview.workspace).mesh;
    const expected = serializeStudioEditableMesh(mesh), originalPosition = need(mesh.vertices[0]).position;
    Object.defineProperty(originalPosition, "x", { value: originalPosition.x + 10, enumerable: true, configurable: true });
    expect(hashStudioEditableMesh(mesh)).not.toBe(plan.resultMeshHash);
    const fresh = previewStudioHybridDccBoundaryChord(input.current, plan);
    expect(record(fresh.workspace).mesh).not.toBe(mesh);
    expect(serializeStudioEditableMesh(record(fresh.workspace).mesh)).toEqual(expected);
    const committed = commitStudioHybridDccBoundaryChord(input.current, plan);
    expect(serializeStudioEditableMesh(record(committed.workspace).mesh)).toEqual(expected);
    unchanged(input.current.workspace, sourceBefore);
  });

  it("계획의 DTO 복사와 endpoint의 DTO 복사는 발급 권위를 얻지 못하고 history를 만들지 않는다", async () => {
    const input = context(), snapshot = before(input.current.workspace);
    const plan = await prepareStudioHybridDccBoundaryChord(input.current, input.request, input.preparation);
    const copied: StudioBoundaryChordPlan = { ...plan };
    expect(() => previewStudioHybridDccBoundaryChord(input.current, copied)).toThrow(expect.objectContaining({ code: "untrusted-plan" }));
    expect(() => commitStudioHybridDccBoundaryChord(input.current, copied)).toThrow(expect.objectContaining({ code: "untrusted-plan" }));
    const request: StudioBoundaryChordWorkspaceRequest = { tool: "boundary-chord", endpoints: [{ ...input.request.endpoints[0] }, input.request.endpoints[1]] };
    input.compute.mockClear();
    await expect(prepareStudioHybridDccBoundaryChord(input.current, request, input.preparation)).rejects.toMatchObject({ code: "untrusted-endpoint" });
    expect(input.compute).not.toHaveBeenCalled(); unchanged(input.current.workspace, snapshot);
  });

  it("준비 전에 session·동일 hash의 새 revision·선택·generation·abort가 바뀌면 계산을 시작하지 않는다", async () => {
    for (const scenario of invalidCases) {
      const input = context(), original = before(input.current.workspace); scenario.change(input);
      const current = input.readCurrent(), snapshot = before(current.workspace);
      await expect(prepareStudioHybridDccBoundaryChord(input.current, input.request, input.preparation), scenario.name).rejects.toMatchObject({ code: scenario.code });
      expect(input.compute, scenario.name).not.toHaveBeenCalled();
      unchanged(input.current.workspace, original); unchanged(current.workspace, snapshot);
    }
  });

  it("실제 계산이 진행 중이어도 session·revision·선택·generation 변경 후 늦은 결과는 계획을 발급하지 않는다", async () => {
    for (const scenario of invalidCases.filter(({ name }) => name !== "abort")) {
      const input = context(), original = before(input.current.workspace), gate = deferred<void>();
      const compute = vi.fn(async (workerInput: StudioBoundaryChordWorkerInput) => { await gate.promise; return actualCompute(workerInput); });
      const pending = prepareStudioHybridDccBoundaryChord(input.current, input.request, { ...input.preparation, compute });
      expect(compute, scenario.name).toHaveBeenCalledTimes(1); scenario.change(input);
      const current = input.readCurrent(), snapshot = before(current.workspace);
      const rejected = expect(pending, scenario.name).rejects.toMatchObject({ code: scenario.code });
      gate.resolve(undefined); await rejected;
      unchanged(input.current.workspace, original); unchanged(current.workspace, snapshot);
    }
  });

  it("발급된 계획도 preview와 commit 시점의 현재 session·revision·선택·generation·취소를 다시 검사한다", async () => {
    for (const scenario of invalidCases) {
      const input = context(), plan = await prepareStudioHybridDccBoundaryChord(input.current, input.request, input.preparation);
      const original = before(input.current.workspace); scenario.change(input);
      const current = input.readCurrent(), snapshot = before(current.workspace);
      expect(() => previewStudioHybridDccBoundaryChord(current, plan), scenario.name).toThrow(expect.objectContaining({ code: scenario.code }));
      expect(() => commitStudioHybridDccBoundaryChord(current, plan), scenario.name).toThrow(expect.objectContaining({ code: scenario.code }));
      unchanged(input.current.workspace, original); unchanged(current.workspace, snapshot);
    }
  });

  it("대기 중 취소의 늦은 실제 결과는 history를 만들지 않고 새 요청의 재시도만 확정할 수 있다", async () => {
    const input = context(), snapshot = before(input.current.workspace), gate = deferred<void>();
    const compute = vi.fn(async (workerInput: StudioBoundaryChordWorkerInput) => { await gate.promise; return actualCompute(workerInput); });
    const pending = prepareStudioHybridDccBoundaryChord(input.current, input.request, { ...input.preparation, compute });
    expect(compute).toHaveBeenCalledTimes(1); input.controller.abort();
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError", code: "aborted" });
    gate.resolve(undefined); await rejected; unchanged(input.current.workspace, snapshot);
    const retryController = new AbortController();
    const plan = await prepareStudioHybridDccBoundaryChord(input.current, input.request, {
      ...input.preparation, generation: 5, signal: retryController.signal, isCurrent: () => true,
    });
    expect(plan.generation).toBe(5);
    const committed = commitStudioHybridDccBoundaryChord(input.current, plan);
    expect(record(committed.workspace).meshHash).toBe(plan.resultMeshHash);
    expect(committed.workspace.session.state.commandCount).toBe(snapshot.commandCount + 1);
    unchanged(input.current.workspace, snapshot);
  });
});
