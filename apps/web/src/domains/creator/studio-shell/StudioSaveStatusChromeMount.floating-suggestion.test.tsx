// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StudioSaveStatusChromeMount } from "../StudioSaveStatusChromeMount";
import { createStudioSaveSyncSignalStore } from "../studio-save-sync-signals";

import { useI18n } from "@/shared/lib/i18n";

const SUGGESTION = '[data-studio-first-publish-suggestion="true"]';
const ANCHOR = '[data-studio-first-publish-suggestion-anchor="true"]';

function mountMenubar(): { menubar: HTMLElement; slot: HTMLElement } {
  const menubar = document.createElement("div");
  menubar.setAttribute("data-studio-app-menubar", "true");
  const lane = document.createElement("div");
  lane.setAttribute("data-studio-app-menubar-scroll", "true");
  const slot = document.createElement("div");
  slot.id = "studio-document-chrome-slot";
  lane.append(slot);
  menubar.append(lane);
  document.body.append(menubar);
  return { menubar, slot };
}

function savedStore() {
  const store = createStudioSaveSyncSignalStore();
  store.reset("document-1");
  store.noteDurableReceipt({ savedAtMs: Date.now(), authority: "opfs-journal", sequence: 1, revision: 1, generation: 1 });
  return store;
}

const suggestionProps = { scope: "document-1", cutCount: 0, onCheckPublishReady: () => undefined };

beforeEach(() => {
  useI18n.getState().setLang("ko");
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  window.localStorage.clear();
});

describe("StudioSaveStatusChromeMount: 게시 제안 카드는 메뉴바 흐름 밖에 뜬다", () => {
  it("첫 저장이 끝나면 카드가 슬롯이 아니라 메뉴바 요소에 절대 위치로 붙고 저장 상태 문구는 한 번만 표시한다", async () => {
    const { menubar, slot } = mountMenubar();
    await act(async () => {
      render(<StudioSaveStatusChromeMount store={savedStore()} publishSuggestion={suggestionProps} />);
    });

    const suggestion = document.querySelector<HTMLElement>(SUGGESTION);
    expect(suggestion, "첫 저장 뒤 제안 카드").not.toBeNull();
    expect(suggestion!.closest('[data-studio-app-menubar="true"]')).toBe(menubar);
    expect(suggestion!.closest("#studio-document-chrome-slot")).toBeNull();
    expect(suggestion!.closest('[data-studio-app-menubar-scroll="true"]')).toBeNull();

    const anchor = suggestion!.closest<HTMLElement>(ANCHOR);
    expect(anchor).not.toBeNull();
    expect(anchor!.parentElement).toBe(menubar);
    expect(anchor!.classList.contains("absolute")).toBe(true);
    expect(anchor!.classList.contains("top-full")).toBe(true);
    expect(anchor!.classList.contains("pointer-events-none")).toBe(true);

    const mount = slot.querySelector('[data-studio-save-status-chrome-mount="true"]');
    expect(mount).not.toBeNull();
    // 상단 크롬 슬롯 안에서 "이 기기에 저장됨" 시각 문구가 중복 노출되지 않고 알약 버튼 하나로 표시된다.
    const matches = (mount?.textContent ?? "").match(/이 기기에 저장됨/gu) ?? [];
    expect(matches).toHaveLength(1);
    expect(mount?.querySelector('[role="status"]')).not.toBeNull();
  });

  it("첫 저장 전에는 카드가 없고, 저장 신호가 오면 나타난다", async () => {
    mountMenubar();
    const store = createStudioSaveSyncSignalStore();
    store.reset("document-1");
    await act(async () => {
      render(<StudioSaveStatusChromeMount store={store} publishSuggestion={suggestionProps} />);
    });
    expect(document.querySelector(SUGGESTION)).toBeNull();

    await act(async () => {
      store.noteDurableReceipt({ savedAtMs: Date.now(), authority: "opfs-journal", sequence: 1, revision: 1, generation: 1 });
    });
    expect(document.querySelector(SUGGESTION)).not.toBeNull();
  });

  it("제안을 넘기지 않으면 카드도 자리도 만들지 않는다", async () => {
    mountMenubar();
    await act(async () => {
      render(<StudioSaveStatusChromeMount store={savedStore()} />);
    });
    expect(document.querySelector(SUGGESTION)).toBeNull();
    expect(document.querySelector(ANCHOR)).toBeNull();
  });

  it("메뉴바도 슬롯도 없으면 카드를 자리 요소 없이 제자리에 그린다", async () => {
    await act(async () => {
      render(<StudioSaveStatusChromeMount store={savedStore()} publishSuggestion={suggestionProps} />);
    });
    expect(document.querySelector(SUGGESTION), "첫 저장 뒤 제안 카드").not.toBeNull();
    expect(document.querySelector(ANCHOR)).toBeNull();
  });

  it("슬롯만 있고 메뉴바가 없으면 저장 상태는 슬롯에 들어가고 카드는 슬롯 밖 제자리에 그려진다", async () => {
    const slot = document.createElement("div");
    slot.id = "studio-document-chrome-slot";
    document.body.append(slot);
    await act(async () => {
      render(<StudioSaveStatusChromeMount store={savedStore()} publishSuggestion={suggestionProps} />);
    });
    expect(slot.querySelector('[data-studio-save-status-chrome-mount="true"]')).not.toBeNull();
    expect(document.querySelector(SUGGESTION)).not.toBeNull();
    expect(slot.querySelector(SUGGESTION)).toBeNull();
    expect(document.querySelector(ANCHOR)).toBeNull();
  });

  it("마운트가 사라지면 메뉴바에 붙였던 카드 자리도 함께 없어진다", async () => {
    const { menubar } = mountMenubar();
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(<StudioSaveStatusChromeMount store={savedStore()} publishSuggestion={suggestionProps} />);
    });
    expect(menubar.querySelector(ANCHOR)).not.toBeNull();
    await act(async () => {
      view.unmount();
    });
    expect(menubar.querySelector(ANCHOR)).toBeNull();
    expect(document.querySelector(SUGGESTION)).toBeNull();
  });
});


describe("drawing header receipt presentation", () => {
  it("uses one local receipt result and preserves its live announcer in the document title slot", async () => {
    const { menubar, slot } = mountMenubar();
    menubar.dataset.studioDrawingClarityHeader = "true";
    const store = createStudioSaveSyncSignalStore();
    store.reset("drawing"); store.noteDurability("available"); store.noteOnline(true);
    const savedAtMs = Date.parse("2026-11-12T08:35:20.156Z");
    store.noteDurableReceipt({ savedAtMs, authority: "opfs-journal", sequence: 1, revision: 1, generation: 1 });
    await act(async () => { render(<StudioSaveStatusChromeMount store={store} />); });
    const mount = slot.querySelector('[data-studio-save-presentation="drawing"]');
    expect(mount).not.toBeNull();
    expect(mount?.querySelectorAll('button[data-studio-drawing-save-summary="true"]')).toHaveLength(1);
    expect(mount?.querySelector('[data-studio-clarity-receipt] time')?.getAttribute("datetime")).toBe("2026-11-12T08:35:20.156Z");
    expect(mount?.querySelector('[role="status"]')).not.toBeNull();
    expect(mount?.textContent).not.toMatch(/서버 연결 안 됨 ·/u);
    expect(document.querySelectorAll('[data-studio-drawing-save-details="true"]')).toHaveLength(1);
  });
});


describe("drawing modal save announcements", () => {
  it("keeps the existing single local-save live region inside the active native screen and returns it on close", async () => {
    const { menubar, slot } = mountMenubar(); menubar.dataset.studioDrawingClarityHeader = "true";
    const store = createStudioSaveSyncSignalStore(); store.reset("drawing-live"); store.noteDurability("available"); store.noteOnline(true);
    store.noteDurableReceipt({ savedAtMs: 1_700_000_000_000, authority: "opfs-journal", sequence: 1, revision: 1, generation: 1 });
    await act(async () => { render(<StudioSaveStatusChromeMount store={store} />); });
    const dialog = document.querySelector<HTMLDialogElement>('[data-studio-drawing-save-dialog="true"]')!;
    dialog.showModal = () => dialog.setAttribute("open", "");
    dialog.close = () => { dialog.removeAttribute("open"); dialog.dispatchEvent(new Event("close")); };
    const trigger = slot.querySelector<HTMLButtonElement>('button[data-studio-drawing-save-summary="true"]')!;
    fireEvent.click(trigger);
    const detailHost = dialog.querySelector('[data-studio-connection-notice-details="true"]')!;
    expect(detailHost.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(slot.querySelector('[role="status"]')).toBeNull();
    await act(async () => { store.noteEditGeneration(2); });
    await act(async () => { store.noteDurableReceipt({ savedAtMs: 1_700_000_060_000, authority: "opfs-journal", sequence: 2, revision: 2, generation: 2 }); });
    expect(detailHost.querySelector('[role="status"]')?.textContent).toMatch(/모든 변경이 이 기기에 저장|All changes saved on this device/u);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(detailHost.querySelector('[role="status"]')).toBeNull();
    expect(slot.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(document.activeElement).toBe(trigger);
  });
});
