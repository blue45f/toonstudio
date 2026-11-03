import { describe, expect, it } from "vitest";

import {
  creatorRoleWorkspacePreset,
  creatorRoleWorkspacePresetOptions,
  recommendStudioCommandBarForRole,
} from "../creator-role-workspace-presets";
import {
  STUDIO_COMMAND_BAR_SLOT_COUNT,
  STUDIO_DEFAULT_WORKSPACES,
} from "../studio-workspaces";

import { CREATOR_ROLE_IDS } from "@/shared/lib/creator-role-contract";

describe("creator role workspace presets", () => {
  it("maps every creator role to an existing built-in workspace and familiar tool benchmarks", () => {
    const ids = new Set(STUDIO_DEFAULT_WORKSPACES.map((workspace) => workspace.id));
    for (const role of CREATOR_ROLE_IDS) {
      const preset = creatorRoleWorkspacePreset(role);
      expect(preset).not.toBeNull();
      if (!preset) throw new Error(`${role} 직무의 작업공간 추천이 없습니다.`);
      expect(ids.has(preset.workspaceId)).toBe(true);
      expect(preset.recommendedCommandBarSlots).toHaveLength(STUDIO_COMMAND_BAR_SLOT_COUNT);
      expect(preset.familiarTools.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("recommends role-tailored command bar slots with safe fallback", () => {
    const lineAssistantBar = recommendStudioCommandBarForRole("line-assistant");
    expect(lineAssistantBar.visible).toBe(true);
    expect(lineAssistantBar.slots).toContain("correct-current-stroke");

    const letteringBar = recommendStudioCommandBarForRole("lettering-assistant");
    expect(letteringBar.slots).toContain("bubbles");

    const backgroundBar = recommendStudioCommandBarForRole("background-assistant");
    expect(backgroundBar.slots).toContain("assets");

    const producerBar = recommendStudioCommandBarForRole("producer");
    expect(producerBar.slots).toContain("publish");

    const fallbackBar = recommendStudioCommandBarForRole(null);
    expect(fallbackBar.slots).toHaveLength(STUDIO_COMMAND_BAR_SLOT_COUNT);
  });

  it("deduplicates the same editor layout across related roles", () => {
    expect(creatorRoleWorkspacePresetOptions(["line-art", "assistant", "character"]))
      .toHaveLength(1);
  });
});
