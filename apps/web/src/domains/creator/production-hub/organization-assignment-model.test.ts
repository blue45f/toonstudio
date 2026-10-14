import { describe, expect, it } from "vitest";
import type {
  ProductionProjectAggregate,
  ProductionRoleType,
  ProductionTask,
} from "@toonstudio/core/production";

import {
  buildAssignmentUnits,
  buildGenreClusters,
  buildPlanningSensitivitySlots,
  buildWeeklyRebalanceReport,
  deriveProjectProgress,
  isoWeekWindow,
} from "./organization-assignment-model";

// 2026-10-14(수) UTC. 이번 주는 10-12(월)~10-19(월).
const NOW = new Date("2026-10-14T09:00:00.000Z");
const DUE_THIS_WEEK = "2026-10-16T00:00:00.000Z";
const DUE_OVERDUE = "2026-10-10T00:00:00.000Z";

function task(overrides: Partial<ProductionTask> & { id: string }): ProductionTask {
  return {
    projectId: "p1",
    scope: { kind: "project", id: "p1", ancestors: [] },
    processKey: "line-art",
    title: `작업 ${overrides.id}`,
    status: "ready",
    assignmentIds: [],
    reviewerAssignmentIds: [],
    inputRevisionRefs: [],
    outputDeliverableIds: [],
    dependencyTaskIds: [],
    dueAt: DUE_THIS_WEEK,
    estimateHours: { optimistic: 8, likely: 10, pessimistic: 15 },
    completionCriteria: [],
    sourceAgreementMilestoneId: null,
    ...overrides,
  } as ProductionTask;
}

interface ProjectOptions {
  projectId?: string;
  title?: string;
  genreKeys?: readonly string[];
  weeklyHoursByAssignment?: Readonly<Record<string, number>>;
}

function project(tasks: readonly ProductionTask[], options: ProjectOptions = {}): ProductionProjectAggregate {
  const projectId = options.projectId ?? "p1";
  const calendars = Object.entries(options.weeklyHoursByAssignment ?? {}).map(([assignmentId, weeklyHours], index) => ({
    id: `cal-${index}`,
    projectId,
    assignmentId,
    timezone: "Asia/Seoul",
    weeklyHours,
    dailyHours: 8,
    workingWeekdays: [1, 2, 3, 4, 5],
    exceptions: [],
    revision: 1,
    updatedAt: "2026-10-01T00:00:00.000Z",
  }));
  return {
    projectId,
    workId: `w-${projectId}`,
    title: options.title ?? `작품 ${projectId}`,
    parties: [
      { id: "party-kim", accountUserId: "u-kim", legalIdentityRef: null, publicDisplayName: "김선화", internalDisplayName: "김선화", contactPartyId: null, agencyPartyId: null, status: "active" },
      { id: "party-lee", accountUserId: "u-lee", legalIdentityRef: null, publicDisplayName: "이채색", internalDisplayName: "이채색", contactPartyId: null, agencyPartyId: null, status: "active" },
      { id: "party-park", accountUserId: "u-park", legalIdentityRef: null, publicDisplayName: "박선화", internalDisplayName: "박선화", contactPartyId: null, agencyPartyId: null, status: "active" },
    ],
    assignments: [
      { id: "as-kim", projectId, partyId: "party-kim", roleType: "line-artist" as ProductionRoleType, scope: { kind: "project", id: projectId, ancestors: [] }, startsAt: "2026-10-01T00:00:00.000Z", endsAt: null, capabilities: [], agreementRevisionRef: null, publicCreditRole: null, status: "active", lead: true },
      { id: "as-lee", projectId, partyId: "party-lee", roleType: "colorist" as ProductionRoleType, scope: { kind: "project", id: projectId, ancestors: [] }, startsAt: "2026-10-01T00:00:00.000Z", endsAt: null, capabilities: [], agreementRevisionRef: null, publicCreditRole: null, status: "active", lead: false },
      { id: "as-park", projectId, partyId: "party-park", roleType: "line-artist" as ProductionRoleType, scope: { kind: "project", id: projectId, ancestors: [] }, startsAt: "2026-10-01T00:00:00.000Z", endsAt: null, capabilities: [], agreementRevisionRef: null, publicCreditRole: null, status: "active", lead: false },
    ],
    tasks,
    workflowProfile: {
      id: "production-workflow",
      projectId,
      name: "스튜디오 제작",
      scale: "studio",
      revision: 1,
      steps: [
        { key: "line-art", name: "선화", description: "", defaultRole: "line-artist" as ProductionRoleType, estimateHours: 16, dependsOn: [], wipLimit: 6, reviewRequired: false, completionCriteria: [] },
        { key: "color", name: "채색", description: "", defaultRole: "colorist" as ProductionRoleType, estimateHours: 12, dependsOn: ["line-art"], wipLimit: 6, reviewRequired: false, completionCriteria: [] },
      ],
      updatedAt: "2026-10-01T00:00:00.000Z",
    },
    projectBriefs: options.genreKeys
      ? [{
          id: `brief-${projectId}`, projectId, revision: 1, status: "approved", title: "기획서", logline: "", synopsis: "",
          themes: [], genreKeys: options.genreKeys, audience: [], platformProfileRefs: [], businessGoals: [], constraints: [],
          rightsBaselineRef: null, approvedByAssignmentIds: [], createdAt: "2026-10-01T00:00:00.000Z",
        }]
      : [],
    resourceCalendars: calendars,
  } as unknown as ProductionProjectAggregate;
}

describe("isoWeekWindow", () => {
  it("수요일이 속한 주의 월요일~다음 월요일을 돌려준다", () => {
    const { start, end } = isoWeekWindow(NOW);
    expect(start.toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-19T00:00:00.000Z");
  });
});

describe("buildAssignmentUnits", () => {
  it("배정을 누가·무엇을·언제까지·몇 시간 단위로 편다", () => {
    const units = buildAssignmentUnits([project([task({ id: "t1", assignmentIds: ["as-kim"] })])], NOW);
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({
      assigneeName: "김선화",
      taskTitle: "작업 t1",
      dueAt: DUE_THIS_WEEK,
      remainingHours: 10,
      roleType: "line-artist",
      requiredRole: "line-artist",
      roleMismatch: false,
    });
  });

  it("다인 배정은 시간을 균등 분할하고, 닫힌 작업은 제외한다", () => {
    const units = buildAssignmentUnits([project([
      task({ id: "t1", assignmentIds: ["as-kim", "as-park"], estimateHours: { optimistic: 16, likely: 20, pessimistic: 30 } }),
      task({ id: "t2", assignmentIds: ["as-kim"], status: "done" }),
    ])], NOW);
    expect(units).toHaveLength(2);
    expect(units.map((unit) => unit.remainingHours)).toEqual([10, 10]);
  });

  it("견적이 없는 작업은 0시간으로 만들지 않고 estimateKnown=false로 둔다", () => {
    const units = buildAssignmentUnits([project([
      task({ id: "t1", assignmentIds: ["as-kim"], estimateHours: null }),
    ])], NOW);
    expect(units[0].remainingHours).toBeNull();
    expect(units[0].estimateKnown).toBe(false);
  });

  it("미배정 작업은 담당자 없는 단위로 남기고, 요구 역할과 다르면 미스매치로 표시한다", () => {
    const units = buildAssignmentUnits([project([
      task({ id: "t1" }),
      task({ id: "t2", processKey: "color", assignmentIds: ["as-kim"] }),
    ])], NOW);
    expect(units[0].assigneePartyId).toBeNull();
    expect(units[1].roleMismatch).toBe(true);
    expect(units[1].requiredRole).toBe("colorist");
  });
});

describe("buildWeeklyRebalanceReport", () => {
  it("달력 용량을 넘긴 담당자를 과배정으로 탐지하고 이동을 제안한다", () => {
    const aggregate = project([
      task({ id: "t1", assignmentIds: ["as-kim"], estimateHours: { optimistic: 16, likely: 20, pessimistic: 30 } }),
      task({ id: "t2", assignmentIds: ["as-kim"], estimateHours: { optimistic: 12, likely: 15, pessimistic: 22 } }),
    ], { weeklyHoursByAssignment: { "as-kim": 20, "as-park": 40 } });
    const report = buildWeeklyRebalanceReport([aggregate], NOW);
    const kim = report.personLoads.find((person) => person.partyId === "party-kim");
    expect(kim).toMatchObject({ loadHours: 35, capacityHours: 20, capacitySource: "calendar", state: "over" });
    expect(report.overAllocated.map((person) => person.partyId)).toEqual(["party-kim"]);
    // 박선화(같은 선화 역할, 용량 40h)에게 가장 큰 작업 이동 제안
    expect(report.suggestions).toHaveLength(1);
    expect(report.suggestions[0]).toMatchObject({ taskId: "t1", fromName: "김선화", toName: "박선화", reason: "over-allocation", hours: 20 });
  });

  it("달력이 없으면 기본 용량을 쓰되 출처를 default로 구분한다", () => {
    const report = buildWeeklyRebalanceReport([project([task({ id: "t1", assignmentIds: ["as-kim"] })])], NOW);
    expect(report.personLoads[0]).toMatchObject({ capacityHours: 40, capacitySource: "default", state: "ok" });
  });

  it("역할 미스매치 단위는 요구 역할을 가진 담당자에게 이동을 제안한다", () => {
    const aggregate = project([
      task({ id: "t1", processKey: "color", assignmentIds: ["as-kim"] }),
    ]);
    const report = buildWeeklyRebalanceReport([aggregate], NOW);
    expect(report.mismatches).toHaveLength(1);
    expect(report.suggestions[0]).toMatchObject({ taskId: "t1", toName: "이채색", reason: "role-mismatch" });
  });

  it("진행 중 작업은 재배분 후보에서 제외하고, 지연 작업은 주간 범위에 포함한다", () => {
    const aggregate = project([
      task({ id: "t1", assignmentIds: ["as-kim"], status: "in-progress", dueAt: DUE_OVERDUE, estimateHours: { optimistic: 40, likely: 50, pessimistic: 60 } }),
      task({ id: "t2", assignmentIds: ["as-kim"], dueAt: "2026-12-01T00:00:00.000Z" }),
    ]);
    const report = buildWeeklyRebalanceReport([aggregate], NOW);
    expect(report.units.map((unit) => unit.taskId)).toEqual(["t1"]);
    expect(report.units[0].overdue).toBe(true);
    expect(report.suggestions).toHaveLength(0);
  });
});

describe("deriveProjectProgress", () => {
  it("진척을 완료 견적 시간 비중으로 도출하고, 견적이 없으면 null로 둔다", () => {
    const withEstimates = project([
      task({ id: "t1", status: "done", estimateHours: { optimistic: 16, likely: 20, pessimistic: 30 } }),
      task({ id: "t2", status: "ready", assignmentIds: ["as-kim"], estimateHours: { optimistic: 24, likely: 30, pessimistic: 45 } }),
    ]);
    const without = project([], { projectId: "p2" });
    const progress = deriveProjectProgress([withEstimates, without], NOW);
    expect(progress[0].progressPercent).toBe(40);
    expect(progress[0].openUnitCount).toBe(1);
    expect(progress[1].progressPercent).toBeNull();
  });
});

describe("buildGenreClusters", () => {
  it("같은 장르 작품을 클러스터로 묶고, 기획서가 없으면 미분류로 둔다", () => {
    const clusters = buildGenreClusters([
      project([task({ id: "t1", assignmentIds: ["as-kim"] })], { projectId: "p1", genreKeys: ["romance", "fantasy"] }),
      project([task({ id: "t2", assignmentIds: ["as-lee"], processKey: "color" })], { projectId: "p2", genreKeys: ["romance"] }),
      project([], { projectId: "p3" }),
    ], NOW);
    const romance = clusters.find((cluster) => cluster.genreKey === "romance");
    expect(romance).toMatchObject({ projectCount: 2, openUnitCount: 2, remainingHours: 20 });
    expect(clusters.find((cluster) => cluster.genreKey === "uncategorized")?.projectCount).toBe(1);
  });
});

describe("buildPlanningSensitivitySlots", () => {
  it("측정 입력이 없으면 not-instrumented로 두고 수치를 만들지 않는다", () => {
    const slots = buildPlanningSensitivitySlots([project([])], []);
    expect(slots[0]).toMatchObject({ status: "not-instrumented", pilotReactionScore: null, planningLeadTimeDays: null });
  });

  it("측정 입력이 있으면 measured로 값을 채운다", () => {
    const slots = buildPlanningSensitivitySlots([project([])], [{
      projectId: "p1", pilotReactionScore: 82, pilotResponseCount: 412, planningLeadTimeDays: 21, measuredAt: "2026-10-12T00:00:00.000Z",
    }]);
    expect(slots[0]).toMatchObject({ status: "measured", pilotReactionScore: 82, planningLeadTimeDays: 21 });
  });
});
