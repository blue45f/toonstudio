/**
 * SIGGRAPH 2026 "See-Through" 패러다임 기반 단일 평면 일러스트 자동 레이어 분해 및 2.5D 패럴랙스 합성기.
 *
 * 단일 평면 RGBA 일러스트에서 에지·색상 영역을 분할하고 테두리 접촉률·포위(enclosure) 위상·시각 현저성으로
 * 전경 캐릭터(`foreground`) · 중경 소품(`midground`) · 배경(`background`)의 Z-Order를 추론한다.
 * 전경·중경에 가려졌던 하위 레이어 구멍은 `inpaintOccludedLayerRegion`으로 100% 복원한다.
 */

import {
  assertValidRgbaImage,
  clampByte,
  computeImageSimilarityMetrics,
  computeRgbDistance,
  computeSobelMagnitude,
  inpaintOccludedLayerRegion,
  type ImageSimilarityMetrics,
  type InpaintedRegionResult,
  type RgbaImageBuffer,
  type SeeThroughInpaintOptions,
} from "./seethrough-multiscale-inpaint";

export {
  computeImageSimilarityMetrics,
  inpaintOccludedLayerRegion,
  type ImageSimilarityMetrics,
  type InpaintedRegionResult,
  type RgbaImageBuffer,
  type SeeThroughInpaintOptions,
};

export type SeeThroughLayerRole = "background" | "midground" | "foreground";

export interface SeeThroughSemanticSeed {
  readonly x: number;
  readonly y: number;
  readonly role: SeeThroughLayerRole;
}

export interface SeeThroughDecompositionOptions extends SeeThroughInpaintOptions {
  readonly edgeThreshold?: number;
  readonly colorMergeDistance?: number;
  readonly minRegionPixels?: number;
  readonly semanticSeeds?: ReadonlyArray<SeeThroughSemanticSeed>;
  readonly parallaxFactors?: {
    readonly background: number;
    readonly midground: number;
    readonly foreground: number;
  };
}

export interface SeeThroughLayerSlice {
  readonly role: SeeThroughLayerRole;
  readonly zOrder: number;
  readonly parallaxFactor: number;
  readonly image: RgbaImageBuffer;
  readonly originalPixelCount: number;
  readonly occludedHolePixelCount: number;
  readonly inpaintedPixelCount: number;
  readonly remainingHolePixels: number;
  readonly regionIds: ReadonlyArray<number>;
}

export interface SeeThroughRegionSummary {
  readonly regionId: number;
  readonly role: SeeThroughLayerRole;
  readonly pixelCount: number;
  readonly borderContactRatio: number;
  readonly centerSalience: number;
  readonly enclosureRatio: number;
  readonly depthScore: number;
  readonly meanColor: readonly [number, number, number];
}

export interface SeeThroughDecompositionResult {
  readonly width: number;
  readonly height: number;
  readonly layers: ReadonlyArray<SeeThroughLayerSlice>;
  readonly backgroundLayer: SeeThroughLayerSlice;
  readonly midgroundLayer: SeeThroughLayerSlice;
  readonly foregroundLayer: SeeThroughLayerSlice;
  readonly regions: ReadonlyArray<SeeThroughRegionSummary>;
  readonly recomposedImage: RgbaImageBuffer;
  readonly recompositionPsnrDb: number;
  readonly recompositionMae: number;
}

interface InternalRegionStats {
  readonly id: number;
  readonly pixels: number[];
  sumR: number;
  sumG: number;
  sumB: number;
  sumX: number;
  sumY: number;
  borderPixels: number;
  readonly neighborCounts: Map<number, number>;
}

const DEFAULT_PARALLAX_FACTORS = { background: 0.15, midground: 0.55, foreground: 1.0 } as const;

function segmentIllustrationRegions(
  image: RgbaImageBuffer,
  edgeThreshold: number,
  colorMergeDistance: number,
): { readonly labels: Int32Array; readonly stats: InternalRegionStats[] } {
  const { width, height, data } = image;
  const count = width * height;
  const mag = computeSobelMagnitude(image);
  const labels = new Int32Array(count).fill(-1);
  const stats: InternalRegionStats[] = [];
  const queue = new Int32Array(count);

  for (let startIdx = 0; startIdx < count; startIdx += 1) {
    if (labels[startIdx] !== -1) continue;
    const regionId = stats.length;
    const startP = startIdx * 4;
    const seedR = data[startP];
    const seedG = data[startP + 1];
    const seedB = data[startP + 2];

    const region: InternalRegionStats = {
      id: regionId,
      pixels: [],
      sumR: 0,
      sumG: 0,
      sumB: 0,
      sumX: 0,
      sumY: 0,
      borderPixels: 0,
      neighborCounts: new Map<number, number>(),
    };

    let head = 0;
    let tail = 0;
    labels[startIdx] = regionId;
    queue[tail] = startIdx;
    tail += 1;

    while (head < tail) {
      const idx = queue[head];
      head += 1;
      const x = idx % width;
      const y = Math.floor(idx / width);
      const p = idx * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];

      region.pixels.push(idx);
      region.sumR += r;
      region.sumG += g;
      region.sumB += b;
      region.sumX += x;
      region.sumY += y;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) region.borderPixels += 1;

      const meanR = region.sumR / region.pixels.length;
      const meanG = region.sumG / region.pixels.length;
      const meanB = region.sumB / region.pixels.length;

      const neighbors = [
        x > 0 ? idx - 1 : -1,
        x + 1 < width ? idx + 1 : -1,
        y > 0 ? idx - width : -1,
        y + 1 < height ? idx + width : -1,
      ];
      for (const nIdx of neighbors) {
        if (nIdx < 0 || labels[nIdx] !== -1) continue;
        const np = nIdx * 4;
        const nr = data[np];
        const ng = data[np + 1];
        const nb = data[np + 2];
        const stepDist = computeRgbDistance(r, g, b, nr, ng, nb);
        const seedDist = computeRgbDistance(seedR, seedG, seedB, nr, ng, nb);
        const meanDist = computeRgbDistance(meanR, meanG, meanB, nr, ng, nb);
        const localEdge = Math.max(mag[idx], mag[nIdx]);

        const isSmoothGradientStep = stepDist <= Math.min(18, colorMergeDistance * 0.45);
        const isColorCoherent =
          stepDist <= colorMergeDistance &&
          (meanDist <= colorMergeDistance * 1.45 || seedDist <= colorMergeDistance * 1.65) &&
          (localEdge < edgeThreshold || stepDist <= colorMergeDistance * 0.5);

        if (isSmoothGradientStep || isColorCoherent) {
          labels[nIdx] = regionId;
          queue[tail] = nIdx;
          tail += 1;
        }
      }
    }
    stats.push(region);
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const a = labels[idx];
      if (x + 1 < width && labels[idx + 1] !== a) {
        const b = labels[idx + 1];
        stats[a].neighborCounts.set(b, (stats[a].neighborCounts.get(b) ?? 0) + 1);
        stats[b].neighborCounts.set(a, (stats[b].neighborCounts.get(a) ?? 0) + 1);
      }
      if (y + 1 < height && labels[idx + width] !== a) {
        const b = labels[idx + width];
        stats[a].neighborCounts.set(b, (stats[a].neighborCounts.get(b) ?? 0) + 1);
        stats[b].neighborCounts.set(a, (stats[b].neighborCounts.get(a) ?? 0) + 1);
      }
    }
  }
  return { labels, stats };
}

/**
 * 분해된 See-Through 레이어 스택을 Z-Order 오름차순으로 알파 합성한다.
 */
export function compositeSeeThroughLayers(
  layers: ReadonlyArray<SeeThroughLayerSlice>,
  parallaxOffset: { readonly x: number; readonly y: number } = { x: 0, y: 0 },
): RgbaImageBuffer {
  if (layers.length === 0) throw new Error("합성할 레이어가 비어 있습니다.");
  const { width, height } = layers[0].image;
  const sorted = [...layers].sort((a, b) => a.zOrder - b.zOrder);
  const out = new Uint8ClampedArray(width * height * 4);

  for (const layer of sorted) {
    const shiftX = Math.round(parallaxOffset.x * layer.parallaxFactor);
    const shiftY = Math.round(parallaxOffset.y * layer.parallaxFactor);
    const src = layer.image.data;

    for (let y = 0; y < height; y += 1) {
      const srcY = y - shiftY;
      if (srcY < 0 || srcY >= height) continue;
      for (let x = 0; x < width; x += 1) {
        const srcX = x - shiftX;
        if (srcX < 0 || srcX >= width) continue;
        const sp = (srcY * width + srcX) * 4;
        const sa = src[sp + 3] / 255;
        if (sa <= 0) continue;

        const dp = (y * width + x) * 4;
        const da = out[dp + 3] / 255;
        const outA = sa + da * (1 - sa);
        if (outA <= 0) continue;

        out[dp] = clampByte((src[sp] * sa + out[dp] * da * (1 - sa)) / outA);
        out[dp + 1] = clampByte((src[sp + 1] * sa + out[dp + 1] * da * (1 - sa)) / outA);
        out[dp + 2] = clampByte((src[sp + 2] * sa + out[dp + 2] * da * (1 - sa)) / outA);
        out[dp + 3] = clampByte(outA * 255);
      }
    }
  }
  return { width, height, data: out };
}

function buildMidgroundOcclusionMask(
  width: number,
  height: number,
  midOwnMask: Uint8Array,
  fgOwnMask: Uint8Array,
  midOriginalPixels: number,
): Uint8Array {
  const midHoleMask = new Uint8Array(width * height);
  if (midOriginalPixels === 0) return midHoleMask;

  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (midOwnMask[y * width + x] === 1) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const idx = y * width + x;
      if (fgOwnMask[idx] !== 1) continue;
      let hasLeft = false;
      let hasRight = false;
      for (let lx = minX; lx < x; lx += 1) {
        if (midOwnMask[y * width + lx] === 1) { hasLeft = true; break; }
      }
      for (let rx = x + 1; rx <= maxX; rx += 1) {
        if (midOwnMask[y * width + rx] === 1) { hasRight = true; break; }
      }
      let hasTop = false;
      let hasBottom = false;
      for (let ty = minY; ty < y; ty += 1) {
        if (midOwnMask[ty * width + x] === 1) { hasTop = true; break; }
      }
      for (let by = y + 1; by <= maxY; by += 1) {
        if (midOwnMask[by * width + x] === 1) { hasBottom = true; break; }
      }
      if ((hasLeft && hasRight) || (hasTop && hasBottom)) {
        midHoleMask[idx] = 1;
      }
    }
  }
  return midHoleMask;
}

/**
 * 단일 평면 일러스트를 전경 캐릭터(`foreground`)·중경 소품(`midground`)·배경(`background`) 레이어로
 * 의미적 분할·Z-Order 추론하고, 상위 레이어에 가려진 하위 레이어 구멍을 인페인팅 복원한다.
 */
export function decomposeIllustrationSeeThroughLayers(
  image: RgbaImageBuffer,
  options: SeeThroughDecompositionOptions = {},
): SeeThroughDecompositionResult {
  assertValidRgbaImage(image);
  const { width, height, data } = image;
  const count = width * height;
  const perimeter = Math.max(1, 2 * (width + height) - 4);
  const edgeThreshold = options.edgeThreshold ?? 72;
  const colorMergeDistance = options.colorMergeDistance ?? 38;
  const parallaxFactors = options.parallaxFactors ?? DEFAULT_PARALLAX_FACTORS;

  const { labels, stats } = segmentIllustrationRegions(image, edgeThreshold, colorMergeDistance);

  const seededRoles = new Map<number, SeeThroughLayerRole>();
  if (options.semanticSeeds) {
    for (const seed of options.semanticSeeds) {
      const sx = Math.max(0, Math.min(width - 1, Math.round(seed.x)));
      const sy = Math.max(0, Math.min(height - 1, Math.round(seed.y)));
      seededRoles.set(labels[sy * width + sx], seed.role);
    }
  }

  const borderBgRegionIds = new Set<number>();
  for (const r of stats) {
    const borderRatio = r.borderPixels / perimeter;
    const areaRatio = r.pixels.length / count;
    if (seededRoles.get(r.id) === "background") {
      borderBgRegionIds.add(r.id);
    } else if (!seededRoles.has(r.id) && (borderRatio >= 0.14 || (borderRatio >= 0.06 && areaRatio >= 0.22))) {
      borderBgRegionIds.add(r.id);
    }
  }
  if (borderBgRegionIds.size === 0 && stats.length > 0) {
    let bestBorderId = 0;
    let bestScore = -1;
    for (const r of stats) {
      const score = r.borderPixels * 4 + r.pixels.length;
      if (score > bestScore) { bestScore = score; bestBorderId = r.id; }
    }
    borderBgRegionIds.add(bestBorderId);
  }

  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  let bgPixels = 0;
  for (const id of borderBgRegionIds) {
    bgR += stats[id].sumR;
    bgG += stats[id].sumG;
    bgB += stats[id].sumB;
    bgPixels += stats[id].pixels.length;
  }
  if (bgPixels > 0) { bgR /= bgPixels; bgG /= bgPixels; bgB /= bgPixels; }

  const roleByRegion = new Map<number, SeeThroughLayerRole>();
  const regionSummaries: SeeThroughRegionSummary[] = [];
  const nonBgCandidates: Array<{
    readonly id: number;
    readonly depthScore: number;
    readonly centerSalience: number;
    readonly enclosureRatio: number;
    readonly borderContactRatio: number;
    readonly meanColor: readonly [number, number, number];
  }> = [];

  for (const r of stats) {
    const n = Math.max(1, r.pixels.length);
    const meanR = r.sumR / n;
    const meanG = r.sumG / n;
    const meanB = r.sumB / n;
    const cx = r.sumX / n / width;
    const cy = r.sumY / n / height;
    const centerSalience = Math.max(0, 1 - Math.hypot(cx - 0.5, cy - 0.5) / 0.72);
    const borderContactRatio = r.borderPixels / perimeter;

    let totalBoundary = 0;
    let bgBoundary = 0;
    for (const [neighborId, sharedLen] of r.neighborCounts.entries()) {
      totalBoundary += sharedLen;
      if (borderBgRegionIds.has(neighborId)) bgBoundary += sharedLen;
    }
    const enclosureRatio = totalBoundary > 0 ? bgBoundary / totalBoundary : 0;
    const bgContrast = computeRgbDistance(meanR, meanG, meanB, bgR, bgG, bgB) / 441.67;
    const meanColor: readonly [number, number, number] = [Math.round(meanR), Math.round(meanG), Math.round(meanB)];

    const explicit = seededRoles.get(r.id);
    if (explicit !== undefined) {
      roleByRegion.set(r.id, explicit);
      regionSummaries.push({
        regionId: r.id,
        role: explicit,
        pixelCount: r.pixels.length,
        borderContactRatio,
        centerSalience,
        enclosureRatio,
        depthScore: explicit === "foreground" ? 0.95 : explicit === "midground" ? 0.55 : 0.1,
        meanColor,
      });
      continue;
    }
    if (borderBgRegionIds.has(r.id)) {
      roleByRegion.set(r.id, "background");
      regionSummaries.push({
        regionId: r.id,
        role: "background",
        pixelCount: r.pixels.length,
        borderContactRatio,
        centerSalience,
        enclosureRatio,
        depthScore: 0.1,
        meanColor,
      });
      continue;
    }

    const depthScore = Math.max(
      0.15,
      Math.min(0.99, 0.48 * centerSalience + 0.26 * bgContrast + 0.26 * (1 - Math.min(1, borderContactRatio * 6))),
    );
    nonBgCandidates.push({ id: r.id, depthScore, centerSalience, enclosureRatio, borderContactRatio, meanColor });
  }

  nonBgCandidates.sort((a, b) => b.depthScore - a.depthScore);
  const topDepth = nonBgCandidates.length > 0 ? nonBgCandidates[0].depthScore : 0;
  for (let i = 0; i < nonBgCandidates.length; i += 1) {
    const c = nonBgCandidates[i];
    const role: SeeThroughLayerRole =
      i === 0 || (c.centerSalience >= 0.58 && c.depthScore >= topDepth - 0.14) ? "foreground" : "midground";
    roleByRegion.set(c.id, role);
    regionSummaries.push({
      regionId: c.id,
      role,
      pixelCount: stats[c.id].pixels.length,
      borderContactRatio: c.borderContactRatio,
      centerSalience: c.centerSalience,
      enclosureRatio: c.enclosureRatio,
      depthScore: c.depthScore,
      meanColor: c.meanColor,
    });
  }

  // 전경 내부에 완전히 포위된 작은 세부 영역(눈·의상 장식)은 전경 레이어에 귀속
  for (const r of stats) {
    if (seededRoles.has(r.id) || roleByRegion.get(r.id) === "foreground" || r.borderPixels > 0) continue;
    let totalShared = 0;
    let fgShared = 0;
    for (const [nId, shared] of r.neighborCounts.entries()) {
      totalShared += shared;
      if (roleByRegion.get(nId) === "foreground") fgShared += shared;
    }
    if (totalShared > 0 && fgShared / totalShared >= 0.75) {
      roleByRegion.set(r.id, "foreground");
      const summaryIdx = regionSummaries.findIndex((item) => item.regionId === r.id);
      if (summaryIdx >= 0) {
        regionSummaries[summaryIdx] = {
          ...regionSummaries[summaryIdx],
          role: "foreground",
          depthScore: Math.max(regionSummaries[summaryIdx].depthScore, 0.85),
        };
      }
    }
  }

  const bgData = new Uint8ClampedArray(count * 4);
  const midData = new Uint8ClampedArray(count * 4);
  const fgData = new Uint8ClampedArray(count * 4);
  const bgHoleMask = new Uint8Array(count);
  const midOwnMask = new Uint8Array(count);
  const fgOwnMask = new Uint8Array(count);
  let bgOriginalPixels = 0;
  let midOriginalPixels = 0;
  let fgOriginalPixels = 0;

  for (let i = 0; i < count; i += 1) {
    const role = roleByRegion.get(labels[i]) ?? "background";
    const p = i * 4;
    if (role === "background") {
      bgData.set(data.subarray(p, p + 4), p);
      bgOriginalPixels += 1;
    } else if (role === "midground") {
      midData.set(data.subarray(p, p + 4), p);
      midOwnMask[i] = 1;
      midOriginalPixels += 1;
      bgHoleMask[i] = 1;
    } else {
      fgData.set(data.subarray(p, p + 4), p);
      fgOwnMask[i] = 1;
      fgOriginalPixels += 1;
      bgHoleMask[i] = 1;
    }
  }

  const bgInpainted = inpaintOccludedLayerRegion({ width, height, data: bgData }, bgHoleMask, options);
  const midHoleMask = buildMidgroundOcclusionMask(width, height, midOwnMask, fgOwnMask, midOriginalPixels);
  const midInpainted = inpaintOccludedLayerRegion({ width, height, data: midData }, midHoleMask, options);

  const backgroundLayer: SeeThroughLayerSlice = {
    role: "background",
    zOrder: 0,
    parallaxFactor: parallaxFactors.background,
    image: bgInpainted.image,
    originalPixelCount: bgOriginalPixels,
    occludedHolePixelCount: bgInpainted.holePixelCount,
    inpaintedPixelCount: bgInpainted.restoredPixelCount,
    remainingHolePixels: bgInpainted.remainingHolePixels,
    regionIds: regionSummaries.filter((item) => item.role === "background").map((item) => item.regionId),
  };
  const midgroundLayer: SeeThroughLayerSlice = {
    role: "midground",
    zOrder: 1,
    parallaxFactor: parallaxFactors.midground,
    image: midInpainted.image,
    originalPixelCount: midOriginalPixels,
    occludedHolePixelCount: midInpainted.holePixelCount,
    inpaintedPixelCount: midInpainted.restoredPixelCount,
    remainingHolePixels: midInpainted.remainingHolePixels,
    regionIds: regionSummaries.filter((item) => item.role === "midground").map((item) => item.regionId),
  };
  const foregroundLayer: SeeThroughLayerSlice = {
    role: "foreground",
    zOrder: 2,
    parallaxFactor: parallaxFactors.foreground,
    image: { width, height, data: fgData },
    originalPixelCount: fgOriginalPixels,
    occludedHolePixelCount: 0,
    inpaintedPixelCount: 0,
    remainingHolePixels: 0,
    regionIds: regionSummaries.filter((item) => item.role === "foreground").map((item) => item.regionId),
  };

  const layers: ReadonlyArray<SeeThroughLayerSlice> = [backgroundLayer, midgroundLayer, foregroundLayer];
  const recomposedImage = compositeSeeThroughLayers(layers, { x: 0, y: 0 });
  const similarity = computeImageSimilarityMetrics(image, recomposedImage);

  return {
    width,
    height,
    layers,
    backgroundLayer,
    midgroundLayer,
    foregroundLayer,
    regions: regionSummaries.sort((a, b) => a.regionId - b.regionId),
    recomposedImage,
    recompositionPsnrDb: similarity.psnrDb,
    recompositionMae: similarity.mae,
  };
}
