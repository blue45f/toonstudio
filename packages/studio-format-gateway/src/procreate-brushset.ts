/**
 * Procreate `.brushset` (and single `.brush`) dependency-free importer.
 *
 * Pure TypeScript + existing `zlib-inflate.ts` (zero external npm packages):
 * - Bounded ZIP32 extraction (`procreate-brushset-zip.ts`)
 * - `brushset.plist` (XML plist and `bplist00` binary plist)
 * - Per-brush `Brush.archive` (`NSKeyedArchiver` `bplist00` object graph decoder)
 * - Per-brush `Shape.png` & `Grain.png` pure-TS PNG decoding → R8 alpha + MIP pyramid (up to 1024px)
 * - Dual Brush, Wet Mix (dilution/charge/attack/pull/grade), Taper (pressure & touch),
 *   Pressure/Tilt curves, Spacing & Scatter lowered to `BrushProgramIR` + lossless feature struct.
 */

import { brushProgramIRSchema } from "@toonstudio/studio-project-model";

import {
  PlistParseError,
  parsePlist,
  resolveNsKeyedArchive,
  type PlistValue,
} from "./bplist";
import {
  bytesToBase64,
  fnv1a64Hex,
  stableTextId,
  type FormatIssue,
} from "./format-common";
import {
  buildR8TipPyramid,
  decodePngToR8AlphaMask,
  type R8TipPyramid,
} from "./png-alpha-decode";
import {
  PROCREATE_ZIP_LIMITS,
  extractProcreateZipEntries,
} from "./procreate-brushset-zip";

import type { BrushProgramIR, DynamicMappingIR } from "@toonstudio/studio-project-model";

const SLASH_CHAR_CODE = 0x2f; // '/'

/**
 * 매니페스트 폴더 경로 끝의 연속 슬래시(`/`)를 선형 시간 O(n) 인덱스 루프로 제거한다.
 * `/\/+$/u` 는 앞쪽에 슬래시가 길게 이어진 입력에서 2차 시간 백트래킹을 유발한다.
 */
function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === SLASH_CHAR_CODE) {
    end -= 1;
  }
  return end === value.length ? value : value.slice(0, end);
}

export const PROCREATE_BRUSHSET_LIMITS = Object.freeze({
  ...PROCREATE_ZIP_LIMITS,
  maxBrushes: 256,
  maxTipResolution: 1024,
});

export type ProcreateBrushsetErrorCode =
  | "aborted"
  | "source-too-large"
  | "zip-invalid"
  | "zip-unsupported"
  | "zip-crc-mismatch"
  | "plist-invalid"
  | "no-brushes";

export class ProcreateBrushsetError extends Error {
  constructor(
    message: string,
    readonly code: ProcreateBrushsetErrorCode,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ProcreateBrushsetError";
  }
}

export interface ProcreateWetMixSettings {
  readonly enabled: boolean;
  readonly dilution: number;
  readonly charge: number;
  readonly attack: number;
  readonly pull: number;
  readonly grade: number;
  readonly smudge: number;
}

export interface ProcreateTaperSettings {
  readonly enabled: boolean;
  readonly pressureStart: number;
  readonly pressureEnd: number;
  readonly touchStart: number;
  readonly touchEnd: number;
  readonly size: number;
  readonly opacity: number;
  readonly tip: number;
}

export interface ProcreateDualBrushSettings {
  readonly enabled: boolean;
  readonly combineMode: "multiply" | "screen";
  readonly sizeRatio: number;
  readonly secondaryName: string | null;
  readonly secondaryTipPyramid: R8TipPyramid | null;
}

export interface ProcreateGrainSettings {
  readonly enabled: boolean;
  readonly scale: number;
  readonly depth: number;
  readonly depthMinimum: number;
  readonly brightness: number;
  readonly contrast: number;
  readonly invert: boolean;
  readonly moving: boolean;
  readonly blendMode: string;
  readonly grainAssetId: string | null;
}

export interface ProcreateColorDynamicsSettings {
  readonly hueJitter: number;
  readonly saturationJitter: number;
  readonly brightnessJitter: number;
  readonly secondaryColorMix: number;
}

export interface ProcreateBrushFeatures {
  readonly spacingRatio: number;
  readonly scatterRatio: number;
  readonly maxDiameterPx: number;
  readonly minDiameterRatio: number;
  readonly roundness: number;
  readonly angleDeg: number;
  readonly angleJitterDeg: number;
  readonly azimuthFollow: boolean;
  readonly wetMix: ProcreateWetMixSettings;
  readonly taper: ProcreateTaperSettings;
  readonly dualBrush: ProcreateDualBrushSettings | null;
  readonly grain: ProcreateGrainSettings | null;
  readonly colorDynamics: ProcreateColorDynamicsSettings | null;
  readonly tipPyramid: R8TipPyramid | null;
  readonly grainPyramid: R8TipPyramid | null;
}

export interface ProcreateBrushEntry {
  readonly folder: string;
  readonly name: string;
  readonly author: string | null;
  readonly program: BrushProgramIR;
  readonly features: ProcreateBrushFeatures;
  readonly shapeAssetId: string | null;
  readonly grainAssetId: string | null;
}

export interface ProcreateEmbeddedAsset {
  readonly id: string;
  readonly path: string;
  readonly role: "shape" | "grain";
  readonly mimeType: "image/png";
  readonly width: number;
  readonly height: number;
  readonly base64: string;
  readonly pyramid: R8TipPyramid;
}

export interface ProcreateBrushsetImportResult {
  readonly format: "procreate-brushset";
  readonly name: string;
  readonly brushes: readonly ProcreateBrushEntry[];
  readonly assets: readonly ProcreateEmbeddedAsset[];
  readonly authors: readonly string[];
  readonly warnings: readonly FormatIssue[];
  readonly unsupported: readonly FormatIssue[];
  readonly sourcePayload: { readonly format: "procreate-brushset"; readonly base64: string };
}

export interface ProcreateBrushsetImportOptions {
  readonly signal?: AbortSignal;
  readonly maxArchiveBytes?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function asDict(value: PlistValue | undefined): Record<string, PlistValue> | null {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Uint8Array) &&
    !(value instanceof Date)
    ? (value as Record<string, PlistValue>)
    : null;
}

function readNum(dict: Record<string, PlistValue>, keys: readonly string[], fallback: number): number {
  for (const key of keys) {
    const val = dict[key];
    if (typeof val === "number" && Number.isFinite(val)) return val;
  }
  return fallback;
}

function readBool(dict: Record<string, PlistValue>, keys: readonly string[], fallback = false): boolean {
  for (const key of keys) {
    const val = dict[key];
    if (typeof val === "boolean") return val;
    if (typeof val === "number") return val !== 0;
  }
  return fallback;
}

function readStr(dict: Record<string, PlistValue>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const val = dict[key];
    if (typeof val === "string" && val.trim().length > 0) return val.trim();
  }
  return null;
}

function parseCurvePoints(raw: PlistValue | undefined): Array<{ x: number; y: number }> | null {
  const dict = asDict(raw);
  const list = Array.isArray(raw)
    ? raw
    : dict && Array.isArray(dict.points)
      ? dict.points
      : dict && Array.isArray(dict.curvePoints)
        ? dict.curvePoints
        : null;
  if (!list || list.length < 2) return null;

  const parsed: Array<{ x: number; y: number }> = [];
  for (const item of list) {
    if (typeof item === "string") {
      const match = /\{\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\}/u.exec(item);
      if (match) {
        parsed.push({
          x: clamp(Number(match[1]), 0, 1),
          y: clamp(Number(match[2]), 0, 1),
        });
      }
    } else {
      const pt = asDict(item);
      if (pt && typeof pt.x === "number" && typeof pt.y === "number") {
        parsed.push({ x: clamp(pt.x, 0, 1), y: clamp(pt.y, 0, 1) });
      }
    }
  }
  if (parsed.length < 2) return null;
  parsed.sort((a, b) => a.x - b.x);
  return parsed;
}

function sampleCurvePointsToLut(points: readonly { x: number; y: number }[], taps = 9): number[] {
  const lut: number[] = [];
  for (let i = 0; i < taps; i += 1) {
    const x = i / (taps - 1);
    let y = points[points.length - 1]!.y;
    if (x <= points[0]!.x) {
      y = points[0]!.y;
    } else {
      for (let seg = 1; seg < points.length; seg += 1) {
        const prev = points[seg - 1]!;
        const next = points[seg]!;
        if (x <= next.x) {
          const span = Math.max(1e-6, next.x - prev.x);
          const t = (x - prev.x) / span;
          y = prev.y + (next.y - prev.y) * t;
          break;
        }
      }
    }
    lut.push(Math.round(clamp(y, 0, 1) * 10_000) / 10_000);
  }
  return lut;
}

function buildDynamicMapping(
  input: DynamicMappingIR["input"],
  curveSource: PlistValue | undefined,
  strength: number,
  minFloor = 0,
): DynamicMappingIR | null {
  const points = parseCurvePoints(curveSource);
  if (points) return { input, curve: sampleCurvePointsToLut(points, 9), min: 0, max: 1 };
  const absStrength = clamp(Math.abs(strength), 0, 1);
  if (absStrength < 1e-4) return null;
  const low = clamp(Math.max(minFloor, 1 - absStrength), 0, 1);
  return { input, curve: strength < 0 ? [1, low] : [low, 1], min: 0, max: 1 };
}

function mapProcreateTextureBlendMode(code: number): string {
  switch (Math.trunc(code)) {
    case 1: return "linear-burn";
    case 2: return "color-burn";
    case 3: return "overlay";
    case 4: return "darken";
    case 5: return "color-dodge";
    case 6: return "subtract";
    case 7: return "hard-mix";
    default: return "multiply";
  }
}

function resolveProcreateDiameterPx(dict: Record<string, PlistValue>): number {
  const rawMax = readNum(dict, ["maxSize", "brushMaxSize", "brushSize"], 0.25);
  return rawMax > 8 ? clamp(Math.round(rawMax), 1, 500) : clamp(Math.round(rawMax * 200), 1, 500);
}

function decodeEmbeddedPngAsset(
  pngBytes: Uint8Array | undefined,
  path: string,
  role: "shape" | "grain",
  assets: ProcreateEmbeddedAsset[],
): ProcreateEmbeddedAsset | null {
  if (!pngBytes) return null;
  const decoded = decodePngToR8AlphaMask(pngBytes, "light-is-opaque");
  if (!decoded) return null;
  const pyramid = buildR8TipPyramid(decoded.alpha, decoded.width, decoded.height, {
    minSize: 8,
    maxSize: PROCREATE_BRUSHSET_LIMITS.maxTipResolution,
    documentMaxSize: 64,
  });
  const asset: ProcreateEmbeddedAsset = {
    id: stableTextId(`procreate-${role}`, pngBytes),
    path,
    role,
    mimeType: "image/png",
    width: decoded.width,
    height: decoded.height,
    base64: bytesToBase64(pngBytes),
    pyramid,
  };
  assets.push(asset);
  return asset;
}

function decodeBrushFolder(
  archiveBytes: Uint8Array,
  folder: string,
  files: ReadonlyMap<string, Uint8Array>,
  assets: ProcreateEmbeddedAsset[],
  warnings: FormatIssue[],
): ProcreateBrushEntry | null {
  const prefix = folder ? `${folder}/` : "";
  const brushArchiveBytes = files.get(`${prefix}Brush.archive`);
  if (!brushArchiveBytes) {
    warnings.push({
      scope: "resource",
      code: "brushset-archive-missing",
      message: `Brush.archive not found in folder "${folder || "."}"`,
      path: `${prefix}Brush.archive`,
    });
    return null;
  }

  let resolved: PlistValue;
  try {
    resolved = resolveNsKeyedArchive(parsePlist(brushArchiveBytes));
  } catch (cause) {
    warnings.push({
      scope: "semantic",
      code: "brushset-archive-corrupt",
      message: cause instanceof Error ? cause.message : String(cause),
      path: `${prefix}Brush.archive`,
    });
    return null;
  }

  const dict = asDict(resolved);
  if (!dict) return null;

  const name = readStr(dict, ["name", "brushName"]) ?? (folder || "Procreate Brush");
  const author = readStr(dict, ["authorName", "author"]);
  const shapeAsset = decodeEmbeddedPngAsset(files.get(`${prefix}Shape.png`), `${prefix}Shape.png`, "shape", assets);
  const grainAsset = decodeEmbeddedPngAsset(files.get(`${prefix}Grain.png`), `${prefix}Grain.png`, "grain", assets);

  const spacingRatio = clamp(readNum(dict, ["plotSpacing", "spacing"], 0.14), 0.01, 4);
  const scatterRatio = clamp(readNum(dict, ["plotJitter", "jitter", "scatter"], 0), 0, 4);
  const maxDiameterPx = resolveProcreateDiameterPx(dict);
  const minDiameterRatio = clamp(readNum(dict, ["minSize", "brushMinSize"], 0), 0, 1);
  const maxOpacity = clamp(readNum(dict, ["maxOpacity", "paintOpacity"], 1), 0.05, 1);
  const minOpacity = clamp(readNum(dict, ["minOpacity"], 0), 0, 1);
  const streamline = clamp(
    readNum(dict, ["dynamicsStreamline", "streamline", "stabilizationAmount", "motionFiltering"], 0.2),
    0,
    1,
  );
  const shapeRoundness = clamp(readNum(dict, ["shapeRoundness", "roundness"], 1), 0.08, 1);
  const shapeRotationRaw = readNum(dict, ["shapeRotation", "rotation"], 0);
  const angleDeg = Math.abs(shapeRotationRaw) <= Math.PI * 2
    ? Math.round((shapeRotationRaw * 180) / Math.PI)
    : clamp(shapeRotationRaw, -180, 180);
  const shapeScatterRaw = readNum(dict, ["shapeScatter", "shapeRotationJitter"], 0);
  const angleJitterDeg = clamp(shapeScatterRaw <= 1 ? shapeScatterRaw * 180 : shapeScatterRaw, 0, 180);
  const azimuthFollow = readBool(dict, ["shapeAzimuth", "azimuth"], false);

  const sizeDynamics: DynamicMappingIR[] = [
    { input: "constant", curve: [Math.min(1, maxDiameterPx / 1000), Math.min(1, maxDiameterPx / 1000)], min: 0, max: 1 },
  ];
  const pressureSize = buildDynamicMapping(
    "pressure",
    dict.pressureSizeCurve ?? dict.dynamicsPressureSizeCurve,
    readNum(dict, ["dynamicsPressureSize", "pressureSize"], 0.8),
    minDiameterRatio,
  );
  if (pressureSize) sizeDynamics.push(pressureSize);
  const tiltSize = buildDynamicMapping("tiltAltitude", dict.tiltSizeCurve ?? dict.dynamicsTiltSizeCurve, readNum(dict, ["dynamicsTiltSize", "tiltSize"], 0));
  if (tiltSize) sizeDynamics.push(tiltSize);
  const speedSize = buildDynamicMapping("velocity", dict.speedSizeCurve, readNum(dict, ["dynamicsSpeedSize", "speedSize"], 0));
  if (speedSize) sizeDynamics.push(speedSize);

  const flowDynamics: DynamicMappingIR[] = [
    { input: "constant", curve: [maxOpacity, maxOpacity], min: 0, max: 1 },
  ];
  const pressureOpacity = buildDynamicMapping(
    "pressure",
    dict.pressureOpacityCurve ?? dict.dynamicsPressureOpacityCurve,
    readNum(dict, ["dynamicsPressureOpacity", "pressureOpacity"], 0),
    minOpacity,
  );
  if (pressureOpacity) flowDynamics.push(pressureOpacity);
  const tiltOpacity = buildDynamicMapping("tiltAltitude", dict.tiltOpacityCurve ?? dict.dynamicsTiltOpacityCurve, readNum(dict, ["dynamicsTiltOpacity", "tiltOpacity"], 0));
  if (tiltOpacity) flowDynamics.push(tiltOpacity);

  const dilution = clamp(readNum(dict, ["paintDilution", "dilution"], 0), 0, 1);
  const charge = clamp(readNum(dict, ["paintCharge", "charge"], 0), 0, 1);
  const attack = clamp(readNum(dict, ["paintAttack", "attack"], 0), 0, 1);
  const pull = clamp(readNum(dict, ["paintPull", "pull"], 0), 0, 1);
  const grade = clamp(readNum(dict, ["paintGrade", "grade"], 0), 0, 1);
  const smudge = clamp(readNum(dict, ["smudge", "smudgePull"], 0), 0, 1);
  const wetMixActive = dilution > 0.01 || pull > 0.01 || smudge > 0.01 || charge > 0.01;
  const wetMix: ProcreateWetMixSettings = { enabled: wetMixActive, dilution, charge, attack, pull, grade, smudge };
  const mixingKind: "none" | "wet" | "smudge" =
    smudge > 0.25 && dilution < 0.1 ? "smudge" : wetMixActive ? "wet" : "none";
  const mixingStrength = mixingKind === "smudge"
    ? clamp(Math.max(smudge, pull), 0, 1)
    : mixingKind === "wet"
      ? clamp(Math.max(dilution, pull, charge * 0.7, attack * 0.5), 0, 1)
      : 0;

  const pressureStart = clamp(readNum(dict, ["pressureTaperStartLength", "taperStartLength", "taperStart"], 0), 0, 0.5);
  const pressureEnd = clamp(readNum(dict, ["pressureTaperEndLength", "taperEndLength", "taperEnd"], 0), 0, 0.5);
  const touchStart = clamp(readNum(dict, ["touchTaperStartLength", "classicTaperStart"], 0), 0, 0.5);
  const touchEnd = clamp(readNum(dict, ["touchTaperEndLength", "classicTaperEnd"], 0), 0, 0.5);
  const taperSize = clamp(readNum(dict, ["taperSize", "pressureTaperSize"], 0), 0, 1);
  const taperOpacity = clamp(readNum(dict, ["taperOpacity", "pressureTaperOpacity"], 0), 0, 1);
  const taperTip = clamp(readNum(dict, ["taperTip", "pressureTaperTip"], 0.5), 0, 1);
  const taperEnabled = pressureStart > 0 || pressureEnd > 0 || touchStart > 0 || touchEnd > 0;
  const taper: ProcreateTaperSettings = {
    enabled: taperEnabled,
    pressureStart,
    pressureEnd,
    touchStart,
    touchEnd,
    size: taperSize,
    opacity: taperOpacity,
    tip: taperTip,
  };

  const bundled = asDict(dict.bundledBrush ?? dict.secondaryBrush ?? dict.dualBrush);
  let dualBrush: ProcreateDualBrushSettings | null = null;
  if (bundled) {
    const combineModeCode = readNum(dict, ["bundledBrushCombineMode", "combineMode", "dualBrushBlendMode"], 1);
    const combineMode: "multiply" | "screen" = combineModeCode === 3 || combineModeCode === 4 ? "screen" : "multiply";
    const secondarySizePx = resolveProcreateDiameterPx(bundled);
    const dualShapeBytes = files.get(`${prefix}Shape2.png`) ?? files.get(`${prefix}DualShape.png`);
    const dualDecoded = dualShapeBytes ? decodePngToR8AlphaMask(dualShapeBytes, "light-is-opaque") : null;
    dualBrush = {
      enabled: true,
      combineMode,
      sizeRatio: clamp(secondarySizePx / Math.max(1, maxDiameterPx), 0.25, 2),
      secondaryName: readStr(bundled, ["name", "brushName"]),
      secondaryTipPyramid: dualDecoded
        ? buildR8TipPyramid(dualDecoded.alpha, dualDecoded.width, dualDecoded.height, {
            minSize: 8,
            maxSize: PROCREATE_BRUSHSET_LIMITS.maxTipResolution,
            documentMaxSize: 64,
          })
        : null,
    };
  }

  const grainDepth = clamp(readNum(dict, ["textureDepth", "grainDepth"], grainAsset ? 0.65 : 0), 0, 1);
  const grainScale = clamp(readNum(dict, ["textureScale", "grainScale"], 1), 0.05, 16);
  const grain: ProcreateGrainSettings | null = grainAsset || grainDepth > 0.01
    ? {
        enabled: true,
        scale: grainScale,
        depth: grainDepth,
        depthMinimum: clamp(readNum(dict, ["textureDepthMinimum", "grainDepthMinimum"], 0), 0, 1),
        brightness: clamp(readNum(dict, ["textureBrightness", "grainBrightness"], 0), -1, 1),
        contrast: clamp(readNum(dict, ["textureContrast", "grainContrast"], 0), -1, 1),
        invert: readBool(dict, ["textureInverted", "grainInverted"], false),
        moving: readNum(dict, ["textureMovement", "grainMovement"], 0) > 0,
        blendMode: mapProcreateTextureBlendMode(readNum(dict, ["textureBlendMode", "grainBlendMode"], 0)),
        grainAssetId: grainAsset?.id ?? null,
      }
    : null;

  const hueJitter = clamp(readNum(dict, ["dynamicsJitterHue", "colorHueJitter"], 0), 0, 1) * 180;
  const satJitter = clamp(readNum(dict, ["dynamicsJitterSaturation", "colorSaturationJitter"], 0), 0, 1);
  const valJitter = clamp(readNum(dict, ["dynamicsJitterDarkness", "dynamicsJitterLightness", "colorLightnessJitter"], 0), 0, 1);
  const secondaryColorMix = clamp(readNum(dict, ["dynamicsJitterSecondaryColor", "secondaryColorMix"], 0), 0, 1);
  const colorDynamics: ProcreateColorDynamicsSettings | null =
    hueJitter > 0 || satJitter > 0 || valJitter > 0 || secondaryColorMix > 0
      ? { hueJitter, saturationJitter: satJitter, brightnessJitter: valJitter, secondaryColorMix }
      : null;

  const hardness = clamp(1 - readNum(dict, ["dynamicsPressureSoftness", "softness"], 0.15), 0, 1);
  const id = stableTextId("procreate-brush", new TextEncoder().encode(`${fnv1a64Hex(archiveBytes)}\0${folder}\0${name}`));
  const providerPreference = ["hokusai-natural-media"];
  if (wetMixActive) providerPreference.push("procreate:wet-mix");
  if (dualBrush?.enabled) providerPreference.push("procreate:dual-brush");
  if (taperEnabled) providerPreference.push("procreate:taper");
  if (grain?.enabled) providerPreference.push("procreate:grain");

  const program = brushProgramIRSchema.parse({
    id,
    name,
    stabilizer: { kind: "ema", strength: streamline, predictionMs: 0 },
    sizeDynamics,
    flowDynamics,
    geometry: {
      kind: "perfect-freehand",
      thinning: taperEnabled ? clamp(0.5 + taperSize * 0.4, 0, 1) : 0.5,
      smoothing: streamline,
      streamline,
      capStart: !(pressureStart > 0 || touchStart > 0),
      capEnd: !(pressureEnd > 0 || touchEnd > 0),
    },
    tip: {
      kind: shapeAsset ? "image" : grain ? "stamp" : "round",
      hardness,
      spacingPct: clamp(Math.round(spacingRatio * 1000) / 10, 1, 1000),
      angleJitterDeg,
      ...(shapeAsset ? { imageAssetId: shapeAsset.id } : {}),
    },
    mixing: { kind: mixingKind, strength: mixingStrength },
    output: { target: "raster-tiles", bake: "flatten" },
    providerPreference,
    sourcePayload: { format: "procreate-brushset", base64: bytesToBase64(brushArchiveBytes) },
  });

  return {
    folder,
    name,
    author,
    program,
    features: {
      spacingRatio,
      scatterRatio,
      maxDiameterPx,
      minDiameterRatio,
      roundness: shapeRoundness,
      angleDeg,
      angleJitterDeg,
      azimuthFollow,
      wetMix,
      taper,
      dualBrush,
      grain,
      colorDynamics,
      tipPyramid: shapeAsset?.pyramid ?? null,
      grainPyramid: grainAsset?.pyramid ?? null,
    },
    shapeAssetId: shapeAsset?.id ?? null,
    grainAssetId: grainAsset?.id ?? null,
  };
}

/** Imports a Procreate `.brushset` (or `.brush`) ZIP archive into BrushProgramIR + lossless features. */
export function importProcreateBrushset(
  source: Uint8Array | ArrayBuffer,
  options: ProcreateBrushsetImportOptions = {},
): ProcreateBrushsetImportResult {
  if (options.signal?.aborted) throw new ProcreateBrushsetError("import aborted", "aborted");
  const bytes = source instanceof Uint8Array ? source.slice() : new Uint8Array(source.slice(0));
  const maxBytes = options.maxArchiveBytes ?? PROCREATE_BRUSHSET_LIMITS.maxArchiveBytes;
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) {
    throw new ProcreateBrushsetError("Procreate brushset exceeds safety limit or is empty", "source-too-large");
  }

  const files = extractProcreateZipEntries(
    bytes,
    (message, code, cause) => {
      throw new ProcreateBrushsetError(message, code, cause);
    },
    options.signal,
  );
  const warnings: FormatIssue[] = [];
  const unsupported: FormatIssue[] = [];
  let packName = "Procreate Brushset";
  let brushFolders: string[] = [];

  const manifestBytes = files.get("brushset.plist");
  if (manifestBytes) {
    try {
      const manifest = asDict(parsePlist(manifestBytes));
      if (!manifest) throw new PlistParseError("brushset.plist root is not a dictionary", "invalid-format");
      packName = readStr(manifest, ["name"]) ?? packName;
      if (Array.isArray(manifest.brushes)) {
        brushFolders = manifest.brushes
          .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
          .map((entry) => stripTrailingSlashes(entry.trim()));
      }
    } catch (cause) {
      throw new ProcreateBrushsetError(
        cause instanceof Error ? cause.message : "failed to parse brushset.plist",
        "plist-invalid",
        cause,
      );
    }
  }

  if (brushFolders.length === 0) {
    const discovered = new Set<string>();
    for (const path of files.keys()) {
      if (path === "Brush.archive") discovered.add("");
      else if (path.endsWith("/Brush.archive")) discovered.add(path.slice(0, -"/Brush.archive".length));
    }
    brushFolders = [...discovered].sort((a, b) => a.localeCompare(b, "en"));
  }

  const brushes: ProcreateBrushEntry[] = [];
  const assets: ProcreateEmbeddedAsset[] = [];
  const authors = new Set<string>();

  for (const folder of brushFolders.slice(0, PROCREATE_BRUSHSET_LIMITS.maxBrushes)) {
    if (options.signal?.aborted) throw new ProcreateBrushsetError("import aborted", "aborted");
    const entry = decodeBrushFolder(bytes, folder, files, assets, warnings);
    if (entry) {
      brushes.push(entry);
      if (entry.author) authors.add(entry.author);
    }
  }
  if (brushes.length === 0) {
    throw new ProcreateBrushsetError("no readable brushes found in .brushset archive", "no-brushes");
  }

  return {
    format: "procreate-brushset",
    name: packName,
    brushes,
    assets,
    authors: [...authors].sort((a, b) => a.localeCompare(b, "en")),
    warnings,
    unsupported,
    sourcePayload: { format: "procreate-brushset", base64: bytesToBase64(bytes) },
  };
}
