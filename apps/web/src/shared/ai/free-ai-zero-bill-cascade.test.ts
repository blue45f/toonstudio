// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  buildLocalZeroCostAssistResult,
  computeZeroBillSafetyGauge,
  createOfflineZeroBillQuotaSnapshot,
  fetchFreeAiQuotaStatus,
  FREE_AI_14_ASSIST_MODES,
  FREE_AI_14_MODE_IDS,
  maskCreatorInputBeforeAiSend,
  runFreeAiZeroBillAssist,
} from "./free-ai-zero-bill-cascade";

describe("free-ai-zero-bill-cascade (웹 무과금 14모드 캐스케이드)", () => {
  it("경쟁 앱 벤치마킹 기반 14종 웹툰 AI 보조 모드와 초보자 예시를 모두 정의한다", () => {
    expect(FREE_AI_14_ASSIST_MODES).toHaveLength(14);
    expect(FREE_AI_14_ASSIST_MODES.map((m) => m.id)).toEqual([...FREE_AI_14_MODE_IDS]);
    for (const mode of FREE_AI_14_ASSIST_MODES) {
      expect(mode.labelKo.length).toBeGreaterThan(2);
      expect(mode.samplePromptKo.length).toBeGreaterThan(10);
      const local = buildLocalZeroCostAssistResult({
        mode: mode.id,
        inputText: mode.samplePromptKo,
        projectTitle: "테스트 웹툰",
      });
      expect(local.costGuaranteedZeroUsd).toBe(0);
      expect(local.paidBillingBlocked).toBe(true);
      expect(local.bulletsKo.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("전송 전에 이메일·전화번호·API 키를 클라이언트에서 먼저 마스킹한다", () => {
    const fakeKey = ["sk", "test", "abcdefghijklmnopqr"].join("-");
    const masked = maskCreatorInputBeforeAiSend(
      `문의 author@example.com / 010-1234-5678 / ${fakeKey}`,
    );
    expect(masked.redactedCount).toBe(3);
    expect(masked.sanitizedText).not.toContain("author@example.com");
    expect(masked.sanitizedText).not.toContain("010-1234-5678");
    expect(masked.sanitizedText).not.toContain(fakeKey);
  });

  it("GET /api/studio/ai/free-quota-status 오프라인 시 안전한 ₩0 스냅샷과 게이지를 반환한다", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    const snapshot = await fetchFreeAiQuotaStatus({ fetchImpl: fetchMock });

    expect(snapshot.guaranteedZeroCostUsd).toBe(0);
    expect(snapshot.guaranteedZeroCostLabel).toBe("$0.00");
    expect(snapshot.paidBillingBlocked).toBe(true);
    expect(snapshot.offlineFallback).toBe(true);

    const gauge = computeZeroBillSafetyGauge(snapshot);
    expect(gauge.status).toBe("safe");
    expect(gauge.badgeTextKo).toContain("유료 과금 0원 보호 ON");
  });

  it("모든 클라우드 무료 공급자가 90% 안전선으로 차단되면 게이지가 cutoff-local 상태를 표시한다", () => {
    const base = createOfflineZeroBillQuotaSnapshot();
    const blockedSnapshot = {
      ...base,
      providers: [
        {
          ...base.providers[0],
          configured: true,
          blocked: true,
          blockReason: "safety_cutoff_90pct",
          utilizationPct: 92,
          remainingSafeRequests: 0,
        },
        base.providers[1],
      ],
    };
    const gauge = computeZeroBillSafetyGauge(blockedSnapshot);
    expect(gauge.status).toBe("cutoff-local");
    expect(gauge.activeCloudCount).toBe(0);
    expect(gauge.detailTextKo).toContain("90%");
  });

  it.each([402, 429])(
    "서버가 HTTP %s(할당량·결제 차단)를 반환하면 유료 전환 없이 로컬 무과금 코치(₩0)로 폴백한다",
    async (statusCode) => {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ code: "insufficient_quota" }), { status: statusCode }),
      );
      const result = await runFreeAiZeroBillAssist(
        {
          mode: "photoshop-fx-recipe",
          inputText: "비 오는 야간 옥상 림라이트 보정",
        },
        { fetchImpl: fetchMock, sessionToken: "user-1" },
      );

      expect(result.ok).toBe(true);
      expect(result.providerId).toBe("local-zero-cost-fallback");
      expect(result.costGuaranteedZeroUsd).toBe(0);
      expect(result.paidBillingBlocked).toBe(true);
      expect(result.fallbackNoticeKo).toContain("₩0");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("서버 무료 클라우드 응답 성공 시 구조화 결과를 한국어 요약과 함께 반환한다", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          provider: "github-models-free",
          providerTier: "cloud-free",
          model: "openai/gpt-4o-mini",
          costGuaranteedZeroUsd: 0,
          paidBillingBlocked: true,
          privacy: { storeData: false, piiRedactedCount: 0 },
          result: {
            mode: "sfx-onomatopoeia-lab",
            data: {
              sceneEnergy: "강렬한 정적 후 충격",
              suggestions: [
                {
                  ko: "콰앙—!",
                  ja: "ドォン！",
                  en: "BOOM!",
                  intent: "문 충격음",
                  typographyTip: "굵은 고딕",
                  placementHint: "상단 우측",
                },
              ],
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await runFreeAiZeroBillAssist(
      {
        mode: "sfx-onomatopoeia-lab",
        inputText: "철문이 거칠게 닫히는 소리",
      },
      { fetchImpl: fetchMock, sessionToken: "user-2" },
    );

    expect(result.providerId).toBe("github-models-free");
    expect(result.providerTier).toBe("cloud-free");
    expect(result.costGuaranteedZeroUsd).toBe(0);
    expect(result.headlineKo).toBe("강렬한 정적 후 충격");
    expect(result.bulletsKo[0]).toContain("콰앙—!");
  });
});
