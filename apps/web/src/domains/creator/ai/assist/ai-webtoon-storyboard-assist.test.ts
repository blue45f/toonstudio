import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveAssistRoute } from "@/shared/ai/assist/assist-route";
import {
  getUserAiSnapshot,
  lockUserAi,
  setUserAiConfiguration,
} from "@/shared/ai/user-ai-store";
import { EMPTY_AI_CONFIGURATION, EMPTY_AI_CONNECTION } from "@/shared/ai/user-ai-types";

import {
  buildAiStoryboardAssistRequest,
  buildDeterministicHandPropGripLock,
  buildDeterministicPanelBorderGutterLock,
  buildDeterministicStoryboardAssistFallback,
  evaluateLocalizeWebtoonBubbleHealth,
  mapArtDirectorIssuesToProductionLayers,
  normalizeAiStoryboardAssist,
  numberedScriptCuts,
  runAssistHandPropGripAnatomyDirector,
  runAssistPanelBorderGutterTensionDirector,
  runAiWebtoonStoryboardAssist,
} from "./ai-webtoon-storyboard-assist";

const { assistParseMock } = vi.hoisted(() => ({
  assistParseMock: vi.fn(),
}));

vi.mock("@/shared/ai/assist/assist-transport", () => ({
  assistParse: assistParseMock,
}));

function connectAssist(model = "claude-haiku-5-5") {
  setUserAiConfiguration({
    ...structuredClone(EMPTY_AI_CONFIGURATION),
    connections: [
      {
        ...structuredClone(EMPTY_AI_CONNECTION),
        id: "claude-test",
        label: "Claude Test",
        baseUrl: "https://api.anthropic.com",
        apiKey: "test-claude-key-0000",
        textModel: model,
        imageModel: "",
        costPolicy: "user-funded-byok",
        apiKeys: [
          {
            id: "key-1",
            label: "기본 키",
            apiKey: "test-claude-key-0000",
            enabled: true,
            priority: 100,
          },
        ],
        models: [
          {
            id: "text-1",
            label: model,
            model,
            capability: "text",
            enabled: true,
            priority: 100,
          },
        ],
      },
    ],
  });
}

describe("ai-webtoon-storyboard-assist (Claude API 및 보조 기능 통합 검증)", () => {
  beforeEach(() => {
    lockUserAi(false);
    assistParseMock.mockReset();
  });

  it("등록한 Claude 키가 없으면 키를 만들지 않고 ToonStudio AI 관리형 경로를 쓴다", () => {
    expect(getUserAiSnapshot().configuration.connections).toHaveLength(0);
    setUserAiConfiguration({
      ...structuredClone(EMPTY_AI_CONFIGURATION),
      connections: [
        {
          ...structuredClone(EMPTY_AI_CONNECTION),
          id: "custom-openai",
          label: "Custom OpenAI Path",
          baseUrl: "https://models.github.ai/inference/api.anthropic.com",
          apiKey: "ghp_test_token_0000",
          textModel: "openai/gpt-4o-mini",
          imageModel: "",
          costPolicy: "provider-free-tier",
          priority: 10,
          apiKeys: undefined,
          models: undefined,
        },
      ],
    });
    const route = resolveAssistRoute();
    expect(route.managed).toBe(true);
    expect(route.apiKey).toBe("");
    // 환경변수 키로 연결을 몰래 만들지 않는다(브라우저 번들에 키를 넣는 경로를 없앴다).
    expect(getUserAiSnapshot().configuration.connections.map((connection) => connection.id)).toEqual(["custom-openai"]);
  });

  it("Claude 구조화 출력 요청 생성과 정규화, 라이브 응답 매핑을 수행한다", async () => {
    connectAssist("claude-haiku-5-5");
    const req = buildAiStoryboardAssistRequest("claude-haiku-5-5", {
      genre: "액션판타지",
      coreConflict: "봉인된 마검의 각성",
      artistLabel: "네오 잉크",
      triggerWord: "neo_ink_style",
      relationshipDynamic: "fated-rivals",
      posePresetId: "pose-dynamic-slash",
    });
    expect(req.model).toBe("claude-haiku-5-5");
    expect(req.max_tokens).toBe(4000);

    assistParseMock.mockResolvedValueOnce({
      message: {
        model: "claude-haiku-5-5",
        usage: {
          input_tokens: 420,
          output_tokens: 280,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
      parsed: {
        cliffhangerHookLine: "검 끝에서 검은 불꽃이 치솟으며 동료의 진짜 얼굴이 드러난다.",
        subtextDialogueUpgrade: [
          {
            speaker: "시우",
            line: "네가 감춘 진실, 이 검으로 직접 베어 확인하겠다.",
            subtextNote: "숙명적 라이벌 사이의 경계와 신뢰가 교차하는 대사",
          },
        ],
        cutDirectingNotes: [
          {
            cutNumber: 1,
            lensMm: 18,
            poseAndCameraNote: "18mm 초광각 로우앵글 도약 참격",
            fourLayerDirective: "L1 3D배경 투시 + L2 밑색 분리 + L3 역광 림라이트 + L4 거친 펜선",
          },
        ],
        globalLocalizationNotes: [
          "영문(EN) 번역 시 대사 길이가 38% 늘어나므로 상단 말풍선 여백을 넓히세요.",
        ],
      },
    });

    const result = await runAiWebtoonStoryboardAssist({
      genre: "액션판타지",
      coreConflict: "봉인된 마검의 각성",
    });

    expect(result.source).toBe("claude-live");
    expect(result.model).toBe("claude-haiku-5-5");
    expect(result.cliffhangerHookLine).toContain("검은 불꽃");
    expect(result.cutDirectingNotes[0]?.lensMm).toBe(18);
    expect(result.usage.inputTokens).toBe(420);
    expect(result.estimatedUsd).toBeGreaterThan(0);
  });

  it("대본 초안은 편집기처럼 한 줄 = 한 컷 번호를 붙여 보내고, 대본이 없거나 잘렸으면 그 사실을 알린다", () => {
    const req = buildAiStoryboardAssistRequest("claude-haiku-5-5", {
      scriptText: "유적 최하층, 횃불이 꺼진다.\n\n카엘: \"뒤를 봐.\"\n",
    });
    expect(req.messages[0]?.content).toContain(
      "현재 대본 초안(한 줄 = 한 컷):\n1. 유적 최하층, 횃불이 꺼진다.\n2. 카엘: \"뒤를 봐.\"",
    );
    expect(buildAiStoryboardAssistRequest("claude-haiku-5-5", {}).messages[0]?.content).toContain(
      "현재 대본 초안: (없음)",
    );
    // 예산을 넘으면 끝 줄(엔딩)을 먼저 남기고, 줄인 줄에는 …를 붙이며 전체 컷 수를 알린다.
    expect(numberedScriptCuts(`${"가".repeat(30)}\n${"나".repeat(30)}`, 40)).toEqual([
      `1. ${"가".repeat(24)}…`,
      "(일부 줄은 길이 제한으로 줄임, 전체 2컷)",
      `2. ${"나".repeat(12)}…`,
    ]);
  });

  it("컷 번호는 앱의 컷 나누기(줄바꿈만 기준)와 같고, 대본이 길면 가운데를 생략해 끝부분(엔딩)과 전체 컷 수를 남긴다", () => {
    // 줄 구분자(U+2028)는 앱에서 한 컷 안의 글자이고, 보이지 않는 문자(U+200B)만 있는 줄도 앱에서는 한 컷이다.
    expect(numberedScriptCuts("가\u2028나\r\n\u200b\n다", 600)).toEqual(["1. 가 나", "2. (빈 컷)", "3. 다"]);
    const sixtyCuts = Array.from({ length: 60 }, (_, index) => `컷${index + 1}`).join("\n");
    const numbered = numberedScriptCuts(sixtyCuts, 600);
    expect(numbered).toHaveLength(53);
    expect(numbered[39]).toBe("40. 컷40");
    expect(numbered[40]).toBe("(41~48번 컷 8개는 길이 제한으로 생략, 전체 60컷)");
    expect(numbered[41]).toBe("49. 컷49");
    expect(numbered.at(-1)).toBe("60. 컷60");
    // 글자 예산을 넘는 긴 회차도 마지막 컷과 전체 컷 수가 남는다.
    const longCuts = Array.from({ length: 30 }, (_, index) => `${index + 1}번 컷 ${"대사".repeat(13)}`).join("\n");
    const clipped = numberedScriptCuts(longCuts, 500);
    expect(clipped.at(-1)).toMatch(/^30\. 30번 컷 /u);
    expect(clipped.some((line) => /번 컷 \d+개는 길이 제한으로 생략, 전체 30컷\)$/u.test(line))).toBe(true);
    expect(clipped.join("\n").length).toBeLessThan(700);
    // 한 문단짜리 대본이나 긴 엔딩도 예산을 다 쓴다(끝 줄을 끝부분 몫으로만 자르지 않는다).
    expect(numberedScriptCuts("가".repeat(600), 500).at(-1)).toBe(`1. ${"가".repeat(498)}…`);
    const introAndEnding = numberedScriptCuts(`짧은 도입 컷\n${"엔".repeat(495)}`, 500);
    expect(introAndEnding[0]).toBe("1. 짧은 도입 컷");
    expect(introAndEnding.at(-1)).toBe(`2. ${"엔".repeat(490)}…`);
  });

  it("오프라인 또는 오류 시에도 결정적 폴백(buildDeterministicStoryboardAssistFallback)으로 즉시 코칭을 반환한다", async () => {
    assistParseMock.mockRejectedValueOnce(new Error("network offline"));
    connectAssist("claude-haiku-5-5");

    const fallback = await runAiWebtoonStoryboardAssist(
      {
        genre: "로맨스판타지",
        coreConflict: "황실 계약 동맹의 파기 위기",
        relationshipDynamic: "contract-allies",
      },
      { fallbackOnError: true },
    );

    expect(fallback.source).toBe("deterministic-fallback");
    expect(fallback.subtextDialogueUpgrade.length).toBeGreaterThanOrEqual(2);
    expect(fallback.cutDirectingNotes.length).toBeGreaterThanOrEqual(1);
    expect(fallback.globalLocalizationNotes.length).toBeGreaterThanOrEqual(2);

    const directFallback = buildDeterministicStoryboardAssistFallback({
      genre: "판타지",
    });
    expect(directFallback.source).toBe("deterministic-fallback");
    expect(
      normalizeAiStoryboardAssist(
        {
          cliffhangerHookLine: "테스트 훅",
          subtextDialogueUpgrade: [{ speaker: "주인공", line: "대사", subtextNote: "노트" }],
          cutDirectingNotes: [
            { cutNumber: 1, lensMm: 85, poseAndCameraNote: "클로즈업", fourLayerDirective: "4레이어" },
          ],
          globalLocalizationNotes: ["다국어 식자 팁"],
        },
        "claude-sonnet-5-5",
      ).cutDirectingNotes[0]?.lensMm,
    ).toBe(85);
  });

  it("AI 아트 디렉터 이슈를 리얼드로우 4레이어 공정으로 매핑하고 번역 말풍선 가독성을 진단한다", () => {
    const actions = mapArtDirectorIssuesToProductionLayers({
      issues: [
        {
          id: "issue-1",
          category: "perspective",
          severity: "high",
          confidence: "high",
          title: "소실점 어긋남",
          detail: "배경 투시선이 인물 발밑과 어긋납니다.",
          fix: "3D 카메라 수평선을 재정렬하세요.",
          region: null,
        },
        {
          id: "issue-2",
          category: "contrast",
          severity: "medium",
          confidence: "high",
          title: "역광 대비 부족",
          detail: "인물 실루엣이 배경에 묻힙니다.",
          fix: "림라이트 레이어를 추가하세요.",
          region: null,
        },
      ],
    });
    expect(actions).toHaveLength(2);
    expect(actions[0]?.targetLayerId).toBe("background-3d");
    expect(actions[1]?.targetLayerId).toBe("cel-shading-light");

    const health = evaluateLocalizeWebtoonBubbleHealth({
      lines: [
        {
          index: 1,
          source: "짧은 대사",
          translation: "Short line.",
          shorter: null,
          note: null,
          missing: false,
        },
        {
          index: 2,
          source: "긴 대사",
          translation:
            "This translated line is intentionally very long so that it exceeds forty-two characters in a single bubble.",
          shorter: null,
          note: null,
          missing: false,
        },
      ],
    });
    expect(health.totalLines).toBe(2);
    expect(health.mobileSafeLineCount).toBe(1);
    expect(health.mobileOverflowLineIndices).toEqual([2]);
    expect(health.readinessScore).toBe(50);
  });

  it("컷 테두리·사선 프레임·여백(Gutter) 그라데이션 연속성 디렉터(Haiku 5.5)와 손가락 관절·소품 파지법 연속성 고정기(Sonnet 5.5)를 검증한다", async () => {
    connectAssist("claude-sonnet-5-5");

    const localBorder = buildDeterministicPanelBorderGutterLock({
      sceneSummaryKo: "황태자 카시안의 결투 참격 시퀀스",
      cutCount: 3,
      peakTensionCutIndex: 2,
      moodMode: "abyss-combat",
    });
    expect(localBorder.panelBorderSpecs).toHaveLength(3);
    expect(localBorder.panelBorderSpecs[1]?.frameStyle).toBe("diagonal-slash-cut");

    assistParseMock.mockResolvedValueOnce({
      message: {
        model: "claude-haiku-4-5-20251001",
        usage: { input_tokens: 180, output_tokens: 290 },
      },
      parsed: localBorder,
    });

    const liveBorder = await runAssistPanelBorderGutterTensionDirector({
      sceneSummaryKo: "황태자 카시안의 결투 참격 시퀀스",
      cutCount: 3,
    });
    expect(liveBorder.source).toBe("claude-live");
    expect(liveBorder.taskId).toBe("production:panel-border-gutter-tension-lock");

    const localGrip = buildDeterministicHandPropGripLock({
      characterName: "카시안",
      propNameKo: "청류검(장검)",
      dominantHand: "right-hand",
    });
    expect(localGrip.cutGripDirectives.length).toBeGreaterThanOrEqual(2);
    expect(localGrip.cutGripDirectives[0]?.negativeAnatomyGuardPrompt).toContain("polydactyly");

    assistParseMock.mockResolvedValueOnce({
      message: {
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 210, output_tokens: 340 },
      },
      parsed: localGrip,
    });

    const liveGrip = await runAssistHandPropGripAnatomyDirector({
      characterName: "카시안",
      propNameKo: "청류검(장검)",
      dominantHand: "right-hand",
    });
    expect(liveGrip.source).toBe("claude-live");
    expect(liveGrip.taskId).toBe("production:hand-prop-grip-anatomy-continuity-lock");
    expect(liveGrip.anatomyConsistencyScore).toBeGreaterThanOrEqual(90);
  });
});
