// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioCatalogPreferencesRepository } from "../catalog/studio-catalog-preferences";
import { STUDIO_RASTER_ASSETS } from "../render/studio-raster-assets";
import { STUDIO_ASSET_DRAG_MIME } from "../studio-insert-drag-core";
import { createStudioCharmBarStore, type StudioCharmBarStore } from "./studio-charm-bar-store";
import { loadStudioCharmCatalogData } from "./studio-charm-catalog-data";
import {
  STUDIO_CHARM_BAR_MAX_CHARMS,
  createStudioCharmId,
  normalizeStudioCharmBarState,
  type StudioCharmId,
} from "./studio-charm-model";
import { STUDIO_CHARM_STARTER_PACK } from "./studio-charm-starter-pack";
import { StudioCharmBar, type StudioCharmBarProps } from "./StudioCharmBar";

import type { StudioCharmActivationContext, StudioCharmHostCommands } from "./studio-charm-insert";

import { useI18n } from "@/shared/lib/i18n";

const FOCUS = createStudioCharmId("fx", "radial-focus");
const SPEED = createStudioCharmId("fx", "speed-lines");
const SWEAT = createStudioCharmId("fx", "sweat-drop");
const TEAR = createStudioCharmId("emoji", "1f4a7");
const TEAR_SWEAT = createStudioCharmId("emoji", "1f4a6");

const catalogPreferences = (() => {
  const values = new Map<string, string>();
  const repository = createStudioCatalogPreferencesRepository({
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value); },
    delete: async (key) => { values.delete(key); },
  });
  return { values, acquire: async () => repository };
})();

/** 호스트가 내 소재 목록을 이미 읽어 둔(비어 있는) 상태. 내 소재를 따로 읽지 않는 기본 시험 조건이다. */
const HOST_LIBRARY_LOADED = { assets: [], loaded: true, loading: false } as const;

const VISIBLE_CONTEXT: StudioCharmActivationContext = {
  documentWidth: 720,
  documentHeight: 1280,
  selection: null,
  visible: { center: { x: 360, y: 640 }, bounds: { x: 0, y: 400, width: 720, height: 480 } },
  snap: { enabled: false, gridSize: 40, viewportScale: 1 },
  sequenceFor: () => 0,
};

interface Harness {
  readonly store: StudioCharmBarStore;
  readonly saves: ReturnType<typeof normalizeStudioCharmBarState>[];
  readonly commands: StudioCharmHostCommands;
  readonly spies: {
    readonly addRenderedImage: ReturnType<typeof vi.fn>;
    readonly addSticker: ReturnType<typeof vi.fn>;
    readonly addBuiltinRasterAsset: ReturnType<typeof vi.fn>;
  };
  readonly renderBar: (overrides?: Partial<StudioCharmBarProps>) => ReturnType<typeof render>;
}

async function harness(
  charms: readonly StudioCharmId[],
  options: { readonly hydrate?: boolean; readonly failLoad?: boolean; readonly settled?: boolean } = {},
): Promise<Harness> {
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
    addBuiltinRasterAsset: vi.fn(async () => true as boolean | void),
  };
  const commands: StudioCharmHostCommands = {
    ...spies,
    addBubble: vi.fn(),
    addSfxPreset: vi.fn(async () => undefined),
    openStudioObjectInsert: vi.fn(),
  };
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

function chips(): HTMLButtonElement[] {
  const toolbar = screen.getByRole("toolbar", { name: "고정한 참" });
  return within(toolbar).getAllByRole("button") as HTMLButtonElement[];
}

function announcement(): string {
  return document.querySelector("[data-studio-charm-announcement]")?.textContent ?? "";
}

/** `⋯` 메뉴의 "순서·삭제 편집"을 눌러 순서 편집 모드로 들어간다(참을 빼는 길은 이 모드뿐이다). */
function enterEditMode(): void {
  fireEvent.click(screen.getByRole("button", { name: "참 바 메뉴" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "참 바 메뉴" })).getByRole("button", { name: "순서·삭제 편집" }));
}

beforeEach(() => {
  useI18n.getState().setLang("ko");
  catalogPreferences.values.clear();
});

afterEach(() => {
  cleanup();
});

describe("참 바: 상태 표시", () => {
  it("저장소를 읽는 동안에는 로딩 상태를 알린다", async () => {
    const { renderBar } = await harness([FOCUS], { hydrate: false });
    renderBar();
    const loading = document.querySelector("[data-studio-charm-loading]");
    expect(loading?.getAttribute("role")).toBe("status");
    expect(loading?.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByText("참 바를 여는 중…")).toBeTruthy();
    expect(document.querySelector("section[aria-label='참 바']")?.getAttribute("aria-busy")).toBe("true");
  });

  it("빈 바는 스타터 팩을 제안하고, 누르면 12개가 담긴다", async () => {
    const { renderBar, store } = await harness([], { settled: true });
    renderBar();
    expect(screen.getByText("고정한 참이 없어요")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "기본 참 담기" }));
    await waitFor(() => expect(store.getSnapshot().state.charms).toEqual(STUDIO_CHARM_STARTER_PACK));
    await waitFor(() => expect(chips()).toHaveLength(STUDIO_CHARM_STARTER_PACK.length));
    expect(announcement()).toContain("기본 참을 담았어요");
  });

  it("저장소를 읽지 못하면 메모리 전용임을 알리고 다시 시도할 수 있다", async () => {
    const { renderBar, store } = await harness([FOCUS], { failLoad: true });
    renderBar();
    expect(screen.getByText("저장소에 연결하지 못해 이번 탭에서만 유지돼요.")).toBeTruthy();
    expect(document.querySelector("[data-studio-ui-preferences-authority='memory-only']")).toBeTruthy();
    const retry = vi.spyOn(store, "retry");
    fireEvent.click(screen.getByRole("button", { name: "저장 다시 시도" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("원본이 사라진 참은 '사용할 수 없는 참'으로 보이고, 순서 편집에서 Delete 로 뺄 수 있다", async () => {
    const missing = createStudioCharmId("element", "no-such-element");
    const { renderBar, store } = await harness([missing, FOCUS]);
    renderBar();
    const [unavailable] = await waitFor(() => {
      const list = chips();
      expect(list).toHaveLength(2);
      return list;
    });
    expect(unavailable.getAttribute("aria-label")).toBe("사용할 수 없는 참");
    // 편집 중이 아니면 누르거나 Delete 를 눌러도 빼지 않고, 어떻게 빼는지 알려 준다.
    fireEvent.keyDown(unavailable, { key: "Enter" });
    expect(announcement()).toContain("순서·삭제 편집에서");
    fireEvent.keyDown(unavailable, { key: "Delete" });
    expect(store.getSnapshot().state.charms).toEqual([missing, FOCUS]);
    enterEditMode();
    fireEvent.keyDown(chips()[0], { key: "Delete" });
    await waitFor(() => expect(store.getSnapshot().state.charms).toEqual([FOCUS]));
    expect(announcement()).toContain("참 바에서 뺐어요");
  });

  it("효과·스티커 목록을 기다리는 동안 해당 칩은 자리표시이고, 오면 실제 칩이 된다", async () => {
    const { renderBar } = await harness([FOCUS, TEAR]);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    renderBar({
      loadCatalogData: async () => {
        await gate;
        return loadStudioCharmCatalogData();
      },
    });
    expect(document.querySelectorAll("[data-studio-charm-pending]")).toHaveLength(1);
    expect(chips().map((chip) => chip.getAttribute("aria-label"))).toEqual(["눈물·물방울"]);
    release();
    await waitFor(() => expect(chips().map((chip) => chip.getAttribute("aria-label"))).toEqual(["집중선", "눈물·물방울"]));
    expect(document.querySelectorAll("[data-studio-charm-pending]")).toHaveLength(0);
  });
});

describe("참 바: 붙이기", () => {
  it("칩은 이름이 있는 네이티브 버튼이고 Tab 정지점은 하나뿐이다", async () => {
    const { renderBar } = await harness([FOCUS, SPEED, SWEAT]);
    renderBar();
    await waitFor(() => expect(chips()).toHaveLength(3));
    expect(chips().map((chip) => chip.tagName)).toEqual(["BUTTON", "BUTTON", "BUTTON"]);
    expect(chips().map((chip) => chip.getAttribute("aria-label"))).toEqual(["집중선", "속도선", "큰 땀방울"]);
    expect(chips().filter((chip) => chip.tabIndex === 0)).toHaveLength(1);
    expect(chips()[0].tabIndex).toBe(0);
    // 사용법 안내는 칩마다가 아니라 도구 모음에 한 번만 연결된다(칩을 옮길 때마다 긴 설명이 읽히지 않는다).
    expect(chips().every((chip) => !chip.hasAttribute("aria-describedby"))).toBe(true);
    const toolbar = screen.getByRole("toolbar", { name: "고정한 참" });
    const help = document.getElementById(toolbar.getAttribute("aria-describedby") ?? "")?.textContent ?? "";
    expect(help).toContain("Enter");
    expect(help).toContain("순서·삭제 편집");
  });

  it("누르면 호스트 이미지 삽입 명령을 정확히 한 번 부르고 결과를 알린다", async () => {
    const { renderBar, spies } = await harness([FOCUS, TEAR]);
    renderBar();
    await waitFor(() => expect(chips()).toHaveLength(2));
    fireEvent.click(chips()[0]);
    await waitFor(() => expect(announcement()).toBe("붙였어요: 집중선"));
    expect(spies.addRenderedImage).toHaveBeenCalledTimes(1);
    expect(spies.addSticker).not.toHaveBeenCalled();
    fireEvent.click(chips()[1]);
    // 이모지 명령은 결과를 돌려주지 않아 "붙였어요"가 아니라 "요청했어요"로 알린다.
    await waitFor(() => expect(announcement()).toContain("눈물·물방울 붙이기를 요청했어요"));
    expect(spies.addSticker).toHaveBeenCalledTimes(1);
    expect(spies.addRenderedImage).toHaveBeenCalledTimes(1);
  });

  it("호스트가 거절하면 이유를 확인하라고 안내한다", async () => {
    const { renderBar, spies } = await harness([FOCUS]);
    spies.addRenderedImage.mockReturnValueOnce(false);
    renderBar();
    await waitFor(() => expect(chips()).toHaveLength(1));
    fireEvent.click(chips()[0]);
    await waitFor(() => expect(announcement()).toContain("붙이지 못했어요"));
  });

  it("Enter·Space 는 한 번만 붙이고 키를 누르고 있어도 반복해서 붙이지 않는다", async () => {
    const { renderBar, spies } = await harness([FOCUS]);
    renderBar();
    await waitFor(() => expect(chips()).toHaveLength(1));
    const chip = chips()[0];
    expect(fireEvent.keyDown(chip, { key: "Enter" })).toBe(false);
    expect(fireEvent.keyDown(chip, { key: "Enter", repeat: true })).toBe(false);
    expect(fireEvent.keyDown(chip, { key: " " })).toBe(false);
    await waitFor(() => expect(spies.addRenderedImage).toHaveBeenCalledTimes(2));
    expect(spies.addRenderedImage).toHaveBeenCalledTimes(2);
  });

  it("편집 잠금이면 붙이지 않고 이유를 보여 주며 칩은 aria-disabled 다", async () => {
    const { renderBar, spies } = await harness([FOCUS]);
    renderBar({ lock: { kind: "collaboration", message: null } });
    await waitFor(() => expect(chips()).toHaveLength(1));
    expect(chips()[0].getAttribute("aria-disabled")).toBe("true");
    expect(chips()[0].draggable).toBe(false);
    expect(screen.getAllByText("공동 편집 잠금 때문에 지금은 붙일 수 없어요.").length).toBeGreaterThan(0);
    fireEvent.click(chips()[0]);
    expect(spies.addRenderedImage).not.toHaveBeenCalled();
  });

  it("누르는 순간의 문맥을 읽는다(렌더 때가 아니라 클릭 때)", async () => {
    const { renderBar } = await harness([FOCUS]);
    const readContext = vi.fn(() => VISIBLE_CONTEXT);
    renderBar({ readContext });
    await waitFor(() => expect(chips()).toHaveLength(1));
    expect(readContext).not.toHaveBeenCalled();
    fireEvent.click(chips()[0]);
    await waitFor(() => expect(readContext).toHaveBeenCalledTimes(1));
  });
});

describe("참 바: 끌어다 놓기", () => {
  it("SVG 효과 칩은 draggable 이고 시작하면 기존 json-asset 페이로드를 쓴다", async () => {
    const { renderBar } = await harness([FOCUS]);
    renderBar();
    await waitFor(() => expect(chips()).toHaveLength(1));
    const written = new Map<string, string>();
    const dataTransfer = { effectAllowed: "none", setData: (format: string, value: string) => { written.set(format, value); } };
    expect(chips()[0].draggable).toBe(true);
    fireEvent.dragStart(chips()[0], { dataTransfer });
    expect(written.has(STUDIO_ASSET_DRAG_MIME)).toBe(true);
    expect(dataTransfer.effectAllowed).toBe("copy");
  });

  it("끌어다 놓기 계약이 없는 일러스트 칩은 끌기가 꺼져 있고 눌러서 붙인다", async () => {
    const asset = STUDIO_RASTER_ASSETS[0];
    const { renderBar, spies } = await harness([createStudioCharmId("raster", asset.id)]);
    renderBar();
    await waitFor(() => expect(chips()).toHaveLength(1));
    expect(chips()[0].draggable).toBe(false);
    expect(chips()[0].getAttribute("aria-label")).toContain("AI 생성");
    fireEvent.click(chips()[0]);
    await waitFor(() => expect(spies.addBuiltinRasterAsset).toHaveBeenCalledWith(asset));
  });
});

describe("참 바: 키보드와 순서 편집", () => {
  it("화살표·Home·End 로 이동하고 Tab 정지점이 따라간다(끝에서 순환)", async () => {
    const { renderBar } = await harness([FOCUS, SPEED, SWEAT]);
    renderBar();
    await waitFor(() => expect(chips()).toHaveLength(3));
    chips()[0].focus();
    fireEvent.keyDown(chips()[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(chips()[1]);
    expect(chips().map((chip) => chip.tabIndex)).toEqual([-1, 0, -1]);
    fireEvent.keyDown(chips()[1], { key: "End" });
    expect(document.activeElement).toBe(chips()[2]);
    fireEvent.keyDown(chips()[2], { key: "ArrowDown" });
    expect(document.activeElement).toBe(chips()[0]);
    fireEvent.keyDown(chips()[0], { key: "ArrowUp" });
    expect(document.activeElement).toBe(chips()[2]);
    fireEvent.keyDown(chips()[2], { key: "Home" });
    expect(document.activeElement).toBe(chips()[0]);
  });

  it("Alt+방향키로 순서를 바꾸고 저장하며 포커스가 옮겨진 칩을 따라간다", async () => {
    const { renderBar, store, saves } = await harness([FOCUS, SPEED, SWEAT]);
    renderBar();
    await waitFor(() => expect(chips()).toHaveLength(3));
    chips()[0].focus();
    fireEvent.keyDown(chips()[0], { key: "ArrowRight", altKey: true });
    await waitFor(() => expect(store.getSnapshot().state.charms).toEqual([SPEED, FOCUS, SWEAT]));
    await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toBe("집중선"));
    expect(announcement()).toContain("2번째로 옮겼어요");
    await waitFor(() => expect(saves.at(-1)?.charms).toEqual([SPEED, FOCUS, SWEAT]));
  });

  it("순서 편집 중 Delete 는 참을 빼고 포커스를 이웃 칩으로 옮긴다", async () => {
    const { renderBar, store } = await harness([FOCUS, SPEED, SWEAT]);
    renderBar();
    await waitFor(() => expect(chips()).toHaveLength(3));
    enterEditMode();
    chips()[1].focus();
    fireEvent.keyDown(chips()[1], { key: "Delete" });
    await waitFor(() => expect(store.getSnapshot().state.charms).toEqual([FOCUS, SWEAT]));
    await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toBe("큰 땀방울"));
  });

  describe("불러오는 중인 자리표시 칩이 섞여 있을 때", () => {
    // 효과 목록이 끝내 오지 않는 상태: 효과(fx) 참은 자리표시로 남고 이모지 참만 눌러 쓸 수 있다.
    const neverLoads = () => new Promise<never>(() => undefined);

    it("화살표·End 는 자리표시 칩을 건너뛰고 닿을 수 있는 칩끼리만 오간다", async () => {
      const { renderBar } = await harness([TEAR, FOCUS, TEAR_SWEAT, SPEED]);
      renderBar({ loadCatalogData: neverLoads });
      await waitFor(() => expect(chips()).toHaveLength(2));
      expect(document.querySelectorAll("[data-studio-charm-pending]")).toHaveLength(2);
      const [first, second] = chips();
      first.focus();
      fireEvent.keyDown(first, { key: "ArrowRight" });
      expect(document.activeElement).toBe(second);
      fireEvent.keyDown(second, { key: "ArrowRight" });
      expect(document.activeElement).toBe(first);
      fireEvent.keyDown(first, { key: "End" });
      expect(document.activeElement).toBe(second);
      expect(chips().map((chip) => chip.tabIndex)).toEqual([-1, 0]);
    });

    it("Alt+방향키 순서 변경은 자리표시 이웃을 건너뛰고 보이는 이웃과 자리를 바꾼다", async () => {
      const { renderBar, store } = await harness([TEAR, FOCUS, TEAR_SWEAT, SPEED]);
      renderBar({ loadCatalogData: neverLoads });
      await waitFor(() => expect(chips()).toHaveLength(2));
      chips()[0].focus();
      fireEvent.keyDown(chips()[0], { key: "ArrowRight", altKey: true });
      await waitFor(() => expect(store.getSnapshot().state.charms).toEqual([FOCUS, TEAR_SWEAT, TEAR, SPEED]));
      await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toBe("눈물·물방울"));
      // 맨 끝의 보이는 칩은 더 뒤로 가지 않는다.
      fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowRight", altKey: true });
      expect(store.getSnapshot().state.charms).toEqual([FOCUS, TEAR_SWEAT, TEAR, SPEED]);
    });

    it("순서 편집에서 Delete 로 뺀 뒤 포커스는 자리표시가 아닌 가장 가까운 칩으로 간다", async () => {
      const { renderBar, store } = await harness([TEAR, FOCUS, TEAR_SWEAT]);
      renderBar({ loadCatalogData: neverLoads });
      await waitFor(() => expect(chips()).toHaveLength(2));
      enterEditMode();
      chips()[0].focus();
      fireEvent.keyDown(chips()[0], { key: "Delete" });
      await waitFor(() => expect(store.getSnapshot().state.charms).toEqual([FOCUS, TEAR_SWEAT]));
      await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toBe("땀방울"));
    });
  });

  it("메뉴의 편집 모드에서 칩을 고르고 앞/뒤로 옮기거나 빼고 Esc 로 끝낸다", async () => {
    const { renderBar, store } = await harness([FOCUS, SPEED, SWEAT]);
    renderBar();
    await waitFor(() => expect(chips()).toHaveLength(3));
    fireEvent.click(screen.getByRole("button", { name: "참 바 메뉴" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "참 바 메뉴" })).getByRole("button", { name: "순서·삭제 편집" }));
    const group = screen.getByRole("group", { name: "선택한 참 편집" });
    expect(within(group).getByRole("button", { name: "앞으로 옮기기" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(chips()[1]);
    expect(chips()[1].getAttribute("aria-pressed")).toBe("true");
    expect(chips().every((chip) => !chip.draggable)).toBe(true);
    fireEvent.click(within(group).getByRole("button", { name: "뒤로 옮기기" }));
    await waitFor(() => expect(store.getSnapshot().state.charms).toEqual([FOCUS, SWEAT, SPEED]));
    fireEvent.click(within(group).getByRole("button", { name: "참 바에서 빼기" }));
    await waitFor(() => expect(store.getSnapshot().state.charms).toEqual([FOCUS, SWEAT]));
    fireEvent.keyDown(chips()[0], { key: "Escape" });
    expect(screen.queryByRole("group", { name: "선택한 참 편집" })).toBeNull();
    expect(screen.getByRole("group", { name: "참 바 도구" })).toBeTruthy();
  });

  it("메뉴의 단축키 안내가 실제로 지원하는 키를 보여 준다", async () => {
    const { renderBar } = await harness([FOCUS]);
    renderBar();
    await waitFor(() => expect(chips()).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "참 바 메뉴" }));
    fireEvent.click(screen.getByRole("button", { name: "단축키 안내" }));
    const list = document.querySelector("[data-studio-charm-shortcuts]");
    expect(list?.textContent).toContain("Enter · Space");
    expect(list?.textContent).toContain("Alt + ← → ↑ ↓");
    expect(list?.textContent).toContain("Delete");
  });

  it("메뉴에서 참 바를 닫으면 펼침 상태가 꺼진다", async () => {
    const { renderBar, store } = await harness([FOCUS]);
    renderBar();
    await waitFor(() => expect(chips()).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "참 바 메뉴" }));
    fireEvent.click(screen.getByRole("button", { name: "참 바 닫기" }));
    expect(store.getSnapshot().state.open).toBe(false);
  });
});

function pickButton(dialog: HTMLElement, id: StudioCharmId): HTMLButtonElement | null {
  return dialog.querySelector<HTMLButtonElement>(`[data-studio-charm-pick="${id}"]`);
}

describe("참 고르기(선택기)", () => {
  async function openPicker(h: Harness, overrides: Partial<StudioCharmBarProps> = {}) {
    h.renderBar(overrides);
    await waitFor(() => expect(screen.getByRole("button", { name: "참 고르기" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "참 고르기" }));
    return screen.getByRole("dialog", { name: "참 고르기" });
  }

  it("검색해서 고정/해제하고, 고정 상태는 aria-pressed 로 드러난다", async () => {
    const h = await harness([TEAR]);
    const dialog = await openPicker(h);
    expect(document.activeElement).toBe(within(dialog).getByRole("searchbox", { name: "참 검색" }));
    fireEvent.change(within(dialog).getByRole("searchbox", { name: "참 검색" }), { target: { value: "집중선" } });
    const pin = await waitFor(() => {
      const found = pickButton(dialog, FOCUS);
      expect(found).not.toBeNull();
      return found as HTMLButtonElement;
    });
    expect(pin.getAttribute("aria-label")).toBe("집중선 — 참 바에 고정");
    expect(pin.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(pin);
    await waitFor(() => expect(h.store.getSnapshot().state.charms).toEqual([TEAR, FOCUS]));
    expect(announcement()).toBe("참 바에 고정했어요: 집중선");
    await waitFor(() => expect(pickButton(dialog, FOCUS)?.getAttribute("aria-pressed")).toBe("true"));
    // 고정 상태는 aria-pressed 한 곳으로만 전한다: 라벨은 상태와 상관없이 같다.
    expect(pickButton(dialog, FOCUS)?.getAttribute("aria-label")).toBe("집중선 — 참 바에 고정");
    fireEvent.click(pickButton(dialog, FOCUS) as HTMLButtonElement);
    await waitFor(() => expect(h.store.getSnapshot().state.charms).toEqual([TEAR]));
  });

  it("검색 결과가 없으면 안내와 검색 지우기를 보여 준다", async () => {
    const h = await harness([]);
    const dialog = await openPicker(h);
    fireEvent.change(within(dialog).getByRole("searchbox"), { target: { value: "절대없는낱말" } });
    expect(await within(dialog).findByText("찾는 참이 없어요")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "검색 지우기" }));
    expect((within(dialog).getByRole("searchbox") as HTMLInputElement).value).toBe("");
  });

  it("가득 찬 바에서는 새로 고정할 수 없고 이유를 알린다", async () => {
    const many = Array.from({ length: STUDIO_CHARM_BAR_MAX_CHARMS }, (_, index) => createStudioCharmId("element", `shape-rect-${index}`));
    const h = await harness(many);
    const dialog = await openPicker(h);
    expect(within(dialog).getByText(/참 바가 가득 찼어요/)).toBeTruthy();
    const target = await waitFor(() => {
      const found = pickButton(dialog, FOCUS);
      expect(found).not.toBeNull();
      return found as HTMLButtonElement;
    });
    expect(target.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(target);
    expect(h.store.getSnapshot().state.charms).toHaveLength(STUDIO_CHARM_BAR_MAX_CHARMS);
  });

  it("기존 즐겨찾기(내장 일러스트의 별)를 '즐겨찾기' 분류로 모아 보여 준다", async () => {
    const asset = STUDIO_RASTER_ASSETS[0];
    const h = await harness([]);
    const dialog = await openPicker(h, { assetFavoriteIds: [`raster:${asset.id}`] });
    fireEvent.click(within(dialog).getByRole("button", { name: /즐겨찾기/ }));
    const item = await waitFor(() => {
      const found = pickButton(dialog, createStudioCharmId("raster", asset.id));
      expect(found).not.toBeNull();
      return found as HTMLButtonElement;
    });
    expect(item.getAttribute("aria-label")).toContain(asset.label);
    expect(within(dialog).queryByText("찾는 참이 없어요")).toBeNull();
  });

  it("효과·스티커 목록 로드에 실패하면 오류와 다시 불러오기를 보이고, 이모지·도형은 계속 쓸 수 있다", async () => {
    const h = await harness([]);
    const loadCatalogData = vi.fn()
      .mockRejectedValueOnce(new Error("chunk"))
      .mockImplementation(loadStudioCharmCatalogData);
    const dialog = await openPicker(h, { loadCatalogData });
    expect(await within(dialog).findByRole("alert")).toBeTruthy();
    expect(within(dialog).getByText(/이모지와 도형은 그대로 쓸 수 있어요/)).toBeTruthy();
    fireEvent.change(within(dialog).getByRole("searchbox"), { target: { value: "땀방울" } });
    await waitFor(() => expect(pickButton(dialog, TEAR_SWEAT)).not.toBeNull());
    fireEvent.click(within(dialog).getByRole("button", { name: "다시 불러오기" }));
    await waitFor(() => expect(within(dialog).queryByRole("alert")).toBeNull());
    expect(loadCatalogData).toHaveBeenCalledTimes(2);
  });

  it("Esc 로 닫으면 포커스가 + 버튼으로 돌아온다", async () => {
    const h = await harness([FOCUS]);
    await openPicker(h);
    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "참 고르기" })).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "참 고르기" }));
  });
});

describe("내 소재 참: 호스트가 목록을 읽기 전에도 해석한다", () => {
  const MINE = createStudioCharmId("library", "mine-1");
  const mineAsset = { id: "mine-1", name: "내 손 모양", dataUrl: "data:image/png;base64,AAAA", width: 120, height: 90 };
  const HOST_UNREAD = { assets: [], loaded: false, loading: false } as const;

  function gate<T>(value: T) {
    let release: () => void = () => undefined;
    const opened = new Promise<void>((resolve) => { release = resolve; });
    return { release, load: async () => { await opened; return value; } };
  }
  const labels = () => chips().map((chip) => chip.getAttribute("aria-label"));

  it("고정한 내 소재 참은 읽는 동안 자리표시이고, 읽으면 실제 칩이 되어 붙는다", async () => {
    const h = await harness([MINE]);
    const { release, load } = gate([mineAsset]);
    const loadLibrary = vi.fn(load);
    h.renderBar({ hostLibrary: HOST_UNREAD, loadLibrary });
    expect(document.querySelectorAll("[data-studio-charm-pending]")).toHaveLength(1);
    // 비어 보인다고 '사용할 수 없는 참'으로 잘못 알리지 않는다.
    expect(document.querySelector("[data-studio-charm-state='missing']")).toBeNull();
    release();
    await waitFor(() => expect(labels()).toEqual(["내 손 모양"]));
    expect(document.querySelectorAll("[data-studio-charm-pending]")).toHaveLength(0);
    fireEvent.click(chips()[0]);
    await waitFor(() => expect(h.spies.addRenderedImage).toHaveBeenCalledTimes(1));
    expect(h.spies.addRenderedImage.mock.calls[0]?.slice(0, 3)).toEqual([mineAsset.dataUrl, 120, 90]);
    expect(loadLibrary).toHaveBeenCalledTimes(1);
  });

  it("내 소재 참도 없고 선택기도 닫혀 있으면 보관함을 읽지 않는다", async () => {
    const h = await harness([FOCUS]);
    const loadLibrary = vi.fn(async () => [mineAsset]);
    h.renderBar({ hostLibrary: HOST_UNREAD, loadLibrary });
    await waitFor(() => expect(chips()).toHaveLength(1));
    expect(loadLibrary).not.toHaveBeenCalled();
  });

  it("호스트가 이미 목록을 읽었다면 그 목록으로 해석하고 따로 읽지 않는다", async () => {
    const h = await harness([MINE]);
    const loadLibrary = vi.fn(async () => []);
    h.renderBar({ hostLibrary: { assets: [mineAsset], loaded: true, loading: false }, loadLibrary });
    await waitFor(() => expect(labels()).toEqual(["내 손 모양"]));
    expect(loadLibrary).not.toHaveBeenCalled();
  });

  it("목록에서 사라진 내 소재는 읽은 뒤에야 '사용할 수 없는 참'이 된다", async () => {
    const h = await harness([MINE]);
    h.renderBar({ hostLibrary: { assets: [], loaded: true, loading: false } });
    await waitFor(() => expect(labels()).toEqual(["사용할 수 없는 참"]));
  });

  it("읽지 못하면 안내와 다시 불러오기를 보이고, 누르면 읽어 와 안내가 사라진다", async () => {
    const h = await harness([MINE]);
    const loadLibrary = vi.fn()
      .mockRejectedValueOnce(new Error("opfs unavailable"))
      .mockResolvedValueOnce([mineAsset]);
    h.renderBar({ hostLibrary: HOST_UNREAD, loadLibrary });
    const note = await waitFor(() => {
      const found = document.querySelector<HTMLElement>("[data-studio-charm-note='library']");
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(note.getAttribute("role")).toBe("status");
    expect(note.textContent).toContain("내 소재 목록을 불러오지 못해");
    expect(document.querySelectorAll("[data-studio-charm-pending]")).toHaveLength(1);
    const retry = within(note).getByRole("button", { name: "내 소재 다시 불러오기" });
    expect(retry.className).toContain("min-h-11");
    fireEvent.click(retry);
    await waitFor(() => expect(labels()).toEqual(["내 손 모양"]));
    expect(document.querySelector("[data-studio-charm-note='library']")).toBeNull();
    expect(loadLibrary).toHaveBeenCalledTimes(2);
  });

  it("선택기를 열면 내 소재를 읽어 '내 소재' 분류에서 고를 수 있고, 읽는 동안 안내한다", async () => {
    const h = await harness([]);
    const { release, load } = gate([mineAsset]);
    const loadLibrary = vi.fn(load);
    h.renderBar({ hostLibrary: HOST_UNREAD, loadLibrary });
    await waitFor(() => expect(screen.getByRole("button", { name: "참 고르기" })).toBeTruthy());
    expect(loadLibrary).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "참 고르기" }));
    const dialog = screen.getByRole("dialog", { name: "참 고르기" });
    expect(await within(dialog).findByText(/내 소재를 불러오는 중/)).toBeTruthy();
    release();
    await waitFor(() => expect(within(dialog).queryByText(/내 소재를 불러오는 중/)).toBeNull());
    fireEvent.click(within(dialog).getByRole("button", { name: /^내 소재\s*\d+$/ }));
    const pin = await waitFor(() => {
      const found = pickButton(dialog, MINE);
      expect(found).not.toBeNull();
      return found as HTMLButtonElement;
    });
    expect(pin.getAttribute("aria-label")).toBe("내 손 모양 — 참 바에 고정");
    fireEvent.click(pin);
    await waitFor(() => expect(h.store.getSnapshot().state.charms).toEqual([MINE]));
    expect(loadLibrary).toHaveBeenCalledTimes(1);
  });

  it("내 소재에 단 별(local:)도 '즐겨찾기' 분류에 모이고, 거기서 바로 고정할 수 있다", async () => {
    const h = await harness([]);
    h.renderBar({
      hostLibrary: { assets: [mineAsset], loaded: true, loading: false },
      assetFavoriteIds: ["local:mine-1", "community:other"],
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "참 고르기" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "참 고르기" }));
    const dialog = screen.getByRole("dialog", { name: "참 고르기" });
    fireEvent.click(within(dialog).getByRole("button", { name: /즐겨찾기/ }));
    const pin = await waitFor(() => {
      const found = pickButton(dialog, MINE);
      expect(found).not.toBeNull();
      return found as HTMLButtonElement;
    });
    // 커뮤니티 에셋 별은 원본을 내려받아 검증해야 해서 참 대상이 아니다.
    expect(dialog.querySelectorAll("[data-studio-charm-pick]")).toHaveLength(1);
    fireEvent.click(pin);
    await waitFor(() => expect(h.store.getSnapshot().state.charms).toEqual([MINE]));
  });

  it("선택기에서 내 소재를 읽지 못하면 오류와 다시 불러오기를 보이고 다른 분류는 계속 쓸 수 있다", async () => {
    const h = await harness([]);
    const loadLibrary = vi.fn()
      .mockRejectedValueOnce(new Error("opfs unavailable"))
      .mockResolvedValueOnce([mineAsset]);
    h.renderBar({ hostLibrary: HOST_UNREAD, loadLibrary });
    await waitFor(() => expect(screen.getByRole("button", { name: "참 고르기" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "참 고르기" }));
    const dialog = screen.getByRole("dialog", { name: "참 고르기" });
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("내 소재 목록을 불러오지 못했어요");
    fireEvent.change(within(dialog).getByRole("searchbox"), { target: { value: "땀방울" } });
    await waitFor(() => expect(pickButton(dialog, TEAR_SWEAT)).not.toBeNull());
    fireEvent.click(within(alert).getByRole("button", { name: "내 소재 다시 불러오기" }));
    await waitFor(() => expect(within(dialog).queryByRole("alert")).toBeNull());
    expect(loadLibrary).toHaveBeenCalledTimes(2);
  });
});
