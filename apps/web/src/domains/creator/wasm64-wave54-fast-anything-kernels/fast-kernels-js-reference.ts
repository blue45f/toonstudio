/**
 * ToonStudio Wave-54 `fast-anything` 외곽 루프 4종 순수 TypeScript 레퍼런스 구현.
 *
 * - Rust `studio-wasm64-fast-kernels` 크레이트와 비트 단위 0-diff 동등성을 보장하는 오라클이자,
 *   `FAST_ANYTHING_DISABLE=1` 또는 `forceJsFallback` 활성 시 즉시 전환되는 롤백 구현이다.
 */

export interface OilBristleConfig {
  readonly brushR: number;
  readonly brushG: number;
  readonly brushB: number;
  readonly brushA: number;
  readonly pickupQ8: number;
  readonly wetnessQ8: number;
  readonly decayQ8: number;
  readonly hardnessQ8: number;
  readonly bristleCount: number;
}

function assertPositiveDimensions(width: number, height: number): number {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError(`유효하지 않은 해상도입니다: ${width}x${height}`);
  }
  return width * height;
}

function clampInt(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * 1. Meijster 2-Pass 정확 2D 유클리드 제곱 거리 변환 (`O(W*H)`).
 */
export function meijsterEdt2dSqF32Js(
  obstacleMask: Uint8Array,
  width: number,
  height: number,
  outDistSq: Float32Array,
): number {
  const pixelCount = assertPositiveDimensions(width, height);
  if (obstacleMask.length !== pixelCount || outDistSq.length !== pixelCount) {
    throw new RangeError("입력 마스크 또는 출력 거리장 버퍼 길이가 해상도와 일치하지 않습니다.");
  }

  const inf = width + height;
  const g = new Int32Array(pixelCount);

  // Pass 1: 행 우선(row-major) 수직 1D 맨해튼 거리 스캔
  for (let x = 0; x < width; x += 1) {
    g[x] = obstacleMask[x] !== 0 ? 0 : inf;
  }
  for (let y = 1; y < height; y += 1) {
    const row = y * width;
    const prev = (y - 1) * width;
    for (let x = 0; x < width; x += 1) {
      if (obstacleMask[row + x] !== 0) {
        g[row + x] = 0;
      } else {
        const candidate = g[prev + x] + 1;
        g[row + x] = candidate < inf ? candidate : inf;
      }
    }
  }
  for (let y = height - 2; y >= 0; y -= 1) {
    const row = y * width;
    const next = (y + 1) * width;
    for (let x = 0; x < width; x += 1) {
      const candidate = g[next + x] + 1;
      if (candidate < g[row + x]) {
        g[row + x] = candidate;
      }
    }
  }

  // Pass 2: 각 행 포물선 하한 포락선(lower envelope) O(W) 스캔
  const s = new Int32Array(width);
  const t = new Float64Array(width);

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let q = 0;
    s[0] = 0;
    t[0] = 0;

    for (let u = 1; u < width; u += 1) {
      const gu = g[row + u];
      while (q >= 0) {
        const sq = s[q];
        const gsq = g[row + sq];
        const tq = t[q];
        const dPrev = (tq - sq) * (tq - sq) + gsq * gsq;
        const dCurr = (tq - u) * (tq - u) + gu * gu;
        if (dPrev > dCurr) {
          q -= 1;
        } else {
          break;
        }
      }

      if (q < 0) {
        q = 0;
        s[0] = u;
        t[0] = 0;
      } else {
        const sq = s[q];
        const gsq = g[row + sq];
        const num = u * u - sq * sq + (gu * gu - gsq * gsq);
        const sep = 1 + Math.floor(num / (2 * (u - sq)));
        if (sep < width) {
          q += 1;
          s[q] = u;
          t[q] = sep;
        }
      }
    }

    for (let u = width - 1; u >= 0; u -= 1) {
      while (q > 0 && u < t[q]) {
        q -= 1;
      }
      const sq = s[q];
      const dx = u - sq;
      const dy = g[row + sq];
      outDistSq[row + u] = dy >= inf ? inf * inf : dx * dx + dy * dy;
    }
  }

  return pixelCount;
}

/**
 * 2. 거리장 기반 틈새 봉합 4-연결 시드 채색 + `1px` Halo-Free 트래핑 외곽 루프.
 */
export function sdfGapCloseFloodFillU8Js(
  lineartMask: Uint8Array,
  distSq: Float32Array,
  width: number,
  height: number,
  seedX: number,
  seedY: number,
  gapCloseRadiusPx: number,
  outFill: Uint8Array,
): number {
  const pixelCount = assertPositiveDimensions(width, height);
  if (
    lineartMask.length !== pixelCount ||
    distSq.length !== pixelCount ||
    outFill.length !== pixelCount
  ) {
    throw new RangeError("입력/출력 버퍼 길이가 해상도와 일치하지 않습니다.");
  }
  if (
    !Number.isInteger(seedX) ||
    !Number.isInteger(seedY) ||
    seedX < 0 ||
    seedX >= width ||
    seedY < 0 ||
    seedY >= height
  ) {
    throw new RangeError(`시드 좌표가 범위를 벗어났습니다: (${seedX}, ${seedY})`);
  }
  if (!Number.isFinite(gapCloseRadiusPx) || gapCloseRadiusPx < 0) {
    throw new RangeError(`유효하지 않은 틈새 봉합 반경입니다: ${gapCloseRadiusPx}`);
  }

  outFill.fill(0);

  const seedIdx = seedY * width + seedX;
  if (lineartMask[seedIdx] !== 0) {
    return 0;
  }

  const rF32 = Math.fround(gapCloseRadiusPx);
  const thresholdSq = Math.fround(rF32 * rF32);
  if (distSq[seedIdx] < thresholdSq) {
    return 0;
  }

  // Phase A: 침식 안전 코어 4-연결 BFS
  const queue = new Uint32Array(pixelCount);
  let tail = 0;
  outFill[seedIdx] = 1;
  queue[tail] = seedIdx;
  tail += 1;

  let head = 0;
  while (head < tail) {
    const cur = queue[head];
    head += 1;
    const x = cur % width;
    const y = (cur - x) / width;

    if (x > 0) {
      const n = cur - 1;
      if (outFill[n] === 0 && lineartMask[n] === 0 && distSq[n] >= thresholdSq) {
        outFill[n] = 1;
        queue[tail] = n;
        tail += 1;
      }
    }
    if (x + 1 < width) {
      const n = cur + 1;
      if (outFill[n] === 0 && lineartMask[n] === 0 && distSq[n] >= thresholdSq) {
        outFill[n] = 1;
        queue[tail] = n;
        tail += 1;
      }
    }
    if (y > 0) {
      const n = cur - width;
      if (outFill[n] === 0 && lineartMask[n] === 0 && distSq[n] >= thresholdSq) {
        outFill[n] = 1;
        queue[tail] = n;
        tail += 1;
      }
    }
    if (y + 1 < height) {
      const n = cur + width;
      if (outFill[n] === 0 && lineartMask[n] === 0 && distSq[n] >= thresholdSq) {
        outFill[n] = 1;
        queue[tail] = n;
        tail += 1;
      }
    }
  }

  // Phase B: `ceil(R)` 단계 제한 4-연결 지오데식 팽창
  const expandSteps = rF32 <= 0 ? 0 : Math.ceil(rF32);
  if (expandSteps > 0) {
    let frontier = new Uint32Array(pixelCount);
    let nextFrontier = new Uint32Array(pixelCount);
    let frontierLen = 0;

    for (let i = 0; i < tail; i += 1) {
      const idx = queue[i];
      const x = idx % width;
      const y = (idx - x) / width;
      const hasOpenNeighbor =
        (x > 0 && outFill[idx - 1] === 0 && lineartMask[idx - 1] === 0) ||
        (x + 1 < width && outFill[idx + 1] === 0 && lineartMask[idx + 1] === 0) ||
        (y > 0 && outFill[idx - width] === 0 && lineartMask[idx - width] === 0) ||
        (y + 1 < height && outFill[idx + width] === 0 && lineartMask[idx + width] === 0);
      if (hasOpenNeighbor) {
        frontier[frontierLen] = idx;
        frontierLen += 1;
      }
    }

    for (let step = 0; step < expandSteps; step += 1) {
      if (frontierLen === 0) break;
      let nextLen = 0;
      for (let i = 0; i < frontierLen; i += 1) {
        const idx = frontier[i];
        const x = idx % width;
        const y = (idx - x) / width;

        if (x > 0) {
          const n = idx - 1;
          if (outFill[n] === 0 && lineartMask[n] === 0) {
            outFill[n] = 1;
            nextFrontier[nextLen] = n;
            nextLen += 1;
          }
        }
        if (x + 1 < width) {
          const n = idx + 1;
          if (outFill[n] === 0 && lineartMask[n] === 0) {
            outFill[n] = 1;
            nextFrontier[nextLen] = n;
            nextLen += 1;
          }
        }
        if (y > 0) {
          const n = idx - width;
          if (outFill[n] === 0 && lineartMask[n] === 0) {
            outFill[n] = 1;
            nextFrontier[nextLen] = n;
            nextLen += 1;
          }
        }
        if (y + 1 < height) {
          const n = idx + width;
          if (outFill[n] === 0 && lineartMask[n] === 0) {
            outFill[n] = 1;
            nextFrontier[nextLen] = n;
            nextLen += 1;
          }
        }
      }
      const swap = frontier;
      frontier = nextFrontier;
      nextFrontier = swap;
      frontierLen = nextLen;
    }
  }

  // Phase C: 1px Halo-Free 트래핑 외곽 루프
  let filledCount = 0;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = row + x;
      if (outFill[idx] === 1) {
        filledCount += 1;
      } else if (lineartMask[idx] !== 0) {
        const touchesCore =
          (x > 0 && outFill[idx - 1] === 1) ||
          (x + 1 < width && outFill[idx + 1] === 1) ||
          (y > 0 && outFill[idx - width] === 1) ||
          (y + 1 < height && outFill[idx + width] === 1);
        if (touchesCore) {
          outFill[idx] = 2;
          filledCount += 1;
        }
      }
    }
  }

  return filledCount;
}

function packRgb565(r: number, g: number, b: number): number {
  const r5 = Math.trunc((r * 31 + 127) / 255);
  const g6 = Math.trunc((g * 63 + 127) / 255);
  const b5 = Math.trunc((b * 31 + 127) / 255);
  return ((r5 << 11) | (g6 << 5) | b5) & 0xffff;
}

function unpackRgb565(c: number): readonly [number, number, number] {
  const r5 = (c >> 11) & 0x1f;
  const g6 = (c >> 5) & 0x3f;
  const b5 = c & 0x1f;
  return [(r5 << 3) | (r5 >> 2), (g6 << 2) | (g6 >> 4), (b5 << 3) | (b5 >> 2)];
}

/**
 * 3. `256x256` RGBA8 타일을 `4x4` 블록 주성분 엔드포인트(`RGB565` + 32비트 2비트 인덱스 = 64비트)로 패킹.
 */
export function packBc1TileRgbaTo64BitJs(
  rgba: Uint8Array,
  width: number,
  height: number,
  outBc1Bytes: Uint8Array,
): number {
  const pixelCount = assertPositiveDimensions(width, height);
  if ((width & 3) !== 0 || (height & 3) !== 0) {
    throw new RangeError(`BC1 패킹 해상도는 4의 배수여야 합니다: ${width}x${height}`);
  }
  const blocksX = width / 4;
  const blocksY = height / 4;
  const blockCount = blocksX * blocksY;
  if (rgba.length !== pixelCount * 4 || outBc1Bytes.length !== blockCount * 8) {
    throw new RangeError("BC1 입력 RGBA 또는 출력 블록 버퍼 길이가 일치하지 않습니다.");
  }

  const br = new Int32Array(16);
  const bg = new Int32Array(16);
  const bb = new Int32Array(16);
  const palR = new Int32Array(4);
  const palG = new Int32Array(4);
  const palB = new Int32Array(4);
  let outOffset = 0;

  for (let by = 0; by < blocksY; by += 1) {
    const baseY = by * 4;
    for (let bx = 0; bx < blocksX; bx += 1) {
      const baseX = bx * 4;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let minR = 255;
      let minG = 255;
      let minB = 255;
      let maxR = 0;
      let maxG = 0;
      let maxB = 0;

      let pi = 0;
      for (let ly = 0; ly < 4; ly += 1) {
        const rowOff = ((baseY + ly) * width + baseX) * 4;
        for (let lx = 0; lx < 4; lx += 1) {
          const off = rowOff + lx * 4;
          const r = rgba[off];
          const g = rgba[off + 1];
          const b = rgba[off + 2];
          br[pi] = r;
          bg[pi] = g;
          bb[pi] = b;
          sumR += r;
          sumG += g;
          sumB += b;
          if (r < minR) minR = r;
          if (r > maxR) maxR = r;
          if (g < minG) minG = g;
          if (g > maxG) maxG = g;
          if (b < minB) minB = b;
          if (b > maxB) maxB = b;
          pi += 1;
        }
      }

      if (minR === maxR && minG === maxG && minB === maxB) {
        const c = packRgb565(minR, minG, minB);
        outBc1Bytes[outOffset] = c & 0xff;
        outBc1Bytes[outOffset + 1] = (c >>> 8) & 0xff;
        outBc1Bytes[outOffset + 2] = c & 0xff;
        outBc1Bytes[outOffset + 3] = (c >>> 8) & 0xff;
        outBc1Bytes[outOffset + 4] = 0;
        outBc1Bytes[outOffset + 5] = 0;
        outBc1Bytes[outOffset + 6] = 0;
        outBc1Bytes[outOffset + 7] = 0;
        outOffset += 8;
        continue;
      }

      let cRR = 0;
      let cRG = 0;
      let cRB = 0;
      let cGG = 0;
      let cGB = 0;
      let cBB = 0;
      for (let i = 0; i < 16; i += 1) {
        const dr = (br[i] << 4) - sumR;
        const dg = (bg[i] << 4) - sumG;
        const db = (bb[i] << 4) - sumB;
        cRR += dr * dr;
        cRG += dr * dg;
        cRB += dr * db;
        cGG += dg * dg;
        cGB += dg * db;
        cBB += db * db;
      }
      const mRR = cRR >> 8;
      const mRG = cRG >> 8;
      const mRB = cRB >> 8;
      const mGG = cGG >> 8;
      const mGB = cGB >> 8;
      const mBB = cBB >> 8;

      let ax = maxR - minR;
      let ay = maxG - minG;
      let az = maxB - minB;
      for (let iter = 0; iter < 4; iter += 1) {
        const nx = mRR * ax + mRG * ay + mRB * az;
        const ny = mRG * ax + mGG * ay + mGB * az;
        const nz = mRB * ax + mGB * ay + mBB * az;
        const maxAbs = Math.max(Math.abs(nx), Math.abs(ny), Math.abs(nz));
        if (maxAbs === 0) break;
        ax = Math.trunc((nx * 256) / maxAbs);
        ay = Math.trunc((ny * 256) / maxAbs);
        az = Math.trunc((nz * 256) / maxAbs);
      }

      let minProj = 0x7fffffff;
      let maxProj = -0x80000000;
      let minIdx = 0;
      let maxIdx = 0;
      for (let i = 0; i < 16; i += 1) {
        const proj = br[i] * ax + bg[i] * ay + bb[i] * az;
        if (proj < minProj) {
          minProj = proj;
          minIdx = i;
        }
        if (proj > maxProj) {
          maxProj = proj;
          maxIdx = i;
        }
      }

      let c0 = packRgb565(br[maxIdx], bg[maxIdx], bb[maxIdx]);
      let c1 = packRgb565(br[minIdx], bg[minIdx], bb[minIdx]);
      if (c0 < c1) {
        const tmp = c0;
        c0 = c1;
        c1 = tmp;
      }

      let packed = 0;
      if (c0 !== c1) {
        const [r0, g0, b0] = unpackRgb565(c0);
        const [r1, g1, b1] = unpackRgb565(c1);
        palR[0] = r0;
        palR[1] = r1;
        palR[2] = Math.trunc((2 * r0 + r1 + 1) / 3);
        palR[3] = Math.trunc((r0 + 2 * r1 + 1) / 3);
        palG[0] = g0;
        palG[1] = g1;
        palG[2] = Math.trunc((2 * g0 + g1 + 1) / 3);
        palG[3] = Math.trunc((g0 + 2 * g1 + 1) / 3);
        palB[0] = b0;
        palB[1] = b1;
        palB[2] = Math.trunc((2 * b0 + b1 + 1) / 3);
        palB[3] = Math.trunc((b0 + 2 * b1 + 1) / 3);

        for (let i = 0; i < 16; i += 1) {
          const r = br[i];
          const g = bg[i];
          const b = bb[i];
          let bestK = 0;
          let bestD = 0x7fffffff;
          for (let k = 0; k < 4; k += 1) {
            const dr = r - palR[k];
            const dg = g - palG[k];
            const db = b - palB[k];
            const d = dr * dr + dg * dg + db * db;
            if (d < bestD) {
              bestD = d;
              bestK = k;
            }
          }
          packed |= bestK << (i * 2);
        }
      }

      outBc1Bytes[outOffset] = c0 & 0xff;
      outBc1Bytes[outOffset + 1] = (c0 >>> 8) & 0xff;
      outBc1Bytes[outOffset + 2] = c1 & 0xff;
      outBc1Bytes[outOffset + 3] = (c1 >>> 8) & 0xff;
      outBc1Bytes[outOffset + 4] = packed & 0xff;
      outBc1Bytes[outOffset + 5] = (packed >>> 8) & 0xff;
      outBc1Bytes[outOffset + 6] = (packed >>> 16) & 0xff;
      outBc1Bytes[outOffset + 7] = (packed >>> 24) & 0xff;
      outOffset += 8;
    }
  }

  return blockCount;
}

/**
 * 4. 오일·수채 브러시 스탬프 외곽 누적 블렌딩 루프 (색상 픽업·습도 감쇠·알파 합성).
 */
export function oilBristleStampAccumulateRgbaJs(
  canvasRgba: Uint8Array,
  width: number,
  height: number,
  stamps: Float32Array,
  config: OilBristleConfig,
): number {
  const pixelCount = assertPositiveDimensions(width, height);
  if (canvasRgba.length !== pixelCount * 4 || (stamps.length & 3) !== 0) {
    throw new RangeError("캔버스 RGBA 또는 스탬프 버퍼 길이가 올바르지 않습니다.");
  }

  const stampCount = stamps.length / 4;
  const pickupQ8 = clampInt(Math.trunc(config.pickupQ8), 0, 256);
  const decayQ8 = clampInt(Math.trunc(config.decayQ8), 0, 256);
  const hardnessQ8 = clampInt(Math.trunc(config.hardnessQ8), 0, 256);
  const bristleCount = clampInt(Math.trunc(config.bristleCount), 1, 16);
  const brushA = clampInt(Math.trunc(config.brushA), 0, 255);

  let loadRQ8 = clampInt(Math.trunc(config.brushR), 0, 255) << 8;
  let loadGQ8 = clampInt(Math.trunc(config.brushG), 0, 255) << 8;
  let loadBQ8 = clampInt(Math.trunc(config.brushB), 0, 255) << 8;
  let wetQ8 = clampInt(Math.trunc(config.wetnessQ8), 0, 256);

  let prevCxQ4 = 0;
  let prevCyQ4 = 0;
  let hasPrev = false;
  let totalBlended = 0;

  for (let s = 0; s < stampCount; s += 1) {
    if (wetQ8 <= 0) break;
    const base = s * 4;
    const cxF = stamps[base];
    const cyF = stamps[base + 1];
    const radF = stamps[base + 2];
    const presF = stamps[base + 3];
    if (
      !Number.isFinite(cxF) ||
      !Number.isFinite(cyF) ||
      !Number.isFinite(radF) ||
      !Number.isFinite(presF)
    ) {
      throw new RangeError("스탬프 좌표·반경·필압은 유한 숫자여야 합니다.");
    }

    const cxQ4 = Math.trunc(cxF * 16);
    const cyQ4 = Math.trunc(cyF * 16);
    const radiusQ4 = Math.max(0, Math.trunc(radF * 16));
    const pressureQ8 = clampInt(Math.trunc(presF * 256), 0, 256);

    let normX = 16;
    let normY = 0;
    if (hasPrev) {
      const mvX = cxQ4 - prevCxQ4;
      const mvY = cyQ4 - prevCyQ4;
      const mag = Math.max(Math.abs(mvX), Math.abs(mvY));
      if (mag > 0) {
        normX = Math.trunc((-mvY * 16) / mag);
        normY = Math.trunc((mvX * 16) / mag);
      }
    }
    prevCxQ4 = cxQ4;
    prevCyQ4 = cyQ4;
    hasPrev = true;

    if (radiusQ4 <= 0 || pressureQ8 <= 0 || brushA <= 0) {
      wetQ8 = (wetQ8 * decayQ8) >> 8;
      continue;
    }

    const rSqQ8 = radiusQ4 * radiusQ4;
    const radPx = (radiusQ4 + 15) >> 4;
    const minX = Math.max(0, (cxQ4 >> 4) - radPx - 1);
    const maxX = Math.min(width - 1, (cxQ4 >> 4) + radPx + 1);
    const minY = Math.max(0, (cyQ4 >> 4) - radPx - 1);
    const maxY = Math.min(height - 1, (cyQ4 >> 4) + radPx + 1);

    if (minX > maxX || minY > maxY) {
      wetQ8 = (wetQ8 * decayQ8) >> 8;
      continue;
    }

    const srcR = clampInt(loadRQ8 >> 8, 0, 255);
    const srcG = clampInt(loadGQ8 >> 8, 0, 255);
    const srcB = clampInt(loadBQ8 >> 8, 0, 255);
    const mixW = (pickupQ8 * wetQ8) >> 8;

    let sampleR = 0;
    let sampleG = 0;
    let sampleB = 0;
    let sampleW = 0;

    for (let py = minY; py <= maxY; py += 1) {
      const dyQ4 = (py << 4) + 8 - cyQ4;
      const dySq = dyQ4 * dyQ4;
      const rowOff = py * width;

      for (let px = minX; px <= maxX; px += 1) {
        const dxQ4 = (px << 4) + 8 - cxQ4;
        const distSqQ8 = dxQ4 * dxQ4 + dySq;
        if (distSqQ8 >= rSqQ8) continue;

        const normSqQ8 = Math.trunc((distSqQ8 * 256) / rSqQ8);
        const falloffQ8 = 256 - normSqQ8;
        const softQ8 = (falloffQ8 * falloffQ8) >> 8;
        const shapedQ8 = softQ8 + (((falloffQ8 - softQ8) * hardnessQ8) >> 8);

        const cross = Math.abs(dxQ4 * normX + dyQ4 * normY);
        const wave = ((cross * bristleCount) >> 6) & 31;
        const tri = wave < 16 ? wave : 31 - wave;
        const bristleQ8 = 160 + tri * 6;

        const alphaMid = (((shapedQ8 * bristleQ8) >> 8) * pressureQ8) >> 8;
        const alpha = clampInt((alphaMid * brushA * wetQ8) >> 16, 0, 255);
        if (alpha <= 0) continue;

        const off = (rowOff + px) * 4;
        const dstR = canvasRgba[off];
        const dstG = canvasRgba[off + 1];
        const dstB = canvasRgba[off + 2];
        const dstA = canvasRgba[off + 3];

        let effR = srcR;
        let effG = srcG;
        let effB = srcB;
        if (dstA > 0) {
          const wPick = (alpha * dstA) >> 8;
          if (wPick > 0) {
            sampleR += dstR * wPick;
            sampleG += dstG * wPick;
            sampleB += dstB * wPick;
            sampleW += wPick;
          }
          effR = clampInt(srcR + (((dstR - srcR) * mixW) >> 9), 0, 255);
          effG = clampInt(srcG + (((dstG - srcG) * mixW) >> 9), 0, 255);
          effB = clampInt(srcB + (((dstB - srcB) * mixW) >> 9), 0, 255);
        }

        const invA = 255 - alpha;
        const outA = clampInt(alpha + Math.trunc((dstA * invA + 127) / 255), 1, 255);
        const denom = outA * 255;
        const half = denom >> 1;
        canvasRgba[off] = clampInt(
          Math.trunc((effR * alpha * 255 + dstR * dstA * invA + half) / denom),
          0,
          255,
        );
        canvasRgba[off + 1] = clampInt(
          Math.trunc((effG * alpha * 255 + dstG * dstA * invA + half) / denom),
          0,
          255,
        );
        canvasRgba[off + 2] = clampInt(
          Math.trunc((effB * alpha * 255 + dstB * dstA * invA + half) / denom),
          0,
          255,
        );
        canvasRgba[off + 3] = outA;
        totalBlended += 1;
      }
    }

    if (sampleW > 0 && pickupQ8 > 0) {
      const avgRQ8 = Math.trunc((sampleR * 256) / sampleW);
      const avgGQ8 = Math.trunc((sampleG * 256) / sampleW);
      const avgBQ8 = Math.trunc((sampleB * 256) / sampleW);
      loadRQ8 += ((avgRQ8 - loadRQ8) * mixW) >> 8;
      loadGQ8 += ((avgGQ8 - loadGQ8) * mixW) >> 8;
      loadBQ8 += ((avgBQ8 - loadBQ8) * mixW) >> 8;
    }

    wetQ8 = (wetQ8 * decayQ8) >> 8;
  }

  return totalBlended;
}
