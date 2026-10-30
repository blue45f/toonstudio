import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioProductionJob } from "./studio-production-jobs";
import {
  createStudioProductionJobRepository,
  STUDIO_PRODUCTION_JOB_NAMESPACE,
  STUDIO_PRODUCTION_JOB_REMOVED_NAMESPACE,
  studioProductionJobScopeKey,
} from "./studio-production-job-repository";

import type { StudioLocalDatabase } from "../studio-local-database";

interface StorageWrite {
  readonly namespace: string;
  readonly key: string;
  readonly value: string;
}

function memoryDatabase(options: {
  readonly beforeSet?: (write: StorageWrite) => void | Promise<void>;
} = {}) {
  const values = new Map<string, string>();
  const writes: StorageWrite[] = [];
  const database: Pick<StudioLocalDatabase, "kvGet" | "kvSet"> = {
    async kvGet(namespace: string, key: string) {
      return values.get(`${namespace}:${key}`) ?? null;
    },
    async kvSet(namespace: string, key: string, value: string) {
      const write = { namespace, key, value };
      writes.push(write);
      await options.beforeSet?.(write);
      values.set(`${namespace}:${key}`, value);
    },
  };
  return { database, values, writes };
}

function deferred<Value>() {
  let resolve: (value: Value) => void = () => { throw new Error("Promise 준비 전 호출"); };
  const promise = new Promise<Value>((accept) => { resolve = accept; });
  return { promise, resolve };
}

function job(id: string) {
  return createStudioProductionJob({
    id,
    now: () => new Date("2026-09-15T00:00:00.000Z"),
    profile: "open",
    toolId: "tesseract",
    operationId: "ocr-text",
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Studio production job repository", () => {
  it("persists independent global and project scopes in SQLite KV", async () => {
    const memory = memoryDatabase();
    const repository = createStudioProductionJobRepository({
      acquireDatabase: async () => memory.database,
    });

    await repository.save([job("job_global01")]);
    await repository.save([job("job_project1")], "project-a");

    expect((await repository.load()).map(({ id }) => id)).toEqual(["job_global01"]);
    expect((await repository.load("project-a")).map(({ id }) => id)).toEqual(["job_project1"]);
    expect(memory.values.has(`${STUDIO_PRODUCTION_JOB_NAMESPACE}:global`)).toBe(true);
    expect(memory.values.has(`${STUDIO_PRODUCTION_JOB_NAMESPACE}:project:project-a`)).toBe(true);
  });

  it("removes a single job without clearing sibling history", async () => {
    const memory = memoryDatabase();
    const repository = createStudioProductionJobRepository({
      acquireDatabase: async () => memory.database,
    });
    await repository.save([job("job_00000001"), job("job_00000002")], "project-a");

    const remaining = await repository.remove("job_00000001", "project-a");
    expect(remaining.map(({ id }) => id)).toEqual(["job_00000002"]);
    expect((await repository.load("project-a")).map(({ id }) => id)).toEqual(["job_00000002"]);
    expect(await repository.loadRemovedJobIds("project-a")).toEqual(["job_00000001"]);
  });

  it("기존 배열 형식과 저장 key의 범위를 보존하고 inline projectId로 이력을 지우지 않는다", async () => {
    const memory = memoryDatabase();
    const legacy = job("job_legacy01");
    memory.values.set(`${STUDIO_PRODUCTION_JOB_NAMESPACE}:project:project-a`, JSON.stringify([legacy]));
    const repository = createStudioProductionJobRepository({ acquireDatabase: async () => memory.database });

    expect(await repository.load("project-a")).toEqual([legacy]);
    expect(await repository.loadRemovedJobIds("project-a")).toEqual([]);
    await repository.save([legacy], "project-a");
    expect(JSON.parse(memory.values.get(`${STUDIO_PRODUCTION_JOB_NAMESPACE}:project:project-a`) ?? "null"))
      .toEqual([legacy]);
    expect(memory.values.has(`${STUDIO_PRODUCTION_JOB_REMOVED_NAMESPACE}:project:project-a`)).toBe(false);
  });

  it("지운 기록은 늦은 목록 저장과 repository 재생성 뒤에도 다시 나타나지 않는다", async () => {
    const memory = memoryDatabase();
    const first = job("job_00000001");
    const sibling = job("job_00000002");
    const added = job("job_00000003");
    const repository = createStudioProductionJobRepository({ acquireDatabase: async () => memory.database });
    await repository.save([first, sibling], "project-a");
    await repository.remove(first.id, "project-a");

    await repository.save([first, sibling, added], "project-a");
    const reopened = createStudioProductionJobRepository({ acquireDatabase: async () => memory.database });
    expect((await reopened.load("project-a")).map(({ id }) => id)).toEqual([sibling.id, added.id]);
    expect(await reopened.loadRemovedJobIds("project-a")).toEqual([first.id]);
    expect(JSON.parse(memory.values.get(`${STUDIO_PRODUCTION_JOB_NAMESPACE}:project:project-a`) ?? "null"))
      .toEqual([sibling, added]);
  });

  it("별도 remoteId도 숨김 기록에 보존해 id와 remoteId 양쪽의 재등장을 막는다", async () => {
    const memory = memoryDatabase();
    const remoteId = "job_remote01";
    const removed = { ...job("job_local001"), remoteId };
    const sibling = job("job_sibling1");
    const repository = createStudioProductionJobRepository({ acquireDatabase: async () => memory.database });
    await repository.save([removed, sibling], "project-a");
    await repository.remove(removed.id, "project-a");
    expect(await repository.loadRemovedJobIds("project-a")).toEqual([removed.id, remoteId]);

    await repository.save([
      removed,
      job(remoteId),
      { ...job("job_alias001"), remoteId },
      { ...job("job_alias002"), remoteId: removed.id },
      sibling,
    ], "project-a");
    expect(await repository.load("project-a")).toEqual([sibling]);
  });

  it("숨김 기록은 정규화한 저장 범위별로 독립적이다", async () => {
    const memory = memoryDatabase();
    const sameId = job("job_00000001");
    const repository = createStudioProductionJobRepository({ acquireDatabase: async () => memory.database });
    await repository.save([sameId]);
    await repository.save([sameId], " project-a ");
    await repository.save([sameId], "project-b");
    await repository.remove(sameId.id, "project-a");

    expect(await repository.load(" project-a ")).toEqual([]);
    expect(await repository.load()).toEqual([sameId]);
    expect(await repository.load("project-b")).toEqual([sameId]);
    expect(await repository.loadRemovedJobIds(" project-a ")).toEqual([sameId.id]);
    expect(await repository.loadRemovedJobIds()).toEqual([]);
    expect(await repository.loadRemovedJobIds("project-b")).toEqual([]);
    expect(studioProductionJobScopeKey()).toBe("global");
    expect(studioProductionJobScopeKey(null)).toBe("global");
    expect(studioProductionJobScopeKey("  ")).toBe("global");
    expect(studioProductionJobScopeKey(" project-a ")).toBe("project:project-a");
  });

  it("Web Locks가 없어도 같은 범위의 두 삭제와 낡은 저장을 순서대로 처리한다", async () => {
    vi.stubGlobal("navigator", {});
    const started = deferred<void>();
    const release = deferred<void>();
    let blocked = false;
    const memory = memoryDatabase({ beforeSet: async (write) => {
      if (write.namespace === STUDIO_PRODUCTION_JOB_REMOVED_NAMESPACE && !blocked) {
        blocked = true;
        started.resolve(undefined);
        await release.promise;
      }
    } });
    const first = job("job_00000001");
    const second = job("job_00000002");
    const sibling = job("job_00000003");
    const repository = createStudioProductionJobRepository({ acquireDatabase: async () => memory.database });
    await repository.save([first, second, sibling], "project-a");
    const removeFirst = repository.remove(first.id, "project-a");
    await started.promise;
    const removeSecond = repository.remove(second.id, "project-a");
    const staleSave = repository.save([first, second, sibling], "project-a");
    expect(memory.writes.filter(({ namespace }) => namespace === STUDIO_PRODUCTION_JOB_REMOVED_NAMESPACE))
      .toHaveLength(1);
    release.resolve(undefined);
    await Promise.all([removeFirst, removeSecond, staleSave]);

    expect(await repository.load("project-a")).toEqual([sibling]);
    expect(await repository.loadRemovedJobIds("project-a")).toEqual([first.id, second.id]);
  });

  it("한 범위의 삭제가 기다리는 동안 다른 범위의 저장을 막지 않는다", async () => {
    vi.stubGlobal("navigator", {});
    const started = deferred<void>();
    const release = deferred<void>();
    const memory = memoryDatabase({ beforeSet: async (write) => {
      if (write.namespace === STUDIO_PRODUCTION_JOB_REMOVED_NAMESPACE && write.key === "project:project-a") {
        started.resolve(undefined);
        await release.promise;
      }
    } });
    const repository = createStudioProductionJobRepository({ acquireDatabase: async () => memory.database });
    const first = job("job_00000001");
    const other = job("job_00000002");
    await repository.save([first], "project-a");
    const removal = repository.remove(first.id, "project-a");
    await started.promise;
    try {
      await repository.save([other], "project-b");
      expect(await repository.load("project-b")).toEqual([other]);
    } finally {
      release.resolve(undefined);
    }
    await removal;
  });

  it("새 load는 이미 수락한 같은 범위의 삭제를 기다린 뒤 숨김 결과를 읽는다", async () => {
    const started = deferred<void>();
    const release = deferred<void>();
    const memory = memoryDatabase({ beforeSet: async (write) => {
      if (write.namespace === STUDIO_PRODUCTION_JOB_REMOVED_NAMESPACE) {
        started.resolve(undefined);
        await release.promise;
      }
    } });
    const repository = createStudioProductionJobRepository({ acquireDatabase: async () => memory.database });
    const first = job("job_00000001");
    await repository.save([first]);
    const removal = repository.remove(first.id);
    await started.promise;
    const loaded = repository.load();
    const removed = repository.loadRemovedJobIds();
    release.resolve(undefined);
    await removal;
    expect(await loaded).toEqual([]);
    expect(await removed).toEqual([first.id]);
  });

  it("지원 환경에서는 숨김 메타데이터와 목록 쓰기에 기존 Web Lock을 함께 사용한다", async () => {
    const request = vi.fn(async (_name: string, commit: () => Promise<unknown>) => commit());
    vi.stubGlobal("navigator", { locks: { request } });
    const memory = memoryDatabase();
    const repository = createStudioProductionJobRepository({ acquireDatabase: async () => memory.database });
    const first = job("job_00000001");
    await repository.save([first], "project-a");
    await repository.remove(first.id, "project-a");
    expect(request.mock.calls.map(([name]) => name))
      .toEqual([`${STUDIO_PRODUCTION_JOB_NAMESPACE}:project:project-a`, `${STUDIO_PRODUCTION_JOB_NAMESPACE}:project:project-a`]);
  });

  it("숨김 기록 쓰기 실패는 기존 목록을 바꾸지 않고 호출자에게 실패를 반환한다", async () => {
    const memory = memoryDatabase({ beforeSet: (write) => {
      if (write.namespace === STUDIO_PRODUCTION_JOB_REMOVED_NAMESPACE) throw new Error("hidden write failed");
    } });
    const repository = createStudioProductionJobRepository({ acquireDatabase: async () => memory.database });
    const first = job("job_00000001");
    await repository.save([first]);
    await expect(repository.remove(first.id)).rejects.toThrow("hidden write failed");

    expect(await repository.load()).toEqual([first]);
    expect(await repository.loadRemovedJobIds()).toEqual([]);
    expect(memory.writes.filter(({ namespace }) => namespace === STUDIO_PRODUCTION_JOB_NAMESPACE)).toHaveLength(1);
  });

  it("두 번째 목록 쓰기 실패 뒤에도 새 repository는 숨김 기록을 적용하고 후속 저장을 계속한다", async () => {
    let failJobWrite = false;
    const memory = memoryDatabase({ beforeSet: (write) => {
      if (failJobWrite && write.namespace === STUDIO_PRODUCTION_JOB_NAMESPACE) throw new Error("jobs write failed");
    } });
    const repository = createStudioProductionJobRepository({ acquireDatabase: async () => memory.database });
    const first = job("job_00000001");
    const sibling = job("job_00000002");
    await repository.save([first, sibling]);
    failJobWrite = true;
    await expect(repository.remove(first.id)).rejects.toThrow("jobs write failed");
    expect(JSON.parse(memory.values.get(`${STUDIO_PRODUCTION_JOB_NAMESPACE}:global`) ?? "null"))
      .toEqual([first, sibling]);

    const reopened = createStudioProductionJobRepository({ acquireDatabase: async () => memory.database });
    expect(await reopened.load()).toEqual([sibling]);
    expect(await reopened.loadRemovedJobIds()).toEqual([first.id]);
    failJobWrite = false;
    await repository.save([first, sibling]);
    expect(await reopened.load()).toEqual([sibling]);
    expect(memory.writes.slice(-4).map(({ namespace }) => namespace)).toEqual([
      STUDIO_PRODUCTION_JOB_NAMESPACE,
      STUDIO_PRODUCTION_JOB_REMOVED_NAMESPACE,
      STUDIO_PRODUCTION_JOB_NAMESPACE,
      STUDIO_PRODUCTION_JOB_NAMESPACE,
    ]);
  });

  it.each(["{broken", "{}", "[12]", '["short"]', '["job_00000001", null]'])(
    "손상된 숨김 기록은 삭제한 작업을 복구하거나 목록을 덮지 않고 실패한다: %s",
    async (raw) => {
      const memory = memoryDatabase();
      const first = job("job_00000001");
      memory.values.set(`${STUDIO_PRODUCTION_JOB_NAMESPACE}:global`, JSON.stringify([first]));
      memory.values.set(`${STUDIO_PRODUCTION_JOB_REMOVED_NAMESPACE}:global`, raw);
      const repository = createStudioProductionJobRepository({ acquireDatabase: async () => memory.database });

      await expect(repository.loadRemovedJobIds()).rejects.toThrow(/손상/u);
      await expect(repository.load()).rejects.toThrow(/손상/u);
      await expect(repository.save([first])).rejects.toThrow(/손상/u);
      await expect(repository.remove(first.id)).rejects.toThrow(/손상/u);
      expect(memory.writes).toEqual([]);
    },
  );

  it("숨김 식별자는 기존 작업 schema를 따르고 없는 기록의 삭제도 늦은 복구를 막는다", async () => {
    const memory = memoryDatabase();
    const repository = createStudioProductionJobRepository({ acquireDatabase: async () => memory.database });
    await expect(repository.remove("short")).rejects.toThrow();
    await expect(repository.remove("../job_00000001")).rejects.toThrow();
    expect(memory.writes).toEqual([]);

    const first = job("job_00000001");
    await repository.remove(first.id);
    await repository.save([first]);
    expect(await repository.load()).toEqual([]);
    expect(await repository.loadRemovedJobIds()).toEqual([first.id]);
  });

  it("fails closed when persisted JSON is corrupt", async () => {
    const memory = memoryDatabase();
    memory.values.set(`${STUDIO_PRODUCTION_JOB_NAMESPACE}:global`, "{not-json");
    const repository = createStudioProductionJobRepository({
      acquireDatabase: async () => memory.database,
    });
    await expect(repository.load()).rejects.toThrow();
  });

  it("rejects unsafe project scopes", async () => {
    const memory = memoryDatabase();
    const repository = createStudioProductionJobRepository({
      acquireDatabase: async () => memory.database,
    });
    await expect(repository.load(".."))
      .rejects.toThrow(/유효한 프로젝트/u);
    await expect(repository.save([], "path\\escape"))
      .rejects.toThrow(/유효한 프로젝트/u);
  });
});
