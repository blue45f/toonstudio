// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import type { ProductionPersonalInboxItem, ProductionProjectSummary } from "./production-dashboard-api";
import { ProductionLandingOverview } from "./ProductionLandingOverview";

function project(overrides: Partial<ProductionProjectSummary>): ProductionProjectSummary {
  return {
    projectId: "project-a",
    workId: "work-a",
    title: "작품 A",
    coverImageUrl: null,
    collaborationModel: "studio-production",
    revision: 1,
    updatedAt: "2026-09-17T00:00:00.000Z",
    access: { view: true, comment: true, edit: true, manage: true, owner: true, role: "owner" },
    healthScore: 80,
    activeEpisodeCount: 0,
    readyBufferCount: 0,
    criticalRiskCount: 0,
    overdueTaskCount: 0,
    blockedTaskCount: 0,
    unassignedTaskCount: 0,
    reviewTaskCount: 0,
    nextReleaseAt: null,
    forecastFinishAt: null,
    scheduleConfidencePercent: null,
    ...overrides,
  };
}

const PROJECTS: readonly ProductionProjectSummary[] = [
  project({
    projectId: "project-a",
    title: "작품 A",
    activeEpisodeCount: 3,
    readyBufferCount: 1,
    criticalRiskCount: 2,
    overdueTaskCount: 2,
    blockedTaskCount: 1,
    reviewTaskCount: 2,
    nextReleaseAt: "2026-09-19T12:00:00.000Z",
  }),
  project({
    projectId: "project-b",
    workId: "work-b",
    title: "작품 B",
    activeEpisodeCount: 2,
    readyBufferCount: 0,
    overdueTaskCount: 0,
    blockedTaskCount: 4,
    reviewTaskCount: 1,
    nextReleaseAt: "2026-09-25T12:00:00.000Z",
  }),
];

const INBOX: readonly ProductionPersonalInboxItem[] = [{
  bucket: "dueToday",
  projectId: "project-a",
  projectTitle: "작품 A",
  taskId: "task-1",
  taskTitle: "18화 선화 마무리",
  processKey: "line-art",
  status: "in-progress",
  dueAt: "2026-09-17T09:00:00.000Z",
  estimateHours: 6,
  episodeId: "episode-18",
}];

describe("ProductionLandingOverview", () => {
  afterEach(() => cleanup());

  it("진행 현황을 단계별 합산과 가장 가까운 다음 공개로 보여 준다", () => {
    render(<MemoryRouter><ProductionLandingOverview projects={PROJECTS} inboxItems={INBOX} /></MemoryRouter>);
    expect(screen.getByText("오늘의 제작 한눈에")).toBeTruthy();
    expect(screen.getByText("작품 2개")).toBeTruthy();
    expect(screen.getByText(/만드는 중 5개/u)).toBeTruthy();
    expect(screen.getByText(/검수 대기 3건/u)).toBeTruthy();
    expect(screen.getByText(/게시 준비 1회/u)).toBeTruthy();
    expect(screen.getByText(/다음 공개 작품 A/u)).toBeTruthy();
  });

  it("다음 행동은 작업함의 첫 항목 하나만 골라 그 작업으로 연결한다", () => {
    render(<MemoryRouter><ProductionLandingOverview projects={PROJECTS} inboxItems={INBOX} /></MemoryRouter>);
    const link = screen.getByRole("link", { name: /18화 선화 마무리/u });
    expect(link.getAttribute("href")).toBe("/production/projects/project-a/production?task=task-1");
    expect(screen.getByText("오늘 제출")).toBeTruthy();
  });

  it("막힌 지점은 합산과 가장 막힌 작품의 막힘 필터 링크를 보여 준다", () => {
    render(<MemoryRouter><ProductionLandingOverview projects={PROJECTS} inboxItems={INBOX} /></MemoryRouter>);
    expect(screen.getByText("막힌 작업 5건 · 기한 초과 2건")).toBeTruthy();
    expect(screen.getByText(/위험 신호 2건/u)).toBeTruthy();
    expect(screen.getByText(/작품 B에 가장 많아요/u)).toBeTruthy();
    expect(screen.getByRole("link", { name: /막힌 작업 보기/u }).getAttribute("href"))
      .toBe("/production/projects/project-b/production?boardFocus=blocked");
  });

  it("작업함이 비면 다음 행동 자리에 급한 일이 없다는 상태를 보여 준다", () => {
    render(<MemoryRouter><ProductionLandingOverview projects={PROJECTS} inboxItems={[]} /></MemoryRouter>);
    expect(screen.getByText("지금 급한 일은 없어요")).toBeTruthy();
  });

  it("막힌 작업이 없으면 막힘 없음 상태를 보여 준다", () => {
    const calm = [project({ projectId: "project-c", title: "작품 C", activeEpisodeCount: 1 })];
    render(<MemoryRouter><ProductionLandingOverview projects={calm} inboxItems={[]} /></MemoryRouter>);
    expect(screen.getByText("막힌 작업이 없어요")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /막힌 작업 보기/u })).toBeNull();
  });
});
