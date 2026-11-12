import { describe, expect, it } from "vitest";

import { buildAllFiveCrossLabsFullDrafts } from "./studio-cross-labs-5-lens-drafts";
import { evaluateCrossLabsUnifiedProductionBridge } from "./studio-cross-labs-production-bridge";

describe("studio-cross-labs-5-lens-drafts", () => {
  it("expands all 5 creative lenses into complete, publication-ready drafts with quantitative metrics", () => {
    const report = evaluateCrossLabsUnifiedProductionBridge({
      bg3dOverallScore100: 94.18,
      bg3dPreflightScore100: 95.57,
      bg3dContrastRatio: 2.45,
      bg3dSafeZoneScore100: 95.8,
      characterOverallScore100: 98.34,
      characterTurnaroundScore100: 96.4,
      characterFaceSdfScore100: 99.5,
      characterOutlineWidthMm: 3.5,
      brushOverallScore100: 97.43,
      brushTaperSharpness100: 97.4,
      brushLinkedInkStability100: 96.2,
      brushAverageStrokePx: 4.48,
      rightsBomScore100: 100,
    });

    const drafts = buildAllFiveCrossLabsFullDrafts(report);
    expect(drafts).toHaveLength(5);
    expect(drafts.map((d) => d.id)).toEqual([
      "contrarian-take",
      "personal-story-hook",
      "data-evidence-angle",
      "practical-playbook",
      "what-they-missed",
    ]);
    expect(report.remixes.map((remix) => remix.id)).toEqual(drafts.map((draft) => draft.id));

    for (const draft of drafts) {
      expect(draft.headlineKo.length).toBeGreaterThan(15);
      expect(draft.bodyParagraphsKo.length).toBeGreaterThanOrEqual(2);
      expect(draft.keyTakeawayKo.length).toBeGreaterThan(10);
    }
  });
});
