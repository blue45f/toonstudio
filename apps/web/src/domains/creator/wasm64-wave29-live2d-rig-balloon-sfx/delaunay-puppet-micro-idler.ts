/**
 * Wasm64 Wave 29: 무라이선스 2D 다층 캐릭터 무게중심 케이지 변형기 및
 * 비대칭 눈 깜빡임·위상차 호흡·반암시적 오일러 진자 마이크로 아이들러.
 *
 * - 독점 상용 런타임 없이 Bowyer-Watson 들로네 삼각분할과 Hormann-Floater 평균값 좌표(MVC)
 *   무게중심 케이지를 결합해 수밀(watertight) 2D 퍼펫 메쉬를 구성한다.
 * - 빠른 감기(55ms)·완만한 뜨기(110ms ease-out) 비대칭 눈꺼풀 곡선, 횡격막-어깨 위상 지연 호흡,
 *   앞머리·뒷머리·망토 3종 체인의 반암시적 오일러 감쇠 진자를 구동하며 삼각형 양수 넓이(`minSignedArea > 0`)를 보장한다.
 */

export type PendulumChainKind = "hair-front" | "hair-back" | "cape";
export type PuppetLayerRegion =
  | "torso" | "shoulder" | "head" | "eyelid-left" | "eyelid-right"
  | "hair-front" | "hair-back" | "cape";

export interface PuppetPoint2D { readonly x: number; readonly y: number; }

export interface PuppetMeshBuildOptions {
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly boundarySegmentsPerEdge?: number;
  readonly customInteriorPoints?: readonly PuppetPoint2D[];
}

export interface PuppetVertexSkinWeights {
  readonly diaphragm: number;
  readonly shoulder: number;
  readonly head: number;
  readonly eyelidLeft: number;
  readonly eyelidRight: number;
  readonly hairFront: number;
  readonly hairFrontArcT: number;
  readonly hairBack: number;
  readonly hairBackArcT: number;
  readonly cape: number;
  readonly capeArcT: number;
  readonly dominantRegion: PuppetLayerRegion;
}

export interface PuppetMeshTopologyReport {
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly minSignedArea: number;
  readonly maxSignedArea: number;
  readonly totalSignedArea: number;
  readonly invertedTriangleCount: number;
  readonly boundaryEdgeCount: number;
  readonly interiorHalfEdgePairCount: number;
  readonly watertight: boolean;
}

export interface DelaunayPuppetMesh {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
  /** 길이 `vertexCount * 2` (`[x0, y0, ...]`), 로컬 좌표계(`+x` 우측, `+y` 상단). */
  readonly restVertices: Float32Array;
  /** 길이 `vertexCount * 2` (`[u0, v0, ...]`), 상단 좌측 원점 정규화 텍스처 좌표 `[0, 1]`. */
  readonly uvs: Float32Array;
  /** 길이 `triangleCount * 3`, 반시계 방향(양수 부호 넓이) 정점 인덱스. */
  readonly indices: Uint32Array;
  /** 볼록 팔각형 외부 제어 케이지 초기 좌표 (`cageVertexCount = 8`). */
  readonly cageRestPoints: readonly PuppetPoint2D[];
  /** 길이 `vertexCount * cageVertexCount`, 평균값 좌표(Mean-Value Coordinates) 가중치 행렬. */
  readonly cageWeights: Float32Array;
  readonly skinWeights: readonly PuppetVertexSkinWeights[];
  readonly restTopology: PuppetMeshTopologyReport;
}

export interface AsymmetricBlinkOptions {
  readonly blinkIntervalMs?: number; readonly closeDurationMs?: number; readonly openDurationMs?: number;
  readonly rightEyeLagMs?: number; readonly prefersReducedMotion?: boolean;
}
export interface AsymmetricBlinkSample {
  readonly leftClosure: number; readonly rightClosure: number; readonly phaseWithinCycleMs: number; readonly isBlinking: boolean;
}
export interface BreathingCurveOptions {
  readonly breathPeriodMs?: number; readonly chestPhaseLagRad?: number; readonly shoulderPhaseLagRad?: number;
  readonly idleHeadSwayAmplitudeRad?: number; readonly prefersReducedMotion?: boolean;
}
export interface BreathingLiftSample {
  readonly diaphragmExpand: number; readonly chestLift: number; readonly shoulderLift: number; readonly idleHeadSwayRad: number;
}
export interface PendulumChainSpec {
  readonly kind: PendulumChainKind; readonly labelKo: string; readonly linkCount: number; readonly segmentLengthPx: number;
  readonly stiffness: number; readonly damping: number; readonly gravityTorque: number; readonly inertialCoupling: number; readonly maxAngleRad: number;
}
export interface PendulumChainState {
  readonly kind: PendulumChainKind; readonly anglesRad: readonly number[];
  readonly velocitiesRadPerSec: readonly number[]; readonly tipOffsetPx: PuppetPoint2D;
}
export interface PuppetIdlerState {
  readonly elapsedMs: number; readonly prevHeadAnchorX: number; readonly prevHeadAnchorY: number;
  readonly prevAnchorVelocityX: number; readonly chains: Readonly<Record<PendulumChainKind, PendulumChainState>>;
}
export interface PuppetMicroIdlerStepInput {
  readonly dtMs: number; readonly externalHeadTiltRad?: number; readonly windImpulsePxPerSec2?: number;
  readonly prefersReducedMotion?: boolean; readonly blinkOptions?: AsymmetricBlinkOptions; readonly breathingOptions?: BreathingCurveOptions;
}
export interface PuppetMicroIdlerFrameResult {
  readonly state: PuppetIdlerState; readonly deformedVertices: Float32Array; readonly deformedCagePoints: readonly PuppetPoint2D[];
  readonly blink: AsymmetricBlinkSample; readonly breathing: BreathingLiftSample; readonly appliedHeadTiltRad: number;
  readonly minSignedArea: number; readonly invertedTriangleCount: number; readonly safetyScaleApplied: number;
}

interface IndexedTriangle { readonly a: number; readonly b: number; readonly c: number; }
interface DirectedEdge { readonly u: number; readonly v: number; readonly ownerIdx: number; }

const DEFAULT_WIDTH_PX = 256;
const DEFAULT_HEIGHT_PX = 384;
const DEFAULT_BOUNDARY_SEGMENTS = 5;
const DEFAULT_CLOSE_DURATION_MS = 55;
const DEFAULT_OPEN_DURATION_MS = 110;
const DEFAULT_BLINK_INTERVAL_MS = 3200;
const DEFAULT_BREATH_PERIOD_MS = 4000;
const MAX_SUBSTEP_SEC = 1 / 120;

const CANONICAL_CHAIN_SPECS: Readonly<Record<PendulumChainKind, PendulumChainSpec>> = {
  "hair-front": {
    kind: "hair-front", labelKo: "앞머리 술 진자 체인", linkCount: 3, segmentLengthPx: 22,
    stiffness: 46, damping: 6.4, gravityTorque: 14, inertialCoupling: 0.042, maxAngleRad: 0.42,
  },
  "hair-back": {
    kind: "hair-back", labelKo: "뒷머리 장발 진자 체인", linkCount: 3, segmentLengthPx: 34,
    stiffness: 28, damping: 4.8, gravityTorque: 18, inertialCoupling: 0.034, maxAngleRad: 0.48,
  },
  cape: {
    kind: "cape", labelKo: "어깨 망토 자락 진자 체인", linkCount: 3, segmentLengthPx: 44,
    stiffness: 19, damping: 3.9, gravityTorque: 21, inertialCoupling: 0.028, maxAngleRad: 0.52,
  },
};

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

function gaussianWeight(px: number, py: number, cx: number, cy: number, sx: number, sy: number): number {
  const dx = (px - cx) / Math.max(1e-3, sx);
  const dy = (py - cy) / Math.max(1e-3, sy);
  return Math.exp(-0.5 * (dx * dx + dy * dy));
}

/** 2D 삼각형 `(A, B, C)`의 부호 있는 넓이를 계산한다(반시계 방향 정렬 시 양수). */
export function computeTriangleSignedArea2D(
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number,
): number {
  return 0.5 * ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
}

function pointInCircumcircle(points: readonly PuppetPoint2D[], tri: IndexedTriangle, px: number, py: number): boolean {
  const pa = points[tri.a];
  const pb = points[tri.b];
  const pc = points[tri.c];
  if (!pa || !pb || !pc) return false;
  const ax = pa.x - px, ay = pa.y - py;
  const bx = pb.x - px, by = pb.y - py;
  const cx = pc.x - px, cy = pc.y - py;
  const aSq = ax * ax + ay * ay, bSq = bx * bx + by * by, cSq = cx * cx + cy * cy;
  return ax * (by * cSq - bSq * cy) - ay * (bx * cSq - bSq * cx) + aSq * (bx * cy - by * cx) > 1e-6;
}

function buildDefaultAnatomicalSeedPoints(widthPx: number, heightPx: number): PuppetPoint2D[] {
  const seeds: readonly [number, number][] = [
    [0.5, 0.16], [0.34, 0.22], [0.66, 0.22], [0.5, 0.38], [0.35, 0.42], [0.65, 0.42],
    [0.5, 0.54], [0.24, 0.62], [0.76, 0.62], [0.2, 0.48], [0.8, 0.48], [0.18, 0.28],
    [0.82, 0.28], [0.5, 0.66], [0.5, 0.76], [0.39, 0.79], [0.61, 0.79], [0.39, 0.75],
    [0.61, 0.75], [0.5, 0.88], [0.43, 0.85], [0.57, 0.85], [0.3, 0.73], [0.7, 0.73],
    [0.28, 0.57], [0.72, 0.57],
  ];
  return seeds.map(([nx, ny]) => ({ x: nx * widthPx, y: ny * heightPx }));
}

function collectCavityBoundaryEdges(triangles: readonly IndexedTriangle[], badFlags: readonly boolean[]): DirectedEdge[] {
  const badDirected: DirectedEdge[] = [];
  for (let idx = 0; idx < triangles.length; idx += 1) {
    const tri = triangles[idx];
    if (!badFlags[idx] || !tri) continue;
    badDirected.push({ u: tri.a, v: tri.b, ownerIdx: idx }, { u: tri.b, v: tri.c, ownerIdx: idx }, { u: tri.c, v: tri.a, ownerIdx: idx });
  }
  const oppositeSet = new Set<string>();
  for (const edge of badDirected) oppositeSet.add(`${edge.v}:${edge.u}`);
  return badDirected.filter((edge) => !oppositeSet.has(`${edge.u}:${edge.v}`));
}

function triangulateBowyerWatson(
  boundaryPoints: readonly PuppetPoint2D[], interiorPoints: readonly PuppetPoint2D[], widthPx: number, heightPx: number,
): { readonly points: readonly PuppetPoint2D[]; readonly triangles: readonly IndexedTriangle[] } {
  const accepted: PuppetPoint2D[] = [...boundaryPoints];
  const minSpacingSq = Math.pow(Math.min(widthPx, heightPx) * 0.032, 2);
  const marginX = widthPx * 0.05, marginY = heightPx * 0.05;

  for (let idx = 0; idx < interiorPoints.length; idx += 1) {
    const candidate = interiorPoints[idx];
    if (!candidate) continue;
    const jitterAngle = (idx + 1) * 2.399963229728653;
    const px = clamp(candidate.x + Math.cos(jitterAngle) * 1e-3, marginX, widthPx - marginX);
    const py = clamp(candidate.y + Math.sin(jitterAngle) * 1e-3, marginY, heightPx - marginY);
    if (!accepted.some((pt) => (pt.x - px) ** 2 + (pt.y - py) ** 2 < minSpacingSq)) {
      accepted.push({ x: px, y: py });
    }
  }

  const realCount = accepted.length;
  const span = Math.max(widthPx, heightPx) * 12;
  const midX = widthPx * 0.5, midY = heightPx * 0.5;
  const allPoints: PuppetPoint2D[] = [
    ...accepted,
    { x: midX - span, y: midY - span },
    { x: midX + span, y: midY - span },
    { x: midX, y: midY + span },
  ];
  let triangles: IndexedTriangle[] = [{ a: realCount, b: realCount + 1, c: realCount + 2 }];

  for (let pIdx = 0; pIdx < realCount; pIdx += 1) {
    const pt = allPoints[pIdx];
    if (!pt) continue;
    const badFlags = triangles.map((tri) => pointInCircumcircle(allPoints, tri, pt.x, pt.y));

    let changed = true;
    while (changed) {
      changed = false;
      if (badFlags.reduce((acc, f) => (f ? acc + 1 : acc), 0) <= 1) break;
      for (const edge of collectCavityBoundaryEdges(triangles, badFlags)) {
        const pu = allPoints[edge.u], pv = allPoints[edge.v];
        if (pu && pv && computeTriangleSignedArea2D(pu.x, pu.y, pv.x, pv.y, pt.x, pt.y) <= 1e-4) {
          badFlags[edge.ownerIdx] = false;
          changed = true;
          break;
        }
      }
    }

    const nextTriangles = triangles.filter((_, tIdx) => !badFlags[tIdx]);
    for (const edge of collectCavityBoundaryEdges(triangles, badFlags)) {
      const pu = allPoints[edge.u], pv = allPoints[edge.v];
      if (!pu || !pv) continue;
      const area = computeTriangleSignedArea2D(pu.x, pu.y, pv.x, pv.y, pt.x, pt.y);
      nextTriangles.push(area >= 0 ? { a: edge.u, b: edge.v, c: pIdx } : { a: edge.v, b: edge.u, c: pIdx });
    }
    triangles = nextTriangles;
  }

  return { points: accepted, triangles: triangles.filter((t) => t.a < realCount && t.b < realCount && t.c < realCount) };
}

function buildOctagonControlCage(widthPx: number, heightPx: number): PuppetPoint2D[] {
  const minX = -widthPx * 0.24, maxX = widthPx * 1.24;
  const minY = -heightPx * 0.18, maxY = heightPx * 1.18;
  const midX = widthPx * 0.5;
  return [
    { x: midX - widthPx * 0.56, y: minY }, { x: midX + widthPx * 0.56, y: minY },
    { x: maxX, y: heightPx * 0.34 }, { x: maxX, y: heightPx * 0.68 },
    { x: midX + widthPx * 0.56, y: maxY }, { x: midX - widthPx * 0.56, y: maxY },
    { x: minX, y: heightPx * 0.68 }, { x: minX, y: heightPx * 0.34 },
  ];
}

/** 닫힌 반시계 볼록 케이지 내부 점 `(px, py)`의 Hormann-Floater 평균값 좌표를 계산한다. */
export function computeMeanValueCageWeights(px: number, py: number, cagePoints: readonly PuppetPoint2D[]): Float32Array {
  const count = cagePoints.length;
  const weights = new Float32Array(count);
  if (count === 0) return weights;

  const dxArr = new Float64Array(count), dyArr = new Float64Array(count), distArr = new Float64Array(count);
  for (let i = 0; i < count; i += 1) {
    const dx = (cagePoints[i]?.x ?? 0) - px, dy = (cagePoints[i]?.y ?? 0) - py;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-9) { weights[i] = 1; return weights; }
    dxArr[i] = dx; dyArr[i] = dy; distArr[i] = dist;
  }

  const tanHalf = new Float64Array(count);
  for (let i = 0; i < count; i += 1) {
    const next = (i + 1) % count;
    const ax = dxArr[i] ?? 0, ay = dyArr[i] ?? 0, bx = dxArr[next] ?? 0, by = dyArr[next] ?? 0;
    const denom = Math.max(1e-12, (distArr[i] ?? 1) * (distArr[next] ?? 1) + ax * bx + ay * by);
    tanHalf[i] = (ax * by - ay * bx) / denom;
  }

  let totalWeight = 0;
  const rawWeights = new Float64Array(count);
  for (let i = 0; i < count; i += 1) {
    const w = ((tanHalf[(i - 1 + count) % count] ?? 0) + (tanHalf[i] ?? 0)) / Math.max(1e-12, distArr[i] ?? 1);
    rawWeights[i] = w;
    totalWeight += w;
  }
  const invTotal = totalWeight !== 0 ? 1 / totalWeight : 1 / count;
  for (let i = 0; i < count; i += 1) weights[i] = (rawWeights[i] ?? 0) * invTotal;
  return weights;
}

function computeVertexSkinWeights(px: number, py: number, widthPx: number, heightPx: number): PuppetVertexSkinWeights {
  const nx = px / Math.max(1, widthPx), ny = py / Math.max(1, heightPx);
  const diaphragm = gaussianWeight(nx, ny, 0.5, 0.39, 0.22, 0.12);
  const shoulder = Math.max(gaussianWeight(nx, ny, 0.26, 0.62, 0.14, 0.1), gaussianWeight(nx, ny, 0.74, 0.62, 0.14, 0.1));
  const head = clamp((ny - 0.64) / 0.26, 0, 1) * gaussianWeight(nx, ny, 0.5, 0.8, 0.26, 0.18);
  const eyelidLeft = gaussianWeight(nx, ny, 0.39, 0.79, 0.055, 0.032);
  const eyelidRight = gaussianWeight(nx, ny, 0.61, 0.79, 0.055, 0.032);
  const hairFront = gaussianWeight(nx, ny, 0.5, 0.85, 0.14, 0.065);
  const hairFrontArcT = clamp((0.92 - ny) / 0.16, 0, 1);
  const hairBack = Math.max(gaussianWeight(nx, ny, 0.29, 0.66, 0.09, 0.14), gaussianWeight(nx, ny, 0.71, 0.66, 0.09, 0.14)) * 0.9;
  const hairBackArcT = clamp((0.82 - ny) / 0.32, 0, 1);
  const cape = Math.max(gaussianWeight(nx, ny, 0.19, 0.36, 0.1, 0.18), gaussianWeight(nx, ny, 0.81, 0.36, 0.1, 0.18)) * 0.95;
  const capeArcT = clamp((0.62 - ny) / 0.48, 0, 1);

  let dominantRegion: PuppetLayerRegion = "torso";
  let topScore = diaphragm * 0.8 + 0.15;
  const candidates: readonly [PuppetLayerRegion, number][] = [
    ["shoulder", shoulder], ["head", head], ["eyelid-left", eyelidLeft * 1.4], ["eyelid-right", eyelidRight * 1.4],
    ["hair-front", hairFront * 1.1], ["hair-back", hairBack * 1.1], ["cape", cape * 1.1],
  ];
  for (const [region, score] of candidates) {
    if (score > topScore) { topScore = score; dominantRegion = region; }
  }
  return {
    diaphragm, shoulder, head, eyelidLeft, eyelidRight,
    hairFront, hairFrontArcT, hairBack, hairBackArcT, cape, capeArcT, dominantRegion,
  };
}

/** 메쉬 정점과 인덱스 배열의 부호 넓이 불변량(`minSignedArea > 0`)과 수밀성을 검사한다. */
export function inspectPuppetMeshTopology(vertices: Float32Array, indices: Uint32Array): PuppetMeshTopologyReport {
  const vertexCount = Math.floor(vertices.length / 2);
  const triangleCount = Math.floor(indices.length / 3);
  let minSignedArea = Number.POSITIVE_INFINITY, maxSignedArea = Number.NEGATIVE_INFINITY;
  let totalSignedArea = 0, invertedTriangleCount = 0, duplicateHalfEdge = false;
  const directedEdges = new Set<string>();

  for (let t = 0; t < triangleCount; t += 1) {
    const i0 = indices[t * 3] ?? 0, i1 = indices[t * 3 + 1] ?? 0, i2 = indices[t * 3 + 2] ?? 0;
    const area = computeTriangleSignedArea2D(
      vertices[i0 * 2] ?? 0, vertices[i0 * 2 + 1] ?? 0,
      vertices[i1 * 2] ?? 0, vertices[i1 * 2 + 1] ?? 0,
      vertices[i2 * 2] ?? 0, vertices[i2 * 2 + 1] ?? 0,
    );
    if (area < minSignedArea) minSignedArea = area;
    if (area > maxSignedArea) maxSignedArea = area;
    totalSignedArea += area;
    if (area <= 0) invertedTriangleCount += 1;
    for (const [u, v] of [[i0, i1], [i1, i2], [i2, i0]] as const) {
      const key = `${u}:${v}`;
      if (directedEdges.has(key)) duplicateHalfEdge = true;
      directedEdges.add(key);
    }
  }

  let boundaryEdgeCount = 0, interiorHalfEdgeCount = 0;
  for (const key of directedEdges) {
    const sep = key.indexOf(":");
    if (directedEdges.has(`${key.slice(sep + 1)}:${key.slice(0, sep)}`)) interiorHalfEdgeCount += 1;
    else boundaryEdgeCount += 1;
  }
  if (triangleCount === 0) { minSignedArea = 0; maxSignedArea = 0; }

  return {
    vertexCount, triangleCount, minSignedArea, maxSignedArea, totalSignedArea, invertedTriangleCount,
    boundaryEdgeCount, interiorHalfEdgePairCount: Math.floor(interiorHalfEdgeCount / 2),
    watertight: triangleCount > 0 && !duplicateHalfEdge && invertedTriangleCount === 0 && boundaryEdgeCount >= 3 && interiorHalfEdgeCount % 2 === 0,
  };
}

/** 수밀 2D 들로네 삼각 퍼펫 메쉬와 평균값 무게중심 케이지 가중치를 생성한다. */
export function buildDelaunayPuppetMesh(options: PuppetMeshBuildOptions = {}): DelaunayPuppetMesh {
  const widthPx = clamp(options.widthPx ?? DEFAULT_WIDTH_PX, 64, 4096);
  const heightPx = clamp(options.heightPx ?? DEFAULT_HEIGHT_PX, 64, 4096);
  const segs = Math.round(clamp(options.boundarySegmentsPerEdge ?? DEFAULT_BOUNDARY_SEGMENTS, 2, 12));

  const boundaryPoints: PuppetPoint2D[] = [];
  for (let i = 0; i < segs; i += 1) boundaryPoints.push({ x: (widthPx * i) / segs, y: 0 });
  for (let i = 0; i < segs; i += 1) boundaryPoints.push({ x: widthPx, y: (heightPx * i) / segs });
  for (let i = 0; i < segs; i += 1) boundaryPoints.push({ x: widthPx * (1 - i / segs), y: heightPx });
  for (let i = 0; i < segs; i += 1) boundaryPoints.push({ x: 0, y: heightPx * (1 - i / segs) });

  const interiorSeeds = [...buildDefaultAnatomicalSeedPoints(widthPx, heightPx), ...(options.customInteriorPoints ?? [])];
  const { points, triangles } = triangulateBowyerWatson(boundaryPoints, interiorSeeds, widthPx, heightPx);

  const vertexCount = points.length, triangleCount = triangles.length;
  const restVertices = new Float32Array(vertexCount * 2), uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(triangleCount * 3);
  const cageRestPoints = buildOctagonControlCage(widthPx, heightPx);
  const cageCount = cageRestPoints.length;
  const cageWeights = new Float32Array(vertexCount * cageCount);
  const skinWeights: PuppetVertexSkinWeights[] = [];

  for (let i = 0; i < vertexCount; i += 1) {
    const px = points[i]?.x ?? 0, py = points[i]?.y ?? 0;
    restVertices[i * 2] = px; restVertices[i * 2 + 1] = py;
    uvs[i * 2] = clamp(px / widthPx, 0, 1); uvs[i * 2 + 1] = clamp(1 - py / heightPx, 0, 1);
    const mvc = computeMeanValueCageWeights(px, py, cageRestPoints);
    for (let j = 0; j < cageCount; j += 1) cageWeights[i * cageCount + j] = mvc[j] ?? 0;
    skinWeights.push(computeVertexSkinWeights(px, py, widthPx, heightPx));
  }
  for (let t = 0; t < triangleCount; t += 1) {
    const tri = triangles[t];
    indices[t * 3] = tri?.a ?? 0; indices[t * 3 + 1] = tri?.b ?? 0; indices[t * 3 + 2] = tri?.c ?? 0;
  }

  return {
    widthPx, heightPx, vertexCount, triangleCount, restVertices, uvs, indices,
    cageRestPoints, cageWeights, skinWeights, restTopology: inspectPuppetMeshTopology(restVertices, indices),
  };
}

function evalSingleEyeBlink(localTimeMs: number, intervalMs: number, closeMs: number, openMs: number): number {
  const cycleMs = ((localTimeMs % intervalMs) + intervalMs) % intervalMs;
  if (cycleMs < 0 || cycleMs >= closeMs + openMs) return 0;
  if (cycleMs <= closeMs) {
    const u = clamp(cycleMs / Math.max(1, closeMs), 0, 1);
    return u * u * (3 - 2 * u);
  }
  const inv = 1 - clamp((cycleMs - closeMs) / Math.max(1, openMs), 0, 1);
  return inv * inv * inv;
}

/** 빠른 감기(`55ms`)와 완만한 뜨기(`110ms` ease-out) 비대칭 눈 깜빡임 곡선을 평가한다. */
export function evaluateAsymmetricBlinkCurve(timeMs: number, options: AsymmetricBlinkOptions = {}): AsymmetricBlinkSample {
  if (options.prefersReducedMotion === true) {
    return { leftClosure: 0, rightClosure: 0, phaseWithinCycleMs: 0, isBlinking: false };
  }
  const closeMs = clamp(options.closeDurationMs ?? DEFAULT_CLOSE_DURATION_MS, 15, 250);
  const openMs = clamp(options.openDurationMs ?? DEFAULT_OPEN_DURATION_MS, 30, 500);
  const intervalMs = Math.max(closeMs + openMs + 200, options.blinkIntervalMs ?? DEFAULT_BLINK_INTERVAL_MS);
  const lagMs = clamp(options.rightEyeLagMs ?? 4, 0, 25);
  const safeTimeMs = Math.max(0, Number.isFinite(timeMs) ? timeMs : 0);
  const leftClosure = evalSingleEyeBlink(safeTimeMs, intervalMs, closeMs, openMs);
  const rightClosure = evalSingleEyeBlink(Math.max(0, safeTimeMs - lagMs), intervalMs, closeMs, openMs);
  return {
    leftClosure, rightClosure, phaseWithinCycleMs: safeTimeMs % intervalMs,
    isBlinking: leftClosure > 1e-4 || rightClosure > 1e-4,
  };
}

/** 횡격막 팽창이 선행하고 흉곽·어깨 거상이 뒤따르는 위상차 호흡 리프트를 평가한다. */
export function evaluatePhaseLaggedBreathing(timeMs: number, options: BreathingCurveOptions = {}): BreathingLiftSample {
  if (options.prefersReducedMotion === true) {
    return { diaphragmExpand: 0, chestLift: 0, shoulderLift: 0, idleHeadSwayRad: 0 };
  }
  const periodMs = Math.max(800, options.breathPeriodMs ?? DEFAULT_BREATH_PERIOD_MS);
  const chestLag = options.chestPhaseLagRad ?? 0.36, shoulderLag = options.shoulderPhaseLagRad ?? 0.72;
  const headSwayAmp = clamp(options.idleHeadSwayAmplitudeRad ?? 0.028, 0, 0.16);
  const phase = (2 * Math.PI * Math.max(0, Number.isFinite(timeMs) ? timeMs : 0)) / periodMs;
  return {
    diaphragmExpand: 0.5 - 0.5 * Math.cos(phase),
    chestLift: 0.5 - 0.5 * Math.cos(phase - chestLag),
    shoulderLift: 0.5 - 0.5 * Math.cos(phase - shoulderLag),
    idleHeadSwayRad: Math.sin(phase * 0.5 - shoulderLag * 0.5) * headSwayAmp,
  };
}

function createZeroChainState(kind: PendulumChainKind): PendulumChainState {
  const zeros = Array.from({ length: CANONICAL_CHAIN_SPECS[kind].linkCount }, () => 0);
  return { kind, anglesRad: zeros, velocitiesRadPerSec: [...zeros], tipOffsetPx: { x: 0, y: 0 } };
}

/** 초기 정지 자세(Rest Pose) 아이들러 상태를 생성한다. */
export function createInitialPuppetIdlerState(mesh: DelaunayPuppetMesh): PuppetIdlerState {
  return {
    elapsedMs: 0, prevHeadAnchorX: mesh.widthPx * 0.5, prevHeadAnchorY: mesh.heightPx * 0.78, prevAnchorVelocityX: 0,
    chains: {
      "hair-front": createZeroChainState("hair-front"),
      "hair-back": createZeroChainState("hair-back"),
      cape: createZeroChainState("cape"),
    },
  };
}

/** 반암시적 오일러(Semi-Implicit Euler) 적분으로 다절 감쇠 진자 체인을 1스텝 전진시킨다. */
export function stepPendulumChainSemiImplicitEuler(
  prevChain: PendulumChainState, dtSec: number, anchorHorizontalAccelPxPerSec2: number, prefersReducedMotion = false,
): PendulumChainState {
  if (prefersReducedMotion || dtSec <= 0 || !Number.isFinite(dtSec)) return createZeroChainState(prevChain.kind);
  const spec = CANONICAL_CHAIN_SPECS[prevChain.kind];
  const substeps = Math.max(1, Math.ceil(Math.min(dtSec, 0.25) / MAX_SUBSTEP_SEC));
  const h = Math.min(dtSec, 0.25) / substeps;
  const angles = prevChain.anglesRad.map((v) => (Number.isFinite(v) ? v : 0));
  const velocities = prevChain.velocitiesRadPerSec.map((v) => (Number.isFinite(v) ? v : 0));
  const clampedAccel = clamp(anchorHorizontalAccelPxPerSec2, -1800, 1800);

  for (let step = 0; step < substeps; step += 1) {
    for (let k = 0; k < spec.linkCount; k += 1) {
      const theta = angles[k] ?? 0, omega = velocities[k] ?? 0;
      const parentTheta = k === 0 ? 0 : (angles[k - 1] ?? 0);
      const angularAccel =
        -spec.stiffness * (1 - k * 0.16) * (theta - parentTheta) -
        spec.gravityTorque * Math.sin(theta) -
        spec.damping * omega -
        spec.inertialCoupling * (1 + k * 0.22) * clampedAccel;
      const nextOmega = clamp(omega + angularAccel * h, -12, 12);
      velocities[k] = nextOmega;
      angles[k] = clamp(theta + nextOmega * h, -spec.maxAngleRad, spec.maxAngleRad);
    }
  }

  let tipX = 0, restDepthY = 0, deformedDepthY = 0;
  for (let k = 0; k < spec.linkCount; k += 1) {
    const theta = angles[k] ?? 0;
    tipX += spec.segmentLengthPx * Math.sin(theta);
    restDepthY -= spec.segmentLengthPx;
    deformedDepthY -= spec.segmentLengthPx * Math.cos(theta);
  }
  return { kind: prevChain.kind, anglesRad: angles, velocitiesRadPerSec: velocities, tipOffsetPx: { x: tipX, y: deformedDepthY - restDepthY } };
}

function deformOctagonCage(
  cageRest: readonly PuppetPoint2D[], widthPx: number, heightPx: number, breathing: BreathingLiftSample, headTiltRad: number,
): PuppetPoint2D[] {
  const pivotX = widthPx * 0.5, neckPivotY = heightPx * 0.64;
  const ribExpandPx = breathing.diaphragmExpand * widthPx * 0.016;
  const shoulderLiftPx = breathing.shoulderLift * heightPx * 0.014;
  const cosTilt = Math.cos(headTiltRad), sinTilt = Math.sin(headTiltRad);
  return cageRest.map((pt, idx) => {
    let x = pt.x + (idx === 2 ? ribExpandPx : idx === 7 ? -ribExpandPx : 0), y = pt.y;
    if (idx >= 3 && idx <= 6) {
      y += shoulderLiftPx;
      const w = idx === 4 || idx === 5 ? 1 : 0.45;
      const c = w === 1 ? cosTilt : Math.cos(headTiltRad * w), s = w === 1 ? sinTilt : Math.sin(headTiltRad * w);
      const dx = x - pivotX, dy = y - neckPivotY;
      x = pivotX + dx * c - dy * s;
      y = neckPivotY + dx * s + dy * c;
    }
    return { x, y };
  });
}

function computeMinimumSignedAreaOnly(vertices: Float32Array, indices: Uint32Array): number {
  const triCount = Math.floor(indices.length / 3);
  let minArea = Number.POSITIVE_INFINITY;
  for (let t = 0; t < triCount; t += 1) {
    const i0 = indices[t * 3] ?? 0, i1 = indices[t * 3 + 1] ?? 0, i2 = indices[t * 3 + 2] ?? 0;
    const area = computeTriangleSignedArea2D(
      vertices[i0 * 2] ?? 0, vertices[i0 * 2 + 1] ?? 0,
      vertices[i1 * 2] ?? 0, vertices[i1 * 2 + 1] ?? 0,
      vertices[i2 * 2] ?? 0, vertices[i2 * 2 + 1] ?? 0,
    );
    if (area < minArea) minArea = area;
  }
  return triCount === 0 ? 0 : minArea;
}

/** 2D 퍼펫 메쉬의 눈 깜빡임·위상차 호흡·머리 기울기·3종 진자 물리 변형을 1프레임 갱신한다. */
export function stepPuppetMicroIdler(
  mesh: DelaunayPuppetMesh, prevState: PuppetIdlerState, input: PuppetMicroIdlerStepInput,
): PuppetMicroIdlerFrameResult {
  const safeDtMs = clamp(input.dtMs, 0, 250);
  const nextElapsedMs = prevState.elapsedMs + safeDtMs;
  if (input.prefersReducedMotion === true) {
    return {
      state: { ...createInitialPuppetIdlerState(mesh), elapsedMs: nextElapsedMs },
      deformedVertices: new Float32Array(mesh.restVertices),
      deformedCagePoints: mesh.cageRestPoints,
      blink: evaluateAsymmetricBlinkCurve(nextElapsedMs, { prefersReducedMotion: true }),
      breathing: evaluatePhaseLaggedBreathing(nextElapsedMs, { prefersReducedMotion: true }),
      appliedHeadTiltRad: 0, minSignedArea: mesh.restTopology.minSignedArea, invertedTriangleCount: 0, safetyScaleApplied: 1,
    };
  }

  const blink = evaluateAsymmetricBlinkCurve(nextElapsedMs, input.blinkOptions);
  const breathing = evaluatePhaseLaggedBreathing(nextElapsedMs, input.breathingOptions);
  const appliedHeadTiltRad = clamp(clamp(input.externalHeadTiltRad ?? 0, -0.32, 0.32) + breathing.idleHeadSwayRad, -0.35, 0.35);
  const headAnchorX = mesh.widthPx * 0.5 - Math.sin(appliedHeadTiltRad) * (mesh.heightPx * 0.14);
  const headAnchorY = mesh.heightPx * 0.78 + breathing.shoulderLift * mesh.heightPx * 0.014 + (Math.cos(appliedHeadTiltRad) - 1) * (mesh.heightPx * 0.14);

  const dtSec = Math.max(1 / 240, safeDtMs / 1000);
  const anchorVelX = (headAnchorX - prevState.prevHeadAnchorX) / dtSec;
  const anchorAccelX = (anchorVelX - prevState.prevAnchorVelocityX) / dtSec + (input.windImpulsePxPerSec2 ?? 0);

  const nextChains: Record<PendulumChainKind, PendulumChainState> = {
    "hair-front": stepPendulumChainSemiImplicitEuler(prevState.chains["hair-front"], dtSec, anchorAccelX),
    "hair-back": stepPendulumChainSemiImplicitEuler(prevState.chains["hair-back"], dtSec, anchorAccelX * 0.92),
    cape: stepPendulumChainSemiImplicitEuler(prevState.chains.cape, dtSec, anchorAccelX * 0.75),
  };

  const deformedCagePoints = deformOctagonCage(mesh.cageRestPoints, mesh.widthPx, mesh.heightPx, breathing, appliedHeadTiltRad);
  const cageCount = deformedCagePoints.length;
  const rawDisplacements = new Float32Array(mesh.vertexCount * 2);
  const eyelidMaxDropPx = mesh.heightPx * 0.022;
  const diaphragmLiftPx = breathing.diaphragmExpand * mesh.heightPx * 0.009;
  const shoulderExtraLiftPx = breathing.shoulderLift * mesh.heightPx * 0.008;

  for (let i = 0; i < mesh.vertexCount; i += 1) {
    let cageX = 0, cageY = 0;
    const weightBase = i * cageCount;
    for (let j = 0; j < cageCount; j += 1) {
      const w = mesh.cageWeights[weightBase + j] ?? 0;
      cageX += w * (deformedCagePoints[j]?.x ?? 0);
      cageY += w * (deformedCagePoints[j]?.y ?? 0);
    }
    const sw = mesh.skinWeights[i];
    let localDx = 0, localDy = 0;
    if (sw) {
      localDy += sw.diaphragm * diaphragmLiftPx + sw.shoulder * shoulderExtraLiftPx;
      localDy -= (sw.eyelidLeft * blink.leftClosure + sw.eyelidRight * blink.rightClosure) * eyelidMaxDropPx;
      const fS = sw.hairFront * (0.25 + 0.75 * sw.hairFrontArcT) * 0.35;
      const bS = sw.hairBack * (0.2 + 0.8 * sw.hairBackArcT) * 0.32;
      const cS = sw.cape * (0.18 + 0.82 * sw.capeArcT) * 0.3;
      localDx += fS * nextChains["hair-front"].tipOffsetPx.x + bS * nextChains["hair-back"].tipOffsetPx.x + cS * nextChains.cape.tipOffsetPx.x;
      localDy += fS * nextChains["hair-front"].tipOffsetPx.y + bS * nextChains["hair-back"].tipOffsetPx.y + cS * nextChains.cape.tipOffsetPx.y;
    }
    rawDisplacements[i * 2] = cageX + localDx - (mesh.restVertices[i * 2] ?? 0);
    rawDisplacements[i * 2 + 1] = cageY + localDy - (mesh.restVertices[i * 2 + 1] ?? 0);
  }

  const deformedVertices = new Float32Array(mesh.vertexCount * 2);
  const minSafeArea = Math.max(1e-3, mesh.restTopology.minSignedArea * 0.15);
  let safetyScaleApplied = 1;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    for (let k = 0; k < deformedVertices.length; k += 1) {
      deformedVertices[k] = (mesh.restVertices[k] ?? 0) + (rawDisplacements[k] ?? 0) * safetyScaleApplied;
    }
    if (computeMinimumSignedAreaOnly(deformedVertices, mesh.indices) >= minSafeArea) break;
    safetyScaleApplied *= 0.5;
  }

  const finalTopology = inspectPuppetMeshTopology(deformedVertices, mesh.indices);
  return {
    state: { elapsedMs: nextElapsedMs, prevHeadAnchorX: headAnchorX, prevHeadAnchorY: headAnchorY, prevAnchorVelocityX: anchorVelX, chains: nextChains },
    deformedVertices, deformedCagePoints, blink, breathing, appliedHeadTiltRad,
    minSignedArea: finalTopology.minSignedArea, invertedTriangleCount: finalTopology.invertedTriangleCount, safetyScaleApplied,
  };
}
