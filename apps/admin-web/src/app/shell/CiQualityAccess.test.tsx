// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CiQualityAccess } from "./CiQualityAccess";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), mount: vi.fn() }));
vi.mock("../../platform/http/admin-identity", () => ({ loadAdminIdentity: mocks.identity }));
vi.mock("../../domains/operations/ci-quality/CiQualityBoard", () => ({ CiQualityBoard: ({ userIdentity }: { userIdentity: string }) => {
  mocks.mount(userIdentity);
  return <p>보드 사용자 {userIdentity}</p>;
} }));

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe("CI·QA 권한 경계", () => {
  it("서버 확인이 끝나기 전에 보드나 저장소를 열지 않는다", async () => {
    mocks.identity.mockReturnValue(new Promise(() => undefined));
    render(<CiQualityAccess />);
    expect(screen.getByRole("status").textContent).toContain("관리자 권한");
    expect(mocks.mount).not.toHaveBeenCalled();
  });
  it("서버에서 허용한 사용자 식별자로만 보드를 연다", async () => {
    mocks.identity.mockResolvedValue({ id: "actor-a", role: "admin" });
    render(<CiQualityAccess />);
    await screen.findByText("보드 사용자 actor-a");
    expect(mocks.mount).toHaveBeenCalledWith("actor-a");
  });
  it("거부·통신 실패에서 보드를 표시하지 않으며 재확인할 수 있다", async () => {
    mocks.identity.mockRejectedValueOnce(new Error("권한 확인 실패"));
    render(<CiQualityAccess />);
    await screen.findByRole("alert");
    expect(mocks.mount).not.toHaveBeenCalled();
    mocks.identity.mockResolvedValue({ id: "actor-b", role: "operator" });
    fireEvent.click(screen.getByRole("button", { name: "관리자 권한 다시 확인" }));
    await screen.findByText("보드 사용자 actor-b");
  });
  it("세션 변경 후 거부되면 이전 사용자의 보드를 제거한다", async () => {
    mocks.identity.mockResolvedValueOnce({ id: "actor-a", role: "admin" });
    render(<CiQualityAccess />);
    await screen.findByText("보드 사용자 actor-a");
    mocks.identity.mockRejectedValueOnce(new Error("로그아웃되었습니다."));
    fireEvent(window, new Event("toonstudio:auth-session-changed"));
    await screen.findByText("로그아웃되었습니다.");
    expect(screen.queryByText("보드 사용자 actor-a")).toBeNull();
  });
  it("계정 전환 결과를 받으면 이전 계정의 상태를 재사용하지 않는다", async () => {
    mocks.identity.mockResolvedValueOnce({ id: "actor-a", role: "admin" });
    render(<CiQualityAccess />);
    await screen.findByText("보드 사용자 actor-a");
    mocks.identity.mockResolvedValueOnce({ id: "actor-b", role: "operator" });
    fireEvent.focus(window);
    await screen.findByText("보드 사용자 actor-b");
    expect(screen.queryByText("보드 사용자 actor-a")).toBeNull();
  });
  it("뒤늦은 이전 요청이 새 계정을 덮어쓰지 않는다", async () => {
    let resolveFirst: ((value: { id: string; role: string }) => void) | undefined;
    mocks.identity.mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }));
    render(<CiQualityAccess />);
    mocks.identity.mockResolvedValueOnce({ id: "actor-b", role: "admin" });
    fireEvent.focus(window);
    await screen.findByText("보드 사용자 actor-b");
    resolveFirst?.({ id: "actor-a", role: "admin" });
    await waitFor(() => expect(screen.queryByText("보드 사용자 actor-a")).toBeNull());
  });
});
