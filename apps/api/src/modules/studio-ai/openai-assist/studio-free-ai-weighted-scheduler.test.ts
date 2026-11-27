import { describe, expect, it } from "vitest";

import { StudioFreeAiZeroBillRouter } from "../studio-free-ai-zero-bill-router";
import { ZERO_BILL_FREE_PROVIDER_ORDER, type ZeroBillFreeProviderId } from "./studio-free-ai-provider-catalog";
import {
  buildFreeAiCacheKey,
  computeNormalizedSpeedScore,
  computeProviderHealthScore,
  FREE_AI_CLOUD_PROVIDER_IDS,
  normalizePromptForCache,
  SCHEDULER_QUOTA_WEIGHT,
  SCHEDULER_SPEED_WEIGHT,
  StudioFreeAiResponseCache,
  StudioFreeAiWeightedScheduler,
  type WeightedProviderInput,
} from "./studio-free-ai-weighted-scheduler";

function buildAllConfiguredEnv(): Record<string, string> {
  return {
    STUDIO_AI_FREE_OPENAI_CONFIRMED: "true",
    STUDIO_AI_FREE_GEMINI_CONFIRMED: "true",
    STUDIO_AI_FREE_GITHUB_MODELS_CONFIRMED: "true",
    STUDIO_AI_FREE_CLOUDFLARE_CONFIRMED: "true",
    STUDIO_AI_FREE_MISTRAL_CONFIRMED: "true",
    STUDIO_AI_FREE_SAMBANOVA_CONFIRMED: "true",
    STUDIO_AI_FREE_GROQ_CONFIRMED: "true",
    STUDIO_AI_FREE_OPENROUTER_CONFIRMED: "true",
    OPENAI_API_KEY: "test-openai-free-key",
    GEMINI_API_KEY: "test-gemini-free-key",
    STUDIO_AI_FREE_GITHUB_MODELS_API_KEY: "test-github-free-key",
    STUDIO_AI_FREE_CLOUDFLARE_API_TOKEN: "test-cf-free-token",
    STUDIO_AI_FREE_CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
    STUDIO_AI_FREE_MISTRAL_API_KEY: "test-mistral-free-key",
    STUDIO_AI_FREE_SAMBANOVA_API_KEY: "test-sambanova-free-key",
    STUDIO_AI_FREE_GROQ_API_KEY: "test-groq-free-key",
    STUDIO_AI_FREE_OPENROUTER_API_KEY: "test-openrouter-free-key",
  };
}

function makeProvider(
  id: ZeroBillFreeProviderId,
  overrides: Partial<WeightedProviderInput> = {},
): WeightedProviderInput {
  const defaultModels: Record<ZeroBillFreeProviderId, string> = {
    "openai-free-share": "gpt-4o-mini",
    "gemini-free": "gemini-2.5-flash",
    "github-models-free": "openai/gpt-4o-mini",
    "cloudflare-workers-ai-free": "@cf/google/gemma-4-26b-a4b-it",
    "mistral-free": "mistral-small-latest",
    "sambanova-free": "DeepSeek-V3.1",
    "groq-free": "llama-3.3-70b-versatile",
    "openrouter-free": "openrouter/free",
    "local-zero-cost-fallback": "toonstudio-deterministic-coach-v2",
  };
  return {
    id,
    tier: id === "local-zero-cost-fallback" ? "local-fallback" : "cloud-free",
    configured: true,
    model: defaultModels[id],
    modelAllowed: true,
    blocked: false,
    priority: ZERO_BILL_FREE_PROVIDER_ORDER.indexOf(id) + 1,
    safeRequestCutoff: 100,
    remainingSafeRequests: 100,
    safeTokenCutoff: 100_000,
    remainingSafeTokens: 100_000,
    ...overrides,
  };
}

describe("StudioFreeAiWeightedScheduler (9-Pool ₩0 할당량·지연시간 가중 분산 스케줄러)", () => {
  it("건강 점수 공식(0.65 * remainingQuotaRatio + 0.35 * normalizedSpeedScore)과 8+1 무료 공급자 목록을 정확히 계산한다", () => {
    expect(SCHEDULER_QUOTA_WEIGHT).toBe(0.65);
    expect(SCHEDULER_SPEED_WEIGHT).toBe(0.35);
    expect(FREE_AI_CLOUD_PROVIDER_IDS).toHaveLength(8);
    expect([...FREE_AI_CLOUD_PROVIDER_IDS, "local-zero-cost-fallback"]).toEqual([...ZERO_BILL_FREE_PROVIDER_ORDER]);

    const speedFast = computeNormalizedSpeedScore(200, 200, 6_000);
    const speedMid = computeNormalizedSpeedScore(3_100, 200, 6_000);
    const speedSlow = computeNormalizedSpeedScore(6_000, 200, 6_000);
    expect(speedFast).toBe(1);
    expect(speedMid).toBeCloseTo(0.5, 5);
    expect(speedSlow).toBe(0);

    expect(computeProviderHealthScore(0.8, 0.5)).toBeCloseTo(0.65 * 0.8 + 0.35 * 0.5, 6);
    expect(computeProviderHealthScore(1, 1)).toBe(1);
    expect(computeProviderHealthScore(0, 0)).toBe(0);
  });

  it("1번 공급자만 소진시키지 않고 건강한 8개 무료 클라우드 공급자 전체에 가중 분산하며 ₩0 불변식을 지킨다", () => {
    const nowMs = Date.parse("2026-11-26T05:00:00.000Z");
    const zeroBillRouter = new StudioFreeAiZeroBillRouter();
    const quotaReport = zeroBillRouter.getFreeQuotaStatus(buildAllConfiguredEnv(), nowMs);
    const scheduler = new StudioFreeAiWeightedScheduler({ ewmaAlpha: 1 });

    // 공급자별 상이한 지연시간 반영: groq(250ms, 초고속) vs openrouter(5,000ms, 저속)
    scheduler.recordSuccess("groq-free", 250);
    scheduler.recordSuccess("sambanova-free", 450);
    scheduler.recordSuccess("gemini-free", 800);
    scheduler.recordSuccess("openai-free-share", 1_100);
    scheduler.recordSuccess("github-models-free", 1_500);
    scheduler.recordSuccess("cloudflare-workers-ai-free", 1_800);
    scheduler.recordSuccess("mistral-free", 2_400);
    scheduler.recordSuccess("openrouter-free", 5_000);

    // openrouter-free의 잔여 할당량도 20%로 낮춤
    const providers: WeightedProviderInput[] = quotaReport.providers.map((p) =>
      p.id === "openrouter-free"
        ? { ...p, remainingSafeRequests: Math.floor(p.safeRequestCutoff * 0.2) }
        : p,
    );

    const counts = new Map<ZeroBillFreeProviderId, number>();
    for (let i = 0; i < 40; i += 1) {
      const plan = scheduler.selectExecutionPlan(providers, nowMs + i * 10);
      expect(plan.costGuaranteedZeroUsd).toBe(0);
      expect(plan.paidBillingBlocked).toBe(true);
      expect(plan.healthyCloudCount).toBe(8);
      expect(plan.orderedProviderIds[plan.orderedProviderIds.length - 1]).toBe("local-zero-cost-fallback");
      counts.set(plan.selectedProviderId, (counts.get(plan.selectedProviderId) ?? 0) + 1);
    }

    // 8개 무료 공급자 전부에 고르게 분산되어야 함 (1번 공급자 단독 소진 금지)
    expect(counts.size).toBe(8);
    expect(counts.get("openai-free-share") ?? 0).toBeLessThan(12);
    // 고속·잔여량 100%인 groq-free가 저속·잔여량 20%인 openrouter-free보다 훨씬 많은 트래픽을 받아야 함
    expect((counts.get("groq-free") ?? 0)).toBeGreaterThan((counts.get("openrouter-free") ?? 0) * 2);
  });

  it("HTTP 429/5xx 장애 시 지수 백오프 쿨다운으로 건너뛰고 Half-Open 프로브 성공 시 정상 복구한다", () => {
    const t0 = Date.parse("2026-11-26T06:00:00.000Z");
    const scheduler = new StudioFreeAiWeightedScheduler({
      baseCooldownMs: 10_000,
      maxCooldownMs: 80_000,
      ewmaAlpha: 1,
    });
    const providers = [
      makeProvider("openai-free-share"),
      makeProvider("gemini-free"),
      makeProvider("local-zero-cost-fallback"),
    ];

    // 1차 장애 (HTTP 429) -> 10초 쿨다운
    const fail1 = scheduler.recordFailure("openai-free-share", { httpStatus: 429, nowMs: t0 });
    expect(fail1.circuitState).toBe("open");
    expect(fail1.cooldownMs).toBe(10_000);

    // 쿨다운 중(t0 + 5초)에는 openai-free-share를 건너뛰고 gemini-free만 선택
    const duringCooldown = scheduler.selectExecutionPlan(providers, t0 + 5_000);
    expect(duringCooldown.selectedProviderId).toBe("gemini-free");
    expect(duringCooldown.circuitOpenCount).toBe(1);
    expect(duringCooldown.skipped).toContainEqual({
      providerId: "openai-free-share",
      reason: "circuit_open_cooldown",
    });

    // 쿨다운 만료(t0 + 10초) -> half-open 전환, 단일 프로브 허용 및 동시 중복 프로브 차단
    const halfOpenScores = scheduler.scoreProviders(providers, t0 + 10_000);
    const openaiHalfOpen = halfOpenScores.find((s) => s.providerId === "openai-free-share");
    expect(openaiHalfOpen?.circuitState).toBe("half-open");
    expect(openaiHalfOpen?.eligible).toBe(true);

    // openai-free-share가 선택될 때까지 실행 계획 조회 (최대 3회 내 프로브 선택)
    let probed = false;
    for (let i = 0; i < 4; i += 1) {
      const plan = scheduler.selectExecutionPlan(providers, t0 + 10_000);
      if (plan.selectedProviderId === "openai-free-share") {
        probed = true;
        break;
      }
    }
    expect(probed).toBe(true);

    // 프로브 진행 중 동시 요청은 circuit_half_open_probe_busy로 스킵
    const busyPlan = scheduler.selectExecutionPlan(providers, t0 + 10_500);
    expect(busyPlan.selectedProviderId).toBe("gemini-free");
    expect(busyPlan.skipped).toContainEqual({
      providerId: "openai-free-share",
      reason: "circuit_half_open_probe_busy",
    });

    // 프로브가 HTTP 503으로 재실패 -> 지수 백오프 2배(20초)로 연장
    const fail2 = scheduler.recordFailure("openai-free-share", { httpStatus: 503, nowMs: t0 + 10_500 });
    expect(fail2.circuitState).toBe("open");
    expect(fail2.cooldownMs).toBe(20_000);

    // 2차 쿨다운 만료 후 프로브 성공 -> circuit closed + consecutiveFailures 초기화
    scheduler.recordSuccess("openai-free-share", 350);
    const recovered = scheduler.scoreProviders(providers, t0 + 31_000).find((s) => s.providerId === "openai-free-share");
    expect(recovered?.circuitState).toBe("closed");
    expect(recovered?.consecutiveFailures).toBe(0);
    expect(recovered?.eligible).toBe(true);
    expect(recovered?.ewmaLatencyMs).toBe(350);
  });

  it("유료 모델·HTTP 402·전원 차단 상태에서는 과금 모델 호출 없이 local-zero-cost-fallback으로 Fail-Closed 폴백한다", () => {
    const t0 = Date.parse("2026-11-26T07:00:00.000Z");
    const scheduler = new StudioFreeAiWeightedScheduler();
    scheduler.recordFailure("gemini-free", { httpStatus: 402, nowMs: t0 });

    const providers = [
      makeProvider("openai-free-share", { model: "gpt-5-paid", modelAllowed: true }),
      makeProvider("gemini-free"),
      makeProvider("local-zero-cost-fallback"),
    ];

    const plan = scheduler.selectExecutionPlan(providers, t0 + 60_000);
    expect(plan.selectedProviderId).toBe("local-zero-cost-fallback");
    expect(plan.orderedProviderIds).toEqual(["local-zero-cost-fallback"]);
    expect(plan.healthyCloudCount).toBe(0);
    expect(plan.costGuaranteedZeroUsd).toBe(0);
    expect(plan.paidBillingBlocked).toBe(true);
    expect(plan.skipped).toContainEqual({ providerId: "openai-free-share", reason: "paid_model_blocked" });
    expect(plan.skipped).toContainEqual({ providerId: "gemini-free", reason: "hard_blocked_until_utc_reset" });
  });
});

describe("StudioFreeAiResponseCache (PII 안전 SHA-256 + Bounded LRU + TTL 캐시)", () => {
  it("정규화 프롬프트로 결정적 SHA-256 키를 생성하고 히트율과 절감 토큰 수를 정확히 집계한다", () => {
    const t0 = Date.parse("2026-11-26T08:00:00.000Z");
    const cache = new StudioFreeAiResponseCache({ maxEntries: 16, ttlMs: 60_000 });

    expect(normalizePromptForCache("  웹툰   3컷   연출\n추천  ")).toBe("웹툰 3컷 연출 추천");
    const k1 = buildFreeAiCacheKey("panel-pacing", "ko-KR", "  웹툰   3컷   연출\n추천  ");
    const k2 = buildFreeAiCacheKey("PANEL-PACING", "ko-kr", "웹툰 3컷 연출 추천");
    const k3 = buildFreeAiCacheKey("panel-pacing", "en-US", "웹툰 3컷 연출 추천");
    expect(k1).toBe(k2);
    expect(k1).toMatch(/^[0-9a-f]{64}$/u);
    expect(k1).not.toBe(k3);

    const miss = cache.get({ mode: "panel-pacing", locale: "ko-KR", prompt: "웹툰 3컷 연출 추천" }, t0);
    expect(miss.hit).toBe(false);
    expect(miss.bypassed).toBe(false);

    const stored = cache.set(
      { mode: "panel-pacing", locale: "ko-KR", prompt: "웹툰 3컷 연출 추천" },
      { providerId: "groq-free", model: "llama-3.3-70b-versatile", content: '{"ok":true}', tokensSavedEstimate: 420 },
      t0,
    );
    expect(stored.stored).toBe(true);
    expect(stored.key).toBe(k1);

    const hit1 = cache.get({ mode: "panel-pacing", locale: "ko-KR", prompt: "  웹툰   3컷\t연출 추천 " }, t0 + 1_000);
    const hit2 = cache.get({ mode: "PANEL-PACING", locale: "ko-kr", prompt: "웹툰 3컷 연출 추천" }, t0 + 2_000);
    expect(hit1.hit).toBe(true);
    expect(hit1.entry?.content).toBe('{"ok":true}');
    expect(hit2.hit).toBe(true);

    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(2 / 3, 4);
    expect(stats.tokensSavedEstimate).toBe(840);
    expect(stats.costGuaranteedZeroUsd).toBe(0);
    expect(stats.paidBillingBlocked).toBe(true);
  });

  it("Bounded LRU 용량 초과 제거와 TTL 만료를 정확히 적용한다", () => {
    const t0 = Date.parse("2026-11-26T09:00:00.000Z");
    const cache = new StudioFreeAiResponseCache({ maxEntries: 2, ttlMs: 5_000 });

    cache.set(
      { mode: "story", locale: "ko", prompt: "프롬프트 A" },
      { providerId: "gemini-free", model: "gemini-2.5-flash", content: "A", tokensSavedEstimate: 100 },
      t0,
    );
    cache.set(
      { mode: "story", locale: "ko", prompt: "프롬프트 B" },
      { providerId: "gemini-free", model: "gemini-2.5-flash", content: "B", tokensSavedEstimate: 100 },
      t0 + 100,
    );
    // A를 조회해 MRU로 승격 -> 다음 C 삽입 시 B가 제거되어야 함
    expect(cache.get({ mode: "story", locale: "ko", prompt: "프롬프트 A" }, t0 + 200).hit).toBe(true);

    cache.set(
      { mode: "story", locale: "ko", prompt: "프롬프트 C" },
      { providerId: "gemini-free", model: "gemini-2.5-flash", content: "C", tokensSavedEstimate: 100 },
      t0 + 300,
    );

    expect(cache.get({ mode: "story", locale: "ko", prompt: "프롬프트 B" }, t0 + 400).hit).toBe(false);
    expect(cache.get({ mode: "story", locale: "ko", prompt: "프롬프트 A" }, t0 + 400).hit).toBe(true);
    expect(cache.getStats().lruEvictions).toBe(1);

    // TTL 만료(t0 + 6,000ms) -> A 만료 제거
    expect(cache.get({ mode: "story", locale: "ko", prompt: "프롬프트 A" }, t0 + 6_000).hit).toBe(false);
    expect(cache.getStats().expiredEvictions).toBe(1);
  });

  it("보안 규칙: piiRedactedCount > 0, isPrivateUserContext === true, 원문 PII 포함 요청은 절대 캐싱·조회하지 않는다", () => {
    const t0 = Date.parse("2026-11-26T10:00:00.000Z");
    const cache = new StudioFreeAiResponseCache({ maxEntries: 16, ttlMs: 60_000 });

    // 먼저 동일 문구의 공개 캐시를 넣어 둔 상태에서도 비공개/PII 요청은 교차 노출되면 안 됨
    cache.set(
      { mode: "dialogue", locale: "ko", prompt: "주인공 대사 다듬기" },
      { providerId: "openai-free-share", model: "gpt-4o-mini", content: "공개 캐시", tokensSavedEstimate: 300 },
      t0,
    );

    // 1) piiRedactedCount > 0
    const piiWrite = cache.set(
      { mode: "dialogue", locale: "ko", prompt: "[연락처 비공개] 대사 수정", piiRedactedCount: 1 },
      { providerId: "openai-free-share", model: "gpt-4o-mini", content: "민감 응답", tokensSavedEstimate: 300 },
      t0,
    );
    const piiRead = cache.get(
      { mode: "dialogue", locale: "ko", prompt: "주인공 대사 다듬기", piiRedactedCount: 1 },
      t0,
    );
    expect(piiWrite.stored).toBe(false);
    expect(piiWrite.bypassed).toBe(true);
    expect(piiWrite.bypassReason).toBe("pii_redacted_bypass");
    expect(piiRead.hit).toBe(false);
    expect(piiRead.bypassed).toBe(true);
    expect(piiRead.entry).toBeNull();

    // 2) isPrivateUserContext === true
    const privateWrite = cache.set(
      { mode: "dialogue", locale: "ko", prompt: "미공개 연재 원고 대사", isPrivateUserContext: true },
      { providerId: "gemini-free", model: "gemini-2.5-flash", content: "비공개 응답", tokensSavedEstimate: 250 },
      t0,
    );
    const privateRead = cache.get(
      { mode: "dialogue", locale: "ko", prompt: "주인공 대사 다듬기", isPrivateUserContext: true },
      t0,
    );
    expect(privateWrite.stored).toBe(false);
    expect(privateWrite.bypassReason).toBe("private_user_context_bypass");
    expect(privateRead.hit).toBe(false);
    expect(privateRead.bypassReason).toBe("private_user_context_bypass");

    // 3) 방어 심층 검사: piiRedactedCount가 0이어도 원문에 이메일·전화번호가 남아 있으면 캐싱 차단
    const rawEmailWrite = cache.set(
      { mode: "dialogue", locale: "ko", prompt: "문의 author@example.com 로 연락", piiRedactedCount: 0 },
      { providerId: "groq-free", model: "llama-3.3-70b-versatile", content: "이메일 포함", tokensSavedEstimate: 150 },
      t0,
    );
    expect(rawEmailWrite.stored).toBe(false);
    expect(rawEmailWrite.bypassReason).toBe("pii_detected_in_prompt_bypass");

    const stats = cache.getStats();
    expect(stats.entries).toBe(1);
    expect(stats.bypassedWrites).toBe(3);
    expect(stats.bypassedLookups).toBe(2);
    expect(stats.tokensSavedEstimate).toBe(0);
  });
});
