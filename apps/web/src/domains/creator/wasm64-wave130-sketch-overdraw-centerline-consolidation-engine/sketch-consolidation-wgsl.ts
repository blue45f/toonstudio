/**
 * Wave 130 — WebGPU WGSL 거리장 중앙선 세선화 & 만화 G펜 SDF 안티앨리어싱 셰이더 생성기·검증기.
 *
 * - 16바이트 정렬 64B 유니폼 구조체(`ConsolidationUniforms`)와 스토리지 버퍼(`RoughSample` 32B,
 *   `CenterlineVertex` 32B)를 사용해 러프 연필선 거리장 중앙선 수렴(@compute)과
 *   G펜 가변폭 SDF 안티앨리어싱(@vertex / @fragment)을 병렬 실행한다.
 * - 괄호 균형, 바인딩, 16바이트 정렬, 엔트리포인트, 비유한 토큰 및 GLSL 금지어를 검증한다.
 */

import {
  resolveSketchConsolidationOptions,
  type SketchConsolidationOptions,
} from "./sketch-consolidation-types";

export interface SketchConsolidationWgslBindingSpec {
  readonly group: number;
  readonly binding: number;
  readonly name: string;
  readonly addressSpace: "uniform" | "storage-read" | "storage-read-write";
  readonly strideBytes: number;
}

export interface SketchConsolidationWgslArtifact {
  readonly wgsl: string;
  readonly uniformBufferByteLength: number;
  readonly roughSampleStrideBytes: number;
  readonly centerlineVertexStrideBytes: number;
  readonly workgroupSizeX: number;
  readonly bindings: readonly SketchConsolidationWgslBindingSpec[];
  readonly entryPoints: readonly string[];
}

export interface SketchConsolidationWgslValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly lineCount: number;
  readonly bindingCount: number;
}

/**
 * 64B 정렬 유니폼 기반 중앙선 거리장 필터(@compute)와 G펜 SDF 안티앨리어싱(@vertex/@fragment)
 * WGSL 셰이더 아티팩트를 생성한다.
 */
export function buildSketchConsolidationWgsl(
  options?: SketchConsolidationOptions,
): SketchConsolidationWgslArtifact {
  const opts = resolveSketchConsolidationOptions(options);
  const bwStr = opts.clusterBandwidthPx.toFixed(3);
  const cosStr = opts.minTangentCosine.toFixed(4);
  const huberStr = opts.huberDeltaPx.toFixed(3);
  const taperStr = opts.taperRatio.toFixed(4);

  const bindings: readonly SketchConsolidationWgslBindingSpec[] = [
    {
      group: 0,
      binding: 0,
      name: "u_consolidation",
      addressSpace: "uniform",
      strideBytes: 64,
    },
    {
      group: 0,
      binding: 1,
      name: "rough_samples",
      addressSpace: "storage-read",
      strideBytes: 32,
    },
    {
      group: 0,
      binding: 2,
      name: "centerline_vertices",
      addressSpace: "storage-read-write",
      strideBytes: 32,
    },
  ];

  const wgsl = `// Wave 130 Rough Sketch Overdraw Centerline Consolidation & G-Pen SDF Anti-Aliasing WGSL
// Default calibration: bandwidth=${bwStr}px, minTangentCos=${cosStr}, huberDelta=${huberStr}px, taper=${taperStr}
struct ConsolidationUniforms {
  viewport_and_bandwidth: vec4<f32>,
  huber_and_tangent: vec4<f32>,
  gpen_width_taper: vec4<f32>,
  ink_and_aa: vec4<f32>,
};

struct RoughSample {
  pos_t_pressure: vec4<f32>,
  tan_cluster_conf: vec4<f32>,
};

struct CenterlineVertex {
  pos_uv: vec4<f32>,
  width_density_meta: vec4<f32>,
};

@group(0) @binding(0)
var<uniform> u_consolidation: ConsolidationUniforms;

@group(0) @binding(1)
var<storage, read> rough_samples: array<RoughSample>;

@group(0) @binding(2)
var<storage, read_write> centerline_vertices: array<CenterlineVertex>;

fn huber_weight(residual_px: f32, delta_px: f32) -> f32 {
  let abs_r = abs(residual_px);
  let safe_delta = max(delta_px, 0.25);
  if (abs_r <= safe_delta) {
    return 1.0;
  }
  let ratio = safe_delta / abs_r;
  return select(ratio * ratio, ratio, abs_r <= safe_delta * 1.8);
}

fn gpen_taper_envelope(norm_t: f32, taper_ratio: f32) -> f32 {
  let tau = clamp(taper_ratio, 0.04, 0.42);
  let start_u = clamp(norm_t / tau, 0.0, 1.0);
  let end_u = clamp((1.0 - norm_t) / tau, 0.0, 1.0);
  let start_s = start_u * start_u * (3.0 - 2.0 * start_u);
  let end_s = end_u * end_u * (3.0 - 2.0 * end_u);
  return 0.24 + 0.76 * min(start_s, end_s);
}

@compute @workgroup_size(64)
fn cs_centerline_distance_filter(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let total_samples = arrayLength(&rough_samples);
  if (idx >= total_samples) {
    return;
  }

  let ref_s = rough_samples[idx];
  let ref_pos = ref_s.pos_t_pressure.xy;
  let norm_t = clamp(ref_s.pos_t_pressure.z, 0.0, 1.0);
  let ref_pressure = clamp(ref_s.pos_t_pressure.w, 0.05, 1.0);

  let raw_tan = ref_s.tan_cluster_conf.xy;
  let tan_len = max(length(raw_tan), 1e-5);
  let tangent = raw_tan / tan_len;
  let normal = vec2<f32>(-tangent.y, tangent.x);

  let bandwidth = max(u_consolidation.viewport_and_bandwidth.z, 1.0);
  let huber_delta = max(u_consolidation.huber_and_tangent.x, 0.5);
  let min_tan_cos = clamp(u_consolidation.huber_and_tangent.y, 0.5, 0.995);

  var normal_accum = 0.0;
  var pressure_accum = ref_pressure;
  var weight_accum = 1.0;
  var density_accum = 1.0;

  let scan_limit = min(total_samples, 256u);
  for (var j = 0u; j < scan_limit; j = j + 1u) {
    if (j == idx) {
      continue;
    }
    let cand = rough_samples[j];
    let diff = cand.pos_t_pressure.xy - ref_pos;
    let dist = length(diff);
    if (dist > bandwidth) {
      continue;
    }
    let cand_tan = cand.tan_cluster_conf.xy / max(length(cand.tan_cluster_conf.xy), 1e-5);
    let abs_cos = abs(dot(tangent, cand_tan));
    if (abs_cos < min_tan_cos) {
      continue;
    }
    let signed_normal = dot(diff, normal);
    let hw = huber_weight(signed_normal, huber_delta) * clamp(cand.tan_cluster_conf.w, 0.1, 1.0);
    normal_accum = normal_accum + signed_normal * hw;
    pressure_accum = pressure_accum + clamp(cand.pos_t_pressure.w, 0.05, 1.0) * hw;
    weight_accum = weight_accum + hw;
    density_accum = density_accum + select(hw, 1.0, hw >= 0.4);
  }

  let mean_normal_shift = normal_accum / max(weight_accum, 1e-5);
  let center_pos = ref_pos + normal * mean_normal_shift;
  let avg_pressure = clamp(pressure_accum / max(weight_accum, 1e-5), 0.05, 1.0);

  let density_boost = clamp(log(1.0 + max(0.0, density_accum - 1.0)) / log(8.0), 0.0, 1.0);
  let taper = gpen_taper_envelope(norm_t, u_consolidation.gpen_width_taper.z);
  let base_w = max(u_consolidation.gpen_width_taper.x, 0.4);
  let max_w = max(u_consolidation.gpen_width_taper.y, base_w + 0.4);
  let body_factor = clamp(0.48 * avg_pressure + 0.52 * density_boost, 0.05, 1.0);
  let final_width = clamp((base_w + (max_w - base_w) * body_factor) * taper, base_w * 0.22, max_w);
  let half_w = final_width * 0.5;

  let left_pos = center_pos + normal * half_w;
  let right_pos = center_pos - normal * half_w;
  let out_base = idx * 2u;

  centerline_vertices[out_base] = CenterlineVertex(
    vec4<f32>(left_pos.x, left_pos.y, norm_t, 0.0),
    vec4<f32>(final_width, density_accum, taper, avg_pressure),
  );
  centerline_vertices[out_base + 1u] = CenterlineVertex(
    vec4<f32>(right_pos.x, right_pos.y, norm_t, 1.0),
    vec4<f32>(final_width, density_accum, taper, avg_pressure),
  );
}

struct GpenVertOut {
  @builtin(position) clip_pos: vec4<f32>,
  @location(0) ribbon_uv: vec2<f32>,
  @location(1) width_and_taper: vec2<f32>,
};

@vertex
fn vs_gpen_ink_ribbon(@builtin(vertex_index) vid: u32) -> GpenVertOut {
  var out: GpenVertOut;
  let cv = centerline_vertices[vid];
  let vp = max(u_consolidation.viewport_and_bandwidth.xy, vec2<f32>(1.0, 1.0));
  let ndc_x = (cv.pos_uv.x / vp.x) * 2.0 - 1.0;
  let ndc_y = 1.0 - (cv.pos_uv.y / vp.y) * 2.0;
  out.clip_pos = vec4<f32>(ndc_x, ndc_y, 0.0, 1.0);
  out.ribbon_uv = cv.pos_uv.zw;
  out.width_and_taper = vec2<f32>(cv.width_density_meta.x, cv.width_density_meta.z);
  return out;
}

@fragment
fn fs_gpen_sdf_antialias(in_v: GpenVertOut) -> @location(0) vec4<f32> {
  let cross_v = clamp(in_v.ribbon_uv.y, 0.0, 1.0);
  let edge_sdf = abs(cross_v - 0.5) - 0.48;
  let aa_px = max(fwidth(edge_sdf), max(u_consolidation.ink_and_aa.w, 1e-4));
  let coverage = smoothstep(aa_px * 0.55, -aa_px * 0.55, edge_sdf);
  let ink_luma = clamp(u_consolidation.ink_and_aa.x, 0.0, 1.0);
  let ink_alpha = coverage * clamp(u_consolidation.ink_and_aa.y, 0.0, 1.0);
  return vec4<f32>(ink_luma, ink_luma, ink_luma, ink_alpha);
}
`;

  return {
    wgsl,
    uniformBufferByteLength: 64,
    roughSampleStrideBytes: 32,
    centerlineVertexStrideBytes: 32,
    workgroupSizeX: 64,
    bindings,
    entryPoints: [
      "cs_centerline_distance_filter",
      "vs_gpen_ink_ribbon",
      "fs_gpen_sdf_antialias",
    ],
  };
}

/**
 * Wave 130 중앙선 세선화 & G펜 SDF 안티앨리어싱 WGSL 아티팩트의 구조·바인딩·16바이트 정렬·
 * 괄호 균형·금지 GLSL 토큰 여부를 검증한다.
 */
export function validateSketchConsolidationWgsl(
  input: SketchConsolidationWgslArtifact | string,
): SketchConsolidationWgslValidationResult {
  const wgsl = typeof input === "string" ? input : input.wgsl;
  const errors: string[] = [];

  if (!wgsl || wgsl.trim().length === 0) {
    return {
      valid: false,
      errors: ["WGSL source is empty."],
      lineCount: 0,
      bindingCount: 0,
    };
  }

  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  for (let i = 0; i < wgsl.length; i += 1) {
    const ch = wgsl.charAt(i);
    if (ch === "{") braceDepth += 1;
    else if (ch === "}") braceDepth -= 1;
    else if (ch === "(") parenDepth += 1;
    else if (ch === ")") parenDepth -= 1;
    else if (ch === "[") bracketDepth += 1;
    else if (ch === "]") bracketDepth -= 1;

    if (braceDepth < 0 || parenDepth < 0 || bracketDepth < 0) {
      errors.push("Unbalanced delimiter encountered in WGSL source.");
      break;
    }
  }
  if (braceDepth !== 0) errors.push(`Unbalanced curly braces (depth=${braceDepth}).`);
  if (parenDepth !== 0) errors.push(`Unbalanced parentheses (depth=${parenDepth}).`);
  if (bracketDepth !== 0) errors.push(`Unbalanced square brackets (depth=${bracketDepth}).`);

  const bindingMatches = wgsl.match(/@group\(\d+\)\s*@binding\(\d+\)/g) ?? [];
  if (!/@group\(0\)\s*@binding\(0\)/.test(wgsl)) {
    errors.push("Missing @group(0) @binding(0) uniform buffer binding.");
  }
  if (!/@group\(0\)\s*@binding\(1\)/.test(wgsl)) {
    errors.push("Missing @group(0) @binding(1) rough sample storage binding.");
  }
  if (!/@group\(0\)\s*@binding\(2\)/.test(wgsl)) {
    errors.push("Missing @group(0) @binding(2) centerline vertex storage binding.");
  }

  if (!/@compute\s+@workgroup_size\(\d+/.test(wgsl)) {
    errors.push("Missing @compute @workgroup_size entry point.");
  }
  if (!/@vertex/.test(wgsl)) {
    errors.push("Missing @vertex entry point.");
  }
  if (!/@fragment/.test(wgsl)) {
    errors.push("Missing @fragment entry point.");
  }
  if (!/\bfwidth\s*\(/.test(wgsl) || !/\bsmoothstep\s*\(/.test(wgsl)) {
    errors.push("Missing fwidth()/smoothstep() SDF anti-aliasing calls.");
  }
  if (/\b(?:NaN|Infinity|undefined)\b/.test(wgsl)) {
    errors.push("WGSL contains non-finite or undefined token.");
  }
  if (
    /\b(?:gl_FragColor|gl_Position|gl_GlobalInvocationID|dFdx|dFdy|texture2D|sampler2D|varying|attribute|highp|mediump|lowp)\b/.test(
      wgsl,
    )
  ) {
    errors.push("WGSL contains forbidden GLSL keyword.");
  }

  if (typeof input !== "string") {
    if (input.uniformBufferByteLength < 16 || input.uniformBufferByteLength % 16 !== 0) {
      errors.push("uniformBufferByteLength must be a positive multiple of 16 bytes.");
    }
    if (input.roughSampleStrideBytes < 16 || input.roughSampleStrideBytes % 16 !== 0) {
      errors.push("roughSampleStrideBytes must be a positive multiple of 16 bytes.");
    }
    if (input.centerlineVertexStrideBytes < 16 || input.centerlineVertexStrideBytes % 16 !== 0) {
      errors.push("centerlineVertexStrideBytes must be a positive multiple of 16 bytes.");
    }
    for (let i = 0; i < input.entryPoints.length; i += 1) {
      const ep = input.entryPoints[i];
      if (ep && !new RegExp(`fn\\s+${ep}\\s*\\(`).test(wgsl)) {
        errors.push(`Declared entry point '${ep}' not found in WGSL source.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    lineCount: wgsl.split("\n").length,
    bindingCount: bindingMatches.length,
  };
}
