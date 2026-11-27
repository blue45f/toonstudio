// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FinalSubmissionAccess } from "./FinalSubmissionAccess";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), mount: vi.fn() }));
vi.mock("../../platform/http/admin-identity", () => ({ loadAdminIdentity: mocks.identity }));
vi.mock("../../domains/final-submission/FinalSubmissionBoard", () => ({
  FinalSubmissionBoard: ({ userIdentity }: { userIdentity: string }) => {
    mocks.mount(userIdentity);
    return <p>개인 제출 자료 {userIdentity}</p>;
  },
}));

vi.mock("../../domains/final-submission/SubmissionCoordinationBoard", () => ({
  SubmissionCoordinationBoard: ({ userIdentity }: { userIdentity: string }) => <h1>조정 기록 {userIdentity}</h1>,
}));

beforeEach(() => { mocks.identity.mockReset(); mocks.mount.mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("최종 제출 점검의 서버 관리자 권한 경계", () => {
  it("확인 전에는 자료를 읽지 않고 일반 사용자 역할은 거부한다", async () => {
    mocks.identity.mockResolvedValue({ id: "user-a", role: "user" });
    render(<FinalSubmissionAccess />);
    expect(screen.getByRole("status")).toBeTruthy();
    await screen.findByRole("alert");
    expect(mocks.mount).not.toHaveBeenCalled();
  });

  it("실패 후 사용자가 다시 확인하여 admin인 경우에만 보드를 연다", async () => {
    mocks.identity.mockRejectedValueOnce(new Error("인증 서버 연결 실패"));
    render(<FinalSubmissionAccess />);
    await screen.findByText("인증 서버 연결 실패");
    expect(mocks.mount).not.toHaveBeenCalled();
    mocks.identity.mockResolvedValueOnce({ id: "admin-a", role: "admin" });
    fireEvent.click(screen.getByRole("button", { name: "관리자 권한 다시 확인" }));
    await screen.findByText("개인 제출 자료 admin-a");
  });

  it("세션이 바뀌면 이전 계정의 보드를 제거한다", async () => {
    mocks.identity.mockResolvedValueOnce({ id: "admin-a", role: "admin" });
    render(<FinalSubmissionAccess />);
    await screen.findByText("개인 제출 자료 admin-a");
    mocks.identity.mockResolvedValueOnce({ id: "admin-b", role: "admin" });
    fireEvent(window, new Event("toonstudio:auth-session-changed"));
    await screen.findByText("개인 제출 자료 admin-b");
    expect(screen.queryByText("개인 제출 자료 admin-a")).toBeNull();
    mocks.identity.mockRejectedValueOnce(new Error("로그아웃"));
    fireEvent.focus(window);
    await screen.findByText("로그아웃");
    expect(screen.queryByText("개인 제출 자료 admin-b")).toBeNull();
  });

  it("조정 화면은 활성 운영자의 신원을 사용하고 권한 회수 즉시 조정 기록을 제거한다", async () => {
    const identity = Promise.withResolvers<{ id: string; role: string }>();
    mocks.identity.mockReturnValueOnce(identity.promise);
    render(<FinalSubmissionAccess coordination />);
    expect(screen.queryByRole("heading")).toBeNull();
    identity.resolve({ id: "operator-a", role: "operator" });
    await screen.findByRole("heading", { name: "조정 기록 operator-a" });
    expect(mocks.mount).not.toHaveBeenCalled();
    fireEvent(window, new Event("toonstudio:final-submission-access-denied"));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText("조정 기록 operator-a")).toBeNull();
    fireEvent.focus(window);
    expect(mocks.identity).toHaveBeenCalledTimes(1);
  });

  it("보드 API가 거부하면 자료를 제거하고 자동 재시도 루프를 막는다", async () => {
    mocks.identity.mockResolvedValue({ id: "admin-a", role: "admin" });
    render(<FinalSubmissionAccess />);
    await screen.findByText("개인 제출 자료 admin-a");
    fireEvent(window, new Event("toonstudio:final-submission-access-denied"));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText("개인 제출 자료 admin-a")).toBeNull();
    fireEvent.focus(window);
    expect(mocks.identity).toHaveBeenCalledTimes(1);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "관리자 권한 다시 확인" }));
    await screen.findByText("개인 제출 자료 admin-a");
    expect(mocks.identity).toHaveBeenCalledTimes(2);
  });

  it("늦게 도착한 이전 인증 응답이 새 사용자를 덮어쓰지 않는다", async () => {
    const first = Promise.withResolvers<{ id: string; role: string }>();
    mocks.identity.mockReturnValueOnce(first.promise);
    render(<FinalSubmissionAccess />);
    mocks.identity.mockResolvedValueOnce({ id: "admin-b", role: "admin" });
    fireEvent.focus(window);
    await screen.findByText("개인 제출 자료 admin-b");
    first.resolve({ id: "admin-a", role: "admin" });
    await waitFor(() => expect(screen.queryByText("개인 제출 자료 admin-a")).toBeNull());
  });
});
