/**
 * 절두체(Gribb-Hartmann 6평면) · 계층적 깊이(Hi-Z) 피라미드 수학 유틸리티 및 WebGPU 컴퓨트 셰이더.
 */

import type { Vec3Tuple } from "./webgpu-gi-bvh-types-wgsl";
import { GI_RT_GPU_BUFFER_USAGE } from "./webgpu-gi-bvh-types-wgsl";

export const HI_Z_CULL_WORKGROUP_SIZE = 64 as const;
export const DRAW_INDEXED_INDIRECT_BYTES = 20 as const;
export const CULL_INSTANCE_STRIDE_BYTES = 48 as const;
export const CULL_UNIFORM_BYTES = 208 as const;
export const MAX_LOD_TIERS = 4 as const;

export const HI_Z_INDIRECT_BUFFER_USAGE = {
  ...GI_RT_GPU_BUFFER_USAGE,
  INDIRECT: 0x0100,
} as const;

/** 정규화된 절두체 평면 `ax + by + cz + d >= 0` (안쪽이 양수). */
export interface FrustumPlane {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
}

export interface Frustum6Planes {
  readonly left: FrustumPlane;
  readonly right: FrustumPlane;
  readonly bottom: FrustumPlane;
  readonly top: FrustumPlane;
  readonly near: FrustumPlane;
  readonly far: FrustumPlane;
  /** GPU 유니폼 업로드용 24×f32 배열(6평면 × vec4). */
  readonly packedF32: Float32Array;
}

export interface HiZMipLevel {
  readonly level: number;
  readonly width: number;
  readonly height: number;
  readonly offset: number;
  readonly length: number;
}

export interface HiZPyramidData {
  readonly baseWidth: number;
  readonly baseHeight: number;
  readonly mipCount: number;
  readonly levels: readonly HiZMipLevel[];
  readonly data: Float32Array;
  readonly mipMetaU32: Uint32Array;
}

export interface HiZCullWgslValidation {
  readonly valid: boolean;
  readonly entryPoint: string | null;
  readonly workgroupSize: number | null;
  readonly bindings: readonly { readonly group: number; readonly binding: number }[];
  readonly hasDrawIndirectStruct: boolean;
  readonly hasFrustumTest: boolean;
  readonly hasHiZTest: boolean;
  readonly hasLodSelect: boolean;
  readonly errors: readonly string[];
}

/**
 * WebGPU Compute(`@workgroup_size(64)`) 절두체 + Hi-Z 차폐 컬링 및 20바이트 `DrawIndexedIndirect` 패킹 셰이더.
 */
export const WGSL_HI_Z_FRUSTUM_CULL: string = /* wgsl */ `
struct CullUniforms {
  frustum_planes: array<vec4<f32>, 6>,
  view_proj: mat4x4<f32>,
  camera_pos_and_bias: vec4<f32>,
  hiz_dims_and_counts: vec4<u32>,
  lod_thresholds: vec4<f32>,
}
struct CullInstanceBounds {
  aabb_min: vec3<f32>, instance_id: u32,
  aabb_max: vec3<f32>, mesh_group_id: u32,
  center_and_radius: vec4<f32>,
}
struct DrawIndexedIndirectCmd {
  index_count: u32,
  instance_count: atomic<u32>,
  first_index: u32,
  base_vertex: i32,
  first_instance: u32,
}
@group(0) @binding(0) var<uniform> params: CullUniforms;
@group(0) @binding(1) var<storage, read> instances: array<CullInstanceBounds>;
@group(0) @binding(2) var<storage, read> hiz_pyramid: array<f32>;
@group(0) @binding(3) var<storage, read> hiz_mip_meta: array<vec4<u32>>;
@group(0) @binding(4) var<storage, read_write> draw_indirect_cmds: array<DrawIndexedIndirectCmd>;
@group(0) @binding(5) var<storage, read_write> visible_instance_ids: array<u32>;
@group(0) @binding(6) var<storage, read_write> cull_stats: array<atomic<u32>>;

fn test_aabb_frustum(bmin: vec3<f32>, bmax: vec3<f32>) -> bool {
  for (var p: u32 = 0u; p < 6u; p = p + 1u) {
    let pl = params.frustum_planes[p];
    let px = select(bmin.x, bmax.x, pl.x >= 0.0);
    let py = select(bmin.y, bmax.y, pl.y >= 0.0);
    let pz = select(bmin.z, bmax.z, pl.z >= 0.0);
    if (pl.x * px + pl.y * py + pl.z * pz + pl.w < 0.0) { return false; }
  }
  return true;
}
fn sample_hiz_mip(u: f32, v: f32, mip: u32) -> f32 {
  let meta = hiz_mip_meta[mip];
  let tx = u32(clamp(i32(floor(u * f32(meta.x))), 0, i32(meta.x) - 1));
  let ty = u32(clamp(i32(floor(v * f32(meta.y))), 0, i32(meta.y) - 1));
  return hiz_pyramid[meta.z + ty * meta.x + tx];
}
fn test_aabb_hiz_visible(bmin: vec3<f32>, bmax: vec3<f32>) -> bool {
  let mip_count = params.hiz_dims_and_counts.z;
  if (mip_count == 0u) { return true; }
  var min_x: f32 = 2.0; var max_x: f32 = -2.0;
  var min_y: f32 = 2.0; var max_y: f32 = -2.0;
  var min_z: f32 = 1.0;
  for (var c: u32 = 0u; c < 8u; c = c + 1u) {
    let cx = select(bmin.x, bmax.x, (c & 1u) != 0u);
    let cy = select(bmin.y, bmax.y, (c & 2u) != 0u);
    let cz = select(bmin.z, bmax.z, (c & 4u) != 0u);
    let clip = params.view_proj * vec4<f32>(cx, cy, cz, 1.0);
    if (clip.w <= 1e-4) { return true; }
    let inv_w = 1.0 / clip.w;
    min_x = min(min_x, clip.x * inv_w); max_x = max(max_x, clip.x * inv_w);
    min_y = min(min_y, clip.y * inv_w); max_y = max(max_y, clip.y * inv_w);
    min_z = min(min_z, clip.z * inv_w);
  }
  let u0 = clamp(min_x * 0.5 + 0.5, 0.0, 1.0); let u1 = clamp(max_x * 0.5 + 0.5, 0.0, 1.0);
  let v0 = clamp(0.5 - max_y * 0.5, 0.0, 1.0); let v1 = clamp(0.5 - min_y * 0.5, 0.0, 1.0);
  let span = max(max((u1 - u0) * f32(params.hiz_dims_and_counts.x), (v1 - v0) * f32(params.hiz_dims_and_counts.y)), 1.0);
  let mip = min(u32(ceil(log2(span))), mip_count - 1u);
  let hiz_max = max(max(sample_hiz_mip(u0, v0, mip), sample_hiz_mip(u1, v0, mip)), max(sample_hiz_mip(u0, v1, mip), sample_hiz_mip(u1, v1, mip)));
  return min_z <= hiz_max + params.camera_pos_and_bias.w;
}
fn select_lod_tier(dist: f32) -> u32 {
  if (dist <= params.lod_thresholds.x) { return 0u; }
  if (dist <= params.lod_thresholds.y) { return 1u; }
  if (dist <= params.lod_thresholds.z) { return 2u; }
  return 3u;
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.hiz_dims_and_counts.w) { return; }
  let inst = instances[idx];
  if (!test_aabb_frustum(inst.aabb_min, inst.aabb_max)) { atomicAdd(&cull_stats[1u], 1u); return; }
  if (!test_aabb_hiz_visible(inst.aabb_min, inst.aabb_max)) { atomicAdd(&cull_stats[2u], 1u); return; }
  let dist = distance(inst.center_and_radius.xyz, params.camera_pos_and_bias.xyz);
  let lod = select_lod_tier(dist);
  let out_slot = atomicAdd(&cull_stats[0u], 1u);
  visible_instance_ids[out_slot] = inst.instance_id;
  atomicAdd(&draw_indirect_cmds[lod].instance_count, 1u);
  atomicAdd(&cull_stats[3u + lod], 1u);
}`;

function clampNum(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function normalizePlane(a: number, b: number, c: number, d: number): FrustumPlane {
  const len = Math.hypot(a, b, c);
  if (!Number.isFinite(len) || len <= 1e-8) return { a: 0, b: 0, c: 1, d: 0 };
  const inv = 1 / len;
  return { a: a * inv, b: b * inv, c: c * inv, d: d * inv };
}

/** WebGPU `[0, 1]` NDC 오른손 원근 투영 행렬(컬럼-메이저 4×4)을 생성한다. */
export function createPerspectiveMatrixWebGpu(fovYRad: number, aspect: number, near: number, far: number): Float32Array {
  const safeAspect = Math.max(aspect, 1e-4);
  const safeNear = Math.max(near, 1e-4);
  const safeFar = Math.max(far, safeNear + 1e-3);
  const f = 1 / Math.tan(clampNum(fovYRad, 0.05, Math.PI - 0.05) * 0.5);
  const nf = 1 / (safeNear - safeFar);
  const out = new Float32Array(16);
  out[0] = f / safeAspect;
  out[5] = f;
  out[10] = safeFar * nf;
  out[11] = -1;
  out[14] = safeFar * safeNear * nf;
  return out;
}

/** 오른손 LookAt 뷰 행렬(컬럼-메이저 4×4)을 생성한다. */
export function createLookAtMatrix(eye: Vec3Tuple, target: Vec3Tuple, up: Vec3Tuple = [0, 1, 0]): Float32Array {
  let zx = eye[0] - target[0];
  let zy = eye[1] - target[1];
  let zz = eye[2] - target[2];
  const zLen = Math.hypot(zx, zy, zz);
  if (zLen > 1e-8) { zx /= zLen; zy /= zLen; zz /= zLen; } else { zz = 1; }

  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  const xLen = Math.hypot(xx, xy, xz);
  if (xLen > 1e-8) { xx /= xLen; xy /= xLen; xz /= xLen; } else { xx = 1; }

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  const out = new Float32Array(16);
  out[0] = xx; out[1] = yx; out[2] = zx;
  out[4] = xy; out[5] = yy; out[6] = zy;
  out[8] = xz; out[9] = yz; out[10] = zz;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1;
  return out;
}

/** 컬럼-메이저 4×4 행렬 곱 `A * B`. */
export function multiplyMat4(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col += 1) {
    const b0 = b[col * 4]; const b1 = b[col * 4 + 1]; const b2 = b[col * 4 + 2]; const b3 = b[col * 4 + 3];
    for (let row = 0; row < 4; row += 1) {
      out[col * 4 + row] = a[row] * b0 + a[4 + row] * b1 + a[8 + row] * b2 + a[12 + row] * b3;
    }
  }
  return out;
}

/** Gribb-Hartmann 방식으로 컬럼-메이저 View-Projection 행렬에서 정규화된 6평면 절두체를 추출한다. */
export function extractFrustumPlanesGribbHartmann(viewProj: Float32Array, ndcDepthZeroToOne: boolean = true): Frustum6Planes {
  if (viewProj.length < 16) {
    throw new RangeError(`viewProjectionMatrix는 16개 요소가 필요합니다(실제 ${viewProj.length}).`);
  }
  const r0x = viewProj[0]; const r0y = viewProj[4]; const r0z = viewProj[8]; const r0w = viewProj[12];
  const r1x = viewProj[1]; const r1y = viewProj[5]; const r1z = viewProj[9]; const r1w = viewProj[13];
  const r2x = viewProj[2]; const r2y = viewProj[6]; const r2z = viewProj[10]; const r2w = viewProj[14];
  const r3x = viewProj[3]; const r3y = viewProj[7]; const r3z = viewProj[11]; const r3w = viewProj[15];

  const left = normalizePlane(r3x + r0x, r3y + r0y, r3z + r0z, r3w + r0w);
  const right = normalizePlane(r3x - r0x, r3y - r0y, r3z - r0z, r3w - r0w);
  const bottom = normalizePlane(r3x + r1x, r3y + r1y, r3z + r1z, r3w + r1w);
  const top = normalizePlane(r3x - r1x, r3y - r1y, r3z - r1z, r3w - r1w);
  const near = ndcDepthZeroToOne
    ? normalizePlane(r2x, r2y, r2z, r2w)
    : normalizePlane(r3x + r2x, r3y + r2y, r3z + r2z, r3w + r2w);
  const far = normalizePlane(r3x - r2x, r3y - r2y, r3z - r2z, r3w - r2w);

  const ordered = [left, right, bottom, top, near, far];
  const packedF32 = new Float32Array(24);
  for (let i = 0; i < 6; i += 1) {
    packedF32[i * 4 + 0] = ordered[i].a;
    packedF32[i * 4 + 1] = ordered[i].b;
    packedF32[i * 4 + 2] = ordered[i].c;
    packedF32[i * 4 + 3] = ordered[i].d;
  }
  return { left, right, bottom, top, near, far, packedF32 };
}

/** 보수적 max-depth 축소로 전체 Hi-Z 피라미드(mip 0 -> 1×1)를 생성한다. */
export function buildHiZPyramid(baseDepth: Float32Array, width: number, height: number): HiZPyramidData {
  const w0 = Math.max(1, Math.floor(width));
  const h0 = Math.max(1, Math.floor(height));
  if (baseDepth.length !== w0 * h0) {
    throw new RangeError(`Hi-Z 베이스 깊이 버퍼 길이 불일치: 기대 ${w0 * h0}, 실제 ${baseDepth.length}`);
  }

  const levels: HiZMipLevel[] = [];
  let cw = w0; let ch = h0; let totalLen = 0; let lvl = 0;
  while (true) {
    const len = cw * ch;
    levels.push({ level: lvl, width: cw, height: ch, offset: totalLen, length: len });
    totalLen += len;
    if (cw === 1 && ch === 1) break;
    cw = Math.max(1, cw >> 1);
    ch = Math.max(1, ch >> 1);
    lvl += 1;
  }

  const data = new Float32Array(totalLen);
  for (let i = 0; i < w0 * h0; i += 1) data[i] = clampNum(baseDepth[i], 0, 1);

  for (let m = 1; m < levels.length; m += 1) {
    const prev = levels[m - 1];
    const curr = levels[m];
    const extraX = (prev.width & 1) === 1 && prev.width > 1;
    const extraY = (prev.height & 1) === 1 && prev.height > 1;
    for (let y = 0; y < curr.height; y += 1) {
      const sy0 = Math.min(prev.height - 1, y * 2);
      const sy1 = Math.min(prev.height - 1, sy0 + 1);
      const sy2 = extraY && y === curr.height - 1 ? prev.height - 1 : sy1;
      for (let x = 0; x < curr.width; x += 1) {
        const sx0 = Math.min(prev.width - 1, x * 2);
        const sx1 = Math.min(prev.width - 1, sx0 + 1);
        const sx2 = extraX && x === curr.width - 1 ? prev.width - 1 : sx1;
        const p = prev.offset;
        const pw = prev.width;
        data[curr.offset + y * curr.width + x] = Math.max(
          data[p + sy0 * pw + sx0], data[p + sy0 * pw + sx1], data[p + sy0 * pw + sx2],
          data[p + sy1 * pw + sx0], data[p + sy1 * pw + sx1], data[p + sy1 * pw + sx2],
          data[p + sy2 * pw + sx0], data[p + sy2 * pw + sx1], data[p + sy2 * pw + sx2],
        );
      }
    }
  }

  const mipMetaU32 = new Uint32Array(levels.length * 4);
  for (let i = 0; i < levels.length; i += 1) {
    mipMetaU32[i * 4 + 0] = levels[i].width;
    mipMetaU32[i * 4 + 1] = levels[i].height;
    mipMetaU32[i * 4 + 2] = levels[i].offset;
    mipMetaU32[i * 4 + 3] = 0;
  }
  return { baseWidth: w0, baseHeight: h0, mipCount: levels.length, levels, data, mipMetaU32 };
}

/** `WGSL_HI_Z_FRUSTUM_CULL` 셰이더의 구조·워크그룹·바인딩·괄호 균형을 정적 검증한다. */
export function validateHiZFrustumCullWgsl(source: string = WGSL_HI_Z_FRUSTUM_CULL): HiZCullWgslValidation {
  const errors: string[] = [];
  const hasDrawIndirectStruct = /struct\s+DrawIndexedIndirectCmd\s*\{/.test(source);
  const hasFrustumTest = /test_aabb_frustum/.test(source);
  const hasHiZTest = /test_aabb_hiz_visible/.test(source) && /sample_hiz_mip/.test(source);
  const hasLodSelect = /select_lod_tier/.test(source);
  if (!hasDrawIndirectStruct) errors.push("DrawIndexedIndirectCmd 20B 구조체가 없습니다.");
  if (!hasFrustumTest) errors.push("6평면 절두체 테스트 함수가 없습니다.");
  if (!hasHiZTest) errors.push("Hi-Z 피라미드 차폐 테스트 함수가 없습니다.");
  if (!hasLodSelect) errors.push("거리 기반 LOD 선택 함수가 없습니다.");

  const wgMatch = /@compute\s+@workgroup_size\(\s*(\d+)\s*\)/.exec(source);
  const workgroupSize = wgMatch ? Number(wgMatch[1]) : null;
  if (workgroupSize !== HI_Z_CULL_WORKGROUP_SIZE) {
    errors.push(`@workgroup_size(${HI_Z_CULL_WORKGROUP_SIZE}) 선언이 필요합니다.`);
  }
  const entryMatch = /@compute[\s\S]*?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(source);
  const entryPoint = entryMatch ? entryMatch[1] : null;
  if (!entryPoint) errors.push("@compute 엔트리 포인트 함수가 없습니다.");

  const bindings: { readonly group: number; readonly binding: number }[] = [];
  const regex = /@group\((\d+)\)\s*@binding\((\d+)\)/g;
  let m: RegExpExecArray | null = regex.exec(source);
  while (m !== null) {
    bindings.push({ group: Number(m[1]), binding: Number(m[2]) });
    m = regex.exec(source);
  }
  if (bindings.length < 7) errors.push(`필수 바인딩 7개 미만(${bindings.length}개).`);

  let braceDepth = 0;
  let parenDepth = 0;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") braceDepth += 1;
    else if (ch === "}") braceDepth -= 1;
    else if (ch === "(") parenDepth += 1;
    else if (ch === ")") parenDepth -= 1;
    if (braceDepth < 0 || parenDepth < 0) { errors.push("괄호 중첩 불균형이 감지되었습니다."); break; }
  }
  if (braceDepth !== 0) errors.push(`중괄호 불균형(depth=${braceDepth}).`);
  if (parenDepth !== 0) errors.push(`소괄호 불균형(depth=${parenDepth}).`);

  return {
    valid: errors.length === 0, entryPoint, workgroupSize, bindings,
    hasDrawIndirectStruct, hasFrustumTest, hasHiZTest, hasLodSelect, errors,
  };
}
