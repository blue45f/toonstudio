import { describe, expect, it, vi } from "vitest";

import {
  cosineSimilarity256,
  l2NormalizeVector256,
  OfflineSemanticCatalogIndex,
  OnDeviceZeroTokenRouter,
  probeOnDeviceAiCapabilities,
  SEMANTIC_VECTOR_DIM,
  SERVER_FREE_9POOL_DAILY_CAPACITY,
  type BrowserBuiltInAiGlobal,
  type CatalogSemanticIndex256d,
} from "./index";

function makeBasisVector256(weights: Readonly<Record<number, number>>): number[] {
  const vec = new Array<number>(SEMANTIC_VECTOR_DIM).fill(0);
  for (const [axis, value] of Object.entries(weights)) {
    vec[Number(axis)] = value;
  }
  return vec;
}

function buildSampleCatalog256d(): CatalogSemanticIndex256d {
  return {
    version: "2026-11-26",
    dimensions: SEMANTIC_VECTOR_DIM,
    normalized: false,
    entries: [
      {
        id: "brush-sumi-wash",
        title: "수묵 번짐 브러시",
        category: "brush",
        tags: ["수묵", "동양화", "먹물"],
        vector: makeBasisVector256({ 0: 3, 1: 4 }), // unit: (0.6, 0.8)
      },
      {
        id: "brush-gpen-sharp",
        title: "선명한 G펜",
        category: "brush",
        tags: ["선화", "펜터치"],
        vector: makeBasisVector256({ 0: 1, 2: 0.2 }),
      },
      {
        id: "bg3d-cafe-sunset",
        title: "노을 카페 3D 배경",
        category: "background",
        tags: ["카페", "노을", "실내"],
        vector: makeBasisVector256({ 10: 5, 11: 0 }),
      },
      {
        id: "sfx-impact-burst",
        title: "임팩트 집중선 효과음",
        category: "sfx",
        tags: ["액션", "타격"],
        vector: makeBasisVector256({ 20: 1, 21: 1 }),
      },
    ],
  };
}

describe("OfflineSemanticCatalogIndex (Tier 0A: 오프라인 256차원 코사인 시맨틱 검색)", () => {
  it("256차원 L2 정규화·코사인 유사도 랭킹과 카테고리·임계값 필터를 정확히 수행한다", () => {
    const unit = l2NormalizeVector256(makeBasisVector256({ 0: 3, 1: 4 }));
    expect(unit[0]).toBeCloseTo(0.6, 6);
    expect(unit[1]).toBeCloseTo(0.8, 6);

    const exact = cosineSimilarity256(makeBasisVector256({ 0: 3, 1: 4 }), makeBasisVector256({ 0: 6, 1: 8 }));
    const ortho = cosineSimilarity256(makeBasisVector256({ 0: 1 }), makeBasisVector256({ 10: 1 }));
    expect(exact).toBeCloseTo(1, 6);
    expect(ortho).toBeCloseTo(0, 6);

    const index = new OfflineSemanticCatalogIndex(buildSampleCatalog256d());
    expect(index.size).toBe(4);
    expect(index.dimensions).toBe(256);

    // (0.6, 0.8) 방향 질의 -> brush-sumi-wash(1.0)가 1위, brush-gpen-sharp(~0.588)가 2위
    const query = makeBasisVector256({ 0: 0.6, 1: 0.8 });
    const ranked = index.search(query, { topK: 3, minScore: 0.5 });
    expect(ranked.map((r) => r.id)).toEqual(["brush-sumi-wash", "brush-gpen-sharp"]);
    expect(ranked[0].score).toBeCloseTo(1, 5);
    expect(ranked[1].score).toBeCloseTo(0.6 / Math.sqrt(1.04), 4);

    // 카테고리 필터 적용 시 background만 반환
    const bgMatches = index.search(makeBasisVector256({ 10: 1 }), { category: "background", minScore: 0.9 });
    expect(bgMatches).toHaveLength(1);
    expect(bgMatches[0].id).toBe("bg3d-cafe-sunset");

    // 256차원이 아닌 벡터는 즉시 RangeError로 차단
    expect(() => index.search([1, 2, 3])).toThrow(RangeError);
  });
});

describe("probeOnDeviceAiCapabilities (Chrome 내장 AI 탐지 + 타임아웃 보호)", () => {
  it("표준 globalThis.LanguageModel 및 globalThis.Translator를 탐지한다", async () => {
    const fakeGlobal: BrowserBuiltInAiGlobal = {
      LanguageModel: {
        availability: vi.fn(async () => "available"),
        create: vi.fn(),
      },
      Translator: {
        availability: vi.fn(async () => "available"),
        create: vi.fn(),
      },
    };
    const caps = await probeOnDeviceAiCapabilities({ globalObject: fakeGlobal, probeTimeoutMs: 200 });
    expect(caps.promptApiSurface).toBe("global-language-model");
    expect(caps.promptApiStatus).toBe("available");
    expect(caps.promptApiReady).toBe(true);
    expect(caps.translatorSurface).toBe("global-translator");
    expect(caps.translatorStatus).toBe("available");
    expect(caps.translatorReady).toBe(true);
  });

  it("레거시 globalThis.ai.languageModel('readily')과 응답 지연 타임아웃을 안전하게 처리한다", async () => {
    const fakeGlobal: BrowserBuiltInAiGlobal = {
      ai: {
        languageModel: {
          capabilities: vi.fn(async () => ({ available: "readily" })),
          create: vi.fn(),
        },
      },
      Translator: {
        availability: vi.fn(() => new Promise<string>(() => undefined)), // 의도적 무한 대기
        create: vi.fn(),
      },
    };
    const caps = await probeOnDeviceAiCapabilities({ globalObject: fakeGlobal, probeTimeoutMs: 30 });
    expect(caps.promptApiSurface).toBe("ai-language-model");
    expect(caps.promptApiReady).toBe(true);
    expect(caps.translatorSurface).toBe("global-translator");
    expect(caps.translatorStatus).toBe("timeout");
    expect(caps.translatorReady).toBe(false);
  });
});

describe("OnDeviceZeroTokenRouter (3-Tier ₩0 클라이언트 우선 라우팅 + 텔레메트리)", () => {
  it("Tier 0A 오프라인 시맨틱 히트 시 네트워크 0회·토큰 0개로 즉시 응답하고 서버를 호출하지 않는다", async () => {
    const serverFreeAdapter = vi.fn();
    const router = new OnDeviceZeroTokenRouter({
      globalObject: {},
      semanticIndex: buildSampleCatalog256d(),
      serverFreeAdapter,
      semanticHitMinScore: 0.72,
    });

    const result = await router.route({
      task: "semantic-search",
      prompt: "노을 지는 카페 3D 배경 추천",
      queryVector: makeBasisVector256({ 10: 1 }),
      estimatedCloudTokens: 320,
    });

    expect(result.ok).toBe(true);
    expect(result.tier).toBe("tier-0a-offline-semantic");
    expect(result.networkCallsMade).toBe(0);
    expect(result.cloudTokensUsed).toBe(0);
    expect(result.estimatedTokensSaved).toBe(320);
    expect(result.platformCostUsd).toBe(0);
    expect(result.paidServerBillingBlocked).toBe(true);
    expect(result.semanticMatches?.[0]?.id).toBe("bg3d-cafe-sunset");
    expect(serverFreeAdapter).not.toHaveBeenCalled();
  });

  it("Tier 0B 브라우저 내장 Prompt API·Translator API로 0서버·0토큰 처리하고 세션을 자동 destroy한다", async () => {
    const promptDestroy = vi.fn();
    const translatorDestroy = vi.fn();
    const serverFreeAdapter = vi.fn();

    const fakeGlobal: BrowserBuiltInAiGlobal = {
      LanguageModel: {
        availability: vi.fn(async () => "available"),
        create: vi.fn(async () => ({
          prompt: vi.fn(async () => "3컷 클로즈업으로 긴장감을 높이세요."),
          destroy: promptDestroy,
        })),
      },
      Translator: {
        availability: vi.fn(async () => "available"),
        create: vi.fn(async () => ({
          translate: vi.fn(async () => "Hold on, we are almost there!"),
          destroy: translatorDestroy,
        })),
      },
    };

    const router = new OnDeviceZeroTokenRouter({
      globalObject: fakeGlobal,
      serverFreeAdapter,
    });

    const promptRes = await router.route({
      task: "prompt",
      prompt: "웹툰 액션 씬 연출 제안",
      estimatedCloudTokens: 450,
    });
    expect(promptRes.ok).toBe(true);
    expect(promptRes.tier).toBe("tier-0b-browser-ondevice");
    expect(promptRes.networkCallsMade).toBe(0);
    expect(promptRes.cloudTokensUsed).toBe(0);
    expect(promptRes.providerLabel).toBe("browser:global-language-model");
    expect(promptDestroy).toHaveBeenCalledTimes(1);

    const trRes = await router.route({
      task: "translate",
      prompt: "잠깐만, 거의 다 왔어!",
      sourceLanguage: "ko",
      targetLanguage: "en",
      estimatedCloudTokens: 180,
    });
    expect(trRes.ok).toBe(true);
    expect(trRes.tier).toBe("tier-0b-browser-ondevice");
    expect(trRes.content).toBe("Hold on, we are almost there!");
    expect(trRes.providerLabel).toBe("browser:global-translator");
    expect(translatorDestroy).toHaveBeenCalledTimes(1);
    expect(serverFreeAdapter).not.toHaveBeenCalled();
  });

  it("온디바이스 실패·타임아웃 -> Tier 1(서버 9-Pool 1,470 req/day) -> Tier 2(BYOK) 순으로 폴백하고 텔레메트리를 정확히 집계한다", async () => {
    const destroySpy = vi.fn();
    const fakeGlobal: BrowserBuiltInAiGlobal = {
      LanguageModel: {
        availability: vi.fn(async () => "available"),
        create: vi.fn(async () => ({
          prompt: vi.fn(async () => {
            throw new Error("NPU context lost");
          }),
          destroy: destroySpy,
        })),
      },
    };

    const serverFreeAdapter = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        content: '{"tips":["대비 강화"]}',
        providerLabel: "server-9pool:groq-free",
        cloudTokensUsed: 210,
      })
      .mockResolvedValueOnce({
        ok: false,
        content: "",
        providerLabel: "server-9pool:exhausted",
        errorCode: "ALL_FREE_PROVIDERS_EXHAUSTED",
      })
      .mockResolvedValueOnce({
        ok: false,
        content: "",
        providerLabel: "server-9pool:exhausted",
        errorCode: "ALL_FREE_PROVIDERS_EXHAUSTED",
      });

    const userByokAdapter = vi.fn(async () => ({
      ok: true,
      content: '{"tips":["사용자 키 응답"]}',
      providerLabel: "user-byok:openai",
      cloudTokensUsed: 190,
    }));

    const router = new OnDeviceZeroTokenRouter({
      globalObject: fakeGlobal,
      semanticIndex: buildSampleCatalog256d(),
      serverFreeAdapter,
      userByokAdapter,
    });

    // 1) Tier 0A 히트 (0토큰)
    const r1 = await router.route({
      task: "semantic-search",
      prompt: "수묵 브러시 찾기",
      queryVector: makeBasisVector256({ 0: 3, 1: 4 }),
      estimatedCloudTokens: 300,
    });
    expect(r1.tier).toBe("tier-0a-offline-semantic");

    // 2) Tier 0B 예외 -> Tier 1 서버 9-Pool 무료 클라우드 폴백
    const r2 = await router.route({ task: "prompt", prompt: "컷 전환 팁" });
    expect(r2.ok).toBe(true);
    expect(r2.tier).toBe("tier-1-server-free-9pool");
    expect(r2.networkCallsMade).toBe(1);
    expect(r2.platformCostUsd).toBe(0);
    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(r2.attempts.some((a) => a.tier === "tier-0b-browser-ondevice" && a.reason === "ondevice_prompt_error")).toBe(true);

    // 3) Tier 1 소진 + allowByokFallback 미허용 -> Fail-Closed (BYOK 무단 호출 금지)
    const r3 = await router.route({ task: "prompt", prompt: "대사 다듬기", allowByokFallback: false });
    expect(r3.ok).toBe(false);
    expect(r3.tier).toBe("none");
    expect(r3.errorCode).toBe("ALL_ZERO_COST_TIERS_UNAVAILABLE");
    expect(userByokAdapter).not.toHaveBeenCalled();

    // 4) Tier 1 소진 + allowByokFallback 허용 -> Tier 2 BYOK 폴백
    const r4 = await router.route({ task: "prompt", prompt: "대사 다듬기", allowByokFallback: true });
    expect(r4.ok).toBe(true);
    expect(r4.tier).toBe("tier-2-user-byok");
    expect(r4.platformCostUsd).toBe(0);
    expect(userByokAdapter).toHaveBeenCalledTimes(1);

    const telemetry = router.getTelemetry();
    expect(telemetry.totalRequests).toBe(4);
    expect(telemetry.tierHits).toEqual({
      tier0aOfflineSemantic: 1,
      tier0bBrowserOndevice: 0,
      tier1ServerFree9Pool: 1,
      tier2UserByok: 1,
      unresolved: 1,
    });
    expect(telemetry.zeroNetworkRequests).toBe(1);
    expect(telemetry.zeroTokenRequests).toBe(1);
    expect(telemetry.zeroTokenRatio).toBe(0.25);
    expect(telemetry.estimatedCloudTokensSaved).toBe(300);
    expect(telemetry.onDeviceFallbacks).toBe(3);
    expect(telemetry.serverFreePoolDailyCapacity).toBe(SERVER_FREE_9POOL_DAILY_CAPACITY);
    expect(telemetry.platformCostUsd).toBe(0);
  });
});
