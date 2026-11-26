/**
 * 무비용($0) PWA 코어 불변 에셋 버전 해시 CacheStorage 피닝 컨트롤러 (프로덕션 하드닝 v2).
 *
 * 5대 프로덕션 안전 가드:
 * 1. 저장소 쿼터 상한 가드 (`navigator.storage.estimate()`, `maxPinBytes` 48 MiB, 가용 쿼터 20% 상한, `QuotaExceededError` 무충돌 롤백)
 * 2. 원자적 세대 교체 및 무결성 검증 (`toonstudio-base-staging-<buildHash>` 스테이징 → HTTP 200·MIME·매직 바이트·SHA-256 SRI 100% 검증 후 세대 교체)
 * 3. 비파괴 활성화 게이트 (`canActivateNow` / `hasUnsavedCanvasEdits` → `pendingActivationVersion` 대기 + `flushPendingActivation()`)
 * 4. Safari 7일 ITP / 브라우저 퇴거 자가 치유 (`navigator.storage.persist()` 기회적 요청 + `verifyAndSelfHealPinnedAssets()`)
 * 5. 비상 킬스위치 및 오염 캐시 일괄 퍼지 (`emergencyPurgeBefore`, `?reset-pwa-cache=1`, 서버 킬스위치 헤더, `purgeAllPinnedCaches(reason)`)
 */

import {
  DEFAULT_MAX_PIN_BYTES,
  DEFAULT_MAX_QUOTA_FRACTION,
  PWA_BASE_CACHE_PREFIX,
  PWA_BASE_STAGING_CACHE_PREFIX,
  buildAssetList,
  compareVersionCutoff,
  computeBaseAssetVersionHash,
  extractKillSwitchFromHeaders,
  isQuotaExceededError,
  shouldTriggerEmergencyPurgeFromUrl,
  validatePwaAssetPayload,
  type ActivationContext,
  type ActivationFlushResult,
  type GenerationPointerStore,
  type MatchPinnedAssetResolution,
  type PinAssetFailure,
  type PinCacheLike,
  type PinCacheStorageLike,
  type PinRunResult,
  type PinStorageManagerLike,
  type PinnedAssetRecord,
  type PurgeCachesResult,
  type PwaBaseAssetDescriptor,
  type PwaBaseAssetPinnerOptions,
  type PwaBaseAssetPinnerTelemetry,
  type SelfHealResult,
  type StoragePersistenceStatus,
} from "./pwa-base-asset-pinner-guards";

export * from "./pwa-base-asset-pinner-guards";

type StagedAsset = { readonly asset: PwaBaseAssetDescriptor; readonly bytes: Uint8Array; readonly response: Response };
type FetchValidationOutcome =
  | StagedAsset
  | PinAssetFailure
  | { readonly killSwitchReason: string; readonly asset: PwaBaseAssetDescriptor };

export class PwaBaseAssetPinner {
  readonly cachePrefix: string;
  readonly stagingCachePrefix: string;
  readonly versionHash: string;
  readonly cacheName: string;
  readonly stagingCacheName: string;
  readonly maxPinBytes: number;
  readonly maxQuotaFraction: number;
  readonly assets: readonly PwaBaseAssetDescriptor[];
  private readonly cacheStorage: PinCacheStorageLike;
  private readonly storageManager: PinStorageManagerLike | null;
  private readonly requestPersistence: boolean;
  private readonly canActivateNow?: () => boolean;
  private readonly hasUnsavedCanvasEdits?: () => boolean;
  private readonly onActivate?: (ctx: ActivationContext) => Promise<void> | void;
  private readonly generationStore?: GenerationPointerStore;
  private readonly emergencyPurgeBefore?: string;
  private readonly urlSearch?: string;
  private readonly fetchFn: typeof fetch;
  private readonly requestInit: RequestInit;
  private readonly fallbackToAnyPinnedVersion: boolean;
  private readonly verifyCachedIntegrityOnRecheck: boolean;
  private readonly now: () => number;
  private readonly metrics = {
    networkFetchCalls: 0, offlineHits: 0, offlineMisses: 0, selfHealAttempts: 0, selfHealRecoveries: 0,
  };
  private activeVersionHash: string | null = null;
  private pendingActivationVersion: string | null = null;
  private unsavedCanvasEditsOverride = false;
  private persistenceStatus: StoragePersistenceStatus = "unsupported";
  private urlResetApplied = false;
  private lastPurge: PurgeCachesResult | null = null;
  private lastPinResult: PinRunResult | null = null;

  constructor(options: PwaBaseAssetPinnerOptions = {}) {
    this.cachePrefix = options.cachePrefix ?? PWA_BASE_CACHE_PREFIX;
    this.stagingCachePrefix = options.stagingCachePrefix ?? PWA_BASE_STAGING_CACHE_PREFIX;
    this.assets = buildAssetList(options);
    const hash = (options.versionHash ?? computeBaseAssetVersionHash(this.assets, options.buildTag)).trim();
    if (!hash || /\s/.test(hash)) throw new RangeError(`유효한 versionHash가 필요합니다: "${hash}"`);
    this.versionHash = hash;
    this.cacheName = `${this.cachePrefix}${this.versionHash}`;
    this.stagingCacheName = `${this.stagingCachePrefix}${this.versionHash}`;
    this.maxPinBytes = options.maxPinBytes !== undefined && Number.isFinite(options.maxPinBytes) && options.maxPinBytes > 0
      ? Math.floor(options.maxPinBytes) : DEFAULT_MAX_PIN_BYTES;
    this.maxQuotaFraction = options.maxQuotaFraction !== undefined && Number.isFinite(options.maxQuotaFraction)
      ? Math.min(1, Math.max(0.01, options.maxQuotaFraction)) : DEFAULT_MAX_QUOTA_FRACTION;
    const storage = options.cacheStorage ?? (globalThis.caches as unknown as PinCacheStorageLike | undefined);
    if (!storage) throw new Error("CacheStorage가 지원되지 않습니다. cacheStorage 옵션을 주입하세요.");
    this.cacheStorage = storage;
    this.storageManager = options.storageManager !== undefined
      ? options.storageManager
      : ((globalThis.navigator as { storage?: PinStorageManagerLike } | undefined)?.storage ?? null);
    this.requestPersistence = options.requestPersistence ?? true;
    this.canActivateNow = options.canActivateNow;
    this.hasUnsavedCanvasEdits = options.hasUnsavedCanvasEdits;
    this.onActivate = options.onActivate;
    this.generationStore = options.generationStore;
    this.emergencyPurgeBefore = options.emergencyPurgeBefore?.trim() || undefined;
    this.urlSearch = options.urlSearch;
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.requestInit = options.requestInit ?? { cache: "no-store" };
    this.fallbackToAnyPinnedVersion = options.fallbackToAnyPinnedVersion ?? true;
    this.verifyCachedIntegrityOnRecheck = options.verifyCachedIntegrityOnRecheck ?? false;
    this.now = options.now ?? (() => performance.now());
    this.activeVersionHash = this.generationStore?.get() ?? null;
  }

  /** 미저장 캔버스 편집 상태를 명시적으로 갱신한다(활성화 게이트 제어용). */
  setHasUnsavedCanvasEdits(dirty: boolean): void { this.unsavedCanvasEditsOverride = dirty; }
  getActiveVersionHash(): string | null { return this.activeVersionHash; }
  getPendingActivationVersion(): string | null { return this.pendingActivationVersion; }

  /** 브라우저 영구 저장소(`navigator.storage.persist()`) 권한을 기회적으로 요청한다. */
  async requestPersistentStorage(): Promise<StoragePersistenceStatus> {
    if (!this.storageManager?.persist) { this.persistenceStatus = "unsupported"; return this.persistenceStatus; }
    try {
      if (typeof this.storageManager.persisted === "function" && await this.storageManager.persisted()) {
        this.persistenceStatus = "granted";
        return this.persistenceStatus;
      }
      this.persistenceStatus = (await this.storageManager.persist()) ? "granted" : "denied";
      return this.persistenceStatus;
    } catch {
      this.persistenceStatus = "error";
      return this.persistenceStatus;
    }
  }

  /** 비상 킬스위치/수동 초기화용 — 모든 ToonStudio 핀·스테이징 캐시를 일괄 삭제한다(사용자 프로젝트 캐시 보존). */
  async purgeAllPinnedCaches(reason: string): Promise<PurgeCachesResult> {
    const purgedCacheNames: string[] = [];
    for (const name of await this.cacheStorage.keys()) {
      if ((name.startsWith(this.cachePrefix) || name.startsWith(this.stagingCachePrefix))
        && (await this.cacheStorage.delete(name).catch(() => false))) {
        purgedCacheNames.push(name);
      }
    }
    this.activeVersionHash = null;
    this.pendingActivationVersion = null;
    this.generationStore?.set(null);
    const result: PurgeCachesResult = { ok: true, reason, purgedCacheNames, purgedAtMs: this.now() };
    this.lastPurge = result;
    return result;
  }

  /** 모든 코어 에셋을 스테이징 캐시에 검증 후 원자적 세대 교체로 고정한다(이미 고정 시 0 네트워크). */
  async pinAll(signal?: AbortSignal): Promise<PinRunResult> { return this.executePin(signal, false); }

  /** 대기 중인 `pendingActivationVersion`을 안전 시점(유휴·저장 완료·사용자 확인)에 원자적으로 활성화한다. */
  async flushPendingActivation(options: { readonly force?: boolean } = {}): Promise<ActivationFlushResult> {
    if (!this.pendingActivationVersion) {
      return { activated: false, reason: "no-pending-activation", activeVersionHash: this.activeVersionHash, pendingActivationVersion: null, prunedCacheNames: [] };
    }
    if (!options.force && !this.isActivationAllowed()) {
      return { activated: false, reason: "unsaved-canvas-edits", activeVersionHash: this.activeVersionHash, pendingActivationVersion: this.pendingActivationVersion, prunedCacheNames: [] };
    }
    if (!(await this.cacheStorage.has(this.stagingCacheName))) {
      // 다른 세션이 이미 완성한 세대는 별도 스테이징이 없어도 대기할 수 있다.
      // 활성화 직전에 다시 무결성을 확인하고 기존 세대는 그때까지 보존한다.
      if (await this.checkAlreadyPinned(undefined, true)) {
        const previousVersion = this.activeVersionHash ?? await this.discoverExistingPinnedVersion();
        this.setActiveVersion(this.versionHash);
        this.pendingActivationVersion = null;
        const prunedCacheNames = await this.pruneStaleCaches();
        if (previousVersion !== this.versionHash) await this.invokeOnActivate(previousVersion);
        return { activated: true, reason: "activated", activeVersionHash: this.activeVersionHash, pendingActivationVersion: null, prunedCacheNames };
      }
      this.pendingActivationVersion = null;
      return { activated: false, reason: "staging-missing", activeVersionHash: this.activeVersionHash, pendingActivationVersion: null, prunedCacheNames: [] };
    }
    const stagingCache = await this.cacheStorage.open(this.stagingCacheName);
    const stagedResponses: Array<{ readonly url: string; readonly response: Response }> = [];
    for (const asset of this.assets) {
      const hit = await stagingCache.match(asset.url);
      if (!hit) {
        await this.cacheStorage.delete(this.stagingCacheName).catch(() => false);
        this.pendingActivationVersion = null;
        return { activated: false, reason: "staging-missing", activeVersionHash: this.activeVersionHash, pendingActivationVersion: null, prunedCacheNames: [] };
      }
      stagedResponses.push({ url: asset.url, response: hit });
    }
    const previousVersion = this.activeVersionHash ?? await this.discoverExistingPinnedVersion();
    try {
      await this.promoteEntriesToActiveCache(stagedResponses);
    } catch (error) {
      await this.cacheStorage.delete(this.cacheName).catch(() => false);
      const quota = isQuotaExceededError(error);
      if (quota) await this.cacheStorage.delete(this.stagingCacheName).catch(() => false);
      return {
        activated: false, reason: quota ? "quota-exceeded" : "cache-write-error",
        activeVersionHash: this.activeVersionHash, pendingActivationVersion: quota ? null : this.pendingActivationVersion,
        prunedCacheNames: [], errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
    await this.cacheStorage.delete(this.stagingCacheName).catch(() => false);
    this.setActiveVersion(this.versionHash);
    this.pendingActivationVersion = null;
    const prunedCacheNames = await this.pruneStaleCaches();
    await this.invokeOnActivate(previousVersion);
    return { activated: true, reason: "activated", activeVersionHash: this.activeVersionHash, pendingActivationVersion: null, prunedCacheNames };
  }

  /** Safari 7일 ITP 또는 OS 캐시 퇴거로 누락·손상된 핀 에셋을 감지하고 백그라운드에서 무음 자가 치유한다. */
  async verifyAndSelfHealPinnedAssets(signal?: AbortSignal): Promise<SelfHealResult> {
    if (this.requestPersistence) await this.requestPersistentStorage();
    const missingUrls: string[] = [];
    const corruptedUrls: string[] = [];
    if (!(await this.cacheStorage.has(this.cacheName))) {
      for (const asset of this.assets) missingUrls.push(asset.url);
    } else {
      const cache = await this.cacheStorage.open(this.cacheName);
      for (const asset of this.assets) {
        const hit = await cache.match(asset.url);
        if (!hit) { missingUrls.push(asset.url); continue; }
        const bytes = new Uint8Array(await hit.arrayBuffer());
        if (await validatePwaAssetPayload(asset, bytes, hit)) corruptedUrls.push(asset.url);
      }
    }
    if (missingUrls.length === 0 && corruptedUrls.length === 0) {
      return { healthy: true, healed: false, missingUrls, corruptedUrls, persistenceStatus: this.persistenceStatus, pinResult: null };
    }
    this.metrics.selfHealAttempts += 1;
    const pinResult = await this.executePin(signal, true);
    if (pinResult.ok) this.metrics.selfHealRecoveries += 1;
    return { healthy: pinResult.ok, healed: pinResult.ok, missingUrls, corruptedUrls, persistenceStatus: this.persistenceStatus, pinResult };
  }

  /** 네트워크 호출 0회로 고정된 오프라인 에셋을 조회한다. */
  async matchPinnedAsset(url: string): Promise<Response | null> { return (await this.resolvePinnedAsset(url)).response; }

  /** 활성 세대 캐시 우선 조회 + 구버전 핀 캐시 폴백(0 네트워크, 스테이징 캐시 절대 미노출). */
  async resolvePinnedAsset(url: string): Promise<MatchPinnedAssetResolution> {
    const primaryName = this.activeVersionHash ? `${this.cachePrefix}${this.activeVersionHash}` : this.cacheName;
    if (await this.cacheStorage.has(primaryName)) {
      const hit = await (await this.cacheStorage.open(primaryName)).match(url);
      if (hit) { this.metrics.offlineHits += 1; return { hit: true, url, response: hit, cacheName: primaryName, source: "active-cache" }; }
    }
    if (this.fallbackToAnyPinnedVersion) {
      for (const name of (await this.cacheStorage.keys()).reverse()) {
        if (name === primaryName || !name.startsWith(this.cachePrefix)) continue;
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
      cacheName: this.cacheName, stagingCacheName: this.stagingCacheName, versionHash: this.versionHash,
      activeVersionHash: this.activeVersionHash, pendingActivationVersion: this.pendingActivationVersion,
      assetCount: this.assets.length, totalNetworkFetchCalls: this.metrics.networkFetchCalls,
      offlineCacheHits: this.metrics.offlineHits, offlineCacheMisses: this.metrics.offlineMisses,
      persistenceStatus: this.persistenceStatus, selfHealAttempts: this.metrics.selfHealAttempts,
      selfHealRecoveries: this.metrics.selfHealRecoveries, lastPurge: this.lastPurge, lastPinResult: this.lastPinResult,
    };
  }

  private async executePin(signal: AbortSignal | undefined, forceRepin: boolean): Promise<PinRunResult> {
    const startedAt = this.now();
    const search = this.urlSearch ?? (globalThis.location as { search?: string } | undefined)?.search ?? "";
    if (!this.urlResetApplied && shouldTriggerEmergencyPurgeFromUrl(search)) {
      this.urlResetApplied = true;
      await this.purgeAllPinnedCaches("url-reset-param");
    }
    const cutoffBlocked = await this.applyEmergencyCutoff(startedAt);
    if (cutoffBlocked) return cutoffBlocked;

    if (this.requestPersistence) await this.requestPersistentStorage();
    if (!forceRepin) {
      const existing = await this.checkAlreadyPinned(signal);
      if (existing) {
        this.activeVersionHash ??= await this.discoverExistingPinnedVersion();
        if (!this.isActivationAllowed()) {
          this.pendingActivationVersion = this.versionHash;
          return this.finishPin(true, "staged-pending-activation", existing.records, [], [], 0, existing.records.length, existing.totalBytes, startedAt, true, false);
        }
        const previousVersion = this.activeVersionHash;
        this.setActiveVersion(this.versionHash);
        this.pendingActivationVersion = null;
        const pruned = await this.pruneStaleCaches();
        if (previousVersion !== this.versionHash) await this.invokeOnActivate(previousVersion);
        return this.finishPin(true, "already-pinned", existing.records, [], pruned, 0, existing.records.length, existing.totalBytes, startedAt, false, false);
      }
    }

    const effectiveQuotaCeiling = await this.computeEffectiveQuotaCeiling();
    const minDeclaredBytes = this.assets.reduce((sum, a) => sum + Math.max(a.expectedByteLength ?? 0, a.minBytes ?? 0), 0);
    if (effectiveQuotaCeiling <= 0 || minDeclaredBytes > effectiveQuotaCeiling) {
      await this.pruneStagingCaches();
      return this.finishPin(false, "quota-exceeded", [], [{
        url: this.stagingCacheName, kind: "other", reason: "quota-exceeded",
        message: `저장소 쿼터 상한(${effectiveQuotaCeiling}B)을 초과해 피닝을 안전 중단했습니다.`,
      }], [], 0, 0, 0, startedAt, false, true);
    }

    await this.cacheStorage.delete(this.stagingCacheName).catch(() => false);
    const stagedRecords: PinnedAssetRecord[] = [];
    const stagedResponses: Array<{ readonly url: string; readonly response: Response }> = [];
    const failures: PinAssetFailure[] = [];
    let fetchCalls = 0;
    let totalBytes = 0;
    let quotaExceeded = false;
    let purgedByKillSwitch = false;
    let stagingCache: PinCacheLike | null = null;

    for (const asset of this.assets) {
      if (signal?.aborted) { failures.push({ url: asset.url, kind: asset.kind, reason: "aborted", message: "피닝이 취소되었습니다." }); break; }
      fetchCalls += 1;
      this.metrics.networkFetchCalls += 1;
      const fetched = await this.fetchAndValidate(asset, signal);
      if ("killSwitchReason" in fetched) {
        await this.purgeAllPinnedCaches(fetched.killSwitchReason);
        purgedByKillSwitch = true;
        failures.push({ url: asset.url, kind: asset.kind, reason: "kill-switch-purged", message: `서버 킬스위치(${fetched.killSwitchReason})로 캐시를 퍼지했습니다.` });
        break;
      }
      if ("reason" in fetched) { failures.push(fetched); break; }
      if (totalBytes + fetched.bytes.byteLength > effectiveQuotaCeiling) {
        quotaExceeded = true;
        failures.push({ url: asset.url, kind: asset.kind, reason: "quota-exceeded", message: `누적 피닝 크기(${totalBytes + fetched.bytes.byteLength}B)가 허용 상한(${effectiveQuotaCeiling}B)을 초과합니다.` });
        break;
      }
      try {
        stagingCache ??= await this.cacheStorage.open(this.stagingCacheName);
        const headers = new Headers(fetched.response.headers);
        headers.set("x-toonstudio-pin-version", this.versionHash);
        const stagedResp = new Response(new Uint8Array(fetched.bytes), { status: fetched.response.status, statusText: fetched.response.statusText, headers });
        await stagingCache.put(asset.url, stagedResp.clone());
        stagedResponses.push({ url: asset.url, response: stagedResp });
        stagedRecords.push({ url: asset.url, kind: asset.kind, byteLength: fetched.bytes.byteLength, source: "network" });
        totalBytes += fetched.bytes.byteLength;
      } catch (error) {
        quotaExceeded = isQuotaExceededError(error);
        failures.push({ url: asset.url, kind: asset.kind, reason: quotaExceeded ? "quota-exceeded" : "cache-write-error", message: error instanceof Error ? error.message : String(error) });
        break;
      }
    }

    if (failures.length > 0 || stagedRecords.length !== this.assets.length) {
      await this.cacheStorage.delete(this.stagingCacheName).catch(() => false);
      if (quotaExceeded) await this.pruneStagingCaches();
      const status: PinRunResult["status"] = purgedByKillSwitch ? "purged" : quotaExceeded ? "quota-exceeded" : failures.some((f) => f.reason === "aborted") ? "aborted" : "failed";
      return this.finishPin(false, status, [], failures, [], fetchCalls, 0, 0, startedAt, false, quotaExceeded);
    }

    if (!this.isActivationAllowed()) {
      this.activeVersionHash ??= await this.discoverExistingPinnedVersion();
      this.pendingActivationVersion = this.versionHash;
      return this.finishPin(true, "staged-pending-activation", stagedRecords, [], [], fetchCalls, 0, totalBytes, startedAt, true, false);
    }

    const previousVersion = this.activeVersionHash ?? await this.discoverExistingPinnedVersion();
    try {
      await this.promoteEntriesToActiveCache(stagedResponses);
    } catch (error) {
      const quota = isQuotaExceededError(error);
      await this.cacheStorage.delete(this.cacheName).catch(() => false);
      await this.cacheStorage.delete(this.stagingCacheName).catch(() => false);
      if (quota) await this.pruneStagingCaches();
      return this.finishPin(false, quota ? "quota-exceeded" : "failed", [], [{
        url: this.cacheName, kind: "other", reason: quota ? "quota-exceeded" : "cache-write-error",
        message: error instanceof Error ? error.message : String(error),
      }], [], fetchCalls, 0, 0, startedAt, false, quota);
    }

    await this.cacheStorage.delete(this.stagingCacheName).catch(() => false);
    this.setActiveVersion(this.versionHash);
    this.pendingActivationVersion = null;
    const pruned = await this.pruneStaleCaches();
    await this.invokeOnActivate(previousVersion);
    return this.finishPin(true, "pinned", stagedRecords, [], pruned, fetchCalls, 0, totalBytes, startedAt, false, false);
  }

  private async promoteEntriesToActiveCache(entries: readonly { readonly url: string; readonly response: Response }[]): Promise<void> {
    const targetCache = await this.cacheStorage.open(this.cacheName);
    for (const entry of entries) await targetCache.put(entry.url, entry.response.clone());
  }

  private async applyEmergencyCutoff(startedAt: number): Promise<PinRunResult | null> {
    if (!this.emergencyPurgeBefore) return null;
    const cutoff = this.emergencyPurgeBefore;
    if (compareVersionCutoff(this.versionHash, cutoff) < 0) {
      const purged = await this.purgeAllPinnedCaches(`emergency-purge-before:${cutoff}`);
      return this.finishPin(false, "purged", [], [{
        url: this.cacheName, kind: "other", reason: "kill-switch-purged",
        message: `현재 버전(${this.versionHash})이 비상 퍼지 기준(${cutoff}) 미만이라 차단되었습니다.`,
      }], purged.purgedCacheNames, 0, 0, 0, startedAt, false, false);
    }
    const purgedNames: string[] = [];
    for (const name of await this.cacheStorage.keys()) {
      const version = name.startsWith(this.cachePrefix) ? name.slice(this.cachePrefix.length)
        : name.startsWith(this.stagingCachePrefix) ? name.slice(this.stagingCachePrefix.length) : null;
      if (version && compareVersionCutoff(version, cutoff) < 0 && (await this.cacheStorage.delete(name).catch(() => false))) purgedNames.push(name);
    }
    if (purgedNames.length > 0) {
      if (this.activeVersionHash && compareVersionCutoff(this.activeVersionHash, cutoff) < 0) this.setActiveVersion(null);
      this.lastPurge = { ok: true, reason: `emergency-purge-before:${cutoff}`, purgedCacheNames: purgedNames, purgedAtMs: this.now() };
    }
    return null;
  }

  private async computeEffectiveQuotaCeiling(): Promise<number> {
    if (!this.storageManager?.estimate) return this.maxPinBytes;
    try {
      const est = await this.storageManager.estimate();
      if (typeof est.quota !== "number" || !Number.isFinite(est.quota) || est.quota <= 0) return this.maxPinBytes;
      const usage = typeof est.usage === "number" && Number.isFinite(est.usage) && est.usage > 0 ? est.usage : 0;
      return Math.min(this.maxPinBytes, Math.floor(Math.max(0, est.quota - usage) * this.maxQuotaFraction));
    } catch { return this.maxPinBytes; }
  }

  private isActivationAllowed(): boolean {
    if (this.unsavedCanvasEditsOverride || this.hasUnsavedCanvasEdits?.() === true) return false;
    return this.canActivateNow?.() !== false;
  }

  private setActiveVersion(version: string | null): void { this.activeVersionHash = version; this.generationStore?.set(version); }

  private async discoverExistingPinnedVersion(): Promise<string | null> {
    const names = (await this.cacheStorage.keys()).filter((n) => n.startsWith(this.cachePrefix) && n !== this.cacheName);
    const last = names.length > 0 ? names[names.length - 1] : undefined;
    return last ? last.slice(this.cachePrefix.length) : null;
  }

  private async invokeOnActivate(previousVersionHash: string | null): Promise<void> {
    if (!this.onActivate) return;
    try { await this.onActivate({ versionHash: this.versionHash, cacheName: this.cacheName, previousVersionHash }); }
    catch { /* 활성화 콜백 오류로 앱 부팅이나 피닝 완료 상태를 깨뜨리지 않는다. */ }
  }

  private async fetchAndValidate(asset: PwaBaseAssetDescriptor, signal?: AbortSignal): Promise<FetchValidationOutcome> {
    try {
      const response = await this.fetchFn(asset.url, { ...this.requestInit, signal });
      const killDirective = extractKillSwitchFromHeaders(response.headers);
      if (killDirective.purgeAll) return { killSwitchReason: killDirective.reason ?? "server-kill-switch", asset };
      if (killDirective.purgeBefore && compareVersionCutoff(this.versionHash, killDirective.purgeBefore) < 0) {
        return { killSwitchReason: killDirective.reason ?? `server-purge-before:${killDirective.purgeBefore}`, asset };
      }
      if (response.status !== 200) {
        return { url: asset.url, kind: asset.kind, reason: "http-error", httpStatus: response.status, message: `HTTP ${response.status} 응답 오류(HTTP 200 필수).` };
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      return (await validatePwaAssetPayload(asset, bytes, response)) ?? { asset, bytes, response };
    } catch (error) {
      const isAbort = signal?.aborted || (error instanceof Error && error.name === "AbortError");
      return { url: asset.url, kind: asset.kind, reason: isAbort ? "aborted" : "network-error", message: error instanceof Error ? error.message : String(error) };
    }
  }

  private finishPin(
    ok: boolean, status: PinRunResult["status"], pinnedAssets: readonly PinnedAssetRecord[],
    failures: readonly PinAssetFailure[], prunedCacheNames: readonly string[],
    fetchCalls: number, cacheHits: number, totalBytes: number, startedAt: number,
    activationDeferred: boolean, quotaExceeded: boolean,
  ): PinRunResult {
    const result: PinRunResult = {
      ok, status, cacheName: this.cacheName, stagingCacheName: this.stagingCacheName,
      versionHash: this.versionHash, activeVersionHash: this.activeVersionHash,
      pendingActivationVersion: this.pendingActivationVersion, activationDeferred,
      quotaExceeded, persistenceStatus: this.persistenceStatus,
      pinnedAssets, failures, prunedCacheNames, fetchCalls, cacheHits, totalBytes,
      durationMs: Math.max(0, this.now() - startedAt),
    };
    this.lastPinResult = result;
    return result;
  }

  private async checkAlreadyPinned(signal?: AbortSignal, verifyIntegrity = this.verifyCachedIntegrityOnRecheck): Promise<{ records: PinnedAssetRecord[]; totalBytes: number } | null> {
    if (signal?.aborted || !(await this.cacheStorage.has(this.cacheName))) return null;
    const cache = await this.cacheStorage.open(this.cacheName);
    const records: PinnedAssetRecord[] = [];
    let totalBytes = 0;
    for (const asset of this.assets) {
      if (signal?.aborted) return null;
      const hit = await cache.match(asset.url);
      if (!hit) return null;
      const bytes = new Uint8Array(await hit.arrayBuffer());
      if (verifyIntegrity && (await validatePwaAssetPayload(asset, bytes, hit))) return null;
      records.push({ url: asset.url, kind: asset.kind, byteLength: bytes.byteLength, source: "cache" });
      totalBytes += bytes.byteLength;
    }
    return { records, totalBytes };
  }

  private async pruneStagingCaches(): Promise<string[]> {
    const pruned: string[] = [];
    for (const name of await this.cacheStorage.keys()) {
      if (name.startsWith(this.stagingCachePrefix) && (await this.cacheStorage.delete(name).catch(() => false))) pruned.push(name);
    }
    return pruned;
  }

  private async pruneStaleCaches(): Promise<string[]> {
    const pruned: string[] = [];
    for (const name of await this.cacheStorage.keys()) {
      const isOldPinned = name !== this.cacheName && name.startsWith(this.cachePrefix);
      const isOrphanStaging = name.startsWith(this.stagingCachePrefix)
        && !(this.pendingActivationVersion && name === `${this.stagingCachePrefix}${this.pendingActivationVersion}`);
      if ((isOldPinned || isOrphanStaging) && (await this.cacheStorage.delete(name).catch(() => false))) pruned.push(name);
    }
    return pruned;
  }
}
