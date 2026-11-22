// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioProductionCalendar } from "../studio-production/StudioProductionCalendar";
import type { ProductionTask } from "../studio-production/studio-production-workspace-runtime";
import {
  PRODUCTION_METER_STAGES,
  completeActiveStageSession,
  createDefaultSoloDeadlineMeterState,
  evaluateSoloDeadlineForecast,
  formatTimerDuration,
  getActiveTimerElapsedMs,
  learnStageMinutesPerCut,
  loadSoloDeadlineMeterState,
  pauseStageTimer,
  recordManualStageSession,
  saveSoloDeadlineMeterState,
  startStageTimer,
  updateEpisodeDeadlineTarget,
} from "./deadline-meter-engine";
import { StudioSoloDeadlineMeterPanel } from "./StudioSoloDeadlineMeterPanel";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("1인 스튜디오 마감 캘린더 & 공정별 소요시간 자동 계측기 엔진", () => {
  it("콘티·선화·밑색·명암·식자 5대 공정 타이머 시작·일시정지·재개·종료 및 누적 시간을 정확히 계측한다", () => {
    expect(PRODUCTION_METER_STAGES.map((s) => s.labelKo)).toEqual([
      "콘티",
      "선화",
      "밑색",
      "명암",
      "식자",
    ]);

    let state = createDefaultSoloDeadlineMeterState("2026-11-22");
    state = startStageTimer(state, "lineart", 1_000_000);
    expect(getActiveTimerElapsedMs(state.activeTimer, 1_300_000)).toBe(300_000);

    state = pauseStageTimer(state, 1_300_000);
    expect(state.activeTimer?.running).toBe(false);
    expect(getActiveTimerElapsedMs(state.activeTimer, 1_900_000)).toBe(300_000);

    state = startStageTimer(state, "lineart", 2_000_000);
    expect(getActiveTimerElapsedMs(state.activeTimer, 2_300_000)).toBe(600_000);
    expect(formatTimerDuration(600_000)).toBe("10:00");

    state = completeActiveStageSession(state, { cutsCompleted: 2 }, 2_300_000);
    expect(state.activeTimer).toBeNull();
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0]!.stage).toBe("lineart");
    expect(state.sessions[0]!.durationMinutes).toBe(10);
    expect(state.sessions[0]!.cutsCompleted).toBe(2);
  });

  it("세션 기록이 쌓일수록 컷당 평균 소요시간(분)이 기준치에서 혼합·실측 학습으로 자동 전환된다", () => {
    let state = createDefaultSoloDeadlineMeterState("2026-11-22");
    const initial = learnStageMinutesPerCut(state.sessions);
    expect(initial.every((s) => s.source === "baseline")).toBe(true);

    // 2컷 실측(분당 20분/컷) → blended
    state = recordManualStageSession(
      state,
      { stage: "lineart", durationMinutes: 40, cutsCompleted: 2 },
      1_000,
    );
    const blended = learnStageMinutesPerCut(state.sessions).find((s) => s.stage === "lineart")!;
    expect(blended.source).toBe("blended");
    expect(blended.minutesPerCut).toBeGreaterThan(blended.baselineMinutesPerCut);

    // 누적 6컷 이상(분당 18분/컷) → measured
    state = recordManualStageSession(
      state,
      { stage: "lineart", durationMinutes: 72, cutsCompleted: 4 },
      2_000,
    );
    const measured = learnStageMinutesPerCut(state.sessions).find((s) => s.stage === "lineart")!;
    expect(measured.source).toBe("measured");
    expect(measured.measuredCuts).toBe(6);
    expect(measured.minutesPerCut).toBeCloseTo(18.9, 0);
  });

  it("마감까지 남은 일수 대비 하루 목표 컷 수와 휴재 위험도(안전·주의·긴급)를 정확히 산출한다", () => {
    const base = createDefaultSoloDeadlineMeterState("2026-11-22");

    // 1) 안전: 10일 남음, 30컷 남음 → 하루 3컷 (~1.4시간/일 vs 6시간 가용)
    const safeState = updateEpisodeDeadlineTarget(base, {
      deadlineDate: "2026-12-01",
      targetCuts: 60,
      completedCuts: 30,
      dailyWorkHours: 6,
    });
    const safeForecast = evaluateSoloDeadlineForecast(safeState, "2026-11-22");
    expect(safeForecast.daysRemaining).toBe(10);
    expect(safeForecast.dailyTargetCuts).toBe(3);
    expect(safeForecast.riskLevel).toBe("safe");
    expect(safeForecast.riskLabelKo).toBe("안전");

    // 2) 주의: 5일 남음, 54컷 남음 → 하루 11컷 (~5.1시간/일 vs 6시간 가용 → ratio ~0.85)
    const cautionState = updateEpisodeDeadlineTarget(base, {
      deadlineDate: "2026-11-26",
      targetCuts: 60,
      completedCuts: 6,
      dailyWorkHours: 6,
    });
    const cautionForecast = evaluateSoloDeadlineForecast(cautionState, "2026-11-22");
    expect(cautionForecast.daysRemaining).toBe(5);
    expect(cautionForecast.dailyTargetCuts).toBe(11);
    expect(cautionForecast.riskLevel).toBe("caution");
    expect(cautionForecast.riskLabelKo).toBe("주의");

    // 3) 긴급: 2일 남음, 50컷 남음 → 하루 25컷 (~11.9시간/일 vs 6시간 가용 → ratio > 1.05)
    const urgentState = updateEpisodeDeadlineTarget(base, {
      deadlineDate: "2026-11-23",
      targetCuts: 60,
      completedCuts: 10,
      dailyWorkHours: 6,
    });
    const urgentForecast = evaluateSoloDeadlineForecast(urgentState, "2026-11-22");
    expect(urgentForecast.daysRemaining).toBe(2);
    expect(urgentForecast.dailyTargetCuts).toBe(25);
    expect(urgentForecast.riskLevel).toBe("urgent");
    expect(urgentForecast.riskLabelKo).toBe("긴급");

    // 4) 마감 경과 + 잔여 컷 있음 → 긴급
    const overdueState = updateEpisodeDeadlineTarget(base, {
      deadlineDate: "2026-11-20",
      targetCuts: 60,
      completedCuts: 50,
    });
    const overdueForecast = evaluateSoloDeadlineForecast(overdueState, "2026-11-22");
    expect(overdueForecast.isOverdue).toBe(true);
    expect(overdueForecast.riskLevel).toBe("urgent");
  });

  it("로컬 스토리지에 타이머·세션·마감 설정을 ₩0 로컬 영속화한다", () => {
    let state = createDefaultSoloDeadlineMeterState("2026-11-22");
    state = recordManualStageSession(
      state,
      { stage: "conti", durationMinutes: 30, cutsCompleted: 6 },
      5_000,
    );
    expect(saveSoloDeadlineMeterState(state)).toBe(true);
    const loaded = loadSoloDeadlineMeterState("2026-11-22");
    expect(loaded.sessions).toHaveLength(1);
    expect(loaded.sessions[0]!.stage).toBe("conti");
  });
});

describe("StudioSoloDeadlineMeterPanel & StudioProductionCalendar 통합", () => {
  it("공정 타이머 시작·종료, 실측 기록 추가, 마감일 변경 시 휴재 위험도가 즉시 갱신된다", () => {
    render(<StudioSoloDeadlineMeterPanel today="2026-11-22" activeTaskCount={3} />);

    expect(screen.getByTestId("deadline-meter-risk-badge").textContent).toContain("안전");

    // 선화 타이머 시작 → 종료
    fireEvent.click(screen.getByRole("button", { name: "공정 타이머 시작" }));
    expect(screen.getByRole("button", { name: "세션 종료 · 학습 반영" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "세션 종료 · 학습 반영" }));
    expect(screen.getByText(/선화 세션을 저장/)).toBeTruthy();

    // 마감일을 내일로 당기고 완료 컷을 0으로 줄이면 긴급으로 전환
    fireEvent.change(screen.getByLabelText("다음 화 마감일"), {
      target: { value: "2026-11-23" },
    });
    fireEvent.change(screen.getByLabelText("완료 컷 수"), {
      target: { value: "0" },
    });
    expect(screen.getByTestId("deadline-meter-risk-badge").textContent).toContain("긴급");
  });

  it("StudioProductionCalendar 안에서 1인 마감 캘린더 계측기가 함께 렌더링된다", () => {
    const tasks: readonly ProductionTask[] = [
      {
        id: "t-1",
        title: "제14화 선화 마감",
        owner: "작가",
        progress: 40,
        status: "doing",
        due: "2026-11-25",
      },
    ];
    render(
      <StudioProductionCalendar
        tasks={tasks}
        today="2026-11-22"
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByText("제14화 선화 마감")).toBeTruthy();
    expect(screen.getByTestId("studio-solo-deadline-meter-panel")).toBeTruthy();
  });
});
