import { describe, expect, it } from "vitest";

import {
  BLENDER_LIVE_SCENE_OBJECTS,
  buildBlenderLiveSceneSyncBridge,
  evaluateVerticalScrollCutPacing,
} from "./studio-bg3d-scroll-pacing-live-sync";

describe("studio-bg3d-scroll-pacing-live-sync (Phase 4)", () => {
  it("evaluates vertical scroll cut pacing and speech bubble safe zones for action-impact cuts", () => {
    const plan = evaluateVerticalScrollCutPacing({
      archetypeId: "action-impact",
      lensId: "contrarian-take",
      cameraTiltDeg: 18,
      silhouetteSeparationRatio: 0.88,
      activeWeaponCount: 12,
    });

    expect(plan.canvasWidthPx).toBe(800);
    expect(plan.recommendedCutHeightPx).toBeGreaterThanOrEqual(1680);
    expect(plan.topGutterPx).toBeGreaterThanOrEqual(300);
    expect(plan.bottomGutterPx).toBeGreaterThanOrEqual(350);
    expect(plan.speechBubbleSafeZoneScore).toBeGreaterThanOrEqual(90);
    expect(plan.safeZones).toHaveLength(3);
    expect(plan.summaryKo).toContain("B_SZ");
  });

  it("builds a deterministic Blender 5.2 live scene synchronization bridge", () => {
    const bridge = buildBlenderLiveSceneSyncBridge({
      lightingPresetId: "abyss-rim",
      shaderPresetId: "holy-paladin-gold",
      inkPresetId: "action-gpen-calligraphy",
      weaponPresetId: "heavenly-sword-12",
      monsterPresetId: "ancient-calamity-dragon",
      focalLengthMm: 22,
      cameraTiltDeg: 18,
    });

    expect(bridge.renderEngine).toBe("BLENDER_EEVEE");
    expect(bridge.syncedObjectCount).toBe(BLENDER_LIVE_SCENE_OBJECTS.length);
    expect(bridge.liveSyncReady).toBe(true);
    expect(bridge.summaryKo).toContain("Blender 5.2 EEVEE");
  });
});
