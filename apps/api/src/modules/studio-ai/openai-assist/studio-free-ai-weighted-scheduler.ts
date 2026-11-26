import { createHash } from "node:crypto";

import {
  isFreeModelWhitelisted,
  nextUtcMidnightMs,
  ZERO_BILL_FREE_PROVIDER_ORDER,
  type ZeroBillFreeProviderId,
  type ZeroBillProviderQuotaStatus,
} from "./studio-free-ai-provider-catalog";
import { redactCreatorSensitiveText } from "./studio-openai-guardrails";

export const FREE_AI_CLOUD_PROVIDER_IDS: readonly ZeroBillFreeProviderId[] =
  ZERO_BILL_FREE_PROVIDER_ORDER.filter((id) => id !== "local-zero-cost-fallback");
export const SCHEDULER_QUOTA_WEIGHT = 0.65;
export const SCHEDULER_SPEED_WEIGHT = 0.35;
export const DEFAULT_MIN_LATENCY_MS = 200;
export const DEFAULT_MAX_LATENCY_MS = 6_000;
export const DEFAULT_COLD_START_LATENCY_MS = 1_200;
export const DEFAULT_EWMA_ALPHA = 0.3;
export const DEFAULT_BASE_COOLDOWN_MS = 15_000;
export const DEFAULT_MAX_COOLDOWN_MS = 900_000;
const HALF_OPEN_PROBE_TIMEOUT_MS = 60_000;
const ZERO_BILL_SEAL = { costGuaranteedZeroUsd: 0, paidBillingBlocked: true } as const;

export interface ZeroBillSeal { readonly costGuaranteedZeroUsd: 0; readonly paidBillingBlocked: true }
export type CircuitBreakerState = "closed" | "open" | "half-open";
export type WeightedProviderInput = Pick<
  ZeroBillProviderQuotaStatus,
  | "id" | "tier" | "configured" | "model" | "modelAllowed" | "blocked" | "priority"
  | "safeRequestCutoff" | "remainingSafeRequests" | "safeTokenCutoff" | "remainingSafeTokens"
>;

export interface WeightedSchedulerOptions {
  readonly minLatencyMs?: number; readonly maxLatencyMs?: number; readonly defaultLatencyMs?: number;
  readonly ewmaAlpha?: number; readonly baseCooldownMs?: number; readonly maxCooldownMs?: number;
  readonly halfOpenWeightFactor?: number;
}

export interface ProviderFailureReport {
  readonly httpStatus: number | null; readonly retryAfterMs?: number;
  readonly hardBlockUntilUtcMidnight?: boolean; readonly nowMs?: number;
}

export interface WeightedProviderScore extends ZeroBillSeal {
  readonly providerId: ZeroBillFreeProviderId; readonly tier: "cloud-free" | "local-fallback";
  readonly remainingQuotaRatio: number; readonly normalizedSpeedScore: number;
  readonly ewmaLatencyMs: number; readonly healthScore: number;
  readonly circuitState: CircuitBreakerState; readonly consecutiveFailures: number;
  readonly cooldownUntilUtc: string | null; readonly eligible: boolean;
  readonly skipReason: string | null; readonly totalDispatches: number;
}

export interface WeightedExecutionPlan extends ZeroBillSeal {
  readonly selectedProviderId: ZeroBillFreeProviderId;
  readonly orderedProviderIds: readonly ZeroBillFreeProviderId[];
  readonly healthyCloudCount: number; readonly circuitOpenCount: number;
  readonly scores: readonly WeightedProviderScore[];
  readonly skipped: readonly { readonly providerId: ZeroBillFreeProviderId; readonly reason: string }[];
}

interface ProviderRuntimeState {
  ewmaLatencyMs: number; circuitState: CircuitBreakerState; consecutiveFailures: number;
  cooldownUntilMs: number | null; hardBlockedUntilMs: number | null;
  halfOpenProbeInFlight: boolean; halfOpenProbeStartedAtMs: number | null;
  currentWeight: number; totalDispatches: number;
}

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

export function computeRemainingQuotaRatio(provider: WeightedProviderInput): number {
  if (provider.tier === "local-fallback") return 1;
  const req = provider.safeRequestCutoff > 0 ? clamp01(provider.remainingSafeRequests / provider.safeRequestCutoff) : 0;
  const tok = provider.safeTokenCutoff > 0 ? clamp01(provider.remainingSafeTokens / provider.safeTokenCutoff) : 1;
  return Math.min(req, tok);
}

export function computeNormalizedSpeedScore(
  latencyMs: number,
  minLatencyMs = DEFAULT_MIN_LATENCY_MS,
  maxLatencyMs = DEFAULT_MAX_LATENCY_MS,
): number {
  if (!Number.isFinite(latencyMs)) return 0;
  return clamp01(1 - (latencyMs - minLatencyMs) / Math.max(1, maxLatencyMs - minLatencyMs));
}

export function computeProviderHealthScore(remainingQuotaRatio: number, normalizedSpeedScore: number): number {
  return Number((SCHEDULER_QUOTA_WEIGHT * clamp01(remainingQuotaRatio) + SCHEDULER_SPEED_WEIGHT * clamp01(normalizedSpeedScore)).toFixed(6));
}

/**
 * 9-Pool 무료 AI 할당량·지연시간 가중 분산 스케줄러 (₩0 Fail-Closed).
 * 건강 점수(`0.65 * remainingQuotaRatio + 0.35 * normalizedSpeedScore`) 기반 Smooth Weighted Round-Robin으로
 * 1번 공급자 편중 소진을 막고, 429/5xx 장애는 지수 백오프 서킷 브레이커와 Half-Open 프로브로 격리·복구한다.
 */
export class StudioFreeAiWeightedScheduler {
  private readonly states = new Map<ZeroBillFreeProviderId, ProviderRuntimeState>();
  private readonly cfg: Required<WeightedSchedulerOptions>;

  constructor(options: WeightedSchedulerOptions = {}) {
    const minLatencyMs = Math.max(1, options.minLatencyMs ?? DEFAULT_MIN_LATENCY_MS);
    const baseCooldownMs = Math.max(50, options.baseCooldownMs ?? DEFAULT_BASE_COOLDOWN_MS);
    this.cfg = {
      minLatencyMs, maxLatencyMs: Math.max(minLatencyMs + 1, options.maxLatencyMs ?? DEFAULT_MAX_LATENCY_MS),
      defaultLatencyMs: Math.max(1, options.defaultLatencyMs ?? DEFAULT_COLD_START_LATENCY_MS),
      ewmaAlpha: Math.min(1, Math.max(0.05, options.ewmaAlpha ?? DEFAULT_EWMA_ALPHA)),
      baseCooldownMs, maxCooldownMs: Math.max(baseCooldownMs, options.maxCooldownMs ?? DEFAULT_MAX_COOLDOWN_MS),
      halfOpenWeightFactor: Math.min(1, Math.max(0.1, options.halfOpenWeightFactor ?? 0.5)),
    };
  }

  private getState(id: ZeroBillFreeProviderId): ProviderRuntimeState {
    let state = this.states.get(id);
    if (!state) {
      state = {
        ewmaLatencyMs: this.cfg.defaultLatencyMs, circuitState: "closed", consecutiveFailures: 0,
        cooldownUntilMs: null, hardBlockedUntilMs: null, halfOpenProbeInFlight: false,
        halfOpenProbeStartedAtMs: null, currentWeight: 0, totalDispatches: 0,
      };
      this.states.set(id, state);
    }
    return state;
  }

  private resolveCircuit(state: ProviderRuntimeState, nowMs: number): CircuitBreakerState {
    if (state.hardBlockedUntilMs !== null) {
      if (nowMs < state.hardBlockedUntilMs) return "open";
      state.hardBlockedUntilMs = null;
      state.circuitState = "closed";
      state.consecutiveFailures = 0;
    }
    if (state.circuitState === "open") {
      return state.cooldownUntilMs !== null && nowMs < state.cooldownUntilMs ? "open" : "half-open";
    }
    if (
      state.circuitState === "half-open" && state.halfOpenProbeInFlight &&
      state.halfOpenProbeStartedAtMs !== null && nowMs - state.halfOpenProbeStartedAtMs >= HALF_OPEN_PROBE_TIMEOUT_MS
    ) {
      state.halfOpenProbeInFlight = false;
      state.halfOpenProbeStartedAtMs = null;
    }
    return state.circuitState;
  }

  scoreProviders(providers: readonly WeightedProviderInput[], nowMs = Date.now()): readonly WeightedProviderScore[] {
    return providers
      .map((p): WeightedProviderScore => {
        const state = this.getState(p.id);
        if (p.tier === "local-fallback") {
          return {
            ...ZERO_BILL_SEAL, providerId: p.id, tier: p.tier, remainingQuotaRatio: 1, normalizedSpeedScore: 1,
            ewmaLatencyMs: Math.round(state.ewmaLatencyMs), healthScore: 1, circuitState: "closed",
            consecutiveFailures: 0, cooldownUntilUtc: null, eligible: true, skipReason: null, totalDispatches: state.totalDispatches,
          };
        }
        const remainingQuotaRatio = computeRemainingQuotaRatio(p);
        const normalizedSpeedScore = computeNormalizedSpeedScore(state.ewmaLatencyMs, this.cfg.minLatencyMs, this.cfg.maxLatencyMs);
        const healthScore = computeProviderHealthScore(remainingQuotaRatio, normalizedSpeedScore);
        const circuitState = this.resolveCircuit(state, nowMs);
        const untilMs = state.hardBlockedUntilMs ?? state.cooldownUntilMs;
        const modelCheck = isFreeModelWhitelisted(p.id, p.model);
        const skipReason = !p.configured
          ? "not_configured"
          : !p.modelAllowed || !modelCheck.allowed
            ? (modelCheck.blockReason ?? "paid_model_blocked")
            : p.blocked || remainingQuotaRatio <= 0
              ? "quota_or_policy_blocked"
              : circuitState === "open"
                ? (state.hardBlockedUntilMs !== null ? "hard_blocked_until_utc_reset" : "circuit_open_cooldown")
                : circuitState === "half-open" && state.halfOpenProbeInFlight ? "circuit_half_open_probe_busy" : null;
        return {
          ...ZERO_BILL_SEAL, providerId: p.id, tier: p.tier, remainingQuotaRatio, normalizedSpeedScore,
          ewmaLatencyMs: Math.round(state.ewmaLatencyMs), healthScore, circuitState,
          consecutiveFailures: state.consecutiveFailures,
          cooldownUntilUtc: untilMs !== null && untilMs > nowMs ? new Date(untilMs).toISOString() : null,
          eligible: skipReason === null, skipReason, totalDispatches: state.totalDispatches,
        };
      })
      .sort((a, b) => {
        if (a.tier !== b.tier) return a.tier === "cloud-free" ? -1 : 1;
        if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
        if (b.healthScore !== a.healthScore) return b.healthScore - a.healthScore;
        return ZERO_BILL_FREE_PROVIDER_ORDER.indexOf(a.providerId) - ZERO_BILL_FREE_PROVIDER_ORDER.indexOf(b.providerId);
      });
  }

  selectExecutionPlan(providers: readonly WeightedProviderInput[], nowMs = Date.now()): WeightedExecutionPlan {
    const scores = this.scoreProviders(providers, nowMs);
    const eligibleCloud = scores.filter((s) => s.tier === "cloud-free" && s.eligible);
    const skipped = scores.filter((s) => s.tier === "cloud-free" && !s.eligible).map((s) => ({ providerId: s.providerId, reason: s.skipReason ?? "ineligible" }));
    const circuitOpenCount = scores.filter((s) => s.tier === "cloud-free" && s.circuitState === "open").length;

    if (eligibleCloud.length === 0) {
      this.getState("local-zero-cost-fallback").totalDispatches += 1;
      return { ...ZERO_BILL_SEAL, selectedProviderId: "local-zero-cost-fallback", orderedProviderIds: ["local-zero-cost-fallback"], healthyCloudCount: 0, circuitOpenCount, scores, skipped };
    }

    let totalWeight = 0;
    let winner = eligibleCloud[0];
    let winnerWeight = -Infinity;
    for (const c of eligibleCloud) {
      const state = this.getState(c.providerId);
      const weight = Math.max(0.01, c.healthScore * (c.circuitState === "half-open" ? this.cfg.halfOpenWeightFactor : 1));
      state.currentWeight += weight;
      totalWeight += weight;
      if (state.currentWeight > winnerWeight) {
        winnerWeight = state.currentWeight;
        winner = c;
      }
    }

    const winnerState = this.getState(winner.providerId);
    winnerState.currentWeight -= totalWeight;
    winnerState.totalDispatches += 1;
    if (winner.circuitState === "half-open") {
      winnerState.circuitState = "half-open";
      winnerState.halfOpenProbeInFlight = true;
      winnerState.halfOpenProbeStartedAtMs = nowMs;
    }

    return {
      ...ZERO_BILL_SEAL,
      selectedProviderId: winner.providerId,
      orderedProviderIds: [winner.providerId, ...eligibleCloud.filter((s) => s.providerId !== winner.providerId).map((s) => s.providerId), "local-zero-cost-fallback"],
      healthyCloudCount: eligibleCloud.length, circuitOpenCount, scores, skipped,
    };
  }

  recordSuccess(providerId: ZeroBillFreeProviderId, latencyMs: number): void {
    const state = this.getState(providerId);
    const bounded = Math.max(1, Number.isFinite(latencyMs) ? latencyMs : this.cfg.defaultLatencyMs);
    state.ewmaLatencyMs = this.cfg.ewmaAlpha * bounded + (1 - this.cfg.ewmaAlpha) * state.ewmaLatencyMs;
    state.circuitState = "closed"; state.consecutiveFailures = 0;
    state.cooldownUntilMs = null; state.hardBlockedUntilMs = null;
    state.halfOpenProbeInFlight = false; state.halfOpenProbeStartedAtMs = null;
  }

  recordFailure(providerId: ZeroBillFreeProviderId, report: ProviderFailureReport) {
    const nowMs = report.nowMs ?? Date.now();
    const state = this.getState(providerId);
    state.halfOpenProbeInFlight = false; state.halfOpenProbeStartedAtMs = null;
    if (report.httpStatus === 402 || report.hardBlockUntilUtcMidnight === true) {
      const resetMs = nextUtcMidnightMs(nowMs);
      state.circuitState = "open"; state.consecutiveFailures += 1;
      state.hardBlockedUntilMs = resetMs; state.cooldownUntilMs = resetMs;
      return { circuitState: "open" as const, cooldownMs: Math.max(0, resetMs - nowMs), cooldownUntilUtc: new Date(resetMs).toISOString() };
    }
    const isCircuitFault = report.httpStatus === 429 || report.httpStatus === null || (report.httpStatus >= 500 && report.httpStatus <= 599);
    if (!isCircuitFault) return { circuitState: this.resolveCircuit(state, nowMs), cooldownMs: 0, cooldownUntilUtc: null };

    state.consecutiveFailures += 1;
    const expCooldown = Math.min(this.cfg.maxCooldownMs, this.cfg.baseCooldownMs * 2 ** (state.consecutiveFailures - 1));
    const retryAfter = report.retryAfterMs !== undefined && Number.isFinite(report.retryAfterMs) ? Math.max(0, report.retryAfterMs) : 0;
    const cooldownMs = Math.min(this.cfg.maxCooldownMs, Math.max(expCooldown, retryAfter));
    state.circuitState = "open"; state.cooldownUntilMs = nowMs + cooldownMs;
    return { circuitState: "open" as const, cooldownMs, cooldownUntilUtc: new Date(state.cooldownUntilMs).toISOString() };
  }

  reset(): void { this.states.clear(); }
}

export type FreeAiCacheBypassReason = "pii_redacted_bypass" | "private_user_context_bypass" | "pii_detected_in_prompt_bypass";

export interface FreeAiCacheKeyInput {
  readonly mode: string; readonly locale: string; readonly prompt: string;
  readonly piiRedactedCount?: number; readonly isPrivateUserContext?: boolean;
}

export interface FreeAiCachedResponse extends ZeroBillSeal {
  readonly providerId: ZeroBillFreeProviderId; readonly model: string; readonly content: string;
  readonly tokensSavedEstimate: number; readonly cachedAtMs: number; readonly expiresAtMs: number;
}

export interface FreeAiCacheLookupResult extends ZeroBillSeal {
  readonly hit: boolean; readonly bypassed: boolean; readonly bypassReason: FreeAiCacheBypassReason | null;
  readonly key: string | null; readonly entry: FreeAiCachedResponse | null;
}

export interface FreeAiCacheStoreResult extends ZeroBillSeal {
  readonly stored: boolean; readonly bypassed: boolean; readonly bypassReason: FreeAiCacheBypassReason | null;
  readonly key: string | null;
}

export interface FreeAiCacheStats extends ZeroBillSeal {
  readonly entries: number; readonly maxEntries: number; readonly ttlMs: number;
  readonly hits: number; readonly misses: number; readonly totalLookups: number; readonly hitRate: number;
  readonly bypassedLookups: number; readonly bypassedWrites: number;
  readonly expiredEvictions: number; readonly lruEvictions: number; readonly tokensSavedEstimate: number;
}

export const normalizePromptForCache = (prompt: string): string =>
  prompt.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();

export function buildFreeAiCacheKey(mode: string, locale: string, prompt: string): string {
  const payload = JSON.stringify(["toonstudio-free-ai-cache-v1", mode.trim().toLowerCase(), locale.trim().toLowerCase(), normalizePromptForCache(prompt)]);
  return createHash("sha256").update(payload).digest("hex");
}

function detectCacheBypassReason(input: FreeAiCacheKeyInput): FreeAiCacheBypassReason | null {
  if ((input.piiRedactedCount ?? 0) > 0) return "pii_redacted_bypass";
  if (input.isPrivateUserContext === true) return "private_user_context_bypass";
  if (redactCreatorSensitiveText(input.prompt).redactedCount > 0) return "pii_detected_in_prompt_bypass";
  return null;
}

/**
 * PII 안전 정규화 프롬프트 응답 캐시 (SHA-256 + Bounded LRU + TTL).
 * `piiRedactedCount > 0`, `isPrivateUserContext === true`, 원문 PII 감지 요청은 절대 저장·조회하지 않는다.
 */
export class StudioFreeAiResponseCache {
  private readonly entries = new Map<string, FreeAiCachedResponse>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private stats = { hits: 0, misses: 0, bypassedLookups: 0, bypassedWrites: 0, expiredEvictions: 0, lruEvictions: 0, tokensSavedEstimate: 0 };

  constructor(options: { readonly maxEntries?: number; readonly ttlMs?: number } = {}) {
    this.maxEntries = Math.max(1, Math.trunc(options.maxEntries ?? 512));
    this.ttlMs = Math.max(100, Math.trunc(options.ttlMs ?? 30 * 60 * 1_000));
  }

  get(input: FreeAiCacheKeyInput, nowMs = Date.now()): FreeAiCacheLookupResult {
    const bypassReason = detectCacheBypassReason(input);
    if (bypassReason) {
      this.stats.bypassedLookups += 1;
      return { ...ZERO_BILL_SEAL, hit: false, bypassed: true, bypassReason, key: null, entry: null };
    }
    const key = buildFreeAiCacheKey(input.mode, input.locale, input.prompt);
    const existing = this.entries.get(key);
    if (!existing || nowMs >= existing.expiresAtMs) {
      if (existing) { this.entries.delete(key); this.stats.expiredEvictions += 1; }
      this.stats.misses += 1;
      return { ...ZERO_BILL_SEAL, hit: false, bypassed: false, bypassReason: null, key, entry: null };
    }
    this.entries.delete(key);
    this.entries.set(key, existing);
    this.stats.hits += 1;
    this.stats.tokensSavedEstimate += existing.tokensSavedEstimate;
    return { ...ZERO_BILL_SEAL, hit: true, bypassed: false, bypassReason: null, key, entry: existing };
  }

  set(
    input: FreeAiCacheKeyInput,
    value: { readonly providerId: ZeroBillFreeProviderId; readonly model: string; readonly content: string; readonly tokensSavedEstimate: number; readonly ttlMs?: number },
    nowMs = Date.now(),
  ): FreeAiCacheStoreResult {
    const bypassReason = detectCacheBypassReason(input);
    if (bypassReason) {
      this.stats.bypassedWrites += 1;
      return { ...ZERO_BILL_SEAL, stored: false, bypassed: true, bypassReason, key: null };
    }
    const key = buildFreeAiCacheKey(input.mode, input.locale, input.prompt);
    const record: FreeAiCachedResponse = {
      ...ZERO_BILL_SEAL, providerId: value.providerId, model: value.model, content: value.content,
      tokensSavedEstimate: Math.max(0, Math.trunc(value.tokensSavedEstimate)),
      cachedAtMs: nowMs, expiresAtMs: nowMs + Math.max(100, Math.trunc(value.ttlMs ?? this.ttlMs)),
    };
    this.entries.delete(key);
    this.entries.set(key, record);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (!oldest) break;
      this.entries.delete(oldest);
      this.stats.lruEvictions += 1;
    }
    return { ...ZERO_BILL_SEAL, stored: true, bypassed: false, bypassReason: null, key };
  }

  getStats(): FreeAiCacheStats {
    const cacheable = this.stats.hits + this.stats.misses;
    return {
      ...ZERO_BILL_SEAL, ...this.stats, entries: this.entries.size, maxEntries: this.maxEntries, ttlMs: this.ttlMs,
      totalLookups: cacheable + this.stats.bypassedLookups,
      hitRate: cacheable > 0 ? Number((this.stats.hits / cacheable).toFixed(4)) : 0,
    };
  }

  clear(): void { this.entries.clear(); }
}
