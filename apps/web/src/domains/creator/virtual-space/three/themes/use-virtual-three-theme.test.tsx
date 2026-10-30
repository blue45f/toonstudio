// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useVirtualThreeTheme } from "./use-virtual-three-theme";
import { virtualThreeThemeStorageKey, writeVirtualThreeThemeChoice, type VirtualThreeThemeStorage } from "./virtual-three-theme-store";

afterEach(cleanup);

function memoryStorage() {
  const values = new Map<string, string>();
  let blocked = false;
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      if (blocked) throw new Error("quota exceeded");
      values.set(key, value);
    }),
  } satisfies VirtualThreeThemeStorage;
  return { storage, values, blockWrites: (value: boolean) => { blocked = value; } };
}

describe("공간별 3D 테마 hook", () => {
  it("서버 render는 저장소를 열거나 기본값을 자동 저장하지 않는다", () => {
    const acquire = vi.fn(() => memoryStorage().storage);
    function ServerRead() {
      const value = useVirtualThreeTheme("space/ssr", acquire);
      return <output>{[String(value.hydrated), String(value.selection), String(value.persistedSelection)].join(":")}</output>;
    }
    expect(renderToString(<ServerRead />)).toContain("false:null:null");
    expect(acquire).not.toHaveBeenCalled();
  });

  it("inline storage factory와 같은 scope의 rerender가 hydration 반복이나 쓰기를 만들지 않는다", () => {
    const { storage } = memoryStorage();
    const view = renderHook((props: { scope: string; revision: number }) => useVirtualThreeTheme(props.scope, () => storage), {
      initialProps: { scope: "space/alpha", revision: 0 },
    });
    expect(view.result.current.hydrated).toBe(true);
    expect(view.result.current.selection).toBeNull();
    const reads = storage.getItem.mock.calls.length;
    view.rerender({ scope: "space/alpha", revision: 1 });
    view.rerender({ scope: "space/alpha", revision: 2 });
    expect(storage.getItem).toHaveBeenCalledTimes(reads);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("scope를 바꾸는 첫 render에 이전 공간의 선택을 노출하지 않는다", () => {
    const { storage } = memoryStorage();
    writeVirtualThreeThemeChoice(storage, "space/alpha", "parkbotanical");
    writeVirtualThreeThemeChoice(storage, "space/beta", "gothicarchive");
    storage.setItem.mockClear();
    const seen: Array<{ scope: string; hydrated: boolean; selected: string | null; persisted: string | null }> = [];
    const view = renderHook(({ scope }: { scope: string }) => {
      const value = useVirtualThreeTheme(scope, () => storage);
      seen.push({ scope, hydrated: value.hydrated, selected: value.selection?.themeId ?? null, persisted: value.persistedSelection?.themeId ?? null });
      return value;
    }, { initialProps: { scope: "space/alpha" } });
    expect(view.result.current.selection?.themeId).toBe("parkbotanical");
    view.rerender({ scope: "space/beta" });
    expect(seen.find(value => value.scope === "space/beta")).toEqual({ scope: "space/beta", hydrated: false, selected: null, persisted: null });
    expect(view.result.current.selection?.themeId).toBe("gothicarchive");
    expect(view.result.current.persistedSelection?.themeId).toBe("gothicarchive");
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("저장 실패 뒤 현재 선택과 마지막 durable 선택을 분리하고 재시도 성공 때만 저장됨을 바꾼다", () => {
    const { storage, blockWrites } = memoryStorage();
    writeVirtualThreeThemeChoice(storage, "space/alpha", "creator-campus");
    storage.setItem.mockClear();
    const { result } = renderHook(() => useVirtualThreeTheme("space/alpha", () => storage));
    blockWrites(true);
    act(() => {
      expect(result.current.selectTheme("sflab")).toMatchObject({ accepted: true, persisted: false });
    });
    expect(result.current.selection?.themeId).toBe("sflab");
    expect(result.current.persistedSelection?.themeId).toBe("creator-campus");
    expect(result.current.persistence).toBe("memory-only");
    expect(result.current.notice?.code).toBe("storage-write-failed");
    blockWrites(false);
    act(() => { result.current.selectTheme("sflab"); });
    expect(result.current.persistedSelection?.themeId).toBe("sflab");
    expect(result.current.persistence).toBe("browser-local");
    expect(result.current.notice).toBeNull();
    expect(storage.setItem).toHaveBeenCalledTimes(2);
  });

  it("unknown 선택은 현재·저장된 선택을 바꾸지 않고 오류만 알린다", () => {
    const { storage } = memoryStorage();
    writeVirtualThreeThemeChoice(storage, "space/alpha", "creator-campus");
    storage.setItem.mockClear();
    const { result } = renderHook(() => useVirtualThreeTheme("space/alpha", () => storage));
    act(() => { expect(result.current.selectTheme("unlisted-theme").accepted).toBe(false); });
    expect(result.current.selection?.themeId).toBe("creator-campus");
    expect(result.current.persistedSelection?.themeId).toBe("creator-campus");
    expect(result.current.notice?.code).toBe("unknown-theme");
    expect(storage.setItem).not.toHaveBeenCalled();
    act(() => { result.current.dismissNotice(); });
    expect(result.current.notice).toBeNull();
  });

  it("자체 key와 clear 이벤트만 다시 읽고 unmount 후 구독을 해제한다", () => {
    const { storage, values } = memoryStorage();
    const scope = "space/alpha";
    const view = renderHook(() => useVirtualThreeTheme(scope, () => storage));
    const initialReads = storage.getItem.mock.calls.length;
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: "unrelated-control-storage" })); });
    expect(storage.getItem).toHaveBeenCalledTimes(initialReads);
    writeVirtualThreeThemeChoice(storage, scope, "cafefood");
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: virtualThreeThemeStorageKey(scope) })); });
    expect(view.result.current.persistedSelection?.themeId).toBe("cafefood");
    values.delete(virtualThreeThemeStorageKey(scope));
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: null })); });
    expect(view.result.current.selection).toBeNull();
    expect(view.result.current.persistedSelection).toBeNull();
    view.unmount();
    const unmountedReads = storage.getItem.mock.calls.length;
    window.dispatchEvent(new StorageEvent("storage", { key: virtualThreeThemeStorageKey(scope) }));
    expect(storage.getItem).toHaveBeenCalledTimes(unmountedReads);
  });

  it("스토리지 접근 자체가 거부되어도 알림과 현재 탭 선택을 유지한다", () => {
    const acquire = () => { throw new Error("storage access denied"); };
    const { result } = renderHook(() => useVirtualThreeTheme("space/alpha", acquire));
    expect(result.current.hydrated).toBe(true);
    expect(result.current.notice?.code).toBe("storage-unavailable");
    act(() => { result.current.selectTheme("fantasyguild"); });
    expect(result.current.selection?.themeId).toBe("fantasyguild");
    expect(result.current.persistedSelection).toBeNull();
    expect(result.current.notice?.code).toBe("storage-write-failed");
  });
});
