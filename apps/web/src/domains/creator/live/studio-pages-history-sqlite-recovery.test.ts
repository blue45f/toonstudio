import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { openStudioLocalDatabase } from "../studio-local-database";
import { createDefaultStudioPagesHistoryDurableRuntime } from "../studio-pages-history-durable-runtime";
import { createStudioPagesHistorySqliteRecovery, StudioPagesHistorySqliteRecovery } from "../studio-pages-history-sqlite-recovery";

import type {
  StudioLocalDatabase,
  StudioSqliteApiHandle,
} from "../studio-local-database";
import type { StudioHistoryJournalNavigationTarget } from "../studio-pages-history-command-journal";

const IDENTITY = Object.freeze({
  documentId: "history-sqlite-test",
  documentVersion: 1,
  engineVersion: "studio-pages-history-command-journal-1",
});
const opened: StudioLocalDatabase[] = [];
let sqlite3: StudioSqliteApiHandle;

beforeAll(async () => {
  const module = await import("@sqlite.org/sqlite-wasm");
  sqlite3 = (await module.default()) as unknown as StudioSqliteApiHandle;
});

afterAll(async () => {
  for (const database of opened) await database.close();
});

async function openMemoryDatabase(): Promise<StudioLocalDatabase> {
  const database = await openStudioLocalDatabase({
    vfs: "memory",
    loadSqlite: () => Promise.resolve(sqlite3),
  });
  opened.push(database);
  return database;
}

function target(elementCount: number): StudioHistoryJournalNavigationTarget {
  return {
    historyIndex: elementCount,
    pages: [{
      id: "page-sqlite",
      elements: Array.from({ length: elementCount }, (_, index) => ({ id: `element-${index}` })),
      canvasH: 2_000,
    }],
  };
}

function transition(previousCount: number, nextCount: number) {
  return {
    mutationKind: "elements.commit",
    previousPages: target(previousCount).pages,
    nextPages: target(nextCount).pages,
    previousHistoryIndex: previousCount,
    nextHistoryIndex: nextCount,
  };
}

describe("Studio pages history SQLite recovery", () => {
  it("stores a CRC-valid contiguous frontier and compacts through alternating A/B snapshots", async () => {
    const database = await openMemoryDatabase();
    const first = createStudioPagesHistorySqliteRecovery({ database, identity: IDENTITY });
    await first.acquireWriter({ ownerId: "writer-a" });
    await first.appendCommand({
      id: "operation-1",
      pageId: "page-sqlite",
      revision: 1,
      payload: new Uint8Array([1, 2, 3]),
    });
    await first.compact({
      id: "checkpoint-2",
      pageId: "page-sqlite",
      revision: 2,
      payload: new Uint8Array([4, 5, 6, 7]),
      compactThroughSequence: 1,
    });
    await first.appendCommand({
      id: "operation-3",
      pageId: "page-sqlite",
      revision: 3,
      payload: new Uint8Array([8, 9]),
    });

    const reopened = createStudioPagesHistorySqliteRecovery({ database, identity: IDENTITY });
    const scan = await reopened.scanLatest();
    expect(scan).toMatchObject({
      lastSequence: 3,
      selectedSlot: "a",
      ignoredSlots: [],
      totalPayloadBytes: 6,
    });
    expect(scan.entries.map(({ kind, sequence }) => ({ kind, sequence }))).toEqual([
      { kind: "checkpoint", sequence: 2 },
      { kind: "operation", sequence: 3 },
    ]);
    expect(await reopened.readLatestPayload()).toEqual(new Uint8Array([8, 9]));
  });

  it("cuts recovery at a torn SQL row instead of exposing a later frontier", async () => {
    const database = await openMemoryDatabase();
    const recovery = createStudioPagesHistorySqliteRecovery({ database, identity: IDENTITY });
    await recovery.acquireWriter({ ownerId: "writer-a" });
    await recovery.appendCommand({
      id: "operation-1",
      pageId: "page-sqlite",
      revision: 1,
      payload: new Uint8Array([11]),
    });
    await database.appendJournalEntry(`history:${IDENTITY.documentId}`, {
      seq: 2,
      payload: "{\"format\":\"torn",
      crc32: 0,
    });

    const reopened = createStudioPagesHistorySqliteRecovery({ database, identity: IDENTITY });
    const scan = await reopened.scanLatest();
    expect(scan.lastSequence).toBe(1);
    expect(scan.entries).toHaveLength(1);
    expect(await reopened.readLatestPayload()).toEqual(new Uint8Array([11]));
  });

  it("is the product default and restores the verified undo frontier on reopen", async () => {
    const database = await openMemoryDatabase();
    const first = await createDefaultStudioPagesHistoryDurableRuntime({
      initialTarget: target(0),
      openDatabase: () => Promise.resolve(database),
    });
    expect(first.persistenceKind).toBe("sqlite-opfs");
    first.recordTransition(transition(0, 1));
    await first.flush();
    await first.close();

    const reopened = await createDefaultStudioPagesHistoryDurableRuntime({
      initialTarget: target(1),
      openDatabase: () => Promise.resolve(database),
    });
    expect(reopened.persistenceKind).toBe("sqlite-opfs");
    expect(reopened.recordUndo(target(0))).toBe("recorded");
    await reopened.flush();
    await reopened.close();
  });

  it("rebases rather than applying a durable frontier to a different autosave generation", async () => {
    const database = await openMemoryDatabase();
    const first = await createDefaultStudioPagesHistoryDurableRuntime({
      initialTarget: target(0),
      openDatabase: () => Promise.resolve(database),
    });
    first.recordTransition(transition(0, 1));
    await first.flush();
    await first.close();

    const mismatched = await createDefaultStudioPagesHistoryDurableRuntime({
      initialTarget: target(3),
      openDatabase: () => Promise.resolve(database),
    });
    expect(mismatched.recordUndo(target(2))).toBe("rebased");
    await mismatched.close();
  });

  it("writer 획득 뒤 복구 payload 조회가 실패하면 해제하고 같은 저장소를 즉시 다시 연다", async () => {
    const database = await openMemoryDatabase();
    const failure = new Error("writer 획득 후 복구 payload 읽기 실패");
    const readPayload = vi.spyOn(StudioPagesHistorySqliteRecovery.prototype, "readLatestPayload")
      .mockRejectedValueOnce(failure);
    const acquireWriter = vi.spyOn(StudioPagesHistorySqliteRecovery.prototype, "acquireWriter");
    const abort = vi.spyOn(StudioPagesHistorySqliteRecovery.prototype, "abort");
    let reopened: Awaited<ReturnType<typeof createDefaultStudioPagesHistoryDurableRuntime>> | null = null;
    try {
      await expect(createDefaultStudioPagesHistoryDurableRuntime({
        initialTarget: target(0),
        openDatabase: () => Promise.resolve(database),
      }, {
        navigator: { storage: {} },
        crypto: { randomUUID: () => "11111111-1111-4111-8111-111111111111" },
      })).rejects.toBe(failure);
      expect(acquireWriter).toHaveBeenCalledOnce();
      expect(abort).toHaveBeenCalledOnce();
      expect(abort.mock.contexts[0]).toBe(acquireWriter.mock.contexts[0]);
      expect(readPayload.mock.contexts[0]).toBe(acquireWriter.mock.contexts[0]);

      // clock를 전진시키지 않고 다른 owner가 같은 DB의 writer를 다시 획득해야 한다.
      reopened = await createDefaultStudioPagesHistoryDurableRuntime({
        initialTarget: target(0),
        openDatabase: () => Promise.resolve(database),
      }, {
        navigator: { storage: {} },
        crypto: { randomUUID: () => "22222222-2222-4222-8222-222222222222" },
      });
      expect(reopened.persistenceKind).toBe("sqlite-opfs");
      expect(acquireWriter).toHaveBeenCalledTimes(2);
      expect(readPayload).toHaveBeenCalledTimes(2);
      reopened.recordTransition(transition(0, 1));
      await reopened.flush();
      expect(reopened.replayPlan()).toMatchObject({ recordCount: 1 });
      expect(reopened.durabilityStatus()).toMatchObject({
        state: "durable",
        persistenceKind: "sqlite-opfs",
      });
    } finally {
      try {
        await reopened?.close();
      } finally {
        readPayload.mockRestore();
        acquireWriter.mockRestore();
        abort.mockRestore();
      }
    }
  });

  it("완료한 체크포인트는 문서 잠금을 유지하면서 다음 history writer를 막지 않는다", async () => {
    const database = await openMemoryDatabase();
    const locks = {
      async request<T>(
        _name: string,
        _options: { readonly mode: "exclusive"; readonly signal?: AbortSignal },
        callback: (lock: unknown) => T | PromiseLike<T>,
      ): Promise<T> { return await callback({}); },
    };
    const first = await createDefaultStudioPagesHistoryDurableRuntime({
      initialTarget: target(0), openDatabase: async () => database,
    }, { navigator: { storage: {}, locks }, crypto: { randomUUID: () => "writer-first" } });
    let next: Awaited<ReturnType<typeof createDefaultStudioPagesHistoryDurableRuntime>> | null = null;
    try {
      first.recordTransition(transition(0, 1));
      await first.flush();
      // 이전 runtime을 닫거나 TTL을 전진시키지 않는다. 같은 탭의 새 세대가 실제 DB를 연다.
      next = await createDefaultStudioPagesHistoryDurableRuntime({
        initialTarget: target(1), openDatabase: async () => database,
      }, { navigator: { storage: {}, locks }, crypto: { randomUUID: () => "writer-next" } });
      expect(next.persistenceKind).toBe("sqlite-opfs");
      next.recordTransition(transition(1, 2));
      await next.flush();
      expect(next.durabilityStatus().durable).toBe(true);
      expect(next.replayPlan()).toMatchObject({ recordCount: 2 });
    } finally {
      await next?.close();
      await first.close();
    }
  });

  it("lease 해제 저장이 실패해도 원 writer의 정리 권한을 유지해 저장소 회복 뒤 해제한다", async () => {
    const database = await openMemoryDatabase();
    const first = createStudioPagesHistorySqliteRecovery({ database, identity: IDENTITY });
    const next = createStudioPagesHistorySqliteRecovery({ database, identity: IDENTITY });
    await first.acquireWriter({ ownerId: "release-first" });
    const failure = new Error("해제 기록 저장 실패");
    const save = vi.spyOn(database, "kvSet").mockRejectedValueOnce(failure);
    try {
      await expect(first.releaseWriter()).rejects.toBe(failure);
      await expect(next.acquireWriter({ ownerId: "release-next" })).rejects.toThrow("busy");
      // 장애가 해제되면 원 권위의 close가 같은 lease를 해제해야 한다. TTL은 전진시키지 않는다.
      await first.abort();
      await expect(next.acquireWriter({ ownerId: "release-next" })).resolves.toMatchObject({ ownerId: "release-next" });
    } finally { save.mockRestore(); await next.abort(); await first.abort(); }
  });

  it("저장과 writer 해제가 함께 실패하면 원인과 정리 오류를 모두 보존한다", async () => {
    const database = await openMemoryDatabase();
    const locks = { async request<T>(_name: string, _options: { readonly mode: "exclusive" }, callback: (lock: unknown) => T | PromiseLike<T>): Promise<T> { return await callback({}); } };
    const runtime = await createDefaultStudioPagesHistoryDurableRuntime({ initialTarget: target(0), openDatabase: async () => database }, { navigator: { locks } });
    const failure = new Error("체크포인트 실패");
    const releaseFailure = new Error("해제 실패");
    const compact = vi.spyOn(StudioPagesHistorySqliteRecovery.prototype, "compact").mockRejectedValueOnce(failure);
    const release = vi.spyOn(StudioPagesHistorySqliteRecovery.prototype, "releaseWriter").mockRejectedValueOnce(releaseFailure);
    try {
      runtime.rebase(target(1));
      await runtime.flush();
      const cause = runtime.durabilityStatus().cause;
      expect(cause).toBeInstanceOf(AggregateError);
      expect(cause).toMatchObject({ cause: failure, errors: [failure, releaseFailure] });
    } finally { compact.mockRestore(); release.mockRestore(); await runtime.close(); }
  });

  it("fences a second writer until the persisted lease is released", async () => {
    const database = await openMemoryDatabase();
    let now = 10_000;
    const first = createStudioPagesHistorySqliteRecovery({
      database,
      identity: IDENTITY,
      now: () => now,
    });
    const second = createStudioPagesHistorySqliteRecovery({
      database,
      identity: IDENTITY,
      now: () => now,
    });
    await first.acquireWriter({ ownerId: "writer-a" });
    await expect(second.acquireWriter({ ownerId: "writer-b" })).rejects.toThrow(/lease is busy/);
    await first.abort();
    now += 1;
    await expect(second.acquireWriter({ ownerId: "writer-b" })).resolves.toMatchObject({
      ownerId: "writer-b",
      epoch: 2,
    });
    await second.abort();
  });

  it("renews its own uncontested lease during a long editing session", async () => {
    const database = await openMemoryDatabase();
    let now = 20_000;
    const recovery = createStudioPagesHistorySqliteRecovery({
      database,
      identity: IDENTITY,
      now: () => now,
    });
    await recovery.acquireWriter({ ownerId: "long-session" });
    now += 31_000;
    await expect(recovery.appendCommand({
      id: "after-idle",
      pageId: "page-sqlite",
      revision: 1,
      payload: new Uint8Array([42]),
    })).resolves.toMatchObject({ sequence: 1 });
    await recovery.abort();
  });

  it("alternates snapshot slots across checkpoints and falls back to checkpoint journal entry when snapshots are missing", async () => {
    const database = await openMemoryDatabase();
    const recovery = createStudioPagesHistorySqliteRecovery({
      database,
      identity: IDENTITY,
      now: () => 30_000,
    });
    await recovery.acquireWriter({ ownerId: "slot-writer" });
    await recovery.appendCommand({
      id: "op-1",
      pageId: "page-sqlite",
      revision: 1,
      payload: new Uint8Array([1]),
    });
    await recovery.compact({
      id: "cp-2",
      pageId: "page-sqlite",
      revision: 2,
      payload: new Uint8Array([1, 2]),
      compactThroughSequence: 1,
    });
    await recovery.appendCommand({
      id: "op-3",
      pageId: "page-sqlite",
      revision: 3,
      payload: new Uint8Array([3]),
    });
    await recovery.compact({
      id: "cp-4",
      pageId: "page-sqlite",
      revision: 4,
      payload: new Uint8Array([3, 4]),
      compactThroughSequence: 3,
    });
    const reopened = createStudioPagesHistorySqliteRecovery({
      database,
      identity: IDENTITY,
    });
    const scanWithSnapshots = await reopened.scanLatest();
    expect(scanWithSnapshots.selectedSlot).toBe("b");
    await database.putJournalSnapshot(`history:${IDENTITY.documentId}`, {
      slot: 0,
      seq: 2,
      payload: "corrupt",
      crc32: 0,
    });
    await database.putJournalSnapshot(`history:${IDENTITY.documentId}`, {
      slot: 1,
      seq: 4,
      payload: "corrupt",
      crc32: 0,
    });
    const scanFallback = await reopened.scanLatest();
    expect(scanFallback.lastSequence).toBe(4);
    expect([...((await reopened.readLatestPayload()) ?? [])]).toEqual([3, 4]);
    await recovery.abort();
  });
});

