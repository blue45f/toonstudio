import { describe, expect, it, vi } from "vitest";

import { BUILTIN_STUDIO_WORKFLOW_PACKS } from "./studio-workflow-pack";
import {
  dispatchWorkflowPackRuntimeEvent,
  resolveWorkflowPackRuntimeBindings,
  subscribeWorkflowPackRuntimeEvents,
} from "./studio-workflow-pack-runtime-bridge";

describe("studio-workflow-pack-runtime-bridge", () => {
  it("resolves 3D lighting, brush slot, and ZIP receipt attachment from a v2 pack", () => {
    const pack = BUILTIN_STUDIO_WORKFLOW_PACKS[0];
    const bindings = resolveWorkflowPackRuntimeBindings(pack, "2026-11-19T19:30:00.000Z");

    expect(bindings.packId).toBe(pack.id);
    expect(bindings.bg3dLightingPresetId).toBe("palace-golden-hour");
    expect(bindings.primaryBrushSlotId).toBe("g-pen-crisp");
    expect(bindings.exportReceiptAttachment.filename).toBe("rights-bom-receipt.json");
  });

  it("dispatches and receives runtime pack events across subscribers", () => {
    const target = new EventTarget();
    const received = vi.fn();
    const unsubscribe = subscribeWorkflowPackRuntimeEvents(received, target);

    const pack = BUILTIN_STUDIO_WORKFLOW_PACKS[2];
    const emitted = dispatchWorkflowPackRuntimeEvent(pack, target);

    expect(received).toHaveBeenCalledTimes(1);
    expect(received).toHaveBeenCalledWith(emitted);

    unsubscribe();
    dispatchWorkflowPackRuntimeEvent(pack, target);
    expect(received).toHaveBeenCalledTimes(1);
  });
});
