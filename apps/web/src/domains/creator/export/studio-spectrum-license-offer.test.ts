import { describe, expect, it } from "vitest";

import {
  BUILTIN_STUDIO_WORKFLOW_PACKS,
  type StudioWorkflowPack,
} from "../assistant/studio-workflow-pack";
import { generateWorkflowPackRightsReceipt } from "../assistant/studio-workflow-pack-rights-receipt";

import { buildStudioAiOptOutManifest } from "./studio-ai-optout-manifest";
import { buildCutPerceptualRightsEntry } from "./studio-cut-perceptual-rights-ledger";
import {
  buildStudioSpectrumLicenseOffer,
  formatSpectrumLicenseOfferMarkdown,
} from "./studio-spectrum-license-offer";

describe("studio-spectrum-license-offer", () => {
  const cleanPack = BUILTIN_STUDIO_WORKFLOW_PACKS[0];
  const cleanReceipt = generateWorkflowPackRightsReceipt(cleanPack, "2026-11-19T12:00:00.000Z");
  const sampleLuma = new Uint8Array(72).map((_, idx) => (idx * 9) % 256);
  const sampleLedger = {
    ledgerSchemaVersion: 1 as const,
    seriesTitle: "황녀의 검",
    entries: [
      buildCutPerceptualRightsEntry({
        cutId: "cut-01",
        episodeLabel: "1화",
        luma9x8: sampleLuma,
        receipt: cleanReceipt,
        recordedAtIso: "2026-11-19T12:00:00.000Z",
      }),
    ],
  };

  it("issues an eligible secondary-IP license offer with verified 100% revenue split", () => {
    const optOut = buildStudioAiOptOutManifest({
      seriesTitle: "황녀의 검",
      episodeLabel: "1화",
      rightsHolder: "스튜디오 알파",
      receipt: cleanReceipt,
      ledger: sampleLedger,
      tdmReservation: 1,
      issuedAtIso: "2026-11-19T12:05:00.000Z",
    });

    const offer = buildStudioSpectrumLicenseOffer({
      seriesTitle: "황녀의 검",
      episodeLabel: "1화",
      tier: "secondary-ip-adaptation",
      baseLicenseFeeKrw: 10_000_000,
      participants: [
        { role: "story", displayName: "김원작", sharePercent: 55 },
        { role: "art", displayName: "이작화", sharePercent: 30 },
        { role: "bg3d-assistant", displayName: "박배경", sharePercent: 15 },
      ],
      receipt: cleanReceipt,
      optOutManifest: optOut,
      issuedAtIso: "2026-11-19T12:10:00.000Z",
    });

    expect(offer.eligible).toBe(true);
    expect(offer.rejectionReason).toBeNull();
    expect(offer.offerIntegrityHash).toMatch(/^fnv1a-[0-9a-f]{8}$/);

    const md = formatSpectrumLicenseOfferMarkdown(offer);
    expect(md).toContain("발급 가능 (PASS)");
    expect(md).toContain("5,500,000원");
  });

  it("blocks AI opt-in royalty tier when tdm-reservation: 1 is active and blocks non-commercial receipts", () => {
    const optOutLocked = buildStudioAiOptOutManifest({
      seriesTitle: "황녀의 검",
      episodeLabel: "1화",
      receipt: cleanReceipt,
      ledger: sampleLedger,
      tdmReservation: 1,
    });

    const blockedByOptOut = buildStudioSpectrumLicenseOffer({
      seriesTitle: "황녀의 검",
      episodeLabel: "1화",
      tier: "verified-ai-optin-royalty",
      baseLicenseFeeKrw: 5_000_000,
      participants: [{ role: "art", displayName: "이작화", sharePercent: 100 }],
      receipt: cleanReceipt,
      optOutManifest: optOutLocked,
    });
    expect(blockedByOptOut.eligible).toBe(false);
    expect(blockedByOptOut.rejectionReason).toContain("tdm-reservation: 1");

    const ncPack: StudioWorkflowPack = {
      ...cleanPack,
      rightsBom: [{ assetLabel: "비상업 배경", license: "CC-BY-NC" }],
    };
    const ncReceipt = generateWorkflowPackRightsReceipt(ncPack);
    const blockedByNc = buildStudioSpectrumLicenseOffer({
      seriesTitle: "황녀의 검",
      episodeLabel: "1화",
      tier: "episode-serialization-only",
      baseLicenseFeeKrw: 1_000_000,
      participants: [{ role: "art", displayName: "이작화", sharePercent: 100 }],
      receipt: ncReceipt,
      optOutManifest: optOutLocked,
    });
    expect(blockedByNc.eligible).toBe(false);
    expect(blockedByNc.rejectionReason).toContain("CC-BY-NC");
  });
});
