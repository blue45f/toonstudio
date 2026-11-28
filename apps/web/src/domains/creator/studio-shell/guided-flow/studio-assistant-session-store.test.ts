// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearStudioAssistantSessionState,
  completeStudioAssistantRequest,
  prepareStudioAssistantRequest,
  readStudioAssistantSessionState,
  studioAssistantSessionKey,
  writeStudioAssistantSessionState,
  type StudioAssistantSessionSnapshot,
} from "./studio-assistant-session-store";

const draft: StudioAssistantSessionSnapshot = Object.freeze({ prompt: "다음 장면을 이어 쓰기", openAiMode: "script-to-cuts", lastResult: null });
const key = studioAssistantSessionKey("project-a");
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

it("같은 작품에서도 게스트와 두 계정의 저장·조회·정리를 각각 격리한다", () => {
  const storage = memoryStorage();
  const projectId = "같은-작품";
  const legacyKey = `toonstudio:assistant-draft:v1:${projectId}`;
  const legacyRecord = JSON.stringify({ ...draft, prompt: "이전 로그인 원고" });
  storage.setItem(legacyKey, legacyRecord);

  const guestDraft = { ...draft, prompt: "새 게스트 원고" };
  const firstDraft = { ...draft, prompt: "첫 작가 원고" };
  const secondDraft = { ...draft, prompt: "둘째 작가 원고" };
  expect(readStudioAssistantSessionState(projectId, storage)).toBeNull();
  expect(readStudioAssistantSessionState(projectId, storage, "writer-a")).toBeNull();
  writeStudioAssistantSessionState(projectId, guestDraft, storage);
  writeStudioAssistantSessionState(projectId, firstDraft, storage, "writer-a");
  writeStudioAssistantSessionState(projectId, secondDraft, storage, "writer-b");

  expect(readStudioAssistantSessionState(projectId, storage, "writer-a")).toEqual(firstDraft);
  clearStudioAssistantSessionState(projectId, storage, "writer-a");
  expect(readStudioAssistantSessionState(projectId, storage, "writer-a")).toBeNull();
  expect(readStudioAssistantSessionState(projectId, storage, "writer-b")).toEqual(secondDraft);
  expect(readStudioAssistantSessionState(projectId, storage)).toEqual(guestDraft);
  expect(storage.getItem(legacyKey)).toBe(legacyRecord);
});

describe("원고별 미확정 요청", () => {
  const project = "project-a";
  const owner = "writer-a";
  const ownerKey = studioAssistantSessionKey(project, owner);
  const storedDraft = () => readStudioAssistantSessionState(project, undefined, owner);

  function ready(body: string, confirmedExpiredKey?: string) {
    const prepared = prepareStudioAssistantRequest(project, owner, draft, body, confirmedExpiredKey);
    if (prepared.kind !== "ready") throw new Error(`준비하지 못한 테스트 요청: ${prepared.kind}`);
    return prepared.pending;
  }

  it("v2의 기존 단일 키를 재사용하고 본문과 신뢰할 수 없는 표식 필드는 저장하지 않는다", () => {
    const body = "대사 교정에 쓴 합성 본문";
    const original = ready(body);
    const legacy = { ...draft, pendingRequest: { ...original, untrustedManuscript: "표식에 넣을 수 없는 원고" } };
    window.sessionStorage.setItem(ownerKey, JSON.stringify(legacy));
    expect(ready(body)).toEqual(original);

    const second = ready("다른 작업의 합성 본문");
    expect(ready(body)).toEqual(original);
    const pending = storedDraft()?.pendingRequests;
    expect(pending).toHaveLength(2);
    expect(pending).toEqual(expect.arrayContaining([original, second]));
    const serialized = window.sessionStorage.getItem(ownerKey);
    expect(serialized).not.toBeNull();
    expect(serialized).not.toContain(body);
    expect(serialized).not.toContain("표식에 넣을 수 없는 원고");

    window.sessionStorage.setItem(key, JSON.stringify(legacy));
    expect(readStudioAssistantSessionState(project)?.pendingRequests).toBeUndefined();
    writeStudioAssistantSessionState(project, draft);
    expect(window.sessionStorage.getItem(key)).not.toContain(original.key);
    expect(readStudioAssistantSessionState(project, undefined, "writer-b")).toBeNull();
    window.sessionStorage.setItem(ownerKey, JSON.stringify({
      ...draft, pendingRequest: { ...original, requestHash: "잘못된 해시" },
    }));
    expect(readStudioAssistantSessionState(project, undefined, owner)).toEqual(draft);
  });

  it("읽을 수 없는 표식이 섞인 저장본은 새로 쓰거나 유효한 키만 골라 보내지 않는다", () => {
    const valid = ready("기존 원고");
    const serialized = JSON.stringify({
      ...draft, pendingRequests: [valid, { ...valid, requestHash: "손상된 해시" }],
    });
    window.sessionStorage.setItem(ownerKey, serialized);
    expect(prepareStudioAssistantRequest(project, owner, draft, "기존 원고").kind).toBe("storage-unavailable");
    expect(prepareStudioAssistantRequest(project, owner, draft, "새 원고").kind).toBe("storage-unavailable");
    writeStudioAssistantSessionState(project, { ...draft, prompt: "새 초안" }, undefined, owner);
    clearStudioAssistantSessionState(project, undefined, owner);
    completeStudioAssistantRequest(project, owner, valid);
    expect(window.sessionStorage.getItem(ownerKey)).toBe(serialized);
  });

  it("오래된 초안의 쓰기·지우기가 미확정 키를 없애거나 완료된 키를 되살리지 않는다", () => {
    const first = ready("원고 A");
    const staleDraft = storedDraft();
    if (!staleDraft) throw new Error("저장된 테스트 초안이 없습니다.");
    const second = ready("원고 B");
    writeStudioAssistantSessionState(project, staleDraft, undefined, owner);
    clearStudioAssistantSessionState(project, undefined, owner);
    expect(ready("원고 A")).toEqual(first);
    expect(ready("원고 B")).toEqual(second);
    expect(storedDraft()?.pendingRequests).toEqual(expect.arrayContaining([first, second]));

    completeStudioAssistantRequest(project, owner, { ...first, requestHash: second.requestHash });
    expect(storedDraft()?.pendingRequests).toHaveLength(2);
    completeStudioAssistantRequest(project, owner, second);
    writeStudioAssistantSessionState(project, { ...staleDraft, pendingRequests: [first, second] }, undefined, owner);
    expect(storedDraft()?.pendingRequests).toEqual([first]);
    expect(ready("원고 A")).toEqual(first);
    expect(ready("원고 B").key).not.toBe(second.key);
  });

  it("보관 한도에 도달하면 새 원고만 막고 만료된 키도 명시적 생성 전까지 남긴다", () => {
    const now = vi.spyOn(Date, "now");
    const issuedAt = 1_800_000_001_000;
    now.mockReturnValue(issuedAt);
    const entries = Array.from({ length: 32 }, (_, index) => ready(`합성 원고 ${index}`));
    const [first, second] = entries;
    if (!first || !second) throw new Error("보관 한도 테스트 키가 없습니다.");
    expect(prepareStudioAssistantRequest(project, owner, draft, "33번째 원고").kind).toBe("pending-limit");
    expect(prepareStudioAssistantRequest(project, "writer-b", draft, "합성 원고 0").kind).toBe("ready");
    completeStudioAssistantRequest(project, "writer-b", first);
    expect(storedDraft()?.pendingRequests).toHaveLength(32);
    expect(ready("합성 원고 0")).toEqual(first);

    now.mockReturnValue(issuedAt + 30 * 60 * 1_000);
    expect(prepareStudioAssistantRequest(project, owner, draft, "33번째 원고").kind).toBe("pending-limit");
    expect(prepareStudioAssistantRequest(project, owner, draft, "합성 원고 0")).toMatchObject({ kind: "expired", key: first.key });
    const replacement = ready("합성 원고 0", first.key);
    expect(replacement.key).not.toBe(first.key);
    expect(replacement.requestHash).toBe(first.requestHash);
    completeStudioAssistantRequest(project, owner, first);
    expect(ready("합성 원고 0")).toEqual(replacement);
    expect(storedDraft()?.pendingRequests).toHaveLength(32);
    completeStudioAssistantRequest(project, owner, second);
    const next = ready("33번째 원고");
    const pending = storedDraft()?.pendingRequests;
    expect(pending).toHaveLength(32);
    expect(pending).toEqual(expect.arrayContaining([replacement, next, ...entries.slice(2)]));
  });
});

it("소유 범위가 정해진 저장본에서 구형 입력 필드와 유효한 결과를 복원한다", () => {
  const storage = memoryStorage();
  const lastResult = {
    provider: "openai",
    model: "mock-model",
    result: {
      mode: "continuity-plot-audit",
      data: {
        overallConsistencyScore: 90,
        summary: "흐름 점검",
        issues: [{
          severity: "tip",
          category: "소품",
          locationHint: "첫 장면",
          conflictDetail: "반복되는 소품의 모양을 확인하세요.",
          fixSuggestion: "등장 장면의 소품을 같은 모양으로 그리세요.",
        }],
      },
    },
    privacy: { storeData: false, piiRedactedCount: 0 },
    quota: { remainingDaily: 1, dailyLimit: 2 },
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
  const stored = { inputText: draft.prompt, mode: draft.openAiMode, lastResult };
  storage.setItem(key, JSON.stringify(stored));
  expect(readStudioAssistantSessionState("project-a", storage)).toEqual({ ...draft, lastResult });

  const submittedPrompt = "이 결과를 요청할 때 보낸 문장";
  const restored = readStudioAssistantSessionState("project-a", storage);
  if (!restored) throw new Error("저장된 요청이 없습니다.");
  writeStudioAssistantSessionState("project-a", { ...restored, submittedPrompt }, storage);
  expect(readStudioAssistantSessionState("project-a", storage)).toEqual({ ...draft, lastResult, submittedPrompt });

  const escapedDraft = "\u0000".repeat(6_000);
  const escapedSubmittedPrompt = "\u0001".repeat(6_000);
  const escapedSnapshot = { ...restored, prompt: escapedDraft, submittedPrompt: escapedSubmittedPrompt };
  writeStudioAssistantSessionState("project-a", escapedSnapshot, storage);
  expect(storage.getItem(key)?.length).toBeGreaterThan(64_000);
  expect(readStudioAssistantSessionState("project-a", storage)).toEqual(escapedSnapshot);

  storage.setItem(key, JSON.stringify({ ...stored, submittedPrompt: "가".repeat(6_001) }));
  expect(readStudioAssistantSessionState("project-a", storage)).toEqual({ ...draft, lastResult });

  const brokenResult = { ...lastResult.result, data: { ...lastResult.result.data, issues: [null] } };
  storage.setItem(key, JSON.stringify({
    ...stored,
    lastResult: { ...lastResult, result: brokenResult },
    submittedPrompt,
  }));
  expect(readStudioAssistantSessionState("project-a", storage)).toEqual(draft);
});
