// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioAssetToolPopoverBody } from "../StudioAssetToolPopoverBody";
import { createStudioCharmBarStore, resetStudioCharmBarStoreForTests } from "./studio-charm-bar-store";
import { normalizeStudioCharmBarState } from "./studio-charm-model";

import type { StudioToolBeltContentProps } from "../StudioToolBeltContent";

import { useI18n } from "@/shared/lib/i18n";

/**
 * 사용자가 참 바를 켜는 길: 템플릿 · 에셋 메뉴의 "요소"·"효과" 구역 머리에 토글이 있다.
 * 메뉴 본문 전체를 그리되 필요한 필드만 채운 도구 벨트 묶음을 쓴다(다른 시험과 같은 방식).
 */
function toolBeltFor(menu: string): StudioToolBeltContentProps {
  return {
    menu,
    setMenu: vi.fn(),
    elements: [],
    assets: [],
    assetFavoriteState: { version: 1, ids: [] },
    canvasH: 1_200,
    selected: null,
    fxSearchQuery: "",
    fxQuery: "",
    fxPickerSection: "all",
    fxPickerHasResults: true,
    fxSectionVisible: () => false,
    fxRasterFiltered: [],
    fxSfxFiltered: [],
    fxEmojisFiltered: [],
    fxComicFiltered: [],
    fxCreatureFiltered: [],
    fxPropFiltered: [],
    fxLinePresetsFiltered: [],
    fxOverlaysFiltered: [],
    panelLayoutPresets: [],
    sceneTemplates: { templates: [] },
    sfxPacks: null,
    studioSfx: { categories: [] },
    studioOptionalAssets: { bgSceneSections: [] },
    studioStickerAssetsLoaded: true,
    stableHandlers: {},
  } as unknown as StudioToolBeltContentProps;
}

function renderBody(menu: string) {
  return render(
    <MemoryRouter>
      <StudioAssetToolPopoverBody toolBelt={toolBeltFor(menu)} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useI18n.getState().setLang("ko");
  const stored = normalizeStudioCharmBarState({ version: 1, charms: [], open: false, starterSettled: true });
  resetStudioCharmBarStoreForTests(createStudioCharmBarStore({
    acquire: async () => ({ loadCharmBar: async () => stored, saveCharmBar: async () => undefined }),
  }));
});

afterEach(() => {
  cleanup();
  resetStudioCharmBarStoreForTests();
});

describe("참 바 켜기: 요소·효과 메뉴의 토글", () => {
  it.each(["elements", "sticker"])("%s 구역 머리에서 참 바를 켜고 끌 수 있다", async (menu) => {
    renderBody(menu);
    const toggle = screen.getByRole("button", { name: "참 바" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute("aria-pressed")).toBe("true"));
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute("aria-pressed")).toBe("false"));
  });

  it("소재를 고르는 구역이 아닌 곳(템플릿)에는 토글을 두지 않는다", () => {
    renderBody("template");
    expect(screen.queryByRole("button", { name: "참 바" })).toBeNull();
  });
});
