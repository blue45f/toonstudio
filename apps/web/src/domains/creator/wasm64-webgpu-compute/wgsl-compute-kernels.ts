/**
 * 제로 코스트($0) WebGPU WGSL 컴퓨트 셰이더 3종 및 정적 구조 검증기.
 * - `WGSL_SEPARABLE_GAUSSIAN_BLUR`: 2패스(수평/수직) 공유 메모리 타일 RGBA8 분리형 가우시안 블러
 * - `WGSL_PROCEDURAL_HALFTONE_SCREENTONE`: 점·선·크로스해치·다이아몬드 프로시저럴 웹툰 스크린톤
 * - `WGSL_LT_GBUFFER_CONTOUR`: 3D LT 라인아트용 깊이·법선 Sobel + 오브젝트 ID 외곽선 추출
 */

export const WGSL_WORKGROUP_X = 16 as const;
export const WGSL_WORKGROUP_Y = 16 as const;
export const WGSL_WORKGROUP_THREADS = 256 as const;
export const WGSL_MAX_BLUR_RADIUS = 32 as const;

export type HalftonePatternMode = "dot" | "line" | "crosshatch" | "diamond";
export const HALFTONE_MODE_CODES: Readonly<Record<HalftonePatternMode, number>> = {
  dot: 0,
  line: 1,
  crosshatch: 2,
  diamond: 3,
};

export type WgslKernelId =
  | "separable-gaussian-blur"
  | "procedural-halftone-screentone"
  | "lt-gbuffer-contour";

export interface WgslKernelDescriptor {
  readonly id: WgslKernelId;
  readonly entryPoint: "main";
  readonly workgroupSize: readonly [16, 16, 1];
  readonly bindingCount: number;
  readonly uniformByteLength: number;
  readonly source: string;
}

export interface WgslBindingSlot {
  readonly group: number;
  readonly binding: number;
}

export interface WgslValidationResult {
  readonly valid: boolean;
  readonly entryPoints: readonly string[];
  readonly workgroupSize: readonly [number, number, number] | null;
  readonly bindings: readonly WgslBindingSlot[];
  readonly usesWorkgroupMemory: boolean;
  readonly usesWorkgroupBarrier: boolean;
  readonly errors: readonly string[];
}

export interface DispatchWorkgroupGrid {
  readonly x: number;
  readonly y: number;
  readonly z: 1;
  readonly workgroupX: number;
  readonly workgroupY: number;
  readonly totalWorkgroups: number;
  readonly totalInvocations: number;
}

const WGSL_RGBA8_UTILS = /* wgsl */ `
fn unpack_rgba8(p: u32) -> vec4<f32> {
  return vec4<f32>(f32(p & 0xffu), f32((p >> 8u) & 0xffu), f32((p >> 16u) & 0xffu), f32((p >> 24u) & 0xffu)) / 255.0;
}
fn pack_rgba8(c: vec4<f32>) -> u32 {
  let s = clamp(c, vec4<f32>(0.0), vec4<f32>(1.0)) * 255.0;
  return u32(round(s.r)) | (u32(round(s.g)) << 8u) | (u32(round(s.b)) << 16u) | (u32(round(s.a)) << 24u);
}`;

export const WGSL_SEPARABLE_GAUSSIAN_BLUR: string = /* wgsl */ `
struct GaussianBlurParams {
  width: u32, height: u32, radius: u32, direction: u32,
  sigma: f32, pad0: u32, pad1: u32, pad2: u32,
}
@group(0) @binding(0) var<uniform> params: GaussianBlurParams;
@group(0) @binding(1) var<storage, read> src_pixels: array<u32>;
@group(0) @binding(2) var<storage, read_write> dst_pixels: array<u32>;
const TILE_HALO: i32 = 8;
const MAX_BLUR_RADIUS: u32 = 32u;
var<workgroup> tile_cache: array<vec4<f32>, 512>;
${WGSL_RGBA8_UTILS}
fn sample_clamped(x: i32, y: i32) -> vec4<f32> {
  let cx = u32(clamp(x, 0, i32(params.width) - 1));
  let cy = u32(clamp(y, 0, i32(params.height) - 1));
  return unpack_rgba8(src_pixels[cy * params.width + cx]);
}
@compute @workgroup_size(16, 16)
fn main(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
  @builtin(workgroup_id) wid: vec3<u32>,
) {
  let valid_surface = params.width > 0u && params.height > 0u;
  if (valid_surface) {
    let ox = i32(wid.x * 16u);
    let oy = i32(wid.y * 16u);
    if (params.direction == 0u) {
      let y = oy + i32(lid.y);
      tile_cache[lid.y * 32u + lid.x] = sample_clamped(ox + i32(lid.x) - TILE_HALO, y);
      tile_cache[lid.y * 32u + lid.x + 16u] = sample_clamped(ox + i32(lid.x) + TILE_HALO, y);
    } else {
      let x = ox + i32(lid.x);
      tile_cache[lid.y * 16u + lid.x] = sample_clamped(x, oy + i32(lid.y) - TILE_HALO);
      tile_cache[(lid.y + 16u) * 16u + lid.x] = sample_clamped(x, oy + i32(lid.y) + TILE_HALO);
    }
  }
  workgroupBarrier();
  if (!valid_surface || gid.x >= params.width || gid.y >= params.height) { return; }
  let r = i32(min(params.radius, MAX_BLUR_RADIUS));
  let sigma = max(params.sigma, 0.25);
  let inv_two_sigma_sq = 0.5 / (sigma * sigma);
  var accum = vec4<f32>(0.0);
  var weight_sum: f32 = 0.0;
  for (var d: i32 = -r; d <= r; d = d + 1) {
    let w = exp(-(f32(d) * f32(d)) * inv_two_sigma_sq);
    var tap: vec4<f32>;
    if (abs(d) <= TILE_HALO) {
      tap = select(
        tile_cache[u32(i32(lid.y) + TILE_HALO + d) * 16u + lid.x],
        tile_cache[lid.y * 32u + u32(i32(lid.x) + TILE_HALO + d)],
        params.direction == 0u,
      );
    } else if (params.direction == 0u) {
      tap = sample_clamped(i32(gid.x) + d, i32(gid.y));
    } else {
      tap = sample_clamped(i32(gid.x), i32(gid.y) + d);
    }
    accum = accum + tap * w;
    weight_sum = weight_sum + w;
  }
  dst_pixels[gid.y * params.width + gid.x] = pack_rgba8(accum / max(weight_sum, 1e-6));
}`;

export const WGSL_PROCEDURAL_HALFTONE_SCREENTONE: string = /* wgsl */ `
struct HalftoneScreentoneParams {
  width: u32, height: u32, mode: u32, use_input_luma: u32,
  angle_rad: f32, lpi_pitch_px: f32, density_bias: f32, edge_softness: f32,
  ink_rgba: u32, paper_rgba: u32, origin_x: f32, origin_y: f32,
}
@group(0) @binding(0) var<uniform> params: HalftoneScreentoneParams;
@group(0) @binding(1) var<storage, read> src_pixels: array<u32>;
@group(0) @binding(2) var<storage, read_write> dst_pixels: array<u32>;
var<workgroup> screen_basis: array<f32, 4>;
${WGSL_RGBA8_UTILS}
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_index) lidx: u32) {
  if (lidx == 0u) {
    screen_basis[0] = cos(params.angle_rad);
    screen_basis[1] = sin(params.angle_rad);
    screen_basis[2] = 1.0 / max(params.lpi_pitch_px, 1.0);
    screen_basis[3] = clamp(params.edge_softness, 0.005, 0.35);
  }
  workgroupBarrier();
  if (params.width == 0u || params.height == 0u || gid.x >= params.width || gid.y >= params.height) { return; }
  let idx = gid.y * params.width + gid.x;
  var density = clamp(params.density_bias, 0.0, 1.0);
  if (params.use_input_luma != 0u) {
    let src = unpack_rgba8(src_pixels[idx]);
    density = clamp((1.0 - dot(src.rgb, vec3<f32>(0.299, 0.587, 0.114))) * src.a, 0.0, 1.0);
  }
  let px = (f32(gid.x) + 0.5) - params.origin_x;
  let py = (f32(gid.y) + 0.5) - params.origin_y;
  let rot_u = (px * screen_basis[0] - py * screen_basis[1]) * screen_basis[2];
  let rot_v = (px * screen_basis[1] + py * screen_basis[0]) * screen_basis[2];
  let cell = vec2<f32>(fract(rot_u) - 0.5, fract(rot_v) - 0.5);
  var field: f32 = length(cell);
  var threshold: f32 = sqrt(density) * 0.5641896;
  if (params.mode == 1u) {
    field = abs(cell.y);
    threshold = density * 0.5;
  } else if (params.mode == 2u) {
    field = min(abs(cell.x), abs(cell.y));
    threshold = (1.0 - sqrt(max(0.0, 1.0 - density))) * 0.5;
  } else if (params.mode == 3u) {
    field = abs(cell.x) + abs(cell.y);
    threshold = sqrt(density) * 0.7071068;
  }
  let ink_cov = 1.0 - smoothstep(threshold - screen_basis[3], threshold + screen_basis[3], field);
  dst_pixels[idx] = pack_rgba8(mix(unpack_rgba8(params.paper_rgba), unpack_rgba8(params.ink_rgba), ink_cov));
}`;

export const WGSL_LT_GBUFFER_CONTOUR: string = /* wgsl */ `
struct LtGbufferContourParams {
  width: u32, height: u32, ink_rgba: u32, flags: u32,
  depth_threshold: f32, normal_threshold: f32, edge_softness: f32, line_strength: f32,
}
@group(0) @binding(0) var<uniform> params: LtGbufferContourParams;
@group(0) @binding(1) var<storage, read> depth_buffer: array<f32>;
@group(0) @binding(2) var<storage, read> normal_buffer: array<u32>;
@group(0) @binding(3) var<storage, read> object_id_buffer: array<u32>;
@group(0) @binding(4) var<storage, read_write> out_contour_pixels: array<u32>;
const HALO_DIM: u32 = 18u;
const HALO_CELLS: u32 = 324u;
var<workgroup> wg_depth: array<f32, 324>;
var<workgroup> wg_normal: array<vec3<f32>, 324>;
var<workgroup> wg_obj_id: array<u32, 324>;
${WGSL_RGBA8_UTILS}
fn unpack_normal_rgb8(packed: u32) -> vec3<f32> {
  let n = unpack_rgba8(packed).xyz * 2.0 - vec3<f32>(1.0);
  return n / max(length(n), 1e-5);
}
@compute @workgroup_size(16, 16)
fn main(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
  @builtin(local_invocation_index) lidx: u32,
  @builtin(workgroup_id) wid: vec3<u32>,
) {
  let valid_surface = params.width > 0u && params.height > 0u;
  if (valid_surface) {
    let bx = i32(wid.x * 16u) - 1;
    let by = i32(wid.y * 16u) - 1;
    var slot = lidx;
    loop {
      if (slot >= HALO_CELLS) { break; }
      let cx = u32(clamp(bx + i32(slot % HALO_DIM), 0, i32(params.width) - 1));
      let cy = u32(clamp(by + i32(slot / HALO_DIM), 0, i32(params.height) - 1));
      let gidx = cy * params.width + cx;
      wg_depth[slot] = depth_buffer[gidx];
      wg_normal[slot] = unpack_normal_rgb8(normal_buffer[gidx]);
      wg_obj_id[slot] = object_id_buffer[gidx];
      slot = slot + 256u;
    }
  }
  workgroupBarrier();
  if (!valid_surface || gid.x >= params.width || gid.y >= params.height) { return; }
  let lx = lid.x + 1u;
  let ly = lid.y + 1u;
  let c00 = (ly - 1u) * HALO_DIM + (lx - 1u); let c10 = c00 + 1u; let c20 = c00 + 2u;
  let c01 = ly * HALO_DIM + (lx - 1u);        let c11 = c01 + 1u; let c21 = c01 + 2u;
  let c02 = (ly + 1u) * HALO_DIM + (lx - 1u); let c12 = c02 + 1u; let c22 = c02 + 2u;
  let d_gx = -wg_depth[c00] + wg_depth[c20] - 2.0 * wg_depth[c01] + 2.0 * wg_depth[c21] - wg_depth[c02] + wg_depth[c22];
  let d_gy = -wg_depth[c00] - 2.0 * wg_depth[c10] - wg_depth[c20] + wg_depth[c02] + 2.0 * wg_depth[c12] + wg_depth[c22];
  let d_norm = sqrt(d_gx * d_gx + d_gy * d_gy) / max(abs(wg_depth[c11]), 1e-4);
  let n_gx = -wg_normal[c00] + wg_normal[c20] - 2.0 * wg_normal[c01] + 2.0 * wg_normal[c21] - wg_normal[c02] + wg_normal[c22];
  let n_gy = -wg_normal[c00] - 2.0 * wg_normal[c10] - wg_normal[c20] + wg_normal[c02] + 2.0 * wg_normal[c12] + wg_normal[c22];
  let n_grad = sqrt(dot(n_gx, n_gx) + dot(n_gy, n_gy));
  let cid = wg_obj_id[c11];
  let id_diff = u32(wg_obj_id[c00] != cid) + u32(wg_obj_id[c10] != cid) + u32(wg_obj_id[c20] != cid)
    + u32(wg_obj_id[c01] != cid) + u32(wg_obj_id[c21] != cid)
    + u32(wg_obj_id[c02] != cid) + u32(wg_obj_id[c12] != cid) + u32(wg_obj_id[c22] != cid);
  let id_edge = select(0.0, clamp(f32(id_diff) * 0.35 + 0.65, 0.0, 1.0), id_diff > 0u);
  let soft = max(params.edge_softness, 0.001);
  let d_edge = smoothstep(params.depth_threshold, params.depth_threshold + soft, d_norm);
  let n_edge = smoothstep(params.normal_threshold, params.normal_threshold + soft, n_grad);
  let alpha = clamp(max(max(d_edge, n_edge), id_edge) * params.line_strength, 0.0, 1.0);
  let ink = unpack_rgba8(params.ink_rgba);
  out_contour_pixels[gid.y * params.width + gid.x] = pack_rgba8(vec4<f32>(ink.rgb, ink.a * alpha));
}`;

export const WGSL_COMPUTE_KERNELS: Readonly<Record<WgslKernelId, WgslKernelDescriptor>> = {
  "separable-gaussian-blur": {
    id: "separable-gaussian-blur", entryPoint: "main", workgroupSize: [WGSL_WORKGROUP_X, WGSL_WORKGROUP_Y, 1],
    bindingCount: 3, uniformByteLength: 32, source: WGSL_SEPARABLE_GAUSSIAN_BLUR,
  },
  "procedural-halftone-screentone": {
    id: "procedural-halftone-screentone", entryPoint: "main", workgroupSize: [WGSL_WORKGROUP_X, WGSL_WORKGROUP_Y, 1],
    bindingCount: 3, uniformByteLength: 48, source: WGSL_PROCEDURAL_HALFTONE_SCREENTONE,
  },
  "lt-gbuffer-contour": {
    id: "lt-gbuffer-contour", entryPoint: "main", workgroupSize: [WGSL_WORKGROUP_X, WGSL_WORKGROUP_Y, 1],
    bindingCount: 5, uniformByteLength: 32, source: WGSL_LT_GBUFFER_CONTOUR,
  },
};

function stripWgslComments(source: string): { readonly code: string; readonly unclosedBlockComment: boolean } {
  let code = "";
  let depth = 0;
  for (let i = 0; i < source.length; i += 1) {
    const pair = source.slice(i, i + 2);
    if (depth === 0 && pair === "//") {
      while (i < source.length && source[i] !== "\n") i += 1;
      code += "\n";
    } else if (pair === "/*") {
      depth += 1;
      i += 1;
    } else if (depth > 0 && pair === "*/") {
      depth -= 1;
      i += 1;
    } else if (depth === 0) {
      code += source[i];
    }
  }
  return { code, unclosedBlockComment: depth > 0 };
}

function checkBalancedDelimiters(code: string): string[] {
  const errors: string[] = [];
  const stack: string[] = [];
  const pairs: Record<string, string> = { ")": "(", "}": "{", "]": "[" };
  for (let i = 0; i < code.length; i += 1) {
    const ch = code[i];
    if (ch === "(" || ch === "{" || ch === "[") stack.push(ch);
    else if ((ch === ")" || ch === "}" || ch === "]") && stack.pop() !== pairs[ch]) {
      errors.push(`Unbalanced delimiter '${ch}' at offset ${i}`);
    }
  }
  if (stack.length > 0) errors.push(`Unclosed delimiters remaining: ${stack.join("")}`);
  return errors;
}

export function validateWgslComputeShader(source: string, expectedEntryPoint = "main"): WgslValidationResult {
  if (source.trim().length === 0) {
    return {
      valid: false, entryPoints: [], workgroupSize: null, bindings: [],
      usesWorkgroupMemory: false, usesWorkgroupBarrier: false, errors: ["WGSL source must not be empty"],
    };
  }
  const { code, unclosedBlockComment } = stripWgslComments(source);
  const errors = checkBalancedDelimiters(code);
  if (unclosedBlockComment) errors.push("Unclosed /* block comment");
  if (!/@compute\b/.test(code)) errors.push("Missing @compute shader stage attribute");

  let workgroupSize: readonly [number, number, number] | null = null;
  const wgMatch = /@workgroup_size\(\s*(\d+)u?(?:\s*,\s*(\d+)u?)?(?:\s*,\s*(\d+)u?)?\s*,?\s*\)/.exec(code);
  if (!wgMatch) {
    errors.push("Missing or malformed @workgroup_size(...) attribute");
  } else {
    const x = Number.parseInt(wgMatch[1], 10);
    const y = wgMatch[2] ? Number.parseInt(wgMatch[2], 10) : 1;
    const z = wgMatch[3] ? Number.parseInt(wgMatch[3], 10) : 1;
    if (x <= 0 || y <= 0 || z <= 0 || x * y * z > WGSL_WORKGROUP_THREADS) {
      errors.push(`Invalid @workgroup_size(${x}, ${y}, ${z}); invocations must be 1..${WGSL_WORKGROUP_THREADS}`);
    } else {
      workgroupSize = [x, y, z];
    }
  }

  const entryPoints: string[] = [];
  const entryRegex = /@compute[\s\S]*?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  for (let m = entryRegex.exec(code); m !== null; m = entryRegex.exec(code)) entryPoints.push(m[1]);
  if (entryPoints.length === 0) errors.push("No @compute entry point function found");
  else if (expectedEntryPoint && !entryPoints.includes(expectedEntryPoint)) {
    errors.push(`Expected entry point '${expectedEntryPoint}' not found (found: ${entryPoints.join(", ")})`);
  }

  const bindings: WgslBindingSlot[] = [];
  const seen = new Set<string>();
  const bindRegex = /@group\(\s*(\d+)\s*\)\s*@binding\(\s*(\d+)\s*\)|@binding\(\s*(\d+)\s*\)\s*@group\(\s*(\d+)\s*\)/g;
  for (let m = bindRegex.exec(code); m !== null; m = bindRegex.exec(code)) {
    const group = Number.parseInt(m[1] ?? m[4], 10);
    const binding = Number.parseInt(m[2] ?? m[3], 10);
    const key = `${group}:${binding}`;
    if (seen.has(key)) errors.push(`Duplicate @group(${group}) @binding(${binding}) declaration`);
    else { seen.add(key); bindings.push({ group, binding }); }
  }
  if (bindings.length === 0) errors.push("No @group/@binding resource declarations found");

  return {
    valid: errors.length === 0, entryPoints, workgroupSize, bindings,
    usesWorkgroupMemory: /\bvar\s*<\s*workgroup\s*>/.test(code),
    usesWorkgroupBarrier: /\bworkgroupBarrier\s*\(\s*\)/.test(code),
    errors,
  };
}

export function computeDispatchWorkgroups(
  width: number,
  height: number,
  workgroupX: number = WGSL_WORKGROUP_X,
  workgroupY: number = WGSL_WORKGROUP_Y,
): DispatchWorkgroupGrid {
  if (!Number.isFinite(workgroupX) || !Number.isFinite(workgroupY) || workgroupX <= 0 || workgroupY <= 0) {
    throw new RangeError(`Invalid workgroup size: (${workgroupX}, ${workgroupY})`);
  }
  const wgX = Math.floor(workgroupX);
  const wgY = Math.floor(workgroupY);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { x: 0, y: 0, z: 1, workgroupX: wgX, workgroupY: wgY, totalWorkgroups: 0, totalInvocations: 0 };
  }
  const x = Math.ceil(width / wgX);
  const y = Math.ceil(height / wgY);
  const totalWorkgroups = x * y;
  return { x, y, z: 1, workgroupX: wgX, workgroupY: wgY, totalWorkgroups, totalInvocations: totalWorkgroups * wgX * wgY };
}
