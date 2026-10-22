import {
  buildStudioPackageArchiveBlob,
  buildStudioPackageArchiveBytes,
  type StudioPackageArchiveEntry,
  type StudioPackageArchiveSource,
} from "./studio-package-archive";
import {
  readStudioZipArchive,
  StudioZipReaderError,
  type StudioZipArchive,
  type StudioZipEntry,
  type StudioZipInflateRawAdapter,
  type StudioZipReaderLimits,
} from "./studio-zip-reader";

import type { StudioCrc32ExecutionMode } from "./studio-crc32-worker-client";

/** OpenRaster 0.0.x interchange without DOM or image decoding dependencies. */

export const STUDIO_OPENRASTER_MIME = "image/openraster" as const;
export const STUDIO_OPENRASTER_EXTENSION = ".ora" as const;

export const STUDIO_OPENRASTER_LIMITS = Object.freeze({
  maxArchiveBytes: 520_000_000,
  maxLayers: 500,
  maxLayerBytes: 128_000_000,
  maxMergedImageBytes: 192_000_000,
  maxThumbnailBytes: 16_000_000,
  maxTotalImageBytes: 500_000_000,
  maxDecodedPixelsPerImage: 16_777_216,
  maxTotalDecodedRgbaBytes: 128 * 1024 * 1024,
  maxStackXmlBytes: 2_000_000,
  maxDimension: 32_768,
  maxPixels: 268_435_456,
  maxLayerNameCharacters: 512,
  maxOffsetMagnitude: 1_000_000,
  maxXmlDepth: 128,
  maxXmlElements: 4_096,
  maxXmlAttributesPerElement: 64,
  maxGroups: 500,
});

export interface StudioOpenRasterLimits {
  maxArchiveBytes: number;
  maxLayers: number;
  maxLayerBytes: number;
  maxMergedImageBytes: number;
  maxThumbnailBytes: number;
  maxTotalImageBytes: number;
  maxDecodedPixelsPerImage: number;
  maxTotalDecodedRgbaBytes: number;
  maxStackXmlBytes: number;
  maxDimension: number;
  maxPixels: number;
  maxLayerNameCharacters: number;
  maxOffsetMagnitude: number;
  maxXmlDepth: number;
  maxXmlElements: number;
  maxXmlAttributesPerElement: number;
  maxGroups: number;
}

export const STUDIO_OPENRASTER_BLEND_MODES = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "color",
  "luminosity",
  "hue",
  "saturation",
  "plus",
  "destination-in",
  "destination-out",
  "source-atop",
  "destination-atop",
] as const;

export type StudioOpenRasterBlendMode = (typeof STUDIO_OPENRASTER_BLEND_MODES)[number];

export interface StudioOpenRasterLayerInput {
  name: string;
  png: StudioPackageArchiveSource;
  x?: number;
  y?: number;
  opacity?: number;
  visible?: boolean;
  /** Unknown values are exported as normal with an explicit warning. */
  blendMode?: StudioOpenRasterBlendMode | string;
}

export interface StudioOpenRasterExportInput {
  width: number;
  height: number;
  /** Back-to-front Studio paint order. ORA stack.xml is emitted front-to-back. */
  layers: readonly StudioOpenRasterLayerInput[];
  mergedImage: StudioPackageArchiveSource;
  thumbnail: StudioPackageArchiveSource;
  name?: string;
}

export interface StudioOpenRasterExportOptions {
  limits?: Partial<StudioOpenRasterLimits>;
  signal?: AbortSignal;
  /** Fixed before ZIP construction. Browser product callers select `worker`. */
  crc32ExecutionMode?: StudioCrc32ExecutionMode;
}

export interface StudioOpenRasterImportOptions extends StudioOpenRasterExportOptions {
  inflateRaw?: StudioZipInflateRawAdapter;
}

export type StudioOpenRasterWarningCode =
  | "GROUPS_FLATTENED"
  | "MASKS_IGNORED"
  | "PREVIEW_DIMENSION_MISMATCH"
  | "PREVIEW_PROFILE_MISMATCH"
  | "UNSUPPORTED_BLEND_MODE"
  | "UNSUPPORTED_XML_ATTRIBUTE"
  | "UNSUPPORTED_XML_ELEMENT";

/** 같은 경고 코드라도 방출 지점마다 원문이 달라 리졸버 키를 가르는 접미사. */
export type StudioOpenRasterWarningVariant =
  | "dimensionMismatch"
  | "export"
  | "import"
  | "masksIgnored"
  | "mergedBitDepth"
  | "thumbnailProfile"
  | "unsupportedAttribute"
  | "unsupportedElement";

/**
 * A4 D4 (R12): 생산자는 표시 문구 대신 구조화 코드+variant+params만 방출한다.
 * 문구 해석은 표시·집계 지점에서만 한다
 * (status-i18n/studio-producer-error-i18n-interchange-ora.ts).
 */
export interface StudioOpenRasterWarning {
  code: StudioOpenRasterWarningCode;
  variant: StudioOpenRasterWarningVariant;
  params?: Readonly<Record<string, string>>;
  layerIndex?: number;
  path?: string;
}

export type StudioOpenRasterGroupIsolation = "isolate" | "auto";

/** Validated PNG header metadata that can be displayed before browser image decoding. */
export interface StudioOpenRasterImageInfo {
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  readonly decodedRgbaBytes: number;
  readonly bitDepth: number;
  readonly colorType: number;
  readonly interlaced: boolean;
}

/**
 * A non-root ORA stack. IDs and sibling indexes are deterministic for one import and allow the UI
 * to reconstruct duplicate-named nested groups without parsing stack.xml again.
 */
export interface StudioOpenRasterImportedGroup {
  readonly id: string;
  readonly parentId?: string;
  readonly name: string;
  readonly depth: number;
  readonly siblingIndex: number;
  readonly opacity: number;
  readonly visible: boolean;
  readonly blendMode: StudioOpenRasterBlendMode;
  readonly sourceCompositeOp: string;
  readonly isolation: StudioOpenRasterGroupIsolation;
  readonly effectiveOpacity: number;
  readonly effectiveVisible: boolean;
}

export interface StudioOpenRasterImportSummary {
  readonly layerCount: number;
  readonly groupCount: number;
  readonly hiddenLayerCount: number;
  readonly hiddenGroupCount: number;
  readonly unsupportedFeatureCount: number;
  readonly totalImageBytes: number;
  readonly totalDecodedRgbaBytes: number;
}

export interface StudioOpenRasterBuildBytesResult {
  bytes: Uint8Array;
  warnings: readonly StudioOpenRasterWarning[];
}

export interface StudioOpenRasterBuildBlobResult {
  blob: Blob;
  warnings: readonly StudioOpenRasterWarning[];
}

export interface StudioOpenRasterImportedLayer {
  /** Back-to-front Studio paint order; zero is the backmost layer. */
  z: number;
  name: string;
  png: Blob;
  path: string;
  x: number;
  y: number;
  opacity: number;
  visible: boolean;
  blendMode: StudioOpenRasterBlendMode;
  sourceCompositeOp: string;
  /** Validated source PNG dimensions; these are independent of the document canvas size. */
  width: number;
  height: number;
  byteLength: number;
  decodedRgbaBytes: number;
  parentGroupId?: string;
  /** Root-to-leaf group identity and display-name paths. */
  groupIds: readonly string[];
  groupPath: readonly string[];
  depth: number;
  siblingIndex: number;
  /** Product/AND of this layer's value and all ancestor group values. */
  effectiveOpacity: number;
  effectiveVisible: boolean;
}

export interface StudioOpenRasterImportResult {
  width: number;
  height: number;
  name?: string;
  version?: string;
  resolution?: Readonly<{ xPpi: number; yPpi: number }>;
  layers: readonly StudioOpenRasterImportedLayer[];
  groups: readonly StudioOpenRasterImportedGroup[];
  mergedImage: Blob;
  thumbnail: Blob;
  mergedImageInfo: StudioOpenRasterImageInfo;
  thumbnailInfo: StudioOpenRasterImageInfo;
  summary: StudioOpenRasterImportSummary;
  warnings: readonly StudioOpenRasterWarning[];
}

export type StudioOpenRasterErrorCode =
  | "ABORTED"
  | "ARCHIVE_INVALID"
  | "DIMENSION_INVALID"
  | "IMAGE_INVALID"
  | "LAYER_COUNT_LIMIT"
  | "LAYER_INVALID"
  | "LIMIT_INVALID"
  | "MIMETYPE_INVALID"
  | "REQUIRED_ENTRY_MISSING"
  | "SIZE_LIMIT"
  | "STACK_XML_INVALID";

/** 방출 지점 단위 서브코드 — 리졸버 키는 기존 코드가 아니라 이 variant로 가른다. */
export type StudioOpenRasterErrorVariant =
  | "aborted"
  | "archiveEntryReadFailed"
  | "archiveEntryVerifyFailed"
  | "archiveInvalid"
  | "canvasDimensionOutOfRange"
  | "documentNameOutOfRange"
  | "groupCountLimit"
  | "groupIsolationInvalid"
  | "groupNameOutOfRange"
  | "groupStackOutsideLayerStack"
  | "imageBudgetExceeded"
  | "imageReadFailed"
  | "imageUnsupportedData"
  | "layerCountLimit"
  | "layerCountOutOfRange"
  | "layerNameOutOfRange"
  | "layerOffsetOutOfRange"
  | "layerOpacityOutOfRange"
  | "layerOutsideStack"
  | "layerSourceDuplicate"
  | "layerSourcePathInvalid"
  | "layerSourcePathSegmentUnsafe"
  | "layerSourceReservedEntry"
  | "limitInvalid"
  | "mimetypeLengthInvalid"
  | "mimetypeNotFirstStored"
  | "mimetypeNotUtf8"
  | "mimetypeValueInvalid"
  | "noLayersToImport"
  | "opacityNotNumber"
  | "opacityOutOfRange"
  | "pngDimensionsZero"
  | "pngFirstChunkNotIhdr"
  | "pngIhdrFormatInvalid"
  | "pngIhdrIncomplete"
  | "pngDimensionLimit"
  | "pngPixelLimit"
  | "pngSignatureInvalid"
  | "pngSizeChanged"
  | "pngSizeLimit"
  | "requiredLayerPngMissing"
  | "requiredMergedImageMissing"
  | "requiredStackXmlMissing"
  | "requiredThumbnailMissing"
  | "resolutionPairRequired"
  | "rootStackNotUnique"
  | "sizeLayerPngLimit"
  | "sizeMergedImageByteLimit"
  | "sizeStackXmlByteLimit"
  | "sizeStackXmlBytesOutOfRange"
  | "sizeStackXmlLimit"
  | "sizeThumbnailByteLimit"
  | "stackAttributeDuplicate"
  | "stackAttributeMissingEquals"
  | "stackAttributeNameInvalid"
  | "stackAttributeNotQuoted"
  | "stackAttributeTooMany"
  | "stackAttributeUnclosed"
  | "stackClosingTagInvalid"
  | "stackCommentUnclosed"
  | "stackDeclarationElementForbidden"
  | "stackDeclarationInvalid"
  | "stackDepthLimit"
  | "stackDtdForbidden"
  | "stackElementCountLimit"
  | "stackImageRootNotUnique"
  | "stackIntegerInvalid"
  | "stackIntegerOutOfRange"
  | "stackInvalidEntity"
  | "stackNestingInvalid"
  | "stackNotUtf8"
  | "stackProcessingInstructionUnclosed"
  | "stackSelfClosingTagInvalid"
  | "stackStructureIncomplete"
  | "stackTagNameInvalid"
  | "stackTagUnclosed"
  | "stackTextOutsideRoot"
  | "stackTopLevelElementForbidden"
  | "stackUnexpectedText"
  | "stackUnknownEntity"
  | "versionNotSemver"
  | "visibilityInvalid"
  | "xmlTextOutOfRange";

/**
 * A4 D4 (R12): 생산자는 표시 문구 대신 구조화 코드+variant+params만 방출한다
 * (message = 코드). 문구는 표시 지점에서 리졸버로 해석한다
 * (status-i18n/studio-producer-error-i18n-interchange-ora.ts).
 */
export class StudioOpenRasterError extends Error {
  readonly code: StudioOpenRasterErrorCode;
  readonly variant: StudioOpenRasterErrorVariant;
  readonly params?: Readonly<Record<string, string>>;
  readonly path?: string;

  constructor(
    code: StudioOpenRasterErrorCode,
    variant: StudioOpenRasterErrorVariant,
    params?: Readonly<Record<string, string>>,
    path?: string,
  ) {
    super(code);
    this.name = "StudioOpenRasterError";
    this.code = code;
    this.variant = variant;
    if (params !== undefined) this.params = params;
    if (path !== undefined) this.path = path;
  }
}

interface PreparedOpenRaster {
  entries: StudioPackageArchiveEntry[];
  warnings: StudioOpenRasterWarning[];
}

interface ParsedXmlTag {
  name: string;
  attributes: ReadonlyMap<string, string>;
  closing: boolean;
  selfClosing: boolean;
}

interface ParsedStackLayer {
  name: string;
  path: string;
  x: number;
  y: number;
  opacity: number;
  visible: boolean;
  blendMode: StudioOpenRasterBlendMode;
  sourceCompositeOp: string;
  parentGroupId?: string;
  groupIds: string[];
  groupPath: string[];
  depth: number;
  siblingIndex: number;
  effectiveOpacity: number;
  effectiveVisible: boolean;
}

interface ParsedStackGroup extends StudioOpenRasterImportedGroup {
  readonly groupIds: string[];
  readonly groupPath: string[];
}

interface ParsedStackXml {
  width: number;
  height: number;
  name?: string;
  version?: string;
  resolution?: Readonly<{ xPpi: number; yPpi: number }>;
  frontToBackLayers: ParsedStackLayer[];
  groups: ParsedStackGroup[];
  warnings: StudioOpenRasterWarning[];
}

interface ValidatedPngSource extends Omit<StudioOpenRasterImageInfo, "path" | "byteLength"> {
  bytes: Uint8Array;
}

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const XML_NAME = /^[A-Za-z_][A-Za-z0-9_.:-]*/u;

const BLEND_TO_COMPOSITE = new Map<StudioOpenRasterBlendMode, string>([
  ["normal", "svg:src-over"],
  ["multiply", "svg:multiply"],
  ["screen", "svg:screen"],
  ["overlay", "svg:overlay"],
  ["darken", "svg:darken"],
  ["lighten", "svg:lighten"],
  ["color-dodge", "svg:color-dodge"],
  ["color-burn", "svg:color-burn"],
  ["hard-light", "svg:hard-light"],
  ["soft-light", "svg:soft-light"],
  ["difference", "svg:difference"],
  ["exclusion", "svg:exclusion"],
  ["color", "svg:color"],
  ["luminosity", "svg:luminosity"],
  ["hue", "svg:hue"],
  ["saturation", "svg:saturation"],
  ["plus", "svg:plus"],
  ["destination-in", "svg:dst-in"],
  ["destination-out", "svg:dst-out"],
  ["source-atop", "svg:src-atop"],
  ["destination-atop", "svg:dst-atop"],
]);

const COMPOSITE_TO_BLEND = new Map(
  [...BLEND_TO_COMPOSITE].map(([blend, composite]) => [composite, blend] as const)
);

function oraError(
  code: StudioOpenRasterErrorCode,
  variant: StudioOpenRasterErrorVariant,
  params?: Readonly<Record<string, string>>,
  path?: string,
): StudioOpenRasterError {
  return new StudioOpenRasterError(code, variant, params, path);
}

function freezeWarnings(
  warnings: readonly StudioOpenRasterWarning[],
): readonly StudioOpenRasterWarning[] {
  return Object.freeze(warnings.map((warning) => Object.freeze({ ...warning })));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw oraError("ABORTED", "aborted");
}

function resolveIntegerLimit(
  value: number | undefined,
  maximum: number,
  key: keyof StudioOpenRasterLimits
): number {
  if (value === undefined) return maximum;
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw oraError("LIMIT_INVALID", "limitInvalid", {
      key,
      max: maximum.toLocaleString("en-US"),
    });
  }
  return value;
}

function resolveLimits(value?: Partial<StudioOpenRasterLimits>): StudioOpenRasterLimits {
  return {
    maxArchiveBytes: resolveIntegerLimit(
      value?.maxArchiveBytes,
      STUDIO_OPENRASTER_LIMITS.maxArchiveBytes,
      "maxArchiveBytes"
    ),
    maxLayers: resolveIntegerLimit(
      value?.maxLayers,
      STUDIO_OPENRASTER_LIMITS.maxLayers,
      "maxLayers"
    ),
    maxLayerBytes: resolveIntegerLimit(
      value?.maxLayerBytes,
      STUDIO_OPENRASTER_LIMITS.maxLayerBytes,
      "maxLayerBytes"
    ),
    maxMergedImageBytes: resolveIntegerLimit(
      value?.maxMergedImageBytes,
      STUDIO_OPENRASTER_LIMITS.maxMergedImageBytes,
      "maxMergedImageBytes"
    ),
    maxThumbnailBytes: resolveIntegerLimit(
      value?.maxThumbnailBytes,
      STUDIO_OPENRASTER_LIMITS.maxThumbnailBytes,
      "maxThumbnailBytes"
    ),
    maxTotalImageBytes: resolveIntegerLimit(
      value?.maxTotalImageBytes,
      STUDIO_OPENRASTER_LIMITS.maxTotalImageBytes,
      "maxTotalImageBytes"
    ),
    maxDecodedPixelsPerImage: resolveIntegerLimit(
      value?.maxDecodedPixelsPerImage,
      STUDIO_OPENRASTER_LIMITS.maxDecodedPixelsPerImage,
      "maxDecodedPixelsPerImage"
    ),
    maxTotalDecodedRgbaBytes: resolveIntegerLimit(
      value?.maxTotalDecodedRgbaBytes,
      STUDIO_OPENRASTER_LIMITS.maxTotalDecodedRgbaBytes,
      "maxTotalDecodedRgbaBytes"
    ),
    maxStackXmlBytes: resolveIntegerLimit(
      value?.maxStackXmlBytes,
      STUDIO_OPENRASTER_LIMITS.maxStackXmlBytes,
      "maxStackXmlBytes"
    ),
    maxDimension: resolveIntegerLimit(
      value?.maxDimension,
      STUDIO_OPENRASTER_LIMITS.maxDimension,
      "maxDimension"
    ),
    maxPixels: resolveIntegerLimit(
      value?.maxPixels,
      STUDIO_OPENRASTER_LIMITS.maxPixels,
      "maxPixels"
    ),
    maxLayerNameCharacters: resolveIntegerLimit(
      value?.maxLayerNameCharacters,
      STUDIO_OPENRASTER_LIMITS.maxLayerNameCharacters,
      "maxLayerNameCharacters"
    ),
    maxOffsetMagnitude: resolveIntegerLimit(
      value?.maxOffsetMagnitude,
      STUDIO_OPENRASTER_LIMITS.maxOffsetMagnitude,
      "maxOffsetMagnitude"
    ),
    maxXmlDepth: resolveIntegerLimit(
      value?.maxXmlDepth,
      STUDIO_OPENRASTER_LIMITS.maxXmlDepth,
      "maxXmlDepth"
    ),
    maxXmlElements: resolveIntegerLimit(
      value?.maxXmlElements,
      STUDIO_OPENRASTER_LIMITS.maxXmlElements,
      "maxXmlElements"
    ),
    maxXmlAttributesPerElement: resolveIntegerLimit(
      value?.maxXmlAttributesPerElement,
      STUDIO_OPENRASTER_LIMITS.maxXmlAttributesPerElement,
      "maxXmlAttributesPerElement"
    ),
    maxGroups: resolveIntegerLimit(
      value?.maxGroups,
      STUDIO_OPENRASTER_LIMITS.maxGroups,
      "maxGroups"
    ),
  };
}

function hasUnsafeXmlControl(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if ((code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127) {
      return true;
    }
  }
  return false;
}

function snapshotSource(source: unknown, path: string): StudioPackageArchiveSource {
  if (source instanceof Uint8Array) return source.slice();
  if (source instanceof ArrayBuffer) return source.slice(0);
  if (typeof Blob !== "undefined" && source instanceof Blob) return source;
  throw oraError("IMAGE_INVALID", "imageUnsupportedData", undefined, path);
}

function sourceSize(source: StudioPackageArchiveSource): number {
  if (source instanceof Uint8Array || source instanceof ArrayBuffer) return source.byteLength;
  return source.size;
}

async function sourceBytes(
  source: StudioPackageArchiveSource,
  path: string,
  signal?: AbortSignal
): Promise<Uint8Array> {
  throwIfAborted(signal);
  let bytes: Uint8Array;
  if (source instanceof Uint8Array) bytes = source;
  else if (source instanceof ArrayBuffer) bytes = new Uint8Array(source);
  else {
    try {
      bytes = new Uint8Array(await source.arrayBuffer());
    } catch (cause) {
      const detail = cause instanceof Error ? `: ${cause.message}` : "";
      throw oraError("IMAGE_INVALID", "imageReadFailed", { detail }, path);
    }
  }
  throwIfAborted(signal);
  return bytes;
}

function hasPngSignature(bytes: Uint8Array): boolean {
  if (bytes.byteLength < PNG_SIGNATURE.byteLength) return false;
  for (let index = 0; index < PNG_SIGNATURE.byteLength; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) return false;
  }
  return true;
}

function inspectPngIhdr(
  bytes: Uint8Array,
  path: string,
  limits: StudioOpenRasterLimits
): Omit<StudioOpenRasterImageInfo, "path" | "byteLength"> {
  if (!hasPngSignature(bytes)) {
    throw oraError("IMAGE_INVALID", "pngSignatureInvalid", undefined, path);
  }
  if (bytes.byteLength < 33) {
    throw oraError("IMAGE_INVALID", "pngIhdrIncomplete", undefined, path);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint32(8, false) !== 13 ||
    bytes[12] !== 73 ||
    bytes[13] !== 72 ||
    bytes[14] !== 68 ||
    bytes[15] !== 82
  ) {
    throw oraError("IMAGE_INVALID", "pngFirstChunkNotIhdr", undefined, path);
  }
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (width === 0 || height === 0) {
    throw oraError("IMAGE_INVALID", "pngDimensionsZero", undefined, path);
  }
  if (width > limits.maxDimension || height > limits.maxDimension) {
    throw oraError(
      "SIZE_LIMIT",
      "pngDimensionLimit",
      {
        path,
        width: width.toLocaleString("en-US"),
        height: height.toLocaleString("en-US"),
        max: limits.maxDimension.toLocaleString("en-US"),
      },
      path
    );
  }
  if (width > Math.floor(limits.maxDecodedPixelsPerImage / height)) {
    throw oraError(
      "SIZE_LIMIT",
      "pngPixelLimit",
      { path, max: limits.maxDecodedPixelsPerImage.toLocaleString("en-US") },
      path
    );
  }
  const bitDepth = bytes[24] ?? 0;
  const colorType = bytes[25] ?? 0;
  const compressionMethod = bytes[26] ?? -1;
  const filterMethod = bytes[27] ?? -1;
  const interlaceMethod = bytes[28] ?? -1;
  const validBitDepthsByColorType: Readonly<Record<number, readonly number[]>> = {
    0: [1, 2, 4, 8, 16],
    2: [8, 16],
    3: [1, 2, 4, 8],
    4: [8, 16],
    6: [8, 16],
  };
  if (
    !validBitDepthsByColorType[colorType]?.includes(bitDepth)
    || compressionMethod !== 0
    || filterMethod !== 0
    || (interlaceMethod !== 0 && interlaceMethod !== 1)
  ) {
    throw oraError("IMAGE_INVALID", "pngIhdrFormatInvalid", undefined, path);
  }
  const decodedBytesPerPixel = bitDepth === 16 ? 8 : 4;
  return {
    width,
    height,
    decodedRgbaBytes: width * height * decodedBytesPerPixel,
    bitDepth,
    colorType,
    interlaced: interlaceMethod === 1,
  };
}

function addImageBudget(
  current: number,
  added: number,
  maximum: number,
  label: string,
  path: string
): number {
  if (added > maximum - current) {
    throw oraError(
      "SIZE_LIMIT",
      "imageBudgetExceeded",
      { path, label, max: maximum.toLocaleString("en-US") },
      path
    );
  }
  return current + added;
}

function validateDimension(width: number, height: number, limits: StudioOpenRasterLimits): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > limits.maxDimension ||
    height > limits.maxDimension ||
    width * height > limits.maxPixels
  ) {
    throw oraError("DIMENSION_INVALID", "canvasDimensionOutOfRange");
  }
}

function validateOffset(value: number | undefined, limits: StudioOpenRasterLimits): number {
  const offset = value ?? 0;
  if (!Number.isSafeInteger(offset) || Math.abs(offset) > limits.maxOffsetMagnitude) {
    throw oraError("LAYER_INVALID", "layerOffsetOutOfRange");
  }
  return offset;
}

function validateOpacity(value: number | undefined): number {
  const opacity = value ?? 1;
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    throw oraError("LAYER_INVALID", "layerOpacityOutOfRange");
  }
  return opacity;
}

function validateXmlText(value: unknown, label: string, maxCharacters: number): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxCharacters ||
    hasUnsafeXmlControl(value)
  ) {
    throw oraError("LAYER_INVALID", "xmlTextOutOfRange", { label });
  }
  return value;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function snapshotInput(input: StudioOpenRasterExportInput): StudioOpenRasterExportInput {
  return {
    width: input.width,
    height: input.height,
    name: input.name,
    mergedImage: snapshotSource(input.mergedImage, "mergedimage.png"),
    thumbnail: snapshotSource(input.thumbnail, "Thumbnails/thumbnail.png"),
    layers: input.layers.map((layer, index) => ({
      name: layer.name,
      png: snapshotSource(layer.png, `data/layer${index.toString().padStart(4, "0")}.png`),
      x: layer.x,
      y: layer.y,
      opacity: layer.opacity,
      visible: layer.visible,
      blendMode: layer.blendMode,
    })),
  };
}

async function validatePngSource(
  source: StudioPackageArchiveSource,
  path: string,
  maxBytes: number,
  limits: StudioOpenRasterLimits,
  signal?: AbortSignal
): Promise<ValidatedPngSource> {
  const size = sourceSize(source);
  if (!Number.isSafeInteger(size) || size < 0 || size > maxBytes) {
    throw oraError("SIZE_LIMIT", "pngSizeLimit", undefined, path);
  }
  const bytes = await sourceBytes(source, path, signal);
  if (bytes.byteLength !== size) {
    throw oraError("IMAGE_INVALID", "pngSizeChanged", undefined, path);
  }
  const dimensions = inspectPngIhdr(bytes, path, limits);
  return { bytes: bytes.slice(), ...dimensions };
}

function imageInfo(
  path: string,
  bytes: Uint8Array,
  dimensions: Omit<StudioOpenRasterImageInfo, "path" | "byteLength">,
): StudioOpenRasterImageInfo {
  return Object.freeze({
    path,
    width: dimensions.width,
    height: dimensions.height,
    byteLength: bytes.byteLength,
    decodedRgbaBytes: dimensions.decodedRgbaBytes,
    bitDepth: dimensions.bitDepth,
    colorType: dimensions.colorType,
    interlaced: dimensions.interlaced,
  });
}

function appendPreviewMetadataWarnings(
  width: number,
  height: number,
  mergedImage: Pick<ValidatedPngSource, "width" | "height" | "bitDepth">,
  thumbnail: Pick<ValidatedPngSource, "width" | "height" | "bitDepth" | "interlaced">,
  warnings: StudioOpenRasterWarning[],
): void {
  if (mergedImage.width !== width || mergedImage.height !== height) {
    warnings.push({
      code: "PREVIEW_DIMENSION_MISMATCH",
      variant: "dimensionMismatch",
      params: {
        width: String(mergedImage.width),
        height: String(mergedImage.height),
        docWidth: String(width),
        docHeight: String(height),
      },
      path: "mergedimage.png",
    });
  }
  if (mergedImage.bitDepth !== 8 && mergedImage.bitDepth !== 16) {
    warnings.push({
      code: "PREVIEW_PROFILE_MISMATCH",
      variant: "mergedBitDepth",
      params: { bitDepth: String(mergedImage.bitDepth) },
      path: "mergedimage.png",
    });
  }
  if (
    thumbnail.width > 256
    || thumbnail.height > 256
    || thumbnail.bitDepth !== 8
    || thumbnail.interlaced
  ) {
    warnings.push({
      code: "PREVIEW_PROFILE_MISMATCH",
      variant: "thumbnailProfile",
      params: { width: String(thumbnail.width), height: String(thumbnail.height) },
      path: "Thumbnails/thumbnail.png",
    });
  }
}

function normalizeBlendForExport(
  value: string | undefined,
  warnings: StudioOpenRasterWarning[],
  layerIndex: number
): StudioOpenRasterBlendMode {
  const candidate = value ?? "normal";
  if (BLEND_TO_COMPOSITE.has(candidate as StudioOpenRasterBlendMode)) {
    return candidate as StudioOpenRasterBlendMode;
  }
  warnings.push({
    code: "UNSUPPORTED_BLEND_MODE",
    variant: "export",
    params: { mode: candidate },
    layerIndex,
  });
  return "normal";
}

async function prepareOpenRaster(
  rawInput: StudioOpenRasterExportInput,
  options: StudioOpenRasterExportOptions
): Promise<PreparedOpenRaster> {
  const limits = resolveLimits(options.limits);
  const input = snapshotInput(rawInput);
  throwIfAborted(options.signal);
  validateDimension(input.width, input.height, limits);
  if (input.layers.length === 0 || input.layers.length > limits.maxLayers) {
    throw oraError("LAYER_COUNT_LIMIT", "layerCountOutOfRange");
  }

  const warnings: StudioOpenRasterWarning[] = [];
  const preparedLayers: Array<{
    name: string;
    path: string;
    png: Uint8Array;
    x: number;
    y: number;
    opacity: number;
    visible: boolean;
    blendMode: StudioOpenRasterBlendMode;
  }> = [];
  let totalImageBytes = 0;
  let totalDecodedRgbaBytes = 0;

  for (let index = 0; index < input.layers.length; index += 1) {
    throwIfAborted(options.signal);
    const layer = input.layers[index];
    if (!layer) continue;
    const path = `data/layer${index.toString().padStart(4, "0")}.png`;
    const validated = await validatePngSource(
      layer.png,
      path,
      limits.maxLayerBytes,
      limits,
      options.signal
    );
    totalImageBytes = addImageBudget(
      totalImageBytes,
      validated.bytes.byteLength,
      limits.maxTotalImageBytes,
      "uncompressedBytes",
      path
    );
    totalDecodedRgbaBytes = addImageBudget(
      totalDecodedRgbaBytes,
      validated.decodedRgbaBytes,
      limits.maxTotalDecodedRgbaBytes,
      "decodedRgba",
      path
    );
    preparedLayers.push({
      name: validateXmlText(layer.name, "layerName", limits.maxLayerNameCharacters),
      path,
      png: validated.bytes,
      x: validateOffset(layer.x, limits),
      y: validateOffset(layer.y, limits),
      opacity: validateOpacity(layer.opacity),
      visible: layer.visible ?? true,
      blendMode: normalizeBlendForExport(layer.blendMode, warnings, index),
    });
  }

  const mergedImage = await validatePngSource(
    input.mergedImage,
    "mergedimage.png",
    limits.maxMergedImageBytes,
    limits,
    options.signal
  );
  const thumbnail = await validatePngSource(
    input.thumbnail,
    "Thumbnails/thumbnail.png",
    limits.maxThumbnailBytes,
    limits,
    options.signal
  );
  appendPreviewMetadataWarnings(input.width, input.height, mergedImage, thumbnail, warnings);
  for (const [path, image] of [
    ["mergedimage.png", mergedImage],
    ["Thumbnails/thumbnail.png", thumbnail],
  ] as const) {
    totalImageBytes = addImageBudget(
      totalImageBytes,
      image.bytes.byteLength,
      limits.maxTotalImageBytes,
      "uncompressedBytes",
      path
    );
    totalDecodedRgbaBytes = addImageBudget(
      totalDecodedRgbaBytes,
      image.decodedRgbaBytes,
      limits.maxTotalDecodedRgbaBytes,
      "decodedRgba",
      path
    );
  }

  const imageName = input.name === undefined
    ? ""
    : ` name="${escapeXml(validateXmlText(input.name, "documentName", limits.maxLayerNameCharacters))}"`;
  const layerXml = [...preparedLayers]
    .reverse()
    .map(
      (layer) =>
        `    <layer name="${escapeXml(layer.name)}" src="${layer.path}" x="${layer.x}" y="${layer.y}" opacity="${layer.opacity}" visibility="${layer.visible ? "visible" : "hidden"}" composite-op="${BLEND_TO_COMPOSITE.get(layer.blendMode)}"/>`
    )
    .join("\n");
  const stackXml = encoder.encode(
    `<?xml version="1.0" encoding="UTF-8"?>\n<image version="0.0.3" w="${input.width}" h="${input.height}"${imageName}>\n  <stack>\n${layerXml}\n  </stack>\n</image>\n`
  );
  if (stackXml.byteLength > limits.maxStackXmlBytes) {
    throw oraError("SIZE_LIMIT", "sizeStackXmlLimit");
  }

  return {
    warnings,
    entries: [
      { path: "mimetype", data: encoder.encode(STUDIO_OPENRASTER_MIME) },
      { path: "stack.xml", data: stackXml },
      { path: "mergedimage.png", data: mergedImage.bytes },
      { path: "Thumbnails/thumbnail.png", data: thumbnail.bytes },
      ...preparedLayers.map((layer) => ({ path: layer.path, data: layer.png })),
    ],
  };
}

export async function buildStudioOpenRasterBytes(
  input: StudioOpenRasterExportInput,
  options: StudioOpenRasterExportOptions = {}
): Promise<StudioOpenRasterBuildBytesResult> {
  const prepared = await prepareOpenRaster(input, options);
  const limits = resolveLimits(options.limits);
  const bytes = await buildStudioPackageArchiveBytes(prepared.entries, {
    signal: options.signal,
    crc32ExecutionMode: options.crc32ExecutionMode ?? "worker",
    limits: {
      maxFiles: limits.maxLayers + 4,
      maxEntryBytes: Math.max(
        limits.maxLayerBytes,
        limits.maxMergedImageBytes,
        limits.maxThumbnailBytes,
        limits.maxStackXmlBytes
      ),
      maxTotalBytes: Math.min(512_000_000, limits.maxTotalImageBytes + limits.maxStackXmlBytes + 64),
      maxArchiveBytes: limits.maxArchiveBytes,
    },
  });
  return { bytes, warnings: freezeWarnings(prepared.warnings) };
}

export async function buildStudioOpenRasterBlob(
  input: StudioOpenRasterExportInput,
  options: StudioOpenRasterExportOptions = {}
): Promise<StudioOpenRasterBuildBlobResult> {
  const prepared = await prepareOpenRaster(input, options);
  const limits = resolveLimits(options.limits);
  const blob = await buildStudioPackageArchiveBlob(prepared.entries, {
    mimeType: STUDIO_OPENRASTER_MIME,
    signal: options.signal,
    crc32ExecutionMode: options.crc32ExecutionMode ?? "worker",
    limits: {
      maxFiles: limits.maxLayers + 4,
      maxEntryBytes: Math.max(
        limits.maxLayerBytes,
        limits.maxMergedImageBytes,
        limits.maxThumbnailBytes,
        limits.maxStackXmlBytes
      ),
      maxTotalBytes: Math.min(512_000_000, limits.maxTotalImageBytes + limits.maxStackXmlBytes + 64),
      maxArchiveBytes: limits.maxArchiveBytes,
    },
  });
  return { blob, warnings: freezeWarnings(prepared.warnings) };
}

function decodeXmlEntities(value: string): string {
  const entityPattern = /&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/gu;
  const unescaped = value.replaceAll(entityPattern, "");
  if (unescaped.includes("&") || unescaped.includes("<")) {
    throw oraError("STACK_XML_INVALID", "stackUnknownEntity");
  }
  return value.replaceAll(entityPattern, (entity) => {
    if (entity === "&amp;") return "&";
    if (entity === "&lt;") return "<";
    if (entity === "&gt;") return ">";
    if (entity === "&quot;") return '"';
    if (entity === "&apos;") return "'";
    const hexadecimal = entity.startsWith("&#x");
    const numeric = Number.parseInt(entity.slice(hexadecimal ? 3 : 2, -1), hexadecimal ? 16 : 10);
    if (!isValidXmlCodePoint(numeric)) {
      throw oraError("STACK_XML_INVALID", "stackInvalidEntity");
    }
    return String.fromCodePoint(numeric);
  });
}

function isValidXmlCodePoint(value: number): boolean {
  return Number.isSafeInteger(value) && (
    value === 9 ||
    value === 10 ||
    value === 13 ||
    (value >= 32 && value <= 0xd7ff) ||
    (value >= 0xe000 && value <= 0xfffd) ||
    (value >= 0x10000 && value <= 0x10ffff)
  );
}

function parseXmlTag(source: string, maximumAttributes: number): ParsedXmlTag {
  let cursor = 0;
  let closing = false;
  if (source[cursor] === "/") {
    closing = true;
    cursor += 1;
  }
  while (/\s/u.test(source[cursor] ?? "")) cursor += 1;
  const nameMatch = XML_NAME.exec(source.slice(cursor));
  if (!nameMatch) throw oraError("STACK_XML_INVALID", "stackTagNameInvalid");
  const name = nameMatch[0];
  cursor += name.length;
  const attributes = new Map<string, string>();

  if (closing) {
    if (source.slice(cursor).trim().length !== 0) {
      throw oraError("STACK_XML_INVALID", "stackClosingTagInvalid");
    }
    return { name, attributes, closing, selfClosing: false };
  }

  let selfClosing = false;
  for (;;) {
    while (/\s/u.test(source[cursor] ?? "")) cursor += 1;
    if (cursor >= source.length) break;
    if (source[cursor] === "/") {
      selfClosing = true;
      cursor += 1;
      while (/\s/u.test(source[cursor] ?? "")) cursor += 1;
      if (cursor !== source.length) {
        throw oraError("STACK_XML_INVALID", "stackSelfClosingTagInvalid");
      }
      break;
    }
    const attributeMatch = XML_NAME.exec(source.slice(cursor));
    if (!attributeMatch) {
      throw oraError("STACK_XML_INVALID", "stackAttributeNameInvalid");
    }
    const attributeName = attributeMatch[0];
    cursor += attributeName.length;
    while (/\s/u.test(source[cursor] ?? "")) cursor += 1;
    if (source[cursor] !== "=") {
      throw oraError("STACK_XML_INVALID", "stackAttributeMissingEquals");
    }
    cursor += 1;
    while (/\s/u.test(source[cursor] ?? "")) cursor += 1;
    const quote = source[cursor];
    if (quote !== '"' && quote !== "'") {
      throw oraError("STACK_XML_INVALID", "stackAttributeNotQuoted");
    }
    cursor += 1;
    const end = source.indexOf(quote, cursor);
    if (end < 0) throw oraError("STACK_XML_INVALID", "stackAttributeUnclosed");
    if (attributes.has(attributeName)) {
      throw oraError("STACK_XML_INVALID", "stackAttributeDuplicate");
    }
    if (attributes.size >= maximumAttributes) {
      throw oraError("STACK_XML_INVALID", "stackAttributeTooMany");
    }
    attributes.set(attributeName, decodeXmlEntities(source.slice(cursor, end)));
    cursor = end + 1;
  }
  return { name, attributes, closing, selfClosing };
}

function findTagEnd(xml: string, start: number): number {
  let quote: string | undefined;
  for (let index = start; index < xml.length; index += 1) {
    const character = xml[index];
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  return -1;
}

function parseIntegerAttribute(
  value: string | undefined,
  label: string,
  minimum: number,
  maximum: number
): number {
  if (value === undefined || !/^-?\d+$/u.test(value)) {
    throw oraError("STACK_XML_INVALID", "stackIntegerInvalid", { label });
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw oraError("STACK_XML_INVALID", "stackIntegerOutOfRange", { label });
  }
  return parsed;
}

const ORA_UNSAFE_PATH_CHARACTER = /[<>:"|?*\\]/u;
const ORA_UNSAFE_BIDI_CHARACTER = /[\u202a-\u202e\u2066-\u2069]/u;
const ORA_WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;
const ORA_LAYER_ATTRIBUTES = new Set([
  "name", "src", "x", "y", "opacity", "visibility", "composite-op",
]);
const ORA_GROUP_ATTRIBUTES = new Set([
  "name", "opacity", "visibility", "composite-op", "isolation",
]);
const ORA_IMAGE_ATTRIBUTES = new Set([
  "version", "w", "h", "name", "xres", "yres",
]);

interface XmlElementFrame {
  readonly name: string;
  readonly kind: "image" | "root-stack" | "group" | "layer" | "ignored";
  readonly group?: ParsedStackGroup;
  nextVisualChildIndex: number;
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function validateLayerSourcePath(value: string | undefined): string {
  if (
    value === undefined
    || value.length === 0
    || encoder.encode(value).byteLength > 1_024
    || value.normalize("NFKC") !== value
    || value.startsWith("/")
    || value.startsWith("//")
    || /^[A-Za-z]:/u.test(value)
    || ORA_UNSAFE_PATH_CHARACTER.test(value)
    || ORA_UNSAFE_BIDI_CHARACTER.test(value)
    || hasUnsafeXmlControl(value)
    || hasUnpairedSurrogate(value)
    || !value.toLowerCase().endsWith(".png")
  ) {
    throw oraError("STACK_XML_INVALID", "layerSourcePathInvalid", undefined, value);
  }
  for (const segment of value.split("/")) {
    if (
      segment.length === 0
      || segment === "."
      || segment === ".."
      || segment.trim() !== segment
      || /[. ]$/u.test(segment)
      || ORA_WINDOWS_RESERVED_NAME.test(segment)
    ) {
      throw oraError("STACK_XML_INVALID", "layerSourcePathSegmentUnsafe", undefined, value);
    }
  }
  if (
    value === "mergedimage.png"
    || value === "Thumbnails/thumbnail.png"
    || value === "stack.xml"
  ) {
    throw oraError("STACK_XML_INVALID", "layerSourceReservedEntry", undefined, value);
  }
  return value;
}

function parseOpacityAttribute(value: string | undefined, path?: string): number {
  const source = value ?? "1";
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(source)) {
    throw oraError("STACK_XML_INVALID", "opacityNotNumber", undefined, path);
  }
  const opacity = Number(source);
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    throw oraError("STACK_XML_INVALID", "opacityOutOfRange", undefined, path);
  }
  return opacity;
}

function parseVisibilityAttribute(value: string | undefined, path?: string): boolean {
  const visibility = value ?? "visible";
  if (visibility !== "visible" && visibility !== "hidden") {
    throw oraError("STACK_XML_INVALID", "visibilityInvalid", undefined, path);
  }
  return visibility === "visible";
}

function parseBlendAttributes(
  attributes: ReadonlyMap<string, string>,
  warnings: StudioOpenRasterWarning[],
  context: { path: string; layerIndex?: number },
): { blendMode: StudioOpenRasterBlendMode; sourceCompositeOp: string } {
  const sourceCompositeOp = attributes.get("composite-op") ?? "svg:src-over";
  const blendMode = COMPOSITE_TO_BLEND.get(sourceCompositeOp);
  if (blendMode) return { blendMode, sourceCompositeOp };
  warnings.push({
    code: "UNSUPPORTED_BLEND_MODE",
    variant: "import",
    params: { mode: sourceCompositeOp },
    ...(context.layerIndex === undefined ? {} : { layerIndex: context.layerIndex }),
    path: context.path,
  });
  return { blendMode: "normal", sourceCompositeOp };
}

function warnUnsupportedAttributes(
  elementName: string,
  attributes: ReadonlyMap<string, string>,
  supported: ReadonlySet<string>,
  warnings: StudioOpenRasterWarning[],
  warningKeys: Set<string>,
  path = "stack.xml",
): void {
  const unsupported = [...attributes.keys()].filter((attribute) => !supported.has(attribute));
  if (unsupported.length === 0) return;
  const key = `${elementName}:${unsupported.sort().join(",")}`;
  if (warningKeys.has(key)) return;
  warningKeys.add(key);
  warnings.push({
    code: "UNSUPPORTED_XML_ATTRIBUTE",
    variant: "unsupportedAttribute",
    params: { element: elementName, attributes: unsupported.join(", ") },
    path,
  });
}

function parseLayerTag(
  attributes: ReadonlyMap<string, string>,
  limits: StudioOpenRasterLimits,
  warnings: StudioOpenRasterWarning[],
  warningKeys: Set<string>,
  layerIndex: number,
  siblingIndex: number,
  ancestors: readonly ParsedStackGroup[],
  referencedPaths: Set<string>,
): ParsedStackLayer {
  const path = validateLayerSourcePath(attributes.get("src"));
  const comparisonPath = path.toLocaleLowerCase("en-US");
  if (referencedPaths.has(comparisonPath)) {
    throw oraError("STACK_XML_INVALID", "layerSourceDuplicate", undefined, path);
  }
  referencedPaths.add(comparisonPath);
  warnUnsupportedAttributes("layer", attributes, ORA_LAYER_ATTRIBUTES, warnings, warningKeys, path);
  const name = attributes.get("name") ?? path;
  if (
    name.length > limits.maxLayerNameCharacters
    || hasUnsafeXmlControl(name)
    || hasUnpairedSurrogate(name)
  ) {
    throw oraError("STACK_XML_INVALID", "layerNameOutOfRange", undefined, path);
  }
  const x = attributes.has("x")
    ? parseIntegerAttribute(attributes.get("x"), "x", -limits.maxOffsetMagnitude, limits.maxOffsetMagnitude)
    : 0;
  const y = attributes.has("y")
    ? parseIntegerAttribute(attributes.get("y"), "y", -limits.maxOffsetMagnitude, limits.maxOffsetMagnitude)
    : 0;
  const opacity = parseOpacityAttribute(attributes.get("opacity"), path);
  const visible = parseVisibilityAttribute(attributes.get("visibility"), path);
  const blend = parseBlendAttributes(attributes, warnings, { layerIndex, path });
  const parent = ancestors.at(-1);
  const groupIds = ancestors.map((group) => group.id);
  const groupPath = ancestors.map((group) => group.name);
  return {
    name,
    path,
    x,
    y,
    opacity,
    visible,
    ...blend,
    ...(parent ? { parentGroupId: parent.id } : {}),
    groupIds,
    groupPath,
    depth: ancestors.length,
    siblingIndex,
    effectiveOpacity: opacity * (parent?.effectiveOpacity ?? 1),
    effectiveVisible: visible && (parent?.effectiveVisible ?? true),
  };
}

function parseStackXml(bytes: Uint8Array, limits: StudioOpenRasterLimits): ParsedStackXml {
  if (bytes.byteLength === 0 || bytes.byteLength > limits.maxStackXmlBytes) {
    throw oraError("SIZE_LIMIT", "sizeStackXmlBytesOutOfRange", undefined, "stack.xml");
  }
  let xml: string;
  try {
    xml = decoder.decode(bytes);
  } catch {
    throw oraError("STACK_XML_INVALID", "stackNotUtf8", undefined, "stack.xml");
  }
  if (/<!\s*(?:DOCTYPE|ENTITY)/iu.test(xml)) {
    throw oraError("STACK_XML_INVALID", "stackDtdForbidden", undefined, "stack.xml");
  }

  const elementStack: XmlElementFrame[] = [];
  const warnings: StudioOpenRasterWarning[] = [];
  const warningKeys = new Set<string>();
  const warnedElements = new Set<string>();
  const frontToBackLayers: ParsedStackLayer[] = [];
  const groups: ParsedStackGroup[] = [];
  const referencedPaths = new Set<string>();
  let width: number | undefined;
  let height: number | undefined;
  let name: string | undefined;
  let version: string | undefined;
  let resolution: Readonly<{ xPpi: number; yPpi: number }> | undefined;
  let rootStackSeen = false;
  let imageSeen = false;
  let xmlDeclarationSeen = false;
  let elementCount = 0;
  let cursor = 0;

  function warnElementOnce(elementName: string): void {
    if (warnedElements.has(elementName)) return;
    warnedElements.add(elementName);
    warnings.push({
      code: "UNSUPPORTED_XML_ELEMENT",
      variant: "unsupportedElement",
      params: { element: elementName },
      path: "stack.xml",
    });
  }

  while (cursor < xml.length) {
    const open = xml.indexOf("<", cursor);
    if (open < 0) {
      const trailingText = xml.slice(cursor);
      if (trailingText.trim().length !== 0 && elementStack.at(-1)?.kind !== "ignored") {
        throw oraError("STACK_XML_INVALID", "stackTextOutsideRoot", undefined, "stack.xml");
      }
      break;
    }
    const textBeforeTag = xml.slice(cursor, open);
    if (textBeforeTag.trim().length !== 0 && elementStack.at(-1)?.kind !== "ignored") {
      throw oraError("STACK_XML_INVALID", "stackUnexpectedText", undefined, "stack.xml");
    }
    if (xml.startsWith("<!--", open)) {
      const end = xml.indexOf("-->", open + 4);
      if (end < 0 || xml.slice(open + 4, end).includes("--")) {
        throw oraError("STACK_XML_INVALID", "stackCommentUnclosed", undefined, "stack.xml");
      }
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith("<?", open)) {
      const end = xml.indexOf("?>", open + 2);
      if (end < 0) {
        throw oraError("STACK_XML_INVALID", "stackProcessingInstructionUnclosed", undefined, "stack.xml");
      }
      const declaration = xml.slice(open + 2, end).trim();
      if (
        xmlDeclarationSeen
        || imageSeen
        || xml.slice(0, open).trim().length !== 0
        || !/^xml\s+version\s*=\s*(['"])1\.[01]\1(?:\s+encoding\s*=\s*(['"])UTF-8\2)?(?:\s+standalone\s*=\s*(['"])(?:yes|no)\3)?\s*$/iu.test(declaration)
      ) {
        throw oraError("STACK_XML_INVALID", "stackDeclarationInvalid", undefined, "stack.xml");
      }
      xmlDeclarationSeen = true;
      cursor = end + 2;
      continue;
    }
    if (xml.startsWith("<!", open)) {
      throw oraError("STACK_XML_INVALID", "stackDeclarationElementForbidden", undefined, "stack.xml");
    }
    const end = findTagEnd(xml, open + 1);
    if (end < 0) {
      throw oraError("STACK_XML_INVALID", "stackTagUnclosed", undefined, "stack.xml");
    }
    const tag = parseXmlTag(
      xml.slice(open + 1, end),
      limits.maxXmlAttributesPerElement,
    );
    cursor = end + 1;

    if (tag.closing) {
      const frame = elementStack.pop();
      if (frame?.name !== tag.name) {
        throw oraError("STACK_XML_INVALID", "stackNestingInvalid", undefined, "stack.xml");
      }
      continue;
    }
    elementCount += 1;
    if (elementCount > limits.maxXmlElements) {
      throw oraError("STACK_XML_INVALID", "stackElementCountLimit", undefined, "stack.xml");
    }
    if (elementStack.length >= limits.maxXmlDepth) {
      throw oraError("STACK_XML_INVALID", "stackDepthLimit", undefined, "stack.xml");
    }

    const parent = elementStack.at(-1);
    let frame: XmlElementFrame;
    if (parent?.kind === "ignored") {
      frame = { name: tag.name, kind: "ignored", nextVisualChildIndex: 0 };
    } else if (tag.name === "image") {
      if (imageSeen || parent) {
        throw oraError("STACK_XML_INVALID", "stackImageRootNotUnique", undefined, "stack.xml");
      }
      imageSeen = true;
      width = parseIntegerAttribute(tag.attributes.get("w"), "w", 1, limits.maxDimension);
      height = parseIntegerAttribute(tag.attributes.get("h"), "h", 1, limits.maxDimension);
      validateDimension(width, height, limits);
      name = tag.attributes.get("name");
      if (
        name !== undefined
        && (name.length > limits.maxLayerNameCharacters || hasUnsafeXmlControl(name) || hasUnpairedSurrogate(name))
      ) {
        throw oraError("STACK_XML_INVALID", "documentNameOutOfRange", undefined, "stack.xml");
      }
      version = tag.attributes.get("version");
      if (version !== undefined && !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(version)) {
        throw oraError("STACK_XML_INVALID", "versionNotSemver", undefined, "stack.xml");
      }
      const xResolution = tag.attributes.get("xres");
      const yResolution = tag.attributes.get("yres");
      if ((xResolution === undefined) !== (yResolution === undefined)) {
        throw oraError("STACK_XML_INVALID", "resolutionPairRequired", undefined, "stack.xml");
      }
      if (xResolution !== undefined && yResolution !== undefined) {
        resolution = Object.freeze({
          xPpi: parseIntegerAttribute(xResolution, "xres", 1, 1_000_000),
          yPpi: parseIntegerAttribute(yResolution, "yres", 1, 1_000_000),
        });
      }
      warnUnsupportedAttributes("image", tag.attributes, ORA_IMAGE_ATTRIBUTES, warnings, warningKeys);
      frame = { name: tag.name, kind: "image", nextVisualChildIndex: 0 };
    } else if (!parent) {
      throw oraError("STACK_XML_INVALID", "stackTopLevelElementForbidden", undefined, "stack.xml");
    } else if (tag.name === "stack") {
      if (parent.kind === "image") {
        if (rootStackSeen) {
          throw oraError("STACK_XML_INVALID", "rootStackNotUnique", undefined, "stack.xml");
        }
        rootStackSeen = true;
        warnUnsupportedAttributes("root stack", tag.attributes, new Set(), warnings, warningKeys);
        frame = { name: tag.name, kind: "root-stack", nextVisualChildIndex: 0 };
      } else if (parent.kind === "root-stack" || parent.kind === "group") {
        if (groups.length >= limits.maxGroups) {
          throw oraError("STACK_XML_INVALID", "groupCountLimit", undefined, "stack.xml");
        }
        const ancestors = elementStack
          .filter((candidate): candidate is XmlElementFrame & { group: ParsedStackGroup } => candidate.kind === "group" && candidate.group !== undefined)
          .map((candidate) => candidate.group);
        const parentGroup = ancestors.at(-1);
        const id = `group-${groups.length.toString().padStart(4, "0")}`;
        const groupNameSource = tag.attributes.get("name");
        if (
          groupNameSource !== undefined
          && (groupNameSource.length > limits.maxLayerNameCharacters || hasUnsafeXmlControl(groupNameSource) || hasUnpairedSurrogate(groupNameSource))
        ) {
          throw oraError("STACK_XML_INVALID", "groupNameOutOfRange", undefined, id);
        }
        const opacity = parseOpacityAttribute(tag.attributes.get("opacity"), id);
        const visible = parseVisibilityAttribute(tag.attributes.get("visibility"), id);
        const blend = parseBlendAttributes(tag.attributes, warnings, { path: id });
        const isolationSource = tag.attributes.get("isolation") ?? "isolate";
        if (isolationSource !== "isolate" && isolationSource !== "auto") {
          throw oraError("STACK_XML_INVALID", "groupIsolationInvalid", undefined, id);
        }
        const groupIds = [...ancestors.map((group) => group.id), id];
        const groupPath = [
          ...ancestors.map((group) => group.name),
          groupNameSource && groupNameSource.length > 0 ? groupNameSource : `Group ${groups.length + 1}`,
        ];
        const group: ParsedStackGroup = {
          id,
          ...(parentGroup ? { parentId: parentGroup.id } : {}),
          name: groupPath.at(-1)!,
          depth: ancestors.length + 1,
          siblingIndex: parent.nextVisualChildIndex,
          opacity,
          visible,
          ...blend,
          isolation: isolationSource,
          effectiveOpacity: opacity * (parentGroup?.effectiveOpacity ?? 1),
          effectiveVisible: visible && (parentGroup?.effectiveVisible ?? true),
          groupIds,
          groupPath,
        };
        parent.nextVisualChildIndex += 1;
        warnUnsupportedAttributes("stack", tag.attributes, ORA_GROUP_ATTRIBUTES, warnings, warningKeys, id);
        groups.push(group);
        frame = { name: tag.name, kind: "group", group, nextVisualChildIndex: 0 };
      } else {
        throw oraError("STACK_XML_INVALID", "groupStackOutsideLayerStack", undefined, "stack.xml");
      }
    } else if (tag.name === "layer") {
      if (parent.kind !== "root-stack" && parent.kind !== "group") {
        throw oraError("STACK_XML_INVALID", "layerOutsideStack", undefined, "stack.xml");
      }
      if (frontToBackLayers.length >= limits.maxLayers) {
        throw oraError("LAYER_COUNT_LIMIT", "layerCountLimit", undefined, "stack.xml");
      }
      const ancestors = elementStack
        .filter((candidate): candidate is XmlElementFrame & { group: ParsedStackGroup } => candidate.kind === "group" && candidate.group !== undefined)
        .map((candidate) => candidate.group);
      frontToBackLayers.push(parseLayerTag(
        tag.attributes,
        limits,
        warnings,
        warningKeys,
        frontToBackLayers.length,
        parent.nextVisualChildIndex,
        ancestors,
        referencedPaths,
      ));
      parent.nextVisualChildIndex += 1;
      frame = { name: tag.name, kind: "layer", nextVisualChildIndex: 0 };
    } else if (tag.name === "mask") {
      if (!warningKeys.has("mask")) {
        warningKeys.add("mask");
        warnings.push({
          code: "MASKS_IGNORED",
          variant: "masksIgnored",
          path: "stack.xml",
        });
      }
      frame = { name: tag.name, kind: "ignored", nextVisualChildIndex: 0 };
    } else {
      warnElementOnce(tag.name);
      frame = { name: tag.name, kind: "ignored", nextVisualChildIndex: 0 };
    }

    if (!tag.selfClosing) elementStack.push(frame);
  }
  if (
    elementStack.length !== 0
    || !imageSeen
    || !rootStackSeen
    || width === undefined
    || height === undefined
  ) {
    throw oraError("STACK_XML_INVALID", "stackStructureIncomplete", undefined, "stack.xml");
  }
  if (frontToBackLayers.length === 0) {
    throw oraError("LAYER_COUNT_LIMIT", "noLayersToImport", undefined, "stack.xml");
  }
  return {
    width,
    height,
    ...(name === undefined ? {} : { name }),
    ...(version === undefined ? {} : { version }),
    ...(resolution === undefined ? {} : { resolution }),
    frontToBackLayers,
    groups,
    warnings,
  };
}

function bytesToBlob(bytes: Uint8Array, type: string): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type });
}

async function readOpenRasterArchiveEntry(
  archive: StudioZipArchive,
  entry: StudioZipEntry,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  try {
    return await archive.readEntry(entry, { signal });
  } catch (cause) {
    if (cause instanceof StudioOpenRasterError) throw cause;
    if (cause instanceof StudioZipReaderError) {
      throw oraError(
        cause.code === "ABORTED" ? "ABORTED" : "ARCHIVE_INVALID",
        "archiveEntryVerifyFailed",
        { path: entry.path, detail: cause.message },
        cause.path ?? entry.path,
      );
    }
    const detail = cause instanceof Error ? `: ${cause.message}` : "";
    throw oraError(
      "ARCHIVE_INVALID",
      "archiveEntryReadFailed",
      { path: entry.path, detail },
      entry.path,
    );
  }
}

export async function importStudioOpenRaster(
  source: Blob | Uint8Array | ArrayBuffer,
  options: StudioOpenRasterImportOptions = {}
): Promise<StudioOpenRasterImportResult> {
  const limits = resolveLimits(options.limits);
  throwIfAborted(options.signal);
  const zipLimits: Partial<StudioZipReaderLimits> = {
    maxArchiveBytes: limits.maxArchiveBytes,
    maxEntries: limits.maxLayers + 16,
    maxEntryCompressedBytes: Math.max(
      limits.maxLayerBytes,
      limits.maxMergedImageBytes,
      limits.maxThumbnailBytes,
      limits.maxStackXmlBytes
    ),
    maxEntryUncompressedBytes: Math.max(
      limits.maxLayerBytes,
      limits.maxMergedImageBytes,
      limits.maxThumbnailBytes,
      limits.maxStackXmlBytes
    ),
    maxTotalUncompressedBytes: Math.min(
      512_000_000,
      limits.maxTotalImageBytes + limits.maxStackXmlBytes + 64
    ),
  };
  let archive;
  try {
    archive = await readStudioZipArchive(source, {
      limits: zipLimits,
      inflateRaw: options.inflateRaw,
      signal: options.signal,
    });
  } catch (cause) {
    if (cause instanceof StudioOpenRasterError) throw cause;
    const detail = cause instanceof Error ? `: ${cause.message}` : "";
    throw oraError(
      "ARCHIVE_INVALID",
      "archiveInvalid",
      { detail },
      cause instanceof StudioZipReaderError ? cause.path : undefined,
    );
  }

  const firstEntry = archive.entries[0];
  if (!firstEntry || firstEntry.path !== "mimetype" || firstEntry.compressionMethod !== 0) {
    throw oraError("MIMETYPE_INVALID", "mimetypeNotFirstStored");
  }
  if (firstEntry.uncompressedBytes !== encoder.encode(STUDIO_OPENRASTER_MIME).byteLength) {
    throw oraError("MIMETYPE_INVALID", "mimetypeLengthInvalid", undefined, "mimetype");
  }
  const mimetype = await readOpenRasterArchiveEntry(archive, firstEntry, options.signal);
  let mimetypeValue: string;
  try {
    mimetypeValue = decoder.decode(mimetype);
  } catch {
    throw oraError("MIMETYPE_INVALID", "mimetypeNotUtf8");
  }
  if (mimetypeValue !== STUDIO_OPENRASTER_MIME) {
    throw oraError("MIMETYPE_INVALID", "mimetypeValueInvalid");
  }
  const stackEntry = archive.getEntry("stack.xml");
  const mergedEntry = archive.getEntry("mergedimage.png");
  const thumbnailEntry = archive.getEntry("Thumbnails/thumbnail.png");
  if (!stackEntry || stackEntry.directory) {
    throw oraError("REQUIRED_ENTRY_MISSING", "requiredStackXmlMissing", undefined, "stack.xml");
  }
  if (!mergedEntry || mergedEntry.directory) {
    throw oraError("REQUIRED_ENTRY_MISSING", "requiredMergedImageMissing", undefined, "mergedimage.png");
  }
  if (!thumbnailEntry || thumbnailEntry.directory) {
    throw oraError("REQUIRED_ENTRY_MISSING", "requiredThumbnailMissing", undefined, "Thumbnails/thumbnail.png");
  }
  if (stackEntry.uncompressedBytes > limits.maxStackXmlBytes) {
    throw oraError("SIZE_LIMIT", "sizeStackXmlByteLimit", undefined, "stack.xml");
  }
  if (mergedEntry.uncompressedBytes > limits.maxMergedImageBytes) {
    throw oraError("SIZE_LIMIT", "sizeMergedImageByteLimit", undefined, "mergedimage.png",);
  }
  if (thumbnailEntry.uncompressedBytes > limits.maxThumbnailBytes) {
    throw oraError("SIZE_LIMIT", "sizeThumbnailByteLimit", undefined, "Thumbnails/thumbnail.png",);
  }

  const stackXml = await readOpenRasterArchiveEntry(archive, stackEntry, options.signal);
  const parsed = parseStackXml(stackXml, limits);
  const mergedBytes = await readOpenRasterArchiveEntry(archive, mergedEntry, options.signal);
  const thumbnailBytes = await readOpenRasterArchiveEntry(archive, thumbnailEntry, options.signal);
  if (mergedBytes.byteLength > limits.maxMergedImageBytes) {
    throw oraError("SIZE_LIMIT", "sizeMergedImageByteLimit", undefined, "mergedimage.png");
  }
  if (thumbnailBytes.byteLength > limits.maxThumbnailBytes) {
    throw oraError("SIZE_LIMIT", "sizeThumbnailByteLimit", undefined, "Thumbnails/thumbnail.png");
  }
  const mergedDimensions = inspectPngIhdr(mergedBytes, "mergedimage.png", limits);
  const thumbnailDimensions = inspectPngIhdr(
    thumbnailBytes,
    "Thumbnails/thumbnail.png",
    limits
  );
  appendPreviewMetadataWarnings(
    parsed.width,
    parsed.height,
    mergedDimensions,
    thumbnailDimensions,
    parsed.warnings,
  );
  let totalImageBytes = 0;
  let totalDecodedRgbaBytes = 0;
  for (const [path, bytes, decodedRgbaBytes] of [
    ["mergedimage.png", mergedBytes, mergedDimensions.decodedRgbaBytes],
    ["Thumbnails/thumbnail.png", thumbnailBytes, thumbnailDimensions.decodedRgbaBytes],
  ] as const) {
    totalImageBytes = addImageBudget(
      totalImageBytes,
      bytes.byteLength,
      limits.maxTotalImageBytes,
      "uncompressedBytes",
      path
    );
    totalDecodedRgbaBytes = addImageBudget(
      totalDecodedRgbaBytes,
      decodedRgbaBytes,
      limits.maxTotalDecodedRgbaBytes,
      "decodedRgba",
      path
    );
  }
  const frontToBackLayers: Array<Omit<StudioOpenRasterImportedLayer, "z">> = [];
  for (const layer of parsed.frontToBackLayers) {
    throwIfAborted(options.signal);
    const entry = archive.getEntry(layer.path);
    if (!entry || entry.directory) {
      throw oraError("REQUIRED_ENTRY_MISSING", "requiredLayerPngMissing", undefined, layer.path);
    }
    if (entry.uncompressedBytes > limits.maxLayerBytes) {
      throw oraError("SIZE_LIMIT", "sizeLayerPngLimit", undefined, layer.path);
    }
    const png = await readOpenRasterArchiveEntry(archive, entry, options.signal);
    const dimensions = inspectPngIhdr(png, layer.path, limits);
    totalImageBytes = addImageBudget(
      totalImageBytes,
      png.byteLength,
      limits.maxTotalImageBytes,
      "uncompressedBytes",
      layer.path
    );
    totalDecodedRgbaBytes = addImageBudget(
      totalDecodedRgbaBytes,
      dimensions.decodedRgbaBytes,
      limits.maxTotalDecodedRgbaBytes,
      "decodedRgba",
      layer.path
    );
    frontToBackLayers.push({
      ...layer,
      groupIds: Object.freeze([...layer.groupIds]),
      groupPath: Object.freeze([...layer.groupPath]),
      png: bytesToBlob(png, "image/png"),
      width: dimensions.width,
      height: dimensions.height,
      byteLength: png.byteLength,
      decodedRgbaBytes: dimensions.decodedRgbaBytes,
    });
  }

  const layers = frontToBackLayers
    .reverse()
    .map((layer, z) => Object.freeze({ ...layer, z }));
  const groups = parsed.groups.map((group) => Object.freeze({
    id: group.id,
    ...(group.parentId === undefined ? {} : { parentId: group.parentId }),
    name: group.name,
    depth: group.depth,
    siblingIndex: group.siblingIndex,
    opacity: group.opacity,
    visible: group.visible,
    blendMode: group.blendMode,
    sourceCompositeOp: group.sourceCompositeOp,
    isolation: group.isolation,
    effectiveOpacity: group.effectiveOpacity,
    effectiveVisible: group.effectiveVisible,
  }));
  const mergedImageInfo = imageInfo("mergedimage.png", mergedBytes, mergedDimensions);
  const thumbnailInfo = imageInfo(
    "Thumbnails/thumbnail.png",
    thumbnailBytes,
    thumbnailDimensions,
  );
  const summary: StudioOpenRasterImportSummary = Object.freeze({
    layerCount: layers.length,
    groupCount: groups.length,
    hiddenLayerCount: layers.filter((layer) => !layer.effectiveVisible).length,
    hiddenGroupCount: groups.filter((group) => !group.effectiveVisible).length,
    unsupportedFeatureCount: parsed.warnings.filter((warning) =>
      warning.code === "MASKS_IGNORED"
      || warning.code === "UNSUPPORTED_BLEND_MODE"
      || warning.code === "UNSUPPORTED_XML_ATTRIBUTE"
      || warning.code === "UNSUPPORTED_XML_ELEMENT"
    ).length,
    totalImageBytes,
    totalDecodedRgbaBytes,
  });
  return Object.freeze({
    width: parsed.width,
    height: parsed.height,
    ...(parsed.name === undefined ? {} : { name: parsed.name }),
    ...(parsed.version === undefined ? {} : { version: parsed.version }),
    ...(parsed.resolution === undefined ? {} : { resolution: parsed.resolution }),
    layers: Object.freeze(layers),
    groups: Object.freeze(groups),
    mergedImage: bytesToBlob(mergedBytes, "image/png"),
    thumbnail: bytesToBlob(thumbnailBytes, "image/png"),
    mergedImageInfo,
    thumbnailInfo,
    summary,
    warnings: freezeWarnings(parsed.warnings),
  });
}
