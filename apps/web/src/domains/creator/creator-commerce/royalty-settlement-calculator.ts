/**
 * 연재 팀 분업 기여 + Rights BOM 유료 마켓 에셋 로열티 + 구독 수익 배분 정산 원장 엔진.
 *
 * - KRW / USD / JPY / EUR 다통화를 정산 기준 통화의 최소 화폐 단위(정수 minor unit)로 변환한다.
 * - 최대 잉여법(Hamilton Largest-Remainder) + 결정적 동률 해소로 1원(1 minor unit) 반올림 오차 0건을 보장한다.
 * - 플랫폼 수수료, Rights BOM 에셋 로열티, 팀 분업 배분, 원천징수(기본 3.3%: 소득세 3.0% + 지방소득세 0.3%)와
 *   순지급액 항등식을 원장 생성 시 검증해 CSV·JSON 명세서를 산출한다.
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
  "kr-freelancer-3.3": 330, "kr-corporate-0": 0, "non-resident-treaty": 1000,
});

export const DEFAULT_ROLE_CUT_WEIGHTS: Readonly<Record<TeamContributorRole, number>> = Object.freeze({
  story: 1.0, storyboard: 1.15, lineart: 1.35, coloring: 1.2,
  "background-3d": 1.05, lettering: 0.75, assistant: 0.85, producer: 0.9,
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

const DEFAULT_PLATFORM_FEE_BPS: Readonly<Record<RevenueStreamKind, number>> = Object.freeze({
  "serial-episode": 1500,
  "subscription-pool": 1200,
  "marketplace-sales": 1000,
});

function assertNonNegativeSafeInteger(value: number, fieldName: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${fieldName} 값은 0 이상의 안전한 정수여야 합니다: ${String(value)}`);
  }
  return value;
}

function assertBpsRange(value: number, fieldName: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 10_000) {
    throw new Error(`${fieldName} 값은 0~10000 bps 범위여야 합니다: ${String(value)}`);
  }
  return Math.round(value);
}

function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5 + 1e-12);
}

function computeDeterministicHash64(seed: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b1;
  for (let i = 0; i < seed.length; i += 1) {
    const code = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (code + i * 31), 0x85ebca6b) >>> 0;
  }
  return `rs-${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
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

export interface IntegerPoolAllocation {
  readonly amounts: ReadonlyMap<string, number>;
  readonly roundingAdjustments: ReadonlyMap<string, number>;
}

/**
 * 최대 잉여법(Hamilton Method) 정수 분배.
 * 반환 합계는 모든 유효 입력에 대해 항상 `totalMinor`와 정확히 일치한다(오차 0).
 */
export function allocateIntegerPool(
  totalMinor: number,
  entries: readonly { readonly id: string; readonly weight: number }[],
): IntegerPoolAllocation {
  assertNonNegativeSafeInteger(totalMinor, "totalMinor");
  const amounts = new Map<string, number>();
  const roundingAdjustments = new Map<string, number>();
  if (entries.length === 0) return { amounts, roundingAdjustments };

  const normalized = entries.map((e) => ({ id: e.id, weight: Number.isFinite(e.weight) && e.weight > 0 ? e.weight : 0 }));
  const totalWeight = normalized.reduce((acc, item) => acc + item.weight, 0);
  if (totalMinor === 0 || totalWeight <= 0) {
    for (const item of normalized) { amounts.set(item.id, 0); roundingAdjustments.set(item.id, 0); }
    return { amounts, roundingAdjustments };
  }

  const candidates = normalized.map((item) => {
    const exact = (totalMinor * item.weight) / totalWeight;
    const floorShare = Math.floor(exact);
    return { id: item.id, weight: item.weight, floorShare, remainder: exact - floorShare };
  });
  const leftover = totalMinor - candidates.reduce((acc, item) => acc + item.floorShare, 0);
  const ranked = [...candidates].sort((left, right) => {
    const remDiff = right.remainder - left.remainder;
    if (Math.abs(remDiff) > 1e-12) return remDiff;
    if (right.weight !== left.weight) return right.weight - left.weight;
    return left.id.localeCompare(right.id);
  });
  const bonusIds = new Set(ranked.slice(0, leftover).map((item) => item.id));
  for (const item of candidates) {
    const bonus = bonusIds.has(item.id) ? 1 : 0;
    amounts.set(item.id, item.floorShare + bonus);
    roundingAdjustments.set(item.id, bonus);
  }
  return { amounts, roundingAdjustments };
}

function computeTeamWeight(
  contributor: TeamContributorInput,
  mode: "explicit-bps" | "cut-weighted" | "hybrid",
): number {
  const roleMultiplier = contributor.roleWeightMultiplier ?? DEFAULT_ROLE_CUT_WEIGHTS[contributor.role];
  const cuts = Math.max(0, contributor.completedCuts ?? 0);
  const cutWeight = cuts * roleMultiplier;
  const shareWeight = Math.max(0, contributor.shareBps ?? 0);

  if (mode === "explicit-bps") return shareWeight;
  if (mode === "cut-weighted") return cutWeight;
  if (shareWeight > 0 && cutWeight > 0) return shareWeight + cutWeight * 100;
  return shareWeight > 0 ? shareWeight : cutWeight;
}

function computeWithholdingBreakdown(
  grossMinor: number,
  profile: TaxWithholdingProfile,
  customRateBps?: number,
): {
  readonly rateBps: number;
  readonly incomeTaxMinor: number;
  readonly localIncomeTaxMinor: number;
  readonly totalTaxMinor: number;
} {
  const rateBps = assertBpsRange(customRateBps ?? DEFAULT_WITHHOLDING_BPS[profile], "withholdingRateBps");
  if (rateBps === 0 || grossMinor === 0) {
    return { rateBps, incomeTaxMinor: 0, localIncomeTaxMinor: 0, totalTaxMinor: 0 };
  }
  const totalTaxMinor = Math.min(grossMinor, roundHalfUp((grossMinor * rateBps) / 10_000));
  if (profile === "kr-freelancer-3.3" && rateBps === 330) {
    const incomeTaxMinor = Math.min(totalTaxMinor, roundHalfUp((grossMinor * 300) / 10_000));
    const localIncomeTaxMinor = totalTaxMinor - incomeTaxMinor;
    return { rateBps, incomeTaxMinor, localIncomeTaxMinor, totalTaxMinor };
  }
  const localIncomeTaxMinor = Math.floor(totalTaxMinor / 11);
  return {
    rateBps,
    incomeTaxMinor: totalTaxMinor - localIncomeTaxMinor,
    localIncomeTaxMinor,
    totalTaxMinor,
  };
}

interface RecipientAccumulator {
  readonly recipientId: string;
  recipientName: string;
  readonly categories: Set<"team" | "rights-bom" | "marketplace-direct">;
  primaryRoleLabel: string;
  teamContributionMinor: number;
  subscriptionShareMinor: number;
  rightsBomRoyaltyMinor: number;
  marketplaceDirectMinor: number;
  roundingAdjustmentMinor: number;
  taxProfile: TaxWithholdingProfile;
  customWithholdingBps?: number;
}

export function calculateRoyaltySettlement(request: RoyaltySettlementRequest): RoyaltySettlementLedger {
  if (!request.settlementId.trim()) throw new Error("settlementId가 필요합니다.");
  if (!request.episodeId.trim()) throw new Error("episodeId가 필요합니다.");
  if (request.teamContributors.length === 0 && request.streams.every((s) => !s.directRecipientId)) {
    throw new Error("정산 수취인(연재 팀원 또는 직접 수취인)이 최소 1명 필요합니다.");
  }

  const fxTable = resolveFxTable(request.fxKrwPerMajor);
  const allocationMode = request.allocationMode ?? "hybrid";
  const maxBomCapBps = assertBpsRange(request.maxRightsBomCapBps ?? 4000, "maxRightsBomCapBps");
  const totalEpisodeCuts = Math.max(1, Math.trunc(request.totalEpisodeCuts));
  const generatedAtIso = request.generatedAtIso ?? "2026-11-22T00:00:00.000Z";

  const settledStreams: SettledRevenueStreamLine[] = request.streams.map((stream) => {
    assertNonNegativeSafeInteger(stream.grossAmountMinor, `stream(${stream.streamId}).grossAmountMinor`);
    const feeBps = assertBpsRange(
      stream.platformFeeRateBps ?? DEFAULT_PLATFORM_FEE_BPS[stream.kind],
      `stream(${stream.streamId}).platformFeeRateBps`,
    );
    const { convertedMinor, effectiveMajorRate } = convertCurrencyMinor(
      stream.grossAmountMinor,
      stream.currency,
      request.settlementCurrency,
      fxTable,
    );
    const platformFeeMinor = Math.min(convertedMinor, roundHalfUp((convertedMinor * feeBps) / 10_000));
    const distributableMinor = convertedMinor - platformFeeMinor;

    return Object.freeze({
      streamId: stream.streamId,
      kind: stream.kind,
      label: stream.label,
      sourceCurrency: stream.currency,
      sourceGrossMinor: stream.grossAmountMinor,
      fxRateApplied: effectiveMajorRate,
      convertedGrossMinor: convertedMinor,
      platformFeeRateBps: feeBps,
      platformFeeMinor,
      distributableMinor,
      directRecipientId: stream.directRecipientId ?? null,
    });
  });

  const recipientsMap = new Map<string, RecipientAccumulator>();
  const ensureRecipient = (params: {
    id: string;
    name: string;
    category: "team" | "rights-bom" | "marketplace-direct";
    roleLabel: string;
    taxProfile: TaxWithholdingProfile;
    customWithholdingBps?: number;
  }): RecipientAccumulator => {
    const existing = recipientsMap.get(params.id);
    if (existing) {
      existing.categories.add(params.category);
      return existing;
    }
    const created: RecipientAccumulator = {
      recipientId: params.id,
      recipientName: params.name,
      categories: new Set([params.category]),
      primaryRoleLabel: params.roleLabel,
      teamContributionMinor: 0,
      subscriptionShareMinor: 0,
      rightsBomRoyaltyMinor: 0,
      marketplaceDirectMinor: 0,
      roundingAdjustmentMinor: 0,
      taxProfile: params.taxProfile,
      customWithholdingBps: params.customWithholdingBps,
    };
    recipientsMap.set(params.id, created);
    return created;
  };

  // 1) 직접 귀속 마켓플레이스 스트림 분리
  let serialAndMarketPoolMinor = 0;
  let subscriptionPoolMinor = 0;
  for (let idx = 0; idx < request.streams.length; idx += 1) {
    const raw = request.streams[idx];
    const settled = settledStreams[idx];
    if (!raw || !settled) continue;
    if (raw.directRecipientId) {
      const acc = ensureRecipient({
        id: raw.directRecipientId,
        name: raw.directRecipientName ?? raw.directRecipientId,
        category: "marketplace-direct",
        roleLabel: "마켓 에셋 판매자",
        taxProfile: raw.directRecipientTaxProfile ?? "kr-freelancer-3.3",
        customWithholdingBps: raw.directRecipientCustomTaxBps,
      });
      acc.marketplaceDirectMinor += settled.distributableMinor;
    } else if (settled.kind === "subscription-pool") {
      subscriptionPoolMinor += settled.distributableMinor;
    } else {
      serialAndMarketPoolMinor += settled.distributableMinor;
    }
  }

  // 2) Rights BOM 유료 마켓 에셋 로열티 정산 (상한 적용 + 정수 무오차 보정)
  const sharedEpisodePoolMinor = serialAndMarketPoolMinor + subscriptionPoolMinor;
  const bomCapMinor = Math.min(sharedEpisodePoolMinor, roundHalfUp((sharedEpisodePoolMinor * maxBomCapBps) / 10_000));
  const rawBomClaims: { readonly item: RightsBomRoyaltyInput; readonly claimMinor: number }[] = [];
  for (const item of request.rightsBomRoyalties ?? []) {
    let claimMinor: number;
    if (item.royaltyModel === "flat-minor") {
      const flatMinor = assertNonNegativeSafeInteger(item.flatAmountMinor ?? 0, `bom(${item.assetId}).flatAmountMinor`);
      const converted = convertCurrencyMinor(
        flatMinor,
        item.flatCurrency ?? request.settlementCurrency,
        request.settlementCurrency,
        fxTable,
      );
      claimMinor = converted.convertedMinor;
    } else if (item.royaltyModel === "cut-proportional") {
      const rateBps = assertBpsRange(item.royaltyRateBps ?? 0, `bom(${item.assetId}).royaltyRateBps`);
      const ratio = Math.min(1, Math.max(0, (item.usedCutCount ?? 0) / totalEpisodeCuts));
      claimMinor = roundHalfUp((sharedEpisodePoolMinor * rateBps * ratio) / 10_000);
    } else {
      const rateBps = assertBpsRange(item.royaltyRateBps ?? 0, `bom(${item.assetId}).royaltyRateBps`);
      claimMinor = roundHalfUp((sharedEpisodePoolMinor * rateBps) / 10_000);
    }
    rawBomClaims.push({ item, claimMinor });
  }

  const rawBomSum = rawBomClaims.reduce((acc, claim) => acc + claim.claimMinor, 0);
  let totalRightsBomMinor = 0;
  const creditBom = (item: RightsBomRoyaltyInput, allocated: number, adj: number): void => {
    const acc = ensureRecipient({
      id: item.sellerId,
      name: item.sellerName,
      category: "rights-bom",
      roleLabel: `Rights BOM(${item.assetKind})`,
      taxProfile: item.taxProfile ?? "kr-freelancer-3.3",
      customWithholdingBps: item.customWithholdingBps,
    });
    acc.rightsBomRoyaltyMinor += allocated;
    acc.roundingAdjustmentMinor += adj;
    totalRightsBomMinor += allocated;
  };
  if (rawBomSum > 0) {
    if (rawBomSum <= bomCapMinor) {
      for (const { item, claimMinor } of rawBomClaims) creditBom(item, claimMinor, 0);
    } else {
      const scaled = allocateIntegerPool(
        bomCapMinor,
        rawBomClaims.map((claim, index) => ({ id: `${index}:${claim.item.assetId}`, weight: claim.claimMinor })),
      );
      rawBomClaims.forEach(({ item }, index) => {
        const key = `${index}:${item.assetId}`;
        creditBom(item, scaled.amounts.get(key) ?? 0, scaled.roundingAdjustments.get(key) ?? 0);
      });
    }
  }

  // Rights BOM 차감 순서는 연재 풀 우선, 부족 시 구독 풀에서 차감
  const bomFromSerial = Math.min(serialAndMarketPoolMinor, totalRightsBomMinor);
  const bomFromSubscription = totalRightsBomMinor - bomFromSerial;
  const remainingSerialPoolMinor = serialAndMarketPoolMinor - bomFromSerial;
  const remainingSubscriptionPoolMinor = subscriptionPoolMinor - bomFromSubscription;

  // 3) 연재 팀 분업 기여 및 구독 수익 배분 (최대 잉여법 0오차)
  if (request.teamContributors.length > 0) {
    const teamWeightEntries = request.teamContributors.map((member) => ({
      id: member.memberId,
      weight: computeTeamWeight(member, allocationMode),
    }));
    const subscriptionWeightEntries = request.teamContributors.map((member) => ({
      id: member.memberId,
      weight:
        member.subscriptionWeight !== undefined && member.subscriptionWeight > 0
          ? member.subscriptionWeight
          : computeTeamWeight(member, allocationMode),
    }));

    const serialAlloc = allocateIntegerPool(remainingSerialPoolMinor, teamWeightEntries);
    const subAlloc = allocateIntegerPool(remainingSubscriptionPoolMinor, subscriptionWeightEntries);

    for (const member of request.teamContributors) {
      const acc = ensureRecipient({
        id: member.memberId,
        name: member.memberName,
        category: "team",
        roleLabel: member.role,
        taxProfile: member.taxProfile ?? "kr-freelancer-3.3",
        customWithholdingBps: member.customWithholdingBps,
      });
      acc.teamContributionMinor += serialAlloc.amounts.get(member.memberId) ?? 0;
      acc.subscriptionShareMinor += subAlloc.amounts.get(member.memberId) ?? 0;
      acc.roundingAdjustmentMinor +=
        (serialAlloc.roundingAdjustments.get(member.memberId) ?? 0) +
        (subAlloc.roundingAdjustments.get(member.memberId) ?? 0);
    }
  }

  const totalGrossMinor = settledStreams.reduce((acc, s) => acc + s.convertedGrossMinor, 0);
  const totalPlatformFeeMinor = settledStreams.reduce((acc, s) => acc + s.platformFeeMinor, 0);
  const totalDistributableMinor = settledStreams.reduce((acc, s) => acc + s.distributableMinor, 0);

  const recipients: RoyaltyRecipientEntry[] = [...recipientsMap.values()]
    .sort((a, b) => a.recipientId.localeCompare(b.recipientId))
    .map((acc) => {
      const grossAllocationMinor =
        acc.teamContributionMinor +
        acc.subscriptionShareMinor +
        acc.rightsBomRoyaltyMinor +
        acc.marketplaceDirectMinor;
      const tax = computeWithholdingBreakdown(grossAllocationMinor, acc.taxProfile, acc.customWithholdingBps);
      const effectiveShareBps =
        totalDistributableMinor > 0 ? roundHalfUp((grossAllocationMinor * 10_000) / totalDistributableMinor) : 0;

      return Object.freeze({
        recipientId: acc.recipientId,
        recipientName: acc.recipientName,
        categories: Object.freeze([...acc.categories]),
        primaryRoleLabel: acc.primaryRoleLabel,
        effectiveShareBps,
        teamContributionMinor: acc.teamContributionMinor,
        subscriptionShareMinor: acc.subscriptionShareMinor,
        rightsBomRoyaltyMinor: acc.rightsBomRoyaltyMinor,
        marketplaceDirectMinor: acc.marketplaceDirectMinor,
        grossAllocationMinor,
        roundingAdjustmentMinor: acc.roundingAdjustmentMinor,
        taxProfile: acc.taxProfile,
        withholdingRateBps: tax.rateBps,
        incomeTaxMinor: tax.incomeTaxMinor,
        localIncomeTaxMinor: tax.localIncomeTaxMinor,
        withholdingTaxMinor: tax.totalTaxMinor,
        netPayoutMinor: grossAllocationMinor - tax.totalTaxMinor,
      });
    });

  const totalTeamContributionMinor = recipients.reduce((acc, r) => acc + r.teamContributionMinor, 0);
  const totalSubscriptionShareMinor = recipients.reduce((acc, r) => acc + r.subscriptionShareMinor, 0);
  const totalMarketplaceDirectMinor = recipients.reduce((acc, r) => acc + r.marketplaceDirectMinor, 0);
  const totalAllocatedGrossMinor = recipients.reduce((acc, r) => acc + r.grossAllocationMinor, 0);
  const totalWithholdingTaxMinor = recipients.reduce((acc, r) => acc + r.withholdingTaxMinor, 0);
  const totalNetPayoutMinor = recipients.reduce((acc, r) => acc + r.netPayoutMinor, 0);

  const roundingErrorMinor = totalDistributableMinor - totalAllocatedGrossMinor;
  const platformFeeBalanceErrorMinor = totalGrossMinor - (totalPlatformFeeMinor + totalDistributableMinor);
  const taxPayoutBalanceErrorMinor = totalAllocatedGrossMinor - (totalWithholdingTaxMinor + totalNetPayoutMinor);
  const balanced =
    roundingErrorMinor === 0 && platformFeeBalanceErrorMinor === 0 && taxPayoutBalanceErrorMinor === 0;

  const reconciliation: SettlementReconciliationProof = Object.freeze({
    totalGrossMinor,
    totalPlatformFeeMinor,
    totalDistributableMinor,
    totalRightsBomMinor,
    totalTeamContributionMinor,
    totalSubscriptionShareMinor,
    totalMarketplaceDirectMinor,
    totalAllocatedGrossMinor,
    totalWithholdingTaxMinor,
    totalNetPayoutMinor,
    roundingErrorMinor,
    platformFeeBalanceErrorMinor,
    taxPayoutBalanceErrorMinor,
    balanced,
  });

  const fingerprintSeed = [
    request.settlementId,
    request.episodeId,
    request.settlementCurrency,
    totalGrossMinor,
    totalDistributableMinor,
    totalNetPayoutMinor,
    recipients.map((r) => `${r.recipientId}:${r.grossAllocationMinor}:${r.netPayoutMinor}`).join("|"),
  ].join("::");

  return Object.freeze({
    schemaVersion: ROYALTY_SETTLEMENT_SCHEMA_VERSION,
    settlementId: request.settlementId.trim(),
    seriesId: request.seriesId.trim(),
    episodeId: request.episodeId.trim(),
    periodLabel: request.periodLabel.trim(),
    generatedAtIso,
    settlementCurrency: request.settlementCurrency,
    fxSnapshotKrwPerMajor: fxTable,
    streams: Object.freeze(settledStreams),
    recipients: Object.freeze(recipients),
    reconciliation,
    ledgerFingerprint: computeDeterministicHash64(fingerprintSeed),
  });
}

function escapeCsvField(value: string | number): string {
  const raw = String(value);
  const neutralized = /^[=+\-@\t\r]/u.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/u.test(neutralized) ? `"${neutralized.replaceAll('"', '""')}"` : neutralized;
}

const CSV_HEADERS = [
  "settlement_id", "episode_id", "currency", "recipient_id", "recipient_name", "role",
  "share_bps", "team_minor", "subscription_minor", "rights_bom_minor", "market_direct_minor",
  "gross_allocation_minor", "rounding_adj_minor", "withholding_bps", "withholding_tax_minor",
  "net_payout_minor", "net_payout_formatted",
] as const;

export function exportSettlementStatementCsv(ledger: RoyaltySettlementLedger): string {
  const rows: string[] = [CSV_HEADERS.join(",")];
  for (const r of ledger.recipients) {
    rows.push(
      [
        ledger.settlementId, ledger.episodeId, ledger.settlementCurrency, r.recipientId, r.recipientName,
        r.primaryRoleLabel, r.effectiveShareBps, r.teamContributionMinor, r.subscriptionShareMinor,
        r.rightsBomRoyaltyMinor, r.marketplaceDirectMinor, r.grossAllocationMinor, r.roundingAdjustmentMinor,
        r.withholdingRateBps, r.withholdingTaxMinor, r.netPayoutMinor,
        formatCurrencyMinor(r.netPayoutMinor, ledger.settlementCurrency),
      ].map(escapeCsvField).join(","),
    );
  }
  const rec = ledger.reconciliation;
  rows.push(
    [
      ledger.settlementId, ledger.episodeId, ledger.settlementCurrency, "TOTAL", "합계 검증 행",
      "RECONCILIATION", 10_000, rec.totalTeamContributionMinor, rec.totalSubscriptionShareMinor,
      rec.totalRightsBomMinor, rec.totalMarketplaceDirectMinor, rec.totalAllocatedGrossMinor,
      rec.roundingErrorMinor, "", rec.totalWithholdingTaxMinor, rec.totalNetPayoutMinor,
      formatCurrencyMinor(rec.totalNetPayoutMinor, ledger.settlementCurrency),
    ].map(escapeCsvField).join(","),
  );
  return rows.join("\n");
}

export function exportSettlementStatementJson(ledger: RoyaltySettlementLedger): string {
  return JSON.stringify(ledger, null, 2);
}
