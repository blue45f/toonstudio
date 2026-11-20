/**
 * studio-patchmatch-inpaint-worker.ts
 *
 * 4단계 가우시안 피라미드 코어스-투-파인 **PatchMatch 내용 인식 채우기(Content-Aware Fill)**
 * WebWorker + 순수 실행 코어 (제외 마스크 / Sampling Brush 지원).
 *
 * 파이프라인:
 * 1. 4단계 가우시안 피라미드 구축 (`[1, 4, 6, 4, 1] / 16` 분리형 다운샘플링)
 * 2. 제외 마스크(`excludeMask`) 반영 유효 소스 패치 마스크 계산
 * 3. 코어스 → 파인: 경계 확산 초기화 → 5회 교대 스캔라인 전파 + 지수 감쇠 랜덤 탐색 → 가중 패치 투표
 * 4. 경계 포아송(Jacobi) 블렌딩으로 원본 경계와 조명·색조 봉합
 */
import type { StudioImageDataLike } from "../studio-filters";

export interface PatchMatchInpaintOptions {
  readonly patchRadius?: number;
  readonly pyramidLevels?: number;
  readonly iterationsPerLevel?: number;
  readonly poissonBlendIterations?: number;
  readonly seed?: number;
  readonly onProgress?: (progress: PatchMatchProgressEvent) => void;
}

export interface PatchMatchProgressEvent {
  readonly level: number;
  readonly totalLevels: number;
  readonly iteration: number;
  readonly progress01: number;
}

export interface PatchMatchInpaintStats {
  readonly pyramidLevelsExecuted: number;
  readonly patchRadius: number;
  readonly holePixelCount: number;
  readonly validSourcePatchCount: number;
  readonly excludedPixelCount: number;
  readonly fallbackUsed: boolean;
}

export interface PatchMatchInpaintResult {
  readonly imageData: StudioImageDataLike;
  readonly stats: PatchMatchInpaintStats;
}

export type PatchMatchWorkerRequest =
  | {
      readonly type: "run";
      readonly requestId: string;
      readonly width: number;
      readonly height: number;
      readonly rgba: Uint8ClampedArray;
      readonly holeMask: Uint8Array | Uint8ClampedArray;
      readonly excludeMask?: Uint8Array | Uint8ClampedArray;
      readonly options?: Omit<PatchMatchInpaintOptions, "onProgress">;
    }
  | { readonly type: "cancel"; readonly requestId: string };

export type PatchMatchWorkerResponse =
  | { readonly type: "progress"; readonly requestId: string; readonly progress: PatchMatchProgressEvent }
  | {
      readonly type: "result";
      readonly requestId: string;
      readonly width: number;
      readonly height: number;
      readonly rgba: Uint8ClampedArray;
      readonly stats: PatchMatchInpaintStats;
    }
  | { readonly type: "error"; readonly requestId: string; readonly message: string };

interface PyramidLevel {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly hole: Uint8Array;
  readonly exclude: Uint8Array;
}

const GAUSS_5 = [1, 4, 6, 4, 1] as const;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function createPrng(seed: number): () => number {
  let s = (Math.floor(seed) >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function downsampleRgbaGaussian2x(rgba: Uint8ClampedArray, width: number, height: number) {
  const nextW = Math.max(1, Math.floor(width / 2));
  const nextH = Math.max(1, Math.floor(height / 2));
  const horiz = new Float32Array(nextW * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let nx = 0; nx < nextW; nx += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = -2; k <= 2; k += 1) {
        const idx = (y * width + clamp(nx * 2 + k, 0, width - 1)) * 4;
        const w = GAUSS_5[k + 2]!;
        r += (rgba[idx] ?? 0) * w;
        g += (rgba[idx + 1] ?? 0) * w;
        b += (rgba[idx + 2] ?? 0) * w;
        a += (rgba[idx + 3] ?? 0) * w;
      }
      const o = (y * nextW + nx) * 4;
      horiz[o] = r / 16;
      horiz[o + 1] = g / 16;
      horiz[o + 2] = b / 16;
      horiz[o + 3] = a / 16;
    }
  }
  const out = new Uint8ClampedArray(nextW * nextH * 4);
  for (let ny = 0; ny < nextH; ny += 1) {
    for (let nx = 0; nx < nextW; nx += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = -2; k <= 2; k += 1) {
        const idx = (clamp(ny * 2 + k, 0, height - 1) * nextW + nx) * 4;
        const w = GAUSS_5[k + 2]!;
        r += horiz[idx]! * w;
        g += horiz[idx + 1]! * w;
        b += horiz[idx + 2]! * w;
        a += horiz[idx + 3]! * w;
      }
      const o = (ny * nextW + nx) * 4;
      out[o] = Math.round(r / 16);
      out[o + 1] = Math.round(g / 16);
      out[o + 2] = Math.round(b / 16);
      out[o + 3] = Math.round(a / 16);
    }
  }
  return { width: nextW, height: nextH, rgba: out };
}

function downsampleMask2x(mask: Uint8Array, w: number, h: number, nw: number, nh: number): Uint8Array {
  const out = new Uint8Array(nw * nh);
  for (let ny = 0; ny < nh; ny += 1) {
    const y0 = ny * 2;
    const y1 = Math.min(h - 1, y0 + 1);
    for (let nx = 0; nx < nw; nx += 1) {
      const x0 = nx * 2;
      const x1 = Math.min(w - 1, x0 + 1);
      const any = (mask[y0 * w + x0] ?? 0) | (mask[y0 * w + x1] ?? 0) | (mask[y1 * w + x0] ?? 0) | (mask[y1 * w + x1] ?? 0);
      out[ny * nw + nx] = any > 0 ? 1 : 0;
    }
  }
  return out;
}

function buildGaussianPyramid(
  source: StudioImageDataLike,
  holeBinary: Uint8Array,
  excludeBinary: Uint8Array,
  maxLevels: number,
  patchRadius: number,
): PyramidLevel[] {
  const levels: PyramidLevel[] = [
    { width: source.width, height: source.height, rgba: new Uint8ClampedArray(source.data), hole: holeBinary, exclude: excludeBinary },
  ];
  const minDim = patchRadius * 2 + 4;
  for (let lvl = 1; lvl < maxLevels; lvl += 1) {
    const prev = levels[lvl - 1]!;
    if (prev.width < minDim * 2 || prev.height < minDim * 2) break;
    const down = downsampleRgbaGaussian2x(prev.rgba, prev.width, prev.height);
    levels.push({
      width: down.width,
      height: down.height,
      rgba: down.rgba,
      hole: downsampleMask2x(prev.hole, prev.width, prev.height, down.width, down.height),
      exclude: downsampleMask2x(prev.exclude, prev.width, prev.height, down.width, down.height),
    });
  }
  return levels;
}

function buildValidSourceMask(
  width: number,
  height: number,
  hole: Uint8Array,
  exclude: Uint8Array,
  radius: number,
  hasExclude: boolean,
): { readonly valid: Uint8Array; readonly coords: Int32Array; readonly fallbackUsed: boolean } {
  const scan = (respectExclude: boolean) => {
    const valid = new Uint8Array(width * height);
    const list: number[] = [];
    for (let y = radius; y < height - radius; y += 1) {
      for (let x = radius; x < width - radius; x += 1) {
        let ok = true;
        for (let dy = -radius; dy <= radius && ok; dy += 1) {
          const row = (y + dy) * width;
          for (let dx = -radius; dx <= radius; dx += 1) {
            const p = row + x + dx;
            if (hole[p] === 1 || (respectExclude && exclude[p] === 1)) {
              ok = false;
              break;
            }
          }
        }
        if (ok) {
          valid[y * width + x] = 1;
          list.push(x, y);
        }
      }
    }
    return { valid, coords: Int32Array.from(list) };
  };

  const strict = scan(hasExclude);
  if (strict.coords.length > 0 || !hasExclude) return { ...strict, fallbackUsed: false };
  const relaxed = scan(false);
  return { ...relaxed, fallbackUsed: relaxed.coords.length > 0 };
}

function initializeHoleByDiffusion(rgba: Uint8ClampedArray, hole: Uint8Array, width: number, height: number): void {
  const known = new Uint8Array(width * height);
  let remaining = 0;
  for (let i = 0; i < known.length; i += 1) {
    if (hole[i] === 0) known[i] = 1;
    else remaining += 1;
  }
  for (let pass = 0; pass < width + height && remaining > 0; pass += 1) {
    const nextKnown: number[] = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const p = y * width + x;
        if (known[p] === 1) continue;
        let sr = 0;
        let sg = 0;
        let sb = 0;
        let sa = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            const np = ny * width + nx;
            if (known[np] === 1) {
              const ni = np * 4;
              sr += rgba[ni] ?? 0;
              sg += rgba[ni + 1] ?? 0;
              sb += rgba[ni + 2] ?? 0;
              sa += rgba[ni + 3] ?? 255;
              count += 1;
            }
          }
        }
        if (count > 0) {
          const oi = p * 4;
          rgba[oi] = Math.round(sr / count);
          rgba[oi + 1] = Math.round(sg / count);
          rgba[oi + 2] = Math.round(sb / count);
          rgba[oi + 3] = Math.round(sa / count);
          nextKnown.push(p);
        }
      }
    }
    if (nextKnown.length === 0) break;
    for (const p of nextKnown) known[p] = 1;
    remaining -= nextKnown.length;
  }
}

function patchSsdDistance(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  tx: number,
  ty: number,
  sx: number,
  sy: number,
  radius: number,
  bestSoFar: number,
): number {
  let dist = 0;
  for (let dy = -radius; dy <= radius; dy += 1) {
    const tRow = clamp(ty + dy, 0, height - 1) * width;
    const sRow = clamp(sy + dy, 0, height - 1) * width;
    for (let dx = -radius; dx <= radius; dx += 1) {
      const ti = (tRow + clamp(tx + dx, 0, width - 1)) * 4;
      const si = (sRow + clamp(sx + dx, 0, width - 1)) * 4;
      const dr = (rgba[ti] ?? 0) - (rgba[si] ?? 0);
      const dg = (rgba[ti + 1] ?? 0) - (rgba[si + 1] ?? 0);
      const db = (rgba[ti + 2] ?? 0) - (rgba[si + 2] ?? 0);
      dist += dr * dr + dg * dg + db * db;
      if (dist >= bestSoFar) return dist;
    }
  }
  return dist;
}

function runPatchMatchLevel(params: {
  readonly level: PyramidLevel;
  readonly radius: number;
  readonly iterations: number;
  readonly validMask: Uint8Array;
  readonly validCoords: Int32Array;
  readonly prevNnf: { readonly width: number; readonly height: number; readonly x: Int32Array; readonly y: Int32Array } | null;
  readonly rng: () => number;
  readonly onIter?: (iteration: number) => void;
}): { readonly nnfX: Int32Array; readonly nnfY: Int32Array } {
  const { level, radius, iterations, validMask, validCoords, prevNnf, rng, onIter } = params;
  const { width, height, rgba, hole } = level;
  const count = width * height;
  const nnfX = new Int32Array(count);
  const nnfY = new Int32Array(count);
  const nnfDist = new Float32Array(count);
  const validPairCount = validCoords.length / 2;

  const pickRandomValid = (): readonly [number, number] => {
    const idx = Math.floor(rng() * validPairCount) * 2;
    return [validCoords[idx]!, validCoords[idx + 1]!];
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      if (hole[p] === 0 && validMask[p] === 1) {
        nnfX[p] = x;
        nnfY[p] = y;
        nnfDist[p] = 0;
        continue;
      }
      let sx: number;
      let sy: number;
      if (prevNnf) {
        const pi = Math.min(prevNnf.height - 1, Math.floor(y / 2)) * prevNnf.width + Math.min(prevNnf.width - 1, Math.floor(x / 2));
        const cx = clamp(prevNnf.x[pi]! * 2 + (x & 1), radius, width - 1 - radius);
        const cy = clamp(prevNnf.y[pi]! * 2 + (y & 1), radius, height - 1 - radius);
        if (validMask[cy * width + cx] === 1) {
          sx = cx;
          sy = cy;
        } else {
          [sx, sy] = pickRandomValid();
        }
      } else {
        [sx, sy] = pickRandomValid();
      }
      nnfX[p] = sx;
      nnfY[p] = sy;
      nnfDist[p] = patchSsdDistance(rgba, width, height, x, y, sx, sy, radius, Infinity);
    }
  }

  const activeMask = new Uint8Array(count);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (hole[y * width + x] !== 1) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const ny = clamp(y + dy, 0, height - 1);
        for (let dx = -radius; dx <= radius; dx += 1) {
          activeMask[ny * width + clamp(x + dx, 0, width - 1)] = 1;
        }
      }
    }
  }

  const maxSearchR = Math.max(width, height);
  const sigmaSq = Math.max(1, (radius * 2 + 1) * (radius * 2 + 1) * 3 * 36 * 36);

  for (let iter = 0; iter < iterations; iter += 1) {
    const rev = (iter & 1) === 1;
    const yStep = rev ? -1 : 1;
    const xStep = rev ? -1 : 1;
    for (let y = rev ? height - 1 : 0; y !== (rev ? -1 : height); y += yStep) {
      for (let x = rev ? width - 1 : 0; x !== (rev ? -1 : width); x += xStep) {
        const p = y * width + x;
        if (activeMask[p] !== 1) continue;
        let bestX = nnfX[p]!;
        let bestY = nnfY[p]!;
        let bestD = nnfDist[p]!;

        const tryCandidate = (cx: number, cy: number): void => {
          if (cx < radius || cx >= width - radius || cy < radius || cy >= height - radius) return;
          if (validMask[cy * width + cx] !== 1) return;
          const d = patchSsdDistance(rgba, width, height, x, y, cx, cy, radius, bestD);
          if (d < bestD) {
            bestD = d;
            bestX = cx;
            bestY = cy;
          }
        };

        const nx = x - xStep;
        if (nx >= 0 && nx < width) tryCandidate(nnfX[y * width + nx]! + xStep, nnfY[y * width + nx]!);
        const ny = y - yStep;
        if (ny >= 0 && ny < height) tryCandidate(nnfX[ny * width + x]!, nnfY[ny * width + x]! + yStep);

        for (let r = maxSearchR; r >= 1; r = Math.floor(r * 0.5)) {
          tryCandidate(bestX + Math.round((rng() * 2 - 1) * r), bestY + Math.round((rng() * 2 - 1) * r));
        }

        nnfX[p] = bestX;
        nnfY[p] = bestY;
        nnfDist[p] = bestD;
      }
    }

    const accR = new Float32Array(count);
    const accG = new Float32Array(count);
    const accB = new Float32Array(count);
    const accW = new Float32Array(count);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const p = y * width + x;
        if (activeMask[p] !== 1) continue;
        const sx = nnfX[p]!;
        const sy = nnfY[p]!;
        const w = Math.exp(-nnfDist[p]! / (2 * sigmaSq)) + 1e-4;
        for (let dy = -radius; dy <= radius; dy += 1) {
          const ty = y + dy;
          if (ty < 0 || ty >= height) continue;
          const srcY = clamp(sy + dy, 0, height - 1);
          for (let dx = -radius; dx <= radius; dx += 1) {
            const tx = x + dx;
            if (tx < 0 || tx >= width) continue;
            const tp = ty * width + tx;
            if (hole[tp] !== 1) continue;
            const si = (srcY * width + clamp(sx + dx, 0, width - 1)) * 4;
            accR[tp]! += (rgba[si] ?? 0) * w;
            accG[tp]! += (rgba[si + 1] ?? 0) * w;
            accB[tp]! += (rgba[si + 2] ?? 0) * w;
            accW[tp]! += w;
          }
        }
      }
    }
    for (let p = 0; p < count; p += 1) {
      if (hole[p] !== 1 || accW[p]! <= 0) continue;
      const idx = p * 4;
      rgba[idx] = Math.round(accR[p]! / accW[p]!);
      rgba[idx + 1] = Math.round(accG[p]! / accW[p]!);
      rgba[idx + 2] = Math.round(accB[p]! / accW[p]!);
      rgba[idx + 3] = 255;
    }
    onIter?.(iter + 1);
  }
  return { nnfX, nnfY };
}

function upsampleHolePixels(coarse: PyramidLevel, fine: PyramidLevel): void {
  for (let y = 0; y < fine.height; y += 1) {
    const cy = Math.min(coarse.height - 1, Math.floor(y / 2));
    for (let x = 0; x < fine.width; x += 1) {
      const fp = y * fine.width + x;
      if (fine.hole[fp] !== 1) continue;
      const ci = (cy * coarse.width + Math.min(coarse.width - 1, Math.floor(x / 2))) * 4;
      const fi = fp * 4;
      fine.rgba[fi] = coarse.rgba[ci] ?? 0;
      fine.rgba[fi + 1] = coarse.rgba[ci + 1] ?? 0;
      fine.rgba[fi + 2] = coarse.rgba[ci + 2] ?? 0;
      fine.rgba[fi + 3] = coarse.rgba[ci + 3] ?? 255;
    }
  }
}

function applyBoundaryPoissonBlend(
  target: Uint8ClampedArray,
  hole: Uint8Array,
  width: number,
  height: number,
  iterations: number,
): void {
  if (iterations <= 0) return;
  const count = width * height;
  const guide = new Float32Array(count * 3);
  const curr = new Float32Array(count * 3);
  const next = new Float32Array(count * 3);
  for (let p = 0; p < count; p += 1) {
    const i4 = p * 4;
    const i3 = p * 3;
    guide[i3] = curr[i3] = target[i4] ?? 0;
    guide[i3 + 1] = curr[i3 + 1] = target[i4 + 1] ?? 0;
    guide[i3 + 2] = curr[i3 + 2] = target[i4 + 2] ?? 0;
  }
  for (let iter = 0; iter < iterations; iter += 1) {
    next.set(curr);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const p = y * width + x;
        if (hole[p] !== 1) continue;
        const pc = p * 3;
        const pL = (p - 1) * 3;
        const pR = (p + 1) * 3;
        const pT = (p - width) * 3;
        const pB = (p + width) * 3;
        for (let ch = 0; ch < 3; ch += 1) {
          const divG = 4 * guide[pc + ch]! - guide[pL + ch]! - guide[pR + ch]! - guide[pT + ch]! - guide[pB + ch]!;
          next[pc + ch] = clamp((curr[pL + ch]! + curr[pR + ch]! + curr[pT + ch]! + curr[pB + ch]! + divG) * 0.25, 0, 255);
        }
      }
    }
    curr.set(next);
  }
  for (let p = 0; p < count; p += 1) {
    if (hole[p] !== 1) continue;
    const i4 = p * 4;
    const i3 = p * 3;
    target[i4] = Math.round(curr[i3]!);
    target[i4 + 1] = Math.round(curr[i3 + 1]!);
    target[i4 + 2] = Math.round(curr[i3 + 2]!);
  }
}

/** 4단계 가우시안 피라미드 코어스-투-파인 PatchMatch 내용 인식 채우기 진입점. */
export function runPatchMatchInpaint(
  source: StudioImageDataLike,
  holeMask: Uint8Array | Uint8ClampedArray,
  excludeMask?: Uint8Array | Uint8ClampedArray,
  options: PatchMatchInpaintOptions = {},
): PatchMatchInpaintResult {
  const pixelCount = source.width * source.height;
  if (holeMask.length !== pixelCount) throw new RangeError(`구멍 마스크 크기 불일치: ${holeMask.length} vs ${pixelCount}`);
  if (excludeMask && excludeMask.length !== pixelCount) throw new RangeError(`제외 마스크 크기 불일치: ${excludeMask.length} vs ${pixelCount}`);

  const patchRadius = Math.round(clamp(options.patchRadius ?? 3, 1, 6));
  const requestedLevels = Math.round(clamp(options.pyramidLevels ?? 4, 1, 4));
  const iterationsPerLevel = Math.round(clamp(options.iterationsPerLevel ?? 5, 1, 12));
  const poissonIters = Math.round(clamp(options.poissonBlendIterations ?? 20, 0, 60));
  const rng = createPrng(options.seed ?? 1337);

  const holeBinary = new Uint8Array(pixelCount);
  const excludeBinary = new Uint8Array(pixelCount);
  let holePixelCount = 0;
  let excludedPixelCount = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    if ((holeMask[i] ?? 0) > 0) {
      holeBinary[i] = 1;
      holePixelCount += 1;
    }
    if (excludeMask && (excludeMask[i] ?? 0) > 0) {
      excludeBinary[i] = 1;
      excludedPixelCount += 1;
    }
  }

  if (holePixelCount === 0) {
    return {
      imageData: { width: source.width, height: source.height, data: new Uint8ClampedArray(source.data) },
      stats: { pyramidLevelsExecuted: 0, patchRadius, holePixelCount: 0, validSourcePatchCount: 0, excludedPixelCount, fallbackUsed: false },
    };
  }

  const pyramid = buildGaussianPyramid(source, holeBinary, excludeBinary, requestedLevels, patchRadius);
  const totalLevels = pyramid.length;
  const hasExclude = excludedPixelCount > 0;
  let prevNnf: { readonly width: number; readonly height: number; readonly x: Int32Array; readonly y: Int32Array } | null = null;
  let finalValidSourceCount = 0;
  let anyFallback = false;

  for (let lvl = totalLevels - 1; lvl >= 0; lvl -= 1) {
    const level = pyramid[lvl]!;
    if (lvl === totalLevels - 1) initializeHoleByDiffusion(level.rgba, level.hole, level.width, level.height);
    else upsampleHolePixels(pyramid[lvl + 1]!, level);

    const levelRadius = Math.min(patchRadius, Math.max(1, Math.floor(Math.min(level.width, level.height) / 6)));
    const { valid, coords, fallbackUsed } = buildValidSourceMask(
      level.width,
      level.height,
      level.hole,
      level.exclude,
      levelRadius,
      hasExclude,
    );
    if (fallbackUsed) anyFallback = true;
    if (lvl === 0) finalValidSourceCount = coords.length / 2;

    if (coords.length > 0) {
      const stepIndex = totalLevels - 1 - lvl;
      const result = runPatchMatchLevel({
        level,
        radius: levelRadius,
        iterations: iterationsPerLevel,
        validMask: valid,
        validCoords: coords,
        prevNnf,
        rng,
        onIter: (iteration) => {
          options.onProgress?.({
            level: lvl,
            totalLevels,
            iteration,
            progress01: (stepIndex * iterationsPerLevel + iteration) / (totalLevels * iterationsPerLevel),
          });
        },
      });
      prevNnf = { width: level.width, height: level.height, x: result.nnfX, y: result.nnfY };
    } else {
      prevNnf = null;
    }
  }

  const finest = pyramid[0]!;
  applyBoundaryPoissonBlend(finest.rgba, finest.hole, finest.width, finest.height, poissonIters);
  return {
    imageData: { width: finest.width, height: finest.height, data: finest.rgba },
    stats: {
      pyramidLevelsExecuted: totalLevels,
      patchRadius,
      holePixelCount,
      validSourcePatchCount: finalValidSourceCount,
      excludedPixelCount,
      fallbackUsed: anyFallback,
    },
  };
}

export function handlePatchMatchWorkerMessage(
  request: PatchMatchWorkerRequest,
  postResponse: (response: PatchMatchWorkerResponse) => void,
): void {
  if (request.type === "cancel") return;
  try {
    const result = runPatchMatchInpaint(
      { width: request.width, height: request.height, data: request.rgba },
      request.holeMask,
      request.excludeMask,
      {
        ...request.options,
        onProgress: (progress) => postResponse({ type: "progress", requestId: request.requestId, progress }),
      },
    );
    postResponse({
      type: "result",
      requestId: request.requestId,
      width: result.imageData.width,
      height: result.imageData.height,
      rgba: result.imageData.data,
      stats: result.stats,
    });
  } catch (err) {
    postResponse({
      type: "error",
      requestId: request.requestId,
      message: err instanceof Error ? err.message : "PatchMatch 채우기 실행에 실패했습니다.",
    });
  }
}

interface WorkerScopeLike {
  onmessage: ((event: { readonly data: PatchMatchWorkerRequest }) => void) | null;
  postMessage: (message: PatchMatchWorkerResponse) => void;
}

export function attachPatchMatchWorkerScope(scope?: WorkerScopeLike): boolean {
  const candidate =
    scope ??
    (typeof globalThis !== "undefined" &&
    "importScripts" in globalThis &&
    typeof (globalThis as unknown as WorkerScopeLike).postMessage === "function"
      ? (globalThis as unknown as WorkerScopeLike)
      : null);
  if (!candidate) return false;
  candidate.onmessage = (event) => {
    handlePatchMatchWorkerMessage(event.data, (res) => candidate.postMessage(res));
  };
  return true;
}

attachPatchMatchWorkerScope();
