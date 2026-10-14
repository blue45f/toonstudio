// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  createSellerListing,
  getListingsBySeller,
  removeSellerListings,
  SELLER_LISTINGS_STORAGE_KEY,
  updateSellerListingsPrice,
  updateSellerListingsStatus,
} from "./market-seller-listings";

function seedListing(sellerId: string, title: string, pointPrice = 100): string {
  const result = createSellerListing({
    sellerId,
    sellerName: "판매자",
    title,
    kind: "brush",
    description: "",
    pointPrice,
  });
  if (!result.ok) throw new Error("seed failed");
  return result.listing.id;
}

beforeEach(() => {
  localStorage.removeItem(SELLER_LISTINGS_STORAGE_KEY);
});

describe("seller listing bulk operations", () => {
  it("updates prices for only the seller's selected listings in one pass", () => {
    const a = seedListing("seller-1", "브러시 A");
    const b = seedListing("seller-1", "브러시 B");
    const other = seedListing("seller-2", "남의 브러시");

    const result = updateSellerListingsPrice("seller-1", [a, b, other], 250);
    expect(result).toEqual({ ok: true, updated: 2 });
    expect(getListingsBySeller("seller-1").map((listing) => listing.pointPrice)).toEqual([250, 250]);
    expect(getListingsBySeller("seller-2")[0]?.pointPrice).toBe(100);
  });

  it("rejects a bulk price that violates the single-listing price rules", () => {
    const a = seedListing("seller-1", "브러시 A");
    expect(updateSellerListingsPrice("seller-1", [a], 9)).toEqual({
      ok: false,
      reason: "price-too-low",
    });
    expect(updateSellerListingsPrice("seller-1", [a], 10.5)).toEqual({
      ok: false,
      reason: "price-not-integer",
    });
    expect(getListingsBySeller("seller-1")[0]?.pointPrice).toBe(100);
  });

  it("updates status and removes listings in bulk, scoped to the seller", () => {
    const a = seedListing("seller-1", "브러시 A");
    const b = seedListing("seller-1", "브러시 B");
    const c = seedListing("seller-1", "브러시 C");

    expect(updateSellerListingsStatus("seller-1", [a, b], "suspended")).toBe(2);
    expect(
      getListingsBySeller("seller-1").filter((listing) => listing.status === "suspended"),
    ).toHaveLength(2);

    expect(removeSellerListings("seller-1", [b, c])).toBe(2);
    expect(getListingsBySeller("seller-1").map((listing) => listing.id)).toEqual([a]);
    expect(removeSellerListings("seller-2", [a])).toBe(0);
  });

  it("treats an empty selection as a no-op", () => {
    seedListing("seller-1", "브러시 A");
    expect(updateSellerListingsPrice("seller-1", [], 300)).toEqual({ ok: true, updated: 0 });
    expect(updateSellerListingsStatus("seller-1", [], "suspended")).toBe(0);
    expect(removeSellerListings("seller-1", [])).toBe(0);
    expect(getListingsBySeller("seller-1")).toHaveLength(1);
  });
});
