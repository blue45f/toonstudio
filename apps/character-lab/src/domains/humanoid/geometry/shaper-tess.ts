/**
 * SHAPER LibTessDotNet.dll (ev_b5cd6567f4aa51bb42bb94167f0a6b5bbb05c8e07e9c424e2ffc35d71f24704a) 역공학 클린룸 내재화:
 * TriLibCore(`AssetLoaderOptions.DisableTesselation`, `GeometryGroupUtils.AddVertexData`)가 외부 3D N-gon 다각형 면을
 * 삼각형/연결 다각형 메시로 분할할 때 사용하는 `LibTessDotNet.Tess` 알고리즘:
 * - `WindingRule` (`0x02000014`) & `MeshUtils::IsWindingInside` (`0x0600004d`): 5종 와인딩 규칙 판정
 * - `Tess::SignedArea` (`0x06000091`, RVA `26812`): 2D 투영 컨투어 부호 면적 계산
 * - `Tess::AddContourInternal` (`0x06000094`, RVA `26944`): `ContourOrientation` 기준 정점 삽입 순서 정규화
 * - `Tess::LongAxis` (`0x06000086`, RVA `23476`) & `ComputeNormal` (`0x06000087`, RVA `23540`): 3D 컨투어 지배 축 및 최적 평면 법선 추정
 * - `Tess::ProjectPolygon` (`0x06000089`, RVA `24508`): 3D 정점열의 직교 기저(`_sUnit`, `_tUnit`) 2D `(s, t)` 평면 투영 및 바운딩 박스 산출
 * - `Tess::OutputPolymesh` (`0x0600008f`, RVA `25780`): `NoEmptyPolygons` 퇴화 면 필터링 및 `ElementType.ConnectedPolygons` 인접 면 인덱스 출력
 */

export type ShaperTessWindingRule =
  | "even-odd"
  | "non-zero"
  | "positive"
  | "negative"
  | "abs-geq-two";

export type ShaperContourOrientation =
  | "original"
  | "clockwise"
  | "counter-clockwise";

/** LibTessDotNet.Tess.SUnitX = 1.0f, SUnitY = 0.0f 상수 */
const SHAPER_TESS_S_UNIT_X = 1.0;
const SHAPER_TESS_S_UNIT_Y = 0.0;

/**
 * LibTessDotNet.WindingRule (0x02000014) & MeshUtils::IsWindingInside (0x0600004d) 역공학 내재화:
 * - `even-odd` (0): `(n & 1) !== 0`
 * - `non-zero` (1): `n !== 0`
 * - `positive` (2): `n > 0`
 * - `negative` (3): `n < 0`
 * - `abs-geq-two` (4): `n >= 2 || n <= -2`
 */
export function evaluateShaperTessWindingRule(
  windingNumber: number,
  rule: ShaperTessWindingRule,
): boolean {
  const n = Math.trunc(windingNumber);
  switch (rule) {
    case "even-odd":
      return (n & 1) !== 0;
    case "non-zero":
      return n !== 0;
    case "positive":
      return n > 0;
    case "negative":
      return n < 0;
    case "abs-geq-two":
      return n >= 2 || n <= -2;
  }
}

/**
 * LibTessDotNet.Tess::SignedArea (0x06000091, RVA 26812) 역공학 내재화:
 * `0.5 * sum_{i=0..N-1} (v[i].X * v[(i+1)%N].Y - v[i].Y * v[(i+1)%N].X)`
 */
export function computeShaperSignedContourArea2d(
  points: readonly (readonly [number, number])[],
): number {
  const count = points.length;
  if (count < 3) return 0;
  let area2 = 0;
  for (let i = 0; i < count; i += 1) {
    const cur = points[i];
    const next = points[(i + 1) % count];
    if (cur === undefined || next === undefined) continue;
    area2 += cur[0] * next[1] - cur[1] * next[0];
  }
  return 0.5 * area2;
}

/**
 * LibTessDotNet.Tess::AddContourInternal (0x06000094, RVA 26944) 역공학 내재화:
 * `ContourOrientation`이 `clockwise`인데 `signedArea < 0`이거나,
 * `counter-clockwise`인데 `signedArea > 0`(LibTessDotNet 투영 좌표계 기준) 또는 일반적인 2D 평면에서
 * 요청된 회전 방향과 부호 면적이 반대이면 정점 삽입 순서를 `(count - 1 - i)`로 역전한다.
 * - `counter-clockwise`: `signedArea < 0`이면 역전하여 양(+)의 부호 면적(반시계) 보장
 * - `clockwise`: `signedArea > 0`이면 역전하여 음(-)의 부호 면적(시계) 보장
 */
export function normalizeShaperContourOrientation<T>(
  contour: readonly T[],
  getXY: (item: T) => readonly [number, number],
  orientation: ShaperContourOrientation = "original",
): readonly T[] {
  if (orientation === "original" || contour.length < 3) {
    return [...contour];
  }
  const points2d = contour.map(getXY);
  const area = computeShaperSignedContourArea2d(points2d);
  const shouldReverse =
    (orientation === "clockwise" && area > 0) ||
    (orientation === "counter-clockwise" && area < 0);
  if (!shouldReverse) {
    return [...contour];
  }
  const reversed: T[] = [];
  for (let i = contour.length - 1; i >= 0; i -= 1) {
    const item = contour[i];
    if (item !== undefined) reversed.push(item);
  }
  return reversed;
}

/**
 * LibTessDotNet.Tess::LongAxis (0x06000086, RVA 23476) 역공학 내재화:
 * 벡터 성분 절대값 `|v[0]|, |v[1]|, |v[2]|` 중 가장 큰 축 인덱스(0, 1, 2)를 반환한다.
 */
export function findShaperDominantAxis3d(
  v: readonly [number, number, number],
): 0 | 1 | 2 {
  let i: 0 | 1 | 2 = 0;
  if (Math.abs(v[1]) > Math.abs(v[0])) {
    i = 1;
  }
  if (Math.abs(v[2]) > Math.abs(v[i])) {
    i = 2;
  }
  return i;
}

/**
 * LibTessDotNet.Tess::ComputeNormal (0x06000087, RVA 23540) 역공학 내재화:
 * X/Y/Z 각 축별 최소·최대 정점을 찾고 스팬(`maxVal[i] - minVal[i]`)이 가장 큰 축의 두 극점 벡터 `d1 = vMin - vMax`에 대해,
 * 모든 정점 `v`를 순회하며 외적 크기 제곱 `|d1 x (v - vMax)|^2`을 최대화하는 평면 법선을 산출한다.
 */
export function computeShaperContourNormal3d(
  vertices3d: readonly (readonly [number, number, number])[],
): readonly [number, number, number] {
  if (vertices3d.length === 0) return [0, 0, 1];
  const first = vertices3d[0] ?? [0, 0, 0];
  const minVal: [number, number, number] = [first[0], first[1], first[2]];
  const maxVal: [number, number, number] = [first[0], first[1], first[2]];
  const minVert: [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
  ] = [first, first, first];
  const maxVert: [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
  ] = [first, first, first];

  for (const v of vertices3d) {
    for (let c = 0 as 0 | 1 | 2; c < 3; c = (c + 1) as 0 | 1 | 2) {
      if (v[c] < minVal[c]) {
        minVal[c] = v[c];
        minVert[c] = v;
      }
      if (v[c] > maxVal[c]) {
        maxVal[c] = v[c];
        maxVert[c] = v;
      }
    }
  }

  let axis: 0 | 1 | 2 = 0;
  if (maxVal[1] - minVal[1] > maxVal[0] - minVal[0]) axis = 1;
  if (maxVal[2] - minVal[2] > maxVal[axis] - minVal[axis]) axis = 2;

  if (minVal[axis] >= maxVal[axis]) {
    return [0, 0, 1];
  }

  const vMin = minVert[axis];
  const vMax = maxVert[axis];
  const d1: [number, number, number] = [
    vMin[0] - vMax[0],
    vMin[1] - vMax[1],
    vMin[2] - vMax[2],
  ];

  let maxLen2 = 0;
  let norm: [number, number, number] = [0, 0, 0];
  for (const v of vertices3d) {
    const d2x = v[0] - vMax[0];
    const d2y = v[1] - vMax[1];
    const d2z = v[2] - vMax[2];
    const tx = d1[1] * d2z - d1[2] * d2y;
    const ty = d1[2] * d2x - d1[0] * d2z;
    const tz = d1[0] * d2y - d1[1] * d2x;
    const tLen2 = tx * tx + ty * ty + tz * tz;
    if (tLen2 > maxLen2) {
      maxLen2 = tLen2;
      norm = [tx, ty, tz];
    }
  }

  if (maxLen2 <= 0) {
    const fallback: [number, number, number] = [0, 0, 0];
    fallback[findShaperDominantAxis3d(d1)] = 1;
    return fallback;
  }
  const invLen = 1 / Math.sqrt(maxLen2);
  return [norm[0] * invLen, norm[1] * invLen, norm[2] * invLen];
}

export interface ShaperProjectedContour2d {
  readonly normal: readonly [number, number, number];
  readonly dominantAxis: 0 | 1 | 2;
  readonly sUnit: readonly [number, number, number];
  readonly tUnit: readonly [number, number, number];
  readonly points2d: readonly (readonly [number, number])[];
  /** [bminX, bmaxX, bminY, bmaxY] */
  readonly bounds2d: readonly [number, number, number, number];
}

/**
 * LibTessDotNet.Tess::ProjectPolygon (0x06000089, RVA 24508) 역공학 내재화:
 * 법선의 지배 축 `i = LongAxis(normal)`을 찾고 직교 기저 `_sUnit`, `_tUnit`을 구성하여
 * 3D 정점들을 2D `(s, t)` 평면으로 정사영한 뒤 2D 바운딩 박스 `[bminX, bmaxX, bminY, bmaxY]`를 산출한다.
 */
export function projectShaperContour3dTo2d(
  vertices3d: readonly (readonly [number, number, number])[],
  normalHint?: readonly [number, number, number],
): ShaperProjectedContour2d {
  const hasHint =
    normalHint !== undefined &&
    (normalHint[0] !== 0 || normalHint[1] !== 0 || normalHint[2] !== 0);
  const normal = hasHint ? normalHint : computeShaperContourNormal3d(vertices3d);
  const i = findShaperDominantAxis3d(normal);

  const sUnit: [number, number, number] = [0, 0, 0];
  sUnit[i] = 0;
  sUnit[(i + 1) % 3] = SHAPER_TESS_S_UNIT_X;
  sUnit[(i + 2) % 3] = SHAPER_TESS_S_UNIT_Y;

  const tUnit: [number, number, number] = [0, 0, 0];
  tUnit[i] = 0;
  tUnit[(i + 1) % 3] = normal[i] > 0 ? -SHAPER_TESS_S_UNIT_Y : SHAPER_TESS_S_UNIT_Y;
  tUnit[(i + 2) % 3] = normal[i] > 0 ? SHAPER_TESS_S_UNIT_X : -SHAPER_TESS_S_UNIT_X;

  let bminX = Number.POSITIVE_INFINITY;
  let bmaxX = Number.NEGATIVE_INFINITY;
  let bminY = Number.POSITIVE_INFINITY;
  let bmaxY = Number.NEGATIVE_INFINITY;

  const points2d: (readonly [number, number])[] = vertices3d.map((v) => {
    const s = v[0] * sUnit[0] + v[1] * sUnit[1] + v[2] * sUnit[2];
    const t = v[0] * tUnit[0] + v[1] * tUnit[1] + v[2] * tUnit[2];
    if (s < bminX) bminX = s;
    if (s > bmaxX) bmaxX = s;
    if (t < bminY) bminY = t;
    if (t > bmaxY) bmaxY = t;
    return [s, t] as const;
  });

  if (vertices3d.length === 0) {
    bminX = 0;
    bmaxX = 0;
    bminY = 0;
    bmaxY = 0;
  }

  return {
    normal,
    dominantAxis: i,
    sUnit,
    tUnit,
    points2d,
    bounds2d: [bminX, bmaxX, bminY, bmaxY],
  };
}

export interface ShaperTessellateContourOptions {
  readonly orientation?: ShaperContourOrientation;
  /** LibTessDotNet.Tess.NoEmptyPolygons (0x04000035): 면적이 0인 퇴화 삼각형 제거 여부 */
  readonly noEmptyPolygons?: boolean;
  /** LibTessDotNet.ElementType.ConnectedPolygons (1): 각 삼각형마다 [v0, v1, v2, n0, n1, n2] 인접 면 인덱스 포함 여부 */
  readonly connectedPolygons?: boolean;
}

export interface ShaperTessellatedMeshResult {
  readonly triangleCount: number;
  /** 기본 Polygons 모드 삼각형 정점 인덱스 (3 * triangleCount) */
  readonly triangleIndices: Uint32Array;
  /**
   * ConnectedPolygons 모드 출력 (6 * triangleCount: 각 삼각형당 [v0, v1, v2, neighbor01, neighbor12, neighbor20],
   * 외곽 경계 엣지는 -1)
   */
  readonly elements: Int32Array;
  readonly projected: ShaperProjectedContour2d;
}

function cross2d(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointInTriangle2d(
  p: readonly [number, number],
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
): boolean {
  const c1 = cross2d(a, b, p);
  const c2 = cross2d(b, c, p);
  const c3 = cross2d(c, a, p);
  return c1 >= -1e-9 && c2 >= -1e-9 && c3 >= -1e-9;
}

/**
 * LibTessDotNet.Tess::Tessellate (0x06000095) & OutputPolymesh (0x0600008f, RVA 25780) 역공학 내재화:
 * 3D 다각형 컨투어를 최적 법선 평면에 투영(`ProjectPolygon`)한 뒤 이어 클리핑(Ear-Clipping)으로 삼각분할하고,
 * `noEmptyPolygons` 옵션으로 퇴화 삼각형을 제거하며, `connectedPolygons` 옵션 시 인접 삼각형 면 인덱스(`-1`은 외곽 경계)를 함께 생성한다.
 */
export function tessellateShaperPolygonContour(
  vertices3d: readonly (readonly [number, number, number])[],
  options: ShaperTessellateContourOptions = {},
): ShaperTessellatedMeshResult {
  const {
    orientation = "counter-clockwise",
    noEmptyPolygons = true,
    connectedPolygons = false,
  } = options;
  const projected = projectShaperContour3dTo2d(vertices3d);
  const count = vertices3d.length;
  if (count < 3) {
    return {
      triangleCount: 0,
      triangleIndices: new Uint32Array(0),
      elements: new Int32Array(0),
      projected,
    };
  }

  const indexed = projected.points2d.map((pt, index) => ({ index, pt }));
  // 이어 클리핑을 위해 내부 진행 방향은 반시계(양의 면적)로 정규화하고, 요청 방향이 clockwise이면 최종 삼각형 와인딩을 뒤집는다.
  const ccwRing = [...normalizeShaperContourOrientation(indexed, (item) => item.pt, "counter-clockwise")];
  const flipWinding = orientation === "clockwise";

  const rawTriangles: [number, number, number][] = [];
  let guard = ccwRing.length * ccwRing.length + 8;

  while (ccwRing.length > 3 && guard > 0) {
    guard -= 1;
    let earFound = false;
    const len = ccwRing.length;
    for (let i = 0; i < len; i += 1) {
      const prev = ccwRing[(i + len - 1) % len]!;
      const curr = ccwRing[i]!;
      const next = ccwRing[(i + 1) % len]!;
      const area2 = cross2d(prev.pt, curr.pt, next.pt);
      if (area2 <= 1e-9) continue;

      let hasInside = false;
      for (let j = 0; j < len; j += 1) {
        if (j === (i + len - 1) % len || j === i || j === (i + 1) % len) continue;
        const candidate = ccwRing[j]!;
        if (pointInTriangle2d(candidate.pt, prev.pt, curr.pt, next.pt)) {
          hasInside = true;
          break;
        }
      }
      if (!hasInside) {
        rawTriangles.push([prev.index, curr.index, next.index]);
        ccwRing.splice(i, 1);
        earFound = true;
        break;
      }
    }
    if (!earFound) {
      const a = ccwRing[0]!;
      const b = ccwRing[1]!;
      const c = ccwRing[2]!;
      rawTriangles.push([a.index, b.index, c.index]);
      ccwRing.splice(1, 1);
    }
  }

  if (ccwRing.length === 3) {
    rawTriangles.push([ccwRing[0]!.index, ccwRing[1]!.index, ccwRing[2]!.index]);
  }

  const validTriangles = rawTriangles.filter(([i0, i1, i2]) => {
    if (!noEmptyPolygons) return true;
    const p0 = projected.points2d[i0];
    const p1 = projected.points2d[i1];
    const p2 = projected.points2d[i2];
    if (!p0 || !p1 || !p2) return false;
    return Math.abs(cross2d(p0, p1, p2)) > 1e-8;
  });

  const finalTriangles: [number, number, number][] = validTriangles.map(([a, b, c]) =>
    flipWinding ? [a, c, b] : [a, b, c],
  );

  const triCount = finalTriangles.length;
  const triangleIndices = new Uint32Array(triCount * 3);
  for (let t = 0; t < triCount; t += 1) {
    const tri = finalTriangles[t]!;
    triangleIndices[t * 3] = tri[0];
    triangleIndices[t * 3 + 1] = tri[1];
    triangleIndices[t * 3 + 2] = tri[2];
  }

  if (!connectedPolygons) {
    const elements = new Int32Array(triCount * 3);
    for (let k = 0; k < triangleIndices.length; k += 1) {
      elements[k] = triangleIndices[k]!;
    }
    return { triangleCount: triCount, triangleIndices, elements, projected };
  }

  // ConnectedPolygons: 각 삼각형당 [v0, v1, v2, n01, n12, n20]
  const edgeOwner = new Map<string, number>();
  for (let t = 0; t < triCount; t += 1) {
    const [v0, v1, v2] = finalTriangles[t]!;
    edgeOwner.set(`${v0}:${v1}`, t);
    edgeOwner.set(`${v1}:${v2}`, t);
    edgeOwner.set(`${v2}:${v0}`, t);
  }

  const elements = new Int32Array(triCount * 6);
  for (let t = 0; t < triCount; t += 1) {
    const [v0, v1, v2] = finalTriangles[t]!;
    const base = t * 6;
    elements[base] = v0;
    elements[base + 1] = v1;
    elements[base + 2] = v2;
    elements[base + 3] = edgeOwner.get(`${v1}:${v0}`) ?? -1;
    elements[base + 4] = edgeOwner.get(`${v2}:${v1}`) ?? -1;
    elements[base + 5] = edgeOwner.get(`${v0}:${v2}`) ?? -1;
  }

  return { triangleCount: triCount, triangleIndices, elements, projected };
}

/** TriLibCore.Utils.HashUtils 초기 시드 상수 (`1125899906842597L`) */
export const SHAPER_TRILIB_HASH_SEED = 1125899906842597n;

/**
 * TriLibCore.Utils.HashUtils::GetHash (`0x0600021e..0x06000223`, RVA `32516`, `ev_71f4448ae78893676b89317bcb4badfb36e0462c47a073039e04846a2b4024a8`) 역공학 내재화:
 * 64비트 부호 있는 정수 롤링 해시 `h = 31L * h + text[i]` (초기값 `1125899906842597L`)를 계산한다.
 */
export function computeShaperTriLibStringHash64(
  text: string,
  initialHash: bigint = SHAPER_TRILIB_HASH_SEED,
): bigint {
  let hash = BigInt.asIntN(64, initialHash);
  for (let i = 0; i < text.length; i += 1) {
    hash = BigInt.asIntN(64, 31n * hash + BigInt(text.charCodeAt(i)));
  }
  return hash;
}

/**
 * TriLibCore.Utils.TangentSolver::CalculateTangents (`0x06000235`, RVA `37180`) &
 * MathUtils::CalculateTangentSign (`0x06000253`, RVA `41124`) 역공학 내재화:
 * 삼각형 위치·UV 미분으로부터 정점별 `sdir`(`tan1`)·`tdir`(`tan2`)를 누적하고,
 * Gram-Schmidt 직교화(`normalize(tan1 - n * dot(n, tan1))`)와 핸디드니스 부호(`w = dot(cross(n, tan1), tan2) < 0 ? -1 : 1`)를 계산해
 * `Float32Array(vertexCount * 4)` (`[tx, ty, tz, tw]`)를 반환한다.
 */
export function calculateShaperMeshTangents(
  positions: Float32Array,
  normals: Float32Array,
  uvs: Float32Array,
  indices: Uint32Array,
): Float32Array {
  const vertexCount = Math.floor(positions.length / 3);
  const tan1 = new Float32Array(vertexCount * 3);
  const tan2 = new Float32Array(vertexCount * 3);
  const out = new Float32Array(vertexCount * 4);

  for (let i = 0; i + 2 < indices.length; i += 3) {
    const i1 = indices[i]!;
    const i2 = indices[i + 1]!;
    const i3 = indices[i + 2]!;
    if (i1 >= vertexCount || i2 >= vertexCount || i3 >= vertexCount) continue;

    const x1 = positions[i2 * 3]! - positions[i1 * 3]!;
    const y1 = positions[i2 * 3 + 1]! - positions[i1 * 3 + 1]!;
    const z1 = positions[i2 * 3 + 2]! - positions[i1 * 3 + 2]!;
    const x2 = positions[i3 * 3]! - positions[i1 * 3]!;
    const y2 = positions[i3 * 3 + 1]! - positions[i1 * 3 + 1]!;
    const z2 = positions[i3 * 3 + 2]! - positions[i1 * 3 + 2]!;

    const s1 = uvs[i2 * 2]! - uvs[i1 * 2]!;
    const t1 = uvs[i2 * 2 + 1]! - uvs[i1 * 2 + 1]!;
    const s2 = uvs[i3 * 2]! - uvs[i1 * 2]!;
    const t2 = uvs[i3 * 2 + 1]! - uvs[i1 * 2 + 1]!;

    const denom = s1 * t2 - s2 * t1;
    const r = Math.abs(denom) > 1e-8 ? 1.0 / denom : 0.0;
    const sx = (t2 * x1 - t1 * x2) * r;
    const sy = (t2 * y1 - t1 * y2) * r;
    const sz = (t2 * z1 - t1 * z2) * r;
    const tx = (s1 * x2 - s2 * x1) * r;
    const ty = (s1 * y2 - s2 * y1) * r;
    const tz = (s1 * z2 - s2 * z1) * r;

    for (const vIdx of [i1, i2, i3]) {
      tan1[vIdx * 3] = tan1[vIdx * 3]! + sx;
      tan1[vIdx * 3 + 1] = tan1[vIdx * 3 + 1]! + sy;
      tan1[vIdx * 3 + 2] = tan1[vIdx * 3 + 2]! + sz;
      tan2[vIdx * 3] = tan2[vIdx * 3]! + tx;
      tan2[vIdx * 3 + 1] = tan2[vIdx * 3 + 1]! + ty;
      tan2[vIdx * 3 + 2] = tan2[vIdx * 3 + 2]! + tz;
    }
  }

  for (let a = 0; a < vertexCount; a += 1) {
    const nx = normals[a * 3] ?? 0;
    const ny = normals[a * 3 + 1] ?? 0;
    const nz = normals[a * 3 + 2] ?? 1;
    const t1x = tan1[a * 3]!;
    const t1y = tan1[a * 3 + 1]!;
    const t1z = tan1[a * 3 + 2]!;
    const t2x = tan2[a * 3]!;
    const t2y = tan2[a * 3 + 1]!;
    const t2z = tan2[a * 3 + 2]!;

    const ndott = nx * t1x + ny * t1y + nz * t1z;
    let ox = t1x - nx * ndott;
    let oy = t1y - ny * ndott;
    let oz = t1z - nz * ndott;
    const len = Math.hypot(ox, oy, oz);
    if (len > 1e-8) {
      ox /= len;
      oy /= len;
      oz /= len;
    } else {
      ox = 1;
      oy = 0;
      oz = 0;
    }

    const cx = ny * t1z - nz * t1y;
    const cy = nz * t1x - nx * t1z;
    const cz = nx * t1y - ny * t1x;
    const handedness = cx * t2x + cy * t2y + cz * t2z < 0 ? -1 : 1;

    out[a * 4] = ox;
    out[a * 4 + 1] = oy;
    out[a * 4 + 2] = oz;
    out[a * 4 + 3] = handedness;
  }

  return out;
}

export interface ShaperRightHandToLeftHandInput {
  readonly vector?: readonly [number, number, number];
  readonly rotationQuat?: readonly [number, number, number, number];
  readonly eulerDeg?: readonly [number, number, number];
}

export interface ShaperRightHandToLeftHandResult {
  readonly vector: readonly [number, number, number];
  readonly rotationQuat: readonly [number, number, number, number];
  readonly eulerDeg: readonly [number, number, number];
}

/**
 * TriLibCore.Utils.RightHandToLeftHandConverter (`0x06000256..0x06000258`, RVA `41356..41452`) 역공학 내재화:
 * 오른손 좌표계(OpenGL/Blender/OBJ)의 위치 벡터 `(x, y, z) -> (-x, y, z)`,
 * 쿼터니언 `(x, y, z, w) -> (x, -y, -z, w)`, 오일러 각 `(x, y, z) -> (x, -y, -z)`를 왼손 좌표계로 변환한다.
 */
export function convertShaperRightHandToLeftHand(
  input: ShaperRightHandToLeftHandInput,
): ShaperRightHandToLeftHandResult {
  const v = input.vector ?? [0, 0, 0];
  const q = input.rotationQuat ?? [0, 0, 0, 1];
  const e = input.eulerDeg ?? [0, 0, 0];
  return {
    vector: [-v[0] || 0, v[1], v[2]],
    rotationQuat: [q[0], -q[1] || 0, -q[2] || 0, q[3]],
    eulerDeg: [e[0], -e[1] || 0, -e[2] || 0],
  };
}

export interface ShaperStlParsedData {
  readonly isBinary: boolean;
  readonly headerColorRgba: readonly [number, number, number, number] | null;
  readonly triangleCount: number;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
}

/**
 * TriLibCore.Stl.StlProcessor::IsBinary (`0x06000031`), CheckForColorHeader (`0x0600002a`), ParseBinary (`0x0600002b`,
 * `ev_30f96d08171e2843cb79878e2720879f8fc03047b123a31475cc9b3fa722abc9`) 역공학 내재화:
 * 제어 문자(`b < 32 && b !== 13 && b !== 10 && b !== 9`)로 바이너리 STL 여부를 판별하고,
 * 80바이트 헤더 내 `"COLOR="` 시그니처 뒤의 4바이트 RGBA 색상과 오프셋 80의 삼각형 개수(`uint32`), 50바이트 레코드들을 파싱한다.
 */
export function parseShaperStlBinaryHeaderAndTriangles(
  bytes: Uint8Array,
): ShaperStlParsedData {
  let isBinary = false;
  const scanLen = Math.min(bytes.length, 512);
  for (let i = 0; i < scanLen; i += 1) {
    const b = bytes[i]!;
    if (b < 32 && b !== 13 && b !== 10 && b !== 9) {
      isBinary = true;
      break;
    }
  }

  let headerColorRgba: readonly [number, number, number, number] | null = null;
  const colorSig = [67, 79, 76, 79, 82, 61] as const; // "COLOR="
  const headerEnd = Math.min(bytes.length, 80);
  for (let i = 0; i + colorSig.length + 4 <= headerEnd; i += 1) {
    let matched = true;
    for (let k = 0; k < colorSig.length; k += 1) {
      if (bytes[i + k] !== colorSig[k]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      const base = i + colorSig.length;
      headerColorRgba = [
        bytes[base]! / 255,
        bytes[base + 1]! / 255,
        bytes[base + 2]! / 255,
        bytes[base + 3]! / 255,
      ];
      break;
    }
  }

  if (!isBinary || bytes.length < 84) {
    return {
      isBinary,
      headerColorRgba,
      triangleCount: 0,
      positions: new Float32Array(0),
      normals: new Float32Array(0),
    };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const declaredCount = view.getUint32(80, true);
  const maxAvailable = Math.floor((bytes.length - 84) / 50);
  const triangleCount = Math.min(declaredCount, maxAvailable);
  const positions = new Float32Array(triangleCount * 9);
  const normals = new Float32Array(triangleCount * 9);

  for (let t = 0; t < triangleCount; t += 1) {
    const offset = 84 + t * 50;
    const nx = view.getFloat32(offset, true);
    const ny = view.getFloat32(offset + 4, true);
    const nz = view.getFloat32(offset + 8, true);
    for (let v = 0; v < 3; v += 1) {
      const vOff = offset + 12 + v * 12;
      const dst = (t * 3 + v) * 3;
      positions[dst] = view.getFloat32(vOff, true);
      positions[dst + 1] = view.getFloat32(vOff + 4, true);
      positions[dst + 2] = view.getFloat32(vOff + 8, true);
      normals[dst] = nx;
      normals[dst + 1] = ny;
      normals[dst + 2] = nz;
    }
  }

  return {
    isBinary,
    headerColorRgba,
    triangleCount,
    positions,
    normals,
  };
}
