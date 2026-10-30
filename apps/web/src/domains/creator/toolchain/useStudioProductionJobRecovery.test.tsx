// @vitest-environment jsdom
import { StrictMode, type ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioProductionJob, type StudioProductionJob } from "./studio-production-jobs";
import { createStudioProductionJobRepository, type StudioProductionJobRepository } from "./studio-production-job-repository";
import { useStudioProductionJobRecovery } from "./useStudioProductionJobRecovery";

function deferred<Value>() {
  let resolve: (value: Value) => void = () => { throw new Error("아직 준비되지 않은 Promise"); };
  let reject: (reason: Error) => void = () => { throw new Error("아직 준비되지 않은 Promise"); };
  const promise = new Promise<Value>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function job(id: string, projectId: string | null = "project-a", status: StudioProductionJob["status"] = "completed"): StudioProductionJob {
  return { ...createStudioProductionJob({ id, projectId, profile: "open", toolId: "blender", operationId: "export-glb", now: () => new Date("2026-10-28T00:00:00.000Z") }), status };
}

function repository() {
  const values = new Map<string, string>();
  return createStudioProductionJobRepository({ acquireDatabase: async () => ({
    async kvGet(namespace, key) { return values.get(`${namespace}:${key}`) ?? null; },
    async kvSet(namespace, key, value) { values.set(`${namespace}:${key}`, value); },
  }) });
}

function client() {
  return {
    listJobs: vi.fn(async (_signal?: AbortSignal): Promise<readonly StudioProductionJob[]> => []),
    getJob: vi.fn(async (_id: string, _signal?: AbortSignal) => job("job_running1", "project-a", "running")),
    createJob: vi.fn(), uploadInput: vi.fn(), startJob: vi.fn(),
  };
}

function options(store = repository(), runner: ReturnType<typeof client> | null = client()) {
  return { repository: store, projectId: "project-a" as string | null, client: runner, connected: runner !== null,
    onNotice: vi.fn((_notice: string | null) => undefined) };
}

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("제작 이력 조회 복구와 범위 수명", () => {
  it("기존 key의 이력·조회 중 추가·최신 상태를 보존하고 같은 프로젝트만 실행 없이 복구한다", async () => {
    const store = repository();
    const local = { ...job("job_local001"), updatedAt: "2026-10-28T02:00:00.000Z" };
    await store.save([local, job("job_legacy01", null)], "project-a");
    const runner = client();
    const pending = deferred<readonly StudioProductionJob[]>();
    runner.listJobs.mockReturnValue(pending.promise);
    const hook = renderHook(() => useStudioProductionJobRecovery(options(store, runner)));
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    await act(async () => { await hook.result.current.applySnapshot(job("job_added001")); });
    await act(async () => { pending.resolve([job(local.id), job("job_remote01"), job("job_legacy01", "project-a"), job("job_other001", "project-b"), job("job_global01", null)]); });
    await waitFor(() => expect(hook.result.current.jobs.map(({ id }) => id).sort())
      .toEqual(["job_added001", "job_legacy01", "job_local001", "job_remote01"]));
    expect(hook.result.current.jobs.find(({ id }) => id === local.id)?.updatedAt).toBe(local.updatedAt);
    expect(hook.result.current.jobs.find(({ id }) => id === "job_legacy01")?.projectId).toBeNull();
    expect(runner.createJob).not.toHaveBeenCalled();
    expect(runner.uploadInput).not.toHaveBeenCalled();
    expect(runner.startJob).not.toHaveBeenCalled();
  });

  it("로컬 이력 준비 전에 쓰지 않으며 오래된 repository load가 새 저장소를 덮지 않는다", async () => {
    const first = repository();
    const pending = deferred<readonly StudioProductionJob[]>();
    const save = vi.fn(first.save);
    const slow: StudioProductionJobRepository = { ...first, save, load: () => pending.promise };
    const second = repository();
    await second.save([job("job_second01")], "project-a");
    const initial = options(slow, null);
    const hook = renderHook(({ repository: store }) => useStudioProductionJobRecovery({ ...initial, repository: store }), { initialProps: { repository: slow } });
    await act(async () => { expect(await hook.result.current.commitJobs([job("job_early001")])).toBe(false); });
    expect(save).not.toHaveBeenCalled();
    hook.rerender({ repository: second });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    await act(async () => { pending.resolve([job("job_stale001")]); });
    expect(hook.result.current.jobs.map(({ id }) => id)).toEqual(["job_second01"]);
  });

  it.each(["success", "failure"] as const)("이전 프로젝트의 늦은 저장 %s가 새 범위의 상태와 알림을 바꾸지 않는다", async (outcome) => {
    const base = repository();
    const pending = deferred<void>();
    const store: StudioProductionJobRepository = { ...base, save: vi.fn(async (jobs, projectId) => {
      if (projectId === "project-a") await pending.promise;
      await base.save(jobs, projectId);
    }) };
    const initial = options(store, null);
    const hook = renderHook(({ projectId }) => useStudioProductionJobRecovery({ ...initial, projectId }), { initialProps: { projectId: "project-a" } });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    const old = hook.result.current;
    let saved = Promise.resolve(false);
    act(() => { saved = old.commitJobs([job("job_first001")]); });
    await waitFor(() => expect(store.save).toHaveBeenCalled());
    hook.rerender({ projectId: "project-b" });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    await act(async () => { await hook.result.current.commitJobs([job("job_second01", "project-b")]); });
    initial.onNotice.mockClear();
    await act(async () => {
      if (outcome === "success") pending.resolve(); else pending.reject(new Error("이전 A 저장 실패"));
      await saved;
    });
    expect(hook.result.current.persistence).toBe("durable");
    expect(hook.result.current.jobs.map(({ id }) => id)).toEqual(["job_second01"]);
    expect(initial.onNotice).not.toHaveBeenCalled();
    expect(old.isCurrent()).toBe(false);
  });

  it("A→B→A와 remount에서도 수락한 쓰기를 직렬화한 뒤 읽고 최신 이력을 저장한다", async () => {
    const base = repository();
    const pending = deferred<void>();
    let writes = 0;
    const store: StudioProductionJobRepository = { ...base, save: vi.fn(async (jobs, projectId) => {
      if (++writes === 1) await pending.promise;
      await base.save(jobs, projectId);
    }) };
    const initial = options(store, null);
    const first = renderHook(({ projectId }) => useStudioProductionJobRecovery({ ...initial, projectId }), { initialProps: { projectId: "project-a" } });
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    let save1 = Promise.resolve(false), save2 = Promise.resolve(false);
    act(() => {
      save1 = first.result.current.commitJobs([job("job_write001")]);
      save2 = first.result.current.commitJobs([job("job_write002")]);
    });
    await waitFor(() => expect(writes).toBe(1));
    first.rerender({ projectId: "project-b" });
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    first.unmount();
    const next = renderHook(() => useStudioProductionJobRecovery(initial));
    expect(next.result.current.ready).toBe(false);
    await act(async () => { pending.resolve(); await Promise.all([save1, save2]); });
    await waitFor(() => expect(next.result.current.ready).toBe(true));
    expect(next.result.current.jobs.map(({ id }) => id)).toEqual(["job_write002"]);
    await act(async () => { await next.result.current.commitJobs([job("job_write003")]); });
    expect((await base.load("project-a")).map(({ id }) => id)).toEqual(["job_write003"]);
  });

  it("A→B→A의 이전 poll은 버리고 known job의 id·remoteId·원본 project를 검증한다", async () => {
    const store = repository();
    await store.save([job("job_running1", "project-a", "running")], "project-a");
    const old = deferred<StudioProductionJob>(), fresh = deferred<StudioProductionJob>();
    const runner = client();
    runner.getJob.mockReturnValueOnce(old.promise).mockReturnValue(fresh.promise);
    const initial = options(store, runner);
    const hook = renderHook(({ projectId }) => useStudioProductionJobRecovery({ ...initial, projectId }), { initialProps: { projectId: "project-a" } });
    await waitFor(() => expect(runner.getJob).toHaveBeenCalled());
    const oldSignal = runner.getJob.mock.calls[0]?.[1];
    hook.rerender({ projectId: "project-b" });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    hook.rerender({ projectId: "project-a" });
    await waitFor(() => expect(runner.getJob.mock.calls.length).toBeGreaterThan(1));
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => { old.resolve({ ...job("job_running1"), updatedAt: "2026-10-28T04:00:00.000Z" }); });
    expect(hook.result.current.jobs[0]?.status).toBe("running");
    await act(async () => { fresh.resolve(job("job_foreign1", "project-b")); });
    expect(hook.result.current.jobs.map(({ id }) => id)).toEqual(["job_running1"]);
    expect(await hook.result.current.applySnapshot(job("job_running1", "project-b"), job("job_running1", "project-a", "running"))).toBe(false);
  });

  it("교체된 연결의 목록은 무시하고 콜백 identity 변화로 목록을 반복 요청하지 않는다", async () => {
    const store = repository();
    const firstClient = client(), secondClient = client();
    const old = deferred<readonly StudioProductionJob[]>();
    firstClient.listJobs.mockReturnValue(old.promise);
    secondClient.listJobs.mockResolvedValue([job("job_newrunner")]);
    const initial = options(store, firstClient);
    const hook = renderHook(({ client: runner, renderId }) => useStudioProductionJobRecovery({ ...initial, client: runner, onNotice: () => { void renderId; } }), {
      initialProps: { client: firstClient, renderId: 0 },
    });
    await waitFor(() => expect(firstClient.listJobs).toHaveBeenCalledOnce());
    hook.rerender({ client: secondClient, renderId: 1 });
    await waitFor(() => expect(hook.result.current.jobs[0]?.id).toBe("job_newrunner"));
    await act(async () => { old.resolve([job("job_oldrunner")]); });
    hook.rerender({ client: secondClient, renderId: 2 });
    expect(firstClient.listJobs.mock.calls[0]?.[0]?.aborted).toBe(true);
    expect(secondClient.listJobs).toHaveBeenCalledOnce();
    expect(hook.result.current.jobs.map(({ id }) => id)).toEqual(["job_newrunner"]);
  });

  it("기록 지우기와 늦은 목록이 경합해도 reconnect·remount 뒤 되살리지 않고 다른 프로젝트는 보존한다", async () => {
    const store = repository();
    const removed = job("job_removed1");
    await store.save([removed], "project-a");
    const runner = client(), pending = deferred<readonly StudioProductionJob[]>();
    runner.listJobs.mockReturnValue(pending.promise);
    const initial = options(store, runner);
    const first = renderHook(() => useStudioProductionJobRecovery(initial));
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    await act(async () => { await first.result.current.removeRecord(removed.id); });
    await act(async () => { pending.resolve([removed]); });
    expect(first.result.current.jobs).toEqual([]);
    first.unmount();
    const second = renderHook(({ projectId, connected }) => useStudioProductionJobRecovery({ ...initial, projectId, connected }), { initialProps: { projectId: "project-a", connected: true } });
    await waitFor(() => expect(second.result.current.ready).toBe(true));
    expect(second.result.current.jobs).toEqual([]);
    second.rerender({ projectId: "project-a", connected: false });
    second.rerender({ projectId: "project-a", connected: true });
    await waitFor(() => expect(second.result.current.ready).toBe(true));
    expect(second.result.current.jobs).toEqual([]);
    runner.listJobs.mockResolvedValue([{ ...removed, projectId: "project-b" }]);
    second.rerender({ projectId: "project-b", connected: true });
    await waitFor(() => expect(second.result.current.jobs[0]?.id).toBe(removed.id));
  });

  it.each(["load", "hidden"] as const)("%s 읽기가 실패하면 숨김 상태를 추측해 자동 목록을 복구하지 않는다", async (failure) => {
    const base = repository();
    const store: StudioProductionJobRepository = {
      ...base,
      load: (projectId) => failure === "load" ? Promise.reject(new Error("이력 읽기 실패")) : base.load(projectId),
      loadRemovedJobIds: (projectId) => failure === "hidden" ? Promise.reject(new Error("숨김 원장 손상")) : base.loadRemovedJobIds(projectId),
    };
    const runner = client();
    runner.listJobs.mockResolvedValue([job("job_removed1")]);
    const hook = renderHook(() => useStudioProductionJobRecovery(options(store, runner)));
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    expect(hook.result.current.persistence).toBe("memory");
    expect(runner.listJobs).not.toHaveBeenCalled();
    expect(hook.result.current.jobs).toEqual([]);
  });

  it("숨김 저장 실패 뒤 이미 수락한 일반 저장이 성공해도 영속 저장 완료로 되돌리지 않는다", async () => {
    const base = repository();
    await base.save([job("job_removed1")], "project-a");
    const removed = deferred<readonly StudioProductionJob[]>();
    const store: StudioProductionJobRepository = { ...base, remove: vi.fn(() => removed.promise), save: vi.fn(base.save) };
    const initial = options(store, null);
    const hook = renderHook(() => useStudioProductionJobRecovery(initial));
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    let deleting = Promise.resolve(false), saving = Promise.resolve(false);
    act(() => {
      deleting = hook.result.current.removeRecord("job_removed1");
      saving = hook.result.current.commitJobs([job("job_newafter")]);
    });
    await waitFor(() => expect(store.remove).toHaveBeenCalled());
    await act(async () => { removed.reject(new Error("숨김 원장 저장 실패")); await Promise.all([deleting, saving]); });
    expect(store.save).toHaveBeenCalledOnce();
    expect(hook.result.current.persistence).toBe("memory");
    expect(hook.result.current.jobs.map(({ id }) => id)).toEqual(["job_newafter"]);
    expect(initial.onNotice).toHaveBeenCalledWith(expect.stringContaining("숨김 원장 저장 실패"));
  });

  it("같은 저장 범위의 연결 변경은 memory 이력과 미저장 숨김 기록을 버리지 않는다", async () => {
    const base = repository();
    await base.save([job("job_removed1")], "project-a");
    const store: StudioProductionJobRepository = { ...base, save: async () => { throw new Error("OPFS 저장 실패"); } };
    const firstClient = client(), nextClient = client();
    const initial = options(store, firstClient);
    const hook = renderHook(({ connected, client: runner }) => useStudioProductionJobRecovery({ ...initial, connected, client: runner }), {
      initialProps: { connected: true, client: firstClient },
    });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    await act(async () => { await hook.result.current.commitJobs([...hook.result.current.jobs, job("job_temporary")]); });
    expect(hook.result.current.persistence).toBe("memory");
    await act(async () => { await hook.result.current.removeRecord("job_removed1"); });
    hook.rerender({ connected: false, client: firstClient });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    hook.rerender({ connected: true, client: nextClient });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    expect(hook.result.current.jobs.map(({ id }) => id)).toEqual(["job_temporary"]);
    expect(hook.result.current.persistence).toBe("memory");
    expect(nextClient.listJobs).not.toHaveBeenCalled();
    expect(nextClient.createJob).not.toHaveBeenCalled();
    expect(nextClient.uploadInput).not.toHaveBeenCalled();
    expect(nextClient.startJob).not.toHaveBeenCalled();
  });

  it("준비 전 연결 해제·재연결이 이어져도 이전 저장 실패의 현재 탭 이력을 인계한다", async () => {
    const base = repository(), pending = deferred<void>();
    const store: StudioProductionJobRepository = { ...base, save: vi.fn(() => pending.promise) };
    const firstClient = client(), nextClient = client();
    const initial = options(store, firstClient);
    const hook = renderHook(({ client: runner, connected }) => useStudioProductionJobRecovery({ ...initial, client: runner, connected }), { initialProps: { client: firstClient, connected: true } });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    let saving = Promise.resolve(false);
    act(() => { saving = hook.result.current.commitJobs([job("job_temporary")]); });
    await waitFor(() => expect(store.save).toHaveBeenCalled());
    hook.rerender({ client: firstClient, connected: false });
    hook.rerender({ client: nextClient, connected: true });
    await act(async () => { pending.reject(new Error("이전 연결의 저장 실패")); await saving; });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    expect(hook.result.current.persistence).toBe("memory");
    expect(hook.result.current.jobs.map(({ id }) => id)).toEqual(["job_temporary"]);
    expect(nextClient.listJobs).not.toHaveBeenCalled();
  });

  it("StrictMode의 닫힌 첫 세대 응답을 버리고 progress 갱신이 polling 간격을 우회하지 않는다", async () => {
    vi.useFakeTimers();
    const store = repository();
    await store.save([job("job_running1", "project-a", "running")], "project-a");
    const runner = client();
    runner.getJob.mockResolvedValue({ ...job("job_running1", "project-a", "running"), updatedAt: "2026-10-28T01:00:00.000Z", progress: { value: 0.5, phase: "진행" } });
    const initial = options(store, runner);
    const hook = renderHook(() => useStudioProductionJobRecovery(initial), { wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(hook.result.current.ready).toBe(true);
    expect(runner.getJob).toHaveBeenCalledOnce();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_499); });
    expect(runner.getJob).toHaveBeenCalledOnce();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(runner.getJob).toHaveBeenCalledTimes(2);
    hook.unmount();
    expect(runner.getJob.mock.calls[0]?.[1]?.aborted).toBe(true);
  });
});
