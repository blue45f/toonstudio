/**
 * 용어집 스토어 IndexedDB 이관 테스트 —
 * 작품별 용어집 텍스트가 구 localStorage 키에서 손실 없이 IDB로 이관되고,
 * 이후 저장이 IDB에만 남는지 검증한다.
 */

// @vitest-environment jsdom

import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { idbKvGet } from "@/shared/lib/idb-kv";

import {
  loadStudioDialogueGlossaryTextAsync,
  saveStudioDialogueGlossaryTextAsync,
  studioDialogueGlossaryStorageKey,
} from "./studio-dialogue-glossary-store";

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.clear();
});

describe("용어집 IDB 이관", () => {
  it("구 localStorage 용어집이 첫 읽기에서 이관돼 보존되고 구 키가 제거된다", async () => {
    const key = studioDialogueGlossaryStorageKey("work-a");
    localStorage.setItem(key, "민수: Minsu");

    await expect(loadStudioDialogueGlossaryTextAsync("work-a")).resolves.toBe(
      "민수: Minsu"
    );
    expect(localStorage.getItem(key)).toBeNull();
    await expect(idbKvGet(key)).resolves.toBe("민수: Minsu");
  });

  it("작품별로 격리된 이관이 일어난다", async () => {
    localStorage.setItem(studioDialogueGlossaryStorageKey("work-a"), "민수: Minsu");
    localStorage.setItem(studioDialogueGlossaryStorageKey("work-b"), "지연: Jiyeon");

    await expect(loadStudioDialogueGlossaryTextAsync("work-a")).resolves.toBe("민수: Minsu");
    await expect(loadStudioDialogueGlossaryTextAsync("work-b")).resolves.toBe("지연: Jiyeon");
    await expect(loadStudioDialogueGlossaryTextAsync("work-c")).resolves.toBe("");
  });

  it("저장은 IDB에만 남고, 빈 텍스트는 양쪽에서 키를 지운다", async () => {
    const key = studioDialogueGlossaryStorageKey("work-a");
    await saveStudioDialogueGlossaryTextAsync("work-a", "민수: Minsu");
    await expect(idbKvGet(key)).resolves.toBe("민수: Minsu");
    expect(localStorage.getItem(key)).toBeNull();

    await saveStudioDialogueGlossaryTextAsync("work-a", "");
    await expect(idbKvGet(key)).resolves.toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
    await expect(loadStudioDialogueGlossaryTextAsync("work-a")).resolves.toBe("");
  });
});
