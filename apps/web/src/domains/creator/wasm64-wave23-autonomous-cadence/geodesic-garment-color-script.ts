/**
 * Wasm64 Wave 23: 측지선 등각 의복 문양 래퍼 & 60컷 에피소드 OKLCH 컬러 스크립트 조화기.
 *
 * - 굽은 소매·주름 망토·어깨 갑옷 표면의 기준점 둘레로 이산 지수 사상(Discrete Exponential Map)
 *   측지 극좌표 `(r, θ)`를 전파하여, 평면 UV 끼임(`0` pinch) 없이 문장·자수·타탄 체크를 감싼다.
 * - 회차 단위 OKLCH 컬러 스크립트 바코드 및 감정선 보존 화이트밸런스 조화기도 함께 공개한다.
 */

export {
  computePerceptualWarmth, harmonizeEpisodeColorScript, oklabToOklch, oklchToOklab,
  oklchToSrgb, srgbToOklab, srgbToOklch,
  type ColorScriptBarcodeCell, type CutSwatchSample, type EmotionalArcPhaseSummary,
  type EpisodeColorScriptHarmonizeResult, type EpisodeColorScriptOptions, type EpisodeCutInput,
  type NarrativeBeatTag, type OklabColor, type OklchColor, type PreservedIntentionalTransition,
  type SrgbColor, type WhiteBalanceOutlierFinding,
} from "./episode-oklch-color-script";

export interface Vec3 { readonly x: number; readonly y: number; readonly z: number }
export interface Vec2 { readonly u: number; readonly v: number }
export type TriangleFace = readonly [number, number, number];

export interface GarmentSurfaceMesh {
  readonly id: string;
  readonly labelKo: string;
  readonly vertices: readonly Vec3[];
  readonly triangles: readonly TriangleFace[];
}

export interface GeodesicAnchorSpec {
  readonly anchorVertexIndex?: number;
  readonly anchorPoint?: Vec3;
  readonly upHint?: Vec3;
  readonly patchRadius: number;
  readonly rotationRad?: number;
}

export interface GeodesicVertexCoord {
  readonly vertexIndex: number;
  readonly radiusMeters: number;
  readonly thetaRad: number;
  readonly localX: number;
  readonly localY: number;
  readonly uv: Vec2;
  readonly insidePatch: boolean;
}

export interface IsometricStretchMetrics {
  readonly evaluatedTriangleCount: number;
  readonly rmsIsometricError: number;
  readonly l2Stretch: number;
  readonly maxSingularStretch: number;
  readonly minSingularStretch: number;
  readonly meanAreaRatio: number;
  readonly pinchedTriangleCount: number;
}

export interface GeodesicGarmentWrapResult {
  readonly meshId: string;
  readonly anchorVertexIndex: number;
  readonly anchorPosition: Vec3;
  readonly anchorNormal: Vec3;
  readonly patchRadius: number;
  readonly vertexCoords: readonly GeodesicVertexCoord[];
  readonly patchTriangleIndices: readonly number[];
  readonly geodesicMetrics: IsometricStretchMetrics;
  readonly planarBaselineMetrics: IsometricStretchMetrics;
  readonly stretchErrorReductionRatio: number;
}

export type GarmentPatternKind = "tartan-plaid" | "royal-crest";

export interface GarmentPatternSpec {
  readonly kind: GarmentPatternKind;
  readonly pitchMeters: number;
  readonly accentLineRatio?: number;
  readonly crestPetalCount?: number;
}

export interface GarmentPatternSample {
  readonly vertexIndex: number;
  readonly primaryWeight: number;
  readonly accentWeight: number;
  readonly embroideryRelief: number;
}

const IDENTITY_STRETCH_METRICS: IsometricStretchMetrics = Object.freeze({
  evaluatedTriangleCount: 0, rmsIsometricError: 0, l2Stretch: 1,
  maxSingularStretch: 1, minSingularStretch: 1, meanAreaRatio: 1, pinchedTriangleCount: 0,
});

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const vecSub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const vecAdd = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const vecScale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const vecDot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const vecCross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x,
});
const vecLen = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const vecNormalize = (a: Vec3, fallback: Vec3 = { x: 0, y: 0, z: 1 }): Vec3 => {
  const len = vecLen(a);
  return len > 1e-9 ? vecScale(a, 1 / len) : fallback;
};

/** 두 단위 법선 사이의 최소 회전으로 접벡터를 평행 이동한다. */
function transportTangentVector(vec: Vec3, fromNormal: Vec3, toNormal: Vec3): Vec3 {
  const cosTheta = clamp(vecDot(fromNormal, toNormal), -1, 1);
  if (cosTheta > 1 - 1e-8) return vec;
  if (cosTheta < -1 + 1e-8) {
    const ref = Math.abs(fromNormal.x) < 0.8 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const axis = vecNormalize(vecCross(fromNormal, ref));
    return vecSub(vecScale(axis, 2 * vecDot(axis, vec)), vec);
  }
  const axisRaw = vecCross(fromNormal, toNormal);
  const sinTheta = vecLen(axisRaw);
  const axis = vecScale(axisRaw, 1 / sinTheta);
  return vecAdd(
    vecAdd(vecScale(vec, cosTheta), vecScale(vecCross(axis, vec), sinTheta)),
    vecScale(axis, vecDot(axis, vec) * (1 - cosTheta)),
  );
}

function buildOrthonormalTangentBasis(normal: Vec3, upHint: Vec3): { tangentU: Vec3; tangentV: Vec3 } {
  let projectedUp = vecSub(upHint, vecScale(normal, vecDot(upHint, normal)));
  if (vecLen(projectedUp) < 1e-6) {
    const alt = Math.abs(normal.y) < 0.8 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    projectedUp = vecSub(alt, vecScale(normal, vecDot(alt, normal)));
  }
  const tangentV = vecNormalize(projectedUp, { x: 0, y: 1, z: 0 });
  const tangentU = vecNormalize(vecCross(tangentV, normal), { x: 1, y: 0, z: 0 });
  return { tangentU, tangentV };
}

/** 팔꿈치 굽힘과 손목 테이퍼가 있는 3D 의복 소매 곡면 메시를 생성한다. */
export function buildCurvedSleeveSurfaceMesh(options?: {
  readonly radialSegments?: number;
  readonly axialSegments?: number;
  readonly baseRadius?: number;
  readonly wristRadius?: number;
  readonly length?: number;
  readonly bendAngleRad?: number;
}): GarmentSurfaceMesh {
  const radialSegments = Math.max(8, Math.floor(options?.radialSegments ?? 28));
  const axialSegments = Math.max(6, Math.floor(options?.axialSegments ?? 20));
  const baseRadius = options?.baseRadius ?? 0.075;
  const wristRadius = options?.wristRadius ?? 0.052;
  const length = options?.length ?? 0.44;
  const bendAngleRad = options?.bendAngleRad ?? 0.68;

  const vertices: Vec3[] = [];
  const triangles: TriangleFace[] = [];

  for (let i = 0; i <= axialSegments; i++) {
    const t = i / axialSegments;
    const radius = baseRadius + (wristRadius - baseRadius) * t;
    const phi = bendAngleRad * t;
    const spineY = Math.abs(bendAngleRad) > 1e-5 ? (length / bendAngleRad) * Math.sin(phi) : length * t;
    const spineZ = Math.abs(bendAngleRad) > 1e-5 ? (length / bendAngleRad) * (1 - Math.cos(phi)) : 0;
    const normalDir = { x: 0, y: -Math.sin(phi), z: Math.cos(phi) };

    for (let j = 0; j < radialSegments; j++) {
      const theta = (2 * Math.PI * j) / radialSegments;
      const cosT = Math.cos(theta);
      vertices.push({
        x: radius * Math.sin(theta),
        y: spineY + normalDir.y * radius * cosT,
        z: spineZ + normalDir.z * radius * cosT,
      });
    }
  }

  for (let i = 0; i < axialSegments; i++) {
    const row0 = i * radialSegments;
    const row1 = (i + 1) * radialSegments;
    for (let j = 0; j < radialSegments; j++) {
      const nextJ = (j + 1) % radialSegments;
      triangles.push([row0 + j, row0 + nextJ, row1 + nextJ], [row0 + j, row1 + nextJ, row1 + j]);
    }
  }

  return { id: "garment-curved-sleeve", labelKo: "굽은 소매 원통 곡면", vertices, triangles };
}

/** 주름 물결이 잡힌 망토 곡면 메시를 생성한다. */
export function buildDrapedCapeSurfaceMesh(options?: {
  readonly cols?: number;
  readonly rows?: number;
  readonly width?: number;
  readonly height?: number;
  readonly pleatCount?: number;
  readonly pleatDepth?: number;
}): GarmentSurfaceMesh {
  const cols = Math.max(8, Math.floor(options?.cols ?? 28));
  const rows = Math.max(8, Math.floor(options?.rows ?? 24));
  const width = options?.width ?? 0.64;
  const height = options?.height ?? 0.72;
  const pleatCount = options?.pleatCount ?? 3.5;
  const pleatDepth = options?.pleatDepth ?? 0.055;

  const vertices: Vec3[] = [];
  const triangles: TriangleFace[] = [];

  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    const y = (0.5 - v) * height;
    const drapeAmp = pleatDepth * (0.35 + 0.65 * v);
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const x = (u - 0.5) * width * (0.78 + 0.36 * v);
      const z = -0.11 * (2 * u - 1) * (2 * u - 1) + drapeAmp * Math.sin(u * Math.PI * 2 * pleatCount);
      vertices.push({ x, y, z });
    }
  }

  const stride = cols + 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i0 = r * stride + c;
      triangles.push([i0, i0 + stride, i0 + stride + 1], [i0, i0 + stride + 1, i0 + 1]);
    }
  }

  return { id: "garment-draped-cape", labelKo: "주름 망토 곡면", vertices, triangles };
}

/** 양방향 곡률을 지닌 돔 형태 어깨 갑옷(견갑) 메시를 생성한다. */
export function buildDomedPauldronSurfaceMesh(options?: {
  readonly rings?: number;
  readonly sectors?: number;
  readonly radius?: number;
  readonly maxPolarRad?: number;
}): GarmentSurfaceMesh {
  const rings = Math.max(6, Math.floor(options?.rings ?? 16));
  const sectors = Math.max(12, Math.floor(options?.sectors ?? 28));
  const radius = options?.radius ?? 0.14;
  const maxPolarRad = clamp(options?.maxPolarRad ?? 1.42, 0.3, 1.55);

  const vertices: Vec3[] = [{ x: 0, y: 0, z: radius }];
  const triangles: TriangleFace[] = [];

  for (let r = 1; r <= rings; r++) {
    const phi = (maxPolarRad * r) / rings;
    const sinP = Math.sin(phi);
    const cosP = Math.cos(phi);
    for (let s = 0; s < sectors; s++) {
      const theta = (2 * Math.PI * s) / sectors;
      vertices.push({ x: radius * sinP * Math.cos(theta), y: radius * sinP * Math.sin(theta), z: radius * cosP });
    }
  }

  for (let s = 0; s < sectors; s++) {
    triangles.push([0, 1 + s, 1 + ((s + 1) % sectors)]);
  }
  for (let r = 1; r < rings; r++) {
    const ring0 = 1 + (r - 1) * sectors;
    const ring1 = 1 + r * sectors;
    for (let s = 0; s < sectors; s++) {
      const nextS = (s + 1) % sectors;
      triangles.push([ring0 + s, ring1 + s, ring1 + nextS], [ring0 + s, ring1 + nextS, ring0 + nextS]);
    }
  }

  return { id: "garment-domed-pauldron", labelKo: "돔 어깨 갑옷 곡면", vertices, triangles };
}

class MinDistanceHeap {
  private readonly nodes: number[] = [];
  private readonly priorities: number[] = [];

  get size(): number {
    return this.nodes.length;
  }

  push(node: number, priority: number): void {
    let idx = this.nodes.length;
    this.nodes.push(node);
    this.priorities.push(priority);
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if ((this.priorities[parent] ?? Infinity) <= priority) break;
      this.nodes[idx] = this.nodes[parent]!;
      this.priorities[idx] = this.priorities[parent]!;
      idx = parent;
    }
    this.nodes[idx] = node;
    this.priorities[idx] = priority;
  }

  pop(): { node: number; priority: number } | undefined {
    const count = this.nodes.length;
    if (count === 0) return undefined;
    const topNode = this.nodes[0]!;
    const topPriority = this.priorities[0]!;
    const lastNode = this.nodes.pop()!;
    const lastPriority = this.priorities.pop()!;
    if (count > 1) {
      let idx = 0;
      const half = (count - 1) >> 1;
      while (idx < half) {
        let best = (idx << 1) + 1;
        const right = best + 1;
        if (right < count - 1 && (this.priorities[right] ?? Infinity) < (this.priorities[best] ?? Infinity)) {
          best = right;
        }
        if (lastPriority <= (this.priorities[best] ?? Infinity)) break;
        this.nodes[idx] = this.nodes[best]!;
        this.priorities[idx] = this.priorities[best]!;
        idx = best;
      }
      this.nodes[idx] = lastNode;
      this.priorities[idx] = lastPriority;
    }
    return { node: topNode, priority: topPriority };
  }
}

/** 구면파 삼각형 평면 전개를 통해 두 확정 정점(A, B)으로부터 정점 C의 정밀 측지 거리를 계산한다. */
function solveSphericalTriangleUpdate(
  posA: Vec3,
  posB: Vec3,
  posC: Vec3,
  distA: number,
  distB: number,
): number {
  const c = vecLen(vecSub(posB, posA));
  const b = vecLen(vecSub(posC, posA));
  const a = vecLen(vecSub(posC, posB));
  if (c < 1e-9 || b < 1e-9 || a < 1e-9) return Infinity;
  if (Math.abs(distA - distB) >= c) return Math.min(distA + b, distB + a);

  const xC = (b * b + c * c - a * a) / (2 * c);
  const yCSq = b * b - xC * xC;
  if (yCSq <= 1e-14) return Math.min(distA + b, distB + a);
  const yC = Math.sqrt(yCSq);

  const xS = (distA * distA - distB * distB + c * c) / (2 * c);
  const ySSq = distA * distA - xS * xS;
  if (ySSq < -1e-9) return Math.min(distA + b, distB + a);
  const yS = -Math.sqrt(Math.max(0, ySSq));

  const denom = yC - yS;
  if (denom <= 1e-12) return Math.min(distA + b, distB + a);
  const xHit = xS + (-yS / denom) * (xC - xS);
  return xHit >= -1e-7 && xHit <= c + 1e-7 ? Math.hypot(xC - xS, yC - yS) : Math.min(distA + b, distB + a);
}

function evaluateMappingStretchMetrics(
  vertices: readonly Vec3[],
  triangles: readonly TriangleFace[],
  patchTriangleIndices: readonly number[],
  mappedX: Float64Array,
  mappedY: Float64Array,
): IsometricStretchMetrics {
  if (patchTriangleIndices.length === 0) return IDENTITY_STRETCH_METRICS;

  let weightedIsoSqSum = 0;
  let weightedInvStretchSum = 0;
  let weightedAreaRatioSum = 0;
  let totalArea3d = 0;
  let maxSingular = 0;
  let minSingular = Infinity;
  let pinchedCount = 0;
  let evaluatedCount = 0;

  for (const triIdx of patchTriangleIndices) {
    const tri = triangles[triIdx];
    if (!tri) continue;
    const p0 = vertices[tri[0]];
    const p1 = vertices[tri[1]];
    const p2 = vertices[tri[2]];
    if (!p0 || !p1 || !p2) continue;

    const e1 = vecSub(p1, p0);
    const e2 = vecSub(p2, p0);
    const len1 = vecLen(e1);
    const area2 = vecLen(vecCross(e1, e2));
    if (len1 < 1e-9 || area2 < 1e-12) continue;
    const area3d = 0.5 * area2;

    const q1x = len1;
    const q2x = vecDot(e2, e1) / len1;
    const q2y = area2 / len1;

    const u0x = mappedX[tri[0]] ?? 0;
    const u0y = mappedY[tri[0]] ?? 0;
    const j00 = ((mappedX[tri[1]] ?? 0) - u0x) / q1x;
    const j10 = ((mappedY[tri[1]] ?? 0) - u0y) / q1x;
    const j01 = ((mappedX[tri[2]] ?? 0) - u0x - j00 * q2x) / q2y;
    const j11 = ((mappedY[tri[2]] ?? 0) - u0y - j10 * q2x) / q2y;

    const detJ = j00 * j11 - j01 * j10;
    const frobSq = j00 * j00 + j01 * j01 + j10 * j10 + j11 * j11;
    const disc = Math.sqrt(Math.max(0, frobSq * frobSq - 4 * detJ * detJ));
    const sigmaMax = Math.sqrt(Math.max(0, 0.5 * (frobSq + disc)));
    const sigmaMin = detJ > 0 ? Math.sqrt(Math.max(0, 0.5 * (frobSq - disc))) : 0;

    if (detJ <= 0.05 || sigmaMin <= 0.18) pinchedCount += 1;

    const isoErrSq = 0.5 * ((sigmaMax - 1) * (sigmaMax - 1) + (sigmaMin - 1) * (sigmaMin - 1));
    const safeMin = Math.max(sigmaMin, 1e-3);
    const safeMax = Math.max(sigmaMax, 1e-3);
    weightedIsoSqSum += area3d * isoErrSq;
    weightedInvStretchSum += area3d * 0.5 * (1 / (safeMax * safeMax) + 1 / (safeMin * safeMin));
    weightedAreaRatioSum += area3d * Math.abs(detJ);
    totalArea3d += area3d;
    if (sigmaMax > maxSingular) maxSingular = sigmaMax;
    if (sigmaMin < minSingular) minSingular = sigmaMin;
    evaluatedCount += 1;
  }

  if (totalArea3d <= 1e-12 || evaluatedCount === 0) return IDENTITY_STRETCH_METRICS;

  return {
    evaluatedTriangleCount: evaluatedCount,
    rmsIsometricError: Math.sqrt(weightedIsoSqSum / totalArea3d),
    l2Stretch: Math.sqrt(weightedInvStretchSum / totalArea3d),
    maxSingularStretch: maxSingular,
    minSingularStretch: minSingular === Infinity ? 1 : minSingular,
    meanAreaRatio: weightedAreaRatioSum / totalArea3d,
    pinchedTriangleCount: pinchedCount,
  };
}

/**
 * 곡면 의복 메시의 기준점 둘레로 이산 지수 사상 `(r, θ)`를 전파하고,
 * 평면 투영 대비 등거리 왜곡 감소율과 무끼임(`0` pinch) 지표를 산출한다.
 */
export function computeGeodesicGarmentWrap(
  mesh: GarmentSurfaceMesh,
  spec: GeodesicAnchorSpec,
): GeodesicGarmentWrapResult {
  const vertexCount = mesh.vertices.length;
  if (vertexCount === 0) throw new Error("의복 표면 메시에 정점이 비어 있습니다.");

  const patchRadius = Math.max(1e-4, spec.patchRadius);
  const rotationRad = spec.rotationRad ?? 0;

  let anchorIdx = 0;
  if (spec.anchorVertexIndex !== undefined) {
    anchorIdx = clamp(Math.floor(spec.anchorVertexIndex), 0, vertexCount - 1);
  } else {
    let target = spec.anchorPoint;
    if (!target) {
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (const v of mesh.vertices) {
        sx += v.x;
        sy += v.y;
        sz += v.z;
      }
      target = { x: sx / vertexCount, y: sy / vertexCount, z: sz / vertexCount };
    }
    let bestDistSq = Infinity;
    for (let i = 0; i < vertexCount; i++) {
      const d = vecSub(mesh.vertices[i]!, target);
      const dSq = vecDot(d, d);
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        anchorIdx = i;
      }
    }
  }

  const normalAccum: Vec3[] = Array.from({ length: vertexCount }, () => ({ x: 0, y: 0, z: 0 }));
  const neighbors: Set<number>[] = Array.from({ length: vertexCount }, () => new Set<number>());
  const edgeThirdVertices = new Map<string, number[]>();
  const registerCorner = (u: number, w: number, opposite: number): void => {
    const key = u < w ? `${u}:${w}` : `${w}:${u}`;
    let list = edgeThirdVertices.get(key);
    if (!list) {
      list = [];
      edgeThirdVertices.set(key, list);
    }
    list.push(opposite);
  };

  for (const [i0, i1, i2] of mesh.triangles) {
    const p0 = mesh.vertices[i0];
    const p1 = mesh.vertices[i1];
    const p2 = mesh.vertices[i2];
    if (!p0 || !p1 || !p2) continue;
    const faceN = vecCross(vecSub(p1, p0), vecSub(p2, p0));
    normalAccum[i0] = vecAdd(normalAccum[i0]!, faceN);
    normalAccum[i1] = vecAdd(normalAccum[i1]!, faceN);
    normalAccum[i2] = vecAdd(normalAccum[i2]!, faceN);
    neighbors[i0]!.add(i1).add(i2);
    neighbors[i1]!.add(i0).add(i2);
    neighbors[i2]!.add(i0).add(i1);
    registerCorner(i0, i1, i2);
    registerCorner(i1, i2, i0);
    registerCorner(i2, i0, i1);
  }

  const normals: Vec3[] = normalAccum.map((n) => vecNormalize(n));
  const anchorNormal = normals[anchorIdx]!;
  const anchorPos = mesh.vertices[anchorIdx]!;
  const { tangentU: baseU, tangentV: baseV } = buildOrthonormalTangentBasis(
    anchorNormal,
    spec.upHint ?? { x: 0, y: 1, z: 0 },
  );

  const state = new Uint8Array(vertexCount);
  const dist = new Float64Array(vertexCount).fill(Infinity);
  const expX = new Float64Array(vertexCount);
  const expY = new Float64Array(vertexCount);
  const framesU: Vec3[] = Array.from({ length: vertexCount }, () => baseU);
  const framesV: Vec3[] = Array.from({ length: vertexCount }, () => baseV);

  dist[anchorIdx] = 0;
  const heap = new MinDistanceHeap();
  heap.push(anchorIdx, 0);

  while (heap.size > 0) {
    const popped = heap.pop();
    if (!popped) break;
    const u = popped.node;
    if (state[u] === 2) continue;
    state[u] = 2;

    if (u !== anchorIdx) {
      const posU = mesh.vertices[u]!;
      const normU = normals[u]!;
      let sumX = 0;
      let sumY = 0;
      let sumW = 0;
      let sumFrameU: Vec3 = { x: 0, y: 0, z: 0 };

      for (const p of neighbors[u]!) {
        if (state[p] !== 2 || dist[p]! > dist[u]!) continue;
        const normP = normals[p]!;
        const chord = vecSub(posU, mesh.vertices[p]!);
        const chordLen = vecLen(chord);
        if (chordLen < 1e-9) continue;

        const projP = vecSub(chord, vecScale(normP, vecDot(chord, normP)));
        const projLen = vecLen(projP);
        const stepScale = projLen > 1e-9 ? chordLen / projLen : 0;
        const dx = vecDot(projP, framesU[p]!) * stepScale;
        const dy = vecDot(projP, framesV[p]!) * stepScale;

        const w = 1 / (chordLen + 1e-5);
        sumX += w * ((expX[p] ?? 0) + dx);
        sumY += w * ((expY[p] ?? 0) + dy);
        sumW += w;
        sumFrameU = vecAdd(sumFrameU, vecScale(transportTangentVector(framesU[p]!, normP, normU), w));
      }

      if (sumW > 0) {
        const avgX = sumX / sumW;
        const avgY = sumY / sumW;
        const avgR = Math.hypot(avgX, avgY);
        if (avgR > 1e-9) {
          const rScale = dist[u]! / avgR;
          expX[u] = avgX * rScale;
          expY[u] = avgY * rScale;
        }
        const orthoU = vecNormalize(vecSub(sumFrameU, vecScale(normU, vecDot(sumFrameU, normU))), baseU);
        framesU[u] = orthoU;
        framesV[u] = vecNormalize(vecCross(normU, orthoU));
      }
    }

    const posU = mesh.vertices[u]!;
    for (const w of neighbors[u]!) {
      if (state[w] === 2) continue;
      const posW = mesh.vertices[w]!;
      let candidate = dist[u]! + vecLen(vecSub(posW, posU));
      const opposites = edgeThirdVertices.get(u < w ? `${u}:${w}` : `${w}:${u}`);
      if (opposites) {
        for (const k of opposites) {
          if (state[k] === 2) {
            const triDist = solveSphericalTriangleUpdate(posU, mesh.vertices[k]!, posW, dist[u]!, dist[k]!);
            if (triDist < candidate) candidate = triDist;
          }
        }
      }
      if (candidate < dist[w]!) {
        dist[w] = candidate;
        state[w] = 1;
        heap.push(w, candidate);
      }
    }
  }

  const cosRot = Math.cos(rotationRad);
  const sinRot = Math.sin(rotationRad);
  const rotTangentU = vecAdd(vecScale(baseU, cosRot), vecScale(baseV, -sinRot));
  const rotTangentV = vecAdd(vecScale(baseU, sinRot), vecScale(baseV, cosRot));

  const geodesicLocalX = new Float64Array(vertexCount);
  const geodesicLocalY = new Float64Array(vertexCount);
  const planarLocalX = new Float64Array(vertexCount);
  const planarLocalY = new Float64Array(vertexCount);
  const vertexCoords: GeodesicVertexCoord[] = [];

  for (let i = 0; i < vertexCount; i++) {
    const r = dist[i]!;
    const lx = (expX[i] ?? 0) * cosRot - (expY[i] ?? 0) * sinRot;
    const ly = (expX[i] ?? 0) * sinRot + (expY[i] ?? 0) * cosRot;
    geodesicLocalX[i] = lx;
    geodesicLocalY[i] = ly;

    const rel = vecSub(mesh.vertices[i]!, anchorPos);
    planarLocalX[i] = vecDot(rel, rotTangentU);
    planarLocalY[i] = vecDot(rel, rotTangentV);

    vertexCoords.push({
      vertexIndex: i,
      radiusMeters: r,
      thetaRad: Math.atan2(ly, lx),
      localX: lx,
      localY: ly,
      uv: { u: 0.5 + lx / (2 * patchRadius), v: 0.5 + ly / (2 * patchRadius) },
      insidePatch: r <= patchRadius,
    });
  }

  const patchTriangleIndices: number[] = [];
  for (let t = 0; t < mesh.triangles.length; t++) {
    const [i0, i1, i2] = mesh.triangles[t]!;
    if (dist[i0]! <= patchRadius && dist[i1]! <= patchRadius && dist[i2]! <= patchRadius) {
      patchTriangleIndices.push(t);
    }
  }

  const geodesicMetrics = evaluateMappingStretchMetrics(
    mesh.vertices, mesh.triangles, patchTriangleIndices, geodesicLocalX, geodesicLocalY,
  );
  const planarBaselineMetrics = evaluateMappingStretchMetrics(
    mesh.vertices, mesh.triangles, patchTriangleIndices, planarLocalX, planarLocalY,
  );
  const stretchErrorReductionRatio =
    planarBaselineMetrics.rmsIsometricError > 1e-6
      ? clamp(1 - geodesicMetrics.rmsIsometricError / planarBaselineMetrics.rmsIsometricError, -1, 1)
      : 0;

  return {
    meshId: mesh.id,
    anchorVertexIndex: anchorIdx,
    anchorPosition: anchorPos,
    anchorNormal,
    patchRadius,
    vertexCoords,
    patchTriangleIndices,
    geodesicMetrics,
    planarBaselineMetrics,
    stretchErrorReductionRatio,
  };
}

/** 계산된 측지 극좌표 위에 타탄 체크 또는 기사단 문장 자수 밀도를 샘플링한다. */
export function sampleGarmentPatternOnWrap(
  wrap: GeodesicGarmentWrapResult,
  pattern: GarmentPatternSpec,
): readonly GarmentPatternSample[] {
  const pitch = Math.max(1e-3, pattern.pitchMeters);
  const accentRatio = clamp(pattern.accentLineRatio ?? 0.08, 0.02, 0.35);
  const petals = Math.max(3, Math.floor(pattern.crestPetalCount ?? 8));
  const samples: GarmentPatternSample[] = [];

  for (const coord of wrap.vertexCoords) {
    if (!coord.insidePatch) continue;
    if (pattern.kind === "tartan-plaid") {
      const fx = ((coord.localX / pitch) % 1 + 1) % 1;
      const fy = ((coord.localY / pitch) % 1 + 1) % 1;
      const warpBand = fx < 0.42 ? 1 : 0;
      const weftBand = fy < 0.42 ? 1 : 0;
      const twill = (((coord.localX + coord.localY) / (pitch * 0.12)) % 1 + 1) % 1 < 0.5 ? 0.88 : 0.62;
      const primaryWeight = clamp(0.5 * (warpBand + weftBand) * twill, 0, 1);
      const accentWeight = Math.abs(fx - 0.71) < accentRatio * 0.5 || Math.abs(fy - 0.71) < accentRatio * 0.5 ? 1 : 0;
      samples.push({
        vertexIndex: coord.vertexIndex,
        primaryWeight,
        accentWeight,
        embroideryRelief: accentWeight > 0 ? 0.35 : primaryWeight * 0.18,
      });
    } else {
      const normR = coord.radiusMeters / wrap.patchRadius;
      const outerRing = Math.abs(normR - 0.86) < 0.07 ? 1 : 0;
      const roseBound = 0.46 + 0.22 * Math.cos(petals * coord.thetaRad);
      const innerCrest = normR <= roseBound ? 1 : 0;
      const accentWeight = Math.abs(normR - roseBound) < 0.055 ? 1 : outerRing;
      samples.push({
        vertexIndex: coord.vertexIndex,
        primaryWeight: Math.max(outerRing, innerCrest),
        accentWeight,
        embroideryRelief: accentWeight > 0 ? 0.92 : innerCrest * 0.55,
      });
    }
  }
  return samples;
}
