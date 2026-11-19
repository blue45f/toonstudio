import { describe, it, expect, vi } from "vitest";
import { addMoodboardCard, createDefaultStudioProjectMoodboard, studioMoodboardStorageKey } from "./studio-moodboard";
import { readMoodboardCheckpoint, writeMoodboardCheckpoint } from "./studio-moodboard-checkpoint";

function setup() {
  const rows = new Map<string,string>();
  const store = {
    get: async (key: string) => rows.get(key) ?? null,
    set: vi.fn(async (key: string, value: string) => { rows.set(key, value); }),
    delete: async (key: string) => { rows.delete(key); },
  };
  const original = createDefaultStudioProjectMoodboard("항구");
  const board = addMoodboardCard(original, original.columns[0]!.id, { id: "actor", kind: "note", text: "등대지기" });
  return { rows, store, board, original };
}

describe("프로젝트별 아이디어 보드 복구본", () => {
  it("다시 열어도 동일한 원고만 복원하며 다른 작품의 저장본은 격리한다", async () => {
    const { store, board } = setup();
    expect(await readMoodboardCheckpoint(store, "항구")).toBeNull();
    const saved = await writeMoodboardCheckpoint(store, "항구", board, null);
    expect(await readMoodboardCheckpoint(store, "항구")).toEqual(saved);
    await expect(writeMoodboardCheckpoint(store, "도시", board, null)).rejects.toThrow();
    expect(await readMoodboardCheckpoint(store, "도시")).toBeNull();
  });
  it("다른 탭의 최신 복구본과 저장 실패 전의 복구본을 덮어쓰지 않는다", async () => {
    const { store, board, original } = setup();
    const first = await writeMoodboardCheckpoint(store, "항구", original, null);
    const second = await writeMoodboardCheckpoint(store, "항구", board, first);
    await expect(writeMoodboardCheckpoint(store, "항구", original, first)).rejects.toThrow("다른 창");
    store.set.mockRejectedValueOnce(new Error("quota"));
    await expect(writeMoodboardCheckpoint(store, "항구", original, second)).rejects.toThrow("quota");
    expect(await readMoodboardCheckpoint(store, "항구")).toEqual(second);
  });
  it("손상된 저장본은 빈 보드로 바꾸지 않는다", async () => {
    const { store, rows, board } = setup();
    rows.set(studioMoodboardStorageKey("항구"), "corrupt");
    await expect(readMoodboardCheckpoint(store, "항구")).rejects.toThrow();
    await expect(writeMoodboardCheckpoint(store, "항구", board, null)).rejects.toThrow();
    expect(rows.get(studioMoodboardStorageKey("항구"))).toBe("corrupt");
  });
});
