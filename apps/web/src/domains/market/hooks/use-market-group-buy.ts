import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getAuthUserId,
  listeners as authListeners,
  type Session,
} from "@/domains/auth/public/session/auth-session-state";

import {
  getGroupBuyCampaigns,
  MARKET_GROUP_BUY_EVENT,
  settleExpiredGroupBuyCampaign,
  type GroupBuyCampaign,
} from "../models/market-group-buy";

export interface MarketGroupBuySurface {
  /** 현재 세션 계정. 게스트면 null — 참여·예약은 로그인 후에만 한다. */
  readonly viewerId: string | null;
  readonly campaigns: readonly GroupBuyCampaign[];
  readonly openCampaigns: readonly GroupBuyCampaign[];
  readonly refresh: () => void;
}

/**
 * 공동구매 표면 상태. 표면을 여는 시점에 마감 지난 진행 중 캠페인을 정산하고
 * (미달 확정 + 자기 몫 보류 환불 적용), 모델 이벤트와 다른 탭 변경에도 다시 읽는다.
 * 정산은 로컬 저장소라는 외부 시스템과의 동기화라 effect에서 수행한다.
 */
export function useMarketGroupBuy(): MarketGroupBuySurface {
  const [viewerId, setViewerId] = useState<string | null>(() => getAuthUserId());
  const [campaigns, setCampaigns] = useState<readonly GroupBuyCampaign[]>(() =>
    getGroupBuyCampaigns(),
  );

  useEffect(() => {
    const syncOwner = (session: Session) => {
      setViewerId(session?.user.id ?? null);
    };
    authListeners.add(syncOwner);
    return () => {
      authListeners.delete(syncOwner);
    };
  }, []);

  useEffect(() => {
    const now = new Date();
    for (const campaign of getGroupBuyCampaigns()) {
      const expiredOpen =
        campaign.status === "open" && new Date(campaign.deadlineAt).getTime() <= now.getTime();
      const hasClosedRefunds =
        campaign.status === "failed" || campaign.status === "cancelled";
      if (expiredOpen || hasClosedRefunds) {
        settleExpiredGroupBuyCampaign(campaign.id, now, viewerId);
      }
    }
    setCampaigns(getGroupBuyCampaigns());
  }, [viewerId]);

  useEffect(() => {
    const onUpdate = () => setCampaigns(getGroupBuyCampaigns());
    window.addEventListener(MARKET_GROUP_BUY_EVENT, onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener(MARKET_GROUP_BUY_EVENT, onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  const refresh = useCallback(() => {
    setCampaigns(getGroupBuyCampaigns());
  }, []);

  const openCampaigns = useMemo(
    () => campaigns.filter((campaign) => campaign.status === "open"),
    [campaigns],
  );

  return {
    viewerId,
    campaigns,
    openCampaigns,
    refresh,
  };
}
