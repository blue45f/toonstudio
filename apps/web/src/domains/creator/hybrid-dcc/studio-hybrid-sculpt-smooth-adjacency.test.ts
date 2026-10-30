import { describe, expect, it } from "vitest";

import {
  createStudioEditableMeshFromPolygons,
  hashStudioEditableMesh,
  serializeStudioEditableMesh,
  validateStudioEditableMeshSerializableAuthority,
  type StudioEditableMesh,
} from "../studio-editable-half-edge-mesh";
import { decodeStudioMeshUvLayer, hashStudioMeshUvTopology } from "../mesh-uv/studio-mesh-uv-authority";
import { remapStudioMeshUvTriangleSoup } from "../mesh-uv/studio-mesh-uv-triangle-remap";
import { planStudioMeshSurface } from "../mesh-surface/studio-mesh-surface-plan";
import { projectStudioMeshSurfaceForRender } from "../mesh-surface/studio-mesh-surface-render";

import { applyStudioSculptStroke, type StudioSculptResult, type StudioSculptStroke } from "./studio-hybrid-sculpt-kernel";

type SmoothStroke = StudioSculptStroke & { readonly kind: "smooth" };
const STROKE: SmoothStroke = {
  kind: "smooth", center: { x: .17, y: .29, z: -.03 }, radius: 3.7, strength: .17,
};

function at(values: ArrayLike<number>, index: number): number {
  const value = values[index];
  if (value === undefined) throw new Error(`회귀 입력의 ${index}번째 값이 없습니다.`);
  return value;
}

function sourceMesh(uv = false, metadata = false): StudioEditableMesh {
  const base = createStudioEditableMeshFromPolygons([
    { x: -.13, y: -.21, z: .12 }, { x: 1.23, y: .07, z: .31 },
    { x: .91, y: 1.37, z: -.08 }, { x: -.42, y: .83, z: .27 },
  ], [[0, 1, 2], [0, 2, 3]]);
  const attributed: StudioEditableMesh = metadata ? {
    ...base,
    vertices: base.vertices.map((vertex) => ({ ...vertex, crease: vertex.id === 2 ? .25 : 0 })),
    halfEdges: base.halfEdges.map((edge) => ({ ...edge, crease: edge.twin === -1 ? .5 : 0 })),
    faces: base.faces.map((face) => ({ ...face, materialSlot: face.id === 0 ? 7 : 2 ** 40 + 3, smooth: false })),
  } : {
    ...base, faces: base.faces.map((face) => ({ ...face, smooth: face.id === 1 })),
  };
  if (!uv) return attributed;
  return { ...attributed, uvLayer: decodeStudioMeshUvLayer({
    revision: 1, topologyHash: hashStudioMeshUvTopology(attributed),
    corners: attributed.halfEdges.map(({ id }) => ({
      halfEdgeId: id, u: Math.fround(.13 + id * id * .17), v: Math.fround(-.21 + id * .31),
    })),
  }, attributed) };
}

function projection(mesh: StudioEditableMesh) {
  const plan = planStudioMeshSurface(mesh, undefined, { allowCreaseMetadata: true, topologyPolicy: "editable" });
  if (!plan.ok) throw new Error(plan.issue.detail);
  return projectStudioMeshSurfaceForRender(mesh, plan.value);
}

/** 최적화 전 smooth 루프. tri.includes와 각 j의 중복·순차 좌표 읽기를 그대로 둔다. */
function oldSmoothPositions(
  mesh: StudioEditableMesh, stroke: SmoothStroke, mask?: Float32Array | null,
): Float32Array {
  const soup = projection(mesh), positions = new Float32Array(soup.positions);
  for (let i = 0; i < positions.length / 3; i += 1) {
    const m = mask ? (mask[i] ?? 1) : 1;
    if (m <= 0) continue;
    const x = at(positions, i * 3), y = at(positions, i * 3 + 1), z = at(positions, i * 3 + 2);
    const dist = Math.hypot(x - stroke.center.x, y - stroke.center.y, z - stroke.center.z);
    const t = dist >= stroke.radius ? 0 : 1 - dist / stroke.radius;
    const w = (dist >= stroke.radius ? 0 : t * t * (3 - 2 * t)) * stroke.strength * m;
    if (w === 0) continue;
    let ax = 0, ay = 0, az = 0, count = 0;
    for (let offset = 0; offset < soup.indices.length; offset += 3) {
      const tri = [at(soup.indices, offset), at(soup.indices, offset + 1), at(soup.indices, offset + 2)];
      if (!tri.includes(i)) continue;
      for (const j of tri) {
        if (j === i) continue;
        ax += at(positions, j * 3);
        ay += at(positions, j * 3 + 1);
        az += at(positions, j * 3 + 2);
        count += 1;
      }
    }
    if (count > 0) {
      ax /= count; ay /= count; az /= count;
      positions[i * 3] = x + (ax - x) * w;
      positions[i * 3 + 1] = y + (ay - y) * w;
      positions[i * 3 + 2] = z + (az - z) * w;
    }
  }
  return positions;
}

/** 기존 공유 표면→Float32 갱신→triangle 재구축→UV/속성 receipt→결과 검증을 비교한다. */
function oldSmoothReference(
  mesh: StudioEditableMesh, stroke: SmoothStroke, mask?: Float32Array | null,
): StudioSculptResult {
  if (!(stroke.radius > 0) || !Number.isFinite(stroke.strength)) return { ok: false, detail: "invalid brush" };
  if (mesh.uvLayer !== undefined) {
    const valid = validateStudioEditableMeshSerializableAuthority(mesh);
    if (!valid.ok) return { ok: false, detail: `UV 원본 메시를 확인할 수 없습니다: ${valid.detail}` };
  }
  const soup = projection(mesh), positions = oldSmoothPositions(mesh, stroke, mask);
  if (positions.every((value, index) => value === soup.positions[index])) return { ok: true, mesh };
  try {
    const vertices = Array.from({ length: positions.length / 3 }, (_, index) => ({
      x: at(positions, index * 3), y: at(positions, index * 3 + 1), z: at(positions, index * 3 + 2),
    }));
    const faces = Array.from({ length: soup.indices.length / 3 }, (_, index) => [
      at(soup.indices, index * 3), at(soup.indices, index * 3 + 1), at(soup.indices, index * 3 + 2),
    ]);
    const triangles = createStudioEditableMeshFromPolygons(vertices, faces);
    const result = remapStudioMeshUvTriangleSoup(mesh, triangles, soup.indices);
    const planned = planStudioMeshSurface(result, undefined, { allowCreaseMetadata: true, topologyPolicy: "editable" });
    if (!planned.ok) return { ok: false, detail: `Sculpt 결과 표면을 표시할 수 없습니다: ${planned.issue.detail}` };
    return { ok: true, mesh: result };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "Sculpt UV 코너 대응을 확인할 수 없습니다." };
  }
}

function exactReference(mesh: StudioEditableMesh, stroke = STROKE, mask?: Float32Array | null) {
  const before = serializeStudioEditableMesh(mesh), beforeHash = hashStudioEditableMesh(mesh), sourceProjection = projection(mesh);
  const originalPositions = sourceProjection.positions.slice(), originalIndices = sourceProjection.indices.slice(), originalMask = mask?.slice();
  const expected = oldSmoothReference(mesh, stroke, mask), actual = applyStudioSculptStroke(mesh, stroke, mask);
  expect(actual.ok).toBe(expected.ok);
  if (!actual.ok || !expected.ok) {
    expect(actual).toEqual(expected);
    throw new Error("성공을 검증하는 fixture가 smooth 결과를 만들지 못했습니다.");
  }
  const floatBits = (result: StudioEditableMesh) => {
    const values = new Float32Array(result.vertices.flatMap(({ position }) => [position.x, position.y, position.z]));
    return new Uint8Array(values.buffer);
  };
  expect(floatBits(actual.mesh)).toEqual(floatBits(expected.mesh));
  expect(serializeStudioEditableMesh(actual.mesh)).toEqual(serializeStudioEditableMesh(expected.mesh));
  expect(hashStudioEditableMesh(actual.mesh)).toBe(hashStudioEditableMesh(expected.mesh));
  expect(serializeStudioEditableMesh(mesh)).toEqual(before);
  expect(hashStudioEditableMesh(mesh)).toBe(beforeHash);
  expect(sourceProjection.positions).toEqual(originalPositions);
  expect(sourceProjection.indices).toEqual(originalIndices);
  if (mask) expect(mask).toEqual(originalMask);
  return actual.mesh;
}

describe("smooth CSR가 이전 triangle/j/Float32 갱신 순서를 보존한다", () => {
  it.each([
    { label: "양의 강도", strength: .17, mask: undefined },
    { label: "음의 강도", strength: -.08, mask: undefined },
    { label: "부분 mask", strength: .17, mask: [1, .4, 0, .9] },
    { label: "짧은 mask의 기존 기본값 1", strength: .17, mask: [0, .25] },
    { label: "음수 mask 제외", strength: .17, mask: [-.5, .75, .5, 0] },
    { label: "첫 세 정점 영향 없음", strength: .17, mask: [0, 0, 0, 1] },
  ])("비대칭 다중 triangle의 $label: 이전 reference와 exact snapshot/hash가 같다", ({ strength, mask }) => {
    const source = sourceMesh(), result = exactReference(source, { ...STROKE, strength }, mask ? new Float32Array(mask) : undefined);
    expect(hashStudioEditableMesh(result)).not.toBe(hashStudioEditableMesh(source));
    expect(Object.hasOwn(result, "uvLayer")).toBe(false);
  });

  it("이웃 2가 두 면에서 기여하는 [1,2,2,3]을 unique 이웃 평균으로 바꾸지 않는다", () => {
    const source = sourceMesh(), input = projection(source), row: number[] = [];
    for (let offset = 0; offset < input.indices.length; offset += 3) {
      const tri = [at(input.indices, offset), at(input.indices, offset + 1), at(input.indices, offset + 2)];
      if (tri.includes(0)) row.push(...tri.filter((vertex) => vertex !== 0));
    }
    expect(row).toEqual([1, 2, 2, 3]);
    const x = at(input.positions, 0), y = at(input.positions, 1), z = at(input.positions, 2);
    const dist = Math.hypot(x - STROKE.center.x, y - STROKE.center.y, z - STROKE.center.z);
    const t = 1 - dist / STROKE.radius, w = t * t * (3 - 2 * t) * STROKE.strength;
    const repeatedAverage = row.reduce((sum, vertex) => sum + at(input.positions, vertex * 3), 0) / row.length;
    const unique = [...new Set(row)], uniqueAverage = unique.reduce((sum, vertex) => sum + at(input.positions, vertex * 3), 0) / unique.length;
    const result = exactReference(source), actualX = result.vertices[0]?.position.x;
    expect(actualX).toBe(Math.fround(x + (repeatedAverage - x) * w));
    expect(actualX).not.toBe(Math.fround(x + (uniqueAverage - x) * w));
  });

  it("뒤 정점은 먼저 갱신된 앞 정점을 읽으며 Jacobi 원본 복사 평균과 다르다", () => {
    const source = sourceMesh(), input = projection(source), sequential = oldSmoothPositions(source, STROKE), result = exactReference(source);
    const i = 1, x = at(input.positions, i * 3), y = at(input.positions, i * 3 + 1), z = at(input.positions, i * 3 + 2);
    const dist = Math.hypot(x - STROKE.center.x, y - STROKE.center.y, z - STROKE.center.z), t = 1 - dist / STROKE.radius;
    const w = t * t * (3 - 2 * t) * STROKE.strength;
    const jacobiAverage = (at(input.positions, 0) + at(input.positions, 2 * 3)) / 2;
    const gaussSeidelAverage = (at(sequential, 0) + at(input.positions, 2 * 3)) / 2;
    expect(result.vertices[i]?.position.x).toBe(Math.fround(x + (gaussSeidelAverage - x) * w));
    expect(result.vertices[i]?.position.x).not.toBe(Math.fround(x + (jacobiAverage - x) * w));
  });

  it("같은 방향으로 중복된 두 face도 각 triangle의 기여와 원본 face 개수를 유지한다", () => {
    const source = createStudioEditableMeshFromPolygons([
      { x: -.13, y: -.21, z: .12 }, { x: 1.23, y: .07, z: .31 }, { x: .91, y: 1.37, z: -.08 },
    ], [[0, 1, 2], [0, 1, 2]]);
    const input = projection(source);
    expect(Array.from(input.indices)).toEqual([0, 1, 2, 0, 1, 2]);
    const result = exactReference(source);
    expect(result.faces).toHaveLength(2);
    expect(hashStudioEditableMesh(result)).not.toBe(hashStudioEditableMesh(source));
  });

  it("비대칭 corner UV·큰 slot·flat 속성·정점/경계 crease도 이전 commit 결과와 정확히 같다", () => {
    const source = sourceMesh(true, true), result = exactReference(source, STROKE, new Float32Array([0, 1, .6, 1]));
    expect(result.uvLayer).toEqual(source.uvLayer);
    expect(result.faces.map(({ materialSlot, smooth }) => ({ materialSlot, smooth }))).toEqual(
      source.faces.map(({ materialSlot, smooth }) => ({ materialSlot, smooth })),
    );
    expect(result.vertices.map(({ crease }) => crease)).toEqual(source.vertices.map(({ crease }) => crease));
    expect(result.halfEdges.map(({ crease }) => crease)).toEqual(source.halfEdges.map(({ crease }) => crease));
    expect(hashStudioEditableMesh(result)).not.toBe(hashStudioEditableMesh(source));
  });

  it.each(["강도 0", "전체 mask 0", "반경 밖", "Float32에 못 미치는 영향"] as const)("%s은 원본 identity·UV·snapshot을 그대로 반환한다", (kind) => {
    const source = sourceMesh(true, true);
    const stroke: SmoothStroke = kind === "강도 0" ? { ...STROKE, strength: 0 }
      : kind === "반경 밖" ? { ...STROKE, center: { x: 100, y: 100, z: 100 }, radius: .01 }
        : kind === "Float32에 못 미치는 영향" ? { ...STROKE, strength: 1e-50 } : STROKE;
    const result = exactReference(source, stroke, kind === "전체 mask 0" ? new Float32Array(source.vertices.length) : undefined);
    expect(result).toBe(source);
  });
});
