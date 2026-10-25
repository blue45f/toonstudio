import { ArrowRight, Check } from "lucide-react";

import { cx } from "@/shared/lib/cx";

/**
 * 흐름 진행 표시 — 기획→연재 단계 레일.
 *
 * 전시용 타임라인이 아니라 이동 가능한 단계 표시다: href가 있는 단계는
 * 그 단계의 작업 화면으로 가는 링크가 되고, 현재 단계에는
 * `aria-current="step"`이 붙는다. 다음 행동(nextAction)은 호출자가
 * 첫 미완료 단계에서 도출해 넘긴다 — 이 컴포넌트는 상태를 판단하지 않고
 * 받은 단계·다음 행동만 그린다. 문자열은 호출자가 이중언어로 넘기므로
 * i18n 카탈로그를 새로 건드리지 않는다.
 *
 * 사용 예 (회차 룸):
 * ```tsx
 * <FlowProgress
 *   ariaLabel="회차 진행 단계"
 *   steps={steps}
 *   nextAction={nextStep ? { label: nextStep.label, href: nextStep.href } : null}
 *   nextPrefix="다음 행동"
 *   allDoneLabel="모든 단계가 끝났습니다"
 *   className="mt-4"
 * />
 * ```
 */

export type FlowProgressStepState = "done" | "active" | "todo";

export interface FlowProgressStep {
  /** 단계 이름 (호출자가 이중언어로 resolved한 문자열). */
  readonly label: string;
  readonly state: FlowProgressStepState;
  /** 그 단계의 작업 화면. 없으면 링크가 아닌 텍스트로 렌더된다. */
  readonly href?: string;
}

export interface FlowProgressNextAction {
  readonly label: string;
  readonly href: string;
}

export interface FlowProgressProps {
  /** 단계 목록의 접근성 이름 (예: "회차 진행 단계"). */
  readonly ariaLabel: string;
  readonly steps: readonly FlowProgressStep[];
  /**
   * 다음 행동. undefined면 다음 행동 행을 그리지 않고,
   * null이면 전 단계 완료 문구(allDoneLabel)를 그린다.
   */
  readonly nextAction?: FlowProgressNextAction | null;
  /** 다음 행동 앞에 붙는 접두어 (예: "다음 행동"). */
  readonly nextPrefix?: string;
  /** nextAction이 null이고 전 단계가 완료일 때 표시하는 문구. */
  readonly allDoneLabel?: string;
  readonly className?: string;
}

const STEP_BAR_CLASS: Readonly<Record<FlowProgressStepState, string>> = {
  done: "bg-good",
  active: "bg-accent",
  todo: "bg-line",
};

const STEP_LABEL_CLASS: Readonly<Record<FlowProgressStepState, string>> = {
  done: "text-good",
  active: "text-accent",
  todo: "text-fg-3",
};

export function FlowProgress({
  ariaLabel,
  steps,
  nextAction,
  nextPrefix,
  allDoneLabel,
  className,
}: FlowProgressProps) {
  const allDone = steps.length > 0 && steps.every((step) => step.state === "done");
  return (
    <div className={className}>
      <ol className="flex gap-2 overflow-x-auto pb-1" aria-label={ariaLabel}>
        {steps.map((step) => (
          <li
            key={step.label}
            className="min-w-28 flex-1"
            aria-current={step.state === "active" ? "step" : undefined}
          >
            <div className={cx("h-1.5 rounded-full", STEP_BAR_CLASS[step.state])} />
            {step.href ? (
              <a
                href={step.href}
                className={cx(
                  "mt-2 flex items-center gap-1 text-[0.6875rem] font-semibold hover:underline",
                  STEP_LABEL_CLASS[step.state],
                )}
              >
                {step.state === "done" ? <Check className="size-3" aria-hidden="true" /> : null}
                {step.label}
              </a>
            ) : (
              <p
                className={cx(
                  "mt-2 flex items-center gap-1 text-[0.6875rem] font-semibold",
                  STEP_LABEL_CLASS[step.state],
                )}
              >
                {step.state === "done" ? <Check className="size-3" aria-hidden="true" /> : null}
                {step.label}
              </p>
            )}
          </li>
        ))}
      </ol>
      {nextAction ? (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {nextPrefix ? <span className="font-black text-fg">{nextPrefix}</span> : null}
          <a
            href={nextAction.href}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-3 font-bold text-on-accent hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {nextAction.label}
            <ArrowRight className="size-4" aria-hidden="true" />
          </a>
        </p>
      ) : null}
      {nextAction === null && allDone && allDoneLabel ? (
        <p className="mt-3 text-xs font-semibold text-good">{allDoneLabel}</p>
      ) : null}
    </div>
  );
}
