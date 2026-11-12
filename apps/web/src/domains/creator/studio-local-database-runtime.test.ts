import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_STUDIO_BRUSH_SNAPSHOT } from "./brush/studio-brush-library";
import { openProductBrushLibraryRepository } from "./brush/studio-brush-library-sqlite-repository";
import {
  SqliteUnavailableError,
  type StudioLocalDatabase,
} from "./studio-local-database";
import {
  acquireStudioLocalDatabase,
  closeStudioLocalDatabaseRuntime,
  probeStudioLocalDatabaseRuntime,
  resetFailedStudioLocalDatabaseOwnership,
} from "./studio-local-database-runtime";

const productWorker = vi.hoisted(() => ({
  acquire: vi.fn<() => Promise<StudioLocalDatabase>>(),
  close: vi.fn<() => Promise<void>>(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

vi.mock("./studio-local-database-worker-client", () => ({
  acquireStudioLocalDatabaseWorker: productWorker.acquire,
  closeStudioLocalDatabaseWorker: productWorker.close,
}));

afterEach(async () => {
  await closeStudioLocalDatabaseRuntime();
  productWorker.acquire.mockReset();
  productWorker.close.mockReset();
});

describe("studio local database runtime", () => {
  it("routes the Window product authority through one lazy DedicatedWorker proxy", async () => {
    const database = { close: vi.fn(async () => undefined) } as unknown as StudioLocalDatabase;
    productWorker.acquire.mockResolvedValue(database);
    productWorker.close.mockResolvedValue(undefined);

    const [first, second] = await Promise.all([
      acquireStudioLocalDatabase(),
      acquireStudioLocalDatabase(),
    ]);

    expect(first).toBe(database);
    expect(second).toBe(database);
    expect(productWorker.acquire).toHaveBeenCalledOnce();
    await closeStudioLocalDatabaseRuntime();
    expect(productWorker.close).toHaveBeenCalledOnce();
    expect(database.close).not.toHaveBeenCalled();
  });

  it("serializes a same-tick product acquire, close, and reopen into distinct generations", async () => {
    const firstDatabase = { close: vi.fn(async () => undefined) } as unknown as StudioLocalDatabase;
    const secondDatabase = { close: vi.fn(async () => undefined) } as unknown as StudioLocalDatabase;
    productWorker.acquire
      .mockResolvedValueOnce(firstDatabase)
      .mockResolvedValueOnce(secondDatabase);
    productWorker.close.mockResolvedValue(undefined);

    const firstOpening = acquireStudioLocalDatabase();
    const firstClosing = closeStudioLocalDatabaseRuntime();
    const secondOpening = acquireStudioLocalDatabase();

    await expect(firstOpening).resolves.toBe(firstDatabase);
    await expect(firstClosing).resolves.toBeUndefined();
    await expect(secondOpening).resolves.toBe(secondDatabase);

    expect(productWorker.acquire).toHaveBeenCalledTimes(2);
    expect(productWorker.close).toHaveBeenCalledOnce();
    expect(firstDatabase.close).not.toHaveBeenCalled();
    expect(secondDatabase.close).not.toHaveBeenCalled();
  });

  it("reports SQLite and OPFS ready only after the product DedicatedWorker opens", async () => {
    const database = { close: vi.fn(async () => undefined) } as unknown as StudioLocalDatabase;
    productWorker.acquire.mockResolvedValue(database);
    productWorker.close.mockResolvedValue(undefined);

    await expect(probeStudioLocalDatabaseRuntime()).resolves.toEqual({
      wasm: true,
      opfs: true,
    });
    await expect(acquireStudioLocalDatabase()).resolves.toBe(database);

    expect(productWorker.acquire).toHaveBeenCalledOnce();
  });

  it("reports the retained product-runtime failure without retrying behind diagnostics", async () => {
    productWorker.acquire.mockRejectedValue(new Error("DedicatedWorker OPFS unavailable"));
    productWorker.close.mockResolvedValue(undefined);

    await expect(probeStudioLocalDatabaseRuntime()).resolves.toEqual({
      wasm: false,
      opfs: false,
      reason: "DedicatedWorker OPFS unavailable",
    });
    await expect(probeStudioLocalDatabaseRuntime()).resolves.toEqual({
      wasm: false,
      opfs: false,
      reason: "DedicatedWorker OPFS unavailable",
    });

    expect(productWorker.acquire).toHaveBeenCalledOnce();
  });

  it("coalesces concurrent lazy consumers onto one database open", async () => {
    const close = vi.fn(async () => undefined);
    const database = { close } as unknown as StudioLocalDatabase;
    const open = vi.fn(async () => database);

    const [history, tournament, brushLibrary] = await Promise.all([
      acquireStudioLocalDatabase(open),
      acquireStudioLocalDatabase(open),
      acquireStudioLocalDatabase(open),
    ]);

    expect(open).toHaveBeenCalledOnce();
    expect(history).toBe(database);
    expect(tournament).toBe(database);
    expect(brushLibrary).toBe(database);
    await closeStudioLocalDatabaseRuntime();
    expect(close).toHaveBeenCalledOnce();
  });

  it("retains a failed open for the session but permits retry after explicit reset", async () => {
    const failure = new Error("opfs unavailable");
    const firstOpen = vi.fn(async (): Promise<StudioLocalDatabase> => {
      throw failure;
    });
    await expect(acquireStudioLocalDatabase(firstOpen)).rejects.toBe(failure);
    await expect(acquireStudioLocalDatabase(firstOpen)).rejects.toBe(failure);
    expect(firstOpen).toHaveBeenCalledOnce();

    await closeStudioLocalDatabaseRuntime();
    const database = { close: vi.fn(async () => undefined) } as unknown as StudioLocalDatabase;
    await expect(acquireStudioLocalDatabase(async () => database)).resolves.toBe(database);
  });

  it("명시 소유권 재시도는 정상 연결을 닫거나 새 Worker를 열지 않는다", async () => {
    const database = { close: vi.fn(async () => undefined) } as unknown as StudioLocalDatabase;
    productWorker.acquire.mockResolvedValue(database);
    await expect(resetFailedStudioLocalDatabaseOwnership()).resolves.toBe(false);
    await acquireStudioLocalDatabase();
    await expect(resetFailedStudioLocalDatabaseOwnership()).resolves.toBe(false);
    expect(productWorker.acquire).toHaveBeenCalledOnce();
    expect(productWorker.close).not.toHaveBeenCalled();
    expect(database.close).not.toHaveBeenCalled();
  });

  it("소유권 경합 외의 실패는 재시도로 폐기하지 않는다", async () => {
    const failure = new Error("disk unavailable");
    productWorker.acquire.mockRejectedValue(failure);
    await expect(acquireStudioLocalDatabase()).rejects.toBe(failure);
    await expect(resetFailedStudioLocalDatabaseOwnership()).resolves.toBe(false);
    await expect(acquireStudioLocalDatabase()).rejects.toBe(failure);
    expect(productWorker.acquire).toHaveBeenCalledOnce();
    expect(productWorker.close).not.toHaveBeenCalled();
  });

  it("실패한 동일 세대만 한 번 닫고 다음 명시 획득에서만 새 Worker를 연다", async () => {
    const failure = new SqliteUnavailableError("Studio OPFS SQLite is already owned by another page");
    const database = { close: vi.fn(async () => undefined) } as unknown as StudioLocalDatabase;
    productWorker.acquire.mockRejectedValueOnce(failure).mockResolvedValueOnce(database);
    productWorker.close.mockResolvedValue(undefined);
    await expect(acquireStudioLocalDatabase()).rejects.toBe(failure);
    await expect(Promise.all([
      resetFailedStudioLocalDatabaseOwnership(), resetFailedStudioLocalDatabaseOwnership(),
    ])).resolves.toEqual([true, false]);
    expect(productWorker.close).toHaveBeenCalledOnce();
    expect(productWorker.acquire).toHaveBeenCalledOnce();
    await expect(acquireStudioLocalDatabase()).resolves.toBe(database);
    expect(productWorker.acquire).toHaveBeenCalledTimes(2);
    expect(database.close).not.toHaveBeenCalled();
  });

  it("실패를 기다리는 동안 다른 소비자가 교체한 세대는 건드리지 않는다", async () => {
    const pending = deferred<StudioLocalDatabase>();
    const replacement = { close: vi.fn(async () => undefined) } as unknown as StudioLocalDatabase;
    productWorker.acquire.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(replacement);
    productWorker.close.mockResolvedValue(undefined);
    const oldOpening = acquireStudioLocalDatabase();
    const oldFailure = oldOpening.catch(() => undefined);
    const retry = resetFailedStudioLocalDatabaseOwnership();
    const otherClose = closeStudioLocalDatabaseRuntime({ preserveBrushMemorySession: true });
    const nextOpening = acquireStudioLocalDatabase();
    pending.reject(new SqliteUnavailableError("Studio OPFS SQLite is already owned by another page"));
    await Promise.all([oldFailure, otherClose]);
    await expect(retry).resolves.toBe(false);
    await expect(nextOpening).resolves.toBe(replacement);
    expect(productWorker.close).toHaveBeenCalledOnce();
    expect(replacement.close).not.toHaveBeenCalled();
    await expect(acquireStudioLocalDatabase()).resolves.toBe(replacement);
    expect(productWorker.acquire).toHaveBeenCalledTimes(2);
  });

  it("다른 소유자가 유지되면 명시 재시도 한 번 뒤에도 실패를 유지한다", async () => {
    const failure = new SqliteUnavailableError("Studio OPFS SQLite is already owned by another page");
    productWorker.acquire.mockRejectedValue(failure);
    productWorker.close.mockResolvedValue(undefined);
    await expect(acquireStudioLocalDatabase()).rejects.toBe(failure);
    await expect(resetFailedStudioLocalDatabaseOwnership()).resolves.toBe(true);
    await expect(acquireStudioLocalDatabase()).rejects.toBe(failure);
    await expect(acquireStudioLocalDatabase()).rejects.toBe(failure);
    expect(productWorker.acquire).toHaveBeenCalledTimes(2);
    expect(productWorker.close).toHaveBeenCalledOnce();
  });

  it("invalidates the brush catalog generation when the shared database session closes", async () => {
    productWorker.acquire.mockRejectedValue(
      new SqliteUnavailableError("Studio OPFS is already owned by another page"),
    );
    productWorker.close.mockResolvedValue(undefined);

    const first = await openProductBrushLibraryRepository();
    await first.repository.put({
      ...DEFAULT_STUDIO_BRUSH_SNAPSHOT,
      id: "session-brush",
      name: "첫 세션",
      createdAt: 1,
      updatedAt: 1,
      pinned: false,
      lastUsedAt: null,
    });

    await closeStudioLocalDatabaseRuntime();
    const reopened = await openProductBrushLibraryRepository();

    expect(reopened).not.toBe(first);
    expect(reopened.authority).toBe("memory-session");
    await expect(reopened.repository.getById("session-brush")).resolves.toBeNull();
    expect(productWorker.acquire).toHaveBeenCalledTimes(2);
  });

  it("명시 소유권 재시도는 현재 탭의 미저장 브러시를 보존한다", async () => {
    productWorker.acquire.mockRejectedValue(
      new SqliteUnavailableError("Studio OPFS is already owned by another page"),
    );
    productWorker.close.mockResolvedValue(undefined);

    const first = await openProductBrushLibraryRepository();
    await first.repository.put({
      ...DEFAULT_STUDIO_BRUSH_SNAPSHOT,
      id: "retained-session-brush",
      name: "현재 탭 보존 브러시",
      createdAt: 1,
      updatedAt: 1,
      pinned: false,
      lastUsedAt: null,
    });

    await expect(resetFailedStudioLocalDatabaseOwnership()).resolves.toBe(true);
    const reopened = await openProductBrushLibraryRepository();

    expect(reopened).toBe(first);
    await expect(reopened.repository.getById("retained-session-brush")).resolves
      .toMatchObject({ name: "현재 탭 보존 브러시" });
    expect(productWorker.acquire).toHaveBeenCalledOnce();
  });

  it("preserves a pending fallback when another consumer closes the failed DB generation first", async () => {
    const databaseOpening = deferred<StudioLocalDatabase>();
    productWorker.acquire.mockReturnValue(databaseOpening.promise);
    productWorker.close.mockResolvedValue(undefined);

    const otherConsumer = acquireStudioLocalDatabase();
    const closeAfterFailure = otherConsumer.catch(async () => {
      await closeStudioLocalDatabaseRuntime({ preserveBrushMemorySession: true });
    });
    const brushOpening = openProductBrushLibraryRepository();
    const pendingSave = brushOpening.then((product) => product.repository.put({
      ...DEFAULT_STUDIO_BRUSH_SNAPSHOT,
      id: "pending-session-brush",
      name: "경합 중 보존 브러시",
      createdAt: 1,
      updatedAt: 1,
      pinned: false,
      lastUsedAt: null,
    }));

    databaseOpening.reject(
      new SqliteUnavailableError("Studio OPFS is already owned by another page"),
    );
    await Promise.all([closeAfterFailure, pendingSave]);

    const reopened = await openProductBrushLibraryRepository();
    await expect(brushOpening).resolves.toBe(reopened);
    await expect(reopened.repository.getById("pending-session-brush")).resolves
      .toMatchObject({ name: "경합 중 보존 브러시" });
    expect(productWorker.acquire).toHaveBeenCalledOnce();
  });
});
