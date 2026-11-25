/**
 * Wave 42C — 독립·프로 웹툰 작가 수익화 퍼널 · 굿즈 MOQ/BEP · 한국 3.3%/10% 정산 · 주간 마감 번아웃 예측 엔진.
 *
 * - 유료 미리보기 전환 퍼널 & MG(미니멈 개런티) 회수 시점 시뮬레이터 (`simulatePaywallFunnel`)
 * - 굿즈 제작 손익분기(MOQ/BEP) 계산기 (`calculateGoodsUnitEconomics`)
 * - 한국 창작자 프리랜서 3.3% 원천징수 vs 사업자 부가세 10% 정산 비교기 (`calculateKoreanCreatorSettlement`)
 * - 주간 컷 작업량 번아웃 위험도(0~100) 및 어시스트/외주 위임 추천기 (`forecastWeeklyBurnoutRisk`)
 *
 * 모든 계산 결과는 사용자 입력 시나리오 기반 `추정(estimate)`으로 명시 태깅되며 실측 통계를 꾸미지 않습니다.
 * 순수 함수형 모듈: 브라우저 스토리지 · BigInt 리터럴 · private Map 캐시 미사용.
 */

export type SimulationDataSourceKind = "estimate";

export interface EstimateProvenance {
  readonly dataSourceKind: SimulationDataSourceKind;
  readonly badgeLabelKo: "추정"; readonly badgeLabelEn: "Estimate";
  readonly noticeKo: string; readonly noticeEn: string;
}

export type PaywallScenarioPresetId = "indie-challenge" | "weekly-pro-mg" | "hit-preview-5";
export type MgRecoupmentStatus = "no-mg" | "surplus-immediate" | "recouping-advance" | "mg-deficit";
export type PaywallSensitivityBandId = "conservative" | "base" | "optimistic";

export interface PaywallFunnelInput {
  readonly freeEpisodeReaders: number; readonly freeEpisodeCount: number; readonly previewEpisodeCount: number;
  readonly initialPreviewConversionPct: number; readonly stepRetentionRatePct: number;
  readonly pricePerPreviewEpisodeKrw: number; readonly appStoreFeePct: number; readonly platformFeePct: number;
  readonly episodesPerMonth: number; readonly mgPerEpisodeKrw: number; readonly upfrontAdvanceKrw: number;
}

export interface PaywallScenarioPreset {
  readonly id: PaywallScenarioPresetId;
  readonly labelKo: string; readonly labelEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly input: PaywallFunnelInput;
}

export interface PaywallPreviewStep {
  readonly stepIndex: number;
  readonly episodeLabelKo: string; readonly episodeLabelEn: string;
  readonly conversionFromFreePct: number; readonly stepRetentionFromPrevPct: number;
  readonly payingReaders: number; readonly stepGrossRevenueKrw: number; readonly stepCreatorRsKrw: number;
  readonly cumulativeGrossRevenueKrw: number; readonly cumulativeCreatorRsKrw: number;
}

export interface PaywallSensitivityBand {
  readonly bandId: PaywallSensitivityBandId;
  readonly labelKo: string; readonly labelEn: string;
  readonly conversionMultiplier: number;
  readonly monthlyGrossRevenueKrw: number; readonly monthlyCreatorRsKrw: number;
  readonly monthlyCashflowBeforeTaxKrw: number;
  readonly mgRecoupmentStatus: MgRecoupmentStatus; readonly mgRecoupmentMonths: number | null;
}

export interface PaywallFunnelResult {
  readonly dataSourceKind: SimulationDataSourceKind; readonly provenance: EstimateProvenance;
  readonly sanitizedInput: PaywallFunnelInput; readonly previewSteps: readonly PaywallPreviewStep[];
  readonly creatorSharePct: number; readonly netRealizationRatePct: number;
  readonly step1PayingReaders: number; readonly finalStepPayingReaders: number;
  readonly totalPaidUnlocksPerCycle: number; readonly averagePaidEpisodesPerBuyer: number;
  readonly effectiveArppuKrw: number;
  readonly grossRevenuePerEpisodeKrw: number; readonly appStoreFeePerEpisodeKrw: number;
  readonly platformFeePerEpisodeKrw: number; readonly creatorRsPerEpisodeKrw: number;
  readonly monthlyGrossRevenueKrw: number; readonly monthlyAppStoreFeeKrw: number;
  readonly monthlyPlatformFeeKrw: number; readonly monthlyCreatorRsKrw: number;
  readonly monthlyMgAdvanceKrw: number; readonly monthlyRsSurplusOverMgKrw: number;
  readonly monthlyMgShortfallKrw: number; readonly monthlyCashflowBeforeTaxKrw: number;
  readonly mgCoverageRatioPct: number | null; readonly mgRecoupmentStatus: MgRecoupmentStatus;
  readonly mgRecoupmentEpisodes: number | null; readonly mgRecoupmentMonths: number | null;
  readonly requiredInitialConversionPctForMg: number | null; readonly requiredFreeReadersForMg: number | null;
  readonly sensitivityBands: readonly PaywallSensitivityBand[];
  readonly formulaNotesKo: readonly string[];
}

export type GoodsItemType = "acrylic-stand" | "photocard-set" | "print-book";

export interface GoodsUnitEconomicsInput {
  readonly goodsType: GoodsItemType;
  readonly sellingPriceKrw: number; readonly unitManufacturingCostKrw: number;
  readonly packagingAndShippingPerUnitKrw: number; readonly fixedSetupCostKrw: number;
  readonly moqUnits: number; readonly plannedOrderUnits: number;
  readonly expectedSellThroughPct: number; readonly channelFeePct: number;
}

export interface GoodsPresetSpec {
  readonly id: GoodsItemType;
  readonly labelKo: string; readonly labelEn: string;
  readonly hintKo: string; readonly hintEn: string;
  readonly input: GoodsUnitEconomicsInput;
}

export interface GoodsUnitEconomicsResult {
  readonly dataSourceKind: SimulationDataSourceKind; readonly provenance: EstimateProvenance;
  readonly sanitizedInput: GoodsUnitEconomicsInput;
  readonly effectiveOrderUnits: number; readonly belowMoqWarning: boolean;
  readonly unitChannelFeeKrw: number; readonly unitVariableCostKrw: number;
  readonly contributionMarginPerUnitKrw: number; readonly contributionMarginPct: number;
  readonly netCashPerSoldUnitKrw: number; readonly isUnitMarginPositive: boolean;
  readonly totalFixedCostKrw: number; readonly totalManufacturingCostKrw: number;
  readonly totalUpfrontManufacturingOutlayKrw: number;
  readonly contributionBreakEvenUnits: number | null; readonly breakEvenUnits: number | null;
  readonly breakEvenSellThroughPct: number | null; readonly moqAchievable: boolean;
  readonly expectedSoldUnits: number; readonly unsoldInventoryUnits: number;
  readonly grossRevenueKrw: number; readonly totalChannelFeeKrw: number;
  readonly totalShippingCostKrw: number; readonly totalCostKrw: number;
  readonly netProfitKrw: number; readonly netProfitMarginPct: number; readonly roiPct: number;
}

export type VatContractMode = "vat-exclusive" | "vat-inclusive";
export type FavoredCashflowStructure = "business-vat-10" | "freelancer-3.3" | "comparable";

export interface KoreanCreatorSettlementInput {
  readonly grossContractAmountKrw: number;
  readonly deductibleExpenseKrw: number;
  readonly vatContractMode: VatContractMode;
  readonly nationalIncomeTaxRatePct?: number; readonly localIncomeTaxRatePct?: number; readonly vatRatePct?: number;
}

export interface FreelancerWithholdingBreakdown {
  readonly withholdingRatePct: number; readonly nationalIncomeTaxRatePct: number; readonly localIncomeTaxRatePct: number;
  readonly grossAmountKrw: number; readonly nationalIncomeTaxKrw: number; readonly localIncomeTaxKrw: number;
  readonly totalWithholdingTaxKrw: number; readonly immediateNetPayoutKrw: number; readonly netAfterExpensesKrw: number;
}

export interface BusinessVatBreakdown {
  readonly vatRatePct: number; readonly vatContractMode: VatContractMode;
  readonly supplyAmountKrw: number; readonly outputVatKrw: number; readonly invoiceTotalKrw: number;
  readonly inputVatCreditKrw: number; readonly netVatPayableKrw: number; readonly vatRefundKrw: number;
  readonly immediateCashInflowKrw: number; readonly netAfterVatSettlementKrw: number;
  readonly netAfterVatAndExpensesKrw: number;
}

export interface KoreanCreatorSettlementResult {
  readonly dataSourceKind: SimulationDataSourceKind; readonly provenance: EstimateProvenance;
  readonly sanitizedInput: KoreanCreatorSettlementInput;
  readonly freelancer: FreelancerWithholdingBreakdown;
  readonly businessVat: BusinessVatBreakdown;
  readonly comparison: {
    readonly immediateCashDiffKrw: number; readonly postVatNetAfterExpensesDiffKrw: number;
    readonly vatSetAsideReserveKrw: number; readonly favoredCashflowStructure: FavoredCashflowStructure;
    readonly summaryKo: string; readonly summaryEn: string;
    readonly taxDisclaimerKo: string; readonly taxDisclaimerEn: string;
  };
}

export type ProductionStageId = "conti" | "lineart" | "coloring" | "background" | "lettering";
export type DelegationPriority = "high" | "medium" | "low";
export type BurnoutRiskLevel = "safe" | "caution" | "high" | "critical";
export type BurnoutPresetId = "biweekly-calm" | "weekly-solo-tight" | "weekly-fullcolor-crunch";
export type StageMinutesMap = Readonly<Record<ProductionStageId, number>>;

export interface ProductionStageSpec {
  readonly stageId: ProductionStageId;
  readonly labelKo: string; readonly labelEn: string;
  readonly delegationSuitabilityScore: number; readonly delegationPriority: DelegationPriority;
  readonly defaultMinutesPerCut: number; readonly defaultEstimatedCostPerCutKrw: number;
  readonly delegationRationaleKo: string; readonly delegationRationaleEn: string;
}

export interface WeeklyBurnoutInput {
  readonly weeklyCutCount: number; readonly availableWorkHoursPerWeek: number;
  readonly consecutiveCrunchWeeks: number; readonly revisionBufferPct: number;
  readonly stageMinutesPerCut: StageMinutesMap;
  readonly delegatedStages?: readonly ProductionStageId[];
  readonly assistantCostPerCutByStageKrw?: Readonly<Partial<Record<ProductionStageId, number>>>;
}

export interface BurnoutScenarioPreset {
  readonly id: BurnoutPresetId;
  readonly labelKo: string; readonly labelEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly input: WeeklyBurnoutInput;
}

export interface StageWorkloadBreakdown {
  readonly stageId: ProductionStageId;
  readonly labelKo: string; readonly labelEn: string;
  readonly minutesPerCut: number; readonly totalHours: number; readonly totalHoursWithBuffer: number;
  readonly sharePct: number; readonly isDelegated: boolean;
  readonly delegationSuitabilityScore: number; readonly delegationPriority: DelegationPriority;
  readonly estimatedWeeklyOutsourcingKrw: number;
  readonly delegationRationaleKo: string; readonly delegationRationaleEn: string;
}

export interface DelegationRecommendation {
  readonly stageId: ProductionStageId;
  readonly labelKo: string; readonly labelEn: string;
  readonly priority: DelegationPriority;
  readonly hoursSaved: number; readonly projectedBurnoutScoreAfter: number;
  readonly estimatedWeeklyCostKrw: number;
  readonly reasonKo: string; readonly reasonEn: string;
}

export interface WeeklyBurnoutForecastResult {
  readonly dataSourceKind: SimulationDataSourceKind; readonly provenance: EstimateProvenance;
  readonly sanitizedInput: {
    readonly weeklyCutCount: number; readonly availableWorkHoursPerWeek: number;
    readonly consecutiveCrunchWeeks: number; readonly revisionBufferPct: number;
    readonly stageMinutesPerCut: StageMinutesMap; readonly delegatedStages: readonly ProductionStageId[];
  };
  readonly stages: readonly StageWorkloadBreakdown[];
  readonly rawProductionHours: number; readonly revisionBufferHours: number; readonly totalRequiredHours: number;
  readonly delegatedHours: number; readonly remainingAuthorHours: number;
  readonly utilizationPct: number; readonly overtimeHours: number;
  readonly burnoutScore: number; readonly burnoutScoreBeforeDelegation: number;
  readonly burnoutReliefPoints: number; readonly burnoutLevel: BurnoutRiskLevel;
  readonly sustainableCutCapacity: number; readonly weeklyDelegationBudgetKrw: number;
  readonly recommendedDelegations: readonly DelegationRecommendation[];
}

export const DEFAULT_PAYWALL_FUNNEL_INPUT: PaywallFunnelInput = {
  freeEpisodeReaders: 95000, freeEpisodeCount: 10, previewEpisodeCount: 5,
  initialPreviewConversionPct: 4.5, stepRetentionRatePct: 74, pricePerPreviewEpisodeKrw: 200,
  appStoreFeePct: 15, platformFeePct: 30, episodesPerMonth: 4, mgPerEpisodeKrw: 1_200_000, upfrontAdvanceKrw: 3_000_000,
};

export const PAYWALL_SCENARIO_PRESETS: readonly PaywallScenarioPreset[] = [
  {
    id: "indie-challenge", labelKo: "독립·도전 연재 (무MG)", labelEn: "Indie Serial (No MG)",
    summaryKo: "초기 팬덤 중심 무MG 순수 RS 시나리오(추정)", summaryEn: "Early indie readership pure RS scenario (estimate)",
    input: {
      freeEpisodeReaders: 18000, freeEpisodeCount: 8, previewEpisodeCount: 5,
      initialPreviewConversionPct: 3.5, stepRetentionRatePct: 70, pricePerPreviewEpisodeKrw: 200,
      appStoreFeePct: 10, platformFeePct: 30, episodesPerMonth: 4, mgPerEpisodeKrw: 0, upfrontAdvanceKrw: 0,
    },
  },
  {
    id: "weekly-pro-mg", labelKo: "주간 프로 연재 (MG 계약)", labelEn: "Weekly Pro (MG Contract)",
    summaryKo: "회차당 MG + 계약 선인세 회수 시점 점검(추정)", summaryEn: "Per-episode MG & upfront advance recoupment check (estimate)",
    input: DEFAULT_PAYWALL_FUNNEL_INPUT,
  },
  {
    id: "hit-preview-5", labelKo: "상위권 5화 미리보기", labelEn: "Top-Tier 5-Ep Preview",
    summaryKo: "고전환 5화 유료 미리보기 RS 초과 수익 시나리오(추정)", summaryEn: "High-conversion 5-ep paywall RS surplus scenario (estimate)",
    input: {
      freeEpisodeReaders: 180000, freeEpisodeCount: 10, previewEpisodeCount: 5,
      initialPreviewConversionPct: 6.0, stepRetentionRatePct: 78, pricePerPreviewEpisodeKrw: 300,
      appStoreFeePct: 15, platformFeePct: 30, episodesPerMonth: 4, mgPerEpisodeKrw: 2_000_000, upfrontAdvanceKrw: 0,
    },
  },
];

export const DEFAULT_GOODS_UNIT_ECONOMICS_INPUT: GoodsUnitEconomicsInput = {
  goodsType: "acrylic-stand", sellingPriceKrw: 18000, unitManufacturingCostKrw: 4200,
  packagingAndShippingPerUnitKrw: 3200, fixedSetupCostKrw: 180000, moqUnits: 50,
  plannedOrderUnits: 120, expectedSellThroughPct: 85, channelFeePct: 8.8,
};

export const GOODS_PRESETS: readonly GoodsPresetSpec[] = [
  {
    id: "acrylic-stand", labelKo: "아크릴 스탠드", labelEn: "Acrylic Stand",
    hintKo: "소량 MOQ 50개 · 칼선/샘플 셋업비 포함 추정", hintEn: "MOQ 50 · includes die-cut & sample setup estimate",
    input: DEFAULT_GOODS_UNIT_ECONOMICS_INPUT,
  },
  {
    id: "photocard-set", labelKo: "포토카드 세트", labelEn: "Photocard Set",
    hintKo: "MOQ 100세트 · 경량 배송·고회전 굿즈 추정", hintEn: "MOQ 100 · low-weight shipping & high-turn goods estimate",
    input: {
      goodsType: "photocard-set", sellingPriceKrw: 9000, unitManufacturingCostKrw: 1650,
      packagingAndShippingPerUnitKrw: 2400, fixedSetupCostKrw: 120000, moqUnits: 100,
      plannedOrderUnits: 250, expectedSellThroughPct: 80, channelFeePct: 8.8,
    },
  },
  {
    id: "print-book", labelKo: "단행본", labelEn: "Print Volume",
    hintKo: "MOQ 300권 · 편집·조판·ISBN 고정비 반영 추정", hintEn: "MOQ 300 · includes layout & ISBN fixed setup estimate",
    input: {
      goodsType: "print-book", sellingPriceKrw: 19000, unitManufacturingCostKrw: 5400,
      packagingAndShippingPerUnitKrw: 3500, fixedSetupCostKrw: 950000, moqUnits: 300,
      plannedOrderUnits: 500, expectedSellThroughPct: 75, channelFeePct: 10.0,
    },
  },
];

export const DEFAULT_KOREAN_SETTLEMENT_INPUT: KoreanCreatorSettlementInput = {
  grossContractAmountKrw: 4_000_000,
  deductibleExpenseKrw: 880_000,
  vatContractMode: "vat-exclusive",
  nationalIncomeTaxRatePct: 3, localIncomeTaxRatePct: 0.3, vatRatePct: 10,
};

export const PRODUCTION_STAGE_CATALOG: readonly ProductionStageSpec[] = [
  {
    stageId: "conti", labelKo: "콘티", labelEn: "Storyboard",
    delegationSuitabilityScore: 15, delegationPriority: "low", defaultMinutesPerCut: 10, defaultEstimatedCostPerCutKrw: 6000,
    delegationRationaleKo: "연출·호흡·개그 타이밍의 핵심이므로 작가 직접 수행을 권장합니다.",
    delegationRationaleEn: "Core narrative pacing and directing; best kept with the lead author.",
  },
  {
    stageId: "lineart", labelKo: "선화", labelEn: "Lineart",
    delegationSuitabilityScore: 52, delegationPriority: "medium", defaultMinutesPerCut: 18, defaultEstimatedCostPerCutKrw: 7000,
    delegationRationaleKo: "캐릭터 작화 통일성을 지키려면 클린업·소품 선화 위주 부분 위임이 안전합니다.",
    delegationRationaleEn: "Delegate cleanup or prop inks selectively to preserve character consistency.",
  },
  {
    stageId: "coloring", labelKo: "채색", labelEn: "Coloring",
    delegationSuitabilityScore: 90, delegationPriority: "high", defaultMinutesPerCut: 14, defaultEstimatedCostPerCutKrw: 5000,
    delegationRationaleKo: "캐릭터 컬러 시트 기준 밑색·1차 명암 위임 시 마감 시간 단축 폭이 매우 큽니다.",
    delegationRationaleEn: "Flats and base shading follow color sheets cleanly for large hour savings.",
  },
  {
    stageId: "background", labelKo: "배경", labelEn: "Background",
    delegationSuitabilityScore: 95, delegationPriority: "high", defaultMinutesPerCut: 11, defaultEstimatedCostPerCutKrw: 4500,
    delegationRationaleKo: "3D 스케치업 배치·리터칭은 분업 인터페이스가 명확해 최우선 위임 후보입니다.",
    delegationRationaleEn: "3D placement and retouching have crisp handoff boundaries—top delegation target.",
  },
  {
    stageId: "lettering", labelKo: "식자", labelEn: "Lettering",
    delegationSuitabilityScore: 86, delegationPriority: "high", defaultMinutesPerCut: 5, defaultEstimatedCostPerCutKrw: 1500,
    delegationRationaleKo: "말풍선·대사·효과음 배치는 컷당 위임 단가 대비 막판 피로 절감 효과가 높습니다.",
    delegationRationaleEn: "Balloon placement and SFX lettering relieve late-week fatigue at low per-cut cost.",
  },
];

export const DEFAULT_STAGE_MINUTES_PER_CUT: StageMinutesMap = {
  conti: 10, lineart: 18, coloring: 14, background: 11, lettering: 5,
};

export const DEFAULT_WEEKLY_BURNOUT_INPUT: WeeklyBurnoutInput = {
  weeklyCutCount: 65, availableWorkHoursPerWeek: 45, consecutiveCrunchWeeks: 2, revisionBufferPct: 15,
  stageMinutesPerCut: DEFAULT_STAGE_MINUTES_PER_CUT, delegatedStages: [],
};

export const BURNOUT_SCENARIO_PRESETS: readonly BurnoutScenarioPreset[] = [
  {
    id: "biweekly-calm", labelKo: "여유 격주·단편 (35컷)", labelEn: "Calm Biweekly (35 Cuts)",
    summaryKo: "가용 시간 내 안정적 마감 유지 시나리오(추정)", summaryEn: "Sustainable pace within weekly capacity (estimate)",
    input: {
      weeklyCutCount: 35, availableWorkHoursPerWeek: 45, consecutiveCrunchWeeks: 0, revisionBufferPct: 12,
      stageMinutesPerCut: { conti: 9, lineart: 16, coloring: 12, background: 9, lettering: 4 }, delegatedStages: [],
    },
  },
  {
    id: "weekly-solo-tight", labelKo: "주간 단독 연재 (65컷)", labelEn: "Weekly Solo (65 Cuts)",
    summaryKo: "어시 없이 주 65컷 풀컬러 단독 마감 과부하 시나리오(추정)", summaryEn: "Solo 65-cut weekly full-color overload scenario (estimate)",
    input: DEFAULT_WEEKLY_BURNOUT_INPUT,
  },
  {
    id: "weekly-fullcolor-crunch", labelKo: "고밀도 액션·로판 (80컷)", labelEn: "High-Detail Crunch (80 Cuts)",
    summaryKo: "화려한 배경·채색 80컷 4주 연속 마감 위기 시나리오(추정)", summaryEn: "80-cut high-detail 4-week consecutive crunch scenario (estimate)",
    input: {
      weeklyCutCount: 80, availableWorkHoursPerWeek: 48, consecutiveCrunchWeeks: 4, revisionBufferPct: 18,
      stageMinutesPerCut: { conti: 10, lineart: 20, coloring: 16, background: 14, lettering: 5 }, delegatedStages: [],
    },
  },
];

function sanitizeNumber(value: number, fallback: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback));
}

function roundTo(value: number, digits: number): number {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function createEstimateProvenance(noticeKo: string, noticeEn: string): EstimateProvenance {
  return { dataSourceKind: "estimate", badgeLabelKo: "추정", badgeLabelEn: "Estimate", noticeKo, noticeEn };
}

/** 한국 원화 정수를 천 단위 쉼표 표기로 포맷한다. */
export function formatKrw(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `${safe.toLocaleString("ko-KR")}원`;
}

function evaluatePaywallCore(input: PaywallFunnelInput) {
  const appKeepRatio = 1 - input.appStoreFeePct / 100;
  const creatorSharePct = roundTo(100 - input.platformFeePct, 2);
  const netRealizationRatio = appKeepRatio * (creatorSharePct / 100);
  const netRealizationRatePct = roundTo(netRealizationRatio * 100, 2);
  const netCreatorPerUnlockKrw = input.pricePerPreviewEpisodeKrw * netRealizationRatio;

  const previewSteps: PaywallPreviewStep[] = [];
  let cumulativeGross = 0;
  let cumulativeCreatorRs = 0;
  let totalPaidUnlocksPerCycle = 0;
  let cascadeFactor = 0;
  const retentionRatio = input.stepRetentionRatePct / 100;

  for (let i = 0; i < input.previewEpisodeCount; i += 1) {
    const stepIndex = i + 1;
    const stepMultiplier = Math.pow(retentionRatio, i);
    cascadeFactor += stepMultiplier;
    const exactConversionPct = input.initialPreviewConversionPct * stepMultiplier;
    const conversionFromFreePct = roundTo(exactConversionPct, 2);
    const payingReaders = Math.round(input.freeEpisodeReaders * (exactConversionPct / 100));
    const stepGrossRevenueKrw = Math.round(payingReaders * input.pricePerPreviewEpisodeKrw);
    const stepCreatorRsKrw = Math.round(stepGrossRevenueKrw * netRealizationRatio);

    totalPaidUnlocksPerCycle += payingReaders;
    cumulativeGross += stepGrossRevenueKrw;
    cumulativeCreatorRs += stepCreatorRsKrw;

    previewSteps.push({
      stepIndex,
      episodeLabelKo: `유료 미리보기 ${stepIndex}화`,
      episodeLabelEn: `Paid Preview Ep. ${stepIndex}`,
      conversionFromFreePct,
      stepRetentionFromPrevPct: i === 0 ? 100 : roundTo(input.stepRetentionRatePct, 1),
      payingReaders,
      stepGrossRevenueKrw,
      stepCreatorRsKrw,
      cumulativeGrossRevenueKrw: cumulativeGross,
      cumulativeCreatorRsKrw: cumulativeCreatorRs,
    });
  }

  const step1PayingReaders = previewSteps[0]?.payingReaders ?? 0;
  const finalStepPayingReaders = previewSteps[previewSteps.length - 1]?.payingReaders ?? 0;
  const averagePaidEpisodesPerBuyer = step1PayingReaders > 0 ? roundTo(totalPaidUnlocksPerCycle / step1PayingReaders, 2) : 0;
  const effectiveArppuKrw = step1PayingReaders > 0 ? Math.round(cumulativeGross / step1PayingReaders) : 0;

  const grossRevenuePerEpisodeKrw = cumulativeGross;
  const appStoreFeePerEpisodeKrw = Math.round(grossRevenuePerEpisodeKrw * (input.appStoreFeePct / 100));
  const afterAppStorePerEpisodeKrw = grossRevenuePerEpisodeKrw - appStoreFeePerEpisodeKrw;
  const platformFeePerEpisodeKrw = Math.round(afterAppStorePerEpisodeKrw * (input.platformFeePct / 100));
  const creatorRsPerEpisodeKrw = Math.max(0, afterAppStorePerEpisodeKrw - platformFeePerEpisodeKrw);

  const monthlyGrossRevenueKrw = grossRevenuePerEpisodeKrw * input.episodesPerMonth;
  const monthlyAppStoreFeeKrw = appStoreFeePerEpisodeKrw * input.episodesPerMonth;
  const monthlyPlatformFeeKrw = platformFeePerEpisodeKrw * input.episodesPerMonth;
  const monthlyCreatorRsKrw = creatorRsPerEpisodeKrw * input.episodesPerMonth;
  const monthlyMgAdvanceKrw = input.mgPerEpisodeKrw * input.episodesPerMonth;
  const monthlyRsSurplusOverMgKrw = Math.max(0, monthlyCreatorRsKrw - monthlyMgAdvanceKrw);
  const monthlyMgShortfallKrw = Math.max(0, monthlyMgAdvanceKrw - monthlyCreatorRsKrw);
  const monthlyCashflowBeforeTaxKrw = Math.max(monthlyMgAdvanceKrw, monthlyCreatorRsKrw);
  const mgCoverageRatioPct = input.mgPerEpisodeKrw > 0 ? roundTo((creatorRsPerEpisodeKrw / input.mgPerEpisodeKrw) * 100, 1) : null;

  let mgRecoupmentStatus: MgRecoupmentStatus = "mg-deficit";
  let mgRecoupmentEpisodes: number | null = null;
  let mgRecoupmentMonths: number | null = null;

  if (input.mgPerEpisodeKrw === 0 && input.upfrontAdvanceKrw === 0) {
    mgRecoupmentStatus = "no-mg";
    mgRecoupmentEpisodes = 0;
    mgRecoupmentMonths = 0;
  } else if (input.mgPerEpisodeKrw === 0 && input.upfrontAdvanceKrw > 0) {
    if (creatorRsPerEpisodeKrw > 0) {
      mgRecoupmentStatus = "recouping-advance";
      mgRecoupmentEpisodes = Math.ceil(input.upfrontAdvanceKrw / creatorRsPerEpisodeKrw);
      mgRecoupmentMonths = roundTo(mgRecoupmentEpisodes / input.episodesPerMonth, 2);
    }
  } else {
    const surplusPerEpisode = creatorRsPerEpisodeKrw - input.mgPerEpisodeKrw;
    if (surplusPerEpisode >= 0 && input.upfrontAdvanceKrw === 0) {
      mgRecoupmentStatus = "surplus-immediate";
      mgRecoupmentEpisodes = 1;
      mgRecoupmentMonths = roundTo(1 / input.episodesPerMonth, 2);
    } else if (surplusPerEpisode > 0 && input.upfrontAdvanceKrw > 0) {
      mgRecoupmentStatus = "recouping-advance";
      mgRecoupmentEpisodes = Math.ceil(input.upfrontAdvanceKrw / surplusPerEpisode);
      mgRecoupmentMonths = roundTo(mgRecoupmentEpisodes / input.episodesPerMonth, 2);
    }
  }

  return {
    previewSteps, creatorSharePct, netRealizationRatePct, step1PayingReaders, finalStepPayingReaders,
    totalPaidUnlocksPerCycle, averagePaidEpisodesPerBuyer, effectiveArppuKrw,
    grossRevenuePerEpisodeKrw, appStoreFeePerEpisodeKrw, platformFeePerEpisodeKrw, creatorRsPerEpisodeKrw,
    monthlyGrossRevenueKrw, monthlyAppStoreFeeKrw, monthlyPlatformFeeKrw, monthlyCreatorRsKrw,
    monthlyMgAdvanceKrw, monthlyRsSurplusOverMgKrw, monthlyMgShortfallKrw, monthlyCashflowBeforeTaxKrw,
    mgCoverageRatioPct, mgRecoupmentStatus, mgRecoupmentEpisodes, mgRecoupmentMonths,
    cascadeFactor, netCreatorPerUnlockKrw,
  };
}

/** 무료 공개 회차 → 유료 미리보기(기본 5화) 전환 퍼널과 플랫폼 수수료·MG 회수 시점을 시뮬레이션한다. */
export function simulatePaywallFunnel(input: PaywallFunnelInput): PaywallFunnelResult {
  const sanitizedInput: PaywallFunnelInput = {
    freeEpisodeReaders: Math.round(sanitizeNumber(input.freeEpisodeReaders, 45000, 0, 10_000_000)),
    freeEpisodeCount: Math.round(sanitizeNumber(input.freeEpisodeCount, 10, 1, 200)),
    previewEpisodeCount: Math.round(sanitizeNumber(input.previewEpisodeCount, 5, 1, 20)),
    initialPreviewConversionPct: roundTo(sanitizeNumber(input.initialPreviewConversionPct, 4.5, 0, 100), 2),
    stepRetentionRatePct: roundTo(sanitizeNumber(input.stepRetentionRatePct, 74, 0, 100), 1),
    pricePerPreviewEpisodeKrw: Math.round(sanitizeNumber(input.pricePerPreviewEpisodeKrw, 200, 0, 50_000)),
    appStoreFeePct: roundTo(sanitizeNumber(input.appStoreFeePct, 15, 0, 50), 1),
    platformFeePct: roundTo(sanitizeNumber(input.platformFeePct, 30, 0, 90), 1),
    episodesPerMonth: Math.round(sanitizeNumber(input.episodesPerMonth, 4, 1, 30)),
    mgPerEpisodeKrw: Math.round(sanitizeNumber(input.mgPerEpisodeKrw, 0, 0, 100_000_000)),
    upfrontAdvanceKrw: Math.round(sanitizeNumber(input.upfrontAdvanceKrw, 0, 0, 500_000_000)),
  };

  const base = evaluatePaywallCore(sanitizedInput);
  const canSolveMg = sanitizedInput.mgPerEpisodeKrw > 0 && base.cascadeFactor > 0 && base.netCreatorPerUnlockKrw > 0;
  const requiredInitialConversionPctForMg =
    canSolveMg && sanitizedInput.freeEpisodeReaders > 0
      ? roundTo((sanitizedInput.mgPerEpisodeKrw / (sanitizedInput.freeEpisodeReaders * base.cascadeFactor * base.netCreatorPerUnlockKrw)) * 100, 2)
      : null;
  const requiredFreeReadersForMg =
    canSolveMg && sanitizedInput.initialPreviewConversionPct > 0
      ? Math.ceil(sanitizedInput.mgPerEpisodeKrw / ((sanitizedInput.initialPreviewConversionPct / 100) * base.cascadeFactor * base.netCreatorPerUnlockKrw))
      : null;

  const bandSpecs: readonly { readonly id: PaywallSensitivityBandId; readonly labelKo: string; readonly labelEn: string; readonly mult: number }[] = [
    { id: "conservative", labelKo: "보수 추정 (0.7×)", labelEn: "Conservative (0.7×)", mult: 0.7 },
    { id: "base", labelKo: "기준 추정 (1.0×)", labelEn: "Base Estimate (1.0×)", mult: 1.0 },
    { id: "optimistic", labelKo: "낙관 추정 (1.35×)", labelEn: "Optimistic (1.35×)", mult: 1.35 },
  ];

  const sensitivityBands: PaywallSensitivityBand[] = bandSpecs.map((spec) => {
    const core =
      spec.mult === 1
        ? base
        : evaluatePaywallCore({
            ...sanitizedInput,
            initialPreviewConversionPct: Math.min(100, roundTo(sanitizedInput.initialPreviewConversionPct * spec.mult, 2)),
          });
    return {
      bandId: spec.id, labelKo: spec.labelKo, labelEn: spec.labelEn, conversionMultiplier: spec.mult,
      monthlyGrossRevenueKrw: core.monthlyGrossRevenueKrw, monthlyCreatorRsKrw: core.monthlyCreatorRsKrw,
      monthlyCashflowBeforeTaxKrw: core.monthlyCashflowBeforeTaxKrw,
      mgRecoupmentStatus: core.mgRecoupmentStatus, mgRecoupmentMonths: core.mgRecoupmentMonths,
    };
  });

  return {
    dataSourceKind: "estimate",
    provenance: createEstimateProvenance(
      "입력 시나리오 기반 추정치입니다. 실제 플랫폼 정산은 결제 수단 비중·프로모션·계약서에 따라 달라집니다.",
      "Scenario-based estimate from your inputs. Actual platform payouts depend on billing mix, promos, and contract terms.",
    ),
    sanitizedInput,
    previewSteps: base.previewSteps, creatorSharePct: base.creatorSharePct, netRealizationRatePct: base.netRealizationRatePct,
    step1PayingReaders: base.step1PayingReaders, finalStepPayingReaders: base.finalStepPayingReaders,
    totalPaidUnlocksPerCycle: base.totalPaidUnlocksPerCycle, averagePaidEpisodesPerBuyer: base.averagePaidEpisodesPerBuyer,
    effectiveArppuKrw: base.effectiveArppuKrw,
    grossRevenuePerEpisodeKrw: base.grossRevenuePerEpisodeKrw, appStoreFeePerEpisodeKrw: base.appStoreFeePerEpisodeKrw,
    platformFeePerEpisodeKrw: base.platformFeePerEpisodeKrw, creatorRsPerEpisodeKrw: base.creatorRsPerEpisodeKrw,
    monthlyGrossRevenueKrw: base.monthlyGrossRevenueKrw, monthlyAppStoreFeeKrw: base.monthlyAppStoreFeeKrw,
    monthlyPlatformFeeKrw: base.monthlyPlatformFeeKrw, monthlyCreatorRsKrw: base.monthlyCreatorRsKrw,
    monthlyMgAdvanceKrw: base.monthlyMgAdvanceKrw, monthlyRsSurplusOverMgKrw: base.monthlyRsSurplusOverMgKrw,
    monthlyMgShortfallKrw: base.monthlyMgShortfallKrw, monthlyCashflowBeforeTaxKrw: base.monthlyCashflowBeforeTaxKrw,
    mgCoverageRatioPct: base.mgCoverageRatioPct, mgRecoupmentStatus: base.mgRecoupmentStatus,
    mgRecoupmentEpisodes: base.mgRecoupmentEpisodes, mgRecoupmentMonths: base.mgRecoupmentMonths,
    requiredInitialConversionPctForMg, requiredFreeReadersForMg, sensitivityBands,
    formulaNotesKo: [
      `미리보기 ${sanitizedInput.previewEpisodeCount}화 누적 전환: 1화 ${sanitizedInput.initialPreviewConversionPct}% × 화차 유지율 ${sanitizedInput.stepRetentionRatePct}%^(k-1)`,
      `작가 순배분율(추정): (1 - 앱수수료 ${sanitizedInput.appStoreFeePct}%) × (1 - 플랫폼수수료 ${sanitizedInput.platformFeePct}%) = ${base.netRealizationRatePct}%`,
      "MG 회수 판정: 회차당 RS 정산액이 회차당 MG를 넘을 때 초과분으로 추가 선인세를 회수합니다.",
    ],
  };
}

/** 웹툰 굿즈(아크릴 스탠드·포토카드·단행본) MOQ 선발주 기준 손익분기(BEP)와 순이익률을 계산한다. */
export function calculateGoodsUnitEconomics(input: GoodsUnitEconomicsInput): GoodsUnitEconomicsResult {
  const goodsType: GoodsItemType =
    input.goodsType === "photocard-set" || input.goodsType === "print-book" ? input.goodsType : "acrylic-stand";
  const sanitizedInput: GoodsUnitEconomicsInput = {
    goodsType,
    sellingPriceKrw: Math.round(sanitizeNumber(input.sellingPriceKrw, 18000, 0, 5_000_000)),
    unitManufacturingCostKrw: Math.round(sanitizeNumber(input.unitManufacturingCostKrw, 4200, 0, 5_000_000)),
    packagingAndShippingPerUnitKrw: Math.round(sanitizeNumber(input.packagingAndShippingPerUnitKrw, 3200, 0, 500_000)),
    fixedSetupCostKrw: Math.round(sanitizeNumber(input.fixedSetupCostKrw, 180000, 0, 100_000_000)),
    moqUnits: Math.round(sanitizeNumber(input.moqUnits, 50, 1, 1_000_000)),
    plannedOrderUnits: Math.round(sanitizeNumber(input.plannedOrderUnits, 100, 1, 1_000_000)),
    expectedSellThroughPct: roundTo(sanitizeNumber(input.expectedSellThroughPct, 85, 0, 100), 1),
    channelFeePct: roundTo(sanitizeNumber(input.channelFeePct, 8.8, 0, 60), 2),
  };

  const belowMoqWarning = sanitizedInput.plannedOrderUnits < sanitizedInput.moqUnits;
  const effectiveOrderUnits = Math.max(sanitizedInput.moqUnits, sanitizedInput.plannedOrderUnits);
  const unitChannelFeeKrw = Math.round(sanitizedInput.sellingPriceKrw * (sanitizedInput.channelFeePct / 100));
  const unitVariableCostKrw = sanitizedInput.unitManufacturingCostKrw + sanitizedInput.packagingAndShippingPerUnitKrw + unitChannelFeeKrw;
  const contributionMarginPerUnitKrw = sanitizedInput.sellingPriceKrw - unitVariableCostKrw;
  const contributionMarginPct = sanitizedInput.sellingPriceKrw > 0 ? roundTo((contributionMarginPerUnitKrw / sanitizedInput.sellingPriceKrw) * 100, 1) : 0;
  const netCashPerSoldUnitKrw = sanitizedInput.sellingPriceKrw - sanitizedInput.packagingAndShippingPerUnitKrw - unitChannelFeeKrw;
  const isUnitMarginPositive = contributionMarginPerUnitKrw > 0;

  const totalFixedCostKrw = sanitizedInput.fixedSetupCostKrw;
  const totalManufacturingCostKrw = effectiveOrderUnits * sanitizedInput.unitManufacturingCostKrw;
  const totalUpfrontManufacturingOutlayKrw = totalFixedCostKrw + totalManufacturingCostKrw;
  const contributionBreakEvenUnits = contributionMarginPerUnitKrw > 0 ? Math.ceil(totalFixedCostKrw / contributionMarginPerUnitKrw) : null;
  const breakEvenUnits = isUnitMarginPositive && netCashPerSoldUnitKrw > 0 ? Math.ceil(totalUpfrontManufacturingOutlayKrw / netCashPerSoldUnitKrw) : null;
  const breakEvenSellThroughPct = breakEvenUnits !== null && effectiveOrderUnits > 0 ? roundTo((breakEvenUnits / effectiveOrderUnits) * 100, 1) : null;
  const moqAchievable = breakEvenUnits !== null && breakEvenUnits <= effectiveOrderUnits;

  const expectedSoldUnits = Math.round(effectiveOrderUnits * (sanitizedInput.expectedSellThroughPct / 100));
  const unsoldInventoryUnits = Math.max(0, effectiveOrderUnits - expectedSoldUnits);
  const grossRevenueKrw = expectedSoldUnits * sanitizedInput.sellingPriceKrw;
  const totalChannelFeeKrw = expectedSoldUnits * unitChannelFeeKrw;
  const totalShippingCostKrw = expectedSoldUnits * sanitizedInput.packagingAndShippingPerUnitKrw;
  const totalCostKrw = totalUpfrontManufacturingOutlayKrw + totalShippingCostKrw + totalChannelFeeKrw;
  const netProfitKrw = grossRevenueKrw - totalCostKrw;
  const netProfitMarginPct = grossRevenueKrw > 0 ? roundTo((netProfitKrw / grossRevenueKrw) * 100, 1) : 0;
  const roiPct = totalUpfrontManufacturingOutlayKrw > 0 ? roundTo((netProfitKrw / totalUpfrontManufacturingOutlayKrw) * 100, 1) : 0;

  return {
    dataSourceKind: "estimate",
    provenance: createEstimateProvenance(
      "입력 단가·MOQ·판매율 가정 기반 추정치입니다. 불량 예비분·반품·보관비는 발주처 견적으로 보정하세요.",
      "Scenario estimate from unit cost, MOQ, and sell-through inputs. Adjust with actual vendor quotes and defect buffers.",
    ),
    sanitizedInput, effectiveOrderUnits, belowMoqWarning, unitChannelFeeKrw, unitVariableCostKrw,
    contributionMarginPerUnitKrw, contributionMarginPct, netCashPerSoldUnitKrw, isUnitMarginPositive,
    totalFixedCostKrw, totalManufacturingCostKrw, totalUpfrontManufacturingOutlayKrw,
    contributionBreakEvenUnits, breakEvenUnits, breakEvenSellThroughPct, moqAchievable,
    expectedSoldUnits, unsoldInventoryUnits, grossRevenueKrw, totalChannelFeeKrw,
    totalShippingCostKrw, totalCostKrw, netProfitKrw, netProfitMarginPct, roiPct,
  };
}

/** 입력 세율과 전액 공제 경비 가정으로 두 현금흐름을 비교한다. 기본값은 법적 적용 여부를 보증하지 않는다. */
export function calculateKoreanCreatorSettlement(input: KoreanCreatorSettlementInput): KoreanCreatorSettlementResult {
  const vatContractMode: VatContractMode = input.vatContractMode === "vat-inclusive" ? "vat-inclusive" : "vat-exclusive";
  const nationalIncomeTaxRatePct = sanitizeNumber(input.nationalIncomeTaxRatePct ?? 3, 3, 0, 100);
  const localIncomeTaxRatePct = sanitizeNumber(input.localIncomeTaxRatePct ?? 0.3, 0.3, 0, 100 - nationalIncomeTaxRatePct);
  const vatRatePct = sanitizeNumber(input.vatRatePct ?? 10, 10, 0, 100);
  const withholdingRatePct = roundTo(nationalIncomeTaxRatePct + localIncomeTaxRatePct, 2);
  const sanitizedInput: KoreanCreatorSettlementInput = {
    grossContractAmountKrw: Math.round(sanitizeNumber(input.grossContractAmountKrw, 4_000_000, 0, 10_000_000_000)),
    deductibleExpenseKrw: Math.round(sanitizeNumber(input.deductibleExpenseKrw, 0, 0, 10_000_000_000)),
    vatContractMode, nationalIncomeTaxRatePct, localIncomeTaxRatePct, vatRatePct,
  };

  const nationalIncomeTaxKrw = Math.round(sanitizedInput.grossContractAmountKrw * nationalIncomeTaxRatePct / 100);
  const localIncomeTaxKrw = Math.min(Math.round(sanitizedInput.grossContractAmountKrw * localIncomeTaxRatePct / 100), sanitizedInput.grossContractAmountKrw - nationalIncomeTaxKrw);
  const totalWithholdingTaxKrw = nationalIncomeTaxKrw + localIncomeTaxKrw;
  const immediateNetPayoutKrw = sanitizedInput.grossContractAmountKrw - totalWithholdingTaxKrw;
  const freelancerNetAfterExpensesKrw = immediateNetPayoutKrw - sanitizedInput.deductibleExpenseKrw;

  const supplyAmountKrw = vatContractMode === "vat-exclusive" ? sanitizedInput.grossContractAmountKrw : Math.round(sanitizedInput.grossContractAmountKrw / (1 + vatRatePct / 100));
  const outputVatKrw = vatContractMode === "vat-exclusive" ? Math.round(supplyAmountKrw * vatRatePct / 100) : sanitizedInput.grossContractAmountKrw - supplyAmountKrw;
  const invoiceTotalKrw = supplyAmountKrw + outputVatKrw;
  const inputVatCreditKrw = Math.round(sanitizedInput.deductibleExpenseKrw * vatRatePct / (100 + vatRatePct));
  const netVatPayableKrw = Math.max(0, outputVatKrw - inputVatCreditKrw);
  const vatRefundKrw = Math.max(0, inputVatCreditKrw - outputVatKrw);
  const netAfterVatSettlementKrw = invoiceTotalKrw - netVatPayableKrw + vatRefundKrw;
  const netAfterVatAndExpensesKrw = netAfterVatSettlementKrw - sanitizedInput.deductibleExpenseKrw;

  const immediateCashDiffKrw = invoiceTotalKrw - immediateNetPayoutKrw;
  const postVatNetAfterExpensesDiffKrw = netAfterVatAndExpensesKrw - freelancerNetAfterExpensesKrw;

  let favoredCashflowStructure: FavoredCashflowStructure = "comparable";
  let summaryKo = "두 정산 방식의 부가세·경비 반영 후 현금흐름 차이가 1만원 이내로 유사합니다(추정).";
  let summaryEn = "Post-VAT and post-expense cashflow is within 10,000 KRW between both structures (estimate).";

  if (postVatNetAfterExpensesDiffKrw > 10_000) {
    favoredCashflowStructure = "business-vat-10";
    summaryKo = `부가세 정산·경비 차감 후 부가세 ${vatRatePct}% 가정이 원천징수 ${withholdingRatePct}% 가정 대비 ${formatKrw(postVatNetAfterExpensesDiffKrw)} 유리합니다(추정). 납부 부가세 ${formatKrw(netVatPayableKrw)}는 별도 유보하세요.`;
    summaryEn = `After VAT settlement and expenses, Assumed VAT ${vatRatePct}% retains ${formatKrw(postVatNetAfterExpensesDiffKrw)} more than assumed withholding ${withholdingRatePct}% (estimate). Reserve ${formatKrw(netVatPayableKrw)} for VAT filing.`;
  } else if (postVatNetAfterExpensesDiffKrw < -10_000) {
    favoredCashflowStructure = "freelancer-3.3";
    summaryKo = `부가세 포함 총액 계약에서는 원천징수 ${withholdingRatePct}% 가정의 즉시 현금이 사업자 부가세 차감 후보다 ${formatKrw(Math.abs(postVatNetAfterExpensesDiffKrw))} 높습니다(추정). 부가세 별도 조건 협상을 검토하세요.`;
    summaryEn = `Under a VAT-inclusive cap, Assumed withholding ${withholdingRatePct}% retains ${formatKrw(Math.abs(postVatNetAfterExpensesDiffKrw))} more post-VAT (estimate). Consider negotiating VAT-exclusive billing.`;
  }

  return {
    dataSourceKind: "estimate",
    provenance: createEstimateProvenance(
      "입력 세율·경비 전액 공제 가정에 따른 현금흐름 예제입니다. 기본값은 현행 세법이나 적용 자격을 확인한 값이 아닙니다. 실제 신고는 별도 확인하세요.",
      "Cashflow example from assumed rates and fully eligible expenses. Defaults do not verify current law or eligibility; confirm actual filings separately.",
    ),
    sanitizedInput,
    freelancer: {
      withholdingRatePct, nationalIncomeTaxRatePct, localIncomeTaxRatePct,
      grossAmountKrw: sanitizedInput.grossContractAmountKrw, nationalIncomeTaxKrw, localIncomeTaxKrw,
      totalWithholdingTaxKrw, immediateNetPayoutKrw, netAfterExpensesKrw: freelancerNetAfterExpensesKrw,
    },
    businessVat: {
      vatRatePct, vatContractMode, supplyAmountKrw, outputVatKrw, invoiceTotalKrw,
      inputVatCreditKrw, netVatPayableKrw, vatRefundKrw,
      immediateCashInflowKrw: invoiceTotalKrw, netAfterVatSettlementKrw, netAfterVatAndExpensesKrw,
    },
    comparison: {
      immediateCashDiffKrw, postVatNetAfterExpensesDiffKrw, vatSetAsideReserveKrw: netVatPayableKrw,
      favoredCashflowStructure, summaryKo, summaryEn,
      taxDisclaimerKo: "원천징수와 부가세의 단순 현금흐름 비교입니다. 소득세 확정액·면세·공제 자격·환급 시기는 계산하지 않습니다.",
      taxDisclaimerEn: "Compares assumed withholding and VAT cashflows only; final income tax, exemptions, credit eligibility and refund timing are not calculated.",
    },
  };
}

function computeBurnoutScore(authorHours: number, availableHours: number, consecutiveCrunchWeeks: number): number {
  const utilization = availableHours > 0 ? authorHours / availableHours : 2.5;
  const loadScore =
    utilization <= 0.75
      ? (utilization / 0.75) * 24
      : utilization <= 1.0
        ? 24 + ((utilization - 0.75) / 0.25) * 20
        : 44 + Math.min(28, (utilization - 1.0) * 42);
  const absoluteHoursScore = Math.min(18, Math.max(0, authorHours - 40) * 0.6);
  const crunchScore = Math.min(20, consecutiveCrunchWeeks * 3.5 * (utilization >= 0.85 || authorHours > 40 ? 1 : 0.35));
  return Math.round(Math.min(100, Math.max(0, loadScore + absoluteHoursScore + crunchScore)));
}

function classifyBurnoutLevel(score: number): BurnoutRiskLevel {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  return score >= 35 ? "caution" : "safe";
}

/** 주간 컷 수 × 공정별 소요시간 vs 가용 시간으로 번아웃 위험도(0~100)와 어시스트 위임 추천 공정을 예측한다. */
export function forecastWeeklyBurnoutRisk(input: WeeklyBurnoutInput): WeeklyBurnoutForecastResult {
  const weeklyCutCount = Math.round(sanitizeNumber(input.weeklyCutCount, 65, 1, 200));
  const availableWorkHoursPerWeek = roundTo(sanitizeNumber(input.availableWorkHoursPerWeek, 45, 5, 112), 1);
  const consecutiveCrunchWeeks = Math.round(sanitizeNumber(input.consecutiveCrunchWeeks, 0, 0, 52));
  const revisionBufferPct = roundTo(sanitizeNumber(input.revisionBufferPct, 15, 0, 50), 1);
  const bufferFactor = 1 + revisionBufferPct / 100;

  const validStageIds = new Set<ProductionStageId>(PRODUCTION_STAGE_CATALOG.map((item) => item.stageId));
  const delegatedSet = new Set<ProductionStageId>(
    (input.delegatedStages ?? []).filter((stageId): stageId is ProductionStageId => validStageIds.has(stageId)),
  );
  const sanitizedStageMinutes: Record<ProductionStageId, number> = {
    conti: roundTo(sanitizeNumber(input.stageMinutesPerCut.conti, DEFAULT_STAGE_MINUTES_PER_CUT.conti, 0, 180), 1),
    lineart: roundTo(sanitizeNumber(input.stageMinutesPerCut.lineart, DEFAULT_STAGE_MINUTES_PER_CUT.lineart, 0, 180), 1),
    coloring: roundTo(sanitizeNumber(input.stageMinutesPerCut.coloring, DEFAULT_STAGE_MINUTES_PER_CUT.coloring, 0, 180), 1),
    background: roundTo(sanitizeNumber(input.stageMinutesPerCut.background, DEFAULT_STAGE_MINUTES_PER_CUT.background, 0, 180), 1),
    lettering: roundTo(sanitizeNumber(input.stageMinutesPerCut.lettering, DEFAULT_STAGE_MINUTES_PER_CUT.lettering, 0, 180), 1),
  };

  const rawTotalMinutesPerCut = PRODUCTION_STAGE_CATALOG.reduce((sum, spec) => sum + sanitizedStageMinutes[spec.stageId], 0);
  const exactRawProductionHours = (weeklyCutCount * rawTotalMinutesPerCut) / 60;
  const rawProductionHours = roundTo(exactRawProductionHours, 1);
  const totalRequiredHours = roundTo(exactRawProductionHours * bufferFactor, 1);
  const revisionBufferHours = roundTo(totalRequiredHours - rawProductionHours, 1);

  const stages: StageWorkloadBreakdown[] = PRODUCTION_STAGE_CATALOG.map((spec) => {
    const minutesPerCut = sanitizedStageMinutes[spec.stageId];
    const totalHours = roundTo((weeklyCutCount * minutesPerCut) / 60, 1);
    const totalHoursWithBuffer = roundTo(totalHours * bufferFactor, 1);
    const unitCost = sanitizeNumber(input.assistantCostPerCutByStageKrw?.[spec.stageId] ?? spec.defaultEstimatedCostPerCutKrw, spec.defaultEstimatedCostPerCutKrw, 0, 500_000);
    return {
      stageId: spec.stageId, labelKo: spec.labelKo, labelEn: spec.labelEn,
      minutesPerCut, totalHours, totalHoursWithBuffer,
      sharePct: rawTotalMinutesPerCut > 0 ? roundTo((minutesPerCut / rawTotalMinutesPerCut) * 100, 1) : 0,
      isDelegated: delegatedSet.has(spec.stageId),
      delegationSuitabilityScore: spec.delegationSuitabilityScore, delegationPriority: spec.delegationPriority,
      estimatedWeeklyOutsourcingKrw: Math.round(weeklyCutCount * unitCost),
      delegationRationaleKo: spec.delegationRationaleKo, delegationRationaleEn: spec.delegationRationaleEn,
    };
  });

  const delegatedHours = roundTo(stages.reduce((sum, stage) => sum + (stage.isDelegated ? stage.totalHoursWithBuffer : 0), 0), 1);
  const remainingAuthorHours = roundTo(Math.max(0, totalRequiredHours - delegatedHours), 1);
  const utilizationPct = availableWorkHoursPerWeek > 0 ? roundTo((remainingAuthorHours / availableWorkHoursPerWeek) * 100, 1) : 0;
  const overtimeHours = roundTo(Math.max(0, remainingAuthorHours - availableWorkHoursPerWeek), 1);

  const burnoutScoreBeforeDelegation = computeBurnoutScore(totalRequiredHours, availableWorkHoursPerWeek, consecutiveCrunchWeeks);
  const burnoutScore = computeBurnoutScore(remainingAuthorHours, availableWorkHoursPerWeek, consecutiveCrunchWeeks);
  const burnoutReliefPoints = Math.max(0, burnoutScoreBeforeDelegation - burnoutScore);
  const burnoutLevel = classifyBurnoutLevel(burnoutScore);

  const effectiveAuthorMinPerCut = stages.reduce((sum, stage) => sum + (stage.isDelegated ? 0 : stage.minutesPerCut), 0) * bufferFactor;
  const sustainableCutCapacity =
    effectiveAuthorMinPerCut > 0 ? Math.max(1, Math.floor((availableWorkHoursPerWeek * 0.9 * 60) / effectiveAuthorMinPerCut)) : weeklyCutCount;
  const weeklyDelegationBudgetKrw = stages.reduce((sum, stage) => sum + (stage.isDelegated ? stage.estimatedWeeklyOutsourcingKrw : 0), 0);

  const recommendedDelegations: DelegationRecommendation[] = [];
  if (burnoutScore >= 35 || overtimeHours > 0) {
    const candidates = stages
      .filter((stage) => !stage.isDelegated && stage.totalHoursWithBuffer > 0 && stage.delegationSuitabilityScore >= 50)
      .sort((a, b) => b.delegationSuitabilityScore * b.totalHoursWithBuffer - a.delegationSuitabilityScore * a.totalHoursWithBuffer);

    let simulatedAuthorHours = remainingAuthorHours;
    let simulatedScore = burnoutScore;
    for (const stage of candidates) {
      if (simulatedAuthorHours <= availableWorkHoursPerWeek * 0.92 && simulatedScore < 35) break;
      simulatedAuthorHours = roundTo(Math.max(0, simulatedAuthorHours - stage.totalHoursWithBuffer), 1);
      simulatedScore = computeBurnoutScore(simulatedAuthorHours, availableWorkHoursPerWeek, consecutiveCrunchWeeks);
      recommendedDelegations.push({
        stageId: stage.stageId, labelKo: stage.labelKo, labelEn: stage.labelEn, priority: stage.delegationPriority,
        hoursSaved: stage.totalHoursWithBuffer, projectedBurnoutScoreAfter: simulatedScore,
        estimatedWeeklyCostKrw: stage.estimatedWeeklyOutsourcingKrw,
        reasonKo: stage.delegationRationaleKo, reasonEn: stage.delegationRationaleEn,
      });
      if (recommendedDelegations.length >= 4) break;
    }
  }

  return {
    dataSourceKind: "estimate",
    provenance: createEstimateProvenance(
      "입력 컷 수·공정별 분당 소요시간·가용 시간 기준 추정치입니다. 의학적 진단이 아닌 작업 부하 관리 지표입니다.",
      "Workload planning estimate from your cut count, per-stage minutes, and available hours—not a medical diagnosis.",
    ),
    sanitizedInput: {
      weeklyCutCount, availableWorkHoursPerWeek, consecutiveCrunchWeeks, revisionBufferPct,
      stageMinutesPerCut: sanitizedStageMinutes, delegatedStages: Array.from(delegatedSet),
    },
    stages, rawProductionHours, revisionBufferHours, totalRequiredHours, delegatedHours, remainingAuthorHours,
    utilizationPct, overtimeHours, burnoutScore, burnoutScoreBeforeDelegation, burnoutReliefPoints,
    burnoutLevel, sustainableCutCapacity, weeklyDelegationBudgetKrw, recommendedDelegations,
  };
}
