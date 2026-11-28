/**
 * Wave 163: 카툰 2·3밴드 셀-셰이딩 경계 스무딩, 다중 광원 스페큘러·프레넬 림라이트 평가,
 * 컷 단위 일관성 감사 및 자동 조명 조화(Harmonization) 결정론 커널.
 */

import {
  absHueDeltaDeg,
  addVec3,
  angleBetweenVec3Deg,
  blendOklch,
  buildEffectiveCelRamp,
  clamp01,
  clampValue,
  computePerceptualLitColor,
  computePerceptualMidColor,
  computePerceptualShadowColor,
  computeSchlickFresnel,
  createEmptyDefectCounts,
  deriveOrthonormalTangent,
  dotVec3,
  normalizeVec3,
  resolveCelAuditThresholds,
  sanitizeOklch,
  scaleVec3,
  smoothstepEdge,
  wrapHueDeg,
} from './cel-math-and-color';
import {
  CEL_MATERIAL_PRESETS,
  type CelAnnotationAuditEntry,
  type CelConsistencyDefectKind,
  type CelConsistencyViolation,
  type CelCutConsistencyAudit,
  type CelHarmonizationChange,
  type CelHarmonizationResult,
  type CelLightingScenario,
  type CelMaterialSpec,
  type CelRampConfig,
  type CelShadingEvaluation,
  type CelSurfaceSampleInput,
  type OklchColor,
  type PaintedHighlightAnnotation,
  type StylizedMultiLightRig,
  type Vec3,
} from './cel-shading-types';

export * from './cel-math-and-color';

const DEFAULT_SAFE_FEATHER = 0.045;

/**
 * 2-밴드 및 3-밴드 카툰 셀 램프, 재질 물리(유전체/금속/이방성 모발),
 * Kajiya-Kay 시프트 탄젠트 하이라이트, 프레넬 림라이트를 통합 평가한다.
 */
export function evaluateStylizedCelShading(
  rig: StylizedMultiLightRig,
  material: CelMaterialSpec,
  ramp: CelRampConfig,
  sample: CelSurfaceSampleInput,
): CelShadingEvaluation {
  const n = normalizeVec3(sample.normal);
  const lKey = normalizeVec3(rig.key.direction);
  const v = normalizeVec3(sample.viewDirection ?? rig.viewDirection);
  const hVec = normalizeVec3(addVec3(lKey, v), n);

  const ndotl = clampValue(dotVec3(n, lKey), -1, 1);
  const ndotv = clamp01(dotVec3(n, v));
  const ndoth = clamp01(dotVec3(n, hVec));
  const vdoth = clamp01(dotVec3(v, hVec));

  const ao = clamp01(sample.ambientOcclusion ?? 1);
  const shadowMask = clamp01(sample.shadowMask ?? 1);
  const signal = (ndotl * 0.5 + 0.5) * shadowMask * (0.35 + 0.65 * ao) * 2 - 1;

  const feather = Math.max(0, Number.isFinite(ramp.bandFeatherWidth) ? ramp.bandFeatherWidth : 0);
  const terminator = clampValue(ramp.terminatorThreshold, -0.6, 0.7);
  const safeMidThreshold = Math.min(clampValue(ramp.midBandThreshold, -0.9, 0.5), terminator - 0.04);

  let litWeight: number;
  let midWeight: number;
  let shadowWeight: number;
  if (ramp.bandCount === 2) {
    litWeight = smoothstepEdge(terminator - feather, terminator + feather, signal);
    midWeight = 0;
    shadowWeight = 1 - litWeight;
  } else {
    const upper = smoothstepEdge(terminator - feather, terminator + feather, signal);
    const mid = smoothstepEdge(safeMidThreshold - feather, safeMidThreshold + feather, signal);
    const rawMid = Math.max(0, mid - upper);
    const rawShadow = Math.max(0, 1 - mid);
    const sum = upper + rawMid + rawShadow;
    litWeight = sum > 1e-8 ? upper / sum : 0;
    midWeight = sum > 1e-8 ? rawMid / sum : 0;
    shadowWeight = sum > 1e-8 ? rawShadow / sum : 1;
  }

  const baseColor = sanitizeOklch(sample.baseColor ?? material.baseColor);
  const shadowColor = computePerceptualShadowColor(baseColor, ramp, rig.fill);
  const midColor = computePerceptualMidColor(baseColor, shadowColor, ramp);
  const litColor = computePerceptualLitColor(baseColor, rig.key, ramp);

  const diffuseColor =
    ramp.bandCount === 2
      ? blendOklch(shadowColor, litColor, litWeight)
      : blendOklch(
          blendOklch(
            shadowColor,
            midColor,
            shadowWeight + midWeight > 1e-6 ? midWeight / (shadowWeight + midWeight) : 1,
          ),
          litColor,
          litWeight,
        );
  const bandLuminance =
    shadowWeight * shadowColor.l + midWeight * midColor.l + litWeight * litColor.l;

  const fillContribution =
    (rig.fill.enabled ?? true)
      ? clamp01(dotVec3(n, normalizeVec3(rig.fill.direction)) * 0.5 + 0.5) *
        clampValue(rig.fill.intensity, 0, 2) *
        0.1 *
        (shadowWeight + midWeight * 0.4)
      : 0;
  const bounceContribution =
    (rig.bounce.enabled ?? true)
      ? clamp01(dotVec3(n, normalizeVec3(rig.bounce.direction))) *
        clampValue(rig.bounce.intensity, 0, 2) *
        0.08 *
        shadowWeight
      : 0;

  // 프레넬 및 스페큘러 (유전체 vs 금속 및 이방성 Kajiya-Kay)
  const fresnelTerm = computeSchlickFresnel(material.fresnelF0, vdoth);
  const roughness = clampValue(material.roughness, 0.04, 1.0);
  const litGate = smoothstepEdge(-0.18, 0.14, ndotl) * shadowMask;
  const specFeather = Math.max(0.005, material.specularFeather);
  const keyPower = clampValue(rig.key.intensity, 0, 2);
  const specWeight = clampValue(material.specularIntensity, 0, 2);

  const rawIsoLobe = Math.pow(ndoth, 4 + (1 - roughness) * 48);
  const isoBand = smoothstepEdge(
    material.specularCutoff - specFeather,
    material.specularCutoff + specFeather,
    rawIsoLobe,
  );
  const isotropicSpecular = isoBand * specWeight * (0.45 + 0.55 * fresnelTerm) * litGate * keyPower;

  let anisotropicSpecular = 0;
  if (Math.abs(material.anisotropicShift) > 1e-4) {
    const tangent = deriveOrthonormalTangent(n, sample.tangent);
    const shiftedT1 = normalizeVec3(addVec3(tangent, scaleVec3(n, material.anisotropicShift)));
    const dotT1H = clampValue(dotVec3(shiftedT1, hVec), -1, 1);
    const primaryRing = Math.pow(Math.sqrt(Math.max(0, 1 - dotT1H * dotT1H)), 16 + (1 - roughness) * 40);

    let secondaryRing = 0;
    if (Math.abs(material.anisotropicSecondaryShift) > 1e-4) {
      const shiftedT2 = normalizeVec3(
        addVec3(tangent, scaleVec3(n, material.anisotropicSecondaryShift)),
      );
      const dotT2H = clampValue(dotVec3(shiftedT2, hVec), -1, 1);
      secondaryRing =
        Math.pow(Math.sqrt(Math.max(0, 1 - dotT2H * dotT2H)), 9 + (1 - roughness) * 18) * 0.42;
    }

    const anisoBand = smoothstepEdge(
      material.specularCutoff - specFeather,
      material.specularCutoff + specFeather,
      clamp01(primaryRing + secondaryRing),
    );
    anisotropicSpecular = anisoBand * specWeight * (0.5 + 0.5 * fresnelTerm) * litGate * keyPower;
  }

  const specularStrength =
    material.id === 'hair-anisotropic'
      ? anisotropicSpecular
      : Math.abs(material.anisotropicShift) > 1e-4
        ? isotropicSpecular * 0.65 + anisotropicSpecular * 0.35
        : isotropicSpecular;

  const specularColor = blendOklch(
    {
      l: clampValue(Math.max(0.92, rig.key.color.l), 0.85, 0.99),
      c: clampValue(rig.key.color.c * 0.35, 0, 0.1),
      h: wrapHueDeg(rig.key.color.h),
    },
    {
      l: clampValue(Math.max(0.84, baseColor.l + 0.14), 0.65, 0.98),
      c: clampValue(Math.max(baseColor.c * 0.95, 0.04), 0, 0.32),
      h: baseColor.h,
    },
    clamp01(material.metallic * material.specularTintByAlbedo),
  );

  // 프레넬 그레이징 림라이트: pow(1 - max(N·V, 0), rimPower)
  const rimStrength =
    (rig.rim.enabled ?? true)
      ? clampValue(
          Math.pow(1 - ndotv, Math.max(0.5, material.rimPower)) *
            smoothstepEdge(-0.35, 0.35, dotVec3(n, normalizeVec3(rig.rim.direction))) *
            clampValue(rig.rim.intensity, 0, 2) *
            clampValue(material.rimResponsiveness, 0, 2),
          0,
          1.5,
        )
      : 0;
  const rimColor: OklchColor = {
    l: clampValue(Math.max(0.8, rig.rim.color.l), 0.72, 0.99),
    c: clampValue(rig.rim.color.c * 0.92, 0, 0.3),
    h: wrapHueDeg(rig.rim.color.h),
  };

  const liftedDiffuse: OklchColor = {
    l: clamp01(bandLuminance + fillContribution + bounceContribution),
    c: diffuseColor.c,
    h: diffuseColor.h,
  };
  const withSpec = blendOklch(liftedDiffuse, specularColor, clampValue(specularStrength * 0.55, 0, 0.85));
  const withRim = blendOklch(withSpec, rimColor, clampValue(rimStrength * 0.45, 0, 0.72));
  const finalColor: OklchColor = {
    l: clamp01(Math.max(liftedDiffuse.l, withRim.l + specularStrength * 0.12 + rimStrength * 0.08)),
    c: withRim.c,
    h: withRim.h,
  };

  return {
    bandCount: ramp.bandCount,
    ndotl,
    ndotv,
    litWeight,
    midWeight,
    shadowWeight,
    bandLuminance,
    shadowColor,
    midColor,
    litColor,
    diffuseColor: liftedDiffuse,
    fresnelTerm,
    isotropicSpecular,
    anisotropicSpecular,
    specularStrength,
    specularColor,
    rimStrength,
    rimColor,
    fillContribution,
    bounceContribution,
    finalColor,
    finalLuminance: finalColor.l,
  };
}

/**
 * 컷 내 오브젝트별 하이라이트 방향, 그림자 탁도, 유전체/금속 이진 규율,
 * 림-키 광원 충돌, 셀 밴드 앨리어싱 여부를 전수 감사한다.
 */
export function auditCutSpecularAndCelConsistency(
  scenario: CelLightingScenario,
): CelCutConsistencyAudit {
  const thresholds = resolveCelAuditThresholds(scenario.thresholds);
  const keyDir = normalizeVec3(scenario.rig.key.direction);
  const defectCounts = createEmptyDefectCounts();
  const violations: CelConsistencyViolation[] = [];
  const evaluations: CelAnnotationAuditEntry[] = [];

  let maxSpecularDeviationDeg = 0;
  let totalSpecularDeviationDeg = 0;

  for (const annotation of scenario.annotations) {
    const preset = CEL_MATERIAL_PRESETS[annotation.materialId];
    const effectiveRamp = buildEffectiveCelRamp(scenario.ramp, annotation);
    const effectiveMetallic = annotation.metallicOverride ?? preset.metallic;
    const effectiveTintByAlbedo =
      annotation.specularTintByAlbedoOverride ?? preset.specularTintByAlbedo;
    const effectiveFeather = effectiveRamp.bandFeatherWidth;
    const effectiveRimDir = normalizeVec3(
      annotation.rimDirectionOverride ?? scenario.rig.rim.direction,
    );
    const effectiveRimIntensity = annotation.rimIntensityOverride ?? scenario.rig.rim.intensity;

    const shading = evaluateStylizedCelShading(
      {
        ...scenario.rig,
        rim: { ...scenario.rig.rim, direction: effectiveRimDir, intensity: effectiveRimIntensity },
      },
      {
        ...preset,
        metallic: effectiveMetallic,
        specularTintByAlbedo: effectiveTintByAlbedo,
        baseColor: annotation.baseColor,
      },
      effectiveRamp,
      {
        normal: annotation.surfaceNormal,
        tangent: annotation.surfaceTangent,
        viewDirection: annotation.viewDirection,
        baseColor: annotation.baseColor,
      },
    );

    const specularDeviationDeg = angleBetweenVec3Deg(annotation.paintedHighlightDirection, keyDir);
    maxSpecularDeviationDeg = Math.max(maxSpecularDeviationDeg, specularDeviationDeg);
    totalSpecularDeviationDeg += specularDeviationDeg;

    const baseSan = sanitizeOklch(annotation.baseColor);
    const shadowSan = sanitizeOklch(annotation.paintedShadowColor);
    const shadowChromaRatio = baseSan.c > 0.005 ? shadowSan.c / baseSan.c : 1.0;
    const shadowHueDeltaDeg = absHueDeltaDeg(baseSan.h, shadowSan.h);

    evaluations.push({
      annotationId: annotation.id,
      objectName: annotation.objectName,
      materialId: annotation.materialId,
      specularDeviationDeg,
      shadowChromaRatio,
      shadowHueDeltaDeg,
      effectiveMetallic,
      effectiveFeatherWidth: effectiveFeather,
      shading,
    });

    if (specularDeviationDeg > thresholds.maxSpecularAngleDeltaDeg) {
      defectCounts['specular-direction-mismatch'] += 1;
      violations.push({
        id: `${annotation.id}:specular-direction-mismatch`,
        annotationId: annotation.id,
        objectName: annotation.objectName,
        materialId: annotation.materialId,
        kind: 'specular-direction-mismatch',
        severity: specularDeviationDeg > 35 ? 'error' : 'warning',
        measuredValue: Number(specularDeviationDeg.toFixed(2)),
        thresholdValue: thresholds.maxSpecularAngleDeltaDeg,
        unit: 'deg',
        messageKo: `${annotation.objectName} 하이라이트 방향이 컷 주광원과 ${specularDeviationDeg.toFixed(1)}도 어긋납니다.`,
        remedyKo: '주광원 방향 벡터에 맞춰 스페큘러 하이라이트 위치를 재정렬하세요.',
      });
    }

    const isMuddyShadow =
      baseSan.c >= 0.03 &&
      ((shadowChromaRatio < thresholds.minShadowChromaRatio &&
        shadowHueDeltaDeg < thresholds.minShadowHueShiftDeg) ||
        shadowChromaRatio < 0.45);
    if (isMuddyShadow) {
      defectCounts['muddy-desaturated-shadow'] += 1;
      violations.push({
        id: `${annotation.id}:muddy-desaturated-shadow`,
        annotationId: annotation.id,
        objectName: annotation.objectName,
        materialId: annotation.materialId,
        kind: 'muddy-desaturated-shadow',
        severity: shadowChromaRatio < 0.5 ? 'error' : 'warning',
        measuredValue: Number(shadowChromaRatio.toFixed(3)),
        thresholdValue: thresholds.minShadowChromaRatio,
        unit: 'ratio',
        messageKo: `${annotation.objectName} 그림자가 색상 이동(${shadowHueDeltaDeg.toFixed(1)}도) 없이 채도 ${(shadowChromaRatio * 100).toFixed(0)}%로 탁해졌습니다.`,
        remedyKo: 'OKLCH 기준 그림자 채도를 보존하고 한색·보색 쪽으로 색상을 이동하세요.',
      });
    }

    const isNonBinaryMetallic =
      !Number.isFinite(effectiveMetallic) ||
      (effectiveMetallic > 0.001 && effectiveMetallic < 0.999);
    const dielectricHasMetallic = !preset.isMetal && effectiveMetallic > 0.001;
    const metalMissingMetallic = preset.isMetal && effectiveMetallic < 0.999;
    const dielectricColoredSpec =
      !preset.isMetal && effectiveTintByAlbedo > thresholds.maxDielectricTintByAlbedo;

    if (
      isNonBinaryMetallic ||
      dielectricHasMetallic ||
      metalMissingMetallic ||
      dielectricColoredSpec
    ) {
      defectCounts['dielectric-metallic-violation'] += 1;
      const measured =
        dielectricColoredSpec && !isNonBinaryMetallic && !dielectricHasMetallic
          ? effectiveTintByAlbedo
          : effectiveMetallic;
      violations.push({
        id: `${annotation.id}:dielectric-metallic-violation`,
        annotationId: annotation.id,
        objectName: annotation.objectName,
        materialId: annotation.materialId,
        kind: 'dielectric-metallic-violation',
        severity: 'error',
        measuredValue: Number(measured.toFixed(3)),
        thresholdValue: preset.isMetal ? 1.0 : 0.0,
        unit: 'metallic',
        messageKo: preset.isMetal
          ? `${annotation.objectName}(금속)의 금속성 값이 ${effectiveMetallic.toFixed(2)}로 1.0 규율을 벗어납니다.`
          : `${annotation.objectName}(${preset.labelKo})에 비물리 금속성(${effectiveMetallic.toFixed(2)}) 또는 알베도 착색 반사(${effectiveTintByAlbedo.toFixed(2)})가 섞였습니다.`,
        remedyKo: preset.isMetal
          ? '금속 재질은 metallic=1.0, 알베도 틴트 반사로 고정하세요.'
          : '유전체 재질은 metallic=0.0, 광원색 기반 프레넬 반사(F0 0.02~0.05)로 고정하세요.',
      });
    }

    const rimKeyDot = dotVec3(effectiveRimDir, keyDir);
    if (effectiveRimIntensity > 0.05 && rimKeyDot > thresholds.maxRimKeyAlignmentDot) {
      defectCounts['rim-key-occlusion-clash'] += 1;
      violations.push({
        id: `${annotation.id}:rim-key-occlusion-clash`,
        annotationId: annotation.id,
        objectName: annotation.objectName,
        materialId: annotation.materialId,
        kind: 'rim-key-occlusion-clash',
        severity: 'warning',
        measuredValue: Number(rimKeyDot.toFixed(3)),
        thresholdValue: thresholds.maxRimKeyAlignmentDot,
        unit: 'dot',
        messageKo: `${annotation.objectName} 림라이트가 주광원과 같은 쪽(내적 ${rimKeyDot.toFixed(2)})에 겹쳐 실루엣 분리가 무너집니다.`,
        remedyKo: '림라이트를 주광원의 반대 측후방 역광 각도로 배치하세요.',
      });
    }

    if (!Number.isFinite(effectiveFeather) || effectiveFeather < thresholds.minBandFeatherWidth) {
      defectCounts['hard-banding-aliasing'] += 1;
      const safeVal = Number.isFinite(effectiveFeather) ? effectiveFeather : 0;
      violations.push({
        id: `${annotation.id}:hard-banding-aliasing`,
        annotationId: annotation.id,
        objectName: annotation.objectName,
        materialId: annotation.materialId,
        kind: 'hard-banding-aliasing',
        severity: safeVal <= 0.001 ? 'error' : 'warning',
        measuredValue: Number(safeVal.toFixed(4)),
        thresholdValue: thresholds.minBandFeatherWidth,
        unit: 'feather',
        messageKo: `${annotation.objectName} 셀 경계 페더 폭이 ${safeVal.toFixed(4)}로 계단 현상이 발생합니다.`,
        remedyKo: `셀 밴드 경계에 최소 ${thresholds.minBandFeatherWidth} 이상의 안티앨리어싱 페더를 적용하세요.`,
      });
    }
  }

  let errorCount = 0;
  let warningCount = 0;
  for (const v of violations) {
    if (v.severity === 'error') {
      errorCount += 1;
    } else {
      warningCount += 1;
    }
  }

  const passed = violations.length === 0;
  return {
    cutId: scenario.cutId,
    rigId: scenario.rig.id,
    evaluatedCount: scenario.annotations.length,
    passed,
    status: passed ? 'PASS' : errorCount > 0 ? 'FAIL' : 'WARN',
    consistencyScore: clampValue(Math.round(100 - errorCount * 20 - warningCount * 10), 0, 100),
    maxSpecularDeviationDeg: Number(maxSpecularDeviationDeg.toFixed(2)),
    averageSpecularDeviationDeg: Number(
      (scenario.annotations.length > 0 ? totalSpecularDeviationDeg / scenario.annotations.length : 0).toFixed(2),
    ),
    defectCounts,
    violations,
    evaluations,
  };
}

function computeOpposingRimDirection(keyDirection: Vec3): Vec3 {
  const k = normalizeVec3(keyDirection);
  return normalizeVec3({
    x: -k.x,
    y: clampValue(Math.max(0.28, Math.abs(k.y) * 0.7), 0.25, 0.72),
    z: -k.z - (Math.abs(k.z) < 0.2 ? 0.55 : 0),
  });
}

/**
 * 주광원의 연출 의도를 그대로 유지하면서 컷 내 모든 스페큘러·그림자·금속성·림·밴딩 결함을
 * 0건으로 자동 조화(Harmonize)한다.
 */
export function harmonizeCutSpecularAndCelLighting(
  scenario: CelLightingScenario,
): CelHarmonizationResult {
  const thresholds = resolveCelAuditThresholds(scenario.thresholds);
  const beforeAudit = auditCutSpecularAndCelConsistency(scenario);
  const changes: CelHarmonizationChange[] = [];

  const normalizedKeyDir = normalizeVec3(scenario.rig.key.direction);
  const rawRimDir = normalizeVec3(scenario.rig.rim.direction);
  const safeRimDir =
    dotVec3(rawRimDir, normalizedKeyDir) > thresholds.maxRimKeyAlignmentDot
      ? computeOpposingRimDirection(normalizedKeyDir)
      : rawRimDir;

  const harmonizedRig: StylizedMultiLightRig = {
    ...scenario.rig,
    key: { ...scenario.rig.key, direction: normalizedKeyDir },
    fill: { ...scenario.rig.fill, direction: normalizeVec3(scenario.rig.fill.direction) },
    rim: { ...scenario.rig.rim, direction: safeRimDir },
    bounce: { ...scenario.rig.bounce, direction: normalizeVec3(scenario.rig.bounce.direction) },
    viewDirection: normalizeVec3(scenario.rig.viewDirection),
  };

  const safeGlobalFeather =
    Number.isFinite(scenario.ramp.bandFeatherWidth) &&
    scenario.ramp.bandFeatherWidth >= thresholds.minBandFeatherWidth
      ? scenario.ramp.bandFeatherWidth
      : Math.max(DEFAULT_SAFE_FEATHER, thresholds.minBandFeatherWidth * 2);
  const safeShadowHueShift =
    Math.abs(scenario.ramp.shadowHueShiftDeg) >= thresholds.minShadowHueShiftDeg
      ? scenario.ramp.shadowHueShiftDeg
      : (scenario.ramp.shadowHueShiftDeg < 0 ? -1 : 1) *
        Math.max(18, thresholds.minShadowHueShiftDeg + 6);

  const harmonizedRamp: CelRampConfig = {
    ...scenario.ramp,
    bandFeatherWidth: safeGlobalFeather,
    shadowHueShiftDeg: safeShadowHueShift,
    shadowChromaPreserveRatio: Math.max(
      scenario.ramp.shadowChromaPreserveRatio,
      thresholds.minShadowChromaRatio + 0.16,
    ),
  };

  const violationsByAnnotation = new Map<string, Set<CelConsistencyDefectKind>>();
  for (const violation of beforeAudit.violations) {
    const existing = violationsByAnnotation.get(violation.annotationId);
    if (existing) {
      existing.add(violation.kind);
    } else {
      violationsByAnnotation.set(violation.annotationId, new Set([violation.kind]));
    }
  }

  const harmonizedAnnotations: PaintedHighlightAnnotation[] = scenario.annotations.map((item) => {
    const kinds = violationsByAnnotation.get(item.id);
    if (!kinds || kinds.size === 0) {
      return item;
    }

    const preset = CEL_MATERIAL_PRESETS[item.materialId];
    let nextHighlightDir = item.paintedHighlightDirection;
    let nextShadowColor = item.paintedShadowColor;
    let nextMetallic = item.metallicOverride;
    let nextTint = item.specularTintByAlbedoOverride;
    let nextFeather = item.bandFeatherWidthOverride;
    let nextRimDir = item.rimDirectionOverride;
    let nextRampOverride = item.celRampOverride;

    if (kinds.has('specular-direction-mismatch')) {
      const prevAngle = angleBetweenVec3Deg(item.paintedHighlightDirection, normalizedKeyDir);
      nextHighlightDir = normalizedKeyDir;
      changes.push({
        annotationId: item.id,
        objectName: item.objectName,
        kind: 'specular-direction-mismatch',
        beforeSummary: `주광원 편차 ${prevAngle.toFixed(1)}도`,
        afterSummary: '주광원 방향과 0.0도 정렬',
      });
    }

    if (kinds.has('muddy-desaturated-shadow')) {
      const localRamp = buildEffectiveCelRamp(harmonizedRamp, item);
      const repaired = computePerceptualShadowColor(
        item.baseColor,
        {
          ...localRamp,
          shadowHueShiftDeg:
            Math.abs(localRamp.shadowHueShiftDeg) >= thresholds.minShadowHueShiftDeg
              ? localRamp.shadowHueShiftDeg
              : harmonizedRamp.shadowHueShiftDeg,
          shadowChromaPreserveRatio: Math.max(
            localRamp.shadowChromaPreserveRatio,
            thresholds.minShadowChromaRatio + 0.16,
          ),
        },
        harmonizedRig.fill,
      );
      changes.push({
        annotationId: item.id,
        objectName: item.objectName,
        kind: 'muddy-desaturated-shadow',
        beforeSummary: `그림자 C=${item.paintedShadowColor.c.toFixed(3)}, H=${wrapHueDeg(item.paintedShadowColor.h).toFixed(0)}도`,
        afterSummary: `그림자 C=${repaired.c.toFixed(3)}, H=${repaired.h.toFixed(0)}도`,
      });
      nextShadowColor = repaired;
    }

    if (kinds.has('dielectric-metallic-violation')) {
      const target = preset.isMetal ? 1.0 : 0.0;
      changes.push({
        annotationId: item.id,
        objectName: item.objectName,
        kind: 'dielectric-metallic-violation',
        beforeSummary: `metallic=${(item.metallicOverride ?? preset.metallic).toFixed(2)}, tint=${(item.specularTintByAlbedoOverride ?? preset.specularTintByAlbedo).toFixed(2)}`,
        afterSummary: `metallic=${target.toFixed(1)}, tint=${target.toFixed(1)}`,
      });
      nextMetallic = target;
      nextTint = target;
    }

    if (kinds.has('rim-key-occlusion-clash')) {
      const prevDot = dotVec3(
        normalizeVec3(item.rimDirectionOverride ?? scenario.rig.rim.direction),
        normalizedKeyDir,
      );
      changes.push({
        annotationId: item.id,
        objectName: item.objectName,
        kind: 'rim-key-occlusion-clash',
        beforeSummary: `림-키 내적 ${prevDot.toFixed(2)}`,
        afterSummary: `역광 분리 내적 ${dotVec3(safeRimDir, normalizedKeyDir).toFixed(2)}`,
      });
      nextRimDir = safeRimDir;
    }

    if (kinds.has('hard-banding-aliasing')) {
      const prevF =
        item.bandFeatherWidthOverride ??
        item.celRampOverride?.bandFeatherWidth ??
        scenario.ramp.bandFeatherWidth;
      const safeF = Math.max(harmonizedRamp.bandFeatherWidth, DEFAULT_SAFE_FEATHER);
      changes.push({
        annotationId: item.id,
        objectName: item.objectName,
        kind: 'hard-banding-aliasing',
        beforeSummary: `페더 폭 ${(Number.isFinite(prevF) ? prevF : 0).toFixed(4)}`,
        afterSummary: `안티앨리어싱 페더 ${safeF.toFixed(3)}`,
      });
      nextFeather = safeF;
      if (nextRampOverride && nextRampOverride.bandFeatherWidth !== undefined) {
        nextRampOverride = { ...nextRampOverride, bandFeatherWidth: safeF };
      }
    }

    return {
      ...item,
      paintedHighlightDirection: nextHighlightDir,
      paintedShadowColor: nextShadowColor,
      metallicOverride: nextMetallic,
      specularTintByAlbedoOverride: nextTint,
      bandFeatherWidthOverride: nextFeather,
      rimDirectionOverride: nextRimDir,
      celRampOverride: nextRampOverride,
    };
  });

  const afterAudit = auditCutSpecularAndCelConsistency({
    ...scenario,
    rig: harmonizedRig,
    ramp: harmonizedRamp,
    annotations: harmonizedAnnotations,
  });

  return {
    cutId: scenario.cutId,
    harmonizedRig,
    harmonizedRamp,
    harmonizedAnnotations,
    changes,
    beforeAudit,
    afterAudit,
  };
}
