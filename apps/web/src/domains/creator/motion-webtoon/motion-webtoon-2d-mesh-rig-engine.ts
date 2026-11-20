/**
 * Live2D Cubism / Inochi2D 클린룸 2D 일러스트 ArtMesh 디포머 · Warp/Glue ·
 * 가산형 파라미터 키폼 보간 · 다단 진자(Pendulum) 물리 모션 웹툰 엔진.
 */

import { LINEAR_EASING } from "./motion-webtoon-easing";
import type { MotionKeyframe } from "./motion-webtoon-keyframes";

export interface Vec2 { readonly x: number; readonly y: number; }
export interface ArtMeshVertex { readonly x: number; readonly y: number; readonly u: number; readonly v: number; }
export type TriangleIndices = readonly [number, number, number];

export interface ArtMesh {
  readonly id: string; readonly name: string; readonly parentDeformerId: string | null;
  readonly vertices: readonly ArtMeshVertex[]; readonly triangles: readonly TriangleIndices[];
  readonly drawOrder: number; readonly opacity: number;
}

export interface WarpDeformer {
  readonly kind: "warp"; readonly id: string; readonly name: string; readonly parentId: string | null;
  readonly originX: number; readonly originY: number; readonly width: number; readonly height: number;
  readonly cols: number; readonly rows: number; readonly controlPoints: readonly Vec2[];
}

export interface RotationDeformer {
  readonly kind: "rotation"; readonly id: string; readonly name: string; readonly parentId: string | null;
  readonly pivotX: number; readonly pivotY: number; readonly tx: number; readonly ty: number;
  readonly angleDeg: number; readonly scaleX: number; readonly scaleY: number;
}

export type MeshRigDeformer = WarpDeformer | RotationDeformer;
export interface GlueVertexPair { readonly vertexIndexA: number; readonly vertexIndexB: number; readonly weightA: number; }
export interface GlueConstraint {
  readonly id: string; readonly meshAId: string; readonly meshBId: string;
  readonly intensity: number; readonly pairs: readonly GlueVertexPair[];
}
export interface RigParameterDef { readonly id: string; readonly name: string; readonly min: number; readonly defaultValue: number; readonly max: number; }
export interface RotationDelta { readonly tx?: number; readonly ty?: number; readonly angleDeg?: number; readonly scaleX?: number; readonly scaleY?: number; }
export interface RigKeyformPayload {
  readonly meshVertexDeltas?: Readonly<Record<string, readonly Vec2[]>>;
  readonly warpControlDeltas?: Readonly<Record<string, readonly Vec2[]>>;
  readonly rotationDeltas?: Readonly<Record<string, RotationDelta>>;
}
export interface KeyformGrid1D { readonly kind: "grid-1d"; readonly id: string; readonly paramId: string; readonly keys: readonly number[]; readonly payloads: readonly RigKeyformPayload[]; }
export interface KeyformGrid2D {
  readonly kind: "grid-2d"; readonly id: string; readonly paramXId: string; readonly paramYId: string;
  readonly keysX: readonly number[]; readonly keysY: readonly number[]; readonly payloads: readonly RigKeyformPayload[];
}
export type RigKeyformBinding = KeyformGrid1D | KeyformGrid2D;
export interface AdditiveBlendShape {
  readonly id: string; readonly name: string; readonly paramId: string;
  readonly baseline?: number; readonly weightScale: number; readonly clampMin?: number; readonly clampMax?: number;
  readonly payload: RigKeyformPayload;
}
export interface MeshRigDocument {
  readonly id: string; readonly parameters: readonly RigParameterDef[]; readonly deformers: readonly MeshRigDeformer[];
  readonly meshes: readonly ArtMesh[]; readonly glues: readonly GlueConstraint[];
  readonly keyformBindings: readonly RigKeyformBinding[]; readonly additiveBlendShapes: readonly AdditiveBlendShape[];
}
export interface EvaluatedArtMesh {
  readonly id: string; readonly name: string; readonly drawOrder: number; readonly opacity: number;
  readonly vertices: readonly ArtMeshVertex[]; readonly triangles: readonly TriangleIndices[];
  readonly bounds: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number };
}
export interface EvaluatedMeshRigPose {
  readonly resolvedParams: Readonly<Record<string, number>>; readonly meshes: readonly EvaluatedArtMesh[]; readonly maxGlueResidualPx: number;
}
export interface PendulumSegmentSpec {
  readonly length: number; readonly mass: number; readonly stiffness: number;
  readonly damping: number; readonly gravityScale: number; readonly maxAngleDeg: number;
}
export interface PendulumChainSpec { readonly id: string; readonly outputParamId: string; readonly outputScale: number; readonly segments: readonly PendulumSegmentSpec[]; }
export interface PendulumSegmentState { readonly angleRad: number; readonly angularVelocity: number; }
export interface PendulumChainState { readonly chainId: string; readonly segments: readonly PendulumSegmentState[]; readonly outputValue: number; }
export interface PendulumInputForce { readonly accelX: number; readonly accelY: number; readonly windX?: number; readonly gravity?: number; }
export interface BakedPendulumFrame { readonly frameIndex: number; readonly timeSeconds: number; readonly paramValues: Readonly<Record<string, number>>; }

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function bernstein(n: number, i: number, t: number): number {
  let coeff = 1;
  const limit = Math.min(i, n - i);
  for (let k = 1; k <= limit; k += 1) coeff = (coeff * (n - limit + k)) / k;
  return coeff * Math.pow(t, i) * Math.pow(1 - t, n - i);
}

/** 규칙 격자 기반 경량 ArtMesh를 생성한다. */
export function createGridArtMesh(options: {
  readonly id: string; readonly name?: string; readonly parentDeformerId?: string | null;
  readonly originX: number; readonly originY: number; readonly width: number; readonly height: number;
  readonly cols: number; readonly rows: number; readonly drawOrder?: number; readonly opacity?: number;
}): ArtMesh {
  const cols = Math.max(1, Math.min(64, Math.floor(options.cols)));
  const rows = Math.max(1, Math.min(64, Math.floor(options.rows)));
  const width = Math.max(1e-3, options.width);
  const height = Math.max(1e-3, options.height);
  const vertices: ArtMeshVertex[] = [];
  for (let r = 0; r <= rows; r += 1) {
    const v = r / rows;
    for (let c = 0; c <= cols; c += 1) {
      const u = c / cols;
      vertices.push({ x: options.originX + u * width, y: options.originY + v * height, u, v });
    }
  }
  const triangles: TriangleIndices[] = [];
  const stride = cols + 1;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i00 = r * stride + c;
      triangles.push([i00, i00 + 1, i00 + stride + 1], [i00, i00 + stride + 1, i00 + stride]);
    }
  }
  return {
    id: options.id, name: options.name ?? options.id, parentDeformerId: options.parentDeformerId ?? null,
    vertices, triangles, drawOrder: options.drawOrder ?? 0, opacity: clamp(options.opacity ?? 1, 0, 1),
  };
}

function pointInPolygon(pt: Vec2, polygon: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];
    if (pi && pj && pi.y > pt.y !== pj.y > pt.y && pt.x < ((pj.x - pi.x) * (pt.y - pi.y)) / (pj.y - pi.y + 1e-12) + pi.x) {
      inside = !inside;
    }
  }
  return inside;
}

function circumcircleContains(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const ax = a.x - p.x;
  const ay = a.y - p.y;
  const bx = b.x - p.x;
  const by = b.y - p.y;
  const cx = c.x - p.x;
  const cy = c.y - p.y;
  const det =
    (ax * ax + ay * ay) * (bx * cy - cx * by) -
    (bx * bx + by * by) * (ax * cy - cx * ay) +
    (cx * cx + cy * cy) * (ax * by - bx * ay);
  const orient = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return orient > 0 ? det > 1e-9 : det < -1e-9;
}

/** 윤곽 폴리곤 + 내부 스태이너 점 기반 Bowyer-Watson Delaunay `ArtMesh`를 자동 생성한다. */
export function buildAutoArtMeshFromPolygon(options: {
  readonly id: string; readonly name?: string; readonly parentDeformerId?: string | null;
  readonly contour: readonly Vec2[]; readonly textureWidth: number; readonly textureHeight: number;
  readonly interiorGridStepPx?: number; readonly drawOrder?: number; readonly opacity?: number;
}): ArtMesh {
  const { contour } = options;
  const texW = Math.max(1, options.textureWidth);
  const texH = Math.max(1, options.textureHeight);
  if (contour.length < 3) {
    return createGridArtMesh({
      id: options.id, name: options.name, parentDeformerId: options.parentDeformerId,
      originX: 0, originY: 0, width: texW, height: texH, cols: 1, rows: 1,
      drawOrder: options.drawOrder, opacity: options.opacity,
    });
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of contour) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  const pts: Vec2[] = contour.map((p) => ({ x: p.x, y: p.y }));
  const step = Math.max(4, options.interiorGridStepPx ?? Math.max(maxX - minX, maxY - minY) / 4);
  for (let y = minY + step * 0.5; y < maxY; y += step) {
    for (let x = minX + step * 0.5; x < maxX; x += step) {
      const candidate = { x, y };
      if (pointInPolygon(candidate, contour) && !pts.some((q) => Math.hypot(q.x - x, q.y - y) < step * 0.35)) {
        pts.push(candidate);
      }
    }
  }

  const span = Math.max(maxX - minX, maxY - minY, 1) * 10;
  const midX = (minX + maxX) * 0.5;
  const midY = (minY + maxY) * 0.5;
  const superStart = pts.length;
  const allPts: Vec2[] = [
    ...pts,
    { x: midX - span, y: midY - span },
    { x: midX, y: midY + span * 2 },
    { x: midX + span * 2, y: midY - span },
  ];

  let tris: Array<[number, number, number]> = [[superStart, superStart + 1, superStart + 2]];
  for (let pi = 0; pi < pts.length; pi += 1) {
    const p = allPts[pi];
    if (!p) continue;
    const bad: Array<[number, number, number]> = [];
    const good: Array<[number, number, number]> = [];
    for (const tri of tris) {
      const a = allPts[tri[0]];
      const b = allPts[tri[1]];
      const c = allPts[tri[2]];
      if (a && b && c && circumcircleContains(p, a, b, c)) bad.push(tri);
      else good.push(tri);
    }
    const edgeCounts = new Map<string, { readonly u: number; readonly v: number; count: number }>();
    for (const [i0, i1, i2] of bad) {
      for (const [u, v] of [[i0, i1], [i1, i2], [i2, i0]] as const) {
        const key = u < v ? `${u}:${v}` : `${v}:${u}`;
        const prev = edgeCounts.get(key);
        if (prev) prev.count += 1;
        else edgeCounts.set(key, { u, v, count: 1 });
      }
    }
    for (const edge of edgeCounts.values()) {
      if (edge.count === 1) good.push([edge.u, edge.v, pi]);
    }
    tris = good;
  }

  const filteredTriangles: TriangleIndices[] = [];
  for (const [i0, i1, i2] of tris) {
    if (i0 >= superStart || i1 >= superStart || i2 >= superStart) continue;
    const a = pts[i0];
    const b = pts[i1];
    const c = pts[i2];
    if (a && b && c && pointInPolygon({ x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 }, contour)) {
      filteredTriangles.push([i0, i1, i2]);
    }
  }

  return {
    id: options.id, name: options.name ?? options.id, parentDeformerId: options.parentDeformerId ?? null,
    vertices: pts.map((p) => ({ x: p.x, y: p.y, u: clamp(p.x / texW, 0, 1), v: clamp(p.y / texH, 0, 1) })),
    triangles: filteredTriangles, drawOrder: options.drawOrder ?? 0, opacity: clamp(options.opacity ?? 1, 0, 1),
  };
}

/** 기본 격자 제어점을 갖는 `WarpDeformer`를 생성한다. */
export function createWarpDeformer(options: {
  readonly id: string; readonly name?: string; readonly parentId?: string | null;
  readonly originX: number; readonly originY: number; readonly width: number; readonly height: number;
  readonly cols?: number; readonly rows?: number;
}): WarpDeformer {
  const cols = Math.max(1, Math.min(8, Math.floor(options.cols ?? 2)));
  const rows = Math.max(1, Math.min(8, Math.floor(options.rows ?? 2)));
  const width = Math.max(1e-3, options.width);
  const height = Math.max(1e-3, options.height);
  const controlPoints: Vec2[] = [];
  for (let r = 0; r <= rows; r += 1) {
    for (let c = 0; c <= cols; c += 1) {
      controlPoints.push({ x: options.originX + (c / cols) * width, y: options.originY + (r / rows) * height });
    }
  }
  return {
    kind: "warp", id: options.id, name: options.name ?? options.id, parentId: options.parentId ?? null,
    originX: options.originX, originY: options.originY, width, height, cols, rows, controlPoints,
  };
}

/** 디포머 계층의 순환 참조·누락 부모를 검증한다. */
export function validateDeformerHierarchy(deformers: readonly MeshRigDeformer[]): readonly string[] {
  const byId = new Map<string, MeshRigDeformer>();
  const errors: string[] = [];
  for (const def of deformers) {
    if (byId.has(def.id)) errors.push(`중복된 디포머 ID: ${def.id}`);
    byId.set(def.id, def);
  }
  for (const def of deformers) {
    const visited = new Set<string>([def.id]);
    let cursor = def.parentId;
    while (cursor !== null) {
      if (visited.has(cursor)) { errors.push(`디포머 계층 순환 참조 감지: ${def.id} -> ${cursor}`); break; }
      const parent = byId.get(cursor);
      if (!parent) { errors.push(`존재하지 않는 부모 디포머 참조: ${def.id} -> ${cursor}`); break; }
      visited.add(cursor);
      cursor = parent.parentId;
    }
  }
  return errors;
}

/** 텐서곱 Bernstein 다항식으로 WarpDeformer 좌표를 변형한다. */
export function evaluateWarpDeformerPoint(deformer: WarpDeformer, controlPoints: readonly Vec2[], point: Vec2): Vec2 {
  const u = (point.x - deformer.originX) / Math.max(1e-6, deformer.width);
  const v = (point.y - deformer.originY) / Math.max(1e-6, deformer.height);
  const cu = clamp(u, 0, 1);
  const cv = clamp(v, 0, 1);
  const stride = deformer.cols + 1;
  let outX = 0;
  let outY = 0;
  for (let r = 0; r <= deformer.rows; r += 1) {
    const bv = bernstein(deformer.rows, r, cv);
    for (let c = 0; c <= deformer.cols; c += 1) {
      const cp = controlPoints[r * stride + c];
      if (!cp) continue;
      const w = bernstein(deformer.cols, c, cu) * bv;
      outX += cp.x * w;
      outY += cp.y * w;
    }
  }
  if (u !== cu || v !== cv) {
    outX += point.x - (deformer.originX + cu * deformer.width);
    outY += point.y - (deformer.originY + cv * deformer.height);
  }
  return { x: outX, y: outY };
}

function applyRotationDeformerPoint(deformer: RotationDeformer, delta: RotationDelta | undefined, pt: Vec2): Vec2 {
  const rad = ((deformer.angleDeg + (delta?.angleDeg ?? 0)) * Math.PI) / 180;
  const lx = (pt.x - deformer.pivotX) * (deformer.scaleX + (delta?.scaleX ?? 0));
  const ly = (pt.y - deformer.pivotY) * (deformer.scaleY + (delta?.scaleY ?? 0));
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: deformer.pivotX + lx * cos - ly * sin + deformer.tx + (delta?.tx ?? 0),
    y: deformer.pivotY + lx * sin + ly * cos + deformer.ty + (delta?.ty ?? 0),
  };
}

function findAxisBracket(keys: readonly number[], value: number): { readonly i0: number; readonly i1: number; readonly t: number } {
  if (keys.length <= 1 || value <= (keys[0] ?? 0)) return { i0: 0, i1: 0, t: 0 };
  if (value >= (keys[keys.length - 1] ?? 0)) return { i0: keys.length - 1, i1: keys.length - 1, t: 0 };
  for (let i = 0; i < keys.length - 1; i += 1) {
    const k0 = keys[i] ?? 0;
    const k1 = keys[i + 1] ?? k0;
    if (value >= k0 && value <= k1) return { i0: i, i1: i + 1, t: k1 - k0 > 1e-9 ? (value - k0) / (k1 - k0) : 0 };
  }
  return { i0: keys.length - 1, i1: keys.length - 1, t: 0 };
}

function accumulateVec2Record(
  targetMap: Map<string, Array<{ x: number; y: number }>>,
  record: Readonly<Record<string, readonly Vec2[]>> | undefined,
  weight: number,
): void {
  if (!record) return;
  for (const [id, deltas] of Object.entries(record)) {
    let arr = targetMap.get(id);
    if (!arr) { arr = deltas.map(() => ({ x: 0, y: 0 })); targetMap.set(id, arr); }
    for (let i = 0; i < deltas.length; i += 1) {
      const d = deltas[i];
      if (!d) continue;
      while (arr.length <= i) arr.push({ x: 0, y: 0 });
      const slot = arr[i];
      if (slot) { slot.x += d.x * weight; slot.y += d.y * weight; }
    }
  }
}

/** 2D 메시 리깅 문서 전체를 평가한다(키폼 + 가산형 Blend Shape → 디포머 트리 → Glue 용접). */
export function evaluateMeshRigPose(
  doc: MeshRigDocument,
  paramOverrides: Readonly<Record<string, number>> = {},
): EvaluatedMeshRigPose {
  const resolvedParams: Record<string, number> = {};
  for (const def of doc.parameters) resolvedParams[def.id] = clamp(paramOverrides[def.id] ?? def.defaultValue, def.min, def.max);
  for (const [key, val] of Object.entries(paramOverrides)) {
    if (resolvedParams[key] === undefined && Number.isFinite(val)) resolvedParams[key] = val;
  }

  const meshDeltas = new Map<string, Array<{ x: number; y: number }>>();
  const warpDeltas = new Map<string, Array<{ x: number; y: number }>>();
  const rotDeltas = new Map<string, { tx: number; ty: number; angleDeg: number; scaleX: number; scaleY: number }>();

  const addPayload = (payload: RigKeyformPayload | undefined, weight: number): void => {
    if (!payload || Math.abs(weight) <= 1e-9) return;
    accumulateVec2Record(meshDeltas, payload.meshVertexDeltas, weight);
    accumulateVec2Record(warpDeltas, payload.warpControlDeltas, weight);
    if (!payload.rotationDeltas) return;
    for (const [defId, d] of Object.entries(payload.rotationDeltas)) {
      let cur = rotDeltas.get(defId);
      if (!cur) { cur = { tx: 0, ty: 0, angleDeg: 0, scaleX: 0, scaleY: 0 }; rotDeltas.set(defId, cur); }
      cur.tx += (d.tx ?? 0) * weight;
      cur.ty += (d.ty ?? 0) * weight;
      cur.angleDeg += (d.angleDeg ?? 0) * weight;
      cur.scaleX += (d.scaleX ?? 0) * weight;
      cur.scaleY += (d.scaleY ?? 0) * weight;
    }
  };

  for (const binding of doc.keyformBindings) {
    if (binding.kind === "grid-1d") {
      const { i0, i1, t } = findAxisBracket(binding.keys, resolvedParams[binding.paramId] ?? 0);
      addPayload(binding.payloads[i0], 1 - t);
      if (i1 !== i0) addPayload(binding.payloads[i1], t);
    } else {
      const bx = findAxisBracket(binding.keysX, resolvedParams[binding.paramXId] ?? 0);
      const by = findAxisBracket(binding.keysY, resolvedParams[binding.paramYId] ?? 0);
      const cols = binding.keysX.length;
      addPayload(binding.payloads[by.i0 * cols + bx.i0], (1 - bx.t) * (1 - by.t));
      addPayload(binding.payloads[by.i0 * cols + bx.i1], bx.t * (1 - by.t));
      addPayload(binding.payloads[by.i1 * cols + bx.i0], (1 - bx.t) * by.t);
      addPayload(binding.payloads[by.i1 * cols + bx.i1], bx.t * by.t);
    }
  }
  for (const shape of doc.additiveBlendShapes) {
    const raw = resolvedParams[shape.paramId] ?? shape.baseline ?? 0;
    addPayload(shape.payload, clamp((raw - (shape.baseline ?? 0)) * shape.weightScale, shape.clampMin ?? -2, shape.clampMax ?? 2));
  }

  const deformerMap = new Map<string, MeshRigDeformer>(doc.deformers.map((d) => [d.id, d]));
  const activeWarpControls = new Map<string, Vec2[]>();
  for (const def of doc.deformers) {
    if (def.kind !== "warp") continue;
    const deltas = warpDeltas.get(def.id);
    activeWarpControls.set(def.id, def.controlPoints.map((cp, idx) => {
      const d = deltas?.[idx];
      return d ? { x: cp.x + d.x, y: cp.y + d.y } : cp;
    }));
  }

  const applyChain = (startId: string | null, pt: Vec2): Vec2 => {
    let cur = pt;
    let cursor = startId;
    const visited = new Set<string>();
    while (cursor !== null && !visited.has(cursor)) {
      visited.add(cursor);
      const def = deformerMap.get(cursor);
      if (!def) break;
      cur = def.kind === "warp"
        ? evaluateWarpDeformerPoint(def, activeWarpControls.get(def.id) ?? def.controlPoints, cur)
        : applyRotationDeformerPoint(def, rotDeltas.get(def.id), cur);
      cursor = def.parentId;
    }
    return cur;
  };

  const meshPositions = new Map<string, Array<{ x: number; y: number; u: number; v: number }>>();
  for (const mesh of doc.meshes) {
    const vDeltas = meshDeltas.get(mesh.id);
    meshPositions.set(mesh.id, mesh.vertices.map((vert, idx) => {
      const d = vDeltas?.[idx];
      const worldPt = applyChain(mesh.parentDeformerId, d ? { x: vert.x + d.x, y: vert.y + d.y } : { x: vert.x, y: vert.y });
      return { x: worldPt.x, y: worldPt.y, u: vert.u, v: vert.v };
    }));
  }

  for (let iter = 0; iter < 2; iter += 1) {
    for (const glue of doc.glues) {
      const intensity = clamp(glue.intensity, 0, 1);
      if (intensity <= 1e-6) continue;
      const vertsA = meshPositions.get(glue.meshAId);
      const vertsB = meshPositions.get(glue.meshBId);
      if (!vertsA || !vertsB) continue;
      for (const pair of glue.pairs) {
        const va = vertsA[pair.vertexIndexA];
        const vb = vertsB[pair.vertexIndexB];
        if (!va || !vb) continue;
        const wA = clamp(pair.weightA, 0, 1);
        const tx = va.x * wA + vb.x * (1 - wA);
        const ty = va.y * wA + vb.y * (1 - wA);
        va.x += (tx - va.x) * intensity;
        va.y += (ty - va.y) * intensity;
        vb.x += (tx - vb.x) * intensity;
        vb.y += (ty - vb.y) * intensity;
      }
    }
  }

  let maxGlueResidualPx = 0;
  for (const glue of doc.glues) {
    const vertsA = meshPositions.get(glue.meshAId);
    const vertsB = meshPositions.get(glue.meshBId);
    if (!vertsA || !vertsB) continue;
    for (const pair of glue.pairs) {
      const va = vertsA[pair.vertexIndexA];
      const vb = vertsB[pair.vertexIndexB];
      if (va && vb) maxGlueResidualPx = Math.max(maxGlueResidualPx, Math.hypot(va.x - vb.x, va.y - vb.y));
    }
  }

  const meshes: EvaluatedArtMesh[] = [...doc.meshes].sort((a, b) => a.drawOrder - b.drawOrder).map((mesh) => {
    const verts = meshPositions.get(mesh.id) ?? [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const v of verts) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
    }
    return {
      id: mesh.id, name: mesh.name, drawOrder: mesh.drawOrder, opacity: mesh.opacity,
      vertices: verts, triangles: mesh.triangles,
      bounds: Number.isFinite(minX) ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    };
  });

  return { resolvedParams, meshes, maxGlueResidualPx };
}

/** 다단 진자 물리 초기 상태를 생성한다. */
export function createPendulumChainState(spec: PendulumChainSpec): PendulumChainState {
  return { chainId: spec.id, segments: spec.segments.map(() => ({ angleRad: 0, angularVelocity: 0 })), outputValue: 0 };
}

/** 다단 진자 물리 한 스텝을 반암시적 오일러 + 서브스텝으로 적분한다. */
export function stepPendulumChain(
  spec: PendulumChainSpec,
  state: PendulumChainState,
  input: PendulumInputForce,
  dtSeconds: number,
  subSteps = 4,
): PendulumChainState {
  const steps = Math.max(1, Math.min(16, Math.round(subSteps)));
  const h = clamp(dtSeconds, 0, 0.1) / steps;
  const gravity = input.gravity ?? 9.81;
  const windX = input.windX ?? 0;
  const working = spec.segments.map((_, idx) => ({
    angleRad: state.segments[idx]?.angleRad ?? 0,
    angularVelocity: state.segments[idx]?.angularVelocity ?? 0,
  }));

  if (h > 1e-6) {
    for (let s = 0; s < steps; s += 1) {
      let parentAccelX = input.accelX;
      let parentAccelY = input.accelY;
      for (let i = 0; i < spec.segments.length; i += 1) {
        const seg = spec.segments[i];
        const st = working[i];
        if (!seg || !st) continue;
        const len = Math.max(0.05, seg.length);
        const mass = Math.max(0.05, seg.mass);
        const maxRad = (clamp(seg.maxAngleDeg, 5, 170) * Math.PI) / 180;
        const alpha =
          -((gravity * seg.gravityScale) / len) * Math.sin(st.angleRad) -
          (seg.stiffness / mass) * st.angleRad +
          (((-parentAccelX + windX / mass) * Math.cos(st.angleRad) + parentAccelY * Math.sin(st.angleRad)) / len) -
          (seg.damping / mass) * st.angularVelocity;
        st.angularVelocity += alpha * h;
        st.angleRad += st.angularVelocity * h;
        if (st.angleRad > maxRad) { st.angleRad = maxRad; if (st.angularVelocity > 0) st.angularVelocity *= -0.25; }
        else if (st.angleRad < -maxRad) { st.angleRad = -maxRad; if (st.angularVelocity < 0) st.angularVelocity *= -0.25; }
        parentAccelX += alpha * len * Math.cos(st.angleRad);
        parentAccelY += alpha * len * Math.sin(st.angleRad);
      }
    }
  }

  let weightedAngleSum = 0;
  let weightTotal = 0;
  for (let i = 0; i < working.length; i += 1) {
    const st = working[i];
    if (!st) continue;
    weightedAngleSum += st.angleRad * (i + 1);
    weightTotal += i + 1;
  }
  return { chainId: spec.id, segments: working, outputValue: (weightTotal > 0 ? weightedAngleSum / weightTotal : 0) * spec.outputScale };
}

/** 다단 진자 체인을 결정론적으로 베이크해 파라미터 트랙 및 `MotionKeyframe[]` 시퀀스를 생성한다. */
export function bakePendulumPhysicsToTimeline(options: {
  readonly chains: readonly PendulumChainSpec[]; readonly fps: number; readonly frameCount: number;
  readonly sampleForceAtTime: (timeSeconds: number, frameIndex: number) => PendulumInputForce;
}): { readonly frames: readonly BakedPendulumFrame[]; readonly previewMotionKeyframes: readonly MotionKeyframe[] } {
  const dt = 1 / clamp(options.fps, 1, 120);
  const frameCount = Math.max(1, Math.min(3600, Math.floor(options.frameCount)));
  let states = options.chains.map((chain) => createPendulumChainState(chain));
  const frames: BakedPendulumFrame[] = [];
  const previewMotionKeyframes: MotionKeyframe[] = [];

  for (let f = 0; f < frameCount; f += 1) {
    const timeSeconds = Number((f * dt).toFixed(6));
    const force = options.sampleForceAtTime(timeSeconds, f);
    states = options.chains.map((chain, idx) => stepPendulumChain(chain, states[idx] ?? createPendulumChainState(chain), force, dt));
    const paramValues: Record<string, number> = {};
    for (let i = 0; i < options.chains.length; i += 1) {
      const chain = options.chains[i];
      const st = states[i];
      if (chain && st) paramValues[chain.outputParamId] = st.outputValue;
    }
    frames.push({ frameIndex: f, timeSeconds, paramValues });
    previewMotionKeyframes.push({
      atSeconds: timeSeconds, easing: LINEAR_EASING,
      values: { x: 0, y: 0, scale: 1, rotationDeg: (states[0]?.outputValue ?? 0) * 15, opacity: 1 },
    });
  }
  return { frames, previewMotionKeyframes };
}
