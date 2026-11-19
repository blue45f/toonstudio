import { describe, expect, it } from "vitest";

import { BUILTIN_STUDIO_WORKFLOW_PACKS } from "../assistant/studio-workflow-pack";

import {
  buildCreatorMgReadinessReport,
  formatCreatorMgReadinessMarkdown,
} from "./studio-creator-mg-readiness";
import { buildEpisodeDeliveryPackage } from "./studio-episode-delivery-package";
import { buildEpisodeEscrowSettlement } from "./studio-episode-escrow-settlement";
import { buildStudioSpectrumLicenseOffer } from "./studio-spectrum-license-offer";

function createVerifiedSettlement(episodeLabel: string, feeKrw: number) {
  const pkg = buildEpisodeDeliveryPackage({
    seriesTitle: "황녀의 검",
    episodeLabel,
    pack: BUILTIN_STUDIO_WORKFLOW_PACKS[0],
    cuts: [{ cutId: `${episodeLabel}-cut01`, luma9x8: new Uint8Array(72).map((_, i) => i) }],
    generatedAtIso: "2026-11-19T12:00:00.000Z",
  });
  const offer = buildStudioSpectrumLicenseOffer({
    seriesTitle: "황녀의 검",
    episodeLabel,
    tier: "episode-serialization-only",
    baseLicenseFeeKrw: feeKrw,
    participants: [{ role: "art", displayName: "이작화", sharePercent: 100 }],
    receipt: JSON.parse(pkg.receiptJson),
    optOutManifest: pkg.aiOptOutManifest,
    issuedAtIso: "2026-11-19T12:05:00.000Z",
  });
  return buildEpisodeEscrowSettlement({
    offer,
    deliveryPackage: pkg,
    platformFeeBps: 500,
    settledAtIso: "2026-11-19T12:10:00.000Z",
  });
}

describe("studio-creator-mg-readiness", () => {
  it("awards tier-a-verified when 3+ consecutive episodes pass commercial escrow settlement cleanly", () => {
    const settlements = [
      createVerifiedSettlement("1화", 2_000_000),
      createVerifiedSettlement("2화", 2_000_000),
      createVerifiedSettlement("3화", 2_600_000),
    ];

    const report = buildCreatorMgReadinessReport({
      seriesTitle: "황녀의 검",
      settlements,
      evaluatedAtIso: "2026-11-19T15:00:00.000Z",
    });

    expect(report.reliabilityTier).toBe("tier-a-verified");
    expect(report.releaseRatePercent).toBe(100);
    expect(report.cumulativeGrossKrw).toBe(6_600_000);
    expect(report.averageGrossPerEpisodeKrw).toBe(2_200_000);
    expect(report.readinessDigestHash).toMatch(/^fnv1a-[0-9a-f]{8}$/);

    const md = formatCreatorMgReadinessMarkdown(report);
    expect(md).toContain("tier-a-verified");
    expect(md).toContain("6,600,000원");
  });

  it("downgrades reliability tier when settlements are held or insufficient", () => {
    const report = buildCreatorMgReadinessReport({
      seriesTitle: "신작 테스트",
      settlements: [],
    });
    expect(report.reliabilityTier).toBe("tier-c-review-required");
    expect(report.releaseRatePercent).toBe(0);
  });
});
