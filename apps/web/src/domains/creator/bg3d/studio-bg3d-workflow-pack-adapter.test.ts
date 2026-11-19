import { describe, expect, it } from "vitest";

import { BUILTIN_STUDIO_WORKFLOW_PACKS } from "../assistant/studio-workflow-pack";
import { resolveWorkflowPackRuntimeBindings } from "../assistant/studio-workflow-pack-runtime-bridge";
import { setLatestWorkflowPackRuntimeBindings } from "../assistant/use-workflow-pack-runtime-consumer";

import {
  isBg3dLightingPresetKnown,
  resolveBg3dLightingConfigFromBindings,
} from "./studio-bg3d-workflow-pack-adapter";

describe("studio-bg3d-workflow-pack-adapter", () => {
  it("maps active workflow pack bg3dLightingPresetId to concrete lighting and Live-Ink parameters", () => {
    const noirPack = {
      ...BUILTIN_STUDIO_WORKFLOW_PACKS[2],
      teamPolicyLock: {
        teamLabel: "느와르 스튜디오",
        lockedFields: ["platformId"] as const,
        requireCommercialClearance: true,
      },
    };
    const bindings = resolveWorkflowPackRuntimeBindings(noirPack, "2026-11-19T00:00:00.000Z");
    const config = resolveBg3dLightingConfigFromBindings(bindings);

    expect(config.presetId).toBe("noir-rim-backlit");
    expect(config.rimLightIntensity).toBeGreaterThan(1.0);
    expect(config.liveInkEdgeThreshold).toBeLessThan(0.35);
    expect(config.lockedByTeamPolicy).toBe(true);
    expect(config.sourcePackId).toBe(noirPack.id);
  });

  it("falls back safely to studio-cool-neutral when no bindings or unknown preset", () => {
    setLatestWorkflowPackRuntimeBindings(null);
    const fallback = resolveBg3dLightingConfigFromBindings();
    expect(fallback.presetId).toBe("studio-cool-neutral");
    expect(fallback.sourcePackId).toBeNull();
    expect(isBg3dLightingPresetKnown("unknown-preset")).toBe(false);
  });
});
