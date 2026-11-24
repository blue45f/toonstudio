import type { BrowserKvFinding } from "./studio-browser-kv-findings";

const memoryBackend = `
  class MemoryBackend {
    private readonly store = new Map<string, Uint8Array>();
    remove(key: string) {
      this.store.delete(key);
      (this.store)!.delete(key);
      this['store'].delete(key);
    }
  }
`;

export const browserKvDeleteCases = [
  {
    name: "IndexedDB 지원 여부를 확인하는 파일의 메모리 Map 삭제",
    source: `${memoryBackend}\nconst supported = typeof indexedDB !== "undefined";`,
    expected: [],
  },
  {
    name: "서로 다른 클래스의 같은 이름 필드에서 메모리와 IndexedDB 삭제 구분",
    source: `${memoryBackend}
      class DatabaseBackend {
        constructor(private readonly store: IDBObjectStore) {}
        remove(key: string) { this.store["delete"](key); }
      }
    `,
    expected: [{ kind: "indexeddb-cleanup", call: 'this.store["delete"](key)' }],
  },
  {
    name: "메모리 또는 IndexedDB가 될 수 있는 객체의 삭제",
    source: `
      class MemoryCache { readonly store = new Map<number, number>(); }
      declare const dbStore: IDBObjectStore;
      declare const useMemory: boolean;
      const both = useMemory ? new MemoryCache() : { store: dbStore };
      both.store.delete(1);
    `,
    expected: [{ kind: "indexeddb-cleanup", call: "both.store.delete(1)" }],
  },
  {
    name: "지역 Map과 이름이 같은 콜백 매개변수의 IndexedDB 쓰기와 삭제",
    source: `
      declare function withStore(run: (store: IDBObjectStore) => void): void;
      const store: Map<string, number> = new Map();
      store.delete("cached");
      indexedDB.open("project", 1);
      withStore(store => { store.put(42, "row"); store.delete("row"); });
    `,
    expected: [
      { kind: "indexeddb-open", call: 'indexedDB.open("project",1)' },
      { kind: "indexeddb-write", call: 'store.put(42,"row")' },
      { kind: "indexeddb-cleanup", call: 'store.delete("row")' },
    ],
  },
  {
    name: "Dexie 테이블과 idb 데이터베이스의 삭제",
    source: `
      import Dexie from "dexie";
      import { openDB } from "idb";
      const db = new Dexie("project");
      db.table("frames").delete("old");
      const idb = await openDB("archive");
      await idb.delete("frames", "old");
    `,
    expected: [
      { kind: "indexeddb-wrapper", call: 'newDexie("project")' },
      { kind: "indexeddb-cleanup", call: 'db.table("frames").delete("old")' },
      { kind: "indexeddb-wrapper", call: 'openDB("archive")' },
      { kind: "indexeddb-cleanup", call: 'idb.delete("frames","old")' },
    ],
  },
  {
    name: "Map이라는 이름의 주입 생성자가 만든 객체 저장소 삭제",
    source: `
      function clearRow(Map: new () => IDBObjectStore) {
        const store = new Map();
        store.delete("row");
      }
    `,
    expected: [{ kind: "indexeddb-cleanup", call: 'store.delete("row")' }],
  },
  {
    name: "지역 Map 변수를 실제 객체 저장소로 재할당한 뒤 삭제",
    source: `
      function removeFrom(dbStore: IDBObjectStore) {
        let store: Map<string, number> | IDBObjectStore = new Map();
        store = dbStore;
        store.delete("row");
      }
      class DatabaseBackend {
        readonly store: Map<string, number> | IDBObjectStore = new Map();
        constructor(dbStore: IDBObjectStore) { this.store = dbStore; }
        remove() { this.store.delete("row"); }
      }
    `,
    expected: [
      { kind: "indexeddb-cleanup", call: 'store.delete("row")' },
      { kind: "indexeddb-cleanup", call: 'this.store.delete("row")' },
    ],
  },
] as const satisfies ReadonlyArray<{
  name: string;
  source: string;
  expected: readonly Pick<BrowserKvFinding, "kind" | "call">[];
}>;
