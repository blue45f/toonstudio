/**
 * Wave 105 — 액션 집중선 클리핑·검기 임팩트 합성 WebGPU WGSL 셰이더 생성기 및 검증기.
 */

import type { SpeedlineFieldMode } from "./focal-safe-speedline-generator";

export interface ActionFxWgslBindingDescriptor {
  readonly group: number;
  readonly binding: number;
  readonly name: string;
  readonly addressSpace: "uniform" | "storage-read" | "storage-read-write";
}

export interface ActionImpactFxWgslArtifact {
  readonly mode: SpeedlineFieldMode;
  readonly wgsl: string;
  readonly uniformBufferByteLength: number;
  readonly bindings: readonly ActionFxWgslBindingDescriptor[];
  readonly entryPoints: readonly string[];
  readonly prefersReducedMotion: boolean;
}

export interface ActionFxWgslValidationReport {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly lineCount: number;
}

function buildModeEvalWgslSnippet(mode: SpeedlineFieldMode): string {
  switch (mode) {
    case "radial-focus-burst":
      return [
        "  let ray_dir = vec2<f32>(cos(ray_in.angle_and_width.x), sin(ray_in.angle_and_width.x));",
        "  let origin = u_fx.focal_and_dir.xy;",
      ].join("\n");
    case "directional-motion-blur":
      return [
        "  let dir_rad = u_fx.focal_and_dir.z;",
        "  let ray_dir = vec2<f32>(cos(dir_rad), sin(dir_rad));",
        "  let perp_dir = vec2<f32>(-ray_dir.y, ray_dir.x);",
        "  let origin = u_fx.focal_and_dir.xy + perp_dir * ray_in.angle_and_width.z;",
      ].join("\n");
    case "curved-vortex-rush":
      return [
        "  let swirl = u_fx.fx_params.z;",
        "  let eff_angle = ray_in.angle_and_width.x + swirl * (1.0 - ray_in.angle_and_width.w);",
        "  let ray_dir = vec2<f32>(cos(eff_angle), sin(eff_angle));",
        "  let origin = u_fx.focal_and_dir.xy;",
      ].join("\n");
    case "impact-flash-beta":
      return [
        "  let spike_phase = select(0.76, 1.0, (idx % 2u) == 0u);",
        "  let ray_dir = vec2<f32>(cos(ray_in.angle_and_width.x), sin(ray_in.angle_and_width.x)) * spike_phase;",
        "  let origin = u_fx.focal_and_dir.xy;",
      ].join("\n");
  }
}

/**
 * 선택한 액션 VFX 필드에 맞는 WebGPU WGSL 집중선 클리핑·임팩트 합성 셰이더를 생성한다.
 */
export function buildActionImpactFxWgsl(
  mode: SpeedlineFieldMode,
  options: { readonly prefersReducedMotion?: boolean } = {},
): ActionImpactFxWgslArtifact {
  const prefersReducedMotion = Boolean(options.prefersReducedMotion);
  const modeSnippet = buildModeEvalWgslSnippet(mode);
  const shimmerMultiplier = prefersReducedMotion ? "0.0" : "1.0";
  const maxContrastLiteral = prefersReducedMotion ? "0.35" : "1.0";
  const bindings: readonly ActionFxWgslBindingDescriptor[] = [
    { group: 0, binding: 0, name: "u_fx", addressSpace: "uniform" },
    { group: 0, binding: 1, name: "b_balloons", addressSpace: "storage-read" },
    { group: 0, binding: 2, name: "b_rays_in", addressSpace: "storage-read" },
    { group: 0, binding: 3, name: "b_polys_out", addressSpace: "storage-read-write" },
  ];

  const wgsl = `// Wave 105 Action Speedline & Sword-Slash Impact VFX WGSL Kernel (${mode})
struct ActionFxUniforms {
  panel_rect: vec4<f32>,
  focal_and_dir: vec4<f32>,
  safe_ellipse: vec4<f32>,
  fx_params: vec4<f32>,
  motion_safety_and_slash: vec4<f32>,
  ink_linear_rgba: vec4<f32>,
  accent_linear_rgba: vec4<f32>,
  counts_and_seed: vec4<u32>,
};

struct BalloonKeepOutRect {
  min_max_xy: vec4<f32>,
};

struct SpeedlineRayInput {
  angle_and_width: vec4<f32>,
};

struct SpeedlineVertexOutput {
  tip_xy_base_xy: vec4<f32>,
  width_opacity_valid: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u_fx: ActionFxUniforms;
@group(0) @binding(1) var<storage, read> b_balloons: array<BalloonKeepOutRect>;
@group(0) @binding(2) var<storage, read> b_rays_in: array<SpeedlineRayInput>;
@group(0) @binding(3) var<storage, read_write> b_polys_out: array<SpeedlineVertexOutput>;

fn intersect_ray_ellipse_2d(origin: vec2<f32>, dir: vec2<f32>, ellipse: vec4<f32>, pad: f32) -> vec2<f32> {
  let rx = max(ellipse.z + pad, 1.0);
  let ry = max(ellipse.w + pad, 1.0);
  let o = (origin - ellipse.xy) / vec2<f32>(rx, ry);
  let d = dir / vec2<f32>(rx, ry);
  let a = max(dot(d, d), 1e-8);
  let b = 2.0 * dot(o, d);
  let c = dot(o, o) - 1.0;
  let disc = b * b - 4.0 * a * c;
  if (disc < 0.0) { return vec2<f32>(1e9, -1e9); }
  let r = sqrt(disc);
  return vec2<f32>((-b - r) / (2.0 * a), (-b + r) / (2.0 * a));
}

fn intersect_ray_aabb_2d(origin: vec2<f32>, dir: vec2<f32>, bounds: vec4<f32>) -> vec2<f32> {
  let safe_dx = select(dir.x, 1e-6, abs(dir.x) < 1e-6);
  let safe_dy = select(dir.y, 1e-6, abs(dir.y) < 1e-6);
  let tx1 = (bounds.x - origin.x) / safe_dx;
  let tx2 = (bounds.z - origin.x) / safe_dx;
  let ty1 = (bounds.y - origin.y) / safe_dy;
  let ty2 = (bounds.w - origin.y) / safe_dy;
  let tmin = max(min(tx1, tx2), min(ty1, ty2));
  let tmax = min(max(tx1, tx2), max(ty1, ty2));
  return vec2<f32>(tmin, tmax);
}

@compute @workgroup_size(64)
fn cs_carve_action_speedlines(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= arrayLength(&b_rays_in)) { return; }
  let ray_in = b_rays_in[idx];
${modeSnippet}
  let dir_unit = normalize(ray_dir);
  let panel_bounds = vec4<f32>(
    u_fx.panel_rect.x,
    u_fx.panel_rect.y,
    u_fx.panel_rect.x + u_fx.panel_rect.z,
    u_fx.panel_rect.y + u_fx.panel_rect.w
  );
  let panel_hit = intersect_ray_aabb_2d(origin, dir_unit, panel_bounds);
  let pad = ray_in.angle_and_width.y * 0.5 + 1.35;
  let ell_hit = intersect_ray_ellipse_2d(origin, dir_unit, u_fx.safe_ellipse, pad);
  var t_inner = max(max(0.0, panel_hit.x), ell_hit.y);
  var t_outer = panel_hit.y;

  let b_count = min(u_fx.counts_and_seed.x, arrayLength(&b_balloons));
  for (var i: u32 = 0u; i < b_count; i = i + 1u) {
    let b = b_balloons[i].min_max_xy + vec4<f32>(-pad, -pad, pad, pad);
    let b_hit = intersect_ray_aabb_2d(origin, dir_unit, b);
    if (b_hit.y > t_inner && b_hit.x < t_outer) {
      t_outer = min(t_outer, max(t_inner, b_hit.x));
    }
  }

  let valid = select(0.0, 1.0, (t_outer - t_inner) >= 12.0);
  let tip_pt = origin + dir_unit * t_inner;
  let base_pt = origin + dir_unit * t_outer;
  b_polys_out[idx].tip_xy_base_xy = vec4<f32>(tip_pt.x, tip_pt.y, base_pt.x, base_pt.y);
  b_polys_out[idx].width_opacity_valid = vec4<f32>(ray_in.angle_and_width.y, 1.0, valid, 0.0);
}

@fragment
fn fs_action_impact_composite(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let rel = frag_coord.xy - u_fx.focal_and_dir.xy;
  let dist = length(rel);
  let shimmer_rate = u_fx.motion_safety_and_slash.x * ${shimmerMultiplier};
  let contrast_cap = min(u_fx.motion_safety_and_slash.y, ${maxContrastLiteral});
  let ring_wave = smoothstep(3.5, 0.0, abs(dist - u_fx.motion_safety_and_slash.z));
  let pulse = 0.85 + 0.15 * sin(shimmer_rate * u_fx.fx_params.w);
  let alpha = clamp(ring_wave * contrast_cap * pulse, 0.0, 0.92);
  let rgb = mix(u_fx.ink_linear_rgba.rgb, u_fx.accent_linear_rgba.rgb, ring_wave);
  return vec4<f32>(rgb, alpha);
}
`;

  return {
    mode,
    wgsl,
    uniformBufferByteLength: 128,
    bindings,
    entryPoints: ["cs_carve_action_speedlines", "fs_action_impact_composite"],
    prefersReducedMotion,
  };
}

/**
 * 생성된 Wave 105 액션 VFX WGSL 셰이더의 구조, 정렬, 바인딩, 괄호 균형을 검증한다.
 */
export function validateActionImpactFxWgsl(
  artifact: ActionImpactFxWgslArtifact,
): ActionFxWgslValidationReport {
  const errors: string[] = [];
  const src = artifact.wgsl;

  if (src.trim().length === 0) errors.push("WGSL 셰이더 코드가 비어 있습니다.");
  if (artifact.uniformBufferByteLength <= 0 || artifact.uniformBufferByteLength % 16 !== 0) {
    errors.push("유니폼 버퍼 바이트 크기는 16바이트 배수여야 합니다.");
  }
  if (src.includes("NaN") || src.includes("undefined") || src.includes("Infinity")) {
    errors.push("WGSL 본문에 유효하지 않은 수치 리터럴(NaN/undefined/Infinity)이 포함되었습니다.");
  }
  if (!src.includes("struct ActionFxUniforms") || !src.includes("struct BalloonKeepOutRect")) {
    errors.push("필수 WGSL 구조체(ActionFxUniforms 또는 BalloonKeepOutRect)가 누락되었습니다.");
  }
  for (let b = 0; b < 4; b += 1) {
    if (!src.includes(`@group(0) @binding(${b})`)) {
      errors.push(`필수 바인딩 @group(0) @binding(${b}) 선언이 누락되었습니다.`);
    }
  }
  if (!src.includes("@compute @workgroup_size(64)")) {
    errors.push("컴퓨트 셰이더 워크그룹 선언이 누락되었습니다.");
  }
  if (!src.includes("@fragment")) {
    errors.push("프래그먼트 합성 셰이더 선언이 누락되었습니다.");
  }
  for (const ep of artifact.entryPoints) {
    if (!src.includes(`fn ${ep}`)) {
      errors.push(`선언된 엔트리포인트(${ep})가 셰이더 본문에 없습니다.`);
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
      errors.push("WGSL 괄호 짝이 맞지 않습니다.");
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
