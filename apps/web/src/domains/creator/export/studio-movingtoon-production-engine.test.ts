import { describe, expect, it } from "vitest";

import {
  validateInteractiveBranchGraph,
  verifyMovingToonMasterDelivery,
} from "./studio-movingtoon-production-engine";

describe("studio-movingtoon-production-engine (Waves 50–59)", () => {
  it("verifies camera keyframes, BGM/voice stems, accessibility, mobile budget, interactive branches, and royalty", () => {
    const graphCheck = validateInteractiveBranchGraph([
      { nodeId: "start", nextNodeIds: ["choice-a", "choice-b"], isEnding: false },
      { nodeId: "choice-a", nextNodeIds: [], isEnding: true },
      { nodeId: "choice-b", nextNodeIds: [], isEnding: true },
    ]);
    expect(graphCheck.valid).toBe(true);

    const delivery = verifyMovingToonMasterDelivery({
      seriesTitle: "황녀의 검",
      episodeLabel: "1화 무빙툰",
      keyframes: [
        { cutId: "c1", startMs: 0, endMs: 10_000, zoomScale: 1.15, panX: 0, panY: -20 },
        { cutId: "c2", startMs: 10_000, endMs: 22_000, zoomScale: 1.3, panX: 15, panY: 0 },
      ],
      audioStems: [
        { stemId: "BGM-01", kind: "bgm", licenseCleared: true, durationMs: 22_000 },
        { stemId: "VO-01", kind: "voice", licenseCleared: true, durationMs: 18_000 },
      ],
      captionsIncluded: true,
      audioDescriptionIncluded: true,
      bundleSizeMb: 12.4,
      maxMobileBudgetMb: 20,
      hapticEventsSynced: true,
      projectedMonthlyViews: 500_000,
    });

    expect(delivery.readyForMasterDelivery).toBe(true);
    expect(delivery.shortformEligible).toBe(true);
    expect(delivery.estimatedStreamingRoyaltyKrw).toBe(405_000);
    expect(delivery.masterPackageDigestHash).toMatch(/^fnv1a-/);
  });
});
