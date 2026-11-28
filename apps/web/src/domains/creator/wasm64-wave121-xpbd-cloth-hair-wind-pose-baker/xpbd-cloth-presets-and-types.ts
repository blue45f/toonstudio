/**
 * Wave 121 — XPBD 천·머리카락 바람장 솔버 타입 계약, 원단 물성표, 4종 웹툰 프리셋 및 바람·캡슐 기하 유틸.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type ClothHairPresetId =
  | "long-straight-hair"
  | "fantasy-flowing-cape"
  | "hanbok-chima-ribbon"
  | "scarf-action-trail";

export type FabricMaterialId =
  | "silk"
  | "hanbok-gauze"
  | "hair-strand"
  | "wool-scarf"
  | "heavy-leather";

export interface FabricMaterialSpec {
  readonly id: FabricMaterialId;
  readonly labelKo: string;
  /** 거리 제약 XPBD 컴플라이언스 (작을수록 비신축) */
  readonly distanceCompliance: number;
  /** 굽힘 제약 XPBD 컴플라이언스 (작을수록 뻣뻣함, 클수록 유연함) */
  readonly bendingCompliance: number;
  /** 바람장 항력 계수 (1/s) */
  readonly dragCoeff: number;
  /** 횡방향 양력·펄럭임 계수 */
  readonly liftCoeff: number;
  /** 속도 감쇠 계수 (1/s) */
  readonly damping: number;
  /** 단위 입자 질량 */
  readonly particleMass: number;
}

export interface BodyCapsuleCollider {
  readonly id: string;
  readonly labelKo: string;
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  readonly radius: number;
  readonly friction: number;
}

export interface WindFieldConfig {
  readonly windVector: Vec2;
  readonly gustAmplitude: number;
  readonly gustFrequencyHz: number;
  readonly turbulenceAmplitude: number;
  readonly turbulenceSeed: number;
  readonly gravity: number;
}

export interface XpbdParticle {
  readonly id: number;
  readonly row: number;
  readonly col: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly prevX: number;
  readonly prevY: number;
  readonly prevZ: number;
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
  readonly invMass: number;
  readonly pinned: boolean;
  readonly restX: number;
  readonly restY: number;
  readonly restZ: number;
  readonly contactedColliderId: string | null;
}

export type DistanceConstraintKind = "structural-h" | "structural-v" | "shear";

export interface XpbdDistanceConstraint {
  readonly a: number;
  readonly b: number;
  readonly restLength: number;
  readonly compliance: number;
  readonly kind: DistanceConstraintKind;
}

export interface XpbdBendingConstraint {
  readonly a: number;
  readonly mid: number;
  readonly b: number;
  readonly restOffsetX: number;
  readonly restOffsetY: number;
  readonly compliance: number;
  readonly axis: "vertical" | "horizontal";
}

export interface XpbdClothPresetSpec {
  readonly id: ClothHairPresetId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly cols: number;
  readonly rows: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly materialId: FabricMaterialId;
  readonly defaultWind: WindFieldConfig;
  readonly colliders: readonly BodyCapsuleCollider[];
  readonly includeShearConstraints: boolean;
}

export interface XpbdClothMetrics {
  readonly maxStretchErrorRatio: number;
  readonly meanStretchErrorRatio: number;
  readonly colliderPenetrationCount: number;
  readonly colliderContactCount: number;
  readonly averageBendingAngleRad: number;
  readonly maxBendingAngleRad: number;
  readonly tailDisplacement: {
    readonly x: number;
    readonly y: number;
    readonly magnitude: number;
  };
  readonly silhouetteSweepRatio: number;
  readonly kineticEnergy: number;
  readonly nonFiniteCount: number;
}

export interface XpbdClothHairState {
  readonly presetId: ClothHairPresetId;
  readonly material: FabricMaterialSpec;
  readonly cols: number;
  readonly rows: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly timeSec: number;
  readonly stepCount: number;
  readonly substepsExecuted: number;
  readonly particles: readonly XpbdParticle[];
  readonly distanceConstraints: readonly XpbdDistanceConstraint[];
  readonly bendingConstraints: readonly XpbdBendingConstraint[];
  readonly colliders: readonly BodyCapsuleCollider[];
  readonly wind: WindFieldConfig;
  readonly metrics: XpbdClothMetrics;
}

export interface CreateXpbdClothOptions {
  readonly materialId?: FabricMaterialId;
  readonly bendingCompliance?: number;
  readonly distanceCompliance?: number;
  readonly damping?: number;
  readonly wind?: Partial<WindFieldConfig>;
  readonly colliders?: readonly BodyCapsuleCollider[];
}

export interface StepXpbdClothOptions {
  readonly dt?: number;
  readonly substeps?: number;
  readonly solverIterations?: number;
  readonly windOverride?: Partial<WindFieldConfig>;
}

export interface SimulateXpbdClothOptions extends CreateXpbdClothOptions {
  readonly steps?: number;
  readonly dt?: number;
  readonly substeps?: number;
  readonly solverIterations?: number;
}

export interface XpbdSimulationResult {
  readonly state: XpbdClothHairState;
  readonly stepMetrics: readonly XpbdClothMetrics[];
}

export const COLLIDER_PENETRATION_TOLERANCE = 1e-4;
export const COLLIDER_SKIN_MARGIN = 0.25;

export const FABRIC_MATERIALS: Readonly<Record<FabricMaterialId, FabricMaterialSpec>> = {
  silk: {
    id: "silk",
    labelKo: "실크",
    distanceCompliance: 1e-8,
    bendingCompliance: 0.015,
    dragCoeff: 4.6,
    liftCoeff: 0.26,
    damping: 1.6,
    particleMass: 0.7,
  },
  "hanbok-gauze": {
    id: "hanbok-gauze",
    labelKo: "한복 노방·갑사",
    distanceCompliance: 1e-8,
    bendingCompliance: 0.0045,
    dragCoeff: 4.1,
    liftCoeff: 0.22,
    damping: 1.8,
    particleMass: 0.85,
  },
  "hair-strand": {
    id: "hair-strand",
    labelKo: "긴 생머리 모발",
    distanceCompliance: 1e-8,
    bendingCompliance: 0.0032,
    dragCoeff: 3.8,
    liftCoeff: 0.18,
    damping: 2.1,
    particleMass: 0.9,
  },
  "wool-scarf": {
    id: "wool-scarf",
    labelKo: "모직 망토·머플러",
    distanceCompliance: 1e-8,
    bendingCompliance: 0.0008,
    dragCoeff: 3.4,
    liftCoeff: 0.16,
    damping: 2.3,
    particleMass: 1.15,
  },
  "heavy-leather": {
    id: "heavy-leather",
    labelKo: "고강성 가죽",
    distanceCompliance: 1e-8,
    bendingCompliance: 0.000012,
    dragCoeff: 2.2,
    liftCoeff: 0.05,
    damping: 3.0,
    particleMass: 1.6,
  },
};

export const CLOTH_HAIR_PRESETS: Readonly<Record<ClothHairPresetId, XpbdClothPresetSpec>> = {
  "long-straight-hair": {
    id: "long-straight-hair",
    labelKo: "긴 생머리 스트랜드",
    descriptionKo: "정수리 고정 루트에서 두상과 어깨를 타고 흐르는 6열 긴 생머리 격자",
    cols: 6,
    rows: 14,
    viewportWidth: 640,
    viewportHeight: 800,
    materialId: "hair-strand",
    defaultWind: {
      windVector: { x: 210, y: -18 },
      gustAmplitude: 75,
      gustFrequencyHz: 1.35,
      turbulenceAmplitude: 42,
      turbulenceSeed: 12101,
      gravity: 460,
    },
    colliders: [
      { id: "head", labelKo: "두상", ax: 246, ay: 178, bx: 246, by: 178, radius: 40, friction: 0.14 },
      { id: "neck", labelKo: "목", ax: 252, ay: 224, bx: 252, by: 246, radius: 18, friction: 0.18 },
      { id: "shoulder", labelKo: "어깨", ax: 246, ay: 266, bx: 268, by: 272, radius: 28, friction: 0.22 },
      { id: "torso", labelKo: "몸통", ax: 250, ay: 294, bx: 248, by: 430, radius: 40, friction: 0.24 },
    ],
    includeShearConstraints: false,
  },
  "fantasy-flowing-cape": {
    id: "fantasy-flowing-cape",
    labelKo: "판타지 망토",
    descriptionKo: "어깨 여밈에서 하단으로 넓게 퍼지며 강한 바람에 날리는 영웅 컷 망토",
    cols: 7,
    rows: 14,
    viewportWidth: 640,
    viewportHeight: 800,
    materialId: "wool-scarf",
    defaultWind: {
      windVector: { x: 260, y: -26 },
      gustAmplitude: 95,
      gustFrequencyHz: 1.15,
      turbulenceAmplitude: 56,
      turbulenceSeed: 12102,
      gravity: 440,
    },
    colliders: [
      { id: "head", labelKo: "두상", ax: 238, ay: 152, bx: 238, by: 152, radius: 38, friction: 0.16 },
      { id: "shoulder", labelKo: "어깨", ax: 242, ay: 220, bx: 268, by: 228, radius: 30, friction: 0.22 },
      { id: "torso", labelKo: "몸통", ax: 246, ay: 250, bx: 244, by: 405, radius: 42, friction: 0.25 },
      { id: "hips", labelKo: "골반", ax: 244, ay: 420, bx: 242, by: 488, radius: 40, friction: 0.24 },
    ],
    includeShearConstraints: true,
  },
  "hanbok-chima-ribbon": {
    id: "hanbok-chima-ribbon",
    labelKo: "한복 치마·고름 리본",
    descriptionKo: "높은 가슴선에서 풍성하게 주름이 잡히며 유연하게 흩날리는 한복 치마폭",
    cols: 8,
    rows: 13,
    viewportWidth: 640,
    viewportHeight: 800,
    materialId: "hanbok-gauze",
    defaultWind: {
      windVector: { x: 185, y: -14 },
      gustAmplitude: 68,
      gustFrequencyHz: 1.05,
      turbulenceAmplitude: 48,
      turbulenceSeed: 12103,
      gravity: 420,
    },
    colliders: [
      { id: "torso", labelKo: "상체", ax: 238, ay: 220, bx: 238, by: 340, radius: 40, friction: 0.2 },
      { id: "hips", labelKo: "골반", ax: 238, ay: 360, bx: 236, by: 470, radius: 48, friction: 0.22 },
    ],
    includeShearConstraints: true,
  },
  "scarf-action-trail": {
    id: "scarf-action-trail",
    labelKo: "액션 머플러 꼬리",
    descriptionKo: "목 여밈에서 길게 뻗어 바람 유선을 따라 S자 동세를 그리는 액션 머플러",
    cols: 4,
    rows: 18,
    viewportWidth: 640,
    viewportHeight: 800,
    materialId: "wool-scarf",
    defaultWind: {
      windVector: { x: 295, y: -32 },
      gustAmplitude: 110,
      gustFrequencyHz: 1.55,
      turbulenceAmplitude: 62,
      turbulenceSeed: 12104,
      gravity: 390,
    },
    colliders: [
      { id: "head", labelKo: "두상", ax: 232, ay: 168, bx: 232, by: 168, radius: 38, friction: 0.14 },
      { id: "shoulder", labelKo: "어깨", ax: 240, ay: 238, bx: 266, by: 246, radius: 28, friction: 0.2 },
      { id: "torso", labelKo: "몸통", ax: 242, ay: 268, bx: 240, by: 425, radius: 40, friction: 0.22 },
    ],
    includeShearConstraints: true,
  },
};

export function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function clampScalar(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function hashSeedUnit(seed: number, salt: number): number {
  let h = (Math.trunc(finiteOr(seed, 1)) ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function mergeWindConfig(base: WindFieldConfig, override?: Partial<WindFieldConfig>): WindFieldConfig {
  if (!override) return base;
  return {
    windVector: {
      x: finiteOr(override.windVector?.x, base.windVector.x),
      y: finiteOr(override.windVector?.y, base.windVector.y),
    },
    gustAmplitude: Math.max(0, finiteOr(override.gustAmplitude, base.gustAmplitude)),
    gustFrequencyHz: clampScalar(finiteOr(override.gustFrequencyHz, base.gustFrequencyHz), 0.05, 12),
    turbulenceAmplitude: Math.max(0, finiteOr(override.turbulenceAmplitude, base.turbulenceAmplitude)),
    turbulenceSeed: Math.trunc(finiteOr(override.turbulenceSeed, base.turbulenceSeed)),
    gravity: clampScalar(finiteOr(override.gravity, base.gravity), -1200, 2000),
  };
}

/**
 * 결정론적 시공간 바람장 샘플러. 시드·위치·시간에 따라 돌풍과 난류 파동을 계산한다.
 */
export function sampleWindField(wind: WindFieldConfig, x: number, y: number, timeSec: number): Vec3 {
  const safeX = finiteOr(x, 0);
  const safeY = finiteOr(y, 0);
  const safeT = finiteOr(timeSec, 0);
  const wx = finiteOr(wind.windVector.x, 0);
  const wy = finiteOr(wind.windVector.y, 0);
  const baseSpeed = Math.hypot(wx, wy);
  const dirX = baseSpeed > 1e-4 ? wx / baseSpeed : 1;
  const dirY = baseSpeed > 1e-4 ? wy / baseSpeed : 0;

  const p1 = hashSeedUnit(wind.turbulenceSeed, 11) * Math.PI * 2;
  const p2 = hashSeedUnit(wind.turbulenceSeed, 29) * Math.PI * 2;
  const p3 = hashSeedUnit(wind.turbulenceSeed, 53) * Math.PI * 2;

  const gustPhase = safeT * wind.gustFrequencyHz * Math.PI * 2 + p1 - (safeX * dirX + safeY * dirY) * 0.008;
  const gustScalar = wind.gustAmplitude * (0.5 + 0.5 * Math.sin(gustPhase));

  const waveA = Math.sin(safeY * 0.022 + safeX * 0.011 - safeT * 5.2 + p2);
  const waveB = Math.cos(safeY * 0.037 - safeX * 0.017 - safeT * 3.7 + p3);
  const turb = wind.turbulenceAmplitude;
  const perpX = -dirY;
  const perpY = dirX;

  return {
    x: finiteOr(wx + dirX * gustScalar + perpX * (turb * 0.55 * waveA) + dirX * (turb * 0.32 * waveB), 0),
    y: finiteOr(wy + dirY * gustScalar + perpY * (turb * 0.55 * waveA) - Math.abs(waveB) * turb * 0.14, 0),
    z: finiteOr(turb * (0.65 * waveA + 0.35 * waveB), 0),
  };
}

/**
 * 점 (px, py)에서 2D 캡슐 세그먼트까지의 최근접점 및 거리를 계산한다.
 */
export function distancePointToCapsule(
  px: number,
  py: number,
  collider: BodyCapsuleCollider,
): { readonly dist: number; readonly closestX: number; readonly closestY: number; readonly nx: number; readonly ny: number } {
  const abx = collider.bx - collider.ax;
  const aby = collider.by - collider.ay;
  const abLenSq = abx * abx + aby * aby;
  const t = abLenSq > 1e-8 ? clampScalar(((px - collider.ax) * abx + (py - collider.ay) * aby) / abLenSq, 0, 1) : 0;
  const closestX = collider.ax + abx * t;
  const closestY = collider.ay + aby * t;
  const dx = px - closestX;
  const dy = py - closestY;
  const dist = Math.hypot(dx, dy);
  if (dist > 1e-6) {
    return { dist, closestX, closestY, nx: dx / dist, ny: dy / dist };
  }
  return { dist: 0, closestX, closestY, nx: 1, ny: 0 };
}

export function buildPresetRestPosition(
  presetId: ClothHairPresetId,
  row: number,
  col: number,
  rows: number,
  cols: number,
): Vec3 {
  const tr = rows > 1 ? row / (rows - 1) : 0;
  const tc = cols > 1 ? col / (cols - 1) : 0.5;
  switch (presetId) {
    case "long-straight-hair":
      return { x: 304 + col * 11, y: 138 + col * 2 + row * 26, z: (tc - 0.5) * 10 };
    case "fantasy-flowing-cape": {
      const centerX = 342 + tr * 34;
      const halfW = 30 + tr * 44;
      return { x: centerX + (tc * 2 - 1) * halfW, y: 212 + tc * 10 + row * 30, z: Math.sin(tc * Math.PI) * 8 };
    }
    case "hanbok-chima-ribbon": {
      const centerX = 348 + tr * 52;
      const halfW = 42 + tr * 56;
      return { x: centerX + (tc * 2 - 1) * halfW, y: 280 + row * 30, z: Math.sin(tc * Math.PI * 2) * 6 };
    }
    case "scarf-action-trail":
      return { x: 304 + col * 9, y: 210 + col * 2 + row * 20, z: (tc - 0.5) * 6 };
  }
}
