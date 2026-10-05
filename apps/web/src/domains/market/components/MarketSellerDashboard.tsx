import { useState } from "react";
import type { FormEvent } from "react";

import type { MarketSellerSurface } from "../hooks/use-market-seller";
import { MARKET_KINDS, formatMarketDateTime } from "../models/market-kind";
import {
  cancelGroupBuyCampaign,
  countPendingGroupBuyRefunds,
  createGroupBuyCampaign,
  MAX_GROUP_BUY_DURATION_HOURS,
  MAX_GROUP_BUY_TARGET,
  MIN_GROUP_BUY_TARGET,
} from "../models/market-group-buy";
import type { SellerListingValidationReason } from "../models/market-seller-listings";
import {
  createSellerListing,
  MIN_SELLER_POINT_PRICE,
  updateSellerListingStatus,
} from "../models/market-seller-listings";

import type { CreatorMarketplaceResourceKind } from "@/shared/lib/creator-marketplace-resource-contract";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

type Translate = (ko: string, en: string) => string;

function listingValidationMessage(bt: Translate, reason: SellerListingValidationReason): string {
  switch (reason) {
    case "title-required":
      return bt("제목을 입력하세요.", "Enter a title.");
    case "title-too-long":
      return bt("제목이 너무 길어요.", "The title is too long.");
    case "seller-name-required":
      return bt("판매자 이름이 없어요.", "A seller name is required.");
    case "seller-name-too-long":
      return bt("판매자 이름이 너무 길어요.", "The seller name is too long.");
    case "description-too-long":
      return bt("설명이 너무 길어요 (최대 500자).", "The description is too long (500 characters max).");
    case "price-not-integer":
      return bt("가격은 정수 포인트로 입력하세요.", "Enter the price as whole points.");
    case "price-too-low":
      return bt(`가격은 최소 ${MIN_SELLER_POINT_PRICE}P부터예요.`, `The minimum price is ${MIN_SELLER_POINT_PRICE}P.`);
  }
}

const inputClass =
  "min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const labelClass = "block text-xs font-bold text-fg-2";

export function MarketSellerDashboard({
  surface,
  onChanged,
}: {
  readonly surface: MarketSellerSurface;
  readonly onChanged: () => void;
}) {
  const bt = useBilingual("MarketSellerDashboard");
  const { sellerId, sellerName, myListings, mySales, mySummary, myCampaigns } = surface;

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<CreatorMarketplaceResourceKind>("brush");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("100");
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [campaignDrafts, setCampaignDrafts] = useState<
    Readonly<Record<string, { target: string; hours: string }>>
  >({});

  if (!sellerId || !sellerName) return null;

  const handleCreateListing = (event: FormEvent) => {
    event.preventDefault();
    const result = createSellerListing({
      sellerId,
      sellerName,
      title,
      kind,
      description,
      pointPrice: Number(price),
    });
    if (!result.ok) {
      setFormMessage(listingValidationMessage(bt, result.reason));
      return;
    }
    setTitle("");
    setDescription("");
    setPrice("100");
    setFormMessage(bt("리스팅을 등록했어요. 아래 목록에서 판매 상태를 관리할 수 있어요.", "Listing created. Manage its sale status below."));
    onChanged();
  };

  const handleToggleStatus = (listingId: string, next: "on-sale" | "suspended") => {
    updateSellerListingStatus(listingId, next);
    setActionMessage(
      next === "on-sale"
        ? bt("판매를 재개했어요.", "The listing is on sale again.")
        : bt("판매를 중단했어요. 진행 중인 공동구매가 있어도 새 구매는 막힙니다.", "Sales suspended. New purchases are blocked even if a group buy is open."),
    );
    onChanged();
  };

  const handleOpenCampaign = (listingId: string) => {
    const draft = campaignDrafts[listingId] ?? { target: "3", hours: "72" };
    const targetCount = Number(draft.target);
    const hours = Number(draft.hours);
    const result = createGroupBuyCampaign({
      listingId,
      sellerId,
      targetCount,
      deadlineAt: new Date(Date.now() + hours * 3_600_000),
    });
    setActionMessage(
      result.ok
        ? bt("공동구매를 개설했어요. 공동구매 섹션에서 진행 상황을 볼 수 있어요.", "Group buy opened. Track it in the group buy section.")
        : result.reason === "already-open"
          ? bt("이미 진행 중인 공동구매가 있어요.", "A group buy is already open for this listing.")
          : result.reason === "target-out-of-range"
            ? bt(`목표 인원은 ${MIN_GROUP_BUY_TARGET}~${MAX_GROUP_BUY_TARGET}명이에요.`, `The target must be between ${MIN_GROUP_BUY_TARGET} and ${MAX_GROUP_BUY_TARGET}.`)
            : result.reason === "deadline-out-of-range"
              ? bt(`마감은 최대 ${MAX_GROUP_BUY_DURATION_HOURS / 24}일 뒤까지예요.`, `The deadline can be at most ${MAX_GROUP_BUY_DURATION_HOURS / 24} days out.`)
              : bt("공동구매를 개설하지 못했어요. 판매 중인 리스팅인지 확인하세요.", "Could not open the group buy. Check that the listing is on sale."),
    );
    onChanged();
  };

  const handleCancelCampaign = (campaignId: string) => {
    const result = cancelGroupBuyCampaign({
      campaignId,
      sellerId,
      currentOwnerId: sellerId,
    });
    setActionMessage(
      result.ok
        ? bt("공동구매를 취소했어요. 내 예약이 있으면 환불됐고, 다른 참여자 몫은 그 계정 접속 시 환불됩니다.", "Group buy cancelled. Your reservation was refunded; other participants are refunded on their next visit.")
        : bt("취소할 수 없어요. 이미 종료된 캠페인일 수 있어요.", "Could not cancel. The campaign may already be closed."),
    );
    onChanged();
  };

  return (
    <div className="space-y-8">
      <form
        onSubmit={handleCreateListing}
        className="rounded-2xl border border-line bg-card p-5"
        aria-label={bt("새 리스팅 등록", "Create a new listing")}
      >
        <h3 className="text-base font-bold text-fg">{bt("새 리스팅 등록", "New listing")}</h3>
        <p className="mt-1 text-xs leading-5 text-fg-3">
          {bt(
            "가격은 활동 포인트 전용입니다. 현금 결제·출금은 없어요.",
            "Prices are in activity points only. There is no cash payment or withdrawal.",
          )}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="seller-listing-title" className={labelClass}>
              {bt("제목", "Title")}
            </label>
            <input
              id="seller-listing-title"
              className={cn(inputClass, "mt-1")}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              required
            />
          </div>
          <div>
            <label htmlFor="seller-listing-kind" className={labelClass}>
              {bt("종류", "Kind")}
            </label>
            <select
              id="seller-listing-kind"
              className={cn(inputClass, "mt-1")}
              value={kind}
              onChange={(event) => setKind(event.target.value as CreatorMarketplaceResourceKind)}
            >
              {MARKET_KINDS.map((meta) => (
                <option key={meta.kind} value={meta.kind}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="seller-listing-price" className={labelClass}>
              {bt("포인트 가격", "Point price")}
            </label>
            <input
              id="seller-listing-price"
              className={cn(inputClass, "mt-1")}
              type="number"
              min={MIN_SELLER_POINT_PRICE}
              step={1}
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="seller-listing-description" className={labelClass}>
              {bt("설명 (선택)", "Description (optional)")}
            </label>
            <input
              id="seller-listing-description"
              className={cn(inputClass, "mt-1")}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
            />
          </div>
        </div>
        {formMessage ? (
          <p role="status" className="mt-3 text-sm text-fg">
            {formMessage}
          </p>
        ) : null}
        <button
          type="submit"
          className={buttonClass({ variant: "solid", size: "md", className: "mt-4 min-h-11" })}
        >
          {bt("리스팅 등록", "Create listing")}
        </button>
      </form>

      {actionMessage ? (
        <p role="status" className="rounded-xl border border-line bg-panel px-4 py-3 text-sm text-fg">
          {actionMessage}
        </p>
      ) : null}

      <section aria-label={bt("내 리스팅", "My listings")}>
        <h3 className="text-base font-bold text-fg">
          {bt("내 리스팅", "My listings")}{" "}
          <span className="numeral tnum text-sm text-fg-3">{myListings.length}</span>
        </h3>
        {myListings.length === 0 ? (
          <p className="mt-3 rounded-xl border border-line bg-panel px-4 py-3 text-sm text-fg-2">
            {bt("아직 등록한 리스팅이 없어요. 위 폼에서 첫 리스팅을 만들어 보세요.", "No listings yet. Create your first one with the form above.")}
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {myListings.map((listing) => {
              const openCampaign = myCampaigns.find(
                (campaign) => campaign.listingId === listing.id && campaign.status === "open",
              );
              const draft = campaignDrafts[listing.id] ?? { target: "3", hours: "72" };
              return (
                <li key={listing.id} className="rounded-xl border border-line bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-bold text-fg">{listing.title}</p>
                    <span className="numeral tnum text-sm font-bold text-fg">{listing.pointPrice}P</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className={
                        listing.status === "on-sale"
                          ? "rounded-full bg-good/15 px-2.5 py-0.5 text-xs font-bold text-fg"
                          : "rounded-full bg-raised px-2.5 py-0.5 text-xs font-bold text-fg-2"
                      }
                    >
                      {listing.status === "on-sale" ? bt("판매 중", "On sale") : bt("판매 중단", "Suspended")}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleToggleStatus(
                          listing.id,
                          listing.status === "on-sale" ? "suspended" : "on-sale",
                        )
                      }
                      className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}
                    >
                      {listing.status === "on-sale" ? bt("판매 중단", "Suspend sales") : bt("판매 재개", "Resume sales")}
                    </button>
                  </div>
                  {listing.status === "on-sale" ? (
                    openCampaign ? (
                      <p className="mt-3 text-xs text-fg-2">
                        {bt(
                          `공동구매 진행 중 — ${openCampaign.participations.length}/${openCampaign.targetCount}명, 마감 ${formatMarketDateTime(openCampaign.deadlineAt)}`,
                          `Group buy open — ${openCampaign.participations.length}/${openCampaign.targetCount}, ends ${formatMarketDateTime(openCampaign.deadlineAt)}`,
                        )}
                      </p>
                    ) : (
                      <div className="mt-3 flex flex-wrap items-end gap-2">
                        <div>
                          <label htmlFor={`gb-target-${listing.id}`} className={labelClass}>
                            {bt("목표 인원", "Target")}
                          </label>
                          <input
                            id={`gb-target-${listing.id}`}
                            type="number"
                            min={MIN_GROUP_BUY_TARGET}
                            max={MAX_GROUP_BUY_TARGET}
                            className={cn(inputClass, "mt-1 w-24")}
                            value={draft.target}
                            onChange={(event) =>
                              setCampaignDrafts((prev) => ({
                                ...prev,
                                [listing.id]: { ...draft, target: event.target.value },
                              }))
                            }
                          />
                        </div>
                        <div>
                          <label htmlFor={`gb-hours-${listing.id}`} className={labelClass}>
                            {bt("마감까지 (시간)", "Hours until deadline")}
                          </label>
                          <input
                            id={`gb-hours-${listing.id}`}
                            type="number"
                            min={1}
                            max={MAX_GROUP_BUY_DURATION_HOURS}
                            className={cn(inputClass, "mt-1 w-28")}
                            value={draft.hours}
                            onChange={(event) =>
                              setCampaignDrafts((prev) => ({
                                ...prev,
                                [listing.id]: { ...draft, hours: event.target.value },
                              }))
                            }
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenCampaign(listing.id)}
                          className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}
                        >
                          {bt("공동구매 개설", "Open group buy")}
                        </button>
                      </div>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label={bt("내 공동구매", "My group buys")}>
        <h3 className="text-base font-bold text-fg">
          {bt("내 공동구매", "My group buys")}{" "}
          <span className="numeral tnum text-sm text-fg-3">{myCampaigns.length}</span>
        </h3>
        {myCampaigns.length === 0 ? (
          <p className="mt-3 text-sm text-fg-2">
            {bt("개설한 공동구매가 없어요.", "You have not opened any group buys.")}
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {myCampaigns.map((campaign) => {
              const pendingRefunds = countPendingGroupBuyRefunds(campaign);
              return (
                <li
                  key={campaign.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card p-4"
                >
                  <div className="text-sm text-fg-2">
                    <span className="font-bold text-fg">
                      {myListings.find((listing) => listing.id === campaign.listingId)?.title
                        ?? bt("리스팅", "Listing")}
                    </span>{" "}
                    · {campaign.participations.length}/{campaign.targetCount}
                    {bt("명", " joined")} ·{" "}
                    {campaign.status === "open"
                      ? bt("진행 중", "Open")
                      : campaign.status === "succeeded"
                        ? bt("달성 확정", "Succeeded")
                        : campaign.status === "failed"
                          ? bt("미달 종료", "Ended below target")
                          : bt("취소됨", "Cancelled")}
                    {pendingRefunds > 0
                      ? bt(` · 환불 대기 ${pendingRefunds}명`, ` · ${pendingRefunds} refund(s) pending`)
                      : ""}
                  </div>
                  {campaign.status === "open" ? (
                    <button
                      type="button"
                      onClick={() => handleCancelCampaign(campaign.id)}
                      className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}
                    >
                      {bt("캠페인 취소", "Cancel campaign")}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label={bt("정산 내역", "Settlement")}>
        <h3 className="text-base font-bold text-fg">{bt("정산 내역", "Settlement")}</h3>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              [bt("판매 건수", "Sales"), mySummary.saleCount],
              [bt("총 판매액", "Gross"), mySummary.grossPoints],
              [bt("플랫폼 수수료 (10%)", "Platform fee (10%)"), mySummary.feePoints],
              [bt("정산 예정액", "To settle"), mySummary.settlementPoints],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-xl border border-line bg-card p-4">
              <dt className="text-xs font-bold text-fg-3">{label}</dt>
              <dd className="numeral tnum mt-1 text-lg font-bold text-fg">
                {value}
                {label !== bt("판매 건수", "Sales") ? "P" : ""}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs leading-5 text-fg-3">
          {bt(
            "정산은 이 브라우저의 판매 원장 기록 기준입니다. 포인트 지갑으로의 실제 입금은 서버 정산 계약이 연결될 때 이 기록을 기준으로 처리되며, 지금은 잔액에 가산되지 않습니다.",
            "Settlement figures come from this browser's sales ledger. Actual crediting to the points wallet happens through a server settlement contract once connected; balances are not credited yet.",
          )}
        </p>
        {mySales.length === 0 ? (
          <p className="mt-3 text-sm text-fg-2">{bt("아직 판매 기록이 없어요.", "No sales yet.")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {mySales.map((sale) => (
              <li
                key={sale.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card px-4 py-3 text-sm"
              >
                <span className="min-w-0 truncate font-semibold text-fg">{sale.listingTitle}</span>
                <span className="numeral tnum text-xs text-fg-2">
                  {sale.source === "group-buy" ? bt("공동구매", "Group buy") : bt("직접 구매", "Direct")}{" "}
                  · {bt("총", "Gross")} {sale.grossPoints}P · {bt("수수료", "Fee")} {sale.feePoints}P ·{" "}
                  {bt("정산", "Settle")} {sale.settlementPoints}P · {formatMarketDateTime(sale.occurredAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
