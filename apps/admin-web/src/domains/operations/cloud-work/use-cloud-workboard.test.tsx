// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { blankTask, emptyBoard } from "@toonstudio/contracts/admin-cloud-workboard";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminApiError } from "../../../platform/http/admin-api";

import { useCloudWorkboard } from "./use-cloud-workboard";

import type { CloudWorkboardResponse } from "@toonstudio/contracts/admin-cloud-workboard";

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("../../../platform/http/cloud-workboard-api", () => ({ loadCloudWorkboard: mocks.load, saveCloudWorkboard: mocks.save }));
const response = (revision = 0): CloudWorkboardResponse => ({ board: emptyBoard(), revision, storedAt: null });
beforeEach(() => { vi.resetAllMocks(); mocks.load.mockResolvedValue(response()); });
afterEach(cleanup);

describe("클라우드 작업 서버 저장 경계", () => {
  it("초기 저장소 실패를 빈 보드나 예시 데이터로 덮지 않는다", async () => {
    mocks.load.mockRejectedValue(new AdminApiError(503, "storage unavailable"));
    const hook = renderHook(() => useCloudWorkboard(vi.fn()));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.board).toBeNull();
    expect(hook.result.current.loadError).toContain("마이그레이션");
    await act(async () => { expect(await hook.result.current.commit(emptyBoard())).toBe(false); });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("통신 실패 후 같은 편집본 재시도는 동일 mutationId를 재사용한다", async () => {
    mocks.save.mockRejectedValueOnce(new Error("응답 연결이 끊겼습니다."));
    const hook = renderHook(() => useCloudWorkboard(vi.fn()));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    const next = { ...emptyBoard(), tasks: [{ ...blankTask(), title: "기록할 작업" }] };
    await act(async () => { expect(await hook.result.current.commit(next)).toBe(false); });
    mocks.save.mockResolvedValueOnce({ ...response(1), board: next });
    await act(async () => { expect(await hook.result.current.commit(next)).toBe(true); });
    expect(mocks.save.mock.calls[0]?.slice(0, 3)).toEqual(mocks.save.mock.calls[1]?.slice(0, 3));
    expect(mocks.save.mock.calls[0]?.[2]).toMatch(/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/u);
    expect(hook.result.current.revision).toBe(1);
    expect(hook.result.current.board).toEqual(next);
  });
  it("409에서 덮어쓰기를 멈추고 최신 버전 재조회 뒤에만 저장을 허용한다", async () => {
    mocks.load.mockResolvedValueOnce(response(2));
    mocks.save.mockRejectedValueOnce(new AdminApiError(409, "변경됨"));
    const hook = renderHook(() => useCloudWorkboard(vi.fn()));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    const next = { ...emptyBoard(), tasks: [{ ...blankTask(), title: "보존할 편집본" }] };
    await act(async () => { await hook.result.current.commit(next); });
    expect(hook.result.current.conflict).toBe(true);
    expect(hook.result.current.saveError).toContain("편집본은 유지");
    await act(async () => { expect(await hook.result.current.commit(next)).toBe(false); });
    expect(mocks.save).toHaveBeenCalledTimes(1);
    mocks.load.mockResolvedValueOnce(response(3));
    await act(async () => { await hook.result.current.reload(); });
    mocks.save.mockResolvedValueOnce({ ...response(4), board: next });
    await act(async () => { expect(await hook.result.current.commit(next)).toBe(true); });
    expect(mocks.save.mock.calls[1]?.[1]).toBe(3);
    expect(mocks.save.mock.calls[0]?.[2]).not.toBe(mocks.save.mock.calls[1]?.[2]);
  });
  it("권한 만료 응답에서 개인 기록을 제거하고 권한 경계에 통보한다", async () => {
    const board = { ...emptyBoard(), tasks: [{ ...blankTask(), title: "관리자 개인 기록" }] };
    mocks.load.mockResolvedValueOnce({ ...response(), board });
    const denied = vi.fn();
    const hook = renderHook(() => useCloudWorkboard(denied));
    await waitFor(() => expect(hook.result.current.board).toEqual(board));
    mocks.save.mockRejectedValueOnce(new AdminApiError(403, "만료됨"));
    await act(async () => { await hook.result.current.commit(board); });
    expect(hook.result.current.board).toBeNull();
    expect(denied).toHaveBeenCalledOnce();
  });
  it("이전 조회의 늦은 응답은 새 조회를 덮지 않으며 unmount 뒤 응답도 무시한다", async () => {
    let finish: ((value: CloudWorkboardResponse) => void) | undefined;
    mocks.load.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const denied = vi.fn();
    const hook = renderHook(() => useCloudWorkboard(denied));
    mocks.load.mockResolvedValueOnce(response(3));
    await act(async () => { await hook.result.current.reload(); });
    await act(async () => { finish?.(response(1)); });
    expect(hook.result.current.revision).toBe(3);
    const firstSignal = mocks.load.mock.calls[0]?.[0] as AbortSignal;
    expect(firstSignal.aborted).toBe(true);
    let rejectLate: ((cause: Error) => void) | undefined;
    mocks.load.mockReturnValueOnce(new Promise((_, reject) => { rejectLate = reject; }));
    let reloading: Promise<boolean> | undefined;
    act(() => { reloading = hook.result.current.reload(); });
    hook.unmount();
    await act(async () => { rejectLate?.(new AdminApiError(401, "이전 계정")); await reloading; });
    expect(denied).not.toHaveBeenCalled();
  });
});
