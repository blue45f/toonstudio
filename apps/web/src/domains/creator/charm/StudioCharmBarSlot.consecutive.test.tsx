// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetStudioFloatingSurfaceStackForTest } from "../studio-floating-surface-stack";
import { setStudioWorkspaceArranging } from "../studio-workspace-arrangement";
import { createStudioCharmBarStore, type StudioCharmBarStore } from "./studio-charm-bar-store";
import { createFakeStudioHost, type FakeHostElement, type FakeStudioHost } from "./studio-charm-fake-host.test-fixture";
import { createStudioCharmId, normalizeStudioCharmBarState, type StudioCharmId } from "./studio-charm-model";
import { StudioCharmBarSlot } from "./StudioCharmBarSlot";

import { useI18n } from "@/shared/lib/i18n";

/**
 * 같은 칩을 연달아 눌러도 계단식으로 이어지는지 — 삽입 뒤에 선택이 바뀌는 가짜 호스트로 확인한다.
 *
 * 호스트의 `addEl` 은 새 요소를 곧바로 선택하므로, 두 번째 누름에서 세션의 `selected` 는 직전에 붙인 요소다.
 * 선택이 고정된 가짜 세션(`StudioCharmBarSlot.integration.test.tsx`)은 이 되먹임을 만들지 못해 같은 자리에 겹치는
 * 문제를 잡지 못했다.
 */

const FOCUS = createStudioCharmId("fx", "radial-focus");
const TEAR = createStudioCharmId("emoji", "1f4a7");
const SPEECH = createStudioCharmId("bubble", "speech");

const FRAME: FakeHostElement = { id: "frame-1", type: "frame", x: 100, y: 200, width: 400, height: 300 };
const OTHER_FRAME: FakeHostElement = { id: "frame-2", type: "frame", x: 100, y: 800, width: 400, height: 300 };
const PHOTO: FakeHostElement = { id: "img-1", type: "image", x: 50, y: 60, width: 200, height: 100 };

function newHost(selectedId: string | null): FakeStudioHost {
  return createFakeStudioHost({
    canvasWidth: 720,
    canvasHeight: 1280,
    elements: [FRAME, OTHER_FRAME, PHOTO],
    selectedId,
  });
}

async function openStore(charms: readonly StudioCharmId[]): Promise<StudioCharmBarStore> {
  const stored = normalizeStudioCharmBarState({ version: 1, charms, open: true, starterSettled: true });
  const store = createStudioCharmBarStore({
    acquire: async () => ({ loadCharmBar: async () => stored, saveCharmBar: async () => undefined }),
  });
  await store.hydrate();
  return store;
}

/** 호스트가 선택을 바꿀 때마다 다시 그리는 편집기 호스트 역할. */
function HostedSlot({ host, store }: { readonly host: FakeStudioHost; readonly store: StudioCharmBarStore }) {
  useSyncExternalStore(host.subscribe, host.revision, host.revision);
  return (
    <StudioCharmBarSlot
      session={{
        ...host.session(),
        isMobile: false,
        canvasOnlyMode: false,
        mobileImmersive: false,
        assets: [],
        assetsLoaded: true,
        assetsLoading: false,
      }}
      store={store}
    />
  );
}

async function renderHosted(host: FakeStudioHost, charms: readonly StudioCharmId[]): Promise<HTMLButtonElement[]> {
  render(<HostedSlot host={host} store={await openStore(charms)} />);
  return waitFor(async () => {
    const toolbar = await screen.findByRole("toolbar", { name: "고정한 참" });
    const found = within(toolbar).getAllByRole("button") as HTMLButtonElement[];
    expect(found).toHaveLength(charms.length);
    return found;
  }, { timeout: 10_000 });
}

/** 칩을 눌러 요소가 하나 늘 때까지 기다리고, 새로 생긴 요소를 돌려준다. */
async function stampAndWait(host: FakeStudioHost, chip: HTMLElement): Promise<FakeHostElement> {
  const before = host.elements().length;
  fireEvent.click(chip);
  await waitFor(() => expect(host.elements()).toHaveLength(before + 1));
  const created = host.elements().at(-1);
  if (!created) throw new Error("새 요소가 없습니다");
  return created;
}

/** 사용자가 캔버스에서 요소를 직접 고르는 일. 호스트가 다시 그리는 것까지 act 안에서 끝낸다. */
function userSelects(host: FakeStudioHost, id: string | null): void {
  act(() => { host.select(id); });
}

function inside(element: FakeHostElement, frame: FakeHostElement): boolean {
  const width = element.width ?? 0;
  const height = element.height ?? 0;
  return (
    element.x >= frame.x
    && element.y >= frame.y
    && element.x + width <= frame.x + (frame.width ?? 0)
    && element.y + height <= frame.y + (frame.height ?? 0)
  );
}

function distinctPositions(elements: readonly FakeHostElement[]): number {
  return new Set(elements.map((element) => `${element.x},${element.y}`)).size;
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

describe("참 바: 같은 칩을 연달아 눌러도 같은 컷 안에서 계단식으로 이어진다", () => {
  it("컷을 고른 채 효과 칩을 네 번 누르면 매번 컷 안에서 같은 크기로 비껴 놓인다", async () => {
    const host = newHost(FRAME.id);
    const [chip] = await renderHosted(host, [FOCUS]);
    const created: FakeHostElement[] = [];
    for (let count = 0; count < 4; count += 1) {
      created.push(await stampAndWait(host, chip));
      // 호스트의 addEl 처럼 새 요소가 선택돼 있다(되먹임이 실제로 일어나는지 확인).
      expect(host.selected()?.id).toBe(created[count].id);
    }
    for (const element of created) {
      expect(inside(element, FRAME), `${element.x},${element.y} ${element.width}×${element.height}`).toBe(true);
    }
    expect(new Set(created.map((element) => `${element.width}×${element.height}`))).toEqual(new Set(["276×276"]));
    expect(distinctPositions(created)).toBe(4);
  });

  it("컷을 고른 채 이모지 칩을 연달아 누르면 크기 없는 스티커가 선택돼도 컷을 떠나지 않는다", async () => {
    const host = newHost(FRAME.id);
    const [chip] = await renderHosted(host, [TEAR]);
    const created: FakeHostElement[] = [];
    for (let count = 0; count < 3; count += 1) {
      created.push(await stampAndWait(host, chip));
      expect(host.selected()?.type).toBe("sticker");
    }
    for (const element of created) {
      expect(inside({ ...element, width: 80, height: 80 }, FRAME), `${element.x},${element.y}`).toBe(true);
    }
    expect(distinctPositions(created)).toBe(3);
  });

  it("컷을 고른 채 말풍선 칩을 연달아 누르면 컷 안에서 겹치지 않는다", async () => {
    const host = newHost(FRAME.id);
    const [chip] = await renderHosted(host, [SPEECH]);
    const created: FakeHostElement[] = [];
    for (let count = 0; count < 3; count += 1) created.push(await stampAndWait(host, chip));
    for (const element of created) {
      expect(inside(element, FRAME), `${element.x},${element.y}`).toBe(true);
    }
    expect(distinctPositions(created)).toBe(3);
  });

  it("선택이 없을 때도 연달아 누르면 보이는 화면 중앙 근처에서 계단식으로 이어진다", async () => {
    const host = newHost(null);
    const [chip] = await renderHosted(host, [FOCUS]);
    const created: FakeHostElement[] = [];
    for (let count = 0; count < 3; count += 1) created.push(await stampAndWait(host, chip));
    // 모두 같은 크기이고(문서 중앙 기준 계획) 서로 다른 자리다.
    expect(new Set(created.map((element) => `${element.width}×${element.height}`)).size).toBe(1);
    expect(distinctPositions(created)).toBe(3);
  });

  it("종류가 섞여도 같은 컷 안에서 이어진다(효과 → 이모지 → 효과)", async () => {
    const host = newHost(FRAME.id);
    const chips = await renderHosted(host, [FOCUS, TEAR]);
    const first = await stampAndWait(host, chips[0]);
    const second = await stampAndWait(host, chips[1]);
    const third = await stampAndWait(host, chips[0]);
    expect(inside(first, FRAME)).toBe(true);
    expect(inside({ ...second, width: 80, height: 80 }, FRAME)).toBe(true);
    expect(inside(third, FRAME)).toBe(true);
  });
});

describe("참 바: 사용자가 직접 고른 선택은 이어 받기보다 앞선다", () => {
  it("붙인 뒤 다른 컷을 직접 고르면 그 컷 중앙에서 새로 시작한다", async () => {
    const host = newHost(FRAME.id);
    const [chip] = await renderHosted(host, [FOCUS]);
    await stampAndWait(host, chip);
    userSelects(host, OTHER_FRAME.id);
    const next = await stampAndWait(host, chip);
    expect(inside(next, OTHER_FRAME)).toBe(true);
    expect(next.x + (next.width ?? 0) / 2).toBe(300);
    expect(next.y + (next.height ?? 0) / 2).toBe(950);
  });

  it("붙인 뒤 문서에 원래 있던 요소를 직접 고르면 그 요소의 중앙에 붙인다", async () => {
    const host = newHost(FRAME.id);
    const [chip] = await renderHosted(host, [TEAR]);
    await stampAndWait(host, chip);
    userSelects(host, PHOTO.id);
    const next = await stampAndWait(host, chip);
    expect(next.x + 40).toBe(150);
    expect(next.y + 40).toBe(110);
  });

  it("붙인 뒤 다른 페이지로 옮겨 그 페이지의 컷을 고르면 이전 페이지의 대상을 이어 받지 않는다", async () => {
    const host = newHost(FRAME.id);
    const [chip] = await renderHosted(host, [FOCUS]);
    await stampAndWait(host, chip);
    // 페이지 2: 요소 ID 가 전혀 다른 문서. 새로 선택한 컷은 "방금 붙인 요소"가 아니다.
    const pageTwoFrame: FakeHostElement = { id: "p2-frame", type: "frame", x: 100, y: 800, width: 400, height: 300 };
    act(() => { host.replaceDocument([pageTwoFrame], pageTwoFrame.id); });
    const next = await stampAndWait(host, chip);
    expect(inside(next, pageTwoFrame)).toBe(true);
    expect(next.y).toBeGreaterThanOrEqual(800);
  });

  it("붙인 뒤 선택을 풀면 보이는 화면(문서) 중앙으로 간다", async () => {
    const host = newHost(FRAME.id);
    const [chip] = await renderHosted(host, [TEAR]);
    await stampAndWait(host, chip);
    userSelects(host, null);
    const next = await stampAndWait(host, chip);
    expect(next.x + 40).toBe(360);
    expect(next.y + 40).toBe(640);
  });
});
