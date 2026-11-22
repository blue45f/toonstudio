/**
 * Rebelle 식 2D Shallow-Water 유체 수채화 WGSL Compute 셰이더 및 64B 균일 버퍼 패커
 * (`studio-fluid-watercolor-sim.ts`와 1:1 동일 수학, WebGPU 최소 8 스토리지 버퍼 한도 내 5버퍼 설계).
 */

export interface FluidWatercolorSimParams {
  /** 시간 간격(CFL 안정 범위 0.01..0.35). */
  readonly dt: number;
  /** 캔버스 기울기 중력 가속도 X (양수 = 오른쪽). */
  readonly gravityX: number;
  /** 캔버스 기울기 중력 가속도 Y (양수 = 아래쪽). */
  readonly gravityY: number;
  /** 정수압 높이 기울기 계수. */
  readonly pressureStrength: number;
  /** 종이 요철이 얕은 수면을 골짜기로 유도하는 결합 계수. */
  readonly paperSlopeCoupling: number;
  /** 기본 유체 점성 감쇠. */
  readonly viscosity: number;
  /** 종이 섬유 골짜기 추가 마찰. */
  readonly fiberDrag: number;
  /** 종이 모세관 확산 계수. */
  readonly capillaryRate: number;
  /** 종이 골짜기 안료 침강(granulation) 속도. */
  readonly granulationRate: number;
  /** 젖음 가장자리 커피링 백런(backrun) 이동 강도. */
  readonly backrunStrength: number;
  /** 표면 수분 증발 속도 (0이면 수분 완전 보존). */
  readonly evaporationRate: number;
  /** 표면 수분의 종이 기공 모세관 흡수 속도. */
  readonly absorptionRate: number;
  /** CFL 속도 상한. */
  readonly maxSpeed: number;
  /** 활성 습윤 임계치. */
  readonly wetEps: number;
}

export const DEFAULT_FLUID_WATERCOLOR_PARAMS: FluidWatercolorSimParams = Object.freeze({
  dt: 0.18,
  gravityX: 0,
  gravityY: 0,
  pressureStrength: 1.15,
  paperSlopeCoupling: 0.36,
  viscosity: 0.42,
  fiberDrag: 0.68,
  capillaryRate: 0.28,
  granulationRate: 0.34,
  backrunStrength: 0.55,
  evaporationRate: 0.006,
  absorptionRate: 0.035,
  maxSpeed: 1.1,
  wetEps: 1e-4,
});

/** WGSL 균일 버퍼 필드 순서 (16 × 4 B = 64 B, 16바이트 정렬). */
export const STUDIO_FLUID_WATERCOLOR_WGSL_PARAM_FIELDS = Object.freeze([
  "width",
  "height",
  "dt",
  "gravity_x",
  "gravity_y",
  "pressure_strength",
  "paper_slope_coupling",
  "viscosity",
  "fiber_drag",
  "capillary_rate",
  "granulation_rate",
  "backrun_strength",
  "evaporation_rate",
  "absorption_rate",
  "max_speed",
  "wet_eps",
] as const);

export const STUDIO_FLUID_WATERCOLOR_WGSL_WORKGROUP_X = 8;
export const STUDIO_FLUID_WATERCOLOR_WGSL_WORKGROUP_Y = 8;
export const STUDIO_FLUID_WATERCOLOR_WGSL_VELOCITY_ENTRY = "fluid_watercolor_velocity_step";
export const STUDIO_FLUID_WATERCOLOR_WGSL_TRANSPORT_ENTRY = "fluid_watercolor_transport_step";

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function normalizeFluidWatercolorParams(
  input?: Partial<FluidWatercolorSimParams>,
): FluidWatercolorSimParams {
  const src = { ...DEFAULT_FLUID_WATERCOLOR_PARAMS, ...input };
  return Object.freeze({
    dt: clamp(Number.isFinite(src.dt) ? src.dt : DEFAULT_FLUID_WATERCOLOR_PARAMS.dt, 0.01, 0.35),
    gravityX: clamp(Number.isFinite(src.gravityX) ? src.gravityX : 0, -4, 4),
    gravityY: clamp(Number.isFinite(src.gravityY) ? src.gravityY : 0, -4, 4),
    pressureStrength: clamp(Number.isFinite(src.pressureStrength) ? src.pressureStrength : 1.15, 0, 4),
    paperSlopeCoupling: clamp(Number.isFinite(src.paperSlopeCoupling) ? src.paperSlopeCoupling : 0.36, 0, 2),
    viscosity: clamp(Number.isFinite(src.viscosity) ? src.viscosity : 0.42, 0, 8),
    fiberDrag: clamp(Number.isFinite(src.fiberDrag) ? src.fiberDrag : 0.68, 0, 8),
    capillaryRate: clamp(Number.isFinite(src.capillaryRate) ? src.capillaryRate : 0.28, 0, 2),
    granulationRate: clamp(Number.isFinite(src.granulationRate) ? src.granulationRate : 0.34, 0, 4),
    backrunStrength: clamp(Number.isFinite(src.backrunStrength) ? src.backrunStrength : 0.55, 0, 3),
    evaporationRate: clamp(Number.isFinite(src.evaporationRate) ? src.evaporationRate : 0.006, 0, 1),
    absorptionRate: clamp(Number.isFinite(src.absorptionRate) ? src.absorptionRate : 0.035, 0, 1),
    maxSpeed: clamp(Number.isFinite(src.maxSpeed) ? src.maxSpeed : 1.1, 0.05, 2),
    wetEps: clamp(Number.isFinite(src.wetEps) ? src.wetEps : 1e-4, 1e-6, 1e-2),
  });
}

/** WGSL `FluidWatercolorParams` 구조체(64B)와 바이트 단위로 동일한 균일 버퍼를 패킹한다. */
export function packFluidWatercolorUniforms(
  width: number,
  height: number,
  params?: Partial<FluidWatercolorSimParams>,
): ArrayBuffer {
  const p = normalizeFluidWatercolorParams(params);
  const buffer = new ArrayBuffer(64);
  const u32 = new Uint32Array(buffer);
  const f32 = new Float32Array(buffer);
  u32[0] = Math.max(1, Math.trunc(width)) >>> 0;
  u32[1] = Math.max(1, Math.trunc(height)) >>> 0;
  f32[2] = p.dt;
  f32[3] = p.gravityX;
  f32[4] = p.gravityY;
  f32[5] = p.pressureStrength;
  f32[6] = p.paperSlopeCoupling;
  f32[7] = p.viscosity;
  f32[8] = p.fiberDrag;
  f32[9] = p.capillaryRate;
  f32[10] = p.granulationRate;
  f32[11] = p.backrunStrength;
  f32[12] = p.evaporationRate;
  f32[13] = p.absorptionRate;
  f32[14] = p.maxSpeed;
  f32[15] = p.wetEps;
  return buffer;
}

/** WebGPU Compute 디스패치 워크그룹 수를 계산한다. */
export function computeFluidWatercolorDispatchSize(
  width: number,
  height: number,
): { readonly workgroupsX: number; readonly workgroupsY: number; readonly workgroupsZ: 1 } {
  return {
    workgroupsX: Math.max(1, Math.ceil(width / STUDIO_FLUID_WATERCOLOR_WGSL_WORKGROUP_X)),
    workgroupsY: Math.max(1, Math.ceil(height / STUDIO_FLUID_WATERCOLOR_WGSL_WORKGROUP_Y)),
    workgroupsZ: 1,
  };
}

/**
 * 2패스 보존형 얕은 물 수채화 WGSL 컴퓨트 셰이더.
 * WebGPU 최소 스토리지 버퍼 한도(8개) 이내인 5개 스토리지 버퍼(`@binding(1..5)`)만 사용한다.
 */
export const STUDIO_FLUID_WATERCOLOR_WGSL = /* wgsl */ `
struct FluidWatercolorParams {
  width: u32,
  height: u32,
  dt: f32,
  gravity_x: f32,
  gravity_y: f32,
  pressure_strength: f32,
  paper_slope_coupling: f32,
  viscosity: f32,
  fiber_drag: f32,
  capillary_rate: f32,
  granulation_rate: f32,
  backrun_strength: f32,
  evaporation_rate: f32,
  absorption_rate: f32,
  max_speed: f32,
  wet_eps: f32,
}

@group(0) @binding(0) var<uniform> params: FluidWatercolorParams;
@group(0) @binding(1) var<storage, read> cell_in: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> cell_out: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> paper_in: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> paper_out: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> vel_mid: array<vec2<f32>>;

fn cell_idx(x: u32, y: u32) -> u32 {
  return y * params.width + x;
}

fn surface_elevation(idx: u32) -> f32 {
  return cell_in[idx].x + params.paper_slope_coupling * paper_in[idx].x;
}

fn face_flux_pair(idx_a: u32, idx_b: u32, dx: f32, dy: f32) -> vec2<f32> {
  let ca = cell_in[idx_a];
  let cb = cell_in[idx_b];
  let pa = paper_in[idx_a];
  let pb = paper_in[idx_b];
  let va = vel_mid[idx_a];
  let vb = vel_mid[idx_b];

  let wa = ca.x;
  let wb = cb.x;
  let piga = ca.w;
  let pigb = cb.w;

  let v_face = 0.5 * ((va.x + vb.x) * dx + (va.y + vb.y) * dy);
  var f_adv = v_face * wb;
  if (v_face >= 0.0) { f_adv = v_face * wa; }

  let pore_factor = 0.5 + 0.5 * (2.0 - pa.x - pb.x);
  let f_cap = params.capillary_rate * (wa - wb) * pore_factor;
  let f_water_raw = params.dt * (f_adv + f_cap);

  var f_water = max(f_water_raw, -0.24 * wb);
  if (f_water_raw > 0.0) { f_water = min(f_water_raw, 0.24 * wa); }

  var conc_a = 0.0;
  if (wa > params.wet_eps) { conc_a = piga / wa; }
  var conc_b = 0.0;
  if (wb > params.wet_eps) { conc_b = pigb / wb; }

  var f_pig_adv = f_water * conc_b;
  if (f_water >= 0.0) { f_pig_adv = f_water * conc_a; }

  let wet_a = clamp((wa - params.wet_eps) / 0.04, 0.0, 1.0);
  let wet_b = clamp((wb - params.wet_eps) / 0.04, 0.0, 1.0);
  let wet_both = wet_a * wet_b;
  var pig_src = pigb;
  if (wa >= wb) { pig_src = piga; }
  let f_backrun = params.dt * params.backrun_strength * wet_both * (wa - wb) * pig_src;

  let f_pig_raw = f_pig_adv + f_backrun;
  var f_pig = max(f_pig_raw, -0.24 * pigb);
  if (f_pig_raw > 0.0) { f_pig = min(f_pig_raw, 0.24 * piga); }

  return vec2<f32>(f_water, f_pig);
}

@compute @workgroup_size(8, 8, 1)
fn fluid_watercolor_velocity_step(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) { return; }
  let x = gid.x;
  let y = gid.y;
  let idx = cell_idx(x, y);
  let c = cell_in[idx];
  if (c.x <= params.wet_eps) {
    vel_mid[idx] = vec2<f32>(0.0, 0.0);
    return;
  }
  let x_l = select(0u, x - 1u, x > 0u);
  let x_r = select(params.width - 1u, x + 1u, x + 1u < params.width);
  let y_u = select(0u, y - 1u, y > 0u);
  let y_d = select(params.height - 1u, y + 1u, y + 1u < params.height);

  let d_eta_dx = 0.5 * (surface_elevation(cell_idx(x_r, y)) - surface_elevation(cell_idx(x_l, y)));
  let d_eta_dy = 0.5 * (surface_elevation(cell_idx(x, y_d)) - surface_elevation(cell_idx(x, y_u)));
  let ax = params.gravity_x - params.pressure_strength * d_eta_dx;
  let ay = params.gravity_y - params.pressure_strength * d_eta_dy;

  let valley = 1.0 - paper_in[idx].x;
  let damp = 1.0 / (1.0 + params.dt * (params.viscosity + params.fiber_drag * valley));
  let vx = clamp((c.y + params.dt * ax) * damp, -params.max_speed, params.max_speed);
  let vy = clamp((c.z + params.dt * ay) * damp, -params.max_speed, params.max_speed);
  vel_mid[idx] = vec2<f32>(vx, vy);
}

@compute @workgroup_size(8, 8, 1)
fn fluid_watercolor_transport_step(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) { return; }
  let x = gid.x;
  let y = gid.y;
  let idx = cell_idx(x, y);
  let c = cell_in[idx];
  let p = paper_in[idx];
  let v = vel_mid[idx];

  var net_water = 0.0;
  var net_pigment = 0.0;
  if (x + 1u < params.width) {
    let flux = face_flux_pair(idx, cell_idx(x + 1u, y), 1.0, 0.0);
    net_water = net_water - flux.x;
    net_pigment = net_pigment - flux.y;
  }
  if (x > 0u) {
    let flux = face_flux_pair(idx, cell_idx(x - 1u, y), -1.0, 0.0);
    net_water = net_water - flux.x;
    net_pigment = net_pigment - flux.y;
  }
  if (y + 1u < params.height) {
    let flux = face_flux_pair(idx, cell_idx(x, y + 1u), 0.0, 1.0);
    net_water = net_water - flux.x;
    net_pigment = net_pigment - flux.y;
  }
  if (y > 0u) {
    let flux = face_flux_pair(idx, cell_idx(x, y - 1u), 0.0, -1.0);
    net_water = net_water - flux.x;
    net_pigment = net_pigment - flux.y;
  }

  let water_after = max(0.0, c.x + net_water);
  let pigment_after = max(0.0, c.w + net_pigment);
  let evap = min(water_after, params.dt * params.evaporation_rate);
  let water_post_evap = water_after - evap;

  let pore_cap = p.w;
  let absorb_delta = min(water_post_evap, params.dt * params.absorption_rate * max(0.0, pore_cap - p.z));
  let water_final = water_post_evap - absorb_delta;
  let absorb_final = max(0.0, p.z + absorb_delta - params.dt * params.evaporation_rate * 0.35);

  let valley = 1.0 - p.x;
  let shallow_boost = 1.0 + 0.5 * (1.0 - clamp(water_after, 0.0, 1.0));
  let settle_frac = clamp(
    params.dt * params.granulation_rate * (0.05 + 1.95 * valley * valley) * shallow_boost,
    0.0,
    0.95,
  );
  var evap_ratio = 0.0;
  if (water_after > params.wet_eps) { evap_ratio = evap / water_after; }
  let deposit_delta = pigment_after * clamp(settle_frac + evap_ratio * 0.65, 0.0, 1.0);

  var out_vx = 0.0;
  var out_vy = 0.0;
  if (water_final > params.wet_eps) {
    out_vx = v.x;
    out_vy = v.y;
  }

  cell_out[idx] = vec4<f32>(water_final, out_vx, out_vy, pigment_after - deposit_delta);
  paper_out[idx] = vec4<f32>(p.x, p.y + deposit_delta, absorb_final, pore_cap);
}
`;
