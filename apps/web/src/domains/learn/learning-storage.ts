import { emptyProgress, parseProgress, STORAGE_KEY, type LearningProgress, type Lesson } from "./learning-model";

export type LearningStorage = Pick<Storage, "getItem" | "setItem"> & Partial<Pick<Storage, "removeItem">>;
export interface LearningSnapshot {
  data: LearningProgress;
  warning: string;
  dirty: boolean;
  conflict: boolean;
  revision: number;
}
const SAVE_WARNING = "기록을 기기에 저장하지 못했습니다. 이 화면의 기록을 백업해 보관하세요. 학습은 계속할 수 있습니다.";
const CONFLICT_WARNING = "다른 탭의 기록이 바뀌어 자동 저장을 멈췄습니다. 이 화면의 미저장 메모는 유지했습니다. 먼저 백업한 뒤 저장할 기록을 확인하세요.";

/**
 * 소유자별 저장 키. 진도·노트는 개인 기록이라 계정으로 나눠, 같은 브라우저의
 * 다른 계정에게 이전 계정의 진도와 메모가 보이지 않게 한다.
 * ownerKey가 없으면 레거시 키(기존 호출·테스트 호환).
 */
export function learningProgressStorageKey(ownerKey?: string): string {
  return ownerKey ? `${STORAGE_KEY}:${ownerKey}` : STORAGE_KEY;
}

/** One document-local store. No event listener or timer is owned by this testable controller. */
export function createLearningProgressStore(
  getStorage: () => LearningStorage | null,
  lessons: readonly Lesson[],
  termIds: readonly string[],
  initialOwnerKey?: string,
) {
  const listeners = new Set<() => void>();
  let ownerKey = initialOwnerKey;
  let activeKey = learningProgressStorageKey(ownerKey);
  let baselineRaw: string | null | undefined;
  let observedRaw: string | null | undefined;
  let snapshot: LearningSnapshot = { data: emptyProgress(), warning: "", dirty: false, conflict: false, revision: 0 };

  function storage(): LearningStorage {
    const result = getStorage();
    if (!result) throw new Error("Learning storage is unavailable");
    return result;
  }
  /**
   * 활성 키를 읽는다. 스코프 키가 비어 있고 로그인 계정이면 레거시(무스코프)
   * 기록을 첫 계정이 claim 한다 — 읽는 자리에서 스코프 키로 옮기고 레거시를
   * 지워, 다음 계정이 또 claim 하지 않게 한다(수강 등록과 같은 방식).
   * 게스트는 claim 하지 않는다 — 게스트 파티션은 빈 채로 시작한다.
   */
  function readRaw(store: LearningStorage): string | null {
    const raw = store.getItem(activeKey);
    if (raw !== null || activeKey === STORAGE_KEY || ownerKey === undefined || ownerKey === "guest") return raw;
    const legacyRaw = store.getItem(STORAGE_KEY);
    if (legacyRaw === null) return null;
    try {
      store.setItem(activeKey, legacyRaw);
      store.removeItem?.(STORAGE_KEY);
    } catch {
      // 이관 쓰기가 실패해도 읽은 값은 그대로 돌려준다.
    }
    return legacyRaw;
  }
  function publish(next: Omit<LearningSnapshot, "revision">) {
    snapshot = { ...next, revision: snapshot.revision + 1 };
    listeners.forEach((listener) => listener());
  }
  function refresh(): boolean {
    try {
      const raw = readRaw(storage());
      const previousObservedRaw = observedRaw;
      observedRaw = raw;
      if (snapshot.dirty) {
        // Never replace unsaved memory with a notification, including clear()/removeItem().
        if (raw !== baselineRaw && (!snapshot.conflict || raw !== previousObservedRaw)) {
          publish({ ...snapshot, conflict: true, warning: CONFLICT_WARNING });
        }
        return true;
      }
      if (raw !== baselineRaw || snapshot.warning) {
        baselineRaw = raw;
        publish({ data: parseProgress(raw, lessons, termIds), warning: "", dirty: false, conflict: false });
      }
      return true;
    } catch {
      if (!snapshot.warning) publish({ ...snapshot, warning: "기록 저장소를 읽을 수 없습니다. 현재 화면에서는 계속 학습할 수 있습니다." });
      return false;
    }
  }
  function persist(data: LearningProgress): boolean {
    // Normalization is applied at the write boundary, too (not only during the next reload).
    const validated = parseProgress(JSON.stringify(data), lessons, termIds);
    if (snapshot.conflict) {
      publish({ data: validated, dirty: true, conflict: true, warning: CONFLICT_WARNING });
      return false;
    }
    try {
      const raw = JSON.stringify(validated);
      storage().setItem(activeKey, raw);
      baselineRaw = raw;
      observedRaw = raw;
      publish({ data: validated, warning: "", dirty: false, conflict: false });
      return true;
    } catch {
      publish({ data: validated, warning: SAVE_WARNING, dirty: true, conflict: false });
      return false;
    }
  }
  function update(change: (current: LearningProgress) => LearningProgress): boolean {
    const readable = refresh();
    const data = change(snapshot.data);
    if (!readable) {
      publish({ ...snapshot, data: parseProgress(JSON.stringify(data), lessons, termIds), dirty: true, warning: SAVE_WARNING });
      return false;
    }
    return persist(data);
  }
  function retrySave(): boolean {
    const readable = refresh();
    return !readable || snapshot.conflict ? false : persist(snapshot.data);
  }
  /** Explicit UI confirmation only. A stale confirmation never overwrites newer external data. */
  function confirmCurrentRecord(expectedRevision: number): boolean {
    if (expectedRevision !== snapshot.revision || !snapshot.conflict) return false;
    try {
      const raw = storage().getItem(activeKey);
      if (raw !== observedRaw) {
        observedRaw = raw;
        publish({ ...snapshot, warning: "다른 탭에서 기록이 다시 바뀌었습니다. 백업 후 저장 내용을 다시 확인해 주세요." });
        return false;
      }
      publish({ ...snapshot, conflict: false });
      return persist(snapshot.data);
    } catch {
      publish({ ...snapshot, warning: SAVE_WARNING });
      return false;
    }
  }
  /** Called only after the existing two-step reset confirmation. Never clears other storage keys. */
  function reset(): boolean {
    publish({ ...snapshot, conflict: false });
    return persist(emptyProgress());
  }
  /**
   * 활성 소유자를 바꾼다(engagement 스토어의 bind와 같은 계약).
   * 이전 소유자의 저장된 기록은 그 키에 그대로 남고, 화면 상태는 새 소유자의
   * 기록으로 갈아끼운다. 저장에 실패해 메모리에만 있던 미저장 변경은 소유자
   * 전환과 함께 버려진다 — 다른 계정의 화면에 남의 메모가 남으면 안 된다.
   */
  function bindOwner(ownerId: string | null): void {
    const nextOwnerKey = ownerId ?? "guest";
    const nextKey = learningProgressStorageKey(nextOwnerKey);
    if (nextKey === activeKey) return;
    ownerKey = nextOwnerKey;
    activeKey = nextKey;
    baselineRaw = undefined;
    observedRaw = undefined;
    snapshot = { data: emptyProgress(), warning: "", dirty: false, conflict: false, revision: snapshot.revision };
    refresh();
  }
  refresh();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh,
    update,
    retrySave,
    confirmCurrentRecord,
    reset,
    bindOwner,
    getStorageKey: () => activeKey,
    getOwnerKey: () => ownerKey,
  };
}

/** Filter sessionStorage and unrelated keys before reading the persistent learning record. */
export function observeLearningStorage(
  target: Window,
  getStorage: () => LearningStorage | null,
  refresh: () => void,
  getKey: () => string = () => STORAGE_KEY,
): () => void {
  const sync = (event: StorageEvent) => {
    if (event.key !== getKey() && event.key !== null) return;
    try { if (event.storageArea !== getStorage()) return; }
    catch { return; }
    refresh();
  };
  target.addEventListener("storage", sync);
  return () => target.removeEventListener("storage", sync);
}
