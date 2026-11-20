import { describe, expect, it } from "vitest";

import {
  estimateIpValuationKrw,
  issueCollectorEditionCertificate,
  simulateCrossMediaWaterfall,
} from "./studio-ip-marketplace-finance";

describe("studio-ip-marketplace-finance (Waves 70–79)", () => {
  it("computes cohort IP valuation, cross-media MG waterfall with 1-won exactness, and collector certificates", () => {
    const valuation = estimateIpValuationKrw({
      monthlyPaidReaders: 25_000,
      arpuKrw: 4_000,
      sixMonthRetentionRate: 0.6,
      cleanIpPremiumMultiplier: 1.25,
    });
    expect(valuation).toBe(3_750_000_000);

    const waterfall = simulateCrossMediaWaterfall({
      webtoonRevenueKrw: 40_000_000,
      movingToonRevenueKrw: 15_000_000,
      merchandiseRoyaltyKrw: 8_000_000,
      pplSponsorshipKrw: 7_000_000,
      unrecoupedAdvanceKrw: 20_000_000,
      creatorSplitPercent: 60,
    });
    expect(waterfall.totalGrossRevenueKrw).toBe(70_000_000);
    expect(waterfall.advanceRecoupedKrw).toBe(20_000_000);
    expect(waterfall.remainingAdvanceKrw).toBe(0);
    expect(waterfall.creatorPayoutKrw).toBe(30_000_000);
    expect(waterfall.studioShareKrw).toBe(20_000_000);
    expect(
      waterfall.advanceRecoupedKrw + waterfall.creatorPayoutKrw + waterfall.studioShareKrw,
    ).toBe(waterfall.totalGrossRevenueKrw);

    const cert = issueCollectorEditionCertificate({
      editionNumber: 7,
      maxSupply: 100,
      seriesTitle: "황녀의 검",
      ownerHandle: "@reader_kim",
      masterAuditHash: "fnv1a-bc0b4c27",
    });
    expect(cert.editionNumber).toBe(7);
    expect(cert.certificateDigestHash).toMatch(/^fnv1a-/);
  });
});
