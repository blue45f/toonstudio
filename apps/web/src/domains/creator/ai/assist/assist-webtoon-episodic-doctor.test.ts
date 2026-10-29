import { describe, expect, it, vi } from "vitest";

import {
  buildDeterministicBg3dLightingAssetReport,
  buildDeterministicBgmAudioToonReport,
  buildDeterministicCharacterOocRadarReport,
  buildDeterministicCrowdDepthFogLockReport,
  buildDeterministicFootwearStrideLockReport,
  buildDeterministicMultiEpisodeCanonVaultReport,
  buildDeterministicReaderRetentionReport,
  buildDeterministicVisualContinuityLinterReport,
  runAssistBg3dLightingAssetDirector,
  runAssistBgmAudioToonCuesheet,
  runAssistCharacterOocRadar,
  runAssistCrowdDepthFogLockDirector,
  runAssistFootwearStrideLockDirector,
  runAssistMultiEpisodeCanonVault,
  runAssistReaderRetentionSimulator,
  runAssistVisualContinuityLinter,
  runAssistWebtoonEpisodicDoctor,
} from "./assist-webtoon-episodic-doctor";

import * as assistTransport from "@/shared/ai/assist/assist-transport";

describe("assist-webtoon-episodic-doctor", () => {
  const sampleInput = {
    genre: "판타지",
    coreConflict: "봉인된 기억의 각성과 황실의 배신",
    protagonistName: "서진",
    partnerName: "하윤",
    relationshipDynamic: "fated-rivals" as const,
    posePresetId: "pose-aerial-landing" as const,
    targetLocale: "ko" as const,
    scriptText: "서진: 여기서 물러서면 다 끝이야.\n하윤: 눈을 피하지 마. 네가 선택한 길이잖아.",
  };

  it("결정적(Deterministic) 폴백 4종이 모두 유효한 뷰 구조체를 즉시 반환한다", () => {
    const retention = buildDeterministicReaderRetentionReport(sampleInput);
    expect(retention.mode).toBe("reader-retention-simulator");
    expect(retention.source).toBe("deterministic-fallback");
    expect(retention.predictedEpisodeStarRating).toBeGreaterThanOrEqual(9.0);
    expect(retention.completionRatePct).toBeGreaterThanOrEqual(80);
    expect(retention.cutRetentionCurve.length).toBeGreaterThan(0);
    expect(retention.predictedTopComments.length).toBe(3);

    const ooc = buildDeterministicCharacterOocRadarReport(sampleInput);
    expect(ooc.mode).toBe("character-ooc-radar");
    expect(ooc.voiceConsistencyScore).toBeGreaterThanOrEqual(80);
    expect(ooc.dialogueAudits.length).toBeGreaterThan(0);
    expect(ooc.dialogueAudits[0]?.conciseMobileLine.length).toBeLessThanOrEqual(42);

    const bg3d = buildDeterministicBg3dLightingAssetReport(sampleInput);
    expect(bg3d.mode).toBe("bg3d-lighting-asset-director");
    expect(bg3d.cut3dSpecs.length).toBeGreaterThan(0);
    expect(bg3d.cut3dSpecs[0]?.cameraLensMm).toBeGreaterThanOrEqual(14);

    const bgm = buildDeterministicBgmAudioToonReport(sampleInput);
    expect(bgm.mode).toBe("bgm-audiotoon-cuesheet");
    expect(bgm.recommendedBpm).toBeGreaterThanOrEqual(45);
    expect(bgm.audioCues.length).toBeGreaterThan(0);

    const linter = buildDeterministicVisualContinuityLinterReport(sampleInput);
    expect(linter.mode).toBe("episodic-visual-continuity-linter");
    expect(linter.zeroAnimationErrorGuarantee).toBe(true);
    expect(linter.cutContinuityChecks.length).toBeGreaterThan(0);

    const canonVault = buildDeterministicMultiEpisodeCanonVaultReport(sampleInput);
    expect(canonVault.mode).toBe("multi-episode-canon-memory-vault");
    expect(canonVault.canonVaultIntegrityScore).toBeGreaterThanOrEqual(95);
    expect(canonVault.canonEntries.length).toBeGreaterThan(0);

    const footwear = buildDeterministicFootwearStrideLockReport(sampleInput);
    expect(footwear.mode).toBe("episodic-footwear-floor-contact-stride-lock");
    expect(footwear.heelHeightCm).toBeGreaterThan(0);

    const crowdDepth = buildDeterministicCrowdDepthFogLockReport(sampleInput);
    expect(crowdDepth.mode).toBe("episodic-crowd-silhouette-depth-fog-lock");
    expect(crowdDepth.backgroundSilhouetteFogPct).toBeGreaterThanOrEqual(10);
  });

  it("Claude 구조화 출력(assistParse) 성공 시 claude-live 결과를 정규화해 반환한다", async () => {
    const fakeRoute = {
      apiKey: "sk-ant-test-key",
      revision: 1,
      model: "claude-haiku-5-5",
    };

    const parseSpy = vi.spyOn(assistTransport, "assistParse").mockResolvedValueOnce({
      message: {
        model: "claude-haiku-5-5",
        usage: { input_tokens: 320, output_tokens: 210 },
      } as never,
      parsed: {
        predictedEpisodeStarRating: 9.96,
        completionRatePct: 97,
        scrollVelocitySummaryKo: "클라이맥스 컷에서 독자 체류 시간이 정점에 도달합니다.",
        cutRetentionCurve: [
          {
            cutNumber: 1,
            dwellTimeSeconds: 4.2,
            dropOffRiskPct: 5,
            dropOffReasonKo: "도입부 강렬한 클로즈업으로 이탈 위험 낮음",
            retentionBoostFixKo: "역광 림라이트를 유지하세요.",
            readyRetentionDirectionLine: "[독자 체류 컷 1] 역광 클로즈업 유지",
          },
        ],
        predictedTopComments: [
          {
            personaLabelKo: "정주행 독자",
            commentTextKo: "이번 화 연출 레전드다",
            predictedLikes: 4500,
            sentimentTone: "hype",
          },
        ],
      },
    });

    const liveRetention = await runAssistReaderRetentionSimulator(sampleInput, {
      route: fakeRoute,
      fallbackOnError: false,
    });

    expect(liveRetention.source).toBe("claude-live");
    expect(liveRetention.predictedEpisodeStarRating).toBe(9.96);
    expect(liveRetention.completionRatePct).toBe(97);
    expect(liveRetention.cutRetentionCurve[0]?.dwellTimeSeconds).toBe(4.2);
    expect(liveRetention.predictedTopComments[0]?.predictedLikes).toBe(4500);

    parseSpy.mockRestore();
  });

  it("runAssistWebtoonEpisodicDoctor 디스패처가 4개 모드를 모두 안전하게 실행한다", async () => {
    const parseSpy = vi
      .spyOn(assistTransport, "assistParse")
      .mockRejectedValue(new Error("simulated offline"));

    const r1 = await runAssistWebtoonEpisodicDoctor("reader-retention-simulator", sampleInput);
    expect(r1.mode).toBe("reader-retention-simulator");

    const r2 = await runAssistWebtoonEpisodicDoctor("character-ooc-radar", sampleInput);
    expect(r2.mode).toBe("character-ooc-radar");

    const r3 = await runAssistWebtoonEpisodicDoctor("bg3d-lighting-asset-director", sampleInput);
    expect(r3.mode).toBe("bg3d-lighting-asset-director");

    const r4 = await runAssistWebtoonEpisodicDoctor("bgm-audiotoon-cuesheet", sampleInput);
    expect(r4.mode).toBe("bgm-audiotoon-cuesheet");

    const r5 = await runAssistWebtoonEpisodicDoctor(
      "episodic-visual-continuity-linter",
      sampleInput,
    );
    expect(r5.mode).toBe("episodic-visual-continuity-linter");

    const r6 = await runAssistWebtoonEpisodicDoctor(
      "multi-episode-canon-memory-vault",
      sampleInput,
    );
    expect(r6.mode).toBe("multi-episode-canon-memory-vault");

    const r7 = await runAssistWebtoonEpisodicDoctor(
      "episodic-footwear-floor-contact-stride-lock",
      sampleInput,
    );
    expect(r7.mode).toBe("episodic-footwear-floor-contact-stride-lock");

    const r8 = await runAssistWebtoonEpisodicDoctor(
      "episodic-crowd-silhouette-depth-fog-lock",
      sampleInput,
    );
    expect(r8.mode).toBe("episodic-crowd-silhouette-depth-fog-lock");

    // 개별 실행 함수도 폴백 확인
    const oocFallback = await runAssistCharacterOocRadar(sampleInput);
    expect(oocFallback.source).toBe("deterministic-fallback");
    const bg3dFallback = await runAssistBg3dLightingAssetDirector(sampleInput);
    expect(bg3dFallback.source).toBe("deterministic-fallback");
    const bgmFallback = await runAssistBgmAudioToonCuesheet(sampleInput);
    expect(bgmFallback.source).toBe("deterministic-fallback");
    const linterFallback = await runAssistVisualContinuityLinter(sampleInput);
    expect(linterFallback.source).toBe("deterministic-fallback");
    const canonFallback = await runAssistMultiEpisodeCanonVault(sampleInput);
    expect(canonFallback.source).toBe("deterministic-fallback");
    const footwearFallback = await runAssistFootwearStrideLockDirector(sampleInput);
    expect(footwearFallback.source).toBe("deterministic-fallback");
    const crowdFallback = await runAssistCrowdDepthFogLockDirector(sampleInput);
    expect(crowdFallback.source).toBe("deterministic-fallback");

    parseSpy.mockRestore();
  });
});
