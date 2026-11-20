import { describe, expect, it } from "vitest";

import {
  BUILTIN_STUDIO_WORKFLOW_PACKS,
  type StudioWorkflowPack,
} from "../assistant/studio-workflow-pack";

import {
  evaluateAgencySubmissionBatch,
  formatAgencyBatchQuoteMarkdown,
} from "./studio-agency-submission-preview";

describe("studio-agency-submission-preview", () => {
  it("triages multiple creator submissions into fast-track, conditional, and rights-blocked buckets", () => {
    const cleanPack = BUILTIN_STUDIO_WORKFLOW_PACKS[0];
    const blockedPack: StudioWorkflowPack = {
      ...BUILTIN_STUDIO_WORKFLOW_PACKS[1],
      id: "nc-submission-pack",
      rightsBom: [{ assetLabel: "비상업 무료 소품", license: "CC-BY-NC" }],
    };

    const report = evaluateAgencySubmissionBatch(
      [
        {
          submissionId: "SUB-001",
          seriesTitle: "황녀의 검",
          pack: cleanPack,
          episodeCount: 3,
          proposedEpisodeFeeKrw: 2_000_000,
          tier: "episode-serialization-only",
          participants: [{ role: "art", displayName: "이작화", sharePercent: 100 }],
        },
        {
          submissionId: "SUB-002",
          seriesTitle: "신인 단편 테스트",
          pack: cleanPack,
          episodeCount: 2,
          proposedEpisodeFeeKrw: 1_000_000,
          tier: "episode-serialization-only",
          participants: [{ role: "art", displayName: "박신인", sharePercent: 100 }],
        },
        {
          submissionId: "SUB-003",
          seriesTitle: "비상업 소품 혼입작",
          pack: blockedPack,
          episodeCount: 3,
          proposedEpisodeFeeKrw: 2_000_000,
          tier: "episode-serialization-only",
          participants: [{ role: "art", displayName: "김주의", sharePercent: 100 }],
        },
      ],
      "2026-11-20T10:50:00.000Z",
    );

    expect(report.totalSubmissions).toBe(3);
    expect(report.fastTrackCount).toBe(1);
    expect(report.conditionalCount).toBe(1);
    expect(report.rightsBlockedCount).toBe(1);
    expect(report.totalApprovedAdvancePoolKrw).toBe(7_500_000);
    expect(report.portfolioQuoteHash).toMatch(/^fnv1a-[0-9a-f]{8}$/);

    const md = formatAgencyBatchQuoteMarkdown(report);
    expect(md).toContain("SUB-001");
    expect(md).toContain("fast-track-approved");
    expect(md).toContain("rights-blocked");
  });
});
