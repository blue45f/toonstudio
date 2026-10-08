// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useApp } from "@/shared/lib/store";

import type { ProductionProjectSummary } from "@/domains/creator/public/production-projects";
import { SerialCenterOverview } from "./SerialCenterOverview";

const api = vi.hoisted(() => ({
  listProductionProjects: vi.fn(),
}));

vi.mock("@/domains/creator/public/production-projects", () => ({
  listProductionProjects: api.listProductionProjects,
}));

function summary(overrides: Partial<ProductionProjectSummary>): ProductionProjectSummary {
  return {
    projectId: "project-1",
    workId: "work-1",
    title: "별빛 항해자",
    coverImageUrl: null,
    collaborationModel: "solo",
    revision: 1,
    updatedAt: "2026-10-06T00:00:00.000Z",
    access: { view: true, comment: true, edit: true, manage: true, owner: true, role: "owner" },
    healthScore: 80,
    activeEpisodeCount: 2,
    readyBufferCount: 1,
    criticalRiskCount: 0,
    overdueTaskCount: 0,
    blockedTaskCount: 0,
    unassignedTaskCount: 0,
    reviewTaskCount: 0,
    nextReleaseAt: "2026-10-09T12:00:00.000Z",
    forecastFinishAt: null,
    scheduleConfidencePercent: null,
    ...overrides,
  };
}

function renderOverview(onSelectProject = vi.fn()) {
  return {
    onSelectProject,
    ...render(
      <MemoryRouter>
        <SerialCenterOverview ko onSelectProject={onSelectProject} />
      </MemoryRouter>,
    ),
  };
}

describe("SerialCenterOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useApp.setState({ userId: null, sessionToken: null });
  });

  afterEach(() => {
    cleanup();
    useApp.setState({ userId: null, sessionToken: null });
  });

  it("비로그인에서는 현황을 부르지 않고 로그인 안내와 캘린더 구분을 보여준다", () => {
    renderOverview();
    expect(screen.getByText(/로그인하면 내 작품의 다음 발행 예정/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "로그인하기" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "연재 캘린더" }).getAttribute("href")).toBe("/calendar");
    expect(api.listProductionProjects).not.toHaveBeenCalled();
  });

  it("작품별 다음 발행·준비 회차·밀린 작업을 보여주고 밀린 작품을 먼저 정렬한다", async () => {
    useApp.setState({ userId: "user-1", sessionToken: "token" });
    api.listProductionProjects.mockResolvedValue({
      projects: [
        summary({ projectId: "project-calm", title: "잔잔한 연재작", nextReleaseAt: "2026-10-08T12:00:00.000Z" }),
        summary({
          projectId: "project-late",
          title: "밀린 연재작",
          overdueTaskCount: 3,
          criticalRiskCount: 1,
          readyBufferCount: 0,
          nextReleaseAt: null,
        }),
      ],
    });
    const { container } = renderOverview();

    expect(await screen.findByText("밀린 연재작")).toBeTruthy();
    expect(screen.getByText("작품 2개 · 밀린 작업 3개 · 바로 올릴 수 있는 회차 1개")).toBeTruthy();
    // 다음 발행이 없으면 지어내지 않고 "예정 없음"으로 표기한다.
    expect(screen.getByText("예정 없음")).toBeTruthy();
    expect(screen.getByText("밀린 작업")).toBeTruthy();
    expect(screen.getByText("3개")).toBeTruthy();
    expect(screen.getByText("위험 1")).toBeTruthy();
    // 정렬: 밀린 작품 카드가 첫 번째다.
    const titles = [...container.querySelectorAll("li strong")].map((node) => node.textContent);
    expect(titles[0]).toBe("밀린 연재작");
    // 제작 현황 딥링크가 작품 개요로 이어진다.
    const links = screen.getAllByRole("link", { name: /제작 현황/ });
    expect(links[0]?.getAttribute("href")).toBe("/production/projects/project-late/overview");
  });

  it("게시 준비를 누르면 그 작품이 콜백으로 올라간다", async () => {
    useApp.setState({ userId: "user-1", sessionToken: "token" });
    api.listProductionProjects.mockResolvedValue({ projects: [summary({})] });
    const { onSelectProject } = renderOverview();

    fireEvent.click(await screen.findByRole("button", { name: /이 작품으로 게시 준비/ }));
    expect(onSelectProject).toHaveBeenCalledTimes(1);
    expect(onSelectProject.mock.calls[0]?.[0]).toMatchObject({ projectId: "project-1", title: "별빛 항해자" });
  });

  it("작품이 없으면 빈 상태를 시작 동선과 함께 보여준다 (오류와 구분)", async () => {
    useApp.setState({ userId: "user-1", sessionToken: "token" });
    api.listProductionProjects.mockResolvedValue({ projects: [] });
    renderOverview();

    expect(await screen.findByText(/아직 제작 중인 작품이 없어요/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /작품 시작하기/ }).getAttribute("href")).toBe("/create");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("불러오기 실패는 오류 상태로 구분하고 다시 시도가 재호출한다", async () => {
    useApp.setState({ userId: "user-1", sessionToken: "token" });
    api.listProductionProjects.mockRejectedValue(new Error("network down"));
    renderOverview();

    expect(await screen.findByRole("alert")).toBeTruthy();
    api.listProductionProjects.mockResolvedValue({ projects: [summary({})] });
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => {
      expect(api.listProductionProjects).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText("별빛 항해자")).toBeTruthy();
  });
});
