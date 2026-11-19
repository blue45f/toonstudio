import { describe, expect, it } from "vitest";

import {
  BUILTIN_STUDIO_WORKFLOW_PACKS,
  type StudioWorkflowPack,
} from "../assistant/studio-workflow-pack";
import { generateWorkflowPackRightsReceipt } from "../assistant/studio-workflow-pack-rights-receipt";

import {
  evaluateCreatorAdvanceUnderwriting,
  formatCreatorAdvanceUnderwritingMarkdown,
} from "./studio-creator-advance-underwriting";
import { buildCreatorMgReadinessReport } from "./studio-creator-mg-readiness";
import { buildEpisodeDeliveryPackage } from "./studio-episode-delivery-package";
import { buildEpisodeEscrowSettlement } from "./studio-episode-escrow-settlement";
import { buildEpisodeRightsDossier } from "./studio-episode-rights-dossier";
import { buildStudioSpectrumLicenseOffer } from "./studio-spectrum-license-offer";

function makeSettledEpisode(episodeLabel: string, feeKrw: number) {
  const pkg = buildEpisodeDeliveryPackage({
    seriesTitle: "황녀의 검",
    episodeLabel,
    pack: BUILTIN_STUDIO_WORKFLOW_PACKS[0],
    cuts: [{ cutId: `${episodeLabel}-cut01`, luma9x8: new Uint8Array(72).map((_, i) => i) }],
    generatedAtIso: "2026-11-20T01:00:00.000Z",
  });
  const receipt = JSON.parse(pkg.receiptJson);
  const offer = buildStudioSpectrumLicenseOffer({
    seriesTitle: "황녀의 검",
    episodeLabel,
    tier: "episode-serialization-only",
    baseLicenseFeeKrw: feeKrw,
    participants: [{ role: "art", displayName: "이작화", sharePercent: 100 }],
    receipt,
    optOutManifest: pkg.aiOptOutManifest,
    issuedAtIso: "2026-11-20T01:05:00.000Z",
  });
  return {
    receipt,
    settlement: buildEpisodeEscrowSettlement({
      offer,
      deliveryPackage: pkg,
      platformFeeBps: 500,
      settledAtIso: "2026-11-20T01:10:00.000Z",
    }),
  };
}

describe("studio-creator-advance-underwriting", () => {
  it("approves up to 3x average episode gross for tier-a-verified series with clean IP dossier", () => {
    const ep1 = makeSettledEpisode("1화", 2_000_000);
    const ep2 = makeSettledEpisode("2화", 2_000_000);
    const ep3 = makeSettledEpisode("3화", 2_000_000);

    const dossier = buildEpisodeRightsDossier(
      "황녀의 검",
      [
        { episodeLabel: "1화", receipt: ep1.receipt },
        { episodeLabel: "2화", receipt: ep2.receipt },
        { episodeLabel: "3화", receipt: ep3.receipt },
      ],
      "2026-11-20T01:20:00.000Z",
    );
    const mgReport = buildCreatorMgReadinessReport({
      seriesTitle: "황녀의 검",
      settlements: [ep1.settlement, ep2.settlement, ep3.settlement],
      evaluatedAtIso: "2026-11-20T01:25:00.000Z",
    });

    const underwriting = evaluateCreatorAdvanceUnderwriting({
      dossier,
      mgReport,
      evaluatedAtIso: "2026-11-20T01:30:00.000Z",
    });

    expect(underwriting.decision).toBe("approved");
    expect(underwriting.approvedAdvanceLimitKrw).toBe(6_000_000);
    expect(underwriting.recommendedRecoupmentRatePercent).toBe(20);
    expect(underwriting.estimatedRecoupmentEpisodes).toBe(15);
    expect(underwriting.underwritingIntegrityHash).toMatch(/^fnv1a-[0-9a-f]{8}$/);

    const md = formatCreatorAdvanceUnderwritingMarkdown(underwriting);
    expect(md).toContain("승인 (APPROVED)");
    expect(md).toContain("6,000,000원");
  });

  it("declines advance underwriting when dossier contains a non-commercial blocked episode", () => {
    const ep1 = makeSettledEpisode("1화", 2_000_000);
    const ncPack: StudioWorkflowPack = {
      ...BUILTIN_STUDIO_WORKFLOW_PACKS[0],
      rightsBom: [{ assetLabel: "비상업 소품", license: "CC-BY-NC" }],
    };
    const ncReceipt = generateWorkflowPackRightsReceipt(ncPack);

    const dossier = buildEpisodeRightsDossier("황녀의 검", [
      { episodeLabel: "1화", receipt: ep1.receipt },
      { episodeLabel: "2화", receipt: ncReceipt },
    ]);
    const mgReport = buildCreatorMgReadinessReport({
      seriesTitle: "황녀의 검",
      settlements: [ep1.settlement],
    });

    const underwriting = evaluateCreatorAdvanceUnderwriting({ dossier, mgReport });
    expect(underwriting.decision).toBe("declined");
    expect(underwriting.approvedAdvanceLimitKrw).toBe(0);
    expect(underwriting.declineReasons.length).toBeGreaterThan(0);
  });
});
