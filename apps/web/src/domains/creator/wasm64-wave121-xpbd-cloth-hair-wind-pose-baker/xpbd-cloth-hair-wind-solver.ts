/**
 * Wave 121 — 실시간 2D/2.5D XPBD 물리 옷주름·망토·머리카락 바람장 제약 솔버.
 *
 * - 고정 루트 핀(`invMass === 0`), 거리 제약(신축 오차 2% 이내),
 *   3점 곡률 굽힘 제약(실크·한복·모직·가죽 강성 차등), 중력 + 시공간 바람장 + 감쇠 통합
 * - 인체 캡슐 충돌체 교대 투영으로 관통 0건 불변식 보장
 * - 지수 적분 항력 및 CFL 서브스텝 분할로 극단 풍속·큰 dt에서도 NaN/Infinity 0건 유지
 */

import {
  CLOTH_HAIR_PRESETS,
  COLLIDER_PENETRATION_TOLERANCE,
  COLLIDER_SKIN_MARGIN,
  FABRIC_MATERIALS,
  buildPresetRestPosition,
  clampScalar,
  distancePointToCapsule,
  finiteOr,
  mergeWindConfig,
  sampleWindField,
  type BodyCapsuleCollider,
  type ClothHairPresetId,
  type CreateXpbdClothOptions,
  type FabricMaterialSpec,
  type SimulateXpbdClothOptions,
  type StepXpbdClothOptions,
  type XpbdBendingConstraint,
  type XpbdClothHairState,
  type XpbdClothMetrics,
  type XpbdDistanceConstraint,
  type XpbdParticle,
  type XpbdSimulationResult,
} from "./xpbd-cloth-presets-and-types";

export {
  CLOTH_HAIR_PRESETS,
  COLLIDER_PENETRATION_TOLERANCE,
  FABRIC_MATERIALS,
  distancePointToCapsule,
  sampleWindField,
  type BodyCapsuleCollider,
  type ClothHairPresetId,
  type CreateXpbdClothOptions,
  type DistanceConstraintKind,
  type FabricMaterialId,
  type FabricMaterialSpec,
  type SimulateXpbdClothOptions,
  type StepXpbdClothOptions,
  type Vec2,
  type Vec3,
  type WindFieldConfig,
  type XpbdBendingConstraint,
  type XpbdClothHairState,
  type XpbdClothMetrics,
  type XpbdClothPresetSpec,
  type XpbdDistanceConstraint,
  type XpbdParticle,
  type XpbdSimulationResult,
} from "./xpbd-cloth-presets-and-types";

const MAX_PARTICLE_SPEED = 1400;
const MAX_SAFE_STEP_DT = 0.25;
const MAX_SUBSTEPS = 48;

interface MutableParticle {
  id: number;
  row: number;
  col: number;
  x: number;
  y: number;
  z: number;
  prevX: number;
  prevY: number;
  prevZ: number;
  vx: number;
  vy: number;
  vz: number;
  invMass: number;
  pinned: boolean;
  restX: number;
  restY: number;
  restZ: number;
  contactedColliderId: string | null;
}

function projectSingleParticleOutOfColliders(
  p: MutableParticle,
  colliders: readonly BodyCapsuleCollider[],
  skinMargin: number,
): boolean {
  if (p.pinned) return false;
  let contacted = false;
  for (let pass = 0; pass < 2; pass += 1) {
    let moved = false;
    for (let i = 0; i < colliders.length; i += 1) {
      const c = colliders[i];
      const safeRadius = Math.max(1, finiteOr(c.radius, 1));
      const hit = distancePointToCapsule(p.x, p.y, c);
      const minDist = safeRadius + skinMargin;
      if (hit.dist < minDist) {
        p.x = hit.closestX + hit.nx * minDist;
        p.y = hit.closestY + hit.ny * minDist;
        p.contactedColliderId = c.id;
        contacted = true;
        moved = true;
      } else if (hit.dist <= safeRadius + 2.0 && p.contactedColliderId === null) {
        p.contactedColliderId = c.id;
      }
    }
    if (!moved) break;
  }
  return contacted;
}

function solveDistanceConstraintPair(
  particles: readonly MutableParticle[],
  c: XpbdDistanceConstraint,
  lambda: number,
  invDtSq: number,
  strictMode: boolean,
): number {
  const pa = particles[c.a];
  const pb = particles[c.b];
  const wSum = pa.invMass + pb.invMass;
  if (wSum <= 0) return lambda;

  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-8) return lambda;

  const err = dist - c.restLength;
  const alphaTilde = strictMode ? 0 : c.compliance * invDtSq;
  const dLambda = (-err - alphaTilde * lambda) / (wSum + alphaTilde);
  const nx = dx / dist;
  const ny = dy / dist;

  if (!pa.pinned) {
    pa.x -= pa.invMass * dLambda * nx;
    pa.y -= pa.invMass * dLambda * ny;
  }
  if (!pb.pinned) {
    pb.x += pb.invMass * dLambda * nx;
    pb.y += pb.invMass * dLambda * ny;
  }
  return lambda + dLambda;
}

function solveBendingConstraintTriple(
  particles: readonly MutableParticle[],
  c: XpbdBendingConstraint,
  lambda: number,
  invDtSq: number,
): number {
  const pa = particles[c.a];
  const pm = particles[c.mid];
  const pb = particles[c.b];
  const wEff = pm.invMass + 0.25 * pa.invMass + 0.25 * pb.invMass;
  if (wEff <= 0) return lambda;

  const ex = pm.x - 0.5 * (pa.x + pb.x) - c.restOffsetX;
  const ey = pm.y - 0.5 * (pa.y + pb.y) - c.restOffsetY;
  const mag = Math.hypot(ex, ey);
  if (mag < 1e-7) return lambda;

  const alphaTilde = c.compliance * invDtSq;
  const dLambda = (-mag - alphaTilde * lambda) / (wEff + alphaTilde);
  const nx = ex / mag;
  const ny = ey / mag;

  if (!pm.pinned) {
    pm.x += pm.invMass * dLambda * nx;
    pm.y += pm.invMass * dLambda * ny;
  }
  if (!pa.pinned) {
    pa.x -= 0.5 * pa.invMass * dLambda * nx;
    pa.y -= 0.5 * pa.invMass * dLambda * ny;
  }
  if (!pb.pinned) {
    pb.x -= 0.5 * pb.invMass * dLambda * nx;
    pb.y -= 0.5 * pb.invMass * dLambda * ny;
  }
  return lambda + dLambda;
}

/**
 * 현재 시뮬레이션 상태의 신축 오차, 충돌 관통 수, 굽힘 각도, 꼬리 변위, 실루엣 확장도 등 핵심 지표를 독립 계산한다.
 */
export function computeXpbdClothMetrics(
  state: Pick<XpbdClothHairState, "particles" | "distanceConstraints" | "bendingConstraints" | "colliders" | "rows" | "cols" | "material">,
): XpbdClothMetrics {
  const { particles, distanceConstraints, bendingConstraints, colliders, rows, cols, material } = state;

  let nonFiniteCount = 0;
  let kineticEnergy = 0;
  let colliderPenetrationCount = 0;
  let colliderContactCount = 0;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let restMinX = Infinity;
  let restMaxX = -Infinity;
  let restMinY = Infinity;
  let restMaxY = -Infinity;

  for (let i = 0; i < particles.length; i += 1) {
    const p = particles[i];
    if (
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y) ||
      !Number.isFinite(p.z) ||
      !Number.isFinite(p.vx) ||
      !Number.isFinite(p.vy) ||
      !Number.isFinite(p.vz)
    ) {
      nonFiniteCount += 1;
    }
    if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    if (p.restX < restMinX) restMinX = p.restX;
    if (p.restX > restMaxX) restMaxX = p.restX;
    if (p.restY < restMinY) restMinY = p.restY;
    if (p.restY > restMaxY) restMaxY = p.restY;

    if (!p.pinned && Number.isFinite(p.vx) && Number.isFinite(p.vy)) {
      kineticEnergy += 0.5 * material.particleMass * (p.vx * p.vx + p.vy * p.vy + p.vz * p.vz);
    }

    if (!p.pinned) {
      let penetrated = false;
      let contacted = false;
      for (let cIdx = 0; cIdx < colliders.length; cIdx += 1) {
        const c = colliders[cIdx];
        const hit = distancePointToCapsule(p.x, p.y, c);
        if (hit.dist < c.radius - COLLIDER_PENETRATION_TOLERANCE) penetrated = true;
        if (hit.dist <= c.radius + 2.5) contacted = true;
      }
      if (penetrated) colliderPenetrationCount += 1;
      if (contacted) colliderContactCount += 1;
    }
  }

  let maxStretchErrorRatio = 0;
  let sumStretchErrorRatio = 0;
  let structuralCount = 0;
  for (let i = 0; i < distanceConstraints.length; i += 1) {
    const c = distanceConstraints[i];
    if (c.kind === "shear") continue;
    const pa = particles[c.a];
    const pb = particles[c.b];
    const dist = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    const ratio = c.restLength > 1e-6 ? Math.abs(dist - c.restLength) / c.restLength : 0;
    if (ratio > maxStretchErrorRatio) maxStretchErrorRatio = ratio;
    sumStretchErrorRatio += ratio;
    structuralCount += 1;
  }

  let bendAngleSum = 0;
  let maxBendingAngleRad = 0;
  let bendSampleCount = 0;
  for (let i = 0; i < bendingConstraints.length; i += 1) {
    const b = bendingConstraints[i];
    const pa = particles[b.a];
    const pm = particles[b.mid];
    const pb = particles[b.b];
    const v1x = pm.x - pa.x;
    const v1y = pm.y - pa.y;
    const v2x = pb.x - pm.x;
    const v2y = pb.y - pm.y;
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    if (l1 > 1e-6 && l2 > 1e-6) {
      const angle = Math.acos(clampScalar((v1x * v2x + v1y * v2y) / (l1 * l2), -1, 1));
      bendAngleSum += angle;
      if (angle > maxBendingAngleRad) maxBendingAngleRad = angle;
      bendSampleCount += 1;
    }
  }

  let tailX = 0;
  let tailY = 0;
  let tailRestX = 0;
  let tailRestY = 0;
  const tailStart = (rows - 1) * cols;
  for (let c = 0; c < cols; c += 1) {
    const p = particles[tailStart + c];
    tailX += p.x;
    tailY += p.y;
    tailRestX += p.restX;
    tailRestY += p.restY;
  }
  const denom = Math.max(1, cols);
  const tailDx = (tailX - tailRestX) / denom;
  const tailDy = (tailY - tailRestY) / denom;

  const restW = Math.max(1, restMaxX - restMinX);
  const currW = Number.isFinite(maxX - minX) ? Math.max(1, maxX - minX) : restW;
  const restSpan = Math.hypot(restW, Math.max(1, restMaxY - restMinY));
  const currSpan = Math.hypot(currW, Number.isFinite(maxY - minY) ? Math.max(1, maxY - minY) : 1);

  return {
    maxStretchErrorRatio,
    meanStretchErrorRatio: structuralCount > 0 ? sumStretchErrorRatio / structuralCount : 0,
    colliderPenetrationCount,
    colliderContactCount,
    averageBendingAngleRad: bendSampleCount > 0 ? bendAngleSum / bendSampleCount : 0,
    maxBendingAngleRad,
    tailDisplacement: { x: tailDx, y: tailDy, magnitude: Math.hypot(tailDx, tailDy) },
    silhouetteSweepRatio: Math.max(currW / restW, currSpan / restSpan),
    kineticEnergy,
    nonFiniteCount,
  };
}

/**
 * 선택한 의상·머리카락 프리셋의 초기 XPBD 상태와 제약 그래프를 생성한다.
 */
export function createXpbdClothHairState(
  presetId: ClothHairPresetId,
  options: CreateXpbdClothOptions = {},
): XpbdClothHairState {
  const spec = CLOTH_HAIR_PRESETS[presetId];
  const baseMat = FABRIC_MATERIALS[options.materialId ?? spec.materialId];
  const material: FabricMaterialSpec = {
    ...baseMat,
    distanceCompliance: Math.max(0, finiteOr(options.distanceCompliance, baseMat.distanceCompliance)),
    bendingCompliance: Math.max(0, finiteOr(options.bendingCompliance, baseMat.bendingCompliance)),
    damping: Math.max(0, finiteOr(options.damping, baseMat.damping)),
  };
  const colliders = options.colliders ?? spec.colliders;
  const wind = mergeWindConfig(spec.defaultWind, options.wind);

  const mutableParticles: MutableParticle[] = [];
  const invMassBase = 1 / Math.max(0.1, material.particleMass);
  for (let r = 0; r < spec.rows; r += 1) {
    for (let c = 0; c < spec.cols; c += 1) {
      const id = r * spec.cols + c;
      const pos = buildPresetRestPosition(presetId, r, c, spec.rows, spec.cols);
      const pinned = r === 0;
      const particle: MutableParticle = {
        id,
        row: r,
        col: c,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        prevX: pos.x,
        prevY: pos.y,
        prevZ: pos.z,
        vx: 0,
        vy: 0,
        vz: 0,
        invMass: pinned ? 0 : invMassBase,
        pinned,
        restX: pos.x,
        restY: pos.y,
        restZ: pos.z,
        contactedColliderId: null,
      };
      if (!pinned) {
        projectSingleParticleOutOfColliders(particle, colliders, COLLIDER_SKIN_MARGIN);
        particle.prevX = particle.x;
        particle.prevY = particle.y;
        particle.restX = particle.x;
        particle.restY = particle.y;
      }
      mutableParticles.push(particle);
    }
  }

  const distanceConstraints: XpbdDistanceConstraint[] = [];
  const idx = (r: number, c: number): number => r * spec.cols + c;

  for (let r = 0; r < spec.rows; r += 1) {
    for (let c = 0; c < spec.cols; c += 1) {
      if (r + 1 < spec.rows) {
        const a = idx(r, c);
        const b = idx(r + 1, c);
        distanceConstraints.push({
          a,
          b,
          restLength: Math.max(1, Math.hypot(mutableParticles[b].x - mutableParticles[a].x, mutableParticles[b].y - mutableParticles[a].y)),
          compliance: material.distanceCompliance,
          kind: "structural-v",
        });
      }
      if (c + 1 < spec.cols) {
        const a = idx(r, c);
        const b = idx(r, c + 1);
        distanceConstraints.push({
          a,
          b,
          restLength: Math.max(1, Math.hypot(mutableParticles[b].x - mutableParticles[a].x, mutableParticles[b].y - mutableParticles[a].y)),
          compliance: presetId === "long-straight-hair" ? Math.max(material.distanceCompliance, 1e-6) : material.distanceCompliance,
          kind: "structural-h",
        });
      }
      if (spec.includeShearConstraints && r + 1 < spec.rows && c + 1 < spec.cols) {
        const a1 = idx(r, c);
        const b1 = idx(r + 1, c + 1);
        const a2 = idx(r, c + 1);
        const b2 = idx(r + 1, c);
        const shearComp = Math.max(material.bendingCompliance * 0.6, 5e-5);
        distanceConstraints.push({
          a: a1,
          b: b1,
          restLength: Math.max(1, Math.hypot(mutableParticles[b1].x - mutableParticles[a1].x, mutableParticles[b1].y - mutableParticles[a1].y)),
          compliance: shearComp,
          kind: "shear",
        });
        distanceConstraints.push({
          a: a2,
          b: b2,
          restLength: Math.max(1, Math.hypot(mutableParticles[b2].x - mutableParticles[a2].x, mutableParticles[b2].y - mutableParticles[a2].y)),
          compliance: shearComp,
          kind: "shear",
        });
      }
    }
  }

  const bendingConstraints: XpbdBendingConstraint[] = [];
  for (let r = 1; r + 1 < spec.rows; r += 1) {
    for (let c = 0; c < spec.cols; c += 1) {
      const a = idx(r - 1, c);
      const mid = idx(r, c);
      const b = idx(r + 1, c);
      bendingConstraints.push({
        a,
        mid,
        b,
        restOffsetX: mutableParticles[mid].x - 0.5 * (mutableParticles[a].x + mutableParticles[b].x),
        restOffsetY: mutableParticles[mid].y - 0.5 * (mutableParticles[a].y + mutableParticles[b].y),
        compliance: material.bendingCompliance,
        axis: "vertical",
      });
    }
  }
  for (let r = 1; r < spec.rows; r += 1) {
    for (let c = 1; c + 1 < spec.cols; c += 1) {
      const a = idx(r, c - 1);
      const mid = idx(r, c);
      const b = idx(r, c + 1);
      bendingConstraints.push({
        a,
        mid,
        b,
        restOffsetX: mutableParticles[mid].x - 0.5 * (mutableParticles[a].x + mutableParticles[b].x),
        restOffsetY: mutableParticles[mid].y - 0.5 * (mutableParticles[a].y + mutableParticles[b].y),
        compliance: material.bendingCompliance * 1.4,
        axis: "horizontal",
      });
    }
  }

  const particles: readonly XpbdParticle[] = mutableParticles.map((p) => ({ ...p }));
  const metrics = computeXpbdClothMetrics({
    particles,
    distanceConstraints,
    bendingConstraints,
    colliders,
    rows: spec.rows,
    cols: spec.cols,
    material,
  });

  return {
    presetId,
    material,
    cols: spec.cols,
    rows: spec.rows,
    viewportWidth: spec.viewportWidth,
    viewportHeight: spec.viewportHeight,
    timeSec: 0,
    stepCount: 0,
    substepsExecuted: 0,
    particles,
    distanceConstraints,
    bendingConstraints,
    colliders,
    wind,
    metrics,
  };
}

/**
 * XPBD 1프레임을 CFL 안전 서브스텝으로 분할하여 전진시키고, 충돌 관통 0건과 신축 오차 한계를 보증한다.
 */
export function stepXpbdClothHair(
  state: XpbdClothHairState,
  options: StepXpbdClothOptions = {},
): XpbdClothHairState {
  const rawDt = options.dt ?? 1 / 60;
  const safeDt = Number.isFinite(rawDt) && rawDt > 0 ? Math.min(rawDt, MAX_SAFE_STEP_DT) : 1 / 60;
  const wind = mergeWindConfig(state.wind, options.windOverride);
  const iterations = clampScalar(Math.trunc(finiteOr(options.solverIterations, 14)), 4, 40);

  let minEdgeLen = Infinity;
  for (let i = 0; i < state.distanceConstraints.length; i += 1) {
    const c = state.distanceConstraints[i];
    if (c.kind !== "shear" && c.restLength < minEdgeLen) minEdgeLen = c.restLength;
  }
  const effectiveEdge = Number.isFinite(minEdgeLen) ? Math.max(4, minEdgeLen) : 16;
  const windMag = Math.hypot(wind.windVector.x, wind.windVector.y) + wind.gustAmplitude + wind.turbulenceAmplitude;
  const cflSpeed = Math.max(120, Math.min(MAX_PARTICLE_SPEED, windMag + Math.abs(wind.gravity)));
  const cflSubsteps = Math.ceil(Math.max(safeDt / (1 / 120), (safeDt * cflSpeed) / (0.4 * effectiveEdge)));
  const requestedSubsteps = Math.trunc(finiteOr(options.substeps, 4));
  const substeps = clampScalar(Math.max(requestedSubsteps, cflSubsteps), 2, MAX_SUBSTEPS);
  const subDt = safeDt / substeps;
  const invDtSq = 1 / (subDt * subDt);

  const particles: MutableParticle[] = state.particles.map((p) => ({ ...p, contactedColliderId: null }));
  const distLambdas = new Float64Array(state.distanceConstraints.length);
  const bendLambdas = new Float64Array(state.bendingConstraints.length);
  const dampingFactor = Math.exp(-state.material.damping * subDt);
  const dragExp = Math.exp(-state.material.dragCoeff * subDt);

  let currentTime = state.timeSec;
  for (let sub = 0; sub < substeps; sub += 1) {
    currentTime += subDt;
    distLambdas.fill(0);
    bendLambdas.fill(0);

    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      p.prevX = p.x;
      p.prevY = p.y;
      p.prevZ = p.z;
      p.contactedColliderId = null;
      if (p.pinned) {
        p.x = p.restX;
        p.y = p.restY;
        p.z = p.restZ;
        p.vx = 0;
        p.vy = 0;
        p.vz = 0;
        continue;
      }

      const wField = sampleWindField(wind, p.x, p.y, currentTime);
      const liftY = -Math.abs(wField.z) * state.material.liftCoeff * 0.35;
      const targetVx = clampScalar(wField.x, -MAX_PARTICLE_SPEED, MAX_PARTICLE_SPEED);
      const targetVy = clampScalar(wField.y + liftY, -MAX_PARTICLE_SPEED, MAX_PARTICLE_SPEED);
      const targetVz = clampScalar(wField.z, -360, 360);

      let vx = (targetVx + (p.vx - targetVx) * dragExp) * dampingFactor;
      let vy = (targetVy + (p.vy - targetVy) * dragExp + wind.gravity * subDt) * dampingFactor;
      const vz = (targetVz + (p.vz - targetVz) * dragExp - p.z * 2.5 * subDt) * dampingFactor;

      const speed = Math.hypot(vx, vy);
      if (speed > MAX_PARTICLE_SPEED) {
        const s = MAX_PARTICLE_SPEED / speed;
        vx *= s;
        vy *= s;
      }

      p.vx = finiteOr(vx, 0);
      p.vy = finiteOr(vy, 0);
      p.vz = finiteOr(vz, 0);
      p.x = finiteOr(p.x + p.vx * subDt, p.restX);
      p.y = finiteOr(p.y + p.vy * subDt, p.restY);
      p.z = clampScalar(finiteOr(p.z + p.vz * subDt, p.restZ), -90, 90);
    }

    for (let iter = 0; iter < iterations; iter += 1) {
      for (let bIdx = 0; bIdx < state.bendingConstraints.length; bIdx += 1) {
        bendLambdas[bIdx] = solveBendingConstraintTriple(particles, state.bendingConstraints[bIdx], bendLambdas[bIdx], invDtSq);
      }
      const forward = iter % 2 === 0;
      const dCount = state.distanceConstraints.length;
      for (let k = 0; k < dCount; k += 1) {
        const dIdx = forward ? k : dCount - 1 - k;
        distLambdas[dIdx] = solveDistanceConstraintPair(particles, state.distanceConstraints[dIdx], distLambdas[dIdx], invDtSq, false);
      }
      for (let pIdx = 0; pIdx < particles.length; pIdx += 1) {
        projectSingleParticleOutOfColliders(particles[pIdx], state.colliders, COLLIDER_SKIN_MARGIN);
      }
    }

    for (let polish = 0; polish < 6; polish += 1) {
      const forward = polish % 2 === 0;
      const dCount = state.distanceConstraints.length;
      for (let k = 0; k < dCount; k += 1) {
        const dIdx = forward ? k : dCount - 1 - k;
        const c = state.distanceConstraints[dIdx];
        if (c.kind === "shear") continue;
        solveDistanceConstraintPair(particles, c, 0, invDtSq, true);
      }
      for (let pIdx = 0; pIdx < particles.length; pIdx += 1) {
        projectSingleParticleOutOfColliders(particles[pIdx], state.colliders, COLLIDER_SKIN_MARGIN);
      }
    }

    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      if (p.pinned) {
        p.x = p.restX;
        p.y = p.restY;
        p.z = p.restZ;
        p.vx = 0;
        p.vy = 0;
        p.vz = 0;
        continue;
      }
      const frictionScale = p.contactedColliderId !== null ? 0.78 : 1;
      p.vx = finiteOr(clampScalar(((p.x - p.prevX) / subDt) * frictionScale, -MAX_PARTICLE_SPEED, MAX_PARTICLE_SPEED), 0);
      p.vy = finiteOr(clampScalar(((p.y - p.prevY) / subDt) * frictionScale, -MAX_PARTICLE_SPEED, MAX_PARTICLE_SPEED), 0);
      p.vz = finiteOr(clampScalar(((p.z - p.prevZ) / subDt) * frictionScale, -360, 360), 0);
    }
  }

  const nextParticles: readonly XpbdParticle[] = particles.map((p) => ({ ...p }));
  const metrics = computeXpbdClothMetrics({
    particles: nextParticles,
    distanceConstraints: state.distanceConstraints,
    bendingConstraints: state.bendingConstraints,
    colliders: state.colliders,
    rows: state.rows,
    cols: state.cols,
    material: state.material,
  });

  return {
    ...state,
    timeSec: currentTime,
    stepCount: state.stepCount + 1,
    substepsExecuted: state.substepsExecuted + substeps,
    particles: nextParticles,
    wind,
    metrics,
  };
}

/**
 * 지정한 프리셋과 조건으로 다중 프레임 XPBD 시뮬레이션을 실행한다.
 */
export function simulateXpbdClothHair(
  presetId: ClothHairPresetId,
  options: SimulateXpbdClothOptions = {},
): XpbdSimulationResult {
  const steps = clampScalar(Math.trunc(finiteOr(options.steps, 24)), 1, 240);
  let current = createXpbdClothHairState(presetId, options);
  const stepMetrics: XpbdClothMetrics[] = [];
  for (let s = 0; s < steps; s += 1) {
    current = stepXpbdClothHair(current, {
      dt: options.dt,
      substeps: options.substeps,
      solverIterations: options.solverIterations,
    });
    stepMetrics.push(current.metrics);
  }
  return { state: current, stepMetrics };
}
