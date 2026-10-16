/**
 * 참 바 본체(`StudioCharmBar`)를 시험에서 마운트하는 공용 도구(시험 전용).
 *
 * 저장소는 메모리 가짜(저장 호출이 `saves` 에 쌓인다)이고, 호스트 삽입 명령은 호출만 세는 스파이다.
 * 위치 문맥은 선택 없는 고정 값이다. 선택이 바뀌는 흐름은 `studio-charm-fake-host.test-fixture.ts` 를 쓴다.
 */

import { render, screen, within } from "@testing-library/react";
import { vi } from "vitest";

import { createStudioCatalogPreferencesRepository } from "../catalog/studio-catalog-preferences";
import { createStudioCharmBarStore, type StudioCharmBarStore } from "./studio-charm-bar-store";
import { loadStudioCharmCatalogData } from "./studio-charm-catalog-data";
import { normalizeStudioCharmBarState, type StudioCharmId } from "./studio-charm-model";
import { StudioCharmBar, type StudioCharmBarProps } from "./StudioCharmBar";

import type { StudioCharmActivationContext, StudioCharmHostCommands } from "./studio-charm-insert";

const catalogPreferences = (() => {
  const values = new Map<string, string>();
  const repository = createStudioCatalogPreferencesRepository({
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value); },
    delete: async (key) => { values.delete(key); },
  });
  return { values, acquire: async () => repository };
})();

/** 시험마다 요소 즐겨찾기 저장소를 비운다. */
export function resetCharmBarHarness(): void {
  catalogPreferences.values.clear();
}

/** 호스트가 내 소재 목록을 이미 읽어 둔(비어 있는) 상태. */
export const HOST_LIBRARY_LOADED = { assets: [], loaded: true, loading: false } as const;

export const VISIBLE_CONTEXT: StudioCharmActivationContext = {
  documentWidth: 720,
  documentHeight: 1280,
  selection: null,
  visible: { center: { x: 360, y: 640 }, bounds: { x: 0, y: 400, width: 720, height: 480 } },
  snap: { enabled: false, gridSize: 40, viewportScale: 1 },
  sequenceFor: () => 0,
};

export interface CharmBarHarness {
  readonly store: StudioCharmBarStore;
  readonly saves: ReturnType<typeof normalizeStudioCharmBarState>[];
  readonly commands: StudioCharmHostCommands;
  readonly spies: {
    readonly addRenderedImage: ReturnType<typeof vi.fn>;
    readonly addSticker: ReturnType<typeof vi.fn>;
    readonly addBubble: ReturnType<typeof vi.fn>;
    readonly addBuiltinRasterAsset: ReturnType<typeof vi.fn>;
    readonly addSfxPreset: ReturnType<typeof vi.fn>;
  };
  readonly renderBar: (overrides?: Partial<StudioCharmBarProps>) => ReturnType<typeof render>;
}

export async function barHarness(
  charms: readonly StudioCharmId[],
  options: { readonly hydrate?: boolean; readonly failLoad?: boolean; readonly settled?: boolean } = {},
): Promise<CharmBarHarness> {
  const { hydrate = true, failLoad = false, settled = true } = options;
  const stored = normalizeStudioCharmBarState({ version: 1, charms, open: true, starterSettled: settled });
  const saves: ReturnType<typeof normalizeStudioCharmBarState>[] = [];
  const store = createStudioCharmBarStore({
    acquire: async () => ({
      loadCharmBar: async () => {
        if (failLoad) throw new Error("storage unavailable");
        return stored;
      },
      saveCharmBar: async (state) => { saves.push(state); },
    }),
  });
  if (hydrate) await store.hydrate();
  const spies = {
    addRenderedImage: vi.fn(() => true),
    addSticker: vi.fn(),
    addBubble: vi.fn(),
    addBuiltinRasterAsset: vi.fn(async () => true as boolean | void),
    addSfxPreset: vi.fn(async () => undefined),
  };
  const commands: StudioCharmHostCommands = { ...spies, openStudioObjectInsert: vi.fn() };
  const renderBar = (overrides: Partial<StudioCharmBarProps> = {}) => render(
    <StudioCharmBar
      store={store}
      commands={commands}
      readContext={() => VISIBLE_CONTEXT}
      canvas={{ width: 720, height: 1280 }}
      hostLibrary={HOST_LIBRARY_LOADED}
      assetFavoriteIds={[]}
      lock={null}
      loadCatalogData={loadStudioCharmCatalogData}
      acquireCatalogPreferences={catalogPreferences.acquire}
      {...overrides}
    />,
  );
  return { store, saves, commands, spies, renderBar };
}

export function chipButtons(): HTMLButtonElement[] {
  const toolbar = screen.getByRole("toolbar", { name: "고정한 참" });
  return within(toolbar).getAllByRole("button") as HTMLButtonElement[];
}

export function announcementText(): string {
  return document.querySelector("[data-studio-charm-announcement]")?.textContent ?? "";
}
