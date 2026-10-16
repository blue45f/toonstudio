import { assertStudioBg3dRasterWindow } from "./studio-bg3d-tile-plan";
import type { StudioBg3dRasterWindow } from "./studio-bg3d-tile-plan";
/**
 * Deterministic, browser-neutral raster stage for Studio's 3D line-and-tone (LT) output.
 *
 * The engine/capture boundary owns color and optional normalized depth pixels. This module owns
 * only bounded typed-array processing: it never reaches the DOM, creates a canvas, decodes an
 * asset, or mutates caller-owned buffers. The caller can encode each returned RGBA layer as PNG.
 *
 * A captured image contains visible surfaces only, so no occluded geometry can ever be drawn at this
 * boundary. `hiddenLineRemoval` therefore means something narrower and image-based: when a depth
 * capture is available it removes the line responses of the far side of an occlusion boundary (the
 * surface hidden behind a nearer one), which otherwise doubles the contour. Without depth it changes
 * nothing. A requested vector line layer is deliberately rasterized here; vector tracing is a
 * separate post-process and must not be inferred from pixels by this trust boundary.
 *
 * Line geometry (ridge thinning, continuous stroke width, interior suppression) lives in
 * `studio-bg3d-lt-line-response.ts`; see docs/features/bg3d-lineart-quality.md.
 */

import { STUDIO_BG3D_LT_DEPTH_EDGE_MAX_PIXELS } from "./studio-bg3d-lt-depth-edges";
import { renderStudioBg3dLtLineResponses } from "./studio-bg3d-lt-line-response";
import { byteAt, clamp01 } from "./studio-bg3d-lt-raster-math";

import type {
  StudioBg3dLineOutputSettings,
  StudioBg3dToneOutputSettings,
} from "./studio-bg3d-scene-document";
import type { StudioBg3dLtRasterLayerRole } from "../scene-3d/studio-3d-insert-contract";

export const STUDIO_BG3D_LT_RENDER_MAX_PIXELS = STUDIO_BG3D_LT_DEPTH_EDGE_MAX_PIXELS;

export type { StudioBg3dLtRasterLayerRole } from "../scene-3d/studio-3d-insert-contract";

export interface StudioBg3dLtRasterInput {
  /** Optional bounded tile origin; pattern phase and scale-aware thresholds use the whole frame. */
  readonly window?: StudioBg3dRasterWindow;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array | Uint8ClampedArray;
  /** Optional linear or device depth normalized to [0, 1], one value per pixel. */
  readonly depth?: Float32Array;
  readonly normalRgba?: Uint8Array | Uint8ClampedArray;
}

export interface StudioBg3dThreeRgbaDepthInput {
  readonly width: number;
  readonly height: number;
  /** Tightly packed RGBA8 bytes emitted by Three's RGBADepthPacking shader. */
  readonly rgba: Uint8Array | Uint8ClampedArray;
  /** Set for WebGL readPixels data whose first row is the framebuffer's bottom row. */
  readonly flipY?: boolean;
}

export interface StudioBg3dLtRenderSettings {
  readonly line: StudioBg3dLineOutputSettings;
  readonly tone: StudioBg3dToneOutputSettings;
}

export interface StudioBg3dLtRasterLayer {
  readonly role: StudioBg3dLtRasterLayerRole;
  readonly width: number;
  readonly height: number;
  /** Fresh, tightly packed, non-premultiplied RGBA bytes. */
  readonly data: Uint8ClampedArray;
}

export interface StudioBg3dLtRenderResult {
  readonly width: number;
  readonly height: number;
  /** Stable paint order. Empty/disabled layers are omitted. */
  readonly layers: readonly StudioBg3dLtRasterLayer[];
}

interface ValidatedInput {
  readonly window?: StudioBg3dRasterWindow;
  readonly width: number;
  readonly height: number;
  readonly pixelCount: number;
  readonly rgba: Uint8Array | Uint8ClampedArray;
  readonly depth?: Float32Array;
  readonly normalRgba?: Uint8Array | Uint8ClampedArray;
}

interface ValidatedRgbaShape {
  readonly width: number;
  readonly height: number;
  readonly pixelCount: number;
  readonly rgba: Uint8Array | Uint8ClampedArray;
}

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/u;
const LINE_LAYER_TYPE_SET = new Set(["raster", "vector"]);
const TONE_MODE_SET = new Set(["none", "flat", "cel", "screentone"]);
const TONE_TYPE_SET = new Set(["color", "grayscale", "pattern"]);
const TONE_PATTERN_SET = new Set(["dot", "line", "crosshatch", "noise"]);

function isByteArray(value: unknown): value is Uint8Array | Uint8ClampedArray {
  return value instanceof Uint8Array || value instanceof Uint8ClampedArray;
}

function assertFiniteRange(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be a finite number in [${minimum}, ${maximum}].`);
  }
}

function assertBoolean(value: unknown, label: string): asserts value is boolean {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be a boolean.`);
}

function validateRgbaShape(
  width: unknown,
  height: unknown,
  rgba: unknown,
  label: string
): ValidatedRgbaShape {
  if (typeof width !== "number" || !Number.isSafeInteger(width) || width < 1) {
    throw new RangeError(`${label} width must be a positive safe integer.`);
  }
  if (typeof height !== "number" || !Number.isSafeInteger(height) || height < 1) {
    throw new RangeError(`${label} height must be a positive safe integer.`);
  }
  const pixelCount = width * height;
  if (!Number.isSafeInteger(pixelCount) || pixelCount > STUDIO_BG3D_LT_RENDER_MAX_PIXELS) {
    throw new RangeError(
      `${label} exceeds the ${STUDIO_BG3D_LT_RENDER_MAX_PIXELS}-pixel budget.`
    );
  }
  if (!isByteArray(rgba)) {
    throw new TypeError(`${label} rgba must be a Uint8Array or Uint8ClampedArray.`);
  }
  if (rgba.length !== pixelCount * 4) {
    throw new RangeError(`${label} rgba length must equal width * height * 4.`);
  }
  return { width, height, pixelCount, rgba };
}

function validateInput(input: StudioBg3dLtRasterInput): ValidatedInput {
  if (typeof input !== "object" || input === null) {
    throw new TypeError("LT raster input must be an object.");
  }
  const { depth } = input;
  const shape = validateRgbaShape(input.width, input.height, input.rgba, "LT raster input");
  if (depth !== undefined) {
    if (!(depth instanceof Float32Array)) {
      throw new TypeError("LT raster depth must be a Float32Array when provided.");
    }
    if (depth.length !== shape.pixelCount) {
      throw new RangeError("LT raster depth length must equal width * height.");
    }
    for (let index = 0; index < depth.length; index += 1) {
      const value = depth[index];
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new RangeError("LT raster depth values must be finite and normalized to [0, 1].");
      }
    }
  }
  const normalRgba = input.normalRgba;
  if (normalRgba !== undefined && (!depth || !isByteArray(normalRgba) || normalRgba.length !== shape.pixelCount * 4)) {
    throw new TypeError("LT normals require packed RGBA8 and matching depth.");
  }
  const window = input.window;
  if (window !== undefined) {
    assertStudioBg3dRasterWindow(window);
    if (window.width !== shape.width || window.height !== shape.height) throw new RangeError("LT tile and raster dimensions differ.");
  }
  return { ...shape, ...(depth ? { depth } : {}), ...(normalRgba ? { normalRgba } : {}), ...(window ? { window } : {}) };
}

function validateLineSettings(line: StudioBg3dLineOutputSettings): void {
  if (typeof line !== "object" || line === null) {
    throw new TypeError("LT line settings must be an object.");
  }
  assertBoolean(line.enabled, "line.enabled");
  if (!LINE_LAYER_TYPE_SET.has(line.layerType)) {
    throw new RangeError("line.layerType must be raster or vector.");
  }
  if (typeof line.color !== "string" || !HEX_COLOR_PATTERN.test(line.color)) {
    throw new RangeError("line.color must be a canonical lowercase #rrggbb color.");
  }
  assertFiniteRange(line.widthPx, 0.25, 8, "line.widthPx");
  assertFiniteRange(line.strength, 0, 1, "line.strength");
  assertFiniteRange(line.accuracy, 0, 1, "line.accuracy");
  assertBoolean(line.scaleAwareAccuracy, "line.scaleAwareAccuracy");
  assertFiniteRange(line.exteriorOutlineStrength, 0, 2, "line.exteriorOutlineStrength");
  assertBoolean(line.depthEnabled, "line.depthEnabled");
  assertFiniteRange(line.depthStrength, 0, 1, "line.depthStrength");
  assertBoolean(line.depthOutlineOnly, "line.depthOutlineOnly");
  assertFiniteRange(line.smoothing, 0, 1, "line.smoothing");
  assertBoolean(line.textureLineEnabled, "line.textureLineEnabled");
  assertFiniteRange(line.textureLineStrength, 0, 1, "line.textureLineStrength");
  assertFiniteRange(line.creaseAngleDegrees, 0, 180, "line.creaseAngleDegrees");
  assertBoolean(line.hiddenLineRemoval, "line.hiddenLineRemoval");
  // 선택 필드(이전 문서에는 없다). 없으면 꺼짐으로 해석한다.
  if (line.interiorSuppressionEnabled !== undefined) {
    assertBoolean(line.interiorSuppressionEnabled, "line.interiorSuppressionEnabled");
  }
  if (line.interiorSuppressionStrength !== undefined) {
    assertFiniteRange(line.interiorSuppressionStrength, 0, 1, "line.interiorSuppressionStrength");
  }
}

function validateToneSettings(tone: StudioBg3dToneOutputSettings): void {
  if (typeof tone !== "object" || tone === null) {
    throw new TypeError("LT tone settings must be an object.");
  }
  if (!TONE_MODE_SET.has(tone.mode)) {
    throw new RangeError("tone.mode is not supported.");
  }
  if (!TONE_TYPE_SET.has(tone.type)) {
    throw new RangeError("tone.type is not supported.");
  }
  if (!TONE_PATTERN_SET.has(tone.pattern)) {
    throw new RangeError("tone.pattern is not supported.");
  }
  if (!Number.isSafeInteger(tone.levels) || tone.levels < 2 || tone.levels > 8) {
    throw new RangeError("tone.levels must be an integer in [2, 8].");
  }
  assertFiniteRange(tone.opacity, 0, 1, "tone.opacity");
  assertFiniteRange(tone.frequency, 1, 200, "tone.frequency");
  assertFiniteRange(tone.angleDegrees, -180, 180, "tone.angleDegrees");
}

/*
 * Mirrors Three r184's packing.glsl UnpackFactors4 exactly:
 *   vec4(255/256, 255/65536, 255/16777216, 1/16777216)
 * sampled RGBA8 channels are first normalized by 255, which reduces to the byte factors below.
 */
const THREE_RGBA_DEPTH_RED_FACTOR = 1 / 256;
const THREE_RGBA_DEPTH_GREEN_FACTOR = 1 / 65_536;
const THREE_RGBA_DEPTH_BLUE_FACTOR = 1 / 16_777_216;
const THREE_RGBA_DEPTH_ALPHA_FACTOR = 1 / (255 * 16_777_216);

/**
 * Decodes Three.js `RGBADepthPacking` RGBA8 pixels to normalized depth samples.
 *
 * The returned top-down Float32Array never aliases or modifies the packed input. `flipY` converts
 * the bottom-up row order produced by WebGL `readPixels` while leaving horizontal order intact.
 */
export function decodeStudioBg3dThreeRgbaDepth(
  packedInput: StudioBg3dThreeRgbaDepthInput
): Float32Array {
  if (typeof packedInput !== "object" || packedInput === null) {
    throw new TypeError("Three RGBA depth input must be an object.");
  }
  const shape = validateRgbaShape(
    packedInput.width,
    packedInput.height,
    packedInput.rgba,
    "Three RGBA depth input"
  );
  if (packedInput.flipY !== undefined && typeof packedInput.flipY !== "boolean") {
    throw new TypeError("Three RGBA depth flipY must be a boolean when provided.");
  }
  const depth = new Float32Array(shape.pixelCount);
  for (let targetY = 0; targetY < shape.height; targetY += 1) {
    const sourceY = packedInput.flipY ? shape.height - 1 - targetY : targetY;
    for (let x = 0; x < shape.width; x += 1) {
      const sourceOffset = (sourceY * shape.width + x) * 4;
      const value =
        shape.rgba[sourceOffset] * THREE_RGBA_DEPTH_RED_FACTOR +
        shape.rgba[sourceOffset + 1] * THREE_RGBA_DEPTH_GREEN_FACTOR +
        shape.rgba[sourceOffset + 2] * THREE_RGBA_DEPTH_BLUE_FACTOR +
        shape.rgba[sourceOffset + 3] * THREE_RGBA_DEPTH_ALPHA_FACTOR;
      depth[targetY * shape.width + x] = clamp01(value);
    }
  }
  return depth;
}

function buildLuminance(input: ValidatedInput): Float32Array {
  const luminance = new Float32Array(input.pixelCount);
  for (let index = 0; index < input.pixelCount; index += 1) {
    const red = byteAt(input.rgba, index, 0);
    const green = byteAt(input.rgba, index, 1);
    const blue = byteAt(input.rgba, index, 2);
    luminance[index] = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
  }
  return luminance;
}

function parseColor(color: string): readonly [number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

function inkLayerFromResponse(
  role: "main-line" | "texture-line",
  response: Uint8ClampedArray,
  input: ValidatedInput,
  color: readonly [number, number, number]
): StudioBg3dLtRasterLayer | null {
  const data = new Uint8ClampedArray(input.pixelCount * 4);
  let hasInk = false;
  for (let index = 0; index < input.pixelCount; index += 1) {
    const alpha = Math.round((response[index] * byteAt(input.rgba, index, 3)) / 255);
    if (alpha < 1) continue;
    const offset = index * 4;
    data[offset] = color[0];
    data[offset + 1] = color[1];
    data[offset + 2] = color[2];
    data[offset + 3] = alpha;
    hasInk = true;
  }
  return hasInk ? { role, width: input.width, height: input.height, data } : null;
}

function quantizedLuminance(value: number, tone: StudioBg3dToneOutputSettings): number {
  const adjusted = tone.mode === "cel" ? clamp01((value - 0.5) * 1.35 + 0.5) : value;
  const steps = tone.levels - 1;
  return Math.round(adjusted * steps) / steps;
}

function fractional(value: number): number {
  return value - Math.floor(value);
}

function noiseRank(cellX: number, cellY: number): number {
  let hash = Math.imul(cellX, 374_761_393) ^ Math.imul(cellY, 668_265_263);
  hash = Math.imul(hash ^ (hash >>> 13), 1_274_126_177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4_294_967_296;
}

function patternRank(
  pattern: StudioBg3dToneOutputSettings["pattern"],
  x: number,
  y: number,
  period: number,
  cosine: number,
  sine: number
): number {
  const horizontal = (x + 0.5) * cosine + (y + 0.5) * sine;
  const vertical = -(x + 0.5) * sine + (y + 0.5) * cosine;
  const u = fractional(horizontal / period);
  const v = fractional(vertical / period);
  const lineU = Math.min(1, Math.abs(u - 0.5) * 2);
  const lineV = Math.min(1, Math.abs(v - 0.5) * 2);
  if (pattern === "line") return lineV;
  if (pattern === "crosshatch") return Math.min(lineU, lineV);
  if (pattern === "noise") return noiseRank(Math.floor(horizontal / period), Math.floor(vertical / period));
  const dx = u - 0.5;
  const dy = v - 0.5;
  return Math.min(1, Math.PI * (dx * dx + dy * dy));
}

function renderFillLayer(
  input: ValidatedInput,
  luminance: Float32Array,
  tone: StudioBg3dToneOutputSettings
): StudioBg3dLtRasterLayer | null {
  if (tone.mode === "none" || tone.opacity <= 0) return null;
  const data = new Uint8ClampedArray(input.pixelCount * 4);
  const angle = (tone.angleDegrees * Math.PI) / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const period = Math.min(256, Math.max(2, 600 / tone.frequency));
  const antialiasWidth = Math.min(0.2, Math.max(0.03, 1 / period));
  let hasTone = false;

  for (let y = 0; y < input.height; y += 1) {
    for (let x = 0; x < input.width; x += 1) {
      const index = y * input.width + x;
      const sourceAlpha = byteAt(input.rgba, index, 3);
      if (sourceAlpha === 0) continue;
      const gray = quantizedLuminance(luminance[index], tone);
      const offset = index * 4;
      if (tone.type === "color") {
        const alpha = Math.round(sourceAlpha * tone.opacity);
        if (alpha < 1) continue;
        if (tone.mode === "cel") {
          // Quantize lightness while retaining the captured material hue. Scaling all channels by
          // the same factor avoids the RGB channel posterization that tends to create false hues.
          const sourceLuminance = Math.max(1 / 255, luminance[index]);
          const lightnessScale = gray / sourceLuminance;
          data[offset] = Math.round(clamp01((byteAt(input.rgba, index, 0) / 255) * lightnessScale) * 255);
          data[offset + 1] = Math.round(clamp01((byteAt(input.rgba, index, 1) / 255) * lightnessScale) * 255);
          data[offset + 2] = Math.round(clamp01((byteAt(input.rgba, index, 2) / 255) * lightnessScale) * 255);
        } else {
          data[offset] = byteAt(input.rgba, index, 0);
          data[offset + 1] = byteAt(input.rgba, index, 1);
          data[offset + 2] = byteAt(input.rgba, index, 2);
        }
        data[offset + 3] = alpha;
        hasTone = true;
        continue;
      }
      if (tone.type === "grayscale") {
        const grayByte = Math.round(gray * 255);
        const alpha = Math.round(sourceAlpha * tone.opacity);
        if (alpha < 1) continue;
        data[offset] = grayByte;
        data[offset + 1] = grayByte;
        data[offset + 2] = grayByte;
        data[offset + 3] = alpha;
        hasTone = true;
        continue;
      }

      let coverage = 1 - gray;
      if (tone.mode === "screentone") coverage = Math.pow(coverage, 0.85);
      const rank = patternRank(tone.pattern, x + (input.window?.x ?? 0), y + (input.window?.y ?? 0), period, cosine, sine);
      const ink = clamp01((coverage - rank) / antialiasWidth + 0.5);
      const alpha = Math.round(sourceAlpha * tone.opacity * ink);
      if (alpha < 1) continue;
      data[offset + 3] = alpha;
      hasTone = true;
    }
  }
  return hasTone
    ? { role: tone.type === "color" ? "color" : "tone", width: input.width, height: input.height, data }
    : null;
}

/**
 * Produces separate, nonempty LT layers in stable paint order. The output never aliases input data.
 * Invalid dimensions, buffer shapes, depth samples, or non-canonical settings fail closed.
 */
export function renderStudioBg3dLtLayers(
  rasterInput: StudioBg3dLtRasterInput,
  settings: StudioBg3dLtRenderSettings
): StudioBg3dLtRenderResult {
  if (typeof settings !== "object" || settings === null) {
    throw new TypeError("LT render settings must be an object.");
  }
  const input = validateInput(rasterInput);
  validateLineSettings(settings.line);
  validateToneSettings(settings.tone);
  const luminance = buildLuminance(input);
  let mainLayer: StudioBg3dLtRasterLayer | null = null;
  let textureLayer: StudioBg3dLtRasterLayer | null = null;

  if (settings.line.enabled && settings.line.strength > 0) {
    const color = parseColor(settings.line.color);
    const responses = renderStudioBg3dLtLineResponses(input, luminance, settings.line);
    mainLayer = inkLayerFromResponse("main-line", responses.main, input, color);
    if (responses.texture) {
      textureLayer = inkLayerFromResponse("texture-line", responses.texture, input, color);
    }
  }

  const fillLayer = renderFillLayer(input, luminance, settings.tone);
  const layers: StudioBg3dLtRasterLayer[] = [];
  // The base render is always the backmost layer. A color output deliberately uses its own role so
  // Studio can classify it as editable color rather than misleadingly labelling it as screentone.
  if (fillLayer) layers.push(fillLayer);
  if (textureLayer) layers.push(textureLayer);
  if (mainLayer) layers.push(mainLayer);
  return { width: input.width, height: input.height, layers };
}
