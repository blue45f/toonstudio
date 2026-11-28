/**
 * Wave 113 — WebGPU WGSL 깊이·법선·재질 경계 NPR 선화 및 1-바운스 GI 조화 셰이더 생성·검증기.
 */

import { clamp } from "./background-presets-and-math";

export interface BackgroundNprGiWgslOptions {
  readonly creaseAngleDeg?: number;
  readonly characterDepthMeters?: number;
  readonly bounceStrength?: number;
  readonly mistStrength?: number;
}

export interface WgslBindingDescriptor {
  readonly group: number;
  readonly binding: number;
  readonly name: string;
  readonly addressSpace: "uniform" | "storage-read" | "storage-read-write";
}

export interface BackgroundNprGiWgslArtifact {
  readonly wgsl: string;
  readonly uniformBufferByteLength: number;
  readonly bindings: readonly WgslBindingDescriptor[];
  readonly entryPoints: readonly string[];
}

export interface BackgroundNprGiWgslValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly lineCount: number;
  readonly entryPointCount: number;
  readonly bindingCount: number;
}

/**
 * WebGPU WGSL 깊이·법선·재질 경계 기반 3D 배경 NPR 선화 추출 및
 * 1-바운스 GI 색번짐·2D 캐릭터 깊이 평면 조화 셰이더를 생성한다.
 */
export function buildBackgroundNprGiWgsl(
  options?: BackgroundNprGiWgslOptions,
): BackgroundNprGiWgslArtifact {
  const creaseCos = Math.cos((clamp(options?.creaseAngleDeg ?? 35, 1, 179) * Math.PI) / 180);
  const charDepth = clamp(options?.characterDepthMeters ?? 3.4, 0.3, 80);
  const bounceStrength = clamp(options?.bounceStrength ?? 0.86, 0, 0.95);
  const mistStrength = clamp(options?.mistStrength ?? 0.38, 0, 0.85);

  const bindings: readonly WgslBindingDescriptor[] = [
    { group: 0, binding: 0, name: "u_npr_gi", addressSpace: "uniform" },
    { group: 0, binding: 1, name: "b_patches", addressSpace: "storage-read" },
    { group: 0, binding: 2, name: "b_gi_out", addressSpace: "storage-read-write" },
    { group: 0, binding: 3, name: "b_gbuffer", addressSpace: "storage-read" },
  ];

  const wgsl = `// Wave 113 3D Background NPR Lineart + 1-Bounce GI Harmonizer WGSL
struct NprGiUniforms {
  viewport_and_depth: vec4<f32>,
  crease_char_bounce_mist: vec4<f32>,
  mist_color_and_soften: vec4<f32>,
  ink_near_far_params: vec4<f32>,
};

struct GiPatchRecord {
  centroid_and_area: vec4<f32>,
  normal_and_depth: vec4<f32>,
  albedo_and_mat: vec4<f32>,
  direct_radiance: vec4<f32>,
};

struct GBufferSample {
  normal_and_depth: vec4<f32>,
  shaded_and_mat: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u_npr_gi: NprGiUniforms;
@group(0) @binding(1) var<storage, read> b_patches: array<GiPatchRecord>;
@group(0) @binding(2) var<storage, read_write> b_gi_out: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> b_gbuffer: array<GBufferSample>;

const DEFAULT_CREASE_COS: f32 = ${creaseCos.toFixed(5)};
const DEFAULT_CHAR_DEPTH: f32 = ${charDepth.toFixed(3)};
const DEFAULT_BOUNCE_GAIN: f32 = ${bounceStrength.toFixed(4)};
const DEFAULT_MIST_GAIN: f32 = ${mistStrength.toFixed(4)};
const MAX_FORM_FACTOR_SUM: f32 = 0.86;

fn soft_tonemap_rgb(c: vec3<f32>) -> vec3<f32> {
  let safe_c = max(c, vec3<f32>(0.0));
  return clamp(safe_c / (vec3<f32>(1.0) + safe_c * 0.45), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn eval_edge_strength(idx: u32, width: u32, height: u32) -> f32 {
  let px = idx % width;
  let py = idx / width;
  let right_idx = py * width + min(px + 1u, width - 1u);
  let down_idx = min(py + 1u, height - 1u) * width + px;
  let c = b_gbuffer[idx];
  let r = b_gbuffer[right_idx];
  let d = b_gbuffer[down_idx];

  let depth_grad = max(abs(c.normal_and_depth.w - r.normal_and_depth.w), abs(c.normal_and_depth.w - d.normal_and_depth.w));
  let sil_edge = smoothstep(0.08, 0.32, depth_grad / max(c.normal_and_depth.w, 0.25));
  let crease_cos = min(dot(c.normal_and_depth.xyz, r.normal_and_depth.xyz), dot(c.normal_and_depth.xyz, d.normal_and_depth.xyz));
  let threshold_cos = select(DEFAULT_CREASE_COS, u_npr_gi.crease_char_bounce_mist.x, u_npr_gi.crease_char_bounce_mist.x > 0.0);
  let crease_edge = select(0.0, 1.0, crease_cos < threshold_cos);
  let seam_edge = select(0.0, 0.72, abs(c.shaded_and_mat.w - r.shaded_and_mat.w) > 0.5 || abs(c.shaded_and_mat.w - d.shaded_and_mat.w) > 0.5);
  return max(sil_edge, max(crease_edge, seam_edge));
}

@compute @workgroup_size(8, 8, 1)
fn cs_radiosity_one_bounce(@builtin(global_invocation_id) gid: vec3<u32>) {
  let count = arrayLength(&b_patches);
  let i = gid.x + gid.y * 64u;
  if (i >= count) { return; }
  let recv = b_patches[i];
  var raw_bounce = vec3<f32>(0.0, 0.0, 0.0);
  var ff_sum = 0.0;
  for (var j: u32 = 0u; j < count; j = j + 1u) {
    if (i == j) { continue; }
    let send = b_patches[j];
    let delta = send.centroid_and_area.xyz - recv.centroid_and_area.xyz;
    let dist = length(delta);
    if (dist <= 1e-4) { continue; }
    let dir = delta / dist;
    let cos_i = dot(recv.normal_and_depth.xyz, dir);
    let cos_j = -dot(send.normal_and_depth.xyz, dir);
    if (cos_i <= 1e-4 || cos_j <= 1e-4) { continue; }
    let area_j = max(send.centroid_and_area.w, 1e-4);
    let ff = (cos_i * cos_j * area_j) / (3.14159265 * dist * dist + area_j);
    ff_sum = ff_sum + ff;
    raw_bounce = raw_bounce + ff * send.direct_radiance.xyz;
  }
  let norm_scale = select(1.0, MAX_FORM_FACTOR_SUM / ff_sum, ff_sum > MAX_FORM_FACTOR_SUM);
  let gain = clamp(select(DEFAULT_BOUNCE_GAIN, u_npr_gi.crease_char_bounce_mist.z, u_npr_gi.crease_char_bounce_mist.z > 0.0), 0.0, 0.95);
  let bounce_rad = recv.albedo_and_mat.xyz * raw_bounce * norm_scale * gain;
  b_gi_out[i] = vec4<f32>(recv.direct_radiance.xyz + bounce_rad, min(ff_sum, MAX_FORM_FACTOR_SUM));
}

@fragment
fn fs_background_npr_gi(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let width = max(u32(u_npr_gi.viewport_and_depth.x), 1u);
  let height = max(u32(u_npr_gi.viewport_and_depth.y), 1u);
  let px = min(u32(frag_coord.x), width - 1u);
  let py = min(u32(frag_coord.y), height - 1u);
  let idx = py * width + px;
  let sample_gb = b_gbuffer[idx];
  let depth_m = sample_gb.normal_and_depth.w;

  let char_depth = select(DEFAULT_CHAR_DEPTH, u_npr_gi.crease_char_bounce_mist.y, u_npr_gi.crease_char_bounce_mist.y > 0.0);
  let behind_t = smoothstep(char_depth - 0.12, char_depth + 1.2, depth_m);
  let base_rgb = soft_tonemap_rgb(sample_gb.shaded_and_mat.xyz);
  let lum = dot(base_rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
  let soften = behind_t * clamp(u_npr_gi.mist_color_and_soften.w, 0.0, 0.85);
  let mist_gain = behind_t * clamp(select(DEFAULT_MIST_GAIN, u_npr_gi.crease_char_bounce_mist.w, u_npr_gi.crease_char_bounce_mist.w > 0.0), 0.0, 0.85);
  let softened = mix(base_rgb, vec3<f32>(0.68), soften);
  let harmonized = mix(softened, u_npr_gi.mist_color_and_soften.xyz, mist_gain);

  let edge = eval_edge_strength(idx, width, height);
  let norm_d = clamp((depth_m - u_npr_gi.viewport_and_depth.z) / max(u_npr_gi.viewport_and_depth.w - u_npr_gi.viewport_and_depth.z, 0.5), 0.0, 1.0);
  let ink_tone = mix(vec3<f32>(0.08, 0.09, 0.11), vec3<f32>(0.32, 0.34, 0.38), norm_d);
  let ink_alpha = clamp(edge * mix(0.95, 0.58, norm_d), 0.0, 1.0);
  let final_rgb = mix(harmonized, ink_tone, ink_alpha * (0.85 + 0.15 * lum));
  return vec4<f32>(final_rgb, 1.0);
}
`;

  return {
    wgsl,
    uniformBufferByteLength: 64,
    bindings,
    entryPoints: ["cs_radiosity_one_bounce", "fs_background_npr_gi"],
  };
}

/** 생성된 WebGPU WGSL 셰이더의 구조·괄호 균형·엔트리포인트·바인딩 및 금지 GLSL 토큰을 검증한다. */
export function validateBackgroundNprGiWgsl(
  artifactOrSource: BackgroundNprGiWgslArtifact | string,
): BackgroundNprGiWgslValidation {
  const wgsl = typeof artifactOrSource === "string" ? artifactOrSource : artifactOrSource.wgsl;
  const errors: string[] = [];
  const lines = wgsl.split("\n");

  if (wgsl.trim().length < 64) errors.push("WGSL 소스가 너무 짧거나 비어 있습니다.");
  if (/\bNaN\b|\bInfinity\b/u.test(wgsl)) errors.push("WGSL 소스에 NaN 또는 Infinity 리터럴이 포함되었습니다.");

  let braceDepth = 0;
  let parenDepth = 0;
  for (let i = 0; i < wgsl.length; i++) {
    const ch = wgsl[i];
    if (ch === "{") braceDepth += 1;
    else if (ch === "}") braceDepth -= 1;
    else if (ch === "(") parenDepth += 1;
    else if (ch === ")") parenDepth -= 1;
    if (braceDepth < 0) {
      errors.push("닫는 중괄호 '}'가 여는 중괄호보다 먼저 나타났습니다.");
      break;
    }
    if (parenDepth < 0) {
      errors.push("닫는 소괄호 ')'가 여는 소괄호보다 먼저 나타났습니다.");
      break;
    }
  }
  if (braceDepth !== 0) errors.push(`중괄호 균형 불일치(잔여 깊이 ${braceDepth}).`);
  if (parenDepth !== 0) errors.push(`소괄호 균형 불일치(잔여 깊이 ${parenDepth}).`);

  const bindingCount = (wgsl.match(/@group\(\d+\)\s+@binding\(\d+\)/gu) ?? []).length;
  if (bindingCount < 3) errors.push(`필수 @group/@binding 선언이 부족합니다(현재 ${bindingCount}개).`);

  const hasCompute = /@compute\b/u.test(wgsl);
  const hasFragment = /@fragment\b/u.test(wgsl);
  const entryPointCount = (hasCompute ? 1 : 0) + (hasFragment ? 1 : 0);
  if (!hasCompute) errors.push("@compute 라디오시티 엔트리포인트가 누락되었습니다.");
  if (!hasFragment) errors.push("@fragment NPR 합성 엔트리포인트가 누락되었습니다.");

  for (const pattern of [/\bgl_FragColor\b/u, /\buniform\s+sampler2D\b/u, /\bvarying\s+vec/u]) {
    if (pattern.test(wgsl)) errors.push(`비호환 GLSL 토큰 감지: ${pattern.source}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    lineCount: lines.length,
    entryPointCount,
    bindingCount,
  };
}
