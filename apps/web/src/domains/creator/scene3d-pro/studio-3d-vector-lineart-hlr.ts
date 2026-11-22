/**
 * 3D→웹툰 벡터 강약선 추출기용 2D 화면 그리드 가속 레이-삼각형 은선 제거(HLR) 모듈.
 *
 * 동차 클립 프러스텀 클리핑 후 가시성 샘플링 + 6단계 이진 탐색 분할로
 * 부분 가림 엣지의 정확한 차폐 경계를 서브픽셀 정밀도로 산출한다.
 */

import {
  clamp,
  clipSegmentToFrustum,
  projectWorldPointToScreen,
  rayTriangleIntersect,
  type CameraBasis,
  type CameraProjectionInput,
  type NdcDepthRange,
} from "./studio-3d-vector-lineart-math";
import type { VectorLineArtEdgeKind, VisibleEdgeSegment } from "./studio-3d-vector-lineart-svg";

export interface WorldTriangle {
  readonly id: number;
  readonly v0x: number;
  readonly v0y: number;
  readonly v0z: number;
  readonly v1x: number;
  readonly v1y: number;
  readonly v1z: number;
  readonly v2x: number;
  readonly v2y: number;
  readonly v2z: number;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly frontFacing: boolean;
  readonly materialId: number;
  readonly screenMinX: number;
  readonly screenMaxX: number;
  readonly screenMinY: number;
  readonly screenMaxY: number;
  readonly canOcclude: boolean;
}

export interface FeatureEdgeCandidate {
  readonly kind: VectorLineArtEdgeKind;
  readonly ax: number;
  readonly ay: number;
  readonly az: number;
  readonly bx: number;
  readonly by: number;
  readonly bz: number;
  readonly avgNx: number;
  readonly avgNy: number;
  readonly avgNz: number;
  readonly dihedralAngleDeg: number;
  readonly ownerTriIds: readonly number[];
}

export interface HlrVisibilityOptions {
  readonly hiddenLineRemoval: boolean;
  readonly visibilitySampleStepPx: number;
  readonly depthBias: number;
  readonly minSegmentLengthPx: number;
}

const OCCLUSION_GRID_RES = 32;
const HLR_BINARY_SEARCH_ITERS = 6;
const ORTHO_RAY_BACK_OFFSET = 500;

export function buildOcclusionGrid(
  triangles: readonly WorldTriangle[],
  viewportWidth: number,
  viewportHeight: number,
): readonly (readonly number[])[] {
  const cells: number[][] = Array.from({ length: OCCLUSION_GRID_RES * OCCLUSION_GRID_RES }, () => []);
  const invW = OCCLUSION_GRID_RES / Math.max(1, viewportWidth);
  const invH = OCCLUSION_GRID_RES / Math.max(1, viewportHeight);

  for (const tri of triangles) {
    if (!tri.canOcclude) continue;
    const x0 = clamp(Math.floor(tri.screenMinX * invW), 0, OCCLUSION_GRID_RES - 1);
    const x1 = clamp(Math.floor(tri.screenMaxX * invW), 0, OCCLUSION_GRID_RES - 1);
    const y0 = clamp(Math.floor(tri.screenMinY * invH), 0, OCCLUSION_GRID_RES - 1);
    const y1 = clamp(Math.floor(tri.screenMaxY * invH), 0, OCCLUSION_GRID_RES - 1);
    for (let cy = y0; cy <= y1; cy += 1) {
      const rowOffset = cy * OCCLUSION_GRID_RES;
      for (let cx = x0; cx <= x1; cx += 1) {
        cells[rowOffset + cx]?.push(tri.id);
      }
    }
  }
  return cells;
}

function isWorldPointVisible(
  px: number,
  py: number,
  pz: number,
  screenX: number,
  screenY: number,
  ownerTriIds: readonly number[],
  triangles: readonly WorldTriangle[],
  grid: readonly (readonly number[])[],
  camBasis: CameraBasis,
  viewportWidth: number,
  viewportHeight: number,
  depthBias: number,
): boolean {
  const gx = clamp(
    Math.floor((screenX / Math.max(1, viewportWidth)) * OCCLUSION_GRID_RES),
    0,
    OCCLUSION_GRID_RES - 1,
  );
  const gy = clamp(
    Math.floor((screenY / Math.max(1, viewportHeight)) * OCCLUSION_GRID_RES),
    0,
    OCCLUSION_GRID_RES - 1,
  );
  const candidates = grid[gy * OCCLUSION_GRID_RES + gx];
  if (!candidates || candidates.length === 0) return true;

  let ox: number;
  let oy: number;
  let oz: number;
  let dx: number;
  let dy: number;
  let dz: number;
  let targetDist: number;

  if (camBasis.isOrthographic) {
    dx = camBasis.forward[0];
    dy = camBasis.forward[1];
    dz = camBasis.forward[2];
    ox = px - dx * ORTHO_RAY_BACK_OFFSET;
    oy = py - dy * ORTHO_RAY_BACK_OFFSET;
    oz = pz - dz * ORTHO_RAY_BACK_OFFSET;
    targetDist = ORTHO_RAY_BACK_OFFSET;
  } else {
    ox = camBasis.position[0];
    oy = camBasis.position[1];
    oz = camBasis.position[2];
    const rx = px - ox;
    const ry = py - oy;
    const rz = pz - oz;
    targetDist = Math.hypot(rx, ry, rz);
    if (targetDist <= 1e-6) return true;
    dx = rx / targetDist;
    dy = ry / targetDist;
    dz = rz / targetDist;
  }

  const maxHitDist = targetDist - Math.max(depthBias, targetDist * 2.5e-4);
  if (maxHitDist <= 1e-5) return true;

  for (const tid of candidates) {
    if (ownerTriIds.includes(tid)) continue;
    const tri = triangles[tid];
    if (!tri) continue;
    if (
      screenX < tri.screenMinX ||
      screenX > tri.screenMaxX ||
      screenY < tri.screenMinY ||
      screenY > tri.screenMaxY
    ) {
      continue;
    }
    const hit = rayTriangleIntersect(
      ox, oy, oz, dx, dy, dz,
      tri.v0x, tri.v0y, tri.v0z,
      tri.v1x, tri.v1y, tri.v1z,
      tri.v2x, tri.v2y, tri.v2z,
      1e-5,
      maxHitDist,
    );
    if (hit > 0) return false;
  }
  return true;
}

export function extractVisibleSegments(
  edges: readonly FeatureEdgeCandidate[],
  triangles: readonly WorldTriangle[],
  grid: readonly (readonly number[])[],
  camera: CameraProjectionInput,
  camBasis: CameraBasis,
  viewProj: Float64Array,
  ndcDepthRange: NdcDepthRange,
  opts: HlrVisibilityOptions,
): { readonly segments: readonly VisibleEdgeSegment[]; readonly occludedCount: number } {
  const segments: VisibleEdgeSegment[] = [];
  let occludedCount = 0;

  for (const edge of edges) {
    const clipped = clipSegmentToFrustum(
      edge.ax, edge.ay, edge.az, edge.bx, edge.by, edge.bz, viewProj, ndcDepthRange,
    );
    if (!clipped) continue;
    const [t0, t1] = clipped;
    if (t1 - t0 < 1e-6) continue;

    const p0x = edge.ax + (edge.bx - edge.ax) * t0;
    const p0y = edge.ay + (edge.by - edge.ay) * t0;
    const p0z = edge.az + (edge.bz - edge.az) * t0;
    const p1x = edge.ax + (edge.bx - edge.ax) * t1;
    const p1y = edge.ay + (edge.by - edge.ay) * t1;
    const p1z = edge.az + (edge.bz - edge.az) * t1;

    const sp0 = projectWorldPointToScreen(
      p0x, p0y, p0z, viewProj, camera.viewMatrix, camera.viewportWidth, camera.viewportHeight,
    );
    const sp1 = projectWorldPointToScreen(
      p1x, p1y, p1z, viewProj, camera.viewMatrix, camera.viewportWidth, camera.viewportHeight,
    );
    if (!sp0 || !sp1) continue;

    const screenLen = Math.hypot(sp1.x - sp0.x, sp1.y - sp0.y);
    if (screenLen < opts.minSegmentLengthPx) continue;

    const emitSubSegment = (uStart: number, uEnd: number): boolean => {
      const wx0 = p0x + (p1x - p0x) * uStart;
      const wy0 = p0y + (p1y - p0y) * uStart;
      const wz0 = p0z + (p1z - p0z) * uStart;
      const wx1 = p0x + (p1x - p0x) * uEnd;
      const wy1 = p0y + (p1y - p0y) * uEnd;
      const wz1 = p0z + (p1z - p0z) * uEnd;
      const q0 = projectWorldPointToScreen(
        wx0, wy0, wz0, viewProj, camera.viewMatrix, camera.viewportWidth, camera.viewportHeight,
      );
      const q1 = projectWorldPointToScreen(
        wx1, wy1, wz1, viewProj, camera.viewMatrix, camera.viewportWidth, camera.viewportHeight,
      );
      if (!q0 || !q1) return false;
      if (Math.hypot(q1.x - q0.x, q1.y - q0.y) < opts.minSegmentLengthPx) return false;
      segments.push({
        kind: edge.kind,
        ax: wx0, ay: wy0, az: wz0,
        bx: wx1, by: wy1, bz: wz1,
        sax: q0.x, say: q0.y, saDepth: q0.viewDepth,
        sbx: q1.x, sby: q1.y, sbDepth: q1.viewDepth,
        avgNx: edge.avgNx, avgNy: edge.avgNy, avgNz: edge.avgNz,
        dihedralAngleDeg: edge.dihedralAngleDeg,
      });
      return true;
    };

    if (!opts.hiddenLineRemoval) {
      emitSubSegment(0, 1);
      continue;
    }

    const testAt = (u: number): boolean => {
      const evalU = u <= 0.015 ? 0.015 : u >= 0.985 ? 0.985 : u;
      const wx = p0x + (p1x - p0x) * evalU;
      const wy = p0y + (p1y - p0y) * evalU;
      const wz = p0z + (p1z - p0z) * evalU;
      const sp = projectWorldPointToScreen(
        wx, wy, wz, viewProj, camera.viewMatrix, camera.viewportWidth, camera.viewportHeight,
      );
      if (!sp) return false;
      return isWorldPointVisible(
        wx, wy, wz, sp.x, sp.y, edge.ownerTriIds, triangles, grid, camBasis,
        camera.viewportWidth, camera.viewportHeight, opts.depthBias,
      );
    };

    const refineTransition = (uVis: number, uOcc: number): number => {
      let vis = uVis;
      let occ = uOcc;
      for (let iter = 0; iter < HLR_BINARY_SEARCH_ITERS; iter += 1) {
        const mid = (vis + occ) * 0.5;
        if (testAt(mid)) vis = mid;
        else occ = mid;
      }
      return vis;
    };

    const steps = clamp(Math.ceil(screenLen / opts.visibilitySampleStepPx), 4, 64);
    const visFlags: boolean[] = [];
    for (let k = 0; k <= steps; k += 1) visFlags.push(testAt(k / steps));

    let emittedAny = false;
    let runStartU: number | null = null;
    for (let k = 0; k <= steps; k += 1) {
      const curVis = visFlags[k] ?? false;
      const u = k / steps;
      if (curVis && runStartU === null) {
        runStartU = k === 0 ? 0 : refineTransition(u, (k - 1) / steps);
      } else if (!curVis && runStartU !== null) {
        if (emitSubSegment(runStartU, refineTransition((k - 1) / steps, u))) {
          emittedAny = true;
        }
        runStartU = null;
      }
    }
    if (runStartU !== null && emitSubSegment(runStartU, 1)) {
      emittedAny = true;
    }
    if (!emittedAny) occludedCount += 1;
  }

  return { segments, occludedCount };
}
