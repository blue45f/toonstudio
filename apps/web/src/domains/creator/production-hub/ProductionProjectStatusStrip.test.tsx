// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import type { ProductionProjectAggregate, ProductionTask } from "@toonstudio/core/production";

import { createProductionDemoProject } from "./production-demo";
import {
  deriveDashboardProgress,
  deriveDashboardNextStep,
} from "./production-project-dashboard-model";
import { productionEpisodeRoomPath, productionSurfacePath } from "./production-project-surfaces";
import { ProductionProjectStatusStrip } from "./ProductionProjectStatusStrip";

afterEach(() => cleanup());

function renderStrip(aggregate: ProductionProjectAggregate) {
  return render(
    <MemoryRouter>
      <ProductionProjectStatusStrip aggregate={aggregate} />
    </MemoryRouter>,
  );
}

function withTaskStatuses(
  aggregate: ProductionProjectAggregate,
  statuses: readonly ProductionTask["status"][],
): ProductionProjectAggregate {
  return {
    ...aggregate,
    tasks: aggregate.tasks.slice(0, statuses.length).map((task, index) => ({ ...task, status: statuses[index] })),
  };
}

describe("ProductionProjectStatusStrip", () => {
  it("대시보드 모델이 계산한 진행률을 그대로 보여준다", () => {
    const aggregate = createProductionDemoProject();
    const progress = deriveDashboardProgress(aggregate);
    renderStrip(aggregate);
    const bar = screen.getByRole("progressbar", { name: "전체 작업 진행률" });
    expect(bar.getAttribute("aria-valuenow")).toBe(String(progress.percent));
    expect(screen.getByText(new RegExp(`${progress.completed}/${progress.total} 완료`))).toBeTruthy();
  });

  it("막힌 작업과 검수 대기 수를 모델 값으로 표시한다", () => {
    const aggregate = withTaskStatuses(createProductionDemoProject(), ["done", "blocked", "internal-review"]);
    renderStrip(aggregate);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("33");
    expect(screen.getByText("막힌 작업 1")).toBeTruthy();
    expect(screen.getByText("검수 대기 1")).toBeTruthy();
  });

  it("다음 행동 링크가 파생된 다음 단계와 같은 목적지를 가리킨다", () => {
    const aggregate = createProductionDemoProject();
    const progress = deriveDashboardProgress(aggregate);
    const nextStep = deriveDashboardNextStep(aggregate, progress, new Date());
    renderStrip(aggregate);
    const link = screen.getByRole("link", { name: /답하기|보기|확인|열기|시작/ });
    const expectedHref = nextStep.kind === "answer-question"
      ? productionEpisodeRoomPath(aggregate.projectId, nextStep.episodeId)
      : nextStep.kind === "overdue"
        ? productionSurfacePath(aggregate.projectId, "production", "boardFocus=overdue")
        : nextStep.kind === "review"
          ? productionSurfacePath(aggregate.projectId, "review")
          : productionSurfacePath(aggregate.projectId, "production");
    expect(link.getAttribute("href")).toBe(expectedHref);
  });

  it("작업이 없는 프로젝트는 현황을 지어내지 않고 빈 상태를 말한다", () => {
    const demo = createProductionDemoProject();
    const aggregate: ProductionProjectAggregate = {
      ...demo,
      tasks: [],
      episodes: [],
      clarifications: [],
      reviewDecisions: [],
    };
    renderStrip(aggregate);
    expect(screen.getByText("아직 등록된 작업이 없어요")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText(/급한 일이 없/)).toBeNull();
    expect(screen.getByRole("link", { name: /공정 보드에서 시작하기/ }).getAttribute("href"))
      .toBe(productionSurfacePath(aggregate.projectId, "production"));
  });
});
