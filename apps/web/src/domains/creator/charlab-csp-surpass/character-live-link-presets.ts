/**
 * Wave 39E — 3D 캐릭터 랩스 라이브 링크 기본 프리셋(6종 의상·전투손상 슬롯 및 커플/소품 IK 프리셋).
 */

import type {
  CharacterLiveLinkProfile,
  CharacterLiveLinkRegistry,
  CostumeBattleDamageSlot,
  IkAnchorLockRequest,
  LinearSrgbColor,
} from "./character-live-link-engine";

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function buildSixCostumeSlots(
  primary: LinearSrgbColor,
  secondary: LinearSrgbColor,
  accent: LinearSrgbColor,
): readonly [
  CostumeBattleDamageSlot,
  CostumeBattleDamageSlot,
  CostumeBattleDamageSlot,
  CostumeBattleDamageSlot,
  CostumeBattleDamageSlot,
  CostumeBattleDamageSlot,
] {
  const darken = (c: LinearSrgbColor, f: number): LinearSrgbColor => ({
    r: round3(clamp01(c.r * f)),
    g: round3(clamp01(c.g * f)),
    b: round3(clamp01(c.b * f)),
  });
  const warmShift = (c: LinearSrgbColor): LinearSrgbColor => ({
    r: round3(clamp01(c.r * 0.9 + 0.08)),
    g: round3(clamp01(c.g * 0.84 + 0.04)),
    b: round3(clamp01(c.b * 0.78)),
  });
  return [
    {
      slotIndex: 1,
      slotId: "everyday-casual",
      labelKo: "1. 일상 평상복",
      labelEn: "1. Everyday Casual",
      damagePercent: 0,
      tornMaskLayers: [],
      propAttachments: ["smartwatch-band"],
      roughnessDelta: 0,
      outfitPrimarySrgb: primary,
      outfitSecondarySrgb: secondary,
      accentSrgb: accent,
    },
    {
      slotIndex: 2,
      slotId: "formal-uniform",
      labelKo: "2. 정장 · 제복",
      labelEn: "2. Formal Uniform",
      damagePercent: 0,
      tornMaskLayers: [],
      propAttachments: ["collar-pin", "emblem-brooch"],
      roughnessDelta: -0.08,
      outfitPrimarySrgb: darken(primary, 0.78),
      outfitSecondarySrgb: { r: 0.92, g: 0.91, b: 0.88 },
      accentSrgb: accent,
    },
    {
      slotIndex: 3,
      slotId: "combat-ready",
      labelKo: "3. 전투 출격복",
      labelEn: "3. Combat Ready",
      damagePercent: 15,
      tornMaskLayers: ["boot-dust"],
      propAttachments: ["shoulder-guard", "weapon-scabbard"],
      roughnessDelta: 0.05,
      outfitPrimarySrgb: darken(primary, 0.86),
      outfitSecondarySrgb: darken(secondary, 0.85),
      accentSrgb: accent,
    },
    {
      slotIndex: 4,
      slotId: "scuffed-light",
      labelKo: "4. 경미 전투손상",
      labelEn: "4. Light Battle Damage",
      damagePercent: 38,
      tornMaskLayers: ["sleeve-tear", "cheek-scuff", "hem-ash"],
      propAttachments: ["cracked-pauldron", "weapon-scabbard"],
      roughnessDelta: 0.16,
      outfitPrimarySrgb: warmShift(darken(primary, 0.82)),
      outfitSecondarySrgb: warmShift(darken(secondary, 0.8)),
      accentSrgb: darken(accent, 0.9),
    },
    {
      slotIndex: 5,
      slotId: "torn-heavy",
      labelKo: "5. 중파 전투손상",
      labelEn: "5. Heavy Battle Damage",
      damagePercent: 76,
      tornMaskLayers: ["shredded-cloak", "shoulder-slash", "kneepad-fracture", "soot-gradient"],
      propAttachments: ["broken-hilt", "tattered-scarf"],
      roughnessDelta: 0.28,
      outfitPrimarySrgb: warmShift(darken(primary, 0.68)),
      outfitSecondarySrgb: warmShift(darken(secondary, 0.64)),
      accentSrgb: { r: 0.72, g: 0.24, b: 0.21 },
    },
    {
      slotIndex: 6,
      slotId: "aftermath-bandaged",
      labelKo: "6. 전투 직후 응급처치",
      labelEn: "6. Aftermath Bandaged",
      damagePercent: 52,
      tornMaskLayers: ["forearm-bandage", "forehead-gauze"],
      propAttachments: ["arm-sling", "overcoat-draped"],
      roughnessDelta: 0.12,
      outfitPrimarySrgb: darken(primary, 0.92),
      outfitSecondarySrgb: { r: 0.93, g: 0.92, b: 0.89 },
      accentSrgb: { r: 0.84, g: 0.48, b: 0.36 },
    },
  ];
}

/** 기본 캐릭터 라이브 링크 레지스트리 (강서준 184cm + 한유나 162cm, 6종 의상·전투손상 완비). */
export function createDemoCharacterLiveLinkRegistry(): CharacterLiveLinkRegistry {
  const seojun: CharacterLiveLinkProfile = {
    characterId: "seojun-184",
    displayNameKo: "강서준 (184cm)",
    displayNameEn: "Seojun Kang (184cm)",
    realHeightCm: 184,
    rawMeshHeightM: 1.72,
    heelLiftCm: 2.0,
    eyeHeightRatio: 0.936,
    shoulderHeightRatio: 0.818,
    upperArmM: 0.34,
    forearmM: 0.29,
    activeSlotId: "combat-ready",
    costumeSlots: buildSixCostumeSlots(
      { r: 0.18, g: 0.24, b: 0.36 },
      { r: 0.76, g: 0.74, b: 0.7 },
      { r: 0.82, g: 0.45, b: 0.24 },
    ),
    baseMaterials: {
      hairSrgb: { r: 0.13, g: 0.15, b: 0.2 },
      skinSrgb: { r: 0.91, g: 0.78, b: 0.69 },
      eyeSrgb: { r: 0.26, g: 0.48, b: 0.64 },
    },
    linkRevision: 1,
  };

  const yuna: CharacterLiveLinkProfile = {
    characterId: "yuna-162",
    displayNameKo: "한유나 (162cm)",
    displayNameEn: "Yuna Han (162cm)",
    realHeightCm: 162,
    rawMeshHeightM: 1.68,
    heelLiftCm: 1.5,
    eyeHeightRatio: 0.932,
    shoulderHeightRatio: 0.812,
    upperArmM: 0.29,
    forearmM: 0.25,
    activeSlotId: "everyday-casual",
    costumeSlots: buildSixCostumeSlots(
      { r: 0.78, g: 0.34, b: 0.31 },
      { r: 0.92, g: 0.89, b: 0.84 },
      { r: 0.25, g: 0.52, b: 0.49 },
    ),
    baseMaterials: {
      hairSrgb: { r: 0.36, g: 0.22, b: 0.17 },
      skinSrgb: { r: 0.95, g: 0.83, b: 0.75 },
      eyeSrgb: { r: 0.58, g: 0.39, b: 0.2 },
    },
    linkRevision: 1,
  };

  return {
    profiles: [seojun, yuna],
    cutBindings: [
      {
        cutId: "ep12-cut04",
        cutTitleKo: "12화 4컷 · 옥상 대치",
        characterId: "seojun-184",
        syncedRevision: 1,
        activeSlotId: "combat-ready",
        appliedHeightCm: 184,
        lockLocalCostumeOverride: false,
      },
      {
        cutId: "ep12-cut07",
        cutTitleKo: "12화 7컷 · 협공 클로즈업",
        characterId: "seojun-184",
        syncedRevision: 1,
        activeSlotId: "combat-ready",
        appliedHeightCm: 184,
        lockLocalCostumeOverride: false,
      },
      {
        cutId: "ep12-cut09-flashback",
        cutTitleKo: "12화 9컷 · 회상(로컬 의상 고정)",
        characterId: "seojun-184",
        syncedRevision: 1,
        activeSlotId: "formal-uniform",
        appliedHeightCm: 184,
        lockLocalCostumeOverride: true,
      },
      {
        cutId: "ep12-cut04-yuna",
        cutTitleKo: "12화 4컷 · 한유나 합류",
        characterId: "yuna-162",
        syncedRevision: 1,
        activeSlotId: "everyday-casual",
        appliedHeightCm: 162,
        lockLocalCostumeOverride: false,
      },
    ],
    lastSyncSummary: "라이브 링크 초기화 완료 (2명 · 4컷 연결)",
  };
}

export const DEMO_IK_ANCHOR_PRESETS: readonly IkAnchorLockRequest[] = [
  {
    anchorId: "couple-hand-hold-demo",
    kind: "couple-hand-hold",
    labelKo: "커플 손잡기 잠금",
    labelEn: "Couple Hand-Hold Lock",
    primaryArm: {
      actorId: "seojun-184",
      shoulderPos: { x: -0.34, y: 1.5, z: 0 },
      upperArmM: 0.34,
      forearmM: 0.29,
      poleHint: { x: -0.42, y: 1.24, z: -0.22 },
    },
    partnerArm: {
      actorId: "yuna-162",
      shoulderPos: { x: 0.34, y: 1.32, z: 0.04 },
      upperArmM: 0.29,
      forearmM: 0.25,
      poleHint: { x: 0.42, y: 1.12, z: -0.2 },
    },
    targetAnchorPos: { x: 0.02, y: 1.06, z: 0.14 },
  },
  {
    anchorId: "prop-weapon-grip-demo",
    kind: "prop-weapon-grip",
    labelKo: "흑요석 장검 파지",
    labelEn: "Obsidian Blade Grip",
    primaryArm: {
      actorId: "seojun-184",
      shoulderPos: { x: -0.18, y: 1.5, z: 0 },
      upperArmM: 0.34,
      forearmM: 0.29,
      poleHint: { x: -0.35, y: 1.28, z: -0.18 },
    },
    targetAnchorPos: { x: 0.14, y: 1.26, z: 0.38 },
  },
  {
    anchorId: "couple-wrist-grab-demo",
    kind: "couple-wrist-grab",
    labelKo: "손목 붙잡기 (긴박 연출)",
    labelEn: "Dramatic Wrist Grab",
    primaryArm: {
      actorId: "seojun-184",
      shoulderPos: { x: -0.38, y: 1.5, z: 0 },
      upperArmM: 0.34,
      forearmM: 0.29,
      poleHint: { x: -0.45, y: 1.3, z: -0.2 },
    },
    partnerArm: {
      actorId: "yuna-162",
      shoulderPos: { x: 0.36, y: 1.32, z: 0.08 },
      upperArmM: 0.29,
      forearmM: 0.25,
      poleHint: { x: 0.44, y: 1.16, z: -0.18 },
    },
    targetAnchorPos: { x: 0.05, y: 1.22, z: 0.24 },
  },
  {
    anchorId: "prop-cup-hold-demo",
    kind: "prop-cup-hold",
    labelKo: "카페 머그컵 파지",
    labelEn: "Cafe Mug Grip",
    primaryArm: {
      actorId: "yuna-162",
      shoulderPos: { x: 0.18, y: 1.32, z: 0 },
      upperArmM: 0.29,
      forearmM: 0.25,
      poleHint: { x: 0.34, y: 1.1, z: -0.16 },
    },
    targetAnchorPos: { x: 0.06, y: 1.08, z: 0.34 },
  },
];
