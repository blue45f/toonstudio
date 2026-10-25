import { describe, expect, it } from "vitest";
import {
  BSCOMIC_BOARD_CATEGORIES,
  calculateEpisodeOutsourcingSettlement,
  evaluateContractHelpdeskSafety,
  formatApplicationSubjectLine,
  getSpecializationPartByCode,
  JOB_SEEKING_HEAD_TAGS,
  matchAssistantCandidateProfile,
  WEBTOON_SPECIALIZATION_PARTS,
} from "./webtoon-assistant-outsourcing-model";

describe("webtoon-assistant-outsourcing-model (방방곡곡 · 만화인 · 웹픽월드 · 웹툰몬 표준 내재화)", () => {
  it("웹픽월드 17개 웹툰 전문 공정(001.001~001.017) 및 방방곡곡 구인구직 게시판·말머리를 정확히 정의한다", () => {
    expect(WEBTOON_SPECIALIZATION_PARTS).toHaveLength(17);
    expect(WEBTOON_SPECIALIZATION_PARTS[0]?.code).toBe("001.001");
    expect(WEBTOON_SPECIALIZATION_PARTS[16]?.code).toBe("001.017");

    const postProcessing = getSpecializationPartByCode("001.017");
    expect(postProcessing.labelKo).toContain("후보정·원꾸 담당");
    expect(postProcessing.defaultScopeKo).toContain("식자 전까지의 후보정·원꾸");

    expect(BSCOMIC_BOARD_CATEGORIES["regular-contract"].menuId).toBe(294);
    expect(BSCOMIC_BOARD_CATEGORIES["short-term-outsourcing"].menuId).toBe(295);
    expect(BSCOMIC_BOARD_CATEGORIES["job-seeking-portfolio"].menuId).toBe(297);
    expect(BSCOMIC_BOARD_CATEGORIES.commission.menuId).toBe(309);
    expect(JOB_SEEKING_HEAD_TAGS.map((tag) => tag.headId)).toEqual([182, 183, 184, 185, 186, 187]);
  });

  it("방방곡곡 표준 지원 메일/지원서 제목 규격([말머리_파트] 필명 지원서)을 생성한다", () => {
    const line = formatApplicationSubjectLine(
      {
        boardCategory: "regular-contract",
        partCode: "001.003",
        applicantSubjectPrefix: "정규직",
      },
      "홍길동",
    );
    expect(line).toBe("[정규직_선화] 홍길동 지원서");
  });

  it("회차당 기준 컷수(예: 30컷) 초과 시 컷당 추가 할증 단가와 유급 샘플 테스트비 및 3.3% 원천징수를 정확히 계산한다", () => {
    const result = calculateEpisodeOutsourcingSettlement({
      rateModel: "per-episode-with-overtime",
      baseEpisodeRateKrw: 450000,
      baseCutThreshold: 30,
      overtimeCutRateKrw: 15000,
      perCutRateKrw: 16000,
      monthlySalaryKrw: 2800000,
      actualCutCount: 40, // 10컷 초과
      includePaidSampleTest: true,
      sampleTestFeeKrw: 50000,
      applyWithholdingTax3_3: true,
    });

    expect(result.basePayKrw).toBe(450000);
    expect(result.overtimeCutCount).toBe(10);
    expect(result.overtimePayKrw).toBe(150000);
    expect(result.sampleTestPayKrw).toBe(50000);
    expect(result.grossTotalKrw).toBe(650000);
    expect(result.withholdingTaxKrw).toBe(Math.round(650000 * 0.033));
    expect(result.netPayoutKrw).toBe(650000 - Math.round(650000 * 0.033));
  });

  it("만화인 헬프데스크 6대 권익 보호 점검에서 무급 테스트나 무상 리테이크 과다 시 경고를 반환한다", () => {
    const safeResult = evaluateContractHelpdeskSafety({
      writtenContractConfirmed: true,
      businessOrWithholdingDeclared: true,
      requiresSampleTest: true,
      isSampleTestPaid: true,
      overtimeCutRateSpecified: true,
      maxFreeRetakeCount: 2,
      creditAndPortfolioPolicyClear: true,
    });
    expect(safeResult.isSafeForPublish).toBe(true);
    expect(safeResult.scoreOutOf100).toBe(100);
    expect(safeResult.warningsKo).toHaveLength(0);

    const riskyResult = evaluateContractHelpdeskSafety({
      writtenContractConfirmed: false,
      businessOrWithholdingDeclared: true,
      requiresSampleTest: true,
      isSampleTestPaid: false,
      overtimeCutRateSpecified: false,
      maxFreeRetakeCount: 5,
      creditAndPortfolioPolicyClear: true,
    });
    expect(riskyResult.isSafeForPublish).toBe(false);
    expect(riskyResult.warningsKo.length).toBeGreaterThanOrEqual(4);
  });

  it("구직자 포트폴리오 매칭에서 비선호 장르 및 성인물(19금) 제외 조건을 엄격히 판별한다", () => {
    const candidate = {
      id: "cand-1",
      penName: "펜선_하늘",
      headId: 185 as const,
      primaryPartCode: "001.003" as const,
      secondaryPartCodes: ["001.004" as const],
      preferredGenres: ["romance-fantasy" as const],
      excludedGenres: ["adult-19" as const, "bl-gl" as const],
      tools: ["clip-studio-ex" as const],
      weeklyMaxCuts: 70,
      availableForUrgentSub: true,
      portfolioVerified: true,
    };

    const eligibleMatch = matchAssistantCandidateProfile(
      {
        partCode: "001.003",
        genre: "romance-fantasy",
        isAdultContent: false,
        baseCutThreshold: 30,
      },
      candidate,
    );
    expect(eligibleMatch.isEligible).toBe(true);
    expect(eligibleMatch.matchScore).toBe(100);

    const adultExcludedMatch = matchAssistantCandidateProfile(
      {
        partCode: "001.003",
        genre: "romance-fantasy",
        isAdultContent: true,
        baseCutThreshold: 30,
      },
      candidate,
    );
    expect(adultExcludedMatch.isEligible).toBe(false);
    expect(adultExcludedMatch.disqualifierReasonsKo[0]).toContain("성인물(19금)");
  });
});
