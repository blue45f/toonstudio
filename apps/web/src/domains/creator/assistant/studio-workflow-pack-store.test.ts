import { describe, expect, it, vi } from "vitest";

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

function createPack() {
  return buildWorkflowPackFromAssistantState({
    name: "로컬 도구 설정",
    platformId: "naver-webtoon",
    skinToneId: "warm-fair",
    perspectivePreset: "high-angle",
    focusStage: "background-3d",
    focusPreset: "deep-flow-50",
    readerSpeed: "immersive",
    nowMs: 1_700_000_000_000,
  });
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

  it("원고·권한·바이너리 확장 필드를 제외한 프리셋만 정확한 설정 키에 저장한다", () => {
    const storage = createMemoryStorage();
    const write = vi.spyOn(storage, "setItem");
    const pack = createPack();
    const expanded = {
      ...pack,
      projectGraph: { pages: ["manuscript-fixture"] },
      strokes: [{ points: [1, 2] }],
      authToken: "fixture-only",
      rightsBom: pack.rightsBom.map((entry) => ({ ...entry, assetBytes: [1, 2, 3] })),
    };

    expect(saveCustomStudioWorkflowPack(expanded, storage)).toEqual([pack]);
    expect(write).toHaveBeenCalledExactlyOnceWith(CUSTOM_WORKFLOW_PACKS_STORAGE_KEY, JSON.stringify([pack]));
    expect(loadCustomStudioWorkflowPacks(storage)).toEqual([pack]);
  });

  it("유효하지 않은 새 프리셋이 기존 설정을 덮어쓰지 않는다", () => {
    const storage = createMemoryStorage();
    const pack = createPack();
    saveCustomStudioWorkflowPack(pack, storage);
    const previous = storage.getItem(CUSTOM_WORKFLOW_PACKS_STORAGE_KEY);
    const write = vi.spyOn(storage, "setItem");

    expect(saveCustomStudioWorkflowPack({ ...pack, name: " " }, storage)).toEqual([pack]);
    const cyclic = { ...pack };
    Object.assign(cyclic, { unsupportedReference: cyclic });
    expect(saveCustomStudioWorkflowPack(cyclic, storage)).toEqual([pack]);
    expect(write).not.toHaveBeenCalled();
    expect(storage.getItem(CUSTOM_WORKFLOW_PACKS_STORAGE_KEY)).toBe(previous);
  });

  it("브라우저 도구 프리셋은 최신 24개만 보존하고 삭제도 같은 키만 수정한다", () => {
    const storage = createMemoryStorage();
    const write = vi.spyOn(storage, "setItem");
    const pack = createPack();
    for (let index = 0; index < 30; index += 1) {
      saveCustomStudioWorkflowPack({ ...pack, id: `preset-${index}` }, storage);
    }
    expect(loadCustomStudioWorkflowPacks(storage).map((entry) => entry.id)).toEqual(
      Array.from({ length: 24 }, (_, index) => `preset-${29 - index}`),
    );
    expect(deleteCustomStudioWorkflowPack("preset-29", storage)).toHaveLength(23);
    expect(new Set(write.mock.calls.map(([key]) => key))).toEqual(new Set([CUSTOM_WORKFLOW_PACKS_STORAGE_KEY]));
  });

  it("설정 저장이 차단되어도 정규화된 메모리 결과와 기본 목록을 제공한다", () => {
    const storage: WorkflowPackStorageLike = {
      getItem: () => null,
      setItem: () => { throw new Error("storage blocked"); },
    };
    const pack = createPack();
    const expanded = { ...pack, projectGraph: {} };

    expect(saveCustomStudioWorkflowPack(expanded, storage)).toEqual([pack]);
    expect(loadCustomStudioWorkflowPacks(storage)).toEqual([]);
    expect(deleteCustomStudioWorkflowPack(pack.id, storage)).toEqual([]);
    expect(saveCustomStudioWorkflowPack(pack, null)).toEqual([pack]);
  });
});
