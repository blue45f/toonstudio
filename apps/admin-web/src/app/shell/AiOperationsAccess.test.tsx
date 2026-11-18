// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiOperationsAccess } from "./AiOperationsAccess";

import type { AdminIdentity } from "../../platform/http/admin-identity";

const identity = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../../platform/http/admin-identity", () => ({ loadAdminIdentity: identity.load }));
vi.mock("../../domains/operations/ai-operations/AiOperationsBoard", () => ({ AiOperationsBoard: ({ userIdentity, authorized }: { userIdentity: string; authorized: boolean }) => authorized ? <div>보호된 합성 기록 {userIdentity}</div> : null }));
beforeEach(() => { identity.load.mockReset(); });
afterEach(cleanup);
describe("AI 운영 보드의 관리자 진입", () => {
  it("서버 권한 확인이 거부되면 보드 내용을 렌더링하지 않는다", async () => {
    identity.load.mockRejectedValue(new Error("활성 관리자 아님")); render(<AiOperationsAccess />);
    await screen.findByText("활성 관리자 아님"); expect(screen.queryByText(/보호된 합성 기록/u)).toBeNull();
  });
  it("재확인하는 동안 보드 DOM을 제거하고 권한 회수 후에도 제거 상태를 유지한다", async () => {
    identity.load.mockResolvedValueOnce({ id: "synthetic-admin", role: "admin" }); render(<AiOperationsAccess />); await screen.findByText("보호된 합성 기록 synthetic-admin");
    let deny: ((error: Error) => void) | undefined;
    identity.load.mockImplementationOnce(() => new Promise((_resolve, reject) => { deny = reject; })); fireEvent.focus(window);
    expect(screen.queryByText(/보호된 합성 기록/u)).toBeNull();
    await act(async () => { deny?.(new Error("권한 회수 확인")); }); await screen.findByText("권한 회수 확인"); expect(screen.queryByText(/보호된 합성 기록/u)).toBeNull();
  });
  it("이전 권한 요청의 늦은 성공이 더 최신 거부 결과를 덮어쓰지 않는다", async () => {
    let older: ((value: AdminIdentity) => void) | undefined;
    identity.load.mockImplementationOnce(() => new Promise((resolve) => { older = resolve; })).mockRejectedValueOnce(new Error("최신 권한 거부"));
    render(<AiOperationsAccess />); fireEvent.focus(window); await screen.findByText("최신 권한 거부");
    await act(async () => { older?.({ id: "stale-admin", role: "admin" }); });
    expect(screen.queryByText(/보호된 합성 기록/u)).toBeNull(); expect(screen.getByText("최신 권한 거부")).toBeTruthy();
  });
});
