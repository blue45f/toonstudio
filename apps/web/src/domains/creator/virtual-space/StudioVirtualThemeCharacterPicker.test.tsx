// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioVirtualThemeCharacterPicker } from "./StudioVirtualThemeCharacterPicker";
import { STUDIO_VIRTUAL_ART_STYLES } from "./studio-virtual-space-art-style";
import { STUDIO_CHARACTER_SKINS } from "./studio-virtual-space-character-skins";
import { STUDIO_VIRTUAL_SPACE_AUTO_AVATAR } from "./studio-virtual-space-model";
import { office2dCharacterForAvatarSkin } from "./office2d/office2d-avatar-role";
import { office2dCharacterUrl } from "./office2d/office2d-sprite-catalog";

afterEach(cleanup);

describe("StudioVirtualThemeCharacterPicker", () => {
  it("기본 2D 선택 카드는 작화와 관계없이 실제 월드의 직군 원본을 보여 준다", () => {
    const onSelect = vi.fn(), identity = "preview-owner";
    const view = render(<StudioVirtualThemeCharacterPicker mode="all" stageKind="office2d" identity={identity} artStyle="neon" avatarIndex={0} onSelect={onSelect} />);
    for (const [index, skin] of STUDIO_CHARACTER_SKINS.entries()) {
      const button = screen.getByRole("button", { name: `${skin.labelKo} 캐릭터 선택` });
      const character = office2dCharacterForAvatarSkin(index, identity);
      expect(button.querySelector("svg")?.getAttribute("data-office-character")).toBe(character);
      expect(button.querySelector("image")?.getAttribute("href")).toBe(office2dCharacterUrl(character));
      expect(button.getAttribute("aria-pressed")).toBe(String(index === 0));
    }
    const next = STUDIO_CHARACTER_SKINS[1];
    if (!next) throw new Error("두 번째 캐릭터가 필요합니다.");
    fireEvent.click(screen.getByRole("button", { name: `${next.labelKo} 캐릭터 선택` }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(1);
    view.rerender(<StudioVirtualThemeCharacterPicker mode="all" stageKind="office2d" identity={identity} artStyle="retro" avatarIndex={0} onSelect={onSelect} />);
    expect(view.container.querySelectorAll("[data-office-character]")).toHaveLength(STUDIO_CHARACTER_SKINS.length);
  });
  it.each(["legacy", "three"] as const)("%s에서는 기존 작화 캐릭터를 유지한다", (stageKind) => {
    const view = render(<StudioVirtualThemeCharacterPicker mode="all" stageKind={stageKind} artStyle="neon" avatarIndex={0} onSelect={vi.fn()} />);
    expect(view.container.querySelector("[data-office-character]")).toBeNull();
    expect(view.container.querySelector(".studio-vspace-character-picker__item[aria-pressed=true] .studio-character-preview")).toBeTruthy();
  });
  it("6개 테마를 명시적으로 선택하며 추천 테마가 바뀌어도 기존 캐릭터를 유지한다", () => {
    const onSelect = vi.fn();
    const neonIndex = STUDIO_CHARACTER_SKINS.findIndex((skin) => skin.nativeArtStyle === "neon");
    const neonLabel = STUDIO_CHARACTER_SKINS[neonIndex]?.labelKo;
    const webtoonLabel = STUDIO_CHARACTER_SKINS.find((skin) => skin.nativeArtStyle === "webtoon")?.labelKo;
    expect(neonIndex).toBeGreaterThan(4);
    const view = render(<StudioVirtualThemeCharacterPicker artStyle="neon" avatarIndex={0} onSelect={onSelect} />);
    expect(screen.getAllByRole("button")).toHaveLength(6);
    const neon = screen.getByRole("button", { name: `${neonLabel} 테마 캐릭터 선택` });
    expect(within(neon).getByText("현재 테마와 어울려요")).toBeTruthy();
    expect(screen.queryByRole("button", { pressed: true })).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(neon);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(neonIndex);
    view.rerender(<StudioVirtualThemeCharacterPicker artStyle="webtoon" avatarIndex={neonIndex} onSelect={onSelect} />);
    expect(screen.getByRole("button", { pressed: true })).toBe(neon);
    expect(within(neon).queryByText("현재 테마와 어울려요")).toBeNull();
    expect(within(screen.getByRole("button", { name: `${webtoonLabel} 테마 캐릭터 선택` })).getByText("현재 테마와 어울려요")).toBeTruthy();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(view.container.querySelectorAll("svg[data-character-frame='0']")).toHaveLength(6);
    expect(view.container.querySelector("img")).toBeNull();
  });
  it("전체 모드는 기본·테마 캐릭터를 한 격자에 모으고 스타일 칩으로 좁히며 자동 선택도 명시적으로 고르게 한다", () => {
    const onSelect = vi.fn();
    const view = render(<StudioVirtualThemeCharacterPicker mode="all" includeAuto artStyle="webtoon" avatarIndex={STUDIO_VIRTUAL_SPACE_AUTO_AVATAR} onSelect={onSelect} />);
    const items = () => view.container.querySelectorAll(".studio-vspace-character-picker__item");
    expect(items()).toHaveLength(STUDIO_CHARACTER_SKINS.length + 1);
    expect(screen.getByRole("button", { name: "자동 캐릭터 선택" }).getAttribute("aria-pressed")).toBe("true");
    const filters = screen.getByRole("group", { name: "캐릭터 스타일" });
    expect(within(filters).getByRole("button", { name: "전체" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(filters).getByRole("button", { name: "기본" }));
    expect(items()).toHaveLength(STUDIO_CHARACTER_SKINS.filter((skin) => !skin.nativeArtStyle).length);
    expect(screen.queryByRole("button", { name: "자동 캐릭터 선택" })).toBeNull();
    const neonStyle = STUDIO_VIRTUAL_ART_STYLES.find((style) => style.key === "neon");
    const neonIndex = STUDIO_CHARACTER_SKINS.findIndex((skin) => skin.nativeArtStyle === "neon");
    const neonSkin = STUDIO_CHARACTER_SKINS[neonIndex];
    if (!neonStyle || !neonSkin) throw new Error("네온 테마 캐릭터가 필요합니다.");
    fireEvent.click(within(filters).getByRole("button", { name: neonStyle.labelKo }));
    expect(items()).toHaveLength(STUDIO_CHARACTER_SKINS.filter((skin) => skin.nativeArtStyle === "neon").length);
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: `${neonSkin.labelKo} 캐릭터 선택` }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(neonIndex);
    view.rerender(<StudioVirtualThemeCharacterPicker mode="all" includeAuto artStyle="webtoon" avatarIndex={neonIndex} onSelect={onSelect} />);
    expect(screen.getByRole("button", { name: `${neonSkin.labelKo} 캐릭터 선택` }).getAttribute("aria-pressed")).toBe("true");
  });
});
