/** 순수 UV 대응 계약의 미실행 초안이다. 실제 xatlas Worker·WASM 통합 검증은 별도다. */
import { describe, expect, it } from "vitest";

import {
  createStudioEditableMeshFromPolygons,
  createStudioUnitCubeMesh,
  hashStudioEditableMesh,
  serializeStudioEditableMesh,
  validateStudioEditableMeshSerializableAuthority,
  type StudioEditableMesh,
} from "../studio-editable-half-edge-mesh";
import { planStudioMeshSurface } from "../mesh-surface/studio-mesh-surface-plan";

import { decodeStudioMeshUvLayer, hashStudioMeshUvTopology } from "./studio-mesh-uv-authority";
import {
  applyStudioMeshUvAtlasProvenance,
  prepareStudioMeshUvAtlasProvenance,
  StudioMeshUvAtlasProvenanceError,
  type StudioMeshUvAtlasProvenanceErrorCode,
  type StudioMeshUvAtlasProvenanceOutput,
  type StudioMeshUvAtlasProvenancePrepared,
} from "./studio-mesh-uv-atlas-provenance";

function at<T>(values: ArrayLike<T>, index: number): T {
  const value = values[index];
  if (value === undefined) throw new Error(`테스트 입력의 ${index} 항목이 없습니다.`);
  return value;
}

function cornerUv(id: number) {
  return { u: (id + 1) / 64, v: (id * 3 + 1) / 128 };
}

function withUvs(mesh: StudioEditableMesh): StudioEditableMesh {
  const corners = mesh.halfEdges.map(({ id }) => ({ halfEdgeId: id, ...cornerUv(id) }));
  return { ...mesh, uvLayer: decodeStudioMeshUvLayer({
    revision: 1, topologyHash: hashStudioMeshUvTopology(mesh), corners,
  }, mesh) };
}

function polygon(points: readonly (readonly [number, number])[]): StudioEditableMesh {
  return createStudioEditableMeshFromPolygons(
    points.map(([x, y]) => ({ x, y, z: 0 })),
    [points.map((_, index) => index)],
  );
}

function concave(): StudioEditableMesh {
  return polygon([[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]]);
}

function concaveWithCollinearCorner(): StudioEditableMesh {
  return polygon([[0, 0], [1, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]]);
}

/** 실제 준비 표의 코너마다 출력 정점을 분리해 차트 seam을 표현한다. */
function outputFor(prepared: StudioMeshUvAtlasProvenancePrepared): StudioMeshUvAtlasProvenanceOutput {
  const count = prepared.indices.length;
  const positions = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const indices = new Uint32Array(count);
  const originalInputVertexIndices = new Uint32Array(count);
  for (let index = 0; index < count; index += 1) {
    const input = at(prepared.indices, index);
    const triangle = at(prepared.triangles, Math.floor(index / 3));
    const corner = at(triangle.cornerHalfEdgeIds, index % 3);
    const pair = cornerUv(corner);
    for (let axis = 0; axis < 3; axis += 1) {
      positions[index * 3 + axis] = at(prepared.positions, input * 3 + axis);
    }
    originalInputVertexIndices[index] = input;
    uv[index * 2] = pair.u;
    uv[index * 2 + 1] = pair.v;
    indices[index] = index;
  }
  return { uvSpace: "canonical-v-up-normalized", atlasCount: 1,
    positions, uv, indices, originalInputVertexIndices };
}

function cloneOutput(output: StudioMeshUvAtlasProvenanceOutput): StudioMeshUvAtlasProvenanceOutput {
  return { ...output, positions: output.positions.slice(), uv: output.uv.slice(),
    indices: output.indices.slice(), originalInputVertexIndices: output.originalInputVertexIndices.slice() };
}

function preserved(source: StudioEditableMesh, mapped: StudioEditableMesh, before: ReturnType<typeof serializeStudioEditableMesh>) {
  expect(mapped.vertices).toBe(source.vertices);
  expect(mapped.halfEdges).toBe(source.halfEdges);
  expect(mapped.faces).toBe(source.faces);
  expect(mapped.revision).toBe(source.revision);
  expect(mapped.nextVertexId).toBe(source.nextVertexId);
  expect(mapped.nextHalfEdgeId).toBe(source.nextHalfEdgeId);
  expect(mapped.nextFaceId).toBe(source.nextFaceId);
  expect(mapped.uvLayer?.corners).toEqual(source.halfEdges.map(({ id }) => ({ halfEdgeId: id, ...cornerUv(id) })));
  expect(hashStudioMeshUvTopology(mapped)).toBe(hashStudioMeshUvTopology(source));
  expect(validateStudioEditableMeshSerializableAuthority(mapped).ok).toBe(true);
  expect(serializeStudioEditableMesh(source)).toEqual(before);
}

function rejectAtomically(
  mesh: StudioEditableMesh,
  prepared: StudioMeshUvAtlasProvenancePrepared,
  output: StudioMeshUvAtlasProvenanceOutput,
  code: StudioMeshUvAtlasProvenanceErrorCode,
) {
  const before = serializeStudioEditableMesh(mesh);
  const hash = hashStudioEditableMesh(mesh);
  let failure: unknown;
  try {
    applyStudioMeshUvAtlasProvenance(mesh, prepared, output);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(StudioMeshUvAtlasProvenanceError);
  if (!(failure instanceof StudioMeshUvAtlasProvenanceError)) throw new Error("UV 대응의 예상 오류를 받지 못했습니다.");
  expect(failure.code).toBe(code);
  expect(serializeStudioEditableMesh(mesh)).toEqual(before);
  expect(hashStudioEditableMesh(mesh)).toBe(hash);
}

function rejectPreparation(mesh: StudioEditableMesh, code: StudioMeshUvAtlasProvenanceErrorCode) {
  const before = serializeStudioEditableMesh(mesh);
  let failure: unknown;
  try {
    prepareStudioMeshUvAtlasProvenance(mesh);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(StudioMeshUvAtlasProvenanceError);
  if (!(failure instanceof StudioMeshUvAtlasProvenanceError)) throw new Error("UV 준비의 예상 오류를 받지 못했습니다.");
  expect(failure.code).toBe(code);
  expect(serializeStudioEditableMesh(mesh)).toEqual(before);
}

describe("자동 펼치기 결과와 원본 면 코너의 UV 대응", () => {
  it("flat cube의 렌더 24 정점 대신 원본 8 정점을 입력으로 사용하고 전체 24 코너를 복원한다", () => {
    const mesh = createStudioUnitCubeMesh();
    const before = serializeStudioEditableMesh(mesh);
    const prepared = prepareStudioMeshUvAtlasProvenance(mesh);
    const surface = planStudioMeshSurface(mesh, undefined, { allowCreaseMetadata: true, topologyPolicy: "editable" });
    if (!surface.ok) throw new Error(surface.issue.detail);
    expect(surface.value.geometry.positions).toHaveLength(24 * 3);
    expect(prepared.positions).toHaveLength(8 * 3);
    expect(prepared.positions).toEqual(Float32Array.from(mesh.vertices.flatMap(({ position }) => [position.x, position.y, position.z])));
    expect(prepared.triangles).toHaveLength(12);
    expect(prepared.useNormals).toBe(false);
    const mapped = applyStudioMeshUvAtlasProvenance(mesh, prepared, outputFor(prepared));
    preserved(mesh, mapped, before);
    expect(mesh.uvLayer).toBeUndefined();
  });

  it("기존 UV seam과 flat·smooth 표현 차이가 원본 입력 adjacency를 분리하지 않는다", () => {
    const plain = createStudioUnitCubeMesh();
    const oldUvs = withUvs(plain);
    const smooth = { ...oldUvs, faces: oldUvs.faces.map((face) => ({ ...face, smooth: true })) };
    const a = prepareStudioMeshUvAtlasProvenance(plain);
    const b = prepareStudioMeshUvAtlasProvenance(oldUvs);
    const c = prepareStudioMeshUvAtlasProvenance(smooth);
    expect(b.positions).toEqual(a.positions);
    expect(c.positions).toEqual(a.positions);
    expect(b.indices).toEqual(a.indices);
    expect(c.indices).toEqual(a.indices);
    const before = serializeStudioEditableMesh(oldUvs);
    preserved(oldUvs, applyStudioMeshUvAtlasProvenance(oldUvs, b, outputFor(b)), before);
  });

  it("실제 오목한 6각형을 공유 surface와 같은 4개 삼각형으로 추적하며 polygon IDs를 유지한다", () => {
    const mesh = concave();
    const before = serializeStudioEditableMesh(mesh);
    const prepared = prepareStudioMeshUvAtlasProvenance(mesh);
    const surface = planStudioMeshSurface(mesh, undefined, { allowCreaseMetadata: true, topologyPolicy: "editable" });
    if (!surface.ok) throw new Error(surface.issue.detail);
    expect(prepared.triangles).toHaveLength(4);
    expect(prepared.triangles.map(({ cornerHalfEdgeIds }) => cornerHalfEdgeIds)).toEqual(surface.value.triangles.map(({ cornerHalfEdgeIds }) => cornerHalfEdgeIds));
    preserved(mesh, applyStudioMeshUvAtlasProvenance(mesh, prepared, outputFor(prepared)), before);
  });

  it("출력 삼각형 순서와 각 삼각형의 cyclic 시작 코너가 바뀌어도 원본 UV를 정확히 복원한다", () => {
    const mesh = createStudioUnitCubeMesh();
    const before = serializeStudioEditableMesh(mesh);
    const prepared = prepareStudioMeshUvAtlasProvenance(mesh);
    const output = outputFor(prepared);
    const changed = cloneOutput(output);
    const count = output.indices.length / 3;
    for (let triangle = 0; triangle < count; triangle += 1) {
      const from = count - triangle - 1;
      for (let corner = 0; corner < 3; corner += 1) {
        changed.indices[triangle * 3 + corner] = at(output.indices, from * 3 + (corner + triangle % 3) % 3);
      }
    }
    expect(changed.indices).not.toEqual(output.indices);
    preserved(mesh, applyStudioMeshUvAtlasProvenance(mesh, prepared, changed), before);
  });

  it("공유 3D 정점의 서로 다른 면 코너 UV는 독립 seam으로 남긴다", () => {
    const mesh = createStudioUnitCubeMesh();
    const prepared = prepareStudioMeshUvAtlasProvenance(mesh);
    const mapped = applyStudioMeshUvAtlasProvenance(mesh, prepared, outputFor(prepared));
    const byVertex = new Map<number, Set<string>>();
    for (const edge of mapped.halfEdges) {
      const origin = at(mapped.halfEdges, edge.prev).vertex;
      const uv = at(mapped.uvLayer?.corners ?? [], edge.id);
      const values = byVertex.get(origin) ?? new Set<string>();
      values.add(`${uv.u}:${uv.v}`);
      byVertex.set(origin, values);
    }
    expect([...byVertex.values()].every((values) => values.size === 3)).toBe(true);
  });

  it("normalized 경계 0·1을 정확히 유지하고 원본 UV나 위치를 수정하지 않는다", () => {
    const mesh = withUvs(createStudioUnitCubeMesh());
    const before = serializeStudioEditableMesh(mesh);
    const prepared = prepareStudioMeshUvAtlasProvenance(mesh);
    const output = outputFor(prepared);
    for (let index = 0; index < output.originalInputVertexIndices.length; index += 1) {
      const triangle = at(prepared.triangles, Math.floor(index / 3));
      const cornerId = at(triangle.cornerHalfEdgeIds, index % 3);
      output.uv[index * 2] = cornerId % 2;
      output.uv[index * 2 + 1] = 1 - cornerId % 2;
    }
    const mapped = applyStudioMeshUvAtlasProvenance(mesh, prepared, output);
    expect(mapped.uvLayer?.corners).toEqual(mesh.halfEdges.map(({ id }) => ({ halfEdgeId: id, u: id % 2, v: 1 - id % 2 })));
    expect(mapped.vertices).toBe(mesh.vertices);
    expect(mapped.halfEdges).toBe(mesh.halfEdges);
    expect(mapped.faces).toBe(mesh.faces);
    expect(validateStudioEditableMeshSerializableAuthority(mapped).ok).toBe(true);
    expect(serializeStudioEditableMesh(mesh)).toEqual(before);
  });

  it.each(["missing", "duplicate", "reverse", "foreign"] as const)("%s 출력 삼각형을 부분 적용하지 않고 거절한다", (kind) => {
    const mesh = createStudioUnitCubeMesh();
    const prepared = prepareStudioMeshUvAtlasProvenance(mesh);
    const output = cloneOutput(outputFor(prepared));
    const modified = kind === "missing" ? { ...output, indices: output.indices.slice(3) } : output;
    if (kind === "duplicate") modified.indices.set(modified.indices.slice(0, 3), 3);
    if (kind === "reverse") [modified.indices[0], modified.indices[1]] = [at(modified.indices, 1), at(modified.indices, 0)];
    if (kind === "foreign") modified.indices[0] = 0xffff_ffff;
    rejectAtomically(mesh, prepared, modified, kind === "missing" ? "output-shape-invalid"
      : kind === "duplicate" ? "triangle-coverage" : "output-provenance-invalid");
  });

  it.each(["out-of-range", "wrong-position", "missing-map"] as const)("%s 원본 정점 provenance를 거절한다", (kind) => {
    const mesh = createStudioUnitCubeMesh();
    const prepared = prepareStudioMeshUvAtlasProvenance(mesh);
    const output = cloneOutput(outputFor(prepared));
    if (kind === "out-of-range") output.originalInputVertexIndices[0] = prepared.positions.length / 3;
    if (kind === "wrong-position") output.positions[0] = at(output.positions, 0) + 0.25;
    const modified = kind === "missing-map" ? { ...output,
      originalInputVertexIndices: output.originalInputVertexIndices.slice(1) } : output;
    rejectAtomically(mesh, prepared, modified, kind === "missing-map" ? "output-shape-invalid" : "output-provenance-invalid");
  });

  it.each([NaN, Infinity, -Infinity, 1e40, -0.25, 1.25])("유효하지 않은 normalized UV %s를 clamp하거나 누락하지 않는다", (value) => {
    const mesh = createStudioUnitCubeMesh();
    const prepared = prepareStudioMeshUvAtlasProvenance(mesh);
    const output = cloneOutput(outputFor(prepared));
    output.uv[0] = value;
    rejectAtomically(mesh, prepared, output, Number.isFinite(Math.fround(value)) ? "uv-space-invalid" : "output-provenance-invalid");
  });

  it.each(["image-v-down", "pixel-coordinates", "unspecified"])("%s UV 규약을 canonical V-up으로 묵인하지 않는다", (uvSpace) => {
    const mesh = createStudioUnitCubeMesh();
    const prepared = prepareStudioMeshUvAtlasProvenance(mesh);
    const output = cloneOutput(outputFor(prepared));
    Object.defineProperty(output, "uvSpace", { value: uvSpace, enumerable: true });
    rejectAtomically(mesh, prepared, output, "uv-space-invalid");
  });

  it.each([0, 2, 16, NaN])("atlas page %s를 단일 canonical UV layer에 겹쳐 넣지 않는다", (atlasCount) => {
    const mesh = createStudioUnitCubeMesh();
    const prepared = prepareStudioMeshUvAtlasProvenance(mesh);
    rejectAtomically(mesh, prepared, { ...outputFor(prepared), atlasCount }, "atlas-page-unsupported");
  });

  it.each(["quad", "concave-collinear"] as const)("%s ngon 코너에 서로 다른 UV를 반환한 내부 chart cut을 원자적으로 거절한다", (kind) => {
    const mesh = kind === "quad" ? polygon([[0, 0], [1, 0], [1, 1], [0, 1]]) : concaveWithCollinearCorner();
    const prepared = prepareStudioMeshUvAtlasProvenance(mesh);
    const output = cloneOutput(outputFor(prepared));
    const seen = new Set<number>();
    let conflictAt = -1;
    for (let index = 0; index < prepared.indices.length; index += 1) {
      const triangle = at(prepared.triangles, Math.floor(index / 3));
      const corner = at(triangle.cornerHalfEdgeIds, index % 3);
      if (seen.has(corner)) { conflictAt = index; break; }
      seen.add(corner);
    }
    expect(conflictAt).toBeGreaterThanOrEqual(0);
    output.uv[conflictAt * 2] = at(output.uv, conflictAt * 2) + 1 / 64;
    rejectAtomically(mesh, prepared, output, "corner-uv-conflict");
  });

  it.each(["positions", "uv", "metadata"] as const)("준비 이후 원본 %s가 달라지면 위상 hash가 같아도 결과를 거절한다", (kind) => {
    const mesh = withUvs(createStudioUnitCubeMesh());
    const prepared = prepareStudioMeshUvAtlasProvenance(mesh);
    const changed = kind === "positions" ? { ...mesh, vertices: mesh.vertices.map((vertex) => ({ ...vertex,
      position: { ...vertex.position, x: vertex.position.x + 0.25 } })) }
      : kind === "metadata" ? { ...mesh, faces: mesh.faces.map((face) => ({ ...face, materialSlot: face.materialSlot + 1 })) }
        : { ...mesh, uvLayer: decodeStudioMeshUvLayer({ ...mesh.uvLayer,
          corners: mesh.uvLayer?.corners.map((corner) => ({ ...corner, u: corner.u / 2 })) ?? [] }, mesh) };
    expect(hashStudioMeshUvTopology(changed)).toBe(hashStudioMeshUvTopology(mesh));
    expect(hashStudioEditableMesh(changed)).not.toBe(hashStudioEditableMesh(mesh));
    rejectAtomically(changed, prepared, outputFor(prepared), "stale-source");
  });

  it.each(["positions", "indices", "source-ids", "corner-table", "source-hash", "normal-policy"] as const)("준비 payload의 %s 변조를 적용 전에 거절한다", (kind) => {
    const mesh = createStudioUnitCubeMesh();
    const prepared = prepareStudioMeshUvAtlasProvenance(mesh);
    const output = outputFor(prepared);
    if (kind === "positions") prepared.positions[0] = at(prepared.positions, 0) + 0.25;
    if (kind === "indices") prepared.indices[0] = (at(prepared.indices, 0) + 1) % mesh.vertices.length;
    if (kind === "source-ids") prepared.inputSourceVertexIds[0] = (at(prepared.inputSourceVertexIds, 0) + 1) % mesh.vertices.length;
    const modified = kind === "source-hash" ? { ...prepared, sourceHash: "mesh:foreign" }
      : kind === "corner-table" ? { ...prepared, triangles: prepared.triangles.map((triangle, index) => index === 0
        ? { ...triangle, cornerHalfEdgeIds: [1, 2, 3] as const } : triangle) } : kind === "normal-policy" ? { ...prepared } : prepared;
    if (kind === "normal-policy") Object.defineProperty(modified, "useNormals", { value: true, enumerable: true });
    rejectAtomically(mesh, modified, output, kind === "source-hash" ? "stale-source" : "prepared-mismatch");
  });

  it("동일 좌표의 서로 다른 source vertex ID를 위치로 용접하지 않는다", () => {
    const mesh = createStudioEditableMeshFromPolygons([
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 },
    ], [[0, 1, 2], [3, 4, 5]]);
    const before = serializeStudioEditableMesh(mesh);
    const prepared = prepareStudioMeshUvAtlasProvenance(mesh);
    expect(prepared.positions).toHaveLength(6 * 3);
    expect(new Set(prepared.indices).size).toBe(6);
    expect(Array.from(prepared.inputSourceVertexIds)).toEqual(mesh.vertices.map(({ id }) => id));
    const output = outputFor(prepared);
    preserved(mesh, applyStudioMeshUvAtlasProvenance(mesh, prepared, output), before);
    const forged = cloneOutput(output);
    forged.originalInputVertexIndices[0] = 3;
    expect(forged.positions[0]).toBe(prepared.positions[3 * 3]);
    rejectAtomically(mesh, prepared, forged, "output-provenance-invalid");
  });

  it("입력 oriented triangle tuple이 중복이면 임의 첫 면에 대응시키지 않는다", () => {
    const mesh = createStudioEditableMeshFromPolygons([
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 },
    ], [[0, 1, 2], [0, 1, 2]]);
    rejectPreparation(mesh, "ambiguous-triangle");
  });

  it.each(["default-first", "bridge-first"] as const)("%s cache 호출에서도 기본 생략 정책과 bridge의 명시적 면 코너 보존을 분리한다", (order) => {
    const mesh = polygon([[0, 0], [1, 0], [2, 0], [2, 1], [0, 1]]);
    const before = serializeStudioEditableMesh(mesh);
    const defaultSurface = () => {
      const result = planStudioMeshSurface(mesh, undefined, { allowCreaseMetadata: true, topologyPolicy: "editable" });
      if (!result.ok) throw new Error(result.issue.detail);
      return result.value;
    };
    const first = order === "default-first" ? defaultSurface() : undefined;
    const prepared = prepareStudioMeshUvAtlasProvenance(mesh);
    const ordinary = first ?? defaultSurface();
    expect(ordinary.validated.warnings.map(({ code }) => code)).toContain("face-collinear-corner-omitted");
    expect(ordinary.triangles).toHaveLength(2);
    expect(prepared.triangles).toHaveLength(3);
    expect(new Set(prepared.triangles.flatMap(({ cornerHalfEdgeIds }) => cornerHalfEdgeIds))).toEqual(new Set(mesh.halfEdges.map(({ id }) => id)));
    const explicit = planStudioMeshSurface(mesh, undefined, {
      allowCreaseMetadata: true, topologyPolicy: "editable", preserveFaceCorners: true,
    });
    if (!explicit.ok) throw new Error(explicit.issue.detail);
    expect(explicit.value.validated.warnings.map(({ code }) => code)).not.toContain("face-collinear-corner-omitted");
    expect(prepared.triangles.map(({ cornerHalfEdgeIds }) => cornerHalfEdgeIds)).toEqual(explicit.value.triangles.map(({ cornerHalfEdgeIds }) => cornerHalfEdgeIds));
    expect(defaultSurface()).toBe(ordinary);
    const mapped = applyStudioMeshUvAtlasProvenance(mesh, prepared, outputFor(prepared));
    preserved(mesh, mapped, before);
    expect(mapped.faces).toHaveLength(1);
    expect(mapped.halfEdges).toHaveLength(5);
    expect(mesh.uvLayer).toBeUndefined();
  });

  it("기존 UV가 보존한 collinear 원본 코너는 전체 coverage를 유지한다", () => {
    const mesh = withUvs(polygon([[0, 0], [1, 0], [2, 0], [2, 1], [0, 1]]));
    const before = serializeStudioEditableMesh(mesh);
    const prepared = prepareStudioMeshUvAtlasProvenance(mesh);
    expect(prepared.triangles).toHaveLength(3);
    preserved(mesh, applyStudioMeshUvAtlasProvenance(mesh, prepared, outputFor(prepared)), before);
  });

  it.each(["without-uv", "with-uv"] as const)("%s 오목한 collinear 7각형의 모든 원본 코너에 UV를 적용하고 polygon을 유지한다", (kind) => {
    const plain = concaveWithCollinearCorner();
    const mesh = kind === "with-uv" ? withUvs(plain) : plain;
    const before = serializeStudioEditableMesh(mesh);
    const prepared = prepareStudioMeshUvAtlasProvenance(mesh);
    expect(prepared.triangles).toHaveLength(5);
    expect(new Set(prepared.indices).size).toBe(7);
    const mapped = applyStudioMeshUvAtlasProvenance(mesh, prepared, outputFor(prepared));
    preserved(mesh, mapped, before);
    expect(mapped.faces).toHaveLength(1);
    expect(mapped.halfEdges).toHaveLength(7);
    expect(mapped.uvLayer?.corners).toHaveLength(7);
    expect(mesh.uvLayer === undefined).toBe(kind === "without-uv");
  });
});
