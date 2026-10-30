import { describe, expect, it, vi } from "vitest";

import {
  buildDeterministicBraidPonytailAccessoryKnotLockView,
  buildDeterministicCapeCloakHemLiningFlutterLockView,
  buildDeterministicCharacterAgeFlashbackProportionLockView,
  buildDeterministicCharacterCanonView,
  buildDeterministicEnhancedPromptView,
  buildDeterministicMultiPlaneParallaxBokehLockView,
  buildDeterministicPropScreenUiHologramLockView,
  buildDeterministicSceneShadingView,
  buildDeterministicSwordHiltGuardScabbardLockView,
  runAssistBraidPonytailAccessoryKnotLockDirector,
  runAssistCapeCloakHemLiningFlutterLockDirector,
  runAssistCharacterAgeFlashbackProportionLockDirector,
  runAssistCharacterCanonArchitect,
  runAssistMultiPlaneParallaxBokehLockDirector,
  runAssistPromptEnhancer,
  runAssistPropScreenUiHologramLockDirector,
  runAssistSceneShadingDirector,
  runAssistSwordHiltGuardScabbardLockDirector,
} from "./ai-creator-domain-assist";
import {
  buildDeterministicBinauralSpatialAudioFoleyLufsView,
  buildDeterministicBreathFrostSmokePlumeLockView,
  buildDeterministicCastShadowSundialAzimuthLockView,
  buildDeterministicGazeSaccadePupilHighlightLockView,
  buildDeterministicImpactDebrisCraterPersistenceLockView,
  buildDeterministicWetFabricRainTranslucencyLockView,
  runAssistAuthorHandoverSummary,
  runAssistBgmPlacementPlan,
  runAssistBinauralSpatialAudioFoleyLufsDirector,
  runAssistBreathFrostSmokePlumeLockDirector,
  runAssistCastShadowSundialAzimuthLockDirector,
  runAssistCutDialogueSuggest,
  runAssistDirectionPlan,
  runAssistGazeSaccadePupilHighlightLockDirector,
  runAssistImpactDebrisCraterPersistenceLockDirector,
  runAssistN7OrchestrationPipeline,
  runAssistPlotSummaryAndSynopsis,
  runAssistReviewCommentInterpreter,
  runAssistStoryboardCutPlan,
  runAssistSupportFaqAnswer,
  runAssistWetFabricRainTranslucencyLockDirector,
  stripJsonCodeFence,
} from "./assist-n7-and-llm-runners";

import * as assistTransport from "@/shared/ai/assist/assist-transport";

describe("claude-creator-domain-assist & claude-n7-and-llm-runners", () => {
  it("캐릭터 캐논·프롬프트 증강·2단 셀 음영의 결정적 폴백 및 Claude 구조화 출력을 검증한다", async () => {
    const canonFallback = buildDeterministicCharacterCanonView({
      name: "서진",
      genre: "로맨스 판타지",
      roughNotes: "황태자, 칠흑색 눈동자",
    });
    expect(canonFallback.source).toBe("deterministic-fallback");
    expect(canonFallback.appearanceKo).toContain("서진");
    expect(canonFallback.traitTags.length).toBeGreaterThan(0);

    const promptFallback = buildDeterministicEnhancedPromptView(
      "검을 뽑아 들고 결투를 준비하는 기사",
    );
    expect(promptFallback.detectedGenre).toBe("action");
    expect(promptFallback.enhancedPositivePrompt).toContain("dynamic action pose");

    const shadingFallback = buildDeterministicSceneShadingView({
      direction: "top-left",
      intensityPercent: 80,
      softnessPercent: 20,
      temperature: "cool-moon",
      enableRimLight: true,
    });
    expect(shadingFallback.shadow1ColorHex).toBe("#1e1b4b");
    expect(shadingFallback.colorHoldInkHex).toBe("#2E1035");

    // 오프라인 폴백 동작 확인
    const parseSpy = vi
      .spyOn(assistTransport, "assistParse")
      .mockRejectedValue(new Error("simulated offline"));

    const canonRes = await runAssistCharacterCanonArchitect({ name: "하윤" });
    expect(canonRes.source).toBe("deterministic-fallback");

    const promptRes = await runAssistPromptEnhancer("마법진이 빛나는 성소");
    expect(promptRes.detectedGenre).toBe("fantasy");

    const shadingRes = await runAssistSceneShadingDirector({
      direction: "backlight-rim",
      intensityPercent: 90,
      softnessPercent: 15,
      temperature: "sunset-golden",
      enableRimLight: true,
    });
    expect(shadingRes.source).toBe("deterministic-fallback");

    parseSpy.mockRestore();
  });

  it("캐릭터 캐논은 편집기의 외모·의상 칸을 자르지 않고 보내고, 모델이 빠뜨린 기존 태그도 결과 앞에 그대로 남긴다", async () => {
    const parseSpy = vi.spyOn(assistTransport, "assistParse").mockResolvedValueOnce({
      message: { model: "claude-opus-5-5", usage: { input_tokens: 120, output_tokens: 80 } } as never,
      parsed: {
        appearanceKo: "20대 초반, 은발 단발, 왼쪽 눈 밑 점",
        outfitKo: "검은 하이칼라 코트",
        traitTags: ["은발 단발", "안경"],
        englishPromptLockTokens: "early twenties, silver bob hair",
        negativeDriftTokens: "hair color drift, missing mole",
        speechStyleSummaryKo: "짧은 반말",
      },
    });
    const appearance = "외모".repeat(200);
    const outfit = "의상".repeat(150);
    const view = await runAssistCharacterCanonArchitect(
      { name: "서진", roughNotes: `${appearance} / ${outfit}`, existingTags: ["차분함", "안경", "왼쪽 눈 밑 점"] },
      { route: { apiKey: "sk-ant-test-key", revision: 1, model: "claude-opus-5-5" } },
    );
    const userText = String(parseSpy.mock.calls[0]?.[1]?.messages?.[0]?.content ?? "");
    // 240자에서 잘리면 의상 칸이 통째로 빠져 다시 실행할 때 지어낸 의상으로 덮인다.
    expect(userText).toContain(`작가 메모: ${appearance} / ${outfit}`);
    expect(userText).toContain("기존 태그: 차분함, 안경, 왼쪽 눈 밑 점");
    expect(view.source).toBe("claude-live");
    // 편집기는 태그 칸을 이 결과로 바꾸므로 성격 태그('차분함')도 사라지면 안 된다.
    expect(view.traitTags).toEqual(["차분함", "안경", "왼쪽 눈 밑 점", "은발 단발"]);
    parseSpy.mockRestore();
  });

  it("N7 3단계 오케스트레이션 및 9종 신규 LLM 프롬프트 실행기가 코드펜스 제거와 안전 폴백을 지원한다", async () => {
    expect(stripJsonCodeFence('```json\n{"cuts":[{"id":"cut-1","summary":"요약"}]}\n```')).toBe(
      '{"cuts":[{"id":"cut-1","summary":"요약"}]}',
    );

    const createSpy = vi
      .spyOn(assistTransport, "assistCreate")
      .mockRejectedValue(new Error("simulated offline"));

    const n7 = await runAssistN7OrchestrationPipeline({
      script: "서진과 하윤이 신전에서 대치한다.",
      characters: ["서진", "하윤"],
      styleNotes: "고대비 셀 채색",
    });
    expect(n7.cuts.length).toBe(4);
    expect(n7.dialogues.length).toBe(4);
    expect(n7.coloring.length).toBe(4);

    const cuts = await runAssistStoryboardCutPlan({
      premise: "봉인이 풀리는 순간",
      characters: ["서진"],
      styleNotes: "다크 판타지",
      cutCount: 2,
    });
    expect(cuts.length).toBe(2);

    const dirs = await runAssistDirectionPlan([
      { cutId: "cut-1", summary: "클로즈업", dialogues: ["멈춰!"] },
    ]);
    expect(dirs[0]?.cameraMove).toBe("zoom-in");

    const bgms = await runAssistBgmPlacementPlan([
      { cutId: "cut-1", moodHint: "긴장", dialogues: ["누구냐"] },
    ]);
    expect(bgms[0]?.bgmMood).toBe("tension");

    const rev = await runAssistReviewCommentInterpreter("1컷 배경 역광을 더 강하게 해주세요.");
    expect(rev.length).toBeGreaterThan(0);

    const lines = await runAssistCutDialogueSuggest({
      cutSummary: "서진이 검을 든다",
      character: "서진",
      voiceNotes: "냉정한 반말",
      existingLines: [],
    });
    expect(lines.length).toBe(3);

    const summary = await runAssistPlotSummaryAndSynopsis({
      sourceTexts: ["1화 대본 본문"],
      premise: "기억 봉인 해제",
      characters: ["서진", "하윤"],
      tone: "긴박함",
    });
    expect(summary.plotSummaryKo).toContain("서진");

    const faq = await runAssistSupportFaqAnswer({
      question: "환불은 어떻게 하나요?",
      faqEntries: [{ question: "결제 수단", answer: "카드 결제 지원" }],
    });
    expect(faq.refused).toBe(true);

    const handover = await runAssistAuthorHandoverSummary({
      workTitle: "붉은 성소의 서약",
      outgoingAuthor: "A작가",
      incomingAuthor: "B작가",
      bibleSummary: "서진/하윤 계약 결혼",
      styleSummary: "로판 셀 채색",
      pendingCount: 2,
      inProgressCutCount: 5,
    });
    expect(handover).toContain("붉은 성소의 서약");

    createSpy.mockRestore();
  });

  it("Wave 18~20 웹툰 일관성 & 3평면 심도 6대 AI 디렉터 결정적 폴백 및 Claude 추론 경로를 검증한다", async () => {
    const screenFb = buildDeterministicPropScreenUiHologramLockView("시스템 상태창 스탯 확인");
    expect(screenFb.model).toBe("claude-haiku-5-5");
    expect(screenFb.uiDeviceType).toContain("홀로그램");

    const braidFb = buildDeterministicBraidPonytailAccessoryKnotLockView("7마디 땋은 머리");
    expect(braidFb.braidSegmentCount).toBe(7);

    const capeFb = buildDeterministicCapeCloakHemLiningFlutterLockView("황실 기사단 망토");
    expect(capeFb.outerFabricHex).toBe("#1E293B");
    expect(capeFb.innerLiningHex).toBe("#991B1B");

    const swordFb = buildDeterministicSwordHiltGuardScabbardLockView("비대칭 날개 롱소드");
    expect(swordFb.pommelGemHex).toBe("#38BDF8");

    const ageFb = buildDeterministicCharacterAgeFlashbackProportionLockView("8세 유년기 회상");
    expect(ageFb.childhoodHeadRatio).toContain("5.2등신");

    const bokehFb = buildDeterministicMultiPlaneParallaxBokehLockView("벚꽃 전경 + 야경 보케");
    expect(bokehFb.model).toBe("claude-opus-5-5");
    expect(bokehFb.foregroundBlurRadiusPx).toBe(18);
    expect(bokehFb.backgroundBokehRadiusPx).toBe(26);

    const parseSpy = vi
      .spyOn(assistTransport, "assistParse")
      .mockRejectedValue(new Error("simulated offline"));

    expect((await runAssistPropScreenUiHologramLockDirector("스마트폰")).source).toBe("deterministic-fallback");
    expect((await runAssistBraidPonytailAccessoryKnotLockDirector("포니테일")).source).toBe("deterministic-fallback");
    expect((await runAssistCapeCloakHemLiningFlutterLockDirector("망토")).source).toBe("deterministic-fallback");
    expect((await runAssistSwordHiltGuardScabbardLockDirector("성검")).source).toBe("deterministic-fallback");
    expect((await runAssistCharacterAgeFlashbackProportionLockDirector("타임스킵")).source).toBe("deterministic-fallback");
    expect((await runAssistMultiPlaneParallaxBokehLockDirector("3평면 심도")).source).toBe("deterministic-fallback");

    const gazeFb = buildDeterministicGazeSaccadePupilHighlightLockView("10시 캐치라이트");
    expect(gazeFb.catchlightClockHour).toBe(10);
    const plumeFb = buildDeterministicBreathFrostSmokePlumeLockView("겨울 입김");
    expect(plumeFb.windDriftAngleDeg).toBe(28);
    const wetFb = buildDeterministicWetFabricRainTranslucencyLockView("젖은 셔츠");
    expect(wetFb.wetnessStagePct).toBe(85);
    const shadowFb = buildDeterministicCastShadowSundialAzimuthLockView("오후 5시 석양");
    expect(shadowFb.solarAzimuthDeg).toBe(245);
    const craterFb = buildDeterministicImpactDebrisCraterPersistenceLockView("대리석 크레이터");
    expect(craterFb.craterDiameterCm).toBe(280);
    const binauralFb = buildDeterministicBinauralSpatialAudioFoleyLufsView("대성당 폴리");
    expect(binauralFb.targetIntegratedLufs).toBe(-14);

    expect((await runAssistGazeSaccadePupilHighlightLockDirector("시선")).source).toBe("deterministic-fallback");
    expect((await runAssistBreathFrostSmokePlumeLockDirector("입김")).source).toBe("deterministic-fallback");
    expect((await runAssistWetFabricRainTranslucencyLockDirector("우중")).source).toBe("deterministic-fallback");
    expect((await runAssistCastShadowSundialAzimuthLockDirector("그림자")).source).toBe("deterministic-fallback");
    expect((await runAssistImpactDebrisCraterPersistenceLockDirector("크레이터")).source).toBe("deterministic-fallback");
    expect((await runAssistBinauralSpatialAudioFoleyLufsDirector("바이노럴")).source).toBe("deterministic-fallback");

    parseSpy.mockRestore();
  });
});
