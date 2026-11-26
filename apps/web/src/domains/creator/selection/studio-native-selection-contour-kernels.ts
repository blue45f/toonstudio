/**
 * 제로 의존성 네이티브 윤곽선 추출(Suzuki-Abe RETR_CCOMP) 및
 * 다각형 단순화(Ramer-Douglas-Peucker approxPolyDP) 커널.
 */

import {
  NATIVE_CV,
  NativeMat,
  type NativeMatVector,
} from "./studio-native-selection-types";

// 0:E, 1:SE, 2:S, 3:SW, 4:W, 5:NW, 6:N, 7:NE
const MOORE_DX = [1, 1, 0, -1, -1, -1, 0, 1] as const;
const MOORE_DY = [0, 1, 1, 1, 0, -1, -1, -1] as const;

function compressCollinearClosedPoints(raw: readonly number[]): Int32Array {
  const count = raw.length / 2;
  if (count <= 2) return Int32Array.from(raw);
  const kept: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const prev = (i + count - 1) % count;
    const next = (i + 1) % count;
    const px = raw[prev * 2]!;
    const py = raw[prev * 2 + 1]!;
    const cx = raw[i * 2]!;
    const cy = raw[i * 2 + 1]!;
    const nx = raw[next * 2]!;
    const ny = raw[next * 2 + 1]!;
    const dx1 = cx - px;
    const dy1 = cy - py;
    const dx2 = nx - cx;
    const dy2 = ny - cy;
    // 동일 방향(외적 0, 내적 양수)의 중간 점은 생략한다 (CHAIN_APPROX_SIMPLE).
    if (dx1 * dy2 - dy1 * dx2 === 0 && dx1 * dx2 + dy1 * dy2 > 0) continue;
    kept.push(cx, cy);
  }
  return Int32Array.from(kept.length >= 2 ? kept : raw.slice(0, 2));
}

export function runNativeFindContours(
  image: NativeMat,
  contours: NativeMatVector,
  hierarchy: NativeMat,
): void {
  contours.clear();
  const w = image.cols;
  const h = image.rows;
  const pw = w + 2;
  const ph = h + 2;
  const grid = new Int32Array(pw * ph);
  const srcData = image.data;

  for (let y = 0; y < h; y += 1) {
    const srcRow = y * w;
    const dstRow = (y + 1) * pw + 1;
    for (let x = 0; x < w; x += 1) {
      grid[dstRow + x] = srcData[srcRow + x]! !== 0 ? 1 : 0;
    }
  }

  let nbd = 1;
  const borderIsHole: boolean[] = [false, false];
  const borderParentNbd: number[] = [0, 0];
  const nbdToContourIdx: number[] = [-1, -1];
  const contourIsHole: boolean[] = [];
  const contourParentNbd: number[] = [];

  for (let y = 1; y <= h; y += 1) {
    let lnbd = 1;
    const rowOff = y * pw;
    for (let x = 1; x <= w; x += 1) {
      const idx = rowOff + x;
      const val = grid[idx]!;
      if (val === 0) continue;

      const isOuter = val === 1 && grid[idx - 1] === 0;
      const isHole = !isOuter && val >= 1 && grid[idx + 1] === 0;

      if (isOuter || isHole) {
        nbd += 1;
        const effectiveLnbd = isHole && val > 1 ? val : lnbd;
        let parentNbd: number;
        if (isOuter) {
          if (effectiveLnbd === 1) parentNbd = 1;
          else if (borderIsHole[effectiveLnbd]) parentNbd = effectiveLnbd;
          else parentNbd = borderParentNbd[effectiveLnbd] ?? 1;
        } else {
          if (effectiveLnbd === 1) parentNbd = 1;
          else if (borderIsHole[effectiveLnbd]) parentNbd = borderParentNbd[effectiveLnbd] ?? 1;
          else parentNbd = effectiveLnbd;
        }
        borderIsHole[nbd] = isHole;
        borderParentNbd[nbd] = parentNbd;

        const startDir = isOuter ? 4 : 0;
        let firstDir = -1;
        for (let step = 0; step < 8; step += 1) {
          const dir = (startDir + step) & 7;
          const nx = x + MOORE_DX[dir]!;
          const ny = y + MOORE_DY[dir]!;
          if (grid[ny * pw + nx] !== 0) {
            firstDir = dir;
            break;
          }
        }

        const rawPoints: number[] = [];
        if (firstDir < 0) {
          grid[idx] = -nbd;
          rawPoints.push(x - 1, y - 1);
        } else {
          const x1 = x + MOORE_DX[firstDir]!;
          const y1 = y + MOORE_DY[firstDir]!;
          let x3 = x;
          let y3 = y;
          let dirFromCurrentToPrev = firstDir;
          const maxSteps = pw * ph * 4;

          for (let guard = 0; guard < maxSteps; guard += 1) {
            rawPoints.push(x3 - 1, y3 - 1);
            let eastExaminedZero = false;
            let nextDir = -1;
            for (let step = 1; step <= 8; step += 1) {
              const dir = (dirFromCurrentToPrev - step + 8) & 7;
              const nx = x3 + MOORE_DX[dir]!;
              const ny = y3 + MOORE_DY[dir]!;
              if (grid[ny * pw + nx] !== 0) {
                nextDir = dir;
                break;
              }
              if (dir === 0) eastExaminedZero = true;
            }
            if (nextDir < 0) break;

            const curIdx = y3 * pw + x3;
            if (eastExaminedZero) {
              grid[curIdx] = -nbd;
            } else if (grid[curIdx] === 1) {
              grid[curIdx] = nbd;
            }

            const x4 = x3 + MOORE_DX[nextDir]!;
            const y4 = y3 + MOORE_DY[nextDir]!;
            if (x4 === x && y4 === y && x3 === x1 && y3 === y1) {
              break;
            }
            dirFromCurrentToPrev = (nextDir + 4) & 7;
            x3 = x4;
            y3 = y4;
          }
        }

        const simplified = compressCollinearClosedPoints(rawPoints);
        const contourMat = new NativeMat(simplified.length / 2, 1, NATIVE_CV.CV_32SC2);
        contourMat.data32S.set(simplified);
        const contourIdx = contours.size();
        contours.push(contourMat);
        nbdToContourIdx[nbd] = contourIdx;
        contourIsHole.push(isHole);
        contourParentNbd.push(parentNbd);
      }

      const afterVal = grid[idx]!;
      if (afterVal !== 0 && afterVal !== 1) {
        lnbd = Math.abs(afterVal);
      }
    }
  }

  const total = contours.size();
  hierarchy.allocate(1, total, NATIVE_CV.CV_32SC4);
  const hData = hierarchy.data32S;
  hData.fill(-1);
  // RETR_CCOMP: 2단계 계층(외곽선 parent = -1, 구멍 parent = 외곽선 인덱스)
  for (let i = 0; i < total; i += 1) {
    if (contourIsHole[i]) {
      const pIdx = nbdToContourIdx[contourParentNbd[i]!] ?? -1;
      hData[i * 4 + 3] = pIdx;
    }
  }
}

// ---------------------------------------------------------------------------
// Ramer-Douglas-Peucker 닫힌 다각형 단순화 (approxPolyDP)
// ---------------------------------------------------------------------------

function pointToSegmentDistSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 0) {
    const ox = px - ax;
    const oy = py - ay;
    return ox * ox + oy * oy;
  }
  const cross = (px - ax) * dy - (py - ay) * dx;
  return (cross * cross) / lenSq;
}

function rdpOpenRange(
  pts: Int32Array,
  n: number,
  startRing: number,
  endRing: number,
  epsSq: number,
  keep: Uint8Array,
): void {
  const stack: number[] = [startRing, endRing];
  while (stack.length >= 2) {
    const end = stack.pop()!;
    const start = stack.pop()!;
    const span = (end - start + n) % n;
    if (span <= 1) continue;

    const ax = pts[start * 2]!;
    const ay = pts[start * 2 + 1]!;
    const bx = pts[end * 2]!;
    const by = pts[end * 2 + 1]!;

    let maxDistSq = -1;
    let farthest = -1;
    for (let step = 1; step < span; step += 1) {
      const idx = (start + step) % n;
      const dSq = pointToSegmentDistSq(pts[idx * 2]!, pts[idx * 2 + 1]!, ax, ay, bx, by);
      if (dSq > maxDistSq) {
        maxDistSq = dSq;
        farthest = idx;
      }
    }
    if (farthest >= 0 && maxDistSq > epsSq) {
      keep[farthest] = 1;
      stack.push(start, farthest);
      stack.push(farthest, end);
    }
  }
}

export function runNativeApproxPolyDP(
  curve: NativeMat,
  approxCurve: NativeMat,
  epsilon: number,
  closed: boolean,
): void {
  const pts = curve.data32S;
  const n = pts.length / 2;
  if (n <= 2 || epsilon <= 0) {
    approxCurve.allocate(n, 1, NATIVE_CV.CV_32SC2);
    approxCurve.data32S.set(pts);
    return;
  }

  const epsSq = epsilon * epsilon;
  const keep = new Uint8Array(n);

  if (!closed) {
    keep[0] = 1;
    keep[n - 1] = 1;
    rdpOpenRange(pts, n, 0, n - 1, epsSq, keep);
  } else {
    let pA = 0;
    let bestA = -1;
    const x0 = pts[0]!;
    const y0 = pts[1]!;
    for (let i = 1; i < n; i += 1) {
      const dx = pts[i * 2]! - x0;
      const dy = pts[i * 2 + 1]! - y0;
      const d = dx * dx + dy * dy;
      if (d > bestA) {
        bestA = d;
        pA = i;
      }
    }
    let pB = pA;
    let bestB = -1;
    const ax = pts[pA * 2]!;
    const ay = pts[pA * 2 + 1]!;
    for (let i = 0; i < n; i += 1) {
      const dx = pts[i * 2]! - ax;
      const dy = pts[i * 2 + 1]! - ay;
      const d = dx * dx + dy * dy;
      if (d > bestB) {
        bestB = d;
        pB = i;
      }
    }
    keep[pA] = 1;
    keep[pB] = 1;
    if (pA !== pB) {
      rdpOpenRange(pts, n, pA, pB, epsSq, keep);
      rdpOpenRange(pts, n, pB, pA, epsSq, keep);
    }
  }

  let keptCount = 0;
  for (let i = 0; i < n; i += 1) {
    if (keep[i] === 1) keptCount += 1;
  }
  approxCurve.allocate(keptCount, 1, NATIVE_CV.CV_32SC2);
  const out = approxCurve.data32S;
  let cursor = 0;
  for (let i = 0; i < n; i += 1) {
    if (keep[i] !== 1) continue;
    out[cursor * 2] = pts[i * 2]!;
    out[cursor * 2 + 1] = pts[i * 2 + 1]!;
    cursor += 1;
  }
}
