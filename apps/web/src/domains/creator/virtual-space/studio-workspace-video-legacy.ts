// 구형 녹화 DB는 읽기만 한다. 최초 설치에서 빈 DB가 만들어지지 않도록 업그레이드를 중단한다.
import type { WorkspaceVideoEntry } from "./studio-workspace-video-library";

async function openLegacy(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return null;
  if (typeof indexedDB.databases === "function" &&
      !(await indexedDB.databases()).some(entry => entry.name === "toonstudio-workspace-recordings")) return null;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("toonstudio-workspace-recordings");
    let missing = false;
    request.onupgradeneeded = () => { missing = true; request.transaction?.abort(); };
    request.onerror = () => missing ? resolve(null) : reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function readLegacy<T>(
  name: "recordings" | "video",
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  const database = await openLegacy();
  if (!database) return undefined;
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction(name, "readonly");
      const request = operation(tx.objectStore(name));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error ?? request.error);
      tx.onerror = () => reject(tx.error ?? request.error);
    });
  } finally {
    database.close();
  }
}

export async function listLegacyWorkspaceVideos(scope: string): Promise<WorkspaceVideoEntry[]> {
  return await readLegacy<WorkspaceVideoEntry[]>("recordings", store => store.index("scope").getAll(scope)) ?? [];
}

export function readLegacyWorkspaceVideo(scope: string, id: string): Promise<Blob | undefined> {
  return readLegacy<Blob>("video", store => store.get([scope, id]));
}

// 사용자가 해당 녹화를 삭제한 경우에만, 두 키를 같은 트랜잭션으로 정리한다.
export async function removeLegacyWorkspaceVideo(scope: string, id: string): Promise<void> {
  const database = await openLegacy();
  if (!database) return;
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(["recordings", "video"], "readwrite");
      for (const name of ["recordings", "video"]) tx.objectStore(name).delete([scope, id]);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    database.close();
  }
}
