/**
 * V12 local authority for user-authored Studio assets.
 *
 * SQLite owns one strict canonical manifest. OPFS owns only content-addressed bytes. A mutation
 * writes and verifies every new blob, protects the union of old/new owner references, and commits
 * the manifest last. Owner contraction and sweep happen after that authority commit, so a crash can
 * leak a recoverable orphan but cannot publish a manifest that points at an unprotected blob.
 */

import {
  canonicalizeStudioAssetContentHash,
  createAssetRecord,
  decodeStudioAssetDataUrl,
  normalizeAssetName,
  STUDIO_ASSET_CONTENT_IDENTITY_MAX_CANDIDATES_PER_HASH,
  STUDIO_ASSET_CONTENT_IDENTITY_MAX_RETURN_CANDIDATES,
  STUDIO_ASSET_CONTENT_IDENTITY_MAX_RETURN_DATA_URL_BYTES,
  STUDIO_ASSET_CONTENT_IDENTITY_MAX_RETURN_DATA_URL_CHARS,
  STUDIO_ASSET_DATA_URL_MAX_CHARS,
} from "./studio-asset-library";
import { acquireStudioLocalDatabase } from "./studio-local-database-runtime";
import {
  createStudioOpfsAssetStore,
  type StudioOpfsAssetStore,
  type StudioOpfsContentHash,
  type StudioOpfsStorageEstimator,
} from "./studio-opfs-asset-store";
import {
  createStudioOpfsNativeFileSystem,
  type StudioOpfsStorageManagerLike,
} from "./studio-opfs-filesystem";

import type {
  StudioAsset,
  StudioAssetContentHash,
  StudioAssetContentIdentityCandidateMap,
  StudioAssetLibraryPort,
  StudioAssetRightsMetadata,
  StudioAssetSaveInput,
  StudioAssetWithContentHash,
} from "./studio-asset-library";
import type { StudioLocalDatabase } from "./studio-local-database";

import {
  StudioAssetLibraryCommitAggregateError,
  StudioAssetLibraryRepositoryError,
  type StudioAssetLibraryFieldLabelCode,
  type StudioAssetLibraryOperationCode,
  type StudioAssetLibraryRepositoryErrorSubcode,
} from "./studio-asset-library-repository-error";

export const STUDIO_ASSET_LIBRARY_SQLITE_NAMESPACE = "studio-asset-library-v12";
export const STUDIO_ASSET_LIBRARY_SQLITE_MANIFEST_KEY = "manifest-v1";
export const STUDIO_ASSET_LIBRARY_CAS_OWNER = "studio-asset-library-v12";
export const STUDIO_ASSET_LIBRARY_CAS_ROOT = "toonstudio-studio-assets";
export const STUDIO_ASSET_LIBRARY_LOCK_NAME = "toonstudio-studio-asset-library-v12";

export const STUDIO_ASSET_LIBRARY_LIMITS = Object.freeze({
  assets: 1_000,
  individualBytes: 64 * 1024 * 1024,
  logicalBytes: 1024 * 1024 * 1024,
  manifestBytes: 8 * 1024 * 1024,
  idCodePoints: 160,
  nameCodePoints: 160,
  kindCodePoints: 80,
  rightsTextCodePoints: 2_000,
  queryLimit: 200,
  queryTextCodePoints: 160,
} as const);

const MANIFEST_VERSION = 1 as const;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,159}$/u;
const MIME_PATTERN = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u;
const SOURCE_KINDS = new Set<StudioAssetRightsMetadata["sourceKind"]>([
  "local-upload",
  "ai-generated",
  "3d-generated",
  "imported",
  "unknown",
]);
const UTF8 = new TextEncoder();
const BASE64_CHUNK_BYTES = 24_576;

export {
  StudioAssetLibraryCommitAggregateError,
  StudioAssetLibraryRepositoryError,
  type StudioAssetLibraryFieldLabelCode,
  type StudioAssetLibraryOperationCode,
  type StudioAssetLibraryRepositoryErrorCode,
  type StudioAssetLibraryRepositoryErrorSubcode,
} from "./studio-asset-library-repository-error";

export function isStudioAssetLibraryMemoryFallbackError(
  error: unknown,
): error is StudioAssetLibraryRepositoryError {
  return error instanceof StudioAssetLibraryRepositoryError
    && (error.code === "unavailable" || error.code === "quota-exceeded");
}

export interface StudioAssetManifestEntry {
  readonly id: string;
  readonly name: string;
  readonly contentHash: StudioAssetContentHash;
  readonly byteSize: number;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly createdAt: number;
  readonly kind: string | null;
  readonly rights: StudioAssetRightsMetadata;
}

export interface StudioAssetManifestV1 {
  readonly version: typeof MANIFEST_VERSION;
  readonly totalBytes: number;
  readonly entries: readonly StudioAssetManifestEntry[];
}

export interface StudioAssetQueryCursor {
  readonly createdAt: number;
  readonly id: string;
}

export interface StudioAssetQuery {
  readonly search?: string;
  readonly limit?: number;
  readonly after?: StudioAssetQueryCursor | null;
}

export interface StudioAssetQueryPage {
  readonly assets: readonly StudioAsset[];
  readonly hasMore: boolean;
  readonly nextCursor: StudioAssetQueryCursor | null;
  readonly totalCount: number;
}

export interface StudioAssetLibraryRepository extends StudioAssetLibraryPort {
  readonly authority: "sqlite-opfs";
  listReadOnly(): Promise<StudioAsset[]>;
  query(input?: StudioAssetQuery): Promise<StudioAssetQueryPage>;
  cleanupOrphans(): Promise<number>;
}

export type StudioAssetLibraryRunExclusive = <T>(task: () => Promise<T>) => Promise<T>;

export interface StudioAssetLibraryRepositoryOptions {
  readonly acquireDatabase?: () => Promise<StudioLocalDatabase>;
  readonly acquireAssetStore?: () => Promise<StudioOpfsAssetStore>;
  readonly runExclusive?: StudioAssetLibraryRunExclusive | null;
  readonly now?: () => number;
  readonly createId?: () => string;
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asRepositoryError(
  error: unknown,
  operation: StudioAssetLibraryOperationCode,
): StudioAssetLibraryRepositoryError {
  if (error instanceof StudioAssetLibraryRepositoryError) return error;
  const detail = errorDetail(error);
  const errorCode = typeof error === "object" && error !== null && "code" in error
    ? (error as { readonly code?: unknown }).code
    : null;
  if (errorCode === "QUOTA_EXCEEDED" || /quota|SQLITE_FULL|disk is full|space/i.test(detail)) {
    return new StudioAssetLibraryRepositoryError(
      "quota-exceeded",
      "quotaExceeded",
      { operation },
      { cause: error },
    );
  }
  return new StudioAssetLibraryRepositoryError(
    "unavailable",
    "operationFailed",
    { operation, detail },
    { cause: error },
  );
}

function invalid(subcode: StudioAssetLibraryRepositoryErrorSubcode, params?: Readonly<Record<string, string>>): never {
  throw new StudioAssetLibraryRepositoryError("invalid", subcode, params);
}

function corrupt(subcode: StudioAssetLibraryRepositoryErrorSubcode, params?: Readonly<Record<string, string>>, cause?: unknown): never {
  throw new StudioAssetLibraryRepositoryError("corrupt", subcode, params, { cause });
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length
    && keys.every((key, index) => key === [...expected].sort()[index]);
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}

function boundedCanonicalText(
  value: unknown,
  maximum: number,
  label: StudioAssetLibraryFieldLabelCode,
): string {
  if (typeof value !== "string") invalid("fieldMustBeString", { label });
  const normalized = value.normalize("NFKC").trim();
  if (!normalized || [...normalized].length > maximum || containsControlCharacter(normalized)) {
    invalid("fieldLengthOrChars", { label });
  }
  return normalized;
}

function nullableText(
  value: unknown,
  maximum: number,
  label: StudioAssetLibraryFieldLabelCode,
  options: { readonly allowEmpty?: boolean } = {},
): string | null {
  if (value === null) return null;
  if (typeof value !== "string") invalid("fieldMustBeStringOrNull", { label });
  const normalized = value.normalize("NFKC").trim();
  if ((!options.allowEmpty && !normalized) || [...normalized].length > maximum) {
    invalid("fieldLength", { label });
  }
  return normalized;
}

function defaultRights(kind: string | undefined): StudioAssetRightsMetadata {
  return {
    sourceKind: kind === "ai"
      ? "ai-generated"
      : kind?.startsWith("bg3d")
        ? "3d-generated"
        : "local-upload",
    sourceId: null,
    licenseId: "unknown",
    licenseLabel: "",
    licenseUrl: null,
    attributionRequired: null,
    attributionText: "",
    rightsConfirmed: false,
  };
}

function normalizeRights(
  value: unknown,
  kind?: string,
): StudioAssetRightsMetadata {
  if (value === undefined) return defaultRights(kind);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("rightsInvalid");
  }
  const record = value as Record<string, unknown>;
  if (!exactKeys(record, [
    "sourceKind",
    "sourceId",
    "licenseId",
    "licenseLabel",
    "licenseUrl",
    "attributionRequired",
    "attributionText",
    "rightsConfirmed",
  ])) invalid("rightsUnknownField");
  if (!SOURCE_KINDS.has(record.sourceKind as StudioAssetRightsMetadata["sourceKind"])) {
    invalid("rightsSourceKind");
  }
  const sourceId = nullableText(record.sourceId, 512, "rightsSourceId");
  const licenseId = boundedCanonicalText(record.licenseId, 128, "rightsLicenseId");
  const licenseLabel = nullableText(
    record.licenseLabel,
    256,
    "rightsLicenseLabel",
    { allowEmpty: true },
  ) ?? "";
  const licenseUrl = nullableText(record.licenseUrl, 2_048, "rightsLicenseUrl");
  if (licenseUrl !== null) {
    try {
      if (new URL(licenseUrl).protocol !== "https:") invalid("rightsUrlHttps");
    } catch {
      invalid("rightsUrlInvalid");
    }
  }
  const attributionRequired = record.attributionRequired;
  if (attributionRequired !== null && typeof attributionRequired !== "boolean") {
    invalid("attributionType");
  }
  const attributionText = nullableText(
    record.attributionText,
    STUDIO_ASSET_LIBRARY_LIMITS.rightsTextCodePoints,
    "rightsAttributionText",
    { allowEmpty: true },
  ) ?? "";
  if (typeof record.rightsConfirmed !== "boolean") {
    invalid("rightsConfirmedType");
  }
  return {
    sourceKind: record.sourceKind as StudioAssetRightsMetadata["sourceKind"],
    sourceId,
    licenseId,
    licenseLabel,
    licenseUrl,
    attributionRequired,
    attributionText,
    rightsConfirmed: record.rightsConfirmed,
  };
}

function compareEntries(left: StudioAssetManifestEntry, right: StudioAssetManifestEntry): number {
  return right.createdAt - left.createdAt || left.id.localeCompare(right.id, "en");
}

function canonicalEntry(value: unknown): StudioAssetManifestEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("entryNotObject");
  }
  const record = value as Record<string, unknown>;
  if (!exactKeys(record, [
    "id",
    "name",
    "contentHash",
    "byteSize",
    "mimeType",
    "width",
    "height",
    "createdAt",
    "kind",
    "rights",
  ])) invalid("entryFields");
  if (typeof record.id !== "string" || !ID_PATTERN.test(record.id)) {
    invalid("entryIdFormat");
  }
  const name = boundedCanonicalText(
    record.name,
    STUDIO_ASSET_LIBRARY_LIMITS.nameCodePoints,
    "assetName",
  );
  const contentHash = canonicalizeStudioAssetContentHash(record.contentHash);
  if (!contentHash || contentHash !== record.contentHash) invalid("entryContentHash");
  const byteSize = record.byteSize;
  if (!Number.isSafeInteger(byteSize) || (byteSize as number) < 1
    || (byteSize as number) > STUDIO_ASSET_LIBRARY_LIMITS.individualBytes) {
    invalid("entryByteSize");
  }
  const mimeType = typeof record.mimeType === "string" ? record.mimeType : "";
  if (!MIME_PATTERN.test(mimeType) || mimeType !== mimeType.toLowerCase()) {
    invalid("entryMime");
  }
  for (const dimension of [record.width, record.height]) {
    if (!Number.isSafeInteger(dimension) || (dimension as number) < 1 || (dimension as number) > 1_000_000) {
      invalid("entrySize");
    }
  }
  if (!Number.isSafeInteger(record.createdAt) || (record.createdAt as number) < 0) {
    invalid("entryCreatedAt");
  }
  const kind = record.kind === null
    ? null
    : boundedCanonicalText(
        record.kind,
        STUDIO_ASSET_LIBRARY_LIMITS.kindCodePoints,
        "assetKind",
      );
  return {
    id: record.id,
    name,
    contentHash,
    byteSize: byteSize as number,
    mimeType,
    width: record.width as number,
    height: record.height as number,
    createdAt: record.createdAt as number,
    kind,
    rights: normalizeRights(record.rights, kind ?? undefined),
  };
}

function buildManifest(entries: readonly StudioAssetManifestEntry[]): StudioAssetManifestV1 {
  if (entries.length > STUDIO_ASSET_LIBRARY_LIMITS.assets) {
    invalid("tooManyAssets", { max: String(STUDIO_ASSET_LIBRARY_LIMITS.assets) });
  }
  const ids = new Set<string>();
  const canonical = entries.map((entry) => canonicalEntry(entry)).sort(compareEntries);
  let totalBytes = 0;
  for (const entry of canonical) {
    if (ids.has(entry.id)) invalid("duplicateAssetId", { id: entry.id });
    ids.add(entry.id);
    totalBytes += entry.byteSize;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > STUDIO_ASSET_LIBRARY_LIMITS.logicalBytes) {
      invalid("totalBytesExceeded");
    }
  }
  return { version: MANIFEST_VERSION, totalBytes, entries: canonical };
}

export function serializeStudioAssetManifest(
  entries: readonly StudioAssetManifestEntry[],
): string {
  const serialized = JSON.stringify(buildManifest(entries));
  if (UTF8.encode(serialized).byteLength > STUDIO_ASSET_LIBRARY_LIMITS.manifestBytes) {
    invalid("manifestTooLarge");
  }
  return serialized;
}

export function parseStudioAssetManifest(raw: string | null): StudioAssetManifestV1 {
  if (raw === null) return buildManifest([]);
  if (UTF8.encode(raw).byteLength > STUDIO_ASSET_LIBRARY_LIMITS.manifestBytes) {
    corrupt("manifestSizeLimit");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    corrupt("manifestJsonCorrupt", undefined, error);
  }
  try {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      invalid("manifestNotObject");
    }
    const record = parsed as Record<string, unknown>;
    if (!exactKeys(record, ["version", "totalBytes", "entries"])
      || record.version !== MANIFEST_VERSION || !Array.isArray(record.entries)) {
      invalid("manifestVersionOrFields");
    }
    const manifest = buildManifest(record.entries);
    if (record.totalBytes !== manifest.totalBytes || JSON.stringify(manifest) !== raw) {
      invalid("manifestCanonicalMismatch");
    }
    return manifest;
  } catch (error) {
    if (error instanceof StudioAssetLibraryRepositoryError && error.code === "corrupt") throw error;
    corrupt("manifestCorrupt", undefined, error);
  }
}

function encodeDataUrl(bytes: Uint8Array, mimeType: string): string {
  let base64 = "";
  for (let offset = 0; offset < bytes.byteLength; offset += BASE64_CHUNK_BYTES) {
    const chunk = bytes.subarray(offset, offset + BASE64_CHUNK_BYTES);
    let binary = "";
    for (let index = 0; index < chunk.byteLength; index += 1) {
      binary += String.fromCharCode(chunk[index]!);
    }
    base64 += globalThis.btoa(binary);
  }
  const dataUrl = `data:${mimeType};base64,${base64}`;
  if (dataUrl.length > STUDIO_ASSET_DATA_URL_MAX_CHARS) {
    corrupt("dataUrlTooLarge");
  }
  return dataUrl;
}

function entryToAsset(entry: StudioAssetManifestEntry, dataUrl: string): StudioAssetWithContentHash {
  return {
    id: entry.id,
    name: entry.name,
    dataUrl,
    contentHash: entry.contentHash,
    width: entry.width,
    height: entry.height,
    createdAt: entry.createdAt,
    ...(entry.kind ? { kind: entry.kind } : {}),
    rights: entry.rights,
  };
}

async function verifiedBytes(
  store: StudioOpfsAssetStore,
  entry: StudioAssetManifestEntry,
): Promise<Uint8Array> {
  let stat;
  let bytes;
  try {
    stat = await store.stat(entry.contentHash);
    bytes = await store.get(entry.contentHash, { verify: true });
  } catch (error) {
    corrupt("casVerificationFailed", { id: entry.id }, error);
  }
  if (!stat || !bytes) corrupt("casBlobMissing", { id: entry.id });
  if (stat.hash !== entry.contentHash || stat.bytes !== entry.byteSize
    || stat.mime !== entry.mimeType || bytes.byteLength !== entry.byteSize) {
    corrupt("casLedgerMismatch", { id: entry.id });
  }
  return bytes;
}

async function hydrateEntry(
  store: StudioOpfsAssetStore,
  entry: StudioAssetManifestEntry,
): Promise<StudioAssetWithContentHash> {
  return entryToAsset(entry, encodeDataUrl(await verifiedBytes(store, entry), entry.mimeType));
}

function normalizeSearch(value: string | undefined): string {
  const normalized = (value ?? "").normalize("NFKC").trim().toLocaleLowerCase("ko");
  if ([...normalized].length > STUDIO_ASSET_LIBRARY_LIMITS.queryTextCodePoints) {
    invalid("searchTooLong");
  }
  return normalized;
}

function matchesSearch(entry: StudioAssetManifestEntry, search: string): boolean {
  if (!search) return true;
  return [
    entry.name,
    entry.kind ?? "",
    entry.mimeType,
    entry.rights.licenseId,
    entry.rights.licenseLabel,
    entry.rights.attributionText,
  ].some((value) => value.normalize("NFKC").toLocaleLowerCase("ko").includes(search));
}

function afterCursor(entry: StudioAssetManifestEntry, cursor: StudioAssetQueryCursor): boolean {
  return entry.createdAt < cursor.createdAt
    || (entry.createdAt === cursor.createdAt && entry.id.localeCompare(cursor.id, "en") > 0);
}

let productAssetStore: Promise<StudioOpfsAssetStore> | null = null;

export function acquireProductStudioAssetCasStore(): Promise<StudioOpfsAssetStore> {
  productAssetStore ??= Promise.resolve().then(() => {
    const storage = typeof navigator === "undefined" ? null : navigator.storage;
    if (!storage || typeof storage.getDirectory !== "function") {
      throw new StudioAssetLibraryRepositoryError("unavailable", "binaryStoreOpfsUnavailable");
    }
    const manager = storage as unknown as StudioOpfsStorageManagerLike;
    const estimator = typeof storage.estimate === "function"
      ? storage as StudioOpfsStorageEstimator
      : null;
    return createStudioOpfsAssetStore({
      fs: createStudioOpfsNativeFileSystem(manager, STUDIO_ASSET_LIBRARY_CAS_ROOT),
      estimator,
    });
  });
  return productAssetStore;
}

interface BrowserLockManagerLike {
  request<T>(
    name: string,
    options: { readonly mode: "exclusive" },
    callback: () => Promise<T>,
  ): Promise<T>;
}

function productRunExclusive(): StudioAssetLibraryRunExclusive | null {
  const locks = typeof navigator === "undefined"
    ? null
    : (navigator as Navigator & { locks?: BrowserLockManagerLike }).locks;
  if (!locks || typeof locks.request !== "function") return null;
  return <T>(task: () => Promise<T>) => locks.request(
    STUDIO_ASSET_LIBRARY_LOCK_NAME,
    { mode: "exclusive" },
    task,
  );
}

function uniqueHashes(entries: readonly StudioAssetManifestEntry[]): StudioOpfsContentHash[] {
  return [...new Set(entries.map(({ contentHash }) => contentHash as StudioOpfsContentHash))].sort();
}

export function createStudioAssetLibrarySqliteOpfsRepository(
  options: StudioAssetLibraryRepositoryOptions = {},
): StudioAssetLibraryRepository {
  const acquireDatabase = options.acquireDatabase ?? acquireStudioLocalDatabase;
  const acquireAssetStore = options.acquireAssetStore ?? acquireProductStudioAssetCasStore;
  const injected = options.acquireDatabase !== undefined || options.acquireAssetStore !== undefined;
  const runExclusive = options.runExclusive === undefined
    ? injected
      ? (<T>(task: () => Promise<T>) => task())
      : productRunExclusive()
    : options.runExclusive;
  const now = options.now ?? Date.now;
  const createId = options.createId ?? (() => crypto.randomUUID());
  let mutationTail: Promise<void> = Promise.resolve();

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = mutationTail.then(work, work);
    mutationTail = result.then(() => undefined, () => undefined);
    return result;
  }

  async function resources(): Promise<{
    readonly database: StudioLocalDatabase;
    readonly store: StudioOpfsAssetStore;
  }> {
    try {
      const [database, store] = await Promise.all([acquireDatabase(), acquireAssetStore()]);
      return { database, store };
    } catch (error) {
      throw asRepositoryError(error, "open");
    }
  }

  async function readManifest(database: StudioLocalDatabase): Promise<StudioAssetManifestV1> {
    let raw: string | null;
    try {
      raw = await database.kvGet(
        STUDIO_ASSET_LIBRARY_SQLITE_NAMESPACE,
        STUDIO_ASSET_LIBRARY_SQLITE_MANIFEST_KEY,
      );
    } catch (error) {
      throw asRepositoryError(error, "manifestRead");
    }
    return parseStudioAssetManifest(raw);
  }

  async function assertCasMetadata(
    store: StudioOpfsAssetStore,
    entries: readonly StudioAssetManifestEntry[],
  ): Promise<void> {
    for (const entry of entries) {
      let stat;
      try {
        stat = await store.stat(entry.contentHash);
      } catch (error) {
        corrupt("casIndexReadFailed", { id: entry.id }, error);
      }
      if (!stat || stat.hash !== entry.contentHash || stat.bytes !== entry.byteSize
        || stat.mime !== entry.mimeType) {
        corrupt("casManifestLedgerMismatch", { id: entry.id });
      }
    }
  }

  async function commitManifest(
    database: StudioLocalDatabase,
    store: StudioOpfsAssetStore,
    current: StudioAssetManifestV1,
    nextEntries: readonly StudioAssetManifestEntry[],
  ): Promise<StudioAssetManifestV1> {
    const next = buildManifest(nextEntries);
    await assertCasMetadata(store, next.entries);
    const oldHashes = uniqueHashes(current.entries);
    const nextHashes = uniqueHashes(next.entries);
    const protectedHashes = [...new Set([...oldHashes, ...nextHashes])].sort();
    const oldSerialized = serializeStudioAssetManifest(current.entries);
    const nextSerialized = serializeStudioAssetManifest(next.entries);
    try {
      await store.setOwnerRefs(STUDIO_ASSET_LIBRARY_CAS_OWNER, protectedHashes);
      await database.kvSet(
        STUDIO_ASSET_LIBRARY_SQLITE_NAMESPACE,
        STUDIO_ASSET_LIBRARY_SQLITE_MANIFEST_KEY,
        nextSerialized,
      );
    } catch (error) {
      // SQLite statement errors are not guaranteed to keep their typed Worker transport wrapper.
      // Reconcile every publication error against the exact durable old/candidate bytes.
      let observed: string | null;
      try {
        observed = await database.kvGet(
          STUDIO_ASSET_LIBRARY_SQLITE_NAMESPACE,
          STUDIO_ASSET_LIBRARY_SQLITE_MANIFEST_KEY,
        );
      } catch (reconcileCause) {
        throw new StudioAssetLibraryCommitAggregateError(
          "commitReconcileFailed",
          [error, reconcileCause],
          reconcileCause,
        );
      }
      // A missing manifest is the exact durable representation of the initial empty ledger.
      const observedOld = observed === oldSerialized
        || (observed === null && current.entries.length === 0);
      if (observed === nextSerialized) {
        // The mutation committed; return the candidate so callers receive and can compensate its
        // exact creation identity instead of losing the receipt with the response channel.
      } else if (observedOld) {
        try {
          await store.setOwnerRefs(STUDIO_ASSET_LIBRARY_CAS_OWNER, oldHashes);
        } catch (rollbackCause) {
          throw new StudioAssetLibraryCommitAggregateError(
            "commitRollbackFailed",
            [error, rollbackCause],
            rollbackCause,
          );
        }
        throw asRepositoryError(error, "manifestCommit");
      } else {
        throw new StudioAssetLibraryRepositoryError("unavailable", "manifestMismatch", undefined, { cause: error });
      }
    }
    // Manifest is now authoritative. Cleanup is recoverable bookkeeping and cannot roll it back.
    await store.setOwnerRefs(STUDIO_ASSET_LIBRARY_CAS_OWNER, nextHashes).catch(() => []);
    await store.sweep().catch(() => undefined);
    return next;
  }

  async function reconcileOwnerAndSweep(
    store: StudioOpfsAssetStore,
    manifest: StudioAssetManifestV1,
  ): Promise<number> {
    await store.setOwnerRefs(STUDIO_ASSET_LIBRARY_CAS_OWNER, uniqueHashes(manifest.entries));
    const swept = await store.sweep();
    return swept.removed.length;
  }

  async function mutation<T>(work: (
    database: StudioLocalDatabase,
    store: StudioOpfsAssetStore,
  ) => Promise<T>): Promise<T> {
    if (!runExclusive) {
      throw new StudioAssetLibraryRepositoryError("unavailable", "webLocksUnavailable");
    }
    return runExclusive(async () => {
      const { database, store } = await resources();
      return work(database, store);
    });
  }

  async function listHydrated(
    store: StudioOpfsAssetStore,
    entries: readonly StudioAssetManifestEntry[],
    signal?: AbortSignal,
  ): Promise<StudioAsset[]> {
    const assets: StudioAsset[] = [];
    for (const entry of entries) {
      if (signal?.aborted) break;
      assets.push(await hydrateEntry(store, entry));
    }
    return assets;
  }

  return {
    authority: "sqlite-opfs",

    save(input: StudioAssetSaveInput) {
      return enqueue(() => mutation(async (database, store) => {
        let decoded;
        try {
          decoded = decodeStudioAssetDataUrl(input.dataUrl);
        } catch (error) {
          throw new StudioAssetLibraryRepositoryError(
            "invalid",
            "bytesDecodeFailed",
            { detail: errorDetail(error) },
            { cause: error },
          );
        }
        if (decoded.bytes.byteLength < 1
          || decoded.bytes.byteLength > STUDIO_ASSET_LIBRARY_LIMITS.individualBytes) {
          invalid("bytesOutOfRange");
        }
        const id = createId();
        const record = createAssetRecord(input, id, now());
        const name = boundedCanonicalText(
          normalizeAssetName(record.name),
          STUDIO_ASSET_LIBRARY_LIMITS.nameCodePoints,
          "assetName",
        );
        const kind = record.kind === undefined
          ? null
          : boundedCanonicalText(
              record.kind,
              STUDIO_ASSET_LIBRARY_LIMITS.kindCodePoints,
              "assetKind",
            );
        if (!ID_PATTERN.test(record.id)) invalid("generatedIdFormat");
        const current = await readManifest(database);
        if (current.entries.some(({ id: currentId }) => currentId === record.id)) {
          invalid("generatedIdConflict");
        }
        let put;
        try {
          put = await store.put(decoded.bytes, { mime: decoded.mimeType });
        } catch (error) {
          throw asRepositoryError(error, "blobSave");
        }
        const expectedHash = canonicalizeStudioAssetContentHash(input.contentHash);
        if (input.contentHash !== undefined && (!expectedHash || expectedHash !== put.ref.hash)) {
          invalid("contentHashMismatch");
        }
        if (put.ref.bytes !== decoded.bytes.byteLength || put.ref.mime !== decoded.mimeType
          || put.entry.hash !== put.ref.hash || put.entry.bytes !== decoded.bytes.byteLength
          || put.entry.mime !== decoded.mimeType) {
          corrupt("casReceiptMismatch");
        }
        const entry = canonicalEntry({
          id: record.id,
          name,
          contentHash: put.ref.hash,
          byteSize: decoded.bytes.byteLength,
          mimeType: decoded.mimeType,
          width: record.width,
          height: record.height,
          createdAt: record.createdAt,
          kind,
          rights: normalizeRights(input.rights, kind ?? undefined),
        });
        await verifiedBytes(store, entry);
        const next = await commitManifest(database, store, current, [
          entry,
          ...current.entries,
        ]);
        const committed = next.entries.find(({ id: currentId }) => currentId === entry.id);
        if (!committed) corrupt("committedEntryMissing");
        return entryToAsset(committed, input.dataUrl);
      }));
    },

    list() {
      return enqueue(async () => {
        const read = async () => {
          const { database, store } = await resources();
          const manifest = await readManifest(database);
          // Refresh this tab's cached CAS index after the preceding writer's publication.
          await store.ownerRefs(STUDIO_ASSET_LIBRARY_CAS_OWNER);
          const assets = await listHydrated(store, manifest.entries);
          // Reconciliation contracts owner refs and deletes blobs. Keep the manifest read and
          // cleanup inside the writer lock so an older snapshot cannot sweep a new revision.
          // Without Web Locks, listing remains available but cannot perform storage mutations.
          if (runExclusive) await reconcileOwnerAndSweep(store, manifest).catch(() => undefined);
          return assets;
        };
        return runExclusive ? runExclusive(read) : read();
      });
    },

    async listReadOnly() {
      await mutationTail;
      const { database, store } = await resources();
      const manifest = await readManifest(database);
      return listHydrated(store, manifest.entries);
    },

    async query(input = {}) {
      await mutationTail;
      const limit = input.limit ?? 100;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > STUDIO_ASSET_LIBRARY_LIMITS.queryLimit) {
        invalid("pageLimit", { max: String(STUDIO_ASSET_LIBRARY_LIMITS.queryLimit) });
      }
      if (input.after && (!Number.isSafeInteger(input.after.createdAt)
        || input.after.createdAt < 0 || !ID_PATTERN.test(input.after.id))) {
        invalid("cursorInvalid");
      }
      const search = normalizeSearch(input.search);
      const { database, store } = await resources();
      const manifest = await readManifest(database);
      const matched = manifest.entries.filter((entry) => matchesSearch(entry, search));
      const eligible = input.after
        ? matched.filter((entry) => afterCursor(entry, input.after!))
        : matched;
      const pageEntries = eligible.slice(0, limit);
      const assets = await listHydrated(store, pageEntries);
      const last = pageEntries.at(-1);
      return {
        assets,
        hasMore: eligible.length > pageEntries.length,
        nextCursor: last ? { createdAt: last.createdAt, id: last.id } : null,
        totalCount: matched.length,
      };
    },

    async findByContentIdentities(lookups, signal) {
      if (signal?.aborted) return new Map();
      await mutationTail;
      const requested = new Map<StudioAssetContentHash, string[]>();
      for (const lookup of lookups.slice(0, 32)) {
        if (lookup.signal?.aborted) continue;
        const hash = canonicalizeStudioAssetContentHash(lookup.contentHash);
        if (!hash) continue;
        const ids = requested.get(hash) ?? [];
        if (typeof lookup.assetId === "string" && ID_PATTERN.test(lookup.assetId)
          && !ids.includes(lookup.assetId)) ids.push(lookup.assetId);
        requested.set(hash, ids);
      }
      if (requested.size === 0) return new Map();
      const { database, store } = await resources();
      const manifest = await readManifest(database);
      const result = new Map<StudioAssetContentHash, readonly StudioAsset[]>();
      let remainingCandidates = STUDIO_ASSET_CONTENT_IDENTITY_MAX_RETURN_CANDIDATES;
      let remainingChars = STUDIO_ASSET_CONTENT_IDENTITY_MAX_RETURN_DATA_URL_CHARS;
      let remainingBytes = STUDIO_ASSET_CONTENT_IDENTITY_MAX_RETURN_DATA_URL_BYTES;
      for (const [hash, ids] of requested) {
        if (signal?.aborted) return new Map();
        const seen = new Set<string>();
        const entries = [
          ...manifest.entries.filter(({ contentHash }) => contentHash === hash),
          ...ids.flatMap((id) => manifest.entries.filter((entry) => entry.id === id)),
        ].filter((entry) => {
          if (seen.has(entry.id)) return false;
          seen.add(entry.id);
          return true;
        }).slice(0, STUDIO_ASSET_CONTENT_IDENTITY_MAX_CANDIDATES_PER_HASH);
        const candidates: StudioAsset[] = [];
        for (const entry of entries) {
          if (remainingCandidates <= 0 || signal?.aborted) break;
          const asset = await hydrateEntry(store, entry);
          const byteLength = UTF8.encode(asset.dataUrl).byteLength;
          if (asset.dataUrl.length > remainingChars || byteLength > remainingBytes) continue;
          candidates.push(asset);
          remainingCandidates -= 1;
          remainingChars -= asset.dataUrl.length;
          remainingBytes -= byteLength;
        }
        result.set(hash, candidates);
      }
      return result as StudioAssetContentIdentityCandidateMap;
    },

    delete(id: string) {
      return enqueue(() => mutation(async (database, store) => {
        if (!ID_PATTERN.test(id)) invalid("deleteIdInvalid");
        const current = await readManifest(database);
        if (!current.entries.some((entry) => entry.id === id)) return;
        await commitManifest(
          database,
          store,
          current,
          current.entries.filter((entry) => entry.id !== id),
        );
      }));
    },

    deleteIfIdentityMatches(id: string, value: StudioAssetContentHash) {
      return enqueue(() => mutation(async (database, store) => {
        const contentHash = canonicalizeStudioAssetContentHash(value);
        if (!ID_PATTERN.test(id) || !contentHash) return false;
        const current = await readManifest(database);
        const matching = current.entries.find(
          (entry) => entry.id === id && entry.contentHash === contentHash,
        );
        if (!matching) return false;
        await commitManifest(
          database,
          store,
          current,
          current.entries.filter((entry) => entry.id !== id),
        );
        return true;
      }));
    },

    rename(id: string, newName: string) {
      return enqueue(() => mutation(async (database, store) => {
        if (!ID_PATTERN.test(id)) invalid("renameIdInvalid");
        const name = boundedCanonicalText(
          normalizeAssetName(newName),
          STUDIO_ASSET_LIBRARY_LIMITS.nameCodePoints,
          "assetName",
        );
        const current = await readManifest(database);
        if (!current.entries.some((entry) => entry.id === id)) {
          throw new StudioAssetLibraryRepositoryError("not-found", "notFound");
        }
        await commitManifest(
          database,
          store,
          current,
          current.entries.map((entry) => entry.id === id ? { ...entry, name } : entry),
        );
      }));
    },

    cleanupOrphans() {
      return enqueue(() => mutation(async (database, store) => {
        const manifest = await readManifest(database);
        await assertCasMetadata(store, manifest.entries);
        return reconcileOwnerAndSweep(store, manifest);
      }));
    },
  };
}

let productRepository: StudioAssetLibraryRepository | null = null;

export function getProductStudioAssetLibraryRepository(): StudioAssetLibraryRepository {
  productRepository ??= createStudioAssetLibrarySqliteOpfsRepository();
  return productRepository;
}
