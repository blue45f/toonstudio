/**
 * Wave 119 — 안티-할로(Anti-Halo) 선화 보로노이 언더블리드 트래핑 & WebGPU WGSL 셰이더.
 *
 * - `synthesizeAntiHaloUnderbleedFlats`: 여러 시드 색상 구역(피부·머리카락·옷깃 등)이 얇은
 *   안티앨리어싱 먹선으로 맞닿을 때, 반투명 먹선 영역(`haloMinAlpha < inkAlpha < inkSolidThreshold`)과
 *   중심선 절반 깊이까지 최단 유클리드 보로노이 거리 기반으로 균등 트래핑(Underbleed)한다.
 *   이때 (1) 잔여 흰 할로 0px(제거율 100%)과 (2) 이웃 구역 순수 내부 교차 침범 0px을 동시에 보증한다.
 * - `buildGapClosingFlatFillWgsl` / `validateGapClosingFlatFillWgsl` / `packGapClosingFlatFillUniforms`:
 *   16바이트 정렬 64B 유니폼 구조체, 갭 클로징 컴퓨트 WGSL, 언더블리드 합성 프래그먼트 WGSL 및
 *   구조·바인딩·정렬·금지 GLSL 토큰 정적 검증기를 제공한다.
 */

import {
  DEFAULT_GAP_WIDTH_PX,
  DEFAULT_INK_THRESHOLD,
  clampUnit,
  closeLineartGapsDeterministically,
  runGapClosingFloodFill,
  type FloodFillConnectivity,
  type GapClosingBarrierResult,
  type LineartAlphaField,
  type PixelBoundingBox,
} from "./gap-closing-flood-fill-solver";

export interface OklchColor {
  readonly l: number; readonly c: number; readonly h: number;
}

export interface UnderbleedRegionSeed {
  readonly regionId: string; readonly labelKo: string;
  readonly seedX: number; readonly seedY: number;
  readonly oklch: OklchColor;
}

export interface AntiHaloUnderbleedOptions {
  readonly maxGapWidthPx?: number;
  readonly inkThreshold?: number;
  /** 완전 불투명 먹선으로 판정하는 상한(`inkThreshold < inkSolidThreshold <= 1`, 기본 `0.98`). */
  readonly inkSolidThreshold?: number;
  /** 반투명 안티앨리어싱 프린지 하한(`0 < haloMinAlpha < inkThreshold`, 기본 `0.02`). */
  readonly haloMinAlpha?: number;
  /** 보로노이 언더블리드 최대 확장 반경(px, `1..8`, 기본 `4`). */
  readonly maxUnderbleedRadiusPx?: number;
  readonly connectivity?: FloodFillConnectivity;
}

export interface UnderbleedRegionSummary {
  readonly regionId: string; readonly labelKo: string; readonly regionIndex: number;
  readonly oklch: OklchColor; readonly ok: boolean; readonly status: string;
  readonly corePixelCount: number; readonly underbleedAddedPixelCount: number;
  readonly totalFilledPixelCount: number; readonly leakedToBorder: boolean;
  readonly boundingBox: PixelBoundingBox | null;
}

export interface AntiHaloUnderbleedReport {
  readonly ok: boolean; readonly reasonKo: string;
  readonly width: number; readonly height: number;
  readonly maxGapWidthPx: number; readonly inkThreshold: number;
  readonly inkSolidThreshold: number; readonly haloMinAlpha: number;
  readonly maxUnderbleedRadiusPx: number; readonly connectivity: FloodFillConnectivity;
  readonly sanitizedInkAlpha: Float32Array;
  readonly coreOwnerMap: Int32Array; readonly trappedOwnerMap: Int32Array;
  readonly underbleedAddedMask: Uint8Array;
  readonly naiveHaloMask: Uint8Array; readonly remainingHaloMask: Uint8Array;
  readonly regions: readonly UnderbleedRegionSummary[];
  readonly rejectedRegionIds: readonly string[];
  readonly naiveWhiteHaloPixelCount: number;
  readonly remainingWhiteHaloPixelCount: number;
  readonly haloRemovalRate: number;
  readonly neighborCrossBleedPixelCount: number;
  readonly voronoiHalfPlaneViolationCount: number;
  readonly totalCoreFilledPixels: number;
  readonly totalUnderbleedAddedPixels: number;
  readonly sharedBorderPixelCount: number;
  readonly barrier: GapClosingBarrierResult;
}

export interface GapClosingWgslOptions {
  readonly workgroupSizeX?: number; readonly workgroupSizeY?: number;
  readonly maxGapWidthPx?: number; readonly maxUnderbleedRadiusPx?: number;
}

export interface GapClosingUniformPackInput {
  readonly width: number; readonly height: number;
  readonly maxGapWidthPx?: number; readonly inkThreshold?: number;
  readonly inkSolidThreshold?: number; readonly maxUnderbleedRadiusPx?: number;
  readonly haloMinAlpha?: number; readonly connectivity?: FloodFillConnectivity;
  readonly inkMixStrength?: number; readonly paperLift?: number;
}

export interface GapClosingFlatFillWgslBundle {
  readonly shaderVersion: "wave119-gap-closing-underbleed-v1";
  readonly uniformByteLength: number; readonly uniformFloatCount: number;
  readonly workgroupSize: readonly [number, number, number];
  readonly gapClosingComputeWgsl: string;
  readonly underbleedCompositeFragmentWgsl: string;
}

export interface GapClosingWgslValidationReport {
  readonly valid: boolean; readonly errors: readonly string[];
  readonly computeEntryPoints: readonly string[];
  readonly fragmentEntryPoints: readonly string[];
  readonly computeBindings: readonly number[];
  readonly fragmentBindings: readonly number[];
  readonly uniformByteLength: number; readonly isUniform16ByteAligned: boolean;
  readonly forbiddenGlslTokensFound: readonly string[];
}

export const DEFAULT_INK_SOLID_THRESHOLD = 0.98;
export const DEFAULT_HALO_MIN_ALPHA = 0.02;
export const DEFAULT_UNDERBLEED_RADIUS_PX = 4;

interface RingOffset {
  readonly dx: number; readonly dy: number; readonly distSq: number;
}

function buildSortedDiskOffsets(maxRadiusPx: number): readonly RingOffset[] {
  const rInt = Math.ceil(maxRadiusPx);
  const maxDistSq = maxRadiusPx * maxRadiusPx + 1e-6;
  const list: RingOffset[] = [];
  for (let dy = -rInt; dy <= rInt; dy += 1) {
    for (let dx = -rInt; dx <= rInt; dx += 1) {
      const distSq = dx * dx + dy * dy;
      if (distSq > 0 && distSq <= maxDistSq) list.push({ dx, dy, distSq });
    }
  }
  list.sort((a, b) => a.distSq - b.distSq || a.dy - b.dy || a.dx - b.dx);
  return list;
}

function sanitizeOklch(color: OklchColor): OklchColor {
  const l = clampUnit(color.l);
  const c = Number.isFinite(color.c) ? Math.max(0, Math.min(0.4, color.c)) : 0;
  const rawH = Number.isFinite(color.h) ? color.h % 360 : 0;
  return { l, c, h: rawH < 0 ? rawH + 360 : rawH };
}

function createEmptyUnderbleedFailure(
  reasonKo: string, barrier: GapClosingBarrierResult,
  inkSolidThreshold: number, haloMinAlpha: number,
  maxUnderbleedRadiusPx: number, connectivity: FloodFillConnectivity,
): AntiHaloUnderbleedReport {
  const emptyInt = new Int32Array(0);
  const emptyU8 = new Uint8Array(0);
  return {
    ok: false, reasonKo, width: barrier.width, height: barrier.height,
    maxGapWidthPx: barrier.maxGapWidthPx, inkThreshold: barrier.inkThreshold,
    inkSolidThreshold, haloMinAlpha, maxUnderbleedRadiusPx, connectivity,
    sanitizedInkAlpha: barrier.sanitizedInkAlpha, coreOwnerMap: emptyInt, trappedOwnerMap: emptyInt,
    underbleedAddedMask: emptyU8, naiveHaloMask: emptyU8, remainingHaloMask: emptyU8,
    regions: [], rejectedRegionIds: [],
    naiveWhiteHaloPixelCount: 0, remainingWhiteHaloPixelCount: 0, haloRemovalRate: 0,
    neighborCrossBleedPixelCount: 0, voronoiHalfPlaneViolationCount: 0,
    totalCoreFilledPixels: 0, totalUnderbleedAddedPixels: 0, sharedBorderPixelCount: 0,
    barrier,
  };
}

/**
 * 다중 시드 색상 구역에 대해 틈새 밀봉 플랫 채색 후, 반투명 안티앨리어싱 먹선과 중심선 절반 깊이까지
 * 최단 유클리드 보로노이 거리 기반 언더블리드 트래핑을 수행한다.
 * (1) `remainingWhiteHaloPixelCount === 0`, (2) `neighborCrossBleedPixelCount === 0` 동시 보증.
 */
export function synthesizeAntiHaloUnderbleedFlats(
  field: LineartAlphaField,
  regionSeeds: readonly UnderbleedRegionSeed[],
  options: AntiHaloUnderbleedOptions = {},
): AntiHaloUnderbleedReport {
  const maxGapWidthPx = options.maxGapWidthPx ?? DEFAULT_GAP_WIDTH_PX;
  const inkThreshold = options.inkThreshold ?? DEFAULT_INK_THRESHOLD;
  const inkSolidThreshold = options.inkSolidThreshold ?? DEFAULT_INK_SOLID_THRESHOLD;
  const haloMinAlpha = options.haloMinAlpha ?? DEFAULT_HALO_MIN_ALPHA;
  const maxUnderbleedRadiusPx = options.maxUnderbleedRadiusPx ?? DEFAULT_UNDERBLEED_RADIUS_PX;
  const connectivity: FloodFillConnectivity = options.connectivity ?? 4;

  const barrier = closeLineartGapsDeterministically(field, { maxGapWidthPx, inkThreshold });
  if (!barrier.ok) {
    return createEmptyUnderbleedFailure(
      barrier.reasonKo, barrier, inkSolidThreshold, haloMinAlpha, maxUnderbleedRadiusPx, connectivity,
    );
  }
  if (
    !Number.isFinite(inkSolidThreshold) || inkSolidThreshold <= inkThreshold || inkSolidThreshold > 1 ||
    !Number.isFinite(haloMinAlpha) || haloMinAlpha <= 0 || haloMinAlpha >= inkThreshold ||
    !Number.isFinite(maxUnderbleedRadiusPx) || maxUnderbleedRadiusPx < 1 || maxUnderbleedRadiusPx > 8
  ) {
    return createEmptyUnderbleedFailure(
      "언더블리드 임계값 또는 반경 옵션이 유효 범위를 벗어났습니다.",
      barrier, inkSolidThreshold, haloMinAlpha, maxUnderbleedRadiusPx, connectivity,
    );
  }

  const { width, height, sanitizedInkAlpha, bridgeMask } = barrier;
  const size = width * height;
  const coreOwnerMap = new Int32Array(size);
  const corePixelCounts = new Int32Array(regionSeeds.length + 1);
  const regionLeaked = new Uint8Array(regionSeeds.length + 1);
  const regionStatuses: string[] = [];
  const regionOkFlags: boolean[] = [];
  const rejectedRegionIds: string[] = [];
  const regionBoxes: (PixelBoundingBox | null)[] = [];

  // 1) 공유 틈새 밀봉 경계에서 각 색상 구역의 순수 내부 코어 채색
  for (let rIdx = 0; rIdx < regionSeeds.length; rIdx += 1) {
    const seed = regionSeeds[rIdx];
    const ownerId = rIdx + 1;
    const fill = runGapClosingFloodFill(field, {
      seedX: seed.seedX, seedY: seed.seedY, connectivity,
      maxGapWidthPx, inkThreshold, precomputedBarrier: barrier,
    });
    if (!fill.ok) {
      regionOkFlags.push(false);
      regionStatuses.push(fill.status);
      rejectedRegionIds.push(seed.regionId);
      regionBoxes.push(null);
      continue;
    }

    let claimed = 0;
    let minX = width; let minY = height;
    let maxX = -1; let maxY = -1;
    for (let i = 0; i < size; i += 1) {
      if (fill.filledMask[i] === 1 && coreOwnerMap[i] === 0) {
        coreOwnerMap[i] = ownerId;
        claimed += 1;
        const x = i % width;
        const y = (i - x) / width;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (claimed === 0) {
      regionOkFlags.push(false);
      regionStatuses.push("rejected-duplicate-region");
      rejectedRegionIds.push(seed.regionId);
      regionBoxes.push(null);
      continue;
    }
    regionOkFlags.push(true);
    regionStatuses.push("filled");
    corePixelCounts[ownerId] = claimed;
    regionLeaked[ownerId] = fill.leakedToBorder ? 1 : 0;
    regionBoxes.push({ minX, minY, maxX, maxY });
  }

  // 2) 반투명·먹선 픽셀에 대해 배경(0) 포함 최단 유클리드 보로노이 소유자 판정
  const trappedOwnerMap = new Int32Array(coreOwnerMap);
  const underbleedAddedMask = new Uint8Array(size);
  const naiveHaloMask = new Uint8Array(size);
  const remainingHaloMask = new Uint8Array(size);
  const addedCounts = new Int32Array(regionSeeds.length + 1);
  const offsets = buildSortedDiskOffsets(maxUnderbleedRadiusPx);

  let naiveWhiteHaloPixelCount = 0;
  let remainingWhiteHaloPixelCount = 0;
  let totalUnderbleedAddedPixels = 0;
  let neighborCrossBleedPixelCount = 0;
  let voronoiHalfPlaneViolationCount = 0;

  for (let y = 0; y < height; y += 1) {
    const rowOff = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = rowOff + x;
      if (coreOwnerMap[idx] > 0) continue;
      const alpha = sanitizedInkAlpha[idx];
      if (alpha <= haloMinAlpha) continue;

      let bestDistSq = Number.POSITIVE_INFINITY;
      let bestOwner = -1;
      let bestFilledDistSq = Number.POSITIVE_INFINITY;
      let bestFilledOwner = 0;
      let bestBgDistSq = Number.POSITIVE_INFINITY;

      for (let o = 0; o < offsets.length; o += 1) {
        const off = offsets[o];
        if (off.distSq > bestDistSq) break;
        const nx = x + off.dx;
        const ny = y + off.dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = ny * width + nx;
        const nCore = coreOwnerMap[nIdx];
        if (nCore > 0) {
          if (off.distSq < bestFilledDistSq || (off.distSq === bestFilledDistSq && nCore < bestFilledOwner)) {
            bestFilledDistSq = off.distSq;
            bestFilledOwner = nCore;
          }
          if (off.distSq < bestDistSq || (off.distSq === bestDistSq && (bestOwner <= 0 || nCore < bestOwner))) {
            bestDistSq = off.distSq;
            bestOwner = nCore;
          }
        } else if (sanitizedInkAlpha[nIdx] <= haloMinAlpha && bridgeMask[nIdx] === 0) {
          if (off.distSq < bestBgDistSq) bestBgDistSq = off.distSq;
          if (off.distSq < bestDistSq) { bestDistSq = off.distSq; bestOwner = 0; }
        }
      }

      const isSemiTransparentHaloCandidate =
        alpha > haloMinAlpha && alpha < inkSolidThreshold &&
        bestFilledOwner > 0 && bestFilledDistSq <= bestBgDistSq;

      if (isSemiTransparentHaloCandidate) {
        naiveHaloMask[idx] = 1;
        naiveWhiteHaloPixelCount += 1;
      }
      if (bestOwner > 0) {
        trappedOwnerMap[idx] = bestOwner;
        underbleedAddedMask[idx] = 1;
        addedCounts[bestOwner] += 1;
        totalUnderbleedAddedPixels += 1;
        if (bestFilledDistSq > bestDistSq || bestOwner !== bestFilledOwner) {
          voronoiHalfPlaneViolationCount += 1;
        }
      }
      if (isSemiTransparentHaloCandidate && trappedOwnerMap[idx] === 0) {
        remainingHaloMask[idx] = 1;
        remainingWhiteHaloPixelCount += 1;
      }
    }
  }

  // 3) 사후 감사: 코어 불변성(이웃 교차 침범 0px) 및 맞닿음 경계 픽셀 실측
  let sharedBorderPixelCount = 0;
  let totalCoreFilledPixels = 0;
  for (let y = 0; y < height; y += 1) {
    const rowOff = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = rowOff + x;
      const core = coreOwnerMap[idx];
      const trapped = trappedOwnerMap[idx];
      if (core > 0) {
        totalCoreFilledPixels += 1;
        if (trapped !== core) neighborCrossBleedPixelCount += 1;
      }
      if (underbleedAddedMask[idx] === 1 && trapped > 0) {
        const abutsOther =
          (x > 0 && trappedOwnerMap[idx - 1] > 0 && trappedOwnerMap[idx - 1] !== trapped) ||
          (x + 1 < width && trappedOwnerMap[idx + 1] > 0 && trappedOwnerMap[idx + 1] !== trapped) ||
          (y > 0 && trappedOwnerMap[idx - width] > 0 && trappedOwnerMap[idx - width] !== trapped) ||
          (y + 1 < height && trappedOwnerMap[idx + width] > 0 && trappedOwnerMap[idx + width] !== trapped);
        if (abutsOther) sharedBorderPixelCount += 1;
      }
    }
  }

  const regions: UnderbleedRegionSummary[] = regionSeeds.map((seed, index) => {
    const ownerId = index + 1;
    const coreCount = corePixelCounts[ownerId];
    const addedCount = addedCounts[ownerId];
    return {
      regionId: seed.regionId, labelKo: seed.labelKo, regionIndex: ownerId,
      oklch: sanitizeOklch(seed.oklch), ok: regionOkFlags[index] ?? false,
      status: regionStatuses[index] ?? "rejected-unknown",
      corePixelCount: coreCount, underbleedAddedPixelCount: addedCount,
      totalFilledPixelCount: coreCount + addedCount, leakedToBorder: regionLeaked[ownerId] === 1,
      boundingBox: regionBoxes[index] ?? null,
    };
  });

  const haloRemovalRate = naiveWhiteHaloPixelCount === 0
    ? 1
    : Math.round(((naiveWhiteHaloPixelCount - remainingWhiteHaloPixelCount) / naiveWhiteHaloPixelCount) * 10000) / 10000;
  const hasValidRegion = regions.some((r) => r.ok);
  const ok = hasValidRegion && remainingWhiteHaloPixelCount === 0 && neighborCrossBleedPixelCount === 0;

  return {
    ok,
    reasonKo: !hasValidRegion
      ? "유효하게 채색된 시드 구역이 없어 언더블리드 합성을 완료할 수 없습니다."
      : `총 ${String(regions.filter((r) => r.ok).length)}개 구역의 흰 할로 ${String(naiveWhiteHaloPixelCount)}px를 모두 메웠고 이웃 교차 침범은 0px입니다.`,
    width, height, maxGapWidthPx, inkThreshold, inkSolidThreshold, haloMinAlpha,
    maxUnderbleedRadiusPx, connectivity, sanitizedInkAlpha,
    coreOwnerMap, trappedOwnerMap, underbleedAddedMask, naiveHaloMask, remainingHaloMask,
    regions, rejectedRegionIds, naiveWhiteHaloPixelCount, remainingWhiteHaloPixelCount,
    haloRemovalRate, neighborCrossBleedPixelCount, voronoiHalfPlaneViolationCount,
    totalCoreFilledPixels, totalUnderbleedAddedPixels, sharedBorderPixelCount, barrier,
  };
}

/** 16바이트 정렬 64B(`Float32Array(16)`) 갭 클로징·언더블리드 유니폼 버퍼를 패킹한다. */
export function packGapClosingFlatFillUniforms(input: GapClosingUniformPackInput): Float32Array {
  const out = new Float32Array(16);
  out[0] = Number.isFinite(input.width) && input.width >= 1 ? Math.floor(input.width) : 1;
  out[1] = Number.isFinite(input.height) && input.height >= 1 ? Math.floor(input.height) : 1;
  out[2] = Number.isFinite(input.maxGapWidthPx)
    ? Math.max(0, Math.min(8, input.maxGapWidthPx ?? DEFAULT_GAP_WIDTH_PX))
    : DEFAULT_GAP_WIDTH_PX;
  out[3] = clampUnit(input.inkThreshold ?? DEFAULT_INK_THRESHOLD);
  out[4] = clampUnit(input.inkSolidThreshold ?? DEFAULT_INK_SOLID_THRESHOLD);
  out[5] = Number.isFinite(input.maxUnderbleedRadiusPx)
    ? Math.max(1, Math.min(8, input.maxUnderbleedRadiusPx ?? DEFAULT_UNDERBLEED_RADIUS_PX))
    : DEFAULT_UNDERBLEED_RADIUS_PX;
  out[6] = clampUnit(input.haloMinAlpha ?? DEFAULT_HALO_MIN_ALPHA);
  out[7] = input.connectivity === 8 ? 8 : 4;
  out[8] = clampUnit(input.inkMixStrength ?? 1.0);
  out[9] = clampUnit(input.paperLift ?? 0.98);
  return out;
}

/**
 * WebGPU WGSL 갭 브리징 컴퓨트 셰이더와 보로노이 언더블리드 합성 프래그먼트 셰이더를 생성한다.
 */
export function buildGapClosingFlatFillWgsl(
  options: GapClosingWgslOptions = {},
): GapClosingFlatFillWgslBundle {
  const wx = Number.isInteger(options.workgroupSizeX) ? Math.max(1, Math.min(16, options.workgroupSizeX ?? 8)) : 8;
  const wy = Number.isInteger(options.workgroupSizeY) ? Math.max(1, Math.min(16, options.workgroupSizeY ?? 8)) : 8;
  const maxGap = Number.isFinite(options.maxGapWidthPx)
    ? Math.max(0, Math.min(8, Math.round(options.maxGapWidthPx ?? DEFAULT_GAP_WIDTH_PX)))
    : DEFAULT_GAP_WIDTH_PX;
  const maxTrap = Number.isFinite(options.maxUnderbleedRadiusPx)
    ? Math.max(1, Math.min(8, Math.round(options.maxUnderbleedRadiusPx ?? DEFAULT_UNDERBLEED_RADIUS_PX)))
    : DEFAULT_UNDERBLEED_RADIUS_PX;

  const gapClosingComputeWgsl = /* wgsl */ `
struct GapClosingUniforms {
  canvasDims: vec2<f32>, maxGapWidthPx: f32, inkThreshold: f32,
  inkSolidThreshold: f32, maxUnderbleedRadiusPx: f32, haloMinAlpha: f32, connectivityMode: f32,
  reserved0: vec4<f32>, reserved1: vec4<f32>,
};
@group(0) @binding(0) var<uniform> uParams: GapClosingUniforms;
@group(0) @binding(1) var<storage, read> inkAlphaIn: array<f32>;
@group(0) @binding(2) var<storage, read_write> barrierOut: array<u32>;

fn sampleInk(coord: vec2<i32>, dims: vec2<i32>) -> f32 {
  if (coord.x < 0 || coord.y < 0 || coord.x >= dims.x || coord.y >= dims.y) { return 0.0; }
  return inkAlphaIn[u32(coord.y * dims.x + coord.x)];
}
fn scanOpposingWalls(coord: vec2<i32>, dir: vec2<i32>, dims: vec2<i32>, maxSpan: i32, thresh: f32) -> bool {
  var posStep: i32 = 0;
  var negStep: i32 = 0;
  for (var s: i32 = 1; s <= ${String(Math.max(1, maxGap))}; s = s + 1) {
    if (s > maxSpan) { break; }
    if (posStep == 0 && sampleInk(coord + dir * s, dims) >= thresh) { posStep = s; }
    if (negStep == 0 && sampleInk(coord - dir * s, dims) >= thresh) { negStep = s; }
  }
  return posStep > 0 && negStep > 0 && (posStep + negStep - 1) <= maxSpan;
}
@compute @workgroup_size(${String(wx)}, ${String(wy)}, 1)
fn cs_gap_closing_barrier(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = vec2<i32>(i32(uParams.canvasDims.x), i32(uParams.canvasDims.y));
  let coord = vec2<i32>(i32(gid.x), i32(gid.y));
  if (coord.x >= dims.x || coord.y >= dims.y) { return; }
  let idx = u32(coord.y * dims.x + coord.x);
  if (inkAlphaIn[idx] >= uParams.inkThreshold) { barrierOut[idx] = 1u; return; }
  let maxSpan = i32(clamp(uParams.maxGapWidthPx, 0.0, 8.0));
  if (maxSpan <= 0) { barrierOut[idx] = 0u; return; }
  let sealH = scanOpposingWalls(coord, vec2<i32>(1, 0), dims, maxSpan, uParams.inkThreshold);
  let sealV = scanOpposingWalls(coord, vec2<i32>(0, 1), dims, maxSpan, uParams.inkThreshold);
  let sealD1 = scanOpposingWalls(coord, vec2<i32>(1, 1), dims, maxSpan, uParams.inkThreshold);
  let sealD2 = scanOpposingWalls(coord, vec2<i32>(1, -1), dims, maxSpan, uParams.inkThreshold);
  barrierOut[idx] = select(0u, 2u, sealH || sealV || sealD1 || sealD2);
}
`.trim();

  const underbleedCompositeFragmentWgsl = /* wgsl */ `
struct UnderbleedCompositeUniforms {
  canvasDims: vec2<f32>, inkThreshold: f32, inkSolidThreshold: f32,
  maxUnderbleedRadiusPx: f32, haloMinAlpha: f32, inkMixStrength: f32, paperLift: f32,
  inkColorLinear: vec4<f32>, paperColorLinear: vec4<f32>,
};
struct FullscreenVertexOut {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) uv: vec2<f32>,
};
@group(0) @binding(0) var<uniform> uTrap: UnderbleedCompositeUniforms;
@group(0) @binding(1) var<storage, read> inkAlphaBuf: array<f32>;
@group(0) @binding(2) var<storage, read> coreOwnerBuf: array<u32>;
@group(0) @binding(3) var<storage, read> regionPaletteBuf: array<vec4<f32>>;

@vertex
fn vs_fullscreen_underbleed(@builtin(vertex_index) vid: u32) -> FullscreenVertexOut {
  var positions = array<vec2<f32>, 3>(vec2<f32>(-1.0, -3.0), vec2<f32>(-1.0, 1.0), vec2<f32>(3.0, 1.0));
  let p = positions[vid];
  var out: FullscreenVertexOut;
  out.clipPosition = vec4<f32>(p, 0.0, 1.0);
  out.uv = vec2<f32>(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  return out;
}
@fragment
fn fs_underbleed_composite(input: FullscreenVertexOut) -> @location(0) vec4<f32> {
  let dims = vec2<i32>(i32(uTrap.canvasDims.x), i32(uTrap.canvasDims.y));
  let coord = vec2<i32>(
    clamp(i32(floor(input.uv.x * uTrap.canvasDims.x)), 0, dims.x - 1),
    clamp(i32(floor(input.uv.y * uTrap.canvasDims.y)), 0, dims.y - 1),
  );
  let idx = u32(coord.y * dims.x + coord.x);
  let inkAlpha = clamp(inkAlphaBuf[idx], 0.0, 1.0);
  var owner = coreOwnerBuf[idx];
  if (owner == 0u && inkAlpha > uTrap.haloMinAlpha) {
    let radius = i32(clamp(uTrap.maxUnderbleedRadiusPx, 1.0, 8.0));
    var bestDistSq: i32 = 999999;
    var bestOwner: u32 = 0u;
    var hasBgCloser: bool = false;
    for (var dy: i32 = -${String(maxTrap)}; dy <= ${String(maxTrap)}; dy = dy + 1) {
      for (var dx: i32 = -${String(maxTrap)}; dx <= ${String(maxTrap)}; dx = dx + 1) {
        let d2 = dx * dx + dy * dy;
        if (d2 == 0 || d2 > radius * radius || d2 > bestDistSq) { continue; }
        let nx = coord.x + dx;
        let ny = coord.y + dy;
        if (nx < 0 || ny < 0 || nx >= dims.x || ny >= dims.y) { continue; }
        let nIdx = u32(ny * dims.x + nx);
        let nOwner = coreOwnerBuf[nIdx];
        if (nOwner > 0u) {
          if (d2 < bestDistSq || hasBgCloser || (d2 == bestDistSq && nOwner < bestOwner)) {
            bestDistSq = d2; bestOwner = nOwner; hasBgCloser = false;
          }
        } else if (inkAlphaBuf[nIdx] <= uTrap.haloMinAlpha && d2 < bestDistSq) {
          bestDistSq = d2; bestOwner = 0u; hasBgCloser = true;
        }
      }
    }
    if (!hasBgCloser) { owner = bestOwner; }
  }
  let baseColor = select(uTrap.paperColorLinear, regionPaletteBuf[owner], owner > 0u);
  let mixedRgb = mix(baseColor.rgb, uTrap.inkColorLinear.rgb, clamp(inkAlpha * uTrap.inkMixStrength, 0.0, 1.0));
  return vec4<f32>(mixedRgb, 1.0);
}
`.trim();

  return {
    shaderVersion: "wave119-gap-closing-underbleed-v1",
    uniformByteLength: 64, uniformFloatCount: 16, workgroupSize: [wx, wy, 1],
    gapClosingComputeWgsl, underbleedCompositeFragmentWgsl,
  };
}

const FORBIDDEN_GLSL_RULES: readonly { readonly token: string; readonly pattern: RegExp }[] = [
  { token: "gl_FragColor", pattern: /\bgl_FragColor\b/ },
  { token: "gl_Position", pattern: /\bgl_Position\b/ },
  { token: "gl_GlobalInvocationID", pattern: /\bgl_GlobalInvocationID\b/ },
  { token: "texture2D", pattern: /\btexture2D\b/ },
  { token: "#version", pattern: /#version\b/ },
  { token: "layout(", pattern: /\blayout\s*\(/ },
  { token: "precision", pattern: /\bprecision\s+(?:lowp|mediump|highp)\b/ },
  { token: "glsl-vec-ctor", pattern: /\b(?:vec2|vec3|vec4|mat2|mat3|mat4)\s*\(/ },
  { token: "glsl-float-decl", pattern: /\bfloat\s+[A-Za-z_]\w*/ },
  { token: "glsl-uniform-decl", pattern: /^\s*uniform\s+[A-Za-z_]\w*/m },
  { token: "glsl-varying-attribute", pattern: /\b(?:varying|attribute)\s+[A-Za-z_]\w*/ },
];

function checkBalancedDelimiters(source: string, label: string, errors: string[]): void {
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  let braces = 0; let parens = 0;
  for (let i = 0; i < stripped.length; i += 1) {
    const ch = stripped[i];
    if (ch === "{") braces += 1;
    else if (ch === "}") braces -= 1;
    else if (ch === "(") parens += 1;
    else if (ch === ")") parens -= 1;
    if (braces < 0 || parens < 0) { errors.push(`${label}: 괄호 깊이가 음수로 내려갔습니다.`); return; }
  }
  if (braces !== 0) errors.push(`${label}: 중괄호 불균형(depth=${String(braces)})`);
  if (parens !== 0) errors.push(`${label}: 소괄호 불균형(depth=${String(parens)})`);
}

function measureUniformStructBytes(source: string, structName: string): number | null {
  const match = new RegExp(`struct\\s+${structName}\\s*\\{([\\s\\S]*?)\\}`).exec(source);
  if (!match) return null;
  const fieldRegex = /\w+\s*:\s*(vec[234]<(?:f32|u32|i32)>|f32|u32|i32)\s*,?/g;
  let offset = 0;
  let m: RegExpExecArray | null = fieldRegex.exec(match[1]);
  while (m !== null) {
    const typeName = m[1];
    const size = typeName.startsWith("vec4") ? 16 : typeName.startsWith("vec3") ? 12 : typeName.startsWith("vec2") ? 8 : 4;
    const align = typeName.startsWith("vec4") || typeName.startsWith("vec3") ? 16 : typeName.startsWith("vec2") ? 8 : 4;
    offset = Math.ceil(offset / align) * align + size;
    m = fieldRegex.exec(match[1]);
  }
  return offset;
}

function collectBindings(source: string): readonly number[] {
  const regex = /@group\(0\)\s+@binding\((\d+)\)\s+var<(?:uniform|storage)(?:,\s*(?:read|read_write))?>/g;
  const bindings: number[] = [];
  let match: RegExpExecArray | null = regex.exec(source);
  while (match !== null) { bindings.push(Number(match[1])); match = regex.exec(source); }
  return bindings;
}

/**
 * Wave 119 컴퓨트·프래그먼트 WGSL의 구조·바인딩·16바이트 정렬·금지 GLSL 토큰을 정적 검증한다.
 */
export function validateGapClosingFlatFillWgsl(
  bundle: Pick<GapClosingFlatFillWgslBundle, "gapClosingComputeWgsl" | "underbleedCompositeFragmentWgsl" | "uniformByteLength">,
): GapClosingWgslValidationReport {
  const errors: string[] = [];
  const forbiddenGlslTokensFound: string[] = [];
  const computeSrc = bundle.gapClosingComputeWgsl ?? "";
  const fragSrc = bundle.underbleedCompositeFragmentWgsl ?? "";
  const uniformByteLength = bundle.uniformByteLength;
  const isUniform16ByteAligned =
    Number.isInteger(uniformByteLength) && uniformByteLength >= 16 && uniformByteLength % 16 === 0;

  if (!isUniform16ByteAligned) errors.push(`유니폼 크기(${String(uniformByteLength)}B)는 16바이트의 양의 배수여야 합니다.`);
  if (computeSrc.trim().length === 0) errors.push("갭 클로징 컴퓨트 WGSL 소스가 비어 있습니다.");
  if (fragSrc.trim().length === 0) errors.push("언더블리드 프래그먼트 WGSL 소스가 비어 있습니다.");

  checkBalancedDelimiters(computeSrc, "compute", errors);
  checkBalancedDelimiters(fragSrc, "fragment", errors);

  const computeStructBytes = measureUniformStructBytes(computeSrc, "GapClosingUniforms");
  if (computeStructBytes === null) errors.push("컴퓨트 셰이더에 GapClosingUniforms 구조체가 없습니다.");
  else if (computeStructBytes % 16 !== 0 || computeStructBytes !== uniformByteLength) {
    errors.push(`GapClosingUniforms 크기(${String(computeStructBytes)}B)가 선언 크기(${String(uniformByteLength)}B)와 불일치합니다.`);
  }

  const fragStructBytes = measureUniformStructBytes(fragSrc, "UnderbleedCompositeUniforms");
  if (fragStructBytes === null) errors.push("프래그먼트 셰이더에 UnderbleedCompositeUniforms 구조체가 없습니다.");
  else if (fragStructBytes % 16 !== 0 || fragStructBytes !== uniformByteLength) {
    errors.push(`UnderbleedCompositeUniforms 크기(${String(fragStructBytes)}B)가 선언 크기(${String(uniformByteLength)}B)와 불일치합니다.`);
  }

  const computeBindings = collectBindings(computeSrc);
  const fragmentBindings = collectBindings(fragSrc);
  for (const required of [0, 1, 2]) {
    if (!computeBindings.includes(required)) errors.push(`컴퓨트 @binding(${String(required)}) 누락`);
  }
  if (new Set(computeBindings).size !== computeBindings.length) errors.push("컴퓨트 중복 바인딩 감지");
  for (const required of [0, 1, 2, 3]) {
    if (!fragmentBindings.includes(required)) errors.push(`프래그먼트 @binding(${String(required)}) 누락`);
  }
  if (new Set(fragmentBindings).size !== fragmentBindings.length) errors.push("프래그먼트 중복 바인딩 감지");

  const computeEntryPoints: string[] = [];
  const computeEntryRegex = /@compute\s+@workgroup_size\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)\s+fn\s+(\w+)\s*\(/g;
  let cm: RegExpExecArray | null = computeEntryRegex.exec(computeSrc);
  while (cm !== null) { computeEntryPoints.push(cm[1]); cm = computeEntryRegex.exec(computeSrc); }
  if (!computeEntryPoints.includes("cs_gap_closing_barrier")) errors.push("컴퓨트 진입점 cs_gap_closing_barrier 누락");

  const fragmentEntryPoints: string[] = [];
  const fragEntryRegex = /@fragment\s+fn\s+(\w+)\s*\(/g;
  let fm: RegExpExecArray | null = fragEntryRegex.exec(fragSrc);
  while (fm !== null) { fragmentEntryPoints.push(fm[1]); fm = fragEntryRegex.exec(fragSrc); }
  if (!fragmentEntryPoints.includes("fs_underbleed_composite")) errors.push("프래그먼트 진입점 fs_underbleed_composite 누락");

  const combinedStripped = `${computeSrc}\n${fragSrc}`
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (let i = 0; i < FORBIDDEN_GLSL_RULES.length; i += 1) {
    const rule = FORBIDDEN_GLSL_RULES[i];
    if (rule.pattern.test(combinedStripped)) {
      forbiddenGlslTokensFound.push(rule.token);
      errors.push(`금지된 GLSL 토큰(${rule.token})이 감지되었습니다.`);
    }
  }

  return {
    valid: errors.length === 0, errors, computeEntryPoints, fragmentEntryPoints,
    computeBindings, fragmentBindings, uniformByteLength, isUniform16ByteAligned, forbiddenGlslTokensFound,
  };
}
