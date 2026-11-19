import { describe, expect, it } from "vitest";

import { BUILTIN_STUDIO_WORKFLOW_PACKS } from "./studio-workflow-pack";
import {
  PNG_RIGHTS_TEXT_KEYWORD,
  RIGHTS_RECEIPT_FILENAME,
  buildWorkflowPackExportReceiptAttachment,
  verifyWorkflowPackReceiptIntegrity,
} from "./studio-workflow-pack-export-bundle";

describe("studio-workflow-pack-export-bundle", () => {
  it("builds a ZIP-ready rights-bom-receipt.json and PNG tEXt metadata chunk", () => {
    const pack = BUILTIN_STUDIO_WORKFLOW_PACKS[0];
    const attachment = buildWorkflowPackExportReceiptAttachment(pack, "2026-11-19T19:00:00.000Z");

    expect(attachment.filename).toBe(RIGHTS_RECEIPT_FILENAME);
    expect(attachment.mimeType).toBe("application/json");
    expect(attachment.pngTextChunk.keyword).toBe(PNG_RIGHTS_TEXT_KEYWORD);
    expect(attachment.pngTextChunk.text).toContain(attachment.receipt.integrityHash);
    expect(verifyWorkflowPackReceiptIntegrity(pack, attachment.receipt)).toBe(true);
  });

  it("detects tampering when a pack is modified after receipt issuance", () => {
    const pack = BUILTIN_STUDIO_WORKFLOW_PACKS[0];
    const attachment = buildWorkflowPackExportReceiptAttachment(pack, "2026-11-19T19:00:00.000Z");
    const tampered = { ...pack, name: "변조된 팩" };

    expect(verifyWorkflowPackReceiptIntegrity(tampered, attachment.receipt)).toBe(false);
  });
});
