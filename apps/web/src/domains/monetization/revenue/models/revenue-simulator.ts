/**
 * revenue-simulator.ts — 창작자 수익·후원·세무·팀 배분 실시간 시뮬레이터 순수 모델.
 *
 * 실제 정산 데이터와 명확히 분리된 '예상 시뮬레이션' 계산기다.
 * 4개 수익원(미리보기 독자·정기 멤버십·회차 후원 팁·소재 판매)과
 * 3종 세무·배분 기준을 조합해 월/연 실수령 예상액과 비중을 계산하고 로컬에 저장한다.
 */

export type RevenueMixId =
  | "fastpass-cookie-pps"
  | "fanbox-patreon-membership"
  | "3d-brush-asset-royalty"
  | "ip-season-funding-royalty";

export type TaxRegimeId =
  | "kr-withholding-33pct"
  | "us-w8ben-treaty"
  | "studio-split-70-30";

export type RevenueScenarioPresetId = "rookie-weekly" | "fandom-membership" | "studio-team";

export interface RevenueSimulatorInput {
  readonly revenueMix: RevenueMixId;
  readonly taxRegime: TaxRegimeId;
  /** 월 유료 미리보기 결제 독자 수 (1인당 평균 2,400원 가정). */
  readonly paidReaders: number;
  /** 월 정기 멤버십 구독자 수 (1인당 평균 6,900원 가정). */
  readonly membershipSubscribers: number;
  /** 월 회차 후원 팁 총액 (원). */
  readonly monthlyTipsKrw: number;
  /** 월 3D 배경·브러시 소재 판매액 (원). */
  readonly monthlyAssetSalesKrw: number;
  /** 월 목표 실수령액 (원). */
  readonly monthlyGoalKrw: number;
}

export interface RevenueSimulationBreakdown {
  readonly grossKrw: number;
  readonly platformAndPgFeeKrw: number;
  readonly partnerSplitKrw: number;
  readonly taxWithholdingKrw: number;
  readonly netCreatorKrw: number;
  readonly annualizedNetKrw: number;
  readonly goalProgressPct: number;
  readonly netSharePct: number;
  readonly partnerSharePct: number;
  readonly taxSharePct: number;
  readonly feeSharePct: number;
}

export interface RevenueScenarioPreset {
  readonly id: RevenueScenarioPresetId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly subtitleKo: string;
  readonly subtitleEn: string;
  readonly input: RevenueSimulatorInput;
}

const PAID_READER_UNIT_KRW = 2_400;
const MEMBERSHIP_UNIT_KRW = 6_900;
const PLATFORM_FEE_RATE_BY_MIX: Readonly<Record<RevenueMixId, number>> = {
  "fastpass-cookie-pps": 0.12,
  "fanbox-patreon-membership": 0.09,
  "3d-brush-asset-royalty": 0.1,
  "ip-season-funding-royalty": 0.14,
};

export const REVENUE_SCENARIO_PRESETS: readonly RevenueScenarioPreset[] = [
  {
    id: "rookie-weekly",
    labelKo: "주간 연재 입문",
    labelEn: "Weekly debut",
    subtitleKo: "유료 독자 300명 · 멤버십 35명 기준",
    subtitleEn: "300 paid readers · 35 members",
    input: {
      revenueMix: "fastpass-cookie-pps",
      taxRegime: "kr-withholding-33pct",
      paidReaders: 300,
      membershipSubscribers: 35,
      monthlyTipsKrw: 180_000,
      monthlyAssetSalesKrw: 120_000,
      monthlyGoalKrw: 1_500_000,
    },
  },
  {
    id: "fandom-membership",
    labelKo: "팬덤 멤버십 중심",
    labelEn: "Fandom membership",
    subtitleKo: "정기 구독자 180명 · 회차 후원 활발",
    subtitleEn: "180 members · active episode tips",
    input: {
      revenueMix: "fanbox-patreon-membership",
      taxRegime: "kr-withholding-33pct",
      paidReaders: 420,
      membershipSubscribers: 180,
      monthlyTipsKrw: 520_000,
      monthlyAssetSalesKrw: 240_000,
      monthlyGoalKrw: 3_000_000,
    },
  },
  {
    id: "studio-team",
    labelKo: "스튜디오 7:3 협업",
    labelEn: "Studio 70:30 team",
    subtitleKo: "연재·소재·IP 수익 통합 · 파트너 30% 배분",
    subtitleEn: "Series, assets & IP · 30% partner split",
    input: {
      revenueMix: "ip-season-funding-royalty",
      taxRegime: "studio-split-70-30",
      paidReaders: 1_100,
      membershipSubscribers: 260,
      monthlyTipsKrw: 650_000,
      monthlyAssetSalesKrw: 850_000,
      monthlyGoalKrw: 4_500_000,
    },
  },
];

export const DEFAULT_SIMULATOR_INPUT: RevenueSimulatorInput = REVENUE_SCENARIO_PRESETS[0]!.input;

const STORAGE_KEY = "toonstudio.creator-revenue-simulator.v1";

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function sanitizeSimulatorInput(raw: Partial<RevenueSimulatorInput>): RevenueSimulatorInput {
  const revenueMix: RevenueMixId =
    raw.revenueMix === "fanbox-patreon-membership"
    || raw.revenueMix === "3d-brush-asset-royalty"
    || raw.revenueMix === "ip-season-funding-royalty"
      ? raw.revenueMix
      : "fastpass-cookie-pps";
  const taxRegime: TaxRegimeId =
    raw.taxRegime === "us-w8ben-treaty" || raw.taxRegime === "studio-split-70-30"
      ? raw.taxRegime
      : "kr-withholding-33pct";

  return {
    revenueMix,
    taxRegime,
    paidReaders: clampInt(raw.paidReaders ?? DEFAULT_SIMULATOR_INPUT.paidReaders, 0, 10_000),
    membershipSubscribers: clampInt(
      raw.membershipSubscribers ?? DEFAULT_SIMULATOR_INPUT.membershipSubscribers,
      0,
      5_000,
    ),
    monthlyTipsKrw: clampInt(
      raw.monthlyTipsKrw ?? DEFAULT_SIMULATOR_INPUT.monthlyTipsKrw,
      0,
      5_000_000,
    ),
    monthlyAssetSalesKrw: clampInt(
      raw.monthlyAssetSalesKrw ?? DEFAULT_SIMULATOR_INPUT.monthlyAssetSalesKrw,
      0,
      5_000_000,
    ),
    monthlyGoalKrw: clampInt(
      raw.monthlyGoalKrw ?? DEFAULT_SIMULATOR_INPUT.monthlyGoalKrw,
      100_000,
      20_000_000,
    ),
  };
}

export function simulateCreatorRevenue(input: RevenueSimulatorInput): RevenueSimulationBreakdown {
  const paidKrw = input.paidReaders * PAID_READER_UNIT_KRW;
  const membershipKrw = input.membershipSubscribers * MEMBERSHIP_UNIT_KRW;
  const grossKrw = paidKrw + membershipKrw + input.monthlyTipsKrw + input.monthlyAssetSalesKrw;

  if (grossKrw <= 0) {
    return {
      grossKrw: 0,
      platformAndPgFeeKrw: 0,
      partnerSplitKrw: 0,
      taxWithholdingKrw: 0,
      netCreatorKrw: 0,
      annualizedNetKrw: 0,
      goalProgressPct: 0,
      netSharePct: 0,
      partnerSharePct: 0,
      taxSharePct: 0,
      feeSharePct: 0,
    };
  }

  const feeRate = PLATFORM_FEE_RATE_BY_MIX[input.revenueMix];
  const platformAndPgFeeKrw = Math.round(grossKrw * feeRate);
  const afterFeeKrw = Math.max(0, grossKrw - platformAndPgFeeKrw);

  const partnerSplitKrw =
    input.taxRegime === "studio-split-70-30" ? Math.round(afterFeeKrw * 0.3) : 0;
  const creatorPreTaxKrw = Math.max(0, afterFeeKrw - partnerSplitKrw);

  const taxRate =
    input.taxRegime === "us-w8ben-treaty" ? 0.1 : 0.033;
  const taxWithholdingKrw = Math.round(creatorPreTaxKrw * taxRate);
  const netCreatorKrw = Math.max(0, creatorPreTaxKrw - taxWithholdingKrw);

  const toPct = (part: number) => Math.round((part / grossKrw) * 100);
  const goalProgressPct = Math.min(100, Math.round((netCreatorKrw / Math.max(1, input.monthlyGoalKrw)) * 100));

  return {
    grossKrw,
    platformAndPgFeeKrw,
    partnerSplitKrw,
    taxWithholdingKrw,
    netCreatorKrw,
    annualizedNetKrw: netCreatorKrw * 12,
    goalProgressPct,
    netSharePct: toPct(netCreatorKrw),
    partnerSharePct: toPct(partnerSplitKrw),
    taxSharePct: toPct(taxWithholdingKrw),
    feeSharePct: toPct(platformAndPgFeeKrw),
  };
}

export function loadSimulatorInput(): RevenueSimulatorInput {
  if (typeof window === "undefined") return DEFAULT_SIMULATOR_INPUT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SIMULATOR_INPUT;
    return sanitizeSimulatorInput(JSON.parse(raw) as Partial<RevenueSimulatorInput>);
  } catch {
    return DEFAULT_SIMULATOR_INPUT;
  }
}

export function saveSimulatorInput(input: RevenueSimulatorInput): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(input));
  } catch {
    // 프라이빗 모드에서도 현재 화면 시뮬레이션은 계속 동작한다.
  }
}
