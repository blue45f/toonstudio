// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProductionLandingPage } from "./ProductionLandingPage";

import { useApp } from "@/shared/lib/store";

const api = vi.hoisted(() => ({
  listProductionProjects: vi.fn(),
  getProductionPersonalInbox: vi.fn(),
  getProductionProjectCollabRecord: vi.fn(),
  listStudioTeamComments: vi.fn(),
}));

vi.mock("./production-dashboard-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./production-dashboard-api")>();
  return {
    ...actual,
    listProductionProjects: (...args: unknown[]) => api.listProductionProjects(...args),
    getProductionPersonalInbox: (...args: unknown[]) => api.getProductionPersonalInbox(...args),
    getProductionProjectCollabRecord: (...args: unknown[]) => api.getProductionProjectCollabRecord(...args),
  };
});

vi.mock("../studio-team-comment-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../studio-team-comment-client")>();
  return {
    ...actual,
    listStudioTeamComments: (...args: unknown[]) => api.listStudioTeamComments(...args),
  };
});

/** 협업 알림 투영이 읽는 프로젝트 기록의 최소 형태: 내가 맡은 배정과 나를 언급한 서버 알림 1건. */
const collabRecord = {
  aggregate: {
    projectId: "project-risk",
    title: "위험한 연재작",
    parties: [{ id: "party-me", accountUserId: "user-portfolio", publicDisplayName: "나" }],
    assignments: [{ id: "assignment-me", partyId: "party-me", status: "active" }],
    notifications: [{
      id: "notification-mention",
      assignmentId: "assignment-me",
      type: "mention",
      title: "18화 12컷에서 나를 언급했어요",
      body: "선화 톤을 한 번 봐 주세요",
      href: "/production/projects/project-risk/episodes/episode-18?thread=thread-1",
      urgency: "normal",
      sourceType: "team-comment",
      sourceId: "thread-1",
      status: "unread",
      createdAt: "2026-09-17T01:00:00.000Z",
    }],
    reviewDecisions: [],
    handoffs: [],
  },
};

function resetUser(userId: string | null) {
  useApp.setState({ userId, sessionToken: userId ? "session-token" : null });
}

describe("ProductionLandingPage portfolio", () => {
  beforeEach(() => {
    resetUser("user-portfolio");
    api.listProductionProjects.mockResolvedValue({
      projects: [{
        projectId: "project-risk",
        workId: "work-risk",
        title: "위험한 연재작",
        collaborationModel: "studio-production",
        revision: 8,
        updatedAt: "2026-09-17T00:00:00.000Z",
        access: { view: true, comment: true, edit: true, manage: true, owner: true, role: "owner" },
        healthScore: 42,
        activeEpisodeCount: 3,
        readyBufferCount: 1,
        criticalRiskCount: 2,
        overdueTaskCount: 2,
        blockedTaskCount: 1,
        unassignedTaskCount: 1,
        reviewTaskCount: 2,
        nextReleaseAt: "2026-09-19T12:00:00.000Z",
        forecastFinishAt: "2026-09-20T12:00:00.000Z",
        scheduleConfidencePercent: 48,
      }],
    });
    api.getProductionPersonalInbox.mockResolvedValue({
      items: [{
        bucket: "inProgress",
        projectId: "project-risk",
        projectTitle: "위험한 연재작",
        taskId: "task-line-art",
        taskTitle: "18화 선화 마무리",
        processKey: "line-art",
        status: "in-progress",
        dueAt: "2026-09-17T09:00:00.000Z",
        estimateHours: 6,
        episodeId: "episode-18",
      }],
      counts: { dueToday: 0, inProgress: 1, review: 0, ready: 0, waitingInput: 0, blockingOthers: 0 },
    });
    api.getProductionProjectCollabRecord.mockResolvedValue(collabRecord);
    api.listStudioTeamComments.mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    cleanup();
    resetUser(null);
    vi.clearAllMocks();
  });

  it("shows risk-sorted project cards and a cross-project personal inbox", async () => {
    render(<MemoryRouter><ProductionLandingPage /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "내 제작 포트폴리오" })).toBeTruthy();
    // The heading belongs to the loading shell; both API results settle before cards appear.
    expect(await screen.findByText("위험한 연재작")).toBeTruthy();
    expect(screen.getByText("내 통합 작업함")).toBeTruthy();
    // 개요의 "다음 행동"이 작업함 첫 항목을 한 번 더 승격해 보여 주므로 두 곳에 나타난다.
    expect(screen.getAllByText("18화 선화 마무리")).toHaveLength(2);
    expect(screen.getByText("오늘의 제작 한눈에")).toBeTruthy();
    expect(screen.getByRole("link", { name: /개요 열기/u }).getAttribute("href"))
      .toBe("/production/projects/project-risk/overview");
    await waitFor(() => expect(api.listProductionProjects).toHaveBeenCalledTimes(1));
    expect(api.getProductionPersonalInbox).toHaveBeenCalledTimes(1);
  });

  it("협업 알림은 전체 제작 API 대신 얇은 대시보드 클라이언트로 프로젝트 기록을 읽어 인박스에 모은다", async () => {
    render(<MemoryRouter><ProductionLandingPage /></MemoryRouter>);

    expect(await screen.findByText("18화 12컷에서 나를 언급했어요")).toBeTruthy();
    expect(api.getProductionProjectCollabRecord).toHaveBeenCalledWith("project-risk");
    expect(api.listStudioTeamComments).toHaveBeenCalledWith("work-risk", expect.objectContaining({ status: "all" }));
  });

  it("한 프로젝트의 기록을 못 읽어도 포트폴리오와 작업함은 그대로 보이고 알림은 빈 상태로 남는다", async () => {
    api.getProductionProjectCollabRecord.mockRejectedValue(new Error("network"));
    render(<MemoryRouter><ProductionLandingPage /></MemoryRouter>);

    expect(await screen.findByText("내 통합 작업함")).toBeTruthy();
    await waitFor(() => expect(api.getProductionProjectCollabRecord).toHaveBeenCalledWith("project-risk"));
    expect(await screen.findByText(/아직 협업 알림이 없습니다/u)).toBeTruthy();
    expect(screen.queryByText("18화 12컷에서 나를 언급했어요")).toBeNull();
  });
});
