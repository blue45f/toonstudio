// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { office2dCharacterForAvatarSkin } from "../office2d/office2d-avatar-role";
import { office2dGeneratedAtlas } from "../office2d/office2d-generated-atlases";
import { SpaceAvatar } from "./SpaceAvatar";
import { STUDIO_VIRTUAL_ART_STYLES } from "../studio-virtual-space-art-style";
import { STUDIO_CHARACTER_SKINS, studioCharacterSkinForArtStyle } from "../studio-virtual-space-character-skins";
import { studioCharacterStaticAsset } from "../studio-virtual-space-character-assets";

afterEach(cleanup);

function displayedUrl(container: HTMLElement) {
  return container.querySelector("img")?.getAttribute("src") ?? container.querySelector("image")?.getAttribute("href");
}

describe("SpaceAvatar 작화 일치", () => {
  it.each(STUDIO_VIRTUAL_ART_STYLES)("$key에서 월드와 같은 기본 캐릭터·활동 자산을 사용한다", ({ key }) => {
    const source = STUDIO_CHARACTER_SKINS[0];
    if (!source) throw new Error("기본 캐릭터가 필요합니다.");
    const view = render(<SpaceAvatar identity="review" avatarIndex={0} artStyle={key} facing="right" />);
    const skin = studioCharacterSkinForArtStyle(source, key);
    expect(displayedUrl(view.container)).toBe(studioCharacterStaticAsset(skin, "right").url);
    view.rerender(<SpaceAvatar identity="review" avatarIndex={0} artStyle={key} facing="right" activity="focused" />);
    expect(displayedUrl(view.container)).toBe(studioCharacterStaticAsset(skin, "right", "draw").url);
    view.rerender(<SpaceAvatar identity="review" avatarIndex={0} artStyle={key} facing="right" activity="reviewing" />);
    expect(displayedUrl(view.container)).toBe(studioCharacterStaticAsset(skin, "right", "review").url);
  });

  it("기본 2D 상태창은 월드와 같은 직군 배정과 정지 프레임을 사용한다", () => {
    for (const [avatarIndex] of STUDIO_CHARACTER_SKINS.entries()) {
      const identity = "world-self";
      const character = office2dCharacterForAvatarSkin(avatarIndex, identity);
      const atlas = office2dGeneratedAtlas(character, "walk");
      if (!atlas) throw new Error("직군 atlas가 필요합니다.");
      const view = render(<SpaceAvatar identity={identity} avatarIndex={avatarIndex} stageKind="office2d" />);
      expect(view.container.querySelector("svg")?.getAttribute("data-office-character")).toBe(character);
      expect(displayedUrl(view.container)).toBe(atlas.url);
      const frame = atlas.frames[0]?.source;
      expect(view.container.querySelector("svg")?.getAttribute("viewBox")).toBe(`${frame?.x} ${frame?.y} ${frame?.width} ${frame?.height}`);
      view.unmount();
    }
  });

  it("테마를 바꿔도 직접 선택한 테마 캐릭터와 LPC 원본을 유지한다", () => {
    for (const source of STUDIO_CHARACTER_SKINS.filter((skin) => skin.nativeArtStyle || skin.pixelArt)) {
      const avatarIndex = STUDIO_CHARACTER_SKINS.indexOf(source);
      const view = render(<SpaceAvatar identity="review" avatarIndex={avatarIndex} artStyle="neon" />);
      const before = displayedUrl(view.container);
      view.rerender(<SpaceAvatar identity="review" avatarIndex={avatarIndex} artStyle="ink" />);
      expect(displayedUrl(view.container)).toBe(before);
      view.unmount();
    }
  });
});
