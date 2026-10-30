/** 공유 edge 치유 전후의 실제 코너 보간장을 검사한다. 허용 오차로 UV·음영 손실을 숨기지 않는다. */
import {
  deserializeStudioEditableMesh, serializeStudioEditableMesh, validateStudioEditableMeshSerializableAuthority,
  type StudioEditableMesh,
} from "../studio-editable-half-edge-mesh";
import { inspectStudioMeshSurfaceForInteractiveProjection } from "../mesh-surface/studio-mesh-surface-interactive";
import { projectStudioMeshSurfaceForRender } from "../mesh-surface/studio-mesh-surface-render";
import { readStudioMeshFaceLoops, type StudioMeshFaceLoop } from "./studio-hybrid-dcc-face-modeling-mesh";

type FailureCode = "unsupported-uv" | "unsupported-normal-field" | "unrenderable-result" | "budget-exceeded";
export type StudioCoplanarEdgeDissolveFieldsResult = { readonly ok: true }
  | { readonly ok: false; readonly code: FailureCode; readonly detail: string };
class FieldFailure extends Error {
  constructor(readonly code: FailureCode, message: string) { super(message); }
}
function stop(code: FailureCode, message: string): never { throw new FieldFailure(code, message); }
function need<T>(value: T | undefined, message: string): T {
  if (value === undefined) stop("unrenderable-result", message);
  return value;
}

// 전체 사본·주변 음영 검사와 교차 계산을 함께 제한한다. 부분 검사 뒤 성공을 반환하지 않는다.
const LIMITS = Object.freeze({ vertices: 32_768, halfEdges: 65_536, faces: 8_192,
  targetTriangles: 512, trianglePairs: 65_536, work: 1_000_000, rationalBits: 4_096 });
const ZERO = BigInt(0), ONE = BigInt(1);
interface R { readonly n: bigint; readonly d: bigint }
type P2 = readonly [R, R];
type P3 = readonly [R, R, R];
type N3 = readonly [number, number, number];
type Axis = 0 | 1 | 2;
interface Corner { readonly vertexId: number; readonly position: N3; readonly displayed: N3; readonly normal: N3; readonly uv?: readonly [number, number] }
interface Triangle { readonly corners: readonly [Corner, Corner, Corner] }
interface Surface {
  readonly mesh: StudioEditableMesh;
  readonly loops: readonly StudioMeshFaceLoop[];
  readonly triangles: ReadonlyMap<number, readonly Triangle[]>;
}
interface Triangle2 {
  readonly source: Triangle;
  readonly points: readonly [P2, P2, P2];
  readonly corners: readonly [Corner, Corner, Corner];
  readonly area: R;
  readonly box: readonly [R, R, R, R];
}

/** 유한 JS 수의 실제 dyadic 값을 유리수로 계산한다. 모든 중간 분수·최대 bit·GCD 단계가 예산에 든다. */
class Exact {
  private work = 0;
  private pairs = 0;
  private readonly values = new Map<number, R>();
  private readonly bytes = new DataView(new ArrayBuffer(8));
  readonly zero: R = { n: ZERO, d: ONE };
  readonly one: R = { n: ONE, d: ONE };
  charge(amount = 1): void {
    this.work += amount;
    if (!Number.isSafeInteger(this.work) || this.work > LIMITS.work) stop("budget-exceeded", "면 치유의 정확한 보간장 검사 예산을 초과했습니다.");
  }
  pair(): void {
    this.charge(); this.pairs += 1;
    if (this.pairs > LIMITS.trianglePairs) stop("budget-exceeded", "면 치유의 삼각형 교차 검사 한도를 초과했습니다.");
  }
  private bounded(value: bigint): void {
    if ((value < ZERO ? -value : value).toString(2).length > LIMITS.rationalBits) {
      stop("budget-exceeded", "면 치유의 정확한 수치 계산 범위를 초과했습니다.");
    }
  }
  private fraction(n: bigint, d: bigint): R {
    this.charge();
    if (d === ZERO) stop("unrenderable-result", "퇴화한 삼각형의 보간 분모를 계산할 수 없습니다.");
    if (n === ZERO) return this.zero;
    if (d < ZERO) { n = -n; d = -d; }
    // 곱셈 직후도 유한한 bit 상한을 확인하여 정규화 전의 큰 수를 누적하지 않는다.
    this.bounded(n); this.bounded(d);
    let a = n < ZERO ? -n : n, b = d;
    while (b !== ZERO) { this.charge(); const next = a % b; a = b; b = next; }
    return { n: n / a, d: d / a };
  }
  scalar(value: number): R {
    this.charge();
    if (!Number.isFinite(value)) stop("unrenderable-result", "유한하지 않은 위치 또는 보간장 값이 있습니다.");
    const previous = this.values.get(value); if (previous) return previous;
    if (value === 0) return this.zero;
    this.bytes.setFloat64(0, value, false);
    const high = this.bytes.getUint32(0, false), low = this.bytes.getUint32(4, false), exponent = (high >>> 20) & 2047;
    let n = (BigInt(high & 0xfffff) << BigInt(32)) + BigInt(low);
    if (exponent !== 0) n += ONE << BigInt(52);
    if (high >>> 31) n = -n;
    const power = exponent === 0 ? -1074 : exponent - 1023 - 52;
    const result = power >= 0 ? this.fraction(n << BigInt(power), ONE) : this.fraction(n, ONE << BigInt(-power));
    this.values.set(value, result); return result;
  }
  add(a: R, b: R): R { return this.fraction(a.n * b.d + b.n * a.d, a.d * b.d); }
  sub(a: R, b: R): R { return this.fraction(a.n * b.d - b.n * a.d, a.d * b.d); }
  mul(a: R, b: R): R { return this.fraction(a.n * b.n, a.d * b.d); }
  div(a: R, b: R): R { return this.fraction(a.n * b.d, a.d * b.n); }
  compare(a: R, b: R): number {
    this.charge(); const left = a.n * b.d, right = b.n * a.d;
    return left < right ? -1 : left > right ? 1 : 0;
  }
  equal(a: R, b: R): boolean { this.charge(); return a.n === b.n && a.d === b.d; }
  abs(a: R): R { return a.n < ZERO ? { n: -a.n, d: a.d } : a; }
}

function checkMeshBudget(mesh: StudioEditableMesh): void {
  if (Reflect.ownKeys(mesh).some((key) => typeof key !== "string"
    || !["revision", "vertices", "halfEdges", "faces", "nextVertexId", "nextHalfEdgeId", "nextFaceId", "uvLayer"].includes(key))) {
    stop("unsupported-uv", "단일 코너 UV 외의 추가 메시 채널·메타데이터는 치유로 보존할 수 없습니다.");
  }
  if (!Array.isArray(mesh.vertices) || !Array.isArray(mesh.halfEdges) || !Array.isArray(mesh.faces)
    || mesh.vertices.length > LIMITS.vertices || mesh.halfEdges.length > LIMITS.halfEdges || mesh.faces.length > LIMITS.faces) {
    stop("budget-exceeded", "면 치유의 전체 메시·주변 음영 검사 크기 한도를 초과했습니다.");
  }
}
function triple(values: ArrayLike<number>, offset: number): N3 {
  const x = values[offset], y = values[offset + 1], z = values[offset + 2];
  if (x === undefined || y === undefined || z === undefined || ![x, y, z].every(Number.isFinite)) {
    stop("unrenderable-result", "실제 표면의 위치 또는 코너 법선을 확인하지 못했습니다.");
  }
  return [x, y, z];
}
function readSurface(input: StudioEditableMesh, exact: Exact): Surface {
  checkMeshBudget(input);
  const valid = validateStudioEditableMeshSerializableAuthority(input);
  if (!valid.ok) stop(input.uvLayer === undefined ? "unrenderable-result" : "unsupported-uv", valid.detail);
  // 매 호출 새 정본 사본을 검사한다. 원본 identity에 묶인 surface 캐시를 mutation 증명으로 사용하지 않는다.
  // snapshot 내부 face index도 원본 identity의 과거 캐시를 읽지 않도록 새 root에서 시작한다.
  const current: StudioEditableMesh = { ...input };
  const mesh = deserializeStudioEditableMesh(serializeStudioEditableMesh(current));
  exact.charge(mesh.vertices.length + mesh.halfEdges.length + mesh.faces.length);
  const inspected = inspectStudioMeshSurfaceForInteractiveProjection(mesh);
  if (!inspected.ok) stop(inspected.message.includes("예산") ? "budget-exceeded" : "unrenderable-result", inspected.message);
  const plan = inspected.value.plan, projection = projectStudioMeshSurfaceForRender(mesh, plan);
  const loops = readStudioMeshFaceLoops(mesh);
  if (!loops || projection.indices.length !== plan.triangles.length * 3
    || projection.cornerNormals.length !== plan.triangles.length * 9
    || (mesh.uvLayer !== undefined && projection.cornerUvs?.length !== plan.triangles.length * 6)) {
    stop("unrenderable-result", "실제 표면의 면·삼각형·코너 stream 대응이 일치하지 않습니다.");
  }
  const byFace = new Map<number, Triangle[]>();
  for (const [index, triangle] of plan.triangles.entries()) {
    exact.charge();
    const read = (corner: 0 | 1 | 2): Corner => {
      const vertexId = triangle.vertexIds[corner], halfEdgeId = triangle.cornerHalfEdgeIds[corner];
      const vertex = need(mesh.vertices[vertexId], "표면의 원본 정점이 없습니다."), edge = need(mesh.halfEdges[halfEdgeId], "표면의 원본 코너가 없습니다.");
      const position: N3 = [vertex.position.x, vertex.position.y, vertex.position.z];
      const dense = need(projection.indices[index * 3 + corner], "표면의 표시 정점 index가 없습니다.");
      const displayed = triple(projection.positions, dense * 3), normal = triple(projection.cornerNormals, index * 9 + corner * 3);
      if (vertex.id !== vertexId || edge.face !== triangle.faceId || mesh.halfEdges[edge.prev]?.vertex !== vertexId
        || dense !== vertexId || displayed.some((value, axis) => value !== Math.fround(need(position[axis], "원본 축이 없습니다.")))) {
        stop("unrenderable-result", "실제 표면의 정점·면·코너 provenance가 원본과 다릅니다.");
      }
      if (mesh.uvLayer === undefined) return { vertexId, position, displayed, normal };
      const sourceUv = need(mesh.uvLayer.corners[halfEdgeId], "원본 UV 코너가 없습니다."), offset = index * 6 + corner * 2;
      const u = projection.cornerUvs?.[offset], v = projection.cornerUvs?.[offset + 1];
      if (u === undefined || v === undefined || u !== sourceUv.u || v !== sourceUv.v) stop("unsupported-uv", "실제 표면의 코너 UV가 정본과 다릅니다.");
      return { vertexId, position, displayed, normal, uv: [u, v] };
    };
    const list = byFace.get(triangle.faceId) ?? [];
    list.push({ corners: [read(0), read(1), read(2)] }); byFace.set(triangle.faceId, list);
  }
  return { mesh, loops, triangles: byFace };
}

function point3(point: N3, exact: Exact): P3 { return [exact.scalar(point[0]), exact.scalar(point[1]), exact.scalar(point[2])]; }
function subtract3(a: P3, b: P3, exact: Exact): P3 { return [exact.sub(a[0], b[0]), exact.sub(a[1], b[1]), exact.sub(a[2], b[2])]; }
function cross3(a: P3, b: P3, exact: Exact): P3 {
  return [exact.sub(exact.mul(a[1], b[2]), exact.mul(a[2], b[1])), exact.sub(exact.mul(a[2], b[0]), exact.mul(a[0], b[2])), exact.sub(exact.mul(a[0], b[1]), exact.mul(a[1], b[0]))];
}
function orient(a: P2, b: P2, c: P2, exact: Exact): R {
  return exact.sub(exact.mul(exact.sub(b[0], a[0]), exact.sub(c[1], a[1])), exact.mul(exact.sub(b[1], a[1]), exact.sub(c[0], a[0])));
}
function samePoint(a: P2, b: P2, exact: Exact): boolean { return exact.equal(a[0], b[0]) && exact.equal(a[1], b[1]); }
function projectionAxes(triangles: readonly Triangle[], displayed: boolean, exact: Exact): { readonly origin: P3; readonly normal: P3; readonly axes: readonly [Axis, Axis] } {
  const first = need(triangles[0], "보간장을 비교할 원본 삼각형이 없습니다.");
  const points = first.corners.map((corner) => point3(displayed ? corner.displayed : corner.position, exact));
  const origin = need(points[0], "투영 원점이 없습니다."), normal = cross3(subtract3(need(points[1], "투영 점이 없습니다."), origin, exact), subtract3(need(points[2], "투영 점이 없습니다."), origin, exact), exact);
  const axes: readonly Axis[] = [0, 1, 2]; let dropped: Axis = 0;
  for (const axis of axes) if (exact.compare(exact.abs(normal[axis]), exact.abs(normal[dropped])) > 0) dropped = axis;
  if (normal[dropped].n === ZERO) stop("unrenderable-result", "원본 삼각형이 퇴화하여 보간장을 비교할 수 없습니다.");
  return { origin, normal, axes: dropped === 0 ? [1, 2] : dropped === 1 ? [0, 2] : [0, 1] };
}
function triangles2(triangles: readonly Triangle[], plane: ReturnType<typeof projectionAxes>, displayed: boolean,
  orientation: number, exact: Exact): Triangle2[] {
  return triangles.map((source) => {
    const toPoint = (corner: Corner): P2 => {
      const p = point3(displayed ? corner.displayed : corner.position, exact), delta = subtract3(p, plane.origin, exact);
      const distance = exact.add(exact.add(exact.mul(delta[0], plane.normal[0]), exact.mul(delta[1], plane.normal[1])), exact.mul(delta[2], plane.normal[2]));
      if (distance.n !== ZERO) stop("unrenderable-result", displayed ? "실제 Float32 표면이 같은 평면임을 증명하지 못했습니다." : "원본 f64 표면이 같은 평면임을 증명하지 못했습니다.");
      return [p[plane.axes[0]], p[plane.axes[1]]];
    };
    const a = toPoint(source.corners[0]), b = toPoint(source.corners[1]), c = toPoint(source.corners[2]);
    const area = orient(a, b, c, exact), sign = area.n < ZERO ? -1 : area.n > ZERO ? 1 : 0;
    if (sign === 0 || sign !== orientation) stop("unrenderable-result", "치유 전후 표면 삼각형의 면적 또는 방향이 다릅니다.");
    const points: readonly [P2, P2, P2] = sign < 0 ? [a, c, b] : [a, b, c];
    const corners: readonly [Corner, Corner, Corner] = sign < 0 ? [source.corners[0], source.corners[2], source.corners[1]] : source.corners;
    let minX = a[0], maxX = a[0], minY = a[1], maxY = a[1];
    for (const point of points) {
      if (exact.compare(point[0], minX) < 0) minX = point[0]; if (exact.compare(point[0], maxX) > 0) maxX = point[0];
      if (exact.compare(point[1], minY) < 0) minY = point[1]; if (exact.compare(point[1], maxY) > 0) maxY = point[1];
    }
    return { source, points, corners, area: exact.abs(area), box: [minX, minY, maxX, maxY] };
  });
}
function deduplicate(points: readonly P2[], exact: Exact): P2[] {
  const result: P2[] = [];
  for (const point of points) {
    const previous = result.at(-1); if (!previous || !samePoint(previous, point, exact)) result.push(point);
  }
  const first = result[0], last = result.at(-1);
  if (result.length > 1 && first && last && samePoint(first, last, exact)) result.pop();
  if (result.length > 8) stop("unrenderable-result", "두 삼각형 교차의 꼭짓점 수가 안정적인 범위를 벗어났습니다.");
  return result;
}
function intersection(left: Triangle2, right: Triangle2, exact: Exact): P2[] {
  if (exact.compare(left.box[2], right.box[0]) <= 0 || exact.compare(right.box[2], left.box[0]) <= 0
    || exact.compare(left.box[3], right.box[1]) <= 0 || exact.compare(right.box[3], left.box[1]) <= 0) return [];
  let polygon: P2[] = [...left.points];
  for (let edge = 0; edge < 3 && polygon.length > 0; edge++) {
    const a = need(right.points[edge], "교차 경계가 없습니다."), b = need(right.points[(edge + 1) % 3], "교차 경계가 없습니다.");
    const clipped: P2[] = []; let previous = need(polygon.at(-1), "교차 원점이 없습니다."), before = orient(a, b, previous, exact);
    for (const current of polygon) {
      const after = orient(a, b, current, exact), insideBefore = before.n >= ZERO, insideAfter = after.n >= ZERO;
      if (insideBefore !== insideAfter) {
        const t = exact.div(before, exact.sub(before, after));
        clipped.push([exact.add(previous[0], exact.mul(exact.sub(current[0], previous[0]), t)), exact.add(previous[1], exact.mul(exact.sub(current[1], previous[1]), t))]);
      }
      if (insideAfter) clipped.push(current);
      previous = current; before = after;
    }
    polygon = deduplicate(clipped, exact);
  }
  return polygon;
}
function area2(polygon: readonly P2[], exact: Exact): R {
  if (polygon.length < 3) return exact.zero;
  let area = exact.zero;
  for (const [index, point] of polygon.entries()) {
    const next = need(polygon[(index + 1) % polygon.length], "교차 다각형이 닫히지 않습니다.");
    area = exact.add(area, exact.sub(exact.mul(point[0], next[1]), exact.mul(point[1], next[0])));
  }
  if (area.n < ZERO) stop("unrenderable-result", "교차 다각형의 방향을 확인하지 못했습니다.");
  return area;
}
function barycentric(triangle: Triangle2, point: P2, exact: Exact): readonly [R, R, R] {
  const [a, b, c] = triangle.points;
  const weights: readonly [R, R, R] = [exact.div(orient(b, c, point, exact), triangle.area), exact.div(orient(c, a, point, exact), triangle.area), exact.div(orient(a, b, point, exact), triangle.area)];
  if (weights.some((value) => value.n < ZERO) || !exact.equal(exact.add(exact.add(weights[0], weights[1]), weights[2]), exact.one)) {
    stop("unrenderable-result", "교차점의 삼각형 보간 대응을 확인하지 못했습니다.");
  }
  return weights;
}
function field(triangle: Triangle2, weights: readonly [R, R, R], axis: number, uv: boolean, exact: Exact): R {
  let value = exact.zero;
  for (const [index, corner] of triangle.corners.entries()) {
    const scalar = uv ? corner.uv?.[axis] : corner.normal[axis];
    if (scalar === undefined) stop(uv ? "unsupported-uv" : "unsupported-normal-field", "실제 코너의 보간장 값이 없습니다.");
    value = exact.add(value, exact.mul(exact.scalar(scalar), need(weights[index], "보간 가중치가 없습니다.")));
  }
  return value;
}
function compareAt(left: Triangle2, right: Triangle2, point: P2, uv: boolean, exact: Exact): void {
  const a = barycentric(left, point, exact), b = barycentric(right, point, exact);
  for (let axis = 0; axis < 3; axis++) {
    if (uv && axis < 2 && !exact.equal(field(left, a, axis, true, exact), field(right, b, axis, true, exact))) {
      stop("unsupported-uv", "새 삼각분할이 원래의 코너 UV 보간장을 정확히 보존하지 못합니다.");
    }
    if (!exact.equal(field(left, a, axis, false, exact), field(right, b, axis, false, exact))) {
      stop("unsupported-normal-field", "새 삼각분할이 실제 코너 법선 보간장을 보존하지 못합니다.");
    }
  }
}
function verifyTransformIndependentNormals(left: Triangle2, right: Triangle2, exact: Exact): void {
  const a = canonicalRotation(left.corners, (corner) => positionKey(corner.position), exact);
  const b = canonicalRotation(right.corners, (corner) => positionKey(corner.position), exact);
  const sameTriangle = a.every((corner, index) => {
    const target = need(b[index], "법선 비교의 결과 코너가 없습니다.");
    return corner.position.every((value, axis) => value === target.position[axis])
      && corner.normal.every((value, axis) => value === target.normal[axis]);
  });
  if (sameTriangle) return;
  // shader는 normalMatrix 뒤 정점마다 normalize한다. local 선형장이 같아도 비균일 TRS 뒤에는 달라질 수 있다.
  const normal = left.corners[0].normal;
  if ([...left.corners, ...right.corners].every((corner) => corner.normal.every((value, axis) => value === normal[axis]))) return;
  // TODO: 일반 variable smooth 재삼각화는 실제 object/parent normal transform과 current-context fence를 받는 확장이 필요하다.
  // 이 mesh-only API에 없는 변환을 추측하여 화면 보존 성공으로 판정하지 않는다.
  stop("unsupported-normal-field", "재삼각화된 smooth 법선이 실제 물체 변환 뒤에도 보존됨을 증명할 수 없습니다.");
}
function compareTarget(before: readonly Triangle[], after: readonly Triangle[], uv: boolean, displayed: boolean, exact: Exact): void {
  const plane = projectionAxes(before, displayed, exact), first = need(before[0], "원본 삼각형이 없습니다.");
  const project = (corner: Corner): P2 => {
    const p = point3(displayed ? corner.displayed : corner.position, exact); return [p[plane.axes[0]], p[plane.axes[1]]];
  };
  const signed = orient(project(first.corners[0]), project(first.corners[1]), project(first.corners[2]), exact);
  const orientation = signed.n < ZERO ? -1 : 1;
  const oldTriangles = triangles2(before, plane, displayed, orientation, exact), newTriangles = triangles2(after, plane, displayed, orientation, exact);
  const oldCoverage = oldTriangles.map(() => exact.zero), newCoverage = newTriangles.map(() => exact.zero);
  for (const [oldIndex, left] of oldTriangles.entries()) for (const [newIndex, right] of newTriangles.entries()) {
    exact.pair(); const polygon = intersection(left, right, exact), overlap = area2(polygon, exact);
    if (overlap.n === ZERO) continue;
    verifyTransformIndependentNormals(left, right, exact);
    oldCoverage[oldIndex] = exact.add(need(oldCoverage[oldIndex], "원본 면적이 없습니다."), overlap);
    newCoverage[newIndex] = exact.add(need(newCoverage[newIndex], "결과 면적이 없습니다."), overlap);
    for (const point of polygon) compareAt(left, right, point, uv, exact);
  }
  for (const [index, triangle] of oldTriangles.entries()) if (!exact.equal(triangle.area, need(oldCoverage[index], "원본 coverage가 없습니다."))) {
    stop("unrenderable-result", "치유 결과가 원본 삼각형 영역을 빠짐없이 한 번 덮지 못합니다.");
  }
  for (const [index, triangle] of newTriangles.entries()) if (!exact.equal(triangle.area, need(newCoverage[index], "결과 coverage가 없습니다."))) {
    stop("unrenderable-result", "치유 결과 삼각형의 영역이 원본과 겹치거나 빠졌습니다.");
  }
}

function positionKey(position: N3): string { return JSON.stringify(position); }
function vertexKey(vertexId: number, position: N3): string { return `${vertexId}@${positionKey(position)}`; }
function cornerKey(corner: Corner): string { return vertexKey(corner.vertexId, corner.position); }
function canonicalRotation<T>(values: readonly T[], key: (value: T) => string, exact: Exact): readonly T[] {
  if (values.length === 0) stop("unsupported-normal-field", "비대상 면의 원본 경계를 대응시킬 수 없습니다.");
  let first = 0;
  for (let candidate = 1; candidate < values.length; candidate++) for (let offset = 0; offset < values.length; offset++) {
    exact.charge();
    const a = key(need(values[(candidate + offset) % values.length], "면 경계가 없습니다.")), b = key(need(values[(first + offset) % values.length], "면 경계가 없습니다."));
    if (a < b) { first = candidate; break; } if (a > b) break;
  }
  return [...values.slice(first), ...values.slice(0, first)];
}
function loopKey(surface: Surface, loop: StudioMeshFaceLoop, exact: Exact): string {
  const key = (id: number): string => {
    const vertex = need(surface.mesh.vertices[id], "비대상 면의 원본 정점이 없습니다.");
    return vertexKey(id, [vertex.position.x, vertex.position.y, vertex.position.z]);
  };
  // 같은 위치인 독립 shell도 실제 원본 ID로 구분한다. caller는 정점 ID·위치를 compaction 없이 보존한다.
  return canonicalRotation(loop.vertexIds, key, exact).map(key).join("|");
}
function otherFaces(surface: Surface, excluded: ReadonlySet<number>, exact: Exact): Map<string, StudioMeshFaceLoop> {
  const faces = new Map<string, StudioMeshFaceLoop>();
  for (const loop of surface.loops) {
    if (excluded.has(loop.id)) continue;
    const key = loopKey(surface, loop, exact);
    if (faces.has(key)) stop("unsupported-normal-field", "같은 원본 위치 경계의 비대상 면이 중복되어 대응을 증명할 수 없습니다.");
    faces.set(key, loop);
  }
  return faces;
}
function keyedTriangles(triangles: readonly Triangle[], exact: Exact): Map<string, readonly Corner[]> {
  const result = new Map<string, readonly Corner[]>();
  for (const triangle of triangles) {
    const corners = canonicalRotation(triangle.corners, cornerKey, exact), key = corners.map(cornerKey).join("|");
    if (result.has(key)) stop("unsupported-normal-field", "비대상 면의 실제 삼각형이 중복되어 대응할 수 없습니다.");
    result.set(key, corners);
  }
  return result;
}
function compareOthers(source: Surface, result: Surface, selected: ReadonlySet<number>, resultFaceId: number, exact: Exact): void {
  const before = otherFaces(source, selected, exact), after = otherFaces(result, new Set([resultFaceId]), exact);
  if (before.size !== after.size) stop("unsupported-normal-field", "치유와 무관한 면의 전체 대응이 바뀌었습니다.");
  for (const [key, loop] of before) {
    const other = after.get(key);
    if (!other || other.materialSlot !== loop.materialSlot || other.smooth !== loop.smooth) stop("unsupported-normal-field", "비대상 면의 경계 또는 면 속성이 바뀌었습니다.");
    const a = keyedTriangles(need(source.triangles.get(loop.id), "비대상 원본 삼각형이 없습니다."), exact);
    const b = keyedTriangles(need(result.triangles.get(other.id), "비대상 결과 삼각형이 없습니다."), exact);
    if (a.size !== b.size) stop("unsupported-normal-field", "비대상 면의 실제 삼각분할 provenance가 달라졌습니다.");
    for (const [triangleKey, corners] of a) {
      const targets = b.get(triangleKey);
      if (!targets) stop("unsupported-normal-field", "비대상 면의 실제 삼각형 대응을 증명하지 못했습니다.");
      for (const [index, corner] of corners.entries()) {
        const target = need(targets[index], "비대상 결과 코너가 없습니다."); exact.charge();
        if (corner.displayed.some((value, axis) => value !== target.displayed[axis])
          || corner.normal.some((value, axis) => value !== target.normal[axis])) stop("unsupported-normal-field", "치유가 인접한 비대상 면의 실제 위치 또는 smooth 법선을 바꿉니다.");
        if (corner.uv?.[0] !== target.uv?.[0] || corner.uv?.[1] !== target.uv?.[1]) stop("unsupported-uv", "치유가 비대상 면의 실제 UV 코너를 바꿉니다.");
      }
    }
  }
}

/** 두 face를 하나로 치유하는 caller의 전체 결과만 검사한다. corner remap·material 선택·명령 발행은 하지 않는다. */
export function verifyStudioCoplanarEdgeDissolveFields(source: StudioEditableMesh, result: StudioEditableMesh,
  sourceFaceIds: readonly number[], resultFaceId: number): StudioCoplanarEdgeDissolveFieldsResult {
  try {
    if (sourceFaceIds.length !== 2 || new Set(sourceFaceIds).size !== 2
      || sourceFaceIds.some((id) => !Number.isSafeInteger(id) || id < 0) || !Number.isSafeInteger(resultFaceId) || resultFaceId < 0) {
      stop("unrenderable-result", "원본 두 면과 결과 한 면의 실제 ID가 필요합니다.");
    }
    if ((source.uvLayer === undefined) !== (result.uvLayer === undefined)) stop("unsupported-uv", "치유 전후의 단일 UV 레이어가 사라지거나 새로 생겼습니다.");
    const exact = new Exact(), before = readSurface(source, exact), after = readSurface(result, exact), selected = new Set(sourceFaceIds);
    if (before.mesh.faces.length !== after.mesh.faces.length + 1 || !after.mesh.faces.some((face) => face.id === resultFaceId)) {
      stop("unrenderable-result", "원본 두 면을 결과 한 면으로 치유한 전체 결과가 아닙니다.");
    }
    const oldTriangles = sourceFaceIds.flatMap((id) => need(before.triangles.get(id), "치유할 원본 면의 실제 삼각형이 없습니다."));
    const newTriangles = need(after.triangles.get(resultFaceId), "치유 결과 면의 실제 삼각형이 없습니다.");
    if (oldTriangles.length + newTriangles.length > LIMITS.targetTriangles) stop("budget-exceeded", "치유 대상의 삼각형 보간장 검사 한도를 초과했습니다.");
    compareOthers(before, after, selected, resultFaceId, exact);
    compareTarget(oldTriangles, newTriangles, source.uvLayer !== undefined, false, exact);
    compareTarget(oldTriangles, newTriangles, source.uvLayer !== undefined, true, exact);
    return { ok: true };
  } catch (error) {
    return error instanceof FieldFailure ? { ok: false, code: error.code, detail: error.message }
      : { ok: false, code: "unrenderable-result", detail: error instanceof Error ? error.message : "면 치유의 실제 표면 보존을 확인하지 못했습니다." };
  }
}
