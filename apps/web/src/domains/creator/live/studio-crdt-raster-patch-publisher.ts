import {
  STUDIO_RASTER_CRDT_VERSION,
  STUDIO_RASTER_KERNEL,
  STUDIO_RASTER_MAX_ASSET_BYTES,
  STUDIO_RASTER_MAX_OPERATION_REFERENCED_BYTES,
  STUDIO_RASTER_MAX_PATCHES_PER_OPERATION,
  assertStudioRasterAssetReference,
  assertStudioRasterSurfaceSpec,
  canonicalStudioRasterJson,
  createStudioRasterOperationLog,
  type StudioRasterAssetReference,
  type StudioRasterOperation,
  type StudioRasterOperationLog,
  type StudioRasterSurfaceSpec,
  type StudioRasterTilePatch,
} from "@/shared/lib/studio-crdt-raster-ops";

export const STUDIO_RASTER_PATCH_PUBLISH_MAX_CONCURRENCY = 16;
export const STUDIO_RASTER_PATCH_PUBLISH_DEFAULT_CONCURRENCY = 4;
export const STUDIO_RASTER_PATCH_PUBLISH_MAX_INPUT_BYTES = 256 * 1_024 * 1_024;

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const DECIMAL_CLOCK_PATTERN = /^(?:0|[1-9][0-9]{0,19})$/u;
const MAX_UINT64_DECIMAL = "18446744073709551615";
const MAX_ID_LENGTH = 160;
const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

export type StudioRasterPatchPublishIntent = "paint" | "erase" | "fill" | "clear";

export interface StudioRasterPixelRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type StudioRasterRgbaPixels = ImageData | Uint8Array | Uint8ClampedArray;

export interface StudioRasterPatchPublishInput {
  readonly surface: StudioRasterSurfaceSpec;
  readonly operationId: string;
  readonly actorId: string;
  readonly logicalClock: string;
  readonly pageId: string;
  readonly layerId: string;
  readonly intent: StudioRasterPatchPublishIntent;
  readonly semanticParametersSha256: string;
  /** Integer document-space pixels. The RGBA source has exactly this width and height. */
  readonly rect: StudioRasterPixelRect;
  /** Straight/unpremultiplied RGBA, four bytes per pixel in row-major order. */
  readonly pixels: StudioRasterRgbaPixels;
}

export interface StudioRasterPatchEncoderInput {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly signal: AbortSignal;
}

export interface StudioRasterEncodedPatch {
  readonly bytes: Uint8Array;
  readonly mediaType: "image/png";
}

export type StudioRasterPatchEncoder = (
  input: StudioRasterPatchEncoderInput
) => Promise<StudioRasterEncodedPatch>;

export interface StudioRasterPatchUploadInput {
  readonly reference: StudioRasterAssetReference;
  readonly bytes: Uint8Array;
  readonly signal: AbortSignal;
}

export type StudioRasterPatchUploader = (
  input: StudioRasterPatchUploadInput
) => Promise<StudioRasterAssetReference>;

export interface StudioRasterPatchCompensationInput {
  readonly reference: StudioRasterAssetReference;
  readonly signal: AbortSignal;
}

export type StudioRasterPatchCompensator = (
  input: StudioRasterPatchCompensationInput
) => Promise<boolean>;

export type StudioRasterOperationAppender = (
  log: StudioRasterOperationLog,
  signal: AbortSignal
) => void | Promise<void>;

export interface StudioRasterLayerWriteGuardInput {
  readonly operationId: string;
  readonly actorId: string;
  readonly pageId: string;
  readonly layerId: string;
  readonly intent: StudioRasterPatchPublishIntent;
}

/**
 * Returns the authoritative current layer-write decision. It is evaluated before expensive pixel
 * work and again after uploads immediately before the grow-only operation is appended, closing a
 * lock race without retroactively hiding strokes that were validly committed while unlocked.
 */
export type StudioRasterLayerWriteGuard = (
  input: Readonly<StudioRasterLayerWriteGuardInput>,
  signal: AbortSignal
) => boolean | Promise<boolean>;

export interface StudioRasterPatchPublisherDependencies {
  readonly encode: StudioRasterPatchEncoder;
  readonly upload: StudioRasterPatchUploader;
  readonly append: StudioRasterOperationAppender;
  /** Receipt-bound best-effort cleanup used only when publication fails after a verified upload. */
  readonly compensate?: StudioRasterPatchCompensator;
  readonly canWriteLayer?: StudioRasterLayerWriteGuard;
  /** Injectable for isolated runtimes. It must return a lowercase SHA-256 digest. */
  readonly sha256?: (bytes: Uint8Array, signal: AbortSignal) => Promise<string>;
}

export interface StudioRasterPatchPublisherOptions {
  readonly signal?: AbortSignal;
  readonly concurrency?: number;
  readonly maxPatchCount?: number;
  /** Counts each unique content-addressed PNG once, matching the CRDT reference budget. */
  readonly maxTotalBytes?: number;
}

export interface StudioRasterPatchPublishSkippedResult {
  readonly status: "skipped-transparent";
  readonly operation: null;
  readonly log: null;
  readonly assets: readonly [];
}

export interface StudioRasterPatchPublishAppendedResult {
  readonly status: "appended";
  readonly operation: StudioRasterOperation;
  readonly log: StudioRasterOperationLog;
  readonly assets: readonly StudioRasterAssetReference[];
}

export type StudioRasterPatchPublishResult =
  | StudioRasterPatchPublishSkippedResult
  | StudioRasterPatchPublishAppendedResult;

/** A4 D4 (R12): 생산자는 구조화 코드+params만 방출한다(message = 코드). 해석은 표시 지점에서만 한다. */
export type StudioRasterPatchPublicationErrorCode =
  | "layer-write-guard-failed" | "invalid-layer-write-guard-result" | "layer-locked" | "invalid-id" | "invalid-operation-id" | "invalid-logical-clock" | "unsupported-intent" | "invalid-semantic-hash"
  | "invalid-rect" | "invalid-rect-value" | "patch-out-of-bounds" | "input-byte-budget" | "image-data-dimension-mismatch" | "invalid-rgba" | "rgba-length-mismatch" | "patch-count-budget"
  | "sha256-unavailable" | "invalid-sha256-result" | "invalid-png-signature" | "invalid-png-ihdr" | "encoded-dimension-mismatch" | "invalid-option" | "upload-receipt-mismatch" | "invalid-dependencies"
  | "invalid-dependency-functions" | "raw-sha256-collision" | "invalid-encoder-result" | "asset-byte-budget" | "encoded-sha256-collision" | "total-byte-budget" | "internal-asset-mapping" | "png-export-unavailable"
  | "canvas-context-unavailable" | "invalid-canvas-image-data" | "png-media-type-mismatch" | "canvas-unavailable" | "aborted" | "cleanup-timeout" | "upload-incomplete";

export class StudioRasterPatchPublicationError extends Error {
  constructor(
    readonly code: StudioRasterPatchPublicationErrorCode,
    readonly params?: Readonly<Record<string, string>>,
    cause?: unknown
  ) { super(code, cause === undefined ? undefined : { cause }); this.name = "StudioRasterPatchPublicationError"; }
}

interface TileCrop {
  readonly tileX: number;
  readonly tileY: number;
  readonly region: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly rgba: Uint8ClampedArray;
}

interface RawPayload {
  readonly identity: string;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
}

interface EncodedPayload {
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: Uint8Array;
  readonly reference: StudioRasterAssetReference;
}

function fail(code: StudioRasterPatchPublicationErrorCode, params?: Readonly<Record<string, string>>, cause?: unknown): never {
  throw new StudioRasterPatchPublicationError(code, params, cause);
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new StudioRasterPatchPublicationError("aborted");
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError(signal);
}

async function assertLayerWritable(
  input: StudioRasterPatchPublishInput,
  guard: StudioRasterLayerWriteGuard | undefined,
  signal: AbortSignal
): Promise<void> {
  if (!guard) return;
  throwIfAborted(signal);
  let writable: boolean;
  try {
    writable = await guard(Object.freeze({
      operationId: input.operationId,
      actorId: input.actorId,
      pageId: input.pageId,
      layerId: input.layerId,
      intent: input.intent,
    }), signal);
  } catch (error) {
    if (signal.aborted) throw abortError(signal);
    if (error instanceof StudioRasterPatchPublicationError) throw error;
    fail("layer-write-guard-failed", undefined, error);
  }
  throwIfAborted(signal);
  if (typeof writable !== "boolean") {
    fail("invalid-layer-write-guard-result");
  }
  if (!writable) {
    fail("layer-locked");
  }
}

function exactKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function assertSafeId(value: string, label: string): void {
  if (value.length < 1 || value.length > MAX_ID_LENGTH || !SAFE_ID_PATTERN.test(value)) {
    fail("invalid-id", { label });
  }
}

function assertMetadata(input: StudioRasterPatchPublishInput): void {
  assertStudioRasterSurfaceSpec(input.surface, "input.surface");
  if (!UUID_PATTERN.test(input.operationId)) {
    fail("invalid-operation-id");
  }
  assertSafeId(input.actorId, "actor");
  assertSafeId(input.pageId, "page");
  assertSafeId(input.layerId, "layer");
  if (
    !DECIMAL_CLOCK_PATTERN.test(input.logicalClock) ||
    input.logicalClock.length > MAX_UINT64_DECIMAL.length ||
    (input.logicalClock.length === MAX_UINT64_DECIMAL.length && input.logicalClock > MAX_UINT64_DECIMAL)
  ) {
    fail("invalid-logical-clock");
  }
  if (!["paint", "erase", "fill", "clear"].includes(input.intent)) {
    fail("unsupported-intent");
  }
  if (!SHA256_PATTERN.test(input.semanticParametersSha256)) {
    fail("invalid-semantic-hash");
  }
}

function assertRect(rect: StudioRasterPixelRect, surface: StudioRasterSurfaceSpec): void {
  if (!exactKeys(rect, ["x", "y", "width", "height"])) {
    fail("invalid-rect");
  }
  for (const [key, value] of Object.entries(rect)) {
    if (!Number.isSafeInteger(value)) fail("invalid-rect-value", { key });
  }
  if (
    rect.x < 0 || rect.y < 0 || rect.width < 1 || rect.height < 1 ||
    rect.x > surface.width - rect.width || rect.y > surface.height - rect.height
  ) {
    fail("patch-out-of-bounds");
  }
  const byteLength = rect.width * rect.height * 4;
  if (!Number.isSafeInteger(byteLength) || byteLength > STUDIO_RASTER_PATCH_PUBLISH_MAX_INPUT_BYTES) {
    fail("input-byte-budget");
  }
}

function isImageDataLike(
  value: StudioRasterRgbaPixels
): value is ImageData {
  if (value instanceof Uint8Array || value instanceof Uint8ClampedArray) return false;
  return (
    typeof value === "object" && value !== null &&
    Number.isSafeInteger(value.width) && Number.isSafeInteger(value.height) &&
    value.data instanceof Uint8ClampedArray
  );
}

function copyInputPixels(input: StudioRasterPatchPublishInput): Uint8ClampedArray {
  const expectedLength = input.rect.width * input.rect.height * 4;
  const source = input.pixels;
  if (isImageDataLike(source) && (
    source.width !== input.rect.width || source.height !== input.rect.height
  )) {
    fail("image-data-dimension-mismatch");
  }
  const bytes = isImageDataLike(source) ? source.data : source;
  if (!(bytes instanceof Uint8Array) && !(bytes instanceof Uint8ClampedArray)) {
    fail("invalid-rgba");
  }
  if (bytes.byteLength !== expectedLength) {
    fail("rgba-length-mismatch");
  }
  return Uint8ClampedArray.from(bytes);
}

function cropHasVisibleAlpha(
  source: Uint8ClampedArray,
  sourceWidth: number,
  sourceX: number,
  sourceY: number,
  width: number,
  height: number
): boolean {
  for (let row = 0; row < height; row += 1) {
    let alpha = ((sourceY + row) * sourceWidth + sourceX) * 4 + 3;
    const end = alpha + width * 4;
    for (; alpha < end; alpha += 4) {
      if (source[alpha] !== 0) return true;
    }
  }
  return false;
}

function copyCrop(
  source: Uint8ClampedArray,
  sourceWidth: number,
  sourceX: number,
  sourceY: number,
  width: number,
  height: number
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(width * height * 4);
  const rowBytes = width * 4;
  for (let row = 0; row < height; row += 1) {
    const sourceStart = ((sourceY + row) * sourceWidth + sourceX) * 4;
    result.set(source.subarray(sourceStart, sourceStart + rowBytes), row * rowBytes);
  }
  return result;
}

function splitAtTileBoundaries(
  input: StudioRasterPatchPublishInput,
  rgba: Uint8ClampedArray,
  maximumPatches: number
): TileCrop[] {
  const { rect, surface } = input;
  const firstTileX = Math.floor(rect.x / surface.tileSize);
  const lastTileX = Math.floor((rect.x + rect.width - 1) / surface.tileSize);
  const firstTileY = Math.floor(rect.y / surface.tileSize);
  const lastTileY = Math.floor((rect.y + rect.height - 1) / surface.tileSize);
  const crops: TileCrop[] = [];

  for (let tileY = firstTileY; tileY <= lastTileY; tileY += 1) {
    const tileTop = tileY * surface.tileSize;
    const intersectionTop = Math.max(rect.y, tileTop);
    const intersectionBottom = Math.min(rect.y + rect.height, tileTop + surface.tileSize);
    for (let tileX = firstTileX; tileX <= lastTileX; tileX += 1) {
      const tileLeft = tileX * surface.tileSize;
      const intersectionLeft = Math.max(rect.x, tileLeft);
      const intersectionRight = Math.min(rect.x + rect.width, tileLeft + surface.tileSize);
      const width = intersectionRight - intersectionLeft;
      const height = intersectionBottom - intersectionTop;
      const sourceX = intersectionLeft - rect.x;
      const sourceY = intersectionTop - rect.y;
      if (!cropHasVisibleAlpha(rgba, rect.width, sourceX, sourceY, width, height)) continue;
      if (crops.length >= maximumPatches) {
        fail("patch-count-budget");
      }
      crops.push({
        tileX,
        tileY,
        region: {
          x: intersectionLeft - tileLeft,
          y: intersectionTop - tileTop,
          width,
          height,
        },
        rgba: copyCrop(rgba, rect.width, sourceX, sourceY, width, height),
      });
    }
  }
  return crops;
}

function equalBytes(
  left: Uint8Array | Uint8ClampedArray,
  right: Uint8Array | Uint8ClampedArray
): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

async function defaultSha256(bytes: Uint8Array, signal: AbortSignal): Promise<string> {
  throwIfAborted(signal);
  if (!globalThis.crypto?.subtle) fail("sha256-unavailable");
  const owned = Uint8Array.from(bytes);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", owned.buffer));
  throwIfAborted(signal);
  return [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function checkedSha256(
  bytes: Uint8Array,
  signal: AbortSignal,
  digest: NonNullable<StudioRasterPatchPublisherDependencies["sha256"]>
): Promise<string> {
  // Hash providers are injectable for runtimes/tests, so they receive an isolated copy and cannot
  // mutate the bytes that were validated and will later be uploaded.
  const result = await digest(Uint8Array.from(bytes), signal);
  throwIfAborted(signal);
  if (!SHA256_PATTERN.test(result)) {
    fail("invalid-sha256-result");
  }
  return result;
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! * 0x1_00_00_00 +
    bytes[offset + 1]! * 0x1_00_00 +
    bytes[offset + 2]! * 0x1_00 +
    bytes[offset + 3]!
  );
}

function assertPngDimensions(bytes: Uint8Array, width: number, height: number): void {
  if (bytes.byteLength < 24 || !PNG_SIGNATURE.every((value, index) => bytes[index] === value)) {
    fail("invalid-png-signature");
  }
  if (
    readUint32BigEndian(bytes, 8) !== 13 ||
    bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52
  ) {
    fail("invalid-png-ihdr");
  }
  if (readUint32BigEndian(bytes, 16) !== width || readUint32BigEndian(bytes, 20) !== height) {
    fail("encoded-dimension-mismatch");
  }
}

async function mapConcurrent<T, R>(
  values: readonly T[],
  concurrency: number,
  controller: AbortController,
  task: (value: T, index: number, signal: AbortSignal) => Promise<R>
): Promise<R[]> {
  if (values.length === 0) return [];
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  let failed = false;
  let failure: unknown;
  const worker = async () => {
    while (!failed) {
      throwIfAborted(controller.signal);
      const index = nextIndex;
      if (index >= values.length) return;
      nextIndex += 1;
      try {
        results[index] = await task(values[index]!, index, controller.signal);
      } catch (error) {
        if (!failed) {
          failed = true;
          failure = error;
          controller.abort(error);
        }
      }
    }
  };
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    () => worker()
  );
  await Promise.allSettled(workers);
  if (failed) throw failure;
  throwIfAborted(controller.signal);
  return results;
}

function positiveBoundedInteger(value: number | undefined, fallback: number, maximum: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > maximum) {
    fail("invalid-option", { label });
  }
  return resolved;
}

function exactReference(sha256: string, byteLength: number, width: number, height: number): StudioRasterAssetReference {
  return Object.freeze({
    scope: "work" as const,
    assetId: sha256,
    sha256,
    byteLength,
    mediaType: "image/png" as const,
    width,
    height,
  });
}

function assertExactUploadReceipt(
  receipt: StudioRasterAssetReference,
  expected: StudioRasterAssetReference,
  index: number
): void {
  assertStudioRasterAssetReference(receipt, `uploadReceipts[${index}]`);
  if (canonicalStudioRasterJson(receipt) !== canonicalStudioRasterJson(expected)) {
    fail("upload-receipt-mismatch");
  }
}

const STUDIO_RASTER_COMPENSATION_TIMEOUT_MS = 3_000;

async function compensateVerifiedUploadReceipts(
  receipts: readonly StudioRasterAssetReference[],
  compensate: StudioRasterPatchCompensator | undefined,
  concurrency: number
): Promise<void> {
  if (!compensate || receipts.length === 0) return;
  const controller = new AbortController();
  let nextIndex = 0;
  const worker = async () => {
    while (!controller.signal.aborted) {
      const index = nextIndex;
      if (index >= receipts.length) return;
      nextIndex += 1;
      try {
        await compensate({ reference: receipts[index]!, signal: controller.signal });
      } catch {
        // Compensation must never replace the original encode/upload/append failure. The server
        // also refuses ownership or durable-reference races, so retaining a body is the safe path.
      }
    }
  };
  const settled = Promise.all(Array.from(
    { length: Math.min(concurrency, receipts.length) },
    () => worker()
  )).then(() => undefined);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort(new StudioRasterPatchPublicationError("cleanup-timeout"));
      resolve();
    }, STUDIO_RASTER_COMPENSATION_TIMEOUT_MS);
  });
  await Promise.race([settled, timeout]);
  if (timeoutId !== undefined) clearTimeout(timeoutId);
  controller.abort();
}

/**
 * Publishes one semantic pixel edit as immutable, tile-bounded PNG assets and one CRDT operation.
 * The grow-only document is appended exactly once and only after every receipt has been verified.
 * A later failure invokes only receipt-bound best-effort compensation; the server remains the
 * authority on whether an uploaded identity is still unreferenced and owned by this actor.
 */
export async function publishStudioRasterPatch(
  input: StudioRasterPatchPublishInput,
  dependencies: StudioRasterPatchPublisherDependencies,
  options: StudioRasterPatchPublisherOptions = {}
): Promise<StudioRasterPatchPublishResult> {
  assertMetadata(input);
  assertRect(input.rect, input.surface);
  if (!dependencies || typeof dependencies !== "object") {
    fail("invalid-dependencies");
  }
  if (
    typeof dependencies.encode !== "function" ||
    typeof dependencies.upload !== "function" ||
    typeof dependencies.append !== "function" ||
    (dependencies.compensate !== undefined && typeof dependencies.compensate !== "function") ||
    (dependencies.canWriteLayer !== undefined && typeof dependencies.canWriteLayer !== "function") ||
    (dependencies.sha256 !== undefined && typeof dependencies.sha256 !== "function")
  ) {
    fail("invalid-dependency-functions");
  }

  const concurrency = positiveBoundedInteger(
    options.concurrency,
    STUDIO_RASTER_PATCH_PUBLISH_DEFAULT_CONCURRENCY,
    STUDIO_RASTER_PATCH_PUBLISH_MAX_CONCURRENCY,
    "concurrency"
  );
  const maximumPatches = positiveBoundedInteger(
    options.maxPatchCount,
    STUDIO_RASTER_MAX_PATCHES_PER_OPERATION,
    STUDIO_RASTER_MAX_PATCHES_PER_OPERATION,
    "patchCount"
  );
  const maximumBytes = positiveBoundedInteger(
    options.maxTotalBytes,
    STUDIO_RASTER_MAX_OPERATION_REFERENCED_BYTES,
    STUDIO_RASTER_MAX_OPERATION_REFERENCED_BYTES,
    "totalBytes"
  );
  const controller = new AbortController();
  const verifiedUploadReceipts: StudioRasterAssetReference[] = [];
  const externalSignal = options.signal;
  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) onExternalAbort();
  else externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

  try {
    throwIfAborted(controller.signal);
    await assertLayerWritable(input, dependencies.canWriteLayer, controller.signal);
    const pixels = copyInputPixels(input);
    const crops = splitAtTileBoundaries(input, pixels, maximumPatches);
    throwIfAborted(controller.signal);
    if (crops.length === 0) {
      return Object.freeze({
        status: "skipped-transparent" as const,
        operation: null,
        log: null,
        assets: Object.freeze([]) as readonly [],
      });
    }

    const digest = dependencies.sha256 ?? defaultSha256;
    const rawDigests = await mapConcurrent(crops, concurrency, controller, (crop, _index, signal) =>
      checkedSha256(Uint8Array.from(crop.rgba), signal, digest)
    );
    const rawPayloadByIdentity = new Map<string, RawPayload>();
    const rawIdentityByCrop: string[] = [];
    const rawPayloads: RawPayload[] = [];
    for (let index = 0; index < crops.length; index += 1) {
      const crop = crops[index]!;
      const identity = `${crop.region.width}:${crop.region.height}:${rawDigests[index]}`;
      const existing = rawPayloadByIdentity.get(identity);
      if (existing && !equalBytes(existing.rgba, crop.rgba)) {
        fail("raw-sha256-collision");
      }
      if (!existing) {
        const payload: RawPayload = {
          identity,
          width: crop.region.width,
          height: crop.region.height,
          rgba: crop.rgba,
        };
        rawPayloadByIdentity.set(identity, payload);
        rawPayloads.push(payload);
      }
      rawIdentityByCrop.push(identity);
    }

    const encodedResults = await mapConcurrent(
      rawPayloads,
      concurrency,
      controller,
      async (payload, _index, signal) => {
        const encoded = await dependencies.encode({
          width: payload.width,
          height: payload.height,
          rgba: Uint8ClampedArray.from(payload.rgba),
          signal,
        });
        throwIfAborted(signal);
        if (
          !encoded || typeof encoded !== "object" ||
          !exactKeys(encoded, ["bytes", "mediaType"]) ||
          encoded.mediaType !== "image/png" || !(encoded.bytes instanceof Uint8Array)
        ) {
          fail("invalid-encoder-result");
        }
        const bytes = Uint8Array.from(encoded.bytes);
        if (bytes.byteLength < 1 || bytes.byteLength > STUDIO_RASTER_MAX_ASSET_BYTES) {
          fail("asset-byte-budget");
        }
        assertPngDimensions(bytes, payload.width, payload.height);
        const sha256 = await checkedSha256(bytes, signal, digest);
        return { payload, bytes, sha256 };
      }
    );

    const encodedByRawIdentity = new Map<string, EncodedPayload>();
    const encodedBySha256 = new Map<string, EncodedPayload>();
    const uniqueEncodedPayloads: EncodedPayload[] = [];
    let totalBytes = 0;
    for (const result of encodedResults) {
      const existing = encodedBySha256.get(result.sha256);
      if (existing) {
        if (
          existing.width !== result.payload.width || existing.height !== result.payload.height ||
          !equalBytes(existing.bytes, result.bytes)
        ) {
          fail("encoded-sha256-collision");
        }
        encodedByRawIdentity.set(result.payload.identity, existing);
        continue;
      }
      totalBytes += result.bytes.byteLength;
      if (totalBytes > maximumBytes) {
        fail("total-byte-budget");
      }
      const prepared: EncodedPayload = {
        sha256: result.sha256,
        width: result.payload.width,
        height: result.payload.height,
        bytes: result.bytes,
        reference: exactReference(
          result.sha256,
          result.bytes.byteLength,
          result.payload.width,
          result.payload.height
        ),
      };
      assertStudioRasterAssetReference(prepared.reference, "preparedAsset");
      encodedBySha256.set(result.sha256, prepared);
      encodedByRawIdentity.set(result.payload.identity, prepared);
      uniqueEncodedPayloads.push(prepared);
    }

    await mapConcurrent(
      uniqueEncodedPayloads,
      concurrency,
      controller,
      async (payload, index, signal) => {
        throwIfAborted(signal);
        const receipt = await dependencies.upload({
          reference: payload.reference,
          bytes: Uint8Array.from(payload.bytes),
          signal,
        });
        assertExactUploadReceipt(receipt, payload.reference, index);
        // Record the immutable expected receipt even when a sibling upload has just failed and
        // aborted this worker. The server may already have committed these exact bytes.
        verifiedUploadReceipts.push(payload.reference);
        throwIfAborted(signal);
        return payload.reference;
      }
    );

    const blendMode = input.intent === "erase" || input.intent === "clear"
      ? "destination-out"
      : "source-over";
    const patches: StudioRasterTilePatch[] = crops.map((crop, index) => {
      const payload = encodedByRawIdentity.get(rawIdentityByCrop[index]!);
      if (!payload) fail("internal-asset-mapping");
      return {
        tileX: crop.tileX,
        tileY: crop.tileY,
        region: crop.region,
        effect: { kind: "composite", blendMode, payload: payload.reference },
      };
    });
    const log = createStudioRasterOperationLog({
      version: STUDIO_RASTER_CRDT_VERSION,
      surface: input.surface,
      operations: [{
        version: STUDIO_RASTER_CRDT_VERSION,
        operationId: input.operationId,
        order: { logicalClock: input.logicalClock, actorId: input.actorId },
        pageId: input.pageId,
        layerId: input.layerId,
        intent: input.intent,
        kernel: STUDIO_RASTER_KERNEL,
        semanticParametersSha256: input.semanticParametersSha256,
        patches,
      }],
      undoOperations: [],
      undoAcknowledgements: [],
    });
    throwIfAborted(controller.signal);
    await assertLayerWritable(input, dependencies.canWriteLayer, controller.signal);
    await dependencies.append(log, controller.signal);
    return Object.freeze({
      status: "appended" as const,
      operation: log.operations[0]!,
      log,
      assets: Object.freeze(uniqueEncodedPayloads.map(({ reference }) => reference)),
    });
  } catch (error) {
    if (!controller.signal.aborted) controller.abort(error);
    await compensateVerifiedUploadReceipts(
      verifiedUploadReceipts,
      dependencies.compensate,
      concurrency
    );
    throw error;
  } finally {
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

export interface StudioRasterPngImageDataBuffer {
  readonly data: Uint8ClampedArray;
}

export interface StudioRasterPngCanvasContext {
  createImageData(width: number, height: number): StudioRasterPngImageDataBuffer;
  putImageData(imageData: StudioRasterPngImageDataBuffer, x: number, y: number): void;
}

export interface StudioRasterPngCanvas {
  getContext(contextId: "2d"): StudioRasterPngCanvasContext | null;
  convertToBlob?(options: { type: "image/png" }): Promise<Blob>;
  toBlob?(callback: (blob: Blob | null) => void, type: "image/png"): void;
}

export type StudioRasterPngCanvasFactory = (
  width: number,
  height: number
) => StudioRasterPngCanvas | null;

export type StudioRasterBrowserPngBackend = "offscreen-canvas" | "html-canvas";

export interface StudioRasterBrowserPngEncoderEnvironment {
  /** Exact backend selected before any pixels are copied. Defaults to the Worker-safe backend. */
  readonly backend?: StudioRasterBrowserPngBackend;
  /** `null` explicitly disables a backend; omitted selects the browser global when present. */
  readonly createOffscreenCanvas?: StudioRasterPngCanvasFactory | null;
  readonly createHtmlCanvas?: StudioRasterPngCanvasFactory | null;
}

function defaultOffscreenCanvasFactory(): StudioRasterPngCanvasFactory | null {
  if (typeof globalThis.OffscreenCanvas !== "function") return null;
  return (width, height) => new globalThis.OffscreenCanvas(width, height) as unknown as StudioRasterPngCanvas;
}

function defaultHtmlCanvasFactory(): StudioRasterPngCanvasFactory | null {
  if (typeof globalThis.document?.createElement !== "function") return null;
  return (width, height) => {
    const canvas = globalThis.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas as unknown as StudioRasterPngCanvas;
  };
}

async function canvasToPngBlob(canvas: StudioRasterPngCanvas): Promise<Blob> {
  if (typeof canvas.convertToBlob === "function") {
    return canvas.convertToBlob({ type: "image/png" });
  }
  if (typeof canvas.toBlob !== "function") {
    fail("png-export-unavailable");
  }
  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob!((blob) => {
        if (blob) resolve(blob);
        else reject(new StudioRasterPatchPublicationError("upload-incomplete"));
      }, "image/png");
    } catch (error) {
      reject(error);
    }
  });
}

async function encodeWithCanvas(
  input: StudioRasterPatchEncoderInput,
  factory: StudioRasterPngCanvasFactory
): Promise<StudioRasterEncodedPatch> {
  throwIfAborted(input.signal);
  const canvas = factory(input.width, input.height);
  const context = canvas?.getContext("2d");
  if (!canvas || !context) fail("canvas-context-unavailable");
  const imageData = context.createImageData(input.width, input.height);
  if (!(imageData.data instanceof Uint8ClampedArray) || imageData.data.byteLength !== input.rgba.byteLength) {
    fail("invalid-canvas-image-data");
  }
  imageData.data.set(input.rgba);
  context.putImageData(imageData, 0, 0);
  const blob = await canvasToPngBlob(canvas);
  throwIfAborted(input.signal);
  if (blob.type.toLowerCase() !== "image/png") {
    fail("png-media-type-mismatch");
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  throwIfAborted(input.signal);
  assertPngDimensions(bytes, input.width, input.height);
  return { bytes, mediaType: "image/png" };
}

/** Browser PNG encoder bound to one canvas backend for its entire lifetime. */
export function createStudioRasterBrowserPngEncoder(
  environment: StudioRasterBrowserPngEncoderEnvironment = {}
): StudioRasterPatchEncoder {
  const backend = environment.backend ?? "offscreen-canvas";
  const factory = backend === "offscreen-canvas"
    ? environment.createOffscreenCanvas === undefined
      ? defaultOffscreenCanvasFactory()
      : environment.createOffscreenCanvas
    : environment.createHtmlCanvas === undefined
      ? defaultHtmlCanvasFactory()
      : environment.createHtmlCanvas;
  return async (input) => {
    if (typeof factory !== "function") {
      fail("canvas-unavailable", { backend });
    }
    return encodeWithCanvas(input, factory);
  };
}
