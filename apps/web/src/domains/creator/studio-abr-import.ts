import {
  DEFAULT_STUDIO_BRUSH_DYNAMICS_SETTINGS,
  normalizeStudioBrushDynamicsSettings,
  type NormalizedStudioBrushDynamicsMapping,
  type NormalizedStudioBrushDynamicsSettings,
  type StudioBrushDynamicsSource,
} from "./brush/studio-brush-dynamics";
import {
  studioBrushEngineProgramSetFromOil,
  studioBrushWatercolorProgramSetFrom,
  type StudioBrushEngineProgramSet,
} from "./brush/studio-brush-engine-program-set";
import {
  DEFAULT_STUDIO_BRUSH_SNAPSHOT,
  type StudioBrushSnapshot,
} from "./brush/studio-brush-library";
import {
  buildAbrProgramIr,
  buildStudioAbrR8MipChain,
  mapAbrTextureBlendMode,
  normalizedAbrSignedUnit,
  normalizedAbrUnitFraction,
  resampleStudioAbrR8Alpha,
  type StudioAbrDescriptorSummary,
  type StudioAbrHighResTip,
  type StudioAbrR8MipLevel,
} from "./brush/studio-brush-pack-abr-helpers";
import {
  DEFAULT_STUDIO_CSP_BRUSH_EXTENSIONS,
  normalizeStudioCspBrushExtensions,
} from "./brush/studio-brush-stroke-color-dynamics";
import { STUDIO_BRUSH_CUSTOM_TIP_ALPHA_MAP_MAX_SIZE } from "./brush/studio-brush-tip-stamp";

import type { StudioBrushTextureDepthControlSourceV1 } from "./brush/studio-brush-texture-combine-v1";
import type { BrushProgramIR } from "@toonstudio/studio-project-model";
import type { Abr, Brush, BrushDynamics, BrushShape, SampleInfo } from "ag-psd";

export {
  buildStudioAbrR8MipChain,
  resampleStudioAbrR8Alpha,
  type StudioAbrDescriptorSummary,
  type StudioAbrHighResTip,
  type StudioAbrR8MipLevel,
} from "./brush/studio-brush-pack-abr-helpers";

export const STUDIO_ABR_IMPORT_LIMITS = Object.freeze({
  maxBytes: 32 * 1024 * 1024,
  maxBrushes: 256,
  maxSamples: 512,
  maxSamplePixels: 16 * 1024 * 1024,
  maxTotalSamplePixels: 64 * 1024 * 1024,
  maxNameLength: 96,
  outputTipMin: 8,
  /** High-resolution R8 tip cap (Photopea/Photoshop parity; previously 64px). */
  outputTipMax: 1024,
  /** Compact in-document tip MIP cap matching `STUDIO_BRUSH_CUSTOM_TIP_ALPHA_MAP_MAX_SIZE`. */
  documentTipMax: STUDIO_BRUSH_CUSTOM_TIP_ALPHA_MAP_MAX_SIZE,
  /** Brush stroke width cap (previously 80px). */
  maxStrokeWidth: 500,
});

export type StudioAbrImportErrorCode =
  | "empty"
  | "file-type"
  | "file-size"
  | "signature"
  | "unsupported-version"
  | "limits"
  | "parse"
  | "no-brushes"
  | "worker"
  | "timeout"
  | "aborted";

const ERROR_MESSAGES: Record<StudioAbrImportErrorCode, string> = {
  empty: "ABR 파일이 비어 있습니다.",
  "file-type": "Photoshop 브러시(.abr) 파일을 선택해 주세요.",
  "file-size": "ABR 파일은 32MB 이하여야 합니다.",
  signature: "올바른 Photoshop ABR 파일을 읽지 못했습니다.",
  "unsupported-version": "이 ABR 버전은 아직 지원하지 않습니다. Photoshop에서 최신 ABR로 다시 저장해 주세요.",
  limits: "ABR 브러시나 펜촉 데이터가 안전 처리 한도를 초과했습니다.",
  parse: "ABR 브러시 데이터를 해석하지 못했습니다.",
  "no-brushes": "가져올 수 있는 브러시가 ABR 파일에 없습니다.",
  worker: "ABR 변환 워커를 시작하지 못했습니다.",
  timeout: "ABR 변환 시간이 너무 오래 걸려 중지했습니다.",
  aborted: "ABR 가져오기를 취소했습니다.",
};

export function isStudioAbrImportErrorCode(value: unknown): value is StudioAbrImportErrorCode {
  return typeof value === "string" && Object.hasOwn(ERROR_MESSAGES, value);
}

export class StudioAbrImportError extends Error {
  constructor(readonly code: StudioAbrImportErrorCode, options?: ErrorOptions) {
    super(ERROR_MESSAGES[code], options);
    this.name = "StudioAbrImportError";
  }
}

export interface StudioAbrBrushCandidate {
  readonly name: string;
  readonly snapshot: StudioBrushSnapshot;
  readonly sourceShape: BrushShape["type"];
  readonly sourceSampleId: string | null;
  readonly approximatedFeatures: readonly string[];
  readonly highResTip?: StudioAbrHighResTip;
  readonly program?: BrushProgramIR;
  readonly descriptors?: StudioAbrDescriptorSummary;
}

export interface StudioAbrImportResult {
  readonly brushes: readonly StudioAbrBrushCandidate[];
  readonly sourceBrushCount: number;
  readonly sourceSampleCount: number;
  readonly skippedBrushCount: number;
  readonly approximatedBrushCount: number;
}

const SUPPORTED_ABR_VERSIONS = new Set([6, 7, 9, 10]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function cleanName(value: unknown, index: number): string {
  const source = typeof value === "string" ? value.trim() : "";
  const printable = Array.from(source)
    .filter((character) => (character.codePointAt(0) ?? 0) >= 0x20)
    .join("")
    .trim();
  return (printable || `ABR 브러시 ${index + 1}`).slice(0, STUDIO_ABR_IMPORT_LIMITS.maxNameLength);
}

function stableSeed(value: string, index: number): number {
  let hash = 0x811c9dc5 ^ index;
  for (let cursor = 0; cursor < value.length; cursor++) {
    hash ^= value.charCodeAt(cursor);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function normalizedSampleId(value: string): string {
  return value.replaceAll("\0", "").trim().toLowerCase();
}

function sampleLookup(samples: readonly SampleInfo[]): Map<string, SampleInfo> {
  const result = new Map<string, SampleInfo>();
  for (const sample of samples) {
    const key = normalizedSampleId(sample.id);
    if (key && !result.has(key)) result.set(key, sample);
  }
  return result;
}

/**
 * Convert an arbitrary rectangular ABR sample into a high-resolution square R8 alpha
 * payload (up to 1024px) plus a downsampled MIP chain ending at the 64px document boundary.
 */
export function convertStudioAbrSampleToTip(sample: SampleInfo): StudioAbrHighResTip {
  const { w: width, h: height } = sample.bounds;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > STUDIO_ABR_IMPORT_LIMITS.maxSamplePixels ||
    sample.alpha.length !== width * height
  ) {
    throw new StudioAbrImportError("limits");
  }
  const size = Math.round(clamp(
    Math.max(width, height),
    STUDIO_ABR_IMPORT_LIMITS.outputTipMin,
    STUDIO_ABR_IMPORT_LIMITS.outputTipMax,
  ));
  const scale = size / Math.max(width, height);
  const drawnWidth = Math.max(1, Math.round(width * scale));
  const drawnHeight = Math.max(1, Math.round(height * scale));
  const resized = resampleStudioAbrR8Alpha(sample.alpha, width, height, drawnWidth, drawnHeight);
  const offsetX = Math.floor((size - drawnWidth) / 2);
  const offsetY = Math.floor((size - drawnHeight) / 2);
  const alpha = new Uint8Array(size * size);
  let maximum = 0;
  let total = 0;
  for (let y = 0; y < drawnHeight; y++) {
    for (let x = 0; x < drawnWidth; x++) {
      const value = resized[y * drawnWidth + x] ?? 0;
      alpha[(offsetY + y) * size + offsetX + x] = value;
      maximum = Math.max(maximum, value);
      total += value;
    }
  }
  if (maximum < 8 || total < 32) throw new StudioAbrImportError("parse");
  const mipLevels: readonly StudioAbrR8MipLevel[] = buildStudioAbrR8MipChain(
    alpha,
    size,
    STUDIO_ABR_IMPORT_LIMITS.documentTipMax,
  );
  const docLevel = mipLevels[mipLevels.length - 1]!;
  return {
    alphaMapBase64: mipLevels[0]!.alphaMapBase64,
    alphaMapSize: size,
    documentAlphaMapBase64: docLevel.alphaMapBase64,
    documentAlphaMapSize: docLevel.size,
    mipLevels,
  };
}

function dynamicsSource(value: BrushDynamics["control"]): StudioBrushDynamicsSource | null {
  if (value === "pen pressure") return "pressure";
  if (value === "pen tilt") return "tilt-magnitude";
  if (value === "stylus wheel") return "tangential-pressure";
  if (value === "direction" || value === "initial direction") return "direction";
  if (value === "rotation" || value === "initial rotation") return "twist";
  return null;
}

function multiplicativeMapping(
  dynamics: BrushDynamics | undefined,
  approximated: string[],
): NormalizedStudioBrushDynamicsMapping[] {
  if (!dynamics || dynamics.control === "off" || dynamics.control === "fade") return [];
  const source = dynamicsSource(dynamics.control);
  if (!source) {
    approximated.push(`지원하지 않는 ${dynamics.control} 제어`);
    return [];
  }
  return [{
    source,
    mode: "multiply",
    from: clamp(dynamics.minimum, 0, 1),
    to: 1,
    amount: 1,
    curve: 1,
    invert: false,
  }];
}

function additiveAngleMapping(
  dynamics: BrushDynamics | undefined,
  approximated: string[],
): NormalizedStudioBrushDynamicsMapping[] {
  if (!dynamics || dynamics.control === "off" || dynamics.control === "fade") return [];
  const source = dynamicsSource(dynamics.control);
  if (!source) {
    approximated.push(`지원하지 않는 ${dynamics.control} 각도 제어`);
    return [];
  }
  return [{
    source,
    mode: "add",
    from: -180 * clamp(dynamics.jitter, 0, 1),
    to: 180 * clamp(dynamics.jitter || 1, 0, 1),
    amount: 1,
    curve: 1,
    invert: false,
  }];
}

function proceduralTipFor(shape: BrushShape): NormalizedStudioBrushDynamicsSettings["tip"] {
  const hardness = shape.type === "computed"
    ? clamp(shape.hardness, 0, 1)
    : shape.type === "tips"
      ? clamp(shape.tipsHardness, 0, 1)
      : 0.58;
  const flat = shape.type === "dynamic" || shape.type === "tips"
    ? shape.shape.startsWith("flat")
    : false;
  return {
    shape: flat ? "bristle" : hardness > 0.78 ? "hard" : hardness < 0.28 ? "soft" : "round",
    softness: 1 - hardness,
    alphaMapBase64: null,
    alphaMapSize: 24,
  };
}

function resolveBrushShapeTip(
  shape: BrushShape,
  samples: ReadonlyMap<string, SampleInfo>,
  approximated: string[],
): {
  readonly tip: NormalizedStudioBrushDynamicsSettings["tip"];
  readonly sampleId: string | null;
  readonly highResTip?: StudioAbrHighResTip;
} | null {
  if (shape.type === "sampled") {
    const sample = samples.get(normalizedSampleId(shape.sampledData));
    if (!sample) return null;
    try {
      const tip = convertStudioAbrSampleToTip(sample);
      return {
        tip: {
          shape: "round",
          softness: 0,
          alphaMapBase64: tip.documentAlphaMapBase64,
          alphaMapSize: tip.documentAlphaMapSize,
        },
        sampleId: sample.id,
        highResTip: tip,
      };
    } catch {
      return null;
    }
  }
  if (shape.type === "tips" && shape.tipsErodibleTipHeightMap?.length && shape.tipsGridSize) {
    const grid = Math.trunc(shape.tipsGridSize);
    if (grid > 0 && shape.tipsErodibleTipHeightMap.length === grid * grid) {
      try {
        const tip = convertStudioAbrSampleToTip({
          id: "tips-heightmap",
          bounds: { x: 0, y: 0, w: grid, h: grid },
          alpha: Uint8Array.from(shape.tipsErodibleTipHeightMap, (value) => clamp(value, 0, 255)),
        });
        return {
          tip: {
            shape: "bristle",
            softness: 1 - clamp(shape.tipsHardness, 0, 1),
            alphaMapBase64: tip.documentAlphaMapBase64,
            alphaMapSize: tip.documentAlphaMapSize,
          },
          sampleId: null,
          highResTip: tip,
        };
      } catch {
        approximated.push("침식형 펜촉 높이맵");
      }
    }
  }
  return { tip: proceduralTipFor(shape), sampleId: null };
}

function brushSnapshot(
  brush: Brush,
  name: string,
  index: number,
  tip: NormalizedStudioBrushDynamicsSettings["tip"],
  samples: ReadonlyMap<string, SampleInfo>,
  approximated: string[],
): {
  snapshot: StudioBrushSnapshot;
  descriptors: StudioAbrDescriptorSummary;
  size: number;
  opacity: number;
  spacingRatio: number;
} {
  const shape = brush.shape;
  const size = clamp(shape.size, 1, STUDIO_ABR_IMPORT_LIMITS.maxStrokeWidth);
  const pose = brush.brushPose;
  const baseAngle = pose?.overrideAngle ? clamp(pose.angle, -180, 180) : clamp(shape.angle, -180, 180);
  const roundness = clamp(
    shape.type === "computed" || shape.type === "sampled"
      ? shape.roundness
      : shape.shape.startsWith("flat")
        ? 0.3
        : 1,
    0.08,
    1,
  );
  const spacingRatio = clamp(shape.spacingOn ? shape.spacing : brush.spacing, 0.01, 16);
  const sizeDyn = brush.shapeDynamics?.sizeDynamics;
  const opacityDyn = brush.transfer?.opacityDynamics ?? brush.toolOptions?.opacityDynamics;
  const flowDyn = brush.transfer?.flowDynamics ?? brush.toolOptions?.flowDynamics;

  const sizeMappings = multiplicativeMapping(sizeDyn, approximated);
  const opacityMappings = multiplicativeMapping(opacityDyn, approximated);
  const flowMappings = multiplicativeMapping(flowDyn, approximated);
  const angleMappings = additiveAngleMapping(brush.shapeDynamics?.angleDynamics, approximated);
  const roundnessMappings = multiplicativeMapping(brush.shapeDynamics?.roundnessDynamics, approximated);
  const scatterAmount = brush.scatter
    ? clamp(Math.max(brush.scatter.scatterDynamics.jitter, brush.scatter.countDynamics.jitter), 0, 1)
    : 0;
  const scatterMappings = brush.scatter
    ? multiplicativeMapping(brush.scatter.scatterDynamics, approximated)
    : [];
  const importedOpacity = clamp(normalizedAbrUnitFraction(brush.toolOptions?.opacity, 1), 0.05, 1);
  const importedFlow = clamp(normalizedAbrUnitFraction(brush.toolOptions?.flow, 1), 0, 1);

  const dualBrushSettings = brush.dualBrush
    ? {
        enabled: true,
        tip: resolveBrushShapeTip(brush.dualBrush.shape, samples, approximated)?.tip
          ?? proceduralTipFor(brush.dualBrush.shape),
        blendMode: (/screen|lighten|dodge/iu.test(brush.dualBrush.blendMode ?? "") ? "screen" : "multiply") as "screen" | "multiply",
        sizeRatio: clamp(brush.dualBrush.shape.size / Math.max(1, shape.size), 0.25, 2),
      }
    : undefined;

  const grainSettings = brush.texture
    ? (() => {
        const depth = normalizedAbrUnitFraction(brush.texture.depth, 0.75);
        const depthSource = dynamicsSource(brush.texture.depthDynamics.control);
        return {
          space: (brush.texture.textureEachTip ? "stroke-fixed" : "canvas-fixed") as "stroke-fixed" | "canvas-fixed",
          amount: depth,
          scale: clamp(Math.max(0.05, brush.texture.scale) * 16, 0.25, 512),
          contrast: clamp((normalizedAbrSignedUnit(brush.texture.contrast) + 1) / 2, 0, 1),
          seed: stableSeed(brush.texture.id || brush.texture.name || name, index + 31),
          texture: {
            mode: mapAbrTextureBlendMode(brush.texture.blendMode),
            depth,
            depthJitter: clamp(brush.texture.depthDynamics.jitter, 0, 1),
            minimumDepth: normalizedAbrUnitFraction(brush.texture.depthMinimum, 0),
            brightness: normalizedAbrSignedUnit(brush.texture.brightness),
            contrast: normalizedAbrSignedUnit(brush.texture.contrast),
            invert: brush.texture.invert === true,
            ...(depthSource
              ? {
                  depthControl: {
                    source: depthSource as StudioBrushTextureDepthControlSourceV1,
                    strength: 1,
                    curve: 1,
                    invert: false,
                  },
                }
              : {}),
          },
        };
      })()
    : undefined;

  const cd = brush.colorDynamics;
  const colorDynamicsSettings = cd
    ? {
        foregroundBackgroundMix: normalizedAbrUnitFraction(cd.foregroundBackground.minimum, 0),
        foregroundBackgroundJitter: normalizedAbrUnitFraction(cd.foregroundBackground.jitter, 0),
        hueJitter: clamp(normalizedAbrUnitFraction(cd.hue, 0) * 180, 0, 180),
        saturationJitter: normalizedAbrUnitFraction(cd.saturation, 0),
        valueJitter: normalizedAbrUnitFraction(cd.brightness, 0),
      }
    : undefined;

  const hasSizeFade = sizeDyn?.control === "fade";
  const hasOpacityFade = opacityDyn?.control === "fade" || flowDyn?.control === "fade";
  const taperSettings = hasSizeFade || hasOpacityFade
    ? {
        enabled: true,
        startLength: 0,
        endLength: 0.45,
        minSizeRatio: hasSizeFade ? clamp(sizeDyn!.minimum, 0, 1) : 1,
        minOpacityRatio: hasOpacityFade ? clamp(opacityDyn?.minimum ?? flowDyn?.minimum ?? 0, 0, 1) : 1,
        curve: 1,
      }
    : undefined;

  const normalizedDynamics = normalizeStudioBrushDynamicsSettings({
    ...DEFAULT_STUDIO_BRUSH_DYNAMICS_SETTINGS,
    seed: stableSeed(name, index),
    fallbackPressure: pose?.overridePressure
      ? normalizedAbrUnitFraction(pose.pressure, 0.5)
      : DEFAULT_STUDIO_BRUSH_DYNAMICS_SETTINGS.fallbackPressure,
    spacingRatio,
    scatterRatio: scatterAmount > 0 ? scatterAmount * 2 : null,
    ...(taperSettings ? { taper: taperSettings } : {}),
    tip,
    ...(dualBrushSettings ? { dualBrush: dualBrushSettings } : {}),
    ...(grainSettings ? { grain: grainSettings } : {}),
    ...(colorDynamicsSettings ? { colorDynamics: colorDynamicsSettings } : {}),
    width: {
      ...DEFAULT_STUDIO_BRUSH_DYNAMICS_SETTINGS.width,
      base: size,
      mappings: sizeMappings,
      jitter: sizeDyn && sizeDyn.jitter > 0 ? { mode: "multiply", amount: clamp(sizeDyn.jitter, 0, 1) } : null,
    },
    opacity: {
      ...DEFAULT_STUDIO_BRUSH_DYNAMICS_SETTINGS.opacity,
      base: importedOpacity,
      mappings: opacityMappings,
      jitter: opacityDyn && opacityDyn.jitter > 0 ? { mode: "multiply", amount: clamp(opacityDyn.jitter, 0, 1) } : null,
    },
    flow: {
      ...DEFAULT_STUDIO_BRUSH_DYNAMICS_SETTINGS.flow,
      base: importedFlow,
      mappings: flowMappings,
      jitter: flowDyn && flowDyn.jitter > 0 ? { mode: "multiply", amount: clamp(flowDyn.jitter, 0, 1) } : null,
    },
    scatter: {
      ...DEFAULT_STUDIO_BRUSH_DYNAMICS_SETTINGS.scatter,
      mappings: scatterMappings,
      jitter: brush.scatter && brush.scatter.scatterDynamics.jitter > 0
        ? { mode: "multiply", amount: clamp(brush.scatter.scatterDynamics.jitter, 0, 1) }
        : null,
    },
    angle: {
      ...DEFAULT_STUDIO_BRUSH_DYNAMICS_SETTINGS.angle,
      base: baseAngle,
      mappings: angleMappings,
      jitter: brush.shapeDynamics && brush.shapeDynamics.angleDynamics.jitter > 0
        ? { mode: "add", amount: clamp(brush.shapeDynamics.angleDynamics.jitter * 180, 0, 180) }
        : null,
    },
    roundness: {
      ...DEFAULT_STUDIO_BRUSH_DYNAMICS_SETTINGS.roundness,
      base: roundness,
      mappings: roundnessMappings,
      jitter: brush.shapeDynamics && brush.shapeDynamics.roundnessDynamics.jitter > 0
        ? { mode: "multiply", amount: clamp(brush.shapeDynamics.roundnessDynamics.jitter, 0, 1) }
        : null,
    },
  });

  const dynamics: NormalizedStudioBrushDynamicsSettings = cd && cd.perTip === false
    ? {
        ...normalizedDynamics,
        cspBrushExtensions: normalizeStudioCspBrushExtensions({
          ...DEFAULT_STUDIO_CSP_BRUSH_EXTENSIONS,
          strokeColorAndScale: {
            perStrokeColorJitter: true,
            strokeHueJitterDeg: clamp(normalizedAbrUnitFraction(cd.hue, 0) * 180, 0, 180),
            strokeSaturationJitter: normalizedAbrUnitFraction(cd.saturation, 0),
            strokeValueJitter: normalizedAbrUnitFraction(cd.brightness, 0),
            subColorMixSource: cd.foregroundBackground.control === "pen pressure"
              ? "pressure"
              : cd.foregroundBackground.control === "pen tilt"
                ? "tilt"
                : "off",
            subColorMaxMix: normalizedAbrUnitFraction(cd.foregroundBackground.jitter || cd.foregroundBackground.minimum, 0.5),
          },
        }),
      }
    : normalizedDynamics;

  let brushId = "ink-particle";
  let enginePrograms: StudioBrushEngineProgramSet | null = null;
  if (brush.toolOptions?.type === "smudge brush") {
    brushId = "web-smudge-trail";
  } else if (brush.toolOptions?.type === "mixer brush") {
    brushId = "oil";
    enginePrograms = studioBrushEngineProgramSetFromOil({
      bristlePhysics: true,
      bristleLoadDynamics: true,
      impastoRelief: false,
    });
  } else if (brush.wetEdges) {
    enginePrograms = studioBrushWatercolorProgramSetFrom({ wetEdgeBloomProgramId: "edge-bloom" });
  }

  const descriptors: StudioAbrDescriptorSummary = {
    hasDualBrush: Boolean(brush.dualBrush),
    hasTexture: Boolean(brush.texture),
    hasColorDynamics: Boolean(brush.colorDynamics),
    wetEdges: Boolean(brush.wetEdges),
    hasScatter: Boolean(brush.scatter),
    hasBrushPose: Boolean(pose),
    hasTransfer: Boolean(brush.transfer),
    ...(pose
      ? {
          brushPose: {
            overrideAngle: Boolean(pose.overrideAngle),
            overrideTiltX: Boolean(pose.overrideTiltX),
            overrideTiltY: Boolean(pose.overrideTiltY),
            overridePressure: Boolean(pose.overridePressure),
            tiltX: clamp(pose.tiltX, -90, 90),
            tiltY: clamp(pose.tiltY, -90, 90),
            angle: clamp(pose.angle, -180, 180),
            pressure: normalizedAbrUnitFraction(pose.pressure, 1),
          },
        }
      : {}),
  };

  return {
    snapshot: {
      ...DEFAULT_STUDIO_BRUSH_SNAPSHOT,
      brushId,
      strokeWidth: size,
      brushOpacity: importedOpacity,
      stabilizer: clamp((brush.toolOptions?.smoothingValue ?? 0) / 10, 0, 10),
      postCorrection: clamp((brush.toolOptions?.smooth ?? 0) / 10, 0, 10),
      tiltEnabled: Boolean(pose?.overrideTiltX || pose?.overrideTiltY || DEFAULT_STUDIO_BRUSH_SNAPSHOT.tiltEnabled),
      tipAngle: baseAngle,
      tipRoundness: roundness,
      brushDynamics: dynamics,
      enginePrograms,
    },
    descriptors,
    size,
    opacity: importedOpacity,
    spacingRatio,
  };
}

/** Convert a parsed ABR document without DOM or worker dependencies. */
export function convertStudioAbrDocument(document: Abr): StudioAbrImportResult {
  if (!document || !Array.isArray(document.brushes) || !Array.isArray(document.samples)) {
    throw new StudioAbrImportError("parse");
  }
  if (
    document.brushes.length > STUDIO_ABR_IMPORT_LIMITS.maxBrushes ||
    document.samples.length > STUDIO_ABR_IMPORT_LIMITS.maxSamples
  ) {
    throw new StudioAbrImportError("limits");
  }
  let totalSamplePixels = 0;
  for (const sample of document.samples) {
    const pixels = sample.bounds.w * sample.bounds.h;
    if (!Number.isSafeInteger(pixels) || pixels < 1 || pixels > STUDIO_ABR_IMPORT_LIMITS.maxSamplePixels) {
      throw new StudioAbrImportError("limits");
    }
    totalSamplePixels += pixels;
    if (totalSamplePixels > STUDIO_ABR_IMPORT_LIMITS.maxTotalSamplePixels) {
      throw new StudioAbrImportError("limits");
    }
  }
  const samples = sampleLookup(document.samples);
  const brushes: StudioAbrBrushCandidate[] = [];
  let skippedBrushCount = 0;
  let approximatedBrushCount = 0;
  for (let index = 0; index < document.brushes.length; index++) {
    const brush = document.brushes[index]!;
    const approximated: string[] = [];
    const shape = resolveBrushShapeTip(brush.shape, samples, approximated);
    if (!shape) {
      skippedBrushCount++;
      continue;
    }
    const name = cleanName(brush.name, index);
    const built = brushSnapshot(brush, name, index, shape.tip, samples, approximated);
    const program = buildAbrProgramIr(
      brush,
      name,
      index,
      stableSeed(name, index),
      built.size,
      built.opacity,
      built.spacingRatio,
      shape.sampleId,
    );
    const uniqueApproximations = [...new Set(approximated)];
    if (uniqueApproximations.length > 0) approximatedBrushCount++;
    brushes.push(Object.freeze({
      name,
      snapshot: built.snapshot,
      sourceShape: brush.shape.type,
      sourceSampleId: shape.sampleId,
      approximatedFeatures: Object.freeze(uniqueApproximations),
      ...(shape.highResTip ? { highResTip: shape.highResTip } : {}),
      program,
      descriptors: built.descriptors,
    }));
  }
  if (brushes.length === 0) throw new StudioAbrImportError("no-brushes");
  return Object.freeze({
    brushes: Object.freeze(brushes),
    sourceBrushCount: document.brushes.length,
    sourceSampleCount: document.samples.length,
    skippedBrushCount,
    approximatedBrushCount,
  });
}

export function assertStudioAbrEnvelope(bytes: Uint8Array): void {
  if (bytes.byteLength === 0) throw new StudioAbrImportError("empty");
  if (bytes.byteLength > STUDIO_ABR_IMPORT_LIMITS.maxBytes) throw new StudioAbrImportError("file-size");
  if (bytes.byteLength < 4) throw new StudioAbrImportError("signature");
  const version = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(0, false);
  if (version === 1 || version === 2) throw new StudioAbrImportError("unsupported-version");
  if (!SUPPORTED_ABR_VERSIONS.has(version)) throw new StudioAbrImportError("signature");
}

/** `ag-psd` stays outside the Studio eager graph and is loaded only inside the ABR worker/fallback. */
export async function parseStudioAbrBuffer(bytes: ArrayBuffer): Promise<StudioAbrImportResult> {
  const view = new Uint8Array(bytes);
  assertStudioAbrEnvelope(view);
  try {
    const { readAbr } = await import("ag-psd");
    return convertStudioAbrDocument(readAbr(view, { logMissingFeatures: false }));
  } catch (error) {
    if (error instanceof StudioAbrImportError) throw error;
    throw new StudioAbrImportError("parse", { cause: error });
  }
}

export function studioAbrImportErrorMessage(error: unknown): string {
  return error instanceof StudioAbrImportError ? error.message : ERROR_MESSAGES.parse;
}
