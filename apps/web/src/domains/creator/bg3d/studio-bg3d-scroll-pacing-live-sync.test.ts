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
    expect(plan.measuredWeaponSafeZoneIoU).toBe(0);
    expect(plan.summaryKo).toContain("B_SZ");

    const clearOrbitPlan = evaluateVerticalScrollCutPacing({
      archetypeId: "action-impact",
      lensId: "contrarian-take",
      cameraTiltDeg: 18,
      silhouetteSeparationRatio: 1.0,
      activeWeaponCount: 12,
      avoidSafeZoneOrbit: true,
    });
    expect(clearOrbitPlan.measuredWeaponSafeZoneIoU).toBe(0);
    expect(clearOrbitPlan.speechBubbleSafeZoneScore).toBeGreaterThanOrEqual(99.5);

    // 회피 궤도를 끄고 상단 말풍선 영역에 무기를 배치하면 실측 IoU가 증가해 점수가 정직하게 하락한다.
    const collidingPlan = evaluateVerticalScrollCutPacing({
      archetypeId: "action-impact",
      lensId: "contrarian-take",
      cameraTiltDeg: 18,
      silhouetteSeparationRatio: 1.0,
      activeWeaponCount: 2,
      weaponPositions3d: [
        [-2.2, 3.6, 0],
        [2.2, -1.2, 0],
      ],
      avoidSafeZoneOrbit: false,
    });
    expect(collidingPlan.measuredWeaponSafeZoneIoU).toBeGreaterThan(0);
    expect(collidingPlan.speechBubbleSafeZoneScore).toBeLessThan(clearOrbitPlan.speechBubbleSafeZoneScore);
  });

  it("builds a deterministic Blender 5.3 live scene synchronization bridge", () => {
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
    expect(bridge.summaryKo).toContain("Blender 5.3 EEVEE");
  });
});
