/**
 * 3D 실루엣·크리즈 → 크리에이터 개인 G펜 큐빅 베지어 벡터 잉크 투영 엔진.
 * - 순수 결정론 3D 원근 투영 + 실루엣/크리즈 분류 + 가시성(은면) 깊이 판별 + Z 정렬
 * - 2D 엣지 폴리라인 체이닝(예각 코너 보존) + Ramer-Douglas-Peucker 단순화
 * - G펜 베지어 피팅·SVG/JSON 내보내기 통합 파이프라인
 */

import {
  evaluateGpenStrokeWidth,
  exportVectorInkSvg,
  fitCubicBezierInkStrokes,
  getGpenStyleProfile,
  GPEN_STYLE_IDS,
  GPEN_STYLE_PRESETS,
} from "./bezier-ink-fitter";
import { createMeshPreset } from "./mesh-presets";
import type {
  ChainPolylinesOptions,
  CreatorGpenProfile,
  ExtractedInkEdgeResult,
  ExtractInkEdgesOptions,
  GpenStyleId,
  IndexedTriangleMesh,
  InkEdgeKind,
  InkPolyline,
  InkPolylinePoint,
  MeshPresetId,
  ProjectedInkEdge,
  ProjectionCameraConfig,
  Vec2,
  Vec3,
  VectorInkProjectionResult,
  VectorInkProjectionStats,
} from "./types";

export {
  evaluateGpenStrokeWidth,
  exportVectorInkSvg,
  fitCubicBezierInkStrokes,
  getGpenStyleProfile,
  GPEN_STYLE_IDS,
  GPEN_STYLE_PRESETS,
};

const EPSILON = 1e-8;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function dot3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize3(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len <= EPSILON) return { x: 0, y: 1, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function normalize2(x: number, y: number): Vec2 {
  const len = Math.hypot(x, y);
  if (len <= EPSILON) return { x: 1, y: 0 };
  return { x: x / len, y: y / len };
}

function dist2(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** 방위각(azimuth)과 고도각(elevation)으로 정규화된 3D 주광 방향 벡터를 만든다. */
export function createKeyLightDirection(azimuthDeg: number, elevationDeg = 46): Vec3 {
  const az = azimuthDeg * DEG_TO_RAD;
  const el = clamp(elevationDeg, -80, 85) * DEG_TO_RAD;
  const cosEl = Math.cos(el);
  return normalize3({
    x: Math.sin(az) * cosEl,
    y: Math.sin(el),
    z: Math.cos(az) * cosEl,
  });
}

export const DEFAULT_KEY_LIGHT_DIRECTION: Vec3 = createKeyLightDirection(-42, 46);

interface ProjectedVertex {
  readonly x: number;
  readonly y: number;
  readonly depth: number;
  readonly valid: boolean;
}

interface ProjectedFrontTriangle {
  readonly faceIndex: number;
  readonly i0: number;
  readonly i1: number;
  readonly i2: number;
  readonly ax: number;
  readonly ay: number;
  readonly az: number;
  readonly bx: number;
  readonly by: number;
  readonly bz: number;
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly denom: number;
}

function computeCameraBasis(camera: ProjectionCameraConfig): {
  readonly position: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
  readonly forward: Vec3;
  readonly focalPx: number;
} {
  const yaw = camera.yawDeg * DEG_TO_RAD;
  const pitch = clamp(camera.pitchDeg, -82, 82) * DEG_TO_RAD;
  const dist = Math.max(0.25, camera.distance);
  const cosP = Math.cos(pitch);

  const position: Vec3 = {
    x: camera.target.x + dist * cosP * Math.sin(yaw),
    y: camera.target.y + dist * Math.sin(pitch),
    z: camera.target.z + dist * cosP * Math.cos(yaw),
  };

  const forward = normalize3(sub3(camera.target, position));
  const worldUp: Vec3 = Math.abs(forward.y) > 0.995 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const right = normalize3(cross3(forward, worldUp));
  const up = normalize3(cross3(right, forward));
  const fovRad = clamp(camera.fovDeg, 12, 120) * DEG_TO_RAD;
  const focalPx = (camera.viewportHeight * 0.5) / Math.tan(fovRad * 0.5);

  return { position, right, up, forward, focalPx };
}

function isSampleOccluded(
  px: number,
  py: number,
  pDepth: number,
  edgeFaceA: number,
  edgeFaceB: number | null,
  v0: number,
  v1: number,
  frontTriangles: readonly ProjectedFrontTriangle[],
  bias: number,
): boolean {
  for (const tri of frontTriangles) {
    if (tri.faceIndex === edgeFaceA || tri.faceIndex === edgeFaceB) continue;
    if (tri.i0 === v0 || tri.i1 === v0 || tri.i2 === v0) continue;
    if (tri.i0 === v1 || tri.i1 === v1 || tri.i2 === v1) continue;
    if (tri.minZ >= pDepth - bias) continue;
    if (px < tri.minX || px > tri.maxX || py < tri.minY || py > tri.maxY) continue;

    const u = ((tri.by - tri.cy) * (px - tri.cx) + (tri.cx - tri.bx) * (py - tri.cy)) / tri.denom;
    if (u < -1e-4 || u > 1 + 1e-4) continue;
    const v = ((tri.cy - tri.ay) * (px - tri.cx) + (tri.ax - tri.cx) * (py - tri.cy)) / tri.denom;
    if (v < -1e-4 || v > 1 + 1e-4) continue;
    const w = 1 - u - v;
    if (w < -1e-4) continue;

    const triDepth = u * tri.az + v * tri.bz + w * tri.cz;
    if (triDepth < pDepth - bias) {
      return true;
    }
  }
  return false;
}

/**
 * ① 카메라 원근 투영 및 3D 실루엣·크리즈·경계 엣지 분류 + 가시성/Z정렬.
 */
export function extract3dInkEdges(
  mesh: IndexedTriangleMesh,
  camera: ProjectionCameraConfig,
  options: ExtractInkEdgesOptions = {},
): ExtractedInkEdgeResult {
  const creaseAngleDeg = clamp(options.creaseAngleDeg ?? 32, 1, 179);
  const keyLightDir = normalize3(options.keyLightDirection ?? DEFAULT_KEY_LIGHT_DIRECTION);
  const includeSilhouettes = options.includeSilhouettes ?? true;
  const includeCreases = options.includeCreases ?? true;
  const enableOcclusionCulling = options.enableOcclusionCulling ?? true;
  const occlusionBias = options.depthOcclusionBias ?? 0.035;
  const nearClip = camera.nearClip ?? 0.05;

  const basis = computeCameraBasis(camera);
  const halfW = camera.viewportWidth * 0.5;
  const halfH = camera.viewportHeight * 0.5;

  const projectedVertices: ProjectedVertex[] = mesh.vertices.map((v) => {
    const rel = sub3(v, basis.position);
    const cx = dot3(rel, basis.right);
    const cy = dot3(rel, basis.up);
    const cz = dot3(rel, basis.forward);
    if (cz <= nearClip) {
      return { x: 0, y: 0, depth: cz, valid: false };
    }
    return {
      x: halfW + (cx / cz) * basis.focalPx,
      y: halfH - (cy / cz) * basis.focalPx,
      depth: cz,
      valid: true,
    };
  });

  const facingDots: number[] = new Array(mesh.triangles.length);
  const frontTriangles: ProjectedFrontTriangle[] = [];

  for (let t = 0; t < mesh.triangles.length; t += 1) {
    const tri = mesh.triangles[t];
    const normal = mesh.faceNormals[t];
    const centroid = mesh.faceCentroids[t];
    if (!tri || !normal || !centroid) {
      facingDots[t] = -1;
      continue;
    }
    const viewDir = normalize3(sub3(basis.position, centroid));
    const facing = dot3(normal, viewDir);
    facingDots[t] = facing;

    if (facing > 0) {
      const pa = projectedVertices[tri[0]];
      const pb = projectedVertices[tri[1]];
      const pc = projectedVertices[tri[2]];
      if (pa?.valid && pb?.valid && pc?.valid) {
        const denom = (pb.y - pc.y) * (pa.x - pc.x) + (pc.x - pb.x) * (pa.y - pc.y);
        if (Math.abs(denom) > 1e-5) {
          frontTriangles.push({
            faceIndex: t,
            i0: tri[0],
            i1: tri[1],
            i2: tri[2],
            ax: pa.x,
            ay: pa.y,
            az: pa.depth,
            bx: pb.x,
            by: pb.y,
            bz: pb.depth,
            cx: pc.x,
            cy: pc.y,
            cz: pc.depth,
            minX: Math.min(pa.x, pb.x, pc.x),
            maxX: Math.max(pa.x, pb.x, pc.x),
            minY: Math.min(pa.y, pb.y, pc.y),
            maxY: Math.max(pa.y, pb.y, pc.y),
            minZ: Math.min(pa.depth, pb.depth, pc.depth),
            denom,
          });
        }
      }
    }
  }

  const extractedEdges: ProjectedInkEdge[] = [];
  let silhouetteCount = 0;
  let creaseCount = 0;
  let boundaryCount = 0;
  let culledEdgeCount = 0;

  for (const edge of mesh.edges) {
    const p0 = projectedVertices[edge.v0];
    const p1 = projectedVertices[edge.v1];
    if (!p0?.valid || !p1?.valid) continue;

    const dotA = facingDots[edge.faceA] ?? -1;
    let kind: InkEdgeKind | null = null;
    let normal3d = edge.averageNormal;

    if (edge.faceB === null) {
      if (includeSilhouettes && dotA >= -1e-4) {
        kind = "boundary";
        normal3d = mesh.faceNormals[edge.faceA] ?? edge.averageNormal;
      }
    } else {
      const dotB = facingDots[edge.faceB] ?? -1;
      const isSilhouette = dotA * dotB <= 0 && (dotA > 0 || dotB > 0);
      if (isSilhouette) {
        if (includeSilhouettes) {
          kind = "silhouette";
          normal3d = edge.averageNormal;
        }
      } else if (includeCreases && dotA > 0 && dotB > 0 && edge.dihedralAngleDeg >= creaseAngleDeg) {
        kind = "crease";
        normal3d = edge.averageNormal;
      }
    }

    if (!kind) continue;

    if (enableOcclusionCulling && frontTriangles.length > 0) {
      const samples = [0.25, 0.5, 0.75];
      let occludedCount = 0;
      for (const s of samples) {
        const sx = p0.x + (p1.x - p0.x) * s;
        const sy = p0.y + (p1.y - p0.y) * s;
        const sz = p0.depth + (p1.depth - p0.depth) * s;
        if (
          isSampleOccluded(sx, sy, sz, edge.faceA, edge.faceB, edge.v0, edge.v1, frontTriangles, occlusionBias)
        ) {
          occludedCount += 1;
        }
      }
      if (occludedCount === samples.length) {
        culledEdgeCount += 1;
        continue;
      }
    }

    const ndotl = dot3(normal3d, keyLightDir);
    const shadowFactor = clamp((1 - ndotl) * 0.5, 0, 1);

    if (kind === "silhouette") silhouetteCount += 1;
    else if (kind === "crease") creaseCount += 1;
    else boundaryCount += 1;

    extractedEdges.push({
      edgeKey: edge.edgeKey,
      kind,
      a2d: { x: p0.x, y: p0.y },
      b2d: { x: p1.x, y: p1.y },
      depth: (p0.depth + p1.depth) * 0.5,
      dihedralAngleDeg: edge.dihedralAngleDeg,
      shadowFactor,
      normal3d,
      v0: edge.v0,
      v1: edge.v1,
    });
  }

  // 원경에서 근경 순서(back-to-front)로 Z-정렬
  extractedEdges.sort((a, b) => b.depth - a.depth || a.edgeKey.localeCompare(b.edgeKey));

  return {
    edges: extractedEdges,
    silhouetteCount,
    creaseCount,
    boundaryCount,
    frontFacingTriangleCount: frontTriangles.length,
    culledEdgeCount,
    cameraPosition: basis.position,
  };
}

function perpendicularDistanceToSegment(point: Vec2, start: Vec2, end: Vec2): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= EPSILON) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq, 0, 1);
  const projX = start.x + t * dx;
  const projY = start.y + t * dy;
  return Math.hypot(point.x - projX, point.y - projY);
}

/**
 * ②-b Ramer-Douglas-Peucker 2D 폴리라인 단순화.
 */
export function simplifyPolylineRdp<T extends Vec2>(points: readonly T[], tolerancePx: number): T[] {
  if (points.length <= 2 || tolerancePx <= 0) {
    return [...points];
  }
  const start = points[0];
  const end = points[points.length - 1];
  if (!start || !end) return [...points];

  let maxDist = -1;
  let splitIndex = 0;

  for (let i = 1; i < points.length - 1; i += 1) {
    const pt = points[i];
    if (!pt) continue;
    const d = perpendicularDistanceToSegment(pt, start, end);
    if (d > maxDist) {
      maxDist = d;
      splitIndex = i;
    }
  }

  if (maxDist > tolerancePx && splitIndex > 0 && splitIndex < points.length - 1) {
    const left = simplifyPolylineRdp(points.slice(0, splitIndex + 1), tolerancePx);
    const right = simplifyPolylineRdp(points.slice(splitIndex), tolerancePx);
    return [...left.slice(0, -1), ...right];
  }

  return [start, end];
}

function turningAngleDeg(dirA: Vec2, dirB: Vec2): number {
  const dot = clamp(dirA.x * dirB.x + dirA.y * dirB.y, -1, 1);
  return Math.acos(dot) * RAD_TO_DEG;
}

function computePolylineArcLength(points: readonly Vec2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    if (prev && curr) total += dist2(prev, curr);
  }
  return total;
}

/**
 * ②-a 투영된 2D 엣지 세그먼트를 연속 폴리라인 스트로크로 체이닝한다.
 * 예각 코너 임계값(`cornerBreakAngleDeg`)을 넘는 꺾임에서는 획을 분리해 날카로운 각을 보존한다.
 */
export function chainInkEdgesToPolylines(
  edges: readonly ProjectedInkEdge[],
  options: ChainPolylinesOptions = {},
): readonly InkPolyline[] {
  const cornerBreakAngleDeg = clamp(options.cornerBreakAngleDeg ?? 52, 5, 175);
  const rdpTolerancePx = Math.max(0, options.rdpTolerancePx ?? 1.15);
  const minStrokeLengthPx = Math.max(0, options.minStrokeLengthPx ?? 2.5);

  const kinds: readonly InkEdgeKind[] = ["silhouette", "boundary", "crease"];
  const polylines: InkPolyline[] = [];
  let seq = 1;

  for (const kind of kinds) {
    const groupEdges = edges.filter((e) => e.kind === kind);
    if (groupEdges.length === 0) continue;

    const vertexEdgeMap = new Map<number, number[]>();
    const addAdj = (vertexIdx: number, edgeIdx: number): void => {
      const list = vertexEdgeMap.get(vertexIdx);
      if (list) list.push(edgeIdx);
      else vertexEdgeMap.set(vertexIdx, [edgeIdx]);
    };

    for (let i = 0; i < groupEdges.length; i += 1) {
      const e = groupEdges[i];
      if (!e) continue;
      addAdj(e.v0, i);
      addAdj(e.v1, i);
    }

    const used = new Uint8Array(groupEdges.length);

    // 차수가 1(열린 끝점)인 엣지를 먼저 체이닝해 불필요한 중간 끊김을 줄인다.
    const startOrder = groupEdges
      .map((e, idx) => ({
        idx,
        minDeg: Math.min(vertexEdgeMap.get(e.v0)?.length ?? 0, vertexEdgeMap.get(e.v1)?.length ?? 0),
      }))
      .sort((a, b) => a.minDeg - b.minDeg || a.idx - b.idx);

    const endpointOf = (edge: ProjectedInkEdge, vertexIdx: number): InkPolylinePoint => {
      const pos = edge.v0 === vertexIdx ? edge.a2d : edge.b2d;
      return {
        x: pos.x,
        y: pos.y,
        depth: edge.depth,
        shadowFactor: edge.shadowFactor,
        vertexIndex: vertexIdx,
      };
    };

    const pickNextEdge = (
      currentVertex: number,
      incomingDir: Vec2,
    ): { readonly edgeIdx: number; readonly nextVertex: number } | null => {
      const candidates = vertexEdgeMap.get(currentVertex);
      if (!candidates) return null;
      let bestEdge = -1;
      let bestNextVertex = -1;
      let bestAngle = Number.POSITIVE_INFINITY;

      for (const candidateIdx of candidates) {
        if (used[candidateIdx]) continue;
        const cand = groupEdges[candidateIdx];
        if (!cand) continue;
        const nextVertex = cand.v0 === currentVertex ? cand.v1 : cand.v0;
        const fromPt = cand.v0 === currentVertex ? cand.a2d : cand.b2d;
        const toPt = cand.v0 === currentVertex ? cand.b2d : cand.a2d;
        const outDir = normalize2(toPt.x - fromPt.x, toPt.y - fromPt.y);
        const angle = turningAngleDeg(incomingDir, outDir);
        if (angle <= cornerBreakAngleDeg && angle < bestAngle) {
          bestAngle = angle;
          bestEdge = candidateIdx;
          bestNextVertex = nextVertex;
        }
      }

      if (bestEdge < 0) return null;
      return { edgeIdx: bestEdge, nextVertex: bestNextVertex };
    };

    const extendChain = (chain: InkPolylinePoint[]): void => {
      while (true) {
        const last = chain[chain.length - 1];
        const prev = chain[chain.length - 2];
        if (!last || !prev) break;
        const inDir = normalize2(last.x - prev.x, last.y - prev.y);
        const next = pickNextEdge(last.vertexIndex, inDir);
        if (!next) break;
        const edge = groupEdges[next.edgeIdx];
        if (!edge) break;
        used[next.edgeIdx] = 1;
        chain.push(endpointOf(edge, next.nextVertex));
        if (chain[0] && next.nextVertex === chain[0].vertexIndex) break;
      }
    };

    for (const item of startOrder) {
      if (used[item.idx]) continue;
      const seed = groupEdges[item.idx];
      if (!seed) continue;
      used[item.idx] = 1;

      const chain: InkPolylinePoint[] = [endpointOf(seed, seed.v0), endpointOf(seed, seed.v1)];
      extendChain(chain);

      const firstPt = chain[0];
      const lastPt = chain[chain.length - 1];
      if (firstPt && lastPt && firstPt.vertexIndex !== lastPt.vertexIndex) {
        chain.reverse();
        extendChain(chain);
      }

      const head = chain[0];
      const tail = chain[chain.length - 1];
      let closed = false;
      if (head && tail && chain.length >= 4 && head.vertexIndex === tail.vertexIndex) {
        const beforeTail = chain[chain.length - 2];
        const afterHead = chain[1];
        if (beforeTail && afterHead) {
          const seamIn = normalize2(tail.x - beforeTail.x, tail.y - beforeTail.y);
          const seamOut = normalize2(afterHead.x - head.x, afterHead.y - head.y);
          if (turningAngleDeg(seamIn, seamOut) <= cornerBreakAngleDeg) {
            closed = true;
          }
        }
      }

      let simplified = simplifyPolylineRdp(chain, rdpTolerancePx);
      if (closed && simplified.length < 4 && chain.length >= 4) {
        simplified = [...chain];
      }

      const arcLengthPx = computePolylineArcLength(simplified);
      if (arcLengthPx < minStrokeLengthPx || simplified.length < 2) continue;

      let depthSum = 0;
      let shadowSum = 0;
      for (const pt of simplified) {
        depthSum += pt.depth;
        shadowSum += pt.shadowFactor;
      }

      polylines.push({
        id: `${kind}-${String(seq).padStart(3, "0")}`,
        kind,
        closed,
        points: simplified,
        averageDepth: depthSum / simplified.length,
        averageShadowFactor: shadowSum / simplified.length,
        arcLengthPx,
      });
      seq += 1;
    }
  }

  polylines.sort((a, b) => b.averageDepth - a.averageDepth || a.id.localeCompare(b.id));
  return polylines;
}

export interface ProjectMeshToVectorInkInput {
  readonly meshId?: MeshPresetId;
  readonly mesh?: IndexedTriangleMesh;
  readonly camera?: Partial<ProjectionCameraConfig>;
  readonly keyLightDirection?: Vec3;
  readonly creaseAngleDeg?: number;
  readonly cornerBreakAngleDeg?: number;
  readonly rdpTolerancePx?: number;
  readonly minStrokeLengthPx?: number;
  readonly gpenStyleId?: GpenStyleId;
  readonly gpenProfile?: CreatorGpenProfile;
  readonly enableOcclusionCulling?: boolean;
  readonly subdivisionsPerSegment?: number;
}

/**
 * 3D 메시 → 실루엣/크리즈 추출 → 폴리라인 체이닝/RDP → G펜 큐빅 베지어 벡터 스트로크 일괄 투영.
 */
export function projectMeshToVectorInk(input: ProjectMeshToVectorInkInput = {}): VectorInkProjectionResult {
  const mesh = input.mesh ?? createMeshPreset(input.meshId ?? "hero-bust");
  const camera: ProjectionCameraConfig = {
    yawDeg: input.camera?.yawDeg ?? mesh.defaultCamera.yawDeg,
    pitchDeg: input.camera?.pitchDeg ?? mesh.defaultCamera.pitchDeg,
    distance: input.camera?.distance ?? mesh.defaultCamera.distance,
    fovDeg: input.camera?.fovDeg ?? mesh.defaultCamera.fovDeg,
    viewportWidth: input.camera?.viewportWidth ?? 560,
    viewportHeight: input.camera?.viewportHeight ?? 360,
    target: input.camera?.target ?? mesh.defaultCamera.target,
    nearClip: input.camera?.nearClip ?? 0.05,
  };
  const keyLightDirection = normalize3(input.keyLightDirection ?? DEFAULT_KEY_LIGHT_DIRECTION);
  const creaseAngleDeg = clamp(input.creaseAngleDeg ?? 32, 1, 179);
  const gpenProfile = input.gpenProfile ?? getGpenStyleProfile(input.gpenStyleId ?? "webtoon-gpen");

  const extracted = extract3dInkEdges(mesh, camera, {
    creaseAngleDeg,
    keyLightDirection,
    enableOcclusionCulling: input.enableOcclusionCulling ?? true,
  });

  const polylines = chainInkEdgesToPolylines(extracted.edges, {
    cornerBreakAngleDeg: input.cornerBreakAngleDeg ?? 52,
    rdpTolerancePx: input.rdpTolerancePx ?? 1.15,
    minStrokeLengthPx: input.minStrokeLengthPx ?? 2.5,
  });

  const strokes = fitCubicBezierInkStrokes(polylines, gpenProfile, {
    subdivisionsPerSegment: input.subdivisionsPerSegment ?? 6,
  });

  let bezierSegmentCount = 0;
  let widthSum = 0;
  let maxLineWidthPx = 0;
  let shadowThickenedStrokeCount = 0;

  for (const stroke of strokes) {
    bezierSegmentCount += stroke.segments.length;
    widthSum += stroke.meanWidthPx;
    if (stroke.maxWidthPx > maxLineWidthPx) maxLineWidthPx = stroke.maxWidthPx;
    if (stroke.averageShadowFactor >= 0.55) shadowThickenedStrokeCount += 1;
  }

  const stats: VectorInkProjectionStats = {
    meshVertexCount: mesh.manifoldStats.vertexCount,
    meshTriangleCount: mesh.manifoldStats.triangleCount,
    meshEdgeCount: mesh.manifoldStats.edgeCount,
    extractedEdgeCount: extracted.edges.length,
    silhouetteEdgeCount: extracted.silhouetteCount,
    creaseEdgeCount: extracted.creaseCount,
    boundaryEdgeCount: extracted.boundaryCount,
    culledEdgeCount: extracted.culledEdgeCount,
    polylineCount: polylines.length,
    bezierSegmentCount,
    avgLineWidthPx: strokes.length > 0 ? round2(widthSum / strokes.length) : 0,
    maxLineWidthPx: round2(maxLineWidthPx),
    shadowThickenedStrokeCount,
  };

  return {
    mesh,
    camera,
    keyLightDirection,
    creaseAngleDeg,
    gpenProfile,
    extracted,
    polylines,
    strokes,
    stats,
  };
}
