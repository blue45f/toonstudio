/**
 * WebGPU WGSL 1패스 Compute 변형·선명 리샘플링 셰이더 소스 (`@workgroup_size(8, 8, 1)`).
 *
 * 아핀 회전·확대/축소, 3×3 원근 호모그래피, 격자 메쉬 워프(bilinear / bicubic Catmull-Rom),
 * 리퀴파이 방사 변위를 단일 패스로 실행하며 `Lanczos3` / `Catmull-Rom Bicubic` / `Nearest-Sharp` /
 * `Bilinear` 프리멀티플라이드 알파 리샘플링을 제공한다.
 */

export const STUDIO_WEBGPU_TRANSFORM_RESAMPLE_WGSL = /* wgsl */ `
const PI_F32: f32 = 3.141592653589793;

struct TransformUniforms {
  dims: vec4<f32>,        // [srcW, srcH, dstW, dstH]
  inv_row0: vec4<f32>,    // [h00, h01, h02, 0]
  inv_row1: vec4<f32>,    // [h10, h11, h12, 0]
  inv_row2: vec4<f32>,    // [h20, h21, h22, 0]
  mode_filter: vec4<f32>, // [transformMode, resamplerMode, filterScaleX, filterScaleY]
  extra: vec4<f32>,       // [meshRows, meshCols, liquifyOpCount, flags]
};

struct MeshInverseHit {
  hit: u32,
  coord_u: f32,
  coord_v: f32,
  pad_slot: u32,
};

@group(0) @binding(0) var<uniform> u_transform: TransformUniforms;
@group(0) @binding(1) var<storage, read> src_pixels: array<u32>;
@group(0) @binding(2) var<storage, read_write> dst_pixels: array<u32>;
@group(0) @binding(3) var<storage, read> mesh_nodes: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> liquify_ops: array<vec4<f32>>;

fn unpack_rgba8(packed: u32) -> vec4<f32> {
  let r = f32(packed & 255u);
  let g = f32((packed >> 8u) & 255u);
  let b = f32((packed >> 16u) & 255u);
  let a = f32((packed >> 24u) & 255u);
  return vec4<f32>(r, g, b, a);
}

fn pack_rgba8(rgba: vec4<f32>) -> u32 {
  let r = u32(floor(clamp(rgba.x, 0.0, 255.0) + 0.5));
  let g = u32(floor(clamp(rgba.y, 0.0, 255.0) + 0.5));
  let b = u32(floor(clamp(rgba.z, 0.0, 255.0) + 0.5));
  let a = u32(floor(clamp(rgba.w, 0.0, 255.0) + 0.5));
  return r | (g << 8u) | (b << 16u) | (a << 24u);
}

fn eval_lanczos3_weight(x: f32) -> f32 {
  let ax = abs(x);
  if (ax >= 3.0) {
    return 0.0;
  }
  if (ax < 1e-6) {
    return 1.0;
  }
  let px = PI_F32 * ax;
  let px3 = px / 3.0;
  return (sin(px) / px) * (sin(px3) / px3);
}

fn eval_catmull_rom_weight(x: f32) -> f32 {
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

fn eval_catmull_rom_1d(p0: f32, p1: f32, p2: f32, p3: f32, t: f32) -> f32 {
  let w0 = eval_catmull_rom_weight(t + 1.0);
  let w1 = eval_catmull_rom_weight(t);
  let w2 = eval_catmull_rom_weight(t - 1.0);
  let w3 = eval_catmull_rom_weight(t - 2.0);
  return p0 * w0 + p1 * w1 + p2 * w2 + p3 * w3;
}

fn fetch_src_rgba(x: i32, y: i32, src_w: i32, src_h: i32) -> vec4<f32> {
  let cx = clamp(x, 0, src_w - 1);
  let cy = clamp(y, 0, src_h - 1);
  let idx = u32(cy * src_w + cx);
  return unpack_rgba8(src_pixels[idx]);
}

fn resample_source_rgba(
  sx: f32,
  sy: f32,
  src_w: i32,
  src_h: i32,
  resampler_mode: u32,
  filter_scale_x: f32,
  filter_scale_y: f32,
) -> vec4<f32> {
  let max_x_f = f32(src_w - 1);
  let max_y_f = f32(src_h - 1);
  if (sx < -0.5 || sy < -0.5 || sx > max_x_f + 0.5 || sy > max_y_f + 0.5) {
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
  }

  let cx = clamp(sx, 0.0, max_x_f);
  let cy = clamp(sy, 0.0, max_y_f);

  if (resampler_mode == 0u) {
    let nx = clamp(i32(floor(sx + 0.5)), 0, src_w - 1);
    let ny = clamp(i32(floor(sy + 0.5)), 0, src_h - 1);
    return fetch_src_rgba(nx, ny, src_w, src_h);
  }

  let fsx = clamp(filter_scale_x, 1.0, 4.0);
  let fsy = clamp(filter_scale_y, 1.0, 4.0);

  if (fsx <= 1.0001 && fsy <= 1.0001) {
    let rx = floor(cx + 0.5);
    let ry = floor(cy + 0.5);
    if (abs(cx - rx) < 1e-5 && abs(cy - ry) < 1e-5) {
      return fetch_src_rgba(i32(rx), i32(ry), src_w, src_h);
    }
  }

  if (resampler_mode == 1u) {
    let x0 = i32(floor(cx));
    let y0 = i32(floor(cy));
    let x1 = min(src_w - 1, x0 + 1);
    let y1 = min(src_h - 1, y0 + 1);
    let fx = cx - f32(x0);
    let fy = cy - f32(y0);

    let p00 = fetch_src_rgba(x0, y0, src_w, src_h);
    let p10 = fetch_src_rgba(x1, y0, src_w, src_h);
    let p01 = fetch_src_rgba(x0, y1, src_w, src_h);
    let p11 = fetch_src_rgba(x1, y1, src_w, src_h);

    let w00 = (1.0 - fx) * (1.0 - fy);
    let w10 = fx * (1.0 - fy);
    let w01 = (1.0 - fx) * fy;
    let w11 = fx * fy;

    let a00 = p00.w / 255.0;
    let a10 = p10.w / 255.0;
    let a01 = p01.w / 255.0;
    let a11 = p11.w / 255.0;
    let out_a = a00 * w00 + a10 * w10 + a01 * w01 + a11 * w11;
    if (out_a <= 1e-4) {
      return vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }
    let rgb = (p00.xyz * (w00 * a00) + p10.xyz * (w10 * a10) + p01.xyz * (w01 * a01) + p11.xyz * (w11 * a11)) / out_a;
    return vec4<f32>(clamp(rgb, vec3<f32>(0.0), vec3<f32>(255.0)), clamp(out_a * 255.0, 0.0, 255.0));
  }

  let lobe = select(2.0, 3.0, resampler_mode == 3u);
  let rx = min(12, i32(ceil(lobe * fsx)));
  let ry = min(12, i32(ceil(lobe * fsy)));
  let floor_x = i32(floor(cx));
  let floor_y = i32(floor(cy));
  let min_x = max(0, floor_x - rx + 1);
  let max_x = min(src_w - 1, floor_x + rx);
  let min_y = max(0, floor_y - ry + 1);
  let max_y = min(src_h - 1, floor_y + ry);

  let inv_fsx = 1.0 / fsx;
  let inv_fsy = 1.0 / fsy;

  var sum_rgb = vec3<f32>(0.0, 0.0, 0.0);
  var sum_a: f32 = 0.0;
  var sum_w: f32 = 0.0;

  for (var py: i32 = min_y; py <= max_y; py = py + 1) {
    let dy_scaled = (f32(py) - cy) * inv_fsy;
    let wy = select(eval_catmull_rom_weight(dy_scaled), eval_lanczos3_weight(dy_scaled), resampler_mode == 3u);
    if (wy == 0.0) {
      continue;
    }
    for (var px: i32 = min_x; px <= max_x; px = px + 1) {
      let dx_scaled = (f32(px) - cx) * inv_fsx;
      let wx = select(eval_catmull_rom_weight(dx_scaled), eval_lanczos3_weight(dx_scaled), resampler_mode == 3u);
      if (wx == 0.0) {
        continue;
      }
      let w = wx * wy;
      let px_rgba = fetch_src_rgba(px, py, src_w, src_h);
      let a_norm = px_rgba.w / 255.0;
      let wa = w * a_norm;
      sum_rgb = sum_rgb + px_rgba.xyz * wa;
      sum_a = sum_a + wa;
      sum_w = sum_w + w;
    }
  }

  if (abs(sum_w) < 1e-7) {
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
  }
  let norm_a = clamp(sum_a / sum_w, 0.0, 1.0);
  let alpha_byte = floor(norm_a * 255.0 + 0.5);
  if (alpha_byte <= 0.0 || norm_a <= 1e-4) {
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
  }
  let premul_max = vec3<f32>(255.0 * norm_a);
  let rgb_clamped = clamp(sum_rgb / sum_w, vec3<f32>(0.0), premul_max) / norm_a;
  return vec4<f32>(rgb_clamped, alpha_byte);
}

fn try_tri_barycentric(
  px: f32,
  py: f32,
  ax: f32,
  ay: f32,
  au: f32,
  av: f32,
  bx: f32,
  by: f32,
  bu: f32,
  bv: f32,
  cx: f32,
  cy: f32,
  cu: f32,
  cv: f32,
) -> MeshInverseHit {
  let det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (abs(det) < 1e-7) {
    return MeshInverseHit(0u, 0.0, 0.0, 0u);
  }
  let inv_det = 1.0 / det;
  let w0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) * inv_det;
  let w1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) * inv_det;
  let w2 = 1.0 - w0 - w1;
  if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) {
    return MeshInverseHit(0u, 0.0, 0.0, 0u);
  }
  return MeshInverseHit(1u, w0 * au + w1 * bu + w2 * cu, w0 * av + w1 * bv + w2 * cv, 0u);
}

fn fetch_mesh_row_col_wgsl(cols: i32, r: i32, c: i32) -> vec2<f32> {
  if (c < 0) {
    let a = mesh_nodes[u32(r * cols)].zw;
    let b = mesh_nodes[u32(r * cols + 1)].zw;
    return a * 2.0 - b;
  }
  if (c >= cols) {
    let a = mesh_nodes[u32(r * cols + cols - 1)].zw;
    let b = mesh_nodes[u32(r * cols + cols - 2)].zw;
    return a * 2.0 - b;
  }
  return mesh_nodes[u32(r * cols + c)].zw;
}

fn fetch_mesh_node_extrapolated_wgsl(rows: i32, cols: i32, r: i32, c: i32) -> vec2<f32> {
  if (r < 0) {
    return fetch_mesh_row_col_wgsl(cols, 0, c) * 2.0 - fetch_mesh_row_col_wgsl(cols, 1, c);
  }
  if (r >= rows) {
    return fetch_mesh_row_col_wgsl(cols, rows - 1, c) * 2.0 - fetch_mesh_row_col_wgsl(cols, rows - 2, c);
  }
  return fetch_mesh_row_col_wgsl(cols, r, c);
}

fn eval_mesh_forward_bicubic_wgsl(rows: i32, cols: i32, u: f32, v: f32) -> vec2<f32> {
  let max_u = cols - 1;
  let max_v = rows - 1;
  let cu = clamp(u, 0.0, f32(max_u));
  let cv = clamp(v, 0.0, f32(max_v));
  let i1 = min(max_u - 1, i32(floor(cu)));
  let j1 = min(max_v - 1, i32(floor(cv)));
  let fu = cu - f32(i1);
  let fv = cv - f32(j1);

  var acc = vec2<f32>(0.0, 0.0);
  for (var dj: i32 = -1; dj <= 2; dj = dj + 1) {
    let wy = eval_catmull_rom_weight(fv - f32(dj));
    let r_idx = j1 + dj;
    let n0 = fetch_mesh_node_extrapolated_wgsl(rows, cols, r_idx, i1 - 1);
    let n1 = fetch_mesh_node_extrapolated_wgsl(rows, cols, r_idx, i1);
    let n2 = fetch_mesh_node_extrapolated_wgsl(rows, cols, r_idx, i1 + 1);
    let n3 = fetch_mesh_node_extrapolated_wgsl(rows, cols, r_idx, i1 + 2);
    acc.x = acc.x + eval_catmull_rom_1d(n0.x, n1.x, n2.x, n3.x, fu) * wy;
    acc.y = acc.y + eval_catmull_rom_1d(n0.y, n1.y, n2.y, n3.y, fu) * wy;
  }
  return acc;
}

fn eval_mesh_rest_wgsl(rows: i32, cols: i32, u: f32, v: f32) -> vec2<f32> {
  let max_u = cols - 1;
  let max_v = rows - 1;
  let cu = clamp(u, 0.0, f32(max_u));
  let cv = clamp(v, 0.0, f32(max_v));
  let i0 = min(max_u - 1, i32(floor(cu)));
  let j0 = min(max_v - 1, i32(floor(cv)));
  let fu = cu - f32(i0);
  let fv = cv - f32(j0);

  let p00 = mesh_nodes[u32(j0 * cols + i0)];
  let p10 = mesh_nodes[u32(j0 * cols + i0 + 1)];
  let p01 = mesh_nodes[u32((j0 + 1) * cols + i0)];
  let p11 = mesh_nodes[u32((j0 + 1) * cols + i0 + 1)];

  let top = mix(p00.xy, p10.xy, fu);
  let bot = mix(p01.xy, p11.xy, fu);
  return mix(top, bot, fv);
}

fn solve_mesh_inverse_wgsl(rows: i32, cols: i32, dx: f32, dy: f32, use_bicubic: bool) -> vec3<f32> {
  var seed = MeshInverseHit(0u, 0.0, 0.0, 0u);
  for (var r: i32 = 0; r < rows - 1; r = r + 1) {
    if (seed.hit == 1u) {
      break;
    }
    for (var c: i32 = 0; c < cols - 1; c = c + 1) {
      let p00 = mesh_nodes[u32(r * cols + c)];
      let p10 = mesh_nodes[u32(r * cols + c + 1)];
      let p11 = mesh_nodes[u32((r + 1) * cols + c + 1)];
      let p01 = mesh_nodes[u32((r + 1) * cols + c)];

      let min_x = min(min(p00.z, p10.z), min(p11.z, p01.z)) - 1.0;
      let max_x = max(max(p00.z, p10.z), max(p11.z, p01.z)) + 1.0;
      let min_y = min(min(p00.w, p10.w), min(p11.w, p01.w)) - 1.0;
      let max_y = max(max(p00.w, p10.w), max(p11.w, p01.w)) + 1.0;
      if (dx < min_x || dx > max_x || dy < min_y || dy > max_y) {
        continue;
      }

      let cx = (p00.z + p10.z + p11.z + p01.z) * 0.25;
      let cy = (p00.w + p10.w + p11.w + p01.w) * 0.25;
      let cf = f32(c);
      let rf = f32(r);
      let cu = cf + 0.5;
      let cv = rf + 0.5;

      var tri_hit = try_tri_barycentric(dx, dy, p00.z, p00.w, cf, rf, p10.z, p10.w, cf + 1.0, rf, cx, cy, cu, cv);
      if (tri_hit.hit == 0u) {
        tri_hit = try_tri_barycentric(dx, dy, p10.z, p10.w, cf + 1.0, rf, p11.z, p11.w, cf + 1.0, rf + 1.0, cx, cy, cu, cv);
      }
      if (tri_hit.hit == 0u) {
        tri_hit = try_tri_barycentric(dx, dy, p11.z, p11.w, cf + 1.0, rf + 1.0, p01.z, p01.w, cf, rf + 1.0, cx, cy, cu, cv);
      }
      if (tri_hit.hit == 0u) {
        tri_hit = try_tri_barycentric(dx, dy, p01.z, p01.w, cf, rf + 1.0, p00.z, p00.w, cf, rf, cx, cy, cu, cv);
      }
      if (tri_hit.hit == 1u) {
        seed = tri_hit;
        break;
      }
    }
  }

  if (seed.hit == 0u) {
    return vec3<f32>(0.0, 0.0, 0.0);
  }

  var u = seed.coord_u;
  var v = seed.coord_v;
  if (use_bicubic) {
    let max_u_f = f32(cols - 1);
    let max_v_f = f32(rows - 1);
    let eps: f32 = 1e-3;
    for (var iter: i32 = 0; iter < 3; iter = iter + 1) {
      let fwd = eval_mesh_forward_bicubic_wgsl(rows, cols, u, v);
      let err = fwd - vec2<f32>(dx, dy);
      if (dot(err, err) < 1e-8) {
        break;
      }
      let u_plus = min(max_u_f, u + eps);
      let u_minus = max(0.0, u - eps);
      let v_plus = min(max_v_f, v + eps);
      let v_minus = max(0.0, v - eps);
      let du = max(1e-6, u_plus - u_minus);
      let dv = max(1e-6, v_plus - v_minus);
      let j_u = (eval_mesh_forward_bicubic_wgsl(rows, cols, u_plus, v) - eval_mesh_forward_bicubic_wgsl(rows, cols, u_minus, v)) / du;
      let j_v = (eval_mesh_forward_bicubic_wgsl(rows, cols, u, v_plus) - eval_mesh_forward_bicubic_wgsl(rows, cols, u, v_minus)) / dv;
      let det = j_u.x * j_v.y - j_v.x * j_u.y;
      if (abs(det) < 1e-7) {
        break;
      }
      let step_u = clamp((j_v.y * err.x - j_v.x * err.y) / det, -0.5, 0.5);
      let step_v = clamp((-j_u.y * err.x + j_u.x * err.y) / det, -0.5, 0.5);
      u = clamp(u - step_u, 0.0, max_u_f);
      v = clamp(v - step_v, 0.0, max_v_f);
    }
  }

  let rest_pt = eval_mesh_rest_wgsl(rows, cols, u, v);
  return vec3<f32>(rest_pt.x, rest_pt.y, 1.0);
}

fn apply_liquify_inverse_wgsl(op_count: u32, dx: f32, dy: f32) -> vec2<f32> {
  var sx = dx;
  var sy = dy;
  if (op_count == 0u) {
    return vec2<f32>(sx, sy);
  }
  var remaining = op_count;
  loop {
    if (remaining == 0u) {
      break;
    }
    remaining = remaining - 1u;
    let base_idx = remaining * 2u;
    let geom = liquify_ops[base_idx];      // [cx, cy, deltaX, deltaY]
    let cfg = liquify_ops[base_idx + 1u];  // [radius, strength, modeCode, hardness]
    let radius = cfg.x;
    let strength = cfg.y;
    if (radius <= 0.0 || strength == 0.0) {
      continue;
    }
    let rx = sx - geom.x;
    let ry = sy - geom.y;
    let dist_sq = rx * rx + ry * ry;
    if (dist_sq >= radius * radius) {
      continue;
    }
    let norm_dist = sqrt(dist_sq) / radius;
    let inner_edge = clamp(cfg.w, 0.0, 0.95);
    let t = select((norm_dist - inner_edge) / max(1e-5, 1.0 - inner_edge), 0.0, norm_dist <= inner_edge);
    let falloff = 0.5 * (1.0 + cos(PI_F32 * clamp(t, 0.0, 1.0)));
    let weight = falloff * clamp(strength, -1.0, 1.0);
    let mode_code = u32(cfg.z + 0.5);

    if (mode_code == 0u) {
      sx = sx - geom.z * weight;
      sy = sy - geom.w * weight;
    } else if (mode_code == 1u) {
      let factor = 1.0 - 0.45 * weight;
      sx = geom.x + rx * factor;
      sy = geom.y + ry * factor;
    } else if (mode_code == 2u) {
      let factor = 1.0 + 0.45 * weight;
      sx = geom.x + rx * factor;
      sy = geom.y + ry * factor;
    } else if (mode_code == 3u || mode_code == 4u) {
      let sign_dir = select(1.0, -1.0, mode_code == 3u);
      let angle = sign_dir * (PI_F32 / 3.0) * weight;
      let cos_a = cos(angle);
      let sin_a = sin(angle);
      sx = geom.x + rx * cos_a - ry * sin_a;
      sy = geom.y + rx * sin_a + ry * cos_a;
    }
  }
  return vec2<f32>(sx, sy);
}

@compute @workgroup_size(8, 8, 1)
fn cs_transform_resample(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dst_w = u32(u_transform.dims.z);
  let dst_h = u32(u_transform.dims.w);
  if (gid.x >= dst_w || gid.y >= dst_h) {
    return;
  }

  let src_w = i32(u_transform.dims.x);
  let src_h = i32(u_transform.dims.y);
  let dx = f32(gid.x);
  let dy = f32(gid.y);
  let transform_mode = u32(u_transform.mode_filter.x + 0.5);
  let resampler_mode = u32(u_transform.mode_filter.y + 0.5);
  var fsx = u_transform.mode_filter.z;
  var fsy = u_transform.mode_filter.w;

  var sx = dx;
  var sy = dy;
  var valid = true;

  if (transform_mode == 0u) {
    sx = u_transform.inv_row0.x * dx + u_transform.inv_row0.y * dy + u_transform.inv_row0.z;
    sy = u_transform.inv_row1.x * dx + u_transform.inv_row1.y * dy + u_transform.inv_row1.z;
  } else if (transform_mode == 1u) {
    let denom = u_transform.inv_row2.x * dx + u_transform.inv_row2.y * dy + u_transform.inv_row2.z;
    if (abs(denom) < 1e-7) {
      valid = false;
    } else {
      let num_x = u_transform.inv_row0.x * dx + u_transform.inv_row0.y * dy + u_transform.inv_row0.z;
      let num_y = u_transform.inv_row1.x * dx + u_transform.inv_row1.y * dy + u_transform.inv_row1.z;
      sx = num_x / denom;
      sy = num_y / denom;
      let inv_d2 = 1.0 / (denom * denom);
      let dsx_dx = (u_transform.inv_row0.x * denom - num_x * u_transform.inv_row2.x) * inv_d2;
      let dsx_dy = (u_transform.inv_row0.y * denom - num_x * u_transform.inv_row2.y) * inv_d2;
      let dsy_dx = (u_transform.inv_row1.x * denom - num_y * u_transform.inv_row2.x) * inv_d2;
      let dsy_dy = (u_transform.inv_row1.y * denom - num_y * u_transform.inv_row2.y) * inv_d2;
      fsx = clamp(length(vec2<f32>(dsx_dx, dsy_dx)), 1.0, 4.0);
      fsy = clamp(length(vec2<f32>(dsx_dy, dsy_dy)), 1.0, 4.0);
    }
  } else if (transform_mode == 2u) {
    let rows = i32(u_transform.extra.x + 0.5);
    let cols = i32(u_transform.extra.y + 0.5);
    let use_bicubic = (u32(u_transform.extra.w + 0.5) & 1u) == 1u;
    let solved = solve_mesh_inverse_wgsl(rows, cols, dx, dy, use_bicubic);
    if (solved.z < 0.5) {
      valid = false;
    } else {
      sx = solved.x;
      sy = solved.y;
    }
  } else if (transform_mode == 3u) {
    let op_count = u32(u_transform.extra.z + 0.5);
    let warped = apply_liquify_inverse_wgsl(op_count, dx, dy);
    sx = warped.x;
    sy = warped.y;
  }

  let out_idx = gid.y * dst_w + gid.x;
  if (!valid) {
    dst_pixels[out_idx] = 0u;
    return;
  }

  let sampled = resample_source_rgba(sx, sy, src_w, src_h, resampler_mode, fsx, fsy);
  dst_pixels[out_idx] = pack_rgba8(sampled);
}
`;
