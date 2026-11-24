/**
 * Wave 37D — XPBD 헤어·의상 물리 타입 계약, 휴머노이드 5종 캡슐 콜라이더,
 * 0mm 비관통 다중 패스 투영, 초기 리그 생성기 및 WebGPU std140/std430 버퍼 패커.
 */

import { XPBD_WORKGROUP_SIZE } from "./wgsl-shaders";

export type Vec3 = readonly [number, number, number];

export type CapsuleColliderId =
  | "head"
  | "neck"
  | "left_shoulder"
  | "right_shoulder"
  | "torso";

export interface CapsuleCollider {
  readonly id: CapsuleColliderId;
  readonly labelKo: string;
  readonly a: Vec3;
  readonly b: Vec3;
  readonly radius: number;
}

export interface XpbdParticle {
  readonly id: number;
  readonly strandIndex: number;
  readonly segmentIndex: number;
  readonly kind: "hair" | "cloth";
  readonly pos: Vec3;
  readonly prevPos: Vec3;
  readonly vel: Vec3;
  readonly invMass: number;
  readonly radius: number;
}

export interface XpbdDistanceConstraint {
  readonly a: number;
  readonly b: number;
  readonly restLength: number;
  readonly compliance: number;
  readonly maxStretchRatio: number;
  readonly lambda: number;
}

export interface XpbdBendingConstraint {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly restSpan: number;
  readonly compliance: number;
  readonly lambda: number;
}

export interface XpbdWindConfig {
  readonly strengthMps: number;
  readonly azimuthDeg: number;
  readonly gustTurbulence: number;
  readonly gustFrequencyHz: number;
}

export interface XpbdSimulationConfig {
  readonly dtSec: number;
  readonly substeps: number;
  readonly constraintIterations: number;
  readonly gravityMps2: number;
  readonly damping: number;
  readonly clothStiffness: number;
  readonly hairStiffness: number;
  readonly maxStretchRatio: number;
  readonly surfaceClearanceMm: number;
  readonly wind: XpbdWindConfig;
}

export interface XpbdSimulationState {
  readonly stepIndex: number;
  readonly elapsedSec: number;
  readonly particles: readonly XpbdParticle[];
  readonly distanceConstraints: readonly XpbdDistanceConstraint[];
  readonly bendingConstraints: readonly XpbdBendingConstraint[];
  readonly colliders: readonly CapsuleCollider[];
  readonly restPositions: readonly Vec3[];
}

export interface XpbdCollisionReport {
  readonly penetrationMm: number;
  readonly rawPenetrationBeforeProjectMm: number;
  readonly contactCount: number;
  readonly perColliderContacts: Readonly<Record<CapsuleColliderId, number>>;
  readonly minSurfaceMarginMm: number;
}

export interface XpbdStepMetrics {
  readonly stepIndex: number;
  readonly elapsedSec: number;
  readonly penetrationMm: number;
  readonly rawPenetrationBeforeProjectMm: number;
  readonly contactCount: number;
  readonly maxStretchRatioObserved: number;
  readonly meanTipDisplacementMm: number;
  readonly kineticEnergyJ: number;
  readonly maxSpeedMps: number;
  readonly stable: boolean;
  readonly stateHashHex: string;
}

export interface XpbdStepResult {
  readonly state: XpbdSimulationState;
  readonly collision: XpbdCollisionReport;
  readonly metrics: XpbdStepMetrics;
}

export interface XpbdGpuBufferPack {
  readonly uniformF32: Float32Array;
  readonly particleF32: Float32Array;
  readonly colliderF32: Float32Array;
  readonly distanceConstraintU32: Uint32Array;
  readonly bendingConstraintU32: Uint32Array;
  readonly workgroupCountX: number;
}

const DEG_TO_RAD = Math.PI / 180;
const PARTICLE_MASS_KG = 0.008;

export const f32 = (v: number): number => Math.fround(v);

export function clampNum(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function stiffnessToDistanceCompliance(stiffness: number): number {
  const s = clampNum(stiffness, 0, 1);
  return f32(0.00001 + (1 - s) * (1 - s) * 0.00399);
}

export function stiffnessToBendingCompliance(stiffness: number): number {
  const s = clampNum(stiffness, 0, 1);
  return f32(0.00015 + (1 - s) * (1 - s) * 0.028);
}

export const DEFAULT_XPBD_CONFIG: XpbdSimulationConfig = Object.freeze({
  dtSec: 1 / 60,
  substeps: 6,
  constraintIterations: 4,
  gravityMps2: 9.81,
  damping: 0.14,
  clothStiffness: 0.72,
  hairStiffness: 0.64,
  maxStretchRatio: 1.08,
  surfaceClearanceMm: 1.5,
  wind: Object.freeze({
    strengthMps: 3.4,
    azimuthDeg: 25,
    gustTurbulence: 0.35,
    gustFrequencyHz: 1.35,
  }),
});

/**
 * 표준 휴머노이드 VRM 상체(미터 단위, Y-up) 5종 캡슐 콜라이더를 생성한다.
 */
export function createDefaultHumanoidCapsuleColliders(): readonly CapsuleCollider[] {
  return Object.freeze([
    Object.freeze({
      id: "head" as const,
      labelKo: "머리 캡슐",
      a: Object.freeze([0, 1.54, 0.005] as const),
      b: Object.freeze([0, 1.63, 0.005] as const),
      radius: 0.095,
    }),
    Object.freeze({
      id: "neck" as const,
      labelKo: "목 캡슐",
      a: Object.freeze([0, 1.41, 0] as const),
      b: Object.freeze([0, 1.51, 0] as const),
      radius: 0.056,
    }),
    Object.freeze({
      id: "left_shoulder" as const,
      labelKo: "왼어깨 캡슐",
      a: Object.freeze([-0.06, 1.39, 0] as const),
      b: Object.freeze([-0.185, 1.36, -0.005] as const),
      radius: 0.062,
    }),
    Object.freeze({
      id: "right_shoulder" as const,
      labelKo: "오른어깨 캡슐",
      a: Object.freeze([0.06, 1.39, 0] as const),
      b: Object.freeze([0.185, 1.36, -0.005] as const),
      radius: 0.062,
    }),
    Object.freeze({
      id: "torso" as const,
      labelKo: "상체 캡슐",
      a: Object.freeze([0, 1.04, 0] as const),
      b: Object.freeze([0, 1.37, 0.004] as const),
      radius: 0.118,
    }),
  ]);
}

function closestPointOnSegment(p: Vec3, a: Vec3, b: Vec3): Vec3 {
  const abx = f32(b[0] - a[0]);
  const aby = f32(b[1] - a[1]);
  const abz = f32(b[2] - a[2]);
  const abLenSq = f32(abx * abx + aby * aby + abz * abz);
  if (abLenSq <= 1e-8) return a;
  const t = f32(
    clampNum(
      (f32(p[0] - a[0]) * abx + f32(p[1] - a[1]) * aby + f32(p[2] - a[2]) * abz) / abLenSq,
      0,
      1,
    ),
  );
  return [f32(a[0] + abx * t), f32(a[1] + aby * t), f32(a[2] + abz * t)];
}

function signedDistanceToCapsule(
  p: Vec3,
  particleRadius: number,
  capsule: CapsuleCollider,
): { readonly dist: number; readonly surfaceDist: number; readonly closest: Vec3 } {
  const closest = closestPointOnSegment(p, capsule.a, capsule.b);
  const dx = f32(p[0] - closest[0]);
  const dy = f32(p[1] - closest[1]);
  const dz = f32(p[2] - closest[2]);
  return {
    dist: f32(Math.sqrt(dx * dx + dy * dy + dz * dz)),
    surfaceDist: f32(capsule.radius + particleRadius),
    closest,
  };
}

/**
 * 단일 입자를 5종 캡슐 콜라이더 전체 바깥으로 다중 패스 투영해 0mm 비관통을 보장한다.
 */
export function projectPointOutOfColliders(
  pos: Vec3,
  particleRadius: number,
  colliders: readonly CapsuleCollider[],
  clearanceM: number,
): {
  readonly pos: Vec3;
  readonly rawPenetrationMm: number;
  readonly hitColliderIds: readonly CapsuleColliderId[];
} {
  let px = f32(pos[0]);
  let py = f32(pos[1]);
  let pz = f32(pos[2]);
  let rawPenetrationMm = 0;
  const hitSet = new Set<CapsuleColliderId>();

  for (const cap of colliders) {
    const check = signedDistanceToCapsule([px, py, pz], particleRadius, cap);
    if (check.dist < check.surfaceDist) {
      rawPenetrationMm = Math.max(rawPenetrationMm, (check.surfaceDist - check.dist) * 1000);
      hitSet.add(cap.id);
    }
  }

  const targetExtra = f32(Math.max(clearanceM, 0.0005));

  for (let pass = 0; pass < 10; pass += 1) {
    let anyViolated = false;
    let sumNx = 0;
    let sumNy = 0;
    let sumNz = 0;
    let maxDeficit = 0;

    for (const cap of colliders) {
      const { dist, surfaceDist, closest } = signedDistanceToCapsule([px, py, pz], particleRadius, cap);
      const minDist = f32(surfaceDist + targetExtra);
      if (dist >= minDist) continue;

      anyViolated = true;
      hitSet.add(cap.id);
      const deficit = f32(minDist - dist);
      let nx: number;
      let ny: number;
      let nz: number;
      if (dist > 1e-6) {
        nx = f32((px - closest[0]) / dist);
        ny = f32((py - closest[1]) / dist);
        nz = f32((pz - closest[2]) / dist);
      } else {
        const radialLen = Math.hypot(px, pz);
        if (radialLen > 1e-5) {
          nx = f32(px / radialLen);
          ny = 0.2;
          nz = f32(pz / radialLen);
        } else {
          nx = 0;
          ny = 0.25;
          nz = 0.9682;
        }
      }

      if (pass < 6) {
        const push = f32(minDist + 0.00012);
        px = f32(closest[0] + nx * push);
        py = f32(closest[1] + ny * push);
        pz = f32(closest[2] + nz * push);
      } else {
        sumNx += nx;
        sumNy += ny;
        sumNz += nz;
        maxDeficit = Math.max(maxDeficit, deficit);
      }
    }

    if (!anyViolated) break;
    if (pass >= 6) {
      let len = Math.hypot(sumNx, sumNy, sumNz);
      if (len < 1e-5) {
        sumNx = px >= 0 ? 0.6 : -0.6;
        sumNy = 0.25;
        sumNz = 0.76;
        len = Math.hypot(sumNx, sumNy, sumNz);
      }
      const step = f32(maxDeficit + 0.0015);
      px = f32(px + (sumNx / len) * step);
      py = f32(py + (sumNy / len) * step);
      pz = f32(pz + (sumNz / len) * step);
    }
  }

  return {
    pos: [px, py, pz],
    rawPenetrationMm,
    hitColliderIds: [...hitSet],
  };
}

/**
 * 5종 휴머노이드 캡슐 콜라이더 대비 현재 입자 전체의 관통 오차(mm)를 계측한다.
 */
export function auditCapsulePenetration(
  particles: readonly XpbdParticle[],
  colliders: readonly CapsuleCollider[],
  rawPenetrationBeforeProjectMm = 0,
  perColliderOverride?: Readonly<Record<CapsuleColliderId, number>>,
): XpbdCollisionReport {
  const perColliderContacts: Record<CapsuleColliderId, number> = {
    head: perColliderOverride?.head ?? 0,
    neck: perColliderOverride?.neck ?? 0,
    left_shoulder: perColliderOverride?.left_shoulder ?? 0,
    right_shoulder: perColliderOverride?.right_shoulder ?? 0,
    torso: perColliderOverride?.torso ?? 0,
  };
  let maxPenetrationMm = 0;
  let minMarginMm = Number.POSITIVE_INFINITY;
  let totalContacts = perColliderOverride
    ? Object.values(perColliderOverride).reduce((acc, v) => acc + v, 0)
    : 0;

  for (const p of particles) {
    if (p.invMass <= 0) continue;
    for (const cap of colliders) {
      const { dist, surfaceDist } = signedDistanceToCapsule(p.pos, p.radius, cap);
      const marginMm = (dist - surfaceDist) * 1000;
      if (marginMm < minMarginMm) minMarginMm = marginMm;
      if (marginMm < 0 && -marginMm > maxPenetrationMm) {
        maxPenetrationMm = -marginMm;
      }
      if (!perColliderOverride && marginMm <= 3.0) {
        perColliderContacts[cap.id] += 1;
        totalContacts += 1;
      }
    }
  }

  return Object.freeze({
    penetrationMm: maxPenetrationMm <= 1e-6 ? 0 : Number(maxPenetrationMm.toFixed(4)),
    rawPenetrationBeforeProjectMm: Number(rawPenetrationBeforeProjectMm.toFixed(3)),
    contactCount: totalContacts,
    perColliderContacts: Object.freeze(perColliderContacts),
    minSurfaceMarginMm: Number.isFinite(minMarginMm) ? Number(minMarginMm.toFixed(3)) : 0,
  });
}

/**
 * 8가닥 롱헤어(56입자) + 양어깨 의상 스트립(20입자) 기본 XPBD 리그를 생성한다.
 */
export function createDefaultXpbdRigState(
  config: Partial<XpbdSimulationConfig> = {},
): XpbdSimulationState {
  const merged: XpbdSimulationConfig = {
    ...DEFAULT_XPBD_CONFIG,
    ...config,
    wind: { ...DEFAULT_XPBD_CONFIG.wind, ...config.wind },
  };
  const colliders = createDefaultHumanoidCapsuleColliders();
  const clearanceM = clampNum(merged.surfaceClearanceMm, 0.5, 10) / 1000;
  const hairDistComp = stiffnessToDistanceCompliance(merged.hairStiffness);
  const hairBendComp = stiffnessToBendingCompliance(merged.hairStiffness);
  const clothDistComp = stiffnessToDistanceCompliance(merged.clothStiffness);
  const clothBendComp = stiffnessToBendingCompliance(merged.clothStiffness);

  const particles: XpbdParticle[] = [];
  const distanceConstraints: XpbdDistanceConstraint[] = [];
  const bendingConstraints: XpbdBendingConstraint[] = [];

  const hairAnglesDeg = [-135, -98, -68, -38, 38, 68, 98, 135] as const;
  let nextId = 0;

  for (let sIdx = 0; sIdx < hairAnglesDeg.length; sIdx += 1) {
    const angleRad = (hairAnglesDeg[sIdx] ?? 0) * DEG_TO_RAD;
    const rx = Math.sin(angleRad);
    const rz = Math.cos(angleRad);
    for (let seg = 0; seg < 7; seg += 1) {
      const flare = 1 + seg * 0.085;
      const pos = projectPointOutOfColliders(
        [f32(rx * 0.106 * flare), f32(1.665 - seg * 0.056), f32(0.005 + rz * 0.106 * flare)],
        0.0045,
        colliders,
        clearanceM,
      ).pos;
      particles.push({
        id: nextId,
        strandIndex: sIdx,
        segmentIndex: seg,
        kind: "hair",
        pos,
        prevPos: pos,
        vel: [0, 0, 0],
        invMass: seg === 0 ? 0 : f32(1 / PARTICLE_MASS_KG),
        radius: 0.0045,
      });
      if (seg > 0) {
        const prev = particles[nextId - 1];
        if (prev) {
          const restLength = f32(
            Math.hypot(pos[0] - prev.pos[0], pos[1] - prev.pos[1], pos[2] - prev.pos[2]),
          );
          distanceConstraints.push({
            a: nextId - 1,
            b: nextId,
            restLength: Math.max(0.02, restLength),
            compliance: hairDistComp,
            maxStretchRatio: merged.maxStretchRatio,
            lambda: 0,
          });
        }
      }
      if (seg >= 2) {
        const pA = particles[nextId - 2];
        if (pA) {
          const restSpan = f32(
            Math.hypot(pos[0] - pA.pos[0], pos[1] - pA.pos[1], pos[2] - pA.pos[2]),
          );
          bendingConstraints.push({
            a: nextId - 2,
            b: nextId - 1,
            c: nextId,
            restSpan: Math.max(0.035, restSpan),
            compliance: hairBendComp,
            lambda: 0,
          });
        }
      }
      nextId += 1;
    }
  }

  const clothColumnsX = [-0.17, -0.105, 0.105, 0.17] as const;
  const clothGridIds: number[][] = [];
  for (let col = 0; col < clothColumnsX.length; col += 1) {
    const colIds: number[] = [];
    const baseX = clothColumnsX[col] ?? 0;
    const strandIndex = hairAnglesDeg.length + col;
    for (let row = 0; row < 5; row += 1) {
      const pos = projectPointOutOfColliders(
        [f32(baseX * (1 + row * 0.045)), f32(1.445 - row * 0.062), f32(-0.088 - row * 0.014)],
        0.0055,
        colliders,
        clearanceM,
      ).pos;
      particles.push({
        id: nextId,
        strandIndex,
        segmentIndex: row,
        kind: "cloth",
        pos,
        prevPos: pos,
        vel: [0, 0, 0],
        invMass: row === 0 ? 0 : f32(1 / (PARTICLE_MASS_KG * 1.35)),
        radius: 0.0055,
      });
      colIds.push(nextId);
      if (row > 0) {
        const prev = particles[nextId - 1];
        if (prev) {
          const restLength = f32(
            Math.hypot(pos[0] - prev.pos[0], pos[1] - prev.pos[1], pos[2] - prev.pos[2]),
          );
          distanceConstraints.push({
            a: nextId - 1,
            b: nextId,
            restLength: Math.max(0.02, restLength),
            compliance: clothDistComp,
            maxStretchRatio: merged.maxStretchRatio,
            lambda: 0,
          });
        }
      }
      if (row >= 2) {
        const pA = particles[nextId - 2];
        if (pA) {
          const restSpan = f32(
            Math.hypot(pos[0] - pA.pos[0], pos[1] - pA.pos[1], pos[2] - pA.pos[2]),
          );
          bendingConstraints.push({
            a: nextId - 2,
            b: nextId - 1,
            c: nextId,
            restSpan: Math.max(0.04, restSpan),
            compliance: clothBendComp,
            lambda: 0,
          });
        }
      }
      nextId += 1;
    }
    clothGridIds.push(colIds);
  }

  for (const [colA, colB] of [[0, 1], [2, 3]] as const) {
    const idsA = clothGridIds[colA];
    const idsB = clothGridIds[colB];
    if (!idsA || !idsB) continue;
    for (let row = 1; row < 5; row += 1) {
      const idA = idsA[row];
      const idB = idsB[row];
      if (idA === undefined || idB === undefined) continue;
      const pA = particles[idA];
      const pB = particles[idB];
      if (!pA || !pB) continue;
      const restLength = f32(
        Math.hypot(pB.pos[0] - pA.pos[0], pB.pos[1] - pA.pos[1], pB.pos[2] - pA.pos[2]),
      );
      distanceConstraints.push({
        a: idA,
        b: idB,
        restLength: Math.max(0.02, restLength),
        compliance: clothDistComp,
        maxStretchRatio: merged.maxStretchRatio,
        lambda: 0,
      });
    }
  }

  return Object.freeze({
    stepIndex: 0,
    elapsedSec: 0,
    particles: Object.freeze(particles),
    distanceConstraints: Object.freeze(distanceConstraints),
    bendingConstraints: Object.freeze(bendingConstraints),
    colliders,
    restPositions: Object.freeze(particles.map((p) => p.pos)),
  });
}

/**
 * XPBD 상태와 파라미터를 WebGPU std140/std430 16바이트 정렬 버퍼로 패킹한다.
 */
export function packXpbdGpuBuffers(
  state: XpbdSimulationState,
  config: XpbdSimulationConfig = DEFAULT_XPBD_CONFIG,
): XpbdGpuBufferPack {
  const uniformF32 = new Float32Array(16);
  const uniformU32 = new Uint32Array(uniformF32.buffer);
  const dtSub = f32(config.dtSec / Math.max(1, config.substeps));
  const azRad = config.wind.azimuthDeg * DEG_TO_RAD;
  const gustAmp = f32(
    clampNum(config.wind.gustTurbulence, 0, 1) *
      (0.35 + (clampNum(config.wind.strengthMps, 0, 22) / 18) * 0.65) *
      4.8,
  );

  uniformF32[0] = dtSub;
  uniformF32[1] = f32(config.gravityMps2);
  uniformF32[2] = f32(config.damping);
  uniformF32[3] = f32(config.surfaceClearanceMm / 1000);
  uniformF32[4] = f32(Math.cos(azRad) * config.wind.strengthMps);
  uniformF32[5] = 0;
  uniformF32[6] = f32(Math.sin(azRad) * config.wind.strengthMps);
  uniformF32[7] = gustAmp;
  uniformF32[8] = f32(2 * Math.PI * config.wind.gustFrequencyHz * state.elapsedSec);
  uniformF32[9] = f32(config.maxStretchRatio);
  uniformU32[10] = state.particles.length;
  uniformU32[11] = state.colliders.length;
  uniformU32[12] = state.distanceConstraints.length;
  uniformU32[13] = state.bendingConstraints.length;

  const particleF32 = new Float32Array(state.particles.length * 12);
  for (let i = 0; i < state.particles.length; i += 1) {
    const p = state.particles[i];
    if (!p) continue;
    const base = i * 12;
    particleF32[base] = f32(p.pos[0]);
    particleF32[base + 1] = f32(p.pos[1]);
    particleF32[base + 2] = f32(p.pos[2]);
    particleF32[base + 3] = f32(p.invMass);
    particleF32[base + 4] = f32(p.prevPos[0]);
    particleF32[base + 5] = f32(p.prevPos[1]);
    particleF32[base + 6] = f32(p.prevPos[2]);
    particleF32[base + 7] = f32(p.radius);
    particleF32[base + 8] = f32(p.vel[0]);
    particleF32[base + 9] = f32(p.vel[1]);
    particleF32[base + 10] = f32(p.vel[2]);
    particleF32[base + 11] = p.kind === "cloth" ? 1 : 0;
  }

  const colliderF32 = new Float32Array(state.colliders.length * 8);
  for (let i = 0; i < state.colliders.length; i += 1) {
    const c = state.colliders[i];
    if (!c) continue;
    const base = i * 8;
    colliderF32[base] = f32(c.a[0]);
    colliderF32[base + 1] = f32(c.a[1]);
    colliderF32[base + 2] = f32(c.a[2]);
    colliderF32[base + 3] = f32(c.radius);
    colliderF32[base + 4] = f32(c.b[0]);
    colliderF32[base + 5] = f32(c.b[1]);
    colliderF32[base + 6] = f32(c.b[2]);
    colliderF32[base + 7] = 0;
  }

  const distanceConstraintU32 = new Uint32Array(state.distanceConstraints.length * 4);
  const distF32 = new Float32Array(distanceConstraintU32.buffer);
  for (let i = 0; i < state.distanceConstraints.length; i += 1) {
    const dc = state.distanceConstraints[i];
    if (!dc) continue;
    const base = i * 4;
    distanceConstraintU32[base] = dc.a;
    distanceConstraintU32[base + 1] = dc.b;
    distF32[base + 2] = f32(dc.restLength);
    distF32[base + 3] = f32(dc.compliance);
  }

  const bendingConstraintU32 = new Uint32Array(state.bendingConstraints.length * 8);
  const bendF32 = new Float32Array(bendingConstraintU32.buffer);
  for (let i = 0; i < state.bendingConstraints.length; i += 1) {
    const bc = state.bendingConstraints[i];
    if (!bc) continue;
    const base = i * 8;
    bendingConstraintU32[base] = bc.a;
    bendingConstraintU32[base + 1] = bc.b;
    bendingConstraintU32[base + 2] = bc.c;
    bendF32[base + 3] = f32(bc.restSpan);
    bendF32[base + 4] = f32(bc.compliance);
  }

  return Object.freeze({
    uniformF32,
    particleF32,
    colliderF32,
    distanceConstraintU32,
    bendingConstraintU32,
    workgroupCountX: Math.max(1, Math.ceil(state.particles.length / XPBD_WORKGROUP_SIZE)),
  });
}
