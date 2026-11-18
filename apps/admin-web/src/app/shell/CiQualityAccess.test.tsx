// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CiQualityAccess } from "./CiQualityAccess";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), mount: vi.fn(), cloudMount: vi.fn(), nest: vi.fn() }));
vi.mock("../../platform/http/admin-identity", () => ({ loadAdminIdentity: mocks.identity }));
vi.mock("../../domains/operations/ci-quality/CiQualityBoard", () => ({ CiQualityBoard: ({ userIdentity }: { userIdentity: string }) => {
  mocks.mount(userIdentity);
  return <p>보드 사용자 {userIdentity}</p>;
} }));
vi.mock("../../domains/operations/cloud-work/CloudWorkBoard", () => ({ CloudWorkBoard: ({ onAccessDenied }: { onAccessDenied: (message: string) => void }) => {
  mocks.cloudMount();
  return <div><p>클라우드 개인 작업 기록</p><button type="button" onClick={() => onAccessDenied("보드 권한이 만료되었습니다.")}>보드 권한 만료</button></div>;
} }));

vi.mock("../../domains/operations/nestjs-quality/NestQualityBoard", () => ({ NestQualityBoard: (props: { userIdentity: string; role: string; verified: boolean; onUnauthorized: (message: string) => void }) => {
  mocks.nest(props);
  return <div><p>Nest 보드 사용자 {props.userIdentity} · {props.role}</p><button type="button" onClick={() => props.onUnauthorized("Nest 권한이 만료되었습니다.")}>Nest 권한 만료</button></div>;
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
});

describe("클라우드 작업 관리자 전용 경계", () => {
  it("Nest 조회에서 클라우드로 전환하면 기존 보드를 제거하고 운영자 접근을 다시 차단한다", async () => {
    mocks.identity.mockResolvedValue({ id: "operator-a", role: "operator" });
    const view = render(<CiQualityAccess view="nestjs" />);
    await screen.findByText("Nest 보드 사용자 operator-a · operator");
    view.rerender(<CiQualityAccess view="cloud-work" />);
    expect(screen.queryByText("Nest 보드 사용자 operator-a · operator")).toBeNull();
    expect((await screen.findByRole("alert")).textContent).toContain("운영자 권한으로는 열 수 없습니다");
    expect(mocks.cloudMount).not.toHaveBeenCalled();
  });
  it("같은 계정의 관리자 권한이 해제되면 클라우드 기록을 제거한다", async () => {
    mocks.identity.mockResolvedValueOnce({ id: "actor-a", role: "admin" });
    render(<CiQualityAccess view="cloud-work" />);
    await screen.findByText("클라우드 개인 작업 기록");
    mocks.identity.mockResolvedValueOnce({ id: "actor-a", role: "operator" });
    fireEvent(window, new Event("toonstudio:auth-session-changed"));
    expect((await screen.findByRole("alert")).textContent).toContain("운영자 권한으로는 열 수 없습니다");
    expect(screen.queryByText("클라우드 개인 작업 기록")).toBeNull();
  });
  it("운영자에게 클라우드 모듈을 열지 않는다", async () => {
    mocks.identity.mockResolvedValue({ id: "operator-a", role: "operator" });
    render(<CiQualityAccess view="cloud-work" />);
    expect((await screen.findByRole("alert")).textContent).toContain("운영자 권한으로는 열 수 없습니다");
    expect(mocks.cloudMount).not.toHaveBeenCalled();
    expect(mocks.mount).not.toHaveBeenCalled();
  });
  it("관리자 검증이 완료되기 전에는 비공개 보드를 마운트하지 않는다", async () => {
    let resolve: ((value: { id: string; role: string }) => void) | undefined;
    mocks.identity.mockReturnValue(new Promise(done => { resolve = done; }));
    render(<CiQualityAccess view="cloud-work" />);
    expect(mocks.cloudMount).not.toHaveBeenCalled();
    resolve?.({ id: "admin-a", role: "admin" });
    await screen.findByText("클라우드 개인 작업 기록");
    expect(mocks.cloudMount).toHaveBeenCalled();
  });
  it("보드 API의 권한 거부가 비공개 UI를 제거하고 늦은 재검증 응답으로 다시 열리지 않는다", async () => {
    mocks.identity.mockResolvedValueOnce({ id: "admin-a", role: "admin" });
    render(<CiQualityAccess view="cloud-work" />);
    await screen.findByText("클라우드 개인 작업 기록");
    let resolve: ((value: { id: string; role: string }) => void) | undefined;
    mocks.identity.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    fireEvent.focus(window);
    fireEvent.click(screen.getByText("보드 권한 만료"));
    await screen.findByText("보드 권한이 만료되었습니다.");
    expect(screen.queryByText("클라우드 개인 작업 기록")).toBeNull();
    resolve?.({ id: "admin-a", role: "admin" });
    await waitFor(() => expect(screen.queryByText("클라우드 개인 작업 기록")).toBeNull());
  });
});

it("NestJS 재확인 중에는 검증 상태를 내리고 API 권한 거부 뒤 늦은 확인이 보드를 복구하지 않는다", async () => {
  window.history.replaceState(null, "", "/admin/platform/quality/?view=nestjs");
  mocks.identity.mockResolvedValueOnce({ id: "nest-admin", role: "admin" });
  render(<CiQualityAccess />);
  await screen.findByText("Nest 보드 사용자 nest-admin · admin");
  let resolve: ((value: { id: string; role: string }) => void) | undefined;
  mocks.identity.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  fireEvent.focus(window);
  expect(mocks.nest).toHaveBeenLastCalledWith(expect.objectContaining({ verified: false }));
  fireEvent.click(screen.getByText("Nest 권한 만료"));
  await screen.findByText("Nest 권한이 만료되었습니다.");
  resolve?.({ id: "nest-admin", role: "admin" });
  await waitFor(() => expect(screen.queryByText("Nest 보드 사용자 nest-admin · admin")).toBeNull());
});
