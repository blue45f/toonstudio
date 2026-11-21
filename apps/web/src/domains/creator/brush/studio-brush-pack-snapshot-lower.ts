/**
 * Lossless `BrushProgramIR` (+ CSP / Procreate feature extensions) → `StudioBrushSnapshot`
 * lowering engine.
 *
 * Extracted from `studio-brush-pack-import.ts` so both files stay well below the
 * 800-line source-size ratchet while supporting:
 * - Brush stroke widths up to 500px (previously clamped at 80px),
 * - Non-linear pressure/tilt/velocity/twist LUT preservation via cubic Bezier fitting
 *   (`curveMode: "bezier"`, compiled to 256-tap `curveLUT`), removing linear flattening,
 * - Embedded PNG tip decoding into in-document R8 alpha maps + high-res R8 MIP chains,
 * - Media-appropriate brush lane routing (watercolor / oil / smudge / pencil / charcoal /
 *   airbrush / ink) instead of forcing every import onto `"ink-particle"`,
 * - Full CSP (`waterColor`/`waterEdge`/`dualBrush`/`texture`/`taper`) and Procreate
 *   (`wetMix`/`taper`/`dualBrush`/`grain`/`colorDynamics`) extension preservation.
 */

import {
  buildR8TipPyramid,
  decodePngToR8AlphaMask,
  type R8TipPyramid,
} from "../../../../../../packages/studio-format-gateway/src/png-alpha-decode";
import { STABILIZER_MAX } from "../studio-brush";

import {
  DEFAULT_STUDIO_BRUSH_DYNAMICS_SETTINGS,
  evaluateCubicBezierCurve,
  normalizeStudioBrushDynamicsSettings,
  type NormalizedStudioBrushDynamicsMapping,
  type NormalizedStudioBrushDynamicsSettings,
  type StudioBrushDynamicsSource,
} from "./studio-brush-dynamics";
import {
  studioBrushEngineProgramSetFromOil,
  studioBrushWatercolorProgramSetFrom,
  type StudioBrushEngineProgramSet,
} from "./studio-brush-engine-program-set";
import {
  DEFAULT_STUDIO_BRUSH_SNAPSHOT,
  type StudioBrushSnapshot,
} from "./studio-brush-library";
import { packWarning, type StudioBrushPackWarning } from "./studio-brush-pack-import-types";
import {
  DEFAULT_STUDIO_CSP_BRUSH_EXTENSIONS,
  normalizeStudioCspBrushExtensions,
  type NormalizedStudioCspBrushExtensions,
} from "./studio-brush-stroke-color-dynamics";
import {
  STUDIO_BRUSH_TEXTURE_COMBINE_MODES_V1,
  type StudioBrushTextureCombineModeV1,
} from "./studio-brush-texture-combine-v1";
import { STUDIO_BRUSH_CUSTOM_TIP_ALPHA_MAP_MAX_SIZE } from "./studio-brush-tip-stamp";

import type { CspProgramFeatureExtensions } from "../../../../../../packages/studio-format-gateway/src/csp-sut-variant-schema";
import type { ProcreateBrushFeatures } from "../../../../../../packages/studio-format-gateway/src/procreate-brushset";
import type { BrushProgramIR, DynamicInputIR, DynamicMappingIR } from "@toonstudio/studio-project-model";

/** Krita's stock UI diameter cap — the same reference `kpp.ts` / `csp-sut.ts` normalize against. */
export const KRITA_REFERENCE_MAX_DIAMETER_PX = 1000;

/** libmypaint stores `radius_logarithmic`; `myb.ts` divides the LUT by this. */
export const MYPAINT_LOG_RADIUS_SCALE = 6;

export const MIN_STROKE_WIDTH = 1;
export const MAX_STROKE_WIDTH = 500;
const MIN_OPACITY = 0.05;
const LUT_LINEARITY_TOLERANCE = 0.02;

export interface StudioBrushSnapshotLowerOptions {
  readonly cspFeatures?: CspProgramFeatureExtensions;
  readonly procreateFeatures?: ProcreateBrushFeatures;
  readonly tipPngBase64?: string | null;
  readonly tipPyramid?: R8TipPyramid | null;
}

export interface StudioBrushProgramSnapshotResult {
  readonly snapshot: StudioBrushSnapshot;
  /** IR fields this map cannot carry into a drawable setting. */
  readonly unmapped: readonly string[];
  readonly warnings: readonly StudioBrushPackWarning[];
  readonly highResTip?: {
    readonly alphaMapBase64: string;
    readonly alphaMapSize: number;
    readonly mipLevels: readonly { readonly size: number; readonly alphaMapBase64: string }[];
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function mappingsOf(
  dynamics: readonly DynamicMappingIR[],
  input: DynamicMappingIR["input"],
): DynamicMappingIR[] {
  return dynamics.filter((mapping) => mapping.input === input);
}

function constantValue(mapping: DynamicMappingIR): number {
  return mapping.curve[0] ?? 0;
}

function lutRange(mappings: readonly DynamicMappingIR[]): { low: number; high: number } | null {
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (const mapping of mappings) {
    for (const tap of mapping.curve) {
      if (!Number.isFinite(tap)) continue;
      low = Math.min(low, tap);
      high = Math.max(high, tap);
    }
  }
  return Number.isFinite(low) && Number.isFinite(high) ? { low, high } : null;
}

function lutLinearityError(taps: readonly number[]): number {
  const first = taps[0];
  const last = taps[taps.length - 1];
  if (first === undefined || last === undefined || taps.length < 3) return 0;
  const span = last - first;
  let worst = 0;
  for (let index = 1; index < taps.length - 1; index += 1) {
    const t = index / (taps.length - 1);
    const expected = first + span * t;
    worst = Math.max(worst, Math.abs((taps[index] ?? expected) - expected));
  }
  return worst;
}

/**
 * Fits cubic Bezier control points `[p1x, p1y, p2x, p2y]` to a normalized `[0,1] → [0,1]`
 * LUT using deterministic coordinate descent directly against `evaluateCubicBezierCurve`.
 */
export function fitCubicBezierToNormalizedLut(
  taps: readonly number[],
): { readonly controlPoints: readonly [number, number, number, number]; readonly rmsError: number } {
  const n = taps.length;
  if (n < 3) return { controlPoints: [0.33, 0.33, 0.67, 0.67], rmsError: 0 };

  const evaluateMse = (p: readonly [number, number, number, number]): number => {
    let sumSq = 0;
    for (let i = 0; i < n; i += 1) {
      const x = i / (n - 1);
      const pred = evaluateCubicBezierCurve(x, p[0], p[1], p[2], p[3]);
      const diff = pred - (taps[i] ?? x);
      sumSq += diff * diff;
    }
    return sumSq / n;
  };

  // Seed from 1/3 and 2/3 sample targets
  const y1 = taps[Math.round((n - 1) / 3)] ?? 0.33;
  const y2 = taps[Math.round(((n - 1) * 2) / 3)] ?? 0.67;
  let best: [number, number, number, number] = [0.33, clamp(y1, 0, 1), 0.67, clamp(y2, 0, 1)];
  let bestErr = evaluateMse(best);

  for (const step of [0.2, 0.08, 0.03, 0.01]) {
    for (let pass = 0; pass < 3; pass += 1) {
      let improved = false;
      for (let dim = 0; dim < 4; dim += 1) {
        const minBound = dim === 0 || dim === 2 ? 0.02 : 0;
        const maxBound = dim === 0 || dim === 2 ? 0.98 : 1;
        for (const dir of [-1, 1] as const) {
          const candidate: [number, number, number, number] = [...best];
          candidate[dim] = clamp(candidate[dim]! + dir * step, minBound, maxBound);
          const err = evaluateMse(candidate);
          if (err + 1e-9 < bestErr) {
            best = candidate;
            bestErr = err;
            improved = true;
          }
        }
      }
      if (!improved) break;
    }
  }

  return {
    controlPoints: [
      Math.round(best[0] * 10_000) / 10_000,
      Math.round(best[1] * 10_000) / 10_000,
      Math.round(best[2] * 10_000) / 10_000,
      Math.round(best[3] * 10_000) / 10_000,
    ] as const,
    rmsError: Math.sqrt(bestErr),
  };
}

function dynamicSourceForIrInput(input: DynamicInputIR): StudioBrushDynamicsSource | null {
  switch (input) {
    case "pressure": return "pressure";
    case "velocity": return "speed";
    case "tiltAltitude": return "tilt-magnitude";
    case "tiltAzimuth": return "tilt-azimuth";
    case "twist": return "twist";
    case "constant":
    case "random":
      return null;
  }
}

function buildMappingFromIr(
  mapping: DynamicMappingIR,
  source: StudioBrushDynamicsSource,
  fromOverride?: number,
  toOverride?: number,
): NormalizedStudioBrushDynamicsMapping {
  const curve = mapping.curve;
  const first = curve[0] ?? 0;
  const last = curve[curve.length - 1] ?? 1;
  const inverted = last < first;
  const ordered = inverted ? [...curve].reverse() : curve;
  const low = Math.min(...ordered);
  const high = Math.max(...ordered);
  const span = high - low;
  const from = fromOverride ?? clamp(low, 0, 1);
  const to = toOverride ?? clamp(high > 0 ? high : 1, 0, 1);

  if (span > 1e-6 && lutLinearityError(ordered) > LUT_LINEARITY_TOLERANCE) {
    const normalizedTaps = ordered.map((tap) => clamp((tap - low) / span, 0, 1));
    const { controlPoints } = fitCubicBezierToNormalizedLut(normalizedTaps);
    return {
      source,
      mode: "multiply",
      from,
      to,
      amount: 1,
      curve: 1,
      curveMode: "bezier",
      curveControlPoints: controlPoints,
      invert: inverted,
    };
  }

  return {
    source,
    mode: "multiply",
    from,
    to,
    amount: 1,
    curve: 1,
    invert: inverted,
  };
}

interface SizeResolution {
  strokeWidth: number;
  requestedStrokeWidth: number;
  pressureMinRatio: number;
  hasPressure: boolean;
  isMypaintLog: boolean;
}

function resolveSize(sizeDynamics: readonly DynamicMappingIR[]): SizeResolution {
  const constants = mappingsOf(sizeDynamics, "constant");
  const pressures = mappingsOf(sizeDynamics, "pressure");
  const pressureRange = lutRange(pressures);

  if (constants.length > 0) {
    const fraction = constants.reduce((product, mapping) => product * constantValue(mapping), 1);
    const requestedStrokeWidth = Math.round(fraction * KRITA_REFERENCE_MAX_DIAMETER_PX);
    const strokeWidth = clamp(requestedStrokeWidth, MIN_STROKE_WIDTH, MAX_STROKE_WIDTH);
    return {
      strokeWidth,
      requestedStrokeWidth,
      pressureMinRatio: pressureRange ? clamp(pressureRange.low, 0, 1) : 0,
      hasPressure: pressures.length > 0,
      isMypaintLog: false,
    };
  }

  if (pressureRange) {
    const widest = 2 * Math.exp(pressureRange.high * MYPAINT_LOG_RADIUS_SCALE);
    const narrowest = 2 * Math.exp(pressureRange.low * MYPAINT_LOG_RADIUS_SCALE);
    const requestedStrokeWidth = Math.round(widest);
    const strokeWidth = clamp(requestedStrokeWidth, MIN_STROKE_WIDTH, MAX_STROKE_WIDTH);
    return {
      strokeWidth,
      requestedStrokeWidth,
      pressureMinRatio: widest > 0 ? clamp(narrowest / widest, 0, 1) : 0,
      hasPressure: true,
      isMypaintLog: true,
    };
  }

  return {
    strokeWidth: DEFAULT_STUDIO_BRUSH_SNAPSHOT.strokeWidth,
    requestedStrokeWidth: DEFAULT_STUDIO_BRUSH_SNAPSHOT.strokeWidth,
    pressureMinRatio: 0,
    hasPressure: false,
    isMypaintLog: false,
  };
}

interface FlowResolution {
  opacity: number;
  requestedOpacity: number;
  pressureMinRatio: number;
  hasPressure: boolean;
}

function resolveFlow(flowDynamics: readonly DynamicMappingIR[]): FlowResolution {
  const constants = mappingsOf(flowDynamics, "constant");
  const pressures = mappingsOf(flowDynamics, "pressure");
  const pressureRange = lutRange(pressures);
  const constantFactor = constants.reduce(
    (product, mapping) => product * constantValue(mapping),
    1,
  );
  const peak = pressureRange ? pressureRange.high : 1;
  const requestedOpacity = constantFactor * peak;
  const opacity = clamp(requestedOpacity, MIN_OPACITY, 1);
  return {
    opacity,
    requestedOpacity,
    pressureMinRatio:
      pressureRange && pressureRange.high > 0
        ? clamp(pressureRange.low / pressureRange.high, 0, 1)
        : 0,
    hasPressure: pressures.length > 0,
  };
}

function base64ToBytes(encoded: string): Uint8Array | null {
  try {
    const cleaned = encoded.replace(/\s+/gu, "");
    const binary = globalThis.atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i) & 0xff;
    return bytes;
  } catch {
    return null;
  }
}

function decodeTipPyramidFromBase64(pngBase64: string): R8TipPyramid | null {
  const pngBytes = base64ToBytes(pngBase64);
  if (!pngBytes) return null;
  const decoded = decodePngToR8AlphaMask(pngBytes, "auto");
  if (!decoded) return null;
  return buildR8TipPyramid(decoded.alpha, decoded.width, decoded.height, {
    minSize: 8,
    maxSize: 1024,
    documentMaxSize: STUDIO_BRUSH_CUSTOM_TIP_ALPHA_MAP_MAX_SIZE,
  });
}

function resolveMediaBrushRoute(
  program: BrushProgramIR,
  options: StudioBrushSnapshotLowerOptions,
): { brushId: string; enginePrograms: StudioBrushEngineProgramSet | null } {
  const nameLower = program.name.toLowerCase();
  const csp = options.cspFeatures;
  const procreate = options.procreateFeatures;

  // 1. Smudge / blender lane
  if (
    program.mixing.kind === "smudge" ||
    /(?:smudge|스머지|혼색|블렌더|blender|blur)/u.test(nameLower)
  ) {
    return { brushId: "web-smudge-trail", enginePrograms: null };
  }

  // 2. Watercolor / wet-edge / sumi wash lane
  const isSumi = /(?:sumi|수묵|먹|ink-?wash|inkwash)/u.test(nameLower);
  const isGouache = /(?:gouache|과슈)/u.test(nameLower);
  const isOil = /(?:유화|유채|\boil\b|acrylic|아크릴|impasto|임파스토|filbert)/u.test(nameLower);
  const hasWet =
    program.mixing.kind === "wet" ||
    csp?.waterColor?.enabled === true ||
    csp?.waterEdge?.enabled === true ||
    procreate?.wetMix.enabled === true ||
    /(?:수채|watercolor|watercolour|\bwash\b|워시|번짐|물붓)/u.test(nameLower);

  if (isOil) {
    return {
      brushId: "oil",
      enginePrograms: studioBrushEngineProgramSetFromOil({
        bristlePhysics: true,
        bristleLoadDynamics: true,
        impastoRelief: true,
      }),
    };
  }
  if (hasWet || isSumi || isGouache) {
    const brushId = isSumi ? "ink-wash" : isGouache ? "gouache" : "watercolor";
    const wantsBloom =
      csp?.waterEdge?.enabled === true ||
      (procreate?.wetMix.dilution ?? 0) > 0.1 ||
      program.mixing.strength >= 0.25;
    return {
      brushId,
      enginePrograms: wantsBloom
        ? studioBrushWatercolorProgramSetFrom({ wetEdgeBloomProgramId: "edge-bloom" })
        : null,
    };
  }

  // 3. Dry media (charcoal, chalk, pastel, crayon, pencil)
  if (/(?:목탄|charcoal|콘테|conte)/u.test(nameLower)) {
    return { brushId: "charcoal", enginePrograms: null };
  }
  if (/(?:초크|chalk|분필)/u.test(nameLower)) {
    return { brushId: "chalk", enginePrograms: null };
  }
  if (/(?:파스텔|pastel)/u.test(nameLower)) {
    return { brushId: "pastel", enginePrograms: null };
  }
  if (/(?:크레용|crayon)/u.test(nameLower)) {
    return { brushId: "crayon", enginePrograms: null };
  }
  if (/(?:연필|pencil|흑연|graphite|샤프|스케치|sketch)/u.test(nameLower)) {
    return { brushId: "erodible-pencil", enginePrograms: null };
  }

  // 4. Airbrush / soft spray
  if (/(?:스프레이|spray|스플래터|splatter|흩뿌리)/u.test(nameLower)) {
    return { brushId: "spray", enginePrograms: null };
  }
  if (
    /(?:에어브러시|airbrush|소프트|soft|블러|mist)/u.test(nameLower) ||
    program.tip.hardness <= 0.35
  ) {
    return { brushId: "airbrush", enginePrograms: null };
  }

  // 5. Crisp ink / pen default
  return { brushId: "ink-particle", enginePrograms: null };
}

function stableSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (let cursor = 0; cursor < value.length; cursor += 1) {
    hash ^= value.charCodeAt(cursor);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mapTextureCombineMode(mode: string | number | null | undefined): StudioBrushTextureCombineModeV1 {
  if (typeof mode === "string") {
    const normalized = mode.toLowerCase().replace(/\s+/gu, "-");
    if ((STUDIO_BRUSH_TEXTURE_COMBINE_MODES_V1 as readonly string[]).includes(normalized)) {
      return normalized as StudioBrushTextureCombineModeV1;
    }
  }
  if (typeof mode === "number") {
    switch (Math.trunc(mode)) {
      case 1: return "subtract";
      case 2: return "darken";
      case 3: return "overlay";
      case 4: return "color-burn";
      case 5: return "linear-burn";
      case 6: return "height";
      default: return "multiply";
    }
  }
  return "multiply";
}

function proceduralTipFor(hardness: number): NormalizedStudioBrushDynamicsSettings["tip"] {
  const clamped = clamp(hardness, 0, 1);
  return {
    shape: clamped > 0.78 ? "hard" : clamped < 0.28 ? "soft" : "round",
    softness: 1 - clamped,
    alphaMapBase64: null,
    alphaMapSize: DEFAULT_STUDIO_BRUSH_DYNAMICS_SETTINGS.tip.alphaMapSize,
  };
}

/**
 * Maps a parsed `BrushProgramIR` (plus optional CSP/Procreate features and embedded PNG tip)
 * onto a lossless, drawable `StudioBrushSnapshot`.
 */
export function studioBrushSnapshotFromProgram(
  program: BrushProgramIR,
  options: StudioBrushSnapshotLowerOptions = {},
): StudioBrushProgramSnapshotResult {
  const unmapped: string[] = [];
  const warnings: StudioBrushPackWarning[] = [];

  const size = resolveSize(program.sizeDynamics);
  const flow = resolveFlow(program.flowDynamics);

  if (size.requestedStrokeWidth !== size.strokeWidth) {
    warnings.push(packWarning("warn.strokeWidthClamped", {
      requested: String(size.requestedStrokeWidth),
      applied: String(size.strokeWidth),
      min: String(MIN_STROKE_WIDTH),
      max: String(MAX_STROKE_WIDTH),
    }));
  }
  if (Math.abs(flow.requestedOpacity - flow.opacity) > 1e-9) {
    warnings.push(packWarning("warn.opacityClamped"));
  }

  // Lower ALL supported size & flow dynamics mappings (including non-linear cubic Bezier LUTs)
  const widthMappings: NormalizedStudioBrushDynamicsMapping[] = [];
  for (const mapping of program.sizeDynamics) {
    if (mapping.input === "constant") continue;
    const source = dynamicSourceForIrInput(mapping.input);
    if (!source) {
      unmapped.push(`sizeDynamics(${mapping.input})`);
      continue;
    }
    if (mapping.input === "pressure" && size.isMypaintLog) {
      // Convert log-radius LUT taps to linear [minRatio..1] multiplier preserving non-linear shape
      const taps = mapping.curve.map((tap) => Math.exp(tap * MYPAINT_LOG_RADIUS_SCALE));
      const peak = Math.max(...taps, 1e-6);
      const linearCurve = taps.map((radius) => clamp(radius / peak, 0, 1));
      widthMappings.push(buildMappingFromIr({ ...mapping, curve: linearCurve }, "pressure"));
    } else {
      widthMappings.push(buildMappingFromIr(mapping, source));
    }
  }

  const flowMappings: NormalizedStudioBrushDynamicsMapping[] = [];
  for (const mapping of program.flowDynamics) {
    if (mapping.input === "constant") continue;
    const source = dynamicSourceForIrInput(mapping.input);
    if (!source) {
      unmapped.push(`flowDynamics(${mapping.input})`);
      continue;
    }
    const peak = Math.max(...mapping.curve, 1e-6);
    const normalizedCurve = peak > 0 ? mapping.curve.map((tap) => clamp(tap / peak, 0, 1)) : mapping.curve;
    flowMappings.push(buildMappingFromIr({ ...mapping, curve: normalizedCurve }, source));
  }

  // Tip resolution: embedded PNG / R8 pyramid → custom alphaMapBase64, else procedural
  const pyramid =
    options.tipPyramid ??
    options.procreateFeatures?.tipPyramid ??
    (options.tipPngBase64 ? decodeTipPyramidFromBase64(options.tipPngBase64) : null);

  let tip: NormalizedStudioBrushDynamicsSettings["tip"] = proceduralTipFor(program.tip.hardness);
  if (pyramid) {
    tip = {
      shape: "round",
      softness: clamp(1 - program.tip.hardness, 0, 1),
      alphaMapBase64: pyramid.documentAlphaMapBase64,
      alphaMapSize: pyramid.documentSize,
    };
  } else if (program.tip.kind === "image") {
    unmapped.push("tip.image");
    warnings.push(packWarning("warn.imageTipFallback"));
  } else if (program.tip.kind === "stamp" && !options.cspFeatures?.dualBrush && !options.cspFeatures?.texture) {
    warnings.push(packWarning("warn.stampTipApproximated"));
  }

  if (program.geometry.kind !== "perfect-freehand") {
    unmapped.push(`geometry.${program.geometry.kind}`);
  }
  if (program.output.target !== "vector-path" && program.output.target !== "raster-tiles") {
    unmapped.push(`output.${program.output.target}`);
  }
  if (!size.hasPressure && program.sizeDynamics.length === 0) {
    warnings.push(packWarning("warn.pressureDefaulted"));
  }

  // CSP & Procreate rich feature mapping
  const csp = options.cspFeatures;
  const procreate = options.procreateFeatures;

  const dualBrush = csp?.dualBrush?.enabled
    ? {
        enabled: true,
        tip: proceduralTipFor(csp.dualBrush.hardness ?? 0.7),
        blendMode: (csp.dualBrush.compositeMode === 2 || csp.dualBrush.compositeMode === 3
          ? "screen"
          : "multiply") as "multiply" | "screen",
        sizeRatio: clamp(
          (csp.dualBrush.size ?? size.strokeWidth) / Math.max(1, size.strokeWidth),
          0.25,
          2,
        ),
      }
    : procreate?.dualBrush?.enabled
      ? {
          enabled: true,
          tip: procreate.dualBrush.secondaryTipPyramid
            ? {
                shape: "round" as const,
                softness: 0,
                alphaMapBase64: procreate.dualBrush.secondaryTipPyramid.documentAlphaMapBase64,
                alphaMapSize: procreate.dualBrush.secondaryTipPyramid.documentSize,
              }
            : proceduralTipFor(0.65),
          blendMode: procreate.dualBrush.combineMode,
          sizeRatio: clamp(procreate.dualBrush.sizeRatio, 0.25, 2),
        }
      : undefined;

  const grain = csp?.texture?.enabled
    ? {
        space: "canvas-fixed" as const,
        amount: clamp(csp.texture.density ?? 0.5, 0, 1),
        scale: clamp(((csp.texture.scale ?? 100) / 100) * 16, 0.25, 512),
        contrast: 0.4,
        seed: stableSeed(`${program.id}:csp-tex`),
        texture: {
          mode: mapTextureCombineMode(csp.texture.compositeMode),
          depth: clamp(csp.texture.density ?? 0.5, 0, 1),
        },
      }
    : procreate?.grain?.enabled
      ? {
          space: (procreate.grain.moving ? "stroke-fixed" : "canvas-fixed") as "stroke-fixed" | "canvas-fixed",
          amount: clamp(procreate.grain.depth, 0, 1),
          scale: clamp(procreate.grain.scale * 16, 0.25, 512),
          contrast: clamp((procreate.grain.contrast + 1) / 2, 0, 1),
          seed: stableSeed(`${program.id}:procreate-grain`),
          texture: {
            mode: mapTextureCombineMode(procreate.grain.blendMode),
            depth: clamp(procreate.grain.depth, 0, 1),
            minimumDepth: clamp(procreate.grain.depthMinimum, 0, 1),
            brightness: clamp(procreate.grain.brightness, -1, 1),
            contrast: clamp(procreate.grain.contrast, -1, 1),
            invert: procreate.grain.invert,
          },
        }
      : undefined;

  const taper = csp?.taper
    ? {
        enabled: csp.taper.useIn || csp.taper.useOut,
        startLength: csp.taper.useIn ? clamp((csp.taper.inLength ?? 15) / 100, 0.02, 0.5) : 0,
        endLength: csp.taper.useOut ? clamp((csp.taper.outLength ?? 20) / 100, 0.02, 0.5) : 0,
        minSizeRatio: 0.05,
        minOpacityRatio: 0.5,
        curve: 1.35,
      }
    : procreate?.taper.enabled
      ? {
          enabled: true,
          startLength: clamp(Math.max(procreate.taper.pressureStart, procreate.taper.touchStart), 0, 0.5),
          endLength: clamp(Math.max(procreate.taper.pressureEnd, procreate.taper.touchEnd), 0, 0.5),
          minSizeRatio: clamp(1 - procreate.taper.size, 0, 1),
          minOpacityRatio: clamp(1 - procreate.taper.opacity, 0, 1),
          curve: clamp(0.6 + procreate.taper.tip * 1.6, 0.2, 4),
        }
      : undefined;

  const colorDynamics = procreate?.colorDynamics
    ? {
        foregroundBackgroundMix: procreate.colorDynamics.secondaryColorMix,
        hueJitter: procreate.colorDynamics.hueJitter,
        saturationJitter: procreate.colorDynamics.saturationJitter,
        valueJitter: procreate.colorDynamics.brightnessJitter,
      }
    : undefined;

  const route = resolveMediaBrushRoute(program, options);
  const angleJitter = program.tip.angleJitterDeg > 0
    ? { mode: "add" as const, amount: clamp(program.tip.angleJitterDeg, 0, 180) }
    : null;

  const normalizedDynamics = normalizeStudioBrushDynamicsSettings({
    ...DEFAULT_STUDIO_BRUSH_DYNAMICS_SETTINGS,
    ...(route.brushId === "watercolor" || route.brushId === "ink-wash"
      ? { depositPipeline: "causal-v4" as const }
      : {}),
    seed: stableSeed(program.id),
    spacingRatio: clamp(program.tip.spacingPct / 100, 0.01, 16),
    ...(procreate && procreate.scatterRatio > 0
      ? { scatterRatio: clamp(procreate.scatterRatio * 2, 0, 16) }
      : {}),
    ...(taper ? { taper } : {}),
    tip,
    ...(dualBrush ? { dualBrush } : {}),
    ...(grain ? { grain } : {}),
    ...(colorDynamics ? { colorDynamics } : {}),
    width: {
      ...DEFAULT_STUDIO_BRUSH_DYNAMICS_SETTINGS.width,
      base: size.strokeWidth,
      mappings: widthMappings,
    },
    opacity: {
      ...DEFAULT_STUDIO_BRUSH_DYNAMICS_SETTINGS.opacity,
      base: flow.opacity,
      mappings: flowMappings,
    },
    flow: {
      ...DEFAULT_STUDIO_BRUSH_DYNAMICS_SETTINGS.flow,
      base: flow.opacity,
      mappings: flowMappings,
    },
    angle: {
      ...DEFAULT_STUDIO_BRUSH_DYNAMICS_SETTINGS.angle,
      base: procreate?.angleDeg ?? 0,
      mappings: procreate?.azimuthFollow
        ? [{ source: "tilt-azimuth", mode: "add", from: 0, to: 360, amount: 1, curve: 1, invert: false }]
        : DEFAULT_STUDIO_BRUSH_DYNAMICS_SETTINGS.angle.mappings,
      jitter: angleJitter,
    },
    roundness: {
      ...DEFAULT_STUDIO_BRUSH_DYNAMICS_SETTINGS.roundness,
      base: procreate?.roundness ?? 1,
    },
  });

  // Preserve CSP pixel-length In/Out taper in `cspBrushExtensions` when present
  let cspBrushExtensions: NormalizedStudioCspBrushExtensions | undefined;
  if (csp?.taper && (csp.taper.useIn || csp.taper.useOut)) {
    cspBrushExtensions = normalizeStudioCspBrushExtensions({
      ...DEFAULT_STUDIO_CSP_BRUSH_EXTENSIONS,
      inOutTaper: {
        useIn: csp.taper.useIn,
        inLength: csp.taper.inLength ?? 24,
        inUnit: "px",
        useOut: csp.taper.useOut,
        outLength: csp.taper.outLength ?? 36,
        outUnit: "px",
      },
    });
  }

  const dynamics: NormalizedStudioBrushDynamicsSettings = cspBrushExtensions
    ? { ...normalizedDynamics, cspBrushExtensions }
    : normalizedDynamics;

  const snapshot: StudioBrushSnapshot = {
    ...DEFAULT_STUDIO_BRUSH_SNAPSHOT,
    brushId: route.brushId,
    sourcePresetId: program.id,
    sourcePresetName: program.name,
    strokeWidth: size.strokeWidth,
    brushOpacity: flow.opacity,
    pressureMinSize: size.pressureMinRatio,
    stabilizer: Math.round(clamp(program.stabilizer.strength, 0, 1) * STABILIZER_MAX),
    tipAngle: procreate?.angleDeg ?? DEFAULT_STUDIO_BRUSH_SNAPSHOT.tipAngle,
    tipRoundness: procreate?.roundness ?? DEFAULT_STUDIO_BRUSH_SNAPSHOT.tipRoundness,
    brushDynamics: dynamics,
    enginePrograms: route.enginePrograms,
  };

  return {
    snapshot,
    unmapped: [...new Set(unmapped)].sort(),
    warnings,
    ...(pyramid
      ? {
          highResTip: {
            alphaMapBase64: pyramid.alphaMapBase64,
            alphaMapSize: pyramid.size,
            mipLevels: pyramid.mipLevels.map((lvl) => ({
              size: lvl.size,
              alphaMapBase64: lvl.alphaMapBase64,
            })),
          },
        }
      : {}),
  };
}
