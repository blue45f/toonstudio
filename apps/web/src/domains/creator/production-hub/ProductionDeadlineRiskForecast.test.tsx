// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  episodeScope,
  type EpisodeCollaboration,
  type ProductionProjectAggregate,
  type ProductionTask,
} from "@toonstudio/core/production";

import { ProductionDeadlineRiskForecast } from "./ProductionDeadlineRiskForecast";

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

let seq = 0;
function task(partial: Partial<ProductionTask> & { readonly episodeId: string }): ProductionTask {
  seq += 1;
  const { episodeId, ...rest } = partial;
  return {
    id: `task-${seq}`,
    projectId: "project-1",
    scope: episodeScope("project-1", episodeId),
    processKey: "color",
    title: `작업 ${seq}`,
    status: "ready",
    assignmentIds: ["assign-1"],
    reviewerAssignmentIds: [],
    inputRevisionRefs: [],
    outputDeliverableIds: [],
    dependencyTaskIds: [],
    dueAt: null,
    estimateHours: { optimistic: 8, likely: 16, pessimistic: 24 },
    completionCriteria: [],
    sourceAgreementMilestoneId: null,
    ...rest,
  };
}

function episode(episodeId: string, partial: Partial<EpisodeCollaboration> = {}): EpisodeCollaboration {
  return {
    episodeId,
    state: "final-art-production",
    plannedReleaseAt: null,
    ...partial,
  } as EpisodeCollaboration;
}

function aggregate(partial: {
  readonly episodes: readonly EpisodeCollaboration[];
  readonly tasks: readonly ProductionTask[];
}): ProductionProjectAggregate {
  return {
    projectId: "project-1",
    workflowProfile: {
      steps: [
        { key: "story-lock", name: "스토리 확정" },
        { key: "color", name: "채색" },
        { key: "lettering", name: "식자" },
      ],
    },
    ...partial,
  } as unknown as ProductionProjectAggregate;
}

/** 지난 회차 한 화: 스토리(레거시 키) 4h · 채색 16h · 식자 8h 실측. */
function pastEpisode(episodeId: string, completedDayMs: number): ProductionTask[] {
  const start = completedDayMs - 40 * HOUR;
  return [
    task({
      episodeId, processKey: "story", title: `${episodeId} 스토리`, status: "done",
      startedAt: iso(start), completedAt: iso(start + 4 * HOUR),
    }),
    task({
      episodeId, processKey: "color", title: `${episodeId} 채색`, status: "done",
      startedAt: iso(start + 4 * HOUR), completedAt: iso(start + 20 * HOUR),
    }),
    task({
      episodeId, processKey: "lettering", title: `${episodeId} 식자`, status: "approved",
      startedAt: iso(start + 20 * HOUR), completedAt: iso(start + 28 * HOUR),
    }),
  ];
}

function targetTasks(releaseAt: string): ProductionTask[] {
  return [
    task({ episodeId: "ep-5", processKey: "story-lock", title: "5화 스토리 확정", status: "ready", dueAt: releaseAt }),
    task({ episodeId: "ep-5", processKey: "color", title: "5화 채색", status: "ready", dueAt: releaseAt }),
    task({
      episodeId: "ep-5", processKey: "lettering", title: "5화 식자", status: "ready", dueAt: releaseAt,
      estimateHours: { optimistic: 4, likely: 8, pessimistic: 12 },
    }),
  ];
}

describe("ProductionDeadlineRiskForecast (회차 운영 카드 배선 표면)", () => {
  it("실측이 없으면 구간을 지어내지 않고 근거 부족 상태를 표시한다", () => {
    const now = Date.now();
    const releaseAt = iso(now + 7 * DAY);
    render(
      <ProductionDeadlineRiskForecast
        aggregate={aggregate({
          episodes: [episode("ep-5", { plannedReleaseAt: releaseAt })],
          tasks: targetTasks(releaseAt),
        })}
        episodeId="ep-5"
      />,
    );
    expect(screen.getByTestId("deadline-risk-forecast")).toBeTruthy();
    expect(screen.getByText("근거 부족")).toBeTruthy();
    expect(screen.getByText(/지난 회차 실측이 0건이라/)).toBeTruthy();
    expect(screen.getByText(/확정된 예측이 아니며/)).toBeTruthy();
  });

  it("지난 회차 실측이 쌓이면 여유 구간과 근거 수치를 함께 표시한다", () => {
    const now = Date.now();
    const releaseAt = iso(now + 7 * DAY);
    const past = [1, 2, 3, 4].flatMap((n) =>
      pastEpisode(`ep-${n}`, now - (5 - n) * 7 * DAY));
    render(
      <ProductionDeadlineRiskForecast
        aggregate={aggregate({
          episodes: [episode("ep-5", { plannedReleaseAt: releaseAt })],
          tasks: [...past, ...targetTasks(releaseAt)],
        })}
        episodeId="ep-5"
      />,
    );
    expect(screen.getByText("여유 구간")).toBeTruthy();
    expect(screen.getByText(/지난 4화 실측 12건 기준/)).toBeTruthy();
  });

  it("게시 완료된 회차와 없는 회차에서는 아무것도 그리지 않는다", () => {
    const now = Date.now();
    const releaseAt = iso(now + 7 * DAY);
    const published = render(
      <ProductionDeadlineRiskForecast
        aggregate={aggregate({
          episodes: [episode("ep-5", { state: "published", plannedReleaseAt: releaseAt })],
          tasks: targetTasks(releaseAt),
        })}
        episodeId="ep-5"
      />,
    );
    expect(published.container.firstChild).toBeNull();
    expect(screen.queryByTestId("deadline-risk-forecast")).toBeNull();
  });
});
