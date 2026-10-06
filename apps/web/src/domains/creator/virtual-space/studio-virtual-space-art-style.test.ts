import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_VIRTUAL_ART_STYLE,
  STUDIO_VIRTUAL_ART_STYLES,
  STUDIO_VIRTUAL_ART_STYLE_KEYS,
  STUDIO_VIRTUAL_LOBBY_PREVIEW_FOCUS,
  isStudioVirtualArtStyleKey,
  studioVirtualArtAssetUrl,
  studioVirtualArtObjectUrl,
  studioVirtualArtStyle,
  studioVirtualArtTextureUrl,
  studioVirtualLivingTownAssetUrl,
  studioVirtualLobbyPreviewObjectPosition,
} from "./studio-virtual-space-art-style";

describe("Virtual Studio art direction", () => {
  it("keeps stable style keys with the supplied floating-island direction as the default", () => {
    expect(STUDIO_VIRTUAL_ART_STYLE_KEYS).toEqual(["sky-island", "webtoon", "pastel", "retro", "ink", "neon"]);
    expect(DEFAULT_STUDIO_VIRTUAL_ART_STYLE).toBe("sky-island");
    expect(isStudioVirtualArtStyleKey(DEFAULT_STUDIO_VIRTUAL_ART_STYLE)).toBe(true);
    expect(STUDIO_VIRTUAL_ART_STYLES.map((style) => style.key)).toEqual(STUDIO_VIRTUAL_ART_STYLE_KEYS);
  });

  it("provides a complete palette and distinguishes architecture and pixel rendering", () => {
    const retro = studioVirtualArtStyle("retro");
    const webtoon = studioVirtualArtStyle("webtoon");
    const sky = studioVirtualArtStyle("sky-island");
    expect(retro.pixelated).toBe(true);
    expect(webtoon.pixelated).toBe(false);
    expect(sky.architectureEn).toContain("Floating-island");
    for (const style of STUDIO_VIRTUAL_ART_STYLES) {
      expect(Object.keys(style.palette).sort()).toEqual([
        "accent", "background", "floor", "floorAlt", "furniture", "gate", "line", "path", "plant", "room", "sky", "wall", "water",
      ]);
      expect(Object.values(style.palette).every((value) => Number.isInteger(value) && value >= 0 && value <= 0xffffff)).toBe(true);
    }
  });

  it("selects independent v5 actor, world and object packs for every art direction", () => {
    expect(studioVirtualArtAssetUrl("retro", "/assets/virtual-studio/drawn-characters-v1/player-pink-walk-down.png"))
      .toBe("/assets/virtual-studio/style-packs-v5/retro/players/player-pink-walk-down.webp");
    expect(studioVirtualArtAssetUrl("webtoon", "/assets/virtual-studio/drawn-characters-v1/player-pink-walk-down.png"))
      .toBe("/assets/virtual-studio/style-packs-v5/webtoon/players/player-pink-walk-down.webp");
    expect(studioVirtualArtAssetUrl("retro", "https://example.invalid/user-art.png"))
      .toBe("https://example.invalid/user-art.png");
    expect(studioVirtualArtTextureUrl("sky-island", "world-base"))
      .toBe("/assets/virtual-studio/style-packs-v5/sky-island/world/world-base.webp");
    expect(studioVirtualArtTextureUrl("webtoon", "water-sheet"))
      .toBe("/assets/virtual-studio/style-packs-v5/webtoon/world/water-sheet.webp");
    expect(studioVirtualArtObjectUrl("neon", "crate"))
      .toBe("/assets/virtual-studio/style-packs-v5/neon/objects/crate.webp");
    expect(studioVirtualLivingTownAssetUrl("sky-island", "waterfall-sheet"))
      .toBe("/assets/virtual-studio/living-town-v6/sky-island/waterfall-sheet.webp");
    expect(studioVirtualLivingTownAssetUrl("retro", "terrain-tile-atlas"))
      .toBe("/assets/virtual-studio/living-town-v6/retro/terrain-tile-atlas.webp");
  });

  it("로비 미리보기 초점은 여섯 스타일 모두 실측 좌표를 갖고 object-position으로 변환된다 (W5-T7)", () => {
    for (const key of STUDIO_VIRTUAL_ART_STYLE_KEYS) {
      const focus = STUDIO_VIRTUAL_LOBBY_PREVIEW_FOCUS[key];
      expect(focus.x).toBeGreaterThanOrEqual(0);
      expect(focus.x).toBeLessThanOrEqual(100);
      expect(focus.y).toBeGreaterThanOrEqual(0);
      expect(focus.y).toBeLessThanOrEqual(100);
      expect(studioVirtualLobbyPreviewObjectPosition(key)).toBe(`${focus.x}% ${focus.y}%`);
    }
    // 포털은 전 스타일 하단 세 번째 건물(x 61%)에 모이고, sky-island만 대성당이 길어 초점이 더 높다.
    expect(STUDIO_VIRTUAL_LOBBY_PREVIEW_FOCUS["sky-island"]).toEqual({ x: 61, y: 68 });
    expect(STUDIO_VIRTUAL_LOBBY_PREVIEW_FOCUS.webtoon).toEqual({ x: 61, y: 73 });
    expect(STUDIO_VIRTUAL_LOBBY_PREVIEW_FOCUS.neon).toEqual({ x: 61, y: 73 });
  });
});
