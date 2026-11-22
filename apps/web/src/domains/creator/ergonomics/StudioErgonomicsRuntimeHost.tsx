/**
 * 스튜디오 인체공학 런타임 호스트 (지연 로드 경계).
 *
 * - `StudioCuttoonEditorView`에서 `lazy()`로 마운트되어 진입 정적 번들 그래프를 늘리지 않는다.
 * - `#studio-app-shell`에 `data-studio-handedness` 및 `data-studio-night-comfort` 속성을 실시간 동기화한다.
 * - 채색·스포이드·컬러 휠·색보정·내보내기 진입 시 야간 색온도를 자동으로 중립(6500K) 복귀시킨다.
 * - 연속 드로잉 60분 경과 시 비침습 1줄 휴식 넛지 바(`StudioRestNudgeBar`)만 조용히 노출한다.
 */
import { useEffect, useMemo, useRef, useState, type ReactElement, type RefObject } from "react";

import {
  applyStudioHandednessToElement,
  clearStudioHandednessFromElement,
  subscribeStudioRestNudgePreview,
  useStudioErgonomicsPreferences,
} from "./studio-ergonomics-preferences";
import {
  applyStudioNightComfortToElement,
  clearStudioNightComfortFromElement,
  evaluateStudioNightComfortGuard,
  type StudioNightComfortContext,
} from "./studio-night-comfort-guard";
import {
  advanceStudioRestNudgeClock,
  createStudioRestNudgeState,
  dismissStudioRestNudge,
  recordStudioDrawingActivity,
  resolveStudioRestNudgeConfig,
  snoozeStudioRestNudge,
  startStudioRestBreak,
  syncStudioRestNudgeConfig,
  triggerStudioRestNudgePreview,
  type StudioRestNudgeState,
} from "./studio-rest-nudge-timer";
import { StudioRestNudgeBar } from "./StudioRestNudgeBar";

import "./studio-ergonomics.css";

export interface StudioErgonomicsRuntimeHostProps {
  readonly studioRootRef?: RefObject<HTMLDivElement | null>;
  readonly workMode?: string | null;
  readonly tool?: string | null;
  readonly drawMode?: string | null;
  readonly eyedropperActive?: boolean;
  readonly colorWheelOpen?: boolean;
  readonly colorRangePickActive?: boolean;
  readonly pageGradePanelOpen?: boolean;
  readonly advancedFillActive?: boolean;
  readonly wetMixActive?: boolean;
  readonly dodgeBurnActive?: boolean;
  readonly isExporting?: boolean;
  readonly exportMenuOpen?: boolean;
  readonly colorBlindPreview?: string | null;
  readonly activeMenu?: string | null;
  readonly canvasOnlyMode?: boolean;
  readonly reduceMotion?: boolean;
}

const ACTIVITY_RECORD_THROTTLE_MS = 15_000;

export function StudioErgonomicsRuntimeHost({
  studioRootRef,
  workMode,
  tool,
  drawMode,
  eyedropperActive,
  colorWheelOpen,
  colorRangePickActive,
  pageGradePanelOpen,
  advancedFillActive,
  wetMixActive,
  dodgeBurnActive,
  isExporting,
  exportMenuOpen,
  colorBlindPreview,
  activeMenu,
  canvasOnlyMode = false,
  reduceMotion = false,
}: StudioErgonomicsRuntimeHostProps): ReactElement {
  const prefs = useStudioErgonomicsPreferences();

  const nightContext = useMemo<StudioNightComfortContext>(
    () => ({
      workMode,
      tool,
      drawMode,
      eyedropperActive,
      colorWheelOpen,
      colorRangePickActive,
      pageGradePanelOpen,
      advancedFillActive,
      wetMixActive,
      dodgeBurnActive,
      isExporting,
      exportMenuOpen,
      colorBlindPreview,
      activeMenu,
    }),
    [
      activeMenu,
      advancedFillActive,
      colorBlindPreview,
      colorRangePickActive,
      colorWheelOpen,
      dodgeBurnActive,
      drawMode,
      eyedropperActive,
      exportMenuOpen,
      isExporting,
      pageGradePanelOpen,
      tool,
      wetMixActive,
      workMode,
    ],
  );

  const nightEvaluation = useMemo(
    () => evaluateStudioNightComfortGuard(prefs, nightContext),
    [prefs, nightContext],
  );

  const restConfig = useMemo(
    () =>
      resolveStudioRestNudgeConfig({
        enabled: prefs.restNudgeEnabled,
        intervalMs: prefs.restNudgeIntervalMinutes * 60_000,
        breakDurationMs: prefs.restBreakDurationSeconds * 1000,
        snoozeDurationMs: prefs.restSnoozeMinutes * 60_000,
      }),
    [
      prefs.restBreakDurationSeconds,
      prefs.restNudgeEnabled,
      prefs.restNudgeIntervalMinutes,
      prefs.restSnoozeMinutes,
    ],
  );

  const [restState, setRestState] = useState<StudioRestNudgeState>(() =>
    createStudioRestNudgeState(Date.now(), restConfig),
  );
  const [clockNowMs, setClockNowMs] = useState<number>(() => Date.now());
  const lastActivityPingRef = useRef<number>(0);

  const effectiveRestState = useMemo(
    () => syncStudioRestNudgeConfig(restState, restConfig, restState.lastTickAtMs),
    [restConfig, restState],
  );

  // 1) 왼손잡이 미러 속성(`data-studio-handedness`) 및 레이아웃 토큰 동기화
  useEffect(() => {
    const target = studioRootRef?.current
      ?? (typeof document === "undefined" ? null : document.getElementById("studio-app-shell"));
    applyStudioHandednessToElement(target, prefs.handedness);
    return () => {
      clearStudioHandednessFromElement(target);
    };
  }, [prefs.handedness, studioRootRef]);

  // 2) 야간 색온도 가드(`data-studio-night-comfort`) 동기화
  useEffect(() => {
    const target = studioRootRef?.current
      ?? (typeof document === "undefined" ? null : document.getElementById("studio-app-shell"));
    applyStudioNightComfortToElement(target, nightEvaluation);
    return () => {
      clearStudioNightComfortFromElement(target);
    };
  }, [nightEvaluation, studioRootRef]);

  // 3) 설정 패널에서 미리보기 요청 시 실시간 바에도 즉시 표시
  useEffect(() => {
    return subscribeStudioRestNudgePreview(() => {
      const now = Date.now();
      setClockNowMs(now);
      setRestState((current) =>
        triggerStudioRestNudgePreview(syncStudioRestNudgeConfig(current, restConfig, now), now),
      );
    });
  }, [restConfig]);

  // 4) 수동(passive) 입력 감지로 드로잉 핫패스에 영향을 주지 않고 연속 작업 시간 추적
  useEffect(() => {
    if (!restConfig.enabled) return;
    const target = studioRootRef?.current
      ?? (typeof document === "undefined" ? null : document.getElementById("studio-app-shell"));
    if (!target) return;

    const recordPing = (): void => {
      const now = Date.now();
      if (now - lastActivityPingRef.current < ACTIVITY_RECORD_THROTTLE_MS) return;
      lastActivityPingRef.current = now;
      setRestState((current) =>
        recordStudioDrawingActivity(syncStudioRestNudgeConfig(current, restConfig, now), now),
      );
    };

    target.addEventListener("pointerdown", recordPing, { passive: true });
    target.addEventListener("keydown", recordPing, { passive: true });
    return () => {
      target.removeEventListener("pointerdown", recordPing);
      target.removeEventListener("keydown", recordPing);
    };
  }, [restConfig, studioRootRef]);

  // 5) 타이머 틱: 휴식 카운트다운 중에는 1초, 일반 작업 중에는 15초 간격으로 경량 갱신
  useEffect(() => {
    if (!restConfig.enabled) return;
    const intervalMs = effectiveRestState.phase === "resting" || effectiveRestState.phase === "completed"
      ? 1_000
      : 15_000;
    const timerId = globalThis.setInterval(() => {
      const now = Date.now();
      setClockNowMs(now);
      setRestState((current) =>
        advanceStudioRestNudgeClock(syncStudioRestNudgeConfig(current, restConfig, now), now),
      );
    }, intervalMs);
    return () => globalThis.clearInterval(timerId);
  }, [effectiveRestState.phase, restConfig]);

  const showRestBar = !isExporting && (!canvasOnlyMode || effectiveRestState.phase === "resting");

  return (
    <>
      <span
        className="sr-only"
        role="status"
        aria-live="polite"
        data-studio-night-comfort-announcement={nightEvaluation.mode}
      >
        {nightEvaluation.mode === "paused-color-critical" ? nightEvaluation.statusDetailKo : ""}
      </span>
      {showRestBar ? (
        <StudioRestNudgeBar
          state={effectiveRestState}
          nowMs={clockNowMs}
          placement="floating"
          reduceMotion={reduceMotion}
          onStartBreak={() => {
            const now = Date.now();
            setClockNowMs(now);
            setRestState((current) =>
              startStudioRestBreak(syncStudioRestNudgeConfig(current, restConfig, now), now),
            );
          }}
          onSnooze={() => {
            const now = Date.now();
            setClockNowMs(now);
            setRestState((current) =>
              snoozeStudioRestNudge(syncStudioRestNudgeConfig(current, restConfig, now), now),
            );
          }}
          onDismiss={() => {
            const now = Date.now();
            setClockNowMs(now);
            setRestState((current) =>
              dismissStudioRestNudge(syncStudioRestNudgeConfig(current, restConfig, now), now),
            );
          }}
        />
      ) : null}
    </>
  );
}
