// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  emitSession,
  getAuthSession,
  getAuthSessionRevision,
  mergeCurrentSessionProfile,
  persistSession,
} from "@/domains/auth/public/session/auth-session-state";
import { useI18n } from "@/shared/lib/i18n-core";
import { createProductionDemoProject } from "./production-demo";
import { useProductionProjectSession } from "./use-production-project-session";

import type { ProductionProjectRecord } from "./production-api";

// 인증 상태와 프로젝트 hook은 실제 구현을 사용하고 서버 경계만 대체한다.
const server = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), recover: vi.fn() }));
vi.mock("./production-api", () => ({
  getProductionProject: server.load,
  executeProductionCommand: server.save,
  recoverProductionCommand: server.recover,
}));
const cachedUser = { id: "owner-auth-bootstrap", name: "작가", email: "author@example.test", image: null, role: "owner" };
const projectId = "project-auth-bootstrap";
function record(): ProductionProjectRecord {
  return {
    aggregate: { ...createProductionDemoProject(), projectId, revision: 1 },
    access: { view: true, comment: true, edit: true, manage: true, owner: true, role: "owner" },
  };
}
const demo = {
  create: () => createProductionDemoProject(),
  reduce: (current: ProductionProjectRecord["aggregate"]) => ({ ...current, revision: current.revision + 1 }),
};
async function flushWork() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  persistSession(null);
  useI18n.setState({ lang: "ko" });
  server.load.mockReset();
  server.load.mockResolvedValue(record());
  server.save.mockReset();
  server.recover.mockReset();
});
afterEach(() => {
  cleanup();
  persistSession(null);
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

it("캐시→쿠키 검증→동일 프로필은 실제 프로젝트 GET 한 번이며 명시적 재로그인은 다시 조회한다", async () => {
  persistSession({ user: { ...cachedUser }, token: null });
  const { result, rerender } = renderHook(({ ready }) => useProductionProjectSession(
    projectId, getAuthSession()?.user.id ?? null, demo, { authReady: ready },
  ), { initialProps: { ready: false } });
  await flushWork();
  const readsBeforeCookieVerification = server.load.mock.calls.length;

  act(() => {
    emitSession({ user: { ...cachedUser }, token: null });
    rerender({ ready: true });
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  const beforeMerge = getAuthSession();
  const revisionBeforeMerge = getAuthSessionRevision();
  let merged: ReturnType<typeof mergeCurrentSessionProfile> = null;
  act(() => { merged = mergeCurrentSessionProfile({ ...cachedUser }); });
  await flushWork();
  await waitFor(() => expect(result.current.loading).toBe(false));

  // 구 구현은 캐시·쿠키 검증·동일 프로필에서 각각 조회한다. 두 수정 뒤 한 번만 남는다.
  expect(server.load).toHaveBeenCalledTimes(1);
  expect(server.load).toHaveBeenCalledWith(projectId);
  expect(readsBeforeCookieVerification).toBe(0);
  expect(merged).toBe(beforeMerge);
  expect(getAuthSessionRevision()).toBe(revisionBeforeMerge);
  expect(result.current.aggregate?.projectId).toBe(projectId);
  expect(result.current.access.owner).toBe(true);
  expect(server.save).not.toHaveBeenCalled();
  expect(server.recover).not.toHaveBeenCalled();

  act(() => { persistSession({ user: { ...cachedUser }, token: null }); });
  await flushWork();
  await waitFor(() => expect(server.load).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(getAuthSessionRevision()).toBe(revisionBeforeMerge + 1);
  expect(result.current.aggregate?.projectId).toBe(projectId);
});
