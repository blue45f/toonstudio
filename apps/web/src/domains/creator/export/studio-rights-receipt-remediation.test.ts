import { describe, expect, it } from "vitest";

import {
  BUILTIN_STUDIO_WORKFLOW_PACKS,
  type StudioWorkflowPack,
} from "../assistant/studio-workflow-pack";
import { generateWorkflowPackRightsReceipt } from "../assistant/studio-workflow-pack-rights-receipt";

import {
  applyRightsRemediationPlan,
  buildRightsRemediationPlan,
} from "./studio-rights-receipt-remediation";

describe("studio-rights-receipt-remediation", () => {
  it("replaces restricted NC/GPL assets, removes unmatched ones, and re-signs a verified commercial-cleared receipt", () => {
    const basePack = BUILTIN_STUDIO_WORKFLOW_PACKS[0];
    const brokenPack: StudioWorkflowPack = {
      ...basePack,
      id: "rofan-broken-nc",
      rightsBom: [
        { assetLabel: "커뮤니티 무료 조명 프리셋", license: "CC-BY-NC" },
        { assetLabel: "미검증 외주 텍스처 팩", license: "GPL-3.0" },
        { assetLabel: "로판 한글 식자 스타일 세트", license: "COMMERCIAL" },
      ],
    };

    const plan = buildRightsRemediationPlan(brokenPack);
    expect(plan.needsRemediation).toBe(true);
    expect(plan.blockedAssetCount).toBe(2);
    expect(plan.steps.map((s) => s.kind)).toEqual([
      "replace-with-commercial-safe",
      "remove-restricted-asset",
      "resign-receipt-hash",
    ]);

    const result = applyRightsRemediationPlan(brokenPack, plan, "2026-11-19T12:00:00.000Z");
    expect(result.remediatedPack.rightsBom).toHaveLength(2);
    expect(result.remediatedReceipt.clearedForCommercialExport).toBe(true);
    expect(result.verification.validFormat).toBe(true);
    expect(result.verification.clearedForCommercialExport).toBe(true);
    expect(result.verification.integrityVerified).toBe(true);
    expect(result.appliedActions).toHaveLength(3);
  });

  it("detects receipt hash drift on an already-clean pack and re-signs cleanly", () => {
    const cleanPack = BUILTIN_STUDIO_WORKFLOW_PACKS[1];
    const staleReceipt = {
      ...generateWorkflowPackRightsReceipt(cleanPack, "2026-11-19T10:00:00.000Z"),
      integrityHash: "fnv1a-00000000",
    };

    const plan = buildRightsRemediationPlan(cleanPack, staleReceipt);
    expect(plan.needsRemediation).toBe(true);
    expect(plan.blockedAssetCount).toBe(0);
    expect(plan.hashDriftDetected).toBe(true);
    expect(plan.steps.map((s) => s.kind)).toEqual(["resign-receipt-hash"]);

    const result = applyRightsRemediationPlan(cleanPack, plan, "2026-11-19T12:30:00.000Z");
    expect(result.verification.integrityVerified).toBe(true);
    expect(result.verification.clearedForCommercialExport).toBe(true);
  });

  it("reports no remediation needed when pack and receipt are clean and verified", () => {
    const cleanPack = BUILTIN_STUDIO_WORKFLOW_PACKS[0];
    const validReceipt = generateWorkflowPackRightsReceipt(cleanPack, "2026-11-19T10:00:00.000Z");

    const plan = buildRightsRemediationPlan(cleanPack, validReceipt);
    expect(plan.needsRemediation).toBe(false);
    expect(plan.steps).toHaveLength(0);
  });
});
