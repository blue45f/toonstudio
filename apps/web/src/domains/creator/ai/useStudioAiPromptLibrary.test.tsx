// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addPromptLibraryEntry,
  removePromptLibraryEntry,
  type StudioAiPromptLibraryEntry,
} from "./studio-ai-prompt-library";
import type { StudioAiPromptLibraryRepository } from "./studio-ai-prompt-library-storage";
import { useStudioAiPromptLibrary } from "./useStudioAiPromptLibrary";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { resolve, promise };
}

const entry = (id: string, usedAt = 10): StudioAiPromptLibraryEntry => ({
  id,
  text: `프롬프트 ${id}`,
  kind: "prompt",
  usedAt,
});

type Entries = readonly StudioAiPromptLibraryEntry[];

function repository(loaded: Promise<Entries> | Entries = []) {
  return {
    load: vi.fn<() => Promise<Entries>>(async () => loaded),
    save: vi.fn<(entries: Entries) => Promise<void>>(async () => undefined),
  } satisfies StudioAiPromptLibraryRepository;
}

describe("useStudioAiPromptLibrary", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("DB 목록을 불러오고 브라우저 KV 를 건드리지 않는다", async () => {
    const localWrite = vi.spyOn(Storage.prototype, "setItem");
    const repo = repository([entry("a")]);
    const { result } = renderHook(() => useStudioAiPromptLibrary(async () => repo));
    expect(result.current.persistenceState).toBe("loading");
    await waitFor(() => expect(result.current.persistenceState).toBe("ready"));
    expect(result.current.entries).toEqual([entry("a")]);
    expect(repo.save).not.toHaveBeenCalled();
    expect(localWrite).not.toHaveBeenCalled();
  });

  it("불러오기 전 편집을 불러온 목록 위에 다시 적용한 뒤 한 번 저장한다", async () => {
    const read = deferred<Entries>();
    const repo = repository(read.promise);
    const { result } = renderHook(() => useStudioAiPromptLibrary(async () => repo));
    const clock = vi.spyOn(Date, "now").mockReturnValue(50);
    act(() => result.current.apply((entries, now) => addPromptLibraryEntry(entries, { text: "새 지시", kind: "prompt" }, now).entries));
    // 다시 적용할 때는 편집 이벤트 시각을 그대로 쓴다(불러온 뒤의 시계가 아니다).
    clock.mockReturnValue(9_999);
    expect(repo.save).not.toHaveBeenCalled();
    await act(async () => read.resolve([entry("stored")]));
    await waitFor(() => expect(repo.save).toHaveBeenCalledTimes(1));
    const saved = repo.save.mock.calls[0]?.[0] ?? [];
    expect(saved.map((item) => item.text)).toEqual(["새 지시", "프롬프트 stored"]);
    expect(saved[0]?.usedAt).toBe(50);
    expect(result.current.entries).toEqual(saved);
    await waitFor(() => expect(result.current.persistenceState).toBe("ready"));
  });

  it("불러온 뒤의 편집마다 최신 목록을 저장한다", async () => {
    const repo = repository([entry("a"), entry("b")]);
    const { result } = renderHook(() => useStudioAiPromptLibrary(async () => repo));
    await waitFor(() => expect(result.current.persistenceState).toBe("ready"));
    act(() => result.current.apply((entries) => removePromptLibraryEntry(entries, "a")));
    await waitFor(() => expect(repo.save).toHaveBeenCalledTimes(1));
    expect(repo.save.mock.calls[0]?.[0]).toEqual([entry("b")]);
    await waitFor(() => expect(result.current.persistenceState).toBe("ready"));
  });

  it("DB 를 열지 못하면 화면 안에서만 유지하고 저장을 시도하지 않는다", async () => {
    const localWrite = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() => useStudioAiPromptLibrary(async () => {
      throw new Error("OPFS unavailable");
    }));
    await waitFor(() => expect(result.current.persistenceState).toBe("error"));
    act(() => result.current.apply((entries) => addPromptLibraryEntry(entries, { text: "세션 지시", kind: "prompt" }, 5).entries));
    expect(result.current.entries.map((item) => item.text)).toEqual(["세션 지시"]);
    expect(localWrite).not.toHaveBeenCalled();
  });

  it("저장 실패를 알리고 다음 편집에서 다시 저장한다", async () => {
    const repo = repository([entry("a")]);
    repo.save.mockRejectedValueOnce(new Error("quota"));
    const { result } = renderHook(() => useStudioAiPromptLibrary(async () => repo));
    await waitFor(() => expect(result.current.persistenceState).toBe("ready"));
    act(() => result.current.apply((entries) => removePromptLibraryEntry(entries, "a")));
    await waitFor(() => expect(result.current.persistenceState).toBe("error"));
    expect(result.current.entries).toEqual([]);
    act(() => result.current.apply((entries) => addPromptLibraryEntry(entries, { text: "다시", kind: "prompt" }, 7).entries));
    await waitFor(() => expect(repo.save).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.persistenceState).toBe("ready"));
    expect((repo.save.mock.calls[1]?.[0] ?? []).map((item) => item.text)).toEqual(["다시"]);
  });
});
