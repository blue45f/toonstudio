/**
 * WebGPU 컴퓨트 XPBD(Extended Position Based Dynamics) 실시간 헤어·의상 물리 충돌 솔버.
 *
 * - WGSL `@compute` 셰이더(`XPBD_HAIR_CLOTH_WGSL`)와 구조 검증기(`validateWgslComputeShader`)를 재수출한다.
 * - IEEE-754 `f32`(`Math.fround`) 연산 기반 다중 서브스텝 솔버로 5종 휴머노이드 캡슐 콜라이더 대비
 *   0mm 비관통(`penetrationMm === 0`)과 비트 일치 결정론을 보장한다.
 */

import {
  DEFAULT_XPBD_CONFIG,
  auditCapsulePenetration,
  clampNum,
  f32,
  projectPointOutOfColliders,
  stiffnessToBendingCompliance,
  stiffnessToDistanceCompliance,
  type CapsuleColliderId,
  type XpbdParticle,
  type XpbdSimulationConfig,
  type XpbdSimulationState,
  type XpbdStepMetrics,
  type XpbdStepResult,
} from "./xpbd-types-and-rig";

export {
  XPBD_HAIR_CLOTH_WGSL,
  XPBD_WORKGROUP_SIZE,
  buildXpbdHairClothWgsl,
  validateWgslComputeShader,
  type WgslBindingDescriptor,
  type WgslValidationReport,
} from "./wgsl-shaders";

export {
  DEFAULT_XPBD_CONFIG,
  auditCapsulePenetration,
  createDefaultHumanoidCapsuleColliders,
  createDefaultXpbdRigState,
  packXpbdGpuBuffers,
  type CapsuleCollider,
  type CapsuleColliderId,
  type Vec3,
  type XpbdBendingConstraint,
  type XpbdCollisionReport,
  type XpbdDistanceConstraint,
  type XpbdGpuBufferPack,
  type XpbdParticle,
  type XpbdSimulationConfig,
  type XpbdSimulationState,
  type XpbdStepMetrics,
  type XpbdStepResult,
  type XpbdWindConfig,
} from "./xpbd-types-and-rig";

const DEG_TO_RAD = Math.PI / 180;
const MAX_PARTICLE_SPEED_MPS = 12.0;

function computeStateHashHex(particles: readonly XpbdParticle[]): string {
  const scratch = new Float32Array(3);
  const view = new Uint32Array(scratch.buffer);
  let hash = 0x811c9dc5;
  for (const p of particles) {
    scratch[0] = p.pos[0];
    scratch[1] = p.pos[1];
    scratch[2] = p.pos[2];
    for (let k = 0; k < 3; k += 1) {
      const word = view[k] ?? 0;
      hash ^= word & 0xff;
      hash = Math.imul(hash, 0x01000193);
      hash ^= (word >>> 8) & 0xff;
      hash = Math.imul(hash, 0x01000193);
      hash ^= (word >>> 16) & 0xff;
      hash = Math.imul(hash, 0x01000193);
      hash ^= (word >>> 24) & 0xff;
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function evalCurlGustCpu(
  px: number,
  py: number,
  pz: number,
  phase: number,
  amp: number,
): readonly [number, number, number] {
  if (amp <= 1e-5) return [0, 0, 0];
  const cx = f32(Math.sin(f32(py * 7.3 + phase)) * Math.cos(f32(pz * 6.1 - phase * 0.7)) * amp);
  const cy = f32(
    0.35 * Math.cos(f32(px * 6.7 + phase * 0.85)) * Math.sin(f32(pz * 5.9 + phase * 0.5)) * amp,
  );
  const cz = f32(Math.cos(f32(px * 7.1 - phase * 0.9)) * Math.sin(f32(py * 6.3 + phase * 0.6)) * amp);
  return [cx, cy, cz];
}

/**
 * 결정론적 다중 서브스텝 XPBD 물리 시뮬레이션을 1프레임 실행한다.
 */
export function stepXpbdSimulation(
  state: XpbdSimulationState,
  configOverride: Partial<XpbdSimulationConfig> = {},
): XpbdStepResult {
  const cfg: XpbdSimulationConfig = {
    ...DEFAULT_XPBD_CONFIG,
    ...configOverride,
    wind: { ...DEFAULT_XPBD_CONFIG.wind, ...configOverride.wind },
  };

  const dtSec = clampNum(cfg.dtSec, 1 / 240, 1 / 15);
  const substeps = Math.round(clampNum(cfg.substeps, 1, 16));
  const iterations = Math.round(clampNum(cfg.constraintIterations, 1, 10));
  const h = f32(dtSec / substeps);
  const invHSq = f32(1 / Math.max(h * h, 1e-8));
  const damping = clampNum(cfg.damping, 0.01, 0.6);
  const gravity = clampNum(cfg.gravityMps2, 0, 25);
  const maxStretchRatio = clampNum(cfg.maxStretchRatio, 1.01, 1.35);
  const clearanceM = clampNum(cfg.surfaceClearanceMm, 0.5, 10) / 1000;

  const windStrength = clampNum(cfg.wind.strengthMps, 0, 22);
  const windAzRad = cfg.wind.azimuthDeg * DEG_TO_RAD;
  const windVx = f32(Math.cos(windAzRad) * windStrength);
  const windVz = f32(Math.sin(windAzRad) * windStrength);
  const gustTurb = clampNum(cfg.wind.gustTurbulence, 0, 1);
  const gustFreq = clampNum(cfg.wind.gustFrequencyHz, 0.2, 6);
  const gustAmp = f32(gustTurb * (0.35 + (windStrength / 18) * 0.65) * 4.8);

  const hairDistComp = stiffnessToDistanceCompliance(cfg.hairStiffness);
  const hairBendComp = stiffnessToBendingCompliance(cfg.hairStiffness);
  const clothDistComp = stiffnessToDistanceCompliance(cfg.clothStiffness);
  const clothBendComp = stiffnessToBendingCompliance(cfg.clothStiffness);

  const count = state.particles.length;
  const px = new Float32Array(count);
  const py = new Float32Array(count);
  const pz = new Float32Array(count);
  const prevX = new Float32Array(count);
  const prevY = new Float32Array(count);
  const prevZ = new Float32Array(count);
  const vx = new Float32Array(count);
  const vy = new Float32Array(count);
  const vz = new Float32Array(count);
  const invMass = new Float32Array(count);
  const radius = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const p = state.particles[i];
    if (!p) continue;
    px[i] = f32(p.pos[0]);
    py[i] = f32(p.pos[1]);
    pz[i] = f32(p.pos[2]);
    prevX[i] = f32(p.prevPos[0]);
    prevY[i] = f32(p.prevPos[1]);
    prevZ[i] = f32(p.prevPos[2]);
    vx[i] = f32(p.vel[0]);
    vy[i] = f32(p.vel[1]);
    vz[i] = f32(p.vel[2]);
    invMass[i] = f32(p.invMass);
    radius[i] = f32(p.radius);
  }

  let rawPenetrationBeforeProjectMm = 0;
  const perColliderContacts: Record<CapsuleColliderId, number> = {
    head: 0,
    neck: 0,
    left_shoulder: 0,
    right_shoulder: 0,
    torso: 0,
  };

  let simTime = state.elapsedSec;
  const distLambdas = new Float32Array(state.distanceConstraints.length);
  const bendLambdas = new Float32Array(state.bendingConstraints.length);

  for (let sub = 0; sub < substeps; sub += 1) {
    simTime = f32(simTime + h);
    const gustPhase = f32(2 * Math.PI * gustFreq * simTime);
    const dampMul = f32(Math.exp(-damping * h * 6));
    distLambdas.fill(0);
    bendLambdas.fill(0);

    // 1) 외력(중력 + 바람 항력 + 돌풍 컬 난류) 적분 및 위치 예측
    for (let i = 0; i < count; i += 1) {
      if ((invMass[i] ?? 0) <= 0) continue;
      const curX = px[i] ?? 0;
      const curY = py[i] ?? 0;
      const curZ = pz[i] ?? 0;
      prevX[i] = curX;
      prevY[i] = curY;
      prevZ[i] = curZ;

      const [gx, gy, gz] = evalCurlGustCpu(curX, curY, curZ, gustPhase, gustAmp);
      const dragGain = state.particles[i]?.kind === "cloth" ? 3.2 : 2.6;
      const ax = f32((windVx + gx - (vx[i] ?? 0)) * dragGain);
      const ay = f32(-gravity + (gy - (vy[i] ?? 0)) * dragGain);
      const az = f32((windVz + gz - (vz[i] ?? 0)) * dragGain);

      let nvx = f32(((vx[i] ?? 0) + ax * h) * dampMul);
      let nvy = f32(((vy[i] ?? 0) + ay * h) * dampMul);
      let nvz = f32(((vz[i] ?? 0) + az * h) * dampMul);
      const speed = Math.hypot(nvx, nvy, nvz);
      if (speed > MAX_PARTICLE_SPEED_MPS) {
        const scale = f32(MAX_PARTICLE_SPEED_MPS / speed);
        nvx = f32(nvx * scale);
        nvy = f32(nvy * scale);
        nvz = f32(nvz * scale);
      }

      px[i] = f32(curX + nvx * h);
      py[i] = f32(curY + nvy * h);
      pz[i] = f32(curZ + nvz * h);
      vx[i] = nvx;
      vy[i] = nvy;
      vz[i] = nvz;
    }

    // 2) XPBD 거리·굽힘 제약 반복 및 5종 캡슐 충돌 투영
    for (let iter = 0; iter < iterations; iter += 1) {
      for (let dIdx = 0; dIdx < state.distanceConstraints.length; dIdx += 1) {
        const dc = state.distanceConstraints[dIdx];
        if (!dc) continue;
        const wa = invMass[dc.a] ?? 0;
        const wb = invMass[dc.b] ?? 0;
        const wSum = f32(wa + wb);
        if (wSum <= 0) continue;

        const dx = f32((px[dc.b] ?? 0) - (px[dc.a] ?? 0));
        const dy = f32((py[dc.b] ?? 0) - (py[dc.a] ?? 0));
        const dz = f32((pz[dc.b] ?? 0) - (pz[dc.a] ?? 0));
        const dist = f32(Math.sqrt(dx * dx + dy * dy + dz * dz));
        if (dist <= 1e-6) continue;

        const compliance = state.particles[dc.b]?.kind === "cloth" ? clothDistComp : hairDistComp;
        const alphaTilde = f32(compliance * invHSq);
        const prevLambda = distLambdas[dIdx] ?? 0;
        const dLambda = f32((-(dist - dc.restLength) - alphaTilde * prevLambda) / (wSum + alphaTilde));
        distLambdas[dIdx] = f32(prevLambda + dLambda);

        const nx = f32(dx / dist);
        const ny = f32(dy / dist);
        const nz = f32(dz / dist);
        px[dc.a] = f32((px[dc.a] ?? 0) - nx * dLambda * wa);
        py[dc.a] = f32((py[dc.a] ?? 0) - ny * dLambda * wa);
        pz[dc.a] = f32((pz[dc.a] ?? 0) - nz * dLambda * wa);
        px[dc.b] = f32((px[dc.b] ?? 0) + nx * dLambda * wb);
        py[dc.b] = f32((py[dc.b] ?? 0) + ny * dLambda * wb);
        pz[dc.b] = f32((pz[dc.b] ?? 0) + nz * dLambda * wb);

        // 최대 신장률 상한 클램프
        const cdx = f32((px[dc.b] ?? 0) - (px[dc.a] ?? 0));
        const cdy = f32((py[dc.b] ?? 0) - (py[dc.a] ?? 0));
        const cdz = f32((pz[dc.b] ?? 0) - (pz[dc.a] ?? 0));
        const cDist = f32(Math.sqrt(cdx * cdx + cdy * cdy + cdz * cdz));
        const maxLen = f32(dc.restLength * maxStretchRatio);
        if (cDist > maxLen && cDist > 1e-6) {
          const excess = f32((cDist - maxLen) / wSum);
          const cx = f32(cdx / cDist);
          const cy = f32(cdy / cDist);
          const cz = f32(cdz / cDist);
          px[dc.a] = f32((px[dc.a] ?? 0) + cx * excess * wa);
          py[dc.a] = f32((py[dc.a] ?? 0) + cy * excess * wa);
          pz[dc.a] = f32((pz[dc.a] ?? 0) + cz * excess * wa);
          px[dc.b] = f32((px[dc.b] ?? 0) - cx * excess * wb);
          py[dc.b] = f32((py[dc.b] ?? 0) - cy * excess * wb);
          pz[dc.b] = f32((pz[dc.b] ?? 0) - cz * excess * wb);
        }
      }

      for (let bIdx = 0; bIdx < state.bendingConstraints.length; bIdx += 1) {
        const bc = state.bendingConstraints[bIdx];
        if (!bc) continue;
        const wa = invMass[bc.a] ?? 0;
        const wc = invMass[bc.c] ?? 0;
        const wSum = f32(wa + wc);
        if (wSum <= 0) continue;

        const dx = f32((px[bc.c] ?? 0) - (px[bc.a] ?? 0));
        const dy = f32((py[bc.c] ?? 0) - (py[bc.a] ?? 0));
        const dz = f32((pz[bc.c] ?? 0) - (pz[bc.a] ?? 0));
        const span = f32(Math.sqrt(dx * dx + dy * dy + dz * dz));
        if (span <= 1e-6) continue;

        const compliance = state.particles[bc.c]?.kind === "cloth" ? clothBendComp : hairBendComp;
        const alphaTilde = f32(compliance * invHSq);
        const prevLambda = bendLambdas[bIdx] ?? 0;
        const dLambda = f32((-(span - bc.restSpan) - alphaTilde * prevLambda) / (wSum + alphaTilde));
        bendLambdas[bIdx] = f32(prevLambda + dLambda);

        const nx = f32(dx / span);
        const ny = f32(dy / span);
        const nz = f32(dz / span);
        px[bc.a] = f32((px[bc.a] ?? 0) - nx * dLambda * wa);
        py[bc.a] = f32((py[bc.a] ?? 0) - ny * dLambda * wa);
        pz[bc.a] = f32((pz[bc.a] ?? 0) - nz * dLambda * wa);
        px[bc.c] = f32((px[bc.c] ?? 0) + nx * dLambda * wc);
        py[bc.c] = f32((py[bc.c] ?? 0) + ny * dLambda * wc);
        pz[bc.c] = f32((pz[bc.c] ?? 0) + nz * dLambda * wc);
      }

      for (let i = 0; i < count; i += 1) {
        if ((invMass[i] ?? 0) <= 0) continue;
        const projected = projectPointOutOfColliders(
          [px[i] ?? 0, py[i] ?? 0, pz[i] ?? 0],
          radius[i] ?? 0.004,
          state.colliders,
          clearanceM,
        );
        px[i] = projected.pos[0];
        py[i] = projected.pos[1];
        pz[i] = projected.pos[2];
        if (projected.rawPenetrationMm > rawPenetrationBeforeProjectMm) {
          rawPenetrationBeforeProjectMm = projected.rawPenetrationMm;
        }
        if (sub === substeps - 1 && iter === iterations - 1) {
          for (const hitId of projected.hitColliderIds) {
            perColliderContacts[hitId] += 1;
          }
        }
      }
    }

    // 3) 서브스텝 속도 갱신
    const invH = f32(1 / h);
    for (let i = 0; i < count; i += 1) {
      if ((invMass[i] ?? 0) <= 0) continue;
      let nvx = f32(((px[i] ?? 0) - (prevX[i] ?? 0)) * invH);
      let nvy = f32(((py[i] ?? 0) - (prevY[i] ?? 0)) * invH);
      let nvz = f32(((pz[i] ?? 0) - (prevZ[i] ?? 0)) * invH);
      const speed = Math.hypot(nvx, nvy, nvz);
      if (speed > MAX_PARTICLE_SPEED_MPS) {
        const scale = f32(MAX_PARTICLE_SPEED_MPS / speed);
        nvx = f32(nvx * scale);
        nvy = f32(nvy * scale);
        nvz = f32(nvz * scale);
      }
      vx[i] = nvx;
      vy[i] = nvy;
      vz[i] = nvz;
    }
  }

  const nextParticles: XpbdParticle[] = [];
  let kineticEnergyJ = 0;
  let maxSpeedMps = 0;
  let stable = true;

  for (let i = 0; i < count; i += 1) {
    const prevP = state.particles[i];
    if (!prevP) continue;
    const x = px[i] ?? 0;
    const y = py[i] ?? 0;
    const z = pz[i] ?? 0;
    const svx = vx[i] ?? 0;
    const svy = vy[i] ?? 0;
    const svz = vz[i] ?? 0;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) stable = false;
    const speedSq = svx * svx + svy * svy + svz * svz;
    const speed = Math.sqrt(speedSq);
    if (speed > maxSpeedMps) maxSpeedMps = speed;
    if (prevP.invMass > 0) kineticEnergyJ += 0.5 * (1 / prevP.invMass) * speedSq;
    nextParticles.push({
      ...prevP,
      pos: [x, y, z],
      prevPos: [prevX[i] ?? x, prevY[i] ?? y, prevZ[i] ?? z],
      vel: [svx, svy, svz],
    });
  }

  let maxStretchObserved = 1;
  for (const dc of state.distanceConstraints) {
    const pa = nextParticles[dc.a];
    const pb = nextParticles[dc.b];
    if (!pa || !pb || dc.restLength <= 1e-6) continue;
    const ratio =
      Math.hypot(pb.pos[0] - pa.pos[0], pb.pos[1] - pa.pos[1], pb.pos[2] - pa.pos[2]) / dc.restLength;
    if (ratio > maxStretchObserved) maxStretchObserved = ratio;
  }

  const tipByStrand = new Map<number, XpbdParticle>();
  for (const p of nextParticles) {
    const existing = tipByStrand.get(p.strandIndex);
    if (!existing || p.segmentIndex > existing.segmentIndex) tipByStrand.set(p.strandIndex, p);
  }
  let tipDispSumMm = 0;
  let tipCount = 0;
  for (const tip of tipByStrand.values()) {
    const rest = state.restPositions[tip.id];
    if (!rest) continue;
    tipDispSumMm +=
      Math.hypot(tip.pos[0] - rest[0], tip.pos[1] - rest[1], tip.pos[2] - rest[2]) * 1000;
    tipCount += 1;
  }

  const nextState: XpbdSimulationState = Object.freeze({
    ...state,
    stepIndex: state.stepIndex + 1,
    elapsedSec: Number(simTime.toFixed(5)),
    particles: Object.freeze(nextParticles),
  });
  const collision = auditCapsulePenetration(
    nextParticles,
    state.colliders,
    rawPenetrationBeforeProjectMm,
    perColliderContacts,
  );
  if (collision.penetrationMm > 0 || kineticEnergyJ > 50) stable = false;

  const metrics: XpbdStepMetrics = Object.freeze({
    stepIndex: nextState.stepIndex,
    elapsedSec: nextState.elapsedSec,
    penetrationMm: collision.penetrationMm,
    rawPenetrationBeforeProjectMm: collision.rawPenetrationBeforeProjectMm,
    contactCount: collision.contactCount,
    maxStretchRatioObserved: Number(maxStretchObserved.toFixed(4)),
    meanTipDisplacementMm: tipCount > 0 ? Number((tipDispSumMm / tipCount).toFixed(2)) : 0,
    kineticEnergyJ: Number(kineticEnergyJ.toFixed(5)),
    maxSpeedMps: Number(maxSpeedMps.toFixed(3)),
    stable,
    stateHashHex: computeStateHashHex(nextParticles),
  });

  return Object.freeze({ state: nextState, collision, metrics });
}

/**
 * 지정한 프레임 수만큼 결정론적 XPBD 시뮬레이션을 연속 실행한다.
 */
export function runXpbdSimulation(
  initialState: XpbdSimulationState,
  steps: number,
  configOverride: Partial<XpbdSimulationConfig> = {},
): XpbdStepResult {
  const safeSteps = Math.max(1, Math.min(600, Math.floor(steps)));
  let result = stepXpbdSimulation(initialState, configOverride);
  for (let i = 1; i < safeSteps; i += 1) {
    result = stepXpbdSimulation(result.state, configOverride);
  }
  return result;
}
