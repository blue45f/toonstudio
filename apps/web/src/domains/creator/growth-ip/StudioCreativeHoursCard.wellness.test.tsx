// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioCreativeHoursCard } from "../StudioCreativeHoursCard";
import type { CreativeWorkTimeTrackerState } from "../studio-creative-work-time-tracker";

afterEach(() => {
  cleanup();
});

function makeTracker(overrides: Partial<CreativeWorkTimeTrackerState> = {}): CreativeWorkTimeTrackerState {
  const now = 1_760_000_000_000;
  return {
    projectId: "proj-wellness-1",
    totalWorkTimeSeconds: 7200,
    sessionWorkTimeSeconds: 1800,
    strokeCount: 1240,
    sessionStartedAt: now - 1_800_000,
    lastActiveAt: now,
    isIdle: false,
    idleThresholdSeconds: 60,
    ...overrides,
  };
}

describe("StudioCreativeHoursCard — 예방형 인체공학 웰니스 HUD", () => {
  it("50분 미만 작업 시 휴식 알림을 띄우지 않고 4대 자세 체크리스트를 토글한다", () => {
    render(<StudioCreativeHoursCard tracker={makeTracker({ sessionWorkTimeSeconds: 2940, isIdle: false })} />);

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("2/4 완료")).toBeTruthy();

    const lumbarBtn = screen.getByRole("button", { name: "허리·어깨 중립 지지" });
    expect(lumbarBtn.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(lumbarBtn);
    expect(lumbarBtn.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("3/4 완료")).toBeTruthy();

    const wristBtn = screen.getByRole("button", { name: "손목 중립 각도 유지" });
    fireEvent.click(wristBtn);
    expect(wristBtn.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("2/4 완료")).toBeTruthy();
  });

  it("50분 이상 연속 작업(비휴식) 시 5분 스트레칭 권장 알림을 표시한다", () => {
    render(<StudioCreativeHoursCard tracker={makeTracker({ sessionWorkTimeSeconds: 3120, isIdle: false })} />);

    const alert = screen.getByRole("status");
    expect(alert.textContent).toContain("52분");
    expect(alert.textContent).toContain("스트레칭");
  });

  it("50분 이상이어도 이미 휴식 중(isIdle)이면 알림을 표시하지 않는다", () => {
    render(<StudioCreativeHoursCard tracker={makeTracker({ sessionWorkTimeSeconds: 3600, isIdle: true })} />);

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("휴식 중")).toBeTruthy();
  });

  it("세션 리셋 버튼 클릭 시 콜백을 호출한다", () => {
    const onResetSession = vi.fn();
    render(<StudioCreativeHoursCard tracker={makeTracker()} onResetSession={onResetSession} />);

    fireEvent.click(screen.getByRole("button", { name: "세션 시간 초기화" }));
    expect(onResetSession).toHaveBeenCalledTimes(1);
  });
});
