/** 법선 방향 교정과 유효한 좌표 범위를 검증한다. 현행 UV 삼각 remap/위상 전환은 유지한다. */
import { describe, expect, it } from "vitest";
import { recomputeSculptNormals, type SculptMesh } from "../studio-sculpt-mesh";
import {
  createStudioEditableMeshFromPolygons, createStudioUnitCubeMesh, serializeStudioEditableMesh,
  type StudioEditableMesh, type StudioMeshVec3,
} from "../studio-editable-half-edge-mesh";
import { planStudioMeshSurface } from "../mesh-surface/studio-mesh-surface-plan";
import { projectStudioMeshSurfaceForRender } from "../mesh-surface/studio-mesh-surface-render";
import { surfaceTestQuad } from "../mesh-surface/studio-mesh-surface-test-fixtures";
import { applyStudioSculptStroke, type StudioSculptStroke } from "./studio-hybrid-sculpt-kernel";

const NORMAL_BRUSHES = ["inflate", "clay", "crease"] as const;
const right = new Set([1, 2, 5, 6]);

function point(mesh: StudioEditableMesh, index: number): StudioMeshVec3 {
  const vertex = mesh.vertices[index];
  if (!vertex || vertex.id !== index) throw new Error("계약 입력의 정점 대응이 없습니다.");
  return vertex.position;
}
function changed(mesh: StudioEditableMesh, stroke: StudioSculptStroke, mask?: Float32Array): StudioEditableMesh {
  const result = applyStudioSculptStroke(mesh, stroke, mask);
  if (!result.ok) throw new Error(result.detail);
  return result.mesh;
}
function projected(mesh: StudioEditableMesh) {
  const result = planStudioMeshSurface(mesh, undefined, { allowCreaseMetadata: true, topologyPolicy: "editable" });
  if (!result.ok) throw new Error(result.issue.detail);
  return projectStudioMeshSurfaceForRender(mesh, result.value);
}
function number(values: ArrayLike<number>, index: number): number {
  const value = values[index];
  if (value === undefined) throw new Error("계약 비교의 좌표가 없습니다.");
  return value;
}
function uvAtXY(mesh: StudioEditableMesh, x: number, y: number): readonly (readonly [number, number])[] {
  const view = projected(mesh), hits: Array<readonly [number, number]> = [];
  if (!view.cornerUvs) throw new Error("계약 입력의 UV가 없습니다.");
  for (let offset = 0; offset < view.indices.length; offset += 3) {
    const indices = [number(view.indices, offset), number(view.indices, offset + 1), number(view.indices, offset + 2)];
    const [a, b, c] = indices.map((id) => ({ x: number(view.positions, id * 3), y: number(view.positions, id * 3 + 1) }));
    if (!a || !b || !c) throw new Error("계약 비교의 삼각형이 없습니다.");
    const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    if (Math.abs(denominator) < 1e-12) continue;
    const wa = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / denominator;
    const wb = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / denominator;
    const weights = [wa, wb, 1 - wa - wb];
    if (weights.some((weight) => weight < -1e-8 || weight > 1 + 1e-8)) continue;
    const uvs = view.cornerUvs;
    hits.push([
      weights.reduce((sum, weight, corner) => sum + weight * number(uvs, (offset + corner) * 2), 0),
      weights.reduce((sum, weight, corner) => sum + weight * number(uvs, (offset + corner) * 2 + 1), 0),
    ]);
  }
  return hits;
}
function rotate(point: StudioMeshVec3, angle: number): StudioMeshVec3 {
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  return { x: cosine * point.x - sine * point.y, y: sine * point.x + cosine * point.y, z: point.z };
}

describe("조형 품질 — 닫힌 메시의 국소 법선", () => {
  it.each(NORMAL_BRUSHES)("%s는 cube 코너의 면적 가중 법선 부호를 따르고 고정 Y로 이동하지 않는다", (kind) => {
    const source = createStudioUnitCubeMesh(), snapshot = serializeStudioEditableMesh(source);
    const result = changed(source, { kind, center: { x: .5, y: 0, z: 0 }, radius: 1, strength: .2 });
    const sign = kind === "crease" ? -1 : 1;
    for (const vertex of source.vertices) {
      const actual = point(result, vertex.id), original = vertex.position;
      if (!right.has(vertex.id)) { expect(actual).toEqual(original); continue; }
      // 코너별 삼각분할 기여가 달라 법선 성분의 동일 크기나 (1,1,1)/sqrt(3)을 요구하지 않는다.
      expect((actual.x - original.x) * sign).toBeGreaterThan(0);
      expect((actual.y - original.y) * original.y * sign).toBeGreaterThan(0);
      expect((actual.z - original.z) * original.z * sign).toBeGreaterThan(0);
    }
    expect(result.faces).toHaveLength(12);
    expect(result.halfEdges).toHaveLength(36);
    expect(serializeStudioEditableMesh(source)).toEqual(snapshot);
  });

  it.each(NORMAL_BRUSHES)("%s는 메시와 브러시를 함께 회전해도 같은 편집을 만든다", (kind) => {
    const source = createStudioUnitCubeMesh();
    const stroke: StudioSculptStroke = { kind, center: { x: .5, y: 0, z: 0 }, radius: 1, strength: .2 };
    const result = changed(source, stroke);
    for (const angle of [Math.PI / 2, .37]) {
      const rotated = { ...source, vertices: source.vertices.map((vertex) => ({ ...vertex, position: rotate(vertex.position, angle) })) };
      const actual = changed(rotated, { ...stroke, center: rotate(stroke.center, angle) });
      for (const vertex of source.vertices) {
        const expected = rotate(point(result, vertex.id), angle), position = point(actual, vertex.id);
        expect(position.x).toBeCloseTo(expected.x, 5);
        expect(position.y).toBeCloseTo(expected.y, 5);
        expect(position.z).toBeCloseTo(expected.z, 5);
      }
    }
  });

  it.each(NORMAL_BRUSHES)("%s는 기존 반경·강도 부호·부분 mask 계수를 바꾸지 않는다", (kind) => {
    const source = createStudioEditableMeshFromPolygons([
      { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 0, y: 2, z: 0 },
    ], [[0, 1, 2]]);
    for (const radius of [.5, 1.5]) for (const sign of [-1, 1]) {
      const result = changed(source, { kind, center: point(source, 0), radius, strength: .2 * sign }, new Float32Array([.25, 1, 1]));
      const expected = (kind === "clay" ? .025 : kind === "crease" ? -.025 : .05) * sign;
      expect(point(result, 0).z).toBeCloseTo(expected, 7);
      expect(point(result, 0).x).toBe(0);
      expect(point(result, 1)).toEqual(point(source, 1));
      expect(point(result, 2)).toEqual(point(source, 2));
    }
  });

  it.each(NORMAL_BRUSHES)("%s는 법선이 없는 고립 정점에 고정 Y축을 주입하지 않는다", (kind) => {
    const source = createStudioEditableMeshFromPolygons([
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 10, y: .1, z: 0 },
    ], [[0, 1, 2]]);
    expect(changed(source, { kind, center: point(source, 3), radius: .5, strength: .2 })).toBe(source);
  });

  it("mask를 몰래 0..1로 제한하지 않고 기존 배수 의미를 유지한다", () => {
    const source = createStudioEditableMeshFromPolygons([
      { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 0, y: 2, z: 0 },
    ], [[0, 1, 2]]);
    const result = changed(source, { kind: "inflate", center: point(source, 0), radius: .5, strength: .2 }, new Float32Array([2, 0, 0]));
    expect(point(result, 0).z).toBeCloseTo(.4, 7);
    expect(point(result, 1)).toEqual(point(source, 1));
  });
});

describe("법선 방향 교정 — 현행 no-op·텍스처 작업 호환", () => {
  it.each(NORMAL_BRUSHES)("%s의 무강도 또는 전체 0 mask는 원본을 그대로 반환한다", (kind) => {
    const source = surfaceTestQuad(), before = serializeStudioEditableMesh(source);
    const stroke = { kind, center: { x: .5, y: .5, z: 0 }, radius: 2, strength: .2 };
    expect(changed(source, { ...stroke, strength: 0 })).toBe(source);
    expect(changed(source, stroke, new Float32Array(source.vertices.length))).toBe(source);
    expect(serializeStudioEditableMesh(source)).toEqual(before);
  });

  it.each(NORMAL_BRUSHES)("%s의 텍스처 quad 국소 편집은 기존 삼각 remap과 내부 보간을 유지한다", (kind) => {
    const source = surfaceTestQuad(), before = serializeStudioEditableMesh(source);
    const result = changed(source, { kind, center: { x: 1, y: 1, z: 0 }, radius: .25, strength: .2 });
    const sign = kind === "crease" ? -1 : 1;
    expect(point(result, 2).z * sign).toBeGreaterThan(0);
    // polygon 보존 완료를 주장하지 않는다. 현행 quad→triangle 동작을 이 대안에서 유지한다.
    expect(result.faces).toHaveLength(2);
    expect(result.halfEdges).toHaveLength(6);
    for (const [x, y, expectedU, expectedV] of [[.6, .3, 1.2, .3], [.6, .6, 1, .6]]) {
      if (x === undefined || y === undefined || expectedU === undefined || expectedV === undefined) throw new Error("UV 기대 좌표가 없습니다.");
      const sourceHits = uvAtXY(source, x, y), resultHits = uvAtXY(result, x, y);
      expect(sourceHits).toHaveLength(1);
      expect(resultHits).toHaveLength(1);
      const first = sourceHits[0], actual = resultHits[0];
      if (!first || !actual) throw new Error("UV 내부 보간의 실제 교차점이 없습니다.");
      expect(first[0]).toBeCloseTo(expectedU, 6);
      expect(first[1]).toBeCloseTo(expectedV, 6);
      expect(actual[0]).toBeCloseTo(first[0], 6);
      expect(actual[1]).toBeCloseTo(first[1], 6);
    }
    expect(serializeStudioEditableMesh(source)).toEqual(before);
  });
});

const MAX_FINITE_F32 = 2 ** 128 - 2 ** 104;
const PREVIOUS_FINITE_F32 = MAX_FINITE_F32 - 2 ** 104;

function largeTriangle(x: number, y = x): StudioEditableMesh {
  return createStudioEditableMeshFromPolygons([
    { x: 0, y: 0, z: 0 }, { x, y: 0, z: 0 }, { x: 0, y, z: 0 },
  ], [[0, 1, 2]]);
}
function rotateX(point: StudioMeshVec3, angle: number): StudioMeshVec3 {
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  return { x: point.x, y: cosine * point.y - sine * point.z, z: sine * point.y + cosine * point.z };
}
function normalAmount(kind: typeof NORMAL_BRUSHES[number]): number {
  return kind === "clay" ? .1 : kind === "crease" ? -.1 : .2;
}

describe("정점 법선 수치 범위 — F64 scratch 후보", () => {
  it.each(NORMAL_BRUSHES)("%s는 유한 F32 2^70 삼각형의 외적을 F32에 저장해 망가뜨리지 않는다", (kind) => {
    const source = largeTriangle(2 ** 70), before = serializeStudioEditableMesh(source);
    expect(Array.from(projected(source).positions).every(Number.isFinite)).toBe(true);
    const result = changed(source, { kind, center: point(source, 0), radius: 1, strength: .2 });
    expect(point(result, 0).x).toBe(0);
    expect(point(result, 0).y).toBe(0);
    expect(point(result, 0).z).toBeCloseTo(normalAmount(kind), 7);
    expect(point(result, 1)).toEqual(point(source, 1));
    expect(point(result, 2)).toEqual(point(source, 2));
    expect(Array.from(projected(result).positions).every(Number.isFinite)).toBe(true);
    expect(serializeStudioEditableMesh(source)).toEqual(before);
  });

  it.each(NORMAL_BRUSHES)("%s는 최대 유한 F32와 바로 아래 값의 큰 삼각형을 새로 거부하지 않는다", (kind) => {
    expect(Math.fround(MAX_FINITE_F32)).toBe(MAX_FINITE_F32);
    expect(Math.fround(PREVIOUS_FINITE_F32)).toBe(PREVIOUS_FINITE_F32);
    expect(PREVIOUS_FINITE_F32).toBeLessThan(MAX_FINITE_F32);
    const source = largeTriangle(MAX_FINITE_F32, PREVIOUS_FINITE_F32);
    expect(Array.from(projected(source).positions).every(Number.isFinite)).toBe(true);
    const result = changed(source, { kind, center: point(source, 0), radius: 1, strength: .2 });
    expect(point(result, 0).z).toBeCloseTo(normalAmount(kind), 7);
    expect(point(result, 1)).toEqual(point(source, 1));
    expect(point(result, 2)).toEqual(point(source, 2));
    expect(Array.from(projected(result).positions).every(Number.isFinite)).toBe(true);
  });

  it.each(NORMAL_BRUSHES)("%s는 큰 삼각형에서도 90도와 일반각의 법선 회전 공변성을 유지한다", (kind) => {
    const source = largeTriangle(2 ** 70);
    const stroke: StudioSculptStroke = { kind, center: point(source, 0), radius: 1, strength: .2 };
    const result = changed(source, stroke);
    for (const angle of [Math.PI / 2, .37]) {
      const rotated = { ...source, vertices: source.vertices.map((vertex) => ({ ...vertex, position: rotateX(vertex.position, angle) })) };
      const actual = changed(rotated, { ...stroke, center: rotateX(stroke.center, angle) });
      const expected = rotateX(point(result, 0), angle), position = point(actual, 0);
      expect(position.x).toBeCloseTo(expected.x, 6);
      expect(position.y).toBeCloseTo(expected.y, 6);
      expect(position.z).toBeCloseTo(expected.z, 6);
      expect(Array.from(projected(actual).positions).every(Number.isFinite)).toBe(true);
    }
  });

  it("큰 성분과 분리된 작은 island를 전역 좌표 축척으로 함께 지우지 않는다", () => {
    const edge = 2 ** -70;
    const positions = new Float32Array([
      0, 0, 0, MAX_FINITE_F32, 0, 0, 0, MAX_FINITE_F32, 0,
      4, 0, 0, 4, edge, 0, 4, 0, edge,
    ]);
    const indices = new Uint32Array([0, 1, 2, 3, 4, 5]), normals = new Float64Array(positions.length);
    const before = Array.from(positions);
    // 수치 코어의 유효 배열 계약이다. 극소 island의 surface 입장 정책을 우회 지원했다고 주장하지 않는다.
    recomputeSculptNormals({ positions, normals, indices, vertexCount: 6, triangleCount: 2 });
    expect(Array.from(normals).every(Number.isFinite)).toBe(true);
    for (const vertex of [0, 1, 2]) expect(Array.from(normals.subarray(vertex * 3, vertex * 3 + 3))).toEqual([0, 0, 1]);
    for (const vertex of [3, 4, 5]) expect(Array.from(normals.subarray(vertex * 3, vertex * 3 + 3))).toEqual([1, 0, 0]);
    expect(Array.from(positions)).toEqual(before);
    expect(Array.from(indices)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("기존 F32 호출자의 매 누산 반올림과 배열 소유권을 바꾸지 않는다", () => {
    const edge = 2 ** -12;
    const mesh: SculptMesh = {
      positions: new Float32Array([0, 0, 0, 1, 0, -1, 0, 1, -1, 0, edge, 0, 0, 0, edge]),
      normals: new Float32Array(15), indices: new Uint32Array([0, 1, 2, 0, 3, 4]),
      vertexCount: 5, triangleCount: 2,
    };
    const positions = Array.from(mesh.positions), indices = Array.from(mesh.indices), normals = mesh.normals;
    recomputeSculptNormals(mesh);
    // (1,1,1)에 X방향 2^-24를 더하면 F32 ties-to-even으로 여전히 (1,1,1)이다.
    const component = Math.fround(1 / Math.sqrt(3));
    expect(Array.from(mesh.normals.subarray(0, 3))).toEqual([component, component, component]);
    expect(mesh.normals).toBe(normals);
    expect(mesh.normals).toBeInstanceOf(Float32Array);
    expect(Array.from(mesh.positions)).toEqual(positions);
    expect(Array.from(mesh.indices)).toEqual(indices);
  });
});
