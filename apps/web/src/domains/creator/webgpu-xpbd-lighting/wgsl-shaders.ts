/**
 * Wave 37D — WebGPU `@compute` WGSL 셰이더 2종 및 정적 문법·바인딩 구조 검증기.
 *
 * - `XPBD_HAIR_CLOTH_WGSL`: 3패스 XPBD 헤어·의상 물리 + 5종 캡슐 콜라이더 비관통 투영 셰이더
 * - `TOON_SDF_RAYMARCH_WGSL`: 5종 휴머노이드 캡슐 SDF 레이마칭 툰 광원·림라이트·바운스 베이크 셰이더
 */

export const XPBD_WORKGROUP_SIZE = 64 as const;
export const TOON_SDF_WORKGROUP_SIZE = 8 as const;

export interface WgslBindingDescriptor {
  readonly group: number;
  readonly binding: number;
  readonly addressSpace: string;
  readonly name: string;
}

export interface WgslValidationReport {
  readonly valid: boolean;
  readonly entryPoints: readonly string[];
  readonly workgroupSizes: readonly string[];
  readonly bindings: readonly WgslBindingDescriptor[];
  readonly structs: readonly string[];
  readonly balancedDelimiters: boolean;
  readonly errors: readonly string[];
}

/**
 * WebGPU `@compute` XPBD 헤어·의상 물리 + 5종 캡슐 콜라이더 비관통 투영 WGSL 셰이더를 생성한다.
 */
export function buildXpbdHairClothWgsl(workgroupSize: number = XPBD_WORKGROUP_SIZE): string {
  const wg = Math.max(1, Math.min(256, Math.floor(workgroupSize)));
  return /* wgsl */ `
struct SimParams {
  dt_substep: f32,
  gravity: f32,
  damping: f32,
  clearance_m: f32,
  wind_x: f32,
  wind_y: f32,
  wind_z: f32,
  gust_amp: f32,
  gust_phase: f32,
  max_stretch_ratio: f32,
  particle_count: u32,
  collider_count: u32,
  distance_count: u32,
  bending_count: u32,
  pad0: u32,
  pad1: u32,
}

struct Particle {
  pos_invmass: vec4<f32>,
  prev_radius: vec4<f32>,
  vel_kind: vec4<f32>,
}

struct CapsuleCollider {
  a_radius: vec4<f32>,
  b_pad: vec4<f32>,
}

struct DistanceConstraint {
  idx_a: u32,
  idx_b: u32,
  rest_length: f32,
  compliance: f32,
}

struct BendingConstraint {
  idx_a: u32,
  idx_b: u32,
  idx_c: u32,
  rest_span: f32,
  compliance: f32,
  pad0: f32,
  pad1: f32,
  pad2: f32,
}

@group(0) @binding(0) var<uniform> params: SimParams;
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(2) var<storage, read> colliders: array<CapsuleCollider>;
@group(0) @binding(3) var<storage, read> distance_constraints: array<DistanceConstraint>;
@group(0) @binding(4) var<storage, read> bending_constraints: array<BendingConstraint>;

fn eval_curl_gust(pos: vec3<f32>, phase: f32, amp: f32) -> vec3<f32> {
  if (amp <= 0.00001) { return vec3<f32>(0.0, 0.0, 0.0); }
  let cx = sin(pos.y * 7.3 + phase) * cos(pos.z * 6.1 - phase * 0.7);
  let cy = 0.35 * cos(pos.x * 6.7 + phase * 0.85) * sin(pos.z * 5.9 + phase * 0.5);
  let cz = cos(pos.x * 7.1 - phase * 0.9) * sin(pos.y * 6.3 + phase * 0.6);
  return vec3<f32>(cx, cy, cz) * amp;
}

fn project_particle_capsule(
  pos: vec3<f32>,
  p_radius: f32,
  cap: CapsuleCollider,
  clearance_m: f32,
) -> vec3<f32> {
  let a = cap.a_radius.xyz;
  let b = cap.b_pad.xyz;
  let ab = b - a;
  let t = clamp(dot(pos - a, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
  let closest = a + ab * t;
  let delta = pos - closest;
  let dist = length(delta);
  let min_dist = cap.a_radius.w + p_radius + clearance_m;
  if (dist >= min_dist) { return pos; }
  let normal = select(vec3<f32>(0.0, 1.0, 0.0), delta / dist, dist > 1e-6);
  return closest + normal * (min_dist + 0.00005);
}

@compute @workgroup_size(${wg}, 1, 1)
fn predict_positions(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.particle_count) { return; }
  var p = particles[idx];
  let inv_mass = p.pos_invmass.w;
  if (inv_mass <= 0.0) { return; }
  let pos = p.pos_invmass.xyz;
  let vel = p.vel_kind.xyz;
  let wind_vec = vec3<f32>(params.wind_x, params.wind_y, params.wind_z);
  let gust_vec = eval_curl_gust(pos, params.gust_phase, params.gust_amp);
  let total_accel = vec3<f32>(0.0, -params.gravity, 0.0) + (wind_vec + gust_vec - vel) * 2.6;
  let damp_factor = max(0.0, 1.0 - params.damping * params.dt_substep);
  var next_vel = (vel + total_accel * params.dt_substep) * damp_factor;
  let speed = length(next_vel);
  if (speed > 12.0) { next_vel = next_vel * (12.0 / speed); }
  p.prev_radius = vec4<f32>(pos, p.prev_radius.w);
  p.pos_invmass = vec4<f32>(pos + next_vel * params.dt_substep, inv_mass);
  p.vel_kind = vec4<f32>(next_vel, p.vel_kind.w);
  particles[idx] = p;
}

@compute @workgroup_size(${wg}, 1, 1)
fn solve_constraints_and_collide(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.particle_count) { return; }
  let inv_dt_sq = 1.0 / max(params.dt_substep * params.dt_substep, 1e-8);
  if (idx < params.distance_count) {
    let dc = distance_constraints[idx];
    var pa = particles[dc.idx_a];
    var pb = particles[dc.idx_b];
    let wa = pa.pos_invmass.w;
    let wb = pb.pos_invmass.w;
    let w_sum = wa + wb;
    if (w_sum > 0.0) {
      let diff = pb.pos_invmass.xyz - pa.pos_invmass.xyz;
      let dist = max(length(diff), 1e-6);
      let d_lambda = -(dist - dc.rest_length) / (w_sum + dc.compliance * inv_dt_sq);
      let corr = (diff / dist) * d_lambda;
      pa.pos_invmass = vec4<f32>(pa.pos_invmass.xyz - corr * wa, wa);
      pb.pos_invmass = vec4<f32>(pb.pos_invmass.xyz + corr * wb, wb);
      let c_diff = pb.pos_invmass.xyz - pa.pos_invmass.xyz;
      let c_dist = max(length(c_diff), 1e-6);
      let max_len = dc.rest_length * params.max_stretch_ratio;
      if (c_dist > max_len) {
        let excess = (c_dist - max_len) / w_sum;
        let dir = c_diff / c_dist;
        pa.pos_invmass = vec4<f32>(pa.pos_invmass.xyz + dir * excess * wa, wa);
        pb.pos_invmass = vec4<f32>(pb.pos_invmass.xyz - dir * excess * wb, wb);
      }
      particles[dc.idx_a] = pa;
      particles[dc.idx_b] = pb;
    }
  }
  if (idx < params.bending_count) {
    let bc = bending_constraints[idx];
    var pa = particles[bc.idx_a];
    var pc = particles[bc.idx_c];
    let wa = pa.pos_invmass.w;
    let wc = pc.pos_invmass.w;
    let w_sum = wa + wc;
    if (w_sum > 0.0) {
      let span = pc.pos_invmass.xyz - pa.pos_invmass.xyz;
      let span_len = max(length(span), 1e-6);
      let d_lambda = -(span_len - bc.rest_span) / (w_sum + bc.compliance * inv_dt_sq);
      let corr = (span / span_len) * d_lambda;
      pa.pos_invmass = vec4<f32>(pa.pos_invmass.xyz - corr * wa, wa);
      pc.pos_invmass = vec4<f32>(pc.pos_invmass.xyz + corr * wc, wc);
      particles[bc.idx_a] = pa;
      particles[bc.idx_c] = pc;
    }
  }
  var p = particles[idx];
  if (p.pos_invmass.w > 0.0) {
    var pos = p.pos_invmass.xyz;
    let p_rad = p.prev_radius.w;
    for (var pass_idx: u32 = 0u; pass_idx < 4u; pass_idx = pass_idx + 1u) {
      for (var ci: u32 = 0u; ci < params.collider_count; ci = ci + 1u) {
        pos = project_particle_capsule(pos, p_rad, colliders[ci], params.clearance_m);
      }
    }
    p.pos_invmass = vec4<f32>(pos, p.pos_invmass.w);
    particles[idx] = p;
  }
}

@compute @workgroup_size(${wg}, 1, 1)
fn integrate_velocities(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.particle_count) { return; }
  var p = particles[idx];
  if (p.pos_invmass.w <= 0.0) { return; }
  let inv_dt = 1.0 / max(params.dt_substep, 1e-6);
  p.vel_kind = vec4<f32>((p.pos_invmass.xyz - p.prev_radius.xyz) * inv_dt, p.vel_kind.w);
  particles[idx] = p;
}
`.trim();
}

export const XPBD_HAIR_CLOTH_WGSL: string = buildXpbdHairClothWgsl(XPBD_WORKGROUP_SIZE);

/**
 * WebGPU `@compute` SDF 레이마칭 툰 광원 근사화 베이크 WGSL 셰이더를 생성한다.
 */
export function buildToonSdfRaymarchWgsl(workgroupSize: number = TOON_SDF_WORKGROUP_SIZE): string {
  const wg = Math.max(1, Math.min(32, Math.floor(workgroupSize)));
  return /* wgsl */ `
struct LightBakeParams {
  width: u32,
  height: u32,
  collider_count: u32,
  cel_steps: u32,
  light_dir_el: vec4<f32>,
  key_oklch: vec4<f32>,
  bounce_oklch: vec4<f32>,
  rim_oklch: vec4<f32>,
  shadow_softness: f32,
  sky_fill_ratio: f32,
  key_intensity: f32,
  pad0: f32,
}

struct SdfCapsule {
  a_radius: vec4<f32>,
  b_pad: vec4<f32>,
}

struct BakedLightingTexel {
  ndotl: f32,
  sdf_shadow: f32,
  sdf_ao: f32,
  rim_factor: f32,
  bounce_factor: f32,
  cel_band: u32,
  hit_mask: u32,
  pad0: u32,
}

@group(0) @binding(0) var<uniform> params: LightBakeParams;
@group(0) @binding(1) var<storage, read> capsules: array<SdfCapsule>;
@group(0) @binding(2) var<storage, read_write> out_texels: array<BakedLightingTexel>;

fn sd_capsule(p: vec3<f32>, a: vec3<f32>, b: vec3<f32>, r: f32) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

fn op_smooth_union(d1: f32, d2: f32, k: f32) -> f32 {
  let h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
  return mix(d2, d1, h) - k * h * (1.0 - h);
}

fn map_character_sdf(p: vec3<f32>) -> f32 {
  var d: f32 = 1e5;
  for (var i: u32 = 0u; i < params.collider_count; i = i + 1u) {
    let cap = capsules[i];
    d = op_smooth_union(d, sd_capsule(p, cap.a_radius.xyz, cap.b_pad.xyz, cap.a_radius.w), 0.018);
  }
  return d;
}

fn calc_sdf_normal(p: vec3<f32>) -> vec3<f32> {
  let eps: f32 = 0.0025;
  let dx = map_character_sdf(p + vec3<f32>(eps, 0.0, 0.0)) - map_character_sdf(p - vec3<f32>(eps, 0.0, 0.0));
  let dy = map_character_sdf(p + vec3<f32>(0.0, eps, 0.0)) - map_character_sdf(p - vec3<f32>(0.0, eps, 0.0));
  let dz = map_character_sdf(p + vec3<f32>(0.0, 0.0, eps)) - map_character_sdf(p - vec3<f32>(0.0, 0.0, eps));
  return normalize(vec3<f32>(dx, dy, dz) + vec3<f32>(0.0, 0.0, 1e-6));
}

fn march_soft_shadow(ro: vec3<f32>, rd: vec3<f32>, k: f32) -> f32 {
  var res: f32 = 1.0;
  var t: f32 = 0.015;
  for (var i: u32 = 0u; i < 16u; i = i + 1u) {
    let h = map_character_sdf(ro + rd * t);
    if (h < 0.001) { return 0.0; }
    res = min(res, k * h / t);
    t = t + clamp(h, 0.012, 0.08);
    if (t > 0.75) { break; }
  }
  return clamp(res, 0.0, 1.0);
}

fn calc_sdf_ao(p: vec3<f32>, n: vec3<f32>) -> f32 {
  var occ: f32 = 0.0;
  var scale: f32 = 1.0;
  for (var i: u32 = 1u; i <= 4u; i = i + 1u) {
    let hr = 0.015 * f32(i);
    occ = occ + (hr - map_character_sdf(p + n * hr)) * scale;
    scale = scale * 0.65;
  }
  return clamp(1.0 - occ * 3.2, 0.25, 1.0);
}

@compute @workgroup_size(${wg}, ${wg}, 1)
fn bake_toon_sdf_lighting(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) { return; }
  let idx = gid.y * params.width + gid.x;
  let u = (f32(gid.x) + 0.5) / f32(params.width);
  let v = (f32(gid.y) + 0.5) / f32(params.height);
  let ro = vec3<f32>((u - 0.5) * 0.56, 1.78 - v * 0.78, 0.62);
  let rd = vec3<f32>(0.0, 0.0, -1.0);
  var t: f32 = 0.0;
  var hit: u32 = 0u;
  for (var step_i: u32 = 0u; step_i < 24u; step_i = step_i + 1u) {
    let d = map_character_sdf(ro + rd * t);
    if (d < 0.002) { hit = 1u; break; }
    t = t + d;
    if (t > 1.25) { break; }
  }
  if (hit == 0u) {
    out_texels[idx] = BakedLightingTexel(0.0, 1.0, 1.0, 0.0, 0.0, 0u, 0u, 0u);
    return;
  }
  let p = ro + rd * t;
  let n = calc_sdf_normal(p);
  let light_dir = normalize(params.light_dir_el.xyz);
  let ndotl = dot(n, light_dir);
  let shadow_k = mix(14.0, 3.0, clamp(params.shadow_softness, 0.0, 1.0));
  let sdf_shadow = march_soft_shadow(p + n * 0.004, light_dir, shadow_k);
  let sdf_ao = calc_sdf_ao(p, n);
  let lit_term = clamp((ndotl * 0.5 + 0.5) * sdf_shadow * sdf_ao, 0.0, 1.0);
  let band = min(params.cel_steps - 1u, u32(floor(lit_term * f32(params.cel_steps))));
  let fresnel = pow(1.0 - max(dot(n, vec3<f32>(0.0, 0.0, 1.0)), 0.0), 2.4);
  let rim = clamp(fresnel * clamp(ndotl + 0.45, 0.0, 1.0) * sdf_shadow, 0.0, 1.0);
  let bounce = clamp(max(0.0, -n.y) * max(0.2, sin(params.light_dir_el.w)), 0.0, 1.0);
  out_texels[idx] = BakedLightingTexel(ndotl, sdf_shadow, sdf_ao, rim, bounce, band, 1u, 0u);
}
`.trim();
}

export const TOON_SDF_RAYMARCH_WGSL: string = buildToonSdfRaymarchWgsl(TOON_SDF_WORKGROUP_SIZE);

/**
 * WGSL `@compute` 셰이더 소스의 정적 문법·괄호 균형·바인딩 슬롯·진입점을 검증한다.
 */
export function validateWgslComputeShader(source: string): WgslValidationReport {
  const errors: string[] = [];

  let braceDepth = 0;
  let parenDepth = 0;
  let balancedDelimiters = true;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") braceDepth += 1;
    else if (ch === "}") {
      braceDepth -= 1;
      if (braceDepth < 0) balancedDelimiters = false;
    } else if (ch === "(") parenDepth += 1;
    else if (ch === ")") {
      parenDepth -= 1;
      if (parenDepth < 0) balancedDelimiters = false;
    }
  }
  if (braceDepth !== 0 || parenDepth !== 0) {
    balancedDelimiters = false;
  }
  if (!balancedDelimiters) {
    errors.push("WGSL 괄호 또는 중괄호 짝이 맞지 않습니다.");
  }

  const structs = [...source.matchAll(/\bstruct\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gu)]
    .map((m) => m[1] ?? "")
    .filter(Boolean);
  if (structs.length === 0) {
    errors.push("WGSL struct 선언이 최소 1개 이상 필요합니다.");
  }

  const bindings: WgslBindingDescriptor[] = [];
  const seenSlots = new Set<string>();
  for (const match of source.matchAll(
    /@group\((\d+)\)\s*@binding\((\d+)\)\s*var<([^>]+)>\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gu,
  )) {
    const group = Number(match[1]);
    const binding = Number(match[2]);
    const slotKey = `${group}:${binding}`;
    if (seenSlots.has(slotKey)) {
      errors.push(`중복된 바인딩 슬롯이 감지되었습니다: @group(${group}) @binding(${binding})`);
    }
    seenSlots.add(slotKey);
    bindings.push({
      group,
      binding,
      addressSpace: (match[3] ?? "").trim(),
      name: (match[4] ?? "").trim(),
    });
  }
  if (bindings.length === 0) {
    errors.push("WGSL @group/@binding 리소스 바인딩이 선언되지 않았습니다.");
  }

  const entryMatches = [
    ...source.matchAll(
      /@compute\s+@workgroup_size\(([^)]+)\)\s*fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gu,
    ),
  ];
  const entryPoints = entryMatches.map((m) => m[2] ?? "").filter(Boolean);
  const workgroupSizes = entryMatches.map((m) => (m[1] ?? "").replace(/\s+/gu, ""));
  if (entryPoints.length === 0) {
    errors.push("@compute @workgroup_size(...) 진입점 함수가 없습니다.");
  }

  if (!/@builtin\(\s*global_invocation_id\s*\)/u.test(source)) {
    errors.push("@builtin(global_invocation_id) 내장 매개변수가 누락되었습니다.");
  }

  return Object.freeze({
    valid: errors.length === 0,
    entryPoints: Object.freeze(entryPoints),
    workgroupSizes: Object.freeze(workgroupSizes),
    bindings: Object.freeze(bindings),
    structs: Object.freeze(structs),
    balancedDelimiters,
    errors: Object.freeze(errors),
  });
}
