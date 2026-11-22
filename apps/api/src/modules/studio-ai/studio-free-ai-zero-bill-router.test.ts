import { describe, expect, it, vi } from "vitest";

import { buildDeterministicAssistResult } from "./openai-assist/studio-assist-deterministic-fallback";
import { STUDIO_OPENAI_MODE_DESCRIPTORS } from "./openai-assist/studio-openai-prompt-catalog";
import {
  isFreeModelWhitelisted,
  resolveZeroBillFreeProviders,
  StudioFreeAiZeroBillRouter,
  ZERO_BILL_FREE_PROVIDER_ORDER,
} from "./studio-free-ai-zero-bill-router";
import { validateAssistModeStructuredOutput } from "./studio-openai-creative-assist.dto";

describe("StudioFreeAiZeroBillRouter (₩0 Fail-Closed 다중 무료 AI 캐스케이드)", () => {
  it("무료 공급자 우선순위 9단계를 정확히 유지하고 키 값은 상태 응답에 절대 노출하지 않는다", () => {
    const fakeSecrets = {
      OPENAI_API_KEY: ["sk", "share", "secretValueOpenAi999"].join("-"),
      GEMINI_API_KEY: ["AIza", "FakeGeminiKeyValue12345678901234"].join(""),
      STUDIO_AI_FREE_GITHUB_MODELS_API_KEY: ["ghp", "FakeGithubModelsToken99999999"].join("_"),
      STUDIO_AI_FREE_CLOUDFLARE_API_TOKEN: "cf-secret-token-value-1234567890",
      STUDIO_AI_FREE_CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
      ONPOD_API_ENV_STUDIO_AI_FREE_MISTRAL_API_KEY: "mistral-secret-key-999999",
      ONPOD_API_ENV_STUDIO_AI_FREE_SAMBANOVA_API_KEY: "sambanova-secret-key-888888",
      STUDIO_AI_FREE_GROQ_API_KEY: ["gsk", "FakeGroqKeyValue9999999999"].join("_"),
      STUDIO_AI_FREE_OPENROUTER_API_KEY: ["sk", "or", "v1", "FakeOpenRouterKey7777"].join("-"),
    };

    const router = new StudioFreeAiZeroBillRouter();
    const status = router.getFreeQuotaStatus(fakeSecrets, Date.parse("2026-11-21T10:00:00.000Z"));

    expect(status.guaranteedZeroCostUsd).toBe(0);
    expect(status.guaranteedZeroCostLabel).toBe("$0.00");
    expect(status.guaranteedZeroCostKrwLabel).toBe("₩0");
    expect(status.paidBillingBlocked).toBe(true);
    expect(status.safetyCutoffRatio).toBe(0.9);
    expect(status.providers.map((p) => p.id)).toEqual([...ZERO_BILL_FREE_PROVIDER_ORDER]);
    expect(status.summary.configuredCloudCount).toBe(8);
    expect(status.summary.activeCloudCount).toBe(8);
    expect(status.summary.localFallbackReady).toBe(true);

    const serialized = JSON.stringify(status);
    for (const secretVal of Object.values(fakeSecrets)) {
      expect(serialized).not.toContain(secretVal);
    }
  });

  it("유료 전용 모델(OpenAI o3/gpt-5, Gemini 2.5 Pro, OpenRouter 유료)은 네트워크 호출 전에 즉시 차단한다", async () => {
    expect(isFreeModelWhitelisted("openai-free-share", "gpt-4o-mini").allowed).toBe(true);
    expect(isFreeModelWhitelisted("openai-free-share", "gpt-4.1-mini").allowed).toBe(true);
    expect(isFreeModelWhitelisted("openai-free-share", "gpt-4o").allowed).toBe(true);
    expect(isFreeModelWhitelisted("openai-free-share", "o3")).toEqual({
      allowed: false,
      blockReason: "paid_model_blocked",
    });
    expect(isFreeModelWhitelisted("openai-free-share", "gpt-4.1-nano")).toEqual({
      allowed: false,
      blockReason: "retired_model_blocked",
    });

    expect(isFreeModelWhitelisted("gemini-free", "gemini-2.5-flash").allowed).toBe(true);
    expect(isFreeModelWhitelisted("gemini-free", "gemini-2.5-flash-lite").allowed).toBe(true);
    expect(isFreeModelWhitelisted("gemini-free", "gemini-2.5-pro")).toEqual({
      allowed: false,
      blockReason: "paid_model_blocked",
    });

    expect(isFreeModelWhitelisted("openrouter-free", "openrouter/free").allowed).toBe(true);
    expect(isFreeModelWhitelisted("openrouter-free", "meta-llama/llama-3.3:free").allowed).toBe(true);
    expect(isFreeModelWhitelisted("openrouter-free", "openai/gpt-4o")).toEqual({
      allowed: false,
      blockReason: "paid_model_blocked",
    });

    const fetchMock = vi.fn<typeof fetch>();
    const router = new StudioFreeAiZeroBillRouter();
    const res = await router.executeCascade(
      {
        systemInstruction: "웹툰 연출 도우미",
        userPrompt: "테스트",
        localDeterministicOutput: () => '{"ok":true}',
      },
      {
        env: {
          OPENAI_API_KEY: "test-openai",
          OPENAI_MODEL: "gpt-5-paid",
          GEMINI_API_KEY: "test-gemini",
          GEMINI_MODEL: "gemini-2.5-pro",
          STUDIO_AI_FREE_OPENROUTER_API_KEY: "test-or",
          STUDIO_AI_FREE_OPENROUTER_MODEL: "anthropic/claude-opus-4",
        },
        fetchImpl: fetchMock,
      },
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
    expect(res.providerId).toBe("local-zero-cost-fallback");
    expect(res.costGuaranteedZeroUsd).toBe(0);
    expect(res.attempts.some((a) => a.providerId === "openai-free-share" && a.reason === "paid_model_blocked")).toBe(true);
    expect(res.attempts.some((a) => a.providerId === "gemini-free" && a.reason === "paid_model_blocked")).toBe(true);
    expect(res.attempts.some((a) => a.providerId === "openrouter-free" && a.reason === "paid_model_blocked")).toBe(true);
  });

  it("HTTP 402/429·insufficient_quota·billing_hard_limit 발생 시 다음 UTC 자정까지 차단하고 다음 무료 공급자로 자동 페일오버한다", async () => {
    const nowMs = Date.parse("2026-11-21T14:30:00.000Z");
    const router = new StudioFreeAiZeroBillRouter();
    const env = {
      OPENAI_API_KEY: "test-openai",
      GEMINI_API_KEY: "test-gemini",
      STUDIO_AI_FREE_GITHUB_MODELS_API_KEY: "test-github",
      ONPOD_API_ENV_STUDIO_AI_FREE_MISTRAL_API_KEY: "test-mistral",
    };

    const calledUrls: string[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      const target = url instanceof Request ? url.url : String(url);
      const hostname = new URL(target).hostname;
      calledUrls.push(target);
      if (hostname === "api.openai.com") {
        return new Response(
          JSON.stringify({ error: { code: "insufficient_quota", message: "No credits" } }),
          { status: 429 },
        );
      }
      if (hostname === "generativelanguage.googleapis.com") {
        return new Response(
          JSON.stringify({ error: { code: "billing_hard_limit_reached" } }),
          { status: 402 },
        );
      }
      if (hostname === "models.github.ai") {
        return new Response(JSON.stringify({ error: "rate limited" }), { status: 429 });
      }
      return new Response(
        JSON.stringify({
          model: "mistral-small-latest",
          choices: [{ message: { content: '{"summary":"성공"}' } }],
          usage: { prompt_tokens: 40, completion_tokens: 20, total_tokens: 60 },
        }),
        { status: 200 },
      );
    });

    const first = await router.executeCascade(
      {
        systemInstruction: "웹툰 연출 도우미",
        userPrompt: "장면 구성",
        maxOutputTokens: 128,
      },
      { env, fetchImpl: fetchMock, nowMs },
    );

    expect(first.ok).toBe(true);
    expect(first.providerId).toBe("mistral-free");
    expect(first.costGuaranteedZeroUsd).toBe(0);
    expect(calledUrls).toHaveLength(4);

    const status = router.getFreeQuotaStatus(env, nowMs);
    const openaiStatus = status.providers.find((p) => p.id === "openai-free-share");
    const geminiStatus = status.providers.find((p) => p.id === "gemini-free");
    const githubStatus = status.providers.find((p) => p.id === "github-models-free");
    expect(openaiStatus?.blocked).toBe(true);
    expect(openaiStatus?.blockReason).toBe("insufficient_quota");
    expect(openaiStatus?.blockedUntilUtc).toBe("2026-11-22T00:00:00.000Z");
    expect(geminiStatus?.blocked).toBe(true);
    expect(geminiStatus?.blockReason).toBe("http_402_payment_required");
    expect(githubStatus?.blocked).toBe(true);
    expect(githubStatus?.blockReason).toBe("http_429_rate_limit");

    // 같은 UTC 날 재요청 시 이미 차단된 3개 공급자는 재호출하지 않고 즉시 mistral-free로 직행한다.
    calledUrls.length = 0;
    const second = await router.executeCascade(
      { systemInstruction: "웹툰", userPrompt: "재요청", maxOutputTokens: 128 },
      { env, fetchImpl: fetchMock, nowMs: nowMs + 60_000 },
    );
    expect(second.providerId).toBe("mistral-free");
    expect(calledUrls).toEqual(["https://api.mistral.ai/v1/chat/completions"]);

    // 다음 UTC 자정이 지나면 차단이 자동 해제된다.
    const nextDayMs = Date.parse("2026-11-22T00:01:00.000Z");
    const resetStatus = router.getFreeQuotaStatus(env, nextDayMs);
    expect(resetStatus.providers.find((p) => p.id === "openai-free-share")?.blocked).toBe(false);
  });

  it("일일 토큰·요청 90% 안전선 도달 시 Fail-Closed 차단하고 다음 무료 공급자로 페일오버한다", async () => {
    const nowMs = Date.parse("2026-11-21T08:00:00.000Z");
    const router = new StudioFreeAiZeroBillRouter();
    const env = {
      OPENAI_API_KEY: "test-openai",
      STUDIO_FREE_AI_OPENAI_DAILY_REQUEST_CAP: "10",
      STUDIO_FREE_AI_OPENAI_DAILY_TOKEN_CAP: "1000",
      STUDIO_FREE_AI_SAFETY_CUTOFF_RATIO: "0.9",
      STUDIO_AI_FREE_GITHUB_MODELS_API_KEY: "test-github",
    };

    // 이미 900토큰(90% 안전선) 사용 시뮬레이션
    router.recordProviderUsage("openai-free-share", 900, env, nowMs);

    const status = router.getFreeQuotaStatus(env, nowMs);
    const openai = status.providers.find((p) => p.id === "openai-free-share");
    expect(openai?.blocked).toBe(true);
    expect(openai?.blockReason).toBe("safety_cutoff_90pct");
    expect(openai?.remainingSafeTokens).toBe(0);

    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      const target = url instanceof Request ? url.url : String(url);
      expect(new URL(target).hostname).toBe("models.github.ai");
      return new Response(
        JSON.stringify({
          model: "openai/gpt-4o-mini",
          choices: [{ message: { content: '{"ok":true}' } }],
          usage: { prompt_tokens: 20, completion_tokens: 15, total_tokens: 35 },
        }),
        { status: 200 },
      );
    });

    const result = await router.executeCascade(
      { systemInstruction: "sys", userPrompt: "usr", maxOutputTokens: 64 },
      { env, fetchImpl: fetchMock, nowMs },
    );
    expect(result.ok).toBe(true);
    expect(result.providerId).toBe("github-models-free");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("14종 웹툰 AI 보조 모드 전체가 ₩0 로컬 결정론적 폴백 스키마 검증을 통과한다", () => {
    expect(STUDIO_OPENAI_MODE_DESCRIPTORS).toHaveLength(14);
    for (const descriptor of STUDIO_OPENAI_MODE_DESCRIPTORS) {
      const fallback = buildDeterministicAssistResult(descriptor.id, {
        inputText: "비 오는 날 옥상에서 두 주인공이 마지막 대화를 나누는 장면",
        projectTitle: "장마전선",
        genreOrTone: "미스터리 로맨스",
      });
      const validated = validateAssistModeStructuredOutput(descriptor.id, fallback.data);
      expect(validated).not.toBeNull();
      expect(validated?.mode).toBe(descriptor.id);
    }
  });

  it("ONPOD_API_ENV_STUDIO_AI_FREE_* 환경변수와 GOOGLE_AI_API_KEY를 정상 해석한다", () => {
    const resolved = resolveZeroBillFreeProviders({
      GOOGLE_AI_API_KEY: "test-google-ai",
      ONPOD_API_ENV_STUDIO_AI_FREE_SAMBANOVA_API_KEY: "test-samba",
      ONPOD_API_ENV_STUDIO_AI_FREE_GROQ_API_KEY: "test-groq",
    });
    expect(resolved.find((p) => p.id === "gemini-free")?.configured).toBe(true);
    expect(resolved.find((p) => p.id === "sambanova-free")?.configured).toBe(true);
    expect(resolved.find((p) => p.id === "groq-free")?.configured).toBe(true);
  });

  it("클라우드 공급자 엔드포인트 호스트가 공식 도메인과 정확히 일치하고 위조된 로컬 Ollama URL은 차단한다", () => {
    const resolved = resolveZeroBillFreeProviders({
      OPENAI_API_KEY: "test-openai",
      GEMINI_API_KEY: "test-gemini",
      STUDIO_AI_FREE_GITHUB_MODELS_API_KEY: "test-github",
      STUDIO_AI_FREE_CLOUDFLARE_API_TOKEN: "test-cf",
      STUDIO_AI_FREE_CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
      STUDIO_AI_FREE_MISTRAL_API_KEY: "test-mistral",
      STUDIO_AI_FREE_SAMBANOVA_API_KEY: "test-samba",
      STUDIO_AI_FREE_GROQ_API_KEY: "test-groq",
      STUDIO_AI_FREE_OPENROUTER_API_KEY: "test-or",
      STUDIO_LOCAL_OLLAMA_URL: "http://localhost.evil.example:11434",
    });

    const expectedHosts: Record<string, string> = {
      "openai-free-share": "api.openai.com",
      "gemini-free": "generativelanguage.googleapis.com",
      "github-models-free": "models.github.ai",
      "cloudflare-workers-ai-free": "api.cloudflare.com",
      "mistral-free": "api.mistral.ai",
      "sambanova-free": "api.sambanova.ai",
      "groq-free": "api.groq.com",
      "openrouter-free": "openrouter.ai",
    };

    for (const [providerId, expectedHost] of Object.entries(expectedHosts)) {
      const provider = resolved.find((item) => item.id === providerId);
      expect(provider?.configured).toBe(true);
      expect(new URL(provider!.endpoint).hostname).toBe(expectedHost);
    }

    const localFallback = resolved.find((item) => item.id === "local-zero-cost-fallback");
    expect(localFallback?.endpoint).toBe("local://toonstudio-deterministic-coach");
  });
});
