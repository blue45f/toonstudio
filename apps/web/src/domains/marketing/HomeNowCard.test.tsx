// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionContext, type SessionContextValue } from "@/domains/auth/public/session/auth-session-store";
import { listProductionProjects } from "@/domains/creator/public/production-projects";
import { useApp } from "@/shared/lib/store";
import { HomeNowCard } from "./HomeNowCard";

vi.mock("@/domains/creator/public/production-projects", () => ({ listProductionProjects: vi.fn() }));

const listProjects = vi.mocked(listProductionProjects);
type ProjectList = Awaited<ReturnType<typeof listProductionProjects>>;

function signedIn(id: string, ready = true): SessionContextValue {
  return { data: { user: { id, name: id } }, ready, status: "authenticated", update: async () => null };
}

const guest: SessionContextValue = {
  data: null, ready: true, status: "unauthenticated", update: async () => null,
};

function projects(id: string): ProjectList {
  return { projects: [{
    projectId: id, workId: `work-${id}`, title: `원고 ${id}`, coverImageUrl: null,
    collaborationModel: "solo", revision: 1, updatedAt: "2026-11-27T00:00:00.000Z",
    access: { view: true, comment: true, edit: true, manage: true, owner: true, role: "owner" },
    healthScore: 80, activeEpisodeCount: 1, readyBufferCount: 0, criticalRiskCount: 0,
    overdueTaskCount: 0, blockedTaskCount: 0, unassignedTaskCount: 0, reviewTaskCount: 0,
    nextReleaseAt: null, forecastFinishAt: null, scheduleConfidencePercent: null,
  }] };
}

function home(session: SessionContextValue) {
  return (
    <MemoryRouter>
      <SessionContext.Provider value={session}>
        <HomeNowCard><input aria-label="아이디어 입력" defaultValue="살려 둘 입력" /></HomeNowCard>
      </SessionContext.Provider>
    </MemoryRouter>
  );
}

function pendingProjects() {
  let resolve: (value: ProjectList) => void = () => { throw new Error("프로젝트 응답을 초기화하지 못했습니다."); };
  const response = new Promise<ProjectList>((done) => { resolve = done; });
  listProjects.mockReturnValueOnce(response);
  return resolve;
}

beforeEach(() => {
  listProjects.mockReset();
  useApp.setState({ userId: null });
});

afterEach(() => {
  cleanup();
  useApp.setState({ userId: null });
});

describe("홈 개인 작업 카드의 계정 범위", () => {
  it("두 계정이 바로 전환되어도 이전 원고를 지우고 같은 소개 입력과 초점을 유지한다", async () => {
    const resolveFirst = pendingProjects();
    const resolveSecond = pendingProjects();
    useApp.setState({ userId: "actor-a" });
    const page = render(home(signedIn("actor-a")));
    const input = screen.getByRole("textbox", { name: "아이디어 입력" });
    input.focus();
    await act(async () => { resolveFirst(projects("actor-a")); });
    expect(screen.getByText(/원고 actor-a/u)).toBeTruthy();

    act(() => {
      useApp.setState({ userId: "actor-b" });
      page.rerender(home(signedIn("actor-b")));
    });
    expect(screen.queryByText(/원고 actor-a/u)).toBeNull();
    expect(screen.getByRole("textbox", { name: "아이디어 입력" })).toBe(input);
    expect(document.activeElement).toBe(input);

    await act(async () => { resolveSecond(projects("actor-b")); });
    expect(screen.getByText(/원고 actor-b/u)).toBeTruthy();
    expect(screen.queryByText(/원고 actor-a/u)).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it("서로 다른 세션·앱 계정과 준비되지 않은 세션에서는 예전 응답을 적용하지 않는다", async () => {
    const resolveFirst = pendingProjects();
    const resolveSecond = pendingProjects();
    useApp.setState({ userId: "actor-a" });
    const page = render(home(signedIn("actor-a")));

    page.rerender(home(signedIn("actor-b")));
    await act(async () => { resolveFirst(projects("actor-a")); });
    expect(screen.queryByText(/원고 actor-a/u)).toBeNull();
    expect(listProjects).toHaveBeenCalledTimes(1);

    page.rerender(home(signedIn("actor-b", false)));
    act(() => { useApp.setState({ userId: "actor-b" }); });
    expect(listProjects).toHaveBeenCalledTimes(1);

    page.rerender(home(signedIn("actor-b")));
    await act(async () => { resolveSecond(projects("actor-b")); });
    expect(listProjects).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/원고 actor-b/u)).toBeTruthy();

    page.rerender(home(guest));
    expect(screen.queryByText(/원고 actor-b/u)).toBeNull();
    expect(screen.getByRole("textbox", { name: "아이디어 입력" })).toBeTruthy();
  });
});
