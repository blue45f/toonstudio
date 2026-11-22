import { describe, expect, it } from "vitest";

import {
  STUDIO_REST_NUDGE_DEFAULTS,
  advanceStudioRestNudgeClock,
  createStudioRestNudgeState,
  dismissStudioRestNudge,
  formatStudioActiveMinutes,
  formatStudioRestCountdown,
  recordStudioDrawingActivity,
  snoozeStudioRestNudge,
  startStudioRestBreak,
  studioRestBreakRemainingMs,
  studioRestStretchTipKo,
  syncStudioRestNudgeConfig,
  triggerStudioRestNudgePreview,
} from "./studio-rest-nudge-timer";

const MINUTE = 60_000;
const SECOND = 1_000;

describe("studio-rest-nudge-timer", () => {
  it("60분 연속 드로잉이 지나기 전에는 조용히 대기하고 60분 시점에 1줄 넛지로 전환한다", () => {
    let now = 1_000_000;
    let state = createStudioRestNudgeState(now);
    expect(state.phase).toBe("drawing");
    expect(state.config.intervalMs).toBe(60 * MINUTE);

    // 2분 간격으로 꾸준히 작업해 58분까지 누적
    for (let step = 0; step < 29; step += 1) {
      now += 2 * MINUTE;
      state = recordStudioDrawingActivity(state, now);
      state = advanceStudioRestNudgeClock(state, now);
      expect(state.phase).toBe("drawing");
    }
    expect(formatStudioActiveMinutes(state.activeElapsedMs)).toBe(58);

    // 추가 2분 작업 → 60분 도달
    now += 2 * MINUTE;
    state = recordStudioDrawingActivity(state, now);
    state = advanceStudioRestNudgeClock(state, now);
    expect(state.phase).toBe("nudge");
    expect(formatStudioActiveMinutes(state.activeElapsedMs)).toBe(60);
  });

  it("3분 이상 손을 떼면 누적을 멈추고 10분 이상 쉬면 누적 타이머를 자연 초기화한다", () => {
    let now = 2_000_000;
    let state = createStudioRestNudgeState(now);

    // 2분 작업 누적
    now += 2 * MINUTE;
    state = recordStudioDrawingActivity(state, now);
    state = advanceStudioRestNudgeClock(state, now);
    expect(state.activeElapsedMs).toBe(2 * MINUTE);

    // 5분간 입력 없음: idlePauseMs(3분)까지만 반영되고 나머지 2분은 누적되지 않는다.
    now += 5 * MINUTE;
    state = advanceStudioRestNudgeClock(state, now);
    expect(state.phase).toBe("drawing");
    expect(state.activeElapsedMs).toBe(2 * MINUTE + STUDIO_REST_NUDGE_DEFAULTS.idlePauseMs);

    // 총 10분 이상 공백이 지나면 이미 충분히 쉰 것으로 보고 0으로 초기화된다.
    now += 6 * MINUTE;
    state = advanceStudioRestNudgeClock(state, now);
    expect(state.activeElapsedMs).toBe(0);
    expect(state.phase).toBe("drawing");
  });

  it("'1분 쉬기'를 누르면 60초 카운트다운 후 완료 안내를 거쳐 새 사이클로 복귀한다", () => {
    let now = 3_000_000;
    let state = triggerStudioRestNudgePreview(createStudioRestNudgeState(now), now);
    expect(state.phase).toBe("nudge");
    const firstTip = studioRestStretchTipKo(state);

    state = startStudioRestBreak(state, now);
    expect(state.phase).toBe("resting");
    expect(formatStudioRestCountdown(studioRestBreakRemainingMs(state, now))).toBe("01:00");

    now += 15 * SECOND;
    state = advanceStudioRestNudgeClock(state, now);
    expect(state.phase).toBe("resting");
    expect(formatStudioRestCountdown(studioRestBreakRemainingMs(state, now))).toBe("00:45");

    now += 45 * SECOND;
    state = advanceStudioRestNudgeClock(state, now);
    expect(state.phase).toBe("completed");
    expect(state.completedBreakCount).toBe(1);
    expect(state.activeElapsedMs).toBe(0);
    expect(studioRestStretchTipKo(state)).not.toBe(firstTip);

    // 완료 안내 자동 해제(4초) 후 drawing 단계로 조용히 복귀
    now += STUDIO_REST_NUDGE_DEFAULTS.completedBannerMs;
    state = advanceStudioRestNudgeClock(state, now);
    expect(state.phase).toBe("drawing");
  });

  it("'15분 뒤 다시'를 누르면 15분 동안 조용히 숨겼다가 다시 넛지를 띄운다", () => {
    let now = 4_000_000;
    let state = triggerStudioRestNudgePreview(createStudioRestNudgeState(now), now);

    state = snoozeStudioRestNudge(state, now);
    expect(state.phase).toBe("snoozed");

    now += 14 * MINUTE + 59 * SECOND;
    state = advanceStudioRestNudgeClock(state, now);
    expect(state.phase).toBe("snoozed");

    now += 1 * SECOND;
    state = advanceStudioRestNudgeClock(state, now);
    expect(state.phase).toBe("nudge");
  });

  it("닫기와 비활성화 전환이 즉시 drawing 상태로 정리된다", () => {
    const now = 5_000_000;
    const nudged = triggerStudioRestNudgePreview(createStudioRestNudgeState(now), now);
    const dismissed = dismissStudioRestNudge(nudged, now + 500);
    expect(dismissed.phase).toBe("drawing");
    expect(dismissed.activeElapsedMs).toBe(0);

    const disabled = syncStudioRestNudgeConfig(nudged, { enabled: false }, now + 1000);
    expect(disabled.phase).toBe("drawing");
    expect(disabled.config.enabled).toBe(false);
  });
});
