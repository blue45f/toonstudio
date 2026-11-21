/**
 * VRoid Studio 클린룸 전 기능 통합 엔진.
 *
 * 기존 `studio-vrm-custom-part-*`(용접 법선 · MToon 본체 프로파일 동기화 · 역면 외곽선 · GPU 폐기)와
 * `studio-vrm-proportion-core`(관절 이동 기반 전단 0% 등신대) 위에 VRoid Studio 6대 제작 파이프라인을
 * 실제 3D BufferGeometry · 절차적 DataTexture · VRM 1.0 매니페스트로 통합 제공한다.
 */
import type * as THREE from "three";

import { createStudioVrmExpressionApplyPlan } from "./studio-vrm-expression-apply";
import {
  NEUTRAL_STUDIO_VRM_PROPORTIONS,
  STUDIO_VRM_REFERENCE_BONE_SNAPSHOT,
  resolveStudioVrmProportionMetrics,
  resolveVrmProportionBoneTargets,
  resolveVrmProportionPlan,
  sanitizeStudioVrmProportions,
  solveStudioVrmHeadBodyRatioForHeadUnits,
  validateStudioVrmProportionPlan,
  type StudioVrmProportionBoneTarget,
  type StudioVrmProportionMetrics,
  type StudioVrmProportionPlanIssue,
  type StudioVrmProportions,
} from "./studio-vrm-proportion-core";
import {
  buildVroidHairGroupMeshBundle,
  buildVroidHairStrandGroupGeometry,
  type VroidHairMeshBundle,
  type VroidHairSpringBoneSpec,
  type VroidHairStrandGroupOptions,
  type VroidHairStrandGroupResult,
} from "./studio-vroid-atelier-hair";
import {
  synthesizeVroidOutfitTextureSpec,
  type VroidOutfitLayerConfig,
  type VroidOutfitTextureSynthesisInput,
  type VroidOutfitTextureSynthesisResult,
} from "./studio-vroid-atelier-outfit";
import {
  VROID_ARKIT_LIPSYNC_MAP,
  VROID_BODY_PROPORTION_PRESETS,
  VROID_EYE_HIGHLIGHT_STYLES,
  VROID_FACE_CATEGORY_LABELS,
  VROID_FACE_PARAMETER_SPECS,
  VROID_HAIR_GROUP_SPECS,
  VROID_HAIR_PALETTE_PRESETS,
  VROID_LOOKAT_PRESETS,
  VROID_OUTFIT_LAYER_SPECS,
  VROID_OUTFIT_PALETTE_PRESETS,
  VROID_OUTFIT_PATTERN_SPECS,
  VROID_VRM1_EXPRESSION_PRESETS,
  formatOklchCss,
  oklchToHexColorString,
  oklchToRgbaBytes,
  oklchToSrgb,
  type VroidArkitVisemeName,
  type VroidBodyProportionPreset,
  type VroidBodyProportionPresetId,
  type VroidEyeHighlightStyleId,
  type VroidEyeHighlightStyleSpec,
  type VroidFaceCategory,
  type VroidFaceParameterId,
  type VroidFaceParameterSpec,
  type VroidHairGroupKind,
  type VroidHairGroupMeta,
  type VroidHairPalettePreset,
  type VroidLookAtPreset,
  type VroidLookAtPresetId,
  type VroidOklchColor,
  type VroidOklchPalette3,
  type VroidOutfitLayerKind,
  type VroidOutfitPalettePreset,
  type VroidOutfitPatternKind,
  type VroidVrm1ExpressionName,
  type VroidVrm1ExpressionSpec,
} from "./studio-vroid-atelier-presets";

import type { StudioHumanoidBoneName } from "../studio-humanoid-bones";
import type { AvatarForgeFaceParams, AvatarForgeSemanticFaceMorphState } from "./studio-vrm-avatar-forge";
import type { StudioVrmBodyMtoonProfile } from "./studio-vrm-custom-part-material";

export {
  VROID_ARKIT_LIPSYNC_MAP,
  VROID_BODY_PROPORTION_PRESETS,
  VROID_EYE_HIGHLIGHT_STYLES,
  VROID_FACE_CATEGORY_LABELS,
  VROID_FACE_PARAMETER_SPECS,
  VROID_HAIR_GROUP_SPECS,
  VROID_HAIR_PALETTE_PRESETS,
  VROID_LOOKAT_PRESETS,
  VROID_OUTFIT_LAYER_SPECS,
  VROID_OUTFIT_PALETTE_PRESETS,
  VROID_OUTFIT_PATTERN_SPECS,
  VROID_VRM1_EXPRESSION_PRESETS,
  buildVroidHairGroupMeshBundle,
  buildVroidHairStrandGroupGeometry,
  formatOklchCss,
  oklchToHexColorString,
  oklchToRgbaBytes,
  oklchToSrgb,
  synthesizeVroidOutfitTextureSpec,
  type VroidArkitVisemeName,
  type VroidBodyProportionPreset,
  type VroidBodyProportionPresetId,
  type VroidEyeHighlightStyleId,
  type VroidEyeHighlightStyleSpec,
  type VroidFaceCategory,
  type VroidFaceParameterId,
  type VroidFaceParameterSpec,
  type VroidHairGroupKind,
  type VroidHairGroupMeta,
  type VroidHairMeshBundle,
  type VroidHairPalettePreset,
  type VroidHairSpringBoneSpec,
  type VroidHairStrandGroupOptions,
  type VroidHairStrandGroupResult,
  type VroidLookAtPreset,
  type VroidLookAtPresetId,
  type VroidOklchColor,
  type VroidOklchPalette3,
  type VroidOutfitLayerConfig,
  type VroidOutfitLayerKind,
  type VroidOutfitPalettePreset,
  type VroidOutfitPatternKind,
  type VroidOutfitTextureSynthesisInput,
  type VroidOutfitTextureSynthesisResult,
  type VroidVrm1ExpressionName,
  type VroidVrm1ExpressionSpec,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round4(value: number): number {
  const rounded = Math.round(value * 10_000) / 10_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/* -------------------------------------------------------------------------- */
/* 2. 얼굴 정밀 파라미터 36종 (`applyVroidFaceMorphTargets`)                     */
/* -------------------------------------------------------------------------- */

export type VroidFaceParameterMap = Readonly<Record<VroidFaceParameterId, number>>;

export interface VroidFaceMaterialTextureParams {
  readonly highlightStyle: VroidEyeHighlightStyleSpec;
  readonly highlightIntensity: number;
  readonly irisHeightScale: number;
  readonly blushIntensity: number;
  readonly eyelinerThickness: number;
  readonly eyelinerWingAngle: number;
  readonly noseShadowIntensity: number;
}

export interface VroidFaceMorphApplyResult {
  readonly values: VroidFaceParameterMap;
  readonly blendShapeWeights: Readonly<Record<string, number>>;
  readonly semanticMorphs: AvatarForgeSemanticFaceMorphState;
  readonly forgeFacePatch: Partial<AvatarForgeFaceParams>;
  readonly materialTextureParams: VroidFaceMaterialTextureParams;
  readonly appliedMorphCount: number;
  readonly updatedMaterialCount: number;
}

export function createDefaultVroidFaceParameters(): VroidFaceParameterMap {
  const map: Record<string, number> = {};
  for (const spec of VROID_FACE_PARAMETER_SPECS) {
    map[spec.id] = spec.defaultValue;
  }
  return Object.freeze(map) as VroidFaceParameterMap;
}

interface MorphTargetMeshLike {
  readonly isMesh?: boolean;
  readonly name?: string;
  readonly morphTargetDictionary?: Record<string, number>;
  readonly morphTargetInfluences?: number[];
  readonly material?: THREE.Material | THREE.Material[];
}

const FACE_OR_EYE_MATERIAL_PATTERN = /(?:face|skin|head|eye|iris|pupil|brow|lash|mouth|얼굴|눈)/iu;

/**
 * 36종 얼굴 정밀 파라미터를 BlendShape 가중치 · 시맨틱 모프 · 아바타 포지 패치 ·
 * 홍조/아이라인/동공 하이라이트 텍스처 파라미터로 변환하고, 대상 VRM이 있으면 즉시 반영한다.
 */
export function applyVroidFaceMorphTargets(
  rawValues: Partial<Record<VroidFaceParameterId, number>>,
  targetVrm?: { readonly scene?: THREE.Object3D | null } | null,
): VroidFaceMorphApplyResult {
  const sanitized: Record<string, number> = {};
  const blendShapeWeights: Record<string, number> = {};
  const semanticMorphs: Record<string, number> = {};

  for (const spec of VROID_FACE_PARAMETER_SPECS) {
    const raw = rawValues[spec.id];
    const value = typeof raw === "number" && Number.isFinite(raw)
      ? round4(clamp(raw, spec.min, spec.max))
      : spec.defaultValue;
    sanitized[spec.id] = spec.id === "pupilHighlightStyle" ? Math.round(value) : value;

    if (spec.blendShapePositive && value > 0) {
      blendShapeWeights[spec.blendShapePositive] = round4(clamp(value, 0, 1));
    } else if (spec.blendShapeNegative && value < 0) {
      blendShapeWeights[spec.blendShapeNegative] = round4(clamp(-value, 0, 1));
    }

    if (spec.semanticMorphId && Math.abs(value) > 1e-4) {
      semanticMorphs[spec.semanticMorphId] = value;
    }
  }

  const values = Object.freeze(sanitized) as VroidFaceParameterMap;
  const highlightStyle =
    VROID_EYE_HIGHLIGHT_STYLES[clamp(Math.round(values.pupilHighlightStyle), 0, VROID_EYE_HIGHLIGHT_STYLES.length - 1)]
    ?? VROID_EYE_HIGHLIGHT_STYLES[0]!;

  const materialTextureParams: VroidFaceMaterialTextureParams = Object.freeze({
    highlightStyle,
    highlightIntensity: values.pupilHighlightIntensity,
    irisHeightScale: round4(1 + values.irisHeight * 0.25),
    blushIntensity: values.blushIntensity,
    eyelinerThickness: values.eyelinerThickness,
    eyelinerWingAngle: values.eyelinerWingAngle,
    noseShadowIntensity: values.noseShadowIntensity,
  });

  const forgeFacePatch: Partial<AvatarForgeFaceParams> = Object.freeze({
    headWidth: round4(clamp(1 + values.chinWidth * 0.1 - values.jawlineSharpness * 0.06, 0.82, 1.2)),
    cheekVolume: round4(clamp(0.35 + values.cheekVolume * 0.45, 0, 1)),
    chinLength: round4(clamp(1 + values.chinLength * 0.14, 0.8, 1.24)),
  });

  let appliedMorphCount = 0;
  let updatedMaterialCount = 0;

  if (targetVrm?.scene?.traverse) {
    targetVrm.scene.traverse((node) => {
      const mesh = node as unknown as MorphTargetMeshLike;
      if (!mesh.isMesh) return;

      if (mesh.morphTargetDictionary && Array.isArray(mesh.morphTargetInfluences)) {
        for (const [morphName, weight] of Object.entries(blendShapeWeights)) {
          const index = mesh.morphTargetDictionary[morphName];
          if (typeof index === "number" && index >= 0 && index < mesh.morphTargetInfluences.length) {
            mesh.morphTargetInfluences[index] = weight;
            appliedMorphCount += 1;
          }
        }
      }

      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const meshMatch = FACE_OR_EYE_MATERIAL_PATTERN.test(mesh.name ?? "");
        for (const mat of mats) {
          if (!mat) continue;
          if (!meshMatch && !FACE_OR_EYE_MATERIAL_PATTERN.test(mat.name ?? "")) continue;
          mat.userData.vroidFaceTextureParams = materialTextureParams;
          mat.needsUpdate = true;
          updatedMaterialCount += 1;
        }
      }
    });
  }

  return Object.freeze({
    values,
    blendShapeWeights: Object.freeze(blendShapeWeights),
    semanticMorphs: Object.freeze(semanticMorphs) as AvatarForgeSemanticFaceMorphState,
    forgeFacePatch,
    materialTextureParams,
    appliedMorphCount,
    updatedMaterialCount,
  });
}

/* -------------------------------------------------------------------------- */
/* 3. 바디 프로포션 & 등신대 + 2인 신장차 계산기                                 */
/* -------------------------------------------------------------------------- */

export interface VroidBodyProportionResolved {
  readonly preset: VroidBodyProportionPreset;
  readonly proportions: StudioVrmProportions;
  readonly boneTargets: readonly StudioVrmProportionBoneTarget[];
  readonly boneScaleMap: Readonly<Partial<Record<StudioHumanoidBoneName, number>>>;
  readonly metrics: StudioVrmProportionMetrics;
  readonly heightCm: number;
  readonly validationIssues: readonly StudioVrmProportionPlanIssue[];
}

/**
 * 4종 등신대 프리셋(SD 3.5 · 학원 6.5 · 로판 7.5 · 액션 8.5)으로부터
 * 전단 0% 보장 휴머노이드 본 스케일·이동 맵과 실측 지표를 생성한다.
 */
export function buildVroidBodyProportionPlan(
  presetId: VroidBodyProportionPresetId,
  customHeightCm?: number,
): VroidBodyProportionResolved {
  const preset = VROID_BODY_PROPORTION_PRESETS.find((item) => item.id === presetId) ?? VROID_BODY_PROPORTION_PRESETS[1]!;
  const heightRatio = typeof customHeightCm === "number" && Number.isFinite(customHeightCm)
    ? clamp(customHeightCm / preset.defaultHeightCm, 0.72, 1.32)
    : 1;
  const baseProportions = sanitizeStudioVrmProportions({
    ...NEUTRAL_STUDIO_VRM_PROPORTIONS,
    presetId: preset.id,
    overallHeight: preset.overallHeight * heightRatio,
    armLength: preset.armLength,
    legLength: preset.legLength,
    torsoLength: preset.torsoLength,
    shoulderWidth: preset.shoulderWidth,
    handScale: preset.handScale,
    footScale: preset.footScale,
    neckLength: preset.neckLength,
  });

  const headBodyRatio = solveStudioVrmHeadBodyRatioForHeadUnits(
    preset.targetHeadUnits,
    baseProportions,
    STUDIO_VRM_REFERENCE_BONE_SNAPSHOT,
  );
  const proportions = sanitizeStudioVrmProportions({
    ...baseProportions,
    headBodyRatio,
  });

  const plan = resolveVrmProportionPlan(proportions, STUDIO_VRM_REFERENCE_BONE_SNAPSHOT);
  const validationIssues = validateStudioVrmProportionPlan(plan, STUDIO_VRM_REFERENCE_BONE_SNAPSHOT);
  const boneTargets = resolveVrmProportionBoneTargets(proportions, STUDIO_VRM_REFERENCE_BONE_SNAPSHOT);
  const metrics = resolveStudioVrmProportionMetrics(proportions, STUDIO_VRM_REFERENCE_BONE_SNAPSHOT);

  const boneScaleMap: Partial<Record<StudioHumanoidBoneName, number>> = {};
  for (const target of boneTargets) {
    boneScaleMap[target.boneName] = round4(target.scale);
  }

  return Object.freeze({
    preset,
    proportions,
    boneTargets,
    boneScaleMap: Object.freeze(boneScaleMap),
    metrics,
    heightCm: Math.round(metrics.totalHeight * 100),
    validationIssues,
  });
}

export interface VroidDuoHeightComparison {
  readonly actorAHeightCm: number;
  readonly actorBHeightCm: number;
  readonly heightDiffCm: number;
  readonly tallerActor: "A" | "B" | "equal";
  readonly eyeLevelDeltaMeters: number;
  readonly shoulderLevelDeltaMeters: number;
  readonly actorAGazePitchDeg: number;
  readonly actorBGazePitchDeg: number;
  readonly summaryKo: string;
}

/**
 * 2인 신장차 계산기: 두 캐릭터의 신장(cm)과 거리(m)에서 눈높이 차, 어깨 차, 상호 시선 피치각을 계산한다.
 */
export function computeVroidDuoHeightDifference(input: {
  readonly actorAHeightCm: number;
  readonly actorBHeightCm: number;
  readonly spacingMeters?: number;
}): VroidDuoHeightComparison {
  const heightA = clamp(input.actorAHeightCm, 80, 230);
  const heightB = clamp(input.actorBHeightCm, 80, 230);
  const spacing = clamp(input.spacingMeters ?? 0.72, 0.3, 4.0);
  const diffCm = Math.round(heightA - heightB);
  const eyeDeltaM = round4(((heightA - heightB) * 0.93) / 100);
  const shoulderDeltaM = round4(((heightA - heightB) * 0.818) / 100);
  const pitchRad = Math.atan2(eyeDeltaM, spacing);
  const actorAGazePitchDeg = round4(clamp((-pitchRad * 180) / Math.PI, -42, 42));
  const actorBGazePitchDeg = round4(clamp((pitchRad * 180) / Math.PI, -42, 42));
  const tallerActor: "A" | "B" | "equal" = diffCm > 0 ? "A" : diffCm < 0 ? "B" : "equal";

  const summaryKo = tallerActor === "equal"
    ? `동일 신장 (${Math.round(heightA)}cm) · 수평 눈맞춤`
    : `신장차 ${Math.abs(diffCm)}cm (${tallerActor === "A" ? "A가 더 큼" : "B가 더 큼"}) · 시선각 A ${actorAGazePitchDeg > 0 ? "+" : ""}${actorAGazePitchDeg.toFixed(1)}° / B ${actorBGazePitchDeg > 0 ? "+" : ""}${actorBGazePitchDeg.toFixed(1)}°`;

  return Object.freeze({
    actorAHeightCm: Math.round(heightA),
    actorBHeightCm: Math.round(heightB),
    heightDiffCm: diffCm,
    tallerActor,
    eyeLevelDeltaMeters: eyeDeltaM,
    shoulderLevelDeltaMeters: shoulderDeltaM,
    actorAGazePitchDeg,
    actorBGazePitchDeg,
    summaryKo,
  });
}

/* -------------------------------------------------------------------------- */
/* 5. VRM 1.0 표정 18종 + ARKit 립싱크 + LookAt 시선 추적 프리셋                 */
/* -------------------------------------------------------------------------- */

export interface VroidExpressionAndLookAtInput {
  readonly emotionWeights?: Partial<Record<VroidVrm1ExpressionName, number>>;
  readonly activeViseme?: VroidArkitVisemeName | null;
  readonly visemeIntensity?: number;
  readonly lookAtPresetId?: VroidLookAtPresetId;
  readonly customLookAt?: { readonly yawDeg: number; readonly pitchDeg: number };
}

export interface VroidExpressionAndLookAtResult {
  readonly vrm1Weights: Readonly<Record<VroidVrm1ExpressionName, number>>;
  readonly arkitLipSyncWeights: Readonly<Record<string, number>>;
  readonly lookAt: {
    readonly presetId: VroidLookAtPresetId;
    readonly yawDeg: number;
    readonly pitchDeg: number;
  };
  readonly appliedExpressionCount: number;
}

const VRM1_EXPRESSION_NAMES: readonly VroidVrm1ExpressionName[] = Object.freeze(
  VROID_VRM1_EXPRESSION_PRESETS.map((spec) => spec.name),
);

/**
 * VRM 1.0 표준 18종 표정 가중치, ARKit 립싱크(`aa`/`ih`/`ou`/`ee`/`oh`),
 * LookAt 시선 추적 각도를 통합 계산한다.
 */
export function resolveVroidExpressionAndLookAtState(
  input: VroidExpressionAndLookAtInput,
): VroidExpressionAndLookAtResult {
  const incoming: Record<string, number> = {};
  for (const name of VRM1_EXPRESSION_NAMES) {
    incoming[name] = 0;
  }

  if (input.emotionWeights) {
    for (const [name, value] of Object.entries(input.emotionWeights)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        incoming[name] = clamp(value, 0, 1);
      }
    }
  }

  const visemeIntensity = clamp(input.visemeIntensity ?? 0.85, 0, 1);
  const arkitLipSyncWeights: Record<string, number> = {};
  if (input.activeViseme && VROID_ARKIT_LIPSYNC_MAP[input.activeViseme]) {
    incoming[input.activeViseme] = visemeIntensity;
    for (const [arkitKey, weight] of Object.entries(VROID_ARKIT_LIPSYNC_MAP[input.activeViseme])) {
      arkitLipSyncWeights[arkitKey] = round4(weight * visemeIntensity);
    }
  }

  const preset = VROID_LOOKAT_PRESETS.find((item) => item.id === input.lookAtPresetId) ?? VROID_LOOKAT_PRESETS[0]!;
  const yawDeg = round4(clamp(input.customLookAt?.yawDeg ?? preset.yawDeg, -35, 35));
  const pitchDeg = round4(clamp(input.customLookAt?.pitchDeg ?? preset.pitchDeg, -25, 25));

  if (yawDeg < -1) incoming.lookLeft = round4(clamp(-yawDeg / 30, 0, 1));
  if (yawDeg > 1) incoming.lookRight = round4(clamp(yawDeg / 30, 0, 1));
  if (pitchDeg > 1) incoming.lookUp = round4(clamp(pitchDeg / 22, 0, 1));
  if (pitchDeg < -1) incoming.lookDown = round4(clamp(-pitchDeg / 22, 0, 1));

  const plan = createStudioVrmExpressionApplyPlan({
    current: {},
    incoming,
    availableNames: VRM1_EXPRESSION_NAMES,
    blend: 1,
  });

  const vrm1Weights: Record<string, number> = {};
  for (const name of VRM1_EXPRESSION_NAMES) {
    vrm1Weights[name] = round4(plan.weights[name] ?? 0);
  }

  return Object.freeze({
    vrm1Weights: Object.freeze(vrm1Weights) as Readonly<Record<VroidVrm1ExpressionName, number>>,
    arkitLipSyncWeights: Object.freeze(arkitLipSyncWeights),
    lookAt: Object.freeze({
      presetId: preset.id,
      yawDeg,
      pitchDeg,
    }),
    appliedExpressionCount: plan.applied.length,
  });
}

/* -------------------------------------------------------------------------- */
/* 6. VRM 1.0 표준 매니페스트 & 3D 배경 합성 스테이지 전송 페이로드               */
/* -------------------------------------------------------------------------- */

export interface VroidToBg3dHandoffInput {
  readonly characterId: string;
  readonly characterName: string;
  readonly author?: string;
  readonly licenseUrl?: string;
  readonly bodyPlan: VroidBodyProportionResolved;
  readonly hairSpringBones: readonly VroidHairSpringBoneSpec[];
  readonly faceResult: VroidFaceMorphApplyResult;
  readonly expressionState: VroidExpressionAndLookAtResult;
  readonly outfitLayers: readonly VroidOutfitLayerKind[];
  readonly mtoonProfile: StudioVrmBodyMtoonProfile;
  readonly stagePosition?: readonly [number, number, number];
  readonly stageYawDeg?: number;
}

export interface VroidToBg3dHandoffPayload {
  readonly schemaVersion: "vroid-bg3d-handoff/1.0";
  readonly targetDomain: "bg3d";
  readonly generatedAtIso: string;
  readonly vrm1Manifest: {
    readonly specVersion: "1.0";
    readonly meta: {
      readonly name: string;
      readonly version: string;
      readonly authors: readonly string[];
      readonly licenseUrl: string;
      readonly commercialUsage: "personalNonProfit" | "personalProfit" | "corporation";
    };
    readonly humanoid: {
      readonly boneCount: number;
      readonly headUnits: number;
      readonly totalHeightMeters: number;
      readonly uniformScaleBones: readonly string[];
    };
    readonly expressions: {
      readonly presetCount: number;
      readonly activeWeights: Readonly<Record<string, number>>;
      readonly arkitLipSync: Readonly<Record<string, number>>;
    };
    readonly lookAt: {
      readonly type: "bone";
      readonly yawDeg: number;
      readonly pitchDeg: number;
      readonly rangeMapHorizontalInnerDeg: number;
      readonly rangeMapHorizontalOuterDeg: number;
      readonly rangeMapVerticalUpDeg: number;
      readonly rangeMapVerticalDownDeg: number;
    };
    readonly springBone: {
      readonly groups: readonly VroidHairSpringBoneSpec[];
      readonly totalJointChains: number;
    };
    readonly mtoon: {
      readonly shadingToonyFactor: number;
      readonly shadingShiftFactor: number;
      readonly outlineWidthMode: StudioVrmBodyMtoonProfile["outlineWidthMode"];
      readonly outlineWidthFactor: number;
    };
  };
  readonly bg3dStagePlacement: {
    readonly characterId: string;
    readonly floorGroundedY: 0;
    readonly worldPosition: readonly [number, number, number];
    readonly yawDeg: number;
    readonly boundingBoxMeters: readonly [number, number, number];
    readonly outfitLayers: readonly VroidOutfitLayerKind[];
    readonly eyeHighlightStyleId: VroidEyeHighlightStyleId;
  };
}

/**
 * VRoid 1.0 표준 매니페스트와 3D 배경 합성 스테이지(BG3D) 전송 페이로드를 생성한다.
 * 바닥 접지(`floorGroundedY = 0`), 미터 단위 바운딩, MToon 동기화 프로파일, SpringBone 체인을 포함한다.
 */
export function buildVroidToBg3dHandoffPayload(
  input: VroidToBg3dHandoffInput,
): VroidToBg3dHandoffPayload {
  const heightM = round4(clamp(input.bodyPlan.metrics.totalHeight, 0.5, 2.5));
  const shoulderW = round4(Math.max(0.28, input.bodyPlan.metrics.shoulderSpan * 1.45));
  const depthM = round4(Math.max(0.24, shoulderW * 0.62));
  const pos = input.stagePosition ?? [0, 0, 0];

  const activeWeights: Record<string, number> = {};
  for (const [key, val] of Object.entries(input.expressionState.vrm1Weights)) {
    if (val > 0) activeWeights[key] = val;
  }

  const uniformScaleBones = Object.entries(input.bodyPlan.boneScaleMap)
    .filter(([, scale]) => typeof scale === "number" && Math.abs(scale - 1) > 1e-4)
    .map(([bone]) => bone);

  const totalJointChains = input.hairSpringBones.reduce((sum, item) => sum + item.jointChainCount, 0);

  return Object.freeze({
    schemaVersion: "vroid-bg3d-handoff/1.0",
    targetDomain: "bg3d",
    generatedAtIso: new Date().toISOString(),
    vrm1Manifest: Object.freeze({
      specVersion: "1.0",
      meta: Object.freeze({
        name: input.characterName.trim() || "ToonStudio VRoid Character",
        version: "1.0.0",
        authors: Object.freeze([input.author?.trim() || "ToonStudio Creator"]),
        licenseUrl: input.licenseUrl?.trim() || "https://vrm.dev/licenses/1.0/",
        commercialUsage: "corporation",
      }),
      humanoid: Object.freeze({
        boneCount: input.bodyPlan.boneTargets.length,
        headUnits: round4(input.bodyPlan.metrics.headUnits),
        totalHeightMeters: heightM,
        uniformScaleBones: Object.freeze(uniformScaleBones),
      }),
      expressions: Object.freeze({
        presetCount: VROID_VRM1_EXPRESSION_PRESETS.length,
        activeWeights: Object.freeze(activeWeights),
        arkitLipSync: input.expressionState.arkitLipSyncWeights,
      }),
      lookAt: Object.freeze({
        type: "bone",
        yawDeg: input.expressionState.lookAt.yawDeg,
        pitchDeg: input.expressionState.lookAt.pitchDeg,
        rangeMapHorizontalInnerDeg: 30,
        rangeMapHorizontalOuterDeg: 35,
        rangeMapVerticalUpDeg: 22,
        rangeMapVerticalDownDeg: 25,
      }),
      springBone: Object.freeze({
        groups: Object.freeze([...input.hairSpringBones]),
        totalJointChains,
      }),
      mtoon: Object.freeze({
        shadingToonyFactor: input.mtoonProfile.shadingToonyFactor,
        shadingShiftFactor: input.mtoonProfile.shadingShiftFactor,
        outlineWidthMode: input.mtoonProfile.outlineWidthMode,
        outlineWidthFactor: input.mtoonProfile.outlineWidthFactor,
      }),
    }),
    bg3dStagePlacement: Object.freeze({
      characterId: input.characterId.trim() || "vroid-char-1",
      floorGroundedY: 0,
      worldPosition: Object.freeze([round4(pos[0]), 0, round4(pos[2])] as const),
      yawDeg: round4(input.stageYawDeg ?? 0),
      boundingBoxMeters: Object.freeze([shoulderW, heightM, depthM] as const),
      outfitLayers: Object.freeze([...input.outfitLayers]),
      eyeHighlightStyleId: input.faceResult.materialTextureParams.highlightStyle.id,
    }),
  });
}
