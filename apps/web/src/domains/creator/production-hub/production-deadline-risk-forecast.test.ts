import { describe, expect, it } from "vitest";

import {
  episodeScope,
  type EpisodeCollaboration,
  type ProductionProjectAggregate,
  type ProductionTask,
} from "@toonstudio/core/production";

import {
  buildDeadlineRiskForecast,
  DEADLINE_RISK_BAND_LABELS,
  DEADLINE_RISK_FORECAST_NOTE,
} from "./production-deadline-risk-forecast";

const NOW = new Date("2026-10-14T09:00:00.000Z");
const HOUR = 3_600_000;

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

function fourPastEpisodes(): ProductionTask[] {
  return [1, 2, 3, 4].flatMap((n) =>
    pastEpisode(`ep-${n}`, Date.parse("2026-09-10T09:00:00.000Z") + n * 7 * 24 * HOUR));
}

function targetTasks(releaseAt: string, colorPartial: Partial<ProductionTask> = {}): ProductionTask[] {
  return [
    task({ episodeId: "ep-5", processKey: "story-lock", title: "5화 스토리 확정", status: "ready", dueAt: releaseAt }),
    task({ episodeId: "ep-5", processKey: "color", title: "5화 채색", status: "ready", dueAt: releaseAt, ...colorPartial }),
    task({
      episodeId: "ep-5", processKey: "lettering", title: "5화 식자", status: "ready", dueAt: releaseAt,
      estimateHours: { optimistic: 4, likely: 8, pessimistic: 12 },
    }),
  ];
}

const FORBIDDEN_PHRASES = ["확률", "반드시", "늦습니다", "지연됩니다", "미완성", "실패합니다", "늦어집니다"];

describe("마감 위험 예보 (T-1)", () => {
  it("지난 4화 실측과 비교해 여유 구간과 근거 수치를 함께 낸다", () => {
    const releaseAt = iso(NOW.getTime() + 7 * 24 * HOUR);
    const result = buildDeadlineRiskForecast(aggregate({
      episodes: [episode("ep-5", { plannedReleaseAt: releaseAt })],
      tasks: [...fourPastEpisodes(), ...targetTasks(releaseAt)],
    }), "ep-5", NOW);
    expect(result).not.toBeNull();
    expect(result!.band).toBe("comfortable");
    expect(result!.history.episodeCount).toBe(4);
    expect(result!.history.sampleTaskCount).toBe(12);
    // 공정별 평균 합: 스토리 4 + 채색 16 + 식자 8 = 28
    expect(result!.history.meanEpisodeTotalHours).toBe(28);
    // 레거시 키(story) 실측이 정규 키(story-lock) 남은 공정을 덮는다
    expect(result!.current.historyCoveredRemainingTasks).toBe(3);
    expect(result!.current.projectedRemainingHours).toBe(28);
    expect(result!.current.availableHours).toBe(56);
    expect(result!.current.loadRatio).toBe(0.5);
    const joined = result!.evidence.join(" ");
    expect(joined).toContain("지난 4화 실측 12건");
    expect(joined).toContain("28시간");
    expect(joined).toContain("가용 대비 약 50%");
  });

  it("환산 소요가 가용을 넘으면 위험 구간으로 표시하고 수치를 남긴다", () => {
    const releaseAt = iso(NOW.getTime() + 1 * 24 * HOUR);
    const result = buildDeadlineRiskForecast(aggregate({
      episodes: [episode("ep-5", { plannedReleaseAt: releaseAt })],
      tasks: [...fourPastEpisodes(), ...targetTasks(releaseAt)],
    }), "ep-5", NOW);
    expect(result!.band).toBe("risk");
    expect(result!.current.loadRatio).toBeGreaterThan(1);
    expect(result!.evidence.join(" ")).toContain("가용 대비");
  });

  it("진행 중 공정이 지난 평균을 넘기면 주의 구간과 해당 수치를 표시한다", () => {
    const releaseAt = iso(NOW.getTime() + 7 * 24 * HOUR);
    const startedAt = iso(NOW.getTime() - 20 * HOUR);
    const result = buildDeadlineRiskForecast(aggregate({
      episodes: [episode("ep-5", { plannedReleaseAt: releaseAt })],
      tasks: [
        ...fourPastEpisodes(),
        ...targetTasks(releaseAt, { status: "in-progress", startedAt, title: "5화 채색" }),
      ],
    }), "ep-5", NOW);
    expect(result!.band).toBe("caution");
    expect(result!.current.overruns).toHaveLength(1);
    expect(result!.current.overruns[0]).toMatchObject({ elapsedHours: 20, meanHours: 16 });
    expect(result!.evidence.join(" ")).toContain("지난 평균 약 16시간");
  });

  it("지난 회차 실측이 없으면 구간을 지어내지 않고 근거 부족으로 표시한다", () => {
    const releaseAt = iso(NOW.getTime() + 7 * 24 * HOUR);
    const result = buildDeadlineRiskForecast(aggregate({
      episodes: [episode("ep-5", { plannedReleaseAt: releaseAt })],
      tasks: targetTasks(releaseAt),
    }), "ep-5", NOW);
    expect(result!.band).toBe("insufficient-data");
    expect(result!.history.episodeCount).toBe(0);
    expect(result!.evidence.join(" ")).toContain("실측이 0건");
  });

  it("최근 4화만 근거로 쓰고, 시각 없는 완료 작업은 제외 건수로 드러낸다", () => {
    const tasks: ProductionTask[] = [];
    // 오래된 2화는 채색 100시간짜리 — 최근 4화 평균(10시간)을 오염시키면 안 된다
    for (const [index, hours] of [[1, 100], [2, 100], [3, 10], [4, 10], [5, 10], [6, 10]] as const) {
      const completed = Date.parse("2026-08-01T09:00:00.000Z") + index * 7 * 24 * HOUR;
      tasks.push(task({
        episodeId: `old-${index}`, processKey: "color", status: "done",
        startedAt: iso(completed - hours * HOUR), completedAt: iso(completed),
      }));
    }
    tasks.push(task({ episodeId: "old-6", processKey: "lettering", status: "done" }));
    const releaseAt = iso(NOW.getTime() + 7 * 24 * HOUR);
    tasks.push(task({ episodeId: "ep-9", processKey: "color", status: "ready", dueAt: releaseAt }));
    const result = buildDeadlineRiskForecast(aggregate({
      episodes: [episode("ep-9", { plannedReleaseAt: releaseAt })],
      tasks,
    }), "ep-9", NOW);
    expect(result!.history.episodeCount).toBe(4);
    expect(result!.history.sampleTaskCount).toBe(4);
    expect(result!.history.perProcess[0]).toMatchObject({ processKey: "color", meanHours: 10 });
    expect(result!.history.unmeasuredTaskCount).toBe(1);
    expect(result!.evidence.join(" ")).toContain("실측에서 제외된 지난 회차 작업이 1건");
  });

  it("게시된 회차와 없는 회차는 예보 대상이 아니다", () => {
    const agg = aggregate({
      episodes: [episode("ep-5", { state: "published" })],
      tasks: [],
    });
    expect(buildDeadlineRiskForecast(agg, "ep-5", NOW)).toBeNull();
    expect(buildDeadlineRiskForecast(agg, "ep-404", NOW)).toBeNull();
  });

  it("모든 표시 문구에 단정적 예측 표현이 없다", () => {
    const releaseSoon = iso(NOW.getTime() + 1 * 24 * HOUR);
    const releaseFar = iso(NOW.getTime() + 7 * 24 * HOUR);
    const forecasts = [
      buildDeadlineRiskForecast(aggregate({
        episodes: [episode("ep-5", { plannedReleaseAt: releaseFar })],
        tasks: [...fourPastEpisodes(), ...targetTasks(releaseFar)],
      }), "ep-5", NOW),
      buildDeadlineRiskForecast(aggregate({
        episodes: [episode("ep-5", { plannedReleaseAt: releaseSoon })],
        tasks: [...fourPastEpisodes(), ...targetTasks(releaseSoon)],
      }), "ep-5", NOW),
      buildDeadlineRiskForecast(aggregate({
        episodes: [episode("ep-5", { plannedReleaseAt: releaseFar })],
        tasks: targetTasks(releaseFar),
      }), "ep-5", NOW),
    ];
    const copy = [
      ...Object.values(DEADLINE_RISK_BAND_LABELS),
      DEADLINE_RISK_FORECAST_NOTE,
      ...forecasts.flatMap((forecast) => forecast?.evidence ?? []),
    ].join(" ");
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(copy).not.toContain(phrase);
    }
  });
});
