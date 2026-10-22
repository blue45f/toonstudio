/**
 * 면 밀기/당기기(Push/Pull) 커널: 부호 있는 거리로 선택한 면 영역을 법선 방향으로 움직인다.
 *
 * 두 가지 방식을 쓴다. 영역의 옆면이 모두 법선과 나란한 "기둥 벽"(박스의 옆면처럼 법선과 평행한 모서리로
 * 이어진 면)이면 영역의 꼭짓점을 옮겨 벽을 늘이거나 줄인다(stretch). 그러면 같은 면을 여러 번 밀고 당겨도
 * 모서리 고리가 쌓이지 않고, 박스 윗면을 안쪽으로 당겨도 옆면과 겹치는 이중 벽이 생기지 않는다.
 * 벽이 기둥 모양이 아니면 기존 영역 밀기(extrude, 영수증 포함)로 새 옆면을 만든다.
 *
 * 범위 검증은 세 겹이다. (1) 영역 가장자리로 이어진 이웃 면: 이동 쪽에 있으면서 영역 안쪽으로 기울었거나
 * 이동 방향과 나란하면 새 옆면이 그 면과 겹치거나 뚫으므로 그 방향은 막는다(뿔대 옆면을 안쪽으로 당기는 경우).
 * (2) 나머지 모든 면: 영역을 쓸어 만든 기둥에 처음 닿는 거리를 그림자 겹침으로 정확히 구한다
 * (`studio-hybrid-dcc-face-sweep.ts`). 함께 움직이는 다른 영역은 마주 보고 다가가는 최악을 가정해 절반으로 본다.
 * (3) 결과: 새로 생기거나 움직인 면이 다른 면을 뚫고 지나가는지 삼각형 단위로 직접 확인한다
 * (`studio-hybrid-dcc-face-intersection.ts`). 범위 안이라도 이 검사가 걸리면 `would-collide`로 거부한다.
 * 정점을 공유하는 면끼리의 겹침은 (1)이 맡는다. 서로 이동 축과 거의 수직인 면이 섞여 그림자로 높이를 정할
 * 수 없는 선택, 서로 다른 영역이 꼭짓점 하나로만 맞닿은 선택, 경계가 한 꼭짓점을 두 번 지나는 선택, 떨어진
 * 영역의 이동 축이 나란하지 않은 선택은 처음부터 지원하지 않는다(`PushPullPlan.inseparable`).
 */

import {
  extrudeStudioEditableMeshFacesWithReceipt,
  type StudioEditableMesh,
  type StudioEditableMeshExtrudeRegionMutation,
  type StudioMeshVec3,
} from "../studio-editable-half-edge-mesh";

import { findStudioFaceIntersection } from "./studio-hybrid-dcc-face-intersection";
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
import {
  createStudioSweepObstacles,
  STUDIO_SWEEP_MIN_FACING,
  studioSweepFirstContact,
  type StudioSweepObstacle,
} from "./studio-hybrid-dcc-face-sweep";

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
  /**
   * 무엇이 한계를 정하는지(안내 문구 선택에 쓴다): 벽 붕괴, 다른 면까지의 여유, 도구 최대 거리,
   * 이웃 면과의 겹침, 또는 한 방향으로 움직일 수 없는 선택 모양("region").
   */
  readonly pullLimitedBy: "wall" | "clearance" | "tool" | "overlap" | "region";
  readonly pushLimitedBy: "wall" | "clearance" | "tool" | "overlap" | "region";
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
  /** 영역 면 법선과 영역 법선의 코사인 가운데 가장 작은 값. 작으면 한 방향으로 쓸 수 없다. */
  readonly minFacing: number;
  /** 영역의 경계가 같은 꼭짓점을 두 번 지나는지(영역이 한 점에서 자기 자신과 맞닿음). */
  readonly pinched: boolean;
  readonly vertexIds: ReadonlySet<number>;
  /** 영역 경계 반변 (from, to, 반변이 속한 영역 면 ID, 이웃 면 ID 또는 -1). */
  readonly boundary: readonly { from: number; to: number; face: number; neighbor: number }[];
}

interface PushPullPlan {
  readonly components: readonly PushPullComponent[];
  /** 영역 면 ID → 단위 법선. */
  readonly faceNormals: ReadonlyMap<number, Vec3>;
  /**
   * 선택을 한 덩어리로 움직일 수 없는 모양인지. 네 경우다. (1) 영역 안에 이동 축과 거의 수직인 면이 섞여
   * 그림자로 높이를 정할 수 없다. (2) 서로 다른 영역이 꼭짓점 하나로만 맞닿아 있어 움직이며 그 둘레에서 서로의
   * 새 옆면을 뚫는다. (3) 떨어진 영역들의 이동 축이 나란하지 않아 두 기둥이 중간에서 엇갈릴 수 있다. 축이
   * 나란한 영역끼리는 서로 다가오는 속도가 최대 2배라, 상대 영역까지 거리의 절반만 움직이면 부딪히지 않는다.
   * (4) 한 영역의 경계가 같은 꼭짓점을 두 번 지나, 새 옆면이 한 모서리를 네 장이 나눠 갖는 비정상 위상이 된다.
   */
  readonly inseparable: boolean;
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
  const faceNormals = new Map<number, Vec3>();
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
    const boundary: { from: number; to: number; face: number; neighbor: number }[] = [];
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
      faceNormals.set(id, frame.normal);
      for (let corner = 0; corner < loop.vertexIds.length; corner += 1) {
        const from = loop.vertexIds[corner]!;
        const to = loop.vertexIds[(corner + 1) % loop.vertexIds.length]!;
        vertexIds.add(from);
        const neighbor = (facesByEdge.get(undirectedKey(from, to, stride)) ?? []).find((other) => other !== id) ?? -1;
        if (neighbor < 0 || !memberSet.has(neighbor)) boundary.push({ from, to, face: id, neighbor });
      }
    }
    const length = norm(sum);
    if (!(length > 1e-300)) {
      return failStudioFaceModeling("degenerate-input", "selected region has no stable normal", { elementIds: members });
    }
    const normal = { x: sum.x / length, y: sum.y / length, z: sum.z / length };
    const planar = normals.every((candidate) => dot(candidate, normal) >= 1 - 1e-9);
    const minFacing = normals.reduce((lowest, candidate) => Math.min(lowest, dot(candidate, normal)), 1);
    const boundaryStarts = new Set(boundary.map((edge) => edge.from));
    components.push({ faceIds: members, normal, planar, minFacing, pinched: boundaryStarts.size !== boundary.length, vertexIds, boundary });
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

  const axesParallel = components.every((first, index) => components.every(
    (second, other) => other <= index || norm(cross(first.normal, second.normal)) <= PARALLEL_TOLERANCE,
  ));

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
    faceNormals,
    inseparable: sharedVertex || !axesParallel
      || components.some((component) => component.pinched || !(component.minFacing >= STUDIO_SWEEP_MIN_FACING)),
    method: stretchable ? "stretch" : "extrude",
    wallLow: stretchable ? wallLow : Number.NEGATIVE_INFINITY,
    wallHigh: stretchable ? wallHigh : Number.POSITIVE_INFINITY,
    touchedFaceIds: touched,
    loops,
    minFeature,
  });
}

/**
 * extrude 방식에서 가장자리로 이어진 이웃 면이 새 옆면과 겹치거나 뚫리게 되는지 본다.
 *
 * 이웃 면이 영역에서 `sign` 방향 쪽(이동하는 쪽)으로 이어지고, 그 면을 영역 평면에 비춘 그림자가 영역
 * 안쪽으로 들어오거나(안쪽으로 기운 이웃) 가장자리와 나란하면(그림자가 선으로 접힘) 영역을 쓸어 만든 기둥이
 * 이웃 면 위에 포개지거나 이웃 면을 뚫는다. 뿔대 옆면을 안쪽으로 당길 때처럼 이웃이 바깥으로 벌어지면
 * 새 옆면은 입체 안쪽에 남아 통과한다.
 */
function neighbourBlocksSweep(mesh: StudioEditableMesh, plan: PushPullPlan, sign: 1 | -1): boolean {
  const loopById = new Map(plan.loops.map((loop) => [loop.id, loop] as const));
  for (const component of plan.components) {
    const axis = component.normal;
    for (const edge of component.boundary) {
      if (edge.neighbor < 0) continue;
      const points = studioFaceCornerPositions(mesh, loopById.get(edge.neighbor)!.vertexIds);
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
      const away = {
        x: toCentroid.x - unit.x * parallel,
        y: toCentroid.y - unit.y * parallel,
        z: toCentroid.z - unit.z * parallel,
      };
      const awayLength = norm(away);
      if (!(awayLength > 0)) continue;
      const ahead = sign * dot(axis, away) / awayLength;
      if (!(ahead > PARALLEL_TOLERANCE)) continue;
      // 영역 안쪽을 향하는 방향과 이웃 면 방향을 이동 축에 수직인 평면에 비춰 같은 쪽인지 본다.
      const faceNormal = plan.faceNormals.get(edge.face)!;
      const inward = cross(faceNormal, unit);
      const shadowInward = {
        x: inward.x - axis.x * dot(inward, axis),
        y: inward.y - axis.y * dot(inward, axis),
        z: inward.z - axis.z * dot(inward, axis),
      };
      const shadowAway = {
        x: away.x - axis.x * dot(away, axis),
        y: away.y - axis.y * dot(away, axis),
        z: away.z - axis.z * dot(away, axis),
      };
      const inwardLength = norm(shadowInward);
      const shadowLength = norm(shadowAway) / awayLength;
      if (!(inwardLength > 0)) continue;
      const lean = shadowLength <= PARALLEL_TOLERANCE
        ? 0
        : dot(shadowAway, shadowInward) / (norm(shadowAway) * inwardLength);
      if (lean > -PARALLEL_TOLERANCE) return true;
    }
  }
  return false;
}

/**
 * 영역을 `sign` 방향으로 쓸 때 처음 닿는 다른 면까지의 거리. 없으면 Infinity.
 * 영역 자신은 건너뛴다. stretch 방식의 벽(가장자리 이웃)은 영역과 함께 늘고 줄어 건너뛰지만, extrude 방식에서는
 * 이웃 면도 장애물이다(영역 면이 기울어 있으면 그 이웃 면 아래로 파고들 수 있다).
 */
function sweepContact(
  mesh: StudioEditableMesh,
  plan: PushPullPlan,
  obstacles: readonly StudioSweepObstacle[],
  sign: 1 | -1,
): number {
  const options = {
    areaEpsilon: plan.minFeature * plan.minFeature * 1e-3,
    heightEpsilon: plan.minFeature * 1e-3,
  };
  const everyRegionFace = new Set(plan.components.flatMap((component) => component.faceIds));
  let nearest = Number.POSITIVE_INFINITY;
  for (const component of plan.components) {
    const skip = new Set(component.faceIds);
    if (plan.method === "stretch") for (const edge of component.boundary) if (edge.neighbor >= 0) skip.add(edge.neighbor);
    const moving = new Set([...everyRegionFace].filter((id) => !skip.has(id)));
    const loopById = new Map(plan.loops.map((loop) => [loop.id, loop] as const));
    const contact = studioSweepFirstContact(
      {
        normal: component.normal,
        faces: component.faceIds.map((id) => ({
          points: studioFaceCornerPositions(mesh, loopById.get(id)!.vertexIds),
          normal: plan.faceNormals.get(id)!,
        })),
      },
      sign,
      obstacles,
      { ...options, skip, moving },
    );
    nearest = Math.min(nearest, contact);
  }
  return nearest;
}

function rangeFromPlan(mesh: StudioEditableMesh, plan: PushPullPlan): StudioFacePushPullRange {
  if (plan.inseparable) {
    return { method: plan.method, minDistance: 0, maxDistance: 0, pullLimitedBy: "region", pushLimitedBy: "region" };
  }
  const toolMax = STUDIO_FACE_MODELING_LIMITS.maxDistance;
  const wallPull = plan.method === "stretch" ? Math.max(0, -plan.wallLow) : Number.POSITIVE_INFINITY;
  const wallPush = plan.method === "stretch" ? Math.max(0, plan.wallHigh) : Number.POSITIVE_INFINITY;
  const overlapPull = plan.method === "extrude" && neighbourBlocksSweep(mesh, plan, -1);
  const overlapPush = plan.method === "extrude" && neighbourBlocksSweep(mesh, plan, 1);
  const obstacles = createStudioSweepObstacles(
    plan.loops.map((loop) => ({ id: loop.id, points: studioFaceCornerPositions(mesh, loop.vertexIds) })),
  );
  const clearPull = overlapPull ? 0 : Math.max(0, sweepContact(mesh, plan, obstacles, -1) - plan.minFeature);
  const clearPush = overlapPush ? 0 : Math.max(0, sweepContact(mesh, plan, obstacles, 1) - plan.minFeature);
  const pull = Math.min(wallPull, clearPull, toolMax);
  const push = Math.min(wallPush, clearPush, toolMax);
  const limiter = (
    wall: number,
    clearance: number,
    overlap: boolean,
    value: number,
  ): StudioFacePushPullRange["pullLimitedBy"] => {
    if (overlap) return "overlap";
    if (value === toolMax && wall > toolMax && clearance > toolMax) return "tool";
    // 벽 깊이와 다른 면까지의 여유가 같은 값이면(박스 안쪽 당기기) 벽 붕괴로 안내한다.
    return wall <= clearance * (1 + 1e-9) + 1e-12 ? "wall" : "clearance";
  };
  return {
    method: plan.method,
    minDistance: pull > 0 ? -pull : 0,
    maxDistance: push,
    pullLimitedBy: limiter(wallPull, clearPull, overlapPull, pull),
    pushLimitedBy: limiter(wallPush, clearPush, overlapPush, push),
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
  const regionFaceIds = plan.value.components.flatMap((component) => component.faceIds);
  if (plan.value.inseparable) {
    return failStudioFaceModeling(
      "unsupported-region",
      "the selected faces cannot move together: mixed facing directions, a pinched boundary, a shared vertex, or regions on different axes",
      { elementIds: regionFaceIds },
    );
  }
  const sign: 1 | -1 = distance > 0 ? 1 : -1;
  const range = rangeFromPlan(mesh, plan.value);
  const limit = sign > 0 ? range.maxDistance : -range.minDistance;
  const limitedBy = sign > 0 ? range.pushLimitedBy : range.pullLimitedBy;
  if (magnitude > limit) {
    if (limitedBy === "overlap") {
      return failStudioFaceModeling(
        "would-collide",
        "the new side walls would overlap or cut through a neighbouring face on the move side",
        { maxDistance: 0, elementIds: regionFaceIds },
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
  const loopById = new Map(plan.loops.map((loop) => [loop.id, loop] as const));
  for (const id of touched) {
    const loop = loopById.get(id)!;
    const previous = buildStudioPlanarFrame(studioFaceCornerPositions(mesh, loop.vertexIds));
    const after = buildStudioPlanarFrame(studioFaceCornerPositions(result, loop.vertexIds));
    if (!after || !previous || dot(after.normal, previous.normal) < 0.9999) {
      return failStudioFaceModeling("collapse", "a side wall would flip or lose its shape", { elementIds: [id] });
    }
  }
  const crossing = findStudioFaceIntersection(result, touched);
  if (crossing) {
    return failStudioFaceModeling("would-collide", "the moved faces would cut through another face", {
      elementIds: crossing.faceIds,
    });
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
  const crossing = findStudioFaceIntersection(extruded.value.mesh, created);
  if (crossing) {
    return failStudioFaceModeling("would-collide", "the new faces would cut through another face", {
      elementIds: crossing.faceIds,
    });
  }
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
