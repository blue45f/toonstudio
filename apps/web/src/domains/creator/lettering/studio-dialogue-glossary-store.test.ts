import { describe, expect, it, vi } from "vitest";

import {
  loadStudioDialogueGlossaryText,
  saveStudioDialogueGlossaryText,
  studioDialogueGlossaryStorageKey,
} from "./studio-dialogue-glossary-store";

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: vi.fn((key: string) => map.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      map.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      map.delete(key);
    }),
  };
}

describe("studio dialogue glossary store", () => {
  it("작품(workScope)별로 격리해 저장하고 다시 읽는다", () => {
    const storage = fakeStorage();
    saveStudioDialogueGlossaryText(storage, "work-a", "민수: Minsu");
    saveStudioDialogueGlossaryText(storage, "work-b", "지연: Jiyeon");
    expect(loadStudioDialogueGlossaryText(storage, "work-a")).toBe("민수: Minsu");
    expect(loadStudioDialogueGlossaryText(storage, "work-b")).toBe("지연: Jiyeon");
    expect(loadStudioDialogueGlossaryText(storage, "work-c")).toBe("");
    expect(studioDialogueGlossaryStorageKey("work-a")).toContain("work-a");
  });

  it("빈 텍스트를 저장하면 키를 지운다", () => {
    const storage = fakeStorage();
    saveStudioDialogueGlossaryText(storage, "work-a", "민수: Minsu");
    saveStudioDialogueGlossaryText(storage, "work-a", "");
    expect(storage.removeItem).toHaveBeenCalled();
    expect(loadStudioDialogueGlossaryText(storage, "work-a")).toBe("");
  });

  it("workScope가 없으면 저장하지 않고 읽기도 빈 값이다", () => {
    const storage = fakeStorage();
    saveStudioDialogueGlossaryText(storage, "", "민수: Minsu");
    saveStudioDialogueGlossaryText(storage, null, "민수: Minsu");
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(loadStudioDialogueGlossaryText(storage, "")).toBe("");
    expect(loadStudioDialogueGlossaryText(storage, undefined)).toBe("");
  });

  it("저장소가 없거나 던져도 조용히 빈 값/무동작이다", () => {
    expect(loadStudioDialogueGlossaryText(null, "work-a")).toBe("");
    expect(() => saveStudioDialogueGlossaryText(null, "work-a", "x")).not.toThrow();
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadStudioDialogueGlossaryText(broken, "work-a")).toBe("");
    expect(() => saveStudioDialogueGlossaryText(broken, "work-a", "x")).not.toThrow();
    expect(() => saveStudioDialogueGlossaryText(broken, "work-a", "")).not.toThrow();
  });
});
