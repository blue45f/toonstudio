import { describe, expect, it } from "vitest";

import { BUILTIN_STUDIO_WORKFLOW_PACKS } from "../assistant/studio-workflow-pack";

import { evaluateAgencySubmissionBatch } from "./studio-agency-submission-preview";
import { verifySeriesIpProvenanceChain } from "./studio-ip-provenance-chain-verifier";
import { buildIpSlateFundDdReport } from "./studio-ip-slate-fund-dd";
import { runSeriesCommercialPipeline } from "./studio-rights-monetization-pipeline";

describe("studio-ip-provenance-chain-verifier", () => {
  it("verifies all 8 stages from Rights BOM receipt through IP Slate Fund DD without broken links", () => {
    const pack = BUILTIN_STUDIO_WORKFLOW_PACKS[0];
    const sampleLuma = new Uint8Array(72).map((_, idx) => (idx * 19) % 256);
    const ts = "2026-11-20T11:15:00.000Z";
    const participants = [{ role: "art" as const, displayName: "이작화", sharePercent: 100 }];

    const pipeline = runSeriesCommercialPipeline({
      seriesTitle: "황녀의 검",
      tier: "episode-serialization-only",
      participants,
      episodes: [
        {
          episodeLabel: "1화",
          pack,
          cuts: [{ cutId: "SUB-1-ep1-c01", luma9x8: sampleLuma }],
          baseLicenseFeeKrw: 2_000_000,
        },
        {
          episodeLabel: "2화",
          pack,
          cuts: [{ cutId: "SUB-1-ep2-c01", luma9x8: sampleLuma }],
          baseLicenseFeeKrw: 2_000_000,
        },
        {
          episodeLabel: "3화",
          pack,
          cuts: [{ cutId: "SUB-1-ep3-c01", luma9x8: sampleLuma }],
          baseLicenseFeeKrw: 2_000_000,
        },
      ],
      platformFeeBps: 500,
      timestampIso: ts,
    });

    const batch = evaluateAgencySubmissionBatch(
      [
        {
          submissionId: "SUB-1",
          seriesTitle: "황녀의 검",
          pack,
          episodeCount: 3,
          proposedEpisodeFeeKrw: 2_000_000,
          tier: "episode-serialization-only",
          participants,
        },
      ],
      ts,
    );

    const dd = buildIpSlateFundDdReport({
      fundName: "ToonStudio 1호 펀드",
      batchReport: batch,
      targetSlateBudgetKrw: 10_000_000,
      evaluatedAtIso: ts,
    });

    const audit = verifySeriesIpProvenanceChain(pipeline, dd);
    expect(audit.allStagesVerified).toBe(true);
    expect(audit.stages).toHaveLength(8);
    expect(audit.brokenStages).toHaveLength(0);
    expect(audit.masterChainAuditHash).toMatch(/^fnv1a-[0-9a-f]{8}$/);

    // Tamper underwriting dossierHash and ensure verifier flags broken link
    const tamperedPipeline = {
      ...pipeline,
      advanceUnderwriting: {
        ...pipeline.advanceUnderwriting,
        dossierHash: "fnv1a-deadbeef",
      },
    };
    const failedAudit = verifySeriesIpProvenanceChain(tamperedPipeline, dd);
    expect(failedAudit.allStagesVerified).toBe(false);
    expect(failedAudit.brokenStages).toContain("advance-underwriting");
  });
});
