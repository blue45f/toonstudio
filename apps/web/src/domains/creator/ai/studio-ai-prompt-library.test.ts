import { describe, expect, it } from "vitest";

import {
  addPromptLibraryEntry,
  listPromptLibraryEntries,
  removePromptLibraryEntry,
  touchPromptLibraryEntry,
} from "./studio-ai-prompt-library";

describe("studio-ai-prompt-library", () => {
  it("추가하고 최근순으로 나열한다", () => {
    const first = addPromptLibraryEntry([], { text: "파스텔 채색", kind: "prompt" }, 100);
    expect(first.added).toBe(true);
    const second = addPromptLibraryEntry(first.entries, { text: "머리색 갈색", kind: "hint" }, 200);
    expect(second.added).toBe(true);
    expect(listPromptLibraryEntries(second.entries).map((entry) => entry.text)).toEqual([
      "머리색 갈색",
      "파스텔 채색",
    ]);
  });

  it("중복은 추가하지 않고 사용 시각만 갱신한다", () => {
    const first = addPromptLibraryEntry([], { text: "파스텔 채색", kind: "prompt" }, 100);
    const second = addPromptLibraryEntry(first.entries, { text: "  파스텔 채색 ", kind: "prompt" }, 300);
    expect(second.added).toBe(false);
    expect(second.entries).toHaveLength(1);
    expect(second.entries[0]?.usedAt).toBe(300);
  });

  it("삭제와 터치가 동작한다", () => {
    const added = addPromptLibraryEntry([], { text: "파스텔 채색", kind: "prompt" }, 100);
    const id = added.entries[0]?.id ?? "";
    const touched = touchPromptLibraryEntry(added.entries, id, 500);
    expect(touched[0]?.usedAt).toBe(500);
    expect(removePromptLibraryEntry(touched, id)).toEqual([]);
  });
});
