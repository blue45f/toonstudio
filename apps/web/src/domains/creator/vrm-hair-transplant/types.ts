/**
 * 크로스 VRM 실물 헤어 이식 · 두개골 정렬 · 본 웨이트 재매핑 · MToon DNA 보정 계약 타입 및 쇼케이스 프리셋.
 *
 * - 원시 색상 리터럴(#hex/rgb/hsl) 없이 정규화 sRGB(`Rgb01`) 및 OKLCH 구조만 사용한다.
 * - 브라우저 스토리지 의존성이 없는 순수 타입·상수 계층이다.
 */

import type * as THREE from "three";

import type { OklchColor, Rgb01 } from "../vrm-auto-shader-transfer/color-science-oklch";
import type { StudioVrmMtoonOutlineWidthMode } from "../vrm/studio-vrm-mtoon-controls";

export type Vec3Tuple = readonly [number, number, number];

export type HairZoneKind = "front" | "side-left" | "side-right" | "back" | "crown";

export type HairTransplantDonorId =
  | "lumi-long-straight"
  | "shion-semi-long"
  | "shino-twin-side"
  | "vita-short-wolf"
  | "seoyeon-wave";

export type TargetHeadProportionId =
  | "korean-webtoon-72"
  | "tall-romance-80"
  | "youth-academy-68"
  | "sd-chibi-30"
  | "realistic-75";

export type HairHarmonyGrade = "harmonized" | "acceptable" | "needs-tuning";

/** `@pixiv/three-vrm`의 `VRM` 인스턴스 및 Three.js 합성 VRM 테스트 리그와 호환되는 구조적 인터페이스. */
export interface VrmTransplantActorLike {
  readonly scene: THREE.Object3D;
  readonly humanoid?: {
    readonly getRawBoneNode?: (boneName: "head" | "neck" | "leftEye" | "rightEye") => THREE.Object3D | null;
    readonly getNormalizedBoneNode?: (boneName: "head" | "neck" | "leftEye" | "rightEye") => THREE.Object3D | null;
  } | null;
  readonly meta?: {
    readonly metaVersion?: "0" | "1" | string;
    readonly name?: string;
  } | null;
}

/** VRM 두개골(크라니움) 기준 좌표계 측정값 (단위: m, canonical `+Y` 위 / `+Z` 정면 기준). */
export interface SkullFrameMetrics {
  readonly headWorldOrigin: Vec3Tuple;
  readonly crownHeightM: number;
  readonly skullWidthM: number;
  readonly skullDepthM: number;
  readonly eyeLineHeightM: number;
  /** VRM 0.x(-1: -Z 전방) / VRM 1.0(+1: +Z 전방). */
  readonly forwardSign: 1 | -1;
  readonly source: "measured-mesh" | "bone-landmark" | "preset";
}

/** 도너 두개골 → 타깃 두개골 아핀 정렬 결과 및 5점 해부 랜드마크 오차(mm). */
export interface SkullAlignmentTransform {
  readonly scale: Vec3Tuple;
  readonly offsetMeters: Vec3Tuple;
  readonly offsetMm: Vec3Tuple;
  readonly yawCompensationRad: number;
  readonly crownResidualMm: number;
  readonly widthResidualMm: number;
  readonly depthResidualMm: number;
  readonly eyeLineResidualMm: number;
  readonly maxLandmarkErrorMm: number;
}

/** 도너 VRM에서 비파괴로 식별·추출한 실물 헤어 메시 요약. */
export interface ExtractedDonorHairMesh {
  readonly sourceMeshName: string;
  readonly meshKind: "skinned" | "static";
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly hasUv: boolean;
  readonly hasVertexColors: boolean;
  readonly sourceBoneCount: number;
  readonly sourceMaterialCount: number;
  readonly mesh: THREE.Mesh;
}

/** 두피 고정(0.0 흔들림) → 모발 끝 탄성(1.0 프로파일) 본 웨이트 재매핑 설정. */
export interface HairBoneWeightConfig {
  /** 정수리 대비 두피 고정 구간 비율 (0.05..0.38, 이 구간 정점은 head weight >= 0.95 보장). */
  readonly scalpPinRadiusRatio: number;
  /** 모발 끝단 흔들림 가속 시작 비율 (0.45..0.85). */
  readonly tipSwayStartRatio: number;
  /** 모발 끝단 보조 본 최대 가중치 (0.65..1.0). */
  readonly maxTipSwayWeight: number;
  /** 구역당 가상 SpringBone 체인 마디 수 (head 제외 3마디 기본). */
  readonly secondaryJointCount: number;
  readonly stiffness: number;
  readonly dragForce: number;
  readonly gravityPower: number;
}

/** 루트→끝단 5구간 본 웨이트 분포 히트바 항목. */
export interface BoneWeightZoneBand {
  readonly bandIndex: number;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly dropRangeRatio: readonly [number, number];
  readonly avgHeadWeight: number;
  readonly avgSecondaryWeight: number;
  readonly vertexCount: number;
}

/** 재바인딩된 SkinnedMesh의 정점 스키닝 무결성 실측 리포트. */
export interface ReboundSkinMetrics {
  readonly totalVertices: number;
  readonly maxWeightSumDeviation: number;
  readonly minScalpRootHeadWeight: number;
  readonly meanScalpRootHeadWeight: number;
  readonly meanTipSecondaryWeight: number;
  readonly maxTipSecondaryWeight: number;
  readonly minTipBoneWeight: number;
  readonly secondaryBoneCount: number;
  readonly springChainCount: number;
  readonly weightBands: readonly BoneWeightZoneBand[];
}

/** 이식 헤어 MToon DNA 및 색조 보정 옵션. */
export interface HairColorHarmonyConfig {
  /** 타깃 VRM 본체 톤 DNA 조화 강도 (0..1). */
  readonly harmonyStrength: number;
  /** 사용자 지정 목표 틴트(선택). 미지정 시 타깃 본체 셰이드 DNA와 조화한다. */
  readonly tintOverrideRgb?: Rgb01;
  /** 원본 아티스트 UV 디퓨즈·노멀 텍스처 보존 여부. */
  readonly preserveOriginalTextures: boolean;
  /** 헤어 엔젤링 매트캡 적용 여부. */
  readonly enableAngelRingMatcap: boolean;
  /** 역면 스키닝 외곽선 메시 동시 생성 여부. */
  readonly enableOutlineMesh: boolean;
  /** 엔젤링·림 광택 계수 (0..1). */
  readonly shine: number;
}

/** 이식 전/후 CIEDE2000 ΔE00 및 MToon 셰이더 패치 검증 리포트. */
export interface HairMtoonHarmonyReport {
  readonly beforeDeltaE00: number;
  readonly afterDeltaE00: number;
  readonly improvementPercent: number;
  readonly harmonyGrade: HairHarmonyGrade;
  readonly shadingToonyFactor: number;
  readonly shadingShiftFactor: number;
  readonly giEqualizationFactor: number;
  readonly outlineWidthMode: StudioVrmMtoonOutlineWidthMode;
  readonly outlineWidthFactor: number;
  readonly vColorShaderPatched: boolean;
  readonly patchedMaterialCount: number;
  readonly donorBaseOklch: OklchColor;
  readonly harmonizedBaseOklch: OklchColor;
  readonly harmonizedShadeOklch: OklchColor;
  readonly targetBodyShadeOklch: OklchColor;
}

export interface VrmHairTransplantOptions {
  readonly replaceOriginalHair?: boolean;
  readonly manualOffsetMm?: Vec3Tuple;
  readonly manualScaleMultiplier?: Vec3Tuple;
  readonly boneWeight?: Partial<HairBoneWeightConfig>;
  readonly colorHarmony?: Partial<HairColorHarmonyConfig>;
  readonly donorHairMeshNames?: readonly string[];
}

export interface VrmHairVirtualSpringChain {
  readonly id: string;
  readonly zone: HairZoneKind;
  readonly bones: readonly THREE.Bone[];
  readonly stiffness: number;
  readonly dragForce: number;
  readonly gravityPower: number;
  readonly hitRadius: number;
}

/** 실행된 헤어 이식 핸들 — `dispose()`로 생성 GPU 자원 폐기 및 타깃 원본 헤어 가시성 100% 원복. */
export interface VrmHairTransplantResultHandle {
  readonly id: string;
  readonly rootGroup: THREE.Group;
  readonly transplantedMeshes: readonly THREE.SkinnedMesh[];
  readonly outlineMeshes: readonly THREE.SkinnedMesh[];
  readonly virtualChains: readonly VrmHairVirtualSpringChain[];
  readonly donorSkull: SkullFrameMetrics;
  readonly targetSkull: SkullFrameMetrics;
  readonly alignment: SkullAlignmentTransform;
  readonly skinMetrics: ReboundSkinMetrics;
  readonly mtoonHarmony: HairMtoonHarmonyReport;
  readonly hiddenOriginalHairCount: number;
  readonly isDisposed: () => boolean;
  readonly dispose: () => void;
}

/** 내장 쇼케이스 VRM 아티스트 헤어 도너 항목. */
export interface HairTransplantDonorCatalogEntry {
  readonly id: HairTransplantDonorId;
  readonly vrmAssetId: string;
  readonly vrmUrl: string;
  readonly characterNameKo: string;
  readonly characterNameEn: string;
  readonly styleLabelKo: string;
  readonly styleLabelEn: string;
  readonly silhouetteSummaryKo: string;
  readonly silhouetteSummaryEn: string;
  readonly vrmVersion: "0" | "1";
  readonly defaultSkull: SkullFrameMetrics;
  readonly hairMetrics: {
    readonly strandZones: readonly HairZoneKind[];
    readonly dropBelowHeadM: number;
    readonly triangleEstimate: number;
    readonly springChainCount: number;
    readonly defaultBaseRgb: Rgb01;
    readonly defaultShadeRgb: Rgb01;
    readonly defaultTipRgb: Rgb01;
    readonly defaultShine: number;
    readonly shadingToonyFactor: number;
  };
}

/** 타깃 캐릭터 두상 비율 및 본체 MToon DNA 프리셋. */
export interface TargetHeadProportionPreset {
  readonly id: TargetHeadProportionId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly headBodyRatio: number;
  readonly skull: SkullFrameMetrics;
  readonly targetBodyDna: {
    readonly skinRgb: Rgb01;
    readonly shadeTintRgb: Rgb01;
    readonly outlineRgb: Rgb01;
    readonly rimRgb: Rgb01;
    readonly shadingToonyFactor: number;
    readonly shadingShiftFactor: number;
    readonly giEqualizationFactor: number;
    readonly outlineWidthMode: StudioVrmMtoonOutlineWidthMode;
    readonly outlineWidthFactor: number;
    readonly desiredHairTintRgb: Rgb01;
  };
}

/** 1-클릭 원격/런타임 실행용 결정적 헤어 이식 매니페스트. */
export interface VrmHairTransplantManifest {
  readonly version: 1;
  readonly donorId: HairTransplantDonorId;
  readonly donorVrmAssetId: string;
  readonly donorVrmUrl: string;
  readonly donorStyleLabelKo: string;
  readonly targetProportionId: TargetHeadProportionId;
  readonly targetLabelKo: string;
  readonly alignment: SkullAlignmentTransform;
  readonly boneWeightConfig: HairBoneWeightConfig;
  readonly skinPreview: ReboundSkinMetrics;
  readonly mtoonHarmony: HairMtoonHarmonyReport;
  readonly replaceOriginalHair: boolean;
  readonly createdSignature: string;
}

export const DEFAULT_HAIR_BONE_WEIGHT_CONFIG: HairBoneWeightConfig = Object.freeze({
  scalpPinRadiusRatio: 0.18,
  tipSwayStartRatio: 0.65,
  maxTipSwayWeight: 0.9,
  secondaryJointCount: 3,
  stiffness: 0.72,
  dragForce: 0.42,
  gravityPower: 0.24,
});

export const DEFAULT_HAIR_COLOR_HARMONY_CONFIG: HairColorHarmonyConfig = Object.freeze({
  harmonyStrength: 0.82,
  preserveOriginalTextures: true,
  enableAngelRingMatcap: true,
  enableOutlineMesh: true,
  shine: 0.58,
});

export const DONOR_HAIR_CATALOG: readonly HairTransplantDonorCatalogEntry[] = Object.freeze([
  Object.freeze({
    id: "lumi-long-straight",
    vrmAssetId: "sample-vrm",
    vrmUrl: "/vrm/sample.vrm",
    characterNameKo: "루미",
    characterNameEn: "Lumi",
    styleLabelKo: "루미 롱 스트레이트",
    styleLabelEn: "Lumi Long Straight",
    silhouetteSummaryKo: "등 중반까지 떨어지는 클래식 스트레이트 · 앞머리/사이드/백 4구역 SpringBone",
    silhouetteSummaryEn: "Mid-back straight hair with 4-zone front/side/back SpringBone chains",
    vrmVersion: "0",
    defaultSkull: Object.freeze({
      headWorldOrigin: [0, 1.44, 0] as const,
      crownHeightM: 0.214,
      skullWidthM: 0.168,
      skullDepthM: 0.184,
      eyeLineHeightM: 0.106,
      forwardSign: -1 as const,
      source: "preset" as const,
    }),
    hairMetrics: Object.freeze({
      strandZones: ["front", "side-left", "side-right", "back"] as const,
      dropBelowHeadM: 0.36,
      triangleEstimate: 8420,
      springChainCount: 6,
      defaultBaseRgb: { r: 0.19, g: 0.24, b: 0.42 },
      defaultShadeRgb: { r: 0.11, g: 0.14, b: 0.29 },
      defaultTipRgb: { r: 0.34, g: 0.44, b: 0.68 },
      defaultShine: 0.62,
      shadingToonyFactor: 0.88,
    }),
  }),
  Object.freeze({
    id: "shion-semi-long",
    vrmAssetId: "shion",
    vrmUrl: "/vrm/Sendagaya_Shibu.vrm",
    characterNameKo: "시온",
    characterNameEn: "Shion",
    styleLabelKo: "시온 세미롱",
    styleLabelEn: "Shion Semi-Long",
    silhouetteSummaryKo: "어깨선 레이어드 세미롱 · 자연 C컬 옆머리·뒷머리 균형 체인",
    silhouetteSummaryEn: "Shoulder-length layered semi-long with soft C-curl side locks",
    vrmVersion: "0",
    defaultSkull: Object.freeze({
      headWorldOrigin: [0, 1.46, 0] as const,
      crownHeightM: 0.21,
      skullWidthM: 0.164,
      skullDepthM: 0.18,
      eyeLineHeightM: 0.104,
      forwardSign: -1 as const,
      source: "preset" as const,
    }),
    hairMetrics: Object.freeze({
      strandZones: ["front", "side-left", "side-right", "back"] as const,
      dropBelowHeadM: 0.24,
      triangleEstimate: 7180,
      springChainCount: 5,
      defaultBaseRgb: { r: 0.72, g: 0.48, b: 0.34 },
      defaultShadeRgb: { r: 0.48, g: 0.28, b: 0.22 },
      defaultTipRgb: { r: 0.86, g: 0.68, b: 0.52 },
      defaultShine: 0.56,
      shadingToonyFactor: 0.84,
    }),
  }),
  Object.freeze({
    id: "shino-twin-side",
    vrmAssetId: "shino",
    vrmUrl: "/vrm/Sendagaya_Shino.vrm",
    characterNameKo: "시노",
    characterNameEn: "Shino",
    styleLabelKo: "시노 트윈사이드",
    styleLabelEn: "Shino Twin-Side",
    silhouetteSummaryKo: "좌우 대칭 트윈사이드 테일 · 팁 스웨이 감응도 높은 이중 사이드 체인",
    silhouetteSummaryEn: "Symmetrical twin-side tails with high-response dual side SpringBone chains",
    vrmVersion: "0",
    defaultSkull: Object.freeze({
      headWorldOrigin: [0, 1.42, 0] as const,
      crownHeightM: 0.218,
      skullWidthM: 0.172,
      skullDepthM: 0.186,
      eyeLineHeightM: 0.108,
      forwardSign: -1 as const,
      source: "preset" as const,
    }),
    hairMetrics: Object.freeze({
      strandZones: ["front", "side-left", "side-right", "back"] as const,
      dropBelowHeadM: 0.33,
      triangleEstimate: 9640,
      springChainCount: 8,
      defaultBaseRgb: { r: 0.84, g: 0.42, b: 0.52 },
      defaultShadeRgb: { r: 0.58, g: 0.24, b: 0.38 },
      defaultTipRgb: { r: 0.94, g: 0.66, b: 0.72 },
      defaultShine: 0.68,
      shadingToonyFactor: 0.9,
    }),
  }),
  Object.freeze({
    id: "vita-short-wolf",
    vrmAssetId: "vita",
    vrmUrl: "/vrm/Vita.vrm",
    characterNameKo: "비타",
    characterNameEn: "Vita",
    styleLabelKo: "비타 숏울프",
    styleLabelEn: "Vita Short Wolf",
    silhouetteSummaryKo: "목선 층이 살아있는 숏울프 컷 · 경쾌한 강성 세팅으로 눈 관통 억제",
    silhouetteSummaryEn: "Layered nape short wolf cut tuned with crisp stiffness to avoid eye clipping",
    vrmVersion: "0",
    defaultSkull: Object.freeze({
      headWorldOrigin: [0, 1.47, 0] as const,
      crownHeightM: 0.208,
      skullWidthM: 0.162,
      skullDepthM: 0.179,
      eyeLineHeightM: 0.102,
      forwardSign: -1 as const,
      source: "preset" as const,
    }),
    hairMetrics: Object.freeze({
      strandZones: ["front", "side-left", "side-right", "back"] as const,
      dropBelowHeadM: 0.15,
      triangleEstimate: 5920,
      springChainCount: 4,
      defaultBaseRgb: { r: 0.27, g: 0.22, b: 0.26 },
      defaultShadeRgb: { r: 0.15, g: 0.12, b: 0.18 },
      defaultTipRgb: { r: 0.46, g: 0.38, b: 0.48 },
      defaultShine: 0.48,
      shadingToonyFactor: 0.85,
    }),
  }),
  Object.freeze({
    id: "seoyeon-wave",
    vrmAssetId: "ts-vrm-hero-v1-romance-female",
    vrmUrl: "/vrm/toonstudio-hero-v1/romance-female.vrm",
    characterNameKo: "서연",
    characterNameEn: "Seoyeon",
    styleLabelKo: "서연 웨이브",
    styleLabelEn: "Seoyeon Wave",
    silhouetteSummaryKo: "한국 로맨스 웹툰 7.2등신 레이어드 웨이브 · VRM 1.0 네이티브(+Z 정면)",
    silhouetteSummaryEn: "Korean romance webtoon 7.2-head layered wave, native VRM 1.0 (+Z forward)",
    vrmVersion: "1",
    defaultSkull: Object.freeze({
      headWorldOrigin: [0, 1.48, 0] as const,
      crownHeightM: 0.212,
      skullWidthM: 0.16,
      skullDepthM: 0.176,
      eyeLineHeightM: 0.105,
      forwardSign: 1 as const,
      source: "preset" as const,
    }),
    hairMetrics: Object.freeze({
      strandZones: ["front", "side-left", "side-right", "back"] as const,
      dropBelowHeadM: 0.38,
      triangleEstimate: 10240,
      springChainCount: 7,
      defaultBaseRgb: { r: 0.26, g: 0.19, b: 0.17 },
      defaultShadeRgb: { r: 0.15, g: 0.1, b: 0.12 },
      defaultTipRgb: { r: 0.45, g: 0.34, b: 0.29 },
      defaultShine: 0.64,
      shadingToonyFactor: 0.9,
    }),
  }),
]);

export const TARGET_HEAD_PROPORTION_PRESETS: readonly TargetHeadProportionPreset[] = Object.freeze([
  Object.freeze({
    id: "korean-webtoon-72",
    labelKo: "로맨스 웹툰 (7.2등신)",
    labelEn: "Romance Webtoon (7.2-head)",
    headBodyRatio: 7.2,
    skull: Object.freeze({
      headWorldOrigin: [0, 1.48, 0] as const,
      crownHeightM: 0.212,
      skullWidthM: 0.16,
      skullDepthM: 0.176,
      eyeLineHeightM: 0.105,
      forwardSign: 1 as const,
      source: "preset" as const,
    }),
    targetBodyDna: Object.freeze({
      skinRgb: { r: 0.96, g: 0.85, b: 0.79 },
      shadeTintRgb: { r: 0.84, g: 0.78, b: 0.86 },
      outlineRgb: { r: 0.16, g: 0.13, b: 0.18 },
      rimRgb: { r: 0.99, g: 0.96, b: 0.93 },
      shadingToonyFactor: 0.9,
      shadingShiftFactor: -0.14,
      giEqualizationFactor: 0.9,
      outlineWidthMode: "screenCoordinates" as const,
      outlineWidthFactor: 0.0022,
      desiredHairTintRgb: { r: 0.29, g: 0.22, b: 0.26 },
    }),
  }),
  Object.freeze({
    id: "tall-romance-80",
    labelKo: "장신 로판·오피스 (8.0등신)",
    labelEn: "Tall Rofan / Office (8.0-head)",
    headBodyRatio: 8.0,
    skull: Object.freeze({
      headWorldOrigin: [0, 1.64, 0] as const,
      crownHeightM: 0.224,
      skullWidthM: 0.168,
      skullDepthM: 0.188,
      eyeLineHeightM: 0.112,
      forwardSign: 1 as const,
      source: "preset" as const,
    }),
    targetBodyDna: Object.freeze({
      skinRgb: { r: 0.93, g: 0.81, b: 0.75 },
      shadeTintRgb: { r: 0.76, g: 0.79, b: 0.89 },
      outlineRgb: { r: 0.13, g: 0.14, b: 0.2 },
      rimRgb: { r: 0.95, g: 0.97, b: 1.0 },
      shadingToonyFactor: 0.88,
      shadingShiftFactor: -0.12,
      giEqualizationFactor: 0.88,
      outlineWidthMode: "screenCoordinates" as const,
      outlineWidthFactor: 0.002,
      desiredHairTintRgb: { r: 0.19, g: 0.22, b: 0.31 },
    }),
  }),
  Object.freeze({
    id: "youth-academy-68",
    labelKo: "학원 청춘 (6.8등신)",
    labelEn: "Youth Academy (6.8-head)",
    headBodyRatio: 6.8,
    skull: Object.freeze({
      headWorldOrigin: [0, 1.39, 0] as const,
      crownHeightM: 0.218,
      skullWidthM: 0.172,
      skullDepthM: 0.184,
      eyeLineHeightM: 0.106,
      forwardSign: 1 as const,
      source: "preset" as const,
    }),
    targetBodyDna: Object.freeze({
      skinRgb: { r: 0.97, g: 0.86, b: 0.8 },
      shadeTintRgb: { r: 0.88, g: 0.81, b: 0.8 },
      outlineRgb: { r: 0.2, g: 0.15, b: 0.16 },
      rimRgb: { r: 1.0, g: 0.95, b: 0.88 },
      shadingToonyFactor: 0.89,
      shadingShiftFactor: -0.1,
      giEqualizationFactor: 0.92,
      outlineWidthMode: "screenCoordinates" as const,
      outlineWidthFactor: 0.0024,
      desiredHairTintRgb: { r: 0.42, g: 0.29, b: 0.23 },
    }),
  }),
  Object.freeze({
    id: "sd-chibi-30",
    labelKo: "SD 데포르메 (3.0등신)",
    labelEn: "SD Chibi (3.0-head)",
    headBodyRatio: 3.0,
    skull: Object.freeze({
      headWorldOrigin: [0, 0.72, 0] as const,
      crownHeightM: 0.312,
      skullWidthM: 0.256,
      skullDepthM: 0.264,
      eyeLineHeightM: 0.148,
      forwardSign: 1 as const,
      source: "preset" as const,
    }),
    targetBodyDna: Object.freeze({
      skinRgb: { r: 0.98, g: 0.87, b: 0.82 },
      shadeTintRgb: { r: 0.9, g: 0.83, b: 0.88 },
      outlineRgb: { r: 0.22, g: 0.16, b: 0.22 },
      rimRgb: { r: 1.0, g: 0.98, b: 0.94 },
      shadingToonyFactor: 0.92,
      shadingShiftFactor: -0.08,
      giEqualizationFactor: 0.94,
      outlineWidthMode: "worldCoordinates" as const,
      outlineWidthFactor: 0.0032,
      desiredHairTintRgb: { r: 0.62, g: 0.42, b: 0.52 },
    }),
  }),
  Object.freeze({
    id: "realistic-75",
    labelKo: "세미 리얼 (7.5등신)",
    labelEn: "Semi-Realistic (7.5-head)",
    headBodyRatio: 7.5,
    skull: Object.freeze({
      headWorldOrigin: [0, 1.54, 0] as const,
      crownHeightM: 0.216,
      skullWidthM: 0.156,
      skullDepthM: 0.186,
      eyeLineHeightM: 0.109,
      forwardSign: 1 as const,
      source: "preset" as const,
    }),
    targetBodyDna: Object.freeze({
      skinRgb: { r: 0.92, g: 0.79, b: 0.72 },
      shadeTintRgb: { r: 0.78, g: 0.75, b: 0.8 },
      outlineRgb: { r: 0.15, g: 0.13, b: 0.15 },
      rimRgb: { r: 0.96, g: 0.95, b: 0.94 },
      shadingToonyFactor: 0.78,
      shadingShiftFactor: -0.06,
      giEqualizationFactor: 0.86,
      outlineWidthMode: "worldCoordinates" as const,
      outlineWidthFactor: 0.0016,
      desiredHairTintRgb: { r: 0.24, g: 0.2, b: 0.18 },
    }),
  }),
]);
