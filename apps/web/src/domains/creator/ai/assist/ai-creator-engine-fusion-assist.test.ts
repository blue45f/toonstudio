import { describe, expect, it, vi } from "vitest";

import { assistParse } from "@/shared/ai/assist/assist-transport";

import { createForeshadowSeed } from "../../planning/studio-foreshadow-ledger";
import { emptyWorldLore, withLoreEntryDefaults } from "../../planning/studio-world-lore";
import {
  runAiLocalizationQaAndCopyfitAssist,
  runAiLoreAndForeshadowIntegrityAssist,
  runAiSfxEnvelopeWarpAssist,
  runAiTensionAndPacingDoctorAssist,
} from "./ai-creator-engine-fusion-assist";

vi.mock("@/shared/ai/assist/assist-transport", () => ({
  assistParse: vi.fn(),
}));

const TEST_ROUTE = {
  apiKey: "sk-ant-test-key",
  revision: 1,
  model: "claude-opus-5-5",
};

describe("claude-creator-engine-fusion-assist (REA 발굴 도메인 엔진 4대 AI 융합 어시스턴트)", () => {
  it("1. Lettering Fusion: MQM 현지화 QA & 말풍선 넘침 무손실 카피피팅 어시스턴트를 검증한다", async () => {
    const pages = [
      {
        id: "page-1",
        name: "1페이지",
        elements: [
          {
            id: "bubble-1",
            type: "bubble",
            text: "Really, there is absolutely no way that could ever happen to us right now...?!",
            width: 140,
            height: 72,
            fontSize: 16,
            fill: "#FFFFFF",
            textFill: "#111827",
          },
        ],
      },
    ];

    vi.mocked(assistParse).mockResolvedValueOnce({
      message: {
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 310, output_tokens: 420 },
      } as never,
      parsed: {
        summaryKo: "말풍선 높이 초과 대사를 무손실 카피피팅하고 금칙 줄바꿈을 적용했습니다.",
        initialMqmQualityScore: 95,
        projectedMqmQualityScore: 99.6,
        patches: [
          {
            cueId: "bubble-1",
            originalText:
              "Really, there is absolutely no way that could ever happen to us right now...?!",
            copyfittedText: "No way that could happen now…?!",
            kinsokuCompliantLines: ["No way that could", "happen now…?!"],
            overflowActionTaken: "shrink-avoided-by-copyfit",
            editorialRationaleKo: "의미를 보존하며 31자로 압축해 줄 잘림을 예방했습니다.",
          },
        ],
      },
    });

    const res = await runAiLocalizationQaAndCopyfitAssist(
      {
        pages,
        qaOptions: {
          targetLocale: "en",
          sourceLocale: "ko",
        },
      },
      { route: TEST_ROUTE },
    );

    expect(res.deterministicQaReport.checkedCueCount).toBe(1);
    expect(res.envelope.source).toBe("claude-live");
    expect(res.envelope.routedModel).toBe("claude-sonnet-5-5");
    expect(res.kinsokuValidatedCueCount).toBe(1);
    expect(res.envelope.report.patches[0]?.kinsokuCompliantLines.length).toBeGreaterThanOrEqual(1);
  });

  it("2. Assistant + Lettering Fusion: 효과음(SFX) 렉시콘 & Catmull-Rom 엔벨로프 왜곡(!envelopeHasFold 보증)을 검증한다", async () => {
    vi.mocked(assistParse).mockResolvedValueOnce({
      message: {
        model: "claude-haiku-4-5",
        usage: { input_tokens: 190, output_tokens: 260 },
      } as never,
      parsed: {
        selectedSfxId: "sfx-kwang",
        sfxTextKo: "쾅",
        recommendedCategory: "impact",
        envelopePresetId: "bulge",
        bend: 62,
        hDistort: 18,
        vDistort: -12,
        fillHex: "#EF4444",
        strokeHex: "#FFFFFF",
        placementReasonKo: "강렬한 폭발 타격음을 표현하기 위해 볼록(bulge) 엔벨로프 왜곡 적용",
      },
    });

    const res = await runAiSfxEnvelopeWarpAssist(
      {
        sceneActionDescriptionKo: "거대한 성문이 폭발하며 부서지는 강타 장면",
        preferredCategory: "impact",
      },
      { route: TEST_ROUTE },
    );

    expect(res.matchedLexiconItems.length).toBeGreaterThan(0);
    expect(res.foldFreeGuaranteed).toBe(true);
    expect(res.envelope.source).toBe("claude-live");
    expect(res.envelope.routedModel).toBe("claude-haiku-5-5");
    expect(res.warpedEnvelope.presetId).toBe("bulge");
  });

  it("3. Assistant Fusion: 텐션 맵 & 스크롤 페이싱 시뮬레이터 연동 연출 닥터 및 재시뮬레이션을 검증한다", async () => {
    const cuts = [
      {
        id: "cut-1",
        summary: "복도를 걷는 서진",
        emotion: "calm" as const,
        shotScale: "long-shot" as const,
        cameraAngle: "eye-level" as const,
        heightPx: 700,
        gutterBeforePx: 0,
        dialogueCount: 2,
      },
      {
        id: "cut-2",
        summary: "자객의 기습 공격",
        emotion: "shock" as const,
        shotScale: "close-up" as const,
        cameraAngle: "low-angle" as const,
        heightPx: 720,
        gutterBeforePx: 140,
        dialogueCount: 1,
      },
    ];

    vi.mocked(assistParse).mockResolvedValueOnce({
      message: {
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 290, output_tokens: 430 },
      } as never,
      parsed: {
        diagnosisSummaryKo: "기습 컷 직전 여백을 720px 장면 전환 여백으로 넓혀 서스펜스를 강화했습니다.",
        targetReaderRetentionLiftPct: 18,
        cutPrescriptions: [
          {
            cutId: "cut-1",
            recommendedEmotion: "determination",
            recommendedShotScale: "medium-shot",
            recommendedCameraAngle: "eye-level",
            recommendedHeightPx: 680,
            recommendedGutterBeforePx: 0,
            directorNoteKo: "도입부 집중도를 높이기 위해 미디엄샷으로 조정",
          },
          {
            cutId: "cut-2",
            recommendedEmotion: "rage",
            recommendedShotScale: "extreme-close-up",
            recommendedCameraAngle: "low-angle",
            recommendedHeightPx: 920,
            recommendedGutterBeforePx: 720,
            directorNoteKo: "클라이맥스 타격감을 위해 익스트림 클로즈업 및 720px 여백 적용",
          },
        ],
      },
    });

    const res = await runAiTensionAndPacingDoctorAssist({ cuts }, { route: TEST_ROUTE });
    expect(res.beforeTensionMap.cuts).toHaveLength(2);
    expect(res.afterTensionMap.cuts).toHaveLength(2);
    expect(res.afterTensionMap.averageTension).toBeGreaterThanOrEqual(
      res.beforeTensionMap.averageTension,
    );
    expect(res.envelope.routedModel).toBe("claude-sonnet-5-5");
  });

  it("4. Planning Fusion: 홀로크론 세계관 로어·복선 장부·콩코던스 무결성 감사관을 검증한다", async () => {
    const baseEntry = withLoreEntryDefaults({
      id: "lore-place-1",
      kind: "place",
      name: "아르카나 성채",
      aliases: ["검은 성채"],
      summary: "북부 국경의 고대 요새",
      details: "마력 결계가 유지되는 요새",
      eraLabel: "",
      timelineOrder: null,
      relatedEntryIds: [],
      characterIds: [],
      origin: "authored",
      status: "confirmed",
      version: 1,
    });
    const previousLore = {
      ...emptyWorldLore("proj-1"),
      entries: [baseEntry],
    };
    const currentLore = {
      ...emptyWorldLore("proj-1"),
      entries: [{ ...baseEntry, name: "신성 아르카나 성채", version: 2 }],
    };

    const seed = createForeshadowSeed({
      id: "seed-1",
      projectId: "proj-1",
      title: "부서진 은빛 회중시계",
      plantedIn: { episodeId: "ep-1" },
      expectedPayoff: { fromEpisodeId: "ep-2", toEpisodeId: "ep-2" },
      now: "2026-10-26T00:00:00.000Z",
    });

    vi.mocked(assistParse).mockResolvedValueOnce({
      message: {
        model: "claude-opus-4-6",
        usage: { input_tokens: 380, output_tokens: 540 },
      } as never,
      parsed: {
        executiveAuditSummaryKo: "로어 명칭 변경 영향과 만기 복선 1건을 통합 점검했습니다.",
        loreConflictResolutionKo: "확정 정본인 '신성 아르카나 성채'와 별칭 스코프를 분리하세요.",
        overdueForeshadowPayoffScriptKo:
          "3화 엔딩 컷에서 '부서진 은빛 회중시계'의 태엽이 역회전하는 클로즈업으로 회수합니다.",
        manuscriptFixProposals: [
          {
            entryKey: "lore-place-1",
            episodeId: "ep-3",
            segmentId: "seg-1",
            beforeText: "서진은 아르카나 성채로 향했다.",
            afterText: "서진은 신성 아르카나 성채로 향했다.",
            reasonKo: "v2 정본 명칭 반영",
          },
        ],
      },
    });

    const res = await runAiLoreAndForeshadowIntegrityAssist(
      {
        previousLore,
        currentLore,
        claimProposal: {
          kind: "place",
          name: "신성 아르카나 성채",
        },
        foreshadowSeeds: [seed],
        episodeOrder: ["ep-1", "ep-2", "ep-3"],
        currentEpisodeId: "ep-3",
        publishedEpisodes: [
          {
            id: "ep-3",
            label: "3화",
            order: 3,
            authorId: "author-1",
            segments: [
              {
                id: "seg-1",
                kind: "narration",
                speakerId: null,
                text: "서진은 「미등록 유적」을 지나 신성 아르카나 성채로 향했다.",
              },
            ],
          },
        ],
      },
      { route: TEST_ROUTE },
    );

    expect(res.loreGateResult.blocked).toBe(true);
    expect(res.foreshadowDigest.overdue).toHaveLength(1);
    expect(res.validatedManuscriptFixes).toHaveLength(1);
    expect(res.envelope.routedModel).toBe("claude-opus-5-5");
  });
});
