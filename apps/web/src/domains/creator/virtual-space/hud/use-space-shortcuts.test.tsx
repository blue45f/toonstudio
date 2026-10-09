// @vitest-environment jsdom
import { cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { StudioSpaceEmoteId } from "../studio-virtual-space-emote-catalog";
import { STUDIO_EMOTE_KEYMAP_STORAGE_KEY, StudioEmoteKeymapStore } from "../studio-virtual-space-emote-keymap";
import { spaceShortcutIgnored, useSpaceShortcuts } from "./use-space-shortcuts";

afterEach(cleanup);

function handlers(escapeResult = true) {
  return {
    onEmote: vi.fn<(id: StudioSpaceEmoteId) => void>(),
    onToggleMap: vi.fn<() => void>(),
    onTogglePeople: vi.fn<() => void>(),
    onHelp: vi.fn<() => void>(),
    onEscape: vi.fn<() => boolean>(() => escapeResult),
  };
}

describe("useSpaceShortcuts", () => {
  it("1~9·Z는 카탈로그 이모트, M·P·?는 지도·참가자·도움말을 연다", () => {
    const value = handlers();
    renderHook(() => useSpaceShortcuts(value));
    fireEvent.keyDown(window, { key: "1" });
    fireEvent.keyDown(window, { key: "9" });
    fireEvent.keyDown(window, { key: "Z" });
    fireEvent.keyDown(window, { key: "m" });
    fireEvent.keyDown(window, { key: "P" });
    fireEvent.keyDown(window, { key: "?" });
    expect(value.onEmote.mock.calls.map(([id]) => id)).toEqual(["wave", "idea", "dance"]);
    expect(value.onToggleMap).toHaveBeenCalledOnce();
    expect(value.onTogglePeople).toHaveBeenCalledOnce();
    expect(value.onHelp).toHaveBeenCalledOnce();
  });

  it("사용자가 바꾼 배정을 따른다: 새 키는 새 이모트를 보내고, 키를 잃은 이모트의 옛 키는 아무것도 하지 않는다", () => {
    const keymap = new StudioEmoteKeymapStore({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    keymap.assign("coffee", "3");
    keymap.assign("dance", "1");
    keymap.assign("heart", null);
    const value = { ...handlers(), emoteKeymap: keymap };
    renderHook(() => useSpaceShortcuts(value));
    fireEvent.keyDown(window, { key: "3" });
    fireEvent.keyDown(window, { key: "1" });
    // 비게 된 칸: 이모트도 보내지 않고 기본 동작을 막지도 않는다.
    const empty = new KeyboardEvent("keydown", { key: "2", bubbles: true, cancelable: true });
    window.dispatchEvent(empty);
    // 한글 자판에서 Z 칸에는 wave가 밀려 왔다(dance가 1로 갔으므로).
    fireEvent.keyDown(window, { key: "ㅋ", code: "KeyZ" });
    expect(value.onEmote.mock.calls.map(([id]) => id)).toEqual(["coffee", "dance", "wave"]);
    expect(empty.defaultPrevented).toBe(false);
  });

  it("배정을 바꾸는 즉시 다음 키부터 반영되고(다시 연결하지 않아도), 저장소를 넘기지 않으면 화면 공용 기본 배정을 쓴다", () => {
    const keymap = new StudioEmoteKeymapStore({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    const value = { ...handlers(), emoteKeymap: keymap };
    renderHook(() => useSpaceShortcuts(value));
    fireEvent.keyDown(window, { key: "4" });
    keymap.assign("clap", "4");
    fireEvent.keyDown(window, { key: "4" });
    expect(value.onEmote.mock.calls.map(([id]) => id)).toEqual(["thumbs-up", "clap"]);
    cleanup();
    const plain = handlers();
    renderHook(() => useSpaceShortcuts(plain));
    fireEvent.keyDown(window, { key: "4" });
    expect(plain.onEmote.mock.calls.map(([id]) => id)).toEqual(["thumbs-up"]);
    expect(STUDIO_EMOTE_KEYMAP_STORAGE_KEY).toBe("toonspectrum:virtual-space-emote-keys:v1");
  });

  it("이동·상호작용 키(WASD·방향키·E·X)는 캔버스 몫이라 가로채지 않는다", () => {
    const value = handlers();
    renderHook(() => useSpaceShortcuts(value));
    for (const key of ["w", "a", "s", "d", "ArrowUp", "e", "x", "Shift"]) {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented, key).toBe(false);
    }
    expect(value.onEmote).not.toHaveBeenCalled();
  });

  it("한글 자판(event.key가 자모)에서도 글쇠 위치로 M·P·Z·H를 읽는다", () => {
    const value = { ...handlers(), onDesk: vi.fn<() => void>() };
    renderHook(() => useSpaceShortcuts(value));
    fireEvent.keyDown(window, { key: "ㅡ", code: "KeyM" });
    fireEvent.keyDown(window, { key: "ㅔ", code: "KeyP" });
    fireEvent.keyDown(window, { key: "ㅋ", code: "KeyZ" });
    fireEvent.keyDown(window, { key: "ㅗ", code: "KeyH" });
    expect(value.onToggleMap).toHaveBeenCalledOnce();
    expect(value.onTogglePeople).toHaveBeenCalledOnce();
    expect(value.onEmote.mock.calls.map(([id]) => id)).toEqual(["dance"]);
    expect(value.onDesk).toHaveBeenCalledOnce();
  });

  it("F는 폭죽 이모트를 보낸다: 대문자·한글 자판(ㄹ, 글쇠 위치 KeyF)도 같고, 보조키 조합은 무시한다", () => {
    const value = handlers();
    renderHook(() => useSpaceShortcuts(value));
    const english = new KeyboardEvent("keydown", { key: "f", code: "KeyF", bubbles: true, cancelable: true });
    window.dispatchEvent(english);
    fireEvent.keyDown(window, { key: "F", code: "KeyF" });
    fireEvent.keyDown(window, { key: "ㄹ", code: "KeyF" });
    fireEvent.keyDown(window, { key: "f", code: "KeyF", ctrlKey: true });
    fireEvent.keyDown(window, { key: "f", code: "KeyF", metaKey: true });
    expect(value.onEmote.mock.calls.map(([id]) => id)).toEqual(["fireworks", "fireworks", "fireworks"]);
    expect(english.defaultPrevented).toBe(true);
  });

  it("F 칸도 사용자 배정을 따른다: 다른 이모트를 놓으면 폭죽은 키를 잃고, 폭죽을 다른 칸에 놓으면 그 칸이 폭죽이다", () => {
    const keymap = new StudioEmoteKeymapStore({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    keymap.assign("wave", "F");
    keymap.assign("fireworks", "5");
    const value = { ...handlers(), emoteKeymap: keymap };
    renderHook(() => useSpaceShortcuts(value));
    fireEvent.keyDown(window, { key: "f", code: "KeyF" });
    fireEvent.keyDown(window, { key: "5" });
    expect(value.onEmote.mock.calls.map(([id]) => id)).toEqual(["wave", "fireworks"]);
  });

  it("L은 끌어서 옮겨 둔 시점을 되돌리고(한글 자판 ㅣ도), 핸들러가 없으면 가로채지 않는다", () => {
    const value = { ...handlers(), onLocate: vi.fn<() => void>() };
    renderHook(() => useSpaceShortcuts(value));
    const english = new KeyboardEvent("keydown", { key: "l", code: "KeyL", bubbles: true, cancelable: true });
    window.dispatchEvent(english);
    expect(english.defaultPrevented).toBe(true);
    fireEvent.keyDown(window, { key: "ㅣ", code: "KeyL" });
    fireEvent.keyDown(window, { key: "L", code: "KeyL", ctrlKey: true });
    expect(value.onLocate).toHaveBeenCalledTimes(2);
    cleanup();
    const plain = handlers();
    renderHook(() => useSpaceShortcuts(plain));
    const ignored = new KeyboardEvent("keydown", { key: "l", code: "KeyL", bubbles: true, cancelable: true });
    window.dispatchEvent(ignored);
    expect(ignored.defaultPrevented).toBe(false);
  });

  it("+·=는 확대, -·_는 축소, 0은 원래 크기이고 이벤트의 기본 동작을 막는다", () => {
    const onZoom = vi.fn<(action: "in" | "out" | "reset") => void>();
    renderHook(() => useSpaceShortcuts({ ...handlers(), onZoom }));
    const prevented: boolean[] = [];
    for (const key of ["+", "=", "-", "_", "0"]) {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      window.dispatchEvent(event);
      prevented.push(event.defaultPrevented);
    }
    expect(onZoom.mock.calls.map(([action]) => action)).toEqual(["in", "in", "out", "out", "reset"]);
    expect(prevented).toEqual([true, true, true, true, true]);
  });

  it("줌을 받을 수 없으면(핸들러 없음) 줌·내 자리 키를 가로채지 않는다", () => {
    renderHook(() => useSpaceShortcuts(handlers()));
    for (const key of ["+", "-", "0", "h"]) {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented, key).toBe(false);
    }
  });

  it("브라우저 확대 단축키(Ctrl·⌘ + +/-/0)는 건드리지 않는다", () => {
    const onZoom = vi.fn();
    renderHook(() => useSpaceShortcuts({ ...handlers(), onZoom }));
    fireEvent.keyDown(window, { key: "+", ctrlKey: true });
    fireEvent.keyDown(window, { key: "-", metaKey: true });
    fireEvent.keyDown(window, { key: "0", ctrlKey: true });
    expect(onZoom).not.toHaveBeenCalled();
  });

  it("입력 요소·IME 조합·보조키·반복 입력은 무시한다", () => {
    const value = handlers();
    renderHook(() => useSpaceShortcuts(value));
    const input = document.createElement("textarea");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    document.body.append(input, editable);
    try {
      fireEvent.keyDown(input, { key: "1" });
      fireEvent.keyDown(editable, { key: "m" });
      fireEvent.keyDown(window, { key: "1", isComposing: true });
      fireEvent.keyDown(window, { key: "1", metaKey: true });
      fireEvent.keyDown(window, { key: "p", altKey: true });
      fireEvent.keyDown(window, { key: "2", repeat: true });
    } finally {
      input.remove(); editable.remove();
    }
    expect(value.onEmote).not.toHaveBeenCalled();
    expect(value.onToggleMap).not.toHaveBeenCalled();
    expect(value.onTogglePeople).not.toHaveBeenCalled();
  });

  it("Esc는 닫은 창이 있을 때만 기본 동작을 막고, 비활성화하면 아무 키도 처리하지 않는다", () => {
    const closed = handlers(true);
    const view = renderHook(({ enabled }) => useSpaceShortcuts(closed, enabled), { initialProps: { enabled: true } });
    const first = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    window.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(true);
    view.rerender({ enabled: false });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.keyDown(window, { key: "1" });
    expect(closed.onEscape).toHaveBeenCalledOnce();
    expect(closed.onEmote).not.toHaveBeenCalled();
    view.unmount();

    const nothing = handlers(false);
    renderHook(() => useSpaceShortcuts(nothing));
    const second = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    window.dispatchEvent(second);
    expect(second.defaultPrevented).toBe(false);
  });

  it("spaceShortcutIgnored는 입력 대상과 보조키를 판정한다", () => {
    const input = document.createElement("input");
    const button = document.createElement("button");
    const base = { isComposing: false, ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false };
    expect(spaceShortcutIgnored({ ...base, target: input })).toBe(true);
    expect(spaceShortcutIgnored({ ...base, target: button })).toBe(false);
    expect(spaceShortcutIgnored({ ...base, target: button, ctrlKey: true })).toBe(true);
    expect(spaceShortcutIgnored({ ...base, target: null, defaultPrevented: true })).toBe(true);
  });
});
