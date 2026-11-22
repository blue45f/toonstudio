/**
 * 차세대 WebGPU Compute 셰이더 모음 (WGSL).
 *
 * - HDR 16-bit 선형 광학 공간 블렌딩 + 8×8 Bayer / TPDF 무밴딩 sRGB 8-bit 양자화
 * - 비파괴 스크린톤(원형/다이아몬드/선형/교차 망점) + Sobel 1패스 외곽선
 * - Jump-Flooding Algorithm (JFA) 유클리드 거리장 외곽선 + 스크린톤 최종 합성
 *
 * 모든 uniform 구조체는 16바이트 정렬(u32/f32 4개 단위)을 유지하며,
 * Chromium WGSL 예약어(`meta`, `active`, `filter` 등)를 식별자로 사용하지 않는다.
 */

export const GPU_NEXT_WORKGROUP_SIZE_X = 8;
export const GPU_NEXT_WORKGROUP_SIZE_Y = 8;

/** HDR 선형 블렌딩 & 디더링 uniform 버퍼 크기 (12 × 4 = 48 bytes, 16-byte aligned). */
export const GPU_NEXT_HDR_UNIFORM_FLOATS = 12;
export const GPU_NEXT_HDR_UNIFORM_BYTES = GPU_NEXT_HDR_UNIFORM_FLOATS * 4;

/** 스크린톤 & 외곽선 uniform 버퍼 크기 (16 × 4 = 64 bytes, 16-byte aligned). */
export const GPU_NEXT_SCREENTONE_UNIFORM_FLOATS = 16;
export const GPU_NEXT_SCREENTONE_UNIFORM_BYTES = GPU_NEXT_SCREENTONE_UNIFORM_FLOATS * 4;

/** JFA 점프 단계 uniform 버퍼 크기 (8 × 4 = 32 bytes, 16-byte aligned). */
export const GPU_NEXT_JFA_STEP_UNIFORM_U32S = 8;
export const GPU_NEXT_JFA_STEP_UNIFORM_BYTES = GPU_NEXT_JFA_STEP_UNIFORM_U32S * 4;

/**
 * 16-bit 선형 HDR(rgba16float 호환 선형 f32 패킹) 블렌딩 + 8×8 Bayer / TPDF 무밴딩 sRGB8 출력 Compute 셰이더.
 *
 * blend_mode:
 *   0 = source-over (premultiplied linear optical)
 *   1 = additive    (linear HDR light sum)
 *   2 = multiply    (linear optical transmittance)
 *   3 = screen      (1 - (1 - dst) * (1 - src), clamped to [0, 1] for non-HDR)
 *
 * dither_mode:
 *   0 = none
 *   1 = bayer8x8
 *   2 = tpdf (Triangular PDF, ±1 LSB)
 *   3 = hybrid (Bayer 8×8 + 0.5x TPDF)
 */
export const GPU_NEXT_HDR_LINEAR_BLEND_DITHER_WGSL = /* wgsl */ `
struct HdrBlendDitherParams {
  width: u32,
  height: u32,
  blend_mode: u32,
  dither_mode: u32,
  seed: u32,
  tonemap_mode: u32,
  opacity: f32,
  exposure: f32,
  white_point: f32,
  pad_a: f32,
  pad_b: f32,
  pad_c: f32,
};

@group(0) @binding(0) var<uniform> params: HdrBlendDitherParams;
@group(0) @binding(1) var<storage, read> src_linear: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> dst_linear: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> out_srgb8: array<u32>;

fn bayer8x8_threshold(px: u32, py: u32, seed: u32, channel: u32) -> f32 {
  let shift = seed & 7u;
  let x = (px + shift) & 7u;
  let y = (py + channel + shift) & 7u;

  let xb0 = x & 1u;
  let yb0 = y & 1u;
  let p0 = ((xb0 ^ yb0) << 1u) | yb0;

  let xb1 = (x >> 1u) & 1u;
  let yb1 = (y >> 1u) & 1u;
  let p1 = ((xb1 ^ yb1) << 1u) | yb1;

  let xb2 = (x >> 2u) & 1u;
  let yb2 = (y >> 2u) & 1u;
  let p2 = ((xb2 ^ yb2) << 1u) | yb2;

  let cell = (p0 << 4u) | (p1 << 2u) | p2;
  return (f32(cell) + 0.5) / 64.0 - 0.5;
}

fn dither_hash01(px: u32, py: u32, seed: u32, channel: u32) -> f32 {
  var h = (px * 0x27d4eb2du) ^ (py * 0x165667b1u);
  h = (h ^ channel ^ seed) * 0x85ebca6bu;
  h = h ^ (h >> 13u);
  h = h * 0xc2b2ae35u;
  h = h ^ (h >> 16u);
  return f32(h) / 4294967296.0;
}

fn dither_offset(mode: u32, px: u32, py: u32, seed: u32, channel: u32) -> f32 {
  if (mode == 1u) {
    return bayer8x8_threshold(px, py, seed, channel);
  }
  if (mode == 2u) {
    let u0 = dither_hash01(px, py, seed, channel);
    let u1 = dither_hash01(px, py, seed ^ 0x9e3779b9u, channel);
    return u0 - u1;
  }
  if (mode == 3u) {
    let bayer = bayer8x8_threshold(px, py, seed, channel);
    let u0 = dither_hash01(px, py, seed, channel);
    let u1 = dither_hash01(px, py, seed ^ 0x9e3779b9u, channel);
    return bayer + (u0 - u1) * 0.5;
  }
  return 0.0;
}

fn linear_to_srgb_channel(linear_val: f32) -> f32 {
  let v = clamp(linear_val, 0.0, 1.0);
  if (v <= 0.0031308) {
    return v * 12.92;
  }
  return 1.055 * pow(v, 1.0 / 2.4) - 0.055;
}

fn apply_hdr_tonemap(linear_rgb: vec3<f32>, exposure: f32, white_point: f32, mode: u32) -> vec3<f32> {
  let exposed = max(linear_rgb * exposure, vec3<f32>(0.0));
  if (mode == 1u) {
    let wp2 = max(white_point * white_point, 1.0);
    return (exposed * (vec3<f32>(1.0) + exposed / wp2)) / (vec3<f32>(1.0) + exposed);
  }
  return clamp(exposed, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn blend_linear_optical(dst_c: vec4<f32>, src_c: vec4<f32>, opacity: f32, mode: u32) -> vec4<f32> {
  let sa = clamp(src_c.a * opacity, 0.0, 1.0);
  let da = clamp(dst_c.a, 0.0, 1.0);
  let src_rgb = max(src_c.rgb, vec3<f32>(0.0));
  let dst_rgb = max(dst_c.rgb, vec3<f32>(0.0));

  if (mode == 1u) {
    let out_a = clamp(da + sa * (1.0 - da), 0.0, 1.0);
    return vec4<f32>(dst_rgb * da + src_rgb * sa, out_a);
  }
  if (mode == 2u) {
    let out_a = sa + da * (1.0 - sa);
    if (out_a <= 1e-6) {
      return vec4<f32>(0.0);
    }
    let blended = src_rgb * dst_rgb;
    let premul = src_rgb * sa * (1.0 - da) + dst_rgb * da * (1.0 - sa) + blended * sa * da;
    return vec4<f32>(premul / out_a, out_a);
  }
  if (mode == 3u) {
    let out_a = sa + da * (1.0 - sa);
    if (out_a <= 1e-6) {
      return vec4<f32>(0.0);
    }
    let s_clamped = clamp(src_rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    let d_clamped = clamp(dst_rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    let blended = vec3<f32>(1.0) - (vec3<f32>(1.0) - s_clamped) * (vec3<f32>(1.0) - d_clamped);
    let premul = src_rgb * sa * (1.0 - da) + dst_rgb * da * (1.0 - sa) + blended * sa * da;
    return vec4<f32>(premul / out_a, out_a);
  }

  let out_a = sa + da * (1.0 - sa);
  if (out_a <= 1e-6) {
    return vec4<f32>(0.0);
  }
  let premul = src_rgb * sa + dst_rgb * da * (1.0 - sa);
  return vec4<f32>(premul / out_a, out_a);
}

fn quantize_srgb8_channel(encoded01: f32, dither: f32) -> u32 {
  let scaled = clamp(encoded01 * 255.0 + dither, 0.0, 255.0);
  return u32(floor(scaled + 0.5));
}

@compute @workgroup_size(8, 8, 1)
fn hdr_linear_blend_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) {
    return;
  }
  let idx = gid.y * params.width + gid.x;
  dst_linear[idx] = blend_linear_optical(
    dst_linear[idx],
    src_linear[idx],
    params.opacity,
    params.blend_mode,
  );
}

@compute @workgroup_size(8, 8, 1)
fn hdr_tonemap_dither_srgb8_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) {
    return;
  }
  let idx = gid.y * params.width + gid.x;
  let lin = dst_linear[idx];
  let mapped = apply_hdr_tonemap(lin.rgb, params.exposure, params.white_point, params.tonemap_mode);

  let dr = dither_offset(params.dither_mode, gid.x, gid.y, params.seed, 0u);
  let dg = dither_offset(params.dither_mode, gid.x, gid.y, params.seed, 1u);
  let db = dither_offset(params.dither_mode, gid.x, gid.y, params.seed, 2u);

  let r8 = quantize_srgb8_channel(linear_to_srgb_channel(mapped.r), dr);
  let g8 = quantize_srgb8_channel(linear_to_srgb_channel(mapped.g), dg);
  let b8 = quantize_srgb8_channel(linear_to_srgb_channel(mapped.b), db);
  let a8 = u32(floor(clamp(lin.a, 0.0, 1.0) * 255.0 + 0.5));

  out_srgb8[idx] = r8 | (g8 << 8u) | (b8 << 16u) | (a8 << 24u);
}
`;

/**
 * 비파괴 스크린톤(원/다이아몬드/선형/교차) + Sobel 1패스 외곽선 Compute 셰이더.
 *
 * dot_shape:
 *   0 = circle
 *   1 = diamond
 *   2 = line
 *   3 = cross
 *
 * outline_mode:
 *   0 = none
 *   1 = sobel (1-pass 3x3 gradient outline)
 */
export const GPU_NEXT_SCREENTONE_OUTLINE_ONEPASS_WGSL = /* wgsl */ `
struct ScreentoneOutlineParams {
  width: u32,
  height: u32,
  dot_shape: u32,
  outline_mode: u32,
  cell_px: f32,
  cos_angle: f32,
  sin_angle: f32,
  density_scale: f32,
  phase_x: f32,
  phase_y: f32,
  outline_threshold: f32,
  outline_strength: f32,
  ink_rgba: u32,
  outline_rgba: u32,
  invert_tone: u32,
  use_source_luma: u32,
};

@group(0) @binding(0) var<uniform> cfg: ScreentoneOutlineParams;
@group(0) @binding(1) var<storage, read> src_pixels: array<u32>;
@group(0) @binding(2) var<storage, read_write> dst_pixels: array<u32>;

fn unpack_rgba8(packed: u32) -> vec4<f32> {
  return vec4<f32>(
    f32(packed & 255u) / 255.0,
    f32((packed >> 8u) & 255u) / 255.0,
    f32((packed >> 16u) & 255u) / 255.0,
    f32((packed >> 24u) & 255u) / 255.0,
  );
}

fn pack_rgba8(c: vec4<f32>) -> u32 {
  let r = u32(floor(clamp(c.r, 0.0, 1.0) * 255.0 + 0.5));
  let g = u32(floor(clamp(c.g, 0.0, 1.0) * 255.0 + 0.5));
  let b = u32(floor(clamp(c.b, 0.0, 1.0) * 255.0 + 0.5));
  let a = u32(floor(clamp(c.a, 0.0, 1.0) * 255.0 + 0.5));
  return r | (g << 8u) | (b << 16u) | (a << 24u);
}

fn sample_alpha_clamped(ix: i32, iy: i32) -> f32 {
  let cx = clamp(ix, 0, i32(cfg.width) - 1);
  let cy = clamp(iy, 0, i32(cfg.height) - 1);
  let packed = src_pixels[u32(cy) * cfg.width + u32(cx)];
  return f32((packed >> 24u) & 255u) / 255.0;
}

fn sample_luma_clamped(ix: i32, iy: i32) -> f32 {
  let cx = clamp(ix, 0, i32(cfg.width) - 1);
  let cy = clamp(iy, 0, i32(cfg.height) - 1);
  let c = unpack_rgba8(src_pixels[u32(cy) * cfg.width + u32(cx)]);
  return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) * c.a;
}

fn screentone_coverage(px: f32, py: f32, density: f32) -> f32 {
  let d = clamp(density, 0.0, 1.0);
  if (d <= 0.0001) {
    return 0.0;
  }
  if (d >= 0.9999) {
    return 1.0;
  }
  let cell = max(cfg.cell_px, 2.0);
  let u = px * cfg.cos_angle + py * cfg.sin_angle + cfg.phase_x;
  let v = -px * cfg.sin_angle + py * cfg.cos_angle + cfg.phase_y;
  let fu = u - floor(u / cell) * cell - 0.5 * cell;
  let fv = v - floor(v / cell) * cell - 0.5 * cell;

  if (cfg.dot_shape == 1u) {
    if (d <= 0.5) {
      let half_diag = sqrt(d * 0.5) * cell;
      let dist = abs(fu) + abs(fv);
      return clamp(half_diag - dist + 0.5, 0.0, 1.0);
    }
    let inv_half_diag = sqrt((1.0 - d) * 0.5) * cell;
    let corner_dist = (0.5 * cell - abs(fu)) + (0.5 * cell - abs(fv));
    return 1.0 - clamp(inv_half_diag - corner_dist + 0.5, 0.0, 1.0);
  }

  if (cfg.dot_shape == 2u) {
    let half_thick = 0.5 * d * cell;
    return clamp(half_thick - abs(fu) + 0.5, 0.0, 1.0);
  }

  if (cfg.dot_shape == 3u) {
    let half_thick = 0.5 * d * cell;
    let cu = clamp(half_thick - abs(fu) + 0.5, 0.0, 1.0);
    let cv = clamp(half_thick - abs(fv) + 0.5, 0.0, 1.0);
    return max(cu, cv);
  }

  let dist = sqrt(fu * fu + fv * fv);
  let radius = sqrt(d / 3.14159265) * cell;
  return clamp(radius - dist + 0.5, 0.0, 1.0);
}

fn sobel_edge(ix: i32, iy: i32) -> f32 {
  let tl = sample_alpha_clamped(ix - 1, iy - 1);
  let tc = sample_alpha_clamped(ix, iy - 1);
  let tr = sample_alpha_clamped(ix + 1, iy - 1);
  let ml = sample_alpha_clamped(ix - 1, iy);
  let mr = sample_alpha_clamped(ix + 1, iy);
  let bl = sample_alpha_clamped(ix - 1, iy + 1);
  let bc = sample_alpha_clamped(ix, iy + 1);
  let br = sample_alpha_clamped(ix + 1, iy + 1);

  let gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
  let gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
  let mag = sqrt(gx * gx + gy * gy) * 0.25;
  return smoothstep(cfg.outline_threshold * 0.5, max(cfg.outline_threshold, 0.01), mag);
}

@compute @workgroup_size(8, 8, 1)
fn screentone_and_outline_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= cfg.width || gid.y >= cfg.height) {
    return;
  }
  let idx = gid.y * cfg.width + gid.x;
  let src_c = unpack_rgba8(src_pixels[idx]);
  let luma = 0.2126 * src_c.r + 0.7152 * src_c.g + 0.0722 * src_c.b;
  let local_density = select(
    cfg.density_scale,
    clamp((1.0 - luma) * cfg.density_scale, 0.0, 1.0),
    cfg.use_source_luma != 0u,
  );

  var tone_cov = screentone_coverage(f32(gid.x), f32(gid.y), local_density);
  if (cfg.invert_tone != 0u && local_density > 0.0) {
    tone_cov = 1.0 - tone_cov;
  }
  tone_cov = tone_cov * src_c.a;

  let ink = unpack_rgba8(cfg.ink_rgba);
  var out_color = vec4<f32>(ink.rgb, clamp(tone_cov * ink.a, 0.0, 1.0));

  if (cfg.outline_mode == 1u) {
    let edge = sobel_edge(i32(gid.x), i32(gid.y)) * clamp(cfg.outline_strength, 0.0, 1.0);
    if (edge > 0.001) {
      let outline_c = unpack_rgba8(cfg.outline_rgba);
      let oa = clamp(edge * outline_c.a, 0.0, 1.0);
      let ta = out_color.a;
      let merged_a = oa + ta * (1.0 - oa);
      if (merged_a > 1e-6) {
        let merged_rgb = (outline_c.rgb * oa + out_color.rgb * ta * (1.0 - oa)) / merged_a;
        out_color = vec4<f32>(merged_rgb, merged_a);
      }
    }
  }

  dst_pixels[idx] = pack_rgba8(out_color);
}
`;

/**
 * Jump-Flooding Algorithm (JFA) 기반 유클리드 외곽선 + 스크린톤 합성 Compute 셰이더.
 * 시드 좌표는 vec2<i32> (빈 셀 = (-1, -1))로 핑퐁 버퍼에 저장한다.
 */
export const GPU_NEXT_JFA_OUTLINE_WGSL = /* wgsl */ `
struct JfaStepParams {
  width: u32,
  height: u32,
  step_size: i32,
  alpha_threshold_u8: u32,
  outline_width_px: f32,
  outline_rgba: u32,
  pad_a: u32,
  pad_b: u32,
};

@group(0) @binding(0) var<uniform> jfa: JfaStepParams;
@group(0) @binding(1) var<storage, read> src_pixels: array<u32>;
@group(0) @binding(2) var<storage, read> seed_in: array<vec2<i32>>;
@group(0) @binding(3) var<storage, read_write> seed_out: array<vec2<i32>>;
@group(0) @binding(4) var<storage, read_write> dst_pixels: array<u32>;

fn unpack_u32_rgba(packed: u32) -> vec4<f32> {
  return vec4<f32>(
    f32(packed & 255u) / 255.0,
    f32((packed >> 8u) & 255u) / 255.0,
    f32((packed >> 16u) & 255u) / 255.0,
    f32((packed >> 24u) & 255u) / 255.0,
  );
}

fn pack_u32_rgba(c: vec4<f32>) -> u32 {
  let r = u32(floor(clamp(c.r, 0.0, 1.0) * 255.0 + 0.5));
  let g = u32(floor(clamp(c.g, 0.0, 1.0) * 255.0 + 0.5));
  let b = u32(floor(clamp(c.b, 0.0, 1.0) * 255.0 + 0.5));
  let a = u32(floor(clamp(c.a, 0.0, 1.0) * 255.0 + 0.5));
  return r | (g << 8u) | (b << 16u) | (a << 24u);
}

@compute @workgroup_size(8, 8, 1)
fn jfa_seed_init_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= jfa.width || gid.y >= jfa.height) {
    return;
  }
  let idx = gid.y * jfa.width + gid.x;
  let alpha_u8 = (src_pixels[idx] >> 24u) & 255u;
  if (alpha_u8 >= jfa.alpha_threshold_u8) {
    seed_out[idx] = vec2<i32>(i32(gid.x), i32(gid.y));
  } else {
    seed_out[idx] = vec2<i32>(-1, -1);
  }
}

@compute @workgroup_size(8, 8, 1)
fn jfa_flood_step_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= jfa.width || gid.y >= jfa.height) {
    return;
  }
  let ix = i32(gid.x);
  let iy = i32(gid.y);
  let w = i32(jfa.width);
  let h = i32(jfa.height);
  let step = max(jfa.step_size, 1);

  var best_seed = vec2<i32>(-1, -1);
  var best_dist2 = 1e30;

  for (var dy: i32 = -1; dy <= 1; dy = dy + 1) {
    let ny = iy + dy * step;
    if (ny < 0 || ny >= h) {
      continue;
    }
    for (var dx: i32 = -1; dx <= 1; dx = dx + 1) {
      let nx = ix + dx * step;
      if (nx < 0 || nx >= w) {
        continue;
      }
      let cand = seed_in[u32(ny) * jfa.width + u32(nx)];
      if (cand.x < 0) {
        continue;
      }
      let ddx = f32(ix - cand.x);
      let ddy = f32(iy - cand.y);
      let dist2 = ddx * ddx + ddy * ddy;
      if (dist2 < best_dist2) {
        best_dist2 = dist2;
        best_seed = cand;
      }
    }
  }

  seed_out[gid.y * jfa.width + gid.x] = best_seed;
}

@compute @workgroup_size(8, 8, 1)
fn jfa_outline_resolve_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= jfa.width || gid.y >= jfa.height) {
    return;
  }
  let idx = gid.y * jfa.width + gid.x;
  let alpha_u8 = (src_pixels[idx] >> 24u) & 255u;
  if (alpha_u8 >= jfa.alpha_threshold_u8) {
    return;
  }
  let nearest = seed_in[idx];
  if (nearest.x < 0) {
    return;
  }
  let dist = sqrt(
    f32((i32(gid.x) - nearest.x) * (i32(gid.x) - nearest.x) +
        (i32(gid.y) - nearest.y) * (i32(gid.y) - nearest.y)),
  );
  let cov = clamp(jfa.outline_width_px - dist + 0.5, 0.0, 1.0);
  if (cov <= 0.001) {
    return;
  }
  let outline_c = unpack_u32_rgba(jfa.outline_rgba);
  let base_c = unpack_u32_rgba(dst_pixels[idx]);
  let oa = clamp(cov * outline_c.a, 0.0, 1.0);
  let ba = base_c.a;
  let out_a = oa + ba * (1.0 - oa);
  if (out_a > 1e-6) {
    let out_rgb = (outline_c.rgb * oa + base_c.rgb * ba * (1.0 - oa)) / out_a;
    dst_pixels[idx] = pack_u32_rgba(vec4<f32>(out_rgb, out_a));
  }
}
`;
