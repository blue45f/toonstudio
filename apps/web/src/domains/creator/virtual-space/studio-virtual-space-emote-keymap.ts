/**
 * 이모트 단축키 배정(1~9·Z). 카탈로그가 정한 기본 배정을 사용자가 바꿔 쓸 수 있게 한다.
 *
 * - 칸(슬롯)은 "1"~"9"·"Z"·"F" 열한 개이고, 각 칸에는 이모트가 하나 있거나 비어 있다. 한 이모트는 많아야 한 칸에 놓인다.
 * - 이미 다른 칸에 있는 이모트를 놓으면 두 칸이 서로 바뀐다(원래 칸에는 밀려난 이모트가 온다). 원래 칸이 없던 이모트를
 *   놓으면 그 칸에 있던 이모트는 단축키 없이 선택기에만 남는다.
 * - 배정은 이 브라우저에만 저장하는 개인 설정이다. 보내는 쪽 이모트 id(와이어)는 그대로라 다른 참가자·구버전에 영향이 없다.
 */
import {
  STUDIO_SPACE_EMOTES,
  isStudioSpaceEmoteId,
  type StudioSpaceEmoteId,
  type StudioSpaceEmoteShortcut,
} from "./studio-virtual-space-emote-catalog";

export const STUDIO_EMOTE_KEYMAP_STORAGE_KEY = "toonspectrum:virtual-space-emote-keys:v1";

/** 단축키 칸. 선택기·도움말이 보이는 순서이기도 하다. */
export const STUDIO_EMOTE_KEY_SLOTS: readonly StudioSpaceEmoteShortcut[] = Object.freeze(["1", "2", "3", "4", "5", "6", "7", "8", "9", "Z", "F"]);

export type StudioEmoteKeymap = Readonly<Partial<Record<StudioSpaceEmoteShortcut, StudioSpaceEmoteId>>>;

type MutableKeymap = Partial<Record<StudioSpaceEmoteShortcut, StudioSpaceEmoteId>>;

function isSlot(value: string): value is StudioSpaceEmoteShortcut {
  return (STUDIO_EMOTE_KEY_SLOTS as readonly string[]).includes(value);
}

function defaultKeymap(): StudioEmoteKeymap {
  const keys: MutableKeymap = {};
  for (const emote of STUDIO_SPACE_EMOTES) if (emote.shortcut) keys[emote.shortcut] = emote.id;
  return Object.freeze(keys);
}

/** 카탈로그의 기본 배정. 저장된 설정이 없거나 깨졌을 때 쓴다. */
export const STUDIO_DEFAULT_EMOTE_KEYMAP: StudioEmoteKeymap = defaultKeymap();

/** 이 이모트가 놓인 칸. 단축키가 없으면 null. */
export function studioEmoteSlotOf(keymap: StudioEmoteKeymap, id: StudioSpaceEmoteId): StudioSpaceEmoteShortcut | null {
  return STUDIO_EMOTE_KEY_SLOTS.find((slot) => keymap[slot] === id) ?? null;
}

/** 눌린 글쇠("1"~"9", "z"/"Z", "f"/"F")에 배정된 이모트 id. 그 외 글쇠이거나 칸이 비어 있으면 null. */
export function studioEmoteIdForKey(keymap: StudioEmoteKeymap, key: string): StudioSpaceEmoteId | null {
  if (typeof key !== "string" || key.length !== 1) return null;
  const slot = key.toUpperCase();
  return isSlot(slot) ? keymap[slot] ?? null : null;
}

/**
 * 이모트를 칸에 놓은 새 배정. slot이 null이면 그 이모트의 단축키를 없앤다. 바뀐 게 없으면 같은 객체를 돌려준다.
 * 이미 다른 칸에 있던 이모트를 다른 이모트가 차지한 칸에 놓으면 두 이모트가 칸을 맞바꾼다.
 */
export function assignStudioEmoteKey(keymap: StudioEmoteKeymap, id: StudioSpaceEmoteId, slot: StudioSpaceEmoteShortcut | null): StudioEmoteKeymap {
  const previous = studioEmoteSlotOf(keymap, id);
  if (previous === slot) return keymap;
  const displaced = slot ? keymap[slot] : undefined;
  const next: MutableKeymap = {};
  for (const key of STUDIO_EMOTE_KEY_SLOTS) {
    const current = keymap[key];
    if (current && key !== previous) next[key] = current;
  }
  if (slot) {
    next[slot] = id;
    if (previous && displaced) next[previous] = displaced;
  }
  return Object.freeze(next);
}

export function isDefaultStudioEmoteKeymap(keymap: StudioEmoteKeymap): boolean {
  return STUDIO_EMOTE_KEY_SLOTS.every((slot) => keymap[slot] === STUDIO_DEFAULT_EMOTE_KEYMAP[slot]);
}

/**
 * 저장된 값을 배정으로 읽는다. 열한 개 칸 밖의 키·모르는 이모트 id·한 이모트가 두 칸에 놓인 경우처럼 조금이라도 어긋나면
 * 전체를 버리고 null을 돌려준다(일부만 믿고 쓰면 키가 뜻밖의 이모트를 보낸다).
 */
export function parseStudioEmoteKeymap(value: unknown): StudioEmoteKeymap | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const keys: MutableKeymap = {};
  const seen = new Set<string>();
  for (const [slot, id] of Object.entries(value)) {
    if (!isSlot(slot) || !isStudioSpaceEmoteId(id) || seen.has(id)) return null;
    seen.add(id);
    keys[slot] = id;
  }
  return Object.freeze(keys);
}

export interface StudioEmoteKeymapStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const defaultStorage = (): StudioEmoteKeymapStorage | null => {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
};

/** 저장된 배정. 없거나 읽을 수 없거나 어긋나면 기본 배정이다. */
export function readStudioEmoteKeymap(storage: StudioEmoteKeymapStorage | null = defaultStorage()): StudioEmoteKeymap {
  try {
    const raw = storage?.getItem(STUDIO_EMOTE_KEYMAP_STORAGE_KEY);
    if (!raw) return STUDIO_DEFAULT_EMOTE_KEYMAP;
    const stored: unknown = JSON.parse(raw);
    if (!stored || typeof stored !== "object" || !("version" in stored) || stored.version !== 1 || !("keys" in stored)) return STUDIO_DEFAULT_EMOTE_KEYMAP;
    return parseStudioEmoteKeymap(stored.keys) ?? STUDIO_DEFAULT_EMOTE_KEYMAP;
  } catch {
    return STUDIO_DEFAULT_EMOTE_KEYMAP;
  }
}

/**
 * 이모트 단축키 배정 저장소. HUD(선택기·도움말·단축키 처리)가 같은 값을 보게 하고, 바뀔 때만 저장한다.
 * 기본 배정으로 돌아오면 저장값을 지워 카탈로그가 바뀌어도 새 기본을 따라간다. 저장소가 막혀 있어도 이번 방문 동안은 동작한다.
 * React에서는 useSyncExternalStore로 구독한다(스냅샷은 바뀔 때만 새 객체다).
 */
export class StudioEmoteKeymapStore {
  private keymap: StudioEmoteKeymap;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly storage: StudioEmoteKeymapStorage | null = defaultStorage()) {
    this.keymap = readStudioEmoteKeymap(storage);
  }

  getSnapshot(): StudioEmoteKeymap {
    return this.keymap;
  }

  /** 이모트를 칸에 놓는다(칸이 null이면 단축키를 없앤다). 다른 이모트가 쓰던 칸이면 서로 바뀐다. */
  assign(id: StudioSpaceEmoteId, slot: StudioSpaceEmoteShortcut | null): void {
    this.commit(assignStudioEmoteKey(this.keymap, id, slot));
  }

  /** 기본 배정으로 되돌린다. */
  reset(): void {
    this.commit(STUDIO_DEFAULT_EMOTE_KEYMAP);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private commit(candidate: StudioEmoteKeymap): void {
    // 기본과 같은 내용은 기본 객체로 맞춰 둔다: 같은 값이면 알리지 않고, 저장값도 남기지 않는다.
    const next = isDefaultStudioEmoteKeymap(candidate) ? STUDIO_DEFAULT_EMOTE_KEYMAP : candidate;
    if (next === this.keymap) return;
    this.keymap = next;
    try {
      if (isDefaultStudioEmoteKeymap(next)) this.storage?.removeItem(STUDIO_EMOTE_KEYMAP_STORAGE_KEY);
      else this.storage?.setItem(STUDIO_EMOTE_KEYMAP_STORAGE_KEY, JSON.stringify({ version: 1, keys: next }));
    } catch { /* 저장 실패는 이번 방문의 동작에 영향이 없다 */ }
    for (const listener of this.listeners) listener();
  }
}

/** 화면 전체가 같이 쓰는 저장소. 테스트는 새 StudioEmoteKeymapStore를 만들어 넘긴다. */
export const studioEmoteKeymapStore = new StudioEmoteKeymapStore();
