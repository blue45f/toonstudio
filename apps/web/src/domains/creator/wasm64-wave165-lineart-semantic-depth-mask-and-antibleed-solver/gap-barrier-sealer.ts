/**
 * Wave 165: 열린 펜선 틈(1..3px) 정밀 봉합 배리어 빌더.
 *
 * - 기존 선화를 굵어지게 하지 않으면서 1..3px 끊긴 윤곽선과 T-자 언더슛만 얇은 브리지로 봉합한다.
 * - 평행선 사이나 예각 코너를 오인해 메우지 않도록 다축 벽면 검사·진행 방향 연속성·잉크 지오데식 가드를 적용한다.
 */

import {
  assertValidLineartRaster,
  type GapSealedBarrierResult,
  type LineartRasterInput,
  type LineartSegmentationOptions,
} from "./semantic-mask-types";

const DEFAULT_INK_BARRIER_THRESHOLD = 128;
const DEFAULT_MAX_GAP_CLOSE_PX = 3;

const AXES_4: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

const RING_8: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const rounded = Math.round(value);
  return rounded < min ? min : rounded > max ? max : rounded;
}

function isInBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

function isInkAt(rawInk: Uint8Array, width: number, height: number, x: number, y: number): boolean {
  return isInBounds(x, y, width, height) && rawInk[y * width + x] === 1;
}

function countContiguousRun(
  rawInk: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  dx: number,
  dy: number,
  maxSteps: number,
): number {
  let run = 0;
  for (let step = 1; step <= maxSteps; step += 1) {
    if (!isInkAt(rawInk, width, height, x + dx * step, y + dy * step)) {
      break;
    }
    run += 1;
  }
  return run;
}

/**
 * 후보 픽셀 `(ex, ey)`가 축 `axisIdx` 방향(`behindX, behindY`가 뒤쪽)으로 접근하는 실제 펜선 끝단인지 판정한다.
 * - 뒤쪽 축으로 최소 2px 이상 펜선이 이어져야 하며,
 * - 브리지 축의 수직 두께는 3px 이하, 나머지 모든 비(非)브리지 축 연속 길이는 4px 이하여야 한다.
 * 이로써 평행선, 닫힌 곡선 외측, 사각 벽면 모서리를 틈 끝단으로 오인하지 않는다.
 */
function isApproachingStrokeEnd(
  rawInk: Uint8Array,
  width: number,
  height: number,
  ex: number,
  ey: number,
  axisIdx: number,
  behindX: number,
  behindY: number,
): boolean {
  const backRun = 1 + countContiguousRun(rawInk, width, height, ex, ey, behindX, behindY, 5);
  if (backRun < 2) {
    return false;
  }
  const dx = AXES_4[axisIdx][0];
  const dy = AXES_4[axisIdx][1];
  const perpX = -dy;
  const perpY = dx;
  const perpSpan =
    1 +
    countContiguousRun(rawInk, width, height, ex, ey, perpX, perpY, 4) +
    countContiguousRun(rawInk, width, height, ex, ey, -perpX, -perpY, 4);
  if (perpSpan > 3) {
    return false;
  }
  for (let a = 0; a < AXES_4.length; a += 1) {
    if (a === axisIdx) {
      continue;
    }
    const ux = AXES_4[a][0];
    const uy = AXES_4[a][1];
    const span =
      1 +
      countContiguousRun(rawInk, width, height, ex, ey, ux, uy, 5) +
      countContiguousRun(rawInk, width, height, ex, ey, -ux, -uy, 5);
    if (span > 4) {
      return false;
    }
  }
  return true;
}

/** 두 잉크 픽셀 간 8-연결 잉크 지오데식 거리가 `maxSteps`를 초과하는지 검사한다. */
function inkGeodesicExceeds(
  rawInk: Uint8Array,
  width: number,
  height: number,
  startIdx: number,
  targetIdx: number,
  maxSteps: number,
  visitMarks: Int32Array,
  visitToken: number,
  bfsQueue: Int32Array,
  bfsDist: Int32Array,
): boolean {
  if (startIdx === targetIdx) {
    return false;
  }
  let head = 0;
  let tail = 0;
  bfsQueue[tail] = startIdx;
  bfsDist[tail] = 0;
  tail += 1;
  visitMarks[startIdx] = visitToken;

  while (head < tail) {
    const cur = bfsQueue[head];
    const dist = bfsDist[head];
    head += 1;
    if (dist >= maxSteps) {
      continue;
    }
    const cx = cur % width;
    const cy = (cur - cx) / width;
    for (let k = 0; k < RING_8.length; k += 1) {
      const nx = cx + RING_8[k][0];
      const ny = cy + RING_8[k][1];
      if (!isInBounds(nx, ny, width, height)) {
        continue;
      }
      const nIdx = ny * width + nx;
      if (rawInk[nIdx] !== 1 || visitMarks[nIdx] === visitToken) {
        continue;
      }
      if (nIdx === targetIdx) {
        return false;
      }
      visitMarks[nIdx] = visitToken;
      bfsQueue[tail] = nIdx;
      bfsDist[tail] = dist + 1;
      tail += 1;
    }
  }
  return true;
}

/** 8-이웃 순환 전이 수와 이웃 개수로 펜선 끝단 방향 벡터를 추정한다. */
function detectStrokeTipDirection(
  rawInk: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): { readonly fwdX: number; readonly fwdY: number } | null {
  let inkCount = 0;
  let transitions = 0;
  let sumX = 0;
  let sumY = 0;
  let prev = 0;
  let first = 0;

  for (let k = 0; k < 8; k += 1) {
    const nx = x + RING_8[k][0];
    const ny = y + RING_8[k][1];
    const val = isInkAt(rawInk, width, height, nx, ny) ? 1 : 0;
    if (k === 0) {
      first = val;
    } else if (prev === 0 && val === 1) {
      transitions += 1;
    }
    if (val === 1) {
      inkCount += 1;
      sumX += RING_8[k][0];
      sumY += RING_8[k][1];
    }
    prev = val;
  }
  if (prev === 0 && first === 1) {
    transitions += 1;
  }
  if (inkCount < 1 || inkCount > 3 || transitions !== 1) {
    return null;
  }
  const len = Math.hypot(sumX, sumY);
  return len < 1e-6 ? null : { fwdX: -sumX / len, fwdY: -sumY / len };
}

function traceOpenBresenhamPoints(
  rawInk: Uint8Array,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number[] | null {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let cx = x0;
  let cy = y0;
  const points: number[] = [];

  while (true) {
    if (!(cx === x0 && cy === y0) && !(cx === x1 && cy === y1)) {
      const idx = cy * width + cx;
      if (rawInk[idx] === 1) {
        return null;
      }
      points.push(idx);
    }
    if (cx === x1 && cy === y1) {
      break;
    }
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      cx += sx;
    }
    if (e2 < dx) {
      err += dx;
      cy += sy;
    }
  }
  return points;
}

function hasAdjacentBridge(
  bridgeMask: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): boolean {
  for (let k = 0; k < RING_8.length; k += 1) {
    const nx = x + RING_8[k][0];
    const ny = y + RING_8[k][1];
    if (isInBounds(nx, ny, width, height) && bridgeMask[ny * width + nx] === 1) {
      return true;
    }
  }
  return false;
}

function countEightConnectedComponents(mask: Uint8Array, width: number, height: number): number {
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let count = 0;

  for (let idx = 0; idx < mask.length; idx += 1) {
    if (mask[idx] !== 1 || visited[idx] === 1) {
      continue;
    }
    count += 1;
    let head = 0;
    let tail = 0;
    queue[tail] = idx;
    tail += 1;
    visited[idx] = 1;

    while (head < tail) {
      const cur = queue[head];
      head += 1;
      const cx = cur % width;
      const cy = (cur - cx) / width;
      for (let k = 0; k < RING_8.length; k += 1) {
        const nx = cx + RING_8[k][0];
        const ny = cy + RING_8[k][1];
        if (!isInBounds(nx, ny, width, height)) {
          continue;
        }
        const nIdx = ny * width + nx;
        if (mask[nIdx] === 1 && visited[nIdx] === 0) {
          visited[nIdx] = 1;
          queue[tail] = nIdx;
          tail += 1;
        }
      }
    }
  }
  return count;
}

/**
 * 1..3px 열린 펜선 틈만 정밀 봉합해 영역 분할 누수를 막는 배리어 빌더.
 * 4축 방향 연속성 검사 + 끝점 브레젠험 브리지 + 지오데식 거리 가드로 기존 선화 굵어짐을 방지한다.
 */
export function buildGapSealedInkBarrier(
  raster: LineartRasterInput,
  options: LineartSegmentationOptions = {},
): GapSealedBarrierResult {
  assertValidLineartRaster(raster);
  const { width, height, inkAlpha } = raster;
  const totalPixels = width * height;
  const inkBarrierThreshold = clampInt(
    options.inkBarrierThreshold ?? DEFAULT_INK_BARRIER_THRESHOLD,
    1,
    255,
  );
  const maxGapClosePx = clampInt(options.maxGapClosePx ?? DEFAULT_MAX_GAP_CLOSE_PX, 0, 6);

  const rawInkMask = new Uint8Array(totalPixels);
  let rawInkPixelCount = 0;
  for (let i = 0; i < totalPixels; i += 1) {
    if (inkAlpha[i] >= inkBarrierThreshold) {
      rawInkMask[i] = 1;
      rawInkPixelCount += 1;
    }
  }

  const bridgeOnlyMask = new Uint8Array(totalPixels);
  const sealedBarrierMask = new Uint8Array(rawInkMask);

  if (maxGapClosePx > 0 && rawInkPixelCount > 0) {
    const visitMarks = new Int32Array(totalPixels);
    const bfsQueue = new Int32Array(totalPixels);
    const bfsDist = new Int32Array(totalPixels);
    let visitToken = 0;

    // Pass 1: 4축 직선·대각 틈 스캔 (한쪽 이상 끝점이 해당 축 방향으로 진행하는 실제 선 끝단일 때만 봉합)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        if (rawInkMask[idx] === 1) {
          continue;
        }

        let shouldBridge = false;
        for (let a = 0; a < AXES_4.length && !shouldBridge; a += 1) {
          const dx = AXES_4[a][0];
          const dy = AXES_4[a][1];

          let dNeg = 0;
          for (let step = 1; step <= maxGapClosePx; step += 1) {
            if (isInkAt(rawInkMask, width, height, x - dx * step, y - dy * step)) {
              dNeg = step;
              break;
            }
          }
          if (dNeg === 0) {
            continue;
          }

          let dPos = 0;
          const maxPosStep = maxGapClosePx - dNeg + 1;
          for (let step = 1; step <= maxPosStep; step += 1) {
            if (isInkAt(rawInkMask, width, height, x + dx * step, y + dy * step)) {
              dPos = step;
              break;
            }
          }
          if (dPos === 0) {
            continue;
          }

          const gapSpan = dNeg + dPos - 1;
          if (gapSpan < 1 || gapSpan > maxGapClosePx) {
            continue;
          }

          const e1x = x - dx * dNeg;
          const e1y = y - dy * dNeg;
          const e2x = x + dx * dPos;
          const e2y = y + dy * dPos;

          const e1Approaches = isApproachingStrokeEnd(rawInkMask, width, height, e1x, e1y, a, -dx, -dy);
          const e2Approaches = isApproachingStrokeEnd(rawInkMask, width, height, e2x, e2y, a, dx, dy);
          if (!e1Approaches && !e2Approaches) {
            continue;
          }

          visitToken += 1;
          if (
            inkGeodesicExceeds(
              rawInkMask,
              width,
              height,
              e1y * width + e1x,
              e2y * width + e2x,
              gapSpan * 3 + 2,
              visitMarks,
              visitToken,
              bfsQueue,
              bfsDist,
            )
          ) {
            shouldBridge = true;
          }
        }

        if (shouldBridge) {
          bridgeOnlyMask[idx] = 1;
          sealedBarrierMask[idx] = 1;
        }
      }
    }

    // Pass 2: Pass 1에서 아직 봉합되지 않은 곡선 끝점만 진행 접선 방향(cos >= 0.65)으로 1px 브리지 연결
    const searchRadius = maxGapClosePx + 1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const startIdx = y * width + x;
        if (rawInkMask[startIdx] !== 1 || hasAdjacentBridge(bridgeOnlyMask, width, height, x, y)) {
          continue;
        }
        const tip = detectStrokeTipDirection(rawInkMask, width, height, x, y);
        if (!tip) {
          continue;
        }

        let bestPoints: number[] | null = null;
        let bestDistSq = Number.POSITIVE_INFINITY;
        const minY = Math.max(0, y - searchRadius);
        const maxY = Math.min(height - 1, y + searchRadius);
        const minX = Math.max(0, x - searchRadius);
        const maxX = Math.min(width - 1, x + searchRadius);

        for (let ty = minY; ty <= maxY; ty += 1) {
          for (let tx = minX; tx <= maxX; tx += 1) {
            const targetIdx = ty * width + tx;
            if (targetIdx === startIdx || rawInkMask[targetIdx] !== 1) {
              continue;
            }
            const vx = tx - x;
            const vy = ty - y;
            const distSq = vx * vx + vy * vy;
            if (distSq < 2 || distSq > searchRadius * searchRadius + 1 || distSq >= bestDistSq) {
              continue;
            }
            const dist = Math.sqrt(distSq);
            if ((vx * tip.fwdX + vy * tip.fwdY) / dist < 0.65) {
              continue;
            }
            const openPts = traceOpenBresenhamPoints(rawInkMask, width, x, y, tx, ty);
            if (!openPts || openPts.length === 0 || openPts.length > maxGapClosePx) {
              continue;
            }
            visitToken += 1;
            if (
              !inkGeodesicExceeds(
                rawInkMask,
                width,
                height,
                startIdx,
                targetIdx,
                Math.ceil(dist * 3) + 2,
                visitMarks,
                visitToken,
                bfsQueue,
                bfsDist,
              )
            ) {
              continue;
            }
            bestDistSq = distSq;
            bestPoints = openPts;
          }
        }

        if (bestPoints) {
          for (let i = 0; i < bestPoints.length; i += 1) {
            const pIdx = bestPoints[i];
            if (sealedBarrierMask[pIdx] === 0) {
              bridgeOnlyMask[pIdx] = 1;
              sealedBarrierMask[pIdx] = 1;
            }
          }
        }
      }
    }
  }

  let bridgePixelCount = 0;
  for (let i = 0; i < totalPixels; i += 1) {
    if (bridgeOnlyMask[i] === 1) {
      bridgePixelCount += 1;
    }
  }

  return {
    width,
    height,
    inkBarrierThreshold,
    maxGapClosePx,
    rawInkMask,
    sealedBarrierMask,
    bridgeOnlyMask,
    rawInkPixelCount,
    bridgePixelCount,
    closedGapCount: countEightConnectedComponents(bridgeOnlyMask, width, height),
    thickeningRatio: rawInkPixelCount > 0 ? bridgePixelCount / rawInkPixelCount : 0,
  };
}
