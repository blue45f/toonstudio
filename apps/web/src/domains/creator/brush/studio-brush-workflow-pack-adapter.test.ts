import { describe, expect, it } from "vitest";

import { BUILTIN_STUDIO_WORKFLOW_PACKS } from "../assistant/studio-workflow-pack";
import { resolveWorkflowPackRuntimeBindings } from "../assistant/studio-workflow-pack-runtime-bridge";
import { setLatestWorkflowPackRuntimeBindings } from "../assistant/use-workflow-pack-runtime-consumer";

import {
  isBrushSlotPresetKnown,
  resolveBrushSlotConfigFromBindings,
} from "./studio-brush-workflow-pack-adapter";

describe("studio-brush-workflow-pack-adapter", () => {
  it("resolves primaryBrushSlotId from active workflow pack runtime bindings", () => {
    const actionPack = BUILTIN_STUDIO_WORKFLOW_PACKS[2];
    const bindings = resolveWorkflowPackRuntimeBindings(actionPack, "2026-11-19T00:00:00.000Z");
    const config = resolveBrushSlotConfigFromBindings(bindings);

    expect(config.slotId).toBe("ink-brush-dynamic");
    expect(config.pressureSensitivity).toBeGreaterThanOrEqual(0.9);
    expect(config.taperRatio).toBeGreaterThan(0.8);
    expect(config.sourcePackId).toBe(actionPack.id);
  });

  it("falls back safely to g-pen-crisp when no active pack or unknown slot", () => {
    setLatestWorkflowPackRuntimeBindings(null);
    const fallback = resolveBrushSlotConfigFromBindings();
    expect(fallback.slotId).toBe("g-pen-crisp");
    expect(fallback.sourcePackId).toBeNull();
    expect(isBrushSlotPresetKnown("non-existent-brush")).toBe(false);
  });
});
