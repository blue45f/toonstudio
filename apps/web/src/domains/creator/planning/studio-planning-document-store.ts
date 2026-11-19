import type { StudioAsyncKeyValueStore } from "../studio-local-database";
import { acquireStudioLocalDatabase, resetFailedStudioLocalDatabaseOwnership } from "../studio-local-database-runtime";

const pending = new Map<string, Promise<void>>();

/** 같은 작품의 읽기·검사·저장을 한 순서로 처리한다. 구 형식은 SQLite에 없는 최초 읽기에서만 가져온다. */
export async function withPlanningDocument<T>(
  namespace: "studio-director-drafts" | "studio-project-moodboards", key: string,
  update: (store: StudioAsyncKeyValueStore, raw: string | null) => Promise<T>,
) {
  const run = async () => {
    await resetFailedStudioLocalDatabaseOwnership();
    const store = (await acquireStudioLocalDatabase()).asAsyncKeyValueStore(namespace);
    let raw = await store.get(key);
    if (raw === null) {
      raw = window.localStorage.getItem(key);
      if (raw !== null) await store.set(key, raw);
    }
    return update(store, raw);
  };
  const name = namespace + "/" + key;
  if (navigator.locks) return navigator.locks.request(name, run);
  const next = (pending.get(name) ?? Promise.resolve()).then(run);
  const settled = next.then(() => {}, () => {});
  pending.set(name, settled);
  void settled.then(() => { if (pending.get(name) === settled) pending.delete(name); });
  return next;
}
