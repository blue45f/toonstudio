/**
 * 격자 메쉬 워프(bilinear 대칭 4분할 / bicubic Catmull-Rom C¹ 곡면 Newton 역해) 및
 * 액화(Liquify 방사 변위: push / bloat / pinch / twirl-cw / twirl-ccw) 결정적 CPU 수학 모듈.
 *
 * `studio-webgpu-transform-resample-shader.ts`의 WGSL 함수(`solve_mesh_inverse_wgsl`,
 * `apply_liquify_inverse_wgsl`)와 동일한 방정식·외삽 경계 조건을 공유한다.
 */

import type {
  StudioPackedLiquifyOp,
  StudioPackedMeshControlPoint,
} from "./studio-webgpu-zero-copy-pack";

export type StudioMeshPatchInterpolation = "bilinear" | "bicubic";

export const STUDIO_LIQUIFY_RADIAL_MODES = [
  "push",
  "bloat",
  "pinch",
  "twirl-cw",
  "twirl-ccw",
] as const;

export type StudioLiquifyRadialMode = (typeof STUDIO_LIQUIFY_RADIAL_MODES)[number];

export interface StudioLiquifyRadialOp {
  readonly centerX: number;
  readonly centerY: number;
  readonly deltaX?: number;
  readonly deltaY?: number;
  readonly radius: number;
  readonly strength: number;
  readonly mode: StudioLiquifyRadialMode;
  readonly hardness?: number;
}

export interface StudioMeshWarpConfig {
  readonly rows: number;
  readonly cols: number;
  readonly nodes: readonly StudioPackedMeshControlPoint[];
  readonly patchMode?: StudioMeshPatchInterpolation;
}

export const LIQUIFY_RADIAL_MODE_CODES: Readonly<Record<StudioLiquifyRadialMode, number>> = Object.freeze({
  push: 0,
  bloat: 1,
  pinch: 2,
  "twirl-cw": 3,
  "twirl-ccw": 4,
});

function clamp(value: number, minimum: number, maximum: number): number {
  return value < minimum ? minimum : value > maximum ? maximum : value;
}

/** Catmull-Rom Bicubic (Keys B=0, C=0.5) 커널 가중치 (`|x| < 2`). */
export function evaluateCatmullRomWeight(x: number): number {
  const ax = Math.abs(x);
  if (ax >= 2) return 0;
  const ax2 = ax * ax;
  const ax3 = ax2 * ax;
  if (ax < 1) {
    return 1.5 * ax3 - 2.5 * ax2 + 1;
  }
  return -0.5 * ax3 + 2.5 * ax2 - 4 * ax + 2;
}

function evalCatmullRom1D(p0: number, p1: number, p2: number, p3: number, t: number): number {
  return (
    p0 * evaluateCatmullRomWeight(t + 1)
    + p1 * evaluateCatmullRomWeight(t)
    + p2 * evaluateCatmullRomWeight(t - 1)
    + p3 * evaluateCatmullRomWeight(t - 2)
  );
}

/** 경계 바깥 Catmull-Rom 팬텀 노드를 선형 외삽해 항등 격자 무손실·경계 꺾임 제거를 보장한다. */
function fetchMeshNodeExtrapolated(
  nodes: readonly StudioPackedMeshControlPoint[],
  rows: number,
  cols: number,
  row: number,
  col: number,
): readonly [number, number] {
  const fetchRowCol = (r: number, c: number): readonly [number, number] => {
    if (c < 0) {
      const a = nodes[r * cols]!;
      const b = nodes[r * cols + 1]!;
      return [2 * a.x - b.x, 2 * a.y - b.y];
    }
    if (c >= cols) {
      const a = nodes[r * cols + (cols - 1)]!;
      const b = nodes[r * cols + (cols - 2)]!;
      return [2 * a.x - b.x, 2 * a.y - b.y];
    }
    const n = nodes[r * cols + c]!;
    return [n.x, n.y];
  };
  if (row < 0) {
    const a = fetchRowCol(0, col);
    const b = fetchRowCol(1, col);
    return [2 * a[0] - b[0], 2 * a[1] - b[1]];
  }
  if (row >= rows) {
    const a = fetchRowCol(rows - 1, col);
    const b = fetchRowCol(rows - 2, col);
    return [2 * a[0] - b[0], 2 * a[1] - b[1]];
  }
  return fetchRowCol(row, col);
}

/** 제어점 격자에서 정규화 `(u, v) ∈ [0, cols-1] × [0, rows-1]`의 변형 좌표를 Bicubic Catmull-Rom으로 평가한다. */
export function evaluateMeshForwardBicubic(
  nodes: readonly StudioPackedMeshControlPoint[],
  rows: number,
  cols: number,
  u: number,
  v: number,
): readonly [number, number] {
  const maxU = cols - 1;
  const maxV = rows - 1;
  const cu = clamp(u, 0, maxU);
  const cv = clamp(v, 0, maxV);
  const i1 = Math.min(maxU - 1, Math.floor(cu));
  const j1 = Math.min(maxV - 1, Math.floor(cv));
  const fu = cu - i1;
  const fv = cv - j1;

  let outX = 0;
  let outY = 0;
  for (let dj = -1; dj <= 2; dj += 1) {
    const wy = evaluateCatmullRomWeight(fv - dj);
    const rIdx = j1 + dj;
    const n0 = fetchMeshNodeExtrapolated(nodes, rows, cols, rIdx, i1 - 1);
    const n1 = fetchMeshNodeExtrapolated(nodes, rows, cols, rIdx, i1);
    const n2 = fetchMeshNodeExtrapolated(nodes, rows, cols, rIdx, i1 + 1);
    const n3 = fetchMeshNodeExtrapolated(nodes, rows, cols, rIdx, i1 + 2);
    outX += evalCatmullRom1D(n0[0], n1[0], n2[0], n3[0], fu) * wy;
    outY += evalCatmullRom1D(n0[1], n1[1], n2[1], n3[1], fu) * wy;
  }
  return [outX, outY];
}

function evalMeshRestCoordinate(
  nodes: readonly StudioPackedMeshControlPoint[],
  rows: number,
  cols: number,
  u: number,
  v: number,
): readonly [number, number] {
  const maxU = cols - 1;
  const maxV = rows - 1;
  const cu = clamp(u, 0, maxU);
  const cv = clamp(v, 0, maxV);
  const i0 = Math.min(maxU - 1, Math.floor(cu));
  const j0 = Math.min(maxV - 1, Math.floor(cv));
  const fu = cu - i0;
  const fv = cv - j0;

  const p00 = nodes[j0 * cols + i0]!;
  const p10 = nodes[j0 * cols + i0 + 1]!;
  const p01 = nodes[(j0 + 1) * cols + i0]!;
  const p11 = nodes[(j0 + 1) * cols + i0 + 1]!;

  const rx = (p00.restX * (1 - fu) + p10.restX * fu) * (1 - fv)
    + (p01.restX * (1 - fu) + p11.restX * fu) * fv;
  const ry = (p00.restY * (1 - fu) + p10.restY * fu) * (1 - fv)
    + (p01.restY * (1 - fu) + p11.restY * fu) * fv;
  return [rx, ry];
}

function tryInverseTriangleBarycentric(
  px: number,
  py: number,
  ax: number,
  ay: number,
  au: number,
  av: number,
  bx: number,
  by: number,
  bu: number,
  bv: number,
  cx: number,
  cy: number,
  cu: number,
  cv: number,
): readonly [number, number] | null {
  const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(det) < 1e-7) return null;
  const invDet = 1 / det;
  const w0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) * invDet;
  const w1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) * invDet;
  const w2 = 1 - w0 - w1;
  if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) return null;
  return [w0 * au + w1 * bu + w2 * cu, w0 * av + w1 * bv + w2 * cv];
}

/**
 * 목적지 픽셀 `(dx, dy)`에 대응하는 메쉬 원본 좌표 `(sx, sy)`를 역탐색한다.
 */
export function evaluateMeshInversePoint(
  mesh: StudioMeshWarpConfig,
  dx: number,
  dy: number,
): readonly [number, number] | null {
  const { rows, cols, nodes } = mesh;
  if (rows < 2 || cols < 2 || nodes.length < rows * cols) return null;

  let seedUv: readonly [number, number] | null = null;
  for (let r = 0; r < rows - 1 && !seedUv; r += 1) {
    for (let c = 0; c < cols - 1; c += 1) {
      const p00 = nodes[r * cols + c]!;
      const p10 = nodes[r * cols + c + 1]!;
      const p11 = nodes[(r + 1) * cols + c + 1]!;
      const p01 = nodes[(r + 1) * cols + c]!;

      const minX = Math.min(p00.x, p10.x, p11.x, p01.x) - 1;
      const maxX = Math.max(p00.x, p10.x, p11.x, p01.x) + 1;
      const minY = Math.min(p00.y, p10.y, p11.y, p01.y) - 1;
      const maxY = Math.max(p00.y, p10.y, p11.y, p01.y) + 1;
      if (dx < minX || dx > maxX || dy < minY || dy > maxY) continue;

      const cx = (p00.x + p10.x + p11.x + p01.x) * 0.25;
      const cy = (p00.y + p10.y + p11.y + p01.y) * 0.25;
      const cu = c + 0.5;
      const cv = r + 0.5;

      const hit =
        tryInverseTriangleBarycentric(dx, dy, p00.x, p00.y, c, r, p10.x, p10.y, c + 1, r, cx, cy, cu, cv)
        ?? tryInverseTriangleBarycentric(dx, dy, p10.x, p10.y, c + 1, r, p11.x, p11.y, c + 1, r + 1, cx, cy, cu, cv)
        ?? tryInverseTriangleBarycentric(dx, dy, p11.x, p11.y, c + 1, r + 1, p01.x, p01.y, c, r + 1, cx, cy, cu, cv)
        ?? tryInverseTriangleBarycentric(dx, dy, p01.x, p01.y, c, r + 1, p00.x, p00.y, c, r, cx, cy, cu, cv);
      if (hit) {
        seedUv = hit;
        break;
      }
    }
  }

  if (!seedUv) return null;
  if (mesh.patchMode !== "bicubic") {
    return evalMeshRestCoordinate(nodes, rows, cols, seedUv[0], seedUv[1]);
  }

  let u = seedUv[0];
  let v = seedUv[1];
  const eps = 1e-3;
  const maxU = cols - 1;
  const maxV = rows - 1;

  for (let iter = 0; iter < 3; iter += 1) {
    const [fx, fy] = evaluateMeshForwardBicubic(nodes, rows, cols, u, v);
    const errX = fx - dx;
    const errY = fy - dy;
    if (errX * errX + errY * errY < 1e-8) break;

    const uPlus = Math.min(maxU, u + eps);
    const uMinus = Math.max(0, u - eps);
    const vPlus = Math.min(maxV, v + eps);
    const vMinus = Math.max(0, v - eps);
    const [fxUp, fyUp] = evaluateMeshForwardBicubic(nodes, rows, cols, uPlus, v);
    const [fxUm, fyUm] = evaluateMeshForwardBicubic(nodes, rows, cols, uMinus, v);
    const [fxVp, fyVp] = evaluateMeshForwardBicubic(nodes, rows, cols, u, vPlus);
    const [fxVm, fyVm] = evaluateMeshForwardBicubic(nodes, rows, cols, u, vMinus);

    const duSpan = Math.max(1e-6, uPlus - uMinus);
    const dvSpan = Math.max(1e-6, vPlus - vMinus);
    const j00 = (fxUp - fxUm) / duSpan;
    const j10 = (fyUp - fyUm) / duSpan;
    const j01 = (fxVp - fxVm) / dvSpan;
    const j11 = (fyVp - fyVm) / dvSpan;
    const det = j00 * j11 - j01 * j10;
    if (Math.abs(det) < 1e-7) break;

    const stepU = (j11 * errX - j01 * errY) / det;
    const stepV = (-j10 * errX + j00 * errY) / det;
    u = clamp(u - clamp(stepU, -0.5, 0.5), 0, maxU);
    v = clamp(v - clamp(stepV, -0.5, 0.5), 0, maxV);
  }

  return evalMeshRestCoordinate(nodes, rows, cols, u, v);
}

/**
 * 리퀴파이 방사 변위 연산 목록을 목적지 좌표 `(dx, dy)`에 역매핑 적용해 원본 좌표 `(sx, sy)`를 반환한다.
 */
export function evaluateLiquifyRadialSourcePoint(
  ops: readonly StudioPackedLiquifyOp[],
  dx: number,
  dy: number,
): readonly [number, number] {
  let sx = dx;
  let sy = dy;

  for (let index = ops.length - 1; index >= 0; index -= 1) {
    const op = ops[index]!;
    if (op.radius <= 0 || op.strength === 0) continue;
    const rx = sx - op.centerX;
    const ry = sy - op.centerY;
    const distSq = rx * rx + ry * ry;
    if (distSq >= op.radius * op.radius) continue;

    const normDist = Math.sqrt(distSq) / op.radius;
    const innerEdge = clamp(op.hardness, 0, 0.95);
    const t = normDist <= innerEdge
      ? 0
      : (normDist - innerEdge) / Math.max(1e-5, 1 - innerEdge);
    const falloff = 0.5 * (1 + Math.cos(Math.PI * clamp(t, 0, 1)));
    const weight = falloff * clamp(op.strength, -1, 1);

    if (op.modeCode === 0) {
      sx -= op.deltaX * weight;
      sy -= op.deltaY * weight;
    } else if (op.modeCode === 1) {
      const factor = 1 - 0.45 * weight;
      sx = op.centerX + rx * factor;
      sy = op.centerY + ry * factor;
    } else if (op.modeCode === 2) {
      const factor = 1 + 0.45 * weight;
      sx = op.centerX + rx * factor;
      sy = op.centerY + ry * factor;
    } else if (op.modeCode === 3 || op.modeCode === 4) {
      const sign = op.modeCode === 3 ? -1 : 1;
      const angle = sign * (Math.PI / 3) * weight;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      sx = op.centerX + rx * cosA - ry * sinA;
      sy = op.centerY + rx * sinA + ry * cosA;
    }
  }

  return [sx, sy];
}

export function normalizeLiquifyOpsToPacked(
  ops: readonly StudioLiquifyRadialOp[] | undefined,
): readonly StudioPackedLiquifyOp[] {
  if (!ops || ops.length === 0) return [];
  return ops.map((op) => ({
    centerX: op.centerX,
    centerY: op.centerY,
    deltaX: op.deltaX ?? 0,
    deltaY: op.deltaY ?? 0,
    radius: Math.max(0, op.radius),
    strength: op.strength,
    modeCode: LIQUIFY_RADIAL_MODE_CODES[op.mode],
    hardness: op.hardness ?? 0.35,
  }));
}
