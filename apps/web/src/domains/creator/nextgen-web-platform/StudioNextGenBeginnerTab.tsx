import {
  CheckCircle2,
  Download,
  Image,
  MessageSquare,
  Palette,
  PenTool,
  RotateCcw,
  SkipForward,
  Smartphone,
} from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  BEGINNER_ONBOARDING_STEPS,
  MOBILE_THUMB_DOCK_ACTIONS,
  type BeginnerOnboardingProgressSummary,
  type BeginnerOnboardingState,
  type BeginnerOnboardingStepId,
  type MobileDockActionId,
  type MobileDockHandedness,
  type MobileThumbDockLayout,
} from "./beginner-onboarding-mobile-dock";

const TONE_CLASSES = [
  "nextgen-chip--tone-1",
  "nextgen-chip--tone-2",
  "nextgen-chip--tone-3",
  "nextgen-chip--tone-4",
  "nextgen-chip--tone-5",
] as const;

const MOBILE_VIEWPORT_PRESETS = [
  { width: 320, labelKo: "320px 초소형", labelEn: "320px Compact" },
  { width: 390, labelKo: "390px 표준폰", labelEn: "390px Standard" },
  { width: 430, labelKo: "430px 대화면", labelEn: "430px Large" },
] as const;

function renderMobileDockIcon(actionId: MobileDockActionId) {
  switch (actionId) {
    case "draw":
      return <PenTool size={16} aria-hidden="true" />;
    case "background":
      return <Image size={16} aria-hidden="true" />;
    case "bubble":
      return <MessageSquare size={16} aria-hidden="true" />;
    case "palette":
      return <Palette size={16} aria-hidden="true" />;
    case "export":
      return <Download size={16} aria-hidden="true" />;
  }
}

export interface StudioNextGenBeginnerTabProps {
  readonly onboardingState: BeginnerOnboardingState;
  readonly onboardingSummary: BeginnerOnboardingProgressSummary;
  readonly spotlightHintOpen: boolean;
  readonly mobileViewportWidth: number;
  readonly mobileHandedness: MobileDockHandedness;
  readonly activeMobileAction: MobileDockActionId;
  readonly mobileDockLayout: MobileThumbDockLayout;
  readonly onSkip: () => void;
  readonly onRestart: () => void;
  readonly onJumpStep: (stepId: BeginnerOnboardingStepId) => void;
  readonly onToggleHint: () => void;
  readonly onPrevStep: () => void;
  readonly onCompleteStep: () => void;
  readonly onNextStep: () => void;
  readonly onChangeViewport: (width: number) => void;
  readonly onToggleHandedness: () => void;
  readonly onSelectMobileAction: (actionId: MobileDockActionId, stepId: BeginnerOnboardingStepId) => void;
}

export function StudioNextGenBeginnerTab({
  onboardingState,
  onboardingSummary,
  spotlightHintOpen,
  mobileViewportWidth,
  mobileHandedness,
  activeMobileAction,
  mobileDockLayout,
  onSkip,
  onRestart,
  onJumpStep,
  onToggleHint,
  onPrevStep,
  onCompleteStep,
  onNextStep,
  onChangeViewport,
  onToggleHandedness,
  onSelectMobileAction,
}: StudioNextGenBeginnerTabProps) {
  const bt = useBilingual("StudioNextGenBeginnerTab");

  return (
    <section
      id="nextgen-panel-beginner"
      role="tabpanel"
      aria-labelledby="nextgen-tab-beginner"
      data-testid="nextgen-panel-beginner"
      className="nextgen-hub__panel space-y-4"
    >
      {/* T-054: 60초 첫 1컷 인터랙티브 스포트라이트 온보딩 */}
      <div className="nextgen-hub__card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-black text-fg">
              {bt("60초 ‘첫 1컷 완성’ 인터랙티브 가이드", "60-Second ‘First Panel’ Guide")}
            </h4>
            <p className="mt-0.5 text-xs text-fg-2 tabular-nums">
              {onboardingSummary.isCompleted
                ? bt("축하해요! 5단계를 모두 마쳐 첫 1컷을 완성했어요.", "Awesome! You completed all 5 steps.")
                : onboardingSummary.isSkipped
                  ? bt("가이드를 잠시 건너뛰었어요. 언제든 다시 시작할 수 있어요.", "Guide paused. Restart anytime.")
                  : bt(
                      `진행률 ${onboardingSummary.percent}% · 남은 예상 시간 약 ${onboardingSummary.remainingSeconds}초`,
                      `Progress ${onboardingSummary.percent}% · ~${onboardingSummary.remainingSeconds}s left`,
                    )}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              data-testid="nextgen-onboarding-skip"
              onClick={onSkip}
              className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg-2 hover:text-fg"
            >
              <SkipForward size={13} aria-hidden="true" />
              {bt("건너뛰기", "Skip")}
            </button>
            <button
              type="button"
              data-testid="nextgen-onboarding-restart"
              onClick={onRestart}
              className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg-2 hover:text-fg"
            >
              <RotateCcw size={13} aria-hidden="true" />
              {bt("다시 보기", "Restart")}
            </button>
          </div>
        </div>

        <ol className="grid gap-2 sm:grid-cols-5">
          {BEGINNER_ONBOARDING_STEPS.map((step, index) => {
            const isCurrent = onboardingSummary.currentStep.id === step.id;
            const isDone = onboardingState.completedStepIds.includes(step.id);
            return (
              <li key={step.id}>
                <button
                  type="button"
                  data-testid={`nextgen-onboarding-step-${step.id}`}
                  aria-current={isCurrent ? "step" : undefined}
                  onClick={() => onJumpStep(step.id)}
                  className={cn(
                    "flex min-h-11 w-full flex-col items-start rounded-xl border p-2.5 text-left text-xs transition-colors",
                    isCurrent
                      ? cn("nextgen-spotlight-trigger border-accent", TONE_CLASSES[index % TONE_CLASSES.length])
                      : isDone
                        ? "border-good/40 bg-good/10 text-fg"
                        : "border-line bg-card text-fg-2 hover:border-line-strong",
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-1 font-extrabold text-fg">
                    <span>{bt(step.titleKo, step.titleEn)}</span>
                    <span className="text-[0.65rem] text-fg-3 tabular-nums">{step.badgeKo}</span>
                  </span>
                  <span className="mt-1 text-[0.68rem] text-fg-2">
                    {isDone ? bt("완료됨", "Done") : isCurrent ? bt("진행 중", "Current") : bt("대기", "Up next")}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="nextgen-spotlight-anchor-wrap">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={onToggleHint}
              className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg-2"
            >
              {spotlightHintOpen ? bt("단계 힌트 접기", "Hide step tip") : bt("단계 힌트 보기", "Show step tip")}
            </button>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onPrevStep}
                disabled={onboardingState.currentIndex === 0}
                className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg-2 disabled:opacity-45"
              >
                {bt("이전 단계", "Previous")}
              </button>
              <button
                type="button"
                data-testid="nextgen-onboarding-complete-step"
                onClick={onCompleteStep}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-extrabold text-on-accent"
              >
                <CheckCircle2 size={14} aria-hidden="true" />
                {bt("이 단계 완료하고 다음으로", "Complete step & next")}
              </button>
              <button
                type="button"
                onClick={onNextStep}
                disabled={onboardingState.currentIndex >= BEGINNER_ONBOARDING_STEPS.length - 1}
                className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg-2 disabled:opacity-45"
              >
                {bt("다음 보기", "Next")}
              </button>
            </div>
          </div>

          {spotlightHintOpen ? (
            <div
              data-testid="nextgen-spotlight-hint"
              data-anchor-mode="inline"
              className="nextgen-spotlight-popover mt-2.5 p-3 text-xs"
            >
              <p className="font-extrabold text-fg">
                {bt(onboardingSummary.currentStep.titleKo, onboardingSummary.currentStep.titleEn)}
              </p>
              <p className="mt-1 text-fg-2">
                {bt(
                  onboardingSummary.currentStep.actionHintKo,
                  onboardingSummary.currentStep.actionHintEn,
                )}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* T-057: 모바일 320~430px 엄지 영역 5대 액션 플로팅 독 */}
      <div className="nextgen-hub__card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="flex items-center gap-1.5 text-sm font-black text-fg">
              <Smartphone size={15} className="text-accent" aria-hidden="true" />
              {bt("모바일 한손 엄지 독 (320~430px 최적화)", "Mobile Thumb-Zone 5-Action Dock")}
            </h4>
            <p className="mt-0.5 text-xs text-fg-2 tabular-nums">
              {bt(
                `버튼 크기 ${mobileDockLayout.hitWidthPx}×${mobileDockLayout.hitHeightPx}px (44px 터치 기준 충족) · 하단 안전 여백 자동 반영`,
                `Touch target ${mobileDockLayout.hitWidthPx}×${mobileDockLayout.hitHeightPx}px (>= 44px) · Safe-area inset aware`,
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {MOBILE_VIEWPORT_PRESETS.map((preset) => (
              <button
                key={preset.width}
                type="button"
                aria-pressed={mobileViewportWidth === preset.width}
                onClick={() => onChangeViewport(preset.width)}
                className={cn(
                  "min-h-11 rounded-xl border px-2.5 text-xs font-bold tabular-nums",
                  mobileViewportWidth === preset.width
                    ? "border-accent bg-accent-soft text-fg"
                    : "border-line bg-card text-fg-2",
                )}
              >
                {bt(preset.labelKo, preset.labelEn)}
              </button>
            ))}
            <button
              type="button"
              onClick={onToggleHandedness}
              className="min-h-11 rounded-xl border border-line bg-card px-2.5 text-xs font-bold text-fg-2"
            >
              {mobileHandedness === "right"
                ? bt("오른손 엄지", "Right thumb")
                : bt("왼손 엄지", "Left thumb")}
            </button>
          </div>
        </div>

        <div
          data-testid="nextgen-mobile-dock-stage"
          data-handedness={mobileDockLayout.handedness}
          style={{ maxWidth: `${mobileDockLayout.viewportWidthPx}px` }}
          className="nextgen-mobile-dock-stage"
        >
          <div
            role="toolbar"
            aria-label={bt("모바일 5대 핵심 작업 독", "Mobile 5 core actions dock")}
            data-testid="nextgen-mobile-thumb-dock"
            className="nextgen-mobile-dock"
          >
            {MOBILE_THUMB_DOCK_ACTIONS.map((action) => (
              <button
                key={action.id}
                type="button"
                aria-pressed={activeMobileAction === action.id}
                data-testid={`nextgen-mobile-action-${action.id}`}
                onClick={() => onSelectMobileAction(action.id, action.stepId)}
                className="nextgen-mobile-dock__btn focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {renderMobileDockIcon(action.id)}
                <span>{bt(action.labelKo, action.labelEn)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
