// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encodeStudioFloatingSurfaceLayout } from "../studio-floating-surface";
import { createStudioFloatingSurfacePreferencesRepository } from "../studio-floating-surface-preferences-sqlite";
import { studioFloatingSurfaceSessionKey, useStudioFloatingSurfaceLayout } from "../use-studio-floating-surface-layout";

import type { StudioFloatingSurfaceLayout } from "../studio-floating-surface";
import type { StudioFloatingSurfacePreferencesRepository } from "../studio-floating-surface-preferences-sqlite";

const fallback: StudioFloatingSurfaceLayout = {
  version: 2, xRatio: 1, yRatio: 0.72, width: 400, height: 58, dock: "right",
  positionLocked: false, sizeLocked: false,
};
function memoryStore(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
    delete: vi.fn(async (key: string) => { values.delete(key); }),
  };
}
function pendingRead() {
  let complete: ((value: string | null) => void) | undefined;
  const promise = new Promise<string | null>((resolve) => { complete = resolve; });
  return { promise, resolve(value: string | null) { if (!complete) throw new Error("읽기 준비 전 완료 요청"); complete(value); } };
}

beforeEach(() => { sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("플로팅 배치의 메모리 전용 사용자 지정 출처", () => {
  it("렌더마다 같은 의미의 새 기본값을 전달해도 읽기와 렌더가 반복되지 않는다", async () => {
    const store = memoryStore(), repository = createStudioFloatingSurfacePreferencesRepository(store), factory = async () => repository;
    let renders = 0;
    const { result, rerender } = renderHook(({ defaultLayout }) => {
      const value = useStudioFloatingSurfaceLayout({ surfaceId: "surface", defaultLayout: { ...defaultLayout }, repositoryFactory: factory });
      if (++renders > 16) throw new Error("같은 기본값으로 플로팅 배치 렌더가 반복됩니다.");
      return value;
    }, { initialProps: { defaultLayout: fallback } });
    await waitFor(() => expect(result.current.layoutOverride).toBe("none"));
    for (let index = 0; index < 5; index += 1) {
      rerender({ defaultLayout: { ...fallback, yRatio: fallback.yRatio + index / 1_000_000, width: fallback.width + index / 100 } });
    }
    await act(async () => {});
    expect(result.current.layout).toEqual(fallback);
    expect(result.current.authority).toBe("sqlite-opfs");
    expect(result.current.layoutOverride).toBe("none");
    expect(store.get).toHaveBeenCalledTimes(1);
    expect(store.set).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });

  it.each([
    { xRatio: 0.25 }, { yRatio: 0.4 }, { width: 420 }, { height: 72 },
    { dock: "left" as const }, { positionLocked: true }, { sizeLocked: true },
  ])("실제 기본값 변경 %j는 새 읽기와 명시 초기화에 반영한다", async (change) => {
    const store = memoryStore(), repository = createStudioFloatingSurfacePreferencesRepository(store);
    const load = vi.fn(repository.load), factory = async () => ({ ...repository, load });
    const { result, rerender } = renderHook(({ defaultLayout }) => useStudioFloatingSurfaceLayout({ surfaceId: "surface", defaultLayout, repositoryFactory: factory }), { initialProps: { defaultLayout: fallback } });
    await waitFor(() => expect(result.current.layoutOverride).toBe("none"));
    const next = { ...fallback, ...change };
    rerender({ defaultLayout: next });
    await waitFor(() => expect(load).toHaveBeenLastCalledWith("surface", next));
    expect(store.set).not.toHaveBeenCalled();
    act(() => { result.current.resetLayout(); });
    expect(result.current.layout).toEqual(next);
    await waitFor(() => expect(store.set).toHaveBeenCalledTimes(1));
  });

  it("동일 target의 저장 없음이 확인돼야 none이며 자동 쓰기는 하지 않는다", async () => {
    const store = memoryStore(), repository = createStudioFloatingSurfacePreferencesRepository(store);
    const factory = async () => repository;
    const { result } = renderHook(() => useStudioFloatingSurfaceLayout({ surfaceId: "shell:offline-readiness", defaultLayout: fallback, repositoryFactory: factory }));
    expect(result.current.layoutOverride).toBe("checking");
    await waitFor(() => expect(result.current.layoutOverride).toBe("none"));
    expect(result.current.layout).toEqual(fallback);
    expect(store.set).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });

  it("기본값과 같은 저장 행도 해당 target의 명시 배치로 보존한다", async () => {
    const encoded = encodeStudioFloatingSurfaceLayout(fallback);
    const store = memoryStore({ "surface:shell:offline-readiness": encoded });
    const repository = createStudioFloatingSurfacePreferencesRepository(store), factory = async () => repository;
    const first = renderHook(() => useStudioFloatingSurfaceLayout({ surfaceId: "shell:offline-readiness", defaultLayout: fallback, repositoryFactory: factory }));
    const second = renderHook(() => useStudioFloatingSurfaceLayout({ surfaceId: "shell:collaboration", defaultLayout: fallback, repositoryFactory: factory }));
    await waitFor(() => expect(first.result.current.layoutOverride).toBe("present"));
    await waitFor(() => expect(second.result.current.layoutOverride).toBe("none"));
    expect(first.result.current.layout).toEqual(fallback);
    act(() => { first.result.current.setLayout(fallback); });
    expect(first.result.current.authority).toBe("sqlite-opfs");
    expect(first.result.current.layoutOverride).toBe("present");
    expect([...store.values]).toEqual([["surface:shell:offline-readiness", encoded]]);
    expect(store.set).not.toHaveBeenCalled();
  });

  it("SQLite 행이 없어도 같은 기본값의 세션 배치는 present로 유지한다", async () => {
    const surfaceId = "shell:offline-readiness", encoded = encodeStudioFloatingSurfaceLayout(fallback);
    sessionStorage.setItem(studioFloatingSurfaceSessionKey(surfaceId), encoded);
    const store = memoryStore(), repository = createStudioFloatingSurfacePreferencesRepository(store), factory = async () => repository;
    const { result } = renderHook(() => useStudioFloatingSurfaceLayout({ surfaceId, defaultLayout: fallback, repositoryFactory: factory }));
    expect(result.current.layoutOverride).toBe("present");
    await waitFor(() => expect(result.current.authority).toBe("sqlite-opfs"));
    expect(result.current.layoutOverride).toBe("present");
    expect(sessionStorage.getItem(studioFloatingSurfaceSessionKey(surfaceId))).toBe(encoded);
    expect(store.set).not.toHaveBeenCalled();
  });

  it("세션 저장소를 읽지 못하면 DB에 행이 없어도 none이라고 단정하지 않는다", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("세션 접근 불가"); });
    const repository = createStudioFloatingSurfacePreferencesRepository(memoryStore()), factory = async () => repository;
    const { result } = renderHook(() => useStudioFloatingSurfaceLayout({ surfaceId: "shell:offline-readiness", defaultLayout: fallback, repositoryFactory: factory }));
    await waitFor(() => expect(result.current.authority).toBe("sqlite-opfs"));
    expect(result.current.layoutOverride).toBe("unknown");
  });

  it("배치 읽기 오류는 unknown이며 원본 행을 고치거나 지우지 않는다", async () => {
    const store = memoryStore({ "surface:shell:offline-readiness": "{bad-json" });
    const repository = createStudioFloatingSurfacePreferencesRepository(store), factory = async () => repository;
    const { result } = renderHook(() => useStudioFloatingSurfaceLayout({ surfaceId: "shell:offline-readiness", defaultLayout: fallback, repositoryFactory: factory }));
    await waitFor(() => expect(result.current.layoutOverride).toBe("unknown"));
    expect(result.current.failure).toBe("read-failed");
    expect([...store.values]).toEqual([["surface:shell:offline-readiness", "{bad-json"]]);
    expect(store.set).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
  });

  it("repository 준비 실패도 unknown으로 남긴다", async () => {
    const factory = async (): Promise<StudioFloatingSurfacePreferencesRepository> => { throw new Error("저장소 준비 실패"); };
    const { result } = renderHook(() => useStudioFloatingSurfaceLayout({ surfaceId: "shell:offline-readiness", defaultLayout: fallback, repositoryFactory: factory }));
    await waitFor(() => expect(result.current.layoutOverride).toBe("unknown"));
    expect(result.current.failure).toBe("storage-unavailable");
  });

  it("지연 읽기 중 기본값을 명시 선택해도 present가 되고 불필요한 저장은 없다", async () => {
    const delayed = pendingRead(), store = memoryStore();
    const repository = createStudioFloatingSurfacePreferencesRepository({ ...store, get: async () => delayed.promise });
    const save = vi.spyOn(store, "set"), factory = async () => repository;
    const { result } = renderHook(() => useStudioFloatingSurfaceLayout({ surfaceId: "shell:offline-readiness", defaultLayout: fallback, repositoryFactory: factory }));
    act(() => { result.current.setLayout(fallback); });
    expect(result.current.layoutOverride).toBe("present");
    expect(result.current.authority).toBe("session-only");
    await act(async () => { delayed.resolve(encodeStudioFloatingSurfaceLayout({ ...fallback, xRatio: 0.1, dock: "free" })); });
    expect(result.current.layout).toEqual(fallback);
    expect(result.current.layoutOverride).toBe("present");
    expect(result.current.authority).toBe("session-only");
    expect(save).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });

  it("사용자 이동은 즉시 present이며 저장 실패 뒤에는 배치를 유지하고 unknown으로 남긴다", async () => {
    const store = memoryStore();
    const repository = createStudioFloatingSurfacePreferencesRepository({ ...store, async set() { throw new Error("쓰기 실패"); } });
    const factory = async () => repository;
    const { result } = renderHook(() => useStudioFloatingSurfaceLayout({ surfaceId: "shell:offline-readiness", defaultLayout: fallback, repositoryFactory: factory }));
    await waitFor(() => expect(result.current.layoutOverride).toBe("none"));
    const moved = { ...fallback, xRatio: 0.25, dock: "free" as const, positionLocked: true };
    act(() => { result.current.setLayout(moved); });
    expect(result.current.layoutOverride).toBe("present");
    await waitFor(() => expect(result.current.failure).toBe("write-failed"));
    expect(result.current.layoutOverride).toBe("unknown");
    expect(result.current.layout).toEqual(moved);
  });

  it("새 surface는 이전 none을 노출하지 않고 새 읽기 전에는 checking으로 남긴다", async () => {
    const oldRead = pendingRead(), newRead = pendingRead(), store = memoryStore();
    const repository = createStudioFloatingSurfacePreferencesRepository({ ...store, get: async (key) => key === "surface:old" ? oldRead.promise : newRead.promise });
    const factory = async () => repository;
    const observed: string[] = [];
    const { result, rerender } = renderHook(({ surfaceId }) => {
      const value = useStudioFloatingSurfaceLayout({ surfaceId, defaultLayout: fallback, repositoryFactory: factory });
      observed.push(`${surfaceId}:${value.layoutOverride}`);
      return value;
    }, { initialProps: { surfaceId: "old" } });
    await act(async () => { oldRead.resolve(null); });
    expect(result.current.layoutOverride).toBe("none");
    rerender({ surfaceId: "new" });
    expect(observed.find((value) => value.startsWith("new:"))).toBe("new:checking");
    expect(result.current.layoutOverride).toBe("checking");
    await act(async () => { newRead.resolve(null); });
    expect(result.current.layoutOverride).toBe("none");
    expect(result.current.layout).toEqual(fallback);
  });

  it("같은 repository에서 이전 surface의 늦은 읽기가 새 surface를 덮지 않는다", async () => {
    const delayed = pendingRead(), store = memoryStore();
    const repository = createStudioFloatingSurfacePreferencesRepository({ ...store, get: async (key) => key === "surface:old" ? delayed.promise : null });
    const factory = async () => repository;
    const { result, rerender } = renderHook(({ surfaceId }) => useStudioFloatingSurfaceLayout({ surfaceId, defaultLayout: fallback, repositoryFactory: factory }), { initialProps: { surfaceId: "old" } });
    rerender({ surfaceId: "new" });
    await waitFor(() => expect(result.current.layoutOverride).toBe("none"));
    await act(async () => { delayed.resolve(encodeStudioFloatingSurfaceLayout({ ...fallback, xRatio: 0.1 })); });
    expect(result.current.layoutOverride).toBe("none");
    expect(result.current.layout).toEqual(fallback);
    expect(sessionStorage.length).toBe(0);
  });

  it("sessionKey 전환은 이전 세션 배치를 새 target의 기본값으로 취급하지 않는다", async () => {
    const saved = { ...fallback, xRatio: 0.2, dock: "free" as const };
    sessionStorage.setItem("session-a", encodeStudioFloatingSurfaceLayout(saved));
    const repository = createStudioFloatingSurfacePreferencesRepository(memoryStore()), factory = async () => repository;
    const { result, rerender } = renderHook(({ sessionKey }) => useStudioFloatingSurfaceLayout({ surfaceId: "surface", sessionKey, defaultLayout: fallback, repositoryFactory: factory }), { initialProps: { sessionKey: "session-a" } });
    await waitFor(() => expect(result.current.authority).toBe("sqlite-opfs"));
    expect(result.current.layout).toEqual(saved);
    rerender({ sessionKey: "session-b" });
    await waitFor(() => expect(result.current.layoutOverride).toBe("none"));
    expect(result.current.layout).toEqual(fallback);
  });

  it("factory 전환 뒤 예전 hydrate가 새 repository의 명시 배치를 덮지 않는다", async () => {
    const delayed = pendingRead(), original = createStudioFloatingSurfacePreferencesRepository({ ...memoryStore(), get: async () => delayed.promise });
    const saved = { ...fallback, xRatio: 0.3, dock: "free" as const };
    const next = createStudioFloatingSurfacePreferencesRepository(memoryStore({ "surface:surface": encodeStudioFloatingSurfaceLayout(saved) }));
    const firstFactory = async () => original, nextFactory = async () => next;
    const observations: string[] = [];
    const { result, rerender } = renderHook(({ factory }) => {
      const value = useStudioFloatingSurfaceLayout({ surfaceId: "surface", defaultLayout: fallback, repositoryFactory: factory });
      observations.push(`${factory === nextFactory ? "next" : "old"}:${value.layoutOverride}`);
      return value;
    }, { initialProps: { factory: firstFactory } });
    rerender({ factory: nextFactory });
    expect(observations.find((value) => value.startsWith("next:"))).toBe("next:checking");
    await waitFor(() => expect(result.current.layoutOverride).toBe("present"));
    await act(async () => { delayed.resolve(null); });
    expect(result.current.layoutOverride).toBe("present");
    expect(result.current.layout).toEqual(saved);
  });

  it("사용자 조작을 저장해도 출처 메타데이터는 기존 저장 payload에 들어가지 않는다", async () => {
    const store = memoryStore(), repository = createStudioFloatingSurfacePreferencesRepository(store), factory = async () => repository;
    const { result } = renderHook(() => useStudioFloatingSurfaceLayout({ surfaceId: "surface", defaultLayout: fallback, repositoryFactory: factory }));
    await waitFor(() => expect(result.current.layoutOverride).toBe("none"));
    act(() => { result.current.setLayout({ ...fallback, yRatio: 0.4 }); });
    await waitFor(() => expect(store.set).toHaveBeenCalledTimes(1));
    const raw = store.values.get("surface:surface");
    if (!raw) throw new Error("저장 행이 없습니다.");
    expect(Object.keys(JSON.parse(raw))).toEqual(["version", "xRatio", "yRatio", "width", "height", "dock", "positionLocked", "sizeLocked"]);
    expect(raw).not.toContain("layoutOverride");
    expect(result.current.layoutOverride).toBe("present");
  });

  it("이전 factory의 늦은 저장 실패는 새 session의 배치·출처·오류에 적용하지 않는다", async () => {
    const delayed = pendingRead(), write = vi.fn(async () => { await delayed.promise; throw new Error("이전 쓰기 실패"); });
    const previous = createStudioFloatingSurfacePreferencesRepository({ ...memoryStore(), set: write });
    const next = createStudioFloatingSurfacePreferencesRepository(memoryStore());
    const previousFactory = async () => previous, nextFactory = async () => next;
    const { result, rerender } = renderHook(({ sessionKey, factory }) => useStudioFloatingSurfaceLayout({ surfaceId: "surface", sessionKey, defaultLayout: fallback, repositoryFactory: factory }), { initialProps: { sessionKey: "previous", factory: previousFactory } });
    await waitFor(() => expect(result.current.layoutOverride).toBe("none"));
    act(() => { result.current.setLayout({ ...fallback, yRatio: 0.4 }); });
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    rerender({ sessionKey: "next", factory: nextFactory });
    await waitFor(() => expect(result.current.layoutOverride).toBe("none"));
    await act(async () => { delayed.resolve(null); });
    expect(result.current.layout).toEqual(fallback);
    expect(result.current.layoutOverride).toBe("none");
    expect(result.current.failure).toBeNull();
    expect(result.current.authority).toBe("sqlite-opfs");
  });

  it("로컬 저장 성공 뒤 늦은 초기 읽기 실패가 권위·오류·출처·배치를 덮지 않는다", async () => {
    const delayed = pendingRead(), store = memoryStore();
    let reads = 0;
    const get = vi.fn(async (key: string) => {
      if (++reads === 1) { await delayed.promise; throw new Error("지연된 초기 읽기 실패"); }
      return store.values.get(key) ?? null;
    });
    const repository = createStudioFloatingSurfacePreferencesRepository({ ...store, get }), factory = async () => repository;
    const { result } = renderHook(() => useStudioFloatingSurfaceLayout({ surfaceId: "surface", defaultLayout: fallback, repositoryFactory: factory }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    const moved = { ...fallback, yRatio: 0.4 };
    act(() => { result.current.setLayout(moved); });
    await waitFor(() => expect(result.current.authority).toBe("sqlite-opfs"));
    expect(result.current.failure).toBeNull();
    await act(async () => { delayed.resolve(null); });
    expect(result.current.authority).toBe("sqlite-opfs");
    expect(result.current.failure).toBeNull();
    expect(result.current.layoutOverride).toBe("present");
    expect(result.current.layout).toEqual(moved);
    expect(store.values.get("surface:surface")).toBe(encodeStudioFloatingSurfaceLayout(moved));
  });
});
