/** 미실행 결합 초안: 실제 provider.execute와 injected Runtime을 사용하며 WASM의 UV 축은 판정하지 않는다. */
import { describe, expect, it } from "vitest";

import {
  createStudioEditableMeshFromPolygons,
  createStudioUnitCubeMesh,
  hashStudioEditableMesh,
  serializeStudioEditableMesh,
  validateStudioEditableMeshSerializableAuthority,
  type StudioEditableMesh,
} from "../studio-editable-half-edge-mesh";
import {
  createStudioXAtlasUvProvider,
  type StudioXAtlasUvArtifact,
  type StudioXAtlasUvRequest,
  type StudioXAtlasUvRuntime,
  type StudioXAtlasUvRuntimeAtlas,
  type StudioXAtlasUvRuntimeGeometry,
  type StudioXAtlasUvRuntimeMeshInput,
  type StudioXAtlasUvRuntimePackOptions,
} from "../xatlas-uv/studio-xatlas-uv-provider";

import { decodeStudioMeshUvLayer, hashStudioMeshUvTopology } from "./studio-mesh-uv-authority";
import {
  prepareStudioMeshUvAtlasProvenance,
  StudioMeshUvAtlasProvenanceError,
  type StudioMeshUvAtlasProvenancePrepared,
} from "./studio-mesh-uv-atlas-provenance";
import {
  applyStudioMeshUvAtlasInteropArtifact,
  createStudioMeshUvAtlasInteropRequest,
  StudioMeshUvAtlasInteropError,
  type StudioMeshUvAtlasInteropOptions,
  type StudioMeshUvAtlasInteropUvBasis,
} from "./studio-mesh-uv-atlas-interop";

function at<T>(values: ArrayLike<T>, index: number): T {
  const value = values[index];
  if (value === undefined) throw new Error(`결합 입력의 ${index} 항목이 없습니다.`);
  return value;
}

function collinearMesh(): StudioEditableMesh {
  return createStudioEditableMeshFromPolygons([
    { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 },
    { x: 2, y: 1, z: 0 }, { x: 0, y: 1, z: 0 },
  ], [[0, 1, 2, 3, 4]]);
}

function withOldUvs(mesh: StudioEditableMesh): StudioEditableMesh {
  return { ...mesh, uvLayer: decodeStudioMeshUvLayer({ revision: 1,
    topologyHash: hashStudioMeshUvTopology(mesh), corners: mesh.halfEdges.map(({ id }) => ({
      halfEdgeId: id, u: id / 64, v: id / 128,
    })) }, mesh) };
}

function fixtureUv(vertex: number) {
  return { u: (vertex % 4 + 1) / 8, v: (vertex + 1) / 16 };
}

class InteropRuntime implements StudioXAtlasUvRuntime {
  readonly packageVersion = "0.2.0-interop-fixture";
  readonly inputs: StudioXAtlasUvRuntimeMeshInput[] = [];
  options: StudioXAtlasUvRuntimePackOptions | undefined;

  initialize(): Promise<void> { return Promise.resolve(); }

  createGeometry(input: StudioXAtlasUvRuntimeMeshInput): StudioXAtlasUvRuntimeGeometry {
    this.inputs.push(input);
    return { id: input.id, release: () => undefined };
  }

  pack(geometries: readonly StudioXAtlasUvRuntimeGeometry[], options: StudioXAtlasUvRuntimePackOptions): Promise<StudioXAtlasUvRuntimeAtlas> {
    if (geometries.length !== this.inputs.length) throw new Error("geometry와 실제 provider 입력 수가 다릅니다.");
    this.options = options;
    return Promise.resolve({ width: 64, height: 64, atlasCount: 1, meshCount: this.inputs.length,
      texelsPerUnit: 16, meshes: this.inputs.map((input, index) => {
        if (at(geometries, index).id !== input.id) throw new Error("geometry 원본 ID가 다릅니다.");
        const count = input.positions.length / 3;
        const uv = new Float32Array(count * 2);
        const originalInputVertexIndices = new Uint32Array(count);
        for (let vertex = 0; vertex < count; vertex += 1) {
          const point = fixtureUv(vertex);
          uv[vertex * 2] = point.u;
          uv[vertex * 2 + 1] = point.v;
          originalInputVertexIndices[vertex] = vertex;
        }
        return { id: input.id, positions: input.positions.slice(), indices: new Uint32Array(input.indices),
          uv, originalInputVertexIndices, atlasSegments: [{ index: 0, count: input.indices.length, atlasIndex: 0 }] };
      }) });
  }

  cleanupAtlas(): Promise<boolean> { return Promise.resolve(true); }
  dispose(): void {}
}

/** Runtime만 대체한다. 입력 검증·사본·atlas 결합은 실제 provider 코드를 통과한다. */
async function produce(request: StudioXAtlasUvRequest) {
  const runtime = new InteropRuntime();
  const provider = createStudioXAtlasUvProvider({ requestEpoch: request.requestEpoch,
    documentEpoch: request.documentEpoch, runtimeLoader: () => runtime });
  try {
    const result = await provider.execute(request);
    if (!result.ok) throw new Error(`실제 provider 결합 실패: ${result.reason}: ${result.detail}`);
    return { artifact: result.artifact, runtime };
  } finally {
    await provider.dispose();
  }
}

function cloneArtifact(artifact: StudioXAtlasUvArtifact): StudioXAtlasUvArtifact {
  return { ...artifact, positions: artifact.positions.slice(), uv: artifact.uv.slice(),
    indices: artifact.indices.slice(), originalInputVertexIndices: artifact.originalInputVertexIndices.slice(),
    meshes: artifact.meshes.map((range) => ({ ...range, atlasSegments: range.atlasSegments.map((segment) => ({ ...segment })) })),
    atlas: { ...artifact.atlas }, receipt: { ...artifact.receipt } };
}

function expectCode(operation: () => unknown, code: string) {
  let failure: unknown;
  try { operation(); } catch (error) { failure = error; }
  if (!(failure instanceof StudioMeshUvAtlasInteropError) && !(failure instanceof StudioMeshUvAtlasProvenanceError)) {
    throw new Error(`예상한 UV 경계 오류를 받지 못했습니다: ${String(failure)}`);
  }
  expect(failure.code).toBe(code);
}

function rejectArtifact(mesh: StudioEditableMesh, prepared: StudioMeshUvAtlasProvenancePrepared,
  artifact: StudioXAtlasUvArtifact, assetId: string, uvBasis: StudioMeshUvAtlasInteropUvBasis, code: string) {
  const before = serializeStudioEditableMesh(mesh);
  const hash = hashStudioEditableMesh(mesh);
  expectCode(() => applyStudioMeshUvAtlasInteropArtifact(mesh, prepared, artifact, assetId, uvBasis), code);
  expect(serializeStudioEditableMesh(mesh)).toEqual(before);
  expect(hashStudioEditableMesh(mesh)).toBe(hash);
}

function expectedCorners(mesh: StudioEditableMesh, prepared: StudioMeshUvAtlasProvenancePrepared,
  basis: StudioMeshUvAtlasInteropUvBasis) {
  const inputById = new Map<number, number>();
  prepared.inputSourceVertexIds.forEach((id, index) => { inputById.set(id, index); });
  return mesh.halfEdges.map((edge) => {
    const origin = at(mesh.halfEdges, edge.prev).vertex;
    const index = inputById.get(origin);
    if (index === undefined) throw new Error("정본 UV 코너의 원본 입력 ID가 없습니다.");
    const uv = fixtureUv(index);
    return { halfEdgeId: edge.id, u: uv.u, v: basis === "v-down" ? Math.fround(1 - uv.v) : uv.v };
  });
}

function preserveMesh(source: StudioEditableMesh, mapped: StudioEditableMesh,
  prepared: StudioMeshUvAtlasProvenancePrepared, basis: StudioMeshUvAtlasInteropUvBasis,
  before: ReturnType<typeof serializeStudioEditableMesh>) {
  expect(mapped.vertices).toBe(source.vertices);
  expect(mapped.halfEdges).toBe(source.halfEdges);
  expect(mapped.faces).toBe(source.faces);
  expect(mapped.revision).toBe(source.revision);
  expect(mapped.nextVertexId).toBe(source.nextVertexId);
  expect(mapped.nextHalfEdgeId).toBe(source.nextHalfEdgeId);
  expect(mapped.nextFaceId).toBe(source.nextFaceId);
  expect(mapped.uvLayer?.corners).toEqual(expectedCorners(source, prepared, basis));
  expect(hashStudioMeshUvTopology(mapped)).toBe(hashStudioMeshUvTopology(source));
  expect(hashStudioEditableMesh(source)).toBe(prepared.sourceHash);
  expect(validateStudioEditableMeshSerializableAuthority(mapped).ok).toBe(true);
  expect(serializeStudioEditableMesh(source)).toEqual(before);
}

async function twoMeshes() {
  const first = prepareStudioMeshUvAtlasProvenance(createStudioUnitCubeMesh());
  const mesh = collinearMesh();
  const prepared = prepareStudioMeshUvAtlasProvenance(mesh);
  const firstRequest = createStudioMeshUvAtlasInteropRequest("background", first, 4, 9);
  const selected = createStudioMeshUvAtlasInteropRequest("prop", prepared, 4, 9);
  const request = { ...selected, meshes: [...firstRequest.meshes, ...selected.meshes] };
  return { mesh, prepared, ...(await produce(request)) };
}

describe("UV provider와 원본 면 코너 사이의 순수 결합", () => {
  it("request에는 정확한 mesh 입력만 노출하고 실제 Runtime까지 정본 정책을 전달한다", async () => {
    const mesh = withOldUvs(createStudioUnitCubeMesh());
    const before = serializeStudioEditableMesh(mesh);
    const prepared = prepareStudioMeshUvAtlasProvenance(mesh);
    const positionsBefore = prepared.positions.slice();
    const indicesBefore = prepared.indices.slice();
    const request = createStudioMeshUvAtlasInteropRequest("asset", prepared, 4, 9, {
      resolution: 512, padding: 4, rotateCharts: false, texelsPerUnit: 16, chart: { maxCost: 2 },
    });
    expect(Object.keys(request).sort()).toEqual(["documentEpoch", "meshes", "operation", "options", "requestEpoch"]);
    expect(request).toMatchObject({ operation: "unwrap-atlas", requestEpoch: 4, documentEpoch: 9 });
    const input = at(request.meshes, 0);
    expect(Object.keys(input).sort()).toEqual(["id", "indices", "positions"]);
    expect(input.id).toBe("asset");
    expect(input.positions).toBe(prepared.positions);
    expect(input.indices).toBe(prepared.indices);
    expect(request.options).toMatchObject({ useNormals: false, chart: { fixWinding: false, useInputMeshUvs: false, maxCost: 2 } });
    const { artifact, runtime } = await produce(request);
    expect(runtime.options).toMatchObject({ useNormals: false,
      pack: { resolution: 512, padding: 4, rotateCharts: false, texelsPerUnit: 16 },
      chart: { fixWinding: false, useInputMeshUvs: false, maxCost: 2 } });
    expect(at(runtime.inputs, 0).normals).toBeNull();
    expect(at(runtime.inputs, 0).uv).toBeNull();
    expect(at(runtime.inputs, 0).positions).not.toBe(prepared.positions);
    expect(prepared.positions).toEqual(positionsBefore);
    expect(prepared.indices).toEqual(indicesBefore);
    expect(prepared.positions.byteLength).toBeGreaterThan(0);
    const mapped = applyStudioMeshUvAtlasInteropArtifact(mesh, prepared, artifact, "asset", "v-up");
    preserveMesh(mesh, mapped, prepared, "v-up", before);
  });

  const uvBases: readonly StudioMeshUvAtlasInteropUvBasis[] = ["v-up", "v-down"];
  it.each(uvBases)("명시한 %s fixture UV만 변환해 실제 provider 결과를 canonical 코너에 적용한다", async (basis) => {
    const mesh = collinearMesh();
    const before = serializeStudioEditableMesh(mesh);
    const prepared = prepareStudioMeshUvAtlasProvenance(mesh);
    const request = createStudioMeshUvAtlasInteropRequest("asset", prepared, 4, 9);
    const { artifact } = await produce(request);
    const uvBefore = artifact.uv.slice();
    const mapped = applyStudioMeshUvAtlasInteropArtifact(mesh, prepared, artifact, "asset", basis);
    preserveMesh(mesh, mapped, prepared, basis, before);
    expect(mapped.faces).toHaveLength(1);
    expect(mapped.uvLayer?.corners).toHaveLength(5);
    expect(artifact.uv).toEqual(uvBefore);
    expect(mesh.uvLayer).toBeUndefined();
  });

  it("두 번째 range의 global indices만 local로 바꾸고 map의 source-local 값은 유지한다", async () => {
    const { mesh, prepared, artifact } = await twoMeshes();
    const before = serializeStudioEditableMesh(mesh);
    const range = at(artifact.meshes, 1);
    expect(range).toMatchObject({ id: "prop", vertexOffset: 8, indexOffset: 36, vertexCount: 5, indexCount: 9 });
    expect(Array.from(artifact.originalInputVertexIndices.slice(range.vertexOffset))).toEqual([0, 1, 2, 3, 4]);
    expect(Array.from(artifact.indices.slice(range.indexOffset))).toEqual(Array.from(prepared.indices, (index) => index + 8));
    const indicesBefore = artifact.indices.slice();
    const mapBefore = artifact.originalInputVertexIndices.slice();
    const mapped = applyStudioMeshUvAtlasInteropArtifact(mesh, prepared, artifact, "prop", "v-up");
    preserveMesh(mesh, mapped, prepared, "v-up", before);
    expect(artifact.indices).toEqual(indicesBefore);
    expect(artifact.originalInputVertexIndices).toEqual(mapBefore);
  });

  it.each(["useNormals", "fixWinding", "useInputMeshUvs"])("%s 정책 override를 provider 실행 전에 거절한다", (field) => {
    const prepared = prepareStudioMeshUvAtlasProvenance(createStudioUnitCubeMesh());
    const options: StudioMeshUvAtlasInteropOptions = field === "useNormals" ? {} : { chart: {} };
    if (field === "useNormals") Object.defineProperty(options, field, { value: true, enumerable: true });
    else {
      const chart = options.chart;
      if (!chart) throw new Error("정책 override chart fixture가 없습니다.");
      Object.defineProperty(chart, field, { value: true, enumerable: true });
    }
    expectCode(() => createStudioMeshUvAtlasInteropRequest("asset", prepared, 4, 9, options), "policy-override");
  });

  it.each(["", " ", " asset", "asset ", "x".repeat(129)])("범위를 벗어난 assetId %s로 request를 만들지 않는다", (assetId) => {
    const prepared = prepareStudioMeshUvAtlasProvenance(createStudioUnitCubeMesh());
    expectCode(() => createStudioMeshUvAtlasInteropRequest(assetId, prepared, 4, 9), "invalid-request");
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("유효하지 않은 epoch %s를 request·document 양쪽에서 거절한다", (epoch) => {
    const prepared = prepareStudioMeshUvAtlasProvenance(createStudioUnitCubeMesh());
    expectCode(() => createStudioMeshUvAtlasInteropRequest("asset", prepared, epoch, 9), "invalid-request");
    expectCode(() => createStudioMeshUvAtlasInteropRequest("asset", prepared, 4, epoch), "invalid-request");
  });

  it.each(["duplicate-id", "missing-id", "cross-mesh-index", "cross-mesh-map", "source-count",
    "offset-gap", "overlap-index", "partial-coverage", "foreign-triangle", "wrong-position", "atlas-page",
    "nan-uv", "infinite-uv", "out-of-unit-uv", "old-version", "missing-map", "wrong-map-type", "shared-map"])(
    "실제 provider 결과를 %s로 변조하면 정본을 부분 변경하지 않는다", async (kind) => {
      const { mesh, prepared, artifact: original } = await twoMeshes();
      let artifact = cloneArtifact(original);
      const selected = at(artifact.meshes, 1);
      let assetId = "prop";
      let code = "mesh-range-invalid";
      if (kind === "duplicate-id") {
        artifact = { ...artifact, meshes: artifact.meshes.map((range, index) => index === 1
          ? { ...range, id: at(artifact.meshes, 0).id } : range) };
        code = "mesh-id-ambiguous";
      }
      if (kind === "missing-id") assetId = "missing";
      if (kind === "cross-mesh-index") artifact.indices[selected.indexOffset] = 0;
      if (kind === "cross-mesh-map") artifact.originalInputVertexIndices[selected.vertexOffset] = selected.vertexOffset;
      if (kind === "source-count") artifact = { ...artifact, meshes: artifact.meshes.map((range, index) => index === 1
        ? { ...range, sourceVertexCount: range.sourceVertexCount + 1 } : range) };
      if (kind === "offset-gap") artifact = { ...artifact, meshes: artifact.meshes.map((range, index) => index === 1
        ? { ...range, vertexOffset: range.vertexOffset + 1 } : range) };
      if (kind === "overlap-index") artifact = { ...artifact, meshes: artifact.meshes.map((range, index) => index === 1
        ? { ...range, indexOffset: range.indexOffset - 3 } : range) };
      if (kind === "partial-coverage") artifact = { ...artifact, meshes: artifact.meshes.map((range, index) => index === 1
        ? { ...range, indexCount: range.indexCount - 3 } : range) };
      if (kind === "foreign-triangle") {
        const offset = selected.indexOffset;
        [artifact.indices[offset], artifact.indices[offset + 1]] = [at(artifact.indices, offset + 1), at(artifact.indices, offset)];
        code = "output-provenance-invalid";
      }
      if (kind === "wrong-position") { artifact.positions[selected.vertexOffset * 3] = at(artifact.positions, selected.vertexOffset * 3) + 0.25; code = "output-provenance-invalid"; }
      if (kind === "atlas-page") { artifact = { ...artifact, atlas: { ...artifact.atlas, count: 2 } }; code = "atlas-page-unsupported"; }
      if (kind === "nan-uv") { artifact.uv[selected.vertexOffset * 2] = NaN; code = "invalid-artifact"; }
      if (kind === "infinite-uv") { artifact.uv[selected.vertexOffset * 2] = Infinity; code = "invalid-artifact"; }
      if (kind === "out-of-unit-uv") { artifact.uv[selected.vertexOffset * 2] = 1.5; code = "invalid-artifact"; }
      if (kind === "old-version") { Object.defineProperty(artifact, "version", { value: 1 }); code = "invalid-artifact"; }
      if (kind === "missing-map") { Reflect.deleteProperty(artifact, "originalInputVertexIndices"); code = "invalid-artifact"; }
      if (kind === "wrong-map-type") {
        Object.defineProperty(artifact, "originalInputVertexIndices", { value: new Uint16Array(artifact.originalInputVertexIndices) });
        code = "invalid-artifact";
      }
      if (kind === "shared-map") {
        if (typeof SharedArrayBuffer === "undefined") throw new Error("공유 버퍼 경계를 검사할 수 있는 테스트 환경이 필요합니다.");
        Object.defineProperty(artifact, "originalInputVertexIndices", {
          value: new Uint32Array(new SharedArrayBuffer(artifact.originalInputVertexIndices.byteLength)),
        });
        code = "invalid-artifact";
      }
      rejectArtifact(mesh, prepared, artifact, assetId, "v-up", code);
    },
  );

  it.each(["", " ", " prop", "prop ", "x".repeat(129)])("적용 대상 assetId %s의 범위도 별도로 검사한다", async (assetId) => {
    const { mesh, prepared, artifact } = await twoMeshes();
    rejectArtifact(mesh, prepared, artifact, assetId, "v-up", "invalid-artifact");
  });

  it("선택한 assetId가 있어도 다른 자산의 정점·삼각형 수를 현재 메시로 적용하지 않는다", async () => {
    const { mesh, prepared, artifact } = await twoMeshes();
    rejectArtifact(mesh, prepared, artifact, "background", "v-up", "mesh-range-invalid");
  });

  it.each(["positions", "uv", "metadata"])("실행 후 원본 %s가 달라지면 artifact가 유효해도 stale 결과를 거절한다", async (kind) => {
    const base = withOldUvs(collinearMesh());
    const prepared = prepareStudioMeshUvAtlasProvenance(base);
    const request = createStudioMeshUvAtlasInteropRequest("asset", prepared, 4, 9);
    const { artifact } = await produce(request);
    const changed = kind === "positions" ? { ...base, vertices: base.vertices.map((vertex) => ({ ...vertex,
      position: { ...vertex.position, x: vertex.position.x + 0.25 } })) }
      : kind === "metadata" ? { ...base, faces: base.faces.map((face) => ({ ...face, materialSlot: face.materialSlot + 1 })) }
        : { ...base, uvLayer: decodeStudioMeshUvLayer({ ...base.uvLayer,
          corners: base.uvLayer?.corners.map((corner) => ({ ...corner, u: corner.u / 2 + 1 / 64 })) ?? [] }, base) };
    expect(hashStudioMeshUvTopology(changed)).toBe(hashStudioMeshUvTopology(base));
    expect(hashStudioEditableMesh(changed)).not.toBe(hashStudioEditableMesh(base));
    rejectArtifact(changed, prepared, artifact, "asset", "v-up", "stale-source");
  });

  it("UV 방향을 생략하거나 모르는 규약을 전달하면 기본값으로 적용하지 않는다", async () => {
    const { mesh, prepared, artifact } = await twoMeshes();
    const before = serializeStudioEditableMesh(mesh);
    expectCode(() => Reflect.apply(applyStudioMeshUvAtlasInteropArtifact, undefined,
      [mesh, prepared, artifact, "prop"]), "uv-basis-invalid");
    expectCode(() => Reflect.apply(applyStudioMeshUvAtlasInteropArtifact, undefined,
      [mesh, prepared, artifact, "prop", "pixel-v-down"]), "uv-basis-invalid");
    expect(serializeStudioEditableMesh(mesh)).toEqual(before);
  });
});
