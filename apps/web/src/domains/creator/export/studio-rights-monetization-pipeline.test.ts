import { describe, expect, it } from "vitest";

import { BUILTIN_STUDIO_WORKFLOW_PACKS } from "../assistant/studio-workflow-pack";

import { runSeriesCommercialPipeline } from "./studio-rights-monetization-pipeline";

describe("studio-rights-monetization-pipeline", () => {
  it("runs the full end-to-end creation-to-underwriting chain across 3 episodes deterministically", () => {
    const sampleLuma = new Uint8Array(72).map((_, idx) => (idx * 13) % 256);

    const output = runSeriesCommercialPipeline({
      seriesTitle: "황녀의 검과 3D 궁전",
      rightsHolder: "스튜디오 알파",
      tier: "episode-serialization-only",
      participants: [
        { role: "story", displayName: "김원작", sharePercent: 50 },
        { role: "art", displayName: "이작화", sharePercent: 35 },
        { role: "bg3d-assistant", displayName: "박배경", sharePercent: 15 },
      ],
      episodes: [
        {
          episodeLabel: "1화",
          pack: BUILTIN_STUDIO_WORKFLOW_PACKS[0],
          cuts: [{ cutId: "ep01-c01", luma9x8: sampleLuma }],
          baseLicenseFeeKrw: 2_000_000,
        },
        {
          episodeLabel: "2화",
          pack: BUILTIN_STUDIO_WORKFLOW_PACKS[0],
          cuts: [{ cutId: "ep02-c01", luma9x8: sampleLuma }],
          baseLicenseFeeKrw: 2_000_000,
        },
        {
          episodeLabel: "3화",
          pack: BUILTIN_STUDIO_WORKFLOW_PACKS[0],
          cuts: [{ cutId: "ep03-c01", luma9x8: sampleLuma }],
          baseLicenseFeeKrw: 2_000_000,
        },
      ],
      platformFeeBps: 500,
      timestampIso: "2026-11-20T01:45:00.000Z",
    });

    expect(output.deliveryPackages).toHaveLength(3);
    expect(output.licenseOffers.every((o) => o.eligible)).toBe(true);
    expect(output.settlements.every((s) => s.status === "ready-for-release")).toBe(true);
    expect(output.seriesDossier.allEpisodesCleared).toBe(true);
    expect(output.mgReadiness.reliabilityTier).toBe("tier-a-verified");
    expect(output.advanceUnderwriting.decision).toBe("approved");
    expect(output.advanceUnderwriting.approvedAdvanceLimitKrw).toBe(6_000_000);
  });
});
