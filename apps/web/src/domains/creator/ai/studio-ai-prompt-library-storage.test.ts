import { describe, expect, it } from "vitest";

import {
  loadPromptLibraryEntries,
  savePromptLibraryEntries,
} from "./studio-ai-prompt-library-storage";
import type { StudioAiPromptLibraryEntry } from "./studio-ai-prompt-library";

function memoryStore(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
    dump: () => data,
  };
}

const entry = (id: string): StudioAiPromptLibraryEntry => ({
  id,
  text: `프롬프트 ${id}`,
  kind: "prompt",
  usedAt: 10,
});

describe("studio-ai-prompt-library-storage", () => {
  it("저장한 목록을 그대로 불러온다", () => {
    const store = memoryStore();
    expect(savePromptLibraryEntries(store, [entry("a"), entry("b")])).toBe(true);
    expect(loadPromptLibraryEntries(store)).toEqual([entry("a"), entry("b")]);
  });

  it("손상된 저장값은 빈 목록으로 취급한다", () => {
    const store = memoryStore({ "toonstudio.ai.prompt-library.v1": "깨진{" });
    expect(loadPromptLibraryEntries(store)).toEqual([]);
    const wrong = memoryStore({
      "toonstudio.ai.prompt-library.v1": JSON.stringify([{ id: 1 }]),
    });
    expect(loadPromptLibraryEntries(wrong)).toEqual([]);
  });

  it("저장 실패는 false로 돌려준다", () => {
    const store = {
      getItem: () => null,
      setItem: () => {
        throw new Error("저장 불가");
      },
    };
    expect(savePromptLibraryEntries(store, [entry("a")])).toBe(false);
  });
});
