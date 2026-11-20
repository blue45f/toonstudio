import { describe, expect, it } from "vitest";

import {
  evaluateReaderEcosystemTrustIndex,
  matchPiracyLeakCutHashes,
  splitReaderPatronageTip,
} from "./reader-trust-ecosystem";

describe("reader-trust-ecosystem (Waves 80–89)", () => {
  it("matches piracy leak hashes, splits reader tips to 1-won exactness, and computes platinum trust index", () => {
    const leak = matchPiracyLeakCutHashes(["h1", "h2", "h3"], ["h2", "hx"]);
    expect(leak.matchedCount).toBe(1);
    expect(leak.matchedHashes).toEqual(["h2"]);

    const tip = splitReaderPatronageTip({
      grossTipKrw: 10_000,
      paymentFeeRatePercent: 3.5,
      fanTranslatorBonusPercent: 5,
    });
    expect(tip.paymentFeeKrw + tip.creatorDirectKrw + tip.fanTranslatorBonusKrw).toBe(10_000);

    const idx = evaluateReaderEcosystemTrustIndex({
      sealActive: true,
      tenStageVerified: true,
      spoilerShieldEnabled: true,
      triggerTagsDeclared: true,
      dyslexiaSafeTypography: true,
      tdmRepHeaderEnforced: true,
      piracyMatchDetected: false,
    });
    expect(idx.trustScore).toBe(100);
    expect(idx.trustTier).toBe("platinum-clean-ip");
    expect(idx.ecosystemDigestHash).toMatch(/^fnv1a-/);
  });
});
