/**
 * 무비용($0) PWA 코어 에셋 피너 타입·상수·무결성 검증기(HTTP 200·MIME·매직 바이트·SHA-256 SRI)·
 * 쿼터 오류 판별·버전 컷오프 비교·킬스위치 파서 및 인메모리 테스트 더블.
 */

export const PWA_BASE_CACHE_PREFIX = "toonstudio-base-assets-v";
export const PWA_BASE_STAGING_CACHE_PREFIX = "toonstudio-base-staging-";
export const DEFAULT_MAX_PIN_BYTES = 48 * 1024 * 1024;
export const DEFAULT_MAX_QUOTA_FRACTION = 0.2;
export const PWA_CACHE_RESET_QUERY_PARAM = "reset-pwa-cache";
export const PWA_KILL_SWITCH_HEADER = "x-toonstudio-pwa-kill-switch";
export const PWA_PURGE_BEFORE_HEADER = "x-toonstudio-pwa-purge-before";

export const DEFAULT_WASM64_CORE_ASSET_URLS = Object.freeze([
  "/wasm/studio-wasm64-drawing-core.wasm",
  "/wasm/studio-wasm64-drawing-core-simd.wasm",
  "/wasm/studio-wasm64-drawing-core-relaxed-simd.wasm",
  "/wasm/studio-wasm64-extended-suite.wasm",
] as const);
export const DEFAULT_AI_STARTER_MANIFEST_URL = "/assets/ai-starter-pack/manifest.json";
export const DEFAULT_SEMANTIC_INDEX_256D_URL =
  "/assets/ai-starter-pack/embeddings/catalog-semantic-index-256d.json";

/** WebAssembly 바이너리 표준 매직 헤더(`\0asm`) 및 버전 1 (`0x01 0x00 0x00 0x00`). */
export const WASM_MAGIC_BYTES = Object.freeze([0x00, 0x61, 0x73, 0x6d] as const);
const WASM_V1_BYTES = Object.freeze([0x01, 0x00, 0x00, 0x00] as const);
const WOFF2_MAGIC = Object.freeze([0x77, 0x4f, 0x46, 0x32] as const);
const PNG_MAGIC = Object.freeze([0x89, 0x50, 0x4e, 0x47] as const);

export type PwaBaseAssetKind = "wasm" | "manifest" | "semantic-index" | "font" | "icon" | "other";
export type StoragePersistenceStatus = "granted" | "denied" | "unsupported" | "error";
export type PinFailureReason =
  | "http-error" | "network-error" | "empty-payload" | "byte-length-mismatch"
  | "invalid-wasm-magic" | "invalid-magic-bytes" | "invalid-mime-type" | "invalid-json"
  | "integrity-mismatch" | "custom-validation-failed" | "quota-exceeded"
  | "kill-switch-purged" | "cache-write-error" | "aborted";

export interface PwaBaseAssetDescriptor {
  readonly url: string;
  readonly kind: PwaBaseAssetKind;
  readonly minBytes?: number;
  readonly maxBytes?: number;
  readonly expectedByteLength?: number;
  readonly expectedMimeTypes?: readonly string[];
  /** 선택적 SHA-256 SRI 해시(`"sha256-<base64>"` 또는 `"sha256:<hex>"`). */
  readonly integrity?: string;
  readonly validateJson?: boolean;
  readonly customValidate?: (bytes: Uint8Array, response: Response) => boolean | string;
}

export const DEFAULT_PWA_BASE_ASSET_DESCRIPTORS: readonly PwaBaseAssetDescriptor[] = Object.freeze([
  ...DEFAULT_WASM64_CORE_ASSET_URLS.map((url): PwaBaseAssetDescriptor => ({ url, kind: "wasm", minBytes: 8 })),
  { url: DEFAULT_AI_STARTER_MANIFEST_URL, kind: "manifest", minBytes: 2, validateJson: true },
  { url: DEFAULT_SEMANTIC_INDEX_256D_URL, kind: "semantic-index", minBytes: 2, validateJson: true },
]);

export interface PinCacheLike {
  match(request: RequestInfo | URL): Promise<Response | undefined>;
  put(request: RequestInfo | URL, response: Response): Promise<void>;
  delete(request: RequestInfo | URL): Promise<boolean>;
  keys(): Promise<readonly Request[]>;
}
export interface PinCacheStorageLike {
  open(cacheName: string): Promise<PinCacheLike>;
  keys(): Promise<string[]>;
  delete(cacheName: string): Promise<boolean>;
  has(cacheName: string): Promise<boolean>;
  match(request: RequestInfo | URL): Promise<Response | undefined>;
}
export interface PinStorageEstimate { readonly quota?: number; readonly usage?: number; }
export interface PinStorageManagerLike {
  estimate?: () => Promise<PinStorageEstimate>;
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
}
export interface GenerationPointerStore { get(): string | null; set(versionHash: string | null): void; }
export interface ActivationContext {
  readonly versionHash: string; readonly cacheName: string; readonly previousVersionHash: string | null;
}
export interface ActivationFlushResult {
  readonly activated: boolean;
  readonly reason: "activated" | "no-pending-activation" | "unsaved-canvas-edits" | "staging-missing" | "quota-exceeded" | "cache-write-error";
  readonly activeVersionHash: string | null;
  readonly pendingActivationVersion: string | null;
  readonly prunedCacheNames: readonly string[];
  readonly errorMessage?: string;
}
export interface PurgeCachesResult {
  readonly ok: boolean; readonly reason: string; readonly purgedCacheNames: readonly string[]; readonly purgedAtMs: number;
}
export interface SelfHealResult {
  readonly healthy: boolean; readonly healed: boolean;
  readonly missingUrls: readonly string[]; readonly corruptedUrls: readonly string[];
  readonly persistenceStatus: StoragePersistenceStatus; readonly pinResult: PinRunResult | null;
}
export interface PinnedAssetRecord {
  readonly url: string; readonly kind: PwaBaseAssetKind; readonly byteLength: number; readonly source: "cache" | "network";
}
export interface PinAssetFailure {
  readonly url: string; readonly kind: PwaBaseAssetKind; readonly reason: PinFailureReason; readonly message: string; readonly httpStatus?: number;
}
export interface PinRunResult {
  readonly ok: boolean;
  readonly status: "pinned" | "already-pinned" | "staged-pending-activation" | "quota-exceeded" | "purged" | "failed" | "aborted";
  readonly cacheName: string; readonly stagingCacheName: string; readonly versionHash: string;
  readonly activeVersionHash: string | null; readonly pendingActivationVersion: string | null;
  readonly activationDeferred: boolean; readonly quotaExceeded: boolean; readonly persistenceStatus: StoragePersistenceStatus;
  readonly pinnedAssets: readonly PinnedAssetRecord[]; readonly failures: readonly PinAssetFailure[];
  readonly prunedCacheNames: readonly string[]; readonly fetchCalls: number; readonly cacheHits: number;
  readonly totalBytes: number; readonly durationMs: number;
}
export interface MatchPinnedAssetResolution {
  readonly hit: boolean; readonly url: string; readonly response: Response | null;
  readonly cacheName: string | null; readonly source: "active-cache" | "fallback-cache" | "miss";
}
export interface PwaBaseAssetPinnerTelemetry {
  readonly cacheName: string; readonly stagingCacheName: string; readonly versionHash: string;
  readonly activeVersionHash: string | null; readonly pendingActivationVersion: string | null;
  readonly assetCount: number; readonly totalNetworkFetchCalls: number;
  readonly offlineCacheHits: number; readonly offlineCacheMisses: number;
  readonly persistenceStatus: StoragePersistenceStatus;
  readonly selfHealAttempts: number; readonly selfHealRecoveries: number;
  readonly lastPurge: PurgeCachesResult | null; readonly lastPinResult: PinRunResult | null;
}
export interface PwaBaseAssetPinnerOptions {
  readonly versionHash?: string; readonly buildTag?: string;
  readonly cachePrefix?: string; readonly stagingCachePrefix?: string;
  readonly includeDefaultCoreAssets?: boolean;
  readonly fontUrls?: readonly string[]; readonly iconUrls?: readonly string[];
  readonly extraAssets?: readonly PwaBaseAssetDescriptor[]; readonly assets?: readonly PwaBaseAssetDescriptor[];
  readonly cacheStorage?: PinCacheStorageLike; readonly storageManager?: PinStorageManagerLike | null;
  readonly maxPinBytes?: number; readonly maxQuotaFraction?: number; readonly requestPersistence?: boolean;
  readonly canActivateNow?: () => boolean; readonly hasUnsavedCanvasEdits?: () => boolean;
  readonly onActivate?: (ctx: ActivationContext) => Promise<void> | void;
  readonly generationStore?: GenerationPointerStore;
  readonly emergencyPurgeBefore?: string; readonly urlSearch?: string;
  readonly fetchFn?: typeof fetch; readonly requestInit?: RequestInit;
  readonly fallbackToAnyPinnedVersion?: boolean; readonly verifyCachedIntegrityOnRecheck?: boolean;
  readonly now?: () => number;
}

const normalizeUrlKey = (req: RequestInfo | URL): string =>
  typeof req === "string" ? req : req instanceof URL ? req.href : req.url;

const hasMagicPrefix = (bytes: Uint8Array, magic: readonly number[]): boolean =>
  bytes.byteLength >= magic.length && magic.every((b, idx) => bytes[idx] === b);

/** WebAssembly 바이너리 매직 헤더(`\0asm` + v1) 여부를 검증한다. */
export function hasValidWasmMagicHeader(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 8) return false;
  for (let i = 0; i < 4; i += 1) {
    if (bytes[i] !== WASM_MAGIC_BYTES[i] || bytes[i + 4] !== WASM_V1_BYTES[i]) return false;
  }
  return true;
}

/** 에셋 목록과 빌드 태그로부터 결정적 FNV-1a 8자리 버전 해시를 계산한다. */
export function computeBaseAssetVersionHash(assets: readonly PwaBaseAssetDescriptor[], buildTag = "v1"): string {
  let hash = 0x811c9dc5;
  const mix = (text: string): void => {
    for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  };
  mix(buildTag);
  for (const a of assets) mix(`|${a.kind}:${a.url}${a.expectedByteLength !== undefined ? `#${a.expectedByteLength}` : ""}`);
  return hash.toString(16).padStart(8, "0");
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function encodeBase64Pure(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.byteLength; i += 3) {
    const b0 = bytes[i] ?? 0;
    const has1 = i + 1 < bytes.byteLength;
    const has2 = i + 2 < bytes.byteLength;
    const b1 = has1 ? (bytes[i + 1] ?? 0) : 0;
    const b2 = has2 ? (bytes[i + 2] ?? 0) : 0;
    const triplet = (b0 << 16) | (b1 << 8) | b2;
    out += BASE64_ALPHABET[(triplet >>> 18) & 0x3f];
    out += BASE64_ALPHABET[(triplet >>> 12) & 0x3f];
    out += has1 ? BASE64_ALPHABET[(triplet >>> 6) & 0x3f] : "=";
    out += has2 ? BASE64_ALPHABET[triplet & 0x3f] : "=";
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof globalThis.btoa === "function") {
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i] ?? 0);
    return globalThis.btoa(binary);
  }
  return encodeBase64Pure(bytes);
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.byteLength; i += 1) hex += (bytes[i] ?? 0).toString(16).padStart(2, "0");
  return hex;
}

/** 바이트 버퍼의 SHA-256 SRI 다이제스트(`sha256-<base64>`)를 계산한다. */
export async function computeSha256Sri(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Web Crypto Subtle API(SHA-256)를 사용할 수 없습니다.");
  const digest = new Uint8Array(await subtle.digest("SHA-256", new Uint8Array(bytes)));
  return `sha256-${bytesToBase64(digest)}`;
}

/** 바이트 버퍼가 선언된 SHA-256 SRI(`sha256-<base64>` 또는 `sha256:<hex>`)와 일치하는지 검증한다. */
export async function verifyAssetSha256Integrity(bytes: Uint8Array, expected: string): Promise<boolean> {
  const trimmed = expected.trim();
  const subtle = globalThis.crypto?.subtle;
  if (!trimmed || !subtle) return false;
  const digest = new Uint8Array(await subtle.digest("SHA-256", new Uint8Array(bytes)));
  if (trimmed.startsWith("sha256-")) return `sha256-${bytesToBase64(digest)}` === trimmed;
  if (trimmed.toLowerCase().startsWith("sha256:")) return bytesToHex(digest) === trimmed.slice(7).toLowerCase();
  if (/^[0-9a-f]{64}$/iu.test(trimmed)) return bytesToHex(digest) === trimmed.toLowerCase();
  return false;
}

/** 브라우저/DOM/직렬화 오류에서 저장소 쿼터 초과(`QuotaExceededError`) 여부를 판정한다. */
export function isQuotaExceededError(error: unknown): boolean {
  if (!error || typeof error !== "object") return typeof error === "string" && /QuotaExceededError/iu.test(error);
  const candidate = error as { name?: unknown; message?: unknown; code?: unknown };
  if (candidate.name === "QuotaExceededError" || candidate.name === "NS_ERROR_DOM_QUOTA_REACHED") return true;
  if (candidate.code === 22 || candidate.code === 1014) return true;
  return typeof candidate.message === "string" && /QuotaExceededError|quota\s+exceeded/iu.test(candidate.message);
}

/** 두 버전 문자열(날짜·SemVer·접두 v 포함)을 결정적으로 비교한다(`a < b`이면 음수). */
export function compareVersionCutoff(version: string, cutoff: string): number {
  const norm = (s: string): string[] => s.trim().replace(/^v/iu, "").split(/[.-]/u).filter(Boolean);
  const left = norm(version);
  const right = norm(cutoff);
  const count = Math.max(left.length, right.length);
  for (let i = 0; i < count; i += 1) {
    const a = left[i] ?? "";
    const b = right[i] ?? "";
    if (a === b) continue;
    if (/^\d+$/u.test(a) && /^\d+$/u.test(b)) {
      const diff = Number(a) - Number(b);
      if (diff !== 0) return diff < 0 ? -1 : 1;
      continue;
    }
    return a < b ? -1 : 1;
  }
  return 0;
}

/** URL 쿼리스트링에 `?reset-pwa-cache=1` 비상 초기화 플래그가 포함되었는지 확인한다. */
export function shouldTriggerEmergencyPurgeFromUrl(urlOrSearch?: string | null): boolean {
  const raw = (urlOrSearch ?? "").trim();
  if (!raw) return false;
  const query = raw.includes("?") ? raw.slice(raw.indexOf("?")) : raw.startsWith("?") ? raw : `?${raw}`;
  const value = new URLSearchParams(query).get(PWA_CACHE_RESET_QUERY_PARAM)?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export interface KillSwitchHeaderDirective {
  readonly purgeAll: boolean; readonly purgeBefore: string | null; readonly reason: string | null;
}

/** 응답 헤더에서 서버 비상 킬스위치 지시를 추출한다. */
export function extractKillSwitchFromHeaders(headers: Headers): KillSwitchHeaderDirective {
  const rawSwitch = headers.get(PWA_KILL_SWITCH_HEADER)?.trim().toLowerCase() ?? "";
  const purgeAll = rawSwitch === "1" || rawSwitch === "true" || rawSwitch === "purge" || rawSwitch === "reset";
  const purgeBefore = headers.get(PWA_PURGE_BEFORE_HEADER)?.trim() || null;
  const reason = purgeAll ? `server-kill-switch:${rawSwitch}` : purgeBefore ? `server-purge-before:${purgeBefore}` : null;
  return { purgeAll, purgeBefore, reason };
}

interface StoredEntry {
  readonly bytes: Uint8Array; readonly status: number;
  readonly statusText: string; readonly headers: readonly [string, string][];
}

/** Vitest 및 비브라우저 환경용 인메모리 `Cache` 구현체. */
export class InMemoryPinCache implements PinCacheLike {
  private readonly store = new Map<string, StoredEntry>();
  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    const e = this.store.get(normalizeUrlKey(request));
    return e ? new Response(new Uint8Array(e.bytes), { status: e.status, statusText: e.statusText, headers: e.headers.map(([k, v]) => [k, v] as [string, string]) }) : undefined;
  }
  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    const cloned = response.clone();
    const headers: [string, string][] = [];
    cloned.headers.forEach((v, k) => { headers.push([k, v]); });
    this.store.set(normalizeUrlKey(request), { bytes: new Uint8Array(await cloned.arrayBuffer()), status: cloned.status, statusText: cloned.statusText, headers });
  }
  async delete(request: RequestInfo | URL): Promise<boolean> { return this.store.delete(normalizeUrlKey(request)); }
  async keys(): Promise<readonly Request[]> { return Array.from(this.store.keys(), (url) => ({ url } as Request)); }
}

/** Vitest 및 비브라우저 환경용 인메모리 `CacheStorage` 테스트 더블. */
export class InMemoryCacheStorage implements PinCacheStorageLike {
  private readonly caches = new Map<string, InMemoryPinCache>();
  async open(cacheName: string): Promise<PinCacheLike> {
    let cache = this.caches.get(cacheName);
    if (!cache) { cache = new InMemoryPinCache(); this.caches.set(cacheName, cache); }
    return cache;
  }
  async keys(): Promise<string[]> { return Array.from(this.caches.keys()); }
  async delete(cacheName: string): Promise<boolean> { return this.caches.delete(cacheName); }
  async has(cacheName: string): Promise<boolean> { return this.caches.has(cacheName); }
  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    for (const cache of this.caches.values()) { const hit = await cache.match(request); if (hit) return hit; }
    return undefined;
  }
}

export const createInMemoryCacheStorage = (): InMemoryCacheStorage => new InMemoryCacheStorage();

export function buildAssetList(options: PwaBaseAssetPinnerOptions): readonly PwaBaseAssetDescriptor[] {
  const raw: PwaBaseAssetDescriptor[] = options.assets
    ? [...options.assets]
    : [
      ...(options.includeDefaultCoreAssets !== false ? DEFAULT_PWA_BASE_ASSET_DESCRIPTORS : []),
      ...(options.fontUrls ?? []).map((url): PwaBaseAssetDescriptor => ({ url, kind: "font", minBytes: 1 })),
      ...(options.iconUrls ?? []).map((url): PwaBaseAssetDescriptor => ({ url, kind: "icon", minBytes: 1 })),
      ...(options.extraAssets ?? []),
    ];
  const seen = new Set<string>();
  const deduped: PwaBaseAssetDescriptor[] = [];
  for (const item of raw) {
    const url = item.url.trim();
    if (url && !seen.has(url)) { seen.add(url); deduped.push({ ...item, url }); }
  }
  return Object.freeze(deduped);
}

const normalizeMime = (ct: string | null): string => (ct ?? "").split(";")[0]?.trim().toLowerCase() ?? "";

function validateMimeType(asset: PwaBaseAssetDescriptor, response: Response): PinAssetFailure | null {
  const mime = normalizeMime(response.headers.get("content-type"));
  const fail = (message: string): PinAssetFailure => ({ url: asset.url, kind: asset.kind, reason: "invalid-mime-type", message });
  if (asset.expectedMimeTypes && asset.expectedMimeTypes.length > 0) {
    const allowed = asset.expectedMimeTypes.map((m) => normalizeMime(m));
    return allowed.includes(mime) ? null : fail(`예상 MIME(${allowed.join(", ")})과 다릅니다(${mime || "없음"}).`);
  }
  if (!mime) return null;
  if (mime === "text/html" || mime === "application/xhtml+xml") return fail(`SPA 폴백 HTML MIME(${mime}) 응답은 캐시할 수 없습니다.`);
  if (asset.kind === "wasm" && mime !== "application/wasm" && mime !== "application/octet-stream") return fail(`WASM 에셋에 허용되지 않은 MIME 타입입니다(${mime}).`);
  if ((asset.kind === "manifest" || asset.kind === "semantic-index") && mime !== "application/json" && mime !== "text/json" && mime !== "text/plain") return fail(`JSON 에셋에 허용되지 않은 MIME 타입입니다(${mime}).`);
  if (asset.kind === "font" && !mime.startsWith("font/") && !mime.startsWith("application/")) return fail(`폰트 에셋에 허용되지 않은 MIME 타입입니다(${mime}).`);
  if (asset.kind === "icon" && !mime.startsWith("image/") && mime !== "application/octet-stream") return fail(`아이콘 에셋에 허용되지 않은 MIME 타입입니다(${mime}).`);
  return null;
}

export async function validatePwaAssetPayload(
  asset: PwaBaseAssetDescriptor,
  bytes: Uint8Array,
  response: Response,
): Promise<PinAssetFailure | null> {
  const fail = (reason: PinFailureReason, message: string): PinAssetFailure => ({ url: asset.url, kind: asset.kind, reason, message });
  const len = bytes.byteLength;
  if (len === 0) return fail("empty-payload", "빈 응답 바이트입니다.");
  if (asset.expectedByteLength !== undefined && len !== asset.expectedByteLength) return fail("byte-length-mismatch", `예상 크기(${asset.expectedByteLength}B)와 다릅니다(${len}B).`);
  if (asset.minBytes !== undefined && len < asset.minBytes) return fail("byte-length-mismatch", `최소 크기(${asset.minBytes}B) 미만입니다(${len}B).`);
  if (asset.maxBytes !== undefined && len > asset.maxBytes) return fail("byte-length-mismatch", `최대 크기(${asset.maxBytes}B) 초과입니다(${len}B).`);
  const lowerUrl = asset.url.toLowerCase();
  if ((asset.kind === "wasm" || lowerUrl.endsWith(".wasm")) && !hasValidWasmMagicHeader(bytes)) return fail("invalid-wasm-magic", "유효한 WebAssembly 매직 헤더(\\0asm v1)가 아닙니다.");
  if (lowerUrl.endsWith(".woff2") && !hasMagicPrefix(bytes, WOFF2_MAGIC)) return fail("invalid-magic-bytes", "유효한 WOFF2 폰트 매직 헤더가 아닙니다.");
  if (lowerUrl.endsWith(".png") && !hasMagicPrefix(bytes, PNG_MAGIC)) return fail("invalid-magic-bytes", "유효한 PNG 이미지 매직 헤더가 아닙니다.");
  if (asset.validateJson ?? (asset.kind === "manifest" || asset.kind === "semantic-index")) {
    try {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
      if (parsed === null || typeof parsed !== "object") return fail("invalid-json", "JSON 루트가 객체/배열이 아닙니다.");
    } catch { return fail("invalid-json", "JSON 구문이 손상되었습니다."); }
  }
  const mimeFailure = validateMimeType(asset, response);
  if (mimeFailure) return mimeFailure;
  if (asset.integrity && !(await verifyAssetSha256Integrity(bytes, asset.integrity))) {
    return fail("integrity-mismatch", `SHA-256 SRI 해시가 일치하지 않습니다(${asset.integrity}).`);
  }
  if (asset.customValidate) {
    const verdict = asset.customValidate(bytes, response);
    if (verdict !== true) return fail("custom-validation-failed", typeof verdict === "string" ? verdict : "무결성 검증 실패.");
  }
  return null;
}
