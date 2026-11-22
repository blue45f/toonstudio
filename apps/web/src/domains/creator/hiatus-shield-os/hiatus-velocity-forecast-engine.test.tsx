// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  computeWeeklyVelocityMovingAverages,
  createStarterWeeklyVelocitySamples,
  evaluateHiatusCoachingSurface,
  evaluateLateNightCoachingSuppression,
  evaluateWristMicroBreakState,
  forecastThreeWeekHiatusRisk,
  type WeeklyCutVelocitySample,
} from "./hiatus-delay-prevention-engine";
import { StudioHiatusShieldPanel } from "./StudioHiatusShieldPanel";

afterEach(() => {
  cleanup();
});

describe("hiatus-velocity-forecast-engine — 로컬 이동평균(SMA/EMA) & 3주 전 휴재 예측 (#071–#074)", () => {
  it("1. 실측 컷 완성 수·컷당 소요 시간·스트로크 누적 시간의 SMA/EMA와 둔화 기울기를 정확히 산출한다", () => {
    const samples = createStarterWeeklyVelocitySamples();
    const metrics = computeWeeklyVelocityMovingAverages(samples, {
      windowSize: 4,
      emaAlpha: 0.45,
    });

    expect(metrics.sampleCount).toBe(4);
    expect(metrics.smaCutsPerWeek).toBe(70);
    // EMA(0.45): 78 -> 75.3 -> 71.565 -> 67.71075 => 67.7
    expect(metrics.emaCutsPerWeek).toBe(67.7);
    expect(metrics.effectiveWeeklyVelocity).toBe(67.7);
    expect(metrics.smaMinutesPerCut).toBe(32);
    expect(metrics.emaMinutesPerCut).toBe(33.9);
    expect(metrics.weeklyDriftCuts).toBe(-5);
    expect(metrics.minutesPerCutTrendPct).toBeCloseTo(46.2, 1);
    expect(metrics.emaStrokeHoursPerWeek).toBeGreaterThan(metrics.smaStrokeHoursPerWeek);
  });

  it("2. 빈 샘플·단일 샘플·비정상 음수/NaN 입력에서도 유한한 값으로 안전하게 계산한다", () => {
    const empty = computeWeeklyVelocityMovingAverages([]);
    expect(empty.sampleCount).toBe(0);
    expect(empty.smaCutsPerWeek).toBe(0);
    expect(empty.emaCutsPerWeek).toBe(0);

    const single = computeWeeklyVelocityMovingAverages([
      {
        weekIndex: 1,
        weekLabel: "1화",
        completedCuts: 60,
        avgMinutesPerCut: 30,
        cumulativeStrokeMinutes: 1800,
      },
    ]);
    expect(single.smaCutsPerWeek).toBe(60);
    expect(single.emaCutsPerWeek).toBe(60);
    expect(single.weeklyDriftCuts).toBe(0);

    const dirty = computeWeeklyVelocityMovingAverages([
      {
        weekIndex: 2,
        weekLabel: "2화",
        completedCuts: -10,
        avgMinutesPerCut: Number.NaN,
        cumulativeStrokeMinutes: Number.POSITIVE_INFINITY,
      },
    ]);
    expect(Number.isFinite(dirty.smaCutsPerWeek)).toBe(true);
    expect(Number.isFinite(dirty.emaMinutesPerCut)).toBe(true);
    expect(Number.isFinite(dirty.emaStrokeHoursPerWeek)).toBe(true);
    expect(dirty.smaCutsPerWeek).toBe(0);
  });

  it("3. 위험선 도달 2~3주 전에 조기 포착하고 배경 N컷 외주 분리 추천 및 예상 일정 회복일을 역산한다", () => {
    const forecast = forecastThreeWeekHiatusRisk({
      samples: createStarterWeeklyVelocitySamples(),
      targetWeeklyCuts: 80,
      currentBufferWeeks: 1.0,
      dangerBufferWeeks: 0.5,
    });

    expect(forecast.stage).toBe("early_warning_2_3w");
    expect(forecast.isTwoToThreeWeekEarlyWindow).toBe(true);
    expect(forecast.tier).toBe("amber");
    expect(forecast.weeksUntilDangerLine).not.toBeNull();
    expect(forecast.weeksUntilDangerLine ?? -1).toBeGreaterThanOrEqual(2.0);
    expect(forecast.weeksUntilDangerLine ?? 99).toBeLessThanOrEqual(3.5);

    const rec = forecast.outsourceRecommendation;
    expect(rec.shouldRecommend).toBe(true);
    expect(rec.recommendedBgOutsourceCuts).toBeGreaterThanOrEqual(4);
    expect(rec.recommendedBgOutsourceCuts).toBeLessThanOrEqual(rec.maxAvailableBgCuts);
    expect(rec.savedHoursPerWeek).toBeGreaterThan(0);
    expect(rec.estimatedRecoveryDays).toBeGreaterThan(0);
    expect(rec.quietRecommendationKo).toContain(`배경 ${rec.recommendedBgOutsourceCuts}컷 외주 분리`);
    expect(rec.quietRecommendationKo).toContain(`+${rec.estimatedRecoveryDays}일 회복`);

    // 외주 분리 후 3주차 비축 잔량이 현 속도 대비 개선되어야 한다.
    const week3 = forecast.trajectory[2];
    expect(week3?.projectedBufferWithOutsourceWeeks).toBeGreaterThan(
      week3?.projectedBufferWeeks ?? 0,
    );
  });

  it("4. 주간 완성 속도가 목표치 이상으로 안정적이면 위험선 미도달(stable) 및 외주 불필요로 판정한다", () => {
    const steadySamples: readonly WeeklyCutVelocitySample[] = [
      { weekIndex: 1, weekLabel: "W1", completedCuts: 82, avgMinutesPerCut: 24, cumulativeStrokeMinutes: 1968 },
      { weekIndex: 2, weekLabel: "W2", completedCuts: 84, avgMinutesPerCut: 23, cumulativeStrokeMinutes: 1932 },
      { weekIndex: 3, weekLabel: "W3", completedCuts: 81, avgMinutesPerCut: 24, cumulativeStrokeMinutes: 1944 },
      { weekIndex: 4, weekLabel: "W4", completedCuts: 83, avgMinutesPerCut: 23, cumulativeStrokeMinutes: 1909 },
    ];
    const forecast = forecastThreeWeekHiatusRisk({
      samples: steadySamples,
      targetWeeklyCuts: 80,
      currentBufferWeeks: 3,
    });

    expect(forecast.stage).toBe("stable");
    expect(forecast.tier).toBe("green");
    expect(forecast.weeksUntilDangerLine).toBeNull();
    expect(forecast.outsourceRecommendation.shouldRecommend).toBe(false);
    expect(forecast.outsourceRecommendation.recommendedBgOutsourceCuts).toBe(0);
  });

  it("5. 비축이 위험선 이하(0주)이면 즉시 개입(imminent/red)과 0주 잔여로 판정한다", () => {
    const forecast = forecastThreeWeekHiatusRisk({
      samples: createStarterWeeklyVelocitySamples(),
      targetWeeklyCuts: 80,
      currentBufferWeeks: 0,
    });

    expect(forecast.stage).toBe("imminent");
    expect(forecast.tier).toBe("red");
    expect(forecast.weeksUntilDangerLine).toBe(0);
    expect(forecast.outsourceRecommendation.shouldRecommend).toBe(true);
  });
});

describe("50분 손목 휴식 마이크로 브레이크 & 00:00~06:00 심야 무음·접힘 자동 억제 (#074–#075)", () => {
  it("6. 50분 미만은 숨김(hidden), 50분 도달 시 주간 비차단 1줄 배지(inline_badge), 확인 후 100분에 재활성화된다", () => {
    const dayClock = { localHour: 14, localMinute: 20 };

    const under50 = evaluateWristMicroBreakState({
      continuousWorkMinutes: 35,
      clock: dayClock,
    });
    expect(under50.dueNow).toBe(false);
    expect(under50.visibilityState).toBe("hidden");
    expect(under50.minutesUntilNextBreak).toBe(15);
    expect(under50.nonBlockingSingleLine).toBe(true);
    expect(under50.popupForbidden).toBe(true);

    const at50 = evaluateWristMicroBreakState({
      continuousWorkMinutes: 50,
      clock: dayClock,
    });
    expect(at50.dueNow).toBe(true);
    expect(at50.completedWorkCycles).toBe(1);
    expect(at50.visibilityState).toBe("inline_badge");
    expect(at50.badgeLineKo).toContain("손목");
    expect(at50.badgeLineKo).toContain("비차단");

    const ackedAt80 = evaluateWristMicroBreakState({
      continuousWorkMinutes: 80,
      acknowledgedCycleIndex: 1,
      clock: dayClock,
    });
    expect(ackedAt80.dueNow).toBe(false);
    expect(ackedAt80.visibilityState).toBe("hidden");

    const secondCycleAt100 = evaluateWristMicroBreakState({
      continuousWorkMinutes: 100,
      acknowledgedCycleIndex: 1,
      clock: dayClock,
    });
    expect(secondCycleAt100.dueNow).toBe(true);
    expect(secondCycleAt100.completedWorkCycles).toBe(2);
    expect(secondCycleAt100.visibilityState).toBe("inline_badge");
  });

  it("7. 결정론 시계 경계(00:00~05:59 심야 억제 vs 06:00~23:59 주간 인라인)를 정확히 분기한다", () => {
    const nightHours = [
      { localHour: 0, localMinute: 0 },
      { localHour: 0, localMinute: 1 },
      { localHour: 2, localMinute: 30 },
      { localHour: 5, localMinute: 59 },
    ];
    for (const clock of nightHours) {
      const policy = evaluateLateNightCoachingSuppression(clock);
      expect(policy.isLateNightQuietWindow).toBe(true);
      expect(policy.presentationMode).toBe("silent_collapsed");
      expect(policy.autoCollapsed).toBe(true);
      expect(policy.suppressCoachingPrompts).toBe(true);
      expect(policy.allowPopup).toBe(false);
      expect(policy.allowSound).toBe(false);

      const surface = evaluateHiatusCoachingSurface({
        continuousWorkMinutes: 50,
        clock,
      });
      expect(surface.allCoachingSilentlyCollapsed).toBe(true);
      expect(surface.wristBreak.visibilityState).toBe("collapsed_silent");
      expect(surface.popupAllowed).toBe(false);
    }

    const dayHours = [
      { localHour: 6, localMinute: 0 },
      { localHour: 12, localMinute: 0 },
      { localHour: 23, localMinute: 59 },
    ];
    for (const clock of dayHours) {
      const policy = evaluateLateNightCoachingSuppression(clock);
      expect(policy.isLateNightQuietWindow).toBe(false);
      expect(policy.presentationMode).toBe("quiet_inline");
      expect(policy.autoCollapsed).toBe(false);
      expect(policy.allowPopup).toBe(false);

      const surface = evaluateHiatusCoachingSurface({
        continuousWorkMinutes: 50,
        clock,
      });
      expect(surface.allCoachingSilentlyCollapsed).toBe(false);
      expect(surface.wristBreak.visibilityState).toBe("inline_badge");
    }
  });

  it("8. Date 객체 주입 결정론 시계에서도 03:15 심야 무음과 06:00 주간 복귀를 정확히 판정한다", () => {
    const nightDate = new Date(2026, 10, 22, 3, 15, 0);
    const dawnDate = new Date(2026, 10, 22, 6, 0, 0);

    const nightPolicy = evaluateLateNightCoachingSuppression({ now: nightDate });
    expect(nightPolicy.formattedLocalTime).toBe("03:15");
    expect(nightPolicy.isLateNightQuietWindow).toBe(true);

    const dawnPolicy = evaluateLateNightCoachingSuppression({ now: dawnDate });
    expect(dawnPolicy.formattedLocalTime).toBe("06:00");
    expect(dawnPolicy.isLateNightQuietWindow).toBe(false);
  });
});

describe("StudioHiatusShieldPanel — 3주 예측기 · 50분 손목 배지 · 심야 무음 UI 통합", () => {
  it("9. 주간(15:00) + 50분 작업 시 3주 예측 외주 제안과 비차단 1줄 손목 배지를 팝업 없이 표시한다", () => {
    render(
      <StudioHiatusShieldPanel
        localClock={{ localHour: 15, localMinute: 0 }}
        initialContinuousWorkMinutes={50}
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByTestId("hshield-velocity-forecast-body")).toBeTruthy();
    expect(screen.getByTestId("hshield-outsource-recommendation").textContent).toContain("외주 분리");
    expect(screen.getByTestId("hshield-recovery-days").textContent).toContain("일");

    const breakBar = screen.getByTestId("hshield-wrist-micro-break");
    expect(breakBar.getAttribute("data-visibility")).toBe("inline_badge");
    expect(breakBar.getAttribute("data-non-blocking")).toBe("true");

    // 스트레칭 완료 클릭 시 현재 50분 주기가 숨김으로 전환되고, 100분 클릭 시 다시 표시된다.
    fireEvent.click(screen.getByTestId("hshield-wrist-break-ack-btn"));
    expect(screen.getByTestId("hshield-wrist-micro-break").getAttribute("data-visibility")).toBe(
      "hidden",
    );

    fireEvent.click(screen.getByTestId("hshield-work-mins-100"));
    expect(screen.getByTestId("hshield-wrist-micro-break").getAttribute("data-visibility")).toBe(
      "inline_badge",
    );
  });

  it("10. 심야(02:30) 결정론 시계 주입 시 모든 코칭·경보·손목 휴식 배지가 팝업 없이 자동 무음·접힘 처리된다", () => {
    render(
      <StudioHiatusShieldPanel
        localClock={{ localHour: 2, localMinute: 30 }}
        initialContinuousWorkMinutes={50}
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByTestId("hshield-velocity-forecast-body")).toBeNull();
    expect(screen.getByTestId("hshield-late-night-collapsed-bar")).toBeTruthy();
    expect(screen.getByTestId("hshield-early-warnings-collapsed")).toBeTruthy();
    expect(screen.getByTestId("hshield-wrist-micro-break").getAttribute("data-visibility")).toBe(
      "collapsed_silent",
    );

    // 사용자가 원하면 '조용히 펼쳐 보기'로 수동 열람 가능
    fireEvent.click(screen.getByTestId("hshield-night-expand-btn"));
    expect(screen.getByTestId("hshield-velocity-forecast-body")).toBeTruthy();

    // 주간 시계 전환 시 정상 인라인 코칭과 손목 휴식 배지 복원
    fireEvent.click(screen.getByTestId("hshield-clock-day-btn"));
    expect(screen.getByTestId("hshield-wrist-micro-break").getAttribute("data-visibility")).toBe(
      "inline_badge",
    );
    expect(screen.getByTestId("hshield-early-warnings")).toBeTruthy();
  });

  it("11. 주간 화면에서 '02:30 심야 무음' 버튼 클릭 시 즉시 무음·접힘 모드로 전환된다", () => {
    render(<StudioHiatusShieldPanel localClock={{ localHour: 15, localMinute: 0 }} />);

    expect(screen.getByTestId("hshield-velocity-forecast-body")).toBeTruthy();
    fireEvent.click(screen.getByTestId("hshield-clock-night-btn"));

    expect(screen.queryByTestId("hshield-velocity-forecast-body")).toBeNull();
    expect(screen.getByTestId("hshield-late-night-collapsed-bar")).toBeTruthy();
    expect(screen.getByTestId("hshield-wrist-micro-break").getAttribute("data-visibility")).toBe(
      "collapsed_silent",
    );
  });
});
