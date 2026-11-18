// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CiQualityAccess } from "./CiQualityAccess";

interface NestGateProps {
  userIdentity: string; role: string; verified: boolean;
  onUnauthorized: (message: string) => void;
}

const mocks = vi.hoisted(() => ({ identity: vi.fn(), mount: vi.fn(), nest: vi.fn() }));
vi.mock("../../platform/http/admin-identity", () => ({ loadAdminIdentity: mocks.identity }));
vi.mock("../../domains/operations/ci-quality/CiQualityBoard", () => ({ CiQualityBoard: ({ userIdentity }: { userIdentity: string }) => {
  mocks.mount(userIdentity);
  return <p>보드 사용자 {userIdentity}</p>;
} }));
vi.mock("../../domains/operations/nestjs-quality/NestQualityBoard", () => ({ NestQualityBoard: (props: NestGateProps) => {
  const [draft, setDraft] = useState("");
  mocks.nest(props);
  return <section><p>Nest 보드 사용자 {props.userIdentity} · {props.role}</p>
    <label>Nest 연결 초안<input value={draft} disabled={!props.verified} onChange={(event) => setDraft(event.target.value)} /></label>
  </section>;
} }));

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });

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
  it("NestJS 보기에도 권한 확인 전 mount를 막고 operator 역할을 전달한다", async () => {
    window.history.replaceState(null, "", "/admin/platform/quality/?view=nestjs");
    let allow: ((value: { id: string; role: string }) => void) | undefined;
    mocks.identity.mockReturnValueOnce(new Promise((resolve) => { allow = resolve; }));
    render(<CiQualityAccess />);
    expect(mocks.nest).not.toHaveBeenCalled();
    allow?.({ id: "operator-a", role: "operator" });
    await screen.findByText("Nest 보드 사용자 operator-a · operator");
    expect(mocks.nest).toHaveBeenLastCalledWith(expect.objectContaining({ userIdentity: "operator-a", role: "operator", verified: true }));
    expect(mocks.mount).not.toHaveBeenCalled();
  });
  it("같은 계정 재확인 중 Nest 요청을 비활성화하고 확인 후 초안을 유지한다", async () => {
    window.history.replaceState(null, "", "/admin/platform/quality/?view=nestjs");
    mocks.identity.mockResolvedValueOnce({ id: "actor-a", role: "admin" });
    render(<CiQualityAccess />);
    await screen.findByText("Nest 보드 사용자 actor-a · admin");
    fireEvent.change(screen.getByLabelText("Nest 연결 초안"), { target: { value: "유지할 초안" } });
    let allow: ((value: { id: string; role: string }) => void) | undefined;
    mocks.identity.mockReturnValueOnce(new Promise((resolve) => { allow = resolve; }));
    fireEvent.focus(window);
    expect(mocks.nest).toHaveBeenLastCalledWith(expect.objectContaining({ verified: false }));
    expect(screen.getByLabelText("Nest 연결 초안").closest("[hidden]")).not.toBeNull();
    await act(async () => { allow?.({ id: "actor-a", role: "admin" }); });
    expect(mocks.nest).toHaveBeenLastCalledWith(expect.objectContaining({ verified: true }));
    expect(screen.getByLabelText<HTMLInputElement>("Nest 연결 초안").value).toBe("유지할 초안");
  });
  it("같은 계정이 operator로 바뀌면 Nest 편집 초안을 재사용하지 않는다", async () => {
    window.history.replaceState(null, "", "/admin/platform/quality/?view=nestjs");
    mocks.identity.mockResolvedValueOnce({ id: "actor-a", role: "admin" });
    render(<CiQualityAccess />);
    await screen.findByText("Nest 보드 사용자 actor-a · admin");
    fireEvent.change(screen.getByLabelText("Nest 연결 초안"), { target: { value: "이전 권한 초안" } });
    mocks.identity.mockResolvedValueOnce({ id: "actor-a", role: "operator" });
    fireEvent(window, new Event("toonstudio:auth-session-changed"));
    await screen.findByText("Nest 보드 사용자 actor-a · operator");
    expect(screen.getByLabelText<HTMLInputElement>("Nest 연결 초안").value).toBe("");
  });
  it("Nest API 권한 거부는 공통 게이트를 닫고 늦은 신원 응답으로 다시 열리지 않는다", async () => {
    window.history.replaceState(null, "", "/admin/platform/quality/?view=nestjs");
    mocks.identity.mockResolvedValueOnce({ id: "actor-a", role: "admin" });
    render(<CiQualityAccess />);
    await screen.findByText("Nest 보드 사용자 actor-a · admin");
    let allow: ((value: { id: string; role: string }) => void) | undefined;
    mocks.identity.mockReturnValueOnce(new Promise((resolve) => { allow = resolve; }));
    fireEvent.focus(window);
    const props = mocks.nest.mock.lastCall?.[0] as NestGateProps;
    act(() => { props.onUnauthorized("합성 Nest API 권한 거부"); });
    expect((mocks.identity.mock.calls[1]?.[0] as AbortSignal).aborted).toBe(true);
    await act(async () => { allow?.({ id: "actor-a", role: "admin" }); });
    expect(screen.getByRole("alert").textContent).toContain("합성 Nest API 권한 거부");
    expect(screen.queryByLabelText("Nest 연결 초안")).toBeNull();
    mocks.identity.mockResolvedValueOnce({ id: "actor-b", role: "operator" });
    fireEvent.click(screen.getByRole("button", { name: "관리자 권한 다시 확인" }));
    await screen.findByText("Nest 보드 사용자 actor-b · operator");
  });
});
