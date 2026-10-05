import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  NEXTGEN_LAB_DEFAULTS,
  NEXTGEN_LAB_STORAGE_KEY,
  getNextgenLabSettingsSnapshot,
  subscribeNextgenLabSettings,
  updateNextgenLabSettings,
} from "./nextgen-lab-settings";

// 이 repo의 lib 테스트 환경에는 localStorage 전역이 없다 — 기존 테스트들과 같은
// 인메모리 스텁 패턴으로 대체한다 (chunk-load-recovery.test.ts 선례).
function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
}

const storage = createMemoryStorage();
vi.stubGlobal("localStorage", storage);

beforeEach(() => {
  storage.clear();
  updateNextgenLabSettings({ ...NEXTGEN_LAB_DEFAULTS });
  storage.clear();
});

describe("nextgen-lab-settings", () => {
  it("기본값은 전부 켜짐이다", () => {
    expect(getNextgenLabSettingsSnapshot()).toEqual(NEXTGEN_LAB_DEFAULTS);
  });

  it("부분 갱신은 나머지를 유지하고 localStorage에 남는다", () => {
    const next = updateNextgenLabSettings({ studioPrerender: false });
    expect(next.studioPrerender).toBe(false);
    expect(next.readerWakeLock).toBe(true);
    const raw = storage.getItem(NEXTGEN_LAB_STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string).studioPrerender).toBe(false);
  });

  it("구독자에게 쓰기를 알리고, 해지하면 알리지 않는다", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeNextgenLabSettings(listener);
    updateNextgenLabSettings({ viewTransitions: false });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    updateNextgenLabSettings({ viewTransitions: true });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("스냅샷 참조는 쓰기 전에는 그대로 유지된다 (useSyncExternalStore 계약)", () => {
    const before = getNextgenLabSettingsSnapshot();
    expect(getNextgenLabSettingsSnapshot()).toBe(before);
    updateNextgenLabSettings({ readerWakeLock: false });
    expect(getNextgenLabSettingsSnapshot()).not.toBe(before);
  });

  it("깨진 저장값은 기본값으로 떨어진다", async () => {
    vi.resetModules();
    storage.setItem(NEXTGEN_LAB_STORAGE_KEY, "{broken json");
    const fresh = await import("./nextgen-lab-settings");
    expect(fresh.getNextgenLabSettingsSnapshot()).toEqual(fresh.NEXTGEN_LAB_DEFAULTS);
  });

  it("타입이 다른 저장값은 항목별로 기본값을 쓴다", async () => {
    vi.resetModules();
    storage.setItem(
      NEXTGEN_LAB_STORAGE_KEY,
      JSON.stringify({ readerWakeLock: "yes", studioPrerender: false }),
    );
    const fresh = await import("./nextgen-lab-settings");
    const snapshot = fresh.getNextgenLabSettingsSnapshot();
    expect(snapshot.readerWakeLock).toBe(true);
    expect(snapshot.studioPrerender).toBe(false);
    expect(snapshot.viewTransitions).toBe(true);
  });
});
