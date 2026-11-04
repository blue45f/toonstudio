// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceThemePicker } from "./StudioVirtualSpaceThemePicker";
import { STUDIO_CHARACTER_SKINS } from "./studio-virtual-space-character-skins";
import { STUDIO_SPACE_THEMES } from "./studio-virtual-space-theme";

afterEach(() => cleanup());

// 첫 렌더에서 i18n 런타임 초기화가 느릴 수 있어 여유를 둔다.
vi.setConfig({ testTimeout: 30000 });

describe("StudioVirtualSpaceThemePicker", () => {
  it.each([
    ["modern-office", "studio-art-v14/rooms/global-ip-pitch-boardroom.webp"],
    ["webtoon-atelier", "studio-art-v11/themes/seoul-editorial-hq.webp"],
    ["celestial-observatory", "studio-art-v12/themes/scifi-orbital-command.webp"],
    ["garden-terrace", "studio-art-v12/themes/murim-bamboo-pavilion.webp"],
    ["library", "studio-art-v13/themes/magic-academy-astral-library.webp"],
    ["sunset-harbor", "studio-art-v13/themes/rooftop-sunset-screening-stage.webp"],
  ])("%s 카드에 실제 월드 배경을 표시한다", (key, asset) => {
    const { container } = render(<StudioVirtualSpaceThemePicker value="modern-office" onChange={vi.fn()} />);
    const image = container.querySelector(`[data-atelier-theme-preview="${key}"]`);
    expect(image?.getAttribute("src")).toBe(`/assets/virtual-studio/${asset}`);
  });

  it("테마 13종을 모두 보여 주고 현재 테마가 눌린 상태로 표시된다", () => {
    render(<StudioVirtualSpaceThemePicker value="modern-office" onChange={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(STUDIO_SPACE_THEMES.length);
    for (const theme of STUDIO_SPACE_THEMES) {
      expect(screen.getByText(theme.labelKo)).toBeTruthy();
      expect(screen.getAllByText(theme.badgeKo).length).toBeGreaterThan(0);
    }
    expect(screen.getByRole("button", { name: /모던 오피스/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /웹툰 원고 아틀리에/ }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: /네온 나이트/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("모든 테마 카드가 실제 추천 캐릭터의 이름과 스프라이트를 함께 제안한다", () => {
    const { container } = render(<StudioVirtualSpaceThemePicker value="modern-office" onChange={vi.fn()} />);
    for (const theme of STUDIO_SPACE_THEMES) {
      const button = container.querySelector<HTMLButtonElement>(`[data-space-theme="${theme.key}"]`);
      const first = STUDIO_CHARACTER_SKINS.find((skin) => skin.key === theme.recommendedCharacterKeys[0]);
      if (!button || !first) throw new Error(`테마 추천 자산이 없습니다: ${theme.key}`);
      expect(within(button).getByText(new RegExp(`추천 캐릭터 · ${first.labelKo}`))).toBeTruthy();
      const preview = button.querySelector(`[data-atelier-cast-preview="${theme.key}"] .studio-character-preview`);
      expect(preview).not.toBeNull();
      expect(preview?.tagName.toLowerCase()).toBe(first.nativeArtStyle || first.pixelArt ? "svg" : "img");
    }
  });

  it("테마를 누르면 해당 키로 onChange가 호출된다", () => {
    const onChange = vi.fn();
    render(<StudioVirtualSpaceThemePicker value="modern-office" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /웹툰 원고 아틀리에/ }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("webtoon-atelier");
  });

  it("썸네일이 테마 팔레트(그라데이션·바닥·벽·데스크)를 인라인 스타일로 그린다", () => {
    const { container } = render(<StudioVirtualSpaceThemePicker value="neon-night" onChange={vi.fn()} />);
    const neonButton = container.querySelector('[data-space-theme="neon-night"]');
    expect(neonButton).toBeTruthy();
    const thumb = neonButton?.querySelector(".studio-theme-picker__thumb") as HTMLElement | null;
    expect(thumb?.style.background).toContain("linear-gradient");
    const floor = neonButton?.querySelector(".studio-theme-picker__floor") as HTMLElement | null;
    expect(floor?.style.backgroundColor).toBeTruthy();
    const desk = neonButton?.querySelector(".studio-theme-picker__desk") as HTMLElement | null;
    expect(desk?.style.background).toBeTruthy();
  });
});
