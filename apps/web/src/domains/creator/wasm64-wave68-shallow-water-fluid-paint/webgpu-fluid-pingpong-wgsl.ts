/**
 * Wave 68 — WebGPU 핑퐁 컴퓨트 셰이더 3종(`@compute`), 16바이트 정렬 유니폼 패커 및 계약 검증기.
 *
 * - `SHALLOW_WATER_VELOCITY_WGSL`: 얕은 물방정식 압력·중력·점도·피닝 속도 갱신 + 수심 플럭스 핑퐁 패스
 * - `PIGMENT_ADVECTION_DRYING_WGSL`: Semi-Lagrangian 4채널 안료 이류 + 모세관 흡수·증발 건조 전선 고착 패스
 * - `WET_MEDIA_COMPOSITE_WGSL`: 4채널 Kubelka-Munk 감산 광학 + 임파스토 요철·젖은 광택 RGBA8 패킹 패스
 * - `packFluidSimUniforms` / `packWetCompositeUniforms`: 16바이트 정렬 보장 GPU 유니폼 패커 (80B / 192B)
 * - `validateFluidWgslContracts`: 괄호 균형·엔트리포인트·바인딩 충돌·16바이트 정렬 정적 검증기
 */

import {
  DEFAULT_PAPER_REFLECTANCE,
  DEFAULT_PIGMENT_OPTICS,
  type LinearRgbTuple,
  type PigmentOpticalPalette,
} from "./pigment-advection-compositor";
import {
  resolveShallowWaterFluidConfig,
  type ShallowWaterFluidConfig,
} from "./shallow-water-fluid-solver";

export const FLUID_WGSL_WORKGROUP_SIZE = 8 as const;

/** `FluidSimUniforms`: 20 x 4바이트 = 80바이트 (16바이트 배수 엄수) */
export const FLUID_SIM_UNIFORM_BYTE_LENGTH = 80 as const;

/** `WetCompositeUniforms`: 헤더 64바이트 + 4x K vec4(64B) + 4x S vec4(64B) = 192바이트 (16바이트 배수 엄수) */
export const WET_COMPOSITE_UNIFORM_BYTE_LENGTH = 192 as const;

export const SHALLOW_WATER_VELOCITY_WGSL = /* wgsl */ `
struct FluidSimUniforms {
  width: u32, height: u32, step_index: u32, pad_u32: u32,
  dt_sec: f32, inv_cell_scale: f32, gravity_x: f32, gravity_y: f32,
  viscosity: f32, surface_tension: f32, pressure_stiffness: f32, capillary_suction: f32,
  capillary_wicking: f32, evaporation_rate: f32, edge_evaporation_boost: f32, pigment_settle_rate: f32,
  granulation_strength: f32, contact_pinning_drag: f32, impasto_retention: f32, max_cfl_courant: f32,
}

@group(0) @binding(0) var<uniform> params: FluidSimUniforms;
@group(0) @binding(1) var<storage, read> water_in: array<f32>;
@group(0) @binding(2) var<storage, read> paper_grain: array<f32>;
@group(0) @binding(3) var<storage, read> vel_in: array<vec2<f32>>;
@group(0) @binding(4) var<storage, read_write> vel_out: array<vec2<f32>>;
@group(0) @binding(5) var<storage, read_write> water_out: array<f32>;
@group(0) @binding(6) var<storage, read_write> pressure_out: array<f32>;

const WET_EPS: f32 = 0.00001;
fn cell_idx(x: u32, y: u32) -> u32 { return y * params.width + x; }

fn eval_edge_and_pressure(x: u32, y: u32) -> vec2<f32> {
  let x_l = select(0u, x - 1u, x > 0u);
  let x_r = select(params.width - 1u, x + 1u, x + 1u < params.width);
  let y_u = select(0u, y - 1u, y > 0u);
  let y_d = select(params.height - 1u, y + 1u, y + 1u < params.height);
  let idx = cell_idx(x, y);
  let hc = water_in[idx];
  let hl = water_in[cell_idx(x_l, y)]; let hr = water_in[cell_idx(x_r, y)];
  let hu = water_in[cell_idx(x, y_u)]; let hd = water_in[cell_idx(x, y_d)];
  let lap_h = hl + hr + hu + hd - 4.0 * hc;
  let grain_head = (paper_grain[idx] - 0.5) * 0.06 * min(hc, 0.25);

  var edge_factor: f32 = 0.0;
  if (hc > WET_EPS) {
    let thin_t = max(WET_EPS * 2.0, hc * 0.42);
    let tn = f32(u32(hl < thin_t) + u32(hr < thin_t) + u32(hu < thin_t) + u32(hd < thin_t));
    let drop_r = max(0.0, (hc - 0.25 * (hl + hr + hu + hd)) / max(hc, 0.08));
    edge_factor = clamp(tn * 0.34 + drop_r * 0.45, 0.0, 1.0);
  }
  let base_p = params.pressure_stiffness * (hc + grain_head);
  let suction = min(max(0.0, base_p * 0.72), edge_factor * params.evaporation_rate * params.edge_evaporation_boost * 1.15);
  return vec2<f32>(base_p - params.surface_tension * lap_h - suction, edge_factor);
}

@compute @workgroup_size(8, 8, 1)
fn update_velocity_pressure(@builtin(global_invocation_id) gid: vec3<u32>) {
  let x = gid.x; let y = gid.y;
  if (x >= params.width || y >= params.height) { return; }
  let idx = cell_idx(x, y);
  let h = water_in[idx];
  let ep = eval_edge_and_pressure(x, y);
  pressure_out[idx] = ep.x;
  if (h <= WET_EPS) { vel_out[idx] = vec2<f32>(0.0, 0.0); return; }

  let x_l = select(0u, x - 1u, x > 0u);
  let x_r = select(params.width - 1u, x + 1u, x + 1u < params.width);
  let y_u = select(0u, y - 1u, y > 0u);
  let y_d = select(params.height - 1u, y + 1u, y + 1u < params.height);
  let grad_p = vec2<f32>(
    0.5 * (eval_edge_and_pressure(x_r, y).x - eval_edge_and_pressure(x_l, y).x) * params.inv_cell_scale,
    0.5 * (eval_edge_and_pressure(x, y_d).x - eval_edge_and_pressure(x, y_u).x) * params.inv_cell_scale,
  );
  let gravity = vec2<f32>(params.gravity_x, params.gravity_y);
  var accel = -grad_p + gravity * (h / (h + 0.08));

  let yield_stress = max(0.0, (params.viscosity - 1.0) * 0.48);
  if (yield_stress > 0.0) {
    let a_mag = length(accel);
    if (a_mag <= yield_stress) { accel = accel * 0.04; }
    else if (a_mag > 0.000001) { accel = accel * ((a_mag - yield_stress) / a_mag); }
  }

  let pinning_relief = clamp(1.0 - length(gravity) * 0.16, 0.12, 1.0);
  let evap_pin = clamp(params.evaporation_rate * 3.5, 0.2, 1.4);
  let thin_pin = select(0.0, (1.0 - h / 0.34) * ep.y * evap_pin, h < 0.34);
  let drag = params.viscosity * (1.2 + 0.45 / (h + 0.12)) + params.contact_pinning_drag * thin_pin * pinning_relief;
  var v = (vel_in[idx] + accel * params.dt_sec) * exp(-drag * params.dt_sec);

  if ((x == 0u && v.x < 0.0) || (x + 1u == params.width && v.x > 0.0)) { v.x = 0.0; }
  if ((y == 0u && v.y < 0.0) || (y + 1u == params.height && v.y > 0.0)) { v.y = 0.0; }
  let max_speed = params.max_cfl_courant / max(params.dt_sec, 0.0001);
  let speed = length(v);
  if (speed > max_speed && speed > 0.000001) { v = v * (max_speed / speed); }
  vel_out[idx] = v;
}

@compute @workgroup_size(8, 8, 1)
fn advect_water_flux(@builtin(global_invocation_id) gid: vec3<u32>) {
  let x = gid.x; let y = gid.y;
  if (x >= params.width || y >= params.height) { return; }
  let idx = cell_idx(x, y);
  let hc = water_in[idx]; let vc = vel_out[idx];
  let x_l = select(0u, x - 1u, x > 0u);
  let x_r = select(params.width - 1u, x + 1u, x + 1u < params.width);
  let y_u = select(0u, y - 1u, y > 0u);
  let y_d = select(params.height - 1u, y + 1u, y + 1u < params.height);

  let fl = select(0.0, water_in[cell_idx(x_l, y)] * max(0.0, vel_out[cell_idx(x_l, y)].x) - hc * max(0.0, -vc.x), x > 0u);
  let fr = select(0.0, water_in[cell_idx(x_r, y)] * max(0.0, -vel_out[cell_idx(x_r, y)].x) - hc * max(0.0, vc.x), x + 1u < params.width);
  let fu = select(0.0, water_in[cell_idx(x, y_u)] * max(0.0, vel_out[cell_idx(x, y_u)].y) - hc * max(0.0, -vc.y), y > 0u);
  let fd = select(0.0, water_in[cell_idx(x, y_d)] * max(0.0, -vel_out[cell_idx(x, y_d)].y) - hc * max(0.0, vc.y), y + 1u < params.height);
  water_out[idx] = max(0.0, hc + (fl + fr + fu + fd) * params.dt_sec);
}
`;

export const PIGMENT_ADVECTION_DRYING_WGSL = /* wgsl */ `
struct FluidSimUniforms {
  width: u32, height: u32, step_index: u32, pad_u32: u32,
  dt_sec: f32, inv_cell_scale: f32, gravity_x: f32, gravity_y: f32,
  viscosity: f32, surface_tension: f32, pressure_stiffness: f32, capillary_suction: f32,
  capillary_wicking: f32, evaporation_rate: f32, edge_evaporation_boost: f32, pigment_settle_rate: f32,
  granulation_strength: f32, contact_pinning_drag: f32, impasto_retention: f32, max_cfl_courant: f32,
}

@group(0) @binding(0) var<uniform> params: FluidSimUniforms;
@group(0) @binding(1) var<storage, read> vel_in: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read> water_in: array<f32>;
@group(0) @binding(3) var<storage, read> paper_grain: array<f32>;
@group(0) @binding(4) var<storage, read> mobile_pigment_in: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> mobile_pigment_out: array<vec4<f32>>;
@group(0) @binding(6) var<storage, read_write> deposited_pigment: array<vec4<f32>>;
@group(0) @binding(7) var<storage, read_write> paper_saturation: array<f32>;
@group(0) @binding(8) var<storage, read_write> water_after_dry: array<f32>;

const WET_EPS: f32 = 0.00001;
fn cell_idx(x: u32, y: u32) -> u32 { return y * params.width + x; }

fn sample_pigment_bilinear(sx: f32, sy: f32) -> vec4<f32> {
  let cx = clamp(sx, 0.0, f32(params.width - 1u));
  let cy = clamp(sy, 0.0, f32(params.height - 1u));
  let x0 = u32(floor(cx)); let y0 = u32(floor(cy));
  let x1 = min(params.width - 1u, x0 + 1u); let y1 = min(params.height - 1u, y0 + 1u);
  let fx = cx - f32(x0); let fy = cy - f32(y0);
  return mix(
    mix(mobile_pigment_in[cell_idx(x0, y0)], mobile_pigment_in[cell_idx(x1, y0)], fx),
    mix(mobile_pigment_in[cell_idx(x0, y1)], mobile_pigment_in[cell_idx(x1, y1)], fx),
    fy,
  );
}

@compute @workgroup_size(8, 8, 1)
fn advect_and_dry_pigment(@builtin(global_invocation_id) gid: vec3<u32>) {
  let x = gid.x; let y = gid.y;
  if (x >= params.width || y >= params.height) { return; }
  let idx = cell_idx(x, y);
  let h = water_in[idx]; let sat = paper_saturation[idx];

  if (h <= WET_EPS) {
    mobile_pigment_out[idx] = vec4<f32>(0.0);
    deposited_pigment[idx] = deposited_pigment[idx] + max(mobile_pigment_in[idx], vec4<f32>(0.0));
    paper_saturation[idx] = max(0.0, sat - params.evaporation_rate * 0.4 * params.dt_sec);
    water_after_dry[idx] = 0.0;
    return;
  }

  let x_l = select(0u, x - 1u, x > 0u);
  let x_r = select(params.width - 1u, x + 1u, x + 1u < params.width);
  let y_u = select(0u, y - 1u, y > 0u);
  let y_d = select(params.height - 1u, y + 1u, y + 1u < params.height);

  let src_pos = vec2<f32>(f32(x), f32(y)) - vel_in[idx] * params.dt_sec;
  let div_u = 0.5 * (vel_in[cell_idx(x_r, y)].x - vel_in[cell_idx(x_l, y)].x)
            + 0.5 * (vel_in[cell_idx(x, y_d)].y - vel_in[cell_idx(x, y_u)].y);
  let jac = clamp(1.0 / max(0.35, 1.0 + params.dt_sec * div_u), 0.45, 2.2);
  let advected = clamp(sample_pigment_bilinear(src_pos.x, src_pos.y) * jac, vec4<f32>(0.0), vec4<f32>(64.0));

  let thin_t = max(WET_EPS * 2.0, h * 0.42);
  let tn = f32(
    u32(water_in[cell_idx(x_l, y)] < thin_t) + u32(water_in[cell_idx(x_r, y)] < thin_t) +
    u32(water_in[cell_idx(x, y_u)] < thin_t) + u32(water_in[cell_idx(x, y_d)] < thin_t)
  );
  let edge_factor = clamp(tn * 0.34, 0.0, 1.0);
  let valley = 1.0 - paper_grain[idx];

  let sucked = min(h, params.capillary_suction * max(0.0, 1.0 - sat) * (0.65 + 0.7 * valley) * params.dt_sec);
  let after_s = max(0.0, h - sucked);
  let evap = min(after_s, params.evaporation_rate * (1.0 + params.edge_evaporation_boost * edge_factor) * params.dt_sec);
  let next_h = max(0.0, after_s - evap);

  let loss_ratio = clamp((sucked + evap) / h, 0.0, 1.0);
  let settle = params.pigment_settle_rate * (0.6 + params.granulation_strength * valley) * params.dt_sec;
  let frac = select(clamp(loss_ratio * (0.65 + 0.35 * edge_factor) + settle, 0.0, 1.0), 1.0, next_h <= WET_EPS);
  let delta = advected * frac;

  mobile_pigment_out[idx] = advected - delta;
  deposited_pigment[idx] = deposited_pigment[idx] + delta;
  paper_saturation[idx] = clamp(sat + sucked - params.evaporation_rate * 0.35 * params.dt_sec, 0.0, 1.0);
  water_after_dry[idx] = select(next_h, 0.0, next_h <= WET_EPS);
}
`;

export const WET_MEDIA_COMPOSITE_WGSL = /* wgsl */ `
struct WetCompositeUniforms {
  width: u32, height: u32, pad0: u32, pad1: u32,
  light_dir_and_spec: vec4<f32>,
  paper_rgb_and_grain: vec4<f32>,
  relief_and_thickness: vec4<f32>,
  pigment_k0: vec4<f32>, pigment_k1: vec4<f32>, pigment_k2: vec4<f32>, pigment_k3: vec4<f32>,
  pigment_s0: vec4<f32>, pigment_s1: vec4<f32>, pigment_s2: vec4<f32>, pigment_s3: vec4<f32>,
}

@group(0) @binding(0) var<uniform> params: WetCompositeUniforms;
@group(0) @binding(1) var<storage, read> mobile_pigment: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> deposited_pigment: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> water_height: array<f32>;
@group(0) @binding(4) var<storage, read> impasto_relief: array<f32>;
@group(0) @binding(5) var<storage, read> paper_grain: array<f32>;
@group(0) @binding(6) var<storage, read_write> rgba_out: array<u32>;

fn cell_idx(x: u32, y: u32) -> u32 { return y * params.width + x; }

fn eval_km_channel(k_in: f32, s_in: f32, rg: f32) -> f32 {
  let k = max(0.0, k_in); let s = max(0.0, s_in);
  if (k <= 0.000001 && s <= 0.000001) { return rg; }
  let gamma = sqrt(max(0.0, k * (k + 2.0 * s)));
  let cg = min(gamma, 24.0); let tg = tanh(cg);
  let inv_cg = select(1.0 / cosh(cg), 0.0, cg > 18.0);
  let denom = max(0.000001, (k + s) * tg + gamma);
  let r_l = (s * tg) / denom; let t_l = (gamma * inv_cg) / denom;
  return clamp(r_l + (t_l * t_l * rg) / max(0.00001, 1.0 - r_l * rg), 0.0, 1.0);
}

fn linear_to_srgb(v: f32) -> f32 {
  let c = clamp(v, 0.0, 1.0);
  return select(1.055 * pow(c, 1.0 / 2.4) - 0.055, 12.92 * c, c <= 0.0031308);
}

fn surface_height_at(idx: u32) -> f32 {
  let h = water_height[idx];
  return h * 0.9 + impasto_relief[idx] * 1.15 + paper_grain[idx] * 0.12 * (1.0 - clamp(h * 2.5, 0.0, 1.0));
}

@compute @workgroup_size(8, 8, 1)
fn composite_wet_media(@builtin(global_invocation_id) gid: vec3<u32>) {
  let x = gid.x; let y = gid.y;
  if (x >= params.width || y >= params.height) { return; }
  let idx = cell_idx(x, y);
  let pig = max(mobile_pigment[idx] + deposited_pigment[idx], vec4<f32>(0.0)) * params.relief_and_thickness.z;

  let k_rgb = params.pigment_k0.xyz * pig.x + params.pigment_k1.xyz * pig.y
            + params.pigment_k2.xyz * pig.z + params.pigment_k3.xyz * pig.w;
  let s_rgb = params.pigment_s0.xyz * pig.x + params.pigment_s1.xyz * pig.y
            + params.pigment_s2.xyz * pig.z + params.pigment_s3.xyz * pig.w;
  let paper = clamp(params.paper_rgb_and_grain.xyz * (1.0 + (paper_grain[idx] - 0.5) * params.paper_rgb_and_grain.w), vec3<f32>(0.0), vec3<f32>(1.0));
  let base_rgb = vec3<f32>(
    eval_km_channel(k_rgb.x, s_rgb.x, paper.x),
    eval_km_channel(k_rgb.y, s_rgb.y, paper.y),
    eval_km_channel(k_rgb.z, s_rgb.z, paper.z),
  );

  let x_l = select(0u, x - 1u, x > 0u);
  let x_r = select(params.width - 1u, x + 1u, x + 1u < params.width);
  let y_u = select(0u, y - 1u, y > 0u);
  let y_d = select(params.height - 1u, y + 1u, y + 1u < params.height);
  let rs = params.relief_and_thickness.x;
  let normal = normalize(vec3<f32>(
    -(surface_height_at(cell_idx(x_r, y)) - surface_height_at(cell_idx(x_l, y))) * 0.5 * rs,
    -(surface_height_at(cell_idx(x, y_d)) - surface_height_at(cell_idx(x, y_u))) * 0.5 * rs,
    1.0,
  ));
  let l_dir = normalize(params.light_dir_and_spec.xyz);
  let half_vec = normalize(l_dir + vec3<f32>(0.0, 0.0, 1.0));
  let n_dot_l = clamp(dot(normal, l_dir), 0.0, 1.0);
  let n_dot_h = clamp(dot(normal, half_vec), 0.0, 1.0);
  let wetness = smoothstep(0.015, 0.24, water_height[idx]);
  let imp_mask = clamp(impasto_relief[idx] * 1.4, 0.0, 1.0);
  let imp_s = params.relief_and_thickness.y;

  let diffuse_mod = 1.0 + (n_dot_l - 0.58) * imp_s * (0.25 + 0.75 * imp_mask);
  let fresnel = 0.025 + 0.975 * pow(1.0 - clamp(normal.z, 0.0, 1.0), 5.0);
  let spec = params.light_dir_and_spec.w * wetness * pow(n_dot_h, 48.0) * (0.45 + 0.55 * fresnel)
           + imp_s * 0.16 * imp_mask * (1.0 - wetness) * pow(n_dot_h, 16.0);
  let lit = clamp(base_rgb * diffuse_mod + vec3<f32>(spec), vec3<f32>(0.0), vec3<f32>(1.0));

  let r8 = u32(round(linear_to_srgb(lit.x) * 255.0));
  let g8 = u32(round(linear_to_srgb(lit.y) * 255.0));
  let b8 = u32(round(linear_to_srgb(lit.z) * 255.0));
  rgba_out[idx] = r8 | (g8 << 8u) | (b8 << 16u) | (255u << 24u);
}
`;

export interface FluidSimUniformPackInput {
  readonly width: number;
  readonly height: number;
  readonly stepIndex: number;
  readonly dtSec: number;
  readonly config?: ShallowWaterFluidConfig;
}

/** `FluidSimUniforms` WGSL 구조체와 오프셋이 1:1 일치하는 80바이트(16바이트 정렬) 유니폼 버퍼를 패킹한다. */
export function packFluidSimUniforms(input: FluidSimUniformPackInput): ArrayBuffer {
  const cfg = resolveShallowWaterFluidConfig(input.config);
  const buffer = new ArrayBuffer(FLUID_SIM_UNIFORM_BYTE_LENGTH);
  const view = new DataView(buffer);
  const safeDt = Math.max(1e-4, Math.min(0.05, Number.isFinite(input.dtSec) ? input.dtSec : 0.016));

  view.setUint32(0, Math.max(4, Math.floor(Number.isFinite(input.width) ? input.width : 32)), true);
  view.setUint32(4, Math.max(4, Math.floor(Number.isFinite(input.height) ? input.height : 32)), true);
  view.setUint32(8, Math.max(0, Math.floor(Number.isFinite(input.stepIndex) ? input.stepIndex : 0)), true);
  view.setUint32(12, 0, true);

  const floats = [
    safeDt, 1.0 / Math.max(0.25, cfg.cellSizeMm), cfg.gravityX, cfg.gravityY,
    cfg.viscosity, cfg.surfaceTension, cfg.pressureStiffness, cfg.capillarySuction,
    cfg.capillaryWicking, cfg.evaporationRate, cfg.edgeEvaporationBoost, cfg.pigmentSettleRate,
    cfg.granulationStrength, cfg.contactPinningDrag, cfg.impastoRetention, cfg.maxCflCourant,
  ];
  for (let i = 0; i < floats.length; i += 1) {
    view.setFloat32(16 + i * 4, floats[i] ?? 0, true);
  }
  return buffer;
}

export interface WetCompositeUniformPackInput {
  readonly width: number;
  readonly height: number;
  readonly palette?: PigmentOpticalPalette;
  readonly paperReflectance?: LinearRgbTuple;
  readonly lightDirX?: number;
  readonly lightDirY?: number;
  readonly lightDirZ?: number;
  readonly wetSpecularStrength?: number;
  readonly impastoShadingStrength?: number;
  readonly paperGrainVisibility?: number;
  readonly reliefNormalScale?: number;
  readonly opticalThicknessScale?: number;
}

/** `WetCompositeUniforms` WGSL 구조체와 오프셋이 1:1 일치하는 192바이트(16바이트 정렬) 유니폼 버퍼를 패킹한다. */
export function packWetCompositeUniforms(input: WetCompositeUniformPackInput): ArrayBuffer {
  const palette = input.palette ?? DEFAULT_PIGMENT_OPTICS;
  const paper = input.paperReflectance ?? DEFAULT_PAPER_REFLECTANCE;
  const buffer = new ArrayBuffer(WET_COMPOSITE_UNIFORM_BYTE_LENGTH);
  const view = new DataView(buffer);

  view.setUint32(0, Math.max(4, Math.floor(input.width)), true);
  view.setUint32(4, Math.max(4, Math.floor(input.height)), true);
  view.setUint32(8, 0, true);
  view.setUint32(12, 0, true);

  const headerFloats = [
    input.lightDirX ?? -0.62, input.lightDirY ?? -0.52, input.lightDirZ ?? 0.58, input.wetSpecularStrength ?? 0.72,
    paper[0], paper[1], paper[2], input.paperGrainVisibility ?? 0.14,
    input.reliefNormalScale ?? 3.6, input.impastoShadingStrength ?? 0.38, input.opticalThicknessScale ?? 1.0, 0,
  ];
  for (let i = 0; i < headerFloats.length; i += 1) {
    view.setFloat32(16 + i * 4, headerFloats[i] ?? 0, true);
  }

  for (let i = 0; i < 4; i += 1) {
    const prof = palette[i];
    const kOff = 64 + i * 16;
    const sOff = 128 + i * 16;
    view.setFloat32(kOff, prof ? prof.absorptionK[0] : 0, true);
    view.setFloat32(kOff + 4, prof ? prof.absorptionK[1] : 0, true);
    view.setFloat32(kOff + 8, prof ? prof.absorptionK[2] : 0, true);
    view.setFloat32(kOff + 12, 0, true);
    view.setFloat32(sOff, prof ? prof.scatteringS[0] : 0, true);
    view.setFloat32(sOff + 4, prof ? prof.scatteringS[1] : 0, true);
    view.setFloat32(sOff + 8, prof ? prof.scatteringS[2] : 0, true);
    view.setFloat32(sOff + 12, 0, true);
  }
  return buffer;
}

export interface FluidPingPongPassSpec {
  readonly passId: string;
  readonly shaderName: "velocity" | "advection" | "composite";
  readonly entryPoint: string;
  readonly readSlots: readonly string[];
  readonly writeSlots: readonly string[];
}

export interface FluidPingPongDispatchPlan {
  readonly width: number;
  readonly height: number;
  readonly workgroupSizeX: number;
  readonly workgroupSizeY: number;
  readonly dispatchX: number;
  readonly dispatchY: number;
  readonly dispatchZ: 1;
  readonly pingIndex: 0 | 1;
  readonly pongIndex: 0 | 1;
  readonly passes: readonly FluidPingPongPassSpec[];
}

/** 핑퐁 스텝 인덱스(`stepIndex`)에 따른 WebGPU 워크그룹 디스패치 및 읽기/쓰기 버퍼 슬롯 교환 계획을 생성한다. */
export function buildFluidPingPongDispatchPlan(
  width: number,
  height: number,
  stepIndex: number = 0,
): FluidPingPongDispatchPlan {
  const safeW = Math.max(4, Math.floor(width));
  const safeH = Math.max(4, Math.floor(height));
  const pingIndex: 0 | 1 = stepIndex % 2 === 0 ? 0 : 1;
  const pongIndex: 0 | 1 = pingIndex === 0 ? 1 : 0;
  const ping = pingIndex === 0 ? "A" : "B";
  const pong = pongIndex === 0 ? "A" : "B";

  return {
    width: safeW,
    height: safeH,
    workgroupSizeX: FLUID_WGSL_WORKGROUP_SIZE,
    workgroupSizeY: FLUID_WGSL_WORKGROUP_SIZE,
    dispatchX: Math.ceil(safeW / FLUID_WGSL_WORKGROUP_SIZE),
    dispatchY: Math.ceil(safeH / FLUID_WGSL_WORKGROUP_SIZE),
    dispatchZ: 1,
    pingIndex,
    pongIndex,
    passes: [
      {
        passId: "velocity-pressure",
        shaderName: "velocity",
        entryPoint: "update_velocity_pressure",
        readSlots: [`water_${ping}`, "paper_grain", `vel_${ping}`],
        writeSlots: [`vel_${pong}`, "pressure"],
      },
      {
        passId: "water-flux",
        shaderName: "velocity",
        entryPoint: "advect_water_flux",
        readSlots: [`water_${ping}`, `vel_${pong}`],
        writeSlots: [`water_${pong}`],
      },
      {
        passId: "pigment-advect-dry",
        shaderName: "advection",
        entryPoint: "advect_and_dry_pigment",
        readSlots: [`vel_${pong}`, `water_${pong}`, "paper_grain", `mobile_${ping}`],
        writeSlots: [`mobile_${pong}`, "deposited", "paper_saturation", `water_${ping}`],
      },
      {
        passId: "wet-media-composite",
        shaderName: "composite",
        entryPoint: "composite_wet_media",
        readSlots: [`mobile_${pong}`, "deposited", `water_${ping}`, "impasto_relief", "paper_grain"],
        writeSlots: ["rgba_out"],
      },
    ],
  };
}

export interface WgslBindingContract {
  readonly group: number;
  readonly binding: number;
  readonly addressSpace: string;
  readonly accessMode: "uniform" | "read" | "read_write";
  readonly name: string;
}

export interface SingleFluidWgslValidation {
  readonly shaderId: string;
  readonly valid: boolean;
  readonly entryPoints: readonly string[];
  readonly bindings: readonly WgslBindingContract[];
  readonly balancedDelimiters: boolean;
  readonly errors: readonly string[];
}

export interface FluidWgslContractValidationReport {
  readonly valid: boolean;
  readonly uniformByteLengthsAligned16: boolean;
  readonly shaders: readonly SingleFluidWgslValidation[];
  readonly errors: readonly string[];
}

export interface FluidWgslShaderBundle {
  readonly velocityWgsl?: string;
  readonly advectionWgsl?: string;
  readonly compositeWgsl?: string;
}

function checkBalancedDelimiters(source: string): boolean {
  const stack: string[] = [];
  const lines = source.split("\n");
  for (let li = 0; li < lines.length; li += 1) {
    const raw = lines[li] ?? "";
    const commentIdx = raw.indexOf("//");
    const line = commentIdx >= 0 ? raw.slice(0, commentIdx) : raw;
    for (let ci = 0; ci < line.length; ci += 1) {
      const ch = line.charAt(ci);
      if (ch === "(" || ch === "{" || ch === "[") {
        stack.push(ch);
      } else if (ch === ")" || ch === "}" || ch === "]") {
        const last = stack.pop();
        if ((ch === ")" && last !== "(") || (ch === "}" && last !== "{") || (ch === "]" && last !== "[")) {
          return false;
        }
      }
    }
  }
  return stack.length === 0;
}

function validateSingleShaderContract(
  shaderId: string,
  source: string,
  requiredEntryPoints: readonly string[],
  expectedBindingCount: number,
): SingleFluidWgslValidation {
  const errors: string[] = [];
  const balancedDelimiters = checkBalancedDelimiters(source);
  if (!balancedDelimiters) errors.push(`${shaderId}: 괄호/중괄호 균형이 맞지 않음`);
  if (source.includes("${") || /\bNaN\b/.test(source) || /\bundefined\b/.test(source)) {
    errors.push(`${shaderId}: 미치환 템플릿 토큰 또는 금지 식별자 포함`);
  }

  const entryPoints: string[] = [];
  const entryRegex = /@compute\s+@workgroup_size\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)\s+fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  let eMatch = entryRegex.exec(source);
  while (eMatch !== null) {
    if (eMatch[1]) entryPoints.push(eMatch[1]);
    eMatch = entryRegex.exec(source);
  }
  for (const req of requiredEntryPoints) {
    if (!entryPoints.includes(req)) errors.push(`${shaderId}: 필수 @compute 엔트리포인트 누락 (${req})`);
  }

  const bindings: WgslBindingContract[] = [];
  const seen = new Set<string>();
  const bRegex = /@group\((\d+)\)\s+@binding\((\d+)\)\s+var<(uniform|storage(?:\s*,\s*(?:read|read_write))?)>\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/g;
  let bMatch = bRegex.exec(source);
  while (bMatch !== null) {
    const group = Number(bMatch[1]);
    const binding = Number(bMatch[2]);
    const rawSpace = (bMatch[3] ?? "").replace(/\s+/g, "");
    const key = `${group}:${binding}`;
    if (seen.has(key)) errors.push(`${shaderId}: 중복 바인딩 선언 (@group(${group}) @binding(${binding}))`);
    seen.add(key);
    const accessMode: "uniform" | "read" | "read_write" =
      rawSpace === "storage,read" ? "read" : rawSpace === "storage,read_write" ? "read_write" : "uniform";
    bindings.push({ group, binding, addressSpace: rawSpace, accessMode, name: bMatch[4] ?? "" });
    bMatch = bRegex.exec(source);
  }

  if (bindings.length !== expectedBindingCount) {
    errors.push(`${shaderId}: 바인딩 수 불일치 (기대 ${expectedBindingCount}, 실제 ${bindings.length})`);
  }
  if (!bindings.some((b) => b.group === 0 && b.binding === 0 && b.accessMode === "uniform")) {
    errors.push(`${shaderId}: @group(0) @binding(0) uniform 파라미터 버퍼 누락`);
  }

  return { shaderId, valid: errors.length === 0, entryPoints, bindings, balancedDelimiters, errors };
}

/** 3종 유체 핑퐁 WGSL 셰이더의 구문·엔트리포인트·바인딩 계약 및 16바이트 유니폼 정렬을 정적 검증한다. */
export function validateFluidWgslContracts(
  bundle: FluidWgslShaderBundle = {},
): FluidWgslContractValidationReport {
  const shaders: SingleFluidWgslValidation[] = [
    validateSingleShaderContract(
      "SHALLOW_WATER_VELOCITY_WGSL",
      bundle.velocityWgsl ?? SHALLOW_WATER_VELOCITY_WGSL,
      ["update_velocity_pressure", "advect_water_flux"],
      7,
    ),
    validateSingleShaderContract(
      "PIGMENT_ADVECTION_DRYING_WGSL",
      bundle.advectionWgsl ?? PIGMENT_ADVECTION_DRYING_WGSL,
      ["advect_and_dry_pigment"],
      9,
    ),
    validateSingleShaderContract(
      "WET_MEDIA_COMPOSITE_WGSL",
      bundle.compositeWgsl ?? WET_MEDIA_COMPOSITE_WGSL,
      ["composite_wet_media"],
      7,
    ),
  ];

  const uniformByteLengthsAligned16 =
    FLUID_SIM_UNIFORM_BYTE_LENGTH % 16 === 0 && WET_COMPOSITE_UNIFORM_BYTE_LENGTH % 16 === 0;
  const errors: string[] = [];
  if (!uniformByteLengthsAligned16) errors.push("유니폼 버퍼 바이트 크기가 16바이트 정렬 배수가 아닙니다.");
  for (const sh of shaders) {
    for (const msg of sh.errors) errors.push(msg);
  }
  return { valid: errors.length === 0, uniformByteLengthsAligned16, shaders, errors };
}
