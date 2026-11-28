import { describe, expect, it } from "vitest";
import {
  computeEpisodeCpmSchedule,
  computeScheduleManifestSha256Hex,
  escapeScheduleXml,
  rebalanceAssistantWorkload,
  renderEpisodeScheduleGanttSvg,
  sha256Utf8Hex,
  summarizeEpisodeScheduleAuditKo,
  type EpisodeScheduleInput,
  type EpisodeTaskItem,
  type ProductionStageId,
  type StudioTeamMember,
} from "./index";

function mkMember(
  memberId: string,
  nameKo: string,
  eligibleStages: readonly ProductionStageId[],
  speedMultiplier = 1.0,
  availableDays = 5,
  maxHealthyHoursPerDay?: number,
): StudioTeamMember {
  return maxHealthyHoursPerDay === undefined
    ? { memberId, nameKo, eligibleStages, speedMultiplier, availableDays }
    : { memberId, nameKo, eligibleStages, speedMultiplier, availableDays, maxHealthyHoursPerDay };
}

function mkTask(
  taskId: string,
  stage: ProductionStageId,
  cutRangeLabel: string,
  estimatedBaseHours: number,
  dependsOnTaskIds: readonly string[],
  assignedMemberId: string,
  lockedAssignment?: boolean,
): EpisodeTaskItem {
  return lockedAssignment === undefined
    ? { taskId, stage, cutRangeLabel, estimatedBaseHours, dependsOnTaskIds, assignedMemberId }
    : { taskId, stage, cutRangeLabel, estimatedBaseHours, dependsOnTaskIds, assignedMemberId, lockedAssignment };
}

const FULL_TEAM: readonly StudioTeamMember[] = [
  mkMember("m-pd", "김PD", ["story-conti", "lettering-final-qa"], 1.0, 5, 8.0),
  mkMember("m-bg3d", "박배경", ["bg3d-layout"], 1.0, 5, 8.0),
  mkMember("m-line", "이선화", ["lineart-ink"], 1.0, 5, 8.0),
  mkMember("m-color-a", "최밑색A", ["flat-color", "shading-vfx"], 1.0, 3, 8.0),
  mkMember("m-color-b", "정밑색B", ["flat-color", "shading-vfx"], 1.0, 3, 8.0),
];

function makeParallelFivePhaseInput(deadlineBudgetHr = 72): EpisodeScheduleInput {
  return {
    episodeId: "ep-042",
    episodeTitleKo: "42화 · 폭우 속의 대치",
    deadlineBudgetHr,
    teamMembers: FULL_TEAM,
    tasks: [
      mkTask("t-conti", "story-conti", "전체 1~70컷 콘티", 8, [], "m-pd", true),
      mkTask("t-bg3d", "bg3d-layout", "실내·거리 3D 배치", 12, ["t-conti"], "m-bg3d"),
      mkTask("t-line", "lineart-ink", "인물 1~70컷 선화", 16, ["t-conti"], "m-line"),
      mkTask("t-flat", "flat-color", "전체 밑색", 10, ["t-bg3d", "t-line"], "m-color-a"),
      mkTask("t-shade", "shading-vfx", "명암·광원 이펙트", 14, ["t-flat"], "m-color-b"),
      mkTask("t-qa", "lettering-final-qa", "식자·최종 검수", 6, ["t-shade"], "m-pd", true),
    ],
  };
}

function makeSkewedAssistantInput(deadlineBudgetHr = 38): EpisodeScheduleInput {
  return {
    episodeId: "ep-skew-01",
    episodeTitleKo: "43화 · 편중 배정 위기",
    deadlineBudgetHr,
    teamMembers: [
      mkMember("pd", "강작가", ["story-conti", "lettering-final-qa"], 1.0, 3, 8.0),
      mkMember("assist-a", "어시A", ["flat-color", "shading-vfx"], 1.0, 3, 8.0), // 24h 한계
      mkMember("assist-b", "어시B", ["flat-color", "shading-vfx"], 1.0, 3, 8.0), // 24h 한계
    ],
    tasks: [
      mkTask("t1-conti", "story-conti", "1~65컷 콘티", 4, [], "pd", true),
      mkTask("t2-color-1", "flat-color", "1~15컷 채색", 12, ["t1-conti"], "assist-a"),
      mkTask("t3-color-2", "flat-color", "16~30컷 채색", 12, ["t1-conti"], "assist-a"),
      mkTask("t4-color-3", "flat-color", "31~45컷 채색", 12, ["t1-conti"], "assist-a"),
      mkTask("t5-color-4", "flat-color", "46~65컷 채색", 6, ["t1-conti"], "assist-b"),
      mkTask(
        "t6-qa",
        "lettering-final-qa",
        "식자·최종 QA",
        4,
        ["t2-color-1", "t3-color-2", "t4-color-3", "t5-color-4"],
        "pd",
        true,
      ),
    ],
  };
}

describe("Wave 134 — 웹툰 5단계 공정 CPM 마감 분석기", () => {
  it("5단계 병렬 DAG의 ES/EF/LS/LF/TotalFloat/CriticalPath를 정확히 계산한다", () => {
    const result = computeEpisodeCpmSchedule(makeParallelFivePhaseInput(72));
    expect(result.ok).toBe(true);
    expect(result.cycleDetected).toBe(false);
    expect(result.projectMakespanHr).toBe(54);
    expect(result.unconstrainedDagMakespanHr).toBe(54);
    expect(result.deadlineMarginHr).toBe(18);
    expect(result.deadlineStatus).toBe("on-track");

    const byId = new Map(result.scheduledTasks.map((t) => [t.taskId, t]));
    expect(byId.get("t-conti")).toMatchObject({ stagePhaseNumber: 1, earliestStartHr: 0, earliestFinishHr: 8, latestStartHr: 0, latestFinishHr: 8, totalFloatHr: 0, isCriticalPath: true });
    expect(byId.get("t-bg3d")).toMatchObject({ stagePhaseNumber: 2, earliestStartHr: 8, earliestFinishHr: 20, latestStartHr: 12, latestFinishHr: 24, totalFloatHr: 4, freeFloatHr: 4, isCriticalPath: false });
    expect(byId.get("t-line")).toMatchObject({ stagePhaseNumber: 2, earliestStartHr: 8, earliestFinishHr: 24, totalFloatHr: 0, isCriticalPath: true });
    expect(byId.get("t-flat")).toMatchObject({ stagePhaseNumber: 3, earliestStartHr: 24, earliestFinishHr: 34, totalFloatHr: 0, isCriticalPath: true });
    expect(byId.get("t-shade")).toMatchObject({ stagePhaseNumber: 4, earliestStartHr: 34, earliestFinishHr: 48, totalFloatHr: 0, isCriticalPath: true });
    expect(byId.get("t-qa")).toMatchObject({ stagePhaseNumber: 5, earliestStartHr: 48, earliestFinishHr: 54, totalFloatHr: 0, isCriticalPath: true });
    expect(result.criticalPathTaskIds).toEqual(["t-conti", "t-line", "t-flat", "t-shade", "t-qa"]);
  });

  it("speedMultiplier(0.8~1.5)에 따라 실효 소요시간과 CPM을 정확히 반영한다", () => {
    const result = computeEpisodeCpmSchedule({
      episodeId: "ep-speed",
      deadlineBudgetHr: 30,
      teamMembers: [
        mkMember("m1", "빠른선화", ["lineart-ink"], 1.25, 5),
        mkMember("m2", "신입배경", ["bg3d-layout"], 0.8, 5),
      ],
      tasks: [
        mkTask("line", "lineart-ink", "선화", 10, [], "m1"),
        mkTask("bg", "bg3d-layout", "배경", 10, [], "m2"),
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.projectMakespanHr).toBe(12.5);
    const byId = new Map(result.scheduledTasks.map((t) => [t.taskId, t]));
    expect(byId.get("line")?.effectiveDurationHr).toBe(8);
    expect(byId.get("line")?.totalFloatHr).toBe(4.5);
    expect(byId.get("bg")?.effectiveDurationHr).toBe(12.5);
    expect(byId.get("bg")?.isCriticalPath).toBe(true);
  });

  it("동률인 병렬 임계 경로가 둘 이상일 때 모두 criticalPath로 표시한다", () => {
    const base = makeParallelFivePhaseInput(72);
    const tiedTasks = base.tasks.map((t) =>
      t.taskId === "t-bg3d" ? { ...t, estimatedBaseHours: 16 } : t,
    );
    const result = computeEpisodeCpmSchedule({ ...base, tasks: tiedTasks });
    expect(result.ok).toBe(true);
    expect(result.criticalPathTaskIds).toContain("t-bg3d");
    expect(result.criticalPathTaskIds).toContain("t-line");
    for (const task of result.scheduledTasks) {
      expect(task.totalFloatHr).toBeLessThanOrEqual(1e-6);
      expect(task.isCriticalPath).toBe(true);
    }
  });

  it("동일 어시스턴트 중복 배정 시 순차 자원 제약을 반영해 Makespan을 정확히 산출한다", () => {
    const skewed = computeEpisodeCpmSchedule(makeSkewedAssistantInput(40));
    expect(skewed.ok).toBe(true);
    expect(skewed.projectMakespanHr).toBe(44);
    expect(skewed.unconstrainedDagMakespanHr).toBe(20);
    expect(skewed.projectMakespanHr).toBeGreaterThan(skewed.unconstrainedDagMakespanHr);
    expect(skewed.projectMakespanHr).toBe(
      Math.max(...skewed.scheduledTasks.map((t) => t.earliestFinishHr)),
    );
  });

  it("모든 작업에서 CPM 수학 불변식(EF=ES+d, LS=LF-d, Float>=0, 선후행 순서)이 성립한다", () => {
    const result = computeEpisodeCpmSchedule(makeSkewedAssistantInput(50));
    expect(result.ok).toBe(true);
    const byId = new Map(result.scheduledTasks.map((t) => [t.taskId, t]));
    for (const task of result.scheduledTasks) {
      expect(task.earliestFinishHr).toBeCloseTo(task.earliestStartHr + task.effectiveDurationHr, 6);
      expect(task.latestStartHr).toBeCloseTo(task.latestFinishHr - task.effectiveDurationHr, 6);
      expect(task.totalFloatHr).toBeGreaterThanOrEqual(0);
      expect(task.isCriticalPath).toBe(task.totalFloatHr <= 1e-6);
      for (const depId of task.dependsOnTaskIds) {
        expect(task.earliestStartHr).toBeGreaterThanOrEqual(
          (byId.get(depId)?.earliestFinishHr ?? 0) - 1e-6,
        );
      }
    }
  });

  it("입력 작업 배열 순서가 섞여도 동일한 CPM 결과를 결정론적으로 반환한다", () => {
    const input = makeParallelFivePhaseInput(72);
    const r1 = computeEpisodeCpmSchedule(input);
    const r2 = computeEpisodeCpmSchedule({ ...input, tasks: [...input.tasks].reverse() });
    expect(r1.projectMakespanHr).toBe(r2.projectMakespanHr);
    expect(r1.topologicalOrderTaskIds).toEqual(r2.topologicalOrderTaskIds);
    expect(r1.criticalPathTaskIds).toEqual(r2.criticalPathTaskIds);
  });
});

describe("Wave 134 — Fail-Closed 검증 (순환 의존성·누락 참조·자격 외 배정)", () => {
  it("2노드 직접 순환 의존성(A <-> B)을 fail-closed로 즉시 차단한다", () => {
    const result = computeEpisodeCpmSchedule({
      episodeId: "ep-cycle-2",
      deadlineBudgetHr: 48,
      teamMembers: FULL_TEAM,
      tasks: [
        mkTask("a", "story-conti", "A", 4, ["b"], "m-pd"),
        mkTask("b", "lineart-ink", "B", 6, ["a"], "m-line"),
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.cycleDetected).toBe(true);
    expect(result.cycleTaskIds).toEqual(["a", "b"]);
    expect(result.validationErrors.some((e) => e.code === "CYCLE_DETECTED")).toBe(true);
  });

  it("3노드 다단계 순환 의존성(n1 -> n2 -> n3 -> n1)을 정확히 검출한다", () => {
    const result = computeEpisodeCpmSchedule({
      episodeId: "ep-cycle-3",
      deadlineBudgetHr: 48,
      teamMembers: FULL_TEAM,
      tasks: [
        mkTask("root", "story-conti", "시작", 2, [], "m-pd"),
        mkTask("n1", "bg3d-layout", "1", 3, ["root", "n3"], "m-bg3d"),
        mkTask("n2", "lineart-ink", "2", 3, ["n1"], "m-line"),
        mkTask("n3", "flat-color", "3", 3, ["n2"], "m-color-a"),
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.cycleDetected).toBe(true);
    expect(result.cycleTaskIds).toEqual(["n1", "n2", "n3"]);
  });

  it("자기 참조 순환(A -> A)을 fail-closed로 차단한다", () => {
    const result = computeEpisodeCpmSchedule({
      episodeId: "ep-self-cycle",
      deadlineBudgetHr: 48,
      teamMembers: FULL_TEAM,
      tasks: [mkTask("self-task", "story-conti", "자기참조", 5, ["self-task"], "m-pd")],
    });
    expect(result.ok).toBe(false);
    expect(result.cycleDetected).toBe(true);
    expect(result.cycleTaskIds).toEqual(["self-task"]);
  });

  it("존재하지 않는 선행 의존 작업 참조를 MISSING_DEPENDENCY로 차단한다", () => {
    const result = computeEpisodeCpmSchedule({
      episodeId: "ep-missing-dep",
      deadlineBudgetHr: 48,
      teamMembers: FULL_TEAM,
      tasks: [mkTask("t1", "lineart-ink", "선화", 6, ["ghost-task-999"], "m-line")],
    });
    expect(result.ok).toBe(false);
    expect(result.validationErrors.some((e) => e.code === "MISSING_DEPENDENCY")).toBe(true);
  });

  it("존재하지 않는 팀원 ID 배정을 UNKNOWN_MEMBER로 차단한다", () => {
    const result = computeEpisodeCpmSchedule({
      episodeId: "ep-unknown-member",
      deadlineBudgetHr: 48,
      teamMembers: FULL_TEAM,
      tasks: [mkTask("t1", "story-conti", "콘티", 4, [], "ghost-member")],
    });
    expect(result.ok).toBe(false);
    expect(result.validationErrors.some((e) => e.code === "UNKNOWN_MEMBER")).toBe(true);
  });

  it("eligibleStages에 없는 공정 배정을 INELIGIBLE_STAGE_ASSIGNMENT로 차단한다", () => {
    const result = computeEpisodeCpmSchedule({
      episodeId: "ep-ineligible",
      deadlineBudgetHr: 48,
      teamMembers: FULL_TEAM,
      tasks: [mkTask("t1", "lettering-final-qa", "식자", 4, [], "m-bg3d")],
    });
    expect(result.ok).toBe(false);
    expect(result.validationErrors.some((e) => e.code === "INELIGIBLE_STAGE_ASSIGNMENT")).toBe(
      true,
    );
  });

  it("중복 taskId 및 중복 memberId를 fail-closed로 차단한다", () => {
    const base = makeParallelFivePhaseInput(72);
    const firstTask = base.tasks[0];
    const firstMember = base.teamMembers[0];
    expect(firstTask).toBeDefined();
    expect(firstMember).toBeDefined();
    if (!firstTask || !firstMember) return;

    const dupTask = computeEpisodeCpmSchedule({ ...base, tasks: [...base.tasks, firstTask] });
    expect(dupTask.ok).toBe(false);
    expect(dupTask.validationErrors.some((e) => e.code === "DUPLICATE_TASK_ID")).toBe(true);

    const dupMember = computeEpisodeCpmSchedule({
      ...base,
      teamMembers: [...base.teamMembers, firstMember],
    });
    expect(dupMember.ok).toBe(false);
    expect(dupMember.validationErrors.some((e) => e.code === "DUPLICATE_MEMBER_ID")).toBe(true);
  });
});

describe("Wave 134 — 3단계 마감 판정·번아웃 과부하 경보·최종 24h 크런치 탐지", () => {
  it("여유가 정확히 12시간 이상이면 on-track으로 판정한다", () => {
    const exact12 = computeEpisodeCpmSchedule(makeParallelFivePhaseInput(66));
    expect(exact12.deadlineStatus).toBe("on-track");
    expect(exact12.deadlineMarginHr).toBe(12);
  });

  it("여유가 0시간 이상 12시간 미만이면 tight-buffer로 판정한다", () => {
    const marginZero = computeEpisodeCpmSchedule(makeParallelFivePhaseInput(54));
    expect(marginZero.deadlineStatus).toBe("tight-buffer");
    expect(marginZero.deadlineMarginHr).toBe(0);

    const marginAlmost12 = computeEpisodeCpmSchedule(makeParallelFivePhaseInput(65.5));
    expect(marginAlmost12.deadlineStatus).toBe("tight-buffer");
    expect(marginAlmost12.deadlineMarginHr).toBe(11.5);
  });

  it("Makespan이 마감 예산을 초과하면 late-risk-red로 판정한다", () => {
    const late = computeEpisodeCpmSchedule(makeParallelFivePhaseInput(53.5));
    expect(late.deadlineStatus).toBe("late-risk-red");
    expect(late.deadlineMarginHr).toBe(-0.5);
  });

  it("팀원 누적 작업량이 건강 예산(기본 일 8h × 가용일)을 초과하면 burnoutOverloadAlerts를 발행한다", () => {
    const severe = computeEpisodeCpmSchedule(makeSkewedAssistantInput(50));
    expect(severe.burnoutOverloadAlerts).toHaveLength(1);
    expect(severe.burnoutOverloadAlerts[0]).toMatchObject({ memberId: "assist-a", healthyBudgetHr: 24, overloadHours: 12, severity: "critical" });

    // maxHealthyHoursPerDay 미지정 시 기본 8.0 적용 (2일=16h, 18h 할당 -> +2h, 112.5% -> caution)
    const mild = computeEpisodeCpmSchedule({
      episodeId: "ep-default-healthy",
      deadlineBudgetHr: 48,
      teamMembers: [mkMember("m1", "기본건강", ["lineart-ink"], 1.0, 2)],
      tasks: [mkTask("t1", "lineart-ink", "전체 선화", 18, [], "m1")],
    });
    expect(mild.burnoutOverloadAlerts).toHaveLength(1);
    expect(mild.burnoutOverloadAlerts[0]).toMatchObject({ healthyBudgetHr: 16, overloadHours: 2, severity: "caution" });
  });

  it("건강 예산 경계값(할당량 === 건강 예산)에서는 과부하 경보를 발행하지 않는다", () => {
    const boundary = computeEpisodeCpmSchedule({
      episodeId: "ep-healthy-exact",
      deadlineBudgetHr: 48,
      teamMembers: [mkMember("m1", "정시퇴근", ["flat-color"], 1.0, 3, 8.0)],
      tasks: [mkTask("t1", "flat-color", "밑색", 24, [], "m1")],
    });
    expect(boundary.burnoutOverloadAlerts).toHaveLength(0);
    expect(boundary.memberWorkloads[0]?.isOverloaded).toBe(false);
  });

  it("마감 전 최종 24시간 구간에 전체 작업의 40% 초과가 집중되면 crunchBottleneckDetected를 켠다", () => {
    const crunch = computeEpisodeCpmSchedule({
      episodeId: "ep-crunch-yes",
      deadlineBudgetHr: 60, // 최종 24h = [36, 60]
      teamMembers: [
        mkMember("p", "콘티", ["story-conti"], 1, 5),
        mkMember("a", "채색1", ["shading-vfx"], 1, 5),
        mkMember("b", "채색2", ["shading-vfx"], 1, 5),
      ],
      tasks: [
        mkTask("t-early", "story-conti", "지연 콘티", 36, [], "p"),
        mkTask("t-late-1", "shading-vfx", "후반 채색1", 18, ["t-early"], "a"),
        mkTask("t-late-2", "shading-vfx", "후반 채색2", 18, ["t-early"], "b"),
      ],
    });
    expect(crunch.ok).toBe(true);
    expect(crunch.crunchWindow.final24hWorkShare).toBeCloseTo(0.5, 4);
    expect(crunch.crunchBottleneckDetected).toBe(true);
  });

  it("마감 전 최종 24시간 집중도가 40% 이하이면 crunchBottleneckDetected가 false다", () => {
    const safe = computeEpisodeCpmSchedule(makeParallelFivePhaseInput(72));
    expect(safe.crunchWindow.workInFinal24hHr).toBe(6);
    expect(safe.crunchWindow.final24hWorkShare).toBeLessThan(0.4);
    expect(safe.crunchBottleneckDetected).toBe(false);
  });
});

describe("Wave 134 — LPT+MCT 어시스턴트 작업량 평준화 옵티마이저", () => {
  it("편중 배정(어시A 36h vs 어시B 6h)을 평준화해 Makespan과 작업량 편차를 엄격히 줄인다", () => {
    const result = rebalanceAssistantWorkload(makeSkewedAssistantInput(48));
    expect(result.ok).toBe(true);
    expect(result.improved).toBe(true);
    expect(result.beforeMakespanHr).toBe(44);
    expect(result.afterMakespanHr).toBe(32);
    expect(result.afterMakespanHr).toBeLessThan(result.beforeMakespanHr);
    expect(result.makespanSavedHr).toBe(12);
    expect(result.beforeLoadSpreadHr).toBe(30);
    expect(result.afterLoadSpreadHr).toBe(16);
    expect(result.afterLoadSpreadHr).toBeLessThan(result.beforeLoadSpreadHr);
    expect(result.beforeOverloadCount).toBe(1);
    expect(result.afterOverloadCount).toBe(0);
    expect(result.reassignments.length).toBeGreaterThan(0);
  });

  it("지각 위험(late-risk-red) 화차가 평준화 후 기한 내(tight-buffer / on-track)로 회복된다", () => {
    const recoveredTight = rebalanceAssistantWorkload(makeSkewedAssistantInput(38));
    expect(recoveredTight.beforeSchedule.deadlineStatus).toBe("late-risk-red");
    expect(recoveredTight.afterSchedule.deadlineStatus).toBe("tight-buffer");
    expect(recoveredTight.deadlineRecovered).toBe(true);

    const base = makeSkewedAssistantInput(48);
    const recoveredOnTrack = rebalanceAssistantWorkload({
      ...base,
      tasks: base.tasks.map((t) =>
        t.taskId === "t2-color-1" ? { ...t, estimatedBaseHours: 20 } : t,
      ),
    });
    expect(recoveredOnTrack.beforeSchedule.deadlineStatus).toBe("late-risk-red");
    expect(recoveredOnTrack.afterSchedule.deadlineStatus).toBe("on-track");
    expect(recoveredOnTrack.deadlineRecovered).toBe(true);
  });

  it("lockedAssignment: true 작업은 과부하 상황에서도 절대 다른 팀원으로 이동하지 않는다", () => {
    const input = makeSkewedAssistantInput(40);
    const lockedTasks = input.tasks.map((t) =>
      t.taskId === "t2-color-1" || t.taskId === "t3-color-2"
        ? { ...t, lockedAssignment: true }
        : t,
    );
    const result = rebalanceAssistantWorkload({ ...input, tasks: lockedTasks });
    expect(result.ok).toBe(true);
    const byId = new Map(result.afterSchedule.scheduledTasks.map((t) => [t.taskId, t]));
    expect(byId.get("t1-conti")?.assignedMemberId).toBe("pd");
    expect(byId.get("t6-qa")?.assignedMemberId).toBe("pd");
    expect(byId.get("t2-color-1")?.assignedMemberId).toBe("assist-a");
    expect(byId.get("t3-color-2")?.assignedMemberId).toBe("assist-a");
    expect(byId.get("t4-color-3")?.assignedMemberId).toBe("assist-b");
    expect(result.afterMakespanHr).toBeLessThan(result.beforeMakespanHr);
  });

  it("eligibleStages에 포함되지 않은 유휴 팀원에게는 작업을 절대 오배정하지 않는다", () => {
    const result = rebalanceAssistantWorkload({
      episodeId: "ep-stage-guard",
      deadlineBudgetHr: 48,
      teamMembers: [
        mkMember("ink-pro", "선화담당", ["lineart-ink", "flat-color"], 1.0, 4),
        mkMember("color-only", "밑색전용", ["flat-color"], 1.5, 5),
      ],
      tasks: [
        mkTask("ink-1", "lineart-ink", "1~35컷 선화", 14, [], "ink-pro"),
        mkTask("ink-2", "lineart-ink", "36~70컷 선화", 14, [], "ink-pro"),
        mkTask("flat-1", "flat-color", "1~70컷 밑색", 12, ["ink-1"], "ink-pro"),
      ],
    });
    expect(result.ok).toBe(true);
    const byId = new Map(result.afterSchedule.scheduledTasks.map((t) => [t.taskId, t]));
    expect(byId.get("ink-1")?.assignedMemberId).toBe("ink-pro");
    expect(byId.get("ink-2")?.assignedMemberId).toBe("ink-pro");
    expect(byId.get("flat-1")?.assignedMemberId).toBe("color-only");
  });

  it("작업자 속도 차이(1.5x vs 0.8x)를 고려해 완료시각(MCT)을 최소화한다", () => {
    const result = rebalanceAssistantWorkload({
      episodeId: "ep-hetero-speed",
      deadlineBudgetHr: 40,
      teamMembers: [
        mkMember("fast", "숙련어시", ["shading-vfx"], 1.5, 5),
        mkMember("junior", "보조어시", ["shading-vfx"], 0.8, 5),
      ],
      tasks: [
        mkTask("s1", "shading-vfx", "A구간", 12, [], "junior"),
        mkTask("s2", "shading-vfx", "B구간", 12, [], "junior"),
        mkTask("s3", "shading-vfx", "C구간", 8, [], "junior"),
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.beforeMakespanHr).toBe(40);
    expect(result.afterMakespanHr).toBeLessThanOrEqual(16.1);
    expect(result.afterMakespanHr).toBeLessThan(result.beforeMakespanHr);
  });

  it("availableDays가 0인 휴가 팀원에게는 비잠금 작업을 새로 배정하지 않는다", () => {
    const result = rebalanceAssistantWorkload({
      episodeId: "ep-vacation",
      deadlineBudgetHr: 48,
      teamMembers: [
        mkMember("active-a", "근무A", ["flat-color"], 1.0, 4),
        mkMember("vacation-b", "휴가B", ["flat-color"], 1.5, 0),
      ],
      tasks: [
        mkTask("c1", "flat-color", "1~30컷", 10, [], "active-a"),
        mkTask("c2", "flat-color", "31~60컷", 10, [], "active-a"),
      ],
    });
    expect(result.ok).toBe(true);
    for (const t of result.afterSchedule.scheduledTasks) {
      expect(t.assignedMemberId).toBe("active-a");
    }
  });

  it("이미 균형 잡힌 일정은 불필요한 재배정을 하지 않고 기존 배정을 유지한다", () => {
    const result = rebalanceAssistantWorkload({
      episodeId: "ep-balanced",
      deadlineBudgetHr: 48,
      teamMembers: [
        mkMember("a", "어시A", ["flat-color"], 1, 4),
        mkMember("b", "어시B", ["flat-color"], 1, 4),
      ],
      tasks: [
        mkTask("c1", "flat-color", "전반", 10, [], "a"),
        mkTask("c2", "flat-color", "후반", 10, [], "b"),
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.improved).toBe(false);
    expect(result.reassignments).toHaveLength(0);
    expect(result.afterMakespanHr).toBe(10);
  });

  it("순환 의존성이 있는 입력을 평준화기에 넘기면 fail-closed로 거부한다", () => {
    const result = rebalanceAssistantWorkload({
      episodeId: "ep-rebalance-cycle",
      deadlineBudgetHr: 48,
      teamMembers: FULL_TEAM,
      tasks: [
        mkTask("x", "flat-color", "X", 6, ["y"], "m-color-a"),
        mkTask("y", "flat-color", "Y", 6, ["x"], "m-color-b"),
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.improved).toBe(false);
    expect(result.rejectionReasons.length).toBeGreaterThan(0);
  });
});

describe("Wave 134 — 순수 ES2017 FIPS 180-4 SHA-256 지문", () => {
  it("NIST FIPS 180-4 표준 테스트 벡터와 정확히 일치한다", () => {
    expect(sha256Utf8Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256Utf8Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(
      sha256Utf8Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
    ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });

  it("한글 UTF-8 및 서로게이트 페어 문자열도 결정론적 64자리 해시를 생성한다", () => {
    const h1 = sha256Utf8Hex("웹툰 42화 마감 🖋️");
    expect(h1).toBe(sha256Utf8Hex("웹툰 42화 마감 🖋️"));
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("computeScheduleManifestSha256Hex는 중첩 객체의 키 순서가 달라도 동일한 지문을 산출한다", () => {
    const m1 = {
      episodeId: "ep-100",
      deadlineBudgetHr: 72,
      meta: { b: 2, a: 1, nested: { z: "끝", k: "시작" } },
      tasks: [{ taskId: "t1", hours: 8, locked: false }],
    };
    const m2 = {
      tasks: [{ locked: false, hours: 8, taskId: "t1" }],
      meta: { nested: { k: "시작", z: "끝" }, a: 1, b: 2 },
      deadlineBudgetHr: 72,
      episodeId: "ep-100",
    };
    expect(computeScheduleManifestSha256Hex(m1)).toBe(computeScheduleManifestSha256Hex(m2));
  });

  it("배정이 변경되면 평준화 전/후 매니페스트 SHA-256 지문이 서로 달라진다", () => {
    const rebalanced = rebalanceAssistantWorkload(makeSkewedAssistantInput(40));
    expect(rebalanced.beforeManifestSha256Hex).toMatch(/^[0-9a-f]{64}$/);
    expect(rebalanced.afterManifestSha256Hex).toMatch(/^[0-9a-f]{64}$/);
    expect(rebalanced.afterManifestSha256Hex).not.toBe(rebalanced.beforeManifestSha256Hex);
  });
});

describe("Wave 134 — 빈 입력·비정상 수치 안전 처리", () => {
  it("빈 작업 목록(tasks: [])을 오류 없이 안전하게 처리한다", () => {
    const empty = computeEpisodeCpmSchedule({
      episodeId: "ep-empty",
      episodeTitleKo: "휴재 공지",
      deadlineBudgetHr: 72,
      tasks: [],
      teamMembers: FULL_TEAM,
    });
    expect(empty.ok).toBe(true);
    expect(empty.projectMakespanHr).toBe(0);
    expect(empty.criticalPathTaskIds).toEqual([]);
    expect(empty.deadlineStatus).toBe("on-track");
    expect(empty.burnoutOverloadAlerts).toEqual([]);
    expect(empty.crunchBottleneckDetected).toBe(false);

    const svg = renderEpisodeScheduleGanttSvg(empty);
    expect(svg).toContain("<svg");
    expect(svg).toContain("등록된 공정 작업이 없습니다");
    expect(svg).not.toMatch(/\b(NaN|Infinity)\b/);
  });

  it("NaN·Infinity·음수·0 속도 계수 입력을 유한 안전 값으로 보정하고 경고를 기록한다", () => {
    const result = computeEpisodeCpmSchedule({
      episodeId: "ep-weird",
      deadlineBudgetHr: Number.NaN,
      teamMembers: [mkMember("m1", "비정상수치", ["flat-color"], 0, -3, Number.POSITIVE_INFINITY)],
      tasks: [mkTask("t1", "flat-color", "음수공수", -10, [], "m1")],
    });
    expect(result.ok).toBe(true);
    expect(result.sanitizationWarnings.length).toBeGreaterThanOrEqual(4);
    expect(Number.isFinite(result.projectMakespanHr)).toBe(true);
    expect(Number.isFinite(result.deadlineBudgetHr)).toBe(true);
    expect(Number.isFinite(result.loadSpreadHr)).toBe(true);
    expect(renderEpisodeScheduleGanttSvg(result)).not.toMatch(/\b(NaN|Infinity)\b/);
  });
});

describe("Wave 134 — 순수 OKLCH 간트 SVG, XSS 이스케이프 및 한국어 PD 브리프", () => {
  it("전/후 비교 간트 SVG는 순수 oklch() 색상만 사용하고 원시 hex/rgb/hsl과 NaN/Infinity가 0건이다", () => {
    const rebalanced = rebalanceAssistantWorkload(makeSkewedAssistantInput(38));
    const singleSvg = renderEpisodeScheduleGanttSvg(rebalanced.beforeSchedule);
    const compareSvg = renderEpisodeScheduleGanttSvg(rebalanced.beforeSchedule, rebalanced);

    for (const svg of [singleSvg, compareSvg]) {
      expect(svg.startsWith("<svg ")).toBe(true);
      expect(svg.trim().endsWith("</svg>")).toBe(true);
      expect(svg).toContain("oklch(");
      expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(svg).not.toMatch(/\brgba?\s*\(/i);
      expect(svg).not.toMatch(/\bhsla?\s*\(/i);
      expect(svg).not.toMatch(/\b(NaN|Infinity)\b/);
    }
    expect(compareSvg).toContain("전 / 후 비교");
    expect(compareSvg).toContain("마감 38.0h");
  });

  it("SVG 출력에서 XML 특수문자 및 악성 스크립트 문자열을 완벽히 이스케이프한다", () => {
    const xssPayload = `<script>alert("x&y'z")</script>`;
    expect(escapeScheduleXml(xssPayload)).toBe(
      "&lt;script&gt;alert(&quot;x&amp;y&apos;z&quot;)&lt;/script&gt;",
    );

    const base = makeParallelFivePhaseInput(72);
    const schedule = computeEpisodeCpmSchedule({
      ...base,
      episodeTitleKo: `42화 ${xssPayload}`,
      teamMembers: base.teamMembers.map((m, idx) =>
        idx === 0 ? { ...m, nameKo: "PD<img src=x>" } : m,
      ),
      tasks: base.tasks.map((t, idx) =>
        idx === 0 ? { ...t, cutRangeLabel: `1~10컷 & "특수"` } : t,
      ),
    });
    const svg = renderEpisodeScheduleGanttSvg(schedule);
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("<img ");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&quot;");
  });

  it("한국어 PD 브리프는 번역투와 의료·진단 표현을 배제하고 모델 추정치·평준화 효과를 명확히 안내한다", () => {
    const rebalanced = rebalanceAssistantWorkload(makeSkewedAssistantInput(38));
    const report = summarizeEpisodeScheduleAuditKo(rebalanced.beforeSchedule, rebalanced);

    expect(report).toContain("모델 추정치");
    expect(report).toContain("임계 경로");
    expect(report).toContain("최종 24시간");
    expect(report).toContain("어시스턴트 작업량 평준화 결과");
    expect(report).toContain("지연 위험에서 기한 내 일정으로 회복됨");
    expect(report).toContain(rebalanced.afterManifestSha256Hex);

    for (const phrase of [
      "가능하게 합니다",
      "직관적인 경험을 제공",
      "원활한 워크플로우를 보장",
    ]) {
      expect(report).not.toContain(phrase);
    }
    for (const term of ["진단", "치료", "질병", "처방", "우울증", "증후군", "병원"]) {
      expect(report).not.toContain(term);
    }
  });

  it("순환 의존성 fail-closed 스케줄의 SVG와 한국어 브리프도 안전하게 차단 사유를 렌더링한다", () => {
    const failed = computeEpisodeCpmSchedule({
      episodeId: "ep-fail-render",
      episodeTitleKo: "순환 <테스트>",
      deadlineBudgetHr: 48,
      teamMembers: FULL_TEAM,
      tasks: [
        mkTask("c1", "story-conti", "1", 4, ["c2"], "m-pd"),
        mkTask("c2", "lineart-ink", "2", 4, ["c1"], "m-line"),
      ],
    });
    const svg = renderEpisodeScheduleGanttSvg(failed);
    expect(svg).toContain("Fail-Closed");
    expect(svg).toContain("&lt;테스트&gt;");
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(svg).not.toMatch(/\b(NaN|Infinity)\b/);

    const report = summarizeEpisodeScheduleAuditKo(failed);
    expect(report).toContain("Fail-Closed");
    expect(report).toContain("순환 의존성 감지");
  });
});
