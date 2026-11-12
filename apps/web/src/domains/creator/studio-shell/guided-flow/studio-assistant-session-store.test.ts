// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearStudioAssistantSessionState,
  readStudioAssistantSessionState,
  writeStudioAssistantSessionState,
  type StudioAssistantSessionSnapshot,
} from "./studio-assistant-session-store";

const draft: StudioAssistantSessionSnapshot = Object.freeze({ prompt: "다음 장면을 이어 쓰기", openAiMode: "script-to-cuts", lastResult: null });
const key = "toonstudio:assistant-draft:v1:project-a";
function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => { values.set(name, value); },
    removeItem: (name) => { values.delete(name); },
    clear: () => { values.clear(); },
  };
}
function denyDefaultStorage() {
  return vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
    throw new DOMException("session storage blocked", "SecurityError");
  });
}
beforeEach(() => window.sessionStorage.clear());
afterEach(() => { vi.restoreAllMocks(); window.sessionStorage.clear(); });

describe("도우미 탭 초안 저장소 접근 거부", () => {
  it("기본 getter 거부는 읽기 없음/쓰기·정리 불가로 처리하고 입력 객체를 보존한다", () => {
    const getter = denyDefaultStorage();
    expect(readStudioAssistantSessionState("project-a")).toBeNull();
    expect(writeStudioAssistantSessionState("project-a", draft)).toBeUndefined();
    expect(clearStudioAssistantSessionState("project-a")).toBeUndefined();
    expect(getter).toHaveBeenCalledTimes(3);
    expect(draft).toEqual({ prompt: "다음 장면을 이어 쓰기", openAiMode: "script-to-cuts", lastResult: null });
  });

  it("명시한 null은 기본 저장소에 접근하지 않으며 이전 저장도 지우지 않는다", () => {
    const original = window.sessionStorage;
    writeStudioAssistantSessionState("project-a", draft, original);
    const stored = original.getItem(key);
    const getter = denyDefaultStorage();
    expect(readStudioAssistantSessionState("project-a", null)).toBeNull();
    expect(writeStudioAssistantSessionState("project-a", { ...draft, prompt: "다른 입력" }, null)).toBeUndefined();
    expect(clearStudioAssistantSessionState("project-a", null)).toBeUndefined();
    expect(original.getItem(key)).toBe(stored);
    expect(getter).not.toHaveBeenCalled();
  });

  it("명시한 저장소는 기본 getter가 거부돼도 작품별 초안과 길이 제한을 유지한다", () => {
    const storage = memoryStorage();
    const getter = denyDefaultStorage();
    writeStudioAssistantSessionState("project-a", { ...draft, prompt: "가".repeat(6_001) }, storage);
    writeStudioAssistantSessionState("project-b", draft, storage);
    expect(readStudioAssistantSessionState("project-a", storage)?.prompt).toHaveLength(6_000);
    expect(readStudioAssistantSessionState("project-b", storage)).toEqual(draft);
    clearStudioAssistantSessionState("project-a", storage);
    expect(readStudioAssistantSessionState("project-a", storage)).toBeNull();
    expect(readStudioAssistantSessionState("project-b", storage)).toEqual(draft);
    expect(getter).not.toHaveBeenCalled();
  });

  it("읽기 메서드가 거부돼도 현재 입력을 복원된 저장 기록으로 가장하지 않는다", () => {
    const storage = memoryStorage();
    vi.spyOn(storage, "getItem").mockImplementation(() => { throw new DOMException("read blocked", "SecurityError"); });
    expect(readStudioAssistantSessionState("project-a", storage)).toBeNull();
  });

  it("쓰기와 정리 거부는 이전 저장본을 보존하고 새 입력을 변경하지 않는다", () => {
    const storage = memoryStorage();
    writeStudioAssistantSessionState("project-a", draft, storage);
    const stored = storage.getItem(key);
    const next = Object.freeze({ ...draft, prompt: "저장되지 않은 새 입력" });
    vi.spyOn(storage, "setItem").mockImplementation(() => { throw new DOMException("quota", "QuotaExceededError"); });
    vi.spyOn(storage, "removeItem").mockImplementation(() => { throw new DOMException("remove blocked", "SecurityError"); });
    expect(writeStudioAssistantSessionState("project-a", next, storage)).toBeUndefined();
    expect(clearStudioAssistantSessionState("project-a", storage)).toBeUndefined();
    expect(storage.getItem(key)).toBe(stored);
    expect(readStudioAssistantSessionState("project-a", storage)).toEqual(draft);
    expect(next.prompt).toBe("저장되지 않은 새 입력");
  });
});
