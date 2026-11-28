/**
 * Wave 163: 다중 광원 스페큘러 일관성 & 카툰 2·3밴드 셀-셰이딩 커널 도메인 타입 계약.
 *
 * - 4종 다중 광원 리그(Key · Fill · Rim · Bounce)와 정규화 3D 방향 벡터
 * - 6종 물리 준수 재질 프리셋(비금속 `metallic = 0.0` vs 금속 `metallic = 1.0` 이진 규율)
 * - 2/3-밴드 셀 램프, 페인팅 하이라이트 검사 항목, 결함 분류, WGSL 번들 및 오케스트레이터 결과 계약
 */

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface OklchColor {
  /** 지각 명도 L (`0.0 ~ 1.0`) */
  readonly l: number;
  /** 지각 채도 C (`0.0 ~ 0.4`) */
  readonly c: number;
  /** 색상각 H (`0 ~ 360`도) */
  readonly h: number;
}

export type LightRole = 'key' | 'fill' | 'rim' | 'bounce';

export interface StylizedLightSource {
  readonly id: string;
  readonly role: LightRole;
  /** 표면에서 광원 쪽을 가리키는 정규화 3D 방향 벡터 */
  readonly direction: Vec3;
  /** 광원 강도 (`>= 0`) */
  readonly intensity: number;
  readonly color: OklchColor;
  readonly enabled?: boolean;
}

export interface StylizedMultiLightRig {
  readonly id: string;
  readonly label: string;
  readonly key: StylizedLightSource;
  readonly fill: StylizedLightSource;
  readonly rim: StylizedLightSource;
  readonly bounce: StylizedLightSource;
  /** 표면에서 카메라를 향하는 정규화 시선 벡터 */
  readonly viewDirection: Vec3;
}

export type CelMaterialPresetId =
  | 'skin-matte'
  | 'cloth-fabric'
  | 'hair-anisotropic'
  | 'brushed-metal'
  | 'dielectric-glass'
  | 'water-surface';

export interface CelMaterialSpec {
  readonly id: CelMaterialPresetId;
  readonly labelKo: string;
  readonly isMetal: boolean;
  /** 유전체는 엄격히 `0.0`, 금속은 엄격히 `1.0` */
  readonly metallic: number;
  readonly roughness: number;
  readonly ior: number;
  /** 유전체 프레넬 F0 (`0.02 ~ 0.05`), 금속은 고유 반사율 */
  readonly fresnelF0: number;
  readonly specularIntensity: number;
  readonly specularCutoff: number;
  readonly specularFeather: number;
  /** 유전체는 `0.0`(광원색 반사), 금속은 `1.0`(알베도 틴트 반사) */
  readonly specularTintByAlbedo: number;
  /** Kajiya-Kay 주 하이라이트 탄젠트 이동량 */
  readonly anisotropicShift: number;
  /** Kajiya-Kay 보조 하이라이트 탄젠트 이동량 */
  readonly anisotropicSecondaryShift: number;
  readonly rimResponsiveness: number;
  readonly rimPower: number;
  readonly baseColor: OklchColor;
}

export const CEL_MATERIAL_PRESET_IDS: readonly CelMaterialPresetId[] = [
  'skin-matte',
  'cloth-fabric',
  'hair-anisotropic',
  'brushed-metal',
  'dielectric-glass',
  'water-surface',
] as const;

export const CEL_MATERIAL_PRESETS: Readonly<Record<CelMaterialPresetId, CelMaterialSpec>> = {
  'skin-matte': {
    id: 'skin-matte',
    labelKo: '매트 피부',
    isMetal: false,
    metallic: 0.0,
    roughness: 0.62,
    ior: 1.4,
    fresnelF0: 0.028,
    specularIntensity: 0.28,
    specularCutoff: 0.84,
    specularFeather: 0.08,
    specularTintByAlbedo: 0.0,
    anisotropicShift: 0.0,
    anisotropicSecondaryShift: 0.0,
    rimResponsiveness: 0.65,
    rimPower: 3.4,
    baseColor: { l: 0.82, c: 0.072, h: 52 },
  },
  'cloth-fabric': {
    id: 'cloth-fabric',
    labelKo: '직물 원단',
    isMetal: false,
    metallic: 0.0,
    roughness: 0.82,
    ior: 1.46,
    fresnelF0: 0.035,
    specularIntensity: 0.16,
    specularCutoff: 0.88,
    specularFeather: 0.1,
    specularTintByAlbedo: 0.0,
    anisotropicShift: 0.0,
    anisotropicSecondaryShift: 0.0,
    rimResponsiveness: 0.78,
    rimPower: 2.8,
    baseColor: { l: 0.56, c: 0.118, h: 252 },
  },
  'hair-anisotropic': {
    id: 'hair-anisotropic',
    labelKo: '이방성 모발',
    isMetal: false,
    metallic: 0.0,
    roughness: 0.3,
    ior: 1.55,
    fresnelF0: 0.046,
    specularIntensity: 0.92,
    specularCutoff: 0.66,
    specularFeather: 0.07,
    specularTintByAlbedo: 0.0,
    anisotropicShift: 0.24,
    anisotropicSecondaryShift: -0.14,
    rimResponsiveness: 0.92,
    rimPower: 3.2,
    baseColor: { l: 0.34, c: 0.084, h: 280 },
  },
  'brushed-metal': {
    id: 'brushed-metal',
    labelKo: '브러시드 금속',
    isMetal: true,
    metallic: 1.0,
    roughness: 0.24,
    ior: 2.5,
    fresnelF0: 0.78,
    specularIntensity: 1.35,
    specularCutoff: 0.62,
    specularFeather: 0.05,
    specularTintByAlbedo: 1.0,
    anisotropicShift: 0.08,
    anisotropicSecondaryShift: 0.0,
    rimResponsiveness: 1.05,
    rimPower: 2.4,
    baseColor: { l: 0.76, c: 0.115, h: 82 },
  },
  'dielectric-glass': {
    id: 'dielectric-glass',
    labelKo: '유전체 유리',
    isMetal: false,
    metallic: 0.0,
    roughness: 0.08,
    ior: 1.52,
    fresnelF0: 0.042,
    specularIntensity: 1.25,
    specularCutoff: 0.78,
    specularFeather: 0.04,
    specularTintByAlbedo: 0.0,
    anisotropicShift: 0.0,
    anisotropicSecondaryShift: 0.0,
    rimResponsiveness: 1.15,
    rimPower: 4.2,
    baseColor: { l: 0.86, c: 0.045, h: 215 },
  },
  'water-surface': {
    id: 'water-surface',
    labelKo: '수면 반사',
    isMetal: false,
    metallic: 0.0,
    roughness: 0.12,
    ior: 1.333,
    fresnelF0: 0.02,
    specularIntensity: 1.18,
    specularCutoff: 0.76,
    specularFeather: 0.045,
    specularTintByAlbedo: 0.0,
    anisotropicShift: 0.0,
    anisotropicSecondaryShift: 0.0,
    rimResponsiveness: 1.1,
    rimPower: 3.8,
    baseColor: { l: 0.68, c: 0.105, h: 222 },
  },
};

export type CelBandCount = 2 | 3;

export interface CelRampConfig {
  readonly bandCount: CelBandCount;
  /** 명부·음영 주 경계 (`N·L` 기준, 보통 `-0.2 ~ 0.35`) */
  readonly terminatorThreshold: number;
  /** 3-밴드 중간톤 하한 (`terminatorThreshold`보다 작아야 함) */
  readonly midBandThreshold: number;
  /** 안티앨리어싱 밴드 페더 반폭 (`> 0`) */
  readonly bandFeatherWidth: number;
  /** 그림자 영역 OKLCH 색상 이동량 (도 단위, 예: `+22°`) */
  readonly shadowHueShiftDeg: number;
  /** 그림자 채도 보존 비율 (`>= 0.72` 권장) */
  readonly shadowChromaPreserveRatio: number;
  /** 그림자 명도 배율 */
  readonly shadowLightnessFactor: number;
  /** 3-밴드 중간톤 명도 배율 */
  readonly midLightnessFactor: number;
  /** 명부 명도 증폭 배율 */
  readonly litLightnessBoost: number;
}

export interface CelSurfaceSampleInput {
  readonly normal: Vec3;
  readonly tangent?: Vec3;
  readonly viewDirection?: Vec3;
  readonly baseColor?: OklchColor;
  readonly ambientOcclusion?: number;
  readonly shadowMask?: number;
}

export interface CelShadingEvaluation {
  readonly bandCount: CelBandCount;
  readonly ndotl: number;
  readonly ndotv: number;
  readonly litWeight: number;
  readonly midWeight: number;
  readonly shadowWeight: number;
  readonly bandLuminance: number;
  readonly shadowColor: OklchColor;
  readonly midColor: OklchColor;
  readonly litColor: OklchColor;
  readonly diffuseColor: OklchColor;
  readonly fresnelTerm: number;
  readonly isotropicSpecular: number;
  readonly anisotropicSpecular: number;
  readonly specularStrength: number;
  readonly specularColor: OklchColor;
  readonly rimStrength: number;
  readonly rimColor: OklchColor;
  readonly fillContribution: number;
  readonly bounceContribution: number;
  readonly finalColor: OklchColor;
  readonly finalLuminance: number;
}

export type CelConsistencyDefectKind =
  | 'specular-direction-mismatch'
  | 'muddy-desaturated-shadow'
  | 'dielectric-metallic-violation'
  | 'rim-key-occlusion-clash'
  | 'hard-banding-aliasing';

export type CelConsistencySeverity = 'error' | 'warning';

export interface PaintedHighlightAnnotation {
  readonly id: string;
  readonly objectName: string;
  readonly materialId: CelMaterialPresetId;
  readonly surfaceNormal: Vec3;
  readonly surfaceTangent?: Vec3;
  readonly viewDirection?: Vec3;
  readonly baseColor: OklchColor;
  /** 작가의 채색 하이라이트에서 역추정한 광원 방향 */
  readonly paintedHighlightDirection: Vec3;
  /** 작가가 칠한 그림자 색 (탁한 무채색 그림자 검증용) */
  readonly paintedShadowColor: OklchColor;
  /** 비이진 금속성 등 오버라이드 값 */
  readonly metallicOverride?: number;
  /** 유전체 알베도 틴트 반사 오류 검출용 오버라이드 */
  readonly specularTintByAlbedoOverride?: number;
  /** 경계 페더 폭 오버라이드 (`0`이면 계단 앨리어싱 검출) */
  readonly bandFeatherWidthOverride?: number;
  /** 림라이트 방향 오버라이드 (키라이트와 겹침 충돌 검출용) */
  readonly rimDirectionOverride?: Vec3;
  readonly rimIntensityOverride?: number;
  readonly celRampOverride?: Partial<CelRampConfig>;
}

export interface CelConsistencyViolation {
  readonly id: string;
  readonly annotationId: string;
  readonly objectName: string;
  readonly materialId: CelMaterialPresetId;
  readonly kind: CelConsistencyDefectKind;
  readonly severity: CelConsistencySeverity;
  readonly measuredValue: number;
  readonly thresholdValue: number;
  readonly unit: string;
  readonly messageKo: string;
  readonly remedyKo: string;
}

export interface CelAuditThresholds {
  readonly maxSpecularAngleDeltaDeg: number;
  readonly minShadowChromaRatio: number;
  readonly minShadowHueShiftDeg: number;
  readonly minBandFeatherWidth: number;
  readonly maxRimKeyAlignmentDot: number;
  readonly maxDielectricTintByAlbedo: number;
}

export interface CelAnnotationAuditEntry {
  readonly annotationId: string;
  readonly objectName: string;
  readonly materialId: CelMaterialPresetId;
  readonly specularDeviationDeg: number;
  readonly shadowChromaRatio: number;
  readonly shadowHueDeltaDeg: number;
  readonly effectiveMetallic: number;
  readonly effectiveFeatherWidth: number;
  readonly shading: CelShadingEvaluation;
}

export interface CelCutConsistencyAudit {
  readonly cutId: string;
  readonly rigId: string;
  readonly evaluatedCount: number;
  readonly passed: boolean;
  readonly status: 'PASS' | 'WARN' | 'FAIL';
  readonly consistencyScore: number;
  readonly maxSpecularDeviationDeg: number;
  readonly averageSpecularDeviationDeg: number;
  readonly defectCounts: Readonly<Record<CelConsistencyDefectKind, number>>;
  readonly violations: readonly CelConsistencyViolation[];
  readonly evaluations: readonly CelAnnotationAuditEntry[];
}

export interface CelHarmonizationChange {
  readonly annotationId: string;
  readonly objectName: string;
  readonly kind: CelConsistencyDefectKind;
  readonly beforeSummary: string;
  readonly afterSummary: string;
}

export interface CelHarmonizationResult {
  readonly cutId: string;
  readonly harmonizedRig: StylizedMultiLightRig;
  readonly harmonizedRamp: CelRampConfig;
  readonly harmonizedAnnotations: readonly PaintedHighlightAnnotation[];
  readonly changes: readonly CelHarmonizationChange[];
  readonly beforeAudit: CelCutConsistencyAudit;
  readonly afterAudit: CelCutConsistencyAudit;
}

export interface CelShadingWgslBinding {
  readonly group: number;
  readonly binding: number;
  readonly name: string;
  readonly addressSpace: string;
}

export interface CelShadingWgslBundle {
  readonly shaderName: string;
  readonly entryPoint: string;
  readonly uniformByteSize: number;
  readonly uniformAlignmentBytes: number;
  readonly uniformFloat32: Float32Array;
  readonly wgslSource: string;
  readonly bindings: readonly CelShadingWgslBinding[];
}

export interface CelWgslValidationResult {
  readonly valid: boolean;
  readonly uniformByteSize: number;
  readonly is16ByteAligned: boolean;
  readonly hasFwidth: boolean;
  readonly hasBalancedBraces: boolean;
  readonly duplicateBindings: readonly string[];
  readonly forbiddenGlslTokens: readonly string[];
  readonly nonFiniteUniformIndices: readonly number[];
  readonly errors: readonly string[];
}

export interface CelLightingScenario {
  readonly cutId: string;
  readonly titleKo: string;
  readonly rig: StylizedMultiLightRig;
  readonly ramp: CelRampConfig;
  readonly annotations: readonly PaintedHighlightAnnotation[];
  readonly thresholds?: Partial<CelAuditThresholds>;
}

export interface CelShadingAndSpecularConsistencyResult {
  readonly waveId: 'wave163';
  readonly engineId: 'wasm64-wave163-cel-shading-band-and-specular-consistency-kernel';
  readonly cutId: string;
  readonly titleKo: string;
  readonly beforeAudit: CelCutConsistencyAudit;
  readonly afterAudit: CelCutConsistencyAudit;
  readonly harmonization: CelHarmonizationResult;
  readonly wgslBundle: CelShadingWgslBundle;
  readonly wgslValidation: CelWgslValidationResult;
  readonly manifestFingerprint: string;
  readonly auditSvg: string;
  readonly summaryKo: string;
  readonly passed: boolean;
}
