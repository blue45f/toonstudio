/**
 * 원본 VRM 재질 DNA 추출·자동 이식·Three.js/VRM 런타임 호환 구조적 타입 계약.
 */

import type { OklchColor, Rgb01, VrmTextureBuffer } from "./color-science-oklch";
import type { Vec3 } from "./depth-relighting-compositor";

export type VrmOutlineWidthMode = "none" | "worldCoordinates" | "screenCoordinates";
export type VrmMaterialSlotRole = "skin" | "hair" | "outfit" | "eye" | "accessory" | "other";
export type VrmReplacementPartKind = "hair" | "hat" | "glasses" | "outfit" | "prop";
export type RawPartShaderType = "pbr-standard" | "pbr-physical" | "basic-unlit" | "foreign-mtoon";
export type ShadowTemperatureClass = "cool" | "neutral" | "warm";
export type ShaderHarmonyGrade = "harmonized" | "acceptable" | "needs-tuning";
export type VrmDnaPresetId = "pastel-atelier" | "sunset-drama" | "cyber-noir";

export interface VrmSourceMaterialSlot {
  readonly name: string;
  readonly role: VrmMaterialSlotRole;
  readonly isMToon?: boolean;
  readonly baseColor: Rgb01;
  readonly baseTexture?: VrmTextureBuffer;
  readonly shadeColor: Rgb01;
  readonly shadingToonyFactor?: number;
  readonly shadingShiftFactor?: number;
  readonly giEqualizationFactor?: number;
  readonly outlineWidthMode?: VrmOutlineWidthMode;
  readonly outlineWidthFactor?: number;
  readonly outlineColor?: Rgb01;
  readonly outlineLightingMixFactor?: number;
  readonly rimColor?: Rgb01;
  readonly rimLightingMixFactor?: number;
  readonly rimFresnelPower?: number;
  readonly rimLift?: number;
  readonly angelRingIntensity?: number;
  readonly angelRingSharpness?: number;
  readonly matcapColor?: Rgb01;
}

export interface VrmCharacterDnaSource {
  readonly profileId: string;
  readonly sourceNameKo: string;
  readonly sourceNameEn: string;
  readonly primaryLightDirection?: Vec3;
  readonly materials: readonly VrmSourceMaterialSlot[];
}

export interface DnaColorSample {
  readonly oklch: OklchColor;
  readonly rgb: Rgb01;
  readonly sampledPixels: number;
}

export interface VrmMaterialDnaProfile {
  readonly profileId: string;
  readonly sourceNameKo: string;
  readonly sourceNameEn: string;
  readonly hasMToonSource: boolean;
  readonly sampledMaterialCount: number;
  readonly sampledTexturePixelCount: number;
  readonly dominantColors: {
    readonly skin: DnaColorSample;
    readonly hair: DnaColorSample;
    readonly outfit: DnaColorSample;
    readonly paletteEnvelope: {
      readonly meanChroma: number;
      readonly chromaCap: number;
      readonly lightnessFloor: number;
      readonly lightnessCeiling: number;
      readonly warmthBias: number;
    };
  };
  readonly shadowTint: {
    readonly tintOklch: OklchColor;
    readonly tintRgb: Rgb01;
    readonly temperatureKelvin: number;
    readonly temperatureClass: ShadowTemperatureClass;
    readonly hueShiftDeg: number;
    readonly lightnessDrop: number;
    readonly darknessFactor: number;
  };
  readonly celShading: {
    readonly shadingToonyFactor: number;
    readonly shadingShiftFactor: number;
    readonly giEqualizationFactor: number;
  };
  readonly outline: {
    readonly widthMode: VrmOutlineWidthMode;
    readonly widthFactor: number;
    readonly colorOklch: OklchColor;
    readonly colorRgb: Rgb01;
    readonly lightingMixFactor: number;
  };
  readonly rimLight: {
    readonly colorOklch: OklchColor;
    readonly colorRgb: Rgb01;
    readonly lightingMixFactor: number;
    readonly fresnelPower: number;
    readonly lift: number;
  };
  readonly angelRing: {
    readonly intensity: number;
    readonly sharpness: number;
    readonly tintOklch: OklchColor;
    readonly tintRgb: Rgb01;
    readonly enabledOnHair: boolean;
  };
  readonly primaryLightDirection: Vec3;
  readonly lightAzimuthDeg: number;
  readonly lightElevationDeg: number;
}

export interface VrmRawPartMaterialInput {
  readonly partId: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly kind: VrmReplacementPartKind;
  readonly shaderType: RawPartShaderType;
  readonly baseColor: Rgb01;
  readonly baseTexture?: VrmTextureBuffer;
  readonly shadeColor?: Rgb01;
  readonly shadingToonyFactor?: number;
  readonly shadingShiftFactor?: number;
  readonly giEqualizationFactor?: number;
  readonly outlineWidthMode?: VrmOutlineWidthMode;
  readonly outlineWidthFactor?: number;
  readonly outlineColor?: Rgb01;
  readonly outlineLightingMixFactor?: number;
  readonly rimColor?: Rgb01;
  readonly rimLightingMixFactor?: number;
  readonly rimFresnelPower?: number;
  readonly rimLift?: number;
  readonly angelRingIntensity?: number;
  readonly lightDirection?: Vec3;
  readonly roughness?: number;
  readonly metalness?: number;
}

export interface ShaderDnaTransferOptions {
  /** OKLCH 톤·채도 조화 강도 [0..1] (기본 0.85) */
  readonly toneHarmonyStrength?: number;
  /** 헤어 파츠 엔젤링 DNA 자동 상속 여부 (기본 true) */
  readonly inheritHairAngelRing?: boolean;
  /** VRM 본체 주광 방향 강제 동기화 여부 (기본 true) */
  readonly lockLightDirection?: boolean;
}

export interface PerceptualChannelDeltaE00 {
  readonly litBaseDeltaE00: number;
  readonly shadowToneDeltaE00: number;
  readonly outlineColorDeltaE00: number;
  readonly rimLightDeltaE00: number;
  readonly compositeDeltaE00: number;
}

export interface TransferredVrmPartMaterial {
  readonly shaderType: "vrm-mtoon-dna";
  readonly baseColorRgb: Rgb01;
  readonly baseColorOklch: OklchColor;
  readonly shadeColorRgb: Rgb01;
  readonly shadeColorOklch: OklchColor;
  readonly shadingToonyFactor: number;
  readonly shadingShiftFactor: number;
  readonly giEqualizationFactor: number;
  readonly outlineWidthMode: VrmOutlineWidthMode;
  readonly outlineWidthFactor: number;
  readonly outlineColorRgb: Rgb01;
  readonly outlineColorOklch: OklchColor;
  readonly outlineLightingMixFactor: number;
  readonly rimColorRgb: Rgb01;
  readonly rimColorOklch: OklchColor;
  readonly rimLightingMixFactor: number;
  readonly rimFresnelPower: number;
  readonly rimLift: number;
  readonly angelRingIntensity: number;
  readonly angelRingSharpness: number;
  readonly angelRingTintRgb: Rgb01;
  readonly lightDirection: Vec3;
}

export interface VrmPartShaderTransferResult {
  readonly partId: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly kind: VrmReplacementPartKind;
  readonly sourceShaderType: RawPartShaderType;
  readonly rawBaseOklch: OklchColor;
  readonly rawBaseRgb: Rgb01;
  readonly rawShadeRgb: Rgb01;
  readonly transferred: TransferredVrmPartMaterial;
  readonly beforeDeltaE00: PerceptualChannelDeltaE00;
  readonly afterDeltaE00: PerceptualChannelDeltaE00;
  readonly deltaE00Reduction: number;
  readonly deltaE00ImprovementPercent: number;
  readonly beforeCelBoundaryError: number;
  readonly afterCelBoundaryError: number;
  readonly beforeOutlineWidthDelta: number;
  readonly afterOutlineWidthDelta: number;
  readonly beforeLightAlignmentCosine: number;
  readonly afterLightAlignmentCosine: number;
  readonly harmonyGrade: ShaderHarmonyGrade;
}

export interface VrmBatchShaderTransferReport {
  readonly dnaProfileId: string;
  readonly partResults: readonly VrmPartShaderTransferResult[];
  readonly meanBeforeDeltaE00: number;
  readonly meanAfterDeltaE00: number;
  readonly meanImprovementPercent: number;
  readonly maxCelBoundaryErrorAfter: number;
  readonly maxOutlineWidthDeltaAfter: number;
  readonly minLightAlignmentAfter: number;
  readonly allHarmonized: boolean;
}

/** Three.js / @pixiv/three-vrm 호환 구조적 타입 (번들 의존성 0). */
export interface ThreeColorLike {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  setRGB?: (r: number, g: number, b: number) => unknown;
}

export interface VrmSceneMaterialLike {
  readonly name?: string;
  readonly isMToonMaterial?: boolean;
  readonly isMToonNodeMaterial?: boolean;
  readonly isOutline?: boolean;
  color?: ThreeColorLike;
  shadeColorFactor?: ThreeColorLike;
  shadingToonyFactor?: number;
  shadingShiftFactor?: number;
  giEqualizationFactor?: number;
  outlineWidthMode?: VrmOutlineWidthMode;
  outlineWidthFactor?: number;
  outlineColorFactor?: ThreeColorLike;
  outlineLightingMixFactor?: number;
  parametricRimColorFactor?: ThreeColorLike;
  rimLightingMixFactor?: number;
  parametricRimFresnelPowerFactor?: number;
  parametricRimLiftFactor?: number;
  matcapFactor?: ThreeColorLike;
  map?: { readonly image?: { readonly width?: number; readonly height?: number; readonly data?: Uint8Array | Uint8ClampedArray } };
  userData?: Record<string, unknown>;
}

export interface VrmSceneObjectLike {
  readonly name?: string;
  readonly visible?: boolean;
  readonly isMesh?: boolean;
  readonly material?: VrmSceneMaterialLike | readonly VrmSceneMaterialLike[];
  readonly userData?: Record<string, unknown>;
  readonly traverse?: (visitor: (node: VrmSceneObjectLike) => void) => void;
}

export interface VrmRuntimeLike {
  readonly scene?: VrmSceneObjectLike;
}
