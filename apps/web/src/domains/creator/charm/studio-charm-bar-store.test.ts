import { describe, expect, it, vi } from "vitest";

import { createStudioCharmBarStore, type StudioCharmBarStore } from "./studio-charm-bar-store";
import {
  STUDIO_CHARM_BAR_MAX_CHARMS,
  createEmptyStudioCharmBarState,
  createStudioCharmId,
  normalizeStudioCharmBarState,
  type StudioCharmBarState,
} from "./studio-charm-model";
import { STUDIO_CHARM_STARTER_PACK } from "./studio-charm-starter-pack";

const A = createStudioCharmId("element", "a");
const B = createStudioCharmId("element", "b");
const C = createStudioCharmId("element", "c");

function repository(initial: StudioCharmBarState = createEmptyStudioCharmBarState()) {
  let stored = initial;
  const saves: StudioCharmBarState[] = [];
  const repo = {
    loadCharmBar: vi.fn(async () => stored),
    saveCharmBar: vi.fn(async (state: StudioCharmBarState) => {
      saves.push(state);
      stored = state;
    }),
  };
  return { repo, saves, stored: () => stored };
}

function storeOver(fixture: ReturnType<typeof repository>): StudioCharmBarStore {
  return createStudioCharmBarStore({ acquire: async () => fixture.repo });
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function seeded(charms: readonly typeof A[], extra: Partial<StudioCharmBarState> = {}): StudioCharmBarState {
  return normalizeStudioCharmBarState({ version: 1, charms, open: false, starterSettled: true, ...extra });
}

describe("참 바 저장소: 읽기", () => {
  it("한 번만 읽고 읽은 상태를 저장소와 일치로 표시한다", async () => {
    const fixture = repository(seeded([A, B]));
    const store = storeOver(fixture);
    expect(store.getSnapshot()).toMatchObject({ hydrated: false, persistence: "idle" });
    await Promise.all([store.hydrate(), store.hydrate()]);
    expect(fixture.repo.loadCharmBar).toHaveBeenCalledOnce();
    expect(store.getSnapshot()).toMatchObject({ hydrated: true, persistence: "saved" });
    expect(store.getSnapshot().state.charms).toEqual([A, B]);
    expect(fixture.saves).toHaveLength(0);
  });

  it("읽기 전에 들어온 명령은 저장하지 않고, 읽은 상태 위에 순서대로 다시 적용한다", async () => {
    const fixture = repository(seeded([A, B]));
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    fixture.repo.loadCharmBar.mockImplementationOnce(async () => {
      await gate;
      return seeded([A, B]);
    });
    const store = storeOver(fixture);
    const loading = store.hydrate();
    expect(store.dispatch({ type: "pin", id: C })).toEqual({ ok: true, queued: true });
    expect(store.getSnapshot().state.charms).toEqual([C]);
    expect(fixture.repo.saveCharmBar).not.toHaveBeenCalled();
    release();
    await loading;
    await flush();
    expect(store.getSnapshot().state.charms).toEqual([A, B, C]);
    expect(fixture.saves.at(-1)?.charms).toEqual([A, B, C]);
  });

  it("읽기 전의 토글은 화면에서 본 의도로 기록해, 읽은 상태가 달라도 반대로 뒤집히지 않는다", async () => {
    // 저장된 상태는 이미 열려 있고 A 가 고정돼 있다. 사용자는 읽기 전 빈 화면에서 켜기와 A 고정을 눌렀다.
    const fixture = repository(seeded([A], { open: true }));
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    fixture.repo.loadCharmBar.mockImplementationOnce(async () => {
      await gate;
      return seeded([A], { open: true });
    });
    const store = storeOver(fixture);
    const loading = store.hydrate();
    expect(store.dispatch({ type: "toggle-open" })).toEqual({ ok: true, queued: true });
    expect(store.getSnapshot().state.open).toBe(true);
    expect(store.dispatch({ type: "toggle", id: A })).toEqual({ ok: true, queued: true });
    expect(store.getSnapshot().state.charms).toContain(A);
    release();
    await loading;
    await flush();
    // 상대 명령으로 다시 적용했다면 열림은 꺼지고 A 는 빠졌을 것이다.
    expect(store.getSnapshot().state.open).toBe(true);
    expect(store.getSnapshot().state.charms).toEqual([A]);
  });

  it("읽기에 실패하면 메모리 전용으로 시작하고 저장을 시도하지 않으며, 다시 시도하면 읽은 상태 위에 합쳐 저장한다", async () => {
    const fixture = repository(seeded([A]));
    fixture.repo.loadCharmBar.mockRejectedValueOnce(new Error("opfs unavailable"));
    const store = storeOver(fixture);
    await store.hydrate();
    expect(store.getSnapshot()).toMatchObject({ hydrated: true, persistence: "memory-only" });
    expect(store.dispatch({ type: "pin", id: B })).toEqual({ ok: true, queued: true });
    await flush();
    expect(fixture.repo.saveCharmBar).not.toHaveBeenCalled();
    expect(store.getSnapshot().state.charms).toEqual([B]);

    await store.retry();
    await flush();
    expect(store.getSnapshot().persistence).toBe("saved");
    expect(store.getSnapshot().state.charms).toEqual([A, B]);
    expect(fixture.saves.at(-1)?.charms).toEqual([A, B]);
  });
});

describe("참 바 저장소: 명령과 저장", () => {
  it("바뀐 상태만 순서대로 저장하고, 같은 상태는 저장하지 않는다", async () => {
    const fixture = repository(seeded([]));
    const store = storeOver(fixture);
    await store.hydrate();
    store.dispatch({ type: "pin", id: A });
    store.dispatch({ type: "pin", id: B });
    store.dispatch({ type: "pin", id: A });
    store.dispatch({ type: "shift", id: B, delta: -1 });
    await flush();
    expect(fixture.saves.map((state) => state.charms)).toEqual([[A], [A, B], [B, A]]);
    expect(store.getSnapshot().persistence).toBe("saved");
    expect(fixture.stored().charms).toEqual([B, A]);
  });

  it("가득 찬 바에 더 고정하면 실패 이유를 돌려주고 상태와 저장은 그대로다", async () => {
    const many = Array.from({ length: STUDIO_CHARM_BAR_MAX_CHARMS }, (_, index) => createStudioCharmId("element", `m-${index}`));
    const fixture = repository(seeded(many));
    const store = storeOver(fixture);
    await store.hydrate();
    expect(store.dispatch({ type: "pin", id: A })).toEqual({ ok: false, reason: "full" });
    expect(store.dispatch({ type: "toggle", id: A })).toEqual({ ok: false, reason: "full" });
    expect(store.getSnapshot().state.charms).toHaveLength(STUDIO_CHARM_BAR_MAX_CHARMS);
    expect(fixture.saves).toHaveLength(0);
  });

  it("저장이 실패하면 메모리 전용으로 알리고 상태는 유지하며 다시 시도하면 저장한다", async () => {
    const fixture = repository(seeded([]));
    const store = storeOver(fixture);
    await store.hydrate();
    fixture.repo.saveCharmBar.mockRejectedValueOnce(new Error("quota"));
    store.dispatch({ type: "pin", id: A });
    await flush();
    expect(store.getSnapshot()).toMatchObject({ persistence: "memory-only" });
    expect(store.getSnapshot().state.charms).toEqual([A]);
    await store.retry();
    expect(store.getSnapshot().persistence).toBe("saved");
    expect(fixture.stored().charms).toEqual([A]);
  });

  it("펼침 여부도 저장한다", async () => {
    const fixture = repository(seeded([A]));
    const store = storeOver(fixture);
    await store.hydrate();
    store.dispatch({ type: "toggle-open" });
    await flush();
    expect(fixture.stored().open).toBe(true);
    store.dispatch({ type: "set-open", open: false });
    await flush();
    expect(fixture.stored().open).toBe(false);
  });
});

describe("참 바 저장소: 기본 스타터 팩", () => {
  it("처음 연 빈 바는 스타터 팩을 한 번 담고 그 사실을 알린다", async () => {
    const fixture = repository(createEmptyStudioCharmBarState());
    const store = storeOver(fixture);
    await store.hydrate();
    store.dispatch({ type: "set-open", open: true });
    await flush();
    expect(store.getSnapshot().state.charms).toEqual(STUDIO_CHARM_STARTER_PACK);
    expect(store.getSnapshot().starterAutoAdded).toBe(true);
    expect(fixture.stored().charms).toEqual(STUDIO_CHARM_STARTER_PACK);
  });

  it("저장된 상태가 이미 열려 있고 비어 있어도(처음) 읽는 순간 한 번 담는다", async () => {
    const fixture = repository(normalizeStudioCharmBarState({ version: 1, charms: [], open: true, starterSettled: false }));
    const store = storeOver(fixture);
    await store.hydrate();
    await flush();
    expect(store.getSnapshot().state.charms).toEqual(STUDIO_CHARM_STARTER_PACK);
    expect(fixture.saves.at(-1)?.charms).toEqual(STUDIO_CHARM_STARTER_PACK);
  });

  it("사용자가 목록을 고친 뒤 모두 지워도 다시 자동으로 담지 않는다", async () => {
    const fixture = repository(createEmptyStudioCharmBarState());
    const store = storeOver(fixture);
    await store.hydrate();
    store.dispatch({ type: "pin", id: A });
    store.dispatch({ type: "unpin", id: A });
    store.dispatch({ type: "set-open", open: true });
    await flush();
    expect(store.getSnapshot().state.charms).toEqual([]);
    expect(store.getSnapshot().starterAutoAdded).toBe(false);
  });

  it("스타터 팩 다시 담기는 이미 있는 참을 건너뛴다", async () => {
    const fixture = repository(seeded([STUDIO_CHARM_STARTER_PACK[0], A]));
    const store = storeOver(fixture);
    await store.hydrate();
    store.dispatch({ type: "apply-starter" });
    const charms = store.getSnapshot().state.charms;
    expect(new Set(charms).size).toBe(charms.length);
    expect(charms.slice(0, 2)).toEqual([STUDIO_CHARM_STARTER_PACK[0], A]);
    expect(charms).toHaveLength(STUDIO_CHARM_STARTER_PACK.length + 1);
  });
});

describe("참 바 저장소: 구독", () => {
  it("변경 때만 알리고, 해제하면 더는 알리지 않으며, 변경이 없으면 스냅샷 참조가 같다", async () => {
    const fixture = repository(seeded([A]));
    const store = storeOver(fixture);
    await store.hydrate();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const before = store.getSnapshot();
    expect(store.getSnapshot()).toBe(before);
    store.dispatch({ type: "pin", id: A });
    expect(listener).not.toHaveBeenCalled();
    store.dispatch({ type: "pin", id: B });
    expect(listener).toHaveBeenCalled();
    expect(store.getSnapshot()).not.toBe(before);
    unsubscribe();
    listener.mockClear();
    store.dispatch({ type: "unpin", id: B });
    expect(listener).not.toHaveBeenCalled();
  });
});
