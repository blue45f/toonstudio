import { describe, expect, it } from "vitest";

import { DEFAULT_STUDIO_MOTION_CONFIG } from "./studio-virtual-space-motion";
import { STUDIO_SPACE_THEME_KEYS } from "./studio-virtual-space-theme";
import {
  applyStudioThemePhysicsToConfig,
  computeStudioSoftBodyRepulsion,
  resolveStudioThemeSurfacePhysics,
} from "./studio-virtual-space-theme-physics";

describe("studio-virtual-space-theme-physics", () => {
  it("10종 테마와 바닥 재질(tile, wood, carpet)에 대해 결정론적 물리 파라미터를 반환한다", () => {
    for (const themeKey of STUDIO_SPACE_THEME_KEYS) {
      const tile = resolveStudioThemeSurfacePhysics(themeKey, "tile");
      const carpet = resolveStudioThemeSurfacePhysics(themeKey, "carpet");
      expect(tile.themeKey).toBe(themeKey);
      expect(tile.accelerationScale).toBeGreaterThan(carpet.accelerationScale);
      expect(carpet.brakingScale).toBeGreaterThan(tile.brakingScale);
      expect(tile.restitution).toBeGreaterThanOrEqual(0.25);
      expect(tile.footstepVolumeScale).toBeGreaterThanOrEqual(1);
    }
  });

  it("StudioVirtualSpaceMotionConfig에 테마·표면 물리를 합성해 재질별 가감속 차이를 반영한다", () => {
    const neonTile = applyStudioThemePhysicsToConfig(DEFAULT_STUDIO_MOTION_CONFIG, "neon-night", "tile");
    const libraryCarpet = applyStudioThemePhysicsToConfig(DEFAULT_STUDIO_MOTION_CONFIG, "library", "carpet");
    expect(neonTile.acceleration).toBeGreaterThan(libraryCarpet.acceleration);
    expect(libraryCarpet.deceleration).toBeGreaterThan(neonTile.deceleration);
  });

  it("소품·동료 반경 내부로 진입하면 부드러운 탄성 반발 속도를 생성하고 반경 밖에서는 0을 반환한다", () => {
    const far = computeStudioSoftBodyRepulsion({ x: 100, y: 100 }, [{ x: 200, y: 200, radius: 24 }]);
    expect(far).toEqual({ vx: 0, vy: 0 });

    const near = computeStudioSoftBodyRepulsion({ x: 112, y: 100 }, [{ x: 100, y: 100, radius: 24 }]);
    expect(near.vx).toBeGreaterThan(0);
    expect(near.vy).toBe(0);
  });
});
