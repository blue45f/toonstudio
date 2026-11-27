import { Injectable } from "@nestjs/common";
import { OPENROUTER_FREE_REQUEST_OPTIONS } from "@toonstudio/contracts/studio-openrouter-free";

import {
  classifyUpstreamFailure,
  isFreeModelWhitelisted,
  nextUtcMidnightMs,
  parseSafetyCutoffRatio,
  resolveZeroBillFreeProviders,
  utcDayString,
  ZERO_BILL_FREE_PROVIDER_ORDER,
  type ZeroBillBlockReason,
  type ZeroBillCascadeAttempt,
  type ZeroBillCascadeRequest,
  type ZeroBillCascadeResult,
  type ZeroBillFreeProviderId,
  type ZeroBillFreeQuotaStatusReport,
  type ZeroBillProviderQuotaStatus,
  type ZeroBillProviderResolution,
} from "./openai-assist/studio-free-ai-provider-catalog";
import type { EnvLike } from "./openai-assist/studio-openai-guardrails";

export {
  isFreeModelWhitelisted,
  resolveZeroBillFreeProviders,
  ZERO_BILL_FREE_PROVIDER_ORDER,
  type ZeroBillBlockReason,
  type ZeroBillCascadeAttempt,
  type ZeroBillCascadeRequest,
  type ZeroBillCascadeResult,
  type ZeroBillFreeProviderId,
  type ZeroBillFreeQuotaStatusReport,
  type ZeroBillProviderQuotaStatus,
  type ZeroBillProviderResolution,
};

interface ProviderLedgerEntry {
  utcDay: string;
  usedRequests: number;
  usedTokens: number;
  pendingTokens: number;
  blockedUntilMs: number | null;
  blockReason: ZeroBillBlockReason | null;
}

const MAX_OUTPUT_TOKENS_HARD_CAP = 1_400;

function stripJsonCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu);
  return fenced ? fenced[1].trim() : trimmed;
}

/**
 * 엄격한 ₩0 Fail-Closed 다중 무료 AI 캐스케이드 라우터.
 * - 유료 전용 모델 요청 즉시 차단 (네트워크 호출 전 거부)
 * - 일일 토큰·요청 안전선(기본 90% 컷오프) 도달 시 다음 UTC 자정까지 차단
 * - HTTP 402/429, insufficient_quota, billing_hard_limit 시 즉시 다음 UTC 자정까지 차단 후 다음 무료 공급자로 자동 페일오버
 */
@Injectable()
export class StudioFreeAiZeroBillRouter {
  private readonly ledger = new Map<ZeroBillFreeProviderId, ProviderLedgerEntry>();

  private getLedgerEntry(providerId: ZeroBillFreeProviderId, nowMs: number): ProviderLedgerEntry {
    const today = utcDayString(nowMs);
    const existing = this.ledger.get(providerId);
    if (!existing || existing.utcDay !== today) {
      const fresh: ProviderLedgerEntry = {
        utcDay: today,
        usedRequests: 0,
        usedTokens: 0,
        pendingTokens: 0,
        blockedUntilMs: null,
        blockReason: null,
      };
      this.ledger.set(providerId, fresh);
      return fresh;
    }
    if (existing.blockedUntilMs !== null && existing.blockedUntilMs <= nowMs) {
      existing.blockedUntilMs = null;
      existing.blockReason = null;
    }
    return existing;
  }

  blockProviderUntilUtcMidnight(
    providerId: ZeroBillFreeProviderId,
    reason: ZeroBillBlockReason,
    nowMs = Date.now(),
  ): string {
    const entry = this.getLedgerEntry(providerId, nowMs);
    const resetMs = nextUtcMidnightMs(nowMs);
    entry.blockedUntilMs = resetMs;
    entry.blockReason = reason;
    return new Date(resetMs).toISOString();
  }

  recordProviderUsage(
    providerId: ZeroBillFreeProviderId,
    tokensUsed: number,
    env: EnvLike = process.env,
    nowMs = Date.now(),
  ): void {
    const entry = this.getLedgerEntry(providerId, nowMs);
    entry.usedRequests += 1;
    entry.usedTokens += Number.isSafeInteger(tokensUsed) ? Math.max(0, tokensUsed) : 0;

    const providers = resolveZeroBillFreeProviders(env);
    const spec = providers.find((item) => item.id === providerId);
    if (!spec || spec.tier === "local-fallback") return;
    const cutoff = parseSafetyCutoffRatio(env);
    const safeReq = Math.max(1, Math.floor(spec.dailyRequestCap * cutoff));
    const safeTok = Math.max(1, Math.floor(spec.dailyTokenCap * cutoff));
    if (entry.usedRequests >= safeReq || entry.usedTokens >= safeTok) {
      this.blockProviderUntilUtcMidnight(providerId, "safety_cutoff_90pct", nowMs);
    }
  }

  getFreeQuotaStatus(
    env: EnvLike = process.env,
    nowMs = Date.now(),
  ): ZeroBillFreeQuotaStatusReport {
    const cutoff = parseSafetyCutoffRatio(env);
    const today = utcDayString(nowMs);
    const nextResetUtcIso = new Date(nextUtcMidnightMs(nowMs)).toISOString();
    const resolved = resolveZeroBillFreeProviders(env);

    const providers: ZeroBillProviderQuotaStatus[] = resolved.map((spec) => {
      const entry = this.getLedgerEntry(spec.id, nowMs);
      const safeRequestCutoff =
        spec.tier === "local-fallback"
          ? spec.dailyRequestCap
          : Math.max(1, Math.floor(spec.dailyRequestCap * cutoff));
      const safeTokenCutoff =
        spec.tier === "local-fallback"
          ? spec.dailyTokenCap
          : Math.max(1, Math.floor(spec.dailyTokenCap * cutoff));

      const modelBlocked = spec.configured && !spec.modelAllowed;
      const quotaCutoffReached =
        spec.tier !== "local-fallback" &&
        (entry.usedRequests >= safeRequestCutoff || entry.usedTokens >= safeTokenCutoff);
      const accountUnconfirmed = spec.configured && !spec.freeBillingConfirmed;
      const ledgerBlocked =
        entry.blockedUntilMs !== null && entry.blockedUntilMs > nowMs && entry.blockReason !== null;

      const blocked = modelBlocked || accountUnconfirmed || ledgerBlocked || quotaCutoffReached;
      const blockReason: ZeroBillBlockReason | null = modelBlocked
        ? spec.modelBlockReason
        : accountUnconfirmed
          ? "free_billing_unconfirmed"
          : ledgerBlocked
            ? entry.blockReason
            : quotaCutoffReached
              ? "safety_cutoff_90pct"
              : null;
      const blockedUntilUtc = modelBlocked || accountUnconfirmed
        ? null
        : ledgerBlocked && entry.blockedUntilMs !== null
          ? new Date(entry.blockedUntilMs).toISOString()
          : quotaCutoffReached
            ? nextResetUtcIso
            : null;

      const reqRatio = safeRequestCutoff > 0 ? entry.usedRequests / safeRequestCutoff : 0;
      const tokRatio = safeTokenCutoff > 0 ? entry.usedTokens / safeTokenCutoff : 0;
      const utilizationPct =
        spec.tier === "local-fallback"
          ? 0
          : Math.min(100, Math.round(Math.max(reqRatio, tokRatio) * 100));

      return {
        id: spec.id,
        labelKo: spec.labelKo,
        priority: spec.priority,
        tier: spec.tier,
        configured: spec.configured,
        model: spec.model,
        modelAllowed: spec.modelAllowed,
        modelBlockReason: spec.modelBlockReason,
        blocked,
        blockReason,
        blockedUntilUtc,
        dailyRequestCap: spec.dailyRequestCap,
        safeRequestCutoff,
        usedRequests: entry.usedRequests,
        remainingSafeRequests: Math.max(0, safeRequestCutoff - entry.usedRequests),
        dailyTokenCap: spec.dailyTokenCap,
        safeTokenCutoff,
        usedTokens: entry.usedTokens,
        remainingSafeTokens: Math.max(0, safeTokenCutoff - entry.usedTokens - entry.pendingTokens),
        utilizationPct,
        costUsdGuaranteed: "$0.00",
      };
    });

    const cloudProviders = providers.filter((p) => p.tier === "cloud-free");
    const configuredCloud = cloudProviders.filter((p) => p.configured);
    const activeCloud = configuredCloud.filter((p) => !p.blocked);
    const blockedCloud = configuredCloud.filter((p) => p.blocked);

    return {
      providerBilledUsd: null,
      guaranteedZeroCostUsd: 0,
      guaranteedZeroCostLabel: "$0.00",
      guaranteedZeroCostKrwLabel: "₩0",
      paidBillingBlocked: true,
      failClosedOnCutoff: true,
      safetyCutoffRatio: cutoff,
      utcDay: today,
      nextResetUtcIso,
      summary: {
        totalProviders: providers.length,
        configuredCloudCount: configuredCloud.length,
        activeCloudCount: activeCloud.length,
        blockedCloudCount: blockedCloud.length,
        localFallbackReady: true,
        activePriorityOrder: [
          ...activeCloud.map((p) => p.id),
          "local-zero-cost-fallback",
        ],
      },
      providers,
    };
  }

  async executeCascade(
    request: ZeroBillCascadeRequest,
    options: {
      readonly env?: EnvLike;
      readonly fetchImpl?: typeof fetch;
      readonly nowMs?: number;
      readonly signal?: AbortSignal;
      readonly validateContent?: (content: string) => boolean;
    } = {},
  ): Promise<ZeroBillCascadeResult> {
    const env = options.env ?? process.env;
    const fetchFn = options.fetchImpl ?? fetch;
    const cutoff = parseSafetyCutoffRatio(env);
    const requestedTokens = request.maxOutputTokens ?? 1_000;
    const maxOutputTokens = Math.min(
      MAX_OUTPUT_TOKENS_HARD_CAP,
      Math.max(16, Number.isFinite(requestedTokens) ? Math.trunc(requestedTokens) : 1_000),
    );
    // 한국어 다중 바이트 원고와 JSON 스키마·메시지 프레이밍도 전송 전 상한에 포함한다.
    const estimatedInputTokens = Buffer.byteLength(JSON.stringify([
      request.systemInstruction, request.userPrompt, request.jsonSchema,
    ]), "utf8") + 256;
    const estimatedTotalTokens = estimatedInputTokens + maxOutputTokens;

    const allResolved = resolveZeroBillFreeProviders(env);
    const ordered = request.preferredProviders?.length
      ? [
          ...request.preferredProviders
            .map((id) => allResolved.find((p) => p.id === id))
            .filter((p): p is ZeroBillProviderResolution => Boolean(p)),
          ...allResolved.filter((p) => !request.preferredProviders?.includes(p.id)),
        ]
      : allResolved;

    const attempts: ZeroBillCascadeAttempt[] = [];

    for (const provider of ordered) {
      if (options.signal?.aborted) {
        return {
          ok: false,
          providerId: "local-zero-cost-fallback",
          providerTier: "local-fallback",
          model: "aborted",
          content: "",
          costGuaranteedZeroUsd: 0,
          paidBillingBlocked: true,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          attempts,
          errorCode: "CLIENT_ABORTED",
          errorMessageKo: "요청이 취소되었어요.",
        };
      }

      if (provider.tier === "local-fallback") {
        if (request.allowLocalDeterministicFallback !== false && request.localDeterministicOutput) {
          const content = request.localDeterministicOutput();
          attempts.push({
            providerId: provider.id,
            model: provider.model,
            outcome: "succeeded",
            reason: "local_zero_cost_deterministic_fallback",
            httpStatus: null,
          });
          return {
            ok: true,
            providerId: provider.id,
            providerTier: "local-fallback",
            model: provider.model,
            content,
            costGuaranteedZeroUsd: 0,
            paidBillingBlocked: true,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            attempts,
          };
        }
        attempts.push({
          providerId: provider.id,
          model: provider.model,
          outcome: "skipped",
          reason: "local_fallback_disabled",
          httpStatus: null,
        });
        continue;
      }

      if (request.localOnly) {
        attempts.push({
          providerId: provider.id,
          model: provider.model,
          outcome: "skipped",
          reason: "local_only_mode",
          httpStatus: null,
        });
        continue;
      }

      if (!provider.configured) {
        attempts.push({
          providerId: provider.id,
          model: provider.model,
          outcome: "skipped",
          reason: "not_configured",
          httpStatus: null,
        });
        continue;
      }

      if (!provider.modelAllowed) {
        attempts.push({
          providerId: provider.id,
          model: provider.model,
          outcome: "skipped",
          reason: provider.modelBlockReason ?? "paid_model_blocked",
          httpStatus: null,
        });
        continue;
      }

      if (!provider.freeBillingConfirmed) {
        attempts.push({
          providerId: provider.id, model: provider.model, outcome: "skipped",
          reason: "free_billing_unconfirmed", httpStatus: null,
        });
        continue;
      }

      const nowMs = options.nowMs ?? Date.now();
      const entry = this.getLedgerEntry(provider.id, nowMs);
      if (entry.blockedUntilMs !== null && entry.blockedUntilMs > nowMs && entry.blockReason) {
        attempts.push({
          providerId: provider.id,
          model: provider.model,
          outcome: "skipped",
          reason: `blocked:${entry.blockReason}`,
          httpStatus: null,
        });
        continue;
      }

      const safeRequestCutoff = Math.max(1, Math.floor(provider.dailyRequestCap * cutoff));
      const safeTokenCutoff = Math.max(1, Math.floor(provider.dailyTokenCap * cutoff));
      if (
        entry.usedRequests + 1 > safeRequestCutoff ||
        entry.usedTokens + entry.pendingTokens + estimatedTotalTokens > safeTokenCutoff
      ) {
        attempts.push({
          providerId: provider.id,
          model: provider.model,
          outcome: "failed-over",
          reason: "safety_cutoff_90pct",
          httpStatus: null,
        });
        continue;
      }

      // 같은 프로세스 내 동시 요청이 남은 한도를 중복 사용하지 않게 전송 전에 예약한다.
      entry.usedRequests += 1;
      entry.pendingTokens += estimatedTotalTokens;
      const callResult = await this.invokeCloudProvider(provider, request, {
        fetchFn,
        maxOutputTokens,
        signal: options.signal,
      });

      entry.pendingTokens -= estimatedTotalTokens;
      if (!callResult.ok) {
        // 수신 중 단절·불완전한 200 응답의 실제 사용량을 알 수 없으면 예약 상한으로 정산한다.
        if (callResult.httpStatus === null || callResult.httpStatus === 200 || callResult.httpStatus >= 500) {
          entry.usedTokens += estimatedTotalTokens;
        }
        if (callResult.blockReason) {
          entry.blockedUntilMs = nextUtcMidnightMs(nowMs);
          entry.blockReason = callResult.blockReason;
        }
        attempts.push({
          providerId: provider.id,
          model: provider.model,
          outcome: "failed-over",
          reason: callResult.blockReason ?? callResult.reason,
          httpStatus: callResult.httpStatus,
        });
        continue;
      }

      entry.usedTokens += callResult.usage.totalTokens || estimatedTotalTokens;
      const cleanedContent = stripJsonCodeFences(callResult.content);
      if (options.validateContent && !options.validateContent(cleanedContent)) {
        attempts.push({
          providerId: provider.id,
          model: provider.model,
          outcome: "failed-over",
          reason: "schema_validation_failed",
          httpStatus: 200,
        });
        continue;
      }

      attempts.push({
        providerId: provider.id,
        model: callResult.model,
        outcome: "succeeded",
        reason: "ok",
        httpStatus: 200,
      });
      return {
        ok: true,
        providerId: provider.id,
        providerTier: "cloud-free",
        model: callResult.model,
        content: cleanedContent,
        costGuaranteedZeroUsd: 0,
        paidBillingBlocked: true,
        usage: callResult.usage,
        attempts,
      };
    }

    return {
      ok: false,
      providerId: "local-zero-cost-fallback",
      providerTier: "local-fallback",
      model: "none",
      content: "",
      costGuaranteedZeroUsd: 0,
      paidBillingBlocked: true,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      attempts,
      errorCode: "ALL_FREE_PROVIDERS_EXHAUSTED",
      errorMessageKo:
        "사용 가능한 무료 AI 할당량이 모두 안전 한도(90%)에 도달해 유료 과금 방지를 위해 중단했어요. 다음 UTC 자정(한국 시간 오전 9시)에 자동 초기화됩니다.",
    };
  }

  private async invokeCloudProvider(
    provider: ZeroBillProviderResolution,
    request: ZeroBillCascadeRequest,
    options: {
      readonly fetchFn: typeof fetch;
      readonly maxOutputTokens: number;
      readonly signal?: AbortSignal;
    },
  ): Promise<
    | {
        readonly ok: true;
        readonly model: string;
        readonly content: string;
        readonly usage: {
          readonly promptTokens: number;
          readonly completionTokens: number;
          readonly totalTokens: number;
        };
      }
    | {
        readonly ok: false;
        readonly reason: string;
        readonly blockReason: ZeroBillBlockReason | null;
        readonly httpStatus: number | null;
      }
  > {
    const controller = new AbortController();
    const onAbort = () => {
      if (!controller.signal.aborted) controller.abort();
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) onAbort();
    const timer = setTimeout(() => {
      if (!controller.signal.aborted) controller.abort();
    }, provider.timeoutMs);

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
        ...(provider.extraHeaders ?? {}),
      };

      const systemText =
        request.jsonSchema && !provider.supportsStrictJsonSchema
          ? `${request.systemInstruction}\n다음 JSON Schema의 필드·타입·필수 항목을 지킨 JSON 객체만 출력하세요.\n${JSON.stringify(request.jsonSchema.schema)}`
          : request.systemInstruction;

      const body: Record<string, unknown> = {
        model: provider.model,
        temperature: request.temperature ?? 0.5,
        messages: [
          { role: "system", content: systemText },
          { role: "user", content: request.userPrompt },
        ],
      };

      if (provider.id === "openai-free-share") {
        body.store = false;
        body.max_completion_tokens = options.maxOutputTokens;
      } else {
        body.max_tokens = options.maxOutputTokens;
      }

      if (provider.id === "openrouter-free") {
        Object.assign(body, OPENROUTER_FREE_REQUEST_OPTIONS);
      }

      if (request.jsonSchema && provider.supportsStrictJsonSchema) {
        body.response_format = {
          type: "json_schema",
          json_schema: {
            name: request.jsonSchema.name,
            strict: true,
            schema: request.jsonSchema.schema,
          },
        };
      }

      const response = await options.fetchFn(provider.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const responseText = await response.text();

      if (!response.ok) {
        const blockReason = classifyUpstreamFailure(response.status, responseText);
        return {
          ok: false,
          reason: blockReason ?? `http_${response.status}`,
          blockReason,
          httpStatus: response.status,
        };
      }

      const parsed = JSON.parse(responseText) as {
        model?: unknown;
        choices?: Array<{ message?: { content?: unknown } }>;
        usage?: {
          prompt_tokens?: unknown;
          completion_tokens?: unknown;
          total_tokens?: unknown;
        };
      };
      const rawContent = parsed.choices?.[0]?.message?.content;
      if (typeof rawContent !== "string" || !rawContent.trim()) {
        return {
          ok: false,
          reason: "empty_response",
          blockReason: null,
          httpStatus: 200,
        };
      }

      const tokenCount = (value: unknown) =>
        typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
      const promptTokens = tokenCount(parsed.usage?.prompt_tokens);
      const completionTokens = tokenCount(parsed.usage?.completion_tokens);
      const reportedTotal = tokenCount(parsed.usage?.total_tokens);
      const completeSum = promptTokens !== null && completionTokens !== null ? promptTokens + completionTokens : 0;
      // 합계가 누락되고 부분 카운터만 온 경우 예약한 상한으로 정산한다.
      const totalTokens = reportedTotal !== null && reportedTotal >= Math.max(promptTokens ?? 0, completionTokens ?? 0)
        ? Math.max(reportedTotal, completeSum)
        : completeSum;

      return {
        ok: true,
        model:
          typeof parsed.model === "string" && parsed.model.trim()
            ? parsed.model.trim().slice(0, 120)
            : provider.model,
        content: rawContent,
        usage: { promptTokens: promptTokens ?? 0, completionTokens: completionTokens ?? 0, totalTokens },
      };
    } catch {
      return {
        ok: false,
        reason: options.signal?.aborted ? "client_aborted" : "network_or_timeout",
        blockReason: null,
        httpStatus: null,
      };
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    }
  }
}
