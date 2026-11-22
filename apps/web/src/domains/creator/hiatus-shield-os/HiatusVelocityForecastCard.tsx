/**
 * ₩0 로컬 주간 컷 속도 이동평균(SMA/EMA) 3주 전 휴재 위험 조기 예측 카드,
 * 50분 연속 작업 비차단 1줄 손목 휴식 마이크로 브레이크 배지,
 * 00:00~06:00 심야 마감 무음·접힘 자동 억제 UI.
 */

import {
  ChevronDown,
  ChevronUp,
  Clock,
  Hand,
  Moon,
  Sun,
  TrendingDown,
} from "lucide-react";
import { useState } from "react";

import {
  type DeterministicLocalClock,
  type HiatusCoachingSurfaceState,
  type ThreeWeekHiatusForecast,
  type WeeklyCutVelocitySample,
} from "./hiatus-velocity-forecast-engine";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export interface HiatusVelocityForecastCardProps {
  readonly forecast: ThreeWeekHiatusForecast;
  readonly samples: readonly WeeklyCutVelocitySample[];
  readonly surface: HiatusCoachingSurfaceState;
  readonly onChangeClockPreset: (clock: DeterministicLocalClock) => void;
  readonly onChangeContinuousWorkMinutes: (minutes: number) => void;
  readonly onAcknowledgeWristBreak: (cycleIndex: number) => void;
}

const WORK_MINUTE_PRESETS: readonly number[] = [35, 50, 100];

export function HiatusVelocityForecastCard({
  forecast,
  samples,
  surface,
  onChangeClockPreset,
  onChangeContinuousWorkMinutes,
  onAcknowledgeWristBreak,
}: HiatusVelocityForecastCardProps) {
  const bt = useBilingual("HiatusVelocityForecastCard");
  // 심야(00:00~06:00) 자동 접힘 구간에서 사용자가 원할 때만 수동으로 펼쳐 확인한다.
  const [manualExpandInNight, setManualExpandInNight] = useState(false);

  const isSilentlyCollapsed = surface.allCoachingSilentlyCollapsed && !manualExpandInNight;
  const { wristBreak, lateNightPolicy } = surface;
  const { metrics, outsourceRecommendation } = forecast;

  const stageLabel =
    forecast.stage === "imminent"
      ? bt("위험선 임박", "Danger Imminent")
      : forecast.stage === "early_warning_2_3w"
        ? bt("2~3주 전 조기 경보", "2-3w Early Signal")
        : forecast.stage === "watch"
          ? bt("완만 하락 관찰", "Pace Watch")
          : bt("속도 안정", "Pace Stable");

  return (
    <section
      className="hshield-card space-y-3"
      data-testid="hshield-velocity-forecast-section"
      data-presentation-mode={lateNightPolicy.presentationMode}
      aria-label={bt(
        "주간 컷 속도 이동평균 3주 전 휴재 예측 및 손목 휴식 코칭",
        "Weekly Velocity Moving-Average 3-Week Hiatus Forecast & Wrist Micro-Break",
      )}
    >
      {/* 상단: 제목 + 심야 무음·주간 시계 전환 컨트롤 */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <TrendingDown className="size-4 text-accent shrink-0" aria-hidden="true" />
            <h3 className="text-sm font-bold text-fg">
              {bt(
                "주간 컷 속도 이동평균(SMA/EMA) · 3주 전 조기 예측",
                "Weekly Velocity SMA/EMA · 3-Week Early Forecast",
              )}
            </h3>
            <span
              className="hshield-badge"
              data-tier={lateNightPolicy.isLateNightQuietWindow ? "accent" : forecast.tier}
              data-testid="hshield-forecast-stage-badge"
            >
              <span className="hshield-dot" aria-hidden="true" />
              {lateNightPolicy.isLateNightQuietWindow
                ? bt("심야 무음 접힘", "Silent Night Collapsed")
                : stageLabel}
            </span>
          </div>
          <p className="text-xs text-fg-2">
            {bt(lateNightPolicy.summaryKo, lateNightPolicy.summaryEn)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            className="hshield-btn"
            aria-pressed={!lateNightPolicy.isLateNightQuietWindow}
            data-testid="hshield-clock-day-btn"
            onClick={() => {
              setManualExpandInNight(false);
              onChangeClockPreset({ localHour: 15, localMinute: 0 });
            }}
          >
            <Sun className="size-4" aria-hidden="true" />
            {bt("15:00 주간", "15:00 Day")}
          </button>
          <button
            type="button"
            className="hshield-btn"
            aria-pressed={lateNightPolicy.isLateNightQuietWindow}
            data-testid="hshield-clock-night-btn"
            onClick={() => {
              setManualExpandInNight(false);
              onChangeClockPreset({ localHour: 2, localMinute: 30 });
            }}
          >
            <Moon className="size-4" aria-hidden="true" />
            {bt("02:30 심야 무음", "02:30 Night Quiet")}
          </button>
        </div>
      </div>

      {/* 50분 연속 작업 비차단 1줄 손목 휴식 마이크로 브레이크 배지 */}
      <div
        className="hshield-micro-break-line"
        data-testid="hshield-wrist-micro-break"
        data-visibility={wristBreak.visibilityState}
        data-non-blocking="true"
        role="status"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
          <Hand className="size-4 shrink-0 text-accent" aria-hidden="true" />
          <span className="truncate font-semibold text-fg">
            {bt(wristBreak.badgeLineKo, wristBreak.badgeLineEn)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {WORK_MINUTE_PRESETS.map((mins) => (
            <button
              key={mins}
              type="button"
              className="hshield-btn"
              aria-pressed={wristBreak.continuousWorkMinutes === mins}
              data-testid={`hshield-work-mins-${mins}`}
              onClick={() => onChangeContinuousWorkMinutes(mins)}
            >
              <Clock className="size-3.5" aria-hidden="true" />
              {bt(`${mins}분`, `${mins}m`)}
            </button>
          ))}
          {wristBreak.visibilityState === "inline_badge" ? (
            <button
              type="button"
              className="hshield-btn"
              data-variant="good"
              data-testid="hshield-wrist-break-ack-btn"
              onClick={() => onAcknowledgeWristBreak(wristBreak.completedWorkCycles)}
            >
              {bt("스트레칭 완료", "Rest Done")}
            </button>
          ) : null}
        </div>
      </div>

      {/* #075: 00:00~06:00 심야 구간 자동 무음·접힘 바 (팝업 없음) */}
      {isSilentlyCollapsed ? (
        <div
          className="hshield-silent-collapse"
          data-testid="hshield-late-night-collapsed-bar"
          data-suppressed="silent_collapsed"
        >
          <p className="text-xs text-fg-2">
            {bt(
              `심야 마감 집중 보호(${lateNightPolicy.formattedLocalTime}) · 3주 예측 코칭·외주 제안·휴식 배지가 무음·접힘 상태입니다.`,
              `Late-night focus guard (${lateNightPolicy.formattedLocalTime}) · Forecast coaching & break nudges are silently collapsed.`,
            )}
          </p>
          <button
            type="button"
            className="hshield-btn"
            aria-expanded="false"
            data-testid="hshield-night-expand-btn"
            onClick={() => setManualExpandInNight(true)}
          >
            <ChevronDown className="size-4" aria-hidden="true" />
            {bt("조용히 펼쳐 보기", "Peek Quietly")}
          </button>
        </div>
      ) : (
        <div className="space-y-3" data-testid="hshield-velocity-forecast-body">
          {lateNightPolicy.isLateNightQuietWindow ? (
            <div className="flex items-center justify-between gap-2 text-xs text-fg-2">
              <span>
                {bt("심야 무음 모드에서 수동 열람 중입니다.", "Manually peeking during late-night quiet mode.")}
              </span>
              <button
                type="button"
                className="hshield-btn"
                aria-expanded="true"
                onClick={() => setManualExpandInNight(false)}
              >
                <ChevronUp className="size-4" aria-hidden="true" />
                {bt("다시 접기", "Collapse")}
              </button>
            </div>
          ) : null}

          {/* 3주 전 예측 요약 + 외주 분리 역산 제안 */}
          <div
            className="hshield-alert space-y-1"
            data-tier={forecast.tier}
            data-testid="hshield-outsource-recommendation"
          >
            <p className="text-xs font-bold text-fg">
              {bt(forecast.headlineKo, forecast.headlineEn)}
            </p>
            <p className="text-xs text-fg-2 hshield-num">
              {bt(
                outsourceRecommendation.quietRecommendationKo,
                outsourceRecommendation.quietRecommendationEn,
              )}
            </p>
          </div>

          {/* SMA / EMA 실측 핵심 지표 4칸 */}
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="hshield-subcard space-y-1">
              <p className="text-xs font-semibold text-fg-2">
                {bt("주간 완성 속도 (SMA / EMA)", "Weekly Velocity (SMA / EMA)")}
              </p>
              <p className="text-sm font-black text-fg hshield-num" data-testid="hshield-sma-ema-cuts">
                {metrics.smaCutsPerWeek} / {metrics.emaCutsPerWeek}{" "}
                <span className="text-xs font-medium text-fg-2">{bt("컷/주", "cuts/wk")}</span>
              </p>
              <p className="text-xs text-fg-3 hshield-num">
                {bt(
                  `목표 ${forecast.targetWeeklyCuts}컷 · 주간 추세 ${metrics.weeklyDriftCuts > 0 ? "+" : ""}${metrics.weeklyDriftCuts}컷`,
                  `Target ${forecast.targetWeeklyCuts} · Drift ${metrics.weeklyDriftCuts > 0 ? "+" : ""}${metrics.weeklyDriftCuts}`,
                )}
              </p>
            </div>

            <div className="hshield-subcard space-y-1">
              <p className="text-xs font-semibold text-fg-2">
                {bt("실측 컷당 소요 시간 (EMA)", "Avg Minutes / Cut (EMA)")}
              </p>
              <p className="text-sm font-black text-fg hshield-num">
                {metrics.emaMinutesPerCut}{" "}
                <span className="text-xs font-medium text-fg-2">{bt("분/컷", "min/cut")}</span>
              </p>
              <p className="text-xs text-fg-3 hshield-num">
                {bt(
                  `SMA ${metrics.smaMinutesPerCut}분 · 변화 ${metrics.minutesPerCutTrendPct >= 0 ? "+" : ""}${metrics.minutesPerCutTrendPct}%`,
                  `SMA ${metrics.smaMinutesPerCut}m · Delta ${metrics.minutesPerCutTrendPct >= 0 ? "+" : ""}${metrics.minutesPerCutTrendPct}%`,
                )}
              </p>
            </div>

            <div className="hshield-subcard space-y-1">
              <p className="text-xs font-semibold text-fg-2">
                {bt("스트로크 누적 작업 (EMA)", "Stroke Hours / Wk (EMA)")}
              </p>
              <p className="text-sm font-black text-fg hshield-num">
                {metrics.emaStrokeHoursPerWeek}{" "}
                <span className="text-xs font-medium text-fg-2">{bt("시간/주", "h/wk")}</span>
              </p>
              <p className="text-xs text-fg-3 hshield-num">
                {bt(
                  `SMA ${metrics.smaStrokeHoursPerWeek}시간 · 최근 ${samples.length}주 실측`,
                  `SMA ${metrics.smaStrokeHoursPerWeek}h · ${samples.length}w local`,
                )}
              </p>
            </div>

            <div className="hshield-subcard space-y-1">
              <p className="text-xs font-semibold text-fg-2">
                {bt("외주 분리 회복 역산", "Outsource Recovery Calc")}
              </p>
              <p className="text-sm font-black text-fg hshield-num" data-testid="hshield-recovery-days">
                {outsourceRecommendation.shouldRecommend
                  ? bt(
                      `배경 ${outsourceRecommendation.recommendedBgOutsourceCuts}컷 → +${outsourceRecommendation.estimatedRecoveryDays}일`,
                      `${outsourceRecommendation.recommendedBgOutsourceCuts} bg → +${outsourceRecommendation.estimatedRecoveryDays}d`,
                    )
                  : bt("분리 불필요", "None needed")}
              </p>
              <p className="text-xs text-fg-3 hshield-num">
                {forecast.weeksUntilDangerLine !== null
                  ? bt(
                      `위험선(${forecast.dangerBufferWeeks}주)까지 약 ${forecast.weeksUntilDangerLine}주`,
                      `~${forecast.weeksUntilDangerLine}w to ${forecast.dangerBufferWeeks}w line`,
                    )
                  : bt("12주 내 위험선 미도달", "Safe beyond 12 weeks")}
              </p>
            </div>
          </div>

          {/* 최근 주간 실측 샘플 & 4주 비축 궤적 비교 */}
          <div className="grid gap-2 sm:grid-cols-4" data-testid="hshield-trajectory-strip">
            {forecast.trajectory.map((point) => (
              <div key={point.weekOffset} className="rounded-lg border border-line bg-canvas p-2 text-xs">
                <div className="flex items-center justify-between gap-1 font-bold text-fg hshield-num">
                  <span>{bt(`+${point.weekOffset}주 후`, `Week +${point.weekOffset}`)}</span>
                  <span>{point.projectedCuts}{bt("컷", "c")}</span>
                </div>
                <p className="mt-1 text-fg-2 hshield-num">
                  {bt(
                    `현 속도 비축 ${point.projectedBufferWeeks}주`,
                    `Current: ${point.projectedBufferWeeks}w`,
                  )}
                </p>
                {outsourceRecommendation.shouldRecommend ? (
                  <p className="text-good font-semibold hshield-num">
                    {bt(
                      `외주 분리 시 ${point.projectedBufferWithOutsourceWeeks}주`,
                      `With split: ${point.projectedBufferWithOutsourceWeeks}w`,
                    )}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
