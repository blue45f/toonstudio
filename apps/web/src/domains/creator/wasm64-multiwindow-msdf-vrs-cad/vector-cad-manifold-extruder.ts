/**
 * 온디바이스 2D 벡터 건축 평면도 → 3D 수밀(Manifold) 건축 CAD 메시 변환기 및 위상 감사기.
 *
 * - 닫힌 2D 다각형(오목/볼록 귀 자르기 삼각화), 문·창문 개구부 벽체(T-정션 0 격자 경계 추출),
 *   계단 솔리드를 glTF 오른손 Y-up 미터법(`1.0 = 1m`)으로 압출한다.
 * - 모든 출력 메시는 바닥 접지(`minY === 0`), 0 비다양체 엣지, 0 경계 엣지(수밀),
 *   0 퇴화 삼각형, 외향 단위 법선, 비퇴화 미터 타일 UV를 보장한다.
 */

export interface Vec2M {
  readonly x: number;
  readonly z: number;
}

export interface WallOpeningSpec {
  readonly kind: "door" | "window";
  readonly offsetAlongM: number;
  readonly widthM: number;
  readonly sillHeightM?: number;
  readonly openingHeightM: number;
}

export interface VectorPlanPolygonElement {
  readonly kind: "polygon";
  readonly id: string;
  readonly materialSlot?: "wall" | "floor" | "prop" | "trim";
  readonly points: readonly Vec2M[];
  readonly elevationYM?: number;
  readonly heightM: number;
}

export interface VectorPlanWallElement {
  readonly kind: "wall";
  readonly id: string;
  readonly materialSlot?: "wall" | "trim";
  readonly start: Vec2M;
  readonly end: Vec2M;
  readonly thicknessM: number;
  readonly heightM: number;
  readonly elevationYM?: number;
  readonly openings?: readonly WallOpeningSpec[];
}

export interface VectorPlanStairsElement {
  readonly kind: "stairs";
  readonly id: string;
  readonly materialSlot?: "stairs" | "prop";
  readonly origin: Vec2M;
  readonly yawRad?: number;
  readonly widthM: number;
  readonly runM: number;
  readonly heightM: number;
  readonly stepCount: number;
  readonly elevationYM?: number;
}

export type VectorPlanElement =
  | VectorPlanPolygonElement
  | VectorPlanWallElement
  | VectorPlanStairsElement;

export interface VectorFloorplanInput {
  readonly elements: readonly VectorPlanElement[];
  readonly uvMetersPerTile?: number;
  readonly groundToZeroY?: boolean;
}

export interface ManifoldMaterialRange {
  readonly id: string;
  readonly materialSlot: string;
  readonly startIndex: number;
  readonly indexCount: number;
}

export interface ManifoldMeshBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
}

export interface ManifoldTopologyAudit {
  readonly watertight: boolean;
  readonly manifold: boolean;
  readonly boundaryEdgeCount: number;
  readonly nonManifoldEdgeCount: number;
  readonly oppositeOrientationMismatchCount: number;
  readonly degenerateTriangleCount: number;
  readonly looseVertexCount: number;
  readonly invalidNormalCount: number;
  readonly degenerateUvTriangleCount: number;
  readonly signedVolumeM3: number;
  readonly groundedAtZeroY: boolean;
}

export interface ManifoldMeshResult {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly materialRanges: readonly ManifoldMaterialRange[];
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly bounds: ManifoldMeshBounds;
  readonly audit: ManifoldTopologyAudit;
}

interface Vec3M {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

class ManifoldMeshBuilder {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly uvs: number[] = [];
  readonly indices: number[] = [];

  pushTriangle(
    a: Vec3M,
    b: Vec3M,
    c: Vec3M,
    uvA: readonly [number, number],
    uvB: readonly [number, number],
    uvC: readonly [number, number],
  ): void {
    const e1x = b.x - a.x;
    const e1y = b.y - a.y;
    const e1z = b.z - a.z;
    const e2x = c.x - a.x;
    const e2y = c.y - a.y;
    const e2z = c.z - a.z;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const nLen = Math.hypot(nx, ny, nz);
    if (nLen <= 1e-10) return;

    const inv = 1 / nLen;
    const ux = nx * inv;
    const uy = ny * inv;
    const uz = nz * inv;
    const baseVertex = this.positions.length / 3;
    this.positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    this.normals.push(ux, uy, uz, ux, uy, uz, ux, uy, uz);
    this.uvs.push(uvA[0], uvA[1], uvB[0], uvB[1], uvC[0], uvC[1]);
    this.indices.push(baseVertex, baseVertex + 1, baseVertex + 2);
  }

  pushQuad(
    p0: Vec3M,
    p1: Vec3M,
    p2: Vec3M,
    p3: Vec3M,
    uv0: readonly [number, number],
    uv1: readonly [number, number],
    uv2: readonly [number, number],
    uv3: readonly [number, number],
  ): void {
    this.pushTriangle(p0, p1, p2, uv0, uv1, uv2);
    this.pushTriangle(p0, p2, p3, uv0, uv2, uv3);
  }
}

function cross2d(a: Vec2M, b: Vec2M, c: Vec2M): number {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function normalizeClosedPolygon2d(raw: readonly Vec2M[]): readonly Vec2M[] {
  const deduped: Vec2M[] = [];
  for (const pt of raw) {
    const prev = deduped[deduped.length - 1];
    if (!prev || Math.hypot(pt.x - prev.x, pt.z - prev.z) > 1e-6) deduped.push(pt);
  }
  while (deduped.length >= 2) {
    const first = deduped[0];
    const last = deduped[deduped.length - 1];
    if (first && last && Math.hypot(first.x - last.x, first.z - last.z) <= 1e-6) deduped.pop();
    else break;
  }
  const cleaned: Vec2M[] = [];
  const n = deduped.length;
  for (let i = 0; i < n; i += 1) {
    const prev = deduped[(i - 1 + n) % n];
    const curr = deduped[i];
    const next = deduped[(i + 1) % n];
    if (prev && curr && next && Math.abs(cross2d(prev, curr, next)) > 1e-8) cleaned.push(curr);
  }
  if (cleaned.length < 3) {
    throw new Error("2D 폴리곤은 최소 3개 이상의 비공선 꼭짓점이 필요합니다.");
  }
  let signedArea2 = 0;
  for (let i = 0; i < cleaned.length; i += 1) {
    const a = cleaned[i];
    const b = cleaned[(i + 1) % cleaned.length];
    if (a && b) signedArea2 += a.x * b.z - b.x * a.z;
  }
  if (Math.abs(signedArea2) <= 1e-9) {
    throw new Error("면적이 0인 퇴화 2D 폴리곤은 압출할 수 없습니다.");
  }
  return signedArea2 < 0 ? cleaned.slice().reverse() : cleaned;
}

function isPointInTriangle2d(p: Vec2M, a: Vec2M, b: Vec2M, c: Vec2M): boolean {
  return cross2d(a, b, p) >= -1e-9 && cross2d(b, c, p) >= -1e-9 && cross2d(c, a, p) >= -1e-9;
}

function earClipTriangulate2d(poly: readonly Vec2M[]): readonly (readonly [number, number, number])[] {
  const remaining = poly.map((_, i) => i);
  const triangles: [number, number, number][] = [];
  let guard = poly.length * poly.length + 16;

  while (remaining.length > 3 && guard > 0) {
    guard -= 1;
    let earFound = false;
    const count = remaining.length;
    for (let i = 0; i < count; i += 1) {
      const iPrev = remaining[(i - 1 + count) % count] ?? 0;
      const iCurr = remaining[i] ?? 0;
      const iNext = remaining[(i + 1) % count] ?? 0;
      const a = poly[iPrev];
      const b = poly[iCurr];
      const c = poly[iNext];
      if (!a || !b || !c || cross2d(a, b, c) <= 1e-9) continue;

      let containsOther = false;
      for (let k = 0; k < count; k += 1) {
        const candidateIdx = remaining[k] ?? 0;
        if (candidateIdx === iPrev || candidateIdx === iCurr || candidateIdx === iNext) continue;
        const candidate = poly[candidateIdx];
        if (candidate && isPointInTriangle2d(candidate, a, b, c)) {
          containsOther = true;
          break;
        }
      }
      if (!containsOther) {
        triangles.push([iPrev, iCurr, iNext]);
        remaining.splice(i, 1);
        earFound = true;
        break;
      }
    }
    if (!earFound) {
      throw new Error("자기 교차하거나 유효하지 않은 2D 폴리곤은 삼각화할 수 없습니다.");
    }
  }
  if (remaining.length === 3) {
    triangles.push([remaining[0] ?? 0, remaining[1] ?? 1, remaining[2] ?? 2]);
  }
  return triangles;
}

function emitExtrudedPolygonSolid(
  builder: ManifoldMeshBuilder,
  element: VectorPlanPolygonElement,
  uvScale: number,
): void {
  if (element.heightM <= 1e-4) {
    throw new Error(`폴리곤 '${element.id}'의 높이(${element.heightM}m)는 양수여야 합니다.`);
  }
  const poly = normalizeClosedPolygon2d(element.points);
  const tris = earClipTriangulate2d(poly);
  const y0 = element.elevationYM ?? 0;
  const y1 = y0 + element.heightM;

  for (const [ia, ib, ic] of tris) {
    const a = poly[ia];
    const b = poly[ib];
    const c = poly[ic];
    if (!a || !b || !c) continue;
    builder.pushTriangle(
      { x: a.x, y: y0, z: a.z },
      { x: b.x, y: y0, z: b.z },
      { x: c.x, y: y0, z: c.z },
      [a.x * uvScale, a.z * uvScale],
      [b.x * uvScale, b.z * uvScale],
      [c.x * uvScale, c.z * uvScale],
    );
    builder.pushTriangle(
      { x: a.x, y: y1, z: a.z },
      { x: c.x, y: y1, z: c.z },
      { x: b.x, y: y1, z: b.z },
      [a.x * uvScale, a.z * uvScale],
      [c.x * uvScale, c.z * uvScale],
      [b.x * uvScale, b.z * uvScale],
    );
  }

  let perimeterAccum = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (!a || !b) continue;
    const segLen = Math.hypot(b.x - a.x, b.z - a.z);
    const u0 = perimeterAccum * uvScale;
    const u1 = (perimeterAccum + segLen) * uvScale;
    perimeterAccum += segLen;
    builder.pushQuad(
      { x: a.x, y: y0, z: a.z },
      { x: a.x, y: y1, z: a.z },
      { x: b.x, y: y1, z: b.z },
      { x: b.x, y: y0, z: b.z },
      [u0, y0 * uvScale],
      [u0, y1 * uvScale],
      [u1, y1 * uvScale],
      [u1, y0 * uvScale],
    );
  }
}

function emitExtrudedGridCells(
  builder: ManifoldMeshBuilder,
  uBreaks: readonly number[],
  yBreaks: readonly number[],
  isCellSolid: (iu: number, iy: number) => boolean,
  wMin: number,
  wMax: number,
  toWorld: (u: number, y: number, w: number) => Vec3M,
  uvScale: number,
): void {
  const nu = uBreaks.length - 1;
  const ny = yBreaks.length - 1;
  const solidAt = (iu: number, iy: number): boolean =>
    iu >= 0 && iu < nu && iy >= 0 && iy < ny && isCellSolid(iu, iy);

  for (let iy = 0; iy < ny; iy += 1) {
    const y0 = yBreaks[iy] ?? 0;
    const y1 = yBreaks[iy + 1] ?? 0;
    if (y1 - y0 <= 1e-6) continue;
    for (let iu = 0; iu < nu; iu += 1) {
      if (!solidAt(iu, iy)) continue;
      const u0 = uBreaks[iu] ?? 0;
      const u1 = uBreaks[iu + 1] ?? 0;
      if (u1 - u0 <= 1e-6) continue;

      builder.pushQuad(
        toWorld(u0, y0, wMax), toWorld(u1, y0, wMax), toWorld(u1, y1, wMax), toWorld(u0, y1, wMax),
        [u0 * uvScale, y0 * uvScale], [u1 * uvScale, y0 * uvScale],
        [u1 * uvScale, y1 * uvScale], [u0 * uvScale, y1 * uvScale],
      );
      builder.pushQuad(
        toWorld(u1, y0, wMin), toWorld(u0, y0, wMin), toWorld(u0, y1, wMin), toWorld(u1, y1, wMin),
        [u0 * uvScale, y0 * uvScale], [u1 * uvScale, y0 * uvScale],
        [u1 * uvScale, y1 * uvScale], [u0 * uvScale, y1 * uvScale],
      );
      if (!solidAt(iu - 1, iy)) {
        builder.pushQuad(
          toWorld(u0, y0, wMin), toWorld(u0, y0, wMax), toWorld(u0, y1, wMax), toWorld(u0, y1, wMin),
          [wMin * uvScale, y0 * uvScale], [wMax * uvScale, y0 * uvScale],
          [wMax * uvScale, y1 * uvScale], [wMin * uvScale, y1 * uvScale],
        );
      }
      if (!solidAt(iu + 1, iy)) {
        builder.pushQuad(
          toWorld(u1, y0, wMax), toWorld(u1, y0, wMin), toWorld(u1, y1, wMin), toWorld(u1, y1, wMax),
          [wMin * uvScale, y0 * uvScale], [wMax * uvScale, y0 * uvScale],
          [wMax * uvScale, y1 * uvScale], [wMin * uvScale, y1 * uvScale],
        );
      }
      if (!solidAt(iu, iy - 1)) {
        builder.pushQuad(
          toWorld(u0, y0, wMin), toWorld(u1, y0, wMin), toWorld(u1, y0, wMax), toWorld(u0, y0, wMax),
          [u0 * uvScale, wMin * uvScale], [u1 * uvScale, wMin * uvScale],
          [u1 * uvScale, wMax * uvScale], [u0 * uvScale, wMax * uvScale],
        );
      }
      if (!solidAt(iu, iy + 1)) {
        builder.pushQuad(
          toWorld(u0, y1, wMax), toWorld(u1, y1, wMax), toWorld(u1, y1, wMin), toWorld(u0, y1, wMin),
          [u0 * uvScale, wMin * uvScale], [u1 * uvScale, wMin * uvScale],
          [u1 * uvScale, wMax * uvScale], [u0 * uvScale, wMax * uvScale],
        );
      }
    }
  }
}

function dedupeSortedBreaks(values: readonly number[]): readonly number[] {
  const sorted = values.slice().sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) {
    const prev = out[out.length - 1];
    if (prev === undefined || v - prev > 1e-5) out.push(v);
  }
  return out;
}

function emitWallWithOpeningsSolid(
  builder: ManifoldMeshBuilder,
  wall: VectorPlanWallElement,
  uvScale: number,
): void {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const lengthM = Math.hypot(dx, dz);
  if (lengthM <= 1e-4 || wall.thicknessM <= 1e-4 || wall.heightM <= 1e-4) {
    throw new Error(`벽체 '${wall.id}'의 길이·두께·높이는 모두 양수여야 합니다.`);
  }
  const tx = dx / lengthM;
  const tz = dz / lengthM;
  const yBase = wall.elevationYM ?? 0;
  const yTop = yBase + wall.heightM;
  const halfT = wall.thicknessM * 0.5;
  const pierMargin = Math.min(0.05, lengthM * 0.1);
  const lintelMargin = Math.min(0.05, wall.heightM * 0.1);

  const clampedOpenings: { u0: number; u1: number; y0: number; y1: number }[] = [];
  for (const op of wall.openings ?? []) {
    const u0 = Math.max(pierMargin, op.offsetAlongM);
    const u1 = Math.min(lengthM - pierMargin, op.offsetAlongM + op.widthM);
    const y0 = yBase + Math.max(0, op.sillHeightM ?? (op.kind === "door" ? 0 : 0.9));
    const y1 = Math.min(yTop - lintelMargin, y0 + op.openingHeightM);
    if (u1 - u0 > 0.05 && y1 - y0 > 0.05) clampedOpenings.push({ u0, u1, y0, y1 });
  }

  const uRaw = [0, lengthM];
  const yRaw = [yBase, yTop];
  for (const op of clampedOpenings) {
    uRaw.push(op.u0, op.u1);
    yRaw.push(op.y0, op.y1);
  }
  const uBreaks = dedupeSortedBreaks(uRaw);
  const yBreaks = dedupeSortedBreaks(yRaw);

  const isCellSolid = (iu: number, iy: number): boolean => {
    const uc = ((uBreaks[iu] ?? 0) + (uBreaks[iu + 1] ?? 0)) * 0.5;
    const yc = ((yBreaks[iy] ?? 0) + (yBreaks[iy + 1] ?? 0)) * 0.5;
    for (const op of clampedOpenings) {
      if (uc > op.u0 && uc < op.u1 && yc > op.y0 && yc < op.y1) return false;
    }
    return true;
  };

  emitExtrudedGridCells(
    builder,
    uBreaks,
    yBreaks,
    isCellSolid,
    -halfT,
    halfT,
    (u, y, w) => ({ x: wall.start.x + tx * u - tz * w, y, z: wall.start.z + tz * u + tx * w }),
    uvScale,
  );
}

function emitStairsSolid(
  builder: ManifoldMeshBuilder,
  stairs: VectorPlanStairsElement,
  uvScale: number,
): void {
  const stepCount = Math.max(1, Math.round(stairs.stepCount));
  if (stairs.widthM <= 1e-4 || stairs.runM <= 1e-4 || stairs.heightM <= 1e-4) {
    throw new Error(`계단 '${stairs.id}'의 너비·길이·높이는 모두 양수여야 합니다.`);
  }
  const yBase = stairs.elevationYM ?? 0;
  const yaw = stairs.yawRad ?? 0;
  const tx = Math.cos(yaw);
  const tz = Math.sin(yaw);
  const halfW = stairs.widthM * 0.5;
  const uBreaks: number[] = [];
  const yBreaks: number[] = [];
  for (let i = 0; i <= stepCount; i += 1) {
    uBreaks.push((stairs.runM * i) / stepCount);
    yBreaks.push(yBase + (stairs.heightM * i) / stepCount);
  }

  emitExtrudedGridCells(
    builder,
    uBreaks,
    yBreaks,
    (iu, iy) => iy <= iu,
    -halfW,
    halfW,
    (u, y, w) => ({ x: stairs.origin.x + tx * u - tz * w, y, z: stairs.origin.z + tz * u + tx * w }),
    uvScale,
  );
}

/**
 * 인덱스 3D 메시의 수밀성·다양체성·퇴화 삼각형·법선·UV·접지(`minY === 0`)를 전수 감사한다.
 */
export function validateManifoldMeshTopology(
  positions: Float32Array,
  normals: Float32Array,
  uvs: Float32Array,
  indices: Uint32Array,
): ManifoldTopologyAudit {
  const vertexCount = Math.floor(positions.length / 3);
  const triangleCount = Math.floor(indices.length / 3);
  const referencedVertices = new Uint8Array(vertexCount);

  const weldMap = new Map<string, number>();
  const weldedIdOf = new Int32Array(vertexCount);
  let nextWeldId = 0;
  let minY = Infinity;
  let invalidNormalCount = 0;

  for (let v = 0; v < vertexCount; v += 1) {
    const x = positions[v * 3] ?? 0;
    const y = positions[v * 3 + 1] ?? 0;
    const z = positions[v * 3 + 2] ?? 0;
    if (y < minY) minY = y;
    const key = `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
    let wid = weldMap.get(key);
    if (wid === undefined) {
      wid = nextWeldId;
      nextWeldId += 1;
      weldMap.set(key, wid);
    }
    weldedIdOf[v] = wid;

    const len = Math.hypot(normals[v * 3] ?? 0, normals[v * 3 + 1] ?? 0, normals[v * 3 + 2] ?? 0);
    if (!Number.isFinite(len) || Math.abs(len - 1) > 1e-3) invalidNormalCount += 1;
  }

  const edgeStats = new Map<string, { forward: number; reverse: number }>();
  let degenerateTriangleCount = 0;
  let degenerateUvTriangleCount = 0;
  let signedVolume6 = 0;

  for (let t = 0; t < triangleCount; t += 1) {
    const i0 = indices[t * 3] ?? 0;
    const i1 = indices[t * 3 + 1] ?? 0;
    const i2 = indices[t * 3 + 2] ?? 0;
    if (i0 < vertexCount) referencedVertices[i0] = 1;
    if (i1 < vertexCount) referencedVertices[i1] = 1;
    if (i2 < vertexCount) referencedVertices[i2] = 1;

    const ax = positions[i0 * 3] ?? 0;
    const ay = positions[i0 * 3 + 1] ?? 0;
    const az = positions[i0 * 3 + 2] ?? 0;
    const bx = positions[i1 * 3] ?? 0;
    const by = positions[i1 * 3 + 1] ?? 0;
    const bz = positions[i1 * 3 + 2] ?? 0;
    const cx = positions[i2 * 3] ?? 0;
    const cy = positions[i2 * 3 + 1] ?? 0;
    const cz = positions[i2 * 3 + 2] ?? 0;

    const e1x = bx - ax;
    const e1y = by - ay;
    const e1z = bz - az;
    const e2x = cx - ax;
    const e2y = cy - ay;
    const e2z = cz - az;
    const area2 = Math.hypot(e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x);
    if (!Number.isFinite(area2) || area2 * 0.5 <= 1e-8) degenerateTriangleCount += 1;

    signedVolume6 +=
      ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);

    const u0 = uvs[i0 * 2] ?? NaN;
    const v0 = uvs[i0 * 2 + 1] ?? NaN;
    const u1 = uvs[i1 * 2] ?? NaN;
    const v1 = uvs[i1 * 2 + 1] ?? NaN;
    const u2 = uvs[i2 * 2] ?? NaN;
    const v2 = uvs[i2 * 2 + 1] ?? NaN;
    const uvArea2 = Math.abs((u1 - u0) * (v2 - v0) - (v1 - v0) * (u2 - u0));
    if (!Number.isFinite(uvArea2) || uvArea2 * 0.5 <= 1e-9) degenerateUvTriangleCount += 1;

    const w0 = weldedIdOf[i0] ?? 0;
    const w1 = weldedIdOf[i1] ?? 0;
    const w2 = weldedIdOf[i2] ?? 0;
    const edges: readonly (readonly [number, number])[] = [[w0, w1], [w1, w2], [w2, w0]];
    for (const [ea, eb] of edges) {
      const key = ea < eb ? `${ea}:${eb}` : `${eb}:${ea}`;
      let stat = edgeStats.get(key);
      if (!stat) {
        stat = { forward: 0, reverse: 0 };
        edgeStats.set(key, stat);
      }
      if (ea < eb) stat.forward += 1;
      else stat.reverse += 1;
    }
  }

  let looseVertexCount = 0;
  for (let v = 0; v < vertexCount; v += 1) {
    if (referencedVertices[v] === 0) looseVertexCount += 1;
  }

  let boundaryEdgeCount = 0;
  let nonManifoldEdgeCount = 0;
  let oppositeOrientationMismatchCount = 0;
  for (const stat of edgeStats.values()) {
    const total = stat.forward + stat.reverse;
    if (total === 1) boundaryEdgeCount += 1;
    else if (total > 2) nonManifoldEdgeCount += 1;
    else if (stat.forward !== 1 || stat.reverse !== 1) oppositeOrientationMismatchCount += 1;
  }

  const groundedAtZeroY = vertexCount > 0 && Math.abs(minY) <= 1e-6;
  const watertight = boundaryEdgeCount === 0 && triangleCount > 0;
  const manifold =
    watertight &&
    nonManifoldEdgeCount === 0 &&
    oppositeOrientationMismatchCount === 0 &&
    degenerateTriangleCount === 0 &&
    looseVertexCount === 0;

  return {
    watertight,
    manifold,
    boundaryEdgeCount,
    nonManifoldEdgeCount,
    oppositeOrientationMismatchCount,
    degenerateTriangleCount,
    looseVertexCount,
    invalidNormalCount,
    degenerateUvTriangleCount,
    signedVolumeM3: signedVolume6 / 6,
    groundedAtZeroY,
  };
}

/**
 * 2D 벡터 건축 평면도(다각형·문/창문 벽체·계단)를 미터법 수밀 3D 메시로 변환한다.
 */
export function extrudeVectorPlanToManifoldMesh(input: VectorFloorplanInput): ManifoldMeshResult {
  if (input.elements.length === 0) {
    throw new Error("변환할 2D 벡터 건축 요소가 최소 1개 이상 필요합니다.");
  }
  const uvScale = 1 / Math.max(0.05, input.uvMetersPerTile ?? 1.0);
  const groundToZeroY = input.groundToZeroY ?? true;
  const builder = new ManifoldMeshBuilder();
  const materialRanges: ManifoldMaterialRange[] = [];

  for (const element of input.elements) {
    const startIndex = builder.indices.length;
    if (element.kind === "polygon") emitExtrudedPolygonSolid(builder, element, uvScale);
    else if (element.kind === "wall") emitWallWithOpeningsSolid(builder, element, uvScale);
    else emitStairsSolid(builder, element, uvScale);
    materialRanges.push({
      id: element.id,
      materialSlot: element.materialSlot ?? (element.kind === "polygon" ? "prop" : element.kind),
      startIndex,
      indexCount: builder.indices.length - startIndex,
    });
  }

  const positions = new Float32Array(builder.positions);
  const normals = new Float32Array(builder.normals);
  const uvs = new Float32Array(builder.uvs);
  const indices = new Uint32Array(builder.indices);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const vertexCount = positions.length / 3;
  for (let v = 0; v < vertexCount; v += 1) {
    const x = positions[v * 3] ?? 0;
    const y = positions[v * 3 + 1] ?? 0;
    const z = positions[v * 3 + 2] ?? 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  if (groundToZeroY && Number.isFinite(minY) && Math.abs(minY) > 0) {
    const shiftY = -minY;
    for (let v = 0; v < vertexCount; v += 1) {
      const shifted = (positions[v * 3 + 1] ?? 0) + shiftY;
      positions[v * 3 + 1] = Math.abs(shifted) < 1e-7 ? 0 : shifted;
    }
    maxY += shiftY;
    minY = 0;
  } else if (minY === 0) {
    minY = 0;
  }

  const bounds: ManifoldMeshBounds = {
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
    sizeX: maxX - minX,
    sizeY: maxY - minY,
    sizeZ: maxZ - minZ,
  };

  return {
    positions,
    normals,
    uvs,
    indices,
    materialRanges,
    vertexCount,
    triangleCount: indices.length / 3,
    bounds,
    audit: validateManifoldMeshTopology(positions, normals, uvs, indices),
  };
}
