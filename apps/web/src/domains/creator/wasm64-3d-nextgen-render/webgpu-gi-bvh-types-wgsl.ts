/**
 * 3D SSGI · PCSS · Wave-2 32바이트 SAH BVH 레이트레이싱 공용 타입 · WGSL 셰이더 · BVH 빌더/패커.
 *
 * - Wave-2 `crates/studio-wasm64-drawing-core/src/bvh3d_sah_raycast_kernel.rs`의
 *   `#[repr(C, align(32))] SahBvhNode3D`와 비트 단위 호환되는 32바이트 노드 레이아웃
 * - WebGPU 기본 스토리지 버퍼 한도(8개)를 준수하는 `@workgroup_size(16, 16)` WGSL 셰이더 및 정적 검증기
 */

export const GI_RT_WORKGROUP_X = 16 as const;
export const GI_RT_WORKGROUP_Y = 16 as const;
export const GI_RT_UNIFORM_BYTES = 64 as const;
export const SAH_BVH_NODE_BYTES = 32 as const;
export const BVH_TRIANGLE_STRIDE_BYTES = 64 as const;
export const GI_RT_MAX_BVH_STACK = 32 as const;

export const GI_RT_FLAGS = {
  ENABLE_SSGI: 1 << 0,
  ENABLE_PCSS: 1 << 1,
  ENABLE_RT_REFLECTION: 1 << 2,
  ENABLE_RT_REFRACTION: 1 << 3,
  ENABLE_TEMPORAL_ACCUM: 1 << 4,
} as const;

export const GI_RT_GPU_BUFFER_USAGE = {
  MAP_READ: 0x0001,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  UNIFORM: 0x0040,
  STORAGE: 0x0080,
} as const;

export type Vec3Tuple = readonly [number, number, number];

/** Wave-2 `bvh3d_sah_raycast_kernel.rs`의 `#[repr(C, align(32))] SahBvhNode3D`와 동일한 32바이트 구조. */
export interface SahBvhNode3d {
  readonly boundsMin: Vec3Tuple;
  /** 리프(`triCount > 0`)이면 `primIndices` 시작 오프셋, 내부 노드(`triCount === 0`)이면 왼쪽 자식 인덱스(오른쪽 = `+ 1`). */
  readonly leftOrFirst: number;
  readonly boundsMax: Vec3Tuple;
  /** 리프 삼각형 개수(`0`이면 내부 노드). */
  readonly triCount: number;
}

/** 64바이트 GPU 스토리지 레이아웃으로 패킹되는 레이트레이싱 삼각형 + 재질 속성. */
export interface RaytraceTriangle3d {
  readonly v0: Vec3Tuple;
  readonly v1: Vec3Tuple;
  readonly v2: Vec3Tuple;
  readonly albedo: Vec3Tuple;
  readonly roughness?: number;
  readonly ior?: number;
  readonly reflectivity?: number;
  readonly transmission?: number;
}

/** CPU/GPU 공용 SAH BVH 패킹 결과(32B 노드 버퍼 + 64B 삼각형 버퍼). */
export interface PackedSahBvh3d {
  readonly nodes: readonly SahBvhNode3d[];
  readonly primIndices: Uint32Array;
  readonly nodeBuffer: ArrayBuffer;
  readonly nodeBytes: Uint8Array;
  readonly triangleBuffer: ArrayBuffer;
  readonly triangleBytes: Uint8Array;
  readonly nodeCount: number;
  readonly triangleCount: number;
  readonly leafCount: number;
  readonly maxDepth: number;
}

export interface GiRaytraceWgslValidation {
  readonly valid: boolean;
  readonly entryPoint: string | null;
  readonly workgroupSize: readonly [number, number, number] | null;
  readonly bindings: readonly { readonly group: number; readonly binding: number }[];
  readonly hasUniformStruct: boolean;
  readonly hasSahBvhNodeStruct: boolean;
  readonly hasSsgiBounce: boolean;
  readonly hasPcssPenumbra: boolean;
  readonly hasBvhRayTraversal: boolean;
  readonly hasSnellRefraction: boolean;
  readonly usesWorkgroupBarrier: boolean;
  readonly errors: readonly string[];
}

export interface GiGpuBufferLike {
  readonly size: number;
  readonly usage: number;
  destroy(): void;
}
export interface GiGpuShaderModuleLike {
  readonly label?: string;
}
export interface GiGpuBindGroupLayoutLike {
  readonly label?: string;
}
export interface GiGpuPipelineLike {
  readonly label?: string;
  getBindGroupLayout(index: number): GiGpuBindGroupLayoutLike;
}
export interface GiGpuBindGroupLike {
  readonly label?: string;
}
export interface GiGpuCommandBufferLike {
  readonly label?: string;
}
export interface GiGpuPassEncoderLike {
  setPipeline(pipeline: GiGpuPipelineLike): void;
  setBindGroup(index: number, bindGroup: GiGpuBindGroupLike): void;
  dispatchWorkgroups(x: number, y?: number, z?: number): void;
  end(): void;
}
export interface GiGpuCommandEncoderLike {
  beginComputePass(descriptor?: { readonly label?: string }): GiGpuPassEncoderLike;
  finish(descriptor?: { readonly label?: string }): GiGpuCommandBufferLike;
}
export interface GiGpuPipelineDescriptor {
  readonly label: string;
  readonly layout: "auto";
  readonly compute: { readonly module: GiGpuShaderModuleLike; readonly entryPoint: "main" };
}
export interface GiGpuDeviceLike {
  readonly queue: {
    writeBuffer(buffer: GiGpuBufferLike, bufferOffset: number, data: ArrayBufferLike | ArrayBufferView): void;
    submit(commandBuffers: readonly GiGpuCommandBufferLike[]): void;
  };
  createShaderModule(descriptor: { readonly code: string; readonly label?: string }): GiGpuShaderModuleLike;
  createBuffer(descriptor: { readonly size: number; readonly usage: number; readonly label?: string }): GiGpuBufferLike;
  createComputePipelineAsync?: (descriptor: GiGpuPipelineDescriptor) => Promise<GiGpuPipelineLike>;
  createComputePipeline?: (descriptor: GiGpuPipelineDescriptor) => GiGpuPipelineLike;
  createBindGroup(descriptor: {
    readonly label?: string;
    readonly layout: GiGpuBindGroupLayoutLike;
    readonly entries: readonly {
      readonly binding: number;
      readonly resource: { readonly buffer: GiGpuBufferLike; readonly offset?: number; readonly size?: number };
    }[];
  }): GiGpuBindGroupLike;
  createCommandEncoder(descriptor?: { readonly label?: string }): GiGpuCommandEncoderLike;
}

/**
 * WebGPU Compute(`@workgroup_size(16, 16)`) 3D SSGI + PCSS + Wave-2 32B SAH BVH 반사/굴절 셰이더.
 */
export const WGSL_3D_GI_SHADOW_RAYTRACE: string = /* wgsl */ `
struct GiShadowRaytraceUniforms {
  width: u32, height: u32, frame_index: u32, flags_and_shadow_dim: u32,
  light_dir_x: f32, light_dir_y: f32, light_dir_z: f32, light_size: f32,
  gi_intensity: f32, gi_radius_px: f32, temporal_weight: f32, shadow_bias: f32,
  ior: f32, reflection_strength: f32, refraction_strength: f32, bvh_node_count: u32,
}
struct SahBvhNode3D {
  bounds_min: vec3<f32>, left_or_first: u32,
  bounds_max: vec3<f32>, tri_count: u32,
}
struct BvhTriangle3D {
  v0: vec3<f32>, roughness: f32, v1: vec3<f32>, ior: f32,
  v2: vec3<f32>, reflectivity: f32, albedo: vec3<f32>, transmission: f32,
}
struct BvhHitResult {
  hit: u32, t: f32, tri_index: u32, normal: vec3<f32>, albedo: vec3<f32>,
}
@group(0) @binding(0) var<uniform> params: GiShadowRaytraceUniforms;
@group(0) @binding(1) var<storage, read> gbuf_albedo_history: array<u32>;
@group(0) @binding(2) var<storage, read> gbuf_normal_depth: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> gbuf_material: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> shadow_depth_map: array<f32>;
@group(0) @binding(5) var<storage, read> bvh_nodes: array<SahBvhNode3D>;
@group(0) @binding(6) var<storage, read> bvh_prim_indices: array<u32>;
@group(0) @binding(7) var<storage, read> bvh_triangles: array<BvhTriangle3D>;
@group(0) @binding(8) var<storage, read_write> dst_rgba: array<u32>;
var<workgroup> wg_vogel_offsets: array<vec2<f32>, 8>;

fn unpack_rgba8(p: u32) -> vec4<f32> {
  return vec4<f32>(f32(p & 0xffu), f32((p >> 8u) & 0xffu), f32((p >> 16u) & 0xffu), f32((p >> 24u) & 0xffu)) / 255.0;
}
fn pack_rgba8(c: vec4<f32>) -> u32 {
  let s = clamp(c, vec4<f32>(0.0), vec4<f32>(1.0)) * 255.0;
  return u32(round(s.r)) | (u32(round(s.g)) << 8u) | (u32(round(s.b)) << 16u) | (u32(round(s.a)) << 24u);
}
fn ign_hash(px: u32, py: u32, frame: u32) -> f32 {
  let fx = f32(px) + f32(frame & 63u) * 5.588238;
  let fy = f32(py) + f32(frame & 63u) * 7.123457;
  return fract(52.9829189 * fract(0.06711056 * fx + 0.00583715 * fy));
}
fn sample_shadow_map_clamped(uv: vec2<f32>, dim: u32) -> f32 {
  if (dim == 0u) { return 1.0; }
  let max_c = i32(dim) - 1;
  let sx = u32(clamp(i32(floor(uv.x * f32(dim))), 0, max_c));
  let sy = u32(clamp(i32(floor(uv.y * f32(dim))), 0, max_c));
  return shadow_depth_map[sy * dim + sx];
}
fn evaluate_pcss_visibility(uv: vec2<f32>, receiver_depth: f32, rot: f32, shadow_dim: u32) -> f32 {
  if (shadow_dim == 0u) { return 1.0; }
  let cos_r = cos(rot); let sin_r = sin(rot);
  let texel = 1.0 / f32(shadow_dim);
  let search_radius = max(params.light_size * 0.25, texel * 1.5);
  var blocker_sum: f32 = 0.0; var blocker_count: f32 = 0.0;
  for (var i: u32 = 0u; i < 8u; i = i + 1u) {
    let o = wg_vogel_offsets[i];
    let rot_o = vec2<f32>(o.x * cos_r - o.y * sin_r, o.x * sin_r + o.y * cos_r);
    let sd = sample_shadow_map_clamped(uv + rot_o * search_radius, shadow_dim);
    if (sd + params.shadow_bias < receiver_depth) { blocker_sum = blocker_sum + sd; blocker_count = blocker_count + 1.0; }
  }
  if (blocker_count < 0.5) { return 1.0; }
  let avg_blocker = max(blocker_sum / blocker_count, 1e-4);
  let penumbra_ratio = max(receiver_depth - avg_blocker, 0.0) / avg_blocker;
  let filter_radius = clamp(penumbra_ratio * params.light_size, texel * 0.5, 0.12);
  var lit_sum: f32 = 0.0;
  for (var j: u32 = 0u; j < 8u; j = j + 1u) {
    let o = wg_vogel_offsets[j];
    let rot_o = vec2<f32>(o.x * cos_r - o.y * sin_r, o.x * sin_r + o.y * cos_r);
    let sd = sample_shadow_map_clamped(uv + rot_o * filter_radius, shadow_dim);
    if (receiver_depth <= sd + params.shadow_bias) { lit_sum = lit_sum + 1.0; }
  }
  return lit_sum * 0.125;
}
fn evaluate_ssgi_bounce(px: u32, py: u32, normal: vec3<f32>, depth: f32, rot: f32) -> vec3<f32> {
  let cos_r = cos(rot); let sin_r = sin(rot);
  let radius = max(params.gi_radius_px, 1.0);
  var accum = vec3<f32>(0.0); var weight_sum: f32 = 0.0;
  for (var i: u32 = 0u; i < 8u; i = i + 1u) {
    let o = wg_vogel_offsets[i];
    let dir2 = vec2<f32>(o.x * cos_r - o.y * sin_r, o.x * sin_r + o.y * cos_r);
    let sx = clamp(i32(px) + i32(round(dir2.x * radius)), 0, i32(params.width) - 1);
    let sy = clamp(i32(py) + i32(round(dir2.y * radius)), 0, i32(params.height) - 1);
    let sidx = u32(sy) * params.width + u32(sx);
    let s_nd = gbuf_normal_depth[sidx];
    if (s_nd.w <= 0.0) { continue; }
    let s_albedo = unpack_rgba8(gbuf_albedo_history[sidx]).rgb;
    let delta_z = depth - s_nd.w;
    let hemi_dir = normalize(vec3<f32>(dir2.x, -dir2.y, max(delta_z * 2.5 + 0.35, 0.08)));
    let w = max(dot(normal, hemi_dir), 0.0) * exp(-abs(delta_z) * 4.0);
    accum = accum + s_albedo * w; weight_sum = weight_sum + w;
  }
  if (weight_sum <= 1e-5) { return vec3<f32>(0.0); }
  return (accum / weight_sum) * params.gi_intensity;
}
fn ray_aabb_slab(origin: vec3<f32>, inv_dir: vec3<f32>, bmin: vec3<f32>, bmax: vec3<f32>, t_max: f32) -> f32 {
  let t0 = (bmin - origin) * inv_dir; let t1 = (bmax - origin) * inv_dir;
  let tsmall = min(t0, t1); let tbig = max(t0, t1);
  let t_enter = max(max(tsmall.x, tsmall.y), max(tsmall.z, 1e-4));
  let t_exit = min(min(tbig.x, tbig.y), min(tbig.z, t_max));
  if (t_exit < t_enter) { return -1.0; }
  return t_enter;
}
fn trace_sah_bvh_ray(origin: vec3<f32>, raw_dir: vec3<f32>, max_dist: f32) -> BvhHitResult {
  var res: BvhHitResult;
  res.hit = 0u; res.t = max_dist; res.tri_index = 0u; res.normal = vec3<f32>(0.0, 1.0, 0.0); res.albedo = vec3<f32>(0.0);
  if (params.bvh_node_count == 0u) { return res; }
  let dir = normalize(raw_dir);
  let inv_dir = vec3<f32>(
    select(1.0 / dir.x, 1e9, abs(dir.x) < 1e-7),
    select(1.0 / dir.y, 1e9, abs(dir.y) < 1e-7),
    select(1.0 / dir.z, 1e9, abs(dir.z) < 1e-7),
  );
  var stack: array<u32, 32>;
  var sp: u32 = 0u;
  if (ray_aabb_slab(origin, inv_dir, bvh_nodes[0u].bounds_min, bvh_nodes[0u].bounds_max, res.t) < 0.0) { return res; }
  stack[0u] = 0u; sp = 1u;
  while (sp > 0u) {
    sp = sp - 1u;
    let node = bvh_nodes[stack[sp]];
    if (node.tri_count > 0u) {
      let first = node.left_or_first;
      for (var k: u32 = 0u; k < node.tri_count; k = k + 1u) {
        let tri_idx = bvh_prim_indices[first + k];
        let tri = bvh_triangles[tri_idx];
        let e1 = tri.v1 - tri.v0; let e2 = tri.v2 - tri.v0;
        let pvec = cross(dir, e2); let det = dot(e1, pvec);
        if (abs(det) < 1e-7) { continue; }
        let inv_det = 1.0 / det; let tvec = origin - tri.v0;
        let u = dot(tvec, pvec) * inv_det;
        if (u < 0.0 || u > 1.0) { continue; }
        let qvec = cross(tvec, e1); let v = dot(dir, qvec) * inv_det;
        if (v < 0.0 || u + v > 1.0) { continue; }
        let t = dot(e2, qvec) * inv_det;
        if (t > 1e-4 && t < res.t) {
          res.hit = 1u; res.t = t; res.tri_index = tri_idx; res.normal = normalize(cross(e1, e2)); res.albedo = tri.albedo;
        }
      }
    } else {
      let lc = node.left_or_first; let rc = lc + 1u;
      let tl = ray_aabb_slab(origin, inv_dir, bvh_nodes[lc].bounds_min, bvh_nodes[lc].bounds_max, res.t);
      let tr = ray_aabb_slab(origin, inv_dir, bvh_nodes[rc].bounds_min, bvh_nodes[rc].bounds_max, res.t);
      if (tl >= 0.0 && tr >= 0.0) {
        if (sp < 31u) {
          if (tl <= tr) { stack[sp] = rc; sp = sp + 1u; stack[sp] = lc; sp = sp + 1u; }
          else { stack[sp] = lc; sp = sp + 1u; stack[sp] = rc; sp = sp + 1u; }
        }
      } else if (tl >= 0.0 && sp < 32u) { stack[sp] = lc; sp = sp + 1u; }
      else if (tr >= 0.0 && sp < 32u) { stack[sp] = rc; sp = sp + 1u; }
    }
  }
  return res;
}
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_index) lidx: u32) {
  if (lidx < 8u) {
    let r = sqrt((f32(lidx) + 0.5) / 8.0); let theta = f32(lidx) * 2.39996323;
    wg_vogel_offsets[lidx] = vec2<f32>(cos(theta) * r, sin(theta) * r);
  }
  workgroupBarrier();
  if (params.width == 0u || params.height == 0u || gid.x >= params.width || gid.y >= params.height) { return; }
  let idx = gid.y * params.width + gid.x;
  let pixel_count = params.width * params.height;
  let albedo_px = unpack_rgba8(gbuf_albedo_history[idx]);
  let nd = gbuf_normal_depth[idx];
  if (nd.w <= 0.0 || albedo_px.a <= 0.002) { dst_rgba[idx] = pack_rgba8(albedo_px); return; }
  let mat = gbuf_material[idx];
  let flags = params.flags_and_shadow_dim & 0xffffu;
  let shadow_dim = (params.flags_and_shadow_dim >> 16u) & 0xffffu;
  let normal = normalize(nd.xyz);
  let light_dir = normalize(vec3<f32>(params.light_dir_x, params.light_dir_y, params.light_dir_z));
  let uv = vec2<f32>((f32(gid.x) + 0.5) / f32(params.width), (f32(gid.y) + 0.5) / f32(params.height));
  let rot = ign_hash(gid.x, gid.y, params.frame_index) * 6.2831853;
  var shadow_vis: f32 = 1.0;
  if ((flags & 2u) != 0u) { shadow_vis = evaluate_pcss_visibility(uv, nd.w, rot, shadow_dim); }
  let ndotl = max(dot(normal, light_dir), 0.0);
  var gi_rgb = vec3<f32>(0.0);
  if ((flags & 1u) != 0u) { gi_rgb = evaluate_ssgi_bounce(gid.x, gid.y, normal, nd.w, rot); }
  var lit_rgb = albedo_px.rgb * (vec3<f32>(0.14, 0.15, 0.18) * mat.w + vec3<f32>(ndotl * shadow_vis) + gi_rgb);
  let view_dir = vec3<f32>(0.0, 0.0, 1.0);
  let world_pos = vec3<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, -nd.w * 10.0);
  let f0 = pow((1.0 - params.ior) / (1.0 + params.ior), 2.0);
  let fresnel = f0 + (1.0 - f0) * pow(1.0 - max(dot(normal, view_dir), 0.0), 5.0);
  if ((flags & 4u) != 0u && params.reflection_strength > 0.001 && params.bvh_node_count > 0u) {
    let r_hit = trace_sah_bvh_ray(world_pos + normal * 0.01, reflect(-view_dir, normal), 40.0);
    let refl_col = select(vec3<f32>(0.55, 0.68, 0.88), r_hit.albedo, r_hit.hit != 0u);
    lit_rgb = mix(lit_rgb, refl_col, clamp((fresnel + mat.y * 0.65) * (1.0 - mat.x * 0.85) * params.reflection_strength, 0.0, 1.0));
  }
  if ((flags & 8u) != 0u && mat.z > 0.01 && params.refraction_strength > 0.001 && params.bvh_node_count > 0u) {
    let refr_raw = refract(-view_dir, normal, 1.0 / max(params.ior, 1.01));
    let refr_dir = select(reflect(-view_dir, normal), refr_raw, length(refr_raw) > 1e-4);
    let t_hit = trace_sah_bvh_ray(world_pos - normal * 0.01, refr_dir, 40.0);
    let refr_col = select(vec3<f32>(0.45, 0.58, 0.78), t_hit.albedo, t_hit.hit != 0u);
    lit_rgb = mix(lit_rgb, refr_col, clamp((1.0 - fresnel) * mat.z * params.refraction_strength, 0.0, 1.0));
  }
  if ((flags & 16u) != 0u && params.temporal_weight > 0.001) {
    let hist = unpack_rgba8(gbuf_albedo_history[pixel_count + idx]).rgb;
    lit_rgb = mix(lit_rgb, hist, clamp(params.temporal_weight, 0.0, 0.95));
  }
  dst_rgba[idx] = pack_rgba8(vec4<f32>(lit_rgb, albedo_px.a));
}`;

function clampNum(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

/** Wave-2 `SahBvhNode3D` 배열을 정확히 노드당 32바이트 바이너리로 직렬화한다. */
export function packSahBvhNodes32B(nodes: readonly SahBvhNode3d[]): ArrayBuffer {
  if (nodes.length === 0) return new ArrayBuffer(0);
  const buffer = new ArrayBuffer(nodes.length * SAH_BVH_NODE_BYTES);
  const view = new DataView(buffer);
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i];
    const base = i * SAH_BVH_NODE_BYTES;
    view.setFloat32(base + 0, n.boundsMin[0], true);
    view.setFloat32(base + 4, n.boundsMin[1], true);
    view.setFloat32(base + 8, n.boundsMin[2], true);
    view.setUint32(base + 12, n.leftOrFirst >>> 0, true);
    view.setFloat32(base + 16, n.boundsMax[0], true);
    view.setFloat32(base + 20, n.boundsMax[1], true);
    view.setFloat32(base + 24, n.boundsMax[2], true);
    view.setUint32(base + 28, n.triCount >>> 0, true);
  }
  return buffer;
}

/** 평면 3D SAH BVH를 구축하고 Wave-2 호환 32B 노드 버퍼와 64B 삼각형 버퍼로 패킹한다. */
export function buildPackedSahBvh3d(
  triangles: readonly RaytraceTriangle3d[],
  maxLeafTriangles: number = 4,
): PackedSahBvh3d {
  const triCount = triangles.length;
  const maxLeaf = Math.max(1, Math.floor(maxLeafTriangles));
  if (triCount === 0) {
    const emptyBuf = new ArrayBuffer(0);
    return {
      nodes: [],
      primIndices: new Uint32Array(0),
      nodeBuffer: emptyBuf,
      nodeBytes: new Uint8Array(emptyBuf),
      triangleBuffer: emptyBuf,
      triangleBytes: new Uint8Array(emptyBuf),
      nodeCount: 0,
      triangleCount: 0,
      leafCount: 0,
      maxDepth: 0,
    };
  }

  const triMin = new Float32Array(triCount * 3);
  const triMax = new Float32Array(triCount * 3);
  const triCentroid = new Float32Array(triCount * 3);
  const primIndices = new Uint32Array(triCount);

  for (let i = 0; i < triCount; i += 1) {
    const { v0, v1, v2 } = triangles[i];
    const o = i * 3;
    const minX = Math.min(v0[0], v1[0], v2[0]);
    const minY = Math.min(v0[1], v1[1], v2[1]);
    const minZ = Math.min(v0[2], v1[2], v2[2]);
    const maxX = Math.max(v0[0], v1[0], v2[0]);
    const maxY = Math.max(v0[1], v1[1], v2[1]);
    const maxZ = Math.max(v0[2], v1[2], v2[2]);
    triMin[o] = minX; triMin[o + 1] = minY; triMin[o + 2] = minZ;
    triMax[o] = maxX; triMax[o + 1] = maxY; triMax[o + 2] = maxZ;
    triCentroid[o] = 0.5 * (minX + maxX);
    triCentroid[o + 1] = 0.5 * (minY + maxY);
    triCentroid[o + 2] = 0.5 * (minZ + maxZ);
    primIndices[i] = i;
  }

  interface MutableNode {
    boundsMin: [number, number, number];
    leftOrFirst: number;
    boundsMax: [number, number, number];
    triCount: number;
  }
  const nodes: MutableNode[] = [{ boundsMin: [0, 0, 0], leftOrFirst: 0, boundsMax: [0, 0, 0], triCount }];
  const stack: { nodeIdx: number; start: number; count: number; depth: number }[] = [
    { nodeIdx: 0, start: 0, count: triCount, depth: 0 },
  ];
  let leafCount = 0;
  let maxDepth = 0;

  while (stack.length > 0) {
    const item = stack.pop();
    if (!item) break;
    const { nodeIdx, start, count, depth } = item;
    if (depth > maxDepth) maxDepth = depth;

    let bMinX = Infinity; let bMinY = Infinity; let bMinZ = Infinity;
    let bMaxX = -Infinity; let bMaxY = -Infinity; let bMaxZ = -Infinity;
    let cMinX = Infinity; let cMinY = Infinity; let cMinZ = Infinity;
    let cMaxX = -Infinity; let cMaxY = -Infinity; let cMaxZ = -Infinity;
    for (let i = start; i < start + count; i += 1) {
      const o = primIndices[i] * 3;
      bMinX = Math.min(bMinX, triMin[o]); bMinY = Math.min(bMinY, triMin[o + 1]); bMinZ = Math.min(bMinZ, triMin[o + 2]);
      bMaxX = Math.max(bMaxX, triMax[o]); bMaxY = Math.max(bMaxY, triMax[o + 1]); bMaxZ = Math.max(bMaxZ, triMax[o + 2]);
      cMinX = Math.min(cMinX, triCentroid[o]); cMinY = Math.min(cMinY, triCentroid[o + 1]); cMinZ = Math.min(cMinZ, triCentroid[o + 2]);
      cMaxX = Math.max(cMaxX, triCentroid[o]); cMaxY = Math.max(cMaxY, triCentroid[o + 1]); cMaxZ = Math.max(cMaxZ, triCentroid[o + 2]);
    }
    nodes[nodeIdx].boundsMin = [bMinX, bMinY, bMinZ];
    nodes[nodeIdx].boundsMax = [bMaxX, bMaxY, bMaxZ];

    if (count <= maxLeaf || depth + 1 >= GI_RT_MAX_BVH_STACK) {
      nodes[nodeIdx].leftOrFirst = start;
      nodes[nodeIdx].triCount = count;
      leafCount += 1;
      continue;
    }

    const ex = [cMaxX - cMinX, cMaxY - cMinY, cMaxZ - cMinZ];
    let axis = ex[1] > ex[0] ? 1 : 0;
    if (ex[2] > ex[axis]) axis = 2;

    let mid = start + (count >> 1);
    if (ex[axis] > 1e-6) {
      const splitVal = (axis === 0 ? cMinX + cMaxX : axis === 1 ? cMinY + cMaxY : cMinZ + cMaxZ) * 0.5;
      let left = start;
      let right = start + count;
      while (left < right) {
        if (triCentroid[primIndices[left] * 3 + axis] < splitVal) {
          left += 1;
        } else {
          right -= 1;
          const tmp = primIndices[left];
          primIndices[left] = primIndices[right];
          primIndices[right] = tmp;
        }
      }
      if (left > start && left < start + count) mid = left;
    }

    const leftChild = nodes.length;
    const rightChild = leftChild + 1;
    nodes.push(
      { boundsMin: [0, 0, 0], leftOrFirst: 0, boundsMax: [0, 0, 0], triCount: 0 },
      { boundsMin: [0, 0, 0], leftOrFirst: 0, boundsMax: [0, 0, 0], triCount: 0 },
    );
    nodes[nodeIdx].leftOrFirst = leftChild;
    nodes[nodeIdx].triCount = 0;
    stack.push({ nodeIdx: rightChild, start: mid, count: start + count - mid, depth: depth + 1 });
    stack.push({ nodeIdx: leftChild, start, count: mid - start, depth: depth + 1 });
  }

  const nodeBuffer = packSahBvhNodes32B(nodes);
  const triangleBuffer = new ArrayBuffer(triCount * BVH_TRIANGLE_STRIDE_BYTES);
  const triView = new DataView(triangleBuffer);
  for (let i = 0; i < triCount; i += 1) {
    const t = triangles[i];
    const base = i * BVH_TRIANGLE_STRIDE_BYTES;
    triView.setFloat32(base + 0, t.v0[0], true); triView.setFloat32(base + 4, t.v0[1], true);
    triView.setFloat32(base + 8, t.v0[2], true); triView.setFloat32(base + 12, clampNum(t.roughness ?? 0.2, 0, 1), true);
    triView.setFloat32(base + 16, t.v1[0], true); triView.setFloat32(base + 20, t.v1[1], true);
    triView.setFloat32(base + 24, t.v1[2], true); triView.setFloat32(base + 28, clampNum(t.ior ?? 1.5, 1, 3), true);
    triView.setFloat32(base + 32, t.v2[0], true); triView.setFloat32(base + 36, t.v2[1], true);
    triView.setFloat32(base + 40, t.v2[2], true); triView.setFloat32(base + 44, clampNum(t.reflectivity ?? 0.8, 0, 1), true);
    triView.setFloat32(base + 48, clampNum(t.albedo[0], 0, 1), true); triView.setFloat32(base + 52, clampNum(t.albedo[1], 0, 1), true);
    triView.setFloat32(base + 56, clampNum(t.albedo[2], 0, 1), true); triView.setFloat32(base + 60, clampNum(t.transmission ?? 0, 0, 1), true);
  }

  return {
    nodes,
    primIndices,
    nodeBuffer,
    nodeBytes: new Uint8Array(nodeBuffer),
    triangleBuffer,
    triangleBytes: new Uint8Array(triangleBuffer),
    nodeCount: nodes.length,
    triangleCount: triCount,
    leafCount,
    maxDepth,
  };
}

/** WGSL 3D GI/PCSS/BVH 컴퓨트 셰이더의 구조·워크그룹·바인딩·괄호 균형을 정적 검증한다. */
export function validate3dGiRaytraceWgsl(source: string = WGSL_3D_GI_SHADOW_RAYTRACE): GiRaytraceWgslValidation {
  const errors: string[] = [];
  const hasUniformStruct = /struct\s+GiShadowRaytraceUniforms\s*\{/.test(source);
  const hasSahBvhNodeStruct = /struct\s+SahBvhNode3D\s*\{/.test(source);
  const hasSsgiBounce = /evaluate_ssgi_bounce/.test(source);
  const hasPcssPenumbra = /evaluate_pcss_visibility/.test(source) && /penumbra_ratio/.test(source);
  const hasBvhRayTraversal = /trace_sah_bvh_ray/.test(source) && /ray_aabb_slab/.test(source);
  const hasSnellRefraction = /refract\s*\(/.test(source);
  const usesWorkgroupBarrier = /workgroupBarrier\s*\(\s*\)/.test(source);

  if (!hasUniformStruct) errors.push("GiShadowRaytraceUniforms 구조체가 없습니다.");
  if (!hasSahBvhNodeStruct) errors.push("Wave-2 호환 SahBvhNode3D 구조체가 없습니다.");
  if (!hasSsgiBounce) errors.push("SSGI 간접광 반사 함수가 없습니다.");
  if (!hasPcssPenumbra) errors.push("PCSS 접촉 경화 반음영 계산이 없습니다.");
  if (!hasBvhRayTraversal) errors.push("SAH BVH 레이트레이싱 순회가 없습니다.");
  if (!hasSnellRefraction) errors.push("Snell 굴절(refract) 계산이 없습니다.");
  if (!usesWorkgroupBarrier) errors.push("workgroupBarrier() 동기화가 없습니다.");

  const wgMatch = /@compute\s+@workgroup_size\(\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*(\d+))?\s*\)/.exec(source);
  const workgroupSize: readonly [number, number, number] | null = wgMatch
    ? [Number(wgMatch[1]), Number(wgMatch[2]), wgMatch[3] ? Number(wgMatch[3]) : 1]
    : null;
  if (!workgroupSize || workgroupSize[0] !== GI_RT_WORKGROUP_X || workgroupSize[1] !== GI_RT_WORKGROUP_Y) {
    errors.push("@compute @workgroup_size(16, 16) 선언이 필요합니다.");
  }

  const entryMatch = /@compute[\s\S]*?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(source);
  const entryPoint = entryMatch ? entryMatch[1] : null;
  if (!entryPoint) errors.push("@compute 엔트리 포인트 함수가 없습니다.");

  const bindings: { readonly group: number; readonly binding: number }[] = [];
  const bindingRegex = /@group\((\d+)\)\s*@binding\((\d+)\)/g;
  let m: RegExpExecArray | null = bindingRegex.exec(source);
  while (m !== null) {
    bindings.push({ group: Number(m[1]), binding: Number(m[2]) });
    m = bindingRegex.exec(source);
  }
  if (bindings.length < 9) errors.push(`필수 바인딩 9개(uniform 1 + storage 8) 미만(${bindings.length}개).`);

  let braceDepth = 0;
  let parenDepth = 0;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") braceDepth += 1;
    else if (ch === "}") braceDepth -= 1;
    else if (ch === "(") parenDepth += 1;
    else if (ch === ")") parenDepth -= 1;
    if (braceDepth < 0 || parenDepth < 0) {
      errors.push("괄호 중첩 불균형이 감지되었습니다.");
      break;
    }
  }
  if (braceDepth !== 0) errors.push(`중괄호 불균형(depth=${braceDepth}).`);
  if (parenDepth !== 0) errors.push(`소괄호 불균형(depth=${parenDepth}).`);

  return {
    valid: errors.length === 0,
    entryPoint,
    workgroupSize,
    bindings,
    hasUniformStruct,
    hasSahBvhNodeStruct,
    hasSsgiBounce,
    hasPcssPenumbra,
    hasBvhRayTraversal,
    hasSnellRefraction,
    usesWorkgroupBarrier,
    errors,
  };
}
