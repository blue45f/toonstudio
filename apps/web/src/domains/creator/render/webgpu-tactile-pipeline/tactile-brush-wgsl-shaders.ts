/**
 * WebGPU WGSL 극한 질감·임파스토·희소 타일 합성 Compute 셰이더 및 16-byte 정렬 Uniform 패커.
 *
 * - `TACTILE_PAPER_BRISTLE_COMPUTE_WGSL`: 64×64 타일링 종이 요철 + 필압 투과 + 분기 갈필 + 모세관 습윤 에지
 * - `IMPASTO_RELIEF_LIGHTING_WGSL`: 3×3 Sobel 법선 추출 + 45° 아틀리에 키/림 조명(Lambert + Blinn-Phong)
 * - `SPARSE_TILE_COMPOSITE_WGSL`: 256×256 희소 타일 Dirty-Rect 12종 블렌드(Normal~Add) + 선형광 sRGB 감마 보정
 */

import { MAX_TACTILE_TILE_DIMENSION, MAX_TACTILE_TILE_PIXELS, tactileUniformView } from "./webgpu-tactile-input-contract";

export const TACTILE_WORKGROUP_SIZE_X = 8;
export const TACTILE_WORKGROUP_SIZE_Y = 8;
export const TACTILE_WORKGROUP_SIZE_Z = 1;
export const PAPER_HEIGHTMAP_TILE_DIM = 64;
export const SPARSE_TILE_DIM = 256;

export const TACTILE_BRUSH_UNIFORM_SLOTS = 20;
export const TACTILE_BRUSH_UNIFORM_BYTES = TACTILE_BRUSH_UNIFORM_SLOTS * 4;
export const IMPASTO_RELIEF_UNIFORM_SLOTS = 16;
export const IMPASTO_RELIEF_UNIFORM_BYTES = IMPASTO_RELIEF_UNIFORM_SLOTS * 4;
export const SPARSE_TILE_COMPOSITE_UNIFORM_SLOTS = 12;
export const SPARSE_TILE_COMPOSITE_UNIFORM_BYTES = SPARSE_TILE_COMPOSITE_UNIFORM_SLOTS * 4;

/** 희소 타일 합성 12종 블렌드 모드(Normal=0 ~ Add=11). */
export const SPARSE_TILE_BLEND_MODES = [
  "normal", "multiply", "screen", "overlay",
  "darken", "lighten", "color-dodge", "color-burn",
  "hard-light", "soft-light", "difference", "add",
] as const;

export type SparseTileBlendMode = (typeof SPARSE_TILE_BLEND_MODES)[number];
export type TactileOutputStorageMode = "rgba16f-linear" | "rgba16f-and-rgba8";
// 기존 모드 이름을 유지한다. 아래 storage 배열의 실제 원소는 vec4<f32>이며 f16 저장을 검증한 것은 아니다.

export interface TactileBrushUniformInput {
  readonly width: number;
  readonly height: number;
  readonly tileOriginX?: number | undefined;
  readonly tileOriginY?: number | undefined;
  readonly pressure?: number | undefined;
  readonly paperToothDepth?: number | undefined;
  readonly pressurePenetration?: number | undefined;
  readonly bristleCount?: number | undefined;
  readonly bristleDryness?: number | undefined;
  readonly wetEdgePooling?: number | undefined;
  readonly strokeAngleRad?: number | undefined;
  readonly flowOpacity?: number | undefined;
  readonly pigmentR?: number | undefined;
  readonly pigmentG?: number | undefined;
  readonly pigmentB?: number | undefined;
  readonly pigmentA?: number | undefined;
  readonly outputMode?: TactileOutputStorageMode | undefined;
  readonly paperScale?: number | undefined;
}

export interface ImpastoReliefUniformInput {
  readonly width: number;
  readonly height: number;
  readonly reliefStrength?: number | undefined;
  readonly ambientLevel?: number | undefined;
  readonly keyAzimuthRad?: number | undefined;
  readonly keyElevationRad?: number | undefined;
  readonly keyIntensity?: number | undefined;
  readonly rimIntensity?: number | undefined;
  readonly specularStrength?: number | undefined;
  readonly specularShininess?: number | undefined;
  readonly heightThreshold?: number | undefined;
  readonly wetGlossBoost?: number | undefined;
  readonly rimAzimuthRad?: number | undefined;
  readonly rimElevationRad?: number | undefined;
}

export interface SparseTileCompositeUniformInput {
  readonly width: number;
  readonly height: number;
  readonly dirtyX?: number | undefined;
  readonly dirtyY?: number | undefined;
  readonly dirtyWidth?: number | undefined;
  readonly dirtyHeight?: number | undefined;
  readonly blendMode?: SparseTileBlendMode | undefined;
  readonly opacity?: number | undefined;
  readonly inputIsSrgb?: boolean | undefined;
  readonly outputToSrgb?: boolean | undefined;
}

export interface WgslBindingEntry {
  readonly group: number;
  readonly binding: number;
  readonly addressSpace: string;
  readonly name: string;
}

export interface WgslShaderContractOptions {
  readonly requireCompute?: boolean | undefined;
  readonly expectedWorkgroupSize?: readonly [number, number, number] | undefined;
  readonly requireBoundsGuard?: boolean | undefined;
}

export interface WgslShaderContractReport {
  readonly valid: boolean;
  readonly hasComputeEntry: boolean;
  readonly entryPoints: readonly string[];
  readonly workgroupSizes: readonly (readonly [number, number, number])[];
  readonly bindings: readonly WgslBindingEntry[];
  readonly duplicateBindings: readonly string[];
  readonly delimitersBalanced: boolean;
  readonly hasBoundsGuard: boolean;
  readonly hasUniformityViolationRisk: boolean;
  readonly uniformStructBytes: Readonly<Record<string, number>>;
  readonly issues: readonly string[];
}

/** 12종 블렌드 모드 이름을 결정적 WGSL u32 코드(0..11)로 변환한다. */
export function resolveSparseTileBlendModeCode(mode: SparseTileBlendMode): number {
  const index = SPARSE_TILE_BLEND_MODES.indexOf(mode);
  return index >= 0 ? index : 0;
}

/** 셰이더 1: 64×64 타일링 종이 요철 + 필압 투과 + 멀티-필라멘트 분기 갈필 + 모세관 습윤 에지 Compute. */
export const TACTILE_PAPER_BRISTLE_COMPUTE_WGSL = /* wgsl */ `
struct TactileBrushParams {
  width: u32, height: u32, tile_origin_x: u32, tile_origin_y: u32,
  pressure: f32, paper_tooth_depth: f32, pressure_penetration: f32, bristle_count: f32,
  bristle_dryness: f32, wet_edge_pooling: f32, stroke_angle_rad: f32, flow_opacity: f32,
  pigment_r: f32, pigment_g: f32, pigment_b: f32, pigment_a: f32,
  output_mode: u32, paper_scale: f32, pad_0: u32, pad_1: u32,
};

@group(0) @binding(0) var<uniform> params: TactileBrushParams;
@group(0) @binding(1) var<storage, read> paper_heightmap: array<f32>;
@group(0) @binding(2) var<storage, read> stroke_mask_in: array<f32>;
@group(0) @binding(3) var<storage, read_write> canvas_rgba_f32: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> canvas_rgba8_out: array<u32>;
@group(0) @binding(5) var<storage, read_write> paint_height_out: array<f32>;

fn safe_smoothstep(edge0: f32, edge1: f32, x: f32) -> f32 {
  let t = clamp((x - edge0) / max(edge1 - edge0, 1e-5), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

fn encode_linear_to_srgb_ch(lin: f32) -> f32 {
  let v = clamp(lin, 0.0, 1.0);
  if (v <= 0.0031308) { return v * 12.92; }
  return 1.055 * pow(v, 1.0 / 2.4) - 0.055;
}

fn pack_srgb_u32(col: vec4<f32>) -> u32 {
  let r8 = u32(floor(clamp(encode_linear_to_srgb_ch(col.x), 0.0, 1.0) * 255.0 + 0.5));
  let g8 = u32(floor(clamp(encode_linear_to_srgb_ch(col.y), 0.0, 1.0) * 255.0 + 0.5));
  let b8 = u32(floor(clamp(encode_linear_to_srgb_ch(col.z), 0.0, 1.0) * 255.0 + 0.5));
  let a8 = u32(floor(clamp(col.w, 0.0, 1.0) * 255.0 + 0.5));
  return r8 | (g8 << 8u) | (b8 << 16u) | (a8 << 24u);
}

@compute @workgroup_size(8, 8, 1)
fn tactile_paper_bristle_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) { return; }
  if (params.width > ${MAX_TACTILE_TILE_DIMENSION}u || params.height > ${MAX_TACTILE_TILE_DIMENSION}u) { return; }
  if (params.width > ${MAX_TACTILE_TILE_PIXELS}u / params.height) { return; }
  let pixel_count = params.width * params.height;
  if (arrayLength(&paper_heightmap) < 4096u || arrayLength(&stroke_mask_in) < pixel_count || arrayLength(&canvas_rgba_f32) < pixel_count || arrayLength(&paint_height_out) < pixel_count) { return; }
  if (params.output_mode == 1u && arrayLength(&canvas_rgba8_out) < pixel_count) { return; }

  let idx = gid.y * params.width + gid.x;
  let mask = clamp(stroke_mask_in[idx], 0.0, 1.0);
  if (mask <= 1e-6) { return; }

  let wx = params.tile_origin_x + gid.x;
  let wy = params.tile_origin_y + gid.y;
  let scale = max(params.paper_scale, 0.25);
  let px = u32(floor(f32(wx) * scale)) & 63u;
  let py = u32(floor(f32(wy) * scale)) & 63u;
  let paper_h = clamp(paper_heightmap[py * 64u + px], 0.0, 1.0);

  let pressure = clamp(params.pressure, 0.0, 1.0);
  let tooth_depth = clamp(params.paper_tooth_depth, 0.0, 1.0);
  let penetration = clamp(params.pressure_penetration, 0.0, 1.0);
  let base_threshold = (1.0 - clamp(pressure * penetration, 0.0, 1.0)) * tooth_depth;
  let feather = max(0.08, 0.22 * (1.0 - pressure * 0.5));
  let paper_mod = mix(1.0, safe_smoothstep(base_threshold - feather, base_threshold + feather, paper_h), tooth_depth);

  let fx = f32(wx);
  let fy = f32(wy);
  let ca = cos(params.stroke_angle_rad);
  let sa = sin(params.stroke_angle_rad);
  let along = fx * ca + fy * sa;
  let across = -fx * sa + fy * ca;
  let filament_phase = across * max(params.bristle_count, 1.0) * 0.31415927;
  let bristle_field = clamp(
    (0.5 + 0.5 * sin(filament_phase + paper_h * 2.4)) * 0.65 +
    (0.5 + 0.5 * sin(filament_phase * 2.17 + along * 0.09)) * 0.35,
    0.0, 1.0,
  );
  let dryness = clamp(params.bristle_dryness, 0.0, 1.0);
  let dry_cut = clamp(dryness * (1.0 - pressure * 0.45), 0.0, 0.95);
  let bristle_mod = mix(1.0, safe_smoothstep(dry_cut * 0.7, dry_cut * 0.7 + 0.28, bristle_field), dryness);

  let wet_pool = clamp(params.wet_edge_pooling, 0.0, 1.0);
  let rim_band = 4.0 * mask * (1.0 - mask);
  let capillary_boost = 1.0 + wet_pool * rim_band * (0.45 + 0.55 * (1.0 - paper_h));
  let edge_darken = 1.0 - wet_pool * rim_band * 0.22;

  let src_a = clamp(
    mask * clamp(params.flow_opacity, 0.0, 1.0) * clamp(params.pigment_a, 0.0, 1.0) * paper_mod * bristle_mod * capillary_boost,
    0.0, 1.0,
  );
  let src_col = vec3<f32>(params.pigment_r, params.pigment_g, params.pigment_b) * edge_darken;
  let dst = canvas_rgba_f32[idx];
  let dst_a = clamp(dst.w, 0.0, 1.0);
  let out_a = src_a + dst_a * (1.0 - src_a);
  var out_col: vec3<f32> = vec3<f32>(0.0);
  if (out_a > 1e-6) { out_col = (src_col * src_a + dst.xyz * dst_a * (1.0 - src_a)) / out_a; }
  let final_px = vec4<f32>(out_col, out_a);
  canvas_rgba_f32[idx] = final_px;
  paint_height_out[idx] = clamp(paint_height_out[idx] + src_a * (0.35 + 0.65 * pressure), 0.0, 4.0);
  if (params.output_mode == 1u) { canvas_rgba8_out[idx] = pack_srgb_u32(final_px); }
}
`;

/** 셰이더 2: 물감 높이맵 3×3 Sobel 법선 + 45° 아틀리에 키/림 조명(Lambert + Blinn-Phong) Compute. */
export const IMPASTO_RELIEF_LIGHTING_WGSL = /* wgsl */ `
struct ImpastoReliefParams {
  width: u32, height: u32, relief_strength: f32, ambient_level: f32,
  key_azimuth_rad: f32, key_elevation_rad: f32, key_intensity: f32, rim_intensity: f32,
  specular_strength: f32, specular_shininess: f32, height_threshold: f32, wet_gloss_boost: f32,
  rim_azimuth_rad: f32, rim_elevation_rad: f32, pad_0: f32, pad_1: f32,
};

@group(0) @binding(0) var<uniform> params: ImpastoReliefParams;
@group(0) @binding(1) var<storage, read> height_in: array<f32>;
@group(0) @binding(2) var<storage, read> color_in: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> color_out: array<vec4<f32>>;

fn sample_height_clamped(sx: i32, sy: i32, w: u32, h: u32) -> f32 {
  let cx = u32(clamp(sx, 0, max(i32(w) - 1, 0)));
  let cy = u32(clamp(sy, 0, max(i32(h) - 1, 0)));
  return height_in[cy * w + cx];
}

fn light_dir_from_angles(az: f32, el: f32) -> vec3<f32> {
  let cos_el = cos(el);
  return normalize(vec3<f32>(cos(az) * cos_el, sin(az) * cos_el, sin(el)));
}

@compute @workgroup_size(8, 8, 1)
fn impasto_relief_lighting_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) { return; }
  if (params.width > ${MAX_TACTILE_TILE_DIMENSION}u || params.height > ${MAX_TACTILE_TILE_DIMENSION}u) { return; }
  if (params.width > ${MAX_TACTILE_TILE_PIXELS}u / params.height) { return; }
  let pixel_count = params.width * params.height;
  if (arrayLength(&height_in) < pixel_count || arrayLength(&color_in) < pixel_count || arrayLength(&color_out) < pixel_count) { return; }

  let idx = gid.y * params.width + gid.x;
  let base_color = color_in[idx];
  let hc = height_in[idx];
  let relief_weight = clamp((hc - params.height_threshold) / 0.05, 0.0, 1.0);
  if (relief_weight <= 1e-6) { color_out[idx] = base_color; return; }

  let ix = i32(gid.x);
  let iy = i32(gid.y);
  let h_tl = sample_height_clamped(ix - 1, iy - 1, params.width, params.height);
  let h_tm = sample_height_clamped(ix, iy - 1, params.width, params.height);
  let h_tr = sample_height_clamped(ix + 1, iy - 1, params.width, params.height);
  let h_ml = sample_height_clamped(ix - 1, iy, params.width, params.height);
  let h_mr = sample_height_clamped(ix + 1, iy, params.width, params.height);
  let h_bl = sample_height_clamped(ix - 1, iy + 1, params.width, params.height);
  let h_bm = sample_height_clamped(ix, iy + 1, params.width, params.height);
  let h_br = sample_height_clamped(ix + 1, iy + 1, params.width, params.height);

  let gx = (h_tr + 2.0 * h_mr + h_br) - (h_tl + 2.0 * h_ml + h_bl);
  let gy = (h_bl + 2.0 * h_bm + h_br) - (h_tl + 2.0 * h_tm + h_tr);
  let normal = normalize(vec3<f32>(-gx * params.relief_strength, -gy * params.relief_strength, 1.0));

  let key_dir = light_dir_from_angles(params.key_azimuth_rad, params.key_elevation_rad);
  let rim_dir = light_dir_from_angles(params.rim_azimuth_rad, params.rim_elevation_rad);
  let ndotl_key = max(dot(normal, key_dir), 0.0);
  let ndotl_rim = max(dot(normal, rim_dir), 0.0);
  let diffuse_raw = params.ambient_level + (ndotl_key - key_dir.z) * params.key_intensity + (ndotl_rim - rim_dir.z) * params.rim_intensity * 0.25;
  let shade = mix(1.0, clamp(diffuse_raw, 0.25, 1.65), relief_weight);

  let half_key = normalize(key_dir + vec3<f32>(0.0, 0.0, 1.0));
  let spec_key = pow(max(dot(normal, half_key), 0.0), max(params.specular_shininess, 1.0)) * params.specular_strength * (1.0 + params.wet_gloss_boost * clamp(hc, 0.0, 1.0));
  let slope_mag = clamp(length(vec2<f32>(normal.x, normal.y)), 0.0, 1.0);
  let rim_sheen = pow(slope_mag, 1.5) * ndotl_rim * params.rim_intensity * 0.2;
  let lit_xyz = clamp(base_color.xyz * shade + vec3<f32>((spec_key + rim_sheen) * relief_weight), vec3<f32>(0.0), vec3<f32>(4.0));
  color_out[idx] = vec4<f32>(lit_xyz, base_color.w);
}
`;

/** 셰이더 3: 256×256 희소 타일 Dirty-Rect 12종 블렌드(Normal~Add) + 선형광 sRGB 감마 보정 Compute. */
export const SPARSE_TILE_COMPOSITE_WGSL = /* wgsl */ `
struct SparseTileCompositeParams {
  width: u32, height: u32, dirty_x: u32, dirty_y: u32,
  dirty_width: u32, dirty_height: u32, blend_mode: u32, opacity: f32,
  input_is_srgb: u32, output_to_srgb: u32, pad_0: u32, pad_1: u32,
};

@group(0) @binding(0) var<uniform> params: SparseTileCompositeParams;
@group(0) @binding(1) var<storage, read> src_tile: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> dst_tile: array<vec4<f32>>;

fn srgb_to_linear_ch(s: f32) -> f32 {
  let v = clamp(s, 0.0, 1.0);
  if (v <= 0.04045) { return v / 12.92; }
  return pow((v + 0.055) / 1.055, 2.4);
}

fn linear_to_srgb_ch(lin: f32) -> f32 {
  let v = clamp(lin, 0.0, 1.0);
  if (v <= 0.0031308) { return v * 12.92; }
  return 1.055 * pow(v, 1.0 / 2.4) - 0.055;
}

fn blend_channel(d: f32, s: f32, mode: u32) -> f32 {
  if (mode == 1u) { return d * s; }
  if (mode == 2u) { return 1.0 - (1.0 - d) * (1.0 - s); }
  if (mode == 3u) { if (d < 0.5) { return 2.0 * d * s; } return 1.0 - 2.0 * (1.0 - d) * (1.0 - s); }
  if (mode == 4u) { return min(d, s); }
  if (mode == 5u) { return max(d, s); }
  if (mode == 6u) { if (d <= 0.0) { return 0.0; } if (s >= 0.9999) { return 1.0; } return min(1.0, d / max(1.0 - s, 1e-4)); }
  if (mode == 7u) { if (d >= 1.0) { return 1.0; } if (s <= 0.0001) { return 0.0; } return 1.0 - min(1.0, (1.0 - d) / max(s, 1e-4)); }
  if (mode == 8u) { if (s < 0.5) { return 2.0 * d * s; } return 1.0 - 2.0 * (1.0 - d) * (1.0 - s); }
  if (mode == 9u) {
    if (s <= 0.5) { return d - (1.0 - 2.0 * s) * d * (1.0 - d); }
    var g: f32 = 0.0;
    if (d <= 0.25) { g = ((16.0 * d - 12.0) * d + 4.0) * d; } else { g = sqrt(max(d, 0.0)); }
    return d + (2.0 * s - 1.0) * (g - d);
  }
  if (mode == 10u) { return abs(d - s); }
  if (mode == 11u) { return d + s; }
  return s;
}

@compute @workgroup_size(8, 8, 1)
fn sparse_tile_composite_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) { return; }
  if (params.width > ${MAX_TACTILE_TILE_DIMENSION}u || params.height > ${MAX_TACTILE_TILE_DIMENSION}u) { return; }
  if (params.width > ${MAX_TACTILE_TILE_PIXELS}u / params.height) { return; }
  let pixel_count = params.width * params.height;
  if (arrayLength(&src_tile) < pixel_count || arrayLength(&dst_tile) < pixel_count) { return; }
  let dirty_x = min(params.dirty_x, params.width);
  let dirty_y = min(params.dirty_y, params.height);
  let dirty_width = min(params.dirty_width, params.width - dirty_x);
  let dirty_height = min(params.dirty_height, params.height - dirty_y);
  if (gid.x < dirty_x || gid.y < dirty_y || gid.x >= dirty_x + dirty_width || gid.y >= dirty_y + dirty_height) { return; }

  let idx = gid.y * params.width + gid.x;
  let raw_src = src_tile[idx];
  let raw_dst = dst_tile[idx];
  let sa = clamp(raw_src.w * clamp(params.opacity, 0.0, 1.0), 0.0, 1.0);
  let da = clamp(raw_dst.w, 0.0, 1.0);

  var src_lin = max(raw_src.xyz, vec3<f32>(0.0));
  var dst_lin = max(raw_dst.xyz, vec3<f32>(0.0));
  if (params.input_is_srgb == 1u) {
    src_lin = vec3<f32>(srgb_to_linear_ch(src_lin.x), srgb_to_linear_ch(src_lin.y), srgb_to_linear_ch(src_lin.z));
    dst_lin = vec3<f32>(srgb_to_linear_ch(dst_lin.x), srgb_to_linear_ch(dst_lin.y), srgb_to_linear_ch(dst_lin.z));
  }

  let out_a = clamp(sa + da * (1.0 - sa), 0.0, 1.0);
  if (out_a <= 1e-6) { dst_tile[idx] = vec4<f32>(0.0); return; }

  var out_lin = vec3<f32>(0.0);
  if (params.blend_mode == 11u) {
    out_lin = (dst_lin * da + src_lin * sa) / out_a;
  } else {
    let dc = clamp(dst_lin, vec3<f32>(0.0), vec3<f32>(1.0));
    let sc = clamp(src_lin, vec3<f32>(0.0), vec3<f32>(1.0));
    let blended = vec3<f32>(
      blend_channel(dc.x, sc.x, params.blend_mode),
      blend_channel(dc.y, sc.y, params.blend_mode),
      blend_channel(dc.z, sc.z, params.blend_mode),
    );
    out_lin = (src_lin * sa * (1.0 - da) + dst_lin * da * (1.0 - sa) + blended * sa * da) / out_a;
  }

  var final_xyz = out_lin;
  if (params.output_to_srgb == 1u) {
    final_xyz = vec3<f32>(linear_to_srgb_ch(out_lin.x), linear_to_srgb_ch(out_lin.y), linear_to_srgb_ch(out_lin.z));
  }
  dst_tile[idx] = vec4<f32>(final_xyz, out_a);
}
`;

function clampFinite(value: number | undefined, fallback: number, minVal: number, maxVal: number): number {
  const numeric = value === undefined || !Number.isFinite(value) ? fallback : value;
  return Math.min(maxVal, Math.max(minVal, numeric));
}

function clampUint32(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) ? fallback : Math.min(4294967295, Math.max(0, Math.floor(value)));
}

function allocateAlignedView(byteLength: number, targetBuffer?: ArrayBuffer, byteOffset = 0) {
  return tactileUniformView(byteLength, targetBuffer, byteOffset);
}

/** `TactileBrushParams` 16-byte 정렬(80B) uniform 버퍼를 결정적으로 패킹한다. */
export function packTactileBrushUniforms(
  input: TactileBrushUniformInput,
  targetBuffer?: ArrayBuffer,
  byteOffset = 0,
): ArrayBuffer {
  const { buffer, view } = allocateAlignedView(TACTILE_BRUSH_UNIFORM_BYTES, targetBuffer, byteOffset);
  view.setUint32(0, clampUint32(input.width, SPARSE_TILE_DIM), true);
  view.setUint32(4, clampUint32(input.height, SPARSE_TILE_DIM), true);
  view.setUint32(8, clampUint32(input.tileOriginX, 0), true);
  view.setUint32(12, clampUint32(input.tileOriginY, 0), true);
  view.setFloat32(16, clampFinite(input.pressure, 0.65, 0, 1), true);
  view.setFloat32(20, clampFinite(input.paperToothDepth, 0.55, 0, 1), true);
  view.setFloat32(24, clampFinite(input.pressurePenetration, 0.8, 0, 1), true);
  view.setFloat32(28, clampFinite(input.bristleCount, 12, 1, 128), true);
  view.setFloat32(32, clampFinite(input.bristleDryness, 0.35, 0, 1), true);
  view.setFloat32(36, clampFinite(input.wetEdgePooling, 0.4, 0, 1), true);
  view.setFloat32(40, clampFinite(input.strokeAngleRad, 0, -Math.PI * 4, Math.PI * 4), true);
  view.setFloat32(44, clampFinite(input.flowOpacity, 0.85, 0, 1), true);
  view.setFloat32(48, clampFinite(input.pigmentR, 0.1, 0, 4), true);
  view.setFloat32(52, clampFinite(input.pigmentG, 0.1, 0, 4), true);
  view.setFloat32(56, clampFinite(input.pigmentB, 0.1, 0, 4), true);
  view.setFloat32(60, clampFinite(input.pigmentA, 1, 0, 1), true);
  view.setUint32(64, input.outputMode === "rgba16f-linear" ? 0 : 1, true);
  view.setFloat32(68, clampFinite(input.paperScale, 1, 0.25, 16), true);
  view.setUint32(72, 0, true);
  view.setUint32(76, 0, true);
  return buffer;
}

/** `ImpastoReliefParams` 16-byte 정렬(64B) uniform 버퍼를 결정적으로 패킹한다. */
export function packImpastoUniforms(
  input: ImpastoReliefUniformInput,
  targetBuffer?: ArrayBuffer,
  byteOffset = 0,
): ArrayBuffer {
  const { buffer, view } = allocateAlignedView(IMPASTO_RELIEF_UNIFORM_BYTES, targetBuffer, byteOffset);
  view.setUint32(0, clampUint32(input.width, SPARSE_TILE_DIM), true);
  view.setUint32(4, clampUint32(input.height, SPARSE_TILE_DIM), true);
  view.setFloat32(8, clampFinite(input.reliefStrength, 2.2, 0, 16), true);
  view.setFloat32(12, clampFinite(input.ambientLevel, 1, 0.2, 1.5), true);
  view.setFloat32(16, clampFinite(input.keyAzimuthRad, Math.PI / 4, -Math.PI * 2, Math.PI * 2), true);
  view.setFloat32(20, clampFinite(input.keyElevationRad, Math.PI / 4, 0.05, Math.PI / 2), true);
  view.setFloat32(24, clampFinite(input.keyIntensity, 0.75, 0, 2), true);
  view.setFloat32(28, clampFinite(input.rimIntensity, 0.15, 0, 2), true);
  view.setFloat32(32, clampFinite(input.specularStrength, 0.32, 0, 2), true);
  view.setFloat32(36, clampFinite(input.specularShininess, 24, 1, 256), true);
  view.setFloat32(40, clampFinite(input.heightThreshold, 0.01, 0, 1), true);
  view.setFloat32(44, clampFinite(input.wetGlossBoost, 0.35, 0, 2), true);
  view.setFloat32(48, clampFinite(input.rimAzimuthRad, (5 * Math.PI) / 4, -Math.PI * 2, Math.PI * 2), true);
  view.setFloat32(52, clampFinite(input.rimElevationRad, Math.PI / 6, 0.05, Math.PI / 2), true);
  view.setFloat32(56, 0, true);
  view.setFloat32(60, 0, true);
  return buffer;
}

/** `SparseTileCompositeParams` 16-byte 정렬(48B) uniform 버퍼를 결정적으로 패킹한다. */
export function packTileCompositeUniforms(
  input: SparseTileCompositeUniformInput,
  targetBuffer?: ArrayBuffer,
  byteOffset = 0,
): ArrayBuffer {
  const { buffer, view } = allocateAlignedView(SPARSE_TILE_COMPOSITE_UNIFORM_BYTES, targetBuffer, byteOffset);
  const width = clampUint32(input.width, SPARSE_TILE_DIM);
  const height = clampUint32(input.height, SPARSE_TILE_DIM);
  const dirtyX = Math.min(width, clampUint32(input.dirtyX, 0));
  const dirtyY = Math.min(height, clampUint32(input.dirtyY, 0));
  const dirtyWidth = Math.min(width - dirtyX, clampUint32(input.dirtyWidth, width - dirtyX));
  const dirtyHeight = Math.min(height - dirtyY, clampUint32(input.dirtyHeight, height - dirtyY));

  view.setUint32(0, width, true);
  view.setUint32(4, height, true);
  view.setUint32(8, dirtyX, true);
  view.setUint32(12, dirtyY, true);
  view.setUint32(16, dirtyWidth, true);
  view.setUint32(20, dirtyHeight, true);
  view.setUint32(24, resolveSparseTileBlendModeCode(input.blendMode ?? "normal"), true);
  view.setFloat32(28, clampFinite(input.opacity, 1, 0, 1), true);
  view.setUint32(32, input.inputIsSrgb === false ? 0 : 1, true);
  view.setUint32(36, input.outputToSrgb === false ? 0 : 1, true);
  view.setUint32(40, 0, true);
  view.setUint32(44, 0, true);
  return buffer;
}

function checkBalancedDelimiters(code: string): boolean {
  const stack: string[] = [];
  const pairs: Readonly<Record<string, string>> = { ")": "(", "}": "{", "]": "[" };
  for (let i = 0; i < code.length; i += 1) {
    const ch = code[i] ?? "";
    if (ch === "(" || ch === "{" || ch === "[") stack.push(ch);
    else if (ch === ")" || ch === "}" || ch === "]") {
      if (stack.pop() !== pairs[ch]) return false;
    }
  }
  return stack.length === 0;
}

function measureUniformStructs(code: string): Record<string, number> {
  const result: Record<string, number> = {};
  const uniformNames = new Set<string>();
  for (const m of code.matchAll(/var<uniform>\s+[A-Za-z_]\w*\s*:\s*([A-Za-z_]\w*)/gu)) {
    if (m[1]) uniformNames.add(m[1]);
  }
  for (const m of code.matchAll(/struct\s+([A-Za-z_]\w*)\s*\{([^}]*)\}/gu)) {
    const name = m[1];
    const body = m[2];
    if (!name || !body || !uniformNames.has(name)) continue;
    let bytes = 0;
    for (const rawField of body.split(",")) {
      const f = rawField.trim();
      if (!f) continue;
      if (/:\s*vec[34]<[^>]+>/u.test(f)) bytes += 16;
      else if (/:\s*vec2<[^>]+>/u.test(f)) bytes += 8;
      else if (/:\s*(?:u32|i32|f32)\b/u.test(f)) bytes += 4;
    }
    result[name] = bytes;
  }
  return result;
}

/**
 * WGSL Compute 셰이더 정적 구조 검증기:
 * `@compute`, `@workgroup_size`, 바인딩 중복 금지, 괄호 균형, 경계 가드, uniformity 위험, 16-byte 정렬 검증.
 */
export function validateWgslShaderContract(
  wgslSource: string,
  options?: WgslShaderContractOptions,
): WgslShaderContractReport {
  const requireCompute = options?.requireCompute ?? true;
  const requireBoundsGuard = options?.requireBoundsGuard ?? true;
  const code = wgslSource.replace(/\/\*[\s\S]*?\*\//gu, " ").replace(/\/\/[^\n]*/gu, " ");
  const issues: string[] = [];

  const delimitersBalanced = checkBalancedDelimiters(code);
  if (!delimitersBalanced) issues.push("WGSL 괄호((), {}, []) 균형이 맞지 않습니다.");

  const entryPoints: string[] = [];
  const workgroupSizes: (readonly [number, number, number])[] = [];
  for (const m of code.matchAll(/@compute[\s\S]{0,160}?@workgroup_size\(\s*(\d+)(?:\s*,\s*(\d+))?(?:\s*,\s*(\d+))?\s*\)\s*fn\s+([A-Za-z_]\w*)/gu)) {
    const wx = Number(m[1] ?? 0);
    const wy = Number(m[2] ?? 1);
    const wz = Number(m[3] ?? 1);
    entryPoints.push(m[4] ?? "");
    workgroupSizes.push([wx, wy, wz] as const);
    if (wx < 1 || wy < 1 || wz < 1 || wx * wy * wz > 256) {
      issues.push(`유효하지 않은 @workgroup_size(${wx}, ${wy}, ${wz}) 선언입니다.`);
    }
  }

  const hasComputeEntry = entryPoints.length > 0;
  if (requireCompute && !hasComputeEntry) issues.push("@compute @workgroup_size(...) 진입점이 누락되었습니다.");
  if (options?.expectedWorkgroupSize && workgroupSizes.length > 0) {
    const [ex, ey, ez] = options.expectedWorkgroupSize;
    if (!workgroupSizes.every(([x, y, z]) => x === ex && y === ey && z === ez)) {
      issues.push(`기대한 @workgroup_size(${ex}, ${ey}, ${ez})와 일치하지 않습니다.`);
    }
  }

  const bindings: WgslBindingEntry[] = [];
  const seenKeys = new Set<string>();
  const duplicateBindings: string[] = [];
  for (const m of code.matchAll(/@group\(\s*(\d+)\s*\)\s*@binding\(\s*(\d+)\s*\)\s*var<([^>]+)>\s*([A-Za-z_]\w*)/gu)) {
    const group = Number(m[1]);
    const binding = Number(m[2]);
    const key = `${group}:${binding}`;
    if (seenKeys.has(key)) duplicateBindings.push(key);
    else seenKeys.add(key);
    bindings.push({ group, binding, addressSpace: (m[3] ?? "").trim(), name: m[4] ?? "" });
  }
  if (duplicateBindings.length > 0) issues.push(`중복된 @group/@binding 선언 발견: ${duplicateBindings.join(", ")}`);

  const gidName = code.match(/@builtin\(\s*global_invocation_id\s*\)\s*([A-Za-z_]\w*)/u)?.[1] ?? "gid";
  const hasBoundsGuard = new RegExp(
    `if\\s*\\(\\s*${gidName}\\.x\\s*>=\\s*[^|]+\\|\\|\\s*${gidName}\\.y\\s*>=\\s*[^)]+\\)\\s*\\{\\s*return\\s*;\\s*\\}`,
    "u",
  ).test(code);
  if (requireBoundsGuard && !hasBoundsGuard) {
    issues.push(`경계 가드 if (${gidName}.x >= ... || ${gidName}.y >= ...) { return; }가 누락되었습니다.`);
  }

  const hasUniformityViolationRisk = /\b(?:workgroupBarrier|storageBarrier|textureBarrier)\s*\(/u.test(code) && hasBoundsGuard;
  if (hasUniformityViolationRisk) issues.push("비균일 경계 return 이후 배리어 호출은 WGSL uniformity 위반 위험이 있습니다.");
  if (/\b(?:meta|active|filter)\b/u.test(code)) issues.push("Chromium WGSL 예약어(meta/active/filter)가 식별자로 포함되었습니다.");

  const uniformStructBytes = measureUniformStructs(code);
  for (const [name, bytes] of Object.entries(uniformStructBytes)) {
    if (bytes === 0 || bytes % 16 !== 0) issues.push(`Uniform 구조체 ${name} 크기(${bytes}B)가 16바이트 정렬이 아닙니다.`);
  }

  return Object.freeze({
    valid: issues.length === 0,
    hasComputeEntry,
    entryPoints: Object.freeze(entryPoints),
    workgroupSizes: Object.freeze(workgroupSizes),
    bindings: Object.freeze(bindings),
    duplicateBindings: Object.freeze(duplicateBindings),
    delimitersBalanced,
    hasBoundsGuard,
    hasUniformityViolationRisk,
    uniformStructBytes: Object.freeze(uniformStructBytes),
    issues: Object.freeze(issues),
  });
}
