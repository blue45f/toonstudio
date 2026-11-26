/**
 * 3-Tier ₩0 클라이언트 우선 AI 라우터 (On-Device 0-Token Edge Optimizer).
 * - Tier 0A: 오프라인 256차원 코사인 시맨틱 카탈로그 검색 (`catalog-semantic-index-256d.json`, 0 네트워크, 0 토큰)
 * - Tier 0B: 브라우저 내장 온디바이스 AI (`LanguageModel` / `ai.languageModel` / `Translator`, 0 서버 호출, 0 클라우드 토큰)
 * - Tier 1: 서버 9-Pool 무료 AI 가중 라우터 (1,470 req/day 무료 클라우드, ₩0)
 * - Tier 2: 사용자 본인 키 (BYOK, 명시적 옵트인 시에만 폴백)
 */
import {
  DEFAULT_ONDEVICE_INVOKE_TIMEOUT_MS,
  DEFAULT_PROBE_TIMEOUT_MS,
  invokeOnDevicePrompt,
  invokeOnDeviceTranslator,
  probeOnDeviceAiCapabilities,
  type BrowserBuiltInAiGlobal,
  type BrowserLanguageModelApi,
  type BrowserLanguageModelSession,
  type BrowserTranslatorApi,
  type BrowserTranslatorInstance,
  type OnDeviceAiCapabilities,
  type OnDeviceApiStatus,
  type PromptApiSurface,
  type TranslatorApiSurface,
} from "./browser-ondevice-ai-probe";
import {
  cosineSimilarity256,
  DEFAULT_SEMANTIC_INDEX_FILENAME,
  dotProduct256,
  l2NormalizeVector256,
  OfflineSemanticCatalogIndex,
  SEMANTIC_VECTOR_DIM,
  type CatalogSemanticIndex256d,
  type CatalogSemanticIndexEntry,
  type SemanticCatalogMatch,
  type SemanticSearchOptions,
} from "./semantic-cosine-index";

export {
  cosineSimilarity256,
  DEFAULT_ONDEVICE_INVOKE_TIMEOUT_MS,
  DEFAULT_PROBE_TIMEOUT_MS,
  DEFAULT_SEMANTIC_INDEX_FILENAME,
  dotProduct256,
  l2NormalizeVector256,
  OfflineSemanticCatalogIndex,
  probeOnDeviceAiCapabilities,
  SEMANTIC_VECTOR_DIM,
  type BrowserBuiltInAiGlobal,
  type BrowserLanguageModelApi,
  type BrowserLanguageModelSession,
  type BrowserTranslatorApi,
  type BrowserTranslatorInstance,
  type CatalogSemanticIndex256d,
  type CatalogSemanticIndexEntry,
  type OnDeviceAiCapabilities,
  type OnDeviceApiStatus,
  type PromptApiSurface,
  type SemanticCatalogMatch,
  type SemanticSearchOptions,
  type TranslatorApiSurface,
};

export const SERVER_FREE_9POOL_DAILY_CAPACITY = 1_470;
export const DEFAULT_SEMANTIC_HIT_MIN_SCORE = 0.72;

export type ZeroTokenExecutionTier =
  | "tier-0a-offline-semantic"
  | "tier-0b-browser-ondevice"
  | "tier-1-server-free-9pool"
  | "tier-2-user-byok";

export interface ZeroTokenRouteRequest {
  readonly task: "semantic-search" | "prompt" | "translate";
  readonly prompt: string;
  readonly systemPrompt?: string;
  readonly queryVector?: readonly number[] | Float32Array;
  readonly semanticOptions?: SemanticSearchOptions;
  readonly sourceLanguage?: string;
  readonly targetLanguage?: string;
  readonly estimatedCloudTokens?: number;
  readonly preferServer?: boolean;
  readonly allowByokFallback?: boolean;
}

export interface RemoteTierAdapterResponse {
  readonly ok: boolean;
  readonly content: string;
  readonly providerLabel: string;
  readonly cloudTokensUsed?: number;
  readonly errorCode?: string;
}

export type RemoteTierAdapter = (request: ZeroTokenRouteRequest) => Promise<RemoteTierAdapterResponse>;

export interface ZeroTokenRouteAttempt {
  readonly tier: ZeroTokenExecutionTier;
  readonly outcome: "succeeded" | "skipped" | "failed-over";
  readonly reason: string;
}

export interface ZeroTokenRouteResult {
  readonly ok: boolean;
  readonly tier: ZeroTokenExecutionTier | "none";
  readonly networkCallsMade: 0 | 1;
  readonly cloudTokensUsed: number;
  readonly estimatedTokensSaved: number;
  readonly platformCostUsd: 0;
  readonly paidServerBillingBlocked: true;
  readonly content: string;
  readonly semanticMatches?: readonly SemanticCatalogMatch[];
  readonly providerLabel: string;
  readonly latencyMs: number;
  readonly attempts: readonly ZeroTokenRouteAttempt[];
  readonly errorCode?: string;
}

export interface OnDeviceZeroTokenTelemetry {
  readonly totalRequests: number;
  readonly tierHits: {
    readonly tier0aOfflineSemantic: number;
    readonly tier0bBrowserOndevice: number;
    readonly tier1ServerFree9Pool: number;
    readonly tier2UserByok: number;
    readonly unresolved: number;
  };
  readonly zeroNetworkRequests: number;
  readonly zeroTokenRequests: number;
  readonly zeroTokenRatio: number;
  readonly estimatedCloudTokensSaved: number;
  readonly estimatedCloudRequestsSaved: number;
  readonly onDeviceFallbacks: number;
  readonly serverFreePoolDailyCapacity: number;
  readonly platformCostUsd: 0;
  readonly lastCapabilities: OnDeviceAiCapabilities | null;
}

export interface OnDeviceZeroTokenRouterOptions {
  readonly globalObject?: BrowserBuiltInAiGlobal;
  readonly semanticIndex?: OfflineSemanticCatalogIndex | CatalogSemanticIndex256d;
  readonly serverFreeAdapter?: RemoteTierAdapter;
  readonly userByokAdapter?: RemoteTierAdapter;
  readonly probeTimeoutMs?: number;
  readonly invokeTimeoutMs?: number;
  readonly semanticHitMinScore?: number;
  readonly now?: () => number;
}

function estimateTokensAvoided(request: ZeroTokenRouteRequest): number {
  if (request.estimatedCloudTokens !== undefined && Number.isFinite(request.estimatedCloudTokens)) {
    return Math.max(0, Math.trunc(request.estimatedCloudTokens));
  }
  return Math.max(64, Math.ceil(((request.systemPrompt?.length ?? 0) + request.prompt.length) / 2) + 120);
}

export class OnDeviceZeroTokenRouter {
  private readonly globalObject: BrowserBuiltInAiGlobal;
  private semanticIndex: OfflineSemanticCatalogIndex | null;
  private readonly serverFreeAdapter?: RemoteTierAdapter;
  private readonly userByokAdapter?: RemoteTierAdapter;
  private readonly probeTimeoutMs: number;
  private readonly invokeTimeoutMs: number;
  private readonly semanticHitMinScore: number;
  private readonly now: () => number;
  private lastCapabilities: OnDeviceAiCapabilities | null = null;
  private telemetry = {
    totalRequests: 0,
    tier0aOfflineSemantic: 0,
    tier0bBrowserOndevice: 0,
    tier1ServerFree9Pool: 0,
    tier2UserByok: 0,
    unresolved: 0,
    estimatedCloudTokensSaved: 0,
    onDeviceFallbacks: 0,
  };

  constructor(options: OnDeviceZeroTokenRouterOptions = {}) {
    this.globalObject = options.globalObject ?? (globalThis as unknown as BrowserBuiltInAiGlobal);
    this.semanticIndex = !options.semanticIndex
      ? null
      : options.semanticIndex instanceof OfflineSemanticCatalogIndex
        ? options.semanticIndex
        : new OfflineSemanticCatalogIndex(options.semanticIndex);
    this.serverFreeAdapter = options.serverFreeAdapter;
    this.userByokAdapter = options.userByokAdapter;
    this.probeTimeoutMs = Math.max(20, Math.trunc(options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS));
    this.invokeTimeoutMs = Math.max(50, Math.trunc(options.invokeTimeoutMs ?? DEFAULT_ONDEVICE_INVOKE_TIMEOUT_MS));
    this.semanticHitMinScore = options.semanticHitMinScore ?? DEFAULT_SEMANTIC_HIT_MIN_SCORE;
    this.now = options.now ?? (() => Date.now());
  }

  mountSemanticIndex(index: OfflineSemanticCatalogIndex | CatalogSemanticIndex256d): void {
    this.semanticIndex = index instanceof OfflineSemanticCatalogIndex ? index : new OfflineSemanticCatalogIndex(index);
  }

  async probeCapabilities(sourceLanguage = "ko", targetLanguage = "en"): Promise<OnDeviceAiCapabilities> {
    this.lastCapabilities = await probeOnDeviceAiCapabilities({
      globalObject: this.globalObject,
      probeTimeoutMs: this.probeTimeoutMs,
      sourceLanguage,
      targetLanguage,
      now: this.now,
    });
    return this.lastCapabilities;
  }

  async route(request: ZeroTokenRouteRequest): Promise<ZeroTokenRouteResult> {
    const startedAt = this.now();
    this.telemetry.totalRequests += 1;
    const attempts: ZeroTokenRouteAttempt[] = [];
    const tokensSaved = estimateTokensAvoided(request);

    // Tier 0A: 오프라인 256차원 코사인 시맨틱 카탈로그 검색 (0 네트워크, 0 토큰)
    if (request.queryVector && this.semanticIndex) {
      const minScore = request.semanticOptions?.minScore ?? this.semanticHitMinScore;
      const matches = this.semanticIndex.search(request.queryVector, { ...request.semanticOptions, minScore });
      if (matches.length > 0) {
        this.telemetry.tier0aOfflineSemantic += 1;
        this.telemetry.estimatedCloudTokensSaved += tokensSaved;
        attempts.push({ tier: "tier-0a-offline-semantic", outcome: "succeeded", reason: `top_score_${matches[0].score}` });
        return {
          ok: true, tier: "tier-0a-offline-semantic", networkCallsMade: 0, cloudTokensUsed: 0,
          estimatedTokensSaved: tokensSaved, platformCostUsd: 0, paidServerBillingBlocked: true,
          content: JSON.stringify(matches), semanticMatches: matches,
          providerLabel: `offline:${DEFAULT_SEMANTIC_INDEX_FILENAME}`,
          latencyMs: Math.max(0, this.now() - startedAt), attempts,
        };
      }
      attempts.push({ tier: "tier-0a-offline-semantic", outcome: "failed-over", reason: "semantic_below_threshold" });
    } else {
      attempts.push({ tier: "tier-0a-offline-semantic", outcome: "skipped", reason: request.queryVector ? "semantic_index_not_loaded" : "no_query_vector" });
    }

    // Tier 0B: 브라우저 내장 온디바이스 AI (0 서버 호출, 0 클라우드 토큰)
    if (!request.preferServer && request.task !== "semantic-search") {
      const src = request.sourceLanguage ?? "ko";
      const tgt = request.targetLanguage ?? "en";
      const caps = await this.probeCapabilities(src, tgt);
      const onDevice = request.task === "translate"
        ? (caps.translatorReady
            ? await invokeOnDeviceTranslator({ globalObject: this.globalObject, text: request.prompt, sourceLanguage: src, targetLanguage: tgt, invokeTimeoutMs: this.invokeTimeoutMs })
            : { ok: false as const, reason: `translator_${caps.translatorStatus}` })
        : (caps.promptApiReady
            ? await invokeOnDevicePrompt({ globalObject: this.globalObject, prompt: request.prompt, systemPrompt: request.systemPrompt, invokeTimeoutMs: this.invokeTimeoutMs })
            : { ok: false as const, reason: `prompt_api_${caps.promptApiStatus}` });

      if (onDevice.ok) {
        this.telemetry.tier0bBrowserOndevice += 1;
        this.telemetry.estimatedCloudTokensSaved += tokensSaved;
        attempts.push({ tier: "tier-0b-browser-ondevice", outcome: "succeeded", reason: "ok" });
        return {
          ok: true, tier: "tier-0b-browser-ondevice", networkCallsMade: 0, cloudTokensUsed: 0,
          estimatedTokensSaved: tokensSaved, platformCostUsd: 0, paidServerBillingBlocked: true,
          content: onDevice.content, providerLabel: onDevice.label,
          latencyMs: Math.max(0, this.now() - startedAt), attempts,
        };
      }
      this.telemetry.onDeviceFallbacks += 1;
      attempts.push({ tier: "tier-0b-browser-ondevice", outcome: "failed-over", reason: onDevice.reason });
    } else {
      attempts.push({ tier: "tier-0b-browser-ondevice", outcome: "skipped", reason: request.preferServer ? "prefer_server_requested" : "semantic_only_task" });
    }

    // Tier 1: 서버 9-Pool 무료 AI 가중 라우터 (1,470 req/day 무료 클라우드)
    const tier1 = await this.tryRemoteTier("tier-1-server-free-9pool", this.serverFreeAdapter, request, "server_adapter_not_configured", startedAt, attempts);
    if (tier1) {
      this.telemetry.tier1ServerFree9Pool += 1;
      return tier1;
    }

    // Tier 2: 사용자 본인 키 (BYOK, 명시적 옵트인 시에만)
    if (request.allowByokFallback === true) {
      const tier2 = await this.tryRemoteTier("tier-2-user-byok", this.userByokAdapter, request, "byok_adapter_not_configured", startedAt, attempts);
      if (tier2) {
        this.telemetry.tier2UserByok += 1;
        return tier2;
      }
    } else {
      attempts.push({ tier: "tier-2-user-byok", outcome: "skipped", reason: "byok_not_enabled" });
    }

    this.telemetry.unresolved += 1;
    return {
      ok: false, tier: "none", networkCallsMade: 0, cloudTokensUsed: 0, estimatedTokensSaved: 0,
      platformCostUsd: 0, paidServerBillingBlocked: true, content: "", providerLabel: "none",
      latencyMs: Math.max(0, this.now() - startedAt), attempts, errorCode: "ALL_ZERO_COST_TIERS_UNAVAILABLE",
    };
  }

  private async tryRemoteTier(
    tier: "tier-1-server-free-9pool" | "tier-2-user-byok",
    adapter: RemoteTierAdapter | undefined,
    request: ZeroTokenRouteRequest,
    missingReason: string,
    startedAt: number,
    attempts: ZeroTokenRouteAttempt[],
  ): Promise<ZeroTokenRouteResult | null> {
    if (!adapter) {
      attempts.push({ tier, outcome: "skipped", reason: missingReason });
      return null;
    }
    try {
      const res = await adapter(request);
      if (res.ok) {
        attempts.push({ tier, outcome: "succeeded", reason: "ok" });
        return {
          ok: true, tier, networkCallsMade: 1, cloudTokensUsed: res.cloudTokensUsed ?? 0,
          estimatedTokensSaved: 0, platformCostUsd: 0, paidServerBillingBlocked: true,
          content: res.content, providerLabel: res.providerLabel,
          latencyMs: Math.max(0, this.now() - startedAt), attempts,
        };
      }
      attempts.push({ tier, outcome: "failed-over", reason: res.errorCode ?? `${tier}_failed` });
      return null;
    } catch {
      attempts.push({ tier, outcome: "failed-over", reason: `${tier}_exception` });
      return null;
    }
  }

  getTelemetry(): OnDeviceZeroTokenTelemetry {
    const zeroToken = this.telemetry.tier0aOfflineSemantic + this.telemetry.tier0bBrowserOndevice;
    return {
      totalRequests: this.telemetry.totalRequests,
      tierHits: {
        tier0aOfflineSemantic: this.telemetry.tier0aOfflineSemantic,
        tier0bBrowserOndevice: this.telemetry.tier0bBrowserOndevice,
        tier1ServerFree9Pool: this.telemetry.tier1ServerFree9Pool,
        tier2UserByok: this.telemetry.tier2UserByok,
        unresolved: this.telemetry.unresolved,
      },
      zeroNetworkRequests: zeroToken,
      zeroTokenRequests: zeroToken,
      zeroTokenRatio: this.telemetry.totalRequests > 0 ? Number((zeroToken / this.telemetry.totalRequests).toFixed(4)) : 0,
      estimatedCloudTokensSaved: this.telemetry.estimatedCloudTokensSaved,
      estimatedCloudRequestsSaved: zeroToken,
      onDeviceFallbacks: this.telemetry.onDeviceFallbacks,
      serverFreePoolDailyCapacity: SERVER_FREE_9POOL_DAILY_CAPACITY,
      platformCostUsd: 0,
      lastCapabilities: this.lastCapabilities,
    };
  }
}
