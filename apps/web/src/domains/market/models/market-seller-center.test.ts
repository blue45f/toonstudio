import { describe, expect, it } from "vitest";

import {
  SELLER_CENTER_PATH,
  SELLER_CENTER_TABS,
  SELLER_LISTING_WIZARD_STEPS,
  SELLER_PACKAGES_PATH,
  SELLER_REGISTER_PATH,
  sellerCenterTabForPath,
  sellerListingWizardStepForReason,
} from "./market-seller-center";

describe("market seller center (S1-5)", () => {
  it("declares /market/seller as the single canonical entry", () => {
    expect(SELLER_CENTER_PATH).toBe("/market/seller");
    expect(SELLER_CENTER_TABS[0]).toMatchObject({
      id: "center",
      href: "/market/seller",
    });
  });

  it("keeps the legacy register/manage URLs as tab deeplinks", () => {
    expect(SELLER_REGISTER_PATH).toBe("/market/publish");
    expect(SELLER_PACKAGES_PATH).toBe("/market/manage");
    const hrefs = SELLER_CENTER_TABS.map((tab) => tab.href);
    expect(hrefs).toEqual(["/market/seller", "/market/publish", "/market/manage"]);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("maps each seller path to exactly one tab and unknown paths to none", () => {
    expect(sellerCenterTabForPath("/market/seller")).toBe("center");
    expect(sellerCenterTabForPath("/market/publish")).toBe("register");
    expect(sellerCenterTabForPath("/market/manage")).toBe("packages");
    expect(sellerCenterTabForPath("/market/seller/")).toBe("center");
    expect(sellerCenterTabForPath("/market/browse")).toBeNull();
    expect(sellerCenterTabForPath("/market")).toBeNull();
  });

  it("defines the listing wizard as three ordered steps ending in review", () => {
    expect(SELLER_LISTING_WIZARD_STEPS.map((step) => step.id)).toEqual([
      "details",
      "pricing",
      "review",
    ]);
  });

  it("assigns every listing validation reason to the wizard step that owns its input", () => {
    expect(sellerListingWizardStepForReason("title-required")).toBe("details");
    expect(sellerListingWizardStepForReason("title-too-long")).toBe("details");
    expect(sellerListingWizardStepForReason("seller-name-required")).toBe("details");
    expect(sellerListingWizardStepForReason("seller-name-too-long")).toBe("details");
    expect(sellerListingWizardStepForReason("description-too-long")).toBe("pricing");
    expect(sellerListingWizardStepForReason("price-not-integer")).toBe("pricing");
    expect(sellerListingWizardStepForReason("price-too-low")).toBe("pricing");
  });
});
