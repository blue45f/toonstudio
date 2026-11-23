/**
 * WebGPU 제로카피 드로잉 스튜디오 4종 실제 WGSL 컴퓨트 셰이더 (`@compute @workgroup_size(16, 16)`).
 *
 * - 1) `WGSL_MULTI_LAYER_BLEND_SHADER`: Normal/Multiply/Screen/Overlay/Add + 마스크 1패스 합성
 * - 2) `WGSL_SEPARABLE_FILTER_GRAPH_SHADER`: 분리형 가우시안 블러 · 언샤프 마스크 · HSL 색보정 1패스 퓨전
 * - 3) `WGSL_ARAP_MESH_WARP_SHADER`: 다중 핀 델라우니 삼각 분할 + ARAP/MLS 비파괴 변형·모핑 워프
 * - 4) `WGSL_IMPASTO_RELIEF_COMPOSITE_SHADER`: 2.5D 임파스토 높이 버퍼 Sobel 법선 광원 1패스 셰이딩
 */

export const WEBGPU_COMPUTE_WORKGROUP_SIZE = 16 as const;

export interface WgslShaderContract {
  readonly id: string;
  readonly entryPoint: "main";
  readonly workgroupSize: readonly [16, 16, 1];
  readonly bindingCount: number;
  readonly uniformByteLength: number;
  readonly source: string;
}

const WGSL_RGBA8_CODEC_SNIPPET = /* wgsl */ `
fn unpack_rgba8(packed: u32) -> vec4<f32> {
  return vec4<f32>(
    f32(packed & 0xffu) / 255.0,
    f32((packed >> 8u) & 0xffu) / 255.0,
    f32((packed >> 16u) & 0xffu) / 255.0,
    f32((packed >> 24u) & 0xffu) / 255.0,
  );
}

fn pack_rgba8(c: vec4<f32>) -> u32 {
  let r = u32(round(clamp(c.r, 0.0, 1.0) * 255.0));
  let g = u32(round(clamp(c.g, 0.0, 1.0) * 255.0));
  let b = u32(round(clamp(c.b, 0.0, 1.0) * 255.0));
  let a = u32(round(clamp(c.a, 0.0, 1.0) * 255.0));
  return r | (g << 8u) | (b << 16u) | (a << 24u);
}
`;

export const WGSL_MULTI_LAYER_BLEND_SHADER: string = /* wgsl */ `
struct MultiLayerBlendParams {
  width: u32,
  height: u32,
  layer_count: u32,
  flags: u32,
}

struct LayerDescriptor {
  blend_mode: u32,
  opacity: f32,
  has_mask: u32,
  mask_offset: u32,
}

@group(0) @binding(0) var<uniform> params: MultiLayerBlendParams;
@group(0) @binding(1) var<storage, read> layer_meta: array<LayerDescriptor>;
@group(0) @binding(2) var<storage, read> layer_pixels: array<u32>;
@group(0) @binding(3) var<storage, read> mask_bytes: array<u32>;
@group(0) @binding(4) var<storage, read_write> out_pixels: array<u32>;
${WGSL_RGBA8_CODEC_SNIPPET}
fn read_mask_alpha(offset: u32, idx: u32) -> f32 {
  let byte_pos = offset + idx;
  let word = mask_bytes[byte_pos >> 2u];
  let shift = (byte_pos & 3u) * 8u;
  return f32((word >> shift) & 0xffu) / 255.0;
}

fn eval_blend_rgb(mode: u32, dst_rgb: vec3<f32>, src_rgb: vec3<f32>) -> vec3<f32> {
  if (mode == 1u) { return dst_rgb * src_rgb; }
  if (mode == 2u) { return vec3<f32>(1.0) - (vec3<f32>(1.0) - dst_rgb) * (vec3<f32>(1.0) - src_rgb); }
  if (mode == 3u) {
    let low = 2.0 * dst_rgb * src_rgb;
    let high = vec3<f32>(1.0) - 2.0 * (vec3<f32>(1.0) - dst_rgb) * (vec3<f32>(1.0) - src_rgb);
    return select(high, low, dst_rgb < vec3<f32>(0.5));
  }
  if (mode == 4u) { return min(dst_rgb + src_rgb, vec3<f32>(1.0)); }
  return src_rgb;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) { return; }
  let pixel_count = params.width * params.height;
  let idx = gid.y * params.width + gid.x;
  var acc_rgb = vec3<f32>(0.0);
  var acc_a: f32 = 0.0;

  for (var li: u32 = 0u; li < params.layer_count; li = li + 1u) {
    let desc = layer_meta[li];
    let src = unpack_rgba8(layer_pixels[li * pixel_count + idx]);
    let mask_v = select(1.0, read_mask_alpha(desc.mask_offset, idx), desc.has_mask != 0u);
    let sa = clamp(src.a * desc.opacity * mask_v, 0.0, 1.0);
    if (sa <= 0.0) { continue; }
    let mode_rgb = eval_blend_rgb(desc.blend_mode, acc_rgb, src.rgb);
    let blended_rgb = (1.0 - acc_a) * src.rgb + acc_a * mode_rgb;
    let out_a = sa + acc_a * (1.0 - sa);
    acc_rgb = select(vec3<f32>(0.0), (sa * blended_rgb + acc_a * (1.0 - sa) * acc_rgb) / out_a, out_a > 1e-6);
    acc_a = out_a;
  }
  out_pixels[idx] = pack_rgba8(vec4<f32>(acc_rgb, acc_a));
}
`;

export const WGSL_SEPARABLE_FILTER_GRAPH_SHADER: string = /* wgsl */ `
struct FilterGraphParams {
  width: u32,
  height: u32,
  radius: u32,
  pass_mode: u32,
  unsharp_amount: f32,
  unsharp_threshold: f32,
  hue_shift_deg: f32,
  saturation_delta: f32,
  lightness_delta: f32,
  pad0: f32,
  pad1: f32,
  pad2: f32,
}

@group(0) @binding(0) var<uniform> params: FilterGraphParams;
@group(0) @binding(1) var<storage, read> kernel_weights: array<f32>;
@group(0) @binding(2) var<storage, read> src_pixels: array<u32>;
@group(0) @binding(3) var<storage, read> orig_pixels: array<u32>;
@group(0) @binding(4) var<storage, read_write> out_pixels: array<u32>;
${WGSL_RGBA8_CODEC_SNIPPET}
fn hue_to_rgb(p: f32, q: f32, t_in: f32) -> f32 {
  var t = t_in;
  if (t < 0.0) { t = t + 1.0; }
  if (t > 1.0) { t = t - 1.0; }
  if (t < 1.0 / 6.0) { return p + (q - p) * 6.0 * t; }
  if (t < 0.5) { return q; }
  if (t < 2.0 / 3.0) { return p + (q - p) * (2.0 / 3.0 - t) * 6.0; }
  return p;
}

fn apply_hsl_grade(rgb: vec3<f32>, hue_deg: f32, sat_delta: f32, light_delta: f32) -> vec3<f32> {
  let cmax = max(rgb.r, max(rgb.g, rgb.b));
  let cmin = min(rgb.r, min(rgb.g, rgb.b));
  let delta = cmax - cmin;
  var l = 0.5 * (cmax + cmin);
  var h: f32 = 0.0;
  var s: f32 = 0.0;
  if (delta > 1e-6) {
    s = select(delta / (2.0 - cmax - cmin), delta / (cmax + cmin), l < 0.5);
    if (cmax == rgb.r) { h = (rgb.g - rgb.b) / delta + select(0.0, 6.0, rgb.g < rgb.b); }
    else if (cmax == rgb.g) { h = (rgb.b - rgb.r) / delta + 2.0; }
    else { h = (rgb.r - rgb.g) / delta + 4.0; }
    h = h / 6.0;
  }
  h = fract(h + hue_deg / 360.0 + 1.0);
  s = clamp(s + sat_delta, 0.0, 1.0);
  l = clamp(l + light_delta, 0.0, 1.0);
  if (s <= 1e-6) { return vec3<f32>(l); }
  let q = select(l + s - l * s, l * (1.0 + s), l < 0.5);
  let p = 2.0 * l - q;
  return vec3<f32>(hue_to_rgb(p, q, h + 1.0 / 3.0), hue_to_rgb(p, q, h), hue_to_rgb(p, q, h - 1.0 / 3.0));
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) { return; }
  let r_i = i32(params.radius);
  let w_i = i32(params.width);
  let h_i = i32(params.height);
  let cx = i32(gid.x);
  let cy = i32(gid.y);
  let idx = gid.y * params.width + gid.x;
  var blur_acc = vec4<f32>(0.0);

  if (params.pass_mode == 0u) {
    for (var dx: i32 = -r_i; dx <= r_i; dx = dx + 1) {
      let sx = u32(clamp(cx + dx, 0, w_i - 1));
      blur_acc = blur_acc + unpack_rgba8(src_pixels[gid.y * params.width + sx]) * kernel_weights[u32(dx + r_i)];
    }
    out_pixels[idx] = pack_rgba8(blur_acc);
    return;
  }

  if (params.pass_mode == 1u) {
    for (var dy: i32 = -r_i; dy <= r_i; dy = dy + 1) {
      let sy = u32(clamp(cy + dy, 0, h_i - 1));
      blur_acc = blur_acc + unpack_rgba8(src_pixels[sy * params.width + gid.x]) * kernel_weights[u32(dy + r_i)];
    }
  } else {
    for (var dy: i32 = -r_i; dy <= r_i; dy = dy + 1) {
      let sy = u32(clamp(cy + dy, 0, h_i - 1));
      let wy = kernel_weights[u32(dy + r_i)];
      for (var dx: i32 = -r_i; dx <= r_i; dx = dx + 1) {
        let sx = u32(clamp(cx + dx, 0, w_i - 1));
        blur_acc = blur_acc + unpack_rgba8(src_pixels[sy * params.width + sx]) * (wy * kernel_weights[u32(dx + r_i)]);
      }
    }
  }

  let orig = unpack_rgba8(orig_pixels[idx]);
  let diff = orig.rgb - blur_acc.rgb;
  let th_mask = step(vec3<f32>(params.unsharp_threshold), abs(diff));
  let unsharp_rgb = clamp(orig.rgb + diff * params.unsharp_amount * th_mask, vec3<f32>(0.0), vec3<f32>(1.0));
  let filtered_rgb = select(blur_acc.rgb, unsharp_rgb, params.unsharp_amount > 0.0);
  let graded_rgb = apply_hsl_grade(filtered_rgb, params.hue_shift_deg, params.saturation_delta, params.lightness_delta);
  out_pixels[idx] = pack_rgba8(vec4<f32>(graded_rgb, orig.a));
}
`;

export const WGSL_ARAP_MESH_WARP_SHADER: string = /* wgsl */ `
struct ArapWarpParams {
  width: u32,
  height: u32,
  tri_count: u32,
  morph_t: f32,
}

struct WarpTriangle {
  def0: vec2<f32>,
  def1: vec2<f32>,
  def2: vec2<f32>,
  rest0: vec2<f32>,
  rest1: vec2<f32>,
  rest2: vec2<f32>,
}

@group(0) @binding(0) var<uniform> params: ArapWarpParams;
@group(0) @binding(1) var<storage, read> triangles: array<WarpTriangle>;
@group(0) @binding(2) var<storage, read> src_pixels: array<u32>;
@group(0) @binding(3) var<storage, read_write> out_pixels: array<u32>;
${WGSL_RGBA8_CODEC_SNIPPET}
fn sample_bilinear(u: f32, v: f32) -> vec4<f32> {
  let max_x = f32(params.width - 1u);
  let max_y = f32(params.height - 1u);
  if (u < 0.0 || v < 0.0 || u > max_x || v > max_y) { return vec4<f32>(0.0); }
  let x0 = u32(floor(u));
  let y0 = u32(floor(v));
  let x1 = min(x0 + 1u, params.width - 1u);
  let y1 = min(y0 + 1u, params.height - 1u);
  let fx = u - f32(x0);
  let fy = v - f32(y0);
  let c00 = unpack_rgba8(src_pixels[y0 * params.width + x0]);
  let c10 = unpack_rgba8(src_pixels[y0 * params.width + x1]);
  let c01 = unpack_rgba8(src_pixels[y1 * params.width + x0]);
  let c11 = unpack_rgba8(src_pixels[y1 * params.width + x1]);
  return mix(mix(c00, c10, fx), mix(c01, c11, fx), fy);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) { return; }
  let pt = vec2<f32>(f32(gid.x), f32(gid.y));
  let idx = gid.y * params.width + gid.x;
  var found = false;
  var src_uv = pt;

  for (var ti: u32 = 0u; ti < params.tri_count; ti = ti + 1u) {
    let tri = triangles[ti];
    let v0 = tri.def1 - tri.def0;
    let v1 = tri.def2 - tri.def0;
    let v2 = pt - tri.def0;
    let denom = v0.x * v1.y - v1.x * v0.y;
    if (abs(denom) < 1e-6) { continue; }
    let inv = 1.0 / denom;
    let w1 = (v2.x * v1.y - v1.x * v2.y) * inv;
    let w2 = (v0.x * v2.y - v2.x * v0.y) * inv;
    let w0 = 1.0 - w1 - w2;
    if (w0 >= -1e-4 && w1 >= -1e-4 && w2 >= -1e-4) {
      src_uv = tri.rest0 * w0 + tri.rest1 * w1 + tri.rest2 * w2;
      found = true;
      break;
    }
  }
  out_pixels[idx] = select(0u, pack_rgba8(sample_bilinear(src_uv.x, src_uv.y)), found);
}
`;

export const WGSL_IMPASTO_RELIEF_COMPOSITE_SHADER: string = /* wgsl */ `
struct ImpastoReliefParams {
  width: u32,
  height: u32,
  relief_scale: f32,
  ambient: f32,
  light_x: f32,
  light_y: f32,
  light_z: f32,
  specular_strength: f32,
  shininess: f32,
  shadow_strength: f32,
  pad0: f32,
  pad1: f32,
}

@group(0) @binding(0) var<uniform> params: ImpastoReliefParams;
@group(0) @binding(1) var<storage, read> base_pixels: array<u32>;
@group(0) @binding(2) var<storage, read> height_field: array<f32>;
@group(0) @binding(3) var<storage, read_write> out_pixels: array<u32>;
${WGSL_RGBA8_CODEC_SNIPPET}
fn sample_h(x: i32, y: i32) -> f32 {
  let cx = u32(clamp(x, 0, i32(params.width) - 1));
  let cy = u32(clamp(y, 0, i32(params.height) - 1));
  return height_field[cy * params.width + cx];
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) { return; }
  let x = i32(gid.x);
  let y = i32(gid.y);
  let idx = gid.y * params.width + gid.x;
  let base = unpack_rgba8(base_pixels[idx]);
  let gx = (sample_h(x + 1, y - 1) + 2.0 * sample_h(x + 1, y) + sample_h(x + 1, y + 1))
         - (sample_h(x - 1, y - 1) + 2.0 * sample_h(x - 1, y) + sample_h(x - 1, y + 1));
  let gy = (sample_h(x - 1, y + 1) + 2.0 * sample_h(x, y + 1) + sample_h(x + 1, y + 1))
         - (sample_h(x - 1, y - 1) + 2.0 * sample_h(x, y - 1) + sample_h(x + 1, y - 1));
  let mc = sample_h(x, y);
  let normal = normalize(vec3<f32>(-gx * params.relief_scale, -gy * params.relief_scale, 1.0));
  let light_dir = normalize(vec3<f32>(params.light_x, params.light_y, params.light_z));
  let ndotl = max(dot(normal, light_dir), 0.0);
  let half_vec = normalize(light_dir + vec3<f32>(0.0, 0.0, 1.0));
  let spec = pow(max(dot(normal, half_vec), 0.0), params.shininess) * params.specular_strength * clamp(mc, 0.0, 1.0);
  let trough_shadow = 1.0 - params.shadow_strength * max(0.5 - ndotl, 0.0);
  let diffuse = (params.ambient + (1.0 - params.ambient) * ndotl) * trough_shadow;
  out_pixels[idx] = pack_rgba8(vec4<f32>(clamp(base.rgb * diffuse + vec3<f32>(spec), vec3<f32>(0.0), vec3<f32>(1.0)), base.a));
}
`;

export const WGSL_SHADER_CONTRACTS: readonly WgslShaderContract[] = Object.freeze([
  { id: "multi-layer-blend", entryPoint: "main", workgroupSize: [16, 16, 1], bindingCount: 5, uniformByteLength: 16, source: WGSL_MULTI_LAYER_BLEND_SHADER },
  { id: "separable-filter-graph", entryPoint: "main", workgroupSize: [16, 16, 1], bindingCount: 5, uniformByteLength: 48, source: WGSL_SEPARABLE_FILTER_GRAPH_SHADER },
  { id: "arap-mesh-warp", entryPoint: "main", workgroupSize: [16, 16, 1], bindingCount: 4, uniformByteLength: 16, source: WGSL_ARAP_MESH_WARP_SHADER },
  { id: "impasto-relief-composite", entryPoint: "main", workgroupSize: [16, 16, 1], bindingCount: 4, uniformByteLength: 48, source: WGSL_IMPASTO_RELIEF_COMPOSITE_SHADER },
]);

export function computeWorkgroupDispatch(
  width: number,
  height: number,
  workgroupSize: number = WEBGPU_COMPUTE_WORKGROUP_SIZE,
): { readonly x: number; readonly y: number; readonly z: 1 } {
  const wg = Math.max(1, Math.floor(workgroupSize));
  return {
    x: Math.max(1, Math.ceil(Math.max(1, width) / wg)),
    y: Math.max(1, Math.ceil(Math.max(1, height) / wg)),
    z: 1,
  };
}
