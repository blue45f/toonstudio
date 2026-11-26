/**
 * 제로 의존성 네이티브 선택 래스터 커널 (GrabCut · FloodFill · Morphology · GaussianBlur).
 */

import {
  NATIVE_CV,
  NativeMat,
  type StudioNativeSelectionPoint,
  type StudioNativeSelectionRect,
  type StudioNativeSelectionSize,
} from "./studio-native-selection-types";

// ---------------------------------------------------------------------------
// GrabCut (결정적 K-means 대각 가우시안 혼합 모델 + Potts 인접 평활화)
// ---------------------------------------------------------------------------

interface DiagonalGmmComponent {
  readonly logWeightNorm: number;
  readonly mr: number;
  readonly mg: number;
  readonly mb: number;
  readonly invVr: number;
  readonly invVg: number;
  readonly invVb: number;
}

const GRABCUT_K = 5;
const GRABCUT_MIN_VAR = 4.0;

function fitDeterministicGmm(
  rgb: Uint8Array,
  indices: Int32Array,
  count: number,
  rngSeed: number,
): readonly DiagonalGmmComponent[] {
  if (count <= 0) return [];
  const k = Math.min(GRABCUT_K, count);
  const centersR = new Float64Array(k);
  const centersG = new Float64Array(k);
  const centersB = new Float64Array(k);

  const firstIdx = indices[Math.abs(rngSeed) % count]! * 3;
  centersR[0] = rgb[firstIdx]!;
  centersG[0] = rgb[firstIdx + 1]!;
  centersB[0] = rgb[firstIdx + 2]!;

  const minDist = new Float64Array(count);
  minDist.fill(Infinity);
  let activeK = 1;
  for (let c = 1; c < k; c += 1) {
    const prevR = centersR[c - 1]!;
    const prevG = centersG[c - 1]!;
    const prevB = centersB[c - 1]!;
    let bestPos = -1;
    let bestDist = 0;
    for (let i = 0; i < count; i += 1) {
      const off = indices[i]! * 3;
      const dr = rgb[off]! - prevR;
      const dg = rgb[off + 1]! - prevG;
      const db = rgb[off + 2]! - prevB;
      const d2 = dr * dr + dg * dg + db * db;
      if (d2 < minDist[i]!) minDist[i] = d2;
      if (minDist[i]! > bestDist) {
        bestDist = minDist[i]!;
        bestPos = i;
      }
    }
    if (bestPos < 0 || bestDist <= 1e-6) break;
    const off = indices[bestPos]! * 3;
    centersR[activeK] = rgb[off]!;
    centersG[activeK] = rgb[off + 1]!;
    centersB[activeK] = rgb[off + 2]!;
    activeK += 1;
  }

  const assign = new Uint8Array(count);
  const sumR = new Float64Array(activeK);
  const sumG = new Float64Array(activeK);
  const sumB = new Float64Array(activeK);
  const counts = new Int32Array(activeK);

  for (let iter = 0; iter < 6; iter += 1) {
    sumR.fill(0);
    sumG.fill(0);
    sumB.fill(0);
    counts.fill(0);
    let changed = false;
    for (let i = 0; i < count; i += 1) {
      const off = indices[i]! * 3;
      const r = rgb[off]!;
      const g = rgb[off + 1]!;
      const b = rgb[off + 2]!;
      let bestC = 0;
      let bestD = Infinity;
      for (let c = 0; c < activeK; c += 1) {
        const dr = r - centersR[c]!;
        const dg = g - centersG[c]!;
        const db = b - centersB[c]!;
        const d2 = dr * dr + dg * dg + db * db;
        if (d2 < bestD) {
          bestD = d2;
          bestC = c;
        }
      }
      if (assign[i] !== bestC) {
        assign[i] = bestC;
        changed = true;
      }
      sumR[bestC]! += r;
      sumG[bestC]! += g;
      sumB[bestC]! += b;
      counts[bestC]! += 1;
    }
    for (let c = 0; c < activeK; c += 1) {
      if (counts[c]! > 0) {
        centersR[c] = sumR[c]! / counts[c]!;
        centersG[c] = sumG[c]! / counts[c]!;
        centersB[c] = sumB[c]! / counts[c]!;
      }
    }
    if (!changed) break;
  }

  const varR = new Float64Array(activeK);
  const varG = new Float64Array(activeK);
  const varB = new Float64Array(activeK);
  for (let i = 0; i < count; i += 1) {
    const c = assign[i]!;
    const off = indices[i]! * 3;
    const dr = rgb[off]! - centersR[c]!;
    const dg = rgb[off + 1]! - centersG[c]!;
    const db = rgb[off + 2]! - centersB[c]!;
    varR[c]! += dr * dr;
    varG[c]! += dg * dg;
    varB[c]! += db * db;
  }

  const components: DiagonalGmmComponent[] = [];
  for (let c = 0; c < activeK; c += 1) {
    const n = counts[c]!;
    if (n <= 0) continue;
    const vr = Math.max(GRABCUT_MIN_VAR, varR[c]! / n);
    const vg = Math.max(GRABCUT_MIN_VAR, varG[c]! / n);
    const vb = Math.max(GRABCUT_MIN_VAR, varB[c]! / n);
    const weight = n / count;
    components.push({
      logWeightNorm: Math.log(weight) - 0.5 * (Math.log(vr) + Math.log(vg) + Math.log(vb)),
      mr: centersR[c]!,
      mg: centersG[c]!,
      mb: centersB[c]!,
      invVr: 1 / vr,
      invVg: 1 / vg,
      invVb: 1 / vb,
    });
  }
  return components;
}

function gmmNegativeLogLikelihood(
  components: readonly DiagonalGmmComponent[],
  r: number,
  g: number,
  b: number,
): number {
  if (components.length === 0) return 1e6;
  let maxLog = -Infinity;
  const logs = new Float64Array(components.length);
  for (let i = 0; i < components.length; i += 1) {
    const comp = components[i]!;
    const dr = r - comp.mr;
    const dg = g - comp.mg;
    const db = b - comp.mb;
    const lp =
      comp.logWeightNorm -
      0.5 * (dr * dr * comp.invVr + dg * dg * comp.invVg + db * db * comp.invVb);
    logs[i] = lp;
    if (lp > maxLog) maxLog = lp;
  }
  let sumExp = 0;
  for (let i = 0; i < components.length; i += 1) {
    sumExp += Math.exp(logs[i]! - maxLog);
  }
  return -(maxLog + Math.log(sumExp));
}

export function runNativeGrabCut(
  img: NativeMat,
  mask: NativeMat,
  rect: StudioNativeSelectionRect,
  iterCount: number,
  rngSeed: number,
): void {
  const w = img.cols;
  const h = img.rows;
  const pixelCount = w * h;
  const rgb = img.data;
  mask.allocate(h, w, NATIVE_CV.CV_8UC1);
  const labels = mask.data;
  labels.fill(NATIVE_CV.GC_BGD);

  const rx0 = Math.max(0, Math.min(w, Math.floor(rect.x)));
  const ry0 = Math.max(0, Math.min(h, Math.floor(rect.y)));
  const rx1 = Math.max(rx0, Math.min(w, Math.floor(rect.x + rect.width)));
  const ry1 = Math.max(ry0, Math.min(h, Math.floor(rect.y + rect.height)));

  for (let y = ry0; y < ry1; y += 1) {
    const rowOff = y * w;
    for (let x = rx0; x < rx1; x += 1) {
      labels[rowOff + x] = NATIVE_CV.GC_PR_FGD;
    }
  }

  let pairSum = 0;
  let pairCount = 0;
  for (let y = 0; y < h; y += 1) {
    const rowOff = y * w;
    for (let x = 0; x < w; x += 1) {
      const idx = (rowOff + x) * 3;
      if (x + 1 < w) {
        const right = idx + 3;
        const dr = rgb[idx]! - rgb[right]!;
        const dg = rgb[idx + 1]! - rgb[right + 1]!;
        const db = rgb[idx + 2]! - rgb[right + 2]!;
        pairSum += dr * dr + dg * dg + db * db;
        pairCount += 1;
      }
      if (y + 1 < h) {
        const down = idx + w * 3;
        const dr = rgb[idx]! - rgb[down]!;
        const dg = rgb[idx + 1]! - rgb[down + 1]!;
        const db = rgb[idx + 2]! - rgb[down + 2]!;
        pairSum += dr * dr + dg * dg + db * db;
        pairCount += 1;
      }
    }
  }
  const meanDist2 = pairCount > 0 ? pairSum / pairCount : 0;
  const beta = meanDist2 > 1e-6 ? 1 / (2 * meanDist2) : 0;
  const gamma = 12.0;

  const bgIndices = new Int32Array(pixelCount);
  const fgIndices = new Int32Array(pixelCount);
  const fgCost = new Float64Array(pixelCount);
  const bgCost = new Float64Array(pixelCount);
  const state = new Uint8Array(pixelCount);

  for (let iter = 0; iter < iterCount; iter += 1) {
    let bgCount = 0;
    let fgCount = 0;
    for (let i = 0; i < pixelCount; i += 1) {
      const lbl = labels[i]!;
      if (lbl === NATIVE_CV.GC_FGD || lbl === NATIVE_CV.GC_PR_FGD) {
        fgIndices[fgCount] = i;
        fgCount += 1;
      } else {
        bgIndices[bgCount] = i;
        bgCount += 1;
      }
    }
    if (bgCount === 0 || fgCount === 0) break;

    const bgGmm = fitDeterministicGmm(rgb, bgIndices, bgCount, rngSeed);
    const fgGmm = fitDeterministicGmm(rgb, fgIndices, fgCount, rngSeed);

    state.fill(0);
    for (let y = ry0; y < ry1; y += 1) {
      const rowOff = y * w;
      for (let x = rx0; x < rx1; x += 1) {
        const idx = rowOff + x;
        const off = idx * 3;
        const r = rgb[off]!;
        const g = rgb[off + 1]!;
        const b = rgb[off + 2]!;
        const fc = gmmNegativeLogLikelihood(fgGmm, r, g, b);
        const bc = gmmNegativeLogLikelihood(bgGmm, r, g, b);
        fgCost[idx] = fc;
        bgCost[idx] = bc;
        state[idx] = fc < bc ? 1 : 0;
      }
    }

    for (let sweep = 0; sweep < 4; sweep += 1) {
      for (let parity = 0; parity < 2; parity += 1) {
        for (let y = ry0; y < ry1; y += 1) {
          const rowOff = y * w;
          const xStart = rx0 + ((y + rx0 + parity) & 1);
          for (let x = xStart; x < rx1; x += 2) {
            const idx = rowOff + x;
            const off = idx * 3;
            const r = rgb[off]!;
            const g = rgb[off + 1]!;
            const b = rgb[off + 2]!;
            let smoothIfFg = 0;
            let smoothIfBg = 0;
            const neighbors: readonly number[] = [
              x > 0 ? idx - 1 : -1,
              x + 1 < w ? idx + 1 : -1,
              y > 0 ? idx - w : -1,
              y + 1 < h ? idx + w : -1,
            ];
            for (let n = 0; n < 4; n += 1) {
              const nIdx = neighbors[n]!;
              if (nIdx < 0) continue;
              const nOff = nIdx * 3;
              const dr = r - rgb[nOff]!;
              const dg = g - rgb[nOff + 1]!;
              const db = b - rgb[nOff + 2]!;
              const weight = gamma * Math.exp(-beta * (dr * dr + dg * dg + db * db));
              if (state[nIdx] === 1) {
                smoothIfBg += weight;
              } else {
                smoothIfFg += weight;
              }
            }
            state[idx] = fgCost[idx]! + smoothIfFg < bgCost[idx]! + smoothIfBg ? 1 : 0;
          }
        }
      }
    }

    for (let y = ry0; y < ry1; y += 1) {
      const rowOff = y * w;
      for (let x = rx0; x < rx1; x += 1) {
        const idx = rowOff + x;
        labels[idx] = state[idx] === 1 ? NATIVE_CV.GC_PR_FGD : NATIVE_CV.GC_PR_BGD;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// FloodFill (FIXED_RANGE + MASK_ONLY, 4/8 연결, 비재귀 TypedArray BFS)
// ---------------------------------------------------------------------------

export function runNativeFloodFill(
  image: NativeMat,
  mask: NativeMat,
  seedPoint: StudioNativeSelectionPoint,
  loDiff: readonly number[],
  upDiff: readonly number[],
  flags: number,
): number {
  const w = image.cols;
  const h = image.rows;
  const ch = image.channels;
  const sx = Math.trunc(seedPoint.x);
  const sy = Math.trunc(seedPoint.y);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return 0;

  const connectivity = (flags & 0xff) === 8 ? 8 : 4;
  const fillVal = ((flags >>> 8) & 0xff) || 1;
  const maskCols = w + 2;
  const maskData = mask.data;
  const imgData = image.data;

  const seedMaskIdx = (sy + 1) * maskCols + (sx + 1);
  if (maskData[seedMaskIdx] !== 0) return 0;

  const seedOff = (sy * w + sx) * ch;
  const lo0 = (imgData[seedOff] ?? 0) - (loDiff[0] ?? 0);
  const hi0 = (imgData[seedOff] ?? 0) + (upDiff[0] ?? 0);
  const lo1 = ch >= 2 ? (imgData[seedOff + 1] ?? 0) - (loDiff[1] ?? 0) : 0;
  const hi1 = ch >= 2 ? (imgData[seedOff + 1] ?? 0) + (upDiff[1] ?? 0) : 255;
  const lo2 = ch >= 3 ? (imgData[seedOff + 2] ?? 0) - (loDiff[2] ?? 0) : 0;
  const hi2 = ch >= 3 ? (imgData[seedOff + 2] ?? 0) + (upDiff[2] ?? 0) : 255;

  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  maskData[seedMaskIdx] = fillVal;
  queue[tail] = sy * w + sx;
  tail += 1;

  const dxTable = connectivity === 8 ? [-1, 1, 0, 0, -1, 1, -1, 1] : [-1, 1, 0, 0];
  const dyTable = connectivity === 8 ? [0, 0, -1, 1, -1, -1, 1, 1] : [0, 0, -1, 1];
  const neighborCount = dxTable.length;

  while (head < tail) {
    const cur = queue[head]!;
    head += 1;
    const cy = Math.floor(cur / w);
    const cx = cur - cy * w;

    for (let n = 0; n < neighborCount; n += 1) {
      const nx = cx + dxTable[n]!;
      const ny = cy + dyTable[n]!;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nMaskIdx = (ny + 1) * maskCols + (nx + 1);
      if (maskData[nMaskIdx] !== 0) continue;
      const off = (ny * w + nx) * ch;
      const v0 = imgData[off]!;
      if (v0 < lo0 || v0 > hi0) continue;
      if (ch >= 2) {
        const v1 = imgData[off + 1]!;
        if (v1 < lo1 || v1 > hi1) continue;
      }
      if (ch >= 3) {
        const v2 = imgData[off + 2]!;
        if (v2 < lo2 || v2 > hi2) continue;
      }
      maskData[nMaskIdx] = fillVal;
      queue[tail] = ny * w + nx;
      tail += 1;
    }
  }
  return tail;
}

// ---------------------------------------------------------------------------
// Morphology (MORPH_ELLIPSE + MORPH_OPEN) & Separable GaussianBlur (REFLECT_101)
// ---------------------------------------------------------------------------

export function buildEllipseKernel(kw: number, kh: number): NativeMat {
  const kernel = new NativeMat(kh, kw, NATIVE_CV.CV_8UC1);
  const r = Math.floor(kh / 2);
  const c = Math.floor(kw / 2);
  const invR2 = r > 0 ? 1 / (r * r) : 0;
  for (let y = 0; y < kh; y += 1) {
    const dy = y - r;
    const dx =
      r === 0
        ? c
        : Math.abs(dy) <= r
          ? Math.round(c * Math.sqrt(Math.max(0, 1 - dy * dy * invR2)))
          : -1;
    const x0 = Math.max(0, c - dx);
    const x1 = Math.min(kw - 1, c + dx);
    for (let x = x0; x <= x1; x += 1) {
      kernel.data[y * kw + x] = 1;
    }
  }
  return kernel;
}

function morphPass(
  src: Uint8Array,
  dst: Uint8Array,
  w: number,
  h: number,
  offsetsX: Int32Array,
  offsetsY: Int32Array,
  erode: boolean,
): void {
  const kCount = offsetsX.length;
  for (let y = 0; y < h; y += 1) {
    const rowOff = y * w;
    for (let x = 0; x < w; x += 1) {
      let acc = erode ? 255 : 0;
      for (let k = 0; k < kCount; k += 1) {
        const nx = x + offsetsX[k]!;
        const ny = y + offsetsY[k]!;
        const val = nx < 0 || ny < 0 || nx >= w || ny >= h ? (erode ? 255 : 0) : src[ny * w + nx]!;
        if (erode) {
          if (val < acc) acc = val;
          if (acc === 0) break;
        } else {
          if (val > acc) acc = val;
          if (acc === 255) break;
        }
      }
      dst[rowOff + x] = acc;
    }
  }
}

export function runNativeMorphologyEx(
  src: NativeMat,
  dst: NativeMat,
  op: number,
  kernel: NativeMat,
  iterations: number,
): void {
  const w = src.cols;
  const h = src.rows;
  dst.allocate(h, w, src.matType);
  const kw = kernel.cols;
  const kh = kernel.rows;
  const halfX = Math.floor(kw / 2);
  const halfY = Math.floor(kh / 2);
  const oxList: number[] = [];
  const oyList: number[] = [];
  for (let ky = 0; ky < kh; ky += 1) {
    for (let kx = 0; kx < kw; kx += 1) {
      if (kernel.data[ky * kw + kx] !== 0) {
        oxList.push(kx - halfX);
        oyList.push(ky - halfY);
      }
    }
  }
  if (oxList.length === 0) {
    dst.data.set(src.data);
    return;
  }
  const offsetsX = Int32Array.from(oxList);
  const offsetsY = Int32Array.from(oyList);
  const steps = Math.max(1, iterations);

  let bufA = new Uint8Array(src.data);
  let bufB = new Uint8Array(w * h);

  if (op === NATIVE_CV.MORPH_OPEN) {
    for (let i = 0; i < steps; i += 1) {
      morphPass(bufA, bufB, w, h, offsetsX, offsetsY, true);
      const swap = bufA;
      bufA = bufB;
      bufB = swap;
    }
    for (let i = 0; i < steps; i += 1) {
      morphPass(bufA, bufB, w, h, offsetsX, offsetsY, false);
      const swap = bufA;
      bufA = bufB;
      bufB = swap;
    }
  }
  dst.data.set(bufA);
}

function reflect101(index: number, length: number): number {
  if (length <= 1) return 0;
  let i = index;
  while (i < 0 || i >= length) {
    if (i < 0) i = -i;
    if (i >= length) i = 2 * length - 2 - i;
  }
  return i;
}

function buildGaussianKernel1D(size: number, sigma: number): Float64Array {
  const k = Math.max(1, size | 1);
  const s = sigma > 0 ? sigma : 0.3 * ((k - 1) * 0.5 - 1) + 0.8;
  const half = (k - 1) / 2;
  const kernel = new Float64Array(k);
  const inv2s2 = 1 / (2 * s * s);
  let sum = 0;
  for (let i = 0; i < k; i += 1) {
    const d = i - half;
    const w = Math.exp(-(d * d) * inv2s2);
    kernel[i] = w;
    sum += w;
  }
  for (let i = 0; i < k; i += 1) kernel[i] = kernel[i]! / sum;
  return kernel;
}

export function runNativeGaussianBlur(
  src: NativeMat,
  dst: NativeMat,
  ksize: StudioNativeSelectionSize,
  sigmaX: number,
  sigmaY?: number,
): void {
  const w = src.cols;
  const h = src.rows;
  dst.allocate(h, w, src.matType);
  const kx = buildGaussianKernel1D(ksize.width, sigmaX);
  const ky = buildGaussianKernel1D(ksize.height, sigmaY ?? sigmaX);
  const rx = (kx.length - 1) >> 1;
  const ry = (ky.length - 1) >> 1;
  const srcData = src.data;
  const tmp = new Float32Array(w * h);

  for (let y = 0; y < h; y += 1) {
    const rowOff = y * w;
    for (let x = 0; x < w; x += 1) {
      let acc = 0;
      for (let i = -rx; i <= rx; i += 1) {
        acc += srcData[rowOff + reflect101(x + i, w)]! * kx[i + rx]!;
      }
      tmp[rowOff + x] = acc;
    }
  }

  const dstData = dst.data;
  for (let y = 0; y < h; y += 1) {
    const rowOff = y * w;
    for (let x = 0; x < w; x += 1) {
      let acc = 0;
      for (let i = -ry; i <= ry; i += 1) {
        acc += tmp[reflect101(y + i, h) * w + x]! * ky[i + ry]!;
      }
      dstData[rowOff + x] = Math.min(255, Math.max(0, Math.round(acc)));
    }
  }
}
