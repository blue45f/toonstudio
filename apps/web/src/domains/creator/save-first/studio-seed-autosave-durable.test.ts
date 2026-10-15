import { describe, expect, it } from "vitest";

import {
  serializeStudioAutosave,
  studioAutosaveKey,
  type StudioAutosavePayload,
  type StudioAutosaveStorage,
} from "../studio-autosave";
import type { StudioAutosaveDocumentLease } from "../studio-autosave-document-leader";
import {
  StudioAutosaveDocumentBusyError,
  persistStudioAutosaveWithOpfsPrimary,
  studioAutosaveDocumentBusy,
  withStudioAutosaveDocumentLeadership,
  type StudioAutosaveDocumentSession,
  type StudioAutosaveOpfsSession,
} from "../studio-autosave-opfs-session";
import type {
  StudioAutosaveSqlitePort,
  StudioAutosaveSqliteReadResult,
} from "../studio-autosave-sqlite-store";
import {
  persistSeedAutosaveDurably,
  type StudioSeedAutosave,
  type StudioSeedDurablePorts,
} from "./studio-seed-autosave-durable";

const WORK_ID = "doc-seed-1";
const USER_ID = "user-1";
const KEY = studioAutosaveKey({ userId: USER_ID, workId: WORK_ID });
const OLD_AT = "2026-10-01T00:00:00.000Z";

function body(savedAt: string, text: string): StudioAutosavePayload {
  return {
    version: 2,
    savedAt,
    title: "예제 작품",
    currentPageId: "page-1",
    pagesList: [{ id: "page-1", elements: [{ id: "text-1", type: text }], canvasH: 2_000 }],
  };
}

const seed: StudioSeedAutosave = {
  workId: WORK_ID,
  build: () => body(new Date().toISOString(), "seed"),
};

function memoryStorage(): StudioAutosaveStorage & { readonly values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

function opfsFake(options: {
  readonly latest?: "none" | "snapshot" | "cleared" | "error";
  readonly writeError?: unknown;
  readonly disposeFails?: boolean;
} = {}) {
  const writes: StudioAutosavePayload[] = [];
  let disposed = 0;
  const session = {
    async readLatest() {
      if (options.latest === "error") throw new Error("opfs read failed");
      if (options.latest === "snapshot") {
        return { state: "snapshot", savedAt: OLD_AT, payload: body(OLD_AT, "user"), sequence: 4, revision: 4 };
      }
      if (options.latest === "cleared") {
        return { state: "cleared", savedAt: OLD_AT, payload: null, sequence: 5, revision: 5 };
      }
      return null;
    },
    async write(payload: StudioAutosavePayload) {
      if (options.writeError !== undefined) throw options.writeError;
      writes.push(payload);
      return { authority: "opfs-journal", savedAt: payload.savedAt, sequence: 1, revision: 1 };
    },
    async dispose() {
      disposed += 1;
      if (options.disposeFails) throw new Error("dispose failed");
    },
  } as unknown as StudioAutosaveOpfsSession;
  return { session, writes, disposedCount: () => disposed };
}

function leaseFake(role: "leader" | "follower") {
  let released = 0;
  const lease: StudioAutosaveDocumentLease = {
    documentKey: KEY,
    lockName: "toonstudio-test-lock",
    role,
    basis: "web-lock",
    waitForLeadership: async () => role === "leader",
    release: async () => {
      released += 1;
    },
  };
  return { lease, releasedCount: () => released };
}

function sqliteFake(
  initial: StudioAutosaveSqliteReadResult = null,
  options: { readonly readFails?: boolean } = {},
) {
  const writes: Array<{ readonly key: string; readonly payload: StudioAutosavePayload }> = [];
  const port: StudioAutosaveSqlitePort = {
    async read() {
      if (options.readFails) throw new Error("sqlite read failed");
      return initial;
    },
    async write(key, payload) {
      writes.push({ key, payload });
    },
    async clear() {},
  };
  return { port, writes };
}

function portsOf(input: {
  readonly opfs?: ReturnType<typeof opfsFake> | "unsupported" | "no-session";
  readonly lease?: ReturnType<typeof leaseFake>;
  readonly sqlite?: ReturnType<typeof sqliteFake> | "unsupported";
}): StudioSeedDurablePorts {
  const lease = input.lease ?? leaseFake("leader");
  return {
    openDocumentSession: async () => {
      if (input.opfs === "unsupported") throw new Error("OPFS unavailable");
      const session = input.opfs === undefined || input.opfs === "no-session" ? null : input.opfs.session;
      const opened: StudioAutosaveDocumentSession = Object.freeze({
        role: lease.lease.role,
        session,
        lease: lease.lease,
      });
      return opened;
    },
    acquireSqlite: async () => {
      if (input.sqlite === undefined || input.sqlite === "unsupported") {
        throw new Error("SQLite unavailable");
      }
      return input.sqlite.port;
    },
    // 판정 로직만 가짜 저장소로 시험하고, 쓰기·리더십·busy 판정은 편집기가 쓰는 실제 함수를 그대로 쓴다.
    persist: persistStudioAutosaveWithOpfsPrimary,
    withLeadership: withStudioAutosaveDocumentLeadership,
    isBusy: studioAutosaveDocumentBusy,
  };
}

const userSnapshot: StudioAutosaveSqliteReadResult = Object.freeze({
  state: "snapshot",
  savedAt: OLD_AT,
  payload: body(OLD_AT, "user"),
});

describe("persistSeedAutosaveDurably", () => {
  it("편집기와 같은 소유자 키로 OPFS 에 심고 SQLite 에 미러한다", async () => {
    const opfs = opfsFake();
    const lease = leaseFake("leader");
    const sqlite = sqliteFake();
    const storage = memoryStorage();

    const outcome = await persistSeedAutosaveDurably({
      seed,
      authUserId: USER_ID,
      storage,
      ports: portsOf({ opfs, lease, sqlite }),
    });

    expect(outcome).toBe("written");
    expect(opfs.writes).toHaveLength(1);
    expect(opfs.writes[0]?.title).toBe("예제 작품");
    expect(sqlite.writes.map((write) => write.key)).toEqual([KEY]);
    expect(storage.values.size).toBe(0);
    expect(opfs.disposedCount()).toBe(1);
    expect(lease.releasedCount()).toBe(1);
  });

  it("로그인하지 않았으면 게스트 키로 심고 사용자 키는 건드리지 않는다", async () => {
    const opfs = opfsFake();
    const sqlite = sqliteFake();
    const guestKey = studioAutosaveKey({ userId: null, workId: WORK_ID });

    const outcome = await persistSeedAutosaveDurably({
      seed,
      authUserId: null,
      storage: memoryStorage(),
      ports: portsOf({ opfs, sqlite }),
    });

    expect(outcome).toBe("written");
    expect(guestKey).not.toBe(KEY);
    expect(sqlite.writes.map((write) => write.key)).toEqual([guestKey]);
  });

  it("OPFS 에 사용자 스냅샷이 있으면 덮지 않는다", async () => {
    const opfs = opfsFake({ latest: "snapshot" });
    const sqlite = sqliteFake();

    const outcome = await persistSeedAutosaveDurably({
      seed,
      authUserId: USER_ID,
      storage: memoryStorage(),
      ports: portsOf({ opfs, sqlite }),
    });

    expect(outcome).toBe("kept-existing");
    expect(opfs.writes).toHaveLength(0);
    expect(sqlite.writes).toHaveLength(0);
  });

  it("OPFS 의 삭제 표식(비운 원고)도 사용자의 것으로 보고 덮지 않는다", async () => {
    const opfs = opfsFake({ latest: "cleared" });

    const outcome = await persistSeedAutosaveDurably({
      seed,
      authUserId: USER_ID,
      storage: memoryStorage(),
      ports: portsOf({ opfs, sqlite: sqliteFake() }),
    });

    expect(outcome).toBe("kept-existing");
    expect(opfs.writes).toHaveLength(0);
  });

  it("SQLite 에 기록이 있으면 덮지 않는다", async () => {
    const opfs = opfsFake();
    const sqlite = sqliteFake(userSnapshot);

    const outcome = await persistSeedAutosaveDurably({
      seed,
      authUserId: USER_ID,
      storage: memoryStorage(),
      ports: portsOf({ opfs, sqlite }),
    });

    expect(outcome).toBe("kept-existing");
    expect(opfs.writes).toHaveLength(0);
    expect(sqlite.writes).toHaveLength(0);
  });

  it("사용자가 만진 브라우저 호환 기록은 그대로 둔다", async () => {
    const opfs = opfsFake();
    const storage = memoryStorage();
    const touched = serializeStudioAutosave(body(OLD_AT, "user-edited"));
    storage.setItem(KEY, touched);

    const outcome = await persistSeedAutosaveDurably({
      seed,
      authUserId: USER_ID,
      storage,
      ports: portsOf({ opfs, sqlite: sqliteFake() }),
    });

    expect(outcome).toBe("kept-existing");
    expect(opfs.writes).toHaveLength(0);
    expect(storage.getItem(KEY)).toBe(touched);
  });

  it("해석할 수 없는 브라우저 기록도 사용자의 것으로 보고 건드리지 않는다", async () => {
    const opfs = opfsFake();
    const storage = memoryStorage();
    storage.setItem(KEY, "{깨진 기록");

    const outcome = await persistSeedAutosaveDurably({
      seed,
      authUserId: USER_ID,
      storage,
      ports: portsOf({ opfs, sqlite: sqliteFake() }),
    });

    expect(outcome).toBe("kept-existing");
    expect(opfs.writes).toHaveLength(0);
    expect(storage.getItem(KEY)).toBe("{깨진 기록");
  });

  it("예전 시딩이 브라우저에 심은 원본 그대로의 기록은 내구 저장소로 옮기고 브라우저 사본을 지운다", async () => {
    const opfs = opfsFake();
    const storage = memoryStorage();
    storage.setItem(KEY, serializeStudioAutosave(body(OLD_AT, "seed")));

    const outcome = await persistSeedAutosaveDurably({
      seed,
      authUserId: USER_ID,
      storage,
      ports: portsOf({ opfs, sqlite: sqliteFake() }),
    });

    expect(outcome).toBe("written");
    expect(opfs.writes).toHaveLength(1);
    expect(storage.getItem(KEY)).toBeNull();
  });

  it("브라우저 저장소를 읽을 수 없으면 있는지 알 수 없으므로 쓰지 않는다", async () => {
    const opfs = opfsFake();
    const storage: StudioAutosaveStorage = {
      getItem: () => {
        throw new Error("storage denied");
      },
      setItem: () => {},
      removeItem: () => {},
    };

    const outcome = await persistSeedAutosaveDurably({
      seed,
      authUserId: USER_ID,
      storage,
      ports: portsOf({ opfs, sqlite: sqliteFake() }),
    });

    expect(outcome).toBe("unavailable");
    expect(opfs.writes).toHaveLength(0);
  });

  it("다른 탭이 leader 이면 쓰지 않고 리스와 세션을 정리한다", async () => {
    const opfs = opfsFake();
    const lease = leaseFake("follower");
    const sqlite = sqliteFake();

    const outcome = await persistSeedAutosaveDurably({
      seed,
      authUserId: USER_ID,
      storage: memoryStorage(),
      ports: portsOf({ opfs, lease, sqlite }),
    });

    expect(outcome).toBe("busy");
    expect(opfs.writes).toHaveLength(0);
    expect(sqlite.writes).toHaveLength(0);
    expect(opfs.disposedCount()).toBe(1);
    expect(lease.releasedCount()).toBe(1);
  });

  it("OPFS 쓰기가 다른 탭 소유로 거절되면 SQLite 로 우회하지 않고 busy 를 돌려준다", async () => {
    const opfs = opfsFake({ writeError: new StudioAutosaveDocumentBusyError() });
    const sqlite = sqliteFake();

    const outcome = await persistSeedAutosaveDurably({
      seed,
      authUserId: USER_ID,
      storage: memoryStorage(),
      ports: portsOf({ opfs, sqlite }),
    });

    expect(outcome).toBe("busy");
    expect(sqlite.writes).toHaveLength(0);
  });

  it("OPFS 쓰기가 실패해도 SQLite 가 받으면 심은 것으로 본다", async () => {
    const opfs = opfsFake({ writeError: new Error("quota exceeded") });
    const sqlite = sqliteFake();

    const outcome = await persistSeedAutosaveDurably({
      seed,
      authUserId: USER_ID,
      storage: memoryStorage(),
      ports: portsOf({ opfs, sqlite }),
    });

    expect(outcome).toBe("written");
    expect(sqlite.writes.map((write) => write.key)).toEqual([KEY]);
  });

  it("OPFS 만 있고 쓰기가 실패하면 심지 못한 것으로 알린다", async () => {
    const opfs = opfsFake({ writeError: new Error("quota exceeded") });

    const outcome = await persistSeedAutosaveDurably({
      seed,
      authUserId: USER_ID,
      storage: memoryStorage(),
      ports: portsOf({ opfs }),
    });

    expect(outcome).toBe("unavailable");
  });

  it("OPFS 세션이 없고 SQLite 만 쓸 수 있어도 심는다", async () => {
    const sqlite = sqliteFake();

    const outcome = await persistSeedAutosaveDurably({
      seed,
      authUserId: USER_ID,
      storage: memoryStorage(),
      ports: portsOf({ opfs: "no-session", sqlite }),
    });

    expect(outcome).toBe("written");
    expect(sqlite.writes.map((write) => write.key)).toEqual([KEY]);
  });

  it("OPFS 도 SQLite 도 없으면 심지 못한 것으로 알린다", async () => {
    const outcome = await persistSeedAutosaveDurably({
      seed,
      authUserId: USER_ID,
      storage: memoryStorage(),
      ports: portsOf({ opfs: "unsupported", sqlite: "unsupported" }),
    });

    expect(outcome).toBe("unavailable");
  });

  it("기존 기록을 읽지 못하면 덮지 않는다(OPFS)", async () => {
    const opfs = opfsFake({ latest: "error" });

    const outcome = await persistSeedAutosaveDurably({
      seed,
      authUserId: USER_ID,
      storage: memoryStorage(),
      ports: portsOf({ opfs, sqlite: sqliteFake() }),
    });

    expect(outcome).toBe("unavailable");
    expect(opfs.writes).toHaveLength(0);
  });

  it("기존 기록을 읽지 못하면 덮지 않는다(SQLite)", async () => {
    const opfs = opfsFake();
    const sqlite = sqliteFake(null, { readFails: true });

    const outcome = await persistSeedAutosaveDurably({
      seed,
      authUserId: USER_ID,
      storage: memoryStorage(),
      ports: portsOf({ opfs, sqlite }),
    });

    expect(outcome).toBe("unavailable");
    expect(opfs.writes).toHaveLength(0);
    expect(sqlite.writes).toHaveLength(0);
  });

  it("정리 단계가 실패해도 시딩 결과는 바뀌지 않는다", async () => {
    const opfs = opfsFake({ disposeFails: true });
    const lease = leaseFake("leader");

    const outcome = await persistSeedAutosaveDurably({
      seed,
      authUserId: USER_ID,
      storage: memoryStorage(),
      ports: portsOf({ opfs, lease, sqlite: sqliteFake() }),
    });

    expect(outcome).toBe("written");
    expect(lease.releasedCount()).toBe(1);
  });
});
