import { describe, expect, it } from "vitest";
import {
  BIOPHILIC_UX_THEME_PRESETS,
  computeVoiceConeSvgPath,
  createDefaultSpatialCanvasHudState,
  filterSpatialQuickCommands,
  REA_VIRTUAL_OFFICE_UX_TOKEN_LEDGER,
  rotateSelfAvatarVoiceCone,
  setSpatialCanvasAtmospherePreset,
  setSpatialCanvasViewMode,
  teleportSelfAvatarToZone,
  toggleFloatingDockControl,
} from "./studio-virtual-office-spatial-ux-design-model";

describe("studio-virtual-office-spatial-ux-design-model (REA UI/UX Design Engine)", () => {
  it("verifies REA extracted UI/UX token ledger and environment manifest evidence IDs", () => {
    expect(REA_VIRTUAL_OFFICE_UX_TOKEN_LEDGER.totalBundlesScanned).toBe(35);
    expect(REA_VIRTUAL_OFFICE_UX_TOKEN_LEDGER.backdropBlurCount).toBe(103);
    expect(REA_VIRTUAL_OFFICE_UX_TOKEN_LEDGER.cubicBezierSpringCount).toBe(205);
    expect(REA_VIRTUAL_OFFICE_UX_TOKEN_LEDGER.keyframeAnimationCount).toBe(346);
    expect(REA_VIRTUAL_OFFICE_UX_TOKEN_LEDGER.environmentManifestEvidenceIds).toHaveLength(3);
    for (const evId of REA_VIRTUAL_OFFICE_UX_TOKEN_LEDGER.environmentManifestEvidenceIds) {
      expect(evId).toMatch(/^ev_[0-9a-f]{64}$/);
    }
    expect(BIOPHILIC_UX_THEME_PRESETS).toHaveLength(4);
  });

  it("computes valid SVG sector path for directional voice cone aura", () => {
    const path = computeVoiceConeSvgPath({
      x: 130,
      y: 92,
      radiusPx: 72,
      headingDeg: 0,
      spreadDeg: 60,
    });
    expect(path).toContain("M 130 92 L");
    expect(path).toContain("A 72 72 0 0 1");
    expect(path.endsWith("Z")).toBe(true);
  });

  it("teleports self avatar to clicked zone and rotates voice cone heading", () => {
    let state = createDefaultSpatialCanvasHudState();
    state = teleportSelfAvatarToZone(state, "zone-3f-conte-vault");
    expect(state.selectedZoneId).toBe("zone-3f-conte-vault");
    const selfAvatar = state.avatars.find((a) => a.isSelf);
    expect(selfAvatar?.x).toBeGreaterThan(480);

    state = rotateSelfAvatarVoiceCone(state, 45);
    expect(state.avatars.find((a) => a.isSelf)?.headingDeg).toBe(60);
  });

  it("switches spatial canvas view modes, biophilic atmosphere presets, and floating dock toggles", () => {
    let state = createDefaultSpatialCanvasHudState();
    state = setSpatialCanvasViewMode(state, "acoustic-heatmap");
    expect(state.viewMode).toBe("acoustic-heatmap");

    state = setSpatialCanvasAtmospherePreset(state, "cyberpunk-neon-den");
    expect(state.atmospherePresetId).toBe("cyberpunk-neon-den");

    state = toggleFloatingDockControl(state, "mic");
    state = toggleFloatingDockControl(state, "megaphone");
    state = toggleFloatingDockControl(state, "focus-helmet");
    expect(state.dockMicMuted).toBe(true);
    expect(state.dockMegaphoneActive).toBe(true);
    expect(state.dockFocusHelmetOn).toBe(true);
  });

  it("filters ⌘K spatial quick commands by title, category, or shortcut", () => {
    expect(filterSpatialQuickCommands("")).toHaveLength(6);
    const matches = filterSpatialQuickCommands("Sophia");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.targetTabId).toBe("ai-agents-memory-mcp");
  });
});
