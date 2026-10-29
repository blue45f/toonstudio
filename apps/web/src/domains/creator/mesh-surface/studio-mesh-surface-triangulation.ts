/** 기존 GLB의 투영·epsilon·ear 선택 순서를 보존한다. */
import { STUDIO_EDITABLE_MESH_LIMITS } from "../studio-editable-half-edge-mesh";
import type { StudioEditableFace, StudioEditableVertex, StudioMeshVec3 } from "../studio-editable-half-edge-mesh";
import { surfaceIssue as issue, surfacePass as pass, surfaceStop as stop, type StudioMeshSurfaceResult as InternalResult, type StudioMeshSurfaceValidatedFace as ValidatedFace, type StudioMeshSurfaceIssue as StudioHybridDccGlbIssue, type StudioMeshSurfaceBudget } from "./studio-mesh-surface-contracts";
import { canonicalStudioHybridDccFaceLoop, triangulateStudioHybridDccRenderQuad } from "./studio-mesh-surface-face";
import { StudioMeshSurfaceWorkMeter, surfaceBudgetFailure } from "./studio-mesh-surface-work";

const PLANAR_EPSILON=1e-6, GEOMETRY_EPSILON=1e-12;
interface Vec2 {readonly x:number;readonly y:number}
export function minimumNumber(values: Iterable<number>): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (const value of values) minimum = Math.min(minimum, value);
  return minimum;
}

export function sub(a: StudioMeshVec3, b: StudioMeshVec3): StudioMeshVec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: StudioMeshVec3, b: StudioMeshVec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function length3(value: StudioMeshVec3): number {
  return Math.hypot(value.x, value.y, value.z);
}

export function normalized(value: StudioMeshVec3): StudioMeshVec3 | null {
  const magnitude = length3(value);
  if (!Number.isFinite(magnitude) || magnitude <= GEOMETRY_EPSILON) return null;
  return { x: value.x / magnitude, y: value.y / magnitude, z: value.z / magnitude };
}

export function newellNormal(points: readonly StudioMeshVec3[]): StudioMeshVec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    x += (current.y - next.y) * (current.z + next.z);
    y += (current.z - next.z) * (current.x + next.x);
    z += (current.x - next.x) * (current.y + next.y);
  }
  return { x, y, z };
}

function dominantProjection(normal: StudioMeshVec3, point: StudioMeshVec3): Vec2 {
  const ax = Math.abs(normal.x);
  const ay = Math.abs(normal.y);
  const az = Math.abs(normal.z);
  if (ax >= ay && ax >= az) return { x: point.y, y: point.z };
  if (ay >= ax && ay >= az) return { x: point.z, y: point.x };
  return { x: point.x, y: point.y };
}

function orient2d(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function signedArea2d(points: readonly Vec2[]): number {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return twiceArea / 2;
}

function onSegment(a: Vec2, b: Vec2, point: Vec2, epsilon: number): boolean {
  return (
    Math.abs(orient2d(a, b, point)) <= epsilon &&
    point.x >= Math.min(a.x, b.x) - epsilon &&
    point.x <= Math.max(a.x, b.x) + epsilon &&
    point.y >= Math.min(a.y, b.y) - epsilon &&
    point.y <= Math.max(a.y, b.y) + epsilon
  );
}

function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2, epsilon: number): boolean {
  const abC = orient2d(a, b, c);
  const abD = orient2d(a, b, d);
  const cdA = orient2d(c, d, a);
  const cdB = orient2d(c, d, b);
  if (
    ((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon)) &&
    ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon))
  ) {
    return true;
  }
  return (
    onSegment(a, b, c, epsilon) ||
    onSegment(a, b, d, epsilon) ||
    onSegment(c, d, a, epsilon) ||
    onSegment(c, d, b, epsilon)
  );
}

function polygonSelfIntersects(points: readonly Vec2[], epsilon: number): boolean {
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      if (
        first === second ||
        firstNext === second ||
        secondNext === first
      ) {
        continue;
      }
      if (
        segmentsIntersect(
          points[first]!,
          points[firstNext]!,
          points[second]!,
          points[secondNext]!,
          epsilon,
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

function pointInsideTriangle(
  point: Vec2,
  a: Vec2,
  b: Vec2,
  c: Vec2,
  winding: 1 | -1,
  epsilon: number,
): boolean {
  return (
    orient2d(a, b, point) * winding >= -epsilon &&
    orient2d(b, c, point) * winding >= -epsilon &&
    orient2d(c, a, point) * winding >= -epsilon
  );
}

function triangulateSimplePolygon(
  faceId: number,
  vertexIds: readonly number[],
  points: readonly Vec2[],
  epsilon: number,
  meter: StudioMeshSurfaceWorkMeter,
): InternalResult<readonly (readonly [number, number, number])[]> {
  const winding: 1 | -1 = signedArea2d(points) >= 0 ? 1 : -1;
  const remaining = vertexIds.map((_, index) => index);
  const triangles: Array<readonly [number, number, number]> = [];
  let guard = 0;
  while (remaining.length > 3) {
    let earIndex = -1;
    for (let cursor = 0; cursor < remaining.length; cursor += 1) {
      meter.charge("earTests", 1);
      const previousIndex = remaining[(cursor + remaining.length - 1) % remaining.length]!;
      const currentIndex = remaining[cursor]!;
      const nextIndex = remaining[(cursor + 1) % remaining.length]!;
      const a = points[previousIndex]!;
      const b = points[currentIndex]!;
      const c = points[nextIndex]!;
      if (orient2d(a, b, c) * winding <= epsilon) continue;
      let containsOther = false;
      for (const candidateIndex of remaining) {
        if (
          candidateIndex === previousIndex ||
          candidateIndex === currentIndex ||
          candidateIndex === nextIndex
        ) {
          continue;
        }
        meter.charge("earTests", 1);
        if (pointInsideTriangle(points[candidateIndex]!, a, b, c, winding, epsilon)) {
          containsOther = true;
          break;
        }
      }
      if (!containsOther) {
        earIndex = cursor;
        triangles.push([
          vertexIds[previousIndex]!,
          vertexIds[currentIndex]!,
          vertexIds[nextIndex]!,
        ]);
        break;
      }
    }
    if (earIndex < 0) {
      return stop(
        issue("error", "triangulation-failed", `Face ${faceId} has no deterministic ear`, {
          faceIds: [faceId],
          vertexIds,
        }),
      );
    }
    remaining.splice(earIndex, 1);
    guard += 1;
    if (guard > vertexIds.length) {
      return stop(
        issue("error", "triangulation-failed", `Face ${faceId} exceeded triangulation guard`, {
          faceIds: [faceId],
        }),
      );
    }
  }
  triangles.push([
    vertexIds[remaining[0]!]!,
    vertexIds[remaining[1]!]!,
    vertexIds[remaining[2]!]!,
  ]);
  return pass(triangles);
}

function faceProjectionScale(points: readonly Vec2[]): number {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return Math.max(Math.hypot(maxX - minX, maxY - minY), 1);
}

function prepareFaceWithMeter(
  face: StudioEditableFace,
  halfEdgeIdsInput: readonly number[],
  vertexIdsInput: readonly number[],
  vertexById: ReadonlyMap<number, StudioEditableVertex>,
  preserveCorners: boolean,
  meter: StudioMeshSurfaceWorkMeter,
): InternalResult<{ readonly face: ValidatedFace; readonly warnings: readonly StudioHybridDccGlbIssue[] }> {
  const { halfEdgeIds, vertexIds } = canonicalStudioHybridDccFaceLoop(vertexIdsInput, halfEdgeIdsInput);
  const points3d = vertexIds.map((id) => vertexById.get(id)!.position);
  const rawNormal = newellNormal(points3d);
  const normal = normalized(rawNormal);
  let extent = 1;
  for (const point of points3d) {
    extent = Math.max(extent, length3(sub(point, points3d[0]!)));
  }
  if (!normal || length3(rawNormal) <= Math.max(STUDIO_EDITABLE_MESH_LIMITS.areaEpsilon, extent * extent * GEOMETRY_EPSILON)) {
    return stop(
      issue("error", "face-zero-area", `Face ${face.id} has zero or unstable area`, {
        faceIds: [face.id],
        vertexIds,
      }),
    );
  }
  const planeOrigin = points3d[0]!;
  const warped = points3d.some((point) => Math.abs(dot(sub(point, planeOrigin), normal)) > PLANAR_EPSILON * extent);
  let quadTriangles: readonly (readonly [number, number, number])[] | null = null;
  if (warped) {
    try {
      quadTriangles = triangulateStudioHybridDccRenderQuad(vertexIdsInput, vertexIdsInput.map((id) => {
        const point = vertexById.get(id)!.position;
        return [point.x, point.y, point.z];
      }), face.id);
    } catch {
      return stop(
        issue("error", "face-non-planar", `Face ${face.id} has no verified non-planar quad projection`, {
          faceIds: [face.id],
          vertexIds,
        }),
      );
    }
  }

  const projected = points3d.map((point) => dominantProjection(normal, point));
  const projectionScale = faceProjectionScale(projected);
  const epsilon = GEOMETRY_EPSILON * projectionScale * projectionScale;
  const retained = vertexIds.map((_, index) => index);
  const omitted: number[] = [];
  let changed = true;
  while (!warped && !preserveCorners && changed && retained.length > 3) {
    changed = false;
    for (let cursor = 0; cursor < retained.length; cursor += 1) {
      const previousIndex = retained[(cursor + retained.length - 1) % retained.length]!;
      const currentIndex = retained[cursor]!;
      const nextIndex = retained[(cursor + 1) % retained.length]!;
      const previous = projected[previousIndex]!;
      const current = projected[currentIndex]!;
      const next = projected[nextIndex]!;
      if (Math.abs(orient2d(previous, current, next)) > epsilon) continue;
      const incoming = { x: current.x - previous.x, y: current.y - previous.y };
      const outgoing = { x: next.x - current.x, y: next.y - current.y };
      if (incoming.x * outgoing.x + incoming.y * outgoing.y <= 0) {
        return stop(
          issue("error", "face-degenerate-corner", `Face ${face.id} backtracks at vertex ${vertexIds[currentIndex]}`, {
            faceIds: [face.id],
            vertexIds: [vertexIds[currentIndex]!],
          }),
        );
      }
      omitted.push(vertexIds[currentIndex]!);
      retained.splice(cursor, 1);
      changed = true;
      break;
    }
  }
  if (retained.length < 3) {
    return stop(
      issue("error", "face-zero-area", `Face ${face.id} collapses during triangulation`, {
        faceIds: [face.id],
      }),
    );
  }
  const triangulationVertexIds = retained.map((index) => vertexIds[index]!);
  const triangulationPoints = retained.map((index) => projected[index]!);
  if (Math.abs(signedArea2d(triangulationPoints)) <= epsilon) {
    return stop(
      issue("error", "face-zero-area", `Face ${face.id} has zero projected area`, {
        faceIds: [face.id],
      }),
    );
  }
  if (polygonSelfIntersects(triangulationPoints, epsilon)) {
    return stop(
      issue("error", "face-self-intersection", `Face ${face.id} self-intersects`, {
        faceIds: [face.id],
        vertexIds: triangulationVertexIds,
      }),
    );
  }
  const triangulated = quadTriangles ? pass(quadTriangles) : triangulateSimplePolygon(
    face.id,
    triangulationVertexIds,
    triangulationPoints,
    epsilon,
    meter,
  );
  if (!triangulated.ok) return triangulated;
  const warnings = omitted.length > 0
    ? [
        issue(
          "warning",
          "face-collinear-corner-omitted",
          `Face ${face.id} omitted ${omitted.length} collinear corner(s) from triangles`,
          { faceIds: [face.id], vertexIds: [...omitted].sort((a, b) => a - b) },
        ),
      ]
    : [];
  return pass({
    face: {
      face,
      halfEdgeIds,
      vertexIds,
      triangulationVertexIds,
      triangles: triangulated.value,
      rawNormal,
      normal,
      warped,
    },
    warnings,
  });
}


/** 단일 면의 기하 판정이다. 전체 half-edge 구조 검증은 validateStudioMeshSurface가 담당한다. */
export function prepareStudioMeshSurfaceFace(face:StudioEditableFace, halfEdgeIds:readonly number[], vertexIds:readonly number[], vertexById:ReadonlyMap<number,StudioEditableVertex>, preserveCorners:boolean, budget?:StudioMeshSurfaceBudget) {
 try {
  const meter=new StudioMeshSurfaceWorkMeter(budget);meter.checkFaces(1);meter.checkFaceCorners(vertexIds.length);
  meter.charge("linear",vertexIds.length);meter.charge("polygonPairs",vertexIds.length*vertexIds.length);
  const prepared=prepareFaceWithMeter(face,halfEdgeIds,vertexIds,vertexById,preserveCorners,meter);
  if(!prepared.ok)return prepared;
  meter.charge("triangles",prepared.value.face.triangles.length);
  return pass({...prepared.value,work:meter.snapshot()});
 }
 catch(error){return surfaceBudgetFailure(error);}
}
export { prepareFaceWithMeter };
