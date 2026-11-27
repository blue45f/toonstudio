/**
 * Wave 43: WebGPU 프론트 오버레이 부분 갱신용 타일 정렬 Scissor Rect 병합기 및 인스턴스 쿼드 패커.
 *
 * - React 컴포넌트 트리를 다시 렌더링하지 않고, 현재 그리는 획의 변경 영역만 WebGPU 오버레이 텍스처에
 *   부분 갱신(`setScissorRect` + 인스턴스 드로우)하기 위한 실행 계획을 산출한다.
 * - 세그먼트 양 끝점의 브러시 반경 + 안티앨리어싱 여백(`2px`)을 감싸는 경계 상자를 계산하고,
 *   타일 격자에 정렬한 뒤 뷰포트 경계 내부로 안전하게 클리핑한다.
 * - 인접하거나 겹치는 더티 사각형은 병합 후 외접 사각형 면적 팽창률이 `<= 1.25` 이하일 때만 병합해
 *   대각선·기역자 획에서 불필요한 빈 타일 픽셀 셰이더 낭비를 막는다.
 */

/** 브러시 외곽 안티앨리어싱 커널을 보호하기 위한 기본 여백(`2px`). */
export const DEFAULT_AA_MARGIN_PX = 2 as const;
/** WebGPU 타일 기반 렌더 패스에 맞춘 기본 Scissor 정렬 타일 크기(`32px`). */
export const DEFAULT_SCISSOR_TILE_SIZE_PX = 32 as const;
/** 인접 더티 사각형 병합 시 허용하는 최대 면적 팽창률(`1.25`). */
export const MAX_SCISSOR_MERGE_EXPANSION_RATIO = 1.25 as const;
/** 세그먼트 인스턴스 1개당 `Float32Array` 패킹 슬롯 수(`12 floats = 48 bytes`, `3 x vec4<f32>` 정렬). */
export const FLOATS_PER_PACKED_INSTANCE_QUAD = 12 as const;

export interface WetInkQuadSegmentInput {
  readonly x0: number;
  readonly y0: number;
  readonly radius0Px: number;
  readonly pressure0?: number;
  readonly x1: number;
  readonly y1: number;
  readonly radius1Px: number;
  readonly pressure1?: number;
  readonly opacity?: number;
  readonly isPredicted?: boolean;
}

export interface WebGpuViewportSize {
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface FloatBounds2D {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

export interface ScissorRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly right: number;
  readonly bottom: number;
  readonly areaPx2: number;
}

export interface InstancedScissorDrawBatch {
  readonly scissorIndex: number;
  readonly scissorRect: ScissorRect;
  readonly firstInstance: number;
  readonly instanceCount: number;
}

export interface DirtyScissorMergeOptions {
  readonly maxAreaExpansionRatio?: number;
  readonly maxAdjacencyGapPx?: number;
}

export interface DirtyScissorQuadPlanOptions {
  readonly viewport: WebGpuViewportSize;
  readonly aaMarginPx?: number;
  readonly tileSizePx?: number;
  readonly maxAreaExpansionRatio?: number;
  readonly maxAdjacencyGapPx?: number;
  readonly reusableInstanceBuffer?: Float32Array;
}

export interface DirtyScissorQuadPlan {
  readonly scissorRects: readonly ScissorRect[];
  readonly drawBatches: readonly InstancedScissorDrawBatch[];
  readonly packedInstances: Float32Array;
  readonly instanceCount: number;
  readonly floatsPerInstance: typeof FLOATS_PER_PACKED_INSTANCE_QUAD;
  readonly culledSegmentCount: number;
  readonly totalDirtyAreaPx2: number;
  readonly viewportCoverageRatio: number;
  readonly summaryKo: string;
}

interface MergeCluster {
  rect: ScissorRect;
  coveredAreaPx2: number;
}

function clampFinite(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function makeScissorRect(x: number, y: number, right: number, bottom: number): ScissorRect {
  const width = Math.max(0, right - x);
  const height = Math.max(0, bottom - y);
  return {
    x,
    y,
    width,
    height,
    right,
    bottom,
    areaPx2: width * height,
  };
}

function computeIntersectionArea(a: ScissorRect, b: ScissorRect): number {
  const overlapWidth = Math.min(a.right, b.right) - Math.max(a.x, b.x);
  const overlapHeight = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
  if (overlapWidth <= 0 || overlapHeight <= 0) return 0;
  return overlapWidth * overlapHeight;
}

function unionScissorRects(a: ScissorRect, b: ScissorRect): ScissorRect {
  return makeScissorRect(
    Math.min(a.x, b.x),
    Math.min(a.y, b.y),
    Math.max(a.right, b.right),
    Math.max(a.bottom, b.bottom),
  );
}

function areRectsAdjacentOrOverlapping(a: ScissorRect, b: ScissorRect, maxGapPx: number): boolean {
  const gapX = Math.max(b.x - a.right, a.x - b.right);
  const gapY = Math.max(b.y - a.bottom, a.y - b.bottom);
  return gapX <= maxGapPx && gapY <= maxGapPx;
}

function rectContains(outer: ScissorRect, inner: ScissorRect): boolean {
  return (
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    outer.right >= inner.right &&
    outer.bottom >= inner.bottom
  );
}

/**
 * 세그먼트 양 끝점의 브러시 반경 + 안티앨리어싱 여백(기본 `2px`)을 반영한 실수 경계 상자를 계산한다.
 */
export function computeSegmentAaBounds(
  segment: WetInkQuadSegmentInput,
  aaMarginPx: number = DEFAULT_AA_MARGIN_PX,
): FloatBounds2D {
  const margin = Math.max(0, Number.isFinite(aaMarginPx) ? aaMarginPx : DEFAULT_AA_MARGIN_PX);
  const pad0 = Math.max(0, segment.radius0Px) + margin;
  const pad1 = Math.max(0, segment.radius1Px) + margin;

  const minX = Math.min(segment.x0 - pad0, segment.x1 - pad1);
  const minY = Math.min(segment.y0 - pad0, segment.y1 - pad1);
  const maxX = Math.max(segment.x0 + pad0, segment.x1 + pad1);
  const maxY = Math.max(segment.y0 + pad0, segment.y1 + pad1);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

/**
 * 실수 경계 상자를 타일 크기에 맞춰 외측 스냅한 뒤 WebGPU 뷰포트 내부로 클리핑한다.
 * 뷰포트 바깥에 완전히 벗어난 경우 `null`을 반환해 크기 0인 잘못된 Scissor 호출을 막는다.
 */
export function snapAndClipScissorRect(
  bounds: FloatBounds2D,
  viewport: WebGpuViewportSize,
  tileSizePx: number = DEFAULT_SCISSOR_TILE_SIZE_PX,
): ScissorRect | null {
  const vpWidth = Math.max(0, Math.trunc(viewport.widthPx));
  const vpHeight = Math.max(0, Math.trunc(viewport.heightPx));
  if (vpWidth <= 0 || vpHeight <= 0) return null;
  if (
    !Number.isFinite(bounds.minX) ||
    !Number.isFinite(bounds.minY) ||
    !Number.isFinite(bounds.maxX) ||
    !Number.isFinite(bounds.maxY)
  ) {
    return null;
  }

  const tile = Math.max(1, Math.trunc(Number.isFinite(tileSizePx) ? tileSizePx : DEFAULT_SCISSOR_TILE_SIZE_PX));
  const snappedMinX = Math.floor(bounds.minX / tile) * tile;
  const snappedMinY = Math.floor(bounds.minY / tile) * tile;
  const snappedMaxX = Math.ceil(bounds.maxX / tile) * tile;
  const snappedMaxY = Math.ceil(bounds.maxY / tile) * tile;

  const x = clampFinite(snappedMinX, 0, vpWidth);
  const y = clampFinite(snappedMinY, 0, vpHeight);
  const right = clampFinite(snappedMaxX, 0, vpWidth);
  const bottom = clampFinite(snappedMaxY, 0, vpHeight);

  if (right <= x || bottom <= y) return null;
  return makeScissorRect(x, y, right, bottom);
}

/**
 * 두 사각형의 실제 합집합 픽셀 면적 대비 병합 외접 사각형 면적의 팽창률을 계산한다.
 */
export function computeRectMergeExpansionRatio(a: ScissorRect, b: ScissorRect): number {
  const unionRect = unionScissorRects(a, b);
  const coveredUnionArea = a.areaPx2 + b.areaPx2 - computeIntersectionArea(a, b);
  if (coveredUnionArea <= 0) return Number.POSITIVE_INFINITY;
  return unionRect.areaPx2 / coveredUnionArea;
}

/**
 * 인접·중첩 더티 사각형들을 면적 팽창률 상한(`<= 1.25`) 안에서만 병합한다.
 */
export function mergeDirtyScissorRects(
  rects: readonly ScissorRect[],
  options: DirtyScissorMergeOptions = {},
): readonly ScissorRect[] {
  const maxRatio = Math.max(1, options.maxAreaExpansionRatio ?? MAX_SCISSOR_MERGE_EXPANSION_RATIO);
  const maxGapPx = Math.max(0, Math.trunc(options.maxAdjacencyGapPx ?? 0));

  const clusters: MergeCluster[] = [];
  for (const rect of rects) {
    if (rect.width > 0 && rect.height > 0) {
      clusters.push({ rect, coveredAreaPx2: rect.areaPx2 });
    }
  }
  if (clusters.length <= 1) return clusters.map((c) => c.rect);

  let mergedAny = true;
  while (mergedAny && clusters.length > 1) {
    mergedAny = false;
    let bestI = -1;
    let bestJ = -1;
    let bestRatio = Number.POSITIVE_INFINITY;
    let bestUnion: ScissorRect | null = null;
    let bestCoveredArea = 0;

    for (let i = 0; i < clusters.length; i += 1) {
      const ci = clusters[i];
      if (ci === undefined) continue;
      for (let j = i + 1; j < clusters.length; j += 1) {
        const cj = clusters[j];
        if (cj === undefined) continue;
        if (!areRectsAdjacentOrOverlapping(ci.rect, cj.rect, maxGapPx)) continue;

        const unionRect = unionScissorRects(ci.rect, cj.rect);
        const intersection = computeIntersectionArea(ci.rect, cj.rect);
        const pairwiseUnionArea = ci.rect.areaPx2 + cj.rect.areaPx2 - intersection;
        if (pairwiseUnionArea <= 0) continue;

        const pairwiseRatio = unionRect.areaPx2 / pairwiseUnionArea;
        if (pairwiseRatio > maxRatio + 1e-9) continue;

        const combinedCovered = Math.min(
          unionRect.areaPx2,
          Math.max(ci.coveredAreaPx2, cj.coveredAreaPx2, ci.coveredAreaPx2 + cj.coveredAreaPx2 - intersection),
        );
        const cumulativeRatio = unionRect.areaPx2 / Math.max(1, combinedCovered);
        if (cumulativeRatio > maxRatio + 1e-9) continue;

        const effectiveScore = Math.max(pairwiseRatio, cumulativeRatio);
        if (effectiveScore < bestRatio) {
          bestRatio = effectiveScore;
          bestI = i;
          bestJ = j;
          bestUnion = unionRect;
          bestCoveredArea = combinedCovered;
        }
      }
    }

    if (bestI >= 0 && bestJ >= 0 && bestUnion !== null) {
      clusters[bestI] = { rect: bestUnion, coveredAreaPx2: bestCoveredArea };
      clusters.splice(bestJ, 1);
      mergedAny = true;
    }
  }

  clusters.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  return clusters.map((c) => c.rect);
}

/**
 * 획 세그먼트 배열로부터 타일 정렬·클리핑·병합된 Scissor 드로우 배치와
 * WebGPU 인스턴스 버퍼용 `Float32Array`(`12 floats/instance`)를 한 번에 생성한다.
 */
export function planDirtyScissorInstanceQuads(
  segments: readonly WetInkQuadSegmentInput[],
  options: DirtyScissorQuadPlanOptions,
): DirtyScissorQuadPlan {
  const aaMarginPx = Math.max(0, options.aaMarginPx ?? DEFAULT_AA_MARGIN_PX);
  const tileSizePx = Math.max(1, Math.trunc(options.tileSizePx ?? DEFAULT_SCISSOR_TILE_SIZE_PX));
  const vpWidth = Math.max(0, Math.trunc(options.viewport.widthPx));
  const vpHeight = Math.max(0, Math.trunc(options.viewport.heightPx));
  const viewportArea = vpWidth * vpHeight;

  const visibleEntries: { segment: WetInkQuadSegmentInput; initialRect: ScissorRect }[] = [];
  let culledSegmentCount = 0;

  for (const segment of segments) {
    const aaBounds = computeSegmentAaBounds(segment, aaMarginPx);
    const clippedRect = snapAndClipScissorRect(aaBounds, options.viewport, tileSizePx);
    if (clippedRect === null) {
      culledSegmentCount += 1;
      continue;
    }
    visibleEntries.push({ segment, initialRect: clippedRect });
  }

  if (visibleEntries.length === 0) {
    const emptyBuf =
      options.reusableInstanceBuffer !== undefined
        ? options.reusableInstanceBuffer.subarray(0, 0)
        : new Float32Array(0);
    return {
      scissorRects: [],
      drawBatches: [],
      packedInstances: emptyBuf,
      instanceCount: 0,
      floatsPerInstance: FLOATS_PER_PACKED_INSTANCE_QUAD,
      culledSegmentCount,
      totalDirtyAreaPx2: 0,
      viewportCoverageRatio: 0,
      summaryKo: "뷰포트 내 갱신할 획 세그먼트 없음",
    };
  }

  const mergedScissors = mergeDirtyScissorRects(
    visibleEntries.map((entry) => entry.initialRect),
    {
      maxAreaExpansionRatio: options.maxAreaExpansionRatio,
      maxAdjacencyGapPx: options.maxAdjacencyGapPx,
    },
  );

  const buckets: WetInkQuadSegmentInput[][] = mergedScissors.map(() => []);
  for (const entry of visibleEntries) {
    let targetIndex = 0;
    let smallestArea = Number.POSITIVE_INFINITY;
    for (let s = 0; s < mergedScissors.length; s += 1) {
      const candidate = mergedScissors[s];
      if (candidate !== undefined && rectContains(candidate, entry.initialRect) && candidate.areaPx2 < smallestArea) {
        smallestArea = candidate.areaPx2;
        targetIndex = s;
      }
    }
    const targetBucket = buckets[targetIndex];
    if (targetBucket !== undefined) {
      targetBucket.push(entry.segment);
    }
  }

  const instanceCount = visibleEntries.length;
  const requiredFloats = instanceCount * FLOATS_PER_PACKED_INSTANCE_QUAD;
  const targetArray =
    options.reusableInstanceBuffer !== undefined && options.reusableInstanceBuffer.length >= requiredFloats
      ? options.reusableInstanceBuffer.subarray(0, requiredFloats)
      : new Float32Array(requiredFloats);

  const drawBatches: InstancedScissorDrawBatch[] = [];
  let writeCursor = 0;

  for (let scissorIndex = 0; scissorIndex < mergedScissors.length; scissorIndex += 1) {
    const bucket = buckets[scissorIndex];
    const scissorRect = mergedScissors[scissorIndex];
    if (bucket === undefined || scissorRect === undefined || bucket.length === 0) continue;
    const firstInstance = writeCursor / FLOATS_PER_PACKED_INSTANCE_QUAD;

    for (const seg of bucket) {
      targetArray[writeCursor] = seg.x0;
      targetArray[writeCursor + 1] = seg.y0;
      targetArray[writeCursor + 2] = seg.x1;
      targetArray[writeCursor + 3] = seg.y1;
      targetArray[writeCursor + 4] = Math.max(0, seg.radius0Px);
      targetArray[writeCursor + 5] = Math.max(0, seg.radius1Px);
      targetArray[writeCursor + 6] = clampFinite(seg.pressure0 ?? 1, 0, 1);
      targetArray[writeCursor + 7] = clampFinite(seg.pressure1 ?? 1, 0, 1);
      targetArray[writeCursor + 8] = aaMarginPx;
      targetArray[writeCursor + 9] = clampFinite(seg.opacity ?? 1, 0, 1);
      targetArray[writeCursor + 10] = seg.isPredicted === true ? 1 : 0;
      targetArray[writeCursor + 11] = scissorIndex;
      writeCursor += FLOATS_PER_PACKED_INSTANCE_QUAD;
    }

    drawBatches.push({
      scissorIndex,
      scissorRect,
      firstInstance,
      instanceCount: bucket.length,
    });
  }

  let totalDirtyAreaPx2 = 0;
  for (let i = 0; i < mergedScissors.length; i += 1) {
    const si = mergedScissors[i];
    if (si === undefined) continue;
    totalDirtyAreaPx2 += si.areaPx2;
    for (let j = 0; j < i; j += 1) {
      const sj = mergedScissors[j];
      if (sj !== undefined) {
        totalDirtyAreaPx2 -= computeIntersectionArea(si, sj);
      }
    }
  }
  totalDirtyAreaPx2 = Math.max(0, totalDirtyAreaPx2);
  const viewportCoverageRatio = viewportArea > 0 ? clampFinite(totalDirtyAreaPx2 / viewportArea, 0, 1) : 0;

  return {
    scissorRects: mergedScissors,
    drawBatches,
    packedInstances: targetArray,
    instanceCount,
    floatsPerInstance: FLOATS_PER_PACKED_INSTANCE_QUAD,
    culledSegmentCount,
    totalDirtyAreaPx2,
    viewportCoverageRatio,
    summaryKo: `더티 Scissor ${mergedScissors.length}개 병합 완료 (인스턴스 ${instanceCount}개, 화면 갱신 비율 ${(viewportCoverageRatio * 100).toFixed(1)}%)`,
  };
}
