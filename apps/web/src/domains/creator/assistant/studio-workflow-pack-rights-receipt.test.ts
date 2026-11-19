import { describe, expect, it } from "vitest";

import { BUILTIN_STUDIO_WORKFLOW_PACKS, type StudioWorkflowPack } from "./studio-workflow-pack";
import {
  generateWorkflowPackRightsReceipt,
  serializeWorkflowPackRightsReceipt,
} from "./studio-workflow-pack-rights-receipt";

describe("studio-workflow-pack-rights-receipt", () => {
  it("generates a deterministic commercial-cleared receipt with FNV-1a integrity hash", () => {
    const pack = BUILTIN_STUDIO_WORKFLOW_PACKS[0];
    const receiptA = generateWorkflowPackRightsReceipt(pack, "2026-11-19T10:00:00.000Z");
    const receiptB = generateWorkflowPackRightsReceipt(pack, "2026-11-19T12:00:00.000Z");

    expect(receiptA.receiptSchemaVersion).toBe(1);
    expect(receiptA.clearedForCommercialExport).toBe(true);
    expect(receiptA.blockedLicenses).toEqual([]);
    expect(receiptA.integrityHash).toMatch(/^fnv1a-[0-9a-f]{8}$/);
    expect(receiptA.integrityHash).toBe(receiptB.integrityHash);
    expect(serializeWorkflowPackRightsReceipt(receiptA)).toContain(receiptA.integrityHash);
  });

  it("marks NC and GPL assets as blocked inside the generated receipt", () => {
    const restricted: StudioWorkflowPack = {
      ...BUILTIN_STUDIO_WORKFLOW_PACKS[1],
      id: "restricted-receipt-pack",
      rightsBom: [
        { assetLabel: "CC0 조명", license: "CC0" },
        { assetLabel: "비상업 소품", license: "CC-BY-NC" },
      ],
    };

    const receipt = generateWorkflowPackRightsReceipt(restricted, "2026-11-19T10:00:00.000Z");
    expect(receipt.clearedForCommercialExport).toBe(false);
    expect(receipt.blockedLicenses).toEqual(["CC-BY-NC"]);
    expect(receipt.assets.map((asset) => asset.commercialStatus)).toEqual(["cleared", "blocked"]);
  });
});
