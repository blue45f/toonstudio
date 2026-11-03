// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProductionDemoProject } from "./production-demo";
import { useProductionProjectSession } from "./use-production-project-session";
import type { ProductionClientCommand, ProductionProjectRecord } from "./production-api";
import { useI18n } from "@/shared/lib/i18n-core";
import { loadProductionCommandRecovery } from "./production-command-recovery";

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), revision: 1, actor: "owner" as string | null, listeners: new Set<() => void>() }));
vi.mock("./production-api", () => ({ getProductionProject: mocks.load, executeProductionCommand: mocks.save,
  recoverProductionCommand: (projectId: string, request: { expectedRevision: number; command: unknown; mutationId: string }) => mocks.save(projectId, request.expectedRevision, request.command, request.mutationId) }));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({ getAuthSessionRevision: () => mocks.revision, getAuthSession: () => mocks.actor ? { user: { id: mocks.actor } } : null, listeners: mocks.listeners }));
vi.mock("@/platform/api", () => ({ httpStatus: (error: { status?: number }) => error.status,
  getApiErrorMessage: async (error: Error, fallback: string) => error.message || fallback }));
const access = { view: true, comment: true, edit: true, manage: true, owner: true, role: "owner" as const };
const record = (projectId = "project-a", revision = 1): ProductionProjectRecord => ({ aggregate: { ...createProductionDemoProject(), projectId, revision }, access });
const demo = { create: () => createProductionDemoProject(), reduce: (current: ProductionProjectRecord["aggregate"]) => ({ ...current, revision: current.revision + 1 }) };
const command: ProductionClientCommand = { type: "upsert-task", task: createProductionDemoProject().tasks[0]! };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
beforeEach(() => { vi.clearAllMocks(); window.sessionStorage.clear(); useI18n.setState({ lang: "ko" }); mocks.actor = "owner";
  mocks.revision = 1; mocks.load.mockReset(); mocks.load.mockResolvedValue(record());
  mocks.save.mockReset(); mocks.save.mockResolvedValue({ aggregate: record("project-a", 2).aggregate }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.sessionStorage.clear(); vi.useRealTimers(); });

describe("공개 인증 세션 준비 경계", () => {
  it("캐시된 계정이 있어도 준비 전에는 조회·poll·저장을 시작하지 않고 준비 후 한 번 읽는다", async () => {
    const intervals = vi.spyOn(window, "setInterval");
    const { result, rerender } = renderHook(({ ready }) => useProductionProjectSession("project-a", "owner", demo, { authReady: ready }),
      { initialProps: { ready: false } });
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.aggregate).toBeNull();
    expect(result.current.access.view).toBe(false);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("online"));
      await result.current.refresh();
      await expect(result.current.executeStrict(command, "저장")).rejects.toThrow();
    });
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(intervals).not.toHaveBeenCalled();
    rerender({ ready: true });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith("project-a");
    expect(result.current.aggregate?.projectId).toBe("project-a");
  });

  it("준비를 기다리는 동안 프로젝트·계정이 바뀌면 마지막 scope만 처음 조회한다", async () => {
    const { result, rerender } = renderHook(({ projectId, actor, ready }) => useProductionProjectSession(projectId, actor, demo, { authReady: ready }),
      { initialProps: { projectId: "project-a", actor: "owner", ready: false } });
    act(() => {
      mocks.actor = "another-user"; mocks.revision += 1;
      for (const notify of mocks.listeners) notify();
      rerender({ projectId: "project-b", actor: "another-user", ready: false });
    });
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(mocks.load).not.toHaveBeenCalled();
    mocks.load.mockResolvedValue(record("project-b", 4));
    rerender({ projectId: "project-b", actor: "another-user", ready: true });
    await waitFor(() => expect(result.current.aggregate?.projectId).toBe("project-b"));
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith("project-b");
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("샘플은 인증 준비와 무관하게 편집되고 ready 전환에도 편집 상태를 유지한다", async () => {
    const { result, rerender } = renderHook(({ ready }) => useProductionProjectSession("sample-project", "owner", demo, { authReady: ready }),
      { initialProps: { ready: false } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const initialRevision = result.current.aggregate?.revision;
    if (initialRevision === undefined) throw new Error("샘플 프로젝트가 준비되지 않았습니다.");
    await act(async () => result.current.executeStrict(command, "샘플 편집"));
    expect(result.current.aggregate?.revision).toBe(initialRevision + 1);
    rerender({ ready: true });
    expect(result.current.aggregate?.revision).toBe(initialRevision + 1);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("같은 ID로 재로그인한 뒤 새로 읽고 이전 세대의 늦은 응답은 폐기한다", async () => {
    const oldRead = deferred<ProductionProjectRecord>();
    mocks.load.mockReturnValueOnce(oldRead.promise);
    const { result, rerender } = renderHook(({ actor, ready }) => useProductionProjectSession("project-a", actor, demo, { authReady: ready }),
      { initialProps: { actor: "owner" as string | null, ready: true } });
    expect(mocks.load).toHaveBeenCalledTimes(1);
    act(() => {
      mocks.actor = null; mocks.revision += 1;
      for (const notify of mocks.listeners) notify();
      rerender({ actor: null, ready: false });
    });
    act(() => {
      mocks.actor = "owner"; mocks.revision += 1;
      for (const notify of mocks.listeners) notify();
      rerender({ actor: "owner", ready: false });
    });
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(true);
    expect(result.current.aggregate).toBeNull();
    mocks.load.mockResolvedValueOnce({ ...record("project-a", 5), access: { ...access, edit: false, manage: false } });
    rerender({ actor: "owner", ready: true });
    await waitFor(() => expect(result.current.aggregate?.revision).toBe(5));
    expect(mocks.load).toHaveBeenCalledTimes(2);
    await act(async () => oldRead.resolve(record("project-a", 99)));
    expect(result.current.aggregate?.revision).toBe(5);
    expect(result.current.access.edit).toBe(false);
  });
});

describe("프로젝트·계정별 협업 요청 수명", () => {
  it("비로그인 실제 프로젝트는 조회하지 않고 권한을 닫는다", () => {
    const { result } = renderHook(() => useProductionProjectSession("project-a", null, demo));
    expect(mocks.load).not.toHaveBeenCalled(); expect(result.current.access.view).toBe(false);
  });
  it("프로젝트 이동 뒤 늦게 온 이전 응답을 새 화면에 표시하지 않는다", async () => {
    const first = deferred<ProductionProjectRecord>(); mocks.load.mockReturnValueOnce(first.promise).mockResolvedValue(record("project-b"));
    const { result, rerender } = renderHook(({ id }) => useProductionProjectSession(id, "owner", demo), { initialProps: { id: "project-a" } });
    rerender({ id: "project-b" });
    await waitFor(() => expect(result.current.aggregate?.projectId).toBe("project-b"));
    await act(async () => first.resolve(record("project-a", 10)));
    expect(result.current.aggregate?.projectId).toBe("project-b");
  });
  it("전송 중 프로젝트를 바꾸면 오래된 결과와 대기 명령을 폐기한다", async () => {
    const saved = deferred<{ aggregate: ProductionProjectRecord["aggregate"] }>(); mocks.save.mockReturnValue(saved.promise);
    const { result, rerender } = renderHook(({ id }) => useProductionProjectSession(id, "owner", demo), { initialProps: { id: "project-a" } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let first!: Promise<unknown>, second!: Promise<unknown>;
    act(() => { first = result.current.executeStrict(command, "저장").catch((error: unknown) => error); second = result.current.executeStrict(command, "다음").catch((error: unknown) => error); });
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    mocks.load.mockResolvedValue(record("project-b")); rerender({ id: "project-b" });
    await waitFor(() => expect(result.current.aggregate?.projectId).toBe("project-b"));
    await act(async () => { saved.resolve({ aggregate: record("project-a", 5).aggregate }); await Promise.all([first, second]); });
    expect(mocks.save).toHaveBeenCalledTimes(1); expect(result.current.aggregate?.projectId).toBe("project-b");
    expect(await first).toBeInstanceOf(Error); expect(await second).toBeInstanceOf(Error);
  });
  it("계정 변경 직후 기존 프로젝트와 권한을 숨긴다", async () => {
    const { result, rerender } = renderHook(({ actor }) => useProductionProjectSession("project-a", actor, demo), { initialProps: { actor: "owner" as string | null } });
    await waitFor(() => expect(result.current.aggregate).not.toBeNull());
    mocks.revision += 1; rerender({ actor: null });
    expect(result.current.aggregate).toBeNull(); expect(result.current.access.edit).toBe(false);
  });
  it("저장 실패는 strict 호출자에게 전달하고 성공 알림으로 바꾸지 않는다", async () => {
    mocks.save.mockRejectedValue(new Error("연결 실패"));
    const { result } = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await expect(result.current.executeStrict(command, "저장 완료")).rejects.toThrow("연결 실패"); });
    expect(result.current.saveState).toBe("error"); expect(result.current.notice).not.toBe("저장 완료");
  });
  it("충돌 뒤 최신 버전으로 다시 읽되 실패한 명령을 자동 재실행하지 않는다", async () => {
    mocks.save.mockRejectedValue(Object.assign(new Error("동시 수정 충돌"), { status: 409 }));
    const { result } = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(result.current.loading).toBe(false));
    mocks.load.mockResolvedValue(record("project-a", 7));
    await act(async () => { await expect(result.current.executeStrict(command, "저장 완료")).rejects.toThrow("최신 상태"); });
    expect(result.current.aggregate?.revision).toBe(7); expect(mocks.save).toHaveBeenCalledTimes(1);
  });
  it("권한 회수 응답은 읽기 캐시까지 제거한다", async () => {
    const { result } = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(result.current.loading).toBe(false));
    mocks.load.mockRejectedValue(Object.assign(new Error("권한 없음"), { status: 403 }));
    await act(async () => result.current.refresh());
    expect(result.current.aggregate).toBeNull(); expect(result.current.access.view).toBe(false);
  });
  it("잠깐의 조회 실패에는 화면을 유지하고 재접속으로 복구한다", async () => {
    const { result } = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(result.current.loading).toBe(false));
    mocks.load.mockRejectedValueOnce(new Error("일시적 장애"));
    await act(async () => result.current.refresh());
    expect(result.current.aggregate?.revision).toBe(1); expect(result.current.notice).toContain("장애");
    mocks.load.mockResolvedValue(record("project-a", 3));
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(result.current.aggregate?.revision).toBe(3));
    expect(result.current.saveState).toBe("idle");
    expect(result.current.notice).toContain("다시 저장");
  });
  it("느린 재조회가 더 최신 저장 결과를 덮어쓰지 않는다", async () => {
    const { result } = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const stale = deferred<ProductionProjectRecord>(); mocks.load.mockReturnValueOnce(stale.promise);
    let read!: Promise<void>; act(() => { read = result.current.refresh(); });
    mocks.save.mockResolvedValue({ aggregate: record("project-a", 2).aggregate });
    await act(async () => result.current.executeStrict(command, "완료"));
    await act(async () => { stale.resolve(record()); await read; });
    expect(result.current.aggregate?.revision).toBe(2);
  });
});

it("사용자 ID가 같아도 로그인 세대가 바뀌면 권한과 프로젝트를 다시 확인한다", async () => {
  const { result } = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
  await waitFor(() => expect(result.current.loading).toBe(false));
  mocks.load.mockResolvedValue({ ...record("project-a", 5), access: { ...access, edit: false, comment: false, manage: false, owner: false, role: "viewer" } });
  act(() => { mocks.revision += 1; for (const notify of mocks.listeners) notify(); });
  await waitFor(() => expect(result.current.aggregate?.revision).toBe(5));
  expect(result.current.access.edit).toBe(false);
  expect(mocks.load).toHaveBeenCalledTimes(2);
});

it("앞선 저장이 실패하면 기존 대기열은 자동 재실행하지 않고 명시적 재시도만 허용한다", async () => {
  const { result } = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
  await waitFor(() => expect(result.current.loading).toBe(false));
  mocks.save.mockRejectedValueOnce(Object.assign(new Error("저장 입력 검증 실패"), { status: 422 }));
  let operations!: Promise<unknown>[];
  act(() => { operations = [result.current.executeStrict(command, "첫 변경"), result.current.executeStrict(command, "대기 변경")].map((operation) => operation.catch((error: unknown) => error)); });
  let results!: unknown[];
  await act(async () => { results = await Promise.all(operations); });
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(results[1]).toBeInstanceOf(Error);
  expect(String(results[1])).toContain("대기 중인 변경");
  mocks.save.mockResolvedValueOnce({ aggregate: record("project-a", 2).aggregate });
  await act(async () => result.current.executeStrict(command, "명시적 재시도"));
  expect(result.current.aggregate?.revision).toBe(2);
});

it("200 응답이라도 접근 거부나 다른 프로젝트가 반환되면 이전 캐시를 폐기한다", async () => {
  const { result } = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
  await waitFor(() => expect(result.current.loading).toBe(false));
  mocks.load.mockResolvedValueOnce({ ...record(), access: { ...access, view: false } });
  await act(async () => result.current.refresh());
  expect(result.current.aggregate).toBeNull(); expect(result.current.access.view).toBe(false);
  mocks.load.mockResolvedValueOnce(record("project-b"));
  await act(async () => result.current.refresh());
  expect(result.current.aggregate).toBeNull();
});

it("계정 변경 전에 캡처한 저장 함수는 새 계정 권한으로 실행되지 않는다", async () => {
  const { result, rerender } = renderHook(({ actor }) => useProductionProjectSession("project-a", actor, demo), { initialProps: { actor: "owner" } });
  await waitFor(() => expect(result.current.loading).toBe(false));
  const previousSave = result.current.executeStrict;
  rerender({ actor: "another-user" });
  await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
  await act(async () => { await expect(previousSave(command, "이전 계정 변경")).rejects.toThrow("계정이나 프로젝트"); });
  expect(mocks.save).not.toHaveBeenCalled();
});

describe("저장 응답 유실 복구", () => {
  it("불명 저장은 새 명령을 막고 최초 본문·버전·식별자로 복구한 뒤 최신 GET을 표시한다", async () => {
    const task = { ...createProductionDemoProject().tasks[0]! };
    const original: ProductionClientCommand = { type: "upsert-task", task };
    const title = task.title;
    mocks.save.mockRejectedValueOnce(new Error("응답 유실"));
    const { result } = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await expect(result.current.executeStrict(original, "저장")).rejects.toThrow("응답 유실"); });
    const sent = mocks.save.mock.calls[0];
    expect(sent?.[2]).toMatchObject({ task: { title } });
    expect(sent?.[3]).toMatch(/^[a-f0-9-]{36}$/u);
    task.title = "응답 대기 뒤 바꾼 입력";
    await act(async () => { await expect(result.current.executeStrict(command, "새 결정")).rejects.toThrow("저장 결과를 복구"); });
    expect(mocks.save).toHaveBeenCalledTimes(1);
    mocks.save.mockResolvedValueOnce({ aggregate: record("project-a", 2).aggregate });
    mocks.load.mockResolvedValueOnce(record("project-a", 7));
    await act(async () => result.current.refresh());
    expect(mocks.save.mock.calls[1]).toEqual(sent);
    expect(mocks.save.mock.calls[1]?.[2]).toMatchObject({ task: { title } });
    expect(result.current.aggregate?.revision).toBe(7);
    expect(result.current.notice).toContain("응답을 받지 못했던 저장 결과를 확인");
  });

  it("복구 응답도 유실되면 같은 요청을 유지하고 online에서 영수증을 확인한다", async () => {
    mocks.save.mockRejectedValueOnce(Object.assign(new Error("게이트웨이 시간 초과"), { status: 504 }))
      .mockRejectedValueOnce(new Error("복구 연결 실패"))
      .mockResolvedValueOnce({ aggregate: record("project-a", 2).aggregate });
    const { result } = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await expect(result.current.executeStrict(command, "저장")).rejects.toThrow("시간 초과"); });
    await act(async () => result.current.refresh());
    expect(result.current.saveState).toBe("error");
    expect(result.current.notice).toContain("저장 결과를 복구");
    mocks.load.mockResolvedValueOnce(record("project-a", 5));
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(result.current.aggregate?.revision).toBe(5));
    expect(mocks.save).toHaveBeenCalledTimes(3);
    expect(mocks.save.mock.calls[1]).toEqual(mocks.save.mock.calls[0]);
    expect(mocks.save.mock.calls[2]).toEqual(mocks.save.mock.calls[0]);
  });

  it("복구 중 중복 새로고침이나 새 결정이 저장 요청을 추가하지 않는다", async () => {
    const receipt = deferred<{ aggregate: ProductionProjectRecord["aggregate"] }>();
    mocks.save.mockRejectedValueOnce(new Error("응답 유실")).mockReturnValueOnce(receipt.promise);
    const { result } = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await expect(result.current.executeStrict(command, "저장")).rejects.toThrow("응답 유실"); });
    let recovery!: Promise<void>;
    act(() => { recovery = result.current.refresh(); });
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    await act(async () => {
      await result.current.refresh();
      await expect(result.current.executeStrict(command, "중복 결정")).rejects.toThrow("저장 결과를 복구");
    });
    expect(mocks.save).toHaveBeenCalledTimes(2);
    mocks.load.mockResolvedValueOnce(record("project-a", 3));
    await act(async () => { receipt.resolve({ aggregate: record("project-a", 2).aggregate }); await recovery; });
    expect(result.current.aggregate?.revision).toBe(3);
  });

  it("영수증 확인 후 최신 GET이 실패해도 영수증의 과거 aggregate로 화면을 바꾸지 않는다", async () => {
    mocks.save.mockRejectedValueOnce(new Error("응답 유실"))
      .mockResolvedValueOnce({ aggregate: record("project-a", 2).aggregate });
    const { result } = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await expect(result.current.executeStrict(command, "저장")).rejects.toThrow("응답 유실"); });
    mocks.load.mockRejectedValueOnce(new Error("최신 조회 실패"));
    await act(async () => result.current.refresh());
    expect(result.current.aggregate?.revision).toBe(1);
    expect(result.current.notice).toContain("저장 결과를 확인");
    expect(result.current.notice).toContain("최신 조회 실패");
    await act(async () => { await expect(result.current.executeStrict(command, "새 결정")).rejects.toThrow("저장 결과를 복구"); });
    mocks.load.mockResolvedValueOnce(record("project-a", 9));
    await act(async () => result.current.refresh());
    expect(result.current.aggregate?.revision).toBe(9);
    expect(mocks.save).toHaveBeenCalledTimes(2);
  });

  it("확인된 저장보다 오래된 GET은 복구 완료로 표시하지 않고 최신 조회까지 변경을 막는다", async () => {
    mocks.save.mockRejectedValueOnce(new Error("응답 유실"))
      .mockResolvedValueOnce({ aggregate: record("project-a", 2).aggregate });
    const { result } = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await expect(result.current.executeStrict(command, "저장")).rejects.toThrow("응답 유실"); });
    await act(async () => result.current.refresh());
    expect(result.current.saveState).toBe("error");
    expect(result.current.notice).toContain("오래된 조회 응답");
    await act(async () => { await expect(result.current.executeStrict(command, "새 결정")).rejects.toThrow("저장 결과를 복구"); });
    mocks.load.mockResolvedValueOnce(record("project-a", 3));
    await act(async () => result.current.refresh());
    expect(result.current.aggregate?.revision).toBe(3);
    expect(mocks.save).toHaveBeenCalledTimes(2);
  });

  it("복구 요청이 충돌로 확정 거부되면 최신 상태만 읽고 명령을 새 버전으로 재실행하지 않는다", async () => {
    mocks.save.mockRejectedValueOnce(new Error("응답 유실"))
      .mockRejectedValueOnce(Object.assign(new Error("원래 버전 충돌"), { status: 409 }));
    const { result } = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await expect(result.current.executeStrict(command, "저장")).rejects.toThrow("응답 유실"); });
    mocks.load.mockResolvedValueOnce(record("project-a", 6));
    await act(async () => result.current.refresh());
    expect(result.current.aggregate?.revision).toBe(6);
    expect(mocks.save.mock.calls[1]).toEqual(mocks.save.mock.calls[0]);
    expect(mocks.save).toHaveBeenCalledTimes(2);
    mocks.save.mockResolvedValueOnce({ aggregate: record("project-a", 7).aggregate });
    await act(async () => result.current.executeStrict(command, "사용자가 확인한 새 저장"));
    expect(mocks.save.mock.calls[2]?.[1]).toBe(6);
    expect(mocks.save.mock.calls[2]?.[3]).not.toBe(mocks.save.mock.calls[0]?.[3]);
  });

  it("복구에서 권한 회수가 확인되면 영수증 요청과 민감 캐시를 폐기한다", async () => {
    mocks.save.mockRejectedValueOnce(new Error("응답 유실"))
      .mockRejectedValueOnce(Object.assign(new Error("권한 회수"), { status: 403 }));
    const { result } = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await expect(result.current.executeStrict(command, "저장")).rejects.toThrow("응답 유실"); });
    await act(async () => result.current.refresh());
    expect(result.current.aggregate).toBeNull(); expect(result.current.access.view).toBe(false);
    mocks.load.mockRejectedValueOnce(Object.assign(new Error("권한 회수"), { status: 403 }));
    await act(async () => result.current.refresh());
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(result.current.aggregate).toBeNull();
  });

  it("복구 도중 프로젝트가 바뀌면 이전 영수증과 후속 조회를 새 화면에 적용하지 않는다", async () => {
    const receipt = deferred<{ aggregate: ProductionProjectRecord["aggregate"] }>();
    mocks.save.mockRejectedValueOnce(new Error("응답 유실")).mockReturnValueOnce(receipt.promise);
    const { result, rerender } = renderHook(({ id }) => useProductionProjectSession(id, "owner", demo), { initialProps: { id: "project-a" } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await expect(result.current.executeStrict(command, "저장")).rejects.toThrow("응답 유실"); });
    let recovery!: Promise<void>;
    act(() => { recovery = result.current.refresh(); });
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    mocks.load.mockResolvedValueOnce(record("project-b", 8));
    rerender({ id: "project-b" });
    await waitFor(() => expect(result.current.aggregate?.projectId).toBe("project-b"));
    await act(async () => { receipt.resolve({ aggregate: record("project-a", 2).aggregate }); await recovery; });
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(result.current.aggregate?.revision).toBe(8);
    mocks.save.mockResolvedValueOnce({ aggregate: record("project-b", 9).aggregate });
    await act(async () => result.current.executeStrict(command, "새 프로젝트 저장"));
    // 다른 프로젝트의 미확인 요청이 새 프로젝트의 변경을 가로막지 않는다.
    expect(mocks.save).toHaveBeenCalledTimes(3);
  });
});

describe("새로고침과 표시 설정 변경 후 저장 복구", () => {
  it("언어와 demo adapter 참조가 바뀌어도 진행 중 요청과 최초 식별자를 유지한다", async () => {
    const sent = deferred<{ aggregate: ProductionProjectRecord["aggregate"] }>();
    mocks.save.mockReturnValueOnce(sent.promise);
    const { result, rerender } = renderHook(({ adapter }) => useProductionProjectSession("project-a", "owner", adapter), { initialProps: { adapter: demo } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let operation!: Promise<unknown>;
    act(() => { operation = result.current.executeStrict(command, "저장").catch((cause: unknown) => cause); });
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    const original = mocks.save.mock.calls[0];
    act(() => useI18n.setState({ lang: "en" }));
    rerender({ adapter: { ...demo } });
    expect(mocks.load).toHaveBeenCalledTimes(1);
    await act(async () => { sent.reject(new Error("응답 유실")); await operation; });
    expect(await operation).toBeInstanceOf(Error);
    expect(loadProductionCommandRecovery("owner", "project-a")?.mutationId).toBe(original?.[3]);
    mocks.save.mockResolvedValueOnce({ aggregate: record("project-a", 2).aggregate });
    mocks.load.mockResolvedValueOnce(record("project-a", 4));
    await act(async () => result.current.refresh());
    expect(mocks.save.mock.calls[1]).toEqual(original);
    expect(result.current.aggregate?.revision).toBe(4);
    expect(result.current.notice).toContain("unconfirmed save was recovered");
  });

  it("ACK 도착 전 언마운트해도 기록이 남고 복원 첫 조회는 권한만 확인한다", async () => {
    const response = deferred<{ aggregate: ProductionProjectRecord["aggregate"] }>();
    mocks.save.mockReturnValueOnce(response.promise);
    const first = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    let pending!: Promise<unknown>;
    act(() => { pending = first.result.current.executeStrict(command, "저장").catch((cause: unknown) => cause); });
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    const original = mocks.save.mock.calls[0];
    expect(loadProductionCommandRecovery("owner", "project-a")?.mutationId).toBe(original?.[3]);
    first.unmount();
    mocks.load.mockResolvedValue(record("project-a", 3));
    const second = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(second.result.current.notice).toContain("이전 저장 요청을 복원");
    expect(mocks.save).toHaveBeenCalledTimes(1);
    await act(async () => { await expect(second.result.current.executeStrict(command, "중복 저장")).rejects.toThrow("저장 결과를 복구"); });
    mocks.save.mockResolvedValueOnce({ aggregate: record("project-a", 2).aggregate });
    await act(async () => second.result.current.refresh());
    expect(mocks.save.mock.calls[1]).toEqual(original);
    expect(second.result.current.aggregate?.revision).toBe(3);
    expect(loadProductionCommandRecovery("owner", "project-a")).toBeNull();
    await act(async () => { response.resolve({ aggregate: record("project-a", 2).aggregate }); await pending; });
    expect(second.result.current.aggregate?.revision).toBe(3);
  });

  it("영수증 확인 후 GET 실패도 confirmedRevision을 보존해 복원 뒤 POST하지 않는다", async () => {
    mocks.save.mockRejectedValueOnce(new Error("응답 유실")).mockResolvedValueOnce({ aggregate: record("project-a", 2).aggregate });
    const first = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    await act(async () => { await expect(first.result.current.executeStrict(command, "저장")).rejects.toThrow("응답 유실"); });
    mocks.load.mockRejectedValueOnce(new Error("최신 조회 실패"));
    await act(async () => first.result.current.refresh());
    expect(loadProductionCommandRecovery("owner", "project-a")?.confirmedRevision).toBe(2);
    first.unmount();
    mocks.load.mockResolvedValue(record("project-a", 5));
    const second = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(loadProductionCommandRecovery("owner", "project-a")).toBeNull();
    await act(async () => second.result.current.refresh());
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(second.result.current.aggregate?.revision).toBe(5);
    expect(loadProductionCommandRecovery("owner", "project-a")).toBeNull();
  });

  it("로그아웃은 계정 복구 기록을 폐기하고 다른 계정에는 이전 명령을 재전송하지 않는다", async () => {
    mocks.save.mockRejectedValueOnce(new Error("응답 유실"));
    const { result, rerender } = renderHook(({ actor }) => useProductionProjectSession("project-a", actor, demo), { initialProps: { actor: "owner" as string | null } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await expect(result.current.executeStrict(command, "저장")).rejects.toThrow("응답 유실"); });
    expect(loadProductionCommandRecovery("owner", "project-a")).not.toBeNull();
    act(() => { mocks.actor = null; mocks.revision += 1; for (const notify of mocks.listeners) notify(); });
    rerender({ actor: null });
    expect(loadProductionCommandRecovery("owner", "project-a")).toBeNull();
    mocks.actor = "another-user"; rerender({ actor: "another-user" });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.refresh());
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it("동일 계정의 인증 갱신은 원래 요청을 보존하고 현재 접근을 다시 확인한다", async () => {
    mocks.save.mockRejectedValueOnce(new Error("응답 유실"));
    const { result } = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await expect(result.current.executeStrict(command, "저장")).rejects.toThrow("응답 유실"); });
    const original = mocks.save.mock.calls[0];
    act(() => { mocks.revision += 1; for (const notify of mocks.listeners) notify(); });
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
    expect(mocks.save).toHaveBeenCalledTimes(1);
    mocks.save.mockResolvedValueOnce({ aggregate: record("project-a", 2).aggregate });
    mocks.load.mockResolvedValueOnce(record("project-a", 3));
    await act(async () => result.current.refresh());
    expect(mocks.save.mock.calls[1]).toEqual(original);
  });

  it("제작 화면을 떠난 뒤 로그아웃해도 계정의 복구 기록을 폐기한다", async () => {
    mocks.save.mockRejectedValueOnce(new Error("응답 유실"));
    const first = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    await act(async () => { await expect(first.result.current.executeStrict(command, "저장")).rejects.toThrow("응답 유실"); });
    first.unmount();
    expect(loadProductionCommandRecovery("owner", "project-a")).not.toBeNull();
    act(() => { mocks.actor = null; mocks.revision += 1; for (const notify of mocks.listeners) notify(); });
    expect(loadProductionCommandRecovery("owner", "project-a")).toBeNull();
  });

  it("복원 첫 권한 조회가 거부되면 쓰지 않고 민감 기록까지 제거한다", async () => {
    mocks.save.mockRejectedValueOnce(new Error("응답 유실"));
    const first = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    await act(async () => { await expect(first.result.current.executeStrict(command, "저장")).rejects.toThrow("응답 유실"); });
    first.unmount();
    mocks.load.mockRejectedValueOnce(Object.assign(new Error("권한 회수"), { status: 403 }));
    const second = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(second.result.current.aggregate).toBeNull();
    expect(loadProductionCommandRecovery("owner", "project-a")).toBeNull();
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it("저장소 차단 시 보존 실패를 알리고 미확인 요청이 있는 동안 이탈을 경고한다", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("quota", "QuotaExceededError"); });
    mocks.save.mockRejectedValueOnce(new Error("응답 유실"));
    const { result } = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await expect(result.current.executeStrict(command, "저장")).rejects.toThrow("복구 영역에 보관하지 못했습니다"); });
    const blocked = new Event("beforeunload", { cancelable: true });
    expect(window.dispatchEvent(blocked)).toBe(false);
    expect(result.current.notice).toContain("이 탭을 유지");
    mocks.save.mockResolvedValueOnce({ aggregate: record("project-a", 2).aggregate });
    mocks.load.mockResolvedValueOnce(record("project-a", 3));
    await act(async () => result.current.refresh());
    expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(true);
  });
});
