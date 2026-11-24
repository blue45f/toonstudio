/**
 * 3D 캐릭터 헤어·의상·소품 원본 VRM 재질 DNA 자동 상속(Auto-Shader Transfer) 엔진.
 *
 * - 원본 VRM의 실제 RGBA8 텍스처 픽셀과 MToon 속성(피부·원본 헤어·의상 주조 OKLCH 색감,
 *   그림자 색온도 틴트, 셀 경계, 외곽선 두께·색, 림라이트 프레넬, 엔젤링 강도, 주광 방향)을
 *   자동 추출해 `VrmMaterialDnaProfile`을 생성한다.
 * - 교체되는 헤어·모자·안경·의상·소품 파츠의 원시 재질에 이 DNA를 자동 이식(`transferVrmShaderDnaToPart`)해
 *   이식 전/후 CIEDE2000 ΔE00 개선 수치·동일 셀 경계·동일 외곽선 두께·광원 방향 일치를 실측 보장한다.
 * - Three.js / @pixiv/three-vrm 런타임 객체와 순수 데이터 모두 구조적 타입으로 지원해
 *   GPU/WebGL 없이 100% 결정적으로 동작한다.
 */

import {
  blendOklabRgb,
  clamp,
  computeCiede2000Rgb,
  estimateColorTemperatureKelvin,
  lerpHueDeg,
  normalizeHueDeg,
  oklchToSrgbGamutSafe,
  roundTo,
  sampleDominantOklchFromTexture,
  shortestHueDeltaDeg,
  srgbToOklch,
  srgbToRelativeLuminance,
  type OklchColor,
  type Rgb01,
  type VrmTextureBuffer,
} from "./color-science-oklch";
import {
  anglesToDirectionVec3,
  directionVec3ToAngles,
  dotVec3,
  generateDepthSlicesAndRelightingMap,
  normalizeVec3,
  synthesizeVrmPortraitDepthScene,
  type DepthAndRelightingCompositeResult,
  type DepthSceneFrameInput,
  type DepthSliceConfig,
  type ThreePointRelightingConfig,
  type Vec3,
} from "./depth-relighting-compositor";
import type {
  DnaColorSample,
  PerceptualChannelDeltaE00,
  ShaderDnaTransferOptions,
  ShaderHarmonyGrade,
  ShadowTemperatureClass,
  ThreeColorLike,
  TransferredVrmPartMaterial,
  VrmBatchShaderTransferReport,
  VrmCharacterDnaSource,
  VrmMaterialDnaProfile,
  VrmMaterialSlotRole,
  VrmOutlineWidthMode,
  VrmPartShaderTransferResult,
  VrmRawPartMaterialInput,
  VrmReplacementPartKind,
  VrmRuntimeLike,
  VrmSceneMaterialLike,
  VrmSceneObjectLike,
  VrmSourceMaterialSlot,
} from "./vrm-auto-shader-types";

export * from "./color-science-oklch";
export * from "./depth-relighting-compositor";
export * from "./vrm-auto-shader-types";
export * from "./vrm-dna-presets";

function median(values: readonly number[], fallback: number): number {
  if (values.length === 0) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? fallback;
}

function meanRgb(colors: readonly Rgb01[], fallback: Rgb01): Rgb01 {
  if (colors.length === 0) return fallback;
  let r = 0;
  let g = 0;
  let b = 0;
  for (const c of colors) {
    r += clamp(c.r, 0, 1);
    g += clamp(c.g, 0, 1);
    b += clamp(c.b, 0, 1);
  }
  return { r: r / colors.length, g: g / colors.length, b: b / colors.length };
}

function resolveSlotColor(slot: VrmSourceMaterialSlot): DnaColorSample {
  if (slot.baseTexture) {
    const sampled = sampleDominantOklchFromTexture(slot.baseTexture, slot.baseColor);
    return {
      oklch: sampled.oklch,
      rgb: sampled.rgb,
      sampledPixels: sampled.sampledPixels,
    };
  }
  return {
    oklch: srgbToOklch(slot.baseColor),
    rgb: slot.baseColor,
    sampledPixels: 0,
  };
}

function pickRoleSample(
  slots: readonly VrmSourceMaterialSlot[],
  role: VrmMaterialSlotRole,
  fallbackRgb: Rgb01,
): DnaColorSample {
  const matched = slots.filter((s) => s.role === role);
  if (matched.length === 0) {
    return { oklch: srgbToOklch(fallbackRgb), rgb: fallbackRgb, sampledPixels: 0 };
  }
  let totalPixels = 0;
  const rgbs: Rgb01[] = [];
  for (const slot of matched) {
    const sample = resolveSlotColor(slot);
    totalPixels += sample.sampledPixels;
    rgbs.push(sample.rgb);
  }
  const averaged = meanRgb(rgbs, fallbackRgb);
  return {
    oklch: srgbToOklch(averaged),
    rgb: averaged,
    sampledPixels: totalPixels,
  };
}

function classifyShadowTemperature(kelvin: number): ShadowTemperatureClass {
  if (kelvin >= 7100) return "cool";
  if (kelvin <= 5400) return "warm";
  return "neutral";
}

function classifySlotRoleFromName(name: string): VrmMaterialSlotRole {
  const lower = name.toLowerCase();
  if (/skin|face|body|head|cheek|hand/u.test(lower)) return "skin";
  if (/hair|bang|ponytail|braid|ahoge/u.test(lower)) return "hair";
  if (/eye|iris|cornea|lash/u.test(lower)) return "eye";
  if (/cloth|top|bottom|dress|uniform|jacket|shirt|skirt|outfit|shoe|coat|cardigan/u.test(lower)) return "outfit";
  if (/hat|glass|bag|ribbon|acc|prop/u.test(lower)) return "accessory";
  return "other";
}

function readColorLike(color: ThreeColorLike | undefined, fallback: Rgb01): Rgb01 {
  if (!color || !Number.isFinite(color.r) || !Number.isFinite(color.g) || !Number.isFinite(color.b)) {
    return fallback;
  }
  return {
    r: clamp(color.r, 0, 1),
    g: clamp(color.g, 0, 1),
    b: clamp(color.b, 0, 1),
  };
}

/**
 * 원본 VRM 캐릭터의 텍스처 픽셀과 MToon 재질 슬롯에서 `VrmMaterialDnaProfile`을 자동 추출한다.
 */
export function extractVrmMaterialDna(source: VrmCharacterDnaSource): VrmMaterialDnaProfile {
  const slots = source.materials;
  const skinSample = pickRoleSample(slots, "skin", { r: 0.94, g: 0.83, b: 0.76 });
  const hairSample = pickRoleSample(slots, "hair", { r: 0.32, g: 0.33, b: 0.52 });
  const outfitSample = pickRoleSample(slots, "outfit", { r: 0.84, g: 0.8, b: 0.74 });

  const allSamples = [skinSample, hairSample, outfitSample];
  const chromas = allSamples.map((s) => s.oklch.c);
  const lightnesses = allSamples.map((s) => s.oklch.l);
  const meanChroma = chromas.reduce((acc, v) => acc + v, 0) / chromas.length;
  const maxSampleChroma = Math.max(...chromas);
  const chromaCap = roundTo(clamp(Math.max(maxSampleChroma * 1.18, meanChroma * 1.35, 0.095), 0.09, 0.19), 4);
  const lightnessFloor = roundTo(clamp(Math.min(...lightnesses) * 0.58, 0.16, 0.34), 4);
  const lightnessCeiling = roundTo(clamp(Math.max(...lightnesses, 0.82) * 1.04, 0.84, 0.96), 4);

  const toonyValues: number[] = [];
  const shiftValues: number[] = [];
  const giValues: number[] = [];
  const worldOutlineWidths: number[] = [];
  const screenOutlineWidths: number[] = [];
  const outlineMixValues: number[] = [];
  const outlineColors: Rgb01[] = [];
  const rimColors: Rgb01[] = [];
  const rimMixValues: number[] = [];
  const rimPowerValues: number[] = [];
  const rimLiftValues: number[] = [];
  const angelRingIntensities: number[] = [];
  const angelRingSharpnesses: number[] = [];
  const angelRingTints: Rgb01[] = [];
  const shadowHueShifts: number[] = [];
  const shadowLightnessDrops: number[] = [];
  const shadowDarknessRatios: number[] = [];
  const shadowTintRatios: Rgb01[] = [];

  let mtoonCount = 0;
  let totalSampledPixels = 0;

  for (const slot of slots) {
    const resolved = resolveSlotColor(slot);
    totalSampledPixels += resolved.sampledPixels;
    if (slot.isMToon !== false) mtoonCount += 1;

    if (typeof slot.shadingToonyFactor === "number" && Number.isFinite(slot.shadingToonyFactor)) {
      toonyValues.push(slot.shadingToonyFactor);
    }
    if (typeof slot.shadingShiftFactor === "number" && Number.isFinite(slot.shadingShiftFactor)) {
      shiftValues.push(slot.shadingShiftFactor);
    }
    if (typeof slot.giEqualizationFactor === "number" && Number.isFinite(slot.giEqualizationFactor)) {
      giValues.push(slot.giEqualizationFactor);
    }
    if (slot.outlineWidthMode === "worldCoordinates" && typeof slot.outlineWidthFactor === "number" && slot.outlineWidthFactor > 0) {
      worldOutlineWidths.push(slot.outlineWidthFactor);
    } else if (slot.outlineWidthMode === "screenCoordinates" && typeof slot.outlineWidthFactor === "number" && slot.outlineWidthFactor > 0) {
      screenOutlineWidths.push(slot.outlineWidthFactor);
    }
    if (typeof slot.outlineLightingMixFactor === "number" && Number.isFinite(slot.outlineLightingMixFactor)) {
      outlineMixValues.push(slot.outlineLightingMixFactor);
    }
    if (slot.outlineColor) outlineColors.push(slot.outlineColor);

    if (slot.rimColor) rimColors.push(slot.rimColor);
    if (typeof slot.rimLightingMixFactor === "number" && Number.isFinite(slot.rimLightingMixFactor)) {
      rimMixValues.push(slot.rimLightingMixFactor);
    }
    if (typeof slot.rimFresnelPower === "number" && Number.isFinite(slot.rimFresnelPower)) {
      rimPowerValues.push(slot.rimFresnelPower);
    }
    if (typeof slot.rimLift === "number" && Number.isFinite(slot.rimLift)) {
      rimLiftValues.push(slot.rimLift);
    }

    if (slot.role === "hair") {
      if (typeof slot.angelRingIntensity === "number" && Number.isFinite(slot.angelRingIntensity)) {
        angelRingIntensities.push(slot.angelRingIntensity);
      }
      if (typeof slot.angelRingSharpness === "number" && Number.isFinite(slot.angelRingSharpness)) {
        angelRingSharpnesses.push(slot.angelRingSharpness);
      }
      if (slot.matcapColor) angelRingTints.push(slot.matcapColor);
    }

    const baseLch = resolved.oklch;
    const shadeLch = srgbToOklch(slot.shadeColor);
    shadowLightnessDrops.push(clamp(baseLch.l - shadeLch.l, 0.04, 0.42));
    if (baseLch.c > 0.015 && shadeLch.c > 0.015) {
      shadowHueShifts.push(shortestHueDeltaDeg(baseLch.h, shadeLch.h));
    }
    const baseY = Math.max(0.04, srgbToRelativeLuminance(resolved.rgb));
    const shadeY = Math.max(0.01, srgbToRelativeLuminance(slot.shadeColor));
    shadowDarknessRatios.push(clamp(shadeY / baseY, 0.35, 0.92));

    const rRatio = slot.shadeColor.r / Math.max(0.08, resolved.rgb.r);
    const gRatio = slot.shadeColor.g / Math.max(0.08, resolved.rgb.g);
    const bRatio = slot.shadeColor.b / Math.max(0.08, resolved.rgb.b);
    const maxRatio = Math.max(rRatio, gRatio, bRatio, 1e-4);
    shadowTintRatios.push({
      r: clamp((rRatio / maxRatio) * 0.92, 0.1, 1),
      g: clamp((gRatio / maxRatio) * 0.92, 0.1, 1),
      b: clamp((bRatio / maxRatio) * 0.92, 0.1, 1),
    });
  }

  const shadowTintRgb = meanRgb(shadowTintRatios, { r: 0.78, g: 0.82, b: 0.93 });
  const shadowKelvin = estimateColorTemperatureKelvin(shadowTintRgb);
  const shadowTempClass = classifyShadowTemperature(shadowKelvin);
  const useScreenOutline = screenOutlineWidths.length > worldOutlineWidths.length;
  const outlineWidthMode: VrmOutlineWidthMode =
    worldOutlineWidths.length === 0 && screenOutlineWidths.length === 0
      ? "worldCoordinates"
      : useScreenOutline
        ? "screenCoordinates"
        : "worldCoordinates";
  const outlineWidthFactor = roundTo(
    outlineWidthMode === "screenCoordinates"
      ? clamp(median(screenOutlineWidths, 0.0022), 0.0008, 0.01)
      : clamp(median(worldOutlineWidths, 0.0024), 0.0008, 0.01),
    5,
  );
  const outlineColorRgb = meanRgb(outlineColors, { r: 0.15, g: 0.12, b: 0.19 });
  const rimColorRgb = meanRgb(rimColors, { r: 0.98, g: 0.95, b: 0.9 });
  const angelRingIntensity = roundTo(clamp(median(angelRingIntensities, 0.62), 0, 1), 3);
  const angelRingSharpness = roundTo(clamp(median(angelRingSharpnesses, 0.72), 0.1, 1), 3);
  const angelRingTintRgb = meanRgb(angelRingTints, rimColorRgb);
  const primaryLightDirection = normalizeVec3(
    source.primaryLightDirection ?? anglesToDirectionVec3(36, 42),
  );
  const { azimuthDeg, elevationDeg } = directionVec3ToAngles(primaryLightDirection);

  return {
    profileId: source.profileId,
    sourceNameKo: source.sourceNameKo,
    sourceNameEn: source.sourceNameEn,
    hasMToonSource: mtoonCount > 0,
    sampledMaterialCount: slots.length,
    sampledTexturePixelCount: totalSampledPixels,
    dominantColors: {
      skin: skinSample,
      hair: hairSample,
      outfit: outfitSample,
      paletteEnvelope: {
        meanChroma: roundTo(meanChroma, 4),
        chromaCap,
        lightnessFloor,
        lightnessCeiling,
        warmthBias: roundTo(clamp((6500 - shadowKelvin) / 3500, -1, 1), 3),
      },
    },
    shadowTint: {
      tintOklch: srgbToOklch(shadowTintRgb),
      tintRgb: shadowTintRgb,
      temperatureKelvin: shadowKelvin,
      temperatureClass: shadowTempClass,
      hueShiftDeg: roundTo(clamp(median(shadowHueShifts, shadowTempClass === "cool" ? -14 : 10), -45, 45), 1),
      lightnessDrop: roundTo(clamp(median(shadowLightnessDrops, 0.16), 0.06, 0.34), 3),
      darknessFactor: roundTo(clamp(median(shadowDarknessRatios, 0.68), 0.42, 0.88), 3),
    },
    celShading: {
      shadingToonyFactor: roundTo(clamp(median(toonyValues, 0.86), 0.25, 1), 3),
      shadingShiftFactor: roundTo(clamp(median(shiftValues, -0.06), -0.6, 0.6), 3),
      giEqualizationFactor: roundTo(clamp(median(giValues, 0.86), 0.2, 1), 3),
    },
    outline: {
      widthMode: outlineWidthMode,
      widthFactor: outlineWidthFactor,
      colorOklch: srgbToOklch(outlineColorRgb),
      colorRgb: outlineColorRgb,
      lightingMixFactor: roundTo(clamp(median(outlineMixValues, 0.48), 0, 1), 3),
    },
    rimLight: {
      colorOklch: srgbToOklch(rimColorRgb),
      colorRgb: rimColorRgb,
      lightingMixFactor: roundTo(clamp(median(rimMixValues, 0.42), 0, 1), 3),
      fresnelPower: roundTo(clamp(median(rimPowerValues, 4.4), 1, 10), 2),
      lift: roundTo(clamp(median(rimLiftValues, 0.08), 0, 0.5), 3),
    },
    angelRing: {
      intensity: angelRingIntensity,
      sharpness: angelRingSharpness,
      tintOklch: srgbToOklch(angelRingTintRgb),
      tintRgb: angelRingTintRgb,
      enabledOnHair: angelRingIntensity >= 0.08,
    },
    primaryLightDirection,
    lightAzimuthDeg: azimuthDeg,
    lightElevationDeg: elevationDeg,
  };
}

/**
 * Three.js / @pixiv/three-vrm 런타임 객체에서 커스텀 파생 오브젝트를 제외하고 본체 DNA를 추출한다.
 */
export function extractVrmMaterialDnaFromScene(
  vrmOrScene: VrmRuntimeLike | VrmSceneObjectLike | null | undefined,
  options?: {
    readonly profileId?: string;
    readonly sourceNameKo?: string;
    readonly sourceNameEn?: string;
    readonly primaryLightDirection?: Vec3;
  },
): VrmMaterialDnaProfile {
  const root: VrmSceneObjectLike | undefined =
    vrmOrScene && "scene" in vrmOrScene ? vrmOrScene.scene : (vrmOrScene as VrmSceneObjectLike | undefined);
  const extractedSlots: VrmSourceMaterialSlot[] = [];

  if (root?.traverse) {
    root.traverse((node) => {
      if (node.isMesh !== true || node.visible === false) return;
      const u = node.userData;
      if (
        u?.toonSpectrumAvatarForge === true ||
        u?.studioVrmCustomPartOutline === true ||
        typeof u?.characterAuthoringDerivative === "string" ||
        node.name?.startsWith("wardrobe:") ||
        node.name?.startsWith("prop:")
      ) {
        return;
      }
      const list = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
      for (const mat of list) {
        if (!mat || mat.isOutline === true || mat.userData?.studioVrmCustomPartMaterial) continue;
        const isMToon = mat.isMToonMaterial === true || mat.isMToonNodeMaterial === true;
        const baseColor = readColorLike(mat.color, { r: 0.85, g: 0.82, b: 0.8 });
        const shadeColor = readColorLike(mat.shadeColorFactor, {
          r: baseColor.r * 0.72,
          g: baseColor.g * 0.74,
          b: baseColor.b * 0.82,
        });
        const img = mat.map?.image;
        const baseTexture: VrmTextureBuffer | undefined =
          img && typeof img.width === "number" && typeof img.height === "number" && img.data
            ? { width: img.width, height: img.height, data: img.data }
            : undefined;
        const matcap = mat.matcapFactor ? readColorLike(mat.matcapFactor, { r: 0, g: 0, b: 0 }) : undefined;
        // Three.js MToonMaterial의 matcapFactor는 선형 강도 계수이므로 감마 재적용 없이 선형 휘도를 사용한다.
        const linearMatcapLuma = matcap ? 0.2126 * matcap.r + 0.7152 * matcap.g + 0.0722 * matcap.b : 0;
        const angelRingIntensity = matcap ? clamp(linearMatcapLuma * 1.15, 0, 1) : undefined;

        extractedSlots.push({
          name: mat.name ?? node.name ?? "vrm-slot",
          role: classifySlotRoleFromName(`${mat.name ?? ""} ${node.name ?? ""}`),
          isMToon,
          baseColor,
          baseTexture,
          shadeColor,
          shadingToonyFactor: mat.shadingToonyFactor,
          shadingShiftFactor: mat.shadingShiftFactor,
          giEqualizationFactor: mat.giEqualizationFactor,
          outlineWidthMode: mat.outlineWidthMode,
          outlineWidthFactor: mat.outlineWidthFactor,
          outlineColor: mat.outlineColorFactor ? readColorLike(mat.outlineColorFactor, { r: 0.14, g: 0.12, b: 0.18 }) : undefined,
          outlineLightingMixFactor: mat.outlineLightingMixFactor,
          rimColor: mat.parametricRimColorFactor ? readColorLike(mat.parametricRimColorFactor, { r: 0.96, g: 0.94, b: 0.9 }) : undefined,
          rimLightingMixFactor: mat.rimLightingMixFactor,
          rimFresnelPower: mat.parametricRimFresnelPowerFactor,
          rimLift: mat.parametricRimLiftFactor,
          angelRingIntensity,
          matcapColor: matcap,
        });
      }
    });
  }

  return extractVrmMaterialDna({
    profileId: options?.profileId ?? "vrm-scene-live",
    sourceNameKo: options?.sourceNameKo ?? "VRM 런타임 본체",
    sourceNameEn: options?.sourceNameEn ?? "VRM Runtime Body",
    primaryLightDirection: options?.primaryLightDirection,
    materials: extractedSlots,
  });
}

function deriveRawPartShadeColor(part: VrmRawPartMaterialInput, rawBaseRgb: Rgb01): Rgb01 {
  if (part.shadeColor) return part.shadeColor;
  const metalPenalty = clamp(part.metalness ?? 0, 0, 1) * 0.42;
  const factor = clamp(0.46 - metalPenalty, 0.12, 0.56);
  return { r: rawBaseRgb.r * factor, g: rawBaseRgb.g * factor, b: rawBaseRgb.b * factor };
}

function computeChannelDeltaE00(
  actual: { readonly lit: Rgb01; readonly shade: Rgb01; readonly outline: Rgb01; readonly rim: Rgb01 },
  target: { readonly lit: Rgb01; readonly shade: Rgb01; readonly outline: Rgb01; readonly rim: Rgb01 },
): PerceptualChannelDeltaE00 {
  const litBaseDeltaE00 = roundTo(computeCiede2000Rgb(actual.lit, target.lit), 2);
  const shadowToneDeltaE00 = roundTo(computeCiede2000Rgb(actual.shade, target.shade), 2);
  const outlineColorDeltaE00 = roundTo(computeCiede2000Rgb(actual.outline, target.outline), 2);
  const rimLightDeltaE00 = roundTo(computeCiede2000Rgb(actual.rim, target.rim), 2);
  const compositeDeltaE00 = roundTo(
    litBaseDeltaE00 * 0.35 + shadowToneDeltaE00 * 0.35 + outlineColorDeltaE00 * 0.15 + rimLightDeltaE00 * 0.15,
    2,
  );
  return { litBaseDeltaE00, shadowToneDeltaE00, outlineColorDeltaE00, rimLightDeltaE00, compositeDeltaE00 };
}

function derivePartAngelRingIntensity(
  kind: VrmReplacementPartKind,
  dna: VrmMaterialDnaProfile,
  inheritHairAngelRing: boolean,
): number {
  if (kind === "hair") return inheritHairAngelRing ? dna.angelRing.intensity : 0;
  if (kind === "glasses") return roundTo(clamp(dna.angelRing.intensity * 0.55, 0.18, 0.65), 3);
  return roundTo(clamp(dna.angelRing.intensity * 0.15, 0, 0.18), 3);
}

/**
 * 교체되는 헤어·모자·안경·의상·소품 파츠의 원시 재질에 원본 VRM DNA를 자동 이식하고
 * 이식 전/후 CIEDE2000 ΔE00·셀 경계·외곽선 두께·광원 방향 정렬 수치를 실측한다.
 */
export function transferVrmShaderDnaToPart(
  dna: VrmMaterialDnaProfile,
  part: VrmRawPartMaterialInput,
  options?: ShaderDnaTransferOptions,
): VrmPartShaderTransferResult {
  const harmonyStrength = clamp(options?.toneHarmonyStrength ?? 0.85, 0, 1);
  const inheritHairAngelRing = options?.inheritHairAngelRing ?? true;
  const lockLightDirection = options?.lockLightDirection ?? true;

  const rawBaseRgb = part.baseTexture
    ? sampleDominantOklchFromTexture(part.baseTexture, part.baseColor).rgb
    : part.baseColor;
  const rawBaseOklch = srgbToOklch(rawBaseRgb);
  const rawShadeRgb = deriveRawPartShadeColor(part, rawBaseRgb);

  const metalCollapse = part.shaderType.startsWith("pbr") ? clamp(part.metalness ?? 0, 0, 1) * 0.45 : 0;
  const rawRenderedLitRgb: Rgb01 =
    metalCollapse > 0.01
      ? {
          r: rawBaseRgb.r * (1 - metalCollapse),
          g: rawBaseRgb.g * (1 - metalCollapse),
          b: rawBaseRgb.b * (1 - metalCollapse),
        }
      : rawBaseRgb;

  const env = dna.dominantColors.paletteEnvelope;
  const targetChroma =
    rawBaseOklch.c > env.chromaCap
      ? env.chromaCap + (rawBaseOklch.c - env.chromaCap) * 0.16
      : rawBaseOklch.c * 0.72 + Math.min(rawBaseOklch.c * 1.15, env.meanChroma) * 0.28;
  const targetLightness = clamp(
    rawBaseOklch.l < env.lightnessFloor
      ? env.lightnessFloor + (rawBaseOklch.l - env.lightnessFloor) * 0.25
      : rawBaseOklch.l > env.lightnessCeiling
        ? env.lightnessCeiling + (rawBaseOklch.l - env.lightnessCeiling) * 0.2
        : rawBaseOklch.l,
    0.15,
    0.95,
  );
  const ambientHueAnchor =
    dna.shadowTint.temperatureClass === "warm"
      ? 58
      : dna.shadowTint.temperatureClass === "cool"
        ? 248
        : rawBaseOklch.h;
  const targetHue = rawBaseOklch.c > 0.015 ? lerpHueDeg(rawBaseOklch.h, ambientHueAnchor, 0.08) : rawBaseOklch.h;
  const targetLitOklch: OklchColor = { l: targetLightness, c: clamp(targetChroma, 0, 0.24), h: targetHue };
  const targetLitRgb = oklchToSrgbGamutSafe(targetLitOklch);

  const shiftedShadowOklch: OklchColor = {
    l: clamp(targetLitOklch.l - dna.shadowTint.lightnessDrop, 0.08, 0.88),
    c: clamp(targetLitOklch.c * 0.94 + dna.shadowTint.tintOklch.c * 0.28, 0.015, 0.22),
    h: normalizeHueDeg(targetLitOklch.h + dna.shadowTint.hueShiftDeg),
  };
  const targetShadowRgb = blendOklabRgb(oklchToSrgbGamutSafe(shiftedShadowOklch), dna.shadowTint.tintRgb, 0.28);

  const darkenedPartBase: Rgb01 = { r: targetLitRgb.r * 0.3, g: targetLitRgb.g * 0.3, b: targetLitRgb.b * 0.3 };
  const targetOutlineRgb = blendOklabRgb(
    darkenedPartBase,
    dna.outline.colorRgb,
    clamp(1 - dna.outline.lightingMixFactor * 0.42, 0.45, 0.88),
  );
  const targetRimRgb =
    part.kind === "glasses" ? dna.rimLight.colorRgb : blendOklabRgb(dna.rimLight.colorRgb, targetLitRgb, 0.18);

  const rawOutlineRgb =
    part.outlineWidthMode === "none" || !part.outlineColor
      ? { r: rawShadeRgb.r * 0.85, g: rawShadeRgb.g * 0.85, b: rawShadeRgb.b * 0.85 }
      : part.outlineColor;
  const rawRimRgb = part.rimColor ?? { r: 0.5, g: 0.5, b: 0.5 };

  // MToon 전환 시 원시 PBR IBL 금속 암화 붕괴가 해소되므로, 파츠 본연 알베도(rawBaseRgb)에서 DNA 목표로 조화한다.
  const transferredLitRgb = blendOklabRgb(rawBaseRgb, targetLitRgb, harmonyStrength);
  const shaderCoupling = clamp(0.55 + harmonyStrength * 0.45, 0, 1);
  const transferredShadowRgb = blendOklabRgb(rawShadeRgb, targetShadowRgb, shaderCoupling);
  const transferredOutlineRgb = blendOklabRgb(rawOutlineRgb, targetOutlineRgb, shaderCoupling);
  const transferredRimRgb = blendOklabRgb(rawRimRgb, targetRimRgb, shaderCoupling);

  const rawToony = clamp(part.shadingToonyFactor ?? (part.shaderType === "foreign-mtoon" ? 0.55 : 0.18), 0, 1);
  const rawShift = clamp(part.shadingShiftFactor ?? (part.shaderType === "foreign-mtoon" ? 0.22 : 0), -1, 1);
  const rawOutlineWidth = part.outlineWidthMode === "none" ? 0 : Math.max(0, part.outlineWidthFactor ?? 0);
  const rawLightDir = normalizeVec3(part.lightDirection ?? anglesToDirectionVec3(-64, 18));
  const transferredLightDir = lockLightDirection ? dna.primaryLightDirection : rawLightDir;

  const beforeDeltaE00 = computeChannelDeltaE00(
    { lit: rawRenderedLitRgb, shade: rawShadeRgb, outline: rawOutlineRgb, rim: rawRimRgb },
    { lit: targetLitRgb, shade: targetShadowRgb, outline: targetOutlineRgb, rim: targetRimRgb },
  );
  const afterDeltaE00 = computeChannelDeltaE00(
    { lit: transferredLitRgb, shade: transferredShadowRgb, outline: transferredOutlineRgb, rim: transferredRimRgb },
    { lit: targetLitRgb, shade: targetShadowRgb, outline: targetOutlineRgb, rim: targetRimRgb },
  );

  const deltaE00Reduction = roundTo(beforeDeltaE00.compositeDeltaE00 - afterDeltaE00.compositeDeltaE00, 2);
  const deltaE00ImprovementPercent =
    beforeDeltaE00.compositeDeltaE00 > 1e-6
      ? roundTo((deltaE00Reduction / beforeDeltaE00.compositeDeltaE00) * 100, 1)
      : 0;

  const beforeCelBoundaryError = roundTo(
    Math.abs(rawToony - dna.celShading.shadingToonyFactor) + Math.abs(rawShift - dna.celShading.shadingShiftFactor),
    4,
  );
  const beforeOutlineWidthDelta = roundTo(Math.abs(rawOutlineWidth - dna.outline.widthFactor), 5);
  const beforeLightAlignmentCosine = roundTo(clamp(dotVec3(rawLightDir, dna.primaryLightDirection), -1, 1), 4);
  const afterLightAlignmentCosine = roundTo(clamp(dotVec3(transferredLightDir, dna.primaryLightDirection), -1, 1), 4);

  const harmonyGrade: ShaderHarmonyGrade =
    afterDeltaE00.compositeDeltaE00 <= 4.0
      ? "harmonized"
      : afterDeltaE00.compositeDeltaE00 <= 7.5
        ? "acceptable"
        : "needs-tuning";

  return {
    partId: part.partId,
    labelKo: part.labelKo,
    labelEn: part.labelEn,
    kind: part.kind,
    sourceShaderType: part.shaderType,
    rawBaseOklch,
    rawBaseRgb: rawRenderedLitRgb,
    rawShadeRgb,
    transferred: {
      shaderType: "vrm-mtoon-dna",
      baseColorRgb: transferredLitRgb,
      baseColorOklch: srgbToOklch(transferredLitRgb),
      shadeColorRgb: transferredShadowRgb,
      shadeColorOklch: srgbToOklch(transferredShadowRgb),
      shadingToonyFactor: dna.celShading.shadingToonyFactor,
      shadingShiftFactor: dna.celShading.shadingShiftFactor,
      giEqualizationFactor: dna.celShading.giEqualizationFactor,
      outlineWidthMode: dna.outline.widthMode,
      outlineWidthFactor: dna.outline.widthFactor,
      outlineColorRgb: transferredOutlineRgb,
      outlineColorOklch: srgbToOklch(transferredOutlineRgb),
      outlineLightingMixFactor: dna.outline.lightingMixFactor,
      rimColorRgb: transferredRimRgb,
      rimColorOklch: srgbToOklch(transferredRimRgb),
      rimLightingMixFactor: dna.rimLight.lightingMixFactor,
      rimFresnelPower: dna.rimLight.fresnelPower,
      rimLift: dna.rimLight.lift,
      angelRingIntensity: derivePartAngelRingIntensity(part.kind, dna, inheritHairAngelRing),
      angelRingSharpness: dna.angelRing.sharpness,
      angelRingTintRgb: dna.angelRing.tintRgb,
      lightDirection: transferredLightDir,
    },
    beforeDeltaE00,
    afterDeltaE00,
    deltaE00Reduction,
    deltaE00ImprovementPercent,
    beforeCelBoundaryError,
    afterCelBoundaryError: 0,
    beforeOutlineWidthDelta,
    afterOutlineWidthDelta: 0,
    beforeLightAlignmentCosine,
    afterLightAlignmentCosine,
    harmonyGrade,
  };
}

export function transferVrmShaderDnaToParts(
  dna: VrmMaterialDnaProfile,
  parts: readonly VrmRawPartMaterialInput[],
  options?: ShaderDnaTransferOptions,
): VrmBatchShaderTransferReport {
  const partResults = parts.map((part) => transferVrmShaderDnaToPart(dna, part, options));
  if (partResults.length === 0) {
    return {
      dnaProfileId: dna.profileId,
      partResults: [],
      meanBeforeDeltaE00: 0,
      meanAfterDeltaE00: 0,
      meanImprovementPercent: 0,
      maxCelBoundaryErrorAfter: 0,
      maxOutlineWidthDeltaAfter: 0,
      minLightAlignmentAfter: 1,
      allHarmonized: true,
    };
  }
  const meanBefore = partResults.reduce((sum, r) => sum + r.beforeDeltaE00.compositeDeltaE00, 0) / partResults.length;
  const meanAfter = partResults.reduce((sum, r) => sum + r.afterDeltaE00.compositeDeltaE00, 0) / partResults.length;
  const meanImprovement = meanBefore > 1e-6 ? ((meanBefore - meanAfter) / meanBefore) * 100 : 0;

  return {
    dnaProfileId: dna.profileId,
    partResults,
    meanBeforeDeltaE00: roundTo(meanBefore, 2),
    meanAfterDeltaE00: roundTo(meanAfter, 2),
    meanImprovementPercent: roundTo(meanImprovement, 1),
    maxCelBoundaryErrorAfter: Math.max(...partResults.map((r) => r.afterCelBoundaryError)),
    maxOutlineWidthDeltaAfter: Math.max(...partResults.map((r) => r.afterOutlineWidthDelta)),
    minLightAlignmentAfter: Math.min(...partResults.map((r) => r.afterLightAlignmentCosine)),
    allHarmonized: partResults.every((r) => r.harmonyGrade === "harmonized"),
  };
}

/**
 * 이식 완료된 `TransferredVrmPartMaterial`을 Three.js/VRM 호환 MToon 재질 객체에 반영한다.
 */
export function applyTransferredDnaToMaterialLike(
  material: VrmSceneMaterialLike,
  transferred: TransferredVrmPartMaterial,
): void {
  material.color?.setRGB?.(transferred.baseColorRgb.r, transferred.baseColorRgb.g, transferred.baseColorRgb.b);
  material.shadeColorFactor?.setRGB?.(transferred.shadeColorRgb.r, transferred.shadeColorRgb.g, transferred.shadeColorRgb.b);
  material.shadingToonyFactor = transferred.shadingToonyFactor;
  material.shadingShiftFactor = transferred.shadingShiftFactor;
  material.giEqualizationFactor = transferred.giEqualizationFactor;
  material.outlineWidthMode = transferred.outlineWidthMode;
  material.outlineWidthFactor = transferred.outlineWidthFactor;
  material.outlineColorFactor?.setRGB?.(transferred.outlineColorRgb.r, transferred.outlineColorRgb.g, transferred.outlineColorRgb.b);
  material.outlineLightingMixFactor = transferred.outlineLightingMixFactor;
  material.parametricRimColorFactor?.setRGB?.(transferred.rimColorRgb.r, transferred.rimColorRgb.g, transferred.rimColorRgb.b);
  material.rimLightingMixFactor = transferred.rimLightingMixFactor;
  material.parametricRimFresnelPowerFactor = transferred.rimFresnelPower;
  material.parametricRimLiftFactor = transferred.rimLift;
  if (material.matcapFactor?.setRGB) {
    material.matcapFactor.setRGB(
      transferred.angelRingTintRgb.r * transferred.angelRingIntensity,
      transferred.angelRingTintRgb.g * transferred.angelRingIntensity,
      transferred.angelRingTintRgb.b * transferred.angelRingIntensity,
    );
  }
}

/**
 * 추출된 VRM DNA의 광원·그림자 색온도·셀 경계·림라이트 프레넬을 그대로 연동해
 * 2D 캔버스 합성용 3단 깊이 분리 + 3점 조명 리라이팅 맵을 생성한다.
 */
export function buildDepthRelightingForVrmDna(
  dna: VrmMaterialDnaProfile,
  options?: {
    readonly scene?: DepthSceneFrameInput;
    readonly sliceConfig?: Partial<DepthSliceConfig>;
    readonly keyIntensity?: number;
    readonly fillIntensity?: number;
    readonly rimIntensity?: number;
    readonly resolution?: number;
  },
): DepthAndRelightingCompositeResult {
  const size = Math.max(16, Math.floor(options?.resolution ?? 40));
  const scene =
    options?.scene ??
    synthesizeVrmPortraitDepthScene({
      width: size,
      height: size,
      skinRgb: dna.dominantColors.skin.rgb,
      hairRgb: dna.dominantColors.hair.rgb,
      outfitRgb: dna.dominantColors.outfit.rgb,
    });

  const relightingConfig: ThreePointRelightingConfig = {
    keyIntensity: options?.keyIntensity ?? 1.05,
    fillIntensity: options?.fillIntensity ?? 0.44,
    rimIntensity: options?.rimIntensity ?? 0.72,
    keyLightDirection: dna.primaryLightDirection,
    referenceLightDirection: dna.primaryLightDirection,
    keyColor:
      dna.shadowTint.temperatureClass === "warm"
        ? { r: 1, g: 0.94, b: 0.86 }
        : dna.shadowTint.temperatureClass === "cool"
          ? { r: 0.94, g: 0.96, b: 1 }
          : { r: 0.99, g: 0.98, b: 0.97 },
    fillColor: dna.shadowTint.tintRgb,
    rimColor: dna.rimLight.colorRgb,
    shadingToonyFactor: dna.celShading.shadingToonyFactor,
    shadingShiftFactor: dna.celShading.shadingShiftFactor,
    rimFresnelPower: dna.rimLight.fresnelPower,
    rimLift: dna.rimLight.lift,
  };

  return generateDepthSlicesAndRelightingMap(scene, relightingConfig, options?.sliceConfig);
}
