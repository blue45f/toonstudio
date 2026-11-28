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

  it("서버 연결이 끊겨도 6컷 원고의 화자, 무언 연기, 마지막 컷을 화면과 복사 결과에 담는다", async () => {
    const result = await runFreeAiZeroBillAssist({
      mode: "script-to-cuts", projectTitle: "우산",
      inputText: [
        "1컷: 민서가 우산을 편다.", "2컷: 서리: “내일 반납할게.”", "3컷: 쪽지에 ‘정류장’이라고 적혀 있다.",
        "4컷: 민서가 고개를 끄덕인다.", "5컷: 서리가 뒤돌아본다.", "6컷: 정류장의 불이 꺼진다.",
      ].join("\n"),
    }, { fetchImpl: async () => { throw new Error("offline"); } });
    expect(result.providerTier).toBe("local-fallback");
    expect(result.rawData.cuts).toHaveLength(6);
    expect(result.rawData.cuts).toMatchObject([
      { dialogue: "" }, { dialogue: "내일 반납할게." }, { dialogue: "" }, { dialogue: "" }, { dialogue: "" }, { dialogue: "" },
    ]);
    expect(result.bulletsKo.filter((bullet) => /^\d+컷/u.test(bullet))).toHaveLength(6);
    expect(result.bulletsKo.join("\n")).toContain("서리: “내일 반납할게.”");
    expect(result.bulletsKo.at(-1)).toContain("6컷 · 정류장의 불이 꺼진다.");
  });

  it("기기 대사와 서버 대사 모두 보조 말풍선의 조건·기한·존댓말까지 표시한다", async () => {
    const input = {
      mode: "dialogue-polish" as const,
      inputText: "수아의 대사: ‘저는 이것을 한 번 더 확인하고 싶습니다. 내일 오전까지 보내도 괜찮을까요?’",
    };
    const device = buildLocalZeroCostAssistResult(input);
    expect(device.rawData.balloons).toHaveLength(3);
    const server = await runFreeAiZeroBillAssist(input, { fetchImpl: async () => Response.json({
      provider: "local-zero-cost-fallback", providerTier: "local-fallback", result: {
        mode: input.mode, data: { readabilityNote: device.headlineKo, balloons: device.rawData.balloons },
      },
    }) });
    expect(server.bulletsKo).toEqual(device.bulletsKo);
    for (const text of device.bulletsKo) {
      expect(text).toMatch(/저는 (이것을|이걸) 한 번 더 확인하고 싶습니다\. 내일 오전까지 보내도 괜찮을까요\?/u);
    }
  });

  it("기기 배색에서 서로 다른 지정색의 원문 순서를 지키고 부족한 색만 예시로 제시한다", () => {
    const withColors = buildLocalZeroCostAssistResult({
      mode: "color-mood-director", inputText: "원고 팔레트 #aBc, #AABBCC, #1234",
    });
    expect(withColors.rawData.palette).toMatchObject([
      { role: "원고 지정색", nameKo: "#aBc" }, { role: "원고 지정색", nameKo: "#1234" }, { role: "예시 후보" },
    ]);
    expect(withColors.bulletsKo.slice(0, 2)).toEqual([expect.stringContaining("#aBc"), expect.stringContaining("#1234")]);
    const withoutColors = buildLocalZeroCostAssistResult({ mode: "color-mood-director", inputText: "새벽 풍경" });
    expect(withoutColors.headlineKo).toContain("예시");
    expect(withoutColors.bulletsKo.filter((bullet) => bullet.includes("[예시 후보]"))).toHaveLength(3);
    const many = buildLocalZeroCostAssistResult({
      mode: "color-mood-director", inputText: "지정색 #111 #222 #333 #444 #555 #666 #777 #888 #999",
    });
    expect(many.bulletsKo.filter((bullet) => bullet.includes("[원고 지정색]"))).toHaveLength(8);
    expect(many.bulletsKo.join("\n")).toContain("#888");
    expect(many.bulletsKo.join("\n")).not.toContain("#999");
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

  it("발상 다섯 개를 첫 컷 연출과 함께 제작 순서대로 표시한다", async () => {
    const angles = ["contrarian", "personal-hook", "detail-evidence", "four-cut-playbook", "missed-angle"]
      .map((lens, index) => ({
        lens, lensLabelKo: `관점 ${index + 1}`, headline: `제목 ${index + 1}`,
        pitch: `줄거리 ${index + 1}`, firstCutHint: `반납함을 보여 주는 첫 컷 ${index + 1}`,
      }));
    const mode = "idea-remix";
    const result = await runFreeAiZeroBillAssist({ mode, inputText: "반납함에서 시작할 다섯 발상을 제안해 주세요." }, {
      fetchImpl: async () => Response.json({ provider: "github-models-free", providerTier: "cloud-free",
        result: { mode, data: { summary: "다섯 개의 도서관 이야기", angles } } }),
    });
    expect(result.bulletsKo).toEqual(angles.map((angle) =>
      `[${angle.lensLabelKo}] ${angle.headline} — ${angle.pitch} · 첫 컷: ${angle.firstCutHint}`));
  });

  it.each(["cloud-free", "local-fallback"] as const)("스크롤 구간별 권장 간격을 보존하고 실제 평가만 점수로 표시한다 (%s)", async (tier) => {
    const mode = "scroll-pacing-auditor";
    const gaps = [40, 60, 80, 100, 120];
    const data = {
      rhythmVerdict: "빈 좌석이 보이는 순간을 길게 유지하세요.", cliffhangerScore: 73,
      cliffhangerTip: "마지막 표정을 한 컷 더 잡으세요.", averageGapPx: 80,
      beatPacing: gaps.map((recommendedGapPx, i) => ({
        section: `${i + 1}번째 전환`, pacing: "steady", recommendedGapPx, readerRetentionNote: `전환 ${i + 1}을 확인하세요.`,
      })),
    };
    const result = await runFreeAiZeroBillAssist({ mode, inputText: "빈 좌석이 드러나는 장면의 호흡을 검토해 주세요." }, {
      fetchImpl: async () => Response.json({ provider: tier === "cloud-free" ? "github-models-free" : "local-zero-cost-fallback",
        providerTier: tier, result: { mode, data } }),
    });
    const text = result.bulletsKo.join("\n");
    for (const beat of data.beatPacing) expect(text).toContain(`${beat.section} · ${beat.recommendedGapPx}px`);
    expect(text).toContain("구간 평균 80px");
    expect(text).toContain(data.cliffhangerTip);
    expect(text.includes("73/100")).toBe(tier === "cloud-free");
  });

  it("필수 번역이 누락된 용어집은 완성된 검수 결과로 표시하지 않고 기기 내 안내로 전환한다", async () => {
    const mode = "localization-glossary-check";
    const result = await runFreeAiZeroBillAssist({ mode, inputText: "청야의 현지화 표기를 검수해 주세요." }, {
      fetchImpl: async () => Response.json({
        provider: "github-models-free", providerTier: "cloud-free",
        result: {
          mode,
          data: {
            targetLocales: ["en", "ja"],
            glossary: [
              { termKo: "청야", en: "Blue Night", ruleNote: "길드 이름은 띄어 쓴다." },
              { termKo: "잔향", en: "Echo", ja: "残響", ruleNote: "능력명은 대문자로 시작한다." },
            ],
            culturalNotes: [{ severity: "warn", topic: "식자", adaptationTip: "여백을 넓힌다." }],
          },
        },
      }),
    });
    expect(result.providerTier).toBe("local-fallback");
    expect(result.fallbackNoticeKo).toContain("응답 형식");
  });

  it.each([
    { mode: "continuity-plot-audit", headlineField: "summary", scoreField: "overallConsistencyScore", score: 84 },
    { mode: "scroll-pacing-auditor", headlineField: "rhythmVerdict", scoreField: "cliffhangerScore", score: 82 },
  ] as const)("$mode 로컬 예시는 화면·복사에 쓰는 요약에서 고정 점수를 제거한다", async ({ mode, headlineField, scoreField, score }) => {
    const input = { mode, inputText: "1컷에서 민서가 문을 열고 2컷에서 우산을 펼친다." };
    const headline = `원고 평가 ${score}/100`;
    const serverResult = (provider: string, providerTier: string) => runFreeAiZeroBillAssist(input, {
      fetchImpl: async () => Response.json({
        provider,
        providerTier,
        result: { mode, data: { [headlineField]: headline, [scoreField]: score } },
      }),
    });
    const offline = buildLocalZeroCostAssistResult(input);
    const fromLocalServer = await serverResult("local-zero-cost-fallback", "local-fallback");
    for (const result of [offline, fromLocalServer]) {
      expect(result.headlineKo).toContain("예시");
      expect([result.headlineKo, ...result.bulletsKo].join("\n")).not.toMatch(/\d+\/100/u);
    }
    const fromCloud = await serverResult("github-models-free", "cloud-free");
    expect(fromCloud.headlineKo).toBe(headline);
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
    expect(gauge.badgeTextKo).toContain("창작자 이용료 ₩0");
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

  it("계정 확인이 필요한 공급자의 실제 사용률과 차단 이유를 표시한다", () => {
    const base = createOfflineZeroBillQuotaSnapshot();
    const provider = { ...base.providers[0], configured: true, blocked: true, blockReason: "free_billing_unconfirmed" };
    const gauge = computeZeroBillSafetyGauge({ ...base, providers: [provider] });
    expect(gauge.utilizationPct).toBe(0);
    expect(gauge.detailTextKo).toContain("무료 자격과 추가 과금 차단 설정");
  });

  it("원고와 작품 제목·장르를 전송 전에 마스킹하고 오프라인 응답에도 같은 횟수를 표시한다", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    const input = {
      mode: "script-to-cuts" as const,
      inputText: "인물이 draft@example.com에 메일을 보낸다.",
      projectTitle: "title@example.com",
      genreOrTone: "tone@example.com",
    };
    const result = await runFreeAiZeroBillAssist(input, { fetchImpl: fetchMock });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.projectTitle).toBe("[이메일 비공개]");
    expect(body.genreOrTone).toBe("[이메일 비공개]");
    expect(body.inputText).toContain("[이메일 비공개]");
    expect(result.piiRedactedCount).toBe(3);
    expect(result.rawData.title).toBe("[이메일 비공개]");
    expect(JSON.stringify(result)).not.toContain("@example.com");
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
