// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n-core";

import {
  completeStageAllCuts,
  computePaceSummary,
  createInitialPaceState,
  loadSerializationPaceState,
  nudgeStageCuts,
  recordDailyPaceCheckIn,
  saveSerializationPaceState,
} from "./serialization-pace-model";
import { CreatorSerializationPaceBoard } from "./CreatorSerializationPaceBoard";

beforeEach(() => {
  localStorage.clear();
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
});

describe("serialization-pace-model 순수 계산 & 영속", () => {
  it("5단계 가중 진행률·일일 권장 컷 수·마감 주의 신호·일일 체크인을 정확히 계산한다", () => {
    const base = createInitialPaceState("weekly-60");
    const tight = { ...base, daysRemaining: 1 };
    const tightSummary = computePaceSummary(tight);
    expect(tightSummary.status).toBe("tight");
    expect(tightSummary.dailyRequiredUnits).toBeGreaterThan(20);

    const progressed = completeStageAllCuts(nudgeStageCuts(base, "ink", 10), "color");
    saveSerializationPaceState(progressed);
    expect(loadSerializationPaceState().completedByStage.color).toBe(60);

    const firstCheck = recordDailyPaceCheckIn(progressed, "2026-11-21");
    expect(firstCheck.alreadyCheckedToday).toBe(false);
    expect(firstCheck.state.dailyCheckInStreak).toBe(1);

    const duplicateCheck = recordDailyPaceCheckIn(firstCheck.state, "2026-11-21");
    expect(duplicateCheck.alreadyCheckedToday).toBe(true);
    expect(duplicateCheck.state.dailyCheckInStreak).toBe(1);
  });
});

describe("CreatorSerializationPaceBoard UI", () => {
  it("프리셋 전환, 공정 컷 증감/완료, 오늘 체크인 파티클 버스트와 리로드 복원이 동작한다", () => {
    const { unmount } = render(<CreatorSerializationPaceBoard />);

    fireEvent.click(screen.getByTestId("pace-preset-instatoon-8"));
    expect(screen.getByTestId("pace-preset-instatoon-8").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("pace-stage-count-storyboard").textContent).toContain("8/8");

    fireEvent.click(screen.getByTestId("pace-stage-done-ink"));
    expect(screen.getByTestId("pace-stage-count-ink").textContent).toContain("8/8");

    const checkBtn = screen.getByTestId("pace-daily-checkin-btn");
    fireEvent.click(checkBtn);
    expect(checkBtn.getAttribute("aria-pressed")).toBe("true");
    expect(checkBtn.querySelectorAll(".pace-burst-spark")).toHaveLength(6);

    unmount();
    render(<CreatorSerializationPaceBoard />);
    expect(screen.getByTestId("pace-preset-instatoon-8").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("pace-stage-count-ink").textContent).toContain("8/8");
  });

  it("영문 로케일(en)에서 한글이 누출되지 않는다", () => {
    useI18n.setState({ lang: "en" });
    render(<CreatorSerializationPaceBoard />);
    expect(screen.getByTestId("creator-serialization-pace-board").textContent).not.toMatch(/[가-힣]/u);
  });
});
