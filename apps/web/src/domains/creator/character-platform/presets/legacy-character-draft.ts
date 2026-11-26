/** 예전 편집기의 기기 작업 하나를 읽는다. 읽는 과정에서 저장소를 생성하거나 갱신하지 않는다. */
export function readLegacyCharacterDraft(factory: IDBFactory): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const request = factory.open("toonstudio-character-lab-work");
    let absent = false;
    let blocked = false;
    request.onupgradeneeded = () => {
      absent = true;
      request.transaction?.abort();
    };
    request.onblocked = () => { blocked = true; reject(new Error("draft-blocked")); };
    request.onerror = () => absent ? resolve(null) : reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      if (blocked || !db.objectStoreNames.contains("recipes")) {
        db.close();
        if (!blocked) resolve(null);
        return;
      }
      const tx = db.transaction("recipes", "readonly");
      const cursor = tx.objectStore("recipes").openCursor(null, "prev");
      let value: unknown;
      cursor.onsuccess = () => { value = cursor.result?.value; };
      tx.onabort = () => { db.close(); reject(tx.error ?? new Error("draft-read-failed")); };
      tx.oncomplete = () => {
        db.close();
        if (typeof value === "string") resolve(value);
        else if (value === undefined) resolve(null);
        else reject(new Error("invalid-draft"));
      };
    };
  });
}
