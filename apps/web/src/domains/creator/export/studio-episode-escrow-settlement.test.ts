import { describe, expect, it } from "vitest";

import { BUILTIN_STUDIO_WORKFLOW_PACKS } from "../assistant/studio-workflow-pack";

import { buildEpisodeDeliveryPackage } from "./studio-episode-delivery-package";
import {
  buildEpisodeEscrowSettlement,
  formatEscrowSettlementCsv,
} from "./studio-episode-escrow-settlement";
import { buildStudioSpectrumLicenseOffer } from "./studio-spectrum-license-offer";

describe("studio-episode-escrow-settlement", () => {
  it("releases exact 1-won-accurate payouts when delivery package and offer share a verified Rights BOM hash", () => {
    const pack = BUILTIN_STUDIO_WORKFLOW_PACKS[0];
    const pkg = buildEpisodeDeliveryPackage({
      seriesTitle: "황녀의 검",
      episodeLabel: "1화",
      rightsHolder: "스튜디오 알파",
      pack,
      cuts: [{ cutId: "cut-01", luma9x8: new Uint8Array(72).map((_, i) => (i * 7) % 256) }],
      generatedAtIso: "2026-11-19T12:00:00.000Z",
    });

    const offer = buildStudioSpectrumLicenseOffer({
      seriesTitle: "황녀의 검",
      episodeLabel: "1화",
      tier: "secondary-ip-adaptation",
      baseLicenseFeeKrw: 1_000_001, // intentionally indivisible to verify exact largest-remainder rounding
      participants: [
        { role: "story", displayName: "김원작", sharePercent: 33.33 },
        { role: "art", displayName: "이작화", sharePercent: 33.33 },
        { role: "bg3d-assistant", displayName: "박배경", sharePercent: 33.34 },
      ],
      receipt: JSON.parse(pkg.receiptJson),
      optOutManifest: pkg.aiOptOutManifest,
      issuedAtIso: "2026-11-19T12:05:00.000Z",
    });

    const settlement = buildEpisodeEscrowSettlement({
      offer,
      deliveryPackage: pkg,
      platformFeeBps: 500, // 5%
      settledAtIso: "2026-11-19T12:10:00.000Z",
    });

    expect(settlement.status).toBe("ready-for-release");
    expect(settlement.holdReason).toBeNull();
    const totalPaid = settlement.payouts.reduce((sum, p) => sum + p.payoutKrw, 0);
    expect(totalPaid).toBe(settlement.netDistributableKrw);
    expect(settlement.platformFeeKrw + totalPaid).toBe(settlement.grossAmountKrw);
    expect(settlement.settlementIntegrityHash).toMatch(/^fnv1a-[0-9a-f]{8}$/);

    const csv = formatEscrowSettlementCsv(settlement);
    expect(csv).toContain("ready-for-release");
    expect(csv).toContain(settlement.settlementIntegrityHash);
  });

  it("holds payout release if delivery package and offer reference different Rights BOM receipts", () => {
    const pkg1 = buildEpisodeDeliveryPackage({
      seriesTitle: "황녀의 검",
      episodeLabel: "1화",
      pack: BUILTIN_STUDIO_WORKFLOW_PACKS[0],
      cuts: [{ cutId: "cut-01", luma9x8: new Uint8Array(72) }],
    });
    const pkg2 = buildEpisodeDeliveryPackage({
      seriesTitle: "황녀의 검",
      episodeLabel: "1화",
      pack: BUILTIN_STUDIO_WORKFLOW_PACKS[1],
      cuts: [{ cutId: "cut-01", luma9x8: new Uint8Array(72) }],
    });

    const offerForPkg1 = buildStudioSpectrumLicenseOffer({
      seriesTitle: "황녀의 검",
      episodeLabel: "1화",
      tier: "episode-serialization-only",
      baseLicenseFeeKrw: 2_000_000,
      participants: [{ role: "art", displayName: "이작화", sharePercent: 100 }],
      receipt: JSON.parse(pkg1.receiptJson),
      optOutManifest: pkg1.aiOptOutManifest,
    });

    const held = buildEpisodeEscrowSettlement({
      offer: offerForPkg1,
      deliveryPackage: pkg2,
    });

    expect(held.status).toBe("held");
    expect(held.holdReason).toContain("해시가 일치하지 않습니다");
    expect(held.netDistributableKrw).toBe(0);
    expect(held.payouts[0].payoutKrw).toBe(0);
  });
});
