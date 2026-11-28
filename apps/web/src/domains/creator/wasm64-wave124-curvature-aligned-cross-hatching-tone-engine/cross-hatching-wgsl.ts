/**
 * Wave 124 — WebGPU WGSL 주곡률 크로스해칭 안티앨리어싱 셰이더 생성기 및 검증기.
 *
 * - 16바이트 정렬 64바이트 유니폼 구조체(`CrossHatchUniforms`)
 * - 주곡률 방향장 UV 투영 + 3단계 임계치 크로스해칭 + `fwidth` 안티앨리어싱 프래그먼트/컴퓨트 WGSL
 * - 구조, 바인딩, 정렬, 괄호 균형, GLSL 금지어 정밀 검증
 */

import type { HatchStyleId } from "./surface-curvature-fields";

export interface CrossHatchWgslBindingDescriptor {
  readonly group: number;
  readonly binding: number;
  readonly name: string;
  readonly addressSpace: "uniform" | "storage-read" | "storage-read-write";
}

export interface CrossHatchToneWgslArtifact {
  readonly styleId: HatchStyleId;
  readonly wgsl: string;
  readonly uniformBufferByteLength: number;
  readonly bindings: readonly CrossHatchWgslBindingDescriptor[];
  readonly entryPoints: readonly string[];
  readonly activeTierCount: 1 | 3;
}

export interface CrossHatchWgslValidationReport {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly lineCount: number;
}

interface StyleWgslSnippetConfig {
  readonly styleIndex: number;
  readonly activeTierCount: 1 | 3;
  readonly evalSnippet: string;
}

function getStyleWgslConfig(styleId: HatchStyleId): StyleWgslSnippetConfig {
  switch (styleId) {
    case "g-pen-classic-cross":
      return {
        styleIndex: 0,
        activeTierCount: 3,
        evalSnippet: [
          "  let duty1 = clamp(0.16 + 0.34 * (1.0 - luma), 0.12, 0.56);",
          "  let duty2 = clamp(0.14 + 0.28 * (1.0 - luma), 0.10, 0.48);",
          "  let duty3 = clamp(0.12 + 0.26 * (1.0 - luma), 0.10, 0.44);",
          "  let h1 = aa_hatch_stripe(coord1, duty1) * smoothstep(t1 + 0.04, t1 - 0.04, luma);",
          "  let h2 = aa_hatch_stripe(coord2, duty2) * smoothstep(t2 + 0.04, t2 - 0.04, luma);",
          "  let h3 = aa_hatch_stripe(coord3, duty3) * smoothstep(t3 + 0.03, t3 - 0.03, luma);",
          "  let ink_coverage = clamp(max(h1, max(h2 * 0.92, h3 * 0.88)), 0.0, 1.0);",
        ].join("\n"),
      };
    case "murim-brush-hatch":
      return {
        styleIndex: 1,
        activeTierCount: 3,
        evalSnippet: [
          "  let brush_swell = 0.84 + 0.28 * sin(dot(uv, u1) * freq * 0.35 + f32(u_hatch.style_and_flags.z));",
          "  let duty1 = clamp((0.20 + 0.38 * (1.0 - luma)) * brush_swell, 0.14, 0.64);",
          "  let duty2 = clamp((0.16 + 0.32 * (1.0 - luma)) * brush_swell, 0.12, 0.54);",
          "  let duty3 = clamp((0.15 + 0.28 * (1.0 - luma)) * brush_swell, 0.10, 0.48);",
          "  let h1 = aa_hatch_stripe(coord1, duty1) * smoothstep(t1 + 0.05, t1 - 0.04, luma);",
          "  let h2 = aa_hatch_stripe(coord2, duty2) * smoothstep(t2 + 0.04, t2 - 0.04, luma);",
          "  let h3 = aa_hatch_stripe(coord3, duty3) * smoothstep(t3 + 0.04, t3 - 0.03, luma);",
          "  let ink_coverage = clamp(max(h1, max(h2 * 0.95, h3 * 0.90)), 0.0, 1.0);",
        ].join("\n"),
      };
    case "noir-parallel-engraving":
      return {
        styleIndex: 2,
        activeTierCount: 1,
        evalSnippet: [
          "  let duty1 = clamp(0.14 + 0.62 * (1.0 - luma), 0.10, 0.82);",
          "  let h1 = aa_hatch_stripe(coord1, duty1) * smoothstep(t1 + 0.03, t1 - 0.03, luma);",
          "  let h2 = 0.0;",
          "  let h3 = 0.0;",
          "  let ink_coverage = clamp(h1 + h2 + h3, 0.0, 1.0);",
        ].join("\n"),
      };
    case "stipple-fine-liner":
      return {
        styleIndex: 3,
        activeTierCount: 3,
        evalSnippet: [
          "  let dash1 = aa_hatch_stripe(dot(uv, u1) * freq * 0.45, 0.62);",
          "  let dash2 = aa_hatch_stripe(dot(uv, t2_dir) * freq * 0.48, 0.56);",
          "  let dash3 = aa_hatch_stripe(dot(uv, t3_dir) * freq * 0.52, 0.50);",
          "  let duty1 = clamp(0.12 + 0.22 * (1.0 - luma), 0.10, 0.38);",
          "  let h1 = aa_hatch_stripe(coord1, duty1) * dash1 * smoothstep(t1 + 0.03, t1 - 0.03, luma);",
          "  let h2 = aa_hatch_stripe(coord2, duty1 * 0.92) * dash2 * smoothstep(t2 + 0.03, t2 - 0.03, luma);",
          "  let h3 = aa_hatch_stripe(coord3, duty1 * 0.86) * dash3 * smoothstep(t3 + 0.03, t3 - 0.03, luma);",
          "  let ink_coverage = clamp(max(h1, max(h2, h3)), 0.0, 1.0);",
        ].join("\n"),
      };
  }
}

/**
 * 선택한 만화 해칭 스타일에 맞는 WebGPU WGSL 주곡률 크로스해칭 안티앨리어싱 셰이더를 생성한다.
 */
export function buildCrossHatchingToneWgsl(styleId: HatchStyleId): CrossHatchToneWgslArtifact {
  const cfg = getStyleWgslConfig(styleId);
  const bindings: readonly CrossHatchWgslBindingDescriptor[] = [
    { group: 0, binding: 0, name: "u_hatch", addressSpace: "uniform" },
    { group: 0, binding: 1, name: "b_curvature_field", addressSpace: "storage-read" },
    { group: 0, binding: 2, name: "b_stroke_seeds", addressSpace: "storage-read" },
    { group: 0, binding: 3, name: "b_tone_metrics_out", addressSpace: "storage-read-write" },
  ];

  const wgsl = `// Wave 124 Curvature-Aligned Cross-Hatching Tone WGSL (${styleId}, style_idx=${cfg.styleIndex})
// Uniform layout: 4 x 16B = 64 bytes (16-byte aligned)
struct CrossHatchUniforms {
  canvas_and_scale: vec4<f32>,
  light_and_ambient: vec4<f32>,
  tier_thresholds: vec4<f32>,
  style_and_flags: vec4<u32>,
};

struct CurvatureCell {
  normal_and_mask: vec4<f32>,
  tangent_and_curv: vec4<f32>,
};

struct HatchSeedInput {
  xy_luma_tier: vec4<f32>,
};

struct ToneMetricOutput {
  luma_tiers_ink: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u_hatch: CrossHatchUniforms;
@group(0) @binding(1) var<storage, read> b_curvature_field: array<CurvatureCell>;
@group(0) @binding(2) var<storage, read> b_stroke_seeds: array<HatchSeedInput>;
@group(0) @binding(3) var<storage, read_write> b_tone_metrics_out: array<ToneMetricOutput>;

fn rotate_tangent_2d(v: vec2<f32>, angle_rad: f32) -> vec2<f32> {
  let c = cos(angle_rad);
  let s = sin(angle_rad);
  return normalize(vec2<f32>(v.x * c - v.y * s, v.x * s + v.y * c));
}

fn aa_hatch_stripe(coord: f32, duty: f32) -> f32 {
  let fw = max(fwidth(coord), 1e-4);
  let dist = abs(fract(coord) - 0.5);
  let half_width = clamp(duty * 0.5, 0.02, 0.48);
  return 1.0 - smoothstep(half_width - fw * 0.75, half_width + fw * 0.75, dist);
}

fn sample_curvature_cell(px: u32, py: u32) -> CurvatureCell {
  let w = max(1u, u32(u_hatch.canvas_and_scale.x));
  let h = max(1u, u32(u_hatch.canvas_and_scale.y));
  let cx = min(px, w - 1u);
  let cy = min(py, h - 1u);
  let idx = min(cy * w + cx, arrayLength(&b_curvature_field) - 1u);
  return b_curvature_field[idx];
}

@compute @workgroup_size(64)
fn cs_curvature_hatch_metrics(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= arrayLength(&b_stroke_seeds) || idx >= arrayLength(&b_tone_metrics_out)) {
    return;
  }
  let seed = b_stroke_seeds[idx].xy_luma_tier;
  let cell = sample_curvature_cell(u32(max(seed.x, 0.0)), u32(max(seed.y, 0.0)));
  let mask = step(0.5, cell.normal_and_mask.w);
  let n_vec = normalize(cell.normal_and_mask.xyz);
  let l_vec = normalize(u_hatch.light_and_ambient.xyz);
  let luma = clamp(dot(n_vec, l_vec), 0.0, 1.0);

  let tier1_active = select(0.0, 1.0, luma <= u_hatch.tier_thresholds.x);
  let tier2_active = select(0.0, 1.0, (${cfg.activeTierCount}u >= 3u) && (luma <= u_hatch.tier_thresholds.y));
  let tier3_active = select(0.0, 1.0, (${cfg.activeTierCount}u >= 3u) && (luma <= u_hatch.tier_thresholds.z));
  let active_sum = (tier1_active + tier2_active + tier3_active) * mask;
  b_tone_metrics_out[idx].luma_tiers_ink = vec4<f32>(luma, active_sum, cell.tangent_and_curv.z, mask);
}

@fragment
fn fs_cross_hatching_aa(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let px = u32(max(frag_coord.x, 0.0));
  let py = u32(max(frag_coord.y, 0.0));
  let cell = sample_curvature_cell(px, py);
  let mask = step(0.5, cell.normal_and_mask.w);

  let n_vec = normalize(cell.normal_and_mask.xyz);
  let l_vec = normalize(u_hatch.light_and_ambient.xyz);
  let luma = clamp(dot(n_vec, l_vec), 0.0, 1.0);
  let highlight_gate = 1.0 - step(0.82, luma);

  let u1 = normalize(cell.tangent_and_curv.xy);
  let cross_angle = u_hatch.tier_thresholds.w;
  let t2_dir = rotate_tangent_2d(u1, cross_angle);
  let t3_dir = rotate_tangent_2d(u1, -cross_angle);

  let uv = frag_coord.xy / max(u_hatch.canvas_and_scale.xy, vec2<f32>(1.0, 1.0));
  let freq = max(u_hatch.canvas_and_scale.z, 1.0);
  let coord1 = dot(uv, vec2<f32>(-u1.y, u1.x)) * freq;
  let coord2 = dot(uv, vec2<f32>(-t2_dir.y, t2_dir.x)) * freq;
  let coord3 = dot(uv, vec2<f32>(-t3_dir.y, t3_dir.x)) * freq;

  let t1 = u_hatch.tier_thresholds.x;
  let t2 = u_hatch.tier_thresholds.y;
  let t3 = u_hatch.tier_thresholds.z;

${cfg.evalSnippet}

  let final_ink = ink_coverage * mask * highlight_gate;
  let tone = clamp(1.0 - final_ink * 0.92, 0.04, 0.99);
  return vec4<f32>(tone, tone, tone, mask);
}
`;

  return {
    styleId,
    wgsl,
    uniformBufferByteLength: 64,
    bindings,
    entryPoints: ["cs_curvature_hatch_metrics", "fs_cross_hatching_aa"],
    activeTierCount: cfg.activeTierCount,
  };
}

const FORBIDDEN_GLSL_PATTERNS: readonly { readonly label: string; readonly regex: RegExp }[] = [
  { label: "gl_FragCoord", regex: /\bgl_FragCoord\b/ },
  { label: "gl_FragColor", regex: /\bgl_FragColor\b/ },
  { label: "gl_Position", regex: /\bgl_Position\b/ },
  { label: "GLSL vec2/3/4 생성자", regex: /\bvec[234]\s*\(/ },
  { label: "GLSL sampler2D", regex: /\bsampler2D\b/ },
  { label: "GLSL texture2D", regex: /\btexture2D\s*\(/ },
  { label: "GLSL dFdx/dFdy", regex: /\bdFd[xy]\s*\(/ },
  { label: "GLSL uniform 선언", regex: /(^|\n)\s*uniform\s+\w+/ },
  { label: "GLSL varying/attribute", regex: /\b(varying|attribute)\b/ },
];

/**
 * 생성된 Wave 124 주곡률 크로스해칭 WGSL 셰이더의 구조·바인딩·64B 정렬·괄호·GLSL 금지어를 검증한다.
 */
export function validateCrossHatchingToneWgsl(
  artifact: CrossHatchToneWgslArtifact,
): CrossHatchWgslValidationReport {
  const errors: string[] = [];
  const src = artifact.wgsl;

  if (src.trim().length === 0) {
    errors.push("WGSL 셰이더 본문이 비어 있습니다.");
  }
  if (
    artifact.uniformBufferByteLength !== 64 ||
    artifact.uniformBufferByteLength % 16 !== 0
  ) {
    errors.push("유니폼 구조체 바이트 크기는 16바이트 정렬된 64바이트여야 합니다.");
  }
  if (src.includes("NaN") || src.includes("Infinity") || src.includes("undefined")) {
    errors.push("WGSL 본문에 비정상 리터럴(NaN/Infinity/undefined)이 포함되었습니다.");
  }
  if (!src.includes("struct CrossHatchUniforms") || !src.includes("struct CurvatureCell")) {
    errors.push("필수 WGSL 구조체(CrossHatchUniforms 또는 CurvatureCell)가 누락되었습니다.");
  }
  for (let b = 0; b < 4; b += 1) {
    if (!src.includes(`@group(0) @binding(${b})`)) {
      errors.push(`필수 바인딩 @group(0) @binding(${b}) 선언이 누락되었습니다.`);
    }
  }
  if (!src.includes("@compute @workgroup_size(64)")) {
    errors.push("컴퓨트 셰이더 워크그룹(@compute @workgroup_size(64)) 선언이 누락되었습니다.");
  }
  if (!src.includes("@fragment")) {
    errors.push("프래그먼트 셰이더(@fragment) 선언이 누락되었습니다.");
  }
  if (!src.includes("fwidth(")) {
    errors.push("fwidth 안티앨리어싱 호출이 누락되었습니다.");
  }
  for (const ep of artifact.entryPoints) {
    if (!src.includes(`fn ${ep}`)) {
      errors.push(`선언된 엔트리포인트(${ep})가 본문에 없습니다.`);
    }
  }

  for (let i = 0; i < FORBIDDEN_GLSL_PATTERNS.length; i += 1) {
    const rule = FORBIDDEN_GLSL_PATTERNS[i];
    if (rule.regex.test(src)) {
      errors.push(`GLSL 금지 구문(${rule.label})이 감지되었습니다.`);
    }
  }

  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "{") braceDepth += 1;
    else if (ch === "}") braceDepth -= 1;
    else if (ch === "(") parenDepth += 1;
    else if (ch === ")") parenDepth -= 1;
    else if (ch === "[") bracketDepth += 1;
    else if (ch === "]") bracketDepth -= 1;
    if (braceDepth < 0 || parenDepth < 0 || bracketDepth < 0) {
      errors.push("WGSL 괄호 짝이 어긋났습니다.");
      break;
    }
  }
  if (braceDepth !== 0) errors.push("WGSL 중괄호가 닫히지 않았습니다.");
  if (parenDepth !== 0) errors.push("WGSL 소괄호가 닫히지 않았습니다.");
  if (bracketDepth !== 0) errors.push("WGSL 대괄호가 닫히지 않았습니다.");

  return {
    valid: errors.length === 0,
    errors,
    lineCount: src.split("\n").length,
  };
}
