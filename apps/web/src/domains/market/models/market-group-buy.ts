/**
 * Market Group Buy — 공동구매 캠페인 (클라이언트 상태 경계).
 *
 * 흐름 (상태 전이는 테스트로 고정):
 * - 개설: 판매 중인 리스팅에 목표 인원(2명 이상)과 마감 시각을 건다. 상태 "open".
 * - 참여(예약): 구매자 지갑에서 리스팅 가격만큼 spend 한다. resourceId는 캠페인
 *   전용(`group-buy:<campaignId>`)이라 리스팅 직접 구매의 소유 판정과 섞이지 않고,
 *   같은 캠페인을 두 번 예약할 수 없다 (원장의 already-owned 판정을 그대로 쓴다).
 * - 달성 확정: 서로 다른 참여자가 목표 인원에 닿으면 즉시 "succeeded"로 확정하고
 *   참여자마다 판매 기록(source "group-buy")을 남긴다. 정산 규칙은 직접 구매와
 *   같은 원장(splitSalePoints)을 쓴다.
 * - 미달 환불: 마감 시각이 지났는데 목표 미달이면 "failed"로 닫고, 참여자 전원의
 *   예약 spend를 refundSpend로 전액 되돌린 뒤 환불 기록을 남긴다.
 * - 취소: 개설자(판매자)만 마감 전에 취소할 수 있고, 이때도 전액 환불한다.
 *
 * 경계 (위장 금지):
 * - 환불(refundSpend)과 예약 차감은 "현재 세션 계정의 지갑"에서만 실행할 수 있다.
 *   그래서 다른 계정이 예약한 몫의 환불은 이 세션에서 실행하지 않고 캠페인 기록에
 *   "환불 대기"로 남긴다 — 그 계정이 다음에 세션을 열면 보류 환불을 자기 지갑에
 *   적용하는 것까지가 클라이언트 경계이고, 서버 정산 계약이 생기면 이 대기는
 *   서버가 즉시 처리하는 것으로 승격한다.
 * - 정산 포인트는 판매 원장 기록·표시까지만. 지갑 가산은 하지 않는다
 *   (market-sales-ledger.ts의 경계와 동일).
 * - 현금 결제·출금은 없다. 포인트 전용.
 */

import {
  ownedResourceIds,
  readCurrentOwnerAssetPointEvents,
  useAssetPointsStore,
} from "@/domains/account/public/asset-points";

import {
  recordMarketSale,
  type MarketSaleRecord,
} from "./market-sales-ledger";
import {
  getSellerListingById,
  isSellerListingPurchasable,
  type SellerListing,
} from "./market-seller-listings";

export const MIN_GROUP_BUY_TARGET = 2;
export const MAX_GROUP_BUY_TARGET = 100;
export const MAX_GROUP_BUY_DURATION_HOURS = 24 * 30;

export const GROUP_BUY_CAMPAIGNS_STORAGE_KEY = "toonspectrum:market:group-buy:v1";
export const MARKET_GROUP_BUY_EVENT = "toonspectrum:market:group-buy-updated";

export type GroupBuyCampaignStatus =
  | "open"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface GroupBuyParticipation {
  readonly buyerId: string;
  readonly buyerName: string;
  /** 예약 차감한 지갑 spend 이벤트 ID. 환불·판매 기록 대조용. */
  readonly spendEventId: string;
  readonly reservedPoints: number;
  readonly reservedAt: string;
  /** 환불이 실제로 지갑에 적용된 경우 채운다. 남의 지갑 몫은 "대기"로 남는다. */
  readonly refundedAt: string | null;
  /** 달성 확정 시 생성된 판매 기록 ID. */
  readonly saleRecordId: string | null;
}

export interface GroupBuyCampaign {
  readonly id: string;
  readonly listingId: string;
  readonly sellerId: string;
  readonly status: GroupBuyCampaignStatus;
  readonly targetCount: number;
  readonly deadlineAt: string;
  readonly createdAt: string;
  readonly closedAt: string | null;
  readonly participations: readonly GroupBuyParticipation[];
}

/** 예약 spend가 지갑 원장에 남기는 resourceId. 리스팅 직접 구매와 분리한다. */
export function groupBuyReservationResourceId(campaignId: string): string {
  return `group-buy:${campaignId}`;
}

function isGroupBuyParticipation(value: unknown): value is GroupBuyParticipation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GroupBuyParticipation>;
  return (
    typeof candidate.buyerId === "string"
    && typeof candidate.buyerName === "string"
    && typeof candidate.spendEventId === "string"
    && typeof candidate.reservedPoints === "number"
    && typeof candidate.reservedAt === "string"
    && (typeof candidate.refundedAt === "string" || candidate.refundedAt === null)
    && (typeof candidate.saleRecordId === "string" || candidate.saleRecordId === null)
  );
}

function isGroupBuyCampaign(value: unknown): value is GroupBuyCampaign {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GroupBuyCampaign>;
  return (
    typeof candidate.id === "string"
    && candidate.id.length > 0
    && typeof candidate.listingId === "string"
    && typeof candidate.sellerId === "string"
    && (candidate.status === "open"
      || candidate.status === "succeeded"
      || candidate.status === "failed"
      || candidate.status === "cancelled")
    && typeof candidate.targetCount === "number"
    && Number.isInteger(candidate.targetCount)
    && typeof candidate.deadlineAt === "string"
    && typeof candidate.createdAt === "string"
    && (typeof candidate.closedAt === "string" || candidate.closedAt === null)
    && Array.isArray(candidate.participations)
    && candidate.participations.every(isGroupBuyParticipation)
  );
}

function emitGroupBuyUpdate(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(MARKET_GROUP_BUY_EVENT));
  }
}

export function getGroupBuyCampaigns(): GroupBuyCampaign[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(GROUP_BUY_CAMPAIGNS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.flatMap((candidate) => {
      if (!isGroupBuyCampaign(candidate) || seen.has(candidate.id)) return [];
      seen.add(candidate.id);
      return [candidate];
    });
  } catch {
    return [];
  }
}

export function saveGroupBuyCampaigns(campaigns: readonly GroupBuyCampaign[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GROUP_BUY_CAMPAIGNS_STORAGE_KEY, JSON.stringify(campaigns));
    emitGroupBuyUpdate();
  } catch {
    // 저장 실패 시에도 반환값으로 상태를 알리므로 호출자가 다시 읽어 확인한다.
  }
}

export function getGroupBuyCampaignById(id: string): GroupBuyCampaign | null {
  return getGroupBuyCampaigns().find((campaign) => campaign.id === id) ?? null;
}

export function getGroupBuyCampaignsBySeller(sellerId: string): GroupBuyCampaign[] {
  return getGroupBuyCampaigns().filter((campaign) => campaign.sellerId === sellerId);
}

export function getOpenGroupBuyCampaigns(): GroupBuyCampaign[] {
  return getGroupBuyCampaigns().filter((campaign) => campaign.status === "open");
}

function replaceCampaign(next: GroupBuyCampaign): GroupBuyCampaign {
  const campaigns = getGroupBuyCampaigns();
  const index = campaigns.findIndex((campaign) => campaign.id === next.id);
  if (index < 0) return next;
  const copy = [...campaigns];
  copy[index] = next;
  saveGroupBuyCampaigns(copy);
  return next;
}

export type CreateGroupBuyCampaignResult =
  | { readonly ok: true; readonly campaign: GroupBuyCampaign }
  | {
      readonly ok: false;
      readonly reason:
        | "listing-not-found"
        | "not-on-sale"
        | "not-seller"
        | "already-open"
        | "target-out-of-range"
        | "deadline-out-of-range";
    };

/** 판매 중인 자기 리스팅에 공동구매를 개설한다. 리스팅당 진행 중 캠페인은 하나뿐이다. */
export function createGroupBuyCampaign(input: {
  readonly listingId: string;
  readonly sellerId: string;
  readonly targetCount: number;
  readonly deadlineAt: Date;
  readonly now?: Date;
}): CreateGroupBuyCampaignResult {
  const now = input.now ?? new Date();
  const listing = getSellerListingById(input.listingId);
  if (!listing) return { ok: false, reason: "listing-not-found" };
  if (!isSellerListingPurchasable(listing)) return { ok: false, reason: "not-on-sale" };
  if (listing.sellerId !== input.sellerId) return { ok: false, reason: "not-seller" };
  if (
    !Number.isInteger(input.targetCount)
    || input.targetCount < MIN_GROUP_BUY_TARGET
    || input.targetCount > MAX_GROUP_BUY_TARGET
  ) {
    return { ok: false, reason: "target-out-of-range" };
  }
  const durationMs = input.deadlineAt.getTime() - now.getTime();
  if (
    !Number.isFinite(durationMs)
    || durationMs <= 0
    || durationMs > MAX_GROUP_BUY_DURATION_HOURS * 3_600_000
  ) {
    return { ok: false, reason: "deadline-out-of-range" };
  }
  const alreadyOpen = getGroupBuyCampaigns().some(
    (campaign) => campaign.listingId === listing.id && campaign.status === "open",
  );
  if (alreadyOpen) return { ok: false, reason: "already-open" };
  const timestamp = now.toISOString();
  const campaign: GroupBuyCampaign = {
    id: globalThis.crypto.randomUUID(),
    listingId: listing.id,
    sellerId: listing.sellerId,
    status: "open",
    targetCount: input.targetCount,
    deadlineAt: input.deadlineAt.toISOString(),
    createdAt: timestamp,
    closedAt: null,
    participations: [],
  };
  saveGroupBuyCampaigns([campaign, ...getGroupBuyCampaigns()]);
  return { ok: true, campaign };
}

export type JoinGroupBuyResult =
  | { readonly ok: true; readonly campaign: GroupBuyCampaign }
  | {
      readonly ok: false;
      readonly reason:
        | "campaign-not-found"
        | "not-open"
        | "expired"
        | "listing-unavailable"
        | "own-listing"
        | "already-joined"
        | "already-owned"
        | "insufficient";
    };

/**
 * 공동구매에 참여(예약 차감)한다. 현재 세션 계정이 참여자다.
 * 목표 인원에 닿는 참여이면 그 자리에서 캠페인을 확정하고 전원 판매 기록을 남긴다.
 */
export function joinGroupBuyCampaign(input: {
  readonly campaignId: string;
  readonly buyerId: string;
  readonly buyerName: string;
  readonly now?: Date;
}): JoinGroupBuyResult {
  const now = input.now ?? new Date();
  const campaign = getGroupBuyCampaignById(input.campaignId);
  if (!campaign) return { ok: false, reason: "campaign-not-found" };
  if (campaign.status !== "open") return { ok: false, reason: "not-open" };
  if (now.getTime() >= new Date(campaign.deadlineAt).getTime()) {
    settleExpiredGroupBuyCampaign(campaign.id, now);
    return { ok: false, reason: "expired" };
  }
  const listing = getSellerListingById(campaign.listingId);
  if (!isSellerListingPurchasable(listing) || !listing) {
    return { ok: false, reason: "listing-unavailable" };
  }
  if (listing.sellerId === input.buyerId) return { ok: false, reason: "own-listing" };
  if (campaign.participations.some((entry) => entry.buyerId === input.buyerId)) {
    return { ok: false, reason: "already-joined" };
  }
  const events = readCurrentOwnerAssetPointEvents();
  if (ownedResourceIds(events).has(listing.id)) {
    return { ok: false, reason: "already-owned" };
  }
  const spend = useAssetPointsStore.getState().spendForResource({
    resourceId: groupBuyReservationResourceId(campaign.id),
    resourceName: listing.title,
    pointPrice: listing.pointPrice,
    now,
  });
  if (!spend.ok) return { ok: false, reason: spend.reason };
  const participation: GroupBuyParticipation = {
    buyerId: input.buyerId,
    buyerName: input.buyerName,
    spendEventId: spend.eventId,
    reservedPoints: listing.pointPrice,
    reservedAt: now.toISOString(),
    refundedAt: null,
    saleRecordId: null,
  };
  const joined: GroupBuyCampaign = {
    ...campaign,
    participations: [...campaign.participations, participation],
  };
  if (joined.participations.length >= joined.targetCount) {
    return { ok: true, campaign: confirmGroupBuyCampaign(joined, listing, now) };
  }
  replaceCampaign(joined);
  return { ok: true, campaign: joined };
}

/** 목표 달성 캠페인을 확정하고 참여자 전원의 판매 기록을 남긴다. */
function confirmGroupBuyCampaign(
  campaign: GroupBuyCampaign,
  listing: SellerListing,
  now: Date,
): GroupBuyCampaign {
  const participations = campaign.participations.map((entry) => {
    const sale: MarketSaleRecord = recordMarketSale({
      listing,
      buyerId: entry.buyerId,
      grossPoints: entry.reservedPoints,
      spendEventId: entry.spendEventId,
      source: "group-buy",
      campaignId: campaign.id,
      now,
    });
    return { ...entry, saleRecordId: sale.id };
  });
  const confirmed: GroupBuyCampaign = {
    ...campaign,
    status: "succeeded",
    closedAt: now.toISOString(),
    participations,
  };
  replaceCampaign(confirmed);
  return confirmed;
}

/**
 * 닫힌(미달·취소) 캠페인의 환불을 적용한다. 현재 세션 계정 몫만 지갑에
 * 되돌릴 수 있고, 다른 계정 몫은 환불 대기로 남는다 (파일 머리말의 경계).
 */
function applyGroupBuyRefunds(
  campaign: GroupBuyCampaign,
  currentOwnerId: string | null,
  now: Date,
): GroupBuyCampaign {
  let changed = false;
  const participations = campaign.participations.map((entry) => {
    if (entry.refundedAt || entry.buyerId !== currentOwnerId) return entry;
    const refunded = useAssetPointsStore.getState().refundSpend(entry.spendEventId, now);
    if (!refunded) return entry;
    changed = true;
    return { ...entry, refundedAt: now.toISOString() };
  });
  if (!changed) return campaign;
  const next: GroupBuyCampaign = { ...campaign, participations };
  replaceCampaign(next);
  return next;
}

export type SettleGroupBuyResult =
  | { readonly ok: true; readonly campaign: GroupBuyCampaign }
  | { readonly ok: false; readonly reason: "campaign-not-found" };

/**
 * 마감 지난 open 캠페인을 미달로 닫고 환불을 적용한다.
 * 이미 닫힌 캠페인이면 현재 세션 계정 몫의 보류 환불만 마저 적용한다.
 */
export function settleExpiredGroupBuyCampaign(
  campaignId: string,
  now: Date = new Date(),
  currentOwnerId: string | null = null,
): SettleGroupBuyResult {
  const campaign = getGroupBuyCampaignById(campaignId);
  if (!campaign) return { ok: false, reason: "campaign-not-found" };
  if (campaign.status === "open") {
    if (now.getTime() < new Date(campaign.deadlineAt).getTime()) {
      return { ok: true, campaign };
    }
    const failed: GroupBuyCampaign = {
      ...campaign,
      status: "failed",
      closedAt: now.toISOString(),
    };
    replaceCampaign(failed);
    return { ok: true, campaign: applyGroupBuyRefunds(failed, currentOwnerId, now) };
  }
  if (campaign.status === "failed" || campaign.status === "cancelled") {
    return { ok: true, campaign: applyGroupBuyRefunds(campaign, currentOwnerId, now) };
  }
  return { ok: true, campaign };
}

export type CancelGroupBuyResult =
  | { readonly ok: true; readonly campaign: GroupBuyCampaign }
  | {
      readonly ok: false;
      readonly reason: "campaign-not-found" | "not-open" | "not-seller";
    };

/** 개설자(판매자)만 마감 전에 취소할 수 있다. 취소도 참여자 전액 환불이 원칙이다. */
export function cancelGroupBuyCampaign(input: {
  readonly campaignId: string;
  readonly sellerId: string;
  readonly currentOwnerId?: string | null;
  readonly now?: Date;
}): CancelGroupBuyResult {
  const now = input.now ?? new Date();
  const campaign = getGroupBuyCampaignById(input.campaignId);
  if (!campaign) return { ok: false, reason: "campaign-not-found" };
  if (campaign.status !== "open") return { ok: false, reason: "not-open" };
  if (campaign.sellerId !== input.sellerId) return { ok: false, reason: "not-seller" };
  const cancelled: GroupBuyCampaign = {
    ...campaign,
    status: "cancelled",
    closedAt: now.toISOString(),
  };
  replaceCampaign(cancelled);
  return {
    ok: true,
    campaign: applyGroupBuyRefunds(cancelled, input.currentOwnerId ?? null, now),
  };
}

/** 환불이 아직 지갑에 적용되지 않은 참여 수. 표면에서 "환불 대기"로 정직하게 표시한다. */
export function countPendingGroupBuyRefunds(campaign: GroupBuyCampaign): number {
  if (campaign.status !== "failed" && campaign.status !== "cancelled") return 0;
  return campaign.participations.filter((entry) => !entry.refundedAt).length;
}
