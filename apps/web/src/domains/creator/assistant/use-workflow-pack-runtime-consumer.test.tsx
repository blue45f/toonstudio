// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BUILTIN_STUDIO_WORKFLOW_PACKS } from "./studio-workflow-pack";
import { dispatchWorkflowPackRuntimeEvent } from "./studio-workflow-pack-runtime-bridge";
import {
  getLatestWorkflowPackRuntimeBindings,
  setLatestWorkflowPackRuntimeBindings,
  useWorkflowPackRuntimeBindings,
} from "./use-workflow-pack-runtime-consumer";

function RuntimeConsumerProbe() {
  const bindings = useWorkflowPackRuntimeBindings();
  return (
    <div data-testid="runtime-probe">
      {bindings
        ? `${bindings.packId}|${bindings.bg3dLightingPresetId}|${bindings.primaryBrushSlotId}`
        : "none"}
    </div>
  );
}

afterEach(() => {
  cleanup();
  setLatestWorkflowPackRuntimeBindings(null);
});

describe("useWorkflowPackRuntimeBindings", () => {
  it("reacts immediately when a Workflow Pack runtime event is dispatched", () => {
    render(<RuntimeConsumerProbe />);
    expect(screen.getByTestId("runtime-probe").textContent).toBe("none");

    act(() => {
      dispatchWorkflowPackRuntimeEvent(BUILTIN_STUDIO_WORKFLOW_PACKS[0]);
    });

    expect(screen.getByTestId("runtime-probe").textContent).toBe(
      "rofan-episode1-starter|palace-golden-hour|g-pen-crisp",
    );
    expect(getLatestWorkflowPackRuntimeBindings()?.exportReceiptAttachment.filename).toBe(
      "rights-bom-receipt.json",
    );
  });
});
