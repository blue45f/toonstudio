// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { preloadStudioCharmBar } from "./studio-charm-bar-loader";
import { createStudioCharmBarStore, type StudioCharmBarStore } from "./studio-charm-bar-store";
import { preloadStudioCharmCatalogData } from "./studio-charm-catalog-data";
import { StudioCharmBarToggleButton, StudioCharmPinAction } from "./StudioCharmBarControls";
import {
  STUDIO_CHARM_BAR_MAX_CHARMS,
  createStudioCharmId,
  normalizeStudioCharmBarState,
  type StudioCharmBarState,
  type StudioCharmId,
} from "./studio-charm-model";
import { STUDIO_CHARM_STARTER_PACK } from "./studio-charm-starter-pack";

import { useI18n } from "@/shared/lib/i18n";

// 지연 로드 경계는 호출만 확인한다(실제 모듈을 불러오지 않는다).
vi.mock("./studio-charm-bar-loader", () => ({ loadStudioCharmBar: vi.fn(), preloadStudioCharmBar: vi.fn() }));
vi.mock("./studio-charm-catalog-data", () => ({ loadStudioCharmCatalogData: vi.fn(), preloadStudioCharmCatalogData: vi.fn() }));

function makeStore(initial: Partial<StudioCharmBarState> & { readonly charms?: readonly StudioCharmId[] } = {}) {
  const stored = normalizeStudioCharmBarState({
    version: 1,
    charms: initial.charms ?? [],
    open: initial.open ?? false,
    starterSettled: initial.starterSettled ?? false,
  });
  const saves: StudioCharmBarState[] = [];
  const store: StudioCharmBarStore = createStudioCharmBarStore({
    acquire: async () => ({
      loadCharmBar: async () => stored,
      saveCharmBar: async (state) => { saves.push(state); },
    }),
  });
  return { store, saves };
}

beforeEach(() => {
  useI18n.getState().setLang("ko");
  vi.mocked(preloadStudioCharmBar).mockClear();
  vi.mocked(preloadStudioCharmCatalogData).mockClear();
});

afterEach(() => {
  cleanup();
});

describe("참 바 토글 행", () => {
  it("이름은 '참 바' 로 고정이고 켜짐 여부는 aria-pressed 로 전한다", async () => {
    const { store } = makeStore();
    render(<StudioCharmBarToggleButton store={store} />);
    const toggle = await screen.findByRole("button", { name: "참 바" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.getAttribute("aria-label")).toBe("참 바");
    const hint = document.getElementById(toggle.getAttribute("aria-describedby") ?? "");
    expect(hint?.textContent).toContain("한 번에 붙이는");
    // 공용 스위치 모양(SwitchIndicator)을 쓰고 직접 그리지 않는다.
    expect(toggle.querySelector("[data-ui-switch-track]")?.getAttribute("data-state")).toBe("off");
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute("aria-pressed")).toBe("true"));
    expect(toggle.querySelector("[data-ui-switch-track]")?.getAttribute("data-state")).toBe("on");
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute("aria-pressed")).toBe("false"));
  });

  it("켜려는 낌새(포인터 올림·터치·포커스)가 보이면 본체와 카탈로그 데이터를 미리 불러오되, 켜기 전에는 아무것도 그리지 않는다", async () => {
    const { store } = makeStore();
    render(<StudioCharmBarToggleButton store={store} />);
    const toggle = await screen.findByRole("button", { name: "참 바" });
    expect(preloadStudioCharmBar).not.toHaveBeenCalled();
    fireEvent.pointerEnter(toggle);
    fireEvent.pointerDown(toggle);
    fireEvent.focus(toggle);
    expect(preloadStudioCharmBar).toHaveBeenCalledTimes(3);
    expect(preloadStudioCharmCatalogData).toHaveBeenCalledTimes(3);
    expect(store.getSnapshot().state.open).toBe(false);
  });

  it("터치 대상은 44px 이상이고 키보드 포커스 링이 있다", async () => {
    const { store } = makeStore();
    render(<StudioCharmBarToggleButton store={store} />);
    const toggle = await screen.findByRole("button", { name: "참 바" });
    expect(toggle.className).toContain("min-h-11");
    expect(toggle.className).toContain("focus-visible:outline");
    expect(toggle.className).toContain("motion-reduce:transition-none");
  });

  it("처음 켜면 기본 스타터 참이 한 번 담기고, 껐다 켜도 다시 담지 않는다", async () => {
    const { store, saves } = makeStore();
    render(<StudioCharmBarToggleButton store={store} />);
    const toggle = await screen.findByRole("button", { name: "참 바" });
    await waitFor(() => expect(store.getSnapshot().hydrated).toBe(true));
    fireEvent.click(toggle);
    expect(store.getSnapshot().state.charms).toEqual(STUDIO_CHARM_STARTER_PACK);
    await waitFor(() => expect(saves.at(-1)?.open).toBe(true));
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(store.getSnapshot().state.charms).toEqual(STUDIO_CHARM_STARTER_PACK);
  });

  it("다른 곳(바 메뉴)에서 닫아도 같은 스토어를 보므로 즉시 맞는다", async () => {
    const { store } = makeStore({ open: true, starterSettled: true });
    render(<StudioCharmBarToggleButton store={store} />);
    const toggle = await screen.findByRole("button", { name: "참 바" });
    await waitFor(() => expect(toggle.getAttribute("aria-pressed")).toBe("true"));
    act(() => { store.dispatch({ type: "set-open", open: false }); });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("참 바에 고정 버튼", () => {
  const SHAPE = createStudioCharmId("element", "shape-superellipse");

  it("이름은 고정이고 고정 여부는 aria-pressed 로 전하며, 누를 때마다 고정·해제한다", async () => {
    const { store } = makeStore({ starterSettled: true });
    render(<StudioCharmPinAction kind="element" rawId="shape-superellipse" store={store} />);
    const pin = await screen.findByRole("button", { name: "참 바에 고정" });
    expect(pin.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(pin);
    expect(store.getSnapshot().state.charms).toEqual([SHAPE]);
    expect(pin.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "참 바에 고정" })).toBe(pin);
    fireEvent.click(pin);
    expect(store.getSnapshot().state.charms).toEqual([]);
    expect(pin.getAttribute("aria-pressed")).toBe("false");
  });

  it("고정하면 바를 함께 펼치고, 해제할 때는 바를 그대로 둔다", async () => {
    const { store } = makeStore({ starterSettled: true });
    render(<StudioCharmPinAction kind="element" rawId="shape-superellipse" store={store} />);
    const pin = await screen.findByRole("button", { name: "참 바에 고정" });
    expect(store.getSnapshot().state.open).toBe(false);
    fireEvent.click(pin);
    expect(store.getSnapshot().state.open).toBe(true);
    store.dispatch({ type: "set-open", open: false });
    fireEvent.click(pin);
    expect(store.getSnapshot().state.charms).toEqual([]);
    expect(store.getSnapshot().state.open).toBe(false);
  });

  it("바가 가득 차면 고정하지 않고 같은 자리에서 이유를 알린다", async () => {
    const many = Array.from(
      { length: STUDIO_CHARM_BAR_MAX_CHARMS },
      (_, index) => createStudioCharmId("element", `filler-${index}`),
    );
    const { store } = makeStore({ charms: many, starterSettled: true });
    render(<StudioCharmPinAction kind="element" rawId="shape-superellipse" store={store} />);
    const pin = await screen.findByRole("button", { name: "참 바에 고정" });
    await waitFor(() => expect(store.getSnapshot().state.charms).toHaveLength(STUDIO_CHARM_BAR_MAX_CHARMS));
    fireEvent.click(pin);
    expect(store.getSnapshot().state.charms).toHaveLength(STUDIO_CHARM_BAR_MAX_CHARMS);
    expect(pin.getAttribute("aria-pressed")).toBe("false");
    expect((await screen.findByRole("status")).textContent).toContain("가득 찼어요");
    expect(store.getSnapshot().state.open).toBe(false);
  });

  it("참 ID 로 쓸 수 없는 원본 ID 는 아무것도 그리지 않는다", () => {
    const { store } = makeStore();
    const { container } = render(<StudioCharmPinAction kind="element" rawId="한글 id" store={store} />);
    expect(container.textContent).toBe("");
  });
});
