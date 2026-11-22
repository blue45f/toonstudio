/**
 * 경량 PBD(Position-Based Dynamics) 의상 주름·드레이프 클린룸 솔버.
 *
 * - 거리 제약(구조·전단 XPBD compliance) + 4정점 이면각(dihedral) 굽힘 제약
 * - 중력 및 공간-시간 난류 바람 외력
 * - 캐릭터 구(sphere)·캡슐(capsule) 콜라이더 및 바닥 평면 충돌 투영 + 접선 마찰
 * - WGSL Compute 셰이더(`STUDIO_PBD_CLOTH_DRAPE_WGSL`)와 1:1 동일 수학 CPU 솔버
 * - NaN/Inf 복구·속도/변위 상한·감쇠 폭발 방지 가드 내장
 */

import type { IndexedTriangleMesh } from "./studio-3d-vector-lineart-math";
import {
  STUDIO_PBD_CLOTH_DRAPE_WGSL,
  STUDIO_PBD_CLOTH_WGSL_ENTRY_POINTS,
  STUDIO_PBD_CLOTH_WGSL_PARAM_FIELDS,
  STUDIO_PBD_CLOTH_WGSL_WORKGROUP_SIZE,
  buildPbdClothWebGpuSubstepPlan,
  packPbdClothUniforms,
  packPbdClothWebGpuBuffers,
  type PbdClothWebGpuBufferBundle,
  type PbdClothWebGpuPassDescriptor,
} from "./studio-pbd-cloth-drape-wgsl";
import {
  colorConstraintBatches,
  computeClothVertexNormals,
  computeDihedralAngle,
  createClothGarmentMesh,
  type ClothBendingConstraint,
  type ClothBodyCollider,
  type ClothCapsuleCollider,
  type ClothConstraintBatch,
  type ClothDistanceConstraint,
  type ClothGarmentMeshData,
  type ClothGarmentMeshOptions,
  type ClothGarmentPreset,
  type ClothPinMode,
  type ClothSphereCollider,
  type ClothVec3,
} from "./studio-pbd-cloth-garment-mesh";

export {
  STUDIO_PBD_CLOTH_DRAPE_WGSL,
  STUDIO_PBD_CLOTH_WGSL_ENTRY_POINTS,
  STUDIO_PBD_CLOTH_WGSL_PARAM_FIELDS,
  STUDIO_PBD_CLOTH_WGSL_WORKGROUP_SIZE,
  buildPbdClothWebGpuSubstepPlan,
  colorConstraintBatches,
  computeClothVertexNormals,
  computeDihedralAngle,
  createClothGarmentMesh,
  packPbdClothUniforms,
  packPbdClothWebGpuBuffers,
  type ClothBendingConstraint,
  type ClothBodyCollider,
  type ClothCapsuleCollider,
  type ClothConstraintBatch,
  type ClothDistanceConstraint,
  type ClothGarmentMeshData,
  type ClothGarmentMeshOptions,
  type ClothGarmentPreset,
  type ClothPinMode,
  type ClothSphereCollider,
  type ClothVec3,
  type PbdClothWebGpuBufferBundle,
  type PbdClothWebGpuPassDescriptor,
};

export interface PbdClothSolverConfig {
  readonly gravity?: ClothVec3;
  readonly wind?: ClothVec3;
  readonly windGustFrequencyHz?: number;
  readonly windTurbulence?: number;
  readonly timeStepSec?: number;
  readonly subSteps?: number;
  readonly solverIterations?: number;
  /** 서브스텝 속도 감쇠 계수(0..0.95). 기본 `0.03`. */
  readonly damping?: number;
  /** 폭발 방지 최대 파티클 속도(m/s). 기본 `20`. */
  readonly maxSpeed?: number;
  /** 서브스텝당 최대 변위(m). 기본 `0.2`. */
  readonly maxSubstepDisplacement?: number;
  /** 충돌 여유 두께(m). 기본 `0.006`. */
  readonly collisionMargin?: number;
  /** 선택적 바닥 충돌 평면 Y 좌표(null이면 비활성). */
  readonly groundY?: number | null;
}

export interface ResolvedPbdClothSolverConfig {
  readonly gravity: ClothVec3;
  readonly wind: ClothVec3;
  readonly windGustFrequencyHz: number;
  readonly windTurbulence: number;
  readonly timeStepSec: number;
  readonly subSteps: number;
  readonly solverIterations: number;
  readonly damping: number;
  readonly maxSpeed: number;
  readonly maxSubstepDisplacement: number;
  readonly collisionMargin: number;
  readonly groundY: number | null;
}

interface NormalizedCollider {
  readonly id: string;
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  readonly ex: number;
  readonly ey: number;
  readonly ez: number;
  readonly radius: number;
  readonly friction: number;
}

export interface PbdClothDiagnostics {
  readonly simTimeSec: number;
  readonly totalSteps: number;
  readonly particleCount: number;
  readonly pinnedCount: number;
  readonly distanceConstraintCount: number;
  readonly bendingConstraintCount: number;
  readonly distanceBatchCount: number;
  readonly bendingBatchCount: number;
  readonly nanGuardsTriggered: number;
  readonly maxParticleSpeed: number;
  readonly maxStretchRatio: number;
  readonly maxColliderPenetration: number;
  readonly averageDihedralBendRad: number;
  readonly allFinite: boolean;
}

const MAX_COORD = 1000;
const SAFE_LIMIT = 10_000;

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

function sanitizeVec3(v: ClothVec3 | undefined, fallback: ClothVec3, maxAbs = 200): ClothVec3 {
  if (!v) return fallback;
  return [clamp(v[0], -maxAbs, maxAbs), clamp(v[1], -maxAbs, maxAbs), clamp(v[2], -maxAbs, maxAbs)];
}

function isSafeVec3(x: number, y: number, z: number): boolean {
  return (
    Number.isFinite(x) && Math.abs(x) < SAFE_LIMIT &&
    Number.isFinite(y) && Math.abs(y) < SAFE_LIMIT &&
    Number.isFinite(z) && Math.abs(z) < SAFE_LIMIT
  );
}

function resolveSolverConfig(config?: PbdClothSolverConfig): ResolvedPbdClothSolverConfig {
  return {
    gravity: sanitizeVec3(config?.gravity, [0, -9.81, 0], 100),
    wind: sanitizeVec3(config?.wind, [0, 0, 0], 100),
    windGustFrequencyHz: clamp(config?.windGustFrequencyHz ?? 0.85, 0, 20),
    windTurbulence: clamp(config?.windTurbulence ?? 0.25, 0, 5),
    timeStepSec: clamp(config?.timeStepSec ?? 1 / 60, 1 / 480, 1 / 15),
    subSteps: Math.max(1, Math.min(32, Math.floor(config?.subSteps ?? 4))),
    solverIterations: Math.max(1, Math.min(24, Math.floor(config?.solverIterations ?? 4))),
    damping: clamp(config?.damping ?? 0.03, 0, 0.95),
    maxSpeed: clamp(config?.maxSpeed ?? 20, 0.1, 200),
    maxSubstepDisplacement: clamp(config?.maxSubstepDisplacement ?? 0.2, 0.005, 5),
    collisionMargin: clamp(config?.collisionMargin ?? 0.006, 0, 0.25),
    groundY:
      config?.groundY !== undefined && config.groundY !== null && Number.isFinite(config.groundY)
        ? clamp(config.groundY, -MAX_COORD, MAX_COORD)
        : null,
  };
}

function normalizeColliders(colliders: readonly ClothBodyCollider[]): readonly NormalizedCollider[] {
  const out: NormalizedCollider[] = [];
  for (const col of colliders) {
    const radius = clamp(col.radius, 0.001, 50);
    const friction = clamp(col.friction ?? 0.35, 0, 1);
    if (col.kind === "sphere") {
      const c = sanitizeVec3(col.center, [0, 0, 0], MAX_COORD);
      out.push({ id: col.id, sx: c[0], sy: c[1], sz: c[2], ex: c[0], ey: c[1], ez: c[2], radius, friction });
    } else {
      const s = sanitizeVec3(col.start, [0, 0, 0], MAX_COORD);
      const e = sanitizeVec3(col.end, [0, 1, 0], MAX_COORD);
      out.push({ id: col.id, sx: s[0], sy: s[1], sz: s[2], ex: e[0], ey: e[1], ez: e[2], radius, friction });
    }
  }
  return out;
}

/**
 * WebGPU WGSL Compute 셰이더와 1:1 동일 수학으로 동작하는 경량 PBD 의상 드레이프 솔버.
 */
export class StudioPbdClothDrapeSolver {
  private readonly mesh: ClothGarmentMeshData;
  private readonly restPositions: Float32Array;
  private readonly positions: Float32Array;
  private readonly predicted: Float32Array;
  private readonly velocities: Float32Array;
  private readonly invMasses: Float32Array;
  private readonly orderedDistance: readonly ClothDistanceConstraint[];
  private readonly distanceBatches: readonly ClothConstraintBatch[];
  private readonly orderedBending: readonly ClothBendingConstraint[];
  private readonly bendingBatches: readonly ClothConstraintBatch[];
  private colliders: readonly NormalizedCollider[] = [];
  private config: ResolvedPbdClothSolverConfig;
  private simTimeSec = 0;
  private totalSteps = 0;
  private nanGuardsTriggered = 0;

  constructor(
    mesh: ClothGarmentMeshData,
    config?: PbdClothSolverConfig,
    colliders?: readonly ClothBodyCollider[],
  ) {
    this.mesh = mesh;
    this.restPositions = Float32Array.from(mesh.positions);
    this.positions = Float32Array.from(mesh.positions);
    this.predicted = Float32Array.from(mesh.positions);
    this.velocities = new Float32Array(mesh.particleCount * 3);
    this.invMasses = Float32Array.from(mesh.invMasses);
    this.config = resolveSolverConfig(config);
    if (colliders) this.colliders = normalizeColliders(colliders);

    const distColored = colorConstraintBatches(mesh.distanceConstraints, (c) => [c.p1, c.p2]);
    this.orderedDistance = distColored.ordered;
    this.distanceBatches = distColored.batches;

    const bendColored = colorConstraintBatches(mesh.bendingConstraints, (c) => [c.p1, c.p2, c.p3, c.p4]);
    this.orderedBending = bendColored.ordered;
    this.bendingBatches = bendColored.batches;
  }

  public getConfig(): ResolvedPbdClothSolverConfig {
    return this.config;
  }

  public setConfig(patch: PbdClothSolverConfig): void {
    this.config = resolveSolverConfig({ ...this.config, ...patch });
  }

  public setColliders(colliders: readonly ClothBodyCollider[]): void {
    this.colliders = normalizeColliders(colliders);
  }

  public getPositions(): Float32Array {
    return this.positions;
  }

  public getVelocities(): Float32Array {
    return this.velocities;
  }

  public getInvMasses(): Float32Array {
    return this.invMasses;
  }

  public getIndices(): Uint32Array {
    return this.mesh.indices;
  }

  public pinParticle(index: number, position?: ClothVec3): void {
    if (index < 0 || index >= this.mesh.particleCount) return;
    this.invMasses[index] = 0;
    this.velocities[index * 3] = 0;
    this.velocities[index * 3 + 1] = 0;
    this.velocities[index * 3 + 2] = 0;
    if (position) {
      const safe = sanitizeVec3(position, [0, 0, 0], MAX_COORD);
      this.positions[index * 3] = safe[0];
      this.positions[index * 3 + 1] = safe[1];
      this.positions[index * 3 + 2] = safe[2];
      this.predicted[index * 3] = safe[0];
      this.predicted[index * 3 + 1] = safe[1];
      this.predicted[index * 3 + 2] = safe[2];
    }
  }

  public unpinParticle(index: number, invMass = 20): void {
    if (index < 0 || index >= this.mesh.particleCount) return;
    this.invMasses[index] = clamp(invMass, 1e-4, 1000);
  }

  public reset(): void {
    this.positions.set(this.restPositions);
    this.predicted.set(this.restPositions);
    this.velocities.fill(0);
    this.invMasses.set(this.mesh.invMasses);
    this.simTimeSec = 0;
    this.totalSteps = 0;
    this.nanGuardsTriggered = 0;
  }

  /** 시뮬레이션을 1 프레임(`dtSec` 미지정 시 `config.timeStepSec`) 전진시킨다. */
  public step(dtSec?: number): void {
    const frameDt = clamp(dtSec ?? this.config.timeStepSec, 1 / 480, 1 / 15);
    const subDt = frameDt / this.config.subSteps;
    const dampingFactor = Math.pow(1 - this.config.damping, 1 / this.config.subSteps);

    for (let s = 0; s < this.config.subSteps; s += 1) {
      this.simTimeSec += subDt;
      this.runPredictPass(subDt, dampingFactor);
      for (let iter = 0; iter < this.config.solverIterations; iter += 1) {
        this.runDistanceBatchPass(subDt);
        this.runBendingBatchPass(subDt);
      }
      this.runColliderAndIntegratePass(subDt);
    }
    this.totalSteps += 1;
  }

  public stepMany(steps: number, dtSec?: number): void {
    const count = Math.max(0, Math.floor(steps));
    for (let i = 0; i < count; i += 1) this.step(dtSec);
  }

  private clampDisp(dx: number, dy: number, dz: number, maxLen: number): readonly [number, number, number] {
    if (!isSafeVec3(dx, dy, dz)) {
      this.nanGuardsTriggered += 1;
      return [0, 0, 0];
    }
    const lenSq = dx * dx + dy * dy + dz * dz;
    if (lenSq > maxLen * maxLen && lenSq > 1e-12) {
      const scale = maxLen / Math.sqrt(lenSq);
      return [dx * scale, dy * scale, dz * scale];
    }
    return [dx, dy, dz];
  }

  private runPredictPass(subDt: number, dampingFactor: number): void {
    const n = this.mesh.particleCount;
    const [gx, gy, gz] = this.config.gravity;
    const [wx, wy, wz] = this.config.wind;
    const gustFreq = this.config.windGustFrequencyHz;
    const turbAmp = this.config.windTurbulence;
    const simTime = this.simTimeSec;
    const maxSpeed = this.config.maxSpeed;
    const maxDisp = this.config.maxSubstepDisplacement;

    for (let i = 0; i < n; i += 1) {
      const off = i * 3;
      const w = this.invMasses[i] ?? 0;
      let px = this.positions[off] ?? 0;
      let py = this.positions[off + 1] ?? 0;
      let pz = this.positions[off + 2] ?? 0;
      if (!isSafeVec3(px, py, pz)) {
        px = this.restPositions[off] ?? 0;
        py = this.restPositions[off + 1] ?? 0;
        pz = this.restPositions[off + 2] ?? 0;
        this.positions[off] = px;
        this.positions[off + 1] = py;
        this.positions[off + 2] = pz;
        this.velocities[off] = 0;
        this.velocities[off + 1] = 0;
        this.velocities[off + 2] = 0;
        this.nanGuardsTriggered += 1;
      }
      if (w <= 0) {
        this.predicted[off] = px;
        this.predicted[off + 1] = py;
        this.predicted[off + 2] = pz;
        this.velocities[off] = 0;
        this.velocities[off + 1] = 0;
        this.velocities[off + 2] = 0;
        continue;
      }

      let vx = this.velocities[off] ?? 0;
      let vy = this.velocities[off + 1] ?? 0;
      let vz = this.velocities[off + 2] ?? 0;
      if (!isSafeVec3(vx, vy, vz)) {
        vx = 0;
        vy = 0;
        vz = 0;
        this.nanGuardsTriggered += 1;
      }

      const gust = 1 + 0.35 * Math.sin(simTime * 6.2831853 * gustFreq + px * 2.1 + pz * 1.7);
      const turb =
        turbAmp *
        (0.5 * Math.sin(simTime * 7.3 + py * 3.1) + 0.5 * Math.cos(simTime * 11.1 + px * 2.7));
      const windScale = gust + turb;

      const [nvx, nvy, nvz] = this.clampDisp(
        (vx + (gx + wx * windScale) * subDt) * dampingFactor,
        (vy + (gy + wy * windScale) * subDt) * dampingFactor,
        (vz + (gz + wz * windScale) * subDt) * dampingFactor,
        maxSpeed,
      );
      const [sdx, sdy, sdz] = this.clampDisp(nvx * subDt, nvy * subDt, nvz * subDt, maxDisp);

      this.velocities[off] = nvx;
      this.velocities[off + 1] = nvy;
      this.velocities[off + 2] = nvz;
      this.predicted[off] = px + sdx;
      this.predicted[off + 1] = py + sdy;
      this.predicted[off + 2] = pz + sdz;
    }
  }

  private runDistanceBatchPass(subDt: number): void {
    const dtSq = Math.max(subDt * subDt, 1e-10);
    const maxDisp = this.config.maxSubstepDisplacement;

    for (const c of this.orderedDistance) {
      const w1 = this.invMasses[c.p1] ?? 0;
      const w2 = this.invMasses[c.p2] ?? 0;
      const wSum = w1 + w2;
      if (wSum <= 1e-8) continue;

      const o1 = c.p1 * 3;
      const o2 = c.p2 * 3;
      const dx = (this.predicted[o1] ?? 0) - (this.predicted[o2] ?? 0);
      const dy = (this.predicted[o1 + 1] ?? 0) - (this.predicted[o2 + 1] ?? 0);
      const dz = (this.predicted[o1 + 2] ?? 0) - (this.predicted[o2 + 2] ?? 0);
      const dist = Math.hypot(dx, dy, dz);
      if (!Number.isFinite(dist) || dist <= 1e-6) continue;

      const deltaLambda = -(dist - c.restLength) / (wSum + c.compliance / dtSq);
      const invDist = 1 / dist;
      const [cx, cy, cz] = this.clampDisp(
        dx * invDist * deltaLambda,
        dy * invDist * deltaLambda,
        dz * invDist * deltaLambda,
        maxDisp,
      );

      if (w1 > 0) {
        this.predicted[o1] = (this.predicted[o1] ?? 0) + cx * w1;
        this.predicted[o1 + 1] = (this.predicted[o1 + 1] ?? 0) + cy * w1;
        this.predicted[o1 + 2] = (this.predicted[o1 + 2] ?? 0) + cz * w1;
      }
      if (w2 > 0) {
        this.predicted[o2] = (this.predicted[o2] ?? 0) - cx * w2;
        this.predicted[o2 + 1] = (this.predicted[o2 + 1] ?? 0) - cy * w2;
        this.predicted[o2 + 2] = (this.predicted[o2 + 2] ?? 0) - cz * w2;
      }
    }
  }

  private runBendingBatchPass(subDt: number): void {
    const dtSq = Math.max(subDt * subDt, 1e-10);
    const maxBendDisp = this.config.maxSubstepDisplacement * 0.5;

    for (const bc of this.orderedBending) {
      const w1 = this.invMasses[bc.p1] ?? 0;
      const w2 = this.invMasses[bc.p2] ?? 0;
      const w3 = this.invMasses[bc.p3] ?? 0;
      const w4 = this.invMasses[bc.p4] ?? 0;
      if (w1 + w2 + w3 + w4 <= 1e-8) continue;

      const o1 = bc.p1 * 3;
      const o2 = bc.p2 * 3;
      const o3 = bc.p3 * 3;
      const o4 = bc.p4 * 3;
      const x1 = this.predicted[o1] ?? 0;
      const y1 = this.predicted[o1 + 1] ?? 0;
      const z1 = this.predicted[o1 + 2] ?? 0;
      const e2x = (this.predicted[o2] ?? 0) - x1;
      const e2y = (this.predicted[o2 + 1] ?? 0) - y1;
      const e2z = (this.predicted[o2 + 2] ?? 0) - z1;
      const e3x = (this.predicted[o3] ?? 0) - x1;
      const e3y = (this.predicted[o3 + 1] ?? 0) - y1;
      const e3z = (this.predicted[o3 + 2] ?? 0) - z1;
      const e4x = (this.predicted[o4] ?? 0) - x1;
      const e4y = (this.predicted[o4 + 1] ?? 0) - y1;
      const e4z = (this.predicted[o4 + 2] ?? 0) - z1;

      const c1x = e2y * e3z - e2z * e3y;
      const c1y = e2z * e3x - e2x * e3z;
      const c1z = e2x * e3y - e2y * e3x;
      const c2x = e4y * e2z - e4z * e2y;
      const c2y = e4z * e2x - e4x * e2z;
      const c2z = e4x * e2y - e4y * e2x;
      const len1 = Math.hypot(c1x, c1y, c1z);
      const len2 = Math.hypot(c2x, c2y, c2z);
      if (len1 <= 1e-6 || len2 <= 1e-6) continue;

      const invL1 = 1 / len1;
      const invL2 = 1 / len2;
      const n1x = c1x * invL1;
      const n1y = c1y * invL1;
      const n1z = c1z * invL1;
      const n2x = c2x * invL2;
      const n2y = c2y * invL2;
      const n2z = c2z * invL2;

      const d = clamp(n1x * n2x + n1y * n2y + n1z * n2z, -0.999999, 0.999999);
      const cErr = Math.acos(d) - bc.restAngle;
      if (Math.abs(cErr) <= 1e-5) continue;

      const d1x = n2x - n1x * d;
      const d1y = n2y - n1y * d;
      const d1z = n2z - n1z * d;
      const d2x = n1x - n2x * d;
      const d2y = n1y - n2y * d;
      const d2z = n1z - n2z * d;

      const q3x = (d1y * e2z - d1z * e2y) * invL1;
      const q3y = (d1z * e2x - d1x * e2z) * invL1;
      const q3z = (d1x * e2y - d1y * e2x) * invL1;
      const q4x = (e2y * d2z - e2z * d2y) * invL2;
      const q4y = (e2z * d2x - e2x * d2z) * invL2;
      const q4z = (e2x * d2y - e2y * d2x) * invL2;
      const q2x = (e3y * d1z - e3z * d1y) * invL1 + (d2y * e4z - d2z * e4y) * invL2;
      const q2y = (e3z * d1x - e3x * d1z) * invL1 + (d2z * e4x - d2x * e4z) * invL2;
      const q2z = (e3x * d1y - e3y * d1x) * invL1 + (d2x * e4y - d2y * e4x) * invL2;
      const q1x = -(q2x + q3x + q4x);
      const q1y = -(q2y + q3y + q4y);
      const q1z = -(q2z + q3z + q4z);

      const oneMinusD2 = Math.max(0, 1 - d * d);
      const denom =
        w1 * (q1x * q1x + q1y * q1y + q1z * q1z) +
        w2 * (q2x * q2x + q2y * q2y + q2z * q2z) +
        w3 * (q3x * q3x + q3y * q3y + q3z * q3z) +
        w4 * (q4x * q4x + q4y * q4y + q4z * q4z) +
        (bc.compliance / dtSq) * oneMinusD2;
      if (denom <= 1e-10) continue;

      const factor = (cErr * Math.sqrt(oneMinusD2)) / denom;
      const applyVert = (off: number, w: number, qx: number, qy: number, qz: number) => {
        if (w <= 0) return;
        const [dx, dy, dz] = this.clampDisp(qx * w * factor, qy * w * factor, qz * w * factor, maxBendDisp);
        this.predicted[off] = (this.predicted[off] ?? 0) + dx;
        this.predicted[off + 1] = (this.predicted[off + 1] ?? 0) + dy;
        this.predicted[off + 2] = (this.predicted[off + 2] ?? 0) + dz;
      };
      applyVert(o1, w1, q1x, q1y, q1z);
      applyVert(o2, w2, q2x, q2y, q2z);
      applyVert(o3, w3, q3x, q3y, q3z);
      applyVert(o4, w4, q4x, q4y, q4z);
    }
  }

  private runColliderAndIntegratePass(subDt: number): void {
    const n = this.mesh.particleCount;
    const invDt = 1 / Math.max(subDt, 1e-6);
    const margin = this.config.collisionMargin;
    const maxDisp = this.config.maxSubstepDisplacement;
    const maxSpeed = this.config.maxSpeed;
    const groundY = this.config.groundY;

    for (let i = 0; i < n; i += 1) {
      const off = i * 3;
      const w = this.invMasses[i] ?? 0;
      const prevX = this.positions[off] ?? 0;
      const prevY = this.positions[off + 1] ?? 0;
      const prevZ = this.positions[off + 2] ?? 0;
      if (w <= 0) {
        this.predicted[off] = prevX;
        this.predicted[off + 1] = prevY;
        this.predicted[off + 2] = prevZ;
        this.velocities[off] = 0;
        this.velocities[off + 1] = 0;
        this.velocities[off + 2] = 0;
        continue;
      }

      let px = this.predicted[off] ?? prevX;
      let py = this.predicted[off + 1] ?? prevY;
      let pz = this.predicted[off + 2] ?? prevZ;
      if (!isSafeVec3(px, py, pz)) {
        px = prevX;
        py = prevY;
        pz = prevZ;
        this.nanGuardsTriggered += 1;
      }

      const [cdx, cdy, cdz] = this.clampDisp(px - prevX, py - prevY, pz - prevZ, maxDisp);
      px = prevX + cdx;
      py = prevY + cdy;
      pz = prevZ + cdz;

      for (const col of this.colliders) {
        const abx = col.ex - col.sx;
        const aby = col.ey - col.sy;
        const abz = col.ez - col.sz;
        const abLenSq = abx * abx + aby * aby + abz * abz;
        const t =
          abLenSq > 1e-10
            ? clamp(((px - col.sx) * abx + (py - col.sy) * aby + (pz - col.sz) * abz) / abLenSq, 0, 1)
            : 0;
        const qx = col.sx + abx * t;
        const qy = col.sy + aby * t;
        const qz = col.sz + abz * t;
        const dx = px - qx;
        const dy = py - qy;
        const dz = pz - qz;
        const dist = Math.hypot(dx, dy, dz);
        const targetR = col.radius + margin;
        if (dist < targetR) {
          const nx = dist > 1e-6 ? dx / dist : 0;
          const ny = dist > 1e-6 ? dy / dist : 1;
          const nz = dist > 1e-6 ? dz / dist : 0;
          px = qx + nx * targetR;
          py = qy + ny * targetR;
          pz = qz + nz * targetR;

          const dispX = px - prevX;
          const dispY = py - prevY;
          const dispZ = pz - prevZ;
          const dotN = dispX * nx + dispY * ny + dispZ * nz;
          px -= (dispX - nx * dotN) * col.friction;
          py -= (dispY - ny * dotN) * col.friction;
          pz -= (dispZ - nz * dotN) * col.friction;

          const postDx = px - qx;
          const postDy = py - qy;
          const postDz = pz - qz;
          const postDist = Math.hypot(postDx, postDy, postDz);
          if (postDist < targetR) {
            const pnx = postDist > 1e-6 ? postDx / postDist : nx;
            const pny = postDist > 1e-6 ? postDy / postDist : ny;
            const pnz = postDist > 1e-6 ? postDz / postDist : nz;
            px = qx + pnx * targetR;
            py = qy + pny * targetR;
            pz = qz + pnz * targetR;
          }
        }
      }

      if (groundY !== null) {
        const minY = groundY + margin;
        if (py < minY) {
          py = minY;
          px = prevX + (px - prevX) * 0.5;
          pz = prevZ + (pz - prevZ) * 0.5;
        }
      }

      px = clamp(px, -MAX_COORD, MAX_COORD);
      py = clamp(py, -MAX_COORD, MAX_COORD);
      pz = clamp(pz, -MAX_COORD, MAX_COORD);

      const [nvx, nvy, nvz] = this.clampDisp(
        (px - prevX) * invDt,
        (py - prevY) * invDt,
        (pz - prevZ) * invDt,
        maxSpeed,
      );

      this.positions[off] = px;
      this.positions[off + 1] = py;
      this.positions[off + 2] = pz;
      this.predicted[off] = px;
      this.predicted[off + 1] = py;
      this.predicted[off + 2] = pz;
      this.velocities[off] = nvx;
      this.velocities[off + 1] = nvy;
      this.velocities[off + 2] = nvz;
    }
  }

  public computeVertexNormals(): Float32Array {
    return computeClothVertexNormals(this.positions, this.mesh.indices, this.mesh.particleCount);
  }

  public toIndexedTriangleMesh(): IndexedTriangleMesh {
    return {
      positions: Float32Array.from(this.positions),
      indices: Uint32Array.from(this.mesh.indices),
    };
  }

  public buildWebGpuBuffers(): PbdClothWebGpuBufferBundle {
    return packPbdClothWebGpuBuffers({
      particleCount: this.mesh.particleCount,
      positions: this.positions,
      predicted: this.predicted,
      velocities: this.velocities,
      invMasses: this.invMasses,
      orderedDistance: this.orderedDistance,
      orderedBending: this.orderedBending,
      colliders: this.colliders,
      distanceBatches: this.distanceBatches,
      bendingBatches: this.bendingBatches,
      solverIterations: this.config.solverIterations,
    });
  }

  public computeDiagnostics(): PbdClothDiagnostics {
    const n = this.mesh.particleCount;
    let pinnedCount = 0;
    let maxSpeed = 0;
    let allFinite = true;
    let maxPenetration = 0;
    const margin = this.config.collisionMargin;

    for (let i = 0; i < n; i += 1) {
      const w = this.invMasses[i] ?? 0;
      if (w <= 0) pinnedCount += 1;
      const off = i * 3;
      const px = this.positions[off] ?? 0;
      const py = this.positions[off + 1] ?? 0;
      const pz = this.positions[off + 2] ?? 0;
      const vx = this.velocities[off] ?? 0;
      const vy = this.velocities[off + 1] ?? 0;
      const vz = this.velocities[off + 2] ?? 0;
      if (!isSafeVec3(px, py, pz) || !isSafeVec3(vx, vy, vz)) allFinite = false;
      const speed = Math.hypot(vx, vy, vz);
      if (speed > maxSpeed) maxSpeed = speed;

      if (w > 0) {
        for (const col of this.colliders) {
          const abx = col.ex - col.sx;
          const aby = col.ey - col.sy;
          const abz = col.ez - col.sz;
          const abLenSq = abx * abx + aby * aby + abz * abz;
          const t =
            abLenSq > 1e-10
              ? clamp(((px - col.sx) * abx + (py - col.sy) * aby + (pz - col.sz) * abz) / abLenSq, 0, 1)
              : 0;
          const dist = Math.hypot(
            px - (col.sx + abx * t),
            py - (col.sy + aby * t),
            pz - (col.sz + abz * t),
          );
          const pen = col.radius + margin - dist;
          if (pen > maxPenetration) maxPenetration = pen;
        }
      }
    }

    let maxStretchRatio = 1;
    for (const c of this.orderedDistance) {
      const o1 = c.p1 * 3;
      const o2 = c.p2 * 3;
      const dist = Math.hypot(
        (this.positions[o1] ?? 0) - (this.positions[o2] ?? 0),
        (this.positions[o1 + 1] ?? 0) - (this.positions[o2 + 1] ?? 0),
        (this.positions[o1 + 2] ?? 0) - (this.positions[o2 + 2] ?? 0),
      );
      const ratio = dist / Math.max(c.restLength, 1e-6);
      if (ratio > maxStretchRatio) maxStretchRatio = ratio;
    }

    let sumBend = 0;
    for (const bc of this.orderedBending) {
      sumBend += Math.abs(
        computeDihedralAngle(this.positions, bc.p1, bc.p2, bc.p3, bc.p4) - bc.restAngle,
      );
    }

    return {
      simTimeSec: this.simTimeSec,
      totalSteps: this.totalSteps,
      particleCount: n,
      pinnedCount,
      distanceConstraintCount: this.orderedDistance.length,
      bendingConstraintCount: this.orderedBending.length,
      distanceBatchCount: this.distanceBatches.length,
      bendingBatchCount: this.bendingBatches.length,
      nanGuardsTriggered: this.nanGuardsTriggered,
      maxParticleSpeed: maxSpeed,
      maxStretchRatio,
      maxColliderPenetration: maxPenetration,
      averageDihedralBendRad:
        this.orderedBending.length > 0 ? sumBend / this.orderedBending.length : 0,
      allFinite,
    };
  }
}
