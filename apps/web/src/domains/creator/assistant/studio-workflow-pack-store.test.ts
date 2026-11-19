import { describe, expect, it } from "vitest";

import {
  CUSTOM_WORKFLOW_PACKS_STORAGE_KEY,
  buildWorkflowPackFromAssistantState,
  deleteCustomStudioWorkflowPack,
  loadCustomStudioWorkflowPacks,
  saveCustomStudioWorkflowPack,
  type WorkflowPackStorageLike,
} from "./studio-workflow-pack-store";

function createMemoryStorage(): WorkflowPackStorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe("studio-workflow-pack-store", () => {
  it("builds, saves, loads, deduplicates, and deletes custom workflow packs", () => {
    const storage = createMemoryStorage();
    const pack = buildWorkflowPackFromAssistantState({
      name: "내 로판 2화 세팅",
      genre: "로맨스판타지",
      platformId: "naver-webtoon",
      skinToneId: "warm-fair",
      perspectivePreset: "high-angle",
      focusStage: "background-3d",
      focusPreset: "deep-flow-50",
      readerSpeed: "immersive",
      nowMs: 1_700_000_000_000,
    });

    const afterSave = saveCustomStudioWorkflowPack(pack, storage);
    expect(afterSave).toHaveLength(1);
    expect(loadCustomStudioWorkflowPacks(storage)).toEqual([pack]);

    const updated = { ...pack, name: "내 로판 2화 세팅 (수정)" };
    const afterUpdate = saveCustomStudioWorkflowPack(updated, storage);
    expect(afterUpdate).toHaveLength(1);
    expect(afterUpdate[0].name).toBe("내 로판 2화 세팅 (수정)");

    const afterDelete = deleteCustomStudioWorkflowPack(pack.id, storage);
    expect(afterDelete).toEqual([]);
  });

  it("ignores corrupted storage payloads safely", () => {
    const storage = createMemoryStorage();
    storage.setItem(CUSTOM_WORKFLOW_PACKS_STORAGE_KEY, "{broken-json");
    expect(loadCustomStudioWorkflowPacks(storage)).toEqual([]);
  });
});
