/**
 * WebGPU 자동 플랫팅 엔진의 거리장(EDT) · 형태학적 틈새 봉합 · Jump Flooding(JFA) CPU 동치 커널.
 *
 * - `runMorphologicalGapCloseCpu`: `WGSL_GAP_CLOSE_MORPH_SHADER`(원형 팽창·침식)와 비트 동치인 O(W×H) Exact EDT 커널
 * - `computeJumpFloodDistanceField`: `WGSL_JUMP_FLOOD_STEP_SHADER`와 동치인 O(log N) 9-탭 JFA+1 거리장
 * - `runSparseHaloJumpFloodCpu`: 희소 헤일로 영역에 대한 JFA+1 보로노이 라벨 전파
 */

import type { RgbaColorTuple } from "./webgpu-flatting-demo-scene";
import { EMPTY_JFA_COORD } from "./webgpu-flatting-wgsl-shaders";

export const DEFAULT_INK_LUMINANCE_THRESHOLD = 185;
const INF_DIST_SQ = 1e9;

export interface JumpFloodDistanceFieldResult {
  readonly width: number;
  readonly height: number;
  readonly passCount: number;
  readonly nearestSeedCoords: Uint32Array;
  readonly distancePx: Float32Array;
  readonly durationMs: number;
}

export function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const rounded = Math.round(value);
  return rounded < min ? min : rounded > max ? max : rounded;
}

export function packCoord(x: number, y: number): number {
  return (((y & 0xffff) << 16) | (x & 0xffff)) >>> 0;
}

export function packRgba(color: RgbaColorTuple): number {
  const r = clampInt(color[0], 0, 255);
  const g = clampInt(color[1], 0, 255);
  const b = clampInt(color[2], 0, 255);
  const a = clampInt(color[3], 0, 255);
  return (r | (g << 8) | (b << 16) | (a << 24)) >>> 0;
}

export function paperLuminanceFromRgba(rgba: Uint8ClampedArray, pixelIndex: number): number {
  const off = pixelIndex * 4;
  if (off + 3 >= rgba.length) return 255;
  const r = rgba[off] ?? 255;
  const g = rgba[off + 1] ?? 255;
  const b = rgba[off + 2] ?? 255;
  const a = (rgba[off + 3] ?? 0) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 255 - a * (255 - lum);
}

/**
 * RGBA 선화 버퍼에서 이진 먹선 장벽(1=선화, 0=열림)을 추출한다.
 */
export function extractInkBarrierFromRgba(
  lineartRgba: Uint8ClampedArray,
  width: number,
  height: number,
  inkLuminanceThreshold: number = DEFAULT_INK_LUMINANCE_THRESHOLD,
): Uint8Array {
  const safeW = Math.max(0, Math.floor(width));
  const safeH = Math.max(0, Math.floor(height));
  const total = safeW * safeH;
  const barrier = new Uint8Array(total);
  if (total === 0) return barrier;

  const threshold = clampInt(inkLuminanceThreshold, 8, 250);
  for (let i = 0; i < total; i += 1) {
    if (paperLuminanceFromRgba(lineartRgba, i) <= threshold) {
      barrier[i] = 1;
    }
  }
  return barrier;
}

function edt1d(
  f: Float32Array,
  n: number,
  out: Float32Array,
  v: Int32Array,
  z: Float32Array,
): void {
  let k = 0;
  v[0] = 0;
  z[0] = -INF_DIST_SQ;
  z[1] = INF_DIST_SQ;

  for (let q = 1; q < n; q += 1) {
    const fq = f[q] ?? INF_DIST_SQ;
    if (fq >= INF_DIST_SQ * 0.5) continue;
    let s = 0;
    while (k >= 0) {
      const vk = v[k] ?? 0;
      const fvk = f[vk] ?? INF_DIST_SQ;
      if (fvk >= INF_DIST_SQ * 0.5) {
        k -= 1;
        continue;
      }
      s = (fq + q * q - (fvk + vk * vk)) / (2 * (q - vk));
      if (s <= (z[k] ?? -INF_DIST_SQ)) {
        k -= 1;
      } else {
        break;
      }
    }
    k += 1;
    v[k] = q;
    z[k] = k === 0 ? -INF_DIST_SQ : s;
    z[k + 1] = INF_DIST_SQ;
  }

  let cursor = 0;
  for (let q = 0; q < n; q += 1) {
    while ((z[cursor + 1] ?? INF_DIST_SQ) < q) {
      cursor += 1;
    }
    const vk = v[cursor] ?? 0;
    const fvk = f[vk] ?? INF_DIST_SQ;
    if (fvk >= INF_DIST_SQ * 0.5) {
      out[q] = INF_DIST_SQ;
    } else {
      const diff = q - vk;
      out[q] = diff * diff + fvk;
    }
  }
}

function computeExactSquaredDistanceToValue(
  mask: Uint8Array,
  width: number,
  height: number,
  featureValue: 0 | 1,
): Float32Array {
  const total = width * height;
  const distSq = new Float32Array(total);
  if (total === 0) return distSq;

  const maxDim = Math.max(width, height);
  const f = new Float32Array(maxDim);
  const d = new Float32Array(maxDim);
  const v = new Int32Array(maxDim);
  const z = new Float32Array(maxDim + 1);
  const colPass = new Float32Array(total);

  for (let x = 0; x < width; x += 1) {
    let hasFeature = false;
    for (let y = 0; y < height; y += 1) {
      const match = (mask[y * width + x] ?? 0) === featureValue;
      f[y] = match ? 0 : INF_DIST_SQ;
      if (match) hasFeature = true;
    }
    if (!hasFeature) {
      for (let y = 0; y < height; y += 1) colPass[y * width + x] = INF_DIST_SQ;
      continue;
    }
    edt1d(f, height, d, v, z);
    for (let y = 0; y < height; y += 1) colPass[y * width + x] = d[y] ?? INF_DIST_SQ;
  }

  for (let y = 0; y < height; y += 1) {
    const rowOff = y * width;
    let hasFinite = false;
    for (let x = 0; x < width; x += 1) {
      const val = colPass[rowOff + x] ?? INF_DIST_SQ;
      f[x] = val;
      if (val < INF_DIST_SQ * 0.5) hasFinite = true;
    }
    if (!hasFinite) {
      for (let x = 0; x < width; x += 1) distSq[rowOff + x] = INF_DIST_SQ;
      continue;
    }
    edt1d(f, width, d, v, z);
    for (let x = 0; x < width; x += 1) distSq[rowOff + x] = d[x] ?? INF_DIST_SQ;
  }

  return distSq;
}

/**
 * `WGSL_GAP_CLOSE_MORPH_SHADER`(`gap_close_dilate` + `gap_close_erode`)와 수학적으로 비트 동치인
 * O(W×H) 원형 팽창·침식 커널.
 */
export function runMorphologicalGapCloseCpu(
  originalInk: Uint8Array,
  width: number,
  height: number,
  radiusPx: number,
): Uint8Array {
  const total = width * height;
  if (radiusPx <= 0 || total === 0) {
    return new Uint8Array(originalInk);
  }

  const dilateRSq = radiusPx * radiusPx;
  const distToInkSq = computeExactSquaredDistanceToValue(originalInk, width, height, 1);
  const dilated = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    if ((distToInkSq[i] ?? INF_DIST_SQ) <= dilateRSq) {
      dilated[i] = 1;
    }
  }

  const erodeRadius = Math.floor(radiusPx / 2);
  if (erodeRadius <= 0) {
    for (let i = 0; i < total; i += 1) {
      if (originalInk[i] === 1) dilated[i] = 1;
    }
    return dilated;
  }

  const erodeRSq = erodeRadius * erodeRadius;
  const distToOpenSq = computeExactSquaredDistanceToValue(dilated, width, height, 0);
  const closed = new Uint8Array(total);

  for (let y = 0; y < height; y += 1) {
    const rowOff = y * width;
    const edgeY = Math.min(y + 1, height - y);
    for (let x = 0; x < width; x += 1) {
      const idx = rowOff + x;
      if (originalInk[idx] === 1) {
        closed[idx] = 1;
        continue;
      }
      if (dilated[idx] === 0) continue;
      const edgeDist = Math.min(x + 1, width - x, edgeY);
      const minZeroDistSq = Math.min(distToOpenSq[idx] ?? INF_DIST_SQ, edgeDist * edgeDist);
      if (minZeroDistSq > erodeRSq) {
        closed[idx] = 1;
      }
    }
  }

  return closed;
}

export function buildJfaStepSchedule(maxSpan: number): number[] {
  if (maxSpan <= 1) return [];
  let step = 1;
  while (step * 2 < maxSpan) {
    step *= 2;
  }
  const steps: number[] = [];
  while (step >= 1) {
    steps.push(step);
    step = Math.floor(step / 2);
  }
  steps.push(1);
  return steps;
}

/**
 * `WGSL_JUMP_FLOOD_STEP_SHADER`와 완전 동치인 O(log N) 9-탭 Jump Flooding Algorithm(JFA+1) 거리장 계산기.
 */
export function computeJumpFloodDistanceField(
  featureMask: Uint8Array,
  width: number,
  height: number,
): JumpFloodDistanceFieldResult {
  const startedAt = nowMs();
  const safeW = Math.max(0, Math.floor(width));
  const safeH = Math.max(0, Math.floor(height));
  const total = safeW * safeH;
  const nearestSeedCoords = new Uint32Array(total);
  const distancePx = new Float32Array(total);

  if (total === 0) {
    return {
      width: safeW,
      height: safeH,
      passCount: 0,
      nearestSeedCoords,
      distancePx,
      durationMs: Math.max(0, nowMs() - startedAt),
    };
  }

  let src = new Uint32Array(total);
  let dst = new Uint32Array(total);
  let hasAnyFeature = false;

  for (let y = 0; y < safeH; y += 1) {
    const rowOff = y * safeW;
    for (let x = 0; x < safeW; x += 1) {
      const idx = rowOff + x;
      if ((featureMask[idx] ?? 0) > 0) {
        src[idx] = packCoord(x, y);
        hasAnyFeature = true;
      } else {
        src[idx] = EMPTY_JFA_COORD;
      }
    }
  }

  if (!hasAnyFeature) {
    nearestSeedCoords.fill(EMPTY_JFA_COORD);
    distancePx.fill(Number.POSITIVE_INFINITY);
    return {
      width: safeW,
      height: safeH,
      passCount: 0,
      nearestSeedCoords,
      distancePx,
      durationMs: Math.max(0, nowMs() - startedAt),
    };
  }

  const steps = buildJfaStepSchedule(Math.max(safeW, safeH));
  for (const step of steps) {
    for (let y = 0; y < safeH; y += 1) {
      const rowOff = y * safeW;
      for (let x = 0; x < safeW; x += 1) {
        const idx = rowOff + x;
        let bestCoord = src[idx] ?? EMPTY_JFA_COORD;
        let bestDistSq = 0xffffffff;
        if (bestCoord !== EMPTY_JFA_COORD) {
          const bdx = x - (bestCoord & 0xffff);
          const bdy = y - (bestCoord >>> 16);
          bestDistSq = bdx * bdx + bdy * bdy;
          if (bestDistSq === 0) {
            dst[idx] = bestCoord;
            continue;
          }
        }

        for (let oy = -1; oy <= 1; oy += 1) {
          const ny = y + oy * step;
          if (ny < 0 || ny >= safeH) continue;
          const nRowOff = ny * safeW;
          for (let ox = -1; ox <= 1; ox += 1) {
            const nx = x + ox * step;
            if (nx < 0 || nx >= safeW) continue;
            const candCoord = src[nRowOff + nx] ?? EMPTY_JFA_COORD;
            if (candCoord === EMPTY_JFA_COORD) continue;
            const dx = x - (candCoord & 0xffff);
            const dy = y - (candCoord >>> 16);
            const d2 = dx * dx + dy * dy;
            if (d2 < bestDistSq || (d2 === bestDistSq && candCoord < bestCoord)) {
              bestDistSq = d2;
              bestCoord = candCoord;
            }
          }
        }
        dst[idx] = bestCoord;
      }
    }
    const swap = src;
    src = dst;
    dst = swap;
  }

  nearestSeedCoords.set(src);
  for (let y = 0; y < safeH; y += 1) {
    const rowOff = y * safeW;
    for (let x = 0; x < safeW; x += 1) {
      const idx = rowOff + x;
      const coord = nearestSeedCoords[idx] ?? EMPTY_JFA_COORD;
      distancePx[idx] =
        coord === EMPTY_JFA_COORD
          ? Number.POSITIVE_INFINITY
          : Math.hypot(x - (coord & 0xffff), y - (coord >>> 16));
    }
  }

  return {
    width: safeW,
    height: safeH,
    passCount: steps.length,
    nearestSeedCoords,
    distancePx,
    durationMs: Math.max(0, nowMs() - startedAt),
  };
}

function isSegmentBlockedByInk(
  inkMask: Uint8Array,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const steps = Math.max(dx, dy);
  if (steps === 0) return false;
  const sx = x1 >= x0 ? 1 : -1;
  const sy = y1 >= y0 ? 1 : -1;
  let cx = x0;
  let cy = y0;
  let err = dx - dy;
  const maxIter = steps * 2 + 2;

  for (let iter = 0; iter < maxIter; iter += 1) {
    if (cx === x1 && cy === y1) return false;
    const e2 = err * 2;
    const stepX = e2 > -dy && cx !== x1;
    const stepY = e2 < dx && cy !== y1;
    if (stepX && stepY) {
      const nx = cx + sx;
      const ny = cy + sy;
      const sideXInk = (inkMask[cy * width + nx] ?? 0) !== 0;
      const sideYInk = (inkMask[ny * width + cx] ?? 0) !== 0;
      const diagInk = (inkMask[ny * width + nx] ?? 0) !== 0;
      if (diagInk || (sideXInk && sideYInk)) return true;
      err = err - dy + dx;
      cx = nx;
      cy = ny;
    } else if (stepX) {
      err -= dy;
      cx += sx;
      if ((inkMask[cy * width + cx] ?? 0) !== 0) return true;
    } else if (stepY) {
      err += dx;
      cy += sy;
      if ((inkMask[cy * width + cx] ?? 0) !== 0) return true;
    }
  }
  return false;
}

export function runSparseHaloJumpFloodCpu(params: {
  readonly coreLabels: Uint32Array;
  readonly originalInk: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly gapClosePx: number;
}): { readonly jfaLabels: Uint32Array; readonly passCount: number } {
  const { coreLabels, originalInk, width, height, gapClosePx } = params;
  const total = width * height;
  const haloIndices: number[] = [];

  let srcCoords = new Uint32Array(total);
  let srcLabels = new Uint32Array(total);

  for (let y = 0; y < height; y += 1) {
    const rowOff = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = rowOff + x;
      const label = coreLabels[idx] ?? 0;
      if (label > 0) {
        srcCoords[idx] = packCoord(x, y);
        srcLabels[idx] = label;
      } else {
        srcCoords[idx] = EMPTY_JFA_COORD;
        srcLabels[idx] = 0;
        if (originalInk[idx] === 0) haloIndices.push(idx);
      }
    }
  }

  if (haloIndices.length === 0) {
    return { jfaLabels: srcLabels, passCount: 0 };
  }

  void gapClosePx;
  const steps = buildJfaStepSchedule(Math.max(width, height));
  let dstCoords = new Uint32Array(srcCoords);
  let dstLabels = new Uint32Array(srcLabels);

  for (const step of steps) {
    for (let i = 0; i < haloIndices.length; i += 1) {
      const idx = haloIndices[i] ?? 0;
      const x = idx % width;
      const y = (idx - x) / width;

      let bestCoord = srcCoords[idx] ?? EMPTY_JFA_COORD;
      let bestLabel = srcLabels[idx] ?? 0;
      let bestDistSq = 0xffffffff;

      if (bestCoord !== EMPTY_JFA_COORD) {
        const bdx = x - (bestCoord & 0xffff);
        const bdy = y - (bestCoord >>> 16);
        bestDistSq = bdx * bdx + bdy * bdy;
      }

      for (let oy = -1; oy <= 1; oy += 1) {
        const ny = y + oy * step;
        if (ny < 0 || ny >= height) continue;
        const nRowOff = ny * width;
        for (let ox = -1; ox <= 1; ox += 1) {
          const nx = x + ox * step;
          if (nx < 0 || nx >= width) continue;
          const nIdx = nRowOff + nx;
          const candCoord = srcCoords[nIdx] ?? EMPTY_JFA_COORD;
          if (candCoord === EMPTY_JFA_COORD) continue;
          const candLabel = srcLabels[nIdx] ?? 0;
          const dx = x - (candCoord & 0xffff);
          const dy = y - (candCoord >>> 16);
          const d2 = dx * dx + dy * dy;
          const isBetter =
            d2 < bestDistSq ||
            (d2 === bestDistSq &&
              (candLabel < bestLabel || (candLabel === bestLabel && candCoord < bestCoord)));
          if (isBetter) {
            if (isSegmentBlockedByInk(originalInk, width, x, y, nx, ny)) continue;
            bestDistSq = d2;
            bestCoord = candCoord;
            bestLabel = candLabel;
          }
        }
      }

      dstCoords[idx] = bestCoord;
      dstLabels[idx] = bestLabel;
    }

    const swapC = srcCoords;
    srcCoords = dstCoords;
    dstCoords = swapC;
    const swapL = srcLabels;
    srcLabels = dstLabels;
    dstLabels = swapL;
  }

  return { jfaLabels: srcLabels, passCount: steps.length };
}
