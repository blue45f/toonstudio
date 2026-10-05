/**
 * 판매자 표면 훅 테스트 — 세션 계정 스코프 필터링과 모델 이벤트 갱신을 검증한다.
 * 세션은 찜·비교함 소유자 스코프 테스트와 같은 hoisted 모의 상태로 제어한다.
 */

// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAssetPointsStore } from "@/domains/account/public/asset-points";

import { useMarketSeller } from "./use-market-seller";
import { createGroupBuyCampaign } from "../models/market-group-buy";
import { recordMarketSale } from "../models/market-sales-ledger";
import { createSellerListing } from "../models/market-seller-listings";

const auth = vi.hoisted(() => ({
  userId: null as string | null,
  listeners: new Set<(session: { user: { id: string } } | null) => void>(),
}));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({
  getAuthUserId: () => auth.userId,
  getAuthSession: () => (auth.userId ? { user: { id: auth.userId } } : null),
  listeners: auth.listeners,
}));

const SELLER = "seller-1";
const OTHER = "seller-2";

function signIn(userId: string | null) {
  auth.userId = userId;
  const session = userId ? { user: { id: userId } } : null;
  auth.listeners.forEach((listener) => listener(session));
}

function makeListing(sellerId: string, title: string) {
  const result = createSellerListing({
    sellerId,
    sellerName: "판매자",
    title,
    kind: "brush",
    description: "",
    pointPrice: 100,
  });
  if (!result.ok) throw new Error(`리스팅 생성 실패: ${result.reason}`);
  return result.listing;
}

beforeEach(() => {
  localStorage.clear();
  auth.userId = null;
  auth.listeners.clear();
  useAssetPointsStore.getState().resetForTests();
});

describe("useMarketSeller", () => {
  it("게스트면 내 리스팅·판매·캠페인이 비고 전체 리스팅만 보인다", () => {
    makeListing(SELLER, "남의 리스팅");
    const { result } = renderHook(() => useMarketSeller());
    expect(result.current.sellerId).toBeNull();
    expect(result.current.allListings).toHaveLength(1);
    expect(result.current.myListings).toHaveLength(0);
    expect(result.current.mySales).toHaveLength(0);
    expect(result.current.mySummary.saleCount).toBe(0);
  });

  it("로그인하면 자기 리스팅·판매·정산 요약만 골라 보여주고 모델 변경에 다시 읽는다", () => {
    const mine = makeListing(SELLER, "내 리스팅");
    makeListing(OTHER, "남의 리스팅");
    signIn(SELLER);

    const { result } = renderHook(() => useMarketSeller());
    expect(result.current.sellerId).toBe(SELLER);
    expect(result.current.allListings).toHaveLength(2);
    expect(result.current.myListings.map((listing) => listing.id)).toEqual([mine.id]);
    expect(result.current.mySummary).toEqual({
      saleCount: 0,
      grossPoints: 0,
      feePoints: 0,
      settlementPoints: 0,
    });

    act(() => {
      recordMarketSale({
        listing: mine,
        buyerId: "buyer-1",
        grossPoints: 100,
        spendEventId: "ape_000099",
        source: "direct",
        now: new Date(),
      });
    });
    expect(result.current.mySales).toHaveLength(1);
    expect(result.current.mySummary).toEqual({
      saleCount: 1,
      grossPoints: 100,
      feePoints: 10,
      settlementPoints: 90,
    });

    act(() => {
      createGroupBuyCampaign({
        listingId: mine.id,
        sellerId: SELLER,
        targetCount: 2,
        deadlineAt: new Date(Date.now() + 3_600_000),
      });
    });
    expect(result.current.myCampaigns).toHaveLength(1);
    expect(result.current.openCampaigns).toHaveLength(1);
  });

  it("계정을 바꾸면 스냅샷이 새 계정 기준으로 갈린다", () => {
    makeListing(SELLER, "판매자 1 리스팅");
    makeListing(OTHER, "판매자 2 리스팅");
    signIn(SELLER);
    const { result } = renderHook(() => useMarketSeller());
    expect(result.current.myListings).toHaveLength(1);
    expect(result.current.myListings[0]?.title).toBe("판매자 1 리스팅");

    act(() => {
      signIn(OTHER);
    });
    expect(result.current.sellerId).toBe(OTHER);
    expect(result.current.myListings[0]?.title).toBe("판매자 2 리스팅");

    act(() => {
      signIn(null);
    });
    expect(result.current.sellerId).toBeNull();
    expect(result.current.myListings).toHaveLength(0);
  });
});
