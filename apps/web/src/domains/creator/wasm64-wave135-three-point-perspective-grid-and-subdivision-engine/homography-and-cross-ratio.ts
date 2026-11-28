/**
 * Wave 135 — Hartley 정규화 DLT 3×3 Homography 및 사영 교차비(Cross-Ratio) 연산 커널.
 *
 * - 4점 대응은 Hartley 정규화 후 8×8 부분 피벗팅 가우스 소거로 조건수 제곱 없이
 *   `< 1e-12px` 정밀도로 계산하고, 5점 이상이거나 특이 피벗 시 9×9 자코비 고유벡터로 복원한다.
 */

import {
  mulMat3,
  type HomogeneousVec3,
  type Matrix3x3,
  type Vec2D,
} from "./perspective-types-and-math";

export interface PerspectiveQuad2D {
  readonly tl: Vec2D;
  readonly tr: Vec2D;
  readonly br: Vec2D;
  readonly bl: Vec2D;
}

export function polygonAreaQuad(q: PerspectiveQuad2D): number {
  const pts: readonly Vec2D[] = [q.tl, q.tr, q.br, q.bl];
  let sum = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) * 0.5;
}

function cross2d(a: Vec2D, b: Vec2D, c: Vec2D): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** 사변형이 비퇴화 볼록 사변형인지 검사한다. */
export function isConvexNonDegenerateQuad(quad: PerspectiveQuad2D): boolean {
  const pts: readonly Vec2D[] = [quad.tl, quad.tr, quad.br, quad.bl];
  for (let i = 0; i < 4; i += 1) {
    if (!Number.isFinite(pts[i].x) || !Number.isFinite(pts[i].y)) return false;
  }
  let sign = 0;
  for (let i = 0; i < 4; i += 1) {
    const c = cross2d(pts[i], pts[(i + 1) % 4], pts[(i + 2) % 4]);
    if (Math.abs(c) < 1e-6) return false;
    const s = c > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (sign !== s) return false;
  }
  return polygonAreaQuad(quad) > 1e-4;
}

export function intersectLinesHomogeneous(
  a1: Vec2D,
  a2: Vec2D,
  b1: Vec2D,
  b2: Vec2D,
): HomogeneousVec3 {
  const l1: HomogeneousVec3 = [a1.y - a2.y, a2.x - a1.x, a1.x * a2.y - a2.x * a1.y];
  const l2: HomogeneousVec3 = [b1.y - b2.y, b2.x - b1.x, b1.x * b2.y - b2.x * b1.y];
  const x = l1[1] * l2[2] - l1[2] * l2[1];
  const y = l1[2] * l2[0] - l1[0] * l2[2];
  const w = l1[0] * l2[1] - l1[1] * l2[0];
  if (Math.abs(w) < 1e-8 * Math.max(1, Math.hypot(x, y))) {
    const dx = a2.x - a1.x;
    const dy = a2.y - a1.y;
    const len = Math.hypot(dx, dy);
    return len > 1e-12 ? [dx / len, dy / len, 0] : [1, 0, 0];
  }
  return [x / w, y / w, 1];
}

/** 3×3 Homography 행렬의 역행렬을 계산한다. */
export function invertHomography3x3(h: Matrix3x3): Matrix3x3 {
  const c00 = h[4] * h[8] - h[5] * h[7];
  const c01 = -(h[3] * h[8] - h[5] * h[6]);
  const c02 = h[3] * h[7] - h[4] * h[6];
  const c10 = -(h[1] * h[8] - h[2] * h[7]);
  const c11 = h[0] * h[8] - h[2] * h[6];
  const c12 = -(h[0] * h[7] - h[1] * h[6]);
  const c20 = h[1] * h[5] - h[2] * h[4];
  const c21 = -(h[0] * h[5] - h[2] * h[3]);
  const c22 = h[0] * h[4] - h[1] * h[3];
  const det = h[0] * c00 + h[1] * c01 + h[2] * c02;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-14) {
    throw new Error("사영 변환 행렬이 특이(Singular) 상태여서 역변환할 수 없습니다.");
  }
  const invDet = 1 / det;
  const raw: Matrix3x3 = [
    c00 * invDet, c10 * invDet, c20 * invDet,
    c01 * invDet, c11 * invDet, c21 * invDet,
    c02 * invDet, c12 * invDet, c22 * invDet,
  ];
  const scale = Math.abs(raw[8]) > 1e-12 ? raw[8] : 1;
  return [
    raw[0] / scale, raw[1] / scale, raw[2] / scale,
    raw[3] / scale, raw[4] / scale, raw[5] / scale,
    raw[6] / scale, raw[7] / scale, raw[8] / scale,
  ];
}

/** 2D 점에 3×3 Homography 사영 변환을 적용한다. */
export function applyHomography(h: Matrix3x3, pt: Vec2D): Vec2D {
  const x = h[0] * pt.x + h[1] * pt.y + h[2];
  const y = h[3] * pt.x + h[4] * pt.y + h[5];
  const w = h[6] * pt.x + h[7] * pt.y + h[8];
  if (!Number.isFinite(w) || Math.abs(w) < 1e-12) {
    throw new Error("사영 변환 결과가 무한 원점에 수렴했습니다.");
  }
  return { x: x / w, y: y / w };
}

function normalizePointsHartley(pts: readonly Vec2D[]): {
  readonly normalized: readonly Vec2D[];
  readonly transform: Matrix3x3;
  readonly inverseTransform: Matrix3x3;
} {
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i += 1) {
    cx += pts[i].x;
    cy += pts[i].y;
  }
  cx /= pts.length;
  cy /= pts.length;
  let meanDist = 0;
  for (let i = 0; i < pts.length; i += 1) {
    meanDist += Math.hypot(pts[i].x - cx, pts[i].y - cy);
  }
  meanDist /= pts.length;
  const s = meanDist > 1e-12 ? Math.SQRT2 / meanDist : 1;
  const invS = 1 / s;
  return {
    normalized: pts.map((p) => ({ x: (p.x - cx) * s, y: (p.y - cy) * s })),
    transform: [s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1],
    inverseTransform: [invS, 0, cx, 0, invS, cy, 0, 0, 1],
  };
}

/** 8×8 부분 피벗팅 가우스 소거로 4점 정규화 Homography(`h8 = 1`)를 고정밀로 푼다. */
function solveExact4PointHomography8x8(
  src: readonly Vec2D[],
  dst: readonly Vec2D[],
): Matrix3x3 | null {
  const aug: number[][] = [];
  for (let k = 0; k < 4; k += 1) {
    const x = src[k].x;
    const y = src[k].y;
    const u = dst[k].x;
    const v = dst[k].y;
    aug.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    aug.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let col = 0; col < 8; col += 1) {
    let pivotRow = col;
    let maxVal = Math.abs(aug[col][col]);
    for (let r = col + 1; r < 8; r += 1) {
      const val = Math.abs(aug[r][col]);
      if (val > maxVal) {
        maxVal = val;
        pivotRow = r;
      }
    }
    if (!Number.isFinite(maxVal) || maxVal < 1e-12) return null;
    if (pivotRow !== col) {
      const tmp = aug[col];
      aug[col] = aug[pivotRow];
      aug[pivotRow] = tmp;
    }
    const pivot = aug[col][col];
    for (let r = col + 1; r < 8; r += 1) {
      const factor = aug[r][col] / pivot;
      if (factor === 0) continue;
      for (let c = col; c < 9; c += 1) {
        aug[r][c] -= factor * aug[col][c];
      }
    }
  }
  const sol = new Array<number>(8).fill(0);
  for (let r = 7; r >= 0; r -= 1) {
    let sum = aug[r][8];
    for (let c = r + 1; c < 8; c += 1) sum -= aug[r][c] * sol[c];
    sol[r] = sum / aug[r][r];
  }
  return [sol[0], sol[1], sol[2], sol[3], sol[4], sol[5], sol[6], sol[7], 1];
}

function smallestEigenvectorSymmetric9x9(ata: readonly number[]): readonly number[] {
  const n = 9;
  const a = ata.slice();
  const v = new Array<number>(81).fill(0);
  for (let i = 0; i < n; i += 1) v[i * n + i] = 1;

  for (let sweep = 0; sweep < 200; sweep += 1) {
    let maxOff = 0;
    let p = 0;
    let q = 1;
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const val = Math.abs(a[i * n + j]);
        if (val > maxOff) {
          maxOff = val;
          p = i;
          q = j;
        }
      }
    }
    if (maxOff < 1e-15) break;
    const app = a[p * n + p];
    const aqq = a[q * n + q];
    const apq = a[p * n + q];
    const tau = (aqq - app) / (2 * apq);
    const t =
      tau >= 0 ? 1 / (tau + Math.sqrt(1 + tau * tau)) : -1 / (-tau + Math.sqrt(1 + tau * tau));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;
    a[p * n + p] = app - t * apq;
    a[q * n + q] = aqq + t * apq;
    a[p * n + q] = 0;
    a[q * n + p] = 0;
    for (let r = 0; r < n; r += 1) {
      if (r !== p && r !== q) {
        const arp = a[r * n + p];
        const arq = a[r * n + q];
        a[r * n + p] = c * arp - s * arq;
        a[p * n + r] = a[r * n + p];
        a[r * n + q] = s * arp + c * arq;
        a[q * n + r] = a[r * n + q];
      }
      const vrp = v[r * n + p];
      const vrq = v[r * n + q];
      v[r * n + p] = c * vrp - s * vrq;
      v[r * n + q] = s * vrp + c * vrq;
    }
  }

  let minIdx = 0;
  let minVal = a[0];
  for (let i = 1; i < n; i += 1) {
    if (a[i * n + i] < minVal) {
      minVal = a[i * n + i];
      minIdx = i;
    }
  }
  return Array.from({ length: n }, (_, r) => v[r * n + minIdx]);
}

/**
 * 4쌍 이상의 대응점으로부터 Hartley 정규화 DLT(Direct Linear Transform)로
 * 정확한 3×3 사영 변환 행렬(Homography)을 계산한다.
 */
export function computeHomographyNormalizedDlt(
  srcPoints: readonly Vec2D[],
  dstPoints: readonly Vec2D[],
): Matrix3x3 {
  if (srcPoints.length < 4 || srcPoints.length !== dstPoints.length) {
    throw new Error("Homography 계산에는 최소 4쌍의 대응점이 필요합니다.");
  }
  const srcNorm = normalizePointsHartley(srcPoints);
  const dstNorm = normalizePointsHartley(dstPoints);

  let hNormMat: Matrix3x3 | null = null;
  if (srcPoints.length === 4) {
    hNormMat = solveExact4PointHomography8x8(srcNorm.normalized, dstNorm.normalized);
  }
  if (hNormMat === null) {
    const ata = new Array<number>(81).fill(0);
    const accRow = (row: readonly number[]): void => {
      for (let i = 0; i < 9; i += 1) {
        const ri = row[i];
        if (ri === 0) continue;
        for (let j = i; j < 9; j += 1) ata[i * 9 + j] += ri * row[j];
      }
    };
    for (let k = 0; k < srcPoints.length; k += 1) {
      const x = srcNorm.normalized[k].x;
      const y = srcNorm.normalized[k].y;
      const u = dstNorm.normalized[k].x;
      const v = dstNorm.normalized[k].y;
      accRow([-x, -y, -1, 0, 0, 0, u * x, u * y, u]);
      accRow([0, 0, 0, -x, -y, -1, v * x, v * y, v]);
    }
    for (let i = 0; i < 9; i += 1) {
      for (let j = 0; j < i; j += 1) ata[i * 9 + j] = ata[j * 9 + i];
    }
    const h = smallestEigenvectorSymmetric9x9(ata);
    hNormMat = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], h[8]];
  }

  const raw = mulMat3(dstNorm.inverseTransform, mulMat3(hNormMat, srcNorm.transform));
  const scale = Math.abs(raw[8]) > 1e-12 ? raw[8] : Math.hypot(raw[0], raw[4], raw[8]);
  return [
    raw[0] / scale, raw[1] / scale, raw[2] / scale,
    raw[3] / scale, raw[4] / scale, raw[5] / scale,
    raw[6] / scale, raw[7] / scale, raw[8] / scale,
  ];
}

/** 1차원 좌표 4개 `(a, b, c, d)`의 사영 교차비 `((c-a)*(d-b)) / ((c-b)*(d-a))`를 계산한다. */
export function computeCrossRatio1D(a: number, b: number, c: number, d: number): number {
  const denom = (c - b) * (d - a);
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-14) {
    throw new Error("교차비 분모가 0에 근접하여 계산할 수 없습니다.");
  }
  return ((c - a) * (d - b)) / denom;
}

/** 동일 직선 위의 2D 네 점 `(a, b, c, d)`의 사영 교차비를 계산한다. */
export function computeCollinearCrossRatio2D(a: Vec2D, b: Vec2D, c: Vec2D, d: Vec2D): number {
  const dx = d.x - a.x;
  const dy = d.y - a.y;
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len < 1e-12) {
    throw new Error("교차비 기준 양 끝점이 일치합니다.");
  }
  const ux = dx / len;
  const uy = dy / len;
  return computeCrossRatio1D(
    0,
    (b.x - a.x) * ux + (b.y - a.y) * uy,
    (c.x - a.x) * ux + (c.y - a.y) * uy,
    len,
  );
}
