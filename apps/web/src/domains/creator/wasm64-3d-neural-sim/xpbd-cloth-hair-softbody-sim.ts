/**
 * 120Hz 서브스테핑 XPBD(Extended Position-Based Dynamics) 의상·스커트·망토·웹툰 헤어 물리 솔버.
 *
 * - 거리 제약(구조·전단·헤어 세그먼트), 이면각(Dihedral) & 등거리(Isometric) 굽힘 제약
 * - 중력 + 방향성 돌풍(Directional Gust Wind) + 공기 저항 감쇠
 * - 인체 구체(Sphere) 및 캡슐(Capsule) 충돌 투영 + 고정 앵커(Pinned Vertex) 0-드리프트 보장
 * - 선택적 WebNN 신경망 잔차 속도 보정 훅(`NeuralClothResidualHook`) + ₩0 로컬 결정적 폴백
 */

import type { Vec3 } from "./mesh-qem-decimator-retargeter";
import {
  createDeterministicClothResidualHook,
  type NeuralClothResidualHook,
  type NeuralResidualBackendKind,
  type XpbdAssetKind,
  type XpbdCapsuleCollider,
  type XpbdDihedralBendingConstraint,
  type XpbdDistanceConstraint,
  type XpbdIsometricBendingConstraint,
  type XpbdSoftbodyDefinition,
  type XpbdSolverConfig,
  type XpbdSphereCollider,
  type XpbdStepMetrics,
  type XpbdWindField,
} from "./xpbd-cloth-hair-presets";

export {
  createClothGridAsset,
  createDeterministicClothResidualHook,
  createHairStrandBundleAsset,
  probeWebNnClothResidualSupport,
  type ClothGridAssetOptions,
  type HairStrandBundleOptions,
  type NeuralClothResidualHook,
  type NeuralClothResidualInput,
  type NeuralClothResidualOutput,
  type NeuralResidualBackendKind,
  type XpbdAssetKind,
  type XpbdCapsuleCollider,
  type XpbdDihedralBendingConstraint,
  type XpbdDistanceConstraint,
  type XpbdIsometricBendingConstraint,
  type XpbdSoftbodyDefinition,
  type XpbdSolverConfig,
  type XpbdSphereCollider,
  type XpbdStepMetrics,
  type XpbdWindField,
} from "./xpbd-cloth-hair-presets";

const EPS = 1e-7;
const DEFAULT_GRAVITY: Vec3 = [0, -9.81, 0];

function clamp(v: number, min: number, max: number): number {
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;
}

function wrapAnglePi(rad: number): number {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function solvePairwiseDistanceBatch(
  pos: Float32Array,
  invM: Float32Array,
  lambdas: Float32Array,
  constraints: readonly { readonly a: number; readonly b: number; readonly rest: number; readonly compliance: number }[],
  invDt2: number,
): void {
  for (let i = 0; i < constraints.length; i += 1) {
    const c = constraints[i];
    if (!c) continue;
    const w0 = invM[c.a];
    const w1 = invM[c.b];
    const wSum = w0 + w1;
    if (wSum <= 0) continue;

    const oa = c.a * 3;
    const ob = c.b * 3;
    const dx = pos[ob] - pos[oa];
    const dy = pos[ob + 1] - pos[oa + 1];
    const dz = pos[ob + 2] - pos[oa + 2];
    const dist = Math.hypot(dx, dy, dz);
    if (dist <= EPS) continue;

    const alphaTilde = c.compliance * invDt2;
    const dLambda = (-(dist - c.rest) - alphaTilde * lambdas[i]) / (wSum + alphaTilde);
    lambdas[i] += dLambda;
    const nx = dx / dist;
    const ny = dy / dist;
    const nz = dz / dist;

    if (w0 > 0) {
      pos[oa] -= w0 * dLambda * nx;
      pos[oa + 1] -= w0 * dLambda * ny;
      pos[oa + 2] -= w0 * dLambda * nz;
    }
    if (w1 > 0) {
      pos[ob] += w1 * dLambda * nx;
      pos[ob + 1] += w1 * dLambda * ny;
      pos[ob + 2] += w1 * dLambda * nz;
    }
  }
}

/** 120Hz 서브스테핑 XPBD 의상·헤어 소프트바디 솔버. */
export class XpbdClothHairSolver {
  readonly kind: XpbdAssetKind;
  readonly vertexCount: number;
  readonly positions: Float32Array;
  readonly prevPositions: Float32Array;
  readonly velocities: Float32Array;
  readonly invMasses: Float32Array;
  private readonly initialPinnedPositions: Float32Array;
  private readonly distanceConstraints: readonly XpbdDistanceConstraint[];
  private readonly distanceBatch: readonly { readonly a: number; readonly b: number; readonly rest: number; readonly compliance: number }[];
  private readonly isometricBatch: readonly { readonly a: number; readonly b: number; readonly rest: number; readonly compliance: number }[];
  private readonly dihedralConstraints: readonly XpbdDihedralBendingConstraint[];
  private readonly distLambdas: Float32Array;
  private readonly dihedralLambdas: Float32Array;
  private readonly isoLambdas: Float32Array;
  private readonly substepHz: number;
  private readonly maxSubstepsPerStep: number;
  private readonly constraintIterations: number;
  private readonly gravity: Vec3;
  private readonly airDamping: number;
  private readonly collisionThickness: number;
  private readonly maxVertexSpeed: number;
  private wind: XpbdWindField;
  private sphereColliders: readonly XpbdSphereCollider[];
  private capsuleColliders: readonly XpbdCapsuleCollider[];
  private residualHook: NeuralClothResidualHook | null;
  private simTimeSec = 0;

  constructor(definition: XpbdSoftbodyDefinition, config: XpbdSolverConfig = {}) {
    this.kind = definition.kind;
    this.vertexCount = definition.invMasses.length;
    this.positions = new Float32Array(definition.positions);
    this.prevPositions = new Float32Array(definition.positions);
    this.velocities = new Float32Array(this.vertexCount * 3);
    this.invMasses = new Float32Array(definition.invMasses);
    this.initialPinnedPositions = new Float32Array(definition.positions);
    this.distanceConstraints = definition.distanceConstraints;
    this.distanceBatch = definition.distanceConstraints.map((c) => ({
      a: c.a,
      b: c.b,
      rest: c.restLength,
      compliance: c.compliance,
    }));
    const iso: readonly XpbdIsometricBendingConstraint[] = definition.isometricConstraints ?? [];
    this.isometricBatch = iso.map((c) => ({
      a: c.a,
      b: c.b,
      rest: c.restDistance,
      compliance: c.compliance,
    }));
    this.dihedralConstraints = definition.dihedralConstraints ?? [];
    this.distLambdas = new Float32Array(this.distanceBatch.length);
    this.dihedralLambdas = new Float32Array(this.dihedralConstraints.length);
    this.isoLambdas = new Float32Array(this.isometricBatch.length);

    this.substepHz = clamp(config.substepHz ?? 120, 60, 480);
    this.maxSubstepsPerStep = Math.max(1, Math.floor(config.maxSubstepsPerStep ?? 16));
    this.constraintIterations = Math.max(1, Math.floor(config.constraintIterations ?? 2));
    this.gravity = config.gravity ?? DEFAULT_GRAVITY;
    this.airDamping = clamp(config.airDamping ?? 0.65, 0, 20);
    this.collisionThickness = clamp(config.collisionThickness ?? 0.004, 0, 0.05);
    this.maxVertexSpeed = clamp(config.maxVertexSpeed ?? 18, 1, 80);
    this.wind = config.wind ?? {
      baseVelocity: [0, 0, 0],
      gustStrength: 0,
      gustFrequencyHz: 0.7,
      turbulenceSpatialScale: 2.5,
      dragCoefficient: 0.85,
    };
    this.sphereColliders = config.sphereColliders ?? [];
    this.capsuleColliders = config.capsuleColliders ?? [];
    this.residualHook =
      config.neuralResidualHook === undefined
        ? createDeterministicClothResidualHook()
        : config.neuralResidualHook;
  }

  setWindField(wind: XpbdWindField): void {
    this.wind = wind;
  }

  setColliders(spheres: readonly XpbdSphereCollider[], capsules: readonly XpbdCapsuleCollider[]): void {
    this.sphereColliders = spheres;
    this.capsuleColliders = capsules;
  }

  setPinnedAnchorPosition(vertexIndex: number, pos: Vec3): void {
    if (vertexIndex < 0 || vertexIndex >= this.vertexCount || this.invMasses[vertexIndex] > 0) return;
    const o = vertexIndex * 3;
    this.positions[o] = pos[0];
    this.positions[o + 1] = pos[1];
    this.positions[o + 2] = pos[2];
    this.prevPositions[o] = pos[0];
    this.prevPositions[o + 1] = pos[1];
    this.prevPositions[o + 2] = pos[2];
    this.initialPinnedPositions[o] = pos[0];
    this.initialPinnedPositions[o + 1] = pos[1];
    this.initialPinnedPositions[o + 2] = pos[2];
  }

  private sampleWindAt(x: number, y: number, z: number, timeSec: number): Vec3 {
    const spatial = this.wind.turbulenceSpatialScale ?? 2.5;
    const omega = Math.PI * 2 * Math.max(0.05, this.wind.gustFrequencyHz);
    const gustWave =
      0.5 +
      0.35 * Math.sin(omega * timeSec + x * spatial + z * spatial * 0.7) +
      0.15 * Math.cos(omega * 2.13 * timeSec + y * spatial * 0.9);
    const [bx, by, bz] = this.wind.baseVelocity;
    const bLen = Math.hypot(bx, by, bz);
    const dirX = bLen > EPS ? bx / bLen : 1;
    const dirY = bLen > EPS ? by / bLen : 0;
    const dirZ = bLen > EPS ? bz / bLen : 0;
    const g = this.wind.gustStrength * gustWave;
    return [bx + dirX * g, by + dirY * g, bz + dirZ * g];
  }

  private solveDihedralBending(invDt2: number): void {
    const pos = this.positions;
    const invM = this.invMasses;
    for (let i = 0; i < this.dihedralConstraints.length; i += 1) {
      const c = this.dihedralConstraints[i];
      if (!c) continue;
      const w0 = invM[c.p0];
      const w1 = invM[c.p1];
      const w2 = invM[c.p2];
      const w3 = invM[c.p3];
      if (w0 + w1 + w2 + w3 <= 0) continue;

      const o0 = c.p0 * 3;
      const o1 = c.p1 * 3;
      const o2 = c.p2 * 3;
      const o3 = c.p3 * 3;

      const ex = pos[o1] - pos[o0];
      const ey = pos[o1 + 1] - pos[o0 + 1];
      const ez = pos[o1 + 2] - pos[o0 + 2];
      const eLen = Math.hypot(ex, ey, ez);
      if (eLen <= EPS) continue;
      const ehx = ex / eLen;
      const ehy = ey / eLen;
      const ehz = ez / eLen;

      const p20x = pos[o2] - pos[o0];
      const p20y = pos[o2 + 1] - pos[o0 + 1];
      const p20z = pos[o2 + 2] - pos[o0 + 2];
      const p30x = pos[o3] - pos[o0];
      const p30y = pos[o3 + 1] - pos[o0 + 1];
      const p30z = pos[o3 + 2] - pos[o0 + 2];

      const n1x = ey * p20z - ez * p20y;
      const n1y = ez * p20x - ex * p20z;
      const n1z = ex * p20y - ey * p20x;
      const n1Len = Math.hypot(n1x, n1y, n1z);
      const n2x = p30y * ez - p30z * ey;
      const n2y = p30z * ex - p30x * ez;
      const n2z = p30x * ey - p30y * ex;
      const n2Len = Math.hypot(n2x, n2y, n2z);
      if (n1Len <= EPS || n2Len <= EPS) continue;

      const u1x = n1x / n1Len;
      const u1y = n1y / n1Len;
      const u1z = n1z / n1Len;
      const u2x = n2x / n2Len;
      const u2y = n2y / n2Len;
      const u2z = n2z / n2Len;

      const cosPhi = clamp(u1x * u2x + u1y * u2y + u1z * u2z, -1, 1);
      const sinPhi = (u1y * u2z - u1z * u2y) * ehx + (u1z * u2x - u1x * u2z) * ehy + (u1x * u2y - u1y * u2x) * ehz;
      const err = wrapAnglePi(Math.atan2(sinPhi, cosPhi) - c.restAngleRad);
      if (Math.abs(err) <= 1e-6) continue;

      const s2 = -eLen / n1Len;
      const s3 = -eLen / n2Len;
      const g2x = u1x * s2;
      const g2y = u1y * s2;
      const g2z = u1z * s2;
      const g3x = u2x * s3;
      const g3y = u2y * s3;
      const g3z = u2z * s3;

      const k21 = ((pos[o2] - pos[o1]) * ehx + (pos[o2 + 1] - pos[o1 + 1]) * ehy + (pos[o2 + 2] - pos[o1 + 2]) * ehz) / eLen;
      const k31 = ((pos[o3] - pos[o1]) * ehx + (pos[o3 + 1] - pos[o1 + 1]) * ehy + (pos[o3 + 2] - pos[o1 + 2]) * ehz) / eLen;
      const k20 = (p20x * ehx + p20y * ehy + p20z * ehz) / eLen;
      const k30 = (p30x * ehx + p30y * ehy + p30z * ehz) / eLen;

      const g0x = k21 * g2x + k31 * g3x;
      const g0y = k21 * g2y + k31 * g3y;
      const g0z = k21 * g2z + k31 * g3z;
      const g1x = -k20 * g2x - k30 * g3x;
      const g1y = -k20 * g2y - k30 * g3y;
      const g1z = -k20 * g2z - k30 * g3z;

      const alphaTilde = c.compliance * invDt2;
      const denom =
        w0 * (g0x * g0x + g0y * g0y + g0z * g0z) +
        w1 * (g1x * g1x + g1y * g1y + g1z * g1z) +
        w2 * (g2x * g2x + g2y * g2y + g2z * g2z) +
        w3 * (g3x * g3x + g3y * g3y + g3z * g3z) +
        alphaTilde;
      if (denom <= EPS) continue;

      const dLambda = (-err - alphaTilde * this.dihedralLambdas[i]) / denom;
      this.dihedralLambdas[i] += dLambda;

      if (w0 > 0) {
        pos[o0] += w0 * dLambda * g0x;
        pos[o0 + 1] += w0 * dLambda * g0y;
        pos[o0 + 2] += w0 * dLambda * g0z;
      }
      if (w1 > 0) {
        pos[o1] += w1 * dLambda * g1x;
        pos[o1 + 1] += w1 * dLambda * g1y;
        pos[o1 + 2] += w1 * dLambda * g1z;
      }
      if (w2 > 0) {
        pos[o2] += w2 * dLambda * g2x;
        pos[o2 + 1] += w2 * dLambda * g2y;
        pos[o2 + 2] += w2 * dLambda * g2z;
      }
      if (w3 > 0) {
        pos[o3] += w3 * dLambda * g3x;
        pos[o3 + 1] += w3 * dLambda * g3y;
        pos[o3 + 2] += w3 * dLambda * g3z;
      }
    }
  }

  private projectBodyCollisions(): number {
    let contacts = 0;
    const pos = this.positions;
    const prev = this.prevPositions;
    const invM = this.invMasses;
    const pad = this.collisionThickness;

    for (let i = 0; i < this.vertexCount; i += 1) {
      if (invM[i] <= 0) continue;
      const o = i * 3;

      for (const sphere of this.sphereColliders) {
        const dx = pos[o] - sphere.center[0];
        const dy = pos[o + 1] - sphere.center[1];
        const dz = pos[o + 2] - sphere.center[2];
        const minR = sphere.radius + pad;
        const dist = Math.hypot(dx, dy, dz);
        if (dist < minR) {
          const nx = dist > EPS ? dx / dist : 0;
          const ny = dist > EPS ? dy / dist : 1;
          const nz = dist > EPS ? dz / dist : 0;
          const newX = sphere.center[0] + nx * minR;
          const newY = sphere.center[1] + ny * minR;
          const newZ = sphere.center[2] + nz * minR;
          const fric = clamp(sphere.friction ?? 0.25, 0, 1);
          const dispX = newX - prev[o];
          const dispY = newY - prev[o + 1];
          const dispZ = newZ - prev[o + 2];
          const nComp = dispX * nx + dispY * ny + dispZ * nz;
          pos[o] = newX - fric * (dispX - nComp * nx);
          pos[o + 1] = newY - fric * (dispY - nComp * ny);
          pos[o + 2] = newZ - fric * (dispZ - nComp * nz);
          contacts += 1;
        }
      }

      for (const cap of this.capsuleColliders) {
        const abx = cap.end[0] - cap.start[0];
        const aby = cap.end[1] - cap.start[1];
        const abz = cap.end[2] - cap.start[2];
        const abSq = abx * abx + aby * aby + abz * abz;
        const t =
          abSq > EPS
            ? clamp(
                ((pos[o] - cap.start[0]) * abx + (pos[o + 1] - cap.start[1]) * aby + (pos[o + 2] - cap.start[2]) * abz) /
                  abSq,
                0,
                1,
              )
            : 0;
        const cx = cap.start[0] + abx * t;
        const cy = cap.start[1] + aby * t;
        const cz = cap.start[2] + abz * t;
        const dx = pos[o] - cx;
        const dy = pos[o + 1] - cy;
        const dz = pos[o + 2] - cz;
        const minR = cap.radius + pad;
        const dist = Math.hypot(dx, dy, dz);
        if (dist < minR) {
          const nx = dist > EPS ? dx / dist : 0;
          const ny = dist > EPS ? dy / dist : 1;
          const nz = dist > EPS ? dz / dist : 0;
          const projX = cx + nx * minR;
          const projY = cy + ny * minR;
          const projZ = cz + nz * minR;
          const fric = clamp(cap.friction ?? 0.25, 0, 1);
          const dispX = projX - prev[o];
          const dispY = projY - prev[o + 1];
          const dispZ = projZ - prev[o + 2];
          const nComp = dispX * nx + dispY * ny + dispZ * nz;
          pos[o] = projX - fric * (dispX - nComp * nx);
          pos[o + 1] = projY - fric * (dispY - nComp * ny);
          pos[o + 2] = projZ - fric * (dispZ - nComp * nz);
          const rDist = Math.hypot(pos[o] - cx, pos[o + 1] - cy, pos[o + 2] - cz);
          if (rDist < minR) {
            const rnx = rDist > EPS ? (pos[o] - cx) / rDist : nx;
            const rny = rDist > EPS ? (pos[o + 1] - cy) / rDist : ny;
            const rnz = rDist > EPS ? (pos[o + 2] - cz) / rDist : nz;
            pos[o] = cx + rnx * minR;
            pos[o + 1] = cy + rny * minR;
            pos[o + 2] = cz + rnz * minR;
          }
          contacts += 1;
        }
      }
    }
    return contacts;
  }

  /** 주어진 프레임 시간 `frameDtSec`를 120Hz 이상 서브스텝으로 분할 적분하고 안정성 지표를 반환한다. */
  step(frameDtSec: number): XpbdStepMetrics {
    const safeDt = clamp(frameDtSec, 1 / 480, 0.1);
    const substeps = Math.min(this.maxSubstepsPerStep, Math.max(1, Math.ceil(safeDt * this.substepHz)));
    const subDt = safeDt / substeps;
    const invDt2 = 1 / (subDt * subDt);
    const invSubDt = 1 / subDt;
    const dampFactor = Math.exp(-this.airDamping * subDt);
    const drag = clamp(this.wind.dragCoefficient ?? 0.85, 0, 10);
    const pos = this.positions;
    const prev = this.prevPositions;
    const vel = this.velocities;
    const invM = this.invMasses;
    let collisionContactCount = 0;

    for (let s = 0; s < substeps; s += 1) {
      this.simTimeSec += subDt;
      this.distLambdas.fill(0);
      this.dihedralLambdas.fill(0);
      this.isoLambdas.fill(0);

      for (let i = 0; i < this.vertexCount; i += 1) {
        const o = i * 3;
        if (invM[i] <= 0) {
          vel[o] = 0;
          vel[o + 1] = 0;
          vel[o + 2] = 0;
          prev[o] = pos[o];
          prev[o + 1] = pos[o + 1];
          prev[o + 2] = pos[o + 2];
          continue;
        }
        prev[o] = pos[o];
        prev[o + 1] = pos[o + 1];
        prev[o + 2] = pos[o + 2];

        const wv = this.sampleWindAt(pos[o], pos[o + 1], pos[o + 2], this.simTimeSec);
        vel[o] = (vel[o] + (this.gravity[0] + (wv[0] - vel[o]) * drag) * subDt) * dampFactor;
        vel[o + 1] = (vel[o + 1] + (this.gravity[1] + (wv[1] - vel[o + 1]) * drag) * subDt) * dampFactor;
        vel[o + 2] = (vel[o + 2] + (this.gravity[2] + (wv[2] - vel[o + 2]) * drag) * subDt) * dampFactor;
        pos[o] += vel[o] * subDt;
        pos[o + 1] += vel[o + 1] * subDt;
        pos[o + 2] += vel[o + 2] * subDt;
      }

      for (let iter = 0; iter < this.constraintIterations; iter += 1) {
        solvePairwiseDistanceBatch(pos, invM, this.distLambdas, this.distanceBatch, invDt2);
        this.solveDihedralBending(invDt2);
        solvePairwiseDistanceBatch(pos, invM, this.isoLambdas, this.isometricBatch, invDt2);
        collisionContactCount += this.projectBodyCollisions();
      }

      for (let i = 0; i < this.vertexCount; i += 1) {
        const o = i * 3;
        if (invM[i] <= 0) {
          vel[o] = 0;
          vel[o + 1] = 0;
          vel[o + 2] = 0;
          continue;
        }
        let vx = (pos[o] - prev[o]) * invSubDt;
        let vy = (pos[o + 1] - prev[o + 1]) * invSubDt;
        let vz = (pos[o + 2] - prev[o + 2]) * invSubDt;
        const spd = Math.hypot(vx, vy, vz);
        if (spd > this.maxVertexSpeed) {
          const k = this.maxVertexSpeed / spd;
          vx *= k;
          vy *= k;
          vz *= k;
        }
        vel[o] = vx;
        vel[o + 1] = vy;
        vel[o + 2] = vz;
      }
    }

    let residualBackend: NeuralResidualBackendKind | "disabled" = "disabled";
    if (this.residualHook) {
      const residual = this.residualHook.predictVelocityResidual({
        positions: pos,
        velocities: vel,
        invMasses: invM,
        timeSec: this.simTimeSec,
        dtSec: safeDt,
        windVector: this.sampleWindAt(0, 0, 0, this.simTimeSec),
      });
      residualBackend = residual.backend;
      for (let i = 0; i < this.vertexCount; i += 1) {
        if (invM[i] <= 0) continue;
        const o = i * 3;
        const rdx = residual.velocityDeltas[o];
        const rdy = residual.velocityDeltas[o + 1];
        const rdz = residual.velocityDeltas[o + 2];
        if (!Number.isFinite(rdx) || !Number.isFinite(rdy) || !Number.isFinite(rdz)) continue;
        let vx = vel[o] + rdx;
        let vy = vel[o + 1] + rdy;
        let vz = vel[o + 2] + rdz;
        const spd = Math.hypot(vx, vy, vz);
        if (spd > this.maxVertexSpeed) {
          const k = this.maxVertexSpeed / spd;
          vx *= k;
          vy *= k;
          vz *= k;
        }
        vel[o] = vx;
        vel[o + 1] = vy;
        vel[o + 2] = vz;
      }
    }

    return this.computeStepMetrics(substeps, invSubDt, collisionContactCount, residualBackend);
  }

  private computeStepMetrics(
    substepsExecuted: number,
    effectiveHz: number,
    collisionContactCount: number,
    residualBackend: NeuralResidualBackendKind | "disabled",
  ): XpbdStepMetrics {
    const pos = this.positions;
    const vel = this.velocities;
    const invM = this.invMasses;
    let maxSpeed = 0;
    let kineticEnergy = 0;
    let pinnedMaxDrift = 0;
    let hasNonFinite = false;
    let maxCapsulePenetration = 0;
    let maxSpherePenetration = 0;

    for (let i = 0; i < this.vertexCount; i += 1) {
      const o = i * 3;
      const px = pos[o];
      const py = pos[o + 1];
      const pz = pos[o + 2];
      const vx = vel[o];
      const vy = vel[o + 1];
      const vz = vel[o + 2];
      if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz) || !Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(vz)) {
        hasNonFinite = true;
        continue;
      }
      if (invM[i] <= 0) {
        pinnedMaxDrift = Math.max(
          pinnedMaxDrift,
          Math.hypot(px - this.initialPinnedPositions[o], py - this.initialPinnedPositions[o + 1], pz - this.initialPinnedPositions[o + 2]),
        );
      } else {
        const v2 = vx * vx + vy * vy + vz * vz;
        maxSpeed = Math.max(maxSpeed, Math.sqrt(v2));
        kineticEnergy += 0.5 * (1 / invM[i]) * v2;
        for (const sphere of this.sphereColliders) {
          maxSpherePenetration = Math.max(
            maxSpherePenetration,
            sphere.radius - Math.hypot(px - sphere.center[0], py - sphere.center[1], pz - sphere.center[2]),
          );
        }
        for (const cap of this.capsuleColliders) {
          const abx = cap.end[0] - cap.start[0];
          const aby = cap.end[1] - cap.start[1];
          const abz = cap.end[2] - cap.start[2];
          const abSq = abx * abx + aby * aby + abz * abz;
          const t =
            abSq > EPS
              ? clamp(((px - cap.start[0]) * abx + (py - cap.start[1]) * aby + (pz - cap.start[2]) * abz) / abSq, 0, 1)
              : 0;
          const dist = Math.hypot(px - (cap.start[0] + abx * t), py - (cap.start[1] + aby * t), pz - (cap.start[2] + abz * t));
          maxCapsulePenetration = Math.max(maxCapsulePenetration, cap.radius - dist);
        }
      }
    }

    let maxStretchRatio = 1;
    for (const c of this.distanceConstraints) {
      if (c.restLength <= EPS) continue;
      const oa = c.a * 3;
      const ob = c.b * 3;
      const ratio = Math.hypot(pos[ob] - pos[oa], pos[ob + 1] - pos[oa + 1], pos[ob + 2] - pos[oa + 2]) / c.restLength;
      if (ratio > maxStretchRatio) maxStretchRatio = ratio;
    }

    return {
      timeSec: this.simTimeSec,
      substepsExecuted,
      effectiveHz,
      maxSpeed,
      kineticEnergy,
      maxStretchRatio,
      maxCapsulePenetration,
      maxSpherePenetration,
      pinnedMaxDrift,
      collisionContactCount,
      hasNonFinite,
      residualBackend,
    };
  }
}
