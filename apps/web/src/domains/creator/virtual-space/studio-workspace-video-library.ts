import type { StudioBotRecording } from "./studio-virtual-space-bot-recording";

export interface WorkspaceVideoEntry {
  readonly scope: string;
  readonly recording: StudioBotRecording;
}

const META = "recordings";
const VIDEO = "video";

function openLibrary(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("toonstudio-workspace-recordings", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore(META).createIndex("scope", "scope");
      db.createObjectStore(VIDEO);
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function access<T>(stores: string[], mode: IDBTransactionMode, operation: (tx: IDBTransaction) => IDBRequest<T>) {
  const db = await openLibrary();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      const request = operation(tx);
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error ?? new Error("녹화 저장소 작업을 마치지 못했습니다."));
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function listWorkspaceVideos(scope: string): Promise<WorkspaceVideoEntry[]> {
  const entries = await access<WorkspaceVideoEntry[]>([META], "readonly", tx => tx.objectStore(META).index("scope").getAll(scope));
  return entries.sort((a, b) => b.recording.createdAt - a.recording.createdAt);
}

export function saveWorkspaceVideo(entry: WorkspaceVideoEntry, blob: Blob) {
  const key = [entry.scope, entry.recording.id];
  return access([META, VIDEO], "readwrite", tx => {
    tx.objectStore(VIDEO).put(blob, key);
    return tx.objectStore(META).put(entry, key);
  });
}

export function readWorkspaceVideo(scope: string, id: string): Promise<Blob | undefined> {
  return access<Blob | undefined>([VIDEO], "readonly", tx => tx.objectStore(VIDEO).get([scope, id]));
}

export function removeWorkspaceVideo(scope: string, id: string) {
  return access([META, VIDEO], "readwrite", tx => {
    tx.objectStore(VIDEO).delete([scope, id]);
    return tx.objectStore(META).delete([scope, id]);
  });
}
