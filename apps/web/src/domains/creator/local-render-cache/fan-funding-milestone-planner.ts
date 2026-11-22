/**
 * 구독자·팬 참여형 단행본/굿즈 펀딩 마일스톤 및 리워드 손익분기(BEP) 플래너 (1원 오차 0건).
 *
 * 목표 모금액, 리워드 티어별 제작·배송 단가, 플랫폼/결제 수수료(bps), 예비비(bps),
 * 고정비(편집·판비·샘플·ISBN) 및 스트레치 마일스톤 추가 특전 원가를 전량 정수 KRW로 정산한다.
 * 해밀턴 최대잔여법(Hamilton largest-remainder) 정수 배분으로 티어 합계와 캠페인 총액의
 * 1원 오차(reconciliationErrorKrw === 0)를 구조적으로 보장한다.
 */

export interface FundingFeePolicyBps {
  /** 플랫폼 중개 수수료 (bps, 100 bps = 1.00%). 예: 500 = 5.00%. */
  readonly platformFeeBps: number;
  /** PG 결제 수수료 (bps). 예: 330 = 3.30%. */
  readonly paymentFeeBps: number;
  /** 파손·재배송·환불 대비 예비비 적립 비율 (bps). 예: 500 = 5.00%. */
  readonly contingencyReserveBps: number;
  /** 수수료 부가세 비율 (bps, 선택). 기본 0. */
  readonly feeVatBps?: number;
}

export interface FundingRewardTierInput {
  readonly id: string;
  readonly name: string;
  /** 후원가 (정수 원). */
  readonly priceKrw: number;
  /** 1세트당 제작 원가 (정수 원). */
  readonly unitProductionCostKrw: number;
  /** 1세트당 포장·배송 원가 (정수 원, 디지털 리워드는 0). */
  readonly unitShippingCostKrw: number;
  /** 계획 후원자 수 (정수 >= 0). */
  readonly plannedBackerCount: number;
  /** 한정 수량 상한(선택, 정수 >= 0). */
  readonly maxStockCount?: number;
  /** BEP·마일스톤 시뮬레이션용 리워드 구성 비중(양의 정수). */
  readonly mixWeight?: number;
}

export interface FundingMilestoneInput {
  readonly id: string;
  readonly title: string;
  /** 마일스톤 해금 기준 총 모금액 (정수 원). */
  readonly unlockAmountKrw: number;
  /** 마일스톤 달성 시 추가 고정비(금형·추가 일러스트 등, 정수 원). 기본 0. */
  readonly additionalFixedCostKrw?: number;
  /** 마일스톤 달성 시 후원자 1인당 추가 특전 단가(정수 원). 기본 0. */
  readonly additionalUnitCostKrw?: number;
}

export interface FanFundingPlanInput {
  readonly projectTitle: string;
  readonly targetFundingKrw: number;
  readonly fixedCostKrw: number;
  readonly feePolicy: FundingFeePolicyBps;
  readonly tiers: readonly FundingRewardTierInput[];
  readonly milestones?: readonly FundingMilestoneInput[];
}

export interface TierSettlementBreakdown {
  readonly tierId: string;
  readonly name: string;
  readonly priceKrw: number;
  readonly backerCount: number;
  readonly grossKrw: number;
  readonly allocatedPlatformFeeKrw: number;
  readonly allocatedPaymentFeeKrw: number;
  readonly allocatedFeeVatKrw: number;
  readonly allocatedContingencyReserveKrw: number;
  readonly productionCostKrw: number;
  readonly shippingCostKrw: number;
  readonly contributionProfitKrw: number;
  readonly estimatedUnitContributionKrw: number;
  readonly standaloneBreakEvenBackers: number | null;
  readonly negativeMarginWarning: boolean;
}

export interface CampaignIntegerSettlement {
  readonly totalBackers: number;
  readonly grossFundingKrw: number;
  readonly platformFeeKrw: number;
  readonly paymentFeeKrw: number;
  readonly feeVatKrw: number;
  readonly contingencyReserveKrw: number;
  readonly totalProductionCostKrw: number;
  readonly totalShippingCostKrw: number;
  readonly milestoneAdditionalFixedCostKrw: number;
  readonly milestoneAdditionalUnitCostKrw: number;
  readonly fixedCostKrw: number;
  readonly totalCostAndDeductionsKrw: number;
  readonly netCreatorProfitKrw: number;
  /** 항등식 검증 오차(gross - totalCostAndDeductions - netProfit). 항상 0. */
  readonly reconciliationErrorKrw: number;
  /** 티어별 정수 배분 합계와 캠페인 총액 간 차이. 항상 0. */
  readonly tierAllocationErrorKrw: number;
  readonly tierBreakdowns: readonly TierSettlementBreakdown[];
}

export interface BreakEvenAnalysis {
  readonly reachable: boolean;
  readonly breakEvenBackers: number | null;
  readonly breakEvenGrossKrw: number | null;
  readonly netProfitAtBreakEvenKrw: number | null;
  readonly isTargetAboveBep: boolean;
  readonly targetShortfallToBepKrw: number;
  readonly tierCountsAtBreakEven: Readonly<Record<string, number>>;
}

export interface MilestoneEvaluation {
  readonly id: string;
  readonly title: string;
  readonly unlockAmountKrw: number;
  readonly unlockedByPlannedFunding: boolean;
  readonly backersRequiredToUnlock: number | null;
  readonly grossAtUnlockKrw: number | null;
  readonly cumulativeAdditionalFixedCostKrw: number;
  readonly cumulativeAdditionalUnitCostPerBackerKrw: number;
  readonly netProfitAtUnlockKrw: number | null;
  /** 추가 특전 원가로 인해 마일스톤 달성 시 적자로 전환되는 위험 여부. */
  readonly marginTrapDetected: boolean;
  readonly reconciliationErrorKrw: number;
}

export interface FanFundingMilestonePlanResult {
  readonly projectTitle: string;
  readonly targetFundingKrw: number;
  readonly plannedSettlement: CampaignIntegerSettlement;
  readonly breakEven: BreakEvenAnalysis;
  readonly milestones: readonly MilestoneEvaluation[];
  readonly warnings: readonly string[];
  readonly summaryLines: readonly string[];
}

export const DEFAULT_FAN_FUNDING_FEE_POLICY: FundingFeePolicyBps = {
  platformFeeBps: 500,
  paymentFeeBps: 330,
  contingencyReserveBps: 500,
  feeVatBps: 1000,
};

const BPS_DENOMINATOR = 10_000;
const MAX_SAFE_KRW_FOR_BPS = Math.floor(Number.MAX_SAFE_INTEGER / BPS_DENOMINATOR);

const UNREACHABLE_BEP: BreakEvenAnalysis = {
  reachable: false,
  breakEvenBackers: null,
  breakEvenGrossKrw: null,
  netProfitAtBreakEvenKrw: null,
  isTargetAboveBep: false,
  targetShortfallToBepKrw: 0,
  tierCountsAtBreakEven: {},
};

function assertNonNegativeSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} 값은 0 이상의 정수여야 합니다: ${value}`);
  }
  return value;
}

function assertBpsRange(value: number, label: string, maxBps = 5000): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > maxBps) {
    throw new RangeError(`${label} 값은 0~${maxBps} bps 범위의 정수여야 합니다: ${value}`);
  }
  return value;
}

/** 부동소수점 오차 없이 정수 원화에 bps 비율을 적용해 반올림(half-up) 정수를 반환한다. */
export function multiplyKrwByBps(amountKrw: number, bps: number): number {
  assertNonNegativeSafeInteger(amountKrw, "amountKrw");
  assertBpsRange(bps, "bps", BPS_DENOMINATOR);
  if (amountKrw === 0 || bps === 0) return 0;
  if (amountKrw > MAX_SAFE_KRW_FOR_BPS) {
    throw new RangeError(`정수 정산 안전 한도를 초과한 금액입니다: ${amountKrw}`);
  }
  return Math.floor((amountKrw * bps + BPS_DENOMINATOR / 2) / BPS_DENOMINATOR);
}

/** 해밀턴 최대잔여법으로 정수 총액을 가중치 배열에 1원 오차 없이 배분한다. */
export function allocateIntegerProportionally(total: number, weights: readonly number[]): number[] {
  assertNonNegativeSafeInteger(total, "total");
  if (weights.length === 0) return [];
  const result = new Array<number>(weights.length).fill(0);
  if (total === 0) return result;

  let weightSum = 0;
  for (let i = 0; i < weights.length; i += 1) {
    weightSum += assertNonNegativeSafeInteger(weights[i] ?? 0, `weights[${i}]`);
  }
  if (weightSum === 0) return result;

  const remainders: { readonly index: number; readonly remainder: number }[] = [];
  let allocated = 0;
  for (let i = 0; i < weights.length; i += 1) {
    const numerator = total * (weights[i] ?? 0);
    const share = Math.floor(numerator / weightSum);
    result[i] = share;
    allocated += share;
    remainders.push({ index: i, remainder: numerator % weightSum });
  }

  remainders.sort((left, right) =>
    left.remainder !== right.remainder ? right.remainder - left.remainder : left.index - right.index,
  );
  for (let k = 0; k < total - allocated; k += 1) {
    const target = remainders[k];
    if (target) result[target.index] = (result[target.index] ?? 0) + 1;
  }
  return result;
}

function validatePlanInput(input: FanFundingPlanInput): void {
  if (!input.projectTitle.trim()) throw new RangeError("projectTitle은 비어 있을 수 없습니다.");
  assertNonNegativeSafeInteger(input.targetFundingKrw, "targetFundingKrw");
  assertNonNegativeSafeInteger(input.fixedCostKrw, "fixedCostKrw");

  const platformFeeBps = assertBpsRange(input.feePolicy.platformFeeBps, "platformFeeBps", 5000);
  const paymentFeeBps = assertBpsRange(input.feePolicy.paymentFeeBps, "paymentFeeBps", 5000);
  const contingencyBps = assertBpsRange(input.feePolicy.contingencyReserveBps, "contingencyReserveBps", 5000);
  const feeVatBps = assertBpsRange(input.feePolicy.feeVatBps ?? 0, "feeVatBps", 3000);
  const effectiveFeeBps =
    platformFeeBps + paymentFeeBps + Math.ceil(((platformFeeBps + paymentFeeBps) * feeVatBps) / BPS_DENOMINATOR) + contingencyBps;
  if (effectiveFeeBps >= BPS_DENOMINATOR) {
    throw new RangeError("수수료·부가세·예비비 합계 비율이 100% 이상입니다.");
  }
  if (input.tiers.length === 0) throw new RangeError("최소 1개 이상의 리워드 티어가 필요합니다.");

  const seenTierIds = new Set<string>();
  for (const tier of input.tiers) {
    if (!tier.id.trim()) throw new RangeError("리워드 티어 id는 비어 있을 수 없습니다.");
    if (seenTierIds.has(tier.id)) throw new RangeError(`중복된 리워드 티어 id입니다: ${tier.id}`);
    seenTierIds.add(tier.id);
    assertNonNegativeSafeInteger(tier.priceKrw, `${tier.id}.priceKrw`);
    assertNonNegativeSafeInteger(tier.unitProductionCostKrw, `${tier.id}.unitProductionCostKrw`);
    assertNonNegativeSafeInteger(tier.unitShippingCostKrw, `${tier.id}.unitShippingCostKrw`);
    assertNonNegativeSafeInteger(tier.plannedBackerCount, `${tier.id}.plannedBackerCount`);
    if (tier.maxStockCount !== undefined) {
      assertNonNegativeSafeInteger(tier.maxStockCount, `${tier.id}.maxStockCount`);
      if (tier.plannedBackerCount > tier.maxStockCount) {
        throw new RangeError(`${tier.id} 계획 후원자 수(${tier.plannedBackerCount})가 재고 상한(${tier.maxStockCount})을 초과합니다.`);
      }
    }
    if (tier.mixWeight !== undefined) assertNonNegativeSafeInteger(tier.mixWeight, `${tier.id}.mixWeight`);
  }

  for (const milestone of input.milestones ?? []) {
    assertNonNegativeSafeInteger(milestone.unlockAmountKrw, `${milestone.id}.unlockAmountKrw`);
    assertNonNegativeSafeInteger(milestone.additionalFixedCostKrw ?? 0, `${milestone.id}.additionalFixedCostKrw`);
    assertNonNegativeSafeInteger(milestone.additionalUnitCostKrw ?? 0, `${milestone.id}.additionalUnitCostKrw`);
  }
}

function computeFeeBreakdown(grossKrw: number, feePolicy: FundingFeePolicyBps) {
  const platformFeeKrw = multiplyKrwByBps(grossKrw, feePolicy.platformFeeBps);
  const paymentFeeKrw = multiplyKrwByBps(grossKrw, feePolicy.paymentFeeBps);
  const feeVatKrw = multiplyKrwByBps(platformFeeKrw + paymentFeeKrw, feePolicy.feeVatBps ?? 0);
  const contingencyReserveKrw = multiplyKrwByBps(grossKrw, feePolicy.contingencyReserveBps);
  return { platformFeeKrw, paymentFeeKrw, feeVatKrw, contingencyReserveKrw };
}

function estimateSingleUnitContributionKrw(tier: FundingRewardTierInput, feePolicy: FundingFeePolicyBps): number {
  const fees = computeFeeBreakdown(tier.priceKrw, feePolicy);
  return (
    tier.priceKrw
    - fees.platformFeeKrw
    - fees.paymentFeeKrw
    - fees.feeVatKrw
    - fees.contingencyReserveKrw
    - tier.unitProductionCostKrw
    - tier.unitShippingCostKrw
  );
}

function computeStandaloneTierBep(
  tier: FundingRewardTierInput,
  fixedCostKrw: number,
  feePolicy: FundingFeePolicyBps,
): number | null {
  if (fixedCostKrw === 0) return 0;
  const approxUnitMargin = estimateSingleUnitContributionKrw(tier, feePolicy);
  if (approxUnitMargin <= 0) return null;

  const netForCount = (count: number): number => {
    const gross = tier.priceKrw * count;
    const fees = computeFeeBreakdown(gross, feePolicy);
    const variableCost = (tier.unitProductionCostKrw + tier.unitShippingCostKrw) * count;
    return gross - fees.platformFeeKrw - fees.paymentFeeKrw - fees.feeVatKrw - fees.contingencyReserveKrw - variableCost - fixedCostKrw;
  };

  const stockCap = tier.maxStockCount ?? Number.MAX_SAFE_INTEGER;
  let high = Math.min(stockCap, Math.max(1, Math.ceil(fixedCostKrw / approxUnitMargin) + 2));
  while (netForCount(high) < 0) {
    if (high >= stockCap) return null;
    high = Math.min(stockCap, high * 2);
  }
  let low = 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (netForCount(mid) >= 0) high = mid;
    else low = mid + 1;
  }
  return netForCount(low) >= 0 ? low : null;
}

function computeCampaignSettlement(
  tiers: readonly FundingRewardTierInput[],
  backerCounts: readonly number[],
  fixedCostKrw: number,
  feePolicy: FundingFeePolicyBps,
  milestoneAdditionalFixedCostKrw: number,
  milestoneAdditionalUnitCostPerBackerKrw: number,
): CampaignIntegerSettlement {
  const grossByTier = tiers.map((tier, index) => tier.priceKrw * (backerCounts[index] ?? 0));
  let totalBackers = 0;
  let grossFundingKrw = 0;
  let totalProductionCostKrw = 0;
  let totalShippingCostKrw = 0;

  for (let i = 0; i < tiers.length; i += 1) {
    const tier = tiers[i];
    const count = backerCounts[i] ?? 0;
    if (!tier) continue;
    totalBackers += count;
    grossFundingKrw += grossByTier[i] ?? 0;
    totalProductionCostKrw += tier.unitProductionCostKrw * count;
    totalShippingCostKrw += tier.unitShippingCostKrw * count;
  }

  const fees = computeFeeBreakdown(grossFundingKrw, feePolicy);
  const milestoneAdditionalUnitCostKrw = milestoneAdditionalUnitCostPerBackerKrw * totalBackers;
  const allocPlatform = allocateIntegerProportionally(fees.platformFeeKrw, grossByTier);
  const allocPayment = allocateIntegerProportionally(fees.paymentFeeKrw, grossByTier);
  const allocVat = allocateIntegerProportionally(fees.feeVatKrw, grossByTier);
  const allocReserve = allocateIntegerProportionally(fees.contingencyReserveKrw, grossByTier);

  const tierBreakdowns: TierSettlementBreakdown[] = [];
  let sumGross = 0;
  let sumPlatform = 0;
  let sumPayment = 0;
  let sumVat = 0;
  let sumReserve = 0;
  let sumContribution = 0;

  for (let i = 0; i < tiers.length; i += 1) {
    const tier = tiers[i];
    if (!tier) continue;
    const count = backerCounts[i] ?? 0;
    const gross = grossByTier[i] ?? 0;
    const pFee = allocPlatform[i] ?? 0;
    const pgFee = allocPayment[i] ?? 0;
    const vat = allocVat[i] ?? 0;
    const res = allocReserve[i] ?? 0;
    const prodCost = tier.unitProductionCostKrw * count;
    const shipCost = tier.unitShippingCostKrw * count;
    const contribution = gross - pFee - pgFee - vat - res - prodCost - shipCost;
    const estimatedUnitContributionKrw = estimateSingleUnitContributionKrw(tier, feePolicy);

    sumGross += gross;
    sumPlatform += pFee;
    sumPayment += pgFee;
    sumVat += vat;
    sumReserve += res;
    sumContribution += contribution;

    tierBreakdowns.push({
      tierId: tier.id,
      name: tier.name,
      priceKrw: tier.priceKrw,
      backerCount: count,
      grossKrw: gross,
      allocatedPlatformFeeKrw: pFee,
      allocatedPaymentFeeKrw: pgFee,
      allocatedFeeVatKrw: vat,
      allocatedContingencyReserveKrw: res,
      productionCostKrw: prodCost,
      shippingCostKrw: shipCost,
      contributionProfitKrw: contribution,
      estimatedUnitContributionKrw,
      standaloneBreakEvenBackers: computeStandaloneTierBep(tier, fixedCostKrw, feePolicy),
      negativeMarginWarning: estimatedUnitContributionKrw <= 0,
    });
  }

  const totalDeductionsWithoutFixed =
    fees.platformFeeKrw
    + fees.paymentFeeKrw
    + fees.feeVatKrw
    + fees.contingencyReserveKrw
    + totalProductionCostKrw
    + totalShippingCostKrw;
  const totalCostAndDeductionsKrw =
    totalDeductionsWithoutFixed + fixedCostKrw + milestoneAdditionalFixedCostKrw + milestoneAdditionalUnitCostKrw;
  const netCreatorProfitKrw = grossFundingKrw - totalCostAndDeductionsKrw;

  const tierAllocationErrorKrw =
    Math.abs(sumGross - grossFundingKrw)
    + Math.abs(sumPlatform - fees.platformFeeKrw)
    + Math.abs(sumPayment - fees.paymentFeeKrw)
    + Math.abs(sumVat - fees.feeVatKrw)
    + Math.abs(sumReserve - fees.contingencyReserveKrw)
    + Math.abs(sumContribution - (grossFundingKrw - totalDeductionsWithoutFixed));

  return {
    totalBackers,
    grossFundingKrw,
    ...fees,
    totalProductionCostKrw,
    totalShippingCostKrw,
    milestoneAdditionalFixedCostKrw,
    milestoneAdditionalUnitCostKrw,
    fixedCostKrw,
    totalCostAndDeductionsKrw,
    netCreatorProfitKrw,
    reconciliationErrorKrw: grossFundingKrw - (totalCostAndDeductionsKrw + netCreatorProfitKrw),
    tierAllocationErrorKrw,
    tierBreakdowns,
  };
}

function resolveMixWeights(tiers: readonly FundingRewardTierInput[]): number[] {
  const explicit = tiers.map((tier) => tier.mixWeight ?? 0);
  if (explicit.some((w) => w > 0)) return explicit;
  const planned = tiers.map((tier) => tier.plannedBackerCount);
  if (planned.some((w) => w > 0)) return planned;
  return tiers.map(() => 1);
}

/** 재고 상한(maxStockCount)을 지키면서 전체 후원자 수를 티어 비중대로 정수 배분한다. */
function distributeBackersWithCaps(
  totalBackers: number,
  tiers: readonly FundingRewardTierInput[],
  weights: readonly number[],
): number[] {
  const counts = new Array<number>(tiers.length).fill(0);
  let remaining = totalBackers;
  const active = tiers.map((tier, idx) => (weights[idx] ?? 0) > 0 && (tier.maxStockCount ?? Infinity) > 0);

  while (remaining > 0) {
    const activeWeights = weights.map((w, idx) => (active[idx] ? w : 0));
    if (!activeWeights.some((w) => w > 0)) break;
    const batch = allocateIntegerProportionally(remaining, activeWeights);
    let overflow = 0;
    for (let i = 0; i < tiers.length; i += 1) {
      if (!active[i]) continue;
      const cap = tiers[i]?.maxStockCount;
      const candidate = (counts[i] ?? 0) + (batch[i] ?? 0);
      if (cap !== undefined && candidate >= cap) {
        overflow += candidate - cap;
        counts[i] = cap;
        active[i] = false;
      } else {
        counts[i] = candidate;
      }
    }
    if (overflow === 0) break;
    remaining = overflow;
  }
  return counts;
}

function maxTotalStockCapacity(tiers: readonly FundingRewardTierInput[], weights: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < tiers.length; i += 1) {
    if ((weights[i] ?? 0) <= 0) continue;
    const cap = tiers[i]?.maxStockCount;
    if (cap === undefined) return Number.MAX_SAFE_INTEGER;
    sum += cap;
  }
  return sum;
}

function solveBreakEven(input: FanFundingPlanInput, mixWeights: readonly number[]): BreakEvenAnalysis {
  const { tiers, fixedCostKrw, feePolicy, targetFundingKrw } = input;
  const maxStock = maxTotalStockCapacity(tiers, mixWeights);
  const settleAt = (totalBackers: number) =>
    computeCampaignSettlement(tiers, distributeBackersWithCaps(totalBackers, tiers, mixWeights), fixedCostKrw, feePolicy, 0, 0);

  if (fixedCostKrw === 0) {
    return {
      reachable: true,
      breakEvenBackers: 0,
      breakEvenGrossKrw: 0,
      netProfitAtBreakEvenKrw: 0,
      isTargetAboveBep: true,
      targetShortfallToBepKrw: 0,
      tierCountsAtBreakEven: Object.fromEntries(tiers.map((tier) => [tier.id, 0])),
    };
  }

  const probeBackers = Math.min(maxStock, 100);
  if (probeBackers === 0 || settleAt(probeBackers).netCreatorProfitKrw <= settleAt(0).netCreatorProfitKrw) {
    return UNREACHABLE_BEP;
  }

  let high = Math.min(maxStock, 1);
  let settledHigh = settleAt(high);
  while (settledHigh.netCreatorProfitKrw < 0) {
    if (high >= maxStock || high > 10_000_000) return UNREACHABLE_BEP;
    const nextHigh = Math.min(maxStock, high * 2);
    const nextSettled = settleAt(nextHigh);
    if (nextSettled.netCreatorProfitKrw <= settledHigh.netCreatorProfitKrw) return UNREACHABLE_BEP;
    high = nextHigh;
    settledHigh = nextSettled;
  }

  let low = 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (settleAt(mid).netCreatorProfitKrw >= 0) high = mid;
    else low = mid + 1;
  }

  let exactBep = low;
  while (exactBep > 1 && settleAt(exactBep - 1).netCreatorProfitKrw >= 0) exactBep -= 1;

  const bepCounts = distributeBackersWithCaps(exactBep, tiers, mixWeights);
  const bepSettlement = computeCampaignSettlement(tiers, bepCounts, fixedCostKrw, feePolicy, 0, 0);
  return {
    reachable: true,
    breakEvenBackers: exactBep,
    breakEvenGrossKrw: bepSettlement.grossFundingKrw,
    netProfitAtBreakEvenKrw: bepSettlement.netCreatorProfitKrw,
    isTargetAboveBep: targetFundingKrw >= bepSettlement.grossFundingKrw,
    targetShortfallToBepKrw: Math.max(0, bepSettlement.grossFundingKrw - targetFundingKrw),
    tierCountsAtBreakEven: Object.fromEntries(tiers.map((tier, index) => [tier.id, bepCounts[index] ?? 0])),
  };
}

function findBackersForTargetGross(
  targetGrossKrw: number,
  tiers: readonly FundingRewardTierInput[],
  mixWeights: readonly number[],
): { readonly backers: number; readonly counts: number[] } | null {
  if (targetGrossKrw === 0) return { backers: 0, counts: tiers.map(() => 0) };
  const maxStock = maxTotalStockCapacity(tiers, mixWeights);
  const grossFor = (count: number) => {
    const counts = distributeBackersWithCaps(count, tiers, mixWeights);
    let grossKrw = 0;
    for (let i = 0; i < tiers.length; i += 1) grossKrw += (tiers[i]?.priceKrw ?? 0) * (counts[i] ?? 0);
    return { counts, grossKrw };
  };

  let high = Math.min(maxStock, 1);
  let highState = grossFor(high);
  while (highState.grossKrw < targetGrossKrw) {
    if (high >= maxStock || high > 10_000_000) return null;
    const nextHigh = Math.min(maxStock, high * 2);
    const nextState = grossFor(nextHigh);
    if (nextState.grossKrw <= highState.grossKrw) return null;
    high = nextHigh;
    highState = nextState;
  }
  let low = 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (grossFor(mid).grossKrw >= targetGrossKrw) high = mid;
    else low = mid + 1;
  }
  return { backers: low, counts: grossFor(low).counts };
}

/** 단행본·굿즈 펀딩 계획의 정수 정산, BEP 손익분기, 스트레치 마일스톤 수익성을 일괄 산출한다. */
export function planFanFundingMilestones(input: FanFundingPlanInput): FanFundingMilestonePlanResult {
  validatePlanInput(input);
  const sortedMilestones = [...(input.milestones ?? [])].sort((a, b) =>
    a.unlockAmountKrw !== b.unlockAmountKrw ? a.unlockAmountKrw - b.unlockAmountKrw : a.id.localeCompare(b.id),
  );
  const plannedCounts = input.tiers.map((tier) => tier.plannedBackerCount);
  const preliminaryPlannedGross = input.tiers.reduce(
    (sum, tier, idx) => sum + tier.priceKrw * (plannedCounts[idx] ?? 0),
    0,
  );

  let plannedMilestoneFixed = 0;
  let plannedMilestoneUnit = 0;
  for (const m of sortedMilestones) {
    if (preliminaryPlannedGross >= m.unlockAmountKrw) {
      plannedMilestoneFixed += m.additionalFixedCostKrw ?? 0;
      plannedMilestoneUnit += m.additionalUnitCostKrw ?? 0;
    }
  }

  const plannedSettlement = computeCampaignSettlement(
    input.tiers,
    plannedCounts,
    input.fixedCostKrw,
    input.feePolicy,
    plannedMilestoneFixed,
    plannedMilestoneUnit,
  );
  const mixWeights = resolveMixWeights(input.tiers);
  const breakEven = solveBreakEven(input, mixWeights);
  const warnings: string[] = [];

  for (const tier of plannedSettlement.tierBreakdowns) {
    if (tier.negativeMarginWarning) {
      warnings.push(
        `리워드 "${tier.name}"의 개당 공헌이익이 ${tier.estimatedUnitContributionKrw.toLocaleString("ko-KR")}원으로 역마진입니다.`,
      );
    }
  }
  if (!breakEven.reachable) {
    warnings.push("현재 리워드 단가·재고·수수료 구조로는 고정비 손익분기(BEP)에 도달할 수 없습니다.");
  } else if (!breakEven.isTargetAboveBep) {
    warnings.push(
      `공개 목표액(${input.targetFundingKrw.toLocaleString("ko-KR")}원)이 BEP(${(breakEven.breakEvenGrossKrw ?? 0).toLocaleString("ko-KR")}원)보다 ${breakEven.targetShortfallToBepKrw.toLocaleString("ko-KR")}원 낮습니다.`,
    );
  }

  const milestones: MilestoneEvaluation[] = [];
  let cumulativeFixed = 0;
  let cumulativeUnit = 0;

  for (const milestone of sortedMilestones) {
    cumulativeFixed += milestone.additionalFixedCostKrw ?? 0;
    cumulativeUnit += milestone.additionalUnitCostKrw ?? 0;
    const unlockReach = findBackersForTargetGross(milestone.unlockAmountKrw, input.tiers, mixWeights);

    if (!unlockReach) {
      milestones.push({
        id: milestone.id,
        title: milestone.title,
        unlockAmountKrw: milestone.unlockAmountKrw,
        unlockedByPlannedFunding: preliminaryPlannedGross >= milestone.unlockAmountKrw,
        backersRequiredToUnlock: null,
        grossAtUnlockKrw: null,
        cumulativeAdditionalFixedCostKrw: cumulativeFixed,
        cumulativeAdditionalUnitCostPerBackerKrw: cumulativeUnit,
        netProfitAtUnlockKrw: null,
        marginTrapDetected: true,
        reconciliationErrorKrw: 0,
      });
      warnings.push(`마일스톤 "${milestone.title}" 해금액에 도달하기 전에 리워드 재고가 소진됩니다.`);
      continue;
    }

    const settled = computeCampaignSettlement(
      input.tiers,
      unlockReach.counts,
      input.fixedCostKrw,
      input.feePolicy,
      cumulativeFixed,
      cumulativeUnit,
    );
    const marginTrapDetected = settled.netCreatorProfitKrw < 0;
    if (marginTrapDetected) {
      warnings.push(
        `마일스톤 "${milestone.title}"(${milestone.unlockAmountKrw.toLocaleString("ko-KR")}원)은 특전 원가로 인해 달성 직후 ${settled.netCreatorProfitKrw.toLocaleString("ko-KR")}원 적자가 발생합니다.`,
      );
    }
    milestones.push({
      id: milestone.id,
      title: milestone.title,
      unlockAmountKrw: milestone.unlockAmountKrw,
      unlockedByPlannedFunding: preliminaryPlannedGross >= milestone.unlockAmountKrw,
      backersRequiredToUnlock: unlockReach.backers,
      grossAtUnlockKrw: settled.grossFundingKrw,
      cumulativeAdditionalFixedCostKrw: cumulativeFixed,
      cumulativeAdditionalUnitCostPerBackerKrw: cumulativeUnit,
      netProfitAtUnlockKrw: settled.netCreatorProfitKrw,
      marginTrapDetected,
      reconciliationErrorKrw: settled.reconciliationErrorKrw,
    });
  }

  return {
    projectTitle: input.projectTitle.trim(),
    targetFundingKrw: input.targetFundingKrw,
    plannedSettlement,
    breakEven,
    milestones,
    warnings,
    summaryLines: [
      `계획 모금액 ${plannedSettlement.grossFundingKrw.toLocaleString("ko-KR")}원 (${plannedSettlement.totalBackers}명) · 순수익 ${plannedSettlement.netCreatorProfitKrw.toLocaleString("ko-KR")}원`,
      breakEven.reachable
        ? `손익분기(BEP) ${breakEven.breakEvenBackers ?? 0}명 · ${(breakEven.breakEvenGrossKrw ?? 0).toLocaleString("ko-KR")}원`
        : "손익분기(BEP) 도달 불가 — 단가·고정비 조정 필요",
      `정수 정산 검증 오차 ${plannedSettlement.reconciliationErrorKrw}원 (티어 배분 오차 ${plannedSettlement.tierAllocationErrorKrw}원)`,
    ],
  };
}
