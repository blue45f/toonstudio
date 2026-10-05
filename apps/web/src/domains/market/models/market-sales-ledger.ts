/**
 * Market Sales Ledger — 판매 기록과 판매자 정산 (클라이언트 상태 경계).
 *
 * 정산 규칙 (테스트로 고정):
 * - 플랫폼 수수료 10%. 수수료는 내림(floor)으로 계산하고, 판매자 정산 = 총액 − 수수료.
 *   예: 100P 판매 → 수수료 10P, 정산 90P. 15P 판매 → 수수료 1P, 정산 14P.
 * - 정산 포인트는 이 원장(시장 로컬 기록)에 쌓이는 "정산 내역"이다. 포인트 지갑 잔액에
 *   직접 가산하지 않는다 — 지갑 적립 규칙(asset-points-policy)은 금액이 고정된 활동
 *   규칙만 허용하고, 다른 계정의 지갑을 이 세션에서 가산할 서버 계약도 아직 없다.
 *   서버 정산 계약이 생기면 이 기록을 지갑 earn 이벤트로 승격한다. (위장 금지 경계)
 *
 * 구매 실행:
 * - 구매자 차감은 account 도메인 공개 경계(useAssetPointsStore.spendForResource)를 그대로 쓴다.
 *   spend의 resourceId가 리스팅 id라, 기존 ownedResourceIds 판정으로 소유가 확인된다.
 * - 자기 리스팅 구매 금지, 이미 소유한 리스팅 재구매 거부는 원장 판정과 이중으로 막는다.
 */

import {
  ownedResourceIds,
  readCurrentOwnerAssetPointEvents,
  useAssetPointsStore,
} from "@/domains/account/public/asset-points";

import {
  isSellerListingPurchasable,
  type SellerListing,
} from "./market-seller-listings";

export const MARKET_SELLER_FEE_RATE = 0.1;

export interface SalePointSplit {
  readonly grossPoints: number;
  readonly feePoints: number;
  readonly settlementPoints: number;
}

/** 총액을 수수료와 판매자 정산으로 나눈다. 수수료는 내림, 나머지는 전부 판매자 몫이다. */
export function splitSalePoints(grossPoints: number): SalePointSplit {
  const feePoints = Math.floor(grossPoints * MARKET_SELLER_FEE_RATE);
  return {
    grossPoints,
    feePoints,
    settlementPoints: grossPoints - feePoints,
  };
}

export type MarketSaleSource = "direct" | "group-buy";

export interface MarketSaleRecord {
  readonly id: string;
  readonly listingId: string;
  readonly listingTitle: string;
  readonly sellerId: string;
  readonly sellerName: string;
  readonly buyerId: string;
  readonly grossPoints: number;
  readonly feePoints: number;
  readonly settlementPoints: number;
  /** 구매자 포인트 원장의 spend 이벤트 ID. 환불·대조 추적용. */
  readonly spendEventId: string;
  readonly source: MarketSaleSource;
  readonly campaignId: string | null;
  readonly occurredAt: string;
}

export const MARKET_SALES_LEDGER_STORAGE_KEY = "toonspectrum:market:sales-ledger:v1";
export const MARKET_SALES_LEDGER_EVENT = "toonspectrum:market:sales-ledger-updated";

function isMarketSaleRecord(value: unknown): value is MarketSaleRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MarketSaleRecord>;
  return (
    typeof candidate.id === "string"
    && candidate.id.length > 0
    && typeof candidate.listingId === "string"
    && typeof candidate.listingTitle === "string"
    && typeof candidate.sellerId === "string"
    && typeof candidate.buyerId === "string"
    && typeof candidate.grossPoints === "number"
    && typeof candidate.feePoints === "number"
    && typeof candidate.settlementPoints === "number"
    && typeof candidate.spendEventId === "string"
    && (candidate.source === "direct" || candidate.source === "group-buy")
    && (typeof candidate.campaignId === "string" || candidate.campaignId === null)
    && typeof candidate.occurredAt === "string"
  );
}

function emitSalesLedgerUpdate(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(MARKET_SALES_LEDGER_EVENT));
  }
}

export function getMarketSaleRecords(): MarketSaleRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(MARKET_SALES_LEDGER_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.flatMap((candidate) => {
      if (!isMarketSaleRecord(candidate) || seen.has(candidate.id)) return [];
      seen.add(candidate.id);
      return [candidate];
    });
  } catch {
    return [];
  }
}

export function recordMarketSale(input: {
  readonly listing: SellerListing;
  readonly buyerId: string;
  readonly grossPoints: number;
  readonly spendEventId: string;
  readonly source: MarketSaleSource;
  readonly campaignId?: string | null;
  readonly now?: Date;
}): MarketSaleRecord {
  const split = splitSalePoints(input.grossPoints);
  const record: MarketSaleRecord = {
    id: globalThis.crypto.randomUUID(),
    listingId: input.listing.id,
    listingTitle: input.listing.title,
    sellerId: input.listing.sellerId,
    sellerName: input.listing.sellerName,
    buyerId: input.buyerId,
    grossPoints: split.grossPoints,
    feePoints: split.feePoints,
    settlementPoints: split.settlementPoints,
    spendEventId: input.spendEventId,
    source: input.source,
    campaignId: input.campaignId ?? null,
    occurredAt: (input.now ?? new Date()).toISOString(),
  };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(
        MARKET_SALES_LEDGER_STORAGE_KEY,
        JSON.stringify([record, ...getMarketSaleRecords()]),
      );
      emitSalesLedgerUpdate();
    } catch {
      // 기록 저장 실패 시에도 구매 자체는 성립한다. 정산 대조는 spendEventId로 가능하다.
    }
  }
  return record;
}

export function getSalesBySeller(sellerId: string): MarketSaleRecord[] {
  return getMarketSaleRecords().filter((record) => record.sellerId === sellerId);
}

export interface SellerSalesSummary {
  readonly saleCount: number;
  readonly grossPoints: number;
  readonly feePoints: number;
  readonly settlementPoints: number;
}

export function summarizeSellerSales(
  records: readonly MarketSaleRecord[],
  sellerId: string,
): SellerSalesSummary {
  const mine = records.filter((record) => record.sellerId === sellerId);
  return {
    saleCount: mine.length,
    grossPoints: mine.reduce((sum, record) => sum + record.grossPoints, 0),
    feePoints: mine.reduce((sum, record) => sum + record.feePoints, 0),
    settlementPoints: mine.reduce((sum, record) => sum + record.settlementPoints, 0),
  };
}

export type PurchaseSellerListingResult =
  | { readonly ok: true; readonly sale: MarketSaleRecord }
  | {
      readonly ok: false;
      readonly reason: "not-on-sale" | "own-listing" | "already-owned" | "insufficient";
    };

/**
 * 판매자 리스팅을 포인트로 구매한다.
 * 현재 세션 계정이 구매자다 (포인트 지갑이 세션 계정 소유라서다).
 * 차감 성공 후에만 판매 기록을 남기므로, 실패한 구매는 정산에 잡히지 않는다.
 */
export function purchaseSellerListing(input: {
  readonly listing: SellerListing;
  readonly buyerId: string;
  readonly now?: Date;
}): PurchaseSellerListingResult {
  const { listing, buyerId } = input;
  const now = input.now ?? new Date();
  if (!isSellerListingPurchasable(listing)) {
    return { ok: false, reason: "not-on-sale" };
  }
  if (listing.sellerId === buyerId) {
    return { ok: false, reason: "own-listing" };
  }
  if (ownedResourceIds(readCurrentOwnerAssetPointEvents()).has(listing.id)) {
    return { ok: false, reason: "already-owned" };
  }
  const spend = useAssetPointsStore.getState().spendForResource({
    resourceId: listing.id,
    resourceName: listing.title,
    pointPrice: listing.pointPrice,
    now,
  });
  if (!spend.ok) return { ok: false, reason: spend.reason };
  const sale = recordMarketSale({
    listing,
    buyerId,
    grossPoints: listing.pointPrice,
    spendEventId: spend.eventId,
    source: "direct",
    now,
  });
  return { ok: true, sale };
}
