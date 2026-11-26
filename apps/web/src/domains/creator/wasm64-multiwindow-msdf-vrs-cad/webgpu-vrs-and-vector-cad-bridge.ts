/**
 * WebGPU 컴퓨트 타일 단위 가변 비율 셰이딩(VRS) 분류기 및 온디바이스 2D→3D 수밀(Manifold) 건축 CAD 브리지.
 *
 * - WebGPU 코어 규격에는 D3D12/Vulkan 하드웨어 프리미티브 VRS(`VK_KHR_fragment_shading_rate`)가
 *   직접 노출되지 않으므로, 16×16 워크그룹 컴퓨트 패스에서 타일별 휘도 기울기·엣지 밀도·말풍선/선화/얼굴
 *   보호 마스크를 분석해 `1×1`(풀 레이트)·`2×2`(중간)·`4×4`(배경/하늘) 셰이딩 레이트 맵을 산출하는
 *   **WebGPU Compute Tile-Level Variable Rate Shading**을 구현한다.
 * - 온디바이스 2D→3D 수밀 건축 CAD 변환기(`extrudeVectorPlanToManifoldMesh`)를 함께 재노출한다.
 */

export {
  extrudeVectorPlanToManifoldMesh,
  validateManifoldMeshTopology,
  type ManifoldMaterialRange,
  type ManifoldMeshBounds,
  type ManifoldMeshResult,
  type ManifoldTopologyAudit,
  type Vec2M,
  type VectorFloorplanInput,
  type VectorPlanElement,
  type VectorPlanPolygonElement,
  type VectorPlanStairsElement,
  type VectorPlanWallElement,
  type WallOpeningSpec,
} from "./vector-cad-manifold-extruder";

export const VRS_TILE_SIZE = 16 as const;
export const VRS_RATE_1X1 = 0 as const;
export const VRS_RATE_2X2 = 1 as const;
export const VRS_RATE_4X4 = 2 as const;

export type VrsShadingRateCode = typeof VRS_RATE_1X1 | typeof VRS_RATE_2X2 | typeof VRS_RATE_4X4;

export const VRS_MASK_NONE = 0 as const;
export const VRS_MASK_LINE_ART = 1 << 0;
export const VRS_MASK_BALLOON_TEXT = 1 << 1;
export const VRS_MASK_CHARACTER_FACE = 1 << 2;
export const VRS_MASK_ALL_PROTECTED =
  VRS_MASK_LINE_ART | VRS_MASK_BALLOON_TEXT | VRS_MASK_CHARACTER_FACE;

export const VRS_DEFAULT_EDGE_PIXEL_THRESHOLD = 0.08 as const;
export const VRS_DEFAULT_HIGH_DETAIL_EDGE_DENSITY = 0.06 as const;
export const VRS_DEFAULT_HIGH_DETAIL_MEAN_GRADIENT = 0.055 as const;
export const VRS_DEFAULT_MID_DETAIL_EDGE_DENSITY = 0.015 as const;
export const VRS_DEFAULT_MID_DETAIL_MEAN_GRADIENT = 0.014 as const;
export const VRS_UNIFORM_BYTES = 32 as const;

/**
 * WebGPU 컴퓨트 타일 단위 VRS(16×16 타일) 분류 셰이더.
 * 하드웨어 프리미티브 VRS가 아닌 WebGPU 컴퓨트 타일 레이트 맵 생성 패스다.
 */
export const WGSL_COMPUTE_VRS_TILE_CLASSIFIER: string = /* wgsl */ `
struct VrsClassifierParams {
  width: u32,
  height: u32,
  tiles_x: u32,
  protected_mask_bits: u32,
  edge_pixel_threshold: f32,
  high_edge_density: f32,
  high_mean_gradient: f32,
  mid_mean_gradient: f32,
}

@group(0) @binding(0) var<uniform> params: VrsClassifierParams;
@group(0) @binding(1) var<storage, read> src_rgba: array<u32>;
@group(0) @binding(2) var<storage, read> semantic_mask: array<u32>;
@group(0) @binding(3) var<storage, read_write> tile_rates: array<u32>;

var<workgroup> tile_luma: array<f32, 256>;
var<workgroup> wg_grad_fixed_sum: atomic<u32>;
var<workgroup> wg_edge_pixel_count: atomic<u32>;
var<workgroup> wg_protected_count: atomic<u32>;
var<workgroup> wg_valid_pixels: atomic<u32>;

fn unpack_luma(packed_rgba: u32) -> f32 {
  let r = f32(packed_rgba & 0xffu) / 255.0;
  let g = f32((packed_rgba >> 8u) & 0xffu) / 255.0;
  let b = f32((packed_rgba >> 16u) & 0xffu) / 255.0;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

@compute @workgroup_size(16, 16)
fn main(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
  @builtin(workgroup_id) wid: vec3<u32>,
) {
  let local_idx = lid.y * 16u + lid.x;
  if (local_idx == 0u) {
    atomicStore(&wg_grad_fixed_sum, 0u);
    atomicStore(&wg_edge_pixel_count, 0u);
    atomicStore(&wg_protected_count, 0u);
    atomicStore(&wg_valid_pixels, 0u);
  }
  workgroupBarrier();

  let in_bounds = gid.x < params.width && gid.y < params.height;
  var luma: f32 = 0.0;
  if (in_bounds) {
    let px_idx = gid.y * params.width + gid.x;
    luma = unpack_luma(src_rgba[px_idx]);
    atomicAdd(&wg_valid_pixels, 1u);
    if ((semantic_mask[px_idx] & params.protected_mask_bits) != 0u) {
      atomicAdd(&wg_protected_count, 1u);
    }
  }
  tile_luma[local_idx] = luma;
  workgroupBarrier();

  if (in_bounds) {
    let lx = i32(lid.x);
    let ly = i32(lid.y);
    let max_lx = min(15, i32(params.width) - 1 - i32(wid.x * 16u));
    let max_ly = min(15, i32(params.height) - 1 - i32(wid.y * 16u));
    let l_left = tile_luma[u32(ly) * 16u + u32(max(0, lx - 1))];
    let l_right = tile_luma[u32(ly) * 16u + u32(min(max_lx, lx + 1))];
    let l_up = tile_luma[u32(max(0, ly - 1)) * 16u + u32(lx)];
    let l_down = tile_luma[u32(min(max_ly, ly + 1)) * 16u + u32(lx)];
    let gx = l_right - l_left;
    let gy = l_down - l_up;
    let grad = sqrt(gx * gx + gy * gy);
    atomicAdd(&wg_grad_fixed_sum, u32(min(grad, 2.0) * 1024.0));
    if (grad >= params.edge_pixel_threshold) {
      atomicAdd(&wg_edge_pixel_count, 1u);
    }
  }
  workgroupBarrier();

  if (local_idx == 0u) {
    let valid_count = max(atomicLoad(&wg_valid_pixels), 1u);
    let protected_count = atomicLoad(&wg_protected_count);
    let mean_grad = (f32(atomicLoad(&wg_grad_fixed_sum)) / 1024.0) / f32(valid_count);
    let edge_density = f32(atomicLoad(&wg_edge_pixel_count)) / f32(valid_count);

    var rate: u32 = 2u;
    if (
      protected_count > 0u
      || edge_density >= params.high_edge_density
      || mean_grad >= params.high_mean_gradient
    ) {
      rate = 0u;
    } else if (edge_density >= params.high_edge_density * 0.25 || mean_grad >= params.mid_mean_gradient) {
      rate = 1u;
    }
    tile_rates[wid.y * params.tiles_x + wid.x] = rate;
  }
}
`;

export interface VrsWgslValidationResult {
  readonly valid: boolean;
  readonly workgroupSize: readonly [number, number, number] | null;
  readonly usesWorkgroupMemory: boolean;
  readonly usesWorkgroupBarrier: boolean;
  readonly bindings: readonly { readonly group: number; readonly binding: number }[];
  readonly errors: readonly string[];
}

export interface VrsClassifyCpuInput {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray | Uint8Array;
  readonly semanticMask?: Uint8Array | Uint32Array;
  readonly protectedMaskBits?: number;
  readonly edgePixelThreshold?: number;
  readonly highDetailEdgeDensity?: number;
  readonly highDetailMeanGradient?: number;
  readonly midDetailEdgeDensity?: number;
  readonly midDetailMeanGradient?: number;
}

export interface VrsTileDiagnostic {
  readonly tileX: number;
  readonly tileY: number;
  readonly rate: VrsShadingRateCode;
  readonly meanGradient: number;
  readonly edgeDensity: number;
  readonly hasProtectedMask: boolean;
  readonly shadedInvocations: number;
}

export interface VrsClassificationResult {
  readonly backend: "webgpu-compute-tile-vrs-cpu-reference";
  readonly implementationNoteKo: string;
  readonly width: number;
  readonly height: number;
  readonly tileSize: typeof VRS_TILE_SIZE;
  readonly tilesX: number;
  readonly tilesY: number;
  readonly totalTiles: number;
  readonly tileRates: Uint8Array;
  readonly rate1x1Count: number;
  readonly rate2x2Count: number;
  readonly rate4x4Count: number;
  readonly protectedMaskTileCount: number;
  readonly protectedMaskPreserved1x1Count: number;
  readonly baselineInvocations: number;
  readonly shadedInvocations: number;
  readonly invocationSavingsRatio: number;
  readonly invocationSavingsPercent: number;
  readonly diagnostics: readonly VrsTileDiagnostic[];
}

export function validateVrsWgslShader(
  source: string = WGSL_COMPUTE_VRS_TILE_CLASSIFIER,
): VrsWgslValidationResult {
  const errors: string[] = [];
  const wgMatch = /@compute\s+@workgroup_size\(\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*(\d+))?\s*\)/.exec(source);
  const workgroupSize: readonly [number, number, number] | null = wgMatch
    ? [Number(wgMatch[1]), Number(wgMatch[2]), wgMatch[3] ? Number(wgMatch[3]) : 1]
    : null;
  if (!workgroupSize) errors.push("Missing @compute @workgroup_size(16, 16) entry.");
  else if (workgroupSize[0] !== 16 || workgroupSize[1] !== 16) {
    errors.push("Expected 16×16 workgroup tile size for VRS classifier.");
  }

  const usesWorkgroupMemory = /var<workgroup>/.test(source);
  const usesWorkgroupBarrier = /workgroupBarrier\s*\(\s*\)/.test(source);
  if (!usesWorkgroupMemory) errors.push("Missing workgroup shared tile memory.");
  if (!usesWorkgroupBarrier) errors.push("Missing workgroupBarrier() synchronization.");

  const bindings: { readonly group: number; readonly binding: number }[] = [];
  const bindingRegex = /@group\((\d+)\)\s*@binding\((\d+)\)/g;
  let m = bindingRegex.exec(source);
  while (m !== null) {
    bindings.push({ group: Number(m[1]), binding: Number(m[2]) });
    m = bindingRegex.exec(source);
  }
  if (bindings.length < 4) errors.push("Expected 4 bindings (uniform, rgba, mask, tile_rates).");

  return {
    valid: errors.length === 0,
    workgroupSize,
    usesWorkgroupMemory,
    usesWorkgroupBarrier,
    bindings,
    errors,
  };
}

export function packVrsClassifierUniforms(
  width: number,
  height: number,
  options?: {
    readonly protectedMaskBits?: number;
    readonly edgePixelThreshold?: number;
    readonly highDetailEdgeDensity?: number;
    readonly highDetailMeanGradient?: number;
    readonly midDetailMeanGradient?: number;
  },
): ArrayBuffer {
  const buffer = new ArrayBuffer(VRS_UNIFORM_BYTES);
  const u32 = new Uint32Array(buffer);
  const f32 = new Float32Array(buffer);
  const safeW = Math.max(1, Math.round(width));
  const safeH = Math.max(1, Math.round(height));
  u32[0] = safeW;
  u32[1] = safeH;
  u32[2] = Math.ceil(safeW / VRS_TILE_SIZE);
  u32[3] = options?.protectedMaskBits ?? VRS_MASK_ALL_PROTECTED;
  f32[4] = options?.edgePixelThreshold ?? VRS_DEFAULT_EDGE_PIXEL_THRESHOLD;
  f32[5] = options?.highDetailEdgeDensity ?? VRS_DEFAULT_HIGH_DETAIL_EDGE_DENSITY;
  f32[6] = options?.highDetailMeanGradient ?? VRS_DEFAULT_HIGH_DETAIL_MEAN_GRADIENT;
  f32[7] = options?.midDetailMeanGradient ?? VRS_DEFAULT_MID_DETAIL_MEAN_GRADIENT;
  return buffer;
}

/**
 * 16×16 타일별 VRS 분류기 CPU 참조 실행기 (`WGSL_COMPUTE_VRS_TILE_CLASSIFIER`와 동등).
 */
export function classifyVrsTileRatesCpu(input: VrsClassifyCpuInput): VrsClassificationResult {
  const width = Math.max(1, Math.round(input.width));
  const height = Math.max(1, Math.round(input.height));
  const expectedBytes = width * height * 4;
  if (input.rgba.length < expectedBytes) {
    throw new Error(`RGBA 버퍼 크기가 부족합니다: 필요 ${expectedBytes}B, 입력 ${input.rgba.length}B`);
  }

  const protectedMaskBits = input.protectedMaskBits ?? VRS_MASK_ALL_PROTECTED;
  const edgePixelThreshold = input.edgePixelThreshold ?? VRS_DEFAULT_EDGE_PIXEL_THRESHOLD;
  const highEdgeDensity = input.highDetailEdgeDensity ?? VRS_DEFAULT_HIGH_DETAIL_EDGE_DENSITY;
  const highMeanGradient = input.highDetailMeanGradient ?? VRS_DEFAULT_HIGH_DETAIL_MEAN_GRADIENT;
  const midEdgeDensity = input.midDetailEdgeDensity ?? highEdgeDensity * 0.25;
  const midMeanGradient = input.midDetailMeanGradient ?? VRS_DEFAULT_MID_DETAIL_MEAN_GRADIENT;

  const tilesX = Math.ceil(width / VRS_TILE_SIZE);
  const tilesY = Math.ceil(height / VRS_TILE_SIZE);
  const totalTiles = tilesX * tilesY;
  const tileRates = new Uint8Array(totalTiles);
  const diagnostics: VrsTileDiagnostic[] = [];
  const tileLuma = new Float32Array(VRS_TILE_SIZE * VRS_TILE_SIZE);

  let rate1x1Count = 0;
  let rate2x2Count = 0;
  let rate4x4Count = 0;
  let protectedMaskTileCount = 0;
  let protectedMaskPreserved1x1Count = 0;
  let shadedInvocations = 0;

  for (let ty = 0; ty < tilesY; ty += 1) {
    const originY = ty * VRS_TILE_SIZE;
    const tileH = Math.min(VRS_TILE_SIZE, height - originY);
    for (let tx = 0; tx < tilesX; tx += 1) {
      const originX = tx * VRS_TILE_SIZE;
      const tileW = Math.min(VRS_TILE_SIZE, width - originX);
      let protectedCount = 0;

      for (let ly = 0; ly < tileH; ly += 1) {
        const py = originY + ly;
        for (let lx = 0; lx < tileW; lx += 1) {
          const px = originX + lx;
          const idx = py * width + px;
          const byteOffset = idx * 4;
          const r = (input.rgba[byteOffset] ?? 0) / 255;
          const g = (input.rgba[byteOffset + 1] ?? 0) / 255;
          const b = (input.rgba[byteOffset + 2] ?? 0) / 255;
          tileLuma[ly * VRS_TILE_SIZE + lx] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          if (input.semanticMask && ((input.semanticMask[idx] ?? 0) & protectedMaskBits) !== 0) {
            protectedCount += 1;
          }
        }
      }

      const validPixels = Math.max(1, tileW * tileH);
      let gradSum = 0;
      let edgePixels = 0;
      for (let ly = 0; ly < tileH; ly += 1) {
        const up = Math.max(0, ly - 1);
        const down = Math.min(tileH - 1, ly + 1);
        for (let lx = 0; lx < tileW; lx += 1) {
          const left = Math.max(0, lx - 1);
          const right = Math.min(tileW - 1, lx + 1);
          const gx =
            (tileLuma[ly * VRS_TILE_SIZE + right] ?? 0) -
            (tileLuma[ly * VRS_TILE_SIZE + left] ?? 0);
          const gy =
            (tileLuma[down * VRS_TILE_SIZE + lx] ?? 0) -
            (tileLuma[up * VRS_TILE_SIZE + lx] ?? 0);
          const grad = Math.hypot(gx, gy);
          gradSum += Math.min(grad, 2.0);
          if (grad >= edgePixelThreshold) edgePixels += 1;
        }
      }

      const meanGradient = gradSum / validPixels;
      const edgeDensity = edgePixels / validPixels;
      const hasProtectedMask = protectedCount > 0;

      let rate: VrsShadingRateCode;
      if (hasProtectedMask || edgeDensity >= highEdgeDensity || meanGradient >= highMeanGradient) {
        rate = VRS_RATE_1X1;
        rate1x1Count += 1;
      } else if (edgeDensity >= midEdgeDensity || meanGradient >= midMeanGradient) {
        rate = VRS_RATE_2X2;
        rate2x2Count += 1;
      } else {
        rate = VRS_RATE_4X4;
        rate4x4Count += 1;
      }

      if (hasProtectedMask) {
        protectedMaskTileCount += 1;
        if (rate === VRS_RATE_1X1) protectedMaskPreserved1x1Count += 1;
      }

      const divisor = rate === VRS_RATE_1X1 ? 1 : rate === VRS_RATE_2X2 ? 2 : 4;
      const tileInvocations = Math.ceil(tileW / divisor) * Math.ceil(tileH / divisor);
      shadedInvocations += tileInvocations;
      tileRates[ty * tilesX + tx] = rate;
      diagnostics.push({
        tileX: tx,
        tileY: ty,
        rate,
        meanGradient,
        edgeDensity,
        hasProtectedMask,
        shadedInvocations: tileInvocations,
      });
    }
  }

  const baselineInvocations = width * height;
  const invocationSavingsRatio =
    baselineInvocations > 0 ? (baselineInvocations - shadedInvocations) / baselineInvocations : 0;

  return {
    backend: "webgpu-compute-tile-vrs-cpu-reference",
    implementationNoteKo:
      "WebGPU 컴퓨트 16×16 타일 단위 가변 비율 셰이딩(Compute Tile-Level VRS) 분류 결과이며, 선화·말풍선·얼굴 보호 타일은 1×1 풀 레이트로 강제 보존됩니다.",
    width,
    height,
    tileSize: VRS_TILE_SIZE,
    tilesX,
    tilesY,
    totalTiles,
    tileRates,
    rate1x1Count,
    rate2x2Count,
    rate4x4Count,
    protectedMaskTileCount,
    protectedMaskPreserved1x1Count,
    baselineInvocations,
    shadedInvocations,
    invocationSavingsRatio,
    invocationSavingsPercent: invocationSavingsRatio * 100,
    diagnostics,
  };
}
