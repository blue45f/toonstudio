import { Box3, Euler, Matrix4, Quaternion, Vector3, type BufferGeometry } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as primitives from "../studio-background-3d-primitives";
import { hashStudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { analyzeStudioEditableMeshIntegrity, readStudioMeshFaceLoops } from "../hybrid-dcc/studio-hybrid-dcc-face-modeling-mesh";

import { convertStudioBg3dPrimitiveToEditableMesh, type StudioBg3dPrimitiveEditMeshValue } from "./studio-bg3d-primitive-edit-mesh";

import type { BgPrimitiveKind } from "../studio-background-3d-metadata";
import type { StudioBg3dVec3 } from "./studio-bg3d-scene-document-types";

interface PrimitiveCase { readonly kind: BgPrimitiveKind; readonly rawVertices: number; readonly vertices: number; readonly triangles: number; readonly boundary: number }
const CASES: readonly PrimitiveCase[] = [
  { kind: "box", rawVertices: 24, vertices: 8, triangles: 12, boundary: 0 },
  { kind: "cylinder", rawVertices: 100, vertices: 34, triangles: 64, boundary: 0 },
  { kind: "plane", rawVertices: 4, vertices: 4, triangles: 2, boundary: 4 },
  { kind: "sphere", rawVertices: 425, vertices: 362, triangles: 720, boundary: 0 },
  { kind: "hemisphere", rawVertices: 325, vertices: 289, triangles: 552, boundary: 24 },
  { kind: "cone", rawVertices: 99, vertices: 26, triangles: 48, boundary: 0 },
  { kind: "pyramid", rawVertices: 19, vertices: 6, triangles: 8, boundary: 0 },
  { kind: "triangularPrism", rawVertices: 22, vertices: 8, triangles: 12, boundary: 0 },
  { kind: "hexPrism", rawVertices: 40, vertices: 14, triangles: 24, boundary: 0 },
  { kind: "torus", rawVertices: 325, vertices: 288, triangles: 576, boundary: 0 },
  { kind: "tube", rawVertices: 50, vertices: 48, triangles: 48, boundary: 48 },
  { kind: "ring", rawVertices: 66, vertices: 64, triangles: 64, boundary: 64 },
];

function converted(kind: BgPrimitiveKind): StudioBg3dPrimitiveEditMeshValue {
  const result = convertStudioBg3dPrimitiveToEditableMesh({ id: `original-${kind}`, kind });
  if (!result.ok) throw new Error(`${result.code}: ${result.detail}`);
  return result.value;
}
function matrix(position: StudioBg3dVec3, rotation: StudioBg3dVec3, scale: StudioBg3dVec3): Matrix4 {
  return new Matrix4().compose(new Vector3(...position), new Quaternion().setFromEuler(new Euler(...rotation, "XYZ")), new Vector3(...scale));
}
afterEach(() => vi.restoreAllMocks());

describe("실제 primitive → object-local editable mesh", () => {
  it.each(CASES)("$kind 원형·정점·삼각형 대응·open/closed 상태를 보존한다", (sample) => {
    const value = converted(sample.kind), repeated = converted(sample.kind);
    expect(value.sourcePrimitiveId).toBe(`original-${sample.kind}`);
    expect(value.primitiveKind).toBe(sample.kind);
    expect(value.sourceVertexCount).toBe(sample.rawVertices);
    expect(value.sourceTriangleCount).toBe(sample.triangles);
    expect(value.mesh.vertices).toHaveLength(sample.vertices);
    expect(value.sourceVertexToMeshVertex).toHaveLength(sample.rawVertices);
    expect(value.closed).toBe(sample.boundary === 0);
    expect(value.boundaryHalfEdges).toBe(sample.boundary);
    expect(value.faceSources.flatMap((source) => source.sourceTriangleIds).sort((a, b) => a - b))
      .toEqual(Array.from({ length: sample.triangles }, (_, id) => id));
    expect(value.faceSources).toEqual(repeated.faceSources);
    expect(value.sourceVertexToMeshVertex).toEqual(repeated.sourceVertexToMeshVertex);
    expect(hashStudioEditableMesh(value.mesh)).toBe(hashStudioEditableMesh(repeated.mesh));
    const integrity = analyzeStudioEditableMeshIntegrity(value.mesh, { renderableFaces: "all" });
    expect(integrity).toMatchObject({ canonical: true, nonManifoldEdges: 0, orientationConflicts: 0, bowTieVertices: 0,
      isolatedVertexCount: 0, zeroAreaFaces: [], nonPlanarFaces: [], nonConvexFaces: [], unrenderableFaces: [] });
    if (sample.boundary === 0) expect(integrity.eulerCharacteristic).toBe(sample.kind === "torus" ? 0 : 2);
  });

  it.each(CASES)("$kind 실제 source bounds와 parent/shear/반사 포함 world 정점을 보존한다", ({ kind }) => {
    const raw = primitives.makeGeometry(kind);
    try {
      const value = converted(kind), attribute = raw.getAttribute("position");
      raw.computeBoundingBox();
      expect(value.sourceBounds.min).toEqual(raw.boundingBox?.min.toArray());
      expect(value.sourceBounds.max).toEqual(raw.boundingBox?.max.toArray());
      const def = primitives.PRIMITIVE_DEFS[kind];
      const local = matrix([3.25, -1.5, 8.75], [0.35, -0.8, 1.1], [2.5, 0.3, 1.75]);
      const transforms = [new Matrix4(), matrix(def.position, def.rotation, def.scale), local,
        matrix([-2, 4, 0.5], [-0.45, 0.7, -0.2], [1.5, 3, 0.25]).multiply(local),
        matrix([2, -1, 3], [0.2, -0.1, 0.8], [-1.5, 2, 0.5])];
      for (const transform of transforms) {
        const rawBounds = new Box3(), meshBounds = new Box3();
        for (let index = 0; index < attribute.count; index += 1) {
          const source = new Vector3(attribute.getX(index), attribute.getY(index), attribute.getZ(index)).applyMatrix4(transform);
          const vertex = value.mesh.vertices[value.sourceVertexToMeshVertex[index]];
          expect(vertex).toBeDefined();
          if (!vertex) throw new Error("원본 정점 대응이 필요합니다.");
          const target = new Vector3(vertex.position.x, vertex.position.y, vertex.position.z).applyMatrix4(transform);
          expect(source.distanceTo(target)).toBeLessThan(1e-12);
          rawBounds.expandByPoint(source); meshBounds.expandByPoint(target);
        }
        expect(rawBounds.min.distanceTo(meshBounds.min)).toBeLessThan(1e-12);
        expect(rawBounds.max.distanceTo(meshBounds.max)).toBeLessThan(1e-12);
      }
    } finally { raw.dispose(); }
  });

  it("box는 실제12개 source triangle을 원본8정점의6개 평면으로 병합한다", () => {
    const value = converted("box");
    expect(value.mesh.faces).toHaveLength(6);
    expect(value.mesh.faces.every((face) => !face.smooth)).toBe(true);
    expect(value.faceSources).toEqual(Array.from({ length: 6 }, (_, faceId) => ({ faceId, sourceTriangleIds: [faceId * 2, faceId * 2 + 1] })));
    const loops = readStudioMeshFaceLoops(value.mesh);
    expect(loops).toHaveLength(6);
    const normals: string[] = [];
    for (const loop of loops ?? []) {
      expect(loop.vertexIds).toHaveLength(4);
      const points = loop.vertexIds.map((id) => value.mesh.vertices[id].position);
      const a = new Vector3(points[0].x, points[0].y, points[0].z);
      const b = new Vector3(points[1].x, points[1].y, points[1].z);
      const c = new Vector3(points[2].x, points[2].y, points[2].z);
      normals.push(b.sub(a).cross(c.sub(a)).normalize().toArray().join(","));
    }
    expect(new Set(normals).size).toBe(6);
    const integrity = analyzeStudioEditableMeshIntegrity(value.mesh);
    expect(integrity.totalArea).toBeCloseTo(6, 12);
    expect(integrity.signedVolume).toBeCloseTo(1, 12);
  });

  it.each(CASES.filter(({ kind }) => kind !== "box"))("$kind 삼각형 방향과 source triangle ID를 factory 뒤에도 보존한다", ({ kind }) => {
    const raw = primitives.makeGeometry(kind);
    try {
      const value = converted(kind), loops = readStudioMeshFaceLoops(value.mesh);
      expect(loops).not.toBeNull();
      if (!loops) throw new Error("면 루프가 필요합니다.");
      for (const loop of loops) {
        const sourceId = value.faceSources[loop.id].sourceTriangleIds[0];
        const sourceIndices = [0, 1, 2].map((corner) => raw.index?.getX(sourceId * 3 + corner) ?? sourceId * 3 + corner);
        const expected = sourceIndices.map((id) => value.sourceVertexToMeshVertex[id]);
        expect([0, 1, 2].some((start) => loop.vertexIds.every((vertex, corner) => vertex === expected[(start + corner) % 3]))).toBe(true);
      }
    } finally { raw.dispose(); }
  });

  it("capsule은 원본 극점의 퇴화32개를 명시해 원자적으로 거부한다", () => {
    const result = convertStudioBg3dPrimitiveToEditableMesh({ id: "capsule-source", kind: "capsule" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("capsule은 퇴화 진단이 필요합니다.");
    expect(result.code).toBe("degenerate-source-geometry");
    expect(result.degenerateTriangles).toHaveLength(32);
    expect(result.degenerateTriangles[0]).toMatchObject({ sourceTriangleId: 0, sourceVertexIndices: [0, 1, 17], areaBeforeWeld: 0, areaAfterWeld: 0 });
    expect(Math.max(...result.degenerateTriangles.map((triangle) => triangle.areaBeforeWeld))).toBeLessThan(1e-18);
    expect(result).not.toHaveProperty("value");
  });

  it.each(["box", "capsule"] satisfies readonly BgPrimitiveKind[])("$kind 성공/실패 모두 입력·원본 버퍼를 바꾸지 않고 geometry를 정리한다", (kind) => {
    const original = primitives.makeGeometry;
    const captured: Array<{ readonly geometry: BufferGeometry; readonly snapshot: string; disposed: number }> = [];
    vi.spyOn(primitives, "makeGeometry").mockImplementation((nextKind) => {
      const geometry = original(nextKind);
      const entry = { geometry, snapshot: JSON.stringify(geometry.toJSON()), disposed: 0 };
      geometry.addEventListener("dispose", () => { entry.disposed += 1; });
      captured.push(entry);
      return geometry;
    });
    const input = Object.freeze({ id: "same-node-id", kind, position: Object.freeze([3, 4, 5]), rotation: Object.freeze([0.2, 0.3, 0.4]), scale: Object.freeze([1, 2, 3]), color: "#c9a876" });
    const before = JSON.stringify(input);
    const result = convertStudioBg3dPrimitiveToEditableMesh(input);
    expect(result.ok).toBe(kind === "box");
    expect(JSON.stringify(input)).toBe(before);
    expect(captured).toHaveLength(1);
    expect(captured[0].disposed).toBe(1);
    expect(JSON.stringify(captured[0].geometry.toJSON())).toBe(captured[0].snapshot);
  });

  it.each([null, undefined, {}, [], { id: "", kind: "box" }, { id: "x", kind: "cube" }, { id: "x".repeat(161), kind: "box" }])("잘못된 primitive 입력 %j를 거부한다", (input) => {
    expect(convertStudioBg3dPrimitiveToEditableMesh(input)).toMatchObject({ ok: false, code: "invalid-primitive" });
  });

  it.each(["index", "budget", "orientation", "non-manifold", "position-nonfinite", "normal-zero", "partial-triangle"])("손상 source %s를 명시 거부하고 dispose한다", (mode) => {
    const geometry = primitives.makeGeometry("box");
    const sourceIndices = Array.from(geometry.index?.array ?? []);
    if (mode === "index") geometry.setIndex([999, 1, 2]);
    if (mode === "budget") for (const name of ["position", "normal"]) Object.defineProperty(geometry.getAttribute(name), "count", { value: 250_001 });
    if (mode === "orientation") geometry.setIndex([sourceIndices[0], sourceIndices[2], sourceIndices[1], ...sourceIndices.slice(3)]);
    if (mode === "non-manifold") geometry.setIndex([...sourceIndices, ...sourceIndices.slice(0, 3)]);
    if (mode === "position-nonfinite") geometry.getAttribute("position").setX(0, Infinity);
    if (mode === "normal-zero") geometry.getAttribute("normal").setXYZ(0, 0, 0, 0);
    if (mode === "partial-triangle") geometry.setIndex(sourceIndices.slice(1));
    const dispose = vi.spyOn(geometry, "dispose");
    vi.spyOn(primitives, "makeGeometry").mockReturnValue(geometry);
    const result = convertStudioBg3dPrimitiveToEditableMesh({ id: "box", kind: "box" });
    const codes: Record<string, string> = { index: "invalid-source-geometry", budget: "source-geometry-budget-exceeded", orientation: "orientation-conflict", "non-manifold": "non-manifold-source-geometry", "position-nonfinite": "invalid-source-geometry", "normal-zero": "invalid-source-geometry", "partial-triangle": "invalid-source-geometry" };
    expect(result).toMatchObject({ ok: false, code: codes[mode] });
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("geometry 생성 예외를 부분 결과 없이 반환한다", () => {
    vi.spyOn(primitives, "makeGeometry").mockImplementation(() => { throw new Error("factory failure"); });
    expect(convertStudioBg3dPrimitiveToEditableMesh({ id: "box", kind: "box" })).toMatchObject({ ok: false, code: "conversion-failed", degenerateTriangles: [] });
  });
});
