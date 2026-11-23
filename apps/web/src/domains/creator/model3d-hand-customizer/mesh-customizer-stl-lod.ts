/**
 * 3D 메쉬 커스터마이징 · STL 파서 · 정점 가중치 스무딩 · 2×2×2 FFD 래티스 · Auto-LOD · 3D 그룹·상호 그림자 엔진.
 *
 * 1. 바이너리/ASCII `.stl` 실제 파서(`parseStlMesh`) + 비매니폴드·퇴화·미터/Z=0 정규화(`auditAndNormalize3dMesh`)
 * 2. 인접 그래프 기반 정점 가중치 라플라시안 스무딩(`smoothVertexWeights`)
 * 3. 2×2×2 삼선형 FFD 래티스 변형기(`deformMeshByLattice`)
 * 4. 3단계 Auto-LOD 예산 플래너(`computeAutoLodPlan`: LOD0 100% / LOD1 45% / LOD2 18% + 60fps Instancing)
 * 5. 3D 폴더 그룹 TRS 일괄 변환 & 오브젝트 간 상호 그림자 바운딩 프로젝션(`evaluate3dGroupAndCastShadows`)
 */

import type { Vec3 } from "./hand-rig-3d";

export type TriangleIndices = readonly [number, number, number];
export interface BoundingBox3d { readonly min: Vec3; readonly max: Vec3 }
export type AutoLodTierId = "LOD0" | "LOD1" | "LOD2";

export interface Mesh3dData {
  readonly name: string;
  readonly format: "binary-stl" | "ascii-stl" | "procedural";
  readonly vertices: readonly Vec3[];
  readonly triangles: readonly TriangleIndices[];
  readonly rawTriangleCount: number;
}

export interface MeshTopologyAudit {
  readonly vertexCount: number; readonly triangleCount: number; readonly degenerateTriangleCount: number;
  readonly openBoundaryEdgeCount: number; readonly overSharedEdgeCount: number; readonly nonManifoldEdgeCount: number;
  readonly isWatertight: boolean; readonly isManifold: boolean; readonly bounds: BoundingBox3d; readonly extents: Vec3;
}

export interface NormalizedMesh3dResult {
  readonly rawAudit: MeshTopologyAudit; readonly normalizedAudit: MeshTopologyAudit; readonly normalizedMesh: Mesh3dData;
  readonly appliedScaleFactor: number; readonly detectedMillimeterInput: boolean;
  readonly removedDegenerateCount: number; readonly groundedToZeroZ: boolean;
}

export interface VertexWeightRecord { readonly vertexIndex: number; readonly weights: readonly number[] }
export interface VertexWeightSmoothOptions { readonly iterations?: number; readonly lambda?: number }

export interface VertexWeightSmoothResult {
  readonly weights: readonly VertexWeightRecord[]; readonly iterations: number; readonly lambda: number;
  readonly edgeCount: number; readonly beforeVariance: number; readonly afterVariance: number;
  readonly varianceReductionRatio: number; readonly maxEdgeJumpBefore: number;
  readonly maxEdgeJumpAfter: number; readonly maxWeightSumError: number;
}

export interface Lattice2x2x2 {
  readonly controlPoints: readonly [Vec3, Vec3, Vec3, Vec3, Vec3, Vec3, Vec3, Vec3];
}

export interface UpperBodyLatticeParams {
  readonly shoulderWidthScale: number; readonly waistTaperScale: number;
  readonly torsoHeightScale: number; readonly chestDepthScale: number; readonly leanX?: number;
}

export interface LatticeDeformResult {
  readonly deformedMesh: Mesh3dData; readonly originalBounds: BoundingBox3d; readonly deformedBounds: BoundingBox3d;
  readonly maxDisplacementMeters: number; readonly meanDisplacementMeters: number; readonly lattice: Lattice2x2x2;
}

export interface AutoLodTierSpec {
  readonly id: AutoLodTierId; readonly labelKo: string; readonly labelEn: string;
  readonly maxDistanceMeters: number; readonly triangleRatio: number;
}

export interface AutoLodSceneInstance {
  readonly id: string; readonly assetKey: string; readonly labelKo: string; readonly labelEn: string;
  readonly baseTriangles: number; readonly distanceMeters: number; readonly materialCount?: number;
}

export interface AutoLodInstancePlan {
  readonly id: string; readonly assetKey: string; readonly labelKo: string; readonly labelEn: string;
  readonly distanceMeters: number; readonly activeTier: AutoLodTierId; readonly baseTriangles: number;
  readonly lod0Triangles: number; readonly lod1Triangles: number; readonly lod2Triangles: number; readonly activeTriangles: number;
}

export interface AutoLodPlanResult {
  readonly instances: readonly AutoLodInstancePlan[];
  readonly tierSummary: Readonly<Record<AutoLodTierId, { readonly instanceCount: number; readonly renderedTriangles: number; readonly triangleRatio: number }>>;
  readonly totalNaiveTriangles: number; readonly totalRenderedTriangles: number; readonly triangleReductionPercent: number;
  readonly naiveDrawCalls: number; readonly instancedDrawCalls: number; readonly drawCallSavingsPercent: number;
  readonly estimatedFrameMs: number; readonly estimatedFps: number; readonly within60FpsBudget: boolean;
}

export interface Transform3d { readonly translate: Vec3; readonly rotateDeg: Vec3; readonly scale: Vec3 }

export interface Scene3dGroupObject {
  readonly id: string; readonly labelKo: string; readonly labelEn: string;
  readonly localCenter: Vec3; readonly halfExtents: Vec3; readonly localRotateDeg?: Vec3;
  readonly castShadow?: boolean; readonly receiveShadow?: boolean;
}

export interface Scene3dFolderGroup {
  readonly groupId: string; readonly nameKo: string; readonly nameEn: string;
  readonly transform: Transform3d; readonly objects: readonly Scene3dGroupObject[];
}

export interface Rect2dBounds {
  readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number; readonly areaM2: number;
}

export interface EvaluatedGroupObject3d {
  readonly id: string; readonly labelKo: string; readonly labelEn: string;
  readonly worldCenter: Vec3; readonly worldBounds: BoundingBox3d; readonly groundShadow2d: Rect2dBounds | null;
}

export interface InterObjectShadowHit {
  readonly casterId: string; readonly receiverId: string; readonly shadowPlaneZ: number;
  readonly overlapAreaM2: number; readonly coverageRatio: number; readonly projectedFootprint2d: Rect2dBounds;
}

export interface GroupAndShadowEvaluation {
  readonly groupId: string; readonly normalizedLightDir: Vec3; readonly groupWorldBounds: BoundingBox3d;
  readonly objects: readonly EvaluatedGroupObject3d[]; readonly castShadowPairs: readonly InterObjectShadowHit[];
  readonly summary: { readonly objectCount: number; readonly shadowHitCount: number; readonly affectedReceiverCount: number };
}

export const AUTO_LOD_TIERS: readonly AutoLodTierSpec[] = [
  { id: "LOD0", labelKo: "LOD0 근접 히어로", labelEn: "LOD0 Hero Close-up", maxDistanceMeters: 3.0, triangleRatio: 1.0 },
  { id: "LOD1", labelKo: "LOD1 중경 인물", labelEn: "LOD1 Midground", maxDistanceMeters: 10.0, triangleRatio: 0.45 },
  { id: "LOD2", labelKo: "LOD2 원경 군중", labelEn: "LOD2 Distant Crowd", maxDistanceMeters: Number.POSITIVE_INFINITY, triangleRatio: 0.18 },
];

const DEG_TO_RAD = Math.PI / 180;
const EPS = 1e-9;
const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const cleanZero = (v: number): number => (Object.is(v, -0) || Math.abs(v) < 1e-12 ? 0 : v);

export function computeMeshBounds(vertices: readonly Vec3[]): BoundingBox3d {
  if (vertices.length === 0) return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  let minX = Number.POSITIVE_INFINITY; let minY = Number.POSITIVE_INFINITY; let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY; let maxY = Number.NEGATIVE_INFINITY; let maxZ = Number.NEGATIVE_INFINITY;
  for (const v of vertices) {
    if (v.x < minX) minX = v.x; if (v.y < minY) minY = v.y; if (v.z < minZ) minZ = v.z;
    if (v.x > maxX) maxX = v.x; if (v.y > maxY) maxY = v.y; if (v.z > maxZ) maxZ = v.z;
  }
  return {
    min: { x: cleanZero(minX), y: cleanZero(minY), z: cleanZero(minZ) },
    max: { x: cleanZero(maxX), y: cleanZero(maxY), z: cleanZero(maxZ) },
  };
}

function triangleArea(a: Vec3, b: Vec3, c: Vec3): number {
  const abx = b.x - a.x; const aby = b.y - a.y; const abz = b.z - a.z;
  const acx = c.x - a.x; const acy = c.y - a.y; const acz = c.z - a.z;
  return 0.5 * Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx);
}

function weldTriangles(rawTriangles: readonly (readonly [Vec3, Vec3, Vec3])[], name: string, format: Mesh3dData["format"]): Mesh3dData {
  const vertices: Vec3[] = [];
  const triangles: TriangleIndices[] = [];
  const indexMap = new Map<string, number>();
  const getIndex = (v: Vec3): number => {
    const key = `${Math.round(v.x * 1e5)}|${Math.round(v.y * 1e5)}|${Math.round(v.z * 1e5)}`;
    const existing = indexMap.get(key);
    if (existing !== undefined) return existing;
    const nextIdx = vertices.length;
    vertices.push({ x: cleanZero(v.x), y: cleanZero(v.y), z: cleanZero(v.z) });
    indexMap.set(key, nextIdx);
    return nextIdx;
  };
  for (const [v0, v1, v2] of rawTriangles) triangles.push([getIndex(v0), getIndex(v1), getIndex(v2)]);
  return { name, format, vertices, triangles, rawTriangleCount: rawTriangles.length };
}

function parseAsciiStlText(text: string): Mesh3dData {
  const name = /^\s*solid\s*([^\r\n]*)/i.exec(text)?.[1]?.trim() || "ascii-stl-mesh";
  const regex = /vertex\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)/g;
  const verts: Vec3[] = [];
  for (let m = regex.exec(text); m !== null; m = regex.exec(text)) {
    verts.push({ x: Number(m[1]), y: Number(m[2]), z: Number(m[3]) });
  }
  if (verts.length < 3 || verts.length % 3 !== 0) {
    throw new Error("유효한 ASCII STL 정점(3의 배수)을 찾을 수 없습니다.");
  }
  const raw: [Vec3, Vec3, Vec3][] = [];
  for (let i = 0; i < verts.length; i += 3) raw.push([verts[i], verts[i + 1], verts[i + 2]]);
  return weldTriangles(raw, name, "ascii-stl");
}

function parseBinaryStlBytes(bytes: Uint8Array): Mesh3dData {
  if (bytes.byteLength < 84) throw new Error("바이너리 STL 헤더 길이(84바이트 이상)가 부족합니다.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const triCount = view.getUint32(80, true);
  if (triCount === 0 || bytes.byteLength !== 84 + triCount * 50) {
    throw new Error(`바이너리 STL 길이 불일치: expected ${84 + triCount * 50}B, got ${bytes.byteLength}B.`);
  }
  const name = new TextDecoder("utf-8").decode(bytes.subarray(0, 80)).replaceAll("\0", "").trim() || "binary-stl-mesh";
  const raw: [Vec3, Vec3, Vec3][] = [];
  for (let t = 0; t < triCount; t += 1) {
    const b = 84 + t * 50 + 12;
    raw.push([
      { x: view.getFloat32(b, true), y: view.getFloat32(b + 4, true), z: view.getFloat32(b + 8, true) },
      { x: view.getFloat32(b + 12, true), y: view.getFloat32(b + 16, true), z: view.getFloat32(b + 20, true) },
      { x: view.getFloat32(b + 24, true), y: view.getFloat32(b + 28, true), z: view.getFloat32(b + 32, true) },
    ]);
  }
  return weldTriangles(raw, name, "binary-stl");
}

/** 실제 바이너리 및 ASCII `.stl` 파서(바이너리 `84 + 50*N` 길이 계약 우선 판정). */
export function parseStlMesh(input: ArrayBufferLike | Uint8Array | string): Mesh3dData {
  if (typeof input === "string") return parseAsciiStlText(input);
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength >= 84) {
    const triCount = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true);
    if (triCount > 0 && 84 + triCount * 50 === bytes.byteLength) return parseBinaryStlBytes(bytes);
  }
  const decoded = new TextDecoder("utf-8").decode(bytes);
  if (/facet\s+normal/i.test(decoded)) return parseAsciiStlText(decoded);
  throw new Error("지원되지 않거나 손상된 STL 입력입니다.");
}

export function buildBinaryStlBuffer(mesh: Mesh3dData, headerLabel?: string): Uint8Array<ArrayBuffer> {
  const triCount = mesh.triangles.length;
  const out = new Uint8Array(84 + triCount * 50);
  out.set(new TextEncoder().encode((headerLabel ?? mesh.name).slice(0, 79)), 0);
  const view = new DataView(out.buffer);
  view.setUint32(80, triCount, true);
  for (let i = 0; i < triCount; i += 1) {
    const [i0, i1, i2] = mesh.triangles[i];
    const v0 = mesh.vertices[i0]; const v1 = mesh.vertices[i1]; const v2 = mesh.vertices[i2];
    const ux = v1.x - v0.x; const uy = v1.y - v0.y; const uz = v1.z - v0.z;
    const vx = v2.x - v0.x; const vy = v2.y - v0.y; const vz = v2.z - v0.z;
    const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    const o = 84 + i * 50;
    const vals = [nx / len, ny / len, nz / len, v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z];
    for (let k = 0; k < vals.length; k += 1) view.setFloat32(o + k * 4, vals[k], true);
    view.setUint16(o + 48, 0, true);
  }
  return out;
}

export function buildAsciiStlText(mesh: Mesh3dData): string {
  const lines = [`solid ${mesh.name}`];
  for (const [i0, i1, i2] of mesh.triangles) {
    const v0 = mesh.vertices[i0]; const v1 = mesh.vertices[i1]; const v2 = mesh.vertices[i2];
    lines.push(
      "  facet normal 0 0 1", "    outer loop",
      `      vertex ${v0.x} ${v0.y} ${v0.z}`, `      vertex ${v1.x} ${v1.y} ${v1.z}`, `      vertex ${v2.x} ${v2.y} ${v2.z}`,
      "    endloop", "  endfacet",
    );
  }
  lines.push(`endsolid ${mesh.name}`);
  return lines.join("\n");
}

function inspectMeshTopology(mesh: Mesh3dData): MeshTopologyAudit {
  let degenerateTriangleCount = 0;
  const edgeFaceCounts = new Map<string, number>();
  for (const [i0, i1, i2] of mesh.triangles) {
    const v0 = mesh.vertices[i0]; const v1 = mesh.vertices[i1]; const v2 = mesh.vertices[i2];
    if (!v0 || !v1 || !v2 || i0 === i1 || i1 === i2 || i2 === i0 || triangleArea(v0, v1, v2) < 1e-10) {
      degenerateTriangleCount += 1;
      continue;
    }
    for (const [a, b] of [[i0, i1], [i1, i2], [i2, i0]] as const) {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      edgeFaceCounts.set(key, (edgeFaceCounts.get(key) ?? 0) + 1);
    }
  }
  let openBoundaryEdgeCount = 0;
  let overSharedEdgeCount = 0;
  for (const count of edgeFaceCounts.values()) {
    if (count === 1) openBoundaryEdgeCount += 1;
    else if (count > 2) overSharedEdgeCount += 1;
  }
  const nonManifoldEdgeCount = openBoundaryEdgeCount + overSharedEdgeCount;
  const bounds = computeMeshBounds(mesh.vertices);
  const extents: Vec3 = {
    x: Number((bounds.max.x - bounds.min.x).toFixed(5)),
    y: Number((bounds.max.y - bounds.min.y).toFixed(5)),
    z: Number((bounds.max.z - bounds.min.z).toFixed(5)),
  };
  return {
    vertexCount: mesh.vertices.length, triangleCount: mesh.triangles.length, degenerateTriangleCount,
    openBoundaryEdgeCount, overSharedEdgeCount, nonManifoldEdgeCount,
    isWatertight: mesh.triangles.length > 0 && nonManifoldEdgeCount === 0,
    isManifold: mesh.triangles.length > 0 && nonManifoldEdgeCount === 0 && degenerateTriangleCount === 0,
    bounds, extents,
  };
}

/** 3D 메쉬 위상 감사(비매니폴드·퇴화 삼각형 검출) + 미터 스케일(1.0 = 1m) 및 바닥 `Z=0` 자동 정규화. */
export function auditAndNormalize3dMesh(
  mesh: Mesh3dData,
  options: { readonly autoDetectMillimeters?: boolean; readonly targetHeightMeters?: number } = {},
): NormalizedMesh3dResult {
  const rawAudit = inspectMeshTopology(mesh);
  const maxExtent = Math.max(rawAudit.extents.x, rawAudit.extents.y, rawAudit.extents.z);
  const detectedMillimeterInput = (options.autoDetectMillimeters ?? true) && maxExtent > 10;
  let appliedScaleFactor = 1;
  if (options.targetHeightMeters && rawAudit.extents.z > EPS) appliedScaleFactor = options.targetHeightMeters / rawAudit.extents.z;
  else if (detectedMillimeterInput) appliedScaleFactor = 0.001;

  const cx = (rawAudit.bounds.min.x + rawAudit.bounds.max.x) * 0.5;
  const cy = (rawAudit.bounds.min.y + rawAudit.bounds.max.y) * 0.5;
  const minZ = rawAudit.bounds.min.z;
  const normalizedVertices = mesh.vertices.map((v) => ({
    x: cleanZero((v.x - cx) * appliedScaleFactor),
    y: cleanZero((v.y - cy) * appliedScaleFactor),
    z: cleanZero((v.z - minZ) * appliedScaleFactor),
  }));
  const validTriangles = mesh.triangles.filter(([i0, i1, i2]) => {
    if (i0 === i1 || i1 === i2 || i2 === i0) return false;
    const v0 = normalizedVertices[i0]; const v1 = normalizedVertices[i1]; const v2 = normalizedVertices[i2];
    return Boolean(v0 && v1 && v2 && triangleArea(v0, v1, v2) >= 1e-10);
  });

  const normalizedMesh: Mesh3dData = { ...mesh, vertices: normalizedVertices, triangles: validTriangles };
  const normalizedAudit = inspectMeshTopology(normalizedMesh);
  return {
    rawAudit, normalizedAudit, normalizedMesh,
    appliedScaleFactor: Number(appliedScaleFactor.toFixed(6)),
    detectedMillimeterInput,
    removedDegenerateCount: mesh.triangles.length - validTriangles.length,
    groundedToZeroZ: Math.abs(normalizedAudit.bounds.min.z) < 1e-6,
  };
}

function normalizeWeights(values: readonly number[]): number[] {
  const clamped = values.map((v) => Math.max(0, v));
  const sum = clamped.reduce((acc, v) => acc + v, 0);
  if (sum <= EPS) return clamped.map(() => (clamped.length > 0 ? 1 / clamped.length : 0));
  return clamped.map((v) => v / sum);
}

function computeWeightEdgeStats(weights: readonly (readonly number[])[], edges: readonly (readonly [number, number])[]) {
  if (edges.length === 0) return { variance: 0, maxJump: 0 };
  let sqSum = 0; let maxJump = 0;
  for (const [u, v] of edges) {
    let edgeSq = 0; let edgeMax = 0;
    for (let b = 0; b < weights[u].length; b += 1) {
      const diff = Math.abs(weights[u][b] - weights[v][b]);
      edgeSq += diff * diff;
      if (diff > edgeMax) edgeMax = diff;
    }
    sqSum += edgeSq;
    if (edgeMax > maxJump) maxJump = edgeMax;
  }
  return { variance: Number((sqSum / edges.length).toFixed(6)), maxJump: Number(maxJump.toFixed(4)) };
}

/** 인접 그래프 기반 정점 가중치 라플라시안 스무딩(관절 꺾임 찌그러짐 해소). */
export function smoothVertexWeights(
  mesh: Mesh3dData,
  weights: readonly VertexWeightRecord[],
  options: VertexWeightSmoothOptions = {},
): VertexWeightSmoothResult {
  const iterations = Math.max(0, Math.round(options.iterations ?? 4));
  const lambda = clamp(options.lambda ?? 0.5, 0.05, 0.85);
  const vertexCount = mesh.vertices.length;
  const boneCount = weights[0]?.weights.length ?? 2;

  const neighborSets: Set<number>[] = Array.from({ length: vertexCount }, () => new Set<number>());
  const uniqueEdges: [number, number][] = [];
  const edgeSeen = new Set<string>();
  for (const [i0, i1, i2] of mesh.triangles) {
    for (const [a, b] of [[i0, i1], [i1, i2], [i2, i0]] as const) {
      if (a === b || a < 0 || b < 0 || a >= vertexCount || b >= vertexCount) continue;
      neighborSets[a].add(b); neighborSets[b].add(a);
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (!edgeSeen.has(key)) { edgeSeen.add(key); uniqueEdges.push([a, b]); }
    }
  }

  let current = Array.from({ length: vertexCount }, (_, idx) => {
    const rec = weights.find((item) => item.vertexIndex === idx);
    return normalizeWeights(rec ? rec.weights : Array.from({ length: boneCount }, (_v, bIdx) => (bIdx === 0 ? 1 : 0)));
  });
  const beforeStats = computeWeightEdgeStats(current, uniqueEdges);

  for (let step = 0; step < iterations; step += 1) {
    const next = current.map((row) => [...row]);
    for (let vIdx = 0; vIdx < vertexCount; vIdx += 1) {
      const neighbors = neighborSets[vIdx];
      if (neighbors.size === 0) continue;
      const avg = Array.from({ length: boneCount }, () => 0);
      for (const nIdx of neighbors) {
        for (let b = 0; b < boneCount; b += 1) avg[b] += current[nIdx][b];
      }
      const invN = 1 / neighbors.size;
      next[vIdx] = normalizeWeights(current[vIdx].map((w, b) => (1 - lambda) * w + lambda * avg[b] * invN));
    }
    current = next;
  }

  const afterStats = computeWeightEdgeStats(current, uniqueEdges);
  let maxWeightSumError = 0;
  const outputRecords: VertexWeightRecord[] = current.map((row, vertexIndex) => {
    const err = Math.abs(1 - row.reduce((acc, w) => acc + w, 0));
    if (err > maxWeightSumError) maxWeightSumError = err;
    return { vertexIndex, weights: row.map((w) => Number(w.toFixed(6))) };
  });

  return {
    weights: outputRecords, iterations, lambda, edgeCount: uniqueEdges.length,
    beforeVariance: beforeStats.variance, afterVariance: afterStats.variance,
    varianceReductionRatio: beforeStats.variance > EPS ? Number(((beforeStats.variance - afterStats.variance) / beforeStats.variance).toFixed(4)) : 0,
    maxEdgeJumpBefore: beforeStats.maxJump, maxEdgeJumpAfter: afterStats.maxJump,
    maxWeightSumError: Number(maxWeightSumError.toFixed(8)),
  };
}

/** 상체/어깨 프로포션 조절용 2×2×2 FFD 래티스 제어점 생성기. */
export function createUpperBodyLattice(bounds: BoundingBox3d, params: UpperBodyLatticeParams): Lattice2x2x2 {
  const cx = (bounds.min.x + bounds.max.x) * 0.5;
  const cy = (bounds.min.y + bounds.max.y) * 0.5;
  const halfX = (bounds.max.x - bounds.min.x) * 0.5;
  const halfY = (bounds.max.y - bounds.min.y) * 0.5;
  const height = bounds.max.z - bounds.min.z;
  const shoulderScale = clamp(params.shoulderWidthScale, 0.5, 2.0);
  const waistScale = clamp(params.waistTaperScale, 0.5, 2.0);
  const heightScale = clamp(params.torsoHeightScale, 0.5, 2.0);
  const depthScale = clamp(params.chestDepthScale, 0.5, 2.0);
  const leanX = clamp(params.leanX ?? 0, -0.3, 0.3);

  const corners: Vec3[] = [];
  for (let ix = 0; ix <= 1; ix += 1) {
    for (let iy = 0; iy <= 1; iy += 1) {
      for (let iz = 0; iz <= 1; iz += 1) {
        corners.push({
          x: cleanZero(cx + (ix === 0 ? -1 : 1) * halfX * (iz === 1 ? shoulderScale : waistScale) + (iz === 1 ? leanX : 0)),
          y: cleanZero(cy + (iy === 0 ? -1 : 1) * halfY * (iz === 1 ? depthScale : 1)),
          z: cleanZero(bounds.min.z + iz * height * heightScale),
        });
      }
    }
  }
  return { controlPoints: corners as [Vec3, Vec3, Vec3, Vec3, Vec3, Vec3, Vec3, Vec3] };
}

/** 2×2×2 삼선형 FFD(Free-Form Deformation) 래티스 변형기. */
export function deformMeshByLattice(mesh: Mesh3dData, lattice: Lattice2x2x2): LatticeDeformResult {
  const originalBounds = computeMeshBounds(mesh.vertices);
  const spanX = originalBounds.max.x - originalBounds.min.x;
  const spanY = originalBounds.max.y - originalBounds.min.y;
  const spanZ = originalBounds.max.z - originalBounds.min.z;
  const cp = lattice.controlPoints;
  let maxDisp = 0; let totalDisp = 0;

  const deformedVertices = mesh.vertices.map((v) => {
    const u = spanX > EPS ? clamp((v.x - originalBounds.min.x) / spanX, 0, 1) : 0.5;
    const vv = spanY > EPS ? clamp((v.y - originalBounds.min.y) / spanY, 0, 1) : 0.5;
    const w = spanZ > EPS ? clamp((v.z - originalBounds.min.z) / spanZ, 0, 1) : 0.5;
    let x = 0; let y = 0; let z = 0;
    for (let ix = 0; ix <= 1; ix += 1) {
      const bu = ix === 0 ? 1 - u : u;
      for (let iy = 0; iy <= 1; iy += 1) {
        const bv = iy === 0 ? 1 - vv : vv;
        for (let iz = 0; iz <= 1; iz += 1) {
          const weight = bu * bv * (iz === 0 ? 1 - w : w);
          const ctrl = cp[ix * 4 + iy * 2 + iz];
          x += weight * ctrl.x; y += weight * ctrl.y; z += weight * ctrl.z;
        }
      }
    }
    const next: Vec3 = { x: cleanZero(x), y: cleanZero(y), z: cleanZero(z) };
    const disp = Math.hypot(next.x - v.x, next.y - v.y, next.z - v.z);
    if (disp > maxDisp) maxDisp = disp;
    totalDisp += disp;
    return next;
  });

  const deformedMesh: Mesh3dData = { ...mesh, vertices: deformedVertices };
  return {
    deformedMesh, originalBounds, deformedBounds: computeMeshBounds(deformedVertices),
    maxDisplacementMeters: Number(maxDisp.toFixed(5)),
    meanDisplacementMeters: mesh.vertices.length > 0 ? Number((totalDisp / mesh.vertices.length).toFixed(5)) : 0,
    lattice,
  };
}

/** 3단계 Auto-LOD 예산 플래너(LOD0 100% / LOD1 45% / LOD2 18% + 60fps GPU Instancing). */
export function computeAutoLodPlan(instances: readonly AutoLodSceneInstance[]): AutoLodPlanResult {
  const tierSummary: Record<AutoLodTierId, { instanceCount: number; renderedTriangles: number; triangleRatio: number }> = {
    LOD0: { instanceCount: 0, renderedTriangles: 0, triangleRatio: 1.0 },
    LOD1: { instanceCount: 0, renderedTriangles: 0, triangleRatio: 0.45 },
    LOD2: { instanceCount: 0, renderedTriangles: 0, triangleRatio: 0.18 },
  };
  let totalNaiveTriangles = 0; let totalRenderedTriangles = 0; let naiveDrawCalls = 0;
  const instancedBatches = new Map<string, number>();

  const planned: AutoLodInstancePlan[] = instances.map((inst) => {
    const base = Math.max(3, Math.round(inst.baseTriangles));
    const lod0Triangles = base;
    const lod1Triangles = Math.max(2, Math.min(lod0Triangles - 1, Math.round(base * 0.45)));
    const lod2Triangles = Math.max(1, Math.min(lod1Triangles - 1, Math.round(base * 0.18)));
    const d = Math.max(0, inst.distanceMeters);
    const activeTier: AutoLodTierId = d < 3.0 ? "LOD0" : d < 10.0 ? "LOD1" : "LOD2";
    const activeTriangles = activeTier === "LOD0" ? lod0Triangles : activeTier === "LOD1" ? lod1Triangles : lod2Triangles;

    tierSummary[activeTier].instanceCount += 1;
    tierSummary[activeTier].renderedTriangles += activeTriangles;
    totalNaiveTriangles += base;
    totalRenderedTriangles += activeTriangles;

    const mats = Math.max(1, Math.round(inst.materialCount ?? 2));
    naiveDrawCalls += mats;
    const batchKey = `${inst.assetKey}::${activeTier}`;
    if (!instancedBatches.has(batchKey)) instancedBatches.set(batchKey, mats);

    return {
      id: inst.id, assetKey: inst.assetKey, labelKo: inst.labelKo, labelEn: inst.labelEn,
      distanceMeters: inst.distanceMeters, activeTier, baseTriangles: base,
      lod0Triangles, lod1Triangles, lod2Triangles, activeTriangles,
    };
  });

  let instancedDrawCalls = 0;
  for (const batchMats of instancedBatches.values()) instancedDrawCalls += batchMats;

  const estimatedFrameMs = Number((1.8 + instancedDrawCalls * 0.095 + totalRenderedTriangles * 0.000018).toFixed(2));
  return {
    instances: planned, tierSummary, totalNaiveTriangles, totalRenderedTriangles,
    triangleReductionPercent: totalNaiveTriangles > 0 ? Number((((totalNaiveTriangles - totalRenderedTriangles) / totalNaiveTriangles) * 100).toFixed(1)) : 0,
    naiveDrawCalls, instancedDrawCalls,
    drawCallSavingsPercent: naiveDrawCalls > 0 ? Number((((naiveDrawCalls - instancedDrawCalls) / naiveDrawCalls) * 100).toFixed(1)) : 0,
    estimatedFrameMs,
    estimatedFps: Math.min(120, Math.max(1, Math.round(1000 / Math.max(1, estimatedFrameMs)))),
    within60FpsBudget: estimatedFrameMs <= 16.67,
  };
}

function rotateEulerXyz(v: Vec3, deg: Vec3): Vec3 {
  const rx = deg.x * DEG_TO_RAD; const ry = deg.y * DEG_TO_RAD; const rz = deg.z * DEG_TO_RAD;
  const cx = Math.cos(rx); const sx = Math.sin(rx);
  const y1 = v.y * cx - v.z * sx; const z1 = v.y * sx + v.z * cx;
  const cy = Math.cos(ry); const sy = Math.sin(ry);
  const x2 = v.x * cy + z1 * sy; const z2 = -v.x * sy + z1 * cy;
  const cz = Math.cos(rz); const sz = Math.sin(rz);
  return { x: cleanZero(x2 * cz - y1 * sz), y: cleanZero(x2 * sz + y1 * cz), z: cleanZero(z2) };
}

function applyTransform3d(point: Vec3, tr: Transform3d): Vec3 {
  const rotated = rotateEulerXyz({ x: point.x * tr.scale.x, y: point.y * tr.scale.y, z: point.z * tr.scale.z }, tr.rotateDeg);
  return { x: cleanZero(rotated.x + tr.translate.x), y: cleanZero(rotated.y + tr.translate.y), z: cleanZero(rotated.z + tr.translate.z) };
}

function boxCorners(center: Vec3, half: Vec3): Vec3[] {
  const out: Vec3[] = [];
  for (const sx of [-1, 1] as const) {
    for (const sy of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        out.push({ x: center.x + sx * half.x, y: center.y + sy * half.y, z: center.z + sz * half.z });
      }
    }
  }
  return out;
}

function projectCornersToPlaneZ(corners: readonly Vec3[], lightDir: Vec3, planeZ: number): Rect2dBounds | null {
  if (lightDir.z >= -0.02) return null;
  let minX = Number.POSITIVE_INFINITY; let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY; let maxY = Number.NEGATIVE_INFINITY;
  let projectedCount = 0;
  for (const c of corners) {
    if (c.z < planeZ - 1e-4) continue;
    const t = (planeZ - c.z) / lightDir.z;
    if (t < -1e-4) continue;
    const px = c.x + lightDir.x * t; const py = c.y + lightDir.y * t;
    minX = Math.min(minX, px); maxX = Math.max(maxX, px);
    minY = Math.min(minY, py); maxY = Math.max(maxY, py);
    projectedCount += 1;
  }
  if (projectedCount === 0) return null;
  return {
    minX: Number(minX.toFixed(4)), maxX: Number(maxX.toFixed(4)),
    minY: Number(minY.toFixed(4)), maxY: Number(maxY.toFixed(4)),
    areaM2: Number(Math.max(0, (maxX - minX) * (maxY - minY)).toFixed(4)),
  };
}

/** 방위각(azimuthDeg)·고도각(elevationDeg, 8~86°)으로부터 Z-up 하향 광선 벡터를 생성한다. */
export function lightDirectionFromAngles(azimuthDeg: number, elevationDeg = 48): Vec3 {
  const az = azimuthDeg * DEG_TO_RAD;
  const el = clamp(elevationDeg, 8, 86) * DEG_TO_RAD;
  const cosEl = Math.cos(el);
  return { x: Number((cosEl * Math.cos(az)).toFixed(5)), y: Number((cosEl * Math.sin(az)).toFixed(5)), z: Number((-Math.sin(el)).toFixed(5)) };
}

/** 3D 폴더 그룹 TRS 일괄 변환 & 오브젝트 간 상호 그림자(Inter-Object Cast Shadow) 바운딩 프로젝션 평가기. */
export function evaluate3dGroupAndCastShadows(group: Scene3dFolderGroup, lightDirection: Vec3): GroupAndShadowEvaluation {
  const len = Math.hypot(lightDirection.x, lightDirection.y, lightDirection.z) || 1;
  const normLight: Vec3 = { x: lightDirection.x / len, y: lightDirection.y / len, z: lightDirection.z / len };
  const evaluatedCorners = new Map<string, Vec3[]>();
  const allWorldCorners: Vec3[] = [];

  const evaluatedObjects: EvaluatedGroupObject3d[] = group.objects.map((obj) => {
    const localRot = obj.localRotateDeg ?? { x: 0, y: 0, z: 0 };
    const worldCorners = boxCorners({ x: 0, y: 0, z: 0 }, obj.halfExtents).map((corner) => {
      const r = rotateEulerXyz(corner, localRot);
      return applyTransform3d({ x: r.x + obj.localCenter.x, y: r.y + obj.localCenter.y, z: r.z + obj.localCenter.z }, group.transform);
    });
    evaluatedCorners.set(obj.id, worldCorners);
    allWorldCorners.push(...worldCorners);
    const worldBounds = computeMeshBounds(worldCorners);
    return {
      id: obj.id, labelKo: obj.labelKo, labelEn: obj.labelEn, worldBounds,
      worldCenter: {
        x: Number(((worldBounds.min.x + worldBounds.max.x) * 0.5).toFixed(4)),
        y: Number(((worldBounds.min.y + worldBounds.max.y) * 0.5).toFixed(4)),
        z: Number(((worldBounds.min.z + worldBounds.max.z) * 0.5).toFixed(4)),
      },
      groundShadow2d: obj.castShadow === false ? null : projectCornersToPlaneZ(worldCorners, normLight, 0),
    };
  });

  const castShadowPairs: InterObjectShadowHit[] = [];
  const affectedReceivers = new Set<string>();
  for (let i = 0; i < evaluatedObjects.length; i += 1) {
    if (group.objects[i].castShadow === false) continue;
    const caster = evaluatedObjects[i];
    const casterCorners = evaluatedCorners.get(caster.id) ?? [];
    for (let j = 0; j < evaluatedObjects.length; j += 1) {
      if (i === j || group.objects[j].receiveShadow === false) continue;
      const receiver = evaluatedObjects[j];
      const shadowPlaneZ = receiver.worldCenter.z;
      if (caster.worldBounds.max.z <= shadowPlaneZ + 1e-4) continue;
      const projected = projectCornersToPlaneZ(casterCorners, normLight, shadowPlaneZ);
      if (!projected) continue;
      const oxMin = Math.max(projected.minX, receiver.worldBounds.min.x);
      const oxMax = Math.min(projected.maxX, receiver.worldBounds.max.x);
      const oyMin = Math.max(projected.minY, receiver.worldBounds.min.y);
      const oyMax = Math.min(projected.maxY, receiver.worldBounds.max.y);
      if (oxMax - oxMin <= 1e-4 || oyMax - oyMin <= 1e-4) continue;
      const overlapAreaM2 = Number(((oxMax - oxMin) * (oyMax - oyMin)).toFixed(4));
      const receiverArea = Math.max(EPS, (receiver.worldBounds.max.x - receiver.worldBounds.min.x) * (receiver.worldBounds.max.y - receiver.worldBounds.min.y));
      affectedReceivers.add(receiver.id);
      castShadowPairs.push({
        casterId: caster.id, receiverId: receiver.id, shadowPlaneZ: Number(shadowPlaneZ.toFixed(4)),
        overlapAreaM2, coverageRatio: Number(clamp(overlapAreaM2 / receiverArea, 0, 1).toFixed(3)),
        projectedFootprint2d: { minX: Number(oxMin.toFixed(4)), maxX: Number(oxMax.toFixed(4)), minY: Number(oyMin.toFixed(4)), maxY: Number(oyMax.toFixed(4)), areaM2: overlapAreaM2 },
      });
    }
  }

  return {
    groupId: group.groupId,
    normalizedLightDir: { x: Number(normLight.x.toFixed(5)), y: Number(normLight.y.toFixed(5)), z: Number(normLight.z.toFixed(5)) },
    groupWorldBounds: computeMeshBounds(allWorldCorners),
    objects: evaluatedObjects,
    castShadowPairs,
    summary: { objectCount: evaluatedObjects.length, shadowHitCount: castShadowPairs.length, affectedReceiverCount: affectedReceivers.size },
  };
}

/** 닫힌 직육면체 메쉬 생성 헬퍼(8정점 · 12삼각형 완전 매니폴드) */
export function createWatertightBoxMesh(name: string, width: number, depth: number, height: number, offset: Vec3 = { x: 0, y: 0, z: 0 }): Mesh3dData {
  const hx = width * 0.5; const hy = depth * 0.5; const z0 = offset.z; const z1 = offset.z + height;
  const vertices: Vec3[] = [
    { x: offset.x - hx, y: offset.y - hy, z: z0 }, { x: offset.x + hx, y: offset.y - hy, z: z0 },
    { x: offset.x + hx, y: offset.y + hy, z: z0 }, { x: offset.x - hx, y: offset.y + hy, z: z0 },
    { x: offset.x - hx, y: offset.y - hy, z: z1 }, { x: offset.x + hx, y: offset.y - hy, z: z1 },
    { x: offset.x + hx, y: offset.y + hy, z: z1 }, { x: offset.x - hx, y: offset.y + hy, z: z1 },
  ];
  const triangles: TriangleIndices[] = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
    [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7],
  ];
  return { name, format: "procedural", vertices, triangles, rawTriangleCount: triangles.length };
}

/** 관절 꺾임 가중치 스무딩 + FFD 상체 변형용 다단 튜브 메쉬(5링 × 6분할 = 30정점) */
export function createUpperBodySleeveMesh(): { readonly mesh: Mesh3dData; readonly pinchedWeights: readonly VertexWeightRecord[] } {
  const rings = 5; const segments = 6;
  const vertices: Vec3[] = [];
  const pinchedWeights: VertexWeightRecord[] = [];
  for (let r = 0; r < rings; r += 1) {
    const t = r / (rings - 1);
    const z = Number((0.8 + t * 0.6).toFixed(4));
    const rx = t >= 0.75 ? 0.22 : t <= 0.25 ? 0.16 : 0.18;
    for (let s = 0; s < segments; s += 1) {
      const ang = (s / segments) * Math.PI * 2;
      pinchedWeights.push({ vertexIndex: vertices.length, weights: r < 2 ? [1, 0] : [0, 1] });
      vertices.push({ x: Number((Math.cos(ang) * rx).toFixed(4)), y: Number((Math.sin(ang) * 0.11).toFixed(4)), z });
    }
  }
  const triangles: TriangleIndices[] = [];
  for (let r = 0; r < rings - 1; r += 1) {
    for (let s = 0; s < segments; s += 1) {
      const sNext = (s + 1) % segments;
      const a = r * segments + s; const b = r * segments + sNext;
      const c = (r + 1) * segments + sNext; const d = (r + 1) * segments + s;
      triangles.push([a, b, c], [a, c, d]);
    }
  }
  return { mesh: { name: "upper-body-joint-sleeve", format: "procedural", vertices, triangles, rawTriangleCount: triangles.length }, pinchedWeights };
}

export const DEFAULT_AUTO_LOD_SCENE_INSTANCES: readonly AutoLodSceneInstance[] = [
  { id: "hero-lead", assetKey: "char-protagonist", labelKo: "주인공(근접 클로즈업)", labelEn: "Protagonist (Close-up)", baseTriangles: 48_000, distanceMeters: 1.8, materialCount: 3 },
  { id: "rival-mid", assetKey: "char-rival", labelKo: "라이벌(중경 대화)", labelEn: "Rival (Midground)", baseTriangles: 44_000, distanceMeters: 5.4, materialCount: 3 },
  { id: "prop-desk", assetKey: "prop-school-desk", labelKo: "교실 책상(중경)", labelEn: "Classroom Desk (Mid)", baseTriangles: 12_000, distanceMeters: 6.2, materialCount: 2 },
  { id: "crowd-1", assetKey: "char-student-bg", labelKo: "행인 군중 #1", labelEn: "Background Crowd #1", baseTriangles: 32_000, distanceMeters: 12.5, materialCount: 2 },
  { id: "crowd-2", assetKey: "char-student-bg", labelKo: "행인 군중 #2", labelEn: "Background Crowd #2", baseTriangles: 32_000, distanceMeters: 14.0, materialCount: 2 },
  { id: "crowd-3", assetKey: "char-student-bg", labelKo: "행인 군중 #3", labelEn: "Background Crowd #3", baseTriangles: 32_000, distanceMeters: 16.5, materialCount: 2 },
  { id: "crowd-4", assetKey: "char-student-bg", labelKo: "행인 군중 #4", labelEn: "Background Crowd #4", baseTriangles: 32_000, distanceMeters: 19.0, materialCount: 2 },
  { id: "crowd-5", assetKey: "char-student-bg", labelKo: "행인 군중 #5", labelEn: "Background Crowd #5", baseTriangles: 32_000, distanceMeters: 22.0, materialCount: 2 },
];

export const DEFAULT_3D_FOLDER_GROUP: Scene3dFolderGroup = {
  groupId: "folder-cafe-cut-04",
  nameKo: "카페 테라스 소품 폴더",
  nameEn: "Cafe Terrace Prop Folder",
  transform: { translate: { x: 0, y: 0, z: 0 }, rotateDeg: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
  objects: [
    { id: "hero-stand", labelKo: "캐릭터 본체", labelEn: "Hero Figure", localCenter: { x: -0.55, y: 0.0, z: 0.85 }, halfExtents: { x: 0.24, y: 0.18, z: 0.85 }, castShadow: true, receiveShadow: true },
    { id: "cafe-table", labelKo: "원형 테이블", labelEn: "Cafe Table", localCenter: { x: 0.35, y: 0.05, z: 0.38 }, halfExtents: { x: 0.48, y: 0.42, z: 0.38 }, castShadow: true, receiveShadow: true },
    { id: "coffee-mug", labelKo: "커피 소품", labelEn: "Coffee Prop", localCenter: { x: 0.22, y: 0.0, z: 0.84 }, halfExtents: { x: 0.07, y: 0.07, z: 0.08 }, castShadow: true, receiveShadow: true },
  ],
};

/** 밀리미터 단위(240×180×320mm, Z=+150mm 부유) 닫힌 바이너리 STL 샘플 생성 */
export function createSampleBinaryStlBytes(): Uint8Array<ArrayBuffer> {
  return buildBinaryStlBuffer(createWatertightBoxMesh("prop-lamp-mm", 240, 180, 320, { x: 60, y: -40, z: 150 }), "solid binary-prop-lamp-mm");
}

/** 비매니폴드 핀 엣지 + 퇴화 삼각형이 포함된 ASCII STL 샘플 텍스트 생성 */
export function createSampleAsciiStlWithDefects(): string {
  const baseBox = createWatertightBoxMesh("prop-sword-pedestal", 0.5, 0.5, 0.9, { x: 0.2, y: 0.1, z: 0.4 });
  const defectiveMesh: Mesh3dData = {
    ...baseBox,
    vertices: [...baseBox.vertices, { x: 0.85, y: 0.1, z: 0.85 }],
    triangles: [...baseBox.triangles, [1, 2, 8], [0, 1, 1]],
    rawTriangleCount: baseBox.triangles.length + 2,
  };
  return buildAsciiStlText(defectiveMesh);
}
