import { Store } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { MarketGroupBuyCard } from "../components/MarketGroupBuyCard";
import { MarketNavHeader } from "../components/MarketNavHeader";
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
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  useDocumentTitle,
  useMetaDescription,
} from "@/shared/seo/use-document-title";

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

  return (
    <Container size="wide" className="market-library-page py-7 sm:py-10">
      <MarketNavHeader />

      <header className="border-b border-line pb-6">
        <h1 className="text-xl font-bold text-fg sm:text-2xl">
          {bt("포인트 판매 · 공동구매", "Point sales & group buys")}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-2">
          {bt(
            "창작자가 직접 등록한 소재를 활동 포인트로 사고파는 판매대입니다. 서버 패키지 판매(판매자 센터)와 별개로, 이 브라우저에 등록된 리스팅을 다룹니다. 현금 결제·출금은 없습니다.",
            "A sales counter where creators list materials directly in this browser and trade them for activity points — separate from the server package seller center. No cash payments or withdrawals.",
          )}
        </p>
      </header>

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

      <section aria-label={bt("공동구매", "Group buys")} className="mt-10">
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
