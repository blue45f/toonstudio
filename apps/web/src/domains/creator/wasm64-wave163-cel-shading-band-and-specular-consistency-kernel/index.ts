/**
 * Wasm64 Wave 163 공개 배럴 진입점 (`wasm64-wave163-cel-shading-band-and-specular-consistency-kernel`).
 *
 * - `cel-shading-types`: 다중 광원 리그, 6종 물리 준수 재질 프리셋, 2·3밴드 셀 램프, 감사/조화/WGSL 계약 타입
 * - `cel-band-and-specular-kernel`: 2·3밴드 안티앨리어싱 셀 터미네이터, OKLCH 그림자 색상 이동,
 *   유전체/금속 프레넬·Kajiya-Kay 이방성 모발 스페큘러·그레이징 림라이트 평가, 컷 일관성 감사 및 자동 조화
 * - `cel-shading-band-wgsl`: 16-byte 정렬 80-byte 유니폼 WGSL 셰이더 생성기 및 정적 검증기
 * - `cel-shading-report`: FIPS 180-4 SHA-256 결정론 지문, 순수 OKLCH 진단 SVG, 한국어 QA 요약
 */

import {
  DEFAULT_CEL_RAMP_CONFIG,
  computePerceptualShadowColor,
  directionFromSphericalDeg,
  harmonizeCutSpecularAndCelLighting,
} from './cel-band-and-specular-kernel';
import {
  computeCelLightingFingerprint,
  renderCelShadingAuditSvg,
  summarizeCelShadingAuditKo,
} from './cel-shading-report';
import {
  buildCelShadingBandWgsl,
  validateCelShadingBandWgsl,
} from './cel-shading-band-wgsl';
import {
  CEL_MATERIAL_PRESETS,
  type CelLightingScenario,
  type CelShadingAndSpecularConsistencyResult,
} from './cel-shading-types';

export {
  CEL_MATERIAL_PRESETS,
  CEL_MATERIAL_PRESET_IDS,
  type CelAnnotationAuditEntry,
  type CelAuditThresholds,
  type CelBandCount,
  type CelConsistencyDefectKind,
  type CelConsistencySeverity,
  type CelConsistencyViolation,
  type CelCutConsistencyAudit,
  type CelHarmonizationChange,
  type CelHarmonizationResult,
  type CelLightingScenario,
  type CelMaterialPresetId,
  type CelMaterialSpec,
  type CelRampConfig,
  type CelShadingAndSpecularConsistencyResult,
  type CelShadingEvaluation,
  type CelShadingWgslBinding,
  type CelShadingWgslBundle,
  type CelSurfaceSampleInput,
  type CelWgslValidationResult,
  type LightRole,
  type OklchColor,
  type PaintedHighlightAnnotation,
  type StylizedLightSource,
  type StylizedMultiLightRig,
  type Vec3,
} from './cel-shading-types';

export {
  DEFAULT_CEL_AUDIT_THRESHOLDS,
  DEFAULT_CEL_RAMP_CONFIG,
  absHueDeltaDeg,
  addVec3,
  angleBetweenVec3Deg,
  auditCutSpecularAndCelConsistency,
  blendOklch,
  clamp01,
  clampValue,
  computePerceptualLitColor,
  computePerceptualMidColor,
  computePerceptualShadowColor,
  computeSchlickFresnel,
  crossVec3,
  deriveOrthonormalTangent,
  directionFromSphericalDeg,
  dotVec3,
  evaluateStylizedCelShading,
  harmonizeCutSpecularAndCelLighting,
  lengthVec3,
  normalizeVec3,
  sanitizeOklch,
  scaleVec3,
  shortestHueDeltaDeg,
  smoothstepEdge,
  wrapHueDeg,
} from './cel-band-and-specular-kernel';

export {
  CEL_SHADING_UNIFORM_ALIGNMENT,
  CEL_SHADING_UNIFORM_BYTE_SIZE,
  CEL_SHADING_UNIFORM_FLOAT_COUNT,
  buildCelShadingBandWgsl,
  packCelShadingUniforms,
  validateCelShadingBandWgsl,
} from './cel-shading-band-wgsl';

export {
  computeCelLightingFingerprint,
  escapeSvgXml,
  formatOklchCss,
  renderCelShadingAuditSvg,
  sha256CelHex,
  summarizeCelShadingAuditKo,
  type RenderCelAuditSvgParams,
} from './cel-shading-report';

/**
 * 6종 재질(피부·직물·모발·브러시드 금속·유전체 유리·수면)과 5종의 대표 채색 결함이 포함된
 * 결정론 샘플 웹툰 컷 시나리오를 생성한다.
 */
export function createSampleCelLightingScenario(): CelLightingScenario {
  const keyDir = directionFromSphericalDeg(35, 42);
  const misalignedDir = directionFromSphericalDeg(88, 38);
  const fillDir = directionFromSphericalDeg(-120, 20);
  const rimDir = directionFromSphericalDeg(-145, 28);
  const clashingRimDir = directionFromSphericalDeg(38, 40);
  const bounceDir = directionFromSphericalDeg(15, -62);

  const rig = {
    id: 'rig-rooftop-sunset-v1',
    label: '옥상 석양 역광 4광원 리그',
    key: {
      id: 'light-key-sunset',
      role: 'key' as const,
      direction: keyDir,
      intensity: 1.15,
      color: { l: 0.92, c: 0.085, h: 68 },
    },
    fill: {
      id: 'light-fill-sky',
      role: 'fill' as const,
      direction: fillDir,
      intensity: 0.55,
      color: { l: 0.72, c: 0.08, h: 245 },
    },
    rim: {
      id: 'light-rim-backlight',
      role: 'rim' as const,
      direction: rimDir,
      intensity: 0.95,
      color: { l: 0.9, c: 0.11, h: 48 },
    },
    bounce: {
      id: 'light-bounce-concrete',
      role: 'bounce' as const,
      direction: bounceDir,
      intensity: 0.35,
      color: { l: 0.65, c: 0.045, h: 85 },
    },
    viewDirection: { x: 0, y: 0, z: 1 },
  };

  const ramp = { ...DEFAULT_CEL_RAMP_CONFIG };
  const cleanMetalShadow = computePerceptualShadowColor(
    CEL_MATERIAL_PRESETS['brushed-metal'].baseColor,
    ramp,
    rig.fill,
  );
  const cleanGlassShadow = computePerceptualShadowColor(
    CEL_MATERIAL_PRESETS['dielectric-glass'].baseColor,
    ramp,
    rig.fill,
  );
  const cleanClothShadow = computePerceptualShadowColor(
    CEL_MATERIAL_PRESETS['cloth-fabric'].baseColor,
    ramp,
    rig.fill,
  );
  const cleanWaterShadow = computePerceptualShadowColor(
    CEL_MATERIAL_PRESETS['water-surface'].baseColor,
    ramp,
    rig.fill,
  );
  const cleanHairShadow = computePerceptualShadowColor(
    CEL_MATERIAL_PRESETS['hair-anisotropic'].baseColor,
    ramp,
    rig.fill,
  );

  return {
    cutId: 'ep04-cut12-rooftop-duel',
    titleKo: '4화 12컷 옥상 결투 — 석양 역광 셀 셰이딩',
    rig,
    ramp,
    annotations: [
      {
        id: 'obj-sword-blade',
        objectName: '검신 브러시드 메탈',
        materialId: 'brushed-metal',
        surfaceNormal: { x: 0.25, y: 0.32, z: 0.91 },
        surfaceTangent: { x: 0, y: 1, z: 0 },
        baseColor: CEL_MATERIAL_PRESETS['brushed-metal'].baseColor,
        // 의도적 결함 1: 주광원 대비 ~45° 어긋난 하이라이트 방향
        paintedHighlightDirection: misalignedDir,
        paintedShadowColor: cleanMetalShadow,
      },
      {
        id: 'obj-hero-skin',
        objectName: '주인공 얼굴 피부',
        materialId: 'skin-matte',
        surfaceNormal: { x: 0.18, y: 0.24, z: 0.95 },
        baseColor: CEL_MATERIAL_PRESETS['skin-matte'].baseColor,
        paintedHighlightDirection: keyDir,
        // 의도적 결함 2: 색상 이동 없이 회색으로 탁해진 그림자
        paintedShadowColor: { l: 0.5, c: 0.015, h: 54 },
      },
      {
        id: 'obj-glasses-lens',
        objectName: '안경 유전체 렌즈',
        materialId: 'dielectric-glass',
        surfaceNormal: { x: 0.12, y: 0.18, z: 0.97 },
        baseColor: CEL_MATERIAL_PRESETS['dielectric-glass'].baseColor,
        paintedHighlightDirection: keyDir,
        paintedShadowColor: cleanGlassShadow,
        // 의도적 결함 3: 비이진 금속성 0.45 + 유전체 알베도 착색 스페큘러
        metallicOverride: 0.45,
        specularTintByAlbedoOverride: 0.55,
      },
      {
        id: 'obj-coat-fold',
        objectName: '코트 옷주름 직물',
        materialId: 'cloth-fabric',
        surfaceNormal: { x: -0.22, y: 0.15, z: 0.96 },
        baseColor: CEL_MATERIAL_PRESETS['cloth-fabric'].baseColor,
        paintedHighlightDirection: keyDir,
        paintedShadowColor: cleanClothShadow,
        // 의도적 결함 4: 페더 폭 0 (하드 밴딩 앨리어싱)
        bandFeatherWidthOverride: 0,
      },
      {
        id: 'obj-rooftop-puddle',
        objectName: '옥상 빗물 수면',
        materialId: 'water-surface',
        surfaceNormal: { x: 0.04, y: 0.94, z: 0.34 },
        baseColor: CEL_MATERIAL_PRESETS['water-surface'].baseColor,
        paintedHighlightDirection: keyDir,
        paintedShadowColor: cleanWaterShadow,
        // 의도적 결함 5: 림라이트가 주광원과 같은 방향에 겹침
        rimDirectionOverride: clashingRimDir,
      },
      {
        id: 'obj-hero-hair',
        objectName: '주인공 이방성 모발',
        materialId: 'hair-anisotropic',
        surfaceNormal: { x: 0.08, y: 0.28, z: 0.95 },
        surfaceTangent: { x: 0.05, y: 0.96, z: -0.27 },
        baseColor: CEL_MATERIAL_PRESETS['hair-anisotropic'].baseColor,
        paintedHighlightDirection: keyDir,
        paintedShadowColor: cleanHairShadow,
      },
    ],
  };
}

/**
 * `/studio` 런타임 허브 셀프체크 및 컷 조명 일관성 보정 파이프라인 진입점.
 */
export function runCelShadingAndSpecularConsistency(
  scenario: CelLightingScenario = createSampleCelLightingScenario(),
): CelShadingAndSpecularConsistencyResult {
  const harmonization = harmonizeCutSpecularAndCelLighting(scenario);
  const primaryMaterialId =
    harmonization.harmonizedAnnotations[0]?.materialId ?? 'skin-matte';
  const primaryMaterial = CEL_MATERIAL_PRESETS[primaryMaterialId];

  const wgslBundle = buildCelShadingBandWgsl(
    harmonization.harmonizedRig,
    primaryMaterial,
    harmonization.harmonizedRamp,
  );
  const wgslValidation = validateCelShadingBandWgsl(wgslBundle);

  const manifestFingerprint = computeCelLightingFingerprint(
    harmonization.harmonizedRig,
    harmonization.harmonizedRamp,
    harmonization.harmonizedAnnotations,
    wgslBundle.wgslSource,
  );

  const auditSvg = renderCelShadingAuditSvg({
    titleKo: scenario.titleKo,
    rig: harmonization.harmonizedRig,
    ramp: harmonization.harmonizedRamp,
    beforeAudit: harmonization.beforeAudit,
    afterAudit: harmonization.afterAudit,
    manifestFingerprint,
  });

  const summaryKo = summarizeCelShadingAuditKo(
    harmonization.beforeAudit,
    harmonization.afterAudit,
    harmonization.changes,
    wgslValidation,
  );

  return {
    waveId: 'wave163',
    engineId: 'wasm64-wave163-cel-shading-band-and-specular-consistency-kernel',
    cutId: scenario.cutId,
    titleKo: scenario.titleKo,
    beforeAudit: harmonization.beforeAudit,
    afterAudit: harmonization.afterAudit,
    harmonization,
    wgslBundle,
    wgslValidation,
    manifestFingerprint,
    auditSvg,
    summaryKo,
    passed: harmonization.afterAudit.passed && wgslValidation.valid,
  };
}
