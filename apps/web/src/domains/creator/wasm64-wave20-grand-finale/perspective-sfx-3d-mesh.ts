/**
 * Wasm64 Wave 20 Grand Finale — 3D 투시 돌출·베벨 한글 효과음(SFX) 수밀 2-다양체 메쉬 빌더.
 *
 * 2D 한글 효과음 폴리곤(`콰아앙`, `번쩍` 등)을 소실점(Vanishing Point) 방향 투시 수렴과
 * 전·후면 모서리 베벨 링으로 돌출해 경계 간선 0개·비다양체 간선 0개인 수밀(Watertight) 3D 메쉬를 생성한다.
 */

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type SfxMeshFaceRole = "front" | "bevel" | "side" | "back";

export interface SfxGlyphContour2D {
  readonly points: readonly Point2D[];
}

export interface Sfx3dExtrudeInput {
  readonly glyphText: string;
  readonly contours?: readonly SfxGlyphContour2D[];
  readonly vanishingPoint: Vec3;
  readonly extrusionDepth: number;
  readonly bevelRadius: number;
  readonly bevelSegments?: number;
}

export interface ManifoldVerificationReport {
  readonly isWatertightTwoManifold: boolean;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly undirectedEdgeCount: number;
  readonly boundaryEdgeCount: number;
  readonly nonManifoldEdgeCount: number;
  readonly degenerateFaceCount: number;
  readonly signedVolume: number;
}

export interface Sfx3dExtrudedMesh {
  readonly glyphText: string;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly faceNormals: Float32Array;
  readonly indices: Uint32Array;
  readonly faceRoles: readonly SfxMeshFaceRole[];
  readonly roleFaceCounts: Readonly<Record<SfxMeshFaceRole, number>>;
  readonly manifold: ManifoldVerificationReport;
  readonly serverCostKrw: 0;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function len3(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

function normalize3(a: Vec3, fallback: Vec3): Vec3 {
  const l = len3(a);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l, z: a.z / l } : fallback;
}

function signedArea2D(pts: readonly Point2D[]): number {
  let area2 = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    area2 += a.x * b.y - b.x * a.y;
  }
  return area2 * 0.5;
}

function cross2D(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function pointInTriangle2D(px: number, py: number, a: Point2D, b: Point2D, c: Point2D): boolean {
  const c1 = cross2D(b.x - a.x, b.y - a.y, px - a.x, py - a.y);
  const c2 = cross2D(c.x - b.x, c.y - b.y, px - b.x, py - b.y);
  const c3 = cross2D(a.x - c.x, a.y - c.y, px - c.x, py - c.y);
  return c1 >= -1e-8 && c2 >= -1e-8 && c3 >= -1e-8;
}

function segmentsProperlyIntersect(a: Point2D, b: Point2D, c: Point2D, d: Point2D): boolean {
  const d1 = cross2D(b.x - a.x, b.y - a.y, c.x - a.x, c.y - a.y);
  const d2 = cross2D(b.x - a.x, b.y - a.y, d.x - a.x, d.y - a.y);
  const d3 = cross2D(d.x - c.x, d.y - c.y, a.x - c.x, a.y - c.y);
  const d4 = cross2D(d.x - c.x, d.y - c.y, b.x - c.x, b.y - c.y);
  return ((d1 > 1e-8 && d2 < -1e-8) || (d1 < -1e-8 && d2 > 1e-8))
    && ((d3 > 1e-8 && d4 < -1e-8) || (d3 < -1e-8 && d4 > 1e-8));
}

function hasPolygonSelfIntersection(pts: readonly Point2D[]): boolean {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = pts[j]!;
      const d = pts[(j + 1) % n]!;
      if (segmentsProperlyIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

function triangulateSimpleCcwPolygon(pts: readonly Point2D[]): number[] {
  const n = pts.length;
  const remaining = Array.from({ length: n }, (_, i) => i);
  const tris: number[] = [];
  let guard = n * n * 2;

  while (remaining.length > 3 && guard-- > 0) {
    const m = remaining.length;
    let bestEarPos = -1;
    let bestScore = -1;

    for (let i = 0; i < m; i++) {
      const prevIdx = remaining[(i + m - 1) % m]!;
      const curIdx = remaining[i]!;
      const nextIdx = remaining[(i + 1) % m]!;
      const a = pts[prevIdx]!;
      const b = pts[curIdx]!;
      const c = pts[nextIdx]!;
      const area2 = cross2D(b.x - a.x, b.y - a.y, c.x - b.x, c.y - b.y);
      if (area2 <= 1e-8) continue;

      let containsOther = false;
      for (let k = 0; k < m; k++) {
        const testIdx = remaining[k]!;
        if (testIdx === prevIdx || testIdx === curIdx || testIdx === nextIdx) continue;
        const p = pts[testIdx]!;
        if (pointInTriangle2D(p.x, p.y, a, b, c)) {
          containsOther = true;
          break;
        }
      }
      if (containsOther) continue;

      const peri = Math.hypot(b.x - a.x, b.y - a.y)
        + Math.hypot(c.x - b.x, c.y - b.y)
        + Math.hypot(a.x - c.x, a.y - c.y);
      const quality = area2 / (peri * peri + 1e-9);
      if (quality > bestScore) {
        bestScore = quality;
        bestEarPos = i;
      }
    }

    if (bestEarPos < 0) bestEarPos = 0;
    const mNow = remaining.length;
    tris.push(
      remaining[(bestEarPos + mNow - 1) % mNow]!,
      remaining[bestEarPos]!,
      remaining[(bestEarPos + 1) % mNow]!,
    );
    remaining.splice(bestEarPos, 1);
  }
  if (remaining.length === 3) {
    tris.push(remaining[0]!, remaining[1]!, remaining[2]!);
  }
  return tris;
}

/** 한글 효과음 글자 수에 맞춰 타격감 있는 폭발형·번개형 2D 외곽선을 기본 생성한다. */
export function createPresetKoreanSfxContours(glyphText: string): readonly SfxGlyphContour2D[] {
  const trimmed = glyphText.trim();
  const count = Math.max(1, Array.from(trimmed.length > 0 ? trimmed : "쾅").length);
  const contours: SfxGlyphContour2D[] = [];
  const isLightning = trimmed.includes("번") || trimmed.includes("쩍") || trimmed.includes("찌");

  for (let idx = 0; idx < count; idx++) {
    const cx = idx * 68;
    const cy = idx % 2 === 0 ? 0 : 6;
    if (isLightning) {
      contours.push({
        points: [
          { x: cx - 18, y: cy + 28 },
          { x: cx - 26, y: cy - 2 },
          { x: cx - 8, y: cy - 4 },
          { x: cx - 16, y: cy - 30 },
          { x: cx + 22, y: cy + 2 },
          { x: cx + 4, y: cy + 4 },
          { x: cx + 16, y: cy + 28 },
        ],
      });
    } else {
      const spikes = 8;
      const pts: Point2D[] = [];
      for (let s = 0; s < spikes; s++) {
        const ang = (s / spikes) * Math.PI * 2;
        const r = s % 2 === 0 ? 28 : 17;
        pts.push({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r });
      }
      contours.push({ points: pts });
    }
  }
  return contours;
}

function computeSafeInwardMiterVectors(ccwPts: readonly Point2D[]): {
  readonly miters: readonly Point2D[];
  readonly maxSafeInset: number;
} {
  const n = ccwPts.length;
  const miters: Point2D[] = [];
  let minEdgeLen = Infinity;

  for (let i = 0; i < n; i++) {
    const prev = ccwPts[(i + n - 1) % n]!;
    const cur = ccwPts[i]!;
    const next = ccwPts[(i + 1) % n]!;
    const e1x = cur.x - prev.x;
    const e1y = cur.y - prev.y;
    const l1 = Math.hypot(e1x, e1y);
    const e2x = next.x - cur.x;
    const e2y = next.y - cur.y;
    const l2 = Math.hypot(e2x, e2y);
    if (l1 < minEdgeLen) minEdgeLen = l1;
    if (l2 < minEdgeLen) minEdgeLen = l2;

    const n1x = -e1y / Math.max(l1, 1e-9);
    const n1y = e1x / Math.max(l1, 1e-9);
    const n2x = -e2y / Math.max(l2, 1e-9);
    const n2y = e2x / Math.max(l2, 1e-9);
    let bx = n1x + n2x;
    let by = n1y + n2y;
    const bLen = Math.hypot(bx, by);
    if (bLen > 1e-6) {
      bx /= bLen;
      by /= bLen;
    } else {
      bx = n1x;
      by = n1y;
    }
    const denom = clamp(bx * n1x + by * n1y, 0.35, 1);
    miters.push({ x: bx / denom, y: by / denom });
  }

  let safeInset = minEdgeLen * 0.24;
  for (let step = 0; step < 8; step++) {
    const candidate = ccwPts.map((p, i) => ({
      x: p.x + miters[i]!.x * safeInset,
      y: p.y + miters[i]!.y * safeInset,
    }));
    const edgesAligned = ccwPts.every((p, i) => {
      const nextOrig = ccwPts[(i + 1) % n]!;
      const cCur = candidate[i]!;
      const cNext = candidate[(i + 1) % n]!;
      return (nextOrig.x - p.x) * (cNext.x - cCur.x) + (nextOrig.y - p.y) * (cNext.y - cCur.y) > 1e-6;
    });
    if (edgesAligned && signedArea2D(candidate) > 1e-5 && !hasPolygonSelfIntersection(candidate)) {
      break;
    }
    safeInset *= 0.5;
  }
  return { miters, maxSafeInset: safeInset };
}

/** 인덱싱된 삼각형 메쉬의 수밀(Watertight) 2-다양체 위상 무결성을 검증한다. */
export function verifyWatertightTwoManifold(
  positions: Float32Array,
  indices: Uint32Array,
): ManifoldVerificationReport {
  const vertexCount = Math.floor(positions.length / 3);
  const triangleCount = Math.floor(indices.length / 3);
  const directedCounts = new Map<string, number>();
  const undirectedCounts = new Map<string, number>();
  let degenerateFaceCount = 0;
  let signedVolume6 = 0;

  for (let t = 0; t < triangleCount; t++) {
    const i0 = indices[t * 3]!;
    const i1 = indices[t * 3 + 1]!;
    const i2 = indices[t * 3 + 2]!;
    const a = vec3(positions[i0 * 3]!, positions[i0 * 3 + 1]!, positions[i0 * 3 + 2]!);
    const b = vec3(positions[i1 * 3]!, positions[i1 * 3 + 1]!, positions[i1 * 3 + 2]!);
    const c = vec3(positions[i2 * 3]!, positions[i2 * 3 + 1]!, positions[i2 * 3 + 2]!);
    const n = cross3(sub3(b, a), sub3(c, a));
    if (len3(n) <= 1e-9 || i0 === i1 || i1 === i2 || i2 === i0) degenerateFaceCount++;
    signedVolume6 += dot3(a, cross3(b, c));

    const tri = [i0, i1, i2];
    for (let e = 0; e < 3; e++) {
      const u = tri[e]!;
      const v = tri[(e + 1) % 3]!;
      const dKey = `${u}>${v}`;
      directedCounts.set(dKey, (directedCounts.get(dKey) ?? 0) + 1);
      const uKey = `${Math.min(u, v)}-${Math.max(u, v)}`;
      undirectedCounts.set(uKey, (undirectedCounts.get(uKey) ?? 0) + 1);
    }
  }

  let boundaryEdgeCount = 0;
  let nonManifoldEdgeCount = 0;
  for (const [uKey, count] of undirectedCounts.entries()) {
    if (count === 1) {
      boundaryEdgeCount++;
    } else if (count !== 2) {
      nonManifoldEdgeCount++;
    } else {
      const dash = uKey.indexOf("-");
      const lo = uKey.slice(0, dash);
      const hi = uKey.slice(dash + 1);
      if ((directedCounts.get(`${lo}>${hi}`) ?? 0) !== 1 || (directedCounts.get(`${hi}>${lo}`) ?? 0) !== 1) {
        nonManifoldEdgeCount++;
      }
    }
  }

  const signedVolume = signedVolume6 / 6;
  const isWatertightTwoManifold = triangleCount >= 4
    && boundaryEdgeCount === 0
    && nonManifoldEdgeCount === 0
    && degenerateFaceCount === 0
    && signedVolume > 1e-6;

  return {
    isWatertightTwoManifold,
    vertexCount,
    triangleCount,
    undirectedEdgeCount: undirectedCounts.size,
    boundaryEdgeCount,
    nonManifoldEdgeCount,
    degenerateFaceCount,
    signedVolume,
  };
}

/** 2D 한글 효과음 폴리곤을 소실점 투시 돌출 및 베벨 처리된 수밀 2-다양체 3D 메쉬로 생성한다. */
export function buildPerspectiveSfx3dMesh(input: Sfx3dExtrudeInput): Sfx3dExtrudedMesh {
  const { glyphText, vanishingPoint } = input;
  const rawContours = input.contours && input.contours.length > 0
    ? input.contours
    : createPresetKoreanSfxContours(glyphText);

  const vpZ = vanishingPoint.z < -1e-3 ? vanishingPoint.z : -Math.max(100, Math.abs(vanishingPoint.z) + 200);
  const depth = clamp(input.extrusionDepth, 0.5, Math.abs(vpZ) * 0.85);
  const bevelSegs = Math.max(1, Math.min(4, Math.round(input.bevelSegments ?? 2)));
  const requestedBevel = Math.max(0.02, input.bevelRadius);

  const posOut: number[] = [];
  const idxOut: number[] = [];
  const rolesOut: SfxMeshFaceRole[] = [];
  const roleFaceCounts: Record<SfxMeshFaceRole, number> = { front: 0, bevel: 0, side: 0, back: 0 };

  for (const contour of rawContours) {
    const cleaned: Point2D[] = [];
    for (const p of contour.points) {
      const prev = cleaned[cleaned.length - 1];
      if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 1e-4) cleaned.push({ x: p.x, y: p.y });
    }
    if (cleaned.length >= 2) {
      const first = cleaned[0]!;
      const last = cleaned[cleaned.length - 1]!;
      if (Math.hypot(first.x - last.x, first.y - last.y) <= 1e-4) cleaned.pop();
    }
    if (cleaned.length < 3) continue;

    const ccw = signedArea2D(cleaned) >= 0 ? cleaned : [...cleaned].reverse();
    const n = ccw.length;
    const { miters, maxSafeInset } = computeSafeInwardMiterVectors(ccw);
    const bevelR = Math.min(requestedBevel, maxSafeInset, depth * 0.35);

    const sliceSpecs: Array<{ readonly z: number; readonly inset: number; readonly nextRole: SfxMeshFaceRole | null }> = [];
    for (let s = 0; s <= bevelSegs; s++) {
      const theta = (s / bevelSegs) * (Math.PI * 0.5);
      sliceSpecs.push({
        z: -bevelR * (1 - Math.cos(theta)),
        inset: bevelR * (1 - Math.sin(theta)),
        nextRole: s < bevelSegs ? "bevel" : "side",
      });
    }
    for (let s = 0; s <= bevelSegs; s++) {
      const theta = (s / bevelSegs) * (Math.PI * 0.5);
      sliceSpecs.push({
        z: -(depth - bevelR * Math.cos(theta)),
        inset: bevelR * Math.sin(theta),
        nextRole: s < bevelSegs ? "bevel" : null,
      });
    }

    const baseVertexOffset = posOut.length / 3;
    let frontRing2D: Point2D[] = [];

    for (let r = 0; r < sliceSpecs.length; r++) {
      const spec = sliceSpecs[r]!;
      const perspT = clamp(-spec.z / -vpZ, 0, 0.92);
      const perspScale = 1 - perspT;
      const ring2D: Point2D[] = [];

      for (let i = 0; i < n; i++) {
        const insetX = ccw[i]!.x + miters[i]!.x * spec.inset;
        const insetY = ccw[i]!.y + miters[i]!.y * spec.inset;
        const px = insetX * perspScale + vanishingPoint.x * perspT;
        const py = insetY * perspScale + vanishingPoint.y * perspT;
        posOut.push(px, py, spec.z);
        ring2D.push({ x: px, y: py });
      }
      if (r === 0) frontRing2D = ring2D;
    }

    const capLocalTris = triangulateSimpleCcwPolygon(frontRing2D);
    for (let t = 0; t < capLocalTris.length; t += 3) {
      idxOut.push(
        baseVertexOffset + capLocalTris[t]!,
        baseVertexOffset + capLocalTris[t + 1]!,
        baseVertexOffset + capLocalTris[t + 2]!,
      );
      rolesOut.push("front");
      roleFaceCounts.front++;
    }

    const ringCount = sliceSpecs.length;
    for (let r = 0; r + 1 < ringCount; r++) {
      const role = sliceSpecs[r]!.nextRole ?? "side";
      const rowA = baseVertexOffset + r * n;
      const rowB = baseVertexOffset + (r + 1) * n;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const a0 = rowA + i;
        const a1 = rowA + j;
        const b0 = rowB + i;
        const b1 = rowB + j;
        idxOut.push(a0, b0, a1, a1, b0, b1);
        rolesOut.push(role, role);
        roleFaceCounts[role] += 2;
      }
    }

    const backRowOffset = baseVertexOffset + (ringCount - 1) * n;
    for (let t = 0; t < capLocalTris.length; t += 3) {
      idxOut.push(
        backRowOffset + capLocalTris[t]!,
        backRowOffset + capLocalTris[t + 2]!,
        backRowOffset + capLocalTris[t + 1]!,
      );
      rolesOut.push("back");
      roleFaceCounts.back++;
    }
  }

  const positions = new Float32Array(posOut);
  const indices = new Uint32Array(idxOut);
  const vertCount = positions.length / 3;
  const triCount = indices.length / 3;
  const normals = new Float32Array(vertCount * 3);
  const faceNormals = new Float32Array(triCount * 3);

  for (let t = 0; t < triCount; t++) {
    const i0 = indices[t * 3]!;
    const i1 = indices[t * 3 + 1]!;
    const i2 = indices[t * 3 + 2]!;
    const a = vec3(positions[i0 * 3]!, positions[i0 * 3 + 1]!, positions[i0 * 3 + 2]!);
    const b = vec3(positions[i1 * 3]!, positions[i1 * 3 + 1]!, positions[i1 * 3 + 2]!);
    const c = vec3(positions[i2 * 3]!, positions[i2 * 3 + 1]!, positions[i2 * 3 + 2]!);
    const weightedN = cross3(sub3(b, a), sub3(c, a));
    const unitFn = normalize3(weightedN, vec3(0, 0, 1));
    faceNormals[t * 3] = unitFn.x;
    faceNormals[t * 3 + 1] = unitFn.y;
    faceNormals[t * 3 + 2] = unitFn.z;

    for (const vi of [i0, i1, i2]) {
      normals[vi * 3] = (normals[vi * 3] ?? 0) + weightedN.x;
      normals[vi * 3 + 1] = (normals[vi * 3 + 1] ?? 0) + weightedN.y;
      normals[vi * 3 + 2] = (normals[vi * 3 + 2] ?? 0) + weightedN.z;
    }
  }

  for (let v = 0; v < vertCount; v++) {
    const unitVn = normalize3(vec3(normals[v * 3]!, normals[v * 3 + 1]!, normals[v * 3 + 2]!), vec3(0, 0, 1));
    normals[v * 3] = unitVn.x;
    normals[v * 3 + 1] = unitVn.y;
    normals[v * 3 + 2] = unitVn.z;
  }

  return {
    glyphText,
    positions,
    normals,
    faceNormals,
    indices,
    faceRoles: rolesOut,
    roleFaceCounts,
    manifold: verifyWatertightTwoManifold(positions, indices),
    serverCostKrw: 0,
  };
}
