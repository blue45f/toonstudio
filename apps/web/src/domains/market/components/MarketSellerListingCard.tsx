import { useState } from "react";

import { formatMarketDate, marketKindMeta } from "../models/market-kind";
import {
  purchaseSellerListing,
  type PurchaseSellerListingResult,
} from "../models/market-sales-ledger";
import type { SellerListing } from "../models/market-seller-listings";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

type Translate = (ko: string, en: string) => string;

function purchaseFailureMessage(
  bt: Translate,
  reason: Exclude<PurchaseSellerListingResult, { ok: true }>["reason"],
): string {
  switch (reason) {
    case "not-on-sale":
      return bt("판매가 중단된 리스팅이에요.", "This listing is not on sale.");
    case "own-listing":
      return bt("내가 등록한 리스팅은 구매할 수 없어요.", "You cannot buy your own listing.");
    case "already-owned":
      return bt("이미 소유한 리스팅이에요.", "You already own this listing.");
    case "insufficient":
      return bt("포인트가 부족해요.", "Not enough points.");
  }
}

export function MarketSellerListingCard({
  listing,
  viewerId,
  owned,
  onChanged,
}: {
  readonly listing: SellerListing;
  readonly viewerId: string | null;
  /** 현재 세션 계정이 이미 이 리스팅을 소유했는지 (포인트 원장 판정 결과). */
  readonly owned: boolean;
  readonly onChanged: () => void;
}) {
  const bt = useBilingual("MarketSellerListingCard");
  const [message, setMessage] = useState<string | null>(null);
  const meta = marketKindMeta(listing.kind);
  const isMine = viewerId !== null && listing.sellerId === viewerId;
  const onSale = listing.status === "on-sale";

  const handlePurchase = () => {
    if (!viewerId) return;
    const result = purchaseSellerListing({ listing, buyerId: viewerId });
    setMessage(
      result.ok
        ? bt("구매했어요. 포인트 원장에 소유로 기록됐습니다.", "Purchased. Ownership is recorded in your points ledger.")
        : purchaseFailureMessage(bt, result.reason),
    );
    onChanged();
  };

  return (
    <article className="flex h-full flex-col rounded-xl border border-line bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs font-bold text-accent">{meta.label}</p>
        <span
          className={
            onSale
              ? "rounded-full bg-good/15 px-2.5 py-0.5 text-xs font-bold text-fg"
              : "rounded-full bg-raised px-2.5 py-0.5 text-xs font-bold text-fg-2"
          }
        >
          {onSale ? bt("판매 중", "On sale") : bt("판매 중단", "Suspended")}
        </span>
      </div>
      <h3 className="mt-2 text-base font-bold text-fg">{listing.title}</h3>
      {listing.description ? (
        <p className="mt-1 line-clamp-3 text-sm leading-6 text-fg-2">{listing.description}</p>
      ) : null}
      <dl className="mt-3 space-y-1 text-xs text-fg-3">
        <div className="flex gap-2">
          <dt>{bt("판매자", "Seller")}</dt>
          <dd className="text-fg-2">{listing.sellerName}</dd>
        </div>
        <div className="flex gap-2">
          <dt>{bt("등록일", "Listed")}</dt>
          <dd className="text-fg-2">{formatMarketDate(listing.createdAt)}</dd>
        </div>
      </dl>

      <div className="mt-auto pt-4">
        <p className="numeral tnum text-lg font-bold text-fg">
          {listing.pointPrice}P
          <span className="ml-2 text-xs font-medium text-fg-3">
            {bt("활동 포인트 전용", "Activity points only")}
          </span>
        </p>
        <div className="mt-3">
          {viewerId === null ? (
            <p className="text-xs text-fg-3">
              {bt("로그인하면 포인트로 구매할 수 있어요.", "Log in to buy with points.")}
            </p>
          ) : isMine ? (
            <p className="text-sm font-semibold text-fg-2">
              {bt("내가 등록한 리스팅이에요.", "This is your listing.")}
            </p>
          ) : owned ? (
            <p className="text-sm font-semibold text-fg">
              {bt("소유 중", "Owned")}
            </p>
          ) : (
            <button
              type="button"
              onClick={handlePurchase}
              disabled={!onSale}
              className={buttonClass({ variant: "solid", size: "sm", className: "min-h-11" })}
            >
              {bt("포인트로 구매", "Buy with points")}
            </button>
          )}
        </div>
        {message ? (
          <p role="status" className="mt-3 text-sm text-fg">
            {message}
          </p>
        ) : null}
      </div>
    </article>
  );
}
