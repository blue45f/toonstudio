import { afterEach, describe, expect, it } from "vitest";

import { BUILTIN_STUDIO_WORKFLOW_PACKS } from "../assistant/studio-workflow-pack";
import { resolveWorkflowPackRuntimeBindings } from "../assistant/studio-workflow-pack-runtime-bridge";
import { setLatestWorkflowPackRuntimeBindings } from "../assistant/use-workflow-pack-runtime-consumer";

import { resolveExportRightsReceiptPayload } from "./studio-export-rights-receipt-adapter";

afterEach(() => {
  setLatestWorkflowPackRuntimeBindings(null);
});

describe("studio-export-rights-receipt-adapter", () => {
  it("returns unattached default payload when no workflow pack is active", () => {
    const payload = resolveExportRightsReceiptPayload();
    expect(payload.attached).toBe(false);
    expect(payload.clearedForCommercialExport).toBe(true);
    expect(payload.filename).toBeNull();
  });

  it("attaches rights-bom-receipt.json and PNG tEXt metadata when a workflow pack is active", () => {
    const bindings = resolveWorkflowPackRuntimeBindings(
      BUILTIN_STUDIO_WORKFLOW_PACKS[0],
      "2026-11-19T19:45:00.000Z",
    );
    setLatestWorkflowPackRuntimeBindings(bindings);

    const payload = resolveExportRightsReceiptPayload();
    expect(payload.attached).toBe(true);
    expect(payload.clearedForCommercialExport).toBe(true);
    expect(payload.filename).toBe("rights-bom-receipt.json");
    expect(payload.pngKeyword).toBe("ToonStudioRightsBOM");
    expect(payload.content).toContain(bindings.exportReceiptAttachment.receipt.integrityHash);
  });
});
