// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { lockUserAi, setUserAiConfiguration } from "@/shared/ai/user-ai-store";
import { EMPTY_AI_CONFIGURATION, EMPTY_AI_CONNECTION } from "@/shared/ai/user-ai-types";

import { StudioWebtoonProductionAssistPanel } from "./StudioWebtoonProductionAssistPanel";

const { assistParseMock } = vi.hoisted(() => ({
  assistParseMock: vi.fn(),
}));

vi.mock("@/shared/ai/assist/assist-transport", () => ({
  assistParse: assistParseMock,
}));

function connectAssist(model = "claude-haiku-5-5"): void {
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

describe("StudioWebtoonProductionAssistPanel (8대 경쟁사 벤치마크 및 4대 신규 AI 감수 워크벤치 UI)", () => {
  beforeEach(() => {
    lockUserAi(false);
    assistParseMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("8대 웹툰 AI 경쟁사 벤치마크 매트릭스와 4대 신규 프로덕션 AI 감수 탭 전환·대본 반영을 수행한다", async () => {
    connectAssist("claude-haiku-5-5");
    const onApplyScript = vi.fn();

    render(
      <StudioWebtoonProductionAssistPanel
        scriptInput='시우: "다들 물러서! 이 결계는 내가 부순다!"'
        storyGenre="액션판타지"
        coreConflict="봉인된 시계탑의 각성"
        relationshipDynamic="fated-rivals"
        posePresetId="pose-dynamic-slash"
        targetLocale="ko"
        artistLabel="네오 잉크"
        triggerWord="neo_ink_style"
        onApplyScript={onApplyScript}
      />,
    );

    expect(screen.getByTestId("competitor-parity-badge").textContent).toContain(
      "20개 글로벌·국내 웹툰 AI 대비 달성도",
    );
    expect(screen.getByTestId("benchmark-service-genvas")).toBeTruthy();
    expect(screen.getByTestId("benchmark-service-dashtoon-studio")).toBeTruthy();
    expect(screen.getByTestId("benchmark-service-llamagen-comic")).toBeTruthy();
    expect(screen.getByTestId("benchmark-service-kuaikan-webtoon-global")).toBeTruthy();

    // 기본 탭: 모바일 스크롤 시선·데드존 닥터
    expect(screen.getByTestId("panel-scroll-eyepath")).toBeTruthy();

    // 탭 2: 컬러 스크립트 · 4레이어 조명
    fireEvent.click(screen.getByTestId("production-assist-tab-color-script"));
    expect(screen.getByTestId("panel-color-script")).toBeTruthy();

    // 탭 3: 설정 연속성 · 복선 회수 감수
    fireEvent.click(screen.getByTestId("production-assist-tab-continuity-foreshadow"));
    expect(screen.getByTestId("panel-continuity-foreshadow")).toBeTruthy();

    // 탭 5: 다중 인물·군중 제복/문장 락
    fireEvent.click(screen.getByTestId("production-assist-tab-multi-character-wardrobe-lock"));
    expect(screen.getByTestId("panel-multi-character-wardrobe-lock")).toBeTruthy();

    // 탭 6: 날씨·젖은 모발/의상·그림자 연속성
    fireEvent.click(screen.getByTestId("production-assist-tab-weather-time-progression-lock"));
    expect(screen.getByTestId("panel-weather-time-progression-lock")).toBeTruthy();

    // 탭 4: 다각도 연기 · SFX 오케스트레이터
    fireEvent.click(screen.getByTestId("production-assist-tab-acting-sfx"));
    expect(screen.getByTestId("panel-acting-sfx")).toBeTruthy();

    // 대본 반영 버튼 클릭
    fireEvent.click(screen.getByTestId("apply-production-assist-script-btn"));
    expect(onApplyScript).toHaveBeenCalledTimes(1);
    expect(onApplyScript.mock.calls[0]?.[0]).toContain("[연기:");

    // AI 실시간 감수 실행
    assistParseMock.mockResolvedValueOnce({
      message: {
        model: "claude-haiku-5-5",
        usage: {
          input_tokens: 280,
          output_tokens: 210,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
      parsed: {
        genvasConsistencySummaryKo: "실시간 Claude 다각도 연기 및 SFX 연출 완료",
        cutChoreographies: [
          {
            cutNumber: 1,
            characterName: "시우",
            cameraAngle: "low-angle-dominant",
            emotionCategory: "anger",
            expressionPresetId: "xf_anger_fierce_01",
            posePresetId: "pose-dynamic-slash",
            microExpressionNoteKo: "강렬한 안광과 역광 실루엣",
            consistencyAnchorToken: "neo_ink_style_char_lock",
            bubbleFrameKind: "shout",
            splitLinesRecommended: ["다들 물러서!"],
            sfxTextKo: "콰아앙",
            sfxRomanized: "KWA-ANG",
            sfxRotationDeg: -14,
            sfxScaleMultiplier: 1.7,
            typographyStyleNoteKo: "거친 붓터치 외곽선",
            readyActingScriptLine: '[연기: xf_anger_fierce_01] 시우: "다들 물러서!"',
          },
        ],
      },
    });

    fireEvent.click(screen.getByTestId("run-claude-production-assist-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("production-assist-engine-status").textContent).toContain(
        "AI 실시간",
      );
    });
  });

  it("스크롤 연출 지문은 분석한 대본의 그 컷 줄 끝에 붙고, 대본이 바뀌면 낡은 컷 번호로 다른 줄에 붙이지 않는다", async () => {
    connectAssist("claude-haiku-5-5");
    const onApplyScript = vi.fn();
    const script = "유적 입구\n카엘: \"뒤를 봐.\"\n횃불이 꺼진다";
    const props = {
      storyGenre: "판타지",
      coreConflict: "봉인된 유적",
      relationshipDynamic: "fated-rivals",
      posePresetId: "pose-dynamic-slash",
      targetLocale: "ko",
      artistLabel: "네오 잉크",
      triggerWord: "neo_ink_style",
      onApplyScript,
    } as const;
    const { rerender } = render(<StudioWebtoonProductionAssistPanel scriptInput={script} {...props} />);

    assistParseMock.mockResolvedValueOnce({
      message: {
        model: "claude-haiku-5-5",
        usage: { input_tokens: 300, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
      parsed: {
        overallReadabilityScore: 82,
        sCurveContinuitySummaryKo: "2컷의 돌아보는 대사가 시선을 붙잡습니다.",
        cliffhangerScrollHookKo: "마지막 컷 앞 여백을 늘리세요.",
        cutDiagnostics: [
          {
            cutNumber: 2,
            eyePathPattern: "s-curve-optimal",
            cognitiveLoadScore: 40,
            deadZoneViolation: "none",
            recommendedGutterAfterPx: 220,
            bubbleRelocationHint: "말풍선은 오른쪽 위",
            directorCoachingKo: "돌아보는 동작을 바스트로 잡으세요.",
            readyStageDirectionLine: "바스트 샷 로우 앵글, 말풍선 오른쪽 위",
          },
        ],
      },
    });
    fireEvent.click(screen.getByTestId("run-claude-production-assist-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("production-assist-engine-status").textContent).toContain("AI 실시간");
    });

    // 분석한 대본 그대로면 2번 컷 줄 끝에 [ ]로 붙는다(대본 끝의 새 컷이 아니다).
    fireEvent.click(screen.getByTestId("apply-production-assist-script-btn"));
    expect(onApplyScript).toHaveBeenLastCalledWith(
      "유적 입구\n카엘: \"뒤를 봐.\" [바스트 샷 로우 앵글, 말풍선 오른쪽 위]\n횃불이 꺼진다",
    );

    // 반영한 대본으로 다시 그려도 컷 번호가 그대로라 실시간 결과를 계속 쓰고, 다시 눌러도 같은 지문을 두 번 붙이지 않는다.
    const applied = onApplyScript.mock.lastCall?.[0] as string;
    rerender(<StudioWebtoonProductionAssistPanel scriptInput={applied} {...props} />);
    expect(screen.getByTestId("production-assist-engine-status").textContent).toContain("AI 실시간");
    fireEvent.click(screen.getByTestId("apply-production-assist-script-btn"));
    expect(onApplyScript).toHaveBeenLastCalledWith(applied);

    // 앞에 줄을 넣어 2번 컷이 '유적 입구'가 되면 그 결과는 낡았으므로 쓰지 않는다.
    rerender(<StudioWebtoonProductionAssistPanel scriptInput={`프롤로그: 비 내리는 밤\n${script}`} {...props} />);
    expect(screen.getByTestId("production-assist-engine-status").textContent).not.toContain("AI 실시간");
    fireEvent.click(screen.getByTestId("apply-production-assist-script-btn"));
    expect(onApplyScript.mock.lastCall?.[0]).not.toContain("바스트 샷 로우 앵글");
  });
});
