// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TRACK_MODES,
  simulateCrewDivisionPlan,
} from "./collaboration-crew-division-planner-model";
import { CollaborationCrewDivisionPlanner } from "./CollaborationCrewDivisionPlanner";

afterEach(() => {
  cleanup();
});

describe("collaboration-crew-division-planner-model", () => {
  it("6대 웹툰 분업 공정별 메인 작가 투입 시간·어시스턴트 병렬 시간·외주비를 계산한다", () => {
    const defaultResult = simulateCrewDivisionPlan({
      targetCuts: 70,
      weeklyDeadlineHours: 96,
      trackModes: DEFAULT_TRACK_MODES,
    });
    expect(defaultResult.rows).toHaveLength(6);
    expect(defaultResult.totalCreatorHours).toBeGreaterThan(68);
    expect(defaultResult.burnoutRiskLevel).toBe("overload");

    const delegatedResult = simulateCrewDivisionPlan({
      targetCuts: 70,
      weeklyDeadlineHours: 96,
      trackModes: {
        story_board: "creator-solo",
        bg_3d: "assistant-outsourced",
        line_art: "assistant-outsourced",
        flat_color: "assistant-outsourced",
        shading_render: "assistant-outsourced",
        compositing_lettering: "creator-solo",
      },
    });
    expect(delegatedResult.totalCreatorHours).toBeLessThan(defaultResult.totalCreatorHours);
    expect(delegatedResult.burnoutRiskLevel).toBe("safe");
    expect(delegatedResult.estimatedEpisodeOutsourcingKrw).toBeGreaterThan(defaultResult.estimatedEpisodeOutsourcingKrw);
  });
});

describe("CollaborationCrewDivisionPlanner", () => {
  it("주간 연재 최적 분업 프리셋을 적용하고 공정별 파트너 공고 필터를 호출한다", () => {
    const onSelectRoleFilter = vi.fn();
    render(<CollaborationCrewDivisionPlanner onSelectRoleFilter={onSelectRoleFilter} />);

    expect(screen.getByText(/마감 초과 위험/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /주간 연재 최적 분업 프리셋 적용/ }));
    expect(screen.getByText(/안전 — 주간 연재 안정권/)).toBeTruthy();

    const filterButtons = screen.getAllByRole("button", { name: /이 공정 파트너 공고 보기/ });
    fireEvent.click(filterButtons[2]);
    expect(onSelectRoleFilter).toHaveBeenCalledWith("ink");
    expect(screen.getByTestId("collaboration-rea-handoff-sla-bar").textContent).toContain(
      "18개 레이어 RBAC 잠금 보호",
    );
  });
});
