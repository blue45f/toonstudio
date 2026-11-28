/**
 * Wave 121 — 16바이트 정렬 WebGPU WGSL XPBD 천·머리카락 바람장 컴퓨트 솔버 생성기 및 검증기.
 */

import type { ClothHairPresetId } from "./xpbd-cloth-presets-and-types";

export interface XpbdWgslBindingDescriptor {
  readonly group: number;
  readonly binding: number;
  readonly name: string;
  readonly addressSpace: "uniform" | "storage-read" | "storage-read-write";
}

export interface XpbdClothHairWgslArtifact {
  readonly presetId: ClothHairPresetId;
  readonly wgsl: string;
  readonly uniformBufferByteLength: number;
  readonly workgroupSize: number;
  readonly bindings: readonly XpbdWgslBindingDescriptor[];
  readonly entryPoints: readonly string[];
  readonly prefersReducedMotion: boolean;
}

export interface XpbdWgslValidationReport {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly lineCount: number;
}

const FORBIDDEN_GLSL_PATTERNS: ReadonlyArray<{ readonly label: string; readonly pattern: RegExp }> = [
  { label: "#version", pattern: /#version\b/u },
  { label: "gl_Position/gl_GlobalInvocationID", pattern: /\bgl_[A-Za-z0-9_]+\b/u },
  { label: "GLSL layout(...)", pattern: /\blayout\s*\(/u },
  { label: "GLSL uniform 선언", pattern: /(?:^|\n)\s*uniform\s+[A-Za-z0-9_]+/u },
  { label: "GLSL sampler2D", pattern: /\bsampler2D\b/u },
  { label: "GLSL vec/mat 생성자", pattern: /\b(?:vec[234]|ivec[234]|uvec[234]|mat[234])\s*\(/u },
];

/**
 * 16바이트 정렬 유니폼·스토리지 버퍼 기반 WebGPU WGSL XPBD 천·머리카락 바람장 컴퓨트 셰이더를 생성한다.
 */
export function buildXpbdClothHairWgsl(
  presetId: ClothHairPresetId = "fantasy-flowing-cape",
  options: { readonly prefersReducedMotion?: boolean } = {},
): XpbdClothHairWgslArtifact {
  const prefersReducedMotion = Boolean(options.prefersReducedMotion);
  const gustScale = prefersReducedMotion ? "0.25" : "1.0";
  const bindings: readonly XpbdWgslBindingDescriptor[] = [
    { group: 0, binding: 0, name: "u_sim", addressSpace: "uniform" },
    { group: 0, binding: 1, name: "b_particles", addressSpace: "storage-read-write" },
    { group: 0, binding: 2, name: "b_constraints", addressSpace: "storage-read-write" },
    { group: 0, binding: 3, name: "b_colliders", addressSpace: "storage-read" },
  ];

  const wgsl = `// Wave 121 XPBD Cloth & Hair Wind-Field Freeze-Frame Pose Baker WGSL Kernel (${presetId})
struct XpbdClothUniforms {
  wind_and_gust: vec4<f32>,
  gravity_and_dt: vec4<f32>,
  damping_and_compliance: vec4<f32>,
  turbulence_and_bounds: vec4<f32>,
  counts: vec4<u32>,
  grid_and_flags: vec4<u32>,
};

struct XpbdParticleGpu {
  pos_inv_mass: vec4<f32>,
  prev_pos_z: vec4<f32>,
  vel_pad: vec4<f32>,
};

struct XpbdConstraintGpu {
  indices_kind: vec4<u32>,
  rest_comp_lambda: vec4<f32>,
};

struct BodyCapsuleColliderGpu {
  ab_xy: vec4<f32>,
  radius_friction_pad: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u_sim: XpbdClothUniforms;
@group(0) @binding(1) var<storage, read_write> b_particles: array<XpbdParticleGpu>;
@group(0) @binding(2) var<storage, read_write> b_constraints: array<XpbdConstraintGpu>;
@group(0) @binding(3) var<storage, read> b_colliders: array<BodyCapsuleColliderGpu>;

fn sample_wind_field_2d(pos: vec2<f32>, time_sec: f32) -> vec2<f32> {
  let base_wind = u_sim.wind_and_gust.xy;
  let speed = length(base_wind);
  let dir = select(vec2<f32>(1.0, 0.0), base_wind / max(speed, 1e-4), speed > 1e-4);
  let perp = vec2<f32>(-dir.y, dir.x);
  let phase = time_sec * u_sim.wind_and_gust.w * 6.2831853 + u_sim.turbulence_and_bounds.y;
  let gust = u_sim.wind_and_gust.z * ${gustScale} * (0.5 + 0.5 * sin(phase - dot(pos, dir) * 0.008));
  let turb_wave = sin(pos.y * 0.022 + pos.x * 0.011 - time_sec * 5.2 + u_sim.turbulence_and_bounds.y);
  let turb = u_sim.turbulence_and_bounds.x * ${gustScale};
  return base_wind + dir * gust + perp * (turb * 0.55 * turb_wave);
}

fn project_outside_capsule(pt: vec2<f32>, cap: BodyCapsuleColliderGpu) -> vec2<f32> {
  let a = cap.ab_xy.xy;
  let b = cap.ab_xy.zw;
  let ab = b - a;
  let ab_len_sq = dot(ab, ab);
  let t = select(0.0, clamp(dot(pt - a, ab) / max(ab_len_sq, 1e-6), 0.0, 1.0), ab_len_sq > 1e-6);
  let closest = a + ab * t;
  let delta = pt - closest;
  let dist = length(delta);
  let min_dist = cap.radius_friction_pad.x + 0.25;
  if (dist < min_dist) {
    let n = select(vec2<f32>(1.0, 0.0), delta / max(dist, 1e-6), dist > 1e-6);
    return closest + n * min_dist;
  }
  return pt;
}

@compute @workgroup_size(64)
fn cs_xpbd_predict_wind(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= u_sim.counts.x || idx >= arrayLength(&b_particles)) { return; }
  var p = b_particles[idx];
  let inv_mass = p.pos_inv_mass.w;
  p.prev_pos_z = vec4<f32>(p.pos_inv_mass.xy, p.pos_inv_mass.z, 0.0);
  if (inv_mass <= 0.0) {
    p.vel_pad = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    b_particles[idx] = p;
    return;
  }
  let sub_dt = max(u_sim.gravity_and_dt.z, 1e-4);
  let damp = exp(-u_sim.damping_and_compliance.x * sub_dt);
  let wind = sample_wind_field_2d(p.pos_inv_mass.xy, u_sim.gravity_and_dt.w);
  let drag_exp = exp(-3.5 * sub_dt);
  var vel = (wind + (p.vel_pad.xy - wind) * drag_exp + u_sim.gravity_and_dt.xy * sub_dt) * damp;
  let max_speed = max(u_sim.damping_and_compliance.w, 64.0);
  let spd = length(vel);
  if (spd > max_speed) {
    vel = vel * (max_speed / spd);
  }
  let next_pos = p.pos_inv_mass.xy + vel * sub_dt;
  p.pos_inv_mass = vec4<f32>(next_pos.x, next_pos.y, p.pos_inv_mass.z, inv_mass);
  p.vel_pad = vec4<f32>(vel.x, vel.y, p.vel_pad.z, 0.0);
  b_particles[idx] = p;
}

@compute @workgroup_size(64)
fn cs_xpbd_solve_distance_and_colliders(@builtin(global_invocation_id) gid: vec3<u32>) {
  let c_idx = gid.x;
  let sub_dt = max(u_sim.gravity_and_dt.z, 1e-4);
  let inv_dt_sq = 1.0 / (sub_dt * sub_dt);

  if (c_idx < u_sim.counts.y && c_idx < arrayLength(&b_constraints)) {
    var con = b_constraints[c_idx];
    let ia = con.indices_kind.x;
    let ib = con.indices_kind.y;
    if (ia < arrayLength(&b_particles) && ib < arrayLength(&b_particles)) {
      var pa = b_particles[ia];
      var pb = b_particles[ib];
      let w_sum = pa.pos_inv_mass.w + pb.pos_inv_mass.w;
      let delta = pb.pos_inv_mass.xy - pa.pos_inv_mass.xy;
      let dist = length(delta);
      if (w_sum > 0.0 && dist > 1e-6) {
        let alpha_tilde = con.rest_comp_lambda.y * inv_dt_sq;
        let err = dist - con.rest_comp_lambda.x;
        let d_lambda = (-err - alpha_tilde * con.rest_comp_lambda.z) / (w_sum + alpha_tilde);
        let n = delta / dist;
        if (pa.pos_inv_mass.w > 0.0) {
          pa.pos_inv_mass = vec4<f32>(pa.pos_inv_mass.xy - n * (pa.pos_inv_mass.w * d_lambda), pa.pos_inv_mass.z, pa.pos_inv_mass.w);
        }
        if (pb.pos_inv_mass.w > 0.0) {
          pb.pos_inv_mass = vec4<f32>(pb.pos_inv_mass.xy + n * (pb.pos_inv_mass.w * d_lambda), pb.pos_inv_mass.z, pb.pos_inv_mass.w);
        }
        con.rest_comp_lambda.z = con.rest_comp_lambda.z + d_lambda;
        b_particles[ia] = pa;
        b_particles[ib] = pb;
        b_constraints[c_idx] = con;
      }
    }
  }

  if (c_idx < u_sim.counts.x && c_idx < arrayLength(&b_particles)) {
    var p = b_particles[c_idx];
    if (p.pos_inv_mass.w > 0.0) {
      var pos = p.pos_inv_mass.xy;
      let col_count = min(u_sim.counts.w, arrayLength(&b_colliders));
      for (var k: u32 = 0u; k < col_count; k = k + 1u) {
        pos = project_outside_capsule(pos, b_colliders[k]);
      }
      p.pos_inv_mass = vec4<f32>(pos.x, pos.y, p.pos_inv_mass.z, p.pos_inv_mass.w);
      b_particles[c_idx] = p;
    }
  }
}

@compute @workgroup_size(64)
fn cs_xpbd_finalize_velocity(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= u_sim.counts.x || idx >= arrayLength(&b_particles)) { return; }
  var p = b_particles[idx];
  if (p.pos_inv_mass.w <= 0.0) {
    p.vel_pad = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    b_particles[idx] = p;
    return;
  }
  let sub_dt = max(u_sim.gravity_and_dt.z, 1e-4);
  let next_vel = (p.pos_inv_mass.xy - p.prev_pos_z.xy) / sub_dt;
  p.vel_pad = vec4<f32>(next_vel.x, next_vel.y, p.vel_pad.z, 0.0);
  b_particles[idx] = p;
}
`;

  return {
    presetId,
    wgsl,
    uniformBufferByteLength: 96,
    workgroupSize: 64,
    bindings,
    entryPoints: [
      "cs_xpbd_predict_wind",
      "cs_xpbd_solve_distance_and_colliders",
      "cs_xpbd_finalize_velocity",
    ],
    prefersReducedMotion,
  };
}

/**
 * 생성된 Wave 121 XPBD WGSL 셰이더의 16바이트 정렬, 바인딩, 구조체, 엔트리포인트, 괄호 균형 및 GLSL 금지어를 검증한다.
 */
export function validateXpbdClothHairWgsl(artifact: XpbdClothHairWgslArtifact): XpbdWgslValidationReport {
  const errors: string[] = [];
  const src = artifact.wgsl;

  if (src.trim().length === 0) {
    errors.push("WGSL 셰이더 소스가 비어 있습니다.");
  }
  if (
    !Number.isInteger(artifact.uniformBufferByteLength) ||
    artifact.uniformBufferByteLength <= 0 ||
    artifact.uniformBufferByteLength % 16 !== 0
  ) {
    errors.push("유니폼 버퍼 바이트 길이는 16바이트 배수여야 합니다.");
  }
  if (!Number.isInteger(artifact.workgroupSize) || artifact.workgroupSize <= 0 || artifact.workgroupSize > 256) {
    errors.push("워크그룹 크기는 1~256 사이 정수여야 합니다.");
  }
  if (src.includes("NaN") || src.includes("Infinity") || src.includes("undefined")) {
    errors.push("WGSL 본문에 유효하지 않은 리터럴(NaN/Infinity/undefined)이 포함되었습니다.");
  }

  for (let i = 0; i < FORBIDDEN_GLSL_PATTERNS.length; i += 1) {
    const rule = FORBIDDEN_GLSL_PATTERNS[i];
    if (rule.pattern.test(src)) {
      errors.push(`WGSL 금지 GLSL 구문(${rule.label})이 감지되었습니다.`);
    }
  }

  const requiredStructs = [
    "struct XpbdClothUniforms",
    "struct XpbdParticleGpu",
    "struct XpbdConstraintGpu",
    "struct BodyCapsuleColliderGpu",
  ];
  for (let i = 0; i < requiredStructs.length; i += 1) {
    if (!src.includes(requiredStructs[i])) {
      errors.push(`필수 WGSL 구조체(${requiredStructs[i]})가 누락되었습니다.`);
    }
  }

  for (let b = 0; b < 4; b += 1) {
    if (!src.includes(`@group(0) @binding(${b})`)) {
      errors.push(`필수 바인딩 선언 @group(0) @binding(${b})가 누락되었습니다.`);
    }
  }

  if (!src.includes(`@compute @workgroup_size(${artifact.workgroupSize})`)) {
    errors.push("컴퓨트 셰이더 @compute @workgroup_size 선언이 누락되었습니다.");
  }

  for (let i = 0; i < artifact.entryPoints.length; i += 1) {
    const ep = artifact.entryPoints[i];
    if (!src.includes(`fn ${ep}`)) {
      errors.push(`선언된 엔트리포인트(fn ${ep})가 WGSL 본문에 없습니다.`);
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
    lineCount: src.length === 0 ? 0 : src.split("\n").length,
  };
}
