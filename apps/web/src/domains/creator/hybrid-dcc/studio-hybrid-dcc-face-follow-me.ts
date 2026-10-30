/**
 * 선택한 실제 면에 붙은 Follow Me: 열린 3D 다중선을 따라 단면을 평행 수송한다.
 * 경로는 오브젝트 로컬 절대 좌표이며 첫 점은 면적 중심, 첫 구간은 외향 법선이어야 한다.
 * 중간 고리는 이등분 평면의 마이터로 이어 붙이고 옆면은 삼각형으로 나눠 권위 메시를 유지한다.
 * 닫힌 경로·U턴·겹침·접촉·과도한 마이터는 임의 보정 없이 거부한다. 별도 렌더 메시를 저장하지 않는다.
 */
import { Quaternion, Vector3 } from "three";

import type { StudioEditableMesh, StudioMeshVec3 } from "../studio-editable-half-edge-mesh";
import { STUDIO_EDITABLE_MESH_LIMITS } from "../studio-editable-half-edge-mesh";
import { STUDIO_GEOMETRY_MAX_ABSOLUTE_COORDINATE } from "../studio-geometry-authority";
import {
  createStudioFaceModelingContext, createStudioFaceOutput, prepareStudioConvexFace,
  studioFaceEdgeCreases, type StudioFaceModelingContext, type StudioPreparedConvexFace,
} from "./studio-hybrid-dcc-face-modeling-context";
import { polygonCentroid, unprojectFromStudioPlanarFrame } from "./studio-hybrid-dcc-face-modeling-geometry";
import {
  analyzeStudioEditableMeshIntegrity, buildStudioEditableMeshFromFaceSpecs,
  failStudioFaceModeling, okStudioFaceModeling, readStudioMeshFaceLoops, rejectStudioFaceModelingUvRebuild,
  STUDIO_FACE_MODELING_LIMITS, verifyStudioFaceModelingResult,
  type StudioFaceModelingOutcome, type StudioFaceModelingResult,
} from "./studio-hybrid-dcc-face-modeling-mesh";

const MAX_PATH_POINTS = 64;
const MAX_COLLISION_TRIANGLES = 20_000;
const MAX_COLLISION_WORK = 2_000_000;

export interface StudioFaceFollowMeGuide {
  readonly centroid: StudioMeshVec3;
  readonly normal: StudioMeshVec3;
  readonly minSegmentLength: number;
  readonly maxPathPoints: number;
}

interface Prepared {
  readonly context: StudioFaceModelingContext;
  readonly face: StudioPreparedConvexFace;
  readonly centroid: StudioMeshVec3;
}

function vector(point: StudioMeshVec3): Vector3 { return new Vector3(point.x, point.y, point.z); }
function point(value: Vector3): StudioMeshVec3 { return { x: value.x, y: value.y, z: value.z }; }
function finite(pointValue: StudioMeshVec3): boolean {
  return [pointValue.x, pointValue.y, pointValue.z].every((value) => Number.isFinite(value)
    && Math.abs(value) <= STUDIO_GEOMETRY_MAX_ABSOLUTE_COORDINATE);
}

function prepare(mesh: StudioEditableMesh, faceId: number): StudioFaceModelingResult<Prepared> {
  if (mesh.faces.length > STUDIO_FACE_MODELING_LIMITS.maxMeshFaces) {
    return failStudioFaceModeling("mesh-too-large", "the mesh exceeds the interactive face budget");
  }
  const uvUnsupported = rejectStudioFaceModelingUvRebuild(mesh);
  if (uvUnsupported) return uvUnsupported;
  const context = createStudioFaceModelingContext(mesh);
  if (!context.ok) return context;
  const loop = Number.isSafeInteger(faceId) ? context.value.loopById.get(faceId) : undefined;
  if (!loop) return failStudioFaceModeling("not-found", "selected profile face was not found");
  const face = prepareStudioConvexFace(context.value, loop);
  if (!face.ok) return face;
  const integrity = analyzeStudioEditableMeshIntegrity(mesh, { renderableFaces: "all" });
  if (!integrity.closed || integrity.signedVolume <= 0 || integrity.unrenderableFaces.length > 0
    || integrity.zeroAreaFaces.length > 0 || integrity.nonPlanarFaces.length > 0) {
    return failStudioFaceModeling("invalid-mesh", "Follow Me requires an outward-oriented closed renderable authority mesh");
  }
  return okStudioFaceModeling({ context: context.value, face: face.value,
    centroid: unprojectFromStudioPlanarFrame(face.value.frame, polygonCentroid(face.value.polygon)) });
}

/** 화면은 이 안내의 좌표로 첫 점과 기본 법선 경로를 만든다. 실제 선택 면의 좌표만 사용한다. */
export function describeStudioEditableMeshFaceForFollowMe(mesh: StudioEditableMesh, faceId: number): StudioFaceModelingResult<StudioFaceFollowMeGuide> {
  const prepared = prepare(mesh, faceId);
  if (!prepared.ok) return prepared;
  return okStudioFaceModeling({ centroid: prepared.value.centroid, normal: prepared.value.face.frame.normal,
    minSegmentLength: Math.max(STUDIO_FACE_MODELING_LIMITS.minDistance, prepared.value.context.minFeature),
    maxPathPoints: MAX_PATH_POINTS });
}

interface Triangle {
  readonly faceId: number;
  readonly ids: readonly [number, number, number];
  readonly points: readonly [Vector3, Vector3, Vector3];
  readonly normal: Vector3;
  readonly min: Vector3;
  readonly max: Vector3;
}

function triangle(faceId: number, ids: readonly [number, number, number], vertices: readonly StudioMeshVec3[]): Triangle | null {
  const p = vertices[ids[0]], q = vertices[ids[1]], r = vertices[ids[2]];
  if (!p || !q || !r) return null;
  const a = vector(p), b = vector(q), c = vector(r);
  const normal = b.clone().sub(a).cross(c.clone().sub(a));
  if (!(normal.lengthSq() > 0)) return null;
  return { faceId, ids, points: [a, b, c], normal: normal.normalize(),
    min: a.clone().min(b).min(c), max: a.clone().max(b).max(c) };
}

function triangles(mesh: StudioEditableMesh): StudioFaceModelingResult<Triangle[]> {
  const loops = readStudioMeshFaceLoops(mesh);
  if (!loops) return failStudioFaceModeling("invalid-mesh", "face loops are broken");
  const result: Triangle[] = [];
  const vertices = mesh.vertices.map(({ position }) => position);
  for (const loop of loops) {
    const first = loop.vertexIds[0];
    if (first === undefined) return failStudioFaceModeling("invalid-mesh", "face has no first vertex");
    for (let index = 1; index < loop.vertexIds.length - 1; index += 1) {
      const second = loop.vertexIds[index], third = loop.vertexIds[index + 1];
      if (second === undefined || third === undefined) return failStudioFaceModeling("invalid-mesh", "face has missing corners");
      if (result.length >= MAX_COLLISION_TRIANGLES) return failStudioFaceModeling("budget-exceeded", "collision triangle budget exceeded");
      const item = triangle(loop.id, [first, second, third], vertices);
      if (!item) return failStudioFaceModeling("collapse", "face contains a collapsed triangle");
      result.push(item);
    }
  }
  return okStudioFaceModeling(result);
}

function inside(pointValue: Vector3, target: Triangle, epsilon: number): boolean {
  for (let index = 0; index < 3; index += 1) {
    const a = target.points[index], b = target.points[(index + 1) % 3];
    if (!a || !b) return false;
    const edge = b.clone().sub(a);
    if (edge.clone().cross(pointValue.clone().sub(a)).dot(target.normal) < -epsilon * edge.length()) return false;
  }
  return true;
}

function allowedContact(p: Vector3, a: Triangle, b: Triangle, epsilon: number): boolean {
  const common = a.ids.filter((id) => b.ids.includes(id));
  const firstId = common[0];
  if (firstId === undefined || common.length > 2) return false;
  const first = a.points[a.ids.indexOf(firstId)];
  if (!first) return false;
  const secondId = common[1];
  if (secondId === undefined) return p.distanceToSquared(first) <= epsilon * epsilon;
  const second = a.points[a.ids.indexOf(secondId)];
  if (!second) return false;
  const edge = second.clone().sub(first);
  const t = Math.max(0, Math.min(1, p.clone().sub(first).dot(edge) / edge.lengthSq()));
  return p.distanceToSquared(first.clone().addScaledVector(edge, t)) <= epsilon * epsilon;
}

type Point2 = readonly [number, number];
function cross2(a: Point2, b: Point2, p: Point2): number { return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); }

function coplanarOverlap(a: Triangle, b: Triangle, epsilon: number): boolean {
  const normal = a.normal;
  const drop = Math.abs(normal.x) > Math.abs(normal.y) && Math.abs(normal.x) > Math.abs(normal.z) ? "x"
    : Math.abs(normal.y) > Math.abs(normal.z) ? "y" : "z";
  const origin = a.points[0];
  const project = (v: Vector3): Point2 => drop === "x" ? [v.y - origin.y, v.z - origin.z]
    : drop === "y" ? [v.x - origin.x, v.z - origin.z] : [v.x - origin.x, v.y - origin.y];
  const clip = b.points.map(project);
  const ca = clip[0], cb = clip[1], cc = clip[2];
  if (!ca || !cb || !cc) return true;
  const sign = cross2(ca, cb, cc) > 0 ? 1 : -1;
  let polygon: Point2[] = a.points.map(project);
  for (let edge = 0; edge < 3; edge += 1) {
    const p = clip[edge], q = clip[(edge + 1) % 3];
    if (!p || !q) return true;
    const next: Point2[] = [];
    for (let index = 0; index < polygon.length; index += 1) {
      const from = polygon[index], to = polygon[(index + 1) % polygon.length];
      if (!from || !to) return true;
      const df = sign * cross2(p, q, from), dt = sign * cross2(p, q, to);
      if (df >= 0) next.push(from);
      if ((df >= 0) !== (dt >= 0)) {
        const t = df / (df - dt);
        next.push([from[0] + t * (to[0] - from[0]), from[1] + t * (to[1] - from[1])]);
      }
    }
    polygon = next;
  }
  let area = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const p = polygon[index], q = polygon[(index + 1) % polygon.length];
    if (p && q) area += p[0] * q[1] - p[1] * q[0];
  }
  if (Math.abs(area) > epsilon * epsilon * 2) return true;
  // 넓이가 0인 비공유 모서리 접촉도 숨은 자기 접촉이므로 거부한다.
  for (const p of a.points) if (inside(p, b, epsilon) && !allowedContact(p, a, b, epsilon)) return true;
  for (const p of b.points) if (inside(p, a, epsilon) && !allowedContact(p, a, b, epsilon)) return true;
  for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) {
    const from = a.points[i], to = a.points[(i + 1) % 3], bp = b.points[j], bq = b.points[(j + 1) % 3];
    if (!from || !to || !bp || !bq) return true;
    const p = project(from), q = project(to), r = project(bp), s = project(bq);
    const divisor = (q[0] - p[0]) * (s[1] - r[1]) - (q[1] - p[1]) * (s[0] - r[0]);
    if (Math.abs(divisor) <= epsilon * epsilon) continue;
    const t = ((r[0] - p[0]) * (s[1] - r[1]) - (r[1] - p[1]) * (s[0] - r[0])) / divisor;
    const u = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / divisor;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1
      && !allowedContact(from.clone().lerp(to, t), a, b, epsilon)) return true;
  }
  return false;
}

function intersects(a: Triangle, b: Triangle, epsilon: number): boolean {
  if (a.max.x < b.min.x - epsilon || b.max.x < a.min.x - epsilon
    || a.max.y < b.min.y - epsilon || b.max.y < a.min.y - epsilon
    || a.max.z < b.min.z - epsilon || b.max.z < a.min.z - epsilon) return false;
  if (a.normal.clone().cross(b.normal).lengthSq() < 1e-14) {
    return Math.abs(b.points[0].clone().sub(a.points[0]).dot(a.normal)) <= epsilon && coplanarOverlap(a, b, epsilon);
  }
  const pierces = (edgeOwner: Triangle, target: Triangle) => {
    for (let index = 0; index < 3; index += 1) {
      const from = edgeOwner.points[index], to = edgeOwner.points[(index + 1) % 3];
      if (!from || !to) return true;
      const df = from.clone().sub(target.points[0]).dot(target.normal);
      const dt = to.clone().sub(target.points[0]).dot(target.normal);
      if (Math.abs(df) <= epsilon && inside(from, target, epsilon) && !allowedContact(from, a, b, epsilon)) return true;
      const divisor = df - dt;
      if (Math.abs(divisor) <= epsilon) continue;
      const t = df / divisor;
      if (t < 0 || t > 1) continue;
      const hit = from.clone().lerp(to, t);
      if (inside(hit, target, epsilon) && !allowedContact(hit, a, b, epsilon)) return true;
    }
    return false;
  };
  return pierces(a, b) || pierces(b, a);
}

interface Work { remaining: number }

/** 표면을 가로지르지 않고 작은 기존 부품을 감싸는 경우도 면 중심의 내외 판정으로 감지한다. */
function contained(p: Vector3, shell: readonly Triangle[], epsilon: number, work: Work): boolean | null {
  const directions = [new Vector3(1, 0.371, 0.529), new Vector3(0.227, 1, 0.619), new Vector3(0.491, 0.313, 1)];
  for (const direction of directions) {
    direction.normalize();
    let hits = 0, ambiguous = false;
    for (const target of shell) {
      if (--work.remaining < 0) return null;
      const distance = p.clone().sub(target.points[0]).dot(target.normal);
      if (Math.abs(distance) <= epsilon && inside(p, target, epsilon)) return false;
      const divisor = direction.dot(target.normal);
      if (Math.abs(divisor) <= 1e-12) continue;
      const t = -distance / divisor;
      if (t <= epsilon) continue;
      const hit = p.clone().addScaledVector(direction, t);
      if (!inside(hit, target, epsilon)) continue;
      for (let index = 0; index < 3; index += 1) {
        const a = target.points[index], b = target.points[(index + 1) % 3];
        if (!a || !b) return null;
        const edge = b.clone().sub(a);
        if (Math.abs(edge.clone().cross(hit.clone().sub(a)).dot(target.normal)) <= epsilon * edge.length()) ambiguous = true;
      }
      hits += 1;
    }
    if (!ambiguous) return hits % 2 === 1;
  }
  return null;
}

function checkCollisions(source: StudioEditableMesh, result: StudioEditableMesh, changedIds: readonly number[], profileId: number, epsilon: number): StudioFaceModelingResult<true> {
  const changed = new Set(changedIds);
  const all = triangles(result), original = triangles(source);
  if (!all.ok) return all;
  if (!original.ok) return original;
  const work: Work = { remaining: MAX_COLLISION_WORK };
  const moved = all.value.filter(({ faceId }) => changed.has(faceId));
  for (const a of moved) for (const b of all.value) {
    if (a.faceId === b.faceId || (changed.has(b.faceId) && b.faceId < a.faceId)) continue;
    if (--work.remaining < 0) return failStudioFaceModeling("budget-exceeded", "collision work budget exceeded");
    if (intersects(a, b, epsilon)) return failStudioFaceModeling(changed.has(b.faceId) ? "self-intersection" : "would-collide", "sweep intersects or touches a non-adjacent surface", { elementIds: [a.faceId, b.faceId] });
  }
  // 새로 생기는 부피의 시작 뚜껑을 검사에만 보충한다. 저장 메시에는 추가하지 않는다.
  const sweptShell = [...moved, ...original.value.filter(({ faceId }) => faceId === profileId)];
  for (const item of original.value) {
    if (item.faceId === profileId) continue;
    const center = item.points[0].clone().add(item.points[1]).add(item.points[2]).multiplyScalar(1 / 3);
    const engulfed = contained(center, sweptShell, epsilon, work);
    if (engulfed === null) return failStudioFaceModeling("budget-exceeded", "containment check is ambiguous or exceeded its budget");
    if (engulfed) return failStudioFaceModeling("would-collide", "sweep encloses an existing face", { elementIds: [item.faceId] });
  }
  for (const item of moved) {
    const center = item.points[0].clone().add(item.points[1]).add(item.points[2]).multiplyScalar(1 / 3);
    const embedded = contained(center, original.value, epsilon, work);
    if (embedded === null) return failStudioFaceModeling("budget-exceeded", "containment check is ambiguous or exceeded its budget");
    if (embedded) return failStudioFaceModeling("would-collide", "sweep enters the original solid", { elementIds: [item.faceId] });
  }
  return okStudioFaceModeling(true);
}

/** 실제 선택 면을 경로에 따라 늘리고 끝 뚜껑을 다음 선택으로 반환한다. 잘못된 입력은 원본을 바꾸지 않는다. */
export function followMeStudioEditableMeshFace(mesh: StudioEditableMesh, faceId: number, path: readonly StudioMeshVec3[]): StudioFaceModelingResult<StudioFaceModelingOutcome> {
  const prepared = prepare(mesh, faceId);
  if (!prepared.ok) return prepared;
  const { context, face, centroid } = prepared.value;
  const minSegment = Math.max(STUDIO_FACE_MODELING_LIMITS.minDistance, context.minFeature);
  if (path.length < 2) return failStudioFaceModeling("invalid-parameter", "a path needs at least two points");
  if (path.length > MAX_PATH_POINTS) return failStudioFaceModeling("budget-exceeded", "path has too many points");
  if (path.some((p) => !finite(p))) return failStudioFaceModeling("invalid-parameter", "path coordinates must be finite and in the authority range");
  const first = path[0], last = path.at(-1);
  if (!first || !last) return failStudioFaceModeling("invalid-parameter", "path has missing endpoints");
  const epsilon = Math.max(1e-9, context.extent * 1e-8);
  if (vector(first).distanceTo(vector(centroid)) > epsilon) return failStudioFaceModeling("invalid-parameter", "path must start at the selected face area centroid");
  if (vector(last).distanceTo(vector(first)) <= minSegment) return failStudioFaceModeling("self-intersection", "closed or returning paths cannot be attached to this face");
  const directions: Vector3[] = [];
  let length = 0;
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1], to = path[index];
    if (!from || !to) return failStudioFaceModeling("invalid-parameter", "path has missing points");
    const direction = vector(to).sub(vector(from));
    if (direction.length() < minSegment) return failStudioFaceModeling("degenerate-input", "path has a zero-length or unresolved segment");
    length += direction.length();
    directions.push(direction.normalize());
  }
  const startDirection = directions[0];
  if (!startDirection || startDirection.dot(vector(face.frame.normal)) < 1 - 1e-6) {
    return failStudioFaceModeling("invalid-parameter", "profile must be perpendicular to the first outward path segment");
  }
  if (length > STUDIO_FACE_MODELING_LIMITS.maxDistance) return failStudioFaceModeling("budget-exceeded", "path exceeds the maximum modeling length");
  const corners = face.loop.vertexIds.length;
  const resultFaces = mesh.faces.length + 2 * corners * (path.length - 1);
  if (resultFaces > STUDIO_FACE_MODELING_LIMITS.maxMeshFaces
    || mesh.vertices.length + corners * (path.length - 1) > STUDIO_EDITABLE_MESH_LIMITS.maxVertices) {
    return failStudioFaceModeling("budget-exceeded", "sweep exceeds the editable face or vertex budget");
  }
  const output = createStudioFaceOutput(mesh);
  for (const loop of context.loops) if (loop.id !== faceId) output.keepFace(loop);
  const creases = studioFaceEdgeCreases(mesh, face.loop);
  let previousRing = [...face.loop.vertexIds];
  const orientation = new Quaternion();
  for (let index = 1; index < path.length; index += 1) {
    const center = path[index], incoming = directions[index - 1], outgoing = directions[index];
    if (!center || !incoming) return failStudioFaceModeling("invalid-parameter", "path is incomplete");
    let ringOrientation = orientation.clone();
    let miterDirection: Vector3 | null = null;
    let miterScale = 1;
    if (outgoing) {
      const dot = incoming.dot(outgoing);
      const cosHalf = Math.sqrt(Math.max(0, (1 + dot) / 2));
      if (cosHalf < 0.25) return failStudioFaceModeling("degenerate-input", "path reverses direction or has an excessive miter");
      const bisector = incoming.clone().add(outgoing).normalize();
      const half = new Quaternion().setFromUnitVectors(incoming, bisector);
      ringOrientation = half.clone().multiply(orientation);
      const bend = outgoing.clone().addScaledVector(incoming, -dot);
      if (bend.lengthSq() > 1e-16) miterDirection = bend.normalize().applyQuaternion(half);
      miterScale = 1 / cosHalf;
    }
    const ring: number[] = [];
    for (const sourcePoint of face.points3) {
      const offset = vector(sourcePoint).sub(vector(centroid)).applyQuaternion(ringOrientation);
      if (miterDirection) offset.addScaledVector(miterDirection, offset.dot(miterDirection) * (miterScale - 1));
      const position = point(offset.add(vector(center)));
      if (!finite(position)) return failStudioFaceModeling("invalid-parameter", "sweep coordinates exceed the authority range");
      ring.push(output.addVertex(position));
    }
    for (let corner = 0; corner < corners; corner += 1) {
      const next = (corner + 1) % corners;
      const a = previousRing[corner], b = previousRing[next], c = ring[next], d = ring[corner];
      if (a === undefined || b === undefined || c === undefined || d === undefined) return failStudioFaceModeling("invalid-mesh", "sweep ring is incomplete");
      const crease = creases[corner] ?? 0;
      if (output.addFace([a, b, c], face.loop, [crease, 0, 0]) === null
        || output.addFace([a, c, d], face.loop, [0, crease, 0]) === null) {
        return failStudioFaceModeling("collapse", "sweep creates a collapsed side triangle");
      }
    }
    previousRing = ring;
    if (outgoing) orientation.premultiply(new Quaternion().setFromUnitVectors(incoming, outgoing));
  }
  const cap = output.addFace(previousRing, face.loop, creases);
  if (cap === null) return failStudioFaceModeling("unrenderable-result", "end cap cannot be rendered");
  output.faceRemap.set(faceId, cap);
  const built = buildStudioEditableMeshFromFaceSpecs(output.positions, output.vertexCreases, output.specs);
  if (!built.ok) return built;
  const violation = verifyStudioFaceModelingResult(mesh, built.value, output.createdFaceIds);
  if (violation) return violation;
  const integrity = analyzeStudioEditableMeshIntegrity(built.value, { renderableFaces: "all" });
  const before = analyzeStudioEditableMeshIntegrity(mesh, { renderableFaces: "all" });
  if (!integrity.closed || integrity.bowTieVertices > 0 || integrity.isolatedVertexCount !== before.isolatedVertexCount
    || integrity.eulerCharacteristic !== before.eulerCharacteristic || integrity.signedVolume <= before.signedVolume) {
    return failStudioFaceModeling("collapse", "sweep does not preserve a closed outward solid");
  }
  const collision = checkCollisions(mesh, built.value, output.createdFaceIds, faceId, epsilon);
  if (!collision.ok) return collision;
  return okStudioFaceModeling({ operation: "follow-me", mesh: built.value,
    createdFaceIds: [...output.createdFaceIds], selectionFaceIds: [cap],
    faceRemap: [...output.faceRemap.entries()].sort((a, b) => a[0] - b[0]) });
}
