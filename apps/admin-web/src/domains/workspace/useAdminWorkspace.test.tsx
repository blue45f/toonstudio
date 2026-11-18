// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createAdminWorkspace, parseAdminWorkspaceSave } from "@toonstudio/contracts/admin-workspace";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminApiError } from "../../platform/http/admin-api";

import { useAdminWorkspace } from "./useAdminWorkspace";

import type { AdminWorkspaceSave, AdminWorkspaceView } from "@toonstudio/contracts/admin-workspace";

const api = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("../../platform/http/workspace-api", () => ({ loadAdminWorkspace: api.load, saveAdminWorkspace: api.save }));
const actor = { id: "synthetic-admin", role: "admin" as const };
function view(): AdminWorkspaceView { return { boardId: "toonstudio", revision: 1, state: createAdminWorkspace(), updatedAt: "2026-11-18T00:00:00Z", canEdit: true }; }
beforeEach(() => {
  vi.clearAllMocks();
  api.load.mockResolvedValue(view());
  api.save.mockImplementation(async (input: AdminWorkspaceSave) => {
    const parsed = parseAdminWorkspaceSave(input);
    if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
    return { boardId: "toonstudio", revision: input.expectedRevision + 1, updatedAt: "2026-11-18T00:01:00Z", replayed: false };
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("작업실 저장 수명 주기", () => {
  it("StrictMode 재마운트에서도 초기 읽기를 마치고 UUID 계약에 맞춰 저장한다", async () => {
    const { result } = renderHook(() => useAdminWorkspace(actor), { wrapper: StrictMode });
    await waitFor(() => expect(result.current.canEdit).toBe(true));
    const next = structuredClone(result.current.state!);
    next.records[0].notes = "합성 검토 메모";
    await act(async () => { expect(await result.current.commit(next, "저장했습니다.")).toBeNull(); });
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(parseAdminWorkspaceSave(api.save.mock.calls[0][0]).ok).toBe(true);
    expect(result.current).toMatchObject({ revision: 2, dirty: false, canEdit: true });
  });

  it("저장 결과가 불명확하면 편집을 보존하고 같은 UUID·revision으로만 재시도한다", async () => {
    api.save.mockRejectedValueOnce(new AdminApiError(503, "연결 실패"));
    const { result } = renderHook(() => useAdminWorkspace(actor));
    await waitFor(() => expect(result.current.canEdit).toBe(true));
    const next = structuredClone(result.current.state!);
    next.records[0].notes = "실패해도 보존할 편집";
    await act(async () => { await result.current.commit(next, "저장"); });
    expect(result.current).toMatchObject({ dirty: true, canEdit: false, revision: 1 });
    expect(result.current.state?.records[0].notes).toBe("실패해도 보존할 편집");
    const attempted = api.save.mock.calls[0][0] as AdminWorkspaceSave;
    await act(async () => { expect(await result.current.commit(next, "새 편집")).toContain("미저장 변경"); });
    expect(api.save).toHaveBeenCalledTimes(1);
    await act(async () => { expect(await result.current.retry()).toBeNull(); });
    expect(api.save.mock.calls[1][0]).toEqual(attempted);
    expect(result.current).toMatchObject({ dirty: false, revision: 2, canEdit: true });
  });

  it("409에서 자동으로 최신 내용을 덮어쓰지 않고 실패한 명시적 읽기에도 초안을 유지한다", async () => {
    api.save.mockRejectedValueOnce(new AdminApiError(409, "충돌"));
    const { result } = renderHook(() => useAdminWorkspace(actor));
    await waitFor(() => expect(result.current.canEdit).toBe(true));
    const next = structuredClone(result.current.state!);
    next.records[0].notes = "충돌한 편집";
    await act(async () => { await result.current.commit(next, "저장"); });
    expect(api.load).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ conflict: true, dirty: true });
    await act(async () => { expect(await result.current.retry()).toContain("충돌"); });
    expect(api.save).toHaveBeenCalledTimes(1);
    api.load.mockRejectedValueOnce(new AdminApiError(503, "최신 읽기 실패"));
    await act(async () => { expect(await result.current.reload()).toBe(false); });
    expect(result.current.state?.records[0].notes).toBe("충돌한 편집");
    expect(result.current).toMatchObject({ conflict: true, dirty: true });
    await act(async () => { expect(await result.current.reload()).toBe(true); });
    expect(result.current).toMatchObject({ conflict: false, dirty: false, canEdit: true });
  });

  it("운영자와 권한 철회 후에는 저장을 실행하지 않는다", async () => {
    const { result, unmount } = renderHook(() => useAdminWorkspace({ id: "operator", role: "operator" }));
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    await act(async () => { expect(await result.current.commit(createAdminWorkspace(), "저장")).toContain("권한"); });
    expect(api.save).not.toHaveBeenCalled();
    unmount();
    api.save.mockRejectedValueOnce(new AdminApiError(403, "권한 철회"));
    const admin = renderHook(() => useAdminWorkspace(actor));
    await waitFor(() => expect(admin.result.current.canEdit).toBe(true));
    await act(async () => { await admin.result.current.commit(createAdminWorkspace(), "저장"); });
    expect(admin.result.current).toMatchObject({ phase: "denied", canEdit: false });
    await act(async () => { expect(await admin.result.current.retry()).toContain("권한"); });
    expect(api.save).toHaveBeenCalledTimes(1);
  });

  it("빈 서버의 첫 저장에서는 이미 확인된 것처럼 등록할 수 없다", async () => {
    api.load.mockResolvedValueOnce({ ...view(), revision: 0, state: null, updatedAt: null });
    const { result } = renderHook(() => useAdminWorkspace(actor));
    await waitFor(() => expect(result.current.canEdit).toBe(true));
    const next = structuredClone(result.current.state!);
    Object.assign(next.records[0], { factStatus: "확인", sourceTitle: "합성 출처", sourceUrl: "https://example.test/source", verifiedAt: "2020-01-01", reviewer: "시험 검증자", verificationNote: "합성 검증 기록" });
    await act(async () => { expect(await result.current.commit(next, "저장")).not.toBeNull(); });
    expect(api.save).not.toHaveBeenCalled();
    expect(result.current.state?.records[0].factStatus).toBe("미확인");
  });

  it("유효한 UUID를 생성할 수 없는 환경에서 약한 저장 식별자로 대체하지 않는다", async () => {
    const { result } = renderHook(() => useAdminWorkspace(actor));
    await waitFor(() => expect(result.current.canEdit).toBe(true));
    vi.stubGlobal("crypto", {});
    try {
      await act(async () => { expect(await result.current.commit(createAdminWorkspace(), "저장")).toContain("안전한 저장 식별자"); });
      expect(api.save).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});
