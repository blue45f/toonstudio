/**
 * 60분 연속 드로잉 손목·눈 스트레칭 비침습 넛지 타이머 엔진.
 *
 * - 순수 상태 전이 함수로만 구성해 시간 주입 테스트가 결정적으로 동작한다.
 * - 모달로 작업을 끊지 않고, 연속 작업 시간이 기준(기본 60분)에 도달하면
 *   조용한 1줄 알림(`nudge`)과 "1분 쉬기"(`resting`) / "15분 뒤 다시"(`snoozed`) 전환을 제공한다.
 * - 3분 이상 입력이 없으면 누적을 멈추고, 10분 이상 충분히 쉬었으면 자연스럽게 새 사이클로 초기화한다.
 */
import {
  DEFAULT_STUDIO_REST_BREAK_SECONDS,
  DEFAULT_STUDIO_REST_INTERVAL_MINUTES,
  DEFAULT_STUDIO_REST_SNOOZE_MINUTES,
} from "./studio-ergonomics-preferences";

export type StudioRestNudgePhase =
  | "drawing"
  | "nudge"
  | "resting"
  | "snoozed"
  | "completed";

export interface StudioRestNudgeConfig {
  readonly enabled: boolean;
  readonly intervalMs: number;
  readonly breakDurationMs: number;
  readonly snoozeDurationMs: number;
  readonly idlePauseMs: number;
  readonly idleResetMs: number;
  readonly completedBannerMs: number;
}

export interface StudioRestNudgeState {
  readonly phase: StudioRestNudgePhase;
  readonly config: StudioRestNudgeConfig;
  /** 현재 연속 작업 누적 시간(ms). */
  readonly activeElapsedMs: number;
  readonly lastTickAtMs: number;
  readonly lastActivityAtMs: number;
  /** `resting` 단계 종료 시각(ms). */
  readonly breakEndsAtMs: number | null;
  /** `snoozed` 단계 재알림 시각(ms). */
  readonly snoozeUntilMs: number | null;
  /** `completed` 안내 자동 해제 시각(ms). */
  readonly completedUntilMs: number | null;
  readonly completedBreakCount: number;
  readonly stretchTipIndex: number;
}

export const STUDIO_REST_NUDGE_DEFAULTS: StudioRestNudgeConfig = Object.freeze({
  enabled: true,
  intervalMs: DEFAULT_STUDIO_REST_INTERVAL_MINUTES * 60 * 1000,
  breakDurationMs: DEFAULT_STUDIO_REST_BREAK_SECONDS * 1000,
  snoozeDurationMs: DEFAULT_STUDIO_REST_SNOOZE_MINUTES * 60 * 1000,
  idlePauseMs: 3 * 60 * 1000,
  idleResetMs: 10 * 60 * 1000,
  completedBannerMs: 4 * 1000,
});

/** 비의료·일상 리프레시 톤의 짧은 손목·눈 스트레칭 안내 문구. */
export const STUDIO_REST_STRETCH_TIPS_KO: readonly string[] = Object.freeze([
  "손목을 천천히 5회 돌리고 먼 곳을 20초 바라보세요.",
  "손가락을 쭉 폈다 쥐기를 5회 반복하고 어깨 힘을 풀어 주세요.",
  "펜을 잠시 내려놓고 눈을 10초 감은 뒤 천천히 숨을 고르세요.",
]);

export function resolveStudioRestNudgeConfig(
  overrides?: Partial<StudioRestNudgeConfig>,
): StudioRestNudgeConfig {
  return {
    enabled: overrides?.enabled ?? STUDIO_REST_NUDGE_DEFAULTS.enabled,
    intervalMs: Math.max(
      60_000,
      Math.round(overrides?.intervalMs ?? STUDIO_REST_NUDGE_DEFAULTS.intervalMs),
    ),
    breakDurationMs: Math.max(
      10_000,
      Math.round(overrides?.breakDurationMs ?? STUDIO_REST_NUDGE_DEFAULTS.breakDurationMs),
    ),
    snoozeDurationMs: Math.max(
      60_000,
      Math.round(overrides?.snoozeDurationMs ?? STUDIO_REST_NUDGE_DEFAULTS.snoozeDurationMs),
    ),
    idlePauseMs: Math.max(
      30_000,
      Math.round(overrides?.idlePauseMs ?? STUDIO_REST_NUDGE_DEFAULTS.idlePauseMs),
    ),
    idleResetMs: Math.max(
      60_000,
      Math.round(overrides?.idleResetMs ?? STUDIO_REST_NUDGE_DEFAULTS.idleResetMs),
    ),
    completedBannerMs: Math.max(
      1_000,
      Math.round(overrides?.completedBannerMs ?? STUDIO_REST_NUDGE_DEFAULTS.completedBannerMs),
    ),
  };
}

export function createStudioRestNudgeState(
  nowMs: number,
  overrides?: Partial<StudioRestNudgeConfig>,
): StudioRestNudgeState {
  const safeNow = Number.isFinite(nowMs) ? nowMs : 0;
  return {
    phase: "drawing",
    config: resolveStudioRestNudgeConfig(overrides),
    activeElapsedMs: 0,
    lastTickAtMs: safeNow,
    lastActivityAtMs: safeNow,
    breakEndsAtMs: null,
    snoozeUntilMs: null,
    completedUntilMs: null,
    completedBreakCount: 0,
    stretchTipIndex: 0,
  };
}

export function syncStudioRestNudgeConfig(
  state: StudioRestNudgeState,
  overrides: Partial<StudioRestNudgeConfig>,
  nowMs: number,
): StudioRestNudgeState {
  const nextConfig = resolveStudioRestNudgeConfig({ ...state.config, ...overrides });
  if (!nextConfig.enabled) {
    return {
      ...state,
      phase: "drawing",
      config: nextConfig,
      lastTickAtMs: nowMs,
      breakEndsAtMs: null,
      snoozeUntilMs: null,
      completedUntilMs: null,
    };
  }
  return {
    ...state,
    config: nextConfig,
  };
}

export function recordStudioDrawingActivity(
  state: StudioRestNudgeState,
  nowMs: number,
): StudioRestNudgeState {
  const safeNow = Math.max(state.lastTickAtMs, nowMs);
  const idleGapMs = safeNow - state.lastActivityAtMs;

  // 휴식 중이나 알림 표시 중에는 사용자 선택을 존중해 활동 기록만 갱신한다.
  if (state.phase === "resting" || state.phase === "nudge") {
    return { ...state, lastActivityAtMs: safeNow };
  }

  if (state.phase === "completed") {
    return {
      ...state,
      phase: "drawing",
      activeElapsedMs: 0,
      lastTickAtMs: safeNow,
      lastActivityAtMs: safeNow,
      completedUntilMs: null,
    };
  }

  // 10분 이상 쉬고 돌아왔다면 이미 휴식한 것으로 보고 연속 작업 누적을 초기화한다.
  if (idleGapMs >= state.config.idleResetMs) {
    return {
      ...state,
      phase: "drawing",
      activeElapsedMs: 0,
      lastTickAtMs: safeNow,
      lastActivityAtMs: safeNow,
      snoozeUntilMs: null,
    };
  }

  return {
    ...state,
    lastActivityAtMs: safeNow,
  };
}

export function advanceStudioRestNudgeClock(
  state: StudioRestNudgeState,
  nowMs: number,
): StudioRestNudgeState {
  const safeNow = Math.max(state.lastTickAtMs, nowMs);
  const deltaMs = safeNow - state.lastTickAtMs;

  if (!state.config.enabled) {
    return { ...state, phase: "drawing", lastTickAtMs: safeNow };
  }

  if (state.phase === "resting") {
    if (state.breakEndsAtMs !== null && safeNow >= state.breakEndsAtMs) {
      return {
        ...state,
        phase: "completed",
        activeElapsedMs: 0,
        lastTickAtMs: safeNow,
        lastActivityAtMs: safeNow,
        breakEndsAtMs: null,
        snoozeUntilMs: null,
        completedUntilMs: safeNow + state.config.completedBannerMs,
        completedBreakCount: state.completedBreakCount + 1,
        stretchTipIndex: (state.stretchTipIndex + 1) % STUDIO_REST_STRETCH_TIPS_KO.length,
      };
    }
    return { ...state, lastTickAtMs: safeNow };
  }

  if (state.phase === "completed") {
    if (state.completedUntilMs !== null && safeNow >= state.completedUntilMs) {
      return {
        ...state,
        phase: "drawing",
        activeElapsedMs: 0,
        lastTickAtMs: safeNow,
        lastActivityAtMs: safeNow,
        completedUntilMs: null,
      };
    }
    return { ...state, lastTickAtMs: safeNow };
  }

  if (state.phase === "snoozed") {
    if (state.snoozeUntilMs !== null && safeNow >= state.snoozeUntilMs) {
      return {
        ...state,
        phase: "nudge",
        lastTickAtMs: safeNow,
        snoozeUntilMs: null,
      };
    }
    return { ...state, lastTickAtMs: safeNow };
  }

  if (state.phase === "nudge") {
    return { ...state, lastTickAtMs: safeNow };
  }

  // `drawing` 단계: 직전 활동 이후 idlePauseMs 이내 구간만 연속 작업 시간에 합산한다.
  const activeWindowEndMs = state.lastActivityAtMs + state.config.idlePauseMs;
  const activeDeltaMs = Math.max(
    0,
    Math.min(safeNow, activeWindowEndMs) - state.lastTickAtMs,
  );
  const idleSinceActivityMs = safeNow - state.lastActivityAtMs;

  if (idleSinceActivityMs >= state.config.idleResetMs) {
    return {
      ...state,
      activeElapsedMs: 0,
      lastTickAtMs: safeNow,
    };
  }

  const nextElapsedMs = state.activeElapsedMs + (deltaMs > 0 ? activeDeltaMs : 0);
  if (nextElapsedMs >= state.config.intervalMs) {
    return {
      ...state,
      phase: "nudge",
      activeElapsedMs: nextElapsedMs,
      lastTickAtMs: safeNow,
    };
  }

  return {
    ...state,
    activeElapsedMs: nextElapsedMs,
    lastTickAtMs: safeNow,
  };
}

export function startStudioRestBreak(
  state: StudioRestNudgeState,
  nowMs: number,
): StudioRestNudgeState {
  const safeNow = Math.max(state.lastTickAtMs, nowMs);
  return {
    ...state,
    phase: "resting",
    lastTickAtMs: safeNow,
    breakEndsAtMs: safeNow + state.config.breakDurationMs,
    snoozeUntilMs: null,
    completedUntilMs: null,
  };
}

export function snoozeStudioRestNudge(
  state: StudioRestNudgeState,
  nowMs: number,
): StudioRestNudgeState {
  const safeNow = Math.max(state.lastTickAtMs, nowMs);
  return {
    ...state,
    phase: "snoozed",
    lastTickAtMs: safeNow,
    breakEndsAtMs: null,
    snoozeUntilMs: safeNow + state.config.snoozeDurationMs,
    completedUntilMs: null,
  };
}

export function dismissStudioRestNudge(
  state: StudioRestNudgeState,
  nowMs: number,
): StudioRestNudgeState {
  const safeNow = Math.max(state.lastTickAtMs, nowMs);
  return {
    ...state,
    phase: "drawing",
    activeElapsedMs: 0,
    lastTickAtMs: safeNow,
    lastActivityAtMs: safeNow,
    breakEndsAtMs: null,
    snoozeUntilMs: null,
    completedUntilMs: null,
  };
}

export function triggerStudioRestNudgePreview(
  state: StudioRestNudgeState,
  nowMs: number,
): StudioRestNudgeState {
  const safeNow = Math.max(state.lastTickAtMs, nowMs);
  return {
    ...state,
    phase: "nudge",
    activeElapsedMs: Math.max(state.activeElapsedMs, state.config.intervalMs),
    lastTickAtMs: safeNow,
    lastActivityAtMs: safeNow,
    breakEndsAtMs: null,
    snoozeUntilMs: null,
    completedUntilMs: null,
  };
}

export function studioRestBreakRemainingMs(
  state: StudioRestNudgeState,
  nowMs: number,
): number {
  if (state.phase !== "resting" || state.breakEndsAtMs === null) return 0;
  return Math.max(0, state.breakEndsAtMs - nowMs);
}

export function studioRestStretchTipKo(state: StudioRestNudgeState): string {
  const index = Math.abs(state.stretchTipIndex) % STUDIO_REST_STRETCH_TIPS_KO.length;
  return STUDIO_REST_STRETCH_TIPS_KO[index] ?? STUDIO_REST_STRETCH_TIPS_KO[0] ?? "";
}

export function formatStudioRestCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatStudioActiveMinutes(elapsedMs: number): number {
  return Math.max(1, Math.round(Math.max(0, elapsedMs) / 60_000));
}
