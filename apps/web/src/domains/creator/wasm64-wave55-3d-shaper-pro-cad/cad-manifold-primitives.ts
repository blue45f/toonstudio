/**
 * Wave 55 3D 셰이퍼+ 공용 수밀(Manifold) 메쉬 기하 프리미티브 및 벡터 연산.
 *
 * - 좌표계: glTF 표준 오른손 좌표계(Y-Up, 실측 미터 단위 `1.0 = 1m`, 바닥 접지 `Y = 0`)
 * - 수밀 보증: 공간 해시 정점 용접, 퇴화 삼각형 제거, 고립 정점 제거, 외향 와인딩 보정, 메트릭 삼면 UV 생성
 */

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];
export type CadTriangle = readonly [number, number, number];
export type CadEdgePair = readonly [number, number];

export type Mat4 = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

export interface Aabb3 {
  readonly min: Vec3;
  readonly max: Vec3;
  readonly size: Vec3;
  readonly center: Vec3;
}

export interface CadSolidMesh {
  readonly id: string;
  readonly label: string;
  readonly vertices: readonly Vec3[];
  readonly triangles: readonly CadTriangle[];
  readonly normals: readonly Vec3[];
  readonly uvs: readonly Vec2[];
  readonly bounds: Aabb3;
  readonly signedVolumeM3: number;
  readonly surfaceAreaM2: number;
  readonly hardEdges: readonly CadEdgePair[];
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface SolidManifoldAuditReport {
  readonly isWatertight: boolean;
  readonly vertexCount: number;
  readonly uniqueEdgeCount: number;
  readonly triangleCount: number;
  readonly shellCount: number;
  readonly boundaryEdges: number;
  readonly nonManifoldEdges: number;
  readonly reversedWindingEdges: number;
  readonly looseVertices: number;
  readonly degenerateTriangles: number;
  readonly eulerCharacteristic: number;
  readonly estimatedGenus: number | null;
  readonly signedVolumeM3: number;
  readonly outwardNormalsConsistent: boolean;
  readonly minY: number;
  readonly isFloorGrounded: boolean;
  readonly hasValidUvs: boolean;
  readonly issues: readonly string[];
}

export interface FinalizeSolidMeshInput {
  readonly id: string;
  readonly label: string;
  readonly rawVertices: readonly Vec3[];
  readonly rawTriangles: readonly CadTriangle[];
  readonly groundToFloorY0?: boolean;
  readonly weldEpsilon?: number;
  readonly hardEdges?: readonly CadEdgePair[];
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export const GEOMETRY_EPSILON = 1e-6;
export const DEFAULT_WELD_EPSILON_M = 1e-5;
export const DEGENERATE_AREA_THRESHOLD = 1e-10;

export function cleanZero(value: number): number {
  return Math.abs(value) < 1e-12 ? 0 : value;
}

export function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function vec3Scale(a: Vec3, scalar: number): Vec3 {
  return [a[0] * scalar, a[1] * scalar, a[2] * scalar];
}

export function vec3Dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function vec3LengthSq(a: Vec3): number {
  return a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
}

export function vec3Length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function vec3Distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function vec3DistanceSq(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

export function vec3Normalize(a: Vec3): Vec3 {
  const len = vec3Length(a);
  if (len <= 1e-12) return [0, 1, 0];
  return [a[0] / len, a[1] / len, a[2] / len];
}

export function vec3Lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function undirectedEdgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function triangleNormalAndArea(
  a: Vec3,
  b: Vec3,
  c: Vec3,
): { readonly normal: Vec3; readonly area: number; readonly cross: Vec3 } {
  const ab = vec3Sub(b, a);
  const ac = vec3Sub(c, a);
  const cross = vec3Cross(ab, ac);
  const crossLen = vec3Length(cross);
  const area = crossLen * 0.5;
  const normal: Vec3 = crossLen > 1e-12
    ? [cross[0] / crossLen, cross[1] / crossLen, cross[2] / crossLen]
    : [0, 1, 0];
  return { normal, area, cross };
}

export function computeBounds(vertices: readonly Vec3[]): Aabb3 {
  if (vertices.length === 0) {
    return { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0], center: [0, 0, 0] };
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const v of vertices) {
    if (v[0] < minX) minX = v[0];
    if (v[1] < minY) minY = v[1];
    if (v[2] < minZ) minZ = v[2];
    if (v[0] > maxX) maxX = v[0];
    if (v[1] > maxY) maxY = v[1];
    if (v[2] > maxZ) maxZ = v[2];
  }
  return {
    min: [cleanZero(minX), cleanZero(minY), cleanZero(minZ)],
    max: [cleanZero(maxX), cleanZero(maxY), cleanZero(maxZ)],
    size: [cleanZero(maxX - minX), cleanZero(maxY - minY), cleanZero(maxZ - minZ)],
    center: [
      cleanZero((minX + maxX) * 0.5),
      cleanZero((minY + maxY) * 0.5),
      cleanZero((minZ + maxZ) * 0.5),
    ],
  };
}

export function computeSignedVolumeAndArea(
  vertices: readonly Vec3[],
  triangles: readonly CadTriangle[],
): { readonly signedVolumeM3: number; readonly surfaceAreaM2: number } {
  let volume6 = 0;
  let areaSum = 0;
  for (const tri of triangles) {
    const a = vertices[tri[0]];
    const b = vertices[tri[1]];
    const c = vertices[tri[2]];
    if (!a || !b || !c) continue;
    volume6 += vec3Dot(a, vec3Cross(b, c));
    areaSum += triangleNormalAndArea(a, b, c).area;
  }
  return {
    signedVolumeM3: volume6 / 6,
    surfaceAreaM2: areaSum,
  };
}

function projectTriplanarMetricUv(position: Vec3, normal: Vec3): Vec2 {
  const ax = Math.abs(normal[0]);
  const ay = Math.abs(normal[1]);
  const az = Math.abs(normal[2]);
  if (ay >= ax && ay >= az) {
    return [cleanZero(position[0]), cleanZero(position[2])];
  }
  if (ax >= ay && ax >= az) {
    return [cleanZero(position[2]), cleanZero(position[1])];
  }
  return [cleanZero(position[0]), cleanZero(position[1])];
}

/**
 * 3x3x3 공간 해시로 미세 중복 정점을 용접하고, 퇴화·고립 요소를 제거한 뒤
 * 외향 법선·바닥 접지(`Y = 0`)·메트릭 UV를 완성해 수밀 솔리드 메쉬를 반환한다.
 */
export function weldAndFinalizeSolidMesh(input: FinalizeSolidMeshInput): CadSolidMesh {
  const eps = Math.max(1e-8, input.weldEpsilon ?? DEFAULT_WELD_EPSILON_M);
  const epsSq = eps * eps;
  const cellSize = eps * 2;
  const buckets = new Map<string, number[]>();
  const weldedVerts: Vec3[] = [];
  const rawToWelded: number[] = [];

  for (let i = 0; i < input.rawVertices.length; i += 1) {
    const v = input.rawVertices[i];
    if (!v) continue;
    const cx = Math.floor(v[0] / cellSize);
    const cy = Math.floor(v[1] / cellSize);
    const cz = Math.floor(v[2] / cellSize);
    let matched = -1;
    outer: for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const list = buckets.get(`${cx + dx},${cy + dy},${cz + dz}`);
          if (!list) continue;
          for (const candidateIdx of list) {
            const existing = weldedVerts[candidateIdx];
            if (existing && vec3DistanceSq(existing, v) <= epsSq) {
              matched = candidateIdx;
              break outer;
            }
          }
        }
      }
    }
    if (matched >= 0) {
      rawToWelded[i] = matched;
    } else {
      const nextIdx = weldedVerts.length;
      weldedVerts.push([cleanZero(v[0]), cleanZero(v[1]), cleanZero(v[2])]);
      rawToWelded[i] = nextIdx;
      const key = `${cx},${cy},${cz}`;
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.push(nextIdx);
      } else {
        buckets.set(key, [nextIdx]);
      }
    }
  }

  const validTriangles: CadTriangle[] = [];
  const usedMask = new Uint8Array(weldedVerts.length);
  for (const tri of input.rawTriangles) {
    const i0 = rawToWelded[tri[0]];
    const i1 = rawToWelded[tri[1]];
    const i2 = rawToWelded[tri[2]];
    if (i0 === undefined || i1 === undefined || i2 === undefined) continue;
    if (i0 === i1 || i1 === i2 || i2 === i0) continue;
    const a = weldedVerts[i0];
    const b = weldedVerts[i1];
    const c = weldedVerts[i2];
    if (!a || !b || !c) continue;
    if (triangleNormalAndArea(a, b, c).area < DEGENERATE_AREA_THRESHOLD) continue;
    validTriangles.push([i0, i1, i2]);
    usedMask[i0] = 1;
    usedMask[i1] = 1;
    usedMask[i2] = 1;
  }

  const compactMap = new Int32Array(weldedVerts.length).fill(-1);
  const compactVerts: Vec3[] = [];
  for (let i = 0; i < weldedVerts.length; i += 1) {
    if (usedMask[i] !== 1) continue;
    const v = weldedVerts[i];
    if (!v) continue;
    compactMap[i] = compactVerts.length;
    compactVerts.push(v);
  }

  let triangles: CadTriangle[] = validTriangles.map((tri) => [
    compactMap[tri[0]] ?? 0,
    compactMap[tri[1]] ?? 0,
    compactMap[tri[2]] ?? 0,
  ]);

  let initialBounds = computeBounds(compactVerts);
  const shouldGround = input.groundToFloorY0 ?? true;
  const shiftY = shouldGround && compactVerts.length > 0 ? -initialBounds.min[1] : 0;
  const finalVerts: Vec3[] = shiftY === 0
    ? compactVerts
    : compactVerts.map((v) => [v[0], cleanZero(v[1] + shiftY), v[2]]);

  let metrics = computeSignedVolumeAndArea(finalVerts, triangles);
  if (metrics.signedVolumeM3 < -1e-10) {
    triangles = triangles.map((tri) => [tri[0], tri[2], tri[1]]);
    metrics = {
      signedVolumeM3: -metrics.signedVolumeM3,
      surfaceAreaM2: metrics.surfaceAreaM2,
    };
  }

  const normalAccum: Array<[number, number, number]> = finalVerts.map(() => [0, 0, 0]);
  for (const tri of triangles) {
    const a = finalVerts[tri[0]];
    const b = finalVerts[tri[1]];
    const c = finalVerts[tri[2]];
    if (!a || !b || !c) continue;
    const { cross } = triangleNormalAndArea(a, b, c);
    for (const idx of tri) {
      const acc = normalAccum[idx];
      if (!acc) continue;
      acc[0] += cross[0];
      acc[1] += cross[1];
      acc[2] += cross[2];
    }
  }

  const normals: Vec3[] = normalAccum.map((acc) => vec3Normalize(acc));
  const uvs: Vec2[] = finalVerts.map((v, i) => projectTriplanarMetricUv(v, normals[i] ?? [0, 1, 0]));
  initialBounds = computeBounds(finalVerts);

  const hardEdgeSet = new Set<string>();
  const hardEdges: CadEdgePair[] = [];
  if (input.hardEdges) {
    for (const pair of input.hardEdges) {
      const wa = rawToWelded[pair[0]];
      const wb = rawToWelded[pair[1]];
      if (wa === undefined || wb === undefined) continue;
      const ca = compactMap[wa] ?? -1;
      const cb = compactMap[wb] ?? -1;
      if (ca < 0 || cb < 0 || ca === cb) continue;
      const key = undirectedEdgeKey(ca, cb);
      if (hardEdgeSet.has(key)) continue;
      hardEdgeSet.add(key);
      hardEdges.push(ca < cb ? [ca, cb] : [cb, ca]);
    }
  }

  return {
    id: input.id,
    label: input.label,
    vertices: finalVerts,
    triangles,
    normals,
    uvs,
    bounds: initialBounds,
    signedVolumeM3: metrics.signedVolumeM3,
    surfaceAreaM2: metrics.surfaceAreaM2,
    hardEdges,
    metadata: input.metadata,
  };
}
