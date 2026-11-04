import { describe, expect, it } from "vitest";

import { STUDIO_SPACE_THEMES } from "../studio-virtual-space-theme";
import { OFFICE2D_THEME_WALL_MIX, office2dThemeFloorColor, office2dThemeWallTone } from "./office2d-theme-tint";

const FLOORS = ["oak", "walnut", "herringbone", "carpet-sage", "carpet-navy", "terrazzo", "concrete", "tile-cream", "cork", "generic"] as const;

describe("office2d 공간 테마 색 입히기", () => {
  it("기본 테마와 테마 없음은 바닥·벽을 바꾸지 않는다", () => {
    for (const floor of FLOORS) {
      expect(office2dThemeFloorColor(null, floor)).toBeNull();
      expect(office2dThemeFloorColor(undefined, floor)).toBeNull();
      expect(office2dThemeFloorColor("modern-office", floor)).toBeNull();
    }
    expect(office2dThemeWallTone("modern-office", "#e9dfcf")).toBe("#e9dfcf");
    expect(office2dThemeWallTone(null, "#e9dfcf")).toBe("#e9dfcf");
  });

  it("다른 테마는 모든 바닥 재질에서 실제 색을 돌려준다", () => {
    for (const theme of STUDIO_SPACE_THEMES.filter((item) => item.key !== "modern-office")) {
      for (const floor of FLOORS) {
        expect(office2dThemeFloorColor(theme.key, floor), `${theme.key}/${floor}`).toMatch(/^#[0-9a-f]{6}$/u);
      }
    }
  });

  it("열두 개 비기본 테마는 같은 재질 바닥에서도 서로 구별되는 색을 낸다(거의 같은 화면으로 보이지 않는다)", () => {
    const themes = STUDIO_SPACE_THEMES.filter((item) => item.key !== "modern-office");
    for (const floor of FLOORS) {
      const colors = new Set(themes.map((theme) => office2dThemeFloorColor(theme.key, floor)));
      expect(colors.size, floor).toBeGreaterThanOrEqual(6);
    }
  });

  it("벽색은 기본색과 테마 벽색의 중간이고 읽을 수 없는 색은 그대로 둔다", () => {
    const night = office2dThemeWallTone("neon-night", "#ffffff");
    expect(night).not.toBe("#ffffff");
    expect(office2dThemeWallTone("neon-night", "#fff")).toBe(night);
    expect(office2dThemeWallTone("neon-night", "rgb(1,2,3)")).toBe("rgb(1,2,3)");
    expect(OFFICE2D_THEME_WALL_MIX).toBeGreaterThan(0);
    expect(OFFICE2D_THEME_WALL_MIX).toBeLessThan(1);
  });
});
