/**
 * GPU 컬링·인스턴싱용 WGSL 소스와 CPU 참조. 실제 GPU 컴파일·실행·Studio 연결은 별도 검증이 필요하다.
 *
 * - `GPU_FRUSTUM_CULL_INDIRECT_WGSL`: `@compute @workgroup_size(64, 1, 1)` 병렬 회전 보수 AABB 컬링 +
 *   `atomicAdd(&indirectArgs.instanceCount, 1u)`로 가시 인스턴스만 컴팩트 출력해 단일 `drawIndirect` 호출을 생성한다.
 * - `INSTANCED_LOOP_BLINN_OBJECT_WGSL`: 단일 드로우 콜로 수천 오브젝트·곡선·스탬프를 `fwidth` 스크린 공간 AA로 합성한다.
 * - 모든 uniform은 16-byte 정렬을 유지하며 Chromium WGSL 예약어를 식별자로 사용하지 않는다.
 * - 병렬 컴팩션은 투명 레이어의 페인터 순서를 보존하지 않는다. 실제 연결 전 별도 정렬·깊이 계약이 필요하다.
 */

import {
  DRAW_INDIRECT_U32_COUNT,
  INSTANCED_OBJECT_STRIDE_BYTES,
  INSTANCED_OBJECT_STRIDE_FLOATS,
  SCENE_OBJECT_ALL_KINDS_MASK,
  SCENE_OBJECT_FLAG_VISIBLE,
} from "./instanced-bvh-spatial-engine";
import { assertCpuCullInput, assertCullUniformInput, assertRenderUniformInput } from "./spatial-input-contract";

export const CULL_COMPUTE_WORKGROUP_SIZE_X = 64 as const;
export const CULL_COMPUTE_WORKGROUP_SIZE_Y = 1 as const;
export const CULL_COMPUTE_WORKGROUP_SIZE_Z = 1 as const;
/** `CullViewportUniforms` 크기 (12 × 4 = 48 bytes, 16-byte 정렬). */
export const CULL_UNIFORM_SLOT_COUNT = 12 as const;
export const CULL_UNIFORM_BYTES = 48 as const;
/** `RenderViewportUniforms` 크기 (8 × 4 = 32 bytes, 16-byte 정렬). */
export const RENDER_VIEW_UNIFORM_SLOT_COUNT = 8 as const;
export const RENDER_VIEW_UNIFORM_BYTES = 32 as const;
export const WEBGPU_MAX_COMPUTE_WORKGROUPS_X = 65535 as const;

export const WGSL_RESERVED_IDENTIFIER_GUARD = [
  "meta", "active", "filter", "common", "target", "self", "type", "using", "null", "abstract", "class", "mut", "ref", "smooth",
] as const;

/**
 * GPU 병렬 프러스텀 컬링 + `drawIndirect` 아토믹 컴팩션 컴퓨트 셰이더 (WGSL).
 * 바인딩: b0 CullViewportUniforms(48B) · b1 sourceInstances(read) · b2 visibleInstances(rw) · b3 indirectArgs(atomic).
 */
export const GPU_FRUSTUM_CULL_INDIRECT_WGSL = /* wgsl */ `
struct CullViewportUniforms {
  view_min_x: f32,
  view_min_y: f32,
  view_max_x: f32,
  view_max_y: f32,
  margin_x: f32,
  margin_y: f32,
  object_count: u32,
  kind_mask: u32,
  required_flags: u32,
  max_output_instances: u32,
  vertex_count: u32,
  pad_tail: u32,
};

struct GpuSceneInstance {
  center_half: vec4<f32>,
  rotation_rad: f32,
  curve_bias: f32,
  color_rgba8: u32,
  material_bits: u32,
};

struct DrawIndirectArgs {
  vertexCount: u32,
  instanceCount: atomic<u32>,
  firstVertex: u32,
  firstInstance: u32,
};

@group(0) @binding(0) var<uniform> cullParams: CullViewportUniforms;
@group(0) @binding(1) var<storage, read> sourceInstances: array<GpuSceneInstance>;
@group(0) @binding(2) var<storage, read_write> visibleInstances: array<GpuSceneInstance>;
@group(0) @binding(3) var<storage, read_write> indirectArgs: DrawIndirectArgs;

@compute @workgroup_size(1, 1, 1)
fn reset_indirect_args() {
  indirectArgs.vertexCount = cullParams.vertex_count;
  atomicStore(&indirectArgs.instanceCount, 0u);
  indirectArgs.firstVertex = 0u;
  indirectArgs.firstInstance = 0u;
}

@compute @workgroup_size(64, 1, 1)
fn cull_frustum_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= cullParams.object_count) { return; }
  if (idx >= arrayLength(&sourceInstances)) { return; }

  let inst = sourceInstances[idx];
  let kind_code = inst.material_bits & 0x0fu;
  let obj_flags = (inst.material_bits >> 4u) & 0x0fu;
  if ((obj_flags & cullParams.required_flags) != cullParams.required_flags) { return; }
  if (((1u << kind_code) & cullParams.kind_mask) == 0u) { return; }

  let cos_abs = abs(cos(inst.rotation_rad));
  let sin_abs = abs(sin(inst.rotation_rad));
  let half_w = max(inst.center_half.z, 0.0);
  let half_h = max(inst.center_half.w, 0.0);
  let ext_x = half_w * cos_abs + half_h * sin_abs;
  let ext_y = half_w * sin_abs + half_h * cos_abs;

  let q_min_x = cullParams.view_min_x - cullParams.margin_x;
  let q_max_x = cullParams.view_max_x + cullParams.margin_x;
  let q_min_y = cullParams.view_min_y - cullParams.margin_y;
  let q_max_y = cullParams.view_max_y + cullParams.margin_y;

  if (
    inst.center_half.x + ext_x < q_min_x ||
    inst.center_half.x - ext_x > q_max_x ||
    inst.center_half.y + ext_y < q_min_y ||
    inst.center_half.y - ext_y > q_max_y
  ) {
    return;
  }

  let out_slot = atomicAdd(&indirectArgs.instanceCount, 1u);
  let out_limit = min(cullParams.max_output_instances, arrayLength(&visibleInstances));
  if (out_slot < out_limit) {
    visibleInstances[out_slot] = inst;
  } else {
    atomicSub(&indirectArgs.instanceCount, 1u);
  }
}
`;

/**
 * 단일 드로우 콜 인스턴싱 + Loop-Blinn 곡선 & 다종 오브젝트 스크린 공간 `fwidth` AA 렌더 셰이더 (WGSL).
 * WGSL uniformity 규약 준수: 모든 `fwidth`/`dpdx`/`dpdy`를 `discard` 이전 균일 제어 흐름에서 사전 평가한다.
 */
export const INSTANCED_LOOP_BLINN_OBJECT_WGSL = /* wgsl */ `
struct RenderViewportUniforms {
  view_center_x: f32,
  view_center_y: f32,
  inv_half_width: f32,
  inv_half_height: f32,
  pixel_scale: f32,
  aa_sharpness: f32,
  impasto_light_x: f32,
  impasto_light_y: f32,
};

struct GpuSceneInstance {
  center_half: vec4<f32>,
  rotation_rad: f32,
  curve_bias: f32,
  color_rgba8: u32,
  material_bits: u32,
};

struct InstancedVarying {
  @builtin(position) clip_pos: vec4<f32>,
  @location(0) local_uv: vec2<f32>,
  @location(1) base_color: vec4<f32>,
  @location(2) curve_bias: f32,
  @location(3) @interpolate(flat) kind_code: u32,
  @location(4) @interpolate(flat) obj_flags: u32,
  @location(5) @interpolate(flat) material_id: u32,
};

@group(0) @binding(0) var<uniform> viewParams: RenderViewportUniforms;
@group(0) @binding(1) var<storage, read> visibleInstances: array<GpuSceneInstance>;

fn quad_corner_uv(vid: u32) -> vec2<f32> {
  switch (vid) {
    case 0u: { return vec2<f32>(-1.0, -1.0); }
    case 1u: { return vec2<f32>(1.0, -1.0); }
    case 2u: { return vec2<f32>(1.0, 1.0); }
    case 3u: { return vec2<f32>(-1.0, -1.0); }
    case 4u: { return vec2<f32>(1.0, 1.0); }
    default: { return vec2<f32>(-1.0, 1.0); }
  }
}

@vertex
fn vs_instanced_object(
  @builtin(vertex_index) vid: u32,
  @builtin(instance_index) iid: u32,
) -> InstancedVarying {
  let inst = visibleInstances[iid];
  let corner = quad_corner_uv(vid);
  let scaled = vec2<f32>(corner.x * inst.center_half.z, corner.y * inst.center_half.w);
  let c = cos(inst.rotation_rad);
  let s = sin(inst.rotation_rad);
  let world_pos = inst.center_half.xy + vec2<f32>(scaled.x * c - scaled.y * s, scaled.x * s + scaled.y * c);

  var out_v: InstancedVarying;
  out_v.clip_pos = vec4<f32>(
    (world_pos.x - viewParams.view_center_x) * viewParams.inv_half_width,
    -(world_pos.y - viewParams.view_center_y) * viewParams.inv_half_height,
    0.0,
    1.0,
  );
  out_v.local_uv = corner;
  out_v.base_color = unpack4x8unorm(inst.color_rgba8);
  out_v.curve_bias = inst.curve_bias;
  out_v.kind_code = inst.material_bits & 0x0fu;
  out_v.obj_flags = (inst.material_bits >> 4u) & 0x0fu;
  out_v.material_id = (inst.material_bits >> 8u) & 0x00ffffffu;
  return out_v;
}

fn sdf_rounded_box(p: vec2<f32>, half_ext: vec2<f32>, radius: f32) -> f32 {
  let q = abs(p) - half_ext + vec2<f32>(radius, radius);
  return length(max(q, vec2<f32>(0.0, 0.0))) + min(max(q.x, q.y), 0.0) - radius;
}

@fragment
fn fs_instanced_object(in_v: InstancedVarying) -> @location(0) vec4<f32> {
  let uv = in_v.local_uv;
  let aa_scale = max(viewParams.aa_sharpness, 0.5);

  // Loop-Blinn (SIGGRAPH 2005) 2차 음함수 베지어 곡선 및 스크린 공간 미분 사전 평가
  let lb_u = uv.x * 0.5 + 0.5;
  let lb_v = (uv.y * 0.5 + 0.5) * clamp(1.0 + in_v.curve_bias * 0.5, 0.25, 2.0);
  let lb_f = lb_u * lb_u - lb_v;
  let lb_sd = lb_f / max(length(vec2<f32>(dpdx(lb_f), dpdy(lb_f))), 1e-4);

  let box_sd = sdf_rounded_box(uv, vec2<f32>(0.94, 0.94), clamp(0.18 + in_v.curve_bias * 0.25, 0.02, 0.45));
  let box_aa = max(fwidth(box_sd) * aa_scale, 1e-4);
  let radial_sd = length(uv) - 0.92;
  let radial_aa = max(fwidth(radial_sd) * aa_scale, 1e-4);

  let tone_freq = clamp(f32((in_v.material_id & 0x3fu) + 6u), 6.0, 64.0);
  let tone_dist = length(fract((uv * 0.5 + 0.5) * tone_freq) - vec2<f32>(0.5, 0.5)) - clamp(0.24 + in_v.curve_bias * 0.18, 0.08, 0.46);
  let tone_aa = max(fwidth(tone_dist) * aa_scale, 1e-4);

  var coverage = 1.0 - smoothstep(-box_aa, box_aa, box_sd);
  var shaded_rgb = in_v.base_color.rgb;

  if (in_v.kind_code == 3u) {
    let stroke_half_px = max(1.0, abs(in_v.curve_bias) * 3.0 + 1.25);
    coverage = 1.0 - smoothstep(stroke_half_px - 0.75, stroke_half_px + 0.75, abs(lb_sd));
  } else if (in_v.kind_code == 1u) {
    coverage = 1.0 - smoothstep(-box_aa, box_aa, abs(box_sd + 0.05) - 0.045);
  } else if (in_v.kind_code == 2u) {
    coverage = coverage * (1.0 - smoothstep(-tone_aa, tone_aa, tone_dist));
  } else if (in_v.kind_code == 4u || in_v.kind_code == 5u) {
    coverage = 1.0 - smoothstep(-radial_aa, radial_aa, radial_sd);
    if ((in_v.obj_flags & 8u) != 0u) {
      let n2 = normalize(vec3<f32>(-uv.x * 0.65, -uv.y * 0.65, 1.0));
      let ldir = normalize(vec3<f32>(viewParams.impasto_light_x, viewParams.impasto_light_y, 0.75));
      shaded_rgb = clamp(shaded_rgb * (0.78 + 0.34 * max(dot(n2, ldir), 0.0)), vec3<f32>(0.0), vec3<f32>(1.0));
    }
  }

  let final_alpha = clamp(in_v.base_color.a * coverage, 0.0, 1.0);
  if (final_alpha <= 0.001) { discard; }
  return vec4<f32>(shaded_rgb * final_alpha, final_alpha);
}
`;

export interface CullUniformsInput {
  readonly viewMinX: number;
  readonly viewMinY: number;
  readonly viewMaxX: number;
  readonly viewMaxY: number;
  readonly marginX?: number;
  readonly marginY?: number;
  readonly objectCount: number;
  readonly kindMask?: number;
  readonly requiredFlags?: number;
  readonly maxOutputInstances?: number;
  readonly vertexCount?: number;
}

export interface PackedCullUniforms {
  readonly buffer: ArrayBuffer;
  readonly floatView: Float32Array;
  readonly uintView: Uint32Array;
  readonly byteLength: typeof CULL_UNIFORM_BYTES;
  readonly dispatchWorkgroupsX: number;
}

export interface RenderViewportUniformsInput {
  readonly viewMinX: number;
  readonly viewMinY: number;
  readonly viewMaxX: number;
  readonly viewMaxY: number;
  readonly pixelScale?: number;
  readonly aaSharpness?: number;
  readonly impastoLightX?: number;
  readonly impastoLightY?: number;
}

export interface PackedRenderViewportUniforms {
  readonly buffer: ArrayBuffer;
  readonly floatView: Float32Array;
  readonly byteLength: typeof RENDER_VIEW_UNIFORM_BYTES;
}

export interface InstancedWgslValidationReport {
  readonly scope: "static-source-contract";
  readonly gpuCompiled: false;
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly computeBindings: readonly string[];
  readonly renderBindings: readonly string[];
  readonly hasAtomicIndirectCompaction: boolean;
  readonly hasLoopBlinnFwidthAa: boolean;
  readonly hasUniformitySafeFwidth: boolean;
  readonly reservedKeywordHits: readonly string[];
}

export interface CpuGpuCullParityResult {
  readonly visibleInstanceFloatData: Float32Array;
  readonly visibleInstanceUintData: Uint32Array;
  readonly indirectArgs: Uint32Array;
  readonly visibleCount: number;
  readonly overflowCount: number;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

/** 16-byte 정렬 48-byte `CullViewportUniforms` 버퍼와 64-thread 워크그룹 디스패치 수를 패킹한다. */
export function packCullUniforms(input: CullUniformsInput, outBuffer?: ArrayBuffer): PackedCullUniforms {
  assertCullUniformInput(input);
  const buffer = outBuffer !== undefined && outBuffer.byteLength >= CULL_UNIFORM_BYTES
    ? outBuffer
    : new ArrayBuffer(CULL_UNIFORM_BYTES);
  const floatView = new Float32Array(buffer, 0, CULL_UNIFORM_SLOT_COUNT);
  const uintView = new Uint32Array(buffer, 0, CULL_UNIFORM_SLOT_COUNT);
  const rx0 = finiteOr(input.viewMinX, 0), rx1 = finiteOr(input.viewMaxX, rx0);
  const ry0 = finiteOr(input.viewMinY, 0), ry1 = finiteOr(input.viewMaxY, ry0);
  const safeObjCount = Math.max(0, Math.floor(finiteOr(input.objectCount, 0))) >>> 0;

  floatView[0] = rx0 <= rx1 ? rx0 : rx1;
  floatView[1] = ry0 <= ry1 ? ry0 : ry1;
  floatView[2] = rx0 <= rx1 ? rx1 : rx0;
  floatView[3] = ry0 <= ry1 ? ry1 : ry0;
  floatView[4] = Math.max(0, finiteOr(input.marginX, 0));
  floatView[5] = Math.max(0, finiteOr(input.marginY, 0));
  uintView[6] = safeObjCount;
  uintView[7] = (input.kindMask ?? SCENE_OBJECT_ALL_KINDS_MASK) >>> 0;
  uintView[8] = (input.requiredFlags ?? SCENE_OBJECT_FLAG_VISIBLE) >>> 0;
  uintView[9] = Math.max(0, Math.floor(finiteOr(input.maxOutputInstances, safeObjCount))) >>> 0;
  uintView[10] = Math.max(3, Math.floor(finiteOr(input.vertexCount, 6))) >>> 0;
  uintView[11] = 0;

  const dispatchWorkgroupsX = safeObjCount === 0
    ? 0
    : Math.min(WEBGPU_MAX_COMPUTE_WORKGROUPS_X, Math.ceil(safeObjCount / CULL_COMPUTE_WORKGROUP_SIZE_X));
  return { buffer, floatView, uintView, byteLength: CULL_UNIFORM_BYTES, dispatchWorkgroupsX };
}

/** 16-byte 정렬 32-byte `RenderViewportUniforms` 버퍼를 패킹한다. */
export function packRenderViewportUniforms(
  input: RenderViewportUniformsInput,
  outBuffer?: ArrayBuffer,
): PackedRenderViewportUniforms {
  assertRenderUniformInput(input);
  const buffer = outBuffer !== undefined && outBuffer.byteLength >= RENDER_VIEW_UNIFORM_BYTES
    ? outBuffer
    : new ArrayBuffer(RENDER_VIEW_UNIFORM_BYTES);
  const floatView = new Float32Array(buffer, 0, RENDER_VIEW_UNIFORM_SLOT_COUNT);
  const rx0 = finiteOr(input.viewMinX, 0), rx1 = finiteOr(input.viewMaxX, rx0 + 1);
  const ry0 = finiteOr(input.viewMinY, 0), ry1 = finiteOr(input.viewMaxY, ry0 + 1);
  const minX = rx0 <= rx1 ? rx0 : rx1, maxX = rx0 <= rx1 ? rx1 : rx0;
  const minY = ry0 <= ry1 ? ry0 : ry1, maxY = ry0 <= ry1 ? ry1 : ry0;

  floatView[0] = (minX + maxX) * 0.5;
  floatView[1] = (minY + maxY) * 0.5;
  floatView[2] = 1 / Math.max((maxX - minX) * 0.5, 1e-4);
  floatView[3] = 1 / Math.max((maxY - minY) * 0.5, 1e-4);
  floatView[4] = Math.max(0.25, finiteOr(input.pixelScale, 1));
  floatView[5] = Math.max(0.5, finiteOr(input.aaSharpness, 1));
  floatView[6] = finiteOr(input.impastoLightX, 0.6);
  floatView[7] = finiteOr(input.impastoLightY, -0.6);
  return { buffer, floatView, byteLength: RENDER_VIEW_UNIFORM_BYTES };
}

function checkBalancedDelimiters(source: string): boolean {
  let brace = 0, paren = 0, bracket = 0;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") brace += 1;
    else if (ch === "}") brace -= 1;
    else if (ch === "(") paren += 1;
    else if (ch === ")") paren -= 1;
    else if (ch === "[") bracket += 1;
    else if (ch === "]") bracket -= 1;
    if (brace < 0 || paren < 0 || bracket < 0) return false;
  }
  return brace === 0 && paren === 0 && bracket === 0;
}

function extractBindingKeys(source: string): { keys: string[]; duplicates: string[] } {
  const regex = /@group\(\s*(\d+)\s*\)\s*@binding\(\s*(\d+)\s*\)/g;
  const seen = new Set<string>();
  const keys: string[] = [];
  const duplicates: string[] = [];
  for (let m = regex.exec(source); m !== null; m = regex.exec(source)) {
    const key = `g${m[1]}:b${m[2]}`;
    keys.push(key);
    if (seen.has(key)) duplicates.push(key);
    else seen.add(key);
  }
  return { keys, duplicates };
}

function stripWgslComments(source: string): string {
  return source.replace(/\/\/[^\n]*/g, "");
}

function findReservedKeywordIdentifiers(source: string): string[] {
  const clean = stripWgslComments(source);
  const hits = new Set<string>();
  const declRegex =
    /\b(?:let|var(?:<[^>]+>)?|fn|struct)\s+([A-Za-z_][A-Za-z0-9_]*)\b|(?:^|[{,;(\n])\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm;
  for (let m = declRegex.exec(clean); m !== null; m = declRegex.exec(clean)) {
    const ident = m[1] ?? m[2] ?? "";
    if ((WGSL_RESERVED_IDENTIFIER_GUARD as readonly string[]).includes(ident)) hits.add(ident);
  }
  return Array.from(hits);
}

/** 프러스텀 컬링 Compute 셰이더와 Loop-Blinn Render 셰이더의 구조·바인딩·정렬·uniformity 계약을 검증한다. */
export function validateInstancedWgslBundle(
  cullWgsl: string = GPU_FRUSTUM_CULL_INDIRECT_WGSL,
  renderWgsl: string = INSTANCED_LOOP_BLINN_OBJECT_WGSL,
): InstancedWgslValidationReport {
  const errors: string[] = [];
  if (CULL_UNIFORM_BYTES % 16 !== 0) errors.push("CullViewportUniforms 16-byte 정렬 위반");
  if (RENDER_VIEW_UNIFORM_BYTES % 16 !== 0) errors.push("RenderViewportUniforms 16-byte 정렬 위반");
  if (INSTANCED_OBJECT_STRIDE_BYTES !== 32) errors.push("GpuSceneInstance 스트라이드는 32B여야 함");
  if (!checkBalancedDelimiters(cullWgsl)) errors.push("cullWgsl 괄호 균형 불일치");
  if (!checkBalancedDelimiters(renderWgsl)) errors.push("renderWgsl 괄호 균형 불일치");

  const cleanCull = stripWgslComments(cullWgsl);
  const cleanRender = stripWgslComments(renderWgsl);
  if (!/@compute\s+@workgroup_size\(\s*64\s*,\s*1\s*,\s*1\s*\)/.test(cleanCull)) {
    errors.push("cullWgsl에 `@compute @workgroup_size(64, 1, 1)` 누락");
  }
  const hasAtomicIndirectCompaction = /atomicAdd\(\s*&indirectArgs\.instanceCount\s*,\s*1u\s*\)/.test(cleanCull);
  if (!hasAtomicIndirectCompaction) errors.push("cullWgsl에 `atomicAdd(&indirectArgs.instanceCount, 1u)` 누락");
  if (!/if\s*\(\s*idx\s*>=\s*cullParams\.object_count\s*\)/.test(cleanCull)) {
    errors.push("cullWgsl 오브젝트 경계 가드 누락");
  }
  if (!/@vertex\b/.test(cleanRender) || !/@fragment\b/.test(cleanRender)) {
    errors.push("renderWgsl에 `@vertex`/`@fragment` 진입점 누락");
  }
  if (!/@builtin\(\s*vertex_index\s*\)/.test(cleanRender) || !/@builtin\(\s*instance_index\s*\)/.test(cleanRender)) {
    errors.push("renderWgsl에 vertex_index/instance_index 빌트인 누락");
  }

  const hasLoopBlinnFwidthAa = /\bfwidth\s*\(/.test(cleanRender) && /\bdpdx\s*\(/.test(cleanRender);
  if (!hasLoopBlinnFwidthAa) errors.push("renderWgsl에 Loop-Blinn `dpdx`/`fwidth` AA 연산 누락");
  const lastFwidthIdx = cleanRender.lastIndexOf("fwidth(");
  const firstDiscardIdx = cleanRender.indexOf("discard;");
  const hasUniformitySafeFwidth = hasLoopBlinnFwidthAa && (firstDiscardIdx < 0 || lastFwidthIdx < firstDiscardIdx);
  if (hasLoopBlinnFwidthAa && !hasUniformitySafeFwidth) {
    errors.push("renderWgsl `fwidth` 호출이 `discard` 이후에 위치해 uniformity 위반");
  }

  const cullBind = extractBindingKeys(cleanCull);
  const renderBind = extractBindingKeys(cleanRender);
  for (const dup of cullBind.duplicates) errors.push(`cullWgsl 바인딩 중복: ${dup}`);
  for (const dup of renderBind.duplicates) errors.push(`renderWgsl 바인딩 중복: ${dup}`);
  if (cullBind.keys.length < 4) errors.push(`cullWgsl 바인딩 부족(${cullBind.keys.length} < 4)`);
  if (renderBind.keys.length < 2) errors.push(`renderWgsl 바인딩 부족(${renderBind.keys.length} < 2)`);

  const reservedKeywordHits = [...findReservedKeywordIdentifiers(cullWgsl), ...findReservedKeywordIdentifiers(renderWgsl)];
  if (reservedKeywordHits.length > 0) {
    errors.push(`Chromium WGSL 예약어 충돌: ${reservedKeywordHits.join(", ")}`);
  }

  return {
    scope: "static-source-contract", gpuCompiled: false,
    valid: errors.length === 0,
    errors,
    computeBindings: cullBind.keys,
    renderBindings: renderBind.keys,
    hasAtomicIndirectCompaction,
    hasLoopBlinnFwidthAa,
    hasUniformitySafeFwidth,
    reservedKeywordHits,
  };
}

/** `GPU_FRUSTUM_CULL_INDIRECT_WGSL`의 회전 보수 AABB 컬링 및 아토믹 컴팩션 CPU 참조 검증 패스. */
export function emulateGpuFrustumCullPass(
  sourceFloatData: Float32Array,
  packedUniforms: PackedCullUniforms,
): CpuGpuCullParityResult {
  assertCpuCullInput(sourceFloatData, packedUniforms);
  const uf = packedUniforms.floatView;
  const uu = packedUniforms.uintView;
  const viewMinX = (uf[0] ?? 0) - (uf[4] ?? 0);
  const viewMinY = (uf[1] ?? 0) - (uf[5] ?? 0);
  const viewMaxX = (uf[2] ?? 0) + (uf[4] ?? 0);
  const viewMaxY = (uf[3] ?? 0) + (uf[5] ?? 0);
  const objectCount = Math.min(uu[6] ?? 0, Math.floor(sourceFloatData.length / INSTANCED_OBJECT_STRIDE_FLOATS));
  const kindMask = uu[7] ?? SCENE_OBJECT_ALL_KINDS_MASK;
  const requiredFlags = uu[8] ?? SCENE_OBJECT_FLAG_VISIBLE;
  const maxOut = uu[9] ?? objectCount;
  const vertexCount = uu[10] ?? 6;

  const sourceUint = new Uint32Array(sourceFloatData.buffer, sourceFloatData.byteOffset, sourceFloatData.length);
  const outFloat = new Float32Array(maxOut * INSTANCED_OBJECT_STRIDE_FLOATS);
  const outUint = new Uint32Array(outFloat.buffer, outFloat.byteOffset, outFloat.length);
  let atomicCount = 0, overflowCount = 0;

  for (let idx = 0; idx < objectCount; idx += 1) {
    const base = idx * INSTANCED_OBJECT_STRIDE_FLOATS;
    const matBits = sourceUint[base + 7] ?? 0;
    if ((((matBits >>> 4) & 0x0f) & requiredFlags) !== requiredFlags) continue;
    if (((1 << (matBits & 0x0f)) & kindMask) === 0) continue;

    const cx = sourceFloatData[base] ?? 0, cy = sourceFloatData[base + 1] ?? 0;
    const hw = Math.max(sourceFloatData[base + 2] ?? 0, 0), hh = Math.max(sourceFloatData[base + 3] ?? 0, 0);
    const rot = sourceFloatData[base + 4] ?? 0;
    const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
    const extX = hw * c + hh * s, extY = hw * s + hh * c;
    if (cx + extX < viewMinX || cx - extX > viewMaxX || cy + extY < viewMinY || cy - extY > viewMaxY) continue;

    const slot = atomicCount;
    atomicCount += 1;
    if (slot < maxOut) {
      const dst = slot * INSTANCED_OBJECT_STRIDE_FLOATS;
      for (let k = 0; k < INSTANCED_OBJECT_STRIDE_FLOATS; k += 1) outUint[dst + k] = sourceUint[base + k] ?? 0;
    } else {
      overflowCount += 1;
    }
  }

  const storedCount = Math.min(atomicCount, maxOut);
  const indirectArgs = new Uint32Array(DRAW_INDIRECT_U32_COUNT);
  indirectArgs[0] = vertexCount >>> 0;
  indirectArgs[1] = storedCount >>> 0;
  return {
    visibleInstanceFloatData: outFloat.subarray(0, storedCount * INSTANCED_OBJECT_STRIDE_FLOATS),
    visibleInstanceUintData: outUint.subarray(0, storedCount * INSTANCED_OBJECT_STRIDE_FLOATS),
    indirectArgs,
    visibleCount: storedCount,
    overflowCount,
  };
}
