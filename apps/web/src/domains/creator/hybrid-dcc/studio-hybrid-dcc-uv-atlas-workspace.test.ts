import { describe, expect, it } from "vitest";

import { serializeStudioCommandJournal } from "../studio-command-journal";
import { createStudioEditableMeshFromPolygons, serializeStudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { buildStudioXAtlasUvArtifact } from "../xatlas-uv/studio-xatlas-uv-provider-output";
import {
  STUDIO_XATLAS_UV_PROVIDER_LIMITS,
  type StudioXAtlasUvArtifact,
  type StudioXAtlasUvCapabilityReceipt,
} from "../xatlas-uv/studio-xatlas-uv-provider";

import { hybridDccRegisterAsset } from "./studio-hybrid-dcc-document";
import { exportStudioHybridDccMeshGlb } from "./studio-hybrid-dcc-glb-export";
import { workspaceUnwrapUvActive } from "./studio-hybrid-dcc-uv-edit";
import {
  assertStudioHybridDccUvAtlasSnapshot,
  prepareStudioHybridDccUvAtlas,
  workspaceApplyUvAtlas,
  type StudioHybridDccUvAtlasSnapshot,
} from "./studio-hybrid-dcc-uv-atlas-workspace";
import {
  createStudioHybridDccWorkspace,
  synchronizeWorkspaceGeometryAuthority,
  workspaceAddUnitCube,
  workspaceRedo,
  workspaceSelectAsset,
  workspaceUndo,
  type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";
import { decodeStudioHybridDccWorkfile, encodeStudioHybridDccWorkfile } from "./studio-hybrid-dcc-workfile";

import type { StudioMeshUvAtlasInteropUvBasis } from "../mesh-uv/studio-mesh-uv-atlas-interop";

function at<T>(values: ArrayLike<T>, index: number): T {
  const value = values[index];
  if (value === undefined) throw new Error(`검증 배열의 ${index} 항목이 없습니다.`);
  return value;
}

function source(withUv = true, withDetails = false): StudioHybridDccWorkspace {
  const empty = createStudioHybridDccWorkspace("uv-atlas-workspace");
  const plain = createStudioEditableMeshFromPolygons([
    { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },
    { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 },
  ], [[0, 1, 2, 3]]);
  const mesh = withDetails ? {
    ...plain,
    vertices: plain.vertices.map((vertex) => ({ ...vertex, crease: 0.375 })),
    halfEdges: plain.halfEdges.map((edge) => ({ ...edge, crease: 0.25 })),
    faces: plain.faces.map((face) => ({ ...face, smooth: true })),
  } : plain;
  const workspace = synchronizeWorkspaceGeometryAuthority({ ...empty, activeAssetId: "mesh" }, hybridDccRegisterAsset(empty.session, "mesh", mesh, {
    source: "primitive", creator: "studio", license: "CC0-1.0", useScope: "commercial", derivative: "original",
  }));
  return withUv ? workspaceUnwrapUvActive(workspace, "planar-xy") : workspace;
}

function record(workspace: StudioHybridDccWorkspace) {
  const result = workspace.session.state.geometry.records.mesh;
  if (!result) throw new Error("검증할 정본 mesh가 없습니다.");
  return result;
}

const FIXTURE_RECEIPT: StudioXAtlasUvCapabilityReceipt = {
  packageName: "xatlasjs", packageVersion: "workspace-adapter-fixture", runtimeSource: "injected",
  intendedHost: "dedicated-worker", executionTopology: "single-dedicated-worker", rendererNeutral: true,
  defensiveInputCopy: true, defensiveOutputCopy: true, originalInputPreserved: true,
  nativeHandlesReturned: false, mainThreadFallback: false, atlasCleanup: "direct-destroyAtlas-finally",
  geometryCleanup: "release-typed-array-snapshots", wasmCleanup: "dedicated-worker-termination",
};

/** 수치 fixture만 제공하며 실제 출력 조립기를 사용한다. WASM 실행이나 축 검증을 뜻하지 않는다. */
function artifactFor(snapshot: StudioHybridDccUvAtlasSnapshot): StudioXAtlasUvArtifact {
  const prepared = snapshot.prepared;
  const count = prepared.positions.length / 3;
  const corners = [
    { u: 0.125, v: 0.25 }, { u: 0.875, v: 0.25 },
    { u: 0.875, v: 0.75 }, { u: 0.125, v: 0.75 },
  ];
  const uv = new Float32Array(count * 2);
  const originalInputVertexIndices = new Uint32Array(count);
  for (let index = 0; index < count; index += 1) {
    const point = at(corners, index % corners.length);
    uv[index * 2] = point.u;
    uv[index * 2 + 1] = point.v;
    originalInputVertexIndices[index] = index;
  }
  return buildStudioXAtlasUvArtifact({
    width: 64, height: 64, atlasCount: 1, meshCount: 1, texelsPerUnit: 16,
    meshes: [{
      id: snapshot.assetId, positions: prepared.positions.slice(), indices: prepared.indices.slice(), uv,
      originalInputVertexIndices, atlasSegments: [{ index: 0, count: prepared.indices.length, atlasIndex: 0 }],
    }],
  }, [{ id: snapshot.assetId, positions: prepared.positions, sourceVertexCount: count }], STUDIO_XATLAS_UV_PROVIDER_LIMITS,
  FIXTURE_RECEIPT, 2, (reason, detail) => { throw new Error(`${reason}: ${detail}`); });
}

function copyArtifact(artifact: StudioXAtlasUvArtifact): StudioXAtlasUvArtifact {
  return {
    ...artifact, positions: artifact.positions.slice(), uv: artifact.uv.slice(), indices: artifact.indices.slice(),
    originalInputVertexIndices: artifact.originalInputVertexIndices.slice(),
    meshes: artifact.meshes.map((range) => ({ ...range, atlasSegments: range.atlasSegments.map((segment) => ({ ...segment })) })),
    atlas: { ...artifact.atlas }, receipt: { ...artifact.receipt },
  };
}

function expectRejected(
  workspace: StudioHybridDccWorkspace,
  snapshot: StudioHybridDccUvAtlasSnapshot,
  artifact: StudioXAtlasUvArtifact,
  basis: StudioMeshUvAtlasInteropUvBasis = "v-up",
) {
  const state = workspace.session.state;
  const undo = workspace.session.undoStack;
  const redo = workspace.session.redoStack;
  const bridge = workspace.bridge;
  const mesh = serializeStudioEditableMesh(record(workspace).mesh);
  const journal = serializeStudioCommandJournal(workspace.session.journal);
  expect(() => workspaceApplyUvAtlas(workspace, snapshot, artifact, basis)).toThrow();
  expect(workspace.session.state).toBe(state);
  expect(workspace.session.undoStack).toBe(undo);
  expect(workspace.session.redoStack).toBe(redo);
  expect(workspace.bridge).toBe(bridge);
  expect(serializeStudioEditableMesh(record(workspace).mesh)).toEqual(mesh);
  expect(serializeStudioCommandJournal(workspace.session.journal)).toBe(journal);
}

function glb(workspace: StudioHybridDccWorkspace): Uint8Array {
  const current = record(workspace);
  const result = exportStudioHybridDccMeshGlb({ mesh: current.mesh, sourceHash: current.meshHash,
    sourceRevision: current.revision, assetId: current.assetId });
  if (!result.ok) throw new Error(JSON.stringify(result.report));
  return result.bytes;
}

function property(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) throw new Error(`GLB ${key}의 상위 객체가 없습니다.`);
  return Reflect.get(value, key);
}

function item(value: unknown, index: number): unknown {
  if (!Array.isArray(value)) throw new Error("GLB 배열이 없습니다.");
  return at(value, index);
}

function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("GLB 인덱스가 올바르지 않습니다.");
  return value;
}

function stream(bytes: Uint8Array, attribute: "POSITION" | "NORMAL" | "TEXCOORD_0"): readonly number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json: unknown = JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + jsonLength)));
  const primitive = item(property(item(property(json, "meshes"), 0), "primitives"), 0);
  const accessorId = integer(property(property(primitive, "attributes"), attribute));
  const accessor = item(property(json, "accessors"), accessorId);
  const count = integer(property(accessor, "count"));
  const buffer = item(property(json, "bufferViews"), integer(property(accessor, "bufferView")));
  if (property(accessor, "componentType") !== 5126) throw new Error("GLB 검증 속성이 Float32가 아닙니다.");
  const dimension = attribute === "TEXCOORD_0" ? 2 : 3;
  if (property(accessor, "type") !== `VEC${dimension}`) throw new Error("GLB 검증 속성의 차원이 다릅니다.");
  const offset = 20 + jsonLength + 8 + integer(property(buffer, "byteOffset") ?? 0)
    + integer(property(accessor, "byteOffset") ?? 0);
  return Array.from({ length: count * dimension }, (_, index) => view.getFloat32(offset + index * 4, true));
}

describe("자동 atlas와 실제 작업공간의 정본 연결", () => {
  it("발행 직전 snapshot 확인은 명령을 만들지 않고 같은 원본만 허용한다", () => {
    const original = source();
    const snapshot = prepareStudioHybridDccUvAtlas(original);
    const journal = serializeStudioCommandJournal(original.session.journal);
    const state = original.session.state;
    const undo = original.session.undoStack;
    expect(assertStudioHybridDccUvAtlasSnapshot(original, snapshot)).toBeUndefined();
    expect(original.session.state).toBe(state);
    expect(original.session.undoStack).toBe(undo);
    expect(serializeStudioCommandJournal(original.session.journal)).toBe(journal);
    const changed = workspaceUnwrapUvActive(original, "planar-xz");
    const changedJournal = serializeStudioCommandJournal(changed.session.journal);
    const changedState = changed.session.state;
    expect(() => assertStudioHybridDccUvAtlasSnapshot(changed, snapshot)).toThrow(/원본이 바뀌었습니다/u);
    expect(changed.session.state).toBe(changedState);
    expect(serializeStudioCommandJournal(changed.session.journal)).toBe(changedJournal);
    expect(serializeStudioCommandJournal(original.session.journal)).toBe(journal);
  });

  it("준비 정보는 동결하며 원본 mesh·history·준비 배열을 발행하거나 detach하지 않는다", () => {
    const original = source();
    const mesh = serializeStudioEditableMesh(record(original).mesh);
    const journal = serializeStudioCommandJournal(original.session.journal);
    const snapshot = prepareStudioHybridDccUvAtlas(original);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.prepared)).toBe(true);
    expect(snapshot).toMatchObject({ documentId: original.session.state.documentId, assetId: "mesh",
      sourceStateHash: original.session.state.stateHash, sourceRevision: record(original).revision,
      sourceMeshHash: record(original).meshHash });
    expect(snapshot.prepared.positions.byteLength).toBeGreaterThan(0);
    expect(serializeStudioEditableMesh(record(original).mesh)).toEqual(mesh);
    expect(serializeStudioCommandJournal(original.session.journal)).toBe(journal);
  });

  it("UV만 바꾸는 geometry.commit 한 개로 확정하고 원본·법선 속성·crease·이력을 보존한다", () => {
    const original = source(true, true);
    const before = record(original);
    const serialized = serializeStudioEditableMesh(before.mesh);
    const journal = serializeStudioCommandJournal(original.session.journal);
    const snapshot = prepareStudioHybridDccUvAtlas(original);
    const positions = snapshot.prepared.positions.slice();
    const indices = snapshot.prepared.indices.slice();
    const artifact = artifactFor(snapshot);
    const applied = workspaceApplyUvAtlas(original, snapshot, artifact, "v-up");
    const after = record(applied);
    expect(after.mesh.uvLayer).not.toEqual(before.mesh.uvLayer);
    expect(after.mesh.vertices).toBe(before.mesh.vertices);
    expect(after.mesh.halfEdges).toBe(before.mesh.halfEdges);
    expect(after.mesh.faces).toBe(before.mesh.faces);
    expect({ ...serializeStudioEditableMesh(after.mesh), uvLayer: serialized.uvLayer }).toEqual(serialized);
    expect(applied.session.state.objectTransforms).toBe(original.session.state.objectTransforms);
    expect(applied.lastUvMap).toBe(original.lastUvMap);
    expect(applied.session.state.commandCount).toBe(original.session.state.commandCount + 1);
    expect(applied.session.journal.length).toBe(original.session.journal.length + 1);
    const last = applied.session.journal.records.at(-1);
    if (!last || last.recordType !== "command") throw new Error("단일 정본 명령이 기록되지 않았습니다.");
    expect(last.command.kind).toBe("geometry.commit");
    expect(applied.session.undoStack).toHaveLength(original.session.undoStack.length + 1);
    expect(workspaceUndo(applied).session.state.stateHash).toBe(original.session.state.stateHash);
    expect(workspaceRedo(workspaceUndo(applied)).session.state.stateHash).toBe(applied.session.state.stateHash);
    expect(serializeStudioEditableMesh(before.mesh)).toEqual(serialized);
    expect(serializeStudioCommandJournal(original.session.journal)).toBe(journal);
    expect(snapshot.prepared.positions).toEqual(positions);
    expect(snapshot.prepared.indices).toEqual(indices);
  });

  it("새 원본으로 확인한 같은 UV 결과는 workspace·journal·Undo를 그대로 돌려주는 no-op이다", () => {
    const original = source();
    const snapshot = prepareStudioHybridDccUvAtlas(original);
    const artifact = artifactFor(snapshot);
    const applied = workspaceApplyUvAtlas(original, snapshot, artifact, "v-up");
    expectRejected(applied, snapshot, artifact);
    const current = prepareStudioHybridDccUvAtlas(applied);
    const journal = serializeStudioCommandJournal(applied.session.journal);
    expect(workspaceApplyUvAtlas(applied, current, artifact, "v-up")).toBe(applied);
    expect(serializeStudioCommandJournal(applied.session.journal)).toBe(journal);
  });

  const bases: readonly StudioMeshUvAtlasInteropUvBasis[] = ["v-up", "v-down"];
  it.each(bases)("명시한 %s만 canonical 좌표로 변환하고 UV가 없는 원본에도 적용한다", (basis) => {
    const original = source(false);
    const snapshot = prepareStudioHybridDccUvAtlas(original);
    const applied = workspaceApplyUvAtlas(original, snapshot, artifactFor(snapshot), basis);
    const layer = record(applied).mesh.uvLayer;
    if (!layer) throw new Error("자동 UV 레이어가 없습니다.");
    const inputById = new Map<number, number>();
    snapshot.prepared.inputSourceVertexIds.forEach((id, index) => inputById.set(id, index));
    const artifact = artifactFor(snapshot);
    for (const corner of layer.corners) {
      const edge = at(record(original).mesh.halfEdges, corner.halfEdgeId);
      const origin = at(record(original).mesh.halfEdges, edge.prev).vertex;
      const index = inputById.get(origin);
      if (index === undefined) throw new Error("원본 UV 대응이 없습니다.");
      const v = at(artifact.uv, index * 2 + 1);
      expect(corner.u).toBe(at(artifact.uv, index * 2));
      expect(corner.v).toBe(basis === "v-down" ? Math.fround(1 - v) : v);
    }
  });

  it("다른 문서로 저장·재열기해 UV와 Undo/Redo를 복원하며 GLB 위치·법선은 보존한다", () => {
    const original = source();
    const snapshot = prepareStudioHybridDccUvAtlas(original);
    const applied = workspaceApplyUvAtlas(original, snapshot, artifactFor(snapshot), "v-down");
    const reopened = decodeStudioHybridDccWorkfile(encodeStudioHybridDccWorkfile(applied), { documentId: "atlas-reopened" });
    expect(reopened.session.state.documentId).toBe("atlas-reopened");
    expect(record(reopened).mesh.uvLayer).toEqual(record(applied).mesh.uvLayer);
    expect(record(workspaceUndo(reopened)).mesh.uvLayer).toEqual(record(original).mesh.uvLayer);
    expect(record(workspaceRedo(workspaceUndo(reopened))).mesh.uvLayer).toEqual(record(applied).mesh.uvLayer);
    const before = glb(original);
    const after = glb(reopened);
    expect(stream(after, "POSITION")).toEqual(stream(before, "POSITION"));
    expect(stream(after, "NORMAL")).toEqual(stream(before, "NORMAL"));
    expect(stream(after, "TEXCOORD_0")).not.toEqual(stream(before, "TEXCOORD_0"));
    expect(glb(applied)).toEqual(after);
  });

  it("계산 중 문서·선택·state hash·record revision·source hash가 바뀌면 원본과 이력을 보존한다", () => {
    const original = workspaceSelectAsset(workspaceAddUnitCube(source(), "other"), "mesh");
    const snapshot = prepareStudioHybridDccUvAtlas(original);
    const artifact = artifactFor(snapshot);
    const state = original.session.state;
    const otherDocument = { ...original, session: { ...original.session, state: { ...state, documentId: "another-document" } } };
    const otherState = { ...original, session: { ...original.session, state: { ...state, stateHash: "changed-state" } } };
    const otherRevision = { ...original, session: { ...original.session, state: { ...state,
      geometry: { ...state.geometry, records: { ...state.geometry.records, mesh: { ...record(original), revision: record(original).revision + 1 } } },
    } } };
    expectRejected(otherDocument, snapshot, artifact);
    expectRejected(workspaceSelectAsset(original, "other"), snapshot, artifact);
    expectRejected(otherState, snapshot, artifact);
    expectRejected(otherRevision, snapshot, artifact);
    expectRejected(original, { ...snapshot, sourceMeshHash: "changed-mesh" }, artifact);
  });

  it("계산 중 실제 UV 편집 명령이 먼저 확정되면 그 새 이력을 덮어쓰지 않는다", () => {
    const original = source();
    const snapshot = prepareStudioHybridDccUvAtlas(original);
    const artifact = artifactFor(snapshot);
    const changed = workspaceUnwrapUvActive(original, "planar-xz");
    expect(changed.session.state.stateHash).not.toBe(original.session.state.stateHash);
    expect(record(changed).meshHash).not.toBe(snapshot.sourceMeshHash);
    expectRejected(changed, snapshot, artifact);
  });

  it("선택이 없거나 저장된 원본 hash가 거짓이면 준비하지 않는다", () => {
    expect(() => prepareStudioHybridDccUvAtlas(createStudioHybridDccWorkspace("empty-atlas"))).toThrow(/오브젝트/u);
    const original = source();
    const state = original.session.state;
    const corrupt = { ...original, session: { ...original.session, state: { ...state,
      geometry: { ...state.geometry, records: { ...state.geometry.records, mesh: { ...record(original), meshHash: "stale" } } },
    } } };
    expect(() => prepareStudioHybridDccUvAtlas(corrupt)).toThrow(/정본 해시/u);
  });

  it("준비 배열이 바뀌면 같은 메시에 대해서도 결과를 적용하지 않는다", () => {
    const original = source();
    const snapshot = prepareStudioHybridDccUvAtlas(original);
    const artifact = artifactFor(snapshot);
    snapshot.prepared.positions[0] = at(snapshot.prepared.positions, 0) + 0.25;
    expectRejected(original, snapshot, artifact);
  });

  const invalidOutputs: readonly string[] = ["mapping", "position", "winding", "page", "asset"];
  it.each(invalidOutputs)("%s 결과 오류는 원본 mesh·명령·Undo를 바꾸지 않는다", (kind) => {
    const original = source();
    const snapshot = prepareStudioHybridDccUvAtlas(original);
    const artifact = copyArtifact(artifactFor(snapshot));
    let invalid = artifact;
    if (kind === "mapping") artifact.originalInputVertexIndices[0] = snapshot.prepared.positions.length / 3;
    else if (kind === "position") artifact.positions[0] = at(artifact.positions, 0) + 0.25;
    else if (kind === "winding") {
      const first = at(artifact.indices, 0);
      artifact.indices[0] = at(artifact.indices, 1);
      artifact.indices[1] = first;
    } else if (kind === "page") invalid = { ...artifact, atlas: { ...artifact.atlas, count: 2 } };
    else invalid = { ...artifact, meshes: artifact.meshes.map((range) => ({ ...range, id: "wrong-asset" })) };
    expectRejected(original, snapshot, invalid);
  });

  it("V축 인수를 생략하거나 알 수 없는 축을 전달해도 기본값으로 적용하지 않는다", () => {
    const original = source();
    const snapshot = prepareStudioHybridDccUvAtlas(original);
    const artifact = artifactFor(snapshot);
    const journal = serializeStudioCommandJournal(original.session.journal);
    expect(() => Reflect.apply(workspaceApplyUvAtlas, undefined, [original, snapshot, artifact])).toThrow(/V축/u);
    expect(() => Reflect.apply(workspaceApplyUvAtlas, undefined, [original, snapshot, artifact, "unknown"])).toThrow(/V축/u);
    expect(serializeStudioCommandJournal(original.session.journal)).toBe(journal);
  });
});
