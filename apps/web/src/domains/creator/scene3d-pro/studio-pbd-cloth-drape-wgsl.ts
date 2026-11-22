/**
 * 경량 PBD 의상 주름·드레이프 솔버용 클린룸 WebGPU WGSL Compute 셰이더 및 버퍼 패킹/실행기.
 *
 * 그래프 컬러링된 독립 배치(vertex-disjoint batch) 구조로 데이터 경합과 float atomic 없이
 * 4단계 컴퓨트 패스를 순차 디스패치한다:
 *  1) `pbd_predict_positions`: 중력·공간-시간 바람 외력 + 감쇠 + 속도/변위 상한 가드
 *  2) `pbd_solve_distance_batch`: 구조·전단 XPBD 거리 제약 투영
 *  3) `pbd_solve_bending_batch`: 4정점 이면각(dihedral) 굽힘 제약 투영
 *  4) `pbd_project_colliders_and_integrate`: 구/캡슐 콜라이더·바닥 충돌 투영 + 마찰 + NaN 가드 적분
 *
 * 모든 수학식은 `studio-pbd-cloth-drape-solver.ts`의 CPU 솔버와 1:1 동일하다.
 */

export const STUDIO_PBD_CLOTH_WGSL_WORKGROUP_SIZE = 64;

export const STUDIO_PBD_CLOTH_WGSL_ENTRY_POINTS = Object.freeze({
  predictPositions: "pbd_predict_positions",
  solveDistanceBatch: "pbd_solve_distance_batch",
  solveBendingBatch: "pbd_solve_bending_batch",
  projectCollidersAndIntegrate: "pbd_project_colliders_and_integrate",
} as const);

/** 균일 버퍼 필드 순서(20 × 4 B = 80 B, 16바이트 정렬). */
export const STUDIO_PBD_CLOTH_WGSL_PARAM_FIELDS = Object.freeze([
  "particleCount",
  "colliderCount",
  "batchOffset",
  "batchCount",
  "subDt",
  "simTime",
  "dampingFactor",
  "maxSpeed",
  "gravityX",
  "gravityY",
  "gravityZ",
  "maxSubstepDisp",
  "windX",
  "windY",
  "windZ",
  "windGustFreq",
  "windTurbulence",
  "collisionMargin",
  "groundEnabled",
  "groundY",
] as const);

export const STUDIO_PBD_CLOTH_UNIFORM_BYTE_LENGTH = 80;
export const STUDIO_PBD_CLOTH_DISTANCE_STRIDE_BYTES = 16;
export const STUDIO_PBD_CLOTH_BENDING_STRIDE_BYTES = 32;
export const STUDIO_PBD_CLOTH_COLLIDER_STRIDE_BYTES = 32;

export const STUDIO_PBD_CLOTH_DRAPE_WGSL = /* wgsl */ `
struct PbdClothSimParams {
  particle_count: u32,
  collider_count: u32,
  batch_offset: u32,
  batch_count: u32,

  sub_dt: f32,
  sim_time: f32,
  damping_factor: f32,
  max_speed: f32,

  gravity_x: f32,
  gravity_y: f32,
  gravity_z: f32,
  max_substep_disp: f32,

  wind_x: f32,
  wind_y: f32,
  wind_z: f32,
  wind_gust_freq: f32,

  wind_turbulence: f32,
  collision_margin: f32,
  ground_enabled: u32,
  ground_y: f32,
}

struct PbdDistanceConstraintGpu {
  p1: u32,
  p2: u32,
  rest_length: f32,
  compliance: f32,
}

struct PbdBendingConstraintGpu {
  p1: u32,
  p2: u32,
  p3: u32,
  p4: u32,
  rest_angle: f32,
  compliance: f32,
  pad0: f32,
  pad1: f32,
}

struct PbdColliderGpu {
  start_x: f32,
  start_y: f32,
  start_z: f32,
  radius: f32,
  end_x: f32,
  end_y: f32,
  end_z: f32,
  friction: f32,
}

@group(0) @binding(0) var<uniform> params: PbdClothSimParams;
@group(0) @binding(1) var<storage, read_write> pos_inv_mass: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> pred_pos: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> vel_pad: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> distance_constraints: array<PbdDistanceConstraintGpu>;
@group(0) @binding(5) var<storage, read> bending_constraints: array<PbdBendingConstraintGpu>;
@group(0) @binding(6) var<storage, read> colliders: array<PbdColliderGpu>;

fn is_safe_vec3(v: vec3<f32>) -> bool {
  let limit = vec3<f32>(10000.0, 10000.0, 10000.0);
  return all(v == v) && all(abs(v) < limit);
}

fn clamp_vec3_length(v: vec3<f32>, max_len: f32) -> vec3<f32> {
  if (!is_safe_vec3(v)) {
    return vec3<f32>(0.0, 0.0, 0.0);
  }
  let len_sq = dot(v, v);
  let limit_sq = max_len * max_len;
  if (len_sq > limit_sq && len_sq > 1e-12) {
    return v * (max_len / sqrt(len_sq));
  }
  return v;
}

@compute @workgroup_size(64)
fn pbd_predict_positions(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.particle_count) {
    return;
  }

  let cur = pos_inv_mass[i];
  let inv_mass = cur.w;
  if (inv_mass <= 0.0) {
    pred_pos[i] = cur;
    vel_pad[i] = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    return;
  }

  let pos = cur.xyz;
  let vel_raw = vel_pad[i].xyz;
  let vel_safe = select(vec3<f32>(0.0, 0.0, 0.0), vel_raw, is_safe_vec3(vel_raw));

  let gust = 1.0 + 0.35 * sin(params.sim_time * 6.2831853 * params.wind_gust_freq + pos.x * 2.1 + pos.z * 1.7);
  let turb = params.wind_turbulence * (
    0.5 * sin(params.sim_time * 7.3 + pos.y * 3.1) +
    0.5 * cos(params.sim_time * 11.1 + pos.x * 2.7)
  );
  let wind_scale = gust + turb;

  let accel = vec3<f32>(
    params.gravity_x + params.wind_x * wind_scale,
    params.gravity_y + params.wind_y * wind_scale,
    params.gravity_z + params.wind_z * wind_scale
  );

  let next_vel = clamp_vec3_length((vel_safe + accel * params.sub_dt) * params.damping_factor, params.max_speed);
  let step_disp = clamp_vec3_length(next_vel * params.sub_dt, params.max_substep_disp);
  let next_pos = pos + step_disp;
  let safe_next = select(pos, next_pos, is_safe_vec3(next_pos));

  vel_pad[i] = vec4<f32>(next_vel, 0.0);
  pred_pos[i] = vec4<f32>(safe_next, inv_mass);
}

@compute @workgroup_size(64)
fn pbd_solve_distance_batch(@builtin(global_invocation_id) gid: vec3<u32>) {
  let local_idx = gid.x;
  if (local_idx >= params.batch_count) {
    return;
  }

  let c = distance_constraints[params.batch_offset + local_idx];
  let a = pred_pos[c.p1];
  let b = pred_pos[c.p2];
  let w1 = a.w;
  let w2 = b.w;
  let w_sum = w1 + w2;
  if (w_sum <= 1e-8) {
    return;
  }

  let diff = a.xyz - b.xyz;
  let dist = length(diff);
  if (dist <= 1e-6) {
    return;
  }

  let alpha_tilde = c.compliance / max(params.sub_dt * params.sub_dt, 1e-10);
  let c_err = dist - c.rest_length;
  let delta_lambda = -c_err / (w_sum + alpha_tilde);
  let corr = clamp_vec3_length((diff / dist) * delta_lambda, params.max_substep_disp);

  if (w1 > 0.0) {
    pred_pos[c.p1] = vec4<f32>(a.xyz + corr * w1, w1);
  }
  if (w2 > 0.0) {
    pred_pos[c.p2] = vec4<f32>(b.xyz - corr * w2, w2);
  }
}

@compute @workgroup_size(64)
fn pbd_solve_bending_batch(@builtin(global_invocation_id) gid: vec3<u32>) {
  let local_idx = gid.x;
  if (local_idx >= params.batch_count) {
    return;
  }

  let bc = bending_constraints[params.batch_offset + local_idx];
  let v1 = pred_pos[bc.p1];
  let v2 = pred_pos[bc.p2];
  let v3 = pred_pos[bc.p3];
  let v4 = pred_pos[bc.p4];
  let w1 = v1.w;
  let w2 = v2.w;
  let w3 = v3.w;
  let w4 = v4.w;
  if (w1 + w2 + w3 + w4 <= 1e-8) {
    return;
  }

  let e2 = v2.xyz - v1.xyz;
  let e3 = v3.xyz - v1.xyz;
  let e4 = v4.xyz - v1.xyz;
  let c1 = cross(e2, e3);
  let c2 = cross(e4, e2);
  let len1 = length(c1);
  let len2 = length(c2);
  if (len1 <= 1e-6 || len2 <= 1e-6) {
    return;
  }

  let n1 = c1 / len1;
  let n2 = c2 / len2;
  let d = clamp(dot(n1, n2), -0.999999, 0.999999);
  let angle = acos(d);
  let c_err = angle - bc.rest_angle;
  if (abs(c_err) <= 1e-5) {
    return;
  }

  let diff1 = n2 - n1 * d;
  let diff2 = n1 - n2 * d;
  let q3 = cross(diff1, e2) / len1;
  let q4 = cross(e2, diff2) / len2;
  let q2 = cross(e3, diff1) / len1 + cross(diff2, e4) / len2;
  let q1 = -(q2 + q3 + q4);

  let one_minus_d2 = max(0.0, 1.0 - d * d);
  let alpha_tilde = bc.compliance / max(params.sub_dt * params.sub_dt, 1e-10);
  let denom =
    w1 * dot(q1, q1) +
    w2 * dot(q2, q2) +
    w3 * dot(q3, q3) +
    w4 * dot(q4, q4) +
    alpha_tilde * one_minus_d2;
  if (denom <= 1e-10) {
    return;
  }

  let factor = (c_err * sqrt(one_minus_d2)) / denom;
  let max_bend_disp = params.max_substep_disp * 0.5;

  if (w1 > 0.0) {
    pred_pos[bc.p1] = vec4<f32>(v1.xyz + clamp_vec3_length(q1 * (w1 * factor), max_bend_disp), w1);
  }
  if (w2 > 0.0) {
    pred_pos[bc.p2] = vec4<f32>(v2.xyz + clamp_vec3_length(q2 * (w2 * factor), max_bend_disp), w2);
  }
  if (w3 > 0.0) {
    pred_pos[bc.p3] = vec4<f32>(v3.xyz + clamp_vec3_length(q3 * (w3 * factor), max_bend_disp), w3);
  }
  if (w4 > 0.0) {
    pred_pos[bc.p4] = vec4<f32>(v4.xyz + clamp_vec3_length(q4 * (w4 * factor), max_bend_disp), w4);
  }
}

@compute @workgroup_size(64)
fn pbd_project_colliders_and_integrate(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.particle_count) {
    return;
  }

  let prev = pos_inv_mass[i];
  let inv_mass = prev.w;
  if (inv_mass <= 0.0) {
    pred_pos[i] = prev;
    vel_pad[i] = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    return;
  }

  var p = pred_pos[i].xyz;
  if (!is_safe_vec3(p)) {
    p = prev.xyz;
  }
  p = prev.xyz + clamp_vec3_length(p - prev.xyz, params.max_substep_disp);

  for (var c_idx = 0u; c_idx < params.collider_count; c_idx = c_idx + 1u) {
    let col = colliders[c_idx];
    let s = vec3<f32>(col.start_x, col.start_y, col.start_z);
    let e = vec3<f32>(col.end_x, col.end_y, col.end_z);
    let ab = e - s;
    let ab_len_sq = dot(ab, ab);
    var t = 0.0;
    if (ab_len_sq > 1e-10) {
      t = clamp(dot(p - s, ab) / ab_len_sq, 0.0, 1.0);
    }
    let closest = s + ab * t;
    let delta = p - closest;
    let dist = length(delta);
    let target_r = max(0.0, col.radius) + params.collision_margin;
    if (dist < target_r) {
      let n = select(vec3<f32>(0.0, 1.0, 0.0), delta / max(dist, 1e-6), dist > 1e-6);
      p = closest + n * target_r;
      let disp = p - prev.xyz;
      let tang = disp - n * dot(disp, n);
      let friction = clamp(col.friction, 0.0, 1.0);
      p = p - tang * friction;
      let post_delta = p - closest;
      let post_dist = length(post_delta);
      if (post_dist < target_r) {
        let post_n = select(n, post_delta / max(post_dist, 1e-6), post_dist > 1e-6);
        p = closest + post_n * target_r;
      }
    }
  }

  if (params.ground_enabled != 0u) {
    let min_y = params.ground_y + params.collision_margin;
    if (p.y < min_y) {
      p.y = min_y;
      let slip_x = (p.x - prev.x) * 0.5;
      let slip_z = (p.z - prev.z) * 0.5;
      p.x = prev.x + slip_x;
      p.z = prev.z + slip_z;
    }
  }

  let final_pos = clamp(p, vec3<f32>(-1000.0), vec3<f32>(1000.0));
  let safe_pos = select(prev.xyz, final_pos, is_safe_vec3(final_pos));
  let inv_dt = 1.0 / max(params.sub_dt, 1e-6);
  let next_vel = clamp_vec3_length((safe_pos - prev.xyz) * inv_dt, params.max_speed);

  pos_inv_mass[i] = vec4<f32>(safe_pos, inv_mass);
  pred_pos[i] = vec4<f32>(safe_pos, inv_mass);
  vel_pad[i] = vec4<f32>(next_vel, 0.0);
}
`;

export interface PbdClothUniformValues {
  readonly particleCount: number;
  readonly colliderCount: number;
  readonly batchOffset: number;
  readonly batchCount: number;
  readonly subDt: number;
  readonly simTime: number;
  readonly dampingFactor: number;
  readonly maxSpeed: number;
  readonly gravity: readonly [number, number, number];
  readonly maxSubstepDisp: number;
  readonly wind: readonly [number, number, number];
  readonly windGustFreq: number;
  readonly windTurbulence: number;
  readonly collisionMargin: number;
  readonly groundY: number | null;
}

/** WGSL `PbdClothSimParams` 구조체와 1:1 일치하는 80바이트 균일 버퍼를 패킹한다. */
export function packPbdClothUniforms(
  values: PbdClothUniformValues,
  targetBuffer?: ArrayBuffer,
): ArrayBuffer {
  const buffer =
    targetBuffer && targetBuffer.byteLength >= STUDIO_PBD_CLOTH_UNIFORM_BYTE_LENGTH
      ? targetBuffer
      : new ArrayBuffer(STUDIO_PBD_CLOTH_UNIFORM_BYTE_LENGTH);
  const view = new DataView(buffer);

  view.setUint32(0, Math.max(0, Math.floor(values.particleCount)), true);
  view.setUint32(4, Math.max(0, Math.floor(values.colliderCount)), true);
  view.setUint32(8, Math.max(0, Math.floor(values.batchOffset)), true);
  view.setUint32(12, Math.max(0, Math.floor(values.batchCount)), true);

  view.setFloat32(16, values.subDt, true);
  view.setFloat32(20, values.simTime, true);
  view.setFloat32(24, values.dampingFactor, true);
  view.setFloat32(28, values.maxSpeed, true);

  view.setFloat32(32, values.gravity[0], true);
  view.setFloat32(36, values.gravity[1], true);
  view.setFloat32(40, values.gravity[2], true);
  view.setFloat32(44, values.maxSubstepDisp, true);

  view.setFloat32(48, values.wind[0], true);
  view.setFloat32(52, values.wind[1], true);
  view.setFloat32(56, values.wind[2], true);
  view.setFloat32(60, values.windGustFreq, true);

  view.setFloat32(64, values.windTurbulence, true);
  view.setFloat32(68, values.collisionMargin, true);
  view.setUint32(72, values.groundY !== null && Number.isFinite(values.groundY) ? 1 : 0, true);
  view.setFloat32(76, values.groundY !== null && Number.isFinite(values.groundY) ? values.groundY : 0, true);

  return buffer;
}

export interface PbdClothWebGpuPassDescriptor {
  readonly entryPoint: string;
  readonly workgroupCountX: number;
  readonly batchOffset: number;
  readonly batchCount: number;
}

/** 1회 서브스텝에 필요한 WebGPU Compute 디스패치 계획(패스 순서 및 워크그룹 수)을 생성한다. */
export function buildPbdClothWebGpuSubstepPlan(
  particleCount: number,
  distanceBatches: readonly { readonly offset: number; readonly count: number }[],
  bendingBatches: readonly { readonly offset: number; readonly count: number }[],
  solverIterations: number,
): readonly PbdClothWebGpuPassDescriptor[] {
  const passes: PbdClothWebGpuPassDescriptor[] = [];
  const particleWorkgroups = Math.max(1, Math.ceil(particleCount / STUDIO_PBD_CLOTH_WGSL_WORKGROUP_SIZE));

  passes.push({
    entryPoint: STUDIO_PBD_CLOTH_WGSL_ENTRY_POINTS.predictPositions,
    workgroupCountX: particleWorkgroups,
    batchOffset: 0,
    batchCount: particleCount,
  });

  const iters = Math.max(1, Math.floor(solverIterations));
  for (let iter = 0; iter < iters; iter += 1) {
    for (const batch of distanceBatches) {
      if (batch.count <= 0) continue;
      passes.push({
        entryPoint: STUDIO_PBD_CLOTH_WGSL_ENTRY_POINTS.solveDistanceBatch,
        workgroupCountX: Math.ceil(batch.count / STUDIO_PBD_CLOTH_WGSL_WORKGROUP_SIZE),
        batchOffset: batch.offset,
        batchCount: batch.count,
      });
    }
    for (const batch of bendingBatches) {
      if (batch.count <= 0) continue;
      passes.push({
        entryPoint: STUDIO_PBD_CLOTH_WGSL_ENTRY_POINTS.solveBendingBatch,
        workgroupCountX: Math.ceil(batch.count / STUDIO_PBD_CLOTH_WGSL_WORKGROUP_SIZE),
        batchOffset: batch.offset,
        batchCount: batch.count,
      });
    }
  }

  passes.push({
    entryPoint: STUDIO_PBD_CLOTH_WGSL_ENTRY_POINTS.projectCollidersAndIntegrate,
    workgroupCountX: particleWorkgroups,
    batchOffset: 0,
    batchCount: particleCount,
  });

  return passes;
}

export interface PbdClothGpuPackInput {
  readonly particleCount: number;
  readonly positions: Float32Array;
  readonly predicted: Float32Array;
  readonly velocities: Float32Array;
  readonly invMasses: Float32Array;
  readonly orderedDistance: readonly {
    readonly p1: number;
    readonly p2: number;
    readonly restLength: number;
    readonly compliance: number;
  }[];
  readonly orderedBending: readonly {
    readonly p1: number;
    readonly p2: number;
    readonly p3: number;
    readonly p4: number;
    readonly restAngle: number;
    readonly compliance: number;
  }[];
  readonly colliders: readonly {
    readonly sx: number;
    readonly sy: number;
    readonly sz: number;
    readonly ex: number;
    readonly ey: number;
    readonly ez: number;
    readonly radius: number;
    readonly friction: number;
  }[];
  readonly distanceBatches: readonly { readonly offset: number; readonly count: number }[];
  readonly bendingBatches: readonly { readonly offset: number; readonly count: number }[];
  readonly solverIterations: number;
}

export interface PbdClothWebGpuBufferBundle {
  readonly posInvMass: Float32Array;
  readonly predPos: Float32Array;
  readonly velPad: Float32Array;
  readonly distanceConstraintsBuffer: ArrayBuffer;
  readonly bendingConstraintsBuffer: ArrayBuffer;
  readonly collidersBuffer: ArrayBuffer;
  readonly distanceBatches: readonly { readonly offset: number; readonly count: number }[];
  readonly bendingBatches: readonly { readonly offset: number; readonly count: number }[];
  readonly substepPlan: readonly PbdClothWebGpuPassDescriptor[];
}

/** WebGPU Compute 디스패치용 16바이트 정렬 버퍼 번들과 패스 계획을 패킹한다. */
export function packPbdClothWebGpuBuffers(input: PbdClothGpuPackInput): PbdClothWebGpuBufferBundle {
  const n = input.particleCount;
  const posInvMass = new Float32Array(n * 4);
  const predPos = new Float32Array(n * 4);
  const velPad = new Float32Array(n * 4);

  for (let i = 0; i < n; i += 1) {
    posInvMass[i * 4] = input.positions[i * 3] ?? 0;
    posInvMass[i * 4 + 1] = input.positions[i * 3 + 1] ?? 0;
    posInvMass[i * 4 + 2] = input.positions[i * 3 + 2] ?? 0;
    posInvMass[i * 4 + 3] = input.invMasses[i] ?? 0;

    predPos[i * 4] = input.predicted[i * 3] ?? 0;
    predPos[i * 4 + 1] = input.predicted[i * 3 + 1] ?? 0;
    predPos[i * 4 + 2] = input.predicted[i * 3 + 2] ?? 0;
    predPos[i * 4 + 3] = input.invMasses[i] ?? 0;

    velPad[i * 4] = input.velocities[i * 3] ?? 0;
    velPad[i * 4 + 1] = input.velocities[i * 3 + 1] ?? 0;
    velPad[i * 4 + 2] = input.velocities[i * 3 + 2] ?? 0;
    velPad[i * 4 + 3] = 0;
  }

  const distBuf = new ArrayBuffer(
    Math.max(1, input.orderedDistance.length) * STUDIO_PBD_CLOTH_DISTANCE_STRIDE_BYTES,
  );
  const distView = new DataView(distBuf);
  for (let i = 0; i < input.orderedDistance.length; i += 1) {
    const c = input.orderedDistance[i];
    if (!c) continue;
    const base = i * STUDIO_PBD_CLOTH_DISTANCE_STRIDE_BYTES;
    distView.setUint32(base, c.p1, true);
    distView.setUint32(base + 4, c.p2, true);
    distView.setFloat32(base + 8, c.restLength, true);
    distView.setFloat32(base + 12, c.compliance, true);
  }

  const bendBuf = new ArrayBuffer(
    Math.max(1, input.orderedBending.length) * STUDIO_PBD_CLOTH_BENDING_STRIDE_BYTES,
  );
  const bendView = new DataView(bendBuf);
  for (let i = 0; i < input.orderedBending.length; i += 1) {
    const b = input.orderedBending[i];
    if (!b) continue;
    const base = i * STUDIO_PBD_CLOTH_BENDING_STRIDE_BYTES;
    bendView.setUint32(base, b.p1, true);
    bendView.setUint32(base + 4, b.p2, true);
    bendView.setUint32(base + 8, b.p3, true);
    bendView.setUint32(base + 12, b.p4, true);
    bendView.setFloat32(base + 16, b.restAngle, true);
    bendView.setFloat32(base + 20, b.compliance, true);
    bendView.setFloat32(base + 24, 0, true);
    bendView.setFloat32(base + 28, 0, true);
  }

  const colBuf = new ArrayBuffer(
    Math.max(1, input.colliders.length) * STUDIO_PBD_CLOTH_COLLIDER_STRIDE_BYTES,
  );
  const colView = new DataView(colBuf);
  for (let i = 0; i < input.colliders.length; i += 1) {
    const col = input.colliders[i];
    if (!col) continue;
    const base = i * STUDIO_PBD_CLOTH_COLLIDER_STRIDE_BYTES;
    colView.setFloat32(base, col.sx, true);
    colView.setFloat32(base + 4, col.sy, true);
    colView.setFloat32(base + 8, col.sz, true);
    colView.setFloat32(base + 12, col.radius, true);
    colView.setFloat32(base + 16, col.ex, true);
    colView.setFloat32(base + 20, col.ey, true);
    colView.setFloat32(base + 24, col.ez, true);
    colView.setFloat32(base + 28, col.friction, true);
  }

  return {
    posInvMass,
    predPos,
    velPad,
    distanceConstraintsBuffer: distBuf,
    bendingConstraintsBuffer: bendBuf,
    collidersBuffer: colBuf,
    distanceBatches: input.distanceBatches,
    bendingBatches: input.bendingBatches,
    substepPlan: buildPbdClothWebGpuSubstepPlan(
      n,
      input.distanceBatches,
      input.bendingBatches,
      input.solverIterations,
    ),
  };
}
