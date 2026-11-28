/**
 * Wave 116 — WebGPU WGSL 아크-길이 패턴 리본 매핑 & 곡률 마이터 가드 셰이더 생성기·검증기.
 *
 * - 16바이트 정렬 유니폼 구조체(64B)와 스토리지 버퍼(SpineSample 32B, RibbonVertex 32B)를 사용해
 *   아크-길이 기반 등간격 UV 타일링(fract)과 곡률 반경 비례 내측 오프셋 클램핑을 GPU에서 병렬 계산한다.
 * - 5종 웹툰 패턴(chain-link, gothic-lace, botanical-vine, korean-dancheong-border, architectural-balustrade)별
 *   해석적 SDF 프래그먼트 셰이더를 생성하고 괄호 균형·바인딩·16바이트 정렬·금지 GLSL 토큰을 엄격히 검증한다.
 */

import {
  PATTERN_RIBBON_PRESETS,
  type PatternRibbonPresetId,
} from "./pattern-ribbon-geometry-and-presets";

export interface RibbonWgslBindingSpec {
  readonly group: number;
  readonly binding: number;
  readonly name: string;
  readonly addressSpace: "uniform" | "storage-read" | "storage-read-write";
  readonly strideBytes: number;
}

export interface ArcLengthRibbonWgslArtifact {
  readonly presetId: PatternRibbonPresetId;
  readonly patternMotifCode: number;
  readonly wgsl: string;
  readonly uniformBufferByteLength: number;
  readonly spineSampleStrideBytes: number;
  readonly ribbonVertexStrideBytes: number;
  readonly workgroupSizeX: number;
  readonly bindings: readonly RibbonWgslBindingSpec[];
  readonly entryPoints: readonly string[];
}

export interface ArcLengthRibbonWgslValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly lineCount: number;
  readonly bindingCount: number;
}

function buildPresetPatternSdfWgsl(presetId: PatternRibbonPresetId): string {
  switch (presetId) {
    case "chain-link":
      return [
        "  let p = vec2<f32>(tile_u - 0.5, v - 0.5);",
        "  let oval_outer = length(vec2<f32>(p.x / 0.40, p.y / 0.34)) - 1.0;",
        "  let oval_inner = 0.56 - length(vec2<f32>(p.x / 0.40, p.y / 0.34));",
        "  let link_ring = max(oval_outer, oval_inner);",
        "  let bridge_pin = max(abs(p.x - 0.38) - 0.14, abs(p.y) - 0.08);",
        "  let sdf = min(link_ring * 0.24, bridge_pin);",
      ].join("\n");
    case "gothic-lace":
      return [
        "  let arch_y = 0.20 + sin(tile_u * 3.14159265) * 0.66;",
        "  let scallop_edge = abs(v - arch_y) - 0.055;",
        "  let eyelet = abs(tile_u - 0.5) + abs(v - 0.5) - 0.16;",
        "  let hem_band = abs(v - 0.14) - 0.04;",
        "  let sdf = min(min(scallop_edge, abs(eyelet) - 0.035), hem_band);",
      ].join("\n");
    case "botanical-vine":
      return [
        "  let stem_y = 0.5 + sin(tile_u * 6.2831853) * 0.14;",
        "  let stem_sdf = abs(v - stem_y) - 0.045;",
        "  let leaf_center = vec2<f32>(tile_u - 0.52, v - 0.26);",
        "  let leaf_sdf = length(vec2<f32>(leaf_center.x * 1.4, leaf_center.y * 1.9)) - 0.22;",
        "  let sdf = min(stem_sdf, leaf_sdf);",
      ].join("\n");
    case "korean-dancheong-border":
      return [
        "  let outer_rail = min(abs(v - 0.12), abs(v - 0.88)) - 0.04;",
        "  let frame_box = max(abs(tile_u - 0.5) - 0.38, abs(v - 0.5) - 0.30);",
        "  let lotus_diamond = abs(tile_u - 0.5) + abs(v - 0.5) - 0.24;",
        "  let sdf = min(outer_rail, min(abs(frame_box) - 0.035, abs(lotus_diamond) - 0.035));",
      ].join("\n");
    case "architectural-balustrade":
      return [
        "  let rails = min(abs(v - 0.16), abs(v - 0.84)) - 0.06;",
        "  let waist_pinch = 0.11 + 0.045 * cos((v - 0.5) * 6.2831853);",
        "  let baluster = max(abs(tile_u - 0.5) - waist_pinch, abs(v - 0.5) - 0.34);",
        "  let sdf = min(rails, baluster);",
      ].join("\n");
  }
}

/**
 * 아크-길이 등간격 리본 매핑, 곡률 비례 내측 오프셋 마이터 가드 컴퓨트 패스,
 * 프리셋별 해석적 SDF 프래그먼트 패스를 포함한 WebGPU WGSL 셰이더를 생성한다.
 */
export function buildArcLengthRibbonWgsl(
  presetId: PatternRibbonPresetId,
): ArcLengthRibbonWgslArtifact {
  const preset = PATTERN_RIBBON_PRESETS[presetId];
  const patternSdfBlock = buildPresetPatternSdfWgsl(presetId);

  const bindings: readonly RibbonWgslBindingSpec[] = [
    {
      group: 0,
      binding: 0,
      name: "u_ribbon",
      addressSpace: "uniform",
      strideBytes: 64,
    },
    {
      group: 0,
      binding: 1,
      name: "spine_samples",
      addressSpace: "storage-read",
      strideBytes: 32,
    },
    {
      group: 0,
      binding: 2,
      name: "ribbon_vertices",
      addressSpace: "storage-read-write",
      strideBytes: 32,
    },
  ];

  const wgsl = `// Wave 116 Arc-Length Pattern Ribbon Brush & Curvature Miter Guard WGSL (${presetId})
struct RibbonUniforms {
  viewport_and_width: vec4<f32>,
  arclength_params: vec4<f32>,
  jitter_and_guard: vec4<f32>,
  ink_and_style: vec4<f32>,
};

struct SpineSample {
  pos_s_kappa: vec4<f32>,
  tan_pressure_bevel: vec4<f32>,
};

struct RibbonVertex {
  pos_uv: vec4<f32>,
  guard_meta: vec4<f32>,
};

@group(0) @binding(0)
var<uniform> u_ribbon: RibbonUniforms;

@group(0) @binding(1)
var<storage, read> spine_samples: array<SpineSample>;

@group(0) @binding(2)
var<storage, read_write> ribbon_vertices: array<RibbonVertex>;

fn hash_unit_f32(index_u: u32, seed_u: u32) -> f32 {
  var x = (index_u * 747796405u + seed_u * 2891336453u + 277803737u);
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  x = (x >> 22u) ^ x;
  return f32(x & 0x00ffffffu) / 16777215.0;
}

@compute @workgroup_size(64)
fn cs_arclength_miter_guard(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let sample_count = arrayLength(&spine_samples);
  if (idx >= sample_count) {
    return;
  }

  let sample = spine_samples[idx];
  let spine_pos = sample.pos_s_kappa.xy;
  let arc_s = sample.pos_s_kappa.z;
  let signed_kappa = sample.pos_s_kappa.w;

  let raw_tan = sample.tan_pressure_bevel.xy;
  let tan_len = max(length(raw_tan), 1e-5);
  let tangent = raw_tan / tan_len;
  let normal = vec2<f32>(-tangent.y, tangent.x);

  let pressure = clamp(sample.tan_pressure_bevel.z, 0.05, 1.0);
  let pressure_resp = clamp(u_ribbon.viewport_and_width.w, 0.0, 1.0);
  let pressure_scale = (1.0 - pressure_resp) + pressure_resp * (0.35 + 0.85 * pressure);

  let seed_u = u32(max(u_ribbon.jitter_and_guard.y, 1.0));
  let jitter = (hash_unit_f32(idx, seed_u) * 2.0 - 1.0) * u_ribbon.jitter_and_guard.x;
  let base_hw = max(1.2, u_ribbon.viewport_and_width.z * pressure_scale + jitter);

  let abs_kappa = abs(signed_kappa);
  let max_inner_ratio = clamp(u_ribbon.arclength_params.z, 0.25, 0.92);
  let miter_limit = clamp(u_ribbon.arclength_params.w, 1.05, 4.0);
  let safe_inner = select(base_hw, min(base_hw, max(0.25, max_inner_ratio / max(abs_kappa, 1e-5))), abs_kappa > 1e-5);
  let outer_cap = base_hw * miter_limit;

  let left_hw = min(outer_cap, select(base_hw, safe_inner, signed_kappa > 0.0));
  let right_hw = min(outer_cap, select(base_hw, safe_inner, signed_kappa < 0.0));

  let tile_repeat = max(u_ribbon.arclength_params.x, 1.0);
  let tile_u = arc_s / tile_repeat;
  let clamped_flag = select(0.0, 1.0, (left_hw < base_hw - 1e-4) || (right_hw < base_hw - 1e-4));

  let left_pos = spine_pos + normal * left_hw;
  let right_pos = spine_pos - normal * right_hw;

  let out_base = idx * 2u;
  ribbon_vertices[out_base] = RibbonVertex(
    vec4<f32>(left_pos.x, left_pos.y, tile_u, 0.0),
    vec4<f32>(signed_kappa, left_hw, clamped_flag, sample.tan_pressure_bevel.w),
  );
  ribbon_vertices[out_base + 1u] = RibbonVertex(
    vec4<f32>(right_pos.x, right_pos.y, tile_u, 1.0),
    vec4<f32>(signed_kappa, right_hw, clamped_flag, sample.tan_pressure_bevel.w),
  );
}

struct RibbonVertOut {
  @builtin(position) clip_pos: vec4<f32>,
  @location(0) ribbon_uv: vec2<f32>,
  @location(1) curvature_meta: vec2<f32>,
};

@vertex
fn vs_pattern_ribbon(@builtin(vertex_index) vid: u32) -> RibbonVertOut {
  var out: RibbonVertOut;
  let rv = ribbon_vertices[vid];
  let vp = max(u_ribbon.viewport_and_width.xy, vec2<f32>(1.0, 1.0));
  let ndc_x = (rv.pos_uv.x / vp.x) * 2.0 - 1.0;
  let ndc_y = 1.0 - (rv.pos_uv.y / vp.y) * 2.0;
  out.clip_pos = vec4<f32>(ndc_x, ndc_y, 0.0, 1.0);
  out.ribbon_uv = rv.pos_uv.zw;
  out.curvature_meta = vec2<f32>(abs(rv.guard_meta.x), rv.guard_meta.z);
  return out;
}

@fragment
fn fs_pattern_ribbon(in_v: RibbonVertOut) -> @location(0) vec4<f32> {
  let tile_u = fract(in_v.ribbon_uv.x);
  let v = clamp(in_v.ribbon_uv.y, 0.0, 1.0);
${patternSdfBlock}
  let aa = max(fwidth(sdf), max(u_ribbon.ink_and_style.w, 1e-4));
  let ink_mask = smoothstep(aa * 0.5, -aa * 0.5, sdf);
  let base_luma = mix(u_ribbon.ink_and_style.y, u_ribbon.ink_and_style.x, ink_mask);
  let guard_tint = clamp(in_v.curvature_meta.y * 0.12, 0.0, 0.12);
  let final_luma = clamp(base_luma - guard_tint, 0.0, 1.0);
  return vec4<f32>(final_luma, final_luma, final_luma, max(ink_mask, 0.08));
}
`;

  return {
    presetId,
    patternMotifCode: preset.patternMotifCode,
    wgsl,
    uniformBufferByteLength: 64,
    spineSampleStrideBytes: 32,
    ribbonVertexStrideBytes: 32,
    workgroupSizeX: 64,
    bindings,
    entryPoints: ["cs_arclength_miter_guard", "vs_pattern_ribbon", "fs_pattern_ribbon"],
  };
}

/**
 * Wave 116 WGSL 아크-길이 패턴 리본 셰이더의 괄호 균형, 바인딩, 16바이트 정렬,
 * 금지 GLSL 토큰, NaN/Infinity 오염 여부를 검증한다.
 */
export function validateArcLengthRibbonWgsl(
  input: ArcLengthRibbonWgslArtifact | string,
): ArcLengthRibbonWgslValidationResult {
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
    const ch = wgsl[i];
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
    errors.push("Missing @group(0) @binding(1) spine storage binding.");
  }
  if (!/@group\(0\)\s*@binding\(2\)/.test(wgsl)) {
    errors.push("Missing @group(0) @binding(2) ribbon vertex output binding.");
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
  if (!/\bfract\s*\(/.test(wgsl)) {
    errors.push("Missing fract() arc-length UV tile wrapping call.");
  }
  if (!/\bfwidth\s*\(/.test(wgsl) || !/\bsmoothstep\s*\(/.test(wgsl)) {
    errors.push("Missing fwidth()/smoothstep() analytical anti-aliasing.");
  }
  if (/\b(?:NaN|Infinity|undefined)\b/.test(wgsl)) {
    errors.push("WGSL contains non-finite or undefined token.");
  }
  if (/\b(?:gl_FragColor|gl_Position|dFdx|dFdy|texture2D|sampler2D|varying|attribute)\b/.test(wgsl)) {
    errors.push("WGSL contains forbidden GLSL keyword.");
  }

  if (typeof input !== "string") {
    if (input.uniformBufferByteLength < 16 || input.uniformBufferByteLength % 16 !== 0) {
      errors.push("uniformBufferByteLength must be a positive multiple of 16 bytes.");
    }
    if (input.spineSampleStrideBytes < 16 || input.spineSampleStrideBytes % 16 !== 0) {
      errors.push("spineSampleStrideBytes must be a positive multiple of 16 bytes.");
    }
    if (input.ribbonVertexStrideBytes < 16 || input.ribbonVertexStrideBytes % 16 !== 0) {
      errors.push("ribbonVertexStrideBytes must be a positive multiple of 16 bytes.");
    }
    for (let i = 0; i < input.entryPoints.length; i += 1) {
      const ep = input.entryPoints[i];
      if (!new RegExp(`fn\\s+${ep}\\s*\\(`).test(wgsl)) {
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
