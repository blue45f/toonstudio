import { describe, expect, it, vi } from "vitest";

import {
  buildDeterministicCharacterCanonView,
  buildDeterministicEnhancedPromptView,
  buildDeterministicSceneShadingView,
  runClaudeCharacterCanonArchitect,
  runClaudePromptEnhancer,
  runClaudeSceneShadingDirector,
} from "./claude-creator-domain-assist";
import {
  runClaudeAuthorHandoverSummary,
  runClaudeBgmPlacementPlan,
  runClaudeCutDialogueSuggest,
  runClaudeDirectionPlan,
  runClaudeN7OrchestrationPipeline,
  runClaudePlotSummaryAndSynopsis,
  runClaudeReviewCommentInterpreter,
  runClaudeStoryboardCutPlan,
  runClaudeSupportFaqAnswer,
  stripJsonCodeFence,
} from "./claude-n7-and-llm-runners";

import * as claudeTransport from "@/shared/ai/claude/claude-transport";

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
      .spyOn(claudeTransport, "claudeParse")
      .mockRejectedValue(new Error("simulated offline"));

    const canonRes = await runClaudeCharacterCanonArchitect({ name: "하윤" });
    expect(canonRes.source).toBe("deterministic-fallback");

    const promptRes = await runClaudePromptEnhancer("마법진이 빛나는 성소");
    expect(promptRes.detectedGenre).toBe("fantasy");

    const shadingRes = await runClaudeSceneShadingDirector({
      direction: "backlight-rim",
      intensityPercent: 90,
      softnessPercent: 15,
      temperature: "sunset-golden",
      enableRimLight: true,
    });
    expect(shadingRes.source).toBe("deterministic-fallback");

    parseSpy.mockRestore();
  });

  it("N7 3단계 오케스트레이션 및 9종 신규 LLM 프롬프트 실행기가 코드펜스 제거와 안전 폴백을 지원한다", async () => {
    expect(stripJsonCodeFence('```json\n{"cuts":[{"id":"cut-1","summary":"요약"}]}\n```')).toBe(
      '{"cuts":[{"id":"cut-1","summary":"요약"}]}',
    );

    const createSpy = vi
      .spyOn(claudeTransport, "claudeCreate")
      .mockRejectedValue(new Error("simulated offline"));

    const n7 = await runClaudeN7OrchestrationPipeline({
      script: "서진과 하윤이 신전에서 대치한다.",
      characters: ["서진", "하윤"],
      styleNotes: "고대비 셀 채색",
    });
    expect(n7.cuts.length).toBe(4);
    expect(n7.dialogues.length).toBe(4);
    expect(n7.coloring.length).toBe(4);

    const cuts = await runClaudeStoryboardCutPlan({
      premise: "봉인이 풀리는 순간",
      characters: ["서진"],
      styleNotes: "다크 판타지",
      cutCount: 2,
    });
    expect(cuts.length).toBe(2);

    const dirs = await runClaudeDirectionPlan([
      { cutId: "cut-1", summary: "클로즈업", dialogues: ["멈춰!"] },
    ]);
    expect(dirs[0]?.cameraMove).toBe("zoom-in");

    const bgms = await runClaudeBgmPlacementPlan([
      { cutId: "cut-1", moodHint: "긴장", dialogues: ["누구냐"] },
    ]);
    expect(bgms[0]?.bgmMood).toBe("tension");

    const rev = await runClaudeReviewCommentInterpreter("1컷 배경 역광을 더 강하게 해주세요.");
    expect(rev.length).toBeGreaterThan(0);

    const lines = await runClaudeCutDialogueSuggest({
      cutSummary: "서진이 검을 든다",
      character: "서진",
      voiceNotes: "냉정한 반말",
      existingLines: [],
    });
    expect(lines.length).toBe(3);

    const summary = await runClaudePlotSummaryAndSynopsis({
      sourceTexts: ["1화 대본 본문"],
      premise: "기억 봉인 해제",
      characters: ["서진", "하윤"],
      tone: "긴박함",
    });
    expect(summary.plotSummaryKo).toContain("서진");

    const faq = await runClaudeSupportFaqAnswer({
      question: "환불은 어떻게 하나요?",
      faqEntries: [{ question: "결제 수단", answer: "카드 결제 지원" }],
    });
    expect(faq.refused).toBe(true);

    const handover = await runClaudeAuthorHandoverSummary({
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
});
