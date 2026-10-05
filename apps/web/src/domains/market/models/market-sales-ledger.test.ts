/**
 * 판매자 리스팅·판매 원장 모델 테스트 — 리스팅 검증 규칙, 수수료 분리,
 * 구매 차감과 자기 구매·재구매·잔액 부족 거부를 고정한다.
 *
 * 세션 계정은 `@/shared/lib/store` 모의 상태로 몰아 소유자 전환을 직접 일으킨다
 * (account 지갑 테스트와 같은 방식). 잔액은 활동 적립 트리거로만 채운다 —
 * 지갑에 잔액을 직접 주입하는 우회로는 두지 않는다.
 */

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  awardCutsClipPublished,
  awardDailyLoginBonus,
  readAssetPointBalance,
  useAssetPointsStore,
} from "@/domains/account/public/asset-points";

import {
  getMarketSaleRecords,
  getSalesBySeller,
  purchaseSellerListing,
  splitSalePoints,
  summarizeSellerSales,
} from "./market-sales-ledger";
import {
  createSellerListing,
  getSellerListingById,
  getSellerListings,
  isSellerListingPurchasable,
  MIN_SELLER_POINT_PRICE,
  updateSellerListingStatus,
  validateSellerListingInput,
} from "./market-seller-listings";

const appState = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/shared/lib/store", () => {
  const useApp = (selector: (state: { userId: string | null }) => unknown) =>
    selector({ userId: appState.userId });
  useApp.getState = () => ({ userId: appState.userId });
  return { useApp };
});

const SELLER = "seller-1";
const BUYER = "buyer-1";

function day(offset: number): Date {
  return new Date(2026, 9, 6 + offset, 12, 0, 0, 0);
}

/** 현재 세션 계정에 활동 적립으로 포인트를 채운다. 하루 상한은 로그인 10P + 클립 60P. */
function fund(points: number, fromDay = 0): void {
  let dayOffset = fromDay;
  let remaining = points;
  while (remaining > 0) {
    const now = day(dayOffset);
    awardDailyLoginBonus(now);
    remaining -= 10;
    for (const clip of [`clip-${dayOffset}-a`, `clip-${dayOffset}-b`]) {
      if (remaining <= 0) break;
      awardCutsClipPublished(clip, now);
      remaining -= 30;
    }
    dayOffset += 1;
  }
}

function createListing(pointPrice = 100) {
  const result = createSellerListing(
    {
      sellerId: SELLER,
      sellerName: "테스트 판매자",
      title: "수채화 브러시 팩",
      kind: "brush",
      description: "직접 만든 수채화 브러시 모음",
      pointPrice,
    },
    day(0),
  );
  if (!result.ok) throw new Error(`리스팅 생성 실패: ${result.reason}`);
  return result.listing;
}

beforeEach(() => {
  localStorage.clear();
  appState.userId = null;
  useAssetPointsStore.getState().resetForTests();
});

describe("splitSalePoints", () => {
  it("수수료 10%를 내림으로 분리하고 나머지를 판매자 정산으로 둔다", () => {
    expect(splitSalePoints(100)).toEqual({
      grossPoints: 100,
      feePoints: 10,
      settlementPoints: 90,
    });
    expect(splitSalePoints(15)).toEqual({
      grossPoints: 15,
      feePoints: 1,
      settlementPoints: 14,
    });
    expect(splitSalePoints(10)).toEqual({
      grossPoints: 10,
      feePoints: 1,
      settlementPoints: 9,
    });
  });
});

describe("리스팅 검증·생성", () => {
  it("최소 가격 미만과 비어 있는 제목을 거부한다", () => {
    const base = {
      sellerId: SELLER,
      sellerName: "판매자",
      title: "브러시",
      kind: "brush" as const,
      description: "",
      pointPrice: 100,
    };
    expect(validateSellerListingInput({ ...base, pointPrice: MIN_SELLER_POINT_PRICE - 1 })).toEqual({
      ok: false,
      reason: "price-too-low",
    });
    expect(validateSellerListingInput({ ...base, pointPrice: 10.5 })).toEqual({
      ok: false,
      reason: "price-not-integer",
    });
    expect(validateSellerListingInput({ ...base, title: "  " })).toEqual({
      ok: false,
      reason: "title-required",
    });
    expect(validateSellerListingInput(base)).toEqual({ ok: true });
  });

  it("생성하면 판매 중 상태로 저장되고 상태 전환이 구매 가능 판정에 반영된다", () => {
    const listing = createListing();
    expect(listing.status).toBe("on-sale");
    expect(getSellerListings()).toHaveLength(1);
    expect(getSellerListingById(listing.id)?.title).toBe("수채화 브러시 팩");
    expect(isSellerListingPurchasable(listing)).toBe(true);

    const suspended = updateSellerListingStatus(listing.id, "suspended", day(1));
    expect(suspended?.status).toBe("suspended");
    expect(isSellerListingPurchasable(suspended)).toBe(false);
    expect(updateSellerListingStatus("missing-id", "suspended")).toBeNull();
  });
});

describe("purchaseSellerListing", () => {
  it("구매하면 잔액이 차감되고 수수료가 분리된 판매 기록이 남는다", () => {
    const listing = createListing(100);
    appState.userId = BUYER;
    fund(150);
    expect(readAssetPointBalance(day(2))).toBeGreaterThanOrEqual(150);

    const result = purchaseSellerListing({ listing, buyerId: BUYER, now: day(2) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sale).toMatchObject({
      listingId: listing.id,
      sellerId: SELLER,
      buyerId: BUYER,
      grossPoints: 100,
      feePoints: 10,
      settlementPoints: 90,
      source: "direct",
      campaignId: null,
    });
    expect(readAssetPointBalance(day(2))).toBe(50);
    expect(getSalesBySeller(SELLER)).toHaveLength(1);
    expect(getMarketSaleRecords()).toHaveLength(1);
    expect(summarizeSellerSales(getMarketSaleRecords(), SELLER)).toEqual({
      saleCount: 1,
      grossPoints: 100,
      feePoints: 10,
      settlementPoints: 90,
    });
  });

  it("자기 리스팅 구매, 재구매, 잔액 부족, 판매 중단 리스팅을 모두 거부한다", () => {
    const listing = createListing(100);

    appState.userId = SELLER;
    expect(purchaseSellerListing({ listing, buyerId: SELLER, now: day(0) })).toEqual({
      ok: false,
      reason: "own-listing",
    });

    appState.userId = BUYER;
    expect(purchaseSellerListing({ listing, buyerId: BUYER, now: day(0) })).toEqual({
      ok: false,
      reason: "insufficient",
    });
    expect(getMarketSaleRecords()).toHaveLength(0);

    fund(150);
    expect(purchaseSellerListing({ listing, buyerId: BUYER, now: day(2) }).ok).toBe(true);
    expect(purchaseSellerListing({ listing, buyerId: BUYER, now: day(2) })).toEqual({
      ok: false,
      reason: "already-owned",
    });
    expect(getMarketSaleRecords()).toHaveLength(1);

    const other = createListing(50);
    updateSellerListingStatus(other.id, "suspended", day(2));
    const suspended = getSellerListingById(other.id);
    if (!suspended) throw new Error("리스팅이 필요합니다");
    expect(purchaseSellerListing({ listing: suspended, buyerId: BUYER, now: day(2) })).toEqual({
      ok: false,
      reason: "not-on-sale",
    });
    expect(getMarketSaleRecords()).toHaveLength(1);
  });
});
