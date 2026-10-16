/**
 * 참 바 상태 저장소(외부 스토어).
 *
 * 참 바는 편집기 셸의 여러 곳(바 자체, 요소 패널의 고정 버튼, 메뉴의 펼침 버튼)이 같은 목록을 보고 고쳐야
 * 한다. 호스트(거대 편집기 컴포넌트)에 상태를 올리지 않으려고 `useSyncExternalStore` 로 읽는 작은 모듈
 * 스토어를 쓴다. 영속은 기존 UI 환경설정 저장소(SQLite/OPFS 의 `studio-ui-preferences-v1`)에 맡기며
 * 브라우저 Storage 로 되돌아가지 않는다.
 *
 * 불변식:
 * - 저장소를 한 번도 읽지 못한 동안의 명령은 화면에는 바로 반영하되 "저널"에 남겨 두었다가, 읽기에 성공하면
 *   읽은 상태 위에 순서대로 다시 적용한다. 읽기 전에 쓰면 저장돼 있던 목록을 덮어쓸 수 있으므로 그때까지는
 *   저장하지 않는다.
 * - 저장은 직렬화한다. 마지막 변경이 먼저 끝난 오래된 쓰기에 덮이지 않는다.
 * - 저장소가 없거나 실패해도 이번 탭의 메모리 상태는 유지하고 `memory-only` 로 알린다. `retry()` 로 다시 시도한다.
 */

import { acquireProductStudioUiPreferencesRepository } from "../studio-legacy-editor-runtime-helpers";
import {
  createEmptyStudioCharmBarState,
  moveStudioCharm,
  pinStudioCharm,
  setStudioCharmBarOpen,
  shiftStudioCharm,
  studioCharmBarStatesEqual,
  toggleStudioCharm,
  unpinStudioCharm,
  type StudioCharmBarState,
  type StudioCharmId,
  type StudioCharmPinFailure,
} from "./studio-charm-model";
import { applyStudioCharmStarterPack, shouldAutoSeedStudioCharmStarter } from "./studio-charm-starter-pack";

import type { StudioUiPreferencesRepository } from "../studio-ui-preferences-sqlite";

export type StudioCharmBarCommand =
  | { readonly type: "pin"; readonly id: StudioCharmId }
  | { readonly type: "unpin"; readonly id: StudioCharmId }
  | { readonly type: "toggle"; readonly id: StudioCharmId }
  | { readonly type: "shift"; readonly id: StudioCharmId; readonly delta: number }
  | { readonly type: "move"; readonly id: StudioCharmId; readonly toIndex: number }
  | { readonly type: "set-open"; readonly open: boolean }
  | { readonly type: "toggle-open" }
  | { readonly type: "apply-starter" };

/** `idle`: 읽기 전 · `loading`: 읽는 중 · `saved`: 저장소와 일치 · `memory-only`: 저장소를 읽거나 쓰지 못함. */
export type StudioCharmBarPersistence = "idle" | "loading" | "saved" | "memory-only";

export interface StudioCharmBarSnapshot {
  readonly state: StudioCharmBarState;
  /** 저장소 읽기 시도가 끝났는지(실패해도 true). */
  readonly hydrated: boolean;
  readonly persistence: StudioCharmBarPersistence;
  /** 이번 세션에서 기본 스타터 팩을 자동으로 담았는지. 안내 문구를 한 번 보여 주는 데 쓴다. */
  readonly starterAutoAdded: boolean;
}

export type StudioCharmBarDispatchResult =
  | { readonly ok: true; readonly queued: boolean }
  | { readonly ok: false; readonly reason: StudioCharmPinFailure };

export interface StudioCharmBarStore {
  getSnapshot(): StudioCharmBarSnapshot;
  subscribe(listener: () => void): () => void;
  /** 저장소에서 읽는다. 여러 번 불러도 한 번만 읽고, 실패하면 다음 호출이 다시 시도한다. */
  hydrate(): Promise<void>;
  /** 저장소 읽기(아직 못 읽었다면) 또는 마지막 상태 저장을 다시 시도한다. */
  retry(): Promise<void>;
  dispatch(command: StudioCharmBarCommand): StudioCharmBarDispatchResult;
}

export interface CreateStudioCharmBarStoreOptions {
  readonly acquire?: () => Promise<Pick<StudioUiPreferencesRepository, "loadCharmBar" | "saveCharmBar">>;
}

interface Transition {
  readonly state: StudioCharmBarState;
  readonly failure: StudioCharmPinFailure | null;
}

function applyCommand(state: StudioCharmBarState, command: StudioCharmBarCommand): Transition {
  switch (command.type) {
    case "pin": {
      const result = pinStudioCharm(state, command.id);
      return { state: result.state, failure: result.ok ? null : result.reason };
    }
    case "toggle": {
      const result = toggleStudioCharm(state, command.id);
      return { state: result.state, failure: result.ok ? null : result.reason };
    }
    case "unpin":
      return { state: unpinStudioCharm(state, command.id), failure: null };
    case "shift":
      return { state: shiftStudioCharm(state, command.id, command.delta), failure: null };
    case "move":
      return { state: moveStudioCharm(state, command.id, command.toIndex), failure: null };
    case "set-open":
      return { state: setStudioCharmBarOpen(state, command.open), failure: null };
    case "toggle-open":
      return { state: setStudioCharmBarOpen(state, !state.open), failure: null };
    case "apply-starter":
      return { state: applyStudioCharmStarterPack(state), failure: null };
  }
}

/**
 * 상대 명령(토글)을 사용자가 화면에서 본 상태 기준의 절대 명령으로 바꾼다.
 * 저장소를 읽기 전에 들어온 명령은 읽은 상태 위에 다시 적용되는데, 토글 그대로 저널에 남기면 읽은 상태가
 * 화면과 다를 때 사용자의 의도와 반대로 뒤집힌다(켜려고 눌렀는데 꺼지는 식).
 */
function resolveIntent(state: StudioCharmBarState, command: StudioCharmBarCommand): StudioCharmBarCommand {
  if (command.type === "toggle") {
    return state.charms.includes(command.id)
      ? { type: "unpin", id: command.id }
      : { type: "pin", id: command.id };
  }
  if (command.type === "toggle-open") return { type: "set-open", open: !state.open };
  return command;
}

/** 처음 연 빈 바에는 스타터 팩을 한 번 담는다. 그 외에는 상태를 그대로 돌려준다. */
function settleStarter(state: StudioCharmBarState): StudioCharmBarState {
  return shouldAutoSeedStudioCharmStarter(state) ? applyStudioCharmStarterPack(state) : state;
}

function replay(base: StudioCharmBarState, journal: readonly StudioCharmBarCommand[]): StudioCharmBarState {
  let state = base;
  for (const command of journal) state = applyCommand(state, command).state;
  return state;
}

export function createStudioCharmBarStore(options: CreateStudioCharmBarStoreOptions = {}): StudioCharmBarStore {
  const acquire = options.acquire ?? acquireProductStudioUiPreferencesRepository;
  const listeners = new Set<() => void>();
  let snapshot: StudioCharmBarSnapshot = Object.freeze({
    state: createEmptyStudioCharmBarState(),
    hydrated: false,
    persistence: "idle",
    starterAutoAdded: false,
  });
  let hydration: Promise<void> | null = null;
  /** 저장소를 한 번이라도 성공적으로 읽었는지. 이 전에는 절대 쓰지 않는다. */
  let loadedOnce = false;
  /** 저장소 읽기 전에 들어온 명령. 읽기에 성공하면 읽은 상태 위에 다시 적용하고 비운다. */
  let journal: StudioCharmBarCommand[] = [];
  let writeTail: Promise<void> = Promise.resolve();
  let saveGeneration = 0;

  function publish(next: Partial<StudioCharmBarSnapshot>): void {
    snapshot = Object.freeze({ ...snapshot, ...next });
    for (const listener of [...listeners]) listener();
  }

  function persist(state: StudioCharmBarState): Promise<void> {
    const generation = ++saveGeneration;
    const operation = writeTail
      .catch(() => undefined)
      .then(async () => {
        const repository = await acquire();
        await repository.saveCharmBar(state);
      });
    writeTail = operation.catch(() => undefined);
    return operation.then(
      () => {
        if (generation === saveGeneration) publish({ persistence: "saved" });
      },
      () => {
        if (generation === saveGeneration) publish({ persistence: "memory-only" });
      },
    );
  }

  function runHydration(): Promise<void> {
    publish({ persistence: "loading" });
    return acquire()
      .then((repository) => repository.loadCharmBar())
      .then((loaded) => {
        const replayed = replay(loaded, journal);
        const settled = settleStarter(replayed);
        journal = [];
        loadedOnce = true;
        publish({
          state: settled,
          hydrated: true,
          persistence: "saved",
          starterAutoAdded: settled !== replayed,
        });
        if (!studioCharmBarStatesEqual(loaded, settled)) void persist(settled);
      })
      .catch(() => {
        // 읽지 못한 채로 시작한다: 저널은 보존하고(다음 읽기 성공 때 재적용) 저장은 하지 않는다.
        hydration = null;
        publish({ hydrated: true, persistence: "memory-only" });
      });
  }

  const store: StudioCharmBarStore = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    hydrate() {
      hydration ??= runHydration();
      return hydration;
    },
    retry() {
      if (loadedOnce) return persist(snapshot.state);
      hydration = null;
      return store.hydrate();
    },
    dispatch(command) {
      const intent = resolveIntent(snapshot.state, command);
      const transition = applyCommand(snapshot.state, intent);
      if (transition.failure) return { ok: false, reason: transition.failure };
      if (!loadedOnce) journal.push(intent);
      const settled = settleStarter(transition.state);
      const autoAdded = settled !== transition.state;
      if (!studioCharmBarStatesEqual(snapshot.state, settled)) {
        publish({ state: settled, ...(autoAdded ? { starterAutoAdded: true } : {}) });
        if (loadedOnce) void persist(settled);
      }
      return { ok: true, queued: !loadedOnce };
    },
  };
  return store;
}

let productStore: StudioCharmBarStore | null = null;

/** 편집기 한 탭이 공유하는 제품 스토어. 첫 호출 때 만들고 읽기는 `hydrate()` 가 시작한다. */
export function getStudioCharmBarStore(): StudioCharmBarStore {
  productStore ??= createStudioCharmBarStore();
  return productStore;
}

/**
 * 시험 전용: 제품 스토어 싱글턴을 비운다. 스토어를 넘기면 그것을 제품 스토어로 쓴다
 * (요소 패널처럼 스토어를 직접 받지 않는 화면을 시험용 저장소로 확인할 때).
 */
export function resetStudioCharmBarStoreForTests(replacement: StudioCharmBarStore | null = null): void {
  productStore = replacement;
}
