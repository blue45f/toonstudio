import { describe, expect, it } from "vitest";

import {
  computeEpisodeCycleBurndown,
  createTriageInboxState,
  EPISODE_PRODUCTION_STAGES,
  reduceTriageKeyAction,
  type EpisodeCycleCutProgress,
  type TriageInboxItem,
} from "./studio-keyboard-triage-cycle-engine";

const SAMPLE_ITEMS: readonly TriageInboxItem[] = [
  {
    id: "t-1",
    cutId: "cut-01",
    titleKo: "컷 01 오프닝 배경",
    stage: "bg3d",
    reviewStatus: "in-review",
    triageState: "pending",
    priority: 3,
  },
  {
    id: "t-2",
    cutId: "cut-02",
    titleKo: "컷 02 주인공 클로즈업",
    stage: "lineart",
    reviewStatus: "in-review",
    triageState: "pending",
    priority: 3,
  },
  {
    id: "t-3",
    cutId: "cut-03",
    titleKo: "컷 03 대사 식자",
    stage: "lettering",
    reviewStatus: "in-review",
    triageState: "pending",
    priority: 2,
  },
];

describe("studio-keyboard-triage-cycle-engine", () => {
  it("단일키(J/K/Space/1~4/A/R/D/E) 트리아지 전이와 5초 낙관적 Undo 롤백을 수행한다", () => {
    let state = createTriageInboxState(SAMPLE_ITEMS);
    const t0 = 10_000;

    // 입력창 포커스·IME 조합 중에는 단일키를 무시
    const ignored = reduceTriageKeyAction(state, {
      key: "a",
      targetTagName: "INPUT",
    });
    expect(ignored.handled).toBe(false);

    // J: 다음 컷 이동, Space: 전·후 비교 피크 열기
    state = reduceTriageKeyAction(state, { key: "j" }, { nowMs: t0 }).state;
    expect(state.cursorIndex).toBe(1);
    state = reduceTriageKeyAction(state, { key: " " }, { nowMs: t0 + 100 }).state;
    expect(state.splitPeekOpen).toBe(true);

    // 1: 긴급도 1 지정
    const prioRes = reduceTriageKeyAction(state, { key: "1" }, { nowMs: t0 + 200 });
    expect(prioRes.outboxCommand).toEqual({ kind: "set-priority", itemId: "t-2", priority: 1 });
    state = prioRes.state;
    expect(state.items[1]!.priority).toBe(1);

    // A: 승인 후 다음 미처리 컷으로 자동 커서 이동
    const approveRes = reduceTriageKeyAction(state, { key: "a" }, { nowMs: t0 + 500 });
    expect(approveRes.outboxCommand).toEqual({
      kind: "decide",
      itemId: "t-2",
      decision: "approved",
    });
    state = approveRes.state;
    expect(state.items[1]!.triageState).toBe("approved");
    expect(state.cursorIndex).toBe(2);

    // Z: 5초 이내 낙관적 롤백 성공
    const undoRes = reduceTriageKeyAction(state, { key: "z" }, { nowMs: t0 + 2_000 });
    expect(undoRes.outboxCommand).toEqual({
      kind: "rollback",
      itemId: "t-2",
      restoredState: "pending",
    });
    state = undoRes.state;
    expect(state.items[1]!.triageState).toBe("pending");
    expect(state.cursorIndex).toBe(1);

    // R: 수정 요청, D: 연기, E: 아카이브
    const reqRes = reduceTriageKeyAction(
      state,
      { key: "r" },
      { nowMs: t0 + 2_500, inlinePinNote: "눈동자 하이라이트 보강" },
    );
    expect(reqRes.state.items[1]!.inlinePinNote).toBe("눈동자 하이라이트 보강");
    state = reqRes.state;

    // 5초 초과 후 Z는 롤백 만료 처리
    const expiredUndo = reduceTriageKeyAction(state, { key: "z" }, { nowMs: t0 + 10_000 });
    expect(expiredUndo.outboxCommand).toBeNull();
    expect(expiredUndo.state.lastStatusMessageKo).toContain("5초");
  });

  it("주간 연재 사이클 6공정 번다운, Scope Creep, 마감 48시간 전 병목 경보를 계산한다", () => {
    const cuts: EpisodeCycleCutProgress[] = [
      {
        cutId: "c1",
        completedStages: EPISODE_PRODUCTION_STAGES,
        completedDayIndex: 2,
      },
      {
        cutId: "c2",
        completedStages: ["conti", "bg3d", "lineart", "coloring"],
        completedDayIndex: null,
      },
      {
        cutId: "c3",
        completedStages: ["conti", "bg3d", "lineart"],
        addedAfterCycleStart: true,
        completedDayIndex: null,
      },
      {
        cutId: "c4",
        completedStages: ["conti", "bg3d"],
        completedDayIndex: null,
      },
    ];

    const report = computeEpisodeCycleBurndown({
      cycleId: "ep-14-weekly",
      titleKo: "14화 주간 마감 사이클",
      durationDays: 7,
      currentDayIndex: 5, // 48시간 남음
      cuts,
    });

    expect(report.totalCuts).toBe(4);
    expect(report.initialScopeCuts).toBe(3);
    expect(report.scopeCreepCuts).toBe(1);
    expect(report.fullyCompletedCuts).toBe(1);
    expect(report.remainingCuts).toBe(3);
    expect(report.hoursRemainingToDeadline).toBe(48);
    expect(report.riskLevel).toBe("at-risk");
    expect(report.bottleneckStage?.stage).toBe("lettering");
    expect(report.dailySeries).toHaveLength(8);
    expect(report.alertMessageKo).toContain("48시간");
  });
});
