import {
  STUDIO_BRUSH_ENGINE_PROGRAM_STROKE_VERSION,
  hasValidStudioBrushEngineProgramExtension,
} from "@toonstudio/contracts/studio-brush-material-program-contract";
import {
  serializeStudioBrushR8TextureGrainSourceCanonical,
} from "@toonstudio/contracts/studio-brush-r8-grain-asset-contract";
import {
  STUDIO_LEGACY_PIGMENT_ARCHIVE_STROKE_VERSION,
} from "@toonstudio/contracts/studio-legacy-pigment-archive";

export const STUDIO_CRDT_STROKE_SAMPLE_MAX_COUNT = 100_000;
export const STUDIO_CRDT_STROKE_BASE_SAMPLE_KEYS = [
  "points",
  "pressures",
  "tiltXs",
  "tiltYs",
  "twists",
  "speeds",
  "tangentialPressures",
] as const;
export const STUDIO_CRDT_STROKE_EXTENDED_INK_SAMPLE_KEYS = [
  "altitudeAngles",
  "azimuthAngles",
  "contactWidths",
  "contactHeights",
  "sampleTimeOffsets",
] as const;
export const STUDIO_CRDT_STROKE_SAMPLE_KEYS = [
  ...STUDIO_CRDT_STROKE_BASE_SAMPLE_KEYS,
  ...STUDIO_CRDT_STROKE_EXTENDED_INK_SAMPLE_KEYS,
] as const;
export const STUDIO_CRDT_STROKE_JSON_KEYS = [
  "gradient",
  "pattern",
  "brushDynamics",
  "brushTip",
  "strokeStyle",
  "shapeParams",
  "sketch",
  "symmetry",
  "extensions",
] as const;
export const STUDIO_CRDT_STROKE_OPTIONAL_STRING_LIMITS = {
  fill: 512,
  brush: 512,
  blendMode: 512,
  brushCatalogId: 160,
  brushCatalogName: 120,
} as const;
export const STUDIO_CRDT_STROKE_OPTIONAL_STRING_KEYS = Object.keys(
  STUDIO_CRDT_STROKE_OPTIONAL_STRING_LIMITS
) as Array<keyof typeof STUDIO_CRDT_STROKE_OPTIONAL_STRING_LIMITS>;
export const STUDIO_CRDT_STROKE_RECORD_KEYS = new Set([
  "id",
  "pageId",
  "layerId",
  "status",
  "deleted",
  "payloadVersion",
  "type",
  "kind",
  "mode",
  "stroke",
  "strokeWidth",
  "opacity",
  "sampleSpacing",
  ...STUDIO_CRDT_STROKE_OPTIONAL_STRING_KEYS,
  ...STUDIO_CRDT_STROKE_JSON_KEYS,
  ...STUDIO_CRDT_STROKE_SAMPLE_KEYS,
]);
export const STUDIO_CRDT_STROKE_METADATA_MAX_BYTES = 16 * 1_024;
export const STUDIO_CRDT_STROKE_WIDTH_MAX = 8_192;
export const STUDIO_CRDT_LEGACY_STROKE_PAYLOAD_VERSION = 1;
export const STUDIO_CRDT_LAYERED_FLOW_STROKE_PAYLOAD_VERSION = 2;
export const STUDIO_CRDT_MATERIAL_STROKE_PAYLOAD_VERSION = 3;
export const STUDIO_CRDT_STROKE_PAYLOAD_VERSION = 4;
export const STUDIO_CRDT_TAPER_SPACING_STROKE_PAYLOAD_VERSION = 5;

export function strokePayloadSupportsContinuation(version: unknown): boolean {
  return version === STUDIO_CRDT_STROKE_PAYLOAD_VERSION
    || version === STUDIO_CRDT_TAPER_SPACING_STROKE_PAYLOAD_VERSION
    || version === STUDIO_BRUSH_ENGINE_PROGRAM_STROKE_VERSION
    || version === STUDIO_LEGACY_PIGMENT_ARCHIVE_STROKE_VERSION;
}

const STUDIO_CRDT_LAYERED_FLOW_PAINT_MODEL = "layered-flow-v1";
const STUDIO_CRDT_BOUNDED_FLOW_PAINT_MODEL = "bounded-flow-v2";
export const STUDIO_CRDT_MATERIAL_PRESSURE_MODEL = "canonical-material-v1";
export const STUDIO_CRDT_SEGMENTED_CAUSAL_DEPOSIT_PIPELINES = new Set<unknown>([
  "causal-deposit-v3-segmented",
  "causal-deposit-v4-taper-spacing",
]);
// Fresh-authoring dry-media routing marker (`brushDynamics.dryMediaKernelProgram`, browser
// `studioDryMediaKernelDabProgramPin`). It travels inside the bounded brushDynamics JSON and is
// intentionally admitted by the bounded-JSON rules without a key whitelist — tightening
// brushDynamics admission must keep accepting it or freshly authored core dry-media strokes
// would be dropped server-side while the author still sees them (oracle-pinned in the service
// test alongside the browser paint contract).
const STUDIO_CRDT_CAUSAL_PRESSURE_MODELS = new Set([
  "linear-full-v1",
  "linear-residual-v2",
  "linear-residual-path-v3",
]);
const STUDIO_CRDT_LAYERED_FLOW_COMPATIBLE_BRUSH_IDS = new Set([
  "pen",
  "fineliner",
  "ballpoint",
  "gel-pen",
  "glass-pen",
  "ruling-pen",
  "technical-pen",
  "kneaded-eraser",
  "marker",
  "felt-tip",
  "marker-bold",
  "alcohol-marker",
]);
const STUDIO_CRDT_KNOWN_INCOMPATIBLE_LAYERED_FLOW_BRUSH_IDS = new Set([
  "pixel-grid-v1",
  "gpen",
  "school-pen",
  "maru-pen",
  "liner",
  "mapping-pen",
  "kaburapen",
  "ink-brush",
  "airbrush-fine",
  "pencil-grain",
  "wash-brush",
  "calligraphy",
  "fountain-pen",
  "parallel-pen",
  "brush-pen",
  "perfect-ink",
  "perfect-marker",
  "highlighter",
  "chisel-highlighter",
  "pastel-highlighter",
  "neon",
  "glow",
  "soft-glow",
  "glitter",
  "star-dust",
  "sparkle-star",
  "brush",
  "flat-brush",
  "watercolor",
  "ink-wash",
  "inkwash-pen",
  "inkwash-water-brush",
  "inkwash-bleed-wash",
  "inkwash-white-ink",
  "gouache",
  "oil",
  "acrylic",
  "paint-tube",
  "pastel",
  "oil-pastel",
  "ink-particle",
  "tangent-normal-brush",
  "airbrush",
  "hard-airbrush",
  "spray",
  "splatter",
  "soft-brush",
  "dry-media",
  "crayon",
  "chalk",
  "charcoal",
  "pencil",
  "erodible-pencil",
  "soft-pencil",
  "pencil-2b",
  "pencil-6b",
  "colored-pencil",
  "screentone",
  "crosshatch",
  // Dynamic / non pen-marker families must not claim layered-flow-v1 (browser mirror).
  "sketchpad-tile",
  "web-multi-agent",
  "web-gravity-drip",
  "web-soft-cloud",
  "web-calligraphy-ribbon",
  "web-scatter-stamp",
  "web-blend-softener",
  "web-dot-tone",
  "web-kaleido-ink",
  "web-fur-strand",
  "web-radial-burst",
  "web-spiro-orbit",
  "web-neon-tube",
  "web-smudge-trail",
]);
const STUDIO_CRDT_BOUNDED_FLOW_DYNAMIC_BRUSH_IDS = new Set([
  "ink-particle",
  "airbrush",
  "dry-media",
  "soft-brush",
  "spray",
  "splatter",
  "hard-airbrush",
  "erodible-pencil",
  "paint-tube",
  "tangent-normal-brush",
  "crayon",
  "chalk",
  "charcoal",
  "pastel",
  "oil-pastel",
  "sketchpad-tile",
  "sketchpad-mirror",
  "sketchpad-soft-marker",
  "web-multi-agent",
  "web-rough-ink",
  "web-gravity-drip",
  "web-soft-cloud",
  "web-calligraphy-ribbon",
  "web-dash-stitch",
  "web-scatter-stamp",
  "web-rainbow-flow",
  "web-lazy-ink",
  "web-hatch-color",
  "web-cel-flat",
  "web-blend-softener",
  "web-dot-tone",
  "web-kaleido-ink",
  "web-fur-strand",
  "web-contour-double",
  "web-radial-burst",
  "web-mirror-ink",
  "web-grid-ink",
  "web-spiro-orbit",
  "web-zigzag-edge",
  "web-neon-tube",
  "web-pressure-flat",
  "web-smudge-trail",
  "web-cross-hatch-pen",
  // Engine-lane dynamic twins (bounded-flow-v2 only; mirrors browser dynamics resolver).
  "oil--tube-extrude",
  "oil--knife-edge",
  "acrylic--polymer-flat",
  "charcoal--vine-soft",
  "charcoal--compressed-edge",
  "crayon--wax-scrape",
  "chalk--klecks-powder",
  "pastel--cake-soft",
  "oil-pastel--waxy-film",
  "pencil--erodible-wear",
  "airbrush--klecks-grit",
  "airbrush--hard-envelope",
  "spray--equal-area",
  "splatter--burst-cloud",
  "marker--soft-dynamic",
  "brush--dry-rake",
  "ink-particle--scatter-cloud",
  // 2026-08-13 brush quality wave: the only new dynamic-dabs lane (stamp/wet/oil-ribbon lanes
  // stay off bounded-flow-v2 by both mirrors, matching the browser dynamics resolver).
  "oil-pastel--wgm-mix",
  // 2026-08-13 wave 3 mirror audit: all 17 new engine lanes (mypaint-cc0--* stamp pool, croquis
  // capsule-outline pair, living-ink bake wet lanes, bristle-physics oil lane) execute on
  // stamp/capsule/wet/oil engines — zero dynamic-dabs lanes, so this set deliberately gains no
  // ids and the generic `--` fail-closed rule below keeps admitting them nowhere else.
]);

export interface StudioCrdtStrokePaintContractInput {
  brushEnginePrograms?: unknown;
  payloadVersion: unknown;
  paintModel: unknown;
  kind?: unknown;
  mode?: unknown;
  brush?: unknown;
  sampleSpacing?: unknown;
  pressureModel?: unknown;
  fill?: unknown;
  brushDynamics?: unknown;
  stampPipeline?: unknown;
  watercolorPipeline?: unknown;
  symmetry?: unknown;
}

function hasCausalStrokePaintGeometry(
  input: StudioCrdtStrokePaintContractInput
): boolean {
  return (
    typeof input.sampleSpacing === "number"
    && Number.isFinite(input.sampleSpacing)
    && input.sampleSpacing >= 0
  ) || (
    typeof input.pressureModel === "string"
    && STUDIO_CRDT_CAUSAL_PRESSURE_MODELS.has(input.pressureModel)
  );
}

function hasNonIdentityStrokeSymmetry(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value !== "object" || Array.isArray(value)) return true;
  const type = (value as Record<string, unknown>).type;
  return type !== undefined && type !== "none";
}

function isBoundedFlowStrokeSymmetryCompatible(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== "object" || Array.isArray(value)) return false;
  const source = value as Record<string, unknown>;
  if (source.type === undefined || source.type === "none") return true;
  if (
    source.type !== "vertical"
    && source.type !== "horizontal"
    && source.type !== "radial"
    && source.type !== "kaleidoscope"
  ) return false;
  if (
    typeof source.centerX !== "number"
    || !Number.isFinite(source.centerX)
    || typeof source.centerY !== "number"
    || !Number.isFinite(source.centerY)
  ) return false;
  if (source.type === "vertical" || source.type === "horizontal") return true;
  return typeof source.radialCount === "number"
    && Number.isInteger(source.radialCount)
    && source.radialCount >= 1
    && source.radialCount <= 32;
}

function isLayeredFlowStrokeBrushCompatible(brush: unknown): boolean {
  if (typeof brush !== "string" || brush.length === 0) return true;
  if (STUDIO_CRDT_LAYERED_FLOW_COMPATIBLE_BRUSH_IDS.has(brush)) return true;
  if (STUDIO_CRDT_KNOWN_INCOMPATIBLE_LAYERED_FLOW_BRUSH_IDS.has(brush)) return false;
  // Engine-lane ids (`{base}--{lane}`) mirror browser render-family admission:
  // only causal pen lanes stay on layered-flow-v1; oil/wet/perfect/stamp lanes fail closed.
  if (brush.includes("--")) {
    return brush === "gpen--causal-round";
  }
  return true;
}

export function rendererSignificantR8GrainAdmission(
  brushDynamics: unknown,
): "absent" | "valid" | "invalid" {
  if (!brushDynamics || typeof brushDynamics !== "object" || Array.isArray(brushDynamics)) {
    return "absent";
  }
  const grain = (brushDynamics as Record<string, unknown>).grain;
  if (!grain || typeof grain !== "object" || Array.isArray(grain)) return "absent";
  if (!Object.prototype.hasOwnProperty.call(grain, "source")) return "absent";
  const source = (grain as Record<string, unknown>).source;
  if (source == null) return "absent";
  const canonical = serializeStudioBrushR8TextureGrainSourceCanonical(source);
  return canonical !== null && canonical === JSON.stringify(source)
    ? "valid"
    : "invalid";
}

/**
 * Server mirror of the browser's pure stroke-paint admission contract. Runtime imports stay
 * one-way at the API boundary; the service test pins this mirror against the browser oracle.
 */
export function hasValidStudioCrdtStrokePaintContract(
  input: StudioCrdtStrokePaintContractInput
): boolean {
  if (!hasValidStudioBrushEngineProgramExtension(input.payloadVersion, input.brushEnginePrograms)) return false;
  if (
    input.payloadVersion !== STUDIO_CRDT_LAYERED_FLOW_STROKE_PAYLOAD_VERSION
    && input.payloadVersion !== STUDIO_CRDT_MATERIAL_STROKE_PAYLOAD_VERSION
    && !strokePayloadSupportsContinuation(input.payloadVersion)
  ) return false;
  const brushDynamics = input.brushDynamics !== null
    && typeof input.brushDynamics === "object"
    && !Array.isArray(input.brushDynamics)
    ? input.brushDynamics as Record<string, unknown>
    : undefined;
  if (
    brushDynamics?.depositPipeline === "causal-deposit-v4-taper-spacing"
    && input.payloadVersion !== STUDIO_CRDT_TAPER_SPACING_STROKE_PAYLOAD_VERSION
    && input.payloadVersion !== STUDIO_BRUSH_ENGINE_PROGRAM_STROKE_VERSION
    && input.payloadVersion !== STUDIO_LEGACY_PIGMENT_ARCHIVE_STROKE_VERSION
  ) return false;
  const r8GrainAdmission = rendererSignificantR8GrainAdmission(input.brushDynamics);
  if (
    r8GrainAdmission === "invalid"
    || (
      r8GrainAdmission === "valid"
      && !strokePayloadSupportsContinuation(input.payloadVersion)
    )
  ) return false;
  if (
    STUDIO_CRDT_SEGMENTED_CAUSAL_DEPOSIT_PIPELINES.has(brushDynamics?.depositPipeline)
    && !strokePayloadSupportsContinuation(input.payloadVersion)
  ) return false;
  if ((input.kind ?? "freehand") !== "freehand" || (input.mode ?? "pen") !== "pen") {
    return false;
  }
  if (input.fill !== undefined && input.fill !== null) return false;
  if (input.stampPipeline !== undefined && input.stampPipeline !== null) return false;
  if (input.watercolorPipeline !== undefined && input.watercolorPipeline !== null) return false;
  if (!hasCausalStrokePaintGeometry(input)) return false;

  if (input.paintModel === STUDIO_CRDT_LAYERED_FLOW_PAINT_MODEL) {
    return (
      (input.brushDynamics === undefined || input.brushDynamics === null)
      && !hasNonIdentityStrokeSymmetry(input.symmetry)
      && isLayeredFlowStrokeBrushCompatible(input.brush)
    );
  }
  if (input.paintModel === STUDIO_CRDT_BOUNDED_FLOW_PAINT_MODEL) {
    return (
      typeof input.brushDynamics === "object"
      && input.brushDynamics !== null
      && typeof input.brush === "string"
      && STUDIO_CRDT_BOUNDED_FLOW_DYNAMIC_BRUSH_IDS.has(input.brush)
      && isBoundedFlowStrokeSymmetryCompatible(input.symmetry)
    );
  }
  return false;
}
