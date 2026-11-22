/**
 * 3D 배경 + 3D 캐릭터 원클릭 통합 합성 스테이지 엔진 (Wave 13D).
 *
 * - 바닥 Y=0 및 계단·단차·제단·테라스 높이 자동 접지 잠금(`snapCharacterToStageFloor`, 오차 0.000m)
 * - 1~3인 캐릭터(VRM 아바타 + 한국 웹툰 10종 아키타입) 어깨·무기 관통 자동 이격 보정
 * - 배경 시간대 OKLCH 주광색 연동 림라이트·바운스 틴트·접지 그림자 및 단일 등방성 잉크 동기화
 * - 8종 구도 프레이밍 · 자동 3D 군중 엑스트라 · 5개 분리 레이어 비파괴 컷 베이크
 */

import {
  KWEBTOON_ARCHETYPE_STAGE_BRIDGE,
  KWEBTOON_CEL_PRESETS,
  applyUnifiedMToonInkContract,
  computeIsotropicClipSpacePush,
  computeScreenSpaceOutlineFactor,
  createUnifiedInkContract,
  measureIsotropicOutlinePxAtAngle,
  type InkLightingMode,
  type KWebtoonArchetypeBridgeId,
  type KWebtoonCelPresetId,
  type MToonInkConversionReport,
  type SceneTraverseObjectLike,
  type UnifiedInkContract,
} from "../studio-3d-pro/kwebtoon-npr-ink-contract";
import {
  COMPOSITE_BAKE_PASS_ORDER,
  DEFAULT_ENABLED_BAKE_PASSES,
  MAX_STAGE_CHARACTERS,
  MIN_STAGE_CHARACTERS,
  STAGE_ARCHETYPE_COMBAT_SPECS,
  STAGE_ASPECT_DIMENSIONS,
  STAGE_BACKGROUND_SLOTS,
  STAGE_TIME_OF_DAY_LIST,
  STAGE_TIME_OF_DAY_PROFILES,
  WEBTOON_COMPOSITE_FRAMING_PRESETS,
  clampStageNumber,
  formatStageOklch,
  getStageBackgroundSlot,
  getWebtoonCompositeFramingPreset,
  mixStageOklch,
  roundStage3,
  roundStage4,
  type CompositeBakePassCode,
  type FramingCharacterPlacement,
  type StageAspectRatioId,
  type StageBackgroundSlot,
  type StageBackgroundSlotId,
  type StageCharacterSourceKind,
  type StageCharacterStanceId,
  type StageCrowdDensityId,
  type StageElevationZone,
  type StageOklchColor,
  type StageSurfaceKind,
  type StageTimeOfDayId,
  type StageTimeOfDayLightingProfile,
  type WebtoonCompositeFramingId,
  type WebtoonCompositeFramingPreset,
} from "./stage-3d-compositor-catalog";
import { buildStageLtSixPassBundle, computeStageSubjectDepthNorm, getStageAlphaCutoutMaterials, type StageAlphaCutoutMaterialSpec, type StageDepthAttenuatedSubject, type StageLtSixPassBundle } from "./stage-3d-lt-six-pass-parallax";
import type { LtDepthAttenuationPresetId } from "../lt-convert/studio-lt-depth-attenuation";

export {
  buildStageLtSixPassBundle, computeStageSubjectDepthNorm, getStageAlphaCutoutMaterials,
  type LtDepthAttenuationPresetId, type StageAlphaCutoutMaterialSpec, type StageDepthAttenuatedSubject, type StageLtSixPassBundle,
  COMPOSITE_BAKE_PASS_ORDER,
  DEFAULT_ENABLED_BAKE_PASSES,
  MAX_STAGE_CHARACTERS,
  MIN_STAGE_CHARACTERS,
  STAGE_ASPECT_DIMENSIONS,
  STAGE_BACKGROUND_SLOTS,
  STAGE_TIME_OF_DAY_LIST,
  STAGE_TIME_OF_DAY_PROFILES,
  WEBTOON_COMPOSITE_FRAMING_PRESETS,
  formatStageOklch,
  getStageBackgroundSlot,
  getWebtoonCompositeFramingPreset,
  type CompositeBakePassCode,
  type FramingCharacterPlacement,
  type StageAspectRatioId,
  type StageBackgroundSlot,
  type StageBackgroundSlotId,
  type StageCharacterSourceKind,
  type StageCharacterStanceId,
  type StageCrowdDensityId,
  type StageElevationZone,
  type StageOklchColor,
  type StageSurfaceKind,
  type StageTimeOfDayId,
  type StageTimeOfDayLightingProfile,
  type WebtoonCompositeFramingId,
  type WebtoonCompositeFramingPreset,
};

// ── 1. 캐릭터 슬롯 · 바닥/계단 자동 접지 잠금 · 충돌 자동 이격 ──────────────

export interface StageCharacterSlot {
  readonly id: string;
  readonly displayNameKo: string;
  readonly sourceKind: StageCharacterSourceKind;
  readonly archetypeId: KWebtoonArchetypeBridgeId;
  readonly vrmUrl?: string;
  readonly heightM: number;
  readonly shoulderRadiusM: number;
  readonly weaponReachM: number;
  readonly stance: StageCharacterStanceId;
  readonly positionM: readonly [number, number, number];
  readonly facingYawRad: number;
  readonly footSoleLocalY: number;
  readonly accentOklch: StageOklchColor;
  readonly groundedZoneId: string;
  readonly groundedZoneLabelKo: string;
  readonly groundingErrorMeters: number;
}

export interface FloorSnapResolution {
  readonly surfaceY: number;
  readonly resolvedRootY: number;
  readonly footWorldY: number;
  readonly groundingErrorMeters: number;
  readonly zoneId: string;
  readonly zoneLabelKo: string;
  readonly surfaceKind: StageSurfaceKind;
}

export interface CharacterCollisionAdjustment {
  readonly characterId: string;
  readonly deltaXM: number;
  readonly deltaZM: number;
  readonly movedDistanceM: number;
}

export interface CharacterCollisionResolution {
  readonly characters: readonly StageCharacterSlot[];
  readonly hadCollision: boolean;
  readonly resolvedPairCount: number;
  readonly adjustments: readonly CharacterCollisionAdjustment[];
}

function isInsideElevationZone(zone: StageElevationZone, x: number, z: number): boolean {
  const dx = x - zone.centerX;
  const dz = z - zone.centerZ;
  if (zone.shape === "circle") {
    return Math.hypot(dx, dz) <= (zone.radiusM ?? Math.max(zone.halfWidthX, zone.halfDepthZ)) + 1e-6;
  }
  return Math.abs(dx) <= zone.halfWidthX + 1e-6 && Math.abs(dz) <= zone.halfDepthZ + 1e-6;
}

/**
 * 캐릭터 `(x, z)`를 배경 바닥(`Y=0`) 및 계단·단차·제단 높이에 오차 `0.000 m`로 자동 접지 잠금한다.
 */
export function snapCharacterToStageFloor(
  background: StageBackgroundSlot,
  x: number,
  z: number,
  options?: { readonly footSoleLocalY?: number; readonly manualGroundOffsetM?: number },
): FloorSnapResolution {
  let matched: StageElevationZone | null = null;
  for (const zone of background.elevationZones) {
    if (isInsideElevationZone(zone, x, z) && (!matched || zone.elevationY > matched.elevationY)) {
      matched = zone;
    }
  }
  const surfaceY = roundStage4(matched ? matched.elevationY : 0);
  const footSoleLocalY = Number.isFinite(options?.footSoleLocalY) ? (options?.footSoleLocalY ?? 0) : 0;
  const manualOffset = Number.isFinite(options?.manualGroundOffsetM)
    ? clampStageNumber(options?.manualGroundOffsetM ?? 0, -0.3, 0.5)
    : 0;
  const resolvedRootY = roundStage4(surfaceY - footSoleLocalY + manualOffset);
  const footWorldY = roundStage4(resolvedRootY + footSoleLocalY);
  const groundingErrorMeters = roundStage4(Math.abs(footWorldY - roundStage4(surfaceY + manualOffset)));

  return {
    surfaceY, resolvedRootY, footWorldY, groundingErrorMeters,
    zoneId: matched ? matched.id : "stage-floor-y0",
    zoneLabelKo: matched ? matched.labelKo : "기본 바닥 (Y=0.00m)",
    surfaceKind: matched ? matched.surfaceKind : "floor",
  };
}

export function createStageCharacterSlot(
  id: string,
  archetypeId: KWebtoonArchetypeBridgeId,
  background: StageBackgroundSlot,
  overrides?: {
    readonly displayNameKo?: string;
    readonly sourceKind?: StageCharacterSourceKind;
    readonly vrmUrl?: string;
    readonly positionXZ?: readonly [number, number];
    readonly facingYawRad?: number;
    readonly stance?: StageCharacterStanceId;
    readonly footSoleLocalY?: number;
    readonly manualGroundOffsetM?: number;
  },
): StageCharacterSlot {
  const bridge =
    KWEBTOON_ARCHETYPE_STAGE_BRIDGE.find((item) => item.archetypeId === archetypeId) ??
    KWEBTOON_ARCHETYPE_STAGE_BRIDGE[0];
  const spec = STAGE_ARCHETYPE_COMBAT_SPECS[bridge.archetypeId];
  const heightM = roundStage3(bridge.headsTall <= 4.0 ? 0.92 : 1.56 + (bridge.headsTall - 7.2) * 0.19);
  const [rawX, rawZ] = overrides?.positionXZ ?? [0, 0.4];
  const halfW = Math.max(1.2, background.footprintMeters[0] * 0.44);
  const halfD = Math.max(1.2, background.footprintMeters[2] * 0.44);
  const cx = roundStage3(clampStageNumber(rawX, -halfW, halfW));
  const cz = roundStage3(clampStageNumber(rawZ, -halfD, halfD));
  const footSoleLocalY = overrides?.footSoleLocalY ?? 0;
  const snap = snapCharacterToStageFloor(background, cx, cz, {
    footSoleLocalY,
    manualGroundOffsetM: overrides?.manualGroundOffsetM,
  });

  return {
    id,
    displayNameKo: overrides?.displayNameKo ?? bridge.shortLabelKo,
    sourceKind: overrides?.sourceKind ?? "kwebtoon-archetype",
    archetypeId: bridge.archetypeId,
    vrmUrl: overrides?.vrmUrl,
    heightM,
    shoulderRadiusM: spec.shoulder,
    weaponReachM: spec.weapon,
    stance: overrides?.stance ?? "standing",
    positionM: [cx, snap.resolvedRootY, cz],
    facingYawRad: overrides?.facingYawRad ?? 0,
    footSoleLocalY,
    accentOklch: spec.color,
    groundedZoneId: snap.zoneId,
    groundedZoneLabelKo: snap.zoneLabelKo,
    groundingErrorMeters: snap.groundingErrorMeters,
  };
}

export function computeCharacterClearanceRadiusM(slot: StageCharacterSlot): number {
  return roundStage4(slot.shoulderRadiusM + slot.weaponReachM * 0.55 + 0.08);
}

/** 1~3인 캐릭터 어깨·무기 관통을 XZ 평면에서 자동 이격하고 바닥/계단에 0.000m 재접지한다. */
export function resolveCharacterSlotCollisions(
  characters: readonly StageCharacterSlot[],
  background: StageBackgroundSlot,
  manualGroundOffsetM = 0,
): CharacterCollisionResolution {
  const halfW = Math.max(1.2, background.footprintMeters[0] * 0.44);
  const halfD = Math.max(1.2, background.footprintMeters[2] * 0.44);
  const coords = characters.map((c) => ({
    origX: c.positionM[0], origZ: c.positionM[2],
    x: c.positionM[0], z: c.positionM[2],
    radius: computeCharacterClearanceRadiusM(c),
  }));
  const collidedPairs = new Set<string>();

  for (let pass = 0; pass < 14; pass += 1) {
    let anyMoved = false;
    for (let i = 0; i < coords.length; i += 1) {
      for (let j = i + 1; j < coords.length; j += 1) {
        const a = coords[i];
        const b = coords[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const minDist = a.radius + b.radius;
        const dist = Math.hypot(dx, dz);
        if (dist < minDist - 1e-4) {
          collidedPairs.add(`${i}:${j}`);
          const push = (minDist - dist + 0.004) * 0.5;
          const nx = dist > 1e-5 ? dx / dist : i % 2 === 0 ? 1 : -1;
          const nz = dist > 1e-5 ? dz / dist : 0;
          a.x = clampStageNumber(a.x - nx * push, -halfW, halfW);
          a.z = clampStageNumber(a.z - nz * push, -halfD, halfD);
          b.x = clampStageNumber(b.x + nx * push, -halfW, halfW);
          b.z = clampStageNumber(b.z + nz * push, -halfD, halfD);
          anyMoved = true;
        }
      }
    }
    if (!anyMoved) break;
  }

  const adjustments: CharacterCollisionAdjustment[] = [];
  const nextCharacters = characters.map((char, idx): StageCharacterSlot => {
    const c = coords[idx];
    const nextX = roundStage3(c.x);
    const nextZ = roundStage3(c.z);
    const deltaXM = roundStage3(nextX - c.origX);
    const deltaZM = roundStage3(nextZ - c.origZ);
    const movedDistanceM = roundStage3(Math.hypot(deltaXM, deltaZM));
    if (movedDistanceM > 0) adjustments.push({ characterId: char.id, deltaXM, deltaZM, movedDistanceM });
    const snap = snapCharacterToStageFloor(background, nextX, nextZ, {
      footSoleLocalY: char.footSoleLocalY,
      manualGroundOffsetM,
    });
    return {
      ...char,
      positionM: [nextX, snap.resolvedRootY, nextZ],
      groundedZoneId: snap.zoneId,
      groundedZoneLabelKo: snap.zoneLabelKo,
      groundingErrorMeters: snap.groundingErrorMeters,
    };
  });

  return { characters: nextCharacters, hadCollision: collidedPairs.size > 0, resolvedPairCount: collidedPairs.size, adjustments };
}

// ── 2. 단일 잉크 · 색온도 연동 림라이트 · 접지 그림자 하모나이저 ────────────

export interface StageContactShadowSpec {
  readonly characterId: string;
  readonly anchorM: readonly [number, number, number];
  readonly projectionAngleDeg: number;
  readonly projectionLengthM: number;
  readonly ellipseRadiusXM: number;
  readonly ellipseRadiusZM: number;
  readonly offsetXM: number;
  readonly offsetZM: number;
  readonly opacity: number;
  readonly softnessM: number;
  readonly shadowOklchCss: string;
}

export interface StageLightingAndInkHarmony {
  readonly aspectRatio: StageAspectRatioId;
  readonly viewportPx: readonly [number, number];
  readonly timeOfDay: StageTimeOfDayId;
  readonly kelvin: number;
  readonly inkContract: UnifiedInkContract;
  readonly unifiedOutlineWidthFactor: number;
  readonly backgroundMeasuredInkPx: number;
  readonly characterMeasuredInkPx: number;
  readonly isotropicRatio: number;
  readonly clipPushSampleNdcX: number;
  readonly keyLightOklchCss: string;
  readonly rimLightOklchCss: string;
  readonly rimAzimuthDeg: number;
  readonly rimIntensity: number;
  readonly floorBounceOklchCss: string;
  readonly floorBounceStrength: number;
  readonly atmosphereOklchCss: string;
  readonly contactShadows: readonly StageContactShadowSpec[];
}

/** 배경과 1~3인 캐릭터의 등방성 잉크·림라이트·바운스 틴트·접지 그림자를 단일 규칙으로 동기화한다. */
export function harmonizeStageLightingAndInk(params: {
  readonly background: StageBackgroundSlot;
  readonly characters: readonly StageCharacterSlot[];
  readonly timeOfDay: StageTimeOfDayId;
  readonly celPresetId: KWebtoonCelPresetId;
  readonly inkPx: number;
  readonly aspectRatio: StageAspectRatioId;
  readonly lightingMode?: InkLightingMode;
}): StageLightingAndInkHarmony {
  const [vw, vh] = STAGE_ASPECT_DIMENSIONS[params.aspectRatio];
  const inkContract = createUnifiedInkContract(params.celPresetId, {
    inkPx: params.inkPx,
    lightingMode: params.lightingMode,
  });
  const unifiedFactor = computeScreenSpaceOutlineFactor(inkContract.inkPx, vh);
  const measured = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4].map((a) =>
    measureIsotropicOutlinePxAtAngle(a, vw, vh, unifiedFactor),
  );
  const minW = Math.min(...measured);
  const isotropicRatio = minW > 0 ? roundStage4(Math.max(...measured) / minW) : 1;
  const clipSample = computeIsotropicClipSpacePush([0, 0, 0, 4], [1, 0, 0, 0], vw, vh, unifiedFactor);

  const timeProfile = STAGE_TIME_OF_DAY_PROFILES[params.timeOfDay];
  const floorBounce = mixStageOklch(params.background.floorBounceOklch, timeProfile.keyLightOklch, 0.35);
  const rimColor = mixStageOklch(timeProfile.rimLightOklch, params.background.backdropAccentOklch, 0.25);
  const shadowAngleDeg = roundStage3(((timeProfile.sunAzimuthDeg + 180) % 360 + 360) % 360);
  const shadowRad = (shadowAngleDeg * Math.PI) / 180;
  const elevRad = (clampStageNumber(timeProfile.sunElevationDeg, 10, 80) * Math.PI) / 180;
  const shadowCss = formatStageOklch(timeProfile.shadowTintOklch, timeProfile.contactShadowOpacity);

  const contactShadows = params.characters.map((char): StageContactShadowSpec => {
    const projectionLengthM = roundStage3(clampStageNumber((char.heightM * 0.42) / Math.tan(elevRad), 0.24, 1.45));
    const footY = roundStage4(char.positionM[1] + char.footSoleLocalY);
    return {
      characterId: char.id,
      anchorM: [char.positionM[0], footY, char.positionM[2]],
      projectionAngleDeg: shadowAngleDeg,
      projectionLengthM,
      ellipseRadiusXM: roundStage3(char.shoulderRadiusM * 1.15),
      ellipseRadiusZM: roundStage3(Math.max(char.shoulderRadiusM * 0.95, projectionLengthM * 0.55)),
      offsetXM: roundStage3(Math.sin(shadowRad) * projectionLengthM * 0.36),
      offsetZM: roundStage3(Math.cos(shadowRad) * projectionLengthM * 0.36),
      opacity: roundStage3(clampStageNumber(timeProfile.contactShadowOpacity * (1 - params.background.floorRoughness * 0.15), 0.28, 0.78)),
      softnessM: timeProfile.contactShadowSoftnessM,
      shadowOklchCss: shadowCss,
    };
  });

  return {
    aspectRatio: params.aspectRatio,
    viewportPx: [vw, vh],
    timeOfDay: params.timeOfDay,
    kelvin: timeProfile.kelvin,
    inkContract,
    unifiedOutlineWidthFactor: unifiedFactor,
    backgroundMeasuredInkPx: roundStage4(measured[0] ?? inkContract.inkPx),
    characterMeasuredInkPx: roundStage4((unifiedFactor * vh) / 2),
    isotropicRatio,
    clipPushSampleNdcX: roundStage4(clipSample.pushedClip[0] / clipSample.pushedClip[3]),
    keyLightOklchCss: formatStageOklch(timeProfile.keyLightOklch),
    rimLightOklchCss: formatStageOklch(rimColor),
    rimAzimuthDeg: roundStage3(((timeProfile.sunAzimuthDeg + 165) % 360 + 360) % 360),
    rimIntensity: params.timeOfDay === "sunset" || params.timeOfDay === "night" ? 0.88 : 0.62,
    floorBounceOklchCss: formatStageOklch(floorBounce),
    floorBounceStrength: roundStage3(clampStageNumber(0.48 - params.background.floorRoughness * 0.28, 0.18, 0.48)),
    atmosphereOklchCss: formatStageOklch(timeProfile.atmosphereTintOklch),
    contactShadows,
  };
}

export function applyStageInkContractToVrmNodes(
  root: SceneTraverseObjectLike,
  harmony: StageLightingAndInkHarmony,
): MToonInkConversionReport {
  return applyUnifiedMToonInkContract(root, harmony.inkContract, harmony.viewportPx[1]);
}

// ── 3. 자동 3D 군중 엑스트라 · 5레이어 비파괴 컷 베이크 ─────────────────────

export interface StageCrowdExtraSlot {
  readonly id: string;
  readonly labelKo: string;
  readonly positionM: readonly [number, number, number];
  readonly heightM: number;
  readonly facingYawRad: number;
  readonly silhouetteOpacity: number;
  readonly inkScale: number;
  readonly groundedZoneId: string;
  readonly groundingErrorMeters: number;
}

const CROWD_COUNTS: Readonly<Record<StageCrowdDensityId, number>> = Object.freeze({
  none: 0, sparse: 4, medium: 8, bustling: 14,
});

function createSeededRandom(key: string): () => number {
  let state = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    state ^= key.charCodeAt(i);
    state = Math.imul(state, 16777619);
  }
  state = (state >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/** 주연 캐릭터와 카메라 중앙 시야를 피해 바닥·계단에 접지된 3D 군중 엑스트라를 배치한다. */
export function generateStageCrowdExtras(params: {
  readonly background: StageBackgroundSlot;
  readonly characters: readonly StageCharacterSlot[];
  readonly framingId: WebtoonCompositeFramingId;
  readonly density: StageCrowdDensityId;
}): readonly StageCrowdExtraSlot[] {
  const count = CROWD_COUNTS[params.density];
  if (count === 0) return [];
  const rand = createSeededRandom(`${params.background.id}:${params.framingId}:${params.density}`);
  const halfW = Math.max(1.8, params.background.footprintMeters[0] * 0.43);
  const halfD = Math.max(1.8, params.background.footprintMeters[2] * 0.43);
  const extras: StageCrowdExtraSlot[] = [];

  for (let i = 0; i < count; i += 1) {
    let chosenX = roundStage3(Math.cos(((i + 0.5) / count) * Math.PI) * halfW * 0.88);
    let chosenZ = roundStage3(-Math.abs(Math.sin(((i + 0.5) / count) * Math.PI)) * halfD * 0.85);
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const side = (i + attempt) % 2 === 0 ? -1 : 1;
      const x = roundStage3(clampStageNumber(side * (0.9 + rand() * (halfW - 0.9)), -halfW, halfW));
      const z = roundStage3(clampStageNumber(-halfD * 0.15 - rand() * (halfD * 0.78), -halfD, halfD * 0.5));
      const clearActors = params.characters.every((c) => Math.hypot(c.positionM[0] - x, c.positionM[2] - z) >= 1.25);
      const clearExtras = extras.every((e) => Math.hypot(e.positionM[0] - x, e.positionM[2] - z) >= 0.72);
      if (clearActors && clearExtras) {
        chosenX = x;
        chosenZ = z;
        break;
      }
    }
    const snap = snapCharacterToStageFloor(params.background, chosenX, chosenZ);
    const depthRatio = clampStageNumber((-chosenZ + halfD * 0.2) / (halfD * 1.2), 0.15, 1);
    extras.push({
      id: `crowd-extra-${i + 1}`, labelKo: `배경 엑스트라 ${i + 1}`,
      positionM: [chosenX, snap.resolvedRootY, chosenZ],
      heightM: roundStage3(1.58 + rand() * 0.22), facingYawRad: roundStage3((rand() - 0.5) * Math.PI * 1.4),
      silhouetteOpacity: roundStage3(clampStageNumber(0.56 - depthRatio * 0.24, 0.26, 0.58)), inkScale: 0.7,
      groundedZoneId: snap.zoneId, groundingErrorMeters: snap.groundingErrorMeters,
    });
  }
  return extras;
}

export interface CompositeCutLayerPass {
  readonly passCode: CompositeBakePassCode;
  readonly order: 1 | 2 | 3 | 4 | 5;
  readonly labelKo: string;
  readonly cspRoleKo: string;
  readonly blendMode: "normal" | "multiply" | "screen";
  readonly opacity: number;
  readonly enabled: boolean;
  readonly fileName: string;
  readonly svgFragment: string;
}

export interface CompositeCutPngManifest {
  readonly nonDestructive: true;
  readonly colorSpace: "srgb";
  readonly widthPx: number;
  readonly heightPx: number;
  readonly inkPx: number;
  readonly groundingVerified: boolean;
  readonly maxGroundingErrorMeters: number;
  readonly passFiles: readonly string[];
}

export interface CompositeCutLayerPlan {
  readonly backgroundId: StageBackgroundSlotId;
  readonly framingId: WebtoonCompositeFramingId;
  readonly aspectRatio: StageAspectRatioId;
  readonly viewportPx: readonly [number, number];
  readonly layers: readonly CompositeCutLayerPass[];
  readonly enabledCount: number;
  readonly compositeSvgMarkup: string;
  readonly pngManifest: CompositeCutPngManifest;
  readonly ltSixPassBundle: StageLtSixPassBundle;
}

export interface StageCompositeState {
  readonly backgroundId: StageBackgroundSlotId;
  readonly characters: readonly StageCharacterSlot[];
  readonly framingId: WebtoonCompositeFramingId;
  readonly timeOfDay: StageTimeOfDayId;
  readonly celPresetId: KWebtoonCelPresetId;
  readonly aspectRatio: StageAspectRatioId;
  readonly inkPx: number;
  readonly manualGroundOffsetM: number;
  readonly crowdDensity: StageCrowdDensityId;
  readonly enabledPasses: Readonly<Record<CompositeBakePassCode, boolean>>;
  readonly lastCollisionCount: number;
  readonly ltDepthPreset?: LtDepthAttenuationPresetId;
  readonly alphaCutoutThreshold?: number;
}

export function projectStagePointToPreview(
  x: number,
  y: number,
  z: number,
  footprint: readonly [number, number, number],
  width = 360,
  height = 220,
): { readonly cx: number; readonly cy: number; readonly scale: number } {
  const halfW = Math.max(2.6, footprint[0] * 0.5);
  const halfD = Math.max(2.6, footprint[2] * 0.5);
  const depthNorm = clampStageNumber((z + halfD) / (halfD * 2), 0.05, 1);
  const scale = roundStage3(0.58 + depthNorm * 0.52);
  const cx = roundStage3(width * 0.5 + (x / halfW) * (width * 0.36) * scale);
  const cy = roundStage3(height * 0.36 + depthNorm * (height * 0.5) - y * 44 * scale);
  return { cx, cy, scale };
}

/** 5개 분리 레이어(`10_BG_3D_LT` ~ `50_RIM_ATMOSPHERE`)와 SVG 합성 프리뷰를 비파괴 생성한다. */
export function buildCompositeCutLayerPlan(params: {
  readonly state: StageCompositeState;
  readonly harmony: StageLightingAndInkHarmony;
  readonly crowdExtras: readonly StageCrowdExtraSlot[];
}): CompositeCutLayerPlan {
  const { state, harmony, crowdExtras } = params;
  const bg = getStageBackgroundSlot(state.backgroundId);
  const timeProfile = STAGE_TIME_OF_DAY_PROFILES[state.timeOfDay];
  const inkStroke = roundStage3(clampStageNumber(harmony.inkContract.inkPx * 0.95, 0.8, 3.2));
  const inkCss = formatStageOklch({ l: 0.2, c: 0.03, h: timeProfile.shadowTintOklch.h });

  const zoneSvg = bg.elevationZones.map((zone) => {
    const p = projectStagePointToPreview(zone.centerX, zone.elevationY, zone.centerZ, bg.footprintMeters);
    const rw = roundStage3(Math.max(36, zone.halfWidthX * 30 * p.scale));
    const rh = roundStage3(Math.max(12, zone.halfDepthZ * 16 * p.scale));
    return `<rect x="${roundStage3(p.cx - rw * 0.5)}" y="${roundStage3(p.cy - rh * 0.4)}" width="${rw}" height="${rh}" rx="4" fill="${formatStageOklch(bg.floorBounceOklch, 0.52)}" stroke="${inkCss}" stroke-width="${roundStage3(inkStroke * 0.7)}" />`;
  }).join("");

  const crowdSvg = crowdExtras.map((e) => {
    const p = projectStagePointToPreview(e.positionM[0], e.positionM[1], e.positionM[2], bg.footprintMeters);
    const hPx = roundStage3(e.heightM * 26 * p.scale);
    return `<ellipse cx="${p.cx}" cy="${roundStage3(p.cy - hPx * 0.45)}" rx="${roundStage3(6 * p.scale)}" ry="${roundStage3(hPx * 0.48)}" fill="${formatStageOklch(timeProfile.ambientSkyOklch, e.silhouetteOpacity)}" />`;
  }).join("");

  const bgFragment = `<g data-pass="10_BG_3D_LT"><rect x="0" y="0" width="360" height="84" fill="${formatStageOklch(timeProfile.ambientSkyOklch, 0.42)}" /><rect x="0" y="84" width="360" height="136" fill="${formatStageOklch(bg.floorBounceOklch, 0.34)}" /><line x1="0" y1="84" x2="360" y2="84" stroke="${inkCss}" stroke-width="${roundStage3(inkStroke * 0.8)}" />${zoneSvg}${crowdSvg}</g>`;

  const shadowFragment = `<g data-pass="40_CONTACT_SHADOW">${harmony.contactShadows.map((s) => {
    const p = projectStagePointToPreview(s.anchorM[0] + s.offsetXM, s.anchorM[1], s.anchorM[2] + s.offsetZM, bg.footprintMeters);
    return `<ellipse cx="${p.cx}" cy="${p.cy}" rx="${roundStage3(Math.max(12, s.ellipseRadiusXM * 46 * p.scale))}" ry="${roundStage3(Math.max(5, s.ellipseRadiusZM * 14 * p.scale))}" fill="${s.shadowOklchCss}" />`;
  }).join("")}</g>`;

  const charBoxes = state.characters.map((char) => {
    const p = projectStagePointToPreview(char.positionM[0], char.positionM[1] + char.footSoleLocalY, char.positionM[2], bg.footprintMeters);
    const hPx = roundStage3(char.heightM * 36 * p.scale);
    const wPx = roundStage3(char.shoulderRadiusM * 56 * p.scale);
    return { char, p, hPx, wPx, headR: roundStage3(Math.max(5.5, hPx * 0.13)) };
  });

  const charFlatFragment = `<g data-pass="30_CHAR_FLAT">${charBoxes.map(({ char, p, hPx, wPx, headR }) => {
    const fill = formatStageOklch(char.accentOklch, 0.86);
    return `<rect x="${roundStage3(p.cx - wPx * 0.5)}" y="${roundStage3(p.cy - hPx * 0.78)}" width="${wPx}" height="${roundStage3(hPx * 0.78)}" rx="6" fill="${fill}" /><circle cx="${p.cx}" cy="${roundStage3(p.cy - hPx * 0.89)}" r="${headR}" fill="${fill}" />`;
  }).join("")}</g>`;

  const charLineFragment = `<g data-pass="20_CHAR_LINEART">${charBoxes.map(({ p, hPx, wPx, headR }) =>
    `<rect x="${roundStage3(p.cx - wPx * 0.5)}" y="${roundStage3(p.cy - hPx * 0.78)}" width="${wPx}" height="${roundStage3(hPx * 0.78)}" rx="6" fill="none" stroke="${inkCss}" stroke-width="${inkStroke}" /><circle cx="${p.cx}" cy="${roundStage3(p.cy - hPx * 0.89)}" r="${headR}" fill="none" stroke="${inkCss}" stroke-width="${inkStroke}" />`
  ).join("")}</g>`;

  const rimFragment = `<g data-pass="50_RIM_ATMOSPHERE">${charBoxes.map(({ p, hPx, wPx }) => {
    const rimX = roundStage3(p.cx + (harmony.rimAzimuthDeg > 180 ? -wPx * 0.48 : wPx * 0.48));
    return `<line x1="${rimX}" y1="${roundStage3(p.cy - hPx * 0.94)}" x2="${rimX}" y2="${roundStage3(p.cy - hPx * 0.08)}" stroke="${harmony.rimLightOklchCss}" stroke-width="${roundStage3(inkStroke * 1.15)}" stroke-linecap="round" />`;
  }).join("")}</g>`;

  const layers: readonly CompositeCutLayerPass[] = Object.freeze([
    { passCode: "10_BG_3D_LT", order: 1, labelKo: "3D 배경 선화·톤 (LT)", cspRoleKo: "배경 원근 선화·톤 분리 후보정", blendMode: "normal", opacity: 1, enabled: state.enabledPasses["10_BG_3D_LT"], fileName: "10_BG_3D_LT.png", svgFragment: bgFragment },
    { passCode: "20_CHAR_LINEART", order: 2, labelKo: "캐릭터 단일 잉크 선화", cspRoleKo: "배경과 동일 픽셀 굵기 · 색선화용", blendMode: "normal", opacity: 1, enabled: state.enabledPasses["20_CHAR_LINEART"], fileName: "20_CHAR_LINEART.png", svgFragment: charLineFragment },
    { passCode: "30_CHAR_FLAT", order: 3, labelKo: "캐릭터 셀 밑색·명암", cspRoleKo: "마법봉 선택·3·4단 채색 마스크용", blendMode: "normal", opacity: 1, enabled: state.enabledPasses["30_CHAR_FLAT"], fileName: "30_CHAR_FLAT.png", svgFragment: charFlatFragment },
    { passCode: "40_CONTACT_SHADOW", order: 4, labelKo: "발밑 접지 그림자·AO", cspRoleKo: "Multiply 블렌드 · 발 접지 농도 조절", blendMode: "multiply", opacity: roundStage3(timeProfile.contactShadowOpacity), enabled: state.enabledPasses["40_CONTACT_SHADOW"], fileName: "40_CONTACT_SHADOW.png", svgFragment: shadowFragment },
    { passCode: "50_RIM_ATMOSPHERE", order: 5, labelKo: "색온도 림라이트·공기감", cspRoleKo: "Screen 블렌드 · 배경 역광 통합", blendMode: "screen", opacity: harmony.rimIntensity, enabled: state.enabledPasses["50_RIM_ATMOSPHERE"], fileName: "50_RIM_ATMOSPHERE.png", svgFragment: rimFragment },
  ]);

  const byCode = new Map(layers.map((layer) => [layer.passCode, layer]));
  const drawOrder: readonly CompositeBakePassCode[] = ["10_BG_3D_LT", "40_CONTACT_SHADOW", "30_CHAR_FLAT", "20_CHAR_LINEART", "50_RIM_ATMOSPHERE"];
  const bodySvg = drawOrder.map((code) => (byCode.get(code)?.enabled ? byCode.get(code)?.svgFragment ?? "" : "")).join("");
  const enabledLayers = layers.filter((layer) => layer.enabled);
  const maxGroundingErrorMeters = state.characters.reduce((maxE, c) => Math.max(maxE, c.groundingErrorMeters), 0);
  const ltSixPassBundle = buildStageLtSixPassBundle({
    background: bg,
    characters: state.characters.map((c) => ({ id: c.id, labelKo: c.displayNameKo, positionZ: c.positionM[2] })),
    crowdExtras: crowdExtras.map((e) => ({ id: e.id, labelKo: e.labelKo, positionZ: e.positionM[2] })),
    viewportPx: harmony.viewportPx,
    presetId: state.ltDepthPreset,
    alphaCutoutThreshold: state.alphaCutoutThreshold,
  });

  return {
    backgroundId: state.backgroundId,
    framingId: state.framingId,
    aspectRatio: state.aspectRatio,
    viewportPx: harmony.viewportPx,
    layers,
    enabledCount: enabledLayers.length,
    compositeSvgMarkup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 220" width="360" height="220">${bodySvg}</svg>`,
    pngManifest: {
      nonDestructive: true, colorSpace: "srgb", widthPx: harmony.viewportPx[0], heightPx: harmony.viewportPx[1],
      inkPx: harmony.inkContract.inkPx, groundingVerified: maxGroundingErrorMeters === 0,
      maxGroundingErrorMeters, passFiles: enabledLayers.map((l) => l.fileName),
    },
    ltSixPassBundle,
  };
}

// ── 4. 스테이지 상태 초기화 · 전환 · AI 원클릭 맞추기 ────────────────────────

export function applyCompositeFramingPreset(
  current: StageCompositeState,
  framingId: WebtoonCompositeFramingId,
): StageCompositeState {
  const bg = getStageBackgroundSlot(current.backgroundId);
  const framing = getWebtoonCompositeFramingPreset(framingId);
  const placed = framing.defaultPlacements.map((p, idx) => {
    const existing = current.characters[idx];
    return createStageCharacterSlot(existing?.id ?? `stage-char-${idx + 1}`, existing?.archetypeId ?? p.archetypeId, bg, {
      displayNameKo: existing?.displayNameKo, sourceKind: existing?.sourceKind, vrmUrl: existing?.vrmUrl,
      positionXZ: p.positionXZ, facingYawRad: p.facingYawRad, stance: p.stance,
      footSoleLocalY: existing?.footSoleLocalY ?? 0, manualGroundOffsetM: current.manualGroundOffsetM,
    });
  });
  const resolved = resolveCharacterSlotCollisions(placed, bg, current.manualGroundOffsetM);
  return { ...current, framingId: framing.id, aspectRatio: framing.recommendedAspectRatio, characters: resolved.characters, lastCollisionCount: resolved.resolvedPairCount };
}

export function createInitialStageCompositeState(
  backgroundId: StageBackgroundSlotId = "rofan-imperial-arch-chandelier",
): StageCompositeState {
  const bg = getStageBackgroundSlot(backgroundId);
  const base: StageCompositeState = {
    backgroundId: bg.id, characters: [], framingId: bg.recommendedFramingId,
    timeOfDay: bg.recommendedTimeOfDay, celPresetId: bg.recommendedCelPresetId,
    aspectRatio: "9:16", inkPx: KWEBTOON_CEL_PRESETS[bg.recommendedCelPresetId].inkPx,
    manualGroundOffsetM: 0, crowdDensity: "sparse",
    enabledPasses: { ...DEFAULT_ENABLED_BAKE_PASSES }, lastCollisionCount: 0,
  };
  return applyCompositeFramingPreset(base, bg.recommendedFramingId);
}

function resnapAndResolve(
  state: StageCompositeState,
  bg: StageBackgroundSlot,
  characters: readonly StageCharacterSlot[],
  manualGroundOffsetM: number,
): StageCompositeState {
  const resnapped = characters.map((char) =>
    createStageCharacterSlot(char.id, char.archetypeId, bg, {
      displayNameKo: char.displayNameKo, sourceKind: char.sourceKind, vrmUrl: char.vrmUrl,
      positionXZ: [char.positionM[0], char.positionM[2]], facingYawRad: char.facingYawRad,
      stance: char.stance, footSoleLocalY: char.footSoleLocalY, manualGroundOffsetM,
    }),
  );
  const resolved = resolveCharacterSlotCollisions(resnapped, bg, manualGroundOffsetM);
  return { ...state, backgroundId: bg.id, manualGroundOffsetM, characters: resolved.characters, lastCollisionCount: resolved.resolvedPairCount };
}

export function switchStageBackground(current: StageCompositeState, nextBackgroundId: StageBackgroundSlotId): StageCompositeState {
  return resnapAndResolve(current, getStageBackgroundSlot(nextBackgroundId), current.characters, current.manualGroundOffsetM);
}

export function setStageManualGroundOffset(current: StageCompositeState, offsetM: number): StageCompositeState {
  const safeOffset = roundStage3(clampStageNumber(offsetM, -0.3, 0.5));
  return resnapAndResolve(current, getStageBackgroundSlot(current.backgroundId), current.characters, safeOffset);
}

export function updateStageCharacterSlot(
  current: StageCompositeState,
  characterId: string,
  patch: {
    readonly archetypeId?: KWebtoonArchetypeBridgeId;
    readonly sourceKind?: StageCharacterSourceKind;
    readonly positionXZ?: readonly [number, number];
  },
): StageCompositeState {
  const bg = getStageBackgroundSlot(current.backgroundId);
  const updated = current.characters.map((char) => {
    if (char.id !== characterId) return char;
    const nextArchetype = patch.archetypeId ?? char.archetypeId;
    const changedArchetype = patch.archetypeId !== undefined && patch.archetypeId !== char.archetypeId;
    return createStageCharacterSlot(char.id, nextArchetype, bg, {
      displayNameKo: changedArchetype ? undefined : char.displayNameKo,
      sourceKind: patch.sourceKind ?? char.sourceKind,
      vrmUrl: patch.sourceKind === "vrm-avatar" ? (char.vrmUrl ?? `/vrm/stage/${nextArchetype}.vrm`) : char.vrmUrl,
      positionXZ: patch.positionXZ ?? [char.positionM[0], char.positionM[2]],
      facingYawRad: char.facingYawRad, stance: char.stance,
      footSoleLocalY: char.footSoleLocalY, manualGroundOffsetM: current.manualGroundOffsetM,
    });
  });
  const resolved = resolveCharacterSlotCollisions(updated, bg, current.manualGroundOffsetM);
  return { ...current, characters: resolved.characters, lastCollisionCount: resolved.resolvedPairCount };
}

/** "AI 추천 구도·조명 자동 맞추기" 1클릭 오케스트레이터. */
export function applySmartAutoHarmonize(current: StageCompositeState): StageCompositeState {
  const bg = getStageBackgroundSlot(current.backgroundId);
  const actorCount = current.characters.length;
  const preferredFramingId: WebtoonCompositeFramingId =
    actorCount === 1
      ? "solo-hero-establishing"
      : actorCount === 3
        ? bg.id === "rofan-imperial-banquet" ? "banquet-high-overview" : "academy-corridor-trio"
        : bg.recommendedFramingId;
  const framing = getWebtoonCompositeFramingPreset(preferredFramingId);
  const celPreset = KWEBTOON_CEL_PRESETS[bg.recommendedCelPresetId];

  const placed = current.characters.map((char, idx) => {
    const template = framing.defaultPlacements[idx] ?? {
      positionXZ: [roundStage3((idx - 1) * 1.05), roundStage3(-0.35 * idx)] as readonly [number, number],
      facingYawRad: idx % 2 === 0 ? 0.35 : -0.35,
      stance: "standing" as const,
    };
    return createStageCharacterSlot(char.id, char.archetypeId, bg, {
      displayNameKo: char.displayNameKo, sourceKind: char.sourceKind, vrmUrl: char.vrmUrl,
      positionXZ: template.positionXZ, facingYawRad: template.facingYawRad, stance: template.stance,
      footSoleLocalY: char.footSoleLocalY, manualGroundOffsetM: 0,
    });
  });
  const resolved = resolveCharacterSlotCollisions(placed, bg, 0);
  return {
    ...current, framingId: framing.id, timeOfDay: bg.recommendedTimeOfDay,
    celPresetId: bg.recommendedCelPresetId, aspectRatio: framing.recommendedAspectRatio,
    inkPx: celPreset.inkPx, manualGroundOffsetM: 0,
    characters: resolved.characters, lastCollisionCount: resolved.resolvedPairCount,
  };
}

export function addStageCharacter(
  current: StageCompositeState,
  archetypeId: KWebtoonArchetypeBridgeId = "kwebtoon-academy-heroine",
): StageCompositeState {
  if (current.characters.length >= MAX_STAGE_CHARACTERS) return current;
  const bg = getStageBackgroundSlot(current.backgroundId);
  const nextIndex = current.characters.length + 1;
  const spawnX = nextIndex === 2 ? 0.85 : -1.05;
  const spawnZ = nextIndex === 2 ? 0.2 : -0.65;
  const newChar = createStageCharacterSlot(`stage-char-${nextIndex}`, archetypeId, bg, {
    positionXZ: [spawnX, spawnZ], facingYawRad: spawnX > 0 ? -0.45 : 0.45,
    manualGroundOffsetM: current.manualGroundOffsetM,
  });
  const resolved = resolveCharacterSlotCollisions([...current.characters, newChar], bg, current.manualGroundOffsetM);
  return { ...current, characters: resolved.characters, lastCollisionCount: resolved.resolvedPairCount };
}

export function removeStageCharacter(current: StageCompositeState, characterId: string): StageCompositeState {
  if (current.characters.length <= MIN_STAGE_CHARACTERS) return current;
  const remaining = current.characters.filter((c) => c.id !== characterId);
  if (remaining.length < MIN_STAGE_CHARACTERS) return current;
  return { ...current, characters: remaining, lastCollisionCount: 0 };
}
