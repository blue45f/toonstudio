import { describe, expect, it, vi } from "vitest";

import { buildVoiceFingerprint, type VoiceAttributedLine } from "../../lettering/studio-dialogue-voice";
import {
  buildLocalPlotDevelopmentDoctorReport,
  buildLocalVoiceFingerprintRewrites,
  runClaudePlotDevelopmentDoctor,
  runClaudeVoiceFingerprintRewriter,
  runClaudeWriterRoomStageDraft,
} from "./claude-writer-and-plot-assist";

import * as claudeTransport from "@/shared/ai/claude/claude-transport";

const MOCK_ROUTE = {
  apiKey: "sk-ant-test-key",
  model: "claude-haiku-5-5" as const,
  revision: 1,
};

function createSampleVoiceFingerprint() {
  const lines: VoiceAttributedLine[] = Array.from({ length: 34 }, (_, idx) => ({
    id: `sample-${idx + 1}`,
    text: idx % 2 === 0 ? "내 검으로 직접 확인하겠어." : "더 이상 물러설 생각은 없어.",
    speakerId: "char-seojin",
    episodeId: "ep-1",
  }));
  const fp = buildVoiceFingerprint({
    characterId: "char-seojin",
    lines,
    authorRules: {
      forbiddenPhrases: ["절대로 포기"],
      pinnedSignaturePhrases: ["내 검으로"],
      notes: "냉정하고 단호한 반말 어조",
    },
    now: "2026-10-26T00:00:00.000Z",
  });
  if (!fp) throw new Error("Expected fingerprint to be created");
  return fp;
}

describe("claude-writer-and-plot-assist", () => {
  it("7단계 Writer's Room AI가 라우트 미설정 시 결정적 로컬 초안을 반환하고, 라우트 연결 시 Claude 응답을 파싱한다", async () => {
    const fallbackPremise = await runClaudeWriterRoomStageDraft(
      {
        stage: "premise",
        document: {},
        direction: "회귀한 황실 검사 서진의 복수극",
      },
      { route: null },
    );
    expect(fallbackPremise.source).toBe("local-fallback");
    expect(fallbackPremise.stage).toBe("premise");
    expect(fallbackPremise.draft.text).toContain("서진");

    const spy = vi.spyOn(claudeTransport, "claudeCreate").mockResolvedValueOnce({
      id: "msg_writer_1",
      model: "claude-haiku-5-5",
      stop_reason: "end_turn",
      content: [
        {
          type: "text",
          text: JSON.stringify({
            stage: "premise",
            rationale: "독자의 첫 화 몰입을 높이는 복수극 핵심 전제입니다.",
            draft: {
              text: "처형대에서 10년 전으로 회귀한 황실 검사가 봉인된 성검의 진실을 파헤친다.",
              characterIds: [],
            },
          }),
        },
      ],
      usage: { input_tokens: 100, output_tokens: 80 },
    } as never);

    const livePremise = await runClaudeWriterRoomStageDraft(
      {
        stage: "premise",
        document: {},
        direction: "회귀한 황실 검사 서진의 복수극",
      },
      { route: MOCK_ROUTE },
    );
    expect(livePremise.source).toBe("claude");
    expect(livePremise.draft.text).toContain("회귀한 황실 검사");
    spy.mockRestore();
  });

  it("플롯 전개 & 기승전결 4막·복선 회수 닥터가 로컬 폴백과 Claude 구조화 출력을 모두 지원한다", async () => {
    const plotInput = {
      genre: "판타지",
      coreConflict: "봉인된 검의 각성과 황실의 배신",
      turningPoints: ["평범하던 성소 수호 임무 중 금기된 봉인이 깨진다"],
      protagonistName: "서진",
      partnerName: "하윤",
      unresolvedForeshadows: ["부러진 은빛 회중시계"],
    };

    const localReport = buildLocalPlotDevelopmentDoctorReport(plotInput);
    expect(localReport.inferredStage).toBe("inciting");
    expect(localReport.branches.length).toBeGreaterThanOrEqual(1);
    expect(localReport.branches[0]?.foreshadowPayoffHint).toContain("부러진 은빛 회중시계");
    expect(localReport.arc4ActSummary.hookPowerScore).toBeGreaterThanOrEqual(70);

    const spy = vi.spyOn(claudeTransport, "claudeParse").mockResolvedValueOnce({
      message: {
        id: "msg_plot_1",
        model: "claude-haiku-5-5",
        usage: { input_tokens: 150, output_tokens: 200 },
      } as never,
      parsed: localReport,
    });

    const liveResult = await runClaudePlotDevelopmentDoctor(plotInput, { route: MOCK_ROUTE });
    expect(liveResult.source).toBe("claude");
    expect(liveResult.report.inferredStage).toBe("inciting");
    spy.mockRestore();
  });

  it("캐릭터 말투 지문(Voice Fingerprint) OOC 대사 교정기가 이탈 감지 및 대사 교정을 수행한다", async () => {
    const fingerprint = createSampleVoiceFingerprint();
    const lines: VoiceAttributedLine[] = [
      {
        id: "line-ooc-1",
        text: "저는 오늘 절대로 포기하지 않고 끝까지 확인해 보겠습니다. 여러분도 함께해 주십시오.",
        speakerId: "char-seojin",
        episodeId: "ep-2",
      },
    ];

    const local = buildLocalVoiceFingerprintRewrites({
      fingerprint,
      characterName: "서진",
      lines,
      maxBubbleChars: 42,
    });
    expect(local.detectedDeviations.length).toBeGreaterThanOrEqual(1);
    expect(local.report.rewrites).toHaveLength(1);
    expect(local.report.rewrites[0]?.charCount).toBeLessThanOrEqual(42);

    const spy = vi.spyOn(claudeTransport, "claudeParse").mockResolvedValueOnce({
      message: {
        id: "msg_voice_1",
        model: "claude-haiku-5-5",
        usage: { input_tokens: 140, output_tokens: 120 },
      } as never,
      parsed: local.report,
    });

    const live = await runClaudeVoiceFingerprintRewriter(
      {
        fingerprint,
        characterName: "서진",
        lines,
        maxBubbleChars: 42,
      },
      { route: MOCK_ROUTE },
    );
    expect(live.source).toBe("claude");
    expect(live.report.characterId).toBe("char-seojin");
    spy.mockRestore();
  });
});
