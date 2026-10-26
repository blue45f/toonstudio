// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { lockUserAi, setUserAiConfiguration } from "@/shared/ai/user-ai-store";
import { EMPTY_AI_CONFIGURATION, EMPTY_AI_CONNECTION } from "@/shared/ai/user-ai-types";

import { StudioWebtoonProductionAssistPanel } from "./StudioWebtoonProductionAssistPanel";

const { claudeParseMock } = vi.hoisted(() => ({
  claudeParseMock: vi.fn(),
}));

vi.mock("@/shared/ai/claude/claude-transport", () => ({
  claudeParse: claudeParseMock,
}));

function connectClaude(model = "claude-haiku-5-5"): void {
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
    claudeParseMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("8대 웹툰 AI 경쟁사 벤치마크 매트릭스와 4대 신규 프로덕션 AI 감수 탭 전환·대본 반영을 수행한다", async () => {
    connectClaude("claude-haiku-5-5");
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

    // Claude AI 실시간 감수 실행
    claudeParseMock.mockResolvedValueOnce({
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
        "Claude API 실시간",
      );
    });
  });
});
