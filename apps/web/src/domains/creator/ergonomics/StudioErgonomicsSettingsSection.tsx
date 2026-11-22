/**
 * 스튜디오 인체공학 설정 섹션 (`Calm Atelier`).
 *
 * - 왼손잡이·태블릿 미러 UI 원터치 전환 (`data-studio-handedness`)
 * - 야간 색온도 아이-컴포트 가드 (채색·스포이드·내보내기 시 자동 중립 복귀)
 * - 60분 연속 드로잉 손목·눈 스트레칭 비침습 넛지 타이머 및 인라인 미리보기
 *
 * PR #2863 수정 파일과 충돌하지 않도록 설정 홈(`StudioAppSettingsPanel`)과
 * 일반 설정 편집기(`StudioAppSettingsEditor`)에만 깔끔하게 연결한다.
 */
import { Coffee, Hand, MoonStar, RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useState, type ReactElement } from "react";

import {
  STUDIO_NIGHT_COMFORT_PRESETS,
  STUDIO_REST_INTERVAL_PRESET_MINUTES,
  requestStudioRestNudgePreview,
  resetStudioErgonomicsPreferences,
  resolveStudioHandednessLayoutTokens,
  setStudioHandednessPreference,
  updateStudioErgonomicsPreferences,
  useStudioErgonomicsPreferences,
  type StudioHandedness,
  type StudioNightComfortPreset,
} from "./studio-ergonomics-preferences";
import {
  evaluateStudioNightComfortGuard,
  studioNightComfortPresetLabel,
} from "./studio-night-comfort-guard";
import {
  advanceStudioRestNudgeClock,
  createStudioRestNudgeState,
  dismissStudioRestNudge,
  snoozeStudioRestNudge,
  startStudioRestBreak,
  triggerStudioRestNudgePreview,
  type StudioRestNudgeState,
} from "./studio-rest-nudge-timer";
import { StudioRestNudgeBar } from "./StudioRestNudgeBar";

import { cn } from "@/shared/lib/utils";

import "./studio-ergonomics.css";

export interface StudioErgonomicsSettingsSectionProps {
  /** 세부 설정 탭 안에서 좁게 표시할 때 true. */
  readonly compact?: boolean;
  readonly reduceMotion?: boolean;
}

const HANDEDNESS_OPTIONS: readonly {
  readonly id: StudioHandedness;
  readonly label: string;
}[] = [
  { id: "right-handed", label: "오른손 기본" },
  { id: "left-handed", label: "왼손잡이 미러" },
];

const NIGHT_COMFORT_DESCRIPTIONS: Readonly<Record<StudioNightComfortPreset, string>> = {
  off: "표준 중립 색온도(6500K)",
  gentle: "은은한 난색 크롬(~4800K)",
  amber: "깊은 야간 난색 크롬(~3900K)",
};

export function StudioErgonomicsSettingsSection({
  compact = false,
  reduceMotion = false,
}: StudioErgonomicsSettingsSectionProps): ReactElement {
  const prefs = useStudioErgonomicsPreferences();
  const layoutTokens = resolveStudioHandednessLayoutTokens(prefs.handedness);
  const nightIdleEvaluation = evaluateStudioNightComfortGuard(prefs, null);
  const nightColorGuardEvaluation = evaluateStudioNightComfortGuard(prefs, {
    eyedropperActive: true,
  });

  const [previewState, setPreviewState] = useState<StudioRestNudgeState | null>(null);
  const [previewNowMs, setPreviewNowMs] = useState<number>(0);

  useEffect(() => {
    if (!previewState || (previewState.phase !== "resting" && previewState.phase !== "completed")) {
      return;
    }
    const timerId = globalThis.setInterval(() => {
      const now = Date.now();
      setPreviewNowMs(now);
      setPreviewState((current) => (current ? advanceStudioRestNudgeClock(current, now) : null));
    }, 1000);
    return () => globalThis.clearInterval(timerId);
  }, [previewState]);

  const handleOpenPreview = (): void => {
    const now = Date.now();
    const seeded = triggerStudioRestNudgePreview(
      createStudioRestNudgeState(now, {
        enabled: true,
        intervalMs: prefs.restNudgeIntervalMinutes * 60_000,
        breakDurationMs: prefs.restBreakDurationSeconds * 1000,
        snoozeDurationMs: prefs.restSnoozeMinutes * 60_000,
      }),
      now,
    );
    setPreviewNowMs(now);
    setPreviewState(seeded);
    requestStudioRestNudgePreview();
  };

  const chipClass = (active: boolean): string =>
    cn(
      "studio-ergonomics-touch-target inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border px-3 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
      active
        ? "border-accent bg-accent text-on-accent"
        : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
    );

  return (
    <section
      aria-label="작업 편의 · 왼손잡이 미러 · 눈과 손목 보호"
      data-studio-ergonomics-settings="true"
      data-studio-handedness-preview={prefs.handedness}
      className={cn(
        "rounded-2xl border border-line bg-card/35",
        compact ? "space-y-3.5 p-3" : "space-y-4 p-4",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-fg">
            왼손잡이 미러 · 야간 색온도 가드 · 손목 휴식 넛지
          </h3>
          <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
            태블릿·장시간 작업에 맞춰 도구 방향과 눈·손목 부담을 즉시 조정합니다. 캔버스 82%+ 공간은 그대로 지킵니다.
          </p>
        </div>
        <button
          type="button"
          data-studio-ergonomics-reset="true"
          onClick={() => {
            resetStudioErgonomicsPreferences();
            setPreviewState(null);
          }}
          className="studio-ergonomics-touch-target inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-xl border border-line bg-panel px-3 text-xs font-medium text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          기본값
        </button>
      </div>

      <div className={cn("grid gap-3", !compact && "lg:grid-cols-3")}>
        {/* 1. 왼손잡이·태블릿 미러 UI 원터치 전환 */}
        <article className="flex flex-col justify-between gap-3 rounded-xl border border-line bg-panel p-3">
          <div>
            <div className="flex items-center gap-2">
              <Hand className="size-4 text-accent" aria-hidden />
              <h4 className="text-xs font-semibold text-fg">왼손잡이·태블릿 미러 UI</h4>
            </div>
            <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
              도구 막대와 보조 패널 좌우 배치를 한 번에 뒤집어 손바닥 오입력을 줄입니다.
            </p>
          </div>
          <div className="space-y-2">
            <div
              role="group"
              aria-label="왼손잡이 미러 방향 선택"
              className="flex flex-wrap gap-1.5"
            >
              {HANDEDNESS_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  data-studio-ergonomics-handedness-option={option.id}
                  aria-pressed={prefs.handedness === option.id}
                  onClick={() => setStudioHandednessPreference(option.id)}
                  className={chipClass(prefs.handedness === option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p
              data-studio-ergonomics-handedness-summary="true"
              className="rounded-lg border border-line bg-card/70 px-2.5 py-1.5 text-[0.66rem] text-fg-2"
            >
              {layoutTokens.summaryKo}
            </p>
          </div>
        </article>

        {/* 2. 야간 색온도 아이-컴포트 가드 */}
        <article className="flex flex-col justify-between gap-3 rounded-xl border border-line bg-panel p-3">
          <div>
            <div className="flex items-center gap-2">
              <MoonStar className="size-4 text-accent" aria-hidden />
              <h4 className="text-xs font-semibold text-fg">야간 색온도 가드</h4>
            </div>
            <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
              UI 크롬에만 은은한 난색을 적용합니다. 캔버스 원본 색은 바꾸지 않습니다.
            </p>
          </div>
          <div className="space-y-2">
            <div
              role="group"
              aria-label="야간 색온도 강도 선택"
              className="flex flex-wrap gap-1.5"
            >
              {STUDIO_NIGHT_COMFORT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  data-studio-ergonomics-night-preset={preset}
                  aria-pressed={prefs.nightComfortPreset === preset}
                  title={NIGHT_COMFORT_DESCRIPTIONS[preset]}
                  onClick={() => updateStudioErgonomicsPreferences({ nightComfortPreset: preset })}
                  className={chipClass(prefs.nightComfortPreset === preset)}
                >
                  {studioNightComfortPresetLabel(preset)}
                </button>
              ))}
            </div>
            <button
              type="button"
              data-studio-ergonomics-color-guard-toggle="true"
              aria-pressed={prefs.autoPauseNightComfortForColorCritical}
              onClick={() =>
                updateStudioErgonomicsPreferences({
                  autoPauseNightComfortForColorCritical: !prefs.autoPauseNightComfortForColorCritical,
                })
              }
              className={cn(
                "studio-ergonomics-touch-target flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-[0.68rem] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                prefs.autoPauseNightComfortForColorCritical
                  ? "border-accent/45 bg-accent-soft text-fg"
                  : "border-line bg-card text-fg-2 hover:bg-raised",
              )}
            >
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 shrink-0 text-accent" aria-hidden />
                채색·스포이드·내보내기 시 자동 중립 복귀
              </span>
              <span className="shrink-0 font-semibold">
                {prefs.autoPauseNightComfortForColorCritical ? "켜짐" : "꺼짐"}
              </span>
            </button>
            <p
              data-studio-ergonomics-night-status="true"
              className="rounded-lg border border-line bg-card/70 px-2.5 py-1.5 text-[0.66rem] text-fg-2"
            >
              {prefs.nightComfortPreset === "off"
                ? nightIdleEvaluation.statusLabelKo
                : prefs.autoPauseNightComfortForColorCritical
                  ? `${nightIdleEvaluation.statusLabelKo} · 채색 진입 시 ${nightColorGuardEvaluation.approxKelvin}K 자동 복귀`
                  : `${nightIdleEvaluation.statusLabelKo} · 캔버스 원본 색 유지`}
            </p>
          </div>
        </article>

        {/* 3. 60분 연속 드로잉 손목·눈 휴식 넛지 */}
        <article className="flex flex-col justify-between gap-3 rounded-xl border border-line bg-panel p-3">
          <div>
            <div className="flex items-center gap-2">
              <Coffee className="size-4 text-accent" aria-hidden />
              <h4 className="text-xs font-semibold text-fg">연속 작업 손목·눈 휴식 넛지</h4>
            </div>
            <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
              모달로 흐름을 끊지 않고 조용한 1줄 알림으로 1분 스트레칭 또는 15분 연기를 제안합니다.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                data-studio-ergonomics-rest-toggle="true"
                aria-pressed={prefs.restNudgeEnabled}
                onClick={() =>
                  updateStudioErgonomicsPreferences({
                    restNudgeEnabled: !prefs.restNudgeEnabled,
                  })
                }
                className={chipClass(prefs.restNudgeEnabled)}
              >
                {prefs.restNudgeEnabled ? "알림 켜짐" : "알림 꺼짐"}
              </button>
              <div
                role="group"
                aria-label="휴식 알림 주기 선택"
                className="flex flex-wrap gap-1"
              >
                {STUDIO_REST_INTERVAL_PRESET_MINUTES.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    disabled={!prefs.restNudgeEnabled}
                    data-studio-ergonomics-rest-interval={minutes}
                    aria-pressed={prefs.restNudgeIntervalMinutes === minutes}
                    onClick={() =>
                      updateStudioErgonomicsPreferences({
                        restNudgeIntervalMinutes: minutes,
                      })
                    }
                    className={cn(
                      chipClass(prefs.restNudgeIntervalMinutes === minutes),
                      "disabled:cursor-not-allowed disabled:opacity-45",
                    )}
                  >
                    {minutes}분
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              data-studio-ergonomics-rest-preview="true"
              onClick={handleOpenPreview}
              className="studio-ergonomics-touch-target inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-line bg-card px-3 text-xs font-medium text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              휴식 알림 1줄 미리보기
            </button>
          </div>
        </article>
      </div>

      {previewState ? (
        <div data-studio-ergonomics-rest-preview-host="true">
          <StudioRestNudgeBar
            state={previewState}
            nowMs={previewNowMs}
            placement="inline"
            reduceMotion={reduceMotion}
            onStartBreak={() => {
              const now = Date.now();
              setPreviewNowMs(now);
              setPreviewState((current) => (current ? startStudioRestBreak(current, now) : null));
            }}
            onSnooze={() => {
              const now = Date.now();
              setPreviewNowMs(now);
              setPreviewState((current) => {
                if (!current) return null;
                snoozeStudioRestNudge(current, now);
                return null;
              });
            }}
            onDismiss={() => {
              const now = Date.now();
              setPreviewNowMs(now);
              setPreviewState((current) => {
                if (!current) return null;
                dismissStudioRestNudge(current, now);
                return null;
              });
            }}
          />
        </div>
      ) : null}
    </section>
  );
}
