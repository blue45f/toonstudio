import { describe, expect, it } from "vitest";

import { BUILTIN_STUDIO_WORKFLOW_PACKS, type StudioWorkflowPack } from "./studio-workflow-pack";
import { buildWorkflowPackExportReceiptAttachment } from "./studio-workflow-pack-export-bundle";
import { verifySubmittedRightsReceipt } from "./studio-rights-receipt-verifier";

describe("studio-rights-receipt-verifier", () => {
  it("verifies a valid commercial-cleared receipt and matches reference pack hash", () => {
    const pack = BUILTIN_STUDIO_WORKFLOW_PACKS[0];
    const attachment = buildWorkflowPackExportReceiptAttachment(pack, "2026-11-19T19:30:00.000Z");

    const standalone = verifySubmittedRightsReceipt(attachment.content);
    expect(standalone.validFormat).toBe(true);
    expect(standalone.clearedForCommercialExport).toBe(true);
    expect(standalone.integrityVerified).toBeNull();

    const matched = verifySubmittedRightsReceipt(attachment.content, pack);
    expect(matched.validFormat).toBe(true);
    expect(matched.clearedForCommercialExport).toBe(true);
    expect(matched.integrityVerified).toBe(true);
  });

  it("rejects tampered receipts and flags blocked licenses", () => {
    const pack = BUILTIN_STUDIO_WORKFLOW_PACKS[0];
    const attachment = buildWorkflowPackExportReceiptAttachment(pack, "2026-11-19T19:30:00.000Z");
    const tamperedPack: StudioWorkflowPack = { ...pack, name: "변조된 작품 팩" };

    const tampered = verifySubmittedRightsReceipt(attachment.content, tamperedPack);
    expect(tampered.validFormat).toBe(true);
    expect(tampered.integrityVerified).toBe(false);
    expect(tampered.clearedForCommercialExport).toBe(false);

    const invalid = verifySubmittedRightsReceipt("{not-valid");
    expect(invalid.validFormat).toBe(false);
  });
});
