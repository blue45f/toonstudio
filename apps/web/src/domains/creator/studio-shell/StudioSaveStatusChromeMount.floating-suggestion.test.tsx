// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StudioSaveStatusChromeMount } from "../StudioSaveStatusChromeMount";
import { createStudioSaveSyncSignalStore } from "../studio-save-sync-signals";

import { useI18n } from "@/shared/lib/i18n";

// 첫 저장 뒤 뜨는 게시 제안 카드가 메뉴바 높이를 키우지 않는지 본다. 카드가 슬롯 안에 흐름으로 들어가면 첫 저장이
// 끝나는 순간 메뉴바가 카드 높이만큼 커져 캔버스가 아래로 밀린다(브러시 설문 검증이 획 도중 150px 어긋남으로 잡았다).

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
  it("첫 저장이 끝나면 카드가 슬롯이 아니라 메뉴바 요소에 절대 위치로 붙는다", async () => {
    const { menubar, slot } = mountMenubar();
    await act(async () => {
      render(<StudioSaveStatusChromeMount store={savedStore()} publishSuggestion={suggestionProps} />);
    });

    const suggestion = document.querySelector<HTMLElement>(SUGGESTION);
    expect(suggestion, "첫 저장 뒤 제안 카드").not.toBeNull();
    expect(suggestion!.closest('[data-studio-app-menubar="true"]')).toBe(menubar);
    // 슬롯(메뉴바 가로 줄 안)에 들어가면 줄 높이를 키우고, 데스크톱의 overflow-hidden 줄에서는 잘린다.
    expect(suggestion!.closest("#studio-document-chrome-slot")).toBeNull();
    expect(suggestion!.closest('[data-studio-app-menubar-scroll="true"]')).toBeNull();

    const anchor = suggestion!.closest<HTMLElement>(ANCHOR);
    expect(anchor).not.toBeNull();
    expect(anchor!.parentElement).toBe(menubar);
    expect(anchor!.classList.contains("absolute")).toBe(true);
    expect(anchor!.classList.contains("top-full")).toBe(true);
    // 카드 바깥 여백이 아래 캔버스의 포인터를 가로채지 않는다(카드 자체만 pointer-events-auto).
    expect(anchor!.classList.contains("pointer-events-none")).toBe(true);

    // 저장 상태 표시는 그대로 슬롯에 있다.
    expect(slot.querySelector('[data-studio-save-status-chrome-mount="true"]')).not.toBeNull();
  });

  it("첫 저장 전에는 카드가 없고, 저장 신호가 오면 나타난다", async () => {
    mountMenubar();
    const store = createStudioSaveSyncSignalStore();
    store.reset("document-1");
    await act(async () => {
      render(<StudioSaveStatusChromeMount store={store} publishSuggestion={suggestionProps} />);
    });
    // 카드 자체가 보일 조건은 카드가 판정한다. 아직 아니면 보이는 것이 없다(자리 요소는 크기 없는 절대 위치라 흐름에 영향이 없다).
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
