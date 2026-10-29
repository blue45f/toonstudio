/**
 * MoXi 흐름층 한 스텝의 WGSL 컴퓨트 커널(실험 — 제품 경로에 연결하지 않는다).
 *
 * `studio-wet-paper-water.ts`의 흐름층 부분(다공성 부분 bounce-back 스트리밍 + 젖음 전선 고정 + 물막 두께
 * 투과 φ(ρ̄) + 모세관 흡입·종이 기울기·가장자리 바깥 흐름 가속 + BGK τ = 1 충돌 + 잔량 접힘)을 셀당 호출
 * 하나로 옮겼다. 표면·모세관 층 교환과 증발은 GPU 이식 때 별도 패스가 맡을 몫이라 여기서는 질량 목표를
 * ρ₁(스트리밍 뒤 밀도) 그대로 둔다. 링크 κ는 소유 셀 하나에 저장되므로(전방 E·S·SE·NE) 양 끝이 같은 κ를
 * 읽어 질량이 보존된다.
 *
 * 검증: `wesl`의 `link()`로 파싱·링크하고, 같은 식을 TypeScript로 옮긴 CPU 미러가 제품 물 패스(교환·증발을
 * 끈 구성)와 같은 분포를 내는지 `studio-wet-paper-lbm-wgsl.test.ts`가 확인한다. 이 파일은 테스트만
 * import 한다(Studio 진입 그래프·SVG 내보내기 폐포에 `@compute` 본문이 실리지 않는다).
 *
 * 레이아웃: 분포는 방향 우선(f[q·cells + i]), κ는 링크 클래스 우선(κ[c·cells + i]), 워크그룹 64, 1D 디스패치.
 */

/** 균일 버퍼 필드 순서(16바이트 정렬, f32/u32 16개 = 64 B). */
export const STUDIO_WET_PAPER_LBM_WGSL_PARAM_FIELDS = Object.freeze([
  "width",
  "height",
  "cells",
  "pad0",
  "rhoDry",
  "pinThreshold",
  "halfInvRhoFull",
  "surfaceTension",
  "uMax",
  "aMax",
  "capillaryForce",
  "slopeForce",
  "edgeFlow",
  "indicatorFull",
  "waterEps",
  "pad1",
] as const);

export const STUDIO_WET_PAPER_LBM_WGSL_WORKGROUP_SIZE = 64;
export const STUDIO_WET_PAPER_LBM_WGSL_ENTRY_POINT = "wet_paper_lbm_step";

export const STUDIO_WET_PAPER_LBM_WGSL = /* wgsl */ `
struct WetPaperLbmParams {
  width: u32,
  height: u32,
  cells: u32,
  pad0: u32,
  rho_dry: f32,
  pin_threshold: f32,
  half_inv_rho_full: f32,
  surface_tension: f32,
  u_max: f32,
  a_max: f32,
  capillary_force: f32,
  slope_force: f32,
  edge_flow: f32,
  indicator_full: f32,
  water_eps: f32,
  pad1: f32,
}

@group(0) @binding(0) var<uniform> params: WetPaperLbmParams;
@group(0) @binding(1) var<storage, read> f_in: array<f32>;
@group(0) @binding(2) var<storage, read_write> f_out: array<f32>;
@group(0) @binding(3) var<storage, read> rho_in: array<f32>;
@group(0) @binding(4) var<storage, read_write> rho_out: array<f32>;
@group(0) @binding(5) var<storage, read> kappa: array<f32>;
@group(0) @binding(6) var<storage, read> wall: array<u32>;
@group(0) @binding(7) var<storage, read> surface: array<f32>;
@group(0) @binding(8) var<storage, read> capillary: array<f32>;
@group(0) @binding(9) var<storage, read> inv_capacity: array<f32>;
@group(0) @binding(10) var<storage, read> paper_height: array<f32>;
@group(0) @binding(11) var<storage, read_write> velocity: array<vec2<f32>>;

struct StreamSum {
  rho: f32,
  jx: f32,
  jy: f32,
}

// 방향 q의 상류 셀 up = i − c_q 에서 들어오는 분포(부분 bounce-back · 젖음 전선 고정 · 물막 두께 투과).
fn stream_link(
  sum: StreamSum,
  i: u32,
  q: u32,
  opp: u32,
  link_class: u32,
  forward: bool,
  dx: i32,
  dy: i32,
  rho_here: f32,
) -> StreamSum {
  let cells = params.cells;
  let width = i32(params.width);
  let up = u32(i32(i) - (dy * width + dx));
  let bounced = f_in[opp * cells + i];
  var value = bounced;
  if (wall[up] == 0u) {
    var owner = i;
    if (forward) {
      owner = up;
    }
    let kappa_paper = kappa[link_class * cells + owner];
    let rho_up = rho_in[up];
    var link_kappa = kappa_paper;
    let lo = min(rho_up, rho_here);
    let hi = max(rho_up, rho_here);
    if (lo < params.rho_dry && hi < params.pin_threshold * (0.3 + kappa_paper)) {
      link_kappa = 1.0;
    } else {
      let fill = (rho_up + rho_here) * params.half_inv_rho_full;
      if (fill < 1.0) {
        let sigma = params.surface_tension;
        link_kappa = 1.0 - (1.0 - kappa_paper) * (fill * (1.0 - sigma + sigma * fill));
      }
    }
    value = (1.0 - link_kappa) * f_in[q * cells + up] + link_kappa * bounced;
  }
  return StreamSum(sum.rho + value, sum.jx + f32(dx) * value, sum.jy + f32(dy) * value);
}

fn indicator(cell: u32) -> f32 {
  let wet = surface[cell] + rho_in[cell];
  if (wet >= params.indicator_full) {
    return 1.0;
  }
  return wet / params.indicator_full;
}

fn clamp_magnitude(v: vec2<f32>, limit: f32) -> vec2<f32> {
  let m2 = dot(v, v);
  if (m2 > limit * limit) {
    return v * (limit / sqrt(m2));
  }
  return v;
}

fn write_cell(i: u32, values: array<f32, 9>, target_rho: f32, flow: vec2<f32>) {
  let cells = params.cells;
  // 값 배열은 지역 변수로 옮긴 뒤 동적 인덱스로 읽는다(값 배열의 동적 인덱싱을 피한다).
  var local = values;
  for (var q = 0u; q < 9u; q = q + 1u) {
    f_out[q * cells + i] = local[q];
  }
  rho_out[i] = target_rho;
  velocity[i] = flow;
}

@compute @workgroup_size(64)
fn wet_paper_lbm_step(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.cells) {
    return;
  }
  let zero = array<f32, 9>(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
  if (wall[i] != 0u) {
    write_cell(i, zero, 0.0, vec2<f32>(0.0, 0.0));
    return;
  }
  let cells = params.cells;
  let width = params.width;
  let rho_here = rho_in[i];

  // (1) 스트리밍: E S W N SE SW NW NE.
  var sum = StreamSum(f_in[i], 0.0, 0.0);
  sum = stream_link(sum, i, 1u, 3u, 0u, true, 1, 0, rho_here);
  sum = stream_link(sum, i, 2u, 4u, 1u, true, 0, 1, rho_here);
  sum = stream_link(sum, i, 3u, 1u, 0u, false, -1, 0, rho_here);
  sum = stream_link(sum, i, 4u, 2u, 1u, false, 0, -1, rho_here);
  sum = stream_link(sum, i, 5u, 7u, 2u, true, 1, 1, rho_here);
  sum = stream_link(sum, i, 6u, 8u, 3u, false, -1, 1, rho_here);
  sum = stream_link(sum, i, 7u, 5u, 2u, false, -1, -1, rho_here);
  sum = stream_link(sum, i, 8u, 6u, 3u, true, 1, -1, rho_here);

  // (2) 체적 가속: 모세관 흡입, 종이 기울기(골로), 가장자리 바깥 흐름.
  let east = i + 1u;
  let west = i - 1u;
  let south = i + width;
  let north = i - width;
  var accel = vec2<f32>(
    -params.capillary_force * 0.5 * (capillary[east] * inv_capacity[east] - capillary[west] * inv_capacity[west])
      - params.slope_force * 0.5 * (paper_height[east] - paper_height[west])
      - params.edge_flow * 0.5 * (indicator(east) - indicator(west)),
    -params.capillary_force * 0.5 * (capillary[south] * inv_capacity[south] - capillary[north] * inv_capacity[north])
      - params.slope_force * 0.5 * (paper_height[south] - paper_height[north])
      - params.edge_flow * 0.5 * (indicator(south) - indicator(north)),
  );
  accel = clamp_magnitude(accel, params.a_max);

  // (3) 거시 속도 u = j/ρ + a/2, 평형 속도 u_eq = j/ρ + τa (τ = 1), 마하 상한.
  var flow = vec2<f32>(0.0, 0.0);
  var eq = vec2<f32>(0.0, 0.0);
  if (sum.rho > 1e-7) {
    let inv = 1.0 / sum.rho;
    let momentum = vec2<f32>(sum.jx, sum.jy) * inv;
    flow = clamp_magnitude(momentum + 0.5 * accel, params.u_max);
    eq = clamp_magnitude(momentum + accel, params.u_max);
  }

  // (4) 잔량 접힘: 물이 거의 없으면 0으로 접는다(제품 패스는 이 양을 증발 장부에 넣는다).
  var target_rho = sum.rho;
  if (surface[i] + target_rho + capillary[i] < params.water_eps) {
    write_cell(i, zero, 0.0, vec2<f32>(0.0, 0.0));
    return;
  }

  // (5) BGK τ = 1 충돌: f_out = f_eq(목표 질량, u_eq), 나머지는 정지 분포에 더한다.
  var keep = 0.0;
  if (sum.rho > 0.0) {
    keep = 1.0;
    if (target_rho < sum.rho) {
      keep = target_rho / sum.rho;
    }
  }
  let scaled = sum.rho * keep;
  let face = scaled / 9.0;
  let diagonal = scaled / 36.0;
  let base = 1.0 - 1.5 * dot(eq, eq);
  let cu_e = 3.0 * eq.x;
  let cu_s = 3.0 * eq.y;
  let cu_se = 3.0 * (eq.x + eq.y);
  let cu_ne = 3.0 * (eq.x - eq.y);
  var values = array<f32, 9>(
    (4.0 / 9.0) * scaled * base,
    face * (base + cu_e + 0.5 * cu_e * cu_e),
    face * (base + cu_s + 0.5 * cu_s * cu_s),
    face * (base - cu_e + 0.5 * cu_e * cu_e),
    face * (base - cu_s + 0.5 * cu_s * cu_s),
    diagonal * (base + cu_se + 0.5 * cu_se * cu_se),
    diagonal * (base - cu_ne + 0.5 * cu_ne * cu_ne),
    diagonal * (base - cu_se + 0.5 * cu_se * cu_se),
    diagonal * (base + cu_ne + 0.5 * cu_ne * cu_ne),
  );
  var total = 0.0;
  for (var q = 0u; q < 9u; q = q + 1u) {
    total = total + values[q];
  }
  values[0] = max(values[0] + (target_rho - total), 0.0);
  if (target_rho <= 0.0) {
    flow = vec2<f32>(0.0, 0.0);
  }
  write_cell(i, values, target_rho, flow);
}
`;
