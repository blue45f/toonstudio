import { useCallback } from "react";

import { useSession } from "@/domains/auth/public/session/auth-session-store";

import {
  persistSeedAutosaveDurably,
  type StudioSeedAutosave,
  type StudioSeedDurableOutcome,
  type StudioSeedDurablePorts,
} from "../save-first/studio-seed-autosave-durable";

/**
 * 무거운 OPFS/SQLite 모듈은 실제로 심을 때만 동적으로 불러온다. 두 모듈 모두 편집기가 이미 지연 로딩하는
 * 경계라서 라이브러리 번들에 새 청크를 만들지 않는다.
 */
async function loadDurablePorts(): Promise<StudioSeedDurablePorts> {
  const [opfs, sqliteStore] = await Promise.all([
    import("../studio-autosave-opfs-session"),
    import("../studio-autosave-sqlite-store"),
  ]);
  return {
    openDocumentSession: (key) => opfs.openStudioAutosaveDocumentSession(key),
    acquireSqlite: () => sqliteStore.acquireStudioAutosaveSqliteStore(),
    persist: opfs.persistStudioAutosaveWithOpfsPrimary,
    withLeadership: opfs.withStudioAutosaveDocumentLeadership,
    isBusy: opfs.studioAutosaveDocumentBusy,
  };
}

/**
 * 라이브러리 진입 UI(예제 배너·샘플 카드)가 시딩한 초안을 편집기가 열 수 있는 내구 저장소에 심는 훅.
 *
 * 자동저장 키에는 로그인 사용자 id 가 들어가므로, 세션이 확정되기 전에 심으면 게스트 키에 잘못 심는다.
 * 그래서 `ownerReady` 가 참일 때만 심고, 준비되지 않았으면 심지 않고 "unavailable" 을 돌려준다.
 */
export function useStudioSeedAutosavePersistence(): {
  readonly ownerReady: boolean;
  readonly persist: (seed: StudioSeedAutosave) => Promise<StudioSeedDurableOutcome>;
} {
  const { data: session, ready } = useSession();
  const authUserId = session?.user?.id ?? null;
  const persist = useCallback(
    async (seed: StudioSeedAutosave): Promise<StudioSeedDurableOutcome> => {
      if (!ready || typeof window === "undefined") return "unavailable";
      try {
        return await persistSeedAutosaveDurably({
          seed,
          authUserId,
          storage: window.localStorage,
          ports: await loadDurablePorts(),
        });
      } catch {
        return "unavailable";
      }
    },
    [authUserId, ready],
  );
  return { ownerReady: ready, persist };
}
