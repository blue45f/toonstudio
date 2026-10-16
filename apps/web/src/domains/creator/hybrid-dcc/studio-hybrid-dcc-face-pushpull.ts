/**
 * 면 밀기/당기기(Push/Pull) 커널: 부호 있는 거리로 선택한 면 영역을 법선 방향으로 움직인다.
 *
 * 두 가지 방식을 쓴다. 영역의 옆면이 모두 법선과 나란한 "기둥 벽"(박스의 옆면처럼 법선과 평행한 모서리로
 * 이어진 면)이면 영역의 꼭짓점을 옮겨 벽을 늘이거나 줄인다(stretch). 그러면 같은 면을 여러 번 밀고 당겨도
 * 모서리 고리가 쌓이지 않고, 박스 윗면을 안쪽으로 당겨도 옆면과 겹치는 이중 벽이 생기지 않는다.
 * 벽이 기둥 모양이 아니면 기존 영역 밀기(extrude, 영수증 포함)로 새 옆면을 만든다. 이때도 새 옆면이
 * 이웃 면과 같은 평면에서 겹치게 되는 방향은 거부한다.
 *
 * 범위 검증: 거리의 유한성·도구 범위, 벽이 사라지는 깊이(붕괴), 그리고 영역 꼭짓점·면 중심·모서리 중점에서
 * 움직이는 방향으로 쏜 광선이 다른 면에 닿기 전까지의 여유(관통)를 본다. 광선 표본은 보수적인
 * 근사라 모든 자기 교차를 잡지는 않으며, 얇은 장애물이 표본 사이로 빠질 수 있다.
 */

import {
  extrudeStudioEditableMeshFacesWithReceipt,
  type StudioEditableMesh,
  type StudioEditableMeshExtrudeRegionMutation,
  type StudioMeshVec3,
} from "../studio-editable-half-edge-mesh";

import { buildStudioPlanarFrame } from "./studio-hybrid-dcc-face-modeling-geometry";
import {
  failStudioFaceModeling,
  okStudioFaceModeling,
  preflightStudioFaceModelingMesh,
  STUDIO_FACE_MODELING_LIMITS,
  studioFaceCornerPositions,
  studioFaceModelingExtent,
  studioFaceModelingMinFeature,
  verifyStudioFaceModelingResult,
  type StudioFaceModelingOutcome,
  type StudioFaceModelingResult,
  type StudioMeshFaceLoop,
} from "./studio-hybrid-dcc-face-modeling-mesh";

export type StudioFacePushPullMethod = "extrude" | "stretch";

export interface StudioFacePushPullOutcome extends StudioFaceModelingOutcome {
  readonly method: StudioFacePushPullMethod;
  /** extrude 방식일 때 기존 영역 밀기 결과(영수증 포함). 문서 명령에 그대로 올린다. */
  readonly extrusion?: StudioEditableMeshExtrudeRegionMutation;
}

export interface StudioFacePushPullRange {
  readonly method: StudioFacePushPullMethod;
  /** 당길 수 있는 가장 큰 깊이(0 이하). 0이면 당길 수 없다. */
  readonly minDistance: number;
  /** 밀 수 있는 가장 큰 거리(0 이상). 0이면 밀 수 없다. */
  readonly maxDistance: number;
  /** 벽 때문에 제한되는지 광선 여유 때문에 제한되는지(안내 문구 선택에 쓴다). */
  readonly pullLimitedBy: "wall" | "clearance" | "tool" | "overlap";
  readonly pushLimitedBy: "wall" | "clearance" | "tool" | "overlap";
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface PushPullComponent {
  readonly faceIds: readonly number[];
  readonly normal: Vec3;
  readonly planar: boolean;
  readonly vertexIds: ReadonlySet<number>;
  /** 영역 경계 반변 (from, to, 이웃 면 ID 또는 -1). */
  readonly boundary: readonly { from: number; to: number; neighbor: number }[];
}

interface PushPullPlan {
  readonly components: readonly PushPullComponent[];
  readonly method: StudioFacePushPullMethod;
  /** stretch 일 때 벽이 허용하는 거리 구간. */
  readonly wallLow: number;
  readonly wallHigh: number;
  /** 움직이는 꼭짓점에 닿은 모든 면(사후 검증 대상). */
  readonly touchedFaceIds: ReadonlySet<number>;
  readonly loops: readonly StudioMeshFaceLoop[];
  readonly minFeature: number;
}

const PARALLEL_TOLERANCE = 1e-6;

function sub(a: StudioMeshVec3, b: StudioMeshVec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function norm(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

function undirectedKey(a: number, b: number, stride: number): number {
  return a < b ? a * stride + b : b * stride + a;
}

function analyzePlan(
  mesh: StudioEditableMesh,
  faceIds: readonly number[],
): StudioFaceModelingResult<PushPullPlan> {
  const preflight = preflightStudioFaceModelingMesh(mesh);
  if (!preflight.ok) return preflight;
  const loops = preflight.value;
  const loopById = new Map(loops.map((loop) => [loop.id, loop] as const));
  const unique = [...new Set(faceIds)].sort((left, right) => left - right);
  if (unique.length === 0) return failStudioFaceModeling("empty-selection", "no faces selected");
  if (unique.length > STUDIO_FACE_MODELING_LIMITS.maxSelectionFaces) {
    return failStudioFaceModeling("budget-exceeded", "too many faces selected");
  }
  for (const id of unique) {
    if (!loopById.has(id)) return failStudioFaceModeling("not-found", `face ${id} not found`, { elementIds: [id] });
  }
  const extent = studioFaceModelingExtent(mesh);
  const minFeature = studioFaceModelingMinFeature(extent);
  const stride = Math.max(1, mesh.vertices.length);
  const selected = new Set(unique);

  const facesByEdge = new Map<number, number[]>();
  const facesAtVertex = new Map<number, number[]>();
  for (const loop of loops) {
    for (let corner = 0; corner < loop.vertexIds.length; corner += 1) {
      const from = loop.vertexIds[corner]!;
      const to = loop.vertexIds[(corner + 1) % loop.vertexIds.length]!;
      const key = undirectedKey(from, to, stride);
      const list = facesByEdge.get(key);
      if (list) list.push(loop.id);
      else facesByEdge.set(key, [loop.id]);
      const atVertex = facesAtVertex.get(from);
      if (atVertex) atVertex.push(loop.id);
      else facesAtVertex.set(from, [loop.id]);
    }
  }

  // 선택한 면을 모서리로 이어진 영역(component)으로 묶는다.
  const seen = new Set<number>();
  const components: PushPullComponent[] = [];
  for (const seed of unique) {
    if (seen.has(seed)) continue;
    const stack = [seed];
    seen.add(seed);
    const members: number[] = [];
    while (stack.length > 0) {
      const id = stack.pop()!;
      members.push(id);
      const loop = loopById.get(id)!;
      for (let corner = 0; corner < loop.vertexIds.length; corner += 1) {
        const from = loop.vertexIds[corner]!;
        const to = loop.vertexIds[(corner + 1) % loop.vertexIds.length]!;
        for (const other of facesByEdge.get(undirectedKey(from, to, stride)) ?? []) {
          if (other !== id && selected.has(other) && !seen.has(other)) {
            seen.add(other);
            stack.push(other);
          }
        }
      }
    }
    members.sort((left, right) => left - right);
    const memberSet = new Set(members);
    let sum: Vec3 = { x: 0, y: 0, z: 0 };
    const normals: Vec3[] = [];
    const vertexIds = new Set<number>();
    const boundary: { from: number; to: number; neighbor: number }[] = [];
    for (const id of members) {
      const loop = loopById.get(id)!;
      const frame = buildStudioPlanarFrame(studioFaceCornerPositions(mesh, loop.vertexIds));
      if (!frame || !(frame.area > minFeature * minFeature)) {
        return failStudioFaceModeling("unsupported-face", `face ${id} has no usable area`, { elementIds: [id] });
      }
      sum = {
        x: sum.x + frame.normal.x * frame.area,
        y: sum.y + frame.normal.y * frame.area,
        z: sum.z + frame.normal.z * frame.area,
      };
      normals.push(frame.normal);
      for (let corner = 0; corner < loop.vertexIds.length; corner += 1) {
        const from = loop.vertexIds[corner]!;
        const to = loop.vertexIds[(corner + 1) % loop.vertexIds.length]!;
        vertexIds.add(from);
        const neighbor = (facesByEdge.get(undirectedKey(from, to, stride)) ?? []).find((other) => other !== id) ?? -1;
        if (neighbor < 0 || !memberSet.has(neighbor)) boundary.push({ from, to, neighbor });
      }
    }
    const length = norm(sum);
    if (!(length > 1e-300)) {
      return failStudioFaceModeling("degenerate-input", "selected region has no stable normal", { elementIds: members });
    }
    const normal = { x: sum.x / length, y: sum.y / length, z: sum.z / length };
    const planar = normals.every((candidate) => dot(candidate, normal) >= 1 - 1e-9);
    components.push({ faceIds: members, normal, planar, vertexIds, boundary });
  }

  // 한 점에서 맞닿은 서로 다른 영역은 같이 옮길 수 없다.
  const owner = new Map<number, number>();
  let sharedVertex = false;
  components.forEach((component, index) => {
    for (const id of component.vertexIds) {
      if (owner.has(id) && owner.get(id) !== index) sharedVertex = true;
      owner.set(id, index);
    }
  });

  let stretchable = !sharedVertex && components.every((component) => component.planar);
  let wallLow = Number.NEGATIVE_INFINITY;
  let wallHigh = Number.POSITIVE_INFINITY;
  if (stretchable) {
    for (const component of components) {
      const regionEdges = new Set<number>();
      for (const id of component.faceIds) {
        const loop = loopById.get(id)!;
        for (let corner = 0; corner < loop.vertexIds.length; corner += 1) {
          regionEdges.add(undirectedKey(loop.vertexIds[corner]!, loop.vertexIds[(corner + 1) % loop.vertexIds.length]!, stride));
        }
      }
      const boundaryVertices = new Set<number>();
      for (const edge of component.boundary) {
        boundaryVertices.add(edge.from);
        boundaryVertices.add(edge.to);
      }
      for (const vertex of boundaryVertices) {
        // 영역 바깥으로 오르내리는 모서리: 이 꼭짓점에서 나가지만 영역의 모서리가 아닌 것.
        const rising = new Set<number>();
        for (const faceId of facesAtVertex.get(vertex) ?? []) {
          const loop = loopById.get(faceId)!;
          const at = loop.vertexIds.indexOf(vertex);
          const count = loop.vertexIds.length;
          for (const other of [loop.vertexIds[(at + 1) % count]!, loop.vertexIds[(at + count - 1) % count]!]) {
            if (!regionEdges.has(undirectedKey(vertex, other, stride))) rising.add(other);
          }
        }
        if (rising.size !== 1) {
          stretchable = false;
          break;
        }
        const far = rising.values().next().value!;
        const direction = sub(mesh.vertices[far]!.position, mesh.vertices[vertex]!.position);
        const height = dot(direction, component.normal);
        const length = norm(direction);
        if (!(length > minFeature) || norm(cross(direction, component.normal)) > PARALLEL_TOLERANCE * length) {
          stretchable = false;
          break;
        }
        if (height < 0) wallLow = Math.max(wallLow, -(Math.abs(height) - minFeature));
        else wallHigh = Math.min(wallHigh, height - minFeature);
      }
      if (!stretchable) break;
    }
  }
  const touched = new Set<number>();
  for (const component of components) {
    for (const id of component.vertexIds) for (const faceId of facesAtVertex.get(id) ?? []) touched.add(faceId);
  }
  return okStudioFaceModeling({
    components,
    method: stretchable ? "stretch" : "extrude",
    wallLow: stretchable ? wallLow : Number.NEGATIVE_INFINITY,
    wallHigh: stretchable ? wallHigh : Number.POSITIVE_INFINITY,
    touchedFaceIds: touched,
    loops,
    minFeature,
  });
}

/**
 * extrude 방식에서 새 옆면이 이웃 면과 같은 평면에서 겹치게 되는지 본다.
 * 이웃 면이 움직이는 방향(법선)을 품고, 그 방향으로 영역 경계에서 이웃 면 안쪽으로 이어지면 새 벽이
 * 이웃 면 위에 포개진다(영역이 박스 윗면일 때 안쪽으로 당기는 경우).
 */
function wallsOverlapNeighbours(
  mesh: StudioEditableMesh,
  plan: PushPullPlan,
  sign: 1 | -1,
): boolean {
  const loopById = new Map(plan.loops.map((loop) => [loop.id, loop] as const));
  for (const component of plan.components) {
    for (const edge of component.boundary) {
      if (edge.neighbor < 0) continue;
      const neighbor = loopById.get(edge.neighbor)!;
      const points = studioFaceCornerPositions(mesh, neighbor.vertexIds);
      const frame = buildStudioPlanarFrame(points);
      if (!frame || Math.abs(dot(frame.normal, component.normal)) > PARALLEL_TOLERANCE) continue;
      const from = mesh.vertices[edge.from]!.position;
      const to = mesh.vertices[edge.to]!.position;
      const along = sub(to, from);
      const alongLength = norm(along);
      if (!(alongLength > 0)) continue;
      const unit = { x: along.x / alongLength, y: along.y / alongLength, z: along.z / alongLength };
      const midpoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, z: (from.z + to.z) / 2 };
      const centroid = {
        x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
        y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
        z: points.reduce((sum, point) => sum + point.z, 0) / points.length,
      };
      const toCentroid = sub(centroid, midpoint);
      const parallel = dot(toCentroid, unit);
      // 모서리에 수직이면서 이웃 면 안쪽을 향하는 방향.
      const inward = {
        x: toCentroid.x - unit.x * parallel,
        y: toCentroid.y - unit.y * parallel,
        z: toCentroid.z - unit.z * parallel,
      };
      const inwardLength = norm(inward);
      if (!(inwardLength > 0)) continue;
      if (sign * dot(component.normal, inward) / inwardLength > PARALLEL_TOLERANCE) return true;
    }
  }
  return false;
}

interface ClearanceTriangle {
  readonly a: Vec3;
  readonly b: Vec3;
  readonly c: Vec3;
}

function collectClearanceTriangles(
  mesh: StudioEditableMesh,
  plan: PushPullPlan,
): ClearanceTriangle[] {
  const triangles: ClearanceTriangle[] = [];
  for (const loop of plan.loops) {
    if (plan.touchedFaceIds.has(loop.id)) continue;
    const points = studioFaceCornerPositions(mesh, loop.vertexIds);
    for (let index = 1; index + 1 < points.length; index += 1) {
      triangles.push({ a: points[0]!, b: points[index]!, c: points[index + 1]! });
    }
  }
  return triangles;
}

/** 광선과 삼각형 교차 거리(Möller-Trumbore, 양면). 안 만나면 Infinity. */
function rayTriangleDistance(origin: Vec3, direction: Vec3, triangle: ClearanceTriangle): number {
  const edge1 = sub(triangle.b, triangle.a);
  const edge2 = sub(triangle.c, triangle.a);
  const p = cross(direction, edge2);
  const determinant = dot(edge1, p);
  if (Math.abs(determinant) < 1e-14) return Number.POSITIVE_INFINITY;
  const inverse = 1 / determinant;
  const t = sub(origin, triangle.a);
  const u = dot(t, p) * inverse;
  if (u < -1e-9 || u > 1 + 1e-9) return Number.POSITIVE_INFINITY;
  const q = cross(t, edge1);
  const v = dot(direction, q) * inverse;
  if (v < -1e-9 || u + v > 1 + 1e-9) return Number.POSITIVE_INFINITY;
  const distance = dot(edge2, q) * inverse;
  return distance > 1e-9 ? distance : Number.POSITIVE_INFINITY;
}

/** 영역에서 `sign` 방향으로 가장 가까운 다른 면까지의 거리(표본 광선 기준). 없으면 Infinity. */
function clearanceAlong(
  mesh: StudioEditableMesh,
  plan: PushPullPlan,
  triangles: readonly ClearanceTriangle[],
  sign: 1 | -1,
): number {
  if (triangles.length === 0) return Number.POSITIVE_INFINITY;
  let nearest = Number.POSITIVE_INFINITY;
  const loopById = new Map(plan.loops.map((loop) => [loop.id, loop] as const));
  for (const component of plan.components) {
    const direction: Vec3 = {
      x: component.normal.x * sign,
      y: component.normal.y * sign,
      z: component.normal.z * sign,
    };
    const origins: Vec3[] = [];
    for (const id of component.vertexIds) origins.push({ ...mesh.vertices[id]!.position });
    for (const id of component.faceIds.slice(0, 64)) {
      const points = studioFaceCornerPositions(mesh, loopById.get(id)!.vertexIds);
      origins.push({
        x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
        y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
        z: points.reduce((sum, point) => sum + point.z, 0) / points.length,
      });
    }
    for (const edge of component.boundary.slice(0, 64)) {
      const from = mesh.vertices[edge.from]!.position;
      const to = mesh.vertices[edge.to]!.position;
      origins.push({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, z: (from.z + to.z) / 2 });
    }
    for (const origin of origins.slice(0, 256)) {
      for (const triangle of triangles) {
        const distance = rayTriangleDistance(origin, direction, triangle);
        if (distance < nearest) nearest = distance;
      }
    }
  }
  return nearest;
}

function rangeFromPlan(mesh: StudioEditableMesh, plan: PushPullPlan): StudioFacePushPullRange {
  const toolMax = STUDIO_FACE_MODELING_LIMITS.maxDistance;
  const wallPull = plan.method === "stretch" ? Math.max(0, -plan.wallLow) : Number.POSITIVE_INFINITY;
  const wallPush = plan.method === "stretch" ? Math.max(0, plan.wallHigh) : Number.POSITIVE_INFINITY;
  const overlapPull = plan.method === "extrude" && wallsOverlapNeighbours(mesh, plan, -1);
  const overlapPush = plan.method === "extrude" && wallsOverlapNeighbours(mesh, plan, 1);
  const triangles = collectClearanceTriangles(mesh, plan);
  const rayPull = overlapPull ? 0 : Math.max(0, clearanceAlong(mesh, plan, triangles, -1) - plan.minFeature);
  const rayPush = overlapPush ? 0 : Math.max(0, clearanceAlong(mesh, plan, triangles, 1) - plan.minFeature);
  const pull = Math.min(wallPull, rayPull, toolMax);
  const push = Math.min(wallPush, rayPush, toolMax);
  const limiter = (
    wall: number,
    ray: number,
    overlap: boolean,
    value: number,
  ): StudioFacePushPullRange["pullLimitedBy"] => {
    if (overlap) return "overlap";
    if (value === toolMax && wall > toolMax && ray > toolMax) return "tool";
    // 벽 깊이와 광선 여유가 같은 값이면(박스 안쪽 당기기) 벽 붕괴로 안내한다.
    return wall <= ray * (1 + 1e-9) + 1e-12 ? "wall" : "clearance";
  };
  return {
    method: plan.method,
    minDistance: pull > 0 ? -pull : 0,
    maxDistance: push,
    pullLimitedBy: limiter(wallPull, rayPull, overlapPull, pull),
    pushLimitedBy: limiter(wallPush, rayPush, overlapPush, push),
  };
}

/** 선택한 면 영역을 밀고 당길 수 있는 거리 범위와 방식을 미리 알려 준다(핸들 범위·안내용). */
export function studioEditableMeshPushPullRange(
  mesh: StudioEditableMesh,
  faceIds: readonly number[],
): StudioFaceModelingResult<StudioFacePushPullRange> {
  const plan = analyzePlan(mesh, faceIds);
  if (!plan.ok) return plan;
  return okStudioFaceModeling(rangeFromPlan(mesh, plan.value));
}

/**
 * 선택한 면 영역을 법선 방향으로 `distance`(메시 단위, 양수=밀기, 음수=당기기)만큼 움직인다.
 * 범위를 벗어나면 아무것도 바꾸지 않고 이유 코드와 허용 최대 거리를 알린다.
 */
export function pushPullStudioEditableMeshFaces(
  mesh: StudioEditableMesh,
  faceIds: readonly number[],
  distance: number,
): StudioFaceModelingResult<StudioFacePushPullOutcome> {
  if (!Number.isFinite(distance)) {
    return failStudioFaceModeling("invalid-parameter", "distance must be a finite number");
  }
  const magnitude = Math.abs(distance);
  if (magnitude < STUDIO_FACE_MODELING_LIMITS.minDistance) {
    return failStudioFaceModeling("invalid-parameter", "distance is below the tool resolution");
  }
  if (magnitude > STUDIO_FACE_MODELING_LIMITS.maxDistance) {
    return failStudioFaceModeling("invalid-parameter", "distance is above the tool range", {
      maxDistance: STUDIO_FACE_MODELING_LIMITS.maxDistance,
    });
  }
  const plan = analyzePlan(mesh, faceIds);
  if (!plan.ok) return plan;
  const sign: 1 | -1 = distance > 0 ? 1 : -1;
  const range = rangeFromPlan(mesh, plan.value);
  const limit = sign > 0 ? range.maxDistance : -range.minDistance;
  const limitedBy = sign > 0 ? range.pushLimitedBy : range.pullLimitedBy;
  if (magnitude > limit) {
    if (limitedBy === "overlap") {
      return failStudioFaceModeling(
        "would-collide",
        "the new side walls would overlap a neighbouring face lying along the move direction",
        { maxDistance: 0, elementIds: [...plan.value.components.flatMap((component) => component.faceIds)] },
      );
    }
    return failStudioFaceModeling(
      limitedBy === "wall" ? "collapse" : "would-collide",
      limitedBy === "wall" ? "the move would flatten a side wall" : "the move would run into another face",
      { maxDistance: limit },
    );
  }
  return plan.value.method === "stretch"
    ? stretchFaces(mesh, plan.value, distance, faceIds)
    : extrudeFaces(mesh, distance, faceIds);
}

function stretchFaces(
  mesh: StudioEditableMesh,
  plan: PushPullPlan,
  distance: number,
  faceIds: readonly number[],
): StudioFaceModelingResult<StudioFacePushPullOutcome> {
  const offsetByVertex = new Map<number, Vec3>();
  for (const component of plan.components) {
    for (const id of component.vertexIds) {
      offsetByVertex.set(id, {
        x: component.normal.x * distance,
        y: component.normal.y * distance,
        z: component.normal.z * distance,
      });
    }
  }
  const vertices = mesh.vertices.map((vertex) => {
    const offset = offsetByVertex.get(vertex.id);
    return offset
      ? { ...vertex, position: { x: vertex.position.x + offset.x, y: vertex.position.y + offset.y, z: vertex.position.z + offset.z } }
      : vertex;
  });
  const result: StudioEditableMesh = { ...mesh, vertices };
  const touched = [...plan.touchedFaceIds].sort((left, right) => left - right);
  const violation = verifyStudioFaceModelingResult(mesh, result, touched);
  if (violation) return violation;
  // 이웃 벽이 뒤집히지 않았는지(법선 방향 유지)도 확인한다.
  const before = new Map(plan.loops.map((loop) => [loop.id, buildStudioPlanarFrame(studioFaceCornerPositions(mesh, loop.vertexIds))] as const));
  for (const loop of plan.loops) {
    if (!plan.touchedFaceIds.has(loop.id)) continue;
    const after = buildStudioPlanarFrame(studioFaceCornerPositions(result, loop.vertexIds));
    const previous = before.get(loop.id);
    if (!after || !previous || dot(after.normal, previous.normal) < 0.9999) {
      return failStudioFaceModeling("collapse", "a side wall would flip or lose its shape", { elementIds: [loop.id] });
    }
  }
  const selection = [...new Set(faceIds)].sort((left, right) => left - right);
  return okStudioFaceModeling({
    operation: "push-pull",
    method: "stretch",
    mesh: result,
    createdFaceIds: [],
    selectionFaceIds: selection,
    faceRemap: mesh.faces.map((face) => [face.id, face.id] as const),
  });
}

function extrudeFaces(
  mesh: StudioEditableMesh,
  distance: number,
  faceIds: readonly number[],
): StudioFaceModelingResult<StudioFacePushPullOutcome> {
  const extruded = extrudeStudioEditableMeshFacesWithReceipt(mesh, faceIds, distance);
  if (!extruded.ok) {
    const code = extruded.code === "budget-exceeded" ? "budget-exceeded" : "invalid-mesh";
    return failStudioFaceModeling(code, extruded.detail);
  }
  const { receipt } = extruded.value;
  const created = [...receipt.capFaceIds, ...receipt.sideFaceIds].sort((left, right) => left - right);
  const violation = verifyStudioFaceModelingResult(mesh, extruded.value.mesh, created);
  if (violation) return violation;
  return okStudioFaceModeling({
    operation: "push-pull",
    method: "extrude",
    mesh: extruded.value.mesh,
    createdFaceIds: created,
    selectionFaceIds: [...receipt.capFaceIds].sort((left, right) => left - right),
    faceRemap: receipt.faceRemap.entries.map(([source, target]) => [source, target] as const),
    extrusion: extruded.value,
  });
}
