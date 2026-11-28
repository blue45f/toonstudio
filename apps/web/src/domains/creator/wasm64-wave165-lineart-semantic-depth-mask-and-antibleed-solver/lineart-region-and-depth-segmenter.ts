/**
 * Wave 165: 4-연결 라인아트 영역 추출, 보로노이 경계 인접 그래프 및 시맨틱 깊이 레이어 할당기.
 *
 * - `buildGapSealedInkBarrier`: `gap-barrier-sealer`에서 재수출.
 * - `extractLineartRegions`: 결정론적 4-연결 영역 추출 및 선화 너머 인접 가중치 그래프 계산.
 * - `assignSemanticDepthMasks`: 시드 매핑, 닫힌 미시드 소영역 귀속, 배경 누수(`leakedRegionCount`) 감지.
 */

import {
  SEMANTIC_DEPTH_LAYER_INFO,
  createZeroClassCountRecord,
  getClassIdForLayer,
  getDepthRankForClass,
  type LineartRegionExtractionResult,
  type LineartRegionSummary,
  type LineartSegmentationOptions,
  type SemanticAssignmentSource,
  type SemanticDepthLayerClass,
  type SemanticDepthMaskAssignment,
  type SemanticLayerAssignmentEntry,
  type SemanticSeedHint,
} from "./semantic-mask-types";

export { buildGapSealedInkBarrier } from "./gap-barrier-sealer";

const DEFAULT_MIN_MICRO_REGION_AREA = 64;
const ADJACENCY_VORONOI_MAX_STEPS = 12;

const DIRS_4: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const rounded = Math.round(value);
  return rounded < min ? min : rounded > max ? max : rounded;
}

function isInBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

/**
 * 봉합된 배리어 마스크에서 4-연결 채색 영역을 추출하고,
 * 선화 경계 너머 이웃 관계를 멀티소스 보로노이 확장으로 계산한다.
 */
export function extractLineartRegions(
  barrierMask: Uint8Array,
  width: number,
  height: number,
): LineartRegionExtractionResult {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new RangeError(`유효하지 않은 래스터 크기입니다: ${String(width)}x${String(height)}`);
  }
  const totalPixels = width * height;
  if (barrierMask.length !== totalPixels) {
    throw new RangeError(
      `barrierMask 길이(${String(barrierMask.length)})가 width*height(${String(totalPixels)})와 다릅니다.`,
    );
  }

  const regionLabels = new Int32Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  const rawRegions: Array<{
    regionId: number;
    pixelCount: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    sumX: number;
    sumY: number;
    touchesTop: boolean;
    touchesBottom: boolean;
    touchesLeft: boolean;
    touchesRight: boolean;
  }> = [];

  let regionCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const startIdx = y * width + x;
      if (barrierMask[startIdx] !== 0 || regionLabels[startIdx] !== 0) {
        continue;
      }

      regionCount += 1;
      const rid = regionCount;
      let head = 0;
      let tail = 0;
      queue[tail] = startIdx;
      tail += 1;
      regionLabels[startIdx] = rid;

      let pixelCount = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let sumX = 0;
      let sumY = 0;
      let touchesTop = false;
      let touchesBottom = false;
      let touchesLeft = false;
      let touchesRight = false;

      while (head < tail) {
        const cur = queue[head];
        head += 1;
        const cx = cur % width;
        const cy = (cur - cx) / width;

        pixelCount += 1;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        sumX += cx;
        sumY += cy;
        if (cy === 0) touchesTop = true;
        if (cy === height - 1) touchesBottom = true;
        if (cx === 0) touchesLeft = true;
        if (cx === width - 1) touchesRight = true;

        for (let d = 0; d < DIRS_4.length; d += 1) {
          const nx = cx + DIRS_4[d][0];
          const ny = cy + DIRS_4[d][1];
          if (!isInBounds(nx, ny, width, height)) {
            continue;
          }
          const nIdx = ny * width + nx;
          if (barrierMask[nIdx] === 0 && regionLabels[nIdx] === 0) {
            regionLabels[nIdx] = rid;
            queue[tail] = nIdx;
            tail += 1;
          }
        }
      }

      rawRegions.push({
        regionId: rid,
        pixelCount,
        minX,
        minY,
        maxX,
        maxY,
        sumX,
        sumY,
        touchesTop,
        touchesBottom,
        touchesLeft,
        touchesRight,
      });
    }
  }

  // 선화 경계 픽셀 위로 멀티소스 보로노이 확장을 수행해 영역 간 경계 인접 가중치를 산출한다.
  const owner = new Int32Array(regionLabels);
  const dist = new Int32Array(totalPixels);
  dist.fill(-1);
  let vHead = 0;
  let vTail = 0;

  for (let i = 0; i < totalPixels; i += 1) {
    if (owner[i] > 0) {
      dist[i] = 0;
      queue[vTail] = i;
      vTail += 1;
    }
  }

  const weightMaps: Record<number, Record<number, number>> = {};
  for (let r = 1; r <= regionCount; r += 1) {
    weightMaps[r] = {};
  }

  const recordEdge = (a: number, b: number): void => {
    if (a === b || a <= 0 || b <= 0) return;
    weightMaps[a][b] = (weightMaps[a][b] ?? 0) + 1;
    weightMaps[b][a] = (weightMaps[b][a] ?? 0) + 1;
  };

  while (vHead < vTail) {
    const cur = queue[vHead];
    vHead += 1;
    const curDist = dist[cur];
    const curOwner = owner[cur];
    const cx = cur % width;
    const cy = (cur - cx) / width;

    for (let d = 0; d < DIRS_4.length; d += 1) {
      const nx = cx + DIRS_4[d][0];
      const ny = cy + DIRS_4[d][1];
      if (!isInBounds(nx, ny, width, height)) continue;
      const nIdx = ny * width + nx;
      const nOwner = owner[nIdx];
      if (nOwner === 0) {
        if (curDist < ADJACENCY_VORONOI_MAX_STEPS) {
          owner[nIdx] = curOwner;
          dist[nIdx] = curDist + 1;
          queue[vTail] = nIdx;
          vTail += 1;
        }
      } else if (nOwner !== curOwner) {
        recordEdge(curOwner, nOwner);
      }
    }
  }

  const adjacency: Record<number, readonly number[]> = {};
  const regions: LineartRegionSummary[] = [];

  for (let i = 0; i < rawRegions.length; i += 1) {
    const reg = rawRegions[i];
    const neighbors = Object.keys(weightMaps[reg.regionId])
      .map((k) => Number(k))
      .sort((a, b) => a - b);
    adjacency[reg.regionId] = neighbors;

    const borderSidesTouched =
      (reg.touchesTop ? 1 : 0) +
      (reg.touchesBottom ? 1 : 0) +
      (reg.touchesLeft ? 1 : 0) +
      (reg.touchesRight ? 1 : 0);
    const wrapsCanvasExterior =
      (reg.touchesTop && reg.touchesBottom) ||
      (reg.touchesLeft && reg.touchesRight) ||
      borderSidesTouched >= 3;

    regions.push({
      regionId: reg.regionId,
      pixelCount: reg.pixelCount,
      bbox: { minX: reg.minX, minY: reg.minY, maxX: reg.maxX, maxY: reg.maxY },
      centroid: {
        x: reg.pixelCount > 0 ? reg.sumX / reg.pixelCount : reg.minX,
        y: reg.pixelCount > 0 ? reg.sumY / reg.pixelCount : reg.minY,
      },
      touchesBorder: borderSidesTouched > 0,
      borderSidesTouched,
      wrapsCanvasExterior,
      neighborRegionIds: neighbors,
    });
  }

  return {
    width,
    height,
    regionLabels,
    regionCount,
    regions,
    adjacency,
    adjacencyWeights: weightMaps,
  };
}

function locateSeedRegionId(
  extraction: LineartRegionExtractionResult,
  seed: SemanticSeedHint,
): number {
  const { width, height, regionLabels } = extraction;
  const sx = clampInt(seed.x, 0, width - 1);
  const sy = clampInt(seed.y, 0, height - 1);
  const direct = regionLabels[sy * width + sx];
  if (direct > 0) return direct;

  for (let radius = 1; radius <= 2; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const nx = sx + dx;
        const ny = sy + dy;
        if (!isInBounds(nx, ny, width, height)) continue;
        const candidate = regionLabels[ny * width + nx];
        if (candidate > 0) return candidate;
      }
    }
  }
  return 0;
}

/**
 * 작가 시드 힌트를 추출된 영역에 매핑하고, 닫힌 미시드 소영역은 포위·다수 인접 규칙으로 귀속한다.
 * 열린 펜선 틈으로 캐릭터 영역이 배경과 병합되었거나 캔버스 외곽을 감싸면 누수(`leakedRegionCount`)로 보고한다.
 */
export function assignSemanticDepthMasks(
  extraction: LineartRegionExtractionResult,
  seeds: readonly SemanticSeedHint[],
  options: LineartSegmentationOptions = {},
): SemanticDepthMaskAssignment {
  const { width, height, regionLabels, regions, adjacencyWeights } = extraction;
  const unseededFallbackClass: SemanticDepthLayerClass =
    options.unseededFallbackClass ?? "background-sky";
  const minMicroRegionArea = clampInt(
    options.minMicroRegionArea ?? DEFAULT_MIN_MICRO_REGION_AREA,
    1,
    width * height,
  );

  // 1단계: 시드를 영역 ID에 집계
  const regionSeedVotes = new Map<
    number,
    { readonly classes: Map<SemanticDepthLayerClass, number>; readonly labelsKo: string[] }
  >();
  for (let i = 0; i < seeds.length; i += 1) {
    const seed = seeds[i];
    const rid = locateSeedRegionId(extraction, seed);
    if (rid <= 0) continue;
    let entry = regionSeedVotes.get(rid);
    if (!entry) {
      entry = { classes: new Map<SemanticDepthLayerClass, number>(), labelsKo: [] };
      regionSeedVotes.set(rid, entry);
    }
    entry.classes.set(seed.layerClass, (entry.classes.get(seed.layerClass) ?? 0) + 1);
    entry.labelsKo.push(seed.labelKo);
  }

  const assignedClass = new Map<number, SemanticDepthLayerClass>();
  const assignedSource = new Map<number, SemanticAssignmentSource>();
  const regionCollisionFlag = new Map<number, boolean>();
  const regionLeakFlag = new Map<number, boolean>();
  let seedCollisionCount = 0;
  let leakedRegionCount = 0;

  for (let i = 0; i < regions.length; i += 1) {
    const reg = regions[i];
    const vote = regionSeedVotes.get(reg.regionId);
    if (!vote) continue;

    const distinctClasses = Array.from(vote.classes.keys());
    const hasSeedCollision = distinctClasses.length > 1;
    if (hasSeedCollision) {
      seedCollisionCount += distinctClasses.length - 1;
    }

    distinctClasses.sort((a, b) => {
      if (reg.wrapsCanvasExterior) {
        if (a === "background-sky") return -1;
        if (b === "background-sky") return 1;
      }
      const countDiff = (vote.classes.get(b) ?? 0) - (vote.classes.get(a) ?? 0);
      if (countDiff !== 0) return countDiff;
      return getDepthRankForClass(b) - getDepthRankForClass(a);
    });

    const winner = distinctClasses[0];
    const hasCharacterOrForeground = distinctClasses.some(
      (cls) => cls !== "background-sky" && cls !== "midground-env",
    );
    const leakedIntoBorder =
      hasSeedCollision || (hasCharacterOrForeground && reg.wrapsCanvasExterior);
    if (leakedIntoBorder) {
      leakedRegionCount += 1;
    }

    assignedClass.set(reg.regionId, winner);
    assignedSource.set(reg.regionId, "seed");
    regionCollisionFlag.set(reg.regionId, hasSeedCollision);
    regionLeakFlag.set(reg.regionId, leakedIntoBorder);
  }

  // 2단계: 캔버스 경계에 닿은 미시드 외곽 영역은 기본 배경 클래스로 확정
  for (let i = 0; i < regions.length; i += 1) {
    const reg = regions[i];
    if (!assignedClass.has(reg.regionId) && reg.touchesBorder) {
      assignedClass.set(reg.regionId, unseededFallbackClass);
      assignedSource.set(reg.regionId, "border-fallback");
    }
  }

  // 3단계: 닫힌 미시드 소영역을 주변 다수 경계 가중치로 반복 귀속
  let resolvedMicroRegionCount = 0;
  let progress = true;
  let maxPasses = regions.length + 1;
  while (progress && maxPasses > 0) {
    progress = false;
    maxPasses -= 1;

    for (let i = 0; i < regions.length; i += 1) {
      const reg = regions[i];
      if (assignedClass.has(reg.regionId)) continue;

      const weights = adjacencyWeights[reg.regionId] ?? {};
      const classWeights = new Map<SemanticDepthLayerClass, number>();
      const neighborIds = Object.keys(weights).map((k) => Number(k));
      for (let j = 0; j < neighborIds.length; j += 1) {
        const nid = neighborIds[j];
        const nClass = assignedClass.get(nid);
        const w = weights[nid] ?? 0;
        if (nClass && w > 0) {
          classWeights.set(nClass, (classWeights.get(nClass) ?? 0) + w);
        }
      }
      if (classWeights.size === 0) continue;

      const candidates = Array.from(classWeights.keys());
      const nonBg = candidates.filter((cls) => cls !== "background-sky");
      const pool = reg.pixelCount <= minMicroRegionArea && nonBg.length > 0 ? nonBg : candidates;

      pool.sort((a, b) => {
        const wDiff = (classWeights.get(b) ?? 0) - (classWeights.get(a) ?? 0);
        return wDiff !== 0 ? wDiff : getDepthRankForClass(b) - getDepthRankForClass(a);
      });

      assignedClass.set(reg.regionId, pool[0]);
      assignedSource.set(reg.regionId, "enclosure-neighbor");
      resolvedMicroRegionCount += 1;
      progress = true;
    }
  }

  // 4단계: 고립 영역 폴백 및 최종 코어 레이어 맵 작성
  let orphanedRegionCount = 0;
  for (let i = 0; i < regions.length; i += 1) {
    const reg = regions[i];
    if (!assignedClass.has(reg.regionId)) {
      assignedClass.set(reg.regionId, unseededFallbackClass);
      assignedSource.set(reg.regionId, "border-fallback");
      orphanedRegionCount += 1;
    }
  }

  const coreLayerMap = new Uint8Array(width * height);
  const perClassPixelCounts = createZeroClassCountRecord();
  for (let i = 0; i < regionLabels.length; i += 1) {
    const rid = regionLabels[i];
    if (rid <= 0) continue;
    const cls = assignedClass.get(rid);
    if (!cls) continue;
    coreLayerMap[i] = getClassIdForLayer(cls);
    perClassPixelCounts[cls] += 1;
  }

  const assignments: SemanticLayerAssignmentEntry[] = [];
  for (let i = 0; i < regions.length; i += 1) {
    const reg = regions[i];
    const cls = assignedClass.get(reg.regionId) ?? unseededFallbackClass;
    const info = SEMANTIC_DEPTH_LAYER_INFO[cls];
    const vote = regionSeedVotes.get(reg.regionId);
    assignments.push({
      regionId: reg.regionId,
      layerClass: cls,
      depthRank: info.depthRank,
      classId: info.classId,
      assignmentSource: assignedSource.get(reg.regionId) ?? "border-fallback",
      seedLabelsKo: vote ? [...vote.labelsKo] : [],
      pixelCount: reg.pixelCount,
      hasSeedCollision: regionCollisionFlag.get(reg.regionId) ?? false,
      leakedIntoBorder: regionLeakFlag.get(reg.regionId) ?? false,
    });
  }

  return {
    width,
    height,
    coreLayerMap,
    assignments,
    leakedRegionCount,
    seedCollisionCount,
    resolvedMicroRegionCount,
    orphanedRegionCount,
    perClassPixelCounts,
  };
}
