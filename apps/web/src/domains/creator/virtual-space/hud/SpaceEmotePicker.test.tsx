// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { STUDIO_SPACE_EMOTES } from "../studio-virtual-space-emote-catalog";
import { STUDIO_DEFAULT_EMOTE_KEYMAP, StudioEmoteKeymapStore, studioEmoteIdForKey, type StudioEmoteKeymapStorage } from "../studio-virtual-space-emote-keymap";
import { SpaceEmotePicker } from "./SpaceEmotePicker";

afterEach(() => { cleanup(); useI18n.getState().setLang("ko"); });

function memoryStorage(): StudioEmoteKeymapStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: (key) => { data.delete(key); },
  };
}

const picker = () => screen.getByRole("group", { name: "리액션 17종" });

describe("리액션 선택기", () => {
  it("이모트 17종을 단추로 보여 주고 단축키 배지를 달며, 누르면 알린다", () => {
    const onEmote = vi.fn();
    render(<SpaceEmotePicker onEmote={onEmote} keymap={new StudioEmoteKeymapStore(memoryStorage())} />);
    const emotes = within(picker()).getAllByRole("button").filter((button) => button.hasAttribute("data-emote-id"));
    expect(emotes).toHaveLength(STUDIO_SPACE_EMOTES.length);
    const wave = within(picker()).getByRole("button", { name: "손 흔들기 (단축키 1)" });
    expect(wave.getAttribute("aria-keyshortcuts")).toBe("1");
    expect(wave.querySelector("kbd")?.textContent).toBe("1");
    fireEvent.click(wave);
    expect(onEmote).toHaveBeenCalledExactlyOnceWith("wave");
    const coffee = within(picker()).getByRole("button", { name: "커피 타임" });
    expect(coffee.hasAttribute("aria-keyshortcuts")).toBe(false);
    expect(coffee.querySelector("kbd")).toBeNull();
  });

  it("사용자가 바꾼 배정을 배지와 접근성 이름에 그대로 보여 준다", () => {
    const keymap = new StudioEmoteKeymapStore(memoryStorage());
    keymap.assign("coffee", "3");
    render(<SpaceEmotePicker onEmote={vi.fn()} keymap={keymap} />);
    expect(within(picker()).getByRole("button", { name: "커피 타임 (단축키 3)" }).querySelector("kbd")?.textContent).toBe("3");
    const party = within(picker()).getByRole("button", { name: "축하해요" });
    expect(party.querySelector("kbd")).toBeNull();
  });

  it("다른 곳에서 배정이 바뀌면 열려 있는 선택기도 따라 바뀐다", () => {
    const keymap = new StudioEmoteKeymapStore(memoryStorage());
    render(<SpaceEmotePicker onEmote={vi.fn()} keymap={keymap} />);
    expect(within(picker()).getByRole("button", { name: "손 흔들기 (단축키 1)" })).toBeTruthy();
    act(() => { keymap.assign("wave", "Z"); });
    expect(within(picker()).getByRole("button", { name: "손 흔들기 (단축키 Z)" })).toBeTruthy();
    expect(within(picker()).getByRole("button", { name: "춤추기 (단축키 1)" })).toBeTruthy();
  });

  it("가로 줄(휴대폰)에는 단축키 바꾸기가 없다", () => {
    render(<SpaceEmotePicker variant="strip" onEmote={vi.fn()} keymap={new StudioEmoteKeymapStore(memoryStorage())} />);
    const strip = screen.getByRole("group", { name: "리액션 보내기" });
    expect(within(strip).queryByRole("button", { name: "단축키 바꾸기" })).toBeNull();
    expect(strip.querySelector("select")).toBeNull();
  });
});

describe("리액션 단축키 바꾸기", () => {
  function open() {
    const onEmote = vi.fn();
    const keymap = new StudioEmoteKeymapStore(memoryStorage());
    render(<SpaceEmotePicker onEmote={onEmote} keymap={keymap} />);
    const toggle = screen.getByRole("button", { name: "단축키 바꾸기" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    return { onEmote, keymap, toggle };
  }
  const selectOf = (label: string) => within(picker()).getByRole("combobox", { name: `${label} 단축키` }) as HTMLSelectElement;

  it("켜면 이모트 칸이 단추 대신 키 고르기가 되어 눌러도 이모트가 나가지 않는다", () => {
    const { onEmote, toggle } = open();
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(within(picker()).queryByRole("button", { name: /손 흔들기/u })).toBeNull();
    expect(within(picker()).getAllByRole("combobox")).toHaveLength(STUDIO_SPACE_EMOTES.length);
    expect(selectOf("손 흔들기").value).toBe("1");
    expect(selectOf("커피 타임").value).toBe("");
    // 고르기 목록은 없음 + 11개 칸이다.
    expect(Array.from(selectOf("손 흔들기").options).map((option) => option.value)).toEqual(["", "1", "2", "3", "4", "5", "6", "7", "8", "9", "Z", "F"]);
    fireEvent.click(within(picker()).getByRole("group", { name: "손 흔들기" }));
    expect(onEmote).not.toHaveBeenCalled();
  });

  it("단축키가 없던 이모트에 키를 주면 그 키를 쓰던 이모트는 키를 잃고, 바뀐 결과를 알려 준다", () => {
    const { keymap } = open();
    fireEvent.change(selectOf("커피 타임"), { target: { value: "3" } });
    expect(studioEmoteIdForKey(keymap.getSnapshot(), "3")).toBe("coffee");
    expect(selectOf("커피 타임").value).toBe("3");
    expect(selectOf("축하해요").value).toBe("");
    expect(screen.getByRole("status").textContent).toBe("커피 타임 단축키: 3 · 축하해요 단축키: 없음");
  });

  it("이미 키가 있는 이모트를 다른 이모트의 키로 바꾸면 두 이모트가 키를 맞바꾼다", () => {
    const { keymap } = open();
    fireEvent.change(selectOf("손 흔들기"), { target: { value: "3" } });
    expect(studioEmoteIdForKey(keymap.getSnapshot(), "3")).toBe("wave");
    expect(studioEmoteIdForKey(keymap.getSnapshot(), "1")).toBe("party");
    expect(selectOf("축하해요").value).toBe("1");
    expect(screen.getByRole("status").textContent).toBe("손 흔들기 단축키: 3 · 축하해요 단축키: 1");
  });

  it("없음을 고르면 단축키가 없어지고 그 키는 비어 아무 이모트도 보내지 않는다", () => {
    const { keymap } = open();
    fireEvent.change(selectOf("춤추기"), { target: { value: "" } });
    expect(studioEmoteIdForKey(keymap.getSnapshot(), "z")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("춤추기 단축키: 없음");
  });

  it("기본값으로 되돌릴 수 있고, 이미 기본이면 되돌리기는 비활성이다", () => {
    const { keymap } = open();
    const reset = screen.getByRole("button", { name: "기본값으로" }) as HTMLButtonElement;
    expect(reset.disabled).toBe(true);
    fireEvent.change(selectOf("손 흔들기"), { target: { value: "3" } });
    expect(reset.disabled).toBe(false);
    fireEvent.click(reset);
    expect(keymap.getSnapshot()).toBe(STUDIO_DEFAULT_EMOTE_KEYMAP);
    expect(selectOf("손 흔들기").value).toBe("1");
    expect(reset.disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toBe("단축키를 기본값으로 되돌렸어요");
  });

  it("끄면 다시 이모트 단추가 되고 안내 문구는 비워진다", () => {
    const { onEmote, keymap, toggle } = open();
    act(() => { keymap.assign("coffee", "3"); });
    fireEvent.click(toggle);
    expect(within(picker()).queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(within(picker()).getByRole("button", { name: "커피 타임 (단축키 3)" }));
    expect(onEmote).toHaveBeenCalledExactlyOnceWith("coffee");
    fireEvent.click(toggle);
    expect(screen.getByRole("status").textContent).toBe("");
  });
});

describe("리액션 선택기(영어)", () => {
  it("선택기·편집 모드·안내 문구가 영어로 나온다", () => {
    useI18n.getState().setLang("en");
    const keymap = new StudioEmoteKeymapStore(memoryStorage());
    render(<SpaceEmotePicker onEmote={vi.fn()} keymap={keymap} />);
    const group = screen.getByRole("group", { name: "17 reactions" });
    expect(within(group).getByRole("button", { name: "Wave (shortcut 1)" })).toBeTruthy();
    fireEvent.click(within(group).getByRole("button", { name: "Edit shortcuts" }));
    const coffee = within(group).getByRole("combobox", { name: "Coffee break shortcut" }) as HTMLSelectElement;
    expect(Array.from(coffee.options)[0]?.textContent).toBe("None");
    fireEvent.change(coffee, { target: { value: "3" } });
    expect(screen.getByRole("status").textContent).toBe("Coffee break shortcut: 3 · Celebrate shortcut: none");
    fireEvent.click(within(group).getByRole("button", { name: "Reset" }));
    expect(screen.getByRole("status").textContent).toBe("Shortcuts are back to the defaults");
  });
});
