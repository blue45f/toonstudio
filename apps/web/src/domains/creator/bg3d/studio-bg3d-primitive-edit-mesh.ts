/** 실제 primitive의 object-local 형상을 편집 권위 메시로 옮긴다. TRS·재질·UV 전송은 별도 계약이다. */
import type { BufferGeometry } from "three";

import { PRIMITIVE_DEFS, makeGeometry } from "../studio-background-3d-primitives";
import {
  createStudioEditableMeshFromPolygons,
  STUDIO_EDITABLE_MESH_LIMITS,
  type StudioEditableMesh,
  type StudioMeshVec3,
} from "../studio-editable-half-edge-mesh";
import {
  analyzeStudioEditableMeshIntegrity,
  STUDIO_FACE_MODELING_LIMITS,
} from "../hybrid-dcc/studio-hybrid-dcc-face-modeling-mesh";

import type { BgPrimitive, BgPrimitiveKind } from "../studio-background-3d-metadata";
import type { StudioBg3dVec3 } from "./studio-bg3d-scene-document-types";

export type StudioBg3dPrimitiveEditMeshSource = Readonly<Pick<BgPrimitive, "id" | "kind">>;
export type StudioBg3dPrimitiveEditMeshFailureCode =
  | "invalid-primitive"
  | "source-geometry-budget-exceeded"
  | "invalid-source-geometry"
  | "degenerate-source-geometry"
  | "non-manifold-source-geometry"
  | "orientation-conflict"
  | "mesh-validation-failed"
  | "conversion-failed";

export interface StudioBg3dPrimitiveEditFaceSource {
  readonly faceId: number;
  /** makeGeometry의 원본 인덱스 스트림에서 삼각형의 순번이다. */
  readonly sourceTriangleIds: readonly number[];
}
export interface StudioBg3dPrimitiveEditDegenerateTriangle {
  readonly sourceTriangleId: number;
  readonly sourceVertexIndices: readonly [number, number, number];
  readonly areaBeforeWeld: number;
  readonly areaAfterWeld: number;
}
export interface StudioBg3dPrimitiveEditMeshValue {
  readonly sourcePrimitiveId: string;
  readonly primitiveKind: BgPrimitiveKind;
  readonly mesh: StudioEditableMesh;
  readonly faceSources: readonly StudioBg3dPrimitiveEditFaceSource[];
  readonly sourceVertexCount: number;
  readonly sourceTriangleCount: number;
  readonly sourceBounds: { readonly min: StudioBg3dVec3; readonly max: StudioBg3dVec3 };
  readonly sourceVertexToMeshVertex: readonly number[];
  readonly welding: { readonly tolerance: number; readonly maxDisplacement: number; readonly mergedVertexCount: number };
  readonly closed: boolean;
  readonly boundaryHalfEdges: number;
}
export type StudioBg3dPrimitiveEditMeshResult =
  | { readonly ok: true; readonly value: StudioBg3dPrimitiveEditMeshValue }
  | { readonly ok: false; readonly code: StudioBg3dPrimitiveEditMeshFailureCode; readonly detail: string; readonly degenerateTriangles: readonly StudioBg3dPrimitiveEditDegenerateTriangle[] };

const DETAILS: Record<StudioBg3dPrimitiveEditMeshFailureCode, string> = {
  "invalid-primitive": "A bounded primitive id and supported primitive kind are required.",
  "source-geometry-budget-exceeded": "Source geometry exceeds the editable-mesh budget.",
  "invalid-source-geometry": "Source geometry has invalid position, normal, or triangle data.",
  "degenerate-source-geometry": "Source triangles are degenerate; no triangle was silently removed.",
  "non-manifold-source-geometry": "Source geometry contains a non-manifold edge.",
  "orientation-conflict": "Source triangle orientation is inconsistent.",
  "mesh-validation-failed": "The complete editable mesh did not retain valid source geometry.",
  "conversion-failed": "Primitive geometry could not be converted safely.",
};
class ConversionFailure extends Error {
  constructor(readonly code: StudioBg3dPrimitiveEditMeshFailureCode, readonly triangles: readonly StudioBg3dPrimitiveEditDegenerateTriangle[] = []) {
    super(DETAILS[code]);
  }
}
type Triangle = readonly [number, number, number];
interface GeometrySource {
  readonly positions: readonly StudioMeshVec3[];
  readonly normals: readonly StudioMeshVec3[];
  readonly triangles: readonly Triangle[];
  readonly bounds: StudioBg3dPrimitiveEditMeshValue["sourceBounds"];
  readonly extent: number;
}
interface WeldedSource {
  readonly positions: readonly StudioMeshVec3[];
  readonly triangles: readonly Triangle[];
  readonly sourceVertexToMeshVertex: readonly number[];
  readonly tolerance: number;
  readonly maxDisplacement: number;
}

function readPrimitive(value: unknown): StudioBg3dPrimitiveEditMeshSource | null {
  if (!value || typeof value !== "object" || !("id" in value) || !("kind" in value)) return null;
  const { id, kind } = value;
  if (typeof id !== "string" || id.length === 0 || id.length > 160
    || [...id].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return null;
  if (!isPrimitiveKind(kind)) return null;
  return { id, kind };
}
function isPrimitiveKind(value: unknown): value is BgPrimitiveKind {
  return typeof value === "string" && Object.hasOwn(PRIMITIVE_DEFS, value);
}
function finite(point: StudioMeshVec3): boolean { return [point.x, point.y, point.z].every(Number.isFinite); }
function distance(a: StudioMeshVec3, b: StudioMeshVec3): number { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
function cross(a: StudioMeshVec3, b: StudioMeshVec3, c: StudioMeshVec3): StudioMeshVec3 {
  const bx = b.x - a.x, by = b.y - a.y, bz = b.z - a.z;
  const cx = c.x - a.x, cy = c.y - a.y, cz = c.z - a.z;
  return { x: by * cz - bz * cy, y: bz * cx - bx * cz, z: bx * cy - by * cx };
}
function dot(a: StudioMeshVec3, b: StudioMeshVec3): number { return a.x * b.x + a.y * b.y + a.z * b.z; }
function normal(positions: readonly StudioMeshVec3[], triangle: Triangle): StudioMeshVec3 {
  const n = cross(positions[triangle[0]], positions[triangle[1]], positions[triangle[2]]);
  const length = Math.hypot(n.x, n.y, n.z);
  return { x: n.x / length, y: n.y / length, z: n.z / length };
}
function area(positions: readonly StudioMeshVec3[], triangle: Triangle): number {
  const n = cross(positions[triangle[0]], positions[triangle[1]], positions[triangle[2]]);
  return Math.hypot(n.x, n.y, n.z) / 2;
}
function bounds(positions: readonly StudioMeshVec3[]): StudioBg3dPrimitiveEditMeshValue["sourceBounds"] {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const p of positions) {
    min[0] = Math.min(min[0], p.x); min[1] = Math.min(min[1], p.y); min[2] = Math.min(min[2], p.z);
    max[0] = Math.max(max[0], p.x); max[1] = Math.max(max[1], p.y); max[2] = Math.max(max[2], p.z);
  }
  return { min, max };
}
function readGeometry(geometry: BufferGeometry): GeometrySource {
  const position = geometry.getAttribute("position"), normalAttribute = geometry.getAttribute("normal");
  const count = position?.count;
  const elementCount = geometry.index?.count ?? count;
  if (!position || position.itemSize !== 3 || !Number.isSafeInteger(count) || count <= 0
    || !normalAttribute || normalAttribute.itemSize !== 3 || normalAttribute.count !== count
    || !Number.isSafeInteger(elementCount) || elementCount <= 0 || elementCount % 3 !== 0) throw new ConversionFailure("invalid-source-geometry");
  if (count > STUDIO_EDITABLE_MESH_LIMITS.maxVertices || elementCount / 3 > STUDIO_FACE_MODELING_LIMITS.maxMeshFaces) throw new ConversionFailure("source-geometry-budget-exceeded");
  const positions: StudioMeshVec3[] = [], normals: StudioMeshVec3[] = [], triangles: Triangle[] = [];
  for (let index = 0; index < count; index += 1) {
    const point = { x: position.getX(index), y: position.getY(index), z: position.getZ(index) };
    const n = { x: normalAttribute.getX(index), y: normalAttribute.getY(index), z: normalAttribute.getZ(index) };
    if (!finite(point) || !finite(n) || Math.hypot(n.x, n.y, n.z) === 0) throw new ConversionFailure("invalid-source-geometry");
    positions.push(point); normals.push(n);
  }
  for (let offset = 0; offset < elementCount; offset += 3) {
    const a = geometry.index?.getX(offset) ?? offset;
    const b = geometry.index?.getX(offset + 1) ?? offset + 1;
    const c = geometry.index?.getX(offset + 2) ?? offset + 2;
    if (![a, b, c].every((index) => Number.isSafeInteger(index) && index >= 0 && index < count)) throw new ConversionFailure("invalid-source-geometry");
    triangles.push([a, b, c]);
  }
  const box = bounds(positions);
  const extent = Math.max(...box.max.map((value, index) => value - box.min[index]));
  if (!Number.isFinite(extent) || extent <= 0) throw new ConversionFailure("invalid-source-geometry");
  return { positions, normals, triangles, bounds: box, extent };
}

/** 27칸의 거리 검증 후 가장 앞선 원본 정점을 대표로 쓴다. 좌표 평균·양자화는 하지 않는다. */
function weld(source: GeometrySource): WeldedSource {
  const tolerance = source.extent * 1e-7;
  const buckets = new Map<string, number[]>(), positions: StudioMeshVec3[] = [], mapping: number[] = [];
  const key = (x: number, y: number, z: number) => `${x}:${y}:${z}`;
  let maxDisplacement = 0;
  for (const point of source.positions) {
    const cell = [Math.floor(point.x / tolerance), Math.floor(point.y / tolerance), Math.floor(point.z / tolerance)];
    let chosen: number | undefined;
    for (let x = -1; x <= 1; x += 1) for (let y = -1; y <= 1; y += 1) for (let z = -1; z <= 1; z += 1) {
      for (const candidate of buckets.get(key(cell[0] + x, cell[1] + y, cell[2] + z)) ?? []) {
        if ((chosen === undefined || candidate < chosen) && distance(point, positions[candidate]) <= tolerance) chosen = candidate;
      }
    }
    if (chosen === undefined) {
      chosen = positions.length;
      positions.push({ ...point });
      const cellKey = key(cell[0], cell[1], cell[2]), bucket = buckets.get(cellKey) ?? [];
      bucket.push(chosen); buckets.set(cellKey, bucket);
    }
    maxDisplacement = Math.max(maxDisplacement, distance(point, positions[chosen]));
    mapping.push(chosen);
  }
  const triangles: Triangle[] = [], degenerates: StudioBg3dPrimitiveEditDegenerateTriangle[] = [];
  for (const [id, triangle] of source.triangles.entries()) {
    const mapped: Triangle = [mapping[triangle[0]], mapping[triangle[1]], mapping[triangle[2]]];
    const areaAfterWeld = area(positions, mapped);
    if (new Set(mapped).size !== 3 || areaAfterWeld <= source.extent ** 2 * 1e-12) {
      degenerates.push({ sourceTriangleId: id, sourceVertexIndices: triangle, areaBeforeWeld: area(source.positions, triangle), areaAfterWeld });
      continue;
    }
    const n = normal(positions, mapped), a = source.normals[triangle[0]], b = source.normals[triangle[1]], c = source.normals[triangle[2]];
    if (dot(n, { x: a.x + b.x + c.x, y: a.y + b.y + c.y, z: a.z + b.z + c.z }) <= 0) throw new ConversionFailure("orientation-conflict");
    triangles.push(mapped);
  }
  if (degenerates.length > 0) throw new ConversionFailure("degenerate-source-geometry", degenerates);
  return { positions, triangles, sourceVertexToMeshVertex: mapping, tolerance, maxDisplacement };
}
function edgeKey(a: number, b: number): string { return a < b ? `${a}:${b}` : `${b}:${a}`; }
function triangleEdges(triangles: readonly Triangle[]): ReadonlyMap<string, readonly number[]> {
  const edges = new Map<string, number[]>();
  const directions = new Set<string>();
  for (const [id, face] of triangles.entries()) for (let index = 0; index < 3; index += 1) {
    const a = face[index], b = face[(index + 1) % 3], key = edgeKey(a, b), direction = `${a}:${b}`;
    const adjacent = edges.get(key) ?? [];
    if (adjacent.length >= 2) throw new ConversionFailure("non-manifold-source-geometry");
    if (directions.has(direction)) throw new ConversionFailure("orientation-conflict");
    adjacent.push(id); edges.set(key, adjacent); directions.add(direction);
  }
  return edges;
}
interface FacePlan { readonly loops: readonly (readonly number[])[]; readonly sources: readonly StudioBg3dPrimitiveEditFaceSource[] }
function boxFaces(source: WeldedSource, extent: number, edges: ReadonlyMap<string, readonly number[]>): FacePlan {
  if (source.triangles.length !== 12) throw new ConversionFailure("mesh-validation-failed");
  const normals = source.triangles.map((triangle) => normal(source.positions, triangle));
  const offsets = source.triangles.map((face, id) => dot(normals[id], source.positions[face[0]]));
  const neighbors: number[][] = source.triangles.map(() => []);
  for (const ids of edges.values()) {
    if (ids.length !== 2) continue;
    const [a, b] = ids;
    if (dot(normals[a], normals[b]) >= 1 - 1e-12 && Math.abs(offsets[a] - offsets[b]) <= extent * 1e-9) {
      neighbors[a].push(b); neighbors[b].push(a);
    }
  }
  const visited = new Set<number>(), loops: number[][] = [], sources: StudioBg3dPrimitiveEditFaceSource[] = [];
  for (let seed = 0; seed < source.triangles.length; seed += 1) {
    if (visited.has(seed)) continue;
    const group: number[] = [], queue = [seed]; visited.add(seed);
    while (queue.length > 0) {
      const id = queue.shift();
      if (id === undefined) throw new ConversionFailure("mesh-validation-failed");
      group.push(id);
      for (const other of neighbors[id]) if (!visited.has(other)) { visited.add(other); queue.push(other); }
    }
    const groupSet = new Set(group), next = new Map<number, number>();
    for (const id of group) for (let index = 0; index < 3; index += 1) {
      const a = source.triangles[id][index], b = source.triangles[id][(index + 1) % 3];
      if ((edges.get(edgeKey(a, b)) ?? []).some((other) => other !== id && groupSet.has(other))) continue;
      if (next.has(a)) throw new ConversionFailure("mesh-validation-failed");
      next.set(a, b);
    }
    const start = Math.min(...next.keys()), loop: number[] = []; let current = start;
    do {
      loop.push(current);
      const destination = next.get(current);
      if (destination === undefined || loop.length > next.size) throw new ConversionFailure("mesh-validation-failed");
      current = destination;
    } while (current !== start);
    if (loop.length !== 4 || next.size !== 4 || group.length !== 2) throw new ConversionFailure("mesh-validation-failed");
    sources.push({ faceId: loops.length, sourceTriangleIds: group.sort((a, b) => a - b) }); loops.push(loop);
  }
  if (loops.length !== 6) throw new ConversionFailure("mesh-validation-failed");
  return { loops, sources };
}

/** 입력 primitive는 읽기만 하고, 새로 만든 source geometry는 성공·실패 모두 dispose한다. */
export function convertStudioBg3dPrimitiveToEditableMesh(primitive: unknown): StudioBg3dPrimitiveEditMeshResult {
  let geometry: BufferGeometry | null = null;
  try {
    const input = readPrimitive(primitive);
    if (!input) throw new ConversionFailure("invalid-primitive");
    geometry = makeGeometry(input.kind);
    const original = readGeometry(geometry), converted = weld(original);
    const edges = triangleEdges(converted.triangles);
    const faces = input.kind === "box" ? boxFaces(converted, original.extent, edges) : {
      loops: converted.triangles,
      sources: converted.triangles.map((_, id) => ({ faceId: id, sourceTriangleIds: [id] })),
    };
    const created = createStudioEditableMeshFromPolygons(converted.positions, faces.loops);
    const mesh = input.kind === "box" ? { ...created, faces: created.faces.map((face) => ({ ...face, smooth: false })) } : created;
    const integrity = analyzeStudioEditableMeshIntegrity(mesh, { renderableFaces: "all" });
    if (!integrity.canonical || integrity.nonManifoldEdges > 0 || integrity.orientationConflicts > 0 || integrity.bowTieVertices > 0
      || integrity.isolatedVertexCount > 0 || integrity.zeroAreaFaces.length > 0 || integrity.nonPlanarFaces.length > 0
      || integrity.nonConvexFaces.length > 0 || integrity.duplicateVertexFaces.length > 0 || integrity.unrenderableFaces.length > 0) throw new ConversionFailure("mesh-validation-failed");
    return { ok: true, value: {
      sourcePrimitiveId: input.id, primitiveKind: input.kind, mesh, faceSources: faces.sources,
      sourceVertexCount: original.positions.length, sourceTriangleCount: original.triangles.length, sourceBounds: original.bounds,
      sourceVertexToMeshVertex: converted.sourceVertexToMeshVertex,
      welding: { tolerance: converted.tolerance, maxDisplacement: converted.maxDisplacement, mergedVertexCount: original.positions.length - converted.positions.length },
      closed: integrity.closed, boundaryHalfEdges: integrity.boundaryHalfEdges,
    } };
  } catch (error) {
    const code = error instanceof ConversionFailure ? error.code : "conversion-failed";
    return { ok: false, code, detail: DETAILS[code], degenerateTriangles: error instanceof ConversionFailure ? error.triangles : [] };
  } finally {
    geometry?.dispose();
  }
}
