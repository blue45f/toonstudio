import { describe, expect, it } from "vitest";

import { BUILTIN_STUDIO_WORKFLOW_PACKS } from "./studio-workflow-pack";
import {
  createWorkflowPackSyncMessage,
  parseWorkflowPackSyncMessage,
} from "./studio-workflow-pack-sync";

describe("studio-workflow-pack-sync", () => {
  it("creates and validates a cross-tab workflow pack sync message", () => {
    const pack = BUILTIN_STUDIO_WORKFLOW_PACKS[0];
    const msg = createWorkflowPackSyncMessage(pack, "tab-lead-1", 1_700_000_000_000);
    const parsed = parseWorkflowPackSyncMessage(msg);

    expect(parsed).toEqual(msg);
  });

  it("rejects malformed or wrong-type sync messages", () => {
    expect(parseWorkflowPackSyncMessage(null)).toBeNull();
    expect(parseWorkflowPackSyncMessage({ type: "other" })).toBeNull();
    expect(
      parseWorkflowPackSyncMessage({
        type: "toonstudio:workflow-pack:apply",
        senderId: "",
        sentAtMs: 1,
        pack: BUILTIN_STUDIO_WORKFLOW_PACKS[0],
      }),
    ).toBeNull();
  });
});
