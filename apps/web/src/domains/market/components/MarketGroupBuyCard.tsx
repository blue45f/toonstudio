import { useState } from "react";

import { formatMarketDateTime, marketKindMeta } from "../models/market-kind";
import {
  countPendingGroupBuyRefunds,
  joinGroupBuyCampaign,
  type GroupBuyCampaign,
  type JoinGroupBuyResult,
} from "../models/market-group-buy";
import type { SellerListing } from "../models/market-seller-listings";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

type Translate = (ko: string, en: string) => string;

function joinFailureMessage(
  bt: Translate,
  reason: Exclude<JoinGroupBuyResult, { ok: true }>["reason"],
): string {
  switch (reason) {
    case "campaign-not-found":
      return bt("캠페인을 찾을 수 없어요.", "This campaign could not be found.");
    case "not-open":
      return bt("이미 종료된 캠페인이에요.", "This campaign is already closed.");
    case "expired":
      return bt("마감이 지나 참여할 수 없어요.", "The deadline has passed.");
    case "listing-unavailable":
      return bt("판매가 중단된 리스팅이라 참여할 수 없어요.", "This listing is not on sale.");
    case "own-listing":
      return bt("내 리스팅의 공동구매에는 참여할 수 없어요.", "You cannot join a group buy for your own listing.");
    case "already-joined":
      return bt("이미 참여 중인 캠페인이에요.", "You already joined this campaign.");
    case "already-owned":
      return bt("이미 소유한 리스팅이에요.", "You already own this listing.");
    case "insufficient":
      return bt("포인트가 부족해요.", "Not enough points.");
  }
}

function campaignStatusLabel(bt: Translate, campaign: GroupBuyCampaign): string {
  switch (campaign.status) {
    case "open":
      return bt("진행 중", "Open");
    case "succeeded":
      return bt("달성 확정", "Succeeded");
    case "failed":
      return bt("미달 종료", "Ended below target");
    case "cancelled":
      return bt("판매자 취소", "Cancelled by seller");
  }
}

export function MarketGroupBuyCard({
  campaign,
  listing,
  viewerId,
  viewerName,
  onChanged,
}: {
  readonly campaign: GroupBuyCampaign;
  readonly listing: SellerListing | null;
  readonly viewerId: string | null;
  readonly viewerName: string | null;
  readonly onChanged: () => void;
}) {
  const bt = useBilingual("MarketGroupBuyCard");
  const [message, setMessage] = useState<string | null>(null);
  const joined = viewerId
    ? campaign.participations.some((entry) => entry.buyerId === viewerId)
    : false;
  const pendingRefunds = countPendingGroupBuyRefunds(campaign);
  const canJoin =
    campaign.status === "open"
    && viewerId !== null
    && listing !== null
    && listing.status === "on-sale"
    && listing.sellerId !== viewerId
    && !joined;

  const handleJoin = () => {
    if (!viewerId) return;
    const result = joinGroupBuyCampaign({
      campaignId: campaign.id,
      buyerId: viewerId,
      buyerName: viewerName ?? viewerId,
    });
    setMessage(
      result.ok
        ? result.campaign.status === "succeeded"
          ? bt("목표 인원이 모여 공동구매가 확정됐어요!", "The target was reached — the group buy is confirmed!")
          : bt("참여했어요. 목표 인원이 모이면 자동으로 확정돼요.", "You joined. It confirms automatically once the target is reached.")
        : joinFailureMessage(bt, result.reason),
    );
    onChanged();
  };

  return (
    <article className="rounded-xl border border-line bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold text-accent">
            {listing ? marketKindMeta(listing.kind).label : bt("리스팅 없음", "No listing")}
            {" · "}
            {bt("공동구매", "Group buy")}
          </p>
          <h3 className="mt-1 truncate text-base font-bold text-fg">
            {listing ? listing.title : bt("삭제된 리스팅", "Removed listing")}
          </h3>
        </div>
        <span className="rounded-full bg-raised px-2.5 py-0.5 text-xs font-bold text-fg">
          {campaignStatusLabel(bt, campaign)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-2">
        <span>
          {bt("참여", "Joined")}{" "}
          <strong className="numeral tnum text-fg">{campaign.participations.length}</strong>
          {bt("명 / 목표", " / target")}{" "}
          <strong className="numeral tnum text-fg">{campaign.targetCount}</strong>
          {bt("명", "")}
        </span>
        {listing ? (
          <span>
            {bt("예약 차감", "Reserved")}{" "}
            <strong className="numeral tnum text-fg">{listing.pointPrice}P</strong>
          </span>
        ) : null}
        <span>
          {bt("마감", "Deadline")} {formatMarketDateTime(campaign.deadlineAt)}
        </span>
      </div>

      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-raised"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={campaign.targetCount}
        aria-valuenow={campaign.participations.length}
        aria-label={bt("공동구매 달성률", "Group buy progress")}
      >
        <div
          className="h-full bg-accent"
          style={{
            width: `${Math.min(100, (campaign.participations.length / campaign.targetCount) * 100)}%`,
          }}
        />
      </div>

      {pendingRefunds > 0 ? (
        <p className="mt-3 text-xs leading-5 text-warn">
          {bt(
            `환불 대기 ${pendingRefunds}명 — 다른 계정의 예약금은 그 계정이 다음에 접속할 때 자동 환불됩니다.`,
            `${pendingRefunds} refund(s) pending — other accounts are refunded automatically on their next visit.`,
          )}
        </p>
      ) : null}

      {campaign.status === "open" ? (
        <div className="mt-4">
          {viewerId === null ? (
            <p className="text-xs text-fg-3">
              {bt("로그인하면 포인트를 예약하고 참여할 수 있어요.", "Log in to reserve points and join.")}
            </p>
          ) : joined ? (
            <p className="text-sm font-semibold text-fg">
              {bt("참여 중이에요. 미달로 끝나면 예약 포인트는 전액 환불돼요.", "You're in. If it ends below target, your reserved points are fully refunded.")}
            </p>
          ) : listing && listing.sellerId === viewerId ? (
            <p className="text-xs text-fg-3">
              {bt("내가 개설한 캠페인이에요.", "You opened this campaign.")}
            </p>
          ) : (
            <button
              type="button"
              onClick={handleJoin}
              disabled={!canJoin}
              className={buttonClass({ variant: "solid", size: "sm", className: "min-h-11" })}
            >
              {bt("포인트 예약하고 참여", "Reserve points and join")}
            </button>
          )}
        </div>
      ) : null}

      {message ? (
        <p role="status" className="mt-3 text-sm text-fg">
          {message}
        </p>
      ) : null}
    </article>
  );
}
