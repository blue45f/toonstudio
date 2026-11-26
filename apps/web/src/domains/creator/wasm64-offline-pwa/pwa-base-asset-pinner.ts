/**
 * 무비용($0) PWA 코어 불변 에셋 버전 해시 CacheStorage 피닝 컨트롤러.
 *
 * - WASM64 바이너리 4종, AI 스타터 팩 매니페스트, 884개 오프라인 시맨틱 인덱스,
 *   설정 가능한 기본 폰트·아이콘을 원자적 버전 캐시(`toonstudio-base-assets-v<hash>`)에 고정한다.
 * - HTTP 2xx, 바이트 길이, `.wasm` 매직 헤더(`\0asm`), JSON 구문 검사를 100% 통과해
 *   새 캐시에 커밋된 뒤에만 구버전 캐시를 정리하므로 오프라인 재방문 무결성이 유지된다.
 */

export const PWA_BASE_CACHE_PREFIX = "toonstudio-base-assets-v";
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

export type PwaBaseAssetKind = "wasm" | "manifest" | "semantic-index" | "font" | "icon" | "other";
export type PinFailureReason =
  | "http-error" | "network-error" | "empty-payload" | "byte-length-mismatch"
  | "invalid-wasm-magic" | "invalid-json" | "custom-validation-failed"
  | "cache-write-error" | "aborted";

export interface PwaBaseAssetDescriptor {
  readonly url: string; readonly kind: PwaBaseAssetKind;
  readonly minBytes?: number; readonly maxBytes?: number; readonly expectedByteLength?: number;
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
export interface PinnedAssetRecord {
  readonly url: string; readonly kind: PwaBaseAssetKind; readonly byteLength: number; readonly source: "cache" | "network";
}
export interface PinAssetFailure {
  readonly url: string; readonly kind: PwaBaseAssetKind; readonly reason: PinFailureReason; readonly message: string; readonly httpStatus?: number;
}
export interface PinRunResult {
  readonly ok: boolean; readonly status: "pinned" | "already-pinned" | "failed" | "aborted";
  readonly cacheName: string; readonly versionHash: string;
  readonly pinnedAssets: readonly PinnedAssetRecord[]; readonly failures: readonly PinAssetFailure[];
  readonly prunedCacheNames: readonly string[]; readonly fetchCalls: number;
  readonly cacheHits: number; readonly totalBytes: number; readonly durationMs: number;
}
export interface MatchPinnedAssetResolution {
  readonly hit: boolean; readonly url: string; readonly response: Response | null;
  readonly cacheName: string | null; readonly source: "active-cache" | "fallback-cache" | "miss";
}
export interface PwaBaseAssetPinnerTelemetry {
  readonly cacheName: string; readonly versionHash: string; readonly assetCount: number;
  readonly totalNetworkFetchCalls: number; readonly offlineCacheHits: number;
  readonly offlineCacheMisses: number; readonly lastPinResult: PinRunResult | null;
}
export interface PwaBaseAssetPinnerOptions {
  readonly versionHash?: string; readonly buildTag?: string; readonly cachePrefix?: string;
  readonly includeDefaultCoreAssets?: boolean;
  readonly fontUrls?: readonly string[]; readonly iconUrls?: readonly string[];
  readonly extraAssets?: readonly PwaBaseAssetDescriptor[]; readonly assets?: readonly PwaBaseAssetDescriptor[];
  readonly cacheStorage?: PinCacheStorageLike; readonly fetchFn?: typeof fetch;
  readonly requestInit?: RequestInit; readonly fallbackToAnyPinnedVersion?: boolean;
  readonly verifyCachedIntegrityOnRecheck?: boolean; readonly now?: () => number;
}

const normalizeUrlKey = (req: RequestInfo | URL): string =>
  typeof req === "string" ? req : req instanceof URL ? req.href : req.url;

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

function buildAssetList(options: PwaBaseAssetPinnerOptions): readonly PwaBaseAssetDescriptor[] {
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

function validatePayloadBytes(asset: PwaBaseAssetDescriptor, bytes: Uint8Array, response: Response): PinAssetFailure | null {
  const fail = (reason: PinFailureReason, message: string): PinAssetFailure => ({ url: asset.url, kind: asset.kind, reason, message });
  const len = bytes.byteLength;
  if (len === 0) return fail("empty-payload", "빈 응답 바이트입니다.");
  if (asset.expectedByteLength !== undefined && len !== asset.expectedByteLength) return fail("byte-length-mismatch", `예상 크기(${asset.expectedByteLength}B)와 다릅니다(${len}B).`);
  if (asset.minBytes !== undefined && len < asset.minBytes) return fail("byte-length-mismatch", `최소 크기(${asset.minBytes}B) 미만입니다(${len}B).`);
  if (asset.maxBytes !== undefined && len > asset.maxBytes) return fail("byte-length-mismatch", `최대 크기(${asset.maxBytes}B) 초과입니다(${len}B).`);
  if ((asset.kind === "wasm" || asset.url.toLowerCase().endsWith(".wasm")) && !hasValidWasmMagicHeader(bytes)) {
    return fail("invalid-wasm-magic", "유효한 WebAssembly 매직 헤더(\\0asm v1)가 아닙니다.");
  }
  if (asset.validateJson ?? (asset.kind === "manifest" || asset.kind === "semantic-index")) {
    try {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
      if (parsed === null || typeof parsed !== "object") return fail("invalid-json", "JSON 루트가 객체/배열이 아닙니다.");
    } catch { return fail("invalid-json", "JSON 구문이 손상되었습니다."); }
  }
  if (asset.customValidate) {
    const verdict = asset.customValidate(bytes, response);
    if (verdict !== true) return fail("custom-validation-failed", typeof verdict === "string" ? verdict : "무결성 검증 실패.");
  }
  return null;
}

type StagedAsset = { readonly asset: PwaBaseAssetDescriptor; readonly bytes: Uint8Array; readonly response: Response };

export class PwaBaseAssetPinner {
  readonly cachePrefix: string;
  readonly versionHash: string;
  readonly cacheName: string;
  readonly assets: readonly PwaBaseAssetDescriptor[];
  private readonly cacheStorage: PinCacheStorageLike;
  private readonly fetchFn: typeof fetch;
  private readonly requestInit: RequestInit;
  private readonly fallbackToAnyPinnedVersion: boolean;
  private readonly verifyCachedIntegrityOnRecheck: boolean;
  private readonly now: () => number;
  private readonly metrics = { networkFetchCalls: 0, offlineHits: 0, offlineMisses: 0 };
  private lastPinResult: PinRunResult | null = null;

  constructor(options: PwaBaseAssetPinnerOptions = {}) {
    this.cachePrefix = options.cachePrefix ?? PWA_BASE_CACHE_PREFIX;
    this.assets = buildAssetList(options);
    const hash = (options.versionHash ?? computeBaseAssetVersionHash(this.assets, options.buildTag)).trim();
    if (!hash || /\s/.test(hash)) throw new RangeError(`유효한 versionHash가 필요합니다: "${hash}"`);
    this.versionHash = hash;
    this.cacheName = `${this.cachePrefix}${this.versionHash}`;
    const storage = options.cacheStorage ?? (globalThis.caches as unknown as PinCacheStorageLike | undefined);
    if (!storage) throw new Error("CacheStorage가 지원되지 않습니다. cacheStorage 옵션을 주입하세요.");
    this.cacheStorage = storage;
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.requestInit = options.requestInit ?? { cache: "no-store" };
    this.fallbackToAnyPinnedVersion = options.fallbackToAnyPinnedVersion ?? true;
    this.verifyCachedIntegrityOnRecheck = options.verifyCachedIntegrityOnRecheck ?? false;
    this.now = options.now ?? (() => performance.now());
  }

  /** 모든 코어 에셋을 현재 버전 캐시에 원자적 고정(이미 고정 시 0 네트워크). */
  async pinAll(signal?: AbortSignal): Promise<PinRunResult> {
    const startedAt = this.now();
    const existing = await this.checkAlreadyPinned(signal);
    if (existing) {
      return this.finishPin(true, "already-pinned", existing.records, [], await this.pruneStaleCaches(), 0, existing.records.length, existing.totalBytes, startedAt);
    }

    const staged: StagedAsset[] = [];
    const failures: PinAssetFailure[] = [];
    let fetchCalls = 0;
    for (const asset of this.assets) {
      if (signal?.aborted) { failures.push({ url: asset.url, kind: asset.kind, reason: "aborted", message: "피닝이 취소되었습니다." }); break; }
      fetchCalls += 1;
      this.metrics.networkFetchCalls += 1;
      const fetched = await this.fetchAndValidate(asset, signal);
      if ("reason" in fetched) { failures.push(fetched); break; }
      staged.push(fetched);
    }
    if (failures.length > 0 || staged.length !== this.assets.length) {
      return this.finishPin(false, failures.some((f) => f.reason === "aborted") ? "aborted" : "failed", [], failures, [], fetchCalls, 0, 0, startedAt);
    }

    const pinnedAssets: PinnedAssetRecord[] = [];
    let totalBytes = 0;
    try {
      const targetCache = await this.cacheStorage.open(this.cacheName);
      for (const item of staged) {
        const headers = new Headers(item.response.headers);
        headers.set("x-toonstudio-pin-version", this.versionHash);
        await targetCache.put(item.asset.url, new Response(new Uint8Array(item.bytes), { status: item.response.status, statusText: item.response.statusText, headers }));
        pinnedAssets.push({ url: item.asset.url, kind: item.asset.kind, byteLength: item.bytes.byteLength, source: "network" });
        totalBytes += item.bytes.byteLength;
      }
    } catch (error) {
      await this.cacheStorage.delete(this.cacheName).catch(() => false);
      return this.finishPin(false, "failed", [], [{ url: this.cacheName, kind: "other", reason: "cache-write-error", message: error instanceof Error ? error.message : String(error) }], [], fetchCalls, 0, 0, startedAt);
    }
    return this.finishPin(true, "pinned", pinnedAssets, [], await this.pruneStaleCaches(), fetchCalls, 0, totalBytes, startedAt);
  }

  /** 네트워크 호출 0회로 고정된 오프라인 에셋을 조회한다. */
  async matchPinnedAsset(url: string): Promise<Response | null> { return (await this.resolvePinnedAsset(url)).response; }

  /** 활성 버전 캐시 우선 조회 + 구버전 핀 캐시 폴백(0 네트워크). */
  async resolvePinnedAsset(url: string): Promise<MatchPinnedAssetResolution> {
    if (await this.cacheStorage.has(this.cacheName)) {
      const hit = await (await this.cacheStorage.open(this.cacheName)).match(url);
      if (hit) { this.metrics.offlineHits += 1; return { hit: true, url, response: hit, cacheName: this.cacheName, source: "active-cache" }; }
    }
    if (this.fallbackToAnyPinnedVersion) {
      for (const name of (await this.cacheStorage.keys()).reverse()) {
        if (name === this.cacheName || !name.startsWith(this.cachePrefix)) continue;
        const hit = await (await this.cacheStorage.open(name)).match(url);
        if (hit) { this.metrics.offlineHits += 1; return { hit: true, url, response: hit, cacheName: name, source: "fallback-cache" }; }
      }
    }
    this.metrics.offlineMisses += 1;
    return { hit: false, url, response: null, cacheName: null, source: "miss" };
  }

  /** 고정된 오프라인 에셋을 바이트 배열로 읽는다(0 네트워크). */
  async readPinnedAssetBytes(url: string): Promise<Uint8Array | null> {
    const response = await this.matchPinnedAsset(url);
    return response ? new Uint8Array(await response.arrayBuffer()) : null;
  }

  getTelemetry(): PwaBaseAssetPinnerTelemetry {
    return {
      cacheName: this.cacheName, versionHash: this.versionHash, assetCount: this.assets.length,
      totalNetworkFetchCalls: this.metrics.networkFetchCalls, offlineCacheHits: this.metrics.offlineHits,
      offlineCacheMisses: this.metrics.offlineMisses, lastPinResult: this.lastPinResult,
    };
  }

  private async fetchAndValidate(asset: PwaBaseAssetDescriptor, signal?: AbortSignal): Promise<StagedAsset | PinAssetFailure> {
    try {
      const response = await this.fetchFn(asset.url, { ...this.requestInit, signal });
      if (!response.ok) return { url: asset.url, kind: asset.kind, reason: "http-error", httpStatus: response.status, message: `HTTP ${response.status} 응답 오류.` };
      const bytes = new Uint8Array(await response.arrayBuffer());
      return validatePayloadBytes(asset, bytes, response) ?? { asset, bytes, response };
    } catch (error) {
      const isAbort = signal?.aborted || (error instanceof Error && error.name === "AbortError");
      return { url: asset.url, kind: asset.kind, reason: isAbort ? "aborted" : "network-error", message: error instanceof Error ? error.message : String(error) };
    }
  }

  private finishPin(
    ok: boolean, status: PinRunResult["status"], pinnedAssets: readonly PinnedAssetRecord[],
    failures: readonly PinAssetFailure[], prunedCacheNames: readonly string[],
    fetchCalls: number, cacheHits: number, totalBytes: number, startedAt: number,
  ): PinRunResult {
    const result: PinRunResult = {
      ok, status, cacheName: this.cacheName, versionHash: this.versionHash,
      pinnedAssets, failures, prunedCacheNames, fetchCalls, cacheHits, totalBytes,
      durationMs: Math.max(0, this.now() - startedAt),
    };
    this.lastPinResult = result;
    return result;
  }

  private async checkAlreadyPinned(signal?: AbortSignal): Promise<{ records: PinnedAssetRecord[]; totalBytes: number } | null> {
    if (signal?.aborted || !(await this.cacheStorage.has(this.cacheName))) return null;
    const cache = await this.cacheStorage.open(this.cacheName);
    const records: PinnedAssetRecord[] = [];
    let totalBytes = 0;
    for (const asset of this.assets) {
      if (signal?.aborted) return null;
      const hit = await cache.match(asset.url);
      if (!hit) return null;
      const bytes = new Uint8Array(await hit.arrayBuffer());
      if (this.verifyCachedIntegrityOnRecheck && validatePayloadBytes(asset, bytes, hit)) return null;
      records.push({ url: asset.url, kind: asset.kind, byteLength: bytes.byteLength, source: "cache" });
      totalBytes += bytes.byteLength;
    }
    return { records, totalBytes };
  }

  private async pruneStaleCaches(): Promise<string[]> {
    const pruned: string[] = [];
    for (const name of await this.cacheStorage.keys()) {
      if (name !== this.cacheName && name.startsWith(this.cachePrefix) && (await this.cacheStorage.delete(name))) pruned.push(name);
    }
    return pruned;
  }
}
