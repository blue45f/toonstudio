/**
 * 6대 실존 브러시 카탈로그(194종) 읽기 전용 통합 로더 및 64×32 스트로크 지문(Fingerprint) 합성기.
 */

import { GLOBAL_MASTER_BRUSH_CATALOG } from "../brush/global-master-collection/global-master-brush-catalog";
import type { GlobalMasterBrushPreset } from "../brush/global-master-collection/global-master-brush-types";
import {
  CSP_ALL_36_BRUSH_CATALOG,
  type CspProBrushSpec,
} from "../csp-brush-atelier/csp-all-categories-brush-catalog";
import {
  CSP_REA_EXECUTABLE_BRUSH_PRESETS,
  type CspExecutableBrushPreset,
} from "../drawing/studio-csp-brush-presets";
import {
  STUDIO_MAGMA_BRUSH_PRESETS,
  type StudioMagmaBrushPreset,
} from "../drawing/studio-magma-brush-presets";
import { STUDIO_PROCREATE_BRUSH_PRESETS } from "../drawing/studio-procreate-brush-presets";
import type { ProcreateSilicaBrushPreset } from "../drawing/studio-procreate-brush-studio";
import {
  IBIS_MEDIBANG_BRUSH_PRESETS,
  P5_BRUSH_PRESET_CATALOG,
  type ComicRibbonStampPresetSpec,
  type P5BrushPresetSpec,
} from "../drawing/studio-universal-brush-presets";

import type {
  BrushOperationKind,
  BrushPhysicalFeatureVector,
} from "./brush-category-physical-strategies";

export const FINGERPRINT_WIDTH = 64;
export const FINGERPRINT_HEIGHT = 32;

export type BrushCatalogSourceId =
  | "global-master"
  | "csp-atelier"
  | "csp-executable"
  | "procreate-silica"
  | "magma-studio"
  | "universal-p5"
  | "universal-ibis-medibang";

export interface UnifiedBrushAuditRecord {
  readonly uid: string;
  readonly id: string;
  readonly sourceCatalog: BrushCatalogSourceId;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly rawCategory: string;
  readonly operation: BrushOperationKind;
  readonly aspectRatio: number;
  readonly spacingRatio: number;
  readonly scatter01: number;
  readonly taper01: number;
  readonly features: BrushPhysicalFeatureVector;
}

export interface BrushFingerprintMetrics {
  readonly meanCoverage: number;
  readonly toothContrast: number;
  readonly edgeSharpness: number;
  readonly edgeRoughness: number;
  readonly wetRimRatio: number;
  readonly activePixelRatio: number;
}

export interface BrushStrokeFingerprint64x32 {
  readonly uid: string;
  readonly width: number;
  readonly height: number;
  readonly pixels: Float32Array;
  readonly metrics: BrushFingerprintMetrics;
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function normalizeBristleSpread(bristleCount: number, anisotropy = 0.5): number {
  if (bristleCount <= 1) return clamp01(anisotropy * 0.14);
  return clamp01((Math.log2(bristleCount) / Math.log2(48)) * 0.8 + anisotropy * 0.2);
}

function fromGlobalMaster(preset: GlobalMasterBrushPreset): UnifiedBrushAuditRecord {
  const isErase = preset.blendBehavior === "erase";
  const isSmudge = preset.blendBehavior === "smudge";
  const isMultiply = preset.blendBehavior === "multiply";
  const tooth =
    preset.grainTexture.kind === "none"
      ? 0
      : clamp01(preset.grainTexture.depth * 0.65 + preset.grainTexture.contrast * 0.45);
  const edgeRough = clamp01(
    preset.tipProfile.bristleJitter * 0.55 +
      tooth * 0.35 +
      preset.scattering.scatterX * 0.25 +
      (preset.dualTipProfile?.enabled ? preset.dualTipProfile.opacity * 0.25 : 0),
  );
  const wetBleed = clamp01(preset.wetness * 0.82 + preset.grainTexture.paperAbsorption * 0.18);
  return Object.freeze({
    uid: `global-master:${preset.id}`,
    id: preset.id,
    sourceCatalog: "global-master",
    nameKo: preset.nameKo,
    nameEn: preset.nameEn,
    rawCategory: preset.category,
    operation: isErase ? "erase" : isSmudge ? "smudge" : "paint",
    aspectRatio: clamp01(preset.tipProfile.aspectRatio),
    spacingRatio: clamp01(preset.spacing),
    scatter01: clamp01((preset.scattering.scatterX + preset.scattering.scatterY) * 0.25),
    taper01: clamp01((preset.taperStart + preset.taperEnd) * 1.1),
    features: Object.freeze({
      toothContrast: tooth,
      edgeRoughness: edgeRough,
      edgeSharpness: clamp01(preset.tipProfile.hardness),
      wetBleed: isErase ? 0 : wetBleed,
      impastoHeight: clamp01(preset.impastoHeight),
      opacityCoverage: isErase ? 0 : isSmudge ? clamp01(preset.defaultOpacity * 0.22) : clamp01(preset.defaultOpacity),
      multiplyStacking: isErase
        ? 0
        : isMultiply
          ? clamp01(0.74 + (1 - preset.defaultOpacity) * 0.35)
          : clamp01(wetBleed * 0.5 + (1 - preset.defaultOpacity) * 0.32),
      smudgePickup: isErase ? 0.08 : isSmudge ? clamp01(0.7 + preset.km7PigmentMix * 0.28) : clamp01(preset.km7PigmentMix * 0.62),
      liftStrength: isErase ? clamp01(0.76 + preset.defaultOpacity * 0.24) : 0,
      bristleSpread: normalizeBristleSpread(preset.tipProfile.bristleCount, preset.tipProfile.bristleJitter),
    }),
  });
}

function fromCspAtelier(spec: CspProBrushSpec): UnifiedBrushAuditRecord {
  const isErase = spec.operationMode === "erase" || spec.operationMode === "vector-erase";
  const isSmudge = spec.operationMode === "blend";
  const tooth = spec.paperGrain === "none" ? 0 : clamp01(spec.paperToothStrength01);
  const wetKernelBonus =
    spec.textureKernel === "watercolor-wash" ||
    spec.textureKernel === "watercolor-bloom" ||
    spec.textureKernel === "sumi-wet-bleed"
      ? 0.25
      : 0;
  const wetBleed = clamp01(spec.wetEdgeDarkening01 * 0.85 + wetKernelBonus);
  return Object.freeze({
    uid: `csp-atelier:${spec.id}`,
    id: spec.id,
    sourceCatalog: "csp-atelier",
    nameKo: spec.nameKo,
    nameEn: spec.nameEn,
    rawCategory: spec.category,
    operation: isErase ? "erase" : isSmudge ? "smudge" : "paint",
    aspectRatio: clamp01(1 - spec.bristleAnisotropy * 0.55),
    spacingRatio: clamp01(spec.spacingRatio),
    scatter01: clamp01(spec.scatterDensity01),
    taper01: clamp01((spec.taperStart01 + spec.taperEnd01) * 0.65),
    features: Object.freeze({
      toothContrast: tooth,
      edgeRoughness: clamp01(tooth * 0.55 + spec.scatterDensity01 * 0.45 + spec.bristleAnisotropy * 0.25),
      edgeSharpness: clamp01(spec.hardness01),
      wetBleed: isErase ? 0 : wetBleed,
      impastoHeight: clamp01(spec.impastoRidge01),
      opacityCoverage: isErase ? 0 : isSmudge ? clamp01(spec.opacity01 * 0.25) : clamp01(spec.opacity01),
      multiplyStacking: isErase ? 0 : clamp01(spec.wetEdgeDarkening01 * 0.6 + (1 - spec.opacity01) * 0.42),
      smudgePickup: isErase ? 0.08 : isSmudge ? clamp01(Math.max(0.75, spec.colorMixStrength01)) : clamp01(spec.colorMixStrength01),
      liftStrength: isErase ? clamp01(0.74 + spec.opacity01 * 0.24) : 0,
      bristleSpread: normalizeBristleSpread(spec.bristleCount, spec.bristleAnisotropy),
    }),
  });
}

function fromCspExecutable(preset: CspExecutableBrushPreset): UnifiedBrushAuditRecord {
  const { params } = preset;
  const isErase = preset.category === "eraser";
  const isSmudge = preset.category === "blend";
  const tooth = params.texture.enabled ? clamp01(params.texture.density01) : 0;
  const wetBleed = params.waterColor.wetMixEnabled
    ? clamp01(
        params.waterColor.colorExtension01 * 0.45 +
          (params.waterColor.waterEdgeEnabled ? params.waterColor.waterEdgeStrength01 * 0.6 : 0.15),
      )
    : 0;
  const impasto =
    params.dualBrush.enabled && params.dualBrush.compositeMode === "height"
      ? 0.58
      : params.texture.enabled && params.texture.compositeMode === "height"
        ? 0.22
        : 0;
  return Object.freeze({
    uid: `csp-executable:${preset.id}`,
    id: preset.id,
    sourceCatalog: "csp-executable",
    nameKo: preset.nameKo,
    nameEn: preset.id.replace(/-/gu, " "),
    rawCategory: preset.category,
    operation: isErase ? "erase" : isSmudge ? "smudge" : "paint",
    aspectRatio: clamp01(params.tipShape.thicknessPercent / 100),
    spacingRatio: clamp01(params.intervalPercent / 100),
    scatter01: params.spray.enabled ? clamp01(params.spray.densityPercent / 100) : 0,
    taper01: clamp01((params.correction.useInTaper ? 0.35 : 0) + (params.correction.useOutTaper ? 0.45 : 0)),
    features: Object.freeze({
      toothContrast: tooth,
      edgeRoughness: clamp01(
        tooth * 0.62 +
          (params.spray.enabled ? (params.spray.densityPercent / 100) * 0.45 : 0) +
          (params.dualBrush.enabled ? 0.22 : 0),
      ),
      edgeSharpness: clamp01(params.hardness01),
      wetBleed: isErase ? 0 : wetBleed,
      impastoHeight: impasto,
      opacityCoverage: isErase ? 0 : isSmudge ? clamp01(params.flow01 * 0.25) : clamp01(params.opacity01 * params.flow01),
      multiplyStacking: isErase
        ? 0
        : clamp01(
            (params.texture.compositeMode === "multiply" ? 0.25 : 0) +
              (1 - params.opacity01 * params.flow01) * 0.55 +
              wetBleed * 0.35,
          ),
      smudgePickup: isErase
        ? 0.06
        : isSmudge
          ? clamp01(Math.max(0.75, params.waterColor.colorExtension01))
          : params.waterColor.wetMixEnabled
            ? clamp01(params.waterColor.mixColor01 * 0.55)
            : 0,
      liftStrength: isErase ? clamp01(0.72 + params.flow01 * 0.26) : 0,
      bristleSpread: params.dualBrush.enabled ? 0.42 : 0.08,
    }),
  });
}

function fromProcreate(preset: ProcreateSilicaBrushPreset): UnifiedBrushAuditRecord {
  const { config } = preset;
  const tooth = clamp01(config.grain.depth01 * (0.75 + config.grain.contrast * 0.4));
  const opacityCoverage = clamp01(
    config.properties.maxOpacity01 *
      (config.rendering.mode === "light-glaze"
        ? 0.52
        : config.rendering.mode === "heavy-glaze"
          ? 0.98
          : 0.8),
  );
  return Object.freeze({
    uid: `procreate-silica:${preset.id}`,
    id: preset.id,
    sourceCatalog: "procreate-silica",
    nameKo: preset.nameKo,
    nameEn: preset.nameEn,
    rawCategory: preset.setCategory,
    operation: "paint",
    aspectRatio: clamp01(config.shape.roundness01),
    spacingRatio: clamp01(config.strokePath.plotSpacing01),
    scatter01: clamp01(config.shape.scatter01),
    taper01: clamp01((config.taper.startLength01 + config.taper.endLength01) * 1.4),
    features: Object.freeze({
      toothContrast: tooth,
      edgeRoughness: clamp01(tooth * 0.5 + config.shape.scatter01 * 0.42 + config.strokePath.plotJitter01 * 0.3),
      edgeSharpness: clamp01(1 - config.shape.softness01),
      wetBleed: clamp01(config.rendering.wetEdges01 * 0.65 + config.wetMix.dilution01 * 0.55),
      impastoHeight: clamp01(
        (config.rendering.mode === "intense-blending" ? 0.42 : 0) +
          config.wetMix.charge01 * config.wetMix.pull01 * 0.45 +
          (1 - config.materials3d.roughnessScale01) * 0.16,
      ),
      opacityCoverage,
      multiplyStacking: clamp01(
        (config.grain.blendMode === "multiply" ? 0.28 : 0.12) +
          (1 - opacityCoverage) * 0.5 +
          config.rendering.burntEdges01 * 0.4,
      ),
      smudgePickup: clamp01(config.wetMix.pull01 * 0.82 + config.wetMix.blur01 * 0.35),
      liftStrength: 0,
      bristleSpread: normalizeBristleSpread(config.shape.count, 1 - config.shape.roundness01),
    }),
  });
}

function fromMagma(preset: StudioMagmaBrushPreset): UnifiedBrushAuditRecord {
  const { config } = preset;
  const hasPattern =
    config.patternEachStamp ||
    config.patternBlendMode === "height" ||
    config.patternBlendMode === "linear-height" ||
    config.patternBlendMode === "linear-burn" ||
    config.patternBlendMode === "color-burn";
  const tooth = hasPattern ? clamp01(config.patternContrast * 0.95 + (config.patternEachStamp ? 0.18 : 0)) : 0.08;
  const spreadTotal = clamp01((config.spread.normalSpread + config.spread.tangentSpread) * 0.5);
  const isSmudge = config.patternBlendMode === "hard-mix" && config.stretch >= 0.7;
  return Object.freeze({
    uid: `magma-studio:${preset.id}`,
    id: preset.id,
    sourceCatalog: "magma-studio",
    nameKo: preset.nameKo,
    nameEn: preset.nameEn,
    rawCategory: preset.category,
    operation: isSmudge ? "smudge" : "paint",
    aspectRatio: clamp01(config.roundness),
    spacingRatio: clamp01(config.spacingRatio),
    scatter01: spreadTotal,
    taper01: config.sizePressure ? clamp01(1 - config.minSizePressure) : 0,
    features: Object.freeze({
      toothContrast: tooth,
      edgeRoughness: clamp01(tooth * 0.45 + spreadTotal * 0.55 + (config.asymmetricEdgeSoftness ?? 0) * 0.32),
      edgeSharpness: clamp01(config.hardness),
      wetBleed: isSmudge ? 0.34 : config.dualSpread ? 0.38 : 0.04,
      impastoHeight: config.patternBlendMode === "height" ? clamp01(0.45 + config.stretch * 0.5) : clamp01(config.stretch * 0.35),
      opacityCoverage: isSmudge ? 0.28 : clamp01(config.opacity * config.flow),
      multiplyStacking: clamp01((config.patternBlendMode === "multiply" ? 0.32 : 0.14) + (1 - config.flow) * 0.48),
      smudgePickup: isSmudge ? 0.84 : clamp01(config.stretch * 0.6),
      liftStrength: 0,
      bristleSpread: normalizeBristleSpread(config.spread.count ?? 1, Math.max(config.stretch, 1 - config.roundness)),
    }),
  });
}

function fromP5(spec: P5BrushPresetSpec): UnifiedBrushAuditRecord {
  const grain01 = clamp01(spec.grain / 4);
  const scatter01 = clamp01(spec.scatter / 4);
  const opacity01 = clamp01(spec.opacity255 / 255);
  const isMarker = spec.tipType === "marker";
  return Object.freeze({
    uid: `universal-p5:${spec.id}`,
    id: spec.id,
    sourceCatalog: "universal-p5",
    nameKo: spec.labelKo,
    nameEn: spec.id,
    rawCategory: spec.tipType,
    operation: "paint",
    aspectRatio: isMarker ? 0.38 : 0.85,
    spacingRatio: clamp01(spec.spacing),
    scatter01,
    taper01: clamp01(spec.pressureCurve[0] + spec.pressureCurve[1]),
    features: Object.freeze({
      toothContrast: isMarker ? clamp01(grain01 * 0.5) : grain01,
      edgeRoughness: clamp01(scatter01 * 0.65 + spec.noiseLevel * 0.2),
      edgeSharpness: clamp01(spec.sharpness),
      wetBleed: isMarker ? 0.24 : 0.04,
      impastoHeight: 0,
      opacityCoverage: opacity01,
      multiplyStacking: isMarker ? 0.86 : clamp01((1 - opacity01) * 0.65),
      smudgePickup: 0.06,
      liftStrength: 0,
      bristleSpread: normalizeBristleSpread(spec.noiseLevel + 1, scatter01 * 0.5),
    }),
  });
}

function fromIbisMediBang(spec: ComicRibbonStampPresetSpec): UnifiedBrushAuditRecord {
  const physics = spec.physics;
  const operation: BrushOperationKind = physics?.operation ?? "paint";
  return Object.freeze({
    uid: `universal-ibis-medibang:${spec.id}`,
    id: spec.id,
    sourceCatalog: "universal-ibis-medibang",
    nameKo: spec.labelKo,
    nameEn: spec.id.replace(/-/gu, " "),
    rawCategory: spec.isRibbonChain ? `${spec.sourceApp}-ribbon` : spec.sourceApp,
    operation,
    aspectRatio: spec.alignToTangent ? 0.68 : 1,
    spacingRatio: clamp01(spec.spacingRatio),
    scatter01: spec.isRibbonChain ? clamp01(spec.spacingRatio * 0.6) : 0.05,
    taper01: clamp01(spec.pressureSizeRange01[1] - spec.pressureSizeRange01[0]),
    features: Object.freeze({
      toothContrast: clamp01(physics?.toothContrast01 ?? 0.08),
      edgeRoughness: clamp01(physics?.edgeRoughness01 ?? (spec.isRibbonChain ? 0.28 : 0.1)),
      edgeSharpness: clamp01(physics?.edgeSharpness01 ?? 0.82),
      wetBleed: clamp01(physics?.wetBleed01 ?? 0.05),
      impastoHeight: clamp01(physics?.impastoHeight01 ?? 0),
      opacityCoverage: clamp01(physics?.opacityCoverage01 ?? 0.88),
      multiplyStacking: clamp01(physics?.multiplyStacking01 ?? 0.14),
      smudgePickup: clamp01(physics?.smudgePickup01 ?? 0.05),
      liftStrength: operation === "erase" ? 0.85 : 0,
      bristleSpread: normalizeBristleSpread(spec.nozzleCycleCount, spec.alignToTangent ? 0.45 : 0.15),
    }),
  });
}

/** 6대 실존 브러시 카탈로그(194종) 전수 통합 로더. */
export function loadUnifiedBrushCatalog(): readonly UnifiedBrushAuditRecord[] {
  return Object.freeze([
    ...GLOBAL_MASTER_BRUSH_CATALOG.map(fromGlobalMaster),
    ...CSP_ALL_36_BRUSH_CATALOG.map(fromCspAtelier),
    ...CSP_REA_EXECUTABLE_BRUSH_PRESETS.map(fromCspExecutable),
    ...STUDIO_PROCREATE_BRUSH_PRESETS.map(fromProcreate),
    ...STUDIO_MAGMA_BRUSH_PRESETS.map(fromMagma),
    ...P5_BRUSH_PRESET_CATALOG.map(fromP5),
    ...IBIS_MEDIBANG_BRUSH_PRESETS.map(fromIbisMediBang),
  ]);
}

function hash2d(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function paperToothAt(x: number, y: number): number {
  const macro =
    0.5 +
    0.26 * Math.sin(x * 0.52 + Math.cos(y * 0.44)) +
    0.24 * Math.cos(y * 0.68 - x * 0.27);
  return clamp01(macro * 0.58 + hash2d(Math.floor(x * 2), Math.floor(y * 2)) * 0.42);
}

function measureFingerprintPixels(
  pixels: Float32Array,
  width: number,
  height: number,
): BrushFingerprintMetrics {
  let activeCount = 0;
  let sum = 0;
  let sumSq = 0;
  let gradSum = 0;
  let gradCount = 0;
  let rimSum = 0;
  let rimCount = 0;
  let coreSum = 0;
  let coreCount = 0;
  let perimeterTransitions = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const val = pixels[y * width + x];
      if (val > 0.03) {
        activeCount += 1;
        sum += val;
        sumSq += val * val;
      }
      const grad =
        Math.hypot(
          pixels[y * width + (x + 1)] - pixels[y * width + (x - 1)],
          pixels[(y + 1) * width + x] - pixels[(y - 1) * width + x],
        ) * 0.5;
      if (val > 0.08 && val < 0.82) {
        gradSum += grad;
        gradCount += 1;
        rimSum += val;
        rimCount += 1;
      } else if (val >= 0.4) {
        coreSum += val;
        coreCount += 1;
      }
      if ((pixels[y * width + (x - 1)] > 0.12) !== (pixels[y * width + (x + 1)] > 0.12)) {
        perimeterTransitions += 1;
      }
    }
  }

  const meanCoverage = activeCount > 0 ? sum / activeCount : 0;
  const variance = activeCount > 0 ? Math.max(0, sumSq / activeCount - meanCoverage * meanCoverage) : 0;
  const coreMean = coreCount > 0 ? coreSum / coreCount : meanCoverage;
  const rimMean = rimCount > 0 ? rimSum / rimCount : 0;
  return Object.freeze({
    meanCoverage,
    toothContrast: clamp01(Math.sqrt(variance) * 2.8),
    edgeSharpness: gradCount > 0 ? clamp01((gradSum / gradCount) * 2.4) : 0,
    edgeRoughness: activeCount > 0 ? clamp01(perimeterTransitions / Math.max(1, activeCount * 0.65)) : 0,
    wetRimRatio: coreMean > 0.02 ? rimMean / coreMean : 0,
    activePixelRatio: activeCount / (width * height),
  });
}

/** 64×32 결정론적 스트로크 지문(Float32Array 2048px)과 픽셀 기반 질감 지표를 합성한다. */
export function synthesizeBrushFingerprint64x32(
  record: UnifiedBrushAuditRecord,
): BrushStrokeFingerprint64x32 {
  const width = FINGERPRINT_WIDTH;
  const height = FINGERPRINT_HEIGHT;
  const pixels = new Float32Array(width * height);
  const f = record.features;
  const isErase = record.operation === "erase" || f.liftStrength >= 0.45;
  const isSmudge = !isErase && (record.operation === "smudge" || f.smudgePickup >= 0.65);

  const stepCount = Math.round(40 - clamp01(record.spacingRatio) * 22);
  const targetMax = isErase
    ? 0.45 + f.liftStrength * 0.45
    : isSmudge
      ? 0.22 + f.smudgePickup * 0.42
      : 0.28 + f.opacityCoverage * 0.68;

  for (let s = 0; s <= stepCount; s += 1) {
    const t = s / Math.max(1, stepCount);
    const jitterAngle = (hash2d(s * 1.7, 3.1) - 0.5) * record.scatter01 * 5.2;
    const cx = 5 + t * (width - 10);
    const cy = height * 0.5 + Math.sin(t * Math.PI * 2) * 5.4 + jitterAngle;
    const tangent = Math.atan2(Math.cos(t * Math.PI * 2) * 5.4 * Math.PI * 2, width - 10);
    const cosA = Math.cos(-tangent);
    const sinA = Math.sin(-tangent);

    const pressure = 0.22 + 0.78 * Math.sin(Math.PI * t);
    const taperFactor = 1 - record.taper01 * 0.68 * (1 - Math.sin(Math.PI * t));
    const rx = (3.4 + 3.6 * pressure) * Math.max(0.24, taperFactor);
    const ry = Math.max(1.1, rx * Math.max(0.24, record.aspectRatio));

    for (let y = Math.max(0, Math.floor(cy - rx - 2)); y <= Math.min(height - 1, Math.ceil(cy + rx + 2)); y += 1) {
      for (let x = Math.max(0, Math.floor(cx - rx - 2)); x <= Math.min(width - 1, Math.ceil(cx + rx + 2)); x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        const lx = dx * cosA - dy * sinA;
        const ly = dx * sinA + dy * cosA;
        const dist = Math.hypot(lx / rx, ly / ry);
        if (dist > 1.3) continue;

        const tooth = paperToothAt(x, y);
        const grit = hash2d(x + s * 0.17, y + s * 0.11);
        const effDist = dist + (grit - 0.5) * f.edgeRoughness * 0.52;
        if (effDist > 1.15) continue;

        const falloffPow = 0.55 + f.edgeSharpness * 4.8;
        let alpha =
          effDist <= 0.12 ? 1 : clamp01(1 - Math.pow(clamp01((effDist - 0.12) / 0.96), falloffPow));
        if (f.toothContrast > 0.04) {
          const threshold = (0.46 - pressure * 0.22) * f.toothContrast;
          const toothMask = clamp01((tooth - threshold) / Math.max(0.18, 1 - threshold));
          alpha *= 1 - f.toothContrast * 0.84 + f.toothContrast * 0.84 * toothMask;
        }
        if (f.bristleSpread > 0.14) {
          const stripe = 0.5 + 0.5 * Math.sin(ly * (2.6 + f.bristleSpread * 7.2) + grit * 0.5);
          alpha *= 1 - f.bristleSpread * 0.48 + f.bristleSpread * 0.48 * stripe;
        }
        if (f.wetBleed > 0.1 && dist > 0.58 && dist < 1.06) {
          alpha = clamp01(alpha * (1 + f.wetBleed * 0.82 * Math.sin(((dist - 0.58) / 0.48) * Math.PI)));
        }
        if (f.impastoHeight > 0.1) {
          alpha = clamp01(alpha + ((lx + ly) / Math.max(1, rx)) * 0.34 * f.impastoHeight * alpha);
        }

        const idx = y * width + x;
        if (isErase) {
          const base = pixels[idx] === 0 ? 0.55 : pixels[idx];
          pixels[idx] = clamp01(base - alpha * f.liftStrength * (0.3 + 0.7 * tooth) * 0.34);
        } else {
          const sampleVal = clamp01(alpha * targetMax);
          if (f.multiplyStacking >= 0.52) {
            pixels[idx] = clamp01(1 - (1 - pixels[idx]) * (1 - sampleVal * 0.28));
          } else {
            pixels[idx] = clamp01(Math.max(pixels[idx], sampleVal * 0.78) + sampleVal * 0.14 * (1 - pixels[idx]));
          }
        }
      }
    }
  }

  if (f.multiplyStacking >= 0.55 && !isErase && !isSmudge) {
    for (let x = 24; x < 40; x += 1) {
      for (let y = 10; y < 22; y += 1) {
        const idx = y * width + x;
        if (pixels[idx] > 0.04) {
          pixels[idx] = clamp01(1 - (1 - pixels[idx]) * (1 - f.multiplyStacking * 0.34));
        }
      }
    }
  }

  return Object.freeze({
    uid: record.uid,
    width,
    height,
    pixels,
    metrics: measureFingerprintPixels(pixels, width, height),
  });
}

/** 두 64×32 스트로크 지문 사이의 픽셀 RMSE 계산. */
export function computeFingerprintRmse(
  a: BrushStrokeFingerprint64x32,
  b: BrushStrokeFingerprint64x32,
): number {
  const len = Math.min(a.pixels.length, b.pixels.length);
  if (len === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < len; i += 1) {
    const diff = a.pixels[i] - b.pixels[i];
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq / len);
}
