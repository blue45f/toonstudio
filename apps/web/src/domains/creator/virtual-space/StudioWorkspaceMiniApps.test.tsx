// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { StudioWorkspaceMiniApps } from "./StudioWorkspaceMiniApps";

const session = vi.hoisted(() => ({ actor: null as string | null }));
vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({ data: session.actor ? { user: { id: session.actor } } : null }),
  getAuthUserId: () => session.actor,
}));

const surface = (projectId?: string, path = "/?room=draw-a") => (
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="*" element={<StudioWorkspaceMiniApps projectId={projectId} />} /></Routes>
  </MemoryRouter>
);
const store = () => within(screen.getByRole("region", { name: "가상공간 앱 스토어" }));
const host = () => within(screen.getByRole("region", { name: "설치된 앱 실행" }));
const detail = (name: string) => fireEvent.click(store().getByRole("button", { name: new RegExp(name) }));
const quiz = () => host().queryByRole("button", { name: /작화 퀴즈/ });
beforeEach(() => { session.actor = null; window.localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("다시 열어도 복원하고 계정·작업공간 전환은 실행 중인 앱까지 격리한다", () => {
  const first = render(surface());
  detail("작화 퀴즈");
  fireEvent.click(store().getByRole("button", { name: "설치" }));
  expect(quiz()).toBeTruthy();
  first.unmount();
  const next = render(surface());
  fireEvent.click(quiz()!);
  expect(host().getByRole("button", { name: "앱 목록으로" })).toBeTruthy();
  session.actor = "actor-b";
  next.rerender(surface());
  expect(quiz()).toBeNull();
  expect(host().queryByRole("button", { name: "앱 목록으로" })).toBeNull();
  session.actor = null;
  next.rerender(surface("another-project"));
  expect(quiz()).toBeNull();
  next.rerender(surface());
  expect(quiz()).toBeTruthy();
  detail("작화 퀴즈");
  fireEvent.click(store().getByRole("button", { name: "제거" }));
  next.unmount();
  render(surface());
  expect(quiz()).toBeNull();
});

it("저장 실패를 알리고 재시도를 허용한다", () => {
  render(surface());
  detail("작화 퀴즈");
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw new Error("quota"); });
  fireEvent.click(store().getByRole("button", { name: "설치" }));
  expect(screen.getByRole("alert").textContent).toContain("저장하지 못했습니다");
  expect(quiz()).toBeNull();
  write.mockRestore();
  fireEvent.click(store().getByRole("button", { name: "설치" }));
  expect(quiz()).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("저장 공간 읽기가 거부되면 실패를 표시하고 다시 읽어 원래 목록을 복구한다", () => {
  const mounted = render(surface());
  detail("작화 퀴즈");
  fireEvent.click(store().getByRole("button", { name: "설치" }));
  mounted.unmount();
  const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
  render(surface());
  expect(screen.getByRole("alert").textContent).toContain("목록을 열지 못했습니다");
  read.mockRestore();
  fireEvent.click(screen.getByRole("button", { name: "다시 읽기" }));
  expect(quiz()).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("다른 탭에서 제거한 실행 앱을 닫고 재설치해도 자동으로 열지 않는다", () => {
  render(surface());
  detail("작화 퀴즈");
  fireEvent.click(store().getByRole("button", { name: "설치" }));
  fireEvent.click(quiz()!);
  const key = localStorage.key(0)!;
  act(() => { localStorage.removeItem(key); window.dispatchEvent(new StorageEvent("storage", { key })); });
  expect(host().queryByRole("button", { name: "앱 목록으로" })).toBeNull();
  act(() => { localStorage.setItem(key, "1"); window.dispatchEvent(new StorageEvent("storage", { key })); });
  expect(quiz()).toBeTruthy();
});
