// @vitest-environment jsdom
import { act, cleanup, fireEvent, renderHook, waitFor } from "@testing-library/react";
import { createOperationsWorkspace, createWorkspaceRecord } from "@toonstudio/contracts/admin-workspace";
import { afterEach, expect, it, vi } from "vitest";

import { useCoordinationOperations } from "./use-coordination-operations";

const mocks = vi.hoisted(() => ({ load: vi.fn(), actor: vi.fn() }));
vi.mock("../../platform/http/workspace-api", () => ({ loadAdminWorkspace: mocks.load }));
vi.mock("../../platform/http/admin-identity", () => ({ loadAdminIdentity: mocks.actor }));
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.restoreAllMocks(); });

function server() {
  const state = createOperationsWorkspace();
  state.records = [createWorkspaceRecord("a", "cloud", "task"), createWorkspaceRecord("b", "business", "task")];
  return { state, scope: "operations", access: { operations: { canRead: true } } };
}

it("확인된 계정의 운영 자료만 노출하고 세션 변경 뒤 실패하면 숨긴다", async () => {
  mocks.load.mockResolvedValueOnce(server()).mockRejectedValueOnce(new Error("권한 없음"));
  mocks.actor.mockResolvedValue({ id: "one", role: "admin" });
  const { result } = renderHook(() => useCoordinationOperations("one", true));
  await waitFor(() => expect(result.current.phase).toBe("ready"));
  expect(result.current.records.map(row => row.id)).toEqual(["a"]);
  expect(mocks.load).toHaveBeenCalledWith(expect.any(AbortSignal), "operations");
  act(() => { fireEvent(window, new Event("toonstudio:auth-session-changed")); });
  expect(result.current.records).toEqual([]);
  await waitFor(() => expect(result.current.phase).toBe("unavailable"));
});
it("사용자가 바뀌거나 페이지가 숨겨지면 이전 응답을 표시하지 않는다", async () => {
  const getter = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  mocks.load.mockResolvedValue(server()); mocks.actor.mockResolvedValue({ id: "one", role: "operator" });
  const { result, rerender } = renderHook(({ user }) => useCoordinationOperations(user, true), { initialProps: { user: "one" } });
  await waitFor(() => expect(result.current.records).toHaveLength(1));
  getter.mockReturnValue("hidden"); act(() => { fireEvent(document, new Event("visibilitychange")); });
  expect(result.current.records).toEqual([]);
  getter.mockReturnValue("visible"); rerender({ user: "two" });
  await waitFor(() => expect(result.current.error).not.toBe(""));
  expect(result.current.records).toEqual([]);
});
