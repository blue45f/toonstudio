/**
 * Wave 55 3D 셰이퍼+ 정밀 3D BSP CSG 불리언 솔버 및 T-접합(T-Junction) 수밀 복원기.
 *
 * - 창문·문 개구부 타공(Subtract), 소품 결합(Union), 교차(Intersect)를 3D 평면 분할(BSP)로 수행한다.
 * - BSP 분할 직후 필연적으로 발생하는 T-접합을 선분 정점 분할 + 내심 팬 삼각분할로 완전 치유해
 *   `nonManifoldEdges === 0`, `boundaryEdges === 0`의 수밀 솔리드를 보장한다.
 */

import {
  type CadEdgePair,
  type CadSolidMesh,
  type CadTriangle,
  DEFAULT_WELD_EPSILON_M,
  type Vec3,
  vec3Add,
  vec3Cross,
  vec3DistanceSq,
  vec3Dot,
  vec3Length,
  vec3LengthSq,
  vec3Lerp,
  vec3Normalize,
  vec3Scale,
  vec3Sub,
  weldAndFinalizeSolidMesh,
} from "./cad-manifold-primitives";

export type BooleanSolidOperationKind = "union" | "subtract" | "intersect";

export interface BooleanSolidOptions {
  readonly id?: string;
  readonly label?: string;
  readonly groundToFloorY0?: boolean;
}

interface BspPlane {
  normal: Vec3;
  w: number;
}

interface BspPolygon {
  vertices: Vec3[];
  plane: BspPlane;
}

const BSP_EPSILON = 1e-5;
const COPLANAR = 0;
const FRONT = 1;
const BACK = 2;
const SPANNING = 3;

function planeFromPoints(a: Vec3, b: Vec3, c: Vec3): BspPlane | null {
  const cross = vec3Cross(vec3Sub(b, a), vec3Sub(c, a));
  const len = vec3Length(cross);
  if (len <= 1e-11) return null;
  const normal: Vec3 = [cross[0] / len, cross[1] / len, cross[2] / len];
  return { normal, w: vec3Dot(normal, a) };
}

function flipPlane(plane: BspPlane): BspPlane {
  return {
    normal: [-plane.normal[0], -plane.normal[1], -plane.normal[2]],
    w: -plane.w,
  };
}

function clonePolygon(poly: BspPolygon): BspPolygon {
  return {
    vertices: poly.vertices.map((v) => [v[0], v[1], v[2]] as const),
    plane: { normal: [...poly.plane.normal] as Vec3, w: poly.plane.w },
  };
}

function flipPolygon(poly: BspPolygon): BspPolygon {
  return {
    vertices: [...poly.vertices].reverse(),
    plane: flipPlane(poly.plane),
  };
}

function splitPolygonByPlane(
  plane: BspPlane,
  polygon: BspPolygon,
  coplanarFront: BspPolygon[],
  coplanarBack: BspPolygon[],
  front: BspPolygon[],
  back: BspPolygon[],
): void {
  let polygonType = 0;
  const types: number[] = [];
  for (const v of polygon.vertices) {
    const t = vec3Dot(plane.normal, v) - plane.w;
    const type = t < -BSP_EPSILON ? BACK : t > BSP_EPSILON ? FRONT : COPLANAR;
    polygonType |= type;
    types.push(type);
  }

  if (polygonType === COPLANAR) {
    if (vec3Dot(plane.normal, polygon.plane.normal) > 0) {
      coplanarFront.push(polygon);
    } else {
      coplanarBack.push(polygon);
    }
    return;
  }
  if (polygonType === FRONT) {
    front.push(polygon);
    return;
  }
  if (polygonType === BACK) {
    back.push(polygon);
    return;
  }

  const f: Vec3[] = [];
  const b: Vec3[] = [];
  const count = polygon.vertices.length;
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    const ti = types[i] ?? COPLANAR;
    const tj = types[j] ?? COPLANAR;
    const vi = polygon.vertices[i];
    const vj = polygon.vertices[j];
    if (!vi || !vj) continue;

    if (ti !== BACK) f.push(vi);
    if (ti !== FRONT) b.push(vi);
    if ((ti | tj) === SPANNING) {
      const denom = vec3Dot(plane.normal, vec3Sub(vj, vi));
      if (Math.abs(denom) > 1e-12) {
        const t = (plane.w - vec3Dot(plane.normal, vi)) / denom;
        const splitPt = vec3Lerp(vi, vj, Math.max(0, Math.min(1, t)));
        f.push(splitPt);
        b.push(splitPt);
      }
    }
  }
  if (f.length >= 3) {
    front.push({ vertices: f, plane: polygon.plane });
  }
  if (b.length >= 3) {
    back.push({ vertices: b, plane: polygon.plane });
  }
}

class BspNode {
  plane: BspPlane | null = null;
  front: BspNode | null = null;
  back: BspNode | null = null;
  polygons: BspPolygon[] = [];

  constructor(polygons?: BspPolygon[]) {
    if (polygons && polygons.length > 0) {
      this.build(polygons);
    }
  }

  invert(): void {
    for (let i = 0; i < this.polygons.length; i += 1) {
      const poly = this.polygons[i];
      if (poly) this.polygons[i] = flipPolygon(poly);
    }
    if (this.plane) this.plane = flipPlane(this.plane);
    if (this.front) this.front.invert();
    if (this.back) this.back.invert();
    const prevFront = this.front;
    this.front = this.back;
    this.back = prevFront;
  }

  clipPolygons(polygons: BspPolygon[]): BspPolygon[] {
    if (!this.plane) return polygons.map(clonePolygon);
    let front: BspPolygon[] = [];
    let back: BspPolygon[] = [];
    for (const poly of polygons) {
      splitPolygonByPlane(this.plane, poly, front, back, front, back);
    }
    if (this.front) front = this.front.clipPolygons(front);
    back = this.back ? this.back.clipPolygons(back) : [];
    return front.concat(back);
  }

  clipTo(other: BspNode): void {
    this.polygons = other.clipPolygons(this.polygons);
    if (this.front) this.front.clipTo(other);
    if (this.back) this.back.clipTo(other);
  }

  allPolygons(): BspPolygon[] {
    let result = this.polygons.slice();
    if (this.front) result = result.concat(this.front.allPolygons());
    if (this.back) result = result.concat(this.back.allPolygons());
    return result;
  }

  build(polygons: BspPolygon[]): void {
    if (polygons.length === 0) return;
    if (!this.plane) {
      const seed = polygons[0];
      if (!seed) return;
      this.plane = { normal: [...seed.plane.normal] as Vec3, w: seed.plane.w };
    }
    const front: BspPolygon[] = [];
    const back: BspPolygon[] = [];
    for (const poly of polygons) {
      splitPolygonByPlane(this.plane, poly, this.polygons, this.polygons, front, back);
    }
    if (front.length > 0) {
      if (!this.front) this.front = new BspNode();
      this.front.build(front);
    }
    if (back.length > 0) {
      if (!this.back) this.back = new BspNode();
      this.back.build(back);
    }
  }
}

function solidToBspPolygons(solid: CadSolidMesh): BspPolygon[] {
  const polys: BspPolygon[] = [];
  for (const tri of solid.triangles) {
    const a = solid.vertices[tri[0]];
    const b = solid.vertices[tri[1]];
    const c = solid.vertices[tri[2]];
    if (!a || !b || !c) continue;
    const plane = planeFromPoints(a, b, c);
    if (!plane) continue;
    polys.push({ vertices: [a, b, c], plane });
  }
  return polys;
}

/**
 * BSP 출력 볼록 다각형 집합의 모든 경계 모서리에 T-접합 정점을 삽입하고,
 * 공선 정점이 존재하는 다각형은 엄격 내심 팬으로 삼각분할해 100% 수밀 토폴로지를 복원한다.
 */
function healTJunctionsAndConvertToMesh(
  polygons: readonly BspPolygon[],
  options: { id: string; label: string; groundToFloorY0: boolean; operation: BooleanSolidOperationKind },
): CadSolidMesh {
  const weldEps = DEFAULT_WELD_EPSILON_M;
  const weldEpsSq = weldEps * weldEps;
  const canonicalVerts: Vec3[] = [];

  const internVertex = (pt: Vec3): number => {
    for (let i = 0; i < canonicalVerts.length; i += 1) {
      const existing = canonicalVerts[i];
      if (existing && vec3DistanceSq(existing, pt) <= weldEpsSq) {
        return i;
      }
    }
    const idx = canonicalVerts.length;
    canonicalVerts.push(pt);
    return idx;
  };

  // 1단계: 다각형별 중복 연속 정점 정리 및 표준 정점 인덱스 등록
  const indexedPolys: Array<{ indices: number[]; plane: BspPlane }> = [];
  for (const poly of polygons) {
    const ids: number[] = [];
    for (const v of poly.vertices) {
      const id = internVertex(v);
      if (ids[ids.length - 1] === id) continue;
      ids.push(id);
    }
    while (ids.length >= 2 && ids[0] === ids[ids.length - 1]) {
      ids.pop();
    }
    if (ids.length >= 3) {
      indexedPolys.push({ indices: ids, plane: poly.plane });
    }
  }

  // 2단계: 모든 모서리 위 T-접합 정점 분할
  const rawVertices: Vec3[] = [...canonicalVerts];
  const rawTriangles: CadTriangle[] = [];
  const tEps = 2e-5;
  const tEpsSq = tEps * tEps;

  for (const poly of indexedPolys) {
    const healedLoop: number[] = [];
    const m = poly.indices.length;
    for (let i = 0; i < m; i += 1) {
      const aIdx = poly.indices[i] ?? 0;
      const bIdx = poly.indices[(i + 1) % m] ?? 0;
      const a = canonicalVerts[aIdx];
      const b = canonicalVerts[bIdx];
      if (!a || !b) continue;
      healedLoop.push(aIdx);

      const ab = vec3Sub(b, a);
      const abLenSq = vec3LengthSq(ab);
      if (abLenSq <= 1e-12) continue;

      const splits: Array<{ id: number; t: number }> = [];
      for (let vIdx = 0; vIdx < canonicalVerts.length; vIdx += 1) {
        if (vIdx === aIdx || vIdx === bIdx) continue;
        const p = canonicalVerts[vIdx];
        if (!p) continue;
        const t = vec3Dot(vec3Sub(p, a), ab) / abLenSq;
        if (t <= 1e-5 || t >= 1 - 1e-5) continue;
        const proj = vec3Add(a, vec3Scale(ab, t));
        if (vec3DistanceSq(p, proj) <= tEpsSq) {
          splits.push({ id: vIdx, t });
        }
      }
      if (splits.length > 0) {
        splits.sort((x, y) => x.t - y.t);
        for (const s of splits) {
          if (healedLoop[healedLoop.length - 1] !== s.id) {
            healedLoop.push(s.id);
          }
        }
      }
    }

    if (healedLoop.length < 3) continue;
    if (healedLoop.length === 3) {
      rawTriangles.push([healedLoop[0] ?? 0, healedLoop[1] ?? 0, healedLoop[2] ?? 0]);
      continue;
    }

    // 3단계: 볼록 다각형 엄격 코너 평균(내심) 기반 팬 삼각분할 -> 모든 경계 분할 모서리 보존
    const corners: Vec3[] = [];
    const kLen = healedLoop.length;
    for (let i = 0; i < kLen; i += 1) {
      const prev = rawVertices[healedLoop[(i + kLen - 1) % kLen] ?? 0];
      const curr = rawVertices[healedLoop[i] ?? 0];
      const next = rawVertices[healedLoop[(i + 1) % kLen] ?? 0];
      if (!prev || !curr || !next) continue;
      const d1 = vec3Normalize(vec3Sub(curr, prev));
      const d2 = vec3Normalize(vec3Sub(next, curr));
      if (vec3Length(vec3Cross(d1, d2)) > 1e-4) {
        corners.push(curr);
      }
    }
    if (corners.length < 3) continue;

    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const pt of corners) {
      cx += pt[0];
      cy += pt[1];
      cz += pt[2];
    }
    const centerIdx = rawVertices.length;
    rawVertices.push([cx / corners.length, cy / corners.length, cz / corners.length]);

    for (let i = 0; i < kLen; i += 1) {
      const u = healedLoop[i] ?? 0;
      const v = healedLoop[(i + 1) % kLen] ?? 0;
      rawTriangles.push([centerIdx, u, v]);
    }
  }

  // 이면각 60도 이상인 날카로운 교차 경계를 하드 엣지로 자동 마킹
  const hardEdges = extractSharpHardEdges(rawVertices, rawTriangles, 60);

  return weldAndFinalizeSolidMesh({
    id: options.id,
    label: options.label,
    rawVertices,
    rawTriangles,
    groundToFloorY0: options.groundToFloorY0,
    hardEdges,
    metadata: {
      generator: `csg-${options.operation}`,
      booleanOperation: options.operation,
    },
  });
}

function extractSharpHardEdges(
  vertices: readonly Vec3[],
  triangles: readonly CadTriangle[],
  minAngleDeg: number,
): CadEdgePair[] {
  const cosLimit = Math.cos((minAngleDeg * Math.PI) / 180);
  const map = new Map<string, { u: number; v: number; normal: Vec3 }>();
  const sharp: CadEdgePair[] = [];
  for (const tri of triangles) {
    const a = vertices[tri[0]];
    const b = vertices[tri[1]];
    const c = vertices[tri[2]];
    if (!a || !b || !c) continue;
    const cross = vec3Cross(vec3Sub(b, a), vec3Sub(c, a));
    const len = vec3Length(cross);
    if (len <= 1e-11) continue;
    const normal: Vec3 = [cross[0] / len, cross[1] / len, cross[2] / len];
    const pairs: Array<[number, number]> = [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]];
    for (const [u, v] of pairs) {
      const lo = u < v ? u : v;
      const hi = u < v ? v : u;
      const key = `${lo}:${hi}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { u: lo, v: hi, normal });
      } else if (vec3Dot(existing.normal, normal) <= cosLimit) {
        sharp.push([lo, hi]);
      }
    }
  }
  return sharp;
}

/**
 * 두 수밀 3D 솔리드 사이의 합집합(`union`), 차집합(`subtract`), 교집합(`intersect`) 불리언을 수행한다.
 */
export function booleanSolidOperation(
  solidA: CadSolidMesh,
  solidB: CadSolidMesh,
  operation: BooleanSolidOperationKind,
  options: BooleanSolidOptions = {},
): CadSolidMesh {
  const a = new BspNode(solidToBspPolygons(solidA));
  const b = new BspNode(solidToBspPolygons(solidB));

  if (operation === "union") {
    a.clipTo(b);
    b.clipTo(a);
    b.invert();
    b.clipTo(a);
    b.invert();
    a.build(b.allPolygons());
  } else if (operation === "subtract") {
    a.invert();
    a.clipTo(b);
    b.clipTo(a);
    b.invert();
    b.clipTo(a);
    b.invert();
    a.build(b.allPolygons());
    a.invert();
  } else {
    a.invert();
    b.clipTo(a);
    b.invert();
    a.clipTo(b);
    b.clipTo(a);
    a.build(b.allPolygons());
    a.invert();
  }

  return healTJunctionsAndConvertToMesh(a.allPolygons(), {
    id: options.id ?? `${solidA.id}-${operation}-${solidB.id}`,
    label: options.label ?? `${solidA.label} ${operation} ${solidB.label}`,
    groundToFloorY0: options.groundToFloorY0 ?? false,
    operation,
  });
}

export function booleanSolidUnion(
  solidA: CadSolidMesh,
  solidB: CadSolidMesh,
  options?: BooleanSolidOptions,
): CadSolidMesh {
  return booleanSolidOperation(solidA, solidB, "union", options);
}

export function booleanSolidSubtract(
  solidA: CadSolidMesh,
  solidB: CadSolidMesh,
  options?: BooleanSolidOptions,
): CadSolidMesh {
  return booleanSolidOperation(solidA, solidB, "subtract", options);
}

export function booleanSolidIntersect(
  solidA: CadSolidMesh,
  solidB: CadSolidMesh,
  options?: BooleanSolidOptions,
): CadSolidMesh {
  return booleanSolidOperation(solidA, solidB, "intersect", options);
}
