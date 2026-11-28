/**
 * Wave 113 — 3D 배경 NPR 웹툰 선화 추출기(실루엣·크리즈·재질 경계선) 및
 * 핀홀 투영 기반 원근 보정 은선 제거(HLR) · 깊이 가중 손그림 필압 감쇠 솔버.
 */

import {
  clamp,
  cross3,
  dot3,
  length3,
  lerp3,
  normalize3,
  sanitizeRgb,
  sub3,
  type BackgroundMesh3d,
  type BackgroundPresetId,
  type NprEdgeClass,
  type PinholeCamera3d,
  type RgbLinear,
  type Vec2,
  type Vec3,
  type VisibleNprEdgeClass,
} from "./background-presets-and-math";

export {
  add3,
  clamp,
  createParametricBackgroundPreset,
  cross3,
  dot3,
  length3,
  lerp3,
  normalize3,
  scale3,
  sub3,
  type BackgroundFaceInput,
  type BackgroundMesh3d,
  type BackgroundPresetId,
  type NprEdgeClass,
  type PinholeCamera3d,
  type RgbLinear,
  type Vec2,
  type Vec3,
  type VisibleNprEdgeClass,
} from "./background-presets-and-math";

export interface CameraBasis3d {
  readonly eye: Vec3;
  readonly target: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
  readonly forward: Vec3;
  readonly fovYDeg: number;
  readonly focalLengthPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly nearPlaneMeters: number;
  readonly farPlaneMeters: number;
}

export interface ScreenBbox2d {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export interface ProjectedTriangle2d {
  readonly triIndex: number;
  readonly sourceFaceIndex: number;
  readonly materialId: string;
  readonly surfaceTag: string;
  readonly albedoRgb: RgbLinear;
  readonly worldVertices: readonly [Vec3, Vec3, Vec3];
  readonly worldCentroid: Vec3;
  readonly worldNormal: Vec3;
  readonly areaSqMeters: number;
  readonly screenVertices: readonly [Vec2, Vec2, Vec2];
  readonly depthsMeters: readonly [number, number, number];
  readonly meanDepthMeters: number;
  readonly isFrontFacing: boolean;
  readonly inFrustum: boolean;
  readonly bbox: ScreenBbox2d;
}

export interface ProjectedMesh3dResult {
  readonly meshId: string;
  readonly labelKo: string;
  readonly presetId?: BackgroundPresetId;
  readonly camera: CameraBasis3d;
  readonly triangles: readonly ProjectedTriangle2d[];
  readonly frontTriangleCount: number;
  readonly backTriangleCount: number;
  readonly minFrontDepthMeters: number;
  readonly maxFrontDepthMeters: number;
}

export interface VisibleNprLineSegment {
  readonly id: string;
  readonly edgeClass: VisibleNprEdgeClass;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly depthStartMeters: number;
  readonly depthEndMeters: number;
  readonly meanDepthMeters: number;
  readonly widthStartPx: number;
  readonly widthMidPx: number;
  readonly widthEndPx: number;
  readonly inkLightness: number;
  readonly inkOpacity: number;
  readonly dihedralDeg: number;
  readonly materialPair: readonly [string, string];
  readonly organicJitterPx: number;
}

export interface NprExtractionOptions {
  readonly creaseAngleDeg?: number;
  readonly hlrSubdivisions?: number;
  readonly hlrDepthBiasMeters?: number;
  readonly nearLineWidthPx?: number;
  readonly farLineWidthPx?: number;
  readonly silhouetteWeightMultiplier?: number;
  readonly creaseWeightMultiplier?: number;
  readonly materialSeamWeightMultiplier?: number;
  readonly organicJitterScale?: number;
  readonly seed?: number;
  readonly enableHlr?: boolean;
}

export interface NprEdgeCountSummary {
  readonly totalUniqueEdges: number;
  readonly silhouetteBoundaryEdges: number;
  readonly hardCreaseEdges: number;
  readonly materialSeamEdges: number;
  readonly smoothInteriorSuppressed: number;
  readonly diagonalClutterCount: number;
  readonly candidateEdgeCount: number;
  readonly totalSamplesTested: number;
  readonly occludedSampleCount: number;
  readonly hiddenSegmentCount: number;
  readonly visibleSegmentCount: number;
}

export interface NprDepthAttenuationSummary {
  readonly nearThresholdMeters: number;
  readonly farThresholdMeters: number;
  readonly meanNearLineWidthPx: number;
  readonly meanFarLineWidthPx: number;
  readonly nearToFarWidthRatio: number;
}

export interface NprExtractionResult {
  readonly meshId: string;
  readonly labelKo: string;
  readonly presetId?: BackgroundPresetId;
  readonly projection: ProjectedMesh3dResult;
  readonly segments: readonly VisibleNprLineSegment[];
  readonly counts: NprEdgeCountSummary;
  readonly depthAttenuation: NprDepthAttenuationSummary;
  readonly optionsUsed: Required<NprExtractionOptions>;
}

const DEFAULT_NPR_OPTIONS: Required<NprExtractionOptions> = {
  creaseAngleDeg: 35,
  hlrSubdivisions: 14,
  hlrDepthBiasMeters: 0.012,
  nearLineWidthPx: 3.1,
  farLineWidthPx: 0.85,
  silhouetteWeightMultiplier: 1.35,
  creaseWeightMultiplier: 1.0,
  materialSeamWeightMultiplier: 0.78,
  organicJitterScale: 0.32,
  seed: 11301,
  enableHlr: true,
};

/** 3D 좌표를 0.1mm 해상도로 양자화해 정점 인덱스 분할 여부와 무관하게 공유 모서리를 매칭한다. */
function quantizedVertexKey(v: Vec3): string {
  const qx = Math.round(v[0] * 10000);
  const qy = Math.round(v[1] * 10000);
  const qz = Math.round(v[2] * 10000);
  return `${qx === 0 ? 0 : qx},${qy === 0 ? 0 : qy},${qz === 0 ? 0 : qz}`;
}

function canonicalEdgeKey(a: Vec3, b: Vec3): string {
  const ka = quantizedVertexKey(a);
  const kb = quantizedVertexKey(b);
  return ka <= kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

function hashStringU32(text: string, seed: number): number {
  let h = (seed ^ 0x811c9dc5) >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function seededUnitFloat(hashU32: number, salt: number): number {
  let x = (hashU32 ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** 핀홀 3D 카메라의 직교 기저(right, up, forward)와 픽셀 초점 거리를 계산한다. */
export function buildCameraBasis3d(camera: PinholeCamera3d): CameraBasis3d {
  const widthPx = Math.max(64, Math.round(Number.isFinite(camera.widthPx) ? camera.widthPx : 960));
  const heightPx = Math.max(64, Math.round(Number.isFinite(camera.heightPx) ? camera.heightPx : 540));
  const fovYDeg = clamp(camera.fovYDeg, 15, 130);
  const nearPlaneMeters = clamp(camera.nearPlaneMeters ?? 0.1, 0.02, 5);
  const farPlaneMeters = Math.max(nearPlaneMeters + 1, clamp(camera.farPlaneMeters ?? 120, 2, 500));

  const forward = normalize3(sub3(camera.target, camera.eye), [0, 0, -1]);
  const rawUp = camera.up ?? [0, 1, 0];
  const refUp = Math.abs(dot3(forward, normalize3(rawUp, [0, 1, 0]))) > 0.995 ? ([0, 0, -1] as Vec3) : rawUp;
  const right = normalize3(cross3(forward, refUp), [1, 0, 0]);
  const up = normalize3(cross3(right, forward), [0, 1, 0]);
  const focalLengthPx = (heightPx * 0.5) / Math.tan(((fovYDeg * Math.PI) / 180) * 0.5);

  return {
    eye: camera.eye,
    target: camera.target,
    right,
    up,
    forward,
    fovYDeg,
    focalLengthPx,
    widthPx,
    heightPx,
    nearPlaneMeters,
    farPlaneMeters,
  };
}

interface ProjectedPoint {
  readonly x: number;
  readonly y: number;
  readonly depthMeters: number;
}

function projectWorldPoint(basis: CameraBasis3d, p: Vec3): ProjectedPoint {
  const rel = sub3(p, basis.eye);
  const cx = dot3(rel, basis.right);
  const cy = dot3(rel, basis.up);
  const cz = dot3(rel, basis.forward);
  const safeZ = cz > basis.nearPlaneMeters ? cz : basis.nearPlaneMeters;
  return {
    x: basis.widthPx * 0.5 + (cx / safeZ) * basis.focalLengthPx,
    y: basis.heightPx * 0.5 - (cy / safeZ) * basis.focalLengthPx,
    depthMeters: cz,
  };
}

function clipSegmentToNearPlane(
  basis: CameraBasis3d,
  p0: Vec3,
  p1: Vec3,
): readonly [Vec3, Vec3] | null {
  const z0 = dot3(sub3(p0, basis.eye), basis.forward);
  const z1 = dot3(sub3(p1, basis.eye), basis.forward);
  const nearZ = basis.nearPlaneMeters;
  if (z0 < nearZ && z1 < nearZ) return null;
  if (z0 >= nearZ && z1 >= nearZ) return [p0, p1];
  const denom = z1 - z0;
  if (Math.abs(denom) <= 1e-9) return null;
  const clipped = lerp3(p0, p1, clamp((nearZ - z0) / denom, 0, 1));
  return z0 < nearZ ? [clipped, p1] : [p0, clipped];
}

/**
 * 3D 배경 메쉬의 모든 면을 삼각화하고 핀홀 카메라로 투영해
 * 정면/후면 판정(`dot(faceNormal, toCamera) > 0`), 깊이, 2D 경계 상자를 계산한다.
 */
export function projectMesh3dToCamera(
  mesh: BackgroundMesh3d,
  cameraInput?: PinholeCamera3d,
): ProjectedMesh3dResult {
  const camera = buildCameraBasis3d(
    cameraInput ??
      mesh.defaultCamera ?? {
        eye: [0, 1.6, 4.5],
        target: [0, 1.2, 0],
        fovYDeg: 52,
        widthPx: 960,
        heightPx: 540,
      },
  );

  const triangles: ProjectedTriangle2d[] = [];
  let frontTriangleCount = 0;
  let backTriangleCount = 0;
  let minFrontDepth = Number.POSITIVE_INFINITY;
  let maxFrontDepth = 0;

  for (let fi = 0; fi < mesh.faces.length; fi++) {
    const face = mesh.faces[fi];
    const indices = face.vertexIndices;
    if (indices.length < 3) continue;
    const albedoRgb = sanitizeRgb(face.albedoRgb);
    const surfaceTag = face.surfaceTag ?? face.materialId;

    for (let k = 1; k < indices.length - 1; k++) {
      const v0 = mesh.vertices[indices[0]];
      const v1 = mesh.vertices[indices[k]];
      const v2 = mesh.vertices[indices[k + 1]];
      if (!v0 || !v1 || !v2) continue;

      const rawNormal = cross3(sub3(v1, v0), sub3(v2, v0));
      const rawLen = length3(rawNormal);
      if (!Number.isFinite(rawLen) || rawLen <= 1e-8) continue;

      const worldNormal: Vec3 = [rawNormal[0] / rawLen, rawNormal[1] / rawLen, rawNormal[2] / rawLen];
      const worldCentroid: Vec3 = [
        (v0[0] + v1[0] + v2[0]) / 3,
        (v0[1] + v1[1] + v2[1]) / 3,
        (v0[2] + v1[2] + v2[2]) / 3,
      ];

      const toCamera = normalize3(sub3(camera.eye, worldCentroid), [0, 0, 1]);
      const p0 = projectWorldPoint(camera, v0);
      const p1 = projectWorldPoint(camera, v1);
      const p2 = projectWorldPoint(camera, v2);
      const allInFront =
        p0.depthMeters >= camera.nearPlaneMeters &&
        p1.depthMeters >= camera.nearPlaneMeters &&
        p2.depthMeters >= camera.nearPlaneMeters;
      const isFrontFacing = allInFront && dot3(worldNormal, toCamera) > 1e-6;
      const meanDepthMeters = (p0.depthMeters + p1.depthMeters + p2.depthMeters) / 3;
      const minX = Math.min(p0.x, p1.x, p2.x);
      const maxX = Math.max(p0.x, p1.x, p2.x);
      const minY = Math.min(p0.y, p1.y, p2.y);
      const maxY = Math.max(p0.y, p1.y, p2.y);
      const inFrustum =
        allInFront &&
        maxX >= 0 &&
        minX <= camera.widthPx &&
        maxY >= 0 &&
        minY <= camera.heightPx &&
        meanDepthMeters <= camera.farPlaneMeters;

      if (isFrontFacing) {
        frontTriangleCount += 1;
        if (meanDepthMeters < minFrontDepth) minFrontDepth = meanDepthMeters;
        if (meanDepthMeters > maxFrontDepth) maxFrontDepth = meanDepthMeters;
      } else {
        backTriangleCount += 1;
      }

      triangles.push({
        triIndex: triangles.length,
        sourceFaceIndex: fi,
        materialId: face.materialId,
        surfaceTag,
        albedoRgb,
        worldVertices: [v0, v1, v2],
        worldCentroid,
        worldNormal,
        areaSqMeters: rawLen * 0.5,
        screenVertices: [[p0.x, p0.y], [p1.x, p1.y], [p2.x, p2.y]],
        depthsMeters: [p0.depthMeters, p1.depthMeters, p2.depthMeters],
        meanDepthMeters,
        isFrontFacing,
        inFrustum,
        bbox: { minX, maxX, minY, maxY },
      });
    }
  }

  return {
    meshId: mesh.id,
    labelKo: mesh.labelKo,
    presetId: mesh.presetId,
    camera,
    triangles,
    frontTriangleCount,
    backTriangleCount,
    minFrontDepthMeters: Number.isFinite(minFrontDepth) ? minFrontDepth : 0,
    maxFrontDepthMeters: maxFrontDepth,
  };
}

interface EdgeAdjacencyRecord {
  readonly key: string;
  readonly p0: Vec3;
  readonly p1: Vec3;
  readonly incidentTris: ProjectedTriangle2d[];
}

function classifyAdjacencyEdge(
  record: EdgeAdjacencyRecord,
  creaseAngleDeg: number,
): {
  readonly edgeClass: NprEdgeClass | "back-culled";
  readonly dihedralDeg: number;
  readonly materialPair: readonly [string, string];
} {
  const frontFaces: ProjectedTriangle2d[] = [];
  const backFaces: ProjectedTriangle2d[] = [];
  for (const tri of record.incidentTris) {
    if (tri.isFrontFacing) frontFaces.push(tri);
    else backFaces.push(tri);
  }
  if (frontFaces.length === 0) return { edgeClass: "back-culled", dihedralDeg: 0, materialPair: ["", ""] };

  const firstMat = frontFaces[0].materialId;
  const secondMat = frontFaces[1]?.materialId ?? backFaces[0]?.materialId ?? firstMat;
  if (frontFaces.length === 1) {
    let dihedralDeg = 0;
    if (backFaces.length > 0) {
      dihedralDeg = (Math.acos(clamp(dot3(frontFaces[0].worldNormal, backFaces[0].worldNormal), -1, 1)) * 180) / Math.PI;
    }
    return { edgeClass: "silhouette-boundary", dihedralDeg, materialPair: [firstMat, secondMat] };
  }

  let maxDihedralDeg = 0;
  let hasMaterialSeam = false;
  let seamMatB = firstMat;
  for (let i = 0; i < frontFaces.length; i++) {
    for (let j = i + 1; j < frontFaces.length; j++) {
      const deg = (Math.acos(clamp(dot3(frontFaces[i].worldNormal, frontFaces[j].worldNormal), -1, 1)) * 180) / Math.PI;
      if (deg > maxDihedralDeg) maxDihedralDeg = deg;
      if (frontFaces[i].materialId !== frontFaces[j].materialId) {
        hasMaterialSeam = true;
        seamMatB = frontFaces[j].materialId;
      }
    }
  }

  if (backFaces.length > 0) return { edgeClass: "silhouette-boundary", dihedralDeg: maxDihedralDeg, materialPair: [firstMat, seamMatB] };
  if (maxDihedralDeg >= creaseAngleDeg) return { edgeClass: "hard-crease", dihedralDeg: maxDihedralDeg, materialPair: [firstMat, seamMatB] };
  if (hasMaterialSeam) return { edgeClass: "material-seam", dihedralDeg: maxDihedralDeg, materialPair: [firstMat, seamMatB] };
  return { edgeClass: "smooth-interior", dihedralDeg: maxDihedralDeg, materialPair: [firstMat, firstMat] };
}

/** 화면 좌표 (px, py)가 투영 삼각형 내부에 있고 원근 보정 깊이가 샘플보다 앞에 있는지 검사한다. */
function isSampleOccludedByTriangle(
  px: number,
  py: number,
  sampleDepthMeters: number,
  tri: ProjectedTriangle2d,
  depthBiasMeters: number,
): boolean {
  if (px < tri.bbox.minX - 1e-4 || px > tri.bbox.maxX + 1e-4 || py < tri.bbox.minY - 1e-4 || py > tri.bbox.maxY + 1e-4) {
    return false;
  }
  const [a, b, c] = tri.screenVertices;
  const denom = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(denom) <= 1e-7) return false;
  const w0 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / denom;
  const w1 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / denom;
  const w2 = 1 - w0 - w1;
  if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) return false;

  const [z0, z1, z2] = tri.depthsMeters;
  const invZ = w0 / Math.max(z0, 1e-4) + w1 / Math.max(z1, 1e-4) + w2 / Math.max(z2, 1e-4);
  if (invZ <= 1e-9) return false;
  return 1 / invZ + depthBiasMeters < sampleDepthMeters;
}

function resolveNprOptions(options?: NprExtractionOptions): Required<NprExtractionOptions> {
  return {
    creaseAngleDeg: clamp(options?.creaseAngleDeg ?? DEFAULT_NPR_OPTIONS.creaseAngleDeg, 1, 179),
    hlrSubdivisions: Math.round(clamp(options?.hlrSubdivisions ?? DEFAULT_NPR_OPTIONS.hlrSubdivisions, 4, 32)),
    hlrDepthBiasMeters: clamp(options?.hlrDepthBiasMeters ?? DEFAULT_NPR_OPTIONS.hlrDepthBiasMeters, 0.0005, 0.25),
    nearLineWidthPx: clamp(options?.nearLineWidthPx ?? DEFAULT_NPR_OPTIONS.nearLineWidthPx, 0.5, 12),
    farLineWidthPx: clamp(options?.farLineWidthPx ?? DEFAULT_NPR_OPTIONS.farLineWidthPx, 0.25, 8),
    silhouetteWeightMultiplier: clamp(options?.silhouetteWeightMultiplier ?? DEFAULT_NPR_OPTIONS.silhouetteWeightMultiplier, 0.5, 3),
    creaseWeightMultiplier: clamp(options?.creaseWeightMultiplier ?? DEFAULT_NPR_OPTIONS.creaseWeightMultiplier, 0.4, 2.5),
    materialSeamWeightMultiplier: clamp(options?.materialSeamWeightMultiplier ?? DEFAULT_NPR_OPTIONS.materialSeamWeightMultiplier, 0.3, 2),
    organicJitterScale: clamp(options?.organicJitterScale ?? DEFAULT_NPR_OPTIONS.organicJitterScale, 0, 2),
    seed: Math.floor(Number.isFinite(options?.seed) ? (options?.seed ?? 11301) : 11301),
    enableHlr: options?.enableHlr ?? DEFAULT_NPR_OPTIONS.enableHlr,
  };
}

/**
 * 3D 메쉬에서 공유 하프에지 인접 그래프를 구성해 실루엣·하드 크리즈·재질 경계선만 선별하고,
 * 공면 삼각화 대각선(`smooth-interior`)을 완전히 제거한 뒤 원근 보정 은선 제거(HLR)와
 * 근경-원경 손그림 필압 감쇠를 적용한다.
 */
export function extract3dBackgroundNprLines(
  mesh: BackgroundMesh3d,
  cameraInput?: PinholeCamera3d,
  options?: NprExtractionOptions,
): NprExtractionResult {
  const opts = resolveNprOptions(options);
  const projection = projectMesh3dToCamera(mesh, cameraInput);
  const edgeMap = new Map<string, EdgeAdjacencyRecord>();

  for (const tri of projection.triangles) {
    const [v0, v1, v2] = tri.worldVertices;
    const pairs: readonly [Vec3, Vec3][] = [[v0, v1], [v1, v2], [v2, v0]];
    for (const [va, vb] of pairs) {
      const key = canonicalEdgeKey(va, vb);
      const existing = edgeMap.get(key);
      if (existing) existing.incidentTris.push(tri);
      else edgeMap.set(key, { key, p0: va, p1: vb, incidentTris: [tri] });
    }
  }

  const frontTriangles = projection.triangles.filter((t) => t.isFrontFacing);
  const minDepth = projection.minFrontDepthMeters;
  const maxDepth = Math.max(projection.maxFrontDepthMeters, minDepth + 0.5);
  const depthSpan = Math.max(maxDepth - minDepth, 0.5);

  let silhouetteBoundaryEdges = 0;
  let hardCreaseEdges = 0;
  let materialSeamEdges = 0;
  let smoothInteriorSuppressed = 0;
  let candidateEdgeCount = 0;
  let totalSamplesTested = 0;
  let occludedSampleCount = 0;
  let hiddenSegmentCount = 0;
  const segments: VisibleNprLineSegment[] = [];

  for (const key of Array.from(edgeMap.keys()).sort()) {
    const record = edgeMap.get(key);
    if (!record) continue;
    const classified = classifyAdjacencyEdge(record, opts.creaseAngleDeg);
    if (classified.edgeClass === "back-culled") continue;
    if (classified.edgeClass === "smooth-interior") {
      smoothInteriorSuppressed += 1;
      continue;
    }

    candidateEdgeCount += 1;
    if (classified.edgeClass === "silhouette-boundary") silhouetteBoundaryEdges += 1;
    else if (classified.edgeClass === "hard-crease") hardCreaseEdges += 1;
    else materialSeamEdges += 1;

    const clipped = clipSegmentToNearPlane(projection.camera, record.p0, record.p1);
    if (!clipped) continue;
    const [cp0, cp1] = clipped;
    const incidentIds = new Set<number>(record.incidentTris.map((t) => t.triIndex));
    const subCount = opts.hlrSubdivisions;
    const sampleVisible: boolean[] = new Array<boolean>(subCount);

    for (let s = 0; s < subCount; s++) {
      const projMid = projectWorldPoint(projection.camera, lerp3(cp0, cp1, (s + 0.5) / subCount));
      totalSamplesTested += 1;
      let occluded = false;
      if (opts.enableHlr) {
        for (let ti = 0; ti < frontTriangles.length; ti++) {
          const occTri = frontTriangles[ti];
          if (incidentIds.has(occTri.triIndex)) continue;
          if (isSampleOccludedByTriangle(projMid.x, projMid.y, projMid.depthMeters, occTri, opts.hlrDepthBiasMeters)) {
            occluded = true;
            break;
          }
        }
      }
      if (occluded) {
        occludedSampleCount += 1;
        sampleVisible[s] = false;
      } else {
        sampleVisible[s] = true;
      }
    }

    let runIndex = 0;
    let cursor = 0;
    while (cursor < subCount) {
      if (!sampleVisible[cursor]) {
        hiddenSegmentCount += 1;
        while (cursor < subCount && !sampleVisible[cursor]) cursor += 1;
        continue;
      }
      const startIdx = cursor;
      while (cursor < subCount && sampleVisible[cursor]) cursor += 1;
      const spStart = projectWorldPoint(projection.camera, lerp3(cp0, cp1, startIdx / subCount));
      const spEnd = projectWorldPoint(projection.camera, lerp3(cp0, cp1, cursor / subCount));
      if (Math.hypot(spEnd.x - spStart.x, spEnd.y - spStart.y) < 0.75) continue;

      const meanDepth = (spStart.depthMeters + spEnd.depthMeters) * 0.5;
      const normDepth = clamp((meanDepth - minDepth) / depthSpan, 0, 1);
      const baseWidth = opts.nearLineWidthPx + (opts.farLineWidthPx - opts.nearLineWidthPx) * Math.pow(normDepth, 0.85);
      const classMult =
        classified.edgeClass === "silhouette-boundary"
          ? opts.silhouetteWeightMultiplier
          : classified.edgeClass === "hard-crease"
            ? opts.creaseWeightMultiplier
            : opts.materialSeamWeightMultiplier;

      const segHash = hashStringU32(`${key}#${runIndex}`, opts.seed);
      const startTaper = 0.84 + seededUnitFloat(segHash, 1) * 0.1;
      const midSwell = 1.02 + seededUnitFloat(segHash, 2) * 0.08;
      const endTaper = 0.84 + seededUnitFloat(segHash, 3) * 0.1;
      const jitterSigned = (seededUnitFloat(segHash, 4) * 2 - 1) * opts.organicJitterScale * (1 - 0.5 * normDepth);

      segments.push({
        id: `npr-${segments.length}-${classified.edgeClass}`,
        edgeClass: classified.edgeClass,
        x1: Number(spStart.x.toFixed(2)),
        y1: Number(spStart.y.toFixed(2)),
        x2: Number(spEnd.x.toFixed(2)),
        y2: Number(spEnd.y.toFixed(2)),
        depthStartMeters: Number(spStart.depthMeters.toFixed(4)),
        depthEndMeters: Number(spEnd.depthMeters.toFixed(4)),
        meanDepthMeters: Number(meanDepth.toFixed(4)),
        widthStartPx: Number((baseWidth * classMult * startTaper).toFixed(3)),
        widthMidPx: Number((baseWidth * classMult * midSwell).toFixed(3)),
        widthEndPx: Number((baseWidth * classMult * endTaper).toFixed(3)),
        inkLightness: Number((0.17 + normDepth * 0.27).toFixed(4)),
        inkOpacity: Number((0.96 - normDepth * 0.34).toFixed(4)),
        dihedralDeg: Number(classified.dihedralDeg.toFixed(2)),
        materialPair: classified.materialPair,
        organicJitterPx: Number(jitterSigned.toFixed(3)),
      });
      runIndex += 1;
    }
  }

  return {
    meshId: mesh.id,
    labelKo: mesh.labelKo,
    presetId: mesh.presetId,
    projection,
    segments,
    counts: {
      totalUniqueEdges: edgeMap.size,
      silhouetteBoundaryEdges,
      hardCreaseEdges,
      materialSeamEdges,
      smoothInteriorSuppressed,
      diagonalClutterCount: 0,
      candidateEdgeCount,
      totalSamplesTested,
      occludedSampleCount,
      hiddenSegmentCount,
      visibleSegmentCount: segments.length,
    },
    depthAttenuation: computeDepthAttenuationSummary(segments, minDepth, maxDepth),
    optionsUsed: opts,
  };
}

function computeDepthAttenuationSummary(
  segments: readonly VisibleNprLineSegment[],
  minDepth: number,
  maxDepth: number,
): NprDepthAttenuationSummary {
  if (segments.length === 0) {
    return {
      nearThresholdMeters: minDepth,
      farThresholdMeters: maxDepth,
      meanNearLineWidthPx: 0,
      meanFarLineWidthPx: 0,
      nearToFarWidthRatio: 1,
    };
  }
  const sorted = [...segments].sort((a, b) => a.meanDepthMeters - b.meanDepthMeters);
  const splitCount = Math.max(1, Math.floor(sorted.length / 3));
  const nearGroup = sorted.slice(0, splitCount);
  const farGroup = sorted.slice(sorted.length - splitCount);
  const meanNear = nearGroup.reduce((acc, s) => acc + s.widthMidPx, 0) / nearGroup.length;
  const meanFar = farGroup.reduce((acc, s) => acc + s.widthMidPx, 0) / farGroup.length;

  return {
    nearThresholdMeters: Number(nearGroup[nearGroup.length - 1].meanDepthMeters.toFixed(3)),
    farThresholdMeters: Number(farGroup[0].meanDepthMeters.toFixed(3)),
    meanNearLineWidthPx: Number(meanNear.toFixed(3)),
    meanFarLineWidthPx: Number(meanFar.toFixed(3)),
    nearToFarWidthRatio: Number((meanNear / Math.max(meanFar, 1e-4)).toFixed(3)),
  };
}
