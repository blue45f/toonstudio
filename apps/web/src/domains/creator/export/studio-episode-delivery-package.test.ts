import { describe, expect, it } from "vitest";

import { BUILTIN_STUDIO_WORKFLOW_PACKS } from "../assistant/studio-workflow-pack";

import { buildEpisodeDeliveryPackage } from "./studio-episode-delivery-package";

describe("studio-episode-delivery-package", () => {
  it("bundles receipt JSON, PNG chunk metadata, perceptual ledger, and IP dossier into one deterministic package", () => {
    const lumaCut1 = new Uint8Array(72).map((_, i) => (i * 11) % 256);
    const lumaCut2 = new Uint8Array(72).map((_, i) => (i * 17 + 40) % 256);

    const pkg = buildEpisodeDeliveryPackage({
      seriesTitle: "로판 1화 테스트",
      episodeLabel: "1화",
      pack: BUILTIN_STUDIO_WORKFLOW_PACKS[0],
      cuts: [
        { cutId: "cut-01", luma9x8: lumaCut1 },
        { cutId: "cut-02", luma9x8: lumaCut2 },
      ],
      generatedAtIso: "2026-11-19T12:00:00.000Z",
    });

    expect(pkg.commercialReady).toBe(true);
    expect(pkg.receiptFilename).toBe("rights-bom-receipt.json");
    expect(pkg.pngTextKeyword).toBe("ToonStudioRightsBOM");
    expect(pkg.ledger.entries).toHaveLength(2);
    expect(pkg.dossier.allEpisodesCleared).toBe(true);
    expect(pkg.dossierMarkdown).toContain("로판 1화 테스트");
    expect(pkg.packageIntegrityHash).toMatch(/^fnv1a-[0-9a-f]{8}$/);
  });
});
