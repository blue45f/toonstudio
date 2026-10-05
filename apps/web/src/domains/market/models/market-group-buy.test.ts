/**
 * 공동구매 상태 전이 테스트 — 개설 검증, 예약 차감, 달성 확정(전원 판매 기록),
 * 미달·취소 시 전액 환불과 "남의 지갑 몫은 환불 대기" 경계를 고정한다.
 *
 * 세션 계정은 `@/shared/lib/store` 모의 상태로 전환한다. 예약·환불은 실제
 * account 지갑 스토어를 거치므로 잔액 변화로 전이를 검증한다.
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
  cancelGroupBuyCampaign,
  countPendingGroupBuyRefunds,
  createGroupBuyCampaign,
  getGroupBuyCampaignById,
  groupBuyReservationResourceId,
  joinGroupBuyCampaign,
  settleExpiredGroupBuyCampaign,
} from "./market-group-buy";
import { getMarketSaleRecords } from "./market-sales-ledger";
import {
  createSellerListing,
  updateSellerListingStatus,
} from "./market-seller-listings";

const appState = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/shared/lib/store", () => {
  const useApp = (selector: (state: { userId: string | null }) => unknown) =>
    selector({ userId: appState.userId });
  useApp.getState = () => ({ userId: appState.userId });
  return { useApp };
});

const SELLER = "seller-1";
const BUYER_A = "buyer-a";
const BUYER_B = "buyer-b";

function at(dayOffset: number, hour = 12): Date {
  return new Date(2026, 9, 6 + dayOffset, hour, 0, 0, 0);
}

/** 현재 세션 계정에 활동 적립으로 포인트를 채운다 (하루 상한: 로그인 10P + 클립 60P). */
function fund(points: number, fromDay = 0): void {
  let dayOffset = fromDay;
  let remaining = points;
  let salt = 0;
  while (remaining > 0) {
    const now = at(dayOffset);
    awardDailyLoginBonus(now);
    remaining -= 10;
    for (const clip of [`fund-${salt}-a`, `fund-${salt}-b`]) {
      if (remaining <= 0) break;
      awardCutsClipPublished(clip, now);
      remaining -= 30;
    }
    salt += 1;
    dayOffset += 1;
  }
}

function createListing(pointPrice = 100) {
  const result = createSellerListing(
    {
      sellerId: SELLER,
      sellerName: "테스트 판매자",
      title: "공동구매 브러시 팩",
      kind: "brush",
      description: "",
      pointPrice,
    },
    at(0),
  );
  if (!result.ok) throw new Error(`리스팅 생성 실패: ${result.reason}`);
  return result.listing;
}

function openCampaign(listingId: string, targetCount = 2, deadlineDay = 3) {
  const result = createGroupBuyCampaign({
    listingId,
    sellerId: SELLER,
    targetCount,
    deadlineAt: at(deadlineDay),
    now: at(0),
  });
  if (!result.ok) throw new Error(`캠페인 개설 실패: ${result.reason}`);
  return result.campaign;
}

beforeEach(() => {
  localStorage.clear();
  appState.userId = null;
  useAssetPointsStore.getState().resetForTests();
});

describe("createGroupBuyCampaign", () => {
  it("판매자 본인·판매 중 리스팅·목표 2명 이상·미래 마감만 개설할 수 있다", () => {
    const listing = createListing();
    expect(
      createGroupBuyCampaign({
        listingId: listing.id,
        sellerId: BUYER_A,
        targetCount: 2,
        deadlineAt: at(3),
        now: at(0),
      }),
    ).toEqual({ ok: false, reason: "not-seller" });
    expect(
      createGroupBuyCampaign({
        listingId: listing.id,
        sellerId: SELLER,
        targetCount: 1,
        deadlineAt: at(3),
        now: at(0),
      }),
    ).toEqual({ ok: false, reason: "target-out-of-range" });
    expect(
      createGroupBuyCampaign({
        listingId: listing.id,
        sellerId: SELLER,
        targetCount: 2,
        deadlineAt: at(0, 11),
        now: at(0),
      }),
    ).toEqual({ ok: false, reason: "deadline-out-of-range" });

    const opened = openCampaign(listing.id);
    expect(opened.status).toBe("open");
    expect(
      createGroupBuyCampaign({
        listingId: listing.id,
        sellerId: SELLER,
        targetCount: 2,
        deadlineAt: at(3),
        now: at(0),
      }),
    ).toEqual({ ok: false, reason: "already-open" });

    const suspendedListing = createListing(50);
    updateSellerListingStatus(suspendedListing.id, "suspended", at(0));
    expect(
      createGroupBuyCampaign({
        listingId: suspendedListing.id,
        sellerId: SELLER,
        targetCount: 2,
        deadlineAt: at(3),
        now: at(0),
      }),
    ).toEqual({ ok: false, reason: "not-on-sale" });
  });
});

describe("joinGroupBuyCampaign — 달성 확정", () => {
  it("목표 인원에 닿으면 즉시 확정하고 참여자 전원의 판매 기록을 남긴다", () => {
    const listing = createListing(100);
    const campaign = openCampaign(listing.id, 2);

    appState.userId = BUYER_A;
    fund(100);
    const balanceBeforeJoin = readAssetPointBalance(at(1));
    const first = joinGroupBuyCampaign({
      campaignId: campaign.id,
      buyerId: BUYER_A,
      buyerName: "구매자 A",
      now: at(1),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.campaign.status).toBe("open");
    expect(first.campaign.participations).toHaveLength(1);
    expect(readAssetPointBalance(at(1))).toBe(balanceBeforeJoin - 100);

    appState.userId = BUYER_B;
    fund(100);
    const second = joinGroupBuyCampaign({
      campaignId: campaign.id,
      buyerId: BUYER_B,
      buyerName: "구매자 B",
      now: at(1, 13),
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.campaign.status).toBe("succeeded");
    expect(second.campaign.closedAt).not.toBeNull();
    expect(second.campaign.participations.every((entry) => entry.saleRecordId)).toBe(true);

    const sales = getMarketSaleRecords();
    expect(sales).toHaveLength(2);
    expect(sales.every((sale) => sale.source === "group-buy")).toBe(true);
    expect(sales.every((sale) => sale.campaignId === campaign.id)).toBe(true);
    expect(sales.every((sale) => sale.settlementPoints === 90 && sale.feePoints === 10)).toBe(true);
    expect(countPendingGroupBuyRefunds(second.campaign)).toBe(0);
  });

  it("자기 리스팅·이미 직접 구매한 리스팅·중복 참여·잔액 부족을 거부한다", () => {
    const listing = createListing(100);
    const campaign = openCampaign(listing.id, 3);

    appState.userId = SELLER;
    expect(
      joinGroupBuyCampaign({
        campaignId: campaign.id,
        buyerId: SELLER,
        buyerName: "판매자",
        now: at(1),
      }),
    ).toEqual({ ok: false, reason: "own-listing" });

    appState.userId = BUYER_A;
    expect(
      joinGroupBuyCampaign({
        campaignId: campaign.id,
        buyerId: BUYER_A,
        buyerName: "구매자 A",
        now: at(1),
      }),
    ).toEqual({ ok: false, reason: "insufficient" });

    fund(300);
    expect(
      joinGroupBuyCampaign({
        campaignId: campaign.id,
        buyerId: BUYER_A,
        buyerName: "구매자 A",
        now: at(1),
      }).ok,
    ).toBe(true);
    expect(
      joinGroupBuyCampaign({
        campaignId: campaign.id,
        buyerId: BUYER_A,
        buyerName: "구매자 A",
        now: at(1, 13),
      }),
    ).toEqual({ ok: false, reason: "already-joined" });

    // 직접 구매로 이미 소유한 다른 리스팅의 캠페인에는 참여할 수 없다.
    const ownedListing = createListing(50);
    const ownedCampaign = openCampaign(ownedListing.id, 2);
    const spend = useAssetPointsStore.getState().spendForResource({
      resourceId: ownedListing.id,
      resourceName: ownedListing.title,
      pointPrice: ownedListing.pointPrice,
      now: at(1, 14),
    });
    expect(spend.ok).toBe(true);
    expect(
      joinGroupBuyCampaign({
        campaignId: ownedCampaign.id,
        buyerId: BUYER_A,
        buyerName: "구매자 A",
        now: at(1, 15),
      }),
    ).toEqual({ ok: false, reason: "already-owned" });
  });

  it("마감이 지난 캠페인에 참여하면 거부하고 캠페인을 미달로 닫는다", () => {
    const listing = createListing(100);
    const campaign = openCampaign(listing.id, 2, 1);

    appState.userId = BUYER_A;
    fund(100);
    const balanceBeforeJoin = readAssetPointBalance(at(2));
    const result = joinGroupBuyCampaign({
      campaignId: campaign.id,
      buyerId: BUYER_A,
      buyerName: "구매자 A",
      now: at(2),
    });
    expect(result).toEqual({ ok: false, reason: "expired" });
    expect(getGroupBuyCampaignById(campaign.id)?.status).toBe("failed");
    expect(readAssetPointBalance(at(2))).toBe(balanceBeforeJoin);
  });
});

describe("미달 환불 — settleExpiredGroupBuyCampaign", () => {
  it("자기 몫만 즉시 환불하고 다른 계정 몫은 환불 대기로 남긴 뒤, 그 계정 세션에서 마저 환불한다", () => {
    const listing = createListing(100);
    const campaign = openCampaign(listing.id, 3, 2);

    appState.userId = BUYER_A;
    fund(100);
    const balanceA = readAssetPointBalance(at(1));
    expect(
      joinGroupBuyCampaign({
        campaignId: campaign.id,
        buyerId: BUYER_A,
        buyerName: "구매자 A",
        now: at(1),
      }).ok,
    ).toBe(true);
    expect(readAssetPointBalance(at(1))).toBe(balanceA - 100);

    appState.userId = BUYER_B;
    fund(100);
    const balanceB = readAssetPointBalance(at(1, 13));
    expect(
      joinGroupBuyCampaign({
        campaignId: campaign.id,
        buyerId: BUYER_B,
        buyerName: "구매자 B",
        now: at(1, 13),
      }).ok,
    ).toBe(true);

    // 마감 후 A 세션에서 정산: A만 환불되고 B는 대기.
    appState.userId = BUYER_A;
    const settled = settleExpiredGroupBuyCampaign(campaign.id, at(3), BUYER_A);
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    expect(settled.campaign.status).toBe("failed");
    expect(countPendingGroupBuyRefunds(settled.campaign)).toBe(1);
    expect(readAssetPointBalance(at(3))).toBe(balanceA);

    // B 세션에서 다시 정산하면 B 몫도 환불된다.
    appState.userId = BUYER_B;
    expect(readAssetPointBalance(at(3))).toBe(balanceB - 100);
    const settledAgain = settleExpiredGroupBuyCampaign(campaign.id, at(3), BUYER_B);
    expect(settledAgain.ok).toBe(true);
    if (!settledAgain.ok) return;
    expect(countPendingGroupBuyRefunds(settledAgain.campaign)).toBe(0);
    expect(readAssetPointBalance(at(3))).toBe(balanceB);
    expect(getMarketSaleRecords()).toHaveLength(0);
  });

  it("마감 전 open 캠페인은 정산해도 닫지 않는다", () => {
    const listing = createListing();
    const campaign = openCampaign(listing.id, 2, 3);
    const result = settleExpiredGroupBuyCampaign(campaign.id, at(1), SELLER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.campaign.status).toBe("open");
  });
});

describe("cancelGroupBuyCampaign", () => {
  it("판매자만 취소할 수 있고 취소하면 예약이 전액 환불된다", () => {
    const listing = createListing(100);
    const campaign = openCampaign(listing.id, 3, 3);

    appState.userId = BUYER_A;
    fund(100);
    const balanceBeforeJoin = readAssetPointBalance(at(1));
    expect(
      joinGroupBuyCampaign({
        campaignId: campaign.id,
        buyerId: BUYER_A,
        buyerName: "구매자 A",
        now: at(1),
      }).ok,
    ).toBe(true);

    expect(
      cancelGroupBuyCampaign({ campaignId: campaign.id, sellerId: BUYER_A, now: at(1, 13) }),
    ).toEqual({ ok: false, reason: "not-seller" });

    const cancelled = cancelGroupBuyCampaign({
      campaignId: campaign.id,
      sellerId: SELLER,
      currentOwnerId: BUYER_A,
      now: at(1, 14),
    });
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.campaign.status).toBe("cancelled");
    expect(countPendingGroupBuyRefunds(cancelled.campaign)).toBe(0);
    expect(readAssetPointBalance(at(1, 14))).toBe(balanceBeforeJoin);
    expect(getGroupBuyCampaignById(campaign.id)?.status).toBe("cancelled");
  });

  it("예약 resourceId는 캠페인 전용이라 직접 구매 소유 판정과 섞이지 않는다", () => {
    expect(groupBuyReservationResourceId("camp-1")).toBe("group-buy:camp-1");
  });
});
