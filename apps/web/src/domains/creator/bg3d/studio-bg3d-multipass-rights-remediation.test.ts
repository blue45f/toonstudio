import { describe, expect, it } from "vitest";

import {
  buildVerifyAiAutoRemediationPlan,
  DEFAULT_SCENE_RIGHTS_BOM_ENTRIES,
  evaluateMultiPassToonPsdExportPlan,
  evaluateRightsBomCommercialReadiness,
} from "./studio-bg3d-multipass-rights-remediation";
import { evaluateVerifyAiPreflightGates } from "./studio-bg3d-shot-continuity-linked-ink";

describe("studio-bg3d-multipass-rights-remediation (Phase 3)", () => {
  it("calculates 8-Pass Toon PSD & .toon3d export memory and render time budgets across quality tiers", () => {
    const draftPlan = evaluateMultiPassToonPsdExportPlan({
      qualityTier: "draft",
      webgpuComputeAvailable: true,
    });
    const finalPlan = evaluateMultiPassToonPsdExportPlan({
      qualityTier: "final",
      webgpuComputeAvailable: true,
    });

    expect(finalPlan.activePasses).toHaveLength(8);
    expect(finalPlan.toon3dPackageReady).toBe(true);
    expect(finalPlan.estimatedPsdArchiveMiB).toBeGreaterThan(
      draftPlan.estimatedPsdArchiveMiB,
    );
    expect(finalPlan.summaryKo).toContain("8패스");
  });

  it("audits Rights BOM entries for commercial webtoon publishing and blocks NC/GPL conflicts", () => {
    const cleanAudit = evaluateRightsBomCommercialReadiness(
      DEFAULT_SCENE_RIGHTS_BOM_ENTRIES,
    );
    expect(cleanAudit.commercialPublishAllowed).toBe(true);
    expect(cleanAudit.riskLevel).toBe("attribution-required");
    expect(cleanAudit.autoAttributionCreditsKo).toHaveLength(1);

    const blockedAudit = evaluateRightsBomCommercialReadiness([
      ...DEFAULT_SCENE_RIGHTS_BOM_ENTRIES,
      {
        assetId: "nc-castle-prop",
        nameKo: "비상업 팬아트 성문",
        license: "CC-BY-NC-4.0",
      },
      {
        assetId: "gpl-shader-plugin",
        nameKo: "GPL 외부 메쉬",
        license: "GPL-3.0",
      },
    ]);
    expect(blockedAudit.commercialPublishAllowed).toBe(false);
    expect(blockedAudit.riskLevel).toBe("blocked");
    expect(blockedAudit.blockerReasonsKo).toHaveLength(2);
  });

  it("builds Verify AI one-click auto-remediation actions and records artist style feedback deltas", () => {
    const preflight = evaluateVerifyAiPreflightGates({
      archetypeId: "emotion-closeup",
      artisticOverride: false,
      contrastRatio: 2.5,
    });
    const remediation = buildVerifyAiAutoRemediationPlan(preflight, 3600);

    expect(remediation.actions.length).toBeGreaterThanOrEqual(4);
    expect(remediation.projectedPostRemediationScore).toBeGreaterThan(
      preflight.totalGateScore,
    );
    expect(remediation.styleFeedbackDelta.preferredFocalLengthDeltaMm).toBe(60);
    expect(remediation.styleFeedbackDelta.preferredKelvinDelta).toBe(-2000);
  });
});
