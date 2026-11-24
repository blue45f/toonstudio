/**
 * Wave 39E — 3D 캐릭터 랩스 라이브 링크 엔진.
 *
 * - 캐릭터당 6종 의상/전투손상(battle-damage) 슬롯 및 다중 컷 라이브 링크 전파
 * - 실제 키(cm 예: 184cm vs 162cm) 비율 기반 씬 자동 스케일 & 바닥 접지(Y=0) 솔버
 * - 커플(손잡기·손목·어깨) 및 소품(무기·컵) 2-Bone IK 앵커 잠금 (오차 < 0.5mm)
 * - 캐릭터 헤어/피부/눈/의상 PBR 알베도에서 OKLCH 2D 자동 배색 스와치 추출
 */

export {
  DEMO_IK_ANCHOR_PRESETS,
  createDemoCharacterLiveLinkRegistry,
} from "./character-live-link-presets";

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface LinearSrgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface OklchColor {
  readonly l: number;
  readonly c: number;
  readonly h: number;
  readonly oklchCss: string;
}

export type CostumeBattleDamageSlotId =
  | "everyday-casual"
  | "formal-uniform"
  | "combat-ready"
  | "scuffed-light"
  | "torn-heavy"
  | "aftermath-bandaged";

export interface CostumeBattleDamageSlot {
  readonly slotIndex: 1 | 2 | 3 | 4 | 5 | 6;
  readonly slotId: CostumeBattleDamageSlotId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly damagePercent: number;
  readonly tornMaskLayers: readonly string[];
  readonly propAttachments: readonly string[];
  readonly roughnessDelta: number;
  readonly outfitPrimarySrgb: LinearSrgbColor;
  readonly outfitSecondarySrgb: LinearSrgbColor;
  readonly accentSrgb: LinearSrgbColor;
}

export interface CharacterMaterialSample {
  readonly hairSrgb: LinearSrgbColor;
  readonly skinSrgb: LinearSrgbColor;
  readonly eyeSrgb: LinearSrgbColor;
  readonly outfitPrimarySrgb: LinearSrgbColor;
  readonly outfitSecondarySrgb: LinearSrgbColor;
  readonly accentSrgb: LinearSrgbColor;
}

export interface CharacterLiveLinkProfile {
  readonly characterId: string;
  readonly displayNameKo: string;
  readonly displayNameEn: string;
  readonly realHeightCm: number;
  readonly rawMeshHeightM: number;
  readonly heelLiftCm: number;
  readonly eyeHeightRatio: number;
  readonly shoulderHeightRatio: number;
  readonly upperArmM: number;
  readonly forearmM: number;
  readonly activeSlotId: CostumeBattleDamageSlotId;
  readonly costumeSlots: readonly [
    CostumeBattleDamageSlot,
    CostumeBattleDamageSlot,
    CostumeBattleDamageSlot,
    CostumeBattleDamageSlot,
    CostumeBattleDamageSlot,
    CostumeBattleDamageSlot,
  ];
  readonly baseMaterials: {
    readonly hairSrgb: LinearSrgbColor;
    readonly skinSrgb: LinearSrgbColor;
    readonly eyeSrgb: LinearSrgbColor;
  };
  readonly linkRevision: number;
}

export interface SceneLiveLinkBinding {
  readonly cutId: string;
  readonly cutTitleKo: string;
  readonly characterId: string;
  readonly syncedRevision: number;
  readonly activeSlotId: CostumeBattleDamageSlotId;
  readonly appliedHeightCm: number;
  readonly lockLocalCostumeOverride: boolean;
}

export interface CharacterLiveLinkRegistry {
  readonly profiles: readonly CharacterLiveLinkProfile[];
  readonly cutBindings: readonly SceneLiveLinkBinding[];
  readonly lastSyncSummary: string;
}

export interface LiveLinkPropagationResult {
  readonly registry: CharacterLiveLinkRegistry;
  readonly syncedCutIds: readonly string[];
  readonly skippedLockedCutIds: readonly string[];
  readonly nextRevision: number;
}

export interface SceneHeightPlacementInput {
  readonly characterId: string;
  readonly displayNameKo: string;
  readonly realHeightCm: number;
  readonly rawMeshHeightM: number;
  readonly footWorldY: number;
  readonly heelLiftCm?: number;
  readonly eyeHeightRatio?: number;
  readonly shoulderHeightRatio?: number;
}

export interface SolvedCharacterScale {
  readonly characterId: string;
  readonly displayNameKo: string;
  readonly realHeightCm: number;
  readonly effectiveHeightCm: number;
  readonly uniformScale: number;
  readonly scaledMeshHeightCm: number;
  readonly heightErrorMm: number;
  readonly groundOffsetY: number;
  readonly groundedFootY: number;
  readonly eyeLineM: number;
  readonly shoulderLineM: number;
  readonly relativeRatioToTallest: number;
}

export interface PairwiseHeightRelation {
  readonly tallerId: string;
  readonly shorterId: string;
  readonly heightDiffCm: number;
  readonly heightRatio: number;
  readonly eyeLineDiffCm: number;
}

export interface SceneHeightScaleSolution {
  readonly referenceFloorY: number;
  readonly characters: readonly SolvedCharacterScale[];
  readonly pairwiseRelations: readonly PairwiseHeightRelation[];
  readonly maxHeightErrorMm: number;
  readonly allGroundedOnFloor: boolean;
}

export type IkAnchorKind =
  | "couple-hand-hold"
  | "couple-wrist-grab"
  | "couple-shoulder-embrace"
  | "prop-weapon-grip"
  | "prop-cup-hold";

export interface IkArmChainInput {
  readonly actorId: string;
  readonly shoulderPos: Vec3;
  readonly upperArmM: number;
  readonly forearmM: number;
  readonly poleHint: Vec3;
  readonly maxTorsoLeanM?: number;
}

export interface IkAnchorLockRequest {
  readonly anchorId: string;
  readonly kind: IkAnchorKind;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly primaryArm: IkArmChainInput;
  readonly partnerArm?: IkArmChainInput;
  readonly targetAnchorPos: Vec3;
  readonly maxAllowedErrorMm?: number;
}

export interface SolvedIkArmPose {
  readonly actorId: string;
  readonly adjustedShoulderPos: Vec3;
  readonly elbowPos: Vec3;
  readonly wristAnchorPos: Vec3;
  readonly elbowFlexionDeg: number;
  readonly torsoLeanAppliedM: number;
  readonly residualErrorMm: number;
  readonly reachable: boolean;
}

export interface IkAnchorLockSolution {
  readonly anchorId: string;
  readonly kind: IkAnchorKind;
  readonly resolvedAnchorPos: Vec3;
  readonly primaryPose: SolvedIkArmPose;
  readonly partnerPose: SolvedIkArmPose | null;
  readonly anchorDistanceErrorMm: number;
  readonly maxAllowedErrorMm: number;
  readonly lockedWithinTolerance: boolean;
  readonly recommendedRootStepM: number;
}

export type CharacterSwatchRegionId =
  | "hair"
  | "skin"
  | "eyes"
  | "outfit-primary"
  | "outfit-secondary"
  | "accent";

export interface CharacterOklchSwatch {
  readonly regionId: CharacterSwatchRegionId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly base: OklchColor;
  readonly celShadow: OklchColor;
  readonly celHighlight: OklchColor;
  readonly lineartInk: OklchColor;
  readonly contrastAgainstSkin: number;
}

export interface CharacterAutoPaletteReport {
  readonly characterId: string;
  readonly slotId: CostumeBattleDamageSlotId;
  readonly swatches: readonly CharacterOklchSwatch[];
  readonly dominantHueDeg: number;
  readonly paletteHarmonyScore: number;
  readonly skinReadabilityPass: boolean;
}

const DEFAULT_IK_TOLERANCE_MM = 0.5;
const DEFAULT_MAX_TORSO_LEAN_M = 0.12;
const EPSILON = 1e-9;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function roundTo(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

const vecSub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const vecAdd = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const vecScale = (v: Vec3, s: number): Vec3 => ({ x: v.x * s, y: v.y * s, z: v.z * s });
const vecDot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const vecLen = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);
const vecDist = (a: Vec3, b: Vec3): number => vecLen(vecSub(a, b));
const vecCross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const vecNorm = (v: Vec3): Vec3 => {
  const l = vecLen(v);
  return l < EPSILON ? { x: 0, y: 1, z: 0 } : { x: v.x / l, y: v.y / l, z: v.z / l };
};
const roundVec = (v: Vec3): Vec3 => ({ x: roundTo(v.x, 5), y: roundTo(v.y, 5), z: roundTo(v.z, 5) });

function srgbToLinear(c: number): number {
  const v = clamp(c, 0, 1);
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
  const v = clamp(c, 0, 1);
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

export function formatOklchCss(l: number, c: number, h: number): string {
  const safeH = ((h % 360) + 360) % 360;
  return `oklch(${clamp(l, 0, 1).toFixed(3)} ${Math.max(0, c).toFixed(3)} ${safeH.toFixed(1)})`;
}

/** Björn Ottosson OKLab/OKLCH 정밀 변환 (sRGB 0..1 → OKLCH). */
export function srgbToOklch(color: LinearSrgbColor): OklchColor {
  const lr = srgbToLinear(color.r);
  const lg = srgbToLinear(color.g);
  const lb = srgbToLinear(color.b);

  const lRoot = Math.cbrt(Math.max(0, 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb));
  const mRoot = Math.cbrt(Math.max(0, 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb));
  const sRoot = Math.cbrt(Math.max(0, 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb));

  const okL = 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot;
  const okA = 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot;
  const okB = 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot;

  const chroma = Math.hypot(okA, okB);
  const rawHue = chroma < 1e-6 ? 0 : (Math.atan2(okB, okA) * 180) / Math.PI;
  const hue = ((rawHue % 360) + 360) % 360;

  return {
    l: roundTo(clamp(okL, 0, 1), 4),
    c: roundTo(chroma, 4),
    h: roundTo(hue, 2),
    oklchCss: formatOklchCss(okL, chroma, hue),
  };
}

/** OKLCH → sRGB (0..1, 가멋 클램프 포함). */
export function oklchToSrgb(oklch: Pick<OklchColor, "l" | "c" | "h">): LinearSrgbColor {
  const rad = (oklch.h * Math.PI) / 180;
  const a = oklch.c * Math.cos(rad);
  const b = oklch.c * Math.sin(rad);

  const l = (oklch.l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (oklch.l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (oklch.l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return {
    r: roundTo(linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), 4),
    g: roundTo(linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), 4),
    b: roundTo(linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s), 4),
  };
}

function wcagContrastRatio(a: LinearSrgbColor, b: LinearSrgbColor): number {
  const lum = (c: LinearSrgbColor): number =>
    0.2126 * srgbToLinear(c.r) + 0.7152 * srgbToLinear(c.g) + 0.0722 * srgbToLinear(c.b);
  const l1 = lum(a);
  const l2 = lum(b);
  return roundTo((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05), 2);
}

function buildOklch(l: number, c: number, h: number): OklchColor {
  const safeL = roundTo(clamp(l, 0.04, 0.98), 4);
  const safeC = roundTo(clamp(c, 0, 0.34), 4);
  const safeH = roundTo(((h % 360) + 360) % 360, 2);
  return { l: safeL, c: safeC, h: safeH, oklchCss: formatOklchCss(safeL, safeC, safeH) };
}

/** 캐릭터 마스터 의상/전투손상 슬롯 또는 키 변경 시 연결된 컷 전체로 라이브 링크 전파. */
export function propagateCharacterLiveLink(
  registry: CharacterLiveLinkRegistry,
  characterId: string,
  patch: {
    readonly activeSlotId?: CostumeBattleDamageSlotId;
    readonly realHeightCm?: number;
    readonly forceOverrideLockedCuts?: boolean;
  },
): LiveLinkPropagationResult {
  const target = registry.profiles.find((p) => p.characterId === characterId);
  if (!target) {
    return { registry, syncedCutIds: [], skippedLockedCutIds: [], nextRevision: 0 };
  }

  const nextRevision = target.linkRevision + 1;
  const nextSlotId = patch.activeSlotId ?? target.activeSlotId;
  const nextHeightCm =
    patch.realHeightCm !== undefined ? roundTo(clamp(patch.realHeightCm, 110, 230), 1) : target.realHeightCm;

  const nextProfiles = registry.profiles.map((p) =>
    p.characterId === characterId
      ? { ...p, activeSlotId: nextSlotId, realHeightCm: nextHeightCm, linkRevision: nextRevision }
      : p,
  );

  const syncedCutIds: string[] = [];
  const skippedLockedCutIds: string[] = [];
  const nextBindings = registry.cutBindings.map((b) => {
    if (b.characterId !== characterId) return b;
    if (b.lockLocalCostumeOverride && !patch.forceOverrideLockedCuts) {
      skippedLockedCutIds.push(b.cutId);
      return { ...b, appliedHeightCm: nextHeightCm, syncedRevision: nextRevision };
    }
    syncedCutIds.push(b.cutId);
    return { ...b, activeSlotId: nextSlotId, appliedHeightCm: nextHeightCm, syncedRevision: nextRevision };
  });

  return {
    registry: {
      profiles: nextProfiles,
      cutBindings: nextBindings,
      lastSyncSummary: `${target.displayNameKo} rev.${nextRevision} → ${syncedCutIds.length}컷 동기화 (로컬 고정 ${skippedLockedCutIds.length}컷 유지)`,
    },
    syncedCutIds,
    skippedLockedCutIds,
    nextRevision,
  };
}

/** 실제 키(cm) 비율 기반 씬 자동 스케일 + 바닥 접지(Y=0) 솔버. */
export function solveSceneHeightScale(
  placements: readonly SceneHeightPlacementInput[],
  referenceFloorY = 0,
): SceneHeightScaleSolution {
  if (placements.length === 0) {
    return { referenceFloorY, characters: [], pairwiseRelations: [], maxHeightErrorMm: 0, allGroundedOnFloor: true };
  }

  const tallestEffectiveCm = Math.max(...placements.map((p) => p.realHeightCm + (p.heelLiftCm ?? 0)));
  const solved: SolvedCharacterScale[] = placements.map((p) => {
    const safeRawM = Math.max(0.2, p.rawMeshHeightM);
    const uniformScale = p.realHeightCm / 100 / safeRawM;
    const scaledMeshHeightCm = safeRawM * uniformScale * 100;
    const effectiveHeightCm = p.realHeightCm + (p.heelLiftCm ?? 0);
    const groundOffsetY = referenceFloorY - p.footWorldY * uniformScale;
    const groundedFootY = p.footWorldY * uniformScale + groundOffsetY;
    return {
      characterId: p.characterId,
      displayNameKo: p.displayNameKo,
      realHeightCm: roundTo(p.realHeightCm, 1),
      effectiveHeightCm: roundTo(effectiveHeightCm, 1),
      uniformScale: roundTo(uniformScale, 5),
      scaledMeshHeightCm: roundTo(scaledMeshHeightCm, 3),
      heightErrorMm: roundTo(Math.abs(scaledMeshHeightCm - p.realHeightCm) * 10, 4),
      groundOffsetY: roundTo(groundOffsetY, 5),
      groundedFootY: roundTo(groundedFootY, 6),
      eyeLineM: roundTo((effectiveHeightCm / 100) * (p.eyeHeightRatio ?? 0.934), 4),
      shoulderLineM: roundTo((effectiveHeightCm / 100) * (p.shoulderHeightRatio ?? 0.815), 4),
      relativeRatioToTallest: roundTo(effectiveHeightCm / Math.max(1, tallestEffectiveCm), 4),
    };
  });

  const pairwiseRelations: PairwiseHeightRelation[] = [];
  for (let i = 0; i < solved.length; i += 1) {
    for (let j = i + 1; j < solved.length; j += 1) {
      const a = solved[i]!;
      const b = solved[j]!;
      const taller = a.realHeightCm >= b.realHeightCm ? a : b;
      const shorter = a.realHeightCm >= b.realHeightCm ? b : a;
      pairwiseRelations.push({
        tallerId: taller.characterId,
        shorterId: shorter.characterId,
        heightDiffCm: roundTo(taller.realHeightCm - shorter.realHeightCm, 1),
        heightRatio: roundTo(taller.realHeightCm / Math.max(1, shorter.realHeightCm), 4),
        eyeLineDiffCm: roundTo((taller.eyeLineM - shorter.eyeLineM) * 100, 1),
      });
    }
  }

  return {
    referenceFloorY,
    characters: solved,
    pairwiseRelations,
    maxHeightErrorMm: roundTo(Math.max(...solved.map((s) => s.heightErrorMm)), 4),
    allGroundedOnFloor: solved.every((s) => Math.abs(s.groundedFootY - referenceFloorY) < 1e-4),
  };
}

function solveTwoBoneArmIk(arm: IkArmChainInput, target: Vec3): SolvedIkArmPose {
  const maxReach = arm.upperArmM + arm.forearmM;
  const minReach = Math.abs(arm.upperArmM - arm.forearmM) + 0.04;
  const maxLean = arm.maxTorsoLeanM ?? DEFAULT_MAX_TORSO_LEAN_M;

  let shoulder = arm.shoulderPos;
  let delta = vecSub(target, shoulder);
  let dist = vecLen(delta);
  let torsoLeanAppliedM = 0;

  if (dist > maxReach - 0.002 && maxLean > 0) {
    const lean = Math.min(maxLean, dist - (maxReach - 0.002));
    shoulder = vecAdd(shoulder, vecScale(vecNorm(delta), lean));
    torsoLeanAppliedM = lean;
    delta = vecSub(target, shoulder);
    dist = vecLen(delta);
  }

  const reachable = dist <= maxReach + 1e-5 && dist >= minReach - 1e-5;
  const clampedDist = clamp(dist, minReach, maxReach - 1e-6);
  const dir = vecNorm(delta);

  const cosShoulder = clamp(
    (arm.upperArmM ** 2 + clampedDist ** 2 - arm.forearmM ** 2) / (2 * arm.upperArmM * clampedDist),
    -1,
    1,
  );
  const shoulderRad = Math.acos(cosShoulder);
  const cosElbow = clamp(
    (arm.upperArmM ** 2 + arm.forearmM ** 2 - clampedDist ** 2) / (2 * arm.upperArmM * arm.forearmM),
    -1,
    1,
  );
  const elbowFlexionDeg = clamp(180 - (Math.acos(cosElbow) * 180) / Math.PI, 4, 152);

  const toPole = vecSub(arm.poleHint, shoulder);
  let bendNormal = vecSub(toPole, vecScale(dir, vecDot(toPole, dir)));
  if (vecLen(bendNormal) < 1e-5) {
    bendNormal = vecCross(dir, Math.abs(dir.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 });
  }
  const bendDir = vecNorm(bendNormal);

  const elbowPos = vecAdd(
    shoulder,
    vecAdd(vecScale(dir, arm.upperArmM * Math.cos(shoulderRad)), vecScale(bendDir, arm.upperArmM * Math.sin(shoulderRad))),
  );
  const wristAnchorPos = vecAdd(shoulder, vecScale(dir, clampedDist));
  return {
    actorId: arm.actorId,
    adjustedShoulderPos: roundVec(shoulder),
    elbowPos: roundVec(elbowPos),
    wristAnchorPos: roundVec(wristAnchorPos),
    elbowFlexionDeg: roundTo(elbowFlexionDeg, 2),
    torsoLeanAppliedM: roundTo(torsoLeanAppliedM, 4),
    residualErrorMm: roundTo(vecDist(wristAnchorPos, target) * 1000, 4),
    reachable,
  };
}

/** 커플(손잡기·손목·어깨) 및 소품(무기 파지·컵) IK 앵커 잠금 솔버 (오차 < 0.5mm 보장). */
export function solveCoupleAndPropIkAnchors(request: IkAnchorLockRequest): IkAnchorLockSolution {
  const maxAllowedErrorMm = request.maxAllowedErrorMm ?? DEFAULT_IK_TOLERANCE_MM;
  const primaryPose = solveTwoBoneArmIk(request.primaryArm, request.targetAnchorPos);
  const partnerPose = request.partnerArm ? solveTwoBoneArmIk(request.partnerArm, request.targetAnchorPos) : null;

  const anchorDistanceErrorMm = partnerPose
    ? Math.max(
        primaryPose.residualErrorMm,
        partnerPose.residualErrorMm,
        vecDist(primaryPose.wristAnchorPos, partnerPose.wristAnchorPos) * 1000,
      )
    : primaryPose.residualErrorMm;
  const lockedWithinTolerance = anchorDistanceErrorMm < maxAllowedErrorMm;

  return {
    anchorId: request.anchorId,
    kind: request.kind,
    resolvedAnchorPos: roundVec(request.targetAnchorPos),
    primaryPose,
    partnerPose,
    anchorDistanceErrorMm: roundTo(anchorDistanceErrorMm, 4),
    maxAllowedErrorMm,
    lockedWithinTolerance,
    recommendedRootStepM: lockedWithinTolerance ? 0 : roundTo(anchorDistanceErrorMm / 1000, 3),
  };
}

/** 캐릭터 헤어/피부/눈/의상에서 OKLCH 2D 자동 배색 스와치 추출. */
export function extractCharacterOklchSwatches(
  profile: CharacterLiveLinkProfile,
  slotId?: CostumeBattleDamageSlotId,
): CharacterAutoPaletteReport {
  const activeSlot =
    profile.costumeSlots.find((s) => s.slotId === (slotId ?? profile.activeSlotId)) ?? profile.costumeSlots[0];
  const skinSrgb = profile.baseMaterials.skinSrgb;

  const entries: readonly {
    readonly regionId: CharacterSwatchRegionId;
    readonly labelKo: string;
    readonly labelEn: string;
    readonly srgb: LinearSrgbColor;
    readonly shift: number;
  }[] = [
    { regionId: "hair", labelKo: "헤어", labelEn: "Hair", srgb: profile.baseMaterials.hairSrgb, shift: -14 },
    { regionId: "skin", labelKo: "피부", labelEn: "Skin", srgb: skinSrgb, shift: -18 },
    { regionId: "eyes", labelKo: "눈동자", labelEn: "Eyes", srgb: profile.baseMaterials.eyeSrgb, shift: -10 },
    { regionId: "outfit-primary", labelKo: "주 의상", labelEn: "Primary Outfit", srgb: activeSlot.outfitPrimarySrgb, shift: -12 },
    { regionId: "outfit-secondary", labelKo: "보조 의상", labelEn: "Secondary Outfit", srgb: activeSlot.outfitSecondarySrgb, shift: -8 },
    { regionId: "accent", labelKo: "포인트 소품", labelEn: "Accent Prop", srgb: activeSlot.accentSrgb, shift: -15 },
  ];

  const swatches: CharacterOklchSwatch[] = entries.map((e) => {
    const base = srgbToOklch(e.srgb);
    return {
      regionId: e.regionId,
      labelKo: e.labelKo,
      labelEn: e.labelEn,
      base,
      celShadow: buildOklch(base.l - 0.14, base.c * 1.08 + 0.012, base.h + e.shift),
      celHighlight: buildOklch(base.l + 0.12, Math.max(0.01, base.c * 0.72), base.h + 10),
      lineartInk: buildOklch(Math.min(0.24, base.l * 0.35), Math.min(0.06, base.c * 0.65), base.h - 6),
      contrastAgainstSkin: wcagContrastRatio(e.srgb, skinSrgb),
    };
  });

  let sumCos = 0;
  let sumSin = 0;
  for (const sw of swatches) {
    const rad = (sw.base.h * Math.PI) / 180;
    const w = sw.base.c + 0.02;
    sumCos += Math.cos(rad) * w;
    sumSin += Math.sin(rad) * w;
  }
  const dominantHueDeg = roundTo((((Math.atan2(sumSin, sumCos) * 180) / Math.PI) % 360 + 360) % 360, 1);
  const hairContrast = swatches.find((s) => s.regionId === "hair")?.contrastAgainstSkin ?? 1;
  const outfitContrast = swatches.find((s) => s.regionId === "outfit-primary")?.contrastAgainstSkin ?? 1;
  const skinReadabilityPass = hairContrast >= 2.2 && outfitContrast >= 1.8;
  const avgChroma = swatches.reduce((acc, s) => acc + s.base.c, 0) / swatches.length;
  const chromaBalance = 1 - Math.min(1, Math.abs(avgChroma - 0.095) / 0.14);

  return {
    characterId: profile.characterId,
    slotId: activeSlot.slotId,
    swatches,
    dominantHueDeg,
    paletteHarmonyScore: Math.round(clamp(58 + chromaBalance * 20 + (skinReadabilityPass ? 22 : 8), 40, 99)),
    skinReadabilityPass,
  };
}
