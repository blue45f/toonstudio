import { acquireStudioLocalDatabase } from "../studio-local-database-runtime";
import type { StudioLocalDatabase } from "../studio-local-database";
import { decodeProductionCreatePending, productionCreatePendingKey, PRODUCTION_CREATE_PENDING_NAMESPACE,
  type ProductionCreatePending, type ProductionCreateScope } from "./production-create-pending";

type Database = Pick<StudioLocalDatabase, "kvGet" | "kvSet" | "kvDelete">;
type WithLock = <T>(key: string, operation: () => Promise<T>) => Promise<T>;
const withBrowserLock: WithLock = (key, operation) => {
  const locks = globalThis.navigator?.locks;
  if (!locks) return Promise.reject(new Error("생성 요청을 안전하게 보관할 기기 잠금을 사용할 수 없습니다. 전송을 시작하지 않았습니다."));
  return locks.request(PRODUCTION_CREATE_PENDING_NAMESPACE + ":" + key, operation);
};
/** 기존 SQLite/OPFS와 탭 간 잠금으로 최초 원문 하나만 보존한다. 저장 실패를 메모리 성공으로 대체하지 않는다. */
export function createProductionCreatePendingStore(options: {
  readonly acquireDatabase?: () => Promise<Database>; readonly withLock?: WithLock;
} = {}) {
  const acquire = options.acquireDatabase ?? acquireStudioLocalDatabase, exclusive = options.withLock ?? withBrowserLock;
  return {
    load(scope: ProductionCreateScope): Promise<ProductionCreatePending | null> {
      const key = productionCreatePendingKey(scope);
      return exclusive(key, async () => {
        const raw = await (await acquire()).kvGet(PRODUCTION_CREATE_PENDING_NAMESPACE, key);
        return raw === null ? null : decodeProductionCreatePending(raw, scope);
      });
    },
    remember(scope: ProductionCreateScope, value: ProductionCreatePending): Promise<ProductionCreatePending> {
      const key = productionCreatePendingKey(scope), raw = JSON.stringify(value);
      return exclusive(key, async () => {
        const candidate = await decodeProductionCreatePending(raw, scope), db = await acquire();
        const existing = await db.kvGet(PRODUCTION_CREATE_PENDING_NAMESPACE, key);
        if (existing !== null) return decodeProductionCreatePending(existing, scope);
        await db.kvSet(PRODUCTION_CREATE_PENDING_NAMESPACE, key, raw);
        if (await db.kvGet(PRODUCTION_CREATE_PENDING_NAMESPACE, key) !== raw) {
          throw new Error("생성 원문을 기기에서 다시 읽지 못했습니다. 서버 전송을 시작하지 않았습니다.");
        }
        return candidate;
      });
    },
    clear(scope: ProductionCreateScope, mutationId: string, current: () => boolean): Promise<boolean> {
      const key = productionCreatePendingKey(scope);
      return exclusive(key, async () => {
        if (!current()) return false;
        const db = await acquire(), raw = await db.kvGet(PRODUCTION_CREATE_PENDING_NAMESPACE, key);
        if (raw === null) return current();
        if ((await decodeProductionCreatePending(raw, scope)).clientMutationId !== mutationId || !current()) return false;
        await db.kvDelete(PRODUCTION_CREATE_PENDING_NAMESPACE, key);
        if (await db.kvGet(PRODUCTION_CREATE_PENDING_NAMESPACE, key) !== null) throw new Error("생성은 확인했지만 기기의 보관 요청을 정리하지 못했습니다.");
        return true;
      });
    },
  };
}
export type ProductionCreatePendingStore = ReturnType<typeof createProductionCreatePendingStore>;
export const productionCreatePendingStore = createProductionCreatePendingStore();
