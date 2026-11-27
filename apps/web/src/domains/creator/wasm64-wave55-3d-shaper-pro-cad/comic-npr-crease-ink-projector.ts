/**
 * Wave 55 3D 셰이퍼+ 만화 NPR 실루엣·크리즈·하드 엣지 및 은선 제거(Hidden Line Removal) 선화 추출기.
 *
 * - 조형된 수밀 3D CAD 솔리드에서 카메라 투영 행렬 기준으로 실루엣 외곽선(앞면·뒷면 경계),
 *   이면각 크리즈 선(`creaseAngleDeg`), 창문·프레임 하드 엣지를 분류한다.
 * - 해석적 레이-삼각형 교차(Möller-Trumbore) + 화면 AABB·깊이 사전 컬링으로 은선을 제거하고
 *   2D 웹툰 선화 레이어에 즉시 삽입 가능한 벡터 스트로크(`ComicProjectedInkStroke[]`)를 산출한다.
 */

import {
  type CadSolidMesh,
  clampNumber,
  type Mat4,
  triangleNormalAndArea,
  undirectedEdgeKey,
  type Vec2,
  type Vec3,
  vec3Cross,
  vec3Distance,
  vec3Dot,
  vec3Lerp,
  vec3Normalize,
  vec3Scale,
  vec3Sub,
} from "./cad-manifold-primitives";

export type ComicInkEdgeCategory = "silhouette" | "hard-frame" | "crease";

export interface ComicCameraConfig {
  readonly position: Vec3;
  readonly target: Vec3;
  readonly up?: Vec3;
  readonly projectionMode?: "perspective" | "orthographic";
  readonly fovYDeg?: number;
  readonly orthoHeightMeters?: number;
  readonly nearMeters?: number;
  readonly farMeters?: number;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
}

export interface ComicNprExtractionOptions {
  readonly creaseAngleDeg?: number;
  readonly hardFrameAngleDeg?: number;
  readonly sampleStepPx?: number;
  readonly depthBiasMeters?: number;
  readonly baseStrokeWidthPx?: number;
  readonly includeHiddenDebugStrokes?: boolean;
  readonly minProjectedLengthPx?: number;
}

export interface ProjectedPoint2D {
  readonly screenX: number;
  readonly screenY: number;
  readonly ndcX: number;
  readonly ndcY: number;
  readonly viewDepthMeters: number;
  readonly inFront: boolean;
}

export interface ComicCameraProjection {
  readonly position: Vec3;
  readonly forward: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
  readonly mode: "perspective" | "orthographic";
  readonly nearMeters: number;
  readonly farMeters: number;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly viewMatrix: Mat4;
  readonly projectionMatrix: Mat4;
  readonly viewProjectionMatrix: Mat4;
  readonly project: (point: Vec3) => ProjectedPoint2D;
}

export interface ClassifiedComicEdge {
  readonly u: number;
  readonly v: number;
  readonly category: ComicInkEdgeCategory;
  readonly dihedralAngleDeg: number;
  readonly isExplicitHardEdge: boolean;
  readonly adjacentTriangleIndices: readonly number[];
}

export interface ComicProjectedInkStroke {
  readonly id: string;
  readonly category: ComicInkEdgeCategory;
  readonly points2D: readonly Vec2[];
  readonly sourceEdge3D: readonly [Vec3, Vec3];
  readonly dihedralAngleDeg: number;
  readonly strokeWidthPx: number;
  readonly opacity: number;
  readonly averageDepthMeters: number;
  readonly visibilityRatio: number;
}

export interface ComicNprProjectionStats {
  readonly candidateEdgeCount: number;
  readonly visibleStrokeCount: number;
  readonly fullyHiddenEdgeCount: number;
  readonly partiallyOccludedEdgeCount: number;
  readonly silhouetteCount: number;
  readonly hardFrameCount: number;
  readonly creaseCount: number;
}

export interface ComicNprProjectionResult {
  readonly strokes: readonly ComicProjectedInkStroke[];
  readonly hiddenDebugStrokes: readonly ComicProjectedInkStroke[];
  readonly stats: ComicNprProjectionStats;
  readonly viewport: { readonly widthPx: number; readonly heightPx: number };
}

interface OccluderTriangle {
  readonly triIndex: number;
  readonly i0: number;
  readonly i1: number;
  readonly i2: number;
  readonly a: Vec3;
  readonly b: Vec3;
  readonly c: Vec3;
  readonly minScreenX: number;
  readonly maxScreenX: number;
  readonly minScreenY: number;
  readonly maxScreenY: number;
  readonly minViewDepth: number;
}

function multiplyMat4(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) {
        sum += (a[k * 4 + row] ?? 0) * (b[col * 4 + k] ?? 0);
      }
      out[col * 4 + row] = sum;
    }
  }
  return out as unknown as Mat4;
}

/**
 * 오른손 좌표계 LookAt 뷰 행렬과 원근/직교 투영 행렬을 생성한다.
 */
export function buildCameraProjection(config: ComicCameraConfig): ComicCameraProjection {
  const width = Math.max(1, config.viewportWidthPx);
  const height = Math.max(1, config.viewportHeightPx);
  const near = Math.max(0.01, config.nearMeters ?? 0.05);
  const far = Math.max(near + 1, config.farMeters ?? 200);
  const mode = config.projectionMode ?? "perspective";
  const aspect = width / height;

  const forward = vec3Normalize(vec3Sub(config.target, config.position));
  const worldUp = vec3Normalize(config.up ?? [0, 1, 0]);
  const fallbackUp: Vec3 = Math.abs(vec3Dot(forward, worldUp)) > 0.995 ? [0, 0, 1] : worldUp;
  const right = vec3Normalize(vec3Cross(forward, fallbackUp));
  const up = vec3Normalize(vec3Cross(right, forward));

  // 오른손 뷰 행렬 (카메라 전방은 -Z)
  const back: Vec3 = [-forward[0], -forward[1], -forward[2]];
  const viewMatrix: Mat4 = [
    right[0], up[0], back[0], 0,
    right[1], up[1], back[1], 0,
    right[2], up[2], back[2], 0,
    -vec3Dot(right, config.position),
    -vec3Dot(up, config.position),
    -vec3Dot(back, config.position),
    1,
  ];

  let projectionMatrix: Mat4;
  if (mode === "orthographic") {
    const halfH = Math.max(0.1, (config.orthoHeightMeters ?? 6) * 0.5);
    const halfW = halfH * aspect;
    const invDepth = 1 / (far - near);
    projectionMatrix = [
      1 / halfW, 0, 0, 0,
      0, 1 / halfH, 0, 0,
      0, 0, -2 * invDepth, 0,
      0, 0, -(far + near) * invDepth, 1,
    ];
  } else {
    const fovRad = ((config.fovYDeg ?? 45) * Math.PI) / 180;
    const f = 1 / Math.tan(fovRad * 0.5);
    const invDepth = 1 / (near - far);
    projectionMatrix = [
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * invDepth, -1,
      0, 0, 2 * far * near * invDepth, 0,
    ];
  }

  const viewProjectionMatrix = multiplyMat4(projectionMatrix, viewMatrix);
  const project = (point: Vec3): ProjectedPoint2D => {
    const rel = vec3Sub(point, config.position);
    const viewDepthMeters = vec3Dot(rel, forward);
    const x = point[0];
    const y = point[1];
    const z = point[2];
    const cx =
      viewProjectionMatrix[0] * x +
      viewProjectionMatrix[4] * y +
      viewProjectionMatrix[8] * z +
      viewProjectionMatrix[12];
    const cy =
      viewProjectionMatrix[1] * x +
      viewProjectionMatrix[5] * y +
      viewProjectionMatrix[9] * z +
      viewProjectionMatrix[13];
    const cw =
      viewProjectionMatrix[3] * x +
      viewProjectionMatrix[7] * y +
      viewProjectionMatrix[11] * z +
      viewProjectionMatrix[15];
    const invW = Math.abs(cw) > 1e-8 ? 1 / cw : 1;
    const ndcX = cx * invW;
    const ndcY = cy * invW;
    return {
      screenX: (ndcX * 0.5 + 0.5) * width,
      screenY: (0.5 - ndcY * 0.5) * height,
      ndcX,
      ndcY,
      viewDepthMeters,
      inFront: viewDepthMeters >= near,
    };
  };

  return {
    position: config.position,
    forward,
    right,
    up,
    mode,
    nearMeters: near,
    farMeters: far,
    viewportWidthPx: width,
    viewportHeightPx: height,
    viewMatrix,
    projectionMatrix,
    viewProjectionMatrix,
    project,
  };
}

/**
 * 솔리드의 모든 모서리를 카메라 시선 기준으로 실루엣·하드 프레임·크리즈로 분류한다.
 */
export function classifyComicFeatureEdges(
  solid: CadSolidMesh,
  camera: ComicCameraProjection,
  options: Pick<ComicNprExtractionOptions, "creaseAngleDeg" | "hardFrameAngleDeg"> = {},
): readonly ClassifiedComicEdge[] {
  const creaseAngleDeg = options.creaseAngleDeg ?? 28;
  const hardFrameAngleDeg = options.hardFrameAngleDeg ?? 75;
  const explicitHardSet = new Set<string>(
    solid.hardEdges.map(([u, v]) => undirectedEdgeKey(u, v)),
  );

  const triNormals: Vec3[] = [];
  const triFrontFacing: boolean[] = [];
  const edgeTable = new Map<string, { u: number; v: number; tris: number[] }>();

  for (let i = 0; i < solid.triangles.length; i += 1) {
    const tri = solid.triangles[i];
    if (!tri) {
      triNormals.push([0, 1, 0]);
      triFrontFacing.push(false);
      continue;
    }
    const a = solid.vertices[tri[0]] ?? [0, 0, 0];
    const b = solid.vertices[tri[1]] ?? [0, 0, 0];
    const c = solid.vertices[tri[2]] ?? [0, 0, 0];
    const { normal } = triangleNormalAndArea(a, b, c);
    triNormals.push(normal);

    const centroid: Vec3 = [
      (a[0] + b[0] + c[0]) / 3,
      (a[1] + b[1] + c[1]) / 3,
      (a[2] + b[2] + c[2]) / 3,
    ];
    const toCamera =
      camera.mode === "orthographic"
        ? ([-camera.forward[0], -camera.forward[1], -camera.forward[2]] as const)
        : vec3Normalize(vec3Sub(camera.position, centroid));
    triFrontFacing.push(vec3Dot(normal, toCamera) > 1e-6);

    const pairs: Array<[number, number]> = [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]];
    for (const [u, v] of pairs) {
      const key = undirectedEdgeKey(u, v);
      const rec = edgeTable.get(key);
      if (rec) {
        rec.tris.push(i);
      } else {
        edgeTable.set(key, { u: Math.min(u, v), v: Math.max(u, v), tris: [i] });
      }
    }
  }

  const classified: ClassifiedComicEdge[] = [];
  for (const [key, rec] of edgeTable.entries()) {
    const t0 = rec.tris[0];
    if (t0 === undefined) continue;
    const front0 = triFrontFacing[t0] ?? false;
    const isExplicitHardEdge = explicitHardSet.has(key);

    if (rec.tris.length === 1) {
      if (front0) {
        classified.push({
          u: rec.u,
          v: rec.v,
          category: "silhouette",
          dihedralAngleDeg: 180,
          isExplicitHardEdge,
          adjacentTriangleIndices: rec.tris,
        });
      }
      continue;
    }

    const t1 = rec.tris[1] ?? t0;
    const front1 = triFrontFacing[t1] ?? false;
    const n0 = triNormals[t0] ?? [0, 1, 0];
    const n1 = triNormals[t1] ?? [0, 1, 0];
    const dihedralAngleDeg =
      (Math.acos(clampNumber(vec3Dot(n0, n1), -1, 1)) * 180) / Math.PI;

    // 양쪽 면이 모두 뒷면인 엣지는 은선 후보에서 조기 제외
    if (!front0 && !front1) continue;

    if (front0 !== front1) {
      classified.push({
        u: rec.u,
        v: rec.v,
        category: "silhouette",
        dihedralAngleDeg,
        isExplicitHardEdge,
        adjacentTriangleIndices: rec.tris,
      });
    } else if (dihedralAngleDeg >= hardFrameAngleDeg) {
      classified.push({
        u: rec.u,
        v: rec.v,
        category: "hard-frame",
        dihedralAngleDeg,
        isExplicitHardEdge,
        adjacentTriangleIndices: rec.tris,
      });
    } else if (dihedralAngleDeg >= creaseAngleDeg) {
      classified.push({
        u: rec.u,
        v: rec.v,
        category: "crease",
        dihedralAngleDeg,
        isExplicitHardEdge,
        adjacentTriangleIndices: rec.tris,
      });
    } else if (isExplicitHardEdge && dihedralAngleDeg >= 5) {
      classified.push({
        u: rec.u,
        v: rec.v,
        category: "hard-frame",
        dihedralAngleDeg,
        isExplicitHardEdge,
        adjacentTriangleIndices: rec.tris,
      });
    }
  }

  return classified;
}

function rayIntersectsTriangleDistance(
  origin: Vec3,
  dir: Vec3,
  a: Vec3,
  b: Vec3,
  c: Vec3,
): number | null {
  const e1 = vec3Sub(b, a);
  const e2 = vec3Sub(c, a);
  const pVec = vec3Cross(dir, e2);
  const det = vec3Dot(e1, pVec);
  if (Math.abs(det) < 1e-9) return null;
  const invDet = 1 / det;
  const tVec = vec3Sub(origin, a);
  const u = vec3Dot(tVec, pVec) * invDet;
  if (u < -1e-5 || u > 1 + 1e-5) return null;
  const qVec = vec3Cross(tVec, e1);
  const v = vec3Dot(dir, qVec) * invDet;
  if (v < -1e-5 || u + v > 1 + 1e-5) return null;
  const dist = vec3Dot(e2, qVec) * invDet;
  return dist > 1e-6 ? dist : null;
}

function clipSegmentToNearPlane(
  a: Vec3,
  b: Vec3,
  camera: ComicCameraProjection,
): readonly [Vec3, Vec3] | null {
  const dA = vec3Dot(vec3Sub(a, camera.position), camera.forward) - camera.nearMeters;
  const dB = vec3Dot(vec3Sub(b, camera.position), camera.forward) - camera.nearMeters;
  if (dA < 0 && dB < 0) return null;
  if (dA >= 0 && dB >= 0) return [a, b];
  const t = dA / (dA - dB);
  const cut = vec3Lerp(a, b, clampNumber(t, 0, 1));
  return dA < 0 ? [cut, b] : [a, cut];
}

/**
 * 3D CAD 솔리드에서 실루엣·크리즈·하드 엣지를 추출하고 은선 제거(HLR)를 거쳐
 * 2D 웹툰 선화 레이어에 바로 사용할 수 있는 벡터 스트로크를 생성한다.
 */
export function extractComicNprInkStrokes(
  solid: CadSolidMesh,
  cameraConfig: ComicCameraConfig,
  options: ComicNprExtractionOptions = {},
): ComicNprProjectionResult {
  const camera = buildCameraProjection(cameraConfig);
  const candidates = classifyComicFeatureEdges(solid, camera, options);
  const sampleStepPx = Math.max(2, options.sampleStepPx ?? 6);
  const depthBias = Math.max(1e-4, options.depthBiasMeters ?? 1.5e-3);
  const baseWidth = Math.max(0.5, options.baseStrokeWidthPx ?? 1.8);
  const minProjLenPx = Math.max(0.5, options.minProjectedLengthPx ?? 1.5);
  const includeHidden = options.includeHiddenDebugStrokes ?? false;

  // 앞면 차폐 삼각형 인덱스(화면 AABB + 최소 깊이 사전 캐시) 구축
  const occluders: OccluderTriangle[] = [];
  for (let i = 0; i < solid.triangles.length; i += 1) {
    const tri = solid.triangles[i];
    if (!tri) continue;
    const a = solid.vertices[tri[0]];
    const b = solid.vertices[tri[1]];
    const c = solid.vertices[tri[2]];
    if (!a || !b || !c) continue;
    const pA = camera.project(a);
    const pB = camera.project(b);
    const pC = camera.project(c);
    if (!pA.inFront && !pB.inFront && !pC.inFront) continue;
    occluders.push({
      triIndex: i,
      i0: tri[0],
      i1: tri[1],
      i2: tri[2],
      a,
      b,
      c,
      minScreenX: Math.min(pA.screenX, pB.screenX, pC.screenX) - 1,
      maxScreenX: Math.max(pA.screenX, pB.screenX, pC.screenX) + 1,
      minScreenY: Math.min(pA.screenY, pB.screenY, pC.screenY) - 1,
      maxScreenY: Math.max(pA.screenY, pB.screenY, pC.screenY) + 1,
      minViewDepth: Math.min(pA.viewDepthMeters, pB.viewDepthMeters, pC.viewDepthMeters),
    });
  }

  const isPointOccluded = (point: Vec3, edgeU: number, edgeV: number): boolean => {
    const proj = camera.project(point);
    const rayOrigin: Vec3 =
      camera.mode === "orthographic"
        ? vec3Sub(point, vec3Scale(camera.forward, proj.viewDepthMeters + 1))
        : camera.position;
    const toPoint = vec3Sub(point, rayOrigin);
    const targetDist = vec3Distance(rayOrigin, point);
    if (targetDist <= depthBias) return false;
    const rayDir = vec3Normalize(toPoint);

    for (const occ of occluders) {
      if (occ.minViewDepth > proj.viewDepthMeters + depthBias) continue;
      if (
        proj.screenX < occ.minScreenX ||
        proj.screenX > occ.maxScreenX ||
        proj.screenY < occ.minScreenY ||
        proj.screenY > occ.maxScreenY
      ) {
        continue;
      }
      // 엣지 자체와 맞닿은 인접 삼각형은 자기 차폐(self-occlusion) 방지
      if (
        occ.i0 === edgeU || occ.i1 === edgeU || occ.i2 === edgeU ||
        occ.i0 === edgeV || occ.i1 === edgeV || occ.i2 === edgeV
      ) {
        const sharesBoth =
          (occ.i0 === edgeU || occ.i1 === edgeU || occ.i2 === edgeU) &&
          (occ.i0 === edgeV || occ.i1 === edgeV || occ.i2 === edgeV);
        if (sharesBoth) continue;
      }
      const hitDist = rayIntersectsTriangleDistance(rayOrigin, rayDir, occ.a, occ.b, occ.c);
      if (hitDist !== null && hitDist < targetDist - depthBias) {
        return true;
      }
    }
    return false;
  };

  const categoryWeightMultiplier: Record<ComicInkEdgeCategory, number> = {
    silhouette: 1.35,
    "hard-frame": 1.0,
    crease: 0.72,
  };

  const strokes: ComicProjectedInkStroke[] = [];
  const hiddenDebugStrokes: ComicProjectedInkStroke[] = [];
  let fullyHiddenEdgeCount = 0;
  let partiallyOccludedEdgeCount = 0;
  let silhouetteCount = 0;
  let hardFrameCount = 0;
  let creaseCount = 0;

  for (let eIdx = 0; eIdx < candidates.length; eIdx += 1) {
    const edge = candidates[eIdx];
    if (!edge) continue;
    const rawA = solid.vertices[edge.u];
    const rawB = solid.vertices[edge.v];
    if (!rawA || !rawB) continue;

    const clipped = clipSegmentToNearPlane(rawA, rawB, camera);
    if (!clipped) continue;
    const [segA, segB] = clipped;
    const pA = camera.project(segA);
    const pB = camera.project(segB);
    const screenLen = Math.hypot(pB.screenX - pA.screenX, pB.screenY - pA.screenY);
    if (screenLen < minProjLenPx) continue;

    const sampleCount = clampNumber(Math.ceil(screenLen / sampleStepPx), 5, 64);
    const visibleFlags: boolean[] = [];
    for (let s = 0; s < sampleCount; s += 1) {
      const t = (s + 0.5) / sampleCount;
      const samplePt = vec3Lerp(segA, segB, t);
      visibleFlags.push(!isPointOccluded(samplePt, edge.u, edge.v));
    }

    const visibleCount = visibleFlags.filter(Boolean).length;
    if (visibleCount === 0) {
      fullyHiddenEdgeCount += 1;
      if (includeHidden) {
        hiddenDebugStrokes.push({
          id: `hidden-${eIdx}`,
          category: edge.category,
          points2D: [
            [pA.screenX, pA.screenY],
            [pB.screenX, pB.screenY],
          ],
          sourceEdge3D: [segA, segB],
          dihedralAngleDeg: edge.dihedralAngleDeg,
          strokeWidthPx: 0.5,
          opacity: 0.25,
          averageDepthMeters: (pA.viewDepthMeters + pB.viewDepthMeters) * 0.5,
          visibilityRatio: 0,
        });
      }
      continue;
    }
    if (visibleCount < sampleCount) {
      partiallyOccludedEdgeCount += 1;
    }

    // 연속 가시 구간을 이진 탐색으로 경계 보정해 깔끔한 2D 벡터 스트로크로 변환
    const refineTransition = (tVis: number, tHid: number): number => {
      let aT = tVis;
      let bT = tHid;
      for (let iter = 0; iter < 5; iter += 1) {
        const mid = (aT + bT) * 0.5;
        if (isPointOccluded(vec3Lerp(segA, segB, mid), edge.u, edge.v)) {
          bT = mid;
        } else {
          aT = mid;
        }
      }
      return (aT + bT) * 0.5;
    };

    let runStart = -1;
    let subIndex = 0;
    for (let s = 0; s <= sampleCount; s += 1) {
      const isVis = s < sampleCount ? (visibleFlags[s] ?? false) : false;
      if (isVis && runStart < 0) {
        runStart = s;
      } else if (!isVis && runStart >= 0) {
        const t0 =
          runStart === 0
            ? 0
            : refineTransition((runStart + 0.5) / sampleCount, (runStart - 0.5) / sampleCount);
        const t1 =
          s === sampleCount
            ? 1
            : refineTransition((s - 0.5) / sampleCount, (s + 0.5) / sampleCount);

        const pt0 = vec3Lerp(segA, segB, t0);
        const pt1 = vec3Lerp(segA, segB, t1);
        const sp0 = camera.project(pt0);
        const sp1 = camera.project(pt1);
        if (Math.hypot(sp1.screenX - sp0.screenX, sp1.screenY - sp0.screenY) >= minProjLenPx) {
          const avgDepth = Math.max(camera.nearMeters, (sp0.viewDepthMeters + sp1.viewDepthMeters) * 0.5);
          const depthFactor = clampNumber(4 / Math.max(1.5, avgDepth), 0.55, 1.35);
          const strokeWidthPx = Number(
            (baseWidth * categoryWeightMultiplier[edge.category] * depthFactor).toFixed(2),
          );
          const opacity = Number(clampNumber(1.08 - avgDepth * 0.015, 0.45, 1).toFixed(2));
          strokes.push({
            id: `ink-${edge.category}-${eIdx}-${subIndex}`,
            category: edge.category,
            points2D: [
              [sp0.screenX, sp0.screenY],
              [sp1.screenX, sp1.screenY],
            ],
            sourceEdge3D: [pt0, pt1],
            dihedralAngleDeg: edge.dihedralAngleDeg,
            strokeWidthPx,
            opacity,
            averageDepthMeters: avgDepth,
            visibilityRatio: Number((t1 - t0).toFixed(3)),
          });
          subIndex += 1;
          if (edge.category === "silhouette") silhouetteCount += 1;
          else if (edge.category === "hard-frame") hardFrameCount += 1;
          else creaseCount += 1;
        }
        runStart = -1;
      }
    }
  }

  return {
    strokes,
    hiddenDebugStrokes,
    stats: {
      candidateEdgeCount: candidates.length,
      visibleStrokeCount: strokes.length,
      fullyHiddenEdgeCount,
      partiallyOccludedEdgeCount,
      silhouetteCount,
      hardFrameCount,
      creaseCount,
    },
    viewport: {
      widthPx: camera.viewportWidthPx,
      heightPx: camera.viewportHeightPx,
    },
  };
}
