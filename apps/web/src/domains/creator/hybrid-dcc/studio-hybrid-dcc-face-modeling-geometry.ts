/**
 * 면 단위 모델링(안쪽 테두리·오프셋·면 그리기)이 쓰는 평면 기하 보조 함수.
 *
 * 순수 함수만 둔다(three.js·DOM·React 비의존). 한 면은 평면 위의 볼록 다각형으로 보고, 면마다 만든
 * 2D 좌표계(`StudioPlanarFrame`)에서 모든 계산을 한 뒤 3D로 되돌린다. 좌표계는 면의 정점 순서만으로
 * 정해지므로 화면(스케치 패드)과 커널이 같은 좌표계를 따로 만들어도 같은 결과가 나온다.
 *
 * 범위: 볼록 다각형의 mitre 오프셋과 붕괴 거리, 볼록 고리(바깥 볼록 + 안쪽 볼록)의 삼각 분할,
 * 삼각형을 볼록 다각형으로 다시 합치기. 오목 다각형·구멍이 둘 이상인 영역은 다루지 않는다.
 */

import type { StudioMeshVec3 } from "../studio-editable-half-edge-mesh";

export type StudioPlanarPoint = readonly [x: number, y: number];

export interface StudioPlanarFrame {
  readonly origin: StudioMeshVec3;
  /** 면 평면 안의 단위 가로축. 정점 순서의 첫 번째 충분히 긴 모서리 방향이다. */
  readonly u: StudioMeshVec3;
  /** 면 평면 안의 단위 세로축. `normal × u`. */
  readonly v: StudioMeshVec3;
  /** 정점 순서가 반시계로 보이는 쪽의 단위 법선(Newell). */
  readonly normal: StudioMeshVec3;
  /** 정점 순서가 감싸는 면적(양수). */
  readonly area: number;
}

export interface StudioPlanarPolygonShape {
  /** 부호 있는 면적. 양수면 반시계. */
  readonly signedArea: number;
  /** 반사(오목) 꼭짓점도 되접힘도 없고 회전각 합이 한 바퀴인 다각형. 일직선 꼭짓점은 허용한다. */
  readonly convex: boolean;
  /** `convex`이면서 일직선 꼭짓점도 없는 다각형. */
  readonly strictlyConvex: boolean;
  /** 서로 만나는 모서리가 없는 단순 다각형. */
  readonly simple: boolean;
  /** 앞뒤 모서리와 일직선인 꼭짓점 색인. */
  readonly collinearCorners: readonly number[];
  /** 바로 되접히는 꼭짓점 색인(180도 접힘). */
  readonly spikeCorners: readonly number[];
  /** 서로 닿거나 교차하는 첫 모서리 쌍(모서리 k는 점 k에서 점 k+1로 가는 선). 없으면 null. */
  readonly selfContact: readonly [first: number, second: number] | null;
  readonly minEdgeLength: number;
  readonly maxEdgeLength: number;
}

export interface StudioAnnulusTriangulation {
  /** 반시계 삼각형. 색인은 `[...outer, ...inner]` 순서의 결합 배열 기준이다. */
  readonly triangles: readonly (readonly [number, number, number])[];
}

const TURN_TOLERANCE = 1e-9;

function sub2(a: StudioPlanarPoint, b: StudioPlanarPoint): StudioPlanarPoint {
  return [a[0] - b[0], a[1] - b[1]];
}

function cross2(a: StudioPlanarPoint, b: StudioPlanarPoint): number {
  return a[0] * b[1] - a[1] * b[0];
}

function dot2(a: StudioPlanarPoint, b: StudioPlanarPoint): number {
  return a[0] * b[0] + a[1] * b[1];
}

function length2(a: StudioPlanarPoint): number {
  return Math.hypot(a[0], a[1]);
}

/** (b-a) x (c-a). 양수면 c가 a→b 의 왼쪽에 있다. */
function orient(a: StudioPlanarPoint, b: StudioPlanarPoint, c: StudioPlanarPoint): number {
  return cross2(sub2(b, a), sub2(c, a));
}

export function polygonSignedArea(polygon: readonly StudioPlanarPoint[]): number {
  let twice = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]!;
    const next = polygon[(index + 1) % polygon.length]!;
    twice += current[0] * next[1] - next[0] * current[1];
  }
  return twice / 2;
}

/** 면적 가중 무게중심. 면적이 0에 가까우면 꼭짓점 평균으로 대신한다. */
export function polygonCentroid(polygon: readonly StudioPlanarPoint[]): StudioPlanarPoint {
  let twice = 0;
  let cx = 0;
  let cy = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]!;
    const next = polygon[(index + 1) % polygon.length]!;
    const weight = current[0] * next[1] - next[0] * current[1];
    twice += weight;
    cx += (current[0] + next[0]) * weight;
    cy += (current[1] + next[1]) * weight;
  }
  if (Math.abs(twice) > 1e-30) return [cx / (3 * twice), cy / (3 * twice)];
  const count = Math.max(1, polygon.length);
  return [
    polygon.reduce((sum, point) => sum + point[0], 0) / count,
    polygon.reduce((sum, point) => sum + point[1], 0) / count,
  ];
}

function normalize3(x: number, y: number, z: number): StudioMeshVec3 | null {
  const length = Math.hypot(x, y, z);
  if (!(length > 1e-300)) return null;
  return { x: x / length, y: y / length, z: z / length };
}

/**
 * 3D 점들(한 면의 정점 순서)로 평면 좌표계를 만든다. 면적이 0에 가깝거나 점이 3개 미만이면 null.
 * 법선은 Newell 방법이라 정점 순서가 반시계로 보이는 쪽이다.
 */
export function buildStudioPlanarFrame(points: readonly StudioMeshVec3[]): StudioPlanarFrame | null {
  const count = points.length;
  if (count < 3) return null;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const point of points) {
    cx += point.x;
    cy += point.y;
    cz += point.z;
  }
  cx /= count;
  cy /= count;
  cz /= count;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let index = 0; index < count; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % count]!;
    const ax = current.x - cx;
    const ay = current.y - cy;
    const az = current.z - cz;
    const bx = next.x - cx;
    const by = next.y - cy;
    const bz = next.z - cz;
    nx += (ay - by) * (az + bz);
    ny += (az - bz) * (ax + bx);
    nz += (ax - bx) * (ay + by);
  }
  const area = Math.hypot(nx, ny, nz) / 2;
  const normal = normalize3(nx, ny, nz);
  if (!normal || !(area > 0)) return null;

  const projected: StudioMeshVec3[] = [];
  let longest = 0;
  for (let index = 0; index < count; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % count]!;
    const ex = next.x - current.x;
    const ey = next.y - current.y;
    const ez = next.z - current.z;
    const along = ex * normal.x + ey * normal.y + ez * normal.z;
    const px = ex - normal.x * along;
    const py = ey - normal.y * along;
    const pz = ez - normal.z * along;
    longest = Math.max(longest, Math.hypot(px, py, pz));
    projected.push({ x: px, y: py, z: pz });
  }
  const threshold = longest * 0.01;
  const chosen = projected.find((edge) => Math.hypot(edge.x, edge.y, edge.z) >= threshold && threshold > 0)
    ?? projected[0]!;
  const u = normalize3(chosen.x, chosen.y, chosen.z);
  if (!u) return null;
  // v = normal x u
  const v: StudioMeshVec3 = {
    x: normal.y * u.z - normal.z * u.y,
    y: normal.z * u.x - normal.x * u.z,
    z: normal.x * u.y - normal.y * u.x,
  };
  return { origin: { x: cx, y: cy, z: cz }, u, v, normal, area };
}

export function projectToStudioPlanarFrame(
  frame: StudioPlanarFrame,
  point: StudioMeshVec3,
): StudioPlanarPoint {
  const x = point.x - frame.origin.x;
  const y = point.y - frame.origin.y;
  const z = point.z - frame.origin.z;
  return [
    x * frame.u.x + y * frame.u.y + z * frame.u.z,
    x * frame.v.x + y * frame.v.y + z * frame.v.z,
  ];
}

export function unprojectFromStudioPlanarFrame(
  frame: StudioPlanarFrame,
  point: StudioPlanarPoint,
): StudioMeshVec3 {
  return {
    x: frame.origin.x + frame.u.x * point[0] + frame.v.x * point[1],
    y: frame.origin.y + frame.u.y * point[0] + frame.v.y * point[1],
    z: frame.origin.z + frame.u.z * point[0] + frame.v.z * point[1],
  };
}

/** 평면에서 점까지의 부호 있는 거리(법선 방향이 양수). */
export function studioPlanarFrameDistance(frame: StudioPlanarFrame, point: StudioMeshVec3): number {
  return (point.x - frame.origin.x) * frame.normal.x
    + (point.y - frame.origin.y) * frame.normal.y
    + (point.z - frame.origin.z) * frame.normal.z;
}

function segmentsTouch(
  a: StudioPlanarPoint,
  b: StudioPlanarPoint,
  c: StudioPlanarPoint,
  d: StudioPlanarPoint,
  tolerance: number,
): boolean {
  const scale = Math.max(length2(sub2(b, a)), length2(sub2(d, c)), 1e-300);
  const eps = tolerance * scale;
  const abC = orient(a, b, c);
  const abD = orient(a, b, d);
  const cdA = orient(c, d, a);
  const cdB = orient(c, d, b);
  if (((abC > eps && abD < -eps) || (abC < -eps && abD > eps))
    && ((cdA > eps && cdB < -eps) || (cdA < -eps && cdB > eps))) {
    return true;
  }
  const within = (p: StudioPlanarPoint, s: StudioPlanarPoint, e: StudioPlanarPoint, o: number) => (
    Math.abs(o) <= eps
    && p[0] >= Math.min(s[0], e[0]) - tolerance * scale
    && p[0] <= Math.max(s[0], e[0]) + tolerance * scale
    && p[1] >= Math.min(s[1], e[1]) - tolerance * scale
    && p[1] <= Math.max(s[1], e[1]) + tolerance * scale
  );
  return within(c, a, b, abC) || within(d, a, b, abD) || within(a, c, d, cdA) || within(b, c, d, cdB);
}

/** 서로 이웃하지 않은 모서리 쌍이 닿거나 교차하면 그 첫 쌍을 돌려준다(이웃 모서리의 되접힘은 호출자가 따로 본다). */
function findSelfContact(
  polygon: readonly StudioPlanarPoint[],
): readonly [first: number, second: number] | null {
  const count = polygon.length;
  for (let first = 0; first < count; first += 1) {
    for (let second = first + 2; second < count; second += 1) {
      if (first === 0 && second === count - 1) continue;
      if (segmentsTouch(
        polygon[first]!,
        polygon[(first + 1) % count]!,
        polygon[second]!,
        polygon[(second + 1) % count]!,
        1e-12,
      )) {
        return [first, second];
      }
    }
  }
  return null;
}

/** 다각형의 형태(볼록·단순·일직선 꼭짓점·되접힘)를 한 번에 분석한다. 꼭짓점이 3개 미만이면 모두 false. */
export function describeStudioPlanarPolygon(
  polygon: readonly StudioPlanarPoint[],
  turnTolerance: number = TURN_TOLERANCE,
): StudioPlanarPolygonShape {
  const count = polygon.length;
  const empty: StudioPlanarPolygonShape = {
    signedArea: 0,
    convex: false,
    strictlyConvex: false,
    simple: false,
    collinearCorners: [],
    spikeCorners: [],
    selfContact: null,
    minEdgeLength: 0,
    maxEdgeLength: 0,
  };
  if (count < 3) return empty;
  const directions: StudioPlanarPoint[] = [];
  let minEdge = Number.POSITIVE_INFINITY;
  let maxEdge = 0;
  for (let index = 0; index < count; index += 1) {
    const edge = sub2(polygon[(index + 1) % count]!, polygon[index]!);
    const length = length2(edge);
    minEdge = Math.min(minEdge, length);
    maxEdge = Math.max(maxEdge, length);
    directions.push(length > 0 ? [edge[0] / length, edge[1] / length] : [0, 0]);
  }
  const collinearCorners: number[] = [];
  const spikeCorners: number[] = [];
  let reflex = false;
  let turning = 0;
  for (let index = 0; index < count; index += 1) {
    const before = directions[(index + count - 1) % count]!;
    const after = directions[index]!;
    const sine = cross2(before, after);
    const cosine = dot2(before, after);
    turning += Math.atan2(sine, cosine);
    if (Math.abs(sine) <= turnTolerance) {
      if (cosine < 0) spikeCorners.push(index);
      else collinearCorners.push(index);
    } else if (sine < 0) {
      reflex = true;
    }
  }
  const signedArea = polygonSignedArea(polygon);
  const oneTurn = Math.abs(turning - 2 * Math.PI) <= 1e-6;
  const convex = !reflex && spikeCorners.length === 0 && oneTurn && minEdge > 0;

  const selfContact = convex || minEdge <= 0 ? null : findSelfContact(polygon);
  const simple = convex || (spikeCorners.length === 0 && minEdge > 0 && selfContact === null);
  return {
    signedArea,
    convex,
    strictlyConvex: convex && collinearCorners.length === 0,
    simple,
    collinearCorners,
    spikeCorners,
    selfContact,
    minEdgeLength: Number.isFinite(minEdge) ? minEdge : 0,
    maxEdgeLength: maxEdge,
  };
}

/**
 * 반시계 볼록 다각형 안쪽으로 점이 얼마나 들어와 있는지(모서리 직선까지의 최소 부호 거리).
 * 양수면 안쪽, 0이면 경계, 음수면 바깥이다.
 */
export function convexPolygonInsetMargin(
  polygon: readonly StudioPlanarPoint[],
  point: StudioPlanarPoint,
): number {
  let margin = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]!;
    const end = polygon[(index + 1) % polygon.length]!;
    const edge = sub2(end, start);
    const length = length2(edge);
    if (!(length > 0)) continue;
    margin = Math.min(margin, cross2(edge, sub2(point, start)) / length);
  }
  return Number.isFinite(margin) ? margin : Number.NEGATIVE_INFINITY;
}

function inwardNormals(polygon: readonly StudioPlanarPoint[]): StudioPlanarPoint[] {
  return polygon.map((start, index) => {
    const end = polygon[(index + 1) % polygon.length]!;
    const edge = sub2(end, start);
    const length = length2(edge) || 1;
    return [-edge[1] / length, edge[0] / length] as const;
  });
}

function miterVectors(polygon: readonly StudioPlanarPoint[]): StudioPlanarPoint[] {
  const normals = inwardNormals(polygon);
  return polygon.map((_, index) => {
    const before = normals[(index + polygon.length - 1) % polygon.length]!;
    const after = normals[index]!;
    const denominator = 1 + dot2(before, after);
    // 되접힘(denominator 0)은 호출자가 먼저 걸러야 한다. 여기서는 무한대를 만들지 않도록 막는다.
    const safe = Math.abs(denominator) < 1e-12 ? 1e-12 : denominator;
    return [(before[0] + after[0]) / safe, (before[1] + after[1]) / safe] as const;
  });
}

/**
 * 반시계 볼록 다각형을 `inwardDistance`만큼 안쪽(양수) 또는 바깥쪽(음수)으로 mitre 오프셋한다.
 * 모서리마다 평행선을 그어 이웃한 평행선의 교점을 새 꼭짓점으로 삼으므로 모서리 수가 그대로다.
 * 붕괴 여부는 판단하지 않는다(`maxInwardOffsetDistance`와 `mitreLengthRatio`로 먼저 확인).
 */
export function offsetConvexPolygon(
  polygon: readonly StudioPlanarPoint[],
  inwardDistance: number,
): StudioPlanarPoint[] {
  const miters = miterVectors(polygon);
  return polygon.map((point, index) => [
    point[0] + miters[index]![0] * inwardDistance,
    point[1] + miters[index]![1] * inwardDistance,
  ] as const);
}

/** 가장 뾰족한 꼭짓점에서 mitre 길이가 오프셋 거리의 몇 배인지. 직각이면 약 1.41, 정삼각형이면 2. */
export function mitreLengthRatio(polygon: readonly StudioPlanarPoint[]): number {
  let ratio = 1;
  for (const miter of miterVectors(polygon)) ratio = Math.max(ratio, length2(miter));
  return ratio;
}

/**
 * 안쪽 오프셋 때 모든 모서리가 `minFeature`보다 길게 남는 최대 거리.
 * 더 크게 밀면 어떤 모서리가 사라져 꼭짓점 수가 달라진다(붕괴). 붕괴하지 않으면 Infinity.
 */
export function maxInwardOffsetDistance(
  polygon: readonly StudioPlanarPoint[],
  minFeature: number,
): number {
  const count = polygon.length;
  const directions = polygon.map((start, index) => {
    const edge = sub2(polygon[(index + 1) % count]!, start);
    const length = length2(edge) || 1;
    return { unit: [edge[0] / length, edge[1] / length] as const, length: length2(edge) };
  });
  // 꼭짓점마다 오프셋 1당 모서리를 따라 잠식되는 길이: tan(회전각/2).
  const trim = directions.map((_, index) => {
    const before = directions[(index + count - 1) % count]!.unit;
    const after = directions[index]!.unit;
    const denominator = 1 + dot2(before, after);
    return denominator > 1e-12 ? Math.max(0, cross2(before, after)) / denominator : Number.POSITIVE_INFINITY;
  });
  let limit = Number.POSITIVE_INFINITY;
  for (let index = 0; index < count; index += 1) {
    const consumption = trim[index]! + trim[(index + 1) % count]!;
    if (!(consumption > 1e-15)) continue;
    limit = Math.min(limit, (directions[index]!.length - minFeature) / consumption);
  }
  return limit < 0 ? 0 : limit;
}

/**
 * 볼록 다각형 `inner`를 바깥쪽으로 mitre 오프셋할 때, 새 꼭짓점이 모두 볼록 용기 `container`
 * (반시계) 안쪽으로 `margin` 이상 떨어져 있게 하는 최대 오프셋 거리. 이미 어긋나 있으면 0.
 */
export function maxOutwardOffsetWithin(
  inner: readonly StudioPlanarPoint[],
  container: readonly StudioPlanarPoint[],
  margin: number,
): number {
  const miters = miterVectors(inner);
  const normals = inwardNormals(container);
  let limit = Number.POSITIVE_INFINITY;
  for (let vertex = 0; vertex < inner.length; vertex += 1) {
    const point = inner[vertex]!;
    const miter = miters[vertex]!;
    for (let edge = 0; edge < container.length; edge += 1) {
      const start = container[edge]!;
      const normal = normals[edge]!;
      // 바깥쪽으로 d만큼 밀면 모서리 직선까지의 거리가 d * (normal . miter)만큼 줄어든다.
      const closing = dot2(normal, miter);
      if (!(closing > 1e-15)) continue;
      const slack = dot2(normal, sub2(point, start)) - margin;
      limit = Math.min(limit, slack / closing);
    }
  }
  return limit < 0 ? 0 : limit;
}

/**
 * 안쪽 볼록 다각형이 바깥 볼록 다각형 안에 있을 때, 그 사이 고리를 삼각형으로 나눈다.
 * 두 다각형 모두 반시계이고 안쪽 다각형은 바깥 다각형의 경계에 닿지 않아야 한다.
 *
 * 두 다각형의 모서리 방향각을 한 줄로 합쳐(회전 캘리퍼스 방식) 같은 법선 방향의 극점끼리 잇는다.
 * 연결선의 두 끝은 같은 방향으로 가장 먼 점이고 안쪽 다각형은 그 방향의 지지선 한쪽에만 있으므로
 * 연결선은 안쪽 다각형을 가로지를 수 없고, 바깥 다각형은 볼록이라 밖으로 나가지도 않는다.
 * 각도 순서로 잇는 방식은 길쭉한 안쪽 도형에서 바깥 꼭짓점이 볼 수 없는 모서리와 이어져 깨진다.
 * 삼각형이 모두 양의 면적이고 면적 합이 고리 면적과 같을 때만 결과를 돌려주고, 그렇지 않으면 null을
 * 돌려 호출자가 입력을 거부하게 한다.
 */
export function triangulateConvexAnnulus(
  outer: readonly StudioPlanarPoint[],
  inner: readonly StudioPlanarPoint[],
): StudioAnnulusTriangulation | null {
  const outerCount = outer.length;
  const innerCount = inner.length;
  if (outerCount < 3 || innerCount < 3) return null;
  const outerArea = polygonSignedArea(outer);
  const innerArea = polygonSignedArea(inner);
  if (!(outerArea > 0) || !(innerArea > 0) || !(outerArea > innerArea)) return null;

  const tau = Math.PI * 2;
  const edgeAngles = (polygon: readonly StudioPlanarPoint[]): number[] => polygon.map((point, index) => {
    const next = polygon[(index + 1) % polygon.length]!;
    return Math.atan2(next[1] - point[1], next[0] - point[0]);
  });
  const outerEdgeAngles = edgeAngles(outer);
  const innerEdgeAngles = edgeAngles(inner);
  // 어느 모서리 방향과도 겹치지 않는 가장 넓은 빈 구간의 가운데를 자름선으로 삼아 반올림 오차로 순서가 뒤집히지 않게 한다.
  const sorted = [...outerEdgeAngles, ...innerEdgeAngles].sort((a, b) => a - b);
  let widestGap = -1;
  let cut = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    const from = sorted[index]!;
    const to = index + 1 < sorted.length ? sorted[index + 1]! : sorted[0]! + tau;
    if (to - from > widestGap) {
      widestGap = to - from;
      cut = from + (to - from) / 2;
    }
  }
  const relative = (angle: number): number => {
    let value = (angle - cut) % tau;
    if (value < 0) value += tau;
    return value;
  };
  const prepare = (angles: readonly number[]): { start: number; sequence: number[] } | null => {
    const relatives = angles.map(relative);
    let start = 0;
    for (let index = 1; index < relatives.length; index += 1) {
      if (relatives[index]! < relatives[start]!) start = index;
    }
    const sequence = relatives.map((_, step) => relatives[(start + step) % relatives.length]!);
    for (let step = 1; step < sequence.length; step += 1) {
      if (sequence[step]! < sequence[step - 1]! - 1e-12) return null;
    }
    return { start, sequence };
  };
  const outerOrder = prepare(outerEdgeAngles);
  const innerOrder = prepare(innerEdgeAngles);
  if (!outerOrder || !innerOrder) return null;

  const triangles: [number, number, number][] = [];
  let outerStep = 0;
  let innerStep = 0;
  while (outerStep < outerCount || innerStep < innerCount) {
    const nextOuter = outerStep < outerCount ? outerOrder.sequence[outerStep]! : Number.POSITIVE_INFINITY;
    const nextInner = innerStep < innerCount ? innerOrder.sequence[innerStep]! : Number.POSITIVE_INFINITY;
    const currentOuter = (outerOrder.start + outerStep) % outerCount;
    const currentInner = (innerOrder.start + innerStep) % innerCount;
    if (nextOuter <= nextInner) {
      triangles.push([currentOuter, (currentOuter + 1) % outerCount, outerCount + currentInner]);
      outerStep += 1;
    } else {
      triangles.push([
        outerCount + ((currentInner + 1) % innerCount),
        outerCount + currentInner,
        currentOuter,
      ]);
      innerStep += 1;
    }
  }

  const points: StudioPlanarPoint[] = [...outer, ...inner];
  const scale = Math.max(outerArea, 1e-300);
  let total = 0;
  for (const [a, b, c] of triangles) {
    const area = orient(points[a]!, points[b]!, points[c]!) / 2;
    if (!(area > scale * 1e-14)) return null;
    total += area;
  }
  if (Math.abs(total - (outerArea - innerArea)) > scale * 1e-9) return null;
  return { triangles };
}

function turnSine(
  before: StudioPlanarPoint,
  corner: StudioPlanarPoint,
  after: StudioPlanarPoint,
): number {
  const first = sub2(corner, before);
  const second = sub2(after, corner);
  const lengths = length2(first) * length2(second);
  return lengths > 0 ? cross2(first, second) / lengths : 0;
}

/**
 * 같은 평면의 반시계 삼각형(또는 볼록 다각형)을 인접한 것끼리 합쳐 면 수를 줄인다(Hertel-Mehlhorn 방식).
 * 합친 결과가 엄격한 볼록(일직선 꼭짓점 없음)이고 `accept`가 true이며 꼭짓점이 `maxCorners` 이하일 때만 합친다.
 * 입력 순서와 모서리 순서로 결정되는 탐색이라 같은 입력은 같은 결과를 낸다.
 */
export function mergeStudioPlanarPolygons(
  points: readonly StudioPlanarPoint[],
  loops: readonly (readonly number[])[],
  accept: (loop: readonly number[]) => boolean,
  maxCorners = 12,
): number[][] {
  const polygons: (number[] | null)[] = loops.map((loop) => [...loop]);
  const owner = new Map<string, number>();
  const key = (from: number, to: number) => `${from}|${to}`;
  const index = (polygonIndex: number) => {
    const loop = polygons[polygonIndex];
    if (!loop) return;
    for (let corner = 0; corner < loop.length; corner += 1) {
      owner.set(key(loop[corner]!, loop[(corner + 1) % loop.length]!), polygonIndex);
    }
  };
  const forget = (polygonIndex: number) => {
    const loop = polygons[polygonIndex];
    if (!loop) return;
    for (let corner = 0; corner < loop.length; corner += 1) {
      const edge = key(loop[corner]!, loop[(corner + 1) % loop.length]!);
      if (owner.get(edge) === polygonIndex) owner.delete(edge);
    }
  };
  polygons.forEach((_, polygonIndex) => index(polygonIndex));

  const tryMerge = (firstIndex: number, secondIndex: number, corner: number): number[] | null => {
    const first = polygons[firstIndex]!;
    const second = polygons[secondIndex]!;
    const from = first[corner]!;
    const to = first[(corner + 1) % first.length]!;
    const twin = second.findIndex((vertex, position) => (
      vertex === to && second[(position + 1) % second.length] === from
    ));
    if (twin < 0) return null;
    // first: to, ..., from  뒤에 second에서 from 다음부터 to 앞까지 이어 붙인다.
    const head: number[] = [];
    for (let step = 1; step <= first.length; step += 1) head.push(first[(corner + step) % first.length]!);
    const tail: number[] = [];
    for (let step = 2; step < second.length; step += 1) tail.push(second[(twin + step) % second.length]!);
    const merged = [...head, ...tail];
    if (merged.length > maxCorners) return null;
    const at = (position: number) => points[merged[(position + merged.length) % merged.length]!]!;
    const fromPosition = head.length - 1;
    const toPosition = 0;
    for (const position of [fromPosition, toPosition]) {
      if (!(turnSine(at(position - 1), at(position), at(position + 1)) > TURN_TOLERANCE)) return null;
    }
    return accept(merged) ? merged : null;
  };

  let merged = true;
  while (merged) {
    merged = false;
    for (let firstIndex = 0; firstIndex < polygons.length && !merged; firstIndex += 1) {
      const loop = polygons[firstIndex];
      if (!loop) continue;
      for (let corner = 0; corner < loop.length; corner += 1) {
        const secondIndex = owner.get(key(loop[(corner + 1) % loop.length]!, loop[corner]!));
        if (secondIndex === undefined || secondIndex === firstIndex || !polygons[secondIndex]) continue;
        const result = tryMerge(firstIndex, secondIndex, corner);
        if (!result) continue;
        forget(firstIndex);
        forget(secondIndex);
        polygons[firstIndex] = result;
        polygons[secondIndex] = null;
        index(firstIndex);
        merged = true;
        break;
      }
    }
  }
  return polygons.filter((loop): loop is number[] => loop !== null);
}
