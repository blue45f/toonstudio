import { describe, expect, it, vi } from "vitest";

import { STUDIO_SPACE_EMOTES, type StudioSpaceEmoteId } from "./studio-virtual-space-emote-catalog";
import {
  STUDIO_DEFAULT_EMOTE_KEYMAP,
  STUDIO_EMOTE_KEYMAP_STORAGE_KEY,
  STUDIO_EMOTE_KEY_SLOTS,
  StudioEmoteKeymapStore,
  assignStudioEmoteKey,
  isDefaultStudioEmoteKeymap,
  parseStudioEmoteKeymap,
  readStudioEmoteKeymap,
  studioEmoteIdForKey,
  studioEmoteSlotOf,
  type StudioEmoteKeymapStorage,
} from "./studio-virtual-space-emote-keymap";

function memoryStorage(initial: Record<string, string> = {}): StudioEmoteKeymapStorage & { readonly data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: (key) => { data.delete(key); },
  };
}

describe("이모트 단축키 기본 배정", () => {
  it("카탈로그의 기본 단축키와 같고, 열 개 칸이 모두 찬다", () => {
    expect(STUDIO_EMOTE_KEY_SLOTS).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "Z"]);
    for (const emote of STUDIO_SPACE_EMOTES) {
      expect(studioEmoteSlotOf(STUDIO_DEFAULT_EMOTE_KEYMAP, emote.id), emote.id).toBe(emote.shortcut);
    }
    expect(STUDIO_EMOTE_KEY_SLOTS.every((slot) => STUDIO_DEFAULT_EMOTE_KEYMAP[slot])).toBe(true);
    expect(isDefaultStudioEmoteKeymap(STUDIO_DEFAULT_EMOTE_KEYMAP)).toBe(true);
    expect(Object.isFrozen(STUDIO_DEFAULT_EMOTE_KEYMAP)).toBe(true);
  });

  it("글쇠로 이모트를 찾는다: 숫자와 대소문자 Z만, 그 밖은 null", () => {
    expect(studioEmoteIdForKey(STUDIO_DEFAULT_EMOTE_KEYMAP, "1")).toBe("wave");
    expect(studioEmoteIdForKey(STUDIO_DEFAULT_EMOTE_KEYMAP, "9")).toBe("idea");
    expect(studioEmoteIdForKey(STUDIO_DEFAULT_EMOTE_KEYMAP, "z")).toBe("dance");
    expect(studioEmoteIdForKey(STUDIO_DEFAULT_EMOTE_KEYMAP, "Z")).toBe("dance");
    for (const key of ["0", "e", "12", "", "Enter"]) expect(studioEmoteIdForKey(STUDIO_DEFAULT_EMOTE_KEYMAP, key), key).toBeNull();
  });
});

describe("이모트 단축키 배정 바꾸기", () => {
  it("단축키가 없던 이모트를 빈 칸에 놓으면 그 칸만 채운다", () => {
    const cleared = assignStudioEmoteKey(STUDIO_DEFAULT_EMOTE_KEYMAP, "think", null);
    expect(cleared["8"]).toBeUndefined();
    const placed = assignStudioEmoteKey(cleared, "coffee", "8");
    expect(placed["8"]).toBe("coffee");
    expect(studioEmoteSlotOf(placed, "coffee")).toBe("8");
    expect(studioEmoteSlotOf(placed, "think")).toBeNull();
  });

  it("단축키가 없던 이모트를 다른 이모트가 쓰는 칸에 놓으면 밀려난 이모트는 단축키를 잃는다", () => {
    const next = assignStudioEmoteKey(STUDIO_DEFAULT_EMOTE_KEYMAP, "coffee", "3");
    expect(next["3"]).toBe("coffee");
    expect(studioEmoteSlotOf(next, "party")).toBeNull();
    // 나머지 칸은 그대로다.
    for (const slot of STUDIO_EMOTE_KEY_SLOTS.filter((candidate) => candidate !== "3")) expect(next[slot], slot).toBe(STUDIO_DEFAULT_EMOTE_KEYMAP[slot]);
  });

  it("이미 칸이 있는 이모트를 다른 이모트가 쓰는 칸에 놓으면 두 칸이 서로 바뀐다", () => {
    const next = assignStudioEmoteKey(STUDIO_DEFAULT_EMOTE_KEYMAP, "wave", "3");
    expect(next["3"]).toBe("wave");
    expect(next["1"]).toBe("party");
    expect(Object.values(next)).toHaveLength(10);
  });

  it("이미 칸이 있는 이모트를 빈 칸으로 옮기면 원래 칸이 비고, 단축키를 없애면 그 칸이 빈다", () => {
    const withoutZ = assignStudioEmoteKey(STUDIO_DEFAULT_EMOTE_KEYMAP, "dance", null);
    expect(withoutZ.Z).toBeUndefined();
    const moved = assignStudioEmoteKey(withoutZ, "wave", "Z");
    expect(moved.Z).toBe("wave");
    expect(moved["1"]).toBeUndefined();
  });

  it("같은 칸을 다시 고르거나 단축키가 없는 이모트의 단축키를 없애도 바뀌지 않아 같은 객체를 돌려준다", () => {
    expect(assignStudioEmoteKey(STUDIO_DEFAULT_EMOTE_KEYMAP, "wave", "1")).toBe(STUDIO_DEFAULT_EMOTE_KEYMAP);
    expect(assignStudioEmoteKey(STUDIO_DEFAULT_EMOTE_KEYMAP, "coffee", null)).toBe(STUDIO_DEFAULT_EMOTE_KEYMAP);
  });

  it("어떤 순서로 바꿔도 한 이모트는 많아야 한 칸에 있고 입력 배정은 바뀌지 않는다", () => {
    const frozen = STUDIO_DEFAULT_EMOTE_KEYMAP;
    let keymap = frozen;
    const ids = STUDIO_SPACE_EMOTES.map((emote) => emote.id);
    for (let step = 0; step < 200; step += 1) {
      const id = ids[(step * 7) % ids.length] ?? "wave";
      const slot = step % 11 === 10 ? null : STUDIO_EMOTE_KEY_SLOTS[(step * 3) % STUDIO_EMOTE_KEY_SLOTS.length] ?? null;
      keymap = assignStudioEmoteKey(keymap, id, slot);
      const placed = Object.values(keymap);
      expect(new Set(placed).size, `step ${step}`).toBe(placed.length);
      expect(slot === null ? studioEmoteSlotOf(keymap, id) : keymap[slot], `step ${step}`).toBe(slot === null ? null : id);
    }
    expect(isDefaultStudioEmoteKeymap(frozen)).toBe(true);
  });
});

describe("이모트 단축키 저장값 읽기", () => {
  it("올바른 배정(일부 칸이 빈 것 포함)을 읽는다", () => {
    expect(parseStudioEmoteKeymap({ "1": "coffee", Z: "wave" })).toEqual({ "1": "coffee", Z: "wave" });
    expect(parseStudioEmoteKeymap({})).toEqual({});
  });

  it("열 개 칸 밖의 키·모르는 이모트·한 이모트가 두 칸에 놓인 값은 통째로 버린다", () => {
    expect(parseStudioEmoteKeymap({ "0": "wave" })).toBeNull();
    expect(parseStudioEmoteKeymap({ z: "wave" })).toBeNull();
    expect(parseStudioEmoteKeymap({ "1": "nope" })).toBeNull();
    expect(parseStudioEmoteKeymap({ "1": "wave", "2": "wave" })).toBeNull();
    expect(parseStudioEmoteKeymap({ "1": 3 })).toBeNull();
    for (const value of [null, undefined, "wave", 1, ["wave"]]) expect(parseStudioEmoteKeymap(value), String(value)).toBeNull();
  });

  it("저장된 값이 없거나 깨졌거나 버전이 다르면 기본 배정이다", () => {
    expect(readStudioEmoteKeymap(memoryStorage())).toBe(STUDIO_DEFAULT_EMOTE_KEYMAP);
    expect(readStudioEmoteKeymap(null)).toBe(STUDIO_DEFAULT_EMOTE_KEYMAP);
    for (const raw of ["not json", "null", "[]", JSON.stringify({ version: 2, keys: { "1": "coffee" } }), JSON.stringify({ version: 1 }),
      JSON.stringify({ version: 1, keys: { "1": "wave", "2": "wave" } })]) {
      expect(readStudioEmoteKeymap(memoryStorage({ [STUDIO_EMOTE_KEYMAP_STORAGE_KEY]: raw })), raw).toBe(STUDIO_DEFAULT_EMOTE_KEYMAP);
    }
    const throwing: StudioEmoteKeymapStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => undefined, removeItem: () => undefined };
    expect(readStudioEmoteKeymap(throwing)).toBe(STUDIO_DEFAULT_EMOTE_KEYMAP);
  });
});

describe("이모트 단축키 저장소", () => {
  const stored = (storage: ReturnType<typeof memoryStorage>) => JSON.parse(storage.data.get(STUDIO_EMOTE_KEYMAP_STORAGE_KEY) ?? "null") as unknown;

  it("바꾸면 알리고 저장하며, 다음 방문에서 같은 배정을 읽는다", () => {
    const storage = memoryStorage();
    const store = new StudioEmoteKeymapStore(storage);
    const listener = vi.fn();
    store.subscribe(listener);
    const before = store.getSnapshot();
    store.assign("wave", "3");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).not.toBe(before);
    expect(studioEmoteIdForKey(store.getSnapshot(), "3")).toBe("wave");
    expect(studioEmoteIdForKey(store.getSnapshot(), "1")).toBe("party");
    expect(stored(storage)).toEqual({ version: 1, keys: expect.objectContaining({ "1": "party", "3": "wave" }) });
    expect(new StudioEmoteKeymapStore(storage).getSnapshot()).toEqual(store.getSnapshot());
  });

  it("바뀐 게 없으면 알리지도 저장하지도 않는다", () => {
    const storage = memoryStorage();
    const store = new StudioEmoteKeymapStore(storage);
    const listener = vi.fn();
    store.subscribe(listener);
    store.assign("wave", "1");
    store.assign("coffee", null);
    store.reset();
    expect(listener).not.toHaveBeenCalled();
    expect(storage.data.size).toBe(0);
  });

  it("기본 배정으로 돌아오면 저장값을 지우고(카탈로그의 새 기본을 따라가도록) 구독자에게 알린다", () => {
    const storage = memoryStorage();
    const store = new StudioEmoteKeymapStore(storage);
    const listener = vi.fn();
    store.assign("wave", "3");
    store.subscribe(listener);
    store.reset();
    expect(store.getSnapshot()).toBe(STUDIO_DEFAULT_EMOTE_KEYMAP);
    expect(storage.data.has(STUDIO_EMOTE_KEYMAP_STORAGE_KEY)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("손으로 되돌려 기본과 같아져도 기본 객체로 맞추고 저장값을 지운다", () => {
    const storage = memoryStorage();
    const store = new StudioEmoteKeymapStore(storage);
    store.assign("wave", "3");
    store.assign("wave", "1");
    expect(store.getSnapshot()).toBe(STUDIO_DEFAULT_EMOTE_KEYMAP);
    expect(storage.data.has(STUDIO_EMOTE_KEYMAP_STORAGE_KEY)).toBe(false);
  });

  it("구독을 해제하면 더 알리지 않고, 저장소가 막혀 있어도 이번 방문 동안은 바뀐다", () => {
    const store = new StudioEmoteKeymapStore(memoryStorage());
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    stop();
    store.assign("wave", "2");
    expect(listener).not.toHaveBeenCalled();

    const blocked: StudioEmoteKeymapStorage = { getItem: () => null, setItem: () => { throw new Error("quota"); }, removeItem: () => { throw new Error("quota"); } };
    const offline = new StudioEmoteKeymapStore(blocked);
    offline.assign("coffee", "5");
    expect(studioEmoteIdForKey(offline.getSnapshot(), "5")).toBe("coffee" satisfies StudioSpaceEmoteId);
    offline.reset();
    expect(offline.getSnapshot()).toBe(STUDIO_DEFAULT_EMOTE_KEYMAP);
  });
});
