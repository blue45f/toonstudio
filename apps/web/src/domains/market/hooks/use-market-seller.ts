import { useCallback, useEffect, useState } from "react";

import {
  getAuthSession,
  getAuthUserId,
  listeners as authListeners,
  type Session,
} from "@/domains/auth/public/session/auth-session-state";

import {
  getGroupBuyCampaigns,
  MARKET_GROUP_BUY_EVENT,
  type GroupBuyCampaign,
} from "../models/market-group-buy";
import {
  getMarketSaleRecords,
  MARKET_SALES_LEDGER_EVENT,
  summarizeSellerSales,
  type MarketSaleRecord,
  type SellerSalesSummary,
} from "../models/market-sales-ledger";
import {
  getSellerListings,
  MARKET_SELLER_LISTINGS_EVENT,
  type SellerListing,
} from "../models/market-seller-listings";

export interface MarketSellerSnapshot {
  /** 현재 세션 계정. 게스트면 null — 판매자 표면은 로그인 후에만 연다. */
  readonly sellerId: string | null;
  /** 리스팅·판매 기록에 남길 표시 이름. 세션 프로필이 없으면 계정 ID를 쓴다. */
  readonly sellerName: string | null;
  readonly allListings: readonly SellerListing[];
  readonly myListings: readonly SellerListing[];
  readonly mySales: readonly MarketSaleRecord[];
  readonly mySummary: SellerSalesSummary;
  readonly myCampaigns: readonly GroupBuyCampaign[];
  readonly openCampaigns: readonly GroupBuyCampaign[];
}

function readSnapshot(sellerId: string | null): MarketSellerSnapshot {
  const allListings = getSellerListings();
  const records = getMarketSaleRecords();
  const campaigns = getGroupBuyCampaigns();
  const profile = sellerId ? getAuthSession()?.user : null;
  return {
    sellerId,
    sellerName: sellerId
      ? (profile?.name ?? profile?.email ?? sellerId)
      : null,
    allListings,
    myListings: sellerId
      ? allListings.filter((listing) => listing.sellerId === sellerId)
      : [],
    mySales: sellerId ? records.filter((record) => record.sellerId === sellerId) : [],
    mySummary: summarizeSellerSales(records, sellerId ?? ""),
    myCampaigns: sellerId
      ? campaigns.filter((campaign) => campaign.sellerId === sellerId)
      : [],
    openCampaigns: campaigns.filter((campaign) => campaign.status === "open"),
  };
}

const SELLER_SURFACE_EVENTS = [
  MARKET_SELLER_LISTINGS_EVENT,
  MARKET_SALES_LEDGER_EVENT,
  MARKET_GROUP_BUY_EVENT,
] as const;

export interface MarketSellerSurface extends MarketSellerSnapshot {
  readonly refresh: () => void;
}

/**
 * 판매자 표면 상태. 찜 훅과 같은 계약으로, 세션 계정을 소유자로 삼아
 * 그 계정의 리스팅·판매·캠페인만 골라 보여준다. 로컬 모델 이벤트와
 * storage 이벤트(다른 탭)에도 다시 읽어 맞춘다.
 */
export function useMarketSeller(): MarketSellerSurface {
  const [sellerId, setSellerId] = useState<string | null>(() => getAuthUserId());
  const [snapshot, setSnapshot] = useState<MarketSellerSnapshot>(() =>
    readSnapshot(getAuthUserId()),
  );

  useEffect(() => {
    const syncOwner = (session: Session) => {
      setSellerId(session?.user.id ?? null);
    };
    authListeners.add(syncOwner);
    return () => {
      authListeners.delete(syncOwner);
    };
  }, []);

  useEffect(() => {
    setSnapshot(readSnapshot(sellerId));
  }, [sellerId]);

  useEffect(() => {
    const onUpdate = () => setSnapshot(readSnapshot(sellerId));
    for (const eventName of SELLER_SURFACE_EVENTS) {
      window.addEventListener(eventName, onUpdate);
    }
    window.addEventListener("storage", onUpdate);
    return () => {
      for (const eventName of SELLER_SURFACE_EVENTS) {
        window.removeEventListener(eventName, onUpdate);
      }
      window.removeEventListener("storage", onUpdate);
    };
  }, [sellerId]);

  const refresh = useCallback(() => {
    setSnapshot(readSnapshot(sellerId));
  }, [sellerId]);

  return { ...snapshot, refresh };
}
