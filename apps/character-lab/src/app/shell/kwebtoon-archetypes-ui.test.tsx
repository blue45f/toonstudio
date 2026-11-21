// @vitest-environment jsdom
/**
 * K-웹툰 완성형 캐릭터 아키타입 10종의 UI 1클릭 연결 검증:
 * - `shaper-builtin-presets` (`buildShaperPresetCommands` + `KWEBTOON_BUILTIN_ARCHETYPE_PRESETS`)
 * - `KitV2ArchetypeDrawer` + `ParamPanel` (44px 터치 타깃 + 1클릭 단일 Undo 적용)
 * - `TopBar` 빠른 선택기 (`topbar-kwebtoon-archetype-select`)
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ALL_AVAILABLE_CAPABILITIES, createPresetCatalog } from "../../contracts";
import { KWEBTOON_ARCHETYPE_IDS, KWEBTOON_ARCHETYPE_PRESETS, detectKWebtoonArchetypeId } from "../../presets";
import { createLabStore } from "../../state/lab-store";
import { MockLabProvider, createMockLabStore } from "../../testing/mock-store";

import { KitV2ArchetypeDrawer } from "./panels/KitV2ArchetypeDrawer";
import { ParamPanel } from "./panels/ParamPanel";
import { KWEBTOON_BUILTIN_ARCHETYPE_PRESETS, buildShaperPresetCommands } from "./panels/shaper-builtin-presets";
import { TopBar } from "./TopBar";

afterEach(cleanup);

describe("K-웹툰 아키타입 10종 UI 1클릭 적용 연동", () => {
  it("shaper-builtin-presets가 10종 아키타입 모두에 대해 슬롯·체형·얼굴·비례·색·2단셀·포즈 명령을 생성한다", () => {
    expect(Object.keys(KWEBTOON_BUILTIN_ARCHETYPE_PRESETS)).toEqual([...KWEBTOON_ARCHETYPE_IDS]);
    for (const id of KWEBTOON_ARCHETYPE_IDS) {
      const built = buildShaperPresetCommands(id);
      expect(built, id).not.toBeNull();
      const types = new Set(built!.commands.map((cmd) => cmd.type));
      expect(types.has("slot/apply")).toBe(true);
      expect(types.has("param/set")).toBe(true);
      expect(types.has("proportion/set")).toBe(true);
      expect(types.has("color/set")).toBe(true);
      expect(types.has("shading/set")).toBe(true);
      expect(types.has("pose/set")).toBe(true);
      expect(built!.noticeKo).toContain(KWEBTOON_ARCHETYPE_PRESETS[id].shortLabelKo);
    }
  });

  it("KitV2ArchetypeDrawer가 10종 K-웹툰 카드를 44px 터치 타깃으로 표시하고 ParamPanel에서 1클릭 단일 Undo로 적용한다", () => {
    const onKw = vi.fn();
    render(<KitV2ArchetypeDrawer onApplyArchetypePreset={vi.fn()} onApplyKWebtoonArchetype={onKw} />);

    const kwGroup = screen.getByTestId("kwebtoon-archetype-cards");
    const buttons = within(kwGroup).getAllByRole("button");
    expect(buttons).toHaveLength(10);
    for (const button of buttons) {
      expect(button.className).toContain("min-h-11");
      expect(button.style.minHeight).toBe("44px");
    }

    fireEvent.click(screen.getByTestId("kwebtoon-archetype-kwebtoon-rofan-princess"));
    expect(onKw).toHaveBeenCalledWith(KWEBTOON_ARCHETYPE_PRESETS["kwebtoon-rofan-princess"]);
    cleanup();

    let tick = 2_000;
    const store = createLabStore({
      catalog: createPresetCatalog([]),
      now: () => {
        tick += 1;
        return tick;
      },
      initial: { capabilities: ALL_AVAILABLE_CAPABILITIES },
    });
    render(
      <MockLabProvider store={store}>
        <ParamPanel />
      </MockLabProvider>,
    );

    fireEvent.click(screen.getByTestId("kwebtoon-archetype-kwebtoon-sd-mascot"));
    const nextRecipe = store.getState().recipe;
    expect(detectKWebtoonArchetypeId(nextRecipe)).toBe("kwebtoon-sd-mascot");
    expect(nextRecipe.style.proportion?.headsTall).toBe(3.5);
    expect(nextRecipe.slots.hair).toBe("hair/twin-tail");
    expect(nextRecipe.shading.mode).toBe("toon");
    expect(nextRecipe.shading.toon.rampSteps).toBe(2);
    expect(nextRecipe.shading.look.line.color.mode).toBe("darken-albedo");
    expect(store.getState().history.depth).toBe(1);
  });

  it("TopBar에서 K-웹툰 캐릭터 10종을 1클릭 선택해 recipe/load를 즉시 발행한다", () => {
    const store = createMockLabStore();
    render(
      <MockLabProvider store={store}>
        <TopBar />
      </MockLabProvider>,
    );
    const select = screen.getByTestId("topbar-kwebtoon-archetype-select") as HTMLSelectElement;
    // placeholder 1 + 10 archetypes = 11 options
    expect(select.options).toHaveLength(11);

    fireEvent.change(select, { target: { value: "kwebtoon-northern-duke" } });
    const last = store.dispatched.at(-1);
    expect(last?.type).toBe("recipe/load");
    if (last?.type === "recipe/load") {
      expect(detectKWebtoonArchetypeId(last.recipe)).toBe("kwebtoon-northern-duke");
      expect(last.recipe.style.proportion?.headsTall).toBe(8.8);
      expect(last.recipe.colors.iris).toBe("#b8263b");
      expect(last.recipe.shading.mode).toBe("toon");
    }
  });
});
