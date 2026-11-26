/**
 * 120Hz XPBD 의상·스커트·망토·웹툰 헤어 소프트바디 타입 계약, 에셋 빌더 및
 * 선택적 WebNN / ₩0 결정적 신경망 잔차 속도 보정 훅.
 */

import type { Vec3 } from "./mesh-qem-decimator-retargeter";

export type XpbdAssetKind = "cloth" | "skirt" | "cape" | "hair-strands";
export type NeuralResidualBackendKind = "webnn-npu" | "deterministic-cpu-fallback";

export interface XpbdDistanceConstraint {
  readonly a: number;
  readonly b: number;
  readonly restLength: number;
  readonly compliance: number;
}

export interface XpbdDihedralBendingConstraint {
  readonly p0: number;
  readonly p1: number;
  readonly p2: number;
  readonly p3: number;
  readonly restAngleRad: number;
  readonly compliance: number;
}

export interface XpbdIsometricBendingConstraint {
  readonly a: number;
  readonly b: number;
  readonly restDistance: number;
  readonly compliance: number;
}

export interface XpbdSphereCollider {
  readonly id: string;
  readonly center: Vec3;
  readonly radius: number;
  readonly friction?: number;
}

export interface XpbdCapsuleCollider {
  readonly id: string;
  readonly start: Vec3;
  readonly end: Vec3;
  readonly radius: number;
  readonly friction?: number;
}

export interface XpbdWindField {
  readonly baseVelocity: Vec3;
  readonly gustStrength: number;
  readonly gustFrequencyHz: number;
  readonly turbulenceSpatialScale?: number;
  readonly dragCoefficient?: number;
}

export interface XpbdSoftbodyDefinition {
  readonly kind: XpbdAssetKind;
  readonly positions: Float32Array;
  readonly invMasses: Float32Array;
  readonly triangles?: Uint32Array;
  readonly distanceConstraints: readonly XpbdDistanceConstraint[];
  readonly dihedralConstraints?: readonly XpbdDihedralBendingConstraint[];
  readonly isometricConstraints?: readonly XpbdIsometricBendingConstraint[];
}

export interface NeuralClothResidualInput {
  readonly positions: Float32Array;
  readonly velocities: Float32Array;
  readonly invMasses: Float32Array;
  readonly timeSec: number;
  readonly dtSec: number;
  readonly windVector: Vec3;
}

export interface NeuralClothResidualOutput {
  readonly velocityDeltas: Float32Array;
  readonly backend: NeuralResidualBackendKind;
  readonly appliedEnergyRatio: number;
}

export interface NeuralClothResidualHook {
  readonly backend: NeuralResidualBackendKind;
  predictVelocityResidual(input: NeuralClothResidualInput): NeuralClothResidualOutput;
}

export interface XpbdSolverConfig {
  readonly substepHz?: number;
  readonly maxSubstepsPerStep?: number;
  readonly constraintIterations?: number;
  readonly gravity?: Vec3;
  readonly wind?: XpbdWindField;
  readonly airDamping?: number;
  readonly collisionThickness?: number;
  readonly maxVertexSpeed?: number;
  readonly sphereColliders?: readonly XpbdSphereCollider[];
  readonly capsuleColliders?: readonly XpbdCapsuleCollider[];
  readonly neuralResidualHook?: NeuralClothResidualHook | null;
}

export interface XpbdStepMetrics {
  readonly timeSec: number;
  readonly substepsExecuted: number;
  readonly effectiveHz: number;
  readonly maxSpeed: number;
  readonly kineticEnergy: number;
  readonly maxStretchRatio: number;
  readonly maxCapsulePenetration: number;
  readonly maxSpherePenetration: number;
  readonly pinnedMaxDrift: number;
  readonly collisionContactCount: number;
  readonly hasNonFinite: boolean;
  readonly residualBackend: NeuralResidualBackendKind | "disabled";
}

export interface ClothGridAssetOptions {
  readonly kind?: "cloth" | "skirt" | "cape";
  readonly columns: number;
  readonly rows: number;
  readonly widthMeters: number;
  readonly heightMeters: number;
  readonly origin?: Vec3;
  readonly orientation?: "vertical-xy" | "horizontal-xz";
  readonly pinnedIndices?: readonly number[];
  readonly structuralCompliance?: number;
  readonly shearCompliance?: number;
  readonly bendingCompliance?: number;
  readonly vertexMass?: number;
}

export interface HairStrandBundleOptions {
  readonly strandCount: number;
  readonly segmentsPerStrand: number;
  readonly segmentLengthMeters: number;
  readonly rootArcRadiusMeters?: number;
  readonly origin?: Vec3;
  readonly distanceCompliance?: number;
  readonly bendingCompliance?: number;
  readonly vertexMass?: number;
}

const EPS = 1e-7;

function clamp(v: number, min: number, max: number): number {
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;
}

/** WebNN 신경망 잔차 가속기 사용 가능 여부를 ₩0 로컬 기준으로 탐지한다. */
export function probeWebNnClothResidualSupport(): {
  readonly hasWebNn: boolean;
  readonly selectedBackend: NeuralResidualBackendKind;
  readonly zeroServerCost: true;
} {
  const g = globalThis as { readonly navigator?: { readonly ml?: unknown } };
  const hasWebNn = Boolean(g.navigator && typeof g.navigator.ml === "object" && g.navigator.ml !== null);
  return {
    hasWebNn,
    selectedBackend: hasWebNn ? "webnn-npu" : "deterministic-cpu-fallback",
    zeroServerCost: true,
  };
}

/**
 * WebNN 부재 환경에서도 미세 주름·공력 리플 잔차 속도를 안전하게 보정하는
 * 100% 로컬 결정적 신경망 잔차 폴백 훅을 생성한다.
 */
export function createDeterministicClothResidualHook(
  rippleGain = 0.08,
  maxDeltaSpeed = 0.45,
): NeuralClothResidualHook {
  const gain = clamp(rippleGain, 0, 0.5);
  const cap = clamp(maxDeltaSpeed, 0.01, 2.0);
  return {
    backend: "deterministic-cpu-fallback",
    predictVelocityResidual(input: NeuralClothResidualInput): NeuralClothResidualOutput {
      const n = input.invMasses.length;
      const deltas = new Float32Array(n * 3);
      const windMag = Math.hypot(input.windVector[0], input.windVector[1], input.windVector[2]);
      if (windMag <= 1e-4 || gain <= 0) {
        return { velocityDeltas: deltas, backend: "deterministic-cpu-fallback", appliedEnergyRatio: 0 };
      }

      let baseEnergy = 0;
      let deltaEnergy = 0;
      const wx = input.windVector[0] / windMag;
      const wy = input.windVector[1] / windMag;
      const wz = input.windVector[2] / windMag;
      const px = Math.abs(wy) < 0.9 ? -wz : 0;
      const py = Math.abs(wy) < 0.9 ? 0 : -wz;
      const pz = Math.abs(wy) < 0.9 ? wx : wy;
      const pLen = Math.hypot(px, py, pz) || 1;
      const nx = px / pLen;
      const ny = py / pLen;
      const nz = pz / pLen;

      const scale = Math.min(cap, gain * windMag * Math.min(1, input.dtSec * 60));
      for (let i = 0; i < n; i += 1) {
        if (input.invMasses[i] <= 0) continue;
        const o = i * 3;
        const vx = input.velocities[o];
        const vy = input.velocities[o + 1];
        const vz = input.velocities[o + 2];
        baseEnergy += vx * vx + vy * vy + vz * vz;

        const phase =
          input.positions[o] * 7.3 +
          input.positions[o + 1] * 5.1 +
          input.positions[o + 2] * 6.7 -
          input.timeSec * 9.5;
        const ripple = Math.sin(phase) * Math.cos(phase * 0.43 + i * 0.17) * scale;
        const dx = nx * ripple;
        const dy = ny * ripple * 0.35;
        const dz = nz * ripple;
        deltas[o] = dx;
        deltas[o + 1] = dy;
        deltas[o + 2] = dz;
        deltaEnergy += dx * dx + dy * dy + dz * dz;
      }

      return {
        velocityDeltas: deltas,
        backend: "deterministic-cpu-fallback",
        appliedEnergyRatio: baseEnergy > EPS ? Math.min(1, deltaEnergy / baseEnergy) : 0,
      };
    },
  };
}

/** 망토·스커트·의상 격자용 XPBD 소프트바디(구조·전단·이면각·등거리 굽힘 제약 포함)를 생성한다. */
export function createClothGridAsset(options: ClothGridAssetOptions): XpbdSoftbodyDefinition {
  const cols = Math.max(2, Math.floor(options.columns));
  const rows = Math.max(2, Math.floor(options.rows));
  const width = Math.max(0.05, options.widthMeters);
  const height = Math.max(0.05, options.heightMeters);
  const origin = options.origin ?? [0, 1.4, 0];
  const orient = options.orientation ?? "vertical-xy";
  const vertexCount = cols * rows;
  const positions = new Float32Array(vertexCount * 3);
  const invMasses = new Float32Array(vertexCount);
  const invMass = 1 / Math.max(1e-4, options.vertexMass ?? 0.04);
  const pinned = new Set<number>(
    options.pinnedIndices ?? Array.from({ length: cols }, (_, c) => c),
  );

  for (let r = 0; r < rows; r += 1) {
    const v = r / (rows - 1);
    for (let c = 0; c < cols; c += 1) {
      const u = c / (cols - 1) - 0.5;
      const idx = r * cols + c;
      positions[idx * 3] = origin[0] + u * width;
      if (orient === "vertical-xy") {
        positions[idx * 3 + 1] = origin[1] - v * height;
        positions[idx * 3 + 2] = origin[2];
      } else {
        positions[idx * 3 + 1] = origin[1];
        positions[idx * 3 + 2] = origin[2] + v * height;
      }
      invMasses[idx] = pinned.has(idx) ? 0 : invMass;
    }
  }

  const distAt = (a: number, b: number): number =>
    Math.hypot(
      positions[b * 3] - positions[a * 3],
      positions[b * 3 + 1] - positions[a * 3 + 1],
      positions[b * 3 + 2] - positions[a * 3 + 2],
    );

  const structuralCompliance = Math.max(0, options.structuralCompliance ?? 1e-6);
  const shearCompliance = Math.max(0, options.shearCompliance ?? 5e-5);
  const bendingCompliance = Math.max(0, options.bendingCompliance ?? 2e-3);

  const distanceConstraints: XpbdDistanceConstraint[] = [];
  const dihedralConstraints: XpbdDihedralBendingConstraint[] = [];
  const isometricConstraints: XpbdIsometricBendingConstraint[] = [];
  const triList: number[] = [];

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c;
      if (c + 1 < cols) {
        distanceConstraints.push({ a: i, b: i + 1, restLength: distAt(i, i + 1), compliance: structuralCompliance });
      }
      if (r + 1 < rows) {
        const down = (r + 1) * cols + c;
        distanceConstraints.push({ a: i, b: down, restLength: distAt(i, down), compliance: structuralCompliance });
      }
      if (c + 1 < cols && r + 1 < rows) {
        const i00 = i;
        const i10 = i + 1;
        const i01 = (r + 1) * cols + c;
        const i11 = i01 + 1;
        distanceConstraints.push({ a: i00, b: i11, restLength: distAt(i00, i11), compliance: shearCompliance });
        distanceConstraints.push({ a: i10, b: i01, restLength: distAt(i10, i01), compliance: shearCompliance });
        triList.push(i00, i01, i10, i10, i01, i11);
        dihedralConstraints.push({
          p0: i10,
          p1: i01,
          p2: i00,
          p3: i11,
          restAngleRad: 0,
          compliance: bendingCompliance,
        });
      }
      if (c + 2 < cols) {
        isometricConstraints.push({ a: i, b: i + 2, restDistance: distAt(i, i + 2), compliance: bendingCompliance });
      }
      if (r + 2 < rows) {
        const down2 = (r + 2) * cols + c;
        isometricConstraints.push({ a: i, b: down2, restDistance: distAt(i, down2), compliance: bendingCompliance });
      }
    }
  }

  return {
    kind: options.kind ?? "cloth",
    positions,
    invMasses,
    triangles: new Uint32Array(triList),
    distanceConstraints,
    dihedralConstraints,
    isometricConstraints,
  };
}

/** 웹툰 캐릭터 다중 헤어 가닥(루트 고정 + 세그먼트 거리 + 등거리 굽힘 제약)을 생성한다. */
export function createHairStrandBundleAsset(options: HairStrandBundleOptions): XpbdSoftbodyDefinition {
  const strandCount = Math.max(1, Math.floor(options.strandCount));
  const segs = Math.max(2, Math.floor(options.segmentsPerStrand));
  const segLen = Math.max(0.01, options.segmentLengthMeters);
  const radius = Math.max(0.02, options.rootArcRadiusMeters ?? 0.11);
  const origin = options.origin ?? [0, 1.66, 0];
  const invMass = 1 / Math.max(1e-4, options.vertexMass ?? 0.015);
  const distComp = Math.max(0, options.distanceCompliance ?? 1e-6);
  const bendComp = Math.max(0, options.bendingCompliance ?? 8e-4);

  const vertsPerStrand = segs + 1;
  const totalVerts = strandCount * vertsPerStrand;
  const positions = new Float32Array(totalVerts * 3);
  const invMasses = new Float32Array(totalVerts);
  const distanceConstraints: XpbdDistanceConstraint[] = [];
  const isometricConstraints: XpbdIsometricBendingConstraint[] = [];

  for (let s = 0; s < strandCount; s += 1) {
    const frac = strandCount > 1 ? s / (strandCount - 1) - 0.5 : 0;
    const angle = frac * Math.PI * 0.9;
    const rx = Math.sin(angle) * radius;
    const rz = -Math.cos(angle) * radius;
    const baseIdx = s * vertsPerStrand;

    for (let k = 0; k < vertsPerStrand; k += 1) {
      const vIdx = baseIdx + k;
      positions[vIdx * 3] = origin[0] + rx * (1 + k * 0.04);
      positions[vIdx * 3 + 1] = origin[1] - k * segLen;
      positions[vIdx * 3 + 2] = origin[2] + rz * (1 + k * 0.04);
      invMasses[vIdx] = k === 0 ? 0 : invMass;

      if (k > 0) {
        const prev = vIdx - 1;
        const len = Math.hypot(
          positions[vIdx * 3] - positions[prev * 3],
          positions[vIdx * 3 + 1] - positions[prev * 3 + 1],
          positions[vIdx * 3 + 2] - positions[prev * 3 + 2],
        );
        distanceConstraints.push({ a: prev, b: vIdx, restLength: len, compliance: distComp });
      }
      if (k > 1) {
        const prev2 = vIdx - 2;
        const span = Math.hypot(
          positions[vIdx * 3] - positions[prev2 * 3],
          positions[vIdx * 3 + 1] - positions[prev2 * 3 + 1],
          positions[vIdx * 3 + 2] - positions[prev2 * 3 + 2],
        );
        isometricConstraints.push({ a: prev2, b: vIdx, restDistance: span, compliance: bendComp });
      }
    }
  }

  return {
    kind: "hair-strands",
    positions,
    invMasses,
    distanceConstraints,
    isometricConstraints,
  };
}
