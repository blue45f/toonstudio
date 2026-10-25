import { beforeEach, describe, expect, it, vi } from "vitest";

import { lockUserAi, setUserAiConfiguration } from "@/shared/ai/user-ai-store";
import { EMPTY_AI_CONFIGURATION, EMPTY_AI_CONNECTION } from "@/shared/ai/user-ai-types";

import {
  buildDeterministicActingSfxReport,
  buildDeterministicColorScriptReport,
  buildDeterministicContinuityForeshadowReport,
  buildDeterministicScrollEyePathReport,
  runClaudeActingSfxChoreographer,
  runClaudeColorScriptDirector,
  runClaudeContinuityForeshadowAuditor,
  runClaudeScrollEyePathDoctor,
} from "./claude-webtoon-production-assist";

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

describe("claude-webtoon-production-assist (신규 4대 웹툰 AI 보조 엔진 검증)", () => {
  beforeEach(() => {
    lockUserAi(false);
    claudeParseMock.mockReset();
  });

  it("1. 모바일 스크롤 시선 유도(Eye-Path S-Curve) · 데드존 닥터: 실시간 Claude 구조화 출력 및 폴백을 검증한다", async () => {
    connectClaude("claude-haiku-5-5");
    claudeParseMock.mockResolvedValueOnce({
      message: {
        model: "claude-haiku-5-5",
        usage: {
          input_tokens: 310,
          output_tokens: 240,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
      parsed: {
        overallReadabilityScore: 95,
        sCurveContinuitySummaryKo: "좌상단 도입 말풍선에서 중앙 인물 시선을 거쳐 우하단으로 자연스럽게 이어집니다.",
        cliffhangerScrollHookKo: "마지막 컷 직전 440px 여백으로 클리프행어 서스펜스를 강화하세요.",
        cutDiagnostics: [
          {
            cutNumber: 1,
            eyePathPattern: "s-curve-optimal",
            cognitiveLoadScore: 42,
            deadZoneViolation: "none",
            recommendedGutterAfterPx: 320,
            bubbleRelocationHint: "좌상단 도입 배치 유지",
            directorCoachingKo: "390×844 뷰포트 기준 시선 유도 최적",
            readyStageDirectionLine: "[스크롤 호흡 320px · s-curve-optimal] 주인공이 검을 뽑는다.",
          },
        ],
      },
    });

    const live = await runClaudeScrollEyePathDoctor({
      genre: "액션판타지",
      coreConflict: "봉인된 마검의 각성",
    });
    expect(live.mode).toBe("scroll-eyepath");
    expect(live.source).toBe("claude-live");
    expect(live.overallReadabilityScore).toBe(95);
    expect(live.cutDiagnostics[0]?.recommendedGutterAfterPx).toBe(320);

    const fallback = buildDeterministicScrollEyePathReport({
      genre: "액션판타지",
      scriptText: "주인공: 다들 물러서! (콰아앙)\n조력자: 지금이 기회야!",
    });
    expect(fallback.source).toBe("deterministic-fallback");
    expect(fallback.cutDiagnostics.length).toBeGreaterThanOrEqual(1);
  });

  it("2. 에피소드 컬러 스크립트 & 4레이어 조명 디렉터: 실시간 Claude 구조화 출력 및 HEX 정규화·폴백을 검증한다", async () => {
    connectClaude("claude-haiku-5-5");
    claudeParseMock.mockResolvedValueOnce({
      message: {
        model: "claude-haiku-5-5",
        usage: {
          input_tokens: 340,
          output_tokens: 260,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
      parsed: {
        episodeArcColorSummaryKo: "골든아워에서 심연의 역광으로 전환되는 감정 컬러 아크입니다.",
        emotionalTurningPointCutNumber: 2,
        cutDirectives: [
          {
            cutNumber: 1,
            timeOfDay: "eclipse-abyss",
            kelvinTemperature: 3200,
            bgSkyHex: "#1a1025",
            bgGroundHex: "#0f172a",
            keyLightHex: "#f43f5e",
            fillShadowHex: "#31102f",
            rimAccentHex: "#38bdf8",
            l4VectorInkColorHoldHex: "#4c0519",
            azimuthDeg: 140,
            elevationDeg: 55,
            l3CelMultiplyOpacityPct: 70,
            l3RimScreenOpacityPct: 80,
            moodTransitionNoteKo: "강렬한 붉은 역광으로 각성 순간 강조",
            readyColorStageLine: "[컬러 스크립트 #1: eclipse-abyss 3200K] 각성 역광",
          },
        ],
      },
    });

    const live = await runClaudeColorScriptDirector({
      genre: "판타지",
      coreConflict: "붉은 달의 각성",
    });
    expect(live.mode).toBe("color-script");
    expect(live.source).toBe("claude-live");
    expect(live.cutDirectives[0]?.keyLightHex).toBe("#F43F5E");
    expect(live.cutDirectives[0]?.kelvinTemperature).toBe(3200);

    const fallback = buildDeterministicColorScriptReport({ genre: "로맨스판타지" });
    expect(fallback.source).toBe("deterministic-fallback");
    expect(fallback.cutDirectives.length).toBeGreaterThanOrEqual(1);
  });

  it("3. 설정 연속성 · 180도 카메라 축 · 복선 회수 감수기: 실시간 Claude 구조화 출력 및 폴백을 검증한다", async () => {
    connectClaude("claude-haiku-5-5");
    claudeParseMock.mockResolvedValueOnce({
      message: {
        model: "claude-haiku-5-5",
        usage: {
          input_tokens: 300,
          output_tokens: 220,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
      parsed: {
        continuityHealthScore: 94,
        executiveSummaryKo: "180도 카메라 시선 축과 주인공 외형 시드가 안정적으로 유지됩니다.",
        conflicts: [
          {
            cutNumber: 2,
            category: "spatial-180-axis-violation",
            severity: "warn",
            conflictDescriptionKo: "컷 1과 컷 2 사이 시선 방향 반전 주의",
            concreteFixSuggestionKo: "전경 좌측에 조력자 어깨 실루엣을 배치하세요.",
          },
        ],
        foreshadowPayoffs: [
          {
            seedTitle: "붉은 시계탑의 열쇠",
            recommendedCutNumber: 3,
            payoffStrategy: "cliffhanger-twist",
            suggestedVisualDetailKo: "깨진 시계 유리에 비친 문양 클로즈업",
            suggestedSubtextLineKo: '주인공: "이 열쇠가 가리키던 곳은 바로 여기였어."',
          },
        ],
      },
    });

    const live = await runClaudeContinuityForeshadowAuditor({
      genre: "미스터리",
      coreConflict: "붉은 시계탑의 비밀",
    });
    expect(live.mode).toBe("continuity-foreshadow");
    expect(live.source).toBe("claude-live");
    expect(live.continuityHealthScore).toBe(94);
    expect(live.foreshadowPayoffs[0]?.seedTitle).toBe("붉은 시계탑의 열쇠");

    const fallback = buildDeterministicContinuityForeshadowReport({ genre: "미스터리" });
    expect(fallback.source).toBe("deterministic-fallback");
    expect(fallback.conflicts.length).toBeGreaterThanOrEqual(1);
  });

  it("4. 다각도 표정·포즈 매트릭스 & 효과음(SFX)·말풍선 오케스트레이터: 실시간 Claude 구조화 출력 및 폴백을 검증한다", async () => {
    connectClaude("claude-haiku-5-5");
    claudeParseMock.mockResolvedValueOnce({
      message: {
        model: "claude-haiku-5-5",
        usage: {
          input_tokens: 330,
          output_tokens: 270,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
      parsed: {
        genvasConsistencySummaryKo: "전 컷 캐릭터 시드 고정 및 SFX 타이포그래피 동시 설계 완료",
        cutChoreographies: [
          {
            cutNumber: 1,
            characterName: "시우",
            cameraAngle: "low-angle-dominant",
            emotionCategory: "anger",
            expressionPresetId: "xf_anger_fierce_01",
            posePresetId: "pose-dynamic-slash",
            microExpressionNoteKo: "수축된 동공과 역광 실루엣",
            consistencyAnchorToken: "neo_ink_char_lock",
            bubbleFrameKind: "shout",
            splitLinesRecommended: ["다들 물러서!", "이 결계는 내가 부순다!"],
            sfxTextKo: "콰아앙",
            sfxRomanized: "KWA-ANG",
            sfxRotationDeg: -15,
            sfxScaleMultiplier: 1.8,
            typographyStyleNoteKo: "거친 붓터치 외곽선과 대각선 기울기",
            readyActingScriptLine: '[연기: xf_anger_fierce_01 / SFX: 콰아앙(KWA-ANG)] 시우: "다들 물러서!"',
          },
        ],
      },
    });

    const live = await runClaudeActingSfxChoreographer({
      genre: "액션판타지",
      protagonistName: "시우",
    });
    expect(live.mode).toBe("acting-sfx");
    expect(live.source).toBe("claude-live");
    expect(live.cutChoreographies[0]?.sfxTextKo).toBe("콰아앙");
    expect(live.cutChoreographies[0]?.sfxScaleMultiplier).toBe(1.8);

    const fallback = buildDeterministicActingSfxReport({ genre: "액션판타지" });
    expect(fallback.source).toBe("deterministic-fallback");
    expect(fallback.cutChoreographies.length).toBeGreaterThanOrEqual(1);
  });
});
