/**
 * GPU Mipmap 피라미드 + O(visible) 타일 뷰포트 컬링 · Dirty-Rect 선택 재합성 스케줄러.
 *
 * - 1600×20000px 이상 대형 세로 웹툰 캔버스에서 현재 카메라 줌 배율에 맞는 최적 Mip 레벨
 *   (`floor(log2(1 / zoom))`)을 계산하고, 화면 가시 영역 + 1타일 프리페치 마진에 해당하는 타일만
 *   O(visible)로 선별한다(전체 캔버스 타일 배열을 절대 순회하지 않는다).
 * - 수정된 Dirty-Rect와 교차하는 타일만 선택적으로 재합성 대상으로 표시하고, 클리핑된
 *   타일 로컬 Dirty Sub-Rect를 산출해 부분 텍스처 업데이트를 지원한다.
 * - 정상 상태 프레임(steady-state)에서 문자열 키나 임시 타일 객체 배열을 힙에 할당하지 않도록
 *   정수 패킹 키와 사전 할당 `Float32Array` / `Int32Array` 버퍼에 직접 기록한다.
 */

import {
  sampleRgbaWithResampler,
  type StudioTransformResampleMode,
} from "./studio-webgpu-transform-resample-cpu";
import {
  packTileInstanceInto,
  STUDIO_TILE_FLAG_CORE_VISIBLE,
  STUDIO_TILE_FLAG_DIRTY,
  STUDIO_TILE_FLAG_PREFETCH,
  STUDIO_TILE_INSTANCE_STRIDE_FLOATS,
  type StudioPackedTileInstance,
} from "./studio-webgpu-zero-copy-pack";

import type { StudioImageDataLike } from "../studio-filters";
import type { StudioGpuRect } from "./studio-webgpu-tile-plan";

export const STUDIO_MIPMAP_DEFAULT_TILE_SIZE = 512 as const;
export const STUDIO_MIPMAP_MAX_LEVELS = 8 as const;
export const STUDIO_MIPMAP_COMPUTE_WORKGROUP_X = 8 as const;
export const STUDIO_MIPMAP_COMPUTE_WORKGROUP_Y = 8 as const;

export interface StudioMipLevelSelection {
  readonly mipLevel: number;
  readonly fractionalLod: number;
  /** Mip 레벨의 논리 해상도 축소 비율 (`1 / 2^mipLevel`, 예: 1, 0.5, 0.25). */
  readonly scale: number;
  /** 1 Mip 타일이 차지하는 원본 문서 논리 픽셀 폭 (`tileSize * 2^mipLevel`). */
  readonly mipStepMultiplier: number;
  readonly effectiveZoom: number;
}

export interface StudioGpuMipmapLevelDescriptor {
  readonly level: number;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly tileSize: number;
  /** 원본 문서 좌표계에서 1타일이 커버하는 논리 픽셀 길이. */
  readonly tileWorldSpan: number;
  readonly columns: number;
  readonly rows: number;
  readonly totalTiles: number;
  readonly estimatedRgba8Bytes: number;
}

export interface StudioGpuMipmapPyramid {
  readonly documentWidth: number;
  readonly documentHeight: number;
  readonly tileSize: number;
  readonly maxLevel: number;
  readonly levels: readonly StudioGpuMipmapLevelDescriptor[];
  readonly totalTilesAllLevels: number;
  readonly totalEstimatedRgba8Bytes: number;
}

export interface StudioTileCullScheduleInput {
  readonly documentWidth: number;
  readonly documentHeight: number;
  readonly tileSize?: number;
  /** 카메라 줌 배율 (`1.0` = 100%, `0.25` = 25% 축소, `2.0` = 200% 확대). */
  readonly cameraZoom: number;
  /** 문서 논리 좌표계 기준 화면 가시 뷰포트 사각형. */
  readonly viewport: StudioGpuRect;
  /** 가시 영역 외곽 프리페치 타일 여백 (기본 1타일). */
  readonly prefetchMarginTiles?: number;
  /** 현재 프레임에 추가 발생한 수정 영역 목록(문서 논리 좌표계). */
  readonly dirtyRects?: readonly StudioGpuRect[];
  /** 선택적 LOD 바이어스 (기본 0). */
  readonly lodBias?: number;
  /** true(기본값)면 이번 프레임에서 dirty로 선별된 타일을 즉시 최신 리비전으로 승격한다. */
  readonly commitDirtyAsResident?: boolean;
}

export interface StudioTileCullFrameResult {
  readonly mipSelection: StudioMipLevelSelection;
  readonly mipLevelDescriptor: StudioGpuMipmapLevelDescriptor;
  readonly totalCanvasTilesAtMip0: number;
  readonly totalTilesAtSelectedMip: number;
  readonly culledOutCount: number;
  readonly visibleTileCount: number;
  readonly coreVisibleCount: number;
  readonly prefetchCount: number;
  readonly dirtyTileCount: number;
  readonly reusedTileCount: number;
  /** 실제 루프 반복 횟수 (`=== visibleTileCount`, O(visible) 증명용). */
  readonly visitedTileIterations: number;
  /** 제로-알로케이션 사전 할당 버퍼의 정확한 뷰 (`visibleTileCount * 16` floats). */
  readonly packedVisibleTiles: Float32Array;
  /** `packedVisibleTiles` 내 dirty 타일 슬롯 인덱스 뷰. */
  readonly dirtySlotIndices: Int32Array;
  /** `packedVisibleTiles` 내 재사용(clean) 타일 슬롯 인덱스 뷰. */
  readonly reusedSlotIndices: Int32Array;
  /** 이번 호출에서 내부 스크래치 버퍼 재할당이 발생하지 않았는지 여부. */
  readonly zeroAllocationSteadyState: boolean;
}

export interface StudioMaterializedCulledTile {
  readonly mipLevel: number;
  readonly column: number;
  readonly row: number;
  readonly worldX: number;
  readonly worldY: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly uvMinX: number;
  readonly uvMinY: number;
  readonly uvMaxX: number;
  readonly uvMaxY: number;
  readonly dirtySubX: number;
  readonly dirtySubY: number;
  readonly dirtySubWidth: number;
  readonly dirtySubHeight: number;
  readonly isCoreVisible: boolean;
  readonly isPrefetch: boolean;
  readonly isDirty: boolean;
}

/**
 * WebGPU WGSL Compute 2× 선명 Mipmap 다운샘플러 (`Lanczos3` / `Catmull-Rom` / `Box`).
 * 선화 줌아웃 시 일반 박스/이중 양선형 블러로 선이 흐려지거나 반짝이는 현상을 억제한다.
 */
export const STUDIO_WEBGPU_MIPMAP_DOWNSAMPLE_WGSL = /* wgsl */ `
const MIP_PI_F32: f32 = 3.141592653589793;

struct MipDownsampleUniforms {
  src_width: u32,
  src_height: u32,
  dst_width: u32,
  dst_height: u32,
  kernel_mode: u32, // 0=box2x2, 1=catmull-rom, 2=lanczos3
  pad_a: u32,
  pad_b: u32,
  pad_c: u32,
};

@group(0) @binding(0) var<uniform> u_mip: MipDownsampleUniforms;
@group(0) @binding(1) var<storage, read> src_level_pixels: array<u32>;
@group(0) @binding(2) var<storage, read_write> dst_level_pixels: array<u32>;

fn mip_unpack_rgba8(packed: u32) -> vec4<f32> {
  return vec4<f32>(
    f32(packed & 255u),
    f32((packed >> 8u) & 255u),
    f32((packed >> 16u) & 255u),
    f32((packed >> 24u) & 255u),
  );
}

fn mip_pack_rgba8(rgba: vec4<f32>) -> u32 {
  let r = u32(floor(clamp(rgba.x, 0.0, 255.0) + 0.5));
  let g = u32(floor(clamp(rgba.y, 0.0, 255.0) + 0.5));
  let b = u32(floor(clamp(rgba.z, 0.0, 255.0) + 0.5));
  let a = u32(floor(clamp(rgba.w, 0.0, 255.0) + 0.5));
  return r | (g << 8u) | (b << 16u) | (a << 24u);
}

fn mip_lanczos3(x: f32) -> f32 {
  let ax = abs(x);
  if (ax >= 3.0) {
    return 0.0;
  }
  if (ax < 1e-6) {
    return 1.0;
  }
  let px = MIP_PI_F32 * ax;
  let px3 = px / 3.0;
  return (sin(px) / px) * (sin(px3) / px3);
}

fn mip_catmull_rom(x: f32) -> f32 {
  let ax = abs(x);
  if (ax >= 2.0) {
    return 0.0;
  }
  let ax2 = ax * ax;
  let ax3 = ax2 * ax;
  if (ax < 1.0) {
    return 1.5 * ax3 - 2.5 * ax2 + 1.0;
  }
  return -0.5 * ax3 + 2.5 * ax2 - 4.0 * ax + 2.0;
}

@compute @workgroup_size(8, 8, 1)
fn cs_generate_mip_level(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= u_mip.dst_width || gid.y >= u_mip.dst_height) {
    return;
  }

  let src_w = i32(u_mip.src_width);
  let src_h = i32(u_mip.src_height);
  let sx = f32(gid.x) * 2.0 + 0.5;
  let sy = f32(gid.y) * 2.0 + 0.5;

  var radius: i32 = 1;
  if (u_mip.kernel_mode == 1u) {
    radius = 4;
  } else if (u_mip.kernel_mode == 2u) {
    radius = 6;
  }

  let floor_x = i32(floor(sx));
  let floor_y = i32(floor(sy));
  let min_x = max(0, floor_x - radius + 1);
  let max_x = min(src_w - 1, floor_x + radius);
  let min_y = max(0, floor_y - radius + 1);
  let max_y = min(src_h - 1, floor_y + radius);

  var sum_rgb = vec3<f32>(0.0, 0.0, 0.0);
  var sum_a: f32 = 0.0;
  var sum_w: f32 = 0.0;

  for (var py: i32 = min_y; py <= max_y; py = py + 1) {
    let dy = (f32(py) - sy) * 0.5;
    var wy: f32 = 1.0;
    if (u_mip.kernel_mode == 1u) {
      wy = mip_catmull_rom(dy);
    } else if (u_mip.kernel_mode == 2u) {
      wy = mip_lanczos3(dy);
    }
    if (wy == 0.0) {
      continue;
    }
    for (var px: i32 = min_x; px <= max_x; px = px + 1) {
      let dx = (f32(px) - sx) * 0.5;
      var wx: f32 = 1.0;
      if (u_mip.kernel_mode == 1u) {
        wx = mip_catmull_rom(dx);
      } else if (u_mip.kernel_mode == 2u) {
        wx = mip_lanczos3(dx);
      }
      if (wx == 0.0) {
        continue;
      }
      let w = wx * wy;
      let rgba = mip_unpack_rgba8(src_level_pixels[u32(py * src_w + px)]);
      let a_norm = rgba.w / 255.0;
      let wa = w * a_norm;
      sum_rgb = sum_rgb + rgba.xyz * wa;
      sum_a = sum_a + wa;
      sum_w = sum_w + w;
    }
  }

  let dst_idx = gid.y * u_mip.dst_width + gid.x;
  if (abs(sum_w) < 1e-7) {
    dst_level_pixels[dst_idx] = 0u;
    return;
  }
  let norm_a = clamp(sum_a / sum_w, 0.0, 1.0);
  let alpha_byte = floor(norm_a * 255.0 + 0.5);
  if (alpha_byte <= 0.0 || norm_a <= 1e-4) {
    dst_level_pixels[dst_idx] = 0u;
    return;
  }
  let premul_max = vec3<f32>(255.0 * norm_a);
  let rgb_out = clamp(sum_rgb / sum_w, vec3<f32>(0.0), premul_max) / norm_a;
  dst_level_pixels[dst_idx] = mip_pack_rgba8(vec4<f32>(rgb_out, alpha_byte));
}
`;

function clamp(value: number, minimum: number, maximum: number): number {
  return value < minimum ? minimum : value > maximum ? maximum : value;
}

function positiveInt(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1
    ? Math.trunc(value)
    : fallback;
}

/**
 * 현재 카메라 줌 배율에 대응하는 최적 GPU Mip 레벨(`floor(log2(1 / zoom))`)을 계산한다.
 * - `zoom >= 1.0`: 레벨 0 (원본 1:1 해상도)
 * - `zoom = 0.5`: 레벨 1 (1/2 축소)
 * - `zoom = 0.25`: 레벨 2 (1/4 축소)
 * - `zoom = 0.125`: 레벨 3 (1/8 축소)
 */
export function computeOptimalMipLevel(
  cameraZoom: number,
  maxMipLevel: number,
  lodBias = 0,
): StudioMipLevelSelection {
  const safeMax = Math.max(0, Math.trunc(Number.isFinite(maxMipLevel) ? maxMipLevel : 0));
  const safeZoom = Number.isFinite(cameraZoom) && cameraZoom > 0
    ? clamp(cameraZoom, 1 / 256, 64)
    : 1;
  const safeBias = Number.isFinite(lodBias) ? lodBias : 0;
  const rawLod = Math.log2(1 / safeZoom) + safeBias;
  const fractionalLod = clamp(rawLod, 0, safeMax);
  // 정확히 0.5, 0.25 등 2의 거듭제곱 경계에서 부동소수 오차로 0.9999999가 되는 현상 방지
  const mipLevel = clamp(Math.floor(fractionalLod + 1e-9), 0, safeMax);
  const mipStepMultiplier = 1 << mipLevel;
  return {
    mipLevel,
    fractionalLod,
    scale: 1 / mipStepMultiplier,
    mipStepMultiplier,
    effectiveZoom: safeZoom,
  };
}

/**
 * 1600×20000px 이상 대형 세로 웹툰 캔버스용 GPU Mipmap 피라미드 계획을 산출한다.
 */
export function planGpuMipmapPyramid(
  documentWidth: number,
  documentHeight: number,
  tileSize: number = STUDIO_MIPMAP_DEFAULT_TILE_SIZE,
  maxLevels: number = STUDIO_MIPMAP_MAX_LEVELS,
): StudioGpuMipmapPyramid {
  const safeDocW = positiveInt(documentWidth, 1);
  const safeDocH = positiveInt(documentHeight, 1);
  const safeTile = positiveInt(tileSize, STUDIO_MIPMAP_DEFAULT_TILE_SIZE);
  const levelCap = clamp(positiveInt(maxLevels, STUDIO_MIPMAP_MAX_LEVELS), 1, 12);

  const levels: StudioGpuMipmapLevelDescriptor[] = [];
  let totalTilesAllLevels = 0;
  let totalEstimatedRgba8Bytes = 0;

  for (let level = 0; level < levelCap; level += 1) {
    const step = 1 << level;
    const width = Math.max(1, Math.ceil(safeDocW / step));
    const height = Math.max(1, Math.ceil(safeDocH / step));
    const columns = Math.max(1, Math.ceil(width / safeTile));
    const rows = Math.max(1, Math.ceil(height / safeTile));
    const totalTiles = columns * rows;
    const estimatedRgba8Bytes = width * height * 4;

    levels.push({
      level,
      width,
      height,
      scale: 1 / step,
      tileSize: safeTile,
      tileWorldSpan: safeTile * step,
      columns,
      rows,
      totalTiles,
      estimatedRgba8Bytes,
    });

    totalTilesAllLevels += totalTiles;
    totalEstimatedRgba8Bytes += estimatedRgba8Bytes;

    if (columns === 1 && rows === 1) break;
  }

  return {
    documentWidth: safeDocW,
    documentHeight: safeDocH,
    tileSize: safeTile,
    maxLevel: Math.max(0, levels.length - 1),
    levels,
    totalTilesAllLevels,
    totalEstimatedRgba8Bytes,
  };
}

/**
 * 결정적 CPU 2× Mipmap 다운샘플러 (`STUDIO_WEBGPU_MIPMAP_DOWNSAMPLE_WGSL` 동등 수식).
 */
export function downsampleMipLevelCpu(
  source: StudioImageDataLike,
  resampler: StudioTransformResampleMode = "lanczos3",
): StudioImageDataLike {
  const srcW = Math.max(1, Math.trunc(source.width));
  const srcH = Math.max(1, Math.trunc(source.height));
  const dstW = Math.max(1, Math.ceil(srcW / 2));
  const dstH = Math.max(1, Math.ceil(srcH / 2));
  const out = new Uint8ClampedArray(dstW * dstH * 4);
  if (source.data.length < srcW * srcH * 4) {
    return { width: dstW, height: dstH, data: out };
  }

  for (let dy = 0; dy < dstH; dy += 1) {
    const sy = dy * 2 + 0.5;
    const rowBase = dy * dstW;
    for (let dx = 0; dx < dstW; dx += 1) {
      const sx = dx * 2 + 0.5;
      sampleRgbaWithResampler(
        source.data,
        srcW,
        srcH,
        sx,
        sy,
        out,
        (rowBase + dx) * 4,
        resampler,
        2,
        2,
      );
    }
  }
  return { width: dstW, height: dstH, data: out };
}

/** 문자열 할당 없이 `(mipLevel, column, row)`를 안전한 정수 키(53-bit 이하)로 패킹한다. */
function packTileResidencyKey(mipLevel: number, column: number, row: number): number {
  return mipLevel * 268_435_456 + row * 16_384 + column;
}

export interface StudioWebGpuTileViewportCullerOptions {
  readonly initialTileCapacity?: number;
}

/**
 * O(visible) 타일 뷰포트 컬링 · 1타일 프리페치 · Dirty-Rect 선택 재합성 플래너.
 *
 * - 정상 상태 프레임에서는 사전 할당된 `Float32Array` · `Int32Array`를 재사용하므로
 *   GC 할당이 0건으로 수렴한다.
 * - `markDirtyRect`로 누적한 변경 영역과 프레임 입력 `dirtyRects`를 합산해 교차 타일만
 *   선택적으로 재합성 대상으로 마킹한다.
 */
export class StudioWebGpuTileViewportCuller {
  private packedTiles: Float32Array;
  private dirtyIndices: Int32Array;
  private reusedIndices: Int32Array;
  private tileCapacity: number;
  private readonly residentTiles = new Map<number, number>();
  private readonly pendingDirtyRects: StudioGpuRect[] = [];
  private cachedPyramidKey = "";
  private cachedPyramid: StudioGpuMipmapPyramid | null = null;
  private contentEpoch = 1;
  private scratchTileObj: {
    worldX: number;
    worldY: number;
    worldWidth: number;
    worldHeight: number;
    uvMinX: number;
    uvMinY: number;
    uvMaxX: number;
    uvMaxY: number;
    dirtySubX: number;
    dirtySubY: number;
    dirtySubWidth: number;
    dirtySubHeight: number;
    mipLevel: number;
    column: number;
    row: number;
    flags: number;
  } = {
      worldX: 0,
      worldY: 0,
      worldWidth: 0,
      worldHeight: 0,
      uvMinX: 0,
      uvMinY: 0,
      uvMaxX: 1,
      uvMaxY: 1,
      dirtySubX: 0,
      dirtySubY: 0,
      dirtySubWidth: 0,
      dirtySubHeight: 0,
      mipLevel: 0,
      column: 0,
      row: 0,
      flags: 0,
    };

  public constructor(options: StudioWebGpuTileViewportCullerOptions = {}) {
    this.tileCapacity = Math.max(32, positiveInt(options.initialTileCapacity, 256));
    this.packedTiles = new Float32Array(this.tileCapacity * STUDIO_TILE_INSTANCE_STRIDE_FLOATS);
    this.dirtyIndices = new Int32Array(this.tileCapacity);
    this.reusedIndices = new Int32Array(this.tileCapacity);
  }

  /** 문서 좌표계의 Dirty-Rect를 대기 큐에 누적한다. */
  public markDirtyRect(rect: StudioGpuRect): void {
    if (
      !Number.isFinite(rect.x)
      || !Number.isFinite(rect.y)
      || !Number.isFinite(rect.width)
      || !Number.isFinite(rect.height)
      || rect.width <= 0
      || rect.height <= 0
    ) {
      return;
    }
    this.pendingDirtyRects.push(rect);
  }

  /** 모든 상주 타일 캐시를 무효화한다(디바이스 손실·전체 캔버스 리사이즈 시). */
  public invalidateAll(): void {
    this.residentTiles.clear();
    this.pendingDirtyRects.length = 0;
    this.contentEpoch += 1;
  }

  private resolvePyramid(docW: number, docH: number, tileSize: number): StudioGpuMipmapPyramid {
    const key = `${docW}:${docH}:${tileSize}`;
    if (this.cachedPyramid && this.cachedPyramidKey === key) {
      return this.cachedPyramid;
    }
    this.cachedPyramidKey = key;
    this.cachedPyramid = planGpuMipmapPyramid(docW, docH, tileSize);
    return this.cachedPyramid;
  }

  private ensureCapacity(requiredTiles: number): boolean {
    if (requiredTiles <= this.tileCapacity) return true;
    const nextCapacity = Math.max(requiredTiles, this.tileCapacity * 2);
    this.tileCapacity = nextCapacity;
    this.packedTiles = new Float32Array(nextCapacity * STUDIO_TILE_INSTANCE_STRIDE_FLOATS);
    this.dirtyIndices = new Int32Array(nextCapacity);
    this.reusedIndices = new Int32Array(nextCapacity);
    return false;
  }

  /**
   * 현재 카메라 줌과 뷰포트, Dirty-Rect를 기준으로 가시+프리페치 타일만 O(visible)로 선별하고
   * 제로카피 `Float32Array` 뷰와 dirty/reused 인덱스를 반환한다.
   */
  public cullAndSchedule(input: StudioTileCullScheduleInput): StudioTileCullFrameResult {
    const docW = positiveInt(input.documentWidth, 1);
    const docH = positiveInt(input.documentHeight, 1);
    const tileSize = positiveInt(input.tileSize, STUDIO_MIPMAP_DEFAULT_TILE_SIZE);
    const pyramid = this.resolvePyramid(docW, docH, tileSize);
    const mipSelection = computeOptimalMipLevel(input.cameraZoom, pyramid.maxLevel, input.lodBias ?? 0);
    const levelDesc = pyramid.levels[mipSelection.mipLevel]!;
    const mip0Desc = pyramid.levels[0]!;

    const margin = typeof input.prefetchMarginTiles === "number" && Number.isFinite(input.prefetchMarginTiles)
      ? Math.max(0, Math.trunc(input.prefetchMarginTiles))
      : 1;

    const viewMinX = clamp(Number.isFinite(input.viewport.x) ? input.viewport.x : 0, 0, docW);
    const viewMinY = clamp(Number.isFinite(input.viewport.y) ? input.viewport.y : 0, 0, docH);
    const viewW = Number.isFinite(input.viewport.width) ? Math.max(0, input.viewport.width) : 0;
    const viewH = Number.isFinite(input.viewport.height) ? Math.max(0, input.viewport.height) : 0;
    const viewMaxX = clamp(viewMinX + viewW, viewMinX, docW);
    const viewMaxY = clamp(viewMinY + viewH, viewMinY, docH);

    const pendingCount = this.pendingDirtyRects.length;
    const inputDirty = input.dirtyRects;
    const inputDirtyCount = inputDirty ? inputDirty.length : 0;
    const totalDirtyRects = pendingCount + inputDirtyCount;

    if (viewMaxX <= viewMinX || viewMaxY <= viewMinY) {
      this.pendingDirtyRects.length = 0;
      return {
        mipSelection,
        mipLevelDescriptor: levelDesc,
        totalCanvasTilesAtMip0: mip0Desc.totalTiles,
        totalTilesAtSelectedMip: levelDesc.totalTiles,
        culledOutCount: levelDesc.totalTiles,
        visibleTileCount: 0,
        coreVisibleCount: 0,
        prefetchCount: 0,
        dirtyTileCount: 0,
        reusedTileCount: 0,
        visitedTileIterations: 0,
        packedVisibleTiles: this.packedTiles.subarray(0, 0),
        dirtySlotIndices: this.dirtyIndices.subarray(0, 0),
        reusedSlotIndices: this.reusedIndices.subarray(0, 0),
        zeroAllocationSteadyState: true,
      };
    }

    const span = levelDesc.tileWorldSpan;
    const coreMinCol = clamp(Math.floor(viewMinX / span), 0, levelDesc.columns - 1);
    const coreMaxCol = clamp(Math.ceil(viewMaxX / span) - 1, coreMinCol, levelDesc.columns - 1);
    const coreMinRow = clamp(Math.floor(viewMinY / span), 0, levelDesc.rows - 1);
    const coreMaxRow = clamp(Math.ceil(viewMaxY / span) - 1, coreMinRow, levelDesc.rows - 1);

    const minCol = Math.max(0, coreMinCol - margin);
    const maxCol = Math.min(levelDesc.columns - 1, coreMaxCol + margin);
    const minRow = Math.max(0, coreMinRow - margin);
    const maxRow = Math.min(levelDesc.rows - 1, coreMaxRow + margin);

    const visibleTileCount = (maxCol - minCol + 1) * (maxRow - minRow + 1);
    const zeroAllocationSteadyState = this.ensureCapacity(visibleTileCount);
    const commitDirty = input.commitDirtyAsResident !== false;

    let slotIndex = 0;
    let coreVisibleCount = 0;
    let prefetchCount = 0;
    let dirtyTileCount = 0;
    let reusedTileCount = 0;
    let visitedTileIterations = 0;

    // 1패스: 화면 핵심 가시(Core) 타일을 먼저 패킹하고, 2패스: 프리페치 외곽 링 타일을 뒤이어 패킹한다.
    for (let pass = 0; pass < 2; pass += 1) {
      const wantCore = pass === 0;
      for (let row = minRow; row <= maxRow; row += 1) {
        const isCoreRow = row >= coreMinRow && row <= coreMaxRow;
        for (let col = minCol; col <= maxCol; col += 1) {
          const isCore = isCoreRow && col >= coreMinCol && col <= coreMaxCol;
          if (isCore !== wantCore) continue;

          visitedTileIterations += 1;
          const worldX = col * span;
          const worldY = row * span;
          const worldWidth = Math.min(span, docW - worldX);
          const worldHeight = Math.min(span, docH - worldY);
          const worldRight = worldX + worldWidth;
          const worldBottom = worldY + worldHeight;

          const mipPixelW = Math.min(tileSize, Math.ceil(worldWidth * levelDesc.scale));
          const mipPixelH = Math.min(tileSize, Math.ceil(worldHeight * levelDesc.scale));

          const residencyKey = packTileResidencyKey(levelDesc.level, col, row);
          const isResident = this.residentTiles.get(residencyKey) === this.contentEpoch;

          let dirtyMinX = Number.POSITIVE_INFINITY;
          let dirtyMinY = Number.POSITIVE_INFINITY;
          let dirtyMaxX = Number.NEGATIVE_INFINITY;
          let dirtyMaxY = Number.NEGATIVE_INFINITY;
          let intersectsDirty = false;

          if (totalDirtyRects > 0) {
            for (let i = 0; i < totalDirtyRects; i += 1) {
              const rect = i < pendingCount ? this.pendingDirtyRects[i]! : inputDirty![i - pendingCount]!;
              const rx0 = rect.x;
              const ry0 = rect.y;
              const rx1 = rx0 + rect.width;
              const ry1 = ry0 + rect.height;
              if (rx1 <= worldX || rx0 >= worldRight || ry1 <= worldY || ry0 >= worldBottom) {
                continue;
              }
              const clipX0 = rx0 > worldX ? rx0 : worldX;
              const clipY0 = ry0 > worldY ? ry0 : worldY;
              const clipX1 = rx1 < worldRight ? rx1 : worldRight;
              const clipY1 = ry1 < worldBottom ? ry1 : worldBottom;
              if (clipX1 > clipX0 && clipY1 > clipY0) {
                intersectsDirty = true;
                if (clipX0 < dirtyMinX) dirtyMinX = clipX0;
                if (clipY0 < dirtyMinY) dirtyMinY = clipY0;
                if (clipX1 > dirtyMaxX) dirtyMaxX = clipX1;
                if (clipY1 > dirtyMaxY) dirtyMaxY = clipY1;
              }
            }
          }

          const isDirty = !isResident || intersectsDirty;
          let dirtySubX = 0;
          let dirtySubY = 0;
          let dirtySubWidth = 0;
          let dirtySubHeight = 0;

          if (!isResident) {
            dirtySubX = 0;
            dirtySubY = 0;
            dirtySubWidth = mipPixelW;
            dirtySubHeight = mipPixelH;
          } else if (intersectsDirty) {
            dirtySubX = Math.floor((dirtyMinX - worldX) * levelDesc.scale);
            dirtySubY = Math.floor((dirtyMinY - worldY) * levelDesc.scale);
            const subEndX = Math.min(mipPixelW, Math.ceil((dirtyMaxX - worldX) * levelDesc.scale));
            const subEndY = Math.min(mipPixelH, Math.ceil((dirtyMaxY - worldY) * levelDesc.scale));
            dirtySubWidth = Math.max(0, subEndX - dirtySubX);
            dirtySubHeight = Math.max(0, subEndY - dirtySubY);
          }

          let flags = isCore ? STUDIO_TILE_FLAG_CORE_VISIBLE : STUDIO_TILE_FLAG_PREFETCH;
          if (isDirty) {
            flags |= STUDIO_TILE_FLAG_DIRTY;
            this.dirtyIndices[dirtyTileCount] = slotIndex;
            dirtyTileCount += 1;
            if (commitDirty) {
              this.residentTiles.set(residencyKey, this.contentEpoch);
            }
          } else {
            this.reusedIndices[reusedTileCount] = slotIndex;
            reusedTileCount += 1;
          }

          if (isCore) coreVisibleCount += 1;
          else prefetchCount += 1;

          const scratch = this.scratchTileObj;
          scratch.worldX = worldX;
          scratch.worldY = worldY;
          scratch.worldWidth = worldWidth;
          scratch.worldHeight = worldHeight;
          scratch.uvMinX = 0;
          scratch.uvMinY = 0;
          scratch.uvMaxX = mipPixelW / tileSize;
          scratch.uvMaxY = mipPixelH / tileSize;
          scratch.dirtySubX = dirtySubX;
          scratch.dirtySubY = dirtySubY;
          scratch.dirtySubWidth = dirtySubWidth;
          scratch.dirtySubHeight = dirtySubHeight;
          scratch.mipLevel = levelDesc.level;
          scratch.column = col;
          scratch.row = row;
          scratch.flags = flags;

          packTileInstanceInto(
            this.packedTiles,
            slotIndex * STUDIO_TILE_INSTANCE_STRIDE_FLOATS,
            scratch as StudioPackedTileInstance,
          );
          slotIndex += 1;
        }
      }
    }

    this.pendingDirtyRects.length = 0;

    return {
      mipSelection,
      mipLevelDescriptor: levelDesc,
      totalCanvasTilesAtMip0: mip0Desc.totalTiles,
      totalTilesAtSelectedMip: levelDesc.totalTiles,
      culledOutCount: Math.max(0, levelDesc.totalTiles - visibleTileCount),
      visibleTileCount,
      coreVisibleCount,
      prefetchCount,
      dirtyTileCount,
      reusedTileCount,
      visitedTileIterations,
      packedVisibleTiles: this.packedTiles.subarray(0, visibleTileCount * STUDIO_TILE_INSTANCE_STRIDE_FLOATS),
      dirtySlotIndices: this.dirtyIndices.subarray(0, dirtyTileCount),
      reusedSlotIndices: this.reusedIndices.subarray(0, reusedTileCount),
      zeroAllocationSteadyState,
    };
  }
}

/**
 * 패킹된 `Float32Array` 컬링 결과에서 진단·검증·UI 디버그용 타일 디스크립터 목록을 복원한다.
 */
export function materializeCulledTileDescriptors(
  packedVisibleTiles: Float32Array,
): readonly StudioMaterializedCulledTile[] {
  const count = Math.floor(packedVisibleTiles.length / STUDIO_TILE_INSTANCE_STRIDE_FLOATS);
  const items: StudioMaterializedCulledTile[] = [];
  for (let i = 0; i < count; i += 1) {
    const off = i * STUDIO_TILE_INSTANCE_STRIDE_FLOATS;
    const flags = Math.trunc(packedVisibleTiles[off + 15]!);
    items.push({
      worldX: packedVisibleTiles[off]!,
      worldY: packedVisibleTiles[off + 1]!,
      worldWidth: packedVisibleTiles[off + 2]!,
      worldHeight: packedVisibleTiles[off + 3]!,
      uvMinX: packedVisibleTiles[off + 4]!,
      uvMinY: packedVisibleTiles[off + 5]!,
      uvMaxX: packedVisibleTiles[off + 6]!,
      uvMaxY: packedVisibleTiles[off + 7]!,
      dirtySubX: packedVisibleTiles[off + 8]!,
      dirtySubY: packedVisibleTiles[off + 9]!,
      dirtySubWidth: packedVisibleTiles[off + 10]!,
      dirtySubHeight: packedVisibleTiles[off + 11]!,
      mipLevel: Math.trunc(packedVisibleTiles[off + 12]!),
      column: Math.trunc(packedVisibleTiles[off + 13]!),
      row: Math.trunc(packedVisibleTiles[off + 14]!),
      isCoreVisible: (flags & STUDIO_TILE_FLAG_CORE_VISIBLE) !== 0,
      isPrefetch: (flags & STUDIO_TILE_FLAG_PREFETCH) !== 0,
      isDirty: (flags & STUDIO_TILE_FLAG_DIRTY) !== 0,
    });
  }
  return items;
}
