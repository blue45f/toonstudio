// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BusinessPlanAccess } from "./BusinessPlanAccess";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), mount: vi.fn() }));
vi.mock("../../platform/http/admin-identity", () => ({ loadAdminIdentity: mocks.identity }));
vi.mock("../../domains/business-plan/BusinessPlanBoard", () => ({
  BusinessPlanBoard: ({ userIdentity }: { userIdentity: string }) => {
    mocks.mount(userIdentity);
    return <p>사업 자료 {userIdentity}</p>;
  },
}));

beforeEach(() => { mocks.identity.mockReset(); mocks.mount.mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("사업계획서의 서버 관리자 권한 경계", () => {
  it("확인 전에는 자료를 읽지 않고 operator는 거부한다", async () => {
    mocks.identity.mockResolvedValue({ id: "operator-a", role: "operator" });
    render(<BusinessPlanAccess />);
    expect(screen.getByRole("status")).toBeTruthy();
    await screen.findByRole("alert");
    expect(mocks.mount).not.toHaveBeenCalled();
  });

  it("실패 후 사용자가 다시 확인하여 admin인 경우에만 보드를 연다", async () => {
    mocks.identity.mockRejectedValueOnce(new Error("인증 서버 연결 실패"));
    render(<BusinessPlanAccess />);
    await screen.findByText("인증 서버 연결 실패");
    expect(mocks.mount).not.toHaveBeenCalled();
    mocks.identity.mockResolvedValueOnce({ id: "admin-a", role: "admin" });
    fireEvent.click(screen.getByRole("button", { name: "관리자 권한 다시 확인" }));
    await screen.findByText("사업 자료 admin-a");
  });

  it("세션이 바뀌면 이전 계정의 보드를 제거한다", async () => {
    mocks.identity.mockResolvedValueOnce({ id: "admin-a", role: "admin" });
    render(<BusinessPlanAccess />);
    await screen.findByText("사업 자료 admin-a");
    mocks.identity.mockResolvedValueOnce({ id: "admin-b", role: "admin" });
    fireEvent(window, new Event("toonstudio:auth-session-changed"));
    await screen.findByText("사업 자료 admin-b");
    expect(screen.queryByText("사업 자료 admin-a")).toBeNull();
    mocks.identity.mockRejectedValueOnce(new Error("로그아웃"));
    fireEvent.focus(window);
    await screen.findByText("로그아웃");
    expect(screen.queryByText("사업 자료 admin-b")).toBeNull();
  });

  it("보드 API가 거부하면 자료를 제거하고 자동 재시도 루프를 막는다", async () => {
    mocks.identity.mockResolvedValue({ id: "admin-a", role: "admin" });
    render(<BusinessPlanAccess />);
    await screen.findByText("사업 자료 admin-a");
    fireEvent(window, new Event("toonstudio:business-plan-access-denied"));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText("사업 자료 admin-a")).toBeNull();
    fireEvent.focus(window);
    expect(mocks.identity).toHaveBeenCalledTimes(1);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "관리자 권한 다시 확인" }));
    await screen.findByText("사업 자료 admin-a");
    expect(mocks.identity).toHaveBeenCalledTimes(2);
  });

  it("늦게 도착한 이전 인증 응답이 새 사용자를 덮어쓰지 않는다", async () => {
    const first = Promise.withResolvers<{ id: string; role: string }>();
    mocks.identity.mockReturnValueOnce(first.promise);
    render(<BusinessPlanAccess />);
    mocks.identity.mockResolvedValueOnce({ id: "admin-b", role: "admin" });
    fireEvent.focus(window);
    await screen.findByText("사업 자료 admin-b");
    first.resolve({ id: "admin-a", role: "admin" });
    await waitFor(() => expect(screen.queryByText("사업 자료 admin-a")).toBeNull());
  });
});
