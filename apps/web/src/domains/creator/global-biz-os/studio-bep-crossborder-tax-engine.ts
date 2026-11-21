/**
 * 스튜디오 제작 원가 · 회차별 손익분기(BEP) 시뮬레이터 및
 * 글로벌 크로스보더 다통화 정산 · 국가별 원천징수 세무 계산 엔진.
 *
 * 100% 결정론적 · 무과금(₩0) 순수 계산 모듈이며 외부 API 호출이나 난수를 사용하지 않는다.
 */

export type StudioProcessPricingMode = "per-cut" | "per-episode";

export interface StudioProcessCostItem {
  readonly id: string;
  readonly labelKo: string;
  readonly pricingMode: StudioProcessPricingMode;
  readonly unitCostKrw: number;
  readonly headcount: number;
}

export interface StudioBepSimulationInput {
  readonly seriesTitle: string;
  readonly plannedEpisodes: number;
  readonly cutsPerEpisode: number;
  readonly initialSetupCostKrw: number;
  readonly fixedOverheadPerEpisodeKrw: number;
  readonly processCosts: readonly StudioProcessCostItem[];
  readonly platformMgPerEpisodeKrw: number;
  readonly platformRsRatePercent: number;
  readonly mgRecoupmentEnabled: boolean;
  readonly avgReadersPerEpisode: number;
  readonly paidConversionRatePercent: number;
  readonly arpuPerEpisodeKrw: number;
}

export interface StudioProcessCostBreakdown {
  readonly id: string;
  readonly labelKo: string;
  readonly pricingMode: StudioProcessPricingMode;
  readonly episodeCostKrw: number;
  readonly sharePercent: number;
}

export interface StudioEpisodeFinancialPoint {
  readonly episode: number;
  readonly episodeCostKrw: number;
  readonly episodeGrossRevenueKrw: number;
  readonly episodeStudioRevenueKrw: number;
  readonly cumulativeCostKrw: number;
  readonly cumulativeMgKrw: number;
  readonly cumulativeEarnedRsKrw: number;
  readonly cumulativeStudioRevenueKrw: number;
  readonly cumulativeNetProfitKrw: number;
  readonly cumulativeRecoveryRatePercent: number;
  readonly mgRecouped: boolean;
}

export type MgRecoupmentStatus = "recouped" | "unrecouped" | "no-mg";

export interface StudioBepSimulationResult {
  readonly seriesTitle: string;
  readonly plannedEpisodes: number;
  readonly cutsPerEpisode: number;
  readonly processBreakdown: readonly StudioProcessCostBreakdown[];
  readonly processTotalPerEpisodeKrw: number;
  readonly costPerEpisodeKrw: number;
  readonly costPerCutKrw: number;
  readonly paidReadersPerEpisode: number;
  readonly grossRevenuePerEpisodeKrw: number;
  readonly studioRsPerEpisodeKrw: number;
  readonly effectiveStudioRevenuePerEpisodeKrw: number;
  readonly totalCostKrw: number;
  readonly totalStudioRevenueKrw: number;
  readonly totalNetProfitKrw: number;
  readonly cumulativeRecoveryRatePercent: number;
  readonly expectedNetMarginPercent: number;
  readonly bepEpisode: number | null;
  readonly exactBepEpisode: number | null;
  readonly mgRecoupmentStatus: MgRecoupmentStatus;
  readonly mgRecoupmentRatePercent: number;
  readonly episodeSchedule: readonly StudioEpisodeFinancialPoint[];
  readonly diagnosisKo: string;
}

export interface StudioBepPreset {
  readonly id: string;
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly input: StudioBepSimulationInput;
}

export type TaxJurisdictionCode = "KR" | "US" | "JP" | "VN" | "TH" | "ID" | "PH";

export type SettlementCurrencyCode = "KRW" | "USD" | "JPY" | "VND" | "THB" | "IDR" | "PHP";

export interface TaxJurisdictionRule {
  readonly code: TaxJurisdictionCode;
  readonly countryKo: string;
  readonly defaultCurrency: SettlementCurrencyCode;
  readonly treatyWithholdingRatePercent: number;
  readonly statutoryWithholdingRatePercent: number;
  readonly basisKo: string;
  readonly requiredDocumentKo: string;
}

export interface CurrencySpec {
  readonly code: SettlementCurrencyCode;
  readonly symbol: string;
  readonly labelKo: string;
  readonly decimals: number;
  readonly referenceRateToKrw: number;
}

export interface CrossBorderRevenueLineInput {
  readonly id: string;
  readonly platformLabel: string;
  readonly jurisdiction: TaxJurisdictionCode;
  readonly sourceCurrency: SettlementCurrencyCode;
  readonly grossAmountSource: number;
  readonly treatyDocumentSubmitted: boolean;
}

export interface CrossBorderSettlementInput {
  readonly settlementPeriod: string;
  readonly studioName: string;
  readonly payoutCurrency: SettlementCurrencyCode;
  readonly transferFeeRatePercent: number;
  readonly customFxToKrw?: Partial<Record<SettlementCurrencyCode, number>>;
  readonly lines: readonly CrossBorderRevenueLineInput[];
}

export interface CrossBorderSettlementLineResult {
  readonly id: string;
  readonly platformLabel: string;
  readonly jurisdiction: TaxJurisdictionCode;
  readonly countryKo: string;
  readonly sourceCurrency: SettlementCurrencyCode;
  readonly grossAmountSource: number;
  readonly fxRateToKrw: number;
  readonly grossKrw: number;
  readonly treatyDocumentSubmitted: boolean;
  readonly withholdingRatePercent: number;
  readonly withholdingTaxSource: number;
  readonly withholdingTaxKrw: number;
  readonly transferFeeKrw: number;
  readonly netKrw: number;
  readonly netInPayoutCurrency: number;
  readonly foreignTaxCreditEligibleKrw: number;
  readonly taxBasisKo: string;
}

export interface CrossBorderSettlementStatement {
  readonly settlementPeriod: string;
  readonly studioName: string;
  readonly payoutCurrency: SettlementCurrencyCode;
  readonly payoutFxToKrw: number;
  readonly transferFeeRatePercent: number;
  readonly lines: readonly CrossBorderSettlementLineResult[];
  readonly totalGrossKrw: number;
  readonly totalWithholdingTaxKrw: number;
  readonly totalTransferFeeKrw: number;
  readonly totalNetKrw: number;
  readonly totalNetInPayoutCurrency: number;
  readonly effectiveWithholdingRatePercent: number;
  readonly totalForeignTaxCreditEligibleKrw: number;
  readonly legalNoticeKo: string;
}

export const TAX_LEGAL_REVIEW_NOTICE_KO =
  "세무 법적 최종 확인 안내: 본 정산 계산서는 국가별 표준 원천징수 세율과 참고 환율 기준의 시뮬레이션 결과입니다. 실제 원천징수 신고, 조세조약 적용, 외국납부세액공제 및 부가가치세 처리는 반드시 담당 세무사 또는 관할 세무기관의 최종 법적 확인을 거쳐 확정하세요.";

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export const DEFAULT_STUDIO_BEP_INPUT: StudioBepSimulationInput = {
  seriesTitle: "밤의 우편배달부 시즌 1",
  plannedEpisodes: 50,
  cutsPerEpisode: 70,
  initialSetupCostKrw: 10_000_000,
  fixedOverheadPerEpisodeKrw: 350_000,
  processCosts: [
    { id: "story", labelKo: "각색·콘티", pricingMode: "per-episode", unitCostKrw: 650_000, headcount: 1 },
    { id: "lineart", labelKo: "선화 외주", pricingMode: "per-cut", unitCostKrw: 14_000, headcount: 1 },
    { id: "coloring", labelKo: "채색·명암", pricingMode: "per-cut", unitCostKrw: 12_000, headcount: 1 },
    { id: "background3d", labelKo: "3D 배경·보정", pricingMode: "per-episode", unitCostKrw: 420_000, headcount: 1 },
    { id: "postfx", labelKo: "식자·후보정", pricingMode: "per-episode", unitCostKrw: 240_000, headcount: 1 },
    { id: "assistant", labelKo: "어시스턴트 인건비", pricingMode: "per-episode", unitCostKrw: 520_000, headcount: 1 },
  ],
  platformMgPerEpisodeKrw: 3_200_000,
  platformRsRatePercent: 50,
  mgRecoupmentEnabled: true,
  avgReadersPerEpisode: 82_000,
  paidConversionRatePercent: 8.5,
  arpuPerEpisodeKrw: 1_350,
};

export const STUDIO_BEP_PRESETS: readonly StudioBepPreset[] = [
  {
    id: "mid-studio-6",
    labelKo: "6인 중형 스튜디오",
    summaryKo: "70컷 · MG 320만 · RS 50%",
    input: DEFAULT_STUDIO_BEP_INPUT,
  },
  {
    id: "solo-plus-assist",
    labelKo: "1인 작가 + 어시 2명",
    summaryKo: "58컷 · MG 200만 · RS 60%",
    input: {
      seriesTitle: "골목 사진관의 계절",
      plannedEpisodes: 40,
      cutsPerEpisode: 58,
      initialSetupCostKrw: 4_200_000,
      fixedOverheadPerEpisodeKrw: 180_000,
      processCosts: [
        { id: "story", labelKo: "각색·콘티", pricingMode: "per-episode", unitCostKrw: 0, headcount: 1 },
        { id: "lineart", labelKo: "선화 보조", pricingMode: "per-cut", unitCostKrw: 7_500, headcount: 1 },
        { id: "coloring", labelKo: "채색 어시", pricingMode: "per-cut", unitCostKrw: 8_500, headcount: 1 },
        { id: "background3d", labelKo: "3D 배경 리소스", pricingMode: "per-episode", unitCostKrw: 180_000, headcount: 1 },
        { id: "postfx", labelKo: "식자·마감", pricingMode: "per-episode", unitCostKrw: 150_000, headcount: 1 },
        { id: "assistant", labelKo: "어시스턴트 인건비", pricingMode: "per-episode", unitCostKrw: 450_000, headcount: 1 },
      ],
      platformMgPerEpisodeKrw: 2_000_000,
      platformRsRatePercent: 60,
      mgRecoupmentEnabled: true,
      avgReadersPerEpisode: 46_000,
      paidConversionRatePercent: 7.2,
      arpuPerEpisodeKrw: 1_150,
    },
  },
  {
    id: "global-novel-comic",
    labelKo: "글로벌 노블코믹스",
    summaryKo: "85컷 · MG 550만 · RS 45%",
    input: {
      seriesTitle: "천공의 연금술사 연대기",
      plannedEpisodes: 60,
      cutsPerEpisode: 85,
      initialSetupCostKrw: 22_000_000,
      fixedOverheadPerEpisodeKrw: 680_000,
      processCosts: [
        { id: "story", labelKo: "각색·콘티", pricingMode: "per-episode", unitCostKrw: 1_100_000, headcount: 1 },
        { id: "lineart", labelKo: "선화 메인/외주", pricingMode: "per-cut", unitCostKrw: 19_000, headcount: 1 },
        { id: "coloring", labelKo: "채색·광원 연출", pricingMode: "per-cut", unitCostKrw: 17_000, headcount: 1 },
        { id: "background3d", labelKo: "3D 배경·렌더", pricingMode: "per-episode", unitCostKrw: 850_000, headcount: 1 },
        { id: "postfx", labelKo: "식자·효과음", pricingMode: "per-episode", unitCostKrw: 380_000, headcount: 1 },
        { id: "assistant", labelKo: "어시스턴트 인건비", pricingMode: "per-episode", unitCostKrw: 700_000, headcount: 2 },
      ],
      platformMgPerEpisodeKrw: 5_500_000,
      platformRsRatePercent: 45,
      mgRecoupmentEnabled: true,
      avgReadersPerEpisode: 165_000,
      paidConversionRatePercent: 9.8,
      arpuPerEpisodeKrw: 1_450,
    },
  },
];

export function simulateStudioBep(rawInput: StudioBepSimulationInput): StudioBepSimulationResult {
  const plannedEpisodes = Math.round(clampNumber(rawInput.plannedEpisodes, 1, 300));
  const cutsPerEpisode = Math.round(clampNumber(rawInput.cutsPerEpisode, 10, 240));
  const initialSetupCostKrw = Math.round(clampNumber(rawInput.initialSetupCostKrw, 0, 1_000_000_000));
  const fixedOverheadPerEpisodeKrw = Math.round(clampNumber(rawInput.fixedOverheadPerEpisodeKrw, 0, 100_000_000));
  const platformMgPerEpisodeKrw = Math.round(clampNumber(rawInput.platformMgPerEpisodeKrw, 0, 100_000_000));
  const platformRsRatePercent = clampNumber(rawInput.platformRsRatePercent, 0, 100);
  const avgReadersPerEpisode = Math.round(clampNumber(rawInput.avgReadersPerEpisode, 0, 100_000_000));
  const paidConversionRatePercent = clampNumber(rawInput.paidConversionRatePercent, 0, 100);
  const arpuPerEpisodeKrw = Math.round(clampNumber(rawInput.arpuPerEpisodeKrw, 0, 1_000_000));

  const rawProcessTotals = rawInput.processCosts.map((item) => {
    const unitCost = clampNumber(item.unitCostKrw, 0, 100_000_000);
    const headcount = clampNumber(item.headcount, 0, 50);
    const episodeCostKrw =
      item.pricingMode === "per-cut"
        ? Math.round(cutsPerEpisode * unitCost * headcount)
        : Math.round(unitCost * headcount);
    return { item, episodeCostKrw };
  });

  const processTotalPerEpisodeKrw = rawProcessTotals.reduce((acc, row) => acc + row.episodeCostKrw, 0);
  const costPerEpisodeKrw = processTotalPerEpisodeKrw + fixedOverheadPerEpisodeKrw;
  const costPerCutKrw = Math.round(costPerEpisodeKrw / cutsPerEpisode);

  const processBreakdown: StudioProcessCostBreakdown[] = rawProcessTotals.map(({ item, episodeCostKrw }) => ({
    id: item.id,
    labelKo: item.labelKo,
    pricingMode: item.pricingMode,
    episodeCostKrw,
    sharePercent: costPerEpisodeKrw > 0 ? roundTo((episodeCostKrw / costPerEpisodeKrw) * 100, 1) : 0,
  }));

  const paidReadersExact = avgReadersPerEpisode * (paidConversionRatePercent / 100);
  const paidReadersPerEpisode = Math.round(paidReadersExact);
  const grossRevenuePerEpisodeKrw = Math.round(paidReadersExact * arpuPerEpisodeKrw);
  const studioRsPerEpisodeKrw = Math.round(grossRevenuePerEpisodeKrw * (platformRsRatePercent / 100));
  const effectiveStudioRevenuePerEpisodeKrw = rawInput.mgRecoupmentEnabled
    ? Math.max(platformMgPerEpisodeKrw, studioRsPerEpisodeKrw)
    : studioRsPerEpisodeKrw;

  const episodeSchedule: StudioEpisodeFinancialPoint[] = [];
  let prevCumulativeRevenue = 0;
  let bepEpisode: number | null = null;

  for (let episode = 1; episode <= plannedEpisodes; episode += 1) {
    const cumulativeCostKrw = initialSetupCostKrw + episode * costPerEpisodeKrw;
    const cumulativeMgKrw = rawInput.mgRecoupmentEnabled ? episode * platformMgPerEpisodeKrw : 0;
    const cumulativeEarnedRsKrw = episode * studioRsPerEpisodeKrw;
    const cumulativeStudioRevenueKrw = rawInput.mgRecoupmentEnabled
      ? Math.max(cumulativeMgKrw, cumulativeEarnedRsKrw)
      : cumulativeEarnedRsKrw;
    const episodeStudioRevenueKrw = cumulativeStudioRevenueKrw - prevCumulativeRevenue;
    prevCumulativeRevenue = cumulativeStudioRevenueKrw;

    const cumulativeNetProfitKrw = cumulativeStudioRevenueKrw - cumulativeCostKrw;
    const cumulativeRecoveryRatePercent =
      cumulativeCostKrw > 0 ? roundTo((cumulativeStudioRevenueKrw / cumulativeCostKrw) * 100, 1) : 0;
    const mgRecouped = !rawInput.mgRecoupmentEnabled || cumulativeEarnedRsKrw >= cumulativeMgKrw;

    if (bepEpisode === null && cumulativeStudioRevenueKrw >= cumulativeCostKrw) {
      bepEpisode = episode;
    }

    episodeSchedule.push({
      episode,
      episodeCostKrw: costPerEpisodeKrw,
      episodeGrossRevenueKrw: grossRevenuePerEpisodeKrw,
      episodeStudioRevenueKrw,
      cumulativeCostKrw,
      cumulativeMgKrw,
      cumulativeEarnedRsKrw,
      cumulativeStudioRevenueKrw,
      cumulativeNetProfitKrw,
      cumulativeRecoveryRatePercent,
      mgRecouped,
    });
  }

  const lastPoint = episodeSchedule[episodeSchedule.length - 1];
  const totalCostKrw = lastPoint ? lastPoint.cumulativeCostKrw : initialSetupCostKrw;
  const totalStudioRevenueKrw = lastPoint ? lastPoint.cumulativeStudioRevenueKrw : 0;
  const totalNetProfitKrw = totalStudioRevenueKrw - totalCostKrw;
  const cumulativeRecoveryRatePercent =
    totalCostKrw > 0 ? roundTo((totalStudioRevenueKrw / totalCostKrw) * 100, 1) : 0;
  const expectedNetMarginPercent =
    totalStudioRevenueKrw > 0 ? roundTo((totalNetProfitKrw / totalStudioRevenueKrw) * 100, 1) : -100;

  const perEpisodeContributionKrw = effectiveStudioRevenuePerEpisodeKrw - costPerEpisodeKrw;
  let exactBepEpisode: number | null = null;
  if (initialSetupCostKrw === 0) {
    exactBepEpisode = perEpisodeContributionKrw >= 0 ? 1 : null;
  } else if (perEpisodeContributionKrw > 0) {
    exactBepEpisode = roundTo(initialSetupCostKrw / perEpisodeContributionKrw, 1);
  }

  const totalMgKrw = rawInput.mgRecoupmentEnabled ? plannedEpisodes * platformMgPerEpisodeKrw : 0;
  const totalEarnedRsKrw = plannedEpisodes * studioRsPerEpisodeKrw;
  const mgRecoupmentStatus: MgRecoupmentStatus = !rawInput.mgRecoupmentEnabled || totalMgKrw === 0
    ? "no-mg"
    : totalEarnedRsKrw >= totalMgKrw
      ? "recouped"
      : "unrecouped";
  const mgRecoupmentRatePercent =
    totalMgKrw > 0 ? roundTo((totalEarnedRsKrw / totalMgKrw) * 100, 1) : 100;

  let diagnosisKo: string;
  if (bepEpisode !== null) {
    diagnosisKo = `${bepEpisode}화(정밀 ${exactBepEpisode ?? bepEpisode}화)에 손익분기점(BEP)을 돌파하며, ${plannedEpisodes}화 기준 예상 순이익률은 ${expectedNetMarginPercent}%입니다.`;
  } else if (exactBepEpisode !== null) {
    diagnosisKo = `현재 계획(${plannedEpisodes}화) 안에는 미도달이며, 약 ${Math.ceil(exactBepEpisode)}화 연재 시 손익분기점에 도달합니다.`;
  } else {
    diagnosisKo =
      "회차당 제작 원가가 스튜디오 회차 수익을 초과해 현재 구조로는 손익분기점에 도달하지 못합니다. 컷 단가 또는 유료 전환율을 조정하세요.";
  }

  return {
    seriesTitle: rawInput.seriesTitle.trim() || "무제 스튜디오 프로젝트",
    plannedEpisodes,
    cutsPerEpisode,
    processBreakdown,
    processTotalPerEpisodeKrw,
    costPerEpisodeKrw,
    costPerCutKrw,
    paidReadersPerEpisode,
    grossRevenuePerEpisodeKrw,
    studioRsPerEpisodeKrw,
    effectiveStudioRevenuePerEpisodeKrw,
    totalCostKrw,
    totalStudioRevenueKrw,
    totalNetProfitKrw,
    cumulativeRecoveryRatePercent,
    expectedNetMarginPercent,
    bepEpisode,
    exactBepEpisode,
    mgRecoupmentStatus,
    mgRecoupmentRatePercent,
    episodeSchedule,
    diagnosisKo,
  };
}

export const TAX_JURISDICTION_RULES: Readonly<Record<TaxJurisdictionCode, TaxJurisdictionRule>> = {
  KR: {
    code: "KR",
    countryKo: "대한민국",
    defaultCurrency: "KRW",
    treatyWithholdingRatePercent: 3.3,
    statutoryWithholdingRatePercent: 3.3,
    basisKo: "국내 사업소득 원천징수 3.3% (소득세 3.0% + 지방소득세 0.3%)",
    requiredDocumentKo: "국내 사업자/개인 인적용역 등록",
  },
  US: {
    code: "US",
    countryKo: "미국",
    defaultCurrency: "USD",
    treatyWithholdingRatePercent: 10.0,
    statutoryWithholdingRatePercent: 30.0,
    basisKo: "한·미 조세조약 저작권 로열티 10% (W-8BEN 미제출 시 30%)",
    requiredDocumentKo: "W-8BEN 또는 W-8BEN-E 제출",
  },
  JP: {
    code: "JP",
    countryKo: "일본",
    defaultCurrency: "JPY",
    treatyWithholdingRatePercent: 10.0,
    statutoryWithholdingRatePercent: 20.42,
    basisKo: "한·일 조세조약 사용료 원천징수 10%",
    requiredDocumentKo: "조세조약 경감신청서 + 거주자증명서",
  },
  VN: {
    code: "VN",
    countryKo: "베트남",
    defaultCurrency: "VND",
    treatyWithholdingRatePercent: 10.0,
    statutoryWithholdingRatePercent: 10.0,
    basisKo: "한·베 조세조약 저작권 사용료 원천징수 10%",
    requiredDocumentKo: "거주자증명서(COR)",
  },
  TH: {
    code: "TH",
    countryKo: "태국",
    defaultCurrency: "THB",
    treatyWithholdingRatePercent: 10.0,
    statutoryWithholdingRatePercent: 15.0,
    basisKo: "한·태 조세조약 저작권 사용료 원천징수 10%",
    requiredDocumentKo: "거주자증명서(COR)",
  },
  ID: {
    code: "ID",
    countryKo: "인도네시아",
    defaultCurrency: "IDR",
    treatyWithholdingRatePercent: 10.0,
    statutoryWithholdingRatePercent: 20.0,
    basisKo: "한·인니 조세조약 사용료 원천징수 10% (DGT 양식 기준)",
    requiredDocumentKo: "DGT Form + 거주자증명서",
  },
  PH: {
    code: "PH",
    countryKo: "필리핀",
    defaultCurrency: "PHP",
    treatyWithholdingRatePercent: 10.0,
    statutoryWithholdingRatePercent: 25.0,
    basisKo: "한·필 조세조약 사용료 원천징수 10%",
    requiredDocumentKo: "TTRA / 거주자증명서",
  },
};

export const TAX_JURISDICTION_LIST: readonly TaxJurisdictionRule[] = [
  TAX_JURISDICTION_RULES.KR,
  TAX_JURISDICTION_RULES.US,
  TAX_JURISDICTION_RULES.JP,
  TAX_JURISDICTION_RULES.VN,
  TAX_JURISDICTION_RULES.TH,
  TAX_JURISDICTION_RULES.ID,
  TAX_JURISDICTION_RULES.PH,
];

export const CURRENCY_SPECS: Readonly<Record<SettlementCurrencyCode, CurrencySpec>> = {
  KRW: { code: "KRW", symbol: "₩", labelKo: "원화 (KRW)", decimals: 0, referenceRateToKrw: 1 },
  USD: { code: "USD", symbol: "$", labelKo: "미국 달러 (USD)", decimals: 2, referenceRateToKrw: 1380 },
  JPY: { code: "JPY", symbol: "¥", labelKo: "일본 엔 (JPY)", decimals: 0, referenceRateToKrw: 9.1 },
  VND: { code: "VND", symbol: "₫", labelKo: "베트남 동 (VND)", decimals: 0, referenceRateToKrw: 0.055 },
  THB: { code: "THB", symbol: "฿", labelKo: "태국 바트 (THB)", decimals: 2, referenceRateToKrw: 40.5 },
  IDR: { code: "IDR", symbol: "Rp", labelKo: "인도네시아 루피아 (IDR)", decimals: 0, referenceRateToKrw: 0.088 },
  PHP: { code: "PHP", symbol: "₱", labelKo: "필리핀 페소 (PHP)", decimals: 2, referenceRateToKrw: 24.2 },
};

export const CURRENCY_LIST: readonly CurrencySpec[] = [
  CURRENCY_SPECS.KRW,
  CURRENCY_SPECS.USD,
  CURRENCY_SPECS.JPY,
  CURRENCY_SPECS.VND,
  CURRENCY_SPECS.THB,
  CURRENCY_SPECS.IDR,
  CURRENCY_SPECS.PHP,
];

export const DEFAULT_CROSS_BORDER_INPUT: CrossBorderSettlementInput = {
  settlementPeriod: "2026-10",
  studioName: "스튜디오 밤우편",
  payoutCurrency: "KRW",
  transferFeeRatePercent: 1.5,
  lines: [
    {
      id: "line-kr",
      platformLabel: "국내 연재 플랫폼",
      jurisdiction: "KR",
      sourceCurrency: "KRW",
      grossAmountSource: 18_500_000,
      treatyDocumentSubmitted: true,
    },
    {
      id: "line-us",
      platformLabel: "북미 글로벌 웹툰",
      jurisdiction: "US",
      sourceCurrency: "USD",
      grossAmountSource: 6_400,
      treatyDocumentSubmitted: true,
    },
    {
      id: "line-jp",
      platformLabel: "일본 망가 스토어",
      jurisdiction: "JP",
      sourceCurrency: "JPY",
      grossAmountSource: 820_000,
      treatyDocumentSubmitted: true,
    },
    {
      id: "line-th",
      platformLabel: "태국 웹툰 서비스",
      jurisdiction: "TH",
      sourceCurrency: "THB",
      grossAmountSource: 58_000,
      treatyDocumentSubmitted: true,
    },
  ],
};

function resolveFxRateToKrw(
  code: SettlementCurrencyCode,
  customFxToKrw?: Partial<Record<SettlementCurrencyCode, number>>,
): number {
  const custom = customFxToKrw?.[code];
  if (typeof custom === "number" && Number.isFinite(custom) && custom > 0) {
    return custom;
  }
  return CURRENCY_SPECS[code].referenceRateToKrw;
}

export function formatCurrencyAmount(amount: number, code: SettlementCurrencyCode): string {
  const spec = CURRENCY_SPECS[code];
  const rounded = roundTo(amount, spec.decimals);
  const formatted = rounded.toLocaleString("ko-KR", {
    minimumFractionDigits: spec.decimals,
    maximumFractionDigits: spec.decimals,
  });
  return `${spec.symbol}${formatted}`;
}

export function calculateCrossBorderSettlement(
  input: CrossBorderSettlementInput,
): CrossBorderSettlementStatement {
  const transferFeeRatePercent = clampNumber(input.transferFeeRatePercent, 0, 30);
  const payoutSpec = CURRENCY_SPECS[input.payoutCurrency];
  const payoutFxToKrw = resolveFxRateToKrw(input.payoutCurrency, input.customFxToKrw);

  const lines: CrossBorderSettlementLineResult[] = input.lines.map((line) => {
    const rule = TAX_JURISDICTION_RULES[line.jurisdiction];
    const sourceSpec = CURRENCY_SPECS[line.sourceCurrency];
    const grossAmountSource = clampNumber(line.grossAmountSource, 0, 100_000_000_000);
    const fxRateToKrw = resolveFxRateToKrw(line.sourceCurrency, input.customFxToKrw);
    const grossKrw = Math.round(grossAmountSource * fxRateToKrw);

    const withholdingRatePercent =
      line.jurisdiction === "KR" || line.treatyDocumentSubmitted
        ? rule.treatyWithholdingRatePercent
        : rule.statutoryWithholdingRatePercent;

    const withholdingTaxSource = roundTo(
      grossAmountSource * (withholdingRatePercent / 100),
      sourceSpec.decimals,
    );
    const withholdingTaxKrw = Math.round(grossKrw * (withholdingRatePercent / 100));
    const afterTaxKrw = Math.max(0, grossKrw - withholdingTaxKrw);
    const transferFeeKrw = line.jurisdiction === "KR"
      ? 0
      : Math.round(afterTaxKrw * (transferFeeRatePercent / 100));
    const netKrw = Math.max(0, afterTaxKrw - transferFeeKrw);
    const netInPayoutCurrency = roundTo(netKrw / payoutFxToKrw, payoutSpec.decimals);
    const foreignTaxCreditEligibleKrw = line.jurisdiction === "KR" ? 0 : withholdingTaxKrw;

    return {
      id: line.id,
      platformLabel: line.platformLabel.trim() || `${rule.countryKo} 플랫폼`,
      jurisdiction: line.jurisdiction,
      countryKo: rule.countryKo,
      sourceCurrency: line.sourceCurrency,
      grossAmountSource,
      fxRateToKrw,
      grossKrw,
      treatyDocumentSubmitted: line.treatyDocumentSubmitted,
      withholdingRatePercent,
      withholdingTaxSource,
      withholdingTaxKrw,
      transferFeeKrw,
      netKrw,
      netInPayoutCurrency,
      foreignTaxCreditEligibleKrw,
      taxBasisKo: rule.basisKo,
    };
  });

  const totalGrossKrw = lines.reduce((sum, item) => sum + item.grossKrw, 0);
  const totalWithholdingTaxKrw = lines.reduce((sum, item) => sum + item.withholdingTaxKrw, 0);
  const totalTransferFeeKrw = lines.reduce((sum, item) => sum + item.transferFeeKrw, 0);
  const totalNetKrw = lines.reduce((sum, item) => sum + item.netKrw, 0);
  const totalNetInPayoutCurrency = roundTo(totalNetKrw / payoutFxToKrw, payoutSpec.decimals);
  const effectiveWithholdingRatePercent =
    totalGrossKrw > 0 ? roundTo((totalWithholdingTaxKrw / totalGrossKrw) * 100, 2) : 0;
  const totalForeignTaxCreditEligibleKrw = lines.reduce(
    (sum, item) => sum + item.foreignTaxCreditEligibleKrw,
    0,
  );

  return {
    settlementPeriod: input.settlementPeriod.trim() || "2026-10",
    studioName: input.studioName.trim() || "무제 스튜디오",
    payoutCurrency: input.payoutCurrency,
    payoutFxToKrw,
    transferFeeRatePercent,
    lines,
    totalGrossKrw,
    totalWithholdingTaxKrw,
    totalTransferFeeKrw,
    totalNetKrw,
    totalNetInPayoutCurrency,
    effectiveWithholdingRatePercent,
    totalForeignTaxCreditEligibleKrw,
    legalNoticeKo: TAX_LEGAL_REVIEW_NOTICE_KO,
  };
}

function escapeCsvCell(value: string | number | boolean): string {
  const raw = String(value);
  if (/[",\r\n]/u.test(raw)) {
    return `"${raw.replace(/"/gu, '""')}"`;
  }
  return raw;
}

export function exportCrossBorderStatementJson(statement: CrossBorderSettlementStatement): string {
  return JSON.stringify(
    {
      schema: "toonstudio.crossborder-tax-statement.v1",
      settlementPeriod: statement.settlementPeriod,
      studioName: statement.studioName,
      payoutCurrency: statement.payoutCurrency,
      payoutFxToKrw: statement.payoutFxToKrw,
      legalNoticeKo: statement.legalNoticeKo,
      summary: {
        totalGrossKrw: statement.totalGrossKrw,
        totalWithholdingTaxKrw: statement.totalWithholdingTaxKrw,
        totalTransferFeeKrw: statement.totalTransferFeeKrw,
        totalNetKrw: statement.totalNetKrw,
        totalNetInPayoutCurrency: statement.totalNetInPayoutCurrency,
        effectiveWithholdingRatePercent: statement.effectiveWithholdingRatePercent,
        totalForeignTaxCreditEligibleKrw: statement.totalForeignTaxCreditEligibleKrw,
      },
      lines: statement.lines,
    },
    null,
    2,
  );
}

export function exportCrossBorderStatementCsv(statement: CrossBorderSettlementStatement): string {
  const headers = [
    "정산기간",
    "스튜디오",
    "플랫폼",
    "국가코드",
    "원천통화",
    "총매출(원천)",
    "적용환율(KRW)",
    "총매출(KRW)",
    "조세조약서류",
    "원천징수율(%)",
    "원천징수세액(KRW)",
    "송금수수료(KRW)",
    "실수령액(KRW)",
    "정산통화",
    "실수령액(정산통화)",
    "외국납부세액공제대상(KRW)",
  ];

  const rows = statement.lines.map((line) =>
    [
      statement.settlementPeriod,
      statement.studioName,
      line.platformLabel,
      line.jurisdiction,
      line.sourceCurrency,
      line.grossAmountSource,
      line.fxRateToKrw,
      line.grossKrw,
      line.treatyDocumentSubmitted ? "제출" : "미제출",
      line.withholdingRatePercent,
      line.withholdingTaxKrw,
      line.transferFeeKrw,
      line.netKrw,
      statement.payoutCurrency,
      line.netInPayoutCurrency,
      line.foreignTaxCreditEligibleKrw,
    ].map(escapeCsvCell).join(","),
  );

  const totalRow = [
    statement.settlementPeriod,
    statement.studioName,
    "합계",
    "ALL",
    "MULTI",
    "",
    statement.payoutFxToKrw,
    statement.totalGrossKrw,
    "",
    statement.effectiveWithholdingRatePercent,
    statement.totalWithholdingTaxKrw,
    statement.totalTransferFeeKrw,
    statement.totalNetKrw,
    statement.payoutCurrency,
    statement.totalNetInPayoutCurrency,
    statement.totalForeignTaxCreditEligibleKrw,
  ].map(escapeCsvCell).join(",");

  return [headers.map(escapeCsvCell).join(","), ...rows, totalRow].join("\n");
}
