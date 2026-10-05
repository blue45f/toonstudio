// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ProductionActivityWorkspace } from "./ProductionActivityWorkspace";
import { createProductionDemoProject } from "./production-demo";
import {
  loadProductionVersionActivity,
  type ProductionVersionActivityEntry,
} from "./production-version-activity";

vi.mock("./production-version-activity", async (importOriginal) => {
  const original = await importOriginal<typeof import("./production-version-activity")>();
  return { ...original, loadProductionVersionActivity: vi.fn() };
});

const loadVersionActivity = vi.mocked(loadProductionVersionActivity);

function renderWorkspace(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("ProductionActivityWorkspace", () => {
  it("행위자 이름과 행동 라벨로 전체 활동을 보여 준다", () => {
    const aggregate = createProductionDemoProject();
    renderWorkspace(
      <ProductionActivityWorkspace
        aggregate={aggregate}
        viewerUserId="demo-story"
        viewerAssignmentIds={["assignment-story"]}
      />,
    );

    expect(screen.getByText("총 8건의 변경이 기록돼 있습니다.")).toBeTruthy();
    expect(screen.getAllByText("강민서 작가").length).toBeGreaterThan(0);
    expect(screen.getAllByText("윤하림 작가").length).toBeGreaterThan(0);
    expect(screen.getByText(/프로젝트 생성/)).toBeTruthy();
  });

  it("내 관련 필터는 다른 사람이 한 무관한 변경을 숨긴다", () => {
    const aggregate = createProductionDemoProject();
    renderWorkspace(
      <ProductionActivityWorkspace
        aggregate={aggregate}
        viewerUserId="demo-story"
        viewerAssignmentIds={["assignment-story"]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /내 관련/ }));

    expect(screen.getAllByText("강민서 작가").length).toBeGreaterThan(0);
    expect(screen.queryByText("윤하림 작가")).toBeNull();
    expect(screen.getByText("4건 중 4건 표시")).toBeTruthy();
  });

  it("활동이 없으면 빈 상태를 안내한다", () => {
    const aggregate = { ...createProductionDemoProject(), auditEvents: [] };
    renderWorkspace(
      <ProductionActivityWorkspace
        aggregate={aggregate}
        viewerUserId="demo-story"
        viewerAssignmentIds={["assignment-story"]}
      />,
    );

    expect(screen.getByText("기록된 활동이 없습니다")).toBeTruthy();
  });
});

const VERSION_ENTRY: ProductionVersionActivityEntry = {
  id: "version:snapshot-created:snap-1",
  kind: "snapshot-created",
  occurredAt: "2026-10-05T09:00:00.000Z",
  actorUserId: "demo-story",
  actorName: "강민서 작가",
  actorIsViewer: true,
  relatedToViewer: true,
  artifactId: "artifact-1",
  artifactTitle: "1화 원고",
  snapshotName: "검수본 v3",
  permission: null,
  href: "/production/projects/sample-project/manuscripts?artifact=artifact-1&manuscriptView=versions",
};

describe("ProductionActivityWorkspace 버전·공유 합류", () => {
  it("서버 버전 기록을 피드에 합류시키고 버전 표면 링크를 단다", async () => {
    loadVersionActivity.mockResolvedValue({ entries: [VERSION_ENTRY], failedArtifactCount: 0 });
    const aggregate = createProductionDemoProject();
    renderWorkspace(
      <ProductionActivityWorkspace
        aggregate={aggregate}
        viewerUserId="demo-story"
        viewerAssignmentIds={["assignment-story"]}
        versionActivityEnabled
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/버전 스냅샷 생성/)).toBeTruthy();
    });
    expect(screen.getByText("총 9건의 활동이 기록돼 있습니다.")).toBeTruthy();
    expect(screen.getByText(/1화 원고 — 검수본 v3/)).toBeTruthy();
    const link = screen.getByRole("link", { name: "버전 보기" });
    expect(link.getAttribute("href")).toBe(VERSION_ENTRY.href);
    // 감사 기록 본체도 함께 보인다.
    expect(screen.getByText(/프로젝트 생성/)).toBeTruthy();
  });

  it("버전 조회가 실패해도 감사 기록은 그대로 보이고 다시 시도를 제공한다", async () => {
    loadVersionActivity.mockRejectedValue(new Error("network down"));
    const aggregate = createProductionDemoProject();
    renderWorkspace(
      <ProductionActivityWorkspace
        aggregate={aggregate}
        viewerUserId="demo-story"
        viewerAssignmentIds={["assignment-story"]}
        versionActivityEnabled
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/버전·공유 활동을 불러오지 못했습니다/)).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
    expect(screen.getByText("총 8건의 변경이 기록돼 있습니다.")).toBeTruthy();
    expect(screen.getByText(/프로젝트 생성/)).toBeTruthy();
  });

  it("일부 원고만 실패하면 부분 표시를 안내한다", async () => {
    loadVersionActivity.mockResolvedValue({ entries: [VERSION_ENTRY], failedArtifactCount: 2 });
    const aggregate = createProductionDemoProject();
    renderWorkspace(
      <ProductionActivityWorkspace
        aggregate={aggregate}
        viewerUserId="demo-story"
        viewerAssignmentIds={["assignment-story"]}
        versionActivityEnabled
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/일부만 표시합니다/)).toBeTruthy();
    });
    expect(screen.getByText(/버전 스냅샷 생성/)).toBeTruthy();
  });
});
