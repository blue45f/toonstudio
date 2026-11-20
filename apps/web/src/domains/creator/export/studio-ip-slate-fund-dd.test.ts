import { describe, expect, it } from "vitest";

import {
  BUILTIN_STUDIO_WORKFLOW_PACKS,
  type StudioWorkflowPack,
} from "../assistant/studio-workflow-pack";

import { evaluateAgencySubmissionBatch } from "./studio-agency-submission-preview";
import {
  buildIpSlateFundDdReport,
  formatIpSlateFundDdMarkdown,
} from "./studio-ip-slate-fund-dd";

describe("studio-ip-slate-fund-dd", () => {
  it("builds an investable DD capital allocation respecting concentration caps and excluding rights-blocked titles", () => {
    const cleanPack = BUILTIN_STUDIO_WORKFLOW_PACKS[0];
    const blockedPack: StudioWorkflowPack = {
      ...BUILTIN_STUDIO_WORKFLOW_PACKS[1],
      id: "blocked-fund-pack",
      rightsBom: [{ assetLabel: "비상업 배경", license: "CC-BY-NC" }],
    };

    const batch = evaluateAgencySubmissionBatch(
      [
        {
          submissionId: "SLATE-01",
          seriesTitle: "황녀의 검",
          pack: cleanPack,
          episodeCount: 3,
          proposedEpisodeFeeKrw: 2_000_000,
          tier: "episode-serialization-only",
          participants: [{ role: "art", displayName: "이작화", sharePercent: 100 }],
        },
        {
          submissionId: "SLATE-02",
          seriesTitle: "네온 액션 3D",
          pack: cleanPack,
          episodeCount: 3,
          proposedEpisodeFeeKrw: 2_000_000,
          tier: "secondary-ip-adaptation",
          participants: [{ role: "art", displayName: "박액션", sharePercent: 100 }],
        },
        {
          submissionId: "SLATE-03",
          seriesTitle: "저작권 보류작",
          pack: blockedPack,
          episodeCount: 3,
          proposedEpisodeFeeKrw: 2_000_000,
          tier: "episode-serialization-only",
          participants: [{ role: "art", displayName: "김보류", sharePercent: 100 }],
        },
      ],
      "2026-11-20T11:00:00.000Z",
    );

    const dd = buildIpSlateFundDdReport({
      fundName: "ToonStudio IP 1호 조합",
      batchReport: batch,
      targetSlateBudgetKrw: 10_000_000,
      minCleanRatioPercent: 60,
      maxSingleTitleConcentrationPercent: 50,
      evaluatedAtIso: "2026-11-20T11:05:00.000Z",
    });

    expect(dd.decision).toBe("investable");
    expect(dd.eligibleTitleCount).toBe(2);
    expect(dd.allocations).toHaveLength(2);
    expect(dd.allocations.every((a) => a.allocatedCapitalKrw <= 5_000_000)).toBe(true);
    expect(dd.totalAllocatedCapitalKrw).toBe(10_000_000);
    expect(dd.ddPackageHash).toMatch(/^fnv1a-[0-9a-f]{8}$/);

    const md = formatIpSlateFundDdMarkdown(dd);
    expect(md).toContain("ToonStudio IP 1호 조합");
    expect(md).toContain("INVESTABLE");
    expect(md).toContain("5,000,000원");
  });
});
