import { acquireStudioLocalDatabase } from "../studio-local-database-runtime";
import { decodeStudioScopedSavePending, emitStudioScopedSavePending, STUDIO_SCOPED_SAVE_PENDING_NAMESPACE,
  studioScopedSavePendingKey, type StudioScopedSavePending, type StudioScopedSavePendingScope } from "./studio-scoped-save-pending";
import type { StudioLocalDatabase } from "../studio-local-database";

type Database = Pick<StudioLocalDatabase, "kvGet" | "kvSet" | "kvDelete">;
const tails = new Map<string, Promise<unknown>>();
function exclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const current = (tails.get(key) ?? Promise.resolve()).catch(() => undefined).then(() => {
    const locks = globalThis.navigator?.locks;
    return locks ? locks.request(`${STUDIO_SCOPED_SAVE_PENDING_NAMESPACE}:${key}`, operation) : operation();
  });
  tails.set(key, current);
  const retire = () => { if (tails.get(key) === current) tails.delete(key); };
  void current.then(retire, retire); return current;
}

/** 기존 공유 SQLite/OPFS 본문 저장소를 사용한다. 새 저장이 미확인 원문을 덮어쓰지 않는다. */
export function createStudioScopedSavePendingRepository(options: { readonly acquireDatabase?: () => Promise<Database> } = {}) {
  const acquire = options.acquireDatabase ?? acquireStudioLocalDatabase;
  return {
    load(scope: StudioScopedSavePendingScope): Promise<StudioScopedSavePending | null> {
      const key = studioScopedSavePendingKey(scope);
      return exclusive(key, async () => {
        const raw = await (await acquire()).kvGet(STUDIO_SCOPED_SAVE_PENDING_NAMESPACE, key);
        return raw === null ? null : decodeStudioScopedSavePending(raw, scope);
      });
    },
    remember(scope: StudioScopedSavePendingScope, value: StudioScopedSavePending): Promise<StudioScopedSavePending> {
      const key = studioScopedSavePendingKey(scope), raw = JSON.stringify(value);
      return exclusive(key, async () => {
        const candidate = await decodeStudioScopedSavePending(raw, scope), db = await acquire();
        const existing = await db.kvGet(STUDIO_SCOPED_SAVE_PENDING_NAMESPACE, key);
        if (existing !== null) return decodeStudioScopedSavePending(existing, scope);
        await db.kvSet(STUDIO_SCOPED_SAVE_PENDING_NAMESPACE, key, raw);
        if (await db.kvGet(STUDIO_SCOPED_SAVE_PENDING_NAMESPACE, key) !== raw) throw new Error("이전 저장 원문을 기기에서 다시 읽지 못했습니다. 서버 전송을 시작하지 않았습니다.");
        emitStudioScopedSavePending(key, true); return candidate;
      });
    },
    clear(scope: StudioScopedSavePendingScope, mutationId: string): Promise<boolean> {
      const key = studioScopedSavePendingKey(scope);
      return exclusive(key, async () => {
        const db = await acquire(), raw = await db.kvGet(STUDIO_SCOPED_SAVE_PENDING_NAMESPACE, key);
        if (raw === null) { emitStudioScopedSavePending(key, false); return true; }
        if ((await decodeStudioScopedSavePending(raw, scope)).body.mutationId !== mutationId) return false;
        await db.kvDelete(STUDIO_SCOPED_SAVE_PENDING_NAMESPACE, key);
        if (await db.kvGet(STUDIO_SCOPED_SAVE_PENDING_NAMESPACE, key) !== null) throw new Error("서버 저장은 확인했지만 기기의 이전 저장 기록을 정리하지 못했습니다.");
        emitStudioScopedSavePending(key, false); return true;
      });
    },
  };
}
