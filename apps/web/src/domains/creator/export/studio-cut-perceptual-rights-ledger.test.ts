import { describe, expect, it } from "vitest";

import { BUILTIN_STUDIO_WORKFLOW_PACKS } from "../assistant/studio-workflow-pack";
import { generateWorkflowPackRightsReceipt } from "../assistant/studio-workflow-pack-rights-receipt";

import {
  buildCutPerceptualRightsEntry,
  computeLumaDHash64,
  hammingDistanceHex64,
  matchCutAgainstRightsLedger,
  parseCutPerceptualRightsLedger,
  serializeCutPerceptualRightsLedger,
  type CutPerceptualRightsLedger,
} from "./studio-cut-perceptual-rights-ledger";

function makeGradientLuma(offset: number): Uint8Array {
  const arr = new Uint8Array(72);
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      arr[row * 9 + col] = (col * 24 + row * 7 + offset) % 256;
    }
  }
  return arr;
}

describe("studio-cut-perceptual-rights-ledger", () => {
  it("matches a slightly recompressed cut back to its original Rights BOM receipt entry", () => {
    const pack = BUILTIN_STUDIO_WORKFLOW_PACKS[0];
    const receipt = generateWorkflowPackRightsReceipt(pack, "2026-11-19T12:00:00.000Z");

    const originalLuma = makeGradientLuma(10);
    const entry = buildCutPerceptualRightsEntry({
      cutId: "ep01-cut03",
      episodeLabel: "1화",
      luma9x8: originalLuma,
      receipt,
      recordedAtIso: "2026-11-19T12:05:00.000Z",
    });

    const ledger: CutPerceptualRightsLedger = {
      ledgerSchemaVersion: 1,
      seriesTitle: "황녀의 검",
      entries: [entry],
    };

    // Simulate slight JPEG/WebP recompression perturbation on 1 pixel
    const recompressedLuma = new Uint8Array(originalLuma);
    recompressedLuma[4] = Math.min(255, recompressedLuma[4] + 30);
    const queryHash = computeLumaDHash64(recompressedLuma);

    const match = matchCutAgainstRightsLedger(queryHash, ledger, 8);
    expect(match.matched).toBe(true);
    expect(match.hammingDistance).toBeLessThanOrEqual(2);
    expect(match.confidencePercent).toBeGreaterThanOrEqual(95);
    expect(match.entry?.receiptIntegrityHash).toBe(receipt.integrityHash);
    expect(match.entry?.clearedForCommercialExport).toBe(true);
  });

  it("round-trips ledger JSON and rejects dissimilar cuts beyond threshold", () => {
    const pack = BUILTIN_STUDIO_WORKFLOW_PACKS[2];
    const receipt = generateWorkflowPackRightsReceipt(pack, "2026-11-19T12:00:00.000Z");
    const luma = makeGradientLuma(0);
    const entry = buildCutPerceptualRightsEntry({
      cutId: "ep01-cut01",
      episodeLabel: "1화",
      luma9x8: luma,
      receipt,
    });

    const ledger: CutPerceptualRightsLedger = {
      ledgerSchemaVersion: 1,
      seriesTitle: "느와르 시티",
      entries: [entry],
    };
    const roundTripped = parseCutPerceptualRightsLedger(serializeCutPerceptualRightsLedger(ledger));
    expect(roundTripped?.seriesTitle).toBe("느와르 시티");
    expect(roundTripped?.entries).toHaveLength(1);

    // Inverted luminance produces high Hamming distance
    const inverted = new Uint8Array(luma.map((v) => 255 - v));
    const invertedHash = computeLumaDHash64(inverted);
    expect(hammingDistanceHex64(entry.dHash64, invertedHash)).toBeGreaterThan(20);
    const miss = matchCutAgainstRightsLedger(invertedHash, ledger, 8);
    expect(miss.matched).toBe(false);
    expect(miss.entry).toBeNull();
  });
});
