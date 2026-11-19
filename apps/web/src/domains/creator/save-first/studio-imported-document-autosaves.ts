import { studioAutosaveHasContent, studioLifecycleAutosaveSidecarKey, type StudioAutosavePayload } from "../studio-autosave";
import type { StudioAutosaveDocumentSession } from "../studio-autosave-opfs-session";
import type { StudioAutosaveSqlitePort } from "../studio-autosave-sqlite-store";

type ImportedSnapshot = { key: string; payload: StudioAutosavePayload };
export type StudioImportAutosavePorts = {
  openDocument(key: string): Promise<StudioAutosaveDocumentSession>;
  acquireSqlite(): Promise<StudioAutosaveSqlitePort>;
};

export async function commitImportedDocumentAutosaves<T>(input: {
  snapshots: ImportedSnapshot[];
  storage: Storage;
  signal?: AbortSignal;
  ports?: StudioImportAutosavePorts;
  publish: () => T;
}): Promise<T> {
  if (!input.snapshots.length) return input.publish();
  const { openStudioAutosaveDocumentSession, persistStudioAutosaveWithOpfsPrimary } = await import("../studio-autosave-opfs-session");
  const ports = input.ports ?? {
    openDocument: openStudioAutosaveDocumentSession,
    acquireSqlite: async () => {
      const [{ retryFailedStudioLocalDatabaseOpen }, { acquireStudioAutosaveSqliteStore }] = await Promise.all([
        import("../studio-local-database-runtime"), import("../studio-autosave-sqlite-store"),
      ]);
      await retryFailedStudioLocalDatabaseOpen();
      return acquireStudioAutosaveSqliteStore();
    },
  };
  const sqlite = await ports.acquireSqlite().catch(() => null);
  const held = new Map<string, StudioAutosaveDocumentSession>();
  const writes: ImportedSnapshot[] = [];
  try {
    for (const snapshot of input.snapshots) {
      input.signal?.throwIfAborted();
      const { key, payload } = snapshot;
      const document = await ports.openDocument(key);
      held.set(key, document);
      if (document.role === "follower") throw new Error("다른 탭이 복원할 원고를 편집 중입니다.");
      if (!document.session && !sqlite) throw new Error("원고를 저장할 기기 저장소를 열 수 없습니다.");
      if (input.storage.getItem(key) !== null || input.storage.getItem(studioLifecycleAutosaveSidecarKey(key)) !== null
        || await document.session?.readLatest(input.signal) || await sqlite?.read(key)) {
        throw new Error("복원 대상에 기존 원고가 있어 가져오기를 중단했습니다.");
      }
      // 실제로 빈 문서는 라이브러리 메타데이터로 복원된다. 저널은 내용 없는 자동저장을 거부한다.
      if (!studioAutosaveHasContent(payload)) continue;
      const localCopy = { ...payload };
      delete localCopy.sourceWorkId;
      delete localCopy.sourceRevision;
      writes.push(snapshot);
      await persistStudioAutosaveWithOpfsPrimary({ session: document.session, sqlite, storage: input.storage, key, payload: localCopy, signal: input.signal });
    }
    input.signal?.throwIfAborted();
    return input.publish();
  } catch (cause) {
    // 임의의 새 문서 키만, 쓰기 임대를 가진 채 정리한다. 다음 탭의 편집이 롤백과 경합하지 않는다.
    const cleanup: Promise<unknown>[] = [];
    for (const { key, payload } of writes) {
      const when = new Date(Math.max(Date.now(), Date.parse(payload.savedAt))).toISOString();
      const session = held.get(key)?.session;
      if (session) cleanup.push(session.clear(when));
      if (sqlite) cleanup.push(sqlite.clear(key, when));
    }
    const results = await Promise.allSettled(cleanup);
    const failed = results.find(result => result.status === "rejected");
    if (failed) throw new AggregateError([cause, failed.reason], "가져오기를 중단했습니다. 기기 저장소에서 임시 원고 정리를 완료하지 못했습니다.", { cause });
    throw cause;
  } finally {
    await Promise.allSettled([...held.values()].map(async ({ session, lease }) => {
      try { await session?.dispose(); } finally { await lease.release(); }
    }));
  }
}
