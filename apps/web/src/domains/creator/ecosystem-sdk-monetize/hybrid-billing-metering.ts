/**
 * 구독형 플랜 + 선택형 종량제 크레딧 하이브리드 요금·쿼터 미터링 엔진.
 * free-starter(₩0 영구 무료) 및 로컬·무료 AI 경로는 항상 0 크레딧 소비 불변식을 강제한다.
 */

import { canonicalJson, sha256Hex } from "./deterministic-sha256";

export type SubscriptionTierId = "free-starter" | "creator-pro" | "studio-team";
export type BillingCycle = "monthly" | "annual";
export type CreditPackId = "pack-lite-100" | "pack-boost-500" | "pack-studio-2000";
export type HybridOperationId =
  | "local-canvas-edit"
  | "local-opfs-backup"
  | "free-local-ai-assist"
  | "local-export-standard"
  | "cloud-fast-batch-render"
  | "cloud-extra-storage-10gb"
  | "cloud-4k-print-upscale";

export interface SubscriptionPlanSpec {
  readonly id: SubscriptionTierId;
  readonly nameKo: string;
  readonly monthlyPriceKrw: number;
  readonly annualMonthlyEquivalentKrw: number;
  readonly includedMonthlyCredits: number;
  readonly cloudStorageGb: number;
  readonly includedSeats: number;
  readonly summaryKo: string;
}

export const SUBSCRIPTION_PLANS: readonly SubscriptionPlanSpec[] = Object.freeze([
  {
    id: "free-starter",
    nameKo: "무료 스타터 (₩0 영구 무료)",
    monthlyPriceKrw: 0,
    annualMonthlyEquivalentKrw: 0,
    includedMonthlyCredits: 0,
    cloudStorageGb: 2,
    includedSeats: 1,
    summaryKo: "로컬 캔버스·OPFS 저장·표준 내보내기·무료 AI 보조를 크레딧 차감 없이 무제한 사용합니다.",
  },
  {
    id: "creator-pro",
    nameKo: "크리에이터 프로",
    monthlyPriceKrw: 14900,
    annualMonthlyEquivalentKrw: 11900,
    includedMonthlyCredits: 300,
    cloudStorageGb: 100,
    includedSeats: 1,
    summaryKo: "개인 연재 작가를 위한 고속 클라우드 배치 크레딧 300과 100GB 클라우드 아카이브를 제공합니다.",
  },
  {
    id: "studio-team",
    nameKo: "스튜디오 팀",
    monthlyPriceKrw: 49000,
    annualMonthlyEquivalentKrw: 39200,
    includedMonthlyCredits: 1500,
    cloudStorageGb: 1000,
    includedSeats: 5,
    summaryKo: "5인 분업 스튜디오 기준 월 1,500 크레딧과 1TB 아카이브, 우선 배치 큐를 제공합니다.",
  },
]);

export interface CreditPackSpec {
  readonly id: CreditPackId;
  readonly nameKo: string;
  readonly credits: number;
  readonly priceKrw: number;
  readonly descriptionKo: string;
}

export const CREDIT_PACK_CATALOG: readonly CreditPackSpec[] = Object.freeze([
  {
    id: "pack-lite-100",
    nameKo: "라이트 100 크레딧 팩",
    credits: 100,
    priceKrw: 4900,
    descriptionKo: "마감 직전 단발성 고속 배치나 4K 인쇄 업스케일에 적합합니다.",
  },
  {
    id: "pack-boost-500",
    nameKo: "부스트 500 크레딧 팩",
    credits: 500,
    priceKrw: 19900,
    descriptionKo: "다회차 동시 렌더링과 추가 아카이브 스토리지 확장에 적합합니다.",
  },
  {
    id: "pack-studio-2000",
    nameKo: "스튜디오 2,000 크레딧 팩",
    credits: 2000,
    priceKrw: 69000,
    descriptionKo: "시즌 런칭·단행본 대량 마감용 대용량 종량제 팩입니다.",
  },
]);

export interface HybridOperationSpec {
  readonly id: HybridOperationId;
  readonly labelKo: string;
  readonly category: "local-free" | "cloud-metered";
  readonly guaranteedZeroCredit: boolean;
  readonly unitCredits: number;
  readonly freeAlternativeKo: string;
}

export const HYBRID_OPERATION_CATALOG: readonly HybridOperationSpec[] = Object.freeze([
  {
    id: "local-canvas-edit",
    labelKo: "로컬 캔버스 드로잉·레이어 편집",
    category: "local-free",
    guaranteedZeroCredit: true,
    unitCredits: 0,
    freeAlternativeKo: "항상 ₩0 무제한 로컬 실행",
  },
  {
    id: "local-opfs-backup",
    labelKo: "OPFS/SQLite 로컬 자동 저장·복구",
    category: "local-free",
    guaranteedZeroCredit: true,
    unitCredits: 0,
    freeAlternativeKo: "항상 ₩0 무제한 로컬 실행",
  },
  {
    id: "free-local-ai-assist",
    labelKo: "무료 로컬 AI 컷·대사·배치 보조",
    category: "local-free",
    guaranteedZeroCredit: true,
    unitCredits: 0,
    freeAlternativeKo: "항상 ₩0 무제한 로컬/무료 AI 실행",
  },
  {
    id: "local-export-standard",
    labelKo: "로컬 웹툰 컷 분할·표준 내보내기",
    category: "local-free",
    guaranteedZeroCredit: true,
    unitCredits: 0,
    freeAlternativeKo: "항상 ₩0 무제한 로컬 실행",
  },
  {
    id: "cloud-fast-batch-render",
    labelKo: "클라우드 고속 일괄 렌더링 (회차당)",
    category: "cloud-metered",
    guaranteedZeroCredit: false,
    unitCredits: 10,
    freeAlternativeKo: "로컬 표준 내보내기로 ₩0 대체 가능",
  },
  {
    id: "cloud-extra-storage-10gb",
    labelKo: "추가 클라우드 아카이브 스토리지 (+10GB)",
    category: "cloud-metered",
    guaranteedZeroCredit: false,
    unitCredits: 25,
    freeAlternativeKo: "OPFS/SQLite 로컬 백업으로 ₩0 대체 가능",
  },
  {
    id: "cloud-4k-print-upscale",
    labelKo: "단행본 4K 인쇄 일괄 업스케일 (권당)",
    category: "cloud-metered",
    guaranteedZeroCredit: false,
    unitCredits: 15,
    freeAlternativeKo: "로컬 고해상도 내보내기로 ₩0 대체 가능",
  },
]);

export interface HybridUsageEventInput {
  readonly operationId: HybridOperationId;
  readonly quantity: number;
  readonly requestedOverrideCredits?: number;
}

export interface CreditPackPurchaseInput {
  readonly packId: CreditPackId;
  readonly quantity: number;
}

export interface HybridBillingSimulationInput {
  readonly tierId: SubscriptionTierId;
  readonly billingCycle: BillingCycle;
  readonly purchasedPacks: readonly CreditPackPurchaseInput[];
  readonly usageEvents: readonly HybridUsageEventInput[];
}

export interface HybridLedgerEntry {
  readonly operationId: HybridOperationId;
  readonly labelKo: string;
  readonly quantity: number;
  readonly guaranteedZeroCredit: boolean;
  readonly unitCredits: number;
  readonly creditsCharged: number;
  readonly fundingSource:
    | "free-invariant"
    | "subscription-included"
    | "credit-pack"
    | "mixed-included-and-pack"
    | "insufficient-blocked";
  readonly blocked: boolean;
  readonly noteKo: string;
}

export interface HybridBillingLedger {
  readonly tierId: SubscriptionTierId;
  readonly billingCycle: BillingCycle;
  readonly subscriptionMonthlyKrw: number;
  readonly creditPackPurchaseKrw: number;
  readonly totalEstimatedMonthlyKrw: number;
  readonly includedCreditsTotal: number;
  readonly packCreditsTotal: number;
  readonly totalAvailableCredits: number;
  readonly creditsUsed: number;
  readonly creditsRemaining: number;
  readonly freeOperationsCount: number;
  readonly freeOperationsCreditsCharged: number;
  readonly freePathInvariantPassed: boolean;
  readonly blockedOperationsCount: number;
  readonly recommendedPackId: CreditPackId | null;
  readonly entries: readonly HybridLedgerEntry[];
  readonly ledgerDigestSha256: string;
}

export const DEFAULT_USAGE_EVENTS: readonly HybridUsageEventInput[] = Object.freeze([
  { operationId: "local-canvas-edit", quantity: 120 },
  { operationId: "local-opfs-backup", quantity: 48 },
  { operationId: "free-local-ai-assist", quantity: 35 },
  { operationId: "local-export-standard", quantity: 12 },
  { operationId: "cloud-fast-batch-render", quantity: 4 },
  { operationId: "cloud-extra-storage-10gb", quantity: 1 },
]);

/** 구독 + 종량제 크레딧 하이브리드 요금 시뮬레이션. 로컬·무료 AI 경로는 항상 0 크레딧을 불변식으로 보장한다. */
export function simulateHybridBillingLedger(input: HybridBillingSimulationInput): HybridBillingLedger {
  const plan = SUBSCRIPTION_PLANS.find((item) => item.id === input.tierId) ?? SUBSCRIPTION_PLANS[0];
  const subscriptionMonthlyKrw =
    input.billingCycle === "annual" ? plan.annualMonthlyEquivalentKrw : plan.monthlyPriceKrw;

  let packCreditsTotal = 0;
  let creditPackPurchaseKrw = 0;
  for (const purchase of input.purchasedPacks) {
    const qty = Math.max(0, Math.floor(purchase.quantity));
    if (qty === 0) continue;
    const pack = CREDIT_PACK_CATALOG.find((item) => item.id === purchase.packId);
    if (!pack) continue;
    packCreditsTotal += pack.credits * qty;
    creditPackPurchaseKrw += pack.priceKrw * qty;
  }

  let includedRemaining = plan.includedMonthlyCredits;
  let packRemaining = packCreditsTotal;
  let creditsUsed = 0;
  let freeOperationsCount = 0;
  let freeOperationsCreditsCharged = 0;
  let blockedOperationsCount = 0;
  let maxShortfallCredits = 0;
  const entries: HybridLedgerEntry[] = [];

  for (const event of input.usageEvents) {
    const quantity = Math.max(0, Math.floor(event.quantity));
    if (quantity === 0) continue;
    const spec = HYBRID_OPERATION_CATALOG.find((item) => item.id === event.operationId);
    if (!spec) continue;

    if (spec.guaranteedZeroCredit) {
      freeOperationsCount += quantity;
      freeOperationsCreditsCharged += 0;
      entries.push({
        operationId: spec.id,
        labelKo: spec.labelKo,
        quantity,
        guaranteedZeroCredit: true,
        unitCredits: 0,
        creditsCharged: 0,
        fundingSource: "free-invariant",
        blocked: false,
        noteKo: "₩0 영구 무료 경로 보장 (0 크레딧 소비)",
      });
      continue;
    }

    const requiredCredits = spec.unitCredits * quantity;
    const currentTotalRemaining = includedRemaining + packRemaining;
    if (requiredCredits > currentTotalRemaining) {
      blockedOperationsCount += 1;
      maxShortfallCredits += requiredCredits - currentTotalRemaining;
      entries.push({
        operationId: spec.id,
        labelKo: spec.labelKo,
        quantity,
        guaranteedZeroCredit: false,
        unitCredits: spec.unitCredits,
        creditsCharged: 0,
        fundingSource: "insufficient-blocked",
        blocked: true,
        noteKo: `잔여 크레딧 부족(필요 ${requiredCredits} / 잔여 ${currentTotalRemaining}) · 자동 초과 결제 없음 (${spec.freeAlternativeKo})`,
      });
      continue;
    }

    const fromIncluded = Math.min(includedRemaining, requiredCredits);
    const fromPack = requiredCredits - fromIncluded;
    includedRemaining -= fromIncluded;
    packRemaining -= fromPack;
    creditsUsed += requiredCredits;

    const fundingSource: HybridLedgerEntry["fundingSource"] =
      fromIncluded > 0 && fromPack > 0
        ? "mixed-included-and-pack"
        : fromIncluded > 0
          ? "subscription-included"
          : "credit-pack";

    entries.push({
      operationId: spec.id,
      labelKo: spec.labelKo,
      quantity,
      guaranteedZeroCredit: false,
      unitCredits: spec.unitCredits,
      creditsCharged: requiredCredits,
      fundingSource,
      blocked: false,
      noteKo:
        fundingSource === "mixed-included-and-pack"
          ? `구독 기본 ${fromIncluded} + 종량제 팩 ${fromPack} 크레딧 차감`
          : fundingSource === "subscription-included"
            ? `구독 기본 포함 크레딧에서 ${fromIncluded} 차감`
            : `선택 종량제 크레딧 팩에서 ${fromPack} 차감`,
    });
  }

  const recommendedPackId: CreditPackId | null =
    maxShortfallCredits <= 0
      ? null
      : (CREDIT_PACK_CATALOG.find((pack) => pack.credits >= maxShortfallCredits)?.id ?? "pack-studio-2000");

  const totalAvailableCredits = plan.includedMonthlyCredits + packCreditsTotal;
  const creditsRemaining = includedRemaining + packRemaining;
  const totalEstimatedMonthlyKrw = subscriptionMonthlyKrw + creditPackPurchaseKrw;
  const freePathInvariantPassed = freeOperationsCreditsCharged === 0;

  const ledgerDigestSha256 = sha256Hex(
    canonicalJson({
      tierId: plan.id,
      billingCycle: input.billingCycle,
      totalEstimatedMonthlyKrw,
      creditsUsed,
      creditsRemaining,
      freeOperationsCount,
      freeOperationsCreditsCharged,
      blockedOperationsCount,
    }),
  );

  return {
    tierId: plan.id,
    billingCycle: input.billingCycle,
    subscriptionMonthlyKrw,
    creditPackPurchaseKrw,
    totalEstimatedMonthlyKrw,
    includedCreditsTotal: plan.includedMonthlyCredits,
    packCreditsTotal,
    totalAvailableCredits,
    creditsUsed,
    creditsRemaining,
    freeOperationsCount,
    freeOperationsCreditsCharged,
    freePathInvariantPassed,
    blockedOperationsCount,
    recommendedPackId,
    entries,
    ledgerDigestSha256,
  };
}
