/**
 * WebGPU 자동 플랫팅 영역 코어 라벨링 · 1px 보로노이 틈새 브리지 추출 · 밑색 채색 커널.
 */

import type { AutoFlattingSeed, RgbaColorTuple } from "./webgpu-flatting-demo-scene";
import { clampInt, paperLuminanceFromRgba } from "./webgpu-flatting-jfa-kernels";

export const EXTERIOR_JFA_LABEL = 1;

export interface AutoFlattingBoundingBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

export interface AutoFlattingRegionSummary {
  readonly id: number;
  readonly label: string;
  readonly color: RgbaColorTuple;
  readonly filledPixelCount: number;
  readonly leakedToBorder: boolean;
  readonly boundingBox: AutoFlattingBoundingBox | null;
}

export interface NormalizedFlattingSeed {
  readonly id: number;
  readonly slotIndex: number;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly color: RgbaColorTuple;
}

export function normalizeFlattingSeeds(
  seeds: readonly AutoFlattingSeed[],
): NormalizedFlattingSeed[] {
  const result: NormalizedFlattingSeed[] = [];
  const seenIds = new Set<number>();

  for (let i = 0; i < seeds.length; i += 1) {
    const seed = seeds[i];
    if (!seed || !Number.isFinite(seed.id) || seed.id < 1) continue;
    const id = Math.floor(seed.id);
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    result.push({
      id,
      slotIndex: result.length + 1,
      label: seed.label?.trim() || `region-${id}`,
      x: Math.floor(seed.x),
      y: Math.floor(seed.y),
      color: [
        clampInt(seed.color[0], 0, 255),
        clampInt(seed.color[1], 0, 255),
        clampInt(seed.color[2], 0, 255),
        clampInt(seed.color[3], 0, 255),
      ],
    });
  }

  return result;
}

function findNearestOpenCoreNearSeed(
  seedIdx: number,
  originalInk: Uint8Array,
  closedBarrier: Uint8Array,
  width: number,
  height: number,
  maxRadiusPx: number,
): number {
  if (closedBarrier[seedIdx] === 0) return seedIdx;
  if (originalInk[seedIdx] === 1 || maxRadiusPx <= 0) return -1;

  const sx = seedIdx % width;
  const sy = (seedIdx - sx) / width;
  const visited = new Set<number>([seedIdx]);
  const queue: number[] = [seedIdx];
  let head = 0;
  const maxDistSq = maxRadiusPx * maxRadiusPx;

  while (head < queue.length) {
    const cur = queue[head] ?? -1;
    head += 1;
    const x = cur % width;
    const y = (cur - x) / width;
    const neighbors = [
      x > 0 ? cur - 1 : -1,
      x + 1 < width ? cur + 1 : -1,
      y > 0 ? cur - width : -1,
      y + 1 < height ? cur + width : -1,
    ];
    for (const n of neighbors) {
      if (n < 0 || visited.has(n) || originalInk[n] === 1) continue;
      const nx = n % width;
      const ny = (n - nx) / width;
      const dx = nx - sx;
      const dy = ny - sy;
      if (dx * dx + dy * dy > maxDistSq) continue;
      if (closedBarrier[n] === 0) return n;
      visited.add(n);
      queue.push(n);
    }
  }
  return -1;
}

export function labelClosedCores(params: {
  readonly originalInk: Uint8Array;
  readonly closedBarrier: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly seeds: readonly NormalizedFlattingSeed[];
  readonly gapClosePx: number;
}): Uint32Array {
  const { originalInk, closedBarrier, width, height, seeds, gapClosePx } = params;
  const total = width * height;
  const labels = new Uint32Array(total);
  const queue = new Int32Array(total);

  for (const seed of seeds) {
    if (seed.x < 0 || seed.x >= width || seed.y < 0 || seed.y >= height) continue;
    const rawIdx = seed.y * width + seed.x;
    if (originalInk[rawIdx] === 1) continue;

    const coreLabel = (seed.slotIndex + 1) >>> 0;
    const startIdx = findNearestOpenCoreNearSeed(
      rawIdx,
      originalInk,
      closedBarrier,
      width,
      height,
      Math.max(2, gapClosePx),
    );
    if (startIdx < 0) {
      if (labels[rawIdx] === 0) labels[rawIdx] = coreLabel;
      continue;
    }
    if (labels[startIdx] !== 0) continue;

    let head = 0;
    let tail = 0;
    labels[startIdx] = coreLabel;
    queue[tail] = startIdx;
    tail += 1;

    while (head < tail) {
      const idx = queue[head] ?? 0;
      head += 1;
      const x = idx % width;
      const y = (idx - x) / width;
      if (x > 0 && closedBarrier[idx - 1] === 0 && labels[idx - 1] === 0) {
        labels[idx - 1] = coreLabel;
        queue[tail] = idx - 1;
        tail += 1;
      }
      if (x + 1 < width && closedBarrier[idx + 1] === 0 && labels[idx + 1] === 0) {
        labels[idx + 1] = coreLabel;
        queue[tail] = idx + 1;
        tail += 1;
      }
      if (y > 0 && closedBarrier[idx - width] === 0 && labels[idx - width] === 0) {
        labels[idx - width] = coreLabel;
        queue[tail] = idx - width;
        tail += 1;
      }
      if (y + 1 < height && closedBarrier[idx + width] === 0 && labels[idx + width] === 0) {
        labels[idx + width] = coreLabel;
        queue[tail] = idx + width;
        tail += 1;
      }
    }
  }

  let extHead = 0;
  let extTail = 0;
  const enqueueExterior = (idx: number): void => {
    if (closedBarrier[idx] === 0 && labels[idx] === 0) {
      labels[idx] = EXTERIOR_JFA_LABEL;
      queue[extTail] = idx;
      extTail += 1;
    }
  };
  for (let x = 0; x < width; x += 1) {
    enqueueExterior(x);
    enqueueExterior((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueueExterior(y * width);
    enqueueExterior(y * width + (width - 1));
  }
  while (extHead < extTail) {
    const idx = queue[extHead] ?? 0;
    extHead += 1;
    const x = idx % width;
    const y = (idx - x) / width;
    if (x > 0) enqueueExterior(idx - 1);
    if (x + 1 < width) enqueueExterior(idx + 1);
    if (y > 0) enqueueExterior(idx - width);
    if (y + 1 < height) enqueueExterior(idx + width);
  }

  return labels;
}

export function buildWatertightBarrierFromJfa(params: {
  readonly originalInk: Uint8Array;
  readonly morphClosedBarrier: Uint8Array;
  readonly jfaLabels: Uint32Array;
  readonly width: number;
  readonly height: number;
}): { readonly watertightBarrier: Uint8Array; readonly bridgedPixelCount: number } {
  const { originalInk, morphClosedBarrier, jfaLabels, width, height } = params;
  const watertightBarrier = new Uint8Array(originalInk);
  let bridgedPixelCount = 0;

  for (let y = 0; y < height; y += 1) {
    const rowOff = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = rowOff + x;
      if (originalInk[idx] === 1 || morphClosedBarrier[idx] === 0) continue;
      const myLabel = jfaLabels[idx] ?? 0;
      let shouldBridge = false;
      const neighbors = [
        x > 0 ? idx - 1 : -1,
        x + 1 < width ? idx + 1 : -1,
        y > 0 ? idx - width : -1,
        y + 1 < height ? idx + width : -1,
      ];
      for (const n of neighbors) {
        if (n < 0 || originalInk[n] === 1) continue;
        const nLabel = jfaLabels[n] ?? 0;
        if (myLabel === 0) {
          if (nLabel > 0) {
            shouldBridge = true;
            break;
          }
          continue;
        }
        if (nLabel === 0 || nLabel === myLabel) continue;
        if (myLabel === EXTERIOR_JFA_LABEL || (nLabel !== EXTERIOR_JFA_LABEL && myLabel > nLabel)) {
          shouldBridge = true;
          break;
        }
      }

      if (shouldBridge) {
        watertightBarrier[idx] = 1;
        bridgedPixelCount += 1;
      }
    }
  }

  return { watertightBarrier, bridgedPixelCount };
}

export function floodFillFinalRegions(params: {
  readonly watertightBarrier: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly seeds: readonly NormalizedFlattingSeed[];
}): {
  readonly regionMap: Uint32Array;
  readonly regions: readonly AutoFlattingRegionSummary[];
  readonly filledPixelCount: number;
  readonly leakedPixelCount: number;
  readonly leakedToBorder: boolean;
  readonly leakBlockRatePct: number;
} {
  const { watertightBarrier, width, height, seeds } = params;
  const total = width * height;
  const regionMap = new Uint32Array(total);
  const queue = new Int32Array(total);
  const summaries: AutoFlattingRegionSummary[] = [];

  let totalFilled = 0;
  let totalLeaked = 0;
  let anyLeaked = false;
  let activeSeedCount = 0;
  let sealedSeedCount = 0;

  for (const seed of seeds) {
    const inBounds = seed.x >= 0 && seed.x < width && seed.y >= 0 && seed.y < height;
    const startIdx = inBounds ? seed.y * width + seed.x : -1;
    if (!inBounds || watertightBarrier[startIdx] === 1 || regionMap[startIdx] !== 0) {
      summaries.push({
        id: seed.id,
        label: seed.label,
        color: seed.color,
        filledPixelCount: 0,
        leakedToBorder: false,
        boundingBox: null,
      });
      continue;
    }

    activeSeedCount += 1;
    let head = 0;
    let tail = 0;
    regionMap[startIdx] = seed.slotIndex;
    queue[tail] = startIdx;
    tail += 1;

    let minX = seed.x;
    let maxX = seed.x;
    let minY = seed.y;
    let maxY = seed.y;
    let leaked = false;

    while (head < tail) {
      const idx = queue[head] ?? 0;
      head += 1;
      const x = idx % width;
      const y = (idx - x) / width;

      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) leaked = true;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      if (x > 0 && watertightBarrier[idx - 1] === 0 && regionMap[idx - 1] === 0) {
        regionMap[idx - 1] = seed.slotIndex;
        queue[tail] = idx - 1;
        tail += 1;
      }
      if (x + 1 < width && watertightBarrier[idx + 1] === 0 && regionMap[idx + 1] === 0) {
        regionMap[idx + 1] = seed.slotIndex;
        queue[tail] = idx + 1;
        tail += 1;
      }
      if (y > 0 && watertightBarrier[idx - width] === 0 && regionMap[idx - width] === 0) {
        regionMap[idx - width] = seed.slotIndex;
        queue[tail] = idx - width;
        tail += 1;
      }
      if (y + 1 < height && watertightBarrier[idx + width] === 0 && regionMap[idx + width] === 0) {
        regionMap[idx + width] = seed.slotIndex;
        queue[tail] = idx + width;
        tail += 1;
      }
    }

    totalFilled += tail;
    if (leaked) {
      anyLeaked = true;
      totalLeaked += tail;
    } else {
      sealedSeedCount += 1;
    }

    summaries.push({
      id: seed.id,
      label: seed.label,
      color: seed.color,
      filledPixelCount: tail,
      leakedToBorder: leaked,
      boundingBox: {
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      },
    });
  }

  const leakBlockRatePct =
    activeSeedCount === 0 || !anyLeaked
      ? 100
      : Math.round((sealedSeedCount / activeSeedCount) * 100);

  return {
    regionMap,
    regions: Object.freeze(summaries),
    filledPixelCount: totalFilled,
    leakedPixelCount: totalLeaked,
    leakedToBorder: anyLeaked,
    leakBlockRatePct,
  };
}

export function applyRegionFlattingCpu(params: {
  readonly regionMap: Uint32Array;
  readonly lineartRgba: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly seeds: readonly NormalizedFlattingSeed[];
  readonly trapRadiusPx: number;
}): { readonly flattingRgba: Uint8ClampedArray; readonly underStrokeTrappedPixelCount: number } {
  const { regionMap, lineartRgba, width, height, seeds, trapRadiusPx } = params;
  const total = width * height;
  const flattingRgba = new Uint8ClampedArray(total * 4);
  const palette: (RgbaColorTuple | null)[] = [null];
  for (const seed of seeds) palette.push(seed.color);

  let trappedCount = 0;

  for (let y = 0; y < height; y += 1) {
    const rowOff = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = rowOff + x;
      const off = idx * 4;
      const rid = regionMap[idx] ?? 0;
      const directColor = rid > 0 ? palette[rid] ?? null : null;

      if (directColor) {
        flattingRgba[off] = directColor[0];
        flattingRgba[off + 1] = directColor[1];
        flattingRgba[off + 2] = directColor[2];
        flattingRgba[off + 3] = directColor[3];
        continue;
      }

      if (trapRadiusPx <= 0 || paperLuminanceFromRgba(lineartRgba, idx) > 240) continue;

      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let hits = 0;

      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        const nRowOff = ny * width;
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const nRid = regionMap[nRowOff + nx] ?? 0;
          const nCol = nRid > 0 ? palette[nRid] ?? null : null;
          if (!nCol) continue;
          const weight = dx === 0 || dy === 0 ? 2 : 1;
          sumR += nCol[0] * weight;
          sumG += nCol[1] * weight;
          sumB += nCol[2] * weight;
          hits += weight;
        }
      }

      if (hits > 0) {
        flattingRgba[off] = Math.min(255, Math.floor(sumR / hits));
        flattingRgba[off + 1] = Math.min(255, Math.floor(sumG / hits));
        flattingRgba[off + 2] = Math.min(255, Math.floor(sumB / hits));
        flattingRgba[off + 3] = 255;
        trappedCount += 1;
      }
    }
  }

  return { flattingRgba, underStrokeTrappedPixelCount: trappedCount };
}
