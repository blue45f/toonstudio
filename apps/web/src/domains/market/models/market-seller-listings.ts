/**
 * Market Seller Listings — 판매자 생태계 최소 단위 (클라이언트 상태 경계).
 *
 * 실측 배경 (2026-10-06, impl-market-ecosystem.md):
 * - 마켓 리소스 계약(`CreatorMarketplaceResourceRecord`)에는 게시자(publisher) 표시는 있지만
 *   가격 필드가 없고 access가 "free"로 고정돼 있어, 포인트 가격을 다는 판매 리스팅은
 *   서버 계약이 아니라 이 로컬 모델이 담당한다.
 * - 저장은 market-custom-registry와 같은 방식(localStorage + CustomEvent 전파)을 따른다.
 *   서버 판매자 계약이 생기면 이 스토어만 원격 어댑터로 교체한다.
 *
 * 규칙 (테스트로 고정):
 * - 포인트 가격은 정수, 최소 10P (포인트 정책의 최소 가격과 동일 기준).
 * - 상태는 "on-sale"(판매 중) | "suspended"(판매 중단) 두 가지뿐이며,
 *   중단된 리스팅은 구매·공동구매 개설이 불가능하다.
 * - 현금 결제·출금은 없다. 포인트 전용.
 */

import type { CreatorMarketplaceResourceKind } from "@/shared/lib/creator-marketplace-resource-contract";

export type SellerListingStatus = "on-sale" | "suspended";

export interface SellerListing {
  readonly id: string;
  readonly sellerId: string;
  readonly sellerName: string;
  readonly title: string;
  readonly kind: CreatorMarketplaceResourceKind;
  readonly description: string;
  /** 포인트 가격. 구매 시 포인트 원장의 spend resourceId는 리스팅 id를 그대로 쓴다. */
  readonly pointPrice: number;
  readonly status: SellerListingStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** 포인트 정책(asset-points-policy)의 최소 포인트 가격과 맞춘 하한. */
export const MIN_SELLER_POINT_PRICE = 10;
export const MAX_SELLER_LISTING_TITLE_LENGTH = 80;
export const MAX_SELLER_NAME_LENGTH = 40;
export const MAX_SELLER_DESCRIPTION_LENGTH = 500;

export const SELLER_LISTINGS_STORAGE_KEY = "toonspectrum:market:seller-listings:v1";
export const MARKET_SELLER_LISTINGS_EVENT = "toonspectrum:market:seller-listings-updated";

export type SellerListingValidationReason =
  | "title-required"
  | "title-too-long"
  | "seller-name-required"
  | "seller-name-too-long"
  | "description-too-long"
  | "price-not-integer"
  | "price-too-low";

export interface SellerListingInput {
  readonly sellerId: string;
  readonly sellerName: string;
  readonly title: string;
  readonly kind: CreatorMarketplaceResourceKind;
  readonly description: string;
  readonly pointPrice: number;
}

export type SellerListingValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: SellerListingValidationReason };

export function validateSellerListingInput(
  input: SellerListingInput,
): SellerListingValidation {
  const title = input.title.trim();
  if (!title) return { ok: false, reason: "title-required" };
  if (title.length > MAX_SELLER_LISTING_TITLE_LENGTH) {
    return { ok: false, reason: "title-too-long" };
  }
  const sellerName = input.sellerName.trim();
  if (!sellerName) return { ok: false, reason: "seller-name-required" };
  if (sellerName.length > MAX_SELLER_NAME_LENGTH) {
    return { ok: false, reason: "seller-name-too-long" };
  }
  if (input.description.trim().length > MAX_SELLER_DESCRIPTION_LENGTH) {
    return { ok: false, reason: "description-too-long" };
  }
  if (!Number.isInteger(input.pointPrice)) {
    return { ok: false, reason: "price-not-integer" };
  }
  if (input.pointPrice < MIN_SELLER_POINT_PRICE) {
    return { ok: false, reason: "price-too-low" };
  }
  return { ok: true };
}

function isSellerListing(value: unknown): value is SellerListing {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SellerListing>;
  return (
    typeof candidate.id === "string"
    && candidate.id.length > 0
    && typeof candidate.sellerId === "string"
    && candidate.sellerId.length > 0
    && typeof candidate.sellerName === "string"
    && typeof candidate.title === "string"
    && typeof candidate.kind === "string"
    && typeof candidate.description === "string"
    && typeof candidate.pointPrice === "number"
    && Number.isInteger(candidate.pointPrice)
    && (candidate.status === "on-sale" || candidate.status === "suspended")
    && typeof candidate.createdAt === "string"
    && typeof candidate.updatedAt === "string"
  );
}

function emitSellerListingsUpdate(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(MARKET_SELLER_LISTINGS_EVENT));
  }
}

export function getSellerListings(): SellerListing[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SELLER_LISTINGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.flatMap((candidate) => {
      if (!isSellerListing(candidate) || seen.has(candidate.id)) return [];
      seen.add(candidate.id);
      return [candidate];
    });
  } catch {
    return [];
  }
}

export function saveSellerListings(listings: readonly SellerListing[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SELLER_LISTINGS_STORAGE_KEY, JSON.stringify(listings));
    emitSellerListingsUpdate();
  } catch {
    // 저장 실패는 조용히 넘기지 않고 호출자가 다시 읽어 확인한다.
  }
}

export function getSellerListingById(id: string): SellerListing | null {
  return getSellerListings().find((listing) => listing.id === id) ?? null;
}

export function getListingsBySeller(sellerId: string): SellerListing[] {
  return getSellerListings().filter((listing) => listing.sellerId === sellerId);
}

export type CreateSellerListingResult =
  | { readonly ok: true; readonly listing: SellerListing }
  | { readonly ok: false; readonly reason: SellerListingValidationReason };

export function createSellerListing(
  input: SellerListingInput,
  now: Date = new Date(),
): CreateSellerListingResult {
  const validation = validateSellerListingInput(input);
  if (!validation.ok) return validation;
  const timestamp = now.toISOString();
  const listing: SellerListing = {
    id: globalThis.crypto.randomUUID(),
    sellerId: input.sellerId,
    sellerName: input.sellerName.trim(),
    title: input.title.trim(),
    kind: input.kind,
    description: input.description.trim(),
    pointPrice: input.pointPrice,
    status: "on-sale",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  saveSellerListings([listing, ...getSellerListings()]);
  return { ok: true, listing };
}

export function updateSellerListingStatus(
  id: string,
  status: SellerListingStatus,
  now: Date = new Date(),
): SellerListing | null {
  const listings = getSellerListings();
  const index = listings.findIndex((listing) => listing.id === id);
  if (index < 0) return null;
  const updated: SellerListing = {
    ...listings[index],
    status,
    updatedAt: now.toISOString(),
  };
  const next = [...listings];
  next[index] = updated;
  saveSellerListings(next);
  return updated;
}

/** 구매 가능한 리스팅인지 판정한다. 중단·삭제된 리스팅은 살 수 없다. */
export function isSellerListingPurchasable(listing: SellerListing | null): boolean {
  return listing !== null && listing.status === "on-sale";
}
