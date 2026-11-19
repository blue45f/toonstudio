// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { StudioWorkspaceMiniApps } from "./StudioWorkspaceMiniApps";

import { createSpaceDeviceRecordFixture } from "./studio-space-device-record.test-fixture";
import { accessStudioSpaceRecord } from "./studio-space-device-record";

const db = createSpaceDeviceRecordFixture();
const ownership = vi.hoisted(() => ({ busy: false, reset: vi.fn(async () => { ownership.busy = false; return true; }) }));
vi.mock("../studio-local-database-runtime", () => ({
  acquireStudioLocalDatabase: async () => {
    if (ownership.busy) throw new Error("DedicatedWorker ownership lock failed");
    return db;
  },
  resetFailedStudioLocalDatabaseOwnership: ownership.reset,
}));
const ready = () => screen.findByRole("region", { name: "가상공간 앱 스토어" });
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
beforeEach(() => { session.actor = null; db.records.clear(); window.localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("다시 열어도 복원하고 계정·작업공간 전환은 실행 중인 앱까지 격리한다", async () => {
  const first = render(surface());
  await ready();
  detail("작화 퀴즈");
  fireEvent.click(store().getByRole("button", { name: "설치" }));
  await waitFor(() => expect(quiz()).toBeTruthy());
  first.unmount();
  const next = render(surface());
  await waitFor(() => expect(quiz()).toBeTruthy());
  fireEvent.click(quiz()!);
  expect(host().getByRole("button", { name: "앱 목록으로" })).toBeTruthy();
  session.actor = "actor-b";
  next.rerender(surface());
  await ready();
  expect(quiz()).toBeNull();
  expect(host().queryByRole("button", { name: "앱 목록으로" })).toBeNull();
  session.actor = null;
  next.rerender(surface("another-project"));
  await ready();
  expect(quiz()).toBeNull();
  next.rerender(surface());
  await waitFor(() => expect(quiz()).toBeTruthy());
  await ready();
  detail("작화 퀴즈");
  fireEvent.click(store().getByRole("button", { name: "제거" }));
  next.unmount();
  render(surface());
  await ready();
  expect(quiz()).toBeNull();
});

it("저장 실패를 알리고 재시도를 허용한다", async () => {
  render(surface());
  await ready();
  detail("작화 퀴즈");
  db.kvSet.mockRejectedValueOnce(new Error("quota"));
  fireEvent.click(store().getByRole("button", { name: "설치" }));
  expect((await screen.findByRole("alert")).textContent).toContain("저장하지 못했습니다");
  await ready();
  expect(quiz()).toBeNull();
  fireEvent.click(store().getByRole("button", { name: "설치" }));
  await waitFor(() => expect(quiz()).toBeTruthy());
  expect(screen.queryByRole("alert")).toBeNull();
});

it("저장 공간 읽기가 거부되면 실패를 표시하고 다시 읽어 원래 목록을 복구한다", async () => {
  const mounted = render(surface());
  await ready();
  detail("작화 퀴즈");
  fireEvent.click(store().getByRole("button", { name: "설치" }));
  await waitFor(() => expect(quiz()).toBeTruthy());
  mounted.unmount();
  ownership.busy = true;
  ownership.reset.mockClear();
  render(surface());
  expect((await screen.findByRole("alert")).textContent).toContain("목록을 열지 못했습니다");
  fireEvent.click(screen.getByRole("button", { name: "다시 읽기" }));
  await waitFor(() => expect(quiz()).toBeTruthy());
  expect(ownership.reset).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("다른 탭에서 제거한 실행 앱을 닫고 재설치해도 자동으로 열지 않는다", async () => {
  render(surface());
  await ready();
  detail("작화 퀴즈");
  fireEvent.click(store().getByRole("button", { name: "설치" }));
  await waitFor(() => expect(quiz()).toBeTruthy());
  fireEvent.click(quiz()!);
  const key = [...db.records.keys()].find(key => key.endsWith(":drawing-quiz"))!;
  await act(async () => { await accessStudioSpaceRecord(key, () => ({ value: null })); });
  await waitFor(() => expect(host().queryByRole("button", { name: "앱 목록으로" })).toBeNull());
  await act(async () => { await accessStudioSpaceRecord(key, () => ({ value: "1" })); });
  await waitFor(() => expect(quiz()).toBeTruthy());
});

it("기존 설치값을 1회 이관하고 제거 후 다시 나타나지 않는다", async () => {
  const key = 'toonstudio:workspace-apps:v1:[null,"draw-a"]:drawing-quiz';
  localStorage.setItem(key, "1");
  const page = render(surface());
  await waitFor(() => expect(quiz()).toBeTruthy());
  expect(db.records.get(key)).toBe('"1"');
  detail("작화 퀴즈");
  fireEvent.click(store().getByRole("button", { name: "제거" }));
  page.unmount();
  render(surface());
  await ready();
  expect(quiz()).toBeNull();
  expect(db.records.get(key)).toBe("null");
  expect(localStorage.getItem(key)).toBe("1");
});
