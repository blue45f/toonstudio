/**
 * Wave 44: 부호 거리장(SDF · Meijster 2-Pass EDT) 기반 형태학적 틈새 봉합 스마트 채우기 커널.
 *
 * - 선화가 완전히 닫히지 않은 `1px ~ 16px` 틈새에서도 유클리드 거리장(`Meijster 2-Pass EDT`)으로
 *   좁은 목(narrow neck)을 가상 장벽으로 봉합한 뒤 시드 영역을 채운다.
 * - 시드 코어와 외부 코어의 동시 챔퍼(`3-4`) 측지선 전파로 직각 모서리는 끝까지 채우고 틈새 현(chord)에서 정지한다.
 * - 안티앨리어싱 선화 가장자리 안쪽으로 `1px` 확장(`Halo-Free Trapping`)해 흰 테두리 들뜸 현상을 제거한다.
 */

const EDT_INF = 1e9;
const CHAMFER_ORTHO = 3;
const CHAMFER_DIAG = 4;
const DX4 = [-1, 1, 0, 0] as const;
const DY4 = [0, 0, -1, 1] as const;

export type LineartChannelMode = "auto" | "alpha" | "luminance-darkness" | "mask";

export interface SdfRgbaColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a?: number;
}

export interface SdfGapClosingFloodFillInput {
  readonly width: number;
  readonly height: number;
  readonly lineart: Uint8Array | Uint8ClampedArray | Float32Array;
  readonly seedX: number;
  readonly seedY: number;
  readonly gapTolerancePx?: number;
  readonly inkThreshold?: number;
  readonly aaFringeMinInk?: number;
  readonly trapPixels?: number;
  readonly channelMode?: LineartChannelMode;
  readonly fillColor?: SdfRgbaColor;
}

export interface SdfGapClosingFloodFillResult {
  readonly width: number;
  readonly height: number;
  readonly filledRegionMask: Uint8Array;
  readonly filledAlphaMask: Uint8ClampedArray;
  readonly flatLayerRgba: Uint8ClampedArray;
  readonly signedDistanceField: Float32Array;
  readonly filledPixelCount: number;
  readonly coreSeedPixelCount: number;
  readonly trappedEdgePixelCount: number;
  readonly sealedNeckPixelCount: number;
  readonly leakedToCanvasBorder: boolean;
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function clampByte(value: number): number {
  return Number.isFinite(value) ? Math.min(255, Math.max(0, Math.round(value))) : 0;
}

/** 단일 채널 또는 RGBA 선화 버퍼에서 정규화된 먹선 농도(`0..1`)를 추출한다. */
export function extractLineartInkStrength(
  lineart: Uint8Array | Uint8ClampedArray | Float32Array,
  width: number,
  height: number,
  mode: LineartChannelMode = "auto",
): Float32Array {
  const total = width * height;
  const out = new Float32Array(total);
  if (mode === "mask" || lineart.length < total * 4) {
    let maxVal = 0;
    const len = Math.min(total, lineart.length);
    for (let i = 0; i < len; i += 1) maxVal = Math.max(maxVal, lineart[i] ?? 0);
    const scale = lineart instanceof Float32Array && maxVal <= 1.0001 ? 1 : 1 / 255;
    for (let i = 0; i < len; i += 1) out[i] = clamp01((lineart[i] ?? 0) * scale);
    return out;
  }

  let maxChannel = 0;
  if (lineart instanceof Float32Array) {
    for (let i = 0; i < total * 4; i += 1) maxChannel = Math.max(maxChannel, lineart[i] ?? 0);
  }
  const scale = lineart instanceof Float32Array && maxChannel <= 1.0001 ? 1 : 1 / 255;

  let resolvedMode = mode;
  if (resolvedMode === "auto") {
    resolvedMode = "luminance-darkness";
    for (let i = 0; i < total; i += 1) {
      if ((lineart[i * 4 + 3] ?? 0) * scale < 0.98) {
        resolvedMode = "alpha";
        break;
      }
    }
  }

  for (let i = 0; i < total; i += 1) {
    const base = i * 4;
    const r = clamp01((lineart[base] ?? 0) * scale);
    const g = clamp01((lineart[base + 1] ?? 0) * scale);
    const b = clamp01((lineart[base + 2] ?? 0) * scale);
    const a = clamp01((lineart[base + 3] ?? 0) * scale);
    out[i] = resolvedMode === "alpha" ? a : clamp01(a * (1 - (0.2126 * r + 0.7152 * g + 0.0722 * b)));
  }
  return out;
}

/** Meijster 2-Pass 선형 시간(`O(W·H)`) 정확 유클리드 거리 변환(`EDT`). */
export function computeMeijsterEdt2d(
  featureMask: Uint8Array,
  width: number,
  height: number,
): Float32Array {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  const total = safeW * safeH;
  const gCol = new Float64Array(total);
  const outDist = new Float32Array(total);

  let hasFeature = false;
  for (let i = 0; i < total; i += 1) {
    if ((featureMask[i] ?? 0) > 0) {
      hasFeature = true;
      break;
    }
  }
  if (!hasFeature) {
    outDist.fill(EDT_INF);
    return outDist;
  }

  for (let x = 0; x < safeW; x += 1) {
    gCol[x] = (featureMask[x] ?? 0) > 0 ? 0 : EDT_INF;
    for (let y = 1; y < safeH; y += 1) {
      const idx = y * safeW + x;
      const prev = gCol[(y - 1) * safeW + x] ?? EDT_INF;
      gCol[idx] = (featureMask[idx] ?? 0) > 0 ? 0 : prev < EDT_INF ? prev + 1 : EDT_INF;
    }
    for (let y = safeH - 2; y >= 0; y -= 1) {
      const idx = y * safeW + x;
      const nextPlus = (gCol[(y + 1) * safeW + x] ?? EDT_INF) + 1;
      if (nextPlus < (gCol[idx] ?? EDT_INF)) gCol[idx] = nextPlus;
    }
  }

  const s = new Int32Array(safeW);
  const t = new Int32Array(safeW);
  const fEval = (xPos: number, iPos: number, rowOffset: number): number => {
    const dx = xPos - iPos;
    const gi = gCol[rowOffset + iPos] ?? EDT_INF;
    return dx * dx + gi * gi;
  };
  const sep = (iPos: number, uPos: number, rowOffset: number): number => {
    const gi = gCol[rowOffset + iPos] ?? EDT_INF;
    const gu = gCol[rowOffset + uPos] ?? EDT_INF;
    return Math.floor((uPos * uPos - iPos * iPos + gu * gu - gi * gi) / (2 * (uPos - iPos)));
  };

  for (let y = 0; y < safeH; y += 1) {
    const rowOffset = y * safeW;
    let q = 0;
    s[0] = 0;
    t[0] = 0;
    for (let u = 1; u < safeW; u += 1) {
      while (q >= 0 && fEval(t[q] ?? 0, s[q] ?? 0, rowOffset) > fEval(t[q] ?? 0, u, rowOffset)) q -= 1;
      if (q < 0) {
        q = 0;
        s[0] = u;
      } else {
        const w = 1 + sep(s[q] ?? 0, u, rowOffset);
        if (w < safeW) {
          q += 1;
          s[q] = u;
          t[q] = w;
        }
      }
    }
    for (let u = safeW - 1; u >= 0; u -= 1) {
      outDist[rowOffset + u] = Math.sqrt(fEval(u, s[q] ?? 0, rowOffset));
      if (u === (t[q] ?? 0)) q -= 1;
    }
  }
  return outDist;
}

/** 이진 먹선 마스크로부터 부호 거리장(`+` 빈 공간 거리, `-` 먹선 내부 깊이)을 산출한다. */
export function computeLineartSignedDistanceField(
  coreInkMask: Uint8Array,
  width: number,
  height: number,
): Float32Array {
  const total = width * height;
  const outsideDist = computeMeijsterEdt2d(coreInkMask, width, height);
  const emptyMask = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) emptyMask[i] = (coreInkMask[i] ?? 0) > 0 ? 0 : 1;
  const insideDist = computeMeijsterEdt2d(emptyMask, width, height);
  const sdf = new Float32Array(total);
  for (let i = 0; i < total; i += 1) {
    sdf[i] = (coreInkMask[i] ?? 0) > 0 ? -Math.max(0, (insideDist[i] ?? 1) - 0.5) : (outsideDist[i] ?? EDT_INF);
  }
  return sdf;
}

function ascendToDistancePeak(
  seedIdx: number,
  sdf: Float32Array,
  coreInk: Uint8Array,
  width: number,
  height: number,
  maxSteps: number,
): number {
  let curr = seedIdx;
  for (let step = 0; step < maxSteps; step += 1) {
    const cx = curr % width;
    const cy = Math.floor(curr / width);
    let bestIdx = curr;
    let bestDist = sdf[curr] ?? 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = cx + dx;
        const ny = cy + dy;
        if ((dx === 0 && dy === 0) || nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = ny * width + nx;
        if ((coreInk[nIdx] ?? 0) > 0) continue;
        if (dx !== 0 && dy !== 0 && (coreInk[cy * width + nx] ?? 0) > 0 && (coreInk[ny * width + cx] ?? 0) > 0) continue;
        if ((sdf[nIdx] ?? 0) > bestDist + 1e-5) {
          bestDist = sdf[nIdx] ?? 0;
          bestIdx = nIdx;
        }
      }
    }
    if (bestIdx === curr) break;
    curr = bestIdx;
  }
  return curr;
}

function bfsFloodOrtho(
  queue: Int32Array,
  initialTail: number,
  mask: Uint8Array,
  coreInk: Uint8Array,
  width: number,
  height: number,
  canVisit: (currIdx: number, nextIdx: number) => boolean,
): number {
  let head = 0;
  let tail = initialTail;
  while (head < tail) {
    const idx = queue[head] ?? 0;
    head += 1;
    const cx = idx % width;
    const cy = Math.floor(idx / width);
    for (let d = 0; d < 4; d += 1) {
      const nx = cx + (DX4[d] ?? 0);
      const ny = cy + (DY4[d] ?? 0);
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nIdx = ny * width + nx;
      if ((mask[nIdx] ?? 0) !== 0 || (coreInk[nIdx] ?? 0) > 0 || !canVisit(idx, nIdx)) continue;
      mask[nIdx] = 1;
      queue[tail] = nIdx;
      tail += 1;
    }
  }
  return tail;
}

function propagateGeodesicCollar(
  label: Uint8Array,
  coreInk: Uint8Array,
  width: number,
  height: number,
  barrierRadius: number,
): number {
  const total = width * height;
  const geoCost = new Int32Array(total);
  geoCost.fill(0x3fffffff);
  const maxBucket = (Math.ceil(barrierRadius) + 8) * CHAMFER_DIAG + 4;
  const buckets: number[][] = Array.from({ length: maxBucket + 1 }, () => []);
  for (let i = 0; i < total; i += 1) {
    if ((label[i] ?? 0) === 1 || (label[i] ?? 0) === 2) {
      geoCost[i] = 0;
      buckets[0]?.push(i);
    }
  }
  let sealedNeckCount = 0;
  for (let cost = 0; cost <= maxBucket; cost += 1) {
    const bucket = buckets[cost];
    if (!bucket) continue;
    for (let bIdx = 0; bIdx < bucket.length; bIdx += 1) {
      const idx = bucket[bIdx] ?? 0;
      if (cost > (geoCost[idx] ?? 0)) continue;
      const srcLabel = label[idx] ?? 0;
      const cx = idx % width;
      const cy = Math.floor(idx / width);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = cx + dx;
          const ny = cy + dy;
          if ((dx === 0 && dy === 0) || nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const nIdx = ny * width + nx;
          if ((coreInk[nIdx] ?? 0) > 0) continue;
          if (dx !== 0 && dy !== 0 && ((coreInk[cy * width + nx] ?? 0) > 0 || (coreInk[ny * width + cx] ?? 0) > 0)) continue;
          const nextCost = Math.min(maxBucket, cost + (dx !== 0 && dy !== 0 ? CHAMFER_DIAG : CHAMFER_ORTHO));
          const prevCost = geoCost[nIdx] ?? 0x3fffffff;
          if (nextCost < prevCost) {
            geoCost[nIdx] = nextCost;
            label[nIdx] = srcLabel;
            buckets[nextCost]?.push(nIdx);
          } else if (nextCost === prevCost && (label[nIdx] ?? 0) !== 0 && (label[nIdx] ?? 0) !== srcLabel) {
            sealedNeckCount += 1;
          }
        }
      }
    }
  }
  return sealedNeckCount;
}

function applyHaloFreeTrapping(
  filledRegionMask: Uint8Array,
  inkStrength: Float32Array,
  width: number,
  height: number,
  aaFringeMinInk: number,
  trapPixels: number,
): number {
  let trappedCount = 0;
  let currentRing = new Uint8Array(filledRegionMask);
  for (let pass = 0; pass < trapPixels; pass += 1) {
    const nextRing = new Uint8Array(currentRing);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        if ((currentRing[idx] ?? 0) > 0 || (inkStrength[idx] ?? 0) < aaFringeMinInk) continue;
        const touches =
          (x > 0 && (currentRing[idx - 1] ?? 0) > 0) ||
          (x + 1 < width && (currentRing[idx + 1] ?? 0) > 0) ||
          (y > 0 && (currentRing[idx - width] ?? 0) > 0) ||
          (y + 1 < height && (currentRing[idx + width] ?? 0) > 0);
        if (touches) {
          nextRing[idx] = 1;
          filledRegionMask[idx] = 1;
          trappedCount += 1;
        }
      }
    }
    currentRing = nextRing;
  }
  return trappedCount;
}

/** 끊어진 선화 틈새(`<= gapTolerancePx`)를 봉합해 채우고 안티앨리어싱 선화 아래로 트래핑 확장한다. */
export function floodFillWithSdfGapClosing(
  input: SdfGapClosingFloodFillInput,
): SdfGapClosingFloodFillResult {
  const width = Math.max(1, Math.floor(input.width));
  const height = Math.max(1, Math.floor(input.height));
  const total = width * height;
  const inkThreshold = clamp01(input.inkThreshold ?? 0.45);
  const aaFringeMinInk = clamp01(input.aaFringeMinInk ?? 0.06);
  const gapTolerancePx = Math.max(0, input.gapTolerancePx ?? 8);
  const trapPixels = Math.max(0, Math.min(4, Math.round(input.trapPixels ?? 1)));
  const fillColor = input.fillColor ?? { r: 242, g: 196, b: 172, a: 255 };

  const inkStrength = extractLineartInkStrength(input.lineart, width, height, input.channelMode ?? "auto");
  const coreInk = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) coreInk[i] = (inkStrength[i] ?? 0) >= inkThreshold ? 1 : 0;

  const signedDistanceField = computeLineartSignedDistanceField(coreInk, width, height);
  const filledRegionMask = new Uint8Array(total);
  const filledAlphaMask = new Uint8ClampedArray(total);
  const flatLayerRgba = new Uint8ClampedArray(total * 4);

  const sx = Math.floor(input.seedX);
  const sy = Math.floor(input.seedY);
  const seedIdx = sy * width + sx;
  let coreSeedPixelCount = 0;
  let trappedEdgePixelCount = 0;
  let sealedNeckPixelCount = 0;

  if (sx >= 0 && sx < width && sy >= 0 && sy < height && (coreInk[seedIdx] ?? 0) === 0) {
    const queue = new Int32Array(total);
    if (gapTolerancePx <= 0) {
      filledRegionMask[seedIdx] = 1;
      queue[0] = seedIdx;
      bfsFloodOrtho(queue, 1, filledRegionMask, coreInk, width, height, () => true);
    } else {
      let barrierRadius = (gapTolerancePx + 1) * 0.5;
      let effectiveSeedIdx = seedIdx;
      if ((signedDistanceField[seedIdx] ?? 0) <= barrierRadius) {
        effectiveSeedIdx = ascendToDistancePeak(seedIdx, signedDistanceField, coreInk, width, height, Math.ceil(barrierRadius) + 3);
        const peakDist = signedDistanceField[effectiveSeedIdx] ?? 0;
        if (peakDist <= barrierRadius) barrierRadius = Math.max(0, peakDist - 0.5);
      }

      const label = new Uint8Array(total);
      label[effectiveSeedIdx] = 1;
      queue[0] = effectiveSeedIdx;
      coreSeedPixelCount = bfsFloodOrtho(queue, 1, label, coreInk, width, height, (_, nIdx) => (signedDistanceField[nIdx] ?? 0) > barrierRadius);

      let hasExteriorCore = false;
      for (let i = 0; i < total; i += 1) {
        if ((label[i] ?? 0) === 0 && (coreInk[i] ?? 0) === 0 && (signedDistanceField[i] ?? 0) > barrierRadius) {
          label[i] = 2;
          hasExteriorCore = true;
        }
      }

      if (hasExteriorCore) {
        sealedNeckPixelCount = propagateGeodesicCollar(label, coreInk, width, height, barrierRadius);
      } else {
        bfsFloodOrtho(queue, coreSeedPixelCount, label, coreInk, width, height, (c, n) => (signedDistanceField[n] ?? 0) <= (signedDistanceField[c] ?? 0) + 1e-5);
      }

      for (let i = 0; i < total; i += 1) {
        if ((label[i] ?? 0) === 1) filledRegionMask[i] = 1;
      }
      filledRegionMask[seedIdx] = 1;
    }

    trappedEdgePixelCount = applyHaloFreeTrapping(filledRegionMask, inkStrength, width, height, aaFringeMinInk, trapPixels);
  }

  let filledPixelCount = 0;
  let leakedToCanvasBorder = false;
  const fillR = clampByte(fillColor.r);
  const fillG = clampByte(fillColor.g);
  const fillB = clampByte(fillColor.b);
  const fillA = clampByte(fillColor.a ?? 255);
  for (let i = 0; i < total; i += 1) {
    if ((filledRegionMask[i] ?? 0) === 0) continue;
    filledPixelCount += 1;
    filledAlphaMask[i] = 255;
    flatLayerRgba[i * 4] = fillR;
    flatLayerRgba[i * 4 + 1] = fillG;
    flatLayerRgba[i * 4 + 2] = fillB;
    flatLayerRgba[i * 4 + 3] = fillA;
    const x = i % width;
    const y = Math.floor(i / width);
    if ((x === 0 || x === width - 1 || y === 0 || y === height - 1) && (coreInk[i] ?? 0) === 0) {
      leakedToCanvasBorder = true;
    }
  }
  return {
    width, height, filledRegionMask, filledAlphaMask, flatLayerRgba, signedDistanceField,
    filledPixelCount, coreSeedPixelCount, trappedEdgePixelCount, sealedNeckPixelCount, leakedToCanvasBorder,
  };
}
