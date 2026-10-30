import { acquireStudioLocalDatabase } from "../studio-local-database-runtime";
import {
  retainStudioProductionJobs,
  studioProductionJobSchema,
  type StudioProductionJob,
} from "./studio-production-jobs";

import type { StudioLocalDatabase } from "../studio-local-database";

export const STUDIO_PRODUCTION_JOB_NAMESPACE = "studio-production-jobs-v1";
export const STUDIO_PRODUCTION_JOB_REMOVED_NAMESPACE = "studio-production-jobs-removed-v1";
const GLOBAL_SCOPE = "global";
type ProductionJobStorage = Pick<StudioLocalDatabase, "kvGet" | "kvSet">;

export interface StudioProductionJobRepository {
  load(projectId?: string | null): Promise<readonly StudioProductionJob[]>;
  loadRemovedJobIds(projectId?: string | null): Promise<readonly string[]>;
  save(jobs: readonly StudioProductionJob[], projectId?: string | null): Promise<void>;
  remove(jobId: string, projectId?: string | null): Promise<readonly StudioProductionJob[]>;
}

export function studioProductionJobScopeKey(projectId?: string | null): string {
  const value = projectId?.trim();
  if (!value) return GLOBAL_SCOPE;
  if (value.length > 160 || value === "." || value === ".." || value.includes("\\")) {
    throw new Error("유효한 프로젝트 작업 범위가 필요합니다.");
  }
  return `project:${value}`;
}

function parseStoredJobs(raw: string): readonly StudioProductionJob[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("저장된 제작 작업 목록이 손상되었습니다.");
  return retainStudioProductionJobs(parsed.map((entry) => studioProductionJobSchema.parse(entry)));
}

function parseRemovedJobIds(raw: string): readonly string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("지운 제작 작업의 기록이 손상되었습니다.");
  }
  if (!Array.isArray(parsed)) throw new Error("지운 제작 작업의 기록이 손상되었습니다.");
  const ids = parsed.map((value: unknown) => {
    const result = studioProductionJobSchema.shape.id.safeParse(value);
    if (!result.success) throw new Error("지운 제작 작업의 식별자가 손상되었습니다.");
    return result.data;
  });
  return Object.freeze([...new Set(ids)].sort());
}

async function readRemovedJobIds(database: ProductionJobStorage, key: string): Promise<readonly string[]> {
  const raw = await database.kvGet(STUDIO_PRODUCTION_JOB_REMOVED_NAMESPACE, key);
  return raw === null ? Object.freeze([]) : parseRemovedJobIds(raw);
}

function visibleJobs(jobs: readonly StudioProductionJob[], removedIds: readonly string[]): readonly StudioProductionJob[] {
  const removed = new Set(removedIds);
  return Object.freeze(jobs.filter((job) => !removed.has(job.id)
    && (job.remoteId === null || !removed.has(job.remoteId))));
}

export function createStudioProductionJobRepository(options: {
  readonly acquireDatabase?: () => Promise<ProductionJobStorage>;
} = {}): StudioProductionJobRepository {
  const acquireDatabase = options.acquireDatabase ?? acquireStudioLocalDatabase;
  const writes = new Map<string, Promise<void>>();

  const withWriteLock = async <Result,>(
    key: string,
    operation: (database: ProductionJobStorage) => Promise<Result>,
  ): Promise<Result> => {
    const commit = async () => operation(await acquireDatabase());
    if (typeof navigator !== "undefined" && navigator.locks) {
      return navigator.locks.request(`${STUDIO_PRODUCTION_JOB_NAMESPACE}:${key}`, commit);
    }
    return commit();
  };

  const enqueueWrite = <Result,>(
    key: string,
    operation: (database: ProductionJobStorage) => Promise<Result>,
  ): Promise<Result> => {
    const result = (writes.get(key) ?? Promise.resolve()).then(() => withWriteLock(key, operation));
    // 호출자에게 원래 실패를 반환하면서 같은 범위의 다음 쓰기를 계속한다.
    const tail = result.then(() => undefined, () => undefined);
    writes.set(key, tail);
    void tail.then(() => {
      if (writes.get(key) === tail) writes.delete(key);
    });
    return result;
  };

  const readStoredJobs = async (database: ProductionJobStorage, key: string): Promise<readonly StudioProductionJob[]> => {
    const raw = await database.kvGet(STUDIO_PRODUCTION_JOB_NAMESPACE, key);
    return raw === null ? Object.freeze([]) : parseStoredJobs(raw);
  };

  return Object.freeze({
    async load(projectId?: string | null) {
      const key = studioProductionJobScopeKey(projectId);
      await writes.get(key);
      const database = await acquireDatabase();
      const jobs = await readStoredJobs(database, key);
      return visibleJobs(jobs, await readRemovedJobIds(database, key));
    },
    async loadRemovedJobIds(projectId?: string | null) {
      const key = studioProductionJobScopeKey(projectId);
      await writes.get(key);
      return readRemovedJobIds(await acquireDatabase(), key);
    },
    async save(jobs: readonly StudioProductionJob[], projectId?: string | null) {
      const key = studioProductionJobScopeKey(projectId);
      const retained = retainStudioProductionJobs(jobs);
      await enqueueWrite(key, async (database) => {
        const next = visibleJobs(retained, await readRemovedJobIds(database, key));
        await database.kvSet(STUDIO_PRODUCTION_JOB_NAMESPACE, key, JSON.stringify(next));
      });
    },
    async remove(jobId: string, projectId?: string | null) {
      const key = studioProductionJobScopeKey(projectId);
      const id = studioProductionJobSchema.shape.id.parse(jobId);
      return enqueueWrite(key, async (database) => {
        const jobs = await readStoredJobs(database, key);
        const removed = new Set(await readRemovedJobIds(database, key));
        const target = jobs.find((job) => job.id === id || job.remoteId === id);
        removed.add(id);
        if (target) {
          removed.add(target.id);
          if (target.remoteId !== null) removed.add(target.remoteId);
        }
        const ids = [...removed].sort();
        // 두 KV 쓰기는 원자적이지 않다. 목록 쓰기가 실패해도 숨김 기록으로 재등장을 막는다.
        await database.kvSet(STUDIO_PRODUCTION_JOB_REMOVED_NAMESPACE, key, JSON.stringify(ids));
        const next = visibleJobs(jobs, ids);
        await database.kvSet(STUDIO_PRODUCTION_JOB_NAMESPACE, key, JSON.stringify(next));
        return next;
      });
    },
  });
}

let productRepository: StudioProductionJobRepository | null = null;

export function openStudioProductionJobRepository(): StudioProductionJobRepository {
  productRepository ??= createStudioProductionJobRepository();
  return productRepository;
}
