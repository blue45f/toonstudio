/**
 * Wave 75: 3D 포즈 연동 의상 주름 물리 엔진 (Pose-to-Fold Garment Physics Solver).
 *
 * 3D 골격 관절의 굴곡·축 비틀림·앵커 현수·중력에서 국소 2D 표면 변형률 텐서를 계산하고,
 * 고전 드로잉 7대 주름 위상(pipe, zigzag-compression, spiral-twist, half-lock,
 * diaper-sling, drop-fold, inert-pool)을 2D 화면 투영 3차 베지에 스트로크로 해법한다.
 */

export interface Vec2 { readonly x: number; readonly y: number; }
export interface Vec3 { readonly x: number; readonly y: number; readonly z: number; }
export interface CubicBezier2d { readonly p0: Vec2; readonly p1: Vec2; readonly p2: Vec2; readonly p3: Vec2; }

export type SkeletonJointName =
  | "neck" | "leftShoulder" | "rightShoulder" | "leftElbow" | "rightElbow"
  | "leftWrist" | "rightWrist" | "spineUpper" | "spineLower" | "pelvis"
  | "leftHip" | "rightHip" | "leftKnee" | "rightKnee" | "leftAnkle" | "rightAnkle";

export interface SkeletonJoint3d {
  readonly position: Vec3;
  /** 관절 굽힘 각도(도, 0 = 완전 신전). 생략 시 인접 뼈 벡터 각도로 자동 계산 */
  readonly flexionDeg?: number;
  /** 뼈 축 기준 비틀림 각도(도, 양수/음수로 나선 방향 결정) */
  readonly twistDeg?: number;
}

export interface CharacterPoseSkeleton3d {
  readonly joints: Readonly<Record<SkeletonJointName, SkeletonJoint3d>>;
  /** 바닥 접촉 높이(m, 기본 0) */
  readonly floorY?: number;
}

export type GarmentFabricPresetId =
  | "cotton-shirt" | "wool-blazer" | "silk-dress"
  | "denim-jacket" | "pleated-skirt" | "flowing-cape";

export interface GarmentFabricCoverage {
  readonly torso: boolean;
  readonly sleeves: boolean;
  readonly skirtOrHem: boolean;
  readonly capeClasp: boolean;
  readonly floorPool: boolean;
}

export interface GarmentFabricSpec {
  readonly id: GarmentFabricPresetId;
  readonly labelKo: string;
  readonly bendingStiffness: number;
  readonly stretchResistance: number;
  readonly arealDensityGsm: number;
  readonly foldFrequencyScale: number;
  readonly curvatureSoftness: number;
  readonly drapeLengthFactor: number;
  readonly coverage: GarmentFabricCoverage;
}

export type GarmentFoldTopology =
  | "pipe-fold" | "zigzag-compression" | "spiral-twist" | "half-lock"
  | "diaper-sling" | "drop-fold" | "inert-pool";

export type FoldMechanicalMode = "tension" | "compression" | "shear" | "gravity-drape";

export interface GarmentRegionStrainTensor {
  readonly region: string;
  readonly epsilonLongitudinal: number;
  readonly epsilonTransverse: number;
  readonly gammaShear: number;
  readonly principalStrain1: number;
  readonly principalStrain2: number;
  readonly principalAngleRad: number;
  /** Cerda-Mahadevan 박막 주름 이론 기반 특성 파장(m) */
  readonly wrinklingWavelengthM: number;
}

export interface GarmentFoldStroke {
  readonly id: string;
  readonly topology: GarmentFoldTopology;
  readonly mode: FoldMechanicalMode;
  readonly region: string;
  readonly curve: CubicBezier2d;
  readonly strokeWidthStartPx: number;
  readonly strokeWidthMidPx: number;
  readonly strokeWidthEndPx: number;
  readonly depthIntensity: number;
  readonly curvatureSoftness: number;
  readonly isShadowSide: boolean;
  readonly strainMagnitude: number;
}

export interface PoseProjectionCamera {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly cameraPosition?: Vec3;
  readonly lookAt?: Vec3;
  readonly focalLengthMm?: number;
}

export interface SolvePoseToGarmentFoldsOptions {
  readonly skeleton: CharacterPoseSkeleton3d;
  readonly fabricPreset: GarmentFabricPresetId | GarmentFabricSpec;
  readonly gravity?: Vec3;
  readonly camera?: PoseProjectionCamera;
  readonly baseInkWidthPx?: number;
}

export interface GarmentFoldMetrics {
  readonly totalFolds: number;
  readonly tensionFoldCount: number;
  readonly compressionFoldCount: number;
  readonly averageFoldFrequencyPerMeter: number;
  readonly averageCurvatureSoftness: number;
  readonly averageShadowStrokeWidthPx: number;
  readonly averageTensionStrokeWidthPx: number;
}

export interface GarmentFoldSolution {
  readonly fabric: GarmentFabricSpec;
  readonly gravity: Vec3;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly folds: readonly GarmentFoldStroke[];
  readonly regionStrains: readonly GarmentRegionStrainTensor[];
  readonly topologyCounts: Readonly<Record<GarmentFoldTopology, number>>;
  readonly metrics: GarmentFoldMetrics;
}

export const GARMENT_FABRIC_PRESETS: Readonly<Record<GarmentFabricPresetId, GarmentFabricSpec>> = {
  "cotton-shirt": {
    id: "cotton-shirt", labelKo: "면 셔츠", bendingStiffness: 0.42, stretchResistance: 0.65,
    arealDensityGsm: 145, foldFrequencyScale: 1.15, curvatureSoftness: 0.68, drapeLengthFactor: 0.62,
    coverage: { torso: true, sleeves: true, skirtOrHem: false, capeClasp: false, floorPool: false },
  },
  "wool-blazer": {
    id: "wool-blazer", labelKo: "울 블레이저", bendingStiffness: 0.78, stretchResistance: 0.84,
    arealDensityGsm: 310, foldFrequencyScale: 0.64, curvatureSoftness: 0.36, drapeLengthFactor: 0.54,
    coverage: { torso: true, sleeves: true, skirtOrHem: false, capeClasp: false, floorPool: false },
  },
  "silk-dress": {
    id: "silk-dress", labelKo: "실크 드레스", bendingStiffness: 0.14, stretchResistance: 0.48,
    arealDensityGsm: 68, foldFrequencyScale: 1.82, curvatureSoftness: 0.92, drapeLengthFactor: 1.08,
    coverage: { torso: true, sleeves: true, skirtOrHem: true, capeClasp: false, floorPool: true },
  },
  "denim-jacket": {
    id: "denim-jacket", labelKo: "데님 재킷", bendingStiffness: 0.88, stretchResistance: 0.92,
    arealDensityGsm: 420, foldFrequencyScale: 0.54, curvatureSoftness: 0.26, drapeLengthFactor: 0.46,
    coverage: { torso: true, sleeves: true, skirtOrHem: false, capeClasp: false, floorPool: false },
  },
  "pleated-skirt": {
    id: "pleated-skirt", labelKo: "플리츠 스커트", bendingStiffness: 0.48, stretchResistance: 0.72,
    arealDensityGsm: 195, foldFrequencyScale: 1.48, curvatureSoftness: 0.56, drapeLengthFactor: 0.82,
    coverage: { torso: true, sleeves: false, skirtOrHem: true, capeClasp: false, floorPool: false },
  },
  "flowing-cape": {
    id: "flowing-cape", labelKo: "유동 망토", bendingStiffness: 0.26, stretchResistance: 0.54,
    arealDensityGsm: 165, foldFrequencyScale: 1.36, curvatureSoftness: 0.84, drapeLengthFactor: 1.14,
    coverage: { torso: true, sleeves: false, skirtOrHem: true, capeClasp: true, floorPool: true },
  },
};

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const SENSOR_HEIGHT_MM = 24;

const clamp = (v: number, lo: number, hi: number): number =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;
const v3Add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const v3Sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const v3Scale = (v: Vec3, s: number): Vec3 => ({ x: v.x * s, y: v.y * s, z: v.z * s });
const v3Dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const v3Cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const v3Len = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);
const v3Norm = (v: Vec3, fb: Vec3 = { x: 0, y: 1, z: 0 }): Vec3 => {
  const len = v3Len(v);
  return len <= 1e-7 ? fb : { x: v.x / len, y: v.y / len, z: v.z / len };
};
const v3Lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

/** 표준 직립 인체 3D 골격(미터 단위, 키 약 1.72m)을 생성한다. */
export function createStandardPoseSkeleton3d(
  overrides?: Partial<Record<SkeletonJointName, Partial<SkeletonJoint3d>>>,
  floorY = 0,
): CharacterPoseSkeleton3d {
  const base: Record<SkeletonJointName, SkeletonJoint3d> = {
    neck: { position: { x: 0, y: 1.46, z: 0 }, flexionDeg: 0, twistDeg: 0 },
    leftShoulder: { position: { x: 0.21, y: 1.41, z: 0 }, flexionDeg: 6, twistDeg: 0 },
    rightShoulder: { position: { x: -0.21, y: 1.41, z: 0 }, flexionDeg: 6, twistDeg: 0 },
    leftElbow: { position: { x: 0.27, y: 1.11, z: 0.02 }, flexionDeg: 10, twistDeg: 0 },
    rightElbow: { position: { x: -0.27, y: 1.11, z: 0.02 }, flexionDeg: 10, twistDeg: 0 },
    leftWrist: { position: { x: 0.3, y: 0.84, z: 0.05 }, flexionDeg: 0, twistDeg: 0 },
    rightWrist: { position: { x: -0.3, y: 0.84, z: 0.05 }, flexionDeg: 0, twistDeg: 0 },
    spineUpper: { position: { x: 0, y: 1.28, z: 0 }, flexionDeg: 0, twistDeg: 0 },
    spineLower: { position: { x: 0, y: 1.08, z: 0 }, flexionDeg: 0, twistDeg: 0 },
    pelvis: { position: { x: 0, y: 0.94, z: 0 }, flexionDeg: 0, twistDeg: 0 },
    leftHip: { position: { x: 0.11, y: 0.92, z: 0 }, flexionDeg: 4, twistDeg: 0 },
    rightHip: { position: { x: -0.11, y: 0.92, z: 0 }, flexionDeg: 4, twistDeg: 0 },
    leftKnee: { position: { x: 0.12, y: 0.49, z: 0.01 }, flexionDeg: 5, twistDeg: 0 },
    rightKnee: { position: { x: -0.12, y: 0.49, z: 0.01 }, flexionDeg: 5, twistDeg: 0 },
    leftAnkle: { position: { x: 0.12, y: 0.07, z: 0 }, flexionDeg: 0, twistDeg: 0 },
    rightAnkle: { position: { x: -0.12, y: 0.07, z: 0 }, flexionDeg: 0, twistDeg: 0 },
  };
  if (!overrides) return { joints: base, floorY };

  const merged: Record<SkeletonJointName, SkeletonJoint3d> = { ...base };
  const keys = Object.keys(overrides) as SkeletonJointName[];
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const patch = overrides[key];
    if (patch && merged[key]) {
      const cur = merged[key];
      merged[key] = {
        position: patch.position ?? cur.position,
        flexionDeg: "flexionDeg" in patch ? patch.flexionDeg : cur.flexionDeg,
        twistDeg: "twistDeg" in patch ? patch.twistDeg : cur.twistDeg,
      };
    }
  }
  return { joints: merged, floorY };
}

interface CameraBasis {
  readonly position: Vec3;
  readonly forward: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly focalPixels: number;
}

function buildCameraBasis(camera?: PoseProjectionCamera): CameraBasis {
  const viewportWidth = clamp(camera?.viewportWidth ?? 800, 120, 4096);
  const viewportHeight = clamp(camera?.viewportHeight ?? 1000, 120, 4096);
  const position = camera?.cameraPosition ?? { x: 0, y: 1.02, z: 3.1 };
  const lookAt = camera?.lookAt ?? { x: 0, y: 0.92, z: 0 };
  const focalLengthMm = clamp(camera?.focalLengthMm ?? 50, 18, 200);
  const forward = v3Norm(v3Sub(lookAt, position), { x: 0, y: 0, z: -1 });
  const worldUp: Vec3 = Math.abs(forward.y) > 0.98 ? { x: 0, y: 0, z: -1 } : { x: 0, y: 1, z: 0 };
  const right = v3Norm(v3Cross(forward, worldUp), { x: 1, y: 0, z: 0 });
  const up = v3Norm(v3Cross(right, forward), { x: 0, y: 1, z: 0 });
  return {
    position, forward, right, up, viewportWidth, viewportHeight,
    focalPixels: (focalLengthMm / SENSOR_HEIGHT_MM) * viewportHeight,
  };
}

function projectPoint3d(point: Vec3, cam: CameraBasis): Vec2 {
  const rel = v3Sub(point, cam.position);
  const depth = Math.max(0.25, v3Dot(rel, cam.forward));
  const scale = cam.focalPixels / depth;
  return {
    x: cam.viewportWidth * 0.5 + v3Dot(rel, cam.right) * scale,
    y: cam.viewportHeight * 0.5 - v3Dot(rel, cam.up) * scale,
  };
}

function resolveJointFlexionDeg(parent: Vec3, joint: SkeletonJoint3d, child: Vec3): number {
  if (typeof joint.flexionDeg === "number" && Number.isFinite(joint.flexionDeg)) {
    return clamp(joint.flexionDeg, 0, 165);
  }
  const inDir = v3Norm(v3Sub(joint.position, parent), { x: 0, y: -1, z: 0 });
  const outDir = v3Norm(v3Sub(child, joint.position), { x: 0, y: -1, z: 0 });
  return clamp(Math.acos(clamp(v3Dot(inDir, outDir), -1, 1)) * RAD_TO_DEG, 0, 165);
}

/** 2D 평면 변형률 텐서로부터 주 변형률과 Cerda-Mahadevan 박막 주름 파장을 산출한다. */
function computeRegionStrainTensor(
  region: string, epsL: number, epsT: number, gamma: number, fabric: GarmentFabricSpec,
): GarmentRegionStrainTensor {
  const mean = 0.5 * (epsL + epsT);
  const radius = Math.hypot(0.5 * (epsL - epsT), 0.5 * gamma);
  const principalStrain1 = mean + radius;
  const principalStrain2 = mean - radius;
  const load = Math.max(0.06, Math.abs(principalStrain1) + Math.abs(principalStrain2) + Math.abs(gamma));
  const rawWavelength = 0.048 * Math.pow(Math.max(0.05, fabric.bendingStiffness) / load, 0.25);
  return {
    region,
    epsilonLongitudinal: epsL,
    epsilonTransverse: epsT,
    gammaShear: gamma,
    principalStrain1,
    principalStrain2,
    principalAngleRad: 0.5 * Math.atan2(gamma, epsL - epsT),
    wrinklingWavelengthM: clamp(rawWavelength / Math.max(0.35, fabric.foldFrequencyScale), 0.008, 0.16),
  };
}

function buildInkWidths(
  mode: FoldMechanicalMode, depth: number, isShadow: boolean, fabric: GarmentFabricSpec, basePx: number,
): { readonly start: number; readonly mid: number; readonly end: number } {
  const stiffnessWeight = 0.82 + fabric.bendingStiffness * 0.45;
  const shadowBoost = isShadow ? 1.38 : 0.92;
  const modeFactor = mode === "compression" ? 1.28 : mode === "shear" ? 1.06 : mode === "gravity-drape" ? 0.96 : 0.78;
  const mid = clamp(basePx * stiffnessWeight * shadowBoost * modeFactor * (0.65 + depth * 0.6), 0.5, 5.2);
  const taper = mode === "tension" ? 0.34 : isShadow ? 0.52 : 0.42;
  return { start: clamp(mid * taper, 0.35, mid), mid, end: clamp(mid * taper * 0.88, 0.3, mid) };
}

function computeOrthogonalFrame(axis: Vec3, hint: Vec3): { readonly u: Vec3; readonly v: Vec3 } {
  const u0 = v3Cross(axis, hint);
  const u = v3Len(u0) > 1e-4 ? v3Norm(u0) : v3Norm(v3Cross(axis, { x: 0, y: 0, z: 1 }), { x: 1, y: 0, z: 0 });
  return { u, v: v3Norm(v3Cross(axis, u), { x: 0, y: 0, z: 1 }) };
}

interface FoldBuilderContext {
  readonly fabric: GarmentFabricSpec;
  readonly gravityDir: Vec3;
  readonly gravityMagRatio: number;
  readonly cam: CameraBasis;
  readonly baseInkWidthPx: number;
  readonly folds: GarmentFoldStroke[];
  readonly strains: GarmentRegionStrainTensor[];
  nextId: number;
}

function pushFold(
  ctx: FoldBuilderContext,
  topology: GarmentFoldTopology,
  mode: FoldMechanicalMode,
  region: string,
  pts: readonly [Vec3, Vec3, Vec3, Vec3],
  depthIntensity: number,
  isShadowSide: boolean,
  strainMagnitude: number,
): void {
  const w = buildInkWidths(mode, depthIntensity, isShadowSide, ctx.fabric, ctx.baseInkWidthPx);
  ctx.nextId += 1;
  ctx.folds.push({
    id: `fold-${ctx.nextId}-${topology}`,
    topology,
    mode,
    region,
    curve: {
      p0: projectPoint3d(pts[0], ctx.cam),
      p1: projectPoint3d(pts[1], ctx.cam),
      p2: projectPoint3d(pts[2], ctx.cam),
      p3: projectPoint3d(pts[3], ctx.cam),
    },
    strokeWidthStartPx: w.start,
    strokeWidthMidPx: w.mid,
    strokeWidthEndPx: w.end,
    depthIntensity: clamp(depthIntensity, 0.05, 1),
    curvatureSoftness: ctx.fabric.curvatureSoftness,
    isShadowSide,
    strainMagnitude: Math.abs(strainMagnitude),
  });
}

function solveHingeJointFolds(
  ctx: FoldBuilderContext, region: string, parentPos: Vec3, joint: SkeletonJoint3d, childPos: Vec3, radiusM: number,
): void {
  const flexionDeg = resolveJointFlexionDeg(parentPos, joint, childPos);
  const upperDir = v3Norm(v3Sub(parentPos, joint.position), { x: 0, y: 1, z: 0 });
  const lowerDir = v3Norm(v3Sub(childPos, joint.position), { x: 0, y: -1, z: 0 });
  const rawBisector = v3Add(upperDir, lowerDir);
  const innerCreaseDir = v3Len(rawBisector) > 0.08
    ? v3Norm(rawBisector)
    : v3Norm(v3Cross(upperDir, { x: 1, y: 0, z: 0 }), { x: 0, y: 0, z: 1 });
  const hingeAxis = v3Norm(v3Cross(upperDir, lowerDir), { x: 1, y: 0, z: 0 });

  const normFlex = clamp(flexionDeg / 135, 0, 1);
  const tensor = computeRegionStrainTensor(
    region, -normFlex * 0.58, normFlex * 0.34, ((joint.twistDeg ?? 0) * DEG_TO_RAD) * 0.22, ctx.fabric,
  );
  ctx.strains.push(tensor);

  // 1) Zigzag-compression: theta > 15° 안쪽 접힘 아코디언 주름
  if (flexionDeg > 15) {
    const excess = clamp((flexionDeg - 15) / 115, 0, 1);
    const freqFactor = ctx.fabric.foldFrequencyScale * Math.pow(0.42 / Math.max(0.1, ctx.fabric.bendingStiffness), 0.24);
    const count = Math.max(1, Math.round((1.2 + excess * 6.8) * clamp(freqFactor, 0.55, 2.2)));
    const spreadSpan = radiusM * (1.1 + excess * 1.45);
    const soft = ctx.fabric.curvatureSoftness;

    for (let i = 0; i < count; i += 1) {
      const frac = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
      const limbDir = frac >= 0 ? upperDir : lowerDir;
      const center = v3Add(
        v3Add(joint.position, v3Scale(innerCreaseDir, radiusM * 0.92)),
        v3Scale(limbDir, Math.abs(frac * spreadSpan * 0.65)),
      );
      const halfLen = radiusM * (0.95 + excess * 0.55);
      const diagDir = v3Norm(v3Add(v3Scale(hingeAxis, 0.86), v3Scale(limbDir, (i % 2 === 0 ? 1 : -1) * (0.28 + (1 - soft) * 0.24))));
      const p0 = v3Add(center, v3Scale(diagDir, -halfLen));
      const p3 = v3Add(center, v3Scale(diagDir, halfLen));
      const bulge = radiusM * (0.24 + soft * 0.32) * (0.6 + excess * 0.4);
      const p1 = v3Add(v3Lerp(p0, p3, 0.34), v3Scale(innerCreaseDir, -bulge * 0.6));
      const p2 = v3Add(v3Lerp(p0, p3, 0.66), v3Scale(innerCreaseDir, bulge * 0.45));
      pushFold(
        ctx, "zigzag-compression", "compression", region, [p0, p1, p2, p3],
        clamp(0.35 + excess * 0.62 - Math.abs(frac) * 0.18, 0.2, 1),
        i % 2 === 0 || Math.abs(frac) < 0.35, tensor.principalStrain2,
      );
    }
  }

  // 2) Half-lock: theta >= 30° 힌지 꺾임 방향 전환 주름
  if (flexionDeg >= 30) {
    const lockStr = clamp((flexionDeg - 30) / 95, 0.1, 1);
    const lockCount = lockStr > 0.55 && ctx.fabric.foldFrequencyScale > 1.1 ? 2 : 1;
    const tight = 0.72 - ctx.fabric.curvatureSoftness * 0.25;
    for (let k = 0; k < lockCount; k += 1) {
      const sign = k === 0 ? 1 : -1;
      const start = v3Add(v3Add(joint.position, v3Scale(upperDir, radiusM * 1.45)), v3Scale(hingeAxis, sign * radiusM * 0.72));
      const apex = v3Add(joint.position, v3Scale(innerCreaseDir, radiusM * 0.78));
      const end = v3Add(v3Add(joint.position, v3Scale(lowerDir, radiusM * 1.35)), v3Scale(hingeAxis, -sign * radiusM * 0.55));
      pushFold(
        ctx, "half-lock", "compression", region, [start, v3Lerp(start, apex, tight), v3Lerp(end, apex, tight), end],
        clamp(0.48 + lockStr * 0.48, 0.3, 1), true, Math.abs(tensor.principalStrain2) + lockStr * 0.2,
      );
    }
  }
}

function solveSpiralTwistFolds(
  ctx: FoldBuilderContext, region: string, startPos: Vec3, endPos: Vec3, twistDeg: number, radiusM: number,
): void {
  const absTwist = Math.abs(twistDeg);
  if (absTwist < 10) return;

  const axisVec = v3Sub(endPos, startPos);
  const segLen = Math.max(0.08, v3Len(axisVec));
  const gammaShear = (Math.abs(twistDeg * DEG_TO_RAD) * radiusM) / segLen;
  ctx.strains.push(computeRegionStrainTensor(region, gammaShear * 0.35, -gammaShear * 0.25, gammaShear, ctx.fabric));

  const { u, v } = computeOrthogonalFrame(v3Norm(axisVec, { x: 0, y: -1, z: 0 }), { x: 0, y: 0, z: 1 });
  const twistScale = clamp((absTwist - 10) / 80, 0.12, 1);
  const count = Math.max(1, Math.round((1.6 + twistScale * 4.4) * clamp(ctx.fabric.foldFrequencyScale, 0.6, 1.8)));
  const chirality = twistDeg >= 0 ? 1 : -1;

  for (let i = 0; i < count; i += 1) {
    const t0 = 0.12 + (i / count) * 0.52;
    const t1 = Math.min(0.94, t0 + 0.34);
    const phi0 = (i / count) * Math.PI * 0.85 - Math.PI * 0.35;
    const phiSpan = chirality * (0.7 + twistScale * 0.95);
    const pt = (t: number, phi: number): Vec3 =>
      v3Add(v3Lerp(startPos, endPos, t), v3Add(v3Scale(u, Math.cos(phi) * radiusM), v3Scale(v, Math.sin(phi) * radiusM)));

    pushFold(
      ctx, "spiral-twist", i % 2 === 0 ? "shear" : "tension", region,
      [pt(t0, phi0), pt(t0 + (t1 - t0) * 0.33, phi0 + phiSpan * 0.38), pt(t0 + (t1 - t0) * 0.67, phi0 + phiSpan * 0.72), pt(t1, phi0 + phiSpan)],
      clamp(0.32 + twistScale * 0.56, 0.2, 0.96), i % 2 === 0, gammaShear,
    );
  }
}

function solveDiaperSlingFolds(
  ctx: FoldBuilderContext, region: string, anchorA: Vec3, anchorB: Vec3, tierCount: number, sagBoost: number,
): void {
  const spanVec = v3Sub(anchorB, anchorA);
  const span = v3Len(spanVec);
  if (span < 0.08) return;

  const weightFactor = clamp(ctx.fabric.arealDensityGsm / 220, 0.45, 1.55);
  const sagBase = span * (0.24 + ctx.fabric.drapeLengthFactor * 0.22) * (1.28 - ctx.fabric.stretchResistance * 0.45) * sagBoost * ctx.gravityMagRatio;
  const tensor = computeRegionStrainTensor(region, 0.26 * weightFactor, -0.12 * (1 - ctx.fabric.stretchResistance), 0.08, ctx.fabric);
  ctx.strains.push(tensor);

  const count = Math.max(1, Math.round(tierCount * clamp(ctx.fabric.foldFrequencyScale, 0.65, 1.65)));
  const out0 = v3Norm(v3Cross(spanVec, ctx.gravityDir), { x: 0, y: 0, z: 1 });
  const frontOut = out0.z >= 0 ? out0 : v3Scale(out0, -1);

  for (let i = 0; i < count; i += 1) {
    const tierFrac = (i + 1) / (count + 0.5);
    const catA = 0.62 + ctx.fabric.bendingStiffness * 0.45;
    const coshEdge = Math.cosh(0.5 / catA);
    const inset = 0.04 + i * 0.025;
    const sample = (u: number): Vec3 => {
      const catNorm = (coshEdge - Math.cosh((u - 0.5) / catA)) / Math.max(0.05, coshEdge - 1);
      const sag = v3Scale(ctx.gravityDir, catNorm * sagBase * (0.45 + tierFrac * 0.9));
      const zFloat = v3Scale(frontOut, 0.025 + Math.sin(u * Math.PI) * 0.032 * (0.5 + tierFrac * 0.5));
      return v3Add(v3Add(v3Lerp(anchorA, anchorB, clamp(u, 0.02, 0.98)), sag), zFloat);
    };
    pushFold(
      ctx, "diaper-sling", i % 2 === 0 ? "tension" : "gravity-drape", region,
      [sample(inset), sample(0.32), sample(0.68), sample(1 - inset)],
      clamp(0.34 + tierFrac * 0.44, 0.25, 0.92), i % 2 === 1, tensor.principalStrain1,
    );
  }
}

function solvePipeAndDropFolds(
  ctx: FoldBuilderContext, region: string, ridgeL: Vec3, ridgeR: Vec3, drapeLen: number, floorY: number, includeDrop: boolean,
): void {
  const ridgeSpan = v3Len(v3Sub(ridgeR, ridgeL));
  const tensor = computeRegionStrainTensor(region, 0.22 * ctx.gravityMagRatio, -0.18 * (1 - ctx.fabric.bendingStiffness * 0.5), 0.04, ctx.fabric);
  ctx.strains.push(tensor);

  const flutes = clamp(
    Math.round((ridgeSpan / Math.max(0.028, tensor.wrinklingWavelengthM)) * 0.52 * clamp(ctx.fabric.drapeLengthFactor, 0.5, 1.3)),
    2, 11,
  );
  const latDir = v3Norm(v3Sub(ridgeR, ridgeL), { x: 1, y: 0, z: 0 });
  const f0 = v3Norm(v3Cross(ctx.gravityDir, latDir), { x: 0, y: 0, z: 1 });
  const outward = f0.z >= 0 ? f0 : v3Scale(f0, -1);

  for (let i = 0; i < flutes; i += 1) {
    const u = (i + 0.5) / flutes;
    const origin = v3Lerp(ridgeL, ridgeR, u);
    const flare = (u - 0.5) * ridgeSpan * (0.28 + ctx.fabric.drapeLengthFactor * 0.26);
    const len = Math.max(0.12, Math.min(drapeLen, Math.max(0.14, origin.y - floorY + 0.04)));
    const isShadow = i % 2 === 1;
    const zWave = (isShadow ? -0.014 : 0.026) * (0.65 + ctx.fabric.curvatureSoftness * 0.55);
    const pt = (f: number, fl: number, zw: number): Vec3 =>
      v3Add(v3Add(origin, v3Scale(ctx.gravityDir, len * f)), v3Add(v3Scale(latDir, flare * fl), v3Scale(outward, zw)));

    pushFold(
      ctx, "pipe-fold", isShadow ? "compression" : "gravity-drape", region,
      [v3Add(origin, v3Scale(outward, 0.022)), pt(0.34, 0.3, zWave), pt(0.72, 0.75, zWave * 1.25), pt(1, 1, zWave * 0.8)],
      clamp(0.42 + (1 - Math.abs(u - 0.5)) * 0.36, 0.28, 0.9), isShadow, tensor.principalStrain1,
    );
  }

  if (includeDrop) {
    const edges = [
      { pt: ridgeL, dir: -1, tag: `${region}-drop-left` },
      { pt: ridgeR, dir: 1, tag: `${region}-drop-right` },
    ];
    for (let s = 0; s < edges.length; s += 1) {
      const { pt: p0, dir, tag } = edges[s];
      const dLen = drapeLen * 0.78;
      pushFold(
        ctx, "drop-fold", "gravity-drape", tag,
        [
          p0,
          v3Add(v3Add(p0, v3Scale(latDir, dir * 0.075)), v3Scale(ctx.gravityDir, dLen * 0.18)),
          v3Add(v3Add(p0, v3Scale(latDir, dir * 0.045)), v3Scale(ctx.gravityDir, dLen * 0.62)),
          v3Add(v3Add(p0, v3Scale(latDir, dir * 0.085)), v3Scale(ctx.gravityDir, dLen)),
        ],
        clamp(0.5 + ctx.fabric.drapeLengthFactor * 0.25, 0.35, 0.92), s === 1, tensor.principalStrain1 * 0.9,
      );
    }
  }
}

function solveInertPoolFolds(
  ctx: FoldBuilderContext, hemX: number, hemZ: number, hemWidthM: number, excessM: number, floorY: number,
): void {
  if (excessM <= 0.02) return;
  const tensor = computeRegionStrainTensor("floor-pool", -0.42 * clamp(excessM / 0.28, 0.2, 1), -0.28, 0.16, ctx.fabric);
  ctx.strains.push(tensor);

  const count = clamp(Math.round((2.2 + excessM * 10) * ctx.fabric.foldFrequencyScale), 2, 8);
  const spread = hemWidthM * 0.68 + excessM * 0.85;
  const waveH = 0.022 + ctx.fabric.curvatureSoftness * 0.026;

  for (let i = 0; i < count; i += 1) {
    const frac = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
    const z = hemZ + (i % 2 === 0 ? 0.04 : -0.03) + frac * 0.04;
    const y = floorY + 0.015 + (i % 3) * 0.012;
    const halfArc = spread * (0.48 + (1 - Math.abs(frac) * 0.35) * 0.35);
    const cx = hemX + frac * spread * 0.42;
    pushFold(
      ctx, "inert-pool", "compression", "floor-pool",
      [
        { x: cx - halfArc, y, z },
        { x: cx - halfArc * 0.35, y: y + waveH, z: z + 0.035 },
        { x: cx + halfArc * 0.35, y: y - waveH * 0.35, z: z + 0.045 },
        { x: cx + halfArc, y: y + waveH * 0.4, z: z + 0.015 },
      ],
      clamp(0.38 + (excessM / 0.35) * 0.45, 0.3, 0.92), i % 2 === 0, tensor.principalStrain2,
    );
  }
}

/** 3D 포즈 골격과 원단 물성 프리셋으로부터 7대 고전 의상 주름 위상을 해법한다. */
export function solvePoseToGarmentFolds(options: SolvePoseToGarmentFoldsOptions): GarmentFoldSolution {
  const fabric = typeof options.fabricPreset === "string" ? GARMENT_FABRIC_PRESETS[options.fabricPreset] : options.fabricPreset;
  const gravity: Vec3 = options.gravity ?? { x: 0, y: -9.81, z: 0 };
  const gravityDir = v3Norm(gravity, { x: 0, y: -1, z: 0 });
  const gravityMagRatio = clamp(Math.max(0.5, v3Len(gravity)) / 9.81, 0.25, 2.2);
  const cam = buildCameraBasis(options.camera);
  const baseInkWidthPx = clamp(options.baseInkWidthPx ?? 1.6, 0.6, 4.0);
  const floorY = options.skeleton.floorY ?? 0;
  const j = options.skeleton.joints;

  const ctx: FoldBuilderContext = {
    fabric, gravityDir, gravityMagRatio, cam, baseInkWidthPx, folds: [], strains: [], nextId: 0,
  };

  if (fabric.coverage.sleeves) {
    solveHingeJointFolds(ctx, "left-elbow", j.leftShoulder.position, j.leftElbow, j.leftWrist.position, 0.052);
    solveHingeJointFolds(ctx, "right-elbow", j.rightShoulder.position, j.rightElbow, j.rightWrist.position, 0.052);
    solveSpiralTwistFolds(ctx, "left-sleeve-twist", j.leftElbow.position, j.leftWrist.position, (j.leftElbow.twistDeg ?? 0) + (j.leftWrist.twistDeg ?? 0), 0.048);
    solveSpiralTwistFolds(ctx, "right-sleeve-twist", j.rightElbow.position, j.rightWrist.position, (j.rightElbow.twistDeg ?? 0) + (j.rightWrist.twistDeg ?? 0), 0.048);
  }

  if (fabric.coverage.skirtOrHem || fabric.id === "cotton-shirt") {
    solveHingeJointFolds(ctx, "left-knee", j.leftHip.position, j.leftKnee, j.leftAnkle.position, 0.068);
    solveHingeJointFolds(ctx, "right-knee", j.rightHip.position, j.rightKnee, j.rightAnkle.position, 0.068);
  }

  if (fabric.coverage.torso) {
    const torsoTwist = (j.spineUpper.twistDeg ?? 0) - (j.pelvis.twistDeg ?? 0) + (j.spineLower.twistDeg ?? 0) * 0.5;
    solveSpiralTwistFolds(ctx, "torso-twist", j.spineUpper.position, j.pelvis.position, torsoTwist, 0.145);
    if (fabric.coverage.capeClasp) {
      solveDiaperSlingFolds(ctx, "cape-clasp-sling", j.leftShoulder.position, j.rightShoulder.position, 4, 1.35);
    } else {
      solveDiaperSlingFolds(ctx, "collar-chest-sling", j.leftShoulder.position, j.rightShoulder.position, 2, 0.65);
    }
    solvePipeAndDropFolds(ctx, "torso-drape", j.rightShoulder.position, j.leftShoulder.position, 0.52 * fabric.drapeLengthFactor, floorY, true);
  }

  if (fabric.coverage.skirtOrHem) {
    const ridgeL = fabric.coverage.capeClasp ? j.leftShoulder.position : j.leftHip.position;
    const ridgeR = fabric.coverage.capeClasp ? j.rightShoulder.position : j.rightHip.position;
    const effLen = (fabric.coverage.capeClasp ? 1.38 : 0.96) * fabric.drapeLengthFactor;
    solvePipeAndDropFolds(ctx, "hem-drape", ridgeR, ridgeL, effLen, floorY, fabric.coverage.capeClasp);

    const anchorY = Math.min(ridgeL.y, ridgeR.y);
    const hemBottomY = anchorY - effLen * Math.max(0.2, -gravityDir.y);
    const kneeClear = Math.min(j.leftKnee.position.y, j.rightKnee.position.y) - floorY;
    const excessM = Math.max(floorY - hemBottomY, fabric.coverage.floorPool && kneeClear < 0.2 ? 0.22 - kneeClear : 0);
    if (fabric.coverage.floorPool && excessM > 0.02) {
      const hemW = Math.max(0.28, v3Len(v3Sub(j.leftHip.position, j.rightHip.position)) * 1.6);
      solveInertPoolFolds(ctx, 0.5 * (j.leftAnkle.position.x + j.rightAnkle.position.x), 0.5 * (j.leftAnkle.position.z + j.rightAnkle.position.z), hemW, excessM, floorY);
    }
  }

  const topologyCounts: Record<GarmentFoldTopology, number> = {
    "pipe-fold": 0, "zigzag-compression": 0, "spiral-twist": 0,
    "half-lock": 0, "diaper-sling": 0, "drop-fold": 0, "inert-pool": 0,
  };
  let tensionFoldCount = 0;
  let compressionFoldCount = 0;
  let softnessSum = 0;
  let shadowSum = 0;
  let shadowCount = 0;
  let tensionSum = 0;
  let tensionCount = 0;

  for (let i = 0; i < ctx.folds.length; i += 1) {
    const f = ctx.folds[i];
    topologyCounts[f.topology] += 1;
    softnessSum += f.curvatureSoftness;
    if (f.mode === "tension" || f.mode === "gravity-drape") {
      tensionFoldCount += 1;
      tensionSum += f.strokeWidthMidPx;
      tensionCount += 1;
    } else {
      compressionFoldCount += 1;
    }
    if (f.isShadowSide) {
      shadowSum += f.strokeWidthMidPx;
      shadowCount += 1;
    }
  }
  const freqSum = ctx.strains.reduce((acc, s) => acc + 1 / Math.max(0.008, s.wrinklingWavelengthM), 0);
  const totalFolds = ctx.folds.length;

  return {
    fabric,
    gravity,
    viewportWidth: cam.viewportWidth,
    viewportHeight: cam.viewportHeight,
    folds: ctx.folds,
    regionStrains: ctx.strains,
    topologyCounts,
    metrics: {
      totalFolds,
      tensionFoldCount,
      compressionFoldCount,
      averageFoldFrequencyPerMeter: ctx.strains.length > 0 ? freqSum / ctx.strains.length : 0,
      averageCurvatureSoftness: totalFolds > 0 ? softnessSum / totalFolds : fabric.curvatureSoftness,
      averageShadowStrokeWidthPx: shadowCount > 0 ? shadowSum / shadowCount : baseInkWidthPx,
      averageTensionStrokeWidthPx: tensionCount > 0 ? tensionSum / tensionCount : baseInkWidthPx,
    },
  };
}
