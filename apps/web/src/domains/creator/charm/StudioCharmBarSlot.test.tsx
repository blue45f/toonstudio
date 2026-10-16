// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STUDIO_CANVAS_WIDTH } from "../canvas/studio-canvas-constants";
import { resetStudioFloatingSurfaceStackForTest } from "../studio-floating-surface-stack";
import { setStudioWorkspaceArranging } from "../studio-workspace-arrangement";
import { createStudioCharmBarStore, type StudioCharmBarStore } from "./studio-charm-bar-store";
import { normalizeStudioCharmBarState } from "./studio-charm-model";
import { StudioCharmBarSlot, type StudioCharmSlotSession } from "./StudioCharmBarSlot";

import type { ComponentType } from "react";
import type { StudioCharmHostCommands } from "./studio-charm-insert";
import type { StudioCharmBarProps } from "./StudioCharmBar";

import { useI18n } from "@/shared/lib/i18n";

const COMMANDS: StudioCharmHostCommands = {
  addRenderedImage: vi.fn(() => true),
  addSticker: vi.fn(),
  addBubble: vi.fn(),
  addBuiltinRasterAsset: vi.fn(async () => true as boolean | void),
  addSfxPreset: vi.fn(async () => undefined),
  openStudioObjectInsert: vi.fn(),
};

let latestProps: StudioCharmBarProps | null = null;

function FakeBar(props: StudioCharmBarProps) {
  // 렌더 중에는 바깥 변수를 바꾸지 않는다: 커밋 뒤(효과)에 마지막으로 받은 값을 기록한다.
  useEffect(() => {
    latestProps = props;
  });
  return <div data-testid="fake-charm-bar">참 바 본체</div>;
}

const loadFakeBar = () => Promise.resolve({ StudioCharmBar: FakeBar as ComponentType<StudioCharmBarProps> });

function session(overrides: Partial<StudioCharmSlotSession> = {}): StudioCharmSlotSession {
  return {
    studioToolBeltContentHandlers: COMMANDS,
    selected: null,
    canvasH: 1280,
    canvasFlipH: false,
    canvasRotation: 0,
    snapEnabled: false,
    gridSize: 40,
    effScale: 1,
    isMobile: false,
    canvasOnlyMode: false,
    mobileImmersive: false,
    ...overrides,
  };
}

async function openStore(open = true): Promise<StudioCharmBarStore> {
  const stored = normalizeStudioCharmBarState({ version: 1, charms: [], open, starterSettled: true });
  const store = createStudioCharmBarStore({
    acquire: async () => ({
      loadCharmBar: async () => stored,
      saveCharmBar: async () => undefined,
    }),
  });
  await store.hydrate();
  return store;
}

function region(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-studio-workspace-region="charm-bar"]');
}

beforeEach(() => {
  useI18n.getState().setLang("ko");
  latestProps = null;
  sessionStorage.clear();
  setStudioWorkspaceArranging(false);
});

afterEach(() => {
  cleanup();
  resetStudioFloatingSurfaceStackForTest();
  setStudioWorkspaceArranging(false);
});

describe("참 바 슬롯: 꺼짐과 숨김", () => {
  it("꺼져 있으면 아무것도 그리지 않고 본체도 불러오지 않는다", async () => {
    const store = await openStore(false);
    const loadBar = vi.fn(loadFakeBar);
    render(<StudioCharmBarSlot session={session()} store={store} loadBar={loadBar} />);
    expect(region()).toBeNull();
    expect(loadBar).not.toHaveBeenCalled();
  });

  it("마운트할 때 저장된 상태를 읽어 켜져 있었다면 바로 다시 연다", async () => {
    const stored = normalizeStudioCharmBarState({ version: 1, charms: [], open: true, starterSettled: true });
    const store = createStudioCharmBarStore({
      acquire: async () => ({ loadCharmBar: async () => stored, saveCharmBar: async () => undefined }),
    });
    render(<StudioCharmBarSlot session={session()} store={store} loadBar={loadFakeBar} />);
    expect(region()).toBeNull();
    await waitFor(() => expect(region()).not.toBeNull());
    expect(await screen.findByTestId("fake-charm-bar")).toBeTruthy();
  });

  it.each([
    ["canvasOnlyMode", { canvasOnlyMode: true }],
    ["mobileImmersive", { mobileImmersive: true }],
    ["presentationPanelsHidden", { presentationPanelsHidden: true }],
  ] as const)("%s 에서는 숨기고, 풀리면 켜 둔 상태 그대로 돌아온다", async (_name, overrides) => {
    const store = await openStore();
    const view = render(<StudioCharmBarSlot session={session(overrides)} store={store} loadBar={loadFakeBar} />);
    expect(region()).toBeNull();
    view.rerender(<StudioCharmBarSlot session={session()} store={store} loadBar={loadFakeBar} />);
    expect(region()).not.toBeNull();
    expect(store.getSnapshot().state.open).toBe(true);
  });
});

describe("참 바 슬롯: 지연 로드와 도킹 영역", () => {
  it("본체를 기다리는 동안 상태 안내(자리표시)를 보이고, 오면 본체로 바꾼다", async () => {
    const store = await openStore();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const loadBar = vi.fn(async () => {
      await gate;
      return loadFakeBar();
    });
    render(<StudioCharmBarSlot session={session()} store={store} loadBar={loadBar} />);
    const loading = document.querySelector("[data-studio-charm-bar-loading]");
    expect(loading?.getAttribute("role")).toBe("status");
    expect(loading?.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("참 바를 여는 중…")).toBeTruthy();
    expect(screen.queryByTestId("fake-charm-bar")).toBeNull();
    await act(async () => { release(); });
    expect(await screen.findByTestId("fake-charm-bar")).toBeTruthy();
    expect(document.querySelector("[data-studio-charm-bar-loading]")).toBeNull();
    expect(loadBar).toHaveBeenCalledTimes(1);
  });

  it("본체를 불러오지 못하면 편집기는 두고 그 자리에서 오류와 다시 불러오기를 보인다", async () => {
    const store = await openStore();
    const loadBar = vi.fn()
      .mockRejectedValueOnce(new Error("chunk 404"))
      .mockImplementation(loadFakeBar);
    render(<StudioCharmBarSlot session={session()} store={store} loadBar={loadBar} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("참 바를 불러오지 못했어요");
    expect(alert.textContent).toContain("원고와 도구 구성은 그대로예요");
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(await screen.findByTestId("fake-charm-bar")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(loadBar).toHaveBeenCalledTimes(2);
  });

  it("도구 레일처럼 작업 배치 영역(charm-bar)에 놓여 배치 편집으로 옮길 수 있다", async () => {
    const store = await openStore();
    render(<StudioCharmBarSlot session={session()} store={store} loadBar={loadFakeBar} />);
    await screen.findByTestId("fake-charm-bar");
    expect(region()?.dataset.studioRegionFloating).toBe("false");
    act(() => setStudioWorkspaceArranging(true));
    expect(await screen.findByRole("button", { name: "참 바 이동" })).toBeTruthy();
  });

  it("모바일에서는 배치 영역이 비활성이라 래퍼 없이 작업공간에 그대로 놓인다", async () => {
    const store = await openStore();
    render(<StudioCharmBarSlot session={session({ isMobile: true })} store={store} loadBar={loadFakeBar} />);
    await screen.findByTestId("fake-charm-bar");
    expect(region()?.style.display).toBe("contents");
    act(() => setStudioWorkspaceArranging(true));
    expect(screen.queryByRole("button", { name: "참 바 이동" })).toBeNull();
  });
});

describe("참 바 슬롯: 본체에 넘기는 값", () => {
  it("호스트의 안정 핸들러·문서 크기·내 소재 읽기 상태·즐겨찾기를 그대로 넘긴다", async () => {
    const store = await openStore();
    const assets = [{ id: "a1", name: "내 손", dataUrl: "data:image/png;base64,AAAA", width: 10, height: 10 }];
    const view = render(
      <StudioCharmBarSlot
        session={session({ assets, assetsLoaded: false, assetsLoading: true, assetFavoriteState: { ids: ["local:a1"] } })}
        store={store}
        loadBar={loadFakeBar}
      />,
    );
    await screen.findByTestId("fake-charm-bar");
    expect(latestProps?.commands).toBe(COMMANDS);
    expect(latestProps?.canvas).toEqual({ width: STUDIO_CANVAS_WIDTH, height: 1280 });
    // 호스트는 "내 에셋" 메뉴를 열어야 목록을 읽는다: 읽기 전/중/후를 그대로 전달해 본체가 판단하게 한다.
    expect(latestProps?.hostLibrary).toEqual({ assets, loaded: false, loading: true });
    expect(latestProps?.hostLibrary.assets).toBe(assets);
    expect(latestProps?.assetFavoriteIds).toEqual(["local:a1"]);
    expect(latestProps?.lock).toBeNull();
    view.rerender(
      <StudioCharmBarSlot
        session={session({ assets, assetsLoaded: true, assetsLoading: false })}
        store={store}
        loadBar={loadFakeBar}
      />,
    );
    expect(latestProps?.hostLibrary).toEqual({ assets, loaded: true, loading: false });
    expect(latestProps?.assetFavoriteIds).toEqual([]);
  });

  it("호스트가 읽기 상태를 알리지 않은 처음에는 '읽지 않음'으로 넘긴다(비어 있다고 준비된 것이 아니다)", async () => {
    const store = await openStore();
    render(<StudioCharmBarSlot session={session()} store={store} loadBar={loadFakeBar} />);
    await screen.findByTestId("fake-charm-bar");
    expect(latestProps?.hostLibrary).toEqual({ assets: [], loaded: false, loading: false });
  });

  it("호스트가 다시 그려도 내용이 같으면 본체에 같은 참조를 넘긴다(불필요한 다시 그리기 방지)", async () => {
    const store = await openStore();
    const assets = [{ id: "a1", name: "내 손", dataUrl: "data:image/png;base64,AAAA", width: 10, height: 10 }];
    const view = render(
      <StudioCharmBarSlot session={session({ assets, pageEditLocked: true })} store={store} loadBar={loadFakeBar} />,
    );
    await screen.findByTestId("fake-charm-bar");
    const first = latestProps;
    view.rerender(
      <StudioCharmBarSlot session={session({ assets, pageEditLocked: true })} store={store} loadBar={loadFakeBar} />,
    );
    expect(latestProps?.canvas).toBe(first?.canvas);
    expect(latestProps?.hostLibrary).toBe(first?.hostLibrary);
    expect(latestProps?.lock).toBe(first?.lock);
    expect(latestProps?.lock).toEqual({ kind: "page", message: null });
  });

  it("편집 잠금은 사유와 함께 넘긴다", async () => {
    const store = await openStore();
    const view = render(
      <StudioCharmBarSlot session={session({ pageEditLocked: true })} store={store} loadBar={loadFakeBar} />,
    );
    await screen.findByTestId("fake-charm-bar");
    expect(latestProps?.lock).toEqual({ kind: "page", message: null });
    view.rerender(
      <StudioCharmBarSlot
        session={session({ collaborationDocumentLocked: true, collaborationLockMessage: "공동 편집 중" })}
        store={store}
        loadBar={loadFakeBar}
      />,
    );
    expect(latestProps?.lock).toEqual({ kind: "collaboration", message: "공동 편집 중" });
  });

  it("문맥 읽기는 렌더 때가 아니라 부르는 순간의 세션을 본다", async () => {
    const store = await openStore();
    const first = { id: "f1", type: "frame", x: 0, y: 0, width: 300, height: 300 };
    const view = render(<StudioCharmBarSlot session={session({ selected: first })} store={store} loadBar={loadFakeBar} />);
    await screen.findByTestId("fake-charm-bar");
    const readContext = latestProps?.readContext;
    expect(readContext).toBeTypeOf("function");
    expect(readContext?.().selection).toBe(first);
    const second = { id: "f2", type: "frame", x: 40, y: 40, width: 200, height: 200 };
    view.rerender(
      <StudioCharmBarSlot
        session={session({ selected: second, snapEnabled: true, effScale: 0.5 })}
        store={store}
        loadBar={loadFakeBar}
      />,
    );
    const context = readContext?.();
    expect(context?.selection).toBe(second);
    expect(context?.snap).toEqual({ enabled: true, gridSize: 40, viewportScale: 0.5 });
    expect(context?.documentWidth).toBe(STUDIO_CANVAS_WIDTH);
  });
});
