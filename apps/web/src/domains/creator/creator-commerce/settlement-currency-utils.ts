/**
 * 다중 통화(KRW/USD/JPY/EUR) 정산 타입 계약 및 정수 화폐 단위·환율 변환 유틸리티.
 *
 * `royalty-settlement-calculator.ts`와 `settlement-statement-printable.ts`가
 * 순환 참조 없이 공유하는 순수 도메인 모듈이다.
 */

export const ROYALTY_SETTLEMENT_SCHEMA_VERSION = "toonstudio.royalty-settlement.v1" as const;

export const SUPPORTED_SETTLEMENT_CURRENCIES = ["KRW", "USD", "JPY", "EUR"] as const;
export type SettlementCurrency = (typeof SUPPORTED_SETTLEMENT_CURRENCIES)[number];

export interface CurrencySpec {
  readonly code: SettlementCurrency;
  readonly symbol: string;
  readonly minorDecimals: number;
  readonly minorUnitFactor: number;
  readonly labelKo: string;
}

export const CURRENCY_SPECS: Readonly<Record<SettlementCurrency, CurrencySpec>> = Object.freeze({
  KRW: Object.freeze({ code: "KRW", symbol: "₩", minorDecimals: 0, minorUnitFactor: 1, labelKo: "원화(KRW)" }),
  USD: Object.freeze({ code: "USD", symbol: "$", minorDecimals: 2, minorUnitFactor: 100, labelKo: "미국 달러(USD)" }),
  JPY: Object.freeze({ code: "JPY", symbol: "¥", minorDecimals: 0, minorUnitFactor: 1, labelKo: "일본 엔(JPY)" }),
  EUR: Object.freeze({ code: "EUR", symbol: "€", minorDecimals: 2, minorUnitFactor: 100, labelKo: "유로(EUR)" }),
});

/**
 * 기준 환율 스냅샷 (1 주요 화폐 단위당 KRW 기준값).
 * 호출 시 `fxKrwPerMajor`로 정산일 고시 환율을 주입해 재정의할 수 있다.
 */
export const DEFAULT_FX_KRW_PER_MAJOR: Readonly<Record<SettlementCurrency, number>> = Object.freeze({
  KRW: 1,
  USD: 1380,
  JPY: 9.2,
  EUR: 1490,
});

export type RevenueStreamKind = "serial-episode" | "subscription-pool" | "marketplace-sales";

export type TeamContributorRole =
  | "story" | "storyboard" | "lineart" | "coloring" | "background-3d" | "lettering" | "assistant" | "producer";

export type TaxWithholdingProfile = "kr-freelancer-3.3" | "kr-corporate-0" | "non-resident-treaty";

export const DEFAULT_WITHHOLDING_BPS: Readonly<Record<TaxWithholdingProfile, number>> = Object.freeze({
  "kr-freelancer-3.3": 330,
  "kr-corporate-0": 0,
  "non-resident-treaty": 1000,
});

export const DEFAULT_ROLE_CUT_WEIGHTS: Readonly<Record<TeamContributorRole, number>> = Object.freeze({
  story: 1.0,
  storyboard: 1.15,
  lineart: 1.35,
  coloring: 1.2,
  "background-3d": 1.05,
  lettering: 0.75,
  assistant: 0.85,
  producer: 0.9,
});

export interface RevenueStreamInput {
  readonly streamId: string;
  readonly kind: RevenueStreamKind;
  readonly label: string;
  readonly currency: SettlementCurrency;
  /** 해당 통화의 최소 화폐 단위 정수 (KRW/JPY: 원/엔, USD/EUR: 센트). */
  readonly grossAmountMinor: number;
  /** 플랫폼 수수료율(basis points, 10000 = 100%). 미지정 시 기본값(연재 1500, 구독 1200, 마켓 1000). */
  readonly platformFeeRateBps?: number;
  /** 직접 귀속 대상(예: 마켓 에셋 개별 판매자 ID). 지정하면 팀 풀이 아닌 해당 수취인에게 직접 정산된다. */
  readonly directRecipientId?: string;
  readonly directRecipientName?: string;
  readonly directRecipientTaxProfile?: TaxWithholdingProfile;
  readonly directRecipientCustomTaxBps?: number;
}

export interface RightsBomRoyaltyInput {
  readonly assetId: string;
  readonly assetName: string;
  readonly assetKind: "3d-scene" | "3d-prop" | "brush-preset" | "font" | "texture-pattern" | "audio-track";
  readonly sellerId: string;
  readonly sellerName: string;
  readonly royaltyModel: "rate-bps" | "flat-minor" | "cut-proportional";
  /** `rate-bps` 또는 `cut-proportional` 모델에서 분배 가능 연재·구독 수익 대비 기준 로열티(bps). */
  readonly royaltyRateBps?: number;
  /** `flat-minor` 모델에서 회차당 정액 로열티(최소 화폐 단위). */
  readonly flatAmountMinor?: number;
  readonly flatCurrency?: SettlementCurrency;
  /** `cut-proportional` 모델에서 실제 사용 컷 수. */
  readonly usedCutCount?: number;
  readonly taxProfile?: TaxWithholdingProfile;
  readonly customWithholdingBps?: number;
}

export interface TeamContributorInput {
  readonly memberId: string;
  readonly memberName: string;
  readonly role: TeamContributorRole;
  /** 명시적 지분(basis points). `allocationMode`가 `explicit-bps` 또는 `hybrid`일 때 반영한다. */
  readonly shareBps?: number;
  /** 담당 완료 컷 수. `cut-weighted` 또는 `hybrid` 모드에서 가중치 산정에 사용한다. */
  readonly completedCuts?: number;
  /** 역할 가중치 배수(기본값은 역할별 `DEFAULT_ROLE_CUT_WEIGHTS`). */
  readonly roleWeightMultiplier?: number;
  /** 구독 수익 풀 별도 배분 가중치(미지정 시 팀 분업 유효 가중치와 동일). */
  readonly subscriptionWeight?: number;
  readonly taxProfile?: TaxWithholdingProfile;
  readonly customWithholdingBps?: number;
}

export interface RoyaltySettlementRequest {
  readonly settlementId: string;
  readonly seriesId: string;
  readonly episodeId: string;
  readonly periodLabel: string;
  readonly settlementCurrency: SettlementCurrency;
  readonly totalEpisodeCuts: number;
  readonly streams: readonly RevenueStreamInput[];
  readonly teamContributors: readonly TeamContributorInput[];
  readonly rightsBomRoyalties?: readonly RightsBomRoyaltyInput[];
  readonly allocationMode?: "explicit-bps" | "cut-weighted" | "hybrid";
  /** Rights BOM 로열티 상한(연재·구독 분배 풀 대비 bps, 기본 4000 = 40%). */
  readonly maxRightsBomCapBps?: number;
  readonly fxKrwPerMajor?: Readonly<Partial<Record<SettlementCurrency, number>>>;
  readonly generatedAtIso?: string;
}

export interface SettledRevenueStreamLine {
  readonly streamId: string;
  readonly kind: RevenueStreamKind;
  readonly label: string;
  readonly sourceCurrency: SettlementCurrency;
  readonly sourceGrossMinor: number;
  readonly fxRateApplied: number;
  readonly convertedGrossMinor: number;
  readonly platformFeeRateBps: number;
  readonly platformFeeMinor: number;
  readonly distributableMinor: number;
  readonly directRecipientId: string | null;
}

export interface RoyaltyRecipientEntry {
  readonly recipientId: string;
  readonly recipientName: string;
  readonly categories: readonly ("team" | "rights-bom" | "marketplace-direct")[];
  readonly primaryRoleLabel: string;
  readonly effectiveShareBps: number;
  readonly teamContributionMinor: number;
  readonly subscriptionShareMinor: number;
  readonly rightsBomRoyaltyMinor: number;
  readonly marketplaceDirectMinor: number;
  readonly grossAllocationMinor: number;
  readonly roundingAdjustmentMinor: number;
  readonly taxProfile: TaxWithholdingProfile;
  readonly withholdingRateBps: number;
  readonly incomeTaxMinor: number;
  readonly localIncomeTaxMinor: number;
  readonly withholdingTaxMinor: number;
  readonly netPayoutMinor: number;
}

export interface SettlementReconciliationProof {
  readonly totalGrossMinor: number;
  readonly totalPlatformFeeMinor: number;
  readonly totalDistributableMinor: number;
  readonly totalRightsBomMinor: number;
  readonly totalTeamContributionMinor: number;
  readonly totalSubscriptionShareMinor: number;
  readonly totalMarketplaceDirectMinor: number;
  readonly totalAllocatedGrossMinor: number;
  readonly totalWithholdingTaxMinor: number;
  readonly totalNetPayoutMinor: number;
  readonly roundingErrorMinor: number;
  readonly platformFeeBalanceErrorMinor: number;
  readonly taxPayoutBalanceErrorMinor: number;
  readonly balanced: boolean;
}

export interface RoyaltySettlementLedger {
  readonly schemaVersion: typeof ROYALTY_SETTLEMENT_SCHEMA_VERSION;
  readonly settlementId: string;
  readonly seriesId: string;
  readonly episodeId: string;
  readonly periodLabel: string;
  readonly generatedAtIso: string;
  readonly settlementCurrency: SettlementCurrency;
  readonly fxSnapshotKrwPerMajor: Readonly<Record<SettlementCurrency, number>>;
  readonly streams: readonly SettledRevenueStreamLine[];
  readonly recipients: readonly RoyaltyRecipientEntry[];
  readonly reconciliation: SettlementReconciliationProof;
  readonly ledgerFingerprint: string;
}

export function assertNonNegativeSafeInteger(value: number, fieldName: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${fieldName} 값은 0 이상의 안전한 정수여야 합니다: ${String(value)}`);
  }
  return value;
}

export function assertBpsRange(value: number, fieldName: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 10_000) {
    throw new Error(`${fieldName} 값은 0~10000 bps 범위여야 합니다: ${String(value)}`);
  }
  return Math.round(value);
}

export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5 + 1e-12);
}

export function toMinorUnits(majorAmount: number, currency: SettlementCurrency): number {
  if (!Number.isFinite(majorAmount) || majorAmount < 0) {
    throw new Error(`금액이 유효하지 않습니다: ${String(majorAmount)}`);
  }
  const factor = CURRENCY_SPECS[currency].minorUnitFactor;
  return roundHalfUp(majorAmount * factor);
}

export function fromMinorUnits(minorAmount: number, currency: SettlementCurrency): number {
  const factor = CURRENCY_SPECS[currency].minorUnitFactor;
  return minorAmount / factor;
}

export function formatCurrencyMinor(minorAmount: number, currency: SettlementCurrency): string {
  const spec = CURRENCY_SPECS[currency];
  const sign = minorAmount < 0 ? "-" : "";
  const absMinor = Math.abs(Math.trunc(minorAmount));
  if (spec.minorDecimals === 0) {
    return `${sign}${spec.symbol}${absMinor.toLocaleString("en-US")}`;
  }
  const majorPart = Math.floor(absMinor / spec.minorUnitFactor);
  const minorPart = String(absMinor % spec.minorUnitFactor).padStart(spec.minorDecimals, "0");
  return `${sign}${spec.symbol}${majorPart.toLocaleString("en-US")}.${minorPart}`;
}

export function resolveFxTable(
  overrides?: Readonly<Partial<Record<SettlementCurrency, number>>>,
): Readonly<Record<SettlementCurrency, number>> {
  const merged: Record<SettlementCurrency, number> = {
    KRW: overrides?.KRW ?? DEFAULT_FX_KRW_PER_MAJOR.KRW,
    USD: overrides?.USD ?? DEFAULT_FX_KRW_PER_MAJOR.USD,
    JPY: overrides?.JPY ?? DEFAULT_FX_KRW_PER_MAJOR.JPY,
    EUR: overrides?.EUR ?? DEFAULT_FX_KRW_PER_MAJOR.EUR,
  };
  for (const currency of SUPPORTED_SETTLEMENT_CURRENCIES) {
    const rate = merged[currency];
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(`${currency} 환율은 0보다 커야 합니다.`);
    }
  }
  return Object.freeze(merged);
}

export function convertCurrencyMinor(
  sourceMinor: number,
  sourceCurrency: SettlementCurrency,
  targetCurrency: SettlementCurrency,
  fxTable: Readonly<Record<SettlementCurrency, number>> = DEFAULT_FX_KRW_PER_MAJOR,
): { readonly convertedMinor: number; readonly effectiveMajorRate: number } {
  assertNonNegativeSafeInteger(sourceMinor, "sourceMinor");
  if (sourceCurrency === targetCurrency) {
    return { convertedMinor: sourceMinor, effectiveMajorRate: 1 };
  }
  const sourceSpec = CURRENCY_SPECS[sourceCurrency];
  const targetSpec = CURRENCY_SPECS[targetCurrency];
  const majorRate = fxTable[sourceCurrency] / fxTable[targetCurrency];
  const sourceMajor = sourceMinor / sourceSpec.minorUnitFactor;
  const targetExactMinor = sourceMajor * majorRate * targetSpec.minorUnitFactor;
  return {
    convertedMinor: roundHalfUp(targetExactMinor),
    effectiveMajorRate: Math.round(majorRate * 1_000_000) / 1_000_000,
  };
}
