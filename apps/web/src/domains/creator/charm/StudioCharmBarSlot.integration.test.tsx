// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetStudioFloatingSurfaceStackForTest } from "../studio-floating-surface-stack";
import { setStudioWorkspaceArranging } from "../studio-workspace-arrangement";
import { createStudioCharmBarStore, type StudioCharmBarStore } from "./studio-charm-bar-store";
import { createStudioCharmId, normalizeStudioCharmBarState } from "./studio-charm-model";
import { StudioCharmBarSlot, type StudioCharmSlotSession } from "./StudioCharmBarSlot";

import type { StudioCharmHostCommands } from "./studio-charm-insert";

import { useI18n } from "@/shared/lib/i18n";

/**
 * 슬롯 → 실제 본체(가짜 아님) → 위치 계획 → 호스트 명령까지의 연결을 한 번에 확인한다.
 * 거대한 편집기 호스트만 마운트하지 않고, 호스트가 세션 백으로 넘기는 값과 삽입 명령을 대신 준다.
 */

const FOCUS = createStudioCharmId("fx", "radial-focus");
const TEAR = createStudioCharmId("emoji", "1f4a7");
const SPEECH = createStudioCharmId("bubble", "speech");

function commandSpies() {
  const spies = {
    addRenderedImage: vi.fn(() => true),
    addSticker: vi.fn(),
    addBubble: vi.fn(),
    addBuiltinRasterAsset: vi.fn(async () => true as boolean | void),
    addSfxPreset: vi.fn(async () => undefined),
    openStudioObjectInsert: vi.fn(),
  };
  const commands: StudioCharmHostCommands = spies;
  return { spies, commands };
}

function sessionWith(commands: StudioCharmHostCommands, overrides: Partial<StudioCharmSlotSession> = {}): StudioCharmSlotSession {
  return {
    studioToolBeltContentHandlers: commands,
    selected: { id: "frame-1", type: "frame", x: 100, y: 200, width: 400, height: 300 },
    canvasH: 1280,
    canvasFlipH: false,
    canvasRotation: 0,
    snapEnabled: false,
    gridSize: 40,
    effScale: 1,
    isMobile: false,
    canvasOnlyMode: false,
    mobileImmersive: false,
    assets: [],
    assetsLoaded: true,
    assetsLoading: false,
    ...overrides,
  };
}

async function openStore(charms = [FOCUS, TEAR, SPEECH]): Promise<StudioCharmBarStore> {
  const stored = normalizeStudioCharmBarState({ version: 1, charms, open: true, starterSettled: true });
  const store = createStudioCharmBarStore({
    acquire: async () => ({ loadCharmBar: async () => stored, saveCharmBar: async () => undefined }),
  });
  await store.hydrate();
  return store;
}

async function chips(): Promise<HTMLButtonElement[]> {
  const toolbar = await screen.findByRole("toolbar", { name: "고정한 참" });
  return within(toolbar).getAllByRole("button") as HTMLButtonElement[];
}

/**
 * 눌러 쓸 수 있는 칩이 `count`개가 될 때까지 기다린다. 효과 SVG 모듈은 처음 불러올 때 오래 걸릴 수 있어
 * (콜드 스타트) 기본 대기보다 넉넉히 둔다. 불러오는 동안 효과 칩은 자리표시라 버튼 수에 들지 않는다.
 */
function readyChips(count: number): Promise<HTMLButtonElement[]> {
  return waitFor(async () => {
    const found = await chips();
    expect(found).toHaveLength(count);
    return found;
  }, { timeout: 10_000 });
}

beforeEach(() => {
  useI18n.getState().setLang("ko");
  sessionStorage.clear();
  setStudioWorkspaceArranging(false);
});

afterEach(() => {
  cleanup();
  resetStudioFloatingSurfaceStackForTest();
  setStudioWorkspaceArranging(false);
});

describe("참 바 슬롯 + 본체: 세션에서 호스트 명령까지", () => {
  it("선택한 컷의 중앙에 호스트 삽입 명령을 한 번씩만 부른다", async () => {
    const { spies, commands } = commandSpies();
    render(<StudioCharmBarSlot session={sessionWith(commands)} store={await openStore()} />);
    const list = await readyChips(3);
    expect(list.map((chip) => chip.getAttribute("aria-label"))).toEqual(["집중선", "눈물·물방울", "말풍선 · 말하기"]);
    fireEvent.click(list[0]);
    await waitFor(() => expect(spies.addRenderedImage).toHaveBeenCalledTimes(1));
    const call = spies.addRenderedImage.mock.calls[0] as unknown as readonly unknown[];
    expect(call.slice(1, 6)).toEqual([480, 480, undefined, false, { name: "집중선" }]);
    expect(call[6]).toMatchObject({ anchor: { x: 300, y: 350 }, bounds: { x: 100, y: 200, width: 400, height: 300 } });
    expect(spies.addSticker).not.toHaveBeenCalled();
    expect(spies.addBubble).not.toHaveBeenCalled();
  });

  it("같은 컷에 이어 붙이면 계단식으로 비껴 놓이고, 이모지·말풍선은 각자의 명령으로 간다", async () => {
    const { spies, commands } = commandSpies();
    render(<StudioCharmBarSlot session={sessionWith(commands)} store={await openStore()} />);
    const list = await readyChips(3);
    fireEvent.click(list[1]);
    await waitFor(() => expect(spies.addSticker).toHaveBeenCalledTimes(1));
    expect(spies.addSticker).toHaveBeenLastCalledWith("💧", { x: 300, y: 350 });
    fireEvent.click(list[2]);
    await waitFor(() => expect(spies.addBubble).toHaveBeenCalledTimes(1));
    const [variant, point, editImmediately] = spies.addBubble.mock.calls[0] as unknown as readonly [string, { x: number; y: number }, boolean];
    expect(variant).toBe("speech");
    expect(editImmediately).toBe(false);
    // 첫 삽입 직후 같은 컷이라 완전히 겹치지 않는다.
    expect(point.x === 300 && point.y === 350).toBe(false);
  });

  it("컷이 아닌 요소를 고르면 그 요소의 중앙에, 선택이 없으면 보이는 화면 중앙(문서 중앙)에 놓는다", async () => {
    const first = commandSpies();
    const view = render(
      <StudioCharmBarSlot
        session={sessionWith(first.commands, { selected: { id: "img-1", type: "image", x: 50, y: 60, width: 200, height: 100 } })}
        store={await openStore([TEAR])}
      />,
    );
    fireEvent.click((await readyChips(1))[0]);
    await waitFor(() => expect(first.spies.addSticker).toHaveBeenCalledWith("💧", { x: 150, y: 110 }));
    view.unmount();

    const second = commandSpies();
    render(<StudioCharmBarSlot session={sessionWith(second.commands, { selected: null })} store={await openStore([TEAR])} />);
    fireEvent.click((await readyChips(1))[0]);
    await waitFor(() => expect(second.spies.addSticker).toHaveBeenCalledTimes(1));
    // 보이는 화면을 측정할 수 없는 환경에서는 문서 중앙이다.
    expect(second.spies.addSticker).toHaveBeenCalledWith("💧", { x: 360, y: 640 });
  });

  it("격자 스냅이 켜져 있으면 세션의 격자 크기·배율로 모서리를 맞춘다", async () => {
    const { spies, commands } = commandSpies();
    render(
      <StudioCharmBarSlot
        session={sessionWith(commands, {
          selected: { id: "frame-1", type: "frame", x: 203, y: 203, width: 400, height: 300 },
          snapEnabled: true,
          gridSize: 40,
          effScale: 1,
        })}
        store={await openStore([TEAR])}
      />,
    );
    fireEvent.click((await readyChips(1))[0]);
    // 스티커 80×80 의 왼쪽 위 모서리(363)가 격자(360)에 끌려 중심이 403 → 400 이 된다.
    await waitFor(() => expect(spies.addSticker).toHaveBeenCalledWith("💧", { x: 400, y: 353 }));
  });

  it("편집 잠금이면 칩이 aria-disabled 이고 눌러도 호스트 명령을 부르지 않으며 이유를 알린다", async () => {
    const { spies, commands } = commandSpies();
    render(<StudioCharmBarSlot session={sessionWith(commands, { pageEditLocked: true })} store={await openStore([FOCUS])} />);
    const [chip] = await readyChips(1);
    expect(chip.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(chip);
    await waitFor(() => expect(document.querySelector("[data-studio-charm-announcement]")?.textContent).toContain("편집이 잠겨"));
    expect(spies.addRenderedImage).not.toHaveBeenCalled();
  });

  it("바를 끄면 그리지 않고, 다시 켜면 같은 목록으로 돌아온다", async () => {
    const { commands } = commandSpies();
    const store = await openStore([FOCUS]);
    render(<StudioCharmBarSlot session={sessionWith(commands)} store={store} />);
    await readyChips(1);
    store.dispatch({ type: "set-open", open: false });
    await waitFor(() => expect(document.querySelector("[data-studio-charm-bar]")).toBeNull());
    store.dispatch({ type: "set-open", open: true });
    await readyChips(1);
  });
});
