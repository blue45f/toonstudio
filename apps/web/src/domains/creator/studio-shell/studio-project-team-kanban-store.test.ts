import { describe, expect, it, vi } from "vitest";

import { createDefaultProjectKanbanState, handoffKanbanStage, kanbanStorageKey, loadProjectKanbanState,
  saveProjectKanbanState, updateKanbanStageAssignee, updateKanbanStageStatus } from "./studio-project-team-kanban-store";

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe("프로젝트별 로컬 제작 칸반", () => {
  it.each(["unavailable", "malformed"])("최초 읽기 실패 초안은 담당자·상태·인계 편집 뒤에도 원본을 보존한다: %s", failure => {
    const storage = memoryStorage(), projectId = `read-retry-${failure}`, key = kanbanStorageKey(projectId);
    const saved = updateKanbanStageAssignee(createDefaultProjectKanbanState(projectId), "storyboard", "기존 담당자");
    expect(saveProjectKanbanState(storage, saved)).toBe(true);
    const original = storage.getItem(key);
    const read = vi.spyOn(storage, "getItem");
    if (failure === "unavailable") read.mockImplementationOnce(() => { throw new Error("일시적 읽기 거부"); });
    else read.mockReturnValueOnce("{broken");
    const fallback = loadProjectKanbanState(storage, projectId);
    const edits = [
      updateKanbanStageAssignee({ ...fallback }, "coloring", "메모리 담당자"),
      updateKanbanStageStatus(fallback, "lineart", "in_progress"),
      handoffKanbanStage(fallback, "storyboard", "메모리 인계"),
    ];
    for (const edited of edits) {
      expect(saveProjectKanbanState(storage, edited)).toBe(false);
      expect(storage.getItem(key)).toBe(original);
    }
    const restored = loadProjectKanbanState(storage, projectId);
    expect(restored).toEqual(saved);
    expect(saveProjectKanbanState(storage, updateKanbanStageAssignee(restored, "coloring", "재읽기 후 담당자"))).toBe(true);
    expect(loadProjectKanbanState(storage, projectId).stages.storyboard.assignee).toBe("기존 담당자");
    expect(loadProjectKanbanState(storage, projectId).stages.coloring.assignee).toBe("재읽기 후 담당자");
    expect(saveProjectKanbanState(storage, { ...fallback })).toBe(false);
  });

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
    expect(JSON.parse(JSON.stringify(loadProjectKanbanState(storage, state.projectId)))).toEqual(state);
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
