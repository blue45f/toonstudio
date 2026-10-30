// @vitest-environment jsdom
/** 실제 Three raycast·표시 geometry·surface 대응의 회귀 초안이다. 아직 실행하지 않았다. */
import { DoubleSide, Mesh, MeshBasicMaterial, OrthographicCamera, Raycaster, Vector2, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStudioUnitCubeMesh, hashStudioEditableMesh, serializeStudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { inspectStudioMeshSurfaceForInteractiveProjection } from "../mesh-surface/studio-mesh-surface-interactive";
import { projectStudioMeshSurfaceForRender } from "../mesh-surface/studio-mesh-surface-render";
import { collectStudioHybridDccBoundaryEndpoint } from "./studio-hybrid-dcc-boundary-endpoint";
import {
  createStudioHybridDccComponentSelection, mapStudioHybridDccRayFaceIndex, mutateStudioHybridDccComponentSelection,
  type StudioHybridDccMeshSelectionSource, type StudioHybridDccSelectionOperation,
} from "./studio-hybrid-dcc-component-selection";
import { readStudioMeshFaceLoops } from "./studio-hybrid-dcc-face-modeling-mesh";
import { createStudioHybridDccGeometryResource } from "./studio-hybrid-dcc-geometry-resource";
import { createStudioHybridDccSelectionGate } from "./studio-hybrid-dcc-selection-gate";
import {
  createStudioHybridDccBoundaryOrbitGate, handleStudioHybridDccViewportMeshClick, type StudioHybridDccBoundaryEndpointPick,
  type StudioHybridDccViewportMeshClickEvent, type StudioHybridDccViewportMeshClickPorts,
} from "./studio-hybrid-dcc-viewport-mesh-click";

const disposers: Array<() => void> = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); });

describe("경계선 선택 중 실제 Orbit 이벤트의 기존 선택 gate 연결", () => {
  it("단순 down/up와 비활성 모드는 다음 endpoint 클릭을 억제하지 않는다", () => {
    const suppress = vi.fn(), orbit = createStudioHybridDccBoundaryOrbitGate(suppress);
    orbit.start(true); expect(orbit.allows()).toBe(false); orbit.end();
    expect(orbit.allows()).toBe(true); expect(suppress).not.toHaveBeenCalled();
    orbit.start(false); orbit.change(); orbit.end();
    expect(orbit.allows()).toBe(true); expect(suppress).not.toHaveBeenCalled();
  });
  it("실제 change가 있던 Orbit 종료는 한 번만 기존 gate를 억제하고 해제 뒤 재선택을 허용한다", () => {
    const releases: Array<() => void> = [];
    const selectionGate = createStudioHybridDccSelectionGate((release) => { releases.push(release); return release; }, () => undefined);
    const orbit = createStudioHybridDccBoundaryOrbitGate(() => selectionGate.suppress());
    orbit.start(true); orbit.change(); expect(orbit.allows()).toBe(false);
    orbit.end(); orbit.end();
    expect(orbit.allows()).toBe(true); expect(selectionGate.allows()).toBe(false); expect(releases).toHaveLength(1);
    need(releases[0])(); expect(selectionGate.allows()).toBe(true); selectionGate.dispose();
  });
});
function need<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("실제 메시·raycast fixture의 값이 없습니다."); return value;
}
function fixture() {
  const mesh = createStudioUnitCubeMesh(), source: StudioHybridDccMeshSelectionSource = {
    assetId: "editable-cube", mesh, meshRevision: 11, sourceHash: hashStudioEditableMesh(mesh),
  };
  const inspected = inspectStudioMeshSurfaceForInteractiveProjection(mesh);
  if (!inspected.ok) throw new Error(inspected.message);
  const projection = projectStudioMeshSurfaceForRender(mesh, inspected.value.plan);
  const resource = createStudioHybridDccGeometryResource({ ...projection, normalMode: "flat" });
  const material = new MeshBasicMaterial({ side: DoubleSide }), object = new Mesh(resource.geometry, material);
  disposers.push(() => { resource.dispose(); material.dispose(); });
  const camera = new OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.1, 20);
  camera.position.set(0, 0, 4); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld(); object.updateMatrixWorld(true);
  const face = need(need(readStudioMeshFaceLoops(mesh)).find((loop) => loop.vertexIds.every((id) => need(mesh.vertices[id]).position.z === 0.5)));
  const center = face.vertexIds.reduce((sum, id) => {
    const p = need(mesh.vertices[id]).position; return sum.add(new Vector3(p.x, p.y, p.z));
  }, new Vector3()).multiplyScalar(1 / face.vertexIds.length);
  const eventAt = (point = center, native: MouseEventInit = {}): StudioHybridDccViewportMeshClickEvent => {
    object.updateMatrixWorld(true); camera.updateMatrixWorld();
    const ndc = point.clone().applyMatrix4(object.matrixWorld).project(camera), pointer = new Vector2(ndc.x, ndc.y);
    const raycaster = new Raycaster(); raycaster.setFromCamera(pointer, camera);
    const intersection = need(raycaster.intersectObject(object, false).find((entry) => {
      if (typeof entry.faceIndex !== "number") return false;
      const result = mapStudioHybridDccRayFaceIndex(source, entry.faceIndex); return result.ok && result.value.faceId === face.id;
    }));
    return { faceIndex: intersection.faceIndex, pointer, camera, object: intersection.object,
      nativeEvent: new MouseEvent("click", native), stopPropagation: vi.fn() };
  };
  const onSelect = vi.fn(), onSelectComponent = vi.fn(), onSelectionError = vi.fn();
  const asset = { assetId: source.assetId, mesh: source.mesh, meshHash: source.sourceHash, meshRevision: source.meshRevision };
  const ports: StudioHybridDccViewportMeshClickPorts = {
    asset, selectionMode: "face", editingDisabled: false, sculpting: false, canSelect: () => true,
    viewportSize: { width: 600, height: 600 }, onSelect, onSelectComponent, onSelectionError,
  };
  const selected = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), {
    mode: "face", operation: "replace", ids: [face.id], source,
  });
  if (!selected.ok) throw new Error("실제 선택 권위를 만들지 못했습니다.");
  return { mesh, source, face, center, camera, object, eventAt, ports, asset, onSelect, onSelectComponent, onSelectionError, selection: selected.value };
}

describe("viewport mesh click의 일반 선택·경계 endpoint 분기", () => {
  it("일반 object 선택과 component callback 없는 선택은 기존 자산 선택으로 전달한다", () => {
    const f = fixture(), event = f.eventAt();
    handleStudioHybridDccViewportMeshClick({ ...event, faceIndex: undefined }, { ...f.ports, selectionMode: "object" });
    expect(f.onSelect).toHaveBeenCalledExactlyOnceWith(f.source.assetId); expect(f.onSelectComponent).not.toHaveBeenCalled();
    f.onSelect.mockClear();
    handleStudioHybridDccViewportMeshClick({ ...event, faceIndex: null }, { ...f.ports, onSelectComponent: undefined });
    expect(f.onSelect).toHaveBeenCalledExactlyOnceWith(f.source.assetId); expect(f.onSelectionError).not.toHaveBeenCalled();
  });

  it("실제 face hit의 replace/add/toggle/subtract 수정키 우선순위를 보존한다", () => {
    const f = fixture();
    const scenarios: readonly { readonly native: MouseEventInit; readonly operation: StudioHybridDccSelectionOperation }[] = [
      { native: {}, operation: "replace" }, { native: { shiftKey: true }, operation: "add" },
      { native: { ctrlKey: true }, operation: "toggle" }, { native: { metaKey: true, shiftKey: true }, operation: "toggle" },
      { native: { altKey: true, ctrlKey: true, shiftKey: true }, operation: "subtract" },
    ];
    for (const scenario of scenarios) {
      f.onSelectComponent.mockClear(); const event = f.eventAt(f.center, scenario.native);
      handleStudioHybridDccViewportMeshClick(event, f.ports);
      expect(event.stopPropagation).toHaveBeenCalledTimes(1);
      expect(f.onSelectComponent).toHaveBeenCalledExactlyOnceWith(f.source.assetId, "face", f.face.id, scenario.operation);
    }
    expect(f.onSelect).not.toHaveBeenCalled(); expect(f.onSelectionError).not.toHaveBeenCalled();
  });

  it("vertex/edge는 실제 화면 근접 후보만 선택하고 면 가운데에서 임의 ID를 만들지 않는다", () => {
    const f = fixture(), firstId = need(f.face.vertexIds[0]), position = need(f.mesh.vertices[firstId]).position;
    const vertexPoint = new Vector3(position.x, position.y, position.z).lerp(f.center, 0.001);
    handleStudioHybridDccViewportMeshClick(f.eventAt(vertexPoint), { ...f.ports, selectionMode: "vertex" });
    expect(f.onSelectComponent).toHaveBeenCalledExactlyOnceWith(f.source.assetId, "vertex", firstId, "replace");
    f.onSelectComponent.mockClear();
    const edge = need(f.mesh.halfEdges[need(f.face.halfEdgeIds[0])]);
    const originId = need(f.mesh.halfEdges[edge.prev]).vertex, a = need(f.mesh.vertices[originId]).position, b = need(f.mesh.vertices[edge.vertex]).position;
    const point = new Vector3(a.x, a.y, a.z).lerp(new Vector3(b.x, b.y, b.z), 0.4).lerp(f.center, 0.001);
    const event = f.eventAt(point), mapping = mapStudioHybridDccRayFaceIndex(f.source, need(event.faceIndex));
    if (!mapping.ok) throw new Error("실제 edge 후보가 없습니다.");
    const candidate = need(mapping.value.edgeCandidates.find(({ vertexIds }) => vertexIds.includes(originId) && vertexIds.includes(edge.vertex)));
    handleStudioHybridDccViewportMeshClick(event, { ...f.ports, selectionMode: "edge" });
    expect(f.onSelectComponent).toHaveBeenCalledExactlyOnceWith(f.source.assetId, "edge", candidate.id, "replace");
    f.onSelectComponent.mockClear();
    for (const selectionMode of ["vertex", "edge"] satisfies readonly ("vertex" | "edge")[]) {
      handleStudioHybridDccViewportMeshClick(f.eventAt(), { ...f.ports, selectionMode });
    }
    expect(f.onSelectComponent).not.toHaveBeenCalled(); expect(f.onSelect).not.toHaveBeenCalled(); expect(f.onSelectionError).toHaveBeenCalledTimes(2);
  });

  it("일반 component 선택의 잘못된 faceIndex·실제 mapping 실패는 기존 자산 선택과 오류를 보존한다", () => {
    const f = fixture(), event = f.eventAt();
    const invalidEvents = [{ ...event, faceIndex: undefined }, { ...event, faceIndex: -1 },
      { ...event, faceIndex: f.mesh.halfEdges.length }];
    for (const input of invalidEvents) handleStudioHybridDccViewportMeshClick(input, f.ports);
    handleStudioHybridDccViewportMeshClick(event, { ...f.ports, asset: { ...f.asset, meshHash: "stale-source" } });
    expect(f.onSelect).toHaveBeenCalledTimes(4); expect(f.onSelectionError).toHaveBeenCalledTimes(4); expect(f.onSelectComponent).not.toHaveBeenCalled();
  });

  it("편집 잠금·조형·실제 drag gate는 mapping의 원본 읽기와 chord/일반 callback보다 먼저 거부한다", () => {
    const f = fixture(), event = f.eventAt(); let sourceReads = 0;
    const asset = { ...f.asset, get mesh() { sourceReads++; return f.mesh; } };
    const callbacks = new Set<() => void>();
    const gate = createStudioHybridDccSelectionGate((release) => { callbacks.add(release); return release; }, (release) => { callbacks.delete(release); });
    const onBoundaryEndpointPick = vi.fn(() => true); gate.suppress();
    const blocked: readonly Partial<StudioHybridDccViewportMeshClickPorts>[] = [
      { editingDisabled: true }, { sculpting: true }, { canSelect: () => gate.allows() },
    ];
    for (const state of blocked) handleStudioHybridDccViewportMeshClick(event, { ...f.ports, ...state, asset, onBoundaryEndpointPick });
    expect(sourceReads).toBe(0); expect(onBoundaryEndpointPick).not.toHaveBeenCalled();
    expect(f.onSelect).not.toHaveBeenCalled(); expect(f.onSelectComponent).not.toHaveBeenCalled(); expect(f.onSelectionError).not.toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalledTimes(blocked.length); gate.dispose(); expect(callbacks.size).toBe(0);
  });

  it("chord는 실제 ray hit의 asset/hash/revision과 실제 CSS 투영을 전달해 opaque endpoint를 발급한다", () => {
    const f = fixture(), edge = need(f.mesh.halfEdges[need(f.face.halfEdgeIds[0])]);
    const a = need(f.mesh.vertices[need(f.mesh.halfEdges[edge.prev]).vertex]).position, b = need(f.mesh.vertices[edge.vertex]).position;
    const event = f.eventAt(new Vector3(a.x, a.y, a.z).lerp(new Vector3(b.x, b.y, b.z), 0.25));
    const before = { mesh: serializeStudioEditableMesh(f.mesh), pointer: event.pointer.toArray(), world: f.object.matrixWorld.toArray(),
      view: f.camera.matrixWorldInverse.toArray(), projection: f.camera.projectionMatrix.toArray() };
    const picks: StudioHybridDccBoundaryEndpointPick[] = [];
    const onBoundaryEndpointPick = vi.fn((pick: StudioHybridDccBoundaryEndpointPick) => {
      picks.push(pick);
      const lease = collectStudioHybridDccBoundaryEndpoint(f.source, f.selection, pick.hit, "edge", pick.projection);
      expect(lease.ok).toBe(true); if (!lease.ok) throw new Error(lease.messageKo);
      expect(lease.value.anchor.kind).toBe("edge");
      if (lease.value.anchor.kind !== "edge") throw new Error("실제 edge endpoint가 아닙니다.");
      expect(lease.value.anchor.halfEdgeId).toBe(edge.id); expect(lease.value.anchor.t).toBeCloseTo(0.25, 14);
      return true;
    });
    handleStudioHybridDccViewportMeshClick(event, { ...f.ports, selectionMode: "object", onSelectComponent: undefined, onBoundaryEndpointPick });
    expect(onBoundaryEndpointPick).toHaveBeenCalledTimes(1); const pick = need(picks[0]);
    expect(pick.assetId).toBe(f.source.assetId); expect(pick.hit.faceIndex).toBe(event.faceIndex); expect(pick.hit.faceId).toBe(f.face.id);
    expect(pick.hit.provenance).toEqual({ assetId: f.source.assetId, meshRevision: f.source.meshRevision, sourceHash: f.source.sourceHash });
    expect(pick.projection.pointerNdc).toBe(event.pointer); expect(pick.projection.camera).toBe(f.camera);
    expect(pick.projection.matrixWorld).toBe(f.object.matrixWorld); expect(pick.projection.viewportSize).toBe(f.ports.viewportSize);
    expect(f.onSelect).not.toHaveBeenCalled(); expect(f.onSelectComponent).not.toHaveBeenCalled();
    expect({ mesh: serializeStudioEditableMesh(f.mesh), pointer: event.pointer.toArray(), world: f.object.matrixWorld.toArray(),
      view: f.camera.matrixWorldInverse.toArray(), projection: f.camera.projectionMatrix.toArray() }).toEqual(before);
  });

  it("다른 자산의 실제 hit를 chord callback이 거부해도 일반 선택으로 내려가지 않는다", () => {
    const f = fixture(), picks: StudioHybridDccBoundaryEndpointPick[] = [];
    const onBoundaryEndpointPick = vi.fn((pick: StudioHybridDccBoundaryEndpointPick) => { picks.push(pick); return pick.assetId === f.source.assetId; });
    handleStudioHybridDccViewportMeshClick(f.eventAt(), { ...f.ports, asset: { ...f.asset, assetId: "other-editable-cube" }, onBoundaryEndpointPick });
    expect(onBoundaryEndpointPick).toHaveBeenCalledTimes(1); expect(need(picks[0]).hit.provenance.assetId).toBe("other-editable-cube");
    expect(f.onSelect).not.toHaveBeenCalled(); expect(f.onSelectComponent).not.toHaveBeenCalled(); expect(f.onSelectionError).not.toHaveBeenCalled();
    expect(f.selection.objectIds).toEqual([f.source.assetId]); expect(f.selection.elementIds).toEqual([f.face.id]);
  });

  it("chord의 잘못된 faceIndex·실제 mapping/hash 실패는 callback과 일반 선택을 모두 차단한다", () => {
    const f = fixture(), event = f.eventAt(), onBoundaryEndpointPick = vi.fn(() => false);
    for (const faceIndex of [null, undefined, -1, f.mesh.halfEdges.length]) {
      handleStudioHybridDccViewportMeshClick({ ...event, faceIndex }, { ...f.ports, onBoundaryEndpointPick });
    }
    handleStudioHybridDccViewportMeshClick(event, { ...f.ports, asset: { ...f.asset, meshHash: "stale-source" }, onBoundaryEndpointPick });
    expect(onBoundaryEndpointPick).not.toHaveBeenCalled(); expect(f.onSelect).not.toHaveBeenCalled(); expect(f.onSelectComponent).not.toHaveBeenCalled();
    expect(f.onSelectionError).toHaveBeenCalledTimes(5);
  });
});
