/**
 * 웹툰 IP 확장(OSM: One-Source Multi-Use) 전략 · 준비도 진단 · 파일럿 시장성 사전검증 ·
 * 시즌 팬덤 펀딩 · 레이어 자동 로열티 정산 원장 · 피치 바이블 엔진.
 */

export type IpExpansionTrackId =
  | "animation"
  | "live-action-drama"
  | "game-adaptation"
  | "print-merchandise"
  | "webnovel-spinoff"
  | "global-localization"
  | "audio-drama-ost"
  | "local-tourism-fnb"
  | "public-education-heritage"
  | "emotional-wellness-brand"
  | "personal-memoir-book";

export interface IpWorkProfile {
  readonly workTitle: string;
  readonly genre: string;
  readonly publishedEpisodes: number;
  readonly cumulativeViews: number;
  readonly hasCharacterSheets: boolean;
  readonly hasStoryBible: boolean;
  readonly hasCleanRightsBom: boolean;
  readonly has3dWorldAssets: boolean;
  readonly hasVoiceCastPlan: boolean;
}

export interface IpTrackReadiness {
  readonly trackId: IpExpansionTrackId;
  readonly labelKo: string;
  readonly readinessScore: number;
  readonly status: "ready" | "needs-prep" | "blocked";
  readonly missingRequirementsKo: readonly string[];
  readonly deliverablesKo: readonly string[];
  readonly estimatedMgKrw: number;
  readonly creatorRsPercent: number;
}

export interface IpSpinoffNode {
  readonly id: string;
  readonly title: string;
  readonly trackId: IpExpansionTrackId;
  readonly premiseKo: string;
  readonly canonLink: "main-canon" | "parallel-if" | "prequel" | "side-story";
}

export interface IpRevenueSimulation {
  readonly trackId: IpExpansionTrackId;
  readonly grossRevenueKrw: number;
  readonly mgKrw: number;
  readonly creatorRsShareKrw: number;
  readonly totalCreatorPayoutKrw: number;
}

export interface PilotMarketValidationInput {
  readonly openingHookScore: number;
  readonly characterConsistencyScore: number;
  readonly mobileLegibilityPass: boolean;
  readonly pilotCutCount: number;
  readonly sampleReaderCompletionRate: number;
  readonly targetDemographicLabel: string;
}

export interface PilotMarketValidationReport {
  readonly overallScore: number;
  readonly verdict: "go" | "iterate" | "pivot";
  readonly verdictLabelKo: string;
  readonly estimatedRetentionPercent: number;
  readonly actionItemsKo: readonly string[];
}

export interface SeasonFandomFundingInput {
  readonly targetSupporters: number;
  readonly avgMonthlyPledgeKrw: number;
  readonly seasonEpisodes: number;
  readonly platformFeePercent: number;
  readonly episodeProductionCostKrw: number;
}

export interface SeasonFandomFundingReport {
  readonly grossSeasonFundingKrw: number;
  readonly netCreatorFundingKrw: number;
  readonly totalProductionBudgetKrw: number;
  readonly netSurplusKrw: number;
  readonly fundedEpisodeRunway: number;
  readonly milestonesKo: readonly string[];
}

export interface LayerRoyaltyUsageEntry {
  readonly assetId: string;
  readonly assetName: string;
  readonly creatorName: string;
  readonly rightsBomCleared: boolean;
  readonly usageCount: number;
  readonly unitRoyaltyKrw: number;
}

export interface LayerRoyaltyLedgerReport {
  readonly totalUsageCount: number;
  readonly eligiblePayoutKrw: number;
  readonly blockedCount: number;
  readonly entries: readonly (LayerRoyaltyUsageEntry & { readonly subtotalKrw: number })[];
}

interface TrackDefinition {
  readonly id: IpExpansionTrackId;
  readonly labelKo: string;
  readonly minEpisodes: number;
  readonly requiresCharacterSheets: boolean;
  readonly requiresStoryBible: boolean;
  readonly requires3dWorld: boolean;
  readonly requiresVoicePlan: boolean;
  readonly baseMgKrw: number;
  readonly defaultRsPercent: number;
  readonly deliverablesKo: readonly string[];
}

export const IP_EXPANSION_TRACKS: readonly TrackDefinition[] = Object.freeze([
  {
    id: "animation",
    labelKo: "애니메이션 (TVA / OTT)",
    minEpisodes: 40,
    requiresCharacterSheets: true,
    requiresStoryBible: true,
    requires3dWorld: false,
    requiresVoicePlan: true,
    baseMgKrw: 120_000_000,
    defaultRsPercent: 12,
    deliverablesKo: ["캐릭터 삼면도·표정 시트", "시즌1 12부작 시리즈 바이블", "성우/사운드 톤 가이드"],
  },
  {
    id: "live-action-drama",
    labelKo: "드라마 · 영화 영상화",
    minEpisodes: 30,
    requiresCharacterSheets: false,
    requiresStoryBible: true,
    requires3dWorld: false,
    requiresVoicePlan: false,
    baseMgKrw: 150_000_000,
    defaultRsPercent: 10,
    deliverablesKo: ["로그라인 & 기획안 덱", "주요 인물 관계도", "핵심 회차 시놉시스"],
  },
  {
    id: "game-adaptation",
    labelKo: "게임화 · 콜라보 DLC",
    minEpisodes: 25,
    requiresCharacterSheets: true,
    requiresStoryBible: true,
    requires3dWorld: true,
    requiresVoicePlan: false,
    baseMgKrw: 100_000_000,
    defaultRsPercent: 15,
    deliverablesKo: ["VRM/GLB 캐릭터 모델 패키지", "스킬/세계관 룰북", "상업 라이선스 클리어 BOM"],
  },
  {
    id: "print-merchandise",
    labelKo: "단행본 · 굿즈 · 팝업스토어",
    minEpisodes: 15,
    requiresCharacterSheets: true,
    requiresStoryBible: false,
    requires3dWorld: false,
    requiresVoicePlan: false,
    baseMgKrw: 25_000_000,
    defaultRsPercent: 18,
    deliverablesKo: ["CMYK 300DPI 단행본 편집본", "아크릴/포토카드 일러스트 소스", "타이포 로고 벡터"],
  },
  {
    id: "webnovel-spinoff",
    labelKo: "웹소설 · 스핀오프 외전",
    minEpisodes: 10,
    requiresCharacterSheets: false,
    requiresStoryBible: true,
    requires3dWorld: false,
    requiresVoicePlan: false,
    baseMgKrw: 15_000_000,
    defaultRsPercent: 35,
    deliverablesKo: ["세계관 연표·설정집", "서브 캐릭터 외전 트리트먼트", "정사(Canon) 정합성 체크"],
  },
  {
    id: "global-localization",
    labelKo: "글로벌 다국어 연재 (북미/일본/동남아)",
    minEpisodes: 5,
    requiresCharacterSheets: false,
    requiresStoryBible: false,
    requires3dWorld: false,
    requiresVoicePlan: false,
    baseMgKrw: 20_000_000,
    defaultRsPercent: 40,
    deliverablesKo: ["식자 분리 PSD/JSON 원고", "고유명사 용어집(Glossary)", "효과음(SFX) 현지화 레이어"],
  },
  {
    id: "audio-drama-ost",
    labelKo: "오디오드라마 · OST 음원",
    minEpisodes: 20,
    requiresCharacterSheets: false,
    requiresStoryBible: true,
    requires3dWorld: false,
    requiresVoicePlan: true,
    baseMgKrw: 18_000_000,
    defaultRsPercent: 20,
    deliverablesKo: ["회차별 오디오 대본", "캐릭터 보이스 톤 시트", "테마곡 무드 보드"],
  },
  {
    id: "local-tourism-fnb",
    labelKo: "로컬 스토리 · 관광 · F&B 브랜드 협업",
    minEpisodes: 4,
    requiresCharacterSheets: true,
    requiresStoryBible: false,
    requires3dWorld: false,
    requiresVoicePlan: false,
    baseMgKrw: 12_000_000,
    defaultRsPercent: 22,
    deliverablesKo: ["지역 캐릭터 마스코트 시트", "QR 체험 스탬프 4컷 패키지", "F&B·공간 사이니지 목업"],
  },
  {
    id: "public-education-heritage",
    labelKo: "역사 · 방언 · 공익 교육 멀티포맷",
    minEpisodes: 6,
    requiresCharacterSheets: false,
    requiresStoryBible: true,
    requires3dWorld: false,
    requiresVoicePlan: false,
    baseMgKrw: 16_000_000,
    defaultRsPercent: 25,
    deliverablesKo: ["9:16 숏폼·카드뉴스·퀴즈 번들", "다국어 교육 자막 팩", "공공기관 배포용 권리 명세서"],
  },
  {
    id: "emotional-wellness-brand",
    labelKo: "감정 체크인 · 웰니스 캐릭터 브랜드",
    minEpisodes: 8,
    requiresCharacterSheets: true,
    requiresStoryBible: false,
    requires3dWorld: false,
    requiresVoicePlan: false,
    baseMgKrw: 14_000_000,
    defaultRsPercent: 24,
    deliverablesKo: ["감정 카드·체크인 키트 인쇄본", "SNS 4컷 연재 템플릿", "기업 웰니스 B2B 협업 제안서"],
  },
  {
    id: "personal-memoir-book",
    labelKo: "인생 웹툰 자서전 · 선물 단행본",
    minEpisodes: 1,
    requiresCharacterSheets: false,
    requiresStoryBible: false,
    requires3dWorld: false,
    requiresVoicePlan: false,
    baseMgKrw: 5_000_000,
    defaultRsPercent: 50,
    deliverablesKo: ["인터뷰 기반 4·8컷 에피소드", "가족 공유용 고해상도 PDF", "소량 POD 양장 단행본 도련선 파일"],
  },
]);

export function evaluateIpExpansionReadiness(
  profile: IpWorkProfile,
): readonly IpTrackReadiness[] {
  return IP_EXPANSION_TRACKS.map((track) => {
    const missing: string[] = [];
    let score = 100;

    if (!profile.hasCleanRightsBom) {
      missing.push("상업 권리 BOM(에셋·폰트 라이선스) 클리어런스 미완료");
      score -= 40;
    }
    if (profile.publishedEpisodes < track.minEpisodes) {
      missing.push(`최소 연재 회차 부족 (${profile.publishedEpisodes}/${track.minEpisodes}화)`);
      score -= 25;
    }
    if (track.requiresCharacterSheets && !profile.hasCharacterSheets) {
      missing.push("캐릭터 삼면도·표정 시트 미등록");
      score -= 15;
    }
    if (track.requiresStoryBible && !profile.hasStoryBible) {
      missing.push("스토리월드 세계관 바이블 미완성");
      score -= 15;
    }
    if (track.requires3dWorld && !profile.has3dWorldAssets) {
      missing.push("3D/VRM 에셋 패키지 미구축");
      score -= 15;
    }
    if (track.requiresVoicePlan && !profile.hasVoiceCastPlan) {
      missing.push("성우/보이스 톤 가이드 미작성");
      score -= 10;
    }

    const boundedScore = Math.max(0, Math.min(100, score));
    const status: IpTrackReadiness["status"] = !profile.hasCleanRightsBom
      ? "blocked"
      : boundedScore >= 80
        ? "ready"
        : "needs-prep";

    const viewMultiplier = Math.min(3, Math.max(0.6, profile.cumulativeViews / 1_000_000));
    const estimatedMgKrw = Math.round((track.baseMgKrw * viewMultiplier) / 100_000) * 100_000;

    return {
      trackId: track.id,
      labelKo: track.labelKo,
      readinessScore: boundedScore,
      status,
      missingRequirementsKo: missing,
      deliverablesKo: track.deliverablesKo,
      estimatedMgKrw,
      creatorRsPercent: track.defaultRsPercent,
    };
  });
}

export function simulateIpTrackRevenue(
  trackId: IpExpansionTrackId,
  grossRevenueKrw: number,
  mgKrw: number,
  creatorRsPercent: number,
): IpRevenueSimulation {
  const safeGross = Math.max(0, Math.round(grossRevenueKrw));
  const safeMg = Math.max(0, Math.round(mgKrw));
  const safeRs = Math.min(100, Math.max(0, creatorRsPercent));
  const rawRsShare = Math.round((safeGross * safeRs) / 100);
  // MG 선지급 후 초과 RS 정산(recoupment) 모델
  const recoupmentExcess = Math.max(0, rawRsShare - safeMg);
  return {
    trackId,
    grossRevenueKrw: safeGross,
    mgKrw: safeMg,
    creatorRsShareKrw: recoupmentExcess,
    totalCreatorPayoutKrw: safeMg + recoupmentExcess,
  };
}

export function evaluatePilotMarketValidation(
  input: PilotMarketValidationInput,
): PilotMarketValidationReport {
  const hook = Math.min(100, Math.max(0, input.openingHookScore));
  const consistency = Math.min(100, Math.max(0, input.characterConsistencyScore));
  const completion = Math.min(100, Math.max(0, input.sampleReaderCompletionRate));
  const legibilityBonus = input.mobileLegibilityPass ? 10 : 0;
  const cutAdequacy = input.pilotCutCount >= 3 ? 10 : Math.round((Math.max(0, input.pilotCutCount) / 3) * 10);

  const overallScore = Math.min(
    100,
    Math.round(hook * 0.3 + consistency * 0.25 + completion * 0.25 + legibilityBonus + cutAdequacy),
  );
  const verdict: PilotMarketValidationReport["verdict"] =
    overallScore >= 78 ? "go" : overallScore >= 55 ? "iterate" : "pivot";
  const verdictLabelKo =
    verdict === "go"
      ? "본 제작 착수 권장 (GO)"
      : verdict === "iterate"
        ? "파일럿 3컷 보완 후 재검증 (ITERATE)"
        : "기획·오프닝 훅 재설계 권장 (PIVOT)";

  const actionItemsKo: string[] = [];
  if (hook < 75) actionItemsKo.push("첫 3컷 내 핵심 갈등과 시각적 훅을 전면 배치하세요.");
  if (consistency < 75) actionItemsKo.push("3D 씬 앵커와 캐릭터 일관성 시드를 고정해 컷 간 편차를 줄이세요.");
  if (!input.mobileLegibilityPass) actionItemsKo.push("375px 모바일 화면 기준으로 말풍선 글자 크기와 여백을 점검하세요.");
  if (input.pilotCutCount < 3) actionItemsKo.push("독자 반응 검증을 위해 최소 3컷 이상의 파일럿 콘티를 구성하세요.");
  if (completion < 70) actionItemsKo.push(`${input.targetDemographicLabel || "핵심 독자층"} 대상 A/B 썸네일과 도입 대사 호흡을 테스트하세요.`);
  if (actionItemsKo.length === 0) actionItemsKo.push("사전 검증 지표가 기준을 통과했습니다. 시즌 펀딩 및 B2B 피치 덱 발행으로 이어가세요.");

  return {
    overallScore,
    verdict,
    verdictLabelKo,
    estimatedRetentionPercent: Math.min(98, Math.round(completion * 0.7 + hook * 0.28)),
    actionItemsKo,
  };
}

export function simulateSeasonFandomFunding(
  input: SeasonFandomFundingInput,
): SeasonFandomFundingReport {
  const supporters = Math.max(0, Math.round(input.targetSupporters));
  const pledge = Math.max(0, Math.round(input.avgMonthlyPledgeKrw));
  const episodes = Math.max(1, Math.round(input.seasonEpisodes));
  const feeRate = Math.min(50, Math.max(0, input.platformFeePercent)) / 100;
  const costPerEp = Math.max(0, Math.round(input.episodeProductionCostKrw));

  const seasonMonths = Math.max(1, Math.ceil(episodes / 4));
  const grossSeasonFundingKrw = supporters * pledge * seasonMonths;
  const netCreatorFundingKrw = Math.round(grossSeasonFundingKrw * (1 - feeRate));
  const totalProductionBudgetKrw = episodes * costPerEp;
  const netSurplusKrw = netCreatorFundingKrw - totalProductionBudgetKrw;
  const fundedEpisodeRunway = costPerEp > 0 ? Math.floor(netCreatorFundingKrw / costPerEp) : episodes;

  const milestonesKo = [
    `1단계 (25%): 파일럿 3컷 선공개 및 독자 캐릭터 설정 투표 오픈`,
    `2단계 (50%): 시즌 전반부 ${Math.max(1, Math.floor(episodes / 2))}화 제작비 확보 및 작업 타임랩스 공유`,
    `3단계 (100%): ${episodes}화 완결 동행 확정 및 소장용 단행본·굿즈 리워드 발송`,
  ];

  return {
    grossSeasonFundingKrw,
    netCreatorFundingKrw,
    totalProductionBudgetKrw,
    netSurplusKrw,
    fundedEpisodeRunway,
    milestonesKo,
  };
}

export function calculateLayerRoyaltyLedger(
  entries: readonly LayerRoyaltyUsageEntry[],
): LayerRoyaltyLedgerReport {
  let totalUsageCount = 0;
  let eligiblePayoutKrw = 0;
  let blockedCount = 0;

  const computed = entries.map((entry) => {
    const safeUsage = Math.max(0, Math.round(entry.usageCount));
    const safeUnit = Math.max(0, Math.round(entry.unitRoyaltyKrw));
    const subtotalKrw = entry.rightsBomCleared ? safeUsage * safeUnit : 0;
    totalUsageCount += safeUsage;
    if (entry.rightsBomCleared) {
      eligiblePayoutKrw += subtotalKrw;
    } else {
      blockedCount += 1;
    }
    return { ...entry, usageCount: safeUsage, unitRoyaltyKrw: safeUnit, subtotalKrw };
  });

  return {
    totalUsageCount,
    eligiblePayoutKrw,
    blockedCount,
    entries: computed,
  };
}

export function buildIpPitchBibleMarkdown(
  profile: IpWorkProfile,
  readiness: readonly IpTrackReadiness[],
  spinoffs: readonly IpSpinoffNode[],
  options?: {
    readonly pilotReport?: PilotMarketValidationReport;
    readonly fundingReport?: SeasonFandomFundingReport;
    readonly royaltyReport?: LayerRoyaltyLedgerReport;
  },
): string {
  const readyTracks = readiness.filter((item) => item.status === "ready");
  const lines = [
    `# [${profile.workTitle}] IP 확장 피치 바이블`,
    "",
    `- 장르: ${profile.genre}`,
    `- 연재 회차: ${profile.publishedEpisodes}화 · 누적 조회수: ${profile.cumulativeViews.toLocaleString("ko-KR")}회`,
    `- 권리 BOM 클리어런스: ${profile.hasCleanRightsBom ? "완료 (상업 2차 사업 가능)" : "미완료 (사전 점검 필요)"}`,
    `- 즉시 추진 가능 트랙: ${readyTracks.length}/${readiness.length}개`,
    "",
    "## 트랙별 준비도",
    ...readiness.map(
      (item) =>
        `- **${item.labelKo}**: ${item.readinessScore}점 (${item.status}) · 예상 MG ${item.estimatedMgKrw.toLocaleString("ko-KR")}원 / RS ${item.creatorRsPercent}%`,
    ),
  ];

  if (options?.pilotReport) {
    lines.push(
      "",
      "## 파일럿 3컷 시장성 사전검증",
      `- 종합 점수: ${options.pilotReport.overallScore}점 (${options.pilotReport.verdictLabelKo})`,
      `- 예상 완독 유지율: ${options.pilotReport.estimatedRetentionPercent}%`,
    );
  }

  if (options?.fundingReport) {
    lines.push(
      "",
      "## 시즌 팬덤 펀딩 시뮬레이션",
      `- 창작자 순정산 예상액: ${options.fundingReport.netCreatorFundingKrw.toLocaleString("ko-KR")}원`,
      `- 제작 확보 회차: ${options.fundingReport.fundedEpisodeRunway}화`,
    );
  }

  if (options?.royaltyReport) {
    lines.push(
      "",
      "## 수정 가능 레이어 · 에셋 자동 로열티 정산",
      `- 누적 재사용 횟수: ${options.royaltyReport.totalUsageCount}회 · 정산 가능액: ${options.royaltyReport.eligiblePayoutKrw.toLocaleString("ko-KR")}원`,
    );
  }

  if (spinoffs.length > 0) {
    lines.push("", "## 스핀오프 · 확장 기획 노드");
    for (const node of spinoffs) {
      lines.push(`- **${node.title}** [${node.canonLink}]: ${node.premiseKo}`);
    }
  }
  return lines.join("\n");
}
