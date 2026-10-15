import { Store } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { MarketGroupBuyCard } from "../components/MarketGroupBuyCard";
import { MarketNavHeader } from "../components/MarketNavHeader";
import { MarketSectionArtBanner } from "../components/MarketSectionArtBanner";
import { MarketSellerCenterTabs } from "../components/MarketSellerCenterTabs";
import { MarketSellerDashboard } from "../components/MarketSellerDashboard";
import { MarketSellerListingCard } from "../components/MarketSellerListingCard";
import { useMarketGroupBuy } from "../hooks/use-market-group-buy";
import { useMarketSeller } from "../hooks/use-market-seller";
import "../components/market-library-experience.css";

import {
  ownedResourceIds,
  readCurrentOwnerAssetPointEvents,
} from "@/domains/account/public/asset-points";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { NowCard } from "@/shared/components/layout/NowCard";
import { deriveNowCard } from "@/shared/components/layout/now-card-model";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  useDocumentTitle,
  useMetaDescription,
} from "@/shared/seo/use-document-title";

/** 오늘 자정 기준 D-day — 마감 규칙(③)의 daysUntil은 표면이 오늘 기준으로 계산해 넘긴다(now-card-model 계약). */
function daysUntilFromToday(iso: string): number {
  const target = new Date(iso);
  const now = new Date();
  const dayStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((dayStart(target) - dayStart(now)) / 86_400_000);
}

/**
 * 창작자 포인트 판매·공동구매 표면.
 *
 * 서버 패키지 판매(판매자 센터 /market/manage)와 축이 다르다 — 여기는 창작자가
 * 이 브라우저에서 직접 등록한 리스팅을 활동 포인트로 사고파는 로컬 판매대다.
 * 정산은 판매 원장 기록까지만이고 지갑 입금은 서버 정산 계약이 생길 때 승격한다.
 */
export function MarketSellerPage() {
  const bt = useBilingual("MarketSellerPage");
  useDocumentTitle(bt("포인트 판매 · 공동구매 · 창작 마켓", "Point sales & group buys · Creator Market"));
  useMetaDescription(
    bt(
      "창작자가 직접 등록한 소재를 활동 포인트로 구매하고, 공동구매로 함께 확정하는 공간입니다.",
      "Buy creator-listed materials with activity points, or confirm them together through group buys.",
    ),
  );

  const seller = useMarketSeller();
  const groupBuy = useMarketGroupBuy();
  const [revision, setRevision] = useState(0);
  const refreshAll = useCallback(() => {
    seller.refresh();
    groupBuy.refresh();
    setRevision((value) => value + 1);
  }, [seller, groupBuy]);

  const viewerId = seller.sellerId;
  const ownedIds = useMemo(() => {
    void revision;
    return viewerId ? ownedResourceIds(readCurrentOwnerAssetPointEvents()) : new Set<string>();
  }, [revision, viewerId]);

  const listingById = useMemo(
    () => new Map(seller.allListings.map((listing) => [listing.id, listing])),
    [seller.allListings],
  );
  const visibleCampaigns = groupBuy.campaigns.slice(0, 12);

  // "지금 할 일" (BLUEPRINT §3.2 확산, S3-5) — 도출은 공용 순수 함수(deriveNowCard)가
  // 맡고 이 표면은 자기 판매 상태만 신호로 넘긴다. 렌더는 아래 헤더 직후 한 곳뿐이다.
  // - ② 진행 중: 참여가 붙은 내 공동구매(마감이 가장 가까운 것부터).
  // - ③ 마감 임박: 진행 중 공동구매의 마감 — 창(3일) 판정은 모델이 한다.
  // - ④ 추천: 리스팅은 있는데 진행 중 공동구매가 없을 때 새 공동구매 열기.
  // - 게스트에게는 만들지 않는다(판매 상태가 없다). start·all-clear는 렌더하지 않는다 —
  //   고정 문형이 작품·회차 전용이라, 리스팅이 없는 빈 상태는 기존 빈 상태 구역과
  //   판매 관리 폼이, 마감 먼 공동구매만 있는 상태는 공동구매 구역이 이미 소유한다.
  const nowCard = useMemo(() => {
    if (!viewerId) return null;
    const openMine = seller.myCampaigns
      .filter((campaign) => campaign.status === "open")
      .sort((a, b) => new Date(a.deadlineAt).getTime() - new Date(b.deadlineAt).getTime());
    const activeCampaign = openMine.find((campaign) => campaign.participations.length > 0);
    const nearestCampaign = openMine[0];
    const campaignTitle = (campaign: { readonly listingId: string }) =>
      listingById.get(campaign.listingId)?.title ?? bt("내 리스팅", "My listing");
    const card = deriveNowCard({
      resume: activeCampaign
        ? {
            href: "#seller-group-buys",
            projectTitle: campaignTitle(activeCampaign),
            summary: bt(
              `${campaignTitle(activeCampaign)} 공동구매에 ${activeCampaign.participations.length}명이 참여 중이에요.`,
              `${activeCampaign.participations.length} buyer(s) have joined the group buy for ${campaignTitle(activeCampaign)}.`,
            ),
            progress: bt(
              `참여 ${activeCampaign.participations.length}명 · 목표 ${activeCampaign.targetCount}명`,
              `${activeCampaign.participations.length} joined · target ${activeCampaign.targetCount}`,
            ),
          }
        : null,
      deadline: nearestCampaign
        ? {
            href: "#seller-group-buys",
            label: bt(`${campaignTitle(nearestCampaign)} 공동구매`, `Group buy for ${campaignTitle(nearestCampaign)}`),
            daysUntil: daysUntilFromToday(nearestCampaign.deadlineAt),
          }
        : null,
      recommendation: seller.myListings.length > 0 && openMine.length === 0
        ? {
            href: "#seller-tools",
            title: bt("새 공동구매를 열어 보세요", "Open a new group buy"),
            reason: bt(
              "진행 중인 공동구매가 없어요. 판매 중인 리스팅에 공동구매를 열면 목표 인원이 모일 때 함께 확정돼요.",
              "No group buy is running. Open one on a listed item and it confirms when the target joins.",
            ),
          }
        : null,
      hasProject: seller.myListings.length > 0,
      startHref: "#seller-tools",
      allClearHref: "#seller-tools",
    }, bt);
    return card && card.ruleId !== "start" && card.ruleId !== "all-clear" ? card : null;
  }, [viewerId, seller.myCampaigns, seller.myListings.length, listingById, bt]);

  return (
    <Container size="wide" className="market-library-page py-7 sm:py-10">
      <MarketNavHeader />
      <MarketSectionArtBanner />
      <MarketSellerCenterTabs active="center" />

      <header className="mt-6 border-b border-line pb-6">
        <p className="eyebrow text-accent">Creator center</p>
        <div className="mt-1 flex items-center gap-2">
          <Store className="size-5 text-accent" aria-hidden="true" />
          <h1 className="text-xl font-bold text-fg sm:text-2xl">
            {bt("판매자 센터", "Seller center")}
          </h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-2">
          {bt(
            "판매자 센터의 첫 탭입니다. 창작자가 이 브라우저에 직접 등록한 소재를 활동 포인트로 사고파는 판매대와 공동구매를 한곳에서 다룹니다. 서버에 게시하는 에셋은 ‘에셋 등록’과 ‘패키지 관리’ 탭에서 다룹니다. 현금 결제·출금은 없습니다.",
            "This is the first tab of the seller center: a counter where creators list materials directly in this browser and trade them for activity points, plus group buys. Assets published to the server live in the Register asset and Package management tabs. No cash payments or withdrawals.",
          )}
        </p>
      </header>

      {nowCard ? (
        <div className="mt-8">
          <NowCard
            eyebrow={bt("지금 할 일", "Do this now")}
            title={nowCard.title}
            reason={nowCard.reason}
            progress={nowCard.progress}
            tone={nowCard.tone}
            dismissible={nowCard.dismissible}
            action={(
              <a href={nowCard.href} className={buttonClass({ variant: "solid", size: "md", className: "min-h-11" })}>
                {nowCard.actionLabel}
              </a>
            )}
          />
        </div>
      ) : null}

      <section aria-label={bt("판매자 리스팅", "Seller listings")} className="mt-8">
        <h2 className="text-lg font-bold text-fg">
          {bt("판매자 리스팅", "Seller listings")}{" "}
          <span className="numeral tnum text-sm text-fg-3">{seller.allListings.length}</span>
        </h2>
        {seller.allListings.length === 0 ? (
          <ActionableEmptyState
            art="generic"
            className="mt-4"
            icon={Store}
            title={bt("아직 등록된 판매 리스팅이 없어요", "No seller listings yet")}
            description={bt(
              "판매자 등록은 이 페이지 아래 판매 관리에서 할 수 있어요. 등록된 리스팅이 생기면 여기에 표시됩니다.",
              "Register as a seller in the seller tools below. Listings appear here once created.",
            )}
            primary={{ href: "/market/browse", label: bt("마켓 카탈로그 둘러보기", "Browse the market catalog") }}
          />
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {seller.allListings.map((listing) => (
              <li key={listing.id} className="min-w-0">
                <MarketSellerListingCard
                  listing={listing}
                  viewerId={viewerId}
                  owned={ownedIds.has(listing.id)}
                  onChanged={refreshAll}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="seller-group-buys" aria-label={bt("공동구매", "Group buys")} className="mt-10 scroll-mt-24">
        <h2 className="text-lg font-bold text-fg">
          {bt("공동구매", "Group buys")}{" "}
          <span className="numeral tnum text-sm text-fg-3">{groupBuy.openCampaigns.length}</span>
          <span className="ml-1 text-sm font-medium text-fg-3">{bt("진행 중", "open")}</span>
        </h2>
        <p className="mt-1 text-xs leading-5 text-fg-3">
          {bt(
            "참여하면 포인트가 예약 차감되고, 목표 인원이 모이면 그 자리에서 확정됩니다. 마감까지 미달이면 예약 포인트는 전액 자동 환불됩니다.",
            "Joining reserves your points; the buy confirms as soon as the target is reached. If it ends below target, reserved points are fully refunded.",
          )}
        </p>
        {groupBuy.campaigns.length === 0 ? (
          <p className="mt-4 rounded-xl border border-line bg-panel px-4 py-3 text-sm text-fg-2">
            {bt("아직 공동구매가 없어요. 판매자가 리스팅에 공동구매를 열면 여기에 표시됩니다.", "No group buys yet. They appear here when a seller opens one on a listing.")}
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {visibleCampaigns.map((campaign) => (
              <li key={campaign.id} className="min-w-0">
                <MarketGroupBuyCard
                  campaign={campaign}
                  listing={listingById.get(campaign.listingId) ?? null}
                  viewerId={viewerId}
                  viewerName={seller.sellerName}
                  onChanged={refreshAll}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        id="seller-tools"
        aria-label={bt("판매 관리", "Seller tools")}
        className="mt-10 border-t border-line pt-8"
      >
        <h2 className="text-lg font-bold text-fg">{bt("판매 관리", "Seller tools")}</h2>
        {viewerId ? (
          <div className="mt-4">
            <MarketSellerDashboard surface={seller} onChanged={refreshAll} />
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-line bg-card p-8 text-center">
            <h3 className="text-base font-bold text-fg">
              {bt("로그인하면 판매자로 등록할 수 있어요", "Log in to sell as a creator")}
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg-2">
              {bt(
                "리스팅 등록·판매 상태 관리·공동구매 개설·정산 내역은 로그인한 계정 기준으로 기록됩니다.",
                "Listing creation, sale status, group buys, and settlement records are kept per logged-in account.",
              )}
            </p>
            <button
              type="button"
              onClick={() =>
                requestAuthModalOpen({ reason: "protected-action", source: "market-seller", mode: "login" })
              }
              className={buttonClass({ variant: "solid", size: "md", className: "mt-5 min-h-11" })}
            >
              {bt("로그인하기", "Log in")}
            </button>
          </div>
        )}
      </section>
    </Container>
  );
}
