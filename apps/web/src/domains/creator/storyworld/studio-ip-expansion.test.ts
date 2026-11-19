import { describe, expect, it } from "vitest";

import {
  IP_EXPANSION_TRACKS,
  buildIpPitchBibleMarkdown,
  calculateLayerRoyaltyLedger,
  evaluateIpExpansionReadiness,
  evaluatePilotMarketValidation,
  simulateIpTrackRevenue,
  simulateSeasonFandomFunding,
} from "./studio-ip-expansion";

describe("studio-ip-expansion", () => {
  it("권리 BOM이 미완료면 11개 확장 트랙 전체를 blocked로 차단한다", () => {
    expect(IP_EXPANSION_TRACKS.length).toBe(11);
    const readiness = evaluateIpExpansionReadiness({
      workTitle: "테스트 작품",
      genre: "판타지",
      publishedEpisodes: 60,
      cumulativeViews: 2_000_000,
      hasCharacterSheets: true,
      hasStoryBible: true,
      hasCleanRightsBom: false,
      has3dWorldAssets: true,
      hasVoiceCastPlan: true,
    });

    expect(readiness.every((item) => item.status === "blocked")).toBe(true);
    expect(readiness[0]?.missingRequirementsKo[0]).toContain("권리 BOM");
  });

  it("MG 리쿱 기반 수익 정산과 피치 바이블 마크다운을 생성한다", () => {
    const sim = simulateIpTrackRevenue("animation", 2_000_000_000, 100_000_000, 12);
    expect(sim.mgKrw).toBe(100_000_000);
    expect(sim.creatorRsShareKrw).toBe(140_000_000);
    expect(sim.totalCreatorPayoutKrw).toBe(240_000_000);

    const profile = {
      workTitle: "성좌의 공방",
      genre: "로판",
      publishedEpisodes: 50,
      cumulativeViews: 3_000_000,
      hasCharacterSheets: true,
      hasStoryBible: true,
      hasCleanRightsBom: true,
      has3dWorldAssets: true,
      hasVoiceCastPlan: true,
    };
    const readiness = evaluateIpExpansionReadiness(profile);
    const pilotReport = evaluatePilotMarketValidation({
      openingHookScore: 88,
      characterConsistencyScore: 90,
      mobileLegibilityPass: true,
      pilotCutCount: 6,
      sampleReaderCompletionRate: 85,
      targetDemographicLabel: "2030 독자",
    });
    const fundingReport = simulateSeasonFandomFunding({
      targetSupporters: 400,
      avgMonthlyPledgeKrw: 10_000,
      seasonEpisodes: 20,
      platformFeePercent: 10,
      episodeProductionCostKrw: 500_000,
    });
    const royaltyReport = calculateLayerRoyaltyLedger([
      {
        assetId: "a1",
        assetName: "액션 타임라인",
        creatorName: "원작자",
        rightsBomCleared: true,
        usageCount: 10,
        unitRoyaltyKrw: 50_000,
      },
      {
        assetId: "a2",
        assetName: "미검증 팩",
        creatorName: "외부",
        rightsBomCleared: false,
        usageCount: 5,
        unitRoyaltyKrw: 40_000,
      },
    ]);

    expect(pilotReport.verdict).toBe("go");
    expect(fundingReport.netCreatorFundingKrw).toBe(18_000_000);
    expect(fundingReport.fundedEpisodeRunway).toBe(36);
    expect(royaltyReport.eligiblePayoutKrw).toBe(500_000);
    expect(royaltyReport.blockedCount).toBe(1);

    const md = buildIpPitchBibleMarkdown(
      profile,
      readiness,
      [
        {
          id: "s1",
          title: "성좌의 공방 외전",
          trackId: "webnovel-spinoff",
          premiseKo: "서브 남주 시점",
          canonLink: "side-story",
        },
      ],
      { pilotReport, fundingReport, royaltyReport },
    );
    expect(md).toContain("# [성좌의 공방] IP 확장 피치 바이블");
    expect(md).toContain("성좌의 공방 외전");
    expect(md).toContain("파일럿 3컷 시장성 사전검증");
    expect(md).toContain("시즌 팬덤 펀딩 시뮬레이션");
    expect(md).toContain("수정 가능 레이어 · 에셋 자동 로열티 정산");
  });
});
