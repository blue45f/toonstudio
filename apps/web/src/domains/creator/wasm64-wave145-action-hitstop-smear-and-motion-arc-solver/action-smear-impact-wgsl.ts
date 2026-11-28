/**
 * Wave 145 — WebGPU WGSL 방향성 모션 스미어 & 임팩트 프레임 흑백 반전 셰이더 생성기 및 검증기.
 *
 * - 16바이트 정렬 64바이트 유니폼 구조체(`ActionSmearImpactUniforms`)
 * - 호 접선 방향 다중 탭 모션 스미어 블러 + 임팩트 임계치 흑백 반전
 * - `prefers_reduced_motion` 분기를 통한 카메라 셰이크·고대비 스트로브 안전 차단
 * - 구조, 바인딩, 16B 정렬, 괄호 균형, GLSL 금지어 정밀 검증
 */

export type ActionSmearWgslTier =
  | "light-jab"
  | "heavy-slash"
  | "finisher-critical"
  | "parry-clang";

export interface ActionSmearWgslBindingDescriptor {
  readonly group: number;
  readonly binding: number;
  readonly name: string;
  readonly addressSpace: "uniform" | "storage-read" | "storage-read-write";
}

export interface ActionSmearImpactWgslOptions {
  readonly tier?: ActionSmearWgslTier;
  readonly smearTapCount?: number;
}

export interface ActionSmearImpactWgslArtifact {
  readonly tier: ActionSmearWgslTier;
  readonly smearTapCount: number;
  readonly wgsl: string;
  readonly uniformBufferByteLength: number;
  readonly bindings: readonly ActionSmearWgslBindingDescriptor[];
  readonly entryPoints: readonly string[];
  readonly supportsReducedMotionBranch: boolean;
}

export interface ActionSmearWgslValidationReport {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly lineCount: number;
}

interface TierWgslPreset {
  readonly tierIndex: number;
  readonly defaultTapCount: number;
  readonly defaultContrastGain: string;
}

function getTierWgslPreset(tier: ActionSmearWgslTier): TierWgslPreset {
  switch (tier) {
    case "light-jab":
      return { tierIndex: 0, defaultTapCount: 6, defaultContrastGain: "1.18" };
    case "parry-clang":
      return { tierIndex: 1, defaultTapCount: 8, defaultContrastGain: "1.35" };
    case "heavy-slash":
      return { tierIndex: 2, defaultTapCount: 10, defaultContrastGain: "1.52" };
    case "finisher-critical":
      return { tierIndex: 3, defaultTapCount: 12, defaultContrastGain: "1.75" };
  }
}

/**
 * 호 접선 방향 다중 탭 모션 스미어 블러와 임팩트 프레임 흑백 반전(`prefers_reduced_motion` 분기 포함)
 * WebGPU WGSL 셰이더를 생성한다.
 */
export function buildActionSmearImpactWgsl(
  options: ActionSmearImpactWgslOptions = {},
): ActionSmearImpactWgslArtifact {
  const tier: ActionSmearWgslTier = options.tier ?? "heavy-slash";
  const preset = getTierWgslPreset(tier);
  const rawTapCount = options.smearTapCount ?? preset.defaultTapCount;
  const smearTapCount = Math.max(
    4,
    Math.min(16, Math.round(Number.isFinite(rawTapCount) ? rawTapCount : preset.defaultTapCount)),
  );

  const bindings: readonly ActionSmearWgslBindingDescriptor[] = [
    { group: 0, binding: 0, name: "u_action", addressSpace: "uniform" },
    { group: 0, binding: 1, name: "b_source_frame", addressSpace: "storage-read" },
    { group: 0, binding: 2, name: "b_arc_motion_field", addressSpace: "storage-read" },
    { group: 0, binding: 3, name: "b_impact_out", addressSpace: "storage-read-write" },
  ];

  const wgsl = `// Wave 145 Action Directional Smear & Impact Frame WGSL (${tier}, tier_idx=${preset.tierIndex}, taps=${smearTapCount})
// Uniform layout: 4 x 16B = 64 bytes (16-byte aligned)
struct ActionSmearImpactUniforms {
  viewport_and_smear: vec4<f32>,
  tangent_and_impact: vec4<f32>,
  shake_and_decay: vec4<f32>,
  flags_and_tier: vec4<u32>,
};

struct MotionFieldCell {
  tangent_speed_mask: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u_action: ActionSmearImpactUniforms;
@group(0) @binding(1) var<storage, read> b_source_frame: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> b_arc_motion_field: array<MotionFieldCell>;
@group(0) @binding(3) var<storage, read_write> b_impact_out: array<vec4<f32>>;

fn clamp_pixel_index(px: i32, py: i32, width: i32, height: i32) -> u32 {
  let cx = clamp(px, 0, max(0, width - 1));
  let cy = clamp(py, 0, max(0, height - 1));
  let max_idx = max(1u, arrayLength(&b_source_frame)) - 1u;
  return min(u32(cy * max(1, width) + cx), max_idx);
}

fn sample_directional_smear(
  base_coord: vec2<f32>,
  tangent_dir: vec2<f32>,
  smear_px: f32,
  decay_rate: f32,
  width: i32,
  height: i32
) -> vec4<f32> {
  var accum = vec4<f32>(0.0, 0.0, 0.0, 0.0);
  var weight_sum = 0.0;
  let tap_count = ${smearTapCount}i;
  let inv_taps = 1.0 / f32(max(1i, tap_count - 1i));

  for (var tap = 0i; tap < tap_count; tap = tap + 1i) {
    let frac = f32(tap) * inv_taps;
    let offset = tangent_dir * (-smear_px * frac);
    let sample_pos = base_coord + offset;
    let idx = clamp_pixel_index(i32(round(sample_pos.x)), i32(round(sample_pos.y)), width, height);
    let w = exp(-decay_rate * frac * 2.2);
    accum = accum + b_source_frame[idx] * w;
    weight_sum = weight_sum + w;
  }

  return accum / max(weight_sum, 1e-4);
}

fn apply_impact_monochrome_invert(
  color: vec4<f32>,
  threshold: f32,
  flash_alpha: f32,
  invert_active: bool,
  prefers_reduced_motion: bool
) -> vec4<f32> {
  if (prefers_reduced_motion || !invert_active || flash_alpha <= 0.001) {
    return color;
  }
  let luma = dot(color.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
  let ink_mask = step(threshold, luma);
  let inverted = vec3<f32>(1.0 - ink_mask, 1.0 - ink_mask, 1.0 - ink_mask);
  let contrasted = clamp(mix(color.rgb, inverted, clamp(flash_alpha * ${preset.defaultContrastGain}, 0.0, 1.0)), vec3<f32>(0.0), vec3<f32>(1.0));
  return vec4<f32>(contrasted, color.a);
}

@compute @workgroup_size(64)
fn cs_action_smear_impact_pass(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let width = max(1i, i32(u_action.viewport_and_smear.x));
  let height = max(1i, i32(u_action.viewport_and_smear.y));
  let total_pixels = u32(width * height);
  if (idx >= total_pixels || idx >= arrayLength(&b_impact_out)) {
    return;
  }

  let prefers_reduced_motion = u_action.flags_and_tier.x != 0u;
  let invert_active = u_action.flags_and_tier.y != 0u;
  let px = i32(idx % u32(width));
  let py = i32(idx / u32(width));

  let shake_offset = select(u_action.shake_and_decay.xy, vec2<f32>(0.0, 0.0), prefers_reduced_motion);
  let base_coord = vec2<f32>(f32(px), f32(py)) + shake_offset;

  let field_idx = min(idx, max(1u, arrayLength(&b_arc_motion_field)) - 1u);
  let cell = b_arc_motion_field[field_idx].tangent_speed_mask;
  let fallback_dir = normalize(u_action.tangent_and_impact.xy + vec2<f32>(1e-5, 0.0));
  let local_len = length(cell.xy);
  let tangent_dir = select(fallback_dir, cell.xy / max(local_len, 1e-5), local_len > 1e-4);

  let smear_scale = select(u_action.viewport_and_smear.z * cell.z, u_action.viewport_and_smear.z * 0.35 * cell.z, prefers_reduced_motion);
  let smeared = sample_directional_smear(
    base_coord,
    tangent_dir,
    max(0.0, smear_scale),
    max(0.1, u_action.shake_and_decay.w),
    width,
    height
  );

  let final_rgba = apply_impact_monochrome_invert(
    smeared,
    clamp(u_action.tangent_and_impact.z, 0.1, 0.9),
    clamp(u_action.tangent_and_impact.w, 0.0, 1.0),
    invert_active,
    prefers_reduced_motion
  );
  b_impact_out[idx] = final_rgba;
}

@fragment
fn fs_action_smear_impact_preview(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let width = max(1i, i32(u_action.viewport_and_smear.x));
  let height = max(1i, i32(u_action.viewport_and_smear.y));
  let prefers_reduced_motion = u_action.flags_and_tier.x != 0u;
  let invert_active = u_action.flags_and_tier.y != 0u;
  let shake_offset = select(u_action.shake_and_decay.xy, vec2<f32>(0.0, 0.0), prefers_reduced_motion);
  let tangent_dir = normalize(u_action.tangent_and_impact.xy + vec2<f32>(1e-5, 0.0));
  let smeared = sample_directional_smear(
    frag_coord.xy + shake_offset,
    tangent_dir,
    max(0.0, u_action.viewport_and_smear.z),
    max(0.1, u_action.shake_and_decay.w),
    width,
    height
  );
  return apply_impact_monochrome_invert(
    smeared,
    clamp(u_action.tangent_and_impact.z, 0.1, 0.9),
    clamp(u_action.tangent_and_impact.w, 0.0, 1.0),
    invert_active,
    prefers_reduced_motion
  );
}
`;

  return {
    tier,
    smearTapCount,
    wgsl,
    uniformBufferByteLength: 64,
    bindings,
    entryPoints: ["cs_action_smear_impact_pass", "fs_action_smear_impact_preview"],
    supportsReducedMotionBranch: true,
  };
}

const FORBIDDEN_GLSL_RULES: readonly { readonly label: string; readonly regex: RegExp }[] = [
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
 * 생성된 Wave 145 액션 스미어·임팩트 WGSL 셰이더의 구조·바인딩·16B 정렬·괄호 균형·GLSL 금지어를 검증한다.
 */
export function validateActionSmearImpactWgsl(
  artifact: ActionSmearImpactWgslArtifact,
): ActionSmearWgslValidationReport {
  const errors: string[] = [];
  const src = artifact.wgsl;

  if (src.trim().length === 0) {
    errors.push("WGSL 셰이더 본문이 비어 있습니다.");
  }
  if (
    artifact.uniformBufferByteLength !== 64 ||
    artifact.uniformBufferByteLength % 16 !== 0
  ) {
    errors.push("유니폼 버퍼 크기는 16바이트 정렬된 64바이트여야 합니다.");
  }
  if (src.includes("NaN") || src.includes("Infinity") || src.includes("undefined")) {
    errors.push("WGSL 본문에 비정상 수치 리터럴(NaN/Infinity/undefined)이 포함되었습니다.");
  }
  if (!src.includes("struct ActionSmearImpactUniforms") || !src.includes("struct MotionFieldCell")) {
    errors.push("필수 WGSL 구조체(ActionSmearImpactUniforms 또는 MotionFieldCell)가 누락되었습니다.");
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
  if (!src.includes("prefers_reduced_motion")) {
    errors.push("저모션 안전 분기(prefers_reduced_motion)가 누락되었습니다.");
  }
  if (!src.includes("sample_directional_smear") || !src.includes("apply_impact_monochrome_invert")) {
    errors.push("방향성 스미어 또는 흑백 임팩트 반전 함수가 누락되었습니다.");
  }

  for (let i = 0; i < artifact.entryPoints.length; i += 1) {
    const ep = artifact.entryPoints[i];
    if (ep && !src.includes(`fn ${ep}`)) {
      errors.push(`선언된 엔트리포인트(${ep})가 WGSL 본문에 없습니다.`);
    }
  }

  for (let i = 0; i < FORBIDDEN_GLSL_RULES.length; i += 1) {
    const rule = FORBIDDEN_GLSL_RULES[i];
    if (rule && rule.regex.test(src)) {
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
