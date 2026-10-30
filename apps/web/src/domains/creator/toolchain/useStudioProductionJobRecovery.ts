import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  mergeStudioProductionJobSnapshot,
  retainStudioProductionJobs,
  type StudioProductionJob,
} from "./studio-production-jobs";
import {
  studioProductionJobScopeKey,
  type StudioProductionJobRepository,
} from "./studio-production-job-repository";
import type { StudioToonBridgeClient } from "./studio-toonbridge-client";

type PersistenceState = "loading" | "durable" | "memory";
type RecoveryClient = Pick<StudioToonBridgeClient, "listJobs" | "getJob">;
const ACTIVE_STATUSES = new Set<StudioProductionJob["status"]>(["preparing", "queued", "running"]);

interface ScopeQueue { tail: Promise<void>; }
// 같은 저장소·저장 key에 수락한 쓰기는 화면의 세대나 mount가 바뀌어도 순서를 유지한다.
const repositoryQueues = new WeakMap<StudioProductionJobRepository, Map<string, ScopeQueue>>();

function scopeQueue(repository: StudioProductionJobRepository, projectId: string | null): ScopeQueue {
  const key = studioProductionJobScopeKey(projectId);
  let queues = repositoryQueues.get(repository);
  if (!queues) { queues = new Map(); repositoryQueues.set(repository, queues); }
  let queue = queues.get(key);
  if (!queue) { queue = { tail: Promise.resolve() }; queues.set(key, queue); }
  return queue;
}

function mergeJob(jobs: readonly StudioProductionJob[], incoming: StudioProductionJob) {
  const previous = jobs.find((job) => job.id === incoming.id);
  return retainStudioProductionJobs(previous
    ? jobs.map((job) => job.id === incoming.id ? mergeStudioProductionJobSnapshot(job, incoming) : job)
    : [incoming, ...jobs]);
}

function matchesRequestedJob(expected: StudioProductionJob, received: StudioProductionJob): boolean {
  return received.id === expected.id && received.projectId === expected.projectId
    && (received.remoteId ?? received.id) === (expected.remoteId ?? expected.id);
}

interface RecoveryOptions {
  readonly projectId: string | null;
  readonly repository: StudioProductionJobRepository;
  readonly client: RecoveryClient | null;
  readonly connected: boolean;
  readonly onNotice: (notice: string | null) => void;
}

interface Session {
  readonly projectId: string | null;
  readonly repository: StudioProductionJobRepository;
  readonly client: RecoveryClient | null;
  readonly signal: AbortSignal;
  isCurrent(): boolean;
  readJobs(): readonly StudioProductionJob[];
  load(): Promise<void>;
  close(): void;
  commitJobs(jobs: readonly StudioProductionJob[]): Promise<boolean>;
  applySnapshot(snapshot: StudioProductionJob, expected?: StudioProductionJob): Promise<boolean>;
  removeRecord(jobId: string): Promise<boolean>;
  refreshActiveJobs(): Promise<void>;
  transferHistory(): HistoryTransfer | null;
}

interface HistoryTransfer {
  readonly jobs: readonly StudioProductionJob[];
  readonly removedIds: readonly string[];
  isMemory(): boolean;
}

interface Snapshot {
  readonly session: Session | null;
  readonly jobs: readonly StudioProductionJob[];
  readonly persistence: PersistenceState;
  readonly ready: boolean;
}

function createSession(
  options: Omit<RecoveryOptions, "connected">,
  publish: (snapshot: Snapshot) => void,
  transfer: HistoryTransfer | null,
): Session {
  const controller = new AbortController();
  let jobs: readonly StudioProductionJob[] = Object.freeze([]);
  const removed = new Set<string>();
  let persistence: PersistenceState = "loading";
  let writeFailed = false;
  let ready = false;
  let queue: ScopeQueue | null = null;
  let polling: Promise<void> | null = null;
  const current = () => !controller.signal.aborted;
  const isRemoved = (job: StudioProductionJob) => removed.has(job.id)
    || (job.remoteId !== null && removed.has(job.remoteId));
  const emit = () => { if (current()) publish({ session, jobs, persistence, ready }); };
  const notice = (message: string) => { if (current()) options.onNotice(message); };
  const persist = async (write: () => Promise<unknown>): Promise<boolean> => {
    if (!queue || persistence === "memory") return current();
    const attempt = queue.tail.then(write);
    queue.tail = attempt.then(() => undefined, () => undefined);
    try {
      await attempt;
      if (current() && !writeFailed) { persistence = "durable"; emit(); }
    } catch (cause) {
      writeFailed = true;
      if (current()) {
        persistence = "memory";
        notice(`작업 이력을 영구 저장하지 못해 이 탭에만 유지합니다: ${cause instanceof Error ? cause.message : String(cause)}`);
        emit();
      }
    }
    return current();
  };
  const recover = async () => {
    if (!options.client || !current()) return;
    try {
      const snapshots = await options.client.listJobs(controller.signal);
      if (!current()) return;
      const scoped = snapshots.filter((job) => {
        const previous = jobs.find((entry) => entry.id === job.id);
        return job.projectId === options.projectId && !isRemoved(job)
          && (!previous || matchesRequestedJob(previous, job));
      });
      const next = retainStudioProductionJobs([...jobs, ...scoped]);
      if (JSON.stringify(next) !== JSON.stringify(jobs)) await session.commitJobs(next);
    } catch (cause) {
      if (current()) notice(`로컬 실행기의 작업 목록을 조회하지 못했습니다. 저장된 이력은 유지됩니다: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  };
  const session: Session = {
    projectId: options.projectId,
    repository: options.repository,
    client: options.client,
    signal: controller.signal,
    isCurrent: () => current() && ready,
    readJobs: () => current() ? jobs : Object.freeze([]),
    close: () => controller.abort(),
    transferHistory: () => ready ? { jobs, removedIds: [...removed], isMemory: () => persistence === "memory" || writeFailed } : transfer,
    async load() {
      emit();
      try { queue = scopeQueue(options.repository, options.projectId); }
      catch (cause) {
        persistence = "memory";
        notice(cause instanceof Error ? cause.message : String(cause));
        emit();
        return;
      }
      let historyReadable = false;
      try {
        await queue.tail;
        if (!current()) return;
        if (transfer?.isMemory()) {
          for (const id of transfer.removedIds) removed.add(id);
          jobs = transfer.jobs;
          persistence = "memory";
          ready = true;
          notice("저장하지 못한 작업 이력은 이 탭에 유지합니다. 실행기 연결을 바꿔도 자동으로 다시 실행하지 않습니다.");
          emit();
          return;
        }
        const [loaded, hidden] = await Promise.all([
          options.repository.load(options.projectId),
          options.repository.loadRemovedJobIds(options.projectId),
        ]);
        if (!current()) return;
        for (const id of hidden) removed.add(id);
        // 기존 이력은 저장 key가 범위의 정본이다. 오래된 inline projectId로 지우지 않는다.
        jobs = retainStudioProductionJobs(loaded.filter((job) => !isRemoved(job)));
        persistence = "durable";
        historyReadable = true;
      } catch (cause) {
        if (!current()) return;
        persistence = "memory";
        notice(`SQLite/OPFS 작업 이력을 열지 못해 이 탭에만 보관합니다: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
      if (!current()) return;
      ready = true;
      emit();
      if (historyReadable) await recover();
    },
    async commitJobs(next) {
      if (!current() || !ready) return false;
      jobs = retainStudioProductionJobs(next.filter((job) => !isRemoved(job)));
      const retained = jobs;
      emit();
      return persist(() => options.repository.save(retained, options.projectId));
    },
    async applySnapshot(snapshot, expected) {
      if (!current() || !ready || isRemoved(snapshot)) return false;
      const previous = expected ?? jobs.find((job) => job.id === snapshot.id);
      if (previous ? !matchesRequestedJob(previous, snapshot) : snapshot.projectId !== options.projectId) return false;
      return session.commitJobs(mergeJob(jobs, snapshot));
    },
    async removeRecord(jobId) {
      if (!current() || !ready) return false;
      const previous = jobs.find((job) => job.id === jobId);
      removed.add(jobId);
      if (previous?.remoteId) removed.add(previous.remoteId);
      jobs = Object.freeze(jobs.filter((job) => !isRemoved(job)));
      emit();
      return persist(() => options.repository.remove(jobId, options.projectId));
    },
    async refreshActiveJobs() {
      if (!options.client || !current() || !ready) return;
      if (polling) return polling;
      const client = options.client;
      const active = jobs.filter((job) => ACTIVE_STATUSES.has(job.status));
      const attempt = (async () => {
        const snapshots = await Promise.all(active.map(async (job) => {
          try {
            const snapshot = await client.getJob(job.remoteId ?? job.id, controller.signal);
            return matchesRequestedJob(job, snapshot) ? snapshot : null;
          } catch { return null; }
        }));
        if (!current()) return;
        let next = jobs;
        for (const snapshot of snapshots) {
          if (snapshot && !isRemoved(snapshot)) next = mergeJob(next, snapshot);
        }
        if (JSON.stringify(next) !== JSON.stringify(jobs)) await session.commitJobs(next);
      })();
      polling = attempt;
      try { await attempt; }
      finally { if (polling === attempt) polling = null; }
    },
  };
  return session;
}

/** 연결된 실행기의 이력을 조회로만 복구하고, 닫힌 범위의 비동기 결과를 격리한다. */
export function useStudioProductionJobRecovery({
  projectId, repository, client, connected, onNotice,
}: RecoveryOptions) {
  const noticeRef = useRef(onNotice);
  useLayoutEffect(() => { noticeRef.current = onNotice; }, [onNotice]);
  const runner = connected ? client : null;
  const previousSession = useRef<Session | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>({
    session: null, jobs: Object.freeze([]), persistence: "loading", ready: false,
  });
  useLayoutEffect(() => {
    const previous = previousSession.current;
    let transfer: HistoryTransfer | null = null;
    if (previous?.repository === repository) {
      try {
        if (studioProductionJobScopeKey(previous.projectId) === studioProductionJobScopeKey(projectId)) transfer = previous.transferHistory();
      } catch {
        // 새 session이 유효하지 않은 범위를 명시적인 오류로 처리한다.
        transfer = null;
      }
    }
    const session = createSession({
      projectId, repository, client: runner, onNotice: (notice) => noticeRef.current(notice),
    }, setSnapshot, transfer);
    previousSession.current = session;
    noticeRef.current(null);
    void session.load();
    return () => session.close();
  }, [projectId, repository, runner]);
  const session = snapshot.session?.projectId === projectId
    && snapshot.session.repository === repository && snapshot.session.client === runner ? snapshot.session : null;
  const jobs = session ? snapshot.jobs : Object.freeze([]);
  const refreshActiveJobs = useCallback(async () => { await session?.refreshActiveJobs(); }, [session]);
  const hasActiveJobs = jobs.some((job) => ACTIVE_STATUSES.has(job.status));
  useEffect(() => {
    if (!session?.client || !snapshot.ready || !hasActiveJobs) return;
    void session.refreshActiveJobs();
    const timer = globalThis.setInterval(() => { void session.refreshActiveJobs(); }, 1_500);
    return () => globalThis.clearInterval(timer);
  }, [hasActiveJobs, session, snapshot.ready]);
  return {
    jobs,
    persistence: session ? snapshot.persistence : "loading",
    ready: session !== null && snapshot.ready,
    signal: session?.signal ?? null,
    isCurrent: useCallback(() => session?.isCurrent() ?? false, [session]),
    readJobs: useCallback(() => session?.readJobs() ?? Object.freeze([]), [session]),
    commitJobs: useCallback(async (next: readonly StudioProductionJob[]) => session?.commitJobs(next) ?? false, [session]),
    applySnapshot: useCallback(async (next: StudioProductionJob, expected?: StudioProductionJob) => session?.applySnapshot(next, expected) ?? false, [session]),
    removeRecord: useCallback(async (jobId: string) => session?.removeRecord(jobId) ?? false, [session]),
    refreshActiveJobs,
  };
}
