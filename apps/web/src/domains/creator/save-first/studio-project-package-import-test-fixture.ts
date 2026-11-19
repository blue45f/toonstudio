import { createStudioAutosaveSqliteStore } from "../studio-autosave-sqlite-store";
import type { StudioImportAutosavePorts } from "./studio-imported-document-autosaves";

const stores = new WeakMap<Storage, ReturnType<typeof createStudioAutosaveSqliteStore>>();

export function importedTestSqlite(storage: Storage) {
  const existing = stores.get(storage);
  if (existing) return existing;
  const rows = new Map<string, string>();
  const store = createStudioAutosaveSqliteStore({
    kvGet: async (namespace, key) => rows.get(namespace + key) ?? null,
    kvSet: async (namespace, key, value) => { rows.set(namespace + key, value); },
  });
  stores.set(storage, store);
  return store;
}

export function importedTestPorts(storage: Storage): StudioImportAutosavePorts {
  return {
    acquireSqlite: async () => importedTestSqlite(storage),
    openDocument: async key => ({
      role: "leader", session: null,
      lease: {
        role: "leader", basis: "locks-unavailable", documentKey: key, lockName: key,
        waitForLeadership: async () => true, release: async () => {},
      },
    }),
  };
}

export async function readImportedTestSnapshot(storage: Storage, key: string) {
  const result = await importedTestSqlite(storage).read(key);
  return result?.state === "snapshot" ? result : null;
}
