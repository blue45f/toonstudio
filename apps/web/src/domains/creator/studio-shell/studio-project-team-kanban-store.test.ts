import { describe, expect, it, vi } from "vitest";

import { createDefaultProjectKanbanState, handoffKanbanStage, kanbanStorageKey, loadProjectKanbanState,
  saveProjectKanbanState, updateKanbanStageAssignee } from "./studio-project-team-kanban-store";

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe("프로젝트별 로컬 제작 칸반", () => {
  it("담당자와 인계 메모를 같은 작품에만 복원하고 이력을30개로 제한한다", () => {
    const storage = memoryStorage();
    let state = updateKanbanStageAssignee(createDefaultProjectKanbanState("project/a"), "storyboard", "콘티 담당");
    for (let index = 0; index < 35; index += 1) state = handoffKanbanStage(state, "storyboard", `인계 ${index}`);
    expect(saveProjectKanbanState(storage, state)).toBe(true);
    expect(loadProjectKanbanState(storage, "project/a")).toEqual(state);
    expect(loadProjectKanbanState(storage, "project/a").handoffs).toHaveLength(30);
    expect(loadProjectKanbanState(storage, "project/b")).toEqual(createDefaultProjectKanbanState("project/b"));
  });

  it.each(["{broken", "null", JSON.stringify(createDefaultProjectKanbanState("foreign")),
    JSON.stringify({ ...createDefaultProjectKanbanState("protected"), version: 2 })])("손상·다른 작품·미지원 버전 원본을 보존한다: %s", original => {
    const storage = memoryStorage(), state = createDefaultProjectKanbanState("protected");
    storage.setItem(kanbanStorageKey(state.projectId), original);
    expect(loadProjectKanbanState(storage, state.projectId)).toEqual(state);
    expect(saveProjectKanbanState(storage, updateKanbanStageAssignee(state, "lineart", "새 담당"))).toBe(false);
    expect(storage.getItem(kanbanStorageKey(state.projectId))).toBe(original);
  });

  it("저장 거부와 무시를 성공으로 보고하지 않고 이전 작업 사본을 보존한다", () => {
    const storage = memoryStorage(), state = createDefaultProjectKanbanState("quota");
    expect(saveProjectKanbanState(storage, state)).toBe(true);
    const original = storage.getItem(kanbanStorageKey(state.projectId));
    const write = vi.spyOn(storage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    const edited = updateKanbanStageAssignee(state, "lineart", "새 담당");
    expect(saveProjectKanbanState(storage, edited)).toBe(false);
    expect(edited.stages.lineart.assignee).toBe("새 담당");
    expect(storage.getItem(kanbanStorageKey(state.projectId))).toBe(original);
    write.mockImplementation(() => undefined);
    expect(saveProjectKanbanState(storage, edited)).toBe(false);
    expect(storage.getItem(kanbanStorageKey(state.projectId))).toBe(original);
  });
});
