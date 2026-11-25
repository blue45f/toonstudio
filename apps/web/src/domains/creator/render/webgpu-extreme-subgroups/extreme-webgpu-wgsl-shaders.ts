/**
 * 2025~2026 극한 WebGPU WGSL 셰이더 번들 + 16-byte 정렬 Uniform 패커 + 정적 계약 검증기.
 *
 * - `SUBGROUP_PREFIX_SUM_TILE_BIN_WGSL`: `enable subgroups;` 워프 레지스터 전용 Prefix-Sum 타일 빈닝
 * - `STANDARD_PREFIX_SUM_TILE_BIN_WGSL`: 미지원 GPU용 표준 `workgroupBarrier` Blelloch 폴백
 * - `F16_SPECTRAL_KM7_BRUSH_WGSL`: `enable f16;` (`shader-f16`) 7밴드 Kubelka-Munk 분광 혼색 (대역폭 50% 절감)
 * - `F32_SPECTRAL_KM7_BRUSH_WGSL`: 미지원 GPU용 `f32` 7밴드 Kubelka-Munk 폴백
 * - `VELLO_SPARSE_STRIP_RASTER_WGSL`: Vello Sparse Strips(4×4/8×8) 커버리지 누적 Compute + `fwidth` AA Fragment
 */

export const SUBGROUP_TILE_WORKGROUP_SIZE_X = 64 as const;
export const SPECTRAL_KM7_WORKGROUP_SIZE_X = 8 as const;
export const SPECTRAL_KM7_WORKGROUP_SIZE_Y = 8 as const;
export const SPARSE_STRIP_WORKGROUP_SIZE_X = 8 as const;
export const SPARSE_STRIP_WORKGROUP_SIZE_Y = 8 as const;
export const SPARSE_STRIP_HEIGHT_4 = 4 as const;
export const SPARSE_STRIP_HEIGHT_8 = 8 as const;
export type SparseStripHeightPx = typeof SPARSE_STRIP_HEIGHT_4 | typeof SPARSE_STRIP_HEIGHT_8;

/** 16-byte 정렬 Uniform 바이트 크기 계약(32B / 64B / 48B). */
export const TILE_BIN_PREFIX_UNIFORM_BYTES = 32 as const;
export const SPECTRAL_KM7_UNIFORM_BYTES = 64 as const;
export const SPARSE_STRIP_UNIFORM_BYTES = 48 as const;
/** `f16` 역공식 오버플로 방지 하한(`K/S <= 124h`) 및 `f32` 표준 하한. */
export const KM7_F16_REFLECTANCE_FLOOR = 0.004 as const;
export const KM7_F32_REFLECTANCE_FLOOR = 0.002 as const;

export const EXTREME_WGSL_RESERVED_IDENTIFIERS = [
  "meta", "active", "filter", "common", "target", "self", "type", "using", "null", "abstract", "class", "mut", "ref", "smooth",
] as const;

const TILE_BIN_PREFIX_BINDINGS_WGSL = /* wgsl */ `
struct TileBinPrefixParams {
  tile_count: u32, tiles_x: u32, tiles_y: u32, tile_dim_px: u32,
  workgroup_count: u32, pad_0: u32, pad_1: u32, pad_2: u32,
};
@group(0) @binding(0) var<uniform> params: TileBinPrefixParams;
@group(0) @binding(1) var<storage, read> tile_counts_in: array<u32>;
@group(0) @binding(2) var<storage, read_write> tile_offsets_out: array<u32>;
@group(0) @binding(3) var<storage, read_write> workgroup_totals_out: array<u32>;`;

/** 셰이더 1A: `enable subgroups;` 워프 레지스터 전용 2D 타일 빈닝 Exclusive Prefix-Sum. */
export const SUBGROUP_PREFIX_SUM_TILE_BIN_WGSL = /* wgsl */ `
enable subgroups;
${TILE_BIN_PREFIX_BINDINGS_WGSL}
var<workgroup> sg_totals: array<u32, 16>;

@compute @workgroup_size(64, 1, 1)
fn subgroup_prefix_sum_tile_bin_main(
  @builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>,
  @builtin(workgroup_id) wid: vec3<u32>, @builtin(subgroup_invocation_id) sg_lane: u32, @builtin(subgroup_size) sg_size: u32,
) {
  let idx = gid.x;
  let safe_tiles_x = max(params.tiles_x, 1u);
  let in_bounds = idx < params.tile_count && (idx % safe_tiles_x) < params.tiles_x && (idx / safe_tiles_x) < params.tiles_y;
  var tile_val: u32 = 0u;
  if (in_bounds) { tile_val = tile_counts_in[idx]; }

  let lane_prefix = subgroupExclusiveAdd(tile_val);
  let sg_sum = subgroupAdd(tile_val);
  let sg_total_bcast = subgroupBroadcast(sg_sum, 0u);

  let safe_sg_size = max(sg_size, 4u);
  let sg_idx = lid.x / safe_sg_size;
  let num_sg = min((64u + safe_sg_size - 1u) / safe_sg_size, 16u);
  if (sg_lane == 0u && sg_idx < 16u) { sg_totals[sg_idx] = sg_total_bcast; }
  workgroupBarrier();

  var sg_offset: u32 = 0u;
  for (var s: u32 = 0u; s < sg_idx; s = s + 1u) { sg_offset = sg_offset + sg_totals[s]; }
  if (in_bounds) { tile_offsets_out[idx] = sg_offset + lane_prefix; }
  if (lid.x == 0u && wid.x < params.workgroup_count) {
    var wg_sum: u32 = 0u;
    for (var s: u32 = 0u; s < num_sg; s = s + 1u) { wg_sum = wg_sum + sg_totals[s]; }
    workgroup_totals_out[wid.x] = wg_sum;
  }
}
`;

/** 셰이더 1B: `subgroups` 미지원 GPU용 표준 Blelloch `workgroupBarrier` 폴백 셰이더. */
export const STANDARD_PREFIX_SUM_TILE_BIN_WGSL = /* wgsl */ `
${TILE_BIN_PREFIX_BINDINGS_WGSL}
var<workgroup> shared_scan: array<u32, 64>;

@compute @workgroup_size(64, 1, 1)
fn standard_prefix_sum_tile_bin_main(
  @builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(workgroup_id) wid: vec3<u32>,
) {
  let idx = gid.x;
  let tid = lid.x;
  let safe_tiles_x = max(params.tiles_x, 1u);
  let in_bounds = idx < params.tile_count && (idx % safe_tiles_x) < params.tiles_x && (idx / safe_tiles_x) < params.tiles_y;
  var tile_val: u32 = 0u;
  if (in_bounds) { tile_val = tile_counts_in[idx]; }
  shared_scan[tid] = tile_val;

  var offset: u32 = 1u;
  for (var d: u32 = 32u; d > 0u; d = d >> 1u) {
    workgroupBarrier();
    if (tid < d) {
      let ai = offset * (2u * tid + 1u) - 1u;
      let bi = offset * (2u * tid + 2u) - 1u;
      shared_scan[bi] = shared_scan[bi] + shared_scan[ai];
    }
    offset = offset << 1u;
  }
  workgroupBarrier();
  if (tid == 0u) {
    if (wid.x < params.workgroup_count) { workgroup_totals_out[wid.x] = shared_scan[63u]; }
    shared_scan[63u] = 0u;
  }
  for (var d: u32 = 1u; d < 64u; d = d << 1u) {
    offset = offset >> 1u;
    workgroupBarrier();
    if (tid < d) {
      let ai = offset * (2u * tid + 1u) - 1u;
      let bi = offset * (2u * tid + 2u) - 1u;
      let prev_left = shared_scan[ai];
      shared_scan[ai] = shared_scan[bi];
      shared_scan[bi] = shared_scan[bi] + prev_left;
    }
  }
  workgroupBarrier();
  if (in_bounds) { tile_offsets_out[idx] = shared_scan[tid]; }
}
`;

function buildSpectralKm7BrushWgsl(mode: "f16" | "f32"): string {
  const isF16 = mode === "f16";
  const T = isF16 ? "f16" : "f32";
  const L = (v: string): string => (isF16 ? `${v}h` : v);
  const cast = (expr: string): string => (isF16 ? `f16(${expr})` : expr);
  const fl = isF16 ? "0.004h" : "0.002";
  const eps = isF16 ? "0.0005h" : "1e-6";
  const aFl = isF16 ? "0.001h" : "1e-6";

  return /* wgsl */ `${isF16 ? "enable f16;\n" : ""}
struct SpectralKm7BrushParams {
  width: u32, height: u32, precision_mode: u32, pad_0: u32,
  pigment_r: f32, pigment_g: f32, pigment_b: f32, pigment_a: f32,
  flow_opacity: f32, mix_strength: f32, tint_canvas: f32, tint_brush: f32,
  conc_gamma: f32, chroma_preserve: f32, pad_1: f32, pad_2: f32,
};
@group(0) @binding(0) var<uniform> params: SpectralKm7BrushParams;
@group(0) @binding(1) var<storage, read> canvas_rgba_in: array<vec4<${T}>>;
@group(0) @binding(2) var<storage, read> stroke_mask_in: array<${T}>;
@group(0) @binding(3) var<storage, read_write> canvas_rgba_out: array<vec4<${T}>>;

fn km7_ks_vec4(refl: vec4<${T}>) -> vec4<${T}> {
  let rv = clamp(refl, vec4<${T}>(${fl}), vec4<${T}>(${L("1.0")}));
  let diff = vec4<${T}>(${L("1.0")}) - rv;
  return (diff * diff) / (${L("2.0")} * rv);
}
fn km7_refl_vec4(ks: vec4<${T}>) -> vec4<${T}> {
  let q = max(ks, vec4<${T}>(${L("0.0")}));
  let qs = q * ${L("0.25")};
  return clamp(vec4<${T}>(${L("1.0")}) / (vec4<${T}>(${L("1.0")}) + q + ${L("4.0")} * sqrt(qs * qs + ${L("0.5")} * qs)), vec4<${T}>(${fl}), vec4<${T}>(${L("1.0")}));
}
fn km7_mix_linear(lin_a: vec3<${T}>, lin_b: vec3<${T}>, mix_t: ${T}, tint_a: ${T}, tint_b: ${T}, gamma_val: ${T}) -> vec3<${T}> {
  let br_lo = vec4<${T}>(${L("0.16")}, ${L("0.03")}, ${L("0.02")}, ${L("0.03")});
  let br_hi = vec4<${T}>(${L("0.56")}, ${L("0.90")}, ${L("0.90")}, ${L("0.0")});
  let bg_lo = vec4<${T}>(${L("0.02")}, ${L("0.07")}, ${L("0.54")}, ${L("0.86")});
  let bg_hi = vec4<${T}>(${L("0.42")}, ${L("0.08")}, ${L("0.02")}, ${L("0.0")});
  let bb_lo = vec4<${T}>(${L("0.82")}, ${L("0.90")}, ${L("0.44")}, ${L("0.11")});
  let bb_hi = vec4<${T}>(${L("0.02")}, ${L("0.02")}, ${L("0.08")}, ${L("0.0")});

  let sa_lo = clamp(lin_a.x * br_lo + lin_a.y * bg_lo + lin_a.z * bb_lo, vec4<${T}>(${fl}), vec4<${T}>(${L("1.0")}));
  let sa_hi = clamp(lin_a.x * br_hi + lin_a.y * bg_hi + lin_a.z * bb_hi, vec4<${T}>(${fl}), vec4<${T}>(${L("1.0")}));
  let sb_lo = clamp(lin_b.x * br_lo + lin_b.y * bg_lo + lin_b.z * bb_lo, vec4<${T}>(${fl}), vec4<${T}>(${L("1.0")}));
  let sb_hi = clamp(lin_b.x * br_hi + lin_b.y * bg_hi + lin_b.z * bb_hi, vec4<${T}>(${fl}), vec4<${T}>(${L("1.0")}));

  let lum_w = vec3<${T}>(${L("0.2126")}, ${L("0.7152")}, ${L("0.0722")});
  let c_a = pow(max(${L("1.0")} - mix_t, ${eps}), gamma_val) * tint_a * (max(${fl}, dot(lin_a, lum_w)) * ${L("16.0")});
  let c_b = pow(max(mix_t, ${eps}), gamma_val) * tint_b * (max(${fl}, dot(lin_b, lum_w)) * ${L("16.0")});
  let norm_a = clamp(c_a / max(c_a + c_b, ${eps}), ${L("0.0")}, ${L("1.0")});
  let norm_b = ${L("1.0")} - norm_a;

  let m_lo = km7_refl_vec4(km7_ks_vec4(sa_lo) * norm_a + km7_ks_vec4(sb_lo) * norm_b);
  let m_hi = km7_refl_vec4(km7_ks_vec4(sa_hi) * norm_a + km7_ks_vec4(sb_hi) * norm_b);

  let rr_lo = vec4<${T}>(${L("0.039103")}, ${L("-0.018961")}, ${L("-0.097571")}, ${L("-0.166425")});
  let rr_hi = vec4<${T}>(${L("0.347685")}, ${L("0.540144")}, ${L("0.356026")}, ${L("0.0")});
  let rg_lo = vec4<${T}>(${L("-0.110624")}, ${L("-0.162648")}, ${L("0.336230")}, ${L("0.844858")});
  let rg_hi = vec4<${T}>(${L("0.271934")}, ${L("-0.086017")}, ${L("-0.093732")}, ${L("0.0")});
  let rb_lo = vec4<${T}>(${L("0.349440")}, ${L("0.690429")}, ${L("0.252564")}, ${L("-0.160496")});
  let rb_hi = vec4<${T}>(${L("-0.123187")}, ${L("-0.029390")}, ${L("0.020640")}, ${L("0.0")});
  return vec3<${T}>(
    clamp(dot(m_lo, rr_lo) + dot(m_hi, rr_hi), ${L("0.0")}, ${L("1.0")}),
    clamp(dot(m_lo, rg_lo) + dot(m_hi, rg_hi), ${L("0.0")}, ${L("1.0")}),
    clamp(dot(m_lo, rb_lo) + dot(m_hi, rb_hi), ${L("0.0")}, ${L("1.0")}),
  );
}

@compute @workgroup_size(8, 8, 1)
fn ${mode}_spectral_km7_brush_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) { return; }
  let idx = gid.y * params.width + gid.x;
  let dst = canvas_rgba_in[idx];
  let mask = clamp(stroke_mask_in[idx], ${L("0.0")}, ${L("1.0")});
  if (mask <= ${eps}) { canvas_rgba_out[idx] = dst; return; }

  let brush_col = clamp(vec3<${T}>(${cast("params.pigment_r")}, ${cast("params.pigment_g")}, ${cast("params.pigment_b")}), vec3<${T}>(${L("0.0")}), vec3<${T}>(${L("1.0")}));
  let src_a = clamp(mask * ${cast("params.flow_opacity")} * ${cast("params.pigment_a")}, ${L("0.0")}, ${L("1.0")});
  let dst_a = clamp(dst.w, ${L("0.0")}, ${L("1.0")});
  let mix_t = clamp(src_a * ${cast("params.mix_strength")}, ${L("0.0")}, ${L("1.0")});
  var mixed_col = brush_col;
  if (dst_a > ${aFl}) {
    mixed_col = km7_mix_linear(clamp(dst.xyz, vec3<${T}>(${L("0.0")}), vec3<${T}>(${L("1.0")})), brush_col, mix_t, ${cast("params.tint_canvas")}, ${cast("params.tint_brush")}, ${cast("params.conc_gamma")});
  }
  canvas_rgba_out[idx] = vec4<${T}>(mixed_col, clamp(src_a + dst_a * (${L("1.0")} - src_a), ${L("0.0")}, ${L("1.0")}));
}
`;
}

/** 셰이더 2A: `shader-f16` (`enable f16;`) 기반 7밴드 Kubelka-Munk 분광 안료 혼색 Compute. */
export const F16_SPECTRAL_KM7_BRUSH_WGSL = buildSpectralKm7BrushWgsl("f16");
/** 셰이더 2B: `shader-f16` 미지원 GPU용 단정밀도(`f32`) 7밴드 Kubelka-Munk 폴백 Compute. */
export const F32_SPECTRAL_KM7_BRUSH_WGSL = buildSpectralKm7BrushWgsl("f32");

/** 셰이더 3: Linebender Vello Sparse Strips(4×4/8×8) 커버리지 누적 Compute + Fragment `fwidth` AA. */
export const VELLO_SPARSE_STRIP_RASTER_WGSL = /* wgsl */ `
struct SparseStripRasterParams {
  canvas_width: u32, canvas_height: u32, strip_count: u32, strip_height: u32,
  aa_sharpness: f32, fill_rule: u32, pad_0: u32, pad_1: u32,
  ink_r: f32, ink_g: f32, ink_b: f32, ink_a: f32,
};
struct SparseStripHeader {
  origin_x: u32, origin_y: u32, width_px: u32, strip_height: u32,
  seg_offset: u32, seg_count: u32, backdrop_winding: i32, fill_rule: u32,
};
struct SparseVectorSegment { p0: vec2<f32>, p1: vec2<f32>, };
struct StripQuadVarying {
  @builtin(position) clip_pos: vec4<f32>,
  @location(0) pixel_xy: vec2<f32>,
  @location(1) @interpolate(flat) strip_idx: u32,
};

@group(0) @binding(0) var<uniform> params: SparseStripRasterParams;
@group(0) @binding(1) var<storage, read> strip_headers: array<SparseStripHeader>;
@group(0) @binding(2) var<storage, read> strip_segments: array<SparseVectorSegment>;
@group(0) @binding(3) var<storage, read_write> coverage_out: array<f32>;
@group(0) @binding(4) var<storage, read_write> rgba_out: array<vec4<f32>>;

fn segment_pixel_signed_area(seg: SparseVectorSegment, px: f32, py: f32) -> f32 {
  let dy_raw = seg.p1.y - seg.p0.y;
  if (abs(dy_raw) <= 1e-6) { return 0.0; }
  let dir = select(-1.0, 1.0, dy_raw > 0.0);
  let ax = select(seg.p1.x, seg.p0.x, dy_raw > 0.0);
  let ay = select(seg.p1.y, seg.p0.y, dy_raw > 0.0);
  let bx = select(seg.p0.x, seg.p1.x, dy_raw > 0.0);
  let by = select(seg.p0.y, seg.p1.y, dy_raw > 0.0);
  let y_lo = clamp(ay, py, py + 1.0);
  let y_hi = clamp(by, py, py + 1.0);
  let dy = y_hi - y_lo;
  if (dy <= 1e-6) { return 0.0; }

  let inv_dy = 1.0 / max(by - ay, 1e-6);
  let x_lo = ax + (bx - ax) * ((y_lo - ay) * inv_dy);
  let x_hi = ax + (bx - ax) * ((y_hi - ay) * inv_dy);
  let x_min = min(x_lo, x_hi);
  let x_max = max(x_lo, x_hi);
  if (x_min >= px + 1.0) { return 0.0; }
  if (x_max <= px) { return dir * dy; }
  let dx = x_max - x_min;
  if (dx <= 1e-6) { return dir * dy * clamp((px + 1.0) - x_min, 0.0, 1.0); }
  let u0 = clamp(x_min, px, px + 1.0);
  let u1 = clamp(x_max, px, px + 1.0);
  return dir * dy * (clamp(px - x_min, 0.0, dx) + max(u1 - u0, 0.0) * ((px + 1.0) - 0.5 * (u0 + u1))) / dx;
}

fn evaluate_strip_coverage(strip: SparseStripHeader, px: f32, py: f32) -> f32 {
  var winding_acc: f32 = f32(strip.backdrop_winding);
  for (var i: u32 = 0u; i < strip.seg_count; i = i + 1u) {
    winding_acc = winding_acc + segment_pixel_signed_area(strip_segments[strip.seg_offset + i], px, py);
  }
  if (strip.fill_rule == 1u) {
    return clamp(abs(winding_acc - 2.0 * floor(winding_acc * 0.5 + 0.5)), 0.0, 1.0);
  }
  return clamp(abs(winding_acc), 0.0, 1.0);
}

@compute @workgroup_size(8, 8, 1)
fn vello_sparse_strip_compute_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.z >= params.strip_count) { return; }
  let strip = strip_headers[gid.z];
  let eff_h = clamp(strip.strip_height, 4u, 8u);
  if (gid.x >= strip.width_px || gid.y >= eff_h) { return; }
  let px_u = strip.origin_x + gid.x;
  let py_u = strip.origin_y + gid.y;
  if (px_u >= params.canvas_width || py_u >= params.canvas_height) { return; }

  let cov = evaluate_strip_coverage(strip, f32(px_u), f32(py_u));
  let out_idx = py_u * params.canvas_width + px_u;
  coverage_out[out_idx] = cov;
  let alpha = clamp(cov * params.ink_a, 0.0, 1.0);
  rgba_out[out_idx] = vec4<f32>(params.ink_r * alpha, params.ink_g * alpha, params.ink_b * alpha, alpha);
}

fn strip_quad_corner(vid: u32) -> vec2<f32> {
  var c = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 0.0), vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 1.0),
  );
  return c[min(vid, 5u)];
}

@vertex
fn vs_sparse_strip_quad(@builtin(vertex_index) vid: u32, @builtin(instance_index) iid: u32) -> StripQuadVarying {
  let safe_idx = min(iid, max(params.strip_count, 1u) - 1u);
  let strip = strip_headers[safe_idx];
  let corner = strip_quad_corner(vid);
  let px = f32(strip.origin_x) + corner.x * f32(strip.width_px);
  let py = f32(strip.origin_y) + corner.y * f32(clamp(strip.strip_height, 4u, 8u));
  var out_v: StripQuadVarying;
  out_v.clip_pos = vec4<f32>(px * (2.0 / max(f32(params.canvas_width), 1.0)) - 1.0, 1.0 - py * (2.0 / max(f32(params.canvas_height), 1.0)), 0.0, 1.0);
  out_v.pixel_xy = vec2<f32>(px, py);
  out_v.strip_idx = safe_idx;
  return out_v;
}

@fragment
fn fs_sparse_strip_aa(in_v: StripQuadVarying) -> @location(0) vec4<f32> {
  let strip = strip_headers[in_v.strip_idx];
  let raw_cov = evaluate_strip_coverage(strip, floor(in_v.pixel_xy.x), floor(in_v.pixel_xy.y));
  let edge_field = raw_cov - 0.5;
  let aa_width = max(fwidth(edge_field) * max(params.aa_sharpness, 0.5), 0.001);
  let aa_cov = clamp(mix(raw_cov, smoothstep(-aa_width, aa_width, edge_field), 0.25), 0.0, 1.0);
  let final_alpha = clamp(aa_cov * params.ink_a, 0.0, 1.0);
  if (final_alpha <= 0.001) { discard; }
  return vec4<f32>(params.ink_r * final_alpha, params.ink_g * final_alpha, params.ink_b * final_alpha, final_alpha);
}
`;

export interface TileBinPrefixUniformInput {
  readonly tileCount: number;
  readonly tilesX: number;
  readonly tilesY: number;
  readonly tileDimPx?: number | undefined;
  readonly workgroupCount?: number | undefined;
}

export interface SpectralKm7UniformInput {
  readonly width: number;
  readonly height: number;
  readonly pigmentR?: number | undefined;
  readonly pigmentG?: number | undefined;
  readonly pigmentB?: number | undefined;
  readonly pigmentA?: number | undefined;
  readonly flowOpacity?: number | undefined;
  readonly mixStrength?: number | undefined;
  readonly tintCanvas?: number | undefined;
  readonly tintBrush?: number | undefined;
  readonly concentrationGamma?: number | undefined;
  readonly chromaPreserve?: number | undefined;
  readonly precisionMode?: "f16" | "f32" | undefined;
}

export interface SparseStripUniformInput {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly stripCount: number;
  readonly stripHeight?: SparseStripHeightPx | undefined;
  readonly aaSharpness?: number | undefined;
  readonly fillRule?: "nonzero" | "evenodd" | undefined;
  readonly inkR?: number | undefined;
  readonly inkG?: number | undefined;
  readonly inkB?: number | undefined;
  readonly inkA?: number | undefined;
}

export interface ExtremeWgslBindingEntry {
  readonly group: number;
  readonly binding: number;
  readonly addressSpace: string;
  readonly name: string;
}

export interface ExtremeWgslContractOptions {
  readonly requireCompute?: boolean | undefined;
  readonly expectedWorkgroupSize?: readonly [number, number, number] | undefined;
  readonly requireSubgroupsEnable?: boolean | undefined;
  readonly requireF16Enable?: boolean | undefined;
  readonly forbidEnableDirectives?: boolean | undefined;
  readonly requireSubgroupOps?: boolean | undefined;
  readonly requireF16Types?: boolean | undefined;
  readonly requireFragmentFwidthAa?: boolean | undefined;
  readonly requireBoundsGuard?: boolean | undefined;
}

export interface ExtremeWgslContractReport {
  readonly valid: boolean;
  readonly enableDirectives: readonly string[];
  readonly hasSubgroupsEnable: boolean;
  readonly hasF16Enable: boolean;
  readonly hasComputeEntry: boolean;
  readonly hasVertexEntry: boolean;
  readonly hasFragmentEntry: boolean;
  readonly entryPoints: readonly string[];
  readonly workgroupSizes: readonly (readonly [number, number, number])[];
  readonly bindings: readonly ExtremeWgslBindingEntry[];
  readonly duplicateBindings: readonly string[];
  readonly delimitersBalanced: boolean;
  readonly hasBoundsGuard: boolean;
  readonly hasUniformityHazard: boolean;
  readonly hasFragmentFwidthAa: boolean;
  readonly reservedKeywordHits: readonly string[];
  readonly uniformStructBytes: Readonly<Record<string, number>>;
  readonly issues: readonly string[];
}

function clampUint32(v: number | undefined, fb: number): number {
  return typeof v !== "number" || !Number.isFinite(v) ? fb >>> 0 : Math.max(0, Math.min(0xffffffff, Math.floor(v))) >>> 0;
}
function clampFinite(v: number | undefined, fb: number, min: number, max: number): number {
  return typeof v !== "number" || !Number.isFinite(v) ? fb : Math.max(min, Math.min(max, v));
}
function allocateAlignedView(byteLength: number, targetBuffer?: ArrayBuffer, byteOffset = 0): { buffer: ArrayBuffer; view: DataView } {
  if (byteLength % 16 !== 0) throw new RangeError(`WebGPU uniform 크기는 16바이트 배수여야 합니다: ${byteLength}`);
  if (targetBuffer) {
    if (byteOffset < 0 || byteOffset % 16 !== 0 || byteOffset + byteLength > targetBuffer.byteLength) {
      throw new RangeError(`Uniform targetBuffer 오프셋(${byteOffset}) 또는 크기(${targetBuffer.byteLength})가 잘못되었습니다.`);
    }
    return { buffer: targetBuffer, view: new DataView(targetBuffer, byteOffset, byteLength) };
  }
  const buffer = new ArrayBuffer(byteLength);
  return { buffer, view: new DataView(buffer) };
}

/** `TileBinPrefixParams` 16-byte 정렬(32B) Uniform 버퍼를 결정적으로 패킹한다. */
export function packTileBinPrefixUniforms(input: TileBinPrefixUniformInput, targetBuffer?: ArrayBuffer, byteOffset = 0): ArrayBuffer {
  const { buffer, view } = allocateAlignedView(TILE_BIN_PREFIX_UNIFORM_BYTES, targetBuffer, byteOffset);
  const tileCount = clampUint32(input.tileCount, 0);
  const words = [
    tileCount, Math.max(1, clampUint32(input.tilesX, 1)), Math.max(1, clampUint32(input.tilesY, 1)),
    Math.max(1, clampUint32(input.tileDimPx, 64)), clampUint32(input.workgroupCount, Math.ceil(tileCount / SUBGROUP_TILE_WORKGROUP_SIZE_X)),
    0, 0, 0,
  ];
  for (let i = 0; i < words.length; i += 1) view.setUint32(i * 4, words[i] ?? 0, true);
  return buffer;
}

/** `SpectralKm7BrushParams` 16-byte 정렬(64B) Uniform 버퍼를 결정적으로 패킹한다. */
export function packSpectralKm7Uniforms(input: SpectralKm7UniformInput, targetBuffer?: ArrayBuffer, byteOffset = 0): ArrayBuffer {
  const { buffer, view } = allocateAlignedView(SPECTRAL_KM7_UNIFORM_BYTES, targetBuffer, byteOffset);
  const u32s = [Math.max(1, clampUint32(input.width, 64)), Math.max(1, clampUint32(input.height, 64)), input.precisionMode === "f32" ? 0 : 1, 0];
  for (let i = 0; i < u32s.length; i += 1) view.setUint32(i * 4, u32s[i] ?? 0, true);
  const floats = [
    clampFinite(input.pigmentR, 0.12, 0, 1), clampFinite(input.pigmentG, 0.24, 0, 1), clampFinite(input.pigmentB, 0.72, 0, 1), clampFinite(input.pigmentA, 1, 0, 1),
    clampFinite(input.flowOpacity, 1, 0, 1), clampFinite(input.mixStrength, 0.6, 0, 1), clampFinite(input.tintCanvas, 1, 0.1, 8), clampFinite(input.tintBrush, 1, 0.1, 8),
    clampFinite(input.concentrationGamma, 1.65, 0.5, 3), clampFinite(input.chromaPreserve, 0.35, 0, 1), 0, 0,
  ];
  for (let i = 0; i < floats.length; i += 1) view.setFloat32(16 + i * 4, floats[i] ?? 0, true);
  return buffer;
}

/** `SparseStripRasterParams` 16-byte 정렬(48B) Uniform 버퍼를 결정적으로 패킹한다. */
export function packSparseStripUniforms(input: SparseStripUniformInput, targetBuffer?: ArrayBuffer, byteOffset = 0): ArrayBuffer {
  const { buffer, view } = allocateAlignedView(SPARSE_STRIP_UNIFORM_BYTES, targetBuffer, byteOffset);
  view.setUint32(0, Math.max(1, clampUint32(input.canvasWidth, 256)), true);
  view.setUint32(4, Math.max(1, clampUint32(input.canvasHeight, 256)), true);
  view.setUint32(8, clampUint32(input.stripCount, 0), true);
  view.setUint32(12, input.stripHeight === 8 ? 8 : 4, true);
  view.setFloat32(16, clampFinite(input.aaSharpness, 1, 0.5, 4), true);
  view.setUint32(20, input.fillRule === "evenodd" ? 1 : 0, true);
  view.setUint32(24, 0, true);
  view.setUint32(28, 0, true);
  const ink = [clampFinite(input.inkR, 0.08, 0, 1), clampFinite(input.inkG, 0.1, 0, 1), clampFinite(input.inkB, 0.14, 0, 1), clampFinite(input.inkA, 1, 0, 1)];
  for (let i = 0; i < ink.length; i += 1) view.setFloat32(32 + i * 4, ink[i] ?? 0, true);
  return buffer;
}

function checkBalancedDelimiters(code: string): boolean {
  const stack: string[] = [];
  const pairs: Readonly<Record<string, string>> = { ")": "(", "}": "{", "]": "[" };
  for (let i = 0; i < code.length; i += 1) {
    const ch = code[i] ?? "";
    if (ch === "(" || ch === "{" || ch === "[") stack.push(ch);
    else if ((ch === ")" || ch === "}" || ch === "]") && stack.pop() !== pairs[ch]) return false;
  }
  return stack.length === 0;
}

function measureUniformStructs(code: string): Record<string, number> {
  const result: Record<string, number> = {};
  const uniformNames = new Set<string>();
  for (const m of code.matchAll(/var<uniform>\s+[A-Za-z_]\w*\s*:\s*([A-Za-z_]\w*)/gu)) if (m[1]) uniformNames.add(m[1]);
  for (const m of code.matchAll(/struct\s+([A-Za-z_]\w*)\s*\{([^}]*)\}/gu)) {
    const [name, body] = [m[1], m[2]];
    if (!name || !body || !uniformNames.has(name)) continue;
    let bytes = 0;
    for (const raw of body.split(",")) {
      const f = raw.trim();
      if (!f) continue;
      bytes += /:\s*vec[34]<[^>]+>/u.test(f) ? 16 : /:\s*vec2<[^>]+>/u.test(f) ? 8 : /:\s*(?:u32|i32|f32)\b/u.test(f) ? 4 : /:\s*f16\b/u.test(f) ? 2 : 0;
    }
    result[name] = bytes;
  }
  return result;
}

function findReservedKeywordIdentifiers(code: string): string[] {
  const hits = new Set<string>();
  const declRe = /\b(?:let|var(?:<[^>]+>)?|fn|struct)\s+([A-Za-z_][A-Za-z0-9_]*)\b|(?:^|[{,;(\n])\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gmu;
  for (const m of code.matchAll(declRe)) {
    const ident = m[1] ?? m[2] ?? "";
    if ((EXTREME_WGSL_RESERVED_IDENTIFIERS as readonly string[]).includes(ident)) hits.add(ident);
  }
  return Array.from(hits);
}

/**
 * 2025~2026 극한 WebGPU WGSL 정적 계약 검증기.
 * 확장 지시문(`enable subgroups;` / `enable f16;`), 바인딩 유일성, 괄호 균형, 경계 가드, uniformity, 16B 정렬을 검증한다.
 */
export function validateExtremeWgslContracts(
  wgslSource: string,
  options?: ExtremeWgslContractOptions,
): ExtremeWgslContractReport {
  const code = wgslSource.replace(/\/\*[\s\S]*?\*\//gu, " ").replace(/\/\/[^\n]*/gu, " ");
  const issues: string[] = [];

  const enableDirectives: string[] = [];
  for (const m of code.matchAll(/\benable\s+([A-Za-z0-9_,\s]+);/gu)) {
    for (const tok of (m[1] ?? "").split(",")) { const t = tok.trim(); if (t) enableDirectives.push(t); }
  }
  const hasSubgroupsEnable = enableDirectives.includes("subgroups");
  const hasF16Enable = enableDirectives.includes("f16");
  if (options?.requireSubgroupsEnable && !hasSubgroupsEnable) issues.push("`enable subgroups;` 확장 지시문이 누락되었습니다.");
  if (options?.requireF16Enable && !hasF16Enable) issues.push("`enable f16;` 확장 지시문이 누락되었습니다.");
  if (options?.forbidEnableDirectives && enableDirectives.length > 0) issues.push(`폴백 셰이더에 확장 지시문(${enableDirectives.join(", ")})이 포함되었습니다.`);
  if (options?.requireSubgroupOps && !(/\bsubgroupExclusiveAdd\s*\(/u.test(code) && /\bsubgroupAdd\s*\(/u.test(code) && /\bsubgroupBroadcast\s*\(/u.test(code))) {
    issues.push("서브그룹 연산(`subgroupExclusiveAdd`/`subgroupAdd`/`subgroupBroadcast`)이 불완전합니다.");
  }
  if (options?.requireF16Types && !/\b(?:vec[234]<f16>|f16)\b/u.test(code)) issues.push("`f16` 반정밀도 타입 선언이 누락되었습니다.");

  const delimitersBalanced = checkBalancedDelimiters(code);
  if (!delimitersBalanced) issues.push("WGSL 괄호((), {}, []) 균형이 맞지 않습니다.");

  const entryPoints: string[] = [];
  const workgroupSizes: (readonly [number, number, number])[] = [];
  for (const m of code.matchAll(/@compute[\s\S]{0,160}?@workgroup_size\(\s*(\d+)(?:\s*,\s*(\d+))?(?:\s*,\s*(\d+))?\s*\)\s*fn\s+([A-Za-z_]\w*)/gu)) {
    const [wx, wy, wz] = [Number(m[1] ?? 0), Number(m[2] ?? 1), Number(m[3] ?? 1)];
    entryPoints.push(m[4] ?? "");
    workgroupSizes.push([wx, wy, wz] as const);
    if (wx < 1 || wy < 1 || wz < 1 || wx * wy * wz > 256) issues.push(`유효하지 않은 @workgroup_size(${wx}, ${wy}, ${wz}) 선언입니다.`);
  }
  const [hasComputeEntry, hasVertexEntry, hasFragmentEntry] = [entryPoints.length > 0, /@vertex\b/u.test(code), /@fragment\b/u.test(code)];
  if ((options?.requireCompute ?? true) && !hasComputeEntry) issues.push("@compute @workgroup_size(...) 진입점이 누락되었습니다.");
  if (options?.expectedWorkgroupSize && workgroupSizes.length > 0) {
    const [ex, ey, ez] = options.expectedWorkgroupSize;
    if (!workgroupSizes.every(([x, y, z]) => x === ex && y === ey && z === ez)) issues.push(`기대한 @workgroup_size(${ex}, ${ey}, ${ez})와 일치하지 않습니다.`);
  }

  const bindings: ExtremeWgslBindingEntry[] = [];
  const seenKeys = new Set<string>();
  const duplicateBindings: string[] = [];
  for (const m of code.matchAll(/@group\(\s*(\d+)\s*\)\s*@binding\(\s*(\d+)\s*\)\s*var<([^>]+)>\s*([A-Za-z_]\w*)/gu)) {
    const key = `${Number(m[1])}:${Number(m[2])}`;
    if (seenKeys.has(key)) duplicateBindings.push(key);
    else seenKeys.add(key);
    bindings.push({ group: Number(m[1]), binding: Number(m[2]), addressSpace: (m[3] ?? "").trim(), name: m[4] ?? "" });
  }
  if (duplicateBindings.length > 0) issues.push(`중복된 @group/@binding 선언 발견: ${duplicateBindings.join(", ")}`);

  const hasBoundsGuard =
    /if\s*\([^)]*(?:gid\.[xyz]|idx|px_u|py_u)\s*>=\s*[^)]+\)\s*\{\s*return\s*;\s*\}/u.test(code) ||
    /\blet\s+in_bounds\s*=\s*[^;]*(?:<|<=)[^;]+;\s*[\s\S]*?if\s*\(\s*in_bounds\s*\)/u.test(code);
  if ((options?.requireBoundsGuard ?? true) && !hasBoundsGuard) issues.push("스레드 경계 가드가 누락되었습니다.");

  const syncMatch = /\b(?:workgroupBarrier|storageBarrier|subgroupExclusiveAdd|subgroupAdd|subgroupBroadcast)\s*\(/u.exec(code);
  const earlyReturnMatch = /if\s*\([^)]*(?:gid\.[xyz]|idx)\s*>=\s*[^)]+\)\s*\{\s*return\s*;\s*\}/u.exec(code);
  const barrierAfterEarlyReturn = Boolean(syncMatch && earlyReturnMatch && earlyReturnMatch.index < syncMatch.index);
  const hasFwidthCall = /\bfwidth\s*\(/u.test(code);
  const fragmentIdx = code.indexOf("@fragment");
  const firstDiscardIdx = code.indexOf("discard;");
  const fwidthOutsideFragment = hasFwidthCall && (!hasFragmentEntry || (fragmentIdx >= 0 && code.indexOf("fwidth(") < fragmentIdx));
  const fwidthAfterDiscard = hasFwidthCall && firstDiscardIdx >= 0 && code.lastIndexOf("fwidth(") > firstDiscardIdx;
  const hasUniformityHazard = barrierAfterEarlyReturn || fwidthOutsideFragment || fwidthAfterDiscard;
  if (barrierAfterEarlyReturn) issues.push("비균일 경계 조기 return 이후 배리어/서브그룹 연산 호출은 uniformity 위반입니다.");
  if (fwidthOutsideFragment) issues.push("`fwidth`는 `@fragment` 단계에서만 호출할 수 있습니다.");
  if (fwidthAfterDiscard) issues.push("`fwidth` 호출이 `discard;` 이후에 위치해 uniformity 위반입니다.");

  const hasFragmentFwidthAa = hasFragmentEntry && hasFwidthCall && !fwidthOutsideFragment && !fwidthAfterDiscard;
  if (options?.requireFragmentFwidthAa && !hasFragmentFwidthAa) issues.push("균일 제어 흐름 내 `@fragment` `fwidth` 안티앨리어싱 경로가 누락되었습니다.");

  const reservedKeywordHits = findReservedKeywordIdentifiers(code);
  if (reservedKeywordHits.length > 0) issues.push(`Chromium WGSL 예약어 충돌: ${reservedKeywordHits.join(", ")}`);

  const uniformStructBytes = measureUniformStructs(code);
  for (const [name, bytes] of Object.entries(uniformStructBytes)) {
    if (bytes === 0 || bytes % 16 !== 0) issues.push(`Uniform 구조체 ${name} 크기(${bytes}B)가 16바이트 정렬이 아닙니다.`);
  }

  return Object.freeze({
    valid: issues.length === 0,
    enableDirectives: Object.freeze(enableDirectives),
    hasSubgroupsEnable, hasF16Enable, hasComputeEntry, hasVertexEntry, hasFragmentEntry,
    entryPoints: Object.freeze(entryPoints),
    workgroupSizes: Object.freeze(workgroupSizes),
    bindings: Object.freeze(bindings),
    duplicateBindings: Object.freeze(duplicateBindings),
    delimitersBalanced, hasBoundsGuard, hasUniformityHazard, hasFragmentFwidthAa,
    reservedKeywordHits: Object.freeze(reservedKeywordHits),
    uniformStructBytes: Object.freeze(uniformStructBytes),
    issues: Object.freeze(issues),
  });
}

/** 5종 극한 WebGPU WGSL 셰이더 전체 계약을 일괄 검증한다. */
export function validateAllExtremeWgslBundles() {
  const subgroupTileBin = validateExtremeWgslContracts(SUBGROUP_PREFIX_SUM_TILE_BIN_WGSL, { expectedWorkgroupSize: [SUBGROUP_TILE_WORKGROUP_SIZE_X, 1, 1], requireSubgroupsEnable: true, requireSubgroupOps: true });
  const standardTileBin = validateExtremeWgslContracts(STANDARD_PREFIX_SUM_TILE_BIN_WGSL, { expectedWorkgroupSize: [SUBGROUP_TILE_WORKGROUP_SIZE_X, 1, 1], forbidEnableDirectives: true });
  const f16SpectralKm7 = validateExtremeWgslContracts(F16_SPECTRAL_KM7_BRUSH_WGSL, { expectedWorkgroupSize: [SPECTRAL_KM7_WORKGROUP_SIZE_X, SPECTRAL_KM7_WORKGROUP_SIZE_Y, 1], requireF16Enable: true, requireF16Types: true });
  const f32SpectralKm7 = validateExtremeWgslContracts(F32_SPECTRAL_KM7_BRUSH_WGSL, { expectedWorkgroupSize: [SPECTRAL_KM7_WORKGROUP_SIZE_X, SPECTRAL_KM7_WORKGROUP_SIZE_Y, 1], forbidEnableDirectives: true });
  const velloSparseStrip = validateExtremeWgslContracts(VELLO_SPARSE_STRIP_RASTER_WGSL, { expectedWorkgroupSize: [SPARSE_STRIP_WORKGROUP_SIZE_X, SPARSE_STRIP_WORKGROUP_SIZE_Y, 1], forbidEnableDirectives: true, requireFragmentFwidthAa: true });
  return Object.freeze({
    allValid: subgroupTileBin.valid && standardTileBin.valid && f16SpectralKm7.valid && f32SpectralKm7.valid && velloSparseStrip.valid,
    subgroupTileBin, standardTileBin, f16SpectralKm7, f32SpectralKm7, velloSparseStrip,
  });
}
