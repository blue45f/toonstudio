import { describe, expect, it } from "vitest";

import {
  createEmptyProductionWorkspace,
  parseProductionWorkspace,
  serializeProductionWorkspace,
  type ProductionTask,
} from "../studio-production/studio-production-workspace";
import {
  applyGateFollowUpSyncToWorkspace,
  buildGateFollowUpTask,
  collectOpenGateFollowUpTasks,
  followUpIdFromGateTaskId,
  gateFollowUpKindFromTaskId,
  gateFollowUpsFromGates,
  isGateFollowUpTask,
  productionStageForGateFollowUp,
  summarizeGateFollowUpTasks,
  syncGateFollowUpTasks,
} from "./gate-followup-task-sync-model";
import {
  stageGateId,
  type StageConsensusGate,
  type StageGateDecision,
  type StageGateFollowUp,
} from "./stage-consensus-gate-model";

function decision(partial: Partial<StageGateDecision> & Pick<StageGateDecision, "value">): StageGateDecision {
  return {
    reviewerId: "lead-1",
    reviewerName: "리드",
    role: "lead",
    reason: "",
    conditions: [],
    pinThreadIds: [],
    decidedAt: "2026-10-14T09:00:00.000Z",
    ...partial,
  };
}

function gate(partial: Partial<StageConsensusGate> = {}): StageConsensusGate {
  return {
    id: stageGateId("ep-1", "plan"),
    episodeId: "ep-1",
    stageId: "plan",
    leadReviewerId: "lead-1",
    leadReviewerName: "리드",
    rounds: [],
    ...partial,
  };
}

function round(roundNo: number, decisions: readonly StageGateDecision[]) {
  return {
    round: roundNo,
    submittedById: "artist-1",
    submittedByName: "작가",
    revisionRef: `rev-${roundNo}`,
    submittedAt: `2026-10-1${roundNo}T08:00:00.000Z`,
    decisions,
  };
}

function rejectedGate(rounds = 1): StageConsensusGate {
  const all = [
    round(1, [decision({ value: "request-changes", reason: "무게감이 부족해요\n톤을 더 눌러 주세요", pinThreadIds: ["t-1"] })]),
    round(2, []),
  ];
  return gate({ rounds: all.slice(0, rounds) });
}

function followUp(partial: Partial<StageGateFollowUp> = {}): StageGateFollowUp {
  return {
    id: `gate-followup:${stageGateId("ep-1", "plan")}:r1:rejection-rework`,
    gateId: stageGateId("ep-1", "plan"),
    stageId: "plan",
    kind: "rejection-rework",
    title: { ko: "기획 합의 반려 — 사유 확인 후 다시 제출", en: "Planning consensus rejected" },
    detail: "무게감이 부족해요",
    assigneeId: "artist-1",
    assigneeName: "작가",
    pinThreadIds: ["t-1"],
    createdAt: "2026-10-14T09:00:00.000Z",
    resolvedByRound: null,
    ...partial,
  };
}

function workspaceWithAssignments() {
  return {
    ...createEmptyProductionWorkspace("work:test"),
    roleAssignments: [
      { id: "assignment-artist", memberId: "artist-1", displayName: "작가", roles: ["story"], hierarchyNodeId: null },
      { id: "assignment-lead", memberId: "lead-1", displayName: "리드", roles: ["reviewer"], hierarchyNodeId: null },
    ],
  } as ReturnType<typeof createEmptyProductionWorkspace>;
}

function rejectedGateBy(submittedById: string, submittedByName: string): StageConsensusGate {
  return gate({
    rounds: [
      {
        round: 1,
        submittedById,
        submittedByName,
        revisionRef: "rev-1",
        submittedAt: "2026-10-11T08:00:00.000Z",
        decisions: [decision({ value: "request-changes", reason: "무게감이 부족해요" })],
      },
    ],
  });
}

describe("gate follow-up task identity", () => {
  it("후속 작업 ID가 곧 할 일 ID이고, 종류를 ID에서 되읽는다", () => {
    const rework = followUp();
    expect(isGateFollowUpTask({ id: rework.id })).toBe(true);
    expect(followUpIdFromGateTaskId(rework.id)).toBe(rework.id);
    expect(gateFollowUpKindFromTaskId(rework.id)).toBe("rejection-rework");
    expect(gateFollowUpKindFromTaskId(followUp({ id: `gate-followup:g:r2:condition:1` }).id)).toBe("condition");
    expect(gateFollowUpKindFromTaskId(`gate-followup:g:r2:rereview-request`)).toBe("rereview-request");
    expect(isGateFollowUpTask({ id: "pin-task:thread-1" })).toBe(false);
    expect(isGateFollowUpTask({ id: "task-1" })).toBe(false);
    expect(followUpIdFromGateTaskId("gate-followup:")).toBeNull();
  });
});

describe("gateFollowUpsFromGates", () => {
  it("게이트 모델의 후속 작업을 그대로 모은다 (반려 1라운드 → 재작업 1건)", () => {
    const followUps = gateFollowUpsFromGates([rejectedGate(1)]);
    expect(followUps).toHaveLength(1);
    expect(followUps[0]?.kind).toBe("rejection-rework");
    expect(followUps[0]?.assigneeId).toBe("artist-1");
  });

  it("재제출되면 재작업은 해소되고 리드에게 재검토 요청이 생긴다", () => {
    const followUps = gateFollowUpsFromGates([rejectedGate(2)]);
    expect(followUps.map((entry) => entry.kind)).toEqual(["rejection-rework", "rereview-request"]);
    expect(followUps[0]?.resolvedByRound).toBe(2);
    expect(followUps[1]?.assigneeId).toBe("lead-1");
  });
});

describe("buildGateFollowUpTask", () => {
  it("워크스페이스 정규화를 통과하는 값으로 후속 할 일을 만든다 (제목에 사유 첫 줄)", () => {
    const task = buildGateFollowUpTask(followUp());
    expect(task).toMatchObject({
      id: `gate-followup:${stageGateId("ep-1", "plan")}:r1:rejection-rework`,
      title: "기획 합의 반려 — 사유 확인 후 다시 제출 · 무게감이 부족해요",
      owner: "작가",
      due: "2026-10-14",
      progress: 0,
      status: "todo",
      stage: "planning",
      priority: "high",
      assigneeIds: ["artist-1"],
    });
  });

  it("게이트 단계를 공정 단계로 옮긴다 (기획→planning, 콘티→storyboard, 스케치→rough)", () => {
    expect(productionStageForGateFollowUp(followUp({ stageId: "plan" }))).toBe("planning");
    expect(productionStageForGateFollowUp(followUp({ stageId: "storyboard" }))).toBe("storyboard");
    expect(productionStageForGateFollowUp(followUp({ stageId: "art" }))).toBe("rough");
  });

  it("해소된 후속 작업은 완료 상태로 등록되고, 조건은 보통 우선순위다", () => {
    expect(buildGateFollowUpTask(followUp({ resolvedByRound: 2 }))).toMatchObject({
      status: "done",
      progress: 100,
    });
    expect(buildGateFollowUpTask(followUp({ kind: "condition" })).priority).toBe("normal");
  });

  it("긴 사유는 제목에서 말줄임하고, 생성 시각을 못 읽으면 fallback·기본 날짜를 쓴다", () => {
    const long = buildGateFollowUpTask(followUp({ detail: "가".repeat(200) }));
    expect(long.title.length).toBeLessThanOrEqual(240);
    expect(long.title.endsWith("…")).toBe(true);
    expect(buildGateFollowUpTask(followUp({ createdAt: "not-a-date" }), { fallbackDue: "2026-10-20" }).due)
      .toBe("2026-10-20");
    expect(buildGateFollowUpTask(followUp({ createdAt: "not-a-date" })).due).toBe("1970-01-01");
  });
});

describe("syncGateFollowUpTasks", () => {
  it("후속 작업이 생기면 할 일을 등록하고, 다시 동기화해도 중복되지 않는다", () => {
    const first = syncGateFollowUpTasks([], [followUp()]);
    expect(first.addedTaskIds).toEqual([followUp().id]);
    expect(first.tasks).toHaveLength(1);

    const second = syncGateFollowUpTasks(first.tasks, [followUp()]);
    expect(second.changed).toBe(false);
    expect(second.tasks).toBe(first.tasks);
  });

  it("재제출로 해소되면 자동 완료되고, 해소가 사라지면 다시 열린다", () => {
    const created = syncGateFollowUpTasks([], [followUp()]);
    const completed = syncGateFollowUpTasks(created.tasks, [followUp({ resolvedByRound: 2 })]);
    expect(completed.completedTaskIds).toEqual([followUp().id]);
    expect(completed.tasks[0]).toMatchObject({ status: "done", progress: 100 });

    const reopened = syncGateFollowUpTasks(completed.tasks, [followUp()]);
    expect(reopened.reopenedTaskIds).toEqual([followUp().id]);
    expect(reopened.tasks[0]).toMatchObject({ status: "todo", progress: 0 });
  });

  it("조건 할 일은 사람이 완료하면 동기화가 되열지 않는다", () => {
    const condition = followUp({
      id: `gate-followup:${stageGateId("ep-1", "plan")}:r1:condition:0`,
      kind: "condition",
      detail: "3화부터 속도 올리기",
    });
    const created = syncGateFollowUpTasks([], [condition]);
    const manuallyDone: ProductionTask = { ...created.tasks[0]!, status: "done", progress: 100 };
    const synced = syncGateFollowUpTasks([manuallyDone], [condition]);
    expect(synced.tasks[0]).toMatchObject({ status: "done", progress: 100 });
    expect(synced.reopenedTaskIds).toEqual([]);
  });

  it("진행 중인 할 일은 상태·기한을 유지하고 담당·제목 변경만 따라간다", () => {
    const created = syncGateFollowUpTasks([], [followUp()]);
    const doing: ProductionTask = { ...created.tasks[0]!, status: "doing", progress: 40, due: "2026-10-25" };
    const synced = syncGateFollowUpTasks([doing], [
      followUp({ assigneeId: "artist-2", assigneeName: "박작가", detail: "전개가 느려요" }),
    ]);
    expect(synced.tasks[0]).toMatchObject({
      status: "doing",
      progress: 40,
      due: "2026-10-25",
      owner: "박작가",
      assigneeIds: ["artist-2"],
      title: "기획 합의 반려 — 사유 확인 후 다시 제출 · 전개가 느려요",
    });
  });

  it("게이트 기록이 사라지면 시작 전 할 일만 정리하고, 손이 간 할 일·일반 할 일·핀 할 일은 남긴다", () => {
    const gateTask = buildGateFollowUpTask(followUp());
    const touched: ProductionTask = {
      ...buildGateFollowUpTask(followUp({
        id: `gate-followup:${stageGateId("ep-1", "art")}:r1:condition:0`,
        stageId: "art",
        kind: "condition",
      })),
      status: "doing",
      progress: 10,
    };
    const manualTask: ProductionTask = {
      id: "manual-1",
      title: "수동 할 일",
      owner: "김작가",
      due: "2026-10-01",
      progress: 0,
      status: "todo",
    };
    const pinTask: ProductionTask = { ...manualTask, id: "pin-task:thread-1", title: "핀 할 일" };
    const result = syncGateFollowUpTasks([gateTask, touched, manualTask, pinTask], []);
    expect(result.removedTaskIds).toEqual([gateTask.id]);
    expect(result.tasks.map((task) => task.id)).toEqual([touched.id, "manual-1", "pin-task:thread-1"]);
  });

  it("담당자 ID 변환 훅을 적용한다", () => {
    const result = syncGateFollowUpTasks([], [followUp({ assigneeId: "member-7" })], {
      resolveAssigneeId: (entry) => (entry.assigneeId ? `assignment-${entry.assigneeId}` : null),
    });
    expect(result.tasks[0]?.assigneeIds).toEqual(["assignment-member-7"]);
  });
});

describe("applyGateFollowUpSyncToWorkspace", () => {
  it("게이트에서 워크스페이스까지 동기화하고 저장·복원 왕복을 통과한다", () => {
    // 워크스페이스 저장 검증(referencesAreValid)은 assigneeIds가 roleAssignments의
    // 배정 ID 또는 memberId로 실재할 것을 요구한다 — 게이트 담당자(회원 ID)는
    // 역할 배정의 memberId로 실리므로 그대로 통과한다.
    const workspace = {
      ...createEmptyProductionWorkspace("work:test"),
      roleAssignments: [
        { id: "assignment-artist", memberId: "artist-1", displayName: "작가", roles: ["story"], hierarchyNodeId: null },
        { id: "assignment-lead", memberId: "lead-1", displayName: "리드", roles: ["reviewer"], hierarchyNodeId: null },
      ],
    } as ReturnType<typeof createEmptyProductionWorkspace>;
    const conditional = gate({
      id: stageGateId("ep-1", "art"),
      stageId: "art",
      rounds: [round(1, [decision({ value: "approve-with-conditions", conditions: ["포즈 한 단계 과장"] })])],
    });
    const { workspace: synced, result } = applyGateFollowUpSyncToWorkspace(workspace, [
      rejectedGate(2),
      conditional,
    ]);
    // 재작업(해소됨) + 재검토 요청 + 조건 1건
    expect(result.addedTaskIds).toHaveLength(3);
    expect(result.completedTaskIds).toHaveLength(1);

    const restored = parseProductionWorkspace(serializeProductionWorkspace(synced), "work:test");
    expect(restored?.tasks.map((task) => task.id)).toEqual(result.addedTaskIds);
    expect(restored?.tasks.find((task) => task.id.includes("condition"))).toMatchObject({
      stage: "rough",
      priority: "normal",
      status: "todo",
    });

    const again = applyGateFollowUpSyncToWorkspace(restored!, [rejectedGate(2), conditional]);
    expect(again.result.changed).toBe(false);
    expect(again.workspace).toBe(restored);
  });

  it("방어: 훅 없이 memberId·배정 ID 어디에도 없는 담당자는 걸러내고 dropped로 보고한다 (직렬화 무throw)", () => {
    // 게이트 담당자 기본값은 회원 ID 공간이라 역할 배정의 memberId와 일치하면
    // 정당한 기본값이지만, 워크스페이스의 어떤 역할 배정에도 없는 회원 ID는
    // 저장 검증(assigneeIds ⊆ 배정 id·memberId)을 통과하지 못해 동기화는
    // 성공하는데 워크스페이스 전체 저장이 throw하는 조합이 된다.
    const workspace = workspaceWithAssignments();
    const { workspace: synced, result } = applyGateFollowUpSyncToWorkspace(workspace, [
      rejectedGateBy("outsider-1", "외부 작가"),
    ]);
    const task = synced.tasks.find((entry) => entry.id === followUp().id);
    expect(task?.assigneeIds).toEqual([]);
    // 표시용 담당 이름은 남는다 — 사라지는 것은 ID 매칭뿐이다.
    expect(task?.owner).toBe("외부 작가");
    expect(result.droppedAssigneeIds).toEqual(["outsider-1"]);

    expect(() => serializeProductionWorkspace(synced)).not.toThrow();
    const restored = parseProductionWorkspace(serializeProductionWorkspace(synced), "work:test");
    expect(restored?.tasks.map((entry) => entry.id)).toEqual([followUp().id]);

    // 재동기화는 멱등이고, 버린 ID는 매 호출 다시 보고한다.
    const again = applyGateFollowUpSyncToWorkspace(restored!, [rejectedGateBy("outsider-1", "외부 작가")]);
    expect(again.result.changed).toBe(false);
    expect(again.workspace).toBe(restored);
    expect(again.result.droppedAssigneeIds).toEqual(["outsider-1"]);
  });

  it("방어: 훅이 없어도 배정 ID·memberId로 해석되는 담당자는 그대로 유지되고 직렬화를 통과한다", () => {
    const workspace = workspaceWithAssignments();
    // memberId 일치 (정당한 기본값)
    const byMember = applyGateFollowUpSyncToWorkspace(workspace, [rejectedGate(1)]);
    expect(byMember.workspace.tasks[0]?.assigneeIds).toEqual(["artist-1"]);
    expect(byMember.result.droppedAssigneeIds).toEqual([]);
    expect(() => serializeProductionWorkspace(byMember.workspace)).not.toThrow();

    // 배정 ID 자체와 일치
    const byAssignment = applyGateFollowUpSyncToWorkspace(workspace, [
      rejectedGateBy("assignment-artist", "작가"),
    ]);
    expect(byAssignment.workspace.tasks[0]?.assigneeIds).toEqual(["assignment-artist"]);
    expect(byAssignment.result.droppedAssigneeIds).toEqual([]);
    expect(() => serializeProductionWorkspace(byAssignment.workspace)).not.toThrow();
  });

  it("방어: 이미 들어간 해석 불가능한 담당자 ID는 다음 동기화에서 정리된다", () => {
    // 목록 수준 build는 워크스페이스를 모르므로 가드 없이 만든다 — 그 상태가
    // 인메모리에 남아 있어도 워크스페이스 진입점의 refresh 경로가 정리한다.
    const stale = buildGateFollowUpTask(followUp({ assigneeId: "outsider-1", assigneeName: "외부 작가" }));
    expect(stale.assigneeIds).toEqual(["outsider-1"]);
    const workspace = { ...workspaceWithAssignments(), tasks: [stale] };
    const { workspace: synced, result } = applyGateFollowUpSyncToWorkspace(workspace, [
      rejectedGateBy("outsider-1", "외부 작가"),
    ]);
    expect(synced.tasks[0]?.assigneeIds).toEqual([]);
    expect(result.droppedAssigneeIds).toEqual(["outsider-1"]);
    expect(() => serializeProductionWorkspace(synced)).not.toThrow();
  });

  it("방어: 훅이 주입되면 가드를 걸지 않는다 (훅 결과 그대로, dropped 빈 배열) — 무회귀 고정", () => {
    const workspace = workspaceWithAssignments();
    const { workspace: synced, result } = applyGateFollowUpSyncToWorkspace(
      workspace,
      [rejectedGate(1)],
      { resolveAssigneeId: () => "hook-result-not-in-assignments" },
    );
    expect(synced.tasks[0]?.assigneeIds).toEqual(["hook-result-not-in-assignments"]);
    expect(result.droppedAssigneeIds).toEqual([]);
  });

  it("목록 수준 syncGateFollowUpTasks는 가드를 걸지 않는다 (dropped 항상 빈 배열)", () => {
    const result = syncGateFollowUpTasks([], [followUp({ assigneeId: "outsider-1" })]);
    expect(result.tasks[0]?.assigneeIds).toEqual(["outsider-1"]);
    expect(result.droppedAssigneeIds).toEqual([]);
  });
});

describe("summarizeGateFollowUpTasks / collectOpenGateFollowUpTasks", () => {
  it("미해결을 종류·담당자별로 세고 막는 일부터 정렬한다", () => {
    const tasks: ProductionTask[] = [
      buildGateFollowUpTask(followUp({ kind: "condition", id: `gate-followup:g:r1:condition:0`, detail: "조건" })),
      buildGateFollowUpTask(followUp()),
      buildGateFollowUpTask(followUp({
        id: `gate-followup:g:r2:rereview-request`,
        kind: "rereview-request",
        assigneeId: "lead-1",
        assigneeName: "리드",
      })),
      buildGateFollowUpTask(followUp({
        id: `gate-followup:g:r0:rejection-rework`,
        resolvedByRound: 1,
      })),
      { id: "manual-1", title: "수동", owner: "김작가", due: "2026-10-01", progress: 0, status: "todo" },
    ];
    const summary = summarizeGateFollowUpTasks(tasks);
    expect(summary.openCount).toBe(3);
    expect(summary.blockingOpenCount).toBe(2);
    expect(summary.openByKind).toEqual({ "rejection-rework": 1, condition: 1, "rereview-request": 1 });
    expect(summary.resolvedCount).toBe(1);
    expect(summary.groups.map((group) => group.key)).toEqual(["artist-1", "lead-1"]);
    expect(summary.groups[0]?.blockingCount).toBe(1);

    const open = collectOpenGateFollowUpTasks(tasks);
    expect(gateFollowUpKindFromTaskId(open[0]!.id)).toBe("rejection-rework");
    expect(open.every((task) => task.status !== "done")).toBe(true);
  });
});
