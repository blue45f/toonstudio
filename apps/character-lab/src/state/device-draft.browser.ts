import { failVisible } from "../contracts";

const STORE = "recipes";

async function openDraftDb(): Promise<IDBDatabase> {
  try {
    return await new Promise<IDBDatabase>((resolve, reject) => {
      const request = window.indexedDB.open("toonstudio-character-lab-work", 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { autoIncrement: true });
      request.onerror = () => reject(request.error);
      let blocked = false;
      request.onblocked = () => {
        blocked = true;
        reject(new Error("다른 캐릭터 랩 탭을 닫고 다시 시도하세요."));
      };
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) db.close();
        else {
          db.onversionchange = () => db.close();
          resolve(db);
        }
      };
    });
  } catch (error) {
    throw failVisible("draft-db-unavailable", "브라우저 저장소를 열 수 없습니다. 레시피 파일로 저장할 수 있습니다.", error);
  }
}

/** 키만 조회하면 페인트가 큰 작업도 편집 화면을 열 때 역직렬화하지 않는다. */
export async function deviceDraftKey(): Promise<number | null> {
  const db = await openDraftDb();
  try {
    return await new Promise<number | null>((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).openKeyCursor(null, "prev");
      request.onsuccess = () => resolve(request.result ? Number(request.result.key) : null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function readDeviceDraft(): Promise<{ key: number; text: string }> {
  const db = await openDraftDb();
  try {
    return await new Promise<{ key: number; text: string }>((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).openCursor(null, "prev");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) reject(failVisible("draft-empty", "저장된 작업이 없습니다."));
        else if (typeof cursor.value !== "string") reject(failVisible("draft-invalid", "저장한 작업을 읽을 수 없습니다. 레시피 파일을 불러오세요."));
        else resolve({ key: Number(cursor.key), text: cursor.value });
      };
    });
  } finally {
    db.close();
  }
}

export async function writeDeviceDraft(text: string, expectedKey: number | null): Promise<number> {
  const db = await openDraftDb();
  try {
    return await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      let conflict = false;
      let key: number;
      const lookup = store.openKeyCursor(null, "prev");
      lookup.onsuccess = () => {
        const actual = lookup.result ? Number(lookup.result.key) : null;
        if (actual !== expectedKey) {
          conflict = true;
          tx.abort();
          return;
        }
        if (actual !== null) store.delete(actual);
        const write = store.add(text);
        write.onsuccess = () => { key = Number(write.result); };
      };
      tx.oncomplete = () => resolve(key);
      tx.onabort = () => reject(conflict
        ? failVisible("draft-changed", "다른 탭에서 작업을 저장했습니다. 저장본을 확인한 뒤 다시 저장하세요.")
        : failVisible("draft-save-failed", "브라우저에 저장할 수 없습니다. 저장 공간을 확인하거나 레시피 파일로 저장하세요.", tx.error));
    });
  } finally {
    db.close();
  }
}
