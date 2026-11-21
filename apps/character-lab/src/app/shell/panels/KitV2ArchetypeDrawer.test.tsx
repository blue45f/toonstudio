// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ALL_AVAILABLE_CAPABILITIES,
  KIT_V2_ARCHETYPE_IDS,
  KIT_V2_ARCHETYPE_PRESETS,
  KIT_V2_GARMENT_GENRES,
  KIT_V2_HAND_POSE_IDS,
  KIT_V2_HAND_POSE_LABELS_KO,
  archetypePresetToBodyParams,
  createPresetCatalog,
} from "../../../contracts";
import { createLabStore } from "../../../state/lab-store";
import { MockLabProvider } from "../../../testing/mock-store";

import { KitV2ArchetypeDrawer } from "./KitV2ArchetypeDrawer";
import { ParamPanel } from "./ParamPanel";

afterEach(cleanup);

describe("KitV2ArchetypeDrawer", () => {
  it("기본 접힘 details로 5대 웹툰 아키타입 카드와 16종 손 포즈·6대 장르 의상 요약을 표시한다", () => {
    const onApply = vi.fn();
    render(<KitV2ArchetypeDrawer onApplyArchetypePreset={onApply} />);

    const drawer = screen.getByTestId("kit-v2-archetype-drawer") as HTMLDetailsElement;
    expect(drawer.open).toBe(false);

    const cardsGroup = screen.getByTestId("kit-v2-archetype-cards");
    const buttons = within(cardsGroup).getAllByRole("button");
    expect(buttons).toHaveLength(5);

    expect(screen.getByTestId("kit-v2-archetype-female-romance").textContent).toContain("여성 로맨스 7.8등신");
    expect(screen.getByTestId("kit-v2-archetype-male-webtoon").textContent).toContain("웹툰 미남 8.6등신");
    expect(screen.getByTestId("kit-v2-archetype-male-action").textContent).toContain("액션 헌터 8.4등신");
    expect(screen.getByTestId("kit-v2-archetype-youth-academy").textContent).toContain("학원 유스 7.0등신");
    expect(screen.getByTestId("kit-v2-archetype-sd-chibi").textContent).toContain("SD 치비 3.1등신");

    for (const button of buttons) {
      expect(button.className).toContain("min-h-11");
      expect(button.style.minHeight).toBe("44px");
    }

    const catalogSummary = screen.getByTestId("kit-v2-catalog-summary").textContent ?? "";
    expect(catalogSummary).toContain("베이스 5");
    expect(catalogSummary).toContain("헤어 12");
    expect(catalogSummary).toContain("의상 34");
    expect(catalogSummary).toContain("손 포즈 16");

    const genresText = screen.getByTestId("kit-v2-garment-genres").textContent ?? "";
    for (const genre of KIT_V2_GARMENT_GENRES) {
      expect(genresText).toContain(`${genre.labelKo} ${genre.count}종`);
    }

    const handPoseText = screen.getByTestId("kit-v2-hand-poses-summary").textContent ?? "";
    for (const poseId of KIT_V2_HAND_POSE_IDS) {
      expect(handPoseText).toContain(KIT_V2_HAND_POSE_LABELS_KO[poseId]);
    }
  });

  it("아키타입 카드 클릭 시 onApplyArchetypePreset 콜백에 정확한 체형 프리셋을 전달한다", () => {
    const onApply = vi.fn();
    render(<KitV2ArchetypeDrawer onApplyArchetypePreset={onApply} />);

    for (const archId of KIT_V2_ARCHETYPE_IDS) {
      fireEvent.click(screen.getByTestId(`kit-v2-archetype-${archId}`));
      expect(onApply).toHaveBeenLastCalledWith(KIT_V2_ARCHETYPE_PRESETS[archId]);
    }
    expect(onApply).toHaveBeenCalledTimes(5);
  });

  it("현재 캐릭터 체형 파라미터와 일치하는 아키타입을 aria-pressed=true로 표시한다", () => {
    const preset = KIT_V2_ARCHETYPE_PRESETS["sd-chibi"];
    render(
      <KitV2ArchetypeDrawer
        currentBody={archetypePresetToBodyParams(preset)}
        onApplyArchetypePreset={vi.fn()}
      />,
    );

    expect(screen.getByTestId("kit-v2-archetype-sd-chibi").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("kit-v2-archetype-female-romance").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("kit-v2-archetype-summary").textContent).toContain("SD 치비 3.1등신");
  });

  it("ParamPanel 하단에 기본 접힘으로 마운트되어 1클릭으로 레시피 body 비율을 단일 Undo 단계로 반영한다", () => {
    let tick = 1_000;
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

    const drawer = screen.getByTestId("kit-v2-archetype-drawer") as HTMLDetailsElement;
    expect(drawer.open).toBe(false);

    fireEvent.click(screen.getByTestId("kit-v2-archetype-male-action"));
    const preset = KIT_V2_ARCHETYPE_PRESETS["male-action"];
    expect(store.getState().recipe.body).toEqual(archetypePresetToBodyParams(preset));
    expect(store.getState().history.depth).toBe(1);
    expect(screen.getByTestId("kit-v2-archetype-male-action").getAttribute("aria-pressed")).toBe("true");
  });

  it("Starlight OKLCH 토큰 전용이며 raw 색·금지 모션·장식 이모지가 0건이다", () => {
    const candidates: string[] = [];
    const metaDirname: unknown = import.meta.dirname;
    if (typeof metaDirname === "string") candidates.push(path.join(metaDirname, "KitV2ArchetypeDrawer.tsx"));
    const metaUrl: unknown = import.meta.url;
    if (typeof metaUrl === "string" && metaUrl.startsWith("file:")) {
      candidates.push(path.join(path.dirname(fileURLToPath(metaUrl)), "KitV2ArchetypeDrawer.tsx"));
    }
    candidates.push(
      path.resolve(process.cwd(), "apps", "character-lab", "src", "app", "shell", "panels", "KitV2ArchetypeDrawer.tsx"),
      path.resolve(process.cwd(), "src", "app", "shell", "panels", "KitV2ArchetypeDrawer.tsx"),
    );
    const resolved = candidates.find((candidate) => existsSync(candidate));
    expect(resolved).toBeDefined();
    const source = readFileSync(resolved as string, "utf8");
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(source).not.toMatch(/\brgba?\(/u);
    expect(source).not.toMatch(
      /\b(?:bg|text|border)-(?:white|black|slate|gray|zinc|purple|violet|fuchsia|amber|rose|sky|emerald)(?:-[0-9]{2,3})?(?:\/[0-9]+)?/u,
    );
    expect(source).not.toMatch(/\b(?:transition-all|hover:scale-|animate-pulse|font-black)\b/u);
    expect(source).not.toMatch(/\b(?:VARCO 3D|World Anvil|Plottr)\b/u);
    expect(source).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
